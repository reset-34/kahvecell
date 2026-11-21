import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthLayout } from './components/AuthLayout'
import { AppLayout } from './components/AppLayout'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OrderHistoryPage } from './pages/OrderHistoryPage'
import { OrderPage } from './pages/OrderPage'
import { OtpPage } from './pages/OtpPage'
import { QrPage } from './pages/QrPage'
import { RegisterPage } from './pages/RegisterPage'
import { RequireShopOwner } from './components/RequireShopOwner'
import { ToastProvider } from './components/ToastProvider'
import { ShopDetailPage } from './pages/ShopDetailPage'
import { ShopOrdersPage } from './pages/ShopOrdersPage'
import { ShopsPage } from './pages/ShopsPage'
import { SubscriptionPage } from './pages/SubscriptionPage'

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="verify-otp" element={<OtpPage />} />
          </Route>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="shops" element={<ShopsPage />} />
            <Route path="shops/:shopId" element={<ShopDetailPage />} />
            <Route path="subscription" element={<SubscriptionPage />} />
            <Route path="orders/new" element={<OrderPage />} />
            <Route path="orders/history" element={<OrderHistoryPage />} />
            <Route path="orders/:orderId/qr" element={<QrPage />} />
            <Route path="orders" element={<Navigate to="/orders/history" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route
            path="owner/orders"
            element={
              <RequireShopOwner>
                <ShopOrdersPage />
              </RequireShopOwner>
            }
          />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
