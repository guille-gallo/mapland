import type { Feature, FeatureCollection, Polygon } from 'geojson'
import { supabase, isSupabaseConfigured } from './supabase'
import type { ZoneType } from '../types/zone'

/**
 * Database row type for zones table
 */
interface ZoneRow {
  id: string
  name: string
  zone_type: string
  geometry: Polygon
  message: string | null
  created_at: string
  updated_at: string
}

/**
 * Zone data structure for API operations
 */
export interface ZoneData {
  id?: string
  name: string
  zoneType: ZoneType
  geometry: Polygon
  message?: string | null
  createdAt?: string
  updatedAt?: string
}

/**
 * Zone with all fields populated (from database)
 */
export interface Zone extends ZoneData {
  id: string
  createdAt: string
  updatedAt: string
}

/**
 * Response from point-in-zone check
 */
export interface PointCheckResult {
  inside: boolean
  zones: {
    id: string
    name: string
    zoneType: ZoneType
    message: string | null
  }[]
}

/**
 * Convert a database row to Zone object
 */
function rowToZone(row: ZoneRow): Zone {
  return {
    id: row.id,
    name: row.name,
    zoneType: row.zone_type as ZoneType,
    geometry: row.geometry,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Convert a Zone to a GeoJSON Feature
 */
export function zoneToFeature(zone: Zone): Feature<Polygon> {
  return {
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
  }
}

/**
 * Convert a GeoJSON Feature to ZoneData for saving
 */
export function featureToZoneData(feature: Feature<Polygon>): ZoneData {
  const props = feature.properties || {}
  return {
    id: typeof feature.id === 'string' ? feature.id : undefined,
    name: props.name || 'Unnamed Zone',
    zoneType: props.zoneType || 'danger',
    geometry: feature.geometry,
    message: props.message || null,
  }
}

/**
 * Zones API service
 */
export const zonesApi = {
  /**
   * Check if Supabase is configured and available
   */
  isAvailable(): boolean {
    return isSupabaseConfigured()
  },

  /**
   * Fetch all zones from database
   */
  async getAll(): Promise<Zone[]> {
    if (!supabase) {
      console.warn('Supabase not configured, returning empty array')
      return []
    }

    const { data, error } = await supabase
      .from('zones')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch zones:', error)
      throw new Error(`Failed to fetch zones: ${error.message}`)
    }

    return ((data || []) as ZoneRow[]).map(rowToZone)
  },

  /**
   * Fetch all zones as GeoJSON FeatureCollection
   */
  async getAllAsGeoJSON(): Promise<FeatureCollection<Polygon>> {
    const zones = await this.getAll()
    return {
      type: 'FeatureCollection',
      features: zones.map(zoneToFeature),
    }
  },

  /**
   * Fetch a single zone by ID
   */
  async getById(id: string): Promise<Zone | null> {
    if (!supabase) {
      console.warn('Supabase not configured')
      return null
    }

    const { data, error } = await supabase
      .from('zones')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      console.error('Failed to fetch zone:', error)
      throw new Error(`Failed to fetch zone: ${error.message}`)
    }

    return rowToZone(data as ZoneRow)
  },

  /**
   * Create a new zone
   */
  async create(zoneData: ZoneData): Promise<Zone> {
    if (!supabase) {
      throw new Error('Supabase not configured')
    }

    const { data, error } = await supabase
      .from('zones')
      .insert({
        name: zoneData.name,
        zone_type: zoneData.zoneType,
        geometry: zoneData.geometry,
        message: zoneData.message || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create zone:', error)
      throw new Error(`Failed to create zone: ${error.message}`)
    }

    return rowToZone(data as ZoneRow)
  },

  /**
   * Update an existing zone
   */
  async update(id: string, zoneData: Partial<ZoneData>): Promise<Zone> {
    if (!supabase) {
      throw new Error('Supabase not configured')
    }

    const updatePayload: Record<string, unknown> = {}
    if (zoneData.name !== undefined) updatePayload.name = zoneData.name
    if (zoneData.zoneType !== undefined) updatePayload.zone_type = zoneData.zoneType
    if (zoneData.geometry !== undefined) updatePayload.geometry = zoneData.geometry
    if (zoneData.message !== undefined) updatePayload.message = zoneData.message

    const { data, error } = await supabase
      .from('zones')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Failed to update zone:', error)
      throw new Error(`Failed to update zone: ${error.message}`)
    }

    return rowToZone(data as ZoneRow)
  },

  /**
   * Delete a zone
   */
  async delete(id: string): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase not configured')
    }

    const { error } = await supabase
      .from('zones')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Failed to delete zone:', error)
      throw new Error(`Failed to delete zone: ${error.message}`)
    }
  },

  /**
   * Delete all zones
   */
  async deleteAll(): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase not configured')
    }

    const { error } = await supabase
      .from('zones')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (neq to impossible id)

    if (error) {
      console.error('Failed to delete all zones:', error)
      throw new Error(`Failed to delete all zones: ${error.message}`)
    }
  },

  /**
   * Publish a FeatureCollection to the database (replaces all zones)
   * Includes all zone types: danger, suggested, and boundary
   */
  async publishAll(featureCollection: FeatureCollection<Polygon>): Promise<Zone[]> {
    if (!supabase) {
      throw new Error('Supabase not configured')
    }

    // Delete all existing zones first
    await this.deleteAll()

    // Insert all zones (including boundary)
    const zonesToInsert = featureCollection.features
      .map((feature) => {
        const props = feature.properties || {}
        const zoneType = props.zoneType || 'danger'
        return {
          // Boundary zones can have empty name, others get 'Unnamed Zone' as fallback
          name: zoneType === 'boundary' ? (props.name || '') : (props.name || 'Unnamed Zone'),
          zone_type: zoneType,
          geometry: feature.geometry,
          message: props.message || null,
        }
      })

    if (zonesToInsert.length === 0) {
      return []
    }

    const { data, error } = await supabase
      .from('zones')
      .insert(zonesToInsert)
      .select()

    if (error) {
      console.error('Failed to publish zones:', error)
      throw new Error(`Failed to publish zones: ${error.message}`)
    }

    return ((data || []) as ZoneRow[]).map(rowToZone)
  },

  /**
   * Check if a point is inside any zone
   * Uses PostGIS ST_Contains for accurate spatial query
   */
  async checkPoint(latitude: number, longitude: number): Promise<PointCheckResult> {
    if (!supabase) {
      throw new Error('Supabase not configured')
    }

    const { data, error } = await supabase
      .rpc('check_point_in_zones', { lng: longitude, lat: latitude })

    if (error) {
      console.error('Failed to check point:', error)
      throw new Error(`Failed to check point: ${error.message}`)
    }

    interface CheckPointRow {
      zone_id: string
      zone_name: string
      zone_type: string
      message: string | null
    }

    const zones = ((data || []) as CheckPointRow[]).map((row) => ({
      id: row.zone_id,
      name: row.zone_name,
      zoneType: row.zone_type as ZoneType,
      message: row.message,
    }))

    return {
      inside: zones.length > 0,
      zones,
    }
  },
}

export default zonesApi
