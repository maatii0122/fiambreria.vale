import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useUserProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      setLoading(true)
      const { data: user } = await supabase.auth.getUser()
      if (!user?.id) {
        if (isMounted) {
          setProfile(null)
          setLoading(false)
        }
        return
      }
      const { data, error } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
      if (error) {
        console.error('Error loading profile', error)
      }
      if (isMounted) {
        setProfile({ role: data?.role, id: user.id })
        setLoading(false)
      }
    }
    load()
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      load()
    })
    return () => {
      isMounted = false
      listener?.subscription.unsubscribe()
    }
  }, [])

  return { profile, loading }
}
