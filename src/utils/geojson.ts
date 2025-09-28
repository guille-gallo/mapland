import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'
// polygon-clipping default export contains functions (union, difference)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pc from 'polygon-clipping'

const WEB_MERCATOR_MAX_LAT = 85.05112877980659
// Keep world ring minimal (rectangle) for stable triangulation
const WORLD_RING: Position[] = [
  [-180, -WEB_MERCATOR_MAX_LAT],
  [180, -WEB_MERCATOR_MAX_LAT],
  [180, WEB_MERCATOR_MAX_LAT],
  [-180, WEB_MERCATOR_MAX_LAT],
  [-180, -WEB_MERCATOR_MAX_LAT],
]

function cleanRing(ring: Position[]): Position[] {
  // Remove consecutive duplicates & collinear triples
  const cleaned: Position[] = []
  const eps = 1e-12
  const isCollinear = (a: Position, b: Position, c: Position): boolean => {
    const area = a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])
    return Math.abs(area) < eps
  }
  for (let i = 0; i < ring.length; i++) {
    const pt = ring[i]
    const prev = cleaned[cleaned.length - 1]
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) cleaned.push(pt)
    // Check collinearity after pushing
    while (cleaned.length >= 3) {
      const c = cleaned[cleaned.length - 1]
      const b = cleaned[cleaned.length - 2]
      const a = cleaned[cleaned.length - 3]
      if (isCollinear(a, b, c)) {
        cleaned.splice(cleaned.length - 2, 1) // remove middle point
      } else break
    }
  }
  return cleaned
}

function closeRing(ring: Position[]): Position[] {
  if (ring.length < 2) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring
  }
  return [...ring, [...first]]
}

function signedArea(ring: Position[]): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

function ensureOrientation(ring: Position[], clockwise: boolean): Position[] {
  const closed = closeRing(ring)
  const area = signedArea(closed)
  const isClockwise = area < 0 // Negative area => clockwise with this formula
  if (clockwise === isClockwise) {
    return closed
  }
  return [...closed].reverse()
}

function normalizePolygon(feature: Feature<Polygon | MultiPolygon>): Position[][][] {
  if (!feature.geometry) return []
  if (feature.geometry.type === 'Polygon') {
    const poly = feature.geometry as Polygon
    return [poly.coordinates.map(cleanRing).map((r, idx) => ensureOrientation(r, idx !== 0))]
  }
  if (feature.geometry.type === 'MultiPolygon') {
    const mp = feature.geometry as MultiPolygon
    return mp.coordinates.map((poly) => poly.map(cleanRing).map((r, idx) => ensureOrientation(r, idx !== 0)))
  }
  return []
}

function roundCoord(val: number): number {
  return Math.round(val * 1e6) / 1e6
}

function sanitizePositions(ring: Position[]): Position[] {
  return ring.map(([x, y]) => [roundCoord(x), roundCoord(y)])
}

function sanitizeMultiPolygon(mp: Position[][][]): Position[][][] {
  return mp.map((poly) => poly.map(sanitizePositions))
}

export function createExclusionFeatureCollection(allowed: FeatureCollection | null): FeatureCollection | null {
  if (!allowed || !allowed.features.length) return null

  // Collect & normalize polygons
  const polys: Position[][][][] = [] // array of MultiPolygon (each = array of polygons (rings[]))
  for (const f of allowed.features) {
    if (!f.geometry) continue
    if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
      const normalized = normalizePolygon(f as Feature<Polygon | MultiPolygon>)
      if (normalized.length) polys.push(sanitizeMultiPolygon(normalized))
    }
  }
  if (!polys.length) return null

  // Build union incrementally to reduce complexity
  // Flatten polys into array of MultiPolygon-like structures acceptable by polygon-clipping
  // Each element in polys is a MultiPolygon representation. We'll union sequentially.
  let unionGeom: any = polys[0]
  for (let i = 1; i < polys.length; i++) {
    // union expects variadic polygons; cast to any to bypass strict shape checks.
  unionGeom = (pc as any).union(unionGeom as any, polys[i] as any)
  }

  // polygon-clipping expects MultiPolygon arrays shaped as: MultiPolygon = Polygon[]; Polygon = Ring[]
  const worldMP: any = [[WORLD_RING]] // world as single polygon (no holes)

  let diff: any
  try {
  diff = (pc as any).difference(worldMP, unionGeom)
  } catch (e) {
    // If something goes wrong (self-intersection etc.), fallback to previous single inverse approach
    console.warn('Mask difference failed, falling back to single inverse polygon', e)
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { fallback: true },
          geometry: { type: 'Polygon', coordinates: [WORLD_RING, ...flattenToHoles(unionGeom)] },
        },
      ],
    }
  }

  if (!diff || !diff.length) return null

  // diff is MultiPolygon => array of polygons, each polygon = array of rings
  const features = diff.map((polygon: Position[][]) => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: polygon } as Polygon,
  }))

  return { type: 'FeatureCollection', features }
}

function flattenToHoles(unionGeom: any): Position[][] {
  // unionGeom may be MultiPolygon: Polygon[]; each Polygon[0] outer, rest holes
  const holes: Position[][] = []
  if (!Array.isArray(unionGeom)) return holes
  for (const poly of unionGeom) {
    if (Array.isArray(poly) && poly.length > 0) {
      for (let i = 0; i < poly.length; i++) {
        if (i === 0) continue // skip outer ring
        holes.push(ensureOrientation(poly[i], true))
      }
    }
  }
  return holes
}
