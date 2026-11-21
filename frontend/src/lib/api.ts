import axios from 'axios'
import type {
  AuthTokens,
  Order,
  OrderStatusEvent,
  OrderStatus,
  PlanType,
  Product,
  PurchaseResult,
  QRPayload,
  QRVerification,
  Shop,
  ShopDetail,
  Subscription,
  SubscriptionPlan,
  User,
} from '../types/api'

const ACCESS_TOKEN_KEY = 'kahvecell.accessToken'
const REFRESH_TOKEN_KEY = 'kahvecell.refreshToken'

export const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1',
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function saveTokens(tokens: AuthTokens): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token)
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
}

export function clearTokens(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY)
  window.localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ detail?: string }>(error)) {
    return (
      error.response?.data?.detail ??
      'Backend’e ulaşılamadı. Backend’in çalıştığını kontrol edin.'
    )
  }
  if (error instanceof Error) return error.message
  return 'Beklenmeyen bir hata oluştu.'
}

function isOrderStatusEvent(value: unknown): value is OrderStatusEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Record<string, unknown>
  return (
    typeof event.order_id === 'string' &&
    typeof event.status === 'string' &&
    ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERED'].includes(
      event.status,
    )
  )
}

function handleStatusEvent(
  block: string,
  orderId: string,
  onStatus: (event: OrderStatusEvent) => void,
): void {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data) return

  let event: unknown
  try {
    event = JSON.parse(data)
  } catch {
    throw new Error('Sunucudan gelen sipariş durumu okunamadı.')
  }
  if (!isOrderStatusEvent(event) || event.order_id !== orderId) {
    throw new Error('Sunucudan beklenmeyen sipariş durumu alındı.')
  }
  onStatus(event)
}

export const authApi = {
  register: async (data: {
    phone_number: string
    full_name: string
    password: string
  }): Promise<{ message: string; phone_number: string }> =>
    (await api.post('/auth/register', data)).data,
  login: async (data: {
    phone_number: string
    password: string
  }): Promise<AuthTokens> => (await api.post('/auth/login', data)).data,
  verifyOtp: async (data: {
    phone_number: string
    otp_code: string
  }): Promise<AuthTokens> => (await api.post('/auth/verify-otp', data)).data,
  me: async (): Promise<User> => (await api.get('/auth/me')).data,
}

export const shopsApi = {
  list: async (location?: {
    latitude: number
    longitude: number
  }): Promise<Shop[]> =>
    (
      await api.get('/shops', {
        params: location
          ? { lat: location.latitude, lng: location.longitude, radius: 200 }
          : undefined,
      })
    ).data,
  detail: async (
    shopId: number,
    location?: { latitude: number; longitude: number },
  ): Promise<ShopDetail> =>
    (
      await api.get(`/shops/${shopId}`, {
        params: location
          ? { lat: location.latitude, lng: location.longitude }
          : undefined,
      })
    ).data,
  menu: async (shopId: number): Promise<Product[]> =>
    (await api.get(`/shops/${shopId}/menu`)).data,
}

export const subscriptionsApi = {
  plans: async (): Promise<SubscriptionPlan[]> =>
    (await api.get('/subscriptions/plans')).data,
  current: async (): Promise<Subscription> =>
    (await api.get('/subscriptions/me')).data,
  change: async (
    plan_type: PlanType,
    card_number: string,
  ): Promise<PurchaseResult> =>
    (await api.patch('/subscriptions/me', { plan_type, card_number })).data,
  renew: async (card_number: string): Promise<PurchaseResult> =>
    (await api.post('/subscriptions/me/renew', { card_number })).data,
  cancel: async (): Promise<Subscription> =>
    (await api.delete('/subscriptions/me')).data,
  purchase: async (
    plan_type: PlanType,
    card_number: string,
  ): Promise<PurchaseResult> =>
    (await api.post('/subscriptions', { plan_type, card_number })).data,
}

export const ordersApi = {
  create: async (data: {
    shop_id: number
    product_id: number
    size: 'S' | 'M' | 'L'
    sugar: number
    milk: 'NONE' | 'WHOLE' | 'OAT' | 'LACTOSE_FREE'
    extra_shot: boolean
  }): Promise<Order> => (await api.post('/orders', data)).data,
  detail: async (orderId: string): Promise<Order> =>
    (await api.get(`/orders/${orderId}`)).data,
  status: async (orderId: string): Promise<{ status: OrderStatus }> =>
    (await api.get(`/orders/${orderId}/status`)).data,
  history: async (): Promise<Order[]> =>
    (await api.get('/orders/history')).data,
  shopOrders: async (): Promise<Order[]> =>
    (await api.get('/orders/shop')).data,
  updateStatus: async (
    orderId: string,
    status: Exclude<OrderStatus, 'PENDING'>,
  ): Promise<Order> =>
    (await api.patch(`/orders/${orderId}/status`, { status })).data,
  verifyQr: async (
    orderId: string,
    payload: QRPayload,
  ): Promise<QRVerification> =>
    (await api.post(`/orders/${orderId}/verify-qr`, payload)).data,
  listenForStatus: async (
    orderId: string,
    signal: AbortSignal,
    onStatus: (event: OrderStatusEvent) => void,
  ): Promise<void> => {
    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) {
      throw new Error('Oturum bulunamadı. Giriş yapıp tekrar deneyin.')
    }

    let response: Response
    try {
      response = await fetch(
        `${api.defaults.baseURL ?? 'http://localhost:8000/api/v1'}/orders/${orderId}/events`,
        {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        signal,
        },
      )
    } catch (requestError: unknown) {
      if (signal.aborted) throw requestError
      throw new Error('Canlı sipariş bağlantısı kurulamadı. Backend bağlantısını kontrol edin.')
    }
    if (!response.ok) {
      const message =
        response.status === 401
          ? 'Oturum süreniz dolmuş. Yeniden giriş yapın.'
          : response.status === 403
            ? 'Bu siparişin durumunu görüntüleme yetkiniz yok.'
            : `Canlı sipariş bağlantısı kurulamadı (HTTP ${response.status}).`
      throw new Error(message)
    }
    if (!response.body) {
      throw new Error('Tarayıcı canlı sipariş bağlantısını desteklemiyor.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split(/\r?\n\r?\n/)
        buffer = blocks.pop() ?? ''
        blocks.forEach((block) => handleStatusEvent(block, orderId, onStatus))
      }

      buffer += decoder.decode()
      if (buffer.trim()) handleStatusEvent(buffer, orderId, onStatus)
    } finally {
      reader.releaseLock()
    }
  },
}
