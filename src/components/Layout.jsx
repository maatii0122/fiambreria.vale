import { useMemo } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard, ShoppingCart, Package, Truck,
  Receipt, TrendingDown, BarChart3, ScanLine, Settings
} from 'lucide-react'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
  { to: '/pos', label: 'Punto de Venta', icon: ShoppingCart },
  { to: '/productos', label: 'Productos', icon: Package },
  { to: '/compras', label: 'Compras', icon: Truck },
  { to: '/ventas', label: 'Ventas', icon: Receipt, adminOnly: true },
  { to: '/gastos', label: 'Gastos', icon: TrendingDown, adminOnly: true },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, adminOnly: true },
  { to: '/scanner', label: 'Scanner', icon: ScanLine },
  { to: '/config', label: 'Config', icon: Settings, adminOnly: true },
]

export default function Layout() {
  const { role, logout } = useAuth()

  const visibleMenu = useMemo(
    () => NAV.filter((item) => !item.adminOnly || role === 'admin'),
    [role]
  )

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-white/20 text-white' : 'text-blue-200 hover:bg-white/10 hover:text-white'
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="h-12 border-b border-blue-200 bg-white px-4 flex items-center justify-between">
        <span className="font-semibold text-gray-900">Fiambrerías Vale</span>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-blue-700 border border-blue-700 rounded-full px-3 py-1 transition-colors hover:bg-blue-50"
        >
          Cambiar usuario
        </button>
      </header>
      <div className="flex">
        <aside className="w-60 bg-blue-900 text-white px-4 py-6 border-r border-blue-800 min-h-[calc(100vh-48px)] space-y-2">
          {visibleMenu.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </aside>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
