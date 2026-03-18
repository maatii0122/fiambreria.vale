import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { exportMultiSheet, PRODUCT_COLUMNS, SALE_COLUMNS, PURCHASE_COLUMNS, EXPENSE_COLUMNS } from '@/lib/xlsxUtils'
import { toast } from 'sonner'
import { Users, Database, Download, Trash2, Loader2 } from 'lucide-react'

export default function Settings() {
  const queryClient = useQueryClient()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*')
      return data || []
    },
  })
  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('*')
      return data || []
    },
  })
  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const { data } = await supabase.from('purchases').select('*')
      return data || []
    },
  })
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*')
      return data || []
    },
  })

  const handleInvite = async () => {
    if (!inviteEmail) { toast.error('Ingresá un email'); return }
    setInviting(true)
    const { error } = await supabase.auth.admin.inviteUserByEmail(inviteEmail)
    setInviting(false)
    if (error) {
      toast.error('Para invitar usuarios necesitás usar el panel de Supabase → Authentication → Users → Invite user')
    } else {
      toast.success(`Invitación enviada a ${inviteEmail}`)
      setInviteEmail('')
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
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
          opts: { title: `Ventas — ${fecha}`, totals: { total: sales.reduce((sum, sale) => sum + (sale.total || 0), 0) } },
        },
        {
          data: purchases.map(p => ({
            ...p,
            items_summary: (p.items || []).map(i => `${i.product_name || i.name} ×${i.quantity}`).join(' | '),
          })),
          columns: PURCHASE_COLUMNS,
          sheetName: 'Compras',
          opts: { title: `Compras — ${fecha}`, totals: { total: purchases.reduce((sum, purchase) => sum + (purchase.total || 0), 0) } },
        },
        {
          data: expenses,
          columns: EXPENSE_COLUMNS,
          sheetName: 'Gastos',
          opts: { title: `Gastos — ${fecha}`, totals: { amount: expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0) } },
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

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500 text-sm mt-1">Administración de datos del sistema</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1"><Users className="w-4 h-4" /> Invitar Empleados</h2>
        <p className="text-sm text-gray-500 mb-4">Enviá invitaciones a tus empleados para que puedan acceder al sistema</p>
        <div className="flex gap-3 flex-wrap">
          <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Email del empleado..." className="flex-1 min-w-[220px] h-11 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button onClick={handleInvite} disabled={inviting} className="px-5 h-11 bg-blue-800 hover:bg-blue-900 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors">
            {inviting && <Loader2 className="w-4 h-4 animate-spin" />} Invitar
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">El empleado recibirá un email con un link para crear su cuenta.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4"><Database className="w-4 h-4" /> Resumen de la Base de Datos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{ label: 'Productos', count: products.length, color: 'bg-blue-50 text-blue-700' },
            { label: 'Ventas', count: sales.length, color: 'bg-blue-50 text-blue-700' },
            { label: 'Compras', count: purchases.length, color: 'bg-purple-50 text-purple-700' },
            { label: 'Gastos', count: expenses.length, color: 'bg-amber-50 text-amber-700' }].map(({ label, count, color }) => (
            <div key={label} className={`${color} rounded-xl p-3 text-center`}>
              <div className="text-xl font-bold">{count}</div>
              <div className="text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">Total: {products.length + sales.length + purchases.length + expenses.length} registros</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1"><Download className="w-4 h-4" /> Exportar Base de Datos</h2>
        <p className="text-sm text-gray-500 mb-4">Descargá todos los datos en un archivo Excel con 4 hojas (productos, ventas, compras, gastos).</p>
        <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800 mb-4">
          Se generará 1 archivo Excel con 4 hojas. Compatible con Excel, Google Sheets y LibreOffice.
        </div>
        <button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 px-6 h-11 bg-blue-800 hover:bg-blue-900 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? 'Exportando...' : 'Descargar Copia de Seguridad'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h2 className="font-semibold text-red-700 flex items-center gap-2 mb-1"><Trash2 className="w-4 h-4" /> Zona Peligrosa</h2>
        <p className="text-sm text-gray-500 mb-4">Esta acción es irreversible. Se eliminarán TODOS los datos de productos, ventas, compras y gastos.</p>
        <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder='Escribí "ELIMINAR TODO" para confirmar' className="w-full h-11 px-3 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-3" />
        <button onClick={handleDeleteAll} disabled={deleting || deleteConfirm !== 'ELIMINAR TODO'} className="flex items-center gap-2 px-6 h-11 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-medium rounded-xl transition-colors">
          {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Eliminar todos los datos
        </button>
      </div>
    </div>
  )
}
