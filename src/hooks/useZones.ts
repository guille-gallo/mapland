import { useState, useEffect, useCallback } from 'react'
import type { FeatureCollection, Polygon } from 'geojson'
import { zonesApi, type Zone } from '../services/zonesApi'

interface UseZonesResult {
  /** All zones from the database */
  zones: Zone[]
  /** Zones as GeoJSON FeatureCollection */
  featureCollection: FeatureCollection<Polygon>
  /** Loading state */
  isLoading: boolean
  /** Error message if any */
  error: string | null
  /** Whether Supabase is configured */
  isSupabaseConfigured: boolean
  /** Refresh zones from database */
  refresh: () => Promise<void>
  /** Publish a FeatureCollection to database (replaces all) */
  publish: (fc: FeatureCollection<Polygon>) => Promise<void>
  /** Delete all zones from database */
  deleteAll: () => Promise<void>
}

/**
 * React hook for managing zones data from Supabase
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { zones, isLoading, error, refresh, publish } = useZones()
 *   
 *   if (isLoading) return <div>Loading...</div>
 *   if (error) return <div>Error: {error}</div>
 *   
 *   return (
 *     <div>
 *       {zones.map(zone => (
 *         <div key={zone.id}>{zone.name}</div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useZones(): UseZonesResult {
  const [zones, setZones] = useState<Zone[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isSupabaseConfigured = zonesApi.isAvailable()

  const featureCollection: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: zones.map((zone) => ({
      type: 'Feature',
      id: zone.id,
      properties: {
        name: zone.name,
        zoneType: zone.zoneType,
        message: zone.message,
        createdAt: zone.createdAt,
        updatedAt: zone.updatedAt,
      },
      geometry: zone.geometry,
    })),
  }

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      setError('Supabase not configured')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const data = await zonesApi.getAll()
      setZones(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch zones'
      setError(message)
      console.error('useZones refresh error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isSupabaseConfigured])

  const publish = useCallback(async (fc: FeatureCollection<Polygon>) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase not configured')
    }

    setIsLoading(true)
    setError(null)

    try {
      const published = await zonesApi.publishAll(fc)
      setZones(published)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish zones'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [isSupabaseConfigured])

  const deleteAll = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase not configured')
    }

    setIsLoading(true)
    setError(null)

    try {
      await zonesApi.deleteAll()
      setZones([])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete zones'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [isSupabaseConfigured])

  // Initial load
  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    zones,
    featureCollection,
    isLoading,
    error,
    isSupabaseConfigured,
    refresh,
    publish,
    deleteAll,
  }
}

export default useZones
