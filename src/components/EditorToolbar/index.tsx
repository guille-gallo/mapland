import { useState } from 'react'
import { ZONE_CONFIGS, type ZoneType } from '../../types/zone'
import './EditorToolbar.css'

interface EditorToolbarProps {
  activeZoneType: ZoneType | ''
  onZoneTypeChange: (zoneType: ZoneType | '', mode: 'default' | 'draw-polygon') => void
  onSave: () => void
  onExport: () => void
  onClear: () => void
}

export default function EditorToolbar({
  activeZoneType,
  onZoneTypeChange,
  onSave,
  onExport,
  onClear,
}: EditorToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
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
        <button className="action-button" onClick={onClear}>🗑️ Clear</button>
      </div>
  )
}
