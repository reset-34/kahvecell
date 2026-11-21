import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates'
import { useToast } from '../components/useToast'
import type { Order, OrderStatus, QRPayload } from '../types/api'
import { clearTokens, getErrorMessage, ordersApi } from '../lib/api'

const ORDER_TABS = [
  { status: 'PENDING', label: 'Bekleyen' },
  { status: 'ACCEPTED', label: 'Kabul Edilen' },
  { status: 'PREPARING', label: 'Hazırlanıyor' },
  { status: 'READY', label: 'Hazır' },
] as const

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Bekliyor',
  ACCEPTED: 'Kabul Edildi',
  PREPARING: 'Hazırlanıyor',
  READY: 'Hazır',
  DELIVERED: 'Teslim Edildi',
}

const STATUS_ACTIONS: Partial<
  Record<OrderStatus, { label: string; nextStatus: Exclude<OrderStatus, 'PENDING'> }>
> = {
  PENDING: { label: 'Kabul Et', nextStatus: 'ACCEPTED' },
  ACCEPTED: { label: 'Hazırlamaya Başla', nextStatus: 'PREPARING' },
  PREPARING: { label: 'Hazır', nextStatus: 'READY' },
}

const MILK_LABELS: Record<string, string> = {
  NONE: 'Sütsüz',
  WHOLE: 'Tam yağlı süt',
  OAT: 'Yulaf sütü',
  LACTOSE_FREE: 'Laktozsuz süt',
}

function isQrPayload(value: unknown): value is QRPayload {
  if (typeof value !== 'object' || value === null) return false

  const payload = value as Record<string, unknown>
  return (
    typeof payload.order_id === 'string' &&
    typeof payload.user_id === 'string' &&
    typeof payload.shop_id === 'string' &&
    typeof payload.created_at === 'string' &&
    typeof payload.signature === 'string'
  )
}

function formatOrderTime(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

interface QrScannerModalProps {
  order: Order
  onClose: () => void
  onDecoded: (text: string, order: Order) => void
}

function QrScannerModal({ order, onClose, onDecoded }: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraError, setCameraError] = useState('')
  const [cameraLoading, setCameraLoading] = useState(true)
  const [cameraAttempt, setCameraAttempt] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let active = true
    let scanned = false
    let controls: { stop: () => void } | undefined
    async function startScanner(videoElement: HTMLVideoElement) {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        if (!active) return
        const reader = new BrowserQRCodeReader()
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoElement,
          (result, _error, scanControls) => {
            controls = scanControls
            if (result && active && !scanned) {
              scanned = true
              scanControls.stop()
              onDecoded(result.getText(), order)
            }
          },
        )
        if (active) setCameraLoading(false)
        if (!active) controls.stop()
      } catch (error: unknown) {
        if (active) {
          const detail = error instanceof Error ? ` ${error.message}` : ''
          setCameraLoading(false)
          setCameraError(
            `Kameraya erişilemedi. İzinleri kontrol edip tekrar deneyin.${detail}`,
          )
        }
      }
    }

    void startScanner(video)

    return () => {
      active = false
      controls?.stop()
    }
  }, [cameraAttempt, onDecoded, order])

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="qr-scanner-title"
        aria-modal="true"
        className="scanner-modal"
        role="dialog"
      >
        <button
          aria-label="QR okuyucuyu kapat"
          className="modal-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <h2 id="qr-scanner-title">Teslim QR kodunu okut</h2>
        <p className="muted">
          {order.product_name} · {order.customer_name}
        </p>
        <video className="qr-scanner-video" ref={videoRef} muted playsInline />
        {cameraLoading && <LoadingState message="Kamera başlatılıyor…" />}
        <p className="scanner-help">
          Sipariş ekranındaki QR kodu kameranın önünde tutun. Kamera açılmıyorsa
          tarayıcı izinlerini kontrol edin ve sayfayı localhost veya HTTPS
          üzerinden açın.
        </p>
        {cameraError && (
          <ErrorState
            message={cameraError}
            onRetry={() => {
              setCameraError('')
              setCameraLoading(true)
              setCameraAttempt((attempt) => attempt + 1)
            }}
            title="Kamera açılamadı"
          />
        )}
        <button className="secondary" onClick={onClose} type="button">
          Kapat
        </button>
      </section>
    </div>
  )
}

