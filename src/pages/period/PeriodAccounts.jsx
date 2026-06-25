import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { fmt, MONTHS, MONTH_NAMES } from '../../lib/format'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

const PERIODS = [
  { label: 'Måned', value: 'month' },
  { label: 'Kvartal', value: 'quarter' },
  { label: 'Halvår', value: 'half' },
  { label: 'År', value: 'year' },
]

export default function PeriodAccounts() {
  const [period, setPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [transactions, setTransactions] = useState([])
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [txRes, budRes] = await Promise.all([
        supabase.from('transactions').select('*, categories(name,type)').gte('date', '2022-01-01'),
        supabase.from('budgets_v2').select('*, categories(name,type)').eq('year', selectedYear),
      ])
      setTransactions(txRes.data || [])
      setBudgets(budRes.data || [])
      setLoading(false)
    }
    load()
  }, [selectedYear])

  function getPeriodRange() {
    if (period === 'month') {
      return { from: `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-01`, label: `${MONTH_NAMES[selectedMonth-1]} ${selectedYear}` }
    }
    if (period === 'quarter') {
      const q = Math.ceil(selectedMonth / 3)
      const fromMonth = (q - 1) * 3 + 1
      return { from: `${selectedYear}-${String(fromMonth).padStart(2,'0')}-01`, toMonth: fromMonth + 2, label: `Q${q} ${selectedYear}` }
    }
    if (period === 'half') {
      const h = selectedMonth <= 6 ? 1 : 2
      return { from: `${selectedYear}-${h === 1 ? '01' : '07'}-01`, toMonth: h === 1 ? 6 : 12, label: `H${h} ${selectedYear}` }
    }
    return { from: `${selectedYear}-01-01`, toMonth: 12, label: `${selectedYear}` }
  }

  const range = getPeriodRange()

  function inRange(dateStr) {
    const d = new Date(dateStr)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    if (year !== selectedYear) return false
    if (period === 'month') return month === selectedMonth
    if (period === 'quarter') { const q = Math.ceil(selectedMonth/3); const qm = (q-1)*3+1; return month >= qm && month <= qm+2 }
    if (period === 'half') { return selectedMonth <= 6 ? month <= 6 : month >= 7 }
    return true
  }

  const filtered = transactions.filter(t => inRange(t.date))
  const prevFiltered = transactions.filter(t => {
    const d = new Date(t.date)
    return d.getFullYear() === selectedYear - 1 && inRange(t.date.replace(String(selectedYear), String(selectedYear - 1)))
  })

  const inntekter = filtered.filter(t => t.type === 'inntekt').reduce((s,t) => s + Number(t.amount), 0)
  const utgifter  = filtered.filter(t => t.type === 'utgift').reduce((s,t) => s + Number(t.amount), 0)
  const resultat  = inntekter - utgifter
  const prevInntekter = prevFiltered.filter(t => t.type === 'inntekt').reduce((s,t) => s + Number(t.amount), 0)
  const prevUtgifter  = prevFiltered.filter(t => t.type === 'utgift').reduce((s,t) => s + Number(t.amount), 0)

  // Per kategori
  const byCategory = filtered.reduce((acc, t) => {
    const name = t.categories?.name || 'Ukategorisert'
    const type = t.type
    if (!acc[name]) acc[name] = { name, type, amount: 0 }
    acc[name].amount += Number(t.amount)
    return acc
  }, {})

  // Akkumulert per måned i år
  let accumulated = 0
  const accData = MONTHS.map((m, i) => {
    const monthTx = transactions.filter(t => {
      const d = new Date(t.date)
      return d.getFullYear() === selectedYear && d.getMonth() === i
    })
    const net = monthTx.filter(t => t.type === 'inntekt').reduce((s,t) => s+Number(t.amount), 0)
             - monthTx.filter(t => t.type === 'utgift').reduce((s,t) => s+Number(t.amount), 0)
    accumulated += net
    return { name: m, akkumulert: accumulated }
  })

  // Månedlig inntekter/utgifter for hele året
  const monthlyData = MONTHS.map((m, i) => {
    const monthTx = transactions.filter(t => {
      const d = new Date(t.date)
      return d.getFullYear() === selectedYear && d.getMonth() === i
    })
    return {
      name: m,
      inntekter: monthTx.filter(t => t.type === 'inntekt').reduce((s,t) => s+Number(t.amount), 0),
      utgifter: monthTx.filter(t => t.type === 'utgift').reduce((s,t) => s+Number(t.amount), 0),
    }
  })

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Perioderegnskap</div>
          <div className="page-sub">{range.label}</div>
        </div>
        <div className="flex gap-8">
          {[2024, 2025, 2026].map(y => (
            <button key={y} className={`btn btn-sm ${selectedYear === y ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedYear(y)}>{y}</button>
          ))}
        </div>
      </div>

      {/* Periode-velger */}
      <div className="flex gap-8" style={{ marginBottom: 16 }}>
        {PERIODS.map(p => (
          <button key={p.value} className={`btn btn-sm ${period === p.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPeriod(p.value)}>{p.label}</button>
        ))}
      </div>
      {period === 'month' && (
        <div className="flex gap-8" style={{ marginBottom: 20 }}>
          {MONTHS.map((m, i) => (
            <button key={i} className={`btn btn-sm ${selectedMonth === i+1 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedMonth(i+1)}>{m}</button>
          ))}
        </div>
      )}

      {/* KPI-er */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-box">
          <div className="stat-label">Inntekter</div>
          <div className="stat-value positive">{fmt(inntekter)}</div>
          {prevInntekter > 0 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Fjorår: {fmt(prevInntekter)}
          </div>}
        </div>
        <div className="stat-box">
          <div className="stat-label">Utgifter</div>
          <div className="stat-value negative">{fmt(utgifter)}</div>
          {prevUtgifter > 0 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Fjorår: {fmt(prevUtgifter)}
          </div>}
        </div>
        <div className="stat-box">
          <div className="stat-label">Resultat</div>
          <div className={`stat-value ${resultat >= 0 ? 'positive' : 'negative'}`}>{fmt(resultat)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Antall transaksjoner</div>
          <div className="stat-value">{filtered.length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Månedlig */}
        <div className="card">
          <div className="card-title">Månedlig inn/ut – {selectedYear}</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--dim)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--dim)', fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--steel)', border: '1px solid var(--border)', borderRadius: 4 }} />
              <Bar dataKey="inntekter" fill="var(--green)" radius={[2,2,0,0]} />
              <Bar dataKey="utgifter" fill="var(--orange)" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Akkumulert */}
        <div className="card">
          <div className="card-title">Akkumulert resultat – {selectedYear}</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={accData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--dim)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--dim)', fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--steel)', border: '1px solid var(--border)', borderRadius: 4 }} />
              <Line type="monotone" dataKey="akkumulert" stroke="var(--orange)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Transaksjoner for perioden */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-title">Inntekter – {range.label}</div>
          {Object.values(byCategory).filter(c => c.type === 'inntekt').sort((a,b) => b.amount - a.amount).map(c => (
            <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13 }}>{c.name}</span>
              <span className="amount-positive">{fmt(c.amount)}</span>
            </div>
          ))}
          {Object.values(byCategory).filter(c => c.type === 'inntekt').length === 0 && (
            <div className="empty-state" style={{ padding: '24px 0' }}><div className="empty-state-text">Ingen inntekter i perioden</div></div>
          )}
        </div>
        <div className="card">
          <div className="card-title">Utgifter – {range.label}</div>
          {Object.values(byCategory).filter(c => c.type === 'utgift').sort((a,b) => b.amount - a.amount).map(c => (
            <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13 }}>{c.name}</span>
              <span className="amount-negative">{fmt(c.amount)}</span>
            </div>
          ))}
          {Object.values(byCategory).filter(c => c.type === 'utgift').length === 0 && (
            <div className="empty-state" style={{ padding: '24px 0' }}><div className="empty-state-text">Ingen utgifter i perioden</div></div>
          )}
        </div>
      </div>
    </div>
  )
}
