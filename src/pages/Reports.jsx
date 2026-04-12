import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, AreaChart, Area, Tooltip, ResponsiveContainer,
} from 'recharts'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, formatDateTimeART } from '@/components/argentina'
import { useReportsData } from '@/hooks/useReportsData'
import { addPromotion } from '@/lib/promotions'
import { useAuth } from '@/hooks/useAuth'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

// ── Animated Number ──────────────────────────────────────────────
function AnimatedNumber({ value, format = v => v }) {
  const [display, setDisplay] = useState(value)
  const ref = useRef(value)
  useEffect(() => {
    const from = ref.current
    const to = value
    if (from === to) return
    const steps = 24
    let i = 0
    const id = setInterval(() => {
      i++
      setDisplay(from + (to - from) * (i / steps))
      if (i >= steps) { clearInterval(id); ref.current = to }
    }, 16)
    return () => clearInterval(id)
  }, [value])
  return <span>{format(display)}</span>
}

// ── Apple Tooltip ─────────────────────────────────────────────────
function AppleTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white/90 backdrop-blur-xl border border-black/5 rounded-2xl shadow-lg px-3 py-2 text-xs">
      <p className="text-[#86868b] mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold text-[#1d1d1f]">{p.name}: {fmtMoney(p.value)}</p>
      ))}
    </div>
  )
}

