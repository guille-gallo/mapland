import { useState, useEffect } from 'react'
import type Feature from 'ol/Feature'
import type { Geometry } from 'ol/geom'
import { ZONE_CONFIGS, type ZoneType, type ZoneFeatureProperties } from '../../../types/zone'
import './ZonePropertiesPanel.css'

interface ZonePropertiesPanelProps {
  selectedFeature: Feature<Geometry> | null
  onUpdate: (feature: Feature<Geometry>, properties: ZoneFeatureProperties) => void
  onDelete: (feature: Feature<Geometry>) => void
  onClose: () => void
}

export default function ZonePropertiesPanel({
  selectedFeature,
  onUpdate,
  onDelete,
  onClose,
}: ZonePropertiesPanelProps) {
  const [name, setName] = useState('')
  const [zoneType, setZoneType] = useState<ZoneType>('danger')
  const [message, setMessage] = useState('')

  // Sync form state when selected feature changes
  useEffect(() => {
    if (selectedFeature) {
      const props = selectedFeature.getProperties() as ZoneFeatureProperties
      setName(props.name || '')
      setZoneType(props.zoneType || 'danger')
      setMessage(props.message || '')
    }
  }, [selectedFeature])

  if (!selectedFeature) {
    return null
  }

  const handleSave = () => {
    onUpdate(selectedFeature, {
      name: name.trim() || 'Unnamed Zone',
      zoneType,
      message: message.trim() || null,
    })
  }

  const handleDelete = () => {
    const confirmed = window.confirm('Delete this zone? This action cannot be undone.')
    if (confirmed) {
      onDelete(selectedFeature)
    }
  }

  return (
    <div className="zone-properties-panel">
      <div className="zone-properties-header">
        <h3>Zone Properties</h3>
        <button className="close-button" onClick={onClose} title="Close panel">
          ×
        </button>
      </div>

      <div className="zone-properties-form">
        <div className="form-group">
          <label htmlFor="zone-name">Name</label>
          <input
            id="zone-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter zone name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="zone-type">Type</label>
          <select
            id="zone-type"
            value={zoneType}
            onChange={(e) => setZoneType(e.target.value as ZoneType)}
          >
            {Object.entries(ZONE_CONFIGS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="zone-message">Message</label>
          <textarea
            id="zone-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message shown when user enters this zone"
            rows={3}
          />
        </div>

        <div className="form-actions">
          <button className="save-button" onClick={handleSave}>
            💾 Save Changes
          </button>
          <button className="delete-button" onClick={handleDelete}>
            🗑️ Delete Zone
          </button>
        </div>
      </div>
    </div>
  )
}
