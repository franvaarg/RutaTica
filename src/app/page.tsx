'use client'

import { useState } from 'react'
import { Search, MapPin, Bus, DollarSign, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

interface BusRoute {
  id: string
  company: string
  companyId: string
  companyPhone?: string | null
  companyEmail?: string | null
  companyWebsite?: string | null
  route: string
  origin: string
  destination: string
  price: number
  currency: string
  distance?: string | null
  duration?: string | null
  seatTypes?: Array<{
    type: string
    price: number
    currency: string
  }>
}

export default function BusPricesApp() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredRoutes, setFilteredRoutes] = useState<BusRoute[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<string | null>(null)
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    if (!searchTerm.trim()) return

    setSearching(true)
    try {
      const response = await fetch(`/api/routes/search?q=${encodeURIComponent(searchTerm)}`)
      const data = await response.json()

      if (data.success) {
        setFilteredRoutes(data.routes)
        setHasSearched(true)
      } else {
        console.error('Error en la búsqueda:', data.error)
        alert(data.error || 'Error al buscar rutas')
        setFilteredRoutes([])
        setHasSearched(true)
      }
    } catch (error) {
      console.error('Error al buscar rutas:', error)
      alert('Error de conexión. Por favor intenta de nuevo.')
      setFilteredRoutes([])
      setHasSearched(true)
    } finally {
      setSearching(false)
    }
  }

  const handleLocationSearch = async () => {
    setLoadingLocation(true)
    try {
      if (!navigator.geolocation) {
        alert('La geolocalización no está soportada en tu navegador')
        setLoadingLocation(false)
        return
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      })

      const { latitude, longitude } = position.coords
      setCurrentLocation(`Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`)

      // Llamar a la API de rutas cercanas
      const response = await fetch(`/api/routes/nearby?lat=${latitude}&lon=${longitude}`)
      const data = await response.json()

      if (data.success) {
        setFilteredRoutes(data.routes)
        setHasSearched(true)
      } else {
        console.error('Error en la búsqueda:', data.error)
        alert(data.error || 'Error al buscar rutas cercanas')
        setFilteredRoutes([])
        setHasSearched(true)
      }
    } catch (error) {
      console.error('Error al obtener ubicación:', error)
      alert('No se pudo obtener tu ubicación. Por favor activa el GPS y permite el acceso a la ubicación.')
      setFilteredRoutes([])
      setHasSearched(true)
    } finally {
      setLoadingLocation(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: 'CRC',
      minimumFractionDigits: 0,
    }).format(price)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-2">
            <Bus className="w-8 h-8" />
            <h1 className="text-2xl font-bold">Precios de Autobuses</h1>
          </div>
          <p className="text-center text-sm text-primary-foreground/80 mt-1">
            Consulta precios de pasajes en tiempo real
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 max-w-2xl">
        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="search">Buscar por Lugar</TabsTrigger>
            <TabsTrigger value="location">Mi Ubicación</TabsTrigger>
          </TabsList>

          {/* Search by Place Tab */}
          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Buscar Destino
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  type="text"
                  placeholder="Escribe el nombre del destino..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="text-lg"
                />
                <Button
                  onClick={handleSearch}
                  disabled={searching || !searchTerm.trim()}
                  className="w-full"
                  size="lg"
                >
                  {searching ? (
                    <>
                      <Bus className="w-4 h-4 mr-2 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Buscar Precios
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Location Tab */}
          <TabsContent value="location" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Usar Mi Ubicación
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Usaremos tu ubicación GPS para encontrar las rutas de autobuses disponibles cerca de ti.
                </p>
                <Button
                  onClick={handleLocationSearch}
                  disabled={loadingLocation}
                  className="w-full"
                  size="lg"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  {loadingLocation ? 'Obteniendo ubicación...' : 'Buscar Cerca de Mí'}
                </Button>
                {currentLocation && (
                  <p className="text-sm text-muted-foreground text-center">
                    Ubicación: {currentLocation}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Results */}
        {hasSearched && (
          <div className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {filteredRoutes.length === 0
                  ? 'No se encontraron rutas'
                  : `${filteredRoutes.length} Ruta${filteredRoutes.length !== 1 ? 's' : ''} Encontrada${filteredRoutes.length !== 1 ? 's' : ''}`}
              </h2>
            </div>

            {filteredRoutes.length === 0 ? (
              <Card className="p-8 text-center">
                <Bus className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No encontramos rutas que coincidan con tu búsqueda.
                  Intenta con otro nombre de destino.
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredRoutes.map((route) => (
                  <Card key={route.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        {/* Company Name */}
                        <div className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-muted-foreground" />
                          <span className="font-semibold text-lg">{route.company}</span>
                          <Badge variant="secondary">{route.route}</Badge>
                        </div>

                        {/* Route Info */}
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-medium">{route.origin}</span>
                          <MapPin className="w-4 h-4 text-primary" />
                          <span className="font-medium">{route.destination}</span>
                        </div>

                        {/* Details */}
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          {route.distance && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {route.distance}
                            </div>
                          )}
                          {route.duration && (
                            <div className="flex items-center gap-1">
                              <Bus className="w-4 h-4" />
                              {route.duration}
                            </div>
                          )}
                        </div>

                        {/* Price */}
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                            <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {formatPrice(route.price)}
                            </span>
                          </div>
                          <Button size="sm">
                            Ver Detalles
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Initial Welcome State */}
        {!hasSearched && (
          <div className="mt-8 space-y-4">
            <Card className="p-6 text-center bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20">
              <Bus className="w-16 h-16 mx-auto text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Bienvenido a BusApp</h3>
              <p className="text-muted-foreground">
                Busca precios de autobuses por nombre del lugar o usa tu ubicación actual
                para encontrar rutas cercanas.
              </p>
            </Card>

            {/* Featured Destinations */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Destinos Populares</h3>
              <div className="grid grid-cols-2 gap-3">
                {['Liberia', 'Puntarenas', 'Limón', 'Alajuela'].map((dest) => (
                  <Button
                    key={dest}
                    variant="outline"
                    onClick={async () => {
                      setSearchTerm(dest)
                      setSearching(true)
                      try {
                        const response = await fetch(`/api/routes/search?q=${encodeURIComponent(dest)}`)
                        const data = await response.json()
                        if (data.success) {
                          setFilteredRoutes(data.routes)
                          setHasSearched(true)
                        }
                      } catch (error) {
                        console.error('Error al buscar:', error)
                        alert('Error al buscar rutas')
                      } finally {
                        setSearching(false)
                      }
                    }}
                    disabled={searching}
                    className="h-auto py-3 flex flex-col items-center gap-1"
                  >
                    <MapPin className="w-5 h-5" />
                    <span>{dest}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-muted/50 border-t mt-auto py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 BusApp - Precios de Autobuses</p>
        </div>
      </footer>
    </div>
  )
}
