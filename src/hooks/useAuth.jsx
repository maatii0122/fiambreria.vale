import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAILS = (import.meta.env.VITE_SUPABASE_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

const isAdminEmail = (email) => {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

const AuthContext = createContext(null)

async function fetchRole(userId, email, setRole) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching role:', error)
      throw error
    }

    const fetchedRole = data?.role ?? 'employee'
    console.log('Role fetched:', fetchedRole)
    setRole(fetchedRole)
    return
  } catch (err) {
    console.error('fetchRole error:', err)
    try {
      const { data: rpcData } = await supabase.rpc('get_my_role')
      const fallbackFromRpc = rpcData ?? null
      if (fallbackFromRpc) {
        setRole(fallbackFromRpc)
        return
      }
    } catch (rpcError) {
      console.error('get_my_role error:', rpcError)
    }
    const fallbackRole = isAdminEmail(email) ? 'admin' : 'employee'
    try {
      const { data: ensured } = await supabase.rpc('ensure_my_profile', { preferred_role: fallbackRole })
      setRole(ensured?.role || fallbackRole)
    } catch (rpcError) {
      console.error('ensure_my_profile error:', rpcError)
      setRole(fallbackRole)
    }
    return
  }
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const subscription = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      try {
        if (session?.user) {
          setUser(session.user)
          await fetchRole(session.user.id, session.user.email, setRole)
        } else {
          setUser(null)
          setRole(null)
        }
      } catch (err) {
        console.error('Auth state error:', err)
        setUser(null)
        setRole(null)
      } finally {
        if (mounted) setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

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
