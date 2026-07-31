'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Bus, Navigation, Clock, DollarSign, ArrowRight, Loader2, Map, Home, Star, Bell, Menu, Search, Heart, User, Wallet, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import BusMap from '@/components/map'
import LocationAutocomplete from '@/components/location-autocomplete'

interface PlanatedRoute {
  id: string
  company: string
  routeNumber: string
  origin: string
  destination: string
  price: number
  currency: string
  distanceKm?: number | null
  durationMin?: number | null
  boardingStop: {
    name: string
    city: string | null
    coordinates?: {
      latitude: number
      longitude: number
    }
  }
  destinationStop: {
    name: string
    city: string | null
    coordinates?: {
      latitude: number
      longitude: number
    } | null
  } | null
  nearbyStops: Array<{
    name: string
    city: string | null
    distance: number
  }>
  // GTFS-specific fields
  _shapePoints?: Array<{ lat: number; lon: number }>
  _score?: number
  _departTime?: string
  _arriveTime?: string
  _transfers?: number
  _walkingDistanceKm?: number
  _boardingStopDistanceKm?: number
}

interface Location {
  latitude: number
  longitude: number
}

interface NearestStop {
  name: string
  city: string | null
  distance: number
  coordinates: {
    latitude: number
    longitude: number
  }
}

interface SelectedLocation {
  name: string
  lat: number
  lon: number
  displayName?: string
}

interface RoutePath {
  walking?: [number, number][]   // Caminar: ubicación usuario → parada de subida
  bus?: [number, number][]      // Autobús: parada subida → parada bajada
  walking2?: [number, number][]  // Caminar: parada bajada → destino final
  direct?: [number, number][]   // Línea directa (fallback)
}

interface BusStop {
  id: string
  name: string
  lat: number
  lon: number
}

interface PopularDestination {
  name: string
  lat: number
  lon: number
  displayName: string
}

