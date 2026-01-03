import { useEffect, useRef, useCallback, useState } from 'react'
import { View, Text, StyleSheet, Alert, TouchableOpacity, Platform } from 'react-native'
import MapView, { Polygon, PROVIDER_GOOGLE } from 'react-native-maps'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'

import { useLocation } from '../hooks/useLocation'
import { useGeofencing } from '../hooks/useGeofencing'
import { locationBroadcast, LOCATION_BROADCAST_INTERVAL } from '../services/locationBroadcast'
import { zonesApi, type ZoneFeature } from '../services/zonesApi'
import type { MatchedZone, GeofenceTransition } from '../services/geofencing'

// Check if running in Expo Go (notifications not supported since SDK 53)
const isExpoGo = Constants.appOwnership === 'expo'

// Lazy-load notifications only in dev builds (not Expo Go)
let Notifications: typeof import('expo-notifications') | null = null
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications')
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    })
  } catch (e) {
    console.warn('expo-notifications not available')
  }
}

// Zone colors
const ZONE_COLORS: Record<string, { fill: string; stroke: string }> = {
  danger: { fill: 'rgba(255, 0, 0, 0.3)', stroke: '#cc0000' },
  suggested: { fill: 'rgba(0, 200, 0, 0.3)', stroke: '#009900' },
  boundary: { fill: 'transparent', stroke: '#666666' },
}

