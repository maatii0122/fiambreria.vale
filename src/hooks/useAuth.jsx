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

function getCached(userId) {
  try {
    const stored = sessionStorage.getItem(ROLE_CACHE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    if (parsed.userId === userId) return parsed
  } catch {}
  return null
}

function setCache(userId, role, displayName) {
  try {
    sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId, role, displayName }))
  } catch {}
}

function clearCache() {
  try {
    sessionStorage.removeItem(ROLE_CACHE_KEY)
  } catch {}
}

function emailToName(email) {
  if (!email) return 'Usuario'
  const local = email.split('@')[0]
  // capitalize first segment before dot or number
  const first = local.split(/[._0-9]/)[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

async function resolveProfile(userId, email) {
  const cached = getCached(userId)
  if (cached?.role) return { role: cached.role, displayName: cached.displayName || emailToName(email) }

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role, username')
      .eq('id', userId)
      .single()
    if (!error && data?.role) {
      const displayName = data.username?.trim() || emailToName(email)
      setCache(userId, data.role, displayName)
      return { role: data.role, displayName }
    }
  } catch {}

  const role = isAdminEmail(email) ? 'admin' : 'employee'
  const displayName = emailToName(email)
  setCache(userId, role, displayName)
  return { role, displayName }
}

const AuthContext = createContext(null)

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT') {
          clearCache()
          setUser(null)
          setRole(null)
          setDisplayName('')
          setLoading(false)
          return
        }

        if (session?.user) {
          setUser(session.user)

          // On token refresh, use cached data — do NOT hit DB again
          if (event === 'TOKEN_REFRESHED') {
            const cached = getCached(session.user.id)
            if (cached?.role) {
              setRole(cached.role)
              setDisplayName(cached.displayName || emailToName(session.user.email))
              setLoading(false)
              return
            }
          }

          const profile = await resolveProfile(session.user.id, session.user.email)
          if (mounted) {
            setRole(profile.role)
            setDisplayName(profile.displayName)
          }
        } else {
          clearCache()
          setUser(null)
          setRole(null)
          setDisplayName('')
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
    clearCache()
    await supabase.auth.signOut()
  }

  const value = useMemo(
    () => ({ user, role, displayName, loading, login, logout }),
    [user, role, displayName, loading]
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
