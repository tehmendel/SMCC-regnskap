import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const ROLE_LABELS = { admin: 'Admin', kasserer: 'Kasserer', medlem: 'Medlem' }

export default function Impersonate() {
  const { realProfile, startImpersonation, isImpersonating, stopImpersonation } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.from('profiles').select('*').order('full_name')
      .then(({ data }) => { setProfiles(data || []); setLoading(false) })
  }, [])

  function impersonate(p) {
    startImpersonation(p)
    navigate('/')
  }

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Impersoner bruker</div>
          <div className="page-sub">Se appen slik en annen bruker opplever den</div>
        </div>
        {isImpersonating && (
          <button className="btn btn-danger" onClick={() => { stopImpersonation(); navigate('/') }}>
            Avslutt impersonering
          </button>
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Navn</th>
              <th>E-post</th>
              <th>Rolle</th>
              <th style={{ width: 160 }} />
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => {
              const isSelf = p.id === realProfile?.id
              return (
                <tr key={p.id} style={{ opacity: isSelf ? 0.4 : 1 }}>
                  <td style={{ fontWeight: 500 }}>{p.full_name}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{p.email}</td>
                  <td>
                    <span className="badge" style={{ background: 'var(--surface-3,#333)', color: 'var(--dim)' }}>
                      {ROLE_LABELS[p.role] || p.role}
                    </span>
                  </td>
                  <td>
                    {isSelf
                      ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>Dette er deg</span>
                      : <button className="btn btn-sm btn-primary" onClick={() => impersonate(p)}>
                          Logg inn som
                        </button>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
