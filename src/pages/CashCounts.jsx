import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtDate } from '../lib/format'

const DENOMS = [
  { key: 'denomination_1000', label: '1000-lapp', value: 1000 },
  { key: 'denomination_500',  label: '500-lapp',  value: 500 },
  { key: 'denomination_200',  label: '200-lapp',  value: 200 },
  { key: 'denomination_100',  label: '100-lapp',  value: 100 },
  { key: 'denomination_50',   label: '50-lapp',   value: 50 },
  { key: 'denomination_20',   label: '20 kr',     value: 20 },
  { key: 'denomination_10',   label: '10 kr',     value: 10 },
  { key: 'denomination_5',    label: '5 kr',      value: 5 },
  { key: 'denomination_1',    label: '1 kr',      value: 1 },
]

function calcTotal(form) {
  return DENOMS.reduce((s, d) => s + (Number(form[d.key]) || 0) * d.value, 0)
    + (Number(form.misc_coins) || 0)
}

const EMPTY_FORM = {
  count_date: new Date().toISOString().split('T')[0],
  label: '',
  arrangement_id: '',
  denomination_1000: '', denomination_500: '', denomination_200: '',
  denomination_100: '', denomination_50: '', denomination_20: '',
  denomination_10: '', denomination_5: '', denomination_1: '',
  misc_coins: '',
  notes: '',
}

