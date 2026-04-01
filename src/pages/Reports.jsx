import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer, Legend
} from 'recharts'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, formatDateOnlyART } from '@/components/argentina'
import { useReportsData } from '@/hooks/useReportsData'
import { addPromotion, loadPromotions } from '@/lib/promotions'
import { useAuth } from '@/hooks/useAuth'

const PIE_COLORS = ['#1E3A8A','#2563EB','#3B82F6','#60A5FA','#93C5FD','#BFDBFE','#DBEAFE','#1D4ED8','#1E40AF','#1E3A8A']

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

const ACCESS_KEY = 'LucasVale111'

export default function Reports() {
  const now = new Date()
  const [codeInput, setCodeInput] = useState('')
  const [accessGranted, setAccessGranted] = useState(false)
  const [accessError, setAccessError] = useState('')
  const { user } = useAuth()

  const [periodMode, setPeriodMode] = useState('month')
  const [customYear, setCustomYear] = useState(now.getFullYear())
  const [customMonth, setCustomMonth] = useState(now.getMonth())
  const [periodConfig, setPeriodConfig] = useState({
    type: 'month',
    year: now.getFullYear(),
    month: now.getMonth(),
  })
  const [promotions, setPromotions] = useState(() => loadPromotions())

  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(2000)
      return data || []
    },
    enabled: !!user && accessGranted,
  })
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*').order('date', { ascending: false }).limit(2000)
      return data || []
    },
    enabled: !!user && accessGranted,
  })
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*')
      return data || []
    },
    enabled: !!user && accessGranted,
  })

  const data = useReportsData(sales, expenses, products, periodConfig)

  useEffect(() => {
    if (periodMode !== 'custom') return
    setPeriodConfig({ type: 'month', year: customYear, month: customMonth })
  }, [customYear, customMonth, periodMode])

  const handleModeChange = (mode) => {
    setPeriodMode(mode)
    if (mode === 'week') {
      setPeriodConfig({ type: 'week' })
    } else if (mode === 'month') {
      setPeriodConfig({ type: 'month', year: now.getFullYear(), month: now.getMonth() })
    } else {
      setPeriodConfig({ type: 'month', year: customYear, month: customMonth })
    }
  }

  const handleAccessSubmit = (e) => {
    e.preventDefault()
    if (codeInput === ACCESS_KEY) {
      setAccessGranted(true)
      setAccessError('')
      setCodeInput('')
    } else {
      setAccessError('Clave incorrecta')
      setCodeInput('')
    }
  }

  const {
    totalRevenue, prevRevenue, sameLastYear, totalExpenses, totalProfit,
    netProfit, projected, daysInMonth, daysElapsed, dailyChart,
    expPieChart, rotacion, canasta, criticalStock, tips, dailyAvg,
  } = data

  const revDelta = prevRevenue === 0 ? 0 : Math.round((totalRevenue - prevRevenue) / prevRevenue * 100)
  const yearDelta = sameLastYear === 0 ? 0 : Math.round((totalRevenue - sameLastYear) / sameLastYear * 100)
  const revenueLabel = totalRevenue ? `${fmtMoney(totalRevenue)} · ${sales.length} ventas` : 'Sin ventas aún'
  const topRotation = rotacion[0]
  const criticalProduct = criticalStock[0]
  const suggestedPromotion = useMemo(() => {
    if (!topRotation || !criticalProduct) return null
    const name = `Combo inteligente: ${topRotation.product_name} + ${criticalProduct.name}`
    return {
      name,
      description: `Reforzá la visibilidad de ${topRotation.product_name} junto con ${criticalProduct.name}, ya que el primero es el más vendido y el segundo está crítico en stock.`,
      productIds: [topRotation.product_id, criticalProduct.id].filter(Boolean),
      productNames: [topRotation.product_name, criticalProduct.name],
    }
  }, [topRotation, criticalProduct])

  const handleCreatePromotion = () => {
    if (!suggestedPromotion || !suggestedPromotion.productIds.length) {
      toast.error('No hay suficiente información para generar una promoción')
      return
    }
    const success = addPromotion({
      ...suggestedPromotion,
      productIds: suggestedPromotion.productIds,
    })
    if (success) {
      setPromotions(loadPromotions())
      toast.success('Promoción creada y lista en Productos & POS')
    } else {
      toast.error('La promoción ya fue creada')
    }
  }

  if (!accessGranted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <form onSubmit={handleAccessSubmit} className="w-full max-w-sm space-y-4">
          <input
            autoComplete="off"
            type="password"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {accessError && <p className="text-sm text-red-500">{accessError}</p>}
          <button type="submit" className="w-full px-4 py-2 rounded-full bg-blue-900 text-white text-sm font-semibold">
            Acceder
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Reports</p>
          <h1 className="text-3xl font-bold">Reportes estratégicos</h1>
          <p className="text-gray-500">Datos actualizados en tiempo real</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            <button onClick={() => handleModeChange('week')} className={`px-3 py-1 rounded-full text-sm font-semibold ${periodMode === 'week' ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600'}`}>Esta semana</button>
            <button onClick={() => handleModeChange('month')} className={`px-3 py-1 rounded-full text-sm font-semibold ${periodMode === 'month' ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600'}`}>Este mes</button>
            <button onClick={() => handleModeChange('custom')} className={`px-3 py-1 rounded-full text-sm font-semibold ${periodMode === 'custom' ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600'}`}>Mes específico</button>
          </div>
          {periodMode === 'custom' && (
            <div className="flex gap-2">
              <select value={customYear} onChange={(e) => setCustomYear(Number(e.target.value))} className="border border-gray-200 rounded-full px-3 py-1 text-sm">
                {[now.getFullYear(), now.getFullYear() - 1].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <select value={customMonth} onChange={(e) => setCustomMonth(Number(e.target.value))} className="border border-gray-200 rounded-full px-3 py-1 text-sm">
                {MONTHS.map((name, index) => (
                  <option key={name} value={index}>{name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {tips.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {tips.map((tip, idx) => (
            <div key={idx} className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 text-sm text-yellow-800">{tip}</div>
          ))}
        </div>
      )}
      {suggestedPromotion && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-blue-500">Consejo experto</p>
            <p className="text-lg font-semibold text-blue-900">{suggestedPromotion.name}</p>
            <p className="text-sm text-blue-700 mt-1">{suggestedPromotion.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedPromotion.productNames.map(name => (
              <span key={name} className="px-3 py-1 rounded-full border border-blue-200 bg-white text-xs font-semibold text-blue-600">{name}</span>
            ))}
          </div>
          <button onClick={handleCreatePromotion} className="self-start px-4 py-2 rounded-full bg-blue-900 text-white text-sm font-semibold">
            Crear promoción
          </button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-1">
          <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Ingresos Totales</p>
          <p className="text-xl font-semibold">{fmtMoney(totalRevenue)}</p>
          <p className="text-sm text-gray-500">{sales.length} ventas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-1">
          <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Ganancia Bruta</p>
          <p className="text-xl font-semibold text-blue-900">{fmtMoney(totalProfit)}</p>
          <p className="text-sm text-gray-500">Margen {totalRevenue ? `${Math.round(totalProfit / totalRevenue * 100)}%` : '0%'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-1">
          <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Gastos Totales</p>
          <p className="text-xl font-semibold text-red-600">{fmtMoney(totalExpenses)}</p>
          <p className="text-sm text-gray-500">{formatDateOnlyART(new Date())}</p>
        </div>
        <div className={`bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-1 ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
          <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Utilidad Neta</p>
          <p className="text-xl font-semibold">{fmtMoney(netProfit)}</p>
          <p className="text-sm">{netProfit >= 0 ? 'Positiva' : 'Negativa'}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 shadow-sm">
        <div className="text-sm text-gray-500">Comparativa</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
          <div className="p-4 rounded-2xl bg-blue-50">
            <p className="text-xs uppercase tracking-[0.4em] text-blue-500">Mes actual</p>
            <p className="text-2xl font-semibold text-blue-900">{fmtMoney(totalRevenue)}</p>
            <p className="text-sm text-blue-600">{revenueLabel}</p>
          </div>
          <div className="p-4 rounded-2xl bg-gray-50">
            <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Vs mes anterior</p>
            <p className="text-2xl font-semibold">{fmtMoney(prevRevenue)}</p>
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${revDelta >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {revDelta >= 0 ? '↑' : '↓'} {Math.abs(revDelta)}%
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-gray-50">
            <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Vs mismo mes año pasado</p>
            <p className="text-2xl font-semibold">{fmtMoney(sameLastYear)}</p>
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${yearDelta >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {yearDelta >= 0 ? '↑' : '↓'} {Math.abs(yearDelta)}%
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">Ventas y Ganancias</p>
            <span className="text-xs text-gray-400">Diario</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => fmtMoney(value)} />
                <Legend />
                <Bar dataKey="Ventas" fill="#2563EB" />
                <Bar dataKey="Ganancias" fill="#0F766E" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">Gastos por Categoría</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expPieChart} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {expPieChart.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
        <p className="text-sm text-gray-500">Proyección de cierre</p>
        <div className="flex items-center justify-between">
          <p className="text-xl font-semibold">Proyección de cierre: {fmtMoney(projected)}</p>
          <p className="text-sm text-gray-500">{daysElapsed} / {daysInMonth} días transcurridos</p>
        </div>
        <p className="text-sm text-gray-500">Promedio diario: {fmtMoney(dailyAvg)}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
          <p className="text-sm uppercase tracking-[0.4em] text-gray-400">Rotación</p>
          <div className="divide-y divide-gray-100">
            {rotacion.map(item => (
              <div key={item.product_name} className="py-3 flex justify-between text-sm">
                <div>
                  <p className="font-semibold">{item.product_name}</p>
                  <p className="text-gray-500 text-xs">Tickets: {item.ticketCount}</p>
                </div>
                <p className="text-sm text-gray-700">{item.totalUnits} uds</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
          <p className="text-sm uppercase tracking-[0.4em] text-gray-400">Canasta</p>
          <div className="divide-y divide-gray-100">
            {canasta.map(entry => (
              <div key={entry.pair} className="py-3 flex justify-between text-sm">
                <p>{entry.pair}</p>
                <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full">{entry.count} veces</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {criticalStock.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
          <p className="text-sm uppercase tracking-[0.4em] text-gray-400">Stock crítico</p>
          <div className="grid gap-3 md:grid-cols-3">
            {criticalStock.map(product => (
              <div key={product.id} className="border border-gray-200 rounded-2xl p-4 bg-red-50">
                <p className="font-semibold text-red-700">{product.name}</p>
                <p className="text-xs text-gray-500">Stock actual: {product.current_stock}</p>
                <p className="text-sm text-red-700">{product.daysLeft} días restantes</p>
                <p className="text-xs text-gray-500">Promedio diario: {product.dailySold} uds</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
