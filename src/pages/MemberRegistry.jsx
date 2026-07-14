import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/format'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { ColumnPicker } from '../components/ColumnPicker'
import { CardGrid } from '../components/CardGrid'
import { ResizableTh } from '../components/ResizableTh'

const CSV_HEADERS = [
  'full_name','email','phone','gender','address','postal_code','city','country',
  'payment_type','in_reisekasse','notes','start_date','end_date','period_notes',
]

const CSV_TEMPLATE = `full_name,email,phone,gender,address,postal_code,city,country,payment_type,in_reisekasse,notes,start_date,end_date,period_notes
Ola Nordmann,ola@example.com,99999999,mann,Storgata 1,0123,Oslo,Norge,monthly,false,,01.01.2024,,
Kari Nordmann,kari@example.com,,kvinne,Lillegata 2,5020,Bergen,Norge,yearly,true,,01.01.2018,30.06.2020,Første periode
Kari Nordmann,,,,,,,,,,,01.01.2023,,Aktiv igjen`

const COLUMNS = [
  { key: 'full_name',     label: 'Navn' },
  { key: 'email',         label: 'E-post' },
  { key: 'phone',         label: 'Telefon',        default: false },
  { key: 'gender',        label: 'Kjønn',          default: false },
  { key: 'address',       label: 'Adresse',        default: false },
  { key: 'postal_code',   label: 'Postnr',         default: false },
  { key: 'city',          label: 'Sted',           default: false },
  { key: 'country',       label: 'Land',           default: false },
  { key: 'payment_type',  label: 'Betalingsform' },
  { key: 'join_date',     label: 'Første innmeldt' },
  { key: 'periods',       label: 'Perioder' },
  { key: 'in_reisekasse', label: 'Reisekassen' },
  { key: 'active',        label: 'Status' },
  { key: 'notes',         label: 'Notater',        default: false },
  { key: 'actions',       label: 'Handlinger' },
]

function isoToNor(s) {
  if (!s) return ''
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s
}

function norToIso(s) {
  if (!s) return null
  s = String(s).trim()
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function parseBool(v, def = false) {
  if (v === undefined || v === '') return def
  return v === 'true' || v === '1' || v === 'ja' || v === 'yes'
}

function parseCSV(text) {
  const clean = text.replace(/^﻿/, '').trim()
  const lines = clean.split(/\r?\n/)
  const firstLine = lines[0]
  const sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ','
  const headers = firstLine.split(sep).map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === sep && !inQ) { values.push(cur.trim()); cur = '' }
      else cur += ch
    }
    values.push(cur.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (values[i] ?? '').replace(/^"|"$/g, '') })
    return obj
  })
}

