import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/pos', label: 'Punto de Venta' },
  { to: '/productos', label: 'Productos' },
  { to: '/compras', label: 'Compras' },
  { to: '/ventas', label: 'Ventas' },
  { to: '/gastos', label: 'Gastos' },
  { to: '/reportes', label: 'Reportes' },
  { to: '/scanner', label: 'Scanner' },
  { to: '/config', label: 'Config' },
]

export default function Layout() {
  const { logout } = useAuth()

  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-full text-sm font-semibold transition-colors ${
      isActive ? 'bg-white text-blue-900' : 'text-blue-200 hover:text-white hover:bg-blue-800'
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white border-b border-blue-800 fixed inset-x-0 top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="font-semibold tracking-[0.3em]">Fiambrerías Vale</div>
          <nav className="flex gap-2">
            {NAV.map(({ to, label }) => (
              <NavLink key={to} to={to} className={linkClass}>
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={logout}
            className="px-4 py-1 bg-white text-blue-700 rounded-full text-sm font-semibold"
          >
            Cambiar usuario
          </button>
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto px-4 py-6 pt-24">
        <Outlet />
      </main>
    </div>
  )
}
