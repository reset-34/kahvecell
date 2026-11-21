import type { OrderStatus } from '../types/api'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Bekliyor',
  ACCEPTED: 'Kabul Edildi',
  PREPARING: 'Hazırlanıyor',
  READY: 'Hazır',
  DELIVERED: 'Teslim Edildi',
}

export function getOrderStatusClass(status: OrderStatus): string {
  return `status-${status.toLowerCase()}`
}
