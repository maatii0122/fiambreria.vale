import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, formatDateOnlyART } from '@/components/argentina'
import { exportToXlsx, importFromXlsx, PURCHASE_COLUMNS, PURCHASE_IMPORT_COLUMNS } from '@/lib/xlsxUtils'
import { useAuth } from '@/hooks/useAuth'

const SAMPLE_ITEMS = [
  {
    barcode: '123',
    name: 'Fiambre Premium',
    quantity: 1,
    purchase_price: 100,
    sale_price: 150,
    subtotal: 100,
    expiration_date: '',
  },
]

export default function Purchases() {
  const queryClient = useQueryClient()
  const { user, role, storeId } = useAuth()
  const isAdmin = role === 'admin'
  const barcodeRef = useRef(null)
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases', storeId],
    queryFn: async () => {
      let q = supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(200)
      if (!isAdmin && storeId) q = q.eq('store_id', storeId)
      const { data } = await q
      return data || []
    },
    enabled: !!user,
  })
  const { data: products = [] } = useQuery({
    queryKey: ['products', storeId],
    queryFn: async () => {
      let q = supabase.from('products').select('*').eq('active', true)
      if (!isAdmin && storeId) q = q.eq('store_id', storeId)
      const { data } = await q
      return data || []
    },
    enabled: !!user,
  })

  const [showModal, setShowModal] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [items, setItems] = useState([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [showProductSelector, setShowProductSelector] = useState(false)

  const createMutation = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error('Agregá al menos un producto')
      const total = items.reduce((s, i) => s + i.subtotal, 0)

      const { data: purchase, error: purErr } = await supabase.from('purchases').insert({
        supplier,
        invoice_number: invoiceNumber,
        items,
        total,
        ...(storeId ? { store_id: storeId } : {}),
      }).select().single()
      if (purErr) throw purErr

      // Update stock and purchase price for each product
      for (const item of items) {
        const prod = products.find(p => p.id === item.product_id)
        if (prod) {
          await supabase.from('products').update({
            current_stock: prod.current_stock + item.quantity,
            purchase_price: item.purchase_price,
          }).eq('id', prod.id)
        }
      }

      return purchase
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Compra registrada y stock actualizado')
      setShowModal(false)
      setSupplier('')
      setInvoiceNumber('')
      setItems([])
    },
    onError: (err) => toast.error(err.message || 'Error al registrar la compra'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (purchase) => {
      // Revert stock for each item
      for (const item of (purchase.items || [])) {
        const prod = products.find(p => p.id === item.product_id)
        if (prod) {
          await supabase.from('products').update({
            current_stock: Math.max(0, prod.current_stock - item.quantity)
          }).eq('id', prod.id)
        }
      }
      const { error } = await supabase.from('purchases').delete().eq('id', purchase.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Compra eliminada')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const handleBarcodeEnter = (e) => {
    if (e.key !== 'Enter') return
    const val = barcodeInput.trim()
    const prod = products.find(p => p.barcode === val)
    if (prod) {
      const existing = items.find(i => i.product_id === prod.id)
      if (existing) {
      setItems(items.map(i => i.product_id === prod.id
        ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.purchase_price }
        : i))
    } else {
      setItems([...items, {
        product_id: prod.id,
        product_name: prod.name,
        quantity: 1,
        purchase_price: prod.purchase_price || 0,
        sale_price: prod.sale_price || 0,
        subtotal: prod.purchase_price || 0,
        expiration_date: '',
      }])
    }
      setBarcodeInput('')
    } else {
      toast.error('Producto no encontrado')
      setBarcodeInput('')
    }
  }

  const handleImportItems = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const rows = await importFromXlsx(file)
      const newItems = rows.filter(r => r.name || r.barcode).map(r => {
        const prod = products.find(p => p.barcode === String(r.barcode) || (p.name || '').toLowerCase() === String(r.name || '').toLowerCase())
        const qty = parseFloat(r.quantity) || 1
        const price = parseFloat(r.purchase_price) || (prod?.purchase_price || 0)
        const expirationRaw = r.expiration_date || r.fecha_vencimiento || r.vencimiento
        const expiration = expirationRaw ? new Date(String(expirationRaw)) : null
        return {
          product_id: prod?.id || null,
          product_name: String(r.name || prod?.name || ''),
          quantity: qty,
          purchase_price: price,
          sale_price: parseFloat(r.sale_price) || (prod?.sale_price || 0),
          subtotal: qty * price,
          expiration_date: expiration && !Number.isNaN(expiration.valueOf())
            ? expiration.toISOString().split('T')[0]
            : '',
        }
      })
      setItems(prev => [...prev, ...newItems])
      toast.success(`${newItems.length} líneas importadas`)
    } catch (err) {
      toast.error('Error al importar')
    } finally {
      event.target.value = ''
    }
  }

  const handleTemplate = () => {
    exportToXlsx(SAMPLE_ITEMS, PURCHASE_IMPORT_COLUMNS, 'plantilla_compras', 'Compras', {
      title: 'Plantilla de compras',
      subtitle: 'Completá la cantidad y precios antes de importar',
    })
  }

  const handleExport = () => {
    exportToXlsx(
      purchases.map(p => ({
        ...p,
        items_summary: (p.items || []).map(i => `${i.product_name || 'Sin nombre'} ×${i.quantity}`).join(' | '),
        expiration_summary: (p.items || [])
          .filter(i => i.expiration_date)
          .map(i => `${i.product_name || 'Sin nombre'} → ${formatDateOnlyART(i.expiration_date)}`)
          .join(' | '),
      })),
      PURCHASE_COLUMNS,
      `compras_${new Date().toISOString().split('T')[0]}`,
      'Compras',
      {
        title: 'Fiambrerías Vale — Compras',
        subtitle: `Exportado el ${new Date().toLocaleDateString('es-AR')}`,
        totals: { total: purchases.reduce((s, p) => s + (p.total || 0), 0) }
      }
    )
  }

  const handleSaveItem = (index, field, value) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item
      const needsNumber = ['quantity', 'purchase_price', 'sale_price'].includes(field)
      const nextValue = needsNumber ? (parseFloat(value) || 0) : value
      const updated = { ...item, [field]: nextValue }
      if (field === 'quantity') {
        updated.subtotal = nextValue * (item.purchase_price || 0)
      } else if (field === 'purchase_price') {
        updated.subtotal = (item.quantity || 0) * nextValue
      }
      return updated
    }))
  }

  const modalTotal = useMemo(() => items.reduce((sum, item) => sum + item.subtotal, 0), [items])

  const upcomingExpirations = useMemo(() => {
    const buckets = new Map()
    purchases.forEach(purchase => {
      ;(purchase.items || []).forEach(item => {
        const raw = item.expiration_date
        if (!raw) return
        const date = new Date(raw)
        if (Number.isNaN(date.valueOf())) return
        const quantity = Number(item.quantity) || 0
        if (!quantity) return
        const key = `${item.product_name || 'Sin nombre'}__${date.toISOString().split('T')[0]}`
        const existing = buckets.get(key) || {
          product_name: item.product_name || 'Sin nombre',
          expiration_date: date.toISOString().split('T')[0],
          quantity: 0,
        }
        existing.quantity += quantity
        buckets.set(key, existing)
      })
    })
    return Array.from(buckets.values()).sort((a, b) =>
      new Date(a.expiration_date) - new Date(b.expiration_date)
    )
  }, [purchases])

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Compras</p>
          <h1 className="text-3xl font-bold">Registro de compras y reposición de stock</h1>
        </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={handleExport} className="px-4 py-2 rounded-full border border-gray-200 text-sm font-semibold">
          Exportar Excel
          </button>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-full bg-zinc-900 text-white text-sm font-semibold">
            Nueva compra
          </button>
      </div>
    </header>

    {upcomingExpirations.length > 0 && (
      <div className="bg-white rounded-2xl border border-orange-100 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-500">Vencimientos</p>
            <p className="text-lg font-semibold">Reservas por fecha</p>
          </div>
          <span className="text-sm text-gray-500">{upcomingExpirations.length} registros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {upcomingExpirations.slice(0, 6).map(({ product_name, expiration_date, quantity }) => (
            <div key={`${product_name}-${expiration_date}`} className="rounded-xl border border-orange-100 p-4 bg-orange-50 space-y-1">
              <p className="text-sm font-semibold">{product_name}</p>
              <p className="text-xs text-gray-500">Vence: {formatDateOnlyART(expiration_date)}</p>
              <p className="text-sm text-orange-700">{quantity} uds</p>
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="overflow-x-auto bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-[0.08em] text-zinc-400 border-b border-zinc-100">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">N° Factura</th>
              <th className="px-4 py-3">Productos</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map(purchase => {
              const displayItems = (purchase.items || []).slice(0, 2).map(i => `${i.product_name || 'Sin nombre'} ×${i.quantity}`)
              const more = (purchase.items || []).length - displayItems.length
              return (
                <tr key={purchase.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">{new Date(purchase.created_at).toLocaleDateString('es-AR')}</td>
                  <td className="px-4 py-3">{purchase.supplier || 'Sin proveedor'}</td>
                  <td className="px-4 py-3">{purchase.invoice_number || '-'}</td>
                  <td className="px-4 py-3">
                    {displayItems.join(', ')}{more > 0 && ` +${more} más`}
                  </td>
                  <td className="px-4 py-3 font-semibold">{fmtMoney(purchase.total)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => deleteMutation.mutate(purchase)} className="text-red-600 hover:text-red-900 text-sm">Eliminar</button>
                  </td>
                </tr>
              )
            })}
            {!purchases.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  {isLoading ? 'Cargando compras...' : 'No hay compras registradas.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Registrar compra</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500">Cerrar</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                placeholder="Proveedor"
                className="border border-gray-200 rounded-lg px-3 py-2"
              />
              <input
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="N° Factura"
                className="border border-gray-200 rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex gap-3">
              <input
                ref={barcodeRef}
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeEnter}
                placeholder="Escanear código"
                className="flex-1 border border-gray-200 rounded-full px-4 py-2"
              />
              <button onClick={() => setShowProductSelector(prev => !prev)} className="px-4 py-2 rounded-full border border-gray-200 text-sm font-semibold">
                + Agregar producto
              </button>
              <button onClick={handleTemplate} className="px-4 py-2 rounded-full border border-gray-200 text-sm font-semibold">
                Descargar plantilla
              </button>
              <label className="px-4 py-2 rounded-full border border-gray-200 text-sm font-semibold cursor-pointer">
                Importar Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportItems} />
              </label>
            </div>
            {showProductSelector && (
              <div className="grid md:grid-cols-3 gap-3 max-h-48 overflow-y-auto">
                {products.map(prod => (
                    <button
                      key={prod.id}
                      onClick={() => {
                        setItems(prev => [...prev, {
                          product_id: prod.id,
                          product_name: prod.name,
                          quantity: 1,
                          purchase_price: prod.purchase_price || 0,
                          sale_price: prod.sale_price || 0,
                          subtotal: prod.purchase_price || 0,
                          expiration_date: '',
                        }])
                      }}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-left text-xs hover:border-zinc-900"
                  >
                    <div className="font-semibold">{prod.name}</div>
                    <div className="text-gray-500">{prod.category}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2 max-h-[58vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-7 gap-3 text-xs uppercase tracking-[0.3em] text-gray-500">
                <span className="col-span-2">Producto</span>
                <span className="text-center">Cant.</span>
                <span className="text-center">P. Compra</span>
                <span className="text-center">P. Venta</span>
                <span className="text-center">Vencimiento</span>
                <span className="text-right">Subtotal</span>
                <span className="text-center">Acción</span>
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-7 gap-3 items-center">
                  <div className="col-span-2 text-sm">{item.product_name}</div>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={e => handleSaveItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-center"
                  />
                  <input
                    type="number"
                    value={item.purchase_price}
                    onChange={e => handleSaveItem(index, 'purchase_price', parseFloat(e.target.value) || 0)}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-center"
                  />
                  <input
                    type="number"
                    value={item.sale_price}
                    onChange={e => handleSaveItem(index, 'sale_price', parseFloat(e.target.value) || 0)}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-center"
                  />
                  <input
                    type="date"
                    value={item.expiration_date || ''}
                    onChange={e => handleSaveItem(index, 'expiration_date', e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-center"
                  />
                  <div className="text-right font-semibold">{fmtMoney(item.subtotal)}</div>
                  <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== index))} className="text-red-600">
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <div>TOTAL</div>
              <div className="text-2xl font-bold text-emerald-600">{fmtMoney(modalTotal)}</div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-full text-sm font-semibold">Cancelar</button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="px-4 py-2 bg-zinc-900 text-white rounded-full text-sm font-semibold disabled:opacity-50">
                {createMutation.isPending ? 'Registrando…' : 'Registrar compra'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
