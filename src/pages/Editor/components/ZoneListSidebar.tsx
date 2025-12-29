import { useEffect, useState } from 'react'
import type Feature from 'ol/Feature'
import type { Geometry } from 'ol/geom'
import type VectorSource from 'ol/source/Vector'
import { ZONE_CONFIGS, type ZoneFeatureProperties } from '../../../types/zone'
import './ZoneListSidebar.css'

interface ZoneItem {
  feature: Feature<Geometry>
  id: string
  name: string
  zoneType: string
}

interface ZoneListSidebarProps {
  vectorSrc: VectorSource
  vectorDrawSrc: VectorSource
  selectedFeature: Feature<Geometry> | null
  onSelectZone: (feature: Feature<Geometry>) => void
  isOpen: boolean
  onToggle: () => void
}

export default function ZoneListSidebar({
  vectorSrc,
  vectorDrawSrc,
  selectedFeature,
  onSelectZone,
  isOpen,
  onToggle,
}: ZoneListSidebarProps) {
  const [zones, setZones] = useState<ZoneItem[]>([])

  // Update zone list when sources change
  useEffect(() => {
    const updateZones = () => {
      const allFeatures: ZoneItem[] = []
      
      // Get features from vectorSrc (legacy zones)
      vectorSrc.getFeatures().forEach((feature, index) => {
        const props = feature.getProperties() as ZoneFeatureProperties
        allFeatures.push({
          feature: feature as Feature<Geometry>,
          id: props.id || `legacy-${index}`,
          name: props.name || `Zone ${index + 1}`,
          zoneType: props.zoneType || 'danger',
        })
      })

      // Get features from vectorDrawSrc (new zones)
      vectorDrawSrc.getFeatures().forEach((feature, index) => {
        const props = feature.getProperties() as ZoneFeatureProperties
        allFeatures.push({
          feature: feature as Feature<Geometry>,
          id: props.id || `new-${index}`,
          name: props.name || `New Zone ${index + 1}`,
          zoneType: props.zoneType || 'danger',
        })
      })

      setZones(allFeatures)
    }

    updateZones()

    // Listen for changes in both sources
    vectorSrc.on('addfeature', updateZones)
    vectorSrc.on('removefeature', updateZones)
    vectorSrc.on('changefeature', updateZones)
    vectorSrc.on('clear', updateZones)
    vectorDrawSrc.on('addfeature', updateZones)
    vectorDrawSrc.on('removefeature', updateZones)
    vectorDrawSrc.on('changefeature', updateZones)
    vectorDrawSrc.on('clear', updateZones)

    return () => {
      vectorSrc.un('addfeature', updateZones)
      vectorSrc.un('removefeature', updateZones)
      vectorSrc.un('changefeature', updateZones)
      vectorSrc.un('clear', updateZones)
      vectorDrawSrc.un('addfeature', updateZones)
      vectorDrawSrc.un('removefeature', updateZones)
      vectorDrawSrc.un('changefeature', updateZones)
      vectorDrawSrc.un('clear', updateZones)
    }
  }, [vectorSrc, vectorDrawSrc])

  // Re-fetch zone properties when selectedFeature changes (to reflect name updates)
  useEffect(() => {
    if (selectedFeature) {
      // Trigger a re-render to update the displayed name
      setZones((prev) =>
        prev.map((zone) => {
          if (zone.feature === selectedFeature) {
            const props = selectedFeature.getProperties() as ZoneFeatureProperties
            return {
              ...zone,
              name: props.name || zone.name,
              zoneType: props.zoneType || zone.zoneType,
            }
          }
          return zone
        })
      )
    }
  }, [selectedFeature])

  const getZoneTypeIcon = (zoneType: string) => {
    return zoneType === 'danger' ? '🔴' : '🟢'
  }

  const getZoneTypeLabel = (zoneType: string) => {
    return ZONE_CONFIGS[zoneType as keyof typeof ZONE_CONFIGS]?.label || zoneType
  }

  return (
    <>
      {/* Toggle button */}
      <button 
        className={`zone-list-toggle ${isOpen ? 'open' : ''}`}
        onClick={onToggle}
        title={isOpen ? 'Hide zone list' : 'Show zone list'}
      >
        {isOpen ? '◀' : '▶'} Zones ({zones.length})
      </button>

      {/* Sidebar */}
      <div className={`zone-list-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="zone-list-header">
          <h3>All Zones</h3>
          <span className="zone-count">{zones.length} zone{zones.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="zone-list-content">
          {zones.length === 0 ? (
            <div className="zone-list-empty">
              <p>No zones yet.</p>
              <p className="hint">Use "Draw zone" to create zones.</p>
            </div>
          ) : (
            <ul className="zone-list">
              {zones.map((zone, index) => {
                const isSelected = selectedFeature === zone.feature
                return (
                  <li
                    key={zone.id || index}
                    className={`zone-list-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectZone(zone.feature)}
                  >
                    <span className="zone-icon">{getZoneTypeIcon(zone.zoneType)}</span>
                    <div className="zone-info">
                      <span className="zone-name">{zone.name || 'Unnamed Zone'}</span>
                      <span className="zone-type">{getZoneTypeLabel(zone.zoneType)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
