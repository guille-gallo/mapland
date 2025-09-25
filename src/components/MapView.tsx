import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [status, setStatus] = useState<string>(MAPBOX_TOKEN ? 'Initializing map…' : 'No token')

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    if (!MAPBOX_TOKEN) {
      // Keep it simple: log a clear error for missing token.
      console.error('Missing VITE_MAPBOX_TOKEN. Set it in a .env file or environment.')
      return
    }

    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [2.1734, 41.3851], // Barcelona [lng, lat]
      zoom: 11,
    })

    mapRef.current = map

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

    map.on('load', () => {
      setStatus('Map loaded')
      applyLabelFontWeight()
    })
    map.on('styledata', applyLabelFontWeight)
    map.on('error', (e: mapboxgl.ErrorEvent) => {
      // Surface useful error info
      console.error('Mapbox GL JS error:', e?.error || e)
      setStatus('Map error (see console)')
    })

    return () => {
      map.off('styledata', applyLabelFontWeight)
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
      <div style={{ position: 'fixed', top: 8, left: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 12, borderRadius: 4, fontWeight: 400 }}>
        {status}
      </div>
    </>
  )
}
