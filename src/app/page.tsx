'use client'

import { useState, useEffect } from 'react'
import { MapPin, Bus, Navigation, Clock, DollarSign, ArrowRight, Loader2, Map, Home, Star, Bell, Menu, Search, Heart, User, Wallet, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
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
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null)
  const [currentAddress, setCurrentAddress] = useState<string>('')
  const [nearestStop, setNearestStop] = useState<NearestStop | null>(null)
  const [destination, setDestination] = useState('')
  const [selectedDestination, setSelectedDestination] = useState<SelectedLocation | null>(null)
  const [plannedRoutes, setPlannedRoutes] = useState<PlanatedRoute[]>([])
  const [selectedRoute, setSelectedRoute] = useState<PlanatedRoute | null>(null)
  const [routePath, setRoutePath] = useState<RoutePath | null>(null)
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

  // Estados para panel de seguimiento
  const [trackingPanelVisible, setTrackingPanelVisible] = useState(true)

  // Estados para control del mapa
  // Ubicación por defecto: San José, Costa Rica
  const [mapCenter, setMapCenter] = useState<[number, number]>([9.9281, -84.0907])
  const [mapZoom, setMapZoom] = useState(14)
  const [isUserInteracting, setIsUserInteracting] = useState(false)
  const [lastUserActivity, setLastUserActivity] = useState(0)
  const [manualCenter, setManualCenter] = useState<[number, number] | null>(null)

  // Estado para diálogo de inicio de viaje
  const [popularDestinations, setPopularDestinations] = useState<PopularDestination[]>([])

  useEffect(() => {
    getCurrentLocation()
    fetchPopularDestinations()
  }, [])

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
    if (!isTracking || !tripStartTime) {
      return
    }

    const interval = setInterval(() => {
      const elapsed = (Date.now() - tripStartTime.getTime()) / 1000 / 60 // en minutos
      setElapsedTime(elapsed)
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [isTracking, tripStartTime])

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
    } catch (error: any) {
      console.error('Error al obtener ubicación:', error)
      // Usar San José como fallback en vez de bloquear la app
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
  const getOSRMRoute = async (start: [number, number], end: [number, number], profile: 'walking' | 'driving' = 'driving') => {
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

  // Calcular centro y zoom para mostrar toda la ruta
  const fitRouteToBounds = (routePath: RoutePath | null) => {
    if (!routePath) return

    const bounds = getRouteBounds(routePath)
    if (!bounds || !currentLocation) return

    // Validar que todos los valores del bounds sean finitos
    const { south, west, north, east } = bounds
    if (!isFinite(south) || !isFinite(west) || !isFinite(north) || !isFinite(east)) {
      console.error('Bounds calculado contiene valores inválidos:', bounds)
      return
    }

    // Validar que el bounds tenga sentido geográfico
    if (south >= north || west >= east) {
      console.error('Bounds inválido: south debe ser menor que north, west menor que east:', bounds)
      return
    }

    const centerLat = (north + south) / 2
    const centerLon = (east + west) / 2

    setMapCenter([centerLat, centerLon])
    setMapZoom(10) // Zoom out para mostrar toda la ruta
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

      setSelectedDestination({
        name: location.name || 'Destino desconocido',
        lat: lat,
        lon: lon,
        displayName: location.displayName || location.name || 'Destino desconocido',
      })
      setDestination(location.name || '')
      setError(null)

      // Obtener ruta directa al destino seleccionado
      if (currentLocation) {
        getDirectRouteToDestination([currentLocation.latitude, currentLocation.longitude], [lat, lon])
      }
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
        setRoutePath({ direct: route })
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

    // Usar ubicación actual o San José como origen por defecto
    const originLat = currentLocation?.latitude ?? 9.9281
    const originLon = currentLocation?.longitude ?? -84.0907

    setPlanning(true)
    setLoadingRoute(true)
    setError(null)
    setSelectedRoute(null)
    setRoutePath(null)
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
          id: r.route?.routeId || Math.random().toString(),
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
        setIsMenuOpen(false) // Close drawer to show results on map

        // Build route path using GTFS shape data + OSRM for walking segments
        const newRoutePath: RoutePath = {}
        const bestRoute = data.routes[0]

        // Fetch walking and bus routes in parallel
        const routePromises: Promise<void>[] = []

        // Walking from user location to boarding stop (OSRM walking)
        if (currentLocation && bestRoute.boardingStop) {
          routePromises.push(
            getOSRMRoute(
              [currentLocation.latitude, currentLocation.longitude],
              [bestRoute.boardingStop.lat, bestRoute.boardingStop.lon],
              'foot'
            ).then((coords) => {
              if (coords) {
                newRoutePath.walking = coords
              } else {
                // Fallback: straight line
                newRoutePath.walking = [
                  [currentLocation.latitude, currentLocation.longitude],
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

        // Bus route: use GTFS shape points, or OSRM driving as fallback
        if (bestRoute.shapePoints && bestRoute.shapePoints.length > 0) {
          newRoutePath.bus = bestRoute.shapePoints.map((p: any) => [p.lat, p.lon] as [number, number])
        } else if (bestRoute.boardingStop && bestRoute.alightingStop) {
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

        // Fit map to show the full route
        if (data.origin && data.destination) {
          fitRouteToBounds({
            direct: [
              [data.origin.lat, data.origin.lon],
              [data.destination.lat, data.destination.lon]
            ]
          })
        } else {
          fitRouteToBounds(newRoutePath)
        }

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
          } catch (err) {
            console.error('Error loading map stops:', err)
          }
        }
      } else {
        setPlannedRoutes([])
        setHasPlanned(true)
        setError('No se encontraron rutas para tu destino. Intenta con otra ubicación.')
        setIsMenuOpen(false)
      }
    } catch (err: any) {
      console.error('Error al planificar ruta:', err)
      setError('Error al buscar rutas. Por favor intenta de nuevo.')
    } finally {
      setPlanning(false)
      setLoadingRoute(false)
    }
  }

  const handleResetSearch = () => {
    // Detener seguimiento si está activo
    if (trackingId) {
      navigator.geolocation.clearWatch(trackingId)
      setTrackingId(null)
    }

    setIsTracking(false)
    setTripStartTime(null)
    setElapsedTime(0)
    setDistanceRemaining(0)
    setShowArrivalNotification(false)
    setTrackingPanelVisible(true)

    setDestination('')
    setSelectedDestination(null)
    setPlannedRoutes([])
    setSelectedRoute(null)
    setRoutePath(null)
    setBusStops(null)
    setHasPlanned(false)
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
    if (!currentLocation || !selectedRoute) {
      return
    }

    setIsTracking(true)
    setTripStartTime(new Date())
    setElapsedTime(0)
    setTrackingPanelVisible(false) // Esconder panel al empezar

    // Calcular distancia inicial al destino
    if (selectedRoute.destinationStop?.coordinates) {
      const initialDistance = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        selectedRoute.destinationStop.coordinates.latitude,
        selectedRoute.destinationStop.coordinates.longitude
      )
      setDistanceRemaining(initialDistance)
    }

    // Centrar mapa en ubicación actual
    setMapCenter([currentLocation.latitude, currentLocation.longitude])
    setMapZoom(14)

    // Iniciar seguimiento de posición con watchPosition
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setCurrentLocation({ latitude, longitude })

        // Calcular distancia restante
        if (selectedRoute.destinationStop?.coordinates) {
          const remaining = calculateDistance(
            latitude,
            longitude,
            selectedRoute.destinationStop.coordinates.latitude,
            selectedRoute.destinationStop.coordinates.longitude
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

  const handleStopTrip = () => {
    if (trackingId) {
      navigator.geolocation.clearWatch(trackingId)
      setTrackingId(null)
    }
    setIsTracking(false)
    setTripStartTime(null)
    setElapsedTime(0)
    setDistanceRemaining(0)
    setTrackingPanelVisible(true)
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

      {/* Panel de seguimiento de viaje - Centrado horizontalmente */}
      {isTracking && trackingPanelVisible && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-40 max-w-[240px] w-full">
          <Card className="bg-white/95 backdrop-blur-sm shadow-lg border-2 border-[#E31837]">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#10B981] rounded-full flex items-center justify-center">
                    <Bus className="w-4 h-4 text-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#374151] text-xs">Viaje en curso</h3>
                    <p className="text-xs text-[#6B7280]">{selectedRoute?.routeNumber}</p>
                  </div>
                </div>
                <Badge className="bg-[#10B981] text-white border-none text-xs">
                  Activo
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-xs text-[#6B7280]">Restante</p>
                  <p className="font-bold text-[#E31837] text-sm">
                    {distanceRemaining.toFixed(1)} km
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#6B7280]">Tiempo</p>
                  <p className="font-bold text-[#0052B4] text-sm">
                    {elapsedTime < 60
                      ? `${Math.floor(elapsedTime)} min`
                      : `${Math.floor(elapsedTime / 60)}h ${Math.floor(elapsedTime % 60)}min`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
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
      <header className="absolute top-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm shadow-md">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full sm:w-96 overflow-y-auto">
                <div className="mt-8 space-y-4">
                  {/* Header Content */}
                  <div className="flex items-center gap-2 pb-4 border-b">
                    <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-full">
                      <Bus className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold leading-tight">
                        <span className="text-[#0052B4]">Ruta</span>
                        <span className="text-[#E31837]">Tica</span>
                      </h1>
                      <p className="text-xs text-gray-500">Toda Costa Rica en una APP</p>
                    </div>
                  </div>

                  {/* Current Route Info */}
                  {hasPlanned && (
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

                                    {/* Current Location Info */}
                  {!hasPlanned && currentLocation && (
                    <Card className="shadow-sm border border-[#E5E7EB]">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-[#0052B4] rounded-full flex items-center justify-center">
                            <MapPin className="w-3.5 h-3.5 text-white" />
                          </div>
                          <span className="font-semibold text-sm text-[#374151]">Origen (tu ubicación)</span>
                        </div>
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
                          onChange={setDestination}
                          onSelect={handleDestinationSelect}
                          placeholder="Escribe el destino..."
                          disabled={planning}
                        />
                      </div>

                      {selectedDestination && (
                        <Button
                          onClick={handlePlanRoute}
                          disabled={planning}
                          className="w-full h-11 text-base font-semibold bg-[#E31837] hover:bg-[#C41230] shadow-md"
                        >
                          {planning ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Calculando ruta...
                            </>
                          ) : (
                            <>
                              <Navigation className="w-5 h-5 mr-2" />
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
                          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-2">
                            <Bus className="w-6 h-6 text-[#E31837]" />
                          </div>
                          <span className="font-semibold text-sm text-[#374151]">Rutas</span>
                        </CardContent>
                      </Card>

                      <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-[#E5E7EB]">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                          <div className="w-12 h-12 bg-yellow-50 rounded-full flex items-center justify-center mb-2">
                            <Clock className="w-6 h-6 text-[#F59E0B]" />
                          </div>
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
                                setDestination(name)
                                setSelectedDestination({
                                  name: name,
                                  lat: dest.lat,
                                  lon: dest.lon,
                                  displayName: name,
                                })
                                // Show direct route on map
                                if (currentLocation) {
                                  getDirectRouteToDestination(
                                    [currentLocation.latitude, currentLocation.longitude],
                                    [dest.lat, dest.lon]
                                  )
                                }
                              }}
                              disabled={planning}
                              className="h-auto py-3 flex flex-col items-center gap-2 border border-[#E5E7EB] hover:border-[#FECACA] hover:bg-red-50 text-[#374151]"
                            >
                              <MapPin className="w-5 h-5 text-[#E31837]" />
                              <span className="font-semibold text-sm leading-tight text-center line-clamp-2">{dest.displayName || dest.name}</span>
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
                                className="h-auto py-3 flex flex-col items-center gap-2 border border-[#E5E7EB] hover:border-[#FECACA] hover:bg-red-50 text-[#374151]"
                              >
                                <MapPin className="w-5 h-5 text-[#E31837]" />
                                <span className="font-semibold text-sm">{dest}</span>
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
              <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-full">
                <Bus className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight">
                  <span className="text-[#0052B4]">Ruta</span>
                  <span className="text-[#E31837]">Tica</span>
                </h1>
                <p className="text-xs text-gray-500">
                  {isTracking ? '🚌 Viaje en curso' : hasPlanned ? `Ruta a ${destination}` : '¿A dónde vamos hoy?'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasPlanned && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetSearch}
                  className="text-sm border-[#E5E7EB] text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                >
                  <X className="w-4 h-4 mr-1" />
                  Reiniciar
                </Button>
              )}
              <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100">
                <Bell className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Bottom Route Results Panel - Visible after search */}
      {hasPlanned && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-[#E5E7EB] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Header with route count and reset */}
          <div className="px-4 pb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2 text-gray-800">
              <Bus className="w-5 h-5 text-red-600" />
              Rutas Encontradas
              {plannedRoutes.length > 0 && (
                <Badge className="bg-red-600 text-white border-none">{plannedRoutes.length}</Badge>
              )}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetSearch}
              className="text-xs border-[#E5E7EB] text-gray-600 hover:bg-red-50 hover:text-red-600"
            >
              <X className="w-3 h-3 mr-1" />
              Cerrar
            </Button>
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

          {/* No routes message */}
          {!error && plannedRoutes.length === 0 && (
            <div className="px-4 pb-4">
              <Card className="p-4 text-center shadow-sm border border-[#E5E7EB]">
                <Bus className="w-12 h-12 mx-auto text-[#9CA3AF] mb-3" />
                <p className="text-[#6B7280] text-sm">
                  No se encontraron rutas disponibles hacia "{destination}".
                  Intenta con otro destino más cercano.
                </p>
              </Card>
            </div>
          )}

          {/* Route cards - scrollable */}
          {plannedRoutes.length > 0 && (
            <div className="max-h-[45vh] overflow-y-auto px-4 pb-4 space-y-3 scrollbar-thin">
              {plannedRoutes.map((route) => (
                <Card
                  key={route.id}
                  className={`hover:shadow-md transition-all cursor-pointer shadow-sm ${
                    selectedRoute?.id === route.id
                      ? 'ring-2 ring-[#E31837] shadow-md border border-[#FECACA]'
                      : 'border border-[#E5E7EB] hover:border-[#FECACA]'
                  }`}
                  onClick={async () => {
                    setSelectedRoute(route)
                    const rp: RoutePath = {}
                    const promises: Promise<void>[] = []

                    // Walking to boarding stop
                    if (currentLocation && route.boardingStop?.coordinates) {
                      promises.push(
                        getOSRMRoute(
                          [currentLocation.latitude, currentLocation.longitude],
                          [route.boardingStop.coordinates.latitude, route.boardingStop.coordinates.longitude],
                          'foot'
                        ).then((coords) => {
                          rp.walking = coords || [
                            [currentLocation.latitude, currentLocation.longitude],
                            [route.boardingStop.coordinates.latitude, route.boardingStop.coordinates.longitude],
                          ]
                        })
                      )
                    }

                    // Bus segment
                    if (route._shapePoints && route._shapePoints.length > 0) {
                      rp.bus = route._shapePoints.map(p => [p.lat, p.lon] as [number, number])
                    } else if (route.boardingStop?.coordinates && route.destinationStop?.coordinates) {
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
                          rp.walking2 = coords || [
                            [route.destinationStop.coordinates.latitude, route.destinationStop.coordinates.longitude],
                            [selectedDestination.lat, selectedDestination.lon],
                          ]
                        })
                      )
                    }

                    await Promise.all(promises)
                    setRoutePath(rp)
                    fitRouteToBounds(rp)
                  }}
                >
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {/* Route Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
                            <Bus className="w-5 h-5 text-[#E31837]" />
                          </div>
                          <div>
                            <span className="font-bold text-lg text-[#374151]">{route.routeNumber}</span>
                            <Badge variant="outline" className="ml-2 text-xs border-[#BFDBFE] text-[#0052B4]">
                              {route.company}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {plannedRoutes.indexOf(route) === 0 && (
                            <Badge className="text-xs bg-green-100 text-green-700 border-none">
                              <Star className="w-3 h-3 mr-1" />
                              Mejor opción
                            </Badge>
                          )}
                          {plannedRoutes.indexOf(route) === 1 && (
                            <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700 border-none">
                              Buena
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Key Metrics */}
                      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-3 shadow-md">
                        <div className="flex items-center justify-between text-white">
                          <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            <span className="text-sm font-medium">Tiempo total</span>
                          </div>
                          <span className="text-2xl font-bold">
                            {route.durationMin ? formatDuration(route.durationMin) : '--'}
                          </span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between text-white/90">
                          <div className="flex items-center gap-1">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-sm font-medium">{formatPrice(route.price)}</span>
                          </div>
                          {route._walkingDistanceKm !== undefined && route._walkingDistanceKm > 0 && (
                            <div className="flex items-center gap-1">
                              <Navigation className="w-4 h-4" />
                              <span className="text-sm">{route._walkingDistanceKm.toFixed(1)} km caminando</span>
                            </div>
                          )}
                        </div>
                        {(route._departTime || route._arriveTime) && (
                          <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between text-white/90">
                            {route._departTime && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs opacity-75">Sale:</span>
                                <span className="text-sm font-semibold">{route._departTime}</span>
                              </div>
                            )}
                            {route._arriveTime && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs opacity-75">Llega:</span>
                                <span className="text-sm font-semibold">{route._arriveTime}</span>
                              </div>
                            )}
                            {route._transfers !== undefined && route._transfers > 0 && (
                              <Badge className="bg-white/20 text-white border-none text-xs">
                                {route._transfers} transbordo{route._transfers > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Route Path Details */}
                      <div className="bg-gradient-to-r from-blue-50 to-red-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex flex-col items-center">
                            <div className="w-3 h-3 rounded-full bg-[#0052B4]" />
                            <div className="w-0.5 h-6 bg-blue-200" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-[#6B7280] mb-0.5">Sube en:</p>
                            <p className="font-semibold text-sm text-[#374151]">{route.boardingStop.name}</p>
                            {route._boardingStopDistanceKm !== undefined && route._boardingStopDistanceKm > 0 && (
                              <p className="text-xs text-[#0052B4] mt-0.5 font-medium">
                                {route._boardingStopDistanceKm.toFixed(2)} km de tu ubicación
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-center">
                          <ArrowRight className="w-4 h-4 text-[#9CA3AF]" />
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-3 h-3 rounded-full bg-[#E31837]" />
                          <div className="flex-1">
                            <p className="text-xs text-[#6B7280] mb-0.5">Baja en:</p>
                            <p className="font-semibold text-sm text-[#374151]">
                              {route.destinationStop?.name || route.destination}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Empezar Viaje Button */}
              {selectedRoute && (
                <div className="pt-1">
                  {!isTracking ? (
                    <Button
                      onClick={(e) => { e.stopPropagation(); handleStartTrip() }}
                      className="w-full h-12 text-base font-semibold bg-[#10B981] hover:bg-[#059669] shadow-md"
                    >
                      <Navigation className="w-5 h-5 mr-2" />
                      Empezar Viaje
                    </Button>
                  ) : (
                    <Button
                      onClick={(e) => { e.stopPropagation(); handleStopTrip() }}
                      className="w-full h-12 text-base font-semibold bg-white text-red-600 border-2 border-red-600 hover:bg-red-50"
                    >
                      <Navigation className="w-5 h-5 mr-2" />
                      Detener Viaje
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
              <Bus className="w-5 h-5" />
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