// Border-to-border distances between countries, used by Mystery Country and World Journey.
//
// Comparing every vertex of one country with every vertex of another is too slow for ~200 x 200
// pairs, so each country's outline is cut into short runs of vertices with a bounding cap
// (centre + angular radius). Pairs of runs whose caps are already further apart than the best
// distance found so far are skipped (branch and bound). Vertex-to-vertex distance is accurate to
// a few km on the simplified outlines, which is plenty for game feedback.

const EARTH_RADIUS_KM = 6371
const RUN_LENGTH = 24
const DEG = Math.PI / 180

/**
 * Returns the minimum great-circle distance in km between every pair of the given features,
 * as the upper triangle of the matrix in row-major order (i < j).
 * Pairs listed in `touching` (a set of "A|B" keys) are 0.
 */
export function borderDistanceMatrix(features, touching) {
  const shapes = features.map((feature) => toRuns(feature.geometry))
  const ids = features.map((feature) => feature.properties.id)
  const km = []
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const touches = touching.has(`${ids[i]}|${ids[j]}`)
      km.push(touches ? 0 : Math.round(minAngle(shapes[i], shapes[j]) * EARTH_RADIUS_KM))
    }
  }
  return km
}

function minAngle(a, b) {
  const pairs = []
  for (const runA of a) {
    for (const runB of b) pairs.push({ runA, runB, bound: capGap(runA.cap, runB.cap) })
  }
  pairs.sort((x, y) => x.bound - y.bound)

  let best = Infinity
  for (const { runA, runB, bound } of pairs) {
    if (bound >= best) break
    best = Math.min(best, closestVertices(runA.points, runB.points))
  }
  return best
}

function closestVertices(a, b) {
  let maxDot = -1
  for (let i = 0; i < a.length; i += 3) {
    for (let j = 0; j < b.length; j += 3) {
      const dot = a[i] * b[j] + a[i + 1] * b[j + 1] + a[i + 2] * b[j + 2]
      if (dot > maxDot) maxDot = dot
    }
  }
  return Math.acos(Math.min(1, maxDot))
}

/** Smallest possible angle between any point of two caps (0 when they overlap). */
function capGap(capA, capB) {
  const between = Math.acos(Math.min(1, Math.max(-1, dot(capA.center, capB.center))))
  return Math.max(0, between - capA.radius - capB.radius)
}

function toRuns(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const runs = []
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const vectors = ring.map(toUnit)
      // Overlap runs by one vertex so the edge between them is not lost.
      for (let start = 0; start < vectors.length - 1; start += RUN_LENGTH) {
        const slice = vectors.slice(start, start + RUN_LENGTH + 1)
        runs.push({ points: new Float64Array(slice.flat()), cap: boundingCap(slice) })
      }
    }
  }
  return runs
}

function boundingCap(vectors) {
  const sum = [0, 0, 0]
  for (const v of vectors) {
    sum[0] += v[0]
    sum[1] += v[1]
    sum[2] += v[2]
  }
  const length = Math.hypot(...sum) || 1
  const center = [sum[0] / length, sum[1] / length, sum[2] / length]
  let radius = 0
  for (const v of vectors) {
    radius = Math.max(radius, Math.acos(Math.min(1, Math.max(-1, dot(center, v)))))
  }
  return { center, radius }
}

function toUnit([lon, lat]) {
  const cosLat = Math.cos(lat * DEG)
  return [cosLat * Math.cos(lon * DEG), cosLat * Math.sin(lon * DEG), Math.sin(lat * DEG)]
}

function dot(u, v) {
  return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}