function csvCell(v) {
  const s = String(v ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function syncMemberFromPeriods(memberId) {
  const { data: periods } = await supabase
    .from('member_periods')
    .select('start_date, end_date')
    .eq('member_id', memberId)
    .order('start_date')
  if (!periods || periods.length === 0) return
  const isActive = periods.some(p => !p.end_date)
  const earliestStart = periods[0].start_date
  const lastEnd = isActive ? null
    : [...periods].sort((a, b) => (b.end_date > a.end_date ? 1 : -1))[0].end_date
  await supabase.from('members').update({
    join_date: earliestStart,
    end_date:  lastEnd,
    active:    isActive,
    updated_at: new Date().toISOString(),
  }).eq('id', memberId)
}

// --- PeriodsSection ----------------------------------------------------------

function PeriodsSection({ memberId, onChanged }) {
  const [periods, setPeriods] = useState([])
  const [adding, setAdding]   = useState(false)
  const [editId, setEditId]   = useState(null)
  const [form, setForm]       = useState({ start_date: '', end_date: '', notes: '' })
  const [saving, setSaving]   = useState(false)

  useEffect(() => { loadPeriods() }, [memberId])

  async function loadPeriods() {
    const { data } = await supabase
      .from('member_periods').select('*').eq('member_id', memberId).order('start_date')
    setPeriods(data || [])
  }

  function startAdd() {
    setForm({ start_date: '', end_date: '', notes: '' })
    setEditId(null)
    setAdding(true)
  }

  function startEdit(p) {
    setForm({ start_date: p.start_date || '', end_date: p.end_date || '', notes: p.notes || '' })
    setEditId(p.id)
    setAdding(true)
  }

  async function savePeriod() {
    if (!form.start_date) return
    setSaving(true)
    if (editId) {
      await supabase.from('member_periods').update({
        start_date: form.start_date,
        end_date:   form.end_date || null,
        notes:      form.notes || null,
      }).eq('id', editId)
    } else {
      await supabase.from('member_periods').insert({
        member_id:  memberId,
        start_date: form.start_date,
        end_date:   form.end_date || null,
        notes:      form.notes || null,
      })
    }
    await syncMemberFromPeriods(memberId)
    setSaving(false)
    setAdding(false)
    setEditId(null)
    loadPeriods()
    onChanged?.()
  }

  async function deletePeriod(id) {
    if (!confirm('Slett denne perioden?')) return
    await supabase.from('member_periods').delete().eq('id', id)
    await syncMemberFromPeriods(memberId)
    loadPeriods()
    onChanged?.()
  }

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span className="form-label" style={{ margin: 0 }}>Medlemskapsperioder</span>
        <button type="button" className="btn btn-sm btn-secondary" onClick={startAdd}>+ Legg til</button>
      </div>

      {periods.length === 0 && !adding && (
        <div style={{ color: 'var(--muted)', fontSize: 12, padding: '4px 0' }}>Ingen perioder registrert</div>
      )}

      {periods.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {fmtDate(p.start_date)} → {p.end_date
              ? fmtDate(p.end_date)
              : <span style={{ color: 'var(--green)', fontWeight: 600 }}>nå</span>}
          </span>
          {p.notes && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{p.notes}</span>}
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(p)}>✎</button>
          <button type="button" className="btn btn-sm btn-danger"     onClick={() => deletePeriod(p.id)}>✕</button>
        </div>
      ))}

      {adding && (
        <div style={{ marginTop: 10, padding: 12, background: 'var(--surface)', borderRadius: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Fra dato *</label>
            <input className="form-input" type="date" value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Til dato (tom = aktiv nå)</label>
            <input className="form-input" type="date" value={form.end_date}
              onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Notat</label>
            <input className="form-input" value={form.notes} placeholder="Valgfritt notat for perioden"
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-8" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="btn btn-sm btn-secondary"
              onClick={() => { setAdding(false); setEditId(null) }}>Avbryt</button>
            <button type="button" className="btn btn-sm btn-primary"
              disabled={!form.start_date || saving} onClick={savePeriod}>
              {saving ? 'Lagrer…' : 'Lagre periode'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- MemberModal -------------------------------------------------------------

function MemberModal({ member, onClose, onSaved }) {
  const emptyForm = {
    full_name: '', email: '', phone: '', gender: '',
    address: '', postal_code: '', city: '', country: 'Norge',
    payment_type: 'monthly', in_reisekasse: false, notes: '',
  }
  const [form, setForm]     = useState(member ? {
    full_name:    member.full_name    || '',
    email:        member.email        || '',
    phone:        member.phone        || '',
    gender:       member.gender       || '',
    address:      member.address      || '',
    postal_code:  member.postal_code  || '',
    city:         member.city         || '',
    country:      member.country      || 'Norge',
    payment_type: member.payment_type || 'monthly',
    in_reisekasse: member.in_reisekasse || false,
    notes:        member.notes        || '',
  } : emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [savedId, setSavedId] = useState(member?.id || null)

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      full_name:    form.full_name,
      email:        form.email        || null,
      phone:        form.phone        || null,
      gender:       ['mann','kvinne','annet'].includes(form.gender) ? form.gender : null,
      address:      form.address      || null,
      postal_code:  form.postal_code  || null,
      city:         form.city         || null,
      country:      form.country      || null,
      payment_type: form.payment_type,
      in_reisekasse: form.in_reisekasse,
      notes:        form.notes        || null,
      updated_at:   new Date().toISOString(),
    }
    if (savedId) {
      const res = await supabase.from('members').update(payload).eq('id', savedId)
      if (res.error) { setError(res.error.message); setSaving(false); return }
      onSaved()
      if (member) onClose()
    } else {
      const res = await supabase.from('members').insert({ ...payload, active: true }).select('id').single()
      if (res.error) { setError(res.error.message); setSaving(false); return }
      setSavedId(res.data.id)
      onSaved()
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-title">{member ? 'Rediger medlem' : 'Nytt medlem'}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">Fullt navn <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="form-input" value={form.full_name} required
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">E-post</label>
              <input className="form-input" type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefon</label>
              <input className="form-input" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Kjønn</label>
              <select className="form-select" value={form.gender}
                onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                <option value="">—</option>
                <option value="mann">Mann</option>
                <option value="kvinne">Kvinne</option>
                <option value="annet">Annet</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Adresse</label>
            <input className="form-input" value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Postnr</label>
              <input className="form-input" value={form.postal_code}
                onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Sted</label>
              <input className="form-input" value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Land</label>
              <input className="form-input" value={form.country}
                onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Betalingsform</label>
              <select className="form-select" value={form.payment_type}
                onChange={e => setForm(f => ({ ...f, payment_type: e.target.value }))}>
                <option value="monthly">Månedlig</option>
                <option value="yearly">Årlig</option>
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.in_reisekasse}
                  onChange={e => setForm(f => ({ ...f, in_reisekasse: e.target.checked }))} />
                Med i Reisekassen
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notater</label>
            <textarea className="form-textarea" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex gap-8 mt-16">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {savedId && !member ? 'Lukk' : 'Avbryt'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Lagrer…' : savedId && !member ? 'Oppdater info' : 'Lagre'}
            </button>
          </div>
        </form>

        {savedId && (
          <>
            {!member && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: '#1a3a1a', border: '1px solid var(--green)', borderRadius: 6, fontSize: 12, color: 'var(--green)' }}>
                ✓ Opprettet — legg til første periode nedenfor, eller lukk og gjør det senere
              </div>
            )}
            <PeriodsSection memberId={savedId} onChanged={onSaved} />
          </>
        )}
      </div>
    </div>
  )
}

// --- MemberRegistry (main) ---------------------------------------------------

export default function MemberRegistry() {
  const { isKasserer, isAdmin } = useAuth()
  const prefs = useColumnPrefs('member_registry', COLUMNS)
  const [members, setMembers]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [search, setSearch]         = useState('')
  const [filterActive, setFilterActive] = useState('active')
  const [showImport, setShowImport] = useState(false)
  const [csvText, setCsvText]       = useState('')
  const [csvPreview, setCsvPreview] = useState(null)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('members')
      .select('*, member_periods(id, start_date, end_date, notes)')
      .order('full_name')
    setMembers((data || []).map(m => ({
      ...m,
      periods: (m.member_periods || []).sort((a, b) => a.start_date > b.start_date ? 1 : -1),
    })))
    setLoading(false)
  }

  async function deleteMember(id) {
    if (!confirm('Slett dette medlemmet og alle tilknyttede betalinger og perioder?')) return
    await supabase.from('members').delete().eq('id', id)
    load()
  }

  async function toggleReisekasse(member) {
    await supabase.from('members')
      .update({ in_reisekasse: !member.in_reisekasse, updated_at: new Date().toISOString() })
      .eq('id', member.id)
    load()
  }

  // --- Export ----------------------------------------------------------------

  function exportCSV() {
    const rows = []
    for (const m of members) {
      const memberCols = h => {
        if (h === 'start_date' || h === 'end_date' || h === 'period_notes') return ''
        return csvCell(m[h] ?? '')
      }
      if (m.periods.length > 0) {
        m.periods.forEach((p, i) => {
          rows.push(CSV_HEADERS.map(h => {
            if (h === 'start_date')   return csvCell(isoToNor(p.start_date))
            if (h === 'end_date')     return csvCell(isoToNor(p.end_date))
            if (h === 'period_notes') return csvCell(p.notes      || '')
            // Contact info only on first period row to keep CSV readable
            if (i > 0 && ['email','phone','gender','address','postal_code','city','country'].includes(h)) return ''
            return csvCell(m[h] ?? '')
          }).join(','))
        })
      } else {
        rows.push(CSV_HEADERS.map(memberCols).join(','))
      }
    }
    const csv = [CSV_HEADERS.join(','), ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `smcc_members_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // --- Import ----------------------------------------------------------------

  function parsePeek() {
    if (!csvText.trim()) return
    try {
      const rows = parseCSV(csvText)
      if (!rows.length || !rows[0].full_name) {
        alert('CSV mangler påkrevd kolonne: full_name')
        return
      }
      setCsvPreview(rows)
    } catch {
      alert('Ugyldig CSV-format. Kontroller at kolonner er komma- eller semikolonseparert.')
    }
  }

  async function runImport() {
    if (!csvPreview) return
    setImporting(true)
    let inserted = 0, updated = 0, periodsAdded = 0, errors = 0

    // Group rows by normalised full_name
    const groups = {}
    for (const row of csvPreview) {
      const name = row.full_name?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!groups[key]) groups[key] = { name, rows: [] }
      groups[key].rows.push(row)
    }

    for (const { name, rows } of Object.values(groups)) {
      // Pick contact info: prefer first row that has email/phone/address
      const infoRow = rows.find(r => r.email || r.phone || r.address) || rows[0]

      const memberPayload = {
        full_name:    name,
        email:        infoRow.email        || null,
        phone:        infoRow.phone        || null,
        gender:       ['mann','kvinne','annet'].includes(infoRow.gender) ? infoRow.gender : null,
        address:      infoRow.address      || null,
        postal_code:  infoRow.postal_code  || null,
        city:         infoRow.city         || null,
        country:      infoRow.country      || null,
        payment_type: ['monthly','yearly'].includes(infoRow.payment_type) ? infoRow.payment_type : 'monthly',
        in_reisekasse: parseBool(rows[rows.length - 1].in_reisekasse, false),
        notes:        infoRow.notes || null,
        updated_at:   new Date().toISOString(),
      }

      const existing = members.find(m => m.full_name.toLowerCase() === name.toLowerCase())
      let memberId
      if (existing) {
        const res = await supabase.from('members').update(memberPayload).eq('id', existing.id)
        if (res.error) { errors++; console.error('member update error', res.error); continue }
        memberId = existing.id
        updated++
      } else {
        const res = await supabase.from('members').insert({ ...memberPayload, active: false }).select('id').single()
        if (res.error) { errors++; console.error('member insert error', res.error); continue }
        memberId = res.data.id
        inserted++
      }

      // Insert periods (support both start_date and legacy join_date)
      for (const row of rows) {
        const startDate = norToIso(row.start_date || row.join_date)
        if (!startDate) continue

        const { data: dup } = await supabase
          .from('member_periods').select('id')
          .eq('member_id', memberId).eq('start_date', startDate).maybeSingle()
        if (dup) continue

        const res = await supabase.from('member_periods').insert({
          member_id:  memberId,
          start_date: startDate,
          end_date:   norToIso(row.end_date) || null,
          notes:      row.period_notes || null,
        })
        if (!res.error) periodsAdded++
        else console.error('period insert error', res.error)
      }

      await syncMemberFromPeriods(memberId)
    }

    setImportResult({ inserted, updated, periodsAdded, errors })
    setImporting(false)
    setCsvPreview(null)
    setCsvText('')
    load()
  }

  // --- Filtering & rendering -------------------------------------------------

  const filtered = members.filter(m => {
    if (filterActive === 'active'     && !m.active)        return false
    if (filterActive === 'inactive'   &&  m.active)        return false
    if (filterActive === 'reisekasse' && !m.in_reisekasse) return false
    if (search && !m.full_name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function renderCell(m, key) {
    switch (key) {
      case 'full_name':    return <td key={key} style={{ fontWeight: 500 }}>{m.full_name}</td>
      case 'email':        return <td key={key} style={{ color: 'var(--muted)', fontSize: 12 }}>{m.email || '—'}</td>
      case 'phone':        return <td key={key} style={{ color: 'var(--muted)', fontSize: 12 }}>{m.phone || '—'}</td>
      case 'gender':       return <td key={key} style={{ color: 'var(--muted)', fontSize: 12 }}>
        {m.gender ? m.gender.charAt(0).toUpperCase() + m.gender.slice(1) : '—'}
      </td>
      case 'address':      return <td key={key} style={{ color: 'var(--muted)', fontSize: 12 }}>{m.address || '—'}</td>
      case 'postal_code':  return <td key={key} style={{ color: 'var(--muted)', fontSize: 12 }}>{m.postal_code || '—'}</td>
      case 'city':         return <td key={key} style={{ color: 'var(--muted)', fontSize: 12 }}>{m.city || '—'}</td>
      case 'country':      return <td key={key} style={{ color: 'var(--muted)', fontSize: 12 }}>{m.country || '—'}</td>
      case 'payment_type': return (
        <td key={key}>
          <span className="badge" style={{ background: 'var(--graphite)', color: 'var(--dim)', fontSize: 10 }}>
            {m.payment_type === 'yearly' ? 'Årlig' : 'Månedlig'}
          </span>
        </td>
      )
      case 'join_date': return (
        <td key={key} style={{ fontSize: 12, color: 'var(--muted)' }}>
          {fmtDate(m.join_date) || '—'}
        </td>
      )
      case 'periods': {
        const ps = m.periods || []
        if (ps.length === 0) return <td key={key} style={{ color: 'var(--muted)', fontSize: 12 }}>—</td>
        if (ps.length === 1) {
          const p = ps[0]
          return (
            <td key={key} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              {fmtDate(p.start_date)}–{p.end_date
                ? fmtDate(p.end_date)
                : <span style={{ color: 'var(--green)' }}>nå</span>}
            </td>
          )
        }
        const isActive = ps.some(p => !p.end_date)
        return (
          <td key={key} style={{ fontSize: 11 }}>
            <span className="badge" style={{
              background: isActive ? 'rgba(74,222,128,.15)' : 'var(--graphite)',
              color: isActive ? 'var(--green)' : 'var(--dim)', fontSize: 10,
            }}>
              {ps.length} perioder
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 4 }}>
              {isActive ? '· aktiv nå' : `· sist ${fmtDate(ps[ps.length - 1].end_date)}`}
            </span>
          </td>
        )
      }
      case 'in_reisekasse': return (
        <td key={key}>
          {isKasserer ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={m.in_reisekasse || false} onChange={() => toggleReisekasse(m)} />
              <span style={{ fontSize: 11, color: m.in_reisekasse ? 'var(--green)' : 'var(--muted)' }}>
                {m.in_reisekasse ? 'Ja' : 'Nei'}
              </span>
            </label>
          ) : (
            <span style={{ color: m.in_reisekasse ? 'var(--green)' : 'var(--muted)', fontSize: 12 }}>
              {m.in_reisekasse ? 'Ja' : '—'}
            </span>
          )}
        </td>
      )
      case 'active': return (
        <td key={key}>
          <span className={`badge ${m.active ? 'badge-approved' : 'badge-pending'}`} style={{ fontSize: 10 }}>
            {m.active ? 'Aktiv' : 'Inaktiv'}
          </span>
        </td>
      )
      case 'notes': return (
        <td key={key} style={{ color: 'var(--muted)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.notes || '—'}
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
        <MemberModal
          member={editMember}
          onClose={() => { setShowModal(false); setEditMember(null) }}
          onSaved={load}
        />
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Medlemsregister</div>
          <div className="page-sub">
            {members.filter(m => m.active).length} aktive ·{' '}
            {members.filter(m => !m.active).length} inaktive ·{' '}
            {members.filter(m => m.in_reisekasse).length} i Reisekassen
          </div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-secondary" onClick={exportCSV}>↓ Eksporter CSV</button>
          <button className="btn btn-secondary" onClick={() => { setShowImport(!showImport); setImportResult(null) }}>
            ↑ Importer CSV
          </button>
          {isKasserer && (
            <button className="btn btn-primary" onClick={() => { setEditMember(null); setShowModal(true) }}>
              + Nytt medlem
            </button>
          )}
        </div>
      </div>

      {showImport && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">CSV-import</div>
              <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--surface)', borderRadius: 6, fontSize: 12, lineHeight: 1.8 }}>
                <strong style={{ color: 'var(--dim)' }}>Påkrevd:</strong>{' '}
                <span style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>full_name</span>
                <br />
                <strong style={{ color: 'var(--dim)' }}>Kontakt:</strong>{' '}
                <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  email · phone · gender (mann|kvinne|annet) · address · postal_code · city · country
                </span>
                <br />
                <strong style={{ color: 'var(--dim)' }}>Periode:</strong>{' '}
                <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  start_date · end_date (dd.mm.åååå, tom = aktiv nå) · period_notes
                </span>
                <br />
                <strong style={{ color: 'var(--dim)' }}>Historikk:</strong>{' '}
                <span style={{ color: 'var(--muted)' }}>Flere rader med samme full_name = én person med flere perioder</span>
                <br />
                <strong style={{ color: 'var(--dim)' }}>Bakoverkomp.:</strong>{' '}
                <span style={{ color: 'var(--muted)' }}>join_date godtas som start_date</span>
              </div>

              <div className="flex gap-8" style={{ marginBottom: 10 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => { setCsvText(CSV_TEMPLATE); setCsvPreview(null) }}>
                  Last inn mal
                </button>
                <button className="btn btn-sm btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  Velg fil (.csv)
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files[0]; if (!f) return
                    const r = new FileReader()
                    r.onload = ev => { setCsvText(ev.target.result); setCsvPreview(null) }
                    r.readAsText(f, 'UTF-8')
                  }} />
              </div>

              <textarea
                className="form-textarea"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, minHeight: 100 }}
                placeholder="Lim inn CSV her, eller bruk «Velg fil»…"
                value={csvText}
                onChange={e => { setCsvText(e.target.value); setCsvPreview(null) }}
              />

              <div className="flex gap-8" style={{ marginTop: 10 }}>
                <button className="btn btn-secondary" disabled={!csvText.trim()} onClick={parsePeek}>
                  Forhåndsvis
                </button>
                {csvPreview && (
                  <button className="btn btn-primary" disabled={importing} onClick={runImport}>
                    {importing ? 'Importerer…' : `Importer ${csvPreview.length} rader`}
                  </button>
                )}
              </div>

              {importResult && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#1a3a1a', border: '1px solid var(--green)', borderRadius: 6, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    Import fullført:{' '}
                    <strong style={{ color: 'var(--green)' }}>{importResult.inserted} nye</strong>,{' '}
                    <strong style={{ color: 'var(--yellow)' }}>{importResult.updated} oppdatert</strong>,{' '}
                    <strong style={{ color: 'var(--green)' }}>{importResult.periodsAdded} perioder lagt til</strong>
                    {importResult.errors > 0 && <>, <strong style={{ color: 'var(--red)' }}>{importResult.errors} feil (se konsoll)</strong></>}
                  </span>
                  <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                    onClick={() => setImportResult(null)}>✕</button>
                </div>
              )}

              {csvPreview && (() => {
                // Compute per-row handling label for preview
                const seen = {}
                return (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                      Forhåndsvisning — {csvPreview.length} rad{csvPreview.length !== 1 ? 'er' : ''}
                      {' '}({new Set(csvPreview.map(r => r.full_name?.trim().toLowerCase()).filter(Boolean)).size} unike personer):
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                        <thead>
                          <tr>
                            {Object.keys(csvPreview[0]).map(h => (
                              <th key={h} style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                            <th style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>Handling</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.map((row, i) => {
                            const key = row.full_name?.trim().toLowerCase()
                            const existingMember = members.find(m => m.full_name.toLowerCase() === key)
                            const isFirst = !seen[key]
                            seen[key] = true
                            const hasStart = !!(row.start_date || row.join_date)
                            let label, color
                            if (isFirst && !existingMember) { label = 'Ny person' + (hasStart ? ' + periode' : ''); color = 'badge-approved' }
                            else if (isFirst)               { label = 'Oppdatering' + (hasStart ? ' + periode' : ''); color = 'badge-pending' }
                            else                            { label = '+ periode'; color = '' }
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                {Object.values(row).map((v, j) => (
                                  <td key={j} style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</td>
                                ))}
                                <td style={{ padding: '3px 8px' }}>
                                  <span className={`badge ${color}`} style={{ fontSize: 10 }}>{label}</span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
        </div>
      )}

      <CardGrid pageKey="members-register" cards={[{
        id: 'tabell',
        content: (
          <div className="card">
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="form-input" style={{ maxWidth: 280 }} placeholder="Søk navn…"
                  value={search} onChange={e => setSearch(e.target.value)} />
                {[
                  { key: 'active',     label: 'Aktive' },
                  { key: 'inactive',   label: 'Inaktive' },
                  { key: 'reisekasse', label: 'Reisekassen' },
                  { key: 'all',        label: 'Alle' },
                ].map(f => (
                  <button key={f.key} className={`btn btn-sm ${filterActive === f.key ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setFilterActive(f.key)}>
                    {f.label}
                  </button>
                ))}
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} treff</span>
                <ColumnPicker prefs={prefs} style={{ marginLeft: 'auto' }} />
              </div>
              <div className="table-wrap">
                <table style={hasAnyWidth ? { tableLayout: 'fixed' } : {}}>
                  <thead>
                    <tr>
                      {prefs.orderedVisible.map(col => (
                        <ResizableTh key={col.key} colKey={col.key} prefs={prefs}>{col.label}</ResizableTh>
                      ))}
                      {isKasserer && <th style={{ width: 80 }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={99} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Ingen treff</td></tr>
                    ) : filtered.map(m => (
                      <tr key={m.id}>
                        {prefs.orderedVisible.map(col => renderCell(m, col.key))}
                        {isKasserer && (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div className="flex gap-8">
                              <button className="btn btn-sm btn-secondary"
                                onClick={() => { setEditMember(m); setShowModal(true) }}>✎</button>
                              {isAdmin && (
                                <button className="btn btn-sm btn-danger" onClick={() => deleteMember(m.id)}>✕</button>
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
      }]} />
    </div>
  )
}
