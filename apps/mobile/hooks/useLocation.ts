import { useState, useEffect, useRef, useCallback } from 'react'
import * as Location from 'expo-location'
import { AppState, AppStateStatus, Platform } from 'react-native'

export interface LocationData {
  latitude: number
  longitude: number
  accuracy: number | null
  altitude: number | null
  heading: number | null
  speed: number | null
  timestamp: number
}

interface UseLocationOptions {
  /** Enable location tracking */
  enabled?: boolean
  /** Request background location permission */
  enableBackground?: boolean
  /** Location update interval in milliseconds (Android only) */
  intervalMs?: number
  /** Minimum distance (meters) before location update */
  distanceFilter?: number
  /** Desired accuracy level */
  accuracy?: Location.Accuracy
}

interface UseLocationReturn {
  /** Current location */
  location: LocationData | null
  /** Is watching location */
  isTracking: boolean
  /** Error message if any */
  error: string | null
  /** Permission status */
  permissionStatus: Location.PermissionStatus | null
  /** Request permissions */
  requestPermission: () => Promise<boolean>
  /** Start watching location */
  startTracking: () => Promise<void>
  /** Stop watching location */
  stopTracking: () => void
}

/**
 * Hook for tracking device location with Expo Location
 */
export function useLocation(options: UseLocationOptions = {}): UseLocationReturn {
  const {
    enabled = true,
    enableBackground = false,
    intervalMs = 3000,
    distanceFilter = 10,
    accuracy = Location.Accuracy.High,
  } = options

  const [location, setLocation] = useState<LocationData | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null)

  const watcherRef = useRef<Location.LocationSubscription | null>(null)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  // Request permissions
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      // Request foreground permission first
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync()
      setPermissionStatus(foregroundStatus)

      if (foregroundStatus !== 'granted') {
        setError('Location permission denied')
        return false
      }

      // Request background permission if needed
      if (enableBackground) {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync()
        if (backgroundStatus !== 'granted') {
          console.warn('[Location] Background permission denied')
          // Continue anyway - foreground will still work
        }
      }

      setError(null)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Permission request failed'
      setError(message)
      return false
    }
  }, [enableBackground])

  // Start watching location
  const startTracking = useCallback(async () => {
    // Check/request permission first
    const hasPermission = permissionStatus === 'granted' || (await requestPermission())
    if (!hasPermission) {
      return
    }

    // Stop existing watcher
    if (watcherRef.current) {
      watcherRef.current.remove()
    }

    try {
      // Get initial location quickly
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      
      setLocation({
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
        accuracy: initial.coords.accuracy,
        altitude: initial.coords.altitude,
        heading: initial.coords.heading,
        speed: initial.coords.speed,
        timestamp: initial.timestamp,
      })

      // Start continuous tracking
      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy,
          timeInterval: intervalMs,
          distanceInterval: distanceFilter,
        },
        (newLocation) => {
          setLocation({
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
            accuracy: newLocation.coords.accuracy,
            altitude: newLocation.coords.altitude,
            heading: newLocation.coords.heading,
            speed: newLocation.coords.speed,
            timestamp: newLocation.timestamp,
          })
          setError(null)
        }
      )

      setIsTracking(true)
      setError(null)
      console.log('[Location] Tracking started')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start location tracking'
      setError(message)
      setIsTracking(false)
      console.error('[Location] Start tracking error:', err)
    }
  }, [permissionStatus, requestPermission, accuracy, intervalMs, distanceFilter])

  // Stop watching location
  const stopTracking = useCallback(() => {
    if (watcherRef.current) {
      watcherRef.current.remove()
      watcherRef.current = null
    }
    setIsTracking(false)
    console.log('[Location] Tracking stopped')
  }, [])

  // Handle app state changes (pause tracking when backgrounded without permission)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        appStateRef.current.match(/active/) &&
        nextState === 'background' &&
        !enableBackground &&
        isTracking
      ) {
        // App went to background without background permission
        console.log('[Location] App backgrounded, pausing tracking')
        // We don't stop - just note it. The watcher will continue when app returns.
      }
      appStateRef.current = nextState
    })

    return () => {
      subscription.remove()
    }
  }, [enableBackground, isTracking])

  // Auto-start if enabled
  useEffect(() => {
    if (enabled) {
      startTracking()
    } else {
      stopTracking()
    }

    return () => {
      stopTracking()
    }
  }, [enabled, startTracking, stopTracking])

  // Check initial permission status
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      setPermissionStatus(status)
    })
  }, [])

  return {
    location,
    isTracking,
    error,
    permissionStatus,
    requestPermission,
    startTracking,
    stopTracking,
  }
}
