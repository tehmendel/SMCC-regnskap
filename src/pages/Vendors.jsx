import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, fmtDate } from '../lib/format'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { ColumnPicker } from '../components/ColumnPicker'
import { ResizableTh } from '../components/ResizableTh'

const COLUMNS = [
  { key: 'name',              label: 'Leverandør' },
  { key: 'category',          label: 'Kategori' },
  { key: 'transaction_count', label: 'Transaksjoner', align: 'right' },
  { key: 'total_amount',      label: 'Totalt beløp',  align: 'right' },
  { key: 'last_seen',         label: 'Sist sett' },
  { key: 'confidence',        label: 'Konfidens' },
  { key: 'auto_approve',      label: 'Auto-godkjenn' },
  { key: 'normalized_name',   label: 'Normalisert navn', default: false },
]

function MergeModal({ primary, vendors, onClose, onMerged }) {
  const [absorbId, setAbsorbId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const others = vendors.filter(v => v.id !== primary.id)
  const absorb = vendors.find(v => v.id === absorbId)

  async function doMerge() {
    if (!absorbId) return
    setSaving(true)
    setError('')
    // Re-link any transactions from absorbed vendor to primary
    await supabase.from('transactions').update({ vendor_id: primary.id }).eq('vendor_id', absorbId)
    // Sum stats onto primary
    await supabase.from('vendors').update({
      transaction_count: primary.transaction_count + (absorb?.transaction_count || 0),
      total_amount: Number(primary.total_amount) + Number(absorb?.total_amount || 0),
      confidence: Math.min(1, Math.max(Number(primary.confidence), Number(absorb?.confidence || 0))),
      last_seen: primary.last_seen > (absorb?.last_seen || '') ? primary.last_seen : absorb?.last_seen,
      updated_at: new Date().toISOString(),
    }).eq('id', primary.id)
    // Delete absorbed
    const { error: err } = await supabase.from('vendors').delete().eq('id', absorbId)
    if (err) { setError(err.message); setSaving(false); return }
    onMerged()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-title">Slå sammen leverandører</div>
        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Behold (primær):</div>
          <div style={{ padding: '8px 12px', background: 'var(--surface)', borderRadius: 6, fontWeight: 500 }}>
            {primary.name}
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
              {primary.transaction_count} transaksjoner · {fmt(primary.total_amount)}
            </span>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Absorber denne inn i primær (slettes etter sammenslåing):</label>
          <select className="form-select" value={absorbId} onChange={e => setAbsorbId(e.target.value)}>
            <option value="">Velg leverandør å slette…</option>
            {others.map(v => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.transaction_count} transaksjoner, {fmt(v.total_amount)})
              </option>
            ))}
          </select>
        </div>

        {absorb && (
          <div style={{ padding: '8px 12px', background: 'var(--graphite)', borderRadius: 6, fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
            Resultat: «{primary.name}» får{' '}
            <strong style={{ color: 'var(--white)' }}>
              {primary.transaction_count + absorb.transaction_count} transaksjoner · {fmt(Number(primary.total_amount) + Number(absorb.total_amount))}
            </strong>
            {'. '}Alle transaksjoner koblet til «{absorb.name}» flyttes hit. «{absorb.name}» slettes.
          </div>
        )}

        <div className="flex gap-8 mt-16">
          <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
          <button className="btn btn-danger" disabled={!absorbId || saving} onClick={doMerge}>
            {saving ? 'Slår sammen…' : 'Slå sammen og slett duplikat'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Vendors() {
  const prefs = useColumnPrefs('vendors', COLUMNS)
  const [vendors, setVendors] = useState([])
  const [pending, setPending] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [edits, setEdits] = useState({})
  const [mergeVendor, setMergeVendor] = useState(null)

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
    const catId = getEdit(v, 'suggested_category_id') !== undefined ? getEdit(v, 'suggested_category_id') : v.suggested_category_id
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
    const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('vendor_id', v.id)
    const msg = count > 0
      ? `«${v.name}» er koblet til ${count} transaksjon${count !== 1 ? 'er' : ''}.\nDisse mister leverandørkoblingen. Vil du likevel slette?`
      : `Slett leverandøren «${v.name}»?`
    if (!confirm(msg)) return
    await supabase.from('vendors').delete().eq('id', v.id)
    load()
  }

  async function saveVendor(v) {
    const name = edits[v.id]?.name ?? v.name
    const catId = edits[v.id]?.suggested_category_id !== undefined ? edits[v.id].suggested_category_id : v.suggested_category_id
    await supabase.from('vendors').update({
      name: name.trim(),
      normalized_name: name.trim().toLowerCase().replace(/[^a-z0-9æøå]/g, ''),
      suggested_category_id: catId || null,
      updated_at: new Date().toISOString(),
    }).eq('id', v.id)
    setEdits(prev => { const n = { ...prev }; delete n[v.id]; return n })
    load()
  }

  async function toggleAutoApprove(v) {
    await supabase.from('vendors').update({ auto_approve: !v.auto_approve, updated_at: new Date().toISOString() }).eq('id', v.id)
    load()
  }

  const filtered = vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))

  function confColor(c) {
    if (c >= 0.95) return 'var(--green)'
    if (c >= 0.75) return 'var(--yellow)'
    return '#e87474'
  }

  function renderCell(v, key) {
    const hasEdits = !!edits[v.id]
    switch (key) {
      case 'name':
        return (
          <td key={key}>
            <input className="form-input" style={{ fontSize: 13, padding: '3px 8px', minWidth: 160 }}
              value={getEdit(v, 'name') ?? v.name}
              onChange={e => setEdit(v.id, 'name', e.target.value)} />
          </td>
        )
      case 'category':
        return (
          <td key={key}>
            <select className="form-select" style={{ fontSize: 12, padding: '3px 8px' }}
              value={getEdit(v, 'suggested_category_id') ?? (v.suggested_category_id || '')}
              onChange={e => setEdit(v.id, 'suggested_category_id', e.target.value || null)}>
              <option value="">Ingen</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
          </td>
        )
      case 'transaction_count':
        return <td key={key} className="text-right text-mono" style={{ fontSize: 12 }}>{v.transaction_count}</td>
      case 'total_amount':
        return <td key={key} className="text-right text-mono" style={{ fontSize: 12 }}>{fmt(v.total_amount)}</td>
      case 'last_seen':
        return <td key={key} style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(v.last_seen)}</td>
      case 'confidence':
        return (
          <td key={key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 44, height: 4, background: 'var(--graphite)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${v.confidence * 100}%`, height: '100%', background: confColor(v.confidence), borderRadius: 2 }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: confColor(v.confidence) }}>
                {(v.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </td>
        )
      case 'auto_approve':
        return (
          <td key={key}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={v.auto_approve || false} onChange={() => toggleAutoApprove(v)} />
              <span style={{ fontSize: 11, color: v.auto_approve ? 'var(--green)' : 'var(--muted)' }}>
                {v.auto_approve ? 'Ja' : 'Nei'}
              </span>
            </label>
          </td>
        )
      case 'normalized_name':
        return <td key={key} style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{v.normalized_name}</td>
      default:
        return <td key={key} />
    }
  }

  const hasAnyWidth = prefs.orderedVisible.some(c => prefs.getWidth(c.key))

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      {mergeVendor && (
        <MergeModal
          primary={mergeVendor}
          vendors={vendors}
          onClose={() => setMergeVendor(null)}
          onMerged={() => { setMergeVendor(null); load() }}
        />
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Leverandørregister</div>
          <div className="page-sub">
            {vendors.length} leverandører · {vendors.filter(v => v.auto_approve).length} med auto-godkjenning
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontWeight: 500 }}>Venter godkjenning</span>
            <span style={{ background: 'var(--yellow)', color: '#000', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
              {pending.length}
            </span>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Leverandørnavn</th><th>Kategori</th>
                    <th className="text-right">Transaksjoner</th><th className="text-right">Totalt</th>
                    <th>Handlinger</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(v => (
                    <tr key={v.id}>
                      <td>
                        <input className="form-input" style={{ fontSize: 13, padding: '3px 8px', minWidth: 180 }}
                          value={getEdit(v, 'name') ?? v.name} onChange={e => setEdit(v.id, 'name', e.target.value)} />
                      </td>
                      <td>
                        <select className="form-select" style={{ fontSize: 12, padding: '3px 8px' }}
                          value={getEdit(v, 'suggested_category_id') ?? (v.suggested_category_id || '')}
                          onChange={e => setEdit(v.id, 'suggested_category_id', e.target.value || null)}>
                          <option value="">Ingen kategori</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                        </select>
                      </td>
                      <td className="text-right text-mono" style={{ fontSize: 12 }}>{v.transaction_count}</td>
                      <td className="text-right text-mono" style={{ fontSize: 12 }}>{fmt(v.total_amount)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
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

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <input className="form-input" style={{ maxWidth: 320 }} placeholder="Søk leverandør…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <ColumnPicker prefs={prefs} style={{ marginLeft: 'auto' }} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table style={hasAnyWidth ? { tableLayout: 'fixed' } : {}}>
            <thead>
              <tr>
                {prefs.orderedVisible.map(col => (
                  <ResizableTh key={col.key} colKey={col.key} prefs={prefs}
                    className={col.align === 'right' ? 'text-right' : ''}>
                    {col.label}
                  </ResizableTh>
                ))}
                <th style={{ width: 180, whiteSpace: 'nowrap' }}>Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const hasEdits = !!edits[v.id]
                return (
                  <tr key={v.id}>
                    {prefs.orderedVisible.map(col => renderCell(v, col.key))}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div className="flex gap-8">
                        {hasEdits && (
                          <button className="btn btn-sm btn-primary" onClick={() => saveVendor(v)}>Lagre</button>
                        )}
                        <button className="btn btn-sm btn-secondary" onClick={() => setMergeVendor(v)}>⇢ Slå sammen</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteVendor(v)}>Slett</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--surface)', borderRadius: 6, fontSize: 12, color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--dim)' }}>Auto-godkjenning:</strong>{' '}
        Når aktivert for en leverandør godkjennes transaksjoner fra dem automatisk ved bankimport.
        Konfidensscore øker automatisk (+2%) hver gang en transaksjon fra leverandøren godkjennes manuelt.
      </div>
    </div>
  )
}
