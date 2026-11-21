import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShopMap } from './ShopMap'
import { EmptyState, ErrorState, LoadingState } from './PageStates'
import { getErrorMessage, shopsApi } from '../lib/api'
import { getUserLocation, type UserLocation } from '../lib/location'
import type { Shop } from '../types/api'

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function formatDistance(distance: number | null): string {
  return distance === null
    ? 'Mesafe bilgisi yok'
    : `${distance.toLocaleString('tr-TR', {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      })} km`
}

export function ShopExplorer() {
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [shops, setShops] = useState<Shop[]>([])
  const [query, setQuery] = useState('')
  const [loadingShops, setLoadingShops] = useState(true)
  const [error, setError] = useState('')
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    let active = true
    getUserLocation().then((currentLocation) => {
      if (active) {
        setLocation(currentLocation)
      }
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!location) {
      return
    }

    let active = true
    shopsApi
      .list(location)
      .then((result) => {
        if (active) {
          setShops(result)
          setError('')
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(getErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (active) {
          setLoadingShops(false)
        }
      })

    return () => {
      active = false
    }
  }, [location, requestVersion])

  function retryShops() {
    setError('')
    setLoadingShops(true)
    setRequestVersion((version) => version + 1)
  }

  const filteredShops = useMemo(() => {
    const normalizedQuery = normalizeSearch(query.trim())
    if (!normalizedQuery) {
      return shops
    }
    return shops.filter((shop) =>
      normalizeSearch(`${shop.name} ${shop.address}`).includes(normalizedQuery),
    )
  }, [query, shops])

  return (
    <div className="shop-explorer">
      <header className="shop-explorer-header">
        <div>
          <p className="shop-explorer-eyebrow">KahveCell</p>
          <h1>Yakındaki kahveciler</h1>
          <p className="shop-location-note">
            {location?.isCurrent
              ? 'Yakınındaki dükkânlar konumuna göre sıralandı.'
              : location
                ? 'Konum izni alınamadı; Ankara Kızılay konumu kullanılıyor.'
                : 'Konumun alınıyor…'}
          </p>
        </div>
        <label className="shop-search">
          <span className="visually-hidden">Dükkân ara</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Dükkân veya adres ara"
            type="search"
            value={query}
          />
        </label>
      </header>

      <div className="shop-explorer-grid">
        <section
          aria-label="Dükkân listesi"
          className="shop-results-panel"
        >
          <div className="shop-results-heading">
            <h2>Dükkânlar</h2>
            {!loadingShops && !error && (
              <span>{filteredShops.length}</span>
            )}
          </div>
          {loadingShops ? (
            <LoadingState message="Dükkânlar yükleniyor…" />
          ) : error ? (
            <ErrorState message={error} onRetry={retryShops} title="Dükkânlar yüklenemedi" />
          ) : filteredShops.length === 0 ? (
            <EmptyState
              action={
                query ? (
                  <button
                    className="secondary"
                    onClick={() => setQuery('')}
                    type="button"
                  >
                    Aramayı temizle
                  </button>
                ) : (
                  <button className="secondary" onClick={retryShops} type="button">
                    Yeniden kontrol et
                  </button>
                )
              }
              message={
                query
                  ? 'Farklı bir dükkân adı veya adresle aramayı deneyebilirsin.'
                  : 'Biraz sonra yeniden kontrol edebilir veya konumunu değiştirebilirsin.'
              }
              title={query ? 'Aramana uygun dükkân yok' : 'Henüz dükkân eklenmemiş'}
            />
          ) : (
            <div className="shop-results-list">
              {filteredShops.map((shop) => (
              <article className="shop-result-card" key={shop.id}>
                <h3>{shop.name}</h3>
                <p className="shop-result-address">{shop.address}</p>
                <div className="shop-result-meta">
                  <span>
                    <span aria-hidden="true">★</span>{' '}
                    {shop.rating === null
                      ? 'Henüz puan yok'
                      : shop.rating.toFixed(1)}
                  </span>
                  <span>{formatDistance(shop.distance_km)}</span>
                </div>
                <Link className="button secondary shop-menu-link" to={`/shops/${shop.id}`}>
                  Menüyü Gör
                </Link>
              </article>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Dükkân haritası" className="shop-map-panel">
          {!location ? (
            <LoadingState
              message="Harita konum bilgisi bekleniyor…"
            />
          ) : error && shops.length === 0 ? (
            <EmptyState
              action={
                <button className="secondary" onClick={retryShops} type="button">
                  Haritayı yeniden yükle
                </button>
              }
              message="Dükkânlar yüklendikten sonra konumları haritada görünecek."
              title="Harita henüz hazır değil"
            />
          ) : (
            <ShopMap shops={filteredShops} userLocation={location} />
          )}
        </section>
      </div>
    </div>
  )
}
