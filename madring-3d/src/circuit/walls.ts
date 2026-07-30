/**
 * The invisible walls that keep the car on the circuit.
 *
 * cannon-es implements sphere-trimesh and plane-trimesh narrowphase only —
 * there is no convex/box-vs-trimesh — so a `Trimesh` can be driven *on* (the
 * wheel raycasts hit it, `Ray` supports trimesh via the mesh's octree) but
 * never *into*: the chassis box passes straight through it. Everything the car
 * has to bounce off therefore has to be a primitive shape, which rules out
 * using the model's own concrete walls and fences as collision.
 *
 * So the walls are generated instead, from the asphalt edges that
 * scripts/fit-circuit.mjs measured off the model: a box every ~21 m down each
 * side, standing just outside the paved corridor. You can use the full width of
 * the asphalt, run-off aprons included, and you cannot leave it. Where the
 * model has real concrete they sit roughly where the concrete is; where it has
 * open run-off they are the edge of the tarmac, which is not what a real
 * circuit does but is the only line that is both measurable and closed.
 *
 * They are grouped into sectors and each sector becomes one compound body, so
 * no single body has an AABB the size of the circuit.
 */
import { pointAt } from './layout'

import type { Layout } from './layout'

/** How tall the walls are, metres. Enough that the car cannot ride over one. */
export const WALL_HEIGHT = 3
/** How far outside the edge of the asphalt they stand, metres. */
const WALL_MARGIN = 0.8
/** Wall thickness, metres. */
const WALL_THICKNESS = 0.8
/** Roughly how long each box is, metres. */
const WALL_SPACING = 21

export interface Wall {
  position: [number, number, number]
  rotation: [number, number, number]
  args: [number, number, number]
}

export function walls(layout: Layout, sectors = 24): Wall[][] {
  const { samples } = layout
  const n = samples.length
  const step = Math.max(1, Math.round(WALL_SPACING / layout.ds))
  // 8% overlap, so consecutive boxes never leave a gap on the outside of a bend
  const length = step * layout.ds * 1.08
  const groups: Wall[][] = Array.from({ length: sectors }, () => [])

  for (let i = 0; i < n; i += step) {
    const s = samples[i]
    const sector = Math.min(sectors - 1, Math.floor((i / n) * sectors))
    const yaw = Math.atan2(-s.t.x, -s.t.z)
    for (const side of [-1, 1] as const) {
      const edge = side < 0 ? s.edgeLeft : s.edgeRight
      const p = pointAt(s, side * (edge + WALL_MARGIN + WALL_THICKNESS / 2), WALL_HEIGHT / 2 - 0.6)
      groups[sector].push({
        position: [p.x, p.y, p.z],
        rotation: [0, yaw, 0],
        args: [WALL_THICKNESS, WALL_HEIGHT, length],
      })
    }
  }
  return groups
}
