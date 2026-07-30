/**
 * Collision for the generated circuit.
 *
 * The upstream project drove on a cannon `Heightfield` baked from a greyscale
 * PNG. That cannot represent a banked road at this scale — over a ~1.1 x 1.8 km
 * world a 1024-square heightfield gives ~2 m cells, which is coarser than the
 * kerbs and turns 24% banking into a staircase.
 *
 * So the road surface is a `Trimesh` swept straight from the same centreline as
 * the visual ribbon: exact banking, exact elevation, no resampling error.
 *
 * The trade-off is that cannon-es implements sphere-trimesh and plane-trimesh
 * narrowphase only — there is no convex/box-vs-trimesh — so the *chassis box*
 * does not collide with the trimesh; only the wheel raycasts do (Ray does
 * support trimesh, via the mesh's octree). That is enough to drive on, because
 * a RaycastVehicle is held up entirely by wheel rays. To stop the car sliding
 * out of the world sideways, the outside of the run-off is lined with static
 * boxes, grouped into per-sector compound bodies so each one keeps a small AABB.
 */
import { useCompoundBody, useTrimesh } from '@react-three/cannon'
import { useMemo, useRef } from 'react'

import type { Mesh } from 'three'

import { barriers, collisionGeometry, trimeshArgs } from '../../circuit/geometry'
import { getLayout } from '../../circuit/layout'

function BarrierSector({ index }: { index: number }): null {
  const layout = getLayout()
  const shapes = useMemo(() => barriers(layout)[index], [layout, index])
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
  const layout = getLayout()
  const [vertices, indices] = useMemo(() => trimeshArgs(collisionGeometry(layout)), [layout])

  useTrimesh(() => ({ args: [vertices, indices], type: 'Static', position: [0, 0, 0] }), useRef<Mesh>(null), [vertices, indices])

  return (
    <>
      {Array.from({ length: sectors }, (_, i) => (
        <BarrierSector key={i} index={i} />
      ))}
    </>
  )
}
