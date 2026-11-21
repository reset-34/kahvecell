import {
  divIcon,
  latLngBounds,
  type LatLngExpression,
} from 'leaflet'
import { useEffect } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { Shop } from '../types/api'

const shopIcon = divIcon({
  className: '',
  html: '<div class="map-marker"><span>K</span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
})
const userIcon = divIcon({
  className: '',
  html: '<div class="map-user-marker"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

interface ShopMapProps {
  shops: Shop[]
  userLocation: {
    latitude: number
    longitude: number
  }
}

function FitMarkers({
  shops,
  userLocation,
}: ShopMapProps) {
  const map = useMap()

  useEffect(() => {
    const bounds = latLngBounds([
      [userLocation.latitude, userLocation.longitude],
    ])
    shops.forEach((shop) => bounds.extend([shop.latitude, shop.longitude]))
    map.fitBounds(bounds, { animate: false, maxZoom: 13, padding: [36, 36] })
  }, [map, shops, userLocation])

  return null
}

export function ShopMap({ shops, userLocation }: ShopMapProps) {
  const userPosition: LatLngExpression = [
    userLocation.latitude,
    userLocation.longitude,
  ]

  return (
    <MapContainer
      center={userPosition}
      className="shop-map"
      scrollWheelZoom
      zoom={12}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitMarkers shops={shops} userLocation={userLocation} />
      <Marker icon={userIcon} position={userPosition}>
        <Popup>Senin konumun</Popup>
      </Marker>
      {shops.map((shop) => (
        <Marker
          icon={shopIcon}
          key={shop.id}
          position={[shop.latitude, shop.longitude]}
        >
          <Popup>
            <strong>{shop.name}</strong>
            <br />
            {shop.address}
            <br />
            <Link to={`/shops/${shop.id}`}>Dükkân detayını aç</Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
