import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { fmt, fmtDate } from '../../lib/format'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'
import { ColumnPicker } from '../../components/ColumnPicker'
import { ResizableTh } from '../../components/ResizableTh'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { CardGrid } from '../../components/CardGrid'

const EXP_COLS = [
  { key: 'date',        label: 'Dato' },
  { key: 'description', label: 'Beskrivelse' },
  { key: 'vendor',      label: 'Leverandør' },
  { key: 'department',  label: 'Avdeling' },
  { key: 'paid_by',     label: 'Hvem la ut' },
  { key: 'method',      label: 'Betalingsmetode', default: false },
  { key: 'amount',      label: 'Beløp' },
  { key: 'reimbursed',  label: 'Status' },
  { key: 'notes',       label: 'Kommentar',       default: false },
  { key: 'actions',     label: 'Handlinger' },
]

const REV_COLS = [
  { key: 'date',        label: 'Dato' },
  { key: 'description', label: 'Beskrivelse' },
  { key: 'source',      label: 'Kilde' },
  { key: 'department',  label: 'Avdeling' },
  { key: 'amount',      label: 'Beløp' },
  { key: 'actions',     label: 'Kobling', default: true },
]

const LINKED_TX_COLS = [
  { key: 'date',        label: 'Dato' },
  { key: 'description', label: 'Beskrivelse' },
  { key: 'category',    label: 'Kategori' },
  { key: 'type',        label: 'Type' },
  { key: 'amount',      label: 'Beløp' },
  { key: 'status',      label: 'Status' },
]

const COLORS = ['#E85D26','#22C55E','#EAB308','#3B82F6','#A855F7','#EC4899']
const PAYMENT_METHODS = ['bank','smcc_kort','bonger','kontant','faktura']
const PAYMENT_LABELS = { bank:'Bank', smcc_kort:'SMCC Kort', bonger:'Bonger', kontant:'Kontant', faktura:'Faktura' }
const STATUSES = ['planlagt','aktiv','avsluttet','arkivert']
const STATUS_NEXT = { planlagt:'aktiv', aktiv:'avsluttet', avsluttet:'arkivert' }
const STATUS_NEXT_LABEL = { planlagt:'Aktiver', aktiv:'Avslutt', avsluttet:'Arkiver' }

