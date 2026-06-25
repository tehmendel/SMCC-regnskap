import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fmt, fmtDate } from '../lib/format'

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('vendors').select('*, categories(name)').order('transaction_count', { ascending: false })
      .then(({ data }) => { setVendors(data || []); setLoading(false) })
  }, [])

  const filtered = vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))

  function confColor(c) {
    if (c >= 0.95) return 'var(--green)'
    if (c >= 0.75) return 'var(--yellow)'
    return 'var(--red)'
  }

  if (loading) return <div className="text-muted">Laster…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Leverandørregister</div>
          <div className="page-sub">{vendors.length} leverandører – bygges automatisk fra transaksjoner</div>
        </div>
      </div>

      <div className="form-group" style={{ maxWidth: 360, marginBottom: 20 }}>
        <input className="form-input" placeholder="Søk leverandør…" value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Leverandør</th>
                <th>Foreslått kategori</th>
                <th>Avdeling</th>
                <th className="text-right">Transaksjoner</th>
                <th className="text-right">Totalt beløp</th>
                <th>Sist sett</th>
                <th>Konfidens</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 500 }}>{v.name}</td>
                  <td style={{ color: 'var(--dim)' }}>{v.categories?.name || '—'}</td>
                  <td style={{ color: 'var(--dim)' }}>{v.suggested_department || '—'}</td>
                  <td className="text-right text-mono">{v.transaction_count}</td>
                  <td className="text-right text-mono" style={{ fontSize: 12 }}>{fmt(v.total_amount)}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(v.last_seen)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 48, height: 4, background: 'var(--graphite)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${v.confidence * 100}%`, height: '100%', background: confColor(v.confidence), borderRadius: 2 }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: confColor(v.confidence) }}>
                        {(v.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
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
