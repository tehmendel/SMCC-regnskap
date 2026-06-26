import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, fmtDate } from '../lib/format'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { ColumnPicker } from '../components/ColumnPicker'

const COLUMNS = [
  { key: 'name',              label: 'Leverandør' },
  { key: 'category',          label: 'Kategori' },
  { key: 'transaction_count', label: 'Transaksjoner' },
  { key: 'total_amount',      label: 'Totalt beløp' },
  { key: 'last_seen',         label: 'Sist sett' },
  { key: 'confidence',        label: 'Konfidens' },
  { key: 'normalized_name',   label: 'Normalisert navn', default: false },
  { key: 'actions',           label: 'Handlinger' },
]

export default function Vendors() {
  const prefs = useColumnPrefs('vendors', COLUMNS)
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

  async function deleteVendor(v) {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', v.id)
    const msg = count > 0
      ? `«${v.name}» er knyttet til ${count} transaksjon${count !== 1 ? 'er' : ''}.\nDisse mister leverandørkoblingen. Vil du likevel slette?`
      : `Slett leverandøren «${v.name}»?`
    if (!confirm(msg)) return
    await supabase.from('vendors').delete().eq('id', v.id)
    load()
  }

  async function saveVendor(v) {
    const name = edits[v.id]?.name ?? v.name
    const catId = edits[v.id]?.suggested_category_id !== undefined
      ? edits[v.id].suggested_category_id
      : v.suggested_category_id
    await supabase.from('vendors').update({
      name: name.trim(),
      normalized_name: name.trim().toLowerCase().replace(/[^a-z0-9æøå]/g, ''),
      suggested_category_id: catId || null,
      updated_at: new Date().toISOString(),
    }).eq('id', v.id)
    setEdits(prev => { const n = { ...prev }; delete n[v.id]; return n })
    load()
  }

  const filtered = vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))

  function confColor(c) {
    if (c >= 0.95) return 'var(--green)'
    if (c >= 0.75) return 'var(--yellow)'
    return 'var(--red)'
  }

  const { isVisible } = prefs

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Leverandørregister</div>
          <div className="page-sub">{vendors.length} leverandører – bygges automatisk fra transaksjoner</div>
        </div>
      </div>

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
                        <input className="form-input" style={{ fontSize: 13, padding: '3px 8px', minWidth: 180 }}
                          value={getEdit(v, 'name') ?? v.name}
                          onChange={e => setEdit(v.id, 'name', e.target.value)} />
                      </td>
                      <td>
                        <select className="form-select" style={{ fontSize: 12, padding: '3px 8px' }}
                          value={getEdit(v, 'suggested_category_id') ?? (v.suggested_category_id || '')}
                          onChange={e => setEdit(v.id, 'suggested_category_id', e.target.value || null)}>
                          <option value="">Ingen kategori</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                          ))}
                        </select>
                      </td>
                      <td className="text-right text-mono" style={{ fontSize: 12 }}>{v.transaction_count}</td>
                      <td className="text-right text-mono" style={{ fontSize: 12 }}>{fmt(v.total_amount)}</td>
                      <td>
                        <div className="flex gap-8" style={{ whiteSpace: 'nowrap' }}>
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

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input className="form-input" style={{ maxWidth: 360 }} placeholder="Søk leverandør…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <ColumnPicker prefs={prefs} style={{ marginLeft: 'auto' }} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {isVisible('name')              && <th>Leverandør</th>}
                {isVisible('category')          && <th>Kategori</th>}
                {isVisible('transaction_count') && <th className="text-right">Transaksjoner</th>}
                {isVisible('total_amount')      && <th className="text-right">Totalt beløp</th>}
                {isVisible('last_seen')         && <th>Sist sett</th>}
                {isVisible('confidence')        && <th>Konfidens</th>}
                {isVisible('normalized_name')   && <th>Normalisert</th>}
                {isVisible('actions')           && <th style={{ width: 160 }} />}
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const hasEdits = !!edits[v.id]
                return (
                  <tr key={v.id}>
                    {isVisible('name') && (
                      <td>
                        <input className="form-input" style={{ fontSize: 13, padding: '3px 8px', minWidth: 180 }}
                          value={getEdit(v, 'name') ?? v.name}
                          onChange={e => setEdit(v.id, 'name', e.target.value)} />
                      </td>
                    )}
                    {isVisible('category') && (
                      <td>
                        <select className="form-select" style={{ fontSize: 12, padding: '3px 8px' }}
                          value={getEdit(v, 'suggested_category_id') ?? (v.suggested_category_id || '')}
                          onChange={e => setEdit(v.id, 'suggested_category_id', e.target.value || null)}>
                          <option value="">Ingen kategori</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                          ))}
                        </select>
                      </td>
                    )}
                    {isVisible('transaction_count') && (
                      <td className="text-right text-mono">{v.transaction_count}</td>
                    )}
                    {isVisible('total_amount') && (
                      <td className="text-right text-mono" style={{ fontSize: 12 }}>{fmt(v.total_amount)}</td>
                    )}
                    {isVisible('last_seen') && (
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(v.last_seen)}</td>
                    )}
                    {isVisible('confidence') && (
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
                    )}
                    {isVisible('normalized_name') && (
                      <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                        {v.normalized_name}
                      </td>
                    )}
                    {isVisible('actions') && (
                      <td>
                        <div className="flex gap-8" style={{ whiteSpace: 'nowrap' }}>
                          {hasEdits && (
                            <button className="btn btn-sm btn-primary" onClick={() => saveVendor(v)}>Lagre</button>
                          )}
                          <button className="btn btn-sm btn-danger" onClick={() => deleteVendor(v)}>Slett</button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
