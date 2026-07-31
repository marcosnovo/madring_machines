/**
 * Ambient motion: the things that make the circuit look inhabited.
 *
 *   - the start gantry's light board (`thermalito_start_lights`) glows red
 *     during the five-light sequence and green for a moment at lights-out —
 *     the model has the board, the race session has the cadence;
 *   - the LED advertising boards (`start_ads`, `led_flag2`, `tv_test_pattern`)
 *     scroll their existing textures — one uv offset per frame, no new
 *     geometry;
 *   - waving flags along the walls near the grandstands: one InstancedMesh,
 *     waved in the vertex shader (per-instance phase, pinned at the pole), a
 *     second InstancedMesh for the poles — 2 draw calls;
 *   - two flocks of birds circling above the circuit: one InstancedMesh of a
 *     dozen quads whose matrices orbit per frame — 1 draw call.
 *
 * Total: 3 extra draw calls, ~600 triangles, and per-frame CPU work of a few
 * dozen matrix writes.
 */
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, InstancedBufferAttribute, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry } from 'three'
import type { InstancedMesh, Mesh, MeshStandardMaterial, Object3D as Object3DType, Shader, Texture } from 'three'
import { useGLTF } from '@react-three/drei'

import { asset } from '../../assets'
import { DRACO_PATH } from '../../draco'
import { getRace } from '../../race/RaceSession'
import { getTrackFrame, surfaceY } from '../../circuit/trackFrame'
import { CIRCUIT_MODEL } from './Circuit'

/** Materials whose textures scroll like LED boards. */
const LED = /^(start_ads|led_flag2|tv_test_pattern)/
const GANTRY_LIGHTS = /^thermalito_start_lights/

/** Flag spacing along the lap, in samples (~130 m), and colours. */
const FLAG_EVERY = 24
const FLAG_COLORS = ['#c0392b', '#f5b70f', '#2980b9', '#e8e6e1', '#27ae60']
const FLAG_W = 2.3
const FLAG_H = 1.45
const POLE_H = 7

const BIRDS = 12

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface FlagSpots {
  count: number
  matrices: Float32Array
  poleMatrices: Float32Array
  colors: Float32Array
  phases: Float32Array
}

function buildFlags(): FlagSpots {
  const track = getTrackFrame()
  const random = mulberry32(0x51a9e77)
  const dummy = new Object3D()
  const matrix = new Matrix4()
  const color = new Color()
  const matrices: number[] = []
  const poleMatrices: number[] = []
  const colors: number[] = []
  const phases: number[] = []
  for (let i = 0; i < track.N; i += FLAG_EVERY) {
    const s = track.samples[i]
    // Alternate sides; stand just outside the wall face.
    const side = (i / FLAG_EVERY) % 2 === 0 ? 1 : -1
    const wall = side > 0 ? s.wallPos : s.wallNeg
    const lat = side * (wall + 1.6)
    const x = s.x + s.nx * lat
    const z = s.z + s.nz * lat
    const y = surfaceY(track, x, z, i)
    dummy.position.set(x, y + POLE_H - FLAG_H / 2, z)
    // face the track
    dummy.rotation.set(0, Math.atan2(s.x - x, s.z - z), 0)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    matrix.copy(dummy.matrix)
    matrices.push(...matrix.elements)
    dummy.position.set(x, y + POLE_H / 2, z)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    poleMatrices.push(...dummy.matrix.elements)
    color.set(FLAG_COLORS[(random() * FLAG_COLORS.length) | 0])
    colors.push(color.r, color.g, color.b)
    phases.push(random())
  }
  return {
    count: phases.length,
    matrices: new Float32Array(matrices),
    poleMatrices: new Float32Array(poleMatrices),
    colors: new Float32Array(colors),
    phases: new Float32Array(phases),
  }
}

/** A Lambert material that waves in the vertex shader, pinned at u = 0. */
function flagMaterial(uniforms: { uTime: { value: number } }): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ color: '#ffffff', side: DoubleSide, toneMapped: false })
  material.onBeforeCompile = (shader: Shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nuniform float uTime;\nattribute float aPhase;`).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
         float wavePhase = uTime * 5.2 + aPhase * 6.2831 + uv.x * 5.5;
         transformed.z += sin(wavePhase) * 0.28 * uv.x;
         transformed.y += cos(wavePhase * 0.7) * 0.08 * uv.x;`,
    )
  }
  return material
}

