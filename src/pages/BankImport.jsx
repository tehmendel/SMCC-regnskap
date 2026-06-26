import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmt } from '../lib/format'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9æøå]/g, '').trim()
}

function fmtElapsed(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function fmtRemaining(elapsed, percent) {
  if (percent < 15) return null
  const total = elapsed / (percent / 100)
  const rem = Math.max(0, total - elapsed)
  if (rem < 60) return `${Math.round(rem)} sek gjenstår`
  return `${Math.round(rem / 60)} min gjenstår`
}

export default function BankImport() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('import')
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState([])        // [{ elapsed, message }] newest first
  const [elapsed, setElapsed] = useState(0)
  const [fileInfo, setFileInfo] = useState(null)
  const [analyzeStart, setAnalyzeStart] = useState(null)
  const [rows, setRows] = useState([])
  const [vendorSuggestions, setVendorSuggestions] = useState([])
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(0)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [expandedTx, setExpandedTx] = useState([])
  const [expandedLoading, setExpandedLoading] = useState(false)
  const inputRef = useRef()
  const timerRef = useRef(null)
  const startRef = useRef(null)
  const fileHashRef = useRef(null)

  function startTimer() {
    const t0 = Date.now()
    startRef.current = t0
    setElapsed(0)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000))
    }, 500)
  }

  function stopTimer() {
    clearInterval(timerRef.current)
  }

  useEffect(() => () => clearInterval(timerRef.current), [])

  async function loadHistory() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('bank_imports')
      .select('*, profiles:imported_by(full_name)')
      .order('imported_at', { ascending: false })
    setHistory(data || [])
    setHistoryLoading(false)
  }

  useEffect(() => { if (activeTab === 'historikk') loadHistory() }, [activeTab])

  async function expandImport(imp) {
    if (expandedId === imp.id) { setExpandedId(null); setExpandedTx([]); return }
    setExpandedId(imp.id)
    setExpandedTx([])
    setExpandedLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, categories(name)')
      .eq('bank_import_id', imp.id)
      .order('date', { ascending: false })
    setExpandedTx(data || [])
    setExpandedLoading(false)
  }

  function addLog(message) {
    const e = Math.floor((Date.now() - (startRef.current || Date.now())) / 1000)
    setLogs(prev => [{ elapsed: e, message }, ...prev])
  }

  async function computeHash(file) {
    const buf = await file.arrayBuffer()
    const hashBuf = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async function analyze(file) {
    setError('')
    setRows([])
    setVendorSuggestions([])
    setImportDone(0)
    setLogs([])
    setProgress(0)
    setFileInfo({ name: file.name, size: file.size })
    setAnalyzing(true)

    try {
      // Duplicate check before starting timer/analysis
      const fileHash = await computeHash(file)
      const { data: existing } = await supabase
        .from('bank_imports')
        .select('filename, imported_at')
        .eq('file_hash', fileHash)
        .maybeSingle()

      if (existing) {
        const d = new Date(existing.imported_at).toLocaleDateString('nb-NO', { day: '2-digit', month: 'long', year: 'numeric' })
        const go = window.confirm(`"${existing.filename}" er allerede importert (${d}).\n\nVil du importere samme fil på nytt?`)
        if (!go) { setAnalyzing(false); return }
      }

      setAnalyzeStart(Date.now())
      startTimer()

      const [catsRes, vendorsRes, sessionRes] = await Promise.all([
        supabase.from('categories').select('*').eq('active', true).order('name'),
        supabase.from('vendors').select('name'),
        supabase.auth.getSession(),
      ])
      fileHashRef.current = fileHash
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
        throw new Error('Nettleseren støtter ikke strømmende svar. Prøv Chrome eller Firefox.')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let finalResult = null

      while (true) {
        const { done, value } = await reader.read()
        if (value) sseBuffer += decoder.decode(value, { stream: !done })

        // When done, process everything; otherwise keep last incomplete event in buffer
        const allParts = sseBuffer.split('\n\n')
        const parts = done ? allParts : allParts.slice(0, -1)
        sseBuffer = done ? '' : (allParts.at(-1) ?? '')

        for (const part of parts) {
          if (!part.trim()) continue
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
            addLog(data.message)
          } else if (eventType === 'progress') {
            setProgress(data.percent)
          } else if (eventType === 'result') {
            finalResult = data
          } else if (eventType === 'error') {
            throw new Error(data.message)
          }
        }

        if (done) break
      }

      if (!finalResult) throw new Error('Ingen resultat mottatt fra serveren. Prøv igjen.')

      setRows((finalResult.transactions || []).map((t, i) => ({ ...t, _id: i, selected: true })))
      const newVendors = (finalResult.vendors || [])
        .filter(v => v.name && !existingNorm.has(normalize(v.name)))
        .map((v, i) => ({ ...v, _id: i, include: true }))
      setVendorSuggestions(newVendors)

    } catch (e) {
      const msg = e.message || 'Ukjent feil'
      setError(msg)
      addLog(`Feil: ${msg}`)
    } finally {
      stopTimer()
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

    // Create import record first so we can link transactions to it
    let importId = null
    if (fileHashRef.current && fileInfo) {
      const { data: imp } = await supabase.from('bank_imports').upsert({
        file_hash: fileHashRef.current,
        filename: fileInfo.name,
        file_size: fileInfo.size,
        transaction_count: selected.length,
        imported_by: profile.id,
        imported_at: new Date().toISOString(),
      }, { onConflict: 'file_hash' }).select('id').single()
      importId = imp?.id ?? null
    }

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
      bank_import_id: importId,
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
  const remaining = fmtRemaining(elapsed, progress)

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Importer kontoutskrift</div>
          <div className="page-sub">Last opp PDF eller CSV — AI analyserer og foreslår kategorier</div>
        </div>
      </div>

      <div className="flex gap-8" style={{ marginBottom: 20 }}>
        {['import', 'historikk'].map(t => (
          <button key={t} className={`btn btn-sm ${activeTab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(t)}>
            {t === 'import' ? 'Importer' : `Historikk${history.length > 0 ? ` (${history.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── HISTORIKK-FANE ───────────────────────────────────── */}
      {activeTab === 'historikk' && (
        <div>
          {historyLoading ? (
            <div className="text-muted">Laster…</div>
          ) : history.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">📂</div>
                <div className="empty-state-text">Ingen importeringer registrert ennå.</div>
              </div>
            </div>
          ) : (
            <div className="card">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th>Fil</th>
                    <th>Importert</th>
                    <th>Av</th>
                    <th className="text-right">Størrelse</th>
                    <th className="text-right">Transaksjoner</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(imp => {
                    const isOpen = expandedId === imp.id
                    const d = new Date(imp.imported_at)
                    const dateStr = d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })
                    const timeStr = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <>
                        <tr key={imp.id}
                          style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: isOpen ? 'var(--surface)' : 'transparent' }}
                          onClick={() => expandImport(imp)}>
                          <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 13, userSelect: 'none' }}>
                            {isOpen ? '▾' : '▸'}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 500 }}>{imp.filename}</td>
                          <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
                            {dateStr} {timeStr}
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
                            {imp.profiles?.full_name || '—'}
                          </td>
                          <td className="text-right" style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
                            {fmtSize(imp.file_size || 0)}
                          </td>
                          <td className="text-right" style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>
                            {imp.transaction_count}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${imp.id}-detail`}>
                            <td colSpan={6} style={{ padding: 0, background: 'var(--surface)' }}>
                              {expandedLoading ? (
                                <div style={{ padding: '12px 20px', color: 'var(--muted)', fontSize: 12 }}>Laster transaksjoner…</div>
                              ) : expandedTx.length === 0 ? (
                                <div style={{ padding: '12px 20px', color: 'var(--muted)', fontSize: 12 }}>
                                  Ingen transaksjoner koblet til denne importen (eldre import uten sporbarhet).
                                </div>
                              ) : (
                                <div style={{ padding: '0 0 8px 0' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px 6px' }}>
                                    <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                      {expandedTx.length} transaksjoner
                                    </span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                                      {(() => {
                                        const net = expandedTx.reduce((s, t) => s + (t.type === 'inntekt' ? Number(t.amount) : -Number(t.amount)), 0)
                                        return <span style={{ color: net >= 0 ? 'var(--green)' : '#e87474' }}>
                                          netto {net >= 0 ? '+' : ''}{Math.round(net).toLocaleString('nb-NO')} kr
                                        </span>
                                      })()}
                                    </span>
                                  </div>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '4px 16px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500 }}>Dato</th>
                                        <th style={{ padding: '4px 16px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500 }}>Beskrivelse</th>
                                        <th style={{ padding: '4px 16px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500 }}>Kategori</th>
                                        <th style={{ padding: '4px 16px', textAlign: 'right', color: 'var(--muted)', fontWeight: 500 }}>Beløp</th>
                                        <th style={{ padding: '4px 16px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500 }}>Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {expandedTx.map(t => (
                                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                          <td style={{ padding: '5px 16px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{t.date}</td>
                                          <td style={{ padding: '5px 16px', maxWidth: 320 }}>{t.description}</td>
                                          <td style={{ padding: '5px 16px', color: 'var(--muted)' }}>{t.categories?.name || '—'}</td>
                                          <td style={{ padding: '5px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                                            <span style={{ color: t.type === 'inntekt' ? 'var(--green)' : '#e87474' }}>
                                              {t.type === 'utgift' ? '−' : '+'}{Math.round(Number(t.amount)).toLocaleString('nb-NO')} kr
                                            </span>
                                          </td>
                                          <td style={{ padding: '5px 16px' }}>
                                            <span className={`badge ${t.approved ? 'badge-approved' : 'badge-pending'}`} style={{ fontSize: 10 }}>
                                              {t.approved ? 'Godkjent' : 'Venter'}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── IMPORT-FANE ──────────────────────────────────────── */}
      {activeTab === 'import' && <>

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
          <button className="btn btn-primary" onClick={() => { setImportDone(0); setLogs([]); setProgress(0); setFileInfo(null) }}>
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

      {(analyzing || (logs.length > 0 && rows.length === 0 && !importDone)) && (
        <div className="card" style={{ padding: 20 }}>
          {/* Header row: file info + timer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <span style={{ fontWeight: 500 }}>{fileInfo?.name}</span>
              {fileInfo && (
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
                  {fmtSize(fileInfo.size)}
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, letterSpacing: 2 }}>
              {fmtElapsed(elapsed)}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 8, background: 'var(--graphite)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: progress === 100 ? 'var(--green)' : 'var(--accent)',
                borderRadius: 4,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 36, textAlign: 'right' }}>
              {progress.toFixed(0)}%
            </div>
            {remaining && (
              <div style={{ fontSize: 12, color: 'var(--muted)', minWidth: 110 }}>{remaining}</div>
            )}
          </div>

          {/* Log table */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              <thead>
                <tr style={{ background: 'var(--surface)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', width: 52, color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Tid</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Hendelse</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ padding: '12px 10px', color: 'var(--muted)' }}>Starter…</td>
                  </tr>
                )}
                {logs.map((entry, i) => {
                  const isTx  = entry.message.startsWith('[20')
                  const isErr = entry.message.startsWith('Feil')
                  const isDone = entry.message.startsWith('Fullført')
                  const isInntekt = isTx && entry.message.includes(' +')
                  const isUtgift  = isTx && entry.message.includes(' −')
                  const msgColor = isErr ? 'var(--red)'
                    : isDone ? 'var(--green)'
                    : isInntekt ? 'var(--green)'
                    : isUtgift  ? '#e87474'
                    : isTx ? 'var(--text)'
                    : 'var(--dim)'
                  return (
                    <tr key={i} style={{ borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '4px 10px', color: 'var(--dim)', whiteSpace: 'nowrap' }}>
                        {fmtElapsed(entry.elapsed)}
                      </td>
                      <td style={{ padding: '4px 10px', color: msgColor, fontWeight: isTx ? 500 : 400 }}>
                        {entry.message}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* Collapsed log summary */}
          {logs.length > 0 && (
            <details style={{ marginBottom: 16 }}>
              <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>
                Analyselogg — {fileInfo?.name} ({fmtSize(fileInfo?.size || 0)}) · {fmtElapsed(elapsed)} · {logs.length} hendelser
              </summary>
              <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  <tbody>
                    {logs.map((entry, i) => {
                      const isTx = entry.message.startsWith('[20')
                      const isInntekt = isTx && entry.message.includes(' +')
                      const isUtgift  = isTx && entry.message.includes(' −')
                      return (
                        <tr key={i} style={{ borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '3px 10px', color: 'var(--dim)', width: 52 }}>{fmtElapsed(entry.elapsed)}</td>
                          <td style={{ padding: '3px 10px', color: entry.message.startsWith('Feil') ? 'var(--red)' : isInntekt ? 'var(--green)' : isUtgift ? '#e87474' : 'var(--dim)' }}>
                            {entry.message}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}

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
            <button className="btn btn-secondary" onClick={() => { setRows([]); setVendorSuggestions([]); setLogs([]); setProgress(0); setFileInfo(null) }}>
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

      </> /* end activeTab === 'import' */}
    </div>
  )
}