export default function HomeScreen() {
  const router = useRouter()
  const mapRef = useRef<MapView>(null)
  const broadcastIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const [zones, setZones] = useState<ZoneFeature[]>([])
  const [showAlert, setShowAlert] = useState<MatchedZone | null>(null)

  // Location tracking
  const { location, isTracking, error: locationError, permissionStatus } = useLocation({
    enabled: true,
    distanceFilter: 10,
    intervalMs: 3000,
  })

  // Geofencing
  const {
    result: geofenceResult,
    zonesLoaded,
    isLoading,
    error: zonesError,
    recentTransitions,
  } = useGeofencing({
    location,
    onEnterZone: handleEnterZone,
    onExitZone: handleExitZone,
  })

  // Load zones for map display
  useEffect(() => {
    loadZones()
  }, [])

  const loadZones = async () => {
    try {
      const data = await zonesApi.fetchZones()
      setZones(data.features)
    } catch (error) {
      console.error('Failed to load zones:', error)
    }
  }

  // Broadcast location at interval
  useEffect(() => {
    if (location && locationBroadcast.getIsConnected()) {
      // Clear existing interval
      if (broadcastIntervalRef.current) {
        clearInterval(broadcastIntervalRef.current)
      }

      // Broadcast immediately
      broadcastLocation()

      // Then at interval
      broadcastIntervalRef.current = setInterval(broadcastLocation, LOCATION_BROADCAST_INTERVAL)
    }

    return () => {
      if (broadcastIntervalRef.current) {
        clearInterval(broadcastIntervalRef.current)
      }
    }
  }, [location])

  const broadcastLocation = useCallback(() => {
    if (!location) return

    locationBroadcast.broadcastLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy ?? undefined,
      altitude: location.altitude ?? undefined,
      heading: location.heading ?? undefined,
      speed: location.speed ?? undefined,
    })
  }, [location])

  // Handle zone entry
  function handleEnterZone(zone: MatchedZone) {
    console.log(`[App] Entered zone: ${zone.name}`)
    
    // Show alert for danger zones
    if (zone.zoneType === 'danger') {
      setShowAlert(zone)
      showNotification(zone, 'enter')
    }
  }

  // Handle zone exit
  function handleExitZone(zone: MatchedZone) {
    console.log(`[App] Exited zone: ${zone.name}`)
    
    // Clear alert if it was for this zone
    if (showAlert?.id === zone.id) {
      setShowAlert(null)
    }
  }

  // Show local notification (or Alert fallback in Expo Go)
  async function showNotification(zone: MatchedZone, type: 'enter' | 'exit') {
    const title = type === 'enter' ? '⚠️ Zone Alert' : '✅ Left Zone'
    const body = type === 'enter'
      ? zone.message || `You entered: ${zone.name}`
      : `You left: ${zone.name}`

    // Use native notifications in dev builds, Alert fallback in Expo Go
    if (Notifications) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: type === 'enter' && zone.zoneType === 'danger',
        },
        trigger: null, // Immediate
      })
    } else {
      // Fallback for Expo Go
      Alert.alert(title, body)
    }
  }

  // Center map on user location
  const centerOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      })
    }
  }

  // Request notification permissions (only in dev builds)
  useEffect(() => {
    if (Notifications) {
      Notifications.requestPermissionsAsync()
    }
  }, [])

  // Render zone polygons
  const renderZones = () => {
    return zones.map((zone) => {
      const colors = ZONE_COLORS[zone.properties.zoneType] || ZONE_COLORS.suggested
      const coordinates = zone.geometry.coordinates[0].map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }))

      return (
        <Polygon
          key={zone.id}
          coordinates={coordinates}
          fillColor={colors.fill}
          strokeColor={colors.stroke}
          strokeWidth={2}
          tappable
          onPress={() => {
            Alert.alert(
              zone.properties.name,
              zone.properties.message || `Type: ${zone.properties.zoneType}`,
              [{ text: 'OK' }]
            )
          }}
        />
      )
    })
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: 41.3851,
          longitude: 2.1734,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        followsUserLocation={false}
      >
        {renderZones()}
      </MapView>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: isTracking ? '#22c55e' : '#ef4444' }]} />
          <Text style={styles.statusText}>
            {isTracking ? 'GPS Active' : 'GPS Off'}
          </Text>
        </View>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: locationBroadcast.getIsConnected() ? '#22c55e' : '#ef4444' }]} />
          <Text style={styles.statusText}>
            {locationBroadcast.getIsConnected() ? 'Online' : 'Offline'}
          </Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusText}>
            {zonesLoaded ? `${zones.length} zones` : 'Loading...'}
          </Text>
        </View>
      </View>

      {/* Alert banner */}
      {showAlert && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertTitle}>⚠️ {showAlert.name}</Text>
          <Text style={styles.alertMessage}>{showAlert.message || 'You are in a restricted zone'}</Text>
          <TouchableOpacity 
            style={styles.alertButton}
            onPress={() => setShowAlert(null)}
          >
            <Text style={styles.alertButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Geofence status */}
      {geofenceResult && geofenceResult.inside && (
        <View style={styles.zoneIndicator}>
          <Text style={styles.zoneIndicatorText}>
            📍 Inside: {geofenceResult.zones.map(z => z.name).join(', ')}
          </Text>
        </View>
      )}

      {/* Center button */}
      <TouchableOpacity style={styles.centerButton} onPress={centerOnUser}>
        <Text style={styles.centerButtonText}>📍</Text>
      </TouchableOpacity>

      {/* Settings button */}
      <TouchableOpacity 
        style={styles.settingsButton} 
        onPress={() => router.push('/settings')}
      >
        <Text style={styles.settingsButtonText}>⚙️</Text>
      </TouchableOpacity>

      {/* SOS Button */}
      <TouchableOpacity 
        style={[
          styles.sosButton,
          locationBroadcast.getStatus() === 'sos' && styles.sosButtonActive
        ]}
        onLongPress={() => {
          if (locationBroadcast.getStatus() === 'sos') {
            locationBroadcast.cancelSOS()
          } else {
            Alert.alert(
              '🆘 Trigger SOS?',
              'This will alert operators to your location.',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Trigger SOS', 
                  style: 'destructive',
                  onPress: () => locationBroadcast.triggerSOS()
                },
              ]
            )
          }
        }}
        delayLongPress={1000}
      >
        <Text style={styles.sosButtonText}>SOS</Text>
        <Text style={styles.sosButtonHint}>Hold</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  statusBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    padding: 8,
    gap: 16,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
  },
  alertBanner: {
    position: 'absolute',
    top: 60,
    left: 10,
    right: 10,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  alertTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  alertMessage: {
    color: '#fecaca',
    fontSize: 14,
    marginBottom: 12,
  },
  alertButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  alertButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  zoneIndicator: {
    position: 'absolute',
    bottom: 100,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    borderRadius: 8,
    padding: 12,
  },
  zoneIndicatorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  centerButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 50,
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  centerButtonText: {
    fontSize: 24,
  },
  settingsButton: {
    position: 'absolute',
    bottom: 30,
    right: 80,
    width: 50,
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  settingsButtonText: {
    fontSize: 24,
  },
  sosButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    width: 70,
    height: 70,
    backgroundColor: '#dc2626',
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  sosButtonActive: {
    backgroundColor: '#991b1b',
    borderWidth: 3,
    borderColor: '#fca5a5',
  },
  sosButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  sosButtonHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
  },
})
