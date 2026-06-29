import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { fmt, MONTHS, getYearRange } from '../lib/format'
import { CardGrid } from '../components/CardGrid'
import { StatGrid, StatBox } from '../components/StatBox'
import { TOOLTIP_STYLE, GRID_PROPS, AXIS_TICK, LEGEND_STYLE } from '../lib/chartConfig'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = getYearRange(2, 1)

const STATUS_META = {
  CAPTURED:   { label: 'Belastet',       color: '#27ae60' },
  AUTHORIZED: { label: 'Reservert',      color: '#f39c12' },
  REFUNDED:   { label: 'Refundert',      color: '#e74c3c' },
  ABORTED:    { label: 'Avbrutt av kunde', color: '#7f8c8d' },
  EXPIRED:    { label: 'Utløpt',         color: '#7f8c8d' },
  TERMINATED: { label: 'Avsluttet',      color: '#7f8c8d' },
  CREATED:    { label: 'Ikke fullført',  color: '#566573' },
}

function statusLabel(s) { return STATUS_META[s]?.label ?? s }
function statusColor(s) { return STATUS_META[s]?.color ?? 'var(--muted)' }

export default function VippsStats() {
  const [env, setEnv]               = useState(null)
  const [activeEnv, setActiveEnv]   = useState('test')
  const [year, setYear]             = useState(CURRENT_YEAR)
  const [selectedMsn, setSelectedMsn] = useState('all')
  const [transactions, setTransactions] = useState([])
  const [msns, setMsns]             = useState([])
  const [lastSync, setLastSync]     = useState(null)
  const [loading, setLoading]       = useState(true)

  // Resolve active env on mount
  useEffect(() => {
    supabase.from('vipps_config').select('environment').eq('is_active', true).single()
      .then(({ data }) => {
        const e = data?.environment ?? 'test'
        setActiveEnv(e)
        setEnv(e)
      })
  }, [])

  useEffect(() => {
    if (!env) return
    load()
  }, [env, year])

  async function load() {
    setLoading(true)
    const from = `${year}-01-01`
    const to   = `${year}-12-31T23:59:59`

    const [txRes, msnRes, syncRes] = await Promise.all([
      supabase.from('vipps_transactions')
        .select('*')
        .eq('environment', env)
        .gte('created_at_vipps', from)
        .lte('created_at_vipps', to)
        .order('created_at_vipps', { ascending: false }),
      supabase.from('vipps_msn')
        .select('*')
        .eq('environment', env)
        .order('sort_order'),
      supabase.from('vipps_sync_log')
        .select('completed_at, status, transactions_upserted')
        .eq('environment', env)
        .eq('status', 'success')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    setTransactions(txRes.data || [])
    setMsns(msnRes.data || [])
    setLastSync(syncRes.data || null)
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (selectedMsn === 'all') return transactions
    return transactions.filter(t => t.msn === selectedMsn)
  }, [transactions, selectedMsn])

  const captured    = useMemo(() => filtered.filter(t => t.status === 'CAPTURED'),    [filtered])
  const authorized  = useMemo(() => filtered.filter(t => t.status === 'AUTHORIZED'),  [filtered])
  const refunded    = useMemo(() => filtered.filter(t => t.status === 'REFUNDED'),    [filtered])

  const totalCaptured   = captured.reduce((s, t)   => s + (t.amount_ore ?? 0), 0) / 100
  const totalAuthorized = authorized.reduce((s, t) => s + (t.amount_ore ?? 0), 0) / 100
  const totalRefunded   = refunded.reduce((s, t)   => s + (t.amount_ore ?? 0), 0) / 100
  const netto           = totalCaptured - totalRefunded

  const monthlyData = useMemo(() => MONTHS.map((name, i) => {
    const m = i + 1
    const inMonth = t => {
      if (!t.created_at_vipps) return false
      const d = new Date(t.created_at_vipps)
      return d.getMonth() + 1 === m
    }
    return {
      name,
      innbetalt: captured.filter(inMonth).reduce((s, t) => s + (t.amount_ore ?? 0), 0) / 100,
      refundert: refunded.filter(inMonth).reduce((s, t) => s + (t.amount_ore ?? 0), 0) / 100,
    }
  }), [captured, refunded])

  const byMsn = useMemo(() => {
    const msnMap = {}
    for (const t of captured) {
      if (!msnMap[t.msn]) {
        const info = msns.find(m => m.msn === t.msn)
        msnMap[t.msn] = { msn: t.msn, label: info?.label || t.msn, total: 0, count: 0 }
      }
      msnMap[t.msn].total += (t.amount_ore ?? 0) / 100
      msnMap[t.msn].count += 1
    }
    return Object.values(msnMap).sort((a, b) => b.total - a.total)
  }, [captured, msns])

  const statusDist = useMemo(() => {
    const map = {}
    for (const t of filtered) {
      map[t.status] = (map[t.status] || 0) + 1
    }
    return Object.entries(map)
      .map(([status, count]) => ({ status, count, label: statusLabel(status), color: statusColor(status) }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  const msnName = msn => msns.find(m => m.msn === msn)?.label || msn

  if (!env) return <div className="text-muted">Laster…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="page-title">Vipps-statistikk</div>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              background: env === 'prod' ? 'var(--green)' : 'var(--yellow)',
              color: env === 'prod' ? '#fff' : '#000',
              borderRadius: 6, padding: '2px 7px',
            }}>{env === 'prod' ? 'PROD' : 'TEST'}</span>
          </div>
          <div className="page-sub">
            {loading ? 'Laster…' : `${filtered.length} transaksjoner`}
            {lastSync && (
              <span style={{ marginLeft: 8, color: 'var(--muted)' }}>
                · Sist synkronisert {new Date(lastSync.completed_at).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-8">
          <button
            className={`btn btn-sm ${env === 'test' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setEnv('test')}>
            Test
            {activeEnv === 'test' && <span style={{ marginLeft: 5, fontSize: 9, background: 'var(--yellow)', color: '#000', borderRadius: 4, padding: '1px 4px' }}>AKTIV</span>}
          </button>
          <button
            className={`btn btn-sm ${env === 'prod' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setEnv('prod')}>
            Prod
            {activeEnv === 'prod' && <span style={{ marginLeft: 5, fontSize: 9, background: 'var(--green)', color: '#fff', borderRadius: 4, padding: '1px 4px' }}>AKTIV</span>}
          </button>
          <select className="form-select" value={year} onChange={e => setYear(Number(e.target.value))}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="form-select" value={selectedMsn} onChange={e => setSelectedMsn(e.target.value)}>
            <option value="all">Alle betalingssteder</option>
            {msns.map(m => <option key={m.msn} value={m.msn}>{m.label || m.msn} ({m.msn})</option>)}
          </select>
        </div>
      </div>

      {transactions.length === 0 && !loading ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">⊡</div>
            <div className="empty-state-text">
              Ingen Vipps-data for {env} / {year}.<br />
              Gå til <strong>Admin → Vipps-konfig → Datasynk</strong> og trykk «Oppdater nå» for å hente transaksjoner.
            </div>
          </div>
        </div>
      ) : (
        <CardGrid pageKey="vipps-stats" cards={[
          {
            id: 'kpi',
            content: (
              <div className="card">
                <div className="card-title">Nøkkeltall {year}</div>
                <StatGrid>
                  <StatBox label="Belastet (netto)" value={fmt(netto)} type={netto >= 0 ? 'positive' : 'negative'} />
                  <StatBox label="Total innbetalt" value={fmt(totalCaptured)} type="positive" sub={`${captured.length} transaksjoner`} />
                  <StatBox label="Refundert" value={fmt(totalRefunded)} type={totalRefunded > 0 ? 'negative' : undefined} sub={`${refunded.length} refusjoner`} />
                  <StatBox label="Reservert (ikke belastet)" value={fmt(totalAuthorized)} sub={`${authorized.length} transaksjoner`} />
                  <StatBox label="Snitttransaksjon" value={captured.length > 0 ? fmt(totalCaptured / captured.length) : '—'} />
                  <StatBox label="Refusjonsrate" value={totalCaptured > 0 ? `${((totalRefunded / totalCaptured) * 100).toFixed(1)} %` : '—'} />
                </StatGrid>
              </div>
            ),
          },
          {
            id: 'tidsserie',
            content: (
              <div className="card">
                <div className="card-title">Månedlig omsetning {year}</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="name" tick={AXIS_TICK} />
                    <YAxis tick={AXIS_TICK} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v, name) => [fmt(v), name === 'innbetalt' ? 'Innbetalt' : 'Refundert']}
                    />
                    <Legend wrapperStyle={LEGEND_STYLE} formatter={n => n === 'innbetalt' ? 'Innbetalt' : 'Refundert'} />
                    <Bar dataKey="innbetalt" fill="#27ae60" radius={[3,3,0,0]} />
                    <Bar dataKey="refundert"  fill="#e74c3c" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ),
          },
          ...(byMsn.length > 1 ? [{
            id: 'msn-fordeling',
            content: (
              <div className="card">
                <div className="card-title">Per betalingssted</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Betalingssted</th>
                        <th>MSN</th>
                        <th style={{ textAlign: 'right' }}>Antall</th>
                        <th style={{ textAlign: 'right' }}>Innbetalt</th>
                        <th style={{ width: 180 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {byMsn.map(m => {
                        const pct = totalCaptured > 0 ? (m.total / totalCaptured) * 100 : 0
                        return (
                          <tr key={m.msn}>
                            <td style={{ fontWeight: 500 }}>{m.label}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{m.msn}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{m.count}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{fmt(m.total)}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 6, background: 'var(--graphite)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)', borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 36, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ),
          }] : []),
          {
            id: 'status',
            content: (
              <div className="card">
                <div className="card-title">Statusfordeling</div>
                {statusDist.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>Ingen data</div>
                ) : (
                  <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      {statusDist.map(s => (
                        <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 13 }}>{s.label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{s.count}</div>
                          <div style={{ width: 120, height: 6, background: 'var(--graphite)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${(s.count / filtered.length) * 100}%`, height: '100%', background: s.color, borderRadius: 3 }} />
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', minWidth: 36, textAlign: 'right' }}>
                            {((s.count / filtered.length) * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>
                    <ResponsiveContainer width={200} height={200}>
                      <PieChart>
                        <Pie data={statusDist} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                          {statusDist.map(s => <Cell key={s.status} fill={s.color} />)}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ),
          },
          {
            id: 'transaksjoner',
            content: (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div className="card-title" style={{ margin: 0 }}>Siste transaksjoner</div>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} totalt</span>
                </div>
                {filtered.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Ingen transaksjoner</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Dato</th>
                          <th>Betalingssted</th>
                          <th>Beskrivelse</th>
                          <th>Referanse</th>
                          <th style={{ textAlign: 'center' }}>Status</th>
                          <th style={{ textAlign: 'right' }}>Beløp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 100).map(t => (
                          <tr key={t.id}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                              {t.created_at_vipps ? new Date(t.created_at_vipps).toLocaleDateString('nb-NO') : '—'}
                            </td>
                            <td style={{ fontSize: 12 }}>{msnName(t.msn)}</td>
                            <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.description || '—'}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                              {t.reference?.slice(0, 20)}{t.reference?.length > 20 ? '…' : ''}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 7px',
                                background: statusColor(t.status) + '22',
                                color: statusColor(t.status),
                              }}>
                                {statusLabel(t.status)}
                              </span>
                            </td>
                            <td style={{
                              textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12,
                              color: t.status === 'REFUNDED' ? 'var(--red)' : t.status === 'CAPTURED' ? 'var(--green)' : 'var(--muted)',
                            }}>
                              {t.amount_ore ? fmt(t.amount_ore / 100) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filtered.length > 100 && (
                      <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                        Viser 100 av {filtered.length} transaksjoner. Bruk MSN-filter for å avgrense.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ),
          },
        ]} />
      )}
    </div>
  )
}
