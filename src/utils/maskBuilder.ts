import type { FeatureCollection } from 'geojson'
import { createExclusionFeatureCollection } from './geojson'

// Simple hash of coordinates for change detection
export function featureCollectionHash(fc: FeatureCollection | null): string {
  if (!fc) return 'null'
  let hash = 0
  for (const f of fc.features) {
    const g: any = f.geometry
    if (!g) continue
    const coords = JSON.stringify(g.coordinates)
    for (let i = 0; i < coords.length; i++) {
      hash = (hash * 31 + coords.charCodeAt(i)) >>> 0
    }
  }
  return hash.toString(16)
}

export interface MaskBuildResult {
  exclusion: FeatureCollection | null
  durationMs: number
  changed: boolean
}

export function buildMaskWithTiming(fc: FeatureCollection | null, prevHash: string | null): MaskBuildResult {
  const start = performance.now()
  const exclusion = createExclusionFeatureCollection(fc)
  const end = performance.now()
  const nextHash = featureCollectionHash(fc)
  return {
    exclusion,
    durationMs: +(end - start).toFixed(2),
    changed: nextHash !== prevHash,
  }
}
