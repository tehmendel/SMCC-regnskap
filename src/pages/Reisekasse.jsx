import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmt, MONTHS } from '../lib/format'
import { CardGrid } from '../components/CardGrid'
const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

function normTx(s) {
  return (s || '')
    .toLowerCase()
    .replace(/æ/g,'ae').replace(/ø/g,'o').replace(/å/g,'a')
    .replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()
}

function scoreMatch(desc, member, hist, boosts = {}) {
  const d = normTx(desc)
  const dWords = new Set(d.split(/\s+/).filter(Boolean))
  const parts = normTx(member.full_name).split(' ').filter(p => p.length > 1)
  if (!parts.length) return 0
  const hits = parts.filter(p => dWords.has(p)).length
  const nameScore = hits / parts.length
  const memberHist = hist[member.id] || []
  const histConfirmed = memberHist.some(h => {
    const hd = normTx(h)
    const hdWords = new Set(hd.split(/\s+/).filter(Boolean))
    return parts.filter(p => hdWords.has(p)).length / parts.length >= 0.5
  })
  const boost = nameScore > 0 ? (boosts[member.id] || 0) : 0
  return Math.min(1.0, nameScore + (histConfirmed && nameScore > 0.5 ? 0.08 : 0) + boost)
}

function getBestMatch(tx, members, hist, boosts = {}) {
  let best = null, bestScore = 0
  for (const m of members) {
    const s = scoreMatch(tx.description, m, hist, boosts)
    if (s > bestScore) { bestScore = s; best = m }
  }
  return bestScore >= 0.45 ? { member: best, score: bestScore } : null
}

