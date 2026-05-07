'use client'

import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'

// Fix para iconos por defecto de Leaflet en Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface BusMapProps {
  center: [number, number]
  zoom?: number
  userLocation?: [number, number] | null
  nearestStop?: {
    name: string
    coordinates: {
      latitude: number
      longitude: number
    }
  } | null
}

const BusMap = ({
  center,
  zoom = 13,
  userLocation,
  nearestStop,
}: BusMapProps) => {
  // Crear iconos personalizados
  const userIcon = L.divIcon({
    className: 'custom-user-marker',
    html: `
      <div class="relative flex items-center justify-center">
        <div class="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg"></div>
        <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-blue-400/30 rounded-full animate-pulse"></div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  })

  const stopIcon = L.divIcon({
    className: 'custom-stop-marker',
    html: `
      <div class="relative flex items-center justify-center">
        <div class="w-8 h-8 bg-green-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
          <span class="text-white text-sm font-bold">🚌</span>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })

  return (
    <div className="w-full h-96 rounded-lg overflow-hidden border border-border">
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        scrollWheelZoom={false}
      >
        {/* Capa de OpenStreetMap */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Marcador de ubicación del usuario */}
        {userLocation && (
          <Marker position={userLocation} icon={userIcon}>
            <Popup>
              <div className="text-sm p-1 min-w-32">
                <strong className="text-blue-600">📍 Tu ubicación</strong>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Marcador de parada más cercana */}
        {nearestStop && (
          <Marker
            position={[nearestStop.coordinates.latitude, nearestStop.coordinates.longitude]}
            icon={stopIcon}
          >
            <Popup>
              <div className="text-sm p-1 min-w-32">
                <strong className="text-green-600">🚌 Parada más cercana</strong>
                <br />
                {nearestStop.name}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}

export default BusMap
