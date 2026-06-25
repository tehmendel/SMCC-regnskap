import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { fmt, fmtDate } from '../../lib/format'

const STATUS_COLORS = { planlagt: 'badge-pending', aktiv: 'badge-approved', avsluttet: 'badge-kasserer', arkivert: 'badge-member' }

function NewArrangementModal({ onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({ name: '', year: new Date().getFullYear(), start_date: '', end_date: '', location: '', description: '' })
  const [saving, setSaving] = useState(false)

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const { data: arr } = await supabase.from('arrangements').insert({ ...form, created_by: profile.id, updated_by: profile.id }).select().single()
    if (arr) {
      // Legg til standardavdelinger
      const depts = ['Bar','Kjøkken','Camp','Arrangement','Innmelding']
      await supabase.from('arrangement_departments').insert(
        depts.map((name, i) => ({ arrangement_id: arr.id, name, sort_order: i + 1 }))
      )
    }
    onSaved()
    onClose()
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Nytt arrangement</div>
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">Navn</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="f.eks. Fulltreffet 2027" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">År</label>
              <input className="form-input" type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Fra dato</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Til dato</label>
              <input className="form-input" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Sted</label>
            <input className="form-input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
          <div className="flex gap-8 mt-16">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Avbryt</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Oppretter…' : 'Opprett'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Arrangements() {
  const { isKasserer } = useAuth()
  const [arrangements, setArrangements] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase.from('arrangements').select('*').order('year', { ascending: false }).order('start_date', { ascending: false })
    setArrangements(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="text-muted">Laster…</div>

  const grouped = arrangements.reduce((acc, a) => {
    acc[a.year] = acc[a.year] || []
    acc[a.year].push(a)
    return acc
  }, {})

  return (
    <div>
      {showModal && <NewArrangementModal onClose={() => setShowModal(false)} onSaved={load} />}
      <div className="page-header">
        <div>
          <div className="page-title">Arrangementer</div>
          <div className="page-sub">Prosjektregnskap per arrangement</div>
        </div>
        {isKasserer && <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nytt arrangement</button>}
      </div>

      {Object.entries(grouped).sort((a, b) => b[0] - a[0]).map(([year, arrs]) => (
        <div key={year} style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>{year}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {arrs.map(a => (
              <Link key={a.id} to={`/arrangementer/${a.id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--orange)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--white)' }}>{a.name}</div>
                    <span className={`badge ${STATUS_COLORS[a.status] || 'badge-pending'}`}>{a.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {a.location && <span>{a.location} · </span>}
                    {a.start_date && <span>{fmtDate(a.start_date)}</span>}
                    {a.participant_count && <span> · {a.participant_count} deltakere</span>}
                  </div>
                  {a.budget_total && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--dim)' }}>
                      Budsjett: {fmt(a.budget_total)}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {arrangements.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🏕️</div>
          <div className="empty-state-text">Ingen arrangementer ennå. Opprett ditt første!</div>
        </div>
      )}
    </div>
  )
}
