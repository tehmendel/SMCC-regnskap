import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { ColumnPicker } from '../components/ColumnPicker'
import { ResizableTh } from '../components/ResizableTh'
import { CardGrid } from '../components/CardGrid'

const COLUMNS = [
  { key: 'name',        label: 'Navn' },
  { key: 'description', label: 'Beskrivelse' },
  { key: 'active',      label: 'Status' },
  { key: 'actions',     label: 'Handlinger' },
]

function CategoryModal({ category, onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    name:        category?.name        || '',
    type:        category?.type        || 'utgift',
    description: category?.description || '',
    active:      category?.active      ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = category
      ? await supabase.from('categories').update({ ...form }).eq('id', category.id)
      : await supabase.from('categories').insert({ ...form, created_by: profile.id })
    if (res.error) setError(res.error.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">{category ? 'Rediger kategori' : 'Ny kategori'}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={save}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Navn <span style={{ color: 'var(--red)' }}>*</span></label>
              <input className="form-input" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="inntekt">Inntekt</option>
                <option value="utgift">Utgift</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Beskrivelse</label>
            <input className="form-input" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              Aktiv (vises i nedtrekkslister)
            </label>
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

export default function Categories() {
  const { isAdmin } = useAuth()
  const prefs = useColumnPrefs('categories', COLUMNS)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editCat, setEditCat] = useState(null)
  const [deleting, setDeleting] = useState(null)

  async function load() {
    const { data } = await supabase.from('categories').select('*').order('type').order('name')
    setCategories(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteCategory(cat) {
    setDeleting(cat.id)
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id)
    setDeleting(null)

    if (count > 0) {
      if (!confirm(
        `«${cat.name}» er brukt på ${count} transaksjon${count !== 1 ? 'er' : ''}.\n\n` +
        `Disse vil miste kategorien sin. Vil du likevel slette kategorien?`
      )) return
    } else {
      if (!confirm(`Slett kategorien «${cat.name}»?`)) return
    }
    await supabase.from('categories').delete().eq('id', cat.id)
    load()
  }

  const byType = categories.reduce((acc, c) => {
    const k = c.type; (acc[k] = acc[k] || []).push(c); return acc
  }, {})

  function renderCell(c, key) {
    switch (key) {
      case 'name':        return <td key={key} style={{ fontWeight: 500 }}>{c.name}</td>
      case 'description': return <td key={key} style={{ color: 'var(--muted)', fontSize: 13 }}>{c.description || '—'}</td>
      case 'active':      return (
        <td key={key}>
          <span className={`badge ${c.active ? 'badge-approved' : 'badge-pending'}`}>
            {c.active ? 'Aktiv' : 'Inaktiv'}
          </span>
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
        <CategoryModal
          category={editCat}
          onClose={() => { setShowModal(false); setEditCat(null) }}
          onSaved={load}
        />
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Kategorier</div>
          <div className="page-sub">
            {categories.filter(c => c.active).length} aktive ·{' '}
            {categories.filter(c => !c.active).length} inaktive
          </div>
        </div>
        <div className="flex gap-8">
          <ColumnPicker prefs={prefs} />
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { setEditCat(null); setShowModal(true) }}>
              + Ny kategori
            </button>
          )}
        </div>
      </div>

      <CardGrid pageKey="kategorier" cards={
        ['inntekt', 'utgift']
          .filter(type => (byType[type] || []).length > 0)
          .map(type => {
            const list = byType[type] || []
            return {
              id: type,
              content: (
                <div className="card">
                  <div className="card-title" style={{ textTransform: 'capitalize' }}>
                    {type}kategorier
                    <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 8, fontSize: 12 }}>
                      {list.filter(c => c.active).length} aktive
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table style={hasAnyWidth ? { tableLayout: 'fixed' } : {}}>
                      <thead>
                        <tr>
                          {prefs.orderedVisible.map(col => (
                            <ResizableTh key={col.key} colKey={col.key} prefs={prefs}>{col.label}</ResizableTh>
                          ))}
                          {isAdmin && <th style={{ width: 180, whiteSpace: 'nowrap' }}>Handlinger</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(c => (
                          <tr key={c.id} style={{ opacity: c.active ? 1 : 0.55 }}>
                            {prefs.orderedVisible.map(col => renderCell(c, col.key))}
                            {isAdmin && (
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <div className="flex gap-8">
                                  <button className="btn btn-sm btn-secondary" style={{ minWidth: 90 }}
                                    onClick={() => { setEditCat(c); setShowModal(true) }}>✎ Rediger</button>
                                  <button className="btn btn-sm btn-danger" disabled={deleting === c.id}
                                    onClick={() => deleteCategory(c)}>{deleting === c.id ? '…' : 'Slett'}</button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            }
          })
      } />
    </div>
  )
}
