import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { getErrorMessage, shopsApi } from '../lib/api'
import { getUserLocation } from '../lib/location'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates'
import type { Product, ShopDetail } from '../types/api'

const MENU_CATEGORIES = [
  'Espresso Bazlı',
  'Filtre Kahveler',
  'Soğuk İçecekler',
  'Diğer',
] as const

type MenuCategory = (typeof MENU_CATEGORIES)[number]

function getProductCategory(product: Product): MenuCategory {
  const name = product.name.toLocaleLowerCase('tr-TR')
  if (/filtre|filter|v60|chemex/.test(name)) return 'Filtre Kahveler'
  if (/cold|iced|soğuk|frappe|limonata/.test(name)) return 'Soğuk İçecekler'
  if (/espresso|americano|cappuccino|latte|mocha|macchiato/.test(name)) {
    return 'Espresso Bazlı'
  }
  return 'Diğer'
}

function formatDistance(distance: number | null): string {
  return distance === null
    ? 'Mesafe bilgisi yok'
    : `${distance.toLocaleString('tr-TR', {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      })} km`
}

export function ShopDetailPage() {
  const { shopId } = useParams()
  const parsedShopId = Number(shopId)
  const validShopId = Number.isInteger(parsedShopId) && parsedShopId > 0
  const [shop, setShop] = useState<ShopDetail | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [requestVersion, setRequestVersion] = useState(0)
  const [loadedShopId, setLoadedShopId] = useState<number | null>(null)

  useEffect(() => {
    if (!validShopId) return

    let active = true
    getUserLocation()
      .then((location) => shopsApi.detail(parsedShopId, location))
      .then((result) => {
        if (active) {
          setShop(result)
          setError('')
          setNotFound(false)
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          if (
            axios.isAxiosError(requestError) &&
            requestError.response?.status === 404
          ) {
            setNotFound(true)
          } else {
            setNotFound(false)
            setError(getErrorMessage(requestError))
          }
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
          setLoadedShopId(parsedShopId)
        }
      })

    return () => {
      active = false
    }
  }, [parsedShopId, requestVersion, validShopId])

  function retryShop() {
    setLoading(true)
    setError('')
    setNotFound(false)
    setRequestVersion((version) => version + 1)
  }

  if (!validShopId) {
    return (
      <EmptyState
        action={<Link className="button" to="/shops">Dükkânlara göz at</Link>}
        message="Dükkân listesinden geçerli bir dükkân seçerek devam edebilirsin."
        title="Dükkân numarası geçersiz"
      />
    )
  }
  if (loading || loadedShopId !== parsedShopId) {
    return <LoadingState message="Dükkân bilgisi yükleniyor…" />
  }
  if (notFound) {
    return (
      <EmptyState
        action={<Link className="button" to="/shops">Dükkânlara dön</Link>}
        message="Başka bir dükkân seçerek menüsüne göz atabilirsin."
        title="Bu dükkân bulunamadı"
      />
    )
  }
  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={retryShop}
        title="Dükkân bilgisi yüklenemedi"
      />
    )
  }
  if (!shop) {
    return (
      <EmptyState
        action={<Link className="button" to="/shops">Dükkânlara dön</Link>}
        message="Dükkânlar listesinde başka seçeneklere bakabilirsin."
        title="Dükkân bilgisi bulunamadı"
      />
    )
  }

  const groupedMenu = MENU_CATEGORIES.map((category) => ({
    category,
    products: shop.menu.filter(
      (product) => getProductCategory(product) === category,
    ),
  }))

  return (
    <div className="stack">
      <header className="shop-detail-header">
        <p className="shop-explorer-eyebrow">Dükkân bilgileri</p>
        <h1>{shop.name}</h1>
        <p className="shop-detail-address">{shop.address}</p>
        <div className="shop-detail-meta">
          <span>
            <strong>Çalışma saatleri</strong>
            {shop.opening_hours ?? 'Bilgi yok'}
          </span>
          <span>
            <strong>Puan</strong>
            {shop.rating === null ? 'Henüz puan yok' : shop.rating.toFixed(1)}
          </span>
          <span>
            <strong>Mesafe</strong>
            {formatDistance(shop.distance_km)}
          </span>
        </div>
      </header>

      <section className="panel stack" aria-label="Dükkân menüsü">
        <header className="page-heading">
          <h2>Menü</h2>
          <p>Bir ürün seçerek siparişini özelleştirebilirsin.</p>
        </header>
        {shop.menu.length === 0 ? (
          <EmptyState
            action={<Link className="button secondary" to="/shops">Diğer dükkânlara bak</Link>}
            message="Menü güncellendiğinde ürünleri buradan sipariş edebilirsin."
            title="Menü şimdilik boş"
          />
        ) : (
          <div className="menu-categories">
            {groupedMenu.map(({ category, products }) => (
              <section className="menu-category" key={category}>
                <h3>{category}</h3>
                {products.length === 0 ? (
                  <p className="muted">Bu kategoride ürün bulunmuyor.</p>
                ) : (
                  <ul className="menu-list">
                    {products.map((product) => (
                      <li className="menu-item" key={product.id}>
                        <span className="menu-product-info">
                          <strong>{product.name}</strong>
                          {product.description && (
                            <span className="muted">{product.description}</span>
                          )}
                        </span>
                        <span className="menu-product-action">
                          <strong>{product.price.toFixed(2)} TL</strong>
                          {product.is_available ? (
                            <Link
                              className="button menu-order-button"
                              to={`/orders/new?shopId=${shop.id}&productId=${product.id}`}
                            >
                              Sipariş Ver
                            </Link>
                          ) : (
                            <button className="secondary" disabled type="button">
                              Satışta değil
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
