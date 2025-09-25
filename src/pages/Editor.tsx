import { useEffect, useMemo, useRef, useState } from 'react'
import 'ol/ol.css'
import Map from 'ol/Map'
import View from 'ol/View'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import Select from 'ol/interaction/Select'
import { click } from 'ol/events/condition'
import GeoJSON from 'ol/format/GeoJSON'
import { fromLonLat } from 'ol/proj'
import olms from 'ol-mapbox-style'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

export default function Editor() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const vectorSrc = useMemo(() => new VectorSource(), [])
  const vectorLayer = useMemo(() => new VectorLayer({ source: vectorSrc }), [vectorSrc])
  const [mode, setMode] = useState<'select' | 'modify' | 'draw-polygon'>('draw-polygon')

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return

    const map = new Map({
      target: containerRef.current,
      view: new View({ center: fromLonLat([2.1734, 41.3851]), zoom: 12, rotation: 0 }),
    })
    mapRef.current = map

    const styleUrl = 'mapbox://styles/mapbox/streets-v12'

    olms(map, styleUrl, { accessToken: MAPBOX_TOKEN })
      .then(() => {
        map.addLayer(vectorLayer)
      })
      .catch((error) => {
        console.error('Failed to load Mapbox style in OpenLayers editor', error)
      })

    return () => {
      map.setTarget(undefined)
      mapRef.current = null
    }
  }, [MAPBOX_TOKEN, vectorLayer])

  // Switch interactions when mode changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remove all existing interactions we manage
    map.getInteractions().forEach((i) => {
      if (i instanceof Draw || i instanceof Modify || i instanceof Select) {
        map.removeInteraction(i)
      }
    })

    if (mode === 'draw-polygon') {
      map.addInteraction(new Draw({ source: vectorSrc, type: 'Polygon' }))
    } else if (mode === 'modify') {
      map.addInteraction(new Modify({ source: vectorSrc }))
    } else if (mode === 'select') {
      map.addInteraction(new Select({ condition: click }))
    }
  }, [mode, vectorSrc])

  const exportGeoJSON = () => {
    const fmt = new GeoJSON()
    const features = vectorSrc.getFeatures()
    const fc = fmt.writeFeaturesObject(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
    })
    // For now, log and copy to clipboard if available
    console.log('Exported FeatureCollection', fc)
    if (navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(fc, null, 2)).catch(() => {})
    }
    alert('Exported GeoJSON copied to clipboard (also in console).')
  }

  const clearAll = () => {
    vectorSrc.clear()
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ padding: 16 }}>
        <h1>Zone Editor</h1>
        <p>Missing VITE_MAPBOX_TOKEN. Configure it to load the Mapbox basemap in the editor.</p>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 1, display: 'flex', gap: 8, background: 'rgba(255,255,255,0.9)', padding: '6px 8px', borderRadius: 6 }}>
        <button onClick={() => setMode('draw-polygon')} disabled={mode === 'draw-polygon'}>Draw polygon</button>
        <button onClick={() => setMode('modify')} disabled={mode === 'modify'}>Modify</button>
        <button onClick={() => setMode('select')} disabled={mode === 'select'}>Select</button>
        <button onClick={exportGeoJSON}>Export</button>
        <button onClick={clearAll}>Clear</button>
      </div>
      <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />
    </div>
  )
}

