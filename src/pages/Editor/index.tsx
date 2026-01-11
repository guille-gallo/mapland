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
import type { FeatureCollection, Polygon } from 'geojson'
import type { FeatureLike } from 'ol/Feature'
import type Feature from 'ol/Feature'
import type { Geometry } from 'ol/geom'
import { DEFAULT_ZONES } from '../../data/default-zones'
import { createExclusionFeatureCollection } from '../../utils/geojson'
import { ZONE_CONFIGS, type ZoneType, type ZoneFeatureProperties } from '../../types/zone'
import EditorToolbar from '../../components/EditorToolbar'
import ZonePropertiesPanel from './components/ZonePropertiesPanel'
import ZoneListSidebar from './components/ZoneListSidebar'
import { zonesApi } from '../../services/zonesApi'


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
    
    // Boundary zones get transparent fill with gray outline
    if (zoneType === 'boundary') {
      return new Style({
        stroke: new Stroke({ color: '#666666', width: 2 }),
        fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
      })
    }
    
    // For danger/suggested zones, derive stroke color from fill color
    const strokeColor = config.fillColor.replace(/[\d.]+\)$/, '1)')
    
    return new Style({
      stroke: new Stroke({ color: strokeColor, width: 2 }),
      fill: new Fill({ color: config.fillColor }),
    })
  }, [])
  
  const vectorLayer = useMemo(
    () =>
      new VectorLayer({
        source: vectorSrc,
        style: getStyleForFeature,
        zIndex: 2,
      }),
    [vectorSrc, getStyleForFeature],
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
  const [isPublishing, setIsPublishing] = useState(false)
  const [selectedFeature, setSelectedFeature] = useState<Feature<Geometry> | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const selectRef = useRef<Select | null>(null)
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

  // Load zones from Supabase if available, otherwise from localStorage
  const loadZonesFromSupabaseOrLocal = async () => {
    if (zonesApi.isAvailable()) {
      try {
        const supabaseData = await zonesApi.getAllAsGeoJSON()
        if (supabaseData.features.length > 0) {
          loadFeatureCollection(supabaseData)
          // Also update localStorage to keep in sync
          localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(supabaseData))
          return
        }
      } catch (error) {
        console.warn('Failed to load from Supabase, falling back to localStorage:', error)
      }
    }
    // Fallback to localStorage
    loadSavedZones()
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
      // Disable default zoom control so we only use the custom bottom-right one
      controls: defaultControls({ zoom: false }).extend([
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

    olms(map, styleUrl, { accessToken: MAPBOX_TOKEN }).then(async () => {
        map.addLayer(exclusionLayer)
        map.addLayer(vectorLayer)
        map.addLayer(vectorDrawLayer)
        // Load zones from Supabase if available, otherwise localStorage
        await loadZonesFromSupabaseOrLocal()
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
    selectRef.current = null

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
      // Clear selection when entering draw mode
      setSelectedFeature(null)
      
      const draw = new Draw({ source: vectorDrawSrc, type: 'Polygon' })
      
      // Set zone type on newly drawn features
      draw.on('drawend', (event) => {
        const feature = event.feature
        if (feature) {
          feature.setProperties({ 
            zoneType: activeZoneType,
            name: '',
            message: null,
          })
        }
      })
      
      map.addInteraction(draw)
    } else if (mode === 'select') {
      const select = new Select({ 
        condition: click,
        layers: [vectorDrawLayer, vectorLayer],
      })
      selectRef.current = select
      
      select.on('select', (e) => {
        const selected = e.selected[0] || null
        setSelectedFeature(selected as Feature<Geometry> | null)
      })
      
      map.addInteraction(select)
      
      // Add modify for selected features
      const modify = new Modify({ 
        features: select.getFeatures()
      })
      map.addInteraction(modify)
    } else {
      // Default mode - allow clicking zones to select them and modify them
      const select = new Select({ 
        condition: click,
        layers: [vectorDrawLayer, vectorLayer],
      })
      selectRef.current = select
      
      select.on('select', (e) => {
        const selected = e.selected[0] || null
        setSelectedFeature(selected as Feature<Geometry> | null)
      })
      
      map.addInteraction(select)
      
      // Add modify for selected features
      const modify = new Modify({ 
        features: select.getFeatures()
      })
      map.addInteraction(modify)
    }
  }, [mode, vectorDrawSrc, vectorDrawLayer, vectorLayer, activeZoneType])

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
    
    // Combine zones and newPolygons into a single FeatureCollection for geojson.io compatibility
    const combinedFeatureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        // Zones features with transparent fill (only border visible)
        ...allData.zones.features.map(feature => ({
          ...feature,
          properties: {
            ...feature.properties,
            fill: 'transparent',
            'fill-opacity': 0,
            stroke: '#2c63d6',
            'stroke-width': 2,
            'stroke-opacity': 1
          }
        })),
        // New polygons with their original styling
        ...allData.newPolygons.features
      ]
    }
    
    // For now, log and copy to clipboard if available
    console.log('Exported GeoJSON for geojson.io', combinedFeatureCollection)
    if (navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(combinedFeatureCollection, null, 2)).catch(() => {})
    }
    alert('Exported GeoJSON copied to clipboard! You can now paste it into geojson.io (also in console).')
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
    const confirmed = window.confirm('Clear all danger and suggested zones? The boundary zone will be preserved.')
    if (!confirmed) return

    // Find and preserve boundary features from vectorSrc
    const boundaryFeatures = vectorSrc.getFeatures().filter(f => {
      const props = f.getProperties() as ZoneFeatureProperties
      return props.zoneType === 'boundary'
    })

    // Clear all and re-add boundary features
    vectorSrc.clear()
    vectorDrawSrc.clear()
    
    // Re-add boundary features
    boundaryFeatures.forEach(f => vectorSrc.addFeature(f))

    // Save the boundary-only state to localStorage
    if (boundaryFeatures.length > 0) {
      // Use the GeoJSON formatter to serialize boundary features
      const boundaryFC = geoJSONFormatter.writeFeaturesObject(boundaryFeatures, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      })
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(boundaryFC))
    } else {
      // If no boundary, restore default
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(DEFAULT_ZONES))
      loadFeatureCollection(DEFAULT_ZONES)
    }
    
    localStorage.removeItem(NEW_POLYGONS_STORAGE_KEY)
    
    // Dispatch update event with remaining features
    const zones = serializeFeatures()
    const newPolygons = serializeNewPolygons()
    const remainingFC: FeatureCollection = {
      type: 'FeatureCollection',
      features: [...zones.features, ...newPolygons.features]
    }
    window.dispatchEvent(new CustomEvent<FeatureCollection | null>('zones-updated', { detail: remainingFC }))
  }

  const publishToSupabase = async () => {
    if (!zonesApi.isAvailable()) {
      alert('Supabase is not configured. Please set up environment variables.')
      return
    }

    const confirmed = window.confirm(
      'Publish all zones to Supabase? This will replace all zones in the database with your current zones.'
    )
    if (!confirmed) return

    setIsPublishing(true)

    try {
      const zones = serializeFeatures()
      const newPolygons = serializeNewPolygons()

      // Combine all features and ensure they have required properties
      const allFeatures = [...zones.features, ...newPolygons.features].map((feature, index) => ({
        ...feature,
        properties: {
          ...feature.properties,
          name: feature.properties?.name || `Zone ${index + 1}`,
          zoneType: feature.properties?.zoneType || 'danger',
          message: feature.properties?.message || null,
        },
      }))

      const featureCollection: FeatureCollection<Polygon> = {
        type: 'FeatureCollection',
        features: allFeatures as FeatureCollection<Polygon>['features'],
      }

      await zonesApi.publishAll(featureCollection)
      
      // After successful publish, merge new polygons into zones layer and clear new polygons
      // This keeps the Editor in sync with what's now in Supabase
      const newPolygonFeatures = vectorDrawSrc.getFeatures()
      newPolygonFeatures.forEach(f => vectorSrc.addFeature(f))
      vectorDrawSrc.clear()
      
      // Update localStorage to reflect the merged state
      const mergedZones = serializeFeatures()
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(mergedZones))
      localStorage.removeItem(NEW_POLYGONS_STORAGE_KEY)
      
      alert(`Successfully published ${allFeatures.length} zone(s) to Supabase!`)
    } catch (error) {
      console.error('Failed to publish zones:', error)
      alert(`Failed to publish zones: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsPublishing(false)
    }
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ padding: 16 }}>
        <h1>Zone Editor</h1>
        <p>Missing VITE_MAPBOX_TOKEN. Configure it to load the Mapbox basemap in the editor.</p>
      </div>
    )
  }

  const handleZoneTypeChange = (zoneType: ZoneType | '', newMode: 'default' | 'draw-polygon') => {
    setActiveZoneType(zoneType)
    setMode(newMode)
  }

  // Handler to update zone properties
  const handleUpdateZoneProperties = (feature: Feature<Geometry>, properties: ZoneFeatureProperties) => {
    feature.setProperties({
      ...feature.getProperties(),
      ...properties,
    })
    // Trigger a re-render of the layer to update styling if zoneType changed
    vectorDrawSrc.changed()
    vectorSrc.changed()
  }

  // Handler to delete a zone
  const handleDeleteZone = (feature: Feature<Geometry>) => {
    // Try to remove from both sources
    vectorDrawSrc.removeFeature(feature)
    vectorSrc.removeFeature(feature)
    setSelectedFeature(null)
    // Clear selection in the Select interaction
    if (selectRef.current) {
      selectRef.current.getFeatures().clear()
    }
  }

  // Handler to close the properties panel
  const handleClosePropertiesPanel = () => {
    setSelectedFeature(null)
    // Clear selection in the Select interaction
    if (selectRef.current) {
      selectRef.current.getFeatures().clear()
    }
  }

  // Handler to select zone from the sidebar list
  const handleSelectZoneFromList = (feature: Feature<Geometry>) => {
    setSelectedFeature(feature)
    // Update the Select interaction to show the selection
    if (selectRef.current) {
      selectRef.current.getFeatures().clear()
      selectRef.current.getFeatures().push(feature)
    }
    // Optionally zoom to the feature
    if (mapRef.current && feature.getGeometry()) {
      const extent = feature.getGeometry()!.getExtent()
      mapRef.current.getView().fit(extent, {
        padding: [100, 100, 100, 100],
        duration: 500,
        maxZoom: 16,
      })
    }
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <EditorToolbar
        activeZoneType={activeZoneType}
        onZoneTypeChange={handleZoneTypeChange}
        onSave={saveZones}
        onExport={exportGeoJSON}
        onClear={clearAll}
        onPublish={publishToSupabase}
        isPublishing={isPublishing}
        isSupabaseConfigured={zonesApi.isAvailable()}
      />
      <ZoneListSidebar
        vectorSrc={vectorSrc}
        vectorDrawSrc={vectorDrawSrc}
        selectedFeature={selectedFeature}
        onSelectZone={handleSelectZoneFromList}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <ZonePropertiesPanel
        selectedFeature={selectedFeature}
        onUpdate={handleUpdateZoneProperties}
        onDelete={handleDeleteZone}
        onClose={handleClosePropertiesPanel}
      />
      <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />
    </div>
  )
}

