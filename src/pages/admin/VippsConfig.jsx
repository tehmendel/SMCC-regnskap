import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { CardGrid } from '../../components/CardGrid'

const ENV_LABEL = { test: 'Test', prod: 'Produksjon' }
const ENV_BASE_URL = { test: 'https://apitest.vipps.no', prod: 'https://api.vipps.no' }

function MaskedInput({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="form-input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{ fontFamily: value ? 'var(--font-mono)' : 'inherit', fontSize: 12, flex: 1 }}
        />
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShow(s => !s)} style={{ minWidth: 60 }}>
          {show ? 'Skjul' : 'Vis'}
        </button>
      </div>
    </div>
  )
}

const EMPTY_FORM = { client_id: '', client_secret: '', subscription_key: '', subscription_key_ecom: '', subscription_key_checkout: '', webhook_secret: '' }

export default function VippsConfig() {
  const { isAdmin } = useAuth()
  const [activeEnv, setActiveEnv] = useState('test')
  const [editEnv, setEditEnv] = useState('test')
  const [configs, setConfigs] = useState({})
  const [msns, setMsns] = useState({ test: [], prod: [] })
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [newMsn, setNewMsn] = useState({ msn: '', label: '', description: '' })
  const [addingMsn, setAddingMsn] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [confirmSwitch, setConfirmSwitch] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [syncLog, setSyncLog] = useState([])
  const [daysBack, setDaysBack] = useState(30)

  useEffect(() => { load(); loadSyncLog() }, [])

  async function load() {
    const [cRes, mRes] = await Promise.all([
      supabase.from('vipps_config').select('*'),
      supabase.from('vipps_msn').select('*').order('sort_order'),
    ])
    const cfgMap = {}
    for (const c of (cRes.data || [])) cfgMap[c.environment] = c
    setConfigs(cfgMap)
    const active = (cRes.data || []).find(c => c.is_active)
    if (active) setActiveEnv(active.environment)

    const msnMap = { test: [], prod: [] }
    for (const m of (mRes.data || [])) msnMap[m.environment]?.push(m)
    setMsns(msnMap)
  }

  useEffect(() => {
    const cfg = configs[editEnv]
    setForm(cfg ? {
      client_id:                  cfg.client_id || '',
      client_secret:              cfg.client_secret || '',
      subscription_key:           cfg.subscription_key || '',
      subscription_key_ecom:      cfg.subscription_key_ecom || '',
      subscription_key_checkout:  cfg.subscription_key_checkout || '',
      webhook_secret:             cfg.webhook_secret || '',
    } : EMPTY_FORM)
  }, [editEnv, configs])

  function field(key) {
    return { value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) }
  }

  async function saveConfig(e) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    const { error } = await supabase.from('vipps_config').upsert(
      { ...configs[editEnv], environment: editEnv, ...form, updated_at: new Date().toISOString() },
      { onConflict: 'environment' }
    )
    if (error) setSaveMsg('Feil: ' + error.message)
    else { setSaveMsg('Lagret!'); load() }
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 3000)
  }

  async function loadSyncLog() {
    const { data } = await supabase
      .from('vipps_sync_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10)
    setSyncLog(data || [])
  }

  async function triggerSync() {
    setSyncing(true)
    setSyncResult(null)
    const { data, error } = await supabase.functions.invoke('vipps-sync', {
      body: { source: 'manual', days_back: daysBack },
    })
    setSyncResult(error ? { ok: false, error: error.message } : data)
    setSyncing(false)
    loadSyncLog()
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    const { data, error } = await supabase.functions.invoke('vipps-test-connection', {
      body: { environment: editEnv },
    })
    setTestResult(error ? { ok: false, error: error.message } : data)
    setTesting(false)
  }

  async function doSwitchEnv(target) {
    setSwitching(true)
    await supabase.from('vipps_config').update({ is_active: false }).neq('environment', target)
    await supabase.from('vipps_config').update({ is_active: true }).eq('environment', target)
    setConfirmSwitch(false)
    setSwitching(false)
    load()
  }

  function requestSwitch(target) {
    if (target === 'prod') { setConfirmSwitch(true); return }
    doSwitchEnv(target)
  }

  async function addMsn(e) {
    e.preventDefault()
    const { error } = await supabase.from('vipps_msn').insert({
      environment: editEnv,
      msn:         newMsn.msn.trim(),
      label:       newMsn.label.trim(),
      description: newMsn.description.trim(),
      sort_order:  msns[editEnv].length,
    })
    if (!error) { setNewMsn({ msn: '', label: '', description: '' }); setAddingMsn(false); load() }
  }

  async function toggleMsn(id, is_active) {
    await supabase.from('vipps_msn').update({ is_active: !is_active }).eq('id', id)
    load()
  }

  async function deleteMsn(id) {
    if (!window.confirm('Slette dette betalingsstedet?')) return
    await supabase.from('vipps_msn').delete().eq('id', id)
    load()
  }

  if (!isAdmin) return <div className="text-muted" style={{ padding: 40 }}>Kun administratorer har tilgang til denne siden.</div>

  const isProd = activeEnv === 'prod'

  return (
    <div>
      {/* Aktivt miljø — toppbanner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
        padding: '14px 20px', borderRadius: 8,
        background: isProd ? '#0d2218' : '#2a1e00',
        border: `2px solid ${isProd ? 'var(--green)' : 'var(--yellow)'}`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: isProd ? 'var(--green)' : 'var(--yellow)',
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>{isProd ? '●' : '◉'}</span>
          {isProd ? 'Produksjonsmiljø aktivt' : 'Testmiljø aktivt'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>
          {isProd
            ? 'Skarpe betalinger. Vipps-integrasjonen behandler ekte transaksjoner.'
            : 'Ingen skarpe betalinger — trygt å teste uten å påvirke produksjonsdata.'}
        </div>

        {confirmSwitch ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>Bytte til produksjon?</span>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', border: 'none' }}
              onClick={() => doSwitchEnv('prod')} disabled={switching}>
              {switching ? '…' : 'Ja, bytt til PROD'}
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => setConfirmSwitch(false)}>Avbryt</button>
          </div>
        ) : (
          <button className="btn btn-sm btn-secondary" onClick={() => requestSwitch(isProd ? 'test' : 'prod')} disabled={switching}>
            {isProd ? '⇄ Bytt til TEST' : '⇄ Bytt til PROD'}
          </button>
        )}
      </div>

      <div className="page-header">
        <div>
          <div className="page-title">Vipps-konfigurasjon</div>
          <div className="page-sub">API-legitimasjon og betalingssteder for eCom og Checkout</div>
        </div>
      </div>

      {/* Miljøvelger */}
      <div className="flex gap-8" style={{ marginBottom: 20 }}>
        {['test', 'prod'].map(env => (
          <button key={env} className={`btn btn-sm ${editEnv === env ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setEditEnv(env)}>
            {env === 'test' ? '⚙ Test' : '⚡ Produksjon'}
            {activeEnv === env && (
              <span style={{
                marginLeft: 7, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                background: env === 'prod' ? 'var(--green)' : 'var(--yellow)',
                color: env === 'prod' ? '#fff' : '#000',
                borderRadius: 6, padding: '1px 5px',
              }}>AKTIVT</span>
            )}
          </button>
        ))}
      </div>

      <CardGrid pageKey="vipps-config" cards={[
        {
          id: 'credentials',
          content: (
            <div className="card">
              <div className="card-title">API-legitimasjon — {ENV_LABEL[editEnv]}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
                Base-URL:{' '}
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: 11 }}>
                  {ENV_BASE_URL[editEnv]}
                </code>
                {' '}· Finn nøkler i{' '}
                <span style={{ color: 'var(--accent)' }}>portal.vipps.no → Dine produkter → API-nøkler</span>
              </div>
              <form onSubmit={saveConfig}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                  <div className="form-group">
                    <label className="form-label">Client ID</label>
                    <input className="form-input" {...field('client_id')}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                  </div>
                  <MaskedInput label="Client Secret" {...field('client_secret')} placeholder="Klienthemmelighet" />
                  <MaskedInput label="Subscription Key — Access Token (primærnøkkel)" {...field('subscription_key')}
                    placeholder="Ocp-Apim-Subscription-Key" />
                  <MaskedInput label="Subscription Key — eCom v2" {...field('subscription_key_ecom')}
                    placeholder="Ocp-Apim-Subscription-Key (eCom)" />
                  <MaskedInput label="Subscription Key — Checkout v3" {...field('subscription_key_checkout')}
                    placeholder="Ocp-Apim-Subscription-Key (Checkout)" />
                  <MaskedInput label="Webhook Secret" {...field('webhook_secret')}
                    placeholder="Signaturhemmelighet for innkommende webhooks" />
                </div>

                <div style={{ margin: '20px 0', padding: 12, background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text)' }}>Merk:</strong> Primærnøkkelen brukes ved henting av access token.
                  eCom- og Checkout-nøkler er produktspesifikke nøkler fra Vipps Portal.
                  Dersom du kun har én nøkkel, legg inn samme verdi i alle tre feltene.
                </div>

                <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Lagrer…' : `Lagre ${ENV_LABEL[editEnv]}-legitimasjon`}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={testConnection} disabled={testing}>
                    {testing ? '⟳ Tester…' : '⚡ Test tilkobling'}
                  </button>
                  {saveMsg && (
                    <span style={{ fontSize: 12, color: saveMsg.startsWith('Feil') ? 'var(--red)' : 'var(--green)' }}>
                      {saveMsg}
                    </span>
                  )}
                </div>
              </form>

              {testResult && (
                <div style={{
                  marginTop: 16, padding: 14, borderRadius: 8,
                  background: testResult.ok ? '#0d2218' : '#2a0d0d',
                  border: `1px solid ${testResult.ok ? 'var(--green)' : 'var(--red)'}`,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: testResult.ok ? 'var(--green)' : 'var(--red)', marginBottom: testResult.ok ? 8 : 4 }}>
                    {testResult.ok ? '✓ Tilkobling vellykket' : '✗ Tilkobling mislyktes'}
                  </div>
                  {testResult.ok ? (
                    <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
                      <span>Miljø: <strong style={{ color: 'var(--text)' }}>{testResult.environment}</strong></span>
                      <span>Token-type: <strong style={{ color: 'var(--text)' }}>{testResult.token_type}</strong></span>
                      <span>Token utløper om: <strong style={{ color: 'var(--text)' }}>{testResult.expires_in_minutes} min</strong></span>
                      <span>Responstid: <strong style={{ color: 'var(--text)' }}>{testResult.latency_ms} ms</strong></span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--red)' }}>
                      {testResult.error}
                      {testResult.detail && (
                        <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                          {testResult.detail}
                        </div>
                      )}
                      {testResult.status && (
                        <span style={{ marginLeft: 8, color: 'var(--muted)' }}>HTTP {testResult.status}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ),
        },
        {
          id: 'msn',
          content: (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div className="card-title" style={{ marginBottom: 2 }}>
                    Betalingssteder (MSN) — {ENV_LABEL[editEnv]}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Merchant Serial Number per kassepunkt · {msns[editEnv].filter(m => m.is_active).length} aktive
                  </div>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => setAddingMsn(a => !a)}>
                  {addingMsn ? 'Avbryt' : '+ Legg til MSN'}
                </button>
              </div>

              {addingMsn && (
                <form onSubmit={addMsn} style={{
                  display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto',
                  gap: 8, alignItems: 'flex-end', marginBottom: 20,
                  padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)',
                }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">MSN-nummer</label>
                    <input className="form-input" value={newMsn.msn}
                      onChange={e => setNewMsn(m => ({ ...m, msn: e.target.value }))}
                      placeholder="123456" required style={{ fontFamily: 'var(--font-mono)' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Navn / etikett</label>
                    <input className="form-input" value={newMsn.label}
                      onChange={e => setNewMsn(m => ({ ...m, label: e.target.value }))}
                      placeholder="F.eks. Bongekort arrangement" required />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Beskrivelse (valgfritt)</label>
                    <input className="form-input" value={newMsn.description}
                      onChange={e => setNewMsn(m => ({ ...m, description: e.target.value }))}
                      placeholder="F.eks. brukes ved MC-arrangementer" />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>
                    Legg til
                  </button>
                </form>
              )}

              {msns[editEnv].length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">⊞</div>
                  <div className="empty-state-text">
                    Ingen betalingssteder lagt til for {ENV_LABEL[editEnv]}-miljøet ennå.
                  </div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>MSN</th>
                        <th>Navn</th>
                        <th>Beskrivelse</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                        <th style={{ width: 70 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {msns[editEnv].map(m => (
                        <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.5 }}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{m.msn}</td>
                          <td style={{ fontWeight: 500 }}>{m.label}</td>
                          <td style={{ color: 'var(--muted)', fontSize: 12 }}>{m.description || '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className={`btn btn-sm ${m.is_active ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ fontSize: 11, minWidth: 64 }}
                              onClick={() => toggleMsn(m.id, m.is_active)}
                            >
                              {m.is_active ? 'Aktiv' : 'Inaktiv'}
                            </button>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-sm btn-secondary"
                              style={{ color: 'var(--red)', fontSize: 11 }}
                              onClick={() => deleteMsn(m.id)}>
                              Slett
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ),
        },
        {
          id: 'sync',
          content: (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div className="card-title" style={{ marginBottom: 2 }}>Datasynk</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Henter transaksjoner fra Vipps for alle aktive betalingssteder
                  </div>
                </div>
                <div className="flex gap-8" style={{ alignItems: 'center' }}>
                  <div className="flex gap-8" style={{ alignItems: 'center' }}>
                    <label style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Hent siste</label>
                    <select className="form-select" style={{ width: 110 }} value={daysBack} onChange={e => setDaysBack(Number(e.target.value))}>
                      <option value={7}>7 dager</option>
                      <option value={30}>30 dager</option>
                      <option value={90}>90 dager</option>
                      <option value={180}>180 dager</option>
                      <option value={365}>365 dager</option>
                    </select>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={triggerSync} disabled={syncing}>
                    {syncing ? '⟳ Synkroniserer…' : '↻ Oppdater nå'}
                  </button>
                </div>
              </div>

              {syncResult && (
                <div style={{
                  marginBottom: 20, padding: 14, borderRadius: 8,
                  background: syncResult.ok ? '#0d2218' : '#2a0d0d',
                  border: `1px solid ${syncResult.ok ? 'var(--green)' : 'var(--red)'}`,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: syncResult.ok ? 'var(--green)' : 'var(--red)', marginBottom: syncResult.ok ? 8 : 4 }}>
                    {syncResult.ok ? '✓ Synk fullført' : '✗ Synk mislyktes'}
                  </div>
                  {syncResult.ok ? (
                    <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
                      <span>Miljø: <strong style={{ color: 'var(--text)' }}>{syncResult.environment}</strong></span>
                      <span>Periode: <strong style={{ color: 'var(--text)' }}>{syncResult.from} → {syncResult.to}</strong></span>
                      <span>Transaksjoner: <strong style={{ color: 'var(--text)' }}>{syncResult.transactions_upserted}</strong></span>
                      <span>MSN-er: <strong style={{ color: 'var(--text)' }}>{syncResult.msns_processed}</strong></span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--red)' }}>{syncResult.error}</div>
                  )}
                  {syncResult.msns?.some(m => m.error) && (
                    <div style={{ marginTop: 8 }}>
                      {syncResult.msns.filter(m => m.error).map(m => (
                        <div key={m.msn} style={{ fontSize: 11, color: 'var(--yellow)', fontFamily: 'var(--font-mono)' }}>
                          MSN {m.msn} ({m.label}): {m.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {syncLog.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
                  Ingen synk-kjøringer ennå. Trykk «Oppdater nå» for å starte.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tidspunkt</th>
                        <th>Kilde</th>
                        <th>Miljø</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                        <th style={{ textAlign: 'right' }}>Transaksjoner</th>
                        <th style={{ textAlign: 'right' }}>Periode</th>
                        <th>Feil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncLog.map(row => {
                        const statusColor = row.status === 'success' ? 'var(--green)' : row.status === 'error' ? 'var(--red)' : row.status === 'partial' ? 'var(--yellow)' : 'var(--muted)'
                        const statusLabel = row.status === 'success' ? '✓ OK' : row.status === 'error' ? '✗ Feil' : row.status === 'partial' ? '⚠ Delvis' : '⟳ Kjører'
                        return (
                          <tr key={row.id}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                              {new Date(row.started_at).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                            <td style={{ fontSize: 12 }}>
                              <span style={{ background: row.source === 'cron' ? 'var(--graphite)' : 'var(--accent)22', color: row.source === 'cron' ? 'var(--muted)' : 'var(--accent)', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>
                                {row.source === 'cron' ? 'Automatisk' : 'Manuell'}
                              </span>
                            </td>
                            <td style={{ fontSize: 12 }}>{row.environment}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600, color: statusColor, fontSize: 12 }}>{statusLabel}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.transactions_upserted ?? '—'}</td>
                            <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>{row.days_back ? `${row.days_back}d` : '—'}</td>
                            <td style={{ fontSize: 11, color: 'var(--red)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.error_message || '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ),
        },
        {
          id: 'info',
          content: (
            <div className="card">
              <div className="card-title">Om Vipps-integrasjonen</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Hva hentes automatisk</div>
                  <ul style={{ paddingLeft: 18, lineHeight: 2, margin: 0 }}>
                    <li>Transaksjonshistorikk per MSN</li>
                    <li>Betalingsstatus (CAPTURED, RESERVED, REFUNDED, CANCELLED)</li>
                    <li>Daglige utbetalingsoversikter (settlements til bank)</li>
                    <li>Refusjoner og kanselleringer</li>
                    <li>Statistikk og salgsrapporter</li>
                  </ul>
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Tilgjengelige API-produkter</div>
                  <ul style={{ paddingLeft: 18, lineHeight: 2, margin: 0 }}>
                    <li>Vipps eCom v2 — enkeltbetalinger og ordre</li>
                    <li>Vipps Checkout v3 — fullstendig kasseside</li>
                    <li>Vipps Reporting API v2 — ledger og settlements</li>
                    <li>Vipps Access Token API — OAuth 2.0 autentisering</li>
                  </ul>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>Banksamkjøring:</strong>{' '}
                  Vipps utbetaler til banken som daglige summeringer. Systemet vil automatisk
                  koble individuelle Vipps-transaksjoner mot bankutskriftens "Vipps"-poster for
                  å unngå dobbeltelling i regnskapet.
                </div>
                <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>API-kall skjer serverside:</strong>{' '}
                  Hemmeligheter eksponeres aldri i nettleseren. All kommunikasjon med Vipps
                  går gjennom Supabase Edge Functions med kryptert lagring av nøkler.
                </div>
              </div>
            </div>
          ),
        },
      ]} />
    </div>
  )
}
