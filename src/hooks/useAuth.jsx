import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAILS = (import.meta.env.VITE_SUPABASE_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

const isAdminEmail = (email) => {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

const ROLE_CACHE_KEY = 'fiambrerias-role-cache'

function getCachedRole(userId) {
  try {
    const stored = sessionStorage.getItem(ROLE_CACHE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    if (parsed.userId === userId) return parsed.role
  } catch {}
  return null
}

function setCachedRole(userId, role) {
  try {
    sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId, role }))
  } catch {}
}

function clearCachedRole() {
  try {
    sessionStorage.removeItem(ROLE_CACHE_KEY)
  } catch {}
}

async function resolveRole(userId, email) {
  const cached = getCachedRole(userId)
  if (cached) return cached

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single()
    if (!error && data?.role) {
      setCachedRole(userId, data.role)
      return data.role
    }
  } catch {}

  const role = isAdminEmail(email) ? 'admin' : 'employee'
  setCachedRole(userId, role)
  return role
}

const AuthContext = createContext(null)

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT') {
          clearCachedRole()
          setUser(null)
          setRole(null)
          setLoading(false)
          return
        }

        if (session?.user) {
          setUser(session.user)

          // On token refresh, use cached role — do NOT hit DB again
          if (event === 'TOKEN_REFRESHED') {
            const cached = getCachedRole(session.user.id)
            if (cached) {
              setRole(cached)
              setLoading(false)
              return
            }
          }

          const resolvedRole = await resolveRole(session.user.id, session.user.email)
          if (mounted) setRole(resolvedRole)
        } else {
          clearCachedRole()
          setUser(null)
          setRole(null)
        }

        if (mounted) setLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  const logout = async () => {
    clearCachedRole()
    await supabase.auth.signOut()
  }

  const value = useMemo(
    () => ({ user, role, loading, login, logout }),
    [user, role, loading]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
