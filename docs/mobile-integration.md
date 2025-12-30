# Mobile Integration Guide

This guide covers how to integrate Mapland's geofencing API into your mobile application.

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Integration Strategies](#integration-strategies)
4. [React Native Implementation](#react-native-implementation)
5. [iOS (Swift) Implementation](#ios-swift-implementation)
6. [Android (Kotlin) Implementation](#android-kotlin-implementation)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Mapland provides two API endpoints for mobile geofencing:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/zones` | GET | Fetch all zones as GeoJSON |
| `/api/zones/check` | POST | Check if a point is inside any zone |

### Base URL

```
Production: https://mapland.vercel.app/api
```

---

## API Endpoints

### GET /api/zones

Fetches all zones as a GeoJSON FeatureCollection.

```bash
curl https://mapland.vercel.app/api/zones
```

**Response:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "properties": {
        "name": "Beach Restricted Area",
        "zoneType": "danger",
        "message": "Swimming prohibited in this area",
        "createdAt": "2025-12-30T10:30:00Z",
        "updatedAt": "2025-12-30T10:30:00Z"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[2.17, 41.38], [2.18, 41.38], [2.18, 41.39], [2.17, 41.39], [2.17, 41.38]]]
      }
    }
  ]
}
```

### POST /api/zones/check

Checks if a coordinate is inside any zone.

```bash
curl -X POST https://mapland.vercel.app/api/zones/check \
  -H "Content-Type: application/json" \
  -d '{"latitude": 41.3851, "longitude": 2.1734}'
```

**Response:**
```json
{
  "inside": true,
  "zones": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Beach Restricted Area",
      "zoneType": "danger",
      "message": "Swimming prohibited in this area"
    }
  ],
  "point": {
    "latitude": 41.3851,
    "longitude": 2.1734
  }
}
```

---

## Integration Strategies

### Strategy 1: Server-Side Checks (Simple)

Best for: Apps with always-on connectivity, infrequent location updates.

```
User Location → API Call → Server Check → Response → Show Alert
```

**Pros:**
- Simple implementation
- Always up-to-date zones
- No local storage needed

**Cons:**
- Requires network connectivity
- Higher latency
- More battery usage (network calls)

### Strategy 2: Client-Side Checks (Recommended)

Best for: Frequent location updates, offline support, battery efficiency.

```
App Start → Fetch Zones → Cache Locally
                              ↓
User Location → Local Check (Turf.js) → Show Alert
```

**Pros:**
- Works offline
- Lower latency
- Better battery life
- Reduced server load

**Cons:**
- Need to refresh zones periodically
- Requires geospatial library

### Strategy 3: Hybrid Approach (Best)

Combine both strategies:

1. Cache zones locally on app start
2. Use local checks for real-time geofencing
3. Refresh zones periodically (e.g., every hour)
4. Use server check as fallback when cache is stale

---

## React Native Implementation

### Installation

```bash
npm install @turf/turf @react-native-async-storage/async-storage
npm install react-native-geolocation-service
```

### TypeScript Types

```typescript
// types/zones.ts

export type ZoneType = 'danger' | 'suggested' | 'boundary';

export interface ZoneProperties {
  name: string;
  zoneType: ZoneType;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ZoneFeature {
  type: 'Feature';
  id: string;
  properties: ZoneProperties;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

export interface ZonesGeoJSON {
  type: 'FeatureCollection';
  features: ZoneFeature[];
}

export interface PointCheckResult {
  inside: boolean;
  zones: Array<{
    id: string;
    name: string;
    zoneType: ZoneType;
    message: string | null;
  }>;
}
```

### Zones Service

```typescript
// services/zonesService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as turf from '@turf/turf';
import type { ZonesGeoJSON, ZoneFeature, PointCheckResult } from '../types/zones';

const API_BASE = 'https://mapland.vercel.app/api';
const CACHE_KEY = 'mapland_zones_cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CachedZones {
  data: ZonesGeoJSON;
  timestamp: number;
}

class ZonesService {
  private cachedZones: ZonesGeoJSON | null = null;

