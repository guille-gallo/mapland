import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import {
  TRACKING_CHANNEL,
  USER_STALE_TIMEOUT,
  USER_OFFLINE_TIMEOUT,
  type TrackedUser,
  type LocationPayload,
  type UserLocationFeature,
  trackedUserToFeature,
} from '../types/realtime'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseRealtimeTrackingOptions {
  /** Enable/disable tracking subscription */
  enabled?: boolean
  /** Callback when a user's location updates */
  onUserUpdate?: (user: TrackedUser) => void
  /** Callback when a user goes offline */
  onUserOffline?: (userId: string) => void
}

interface UseRealtimeTrackingReturn {
  /** Map of userId -> TrackedUser */
  users: Map<string, TrackedUser>
  /** GeoJSON features for rendering on map */
  userFeatures: UserLocationFeature[]
  /** Is the channel connected? */
  isConnected: boolean
  /** Connection error, if any */
  error: Error | null
  /** Number of active users */
  activeUserCount: number
}

/**
 * Hook for subscribing to real-time user location updates.
 * Manages connection lifecycle, user state, and stale detection.
 *
 * Usage:
 * ```tsx
 * const { userFeatures, isConnected, activeUserCount } = useRealtimeTracking()
 * // Use userFeatures as GeoJSON source for Mapbox
 * ```
 */
export function useRealtimeTracking(
  options: UseRealtimeTrackingOptions = {}
): UseRealtimeTrackingReturn {
  const { enabled = true, onUserUpdate, onUserOffline } = options

  const [users, setUsers] = useState<Map<string, TrackedUser>>(new Map())
  const [isConnected, setIsConnected] = useState(false)
  const [stableIsConnected, setStableIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const connectionStabilityRef = useRef<NodeJS.Timeout | null>(null)

  // Stabilize connection state to prevent flickering (debounce disconnects)
  useEffect(() => {
    if (isConnected) {
      // Connected immediately
      if (connectionStabilityRef.current) {
        clearTimeout(connectionStabilityRef.current)
        connectionStabilityRef.current = null
      }
      setStableIsConnected(true)
    } else {
      // Delay reporting disconnect by 2s to avoid flicker
      connectionStabilityRef.current = setTimeout(() => {
        setStableIsConnected(false)
      }, 2000)
    }
    return () => {
      if (connectionStabilityRef.current) {
        clearTimeout(connectionStabilityRef.current)
      }
    }
  }, [isConnected])

  // Cleanup stale/offline users periodically
  const cleanupStaleUsers = useCallback(() => {
    const now = Date.now()

    setUsers((currentUsers) => {
      const updated = new Map(currentUsers)
      let hasChanges = false

      for (const [userId, user] of updated) {
        const timeSinceLastSeen = now - user.lastSeen.getTime()

        // Remove users who haven't sent updates in OFFLINE_TIMEOUT
        if (timeSinceLastSeen > USER_OFFLINE_TIMEOUT) {
          updated.delete(userId)
          hasChanges = true
          onUserOffline?.(userId)
          continue
        }

        // Mark users as stale if no recent update
        const isStale = timeSinceLastSeen > USER_STALE_TIMEOUT
        if (user.isStale !== isStale) {
          updated.set(userId, { ...user, isStale })
          hasChanges = true
        }
      }

      return hasChanges ? updated : currentUsers
    })
  }, [onUserOffline])

  // Handle incoming location broadcast
  const handleLocationEvent = useCallback(
    (payload: LocationPayload) => {
      const trackedUser: TrackedUser = {
        user: payload.user,
        position: payload.position,
        status: payload.status,
        lastSeen: new Date(),
        currentZones: payload.currentZones,
        isStale: false,
      }

      setUsers((currentUsers) => {
        const updated = new Map(currentUsers)
        updated.set(payload.user.userId, trackedUser)
        return updated
      })

      onUserUpdate?.(trackedUser)
    },
    [onUserUpdate]
  )

  // Handle user leaving
  const handleLeaveEvent = useCallback(
    (payload: { userId: string }) => {
      setUsers((currentUsers) => {
        const updated = new Map(currentUsers)
        updated.delete(payload.userId)
        return updated
      })
      onUserOffline?.(payload.userId)
    },
    [onUserOffline]
  )

  // Setup channel subscription
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured() || !supabase) {
      // Cleanup if disabled or Supabase not configured
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      setIsConnected(false)
      if (!isSupabaseConfigured()) {
        setError(new Error('Supabase not configured'))
      }
      return
    }

    // Create channel
    const channel = supabase.channel(TRACKING_CHANNEL, {
      config: {
        broadcast: {
          // Don't echo back our own messages (important for web admin that might also broadcast)
          self: false,
        },
      },
    })

    // Subscribe to location events
    channel.on('broadcast', { event: 'location' }, ({ payload }) => {
      handleLocationEvent(payload as LocationPayload)
    })

    // Subscribe to leave events
    channel.on('broadcast', { event: 'leave' }, ({ payload }) => {
      handleLeaveEvent(payload as { userId: string })
    })

    // Subscribe to status events
    channel.on('broadcast', { event: 'status' }, ({ payload }) => {
      const { user, status } = payload as { user: { userId: string }; status: string }
      setUsers((currentUsers) => {
        const existing = currentUsers.get(user.userId)
        if (existing) {
          const updated = new Map(currentUsers)
          updated.set(user.userId, {
            ...existing,
            status: status as TrackedUser['status'],
            lastSeen: new Date(),
          })
          return updated
        }
        return currentUsers
      })
    })

    // Handle connection state
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setIsConnected(true)
        setError(null)
        console.log('[Realtime] Connected to tracking channel')
      } else if (status === 'CHANNEL_ERROR') {
        setIsConnected(false)
        setError(new Error('Failed to connect to tracking channel'))
        console.error('[Realtime] Channel error')
      } else if (status === 'TIMED_OUT') {
        setIsConnected(false)
        setError(new Error('Connection timed out'))
        console.error('[Realtime] Connection timed out')
      } else if (status === 'CLOSED') {
        setIsConnected(false)
        console.log('[Realtime] Channel closed')
      }
    })

    channelRef.current = channel

    // Start cleanup interval
    cleanupIntervalRef.current = setInterval(cleanupStaleUsers, 5000)

    // Cleanup on unmount
    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current)
        cleanupIntervalRef.current = null
      }
    }
  }, [enabled, handleLocationEvent, handleLeaveEvent, cleanupStaleUsers])

  // Convert users map to GeoJSON features
  const userFeatures: UserLocationFeature[] = Array.from(users.values()).map(
    trackedUserToFeature
  )

  return {
    users,
    userFeatures,
    isConnected: stableIsConnected,
    error,
    activeUserCount: users.size,
  }
}

/**
 * Hook for broadcasting current user's location (for testing from web)
 */
export function useLocationBroadcast() {
  const channelRef = useRef<RealtimeChannel | null>(null)

  const broadcast = useCallback(async (payload: LocationPayload) => {
    if (!supabase) {
      console.warn('[Realtime] Cannot broadcast: Supabase not configured')
      return
    }
    
    if (!channelRef.current) {
      channelRef.current = supabase.channel(TRACKING_CHANNEL)
      await channelRef.current.subscribe()
    }

    await channelRef.current.send({
      type: 'broadcast',
      event: 'location',
      payload,
    })
  }, [])

  const leave = useCallback(async (userId: string) => {
    if (!supabase) return
    
    if (channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'leave',
        payload: { userId, timestamp: new Date().toISOString() },
      })
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [])

  return { broadcast, leave }
}
