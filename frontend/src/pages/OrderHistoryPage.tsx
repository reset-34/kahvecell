import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage, ordersApi } from '../lib/api'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates'
import { getOrderStatusClass, ORDER_STATUS_LABELS } from '../lib/orderStatus'
import type { Order } from '../types/api'

function formatOrderDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function OrderHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    let active = true
    ordersApi
      .history()
      .then((result) => {
        if (active) setOrders(result)
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [requestVersion])

  function retryOrders() {
    setLoading(true)
    setError('')
    setRequestVersion((version) => version + 1)
  }

  const newestFirst = useMemo(
    () =>
      [...orders].sort(
        (first, second) =>
          Date.parse(second.created_at) - Date.parse(first.created_at),
      ),
    [orders],
  )

  return (
    <div className="stack">
      <header className="page-heading">
        <h1>Sipariş geçmişim</h1>
        <p>Önceki siparişlerini ve durumlarını burada görebilirsin.</p>
      </header>
      {loading ? (
        <LoadingState message="Sipariş geçmişin yükleniyor…" />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={retryOrders}
          title="Sipariş geçmişi yüklenemedi"
        />
      ) : newestFirst.length === 0 ? (
        <EmptyState
          action={<Link className="button" to="/shops">Dükkânları keşfet</Link>}
          message="Bir dükkân seçip ilk kahve siparişini verdiğinde geçmişin burada görünür."
          title="Henüz siparişin yok"
        />
      ) : (
        <ul className="history-list" aria-label="Sipariş geçmişi">
          {newestFirst.map((order) => (
            <li className="history-order" key={order.public_id}>
              <div className="history-order-details">
                <time dateTime={order.created_at}>
                  {formatOrderDate(order.created_at)}
                </time>
                <h2>{order.shop_name}</h2>
                <p>{order.product_name}</p>
              </div>
              <div className="history-order-actions">
                <span
                  className={`order-status-pill ${getOrderStatusClass(order.status)}`}
                >
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
                <Link to={`/orders/${order.public_id}/qr`}>Sipariş detayı</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
