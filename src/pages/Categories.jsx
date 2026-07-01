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

const MATCH_LABELS = { contains: 'inneholder', starts_with: 'starter med', exact: 'eksakt match' }
const TYPE_LABELS   = { inntekt: 'Inntekt', utgift: 'Utgift', '': 'Begge' }

function RuleModal({ rule, categories, onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    match_value:      rule?.match_value      || '',
    match_type:       rule?.match_type       || 'contains',
    transaction_type: rule?.transaction_type || '',
    category_id:      rule?.category_id      || '',
    priority:         rule?.priority         ?? 50,
    active:           rule?.active           ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (!form.match_value.trim()) { setError('Mønster er påkrevd'); return }
    if (!form.category_id)        { setError('Kategori er påkrevd'); return }
    setSaving(true)
    setError('')
    const payload = {
      match_value:      form.match_value.toLowerCase().trim(),
      match_type:       form.match_type,
      transaction_type: form.transaction_type || null,
      category_id:      form.category_id,
      priority:         Number(form.priority),
      active:           form.active,
    }
    const res = rule
      ? await supabase.from('categorization_rules').update(payload).eq('id', rule.id)
      : await supabase.from('categorization_rules').insert({ ...payload, created_by: profile?.id })
    if (res.error) setError(res.error.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  const inntektCats = categories.filter(c => c.type === 'inntekt' && c.active)
  const utgiftCats  = categories.filter(c => c.type === 'utgift'  && c.active)
  const filteredCats = form.transaction_type === 'inntekt' ? inntektCats
    : form.transaction_type === 'utgift' ? utgiftCats
    : [...inntektCats, ...utgiftCats]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-title">{rule ? 'Rediger regel' : 'Ny kategoriseringsregel'}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          Regler matcher mot transaksjonens beskrivelse og setter kategori automatisk.
          Lavere prioritet = kjøres først.
        </div>
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">Mønster (tekst å søke etter) <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="form-input" placeholder="f.eks. avtalegiro lyse marked"
              value={form.match_value}
              onChange={e => setForm(f => ({ ...f, match_value: e.target.value }))} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Skrives med små bokstaver — sammenlignes mot beskrivelse i liten bokstav
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Matchtype</label>
              <select className="form-select" value={form.match_type}
                onChange={e => setForm(f => ({ ...f, match_type: e.target.value }))}>
                <option value="contains">Inneholder</option>
                <option value="starts_with">Starter med</option>
                <option value="exact">Eksakt match</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Transaksjonstype</label>
              <select className="form-select" value={form.transaction_type}
                onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value, category_id: '' }))}>
                <option value="">Begge</option>
                <option value="inntekt">Kun inntekt</option>
                <option value="utgift">Kun utgift</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Prioritet</label>
              <input className="form-input" type="number" min="1" max="999"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Kategori <span style={{ color: 'var(--red)' }}>*</span></label>
            <select className="form-select" value={form.category_id}
              onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
              <option value="">Velg kategori…</option>
              {form.transaction_type === '' && inntektCats.length > 0 && (
                <optgroup label="Inntekt">
                  {inntektCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              )}
              {form.transaction_type === '' && utgiftCats.length > 0 && (
                <optgroup label="Utgift">
                  {utgiftCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              )}
              {form.transaction_type !== '' && filteredCats.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              Aktiv
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

function RulesTab({ categories }) {
  const { isAdmin } = useAuth()
  const [rules, setRules] = useState([])
  const [systemRules, setSystemRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editRule, setEditRule] = useState(null)
  const [search, setSearch] = useState('')

  const catById = Object.fromEntries(categories.map(c => [c.id, c]))

  async function load() {
    const [{ data: rulesData }, { data: ratesData }] = await Promise.all([
      supabase.from('categorization_rules').select('*').not('category_id', 'is', null)
        .order('priority').order('match_value'),
      supabase.from('fee_rates').select('*').order('effective_from', { ascending: false }),
    ])
    setRules(rulesData || [])

    // Bygg virtuelle systemregler fra fee_rates
    const today = new Date().toISOString().slice(0, 10)
    const getRate = (feeType, field) => {
      const r = (ratesData || []).filter(r => r.fee_type === feeType && r.effective_from <= today)
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]
      return r ? parseFloat(r[field]) : null
    }
    const monthlyRate     = getRate('membership', 'amount_monthly')
    const yearlyRate      = getRate('membership', 'amount_yearly')
    const reisekasseRate  = getRate('reisekasse',  'amount_monthly')

    const membershipCat  = categories.find(c => c.code === 'membership_smcc')
    const reisekasseCat  = categories.find(c => c.code === 'membership_reisekasse')

    const sysCats = []
    if (membershipCat) sysCats.push({
      _system: true, id: '__sys_membership',
      match_value: `Navn fra medlemsregister + ${monthlyRate ?? '?'} kr (monthly) / ${yearlyRate ?? '?'} kr (yearly)`,
      match_type: 'member_name_and_rate',
      transaction_type: 'inntekt',
      category_id: membershipCat.id,
      active: true,
      priority: null,
    })
    if (reisekasseCat) sysCats.push({
      _system: true, id: '__sys_reisekasse',
      match_value: `Navn fra medlemsregister + ${reisekasseRate ?? '?'} kr (reisekasse sats)`,
      match_type: 'member_name_and_rate',
      transaction_type: 'inntekt',
      category_id: reisekasseCat.id,
      active: true,
      priority: null,
    })
    setSystemRules(sysCats)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteRule(rule) {
    if (!confirm(`Slett regel «${rule.match_value}»?`)) return
    await supabase.from('categorization_rules').delete().eq('id', rule.id)
    load()
  }

  async function toggleActive(rule) {
    await supabase.from('categorization_rules').update({ active: !rule.active }).eq('id', rule.id)
    load()
  }

  const filtered = rules.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.match_value.includes(q) || (catById[r.category_id]?.name || '').toLowerCase().includes(q)
  })
  const filteredSys = systemRules.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.match_value.toLowerCase().includes(q) || (catById[r.category_id]?.name || '').toLowerCase().includes(q)
  })

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      {showModal && (
        <RuleModal
          rule={editRule}
          categories={categories}
          onClose={() => { setShowModal(false); setEditRule(null) }}
          onSaved={load}
        />
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="Søk mønster eller kategori…"
          style={{ maxWidth: 300 }} value={search} onChange={e => setSearch(e.target.value)} />
        <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>
          {filtered.length} regel{filtered.length !== 1 ? 'er' : ''} — kjøres i prioritetsrekkefølge (lavest nummer = først)
        </span>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { setEditRule(null); setShowModal(true) }}>
            + Ny regel
          </button>
        )}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">◈</div>
            <div className="empty-state-text">Ingen regler funnet</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Prior.</th>
                  <th>Mønster</th>
                  <th style={{ width: 120 }}>Matchtype</th>
                  <th style={{ width: 90 }}>Type</th>
                  <th>Kategori</th>
                  <th style={{ width: 80 }}>Status</th>
                  {isAdmin && <th style={{ width: 150 }}>Handlinger</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const cat = catById[r.category_id]
                  return (
                    <tr key={r.id} style={{ opacity: r.active ? 1 : 0.45 }}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                        {r.priority}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.match_value}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {MATCH_LABELS[r.match_type] || r.match_type}
                      </td>
                      <td>
                        {r.transaction_type
                          ? <span className={`badge badge-${r.transaction_type}`}>{r.transaction_type}</span>
                          : <span style={{ fontSize: 11, color: 'var(--muted)' }}>begge</span>}
                      </td>
                      <td>
                        {cat
                          ? <span>{cat.name} <span style={{ fontSize: 11, color: 'var(--muted)' }}>({cat.type})</span></span>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge ${r.active ? 'badge-approved' : 'badge-pending'}`}>
                          {r.active ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="flex gap-8">
                            <button className="btn btn-sm btn-secondary"
                              onClick={() => { setEditRule(r); setShowModal(true) }}>Rediger</button>
                            <button className="btn btn-sm btn-secondary"
                              onClick={() => toggleActive(r)}>{r.active ? 'Deaktiver' : 'Aktiver'}</button>
                            <button className="btn btn-sm btn-danger"
                              onClick={() => deleteRule(r)}>Slett</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {filteredSys.map(r => {
                  const cat = catById[r.category_id]
                  return (
                    <tr key={r.id} style={{ background: 'var(--surface-2, rgba(255,255,255,0.03))', fontStyle: 'italic' }}>
                      <td style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>—</td>
                      <td style={{ fontSize: 12 }}>
                        <span title="Dynamisk regel — oppdateres automatisk fra medlemsregister og satstabell">
                          {r.match_value}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>Dynamisk</td>
                      <td><span className="badge badge-inntekt">inntekt</span></td>
                      <td>
                        {cat
                          ? <span>{cat.name} <span style={{ fontSize: 11, color: 'var(--muted)' }}>({cat.type})</span></span>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        <span className="badge" style={{ background: 'var(--surface-3,#444)', color: 'var(--muted)' }}>
                          System
                        </span>
                      </td>
                      {isAdmin && <td />}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
  const [activeTab, setActiveTab] = useState('kategorier')

  async function load() {
    const { data } = await supabase.from('categories').select('*').order('type').order('name')
    setCategories(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteCategory(cat) {
    if (cat.code) {
      alert(`«${cat.name}» er en systemkategori og kan ikke slettes.`)
      return
    }
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
      case 'name':        return (
        <td key={key} style={{ fontWeight: 500 }}>
          {c.name}
          {c.code && (
            <span title={`Systemkategori — kan ikke slettes (kode: ${c.code})`}
              style={{ marginLeft: 7, fontSize: 10, padding: '1px 6px', background: 'var(--surface-3,#444)', color: 'var(--muted)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontWeight: 400, verticalAlign: 'middle' }}>
              system
            </span>
          )}
        </td>
      )
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
          {activeTab === 'kategorier' && (
            <>
              <ColumnPicker prefs={prefs} />
              {isAdmin && (
                <button className="btn btn-primary" onClick={() => { setEditCat(null); setShowModal(true) }}>
                  + Ny kategori
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex gap-8" style={{ marginBottom: 20 }}>
        {['kategorier', 'regler'].map(tab => (
          <button key={tab} className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'regler' && (
        <RulesTab categories={categories} />
      )}

      {activeTab === 'kategorier' && (
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
                                    {!c.code && (
                                      <button className="btn btn-sm btn-danger" disabled={deleting === c.id}
                                        onClick={() => deleteCategory(c)}>{deleting === c.id ? '…' : 'Slett'}</button>
                                    )}
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
      )}
    </div>
  )
}
