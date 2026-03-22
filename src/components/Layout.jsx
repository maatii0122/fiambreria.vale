import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, Truck,
  Receipt, TrendingDown, BarChart3, ScanLine, Settings, Menu, X
} from 'lucide-react'

const NAV = [
  { to: '/dashboard', label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/pos',       label: 'Punto de Venta', icon: ShoppingCart },
  { to: '/products',  label: 'Productos',      icon: Package },
  { to: '/purchases', label: 'Compras',         icon: Truck },
  { to: '/sales',     label: 'Ventas',          icon: Receipt },
  { to: '/expenses',  label: 'Gastos',          icon: TrendingDown },
  { to: '/reports',   label: 'Reportes',        icon: BarChart3 },
  { to: '/scanner',   label: 'Scanner',         icon: ScanLine },
  { to: '/settings',  label: 'Config',          icon: Settings },
]

export default function Layout() {
  const [open, setOpen] = useState(false)

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-white/20 text-white' : 'text-blue-200 hover:bg-white/10 hover:text-white'
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-blue-900 text-white sticky top-0 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-base leading-tight">Fiambrerías Vale</div>
              <div className="text-blue-300 text-xs">Sistema de Gestión</div>
            </div>
          </div>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-white/10"
              onClick={() => setOpen(!open)}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="lg:hidden border-t border-blue-800 px-4 py-3 flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass} onClick={() => setOpen(false)}>
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      {/* Content */}
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
