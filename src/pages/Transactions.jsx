import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

function fmt(amount) {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)
}

function Modal({ onClose, onSaved, editItem }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(editItem || { date: '', description: '', amount: '', type: 'utgift', category_id: '', notes: '' })
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('categories').select('*').eq('active', true).then(({ data }) => setCategories(data || []))
  }, [])

  async function save(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
      created_by: profile.id,
      updated_by: profile.id,
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
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">Dato</label>
            <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Beskrivelse</label>
            <input className="form-input" type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Beløp (NOK)</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="inntekt">Inntekt</option>
                <option value="utgift">Utgift</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Kategori</label>
            <select className="form-select" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
              <option value="">Velg kategori…</option>
              {categories.filter(c => c.type === form.type).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notater</label>
            <textarea className="form-textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-8 mt-16">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Avbryt</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Lagrer…' : 'Lagre'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Transactions() {
  const { isKasserer, isAdmin, profile } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [filterType, setFilterType] = useState('alle')

  async function load() {
    const { data } = await supabase
      .from('transactions')
      .select('*, categories(name)')
      .order('date', { ascending: false })
    setTransactions(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function toggleApprove(t) {
    await supabase.from('transactions').update({
      approved: !t.approved,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      updated_by: profile.id,
    }).eq('id', t.id)
    load()
  }

  async function deleteTransaction(id) {
    if (!confirm('Slett denne transaksjonen?')) return
    await supabase.from('transactions').delete().eq('id', id)
    load()
  }

  const filtered = filterType === 'alle' ? transactions : transactions.filter(t => t.type === filterType)

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
          <div className="page-sub">{transactions.length} poster totalt</div>
        </div>
        {isKasserer && (
          <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowModal(true) }}>
            + Ny transaksjon
          </button>
        )}
      </div>

      <div className="flex gap-8" style={{ marginBottom: 20 }}>
        {['alle', 'inntekt', 'utgift'].map(f => (
          <button key={f} className={`btn btn-sm ${filterType === f ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterType(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

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
            <table>
              <thead>
                <tr>
                  <th>Dato</th>
                  <th>Beskrivelse</th>
                  <th>Kategori</th>
                  <th>Type</th>
                  <th className="text-right">Beløp</th>
                  <th>Status</th>
                  {isKasserer && <th>Handlinger</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
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
                    {isKasserer && (
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-sm btn-secondary" onClick={() => { setEditItem(t); setShowModal(true) }}>Rediger</button>
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
    </div>
  )
}
