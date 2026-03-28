import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatDateTimeART, fmtMoney, nowART } from '@/components/argentina'
import { Loader2, Printer, Plus, Minus, X } from 'lucide-react'
import { loadPromotions } from '@/lib/promotions'

const CAJEROS = ['Maia', 'Mía', 'Lucas']
const PAYMENT_METHODS = ['efectivo', 'transferencia', 'qr', 'tarjeta']
const PAYMENT_LABELS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  qr: 'QR',
  tarjeta: 'Tarjeta',
}
const STORAGE_KEY = 'fiambrerias-turno'

export default function POSv2() {
  const queryClient = useQueryClient()
  const [screen, setScreen] = useState('apertura')
  const [turno, setTurno] = useState(null)
  const [cajero, setCajero] = useState(CAJEROS[0])
  const [manualCajero, setManualCajero] = useState('')
  const [montoInicial, setMontoInicial] = useState('')
  const [nota, setNota] = useState('')
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [completedSale, setCompletedSale] = useState(null)
  const [liveTime, setLiveTime] = useState(nowART())
  const [realCashCount, setRealCashCount] = useState('')
  const [observations, setObservations] = useState('')
  const [closingSummary, setClosingSummary] = useState(null)
  const barcodeRef = useRef(null)
  const [promotions, setPromotions] = useState(() => loadPromotions())

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').eq('active', true)
      return data || []
    },
  })

  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(500)
      return data || []
    },
  })

  useEffect(() => {
    const interval = setInterval(() => setLiveTime(nowART()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (screen === 'pos') {
      barcodeRef.current?.focus()
    }
  }, [screen])

  useEffect(() => {
    const refresh = () => setPromotions(loadPromotions())
    const storageHandler = (event) => {
      if (event.key === 'fiambrerias-promotions') refresh()
    }
    window.addEventListener('fiambrerias-promotions', refresh)
    window.addEventListener('storage', storageHandler)
    return () => {
      window.removeEventListener('fiambrerias-promotions', refresh)
      window.removeEventListener('storage', storageHandler)
    }
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed.turno) {
          setTurno(parsed.turno)
          setScreen(parsed.screen || 'pos')
        }
      } catch (err) {
        console.error('No se pudo recuperar el turno', err)
      }
    }
  }, [])

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = [product.name, product.barcode].some(value =>
        String(value || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
      const matchesCategory = categoryFilter ? product.category === categoryFilter : true
      return matchesSearch && matchesCategory
    })
  }, [products, searchQuery, categoryFilter])

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0)

  const addToCart = (product, qty = 1) => {
    if (!product) return
    if (!product.allow_negative_stock) {
      const inCart = cart.find(i => i.product_id === product.id)?.quantity || 0
      if (inCart + qty > product.current_stock) {
        toast.error(`Sin stock suficiente (disponible: ${product.current_stock})`)
        return
      }
    }
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) {
        return prev.map(i => i.product_id === product.id
          ? { ...i, quantity: i.quantity + qty, subtotal: (i.quantity + qty) * i.unit_price }
          : i)
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit_price: product.sale_price,
        purchase_price: product.purchase_price || 0,
        subtotal: qty * product.sale_price,
      }]
    })
  }

  const updateQuantity = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.product_id !== productId) return item
      const nextQty = Math.max(1, item.quantity + delta)
      return { ...item, quantity: nextQty, subtotal: nextQty * item.unit_price }
    }))
  }

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.product_id !== productId))
  }

  const completeSaleMutation = useMutation({
    mutationFn: async ({ cartItems, total, method }) => {
      const { data: sale, error } = await supabase.from('sales').insert({
        sale_number: `V-${Date.now()}`,
        items: cartItems,
        total,
        payment_method: method,
        cashier: turno.cajero,
      }).select().single()
      if (error) throw error

      for (const item of cartItems) {
        const prod = products.find(p => p.id === item.product_id)
        if (prod) {
          await supabase.from('products').update({ current_stock: prod.current_stock - item.quantity }).eq('id', prod.id)
        }
      }
      return sale
    },
    onSuccess: (sale) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      setCompletedSale(sale)
      setCart([])
      setPaymentMethod('efectivo')
      toast.success('Venta registrada')
    },
    onError: () => toast.error('Error al registrar la venta'),
  })

  const handleConfirmSale = () => {
    if (!cart.length || !turno) {
      toast.error('Agregá productos antes de cerrar la venta')
      return
    }
    const total = cart.reduce((sum, item) => sum + item.subtotal, 0)
    completeSaleMutation.mutate({ cartItems: cart, total, method: paymentMethod })
  }

  const handleApplyPromotion = (promo) => {
    if (!promo?.productIds?.length) return
    promo.productIds.forEach(id => {
      const product = products.find(p => p.id === id)
      if (product) addToCart(product)
    })
    toast.success(`Promoción ${promo.name} aplicada`)
  }

  const startTurno = () => {
    if (!cajero || !montoInicial) {
      toast.error('Completa cajero y monto inicial')
      return
    }
    setTurno({
      cajero: manualCajero.trim() || cajero,
      montoInicial: parseFloat(montoInicial) || 0,
      nota,
      inicio: nowART().toISOString(),
    })
    setScreen('pos')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ turno: {
      cajero: manualCajero.trim() || cajero,
      montoInicial: parseFloat(montoInicial) || 0,
      nota,
      inicio: nowART().toISOString(),
    }, screen: 'pos' }))
  }

  const turnoSales = useMemo(() => {
    if (!turno) return []
    const inicio = new Date(turno.inicio)
    return sales.filter(s => new Date(s.created_at) >= inicio)
  }, [sales, turno])

  const efectivoTotal = turnoSales
    .filter(s => s.payment_method === 'efectivo')
    .reduce((sum, sale) => sum + (sale.total || 0), 0)
  const otherPayments = turnoSales
    .filter(s => s.payment_method !== 'efectivo')
    .reduce((sum, sale) => sum + (sale.total || 0), 0)

  const expectedCash = (turno?.montoInicial || 0) + efectivoTotal
  const realCashNumber = parseFloat(realCashCount) || 0
  const cashDiff = realCashCount ? realCashNumber - expectedCash : 0

  const handleConfirmCierre = () => {
    if (!realCashCount) {
      toast.error('Ingresá el conteo real')
      return
    }
    setClosingSummary({
      salesCount: turnoSales.length,
      total: turnoSales.reduce((sum, sale) => sum + (sale.total || 0), 0),
      efectivo: efectivoTotal,
      digital: otherPayments,
      expectedCash,
      realCash: realCashNumber,
      diff: cashDiff,
      observations,
    })
    setScreen('resumen')
  }

  const resetTurno = () => {
    setScreen('apertura')
    setTurno(null)
    setCart([])
    setCompletedSale(null)
    setMontoInicial('')
    setNota('')
    setBarcodeInput('')
    setSearchQuery('')
    setCategoryFilter('')
    setPaymentMethod('efectivo')
    setRealCashCount('')
    setObservations('')
    setClosingSummary(null)
    setManualCajero('')
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <div className="space-y-6">
      {screen === 'apertura' && (
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="text-center">
            <p className="text-sm uppercase text-gray-500">Fiambrerías Vale</p>
            <h2 className="text-2xl font-bold">Apertura de turno</h2>
          </div>
          <div>
            <label className="text-sm text-gray-500">Cajero</label>
            <select
              value={cajero}
              onChange={e => setCajero(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2"
            >
              {CAJEROS.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-500">Cajero (manual)</label>
            <input
              value={manualCajero}
              onChange={e => setManualCajero(e.target.value)}
              placeholder="Otro cajero..."
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">Monto inicial</label>
            <input
              type="number"
              value={montoInicial}
              onChange={e => setMontoInicial(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">Nota (opcional)</label>
            <input
              value={nota}
              onChange={e => setNota(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2"
            />
          </div>
          <button
            onClick={startTurno}
            className="w-full py-3 bg-blue-900 text-white font-semibold rounded-2xl"
          >
            Iniciar turno
          </button>
        </div>
      )}

      {screen === 'pos' && turno && (
        <div className="space-y-6">
          <div className="bg-blue-900 text-white rounded-2xl flex items-center justify-between p-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-blue-200">Fiambrerías Vale</p>
              <p className="text-base font-semibold">{turno.cajero}</p>
            </div>
            <p className="font-mono text-sm">{formatDateTimeART(liveTime)}</p>
            <button
              onClick={() => setScreen('cierre')}
              className="px-4 py-2 bg-red-600 rounded-full text-sm font-semibold"
            >
              Cerrar turno
            </button>
          </div>

          <div className="grid lg:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-4">
              <div className="flex gap-3">
                <input
                  ref={barcodeRef}
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const product = products.find(p => String(p.barcode) === barcodeInput.trim())
                      if (product) addToCart(product)
                      setBarcodeInput('')
                    }
                  }}
                  placeholder="Código de barras"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2"
                />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar..."
                  className="w-56 border border-gray-200 rounded-lg px-3 py-2"
                />
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2"
                >
                  <option value="">Todas las categorías</option>
                  {[...new Set(products.map(p => p.category))].map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProducts.map(product => {
                  const disabled = !product.allow_negative_stock && product.current_stock <= 0
                  return (
                    <div
                      key={product.id}
                      className={`border rounded-2xl p-4 bg-white shadow-sm ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-lg'}`}
                    >
                      <p className="text-xs text-gray-400 uppercase">{product.category}</p>
                      <p className="text-lg font-semibold mt-1">{product.name}</p>
                      <p className="text-sm text-gray-500">{fmtMoney(product.sale_price)}</p>
                      <p className="text-xs text-gray-400 mt-1">Stock: {product.current_stock}</p>
                      <button
                        onClick={() => addToCart(product)}
                        disabled={disabled}
                        className="mt-3 w-full py-2 bg-blue-900 text-white rounded-full text-sm font-semibold disabled:opacity-60"
                      >
                        Agregar
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm flex flex-col h-full">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Carrito</p>
                  <p className="text-2xl font-bold">{cart.length} ítems</p>
                </div>
                <button onClick={() => setCart([])} className="text-sm text-blue-600">Vaciar</button>
              </div>
              {promotions.length > 0 && (
                <div className="mt-4 border border-dashed border-gray-200 rounded-2xl p-4 space-y-2 bg-blue-50">
                  <p className="text-sm text-blue-700 font-semibold">Promociones sugeridas</p>
                  <div className="flex flex-wrap gap-2">
                    {promotions.map(promo => (
                      <button
                        key={promo.id}
                        onClick={() => handleApplyPromotion(promo)}
                        className="text-xs px-3 py-1 rounded-full border border-blue-200 bg-white text-blue-700 font-semibold"
                      >
                        {promo.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 space-y-3 flex-1 overflow-y-auto max-h-[400px]">
                {cart.map(item => (
                  <div key={item.product_id} className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <div>
                      <p className="font-semibold">{item.product_name}</p>
                      <p className="text-xs text-gray-500">{fmtMoney(item.unit_price)} × {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <button onClick={() => updateQuantity(item.product_id, -1)} className="p-1 rounded-full bg-gray-100">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.product_id, 1)} className="p-1 rounded-full bg-gray-100">
                        <Plus className="w-3 h-3" />
                      </button>
                      <button onClick={() => removeFromCart(item.product_id)} className="p-1 rounded-full bg-red-100">
                        <X className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
                {!cart.length && <p className="text-sm text-gray-500">Sin productos</p>}
              </div>

              {completedSale ? (
                <div className="mt-4 border border-green-200 rounded-2xl p-4 bg-emerald-50">
                  <p className="text-sm text-emerald-600">Venta registrada</p>
                  <p className="text-lg font-semibold mt-2">{completedSale.sale_number}</p>
                  <p className="text-sm text-gray-500">Total: {fmtMoney(completedSale.total)}</p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setCompletedSale(null)} className="flex-1 py-2 bg-white rounded-2xl border border-blue-900 text-blue-900 font-semibold">
                      Nueva venta
                    </button>
                    <button onClick={() => toast('Enviando a impresora...')} className="flex-1 py-2 bg-blue-900 text-white rounded-2xl font-semibold flex items-center justify-center gap-2">
                      <Printer className="w-4 h-4" /> Imprimir
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-widest">Método de pago</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {PAYMENT_METHODS.map(method => (
                        <button
                          key={method}
                          onClick={() => setPaymentMethod(method)}
                          className={`px-3 py-2 rounded-xl border text-sm font-semibold ${paymentMethod === method ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-600'}`}
                        >
                          {PAYMENT_LABELS[method]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Total</p>
                    <p className="text-2xl font-bold">{fmtMoney(cartTotal)}</p>
                  </div>
                  <button
                    onClick={handleConfirmSale}
                    disabled={!cart.length || completeSaleMutation.isLoading}
                    className="w-full py-3 rounded-2xl text-white font-semibold bg-blue-900 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {completeSaleMutation.isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Confirmar venta
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {screen === 'cierre' && turno && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Turno</p>
              <p className="text-xl font-semibold">{turno.cajero}</p>
            </div>
            <button onClick={() => setScreen('pos')} className="text-sm text-blue-600">Volver</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500">Ventas</p>
              <p className="text-2xl font-bold">{turnoSales.length}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-2xl font-bold">{fmtMoney(turnoSales.reduce((sum, sale) => sum + (sale.total || 0), 0))}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500">Efectivo</p>
              <p className="text-2xl font-bold">{fmtMoney(efectivoTotal)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500">Digital</p>
              <p className="text-2xl font-bold">{fmtMoney(otherPayments)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-gray-200 p-4 space-y-3">
            <p className="text-sm text-gray-500">Arqueo</p>
            <p>Monto inicial: {fmtMoney(turno.montoInicial)}</p>
            <p>Efectivo en ventas: {fmtMoney(efectivoTotal)}</p>
            <p className="font-semibold">Esperado: {fmtMoney(expectedCash)}</p>
            <div>
              <label className="text-sm text-gray-500">Conteo real</label>
              <input
                type="number"
                value={realCashCount}
                onChange={e => setRealCashCount(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2"
              />
            </div>
            <p className={`text-sm font-semibold ${cashDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {realCashCount ? `Diferencia: ${fmtMoney(cashDiff)}` : 'Ingresá el monto real para calcular diferencia'}
            </p>
            <div>
              <label className="text-sm text-gray-500">Observaciones</label>
              <textarea
                value={observations}
                onChange={e => setObservations(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2"
                rows={3}
              />
            </div>
            <button
              onClick={handleConfirmCierre}
              className="w-full py-3 bg-blue-900 text-white rounded-2xl font-semibold"
            >
              Confirmar cierre
            </button>
          </div>
        </div>
      )}

      {screen === 'resumen' && closingSummary && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Resumen del turno</h2>
            <button onClick={resetTurno} className="text-sm text-blue-600">Abrir nuevo turno</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500">Ventas</p>
              <p className="text-2xl font-bold">{closingSummary.salesCount}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-2xl font-bold">{fmtMoney(closingSummary.total)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500">Efectivo</p>
              <p className="text-2xl font-bold">{fmtMoney(closingSummary.efectivo)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500">Digital</p>
              <p className="text-2xl font-bold">{fmtMoney(closingSummary.digital)}</p>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4 space-y-2">
            <p>Esperado: {fmtMoney(closingSummary.expectedCash)}</p>
            <p>Conteo real: {fmtMoney(closingSummary.realCash)}</p>
            <p className={`font-semibold ${closingSummary.diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              Diferencia: {fmtMoney(closingSummary.diff)}
            </p>
            <p className="text-sm text-gray-500">{closingSummary.observations || 'Sin observaciones'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
