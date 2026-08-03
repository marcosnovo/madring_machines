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
import type { PropsWithChildren } from 'react'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { AccelerateAudio, Boost, BoostAudio, BrakeAudio, Dust, EngineAudio, HonkAudio, Impact, Skid } from '../../effects'
import { cameraRig } from '../../effects/Cameras'
import { gamepad } from '../../controls/Gamepad'
import { touchInput } from '../../controls/Touch'
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

/**
 * How far the chase camera tilts down, radians (~6°).
 *
 * Height alone does not buy a view of the circuit. A camera raised straight up
 * with a level axis keeps the horizon pinned to the middle of the frame and
 * spends the extra elevation on foreground tarmac, so the band of road between
 * the car's airbox and the vanishing point — the only part a driver actually
 * reads a corner from — stays as thin as it was. Tilting down moves the
 * horizon up the frame and drops the car towards the lower third, which is
 * what opens that band: at the resting pose below it goes from roughly 40 px
 * to roughly 120 px on a 720p frame. Measured against screenshots at 0.115 and
 * 0.095 as well — the first floats the car small and distant, the second gives
 * most of the view back but not quite all of it.
 *
 * Applied to the chase camera only. First person is the driver's own eyeline
 * and must stay level, or the halo swallows the apex.
 *
 * Positive is down: the rotation is written in the camera's default XYZ Euler
 * order with y = PI, so R·(0,0,-1) works out to (0, -sin x, cos x).
 */
const CHASE_PITCH = 0.105

/** Half-spacing of the road probes that pitch/roll the car with the surface. */
const PROBE_LONG = 1.8
const PROBE_LAT = 0.8

