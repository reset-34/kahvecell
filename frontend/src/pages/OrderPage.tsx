import axios from 'axios'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates'
import { useToast } from '../components/useToast'
import {
  getErrorMessage,
  ordersApi,
  shopsApi,
  subscriptionsApi,
} from '../lib/api'
import { getUserLocation } from '../lib/location'
import type { ShopDetail, Subscription } from '../types/api'

type MilkType = 'NONE' | 'WHOLE' | 'OAT' | 'LACTOSE_FREE'
type CupSize = 'S' | 'M' | 'L'

export function OrderPage() {
  const [searchParams] = useSearchParams()
  const shopId = Number(searchParams.get('shopId'))
  const productId = Number(searchParams.get('productId'))
  const validShopId = Number.isInteger(shopId) && shopId > 0
  const [shop, setShop] = useState<ShopDetail | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [subscriptionExpired, setSubscriptionExpired] = useState(false)
  const [shopLoading, setShopLoading] = useState(true)
  const [subscriptionLoading, setSubscriptionLoading] = useState(true)
  const [size, setSize] = useState<CupSize>('M')
  const [sugar, setSugar] = useState(0)
  const [milk, setMilk] = useState<MilkType>('WHOLE')
  const [extraShot, setExtraShot] = useState(false)
  const [shopError, setShopError] = useState('')
  const [subscriptionError, setSubscriptionError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [requestVersion, setRequestVersion] = useState(0)
  const [loadedShopKey, setLoadedShopKey] = useState('')
  const navigate = useNavigate()
  const showToast = useToast()

  useEffect(() => {
    if (!validShopId) return

    let active = true
    const requestKey = `${shopId}:${productId}`
    getUserLocation()
      .then((location) => shopsApi.detail(shopId, location))
      .then((result) => {
        if (active) {
          setShop(result)
          setShopError('')
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setShopError(getErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (active) {
          setShopLoading(false)
          setLoadedShopKey(requestKey)
        }
      })

    return () => {
      active = false
    }
  }, [productId, requestVersion, shopId, validShopId])

  useEffect(() => {
    let active = true
    subscriptionsApi
      .current()
      .then((result) => {
        if (active) {
          setSubscription(result)
          setSubscriptionExpired(
            Date.parse(result.expires_at) <= Date.now(),
          )
        }
      })
      .catch((requestError: unknown) => {
        if (
          axios.isAxiosError(requestError) &&
          requestError.response?.status === 404
        ) {
          if (active) {
            setSubscription(null)
          }
          return
        }
        if (active) {
          setSubscriptionError(getErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (active) {
          setSubscriptionLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [requestVersion])

  function retryData() {
    setShopLoading(true)
    setSubscriptionLoading(true)
    setShopError('')
    setSubscriptionError('')
    setRequestVersion((version) => version + 1)
  }

  const product = shop?.menu.find((item) => item.id === productId)
  const subscriptionActive =
    subscription?.status === 'ACTIVE' && !subscriptionExpired
  const hasCredits =
    subscription?.remaining_credits === null ||
    (subscription?.remaining_credits !== undefined &&
      subscription.remaining_credits > 0)
  const canOrder =
    Boolean(subscriptionActive && hasCredits && product?.is_available) &&
    !subscriptionLoading &&
    !shopLoading
  const activeSubscription =
    subscriptionActive && subscription !== null ? subscription : null
  const remainingAfterOrder =
    activeSubscription?.remaining_credits === null
      ? null
      : Math.max((activeSubscription?.remaining_credits ?? 0) - 1, 0)

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canOrder || !product) return
    setSubmitting(true)
    try {
      const order = await ordersApi.create({
        shop_id: shopId,
        product_id: product.id,
        size,
        sugar,
        milk,
        extra_shot: extraShot,
      })
      navigate(`/orders/${order.public_id}/qr`)
    } catch (requestError) {
      showToast(getErrorMessage(requestError), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!validShopId) {
    return (
      <EmptyState
        action={<Link className="button" to="/shops">Dükkânları gör</Link>}
        message="Menüden bir ürün seçerek sipariş akışına başlayabilirsin."
        title="Önce bir dükkân seç"
      />
    )
  }
  if (shopLoading || loadedShopKey !== `${shopId}:${productId}`) {
    return <LoadingState message="Dükkân ve ürün bilgileri yükleniyor…" />
  }
  if (shopError) {
    return <ErrorState message={shopError} onRetry={retryData} title="Dükkân bilgisi yüklenemedi" />
  }
  if (!shop) {
    return (
      <EmptyState
        action={<Link className="button" to="/shops">Dükkânlara dön</Link>}
        message="Başka bir dükkân seçerek sipariş verebilirsin."
        title="Dükkân bulunamadı"
      />
    )
  }
  if (!product) {
    return (
      <EmptyState
        action={<Link className="button" to={`/shops/${shop.id}`}>Menüye dön</Link>}
        message="Dükkân menüsünden mevcut bir ürün seçerek devam edebilirsin."
        title="Seçilen ürün bulunamadı"
      />
    )
  }

  const subscriptionMessage = subscriptionLoading
    ? 'Aboneliğin kontrol ediliyor…'
    : !activeSubscription
      ? 'Sipariş vermek için aktif bir aboneliğin olmalı.'
      : !hasCredits
        ? 'Bu dönem için kahve kredin kalmadı.'
        : null

  return (
    <div className="order-page stack">
      <header className="page-heading">
        <h1>Siparişini özelleştir</h1>
        <p>{shop.name}</p>
      </header>

      <section className="panel order-product-summary">
        <div>
          <p className="shop-explorer-eyebrow">Seçtiğin ürün</p>
          <h2>{product.name}</h2>
          {product.description && <p className="muted">{product.description}</p>}
        </div>
        <strong>{product.price.toFixed(2)} TL</strong>
      </section>

      <section className="panel">
        <h2>Kahveni özelleştir</h2>
        <form className="form-grid order-form" onSubmit={submitOrder}>
          <div className="form-field">
            <label htmlFor="order-size">Boyut</label>
            <select
              id="order-size"
              onChange={(event) => setSize(event.target.value as CupSize)}
              value={size}
            >
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="order-milk">Süt tipi</label>
            <select
              id="order-milk"
              onChange={(event) => setMilk(event.target.value as MilkType)}
              value={milk}
            >
              <option value="WHOLE">Normal süt</option>
              <option value="OAT">Yulaf sütü</option>
              <option value="LACTOSE_FREE">Laktozsuz süt</option>
              <option value="NONE">Sütsüz</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="order-sugar">Şeker miktarı (0-5)</label>
            <input
              id="order-sugar"
              max={5}
              min={0}
              onChange={(event) => setSugar(Number(event.target.value))}
              type="number"
              value={sugar}
            />
          </div>
          <label className="order-extra-shot">
            <input
              checked={extraShot}
              onChange={(event) => setExtraShot(event.target.checked)}
              type="checkbox"
            />
            Ek shot
          </label>

          <aside
            className={`credit-panel${subscriptionMessage ? ' needs-plan' : ''}`}
            aria-live="polite"
          >
            <strong>
              {subscriptionLoading
                ? 'Kalan kredi kontrol ediliyor…'
                : !activeSubscription
                  ? 'Aktif abonelik yok'
                  : activeSubscription?.remaining_credits === null
                    ? 'Kalan kredi: Sınırsız'
                    : `Kalan kredi: ${activeSubscription?.remaining_credits}`}
            </strong>
            {subscriptionError ? (
              <ErrorState
                message={subscriptionError}
                onRetry={retryData}
                title="Abonelik bilgisi yüklenemedi"
              />
            ) : subscriptionLoading ? (
              <LoadingState message="Abonelik ve kredi bilgisi kontrol ediliyor…" />
            ) : subscriptionMessage ? (
              <>
                <p>{subscriptionMessage}</p>
                <Link className="button secondary" to="/subscription">
                  Abonelik sayfasına git
                </Link>
              </>
            ) : (
              <p>
                {remainingAfterOrder === null
                  ? 'Bu sipariş sonrası kredin sınırsız kalacak.'
                  : `Bu sipariş sonrası ${remainingAfterOrder} kredi kalacak.`}
              </p>
            )}
          </aside>

          <button
            className="order-submit"
            disabled={!canOrder || submitting}
            type="submit"
          >
            {submitting ? 'Sipariş veriliyor…' : 'Siparişi onayla'}
          </button>
        </form>
      </section>
    </div>
  )
}
