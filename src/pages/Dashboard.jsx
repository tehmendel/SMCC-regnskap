import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt } from '../lib/format'
import { CardGrid } from '../components/CardGrid'
import { StatGrid, StatBox } from '../components/StatBox'

export default function Dashboard() {
  const [stats, setStats] = useState({ inntekter: 0, utgifter: 0, resultat: 0, antall: 0 })
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const year = new Date().getFullYear()

  useEffect(() => {
    async function load() {
      const [txRes, arrExpRes, arrRevRes] = await Promise.all([
        supabase.from('transactions')
          .select('amount, type, date, description, approved, categories(name)')
          .gte('date', `${year}-01-01`)
          .lte('date', `${year}-12-31`)
          .order('date', { ascending: false }),
        supabase.from('arrangement_expenses')
          .select('amount, arrangements(year)')
          .is('transaction_id', null)
          .eq('is_estimate', false),
        supabase.from('arrangement_revenues')
          .select('amount, arrangements(year)')
          .is('transaction_id', null),
      ])

      const data = txRes.data || []
      const arrExp = (arrExpRes.data || []).filter(e => e.arrangements?.year === year)
      const arrRev = (arrRevRes.data || []).filter(r => r.arrangements?.year === year)

      const txInntekter  = data.filter(t => t.type === 'inntekt').reduce((s, t) => s + Number(t.amount), 0)
      const txUtgifter   = data.filter(t => t.type === 'utgift').reduce((s, t)  => s + Number(t.amount), 0)
      const arrInntekter = arrRev.reduce((s, r) => s + Number(r.amount), 0)
      const arrUtgifter  = arrExp.reduce((s, e) => s + Number(e.amount), 0)
      const inntekter    = txInntekter + arrInntekter
      const utgifter     = txUtgifter  + arrUtgifter

      setStats({ inntekter, utgifter, resultat: inntekter - utgifter, antall: data.length })
      setRecent(data.slice(0, 8))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="text-muted">Laster…</div>

  const cards = [
    {
      id: 'stats',
      content: (
        <StatGrid>
          <StatBox label="Inntekter" value={fmt(stats.inntekter)} type="positive" />
          <StatBox label="Utgifter" value={fmt(stats.utgifter)} type="negative" />
          <StatBox label="Resultat" value={fmt(stats.resultat)} type={stats.resultat >= 0 ? 'positive' : 'negative'} />
          <StatBox label="Transaksjoner" value={stats.antall} />
        </StatGrid>
      ),
    },
    {
      id: 'recent',
      content: (
        <div className="card">
          <div className="card-title">Siste transaksjoner</div>
          {recent.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-text">Ingen transaksjoner registrert ennå</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dato</th>
                    <th>Beskrivelse</th>
                    <th>Kategori</th>
                    <th>Type</th>
                    <th className="text-right">Beløp</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((t, i) => (
                    <tr key={i}>
                      <td className="text-mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{t.date}</td>
                      <td>{t.description}</td>
                      <td style={{ color: 'var(--muted)' }}>{t.categories?.name ?? '—'}</td>
                      <td><span className={`badge badge-${t.type}`}>{t.type}</span></td>
                      <td className="text-right">
                        <span className={t.type === 'inntekt' ? 'amount-positive' : 'amount-negative'}>
                          {t.type === 'utgift' ? '−' : '+'}{fmt(t.amount)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${t.approved ? 'badge-approved' : 'badge-pending'}`}>
                          {t.approved ? 'Godkjent' : 'Venter'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Oversikt</div>
          <div className="page-sub">Regnskapsår {year}</div>
        </div>
      </div>
      <CardGrid pageKey="dashboard" cards={cards} />
    </div>
  )
}
