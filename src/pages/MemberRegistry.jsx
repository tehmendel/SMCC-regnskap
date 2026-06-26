import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/format'

const CSV_SPEC = `Påkrevd: full_name
Valgfritt: email, phone, payment_type (monthly|yearly), join_date (YYYY-MM-DD), end_date (YYYY-MM-DD), active (true|false), in_reisekasse (true|false), notes`

const CSV_TEMPLATE = `full_name,email,phone,payment_type,join_date,end_date,active,in_reisekasse,notes
Ola Nordmann,ola@example.com,99999999,monthly,2024-01-01,,true,false,
Kari Nordmann,kari@example.com,,yearly,2023-06-15,,true,true,Æresmedlem`

function parseBool(v, def = false) {
  if (v === undefined || v === '') return def
  return v === 'true' || v === '1' || v === 'ja' || v === 'yes'
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = '' }
      else cur += ch
    }
    values.push(cur.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (values[i] ?? '').replace(/^"|"$/g, '') })
    return obj
  })
}

function MemberModal({ member, onClose, onSaved }) {
  const [form, setForm] = useState(member || {
    full_name: '', email: '', phone: '',
    payment_type: 'monthly', join_date: '', end_date: '',
    active: true, in_reisekasse: false, notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, join_date: form.join_date || null, end_date: form.end_date || null }
    const res = member
      ? await supabase.from('members').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', member.id)
      : await supabase.from('members').insert(payload)
    if (res.error) setError(res.error.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{member ? 'Rediger medlem' : 'Nytt medlem'}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">Fullt navn <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="form-input" value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">E-post</label>
              <input className="form-input" type="email" value={form.email || ''}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefon</label>
              <input className="form-input" value={form.phone || ''}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
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
            <div className="form-group">
              <label className="form-label">Innmeldingsdato</label>
              <input className="form-input" type="date" value={form.join_date || ''}
                onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Utmeldingsdato <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(valgfritt)</span></label>
              <input className="form-input" type="date" value={form.end_date || ''}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value || null }))} />
              {form.end_date && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Vises i statistikk t.o.m. {new Date(form.end_date).getFullYear()},
                  ikke fra {new Date(form.end_date).getFullYear() + 1}.
                </div>
              )}
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 22 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                Aktiv
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.in_reisekasse || false}
                  onChange={e => setForm(f => ({ ...f, in_reisekasse: e.target.checked }))} />
                Med i Reisekassen
              </label>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notater</label>
            <textarea className="form-textarea" value={form.notes || ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
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

export default function MemberRegistry() {
  const { isKasserer, isAdmin } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState('active')
  const [showImport, setShowImport] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvPreview, setCsvPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('members').select('*').order('full_name')
    setMembers(data || [])
    setLoading(false)
  }

  async function deleteMember(id) {
    if (!confirm('Slett dette medlemmet og alle tilknyttede betalinger?')) return
    await supabase.from('members').delete().eq('id', id)
    load()
  }

  async function toggleReisekasse(member) {
    await supabase.from('members')
      .update({ in_reisekasse: !member.in_reisekasse, updated_at: new Date().toISOString() })
      .eq('id', member.id)
    load()
  }

  function exportCSV() {
    const headers = ['full_name','email','phone','payment_type','join_date','end_date','active','in_reisekasse','notes']
    const rows = members.map(m => headers.map(h => {
      const v = m[h] ?? ''
      if (typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n')))
        return `"${v.replace(/"/g, '""')}"`
      return v
    }).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `smcc_members_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
      alert('Ugyldig CSV-format. Kontroller at kolonner er kommaseparert.')
    }
  }

  async function runImport() {
    if (!csvPreview) return
    setImporting(true)
    let inserted = 0, updated = 0, errors = 0
    for (const row of csvPreview) {
      if (!row.full_name?.trim()) continue
      const payload = {
        full_name:      row.full_name.trim(),
        email:          row.email || null,
        phone:          row.phone || null,
        payment_type:   ['monthly','yearly'].includes(row.payment_type) ? row.payment_type : 'monthly',
        join_date:      row.join_date || null,
        end_date:       row.end_date || null,
        active:         parseBool(row.active, true),
        in_reisekasse:  parseBool(row.in_reisekasse, false),
        notes:          row.notes || null,
        updated_at:     new Date().toISOString(),
      }
      const existing = members.find(m => m.full_name.toLowerCase() === payload.full_name.toLowerCase())
      let res
      if (existing) {
        res = await supabase.from('members').update(payload).eq('id', existing.id)
        if (!res.error) updated++; else errors++
      } else {
        res = await supabase.from('members').insert(payload)
        if (!res.error) inserted++; else errors++
      }
    }
    setImportResult({ inserted, updated, errors })
    setImporting(false)
    setCsvPreview(null)
    setCsvText('')
    load()
  }

  const filtered = members.filter(m => {
    if (filterActive === 'active'   && !m.active) return false
    if (filterActive === 'inactive' &&  m.active) return false
    if (filterActive === 'reisekasse' && !m.in_reisekasse) return false
    if (search && !m.full_name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

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

      {/* CSV Import panel */}
      {showImport && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">CSV-import</div>
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--surface)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--dim)' }}>Påkrevd:</strong>{' '}
            <span style={{ color: 'var(--green)' }}>full_name</span>
            <br />
            <strong style={{ color: 'var(--dim)' }}>Valgfritt:</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              email · phone · payment_type (monthly|yearly) · join_date (YYYY-MM-DD) · end_date (YYYY-MM-DD) · active (true|false) · in_reisekasse (true|false) · notes
            </span>
            <br />
            <strong style={{ color: 'var(--dim)' }}>Duplikater:</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>Eksisterende medlemmer (samme full_name) oppdateres — nye opprettes</span>
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
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#1a3a1a', border: '1px solid var(--green)', borderRadius: 6, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>
                Import fullført:{' '}
                <strong style={{ color: 'var(--green)' }}>{importResult.inserted} nye</strong>,{' '}
                <strong style={{ color: 'var(--yellow)' }}>{importResult.updated} oppdatert</strong>
                {importResult.errors > 0 && <>, <strong style={{ color: 'var(--red)' }}>{importResult.errors} feil</strong></>}
              </span>
              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                onClick={() => setImportResult(null)}>✕</button>
            </div>
          )}

          {csvPreview && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                Forhåndsvisning — {csvPreview.length} rad{csvPreview.length !== 1 ? 'er' : ''}:
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                  <thead>
                    <tr>
                      {Object.keys(csvPreview[0]).map(h => (
                        <th key={h} style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                      <th style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>Handling</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((row, i) => {
                      const exists = members.find(m => m.full_name.toLowerCase() === row.full_name?.trim().toLowerCase())
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          {Object.values(row).map((v, j) => (
                            <td key={j} style={{ padding: '3px 10px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v}</td>
                          ))}
                          <td style={{ padding: '3px 10px' }}>
                            <span className={`badge ${exists ? 'badge-pending' : 'badge-approved'}`} style={{ fontSize: 10 }}>
                              {exists ? 'Oppdatering' : 'Ny'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="form-input" style={{ maxWidth: 280 }} placeholder="Søk navn…"
          value={search} onChange={e => setSearch(e.target.value)} />
        {[
          { key: 'active', label: 'Aktive' },
          { key: 'inactive', label: 'Inaktive' },
          { key: 'reisekasse', label: 'Reisekassen' },
          { key: 'all', label: 'Alle' },
        ].map(f => (
          <button key={f.key} className={`btn btn-sm ${filterActive === f.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterActive(f.key)}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{filtered.length} treff</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Navn</th>
                <th>E-post</th>
                <th>Telefon</th>
                <th>Betalingsform</th>
                <th>Innmeldt</th>
                <th>Utmeldt</th>
                <th>Reisekassen</th>
                <th>Status</th>
                {isKasserer && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Ingen treff</td></tr>
              ) : filtered.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.full_name}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{m.email || '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{m.phone || '—'}</td>
                  <td>
                    <span className="badge badge-pending" style={{ background: 'var(--graphite)', color: 'var(--dim)', fontSize: 10 }}>
                      {m.payment_type === 'yearly' ? 'Årlig' : 'Månedlig'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(m.join_date)}</td>
                  <td style={{ fontSize: 12, color: m.end_date ? 'var(--red)' : 'var(--muted)' }}>
                    {m.end_date ? fmtDate(m.end_date) : '—'}
                  </td>
                  <td>
                    {isKasserer ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={m.in_reisekasse || false}
                          onChange={() => toggleReisekasse(m)} />
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
                  <td>
                    <span className={`badge ${m.active ? 'badge-approved' : 'badge-pending'}`} style={{ fontSize: 10 }}>
                      {m.active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  {isKasserer && (
                    <td>
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
    </div>
  )
}