async function recordBoost(memberId, memberName) {
  const pattern = normTx(memberName)
  const { data: existing } = await supabase
    .from('member_tx_boosts').select('boost, confirmation_count')
    .eq('member_id', memberId).eq('pattern', pattern).single()
  await supabase.from('member_tx_boosts').upsert({
    member_id: memberId, pattern,
    boost: Math.min(1.0, (existing?.boost || 0) + 0.2),
    confirmation_count: (existing?.confirmation_count || 0) + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'member_id,pattern' })
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

function memberVisibleInYear(m, year) {
  if (!m.in_reisekasse) return false
  if (m.join_date && new Date(m.join_date).getFullYear() > year) return false
  if (m.active) return true
  if (!m.end_date) return false
  return new Date(m.end_date).getFullYear() >= year
}

function getRateForMonth(feeRates, year, month) {
  const monthStart = `${year}-${String(month).padStart(2,'0')}-01`
  const rates = feeRates
    .filter(r => r.effective_from <= monthStart)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
  return rates[0] || { amount_monthly: 50, amount_yearly: 600 }
}

function FeeRateModal({ currentRate, onClose, onSaved }) {
  const { profile } = useAuth()
  const [amount, setAmount] = useState(currentRate?.amount_monthly || '100')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const monthly = parseFloat(amount)
    const { error } = await supabase.from('fee_rates').insert({
      fee_type: 'reisekasse',
      amount_monthly: monthly,
      amount_yearly: monthly * 12,
      effective_from: effectiveFrom,
      notes: notes || null,
      created_by: profile.id,
    })
    if (error) setError(error.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-title">Endre reisekasse-sats</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">Ny månedlig sats (kr)</label>
            <input className="form-input" type="number" min="1" step="1" value={amount}
              onChange={e => setAmount(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Gjelder fra dato</label>
            <input className="form-input" type="date" value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)} required
              min={new Date().toISOString().split('T')[0]} />
          </div>
          <div className="form-group">
            <label className="form-label">Kommentar (valgfritt)</label>
            <input className="form-input" value={notes}
              onChange={e => setNotes(e.target.value)} placeholder="F.eks. vedtak på årsmøte 2025" />
          </div>
          <div className="flex gap-8 mt-16">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Avbryt</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Lagrer…' : 'Lagre ny sats'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LinkModal({ transaction, members, onClose, onSaved, suggestedMemberId = '' }) {
  const [memberId, setMemberId] = useState(suggestedMemberId)
  const txDateYear = new Date(transaction.date).getFullYear()
  const txMonth = new Date(transaction.date).getMonth() + 1
  const [month, setMonth] = useState(txMonth)
  const [payYear, setPayYear] = useState(txDateYear)
  const [saving, setSaving] = useState(false)
  const selected = members.find(m => m.id === memberId)
  const isYearly = selected?.reisekasse_payment_type === 'yearly'
  const isJanYearly = isYearly && txMonth === 1

  async function save() {
    if (!memberId) return
    setSaving(true)
    if (!transaction.approved) {
      await supabase.from('transactions').update({
        approved: true, approved_at: new Date().toISOString(),
      }).eq('id', transaction.id)
    }
    await supabase.from('member_payments').insert({
      member_id: memberId,
      year: payYear,
      month: isYearly ? null : month,
      amount: transaction.amount,
      payment_date: transaction.date,
      transaction_id: transaction.id,
      payment_type: 'reisekasse',
    })
    await recordBoost(memberId, selected?.full_name || '')
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Koble reisekasse-betaling til medlem</div>
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
        {!isYearly && (
          <div className="form-group">
            <label className="form-label">Måned</label>
            <select className="form-select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}
        {isYearly && (
          <div className="form-group">
            <label className="form-label">Gjelder år</label>
            <select className="form-select" value={payYear} onChange={e => setPayYear(parseInt(e.target.value))}>
              <option value={txDateYear - 1}>{txDateYear - 1}</option>
              <option value={txDateYear}>{txDateYear}</option>
              <option value={txDateYear + 1}>{txDateYear + 1}</option>
            </select>
            {isJanYearly && payYear === txDateYear && (
              <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 4 }}>
                Transaksjonen er datert januar — sjekk om betalingen gjelder {txDateYear - 1} i stedet.
              </div>
            )}
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

export default function Reisekasse() {
  const { isKasserer } = useAuth()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [members, setMembers] = useState([])
  const [payments, setPayments] = useState([])
  const [feeRates, setFeeRates] = useState([])
  const [unmatched, setUnmatched] = useState([])
  const [dismissed, setDismissed] = useState([])
  const [showDismissed, setShowDismissed] = useState(false)
  const [boosts, setBoosts] = useState({})
  const [history, setHistory] = useState({})
  const [matchSuggestions, setMatchSuggestions] = useState({})
  const [autoMatching, setAutoMatching] = useState(false)
  const [autoLog, setAutoLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFeeModal, setShowFeeModal] = useState(false)
  const [showFeeHistory, setShowFeeHistory] = useState(false)
  const [linkTx, setLinkTx] = useState(null)
  const [linkSuggestedId, setLinkSuggestedId] = useState('')

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)

    const { data: mCats } = await supabase
      .from('categories').select('id, code').eq('code', 'membership_reisekasse')
    const rkCatId = mCats?.[0]?.id || null

    const [mRes, pRes, tRes, hRes, rRes, bRes] = await Promise.all([
      supabase.from('members').select('*').order('full_name'),
      supabase.from('member_payments').select('*').eq('year', year).eq('payment_type', 'reisekasse'),
      supabase.from('transactions')
        .select('id, date, description, amount, approved, category_id, membership_dismissed')
        .eq('type', 'inntekt')
        .eq('category_id', rkCatId || '00000000-0000-0000-0000-000000000000')
        .order('date', { ascending: false }),
      supabase.from('member_payments')
        .select('member_id, transaction_id, transactions!transaction_id(description)')
        .eq('payment_type', 'reisekasse')
        .not('transaction_id', 'is', null),
      supabase.from('fee_rates').select('*').eq('fee_type', 'reisekasse').order('effective_from', { ascending: false }),
      supabase.from('member_tx_boosts').select('member_id, pattern, boost'),
    ])

    setFeeRates(rRes.data || [])

    const boostsMap = {}
    for (const b of bRes.data || []) boostsMap[b.member_id] = b.boost
    setBoosts(boostsMap)

    const histMap = {}
    for (const p of hRes.data || []) {
      const desc = p.transactions?.description
      if (desc) {
        if (!histMap[p.member_id]) histMap[p.member_id] = []
        histMap[p.member_id].push(desc)
      }
    }
    setHistory(histMap)

    const allMembers = mRes.data || []
    setMembers(allMembers)
    setPayments(pRes.data || [])

    const allLinkedIds = new Set((hRes.data || []).map(p => p.transaction_id).filter(Boolean))
    const allTx = tRes.data || []
    const unmatchedTx = allTx.filter(t => !allLinkedIds.has(t.id) && !t.membership_dismissed)
    setUnmatched(unmatchedTx)
    setDismissed(allTx.filter(t => !allLinkedIds.has(t.id) && t.membership_dismissed))

    const rkMems = allMembers.filter(m => memberVisibleInYear(m, year))
    const newSuggestions = {}
    for (const t of unmatchedTx) {
      const match = getBestMatch(t, rkMems, histMap, boostsMap)
      if (match) newSuggestions[t.id] = match
    }
    setMatchSuggestions(newSuggestions)
    setLoading(false)
  }

  const rkMembers = members.filter(m => memberVisibleInYear(m, year))

  async function autoMatch() {
    if (!rkMembers.length || !unmatched.length) return
    setAutoMatching(true)
    setAutoLog([])
    const newSuggestions = { ...matchSuggestions }
    const autoLinked = []
    const matchedSlots = new Set()

    for (const tx of unmatched) {
      const match = getBestMatch(tx, rkMembers, history, boosts)
      if (!match) continue
      if (match.score >= 0.9) {
        const txYear = new Date(tx.date).getFullYear()
        const txMonth = new Date(tx.date).getMonth() + 1
        const isYearly = match.member.reisekasse_payment_type === 'yearly'
        const slotKey = `${match.member.id}:${isYearly ? 'all' : txMonth}`
        const alreadyCovered =
          payments.some(p =>
            p.member_id === match.member.id &&
            p.year === txYear &&
            (isYearly ? p.month === null : p.month === txMonth)
          ) || matchedSlots.has(slotKey)

        if (alreadyCovered) { newSuggestions[tx.id] = match; continue }
        if (isYearly && txMonth === 1) { newSuggestions[tx.id] = match; continue }

        if (!tx.approved) {
          await supabase.from('transactions').update({
            approved: true, approved_at: new Date().toISOString(),
          }).eq('id', tx.id)
        }
        const { error } = await supabase.from('member_payments').insert({
          member_id: match.member.id,
          year: txYear,
          month: isYearly ? null : txMonth,
          amount: Number(tx.amount),
          payment_date: tx.date,
          transaction_id: tx.id,
          payment_type: 'reisekasse',
        })
        if (!error) {
          autoLinked.push({ tx, member: match.member, score: match.score })
          matchedSlots.add(slotKey)
          await recordBoost(match.member.id, match.member.full_name)
        } else {
          newSuggestions[tx.id] = match
        }
      } else {
        newSuggestions[tx.id] = match
      }
    }
    setMatchSuggestions(newSuggestions)
    if (autoLinked.length > 0) setAutoLog(autoLinked)
    await load()
    setAutoMatching(false)
  }

  async function dismissTx(id) {
    await supabase.from('transactions').update({ membership_dismissed: true }).eq('id', id)
    const tx = unmatched.find(t => t.id === id)
    setUnmatched(prev => prev.filter(t => t.id !== id))
    setDismissed(prev => [...prev, tx].filter(Boolean))
  }

  async function restoreTx(id) {
    await supabase.from('transactions').update({ membership_dismissed: false }).eq('id', id)
    const tx = dismissed.find(t => t.id === id)
    setDismissed(prev => prev.filter(t => t.id !== id))
    if (tx) setUnmatched(prev => [tx, ...prev])
  }

  function getPayment(memberId, month) {
    return payments.find(p => p.member_id === memberId && (p.month === month || p.month === null))
  }

  async function toggleMonth(member, month) {
    const payment = getPayment(member.id, month)
    if (payment) {
      await supabase.from('member_payments').delete().eq('id', payment.id)
    } else {
      const rate = getRateForMonth(feeRates, year, month)
      const amount = member.reisekasse_payment_type === 'yearly'
        ? (rate.amount_yearly || rate.amount_monthly * 12)
        : rate.amount_monthly
      await supabase.from('member_payments').insert({
        member_id: member.id, year,
        month: member.reisekasse_payment_type === 'yearly' ? null : month,
        amount, payment_date: `${year}-${String(month).padStart(2,'0')}-15`,
        payment_type: 'reisekasse',
      })
    }
    load()
  }

  function totalPaid(memberId) {
    return payments.filter(p => p.member_id === memberId).reduce((s, p) => s + Number(p.amount), 0)
  }

  function expectedForMember(member) {
    if (member.reisekasse_payment_type === 'yearly') {
      const r = getRateForMonth(feeRates, year, 1)
      return r.amount_yearly || r.amount_monthly * 12
    }
    let total = 0
    for (let m = 1; m <= 12; m++) {
      const monthStr = `${year}-${String(m).padStart(2,'0')}-01`
      if (member.end_date && monthStr > member.end_date) break
      if (member.join_date && monthStr.slice(0,7) < member.join_date.slice(0,7)) continue
      total += getRateForMonth(feeRates, year, m).amount_monthly
    }
    return total
  }

  const currentRate = feeRates[0]
  const totalExpected = rkMembers.reduce((s, m) => s + expectedForMember(m), 0)
  const totalReceived = rkMembers.reduce((s, m) => s + totalPaid(m.id), 0)

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      {showFeeModal && (
        <FeeRateModal currentRate={currentRate} onClose={() => setShowFeeModal(false)} onSaved={load} />
      )}
      {linkTx && (
        <LinkModal
          transaction={linkTx}
          members={rkMembers}
          suggestedMemberId={linkSuggestedId}
          onClose={() => { setLinkTx(null); setLinkSuggestedId('') }}
          onSaved={load}
        />
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Reisekassen</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>
              {rkMembers.length} deltakere ·{' '}
              <span style={{ color: totalReceived >= totalExpected ? 'var(--green)' : 'var(--yellow)' }}>{fmt(totalReceived)}</span>
              {' '}/ {fmt(totalExpected)} innbetalt
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              Sats: {fmt(currentRate?.amount_monthly || 100)}/mnd
            </span>
            {isKasserer && (
              <button className="btn btn-sm btn-secondary" onClick={() => setShowFeeModal(true)}>Endre sats</button>
            )}
            {feeRates.length > 1 && (
              <button className="btn btn-sm btn-secondary" onClick={() => setShowFeeHistory(v => !v)}>
                {showFeeHistory ? 'Skjul' : 'Vis'} historikk
              </button>
            )}
          </div>
        </div>
        <div>
          <select className="form-select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {[CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {showFeeHistory && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Satshistorikk</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Gjelder fra</th><th className="text-right">Kr/mnd</th><th>Kommentar</th></tr>
              </thead>
              <tbody>
                {feeRates.map(r => (
                  <tr key={r.id}>
                    <td className="text-mono" style={{ fontSize: 12 }}>{r.effective_from}</td>
                    <td className="text-right" style={{ fontFamily: 'var(--font-mono)' }}>{fmt(r.amount_monthly)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CardGrid pageKey="reisekasse" cards={[
        {
          id: 'betalinger',
          content: (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 8 }}>Reisekasse-betalinger</div>

              {rkMembers.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">✈</div>
                  <div className="empty-state-text">
                    Ingen deltakere i Reisekassen for {year}.<br />
                    Sett «Reisekasse betalingstype» på hvert medlem i Medlemsregisteret.
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ minWidth: 980, borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '10px 12px', minWidth: 160, borderBottom: '1px solid var(--border)' }}>Navn</th>
                        {MONTHS.map(m => (
                          <th key={m} style={{ textAlign: 'center', padding: '10px 4px', minWidth: 58, fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{m}</th>
                        ))}
                        <th style={{ textAlign: 'right', padding: '10px 12px', minWidth: 130, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 11 }}>
                          Innbetalt / Forventet
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rkMembers.map(member => {
                        const paid = totalPaid(member.id)
                        const expected = expectedForMember(member)
                        const hasYearly = payments.some(p => p.member_id === member.id && p.month === null)
                        return (
                          <tr key={member.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{member.full_name}</div>
                              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                                {member.reisekasse_payment_type === 'yearly' ? 'Årsbetaler' : 'Månedsbetaler'}
                                {member.end_date && <span style={{ color: 'var(--red)', marginLeft: 4 }}>· sluttet {member.end_date}</span>}
                              </div>
                            </td>
                            {MONTHS.map((_, i) => {
                              const month = i + 1
                              const payment = getPayment(member.id, month)
                              const isPast = year < CURRENT_YEAR || (year === CURRENT_YEAR && month <= CURRENT_MONTH)
                              const monthStr = `${year}-${String(month).padStart(2,'0')}-01`
                              const afterEnd = member.end_date && monthStr > member.end_date
                              const rate = getRateForMonth(feeRates, year, month)
                              let bg = 'transparent', color = 'var(--border)', label = '—'
                              if (afterEnd) { bg = 'var(--surface)'; color = 'var(--graphite)'; label = '' }
                              else if (payment) { bg = 'var(--green)'; color = '#fff'; label = hasYearly ? '✓' : String(Math.round(payment.amount)) }
                              else if (isPast) { bg = '#c0392b22'; color = 'var(--red)' }
                              else { color = 'var(--graphite)' }
                              return (
                                <td key={month} style={{ padding: 3, textAlign: 'center' }}>
                                  <div
                                    title={isKasserer && !afterEnd ? `${rate.amount_monthly} kr — klikk for å registrere` : ''}
                                    style={{ borderRadius: 4, padding: '5px 2px', fontSize: 11, fontFamily: 'var(--font-mono)', background: bg, color, cursor: isKasserer && !afterEnd ? 'pointer' : 'default', userSelect: 'none', fontWeight: payment ? 600 : 400 }}
                                    onClick={() => isKasserer && !afterEnd && toggleMonth(member, month)}
                                  >{label}</div>
                                </td>
                              )
                            })}
                            <td style={{ textAlign: 'right', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                              <span style={{ color: paid >= expected ? 'var(--green)' : paid > 0 ? 'var(--yellow)' : 'var(--red)', fontWeight: 600 }}>
                                {paid.toLocaleString('nb-NO')}
                              </span>
                              <span style={{ color: 'var(--muted)' }}> / {expected.toLocaleString('nb-NO')}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {(unmatched.length > 0 || dismissed.length > 0) && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>
                      Ufordelte innbetalinger
                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                        {unmatched.length} transaksjon{unmatched.length !== 1 ? 'er' : ''} ikke koblet til noe medlem
                      </span>
                    </div>
                    {isKasserer && unmatched.length > 0 && (
                      <button className="btn btn-sm btn-primary" disabled={autoMatching} onClick={autoMatch} style={{ marginLeft: 'auto' }}>
                        {autoMatching ? 'Matcher…' : 'Auto-koble alle'}
                      </button>
                    )}
                  </div>

                  {autoLog.length > 0 && (
                    <div style={{ marginBottom: 12, padding: '10px 14px', background: '#1a3a1a', border: '1px solid var(--green)', borderRadius: 6, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                          {autoLog.length} betaling{autoLog.length > 1 ? 'er' : ''} auto-koblet (≥90% sikkerhet)
                        </span>
                        <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }} onClick={() => setAutoLog([])}>✕</button>
                      </div>
                      {autoLog.map(({ tx, member, score }, i) => (
                        <div key={i} style={{ color: 'var(--dim)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 2 }}>
                          {tx.date} · {tx.description.slice(0, 40)} → <strong style={{ color: 'var(--text)' }}>{member.full_name}</strong> <ConfidenceBar score={score} />
                        </div>
                      ))}
                    </div>
                  )}

                  {unmatched.length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Dato</th><th>Beskrivelse</th>
                            <th className="text-right">Beløp</th><th>Sats</th><th>Status</th>
                            <th>Forslag</th>
                            {isKasserer && <th style={{ width: 180 }} />}
                          </tr>
                        </thead>
                        <tbody>
                          {unmatched.map(t => {
                            const suggestion = matchSuggestions[t.id]
                            const rate = feeRates.find(r => r.amount_monthly === Number(t.amount) || r.amount_yearly === Number(t.amount))
                            return (
                              <tr key={t.id}>
                                <td className="text-mono" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                                  {t.date}
                                  {t.date.slice(0, 4) !== String(year) && (
                                    <span style={{ marginLeft: 6, background: 'var(--graphite)', color: 'var(--yellow)', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>{t.date.slice(0, 4)}</span>
                                  )}
                                </td>
                                <td style={{ fontSize: 13 }}>{t.description}</td>
                                <td className="text-right amount-positive">{fmt(t.amount)}</td>
                                <td>
                                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: rate ? 'var(--green)' : 'var(--yellow)' }}>
                                    {rate ? `✓ ${rate.amount_monthly}/mnd` : '± avvik'}
                                  </span>
                                </td>
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
                                  ) : <span style={{ fontSize: 11, color: 'var(--graphite)' }}>—</span>}
                                </td>
                                {isKasserer && (
                                  <td style={{ whiteSpace: 'nowrap' }}>
                                    <div className="flex gap-8">
                                      {suggestion ? (
                                        <>
                                          <button className="btn btn-sm btn-primary" onClick={() => { setLinkTx(t); setLinkSuggestedId(suggestion.member.id) }}>Bekreft</button>
                                          <button className="btn btn-sm btn-secondary" onClick={() => { setLinkTx(t); setLinkSuggestedId('') }}>Annet</button>
                                        </>
                                      ) : (
                                        <button className="btn btn-sm btn-secondary" onClick={() => { setLinkTx(t); setLinkSuggestedId('') }}>
                                          {t.approved ? 'Koble til' : 'Godkjenn og koble'}
                                        </button>
                                      )}
                                      <button className="btn btn-sm" title="Fjern fra listen"
                                        style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', padding: '2px 7px' }}
                                        onClick={() => dismissTx(t.id)}>✕</button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {dismissed.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setShowDismissed(v => !v)} style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {showDismissed ? '▴ Skjul' : '▾ Vis'} {dismissed.length} fjernede innbetalinger
                      </button>
                      {showDismissed && (
                        <div className="card" style={{ marginTop: 8 }}>
                          <table>
                            <thead><tr><th>Dato</th><th>Beskrivelse</th><th className="text-right">Beløp</th><th /></tr></thead>
                            <tbody>
                              {dismissed.map(t => (
                                <tr key={t.id} style={{ opacity: 0.65 }}>
                                  <td className="text-mono" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.date}</td>
                                  <td style={{ fontSize: 13 }}>{t.description}</td>
                                  <td className="text-right amount-positive">{fmt(t.amount)}</td>
                                  <td><button className="btn btn-sm btn-secondary" onClick={() => restoreTx(t.id)}>↩ Gjenopprett</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ),
        },
      ]} />
    </div>
  )
}
