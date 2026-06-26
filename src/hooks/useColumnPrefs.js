import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

export function useColumnPrefs(module, columnDefs) {
  const defaultRef = useRef(
    columnDefs.filter(c => c.default !== false).map(c => c.key)
  )

  const [visible, setVisible] = useState(() => {
    try {
      const cached = localStorage.getItem(`col_${module}`)
      if (cached) return new Set(JSON.parse(cached))
    } catch (_) {}
    return new Set(defaultRef.current)
  })

  const userIdRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id
      if (!uid) return
      userIdRef.current = uid
      supabase.from('user_column_prefs')
        .select('visible_cols')
        .eq('user_id', uid)
        .eq('module', module)
        .maybeSingle()
        .then(({ data: pref }) => {
          if (pref?.visible_cols?.length) {
            const s = new Set(pref.visible_cols)
            setVisible(s)
            try { localStorage.setItem(`col_${module}`, JSON.stringify([...s])) } catch (_) {}
          }
        })
    })
  }, [module])

  const persist = useCallback(async (next) => {
    setVisible(next)
    try { localStorage.setItem(`col_${module}`, JSON.stringify([...next])) } catch (_) {}
    if (!userIdRef.current) return
    await supabase.from('user_column_prefs').upsert(
      { user_id: userIdRef.current, module, visible_cols: [...next], updated_at: new Date().toISOString() },
      { onConflict: 'user_id,module' }
    )
  }, [module])

  const toggle = useCallback((key) => {
    setVisible(prev => {
      const next = new Set(prev)
      if (next.has(key)) { if (next.size > 1) next.delete(key) }
      else next.add(key)
      persist(next)
      return next
    })
  }, [persist])

  const reset = useCallback(() => persist(new Set(defaultRef.current)), [persist])

  return {
    isVisible: (key) => visible.has(key),
    toggle,
    reset,
    allColumns: columnDefs,
  }
}
