import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fmt } from '../lib/format'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { ColumnPicker } from '../components/ColumnPicker'
import { ResizableTh } from '../components/ResizableTh'
import { loadAllRules, matchRule, loadMemberMatchData, matchMemberPayment } from '../lib/categorize'

const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

function RowDetailModal({ row, onClose, categories }) {
  const cat = categories.find(c => c.id === row.suggested_category_id)
  const fields = [
    { label: 'Dato',        value: row.date },
    { label: 'Beskrivelse', value: row.description },
    { label: 'Beløp',       value: `${row.type === 'utgift' ? '−' : '+'}${Number(row.amount).toLocaleString('nb-NO', { minimumFractionDigits: 2 })} kr` },
    { label: 'Type',        value: row.type },
    { label: 'Banktype',    value: row.csvType   || '—' },
    { label: 'Undertype',   value: row.csvSubtype || '—' },
    { label: 'Melding / KID / Faktura', value: row.notes || '—' },
    { label: 'Søketekst (regelmatching)', value: row.matchText || '—', mono: true },
    { label: 'Kategoriforslag', value: cat ? `${cat.name} (${cat.type})` : 'Ingen' },
    { label: 'Status',      value: row._duplicate ? 'Duplikat' : row._composite ? `Kombinert utbetaling — ${row._composite.count} poster, sum ${Math.round(row._composite.sum).toLocaleString('nb-NO')} kr` : 'Ny' },
  ]
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, width: 480, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Transaksjonsdetaljer</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {fields.map(f => (
              <tr key={f.label} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 12px 7px 0', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', verticalAlign: 'top', width: '40%' }}>{f.label}</td>
                <td style={{ padding: '7px 0', fontSize: 13, fontFamily: f.mono ? 'var(--font-mono)' : undefined, wordBreak: 'break-word' }}>{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const HISTORY_COLS = [
  { key: 'filename',    label: 'Fil' },
  { key: 'imported_at', label: 'Importert' },
  { key: 'imported_by', label: 'Av' },
  { key: 'file_size',   label: 'Størrelse' },
  { key: 'tx_count',    label: 'Transaksjoner' },
]

const DETAIL_COLS = [
  { key: 'date',        label: 'Dato' },
  { key: 'description', label: 'Beskrivelse' },
  { key: 'category',    label: 'Kategori' },
  { key: 'amount',      label: 'Beløp' },
  { key: 'status',      label: 'Status' },
]

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

// ── CSV-parsing for Rogaland Sparebank / Eika-format ──────────────────────

function readFileAsText(file) {
  // Try UTF-8; if replacement char U+FFFD appears, fall back to ISO-8859-1
  return new Promise((resolve, reject) => {
    const r1 = new FileReader()
    r1.onload = e => {
      const text = e.target.result
      if (text.includes('�')) {
        const r2 = new FileReader()
        r2.onload = e2 => resolve(e2.target.result)
        r2.onerror = reject
        r2.readAsText(file, 'iso-8859-1')
      } else {
        resolve(text)
      }
    }
    r1.onerror = reject
    r1.readAsText(file, 'utf-8')
  })
}

function parseNorwegianAmount(str) {
  if (!str) return 0
  const cleaned = str.trim().replace(/^"(.*)"$/, '$1')
  if (!cleaned || cleaned === '-') return 0
  const s = cleaned.replace(/\s/g, '')        // fjern mellomrom (tusenskiller)
  if (s.includes(',')) {
    // Norsk format: "1.234,56" — punktum=tusen, komma=desimal
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  }
  // Internasjonal / Rogaland Sparebank: "5000.00" — punktum=desimal
  return parseFloat(s) || 0
}

function parseNorwegianDate(str) {
  if (!str) return null
  const s = str.trim().replace(/^"(.*)"$/, '$1')
  const parts = s.split('.')
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

// Normalize header name: lowercase, collapse whitespace, remove invisible chars
function normHeader(s) {
  return s.replace(/[﻿\r]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function parseBankCSV(text) {
  const raw = text.replace(/^﻿/, '') // strip BOM
  const lines = raw.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { transactions: [], diagnostics: 'Filen har færre enn 2 linjer' }

  // Auto-detect separator: tab → semicolon → comma
  const firstLine = lines[0]
  const sep = firstLine.includes('\t') ? '\t'
            : firstLine.includes(';')  ? ';'
            : ','

  const unquote = s => s.replace(/^"(.*)"$/, '$1').trim()
  const rawHeaders = lines[0].split(sep).map(unquote)
  const headers    = rawHeaders.map(normHeader)

  // Flexible column lookup — matches by normalized name
  const col  = name => headers.indexOf(normHeader(name))
  const get  = (cols, name) => { const i = col(name); return i >= 0 ? unquote(cols[i] || '') : '' }

  // Find amount columns with fallback spellings
  // Find amount column indices (try exact match on normalized header)
  const idxInn     = headers.findIndex(h => h.includes('bel') && h.includes('inn'))
  const idxUt      = headers.findIndex(h => h.includes('bel') && h.includes('ut'))
  const idxStatus  = headers.findIndex(h => h === 'status')
  const idxType    = headers.findIndex(h => h === 'type')
  const idxSubtype = headers.findIndex(h => h === 'undertype')
  const idxKonto   = headers.findIndex(h => h === 'kontonummer' || h === 'til konto' || h === 'fra konto' || (h.includes('konto') && !h.includes('inn') && !h.includes('ut')))
  const idxSaldo   = headers.findIndex(h => h === 'saldo')

  if (idxInn < 0 || idxUt < 0) {
    return {
      transactions: [],
      diagnostics: `Fant ikke beløpskolonner. Kolonner (${rawHeaders.length}): ${rawHeaders.slice(0, 8).join(' | ')} …`
    }
  }

  const getByIdx = (cols, idx) => idx >= 0 ? unquote(cols[idx] || '') : ''

  const transactions = []
  let accountNumber = ''
  let lastBalance   = null
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep)
    if (cols.length < 5) continue

    // Hopp over reserverte transaksjoner
    const status = getByIdx(cols, idxStatus).toLowerCase()
    if (status === 'reservert') continue

    const inn = parseNorwegianAmount(getByIdx(cols, idxInn))  // positiv eller 0
    const ut  = parseNorwegianAmount(getByIdx(cols, idxUt))   // negativ eller 0

    const isInntekt = inn > 0
    const isUtgift  = ut < 0
    if (!isInntekt && !isUtgift) continue

    const amount     = isInntekt ? inn : Math.abs(ut)
    const rawDesc    = get(cols, 'Beskrivelse')
    const avsender   = get(cols, 'Avsender')
    const mottaker   = get(cols, 'Mottakernavn')
    const melding    = get(cols, 'Melding/KID/Fakt.nr')
    const bookedDate = get(cols, 'Bokført dato') || get(cols, 'Utført dato')
    const csvType    = getByIdx(cols, idxType)
    const csvSubtype = getByIdx(cols, idxSubtype)

    let description = rawDesc || (isInntekt ? avsender : mottaker) || ''
    if (isInntekt && avsender && !description.toLowerCase().includes(avsender.toLowerCase())) {
      description = description ? `${description} — Fra: ${avsender}` : `Fra: ${avsender}`
    }

    const date = parseNorwegianDate(bookedDate)
    if (!date) continue

    // matchText: alle relevante felt brukes av regler og AI — bredere enn bare beskrivelse
    const matchText = [description.trim(), csvType, csvSubtype, melding].filter(Boolean).join(' ')

    // Plukk opp kontonummer (første gang) og løpende saldo
    if (idxKonto >= 0 && !accountNumber) {
      const k = getByIdx(cols, idxKonto).replace(/\s/g, '')
      if (/^\d{11}$/.test(k)) accountNumber = k
    }
    if (idxSaldo >= 0) {
      const s = parseNorwegianAmount(getByIdx(cols, idxSaldo))
      if (s !== 0) lastBalance = s
    }

    transactions.push({
      date,
      description: description.trim(),
      csvType:    csvType    || '',
      csvSubtype: csvSubtype || '',
      matchText,
      amount,
      type: isInntekt ? 'inntekt' : 'utgift',
      notes: melding || '',
    })
  }
  return { transactions, diagnostics: null, accountNumber, lastBalance }
}

export default function BankImport() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const histPrefs   = useColumnPrefs('import_history', HISTORY_COLS)
  const detailPrefs = useColumnPrefs('import_history_tx', DETAIL_COLS)
  const [activeTab, setActiveTab] = useState('import')
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState([])        // [{ elapsed, message }] newest first
  const [elapsed, setElapsed] = useState(0)
  const [fileInfo, setFileInfo] = useState(null)
  const [analyzeStart, setAnalyzeStart] = useState(null)
  const [rows, setRows] = useState([])
  const [detailRow, setDetailRow] = useState(null)
  const [detectedAccount, setDetectedAccount] = useState(null)   // { id, name, accountNumber, lastBalance }
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

  useEffect(() => { loadHistory() }, [])
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

    const isCSV = file.name.toLowerCase().endsWith('.csv')

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

      const [catsRes, vendorsRes, sessionRes, rules, memberData] = await Promise.all([
        supabase.from('categories').select('*').eq('active', true).order('name'),
        supabase.from('vendors').select('name'),
        supabase.auth.getSession(),
        loadAllRules(),
        loadMemberMatchData(),
      ])
      fileHashRef.current = fileHash
      const cats = catsRes.data || []
      setCategories(cats)
      const existingNorm = new Set((vendorsRes.data || []).map(v => normalize(v.name)))

      // ── CSV-sti: parse lokalt + AI for ukategoriserte ──────────────────
      if (isCSV) {
        addLog('CSV-fil — parser lokalt…')
        setProgress(15)

        const text = await readFileAsText(file)
        setProgress(35)

        const { transactions: parsed, diagnostics, accountNumber, lastBalance } = parseBankCSV(text)

        if (diagnostics) addLog(`Info: ${diagnostics}`)

        // Match kontonummer mot bank_accounts
        if (accountNumber) {
          const { data: bankAccounts } = await supabase.from('bank_accounts').select('id, name, account_number').eq('active', true)
          const match = (bankAccounts || []).find(a => a.account_number?.replace(/\s/g, '') === accountNumber)
          if (match) {
            setDetectedAccount({ ...match, lastBalance })
            addLog(`Konto gjenkjent: ${match.name} (${accountNumber.replace(/(\d{4})(\d{2})(\d{5})/, '$1 $2 $3')})`)
          } else {
            addLog(`Kontonummer ${accountNumber} ikke funnet i bankkontoregisteret`)
          }
        }

        if (parsed.length === 0) {
          throw new Error(
            diagnostics
              ? `Kunne ikke lese CSV: ${diagnostics}`
              : 'Fant ingen bokførte transaksjoner i CSV-filen. Kontroller at filen er eksportert fra Rogaland Sparebank / Eika nettbank.'
          )
        }

        addLog(`Fant ${parsed.length} bokførte transaksjoner`)
        setProgress(50)

        // Regel-matching på tvers av Beskrivelse + Type + Undertype + Melding
        let withCats = parsed.map((t, i) => ({
          ...t,
          _id: i,
          selected: true,
          suggested_category_id: matchRule(rules, t.matchText, t.type) || null,
        }))

        // Send ukategoriserte til AI (samme motor som PDF)
        const unmatched = withCats.filter(t => !t.suggested_category_id)
        if (unmatched.length > 0) {
          addLog(`Regler fanget ${withCats.length - unmatched.length} — sender ${unmatched.length} til AI…`)
          setProgress(60)
          try {
            const token = sessionRes.data.session?.access_token
            const aiForm = new FormData()
            aiForm.append('categories', JSON.stringify(cats))
            aiForm.append('transactions', JSON.stringify(unmatched.map(t => ({
              _id: t._id, description: t.description,
              csvType: t.csvType, csvSubtype: t.csvSubtype,
              amount: t.amount, type: t.type,
            }))))

            const aiRes = await fetch(`${SUPABASE_URL}/functions/v1/analyze-bank-statement`, {
              method: 'POST',
              headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
              body: aiForm,
            })

            if (aiRes.ok && aiRes.body) {
              const reader = aiRes.body.getReader()
              const decoder = new TextDecoder()
              let buf = ''
              const aiMap = {}

              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                const parts = buf.split('\n\n')
                buf = parts.pop() || ''
                for (const part of parts) {
                  const evtLine  = part.split('\n').find(l => l.startsWith('event:'))
                  const dataLine = part.split('\n').find(l => l.startsWith('data:'))
                  if (!evtLine || !dataLine) continue
                  const evtName = evtLine.replace('event:', '').trim()
                  const payload = JSON.parse(dataLine.slice(5))
                  if (evtName === 'log')    addLog(`AI: ${payload.message}`)
                  if (evtName === 'result') {
                    for (const c of (payload.categorized || []))
                      if (c.suggested_category_id) aiMap[c._id] = c.suggested_category_id
                  }
                }
              }

              withCats = withCats.map(t => ({
                ...t,
                suggested_category_id: t.suggested_category_id || aiMap[t._id] || null,
              }))
              addLog(`AI kategoriserte ${Object.keys(aiMap).length} av ${unmatched.length}`)
            }
          } catch (aiErr) {
            addLog(`AI-analyse feilet: ${aiErr.message} — fortsetter med regelbaserte kategorier`)
          }
        } else {
          addLog(`Alle ${withCats.length} kategorisert via regler`)
        }
        setProgress(80)

        // Sjekk mot eksisterende transaksjoner — unngå duplikater
        addLog('Sjekker mot eksisterende transaksjoner…')
        const sortedDates = [...withCats].map(t => t.date).sort()

        // Hent eksisterende transaksjoner: 90 dager bak for å fange utlegg registrert før utbetaling
        const extStart = new Date(sortedDates[0])
        extStart.setDate(extStart.getDate() - 90)

        const { data: existing } = await supabase
          .from('transactions')
          .select('date, amount, type, description, bank_import_id')
          .gte('date', extStart.toISOString().slice(0, 10))
          .lte('date', sortedDates[sortedDates.length - 1])

        // Sett for eksakt duplikatsjekk (kun innenfor CSV-perioden)
        const existSet = new Set(
          (existing || [])
            .filter(t => t.date >= sortedDates[0])
            .map(t => `${t.date}|${Math.round(Number(t.amount) * 100)}|${t.type}`)
        )

        // Manuelle utgifter (ikke bankimportert) for sum-matching
        const manualUtgift = (existing || []).filter(t => !t.bank_import_id && t.type === 'utgift')

        function extractPersonName(desc) {
          const m = (desc || '').match(/bedrterm oppgave til:\s*(.+?)(?:\s*\d|$)/i)
          return m ? m[1].trim() : null
        }

        // Dynamisk medlemsmatching — kjøres før duplikatsjekk slik at withDupCheck ser riktig kategori
        const beforeMember = withCats.filter(t => !t.suggested_category_id).length
        withCats = withCats.map(t => {
          if (t.suggested_category_id) return t
          const catId = matchMemberPayment(t.description, t.amount, t.type, t.date, memberData)
          return catId ? { ...t, suggested_category_id: catId } : t
        })
        const memberMatched = beforeMember - withCats.filter(t => !t.suggested_category_id).length
        if (memberMatched > 0) addLog(`${memberMatched} transaksjoner matchet mot medlemsregister (navn + sats)`)

        const withDupCheck = withCats.map(t => {
          // 1. Eksakt duplikat
          const key = `${t.date}|${Math.round(t.amount * 100)}|${t.type}`
          if (existSet.has(key)) return { ...t, selected: false, _duplicate: true }

          // 2. Kombinert utbetaling — navnbasert sum-match mot manuelle utgifter
          if (t.type === 'utgift') {
            const name = extractPersonName(t.description)
            if (name) {
              const firstName = name.split(/\s+/)[0].toLowerCase()
              const candidates = manualUtgift.filter(e =>
                e.description.toLowerCase().includes(firstName)
              )
              if (candidates.length > 0) {
                const sum = candidates.reduce((s, e) => s + Number(e.amount), 0)
                const exact = Math.abs(sum - t.amount) < 1
                return {
                  ...t,
                  selected: !exact,
                  _composite: { count: candidates.length, sum, exact, name },
                }
              }
            }
          }

          return t
        })

        const dupCount       = withDupCheck.filter(t => t._duplicate).length
        const compositeExact = withDupCheck.filter(t => t._composite?.exact).length
        const compositePart  = withDupCheck.filter(t => t._composite && !t._composite.exact).length
        const matched        = withDupCheck.filter(t => t.suggested_category_id).length

        if (dupCount > 0)        addLog(`${dupCount} eksakte duplikater — forhåndsavhuket`)
        if (compositeExact > 0)  addLog(`${compositeExact} kombinerte utbetalinger matchet eksisterende utlegg — forhåndsavhuket`)
        if (compositePart > 0)   addLog(`${compositePart} mulige kombinerte utbetalinger — kontroller manuelt`)
        addLog(`Fullført — ${matched} av ${parsed.length} fikk kategori fra regler`)
        setProgress(100)
        setRows(withDupCheck)

        // Bygg leverandørforslag fra CSV — samme logikk som PDF-flyten
        function guessVendorName(desc) {
          const d = (desc || '').trim()
          // Bankoverføring: "SELSKAPSNAVN (kontonummer)"
          const bank = d.match(/^(.+?)\s*\(\d{9,11}\)$/)
          if (bank) return bank[1].trim()
          // Kortbetaling: "DD.MM BUTIKKNAVN ADRESSE BY"
          const card = d.match(/^\d{2}\.\d{2}\s+(.+)$/)
          if (card) {
            const parts = card[1].split(/\s+/)
            const addrRe = /^\d|\bveien?\b|\bgaten?\b|\bgata\b|\bvegen?\b|\bstien?\b|\btorget\b|\bplassen?\b/i
            const name = []
            for (const w of parts) { if (addrRe.test(w)) break; name.push(w) }
            return (name.length > 0 ? name : parts.slice(0, 2)).join(' ')
          }
          return d.split(/\s+/).slice(0, 3).join(' ')
        }

        const memberCatIds = new Set([memberData.membershipCatId, memberData.reisekasseCatId].filter(Boolean))
        const vendorMap = {}
        for (const t of withDupCheck) {
          if (!t.suggested_category_id) continue
          if (memberCatIds.has(t.suggested_category_id)) continue
          const vname = guessVendorName(t.description)
          if (!vname || vname.length < 3) continue
          const norm = normalize(vname)
          if (existingNorm.has(norm)) continue
          if (!vendorMap[norm]) vendorMap[norm] = { name: vname, suggested_category_id: t.suggested_category_id, transaction_count: 0, total_amount: 0 }
          vendorMap[norm].transaction_count++
          vendorMap[norm].total_amount += Number(t.amount)
        }
        const csvVendors = Object.values(vendorMap).map((v, i) => ({ ...v, _id: i, include: v.transaction_count >= 2 }))
        if (csvVendors.length > 0) {
          setVendorSuggestions(csvVendors)
          addLog(`${csvVendors.length} potensielle nye leverandører funnet — se leverandørforslag nedenfor`)
        }

      // ── PDF-sti: send til AI ────────────────────────────────────────────
      } else {
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

        setRows((finalResult.transactions || []).map((t, i) => ({
          ...t,
          _id: i,
          selected: true,
          suggested_category_id: t.suggested_category_id || matchRule(rules, t.description, t.type) || null,
        })))
        const newVendors = (finalResult.vendors || [])
          .filter(v => v.name && !existingNorm.has(normalize(v.name)))
          .map((v, i) => ({ ...v, _id: i, include: true }))
        setVendorSuggestions(newVendors)
      }

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

    // Load approved vendors for matching
    const { data: knownVendors } = await supabase
      .from('vendors')
      .select('id, normalized_name, suggested_category_id, auto_approve, confidence')
      .eq('approved', true)
    const vendorList = knownVendors || []

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

    const txPayload = selected.map(r => {
      const normDesc = normalize(r.description)
      const matched = vendorList.find(v => normDesc.includes(v.normalized_name) || v.normalized_name.includes(normDesc.slice(0, 8)))
      const autoApprove = matched?.auto_approve === true
      return {
        date: r.date,
        description: r.description,
        amount: parseFloat(r.amount),
        type: r.type,
        category_id: r.suggested_category_id || matched?.suggested_category_id || null,
        notes: r.notes || '',
        created_by: profile.id,
        updated_by: profile.id,
        approved: autoApprove,
        approved_by: autoApprove ? profile.id : null,
        approved_at: autoApprove ? new Date().toISOString() : null,
        bank_import_id: importId,
        vendor_id: matched?.id || null,
        bank_account_id: detectedAccount?.id || null,
      }
    })

    const { error: txErr } = await supabase.from('transactions').insert(txPayload)
    if (txErr) { setError(txErr.message); setImporting(false); return }

    // Oppdater account_balances for siste måned i importen
    if (detectedAccount?.id && detectedAccount?.lastBalance != null) {
      const dates = selected.map(r => r.date).sort()
      const lastDate = new Date(dates[dates.length - 1])
      await supabase.from('account_balances').upsert({
        account_id: detectedAccount.id,
        year: lastDate.getFullYear(),
        month: lastDate.getMonth() + 1,
        balance: detectedAccount.lastBalance,
        notes: `Auto-oppdatert ved import ${new Date().toLocaleDateString('nb-NO')}`,
      }, { onConflict: 'account_id,year,month' })
    }

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
    setDetectedAccount(null)
    setVendorSuggestions([])
    setImporting(false)
  }

  const selectedCount = rows.filter(r => r.selected).length
  const includedVendors = vendorSuggestions.filter(v => v.include).length
  const remaining = fmtRemaining(elapsed, progress)

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-sm btn-secondary" onClick={() => navigate('/transaksjoner')}
          style={{ fontSize: 12, color: 'var(--muted)' }}>
          ← Transaksjoner
        </button>
      </div>
      <div className="page-header">
        <div>
          <div className="page-title">Importer kontoutskrift</div>
          <div className="page-sub">CSV fra Rogaland Sparebank nettbank (anbefalt) · PDF via AI-analyse</div>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px 4px' }}>
                <ColumnPicker prefs={histPrefs} />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', ...(histPrefs.orderedVisible.some(c => histPrefs.getWidth(c.key)) ? { tableLayout: 'fixed' } : {}) }}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    {histPrefs.orderedVisible.map(col => (
                      <ResizableTh key={col.key} colKey={col.key} prefs={histPrefs}
                        className={['file_size', 'tx_count'].includes(col.key) ? 'text-right' : ''}>
                        {col.label}
                      </ResizableTh>
                    ))}
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
                          {histPrefs.orderedVisible.map(col => {
                            switch (col.key) {
                              case 'filename':    return <td key={col.key} style={{ padding: '10px 12px', fontWeight: 500 }}>{imp.filename}</td>
                              case 'imported_at': return <td key={col.key} style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>{dateStr} {timeStr}</td>
                              case 'imported_by': return <td key={col.key} style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>{imp.profiles?.full_name || '—'}</td>
                              case 'file_size':   return <td key={col.key} className="text-right" style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{fmtSize(imp.file_size || 0)}</td>
                              case 'tx_count':    return <td key={col.key} className="text-right" style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{imp.transaction_count}</td>
                              default:            return <td key={col.key} />
                            }
                          })}
                        </tr>
                        {isOpen && (
                          <tr key={`${imp.id}-detail`}>
                            <td colSpan={99} style={{ padding: 0, background: 'var(--surface)' }}>
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                                        {(() => {
                                          const net = expandedTx.reduce((s, t) => s + (t.type === 'inntekt' ? Number(t.amount) : -Number(t.amount)), 0)
                                          return <span style={{ color: net >= 0 ? 'var(--green)' : '#e87474' }}>
                                            netto {net >= 0 ? '+' : ''}{Math.round(net).toLocaleString('nb-NO')} kr
                                          </span>
                                        })()}
                                      </span>
                                      <ColumnPicker prefs={detailPrefs} />
                                    </div>
                                  </div>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, ...(detailPrefs.orderedVisible.some(c => detailPrefs.getWidth(c.key)) ? { tableLayout: 'fixed' } : {}) }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        {detailPrefs.orderedVisible.map(col => (
                                          <ResizableTh key={col.key} colKey={col.key} prefs={detailPrefs}
                                            className={col.key === 'amount' ? 'text-right' : ''}
                                            style={{ padding: '4px 16px', color: 'var(--muted)', fontWeight: 500 }}>
                                            {col.label}
                                          </ResizableTh>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {expandedTx.map(t => (
                                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                          {detailPrefs.orderedVisible.map(col => {
                                            switch (col.key) {
                                              case 'date':        return <td key={col.key} style={{ padding: '5px 16px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{t.date}</td>
                                              case 'description': return <td key={col.key} style={{ padding: '5px 16px', maxWidth: 320 }}>{t.description}</td>
                                              case 'category':    return <td key={col.key} style={{ padding: '5px 16px', color: 'var(--muted)' }}>{t.categories?.name || '—'}</td>
                                              case 'amount':      return <td key={col.key} style={{ padding: '5px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 500 }}><span style={{ color: t.type === 'inntekt' ? 'var(--green)' : '#e87474' }}>{t.type === 'utgift' ? '−' : '+'}{Math.round(Number(t.amount)).toLocaleString('nb-NO')} kr</span></td>
                                              case 'status':      return <td key={col.key} style={{ padding: '5px 16px' }}><span className={`badge ${t.approved ? 'badge-approved' : 'badge-pending'}`} style={{ fontSize: 10 }}>{t.approved ? 'Godkjent' : 'Venter'}</span></td>
                                              default:            return <td key={col.key} />
                                            }
                                          })}
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
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
            CSV fra Rogaland Sparebank nettbank (anbefalt) · PDF (AI-analyse)
          </div>
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
          {detectedAccount && (
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Konto gjenkjent:</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{detectedAccount.name}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                {detectedAccount.account_number}
              </span>
              {detectedAccount.lastBalance != null && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  · Saldo etter siste transaksjon: <strong>{Number(detectedAccount.lastBalance).toLocaleString('nb-NO', { minimumFractionDigits: 2 })} kr</strong>
                </span>
              )}
            </div>
          )}
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
          <div style={{ fontWeight: 500, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span>
              Transaksjoner
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                {selectedCount} av {rows.length} valgt
              </span>
            </span>
            {rows.filter(r => r._duplicate).length > 0 && (
              <span style={{ fontSize: 12, background: 'var(--yellow)', color: '#000', borderRadius: 6, padding: '2px 10px', fontWeight: 500 }}>
                {rows.filter(r => r._duplicate).length} duplikater avhuket
              </span>
            )}
            {rows.filter(r => r._composite?.exact).length > 0 && (
              <span style={{ fontSize: 12, background: '#8e44ad', color: '#fff', borderRadius: 6, padding: '2px 10px', fontWeight: 500 }}>
                {rows.filter(r => r._composite?.exact).length} kombinerte utbetalinger avhuket (utlegg allerede registrert)
              </span>
            )}
            {rows.filter(r => r._composite && !r._composite.exact).length > 0 && (
              <span style={{ fontSize: 12, background: '#e67e22', color: '#fff', borderRadius: 6, padding: '2px 10px', fontWeight: 500 }}>
                {rows.filter(r => r._composite && !r._composite.exact).length} mulige kombinerte utbetalinger — kontroller
              </span>
            )}
          </div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
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
                      <td style={{ padding: '4px 4px' }}>
                        <button title="Vis alle detaljer" onClick={() => setDetailRow(r)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 3, display: 'flex', alignItems: 'center', borderRadius: 4 }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                          <EyeIcon />
                        </button>
                      </td>
                      <td>
                        <input type="checkbox" checked={r.selected}
                          onChange={e => updateRow(r._id, 'selected', e.target.checked)} />
                      </td>
                      <td className="text-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{r.date}</td>
                      <td style={{ maxWidth: 320, fontSize: 13 }}>
                        {r.description}
                        {r.notes && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, fontStyle: 'italic' }}>
                            {r.notes}
                          </div>
                        )}
                        {(r.csvType || r.csvSubtype) && (
                          <div style={{ marginTop: 2 }}>
                            {r.csvType && (
                              <span style={{ fontSize: 10, background: 'var(--surface-2,#2a2a2a)', color: 'var(--muted)', borderRadius: 3, padding: '1px 4px', marginRight: 3 }}>
                                {r.csvType}
                              </span>
                            )}
                            {r.csvSubtype && (
                              <span style={{ fontSize: 10, background: 'var(--surface-2,#2a2a2a)', color: 'var(--muted)', borderRadius: 3, padding: '1px 4px' }}>
                                {r.csvSubtype}
                              </span>
                            )}
                          </div>
                        )}
                        {r._duplicate && (
                          <span title="Finnes allerede i systemet med samme dato, beløp og type"
                            style={{ marginLeft: 0, marginTop: 2, display: 'inline-block', fontSize: 10, fontWeight: 600, background: 'var(--yellow)', color: '#000', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                            duplikat
                          </span>
                        )}
                        {r._composite?.exact && (
                          <span title={`Summen av ${r._composite.count} manuelt registrerte utgifter for ${r._composite.name} (${Math.round(r._composite.sum).toLocaleString('nb-NO')} kr) matcher dette beløpet — trolig allerede registrert`}
                            style={{ marginLeft: 3, fontSize: 10, fontWeight: 600, background: '#8e44ad', color: '#fff', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap', cursor: 'help' }}>
                            utlegg {r._composite.count} poster
                          </span>
                        )}
                        {r._composite && !r._composite.exact && (
                          <span title={`${r._composite.count} utgifter for ${r._composite.name} funnet, sum ${Math.round(r._composite.sum).toLocaleString('nb-NO')} kr — kontroller om disse dekkes av denne utbetalingen`}
                            style={{ marginLeft: 3, fontSize: 10, fontWeight: 600, background: '#e67e22', color: '#fff', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap', cursor: 'help' }}>
                            ~utlegg {r._composite.count} poster
                          </span>
                        )}
                      </td>
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

      {detailRow && (
        <RowDetailModal row={detailRow} onClose={() => setDetailRow(null)} categories={categories} />
      )}
    </div>
  )
}
