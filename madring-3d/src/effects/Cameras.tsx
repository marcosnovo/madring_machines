import { useLayoutEffect, useRef } from 'react'
import { PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { OrthographicCamera as OrthographicCameraImpl, PerspectiveCamera as PerspectiveCameraImpl } from 'three'

import { useStore } from '../store'

/**
 * Direct handles to both cameras for Vehicle.tsx's frame loop. The loop reads
 * the camera MODE synchronously from the store but React delivers the default-
 * camera switch a few frames later — posing "whatever camera is default right
 * now" therefore stomps the outgoing camera with the incoming mode's pose
 * during the transition (which is how the chase camera's rotation.y = PI got
 * destroyed by the bird's-eye branch). The loop poses these refs instead, so
 * the right camera is written no matter what React is mid-way through.
 */
export const cameraRig = {
  persp: null as PerspectiveCameraImpl | null,
  ortho: null as OrthographicCameraImpl | null,
}

/**
 * The chase / first-person camera and the bird's-eye one. Both are children
 * of the chassis (App mounts <Cameras/> inside <Vehicle>), so their positions
 * are car-local offsets and Vehicle.tsx poses them in that frame.
 *
 * Which one is active is decided HERE, imperatively, by a single effect —
 * deliberately not with drei's `makeDefault` on both. makeDefault keeps a
 * restore stack ("put back whichever camera was default before me"), and with
 * two cameras flipping in the same commit the second round-trip through
 * BIRD_EYE restored the Canvas's own scene-root camera instead of the chassis
 * one. Vehicle.tsx then wrote its car-local offsets into a world-space
 * camera: the chase view became a static shot of the ground near the origin
 * with no car in it, and first person clipped into the rear wing. One writer,
 * no stack, no restore order to get wrong.
 *
 * The field of view set here is only a starting value: Vehicle.tsx animates
 * it with speed and boost, live-tunable from the panel on `.`.
 *
 * So are the position and rotation of the perspective camera: the frame loop
 * writes both every tick and snaps rather than eases on the first one. They
 * are still kept in step with the chase pose in Vehicle.tsx (2.45 m up,
 * 7.1 m back, tilted down by CHASE_PITCH) so that the one frame R3F may render
 * before the loop first runs is the shot the player is about to get, not a
 * lower one it immediately jumps away from.
 */
export function Cameras() {
  const camera = useStore((state) => state.camera)
  const set = useThree((state) => state.set)
  const persp = useRef<PerspectiveCameraImpl>(null!)
  const ortho = useRef<OrthographicCameraImpl>(null!)

  useLayoutEffect(() => {
    cameraRig.persp = persp.current
    cameraRig.ortho = ortho.current
    set({ camera: camera === 'BIRD_EYE' ? ortho.current : persp.current })
  }, [camera, set])

  return (
    <>
      <PerspectiveCamera ref={persp} frustumCulled={false} fov={62} near={0.2} far={7000} rotation={[0.105, Math.PI, 0]} position={[0, 2.45, -7.1]} />
      <OrthographicCamera ref={ortho} frustumCulled={false} position={[0, 100, 0]} rotation={[(-1 * Math.PI) / 2, 0, Math.PI]} zoom={15} />
    </>
  )
}
