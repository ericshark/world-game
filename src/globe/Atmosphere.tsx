import { AdditiveBlending, BackSide, Color } from 'three'

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`

// Outer halo, drawn on the inside of a larger shell: brightest where the view ray grazes the
// planet's limb (back-face normal most opposed to the view) and fading to nothing at the edge.
const haloFragmentShader = /* glsl */ `
  uniform vec3 color;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float facing = clamp(-dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
    float intensity = pow(smoothstep(0.0, 0.33, facing), 4.0) * 0.55;
    gl_FragColor = vec4(color * intensity, 1.0);
  }
`

// Thin haze over the planet's own surface, strongest towards the limb.
const hazeFragmentShader = /* glsl */ `
  uniform vec3 color;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float facing = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
    float intensity = pow(1.0 - facing, 3.0) * 0.8;
    gl_FragColor = vec4(color * intensity, 1.0);
  }
`

const HALO_RADIUS = 1.06
const HAZE_RADIUS = 1.003
const ATMOSPHERE_COLOR = new Color('#5aa9ff')

export function Atmosphere() {
  return (
    <>
      <mesh scale={HALO_RADIUS}>
        <sphereGeometry args={[1, 96, 48]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={haloFragmentShader}
          uniforms={{ color: { value: ATMOSPHERE_COLOR } }}
          side={BackSide}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh scale={HAZE_RADIUS}>
        <sphereGeometry args={[1, 96, 48]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={hazeFragmentShader}
          uniforms={{ color: { value: ATMOSPHERE_COLOR } }}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  )
}
