import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import { lonLatToVector3 } from './coords3d'

const GRID_STEP_DEG = 30
const SAMPLE_STEP_DEG = 2
const GRID_RADIUS = 1.001

export function LatLonGrid() {
  const geometry = useMemo(() => {
    const positions: number[] = []
    const a = new Vector3()
    const b = new Vector3()
    const addSegment = (from: [number, number], to: [number, number]) => {
      lonLatToVector3(from, GRID_RADIUS, a)
      lonLatToVector3(to, GRID_RADIUS, b)
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }

    for (let lon = -180; lon < 180; lon += GRID_STEP_DEG) {
      for (let lat = -90; lat < 90; lat += SAMPLE_STEP_DEG) {
        addSegment([lon, lat], [lon, lat + SAMPLE_STEP_DEG])
      }
    }
    for (let lat = -90 + GRID_STEP_DEG; lat < 90; lat += GRID_STEP_DEG) {
      for (let lon = -180; lon < 180; lon += SAMPLE_STEP_DEG) {
        addSegment([lon, lat], [lon + SAMPLE_STEP_DEG, lat])
      }
    }

    return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3))
  }, [])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.18} depthWrite={false} />
    </lineSegments>
  )
}
