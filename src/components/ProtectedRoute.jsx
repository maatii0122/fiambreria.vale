import { Navigate } from 'react-router-dom'
import { useUserProfile } from '@/hooks/useUserProfile'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { profile, loading } = useUserProfile()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin w-10 h-10 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )

  if (!profile) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(profile?.role)) {
    return <Navigate to="/pos" replace />
  }
  return children
}
