import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, fmtDate } from '../lib/format'

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [pending, setPending] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [edits, setEdits] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const [vRes, cRes] = await Promise.all([
      supabase.from('vendors').select('*, categories(name)').order('transaction_count', { ascending: false }),
      supabase.from('categories').select('*').eq('active', true).order('name'),
    ])
    const all = vRes.data || []
    setVendors(all.filter(v => v.approved !== false))
    setPending(all.filter(v => v.approved === false))
    setCategories(cRes.data || [])
    setLoading(false)
  }

  function setEdit(id, field, value) {
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }))
  }

  function getEdit(vendor, field) {
    return edits[vendor.id]?.[field] !== undefined ? edits[vendor.id][field] : vendor[field]
  }

  async function approveVendor(v) {
    const name = getEdit(v, 'name') || v.name
    const catId = getEdit(v, 'suggested_category_id') !== undefined
      ? getEdit(v, 'suggested_category_id')
      : v.suggested_category_id
    await supabase.from('vendors').update({
      approved: true,
      name: name.trim(),
      normalized_name: name.trim().toLowerCase().replace(/[^a-z0-9æøå]/g, ''),
      suggested_category_id: catId || null,
      updated_at: new Date().toISOString(),
    }).eq('id', v.id)
    setEdits(prev => { const n = { ...prev }; delete n[v.id]; return n })
    load()
  }

  async function rejectVendor(id) {
    await supabase.from('vendors').delete().eq('id', id)
    load()
  }

  const filtered = vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))

  function confColor(c) {
    if (c >= 0.95) return 'var(--green)'
    if (c >= 0.75) return 'var(--yellow)'
    return 'var(--red)'
  }

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Leverandørregister</div>
          <div className="page-sub">{vendors.length} leverandører – bygges automatisk fra transaksjoner</div>
        </div>
      </div>

      {/* Pending approval */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontWeight: 500 }}>Venter godkjenning</span>
            <span style={{
              background: 'var(--yellow)', color: '#000', borderRadius: 10,
              padding: '1px 8px', fontSize: 11, fontWeight: 600,
            }}>{pending.length}</span>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Leverandørnavn</th>
                    <th>Kategori</th>
                    <th className="text-right">Transaksjoner</th>
                    <th className="text-right">Totalt</th>
                    <th>Handlinger</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(v => (
                    <tr key={v.id}>
                      <td>
                        <input
                          className="form-input"
                          style={{ fontSize: 13, padding: '3px 8px', minWidth: 180 }}
                          value={getEdit(v, 'name') ?? v.name}
                          onChange={e => setEdit(v.id, 'name', e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="form-select"
                          style={{ fontSize: 12, padding: '3px 8px' }}
                          value={getEdit(v, 'suggested_category_id') ?? (v.suggested_category_id || '')}
                          onChange={e => setEdit(v.id, 'suggested_category_id', e.target.value || null)}
                        >
                          <option value="">Ingen kategori</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                          ))}
                        </select>
                      </td>
                      <td className="text-right text-mono" style={{ fontSize: 12 }}>{v.transaction_count}</td>
                      <td className="text-right text-mono" style={{ fontSize: 12 }}>{fmt(v.total_amount)}</td>
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-sm btn-primary" onClick={() => approveVendor(v)}>Godkjenn</button>
                          <button className="btn btn-sm btn-danger" onClick={() => rejectVendor(v.id)}>Avvis</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="form-group" style={{ maxWidth: 360, marginBottom: 20 }}>
        <input className="form-input" placeholder="Søk leverandør…" value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Approved vendors */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Leverandør</th>
                <th>Foreslått kategori</th>
                <th>Avdeling</th>
                <th className="text-right">Transaksjoner</th>
                <th className="text-right">Totalt beløp</th>
                <th>Sist sett</th>
                <th>Konfidens</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 500 }}>{v.name}</td>
                  <td style={{ color: 'var(--dim)' }}>{v.categories?.name || '—'}</td>
                  <td style={{ color: 'var(--dim)' }}>{v.suggested_department || '—'}</td>
                  <td className="text-right text-mono">{v.transaction_count}</td>
                  <td className="text-right text-mono" style={{ fontSize: 12 }}>{fmt(v.total_amount)}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(v.last_seen)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 48, height: 4, background: 'var(--graphite)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${v.confidence * 100}%`, height: '100%', background: confColor(v.confidence), borderRadius: 2 }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: confColor(v.confidence) }}>
                        {(v.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