export function ShopOrdersPage() {
  const navigate = useNavigate()
  const showToast = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [activeStatus, setActiveStatus] =
    useState<(typeof ORDER_TABS)[number]['status']>('PENDING')
  const [isLoading, setIsLoading] = useState(true)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [scanningOrder, setScanningOrder] = useState<Order | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    let active = true
    let timer: number | undefined

    async function refreshOrders() {
      try {
        const result = await ordersApi.shopOrders()
        if (active) {
          setOrders(
            result.sort(
              (first, second) =>
                new Date(second.created_at).getTime() -
                new Date(first.created_at).getTime(),
            ),
          )
          setError('')
          setIsLoading(false)
        }
      } catch (requestError) {
        if (active) {
          setError(getErrorMessage(requestError))
          setIsLoading(false)
        }
      } finally {
        if (active) {
          timer = window.setTimeout(() => void refreshOrders(), 5000)
        }
      }
    }

    void refreshOrders()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [requestVersion])

  function retryOrders() {
    setIsLoading(true)
    setError('')
    setRequestVersion((version) => version + 1)
  }

  async function advanceOrder(order: Order, nextStatus: Exclude<OrderStatus, 'PENDING'>) {
    setBusyOrderId(order.public_id)
    setError('')
    try {
      const updated = await ordersApi.updateStatus(order.public_id, nextStatus)
      setOrders((current) =>
        current.map((item) => (item.public_id === updated.public_id ? updated : item)),
      )
      if (updated.status !== 'DELIVERED') setActiveStatus(updated.status)
      showToast(
        updated.status === 'DELIVERED'
          ? 'QR kod doğrulandı; sipariş teslim edildi.'
          : `Sipariş durumu: ${STATUS_LABELS[updated.status]}.`,
        'success',
      )
    } catch (requestError) {
      showToast(getErrorMessage(requestError), 'error')
    } finally {
      setBusyOrderId(null)
    }
  }

  const handleQrDecoded = useCallback(async (text: string, order: Order) => {
    setScanningOrder(null)
    setBusyOrderId(order.public_id)
    setError('')

    let payload: QRPayload
    try {
      const parsed: unknown = JSON.parse(text)
      if (!isQrPayload(parsed)) {
        showToast('QR kodun içeriği tanınmadı. Lütfen sipariş QR kodunu okutun.', 'error')
        setBusyOrderId(null)
        return
      }
      payload = parsed
    } catch {
      showToast('QR kod okunamadı. Lütfen geçerli sipariş QR kodunu okutun.', 'error')
      setBusyOrderId(null)
      return
    }

    if (payload.order_id !== order.public_id) {
      showToast('Okutulan QR kod bu siparişe ait değil.', 'error')
      setBusyOrderId(null)
      return
    }

    try {
      const verification = await ordersApi.verifyQr(order.public_id, payload)
      if (!verification.valid) {
        showToast(verification.message || 'QR kod doğrulanamadı.', 'error')
        return
      }
      const updated = await ordersApi.updateStatus(order.public_id, 'DELIVERED')
      setOrders((current) =>
        current.map((item) => (item.public_id === updated.public_id ? updated : item)),
      )
      setActiveStatus('READY')
      showToast('QR kod doğrulandı; sipariş teslim edildi.', 'success')
    } catch (requestError) {
      showToast(getErrorMessage(requestError), 'error')
    } finally {
      setBusyOrderId(null)
    }
  }, [showToast])

  function signOut() {
    clearTokens()
    navigate('/login', { replace: true })
  }

  const visibleOrders = orders.filter((order) => order.status === activeStatus)

  return (
    <div className="owner-shell">
      <header className="owner-header">
        <div className="owner-header-content">
          <a className="brand" href="/owner/orders">
            KahveCell
          </a>
          <span className="owner-header-title">Dükkân sahibi paneli</span>
          <button className="secondary" onClick={signOut} type="button">
            Çıkış yap
          </button>
        </div>
      </header>

      <main className="owner-page">
        <div className="owner-page-heading">
          <div>
            <p className="shop-explorer-eyebrow">Sipariş yönetimi</p>
            <h1>Dükkân siparişleri</h1>
            <p className="muted">Siparişler yaklaşık 5 saniyede bir yenilenir.</p>
          </div>
          <button className="secondary" onClick={retryOrders} type="button">
            Yenile
          </button>
        </div>

        {error && (
          <ErrorState message={error} onRetry={retryOrders} title="Siparişler yüklenemedi" />
        )}

        <div aria-label="Sipariş durumuna göre filtrele" className="owner-tabs" role="tablist">
          {ORDER_TABS.map((tab) => {
            const count = orders.filter((order) => order.status === tab.status).length
            return (
              <button
                aria-selected={activeStatus === tab.status}
                className={`owner-tab${activeStatus === tab.status ? ' active' : ''}`}
                key={tab.status}
                onClick={() => setActiveStatus(tab.status)}
                role="tab"
                type="button"
              >
                {tab.label} <span>{count}</span>
              </button>
            )
          })}
        </div>

        {isLoading ? (
          <LoadingState message="Siparişler yükleniyor…" />
        ) : error ? null : visibleOrders.length === 0 ? (
          <EmptyState
            action={
              <button className="secondary" onClick={retryOrders} type="button">
                Siparişleri yenile
              </button>
            }
            message="Yeni siparişler otomatik olarak birkaç saniyede bir burada görünür."
            title={`${ORDER_TABS.find((tab) => tab.status === activeStatus)?.label} sipariş yok`}
          />
        ) : (
          <div className="owner-order-list">
            {visibleOrders.map((order) => {
              const action = STATUS_ACTIONS[order.status]
              const isBusy = busyOrderId === order.public_id
              return (
                <article className="owner-order-card" key={order.public_id}>
                  <div className="owner-order-heading">
                    <div>
                      <p className="owner-order-shop">{order.shop_name}</p>
                      <h2>{order.product_name}</h2>
                    </div>
                    <span className={`order-status-pill status-${order.status.toLowerCase()}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </div>
                  <div className="owner-order-details">
                    <p>
                      <strong>Müşteri:</strong> {order.customer_name} · {order.customer_phone}
                    </p>
                    <p>
                      <strong>Özelleştirme:</strong> {order.size} boy ·{' '}
                      {MILK_LABELS[order.customizations.milk] ?? order.customizations.milk} ·{' '}
                      {order.customizations.sugar} şeker ·{' '}
                      {order.customizations.extra_shot ? 'ek shot var' : 'ek shot yok'}
                    </p>
                    <p>
                      <strong>Sipariş zamanı:</strong>{' '}
                      <time dateTime={order.created_at}>{formatOrderTime(order.created_at)}</time>
                    </p>
                  </div>
                  {action && (
                    <button
                      disabled={isBusy}
                      onClick={() => void advanceOrder(order, action.nextStatus)}
                      type="button"
                    >
                      {isBusy ? 'Güncelleniyor…' : action.label}
                    </button>
                  )}
                  {order.status === 'READY' && (
                    <button
                      disabled={isBusy}
                      onClick={() => {
                        setError('')
                        setScanningOrder(order)
                      }}
                      type="button"
                    >
                      {isBusy ? 'Doğrulanıyor…' : 'QR Okut'}
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </main>

      {scanningOrder && (
        <QrScannerModal
          onClose={() => setScanningOrder(null)}
          onDecoded={handleQrDecoded}
          order={scanningOrder}
        />
      )}
    </div>
  )
}
