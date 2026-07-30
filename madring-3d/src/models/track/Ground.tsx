/**
 * The ground the circuit sits on: one large plane a few metres below the lowest
 * point of the road, solid in the physics world and visible in the scene.
 *
 * Without it the generated ribbon floats in an empty sky, and anything that
 * clears the barriers falls forever. It is deliberately *not* part of the
 * `level` group, so it stays out of the minimap's bounds calculation.
 */
import { usePlane } from '@react-three/cannon'

import { getLayout } from '../../circuit/layout'

const GROUND = '#5c6b46'

export function Ground(): JSX.Element {
  const layout = getLayout()
  const y = Math.min(...layout.samples.map((s) => s.p.y)) - 8

  usePlane(() => ({ type: 'Static', position: [0, y, 0], rotation: [-Math.PI / 2, 0, 0] }))

  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[6000, 6000]} />
      <meshStandardMaterial color={GROUND} roughness={1} />
    </mesh>
  )
}
