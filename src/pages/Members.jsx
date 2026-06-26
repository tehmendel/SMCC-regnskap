import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmt } from '../lib/format'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des']
const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

// Normalize text for matching: lowercase, replace Norwegian chars, strip punctuation
function normTx(s) {
  return (s || '')
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreMatch(desc, member, hist) {
  const d = normTx(desc)
  const parts = normTx(member.full_name).split(' ').filter(p => p.length > 1)
  if (!parts.length) return 0

  const hits = parts.filter(p => d.includes(p)).length
  const nameScore = hits / parts.length

  // Historical boost: if past linked transactions for this member share the same description pattern
  const memberHist = hist[member.id] || []
  const histConfirmed = memberHist.some(h => {
    const hd = normTx(h)
    const hHits = parts.filter(p => hd.includes(p)).length
    return hHits / parts.length >= 0.5
  })

  return Math.min(nameScore + (histConfirmed && nameScore > 0.5 ? 0.08 : 0), 1.0)
}

function getBestMatch(tx, members, hist) {
  let best = null, bestScore = 0
  for (const m of members) {
    const s = scoreMatch(tx.description, m, hist)
    if (s > bestScore) { bestScore = s; best = m }
  }
  return bestScore >= 0.45 ? { member: best, score: bestScore } : null
}

function ConfidenceBar({ score }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.9 ? 'var(--green)' : score >= 0.7 ? 'var(--yellow)' : 'var(--accent)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ display: 'inline-block', width: 40, height: 4, background: 'var(--graphite)', borderRadius: 2, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color }}>{pct}%</span>
    </span>
  )
}

