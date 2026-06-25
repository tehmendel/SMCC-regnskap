import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Categories() {
  const { profile, isAdmin } = useAuth()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', type: 'utgift', description: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('categories').select('*').order('type').order('name')
    setCategories(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { error } = await supabase.from('categories').insert({ ...form, created_by: profile.id })
    if (error) setError(error.message)
    else { setForm({ name: '', type: 'utgift', description: '' }); load() }
    setSaving(false)
  }

  async function toggleActive(cat) {
    await supabase.from('categories').update({ active: !cat.active }).eq('id', cat.id)
    load()
  }

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Kategorier</div>
          <div className="page-sub">Inntekts- og utgiftskategorier</div>
        </div>
      </div>

      {isAdmin && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">Legg til kategori</div>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={save}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Navn</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="inntekt">Inntekt</option>
                  <option value="utgift">Utgift</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Beskrivelse</label>
                <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Lagrer…' : '+ Legg til'}</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Navn</th>
                <th>Type</th>
                <th>Beskrivelse</th>
                <th>Status</th>
                {isAdmin && <th>Handlinger</th>}
              </tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td><span className={`badge badge-${c.type}`}>{c.type}</span></td>
                  <td style={{ color: 'var(--muted)' }}>{c.description || '—'}</td>
                  <td>
                    <span className={`badge ${c.active ? 'badge-approved' : 'badge-pending'}`}>
                      {c.active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(c)}>
                        {c.active ? 'Deaktiver' : 'Aktiver'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
