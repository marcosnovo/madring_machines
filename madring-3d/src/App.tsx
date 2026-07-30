import { useState } from 'react'
import type { DirectionalLight } from 'three'
import { Layers } from 'three'
import { Canvas } from '@react-three/fiber'
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
        <fog attach="fog" args={['#c9d6e4', 60, 900]} />
        <Sky sunPosition={[100, 30, 100]} distance={4000} />
        <ambientLight layers={layers} intensity={0.35} />
        <directionalLight
          ref={setLight}
          layers={layers}
          position={[120, 180, 60]}
          intensity={1}
          shadow-bias={-0.001}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-120}
          shadow-camera-right={120}
          shadow-camera-top={120}
          shadow-camera-bottom={-120}
          castShadow
        />
        <PerspectiveCamera makeDefault={editor} fov={75} near={0.3} far={3000} position={[0, 20, 20]} />
        <Physics allowSleep broadphase="SAP" defaultContactMaterial={{ contactEquationRelaxation: 4, friction: 1e-3 }}>
          <ToggledDebug scale={1.0001} color="white">
            <Vehicle angularVelocity={[0, 0, 0]} position={grid.position} rotation={grid.rotation}>
              {light && <primitive object={light.target} />}
              <Cameras />
            </Vehicle>
            <CircuitPhysics />
            <Ground />
            <LapTiming />
            <Killzone y={-60} />
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