function MemberModal({ member, onClose, onSaved }) {
  const [form, setForm] = useState(member || {
    full_name: '', email: '', phone: '',
    payment_type: 'monthly', join_date: '', end_date: '', active: true, notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const res = member
      ? await supabase.from('members').update({ ...form, updated_at: new Date().toISOString() }).eq('id', member.id)
      : await supabase.from('members').insert(form)
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
            <label className="form-label">Fullt navn</label>
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
                <option value="monthly">Månedlig (300 kr)</option>
                <option value="yearly">Årlig (3 600 kr)</option>
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
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              {form.end_date && (
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                  Vises i statistikk for {new Date(form.end_date).getFullYear()},<br />
                  ikke i {new Date(form.end_date).getFullYear() + 1} og frem.
                </div>
              )}
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

function LinkModal({ transaction, members, year, onClose, onSaved, suggestedMemberId = '' }) {
  const [memberId, setMemberId] = useState(suggestedMemberId)
  const [month, setMonth] = useState(new Date(transaction.date).getMonth() + 1)
  const [saving, setSaving] = useState(false)
  const selected = members.find(m => m.id === memberId)

  async function save() {
    if (!memberId) return
    setSaving(true)
    if (!transaction.approved) {
      await supabase.from('transactions').update({
        approved: true,
        approved_at: new Date().toISOString(),
      }).eq('id', transaction.id)
    }
    await supabase.from('member_payments').insert({
      member_id: memberId,
      year,
      month: selected?.payment_type === 'yearly' ? null : month,
      amount: transaction.amount,
      payment_date: transaction.date,
      transaction_id: transaction.id,
    })
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Koble betaling til medlem</div>
        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--muted)', padding: '8px 12px', background: 'var(--surface)', borderRadius: 6 }}>
          {transaction.date} · {transaction.description} · <strong>{fmt(transaction.amount)}</strong>
        </div>
        <div className="form-group">
          <label className="form-label">Velg medlem</label>
          <select className="form-select" value={memberId} onChange={e => setMemberId(e.target.value)}>
            <option value="">— velg —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
        {selected?.payment_type === 'monthly' && (
          <div className="form-group">
            <label className="form-label">Måned</label>
            <select className="form-select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}
        {selected?.payment_type === 'yearly' && (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Årsbetalingen vil dekke alle måneder i {year}.
          </div>
        )}
        <div className="flex gap-8">
          <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
          <button className="btn btn-primary" disabled={!memberId || saving} onClick={save}>
            {saving ? 'Kobler…' : 'Koble til medlem'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Members() {
  const { isKasserer, isAdmin } = useAuth()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [members, setMembers] = useState([])
  const [payments, setPayments] = useState([])
  const [unmatched, setUnmatched] = useState([])
  const [history, setHistory] = useState({})
  const [matchSuggestions, setMatchSuggestions] = useState({})
  const [autoMatching, setAutoMatching] = useState(false)
  const [autoLog, setAutoLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [linkTx, setLinkTx] = useState(null)
  const [linkSuggestedId, setLinkSuggestedId] = useState('')

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)
    const [mRes, pRes, tRes, hRes] = await Promise.all([
      supabase.from('members').select('*').order('full_name'),
      supabase.from('member_payments').select('*').eq('year', year),
      supabase.from('transactions')
        .select('id, date, description, amount, approved')
        .eq('type', 'inntekt')
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
        .order('date', { ascending: false }),
      supabase.from('member_payments')
        .select('member_id, transactions!transaction_id(description)')
        .not('transaction_id', 'is', null),
    ])

    // Build history map: memberId → [description, ...]
    const histMap = {}
    for (const p of hRes.data || []) {
      const desc = p.transactions?.description
      if (desc) {
        if (!histMap[p.member_id]) histMap[p.member_id] = []
        histMap[p.member_id].push(desc)
      }
    }
    setHistory(histMap)

    const allPayments = pRes.data || []
    setMembers(mRes.data || [])
    setPayments(allPayments)

    const linkedIds = new Set(allPayments.map(p => p.transaction_id).filter(Boolean))
    const newUnmatched = (tRes.data || []).filter(t => !linkedIds.has(t.id) && (t.amount == 300 || t.amount == 3600))
    setUnmatched(newUnmatched)

    // Remove stale suggestions for now-linked transactions
    setMatchSuggestions(prev => {
      const cleaned = { ...prev }
      for (const id of linkedIds) delete cleaned[id]
      return cleaned
    })

    setLoading(false)
  }

  async function autoMatch() {
    if (!activeMembers.length || !unmatched.length) return
    setAutoMatching(true)
    setAutoLog([])

    const newSuggestions = {}
    const autoLinked = []

    for (const tx of unmatched) {
      const match = getBestMatch(tx, activeMembers, history)
      if (!match) continue

      if (match.score >= 0.9) {
        if (!tx.approved) {
          await supabase.from('transactions').update({
            approved: true,
            approved_at: new Date().toISOString(),
          }).eq('id', tx.id)
        }
        const { error } = await supabase.from('member_payments').insert({
          member_id: match.member.id,
          year,
          month: match.member.payment_type === 'yearly' ? null : new Date(tx.date).getMonth() + 1,
          amount: tx.amount,
          payment_date: tx.date,
          transaction_id: tx.id,
        })
        if (!error) autoLinked.push({ tx, member: match.member, score: match.score })
        else newSuggestions[tx.id] = match
      } else {
        newSuggestions[tx.id] = match
      }
    }

    setMatchSuggestions(newSuggestions)
    if (autoLinked.length > 0) setAutoLog(autoLinked)
    await load()
    setAutoMatching(false)
  }

  function openLinkModal(tx, suggestedId = '') {
    setLinkTx(tx)
    setLinkSuggestedId(suggestedId)
  }

  function getPayment(memberId, month) {
    return payments.find(p => p.member_id === memberId && (p.month === month || p.month === null))
  }

  function isPaid(memberId, month) {
    return !!getPayment(memberId, month)
  }

  async function toggleMonth(member, month) {
    const payment = getPayment(member.id, month)
    if (payment) {
      await supabase.from('member_payments').delete().eq('id', payment.id)
    } else {
      await supabase.from('member_payments').insert({
        member_id: member.id,
        year,
        month: member.payment_type === 'yearly' ? null : month,
        amount: member.payment_type === 'yearly' ? 3600 : 300,
        payment_date: `${year}-${String(month).padStart(2, '0')}-15`,
      })
    }
    load()
  }

  function totalPaid(memberId) {
    return payments.filter(p => p.member_id === memberId).reduce((s, p) => s + Number(p.amount), 0)
  }

  async function deleteMember(id) {
    if (!confirm('Slett dette medlemmet og alle tilknyttede betalinger?')) return
    await supabase.from('members').delete().eq('id', id)
    load()
  }

  // Active for selected year: no end_date, or end_date is within or after the selected year
  const activeMembers = members.filter(m => {
    if (!m.active) return false
    if (!m.end_date) return true
    return m.end_date >= `${year}-01-01`
  })
  const totalExpected = activeMembers.length * 3600
  const totalReceived = activeMembers.reduce((s, m) => s + totalPaid(m.id), 0)

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
      {linkTx && (
        <LinkModal
          transaction={linkTx}
          members={activeMembers}
          year={year}
          suggestedMemberId={linkSuggestedId}
          onClose={() => { setLinkTx(null); setLinkSuggestedId('') }}
          onSaved={load}
        />
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Medlemsoversikt</div>
          <div className="page-sub">
            {activeMembers.length} aktive medlemmer ·{' '}
            <span style={{ color: totalReceived >= totalExpected ? 'var(--green)' : 'var(--yellow)' }}>
              {fmt(totalReceived)}
            </span>
            {' '}/ {fmt(totalExpected)} innbetalt
          </div>
        </div>
        <div className="flex gap-8">
          <select className="form-select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {[CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {isKasserer && (
            <button className="btn btn-primary" onClick={() => { setEditMember(null); setShowModal(true) }}>
              + Nytt medlem
            </button>
          )}
        </div>
      </div>

      {/* Payment grid */}
      <div className="card" style={{ marginBottom: 24, overflowX: 'auto' }}>
        <table style={{ minWidth: 980, borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', minWidth: 160, borderBottom: '1px solid var(--border)' }}>Navn</th>
              {MONTH_NAMES.map(m => (
                <th key={m} style={{ textAlign: 'center', padding: '10px 4px', minWidth: 58, fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{m}</th>
              ))}
              <th style={{ textAlign: 'right', padding: '10px 12px', minWidth: 130, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 11 }}>
                Innbetalt / Forventet
              </th>
              {isKasserer && <th style={{ width: 64, borderBottom: '1px solid var(--border)' }} />}
            </tr>
          </thead>
          <tbody>
            {activeMembers.length === 0 ? (
              <tr>
                <td colSpan={15} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                  Ingen aktive medlemmer. Klikk "+ Nytt medlem" for å legge til.
                </td>
              </tr>
            ) : activeMembers.map(member => {
              const paid = totalPaid(member.id)
              const expected = 3600
              const hasYearlyPayment = payments.some(p => p.member_id === member.id && p.month === null)
              return (
                <tr key={member.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{member.full_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {member.payment_type === 'yearly' ? 'Årsbetaler' : 'Månedsbetaler'}
                      {member.end_date && (
                        <span style={{ color: 'var(--red)', marginLeft: 4 }}>
                          · sluttet {member.end_date}
                        </span>
                      )}
                    </div>
                  </td>
                  {MONTH_NAMES.map((_, i) => {
                    const month = i + 1
                    const paidThisMonth = isPaid(member.id, month)
                    const isPast = year < CURRENT_YEAR || (year === CURRENT_YEAR && month <= CURRENT_MONTH)
                    const monthStr = `${year}-${String(month).padStart(2, '0')}-01`
                    const afterEnd = member.end_date && monthStr > member.end_date

                    let bg = 'transparent'
                    let color = 'var(--border)'
                    let label = '—'

                    if (afterEnd) {
                      bg = 'var(--surface)'
                      color = 'var(--graphite)'
                      label = ''
                    } else if (paidThisMonth) {
                      bg = 'var(--green)'
                      color = '#fff'
                      label = hasYearlyPayment && member.payment_type === 'yearly' ? '✓' : '300'
                    } else if (isPast) {
                      bg = '#c0392b22'
                      color = 'var(--red)'
                    } else {
                      color = 'var(--graphite)'
                    }

                    return (
                      <td key={month} style={{ padding: 3, textAlign: 'center' }}>
                        <div
                          title={isKasserer && !afterEnd ? 'Klikk for å registrere / fjerne betaling' : ''}
                          style={{
                            borderRadius: 4, padding: '5px 2px', fontSize: 11,
                            fontFamily: 'var(--font-mono)', background: bg, color,
                            cursor: isKasserer && !afterEnd ? 'pointer' : 'default',
                            userSelect: 'none', fontWeight: paidThisMonth ? 600 : 400,
                          }}
                          onClick={() => isKasserer && !afterEnd && toggleMonth(member, month)}
                        >
                          {label}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'right', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    <span style={{ color: paid >= expected ? 'var(--green)' : paid > 0 ? 'var(--yellow)' : 'var(--red)', fontWeight: 600 }}>
                      {paid.toLocaleString('nb-NO')}
                    </span>
                    <span style={{ color: 'var(--muted)' }}> / {expected.toLocaleString('nb-NO')}</span>
                  </td>
                  {isKasserer && (
                    <td style={{ padding: '4px 8px' }}>
                      <div className="flex gap-8">
                        <button className="btn btn-sm btn-secondary"
                          onClick={() => { setEditMember(member); setShowModal(true) }}>✎</button>
                        {isAdmin && (
                          <button className="btn btn-sm btn-danger" onClick={() => deleteMember(member.id)}>✕</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Unmatched fee transactions */}
      {unmatched.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 500 }}>
              Ufordelte innbetalinger
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                {unmatched.length} transaksjoner på 300 eller 3 600 kr
              </span>
            </div>
            {isKasserer && (
              <button
                className="btn btn-sm btn-primary"
                disabled={autoMatching}
                onClick={autoMatch}
                style={{ marginLeft: 'auto' }}
              >
                {autoMatching ? 'Matcher…' : 'Auto-koble alle'}
              </button>
            )}
          </div>

          {/* Auto-link result log */}
          {autoLog.length > 0 && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: '#1a3a1a', border: '1px solid var(--green)', borderRadius: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                  {autoLog.length} betaling{autoLog.length > 1 ? 'er' : ''} auto-koblet (≥90% sikkerhet)
                </span>
                <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}
                  onClick={() => setAutoLog([])}>✕</button>
              </div>
              {autoLog.map(({ tx, member, score }, i) => (
                <div key={i} style={{ color: 'var(--dim)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 2 }}>
                  {tx.date} · {tx.description.slice(0, 40)} → <strong style={{ color: 'var(--text)' }}>{member.full_name}</strong>{' '}
                  <ConfidenceBar score={score} />
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dato</th>
                    <th>Beskrivelse</th>
                    <th className="text-right">Beløp</th>
                    <th>Status</th>
                    <th>Forslag</th>
                    {isKasserer && <th style={{ width: 180 }} />}
                  </tr>
                </thead>
                <tbody>
                  {unmatched.map(t => {
                    const suggestion = matchSuggestions[t.id]
                    return (
                      <tr key={t.id}>
                        <td className="text-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{t.date}</td>
                        <td style={{ fontSize: 13 }}>{t.description}</td>
                        <td className="text-right amount-positive">{fmt(t.amount)}</td>
                        <td>
                          <span className={`badge ${t.approved ? 'badge-approved' : 'badge-pending'}`}>
                            {t.approved ? 'Godkjent' : 'Venter'}
                          </span>
                        </td>
                        <td>
                          {suggestion ? (
                            <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: 'var(--dim)' }}>{suggestion.member.full_name}</span>
                              <ConfidenceBar score={suggestion.score} />
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--graphite)' }}>—</span>
                          )}
                        </td>
                        {isKasserer && (
                          <td>
                            <div className="flex gap-8">
                              {suggestion ? (
                                <>
                                  <button className="btn btn-sm btn-primary"
                                    onClick={() => openLinkModal(t, suggestion.member.id)}>
                                    Bekreft
                                  </button>
                                  <button className="btn btn-sm btn-secondary"
                                    onClick={() => openLinkModal(t, '')}>
                                    Annet
                                  </button>
                                </>
                              ) : (
                                <button className="btn btn-sm btn-secondary"
                                  onClick={() => openLinkModal(t, '')}>
                                  {t.approved ? 'Koble til' : 'Godkjenn og koble'}
                                </button>
                              )}
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
      )}
    </div>
  )
}
