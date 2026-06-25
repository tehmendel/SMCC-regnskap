import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmt } from '../lib/format'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9æøå]/g, '').trim()
}

function fmtSeconds(s) {
  if (s < 60) return `${Math.round(s)} sek`
  return `${Math.round(s / 60)} min`
}

export default function BankImport() {
  const { profile } = useAuth()
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState([])
  const [analyzeStart, setAnalyzeStart] = useState(null)
  const [rows, setRows] = useState([])
  const [vendorSuggestions, setVendorSuggestions] = useState([])
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(0)
  const inputRef = useRef()
  const logRef = useRef()

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  async function analyze(file) {
    setError('')
    setRows([])
    setVendorSuggestions([])
    setImportDone(0)
    setLogs([])
    setProgress(0)
    setAnalyzeStart(Date.now())
    setAnalyzing(true)

    try {
      const [catsRes, vendorsRes, sessionRes] = await Promise.all([
        supabase.from('categories').select('*').eq('active', true).order('name'),
        supabase.from('vendors').select('name'),
        supabase.auth.getSession(),
      ])
      const cats = catsRes.data || []
      setCategories(cats)
      const existingNorm = new Set((vendorsRes.data || []).map(v => normalize(v.name)))
      const token = sessionRes.data.session?.access_token

      const formData = new FormData()
      formData.append('file', file)
      formData.append('categories', JSON.stringify(cats))

      const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-bank-statement`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) {
        let msg = `Serverfeil (${res.status})`
        try {
          const text = await res.text()
          try { msg = JSON.parse(text)?.error || msg } catch { msg = text.slice(0, 200) || msg }
        } catch (_) {}
        throw new Error(msg)
      }
      if (!res.body) {
        throw new Error('Nettleseren støtter ikke strømmende svar. Bruk Chrome eller Firefox.')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let finalResult = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const parts = sseBuffer.split('\n\n')
        sseBuffer = parts.pop() ?? ''

        for (const part of parts) {
          let eventType = ''
          let eventData = ''
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            if (line.startsWith('data: ')) eventData = line.slice(6).trim()
          }
          if (!eventType || !eventData) continue

          let data
          try { data = JSON.parse(eventData) } catch { continue }

          if (eventType === 'log') {
            setLogs(prev => [...prev, data.message])
          } else if (eventType === 'progress') {
            setProgress(data.percent)
          } else if (eventType === 'result') {
            finalResult = data
          } else if (eventType === 'error') {
            throw new Error(data.message)
          }
        }
      }

      if (!finalResult) throw new Error('Ingen data mottatt fra serveren. Prøv igjen.')

      setRows((finalResult.transactions || []).map((t, i) => ({ ...t, _id: i, selected: true })))
      const newVendors = (finalResult.vendors || [])
        .filter(v => v.name && !existingNorm.has(normalize(v.name)))
        .map((v, i) => ({ ...v, _id: i, include: true }))
      setVendorSuggestions(newVendors)

    } catch (e) {
      const msg = e.message || 'Ukjent feil'
      setError(msg)
      setLogs(prev => [...prev, `Feil: ${msg}`])
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

  function updateVendor(id, field, value) {
    setVendorSuggestions(prev => prev.map(v => v._id === id ? { ...v, [field]: value } : v))
  }

  async function importAll() {
    setImporting(true)

    const selected = rows.filter(r => r.selected)
    const txPayload = selected.map(r => ({
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

    const { error: txErr } = await supabase.from('transactions').insert(txPayload)
    if (txErr) { setError(txErr.message); setImporting(false); return }

    const vendorsToSave = vendorSuggestions.filter(v => v.include && v.name?.trim())
    if (vendorsToSave.length > 0) {
      await supabase.from('vendors').upsert(
        vendorsToSave.map(v => ({
          name: v.name.trim(),
          normalized_name: normalize(v.name),
          suggested_category_id: v.suggested_category_id || null,
          transaction_count: v.transaction_count || 1,
          total_amount: v.total_amount || 0,
          confidence: 0.7,
          last_seen: new Date().toISOString().slice(0, 10),
          approved: false,
        })),
        { onConflict: 'name', ignoreDuplicates: true }
      )
    }

    setImportDone(selected.length)
    setRows([])
    setVendorSuggestions([])
    setImporting(false)
  }

  const selectedCount = rows.filter(r => r.selected).length
  const includedVendors = vendorSuggestions.filter(v => v.include).length

  const elapsed = analyzeStart ? (Date.now() - analyzeStart) / 1000 : 0
  const estimatedRemaining = analyzing && progress > 15
    ? Math.max(0, elapsed / (progress / 100) - elapsed)
    : null

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Importer kontoutskrift</div>
          <div className="page-sub">Last opp PDF eller CSV — AI analyserer og foreslår kategorier</div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <strong>Feil:</strong> {error}
        </div>
      )}

      {importDone > 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{importDone} transaksjoner importert</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
            Eventuelle leverandørforslag venter på godkjenning i Leverandørregisteret.
          </div>
          <button className="btn btn-primary" onClick={() => { setImportDone(0); setLogs([]); setProgress(0) }}>
            Last opp ny kontoutskrift
          </button>
        </div>
      )}

      {!analyzing && rows.length === 0 && !importDone && (
        <div
          className="card"
          style={{ padding: 56, textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--border)' }}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        >
          <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.5 }}>↑</div>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Dra og slipp kontoutskrift her</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Støtter PDF og CSV</div>
          <button className="btn btn-secondary" onClick={e => { e.stopPropagation(); inputRef.current?.click() }}>
            Velg fil
          </button>
          <input ref={inputRef} type="file" accept=".pdf,.csv,.txt" style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)} />
        </div>
      )}

      {analyzing && (
        <div className="card" style={{ padding: 24 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontWeight: 500 }}>Analyserer kontoutskrift…</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              {progress.toFixed(0)}%
              {estimatedRemaining !== null && (
                <span style={{ marginLeft: 12 }}>ca. {fmtSeconds(estimatedRemaining)} gjenstår</span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, background: 'var(--graphite)', borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: progress === 100 ? 'var(--green)' : 'var(--accent)',
              borderRadius: 3,
              transition: 'width 0.4s ease',
            }} />
          </div>

          {/* Log */}
          <div
            ref={logRef}
            style={{
              height: 220,
              overflowY: 'auto',
              background: 'var(--surface)',
              borderRadius: 6,
              padding: '10px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.7,
              color: 'var(--dim)',
            }}
          >
            {logs.map((line, i) => (
              <div key={i} style={{ color: line.startsWith('Feil') ? 'var(--red)' : line.startsWith('Fullført') ? 'var(--green)' : 'var(--dim)' }}>
                {line}
              </div>
            ))}
            {logs.length === 0 && <div style={{ color: 'var(--muted)' }}>Starter…</div>}
          </div>
        </div>
      )}

      {/* Show log summary after analysis (collapsed) */}
      {!analyzing && logs.length > 0 && rows.length > 0 && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>
            Vis analyselogg ({logs.length} meldinger)
          </summary>
          <div style={{
            marginTop: 8,
            background: 'var(--surface)',
            borderRadius: 6,
            padding: '10px 14px',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            lineHeight: 1.7,
            color: 'var(--dim)',
            maxHeight: 200,
            overflowY: 'auto',
          }}>
            {logs.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </details>
      )}

      {rows.length > 0 && (
        <>
          {/* Transactions */}
          <div style={{ fontWeight: 500, marginBottom: 10 }}>
            Transaksjoner
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
              {selectedCount} av {rows.length} valgt
            </span>
          </div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={rows.every(r => r.selected)}
                        onChange={e => setRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))} />
                    </th>
                    <th>Dato</th>
                    <th>Beskrivelse</th>
                    <th>Type</th>
                    <th className="text-right">Beløp</th>
                    <th>Kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r._id} style={{ opacity: r.selected ? 1 : 0.35 }}>
                      <td>
                        <input type="checkbox" checked={r.selected}
                          onChange={e => updateRow(r._id, 'selected', e.target.checked)} />
                      </td>
                      <td className="text-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{r.date}</td>
                      <td style={{ maxWidth: 300, fontSize: 13 }}>{r.description}</td>
                      <td><span className={`badge badge-${r.type}`}>{r.type}</span></td>
                      <td className="text-right">
                        <span className={r.type === 'inntekt' ? 'amount-positive' : 'amount-negative'}>
                          {r.type === 'utgift' ? '−' : '+'}{fmt(r.amount)}
                        </span>
                      </td>
                      <td>
                        <select className="form-select" style={{ fontSize: 12, padding: '3px 8px' }}
                          value={r.suggested_category_id || ''}
                          onChange={e => {
                            const cat = categories.find(c => c.id === e.target.value)
                            updateRow(r._id, 'suggested_category_id', e.target.value || null)
                            if (cat) updateRow(r._id, 'suggested_category_name', cat.name)
                          }}>
                          <option value="">Ingen kategori</option>
                          {categories.filter(c => c.type === r.type).map(c => (
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

          {/* Vendor suggestions */}
          {vendorSuggestions.length > 0 && (
            <>
              <div style={{ fontWeight: 500, marginBottom: 10 }}>
                Nye leverandørforslag
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                  {includedVendors} av {vendorSuggestions.length} inkludert — sendes til godkjenning
                </span>
              </div>
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input type="checkbox" checked={vendorSuggestions.every(v => v.include)}
                            onChange={e => setVendorSuggestions(prev => prev.map(v => ({ ...v, include: e.target.checked })))} />
                        </th>
                        <th>Leverandørnavn</th>
                        <th>Kategori</th>
                        <th className="text-right">Transaksjoner</th>
                        <th className="text-right">Totalt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorSuggestions.map(v => (
                        <tr key={v._id} style={{ opacity: v.include ? 1 : 0.35 }}>
                          <td>
                            <input type="checkbox" checked={v.include}
                              onChange={e => updateVendor(v._id, 'include', e.target.checked)} />
                          </td>
                          <td>
                            <input className="form-input" style={{ fontSize: 13, padding: '3px 8px' }}
                              value={v.name} onChange={e => updateVendor(v._id, 'name', e.target.value)} />
                          </td>
                          <td>
                            <select className="form-select" style={{ fontSize: 12, padding: '3px 8px' }}
                              value={v.suggested_category_id || ''}
                              onChange={e => updateVendor(v._id, 'suggested_category_id', e.target.value || null)}>
                              <option value="">Ingen kategori</option>
                              {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                              ))}
                            </select>
                          </td>
                          <td className="text-right text-mono" style={{ fontSize: 12 }}>{v.transaction_count}</td>
                          <td className="text-right text-mono" style={{ fontSize: 12 }}>{fmt(v.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => { setRows([]); setVendorSuggestions([]); setLogs([]); setProgress(0) }}>
              Avbryt
            </button>
            <button className="btn btn-primary" disabled={importing || selectedCount === 0} onClick={importAll}>
              {importing
                ? 'Importerer…'
                : `Importer ${selectedCount} transaksjoner${includedVendors > 0 ? ` + ${includedVendors} leverandører` : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
