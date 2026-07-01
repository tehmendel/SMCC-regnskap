import { supabase } from '../supabaseClient'

// Hent alle aktive regler én gang (for batch-operasjoner)
export async function loadAllRules() {
  const { data } = await supabase
    .from('categorization_rules')
    .select('*')
    .eq('active', true)
    .order('priority')
  return data || []
}

// Ren funksjon — ingen async. Returnerer category_id eller null.
export function matchRule(rules, description, transactionType) {
  const text = (description || '').toLowerCase()
  for (const rule of rules) {
    if (!rule.category_id) continue
    if (rule.transaction_type && rule.transaction_type !== transactionType) continue
    const val = rule.match_value.toLowerCase()
    let match = false
    if (rule.match_type === 'contains')    match = text.includes(val)
    else if (rule.match_type === 'starts_with') match = text.startsWith(val)
    else if (rule.match_type === 'exact')  match = text === val
    if (match) return rule.category_id
  }
  return null
}

/**
 * Kategoriseringsmotor:
 * 1. Sjekk brukerdefinerte regler (høyest prioritet)
 * 2. Sjekk leverandørregister (lært fra historikk)
 * 3. Nøkkelordbasert matching
 * Returns: { category_id, department, confidence, method }
 */
export async function categorize(description, vendorName = null, transactionType = null) {
  const text = (description || '').toLowerCase().trim()
  const vendor = (vendorName || description || '').toLowerCase().trim()

  // 1. Brukerdefinerte regler
  const { data: rules } = await supabase
    .from('categorization_rules')
    .select('*, categories(id,name,type)')
    .eq('active', true)
    .order('priority')

  if (rules) {
    for (const rule of rules) {
      if (rule.transaction_type && rule.transaction_type !== transactionType) continue
      const val = rule.match_value.toLowerCase()
      let match = false
      if (rule.match_type === 'contains') match = text.includes(val) || vendor.includes(val)
      else if (rule.match_type === 'starts_with') match = text.startsWith(val) || vendor.startsWith(val)
      else if (rule.match_type === 'exact') match = text === val || vendor === val
      if (match) {
        return {
          category_id: rule.category_id,
          department: rule.department,
          confidence: 0.97,
          method: 'rule',
          rule_id: rule.id,
        }
      }
    }
  }

  // 2. Leverandørregister
  const { data: vendors } = await supabase
    .from('vendors')
    .select('*')
    .or(`normalized_name.ilike.%${vendor}%,normalized_name.ilike.%${text}%`)
    .order('confidence', { ascending: false })
    .limit(1)

  if (vendors && vendors.length > 0) {
    const v = vendors[0]
    if (v.confidence > 0.5) {
      return {
        category_id: v.suggested_category_id,
        department: v.suggested_department,
        confidence: v.confidence,
        method: 'vendor_history',
        vendor_id: v.id,
      }
    }
  }

  // 3. Ingen match
  return {
    category_id: null,
    department: null,
    confidence: 0,
    method: 'none',
  }
}

/**
 * Logg brukerkorreksjoner som treningsdata
 */
export async function logCorrection({ description, vendorName, suggestedCategoryId, actualCategoryId, wasCorrect, userId }) {
  await supabase.from('categorization_log').insert({
    transaction_description: description,
    vendor_name: vendorName,
    suggested_category_id: suggestedCategoryId,
    actual_category_id: actualCategoryId,
    was_correct: wasCorrect,
    corrected_by: userId,
  })

  // Oppdater leverandørregister hvis korrigert
  if (!wasCorrect && vendorName) {
    const normalized = vendorName.toLowerCase().trim()
    const { data: existing } = await supabase
      .from('vendors')
      .select('*')
      .eq('normalized_name', normalized)
      .single()

    if (existing) {
      const newCount = existing.transaction_count + 1
      const newConf = Math.min(0.99, existing.confidence + 0.02)
      await supabase.from('vendors').update({
        suggested_category_id: actualCategoryId,
        transaction_count: newCount,
        confidence: newConf,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('vendors').insert({
        name: vendorName,
        normalized_name: normalized,
        suggested_category_id: actualCategoryId,
        transaction_count: 1,
        confidence: 0.7,
        last_seen: new Date().toISOString(),
      })
    }
  }
}

/**
 * Last inn data for dynamisk medlemsmatching.
 * Laster alle medlemmer (inkl. inaktive for historisk matching),
 * alle fee_rates og relevante kategorier.
 */
export async function loadMemberMatchData() {
  const [membersRes, ratesRes, catsRes] = await Promise.all([
    supabase.from('members').select('id, full_name, payment_type'),
    supabase.from('fee_rates').select('*').order('effective_from'),
    supabase.from('categories').select('id, name')
      .in('name', ['Medlemsavgift SMCC', 'Medlemsavgift reisekassen']),
  ])
  const cats = catsRes.data || []
  return {
    members:          membersRes.data || [],
    rates:            ratesRes.data  || [],
    membershipCatId:  cats.find(c => c.name === 'Medlemsavgift SMCC')?.id  || null,
    reisekasseCatId:  cats.find(c => c.name === 'Medlemsavgift reisekassen')?.id || null,
  }
}

// Finn gjeldende sats for fee_type på en gitt dato — henter fra fee_rates, ikke hardkodet
function rateAtDate(rates, feeType, date, paymentType) {
  const d = date || new Date().toISOString().slice(0, 10)
  const best = rates
    .filter(r => r.fee_type === feeType && r.effective_from <= d)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]
  if (!best) return null
  const raw = paymentType === 'yearly' ? best.amount_yearly : best.amount_monthly
  return raw != null ? Math.round(parseFloat(raw) * 100) : null  // i øre for nøyaktig sammenligning
}

/**
 * Dynamisk medlemsmatching — sjekker om transaksjonen er en innbetaling fra et kjent medlem.
 * Bruker fee_rates-tabellen slik at satsendringer plukkes opp automatisk.
 * Returnerer category_id (Medlemsavgift SMCC eller reisekassen) eller null.
 */
export function matchMemberPayment(description, amount, type, date, { members, rates, membershipCatId, reisekasseCatId }) {
  if (type !== 'inntekt' || !members.length) return null
  const desc    = (description || '').toLowerCase()
  const amtOere = Math.round(Number(amount) * 100)

  for (const member of members) {
    // Match på navnedeler ≥ 3 tegn (fanger "Roy", "Per", "Jan", osv.)
    const parts = member.full_name.toLowerCase().split(/\s+/).filter(p => p.length >= 3)
    if (!parts.some(p => desc.includes(p))) continue

    // Sjekk mot medlemsavgift-sats (hensyn til yearly/monthly per medlem)
    if (membershipCatId) {
      const rate = rateAtDate(rates, 'membership', date, member.payment_type)
      if (rate !== null && rate === amtOere) return membershipCatId
    }

    // Sjekk mot reisekasse-sats (alltid monthly — ingen yearly reisekasse)
    if (reisekasseCatId) {
      const rate = rateAtDate(rates, 'reisekasse', date, 'monthly')
      if (rate !== null && rate === amtOere) return reisekasseCatId
    }
  }
  return null
}

export function confidenceLabel(confidence) {
  if (confidence >= 0.95) return { label: 'Auto-godkjent', color: 'var(--green)' }
  if (confidence >= 0.75) return { label: 'Krever bekreftelse', color: 'var(--yellow)' }
  return { label: 'Manuell', color: 'var(--red)' }
}
