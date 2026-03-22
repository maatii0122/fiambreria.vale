import { Outlet } from 'react-router-dom'
import LoginForm from './LoginForm'
import AccessDenied from './AccessDenied'
import { useAuth } from '@/hooks/useAuth'

export default function ProtectedRoute({ adminOnly = false }) {
  const { user, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginForm />
  if (adminOnly && role !== 'admin') return <AccessDenied />

  return <Outlet />
}
