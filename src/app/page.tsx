'use client'

import { useState, useEffect } from 'react'
import { MapPin, Bus, Navigation, Clock, DollarSign, ArrowRight, Loader2, Map, Home, Star, Bell, Menu, Search, Heart, User, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
  walking?: [number, number][]
  bus?: [number, number][]
  direct?: [number, number][]
}

interface BusStop {
  id: string
  name: string
  lat: number
  lon: number
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

  useEffect(() => {
    getCurrentLocation()
  }, [])

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

  const getCurrentLocation = async () => {
    setLoadingLocation(true)
    setLoadingAddress(true)
    setError(null)
    try {
      if (!navigator.geolocation) {
        setError('La geolocalización no está soportada en tu navegador')
        setLoadingLocation(false)
        setLoadingAddress(false)
        return
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        )
      })

      const { latitude, longitude } = position.coords
      setCurrentLocation({ latitude, longitude })
      const address = await getAddressFromCoordinates(latitude, longitude)
      setCurrentAddress(address)
      await findNearestStop(latitude, longitude)
    } catch (error) {
      console.error('Error al obtener ubicación:', error)
      setError('No se pudo obtener tu ubicación. Por favor activa el GPS y permite el acceso.')
    } finally {
      setLoadingLocation(false)
      setLoadingAddress(false)
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
    if (!destination.trim() || !currentLocation) {
      setError('Por favor ingresa un destino y espera a obtener tu ubicación')
      return
    }

    setPlanning(true)
    setLoadingRoute(true)
    setError(null)
    setSelectedRoute(null)
    setRoutePath(null)
    setBusStops(null)

    try {
      const response = await fetch(
        `/api/routes/plan?lat=${currentLocation.latitude}&lon=${currentLocation.longitude}&destination=${encodeURIComponent(destination)}`
      )
      const data = await response.json()

      if (data.success) {
        setPlannedRoutes(data.routes)
        setNearestStop(data.nearestStop)
        setHasPlanned(true)

        if (data.routes.length > 0) {
          setSelectedRoute(data.routes[0])

          // Obtener rutas reales de las calles usando OSRM
          const route = data.routes[0]
          const newRoutePath: RoutePath = {}

          // Ruta caminando desde ubicación actual hasta parada de embarque
          if (route.boardingStop?.coordinates && currentLocation) {
            const walkingRoute = await getOSRMRoute(
              [currentLocation.latitude, currentLocation.longitude],
              [route.boardingStop.coordinates.latitude, route.boardingStop.coordinates.longitude],
              'walking'
            )
            if (walkingRoute) {
              newRoutePath.walking = walkingRoute
            }
          }

          // Ruta en autobús desde parada de embarque hasta destino
          if (route.boardingStop?.coordinates && route.destinationStop?.coordinates) {
            const busRoute = await getOSRMRoute(
              [route.boardingStop.coordinates.latitude, route.boardingStop.coordinates.longitude],
              [route.destinationStop.coordinates.latitude, route.destinationStop.coordinates.longitude],
              'driving'
            )
            if (busRoute) {
              newRoutePath.bus = busRoute
            }
          }

          setRoutePath(newRoutePath)

          // Obtener paradas de autobús de OpenStreetMap alrededor de la ruta
          const bounds = getRouteBounds(newRoutePath)
          if (bounds) {
            const stops = await getBusStopsFromOSM(bounds)
            setBusStops(stops)
          }
        }

        if (data.routes.length === 0) {
          setError('No se encontraron rutas hacia ese destino. Intenta con otro destino.')
        }
      } else {
        setError(data.error || 'Error al planificar la ruta')
      }
    } catch (error) {
      console.error('Error al planificar ruta:', error)
      setError('Error de conexión. Por favor intenta de nuevo.')
    } finally {
      setPlanning(false)
      setLoadingRoute(false)
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

  return (
    <div className="min-h-screen bg-white dark:from-gray-900 dark:to-gray-800 flex flex-col pb-20">
      {/* Header RutaTica Style */}
      <header className="bg-white text-gray-800 shadow-md">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
            <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100">
              <Bell className="w-5 h-5" />
            </Button>
          </div>
          <div className="mt-3">
            <h2 className="text-lg font-semibold text-[#333333]">¿A dónde vamos hoy?</h2>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-4 max-w-lg">
        {/* Search Bar */}
        <Card className="mb-4 shadow-sm border border-[#E5E7EB]">
          <CardContent className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF]" />
              <Input
                placeholder="Buscar destino"
                className="pl-10 h-10 border border-[#E5E7EB] focus:border-[#0052B4] text-sm"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePlanRoute()}
              />
              <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-[#9CA3AF] hover:text-[#0052B4]">
                <MapPin className="w-5 h-5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Access Buttons */}
        {!hasPlanned && (
          <div className="grid grid-cols-2 gap-3 mb-4">
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

        {/* Route Planning Section */}
        <Card className="mb-4 shadow-md border border-[#E5E7EB]">
          <CardContent className="p-4 space-y-4">
            {/* Origen */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-[#0052B4] rounded-full flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-semibold text-sm text-[#374151]">Origen</span>
              </div>
              {loadingLocation || loadingAddress ? (
                <div className="flex items-center gap-2 text-muted-foreground p-3 bg-blue-50 rounded-lg border border-[#E5E7EB]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#0052B4]" />
                  <span className="text-sm">
                    {loadingLocation ? 'Obteniendo ubicación...' : 'Obteniendo dirección...'}
                  </span>
                </div>
              ) : currentLocation ? (
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
              ) : (
                <Button
                  onClick={getCurrentLocation}
                  variant="outline"
                  size="sm"
                  className="w-full h-10 text-sm border border-[#E5E7EB] text-[#0052B4] hover:bg-blue-50 hover:border-[#0052B4]"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Activar GPS
                </Button>
              )}
            </div>

            {/* Separator */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-dashed border-[#E5E7EB]"></div>
              </div>
              <div className="relative flex justify-center">
                <div className="bg-white px-3">
                  <ArrowRight className="w-5 h-5 text-[#9CA3AF]" />
                </div>
              </div>
            </div>

            {/* Destino */}
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
                disabled={!currentLocation || planning}
              />
            </div>

            {/* Buscar Ruta Button */}
            <Button
              onClick={handlePlanRoute}
              disabled={!currentLocation || !destination.trim() || planning}
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
          </CardContent>
        </Card>

        {/* Map Card */}
        {currentLocation && (
          <Card className="mb-4 shadow-sm border border-[#E5E7EB]">
            <CardContent className="p-2">
              <div className="relative w-full h-[40vh] min-h-[280px] max-h-[350px] rounded-lg overflow-hidden border border-[#E5E7EB] shadow-sm">
                {(loadingRoute || loadingDirectRoute || loadingBusStops) && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#E31837]" />
                      <p className="text-sm text-[#6B7280]">
                        {loadingRoute ? 'Obteniendo ruta de calles...' :
                         loadingDirectRoute ? 'Obteniendo ruta al destino...' :
                         'Buscando paradas de autobús...'}
                      </p>
                    </div>
                  </div>
                )}
                <BusMap
                  center={[currentLocation.latitude, currentLocation.longitude]}
                  zoom={14}
                  userLocation={[currentLocation.latitude, currentLocation.longitude]}
                  nearestStop={nearestStop}
                  plannedRoutes={plannedRoutes}
                  selectedRoute={selectedRoute}
                  destinationCoordinates={selectedDestination ? {
                    name: selectedDestination.name || 'Destino',
                    latitude: selectedDestination.lat,
                    longitude: selectedDestination.lon,
                    displayName: selectedDestination.displayName
                  } : null}
                  routePath={routePath}
                  busStops={busStops}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Message */}
        {error && !hasPlanned && (
          <Card className="mb-4 border border-[#FECACA] bg-red-50">
            <CardContent className="p-4 text-center text-[#DC2626]">
              {error}
            </CardContent>
          </Card>
        )}

        {/* Planned Routes */}
        {hasPlanned && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
              <Bus className="w-5 h-5 text-red-600" />
              Rutas Encontradas
              {plannedRoutes.length > 0 && (
                <Badge className="bg-red-600 text-white border-none">{plannedRoutes.length}</Badge>
              )}
            </h2>

            {plannedRoutes.length === 0 ? (
              <Card className="p-6 text-center shadow-sm border border-[#E5E7EB]">
                <Bus className="w-16 h-16 mx-auto text-[#9CA3AF] mb-4" />
                <p className="text-[#6B7280] text-sm">
                  No se encontraron rutas disponibles hacia "{destination}".
                  Intenta con otro destino más cercano o verifica que el nombre sea correcto.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {plannedRoutes.map((route) => (
                  <Card
                    key={route.id}
                    className={`hover:shadow-md transition-all cursor-pointer shadow-sm ${
                      selectedRoute?.id === route.id
                        ? 'ring-2 ring-[#E31837] shadow-md border border-[#FECACA]'
                        : 'border border-[#E5E7EB] hover:border-[#FECACA]'
                    }`}
                    onClick={() => setSelectedRoute(route)}
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
                            <div className="flex items-center gap-1 text-[#E31837] font-bold text-lg">
                              <DollarSign className="w-5 h-5" />
                              {formatPrice(route.price)}
                            </div>
                          </div>
                        </div>

                        {/* Route Path */}
                        <div className="bg-gradient-to-r from-blue-50 to-red-50 rounded-lg p-3 space-y-2">
                          {/* Boarding */}
                          <div className="flex items-start gap-2">
                            <div className="flex flex-col items-center">
                              <div className="w-3 h-3 rounded-full bg-[#0052B4]" />
                              <div className="w-0.5 h-8 bg-blue-200" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-[#6B7280] mb-1">Sube en:</p>
                              <p className="font-semibold text-sm text-[#374151]">{route.boardingStop.name}</p>
                              {route.boardingStop.city && (
                                <p className="text-xs text-[#6B7280]">{route.boardingStop.city}</p>
                              )}
                              <p className="text-xs text-[#0052B4] mt-1 font-medium">
                                {route.nearbyStops[0]?.distance.toFixed(1)} km de tu ubicación
                              </p>
                            </div>
                          </div>

                          {/* Arrow */}
                          <div className="flex items-center justify-center">
                            <ArrowRight className="w-5 h-5 text-[#9CA3AF]" />
                          </div>

                          {/* Destination */}
                          <div className="flex items-start gap-2">
                            <div>
                              <div className="w-3 h-3 rounded-full bg-[#E31837]" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-[#6B7280] mb-1">Baja en:</p>
                              <p className="font-semibold text-sm text-[#374151]">
                                {route.destinationStop?.name || route.destination}
                              </p>
                              {route.destinationStop?.city && (
                                <p className="text-xs text-[#6B7280]">{route.destinationStop.city}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Route Details */}
                        <div className="flex flex-wrap gap-3 text-xs text-[#6B7280]">
                          {formatDistance(route.distanceKm) && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4 text-[#0052B4]" />
                              {formatDistance(route.distanceKm)}
                            </div>
                          )}
                          {formatDuration(route.durationMin) && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4 text-[#F59E0B]" />
                              {formatDuration(route.durationMin)}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Popular Destinations */}
        {!hasPlanned && !error && currentLocation && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg text-[#374151]">Destinos Populares</h3>
            <div className="grid grid-cols-2 gap-3">
              {['Liberia', 'Puntarenas', 'Limón', 'Alajuela', 'Ciudad Quesada', 'Guápiles'].map((dest) => (
                <Button
                  key={dest}
                  variant="outline"
                  onClick={() => {
                    setDestination(dest)
                    handlePlanRoute()
                  }}
                  disabled={!currentLocation || planning}
                  className="h-auto py-3 flex flex-col items-center gap-2 border border-[#E5E7EB] hover:border-[#FECACA] hover:bg-red-50 text-[#374151]"
                >
                  <MapPin className="w-5 h-5 text-[#E31837]" />
                  <span className="font-semibold text-sm">{dest}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E5E7EB] shadow-md z-50">
        <div className="flex justify-around items-center py-2 px-2 max-w-lg mx-auto">
          <Button variant="ghost" className="flex flex-col items-center gap-1 h-16 w-16 text-[#E31837] hover:bg-red-50">
            <Home className="w-6 h-6" />
            <span className="text-xs font-medium">Inicio</span>
          </Button>
          <Button variant="ghost" className="flex flex-col items-center gap-1 h-16 w-16 text-[#6B7280] hover:bg-gray-50">
            <Bus className="w-6 h-6" />
            <span className="text-xs font-medium">Rutas</span>
          </Button>
          <Button variant="ghost" className="flex flex-col items-center gap-1 h-16 w-16 text-[#6B7280] hover:bg-gray-50">
            <Map className="w-6 h-6" />
            <span className="text-xs font-medium">Mapa</span>
          </Button>
          <Button variant="ghost" className="flex flex-col items-center gap-1 h-16 w-16 text-[#6B7280] hover:bg-gray-50">
            <Wallet className="w-6 h-6" />
            <span className="text-xs font-medium">Pagos</span>
          </Button>
          <Button variant="ghost" className="flex flex-col items-center gap-1 h-16 w-16 text-[#6B7280] hover:bg-gray-50">
            <User className="w-6 h-6" />
            <span className="text-xs font-medium">Perfil</span>
          </Button>
        </div>
      </nav>
    </div>
  )
}
