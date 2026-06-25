import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmt } from '../lib/format'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des']
const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

function MemberModal({ member, onClose, onSaved }) {
  const [form, setForm] = useState(member || {
    full_name: '', email: '', phone: '',
    payment_type: 'monthly', join_date: '', active: true, notes: '',
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

function LinkModal({ transaction, members, year, onClose, onSaved }) {
  const [memberId, setMemberId] = useState('')
  const [month, setMonth] = useState(new Date(transaction.date).getMonth() + 1)
  const [saving, setSaving] = useState(false)
  const selected = members.find(m => m.id === memberId)

  async function save() {
    if (!memberId) return
    setSaving(true)
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
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [linkTx, setLinkTx] = useState(null)

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)
    const [mRes, pRes, tRes] = await Promise.all([
      supabase.from('members').select('*').order('full_name'),
      supabase.from('member_payments').select('*').eq('year', year),
      supabase.from('transactions')
        .select('id, date, description, amount')
        .eq('type', 'inntekt')
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
        .order('date', { ascending: false }),
    ])
    const allPayments = pRes.data || []
    setMembers(mRes.data || [])
    setPayments(allPayments)

    const linkedIds = new Set(allPayments.map(p => p.transaction_id).filter(Boolean))
    setUnmatched((tRes.data || []).filter(t => !linkedIds.has(t.id) && (t.amount == 300 || t.amount == 3600)))
    setLoading(false)
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

  const activeMembers = members.filter(m => m.active)
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
          onClose={() => setLinkTx(null)}
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
                    </div>
                  </td>
                  {MONTH_NAMES.map((_, i) => {
                    const month = i + 1
                    const paidThisMonth = isPaid(member.id, month)
                    const isPast = year < CURRENT_YEAR || (year === CURRENT_YEAR && month <= CURRENT_MONTH)
                    const isFuture = year > CURRENT_YEAR || (year === CURRENT_YEAR && month > CURRENT_MONTH)

                    let bg = 'transparent'
                    let color = 'var(--border)'
                    let label = '—'

                    if (paidThisMonth) {
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
                          title={isKasserer ? 'Klikk for å registrere / fjerne betaling' : ''}
                          style={{
                            borderRadius: 4,
                            padding: '5px 2px',
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                            background: bg,
                            color,
                            cursor: isKasserer ? 'pointer' : 'default',
                            userSelect: 'none',
                            fontWeight: paidThisMonth ? 600 : 400,
                          }}
                          onClick={() => isKasserer && toggleMonth(member, month)}
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
          <div style={{ fontWeight: 500, marginBottom: 10 }}>
            Ufordelte innbetalinger
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
              {unmatched.length} transaksjoner på 300 eller 3 600 kr som ikke er koblet til et medlem
            </span>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dato</th>
                    <th>Beskrivelse</th>
                    <th className="text-right">Beløp</th>
                    {isKasserer && <th />}
                  </tr>
                </thead>
                <tbody>
                  {unmatched.map(t => (
                    <tr key={t.id}>
                      <td className="text-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{t.date}</td>
                      <td style={{ fontSize: 13 }}>{t.description}</td>
                      <td className="text-right amount-positive">{fmt(t.amount)}</td>
                      {isKasserer && (
                        <td>
                          <button className="btn btn-sm btn-secondary" onClick={() => setLinkTx(t)}>
                            Koble til medlem
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
