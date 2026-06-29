import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export function useCardLayout(pageKey, defaultOrder) {
  const { profile } = useAuth()
  const [order, setOrder] = useState(defaultOrder.map(c => c.id))

  useEffect(() => {
    if (!profile) return
    supabase
      .from('user_preferences')
      .select('value')
      .eq('user_id', profile.id)
      .eq('key', `layout:${pageKey}`)
      .single()
      .then(({ data }) => {
        if (data?.value && Array.isArray(data.value)) {
          // Merge: keep any new cards added since last save, remove deleted ones
          const saved = data.value.filter(id => defaultOrder.some(c => c.id === id))
          const newCards = defaultOrder.map(c => c.id).filter(id => !saved.includes(id))
          setOrder([...saved, ...newCards])
        }
      })
  }, [profile?.id, pageKey])

  const saveOrder = useCallback(async (newOrder) => {
    setOrder(newOrder)
    if (!profile) return
    await supabase.from('user_preferences').upsert({
      user_id: profile.id,
      key: `layout:${pageKey}`,
      value: newOrder,
      updated_at: new Date().toISOString(),
    })
  }, [profile?.id, pageKey])

  const sortedCards = order
    .map(id => defaultOrder.find(c => c.id === id))
    .filter(Boolean)

  return { sortedCards, order, saveOrder }
}
