/**
 * The crowd.
 *
 * The circuit model has grandstands — seats, treads, railings, distance boards
 * — and nobody in them, because the asset has no crowd. Nothing the renderer
 * can do fixes that; the people have to be added. They are added here, and they
 * are *placed off the model's own geometry* rather than typed in: the four
 * grandstand materials (`gstand`, `gstand2` and their alpha-tested railing
 * counterparts) are pulled out of the loaded glTF, their upward-facing
 * triangles are found in world space, and spectators are scattered over them
 * by area.
 *
 * Three filters turn "every horizontal surface in a grandstand" into "seating":
 *
 *   * only the solid `gstand`/`gstand2` materials — the `-alpha` ones are
 *     single-sided cut-out cards for railings and have 0.2% of their area
 *     horizontal, so there is nothing to stand on;
 *   * a triangle-area cap. Seat treads are narrow strips: 81% of the
 *     upward-facing grandstand area is in triangles under 10 m², and what is
 *     above that is the roof slabs and the concourse floors, which are a
 *     handful of triangles of up to 490 m² each;
 *   * a headroom test. A sample is dropped if another upward-facing grandstand
 *     surface sits between 0.4 m and 2.2 m directly above it, which removes
 *     everything tucked under a tread or a deck. Of the plan cells covered by
 *     the stands, 2,212 have one surface in them and 4,119 have two or more —
 *     the second one is the roof, and the people belong under it.
 *
 * Cost. Two `InstancedMesh`es — bodies and heads — of two triangles each, so
 * the whole crowd is 2 draw calls and 4 triangles per spectator against the
 * 1.27 M the circuit already submits at its worst. They do not cast or receive
 * shadows. They are not billboarded per frame either: they are turned once,
 * at build time, to face the nearest point of the measured racing line, which
 * is where the player always is, so it costs nothing and never spins.
 *
 * The idle motion is a vertex-shader sway with a per-instance phase, so it is
 * free on the CPU.
 */
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, Matrix4, MeshLambertMaterial, Object3D, Vector3 } from 'three'

import type { InstancedMesh, Mesh, Object3D as Object3DType, Shader } from 'three'

import { asset } from '../../assets'
import { getLayout, nearestIndex } from '../../circuit/layout'
import { DRACO_PATH } from '../../draco'
import { CIRCUIT_MODEL } from './Circuit'
import { useGLTF } from '@react-three/drei'

/** Materials that are actual grandstand structure, not cut-out railings. */
const SEATING = /^gstand2?\./
/** Above this, a horizontal grandstand triangle is a roof or a floor slab, m². */
const AREA_MAX = 10
/** A surface is not sittable if something is this close above it, metres. */
const HEADROOM_MIN = 0.4
const HEADROOM_MAX = 2.2
/** Plan-grid cell used for the headroom test, metres. */
const CELL = 1.5
/** Spectators per square metre of seating. */
const DENSITY = 0.22
/** Hard ceiling on instances. */
const MAX_SPECTATORS = 7000
/** Body size, metres. */
const BODY_W = 0.52
const BODY_H = 0.95
const HEAD_R = 0.19

const SHIRTS = ['#d94f3d', '#2f6fb8', '#f0c53a', '#e8e6e1', '#3c9a5f', '#8e4bb0', '#2b3244', '#e07b39', '#c8d3dd', '#a5182c']
const SKIN = ['#f0c9a4', '#dda87c', '#b57a4d', '#8a5a34', '#5c3a20']

interface CrowdData {
  count: number
  matrices: Float32Array
  shirts: Float32Array
  skins: Float32Array
  phases: Float32Array
  /** Seating area found, m². Reported for the record, not used. */
  area: number
  surfaces: number
}

/** Deterministic, so the crowd is the same crowd every time the page loads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function quad(width: number, height: number, yOffset: number): BufferGeometry {
  const g = new BufferGeometry()
  const w = width / 2
  g.setAttribute(
    'position',
    new Float32BufferAttribute([-w, yOffset, 0, w, yOffset, 0, w, yOffset + height, 0, -w, yOffset, 0, w, yOffset + height, 0, -w, yOffset + height, 0], 3),
  )
  g.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  // v = 0 at the feet, 1 at the top: the sway shader only moves the top.
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2))
  return g
}

/** Adds a per-instance idle sway to a material, entirely on the GPU. */
function swayMaterial(color: string, uniforms: { uTime: { value: number } }, amount: number): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ color, side: DoubleSide, toneMapped: false })
  material.onBeforeCompile = (shader: Shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nuniform float uTime;\nattribute float aPhase;`).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
         float lean = sin(uTime * 1.7 + aPhase * 6.2831) * ${amount.toFixed(3)};
         float bob = sin(uTime * 2.3 + aPhase * 12.566) * ${(amount * 0.5).toFixed(3)};
         transformed.x += lean * uv.y;
         transformed.y += bob * uv.y;`,
    )
  }
  return material
}

