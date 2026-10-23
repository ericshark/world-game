import { OrbitControls, Stars, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type ComponentRef, type ReactNode } from 'react'
import { SRGBColorSpace } from 'three'
import type { LonLat } from '../geo/coords'
import { keyBelongsElsewhere } from '../ui/useGameKeys'
import { Atmosphere } from './Atmosphere'
import { CAMERA_FOV, MAX_CAMERA_DISTANCE, MIN_CAMERA_DISTANCE } from './constants'
import { lonLatToVector3, vector3ToLonLat } from './coords3d'
import { LatLonGrid } from './LatLonGrid'
import { isAutomated, prefersSmallTextures, textureUrl, type Surface } from './textures'
import { useGlobePicking } from './useGlobePicking'

/** OrbitControls rotate speed when fully zoomed out; it shrinks as the camera gets closer. */
const ROTATE_SPEED_ZOOMED_OUT = 0.6
/** Degrees an arrow key turns the globe when fully zoomed out. */
const KEY_STEP_DEG = 8
const KEY_ZOOM_FACTOR = 1.12

/** Moves the globe within the screen, in fractions of its size (x right, y up). */
export interface ViewShift {
  x: number
  y: number
}

const NO_SHIFT: ViewShift = { x: 0, y: 0 }

interface GlobeProps {
  onPick?: (point: LonLat) => void
  showGrid?: boolean
  /** Slowly spin the globe, e.g. behind the home screen. */
  autoRotate?: boolean
  surface?: Surface
  /** Arrow keys turn the globe and +/- zoom (off while typing). */
  keyboard?: boolean
  /** Receives a function that returns the point under the centre of the screen. */
  centerRef?: { current: (() => LonLat) | null }
  /** Slides the globe aside, e.g. away from a panel covering part of the screen. */
  shift?: ViewShift
  /** Atmosphere colour on the day globe. */
  glow?: string
  children?: ReactNode
}

export function Globe({
  onPick,
  showGrid = false,
  autoRotate = false,
  surface = 'day',
  keyboard = true,
  centerRef,
  shift = NO_SHIFT,
  glow,
  children,
}: GlobeProps) {
  return (
    <Canvas
      // Draw only when something changed or is animating, so an idle globe costs no battery.
      frameloop="demand"
      dpr={isAutomated() ? 1 : [1, 2]}
      camera={{ fov: CAMERA_FOV, near: 0.01, far: 1000, position: [0, 0, MAX_CAMERA_DISTANCE] }}
    >
      <color attach="background" args={['#02030a']} />
      <Stars radius={100} depth={60} count={5000} factor={4} saturation={0} fade speed={0} />
      <EarthSurfaces surface={surface} onPick={onPick} />
      <Atmosphere tint={surface === 'night' ? '#7f8dff' : glow} />
      {showGrid && <LatLonGrid />}
      <GlobeControls autoRotate={autoRotate} />
      {keyboard && <KeyboardOrbit />}
      {centerRef && <CenterProbe centerRef={centerRef} />}
      <CameraFit shift={shift} />
      {children}
    </Canvas>
  )
}

/** Shows the day Earth while the night texture loads the first time. */
function EarthSurfaces({ surface, onPick }: { surface: Surface; onPick?: (p: LonLat) => void }) {
  const maxTextureSize = useThree((state) => state.gl.capabilities.maxTextureSize)
  const small = useMemo(() => prefersSmallTextures(maxTextureSize), [maxTextureSize])
  const day = <Earth url={textureUrl('day', small)} onPick={onPick} />
  return (
    <Suspense fallback={surface === 'night' ? <Suspense fallback={null}>{day}</Suspense> : null}>
      {surface === 'night' ? <Earth url={textureUrl('night', small)} onPick={onPick} /> : day}
    </Suspense>
  )
}

function Earth({ url, onPick }: { url: string; onPick?: (point: LonLat) => void }) {
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())
  const texture = useTexture(url, (loaded) => {
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
  useFrame(({ camera, invalidate }) => {
    if (!controls.current) return
    const zoom = (camera.position.length() - 1) / (MAX_CAMERA_DISTANCE - 1)
    controls.current.rotateSpeed = ROTATE_SPEED_ZOOMED_OUT * zoom
    // Spinning never settles, so it keeps asking for the next frame.
    if (autoRotate) invalidate()
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

/** Arrow keys turn the globe and +/- zoom, so it can be played without a pointer. */
function KeyboardOrbit() {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Arrow keys still turn the globe while an on-screen button has focus.
      if (keyBelongsElsewhere(event, { buttonsToo: false })) return
      const radius = camera.position.length()
      const zoom = (radius - 1) / (MAX_CAMERA_DISTANCE - 1)
      const step = KEY_STEP_DEG * zoom
      const [lon, lat] = vector3ToLonLat(camera.position)
      let next: [number, number] = [lon, lat]
      let nextRadius = radius
      switch (event.key) {
        case 'ArrowLeft':
          next = [lon - step, lat]
          break
        case 'ArrowRight':
          next = [lon + step, lat]
          break
        case 'ArrowUp':
          next = [lon, Math.min(80, lat + step)]
          break
        case 'ArrowDown':
          next = [lon, Math.max(-80, lat - step)]
          break
        case '+':
        case '=':
          nextRadius = Math.max(MIN_CAMERA_DISTANCE, radius / KEY_ZOOM_FACTOR)
          break
        case '-':
        case '_':
          nextRadius = Math.min(MAX_CAMERA_DISTANCE, radius * KEY_ZOOM_FACTOR)
          break
        default:
          return
      }
      event.preventDefault()
      lonLatToVector3(next, nextRadius, camera.position)
      camera.lookAt(0, 0, 0)
      invalidate()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [camera, invalidate])

  return null
}

/** The camera always looks at the globe's centre, so the screen centre is the point below it. */
function CenterProbe({ centerRef }: { centerRef: { current: (() => LonLat) | null } }) {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    centerRef.current = () => vector3ToLonLat(camera.position)
    return () => {
      centerRef.current = null
    }
  }, [camera, centerRef])
  return null
}

/**
 * Fits the globe to the screen: on portrait screens the field of view widens so the whole Earth
 * still fits side to side, and a view shift slides the globe aside smoothly.
 */
function CameraFit({ shift }: { shift: ViewShift }) {
  const current = useRef({ ...shift })
  const invalidate = useThree((state) => state.invalidate)
  // A new shift needs a frame to start easing towards it.
  useEffect(() => invalidate(), [shift, invalidate])
  useFrame(({ camera, size }, delta) => {
    if (!('fov' in camera)) return
    const aspect = size.width / size.height
    const halfFov = (CAMERA_FOV * Math.PI) / 360
    const fov = aspect < 1 ? (360 / Math.PI) * Math.atan(Math.tan(halfFov) / aspect) : CAMERA_FOV

    const follow = 1 - Math.exp(-delta * 6)
    current.current.x += (shift.x - current.current.x) * follow
    current.current.y += (shift.y - current.current.y) * follow
    const { x, y } = current.current

    if (Math.abs(x) < 1e-3 && Math.abs(y) < 1e-3) {
      if (camera.view?.enabled) camera.clearViewOffset()
    } else {
      camera.setViewOffset(
        size.width,
        size.height,
        -x * size.width,
        y * size.height,
        size.width,
        size.height,
      )
    }
    if (camera.fov !== fov) camera.fov = fov
    camera.updateProjectionMatrix()
    // Keep drawing until the globe has glided into place.
    if (Math.abs(shift.x - x) > 5e-4 || Math.abs(shift.y - y) > 5e-4) invalidate()
  })
  return null
}
