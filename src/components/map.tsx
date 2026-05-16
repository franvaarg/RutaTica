'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

// Importar componentes de react-leaflet de forma dinámica para evitar problemas de SSR
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
)
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
)
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
)
const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
)

// Variable global para cachear la instancia de Leaflet
let leafletInstance: any = null

// Función para obtener Leaflet de forma segura
async function getLeaflet() {
  if (typeof window === 'undefined') return null
  if (!leafletInstance) {
    const L = await import('leaflet')
    // Fix para iconos por defecto de Leaflet en Next.js
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })
    leafletInstance = L
  }
  return leafletInstance
}

interface RouteStop {
  name: string
  city: string | null
}

interface PlannedRoute {
  id: string
  boardingStop: RouteStop & { coordinates?: { latitude: number; longitude: number } }
  destinationStop: RouteStop & { coordinates?: { latitude: number; longitude: number } | null }
}

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
  plannedRoutes?: PlannedRoute[] | null
  selectedRoute?: PlannedRoute | null
  destinationCoordinates?: {
    name: string
    latitude: number
    longitude: number
    displayName?: string
  } | null
}

const BusMap = ({
  center,
  zoom = 13,
  userLocation,
  nearestStop,
  plannedRoutes,
  selectedRoute,
  destinationCoordinates,
}: BusMapProps) => {
  const [isMounted, setIsMounted] = useState(false)
  const [L, setL] = useState<any>(null)

  useEffect(() => {
    let mounted = true

    const initLeaflet = async () => {
      const leaflet = await getLeaflet()
      if (mounted && leaflet) {
        setL(leaflet)
        setIsMounted(true)
      }
    }

    initLeaflet()

    return () => {
      mounted = false
    }
  }, [])

  // No renderizar nada hasta que el componente esté montado en el cliente
  if (!isMounted || !L) {
    return (
      <div className="w-full h-full min-h-[300px] rounded-lg overflow-hidden border border-border flex items-center justify-center bg-muted">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-muted-foreground text-sm">Cargando mapa...</p>
        </div>
      </div>
    )
  }

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

  const boardingIcon = L.divIcon({
    className: 'custom-boarding-marker',
    html: `
      <div class="relative flex items-center justify-center">
        <div class="w-10 h-10 bg-orange-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
          <span class="text-white text-lg">⬆️</span>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })

  const destinationIcon = L.divIcon({
    className: 'custom-destination-marker',
    html: `
      <div class="relative flex items-center justify-center">
        <div class="w-10 h-10 bg-red-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
          <span class="text-white text-lg">🏁</span>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })

  // Crear polilínea para la ruta seleccionada
  const getRoutePolylines = () => {
    if (!selectedRoute || !userLocation) return []

    const polylines: Array<{
      positions: [number, number][]
      color: string
      weight: number
      dashArray?: string
    }> = []

    // Segmento 1: Camino a pie desde ubicación del usuario hasta parada de embarque
    if (selectedRoute.boardingStop?.coordinates) {
      polylines.push({
        positions: [
          userLocation,
          [selectedRoute.boardingStop.coordinates.latitude, selectedRoute.boardingStop.coordinates.longitude]
        ],
        color: '#3b82f6', // Azul para caminar
        weight: 5,
        dashArray: '10, 10',
      })
    }

    // Segmento 2: Ruta de autobús desde parada de embarque hasta destino
    if (selectedRoute.boardingStop?.coordinates && selectedRoute.destinationStop?.coordinates) {
      polylines.push({
        positions: [
          [selectedRoute.boardingStop.coordinates.latitude, selectedRoute.boardingStop.coordinates.longitude],
          [selectedRoute.destinationStop.coordinates.latitude, selectedRoute.destinationStop.coordinates.longitude]
        ],
        color: '#16a34a', // Verde para autobús
        weight: 6,
      })
    }

    return polylines
  }

  return (
    <div className="w-full h-full min-h-[300px] rounded-lg overflow-hidden border border-border">
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

        {/* Polilíneas de la ruta seleccionada */}
        {selectedRoute && getRoutePolylines().map((polyline, index) => (
          <Polyline
            key={index}
            positions={polyline.positions}
            pathOptions={{
              color: polyline.color,
              weight: polyline.weight,
              dashArray: polyline.dashArray,
              opacity: 0.8,
            }}
          />
        ))}

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

        {/* Marcador de parada de embarque */}
        {selectedRoute?.boardingStop?.coordinates && (
          <Marker
            position={[selectedRoute.boardingStop.coordinates.latitude, selectedRoute.boardingStop.coordinates.longitude]}
            icon={boardingIcon}
          >
            <Popup>
              <div className="text-sm p-1 min-w-32">
                <strong className="text-orange-600">⬆️ Sube aquí</strong>
                <br />
                {selectedRoute.boardingStop.name}
                {selectedRoute.boardingStop.city && <><br /><span className="text-xs text-muted-foreground">{selectedRoute.boardingStop.city}</span></>}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Marcador de destino */}
        {selectedRoute?.destinationStop?.coordinates && (
          <Marker
            position={[selectedRoute.destinationStop.coordinates.latitude, selectedRoute.destinationStop.coordinates.longitude]}
            icon={destinationIcon}
          >
            <Popup>
              <div className="text-sm p-1 min-w-32">
                <strong className="text-red-600">🏁 Destino</strong>
                <br />
                {selectedRoute.destinationStop.name}
                {selectedRoute.destinationStop.city && <><br /><span className="text-xs text-muted-foreground">{selectedRoute.destinationStop.city}</span></>}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Marcador de parada más cercana (solo cuando no hay ruta seleccionada) */}
        {!selectedRoute && nearestStop && (
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

        {/* Marcador de destino seleccionado (cuando se selecciona del autocompletado) */}
        {!selectedRoute && destinationCoordinates && (
          <Marker
            position={[destinationCoordinates.latitude, destinationCoordinates.longitude]}
            icon={destinationIcon}
          >
            <Popup>
              <div className="text-sm p-1 min-w-32">
                <strong className="text-red-600">🎯 Destino</strong>
                <br />
                {destinationCoordinates.displayName || destinationCoordinates.name}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}

export default BusMap
