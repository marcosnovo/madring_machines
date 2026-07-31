/**
 * The player vehicle: input → analytic car model → visual pose.
 *
 * There is no physics engine here any more. The car is the four-corner
 * analytic model in src/vehicle/ (adapted from APEX FORMULA 2026 — see the
 * headers there and NOTICE), stepped at a fixed 60 Hz from this component's
 * frame loop. The model lives in the track frame (distance along the measured
 * centreline, lateral offset, heading); this component turns that into the
 * chassis group's world transform, spins and steers the wheels, files lap and
 * sector times, and drives the chase camera.
 *
 * The camera is most of what makes the car feel fast: the field of view opens
 * with speed and punches wider under boost, the camera closes up rather than
 * backing away, and a speed shake + wall-impact kick ride on top. All of its
 * constants are live-tunable from the leva panel (`.` — src/vehicle/tuning).
 */
import { MathUtils, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import type { PropsWithChildren } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import { AccelerateAudio, Boost, BoostAudio, BrakeAudio, Dust, EngineAudio, HonkAudio, Skid } from '../../effects'
import { gamepad } from '../../controls/Gamepad'
import type { Camera } from '../../store'
import { getState, mutation, setState, useStore } from '../../store'
import { useToggle } from '../../useToggle'
import { getPlayer } from '../../vehicle/CarController'
import { getRace } from '../../race/RaceSession'
import { tuning } from '../../vehicle/tuning'
import { getTrackFrame, surfaceY } from '../../circuit/trackFrame'
import { insertScore } from '../../data'
import { Chassis } from './Chassis'
import { clampDelta } from '../../frame'

const { lerp } = MathUtils
const v = new Vector3()

const FIXED_DT = 1 / 60
/** Field of view for the first-person (halo) camera. */
const FOV_FIRST_PERSON = 68
/** Easing rate for the field of view, 1/s. */
const FOV_EASE = 4

/** Half-spacing of the road probes that pitch/roll the car with the surface. */
const PROBE_LONG = 1.8
const PROBE_LAT = 0.8

export function Vehicle({ children }: PropsWithChildren<unknown>) {
  const defaultCamera = useThree((state) => state.camera)
  const [chassisBody, wheels] = useStore((s) => [s.chassisBody, s.wheels])

  let accumulator = 0
  let camera: Camera
  let prevCamera: Camera | null = null
  let fov = tuning.fovBase
  let i = 0
  let isBoosting = false
  let prevIdx = getPlayer().sampleIdx
  let speed = 0
  let speedFactor = 0
  let swaySpeed = 0
  let swayTarget = 0
  let swayValue = 0
  let swivel = 0
  const wheelSpin = [0, 0, 0, 0]
  // Lap bookkeeping, same semantics the old trigger walls had: a lap only
  // counts if both sector checkpoints were passed first.
  const passed = [false, false]
  let started = false

  useFrame((state, rawDelta) => {
    const delta = clampDelta(rawDelta)
    const player = getPlayer()
    const track = getTrackFrame()
    const t = tuning

    camera = getState().camera
    const controls = getState().controls

    // ---- fixed-step simulation -------------------------------------------
    // Keyboard and gamepad are merged per channel: whichever asks for more
    // wins, and a moved stick makes the steering proportional (`analog`).
    const keySteer = (controls.left ? 1 : 0) - (controls.right ? 1 : 0)
    const padSteering = gamepad.connected && gamepad.steer !== 0 && keySteer === 0
    const input = {
      steer: padSteering ? gamepad.steer : keySteer,
      analog: padSteering,
      throttle: Math.max(controls.forward ? 1 : 0, gamepad.throttle),
      brake: Math.max(controls.backward ? 1 : 0, gamepad.brake),
      handbrake: controls.brake || gamepad.handbrake,
      boost: controls.boost || gamepad.boost,
    }
    accumulator += delta
    while (accumulator >= FIXED_DT) {
      accumulator -= FIXED_DT
      // The race session steps the whole field — the player with this input
      // (held on the grid until lights-out), the AI cars with theirs — and
      // returns the player's events for the lap timing below.
      const events = getRace().stepAll(FIXED_DT, input, getState().ready)
      if (events.wallHit > 0) mutation.wallHit = Math.max(mutation.wallHit, events.wallHit)
      if (events.crossedSF > 0) {
        const now = Date.now()
        const { start } = getState()
        if (started && start && passed.every(Boolean)) {
          const lap = Math.max(now - start, 0)
          setState({ finished: lap })
          void insertScore({ name: 'You', time: lap })
        }
        started = true
        passed[0] = passed[1] = false
        setState({ start: now, _start: now })
      }
    }

    // ---- sector checkpoints ----------------------------------------------
    const N = track.N
    let dd = player.sampleIdx - prevIdx
    if (dd > N / 2) dd -= N
    if (dd < -N / 2) dd += N
    if (Math.abs(dd) > 40) {
      // teleport (reset key): resync without crossing anything
      passed[0] = passed[1] = false
    } else if (dd > 0) {
      for (let sector = 0; sector < 2; sector++) {
        const threshold = Math.round(((sector + 1) / 3) * N)
        const forward = (threshold - prevIdx + N) % N
        if (forward > 0 && forward <= dd) {
          passed[sector] = true
          getState().actions.onCheckpoint()
        }
      }
    }
    prevIdx = player.sampleIdx

    // ---- shared telemetry -------------------------------------------------
    speed = player.speed
    speedFactor = Math.min(1, speed / getState().vehicleConfig.maxSpeed)
    isBoosting = player.boosting
    mutation.speed = speed
    mutation.boost = player.battery * 100
    mutation.rpmTarget = player.rpmFrac * 0.9
    mutation.sliding = player.slip || Math.abs(player.velocityLat) > 2 || (controls.brake && speed > 8)
    mutation.velocity[0] = Math.sin(player.heading) * player.v
    mutation.velocity[1] = 0
    mutation.velocity[2] = Math.cos(player.heading) * player.v

    // ---- world pose -------------------------------------------------------
    const body = chassisBody.current
    if (body) {
      const sy = surfaceY(track, player.x, player.z, player.sampleIdx)
      const sinH = Math.sin(player.heading)
      const cosH = Math.cos(player.heading)
      // road pitch/roll from four surface probes around the car
      const yF = surfaceY(track, player.x + sinH * PROBE_LONG, player.z + cosH * PROBE_LONG, player.sampleIdx)
      const yB = surfaceY(track, player.x - sinH * PROBE_LONG, player.z - cosH * PROBE_LONG, player.sampleIdx)
      const yL = surfaceY(track, player.x + cosH * PROBE_LAT, player.z - sinH * PROBE_LAT, player.sampleIdx)
      const yR = surfaceY(track, player.x - cosH * PROBE_LAT, player.z + sinH * PROBE_LAT, player.sampleIdx)
      body.position.set(player.x, sy + 0.02, player.z)
      body.rotation.order = 'YXZ'
      body.rotation.set(-Math.atan2(yF - yB, 2 * PROBE_LONG), player.heading, Math.atan2(yL - yR, 2 * PROBE_LAT))

      // wheels: steer (front) + spin, written exactly as the reference does
      for (i = 0; i < 4; i++) {
        const wheel = wheels[i].current
        if (!wheel) continue
        wheelSpin[i] += player.vehicle.wheels[i].omega * delta
        if (wheelSpin[i] > Math.PI * 2) wheelSpin[i] -= Math.PI * 2
        if (wheelSpin[i] < 0) wheelSpin[i] += Math.PI * 2
        wheel.rotation.y = i < 2 ? player.roadWheelAngle : 0
        wheel.rotation.x = wheelSpin[i]
      }
    }

    // ---- chase / first-person camera --------------------------------------
    // A camera *switch* is a cut, not a glide: the chase-lag lerp below runs
    // at delta*cameraEase per frame, so at low frame rates (where delta is
    // clamped to 1/30 but wall time runs on) the first-person pose could take
    // seconds of real time to arrive — long enough that cycling `C` appeared
    // to skip the cockpit camera entirely and show two chase views. On a mode
    // change the camera teleports to the new mode's pose this frame; the
    // easing only smooths motion *within* a mode.
    const cameraSwitched = prevCamera !== camera
    prevCamera = camera
    const steeringValue = player.roadWheelAngle
    if (camera !== 'BIRD_EYE') {
      if (camera === 'FIRST_PERSON') {
        // the driver's eye, just above the halo
        v.set((Math.sin(-steeringValue) * speed) / 40, 0.98, -0.35)
      } else {
        // sideways lead into the corner, a little squat under power, and the
        // camera drawing *in* with speed rather than falling away from it
        v.set(
          (Math.sin(steeringValue) * speed) / 3.2,
          1.15 - player.throttle * 0.12 + speedFactor * 0.35,
          -5.2 - speed / 28 + (controls.backward ? 0.9 : 0),
        )
      }

      defaultCamera.position.lerp(v, cameraSwitched ? 1 : Math.min(1, delta * t.cameraEase))
      const swivelTarget = (-steeringValue * speed) / (camera === 'DEFAULT' ? 26 : 60)
      swivel = cameraSwitched ? swivelTarget : lerp(swivel, swivelTarget, Math.min(1, delta * 8))

      if ((defaultCamera as PerspectiveCamera).isPerspectiveCamera) {
        const fovTarget =
          camera === 'FIRST_PERSON' ? FOV_FIRST_PERSON + t.fovSpeed * 0.35 * speedFactor : t.fovBase + t.fovSpeed * speedFactor + (isBoosting ? t.fovBoost : 0)
        fov = cameraSwitched ? fovTarget : lerp(fov, fovTarget, Math.min(1, delta * (isBoosting ? FOV_EASE * 2.5 : FOV_EASE)))
        const perspective = defaultCamera as PerspectiveCamera
        if (Math.abs(perspective.fov - fov) > 0.01) {
          perspective.fov = fov
          perspective.updateProjectionMatrix()
        }
      }
    }

    // Camera sway + speed shake + wall-impact kick. Assigned, not accumulated.
    // Not applied to the bird's-eye camera, which looks straight down.
    if (camera === 'BIRD_EYE') {
      defaultCamera.rotation.set(-Math.PI / 2, 0, Math.PI)
    } else {
      swaySpeed = isBoosting ? 60 : 30
      swayTarget = (isBoosting ? speedFactor * 8 : speedFactor * 3) + t.shake * speedFactor * speedFactor * 4
      swayValue = isBoosting ? (speedFactor + 0.25) * 30 : MathUtils.lerp(swayValue, swayTarget, delta * 20)
      const kick = player.impactKick * 40
      defaultCamera.rotation.z = swivel + (Math.sin(state.clock.elapsedTime * swaySpeed * 0.9) / 1000) * (swayValue + kick)
      defaultCamera.rotation.x = (Math.sin(state.clock.elapsedTime * swaySpeed) / 1000) * (swayValue + kick)
    }
  })

  const ToggledAccelerateAudio = useToggle(AccelerateAudio, ['ready', 'sound'])
  const ToggledEngineAudio = useToggle(EngineAudio, ['ready', 'sound'])

  return (
    <group>
      <Chassis ref={chassisBody}>
        <ToggledAccelerateAudio />
        <BoostAudio />
        <BrakeAudio />
        <ToggledEngineAudio />
        <HonkAudio />
        <Boost />
        {children}
      </Chassis>
      <Dust />
      <Skid />
    </group>
  )
}
