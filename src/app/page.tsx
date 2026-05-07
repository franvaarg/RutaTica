'use client'

import { useState, useEffect } from 'react'
import { MapPin, Bus, Navigation, Clock, DollarSign, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
  }
  destinationStop: {
    name: string
    city: string | null
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

export default function BusPlannerApp() {
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null)
  const [nearestStop, setNearestStop] = useState<NearestStop | null>(null)
  const [destination, setDestination] = useState('')
  const [plannedRoutes, setPlannedRoutes] = useState<PlanatedRoute[]>([])
  const [hasPlanned, setHasPlanned] = useState(false)
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Obtener ubicación al cargar
  useEffect(() => {
    getCurrentLocation()
  }, [])

  const getCurrentLocation = async () => {
    setLoadingLocation(true)
    setError(null)
    try {
      if (!navigator.geolocation) {
        setError('La geolocalización no está soportada en tu navegador')
        setLoadingLocation(false)
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

      // Buscar la parada más cercana
      await findNearestStop(latitude, longitude)
    } catch (error) {
      console.error('Error al obtener ubicación:', error)
      setError('No se pudo obtener tu ubicación. Por favor activa el GPS y permite el acceso.')
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
        // Obtener la parada más cercana de la respuesta
        if (data.routes && data.routes.length > 0) {
          // La API nearby no devuelve paradas directamente, necesitamos llamar a la API de planificación
        }
      }
    } catch (error) {
      console.error('Error al buscar parada cercana:', error)
    }
  }

  const handlePlanRoute = async () => {
    if (!destination.trim() || !currentLocation) {
      setError('Por favor ingresa un destino y espera a obtener tu ubicación')
      return
    }

    setPlanning(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/routes/plan?lat=${currentLocation.latitude}&lon=${currentLocation.longitude}&destination=${encodeURIComponent(destination)}`
      )
      const data = await response.json()

      if (data.success) {
        setPlannedRoutes(data.routes)
        setNearestStop(data.nearestStop)
        setHasPlanned(true)

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
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePlanRoute()
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
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-2">
            <Bus className="w-8 h-8" />
            <h1 className="text-2xl font-bold">Planificador de Rutas</h1>
          </div>
          <p className="text-center text-sm text-primary-foreground/80 mt-1">
            Encuentra las rutas de autobuses para llegar a tu destino
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 max-w-2xl">
        {/* Location Card */}
        <Card className="mb-6 border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Tu Ubicación Actual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingLocation ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Obteniendo tu ubicación...</span>
              </div>
            ) : currentLocation ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-green-600" />
                  <span className="font-mono text-xs">
                    {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
                  </span>
                </div>
                {nearestStop && (
                  <div className="flex items-center gap-2 text-sm">
                    <Navigation className="w-4 h-4 text-primary" />
                    <span>
                      Parada más cercana: <strong>{nearestStop.name}</strong>
                      {nearestStop.city && ` (${nearestStop.city})`}
                    </span>
                    <Badge variant="secondary" className="ml-auto">
                      {nearestStop.distance.toFixed(1)} km
                    </Badge>
                  </div>
                )}
                <Button
                  onClick={getCurrentLocation}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  <MapPin className="w-4 h-4 mr-1" />
                  Actualizar ubicación
                </Button>
              </div>
            ) : (
              <div className="text-center py-4">
                <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground mb-2">
                  {error || 'No se pudo obtener tu ubicación'}
                </p>
                <Button onClick={getCurrentLocation} variant="outline">
                  <MapPin className="w-4 h-4 mr-1" />
                  Activar GPS
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Destination Input */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-primary" />
              ¿Hacia dónde quieres ir?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="text"
              placeholder="Escribe el nombre del destino (ej: Liberia, Puntarenas, Limón...)"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!currentLocation}
              className="text-lg"
            />
            <Button
              onClick={handlePlanRoute}
              disabled={!currentLocation || !destination.trim() || planning}
              className="w-full"
              size="lg"
            >
              {planning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Calculando ruta...
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4 mr-2" />
                  Buscar Ruta
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && !hasPlanned && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 text-center text-destructive">
              {error}
            </CardContent>
          </Card>
        )}

        {/* Planned Routes */}
        {hasPlanned && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Bus className="w-5 h-5" />
              Rutas Encontradas
              {plannedRoutes.length > 0 && (
                <Badge variant="secondary">{plannedRoutes.length}</Badge>
              )}
            </h2>

            {plannedRoutes.length === 0 ? (
              <Card className="p-8 text-center">
                <Bus className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No se encontraron rutas disponibles hacia "{destination}".
                  Intenta con otro destino más cercano o verifica que el nombre sea correcto.
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {plannedRoutes.map((route) => (
                  <Card key={route.id} className="hover:shadow-md transition-shadow border-primary/20">
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        {/* Route Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Bus className="w-5 h-5 text-primary" />
                            <span className="font-bold text-lg">{route.routeNumber}</span>
                            <Badge variant="outline">{route.company}</Badge>
                          </div>
                          <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-bold text-lg">
                            <DollarSign className="w-5 h-5" />
                            {formatPrice(route.price)}
                          </div>
                        </div>

                        {/* Route Path */}
                        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                          {/* Boarding */}
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center">
                              <div className="w-3 h-3 rounded-full bg-primary" />
                              <div className="w-0.5 h-8 bg-primary/30" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-muted-foreground mb-1">Sube en:</p>
                              <p className="font-semibold">{route.boardingStop.name}</p>
                              {route.boardingStop.city && (
                                <p className="text-sm text-muted-foreground">{route.boardingStop.city}</p>
                              )}
                              <p className="text-xs text-primary mt-1">
                                {route.nearbyStops[0]?.distance.toFixed(1)} km de tu ubicación
                              </p>
                            </div>
                          </div>

                          {/* Arrow */}
                          <div className="flex items-center justify-center">
                            <ArrowRight className="w-6 h-6 text-primary" />
                          </div>

                          {/* Destination */}
                          <div className="flex items-start gap-3">
                            <div>
                              <div className="w-3 h-3 rounded-full bg-green-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-muted-foreground mb-1">Baja en:</p>
                              <p className="font-semibold">
                                {route.destinationStop?.name || route.destination}
                              </p>
                              {route.destinationStop?.city && (
                                <p className="text-sm text-muted-foreground">{route.destinationStop.city}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Route Details */}
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          {formatDistance(route.distanceKm) && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {formatDistance(route.distanceKm)}
                            </div>
                          )}
                          {formatDuration(route.durationMin) && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
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
        {!hasPlanned && !error && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Destinos Populares</h3>
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
                  className="h-auto py-3 flex flex-col items-center gap-1"
                >
                  <MapPin className="w-5 h-5" />
                  <span>{dest}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-muted/50 border-t mt-auto py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 BusApp - Planificador de Rutas de Autobuses</p>
        </div>
      </footer>
    </div>
  )
}
