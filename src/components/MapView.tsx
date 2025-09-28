import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { FeatureCollection } from 'geojson'
import { buildMaskWithTiming, featureCollectionHash } from '../utils/maskBuilder'
import { DEFAULT_ZONES } from '../data/default-zones'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
const ZONES_STORAGE_KEY = 'mapland:zones'

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [status, setStatus] = useState('Loading map…')

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    if (!MAPBOX_TOKEN) {
      console.error('Missing VITE_MAPBOX_TOKEN. Set it in a .env file or environment.')
      setStatus('Missing Mapbox token')
      return
    }

    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [2.1734, 41.3851],
      zoom: 11,
    })

    mapRef.current = map

    const getStoredZones = (): FeatureCollection => {
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
    }

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

    const upsertZonesSource = (fc: FeatureCollection | null) => {
      const sourceId = 'zones'
      const existing = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
      const fillLayerId = 'zones-fill'

      removeLayerIfExists(fillLayerId)

      if (fc && fc.features.length) {
        if (existing) {
          existing.setData(fc)
        } else {
          map.addSource(sourceId, {
            type: 'geojson',
            data: fc,
          })
        }

        if (!map.getLayer('zones-outline')) {
          map.addLayer({
            id: 'zones-outline',
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': '#2c63d6',
              'line-width': 2,
            },
          })
        }
      } else {
        removeLayerIfExists('zones-outline')
        removeSourceIfExists(sourceId)
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
        // eslint-disable-next-line no-console
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
      } else {
        map.setPaintProperty(fillLayerId, 'fill-color', fillPaint['fill-color'])
        map.setPaintProperty(fillLayerId, 'fill-opacity', fillPaint['fill-opacity'])
        map.setPaintProperty(fillLayerId, 'fill-antialias', fillPaint['fill-antialias'])
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
      } else {
        map.setPaintProperty(outlineLayerId, 'line-color', outlinePaint['line-color'])
        map.setPaintProperty(outlineLayerId, 'line-width', outlinePaint['line-width'])
        map.setPaintProperty(outlineLayerId, 'line-dasharray', outlinePaint['line-dasharray'])
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
          } catch (err) {
            // Some layers might not expose text-font; ignore failures silently.
          }
        })
    }

    const scheduleSync = (data: FeatureCollection | null) => {
      if (debounceHandle) window.clearTimeout(debounceHandle)
      debounceHandle = window.setTimeout(() => {
        upsertZonesSource(data)
        upsertExclusionSource(data)
      }, 180) // debounce mask recompute
    }

    const syncZonesFromStorage = (payload?: FeatureCollection | null) => {
      const data = payload === undefined ? getStoredZones() : payload
      scheduleSync(data)
    }

    const onZonesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<FeatureCollection | null>).detail ?? null
      syncZonesFromStorage(detail)
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === ZONES_STORAGE_KEY) {
        syncZonesFromStorage()
      }
    }

    map.on('load', () => {
      setStatus('Map loaded')
      applyLabelFontWeight()
      // Initial load: no debounce to render quickly
      const initial = getStoredZones()
      upsertZonesSource(initial)
      upsertExclusionSource(initial, true)
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
      window.removeEventListener('zones-updated', onZonesUpdated)
      window.removeEventListener('storage', onStorage)
      if (debounceHandle) window.clearTimeout(debounceHandle)
      map.remove()
      mapRef.current = null
    }
  }, [])

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ padding: 16 }}>
        Missing VITE_MAPBOX_TOKEN. Add it to your .env file to display the map.
      </div>
    )
  }

  return (
    <>
      <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />
      <div
        style={{
          position: 'fixed',
          top: 8,
          left: 8,
          padding: '4px 8px',
          background: 'rgba(0,0,0,0.5)',
          color: '#fff',
          fontSize: 12,
          borderRadius: 4,
          fontWeight: 400,
        }}
      >
        {status}
      </div>
    </>
  )
}
