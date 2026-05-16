'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, MapPin, Home, Building2, Check, X } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
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

interface SearchError {
  message: string
  fromCache?: boolean
}

interface LocationAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (location: LocationSuggestion) => void
  placeholder?: string
  disabled?: boolean
}

export default function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Escribe el destino...",
  disabled = false,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null)
  const [inputValue, setInputValue] = useState(value)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [error, setError] = useState<SearchError | null>(null)
  const searchTimeout = useRef<NodeJS.Timeout>()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sincronizar inputValue con value cuando cambia externamente
  useEffect(() => {
    setInputValue(value)
    if (!value) {
      setSelectedLocation(null)
    }
  }, [value])

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

  // Buscar sugerencias mientras el usuario escribe
  useEffect(() => {
    const query = inputValue.trim()

    // Limpiar timeout anterior
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current)
    }

    if (query.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setLoading(true)
    setError(null)

    // Esperar 300ms después de que el usuario deje de escribir
    searchTimeout.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/locations/search?q=${encodeURIComponent(query)}`
        )
        const data = await response.json()

        if (data.success) {
          setSuggestions(data.locations)
          if (data.locations.length > 0) {
            setShowSuggestions(true)
          } else {
            setShowSuggestions(false)
          }

          if (data.fromCache) {
            setError({
              message: 'Resultados de cache (servicio limitado)',
              fromCache: true,
            })
          }
        } else {
          setSuggestions([])
          setShowSuggestions(false)
          setError({
            message: data.error || 'Error al buscar',
            fromCache: false,
          })
        }
      } catch (error) {
        console.error('Error al buscar ubicaciones:', error)
        setSuggestions([])
        setShowSuggestions(false)
        setError({
          message: 'Error de conexión. Verifica tu internet.',
          fromCache: false,
        })
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current)
      }
    }
  }, [inputValue])

  const handleSelect = (location: LocationSuggestion) => {
    setSelectedLocation(location)
    setInputValue(location.name)
    onChange(location.name)
    onSelect(location)
    setShowSuggestions(false)
  }

  const handleClear = () => {
    setInputValue('')
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
        return <MapPin className="w-4 h-4 text-green-600" />
      case 'ciudad':
        return <Building2 className="w-4 h-4 text-blue-600" />
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
          value={inputValue}
          onChange={(e) => {
            const newValue = e.target.value
            setInputValue(newValue)
            onChange(newValue)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.length >= 2 && suggestions.length > 0) {
              setShowSuggestions(true)
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="flex h-10 w-full min-w-0 rounded-lg border-2 border-red-100 bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:border-red-500 disabled:cursor-not-allowed disabled:opacity-50 pl-10 pr-10"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        {selectedLocation && inputValue && (
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
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground rounded-lg border-2 border-red-100 shadow-lg max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-xs text-muted-foreground">Buscando...</span>
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="flex flex-col items-center text-center">
                <div className={`w-6 h-6 mb-2 rounded-full flex items-center justify-center ${error.fromCache ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'}`}>
                  ⚠️
                </div>
                <p className="text-xs text-muted-foreground">
                  {error.message}
                </p>
                {error.fromCache && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Los resultados son de búsqueda anterior
                  </p>
                )}
              </div>
            </div>
          ) : suggestions.length === 0 && inputValue.length >= 2 ? (
            <div className="p-4">
              <div className="flex flex-col items-center text-center">
                <Search className="w-6 h-6 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">
                  No se encontraron resultados para "{inputValue}"
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Intenta con otro nombre de barrio o localidad
                </p>
              </div>
            </div>
          ) : (
            <div className="p-1">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  onClick={() => handleSelect(suggestion)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-red-50 hover:text-red-700 focus:bg-red-50 focus:text-red-700 cursor-pointer outline-none transition-colors"
                  onMouseEnter={(e) => e.currentTarget.focus()}
                >
                  {getIcon(suggestion.type)}
                  <div className="flex flex-col text-left flex-1">
                    <span className="font-medium">{suggestion.name}</span>
                    <span className="text-xs text-gray-500 truncate">
                      {suggestion.displayName}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 capitalize whitespace-nowrap">
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
