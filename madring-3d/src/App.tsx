import { useState } from 'react'
import type { DirectionalLight } from 'three'
import { Layers, Vector3 } from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Debug, Physics } from '@react-three/cannon'
import { Environment, OrbitControls, PerspectiveCamera, Sky } from '@react-three/drei'

import { getLayout } from './circuit/layout'
import { HideMouse, Keyboard } from './controls'
import { Cameras } from './effects'
import { Circuit, CircuitPhysics, Ground, Killzone, LapTiming, Vehicle } from './models'
import { levelLayer, useStore } from './store'
import { Clock, Editor, Help, Intro, Minimap, PickColor, Speed } from './ui'
import { useToggle } from './useToggle'

const layers = new Layers()
layers.enable(levelLayer)

/** Where the sun sits relative to the car, metres. */
const SUN_OFFSET = new Vector3(160, 240, 90)
const sunPosition = new Vector3()

/**
 * Keep the shadow camera over the car.
 *
 * The sun is a directional light with a 240 m shadow frustum. Upstream parented
 * only its *target* to the vehicle, which was fine on a 200 m desert map: here
 * the circuit is 1.9 km across, so a light pinned at a fixed world position
 * points its shadow camera at a patch of ground a kilometre from the car and
 * nothing within sight of the player is ever shadowed. Moving the light with
 * the car keeps the direction of the light constant and the frustum useful.
 */
function Sun({ light }: { light: DirectionalLight | null }): null {
  const chassisBody = useStore((state) => state.chassisBody)
  useFrame(() => {
    if (!light || !chassisBody.current) return
    chassisBody.current.getWorldPosition(sunPosition)
    light.position.copy(sunPosition).add(SUN_OFFSET)
  })
  return null
}

/**
 * Dev-only handle on the renderer, so a headless browser can read draw calls
 * and triangle counts per frame instead of guessing at a frame rate. Stripped
 * from production builds along with the rest of `import.meta.env.DEV`.
 */
function DevProbe(): null {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  useFrame(() => {
    const w = window as unknown as Record<string, unknown>
    w.__render = { calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs?.length ?? 0 }
    w.__scene = scene
    w.__camera = camera
  })
  return null
}

function App(): JSX.Element {
  const [light, setLight] = useState<DirectionalLight | null>(null)
  const [dpr, editor, shadows] = useStore((s) => [s.dpr, s.editor, s.shadows])

  const ToggledDebug = useToggle(Debug, 'debug')
  const ToggledEditor = useToggle(Editor, 'editor')
  const ToggledMap = useToggle(Minimap, 'map')
  const ToggledOrbitControls = useToggle(OrbitControls, 'editor')

  const { grid } = getLayout()

  return (
    <Intro>
      <Canvas key={`${dpr}${shadows}`} dpr={[1, dpr]} shadows={shadows}>
        {/* The model carries its own backdrop 2 km out, so the fog has to let
            the far side of the circuit through instead of swallowing it. */}
        <fog attach="fog" args={['#c6d3e2', 400, 3200]} />
        <Sky sunPosition={[100, 30, 100]} distance={8000} />
        <ambientLight layers={layers} intensity={0.5} />
        <directionalLight
          ref={setLight}
          layers={layers}
          position={[160, 240, 90]}
          intensity={1}
          shadow-bias={-0.001}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-120}
          shadow-camera-right={120}
          shadow-camera-top={120}
          shadow-camera-bottom={-120}
          shadow-camera-far={600}
          castShadow
        />
        <Sun light={light} />
        {import.meta.env.DEV && <DevProbe />}
        <PerspectiveCamera makeDefault={editor} fov={75} near={0.3} far={7000} position={[0, 20, 20]} />
        <Physics allowSleep broadphase="SAP" defaultContactMaterial={{ contactEquationRelaxation: 4, friction: 1e-3 }}>
          <ToggledDebug scale={1.0001} color="white">
            <Vehicle angularVelocity={[0, 0, 0]} position={grid.position} rotation={grid.rotation}>
              {light && <primitive object={light.target} />}
              <Cameras />
            </Vehicle>
            <CircuitPhysics />
            <Ground />
            <LapTiming />
            <Killzone y={-40} />
          </ToggledDebug>
        </Physics>
        <Circuit />
        <Environment files="textures/dikhololo_night_1k.hdr" />
        <ToggledMap />
        <ToggledOrbitControls />
      </Canvas>
      <Clock />
      <ToggledEditor />
      <Help />
      <Speed />
      <PickColor />
      <HideMouse />
      <Keyboard />
    </Intro>
  )
}

export default App
