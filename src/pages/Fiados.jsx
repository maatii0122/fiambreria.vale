import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatDateTimeART, fmtMoney } from '@/components/argentina'
import { useAuth } from '@/hooks/useAuth'
import { ChevronDown, ChevronUp } from 'lucide-react'

const STATUS_LABEL = { pendiente: 'Pendiente', pagado: 'Pagado' }
const STATUS_CLASS = {
  pendiente: 'bg-amber-100 text-amber-700',
  pagado: 'bg-emerald-100 text-emerald-700',
}

export default function Fiados() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [filter, setFilter] = useState('pendiente')
  const [expandedId, setExpandedId] = useState(null)
  const [payModal, setPayModal] = useState(null) // fiado object to mark as paid
  const [payMethod, setPayMethod] = useState('efectivo')

  const { data: fiados = [], isLoading } = useQuery({
    queryKey: ['fiados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fiados')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  const filtered = filter === 'todos' ? fiados : fiados.filter(f => f.status === filter)

  const totalPendiente = fiados
    .filter(f => f.status === 'pendiente')
    .reduce((sum, f) => sum + (f.amount || 0), 0)

  const countPendiente = fiados.filter(f => f.status === 'pendiente').length

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, method }) => {
      const { error } = await supabase
        .from('fiados')
        .update({
          status: 'pagado',
          paid_method: method,
          paid_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiados'] })
      toast.success('Fiado marcado como pagado')
      setPayModal(null)
    },
    onError: () => toast.error('Error al actualizar el fiado'),
  })

  const handleMarkPaid = () => {
    if (!payModal) return
    markPaidMutation.mutate({ id: payModal.id, method: payMethod })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Crédito</p>
          <h1 className="text-3xl font-bold">Fiados</h1>
        </div>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <p className="text-sm text-amber-600 font-medium">Total pendiente</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{fmtMoney(totalPendiente)}</p>
          <p className="text-xs text-amber-500 mt-1">{countPendiente} {countPendiente === 1 ? 'fiado' : 'fiados'} sin cobrar</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <p className="text-sm text-gray-500 font-medium">Total registrado</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtMoney(fiados.reduce((s, f) => s + (f.amount || 0), 0))}</p>
          <p className="text-xs text-gray-400 mt-1">{fiados.length} {fiados.length === 1 ? 'fiado total' : 'fiados totales'}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: 'pendiente', label: 'Pendientes' },
          { key: 'pagado', label: 'Pagados' },
          { key: 'todos', label: 'Todos' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              filter === key ? 'bg-zinc-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading && (
          <div className="py-12 text-center text-sm text-gray-400">Cargando fiados...</div>
        )}
        {!isLoading && !filtered.length && (
          <div className="py-12 text-center text-sm text-gray-400">
            {filter === 'pendiente' ? 'No hay fiados pendientes.' : 'No hay fiados registrados.'}
          </div>
        )}
        {filtered.map(fiado => {
          const isExpanded = expandedId === fiado.id
          return (
            <div key={fiado.id} className="bg-white rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-3 p-4">
                {/* Status indicator */}
                <div className={`w-2 h-10 rounded-full shrink-0 ${fiado.status === 'pendiente' ? 'bg-amber-400' : 'bg-emerald-400'}`} />

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{fiado.customer_name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[fiado.status]}`}>
                      {STATUS_LABEL[fiado.status]}
                    </span>
                    {fiado.paid_method && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                        {fiado.paid_method === 'mercadopago' ? 'Mercado Pago' : 'Efectivo'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDateTimeART(fiado.created_at)}
                    {fiado.paid_at && ` · Pagado ${formatDateTimeART(fiado.paid_at)}`}
                  </p>
                </div>

                {/* Amount + actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-lg font-bold text-gray-900">{fmtMoney(fiado.amount)}</p>

                  {fiado.status === 'pendiente' && (
                    <button
                      onClick={() => { setPayModal(fiado); setPayMethod('efectivo') }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      Cobrar
                    </button>
                  )}

                  <button
                    onClick={() => setExpandedId(isExpanded ? null : fiado.id)}
                    className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded items */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Detalle</p>
                  <div className="space-y-1">
                    {(fiado.items || []).map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.product_name} <span className="text-gray-400">×{item.quantity}</span></span>
                        <span className="font-semibold text-gray-900">{fmtMoney(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Mark as paid modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-5 shadow-xl">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest">Cobrar fiado</p>
              <h3 className="text-xl font-bold mt-1">{payModal.customer_name}</h3>
              <p className="text-2xl font-bold text-zinc-900 mt-1">{fmtMoney(payModal.amount)}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Método de cobro</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'efectivo', label: '💵 Efectivo' },
                  { key: 'mercadopago', label: '📱 Mercado Pago' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPayMethod(key)}
                    className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                      payMethod === key
                        ? 'bg-zinc-900 text-white'
                        : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setPayModal(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={markPaidMutation.isLoading}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
              >
                Confirmar cobro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
