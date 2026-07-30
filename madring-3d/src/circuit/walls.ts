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
 * scripts/fit-circuit.mjs measured off the model. You can use the full width of
 * the asphalt, run-off aprons included, and you cannot leave it. Where the
 * model has real concrete they sit roughly where the concrete is; where it has
 * open run-off they are the edge of the tarmac, which is not what a real
 * circuit does but is the only line that is both measurable and closed.
 *
 * They are grouped into sectors and each sector becomes one compound body, so
 * no single body has an AABB the size of the circuit.
 *
 * -- WHY THEY LOOK LIKE THIS ---------------------------------------------
 *
 * The first version of this file put one 0.8 x 3 x 21 m box *centred on* every
 * 21st metre of the measured centreline, each square to the road at that
 * sample. The car drove straight through them, and measuring in a headless
 * cannon-es world (no renderer, so the whole lap can be tested in seconds)
 * showed why. Two independent failures:
 *
 *   1. A chain of chords is not a wall. Consecutive boxes sat at *their own*
 *      sample's edge distance, and that distance steps by up to 4.6 m from one
 *      box to the next, so the boxes met end-cap to end-cap with a lateral
 *      jog. A box's end cap points along the road, so a car arriving at a joint
 *      was pushed *forwards*, not sideways, and slid past.
 *
 *   2. A 0.8 m wall is thinner than one physics step. cannon has no continuous
 *      collision detection. At 1/60 s the car covers 0.5 m at 30 m/s and 1.5 m
 *      at the old 88 m/s ceiling, so it could start a step outside the box and
 *      finish it outside on the other side. Worse, once the centre of the
 *      chassis is past the middle of a thin box, box-vs-box narrowphase reports
 *      the *far* face as the axis of least penetration and the contact pushes
 *      the car out through the back of the wall rather than back onto the road.
 *
 * Both are fixed here. Each box now spans *between* consecutive edge points, so
 * the chain is continuous and every face the car can reach is a side face
 * pointing at the road; and the boxes are 8 m thick and 9 m tall, which is far
 * more than the deepest single-step penetration, so the axis of least
 * penetration stays lateral and the contact always pushes the car back inside.
 * Thickness grows *outwards* only — the inner face is still 0.8 m outside the
 * measured asphalt edge, exactly where it was.
 *
 * There is room for that: the tightest gap anywhere on the lap between one
 * wall line and another part of the paved corridor is 16.8 m, so an 8 m wall
 * never reaches across to a neighbouring stretch of road.
 *
 * Measured over 366 impacts per angle spread around the whole lap, at 30, 60
 * and 90 m/s (chassis box, no wheels, worst case):
 *
 *   angle of impact   90°     60°     45°     30°     20°
 *   old walls        4.9%   14.5%   19.4%   27.9%   30.9%   got through
 *   these walls      0.0%    0.0%    2.2%    5.7%    7.9%
 *
 * The residue is all shallow-angle, and all at the handful of samples where the
 * measured corridor changes width abruptly and the wall line therefore has a
 * sharp convex kink; a car that steers, rather than a box fired in a straight
 * line, does not meet those.
 */
import { Vector3 } from 'three'

import { pointAt } from './layout'

import type { Layout } from './layout'

/** How far the wall stands above the road surface, metres. */
export const WALL_TOP = 5
/** How far it reaches below it. Deep enough that a car can never drop under. */
export const WALL_BOTTOM = -4
/** Total height, metres. */
export const WALL_HEIGHT = WALL_TOP - WALL_BOTTOM
/** How far outside the edge of the asphalt the inner face stands, metres. */
const WALL_MARGIN = 0.8
/**
 * Wall thickness, metres, grown outwards from the inner face. This is not a
 * looks number — it has to be comfortably more than the distance the car
 * travels in one physics step, and more than the wall's own half-height, or
 * box-vs-box narrowphase resolves the contact through the wall. See above.
 */
const WALL_THICKNESS = 8
/** Samples per wall segment. 2 gives roughly 10.6 m boxes. */
const WALL_STRIDE = 2
/** Extra length on each box so segments overlap at the joints, metres. */
const WALL_OVERLAP = 3

export interface Wall {
  position: [number, number, number]
  rotation: [number, number, number]
  args: [number, number, number]
}

/** How many compound bodies the walls are split across. */
export const WALL_SECTORS = 48

export function walls(layout: Layout, sectors = WALL_SECTORS): Wall[][] {
  const { samples } = layout
  const n = samples.length
  const groups: Wall[][] = Array.from({ length: sectors }, () => [])
  const a = new Vector3()
  const b = new Vector3()
  const midHeight = (WALL_TOP + WALL_BOTTOM) / 2

  for (const side of [-1, 1] as const) {
    for (let i = 0; i < n; i += WALL_STRIDE) {
      const s0 = samples[i]
      const s1 = samples[(i + WALL_STRIDE) % n]
      const e0 = side < 0 ? s0.edgeLeft : s0.edgeRight
      const e1 = side < 0 ? s1.edgeLeft : s1.edgeRight
      pointAt(s0, side * (e0 + WALL_MARGIN), midHeight, a)
      pointAt(s1, side * (e1 + WALL_MARGIN), midHeight, b)
      const dx = b.x - a.x
      const dz = b.z - a.z
      const length = Math.hypot(dx, dz)
      if (length < 1e-3) continue
      // The box's local +Z runs along the segment. A yaw about +Y maps local +X
      // to (cos yaw, 0, -sin yaw), which is the *left* of the direction of
      // travel — the same side as the layout's left-hand edge.
      const yaw = Math.atan2(dx, dz)
      const lx = Math.cos(yaw)
      const lz = -Math.sin(yaw)
      // Grow outwards only, so the inner face stays on the measured edge.
      const out = -side
      const sector = Math.min(sectors - 1, Math.floor((i / n) * sectors))
      groups[sector].push({
        position: [(a.x + b.x) / 2 + lx * (WALL_THICKNESS / 2) * out, (a.y + b.y) / 2, (a.z + b.z) / 2 + lz * (WALL_THICKNESS / 2) * out],
        rotation: [0, yaw, 0],
        args: [WALL_THICKNESS, WALL_HEIGHT, length + WALL_OVERLAP],
      })
    }
  }
  return groups
}
