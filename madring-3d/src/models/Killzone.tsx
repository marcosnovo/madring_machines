/**
 * A single trigger plane under the world. Fall off the circuit and you get put
 * back on it.
 *
 * This replaces upstream's `BoundingBox`, which built a six-plane cage of
 * triggers around the level. cannon treats a plane as a solid half-space, so
 * every one of those six planes was in permanent contact with anything inside
 * the cage — the car fired `reset()` on its very first physics step, which
 * silently overwrote its spawn heading with a hard-coded rotation. One plane,
 * facing up, from below, only ever fires when something is genuinely under the
 * world.
 */
import { usePlane } from '@react-three/cannon'

import { useStore } from '../store'

export function Killzone({ y = -60 }: { y?: number }): null {
  const reset = useStore(({ actions }) => actions.reset)

  usePlane(() => ({
    isTrigger: true,
    userData: { trigger: true },
    onCollide: reset,
    position: [0, y, 0],
    // +Y normal: cannon's solid side is -normal, so contact only below `y`.
    rotation: [-Math.PI / 2, 0, 0],
  }))

  return null
}
