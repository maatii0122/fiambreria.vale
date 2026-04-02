import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', adminOnly: false },
  { to: '/pos', label: 'Punto de Venta', adminOnly: false },
  { to: '/productos', label: 'Productos', adminOnly: false },
  { to: '/compras', label: 'Compras', adminOnly: false },
  { to: '/ventas', label: 'Ventas', adminOnly: false },
  { to: '/gastos', label: 'Gastos', adminOnly: false },
  { to: '/reportes', label: 'Reportes', adminOnly: true },
  { to: '/scanner', label: 'Scanner', adminOnly: false },
  { to: '/config', label: 'Config', adminOnly: true },
]

export default function Layout() {
  const { logout, role } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const visibleNav = NAV_ITEMS.filter(item => !item.adminOnly || role === 'admin')

  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-full text-sm font-semibold transition-colors ${
      isActive ? 'bg-white text-blue-900' : 'text-blue-200 hover:text-white hover:bg-blue-800'
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white border-b border-blue-800 fixed inset-x-0 top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="font-semibold tracking-[0.3em]">Fiambrerías Vale</div>
          <nav className="hidden md:flex gap-2">
            {visibleNav.map(({ to, label }) => (
              <NavLink key={to} to={to} className={linkClass}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={logout}
              className="hidden md:inline-flex px-4 py-1 bg-white text-blue-700 rounded-full text-sm font-semibold"
            >
              Cambiar usuario
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white text-white md:hidden"
              aria-label="Abrir menú"
            >
              <span className="w-5 h-5 flex flex-col justify-between">
                <span className="block h-[2px] w-full bg-white" />
                <span className="block h-[2px] w-full bg-white" />
                <span className="block h-[2px] w-full bg-white" />
              </span>
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="md:hidden bg-blue-900 border-t border-blue-800">
            <div className="px-4 py-3 flex flex-col gap-2">
              {visibleNav.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className="text-white text-sm font-semibold px-3 py-2 rounded-lg bg-blue-800/70 hover:bg-white/10"
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={logout}
                className="text-sm font-semibold text-white border border-white rounded-full px-3 py-2"
              >
                Cambiar usuario
              </button>
            </div>
          </nav>
        )}
      </header>
      <main className="max-w-[1200px] mx-auto px-4 py-6 pt-24">
        <Outlet />
      </main>
    </div>
  )
}
