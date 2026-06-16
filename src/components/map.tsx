'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useMap } from 'react-leaflet'

// Variable global para cachear la instancia de Leaflet
let leafletInstance: any = null
let leafletPromise: Promise<any> | null = null

// Función para obtener Leaflet de forma segura (optimizada con cache de promesa)
async function getLeaflet() {
  if (typeof window === 'undefined') return null

  // Usar cache de promesa para evitar múltiples llamadas simultáneas
  if (!leafletPromise) {
    leafletPromise = import('leaflet').then((L) => {
      // Fix para iconos por defecto de Leaflet en Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      leafletInstance = L
      return L
    })
  }

  return leafletPromise
}

// Importar componentes de react-leaflet de forma dinámica
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

// Componente para controles de zoom personalizados
function ZoomControls() {
  const map = useMap()

  const handleZoomIn = () => {
    map.zoomIn()
  }

  const handleZoomOut = () => {
    map.zoomOut()
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: '80px',
      right: '16px',
      zIndex: 1000,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '2px solid rgba(255, 255, 255, 0.9)',
    }}>
      <button
        onClick={handleZoomIn}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          backgroundColor: 'white',
          cursor: 'pointer',
          border: 'none',
          borderBottom: '1px solid #E5E7EB',
          fontSize: '20px',
          fontWeight: 'bold',
          color: '#374151',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
        aria-label="Acercar"
        type="button"
      >
        +
      </button>
      <button
        onClick={handleZoomOut}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          backgroundColor: 'white',
          cursor: 'pointer',
          border: 'none',
          fontSize: '20px',
          fontWeight: 'bold',
          color: '#374151',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
        aria-label="Alejar"
        type="button"
      >
        −
      </button>
    </div>
  )
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

interface BusStop {
  id: string
  name: string
  lat: number
  lon: number
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
  plannedRoutesLength?: number | null
  selectedRoute?: PlannedRoute | null
  destinationCoordinates?: {
    name: string
    latitude: number
    longitude: number
    displayName?: string
  } | null
  routePath?: {
    walking?: [number, number][]
    bus?: [number, number][]
    direct?: [number, number][]
  } | null
  busStops?: Array<{
    id: string
    name: string
    lat: number
    lon: number
  }> | null
  isTracking?: boolean
  onMapInteraction?: () => void
  tripDistance?: number
  tripTime?: number
  showDistanceInfo?: boolean
}

