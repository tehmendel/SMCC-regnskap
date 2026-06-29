import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { ColumnPicker } from '../components/ColumnPicker'
import { ResizableTh } from '../components/ResizableTh'
import { CardGrid } from '../components/CardGrid'

function fmt(amount) {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)
}

const COLUMNS = [
  { key: 'date',        label: 'Dato' },
  { key: 'description', label: 'Beskrivelse' },
  { key: 'arrangement', label: 'Arrangement' },
  { key: 'category',    label: 'Kategori' },
  { key: 'type',        label: 'Type' },
  { key: 'amount',      label: 'Beløp' },
  { key: 'status',      label: 'Status' },
  { key: 'notes',       label: 'Notater',    default: false },
  { key: 'imported',    label: 'Bankimport', default: false },
  { key: 'actions',     label: 'Handlinger' },
]

function Modal({ onClose, onSaved, editItem }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(editItem || {
    date: '', description: '', amount: '', type: 'utgift',
    category_id: '', arrangement_id: '', notes: '',
  })
  const [categories, setCategories] = useState([])
  const [arrangements, setArrangements] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('categories').select('*').eq('active', true).order('name')
      .then(({ data }) => setCategories(data || []))
    supabase.from('arrangements').select('id, name, start_date').order('start_date', { ascending: false })
      .then(({ data }) => setArrangements(data || []))
  }, [])

  const selectedCategory = categories.find(c => c.id === form.category_id)
  const isArrangementCategory = selectedCategory?.name?.toLowerCase().includes('arrangement')

  async function save(andApprove = false) {
    setError('')
    setSaving(true)
    const { categories: _cat, arrangements: _arr, ...formFields } = form
    const payload = {
      ...formFields,
      amount: parseFloat(form.amount),
      arrangement_id: isArrangementCategory ? (form.arrangement_id || null) : null,
      created_by: profile.id,
      updated_by: profile.id,
    }
    if (andApprove) {
      payload.approved = true
      payload.approved_by = profile.id
      payload.approved_at = new Date().toISOString()
    }
    let result
    if (editItem) {
      result = await supabase.from('transactions').update(payload).eq('id', editItem.id)
    } else {
      result = await supabase.from('transactions').insert(payload)
    }
    if (result.error) setError(result.error.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{editItem ? 'Rediger transaksjon' : 'Ny transaksjon'}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={e => { e.preventDefault(); save(false) }}>
          <div className="form-group">
            <label className="form-label">Dato</label>
            <input className="form-input" type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Beskrivelse</label>
            <input className="form-input" type="text" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Beløp (NOK)</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value, category_id: '', arrangement_id: '' }))}>
                <option value="inntekt">Inntekt</option>
                <option value="utgift">Utgift</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Kategori</label>
            <select className="form-select" value={form.category_id}
              onChange={e => setForm(f => ({ ...f, category_id: e.target.value, arrangement_id: '' }))}>
              <option value="">Velg kategori…</option>
              {categories.filter(c => c.type === form.type).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {isArrangementCategory && (
            <div className="form-group">
              <label className="form-label">Arrangement</label>
              <select className="form-select" value={form.arrangement_id || ''}
                onChange={e => setForm(f => ({ ...f, arrangement_id: e.target.value || null }))}>
                <option value="">— velg arrangement —</option>
                {arrangements.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.start_date ? ` (${a.start_date.slice(0, 4)})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Notater</label>
            <textarea className="form-textarea" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-8 mt-16">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Avbryt</button>
            <button type="submit" className="btn btn-secondary" disabled={saving}>
              {saving ? 'Lagrer…' : 'Lagre'}
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
              {saving ? 'Lagrer…' : 'Lagre og godkjenn'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Transactions() {
  const { isKasserer, isAdmin, profile } = useAuth()
  const navigate = useNavigate()
  const prefs = useColumnPrefs('transactions', COLUMNS)
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [filterType, setFilterType] = useState('alle')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('alle')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [bulkApproving, setBulkApproving] = useState(false)
  const [lastImport, setLastImport] = useState(null)

  async function load() {
    const { data } = await supabase
      .from('transactions')
      .select('*, categories(name), arrangements(name)')
      .order('date', { ascending: false })
    setTransactions(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('categories').select('*').eq('active', true).order('name')
      .then(({ data }) => setCategories(data || []))
    supabase.from('bank_imports').select('imported_at, transaction_count, filename')
      .order('imported_at', { ascending: false }).limit(1).single()
      .then(({ data }) => setLastImport(data || null))
  }, [])

  async function toggleApprove(t) {
    await supabase.from('transactions').update({
      approved: !t.approved,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      updated_by: profile.id,
    }).eq('id', t.id)
    load()
  }

  async function bulkApprove() {
    const pending = filtered.filter(t => !t.approved)
    if (!pending.length) return
    if (!confirm(`Godkjenn ${pending.length} transaksjon${pending.length !== 1 ? 'er' : ''} i gjeldende visning?`)) return
    setBulkApproving(true)
    const ids = pending.map(t => t.id)
    await supabase.from('transactions').update({
      approved: true,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      updated_by: profile.id,
    }).in('id', ids)
    await load()
    setBulkApproving(false)
  }

  async function deleteTransaction(id) {
    if (!confirm('Slett denne transaksjonen?')) return
    await supabase.from('transactions').delete().eq('id', id)
    load()
  }

  const countByCategory = transactions.reduce((acc, t) => {
    if (filterType !== 'alle' && t.type !== filterType) return acc
    if (filterStatus !== 'alle' && (filterStatus === 'godkjent') !== t.approved) return acc
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return acc
    if (dateFrom && t.date < dateFrom) return acc
    if (dateTo && t.date > dateTo) return acc
    const key = t.category_id || '__ingen__'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const filtered = transactions.filter(t => {
    if (filterType !== 'alle' && t.type !== filterType) return false
    if (filterCategory && t.category_id !== filterCategory) return false
    if (filterStatus !== 'alle' && (filterStatus === 'godkjent') !== t.approved) return false
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false
    if (dateFrom && t.date < dateFrom) return false
    if (dateTo && t.date > dateTo) return false
    return true
  })

  function renderCell(t, key) {
    switch (key) {
      case 'date':
        return <td key={key} className="text-mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{t.date}</td>
      case 'description':
        return <td key={key}>{t.description}</td>
      case 'arrangement':
        return <td key={key} style={{ fontSize: 11, color: 'var(--accent)' }}>{t.arrangements?.name || '—'}</td>
      case 'category':
        return <td key={key} style={{ color: 'var(--muted)' }}>{t.categories?.name ?? '—'}</td>
      case 'type':
        return <td key={key}><span className={`badge badge-${t.type}`}>{t.type}</span></td>
      case 'amount':
        return (
          <td key={key} className="text-right">
            <span className={t.type === 'inntekt' ? 'amount-positive' : 'amount-negative'}>
              {t.type === 'utgift' ? '−' : '+'}{fmt(t.amount)}
            </span>
          </td>
        )
      case 'status':
        return (
          <td key={key}>
            <span className={`badge ${t.approved ? 'badge-approved' : 'badge-pending'}`}>
              {t.approved ? 'Godkjent' : 'Venter'}
            </span>
          </td>
        )
      case 'notes':
        return <td key={key} style={{ color: 'var(--muted)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes || '—'}</td>
      case 'imported':
        return (
          <td key={key}>
            {t.bank_import_id
              ? <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>⬡ bank</span>
              : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
          </td>
        )
      default: return <td key={key} />
    }
  }

  const hasAnyWidth = prefs.orderedVisible.some(c => prefs.getWidth(c.key))

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      {showModal && (
        <Modal
          editItem={editItem}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSaved={load}
        />
      )}
      <div className="page-header">
        <div>
          <div className="page-title">Transaksjoner</div>
          <div className="page-sub" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{filtered.length} av {transactions.length} poster</span>
            {lastImport && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                Sist importert:{' '}
                <span style={{ color: 'var(--dim)' }}>
                  {new Date(lastImport.imported_at).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' '}· {lastImport.transaction_count} transaksjoner · {lastImport.filename}
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-8">
          {isKasserer && (
            <button className="btn btn-secondary" onClick={() => navigate('/bankimport')}>
              ↥ Importer kontoutskrift
            </button>
          )}
          {isKasserer && (
            <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowModal(true) }}>
              + Ny transaksjon
            </button>
          )}
        </div>
      </div>

      <CardGrid pageKey="transaksjoner" cards={[
        {
          id: 'filtre',
          content: (
            <div className="card" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Søk beskrivelse</label>
                  <input className="form-input" placeholder="Søk…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Kategori</label>
                  <select className="form-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                    <option value="">Alle kategorier</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({countByCategory[c.id] || 0})</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fra dato</label>
                  <input className="form-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Til dato</label>
                  <input className="form-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 4 }}>Type:</span>
                {['alle', 'inntekt', 'utgift'].map(f => (
                  <button key={f} className={`btn btn-sm ${filterType === f ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterType(f)}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 12, marginRight: 4 }}>Status:</span>
                {['alle', 'godkjent', 'venter'].map(f => (
                  <button key={f} className={`btn btn-sm ${filterStatus === f ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterStatus(f)}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
                {(search || filterCategory || filterStatus !== 'alle' || filterType !== 'alle' || dateFrom || dateTo) && (
                  <button className="btn btn-sm btn-secondary"
                    onClick={() => { setSearch(''); setFilterCategory(''); setFilterStatus('alle'); setFilterType('alle'); setDateFrom(''); setDateTo('') }}>
                    Nullstill filtre
                  </button>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isKasserer && (() => {
                    const pendingCount = filtered.filter(t => !t.approved).length
                    return pendingCount > 0 ? (
                      <button className="btn btn-sm btn-primary"
                        disabled={bulkApproving} onClick={bulkApprove}>
                        {bulkApproving ? 'Godkjenner…' : `Godkjenn alle (${pendingCount})`}
                      </button>
                    ) : null
                  })()}
                  <ColumnPicker prefs={prefs} />
                </div>
              </div>
            </div>
          ),
        },
        {
          id: 'tabell',
          content: (
            <div className="card">
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-text">
                    {isKasserer ? 'Ingen transaksjoner. Klikk "+ Ny transaksjon" for å starte.' : 'Ingen godkjente transaksjoner å vise.'}
                  </div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table style={hasAnyWidth ? { tableLayout: 'fixed' } : {}}>
                    <thead>
                      <tr>
                        {prefs.orderedVisible.map(col => (
                          <ResizableTh key={col.key} colKey={col.key} prefs={prefs}
                            className={col.key === 'amount' ? 'text-right' : ''}>
                            {col.label}
                          </ResizableTh>
                        ))}
                        {isKasserer && <th>Handlinger</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(t => (
                        <tr key={t.id}>
                          {prefs.orderedVisible.map(col => renderCell(t, col.key))}
                          {isKasserer && (
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div className="flex gap-8">
                                <button className="btn btn-sm btn-secondary"
                                  onClick={() => { setEditItem(t); setShowModal(true) }}>Rediger</button>
                                <button className="btn btn-sm btn-secondary" onClick={() => toggleApprove(t)}>
                                  {t.approved ? 'Angre' : 'Godkjenn'}
                                </button>
                                {isAdmin && (
                                  <button className="btn btn-sm btn-danger" onClick={() => deleteTransaction(t.id)}>Slett</button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ),
        },
      ]} />
    </div>
  )
}
