import { supabase } from '../supabaseClient'

/**
 * Kategoriseringsmotor:
 * 1. Sjekk brukerdefinerte regler (høyest prioritet)
 * 2. Sjekk leverandørregister (lært fra historikk)
 * 3. Nøkkelordbasert matching
 * Returns: { category_id, department, confidence, method }
 */
export async function categorize(description, vendorName = null) {
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

export function confidenceLabel(confidence) {
  if (confidence >= 0.95) return { label: 'Auto-godkjent', color: 'var(--green)' }
  if (confidence >= 0.75) return { label: 'Krever bekreftelse', color: 'var(--yellow)' }
  return { label: 'Manuell', color: 'var(--red)' }
}
