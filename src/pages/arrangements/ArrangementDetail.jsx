import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { fmt, fmtDate } from '../../lib/format'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const COLORS = ['#E85D26','#22C55E','#EAB308','#3B82F6','#A855F7','#EC4899']
const PAYMENT_METHODS = ['bank','smcc_kort','bonger','kontant','faktura']
const PAYMENT_LABELS = { bank:'Bank', smcc_kort:'SMCC Kort', bonger:'Bonger', kontant:'Kontant', faktura:'Faktura' }

function ExpenseModal({ arrangement, departments, onClose, onSaved, editItem }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(editItem || {
    expense_date: new Date().toISOString().split('T')[0],
    description: '', vendor: '', amount: '', paid_by: '',
    payment_method: 'bank', department_id: '', notes: '',
    reimbursed: false, is_estimate: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
      arrangement_id: arrangement.id,
      created_by: profile.id,
      updated_by: profile.id,
      department_id: form.department_id || null,
    }
    const { error } = editItem
      ? await supabase.from('arrangement_expenses').update(payload).eq('id', editItem.id)
      : await supabase.from('arrangement_expenses').insert(payload)
    if (error) setError(error.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{editItem ? 'Rediger utgift' : 'Registrer utgift'}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={save}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Dato</label>
              <input className="form-input" type="date" value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Avdeling</label>
              <select className="form-select" value={form.department_id}
                onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>
                <option value="">Velg avdeling…</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Beskrivelse / Produkt</label>
            <input className="form-input" type="text" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Leverandør</label>
              <input className="form-input" type="text" value={form.vendor}
                onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Beløp (NOK)</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Hvem la ut</label>
              <input className="form-input" type="text" value={form.paid_by}
                onChange={e => setForm(f => ({ ...f, paid_by: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Betalingsmetode</label>
              <select className="form-select" value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--dim)' }}>
              <input type="checkbox" checked={form.reimbursed}
                onChange={e => setForm(f => ({ ...f, reimbursed: e.target.checked }))} />
              Utbetalt
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--dim)' }}>
              <input type="checkbox" checked={form.is_estimate}
                onChange={e => setForm(f => ({ ...f, is_estimate: e.target.checked }))} />
              Estimat
            </label>
          </div>
          <div className="form-group">
            <label className="form-label">Kommentar</label>
            <textarea className="form-textarea" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-8">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Avbryt</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Lagrer…' : 'Lagre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ArrangementDetail() {
  const { id } = useParams()
  const { isKasserer, isAdmin } = useAuth()
  const [arrangement, setArrangement] = useState(null)
  const [departments, setDepartments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [revenues, setRevenues] = useState([])
  const [vippsAccounts, setVippsAccounts] = useState([])
  const [linkedTx, setLinkedTx] = useState([])
  const [activeTab, setActiveTab] = useState('oversikt')
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editExpense, setEditExpense] = useState(null)
  const [filterDept, setFilterDept] = useState('alle')
  const [loading, setLoading] = useState(true)

  async function load() {
    const [arrRes, deptRes, expRes, revRes, vippsRes, txRes] = await Promise.all([
      supabase.from('arrangements').select('*').eq('id', id).single(),
      supabase.from('arrangement_departments').select('*').eq('arrangement_id', id).order('sort_order'),
      supabase.from('arrangement_expenses').select('*, arrangement_departments(name)').eq('arrangement_id', id).order('expense_date'),
      supabase.from('arrangement_revenues').select('*, arrangement_departments(name)').eq('arrangement_id', id).order('revenue_date'),
      supabase.from('arrangement_vipps_accounts').select('*').eq('arrangement_id', id),
      supabase.from('transactions').select('*, categories(name)').eq('arrangement_id', id).order('date', { ascending: false }),
    ])
    setArrangement(arrRes.data)
    setDepartments(deptRes.data || [])
    setExpenses(expRes.data || [])
    setRevenues(revRes.data || [])
    setVippsAccounts(vippsRes.data || [])
    setLinkedTx(txRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function markReimbursed(expense) {
    await supabase.from('arrangement_expenses').update({
      reimbursed: !expense.reimbursed,
      reimbursed_date: !expense.reimbursed ? new Date().toISOString().split('T')[0] : null,
    }).eq('id', expense.id)
    load()
  }

  if (loading) return <div className="text-muted">Laster…</div>
  if (!arrangement) return <div className="text-muted">Arrangement ikke funnet</div>

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalRevenues = revenues.reduce((s, r) => s + Number(r.amount), 0)
  const totalVipps = vippsAccounts.reduce((s, v) => s + Number(v.total_sales || 0), 0)
  const result = totalRevenues - totalExpenses
  const outstanding = expenses.filter(e => !e.reimbursed).reduce((s, e) => s + Number(e.amount), 0)

  // Per avdeling
  const deptData = departments.map(d => ({
    name: d.name,
    utgifter: expenses.filter(e => e.department_id === d.id).reduce((s, e) => s + Number(e.amount), 0),
    budsjett: d.budget || 0,
  })).filter(d => d.utgifter > 0)

  const filteredExpenses = filterDept === 'alle'
    ? expenses
    : expenses.filter(e => e.arrangement_departments?.name === filterDept)

  const tabs = ['oversikt', 'utgifter', 'inntekter', 'vipps', 'utbetalinger', 'transaksjoner']

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
            <Link to="/arrangementer" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Arrangementer</Link>
          </div>
          <div className="page-title">{arrangement.name}</div>
          <div className="page-sub">{fmtDate(arrangement.start_date)} – {fmtDate(arrangement.end_date)} · {arrangement.location}</div>
        </div>
        <div className="flex gap-8">
          <span className={`badge badge-${arrangement.status === 'aktiv' ? 'approved' : 'pending'}`}>{arrangement.status}</span>
          {isKasserer && (
            <button className="btn btn-primary" onClick={() => { setEditExpense(null); setShowExpenseModal(true) }}>
              + Utgift
            </button>
          )}
        </div>
      </div>

      {showExpenseModal && (
        <ExpenseModal
          arrangement={arrangement}
          departments={departments}
          editItem={editExpense}
          onClose={() => { setShowExpenseModal(false); setEditExpense(null) }}
          onSaved={load}
        />
      )}

      {/* KPI-er */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-box">
          <div className="stat-label">Inntekter</div>
          <div className="stat-value positive">{fmt(totalRevenues)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Utgifter</div>
          <div className="stat-value negative">{fmt(totalExpenses)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Resultat</div>
          <div className={`stat-value ${result >= 0 ? 'positive' : 'negative'}`}>{fmt(result)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Vipps total</div>
          <div className="stat-value">{fmt(totalVipps)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Utestående refusjon</div>
          <div className={`stat-value ${outstanding > 0 ? 'negative' : ''}`}>{fmt(outstanding)}</div>
        </div>
        {arrangement.participant_count && (
          <div className="stat-box">
            <div className="stat-label">Kostnad per deltaker</div>
            <div className="stat-value">{fmt(totalExpenses / arrangement.participant_count)}</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-8" style={{ marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t} className={`btn btn-sm ${activeTab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* OVERSIKT */}
      {activeTab === 'oversikt' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-title">Utgifter per avdeling</div>
            {deptData.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">Ingen utgifter registrert</div></div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={deptData}>
                  <XAxis dataKey="name" tick={{ fill: 'var(--dim)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--dim)', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--steel)', border: '1px solid var(--border)', borderRadius: 4 }} />
                  <Bar dataKey="utgifter" fill="var(--orange)" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card">
            <div className="card-title">Fordeling</div>
            {deptData.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">Ingen data</div></div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={deptData} dataKey="utgifter" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--steel)', border: '1px solid var(--border)' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* UTGIFTER */}
      {activeTab === 'utgifter' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Utgifter ({filteredExpenses.length})</div>
            <div className="flex gap-8">
              <button className={`btn btn-sm ${filterDept === 'alle' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterDept('alle')}>Alle</button>
              {departments.map(d => (
                <button key={d.id} className={`btn btn-sm ${filterDept === d.name ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilterDept(d.name)}>{d.name}</button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dato</th><th>Beskrivelse</th><th>Leverandør</th><th>Avdeling</th>
                  <th>Hvem</th><th>Metode</th><th className="text-right">Beløp</th>
                  <th>Status</th>{isKasserer && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map(e => (
                  <tr key={e.id}>
                    <td className="text-mono" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{e.expense_date}</td>
                    <td>
                      {e.description}
                      {e.is_estimate && <span className="badge badge-pending" style={{ marginLeft: 6, fontSize: 9 }}>estimat</span>}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{e.vendor || '—'}</td>
                    <td><span className="badge badge-pending" style={{ background: 'var(--graphite)', color: 'var(--dim)' }}>{e.arrangement_departments?.name || '—'}</span></td>
                    <td style={{ color: 'var(--dim)' }}>{e.paid_by}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{PAYMENT_LABELS[e.payment_method]}</td>
                    <td className="text-right amount-negative">{fmt(e.amount)}</td>
                    <td>
                      <span className={`badge ${e.reimbursed ? 'badge-approved' : 'badge-pending'}`}>
                        {e.reimbursed ? 'Utbetalt' : 'Venter'}
                      </span>
                    </td>
                    {isKasserer && (
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-sm btn-secondary" onClick={() => { setEditExpense(e); setShowExpenseModal(true) }}>✎</button>
                          <button className="btn btn-sm btn-secondary" onClick={() => markReimbursed(e)}>
                            {e.reimbursed ? '↩' : '✓'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ paddingTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>TOTAL</td>
                  <td className="text-right amount-negative" style={{ paddingTop: 12, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {fmt(filteredExpenses.reduce((s, e) => s + Number(e.amount), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* INNTEKTER */}
      {activeTab === 'inntekter' && (
        <div className="card">
          <div className="card-title">Inntekter</div>
          {revenues.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💰</div>
              <div className="empty-state-text">Ingen inntekter registrert</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Dato</th><th>Beskrivelse</th><th>Kilde</th><th>Avdeling</th><th className="text-right">Beløp</th></tr></thead>
                <tbody>
                  {revenues.map(r => (
                    <tr key={r.id}>
                      <td className="text-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{r.revenue_date}</td>
                      <td>{r.description}</td>
                      <td><span className="badge badge-inntekt">{r.source}</span></td>
                      <td style={{ color: 'var(--muted)' }}>{r.arrangement_departments?.name || '—'}</td>
                      <td className="text-right amount-positive">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIPPS */}
      {activeTab === 'vipps' && (
        <div className="card">
          <div className="card-title">Vipps-kontoer</div>
          {vippsAccounts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📱</div>
              <div className="empty-state-text">Ingen Vipps-data importert ennå</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Konto</th><th className="text-right">Omsetning</th><th className="text-right">Transaksjoner</th><th className="text-right">Gebyrer</th><th className="text-right">Netto</th></tr></thead>
                <tbody>
                  {vippsAccounts.map(v => (
                    <tr key={v.id}>
                      <td>{v.account_name}</td>
                      <td className="text-right amount-positive">{fmt(v.total_sales)}</td>
                      <td className="text-right text-mono">{v.total_transactions}</td>
                      <td className="text-right amount-negative">{fmt(v.total_fees)}</td>
                      <td className="text-right amount-positive">{fmt(v.total_sales - v.total_fees)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* BANKTRANSAKSJONER */}
      {activeTab === 'transaksjoner' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              Banktransaksjoner ({linkedTx.length})
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Transaksjoner koblet til dette arrangementet via kategori i transaksjonsregisteret
            </div>
          </div>
          {linkedTx.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-text">
                Ingen banktransaksjoner er koblet til dette arrangementet ennå.<br />
                Koble dem ved å velge en arrangement-kategori og dette arrangementet i Transaksjoner.
              </div>
            </div>
          ) : (
            <>
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
                    {linkedTx.map(t => (
                      <tr key={t.id}>
                        <td className="text-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{t.date}</td>
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
                  <tfoot>
                    <tr>
                      <td colSpan={4} style={{ paddingTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                        NETTO (inntekt − utgift)
                      </td>
                      <td className="text-right" style={{ paddingTop: 12, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {(() => {
                          const net = linkedTx.reduce((s, t) => s + (t.type === 'inntekt' ? Number(t.amount) : -Number(t.amount)), 0)
                          return <span className={net >= 0 ? 'amount-positive' : 'amount-negative'}>{fmt(net)}</span>
                        })()}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* UTBETALINGER */}
      {activeTab === 'utbetalinger' && (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Utestående refusjoner</div>
            {expenses.filter(e => !e.reimbursed).length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <div className="empty-state-text">Alle utgifter er utbetalt!</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Person</th><th>Beskrivelse</th><th>Avdeling</th><th>Metode</th><th className="text-right">Beløp</th>{isKasserer && <th></th>}</tr></thead>
                  <tbody>
                    {expenses.filter(e => !e.reimbursed).map(e => (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 500 }}>{e.paid_by}</td>
                        <td>{e.description}</td>
                        <td style={{ color: 'var(--muted)' }}>{e.arrangement_departments?.name || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--muted)' }}>{PAYMENT_LABELS[e.payment_method]}</td>
                        <td className="text-right amount-negative">{fmt(e.amount)}</td>
                        {isKasserer && (
                          <td><button className="btn btn-sm btn-primary" onClick={() => markReimbursed(e)}>Marker utbetalt</button></td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} style={{ paddingTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>TOTALT UTESTÅENDE</td>
                      <td className="text-right amount-negative" style={{ paddingTop: 12, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(outstanding)}</td>
                      {isKasserer && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Gruppert per person */}
          <div className="card">
            <div className="card-title">Per person – total utestående</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Person</th><th className="text-right">Antall poster</th><th className="text-right">Totalt</th></tr></thead>
                <tbody>
                  {Object.entries(
                    expenses.filter(e => !e.reimbursed).reduce((acc, e) => {
                      acc[e.paid_by] = acc[e.paid_by] || { count: 0, total: 0 }
                      acc[e.paid_by].count++
                      acc[e.paid_by].total += Number(e.amount)
                      return acc
                    }, {})
                  ).sort((a, b) => b[1].total - a[1].total).map(([name, data]) => (
                    <tr key={name}>
                      <td style={{ fontWeight: 500 }}>{name}</td>
                      <td className="text-right text-mono">{data.count}</td>
                      <td className="text-right amount-negative">{fmt(data.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
