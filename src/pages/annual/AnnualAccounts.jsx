import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { fmt, fmtNum, MONTHS, getYearRange } from '../../lib/format'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'
import { CardGrid } from '../../components/CardGrid'
import { StatGrid, StatBox } from '../../components/StatBox'
import { TOOLTIP_STYLE, GRID_PROPS, AXIS_TICK, LEGEND_STYLE } from '../../lib/chartConfig'

const YEARS = getYearRange(4, 1)
const COLORS = ['#6B7280','#3B82F6','#A855F7','#E85D26','#22C55E']

export default function AnnualAccounts() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [balances, setBalances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [members, setMembers] = useState([])
  const [arrExpenses, setArrExpenses] = useState([])
  const [arrRevenues, setArrRevenues] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [balRes, txRes, membRes, arrExpRes, arrRevRes] = await Promise.all([
        supabase.from('account_balances').select('*, bank_accounts(name, sort_order)').order('year').order('month'),
        supabase.from('transactions').select('*, categories(name, type)').gte('date', '2021-01-01'),
        supabase.from('member_counts').select('*').order('year'),
        // Only unlinked arrangement entries (linked ones already appear in transactions)
        supabase.from('arrangement_expenses')
          .select('amount, is_estimate, expense_date, arrangements(year, name)')
          .is('transaction_id', null)
          .eq('is_estimate', false),
        supabase.from('arrangement_revenues')
          .select('amount, revenue_date, arrangements(year, name)')
          .is('transaction_id', null),
      ])
      setBalances(balRes.data || [])
      setTransactions(txRes.data || [])
      setMembers(membRes.data || [])
      setArrExpenses(arrExpRes.data || [])
      setArrRevenues(arrRevRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="text-muted">Laster…</div>

  // Arrangement-poster for valgt år (bruker arrangementets år, ikke transaksjonsdato)
  const yearArrExp = arrExpenses.filter(e => e.arrangements?.year === selectedYear)
  const yearArrRev = arrRevenues.filter(r => r.arrangements?.year === selectedYear)

  // Filtrer banktransaksjoner for valgt år
  const yearTx = transactions.filter(t => new Date(t.date).getFullYear() === selectedYear)

  // Totaler inkludert arrangement
  const txInntekter = yearTx.filter(t => t.type === 'inntekt').reduce((s, t) => s + Number(t.amount), 0)
  const txUtgifter  = yearTx.filter(t => t.type === 'utgift').reduce((s, t) => s + Number(t.amount), 0)
  const arrInntekter = yearArrRev.reduce((s, r) => s + Number(r.amount), 0)
  const arrUtgifter  = yearArrExp.reduce((s, e) => s + Number(e.amount), 0)
  const inntekter = txInntekter + arrInntekter
  const utgifter  = txUtgifter + arrUtgifter
  const resultat  = inntekter - utgifter

  // Kontosaldoer for valgt år
  const yearBalances = balances.filter(b => b.year === selectedYear)
  const accounts = [...new Set(yearBalances.map(b => b.bank_accounts?.name))].filter(Boolean)

  // Månedlig utvikling for valgt år
  const monthlyData = MONTHS.map((month, i) => {
    const monthNum = i + 1
    const monthTx = yearTx.filter(t => new Date(t.date).getMonth() + 1 === monthNum)
    const monthArrExp = yearArrExp.filter(e => e.expense_date && new Date(e.expense_date).getMonth() + 1 === monthNum)
    const monthArrRev = yearArrRev.filter(r => r.revenue_date && new Date(r.revenue_date).getMonth() + 1 === monthNum)
    return {
      name: month,
      inntekter: monthTx.filter(t => t.type === 'inntekt').reduce((s, t) => s + Number(t.amount), 0)
               + monthArrRev.reduce((s, r) => s + Number(r.amount), 0),
      utgifter: monthTx.filter(t => t.type === 'utgift').reduce((s, t) => s + Number(t.amount), 0)
              + monthArrExp.reduce((s, e) => s + Number(e.amount), 0),
    }
  })

  // Historisk sammenligning
  const historicalData = YEARS.map(year => {
    const dec = balances.filter(b => b.year === year && b.month === 12)
    const total = dec.reduce((s, b) => s + Number(b.balance), 0)
    const yearIncome = transactions.filter(t => new Date(t.date).getFullYear() === year && t.type === 'inntekt').reduce((s,t) => s + Number(t.amount), 0)
      + arrRevenues.filter(r => r.arrangements?.year === year).reduce((s,r) => s + Number(r.amount), 0)
    const yearCost = transactions.filter(t => new Date(t.date).getFullYear() === year && t.type === 'utgift').reduce((s,t) => s + Number(t.amount), 0)
      + arrExpenses.filter(e => e.arrangements?.year === year).reduce((s,e) => s + Number(e.amount), 0)
    const memberCount = members.find(m => m.year === year)?.count || 0
    return { year: String(year), total, inntekter: yearIncome, utgifter: yearCost, resultat: yearIncome - yearCost, medlemmer: memberCount }
  })

  // Inntektskategorier (banktransaksjoner + arrangement per arrangement-navn)
  const inntektKat = yearTx.filter(t => t.type === 'inntekt').reduce((acc, t) => {
    const name = t.categories?.name || 'Ukategorisert'
    acc[name] = (acc[name] || 0) + Number(t.amount)
    return acc
  }, {})
  for (const r of yearArrRev) {
    const name = r.arrangements?.name ? `${r.arrangements.name} (arr.)` : 'Arrangement'
    inntektKat[name] = (inntektKat[name] || 0) + Number(r.amount)
  }

  // Utgiftskategorier (banktransaksjoner + arrangement per arrangement-navn)
  const utgiftKat = yearTx.filter(t => t.type === 'utgift').reduce((acc, t) => {
    const name = t.categories?.name || 'Ukategorisert'
    acc[name] = (acc[name] || 0) + Number(t.amount)
    return acc
  }, {})
  for (const e of yearArrExp) {
    const name = e.arrangements?.name ? `${e.arrangements.name} (arr.)` : 'Arrangement'
    utgiftKat[name] = (utgiftKat[name] || 0) + Number(e.amount)
  }

  // Sluttsaldo for valgt år
  const endBalances = yearBalances.filter(b => b.month === 12)
  const totalEndBalance = endBalances.reduce((s, b) => s + Number(b.balance), 0)
  const startBalances = balances.filter(b => b.year === selectedYear && b.month === 0)
  const totalStartBalance = startBalances.reduce((s, b) => s + Number(b.balance), 0)

  const currentMembers = members.find(m => m.year === selectedYear)?.count || 0

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Årsregnskap</div>
          <div className="page-sub">Resultat, balanse og historikk</div>
        </div>
        <div className="flex gap-8">
          {YEARS.map(y => (
            <button key={y} className={`btn btn-sm ${selectedYear === y ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedYear(y)}>{y}</button>
          ))}
        </div>
      </div>

      <CardGrid pageKey="aarsregnskap" cards={[
        {
          id: 'stats',
          content: (
            <StatGrid>
              <StatBox label={`Inntekter ${selectedYear}`} value={fmt(inntekter)} type="positive"
                sub={arrInntekter > 0 ? `herav arr. ${fmt(arrInntekter)}` : null} />
              <StatBox label={`Utgifter ${selectedYear}`} value={fmt(utgifter)} type="negative"
                sub={arrUtgifter > 0 ? `herav arr. ${fmt(arrUtgifter)}` : null} />
              <StatBox label="Årsresultat" value={fmt(resultat)} type={resultat >= 0 ? 'positive' : 'negative'} />
              <StatBox label="Total beholdning 31.12" value={fmt(totalEndBalance)} />
              <StatBox label="Utvikling beholdning"
                value={fmt(totalEndBalance - totalStartBalance)}
                type={totalEndBalance - totalStartBalance >= 0 ? 'positive' : 'negative'} />
              {currentMembers > 0 && (
                <StatBox label="Kostnad per medlem" value={fmt(utgifter / currentMembers)} />
              )}
            </StatGrid>
          ),
        },
        {
          id: 'maanedlig',
          content: (
            <div className="card">
              <div className="card-title">Månedlig utvikling {selectedYear}</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyData}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="name" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => fmt(v)} contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <Bar dataKey="inntekter" fill="var(--green)" radius={[3,3,0,0]} />
                  <Bar dataKey="utgifter" fill="var(--orange)" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ),
        },
        {
          id: 'balanse',
          content: (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div className="card">
                <div className="card-title">Beholdning per konto</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Konto</th><th className="text-right">Inngående</th><th className="text-right">Utgående</th><th className="text-right">Endring</th></tr></thead>
                    <tbody>
                      {accounts.map(acc => {
                        const start = startBalances.find(b => b.bank_accounts?.name === acc)?.balance || 0
                        const end = endBalances.find(b => b.bank_accounts?.name === acc)?.balance || 0
                        return (
                          <tr key={acc}>
                            <td>{acc}</td>
                            <td className="text-right text-mono" style={{ fontSize: 12 }}>{fmt(start)}</td>
                            <td className="text-right text-mono" style={{ fontSize: 12 }}>{fmt(end)}</td>
                            <td className="text-right text-mono" style={{ fontSize: 12, color: end - start >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {end - start >= 0 ? '+' : ''}{fmt(end - start)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={{ paddingTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>TOTAL</td>
                        <td className="text-right text-mono" style={{ paddingTop: 10, fontWeight: 600 }}>{fmt(totalStartBalance)}</td>
                        <td className="text-right text-mono" style={{ paddingTop: 10, fontWeight: 600 }}>{fmt(totalEndBalance)}</td>
                        <td className="text-right text-mono" style={{ paddingTop: 10, fontWeight: 600, color: totalEndBalance - totalStartBalance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {totalEndBalance - totalStartBalance >= 0 ? '+' : ''}{fmt(totalEndBalance - totalStartBalance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <div className="card">
                <div className="card-title">Inntekter per kategori</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Kategori</th><th className="text-right">Beløp</th><th className="text-right">Andel</th></tr></thead>
                    <tbody>
                      {Object.entries(inntektKat).sort((a,b) => b[1]-a[1]).map(([name, amount]) => (
                        <tr key={name}>
                          <td style={{ color: name.endsWith('(arr.)') ? 'var(--yellow)' : undefined }}>{name}</td>
                          <td className="text-right amount-positive">{fmt(amount)}</td>
                          <td className="text-right text-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {inntekter > 0 ? `${((amount/inntekter)*100).toFixed(1)} %` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ),
        },
        {
          id: 'utgiftkat',
          content: (
            <div className="card">
              <div className="card-title">Utgifter per kategori</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Kategori</th><th className="text-right">Beløp</th><th className="text-right">Andel</th></tr></thead>
                  <tbody>
                    {Object.entries(utgiftKat).sort((a,b) => b[1]-a[1]).map(([name, amount]) => (
                      <tr key={name}>
                        <td style={{ color: name.endsWith('(arr.)') ? 'var(--yellow)' : undefined }}>{name}</td>
                        <td className="text-right amount-negative">{fmt(amount)}</td>
                        <td className="text-right text-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {utgifter > 0 ? `${((amount/utgifter)*100).toFixed(1)} %` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: 'historisk',
          content: (
            <div className="card">
              <div className="card-title">Historisk utvikling – 5 år</div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={historicalData}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="year" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => fmt(v)} contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <Line type="monotone" dataKey="inntekter" stroke="var(--green)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="utgifter" stroke="var(--orange)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="total" stroke="var(--yellow)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} name="Total beholdning" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ),
        },
        {
          id: 'arstabell',
          content: (
            <div className="card">
              <div className="card-title">Sammenligning per år</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>År</th>
                      <th className="text-right">Inntekter</th>
                      <th className="text-right">Utgifter</th>
                      <th className="text-right">Resultat</th>
                      <th className="text-right">Total beholdning</th>
                      <th className="text-right">Medlemmer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalData.filter(d => d.inntekter > 0 || d.total > 0).map(d => (
                      <tr key={d.year} style={{ background: String(selectedYear) === d.year ? 'rgba(232,93,38,0.05)' : undefined }}>
                        <td className="text-mono" style={{ fontWeight: String(selectedYear) === d.year ? 600 : 400, color: String(selectedYear) === d.year ? 'var(--orange)' : 'var(--white)' }}>{d.year}</td>
                        <td className="text-right amount-positive">{d.inntekter > 0 ? fmt(d.inntekter) : '—'}</td>
                        <td className="text-right amount-negative">{d.utgifter > 0 ? fmt(d.utgifter) : '—'}</td>
                        <td className="text-right text-mono" style={{ color: d.resultat >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {d.inntekter > 0 ? fmt(d.resultat) : '—'}
                        </td>
                        <td className="text-right text-mono">{d.total > 0 ? fmt(d.total) : '—'}</td>
                        <td className="text-right text-mono">{d.medlemmer || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
      ]} />
    </div>
  )
}