export function Ambient(): JSX.Element {
  const { scene } = useGLTF(asset(CIRCUIT_MODEL), DRACO_PATH)
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  // --- LED boards + gantry lights, discovered once ------------------------
  const found = useMemo(() => {
    const ledMaps: Texture[] = []
    const gantry: MeshStandardMaterial[] = []
    const seen = new Set<unknown>()
    scene.traverse((child: Object3DType) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial
      if (!material || seen.has(material)) return
      seen.add(material)
      if (LED.test(material.name) && material.map) ledMaps.push(material.map)
      if (GANTRY_LIGHTS.test(material.name)) {
        material.emissive = new Color('#200404')
        material.toneMapped = false
        gantry.push(material)
      }
    })
    return { ledMaps, gantry }
  }, [scene])

  // --- flags + poles + birds ----------------------------------------------
  const flags = useMemo(buildFlags, [])
  const flagGeometry = useMemo(() => {
    const g = new PlaneGeometry(FLAG_W, FLAG_H, 6, 3)
    g.translate(FLAG_W / 2, 0, 0) // u = 0 at the pole edge
    return g
  }, [])
  const flagMat = useMemo(() => flagMaterial(uniforms), [uniforms])
  const poleGeometry = useMemo(() => new PlaneGeometry(0.09, POLE_H, 1, 1), [])
  const poleMat = useMemo(() => new MeshBasicMaterial({ color: '#8b9199', side: DoubleSide }), [])
  const flagMesh = useRef<InstancedMesh>(null)
  const poleMesh = useRef<InstancedMesh>(null)

  const birdMesh = useRef<InstancedMesh>(null)
  const birdGeometry = useMemo(() => new PlaneGeometry(1.1, 0.35), [])
  const birdMat = useMemo(() => new MeshBasicMaterial({ color: '#2b2f36', side: DoubleSide }), [])
  const birdDummy = useMemo(() => new Object3D(), [])
  const flocks = useMemo(() => {
    const track = getTrackFrame()
    const a = track.samples[Math.floor(track.N * 0.1)]
    const b = track.samples[Math.floor(track.N * 0.62)]
    return [
      { x: a.x, y: a.y + 34, z: a.z, r: 42, speed: 0.21 },
      { x: b.x, y: b.y + 28, z: b.z, r: 30, speed: -0.27 },
    ]
  }, [])

  useLayoutEffect(() => {
    const flag = flagMesh.current
    const pole = poleMesh.current
    if (!flag || !pole) return
    flag.instanceMatrix = new InstancedBufferAttribute(flags.matrices, 16)
    flag.instanceMatrix.needsUpdate = true
    flag.instanceColor = new InstancedBufferAttribute(flags.colors, 3)
    flag.instanceColor.needsUpdate = true
    flag.geometry.setAttribute('aPhase', new InstancedBufferAttribute(flags.phases, 1))
    pole.instanceMatrix = new InstancedBufferAttribute(flags.poleMatrices, 16)
    pole.instanceMatrix.needsUpdate = true
    flag.frustumCulled = false
    pole.frustumCulled = false
    if (birdMesh.current) birdMesh.current.frustumCulled = false
  }, [flags])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    uniforms.uTime.value = t

    for (const map of found.ledMaps) map.offset.x = (t * 0.12) % 1

    // Start-light board: red while lights are lit, green flash at lights-out.
    const race = getRace()
    for (const material of found.gantry) {
      if (race.phase === 'lights' && race.lightsOn > 0) {
        material.emissive.setRGB(0.9, 0.05, 0.02)
        material.emissiveIntensity = 0.6 + race.lightsOn * 0.35
      } else if (race.phase === 'racing' && race.phaseT < 1.6) {
        material.emissive.setRGB(0.05, 0.9, 0.12)
        material.emissiveIntensity = 2.2
      } else {
        material.emissiveIntensity = 0
      }
    }

    // Birds: orbit, bank into the circle, flap by scaling.
    const birds = birdMesh.current
    if (birds) {
      let i = 0
      for (const flock of flocks) {
        for (let k = 0; k < BIRDS / flocks.length; k++) {
          const phase = t * flock.speed + (k * Math.PI * 2) / (BIRDS / flocks.length)
          const r = flock.r + k * 2.1
          birdDummy.position.set(flock.x + Math.cos(phase) * r, flock.y + Math.sin(t * 0.9 + k) * 2.2, flock.z + Math.sin(phase) * r)
          birdDummy.rotation.set(0, -phase, Math.sign(flock.speed) * 0.35)
          birdDummy.scale.set(1, 0.6 + 0.4 * Math.abs(Math.sin(t * 7 + k * 1.7)), 1)
          birdDummy.updateMatrix()
          birds.setMatrixAt(i++, birdDummy.matrix)
        }
      }
      birds.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <instancedMesh ref={flagMesh} args={[flagGeometry, flagMat, flags.count]} />
      <instancedMesh ref={poleMesh} args={[poleGeometry, poleMat, flags.count]} />
      <instancedMesh ref={birdMesh} args={[birdGeometry, birdMat, BIRDS]} />
    </group>
  )
}
