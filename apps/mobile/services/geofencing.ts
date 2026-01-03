import * as turf from '@turf/turf'
import { zonesApi, type ZonesGeoJSON, type ZoneFeature, type ZoneType } from './zonesApi'

export interface GeofenceResult {
  inside: boolean
  zones: MatchedZone[]
}

export interface MatchedZone {
  id: string
  name: string
  zoneType: ZoneType
  message: string | null
}

export interface GeofenceTransition {
  type: 'enter' | 'exit'
  zone: MatchedZone
}

/**
 * Geofencing service using Turf.js for client-side point-in-polygon checks.
 * This is more efficient than server calls for frequent location updates.
 */
class GeofencingService {
  private previousZoneIds: Set<string> = new Set()

  /**
   * Check if a point is inside any zone (client-side with Turf.js)
   */
  checkPoint(latitude: number, longitude: number): GeofenceResult {
    const cachedZones = zonesApi.getCachedZones()
    
    if (!cachedZones || cachedZones.features.length === 0) {
      return { inside: false, zones: [] }
    }

    const point = turf.point([longitude, latitude])
    const matchedZones: MatchedZone[] = []

    for (const feature of cachedZones.features) {
      // Skip boundary zones - they define perimeter, not actual geofence areas
      if (feature.properties.zoneType === 'boundary') {
        continue
      }

      try {
        const polygon = turf.polygon(feature.geometry.coordinates)
        
        if (turf.booleanPointInPolygon(point, polygon)) {
          matchedZones.push({
            id: feature.id,
            name: feature.properties.name,
            zoneType: feature.properties.zoneType,
            message: feature.properties.message,
          })
        }
      } catch (error) {
        // Invalid polygon geometry - skip
        console.warn(`[Geofencing] Invalid polygon ${feature.id}:`, error)
      }
    }

    return {
      inside: matchedZones.length > 0,
      zones: matchedZones,
    }
  }

  /**
   * Check point and detect zone transitions (enter/exit)
   * Call this with each location update to get transition events
   */
  checkWithTransitions(latitude: number, longitude: number): {
    result: GeofenceResult
    transitions: GeofenceTransition[]
  } {
    const result = this.checkPoint(latitude, longitude)
    const currentZoneIds = new Set(result.zones.map(z => z.id))
    const transitions: GeofenceTransition[] = []

    // Detect entries (zones we're now in but weren't before)
    for (const zone of result.zones) {
      if (!this.previousZoneIds.has(zone.id)) {
        transitions.push({ type: 'enter', zone })
      }
    }

    // Detect exits (zones we were in but aren't now)
    // Need to look up zone details from previous check
    const cachedZones = zonesApi.getCachedZones()
    if (cachedZones) {
      for (const prevId of this.previousZoneIds) {
        if (!currentZoneIds.has(prevId)) {
          const feature = cachedZones.features.find(f => f.id === prevId)
          if (feature) {
            transitions.push({
              type: 'exit',
              zone: {
                id: feature.id,
                name: feature.properties.name,
                zoneType: feature.properties.zoneType,
                message: feature.properties.message,
              },
            })
          }
        }
      }
    }

    // Update state
    this.previousZoneIds = currentZoneIds

    return { result, transitions }
  }

  /**
   * Reset transition tracking (e.g., when zones are refreshed)
   */
  resetTransitions(): void {
    this.previousZoneIds.clear()
  }

  /**
   * Get distance to nearest zone edge (useful for proximity alerts)
   */
  getDistanceToNearestZone(
    latitude: number, 
    longitude: number,
    zoneTypes: ZoneType[] = ['danger', 'suggested']
  ): { distance: number; zone: MatchedZone } | null {
    const cachedZones = zonesApi.getCachedZones()
    
    if (!cachedZones || cachedZones.features.length === 0) {
      return null
    }

    const point = turf.point([longitude, latitude])
    let nearest: { distance: number; zone: MatchedZone } | null = null

    for (const feature of cachedZones.features) {
      if (!zoneTypes.includes(feature.properties.zoneType)) {
        continue
      }

      try {
        const polygon = turf.polygon(feature.geometry.coordinates)
        const line = turf.polygonToLine(polygon)
        
        // Distance in kilometers
        const distance = turf.pointToLineDistance(point, line, { units: 'kilometers' })
        
        if (!nearest || distance < nearest.distance) {
          nearest = {
            distance,
            zone: {
              id: feature.id,
              name: feature.properties.name,
              zoneType: feature.properties.zoneType,
              message: feature.properties.message,
            },
          }
        }
      } catch (error) {
        console.warn(`[Geofencing] Distance calc error for ${feature.id}:`, error)
      }
    }

    return nearest
  }

  /**
   * Check if zones have been loaded
   */
  hasZones(): boolean {
    const cached = zonesApi.getCachedZones()
    return cached !== null && cached.features.length > 0
  }
}

export const geofencing = new GeofencingService()
