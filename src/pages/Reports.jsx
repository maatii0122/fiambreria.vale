import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, Tooltip, PieChart, Pie, Cell, ResponsiveContainer,
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

const PIE_COLORS = [
  '#06b6d4','#8b5cf6','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#84cc16',
]

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800/90 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2 text-xs">
      <p className="text-zinc-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {fmtMoney(p.value)}</p>
      ))}
    </div>
  )
}

function StatCard({ label, value, sub, accent, glow }) {
  const glowColor = glow || 'rgba(6,182,212,0.15)'
  return (
    <div
      className="bg-white/5 border border-white/8 backdrop-blur-sm rounded-3xl p-5 space-y-1"
      style={{ boxShadow: `0 0 30px ${glowColor}` }}
    >
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold ${accent || 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

function AnomalyBanner({ icon, label, type = 'warn' }) {
  const styles = {
    warn: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    crit: 'bg-red-500/10 border-red-500/30 text-red-300',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 border rounded-2xl px-4 py-3 text-sm font-medium ${styles[type]}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </motion.div>
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
  const marginPct = totalRevenue ? Math.round(totalProfit / totalRevenue * 100) : 0

  // Anomaly detection
  const anomalies = useMemo(() => {
    const list = []
    if (totalRevenue > 0 && totalExpenses === 0)
      list.push({ icon: '◈', label: 'Rareza Detectada: No hay gastos cargados en este período', type: 'warn' })
    if (totalRevenue > 0 && totalExpenses > totalRevenue * 0.8)
      list.push({ icon: '⬟', label: `Margen Crítico: Los gastos representan el ${Math.round(totalExpenses / totalRevenue * 100)}% de los ingresos`, type: 'crit' })
    if (criticalStock.length >= 5)
      list.push({ icon: '◆', label: `Stock Crítico: ${criticalStock.length} productos con menos de 14 días de existencia`, type: 'crit' })
    return list
  }, [totalRevenue, totalExpenses, criticalStock])

  const topRotation = rotacion[0]
  const criticalProduct = criticalStock[0]
  const suggestedPromotion = useMemo(() => {
    if (!topRotation || !criticalProduct) return null
    return {
      name: `Combo inteligente: ${topRotation.product_name} + ${criticalProduct.name}`,
      description: `${topRotation.product_name} es el más vendido. ${criticalProduct.name} está crítico en stock — combinados generan visibilidad y rotación.`,
      productIds: [topRotation.product_id, criticalProduct.id].filter(Boolean),
      productNames: [topRotation.product_name, criticalProduct.name],
    }
  }, [topRotation, criticalProduct])

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

  const activeStoreColor = useMemo(() => {
    if (!storeFilter || storeFilter === 'all') return 'cyan'
    const store = stores.find(s => s.id === storeFilter)
    return store?.type === 'kiosco' ? 'cyan' : 'amber'
  }, [storeFilter, stores])

  const handleGenerateInsights = async () => {
    const apiKey = import.meta.env.VITE_GOOGLE_AI_STUDIO_API_KEY
    if (!apiKey) {
      toast.error('Configurá VITE_GOOGLE_AI_STUDIO_API_KEY en Vercel')
      return
    }
    setLoadingInsights(true)
    setInsights(null)
    try {
      const periodLabel = periodMode === 'week' ? 'esta semana' : `${MONTHS[customMonth]} ${customYear}`
      const fullPrompt = `Sos un contador experto en comercios minoristas de Argentina (fiambrerías y kioscos). Todos los valores son en pesos argentinos (ARS).\n\nAnalizá estos datos del período "${periodLabel}":\n- Ingresos: ARS ${Math.round(totalRevenue)} (${revDelta >= 0 ? '+' : ''}${revDelta}% vs período anterior, ${yearDelta >= 0 ? '+' : ''}${yearDelta}% vs mismo mes año pasado)\n- Ganancia bruta: ARS ${Math.round(totalProfit)} (margen ${marginPct}%)\n- Gastos: ARS ${Math.round(totalExpenses)}\n- Utilidad neta: ARS ${Math.round(netProfit)}\n- Proyección de cierre mensual: ARS ${Math.round(projected)} (día ${daysElapsed} de ${daysInMonth})\n- Promedio diario: ARS ${Math.round(dailyAvg)}\n- Stock crítico (<14 días): ${criticalStock.slice(0, 5).map(p => p.name).join(', ') || 'ninguno'}\n- Top 5 vendidos: ${rotacion.slice(0, 5).map(p => `${p.product_name} (${p.totalUnits} uds)`).join(', ') || 'sin datos'}\n- Cajeros: ${cajeroStats.map(c => `${c.name}: ${c.count} ventas ARS ${Math.round(c.total)}`).join(' | ') || 'sin datos'}\n\nRespondé ÚNICAMENTE con este JSON (sin texto extra, sin markdown):\n{"prediccion":"...","alertas":["..."],"recomendaciones":["..."],"oportunidad":"..."}`
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
          thinkingConfig: { include_thoughts: false },
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
    if (!suggestedPromotion?.productIds?.length) {
      toast.error('No hay suficiente información para generar una promoción')
      return
    }
    if (addPromotion(suggestedPromotion)) {
      toast.success('Promoción creada y lista en Productos & POS')
    } else {
      toast.error('La promoción ya fue creada')
    }
  }

  // Derived accent classes
  const accentText = activeStoreColor === 'cyan' ? 'text-cyan-400' : 'text-amber-400'
  const accentBorder = activeStoreColor === 'cyan' ? 'border-cyan-500/30' : 'border-amber-500/30'
  const accentBg = activeStoreColor === 'cyan' ? 'bg-cyan-500/10' : 'bg-amber-500/10'
  const accentGlow = activeStoreColor === 'cyan' ? 'rgba(6,182,212,0.15)' : 'rgba(245,158,11,0.15)'
  const chartColor = activeStoreColor === 'cyan' ? '#06b6d4' : '#f59e0b'

  const PERIOD_MODES = [
    { key: 'week', label: 'Esta semana' },
    { key: 'month', label: 'Este mes' },
    { key: 'custom', label: 'Mes específico' },
  ]

  return (
    <div className="-mx-4 -my-6 min-h-screen bg-slate-950 px-6 pt-10 pb-20">

      {/* ── HEADER ───────────────────────────────────────────────── */}
      <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-zinc-600 mb-1">Sistema de Reportes</p>
          <h1 className="text-3xl font-bold text-white">Inteligencia de Negocio</h1>
          <p className="text-sm text-zinc-500 mt-1">Datos en tiempo real · Análisis predictivo</p>
        </div>

        <div className="flex flex-col gap-3 items-start md:items-end">
          {/* Store Selector */}
          {isAdmin && stores.length > 0 && (
            <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-1 gap-0.5">
              {[{ id: 'all', name: 'Ambas', type: null }, ...stores].map((s) => {
                const isActive = storeFilter === s.id
                const color = s.type === 'kiosco' ? 'cyan' : s.type === 'fiambreria' ? 'amber' : 'neutral'
                const activeCls = color === 'cyan' ? 'text-cyan-300' : color === 'amber' ? 'text-amber-300' : 'text-white'
                const pillCls = color === 'cyan'
                  ? 'bg-cyan-500/20 border border-cyan-500/40'
                  : color === 'amber'
                  ? 'bg-amber-500/20 border border-amber-500/40'
                  : 'bg-white/10 border border-white/20'
                return (
                  <button
                    key={s.id}
                    onClick={() => setStoreFilter(s.id)}
                    className="relative px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="store-pill"
                        className={`absolute inset-0 rounded-full ${pillCls}`}
                        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                      />
                    )}
                    <span className={`relative z-10 ${isActive ? activeCls : 'text-zinc-500'}`}>
                      {s.name}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Period Selector */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-1 gap-0.5">
            {PERIOD_MODES.map(({ key, label }) => {
              const isActive = periodMode === key
              return (
                <button
                  key={key}
                  onClick={() => handleModeChange(key)}
                  className="relative px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                >
                  {isActive && (
                    <motion.div
                      layoutId="period-pill"
                      className="absolute inset-0 rounded-full bg-white/10 border border-white/20"
                      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                    />
                  )}
                  <span className={`relative z-10 ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                    {label}
                  </span>
                </button>
              )
            })}
          </div>

          {periodMode === 'custom' && (
            <div className="flex gap-2">
              <select
                value={customYear}
                onChange={e => setCustomYear(Number(e.target.value))}
                className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-1.5 text-sm focus:outline-none"
              >
                {[now.getFullYear(), now.getFullYear() - 1].map(y => (
                  <option key={y} value={y} className="bg-slate-900">{y}</option>
                ))}
              </select>
              <select
                value={customMonth}
                onChange={e => setCustomMonth(Number(e.target.value))}
                className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-1.5 text-sm focus:outline-none"
              >
                {MONTHS.map((name, i) => (
                  <option key={name} value={i} className="bg-slate-900">{name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* ── ANOMALY BANNERS ──────────────────────────────────────── */}
      <AnimatePresence>
        {anomalies.length > 0 && (
          <div className="flex flex-col gap-2 mb-6">
            {anomalies.map((a, i) => (
              <AnomalyBanner key={i} {...a} />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* ── TIPS ─────────────────────────────────────────────────── */}
      {tips.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3 mb-6">
          {tips.map((tip, i) => (
            <div key={i} className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-sm text-amber-300">
              {tip}
            </div>
          ))}
        </div>
      )}

      {/* ── KPI CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Ingresos Totales"
          value={fmtMoney(totalRevenue)}
          sub={`${sales.length} ventas`}
          accent={accentText}
          glow={accentGlow}
        />
        <StatCard
          label="Ganancia Bruta"
          value={fmtMoney(totalProfit)}
          sub={`Margen ${marginPct}%`}
          accent="text-emerald-400"
          glow="rgba(16,185,129,0.15)"
        />
        <StatCard
          label="Gastos Totales"
          value={fmtMoney(totalExpenses)}
          sub={expenses.length ? `${expenses.length} registros` : 'Sin gastos'}
          accent="text-red-400"
          glow="rgba(239,68,68,0.12)"
        />
        <StatCard
          label="Utilidad Neta"
          value={fmtMoney(netProfit)}
          sub={netProfit >= 0 ? 'Positiva' : 'Negativa'}
          accent={netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          glow={netProfit >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)'}
        />
      </div>

      {/* ── COMPARATIVA ──────────────────────────────────────────── */}
      <div className="bg-white/5 border border-white/8 rounded-3xl p-6 mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-4">Comparativa de período</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`${accentBg} border ${accentBorder} rounded-2xl p-4 text-center`}>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 mb-2">Período actual</p>
            <p className={`text-2xl font-bold ${accentText}`}>{fmtMoney(totalRevenue)}</p>
            <p className="text-xs text-zinc-500 mt-1">{sales.length} ventas</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-2">Período anterior</p>
            <p className="text-2xl font-bold text-white">{fmtMoney(prevRevenue)}</p>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${revDelta >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {revDelta >= 0 ? '↑' : '↓'} {Math.abs(revDelta)}%
            </span>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-2">Mismo mes año anterior</p>
            <p className="text-2xl font-bold text-white">{fmtMoney(sameLastYear)}</p>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${yearDelta >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {yearDelta >= 0 ? '↑' : '↓'} {Math.abs(yearDelta)}%
            </span>
          </div>
        </div>
      </div>

      {/* ── CHARTS ───────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        {/* Area chart */}
        <div className="bg-white/5 border border-white/8 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Ventas y Ganancias — Diario</p>
            <p className="text-xs text-zinc-600">Promedio: {fmtMoney(dailyAvg)}/día</p>
          </div>
          <div className="h-52" style={{ filter: `drop-shadow(0 0 8px ${chartColor}40)` }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyChart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ventas-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ganancias-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip content={<DarkTooltip />} />
                <Area type="monotone" dataKey="Ventas" stroke={chartColor} strokeWidth={2} fill="url(#ventas-grad)" dot={false} />
                <Area type="monotone" dataKey="Ganancias" stroke="#10b981" strokeWidth={2} fill="url(#ganancias-grad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie chart */}
        <div className="bg-white/5 border border-white/8 rounded-3xl p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-4">Gastos por categoría</p>
          {expPieChart.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-zinc-600 text-sm">Sin datos de gastos</div>
          ) : (
            <div className="h-52" style={{ filter: 'drop-shadow(0 0 10px rgba(139,92,246,0.3))' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expPieChart} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} strokeWidth={0}>
                    {expPieChart.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<DarkTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── PROYECCIÓN ───────────────────────────────────────────── */}
      <div className="bg-white/5 border border-white/8 rounded-3xl p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-1">Proyección de cierre mensual</p>
            <p className={`text-3xl font-bold ${accentText}`}>{fmtMoney(projected)}</p>
            <p className="text-xs text-zinc-500 mt-1">Día {daysElapsed} de {daysInMonth} · Promedio {fmtMoney(dailyAvg)}/día</p>
          </div>
          <div className="flex-1 max-w-xs">
            <div className="flex justify-between text-xs text-zinc-600 mb-1">
              <span>Avance del mes</span>
              <span>{Math.round(daysElapsed / daysInMonth * 100)}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${activeStoreColor === 'cyan' ? 'bg-cyan-500' : 'bg-amber-500'}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(daysElapsed / daysInMonth * 100)}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── ROTACIÓN + CANASTA ───────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <div className="bg-white/5 border border-white/8 rounded-3xl p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-4">Rotación de productos</p>
          {rotacion.length === 0 ? (
            <p className="text-zinc-600 text-sm">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {rotacion.map((item, i) => (
                <div key={item.product_name} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? (activeStoreColor === 'cyan' ? 'bg-cyan-500/30 text-cyan-300' : 'bg-amber-500/30 text-amber-300') : 'bg-white/8 text-zinc-400'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.product_name}</p>
                    <p className="text-xs text-zinc-500">{item.ticketCount} tickets</p>
                  </div>
                  <p className="text-sm text-zinc-300 shrink-0">{item.totalUnits} uds</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/8 rounded-3xl p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-4">Canasta de compra</p>
          {canasta.length === 0 ? (
            <p className="text-zinc-600 text-sm">Sin datos suficientes</p>
          ) : (
            <div className="space-y-3">
              {canasta.map(entry => (
                <div key={entry.pair} className="flex items-center justify-between">
                  <p className="text-sm text-white">{entry.pair}</p>
                  <span className={`text-xs px-2 py-1 rounded-full ${accentBg} ${accentText} border ${accentBorder}`}>
                    {entry.count}×
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CAJEROS ──────────────────────────────────────────────── */}
      {cajeroStats.length > 0 && (
        <div className="bg-white/5 border border-white/8 rounded-3xl p-6 mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-4">Rendimiento por cajero</p>
          <div className="space-y-3">
            {cajeroStats.map((cajero, i) => (
              <div key={cajero.name} className="flex items-center gap-4">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? (activeStoreColor === 'cyan' ? 'bg-cyan-500/30 text-cyan-300' : 'bg-amber-500/30 text-amber-300') : 'bg-white/8 text-zinc-400'}`}>
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-white">{cajero.name}</p>
                    <p className="text-sm font-semibold text-white">{fmtMoney(cajero.total)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden mr-4">
                      <div
                        className={`h-full rounded-full ${activeStoreColor === 'cyan' ? 'bg-cyan-500' : 'bg-amber-500'}`}
                        style={{ width: `${cajeroStats[0]?.total ? Math.round(cajero.total / cajeroStats[0].total * 100) : 0}%` }}
                      />
                    </div>
                    <p className="text-xs text-zinc-500 shrink-0">{cajero.count} ventas · {fmtMoney(cajero.profit)} ganancia</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STOCK CRÍTICO ────────────────────────────────────────── */}
      {criticalStock.length > 0 && (
        <div className="bg-white/5 border border-white/8 rounded-3xl p-6 mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-4">Stock crítico — menos de 14 días</p>
          <div className="grid gap-3 md:grid-cols-3">
            {criticalStock.map(product => (
              <div key={product.id} className="bg-red-500/10 border border-red-500/25 rounded-2xl p-4">
                <p className="font-semibold text-red-300 text-sm">{product.name}</p>
                <p className="text-xs text-zinc-500 mt-1">Stock: {product.current_stock}</p>
                <p className="text-xs text-red-400 font-semibold">{product.daysLeft} días restantes</p>
                <p className="text-xs text-zinc-600">Promedio: {product.dailySold} uds/día</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PROMOCIÓN SUGERIDA ───────────────────────────────────── */}
      {suggestedPromotion && (
        <div className={`${accentBg} border ${accentBorder} rounded-3xl p-6 mb-6`}>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 mb-2">Consejo experto</p>
          <p className={`text-lg font-semibold ${accentText}`}>{suggestedPromotion.name}</p>
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{suggestedPromotion.description}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {suggestedPromotion.productNames.map(name => (
              <span key={name} className={`px-3 py-1 rounded-full border text-xs font-semibold ${accentBorder} ${accentText} bg-white/5`}>{name}</span>
            ))}
          </div>
          <button onClick={handleCreatePromotion} className={`mt-4 px-4 py-2 rounded-full text-sm font-semibold text-slate-950 ${activeStoreColor === 'cyan' ? 'bg-cyan-400 hover:bg-cyan-300' : 'bg-amber-400 hover:bg-amber-300'} transition-colors`}>
            Crear promoción
          </button>
        </div>
      )}

      {/* ── HISTORIAL DE TURNOS ──────────────────────────────────── */}
      {shiftsInPeriod.length > 0 && (
        <div className="bg-white/5 border border-white/8 rounded-3xl p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Historial de turnos</p>
            <span className="text-xs text-zinc-600">{shiftsInPeriod.length} turno{shiftsInPeriod.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.08em] text-zinc-600 border-b border-white/8">
                  <th className="pb-3 text-left font-medium">Cajero</th>
                  <th className="pb-3 text-left font-medium">Inicio</th>
                  <th className="pb-3 text-left font-medium">Fin</th>
                  <th className="pb-3 text-right font-medium">Ventas</th>
                  <th className="pb-3 text-right font-medium">Recaudado</th>
                  <th className="pb-3 text-right font-medium">Efectivo</th>
                  <th className="pb-3 text-right font-medium">Digital</th>
                  <th className="pb-3 text-right font-medium">Inicial</th>
                  <th className="pb-3 text-right font-medium">Esperado</th>
                  <th className="pb-3 text-right font-medium">Real</th>
                  <th className="pb-3 text-right font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {shiftsInPeriod.map(shift => {
                  const durMin = shift.fin && shift.inicio
                    ? Math.round((new Date(shift.fin) - new Date(shift.inicio)) / 60000) : null
                  const durLabel = durMin !== null
                    ? durMin >= 60 ? `${Math.floor(durMin / 60)}h ${durMin % 60}m` : `${durMin}m` : '—'
                  return (
                    <tr key={shift.id}>
                      <td className="py-3 font-semibold text-white">
                        {shift.cajero}
                        <span className="ml-2 text-xs text-zinc-600 font-normal">{durLabel}</span>
                      </td>
                      <td className="py-3 text-zinc-500 text-xs">{formatDateTimeART(shift.inicio)}</td>
                      <td className="py-3 text-zinc-500 text-xs">{formatDateTimeART(shift.fin)}</td>
                      <td className="py-3 text-right text-zinc-300">{shift.total_ventas}</td>
                      <td className="py-3 text-right font-semibold text-white">{fmtMoney(shift.total_recaudado)}</td>
                      <td className="py-3 text-right text-emerald-400">{fmtMoney(shift.total_efectivo)}</td>
                      <td className="py-3 text-right text-blue-400">{fmtMoney(shift.total_digital)}</td>
                      <td className="py-3 text-right text-zinc-500">{fmtMoney(shift.monto_inicial)}</td>
                      <td className="py-3 text-right text-zinc-500">{fmtMoney(shift.monto_esperado)}</td>
                      <td className="py-3 text-right text-zinc-500">{fmtMoney(shift.monto_real)}</td>
                      <td className={`py-3 text-right font-semibold ${shift.diferencia >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {shift.diferencia >= 0 ? '+' : ''}{fmtMoney(shift.diferencia)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-white/10">
                <tr className="text-sm font-semibold text-white">
                  <td className="pt-3 text-zinc-500" colSpan={3}>Totales</td>
                  <td className="pt-3 text-right">{shiftsInPeriod.reduce((s, x) => s + (x.total_ventas || 0), 0)}</td>
                  <td className="pt-3 text-right">{fmtMoney(shiftsInPeriod.reduce((s, x) => s + (x.total_recaudado || 0), 0))}</td>
                  <td className="pt-3 text-right text-emerald-400">{fmtMoney(shiftsInPeriod.reduce((s, x) => s + (x.total_efectivo || 0), 0))}</td>
                  <td className="pt-3 text-right text-blue-400">{fmtMoney(shiftsInPeriod.reduce((s, x) => s + (x.total_digital || 0), 0))}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── ANÁLISIS IA ──────────────────────────────────────────── */}
      <div ref={insightsRef} className="bg-white/5 border border-white/8 rounded-3xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Análisis inteligente</p>
            <p className="text-xs text-zinc-600 mt-1">Predicciones contables generadas con Google Gemini</p>
          </div>
          <button
            onClick={handleGenerateInsights}
            disabled={loadingInsights}
            className={`px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-40 ${activeStoreColor === 'cyan' ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30' : 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30'}`}
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
          <div className="rounded-2xl bg-white/3 border border-white/8 p-8 text-center">
            <p className="text-sm text-zinc-600">Seleccioná el período y hacé clic en "Generar análisis" para obtener predicciones y recomendaciones contables personalizadas.</p>
          </div>
        )}

        {loadingInsights && (
          <div className="rounded-2xl bg-white/3 border border-white/8 p-10 text-center space-y-2">
            <div className={`text-2xl ${accentText} animate-pulse`}>◈</div>
            <p className="text-sm font-semibold text-zinc-400">Procesando datos del período…</p>
            <p className="text-xs text-zinc-600">Esto tarda unos segundos</p>
          </div>
        )}

        <AnimatePresence>
          {insights && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className={`${accentBg} border ${accentBorder} rounded-2xl p-5`}>
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 mb-2">Predicción</p>
                <p className={`text-sm leading-relaxed ${accentText}`}>{insights.prediccion}</p>
              </div>

              {insights.alertas?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-red-500">Alertas</p>
                  {insights.alertas.map((alerta, i) => (
                    <div key={i} className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
                      <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
                      <p className="text-sm text-red-300">{alerta}</p>
                    </div>
                  ))}
                </div>
              )}

              {insights.recomendaciones?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Recomendaciones</p>
                  {insights.recomendaciones.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 text-slate-950 ${activeStoreColor === 'cyan' ? 'bg-cyan-400' : 'bg-amber-400'}`}>{i + 1}</span>
                      <p className="text-sm text-zinc-300">{rec}</p>
                    </div>
                  ))}
                </div>
              )}

              {insights.oportunidad && (
                <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-500 mb-2">Mayor oportunidad</p>
                  <p className="text-sm text-emerald-300 leading-relaxed">{insights.oportunidad}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  )
}
