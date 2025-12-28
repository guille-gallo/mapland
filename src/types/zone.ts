export type ZoneType = 'danger' | 'suggested'

export interface ZoneConfig {
  type: ZoneType
  label: string
  color: string
  fillColor: string
  fillOpacity: number
}

export const ZONE_CONFIGS: Record<ZoneType, ZoneConfig> = {
  danger: {
    type: 'danger',
    label: 'Danger Zone',
    color: 'transparent',
    fillColor: 'rgba(255, 0, 0, 0.5)',
    fillOpacity: 0.5,
  },
  suggested: {
    type: 'suggested',
    label: 'Suggested Zone',
    color: 'transparent',
    fillColor: 'rgba(4, 170, 4, 0.5)',
    fillOpacity: 0.5,
  },
}

/**
 * Properties stored on GeoJSON features (used in Editor and MapView)
 */
export interface ZoneFeatureProperties {
  /** Unique identifier (UUID from database, or temporary client-side ID) */
  id?: string
  /** Display name of the zone */
  name?: string
  /** Zone classification */
  zoneType?: ZoneType
  /** Message shown when user enters this zone (for mobile geofencing) */
  message?: string | null
  /** ISO timestamp of creation */
  createdAt?: string
  /** ISO timestamp of last update */
  updatedAt?: string
}

/**
 * Extended zone data structure for full zone management
 * Used when working with database operations
 */
export interface ZoneData {
  id?: string
  name: string
  zoneType: ZoneType
  message?: string | null
  createdAt?: string
  updatedAt?: string
}
