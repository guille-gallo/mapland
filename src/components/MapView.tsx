import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { FeatureCollection, Feature, Polygon } from 'geojson'
import { buildMaskWithTiming, featureCollectionHash } from '../utils/maskBuilder'
import { DEFAULT_ZONES } from '../data/default-zones'
import { ZONE_CONFIGS, type ZoneType, type ZoneFeatureProperties } from '../types/zone'
import { zonesApi } from '../services/zonesApi'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
const ZONES_STORAGE_KEY = 'mapland:zones'
const NEW_POLYGONS_STORAGE_KEY = 'mapland:new-polygons'

type DataSource = 'supabase' | 'localStorage' | 'default'

interface LoadingState {
  isLoading: boolean
  error: string | null
  source: DataSource | null
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: true,
    error: null,
    source: null,
  })
  const [status, setStatus] = useState('Loading map…')

  // Store zones data in ref to access in map callbacks
  const zonesDataRef = useRef<FeatureCollection | null>(null)

  // Helper functions for localStorage (fallback)
  const getStoredZones = useCallback((): FeatureCollection => {
    const raw = localStorage.getItem(ZONES_STORAGE_KEY)
    if (!raw) return DEFAULT_ZONES
    try {
      const parsed = JSON.parse(raw) as FeatureCollection
      if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        return parsed
      }
    } catch (error) {
      console.error('Failed to parse stored zones', error)
    }
    return DEFAULT_ZONES
  }, [])

  const getStoredNewPolygons = useCallback((): FeatureCollection => {
    const raw = localStorage.getItem(NEW_POLYGONS_STORAGE_KEY)
    if (!raw) return { type: 'FeatureCollection', features: [] }
    try {
      const parsed = JSON.parse(raw) as FeatureCollection
      if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        parsed.features = parsed.features.map(feature => ({
          ...feature,
          properties: {
            ...feature.properties,
            zoneType: feature.properties?.zoneType || 'danger'
          }
        }))
        return parsed
      }
    } catch (error) {
      console.error('Failed to parse stored new polygons', error)
    }
    return { type: 'FeatureCollection', features: [] }
  }, [])

  const getCombinedLocalFeatures = useCallback((): FeatureCollection => {
    const zones = getStoredZones()
    const newPolygons = getStoredNewPolygons()
    return {
      type: 'FeatureCollection',
      features: [...zones.features, ...newPolygons.features]
    }
  }, [getStoredZones, getStoredNewPolygons])

  // Fetch zones from Supabase or fallback to localStorage
  const fetchZones = useCallback(async (): Promise<{ data: FeatureCollection; source: DataSource }> => {
    // Try Supabase first if configured
    if (zonesApi.isAvailable()) {
      try {
        const supabaseData = await zonesApi.getAllAsGeoJSON()
        if (supabaseData.features.length > 0) {
          return { data: supabaseData, source: 'supabase' }
        }
        // Supabase is available but empty - check localStorage
        const localData = getCombinedLocalFeatures()
        if (localData.features.length > 0) {
          return { data: localData, source: 'localStorage' }
        }
        // Both empty, use default
        return { data: DEFAULT_ZONES, source: 'default' }
      } catch (error) {
        console.warn('Failed to fetch from Supabase, falling back to localStorage:', error)
        // Fall through to localStorage
      }
    }

    // Fallback to localStorage
    const localData = getCombinedLocalFeatures()
    if (localData.features.length > 0) {
      return { data: localData, source: 'localStorage' }
    }

    // Default zones as last resort
    return { data: DEFAULT_ZONES, source: 'default' }
  }, [getCombinedLocalFeatures])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    if (!MAPBOX_TOKEN) {
      console.error('Missing VITE_MAPBOX_TOKEN. Set it in a .env file or environment.')
      setStatus('Missing Mapbox token')
      setLoadingState({ isLoading: false, error: 'Missing Mapbox token', source: null })
      return
    }

    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [2.1734, 41.3851],
      zoom: 11,
    })

    // Set cursor to grab/hand for navigation
    const mapContainer = map.getContainer()
    if (mapContainer) {
      mapContainer.style.cursor = 'grab'
    }

    // Add zoom controls
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')

    mapRef.current = map

    // Create popup for zone info
    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '300px',
    })
    popupRef.current = popup

    const removeLayerIfExists = (id: string) => {
      if (map.getLayer(id)) {
        map.removeLayer(id)
      }
    }

    const removeSourceIfExists = (id: string) => {
      if (map.getSource(id)) {
        map.removeSource(id)
      }
    }

    // Unified function to display all zones (from any source)
    const displayZones = (fc: FeatureCollection) => {
      const sourceId = 'all-zones'
      const existing = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined

      // Remove existing zone type layers
      const zoneTypes: ZoneType[] = ['danger', 'suggested', 'boundary']
      zoneTypes.forEach(zoneType => {
        removeLayerIfExists(`zones-fill-${zoneType}`)
        removeLayerIfExists(`zones-outline-${zoneType}`)
      })
      // Also remove legacy layers
      removeLayerIfExists('zones-outline')
      removeLayerIfExists('zones-fill')
      removeSourceIfExists('zones')
      removeSourceIfExists('new-polygons')

      if (fc && fc.features.length) {
        if (existing) {
          existing.setData(fc)
        } else {
          map.addSource(sourceId, {
            type: 'geojson',
            data: fc,
          })
        }

        // Create fill and outline layers for each zone type
        // Note: 'boundary' type zones are only rendered as outlines (no fill)
        zoneTypes.forEach(zoneType => {
          const config = ZONE_CONFIGS[zoneType]
          const fillLayerId = `zones-fill-${zoneType}`
          const outlineLayerId = `zones-outline-${zoneType}`

          // Skip fill layer for boundary zones (they define the perimeter, not areas to highlight)
          if (zoneType !== 'boundary') {
            // Parse fill color from rgba string
            const fillColorMatch = config.fillColor.match(/rgba?\(([^)]+)\)/)
            let fillColor = config.fillColor
            if (fillColorMatch) {
              const parts = fillColorMatch[1].split(',').map((v: string) => v.trim())
              fillColor = `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`
            }

            // Add fill layer for danger/suggested zones
            if (!map.getLayer(fillLayerId)) {
              map.addLayer({
                id: fillLayerId,
                type: 'fill',
                source: sourceId,
                filter: ['==', ['get', 'zoneType'], zoneType],
                paint: {
                  'fill-color': fillColor,
                  'fill-opacity': config.fillOpacity,
                },
              })
            }
          }

          // Add outline layer for all zones of this type
          if (!map.getLayer(outlineLayerId)) {
            const lineColor = zoneType === 'danger' ? '#cc0000' 
              : zoneType === 'suggested' ? '#009900' 
              : '#666666'  // boundary
            
            map.addLayer({
              id: outlineLayerId,
              type: 'line',
              source: sourceId,
              filter: ['==', ['get', 'zoneType'], zoneType],
              paint: {
                'line-color': lineColor,
                'line-width': zoneType === 'boundary' ? 1.5 : 2,
              },
            })
          }
        })

        // Store for popup access
        zonesDataRef.current = fc
      } else {
        zoneTypes.forEach(zoneType => {
          removeLayerIfExists(`zones-fill-${zoneType}`)
          removeLayerIfExists(`zones-outline-${zoneType}`)
        })
        removeSourceIfExists(sourceId)
        zonesDataRef.current = null
      }
    }

    let lastZonesHash: string | null = null
    let debounceHandle: number | null = null

    const upsertExclusionSource = (fc: FeatureCollection | null, force = false) => {
      const currentHash = featureCollectionHash(fc)
      if (!force && currentHash === lastZonesHash) return
      const { exclusion, durationMs } = buildMaskWithTiming(fc, lastZonesHash)
      lastZonesHash = currentHash
      if (import.meta.env.DEV) {
        console.debug('[mask] rebuilt in', durationMs, 'ms')
      }
      const sourceId = 'zones-exclusion'
      const fillLayerId = 'zones-exclusion-fill'
      const outlineLayerId = 'zones-exclusion-outline'

      if (!exclusion) {
        removeLayerIfExists(fillLayerId)
        removeLayerIfExists(outlineLayerId)
        removeSourceIfExists(sourceId)
        return
      }

      const existing = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
      if (existing) {
        existing.setData(exclusion)
      } else {
        map.addSource(sourceId, {
          type: 'geojson',
          data: exclusion,
        })
      }

      const fillPaint = {
        'fill-color': '#34495E',
        'fill-opacity': 0.28,
        'fill-antialias': true,
      }

      if (!map.getLayer(fillLayerId)) {
        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          paint: fillPaint,
        })
      }

      const outlinePaint = {
        'line-color': '#999999',
        'line-width': 1.4,
        'line-dasharray': [3, 3] as [number, number],
      }

      if (!map.getLayer(outlineLayerId)) {
        map.addLayer({
          id: outlineLayerId,
          type: 'line',
          source: sourceId,
          paint: outlinePaint,
        })
      }
    }

    const applyLabelFontWeight = () => {
      const style = map.getStyle()
      if (!style?.layers) return

      style.layers
        .filter((layer) => layer.type === 'symbol')
        .forEach((layer) => {
          try {
            map.setLayoutProperty(layer.id, 'text-font', ['DIN Pro Regular', 'Arial Unicode MS Regular'])
          } catch {
            // Some layers might not expose text-font; ignore failures silently.
          }
        })
    }

    // Render zones on map
    const renderZones = (fc: FeatureCollection, source: DataSource) => {
      displayZones(fc)
      upsertExclusionSource(fc, true)
      
      const sourceLabel = source === 'supabase' ? 'cloud' : source === 'localStorage' ? 'local' : 'default'
      setStatus(`Loaded ${fc.features.length} zone(s) from ${sourceLabel}`)
      setLoadingState({ isLoading: false, error: null, source })
    }

    const scheduleSync = (data: FeatureCollection | null) => {
      if (debounceHandle) window.clearTimeout(debounceHandle)
      debounceHandle = window.setTimeout(() => {
        if (data) {
          // Data from zones-updated event (Editor saved locally)
          displayZones(data)
          upsertExclusionSource(data)
          setStatus(`Updated ${data.features.length} zone(s)`)
        } else {
          // Reload from current source
          fetchZones().then(({ data: fc, source }) => {
            renderZones(fc, source)
          })
        }
      }, 180)
    }

    const onZonesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<FeatureCollection | null>).detail ?? null
      scheduleSync(detail)
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === ZONES_STORAGE_KEY || event.key === NEW_POLYGONS_STORAGE_KEY) {
        scheduleSync(null)
      }
    }

    // Click handler for zone info popup
    const onZoneClick = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['zones-fill-danger', 'zones-fill-suggested'],
      })

      if (features.length === 0) {
        popup.remove()
        return
      }

      const feature = features[0] as unknown as Feature<Polygon>
      const props = feature.properties as ZoneFeatureProperties

      const zoneType = props.zoneType || 'danger'
      const config = ZONE_CONFIGS[zoneType]
      const icon = zoneType === 'danger' ? '🔴' : '🟢'

      const html = `
        <div style="font-family: system-ui, sans-serif;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">
            ${icon} ${props.name || 'Unnamed Zone'}
          </div>
          <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
            ${config.label}
          </div>
          ${props.message ? `
            <div style="font-size: 13px; padding: 8px; background: ${zoneType === 'danger' ? '#fff0f0' : '#f0fff0'}; border-radius: 4px; border-left: 3px solid ${zoneType === 'danger' ? '#cc0000' : '#009900'};">
              ${props.message}
            </div>
          ` : ''}
        </div>
      `

      popup
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map)
    }

    // Change cursor on zone hover
    const onZoneMouseEnter = () => {
      mapContainer.style.cursor = 'pointer'
    }

    const onZoneMouseLeave = () => {
      mapContainer.style.cursor = 'grab'
    }

    map.on('load', async () => {
      setStatus('Loading zones…')
      applyLabelFontWeight()

      try {
        const { data: fc, source } = await fetchZones()
        renderZones(fc, source)
      } catch (error) {
        console.error('Failed to load zones:', error)
        setStatus('Failed to load zones')
        setLoadingState({ 
          isLoading: false, 
          error: error instanceof Error ? error.message : 'Unknown error', 
          source: null 
        })
        // Try to show default zones at least
        displayZones(DEFAULT_ZONES)
        upsertExclusionSource(DEFAULT_ZONES, true)
      }

      // Add click handlers for zone layers (after zones are loaded)
      map.on('click', 'zones-fill-danger', onZoneClick)
      map.on('click', 'zones-fill-suggested', onZoneClick)
      map.on('mouseenter', 'zones-fill-danger', onZoneMouseEnter)
      map.on('mouseenter', 'zones-fill-suggested', onZoneMouseEnter)
      map.on('mouseleave', 'zones-fill-danger', onZoneMouseLeave)
      map.on('mouseleave', 'zones-fill-suggested', onZoneMouseLeave)
    })

    map.on('styledata', applyLabelFontWeight)
    map.on('error', (e: mapboxgl.ErrorEvent) => {
      console.error('Mapbox GL JS error:', e?.error || e)
      setStatus('Map error (see console)')
    })

    window.addEventListener('zones-updated', onZonesUpdated)
    window.addEventListener('storage', onStorage)

    return () => {
      map.off('styledata', applyLabelFontWeight)
      map.off('click', 'zones-fill-danger', onZoneClick)
      map.off('click', 'zones-fill-suggested', onZoneClick)
      map.off('mouseenter', 'zones-fill-danger', onZoneMouseEnter)
      map.off('mouseenter', 'zones-fill-suggested', onZoneMouseEnter)
      map.off('mouseleave', 'zones-fill-danger', onZoneMouseLeave)
      map.off('mouseleave', 'zones-fill-suggested', onZoneMouseLeave)
      window.removeEventListener('zones-updated', onZonesUpdated)
      window.removeEventListener('storage', onStorage)
      if (debounceHandle) window.clearTimeout(debounceHandle)
      popup.remove()
      map.remove()
      mapRef.current = null
    }
  }, [fetchZones, getCombinedLocalFeatures])

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ padding: 16 }}>
        Missing VITE_MAPBOX_TOKEN. Add it to your .env file to display the map.
      </div>
    )
  }

  const getStatusIcon = () => {
    if (loadingState.isLoading) return '⏳'
    if (loadingState.error) return '⚠️'
    if (loadingState.source === 'supabase') return '☁️'
    if (loadingState.source === 'localStorage') return '💾'
    return '📍'
  }

  return (
    <>
      <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />
      <div
        style={{
          position: 'fixed',
          top: 8,
          left: 8,
          padding: '6px 10px',
          background: loadingState.error ? 'rgba(200,0,0,0.8)' : 'rgba(0,0,0,0.6)',
          color: '#fff',
          fontSize: 12,
          borderRadius: 6,
          fontWeight: 400,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>{getStatusIcon()}</span>
        <span>{status}</span>
      </div>
    </>
  )
}