export default function BusPlannerApp() {
  const [currentLocation, setCurrentLocation] = useState<Location | null>({ latitude: 9.9281, longitude: -84.0907 })
  const [currentAddress, setCurrentAddress] = useState<string>('San José, Costa Rica (ubicación aproximada)')
  const [nearestStop, setNearestStop] = useState<NearestStop | null>(null)
  const [useCurrentLocation, setUseCurrentLocation] = useState(true)
  const [originText, setOriginText] = useState('')
  const [selectedOrigin, setSelectedOrigin] = useState<SelectedLocation | null>(null)
  const [destination, setDestination] = useState('')
  const [suppressDestSuggestions, setSuppressDestSuggestions] = useState(false)
  const [selectedDestination, setSelectedDestination] = useState<SelectedLocation | null>(null)
  const [plannedRoutes, setPlannedRoutes] = useState<PlanatedRoute[]>([])
  const [selectedRoute, setSelectedRoute] = useState<PlanatedRoute | null>(null)
  const [routePath, setRoutePath] = useState<RoutePath | null>(null)
  const routePathRef = useRef<RoutePath | null>(null)
  const [busStops, setBusStops] = useState<BusStop[] | null>(null)
  const [hasPlanned, setHasPlanned] = useState(false)
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [loadingDirectRoute, setLoadingDirectRoute] = useState(false)
  const [loadingBusStops, setLoadingBusStops] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFullAddress, setShowFullAddress] = useState(true)
  const [addressData, setAddressData] = useState<any>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Estados para seguimiento de viaje
  const [isTracking, setIsTracking] = useState(false)
  const [trackingId, setTrackingId] = useState<number | null>(null)
  const [tripStartTime, setTripStartTime] = useState<Date | null>(null)
  const [distanceRemaining, setDistanceRemaining] = useState<number>(0)
  const [elapsedTime, setElapsedTime] = useState<number>(0)
  const [showArrivalNotification, setShowArrivalNotification] = useState(false)
  const [showCountdown, setShowCountdown] = useState(false)
  const [countdown, setCountdown] = useState(30)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Estados para panel de seguimiento
  const [trackingPanelVisible, setTrackingPanelVisible] = useState(true)
  const [isTripPaused, setIsTripPaused] = useState(false)
  const pausedAtRef = useRef<number>(0)
  const totalPausedMsRef = useRef<number>(0)

  // Estados para control del mapa
  // Ubicación por defecto: San José, Costa Rica
  const [mapCenter, setMapCenter] = useState<[number, number]>([9.9281, -84.0907])
  const [mapZoom, setMapZoom] = useState(14)
  const [isUserInteracting, setIsUserInteracting] = useState(false)
  const [lastUserActivity, setLastUserActivity] = useState(0)
  const [manualCenter, setManualCenter] = useState<[number, number] | null>(null)

  // Estado para diálogo de inicio de viaje
  const [popularDestinations, setPopularDestinations] = useState<PopularDestination[]>([])

  // Estado para auto-ocultar panel de rutas
  const [routePanelDismissed, setRoutePanelDismissed] = useState(false)
  const routePanelTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    getCurrentLocation()
    fetchPopularDestinations()
  }, [])

  // El panel de rutas ya NO se auto-oculta — solo desaparece cuando el usuario hace clic en Iniciar Viaje

  // Fetch popular destinations from GTFS stops
  const fetchPopularDestinations = async () => {
    try {
      const response = await fetch('/api/stops?limit=8')
      const data = await response.json()
      if (data.stops && data.stops.length > 0) {
        // Pick diverse stops that serve routes as good destinations
        const dests = data.stops
          .filter((s: any) => s.name && (s.routeCount || 0) > 0)
          .slice(0, 8)
          .map((s: any) => ({
            name: s.name,
            lat: s.lat,
            lon: s.lon,
            displayName: s.name,
          }))
        if (dests.length > 0) {
          setPopularDestinations(dests)
        }
      }
    } catch (err) {
      console.error('Error fetching popular destinations:', err)
    }
  }

  // Auto-centrar el mapa después de 15 segundos de inactividad
  useEffect(() => {
    const interval = setInterval(() => {
      if (isTracking && !isUserInteracting && lastUserActivity > 0 && Date.now() - lastUserActivity > 15000) {
        if (currentLocation) {
          setMapCenter([currentLocation.latitude, currentLocation.longitude])
          setMapZoom(14)
          setLastUserActivity(0)
        }
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [isTracking, isUserInteracting, lastUserActivity, currentLocation])

  const getAddressFromCoordinates = async (lat: number, lon: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=es`
      )
      const data = await response.json()
      setAddressData(data)
      return formatAddress(data, showFullAddress)
    } catch (error) {
      console.error('Error al obtener dirección:', error)
      return ''
    }
  }

  const formatAddress = (data: any, useFullAddress: boolean): string => {
    if (!data || !data.address) return ''
    const addr = data.address
    const parts: string[] = []

    if (useFullAddress) {
      if (addr.road) {
        if (addr.house_number) {
          parts.push(`${addr.road} ${addr.house_number}`)
        } else {
          parts.push(addr.road)
        }
      }
      if (addr.neighbourhood) parts.push(addr.neighbourhood)
      else if (addr.suburb) parts.push(addr.suburb)
      if (addr.village) {
        parts.push(addr.village)
      } else if (addr.town) {
        parts.push(addr.town)
      } else if (addr.city) {
        parts.push(addr.city)
      }
      if (addr.city && !parts.includes(addr.city)) {
        parts.push(addr.city)
      } else if (addr.town && !parts.includes(addr.town)) {
        parts.push(addr.town)
      } else if (addr.city_district) {
        parts.push(addr.city_district)
      }
      if (addr.county) {
        parts.push(addr.county)
      }
      if (addr.state) {
        parts.push(addr.state)
      }
      if (addr.postcode) {
        parts.push(addr.postcode)
      }
    } else {
      if (addr.road) {
        if (addr.house_number) {
          parts.push(`${addr.road} ${addr.house_number}`)
        } else {
          parts.push(addr.road)
        }
      }
      if (addr.neighbourhood) parts.push(addr.neighbourhood)
      else if (addr.suburb) parts.push(addr.suburb)
      if (addr.village) {
        parts.push(addr.village)
      } else if (addr.town) {
        parts.push(addr.town)
      } else if (addr.city) {
        parts.push(addr.city)
      }
    }

    return parts.join(', ')
  }

  useEffect(() => {
    if (addressData) {
      setCurrentAddress(formatAddress(addressData, showFullAddress))
    }
  }, [showFullAddress])

  // Actualizar tiempo transcurrido durante el viaje
  useEffect(() => {
    if (!isTracking || !tripStartTime || isTripPaused) {
      return
    }

    const interval = setInterval(() => {
      const elapsed = (Date.now() - tripStartTime.getTime() - totalPausedMsRef.current) / 1000 / 60 // en minutos
      setElapsedTime(elapsed)
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [isTracking, tripStartTime, isTripPaused])

  const getCurrentLocation = async () => {
    setLoadingLocation(true)
    setError(null)
    try {
      if (!navigator.geolocation) {
        // Usar San José como ubicación por defecto
        setCurrentLocation({ latitude: 9.9281, longitude: -84.0907 })
        setCurrentAddress('San José, Costa Rica (ubicación aproximada)')
        return
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 60000,
          }
        )
      })

      const { latitude, longitude } = position.coords
      setCurrentLocation({ latitude, longitude })
      setMapCenter([latitude, longitude])

      setLoadingAddress(true)
      getAddressFromCoordinates(latitude, longitude)
        .then((address) => {
          setCurrentAddress(address)
        })
        .catch((error) => {
          console.error('Error al obtener dirección:', error)
          setCurrentAddress(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
        })
        .finally(() => {
          setLoadingAddress(false)
        })
    } catch {
      // GPS no disponible o denegado — usar San José como ubicación por defecto
      setCurrentLocation({ latitude: 9.9281, longitude: -84.0907 })
      setCurrentAddress('San José, Costa Rica (ubicación aproximada)')
    } finally {
      setLoadingLocation(false)
    }
  }

  const findNearestStop = async (lat: number, lon: number) => {
    try {
      const response = await fetch(
        `/api/routes/nearby?lat=${lat}&lon=${lon}`
      )
      const data = await response.json()
      if (data.success) {
        if (data.routes && data.routes.length > 0) {
        }
      }
    } catch (error) {
      console.error('Error al buscar parada cercana:', error)
    }
  }

  // Función para obtener ruta de OSRM (Open Source Routing Machine)
  // OSRM profiles: 'foot' (walking), 'driving' (car)
  const getOSRMRoute = async (start: [number, number], end: [number, number], profile: 'foot' | 'driving' = 'driving') => {
    try {
      const url = `https://router.project-osrm.org/route/v1/${profile}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`
      const response = await fetch(url)
      const data = await response.json()

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0]
        // Extraer las coordenadas de la ruta
        const coordinates = route.geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]]) as [number, number][]
        return coordinates
      }
      return null
    } catch (error) {
      console.error('Error al obtener ruta de OSRM:', error)
      return null
    }
  }

  // Función para obtener paradas de autobús de OpenStreetMap usando Overpass API
  const getBusStopsFromOSM = async (bounds: { south: number; west: number; north: number; east: number }) => {
    try {
      setLoadingBusStops(true)
      const query = `
        [out:json][timeout:25];
        (
          node["public_transport"="platform"]["bus"="yes"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
          node["highway"="bus_stop"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
        );
        out body;
        >;
        out skel qt;
      `

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
      })

      const data = await response.json()

      if (data.elements && data.elements.length > 0) {
        const stops: BusStop[] = data.elements
          .filter((el: any) => el.type === 'node' && el.lat && el.lon)
          .map((el: any) => ({
            id: el.id.toString(),
            name: el.tags?.name || el.tags?.ref || `Parada ${el.id}`,
            lat: el.lat,
            lon: el.lon,
          }))

        // Limitar a las 50 paradas más cercanas para no saturar el mapa
        return stops.slice(0, 50)
      }

      return []
    } catch (error) {
      console.error('Error al obtener paradas de autobús:', error)
      return []
    } finally {
      setLoadingBusStops(false)
    }
  }

  // Calcular los límites del área alrededor de la ruta
  const getRouteBounds = (routePath: RoutePath | null) => {
    if (!routePath) return null

    const allPoints: [number, number][] = []

    if (routePath.walking) {
      allPoints.push(...routePath.walking)
    }
    if (routePath.bus) {
      allPoints.push(...routePath.bus)
    }
    if (routePath.walking2) {
      allPoints.push(...routePath.walking2)
    }
    if (routePath.direct) {
      allPoints.push(...routePath.direct)
    }

    if (allPoints.length === 0) return null

    const lats = allPoints.map(p => p[0])
    const lons = allPoints.map(p => p[1])

    const margin = 0.01 // Aproximadamente 1 km de margen

    return {
      south: Math.min(...lats) - margin,
      west: Math.min(...lons) - margin,
      north: Math.max(...lats) + margin,
      east: Math.max(...lons) + margin,
    }
  }

  // El zoom y centro se ajustan automáticamente en RouteBoundsFitter (map.tsx)
  // usando Leaflet fitBounds con maxZoom/minZoom para un ajuste óptimo.
  // Esta función ya no necesita calcular zoom manualmente.
  const fitRouteToBounds = (_routePath: RoutePath | null) => {
    // RouteBoundsFitter en el componente mapa se encarga de ajustar la vista
  };

  const handleOriginSelect = (location: any) => {
    try {
      if (!location || !location.lat || !location.lon) {
        console.error('Ubicación inválida:', location)
        setError('La ubicación de origen no tiene coordenadas válidas')
        return
      }

      const lat = parseFloat(location.lat)
      const lon = parseFloat(location.lon)

      if (isNaN(lat) || isNaN(lon)) {
        console.error('Coordenadas inválidas:', { lat, lon, location })
        setError('Las coordenadas de origen no son válidas')
        return
      }

      setSelectedOrigin({
        name: location.name || 'Origen desconocido',
        lat: lat,
        lon: lon,
        displayName: location.displayName || location.name || 'Origen desconocido',
      })
      setOriginText(location.name || '')
      setError(null)

      // Centrar mapa en el origen seleccionado
      setMapCenter([lat, lon])
      setMapZoom(13)


    } catch (err) {
      console.error('Error al seleccionar origen:', err)
    }
  }

  // Función que busca transporte público y dibuja la ruta
  const searchTransportAndDrawRoute = async (origin: [number, number], dest: [number, number]) => {
    // Primero dibujar ruta directa mientras busca transporte
    getDirectRouteToDestination(origin, dest)

    // Ajustar mapa para mostrar ambas ubicaciones
    setMapCenter([
      (origin[0] + dest[0]) / 2,
      (origin[1] + dest[1]) / 2
    ])
    setMapZoom(10)

    // Buscar rutas de transporte público
    try {
      setPlanning(true)
      setError(null)
      setPlannedRoutes([])
      setSelectedRoute(null)
      setHasPlanned(false)

      const params = new URLSearchParams({
        originLat: origin[0].toString(),
        originLon: origin[1].toString(),
        destLat: dest[0].toString(),
        destLon: dest[1].toString(),
      })

      const response = await fetch(`/api/best-route?${params}`)
      if (!response.ok) throw new Error('Error al buscar rutas')

      const data = await response.json()

      if (data.routes && data.routes.length > 0) {
        // Hay transporte público disponible
        const mappedRoutes: PlanatedRoute[] = data.routes.map((r: any) => ({
          id: `${r.route?.routeId || 'R'}-${r.boardingStop?.name || 'A'}-${r.alightingStop?.name || 'B'}-${Math.random().toString(36).slice(2, 6)}`,
          company: r.route?.company || 'N/A',
          routeNumber: r.route?.shortName || 'N/A',
          origin: r.boardingStop?.name || 'Origen',
          destination: r.alightingStop?.name || 'Destino',
          price: r.costCRC || 0,
          currency: 'CRC',
          distanceKm: r.walkingDistanceKm ? r.walkingDistanceKm : null,
          durationMin: r.totalTimeMinutes || null,
          boardingStop: {
            name: r.boardingStop?.name || '',
            city: null,
            coordinates: r.boardingStop ? { latitude: r.boardingStop.lat, longitude: r.boardingStop.lon } : undefined,
          },
          destinationStop: {
            name: r.alightingStop?.name || '',
            city: null,
            coordinates: r.alightingStop ? { latitude: r.alightingStop.lat, longitude: r.alightingStop.lon } : undefined,
          },
          nearbyStops: [],
          _shapePoints: r.shapePoints || [],
          _score: r.score || 0,
          _departTime: r.departTime || '',
          _arriveTime: r.arriveTime || '',
          _transfers: r.transfers || 0,
          _walkingDistanceKm: r.walkingDistanceKm || 0,
          _boardingStopDistanceKm: r.boardingStop?.distanceKm || 0,
        }))

        setPlannedRoutes(mappedRoutes)
        setHasPlanned(true)
        setSelectedRoute(mappedRoutes[0])

        // Build route path
        const newRoutePath: RoutePath = {}
        const routePromises: Promise<void>[] = []
        const bestRoute = data.routes[0]

        if (bestRoute.boardingStop) {
          routePromises.push(
            getOSRMRoute(origin, [bestRoute.boardingStop.lat, bestRoute.boardingStop.lon], 'foot')
              .then((coords) => {
                if (coords) newRoutePath.walking = coords
                else newRoutePath.walking = [origin, [bestRoute.boardingStop.lat, bestRoute.boardingStop.lon]]
              })
          )
        }

        if (bestRoute.alightingStop && selectedDestination) {
          routePromises.push(
            getOSRMRoute([bestRoute.alightingStop.lat, bestRoute.alightingStop.lon], dest, 'foot')
              .then((coords) => {
                if (coords) newRoutePath.walking2 = coords
                else newRoutePath.walking2 = [[bestRoute.alightingStop.lat, bestRoute.alightingStop.lon], dest]
              })
          )
        }

        if (bestRoute.boardingStop && bestRoute.alightingStop) {
          routePromises.push(
            getOSRMRoute([bestRoute.boardingStop.lat, bestRoute.boardingStop.lon], [bestRoute.alightingStop.lat, bestRoute.alightingStop.lon], 'driving')
              .then((coords) => {
                if (coords) newRoutePath.bus = coords
              })
          )
        }

        await Promise.all(routePromises)
        setRoutePath(newRoutePath)
        routePathRef.current = newRoutePath
        setRoutePanelDismissed(false)
      } else {
        // No hay transporte público - mostrar notificación con info de ruta directa
        setHasPlanned(true)
        setPlannedRoutes([])
        setSelectedRoute(null)
        setRoutePanelDismissed(false)
        setError(null)
      }
    } catch (err) {
      console.error('Error al buscar transporte:', err)
      // Si falla la búsqueda, aún mostrar la ruta directa
      setHasPlanned(true)
      setPlannedRoutes([])
      setSelectedRoute(null)
      setRoutePanelDismissed(false)
    } finally {
      setPlanning(false)
    }
  }

  const handleDestinationSelect = (location: any) => {
    try {
      // Validar que la ubicación tenga los datos necesarios
      if (!location || !location.lat || !location.lon) {
        console.error('Ubicación inválida:', location)
        setError('La ubicación seleccionada no tiene coordenadas válidas')
        return
      }

      const lat = parseFloat(location.lat)
      const lon = parseFloat(location.lon)

      if (isNaN(lat) || isNaN(lon)) {
        console.error('Coordenadas inválidas:', { lat, lon, location })
        setError('Las coordenadas seleccionadas no son válidas')
        return
      }

      // Suppress autocomplete suggestions so the dropdown doesn't reopen
      // and cover the "Buscar Ruta" button
      setSuppressDestSuggestions(true)

      setSelectedDestination({
        name: location.name || 'Destino desconocido',
        lat: lat,
        lon: lon,
        displayName: location.displayName || location.name || 'Destino desconocido',
      })
      setDestination(location.name || '')
      setError(null)
    } catch (error) {
      console.error('Error al seleccionar destino:', error)
      setError('Error al procesar la ubicación seleccionada')
    }
  }

  // Función para obtener ruta directa al destino seleccionado
  const getDirectRouteToDestination = async (start: [number, number], end: [number, number]) => {
    try {
      setLoadingDirectRoute(true)
      const route = await getOSRMRoute(start, end, 'driving')
      if (route) {
        const rp = { direct: route }
        setRoutePath(rp)
        routePathRef.current = rp
      }
    } catch (error) {
      console.error('Error al obtener ruta directa:', error)
    } finally {
      setLoadingDirectRoute(false)
    }
  }

  const handlePlanRoute = async () => {
    if (!selectedDestination) {
      if (!destination.trim()) {
        setError('Por favor ingresa un destino')
      } else {
        setError('Por favor selecciona un destino de la lista')
      }
      return
    }

    if (!useCurrentLocation && !selectedOrigin) {
      if (!originText.trim()) {
        setError('Por favor ingresa un lugar de origen')
      } else {
        setError('Por favor selecciona un origen de la lista')
      }
      return
    }

    // Asegurar que el panel de rutas será visible
    setRoutePanelDismissed(false)

    // Cerrar menú inmediatamente
    setIsMenuOpen(false)

    // Esperar a que la animación de cierre del Sheet termine (300ms + margen)
    // Esto evita que los cambios de estado re-rendericen los hijos del Sheet
    // durante la animación de salida, lo cual causa crash en SheetPrimitive.Content
    await new Promise(resolve => setTimeout(resolve, 400))

    // Usar ubicación actual o San José como origen por defecto
    const originLat = useCurrentLocation
      ? (currentLocation?.latitude ?? 9.9281)
      : (selectedOrigin?.lat ?? 9.9281)
    const originLon = useCurrentLocation
      ? (currentLocation?.longitude ?? -84.0907)
      : (selectedOrigin?.lon ?? -84.0907)

    // Guardar la ruta actual antes de limpiar para preservarla si no hay rutas de bus
    const previousRoutePath = routePathRef.current
    const previousSelectedRoute = selectedRoute

    setPlanning(true)
    setLoadingRoute(true)
    setError(null)
    setSelectedRoute(null)
    setRoutePath(null)
    routePathRef.current = null
    setBusStops(null)

    try {
      const params = new URLSearchParams({
        originLat: originLat.toString(),
        originLon: originLon.toString(),
        destLat: selectedDestination.lat.toString(),
        destLon: selectedDestination.lon.toString(),
      })

      const response = await fetch(`/api/best-route?${params}`)
      if (!response.ok) throw new Error('Error al buscar rutas')

      const data = await response.json()

      if (data.routes && data.routes.length > 0) {
        const mappedRoutes: PlanatedRoute[] = data.routes.map((r: any) => ({
          id: `${r.route?.routeId || 'R'}-${r.boardingStop?.name || 'A'}-${r.alightingStop?.name || 'B'}-${Math.random().toString(36).slice(2, 6)}`,
          company: r.route?.company || 'N/A',
          routeNumber: r.route?.shortName || 'N/A',
          origin: r.boardingStop?.name || 'Origen',
          destination: r.alightingStop?.name || 'Destino',
          price: r.costCRC || 0,
          currency: 'CRC',
          distanceKm: r.walkingDistanceKm ? r.walkingDistanceKm : null,
          durationMin: r.totalTimeMinutes || null,
          boardingStop: {
            name: r.boardingStop?.name || '',
            city: null,
            coordinates: r.boardingStop ? { latitude: r.boardingStop.lat, longitude: r.boardingStop.lon } : undefined,
          },
          destinationStop: {
            name: r.alightingStop?.name || '',
            city: null,
            coordinates: r.alightingStop ? { latitude: r.alightingStop.lat, longitude: r.alightingStop.lon } : undefined,
          },
          nearbyStops: [],
          // GTFS-specific fields for map rendering and enhanced cards
          _shapePoints: r.shapePoints || [],
          _score: r.score || 0,
          _departTime: r.departTime || '',
          _arriveTime: r.arriveTime || '',
          _transfers: r.transfers || 0,
          _walkingDistanceKm: r.walkingDistanceKm || 0,
          _boardingStopDistanceKm: r.boardingStop?.distanceKm || 0,
        }))

        setPlannedRoutes(mappedRoutes)
        setHasPlanned(true)
        setSelectedRoute(mappedRoutes[0])

        // Build route path using GTFS shape data + OSRM for walking segments
        const newRoutePath: RoutePath = {}
        const bestRoute = data.routes[0]

        // Fetch walking and bus routes in parallel
        const routePromises: Promise<void>[] = []

        // Origin coordinates for walking segments
        const walkOriginLat = useCurrentLocation
          ? (currentLocation?.latitude ?? 9.9281)
          : (selectedOrigin?.lat ?? 9.9281)
        const walkOriginLon = useCurrentLocation
          ? (currentLocation?.longitude ?? -84.0907)
          : (selectedOrigin?.lon ?? -84.0907)

        // Walking from origin to boarding stop (OSRM walking)
        if (bestRoute.boardingStop) {
          routePromises.push(
            getOSRMRoute(
              [walkOriginLat, walkOriginLon],
              [bestRoute.boardingStop.lat, bestRoute.boardingStop.lon],
              'foot'
            ).then((coords) => {
              if (coords) {
                newRoutePath.walking = coords
              } else {
                // Fallback: straight line
                newRoutePath.walking = [
                  [walkOriginLat, walkOriginLon],
                  [bestRoute.boardingStop.lat, bestRoute.boardingStop.lon],
                ]
              }
            })
          )
        }

        // Walking from alighting stop to destination (OSRM walking)
        if (bestRoute.alightingStop && selectedDestination) {
          routePromises.push(
            getOSRMRoute(
              [bestRoute.alightingStop.lat, bestRoute.alightingStop.lon],
              [selectedDestination.lat, selectedDestination.lon],
              'foot'
            ).then((coords) => {
              if (coords) {
                newRoutePath.walking2 = coords
              } else {
                newRoutePath.walking2 = [
                  [bestRoute.alightingStop.lat, bestRoute.alightingStop.lon],
                  [selectedDestination.lat, selectedDestination.lon],
                ]
              }
            })
          )
        }

        // Bus route: always use OSRM driving to follow actual streets
        // GTFS shape points are approximate and may contain bad coordinates
        if (bestRoute.boardingStop && bestRoute.alightingStop) {
          routePromises.push(
            getOSRMRoute(
              [bestRoute.boardingStop.lat, bestRoute.boardingStop.lon],
              [bestRoute.alightingStop.lat, bestRoute.alightingStop.lon],
              'driving'
            ).then((coords) => {
              if (coords) {
                newRoutePath.bus = coords
              }
            })
          )
        }

        await Promise.all(routePromises)
        setRoutePath(newRoutePath)
        routePathRef.current = newRoutePath

        // Fit map to show the full route
        fitRouteToBounds(newRoutePath)

        // Load nearby GTFS stops for the map
        const bounds = getRouteBounds(newRoutePath)
        if (bounds) {
          try {
            const response2 = await fetch(
              `/api/stops?lat=${(bounds.north + bounds.south) / 2}&lon=${(bounds.east + bounds.west) / 2}&radius=10`
            )
            const stopsData = await response2.json()
            if (stopsData.success && stopsData.stops) {
              setBusStops(stopsData.stops.map((s: any) => ({
                id: s.stop_id,
                name: s.name,
                lat: s.lat,
                lon: s.lon,
              })))
            }
          } catch {
            // Error loading map stops - non-critical
          }
        }
      } else {
        // No se encontraron rutas de bus — trazar ruta directa con OSRM
        setHasPlanned(true)

        const directRoute: PlanerratedRoute = {
          id: 'direct-route-' + Math.random().toString(36).slice(2, 6),
          company: 'Ruta Directa',
          routeNumber: 'Directo',
          origin: currentAddress || 'Tu ubicación',
          destination: selectedDestination.name || destination,
          price: 0,
          currency: 'CRC',
          boardingStop: {
            name: currentAddress || 'Tu ubicación',
            city: null,
            coordinates: currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : { latitude: originLat, longitude: originLon },
          },
          destinationStop: {
            name: selectedDestination.displayName || selectedDestination.name,
            city: null,
            coordinates: { latitude: selectedDestination.lat, longitude: selectedDestination.lon },
          },
          nearbyStops: [],
        }

        setPlannedRoutes([directRoute])
        setSelectedRoute(directRoute)

        // Fetch OSRM direct route
        try {
          const osrmRoute = await getOSRMRoute(
            [originLat, originLon],
            [selectedDestination.lat, selectedDestination.lon],
            'driving'
          )
          if (osrmRoute) {
            const newRoutePath: RoutePath = { direct: osrmRoute }
            setRoutePath(newRoutePath)
            routePathRef.current = newRoutePath
            fitRouteToBounds(newRoutePath)
          } else {
            setError('No se pudo trazar la ruta. Intenta con otro destino.')
          }
        } catch {
          setError('Error al trazar la ruta directa. Intenta de nuevo.')
        }
      }
    } catch {
      // En caso de error, restaurar la ruta previa si existe
      if (previousRoutePath) {
        setRoutePath(previousRoutePath)
        routePathRef.current = previousRoutePath
        if (previousSelectedRoute) {
          setSelectedRoute(previousSelectedRoute)
        }
      }
      setError('Error al buscar rutas. Por favor intenta de nuevo.')
    } finally {
      setPlanning(false)
      setLoadingRoute(false)
    }
  }

  const handleResetSearch = () => {
    // Limpiar timer de auto-ocultar panel
    if (routePanelTimerRef.current) {
      clearTimeout(routePanelTimerRef.current)
      routePanelTimerRef.current = null
    }

    // Detener seguimiento si está activo
    if (trackingId) {
      navigator.geolocation.clearWatch(trackingId)
      setTrackingId(null)
    }

    setIsTracking(false)
    setIsTripPaused(false)
    setTripStartTime(null)
    setElapsedTime(0)
    setDistanceRemaining(0)
    setShowArrivalNotification(false)
    setShowCountdown(false)
    setCountdown(30)
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setTrackingPanelVisible(true)

    setDestination('')
    setSelectedDestination(null)
    setPlannedRoutes([])
    setSelectedRoute(null)
    setRoutePath(null)
    routePathRef.current = null
    setBusStops(null)
    setHasPlanned(false)
    setRoutePanelDismissed(false)
    setError(null)

    // Resetear mapa
    if (currentLocation) {
      setMapCenter([currentLocation.latitude, currentLocation.longitude])
      setMapZoom(14)
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: 'CRC',
      minimumFractionDigits: 0,
    }).format(price)
  }

  const formatDistance = (km: number | null | undefined) => {
    if (!km) return null
    return `${km} km`
  }

  const formatDuration = (min: number | null | undefined) => {
    if (!min) return null
    const hours = Math.floor(min / 60)
    const mins = min % 60
    if (hours === 0) return `${mins} min`
    if (mins === 0) return `${hours} h`
    return `${hours} h ${mins} min`
  }

  // Calcular distancia entre dos coordenadas usando Haversine
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371 // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const handleStartTrip = () => {
    if (!selectedRoute && !selectedDestination) {
      return
    }
    // Si no hay ruta seleccionada (ruta directa), crear una ruta directa temporal
    if (!selectedRoute && selectedDestination) {
      // Se permite iniciar viaje directo sin transporte público
    }
    // Mostrar countdown de 30 segundos
    setShowCountdown(true)
    setCountdown(30)
  }

  const executeStartTrip = () => {
    setShowCountdown(false)
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }

    setIsTracking(true)
    setIsTripPaused(false)
    pausedAtRef.current = 0
    totalPausedMsRef.current = 0
    setTripStartTime(new Date())
    setElapsedTime(0)
    setTrackingPanelVisible(true)
    setRoutePanelDismissed(true) // Cerrar panel de rutas al empezar viaje

    // Calcular distancia inicial al destino
    const destCoords = selectedRoute?.destinationStop?.coordinates
      || (selectedDestination ? { latitude: selectedDestination.lat, longitude: selectedDestination.lon } : null)

    if (destCoords) {
      const initialDistance = calculateDistance(
        currentLocation?.latitude ?? 9.9281,
        currentLocation?.longitude ?? -84.0907,
        destCoords.latitude,
        destCoords.longitude
      )
      setDistanceRemaining(initialDistance)
    }

    // Centrar mapa en ubicación actual o en el origen personalizado
    const startLat = useCurrentLocation
      ? (currentLocation?.latitude ?? 9.9281)
      : (selectedOrigin?.lat ?? 9.9281)
    const startLon = useCurrentLocation
      ? (currentLocation?.longitude ?? -84.0907)
      : (selectedOrigin?.lon ?? -84.0907)
    setMapCenter([startLat, startLon])
    setMapZoom(14)

    // Iniciar seguimiento de posición con watchPosition
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setCurrentLocation({ latitude, longitude })

        // Calcular distancia restante
        const trackDestCoords = selectedRoute?.destinationStop?.coordinates
          || (selectedDestination ? { latitude: selectedDestination.lat, longitude: selectedDestination.lon } : null)

        if (trackDestCoords) {
          const remaining = calculateDistance(
            latitude,
            longitude,
            trackDestCoords.latitude,
            trackDestCoords.longitude
          )
          setDistanceRemaining(remaining)

          // Verificar si ha llegado al destino (dentro de 100 metros)
          if (remaining < 0.1) {
            handleStopTrip()
            setShowArrivalNotification(true)
          }
        }

        // Actualizar dirección
        getAddressFromCoordinates(latitude, longitude).then(setCurrentAddress)
      },
      (error) => {
        console.error('Error al rastrear ubicación:', error)
        setError('Error al rastrear tu ubicación. Verifica que el GPS esté activo.')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )

    setTrackingId(id)
  }

  // Countdown effect
  useEffect(() => {
    if (showCountdown && countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
    }
  }, [showCountdown])

  // Auto-start trip when countdown reaches 0
  useEffect(() => {
    if (showCountdown && countdown === 0) {
      executeStartTrip()
    }
  }, [countdown, showCountdown])

  const handleStopTrip = () => {
    handlePauseTrip()
  }

  const handlePauseTrip = () => {
    if (trackingId) {
      navigator.geolocation.clearWatch(trackingId)
      setTrackingId(null)
    }
    pausedAtRef.current = Date.now()
    setIsTripPaused(true)
  }

  const handleResumeTrip = () => {
    // Account for paused duration
    if (pausedAtRef.current > 0) {
      totalPausedMsRef.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = 0
    }
    setIsTripPaused(false)

    // Restart geolocation watch
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setCurrentLocation({ latitude, longitude })

        // Calcular distancia restante
        const trackDestCoords = selectedRoute?.destinationStop?.coordinates
          || (selectedDestination ? { latitude: selectedDestination.lat, longitude: selectedDestination.lon } : null)

        if (trackDestCoords) {
          const remaining = calculateDistance(
            latitude,
            longitude,
            trackDestCoords.latitude,
            trackDestCoords.longitude
          )
          setDistanceRemaining(remaining)

          // Verificar si ha llegado al destino (dentro de 100 metros)
          if (remaining < 0.1) {
            handleFullStopTrip()
            setShowArrivalNotification(true)
          }
        }

        // Actualizar dirección
        getAddressFromCoordinates(latitude, longitude).then(setCurrentAddress)
      },
      (error) => {
        console.error('Error al rastrear ubicación:', error)
        setError('Error al rastrear tu ubicación. Verifica que el GPS esté activo.')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )

    setTrackingId(id)
  }

  const handleFullStopTrip = () => {
    handleResetSearch()
  }

  // Manejar interacción con el mapa
  const handleMapInteraction = () => {
    if (isTracking) {
      setIsUserInteracting(true)
      setLastUserActivity(Date.now())
    }
  }

  // Route results are shown in bottom panel - no dialog needed

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-gray-100"
      onClick={() => isTracking && setTrackingPanelVisible(!trackingPanelVisible)}
    >
      {/* Full Screen Map - Siempre visible */}
      <div className="absolute inset-0 z-0">
        <BusMap
          center={mapCenter}
          zoom={mapZoom}
          userLocation={currentLocation ? [currentLocation.latitude, currentLocation.longitude] : undefined}
          originCoordinates={!useCurrentLocation && selectedOrigin ? {
            name: selectedOrigin.name || 'Origen',
            latitude: selectedOrigin.lat,
            longitude: selectedOrigin.lon,
            displayName: selectedOrigin.displayName
          } : null}
          nearestStop={nearestStop}
          plannedRoutes={plannedRoutes}
          plannedRoutesLength={plannedRoutes.length}
          selectedRoute={selectedRoute}
          destinationCoordinates={selectedDestination ? {
            name: selectedDestination.name || 'Destino',
            latitude: selectedDestination.lat,
            longitude: selectedDestination.lon,
            displayName: selectedDestination.displayName
          } : null}
          routePath={routePath}
          busStops={busStops}
          isTracking={isTracking}
          onMapInteraction={handleMapInteraction}
        />
      </div>

      {/* Loading Overlay - Solo muestra cuando no hay ubicación */}
      {!currentLocation && loadingLocation && (
        <div className="absolute inset-0 bg-white/90 flex items-center justify-center z-20">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-3 text-[#E31837]" />
            <p className="text-sm text-[#6B7280]">Obteniendo tu ubicación...</p>
          </div>
        </div>
      )}

      {/* Route results shown in bottom panel below */}

      {/* Notificación de llegada */}
      {showArrivalNotification && (
        <div className="absolute top-20 left-4 right-4 z-50">
          <Card className="bg-[#10B981] border-2 border-[#059669] shadow-xl animate-bounce">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3">
                <Navigation className="w-8 h-8 text-[#10B981]" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">¡Has llegado a tu destino!</h3>
              <p className="text-white/90 mb-4">
                {selectedRoute?.destinationStop?.name || destination}
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={() => setShowArrivalNotification(false)}
                  variant="secondary"
                  size="sm"
                >
                  Cerrar
                </Button>
                <Button
                  onClick={() => {
                    setShowArrivalNotification(false)
                    handleResetSearch()
                  }}
                  size="sm"
                  className="bg-white text-[#10B981] hover:bg-gray-100"
                >
                  Nueva Ruta
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header - Floating on top of map */}
      <header className="absolute top-0 left-0 right-0 z-30 shadow-md overflow-hidden">
        <img src="/RutaTica_bus.png" alt="" className="absolute inset-0 w-full h-full object-cover object-center" aria-hidden="true" />
        <div className="container mx-auto px-4 py-3 relative z-10">
          <div className="flex items-center justify-between">
            <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white bg-white/25 hover:bg-white/35 backdrop-blur-sm rounded-lg border border-white/30">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full sm:w-96 overflow-y-auto">
                <SheetTitle className="sr-only">Menú de RutaTica</SheetTitle>
                <SheetDescription className="sr-only">Planifica tu viaje en autobús por Costa Rica</SheetDescription>
                <div className="mt-8 space-y-4">
                  {/* Header Content */}
                  <div className="flex items-center gap-3 pb-4 border-b">
                    <img src="/RutaTica_Logo.png" alt="RutaTica" className="h-9 w-auto object-contain mix-blend-multiply" />
                    <div>
                      <p className="text-xs text-gray-500">Toda Costa Rica en una APP</p>
                    </div>
                  </div>

                  {/* Trip Tracking Info - Inside Menu */}
                  {isTracking && (
                    <div className="bg-green-50 rounded-lg border-2 border-[#10B981] overflow-hidden">
                      <div className="bg-[#10B981] px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center">
                            <Bus className="w-4 h-4 text-[#10B981] animate-pulse" />
                          </div>
                          <div>
                            <h3 className="font-bold text-white text-sm">Viaje en curso</h3>
                            <p className="text-white/80 text-xs">{selectedRoute?.routeNumber || 'Directo'}</p>
                          </div>
                        </div>
                        <Badge className="bg-white/25 text-white border-none text-xs">
                          Activo
                        </Badge>
                      </div>
                      <div className="p-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="text-center">
                            <p className="text-xs text-[#6B7280]">Restante</p>
                            <p className="font-bold text-[#E31837] text-lg leading-tight">
                              {distanceRemaining.toFixed(1)} km
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-[#6B7280]">Tiempo</p>
                            <p className="font-bold text-[#0052B4] text-lg leading-tight">
                              {elapsedTime < 60
                                ? `${Math.floor(elapsedTime)} min`
                                : `${Math.floor(elapsedTime / 60)}h ${Math.floor(elapsedTime % 60)}min`}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-green-200 flex items-center gap-2 text-xs text-[#6B7280]">
                          <MapPin className="w-3.5 h-3.5 text-[#0052B4] flex-shrink-0" />
                          <span className="truncate">{selectedRoute?.destinationStop?.name || destination}</span>
                        </div>
                        <Button
                          onClick={handleStopTrip}
                          className="w-full h-10 mt-3 text-sm font-semibold bg-white text-red-600 border-2 border-red-600 hover:bg-red-50"
                        >
                          <Navigation className="w-4 h-4 mr-2" />
                          Detener Viaje
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Current Route Info - Only when not tracking */}
                  {hasPlanned && !isTracking && (
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#0052B4]">
                          Ruta a {destination}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleResetSearch}
                          className="text-xs border-[#E5E7EB] text-gray-600 hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Reiniciar
                        </Button>
                      </div>
                    </div>
                  )}

                                    {/* Origin Card */}
                  {!hasPlanned && (
                    <Card className="shadow-sm border border-[#E5E7EB]">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-[#0052B4] rounded-full flex items-center justify-center">
                              <MapPin className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="font-semibold text-sm text-[#374151]">Origen</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor="location-toggle" className="text-xs cursor-pointer text-[#6B7280]">
                              Mi ubicación
                            </Label>
                            <Switch
                              id="location-toggle"
                              checked={useCurrentLocation}
                              onCheckedChange={(checked) => {
                                setUseCurrentLocation(checked)
                                if (!checked) {
                                  setSelectedOrigin(null)
                                  setOriginText('')
                                }
                              }}
                              className="scale-90"
                            />
                          </div>
                        </div>

                        {useCurrentLocation ? (
                          // Mostrar ubicación actual
                          <>
                            {loadingLocation || loadingAddress ? (
                              <div className="flex items-center gap-2 text-muted-foreground p-3 bg-blue-50 rounded-lg border border-[#E5E7EB]">
                                <Loader2 className="w-4 h-4 animate-spin text-[#0052B4]" />
                                <span className="text-sm">
                                  {loadingLocation ? 'Obteniendo ubicación...' : 'Obteniendo dirección...'}
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="bg-white rounded-lg p-3 border border-[#E5E7EB] shadow-sm">
                                  <p className="text-sm leading-relaxed text-[#374151]">{currentAddress}</p>
                                </div>

                                <div className="flex items-center justify-between gap-2">
                                  <Label htmlFor="address-toggle" className="text-xs cursor-pointer text-[#6B7280]">
                                    Dirección {showFullAddress ? 'completa' : 'corta'}
                                  </Label>
                                  <Switch
                                    id="address-toggle"
                                    checked={showFullAddress}
                                    onCheckedChange={setShowFullAddress}
                                    className="scale-90"
                                  />
                                </div>

                                {nearestStop && (
                                  <div className="flex items-center gap-2 text-xs text-[#6B7280] bg-green-50 p-2 rounded-lg border border-[#E5E7EB]">
                                    <Bus className="w-3.5 h-3.5 text-[#10B981]" />
                                    <span>
                                      Parada: <span className="font-semibold text-[#10B981]">{nearestStop.name}</span>
                                    </span>
                                    <Badge variant="secondary" className="ml-auto text-xs bg-green-100 text-[#10B981] border-green-200">
                                      {nearestStop.distance.toFixed(1)} km
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          // Campo de búsqueda de origen personalizado
                          <div className="space-y-2">
                            <LocationAutocomplete
                              value={originText}
                              onChange={setOriginText}
                              onSelect={handleOriginSelect}
                              placeholder="Escribe el lugar de origen..."
                              disabled={planning}
                            />
                            {selectedOrigin && (
                              <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg border border-[#E5E7EB]">
                                <MapPin className="w-3.5 h-3.5 text-[#0052B4] flex-shrink-0" />
                                <span className="text-xs text-[#374151] truncate">{selectedOrigin.displayName || selectedOrigin.name}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Destination Card - Debajo de origen */}
                  <Card className="shadow-md border border-[#E5E7EB]">
                    <CardContent className="p-4 space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-[#E31837] rounded-full flex items-center justify-center">
                            <Navigation className="w-3.5 h-3.5 text-white" />
                          </div>
                          <span className="font-semibold text-sm text-[#374151]">Destino</span>
                        </div>
                        <LocationAutocomplete
                          value={destination}
                          onChange={(val) => { setDestination(val); setSuppressDestSuggestions(false) }}
                          onSelect={handleDestinationSelect}
                          placeholder="Escribe el destino..."
                          disabled={planning}
                          suppressSuggestions={suppressDestSuggestions}
                        />
                      </div>

                      {selectedDestination && (
                        <Button
                          onClick={handlePlanRoute}
                          disabled={planning}
                          className="w-full h-11 text-base font-semibold bg-[#10B981] hover:bg-[#059669] shadow-md"
                        >
                          {planning ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Calculando ruta...
                            </>
                          ) : (
                            <>
                              <Search className="w-5 h-5 mr-2" />
                              Buscar Ruta
                            </>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  {/* Quick Access Buttons - Solo si no hay destino seleccionado */}
                  {!hasPlanned && !selectedDestination && (
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-[#E5E7EB]">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                          <img src="/Bus.jpg" alt="Rutas" className="w-12 h-12 rounded-xl object-cover object-top mb-2" />
                          <span className="font-semibold text-sm text-[#374151]">Rutas</span>
                        </CardContent>
                      </Card>

                      <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-[#E5E7EB]">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                          <img src="/Horario.jpg" alt="Horarios" className="w-12 h-12 rounded-xl object-cover mb-2" />
                          <span className="font-semibold text-sm text-[#374151]">Horarios</span>
                        </CardContent>
                      </Card>

                      <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-[#E5E7EB]">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-2">
                            <MapPin className="w-6 h-6 text-[#0052B4]" />
                          </div>
                          <span className="font-semibold text-sm text-[#374151]">Cercanos</span>
                        </CardContent>
                      </Card>

                      <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-[#E5E7EB]">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-2">
                            <Heart className="w-6 h-6 text-[#10B981]" />
                          </div>
                          <span className="font-semibold text-sm text-[#374151]">Favoritos</span>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Error Message */}
                  {error && !hasPlanned && (
                    <Card className="border border-[#FECACA] bg-red-50">
                      <CardContent className="p-4 text-center text-[#DC2626]">
                        {error}
                      </CardContent>
                    </Card>
                  )}

                  {/* Route results shown in bottom panel outside Sheet */}

                  {/* Popular Destinations - Solo si no hay destino seleccionado */}
                  {!hasPlanned && !error && !selectedDestination && (
                    <div className="space-y-3">
                      <h3 className="font-bold text-lg text-[#374151]">Destinos Populares</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {popularDestinations.length > 0 ? (
                          popularDestinations.map((dest) => (
                            <Button
                              key={dest.name}
                              variant="outline"
                              onClick={() => {
                                const name = dest.displayName || dest.name
                                setSuppressDestSuggestions(true)
                                setDestination(name)
                                setSelectedDestination({
                                  name: name,
                                  lat: dest.lat,
                                  lon: dest.lon,
                                  displayName: name,
                                })
                              }}
                              disabled={planning}
                              className="h-auto py-3 min-w-0 flex flex-col items-center gap-2 border border-[#E5E7EB] hover:border-[#FECACA] hover:bg-red-50 text-[#374151]"
                            >
                              <MapPin className="w-5 h-5 text-[#E31837] flex-shrink-0" />
                              <span className="font-semibold text-xs leading-tight text-center line-clamp-2 w-full overflow-hidden">{dest.displayName || dest.name}</span>
                            </Button>
                          ))
                        ) : (
                          <>
                            {['Alajuela', 'Heredia', 'Cartago', 'Escazú', 'Desamparados', 'Limón'].map((dest) => (
                              <Button
                                key={dest}
                                variant="outline"
                                onClick={() => {
                                  setDestination(dest)
                                }}
                                disabled={planning}
                                className="h-auto py-3 min-w-0 flex flex-col items-center gap-2 border border-[#E5E7EB] hover:border-[#FECACA] hover:bg-red-50 text-[#374151]"
                              >
                                <MapPin className="w-5 h-5 text-[#E31837] flex-shrink-0" />
                                <span className="font-semibold text-xs leading-tight text-center w-full overflow-hidden">{dest}</span>
                              </Button>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2">
              <img src="/RutaTica_Logo.png" alt="RutaTica" className="h-8 w-auto object-contain mix-blend-multiply" />
              <p className="text-xs text-white drop-shadow-sm">
                {isTracking ? '🚌 Viaje en curso' : hasPlanned ? `Ruta a ${destination}` : '¿A dónde vamos hoy?'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {hasPlanned && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetSearch}
                  className="text-sm border-white/40 text-white hover:bg-white/20 hover:text-white hover:border-white/60"
                >
                  <X className="w-4 h-4 mr-1" />
                  Reiniciar
                </Button>
              )}
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                <Bell className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Bottom Route Results Panel - Compact */}
      {hasPlanned && !routePanelDismissed && !isTracking && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-[#E5E7EB] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          {/* Compact Header — sin botón de cerrar; el panel se cierra al iniciar el viaje */}
          <div className="px-3 py-1.5 flex items-center border-b border-[#E5E7EB]">
            <h2 className="text-xs font-bold flex items-center gap-1 text-gray-800">
              <Bus className="w-3.5 h-3.5 text-red-600" />
              Rutas
              {plannedRoutes.length > 0 && (
                <Badge className="bg-red-600 text-white border-none text-[10px] px-1 py-0">{plannedRoutes.length}</Badge>
              )}
            </h2>
          </div>

          {/* Error message when no routes */}
          {error && plannedRoutes.length === 0 && (
            <div className="px-4 pb-4">
              <Card className="p-4 text-center border border-[#FECACA] bg-red-50">
                <Bus className="w-12 h-12 mx-auto text-[#9CA3AF] mb-3" />
                <p className="text-[#DC2626] text-sm">{error}</p>
              </Card>
            </div>
          )}

          {/* No public transport available - show direct route info */}
          {!error && plannedRoutes.length === 0 && selectedDestination && (
            <div className="px-4 pb-4 space-y-3">
              <Card className="p-3 border border-amber-200 bg-amber-50">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bus className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Sin transporte público registrado</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      No se encontraron rutas de autobús para este trayecto. Se muestra la ruta directa en el mapa.
                    </p>
                  </div>
                </div>
              </Card>

              {/* Direct route info */}
              {routePath?.direct && (
                <Card className="p-3 border border-[#E5E7EB] shadow-sm">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-[#0052B4]" />
                      <span className="text-xs font-semibold text-[#374151]">Ruta directa</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <p className="text-[11px] text-[#6B7280]">Origen</p>
                        <p className="text-xs font-semibold text-[#0052B4] truncate">
                          {useCurrentLocation ? 'Mi ubicación' : (selectedOrigin?.displayName || selectedOrigin?.name || 'Origen')}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF] flex-shrink-0" />
                      <div className="flex-1 text-right">
                        <p className="text-[11px] text-[#6B7280]">Destino</p>
                        <p className="text-xs font-semibold text-[#E31837] truncate">{selectedDestination?.displayName || selectedDestination?.name}</p>
                      </div>
                    </div>
                    <Button
                      onClick={(e) => { e.stopPropagation(); handlePlanRoute() }}
                      className="w-full h-9 text-xs font-semibold bg-[#10B981] hover:bg-[#059669] shadow-sm"
                    >
                      <Search className="w-3.5 h-3.5 mr-1" />
                      Buscar Ruta
                    </Button>
                  </div>
                </Card>
              )}

              {!routePath?.direct && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <Loader2 className="w-4 h-4 text-[#0052B4] animate-spin flex-shrink-0" />
                  <p className="text-xs text-[#0052B4]">Calculando ruta directa...</p>
                </div>
              )}
            </div>
          )}

          {/* Route cards - compact scrollable */}
          {plannedRoutes.length > 0 && (
            <div className="max-h-[20vh] overflow-y-auto px-2.5 pb-2 space-y-1.5 scrollbar-thin">
              {plannedRoutes.map((route) => (
                <Card
                  key={route.id}
                  className={`transition-all cursor-pointer shadow-sm ${
                    selectedRoute?.id === route.id
                      ? 'ring-2 ring-[#E31837] shadow-md border border-[#FECACA]'
                      : 'border border-[#E5E7EB] hover:border-[#FECACA] hover:shadow-sm'
                  }`}
                  onClick={async () => {
                    setSelectedRoute(route)
                    const rp: RoutePath = {}
                    const promises: Promise<void>[] = []

                    // Origin coordinates
                    const cardOriginLat = useCurrentLocation
                      ? (currentLocation?.latitude ?? 9.9281)
                      : (selectedOrigin?.lat ?? 9.9281)
                    const cardOriginLon = useCurrentLocation
                      ? (currentLocation?.longitude ?? -84.0907)
                      : (selectedOrigin?.lon ?? -84.0907)

                    // Walking to boarding stop
                    if (route.boardingStop?.coordinates) {
                      promises.push(
                        getOSRMRoute(
                          [cardOriginLat, cardOriginLon],
                          [route.boardingStop.coordinates.latitude, route.boardingStop.coordinates.longitude],
                          'foot'
                        ).then((coords) => {
                          if (coords && coords.length > 2) rp.walking = coords
                        })
                      )
                    }

                    // Bus segment: always use OSRM driving to follow actual streets
                    if (route.boardingStop?.coordinates && route.destinationStop?.coordinates) {
                      promises.push(
                        getOSRMRoute(
                          [route.boardingStop.coordinates.latitude, route.boardingStop.coordinates.longitude],
                          [route.destinationStop.coordinates.latitude, route.destinationStop.coordinates.longitude],
                          'driving'
                        ).then((coords) => {
                          if (coords) rp.bus = coords
                        })
                      )
                    }

                    // Walking from alighting stop to destination
                    if (selectedDestination && route.destinationStop?.coordinates) {
                      promises.push(
                        getOSRMRoute(
                          [route.destinationStop.coordinates.latitude, route.destinationStop.coordinates.longitude],
                          [selectedDestination.lat, selectedDestination.lon],
                          'foot'
                        ).then((coords) => {
                          if (coords && coords.length > 2) rp.walking2 = coords
                        })
                      )
                    }

                    await Promise.all(promises)
                    setRoutePath(rp)
                    routePathRef.current = rp
                    fitRouteToBounds(rp)
                  }}
                >
                  <CardContent className="p-2">
                    <div className="space-y-1.5">
                      {/* Route Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 bg-red-50 rounded-full flex items-center justify-center">
                            <Bus className="w-3 h-3 text-[#E31837]" />
                          </div>
                          <div>
                            <span className="font-bold text-xs text-[#374151]">{route.routeNumber}</span>
                            <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 border-[#BFDBFE] text-[#0052B4]">
                              {route.company}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {plannedRoutes.indexOf(route) === 0 && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-none">
                              <Star className="w-2.5 h-2.5 mr-0.5" />
                              Mejor
                            </Badge>
                          )}
                          {plannedRoutes.indexOf(route) === 1 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-yellow-100 text-yellow-700 border-none">
                              Buena
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Key Metrics - Compact */}
                      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-md p-2 shadow-sm">
                        <div className="flex items-center justify-between text-white">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span className="text-[10px] font-medium">Tiempo</span>
                          </div>
                          <span className="text-sm font-bold">
                            {route.durationMin ? formatDuration(route.durationMin) : '--'}
                          </span>
                        </div>
                        <div className="mt-1 pt-1 border-t border-white/20 flex items-center justify-between text-white/90">
                          <div className="flex items-center gap-0.5">
                            <DollarSign className="w-3 h-3" />
                            <span className="text-[10px]">{formatPrice(route.price)}</span>
                          </div>
                          {route._walkingDistanceKm !== undefined && route._walkingDistanceKm > 0 && (
                            <span className="text-[10px]">{route._walkingDistanceKm.toFixed(1)} km a pie</span>
                          )}
                        </div>
                      </div>

                      {/* Route Path Details - Compact */}
                      <div className="bg-gradient-to-r from-blue-50 to-red-50 rounded-md p-2 flex items-center gap-1.5">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-[#0052B4]" />
                          <div className="w-0.5 h-4 bg-blue-200" />
                          <div className="w-2 h-2 rounded-full bg-[#E31837]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-[#374151] truncate">{route.boardingStop.name}</p>
                          <div className="flex items-center gap-0.5 my-0">
                            <ArrowRight className="w-2.5 h-2.5 text-[#9CA3AF] flex-shrink-0" />
                            <span className="text-[9px] text-[#6B7280]">{route._boardingStopDistanceKm ? `${route._boardingStopDistanceKm.toFixed(1)} km` : ''}</span>
                          </div>
                          <p className="text-[11px] font-semibold text-[#374151] truncate">
                            {route.destinationStop?.name || route.destination}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Ruta por definir - cuando no hay datos OSRM para la ruta seleccionada */}
              {selectedRoute && routePath && !routePath.walking && !routePath.bus && !routePath.walking2 && !routePath.direct && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <Navigation className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700 font-medium">Ruta por definir — no se pudo trazar el camino por las calles</p>
                </div>
              )}

              {/* Empezar Viaje Button - Compact */}
              {selectedRoute && !isTracking && (
                <Button
                  onClick={(e) => { e.stopPropagation(); handleStartTrip() }}
                  className="w-full h-9 text-xs font-semibold bg-[#10B981] hover:bg-[#059669] shadow-sm"
                >
                  <Navigation className="w-3.5 h-3.5 mr-1" />
                  Iniciar Viaje
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tracking Panel - Bottom bar during trip */}
      {isTracking && trackingPanelVisible && !isTripPaused && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-[#E5E7EB] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]" onClick={(e) => e.stopPropagation()}>
          <div className="p-3 space-y-2">
            {/* Trip info row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#10B981] rounded-full flex items-center justify-center">
                  <Bus className="w-4 h-4 text-white animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-gray-800">Viaje en curso</h3>
                  <p className="text-[10px] text-[#6B7280]">
                    {selectedRoute?.routeNumber || 'Directo'} → {selectedRoute?.destinationStop?.name || destination}
                  </p>
                </div>
                <Badge className="bg-green-100 text-[#10B981] border-none text-[10px]">
                  Activo
                </Badge>
              </div>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-[#6B7280]">Restante</p>
                <p className="font-bold text-[#E31837] text-sm">{distanceRemaining.toFixed(1)} km</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-[#6B7280]">Tiempo</p>
                <p className="font-bold text-[#0052B4] text-sm">
                  {elapsedTime < 60
                    ? `${Math.floor(elapsedTime)} min`
                    : `${Math.floor(elapsedTime / 60)}h ${Math.floor(elapsedTime % 60)}m`}
                </p>
              </div>
              <div className="flex items-center justify-center">
                <Button
                  onClick={(e) => { e.stopPropagation(); handleStopTrip(); }}
                  className="w-full h-full min-h-[40px] text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm"
                >
                  <X className="w-4 h-4 mr-1" />
                  Detener
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paused Tracking Panel */}
      {isTracking && trackingPanelVisible && isTripPaused && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-[#E5E7EB] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]" onClick={(e) => e.stopPropagation()}>
          <div className="p-3 space-y-2">
            {/* Trip info row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#F59E0B] rounded-full flex items-center justify-center">
                  <Bus className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-gray-800">Viaje en curso</h3>
                  <p className="text-[10px] text-[#6B7280]">
                    {selectedRoute?.routeNumber || 'Directo'} → {selectedRoute?.destinationStop?.name || destination}
                  </p>
                </div>
                <Badge className="bg-amber-100 text-[#F59E0B] border-none text-[10px]">
                  Pausado
                </Badge>
              </div>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-[#6B7280]">Restante</p>
                <p className="font-bold text-[#E31837] text-sm">{distanceRemaining.toFixed(1)} km</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-[#6B7280]">Tiempo</p>
                <p className="font-bold text-[#0052B4] text-sm">
                  {elapsedTime < 60
                    ? `${Math.floor(elapsedTime)} min`
                    : `${Math.floor(elapsedTime / 60)}h ${Math.floor(elapsedTime % 60)}m`}
                </p>
              </div>
            </div>

            {/* Paused action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleResumeTrip}
                className="h-10 text-xs font-semibold bg-[#10B981] hover:bg-[#059669] text-white shadow-sm"
              >
                <Navigation className="w-4 h-4 mr-1" />
                Continuar Viaje
              </Button>
              <Button
                onClick={handleFullStopTrip}
                className="h-10 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm"
              >
                <X className="w-4 h-4 mr-1" />
                Finalizar Viaje
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Countdown Dialog */}
      <Dialog open={showCountdown} onOpenChange={(open) => {
        if (!open) {
          setShowCountdown(false)
          if (countdownRef.current) {
            clearInterval(countdownRef.current)
            countdownRef.current = null
          }
        }
      }}>
        <DialogContent className="sm:max-w-xs mx-auto">
          <DialogTitle className="text-center text-lg font-bold text-[#374151]">
            Preparando tu viaje...
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-[#6B7280]">
            El viaje iniciará automáticamente
          </DialogDescription>
          <div className="flex flex-col items-center py-4 space-y-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center shadow-lg">
              <span className="text-4xl font-bold text-white">{countdown}</span>
            </div>
            <p className="text-sm text-[#6B7280]">
              {selectedRoute?.routeNumber || 'Ruta directa'} → {selectedRoute?.destinationStop?.name || destination}
            </p>
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCountdown(false)
                  if (countdownRef.current) {
                    clearInterval(countdownRef.current)
                    countdownRef.current = null
                  }
                }}
                className="flex-1 border-[#E5E7EB] text-[#6B7280] hover:bg-gray-50"
              >
                Cancelar
              </Button>
              <Button
                onClick={executeStartTrip}
                className="flex-1 bg-[#10B981] hover:bg-[#059669] text-white font-semibold"
              >
                Iniciar ahora
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bottom Navigation - Hidden when route results are showing */}
      {!hasPlanned && (
      <nav className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-[#E5E7EB]">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-around py-2">
            <Button variant="ghost" className="flex flex-col items-center gap-1 text-gray-600 hover:bg-gray-100 h-auto py-2">
              <Map className="w-5 h-5" />
              <span className="text-xs">Mapa</span>
            </Button>
            <Button variant="ghost" className="flex flex-col items-center gap-1 text-gray-600 hover:bg-gray-100 h-auto py-2">
              <img src="/Bus.jpg" alt="Rutas" className="w-5 h-5 rounded-sm object-cover object-top" />
              <span className="text-xs">Rutas</span>
            </Button>
            <Button variant="ghost" className="flex flex-col items-center gap-1 text-gray-600 hover:bg-gray-100 h-auto py-2">
              <Clock className="w-5 h-5" />
              <span className="text-xs">Horarios</span>
            </Button>
            <Button variant="ghost" className="flex flex-col items-center gap-1 text-gray-600 hover:bg-gray-100 h-auto py-2">
              <Heart className="w-5 h-5" />
              <span className="text-xs">Favoritos</span>
            </Button>
            <Button variant="ghost" className="flex flex-col items-center gap-1 text-gray-600 hover:bg-gray-100 h-auto py-2">
              <User className="w-5 h-5" />
              <span className="text-xs">Perfil</span>
            </Button>
          </div>
        </div>
      </nav>
      )}
    </div>
  )
}