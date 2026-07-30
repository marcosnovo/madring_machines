/**
 * Corner minimap: renders everything on `levelLayer` (the circuit ribbon) into
 * an off-screen buffer once, then draws it as a masked sprite with a cursor for
 * the car.
 *
 * Changed from upstream: the multiplayer opponent cursors are gone, the
 * orthographic frustum is square so a 1.1 x 1.8 km circuit is not squashed, and
 * near/far are derived from the level bounds — the hard-coded `near={20}
 * far={500}` clipped the generated track away entirely.
 */
import { OrthographicCamera as OrthographicCameraComponent, useFBO, useTexture } from '@react-three/drei'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box3, Matrix4, Scene, Vector2, Vector3 } from 'three'

import type { OrthographicCamera, WebGLRenderTarget, Sprite } from 'three'

import { useStore, levelLayer } from '../store'

const m = new Matrix4()
const playerPosition = new Vector3()
const playerRotation = new Vector3()
const spriteRotation = new Vector2()
const v = new Vector3()

function useLevelGeometricProperties(): [Box3, Vector3, Vector3] {
  const [box] = useState(() => new Box3())
  const [center] = useState(() => new Vector3())
  const [dimensions] = useState(() => new Vector3())
  const level = useStore((state) => state.level)

  useLayoutEffect(() => {
    if (!level.current?.parent) return
    level.current.parent.updateWorldMatrix(false, false)
    box.setFromObject(level.current)
    box.getCenter(center)
    box.getSize(dimensions)
  }, [])

  return [box, center, dimensions]
}

function MinimapTexture({ buffer }: { buffer: WebGLRenderTarget }): JSX.Element {
  const camera = useRef<OrthographicCamera>(null)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const [levelBox, levelCenter, levelDimensions] = useLevelGeometricProperties()
  const half = Math.max(levelDimensions.x, levelDimensions.z) / 2 || 1

  useEffect(() => {
    if (!camera.current) return
    gl.setRenderTarget(buffer)
    camera.current.left = -half
    camera.current.right = half
    camera.current.bottom = -half
    camera.current.top = half
    const height = levelDimensions.y + 100
    camera.current.near = 1
    camera.current.far = height * 2
    camera.current.position.set(levelCenter.x, levelBox.max.y + height, levelCenter.z)
    camera.current.updateProjectionMatrix()
    gl.render(scene, camera.current)
    gl.setRenderTarget(null)
  }, [levelBox, levelCenter, half])

  useLayoutEffect(() => {
    if (!camera.current) return
    camera.current.layers.disableAll()
    camera.current.layers.enable(levelLayer)
  }, [])

  return <OrthographicCameraComponent ref={camera} makeDefault={false} rotation={[-Math.PI / 2, 0, 0]} />
}

export function Minimap({ size = 200 }): JSX.Element {
  const player = useRef<Sprite>(null)
  const miniMap = useRef<Sprite>(null)
  const miniMapCamera = useRef<OrthographicCamera>(null)
  const [virtualScene] = useState(() => new Scene())
  const mask = useTexture('textures/mask.svg')
  const cursorTexture = useTexture('textures/cursor.svg')
  const buffer = useFBO(size * 2, size * 2)
  const {
    gl,
    camera,
    scene,
    size: { height, width },
  } = useThree()
  const [, levelCenter, levelDimensions] = useLevelGeometricProperties()
  const chassisBody = useStore((state) => state.chassisBody)
  const screenPosition = useMemo(() => new Vector3(width / -2 - size / -2 + 30, height / -2 - size / -2 + 30, 0), [height, width, size])
  const span = Math.max(levelDimensions.x, levelDimensions.z) || 1

  useFrame(() => {
    if (!miniMap.current || !miniMapCamera.current) return
    gl.autoClear = true
    gl.render(scene, camera)
    gl.autoClear = false
    gl.clearDepth()

    m.copy(camera.matrix).invert()
    miniMap.current.quaternion.setFromRotationMatrix(m)

    if (chassisBody.current && player.current) {
      v.subVectors(chassisBody.current.getWorldPosition(playerPosition), levelCenter)
      player.current.quaternion.setFromRotationMatrix(m)
      player.current.position.set(screenPosition.x + (v.x / span) * size, screenPosition.y - (v.z / span) * size, 0)
      chassisBody.current.getWorldDirection(playerRotation)
      spriteRotation.set(playerRotation.x, playerRotation.z)
      player.current.material.rotation = Math.PI / 2 - spriteRotation.angle()
    }

    gl.render(virtualScene, miniMapCamera.current)
  }, 1)

  return (
    <>
      {createPortal(
        <>
          <ambientLight intensity={1} />
          <sprite ref={miniMap} position={screenPosition} scale={[size, size, 1]}>
            <spriteMaterial map={buffer.texture} alphaMap={mask} />
          </sprite>
          <sprite ref={player} position={screenPosition} scale={[size / 20, size / 20, 1]}>
            <spriteMaterial color="white" alphaMap={cursorTexture} />
          </sprite>
        </>,
        virtualScene,
      )}
      <OrthographicCameraComponent ref={miniMapCamera} position={[0, 0, 0.1]} />
      <MinimapTexture buffer={buffer} />
    </>
  )
}