export function Vehicle({ children }: PropsWithChildren<unknown>) {
  const [chassisBody, wheels] = useStore((s) => [s.chassisBody, s.wheels])

  let camera: Camera
  let i = 0
  let isBoosting = false
  let speed = 0
  let speedFactor = 0
  let swaySpeed = 0
  let swayTarget = 0
  // Everything the frame loop carries BETWEEN frames lives in one ref bag.
  // This component re-renders whenever the default camera flips (useThree
  // above selects it), and these used to be plain lets — so toggling the
  // camera mid-lap reset the sector checkpoints and voided the lap.
  const S = useRef({
    accumulator: 0,
    prevCamera: null as Camera | null,
    fov: tuning.fovBase,
    prevIdx: getPlayer().sampleIdx,
    swayValue: 0,
    swivel: 0,
    wheelSpin: [0, 0, 0, 0],
    // Lap bookkeeping, same semantics the old trigger walls had: a lap only
    // counts if both sector checkpoints were passed first.
    passed: [false, false],
    started: false,
  }).current

  useFrame((state, rawDelta) => {
    const delta = clampDelta(rawDelta)
    const player = getPlayer()
    const track = getTrackFrame()
    const t = tuning

    camera = getState().camera
    const controls = getState().controls

    // ---- fixed-step simulation -------------------------------------------
    // Keyboard, gamepad and touch are merged per channel: whichever asks for
    // more wins, and a moved stick or a dragged touch pad makes the steering
    // proportional (`analog`). Touch follows exactly the rule the gamepad
    // already had — it only takes over steering when the digital keys are
    // untouched, so nothing fights: at most one of gamepad/touch is ever
    // actually in a player's hands at once, but both stay live regardless.
    const keySteer = (controls.left ? 1 : 0) - (controls.right ? 1 : 0)
    const gamepadSteering = gamepad.connected && gamepad.steer !== 0
    const touchSteering = touchInput.steer !== 0
    const analogSteer = gamepadSteering ? gamepad.steer : touchSteering ? touchInput.steer : 0
    const padSteering = (gamepadSteering || touchSteering) && keySteer === 0
    const input = {
      steer: padSteering ? analogSteer : keySteer,
      analog: padSteering,
      throttle: Math.max(controls.forward ? 1 : 0, gamepad.throttle, touchInput.throttle),
      brake: Math.max(controls.backward ? 1 : 0, gamepad.brake, touchInput.brake),
      handbrake: controls.brake || gamepad.handbrake || touchInput.handbrake,
      boost: controls.boost || gamepad.boost || touchInput.boost,
    }
    S.accumulator += delta
    // Impacts are folded across the substeps of this render frame: on a phone
    // one frame can be four or five physics ticks, and a crash that is heard
    // and sparked once per tick is a machine-gun, not a crash. Hardest wins,
    // and the whole frame publishes exactly one event (see store's `impactSeq`).
    let frameImpact = 0
    let frameImpactCar = false
    while (S.accumulator >= FIXED_DT) {
      S.accumulator -= FIXED_DT
      // The race session steps the whole field — the player with this input
      // (held on the grid until lights-out), the AI cars with theirs — and
      // returns the player's events for the lap timing below.
      const events = getRace().stepAll(FIXED_DT, input, getState().ready)
      const hit = Math.max(events.wallHit, events.carHit)
      if (hit > frameImpact) {
        frameImpact = hit
        frameImpactCar = events.carHit >= events.wallHit
      }
      if (events.crossedSF > 0) {
        const now = Date.now()
        const { start } = getState()
        if (S.started && start && S.passed.every(Boolean)) {
          const lap = Math.max(now - start, 0)
          setState({ finished: lap })
          void insertScore({ name: 'You', time: lap })
        }
        S.started = true
        S.passed[0] = S.passed[1] = false
        setState({ start: now, _start: now })
      }
    }

    // ---- publish the frame's impact --------------------------------------
    // The world point is the contact the controller recorded (wall face, or
    // the midpoint of two cars), lifted to roughly bodywork height off the
    // measured surface — sparks fly from the panel, not from the tarmac.
    if (frameImpact > 0) {
      mutation.impact = frameImpact
      mutation.impactCar = frameImpactCar
      mutation.impactPoint[0] = player.impactX
      mutation.impactPoint[1] = surfaceY(track, player.impactX, player.impactZ, player.sampleIdx) + 0.35
      mutation.impactPoint[2] = player.impactZ
      mutation.impactSeq++
    }

    // ---- sector checkpoints ----------------------------------------------
    const N = track.N
    let dd = player.sampleIdx - S.prevIdx
    if (dd > N / 2) dd -= N
    if (dd < -N / 2) dd += N
    if (Math.abs(dd) > 40) {
      // teleport (reset key): resync without crossing anything
      S.passed[0] = S.passed[1] = false
    } else if (dd > 0) {
      for (let sector = 0; sector < 2; sector++) {
        const threshold = Math.round(((sector + 1) / 3) * N)
        const forward = (threshold - S.prevIdx + N) % N
        if (forward > 0 && forward <= dd) {
          S.passed[sector] = true
          getState().actions.onCheckpoint()
        }
      }
    }
    S.prevIdx = player.sampleIdx

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
        S.wheelSpin[i] += player.vehicle.wheels[i].omega * delta
        if (S.wheelSpin[i] > Math.PI * 2) S.wheelSpin[i] -= Math.PI * 2
        if (S.wheelSpin[i] < 0) S.wheelSpin[i] += Math.PI * 2
        wheel.rotation.y = i < 2 ? player.roadWheelAngle : 0
        wheel.rotation.x = S.wheelSpin[i]
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
    const cameraSwitched = S.prevCamera !== camera
    S.prevCamera = camera
    const steeringValue = player.roadWheelAngle
    if (camera !== 'BIRD_EYE') {
      if (camera === 'FIRST_PERSON') {
        // the driver's eye, just above the halo
        v.set((Math.sin(-steeringValue) * speed) / 40, 0.98, -0.35)
      } else {
        // Sideways lead into the corner, a little squat under power, and the
        // camera drawing *in* with speed rather than falling away from it.
        //
        // The 1.15 m / 5.2 m the height and distance used to be put the lens
        // level with the rear wing and close enough that the car's own bodywork
        // covered the road from its airbox up to the vanishing point — on a
        // phone, where the frame is only ~400 px tall, that left the circuit
        // essentially unreadable and was the owner's headline complaint. 2.45 m
        // and 7.1 m, with CHASE_PITCH above tilting the lens down, look over the
        // car rather than through it. The speed terms are unchanged: they are
        // feel, not framing, and they still lift and stretch the shot on top of
        // the new baseline.
        v.set((Math.sin(steeringValue) * speed) / 3.2, 2.45 - player.throttle * 0.12 + speedFactor * 0.35, -7.1 - speed / 28 + (controls.backward ? 0.9 : 0))
      }

      const cam = cameraRig.persp
      if (cam) {
        cam.position.lerp(v, cameraSwitched ? 1 : Math.min(1, delta * t.cameraEase))
        const swivelTarget = (-steeringValue * speed) / (camera === 'DEFAULT' ? 26 : 60)
        S.swivel = cameraSwitched ? swivelTarget : lerp(S.swivel, swivelTarget, Math.min(1, delta * 8))

        const fovTarget =
          camera === 'FIRST_PERSON' ? FOV_FIRST_PERSON + t.fovSpeed * 0.35 * speedFactor : t.fovBase + t.fovSpeed * speedFactor + (isBoosting ? t.fovBoost : 0)
        S.fov = cameraSwitched ? fovTarget : lerp(S.fov, fovTarget, Math.min(1, delta * (isBoosting ? FOV_EASE * 2.5 : FOV_EASE)))
        if (Math.abs(cam.fov - S.fov) > 0.01) {
          cam.fov = S.fov
          cam.updateProjectionMatrix()
        }

        // Sway + speed shake + wall-impact kick — written as a FULL rotation
        // set, y = PI included. Writing only x/z is how the camera stayed
        // facing backwards after the bird's-eye branch stomped y to 0.
        //
        // The chase tilt is the *base* of the x axis rather than a separate
        // write for the same reason: one `rotation.set` per frame, carrying
        // every axis, is the only shape that cannot leave a stale component
        // behind when the mode changes under it.
        //
        // These are the only two shake channels, and they are ROTATIONS of the
        // lens, not displacements of it — so how far back the camera sits
        // cannot change how much the frame moves. Apparent motion is
        // angle / fov × frame height, and raising the chase camera from
        // 1.15 m / 5.20 m to 2.45 m / 7.10 m touched neither term. Measured
        // headless over a 60 s flat-out lap (up to 310 km/h): `swayValue`
        // peaks at 5.92, i.e. 5.92/1000 rad = 0.34° of camera rotation at
        // 4.8 Hz — under two pixels on a 400 px phone frame at this fov. The
        // speed shake is not what a player feels; `kick` is. A saturated
        // impact puts 40/1000 rad = 2.29° in, seven times the speed shake,
        // which is the point of it and why it must only ever be raised by a
        // real contact (see race/contact.ts's HIT_FLOOR and the grid spacing
        // note in race/RaceSession.ts).
        swaySpeed = isBoosting ? 60 : 30
        swayTarget = (isBoosting ? speedFactor * 8 : speedFactor * 3) + t.shake * speedFactor * speedFactor * 4
        S.swayValue = isBoosting ? (speedFactor + 0.25) * 30 : MathUtils.lerp(S.swayValue, swayTarget, delta * 20)
        const kick = player.impactKick * 40
        const pitch = camera === 'FIRST_PERSON' ? 0 : CHASE_PITCH
        cam.rotation.set(
          pitch + (Math.sin(state.clock.elapsedTime * swaySpeed) / 1000) * (S.swayValue + kick),
          Math.PI,
          S.swivel + (Math.sin(state.clock.elapsedTime * swaySpeed * 0.9) / 1000) * (S.swayValue + kick),
        )
      }
    }
    // The bird's-eye camera needs no per-frame pose: its chassis-local
    // placement from Cameras.tsx never changes, and it is never stomped now
    // that this loop only ever writes cameraRig.persp.
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
      {/* Outside <Chassis>: sparks are world-space, at the point of contact,
          and must not ride along with the car that made them. */}
      <Impact />
    </group>
  )
}
