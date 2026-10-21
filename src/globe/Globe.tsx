import { OrbitControls, Stars, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useRef, type ComponentRef, type ReactNode } from 'react'
import { SRGBColorSpace } from 'three'
import type { LonLat } from '../geo/coords'
import { Atmosphere } from './Atmosphere'
import { CAMERA_FOV, MAX_CAMERA_DISTANCE, MIN_CAMERA_DISTANCE } from './constants'
import { LatLonGrid } from './LatLonGrid'
import { useGlobePicking } from './useGlobePicking'

const EARTH_TEXTURE_URL = `${import.meta.env.BASE_URL}textures/earth.jpg`
/** OrbitControls rotate speed when fully zoomed out; it shrinks as the camera gets closer. */
const ROTATE_SPEED_ZOOMED_OUT = 0.6

interface GlobeProps {
  onPick?: (point: LonLat) => void
  showGrid?: boolean
  /** Slowly spin the globe, e.g. behind the start screen. */
  autoRotate?: boolean
  children?: ReactNode
}

export function Globe({ onPick, showGrid = false, autoRotate = false, children }: GlobeProps) {
  return (
    <Canvas
      camera={{ fov: CAMERA_FOV, near: 0.01, far: 1000, position: [0, 0, MAX_CAMERA_DISTANCE] }}
    >
      <color attach="background" args={['#02030a']} />
      <Stars radius={100} depth={60} count={5000} factor={4} saturation={0} fade speed={0} />
      <Suspense fallback={null}>
        <Earth onPick={onPick} />
      </Suspense>
      <Atmosphere />
      {showGrid && <LatLonGrid />}
      <GlobeControls autoRotate={autoRotate} />
      {children}
    </Canvas>
  )
}

function Earth({ onPick }: { onPick?: (point: LonLat) => void }) {
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())
  const texture = useTexture(EARTH_TEXTURE_URL, (loaded) => {
    for (const t of Array.isArray(loaded) ? loaded : [loaded]) {
      t.colorSpace = SRGBColorSpace
      // Keeps the surface sharp near the limb, where the texture is viewed at a steep angle.
      t.anisotropy = maxAnisotropy
    }
  })
  const handleClick = useGlobePicking(onPick)

  return (
    <mesh onClick={handleClick}>
      <sphereGeometry args={[1, 128, 64]} />
      {/* Unlit so the whole globe is evenly bright, with no night side. */}
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

function GlobeControls({ autoRotate }: { autoRotate: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)

  // Keep a drag moving the surface at roughly the same on-screen speed at every zoom level.
  useFrame(({ camera }) => {
    if (!controls.current) return
    const zoom = (camera.position.length() - 1) / (MAX_CAMERA_DISTANCE - 1)
    controls.current.rotateSpeed = ROTATE_SPEED_ZOOMED_OUT * zoom
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={MIN_CAMERA_DISTANCE}
      maxDistance={MAX_CAMERA_DISTANCE}
      enableDamping
      dampingFactor={0.08}
      zoomSpeed={0.6}
      autoRotate={autoRotate}
      autoRotateSpeed={0.35}
    />
  )
}
