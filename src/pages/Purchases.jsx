import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney } from '@/components/argentina'
import { exportToXlsx, importFromXlsx, PURCHASE_COLUMNS, PURCHASE_IMPORT_COLUMNS } from '@/lib/xlsxUtils'

const SAMPLE_ITEMS = [
  { barcode: '123', name: 'Fiambre Premium', quantity: 1, purchase_price: 100, sale_price: 150, subtotal: 100 }
]

export default function Purchases() {
  const queryClient = useQueryClient()
  const barcodeRef = useRef(null)
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const { data } = await supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(200)
      return data || []
    },
  })
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').eq('active', true)
      return data || []
    },
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

      const { data: expense, error: expErr } = await supabase.from('expenses').insert({
        description: `Compra de mercadería - ${supplier || 'Sin proveedor'}`,
        amount: total,
        category: 'Mercadería',
        expense_type: 'variable',
        date: new Date().toISOString().split('T')[0],
        notes: invoiceNumber ? `Factura N° ${invoiceNumber}` : '',
      }).select().single()
      if (expErr) throw expErr

      const { data: purchase, error: purErr } = await supabase.from('purchases').insert({
        supplier,
        invoice_number: invoiceNumber,
        items,
        total,
        expense_id: expense.id,
      }).select().single()
      if (purErr) throw purErr

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
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
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
      for (const item of (purchase.items || [])) {
        const prod = products.find(p => p.id === item.product_id)
        if (prod) {
          await supabase.from('products').update({
            current_stock: Math.max(0, prod.current_stock - item.quantity)
          }).eq('id', prod.id)
        }
      }
      if (purchase.expense_id) {
        await supabase.from('expenses').delete().eq('id', purchase.expense_id)
      }
      const { error } = await supabase.from('purchases').delete().eq('id', purchase.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
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
        return {
          product_id: prod?.id || null,
          product_name: String(r.name || prod?.name || ''),
          quantity: qty,
          purchase_price: price,
          sale_price: parseFloat(r.sale_price) || (prod?.sale_price || 0),
          subtotal: qty * price,
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
        items_summary: (p.items || []).map(i => `${i.product_name || 'Sin nombre'} ×${i.quantity}`).join(' | ')
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
    setItems(prev => prev.map((item, idx) => idx === index ? {
      ...item,
      [field]: value,
      subtotal: field === 'quantity'
        ? (value * item.purchase_price)
        : field === 'purchase_price'
          ? (item.quantity * value)
          : item.subtotal
    } : item))
  }

  const modalTotal = useMemo(() => items.reduce((sum, item) => sum + item.subtotal, 0), [items])

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
          <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-full bg-blue-900 text-white text-sm font-semibold">
            Nueva compra
          </button>
        </div>
      </header>

      <div className="overflow-x-auto bg-white border border-gray-200 rounded-2xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-gray-500 bg-gray-50">
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
                      }])
                    }}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-left text-xs hover:border-blue-900"
                  >
                    <div className="font-semibold">{prod.name}</div>
                    <div className="text-gray-500">{prod.category}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2 max-h-[58vh] overflow-y-auto pr-2">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-6 gap-3 items-center">
                  <div className="col-span-2">{item.product_name}</div>
                  <input type="number" value={item.quantity} onChange={e => handleSaveItem(index, 'quantity', parseFloat(e.target.value) || 0)} className="border border-gray-200 rounded-lg px-2 py-1" />
                  <input type="number" value={item.purchase_price} onChange={e => handleSaveItem(index, 'purchase_price', parseFloat(e.target.value) || 0)} className="border border-gray-200 rounded-lg px-2 py-1" />
                  <input type="number" value={item.sale_price} onChange={e => handleSaveItem(index, 'sale_price', parseFloat(e.target.value) || 0)} className="border border-gray-200 rounded-lg px-2 py-1" />
                  <div>{fmtMoney(item.subtotal)}</div>
                  <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== index))} className="text-red-600">×</button>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <div>TOTAL</div>
              <div className="text-2xl font-bold text-emerald-600">{fmtMoney(modalTotal)}</div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-full text-sm font-semibold">Cancelar</button>
              <button onClick={() => createMutation.mutate()} className="px-4 py-2 bg-blue-900 text-white rounded-full text-sm font-semibold">Registrar compra</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
