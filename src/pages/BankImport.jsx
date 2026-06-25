import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmt } from '../lib/format'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function BankImport() {
  const { profile } = useAuth()
  const [analyzing, setAnalyzing] = useState(false)
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(0)
  const inputRef = useRef()

  async function analyze(file) {
    setError('')
    setRows([])
    setImportDone(0)
    setAnalyzing(true)

    try {
      const { data: cats } = await supabase.from('categories').select('*').eq('active', true).order('name')
      setCategories(cats || [])

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const formData = new FormData()
      formData.append('file', file)
      formData.append('categories', JSON.stringify(cats || []))

      const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-bank-statement`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const json = await res.json()
      if (json.error) throw new Error(json.error)

      setRows(json.transactions.map((t, i) => ({ ...t, _id: i, selected: true })))
    } catch (e) {
      setError(e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  function handleFiles(files) {
    const file = files?.[0]
    if (!file) return
    analyze(file)
  }

  function updateRow(id, field, value) {
    setRows(prev => prev.map(r => r._id === id ? { ...r, [field]: value } : r))
  }

  async function importSelected() {
    setImporting(true)
    const selected = rows.filter(r => r.selected)
    const payload = selected.map(r => ({
      date: r.date,
      description: r.description,
      amount: parseFloat(r.amount),
      type: r.type,
      category_id: r.suggested_category_id || null,
      notes: r.notes || '',
      created_by: profile.id,
      updated_by: profile.id,
      approved: false,
    }))
    const { error: err } = await supabase.from('transactions').insert(payload)
    if (err) setError(err.message)
    else { setImportDone(selected.length); setRows([]) }
    setImporting(false)
  }

  const selectedCount = rows.filter(r => r.selected).length

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Importer kontoutskrift</div>
          <div className="page-sub">Last opp PDF eller CSV — AI analyserer og foreslår kategorier</div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {importDone > 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {importDone} transaksjoner importert
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
            De er lagt til i transaksjonslisten og venter på godkjenning.
          </div>
          <button className="btn btn-primary" onClick={() => setImportDone(0)}>
            Last opp ny kontoutskrift
          </button>
        </div>
      )}

      {!analyzing && rows.length === 0 && !importDone && (
        <div
          className="card"
          style={{
            padding: 56,
            textAlign: 'center',
            cursor: 'pointer',
            border: '2px dashed var(--border)',
            transition: 'border-color 0.15s',
          }}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        >
          <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.5 }}>↑</div>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Dra og slipp kontoutskrift her</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
            Støtter PDF og CSV fra norske banker
          </div>
          <button className="btn btn-secondary" onClick={e => { e.stopPropagation(); inputRef.current?.click() }}>
            Velg fil
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.csv,.txt"
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />
        </div>
      )}

      {analyzing && (
        <div className="card" style={{ padding: 56, textAlign: 'center' }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>Analyserer kontoutskrift…</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            AI leser dokumentet og foreslår kategorier. Dette tar gjerne 15–30 sekunder.
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {selectedCount} av {rows.length} transaksjoner valgt for import
            </div>
            <div className="flex gap-8">
              <button className="btn btn-secondary btn-sm" onClick={() => setRows([])}>Avbryt</button>
              <button
                className="btn btn-primary"
                disabled={importing || selectedCount === 0}
                onClick={importSelected}
              >
                {importing ? 'Importerer…' : `Importer ${selectedCount}`}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={rows.every(r => r.selected)}
                        onChange={e => setRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))}
                      />
                    </th>
                    <th>Dato</th>
                    <th>Beskrivelse</th>
                    <th>Type</th>
                    <th className="text-right">Beløp</th>
                    <th>Foreslått kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r._id} style={{ opacity: r.selected ? 1 : 0.35 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={r.selected}
                          onChange={e => updateRow(r._id, 'selected', e.target.checked)}
                        />
                      </td>
                      <td className="text-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {r.date}
                      </td>
                      <td style={{ maxWidth: 300, fontSize: 13 }}>{r.description}</td>
                      <td>
                        <span className={`badge badge-${r.type}`}>{r.type}</span>
                      </td>
                      <td className="text-right">
                        <span className={r.type === 'inntekt' ? 'amount-positive' : 'amount-negative'}>
                          {r.type === 'utgift' ? '−' : '+'}{fmt(r.amount)}
                        </span>
                      </td>
                      <td>
                        <select
                          className="form-select"
                          style={{ fontSize: 12, padding: '3px 8px' }}
                          value={r.suggested_category_id || ''}
                          onChange={e => {
                            const cat = categories.find(c => c.id === e.target.value)
                            updateRow(r._id, 'suggested_category_id', e.target.value || null)
                            if (cat) updateRow(r._id, 'suggested_category_name', cat.name)
                          }}
                        >
                          <option value="">Ingen kategori</option>
                          {categories
                            .filter(c => c.type === r.type)
                            .map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
