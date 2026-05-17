'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, MapPin, Home, Building2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LocationSuggestion {
  id: string | number
  name: string
  displayName: string
  type: 'barrio' | 'localidad' | 'ciudad' | 'lugar'
  lat: number
  lon: number
  fullAddress: string
  locationData?: {
    barrio?: string
    localidad?: string
    canton?: string
    provincia?: string
  }
}

interface LocationAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (location: LocationSuggestion) => void
  placeholder?: string
  disabled?: boolean
}

// Datos en memoria de ubicaciones comunes de Costa Rica
const COSTA_RICA_LOCATIONS: LocationSuggestion[] = [
  { id: '1', name: 'San José', displayName: 'San José - San José', type: 'ciudad', lat: 9.9281, lon: -84.0907, fullAddress: 'San José, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'San José', localidad: 'San José', barrio: '' } },
  { id: '2', name: 'Alajuela', displayName: 'Alajuela - Alajuela', type: 'ciudad', lat: 10.0163, lon: -84.2169, fullAddress: 'Alajuela, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'Alajuela', localidad: 'Alajuela', barrio: '' } },
  { id: '3', name: 'Cartago', displayName: 'Cartago - Cartago', type: 'ciudad', lat: 9.8652, lon: -83.9145, fullAddress: 'Cartago, Cartago, Costa Rica', locationData: { provincia: 'Cartago', canton: 'Cartago', localidad: 'Cartago', barrio: '' } },
  { id: '4', name: 'Heredia', displayName: 'Heredia - Heredia', type: 'ciudad', lat: 10.0020, lon: -84.1170, fullAddress: 'Heredia, Heredia, Costa Rica', locationData: { provincia: 'Heredia', canton: 'Heredia', localidad: 'Heredia', barrio: '' } },
  { id: '5', name: 'Puntarenas', displayName: 'Puntarenas - Puntarenas', type: 'ciudad', lat: 9.9779, lon: -84.8331, fullAddress: 'Puntarenas, Puntarenas, Costa Rica', locationData: { provincia: 'Puntarenas', canton: 'Puntarenas', localidad: 'Puntarenas', barrio: '' } },
  { id: '6', name: 'Limón', displayName: 'Limón - Limón', type: 'ciudad', lat: 10.0015, lon: -83.0583, fullAddress: 'Limón, Limón, Costa Rica', locationData: { provincia: 'Limón', canton: 'Limón', localidad: 'Limón', barrio: '' } },
  { id: '7', name: 'Liberia', displayName: 'Liberia - Guanacaste', type: 'ciudad', lat: 10.6324, lon: -85.4363, fullAddress: 'Liberia, Guanacaste, Costa Rica', locationData: { provincia: 'Guanacaste', canton: 'Liberia', localidad: 'Liberia', barrio: '' } },
  { id: '8', name: 'San Pedro', displayName: 'San Pedro - Montes de Oca', type: 'localidad', lat: 9.9349, lon: -84.0520, fullAddress: 'San Pedro, Montes de Oca, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Montes de Oca', localidad: 'San Pedro', barrio: '' } },
  { id: '9', name: 'Desamparados', displayName: 'Desamparados - Desamparados', type: 'ciudad', lat: 9.9023, lon: -84.0737, fullAddress: 'Desamparados, Desamparados, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Desamparados', localidad: 'Desamparados', barrio: '' } },
  { id: '10', name: 'San Isidro', displayName: 'San Isidro - Pérez Zeledón', type: 'localidad', lat: 9.3768, lon: -83.6979, fullAddress: 'San Isidro, Pérez Zeledón, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Pérez Zeledón', localidad: 'San Isidro', barrio: '' } },
  { id: '11', name: 'Ciudad Quesada', displayName: 'Ciudad Quesada - Alajuela', type: 'ciudad', lat: 10.3275, lon: -84.4372, fullAddress: 'Ciudad Quesada, San Carlos, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'San Carlos', localidad: 'Ciudad Quesada', barrio: '' } },
  { id: '12', name: 'Guápiles', displayName: 'Guápiles - Limón', type: 'ciudad', lat: 10.2149, lon: -83.7777, fullAddress: 'Guápiles, Pococí, Limón, Costa Rica', locationData: { provincia: 'Limón', canton: 'Pococí', localidad: 'Guápiles', barrio: '' } },
  { id: '13', name: 'San Ramón', displayName: 'San Ramón - Alajuela', type: 'ciudad', lat: 10.0870, lon: -84.4798, fullAddress: 'San Ramón, San Ramón, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'San Ramón', localidad: 'San Ramón', barrio: '' } },
  { id: '14', name: 'Grecia', displayName: 'Grecia - Alajuela', type: 'ciudad', lat: 9.9554, lon: -84.3179, fullAddress: 'Grecia, Grecia, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'Grecia', localidad: 'Grecia', barrio: '' } },
  { id: '15', name: 'Orotina', displayName: 'Orotina - Alajuela', type: 'ciudad', lat: 9.9090, lon: -84.5242, fullAddress: 'Orotina, Orotina, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'Orotina', localidad: 'Orotina', barrio: '' } },
  { id: '16', name: 'Atenas', displayName: 'Atenas - Alajuela', type: 'ciudad', lat: 9.9815, lon: -84.3835, fullAddress: 'Atenas, Atenas, Alajuela, Costa Rica', locationData: { provincia: 'Alajuela', canton: 'Atenas', localidad: 'Atenas', barrio: '' } },
  { id: '17', name: 'Puriscal', displayName: 'Puriscal - San José', type: 'ciudad', lat: 9.8511, lon: -84.3294, fullAddress: 'Santiago, Puriscal, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Puriscal', localidad: 'Santiago', barrio: '' } },
  { id: '18', name: 'Escazú', displayName: 'Escazú - San José', type: 'ciudad', lat: 9.9280, lon: -84.1417, fullAddress: 'Escazú, Escazú, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Escazú', localidad: 'Escazú', barrio: '' } },
  { id: '19', name: 'Santa Ana', displayName: 'Santa Ana - San José', type: 'ciudad', lat: 9.9333, lon: -84.1817, fullAddress: 'Santa Ana, Santa Ana, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Santa Ana', localidad: 'Santa Ana', barrio: '' } },
  { id: '20', name: 'Alajuelita', displayName: 'Alajuelita - San José', type: 'ciudad', lat: 9.9017, lon: -84.1028, fullAddress: 'Alajuelita, Alajuelita, San José, Costa Rica', locationData: { provincia: 'San José', canton: 'Alajuelita', localidad: 'Alajuelita', barrio: '' } },
]