const BusMap = ({
  center,
  zoom = 13,
  userLocation,
  nearestStop,
  plannedRoutes,
  plannedRoutesLength,
  selectedRoute,
  destinationCoordinates,
  routePath,
  busStops,
  isTracking,
  onMapInteraction,
  tripDistance = 0,
  tripTime = 0,
  showDistanceInfo = true,
}: BusMapProps) => {
  const [isMounted, setIsMounted] = useState(false)
  const [L, setL] = useState<any>(null)
  const [dbStops, setDbStops] = useState<any[]>([])
  const [loadingDbStops, setLoadingDbStops] = useState(false)
  const mapRef = useRef<any>(null)

  // Actualizar centro y zoom del mapa cuando cambian las props
  useEffect(() => {
    if (!mapRef.current || !center) return

    const map = mapRef.current
    const currentCenter = map.getCenter()
    const currentZoom = map.getZoom()

    // Solo actualizar si hay cambios significativos para evitar loops infinitos
    const centerChanged = !currentCenter || 
      Math.abs(currentCenter.lat - center[0]) > 0.0001 || 
      Math.abs(currentCenter.lng - center[1]) > 0.0001
    const zoomChanged = currentZoom !== zoom

    if (centerChanged || zoomChanged) {
      map.setView(center, zoom, { animate: true })
    }
  }, [center, zoom])

  useEffect(() => {
    let mounted = true

    const initLeaflet = async () => {
      try {
        const leaflet = await getLeaflet()
        if (mounted && leaflet) {
          setL(leaflet)
          setIsMounted(true)
        }
      } catch (error) {
        console.error('Error al cargar Leaflet:', error)
      }
    }

    initLeaflet()

    return () => {
      mounted = false
    }
  }, [])

  // Event listeners para detectar interacción del usuario con el mapa
  useEffect(() => {
    if (!mapRef.current || !isTracking || !onMapInteraction) return

    const map = mapRef.current
    const handlers = ['movestart', 'zoomstart', 'drag', 'zoom']

    handlers.forEach(event => {
      map.on(event, onMapInteraction)
    })

    return () => {
      handlers.forEach(event => {
        map.off(event, onMapInteraction)
      })
    }
  }, [mapRef.current, isTracking, onMapInteraction])

  // Cargar paradas de buses de la base de datos (solo cuando se planea una ruta)
  useEffect(() => {
    const fetchDbStops = async () => {
      // Solo cargar cuando hay una ruta planificada o cuando el usuario quiere ver paradas
      if (!userLocation || !plannedRoutesLength || plannedRoutesLength === 0) return

      try {
        setLoadingDbStops(true)
        // Reducir el radio de búsqueda de 25km a 10km para mejor rendimiento
        const response = await fetch(
          `/api/stops?lat=${userLocation[0]}&lon=${userLocation[1]}&radius=10`
        )
        const data = await response.json()

        if (data.success && data.stops) {
          setDbStops(data.stops)
        }
      } catch (error) {
        console.error('Error al cargar paradas de la base de datos:', error)
      } finally {
        setLoadingDbStops(false)
      }
    }

    // Debounce para evitar múltiples llamadas
    const timer = setTimeout(() => {
      fetchDbStops()
    }, 500)

    return () => {
      clearTimeout(timer)
    }
  }, [userLocation, plannedRoutesLength])

  // Crear iconos personalizados con useMemo para evitar recreaciones
  const userIcon = useMemo(() => {
    if (!L) return null
    return L.divIcon({
      className: 'custom-user-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-4 h-4 bg-[#0052B4] rounded-full border-2 border-white shadow-lg"></div>
          <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-blue-400/30 rounded-full animate-pulse"></div>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    })
  }, [L])

  // Icono del usuario cuando está en viaje (tracking) con información dinámica y animación fade intercalado
  const trackingIcon = useMemo(() => {
    if (!L) return null
    const formattedDistance = tripDistance >= 1000
      ? `${(tripDistance / 1000).toFixed(0)}km`
      : `${tripDistance.toFixed(0)}m`
    const formattedTime = `${tripTime.toFixed(0)}min`

    return L.divIcon({
      className: 'custom-tracking-marker',
      html: `
        <style>
          @keyframes fadeInOut {
            0%, 100% { opacity: 0; }
            50% { opacity: 1; }
          }
          @keyframes pulse-ring {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
          }
          @keyframes pulse-ring-inner {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.6; }
            100% { transform: translate(-50%, -50%) scale(1.2); opacity: 0; }
          }
          .tracking-info-fade-1 {
            animation: fadeInOut 3s ease-in-out infinite;
          }
          .tracking-info-fade-2 {
            animation: fadeInOut 3s ease-in-out infinite;
            animation-delay: 1.5s;
          }
          .tracking-pulse-ring {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: rgba(227, 24, 55, 0.3);
            animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            pointer-events: none;
          }
          .tracking-pulse-ring-2 {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: rgba(227, 24, 55, 0.2);
            animation: pulse-ring-inner 2s cubic-bezier(0.4, 0, 0.6, 1) infinite 0.5s;
            pointer-events: none;
          }
          .tracking-pulse-ring-3 {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: rgba(227, 24, 55, 0.15);
            animation: pulse-ring-inner 2s cubic-bezier(0.4, 0, 0.6, 1) infinite 1s;
            pointer-events: none;
          }
        </style>
        <div class="relative flex flex-col items-center justify-center">
          <div class="relative">
            <div class="w-7 h-7 bg-[#E31837] rounded-full border-3 border-white shadow-lg flex items-center justify-center relative z-10">
              <svg viewBox="0 0 24 24" class="w-4 h-4 text-white" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
            <div class="tracking-pulse-ring"></div>
            <div class="tracking-pulse-ring-2"></div>
            <div class="tracking-pulse-ring-3"></div>
          </div>
          ${showDistanceInfo ? `
          <div class="mt-2 bg-white/95 backdrop-blur-sm px-2 py-1 rounded-full shadow-md border border-red-200 whitespace-nowrap">
            <span class="text-xs font-bold text-[#E31837] tracking-info-fade-1">${formattedDistance}</span>
            <span class="text-xs font-bold text-[#0052B4] tracking-info-fade-2">${formattedTime}</span>
          </div>
          ` : ''}
        </div>
      `,
      iconSize: [80, 80],
      iconAnchor: [40, 40],
    })
  }, [L, tripDistance, tripTime, showDistanceInfo])

  const originIcon = useMemo(() => {
    if (!L) return null
    return L.divIcon({
      className: 'custom-origin-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-10 h-10 bg-[#0052B4] rounded-full border-3 border-white shadow-lg flex items-center justify-center">
            <span class="text-white text-lg font-bold">📍</span>
          </div>
          <div class="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-white px-2 py-1 rounded shadow-md text-xs font-semibold text-[#0052B4] whitespace-nowrap">
            Origen
          </div>
        </div>
      `,
      iconSize: [48, 64],
      iconAnchor: [24, 48],
    })
  }, [L])

  const stopIcon = useMemo(() => {
    if (!L) return null
    return L.divIcon({
      className: 'custom-stop-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-7 h-7 bg-[#10B981] rounded-full border-2 border-white shadow-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" class="w-4 h-4 text-white" fill="currentColor">
              <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })
  }, [L])

  // Icono especial para paradas de buses de la base de datos (resaltado)
  const busStationIcon = useMemo(() => {
    if (!L) return null
    return L.divIcon({
      className: 'custom-bus-station-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-9 h-9 bg-[#E31837] rounded-full border-3 border-white shadow-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" class="w-5 h-5 text-white" fill="currentColor">
              <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
            </svg>
          </div>
          <div class="absolute top-0 right-0 w-3 h-3 bg-[#FBBF24] rounded-full border-2 border-white shadow-md"></div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    })
  }, [L])

  const boardingIcon = useMemo(() => {
    if (!L) return null
    return L.divIcon({
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
  }, [L])

  const destinationIcon = useMemo(() => {
    if (!L) return null
    return L.divIcon({
      className: 'custom-destination-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-10 h-10 bg-[#E31837] rounded-full border-3 border-white shadow-lg flex items-center justify-center">
            <span class="text-white text-lg">🏁</span>
          </div>
          <div class="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-white px-2 py-1 rounded shadow-md text-xs font-semibold text-[#E31837] whitespace-nowrap">
            Destino
          </div>
        </div>
      `,
      iconSize: [48, 64],
      iconAnchor: [24, 48],
    })
  }, [L])

  // Crear polilínea para la ruta seleccionada
  const getRoutePolylines = () => {
    const polylines: Array<{
      positions: [number, number][]
      color: string
      weight: number
      dashArray?: string
    }> = []

    // Si hay ruta seleccionada con caminos reales
    if (selectedRoute && routePath) {
      // Segmento 1: Camino a pie desde ubicación del usuario hasta parada de embarque
      if (routePath.walking && routePath.walking.length > 0) {
        polylines.push({
          positions: routePath.walking,
          color: '#0052B4', // Azul para caminar
          weight: 5,
          dashArray: '10, 10',
        })
      }

      // Segmento 2: Ruta de autobús desde parada de embarque hasta destino
      if (routePath.bus && routePath.bus.length > 0) {
        polylines.push({
          positions: routePath.bus,
          color: '#16a34a', // Verde para autobús
          weight: 6,
        })
      }
    }
    // Fallback: Si no hay ruta con caminos reales pero hay ruta seleccionada, usar líneas rectas
    else if (selectedRoute && userLocation) {
      if (selectedRoute.boardingStop?.coordinates) {
        polylines.push({
          positions: [
            userLocation,
            [selectedRoute.boardingStop.coordinates.latitude, selectedRoute.boardingStop.coordinates.longitude]
          ],
          color: '#0052B4',
          weight: 5,
          dashArray: '10, 10',
        })
      }

      if (selectedRoute.boardingStop?.coordinates && selectedRoute.destinationStop?.coordinates) {
        polylines.push({
          positions: [
            [selectedRoute.boardingStop.coordinates.latitude, selectedRoute.boardingStop.coordinates.longitude],
            [selectedRoute.destinationStop.coordinates.latitude, selectedRoute.destinationStop.coordinates.longitude]
          ],
          color: '#16a34a',
          weight: 6,
        })
      }
    }
    // Si no hay ruta seleccionada pero hay destino seleccionado con camino directo
    else if (routePath?.direct && routePath.direct.length > 0) {
      polylines.push({
        positions: routePath.direct,
        color: '#E31837', // Rojo para conexión directa
        weight: 4,
        dashArray: '5, 5',
      })
    }
    // Fallback: Línea directa simple
    else if (userLocation && destinationCoordinates) {
      polylines.push({
        positions: [
          userLocation,
          [destinationCoordinates.latitude, destinationCoordinates.longitude]
        ],
        color: '#E31837',
        weight: 4,
        dashArray: '5, 5',
      })
    }

    return polylines
  }

  // No renderizar nada hasta que el componente esté montado en el cliente
  if (!isMounted || !L || !userIcon || !originIcon || !stopIcon || !boardingIcon || !destinationIcon || !busStationIcon) {
    return (
      <div className="w-full h-full min-h-[300px] rounded-lg overflow-hidden border border-[#E5E7EB] flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#E31837] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-[#6B7280]">Cargando mapa...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[300px] rounded-lg overflow-hidden">
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        scrollWheelZoom={false}
        zoomControl={false}
        ref={mapRef}
      >
        {/* Capa de OpenStreetMap */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Controles de zoom personalizados */}
        <ZoomControls />

        {/* Polilíneas de la ruta seleccionada o conexión directa */}
        {getRoutePolylines().map((polyline, index) => (
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

        {/* Marcador de origen (ubicación del usuario) */}
        {userLocation && (
          <Marker
            position={userLocation}
            icon={isTracking ? trackingIcon : (selectedRoute ? userIcon : originIcon)}
          >
            <Popup>
              <div className="text-sm p-1 min-w-32">
                <strong className={isTracking ? "text-[#E31837]" : "text-[#0052B4]"}>
                  {isTracking ? "🚗 Tu posición" : "📍 Origen"}
                </strong>
                <br />
                <span className="text-xs text-[#6B7280]">
                  {isTracking ? "Rastreando en tiempo real" : "Tu ubicación actual"}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Marcadores de paradas de buses de la base de datos (resaltados) */}
        {dbStops && dbStops.length > 0 && (
          <>
            {dbStops.map((stop) => (
              <Marker
                key={`db-${stop.id}`}
                position={[stop.latitude, stop.longitude]}
                icon={busStationIcon}
              >
                <Popup>
                  <div className="text-sm p-1 min-w-40">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 bg-[#E31837] rounded-full flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor">
                          <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
                        </svg>
                      </div>
                      <strong className="text-[#E31837]">Parada de Bus</strong>
                    </div>
                    <p className="font-semibold text-[#374151]">{stop.name}</p>
                    {stop.city && <p className="text-xs text-[#6B7280] mt-1">{stop.city}</p>}
                    {stop.distance !== undefined && (
                      <p className="text-xs text-[#0052B4] mt-1 font-medium">
                        {stop.distance.toFixed(1)} km de tu ubicación
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </>
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
                {selectedRoute.boardingStop.city && <><br /><span className="text-xs text-[#6B7280]">{selectedRoute.boardingStop.city}</span></>}
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
                <strong className="text-[#E31837]">🏁 Destino</strong>
                <br />
                {selectedRoute.destinationStop.name}
                {selectedRoute.destinationStop.city && <><br /><span className="text-xs text-[#6B7280]">{selectedRoute.destinationStop.city}</span></>}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Marcador de destino seleccionado */}
        {destinationCoordinates && (
          <Marker
            position={[destinationCoordinates.latitude, destinationCoordinates.longitude]}
            icon={destinationIcon}
          >
            <Popup>
              <div className="text-sm p-1 min-w-32">
                <strong className="text-[#E31837]">🏁 Destino</strong>
                <br />
                {destinationCoordinates.displayName || destinationCoordinates.name}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Marcador de parada más cercana (solo cuando no hay ruta ni destino seleccionado) */}
        {!selectedRoute && !destinationCoordinates && nearestStop && (
          <Marker
            position={[nearestStop.coordinates.latitude, nearestStop.coordinates.longitude]}
            icon={stopIcon}
          >
            <Popup>
              <div className="text-sm p-1 min-w-32">
                <strong className="text-[#10B981]">🚌 Parada más cercana</strong>
                <br />
                {nearestStop.name}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Marcadores de paradas de autobús de OpenStreetMap */}
        {busStops && busStops.length > 0 && (
          <>
            {busStops.map((stop) => (
              <Marker
                key={stop.id}
                position={[stop.lat, stop.lon]}
                icon={stopIcon}
              >
                <Popup>
                  <div className="text-sm p-1 min-w-32">
                    <strong className="text-[#10B981]">🚌 Parada</strong>
                    <br />
                    {stop.name || 'Sin nombre'}
                  </div>
                </Popup>
              </Marker>
            ))}
          </>
        )}
      </MapContainer>
    </div>
  )
}

export default BusMap