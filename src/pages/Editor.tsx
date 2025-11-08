import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'ol/ol.css'
import Map from 'ol/Map'
import View from 'ol/View'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Style from 'ol/style/Style'
import Draw from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import Select from 'ol/interaction/Select'
import { click } from 'ol/events/condition'
import GeoJSON from 'ol/format/GeoJSON'
import { unByKey } from 'ol/Observable'
import { fromLonLat } from 'ol/proj'
import { defaults as defaultControls, Zoom } from 'ol/control'
import olms from 'ol-mapbox-style'
import type { FeatureCollection } from 'geojson'
import type { FeatureLike } from 'ol/Feature'
import { DEFAULT_ZONES } from '../data/default-zones'
import { createExclusionFeatureCollection } from '../utils/geojson'
import { ZONE_CONFIGS, type ZoneType, type ZoneFeatureProperties } from '../types/zone'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
const ZONES_STORAGE_KEY = 'mapland:zones'
const NEW_POLYGONS_STORAGE_KEY = 'mapland:new-polygons'

export default function Editor() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  
  // Single source for all zones (both old and new)
  const vectorSrc = useMemo(() => new VectorSource(), [])
  const vectorDrawSrc = useMemo(() => new VectorSource(), [])
  
  // Function to get style based on zone type
  const getStyleForFeature = useCallback((feature: FeatureLike) => {
    const properties = feature.getProperties() as ZoneFeatureProperties
    const zoneType = properties.zoneType || 'danger' // Default to danger
    const config = ZONE_CONFIGS[zoneType]
    
    return new Style({
      stroke: new Stroke({ color: config.color, width: 2 }),
      fill: new Fill({ color: config.fillColor }),
    })
  }, [])
  
  const vectorStyle = useMemo(
    () =>
      new Style({
        stroke: new Stroke({ color: '#2c63d6', width: 2 }),
        fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }), // transparent.
      }),
    [],
  )
  
  const vectorLayer = useMemo(
    () =>
      new VectorLayer({
        source: vectorSrc,
        style: vectorStyle,
        zIndex: 2,
      }),
    [vectorSrc, vectorStyle],
  )
  
  const vectorDrawLayer = useMemo(
    () =>
      new VectorLayer({
        source: vectorDrawSrc,
        style: getStyleForFeature,
        zIndex: 2,
      }),
    [vectorDrawSrc, getStyleForFeature],
  )
  const exclusionSrc = useMemo(() => new VectorSource(), [])
  const exclusionStyle = useMemo(
    () =>
      new Style({
        fill: new Fill({ color: 'rgba(52,73,94,0.28)' }),
        stroke: new Stroke({ color: 'rgba(153,153,153,0.6)', width: 1, lineDash: [3, 3] }),
      }),
    [],
  )
  const exclusionLayer = useMemo(
    () =>
      new VectorLayer({
        source: exclusionSrc,
        style: exclusionStyle,
        zIndex: 1,
      }),
    [exclusionSrc, exclusionStyle],
  )
  const [mode, setMode] = useState<'default' | 'select' | 'draw-polygon'>('default')
  const [activeZoneType, setActiveZoneType] = useState<ZoneType | ''>('')
  const [menuOpen, setMenuOpen] = useState(false)
  const geoJSONFormatter = useMemo(() => new GeoJSON(), [])

  const loadFeatureCollection = (fc: FeatureCollection) => {
    const features = geoJSONFormatter.readFeatures(fc, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    })
    // Ensure all features have a zoneType property (backward compatibility)
    features.forEach(feature => {
      const properties = feature.getProperties() as ZoneFeatureProperties
      if (!properties.zoneType) {
        feature.set('zoneType', 'danger')
      }
    })
    vectorSrc.clear()
    vectorSrc.addFeatures(features)
  }

  const loadNewPolygons = (fc: FeatureCollection) => {
    const features = geoJSONFormatter.readFeatures(fc, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    })
    // Ensure all features have a zoneType property (backward compatibility)
    features.forEach(feature => {
      const properties = feature.getProperties() as ZoneFeatureProperties
      if (!properties.zoneType) {
        feature.set('zoneType', 'danger')
      }
    })
    vectorDrawSrc.clear()
    vectorDrawSrc.addFeatures(features)
  }

  const loadSavedZones = () => {
    const raw = localStorage.getItem(ZONES_STORAGE_KEY)
    if (!raw) {
      loadFeatureCollection(DEFAULT_ZONES)
      return
    }
    try {
      const parsed = JSON.parse(raw) as FeatureCollection
      if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        loadFeatureCollection(parsed)
        return
      }
    } catch (error) {
      console.error('Failed to load saved zones from storage', error)
    }
    loadFeatureCollection(DEFAULT_ZONES)
  }

  const loadSavedNewPolygons = () => {
    const raw = localStorage.getItem(NEW_POLYGONS_STORAGE_KEY)
    if (!raw) {
      return
    }
    try {
      const parsed = JSON.parse(raw) as FeatureCollection
      if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        loadNewPolygons(parsed)
        return
      }
    } catch (error) {
      console.error('Failed to load saved new polygons from storage', error)
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return

    const map = new Map({
      target: containerRef.current,
      view: new View({ center: fromLonLat([2.1734, 41.3851]), zoom: 12, rotation: 0 }),
      controls: defaultControls().extend([
        new Zoom({
          className: 'ol-zoom-bottom',
          zoomInTipLabel: 'Zoom in',
          zoomOutTipLabel: 'Zoom out'
        })
      ])
    })
    mapRef.current = map

    // Add CSS for bottom-right zoom controls
    const style = document.createElement('style')
    style.textContent = `
      .ol-zoom-bottom {
        left: unset !important;
        right: 8px !important;
        bottom: 32px !important;
        top: unset !important;
      }
    `
    document.head.appendChild(style)

    const styleUrl = 'mapbox://styles/mapbox/streets-v12'

    olms(map, styleUrl, { accessToken: MAPBOX_TOKEN }).then(() => {
        map.addLayer(exclusionLayer)
        map.addLayer(vectorLayer)
        map.addLayer(vectorDrawLayer)
        loadSavedZones()
        loadSavedNewPolygons()
      })
      .catch((error) => {
        console.error('Failed to load Mapbox style in OpenLayers editor', error)
      })

    return () => {
      map.setTarget(undefined)
      mapRef.current = null
    }
  }, [MAPBOX_TOKEN, vectorLayer, vectorDrawLayer])

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

    // Set cursor style based on mode
    const mapElement = map.getTargetElement()
    if (mapElement) {
      if (mode === 'default') {
        mapElement.style.cursor = 'grab'
      } else if (mode === 'draw-polygon') {
        mapElement.style.cursor = ''
      } else if (mode === 'select') {
        mapElement.style.cursor = 'pointer'
      }
    }

    if (mode === 'draw-polygon' && activeZoneType) {
      const draw = new Draw({ source: vectorDrawSrc, type: 'Polygon' })
      
      // Set zone type on newly drawn features
      draw.on('drawend', (event) => {
        const feature = event.feature
        if (feature) {
          feature.setProperties({ zoneType: activeZoneType })
        }
      })
      
      map.addInteraction(draw)
    } else if (mode === 'select') {
      const select = new Select({ condition: click })
      map.addInteraction(select)
      
      // Add modify for selected features
      const modify = new Modify({ 
        features: select.getFeatures()
      })
      map.addInteraction(modify)
    }
    // default mode has no interactions - just allows map panning/zooming
  }, [mode, vectorDrawSrc, activeZoneType])

  const serializeFeatures = useCallback((): FeatureCollection => {
    const features = vectorSrc.getFeatures()
    return geoJSONFormatter.writeFeaturesObject(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
    })
  }, [vectorSrc, geoJSONFormatter])

  const serializeNewPolygons = useCallback((): FeatureCollection => {
    const features = vectorDrawSrc.getFeatures()
    return geoJSONFormatter.writeFeaturesObject(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
    })
  }, [vectorDrawSrc, geoJSONFormatter])

  const serializeAllFeatures = useCallback((): { zones: FeatureCollection; newPolygons: FeatureCollection } => {
    return {
      zones: serializeFeatures(),
      newPolygons: serializeNewPolygons(),
    }
  }, [serializeFeatures, serializeNewPolygons])

  useEffect(() => {
    const updateMask = () => {
      const zones = serializeFeatures()
      const newPolygons = serializeNewPolygons()
      
      // Combine both feature collections for mask generation
      const combinedFC: FeatureCollection = {
        type: 'FeatureCollection',
        features: [...zones.features, ...newPolygons.features]
      }
      
      const exclusion = createExclusionFeatureCollection(combinedFC)
      exclusionSrc.clear()
      if (exclusion) {
        const features = geoJSONFormatter.readFeatures(exclusion, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        })
        exclusionSrc.addFeatures(features)
      }
    }

    updateMask()

    const listeners = [
      vectorSrc.on('addfeature', () => updateMask()),
      vectorSrc.on('removefeature', () => updateMask()),
      vectorSrc.on('changefeature', () => updateMask()),
      vectorSrc.on('clear', () => updateMask()),
      vectorDrawSrc.on('addfeature', () => updateMask()),
      vectorDrawSrc.on('removefeature', () => updateMask()),
      vectorDrawSrc.on('changefeature', () => updateMask()),
      vectorDrawSrc.on('clear', () => updateMask()),
    ]

    return () => {
      listeners.forEach((key) => unByKey(key))
    }
  }, [vectorSrc, vectorDrawSrc, exclusionSrc, geoJSONFormatter, serializeFeatures, serializeNewPolygons])

  const exportGeoJSON = () => {
    const allData = serializeAllFeatures()
    // For now, log and copy to clipboard if available
    console.log('Exported all data', allData)
    if (navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(allData, null, 2)).catch(() => {})
    }
    alert('Exported all data (zones and new polygons) copied to clipboard (also in console).')
  }

  const saveZones = () => {
    const confirmed = window.confirm('Save current zones and new polygons? This will overwrite the stored data.')
    if (!confirmed) return

    try {
      const zones = serializeFeatures()
      const newPolygons = serializeNewPolygons()
      
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(zones))
      localStorage.setItem(NEW_POLYGONS_STORAGE_KEY, JSON.stringify(newPolygons))
      
      // Dispatch event with combined data for MapView
      const combinedFC: FeatureCollection = {
        type: 'FeatureCollection',
        features: [...zones.features, ...newPolygons.features]
      }
      
      window.dispatchEvent(new CustomEvent<FeatureCollection | null>('zones-updated', { detail: combinedFC }))
      alert('Zones and new polygons saved locally.')
    } catch (error) {
      console.error('Failed to save zones and new polygons', error)
      alert('Failed to save data. Check console for details.')
    }
  }

  const clearAll = () => {
    const confirmed = window.confirm('Clear all zones and new polygons? This action cannot be undone.')
    if (!confirmed) return

    vectorSrc.clear()
    vectorDrawSrc.clear()
    localStorage.removeItem(ZONES_STORAGE_KEY)
    localStorage.removeItem(NEW_POLYGONS_STORAGE_KEY)
    window.dispatchEvent(new CustomEvent<FeatureCollection | null>('zones-updated', { detail: null }))
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
      <style>{`
        .editor-controls {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1;
          display: flex;
          gap: 8px;
          background: rgba(255, 255, 255, 0.95);
          padding: 8px;
          border-radius: 24px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          align-items: center;
        }
        
        .zone-menu {
          position: relative;
          display: inline-block;
        }
        
        .zone-menu-button {
          padding: 8px 16px;
          border: 1px solid #ccc;
          border-radius: 20px;
          background: white;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }
        
        .zone-menu-button:hover {
          background: #f5f5f5;
        }
        
        .zone-menu-dropdown {
          position: absolute;
          bottom: 100%;
          left: 0;
          margin-bottom: 8px;
          background: white;
          border: 1px solid #ccc;
          border-radius: 8px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
          min-width: 200px;
          display: none;
        }
        
        .zone-menu-dropdown.open {
          display: block;
        }
        
        .zone-menu-item {
          padding: 10px 16px;
          cursor: pointer;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-size: 14px;
        }
        
        .zone-menu-item:hover {
          background: #f5f5f5;
        }
        
        .zone-menu-item:first-child {
          border-radius: 8px 8px 0 0;
        }
        
        .zone-menu-item:last-child {
          border-radius: 0 0 8px 8px;
        }
        
        .action-button {
          padding: 8px 16px;
          border: 1px solid #ccc;
          border-radius: 20px;
          background: white;
          cursor: pointer;
          font-size: 14px;
          white-space: nowrap;
        }
        
        .action-button:hover {
          background: #f5f5f5;
        }
        
        @media (max-width: 768px) {
          .editor-controls {
            bottom: 16px;
            left: 50%;
            right: auto;
            transform: translateX(-50%);
            flex-wrap: nowrap;
          }
          
          .zone-menu-dropdown {
            left: 50%;
            transform: translateX(-50%);
          }
        }
      `}</style>
      
      <div className="editor-controls">
        <div className="zone-menu">
          <button
            className="zone-menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {activeZoneType ? ZONE_CONFIGS[activeZoneType].label : 'Add Zone'} ▾
          </button>
          <div className={`zone-menu-dropdown ${menuOpen ? 'open' : ''}`}>
            <button
              className="zone-menu-item"
              onClick={() => {
                setActiveZoneType('danger')
                setMode('draw-polygon')
                setMenuOpen(false)
              }}
            >
              🔴 {ZONE_CONFIGS.danger.label}
            </button>
            <button
              className="zone-menu-item"
              onClick={() => {
                setActiveZoneType('suggested')
                setMode('draw-polygon')
                setMenuOpen(false)
              }}
            >
              🟢 {ZONE_CONFIGS.suggested.label}
            </button>
            <button
              className="zone-menu-item"
              onClick={() => {
                setActiveZoneType('')
                setMode('default')
                setMenuOpen(false)
              }}
            >
              ✋ Stop Drawing
            </button>
          </div>
        </div>
        
        <button className="action-button" onClick={saveZones}>💾 Save</button>
        <button className="action-button" onClick={exportGeoJSON}>📤 Export</button>
        <button className="action-button" onClick={clearAll}>🗑️ Clear</button>
      </div>
      
      <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />
    </div>
  )
}

