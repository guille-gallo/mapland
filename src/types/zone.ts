export type ZoneType = 'danger' | 'suggested'

export interface ZoneConfig {
  type: ZoneType
  label: string
  color: string
  fillColor: string
  fillOpacity: number
}

export const ZONE_CONFIGS: Record<ZoneType, ZoneConfig> = {
  danger: {
    type: 'danger',
    label: 'Danger Zone',
    color: 'transparent',
    fillColor: 'rgba(255, 0, 0, 0.5)',
    fillOpacity: 0.5,
  },
  suggested: {
    type: 'suggested',
    label: 'Suggested Zone',
    color: 'transparent',
    fillColor: 'rgba(4, 170, 4, 0.5)',
    fillOpacity: 0.5,
  },
}

export interface ZoneFeatureProperties {
  zoneType?: ZoneType
}
