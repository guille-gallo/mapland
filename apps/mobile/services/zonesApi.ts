import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

// Types - mirrored from web app for consistency
export type ZoneType = 'danger' | 'suggested' | 'boundary'

export interface ZoneProperties {
  name: string
  zoneType: ZoneType
  message: string | null
  createdAt: string
  updatedAt: string
}

export interface ZoneFeature {
  type: 'Feature'
  id: string
  properties: ZoneProperties
  geometry: {
    type: 'Polygon'
    coordinates: number[][][]
  }
}

export interface ZonesGeoJSON {
  type: 'FeatureCollection'
  features: ZoneFeature[]
}

// API configuration
const API_URL = Constants.expoConfig?.extra?.apiUrl 
  || process.env.EXPO_PUBLIC_API_URL 
  || 'https://mapland.vercel.app/api'

const CACHE_KEY = 'mapland:zones:cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes (shorter for development)

interface CachedZones {
  data: ZonesGeoJSON
  timestamp: number
}

/**
 * Zones API service for mobile app
 */
class ZonesApiService {
  private memoryCache: ZonesGeoJSON | null = null

  /**
   * Fetch all zones from API with caching
   */
  async fetchZones(forceRefresh = false): Promise<ZonesGeoJSON> {
    // Check memory cache first
    if (this.memoryCache && !forceRefresh) {
      return this.memoryCache
    }

    // Check persistent cache
    if (!forceRefresh) {
      const cached = await this.loadFromCache()
      if (cached) {
        this.memoryCache = cached
        return cached
      }
    }

    // Fetch from API
    try {
      console.log('[ZonesAPI] Fetching from:', `${API_URL}/zones`)
      
      const response = await fetch(`${API_URL}/zones`, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      const data: ZonesGeoJSON = await response.json()
      
      // Validate response
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Invalid GeoJSON response')
      }

      console.log(`[ZonesAPI] Fetched ${data.features.length} zones`)

      // Update caches
      this.memoryCache = data
      await this.saveToCache(data)

      return data
    } catch (error) {
      console.error('[ZonesAPI] Fetch error:', error)

      // Try to use stale cache on error
      const staleCache = await this.loadFromCache(true) // Ignore TTL
      if (staleCache) {
        console.warn('[ZonesAPI] Using stale cache due to fetch error')
        return staleCache
      }

      throw error
    }
  }

  /**
   * Get zones from memory cache (for synchronous access)
   */
  getCachedZones(): ZonesGeoJSON | null {
    return this.memoryCache
  }

  /**
   * Check point against zones using server
   */
  async checkPointRemote(latitude: number, longitude: number): Promise<{
    inside: boolean
    zones: Array<{
      id: string
      name: string
      zoneType: ZoneType
      message: string | null
    }>
  }> {
    const response = await fetch(`${API_URL}/zones/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ latitude, longitude }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    this.memoryCache = null
    await AsyncStorage.removeItem(CACHE_KEY)
  }

  // Private methods

  private async loadFromCache(ignoreTTL = false): Promise<ZonesGeoJSON | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY)
      if (!raw) return null

      const cached: CachedZones = JSON.parse(raw)

      // Check TTL unless ignored
      if (!ignoreTTL && Date.now() - cached.timestamp > CACHE_TTL) {
        return null
      }

      return cached.data
    } catch (error) {
      console.warn('[ZonesAPI] Cache read error:', error)
      return null
    }
  }

  private async saveToCache(data: ZonesGeoJSON): Promise<void> {
    try {
      const cached: CachedZones = {
        data,
        timestamp: Date.now(),
      }
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cached))
    } catch (error) {
      console.warn('[ZonesAPI] Cache write error:', error)
    }
  }
}

export const zonesApi = new ZonesApiService()
