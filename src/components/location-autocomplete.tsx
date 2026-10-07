'use client'

import { isPassengerStop } from '@/lib/passenger-stops'

import { useState, useEffect, useRef, useId } from 'react'
import { Search, MapPin, Home, Building2, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

import type { LocationSuggestion } from '@/lib/search-localities'

interface LocationAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (location: LocationSuggestion) => void
  placeholder?: string
  disabled?: boolean
  /** When true, suggestions are hidden and no search is triggered. Resets on next user keystroke. */
  suppressSuggestions?: boolean
  savedLocations?: Array<{ name: string; lat: number; lon: number; displayName?: string; label?: string }>
}

const foldSearch = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Datos en memoria de ubicaciones comunes de Costa Rica (usadas como sugerencias iniciales)


// Mapear tipos de Nominatim a nuestros tipos
function mapNominatimType(nominatimType: string, addr: any): 'barrio' | 'localidad' | 'ciudad' | 'lugar' {
  if (nominatimType === 'neighbourhood' || nominatimType === 'suburb') return 'barrio'
  if (nominatimType === 'village' || nominatimType === 'hamlet' || nominatimType === 'town') return 'localidad'
  if (nominatimType === 'city') return 'ciudad'
  return 'lugar'
}

export default function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Escribe el destino...",
  disabled = false,
  suppressSuggestions = false,
  savedLocations = [],
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searchError, setSearchError] = useState('')
  const listId = useId()
  const requestRef = useRef<AbortController | null>(null)
  const searchTimeout = useRef<NodeJS.Timeout | undefined>(undefined)
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

  // Buscar sugerencias mientras el usuario escribe
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    requestRef.current?.abort()
    requestRef.current = controller
    // If suppressSuggestions is active, skip searching entirely
    if (suppressSuggestions || selectedLocation) {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
      return
    }

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
        setLoading(false)
      }, 0)
      return
    }

    // Esperar 400ms después de que el usuario deje de escribir
    searchTimeout.current = setTimeout(async () => {
      setLoading(true)
      setSearchError('')
      let results: LocationSuggestion[] = []

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Search unavailable')
        const data = await response.json()
        results = data.results || []
        const saved = savedLocations.filter(item => foldSearch(item.name + ' ' + (item.label || '')).includes(foldSearch(query)))
          .map((item, index) => ({ id: `saved-${index}`, name: item.name, lat: item.lat, lon: item.lon, displayName: item.label ? `${item.label} · ${item.name}` : item.name, fullAddress: 'Ubicación guardada', type: 'lugar' as const, resultType: 'PLACE' as const }))
        results = [...saved, ...results].slice(0, 12)
      } catch {
        if (cancelled || controller.signal.aborted) return
        setSearchError('No se pudo buscar. Intenta de nuevo.')
        setSuggestions([])
        setShowSuggestions(true)
        setLoading(false)
        return
      }
      // Usar setTimeout para evitar setState síncrono en effect
      setTimeout(() => {
        if (cancelled || controller.signal.aborted) return
        setActiveIndex(-1)
        setSearchError('')
        setSuggestions(results)
        setShowSuggestions(true)
        setLoading(false)
        // Broaden through a place provider only on explicit request.
      }, 0)
    }, 400)

    return () => {
      cancelled = true
      controller.abort()
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current)
      }
    }
  }, [displayValue, suppressSuggestions, selectedLocation])

  const handleSelect = (location: LocationSuggestion) => {
    requestRef.current?.abort()
    setSelectedLocation(location)
    setShowSuggestions(false)
    setActiveIndex(-1)
    setLoading(false)
    onSelect(location)
  }

  const handleClear = () => {
    requestRef.current?.abort()
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    setLoading(false)
    setActiveIndex(-1)
    onChange('')
    setSelectedLocation(null)
    setSuggestions([])
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'parada':
        return <MapPin className="w-4 h-4 text-blue-700" />
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

  // Public Nominatim is queried only after an explicit action, never on each keystroke.
  const searchPlaces = async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setSearchError('')
    try {
      const response = await fetch(`/api/search?places=1&q=${encodeURIComponent(displayValue)}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      })
      if (!response.ok) throw new Error('Search unavailable')
      const data = await response.json()
      if (controller.signal.aborted) return
      setSuggestions((data.results || []).filter((item: LocationSuggestion) => isPassengerStop(item.name, item.fullAddress)).slice(0, 8))
      setShowSuggestions(true)
      setActiveIndex(-1)
    } catch {
      if (!controller.signal.aborted) setSearchError('No se pudieron buscar lugares. Intenta con otra localidad o reintenta.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && showSuggestions) {
      e.preventDefault()
      e.stopPropagation()
      setShowSuggestions(false)
      setActiveIndex(-1)
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setShowSuggestions(true)
      setActiveIndex(i => Math.max(0, Math.min(suggestions.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))))
    }
    if (e.key === 'Enter' && showSuggestions && suggestions[activeIndex]) {
      e.preventDefault()
      handleSelect(suggestions[activeIndex])
    } else if (e.key === 'Enter' && displayValue.trim().length >= 2) {
      e.preventDefault()
      searchPlaces()
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
            setSelectedLocation(null)
            setActiveIndex(-1)
            onChange(newValue)
            setLoading(false) // Reiniciar para buscar primero en memoria
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (!displayValue && savedLocations.length) {
              setSuggestions(savedLocations.map((item, index) => ({ id: `saved-${index}`, name: item.name, lat: item.lat, lon: item.lon, displayName: item.label ? `${item.label} · ${item.name}` : item.displayName || item.name, fullAddress: 'Ubicación guardada', type: 'lugar' })))
              setShowSuggestions(true)
              return
            }
            if (!selectedLocation && !suppressSuggestions && displayValue.length >= 2 && suggestions.length > 0) {
              setShowSuggestions(true)
            }
          }}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions && !suppressSuggestions}
          aria-controls={listId}
          aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-label={placeholder}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="flex h-11 w-full min-w-0 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:border-[#0052B4] disabled:cursor-not-allowed disabled:opacity-50 pl-10 pr-10"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0052B4] animate-spin" />
        ) : selectedLocation && displayValue ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 p-0 hover:bg-muted"
            aria-label="Borrar ubicación"
            onClick={handleClear}
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </Button>
        ) : null}
      </div>

      {/* Lista de sugerencias */}
      {showSuggestions && !suppressSuggestions && (
        <div className="absolute z-50 w-full mt-1 bg-white text-popover-foreground rounded-lg border border-[#E5E7EB] shadow-md max-h-64 overflow-y-auto">
          {loading ? (
            <div className="p-4 flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 text-[#0052B4] animate-spin mb-2" />
              <p className="text-xs text-[#6B7280]">Buscando en Costa Rica...</p>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-4">
              <div className="flex flex-col items-center text-center">
                <Search className="w-6 h-6 text-[#9CA3AF] mb-2" />
                <p className="text-xs text-[#6B7280]">
                  No encontramos esa localidad o parada.
                </p>
                <p className="text-[10px] text-[#6B7280] mt-1">
                  Intenta con otro nombre de ciudad o localidad
                </p>
              </div>
            </div>
          ) : (
            <div className="p-1" role="listbox" id={listId}>
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  type="button"
                  onClick={() => handleSelect(suggestion)}
                  className="min-h-11 w-full flex items-center gap-2 px-3 py-2 aria-selected:bg-blue-50 text-sm rounded-md hover:bg-blue-50 hover:text-[#0052B4] focus:bg-blue-50 focus:text-[#0052B4] cursor-pointer outline-none transition-colors"

                >
                  {getIcon(suggestion.type)}
                  <div className="flex flex-col text-left flex-1 min-w-0">
                    <span className="font-medium text-[#374151]">{suggestion.name}</span>
                    <span className="text-xs text-[#6B7280] break-words">
                      {suggestion.displayName}
                    </span>
                    {suggestion.fullAddress && <span className="text-xs text-gray-600 break-words">{suggestion.fullAddress}</span>}
                  </div>
                  <span className="text-xs text-[#9CA3AF] capitalize whitespace-nowrap">
                    {suggestion.type === 'parada' ? 'Parada de bus' : suggestion.type === 'lugar' ? 'Lugar' : 'Localidad'}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button type="button" className="min-h-11 w-full px-3 text-sm text-blue-800" disabled={loading} onClick={searchPlaces}>Buscar lugares</button>
          {searchError && <p role="status" className="p-3 text-sm text-red-700">{searchError}</p>}
        </div>
      )}
    </div>
  )
}
