import { useState, useEffect, useCallback, useRef } from 'react'
import { zonesApi, type ZonesGeoJSON } from '../services/zonesApi'
import { geofencing, type GeofenceResult, type GeofenceTransition, type MatchedZone } from '../services/geofencing'
import type { LocationData } from './useLocation'

interface UseGeofencingOptions {
  /** Location data from useLocation hook */
  location: LocationData | null
  /** Callback when entering a zone */
  onEnterZone?: (zone: MatchedZone) => void
  /** Callback when exiting a zone */
  onExitZone?: (zone: MatchedZone) => void
  /** Callback when any transition occurs */
  onTransition?: (transition: GeofenceTransition) => void
}

interface UseGeofencingReturn {
  /** Current geofence check result */
  result: GeofenceResult | null
  /** Whether zones have been loaded */
  zonesLoaded: boolean
  /** Loading state */
  isLoading: boolean
  /** Error message if any */
  error: string | null
  /** Manually refresh zones */
  refreshZones: () => Promise<void>
  /** Recent transitions (for UI display) */
  recentTransitions: GeofenceTransition[]
}

/**
 * Hook for geofencing with automatic zone fetching and transition detection
 */
export function useGeofencing(options: UseGeofencingOptions): UseGeofencingReturn {
  const { location, onEnterZone, onExitZone, onTransition } = options

  const [result, setResult] = useState<GeofenceResult | null>(null)
  const [zonesLoaded, setZonesLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentTransitions, setRecentTransitions] = useState<GeofenceTransition[]>([])

  // Keep track of callbacks in ref to avoid re-running effect
  const callbacksRef = useRef({ onEnterZone, onExitZone, onTransition })
  callbacksRef.current = { onEnterZone, onExitZone, onTransition }

  // Fetch zones on mount
  const refreshZones = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      await zonesApi.fetchZones(true) // Force refresh
      setZonesLoaded(true)
      geofencing.resetTransitions() // Reset since zones changed
      console.log('[Geofencing] Zones refreshed')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load zones'
      setError(message)
      console.error('[Geofencing] Zone fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial zone fetch
  useEffect(() => {
    const loadZones = async () => {
      setIsLoading(true)
      try {
        await zonesApi.fetchZones()
        setZonesLoaded(geofencing.hasZones())
        setError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load zones'
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    loadZones()
  }, [])

  // Check geofence on location updates
  useEffect(() => {
    if (!location || !zonesLoaded) {
      return
    }

    const { result: checkResult, transitions } = geofencing.checkWithTransitions(
      location.latitude,
      location.longitude
    )

    setResult(checkResult)

    // Handle transitions
    if (transitions.length > 0) {
      // Add to recent (keep last 10)
      setRecentTransitions(prev => [...transitions, ...prev].slice(0, 10))

      // Fire callbacks
      for (const transition of transitions) {
        callbacksRef.current.onTransition?.(transition)

        if (transition.type === 'enter') {
          callbacksRef.current.onEnterZone?.(transition.zone)
        } else {
          callbacksRef.current.onExitZone?.(transition.zone)
        }
      }
    }
  }, [location, zonesLoaded])

  return {
    result,
    zonesLoaded,
    isLoading,
    error,
    refreshZones,
    recentTransitions,
  }
}