function EditArrangementModal({ arrangement, onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    name:                  arrangement.name || '',
    year:                  arrangement.year || new Date().getFullYear(),
    start_date:            arrangement.start_date || '',
    end_date:              arrangement.end_date || '',
    location:              arrangement.location || '',
    description:           arrangement.description || '',
    status:                arrangement.status || 'planlagt',
    participant_count:     arrangement.participant_count || '',
    budget_total:          arrangement.budget_total || '',
    expected_participants: arrangement.expected_participants || '',
    ticket_price:          arrangement.ticket_price || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('arrangements').update({
      ...form,
      participant_count:     form.participant_count     ? parseInt(form.participant_count)     : null,
      budget_total:          form.budget_total          ? parseFloat(form.budget_total)          : null,
      expected_participants: form.expected_participants ? parseInt(form.expected_participants) : null,
      ticket_price:          form.ticket_price          ? parseFloat(form.ticket_price)          : null,
      start_date:            form.start_date || null,
      end_date:              form.end_date   || null,
      updated_by:            profile.id,
      updated_at:            new Date().toISOString(),
    }).eq('id', arrangement.id)
    if (error) setError(error.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  const f = (field, label, type = 'text', required = false) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={form[field]}
        onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
        required={required} />
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-title">Rediger arrangement</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={save}>
          {f('name', 'Navn', 'text', true)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {f('year', 'År', 'number')}
            {f('start_date', 'Startdato', 'date')}
            {f('end_date', 'Sluttdato', 'date')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            {f('location', 'Sted')}
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Beskrivelse</label>
            <textarea className="form-textarea" value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginBottom: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Økonomiplanlegging
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
              {f('budget_total', 'Totalbudsjett (kr)', 'number')}
              {f('participant_count', 'Faktiske deltakere', 'number')}
              {f('expected_participants', 'Forventet antall', 'number')}
              {f('ticket_price', 'Billettpris (kr)', 'number')}
            </div>
          </div>
          <div className="flex gap-8 mt-16">
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
    // Strip any joined relation objects that came from the loaded editItem
    const { arrangement_departments: _dept, ...formFields } = form
    const payload = {
      ...formFields,
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

function LinkTxModal({ revenue, onClose, onSaved }) {
  const [transactions, setTransactions] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('transactions')
        .select('id, date, description, amount, type, categories(name)')
        .eq('type', 'inntekt')
        .order('date', { ascending: false })
      setTransactions(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = transactions.filter(t => {
    const q = search.toLowerCase()
    return (
      t.description?.toLowerCase().includes(q) ||
      t.date?.includes(q) ||
      String(t.amount).includes(q)
    )
  })

  async function link(tx) {
    setSaving(true)
    await supabase
      .from('arrangement_revenues')
      .update({ transaction_id: tx.id })
      .eq('id', revenue.id)
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-title">Koble til banktransaksjon</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Kobler: <strong>{revenue.description}</strong> — {fmt(revenue.amount)}
        </div>
        <input
          className="form-input"
          placeholder="Søk på beskrivelse, dato eller beløp…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 12 }}
          autoFocus
        />
        {loading ? (
          <div className="text-muted">Laster…</div>
        ) : (
          <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Ingen treff</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: 'var(--steel)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>Dato</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>Beskrivelse</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>Beløp</th>
                    <th style={{ width: 80 }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map(t => (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.date}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>
                        {t.description}
                        {t.categories?.name && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)' }}>{t.categories.name}</span>}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--green)' }}>{fmt(t.amount)}</td>
                      <td style={{ padding: '8px 8px' }}>
                        <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => link(t)}>Koble</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  )
}

export default function ArrangementDetail() {
  const { id } = useParams()
  const { isKasserer, isAdmin } = useAuth()
  const expPrefs    = useColumnPrefs('arr_expenses', EXP_COLS)
  const revPrefs    = useColumnPrefs('arr_revenues', REV_COLS)
  const linkedPrefs = useColumnPrefs('arr_linked_tx', LINKED_TX_COLS)
  const [arrangement, setArrangement] = useState(null)
  const [departments, setDepartments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [revenues, setRevenues] = useState([])
  const [vippsAccounts, setVippsAccounts] = useState([])
  const [linkedTx, setLinkedTx] = useState([])
  const [activeTab, setActiveTab] = useState('oversikt')
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editExpense, setEditExpense] = useState(null)
  const [linkTarget, setLinkTarget] = useState(null)
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

  async function advanceStatus() {
    const next = STATUS_NEXT[arrangement.status]
    if (!next) return
    await supabase.from('arrangements').update({ status: next }).eq('id', id)
    load()
  }

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
  const budgetUsedPct = arrangement.budget_total ? Math.min((totalExpenses / arrangement.budget_total) * 100, 100) : null

  // Break-even
  const breakEvenParticipants = arrangement.ticket_price && arrangement.ticket_price > 0
    ? Math.ceil(totalExpenses / arrangement.ticket_price)
    : null
  const projectedRevenue = arrangement.expected_participants && arrangement.ticket_price
    ? arrangement.expected_participants * arrangement.ticket_price
    : null

  // Per-gjest statistikk
  const guests = arrangement.participant_count || 0
  const revenuePerGuest   = guests > 0 ? totalRevenues / guests : null
  const expensePerGuest   = guests > 0 ? totalExpenses / guests : null
  const resultPerGuest    = guests > 0 ? result / guests : null
  const vippsPerGuest     = guests > 0 && totalVipps > 0 ? totalVipps / guests : null
  const breakEvenFactual  = revenuePerGuest > 0 ? Math.ceil(totalExpenses / revenuePerGuest) : null
  const capacityPct       = arrangement.expected_participants > 0
    ? Math.round((guests / arrangement.expected_participants) * 100) : null

  // Per avdeling
  const deptData = departments.map(d => ({
    name: d.name,
    utgifter: expenses.filter(e => e.department_id === d.id).reduce((s, e) => s + Number(e.amount), 0),
    budsjett: d.budget || 0,
  })).filter(d => d.utgifter > 0 || d.budsjett > 0)

  const filteredExpenses = filterDept === 'alle'
    ? expenses
    : expenses.filter(e => e.arrangement_departments?.name === filterDept)

  const tabs = ['oversikt', 'utgifter', 'inntekter', 'vipps', 'utbetalinger', 'transaksjoner']

  return (
    <div>
      {showEditModal && (
        <EditArrangementModal
          arrangement={arrangement}
          onClose={() => setShowEditModal(false)}
          onSaved={load}
        />
      )}
      {showExpenseModal && (
        <ExpenseModal
          arrangement={arrangement}
          departments={departments}
          editItem={editExpense}
          onClose={() => { setShowExpenseModal(false); setEditExpense(null) }}
          onSaved={load}
        />
      )}

      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
            <Link to="/arrangementer" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Arrangementer</Link>
          </div>
          <div className="page-title">{arrangement.name}</div>
          <div className="page-sub">
            {fmtDate(arrangement.start_date)}
            {arrangement.end_date && arrangement.end_date !== arrangement.start_date && ` – ${fmtDate(arrangement.end_date)}`}
            {arrangement.location && ` · ${arrangement.location}`}
            {arrangement.participant_count && ` · ${arrangement.participant_count} deltakere`}
          </div>
        </div>
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <span className={`badge badge-${arrangement.status === 'aktiv' ? 'approved' : 'pending'}`}>
            {arrangement.status}
          </span>
          {isKasserer && STATUS_NEXT[arrangement.status] && (
            <button className="btn btn-sm btn-secondary" onClick={advanceStatus}>
              {STATUS_NEXT_LABEL[arrangement.status]} →
            </button>
          )}
          {isKasserer && (
            <button className="btn btn-secondary" onClick={() => setShowEditModal(true)}>
              Rediger
            </button>
          )}
          {isKasserer && (
            <button className="btn btn-primary" onClick={() => { setEditExpense(null); setShowExpenseModal(true) }}>
              + Utgift
            </button>
          )}
        </div>
      </div>

      {/* KPI-er */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-box">
          <div className="stat-label">Inntekter</div>
          <div className="stat-value positive">{fmt(totalRevenues)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Utgifter</div>
          <div className="stat-value negative">{fmt(totalExpenses)}</div>
          {budgetUsedPct !== null && (
            <div style={{ marginTop: 6 }}>
              <div style={{ height: 4, background: 'var(--graphite)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${budgetUsedPct}%`, height: '100%', borderRadius: 2,
                  background: budgetUsedPct > 90 ? 'var(--red)' : budgetUsedPct > 70 ? 'var(--yellow)' : 'var(--green)' }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                {budgetUsedPct.toFixed(0)}% av budsjett ({fmt(arrangement.budget_total)})
              </div>
            </div>
          )}
        </div>
        <div className="stat-box">
          <div className="stat-label">Resultat</div>
          <div className={`stat-value ${result >= 0 ? 'positive' : 'negative'}`}>{fmt(result)}</div>
          {projectedRevenue && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
              Forventet: {fmt(projectedRevenue - totalExpenses)}
            </div>
          )}
        </div>
        <div className="stat-box">
          <div className="stat-label">Vipps total</div>
          <div className="stat-value">{fmt(totalVipps)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Utestående refusjon</div>
          <div className={`stat-value ${outstanding > 0 ? 'negative' : ''}`}>{fmt(outstanding)}</div>
        </div>
        {breakEvenParticipants && (
          <div className="stat-box">
            <div className="stat-label">Break-even</div>
            <div className={`stat-value ${(arrangement.participant_count || arrangement.expected_participants || 0) >= breakEvenParticipants ? 'positive' : 'negative'}`}>
              {breakEvenParticipants} pers.
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
              ved {fmt(arrangement.ticket_price)}/billett
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-8" style={{ marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t} className={`btn btn-sm ${activeTab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'transaksjoner' && linkedTx.length > 0 && (
              <span style={{ marginLeft: 5, background: 'var(--accent)', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>
                {linkedTx.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* OVERSIKT */}
      {activeTab === 'oversikt' && (
        <CardGrid pageKey="arrangement-oversikt" cards={[
          {
            id: 'kart',
            content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-title">Budsjett vs. faktisk per avdeling</div>
            {deptData.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">Ingen data ennå</div></div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={deptData}>
                    <XAxis dataKey="name" tick={{ fill: 'var(--dim)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--dim)', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--steel)', border: '1px solid var(--border)', borderRadius: 4 }} />
                    <Bar dataKey="budsjett" fill="var(--graphite)" radius={[3,3,0,0]} name="Budsjett" />
                    <Bar dataKey="utgifter" fill="var(--orange)" radius={[3,3,0,0]} name="Faktisk" />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ marginTop: 12 }}>
                  {deptData.filter(d => d.budsjett > 0).map(d => {
                    const pct = Math.min((d.utgifter / d.budsjett) * 100, 100)
                    const over = d.utgifter > d.budsjett
                    return (
                      <div key={d.name} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                          <span style={{ color: 'var(--dim)' }}>{d.name}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: over ? 'var(--red)' : 'var(--muted)', fontSize: 11 }}>
                            {fmt(d.utgifter)} / {fmt(d.budsjett)}
                          </span>
                        </div>
                        <div style={{ height: 4, background: 'var(--graphite)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2,
                            background: over ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : 'var(--green)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">Utgiftsfordeling</div>
              {deptData.length === 0 ? (
                <div className="empty-state"><div className="empty-state-text">Ingen data</div></div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={deptData} dataKey="utgifter" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                      label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent*100).toFixed(0)}%` : ''}
                      labelLine={false}>
                      {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--steel)', border: '1px solid var(--border)' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {(breakEvenParticipants || arrangement.budget_total) && (
              <div className="card">
                <div className="card-title">Kalkyle</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    {arrangement.budget_total && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 0', color: 'var(--dim)' }}>Totalbudsjett</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(arrangement.budget_total)}</td>
                      </tr>
                    )}
                    {arrangement.expected_participants && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 0', color: 'var(--dim)' }}>Forventet deltakere</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{arrangement.expected_participants}</td>
                      </tr>
                    )}
                    {arrangement.ticket_price && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 0', color: 'var(--dim)' }}>Billettpris</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(arrangement.ticket_price)}</td>
                      </tr>
                    )}
                    {projectedRevenue && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 0', color: 'var(--dim)' }}>Forventet billetinntekt</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{fmt(projectedRevenue)}</td>
                      </tr>
                    )}
                    {breakEvenParticipants && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 0', color: 'var(--dim)' }}>Break-even antall</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)',
                          color: (arrangement.participant_count || 0) >= breakEvenParticipants ? 'var(--green)' : 'var(--yellow)' }}>
                          {breakEvenParticipants}
                        </td>
                      </tr>
                    )}
                    {projectedRevenue && (
                      <tr>
                        <td style={{ padding: '6px 0', fontWeight: 600 }}>Forventet resultat</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600,
                          color: projectedRevenue - totalExpenses >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {fmt(projectedRevenue - totalExpenses)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

            ),
          },
          ...(guests > 0 ? [{
            id: 'gjeststatistikk',
            content: (
          <div className="card">
            <div className="card-title">Gjeststatistikk</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>

              <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Inntekt per gjest</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{fmt(revenuePerGuest)}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{guests} gjester · {fmt(totalRevenues)} tot.</div>
              </div>

              <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Utgift per gjest</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--orange)' }}>{fmt(expensePerGuest)}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{fmt(totalExpenses)} tot.</div>
              </div>

              <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Resultat per gjest</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: resultPerGuest >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {resultPerGuest >= 0 ? '+' : ''}{fmt(resultPerGuest)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{fmt(result)} totalt</div>
              </div>

              {vippsPerGuest && (
                <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Vipps per gjest</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>{fmt(vippsPerGuest)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{fmt(totalVipps)} Vipps tot.</div>
                </div>
              )}

              {breakEvenFactual && (
                <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Break-even (faktisk snitt)</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: guests >= breakEvenFactual ? 'var(--green)' : 'var(--red)' }}>
                    {breakEvenFactual} pers.
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    ved {fmt(revenuePerGuest)}/gjest · {guests >= breakEvenFactual ? `+${guests - breakEvenFactual} over` : `${breakEvenFactual - guests} under`}
                  </div>
                </div>
              )}

              {breakEvenParticipants && (
                <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Break-even (kun innmelding)</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: guests >= breakEvenParticipants ? 'var(--green)' : 'var(--red)' }}>
                    {breakEvenParticipants} pers.
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>ved {fmt(arrangement.ticket_price)}/billett</div>
                </div>
              )}

              {capacityPct !== null && (
                <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Kapasitetsutnyttelse</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: capacityPct >= 100 ? 'var(--green)' : capacityPct >= 75 ? 'var(--yellow)' : 'var(--orange)' }}>
                    {capacityPct}%
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    {guests} av {arrangement.expected_participants} forventet
                  </div>
                  <div style={{ height: 4, background: 'var(--graphite)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                    <div style={{ width: `${Math.min(capacityPct, 100)}%`, height: '100%', borderRadius: 2,
                      background: capacityPct >= 100 ? 'var(--green)' : capacityPct >= 75 ? 'var(--yellow)' : 'var(--orange)' }} />
                  </div>
                </div>
              )}

            </div>
          </div>
            ),
          }] : []),
        ]} />
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
              <ColumnPicker prefs={expPrefs} />
            </div>
          </div>
          <div className="table-wrap">
            <table style={expPrefs.orderedVisible.some(c => expPrefs.getWidth(c.key)) ? { tableLayout: 'fixed' } : {}}>
              <thead>
                <tr>
                  {expPrefs.orderedVisible.map(col => (
                    <ResizableTh key={col.key} colKey={col.key} prefs={expPrefs}
                      className={col.key === 'amount' ? 'text-right' : ''}>
                      {col.label}
                    </ResizableTh>
                  ))}
                  {isKasserer && <th style={{ width: 80 }} />}
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map(e => (
                  <tr key={e.id}>
                    {expPrefs.orderedVisible.map(col => {
                      switch (col.key) {
                        case 'date':        return <td key={col.key} className="text-mono" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{e.expense_date}</td>
                        case 'description': return <td key={col.key}>{e.description}{e.is_estimate && <span className="badge badge-pending" style={{ marginLeft: 6, fontSize: 9 }}>estimat</span>}{e.transaction_id && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>⬡ bank</span>}</td>
                        case 'vendor':      return <td key={col.key} style={{ color: 'var(--muted)' }}>{e.vendor || '—'}</td>
                        case 'department':  return <td key={col.key}><span className="badge badge-pending" style={{ background: 'var(--graphite)', color: 'var(--dim)' }}>{e.arrangement_departments?.name || '—'}</span></td>
                        case 'paid_by':     return <td key={col.key} style={{ color: 'var(--dim)' }}>{e.paid_by}</td>
                        case 'method':      return <td key={col.key} style={{ fontSize: 11, color: 'var(--muted)' }}>{PAYMENT_LABELS[e.payment_method]}</td>
                        case 'amount':      return <td key={col.key} className="text-right amount-negative">{fmt(e.amount)}</td>
                        case 'reimbursed':  return <td key={col.key}><span className={`badge ${e.reimbursed ? 'badge-approved' : 'badge-pending'}`}>{e.reimbursed ? 'Utbetalt' : 'Venter'}</span></td>
                        case 'notes':       return <td key={col.key} style={{ color: 'var(--muted)', fontSize: 12 }}>{e.notes || '—'}</td>
                        default:            return <td key={col.key} />
                      }
                    })}
                    {isKasserer && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div className="flex gap-8">
                          {!e.transaction_id && (
                            <button className="btn btn-sm btn-secondary" onClick={() => { setEditExpense(e); setShowExpenseModal(true) }}>✎</button>
                          )}
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
                  <td colSpan={99} style={{ paddingTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                    TOTAL
                    <span style={{ marginLeft: 12, fontWeight: 600, color: 'var(--red)' }}>
                      {fmt(filteredExpenses.reduce((s, e) => s + Number(e.amount), 0))}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* INNTEKTER */}
      {activeTab === 'inntekter' && (
        <>
        {linkTarget && (
          <LinkTxModal
            revenue={linkTarget}
            onClose={() => setLinkTarget(null)}
            onSaved={() => { setLinkTarget(null); load() }}
          />
        )}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Inntekter ({revenues.length})</div>
            <ColumnPicker prefs={revPrefs} />
          </div>
          {revenues.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💰</div>
              <div className="empty-state-text">Ingen inntekter registrert</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table style={revPrefs.orderedVisible.some(c => revPrefs.getWidth(c.key)) ? { tableLayout: 'fixed' } : {}}>
                <thead>
                  <tr>
                    {revPrefs.orderedVisible.map(col => (
                      <ResizableTh key={col.key} colKey={col.key} prefs={revPrefs}
                        className={col.key === 'amount' ? 'text-right' : ''}>
                        {col.label}
                      </ResizableTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {revenues.map(r => (
                    <tr key={r.id}>
                      {revPrefs.orderedVisible.map(col => {
                        switch (col.key) {
                          case 'date':        return <td key={col.key} className="text-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{r.revenue_date}</td>
                          case 'description': return <td key={col.key}>{r.description}{r.transaction_id && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>⬡ bank</span>}</td>
                          case 'source':      return <td key={col.key}><span className="badge badge-inntekt">{r.source}</span></td>
                          case 'department':  return <td key={col.key} style={{ color: 'var(--muted)' }}>{r.arrangement_departments?.name || '—'}</td>
                          case 'amount':      return <td key={col.key} className="text-right amount-positive">{fmt(r.amount)}</td>
                          case 'actions':     return (
                            <td key={col.key}>
                              {isKasserer && (
                                r.transaction_id ? (
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    title="Fjern kobling til banktransaksjon"
                                    onClick={async () => {
                                      await supabase.from('arrangement_revenues').update({ transaction_id: null }).eq('id', r.id)
                                      load()
                                    }}
                                  >⬡ Fjern</button>
                                ) : (
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    title="Koble til banktransaksjon"
                                    onClick={() => setLinkTarget(r)}
                                  >⬡ Koble</button>
                                )
                              )}
                            </td>
                          )
                          default:            return <td key={col.key} />
                        }
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
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
            <div className="card-title" style={{ marginBottom: 0 }}>Banktransaksjoner ({linkedTx.length})</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Godkjente transaksjoner synkes automatisk til Utgifter/Inntekter</span>
              <ColumnPicker prefs={linkedPrefs} />
            </div>
          </div>
          {linkedTx.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-text">
                Ingen banktransaksjoner koblet ennå.<br />
                Velg en arrangement-kategori og dette arrangementet i Transaksjoner-siden.
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table style={linkedPrefs.orderedVisible.some(c => linkedPrefs.getWidth(c.key)) ? { tableLayout: 'fixed' } : {}}>
                <thead>
                  <tr>
                    {linkedPrefs.orderedVisible.map(col => (
                      <ResizableTh key={col.key} colKey={col.key} prefs={linkedPrefs}
                        className={col.key === 'amount' ? 'text-right' : ''}>
                        {col.label}
                      </ResizableTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linkedTx.map(t => (
                    <tr key={t.id}>
                      {linkedPrefs.orderedVisible.map(col => {
                        switch (col.key) {
                          case 'date':        return <td key={col.key} className="text-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{t.date}</td>
                          case 'description': return <td key={col.key}>{t.description}</td>
                          case 'category':    return <td key={col.key} style={{ color: 'var(--muted)' }}>{t.categories?.name ?? '—'}</td>
                          case 'type':        return <td key={col.key}><span className={`badge badge-${t.type}`}>{t.type}</span></td>
                          case 'amount':      return <td key={col.key} className="text-right"><span className={t.type === 'inntekt' ? 'amount-positive' : 'amount-negative'}>{t.type === 'utgift' ? '−' : '+'}{fmt(t.amount)}</span></td>
                          case 'status':      return <td key={col.key}><span className={`badge ${t.approved ? 'badge-approved' : 'badge-pending'}`}>{t.approved ? 'Synket ✓' : 'Venter godkjenning'}</span></td>
                          default:            return <td key={col.key} />
                        }
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={99} style={{ paddingTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                      NETTO{' '}
                      {(() => {
                        const net = linkedTx.reduce((s, t) => s + (t.type === 'inntekt' ? Number(t.amount) : -Number(t.amount)), 0)
                        return <span className={net >= 0 ? 'amount-positive' : 'amount-negative'} style={{ fontWeight: 600, marginLeft: 8 }}>{fmt(net)}</span>
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
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
                  <thead><tr><th>Person</th><th>Beskrivelse</th><th>Avdeling</th><th>Metode</th><th className="text-right">Beløp</th>{isKasserer && <th />}</tr></thead>
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
          <div className="card">
            <div className="card-title">Per person – total utestående</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Person</th><th className="text-right">Poster</th><th className="text-right">Totalt</th></tr></thead>
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
