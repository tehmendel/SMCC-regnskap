import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmt } from '../lib/format'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des']
const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

function getRateForMonth(feeRates, year, month) {
  const monthStart = `${year}-${String(month).padStart(2,'0')}-01`
  const rates = feeRates
    .filter(r => r.fee_type === 'reisekasse' && r.effective_from <= monthStart)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
  return rates[0]?.amount_monthly || 100
}

function FeeRateModal({ currentRate, onClose, onSaved }) {
  const { profile } = useAuth()
  const [amount, setAmount] = useState(currentRate || '100')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('fee_rates').insert({
      fee_type: 'reisekasse',
      amount_monthly: parseFloat(amount),
      amount_yearly: null,
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
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Endringen er ikke tilbakevirkende — gjelder kun nye registreringer fra og med denne datoen.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Kommentar (valgfritt)</label>
            <input className="form-input" type="text" value={notes}
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

export default function Reisekasse() {
  const { isKasserer } = useAuth()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [members, setMembers] = useState([])
  const [payments, setPayments] = useState([])
  const [feeRates, setFeeRates] = useState([])
  const [feeHistory, setFeeHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFeeModal, setShowFeeModal] = useState(false)

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)
    const [mRes, pRes, rRes] = await Promise.all([
      supabase.from('members').select('*').order('full_name'),
      supabase.from('reisekasse_payments').select('*').eq('year', year),
      supabase.from('fee_rates').select('*').eq('fee_type', 'reisekasse').order('effective_from', { ascending: false }),
    ])
    setMembers(mRes.data || [])
    setPayments(pRes.data || [])
    setFeeRates(rRes.data || [])
    setFeeHistory(rRes.data || [])
    setLoading(false)
  }

  function getPayment(memberId, month) {
    return payments.find(p => p.member_id === memberId && p.month === month)
  }

  async function toggleMonth(member, month) {
    const payment = getPayment(member.id, month)
    if (payment) {
      await supabase.from('reisekasse_payments').delete().eq('id', payment.id)
    } else {
      const amount = getRateForMonth(feeRates, year, month)
      await supabase.from('reisekasse_payments').insert({
        member_id: member.id,
        year,
        month,
        amount,
        paid_date: `${year}-${String(month).padStart(2,'0')}-15`,
      })
    }
    load()
  }

  function totalPaid(memberId) {
    return payments.filter(p => p.member_id === memberId).reduce((s, p) => s + Number(p.amount), 0)
  }

  function expectedForYear(year) {
    let total = 0
    for (let m = 1; m <= 12; m++) total += getRateForMonth(feeRates, year, m)
    return total
  }

  const currentRate = feeRates[0]?.amount_monthly
  const reisekasseMembers = members.filter(m => {
    if (!m.in_reisekasse) return false
    if (m.active) return true
    if (!m.end_date) return false
    return new Date(m.end_date).getFullYear() === year
  })
  const expectedPerMember = expectedForYear(year)
  const totalExpected = reisekasseMembers.length * expectedPerMember
  const totalReceived = payments.reduce((s, p) => s + Number(p.amount), 0)

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      {showFeeModal && (
        <FeeRateModal
          currentRate={currentRate}
          onClose={() => setShowFeeModal(false)}
          onSaved={load}
        />
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Reisekassen</div>
          <div className="page-sub">
            {reisekasseMembers.length} deltakere ·{' '}
            <span style={{ color: totalReceived >= totalExpected ? 'var(--green)' : 'var(--yellow)' }}>
              {fmt(totalReceived)}
            </span>{' '}/ {fmt(totalExpected)} innbetalt ·{' '}
            <span style={{ color: 'var(--muted)' }}>Sats: {fmt(currentRate || 100)}/mnd</span>
            {isKasserer && (
              <button className="btn btn-sm btn-secondary" style={{ marginLeft: 12 }} onClick={() => setShowFeeModal(true)}>
                Endre sats
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-8">
          <select className="form-select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {[CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Payment grid */}
      <div className="card" style={{ marginBottom: 24, overflowX: 'auto' }}>
        {reisekasseMembers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧳</div>
            <div className="empty-state-text">
              Ingen deltakere i Reisekassen for {year}.<br />
              Aktiver deltakere i Medlemsregisteret (huk av «Med i Reisekassen»).
            </div>
          </div>
        ) : (
          <table style={{ minWidth: 980, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', minWidth: 160, borderBottom: '1px solid var(--border)' }}>Navn</th>
                {MONTH_NAMES.map(m => (
                  <th key={m} style={{ textAlign: 'center', padding: '10px 4px', minWidth: 50, fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{m}</th>
                ))}
                <th style={{ textAlign: 'right', padding: '10px 12px', minWidth: 120, borderBottom: '1px solid var(--border)', fontSize: 11, whiteSpace: 'nowrap' }}>
                  Innbetalt / Forventet
                </th>
              </tr>
            </thead>
            <tbody>
              {reisekasseMembers.map(member => {
                const paid = totalPaid(member.id)
                const expected = expectedPerMember
                const afterEnd = (month) => {
                  const monthStr = `${year}-${String(month).padStart(2,'0')}-01`
                  return member.end_date && monthStr > member.end_date
                }
                return (
                  <tr key={member.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{member.full_name}</div>
                      {member.end_date && (
                        <div style={{ fontSize: 10, color: 'var(--red)' }}>sluttet {member.end_date}</div>
                      )}
                    </td>
                    {MONTH_NAMES.map((_, i) => {
                      const month = i + 1
                      const payment = getPayment(member.id, month)
                      const isPast = year < CURRENT_YEAR || (year === CURRENT_YEAR && month <= CURRENT_MONTH)
                      const gone = afterEnd(month)
                      const rate = getRateForMonth(feeRates, year, month)

                      let bg = 'transparent', color = 'var(--border)', label = '—'
                      if (gone) {
                        bg = 'var(--surface)'; color = 'var(--graphite)'; label = ''
                      } else if (payment) {
                        bg = 'var(--green)'; color = '#fff'; label = String(payment.amount)
                      } else if (isPast) {
                        bg = '#c0392b22'; color = 'var(--red)'
                      } else {
                        color = 'var(--graphite)'
                      }

                      return (
                        <td key={month} style={{ padding: 3, textAlign: 'center' }}>
                          <div
                            title={isKasserer && !gone ? `${rate} kr/mnd — klikk for å registrere` : ''}
                            style={{
                              borderRadius: 4, padding: '5px 2px', fontSize: 11,
                              fontFamily: 'var(--font-mono)', background: bg, color,
                              cursor: isKasserer && !gone ? 'pointer' : 'default',
                              userSelect: 'none', fontWeight: payment ? 600 : 400,
                            }}
                            onClick={() => isKasserer && !gone && toggleMonth(member, month)}
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Satshistorikk */}
      {feeHistory.length > 1 && (
        <div className="card">
          <div className="card-title">Satshistorikk</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Gjelder fra</th><th className="text-right">Kr/mnd</th><th>Kommentar</th></tr>
              </thead>
              <tbody>
                {feeHistory.map(r => (
                  <tr key={r.id}>
                    <td className="text-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{r.effective_from}</td>
                    <td className="text-right" style={{ fontFamily: 'var(--font-mono)' }}>{fmt(r.amount_monthly)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
