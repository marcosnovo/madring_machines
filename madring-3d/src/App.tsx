import { useEffect, useState } from 'react'
import type { DirectionalLight } from 'three'
import { Layers, Vector3 } from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Debug, Physics } from '@react-three/cannon'
import { Environment, OrbitControls, PerspectiveCamera, Sky } from '@react-three/drei'

import { getLayout } from './circuit/layout'
import { HideMouse, Keyboard } from './controls'
import { Cameras } from './effects'
import { Circuit, CircuitPhysics, Crowd, Ground, Killzone, LapTiming, Vehicle } from './models'
import { levelLayer, useStore } from './store'
import { Clock, Editor, Help, Intro, Minimap, PickColor, Speed } from './ui'
import { useToggle } from './useToggle'

const layers = new Layers()
layers.enable(levelLayer)

/**
 * Where the sun sits relative to the car, metres.
 *
 * 36° above the horizon rather than the 53° it used to be: at 53° the shadows
 * were stubs directly under everything and read as ambient occlusion. The
 * `<Sky>` below is given the same direction, so the bright part of the sky and
 * the direction the shadows fall now agree — they did not before.
 */
const SUN_OFFSET = new Vector3(210, 180, 130)
const sunPosition = new Vector3()

/**
 * Half-width of the sun's shadow frustum, metres.
 *
 * This is the whole lighting budget in one number. The circuit is 1.9 km
 * across; a shadow camera that covered it would spread 2048² texels over
 * 3.6 km² — 0.5 texels per metre, which is not a shadow, it is a smear. Bound
 * to 85 m around the car it is 12 texels per metre, which resolves the car,
 * the barriers, the gantry and the near grandstands. Everything further away
 * has no shadow at all, and at 300 km/h nobody has ever noticed.
 */
const SHADOW_EXTENT = 85

/**
 * Keep the shadow camera over the car.
 *
 * The sun is a directional light with a 170 m shadow frustum. Upstream parented
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
 *
 * `gl.info` is reset by every `WebGLRenderer.render()`, and there is more than
 * one per frame: the minimap takes over the render loop with a priority-1
 * `useFrame` and draws its own two-sprite overlay scene last, so reading
 * `gl.info` straight out of a frame callback reports "2 draw calls, 4
 * triangles" — the overlay — and not the circuit at all. So wrap `render` and
 * keep the heaviest pass of each frame, which is the one that matters.
 */
function DevProbe(): null {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    const original = gl.render.bind(gl)
    let heaviest = { calls: 0, triangles: 0 }
    const w = window as unknown as Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(gl as any).render = (renderScene: never, renderCamera: never) => {
      original(renderScene, renderCamera)
      const { calls, triangles } = gl.info.render
      if (triangles >= heaviest.triangles) heaviest = { calls, triangles }
    }
    const id = setInterval(() => {
      w.__render = { ...heaviest, programs: gl.info.programs?.length ?? 0 }
      heaviest = { calls: 0, triangles: 0 }
    }, 500)
    return () => {
      clearInterval(id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(gl as any).render = original
    }
  }, [gl])

  useFrame(() => {
    const w = window as unknown as Record<string, unknown>
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
        <Sky sunPosition={[210, 180, 130]} distance={8000} turbidity={4} rayleigh={0.6} />
        {/* Key, fill, bounce.

            The scene used to be one flat white directional light and a 0.5
            ambient, which is why everything read as a diagram. Now:

            - the KEY is warm, casts the only shadow map, and follows the car
              (see `Sun` above) so the frustum is always over the player;
            - the FILL is cool and comes from the opposite quarter with no
              shadow, so the shadowed sides of the pit building and the
              grandstands are still readable;
            - the HEMISPHERE light replaces most of the ambient: sky colour from
              above, asphalt grey from below, which is what actually happens on
              a circuit and is nearly free.

            The environment map is "Dikhololo Night" — the only HDR shipped —
            and Circuit.tsx already holds every material's `envMapIntensity`
            down to 0.5, so it contributes reflection shape rather than its own
            (wrong, nocturnal) colour. */}
        <hemisphereLight layers={layers} args={['#bcd7f2', '#5b564c', 0.55]} />
        <ambientLight layers={layers} intensity={0.18} />
        <directionalLight layers={layers} position={[-180, 120, -140]} intensity={0.4} color="#a8c4e8" />
        <directionalLight
          ref={setLight}
          layers={layers}
          position={[210, 180, 130]}
          intensity={1.45}
          color="#fff2dd"
          shadow-bias={-0.0006}
          shadow-normalBias={0.5}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-SHADOW_EXTENT}
          shadow-camera-right={SHADOW_EXTENT}
          shadow-camera-top={SHADOW_EXTENT}
          shadow-camera-bottom={-SHADOW_EXTENT}
          shadow-camera-near={40}
          shadow-camera-far={620}
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
        <Crowd />
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
