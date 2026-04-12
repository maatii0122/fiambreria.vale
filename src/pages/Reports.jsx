import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer, Legend
} from 'recharts'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, formatDateOnlyART, formatDateTimeART } from '@/components/argentina'
import { useReportsData } from '@/hooks/useReportsData'
import { addPromotion } from '@/lib/promotions'
import { useAuth } from '@/hooks/useAuth'

const PIE_COLORS = ['#1E3A8A','#2563EB','#3B82F6','#60A5FA','#93C5FD','#BFDBFE','#DBEAFE','#1D4ED8','#1E40AF','#1E3A8A']

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

export default function Reports() {
  const now = new Date()
  const { user } = useAuth()

  const [periodMode, setPeriodMode] = useState('month')
  const [customYear, setCustomYear] = useState(now.getFullYear())
  const [customMonth, setCustomMonth] = useState(now.getMonth())
  const [periodConfig, setPeriodConfig] = useState({
    type: 'month',
    year: now.getFullYear(),
    month: now.getMonth(),
  })
  const [insights, setInsights] = useState(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const insightsRef = useRef(null)

  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(2000)
      return data || []
    },
    enabled: !!user,
  })
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*').order('date', { ascending: false }).limit(2000)
      return data || []
    },
    enabled: !!user,
  })
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*')
      return data || []
    },
    enabled: !!user,
  })
  const { data: shiftLogs = [] } = useQuery({
    queryKey: ['shift_logs'],
    queryFn: async () => {
      const { data } = await supabase.from('shift_logs').select('*').order('created_at', { ascending: false }).limit(300)
      return data || []
    },
    enabled: !!user,
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

  const {
    totalRevenue, prevRevenue, sameLastYear, totalExpenses, totalProfit,
    netProfit, projected, daysInMonth, daysElapsed, dailyChart,
    expPieChart, rotacion, canasta, criticalStock, cajeroStats, tips, dailyAvg,
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

  // Filter shift logs to current period
  const shiftsInPeriod = useMemo(() => {
    if (!shiftLogs.length) return []
    const { periodStart, periodEnd } = (() => {
      if (periodConfig.type === 'month') {
        const y = periodConfig.year, m = periodConfig.month
        return {
          periodStart: new Date(Date.UTC(y, m, 1, 3, 0, 0)),
          periodEnd: new Date(Date.UTC(y, m + 1, 0, 26, 59, 59)),
        }
      }
      const weekMs = 7 * 24 * 60 * 60 * 1000
      const now2 = new Date()
      const d = new Date(now2)
      const day = d.getDay()
      const diff = day === 0 ? 6 : day - 1
      d.setDate(d.getDate() - diff)
      d.setHours(0, 0, 0, 0)
      return { periodStart: d, periodEnd: now2 }
    })()
    return shiftLogs.filter(s => {
      const d = new Date(s.created_at)
      return d >= periodStart && d <= periodEnd
    })
  }, [shiftLogs, periodConfig])

  const handleGenerateInsights = async () => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) {
      toast.error('Configurá VITE_ANTHROPIC_API_KEY en Vercel para usar análisis IA')
      return
    }
    setLoadingInsights(true)
    setInsights(null)
    try {
      const periodLabel = periodMode === 'week' ? 'esta semana' : `${MONTHS[customMonth]} ${customYear}`
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 900,
          messages: [{
            role: 'user',
            content: `Sos un contador y asesor de negocios experto en comercios minoristas de Argentina (fiambrerías y kioscos).
Analizá estos datos del período "${periodLabel}":
- Ingresos: $${Math.round(totalRevenue)} (${revDelta >= 0 ? '+' : ''}${revDelta}% vs período anterior, ${yearDelta >= 0 ? '+' : ''}${yearDelta}% vs mismo mes año pasado)
- Ganancia bruta: $${Math.round(totalProfit)} (margen ${totalRevenue ? Math.round(totalProfit / totalRevenue * 100) : 0}%)
- Gastos: $${Math.round(totalExpenses)}
- Utilidad neta: $${Math.round(netProfit)}
- Proyección de cierre mensual: $${Math.round(projected)} (día ${daysElapsed} de ${daysInMonth})
- Promedio diario de ventas: $${Math.round(dailyAvg)}
- Productos críticos de stock (<14 días): ${criticalStock.slice(0, 5).map(p => p.name).join(', ') || 'ninguno'}
- Top 5 más vendidos: ${rotacion.slice(0, 5).map(p => `${p.product_name} (${p.totalUnits} uds)`).join(', ') || 'sin datos'}
- Rendimiento por cajero: ${cajeroStats.map(c => `${c.name}: ${c.count} ventas, $${Math.round(c.total)}`).join(' | ') || 'sin datos'}
- Turnos registrados: ${shiftsInPeriod.length}

Respondé ÚNICAMENTE con un JSON válido, sin texto extra, con esta estructura exacta:
{
  "prediccion": "2-3 oraciones sobre cómo cerrará el mes y qué esperar",
  "alertas": ["alerta concreta 1", "alerta concreta 2"],
  "recomendaciones": ["acción concreta 1", "acción concreta 2", "acción concreta 3"],
  "oportunidad": "la mayor oportunidad de crecimiento en 1-2 oraciones"
}`,
          }],
        }),
      })
      const json = await res.json()
      const text = json.content?.[0]?.text || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Respuesta inválida')
      const parsed = JSON.parse(match[0])
      setInsights(parsed)
      setTimeout(() => insightsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch {
      toast.error('Error generando análisis. Verificá la API key.')
    } finally {
      setLoadingInsights(false)
    }
  }

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
      toast.success('Promoción creada y lista en Productos & POS')
    } else {
      toast.error('La promoción ya fue creada')
    }
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
            <button onClick={() => handleModeChange('week')} className={`px-3 py-1 rounded-full text-sm font-semibold ${periodMode === 'week' ? 'bg-zinc-900 text-white' : 'bg-gray-100 text-gray-600'}`}>Esta semana</button>
            <button onClick={() => handleModeChange('month')} className={`px-3 py-1 rounded-full text-sm font-semibold ${periodMode === 'month' ? 'bg-zinc-900 text-white' : 'bg-gray-100 text-gray-600'}`}>Este mes</button>
            <button onClick={() => handleModeChange('custom')} className={`px-3 py-1 rounded-full text-sm font-semibold ${periodMode === 'custom' ? 'bg-zinc-900 text-white' : 'bg-gray-100 text-gray-600'}`}>Mes específico</button>
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
        <div className="bg-zinc-50 border border-blue-100 rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-blue-500">Consejo experto</p>
            <p className="text-lg font-semibold text-zinc-900">{suggestedPromotion.name}</p>
            <p className="text-sm text-blue-700 mt-1">{suggestedPromotion.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedPromotion.productNames.map(name => (
              <span key={name} className="px-3 py-1 rounded-full border border-blue-200 bg-white text-xs font-semibold text-blue-600">{name}</span>
            ))}
          </div>
          <button onClick={handleCreatePromotion} className="self-start px-4 py-2 rounded-full bg-zinc-900 text-white text-sm font-semibold">
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
          <p className="text-xl font-semibold text-zinc-900">{fmtMoney(totalProfit)}</p>
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
          <div className="p-4 rounded-2xl bg-zinc-50">
            <p className="text-xs uppercase tracking-[0.4em] text-blue-500">Mes actual</p>
            <p className="text-2xl font-semibold text-zinc-900">{fmtMoney(totalRevenue)}</p>
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
                <span className="text-xs px-2 py-1 bg-zinc-50 text-blue-700 rounded-full">{entry.count} veces</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {cajeroStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
          <p className="text-sm uppercase tracking-[0.4em] text-gray-400">Ventas por cajero</p>
          <div className="divide-y divide-gray-100">
            {cajeroStats.map((cajero, i) => (
              <div key={cajero.name} className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-zinc-900 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-gray-900">{cajero.name}</p>
                    <p className="text-xs text-gray-500">{cajero.count} {cajero.count === 1 ? 'venta' : 'ventas'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{fmtMoney(cajero.total)}</p>
                  <p className="text-xs text-gray-500">Ganancia: {fmtMoney(cajero.profit)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* ── HISTORIAL DE TURNOS ─────────────────────────────────────── */}
      {shiftsInPeriod.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-[0.4em] text-gray-400">Historial de Turnos</p>
            <span className="text-xs text-gray-400">{shiftsInPeriod.length} turno{shiftsInPeriod.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.08em] text-zinc-400 border-b border-zinc-100">
                  <th className="pb-3 text-left font-medium">Cajero</th>
                  <th className="pb-3 text-left font-medium">Inicio</th>
                  <th className="pb-3 text-left font-medium">Fin</th>
                  <th className="pb-3 text-right font-medium">Ventas</th>
                  <th className="pb-3 text-right font-medium">Recaudado</th>
                  <th className="pb-3 text-right font-medium">Efectivo</th>
                  <th className="pb-3 text-right font-medium">Digital</th>
                  <th className="pb-3 text-right font-medium">Monto Inicial</th>
                  <th className="pb-3 text-right font-medium">Esperado</th>
                  <th className="pb-3 text-right font-medium">Real</th>
                  <th className="pb-3 text-right font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {shiftsInPeriod.map(shift => {
                  const durMin = shift.fin && shift.inicio
                    ? Math.round((new Date(shift.fin) - new Date(shift.inicio)) / 60000)
                    : null
                  const durLabel = durMin !== null
                    ? durMin >= 60 ? `${Math.floor(durMin / 60)}h ${durMin % 60}m` : `${durMin}m`
                    : '—'
                  return (
                    <tr key={shift.id}>
                      <td className="py-3 font-semibold text-zinc-900">
                        {shift.cajero}
                        <span className="ml-2 text-xs text-zinc-400 font-normal">{durLabel}</span>
                      </td>
                      <td className="py-3 text-zinc-500 text-xs">{formatDateTimeART(shift.inicio)}</td>
                      <td className="py-3 text-zinc-500 text-xs">{formatDateTimeART(shift.fin)}</td>
                      <td className="py-3 text-right">{shift.total_ventas}</td>
                      <td className="py-3 text-right font-semibold">{fmtMoney(shift.total_recaudado)}</td>
                      <td className="py-3 text-right text-emerald-600">{fmtMoney(shift.total_efectivo)}</td>
                      <td className="py-3 text-right text-blue-600">{fmtMoney(shift.total_digital)}</td>
                      <td className="py-3 text-right text-zinc-500">{fmtMoney(shift.monto_inicial)}</td>
                      <td className="py-3 text-right text-zinc-500">{fmtMoney(shift.monto_esperado)}</td>
                      <td className="py-3 text-right text-zinc-500">{fmtMoney(shift.monto_real)}</td>
                      <td className={`py-3 text-right font-semibold ${shift.diferencia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {shift.diferencia >= 0 ? '+' : ''}{fmtMoney(shift.diferencia)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-zinc-200">
                <tr className="text-sm font-semibold">
                  <td className="pt-3 text-zinc-500" colSpan={3}>Totales del período</td>
                  <td className="pt-3 text-right">{shiftsInPeriod.reduce((s, x) => s + (x.total_ventas || 0), 0)}</td>
                  <td className="pt-3 text-right">{fmtMoney(shiftsInPeriod.reduce((s, x) => s + (x.total_recaudado || 0), 0))}</td>
                  <td className="pt-3 text-right text-emerald-600">{fmtMoney(shiftsInPeriod.reduce((s, x) => s + (x.total_efectivo || 0), 0))}</td>
                  <td className="pt-3 text-right text-blue-600">{fmtMoney(shiftsInPeriod.reduce((s, x) => s + (x.total_digital || 0), 0))}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── ANÁLISIS IA ─────────────────────────────────────────────── */}
      <div ref={insightsRef} className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-gray-400">Análisis Inteligente</p>
            <p className="text-xs text-gray-400 mt-1">Predicciones y asesoramiento contable generados por IA</p>
          </div>
          <button
            onClick={handleGenerateInsights}
            disabled={loadingInsights}
            className="px-4 py-2 bg-zinc-900 text-white rounded-full text-sm font-semibold disabled:opacity-50 flex items-center gap-2 transition-colors hover:bg-zinc-700"
          >
            {loadingInsights ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Analizando…
              </>
            ) : '✦ Generar análisis'}
          </button>
        </div>

        {!insights && !loadingInsights && (
          <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-5 text-center">
            <p className="text-sm text-zinc-400">Hacé clic en "Generar análisis" para obtener predicciones y recomendaciones personalizadas basadas en los datos del período seleccionado.</p>
          </div>
        )}

        {loadingInsights && (
          <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-zinc-600">Procesando datos del período…</p>
            <p className="text-xs text-zinc-400">Esto tarda unos segundos</p>
          </div>
        )}

        {insights && (
          <div className="space-y-4">
            {/* Predicción */}
            <div className="rounded-2xl bg-blue-50 border border-blue-100 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-blue-500 mb-2">Predicción</p>
              <p className="text-sm text-blue-900 leading-relaxed">{insights.prediccion}</p>
            </div>

            {/* Alertas */}
            {insights.alertas?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.3em] text-red-500">Alertas</p>
                {insights.alertas.map((alerta, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
                    <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
                    <p className="text-sm text-red-800">{alerta}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Recomendaciones */}
            {insights.recomendaciones?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Recomendaciones</p>
                {insights.recomendaciones.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3">
                    <span className="w-5 h-5 rounded-full bg-zinc-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-sm text-zinc-700">{rec}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Oportunidad */}
            {insights.oportunidad && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-600 mb-2">Mayor oportunidad</p>
                <p className="text-sm text-emerald-900 leading-relaxed">{insights.oportunidad}</p>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
