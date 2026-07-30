/**
 * A catch plane well below the circuit.
 *
 * The procedural circuit needed a visible ground: without one its ribbon
 * floated in an empty sky. The model brings its own terrain, verges and city,
 * so nothing is drawn here any more — this is physics only, a floor far enough
 * down that it is never seen, there to stop anything that clears the walls from
 * falling forever before the killzone at y = -60 catches it.
 *
 * It is deliberately *not* part of the `level` group, so it stays out of the
 * minimap's bounds calculation.
 */
import { usePlane } from '@react-three/cannon'

/** Metres below the lowest asphalt. The model's terrain bottoms out near -52. */
const FLOOR = -55

export function Ground(): null {
  usePlane(() => ({ type: 'Static', position: [0, FLOOR, 0], rotation: [-Math.PI / 2, 0, 0] }))
  return null
}
