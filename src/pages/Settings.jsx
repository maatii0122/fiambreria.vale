import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { exportMultiSheet, PRODUCT_COLUMNS, SALE_COLUMNS, PURCHASE_COLUMNS, EXPENSE_COLUMNS } from '@/lib/xlsxUtils'
import { toast } from 'sonner'
import { Users, Database, Download, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'employee', label: 'Empleado' },
]

export default function Settings() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('employee')
  const [inviting, setInviting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [profiles, setProfiles] = useState([])

  const { data: counts = { products: 0, sales: 0, purchases: 0, expenses: 0 } } = useQuery({
    queryKey: ['settings-counts'],
    queryFn: async () => {
      const [p, s, pu, e] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('sales').select('*', { count: 'exact', head: true }),
        supabase.from('purchases').select('*', { count: 'exact', head: true }),
        supabase.from('expenses').select('*', { count: 'exact', head: true }),
      ])
      return { products: p.count || 0, sales: s.count || 0, purchases: pu.count || 0, expenses: e.count || 0 }
    },
    enabled: !!user,
  })

  const loadProfiles = useCallback(async () => {
    const { data, error } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false })
    if (error) {
      toast.error('No se pudo cargar la lista de usuarios')
      return
    }
    setProfiles(data || [])
  }, [])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  const handleInvite = async () => {
    if (!inviteEmail) { toast.error('Ingresá un email'); return }
    setInviting(true)
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(inviteEmail)
    setInviting(false)
    if (error) {
      toast.error('No se pudo invitar: ' + error.message)
      return
    }
    const userId = data?.user?.id
    if (!userId) {
      toast.error('No se pudo obtener el ID del usuario')
      return
    }
    const { error: profileError } = await supabase.from('user_profiles').upsert({
      id: userId,
      email: inviteEmail,
      role: inviteRole,
    })
    if (profileError) {
      toast.error('No se pudo guardar el rol: ' + profileError.message)
      return
    }
    toast.success(`Invitación enviada a ${inviteEmail}`)
    setInviteEmail('')
    setInviteRole('employee')
    loadProfiles()
  }

  const fetchAll = async (table, order = 'created_at') => {
    const PAGE = 1000
    let rows = [], from = 0
    while (true) {
      const { data, error } = await supabase.from(table).select('*').order(order).range(from, from + PAGE - 1)
      if (error) throw error
      rows = rows.concat(data || [])
      if (!data || data.length < PAGE) break
      from += PAGE
    }
    return rows
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const [products, sales, purchases, expenses] = await Promise.all([
        fetchAll('products', 'name'),
        fetchAll('sales', 'created_at'),
        fetchAll('purchases', 'created_at'),
        fetchAll('expenses', 'date'),
      ])
      const now = new Date()
      const fecha = now.toLocaleDateString('es-AR')
      const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
      exportMultiSheet([
        {
          data: products.map(p => ({ ...p, active: p.active ? 'Sí' : 'No' })),
          columns: PRODUCT_COLUMNS,
          sheetName: 'Productos',
          opts: { title: `Productos — ${fecha}` },
        },
        {
          data: sales.map(s => ({
            ...s,
            items_summary: (s.items || []).map(i => `${i.product_name} ×${i.quantity}`).join(' | '),
          })),
          columns: SALE_COLUMNS,
          sheetName: 'Ventas',
          opts: { title: `Ventas — ${fecha}`, totals: { total: sales.reduce((sum, s) => sum + (s.total || 0), 0) } },
        },
        {
          data: purchases.map(p => ({
            ...p,
            items_summary: (p.items || []).map(i => `${i.product_name || i.name} ×${i.quantity}`).join(' | '),
          })),
          columns: PURCHASE_COLUMNS,
          sheetName: 'Compras',
          opts: { title: `Compras — ${fecha}`, totals: { total: purchases.reduce((sum, p) => sum + (p.total || 0), 0) } },
        },
        {
          data: expenses,
          columns: EXPENSE_COLUMNS,
          sheetName: 'Gastos',
          opts: { title: `Gastos — ${fecha}`, totals: { amount: expenses.reduce((sum, e) => sum + (e.amount || 0), 0) } },
        },
      ], `backup_vale_${ts}`)
      toast.success('Backup descargado correctamente')
    } catch (err) {
      toast.error('Error al exportar: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const handleDeleteAll = async () => {
    if (deleteConfirm !== 'ELIMINAR TODO') { toast.error('Escribí exactamente "ELIMINAR TODO"'); return }
    setDeleting(true)
    try {
      const DUMMY = '00000000-0000-0000-0000-000000000000'
      await Promise.all([
        supabase.from('sales').delete().neq('id', DUMMY),
        supabase.from('purchases').delete().neq('id', DUMMY),
        supabase.from('expenses').delete().neq('id', DUMMY),
        supabase.from('products').delete().neq('id', DUMMY),
      ])
      queryClient.invalidateQueries()
      toast.success('Todos los datos eliminados')
      setDeleteConfirm('')
    } catch (err) {
      toast.error('Error al eliminar: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  const handleRoleChange = async (profile, role) => {
    const { error } = await supabase.from('user_profiles').update({ role }).eq('id', profile.id)
    if (error) {
      toast.error('No se pudo actualizar el rol')
      return
    }
    toast.success('Rol actualizado')
    loadProfiles()
  }

  const totalRecords = counts.products + counts.sales + counts.purchases + counts.expenses

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500 text-sm mt-1">Administración de datos y accesos</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Users className="w-4 h-4" /> Invitar usuarios</h2>
        <p className="text-sm text-gray-500">Solo los usuarios registrados aquí podrán iniciar sesión.</p>
        <div className="flex flex-wrap gap-3">
          <input
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="Email del usuario..."
            className="flex-1 min-w-[220px] h-11 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="h-11 px-3 border border-gray-200 rounded-lg text-sm">
            {ROLE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            onClick={handleInvite}
            disabled={inviting}
            className="px-5 h-11 bg-zinc-800 hover:bg-zinc-900 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
          >
            {inviting && <Loader2 className="w-4 h-4 animate-spin" />} Crear usuario
          </button>
        </div>
        <p className="text-xs text-gray-400">Todos los usuarios reciben un email para completar el registro.</p>
      </div>

      {profiles.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">Usuarios registrados</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.08em] text-zinc-400 border-b border-zinc-100">
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Rol</th>
                  <th className="px-4 py-2">Creado</th>
                  <th className="px-4 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(profile => (
                  <tr key={profile.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{profile.email}</td>
                    <td className="px-4 py-2">
                      <select value={profile.role} onChange={e => handleRoleChange(profile, e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-sm">
                        {ROLE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">{new Date(profile.created_at).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">Para eliminar usuarios usá el panel de Supabase</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Database className="w-4 h-4" /> Resumen de la base</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{ label: 'Productos', count: counts.products, color: 'bg-zinc-50 text-blue-700' },
            { label: 'Ventas', count: counts.sales, color: 'bg-zinc-50 text-blue-700' },
            { label: 'Compras', count: counts.purchases, color: 'bg-purple-50 text-purple-700' },
            { label: 'Gastos', count: counts.expenses, color: 'bg-amber-50 text-amber-700' }].map(({ label, count, color }) => (
            <div key={label} className={`${color} rounded-xl p-3 text-center`}>
              <div className="text-xl font-bold">{count}</div>
              <div className="text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">Total: {totalRecords} registros</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Download className="w-4 h-4" /> Exportar base de datos</h2>
        <p className="text-sm text-gray-500 mb-4">Descargá un Excel con productos, ventas, compras y gastos.</p>
        <div className="bg-zinc-50 rounded-lg p-3 text-sm text-zinc-800 mb-4">
          El archivo contiene 4 hojas compatibles con Excel, Sheets y LibreOffice.
        </div>
        <button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 px-6 h-11 bg-zinc-800 hover:bg-zinc-900 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? 'Exportando...' : 'Descargar copia de seguridad'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h2 className="font-semibold text-red-700 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Zona peligrosa</h2>
        <p className="text-sm text-gray-500 mb-4">Esta acción elimina TODO registro.</p>
        <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder='Escribí "ELIMINAR TODO" para confirmar' className="w-full h-11 px-3 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-3" />
        <button onClick={handleDeleteAll} disabled={deleting || deleteConfirm !== 'ELIMINAR TODO'} className="flex items-center gap-2 px-6 h-11 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-medium rounded-xl transition-colors">
          {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Eliminar todos los datos
        </button>
      </div>
    </div>
  )
}
