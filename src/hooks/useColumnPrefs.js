import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'

function loadCache(module, defaultKeys) {
  try {
    const raw = localStorage.getItem(`col_${module}`)
    if (!raw) return { visible: defaultKeys, widths: {} }
    const parsed = JSON.parse(raw)
    // Support legacy format (array) and new format ({visible, widths})
    if (Array.isArray(parsed)) return { visible: parsed, widths: {} }
    return { visible: parsed.visible || defaultKeys, widths: parsed.widths || {} }
  } catch {
    return { visible: defaultKeys, widths: {} }
  }
}

export function useColumnPrefs(module, columnDefs) {
  const defaultRef = useRef(
    columnDefs.filter(c => c.default !== false).map(c => c.key)
  )

  const init = loadCache(module, defaultRef.current)
  const [visibleKeys, setVisibleKeys] = useState(init.visible)
  const [widths, setWidths] = useState(init.widths)

  // Refs so callbacks never get stale
  const visibleRef = useRef(init.visible)
  const widthsRef  = useRef(init.widths)
  const userIdRef  = useRef(null)

  // Load from DB on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id
      if (!uid) return
      userIdRef.current = uid
      supabase.from('user_column_prefs')
        .select('visible_cols, col_widths')
        .eq('user_id', uid)
        .eq('module', module)
        .maybeSingle()
        .then(({ data: pref }) => {
          if (pref?.visible_cols?.length) {
            visibleRef.current = pref.visible_cols
            setVisibleKeys(pref.visible_cols)
          }
          if (pref?.col_widths && Object.keys(pref.col_widths).length) {
            widthsRef.current = pref.col_widths
            setWidths(pref.col_widths)
          }
          const data = { visible: visibleRef.current, widths: widthsRef.current }
          try { localStorage.setItem(`col_${module}`, JSON.stringify(data)) } catch {}
        })
    })
  }, [module])

  const persist = useCallback(async (visible, ws) => {
    const data = { visible, widths: ws }
    try { localStorage.setItem(`col_${module}`, JSON.stringify(data)) } catch {}
    if (!userIdRef.current) return
    await supabase.from('user_column_prefs').upsert(
      { user_id: userIdRef.current, module, visible_cols: visible, col_widths: ws, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,module' }
    )
  }, [module])

  // Toggle column on/off (add to end when showing)
  const toggle = useCallback((key) => {
    setVisibleKeys(prev => {
      const next = prev.includes(key)
        ? (prev.length > 1 ? prev.filter(k => k !== key) : prev)
        : [...prev, key]
      visibleRef.current = next
      persist(next, widthsRef.current)
      return next
    })
  }, [persist])

  // Move column within the visible list (drag reorder)
  const moveColumn = useCallback((fromIdx, toIdx) => {
    setVisibleKeys(prev => {
      const next = [...prev]
      const [removed] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, removed)
      visibleRef.current = next
      persist(next, widthsRef.current)
      return next
    })
  }, [persist])

  // Resize column
  const setWidth = useCallback((key, px) => {
    const next = { ...widthsRef.current, [key]: Math.round(px) }
    widthsRef.current = next
    setWidths(next)
    persist(visibleRef.current, next)
  }, [persist])

  const getWidth = useCallback((key) => widthsRef.current[key], [])

  const reset = useCallback(() => {
    const def = defaultRef.current
    visibleRef.current = def
    widthsRef.current = {}
    setVisibleKeys(def)
    setWidths({})
    persist(def, {})
  }, [persist])

  // Ordered visible column defs
  const orderedVisible = useMemo(
    () => visibleKeys.map(k => columnDefs.find(c => c.key === k)).filter(Boolean),
    [visibleKeys, columnDefs]
  )

  const isVisible = useCallback((key) => visibleKeys.includes(key), [visibleKeys])

  return {
    orderedVisible,
    isVisible,
    toggle,
    moveColumn,
    setWidth,
    getWidth,
    reset,
    allColumns: columnDefs,
  }
}
