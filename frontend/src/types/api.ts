export interface Shop {
  id: number
  name: string
  address: string
  latitude: number
  longitude: number
  opening_hours: string | null
  rating: number | null
  distance_km: number | null
}

export interface Product {
  id: number
  name: string
  description: string | null
  price: number
  is_available: boolean
}

export interface ShopDetail extends Shop {
  menu: Product[]
}

export type PlanType = 'STARTER' | 'PREMIUM' | 'UNLIMITED'

export interface SubscriptionPlan {
  plan_type: PlanType
  name: string
  monthly_price: number
  coffee_credits: number | null
  guest_credits: number
  priority_order: boolean
  eligible_shops: string
}

export interface Subscription {
  id: number
  user_id: number
  plan_type: PlanType
  remaining_credits: number | null
  status: string
  started_at: string
  expires_at: string
}

export interface QRPayload {
  order_id: string
  user_id: string
  shop_id: string
  created_at: string
  signature: string
}

export interface QRVerification {
  valid: boolean
  order_id: string
  status: OrderStatus
  message: string
}

export interface User {
  id: number
  phone_number: string
  full_name: string
  role: 'CUSTOMER' | 'SHOP_OWNER' | 'ADMIN'
}

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'

export interface OrderStatusEvent {
  order_id: string
  status: OrderStatus
}

export interface Order {
  id: number
  public_id: string
  user_id: number
  customer_name: string
  customer_phone: string
  shop_id: number
  shop_name: string
  product_id: number
  product_name: string
  size: string
  quantity: number
  customizations: {
    sugar: number
    milk: string
    extra_shot: boolean
  }
  status: OrderStatus
  created_at: string
  qr_code: QRPayload | null
  qr_image_data_url: string | null
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface PurchaseResult {
  success: boolean
  transaction_id: string
  amount: number
  timestamp: string
  message: string
  subscription: Subscription | null
}
