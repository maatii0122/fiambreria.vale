import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

async function fetchRole(userId, setRole) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching role:', error)
      setRole('employee')
      return
    }

    const fetchedRole = data?.role ?? 'employee'
    console.log('Role fetched:', fetchedRole)
    setRole(fetchedRole)
  } catch (err) {
    console.error('fetchRole error:', err)
    const { data: rpcData } = await supabase.rpc('get_my_role').single().catch(() => ({ data: null }))
    setRole(rpcData ?? 'employee')
  }
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      const session = data?.session
      if (session?.user) {
        setUser(session.user)
        await fetchRole(session.user.id, setRole)
      } else {
        setUser(null)
        setRole(null)
      }
      setLoading(false)
    }

    loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        setUser(session.user)
        await fetchRole(session.user.id, setRole)
      } else {
        setUser(null)
        setRole(null)
      }
      setLoading(false)
    })

    return () => {
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