export default function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Escribe el destino...",
  disabled = false,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchTimeout = useRef<NodeJS.Timeout>()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Usar el valor prop directamente en lugar de sincronizar con state
  const displayValue = value || ''

  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Buscar sugerencias mientras el usuario escribe (usando datos en memoria)
  useEffect(() => {
    const query = displayValue.trim()

    // Limpiar timeout anterior
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current)
    }

    if (query.length < 2) {
      // Usar setTimeout para evitar setState síncrono en effect
      searchTimeout.current = setTimeout(() => {
        setSuggestions([])
        setShowSuggestions(false)
      }, 0)
      return
    }

    // Esperar 300ms después de que el usuario deje de escribir
    searchTimeout.current = setTimeout(() => {
      const searchTerm = query.toLowerCase()

      // Filtrar ubicaciones en memoria
      const filtered = COSTA_RICA_LOCATIONS.filter(loc =>
        loc.name.toLowerCase().includes(searchTerm) ||
        loc.displayName.toLowerCase().includes(searchTerm) ||
        loc.locationData?.provincia?.toLowerCase().includes(searchTerm) ||
        loc.locationData?.canton?.toLowerCase().includes(searchTerm)
      )

      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    }, 300)

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current)
      }
    }
  }, [displayValue])

  const handleSelect = (location: LocationSuggestion) => {
    setSelectedLocation(location)
    onChange(location.name)
    onSelect(location)
    setShowSuggestions(false)
  }

  const handleClear = () => {
    onChange('')
    setSelectedLocation(null)
    setSuggestions([])
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'barrio':
        return <Home className="w-4 h-4 text-orange-600" />
      case 'localidad':
        return <MapPin className="w-4 h-4 text-[#10B981]" />
      case 'ciudad':
        return <Building2 className="w-4 h-4 text-[#0052B4]" />
      default:
        return <MapPin className="w-4 h-4 text-gray-600" />
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            const newValue = e.target.value
            onChange(newValue)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (displayValue.length >= 2 && suggestions.length > 0) {
              setShowSuggestions(true)
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="flex h-10 w-full min-w-0 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-[#0052B4] disabled:cursor-not-allowed disabled:opacity-50 pl-10 pr-10"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
        {selectedLocation && displayValue && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
            onClick={handleClear}
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Lista de sugerencias */}
      {showSuggestions && (
        <div className="absolute z-50 w-full mt-1 bg-white text-popover-foreground rounded-lg border border-[#E5E7EB] shadow-md max-h-64 overflow-y-auto">
          {suggestions.length === 0 ? (
            <div className="p-4">
              <div className="flex flex-col items-center text-center">
                <Search className="w-6 h-6 text-[#9CA3AF] mb-2" />
                <p className="text-xs text-[#6B7280]">
                  No se encontraron resultados para "{displayValue}"
                </p>
                <p className="text-[10px] text-[#6B7280] mt-1">
                  Intenta con otro nombre de ciudad o localidad
                </p>
              </div>
            </div>
          ) : (
            <div className="p-1">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  onClick={() => handleSelect(suggestion)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-blue-50 hover:text-[#0052B4] focus:bg-blue-50 focus:text-[#0052B4] cursor-pointer outline-none transition-colors"
                  onMouseEnter={(e) => e.currentTarget.focus()}
                >
                  {getIcon(suggestion.type)}
                  <div className="flex flex-col text-left flex-1">
                    <span className="font-medium text-[#374151]">{suggestion.name}</span>
                    <span className="text-xs text-[#6B7280] truncate">
                      {suggestion.displayName}
                    </span>
                  </div>
                  <span className="text-xs text-[#9CA3AF] capitalize whitespace-nowrap">
                    {suggestion.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
