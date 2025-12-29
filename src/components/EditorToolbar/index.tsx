import { useState } from 'react'
import { ZONE_CONFIGS, type ZoneType } from '../../types/zone'
import './EditorToolbar.css'

interface EditorToolbarProps {
  activeZoneType: ZoneType | ''
  onZoneTypeChange: (zoneType: ZoneType | '', mode: 'default' | 'draw-polygon') => void
  onSave: () => void
  onExport: () => void
  onClear: () => void
  onPublish?: () => void
  isPublishing?: boolean
  isSupabaseConfigured?: boolean
}

export default function EditorToolbar({
  activeZoneType,
  onZoneTypeChange,
  onSave,
  onExport,
  onClear,
  onPublish,
  isPublishing = false,
  isSupabaseConfigured = false,
}: EditorToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="editor-controls">
        <div className="zone-menu">
          <button
            className="zone-menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {activeZoneType ? ZONE_CONFIGS[activeZoneType].label : 'Draw zone'} ▾
          </button>
          <div className={`zone-menu-dropdown ${menuOpen ? 'open' : ''}`}>
            <button
              className="zone-menu-item"
              onClick={() => {
                onZoneTypeChange('danger', 'draw-polygon')
                setMenuOpen(false)
              }}
            >
              🔴 {ZONE_CONFIGS.danger.label}
            </button>
            <button
              className="zone-menu-item"
              onClick={() => {
                onZoneTypeChange('suggested', 'draw-polygon')
                setMenuOpen(false)
              }}
            >
              🟢 {ZONE_CONFIGS.suggested.label}
            </button>
            <button
              className="zone-menu-item"
              onClick={() => {
                onZoneTypeChange('', 'default')
                setMenuOpen(false)
              }}
            >
              ✋ Stop Drawing
            </button>
          </div>
        </div>
        
        <button className="action-button" onClick={onSave}>💾 Save</button>
        <button className="action-button" onClick={onExport}>📤 Export</button>
        {isSupabaseConfigured && onPublish && (
          <button 
            className="action-button publish-button" 
            onClick={onPublish}
            disabled={isPublishing}
          >
            {isPublishing ? '⏳ Publishing...' : '☁️ Publish'}
          </button>
        )}
        <button className="action-button" onClick={onClear}>🗑️ Clear</button>
      </div>
  )
}