  /**
   * Fetch zones from API and cache locally
   */
  async fetchZones(forceRefresh = false): Promise<ZonesGeoJSON> {
    // Check memory cache first
    if (this.cachedZones && !forceRefresh) {
      return this.cachedZones;
    }

    // Check persistent cache
    if (!forceRefresh) {
      const cached = await this.loadFromCache();
      if (cached) {
        this.cachedZones = cached;
        return cached;
      }
    }

    // Fetch from API
    try {
      const response = await fetch(`${API_BASE}/zones`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data: ZonesGeoJSON = await response.json();
      
      // Cache the data
      this.cachedZones = data;
      await this.saveToCache(data);
      
      return data;
    } catch (error) {
      // If fetch fails, try to use cached data
      const cached = await this.loadFromCache();
      if (cached) {
        console.warn('Using stale cache due to fetch error:', error);
        return cached;
      }
      throw error;
    }
  }

  /**
   * Check if a point is inside any zone (client-side)
   */
  checkPointLocal(latitude: number, longitude: number): PointCheckResult {
    if (!this.cachedZones) {
      return { inside: false, zones: [] };
    }

    const point = turf.point([longitude, latitude]);
    const matchingZones: PointCheckResult['zones'] = [];

    for (const feature of this.cachedZones.features) {
      // Skip boundary zones (they define perimeter, not actual zones)
      if (feature.properties.zoneType === 'boundary') {
        continue;
      }

      const polygon = turf.polygon(feature.geometry.coordinates);
      
      if (turf.booleanPointInPolygon(point, polygon)) {
        matchingZones.push({
          id: feature.id,
          name: feature.properties.name,
          zoneType: feature.properties.zoneType,
          message: feature.properties.message,
        });
      }
    }

    return {
      inside: matchingZones.length > 0,
      zones: matchingZones,
    };
  }

  /**
   * Check if a point is inside any zone (server-side)
   */
  async checkPointRemote(latitude: number, longitude: number): Promise<PointCheckResult> {
    const response = await fetch(`${API_BASE}/zones/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  }

  private async loadFromCache(): Promise<ZonesGeoJSON | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;

      const cached: CachedZones = JSON.parse(raw);
      
      // Check if cache is still valid
      if (Date.now() - cached.timestamp > CACHE_TTL) {
        return null; // Cache expired
      }

      return cached.data;
    } catch {
      return null;
    }
  }

  private async saveToCache(data: ZonesGeoJSON): Promise<void> {
    try {
      const cached: CachedZones = {
        data,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch (error) {
      console.warn('Failed to cache zones:', error);
    }
  }
}

export const zonesService = new ZonesService();
```

### Geofencing Hook

```typescript
// hooks/useGeofencing.ts

import { useEffect, useRef, useCallback, useState } from 'react';
import Geolocation from 'react-native-geolocation-service';
import { zonesService } from '../services/zonesService';
import type { PointCheckResult } from '../types/zones';

interface UseGeofencingOptions {
  /** Check interval in milliseconds (default: 10000) */
  interval?: number;
  /** Whether to start monitoring immediately (default: true) */
  autoStart?: boolean;
  /** Callback when entering a zone */
  onEnterZone?: (result: PointCheckResult) => void;
  /** Callback when leaving all zones */
  onLeaveZone?: () => void;
}

export function useGeofencing(options: UseGeofencingOptions = {}) {
  const {
    interval = 10000,
    autoStart = true,
    onEnterZone,
    onLeaveZone,
  } = options;

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentResult, setCurrentResult] = useState<PointCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wasInsideRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);

  const checkLocation = useCallback(async (latitude: number, longitude: number) => {
    try {
      // Ensure zones are loaded
      await zonesService.fetchZones();
      
      // Perform local check
      const result = zonesService.checkPointLocal(latitude, longitude);
      setCurrentResult(result);

      // Detect zone transitions
      if (result.inside && !wasInsideRef.current) {
        wasInsideRef.current = true;
        onEnterZone?.(result);
      } else if (!result.inside && wasInsideRef.current) {
        wasInsideRef.current = false;
        onLeaveZone?.();
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [onEnterZone, onLeaveZone]);

  const startMonitoring = useCallback(() => {
    if (watchIdRef.current !== null) return;

    watchIdRef.current = Geolocation.watchPosition(
      (position) => {
        checkLocation(position.coords.latitude, position.coords.longitude);
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 10, // Minimum distance (meters) before update
        interval,
        fastestInterval: interval / 2,
      }
    );

    setIsMonitoring(true);
  }, [checkLocation, interval]);

  const stopMonitoring = useCallback(() => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsMonitoring(false);
  }, []);

  useEffect(() => {
    if (autoStart) {
      startMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [autoStart, startMonitoring, stopMonitoring]);

  return {
    isMonitoring,
    currentResult,
    error,
    startMonitoring,
    stopMonitoring,
  };
}
```

### Usage Example

```typescript
// App.tsx

import React from 'react';
import { View, Text, Alert } from 'react-native';
import { useGeofencing } from './hooks/useGeofencing';

export default function App() {
  const { isMonitoring, currentResult, error } = useGeofencing({
    interval: 10000, // Check every 10 seconds
    onEnterZone: (result) => {
      const dangerZones = result.zones.filter(z => z.zoneType === 'danger');
      if (dangerZones.length > 0) {
        Alert.alert(
          '⚠️ Warning',
          dangerZones[0].message || 'You have entered a restricted area',
          [{ text: 'OK' }]
        );
      }
    },
    onLeaveZone: () => {
      console.log('Left all zones');
    },
  });

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Monitoring: {isMonitoring ? 'Active' : 'Inactive'}</Text>
      {currentResult && (
        <Text>
          Inside zone: {currentResult.inside ? 'Yes' : 'No'}
        </Text>
      )}
      {error && <Text style={{ color: 'red' }}>Error: {error}</Text>}
    </View>
  );
}
```

---

## iOS (Swift) Implementation

### Models

```swift
// Models/Zone.swift

import Foundation
import CoreLocation

enum ZoneType: String, Codable {
    case danger
    case suggested
    case boundary
}

struct ZoneProperties: Codable {
    let name: String
    let zoneType: ZoneType
    let message: String?
    let createdAt: String
    let updatedAt: String
}

struct ZoneGeometry: Codable {
    let type: String
    let coordinates: [[[Double]]]
}

struct ZoneFeature: Codable {
    let type: String
    let id: String
    let properties: ZoneProperties
    let geometry: ZoneGeometry
}

struct ZonesGeoJSON: Codable {
    let type: String
    let features: [ZoneFeature]
}

struct PointCheckRequest: Codable {
    let latitude: Double
    let longitude: Double
}

struct MatchedZone: Codable {
    let id: String
    let name: String
    let zoneType: ZoneType
    let message: String?
}

struct PointCheckResponse: Codable {
    let inside: Bool
    let zones: [MatchedZone]
}
```

### API Service

```swift
// Services/ZonesAPI.swift

import Foundation
import CoreLocation

class ZonesAPI {
    static let shared = ZonesAPI()
    
    private let baseURL = "https://mapland.vercel.app/api"
    private var cachedZones: ZonesGeoJSON?
    
    private init() {}
    
    func fetchZones() async throws -> ZonesGeoJSON {
        if let cached = cachedZones {
            return cached
        }
        
        guard let url = URL(string: "\(baseURL)/zones") else {
            throw URLError(.badURL)
        }
        
        let (data, _) = try await URLSession.shared.data(from: url)
        let zones = try JSONDecoder().decode(ZonesGeoJSON.self, from: data)
        
        cachedZones = zones
        return zones
    }
    
    func checkPoint(latitude: Double, longitude: Double) async throws -> PointCheckResponse {
        guard let url = URL(string: "\(baseURL)/zones/check") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = PointCheckRequest(latitude: latitude, longitude: longitude)
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(PointCheckResponse.self, from: data)
    }
    
    /// Client-side point-in-polygon check
    func checkPointLocal(latitude: Double, longitude: Double) -> PointCheckResponse {
        guard let zones = cachedZones else {
            return PointCheckResponse(inside: false, zones: [])
        }
        
        let point = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        var matchedZones: [MatchedZone] = []
        
        for feature in zones.features {
            // Skip boundary zones
            guard feature.properties.zoneType != .boundary else { continue }
            
            if isPoint(point, insidePolygon: feature.geometry.coordinates[0]) {
                matchedZones.append(MatchedZone(
                    id: feature.id,
                    name: feature.properties.name,
                    zoneType: feature.properties.zoneType,
                    message: feature.properties.message
                ))
            }
        }
        
        return PointCheckResponse(inside: !matchedZones.isEmpty, zones: matchedZones)
    }
    
    /// Ray casting algorithm for point-in-polygon
    private func isPoint(_ point: CLLocationCoordinate2D, insidePolygon polygon: [[Double]]) -> Bool {
        var inside = false
        var j = polygon.count - 1
        
        for i in 0..<polygon.count {
            let xi = polygon[i][0], yi = polygon[i][1]
            let xj = polygon[j][0], yj = polygon[j][1]
            
            if ((yi > point.latitude) != (yj > point.latitude)) &&
               (point.longitude < (xj - xi) * (point.latitude - yi) / (yj - yi) + xi) {
                inside = !inside
            }
            j = i
        }
        
        return inside
    }
}
```

### Geofencing Manager

```swift
// Services/GeofencingManager.swift

import Foundation
import CoreLocation

protocol GeofencingDelegate: AnyObject {
    func didEnterZone(_ zones: [MatchedZone])
    func didExitAllZones()
    func didFailWithError(_ error: Error)
}

class GeofencingManager: NSObject, CLLocationManagerDelegate {
    static let shared = GeofencingManager()
    
    weak var delegate: GeofencingDelegate?
    
    private let locationManager = CLLocationManager()
    private var wasInside = false
    
    private override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = 10 // meters
    }
    
    func requestPermissions() {
        locationManager.requestWhenInUseAuthorization()
    }
    
    func startMonitoring() {
        Task {
            do {
                // Pre-fetch zones
                _ = try await ZonesAPI.shared.fetchZones()
                locationManager.startUpdatingLocation()
            } catch {
                delegate?.didFailWithError(error)
            }
        }
    }
    
    func stopMonitoring() {
        locationManager.stopUpdatingLocation()
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        
        let result = ZonesAPI.shared.checkPointLocal(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude
        )
        
        if result.inside && !wasInside {
            wasInside = true
            delegate?.didEnterZone(result.zones)
        } else if !result.inside && wasInside {
            wasInside = false
            delegate?.didExitAllZones()
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        delegate?.didFailWithError(error)
    }
}
```

---

## Android (Kotlin) Implementation

### Models

```kotlin
// models/Zone.kt

package com.example.mapland.models

import com.google.gson.annotations.SerializedName

enum class ZoneType {
    @SerializedName("danger") DANGER,
    @SerializedName("suggested") SUGGESTED,
    @SerializedName("boundary") BOUNDARY
}

data class ZoneProperties(
    val name: String,
    val zoneType: ZoneType,
    val message: String?,
    val createdAt: String,
    val updatedAt: String
)

data class ZoneGeometry(
    val type: String,
    val coordinates: List<List<List<Double>>>
)

data class ZoneFeature(
    val type: String,
    val id: String,
    val properties: ZoneProperties,
    val geometry: ZoneGeometry
)

data class ZonesGeoJSON(
    val type: String,
    val features: List<ZoneFeature>
)

data class PointCheckRequest(
    val latitude: Double,
    val longitude: Double
)

data class MatchedZone(
    val id: String,
    val name: String,
    val zoneType: ZoneType,
    val message: String?
)

data class PointCheckResponse(
    val inside: Boolean,
    val zones: List<MatchedZone>
)
```

### API Service

```kotlin
// services/ZonesAPI.kt

package com.example.mapland.services

import com.example.mapland.models.*
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

object ZonesAPI {
    private const val BASE_URL = "https://mapland.vercel.app/api"
    private val gson = Gson()
    private var cachedZones: ZonesGeoJSON? = null

    suspend fun fetchZones(): ZonesGeoJSON = withContext(Dispatchers.IO) {
        cachedZones?.let { return@withContext it }

        val url = URL("$BASE_URL/zones")
        val connection = url.openConnection() as HttpURLConnection
        
        try {
            connection.requestMethod = "GET"
            val response = connection.inputStream.bufferedReader().readText()
            val zones = gson.fromJson(response, ZonesGeoJSON::class.java)
            cachedZones = zones
            zones
        } finally {
            connection.disconnect()
        }
    }

    suspend fun checkPoint(latitude: Double, longitude: Double): PointCheckResponse = 
        withContext(Dispatchers.IO) {
            val url = URL("$BASE_URL/zones/check")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                
                val request = PointCheckRequest(latitude, longitude)
                connection.outputStream.write(gson.toJson(request).toByteArray())
                
                val response = connection.inputStream.bufferedReader().readText()
                gson.fromJson(response, PointCheckResponse::class.java)
            } finally {
                connection.disconnect()
            }
        }

    fun checkPointLocal(latitude: Double, longitude: Double): PointCheckResponse {
        val zones = cachedZones ?: return PointCheckResponse(inside = false, zones = emptyList())
        
        val matchedZones = zones.features
            .filter { it.properties.zoneType != ZoneType.BOUNDARY }
            .filter { isPointInPolygon(latitude, longitude, it.geometry.coordinates[0]) }
            .map { MatchedZone(
                id = it.id,
                name = it.properties.name,
                zoneType = it.properties.zoneType,
                message = it.properties.message
            )}
        
        return PointCheckResponse(
            inside = matchedZones.isNotEmpty(),
            zones = matchedZones
        )
    }

    private fun isPointInPolygon(
        latitude: Double, 
        longitude: Double, 
        polygon: List<List<Double>>
    ): Boolean {
        var inside = false
        var j = polygon.size - 1
        
        for (i in polygon.indices) {
            val xi = polygon[i][0]
            val yi = polygon[i][1]
            val xj = polygon[j][0]
            val yj = polygon[j][1]
            
            if ((yi > latitude) != (yj > latitude) &&
                longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) {
                inside = !inside
            }
            j = i
        }
        
        return inside
    }
}
```

### Geofencing Service

```kotlin
// services/GeofencingService.kt

package com.example.mapland.services

import android.Manifest
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ActivityCompat
import com.example.mapland.models.MatchedZone
import com.google.android.gms.location.*
import kotlinx.coroutines.*

class GeofencingService : Service() {
    
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private var wasInside = false
    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())

    interface GeofencingListener {
        fun onEnterZone(zones: List<MatchedZone>)
        fun onExitAllZones()
        fun onError(error: Exception)
    }

    companion object {
        var listener: GeofencingListener? = null
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { checkLocation(it) }
            }
        }

        // Pre-fetch zones
        serviceScope.launch {
            try {
                ZonesAPI.fetchZones()
            } catch (e: Exception) {
                listener?.onError(e)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startLocationUpdates()
        return START_STICKY
    }

    private fun startLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            10000 // 10 seconds
        ).apply {
            setMinUpdateDistanceMeters(10f)
        }.build()

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper()
        )
    }

    private fun checkLocation(location: Location) {
        val result = ZonesAPI.checkPointLocal(
            location.latitude,
            location.longitude
        )

        if (result.inside && !wasInside) {
            wasInside = true
            listener?.onEnterZone(result.zones)
        } else if (!result.inside && wasInside) {
            wasInside = false
            listener?.onExitAllZones()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
```

---

## Best Practices

### 1. Cache Zones Locally

Always cache zones to reduce API calls and enable offline functionality:

```typescript
// Refresh zones periodically (e.g., every hour)
setInterval(() => {
  zonesService.fetchZones(true); // Force refresh
}, 60 * 60 * 1000);
```

### 2. Battery Optimization

- Use significant location changes when possible
- Reduce location accuracy when battery is low
- Pause monitoring when app is in background (unless critical)

### 3. Handle Edge Cases

```typescript
// Handle user at zone boundary
const BOUNDARY_BUFFER = 0.0001; // ~10 meters

// Debounce zone transitions to prevent flickering
let lastZoneChange = 0;
const DEBOUNCE_MS = 5000;

function onZoneChange(result) {
  const now = Date.now();
  if (now - lastZoneChange < DEBOUNCE_MS) return;
  lastZoneChange = now;
  // Handle zone change
}
```

### 4. Error Handling

```typescript
try {
  const result = await zonesService.checkPointRemote(lat, lng);
} catch (error) {
  // Fallback to local check
  const localResult = zonesService.checkPointLocal(lat, lng);
  
  // Log error for monitoring
  console.error('Remote check failed, using local:', error);
}
```

### 5. User Experience

- Show visual indicator when monitoring is active
- Provide clear zone entry/exit notifications
- Allow users to view all zones on a map
- Include "snooze" option for repeated alerts

---

## Troubleshooting

### Issue: Empty zones response

**Cause**: No zones have been published yet.

**Solution**: Publish zones from the Editor at `/edit` → click "Publish".

### Issue: CORS errors

**Cause**: API is being called from an unauthorized origin.

**Solution**: The API allows all origins (`*`). Ensure you're using HTTPS in production.

### Issue: Location permission denied

**Solution**: Check platform-specific permission handling:
- iOS: Add `NSLocationWhenInUseUsageDescription` to Info.plist
- Android: Add `ACCESS_FINE_LOCATION` to AndroidManifest.xml

### Issue: Inaccurate geofencing

**Causes**:
- GPS accuracy issues indoors
- Zone boundaries too small
- Location updates too infrequent

**Solutions**:
- Use larger zone boundaries (minimum ~50m recommended)
- Increase location update frequency when near boundaries
- Consider using Wi-Fi/cellular location as supplement

---

## Support

For issues or questions:
- Check the [API documentation](./openapi.yaml)
- Review the [main README](../../README.md)
- Open an issue on GitHub
