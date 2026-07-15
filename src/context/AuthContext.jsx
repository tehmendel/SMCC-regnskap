import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [realProfile, setRealProfile] = useState(null)
  const [impersonatedProfile, setImpersonatedProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setRealProfile(null); setImpersonatedProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setRealProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    setImpersonatedProfile(null)
    await supabase.auth.signOut()
  }

  function startImpersonation(profile) {
    setImpersonatedProfile(profile)
  }

  function stopImpersonation() {
    setImpersonatedProfile(null)
  }

  const profile = impersonatedProfile || realProfile
  const isImpersonating = !!impersonatedProfile
  const isAdmin = realProfile?.role === 'admin'
  const isKasserer = profile?.role === 'kasserer' || profile?.role === 'admin'
  const isMedlem = !!profile

  return (
    <AuthContext.Provider value={{
      user, profile, realProfile, loading,
      signIn, signOut, startImpersonation, stopImpersonation,
      isAdmin, isKasserer, isMedlem, isImpersonating,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