// ── Segmented Control ────────────────────────────────────────────
function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="relative flex bg-black/5 rounded-[10px] p-0.5 gap-0.5">
      {options.map(opt => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="relative px-4 py-1.5 text-sm font-medium rounded-[8px] transition-colors z-10"
          >
            {isActive && (
              <motion.div
                layoutId="seg-bg"
                className="absolute inset-0 bg-white rounded-[8px] shadow-sm"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
            <span className={`relative z-10 transition-colors ${isActive ? 'text-[#1d1d1f]' : 'text-[#86868b]'}`}>
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Widget card ───────────────────────────────────────────────────
function Widget({ children, className = '' }) {
  return (
    <div className={`bg-white border border-black/5 rounded-2xl ${className}`}>
      {children}
    </div>
  )
}

export default function Reports() {
  const now = new Date()
  const { user, role, storeId } = useAuth()
  const isAdmin = role === 'admin'

  const [storeFilter, setStoreFilter] = useState('all')
  const [stores, setStores] = useState([])
  const [periodMode, setPeriodMode] = useState('month')
  const [customYear, setCustomYear] = useState(now.getFullYear())
  const [customMonth, setCustomMonth] = useState(now.getMonth())
  const [periodConfig, setPeriodConfig] = useState({
    type: 'month', year: now.getFullYear(), month: now.getMonth(),
  })
  const [insights, setInsights] = useState(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const insightsRef = useRef(null)

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('stores').select('id, name, type').eq('active', true)
      .then(({ data }) => { if (data) setStores(data) })
  }, [isAdmin])

  const activeStoreId = isAdmin
    ? (storeFilter === 'all' ? null : storeFilter)
    : storeId

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', activeStoreId],
    queryFn: async () => {
      let q = supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(2000)
      if (activeStoreId) q = q.eq('store_id', activeStoreId)
      const { data } = await q; return data || []
    },
    enabled: !!user,
  })
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', activeStoreId],
    queryFn: async () => {
      let q = supabase.from('expenses').select('*').order('date', { ascending: false }).limit(2000)
      if (activeStoreId) q = q.eq('store_id', activeStoreId)
      const { data } = await q; return data || []
    },
    enabled: !!user,
  })
  const { data: products = [] } = useQuery({
    queryKey: ['products', activeStoreId],
    queryFn: async () => {
      let q = supabase.from('products').select('*')
      if (activeStoreId) q = q.eq('store_id', activeStoreId)
      const { data } = await q; return data || []
    },
    enabled: !!user,
  })
  const { data: shiftLogs = [] } = useQuery({
    queryKey: ['shift_logs', activeStoreId],
    queryFn: async () => {
      let q = supabase.from('shift_logs').select('*').order('created_at', { ascending: false }).limit(300)
      if (activeStoreId) q = q.eq('store_id', activeStoreId)
      const { data } = await q; return data || []
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
    if (mode === 'week') setPeriodConfig({ type: 'week' })
    else if (mode === 'month') setPeriodConfig({ type: 'month', year: now.getFullYear(), month: now.getMonth() })
    else setPeriodConfig({ type: 'month', year: customYear, month: customMonth })
  }

  const {
    totalRevenue, prevRevenue, sameLastYear, totalExpenses, totalProfit,
    netProfit, projected, daysInMonth, daysElapsed, dailyChart,
    rotacion, criticalStock, cajeroStats, tips, dailyAvg,
  } = data

  const revDelta = prevRevenue === 0 ? 0 : Math.round((totalRevenue - prevRevenue) / prevRevenue * 100)
  const marginPct = totalRevenue ? Math.round(totalProfit / totalRevenue * 100) : 0
  const maxRotation = rotacion[0]?.totalUnits || 1

  // Anomalías
  const anomalies = useMemo(() => {
    const list = []
    if (totalRevenue > 0 && totalExpenses === 0)
      list.push({ icon: '◈', label: `Se detectaron ingresos en ${storeFilter === 'all' ? 'el período' : stores.find(s => s.id === storeFilter)?.name || 'el negocio'}, pero el registro de egresos está vacío. Esto afecta el cálculo de utilidad neta.`, title: 'Inconsistencia de datos' })
    if (totalRevenue > 0 && totalExpenses > totalRevenue * 0.8)
      list.push({ icon: '◆', label: `Los gastos representan el ${Math.round(totalExpenses / totalRevenue * 100)}% de los ingresos. El margen neto está bajo el umbral recomendado del 20%.`, title: 'Margen crítico' })
    return list
  }, [totalRevenue, totalExpenses, storeFilter, stores])

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
      const now2 = new Date()
      const d = new Date(now2)
      const day = d.getDay()
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
      d.setHours(0, 0, 0, 0)
      return { periodStart: d, periodEnd: now2 }
    })()
    return shiftLogs.filter(s => {
      const d = new Date(s.created_at)
      return d >= periodStart && d <= periodEnd
    })
  }, [shiftLogs, periodConfig])

  const topRotation = rotacion[0]
  const criticalProduct = criticalStock[0]
  const suggestedPromotion = useMemo(() => {
    if (!topRotation || !criticalProduct) return null
    return {
      name: `Combo: ${topRotation.product_name} + ${criticalProduct.name}`,
      description: `${topRotation.product_name} lidera ventas. ${criticalProduct.name} está crítico en stock.`,
      productIds: [topRotation.product_id, criticalProduct.id].filter(Boolean),
      productNames: [topRotation.product_name, criticalProduct.name],
    }
  }, [topRotation, criticalProduct])

  const handleGenerateInsights = async () => {
    const apiKey = import.meta.env.VITE_GOOGLE_AI_STUDIO_API_KEY
    if (!apiKey) { toast.error('Configurá VITE_GOOGLE_AI_STUDIO_API_KEY en Vercel'); return }
    setLoadingInsights(true)
    setInsights(null)
    try {
      const periodLabel = periodMode === 'week' ? 'esta semana' : `${MONTHS[customMonth]} ${customYear}`
      const fullPrompt = `Sos un contador experto en comercios minoristas de Argentina. Todos los valores están en pesos argentinos (ARS).\n\nDatos del período "${periodLabel}":\n- Ingresos: ARS ${Math.round(totalRevenue)} (${revDelta >= 0 ? '+' : ''}${revDelta}% vs período anterior)\n- Ganancia bruta: ARS ${Math.round(totalProfit)} (margen ${marginPct}%)\n- Gastos: ARS ${Math.round(totalExpenses)}\n- Utilidad neta: ARS ${Math.round(netProfit)}\n- Proyección mensual: ARS ${Math.round(projected)} (día ${daysElapsed}/${daysInMonth})\n- Top vendidos: ${rotacion.slice(0, 3).map(p => `${p.product_name} (${p.totalUnits} uds)`).join(', ') || 'sin datos'}\n- Cajeros: ${cajeroStats.map(c => `${c.name}: ${c.count} ventas`).join(', ') || 'sin datos'}\n\nRespondé ÚNICAMENTE con un JSON sin markdown:\n{"resumen":"2 oraciones directas sobre el período","accion":"1 acción concreta y específica a tomar esta semana"}`

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
          }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`)
      const parts = json.candidates?.[0]?.content?.parts || []
      const text = parts.map(p => p.text || '').join('')
      const stripped = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '')
      const start = stripped.indexOf('{')
      const end = stripped.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error(`Respuesta inesperada: ${text.slice(0, 150)}`)
      setInsights(JSON.parse(stripped.slice(start, end + 1)))
      setTimeout(() => insightsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (err) {
      console.error(err)
      toast.error(`Error IA: ${err.message}`)
    } finally {
      setLoadingInsights(false)
    }
  }

  const handleCreatePromotion = () => {
    if (!suggestedPromotion?.productIds?.length) { toast.error('Sin datos suficientes'); return }
    if (addPromotion(suggestedPromotion)) toast.success('Promoción creada')
    else toast.error('Ya existe')
  }

  // Store selector options for admin
  const storeOptions = [
    { value: 'all', label: 'Global' },
    ...stores.map(s => ({ value: s.id, label: s.name })),
  ]

  const PERIOD_OPTIONS = [
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
    { value: 'custom', label: 'Personalizado' },
  ]

  return (
    <div className="space-y-4 pb-12">

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between pt-2">
        <div>
          <p className="text-xs text-[#86868b] uppercase tracking-[0.2em]">Reportes</p>
          <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Inteligencia de negocio</h1>
        </div>
        <div className="flex flex-col gap-2 items-start md:items-end">
          {isAdmin && stores.length > 0 && (
            <SegmentedControl options={storeOptions} value={storeFilter} onChange={setStoreFilter} />
          )}
          <SegmentedControl options={PERIOD_OPTIONS} value={periodMode} onChange={handleModeChange} />
          {periodMode === 'custom' && (
            <div className="flex gap-2">
              <select value={customYear} onChange={e => setCustomYear(Number(e.target.value))}
                className="bg-white border border-black/10 rounded-xl px-3 py-1.5 text-sm text-[#1d1d1f] focus:outline-none">
                {[now.getFullYear(), now.getFullYear() - 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select value={customMonth} onChange={e => setCustomMonth(Number(e.target.value))}
                className="bg-white border border-black/10 rounded-xl px-3 py-1.5 text-sm text-[#1d1d1f] focus:outline-none">
                {MONTHS.map((name, i) => <option key={name} value={i}>{name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── AVISOS DEL SISTEMA ──────────────────────────────────── */}
      <AnimatePresence>
        {anomalies.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Widget className="p-5 space-y-3">
              <p className="text-xs font-semibold text-[#86868b] uppercase tracking-[0.2em]">Avisos del sistema</p>
              {anomalies.map((a, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="mt-0.5 w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0 text-amber-500 text-sm">{a.icon}</div>
                  <div>
                    <p className="text-sm font-semibold text-[#1d1d1f]">{a.title}</p>
                    <p className="text-sm text-[#86868b] leading-relaxed">{a.label}</p>
                  </div>
                </div>
              ))}
            </Widget>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MÉTRICAS CLAVE ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Widget className="p-5">
          <p className="text-xs text-[#86868b] font-medium mb-3">Ingresos netos</p>
          <p className="text-3xl font-semibold text-[#1d1d1f] tracking-tight">
            <AnimatedNumber value={totalRevenue} format={v => fmtMoney(Math.round(v))} />
          </p>
          <p className="text-xs text-[#86868b] mt-1">{sales.length} ventas</p>
          {prevRevenue > 0 && (
            <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${revDelta >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
              {revDelta >= 0 ? '↑' : '↓'} {Math.abs(revDelta)}% vs mes anterior
            </span>
          )}
        </Widget>
        <Widget className="p-5">
          <p className="text-xs text-[#86868b] font-medium mb-3">Gastos del período</p>
          <p className="text-3xl font-semibold text-[#1d1d1f] tracking-tight">
            <AnimatedNumber value={totalExpenses} format={v => fmtMoney(Math.round(v))} />
          </p>
          <p className="text-xs text-[#86868b] mt-1">{expenses.length} registros</p>
        </Widget>
        <Widget className="p-5">
          <p className="text-xs text-[#86868b] font-medium mb-3">Margen de rentabilidad</p>
          <p className={`text-3xl font-semibold tracking-tight ${marginPct >= 20 ? 'text-[#34c759]' : marginPct >= 10 ? 'text-amber-500' : 'text-[#ff3b30]'}`}>
            <AnimatedNumber value={marginPct} format={v => `${Math.round(v)}%`} />
          </p>
          <p className="text-xs text-[#86868b] mt-1">Ganancia: {fmtMoney(totalProfit)}</p>
        </Widget>
      </div>

      {/* ── GRÁFICO ESTILO APPLE STOCKS ─────────────────────────── */}
      <Widget className="p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-[#86868b] font-medium uppercase tracking-[0.2em]">Evolución de ventas</p>
          <p className="text-xs text-[#86868b]">Promedio: {fmtMoney(dailyAvg)}/día</p>
        </div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyChart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="appleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#007AFF" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#007AFF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip content={<AppleTooltip />} />
              <Area type="monotone" dataKey="Ventas" stroke="#007AFF" strokeWidth={1.5} fill="url(#appleGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Proyección */}
        <div className="mt-3 pt-3 border-t border-black/5 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#86868b]">Proyección de cierre</p>
            <p className="text-base font-semibold text-[#1d1d1f]">{fmtMoney(projected)}</p>
          </div>
          <div className="flex-1 mx-6">
            <div className="flex justify-between text-xs text-[#86868b] mb-1">
              <span>Día {daysElapsed}</span>
              <span>{daysInMonth}</span>
            </div>
            <div className="h-1 bg-black/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-[#007AFF]"
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(daysElapsed / daysInMonth * 100)}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#86868b]">Utilidad neta</p>
            <p className={`text-base font-semibold ${netProfit >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>{fmtMoney(netProfit)}</p>
          </div>
        </div>
      </Widget>

      {/* ── TOP ROTACIÓN ────────────────────────────────────────── */}
      {rotacion.length > 0 && (
        <Widget className="p-5">
          <p className="text-xs text-[#86868b] font-medium uppercase tracking-[0.2em] mb-4">Rotación de productos</p>
          <div className="space-y-4">
            {rotacion.slice(0, 8).map((item, i) => (
              <div key={item.product_name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#86868b] w-4">{i + 1}</span>
                    <p className="text-sm font-medium text-[#1d1d1f]">{item.product_name}</p>
                  </div>
                  <p className="text-sm text-[#86868b]">{item.totalUnits} uds</p>
                </div>
                <div className="h-[2px] bg-black/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[#007AFF]"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(item.totalUnits / maxRotation * 100)}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Widget>
      )}

      {/* ── CAJEROS ─────────────────────────────────────────────── */}
      {cajeroStats.length > 0 && (
        <Widget className="p-5">
          <p className="text-xs text-[#86868b] font-medium uppercase tracking-[0.2em] mb-4">Rendimiento por cajero</p>
          <div className="divide-y divide-black/5">
            {cajeroStats.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${i === 0 ? 'bg-[#007AFF] text-white' : 'bg-black/5 text-[#86868b]'}`}>{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-[#1d1d1f]">{c.name}</p>
                    <p className="text-xs text-[#86868b]">{c.count} ventas</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#1d1d1f]">{fmtMoney(c.total)}</p>
                  <p className="text-xs text-[#86868b]">{fmtMoney(c.profit)} ganancia</p>
                </div>
              </div>
            ))}
          </div>
        </Widget>
      )}

      {/* ── STOCK CRÍTICO ───────────────────────────────────────── */}
      {criticalStock.length > 0 && (
        <Widget className="p-5">
          <p className="text-xs text-[#86868b] font-medium uppercase tracking-[0.2em] mb-4">Stock crítico</p>
          <div className="grid gap-2 md:grid-cols-3">
            {criticalStock.map(p => (
              <div key={p.id} className="bg-[#fff2f2] border border-[#ff3b30]/10 rounded-xl p-3">
                <p className="text-sm font-medium text-[#1d1d1f]">{p.name}</p>
                <p className="text-xs text-[#ff3b30] font-semibold mt-0.5">{p.daysLeft} días restantes</p>
                <p className="text-xs text-[#86868b]">Stock: {p.current_stock} · {p.dailySold} uds/día</p>
              </div>
            ))}
          </div>
        </Widget>
      )}

      {/* ── PROMOCIÓN SUGERIDA ──────────────────────────────────── */}
      {suggestedPromotion && (
        <Widget className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs text-[#86868b] font-medium uppercase tracking-[0.2em] mb-1">Sugerencia inteligente</p>
            <p className="text-sm font-semibold text-[#1d1d1f]">{suggestedPromotion.name}</p>
            <p className="text-sm text-[#86868b]">{suggestedPromotion.description}</p>
          </div>
          <button onClick={handleCreatePromotion}
            className="shrink-0 px-4 py-2 rounded-full bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0071e3] transition-colors">
            Crear promoción
          </button>
        </Widget>
      )}

      {/* ── TURNOS ──────────────────────────────────────────────── */}
      {shiftsInPeriod.length > 0 && (
        <Widget className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-[#86868b] font-medium uppercase tracking-[0.2em]">Historial de turnos</p>
            <span className="text-xs text-[#86868b]">{shiftsInPeriod.length} turno{shiftsInPeriod.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[#86868b] border-b border-black/5">
                  <th className="pb-2 text-left font-medium">Cajero</th>
                  <th className="pb-2 text-left font-medium">Inicio</th>
                  <th className="pb-2 text-left font-medium">Fin</th>
                  <th className="pb-2 text-right font-medium">Ventas</th>
                  <th className="pb-2 text-right font-medium">Recaudado</th>
                  <th className="pb-2 text-right font-medium">Efectivo</th>
                  <th className="pb-2 text-right font-medium">Digital</th>
                  <th className="pb-2 text-right font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {shiftsInPeriod.map(shift => {
                  const durMin = shift.fin && shift.inicio
                    ? Math.round((new Date(shift.fin) - new Date(shift.inicio)) / 60000) : null
                  const durLabel = durMin !== null
                    ? durMin >= 60 ? `${Math.floor(durMin / 60)}h ${durMin % 60}m` : `${durMin}m` : '—'
                  return (
                    <tr key={shift.id}>
                      <td className="py-2.5 font-medium text-[#1d1d1f]">
                        {shift.cajero}
                        <span className="ml-1.5 text-xs text-[#86868b] font-normal">{durLabel}</span>
                      </td>
                      <td className="py-2.5 text-xs text-[#86868b]">{formatDateTimeART(shift.inicio)}</td>
                      <td className="py-2.5 text-xs text-[#86868b]">{formatDateTimeART(shift.fin)}</td>
                      <td className="py-2.5 text-right text-[#1d1d1f]">{shift.total_ventas}</td>
                      <td className="py-2.5 text-right font-semibold text-[#1d1d1f]">{fmtMoney(shift.total_recaudado)}</td>
                      <td className="py-2.5 text-right text-[#34c759]">{fmtMoney(shift.total_efectivo)}</td>
                      <td className="py-2.5 text-right text-[#007AFF]">{fmtMoney(shift.total_digital)}</td>
                      <td className={`py-2.5 text-right font-semibold ${shift.diferencia >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                        {shift.diferencia >= 0 ? '+' : ''}{fmtMoney(shift.diferencia)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Widget>
      )}

      {/* ── ANÁLISIS IA ─────────────────────────────────────────── */}
      <div ref={insightsRef}>
        <Widget className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-[#86868b] font-medium uppercase tracking-[0.2em]">Análisis inteligente</p>
              <p className="text-xs text-[#86868b] mt-0.5">Generado con Gemini · Google AI</p>
            </div>
            <button
              onClick={handleGenerateInsights}
              disabled={loadingInsights}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0071e3] transition-colors disabled:opacity-50"
            >
              {loadingInsights ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Analizando…
                </>
              ) : 'Analizar período'}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {!insights && !loadingInsights && (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="bg-black/3 rounded-xl p-5 text-center">
                <p className="text-sm text-[#86868b]">Seleccioná el período y tocá "Analizar" para obtener un resumen ejecutivo con recomendaciones.</p>
              </motion.div>
            )}
            {loadingInsights && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="bg-black/3 rounded-xl p-8 text-center">
                <p className="text-sm text-[#86868b]">Procesando datos del período…</p>
              </motion.div>
            )}
            {insights && (
              <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="bg-[#f0f7ff] border border-[#007AFF]/10 rounded-xl p-4">
                  <p className="text-xs text-[#007AFF] font-medium mb-1">Resumen ejecutivo</p>
                  <p className="text-sm text-[#1d1d1f] leading-relaxed">{insights.resumen}</p>
                </div>
                {insights.accion && (
                  <div className="bg-[#f0fff4] border border-[#34c759]/15 rounded-xl p-4">
                    <p className="text-xs text-[#34c759] font-medium mb-1">Acción recomendada</p>
                    <p className="text-sm text-[#1d1d1f] leading-relaxed">{insights.accion}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </Widget>
      </div>

    </div>
  )
}
