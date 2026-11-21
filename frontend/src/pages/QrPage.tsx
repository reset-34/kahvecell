import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates'
import { getErrorMessage, ordersApi } from '../lib/api'
import { getOrderStatusClass, ORDER_STATUS_LABELS } from '../lib/orderStatus'
import type { Order, OrderStatusEvent } from '../types/api'

export function QrPage() {
  const { orderId } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [requestVersion, setRequestVersion] = useState(0)
  const [loadedOrderKey, setLoadedOrderKey] = useState('')

  useEffect(() => {
    if (!orderId) return

    const activeOrderId = orderId
    const requestKey = `${activeOrderId}:${requestVersion}`
    let active = true
    let delivered = false
    let retryTimer: number | undefined
    const controller = new AbortController()

    async function loadOrderAndListen() {
      try {
        const result = await ordersApi.detail(activeOrderId)
        if (!active) return
        if (active) {
          setOrder(result)
          setError('')
          setConnectionError('')
          setLoadedOrderKey(requestKey)
        }
        if (result.status === 'DELIVERED') {
          delivered = true
          setIsConnected(true)
          return
        }
        setIsConnected(false)

        while (active && !controller.signal.aborted && !delivered) {
          try {
            await ordersApi.listenForStatus(
              activeOrderId,
              controller.signal,
              (event: OrderStatusEvent) => {
                if (!active) return
                setOrder((currentOrder) =>
                  currentOrder
                    ? { ...currentOrder, status: event.status }
                    : currentOrder,
                )
                setConnectionError('')
                setIsConnected(true)
                if (event.status === 'DELIVERED') {
                  delivered = true
                  controller.abort()
                }
              },
            )
            if (!active || controller.signal.aborted || delivered) return
            throw new Error('Canlı sipariş bağlantısı beklenmedik şekilde kapandı.')
          } catch (requestError: unknown) {
            if (!active || controller.signal.aborted || delivered) return
            setConnectionError(getErrorMessage(requestError))
            setIsConnected(false)
            await new Promise<void>((resolve) => {
              retryTimer = window.setTimeout(resolve, 2000)
            })
          }
        }
      } catch (requestError: unknown) {
        if (active) {
          setError(getErrorMessage(requestError))
          setLoadedOrderKey(requestKey)
        }
      }
    }

    void loadOrderAndListen()
    return () => {
      active = false
      controller.abort()
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    }
  }, [orderId, requestVersion])

  function retryOrder() {
    setError('')
    setConnectionError('')
    setIsConnected(false)
    setOrder(null)
    setRequestVersion((version) => version + 1)
  }

  if (!orderId) {
    return (
      <EmptyState
        action={<Link className="button" to="/orders/history">Sipariş geçmişime git</Link>}
        message="Sipariş geçmişinden bir sipariş seçerek QR kodunu açabilirsin."
        title="Sipariş bağlantısı eksik"
      />
    )
  }
  const currentOrderKey = `${orderId}:${requestVersion}`
  if (loadedOrderKey !== currentOrderKey) {
    return <LoadingState message="Sipariş ve QR kod yükleniyor…" />
  }
  if (error) {
    return <ErrorState message={error} onRetry={retryOrder} title="Sipariş yüklenemedi" />
  }
  if (!order) {
    return <LoadingState message="Sipariş ve QR kod yükleniyor…" />
  }

  const delivered = order.status === 'DELIVERED'

  return (
    <section className={`qr-order-card${delivered ? ' is-delivered' : ''}`}>
      <header className="qr-order-heading">
        <p className="shop-explorer-eyebrow">KahveCell siparişi</p>
        <h1>{delivered ? 'Afiyet olsun!' : 'Sipariş QR kodun'}</h1>
        <p>{order.shop_name} · {order.product_name}</p>
      </header>

      <div
        aria-live="polite"
        className={`order-status-pill ${getOrderStatusClass(order.status)}`}
        key={order.status}
        role="status"
      >
        {ORDER_STATUS_LABELS[order.status]}
      </div>

      {connectionError ? (
        <ErrorState
          message={`${connectionError} Bağlantı otomatik olarak yeniden deneniyor.`}
          onRetry={retryOrder}
          title="Canlı güncelleme bağlantısı kesildi"
        />
      ) : !delivered && !isConnected ? (
        <LoadingState message="Canlı sipariş bağlantısı kuruluyor…" />
      ) : (
        !delivered && (
          <p className="live-connection-state" role="status">
            <span aria-hidden="true" />
            Sipariş durumu canlı olarak güncelleniyor
          </p>
        )
      )}

      {error && (
        <ErrorState
          message={error}
          onRetry={retryOrder}
          title="Sipariş durumu güncellenemedi"
        />
      )}

      {delivered ? (
        <div className="qr-delivered-message">
          <span aria-hidden="true">✓</span>
          <p>Siparişin teslim edildi. Güzel bir kahve molası dileriz.</p>
        </div>
      ) : (
        <div className="qr-code-frame">
          {order.qr_image_data_url ? (
            <img
              alt="Siparişi teslim almak için QR kod"
              className="qr-image"
              src={order.qr_image_data_url}
            />
          ) : (
            <ErrorState
              message="Sipariş QR görseli alınamadı. Yeniden yükleyerek tekrar deneyebilirsin."
              onRetry={retryOrder}
              title="QR kod görüntülenemedi"
            />
          )}
          <p className="qr-instruction">
            Siparişin hazır olduğunda bu kodu dükkân görevlisine göster.
          </p>
        </div>
      )}

      <Link className="button secondary" to="/orders/history">
        Sipariş geçmişime dön
      </Link>
    </section>
  )
}