function CountModal({ count, arrangements, onClose, onSaved, profile }) {
  const [form, setForm] = useState(count ? {
    count_date: count.count_date,
    label: count.label || '',
    arrangement_id: count.arrangement_id || '',
    denomination_1000: count.denomination_1000 || '',
    denomination_500: count.denomination_500 || '',
    denomination_200: count.denomination_200 || '',
    denomination_100: count.denomination_100 || '',
    denomination_50: count.denomination_50 || '',
    denomination_20: count.denomination_20 || '',
    denomination_10: count.denomination_10 || '',
    denomination_5: count.denomination_5 || '',
    denomination_1: count.denomination_1 || '',
    misc_coins: count.misc_coins || '',
    notes: count.notes || '',
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const total = calcTotal(form)

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      count_date: form.count_date,
      label: form.label || null,
      arrangement_id: form.arrangement_id || null,
      denomination_1000: Number(form.denomination_1000) || 0,
      denomination_500:  Number(form.denomination_500)  || 0,
      denomination_200:  Number(form.denomination_200)  || 0,
      denomination_100:  Number(form.denomination_100)  || 0,
      denomination_50:   Number(form.denomination_50)   || 0,
      denomination_20:   Number(form.denomination_20)   || 0,
      denomination_10:   Number(form.denomination_10)   || 0,
      denomination_5:    Number(form.denomination_5)    || 0,
      denomination_1:    Number(form.denomination_1)    || 0,
      misc_coins:        Number(form.misc_coins)        || 0,
      notes:             form.notes || null,
      total,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    }
    let res
    if (count) {
      res = await supabase.from('cash_counts').update(payload).eq('id', count.id)
    } else {
      res = await supabase.from('cash_counts').insert({ ...payload, created_by: profile.id })
    }
    if (res.error) setError(res.error.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-title">{count ? 'Rediger telling' : 'Ny kassetelling'}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={save}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Dato <span style={{ color: 'var(--red)' }}>*</span></label>
              <input className="form-input" type="date" value={form.count_date}
                onChange={e => set('count_date', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Merknad / label</label>
              <input className="form-input" value={form.label}
                placeholder="F.eks. «Før FT26»"
                onChange={e => set('label', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Arrangement (valgfritt)</label>
            <select className="form-select" value={form.arrangement_id}
              onChange={e => set('arrangement_id', e.target.value)}>
              <option value="">— Ingen —</option>
              {arrangements.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Denomination grid */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>Valører</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {DENOMS.map(d => (
                <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--dim)', width: 68, flexShrink: 0 }}>{d.label}</label>
                  <input
                    className="form-input"
                    type="number" min="0" step="1"
                    style={{ width: '100%', padding: '5px 8px', fontSize: 13 }}
                    value={form[d.key]}
                    onChange={e => set(d.key, e.target.value)}
                    placeholder="0"
                  />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--dim)', width: 68, flexShrink: 0 }}>Smårusk</label>
                <input
                  className="form-input"
                  type="number" min="0" step="0.01"
                  style={{ width: '100%', padding: '5px 8px', fontSize: 13 }}
                  value={form.misc_coins}
                  onChange={e => set('misc_coins', e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Live total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Beregnet total:</span>
            <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
              {fmt(total)}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Kommentar</label>
            <textarea className="form-textarea" rows={2} value={form.notes}
              onChange={e => set('notes', e.target.value)} />
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

export default function CashCounts() {
  const { isKasserer, isAdmin, profile } = useAuth()
  const [counts, setCounts] = useState([])
  const [arrangements, setArrangements] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editCount, setEditCount] = useState(null)
  const [expanded, setExpanded] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const [cRes, aRes] = await Promise.all([
      supabase.from('cash_counts')
        .select('*, arrangements(name)')
        .order('count_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('arrangements').select('id, name').order('start_date', { ascending: false }),
    ])
    setCounts(cRes.data || [])
    setArrangements(aRes.data || [])
    setLoading(false)
  }

  async function deleteCount(id) {
    if (!confirm('Slett denne tellingen?')) return
    await supabase.from('cash_counts').delete().eq('id', id)
    load()
  }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const latestTotal = counts.length > 0 ? (counts[0].total || calcTotal(counts[0])) : 0

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      {showModal && (
        <CountModal
          count={editCount}
          arrangements={arrangements}
          profile={profile}
          onClose={() => { setShowModal(false); setEditCount(null) }}
          onSaved={load}
        />
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Kontantbeholdning</div>
          <div className="page-sub">
            {counts.length} tellinger registrert
          </div>
        </div>
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <div className="stat-box" style={{ margin: 0, minWidth: 160 }}>
            <div className="stat-label">Siste telling</div>
            <div className="stat-value positive">{fmt(latestTotal)}</div>
            {counts[0] && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fmtDate(counts[0].count_date)}</div>}
          </div>
          {isKasserer && (
            <button className="btn btn-primary" onClick={() => { setEditCount(null); setShowModal(true) }}>
              + Ny telling
            </button>
          )}
        </div>
      </div>

      {counts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <div className="empty-state-text">Ingen tellinger registrert ennå</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {counts.map((c, i) => {
            const total = Number(c.total) || calcTotal(c)
            const prev = counts[i + 1]
            const prevTotal = prev ? (Number(prev.total) || calcTotal(prev)) : null
            const delta = prevTotal !== null ? total - prevTotal : null
            const isOpen = expanded[c.id]

            return (
              <div key={c.id} className="card" style={{ padding: 0 }}>
                {/* Header row */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
                  onClick={() => toggleExpand(c.id)}
                >
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)', minWidth: 90 }}>
                    {fmtDate(c.count_date)}
                  </span>

                  <div style={{ flex: 1 }}>
                    {c.label && <span style={{ fontSize: 13, fontWeight: 500, marginRight: 8 }}>{c.label}</span>}
                    {c.arrangements?.name && (
                      <span className="badge" style={{ background: 'rgba(232,93,38,0.15)', color: 'var(--orange)', fontSize: 10 }}>
                        {c.arrangements.name}
                      </span>
                    )}
                    {c.notes && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{c.notes}</span>}
                  </div>

                  {delta !== null && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: delta >= 0 ? 'var(--green)' : 'var(--red)', minWidth: 90, textAlign: 'right' }}>
                      {delta >= 0 ? '+' : ''}{fmt(delta)}
                    </span>
                  )}

                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--green)', minWidth: 110, textAlign: 'right' }}>
                    {fmt(total)}
                  </span>

                  <span style={{ color: 'var(--muted)', fontSize: 12, minWidth: 16 }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {/* Expanded denomination breakdown */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
                      {DENOMS.map(d => {
                        const count_val = Number(c[d.key]) || 0
                        if (count_val === 0) return null
                        return (
                          <div key={d.key} style={{ background: 'var(--surface)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{d.label}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{count_val} stk</div>
                            <div style={{ fontSize: 11, color: 'var(--green)' }}>{fmt(count_val * d.value)}</div>
                          </div>
                        )
                      })}
                      {Number(c.misc_coins) > 0 && (
                        <div style={{ background: 'var(--surface)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Smårusk</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{fmt(c.misc_coins)}</div>
                        </div>
                      )}
                    </div>
                    {isKasserer && (
                      <div className="flex gap-8">
                        <button className="btn btn-sm btn-secondary"
                          onClick={() => { setEditCount(c); setShowModal(true) }}>✎ Rediger</button>
                        {isAdmin && (
                          <button className="btn btn-sm btn-danger" onClick={() => deleteCount(c.id)}>✕ Slett</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
