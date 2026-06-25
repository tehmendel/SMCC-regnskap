import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const ROLES = ['admin', 'kasserer', 'medlem']

export default function Users() {
  const { profile: myProfile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function changeRole(id, role) {
    setSaving(id)
    await supabase.from('profiles').update({ role, updated_at: new Date().toISOString() }).eq('id', id)
    await load()
    setSaving(null)
  }

  async function toggleActive(user) {
    setSaving(user.id)
    await supabase.from('profiles').update({ active: !user.active }).eq('id', user.id)
    await load()
    setSaving(null)
  }

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Brukere</div>
          <div className="page-sub">{users.length} registrerte brukere</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Navn</th>
                <th>Rolle</th>
                <th>Status</th>
                <th>Registrert</th>
                <th>Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    {u.full_name}
                    {u.id === myProfile?.id && <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 8 }}>(deg)</span>}
                  </td>
                  <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                  <td>
                    <span className={`badge ${u.active ? 'badge-approved' : 'badge-pending'}`}>
                      {u.active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="text-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {new Date(u.created_at).toLocaleDateString('nb-NO')}
                  </td>
                  <td>
                    {u.id !== myProfile?.id && (
                      <div className="flex gap-8">
                        <select
                          className="form-select"
                          style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                          value={u.role}
                          disabled={saving === u.id}
                          onChange={e => changeRole(u.id, e.target.value)}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button
                          className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-secondary'}`}
                          disabled={saving === u.id}
                          onClick={() => toggleActive(u)}
                        >
                          {u.active ? 'Deaktiver' : 'Aktiver'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
