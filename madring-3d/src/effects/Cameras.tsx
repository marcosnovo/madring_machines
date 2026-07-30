import { PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import { useStore } from '../store'

/**
 * The chase / first-person camera and the bird's-eye one.
 *
 * The field of view is set here only as a starting value: Vehicle.tsx animates
 * it with speed and with the boost, which is most of what makes the car feel
 * fast. drei's default is 50°, which reads as a telephoto lens at 300 km/h.
 */
export function Cameras() {
  const [camera, editor] = useStore((state) => [state.camera, state.editor])
  return (
    <>
      <PerspectiveCamera
        frustumCulled={false}
        makeDefault={!editor && camera !== 'BIRD_EYE'}
        fov={62}
        near={0.2}
        far={7000}
        rotation={[0, Math.PI, 0]}
        position={[0, 2, -6]}
      />
      <OrthographicCamera
        frustumCulled={false}
        makeDefault={!editor && camera === 'BIRD_EYE'}
        position={[0, 100, 0]}
        rotation={[(-1 * Math.PI) / 2, 0, Math.PI]}
        zoom={15}
      />
    </>
  )
}
