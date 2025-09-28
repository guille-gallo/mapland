const fc = { type: 'FeatureCollection', features: [ { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[2.1307445004966894, 41.32323708040718],[2.1475641746392284, 41.3525684844455],[2.1667872724434005, 41.36232471969146],[2.179744566907459, 41.37974120083419],[2.1926449777269283, 41.386573059480554],[2.222286114009364, 41.411569038770125],[2.2180387435725777, 41.42312244772094],[2.2062437466533993, 41.43964870716289],[2.1989833194216715, 41.44643270690179],[2.1889615402737945, 41.44616780959015],[2.176243579390814, 41.442733324939525],[2.15124638788663, 41.43659525375509],[2.141640714469446, 41.419707001797775],[2.138645395066021, 41.41498465955769],[2.1347525358199277, 41.413861961351756],[2.120004077797148, 41.40460845521855],[2.1047122121409245, 41.38412145245863],[2.0902404659010188, 41.36191411654991],[2.102612589651983, 41.341698175257164],[2.1307445004966894, 41.32323708040718]]]} } ] }
const WORLD_RING = [[-180,-90],[-180,90],[180,90],[180,-90],[-180,-90]]

const closeRing = (ring) => {
  if (ring.length < 2) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring
  }
  return [...ring, [...first]]
}

const signedArea = (ring) => {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

const ensureOrientation = (ring, clockwise) => {
  const closed = closeRing(ring)
  const area = signedArea(closed)
  const isClockwise = area < 0
  if (clockwise === isClockwise) {
    return closed
  }
  return [...closed].reverse()
}

const extractOuterRings = (feature) => {
  if (!feature.geometry) return []
  if (feature.geometry.type === 'Polygon') {
    const polygon = feature.geometry
    if (!polygon.coordinates.length) return []
    return [polygon.coordinates[0]]
  }
  if (feature.geometry.type === 'MultiPolygon') {
    const multi = feature.geometry
    const rings = []
    multi.coordinates.forEach((coords) => {
      if (coords.length) {
        rings.push(coords[0])
      }
    })
    return rings
  }
  return []
}

const createExclusion = (allowed) => {
  if (!allowed || !allowed.features.length) return null

  const holes = []

  allowed.features.forEach((feature) => {
    extractOuterRings(feature).forEach((ring) => {
      const hole = ensureOrientation(ring, true)
      holes.push(hole)
    })
  })

  if (!holes.length) return null

  const worldRing = ensureOrientation(WORLD_RING, false)

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [worldRing, ...holes],
        },
      },
    ],
  }
}

const exclusion = createExclusion(fc)
console.log(JSON.stringify(exclusion, null, 2))
