/**
 * Realtime Location Tracking Types
 *
 * Protocol for Supabase Realtime Broadcast channel.
 * Used by both web MapView (receiver) and mobile app (sender).
 *
 * Channel: 'mapland:tracking'
 * Events:
 *   - 'location' : User broadcasts their position
 *   - 'status'   : User changes status (active/inactive/sos)
 *   - 'leave'    : User explicitly leaves tracking
 */

// ============================================================================
// User & Device Identification
// ============================================================================

/**
 * Unique identifier for a tracked user/device.
 * In production, this could be a Supabase Auth user ID.
 * For now, we use a simple client-generated ID.
 */
export type UserId = string

/**
 * User status for visual indicators on the map
 */
export type UserStatus = 'active' | 'inactive' | 'sos'

/**
 * User metadata that doesn't change frequently
 */
export interface UserInfo {
  /** Unique user/device identifier */
  userId: UserId
  /** Display name (user-entered or device name) */
  displayName: string
  /** Optional avatar URL or emoji */
  avatar?: string
  /** Device type for debugging/analytics */
  deviceType?: 'ios' | 'android' | 'web' | 'simulator'
}

// ============================================================================
// Location Payload
// ============================================================================

/**
 * GPS coordinates with optional accuracy data
 */
export interface GeoPosition {
  /** Latitude in decimal degrees (WGS84) */
  latitude: number
  /** Longitude in decimal degrees (WGS84) */
  longitude: number
  /** Horizontal accuracy in meters (from GPS) */
  accuracy?: number
  /** Altitude in meters above sea level */
  altitude?: number
  /** Compass heading in degrees (0-360, 0 = North) */
  heading?: number
  /** Speed in meters per second */
  speed?: number
}

/**
 * Full location broadcast payload
 */
export interface LocationPayload {
  /** User identification */
  user: UserInfo
  /** Current GPS position */
  position: GeoPosition
  /** Current user status */
  status: UserStatus
  /** ISO timestamp when this reading was taken */
  timestamp: string
  /** Optional: zones the user is currently inside */
  currentZones?: Array<{
    id: string
    name: string
    zoneType: string
  }>
}

// ============================================================================
// Realtime Events
// ============================================================================

/**
 * Event types for the tracking channel
 */
export type TrackingEventType = 'location' | 'status' | 'leave'

/**
 * Location update event (most frequent)
 */
export interface LocationEvent {
  type: 'broadcast'
  event: 'location'
  payload: LocationPayload
}

/**
 * Status change event (less frequent)
 */
export interface StatusEvent {
  type: 'broadcast'
  event: 'status'
  payload: {
    user: UserInfo
    status: UserStatus
    timestamp: string
  }
}

/**
 * User leaving the tracking session
 */
export interface LeaveEvent {
  type: 'broadcast'
  event: 'leave'
  payload: {
    userId: UserId
    timestamp: string
  }
}

// ============================================================================
// Channel Configuration
// ============================================================================

/**
 * Supabase Realtime channel name for location tracking
 */
export const TRACKING_CHANNEL = 'mapland:tracking'

/**
 * How often to broadcast location updates (milliseconds)
 * Balance between real-time feel and battery/bandwidth
 */
export const LOCATION_BROADCAST_INTERVAL = 3000 // 3 seconds

/**
 * Consider a user "stale" if no update received in this time
 */
export const USER_STALE_TIMEOUT = 15000 // 15 seconds

/**
 * Remove user from map if no update received in this time
 */
export const USER_OFFLINE_TIMEOUT = 60000 // 1 minute

// ============================================================================
// MapView State
// ============================================================================

/**
 * Tracked user state for MapView rendering
 */
export interface TrackedUser {
  /** User info from last broadcast */
  user: UserInfo
  /** Latest position */
  position: GeoPosition
  /** Current status */
  status: UserStatus
  /** When we last received an update */
  lastSeen: Date
  /** Zones they're currently in */
  currentZones?: LocationPayload['currentZones']
  /** Computed: is this user's data stale? */
  isStale?: boolean
}

/**
 * GeoJSON Feature for rendering user locations on map
 */
export interface UserLocationFeature {
  type: 'Feature'
  properties: {
    userId: UserId
    displayName: string
    status: UserStatus
    isStale: boolean
    heading?: number
    accuracy?: number
  }
  geometry: {
    type: 'Point'
    coordinates: [number, number] // [lng, lat]
  }
}

/**
 * Convert TrackedUser to GeoJSON Feature for Mapbox
 */
export function trackedUserToFeature(user: TrackedUser): UserLocationFeature {
  return {
    type: 'Feature',
    properties: {
      userId: user.user.userId,
      displayName: user.user.displayName,
      status: user.status,
      isStale: user.isStale ?? false,
      heading: user.position.heading,
      accuracy: user.position.accuracy,
    },
    geometry: {
      type: 'Point',
      coordinates: [user.position.longitude, user.position.latitude],
    },
  }
}