function buildCrowd(scene: Object3DType): CrowdData {
  const layout = getLayout()
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const ab = new Vector3()
  const ac = new Vector3()
  const n = new Vector3()

  // --- collect the upward-facing seating triangles, in world space ---------
  type Tri = { a: Vector3; b: Vector3; c: Vector3; area: number }
  const tris: Tri[] = []
  let area = 0
  scene.updateWorldMatrix(true, true)
  scene.traverse((child: Object3DType) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!SEATING.test(material?.name ?? '')) return
    const position = mesh.geometry.getAttribute('position')
    const index = mesh.geometry.getIndex()
    if (!position || !index) return
    const m = mesh.matrixWorld
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i)).applyMatrix4(m)
      b.fromBufferAttribute(position, index.getX(i + 1)).applyMatrix4(m)
      c.fromBufferAttribute(position, index.getX(i + 2)).applyMatrix4(m)
      ab.subVectors(b, a)
      ac.subVectors(c, a)
      n.crossVectors(ab, ac)
      const length = n.length()
      if (length === 0) continue
      if (n.y / length < 0.85) continue
      const triArea = length / 2
      if (triArea > AREA_MAX) continue
      tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), area: triArea })
      area += triArea
    }
  })

  // --- headroom: what heights exist above each plan cell -------------------
  const heights = new Map<string, number[]>()
  const key = (x: number, z: number) => `${Math.round(x / CELL)},${Math.round(z / CELL)}`
  for (const t of tris) {
    const k = key((t.a.x + t.b.x + t.c.x) / 3, (t.a.z + t.b.z + t.c.z) / 3)
    const list = heights.get(k)
    if (list) list.push(t.a.y)
    else heights.set(k, [t.a.y])
  }

  // --- scatter -------------------------------------------------------------
  const wanted = Math.min(MAX_SPECTATORS, Math.round(area * DENSITY))
  const perArea = area > 0 ? wanted / area : 0
  const random = mulberry32(0x5adfa77)
  const matrices: number[] = []
  const shirts: number[] = []
  const skins: number[] = []
  const phases: number[] = []
  const colour = new Color()
  const dummy = new Object3D()
  const position = new Vector3()
  const forward = new Vector3()
  const matrix = new Matrix4()
  const zAxis = new Vector3(0, 0, 1)

  for (const t of tris) {
    const want = t.area * perArea
    let count = Math.floor(want)
    if (random() < want - count) count++
    for (let i = 0; i < count; i++) {
      let u = random()
      let v = random()
      if (u + v > 1) {
        u = 1 - u
        v = 1 - v
      }
      position.copy(t.a).addScaledVector(ab.subVectors(t.b, t.a), u).addScaledVector(ac.subVectors(t.c, t.a), v)
      const above = heights.get(key(position.x, position.z))
      if (above && above.some((y) => y - position.y > HEADROOM_MIN && y - position.y < HEADROOM_MAX)) continue
      // face the racing line — which is the only place the player ever is
      const sample = layout.samples[nearestIndex(layout, position.x, position.z)]
      forward.set(sample.p.x - position.x, 0, sample.p.z - position.z)
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1)
      forward.normalize()
      dummy.position.copy(position)
      dummy.quaternion.setFromUnitVectors(zAxis, forward)
      dummy.scale.setScalar(0.9 + random() * 0.25)
      dummy.updateMatrix()
      matrix.copy(dummy.matrix)
      matrices.push(...matrix.elements)
      colour.set(SHIRTS[(random() * SHIRTS.length) | 0])
      shirts.push(colour.r, colour.g, colour.b)
      colour.set(SKIN[(random() * SKIN.length) | 0])
      skins.push(colour.r, colour.g, colour.b)
      phases.push(random())
    }
  }

  return {
    count: phases.length,
    matrices: new Float32Array(matrices),
    shirts: new Float32Array(shirts),
    skins: new Float32Array(skins),
    phases: new Float32Array(phases),
    area,
    surfaces: tris.length,
  }
}

export function Crowd(): JSX.Element | null {
  const { scene } = useGLTF(asset(CIRCUIT_MODEL), DRACO_PATH)
  const bodies = useRef<InstancedMesh>(null)
  const heads = useRef<InstancedMesh>(null)
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  const data = useMemo(() => {
    const built = buildCrowd(scene)
    if (import.meta.env.DEV) {
      const w = window as unknown as { __crowd?: unknown }
      w.__crowd = { spectators: built.count, seatingArea: Math.round(built.area), surfaces: built.surfaces, triangles: built.count * 4, drawCalls: 2 }
    }
    return built
  }, [scene])

  const geometry = useMemo(() => ({ body: quad(BODY_W, BODY_H, 0), head: quad(HEAD_R * 2, HEAD_R * 2, BODY_H - 0.03) }), [])
  const materials = useMemo(() => ({ body: swayMaterial('#ffffff', uniforms, 0.045), head: swayMaterial('#ffffff', uniforms, 0.045) }), [uniforms])

  useLayoutEffect(() => {
    for (const [ref, colours] of [
      [bodies, data.shirts],
      [heads, data.skins],
    ] as const) {
      const mesh = ref.current
      if (!mesh) continue
      mesh.instanceMatrix = new InstancedBufferAttribute(data.matrices, 16)
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor = new InstancedBufferAttribute(colours, 3)
      mesh.instanceColor.needsUpdate = true
      mesh.geometry.setAttribute('aPhase', new InstancedBufferAttribute(data.phases, 1))
      // One instanced mesh spread over 1.9 km of circuit: culling it as a whole
      // would be all or nothing, and the per-instance cost is already trivial.
      mesh.frustumCulled = false
    }
  }, [data])

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime
  })

  if (!data.count) return null

  return (
    <group>
      <instancedMesh ref={bodies} args={[geometry.body, materials.body, data.count]} />
      <instancedMesh ref={heads} args={[geometry.head, materials.head, data.count]} />
    </group>
  )
}
