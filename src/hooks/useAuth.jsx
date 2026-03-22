import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

async function fetchRole(userId) {
  const { data } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single()
  return data?.role ?? 'employee'
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      const session = data?.session
      if (session?.user) {
        const fetchedRole = await fetchRole(session.user.id)
        if (mounted) {
          setUser(session.user)
          setRole(fetchedRole)
        }
      } else if (mounted) {
        setUser(null)
        setRole(null)
      }
      if (mounted) setLoading(false)
    }
    loadSession()
    const { data: listener } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        const fetchedRole = await fetchRole(session.user.id)
        setUser(session.user)
        setRole(fetchedRole)
      } else {
        setUser(null)
        setRole(null)
      }
    })
    return () => {
      mounted = false
      listener?.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({ user, role, loading }), [user, role, loading])

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
