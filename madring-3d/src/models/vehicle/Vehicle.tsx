import { MathUtils, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import { useLayoutEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { RaycastVehicleProps, WheelInfoOptions } from '@react-three/cannon'
import { useRaycastVehicle } from '@react-three/cannon'

import { AccelerateAudio, Boost, BoostAudio, BrakeAudio, Dust, EngineAudio, HonkAudio, Skid } from '../../effects'
import type { Camera, Controls, WheelInfo } from '../../store'
import { getState, mutation, useStore } from '../../store'
import { useToggle } from '../../useToggle'
import { Chassis } from './Chassis'
import { Wheel } from './Wheel'
import { clampDelta } from '../../frame'

const { lerp } = MathUtils
const v = new Vector3()

/**
 * Chase-camera constants.
 *
 * A racing game sells speed with the camera, not with the speedometer. The
 * upstream chase camera did the opposite of what it needed to: it *pulled away*
 * as the car got faster (`-5 - speed / 15`, so 5 m behind at rest and 11 m
 * behind flat out), it ran at drei's default 50° field of view, and it eased
 * towards its target with `lerp(v, delta)` — a lerp factor of one frame-time,
 * which is a time constant of about a second. Steer, and the camera arrived
 * after the corner.
 *
 * Now: the camera closes up rather than backs off, the field of view opens with
 * speed and opens further under boost, and the easing is a real time constant.
 */
/** Field of view at a standstill, degrees. */
const FOV_BASE = 62
/** How much wider it gets at `maxSpeed`, degrees. */
const FOV_SPEED = 22
/** Extra on top of that while boosting, degrees. */
const FOV_BOOST = 9
/** Field of view for the first-person camera. Narrower than the chase camera's:
 *  the eye point sits inside the cabin, and much past this the roof and the A
 *  pillars eat the top third of the screen. */
const FOV_FIRST_PERSON = 68
/** Easing rate for the camera's position, 1/s. About a 0.14 s time constant. */
const CAMERA_EASE = 7
/** Easing rate for the field of view, 1/s. */
const FOV_EASE = 4

type DerivedWheelInfo = WheelInfo & Required<Pick<WheelInfoOptions, 'chassisConnectionPointLocal' | 'isFrontWheel'>>

export function Vehicle(props: any) {
  const defaultCamera = useThree((state) => state.camera)

  const { angularVelocity, children, position, rotation } = props
  const [chassisBody, vehicleConfig, wheelInfo, wheels] = useStore((s) => [s.chassisBody, s.vehicleConfig, s.wheelInfo, s.wheels])
  const { back, boostForce, boostSpeed, force, front, height, maxBrake, steer, steerSpeedFalloff, maxSpeed, width } = vehicleConfig

  const wheelInfos = wheels.map((_, index): DerivedWheelInfo => {
    const length = index < 2 ? front : back
    const sideMulti = index % 2 ? 0.5 : -0.5
    return {
      ...wheelInfo,
      chassisConnectionPointLocal: [width * sideMulti, height, length],
      isFrontWheel: Boolean(index % 2),
    }
  })

  const raycast: RaycastVehicleProps = {
    chassisBody,
    wheels,
    wheelInfos,
  }
  const [, api] = useRaycastVehicle(() => raycast, null, [wheelInfo])

  useLayoutEffect(() => api.sliding.subscribe((sliding) => (mutation.sliding = sliding)), [api])

  let camera: Camera
  let editor: boolean
  let controls: Controls
  let engineValue = 0
  let i = 0
  let isBoosting = false
  let speed = 0
  let speedFactor = 0
  let steerLimit = 0
  let steeringValue = 0
  let swaySpeed = 0
  let swayTarget = 0
  let swayValue = 0
  let swivel = 0
  let fov = FOV_BASE

  useFrame((state, rawDelta) => {
    const delta = clampDelta(rawDelta)

    camera = getState().camera
    editor = getState().editor
    controls = getState().controls
    speed = mutation.speed
    speedFactor = Math.min(1, speed / maxSpeed)

    isBoosting = controls.boost && mutation.boost > 0

    if (isBoosting) {
      mutation.boost = Math.max(mutation.boost - 1, 0)
    }

    engineValue = lerp(
      engineValue,
      controls.forward || controls.backward ? force * (controls.forward && !controls.backward ? (isBoosting ? -boostForce : -1) : 1) : 0,
      delta * 20,
    )

    // Speed-sensitive steering: full lock is for the hairpin, not the straight.
    steerLimit = steer * (1 - steerSpeedFalloff * speedFactor)
    steeringValue = lerp(steeringValue, controls.left || controls.right ? steerLimit * (controls.left && !controls.right ? 1 : -1) : 0, delta * 26)

    for (i = 2; i < 4; i++) api.applyEngineForce(speed < maxSpeed * (isBoosting ? boostSpeed : 1) ? engineValue : 0, i)
    for (i = 0; i < 2; i++) api.setSteeringValue(steeringValue, i)
    for (i = 2; i < 4; i++) api.setBrake(controls.brake ? (controls.forward ? maxBrake / 1.5 : maxBrake) : 0, i)

    if (!editor && camera !== 'BIRD_EYE') {
      if (camera === 'FIRST_PERSON') {
        // driver's eye: up against the windscreen, not in the middle of the cabin
        v.set(0.32 + (Math.sin(-steeringValue) * speed) / 30, 0.44, 0.35)
      } else {
        // sideways lead into the corner, a little squat under power, and the
        // camera drawing *in* with speed rather than falling away from it
        v.set((Math.sin(steeringValue) * speed) / 3.2, 1.15 - (engineValue / force) * 0.12 + speedFactor * 0.35, -5.2 - speed / 28 + (controls.brake ? 0.9 : 0))
      }

      // ctrl.left-ctrl.right, up-down, near-far
      defaultCamera.position.lerp(v, Math.min(1, delta * CAMERA_EASE))

      // ctrl.left-ctrl.right swivel
      swivel = lerp(swivel, (-steeringValue * speed) / (camera === 'DEFAULT' ? 26 : 60), Math.min(1, delta * 8))

      if ((defaultCamera as PerspectiveCamera).isPerspectiveCamera) {
        fov = lerp(
          fov,
          camera === 'FIRST_PERSON' ? FOV_FIRST_PERSON + FOV_SPEED * 0.35 * speedFactor : FOV_BASE + FOV_SPEED * speedFactor + (isBoosting ? FOV_BOOST : 0),
          Math.min(1, delta * FOV_EASE),
        )
        const perspective = defaultCamera as PerspectiveCamera
        if (Math.abs(perspective.fov - fov) > 0.01) {
          perspective.fov = fov
          perspective.updateProjectionMatrix()
        }
      }
    }

    // Camera sway. Assigned, not accumulated: `+=` random-walks the camera's
    // pitch away from level whenever the frame rate is uneven.
    //
    // Not applied to the bird's-eye camera. It looks straight down, and this
    // block used to write `rotation.x` unconditionally, which threw away the
    // -90° pitch the camera is declared with and left the overhead view
    // pointing at the horizon — a screen of sky and fog.
    if (!editor && camera === 'BIRD_EYE') {
      defaultCamera.rotation.set(-Math.PI / 2, 0, Math.PI)
    } else if (!editor) {
      swaySpeed = isBoosting ? 60 : 30
      swayTarget = isBoosting ? speedFactor * 8 : speedFactor * 3
      swayValue = isBoosting ? (speedFactor + 0.25) * 30 : MathUtils.lerp(swayValue, swayTarget, delta * (isBoosting ? 10 : 20))
      defaultCamera.rotation.z = swivel + (Math.sin(state.clock.elapsedTime * swaySpeed * 0.9) / 1000) * swayValue
      defaultCamera.rotation.x = (Math.sin(state.clock.elapsedTime * swaySpeed) / 1000) * swayValue
    }

    if (chassisBody.current) {
      // lean chassis
      chassisBody.current.children[0].rotation.z = MathUtils.lerp(chassisBody.current.children[0].rotation.z, (-steeringValue * speed) / 200, delta * 4)

      // Vibrations
      chassisBody.current.children[0].rotation.x = (Math.sin(state.clock.getElapsedTime() * 20) * speedFactor) / 100
      chassisBody.current.children[0].rotation.z = (Math.cos(state.clock.getElapsedTime() * 20) * speedFactor) / 100
    }
  })

  const ToggledAccelerateAudio = useToggle(AccelerateAudio, ['ready', 'sound'])
  const ToggledEngineAudio = useToggle(EngineAudio, ['ready', 'sound'])

  return (
    <group>
      <Chassis ref={chassisBody} {...{ angularVelocity, position, rotation }}>
        <ToggledAccelerateAudio />
        <BoostAudio />
        <BrakeAudio />
        <ToggledEngineAudio />
        <HonkAudio />
        <Boost />
        {children}
      </Chassis>
      <>
        {wheels.map((wheel, index) => (
          <Wheel ref={wheel} leftSide={!(index % 2)} key={index} />
        ))}
      </>
      <Dust />
      <Skid />
    </group>
  )
}
