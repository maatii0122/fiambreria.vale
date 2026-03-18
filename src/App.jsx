import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import ProtectedRoute from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import POSv2 from '@/pages/POSv2'
import Products from '@/pages/Products'
import Purchases from '@/pages/Purchases'
import Sales from '@/pages/Sales'
import Expenses from '@/pages/Expenses'
import Reports from '@/pages/Reports'
import InvoiceScanner from '@/pages/InvoiceScanner'
import Settings from '@/pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 2, retry: 1 } }
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"  element={<Dashboard />} />
            <Route path="pos"        element={<POSv2 />} />
            <Route path="products"   element={<Products />} />
            <Route path="purchases"  element={<Purchases />} />
            <Route path="sales"      element={<Sales />} />
            <Route path="expenses"   element={<Expenses />} />
            <Route path="reports"    element={<Reports />} />
            <Route path="scanner"    element={<InvoiceScanner />} />
            <Route path="settings"   element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  )
}
