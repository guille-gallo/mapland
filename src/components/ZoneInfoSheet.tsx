import { useState, useEffect } from 'react'
import { ZONE_CONFIGS, type ZoneType, type ZoneFeatureProperties } from '../types/zone'
import './ZoneInfoSheet.css'

interface ZoneInfoSheetProps {
  zone: ZoneFeatureProperties | null
  onClose: () => void
}

export default function ZoneInfoSheet({ zone, onClose }: ZoneInfoSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Reset expanded state when zone changes
  useEffect(() => {
    setIsExpanded(false)
  }, [zone])

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!zone) return null

  const zoneType = (zone.zoneType || 'danger') as ZoneType
  const config = ZONE_CONFIGS[zoneType]
  const icon = zoneType === 'danger' ? '🔴' : zoneType === 'suggested' ? '🟢' : '⚪'

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className={`zone-info-sheet ${isExpanded ? 'expanded' : ''}`}>
      {/* Drag handle / expand toggle */}
      <button 
        className="sheet-handle" 
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
      >
        <span className="handle-bar" />
      </button>

      {/* Close button */}
      <button className="sheet-close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      {/* Header - always visible */}
      <div className="sheet-header">
        <div className="zone-icon">{icon}</div>
        <div className="zone-title">
          <h3>{zone.name || 'Unnamed Zone'}</h3>
          <span className="zone-type-badge" data-type={zoneType}>
            {config.label}
          </span>
        </div>
      </div>

      {/* Preview content - always visible */}
      {zone.message && (
        <div className="zone-message" data-type={zoneType}>
          <span className="message-icon">💬</span>
          <p>{zone.message}</p>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="sheet-details">
          <div className="detail-section">
            <h4>Details</h4>
            <dl className="detail-list">
              {zone.id && (
                <>
                  <dt>ID</dt>
                  <dd className="zone-id">{zone.id}</dd>
                </>
              )}
              <dt>Type</dt>
              <dd>
                <span className="zone-type-badge" data-type={zoneType}>
                  {config.label}
                </span>
              </dd>
              {zone.createdAt && (
                <>
                  <dt>Created</dt>
                  <dd>{formatDate(zone.createdAt)}</dd>
                </>
              )}
              {zone.updatedAt && (
                <>
                  <dt>Last Updated</dt>
                  <dd>{formatDate(zone.updatedAt)}</dd>
                </>
              )}
            </dl>
          </div>

          {!zone.message && (
            <div className="no-message">
              <span className="message-icon">💬</span>
              <p>No message set for this zone</p>
            </div>
          )}
        </div>
      )}

      {/* Expand hint */}
      <div className="expand-hint" onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? 'Show less ▲' : 'Show more ▼'}
      </div>
    </div>
  )
}
