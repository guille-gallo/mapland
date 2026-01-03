import { supabase, isSupabaseConfigured } from './supabase'
import { geofencing, type GeofenceResult } from './geofencing'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Realtime protocol types (mirrored from web)
export const TRACKING_CHANNEL = 'mapland:tracking'
export const LOCATION_BROADCAST_INTERVAL = 3000 // 3 seconds

export type UserStatus = 'active' | 'inactive' | 'sos'

export interface UserInfo {
  userId: string
  displayName: string
  avatar?: string
  deviceType: 'ios' | 'android' | 'web' | 'simulator'
}

export interface GeoPosition {
  latitude: number
  longitude: number
  accuracy?: number
  altitude?: number
  heading?: number
  speed?: number
}

export interface LocationPayload {
  user: UserInfo
  position: GeoPosition
  status: UserStatus
  timestamp: string
  currentZones?: Array<{
    id: string
    name: string
    zoneType: string
  }>
}

/**
 * Service for broadcasting user location to Supabase Realtime channel.
 * The web MapView subscribes to this channel to display user markers.
 */
class LocationBroadcastService {
  private channel: RealtimeChannel | null = null
  private userInfo: UserInfo | null = null
  private currentStatus: UserStatus = 'active'
  private isConnected = false

  /**
   * Initialize the broadcast service with user info
   */
  async initialize(userInfo: UserInfo): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) {
      console.warn('[Broadcast] Supabase not configured')
      return false
    }

    this.userInfo = userInfo

    try {
      this.channel = supabase.channel(TRACKING_CHANNEL)

      await new Promise<void>((resolve, reject) => {
        this.channel!.subscribe((status) => {
          console.log(`[Broadcast] Channel status: ${status}`)
          
          if (status === 'SUBSCRIBED') {
            this.isConnected = true
            resolve()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.isConnected = false
            reject(new Error(`Channel ${status}`))
          }
        })
      })

      console.log('[Broadcast] Connected to channel')
      return true
    } catch (error) {
      console.error('[Broadcast] Failed to connect:', error)
      return false
    }
  }

  /**
   * Broadcast current location
   */
  async broadcastLocation(position: GeoPosition): Promise<void> {
    if (!this.channel || !this.userInfo || !this.isConnected) {
      console.warn('[Broadcast] Not connected, skipping broadcast')
      return
    }

    // Get current zones for context
    const geofenceResult = geofencing.checkPoint(position.latitude, position.longitude)

    const payload: LocationPayload = {
      user: this.userInfo,
      position,
      status: this.currentStatus,
      timestamp: new Date().toISOString(),
      currentZones: geofenceResult.zones.map(z => ({
        id: z.id,
        name: z.name,
        zoneType: z.zoneType,
      })),
    }

    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'location',
        payload,
      })
    } catch (error) {
      console.error('[Broadcast] Failed to send location:', error)
    }
  }

  /**
   * Update user status (active/inactive/sos)
   */
  async setStatus(status: UserStatus): Promise<void> {
    this.currentStatus = status

    if (!this.channel || !this.userInfo || !this.isConnected) {
      return
    }

    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'status',
        payload: {
          user: this.userInfo,
          status,
          timestamp: new Date().toISOString(),
        },
      })
      console.log(`[Broadcast] Status changed to: ${status}`)
    } catch (error) {
      console.error('[Broadcast] Failed to send status:', error)
    }
  }

  /**
   * Trigger SOS alert
   */
  async triggerSOS(): Promise<void> {
    await this.setStatus('sos')
  }

  /**
   * Cancel SOS alert
   */
  async cancelSOS(): Promise<void> {
    await this.setStatus('active')
  }

  /**
   * Disconnect and send leave event
   */
  async disconnect(): Promise<void> {
    if (this.channel && this.userInfo) {
      try {
        // Send leave event
        await this.channel.send({
          type: 'broadcast',
          event: 'leave',
          payload: {
            userId: this.userInfo.userId,
            timestamp: new Date().toISOString(),
          },
        })
      } catch (error) {
        console.warn('[Broadcast] Failed to send leave event:', error)
      }

      // Remove channel
      if (supabase) {
        supabase.removeChannel(this.channel)
      }
    }

    this.channel = null
    this.userInfo = null
    this.isConnected = false
    this.currentStatus = 'active'

    console.log('[Broadcast] Disconnected')
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected
  }

  /**
   * Get current user info
   */
  getUserInfo(): UserInfo | null {
    return this.userInfo
  }

  /**
   * Get current status
   */
  getStatus(): UserStatus {
    return this.currentStatus
  }
}

export const locationBroadcast = new LocationBroadcastService()
