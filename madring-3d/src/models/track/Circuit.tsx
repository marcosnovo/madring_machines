/**
 * The circuit, rendered from the 3D model.
 *
 *   "Circuito de Madring 2026 layout" by Dave Love SketchFab
 *   https://sketchfab.com/3d-models/circuito-de-madring-2026-layout-5bbaf6e5048643858a498bc8a4ef4c05
 *   Licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
 *
 * This replaces the procedural road ribbon that used to be generated here. The
 * model brings the asphalt, kerbs, painted lines, tyre marks, walls, fences,
 * pit building, grandstands, floodlights, trees, signage and the surrounding
 * city, which is rather more than a swept cross-section was ever going to.
 *
 * The .glb is built by scripts/build-circuit-model.mjs: the alignment transform
 * is baked into the file, every mesh that spans more than a few hundred metres
 * is cut into 256 m tiles so frustum culling has something to reject, textures
 * are WebP and the geometry is Draco.
 *
 * Nothing here collides — see CircuitPhysics.
 */
import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { DoubleSide, FrontSide } from 'three'

import type { Mesh, MeshStandardMaterial, Object3D } from 'three'

import { asset } from '../../assets'
import { getLayout } from '../../circuit/layout'
import { DRACO_PATH } from '../../draco'
import { levelLayer, useStore } from '../../store'

export const CIRCUIT_MODEL = 'models/circuit-draco.glb'

/** Cut-out foliage, grandstand railings and chain-link. Declared BLEND by the
 *  source; alpha testing them instead avoids depth-sorting several hundred
 *  thousand triangles. Double-sided because they are single-sided cards. */
const CUTOUT = /^(Maple|Cypress|wire_fence|gstand-alpha|top)/
/** The road surface itself. It does not cast shadows — it is flat on the
 *  ground and would only shadow-acne itself. */
const GROUND = /^(TarmacDark|Line_|tyre_skids|main_kerbs|rubber|sandgreen|green2|BackColor2|Background)/
/** What the minimap draws. Everything else is left off `levelLayer`, or the
 *  minimap would be a picture of the whole city. */
const ON_MAP = /^(TarmacDark|main_kerbs|Line_White)/

export interface CircuitStats {
  meshes: number
  triangles: number
  materials: number
}

/** Counted once at load, so performance can be reported as numbers not vibes. */
export let circuitStats: CircuitStats = { meshes: 0, triangles: 0, materials: 0 }

export function Circuit(): JSX.Element {
  const level = useStore((state) => state.level)
  const { scene } = useGLTF(asset(CIRCUIT_MODEL), DRACO_PATH)
  const layout = getLayout()

  // The loader caches the parsed scene, so mutate it once and reuse it.
  const prepared = useMemo(() => {
    const materials = new Set<MeshStandardMaterial>()
    let meshes = 0
    let triangles = 0

    scene.traverse((child: Object3D) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      meshes++
      const { geometry } = mesh
      triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3

      const material = mesh.material as MeshStandardMaterial
      const name = material.name ?? ''

      // Frustum culling is on by default; it only became worth anything once
      // the build script tiled these meshes, and it needs a bounding sphere.
      mesh.frustumCulled = true
      if (!geometry.boundingSphere) geometry.computeBoundingSphere()

      mesh.castShadow = !GROUND.test(name)
      mesh.receiveShadow = true
      mesh.layers.set(0)
      if (ON_MAP.test(name)) mesh.layers.enable(levelLayer)

      if (materials.has(material)) return
      materials.add(material)
      if (CUTOUT.test(name)) {
        material.alphaTest = 0.35
        material.transparent = false
        material.side = DoubleSide
        material.depthWrite = true
      } else {
        material.side = FrontSide
      }
      material.envMapIntensity = 0.5
    })

    circuitStats = { meshes, triangles: Math.round(triangles), materials: materials.size }
    return scene
  }, [scene])

  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __circuit?: CircuitStats & { lap: number } }
    w.__circuit = { ...circuitStats, lap: layout.lapLength }
  }, [layout, prepared])

  return (
    <group dispose={null}>
      <primitive object={prepared} />
      <group ref={level}>
        <MinimapRoad />
      </group>
    </group>
  )
}

/**
 * A flat ribbon down the middle of the measured road, on `levelLayer` only, so
 * the minimap has a clean picture of the circuit and a bounding box that is the
 * circuit rather than the whole model. The main camera never sees it.
 */
function MinimapRoad(): JSX.Element {
  const layout = getLayout()
  const { positions, indices } = useMemo(() => {
    const { samples } = layout
    const n = samples.length
    const position = new Float32Array(n * 2 * 3)
    const index: number[] = []
    for (let i = 0; i < n; i++) {
      const s = samples[i]
      const half = Math.min(12, (s.edgeLeft + s.edgeRight) / 2)
      for (let c = 0; c < 2; c++) {
        const side = c === 0 ? -1 : 1
        const o = (i * 2 + c) * 3
        position[o] = s.p.x + s.r.x * side * half
        position[o + 1] = s.p.y + 0.5
        position[o + 2] = s.p.z + s.r.z * side * half
      }
      const j = ((i + 1) % n) * 2
      index.push(i * 2, i * 2 + 1, j, i * 2 + 1, j + 1, j)
    }
    return { positions: position, indices: new Uint32Array(index) }
  }, [layout])

  const mesh = useRef<Mesh>(null)
  useLayoutEffect(() => void mesh.current?.layers.set(levelLayer), [])

  return (
    <mesh ref={mesh}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="index" args={[indices, 1]} />
      </bufferGeometry>
      <meshBasicMaterial color="#e8eaed" toneMapped={false} />
    </mesh>
  )
}

useGLTF.preload(asset(CIRCUIT_MODEL), DRACO_PATH)
