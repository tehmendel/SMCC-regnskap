import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('audit_log')
      .select('*, profiles(full_name)')
      .order('changed_at', { ascending: false })
      .limit(100)
      .then(({ data }) => { setLogs(data || []); setLoading(false) })
  }, [])

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Endringslogg</div>
          <div className="page-sub">Komplett sporbarhet – siste 100 hendelser</div>
        </div>
      </div>

      <div className="card">
        {logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-text">Ingen hendelser registrert ennå</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tidspunkt</th>
                  <th>Bruker</th>
                  <th>Tabell</th>
                  <th>Operasjon</th>
                  <th>Post-ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="text-mono" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.changed_at).toLocaleString('nb-NO')}
                    </td>
                    <td>{log.profiles?.full_name ?? '—'}</td>
                    <td><span className="text-mono" style={{ color: 'var(--dim)', fontSize: 12 }}>{log.table_name}</span></td>
                    <td>
                      <span className={`badge ${
                        log.operation === 'INSERT' ? 'badge-approved' :
                        log.operation === 'DELETE' ? 'badge-utgift' : 'badge-pending'
                      }`}>{log.operation}</span>
                    </td>
                    <td className="text-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {log.record_id?.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
