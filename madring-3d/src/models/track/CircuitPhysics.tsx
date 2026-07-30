/**
 * Collision for the circuit.
 *
 * What collides, and why it is only these two things:
 *
 *   * THE ASPHALT — the model's own `TarmacDark` mesh, uploaded to cannon as
 *     static `Trimesh` bodies, one per tile the build script cut. This is what
 *     the wheels ride on, so the car drives on exactly the surface it is drawn
 *     on: every camber, kerb-height step, crest and dip in the model is felt.
 *     ~62k triangles in ~30 bodies, each with its own AABB and octree.
 *
 *   * THE WALLS — generated boxes just outside the measured edge of the
 *     asphalt (see ../../circuit/walls). Static compound bodies, 24 of them,
 *     invisible.
 *
 * Everything else in the model is decoration and has no collision at all:
 * grandstands, the pit building, the city, floodlights, signage, trees, the
 * crowd, the parked vans, the fences. Two reasons. The honest one is that
 * cannon-es implements sphere-trimesh and plane-trimesh narrowphase only —
 * there is no convex/box-vs-trimesh — so a trimesh can be driven on but never
 * driven into, and giving 1.6 M triangles of scenery collision would achieve
 * nothing except a slower broadphase. The design one is that a street circuit
 * is defined by its walls: if the walls are right, nothing else needs to be
 * solid, and the car can never reach the trees anyway.
 *
 * The one thing this costs: you can drive through the pit-lane fence and the
 * tyre stacks. You cannot reach them without first climbing a wall.
 */
import { useCompoundBody, useTrimesh } from '@react-three/cannon'
import { useGLTF } from '@react-three/drei'
import { useMemo, useRef } from 'react'

import type { BufferGeometry, Mesh, Object3D } from 'three'

import { asset } from '../../assets'
import { getLayout } from '../../circuit/layout'
import { walls } from '../../circuit/walls'
import { DRACO_PATH } from '../../draco'
import { CIRCUIT_MODEL } from './Circuit'

/** Material name prefix of the meshes the car drives on. */
const DRIVABLE = /^TarmacDark/

type TrimeshArgs = [Float32Array, Uint32Array]

/** Vertices in world space, indices flattened — what cannon's Trimesh wants. */
function trimeshArgs(mesh: Mesh): TrimeshArgs | null {
  const geometry = mesh.geometry as BufferGeometry
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  if (!position || !index) return null
  mesh.updateWorldMatrix(true, false)
  const vertices = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const e = mesh.matrixWorld.elements
    vertices[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]
    vertices[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
    vertices[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
  }
  return [vertices, new Uint32Array(index.array)]
}

function Asphalt({ args }: { args: TrimeshArgs }): null {
  useTrimesh(() => ({ args, type: 'Static', position: [0, 0, 0] }), useRef<Mesh>(null), [args])
  return null
}

function WallSector({ index }: { index: number }): null {
  const layout = getLayout()
  const shapes = useMemo(() => walls(layout)[index], [layout, index])
  useCompoundBody(
    () => ({
      type: 'Static',
      shapes: shapes.map(({ args, position, rotation }) => ({ type: 'Box', args, position, rotation })),
    }),
    undefined,
    [shapes],
  )
  return null
}

export function CircuitPhysics({ sectors = 24 }: { sectors?: number }): JSX.Element {
  const { scene } = useGLTF(asset(CIRCUIT_MODEL), DRACO_PATH)

  const surfaces = useMemo(() => {
    const out: TrimeshArgs[] = []
    scene.updateWorldMatrix(true, true)
    scene.traverse((child: Object3D) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).name ?? ''
      if (!DRIVABLE.test(name)) return
      const args = trimeshArgs(mesh)
      if (args) out.push(args)
    })
    if (import.meta.env.DEV) {
      const triangles = out.reduce((n, [, index]) => n + index.length / 3, 0)
      const w = window as unknown as { __physics?: { surfaces: number; triangles: number } }
      w.__physics = { surfaces: out.length, triangles }
    }
    return out
  }, [scene])

  return (
    <>
      {surfaces.map((args, i) => (
        <Asphalt key={i} args={args} />
      ))}
      {Array.from({ length: sectors }, (_, i) => (
        <WallSector key={i} index={i} />
      ))}
    </>
  )
}
