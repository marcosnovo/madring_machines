/**
 * The circuit, generated at runtime — asphalt, kerbs, run-off, tunnels, the
 * start/finish line and its gantry. Replaces the baked desert `.glb` the
 * upstream project shipped.
 */
import { useLayoutEffect, useMemo } from 'react'
import { CanvasTexture, DoubleSide, NearestFilter, RepeatWrapping, Vector3 } from 'three'

import {
  apronGeometry,
  asphaltGeometry,
  bandGeometry,
  kerbGeometry,
  tunnelGeometry,
} from '../../circuit/geometry'
import { getLayout, pointAt } from '../../circuit/layout'
import { levelLayer, useStore } from '../../store'

const ASPHALT = '#33363c'
const RUNOFF = '#4f6b34'
const CONCRETE = '#9aa0a6'

/** Black/white checker, drawn once into a canvas — nothing is fetched. */
function useCheckerTexture(): CanvasTexture {
  return useMemo(() => {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#141414'
    ctx.fillRect(0, 0, size / 2, size / 2)
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2)
    const texture = new CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.repeat.set(22, 2)
    texture.magFilter = texture.minFilter = NearestFilter
    return texture
  }, [])
}

function StartGantry(): JSX.Element {
  const layout = getLayout()
  const { post, beam } = useMemo(() => {
    const s = layout.samples[layout.startIndex]
    const yaw = Math.atan2(-s.t.x, -s.t.z)
    const span = s.halfWidth + 2.5
    const left = pointAt(s, -span, 0, new Vector3())
    const right = pointAt(s, span, 0, new Vector3())
    const mid = pointAt(s, 0, 0, new Vector3())
    return {
      post: [left, right].map((p) => ({ position: [p.x, p.y + 4, p.z] as const, rotation: [0, yaw, 0] as const })),
      beam: { position: [mid.x, mid.y + 8.4, mid.z] as const, rotation: [0, yaw, 0] as const, width: span * 2 + 1 },
    }
  }, [layout])

  return (
    <group>
      {post.map((p, i) => (
        <mesh key={i} position={p.position as unknown as [number, number, number]} rotation={p.rotation as unknown as [number, number, number]} castShadow>
          <boxGeometry args={[0.8, 8, 0.8]} />
          <meshStandardMaterial color={CONCRETE} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={beam.position as unknown as [number, number, number]} rotation={beam.rotation as unknown as [number, number, number]} castShadow>
        <boxGeometry args={[beam.width, 1.4, 0.7]} />
        <meshStandardMaterial color="#c8102e" roughness={0.6} />
      </mesh>
    </group>
  )
}

export function Circuit(): JSX.Element {
  const level = useStore((state) => state.level)
  const layout = getLayout()
  const checker = useCheckerTexture()

  const geometries = useMemo(
    () => ({
      asphalt: asphaltGeometry(layout),
      kerbLeft: kerbGeometry(layout, -1),
      kerbRight: kerbGeometry(layout, 1),
      apronLeft: apronGeometry(layout, -1),
      apronRight: apronGeometry(layout, 1),
      startLine: bandGeometry(layout, layout.startIndex, 1.6),
      tunnels: layout.tunnels.map((section) => tunnelGeometry(layout, section)),
    }),
    [layout],
  )

  // The minimap renders only objects on `levelLayer`.
  useLayoutEffect(() => void level.current?.traverse((child) => child.layers.enable(levelLayer)), [])

  return (
    <group dispose={null}>
      <group ref={level}>
        <mesh geometry={geometries.apronLeft} receiveShadow>
          <meshStandardMaterial color={RUNOFF} roughness={1} />
        </mesh>
        <mesh geometry={geometries.apronRight} receiveShadow>
          <meshStandardMaterial color={RUNOFF} roughness={1} />
        </mesh>
        <mesh geometry={geometries.asphalt} receiveShadow>
          <meshStandardMaterial color={ASPHALT} roughness={0.92} metalness={0} />
        </mesh>
        <mesh geometry={geometries.kerbLeft} receiveShadow castShadow>
          <meshStandardMaterial vertexColors roughness={0.55} />
        </mesh>
        <mesh geometry={geometries.kerbRight} receiveShadow castShadow>
          <meshStandardMaterial vertexColors roughness={0.55} />
        </mesh>
        <mesh geometry={geometries.startLine}>
          <meshStandardMaterial map={checker} roughness={0.7} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      </group>
      {geometries.tunnels.map((geometry, i) => (
        <mesh key={i} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color={CONCRETE} roughness={0.9} side={DoubleSide} />
        </mesh>
      ))}
      <StartGantry />
    </group>
  )
}
