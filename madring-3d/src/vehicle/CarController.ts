/*
 * The car: powertrain, brakes, aero, steering shaping, analytic walls and lap
 * progress, on top of the four-corner dynamics in ./dynamics.ts.
 *
 * Adapted from APEX FORMULA 2026 — js/physics.js (CarPhysics), js/controls.js
 * (digital steering shaping) and js/contact.js (car footprint constants).
 *   Copyright 2026 Avi Hacker, J.D.
 *   https://github.com/ahacker-1/apex-formula-2026
 *   Licensed under the Apache License, Version 2.0; see
 *   ../../LICENSES/apex-formula-2026-Apache-2.0.txt. Distributed on an "AS IS"
 *   BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 *
 * CHANGES from the original (per Apache-2.0 §4(b)): translated to TypeScript
 * and re-targeted at this project's measured circuit (src/circuit/trackFrame),
 * whose corridor width differs per side and per sample — the wall constraint
 * therefore clamps against per-sample left/right limits instead of a constant
 * wallOff. Removed: tyre compounds/wear/thermals, fuel, ERS modes, dirty air,
 * slipstream, off-track surfaces (this corridor is asphalt wall to wall),
 * brake-disc heat and the AI/race hooks. Added: the boost gauge (Manual
 * Override drains it, braking harvests it), a handbrake input, and live
 * tuning of power/grip/aero/steering through ../vehicle/tuning. The gearbox,
 * the speed-dependent steering clamp, TC/ABS, the active-aero X-mode and the
 * analytic wall impact response are Apex's.
 */
import type { TrackFrame } from '../circuit/trackFrame'
import { getTrackFrame, lateralAt, nearestSample } from '../circuit/trackFrame'
import type { Surface, VehicleState } from './dynamics'
import { bodyToWorldVelocity, createVehicleState, resetVehicleState, setBodyVelocityFromWorld, stepVehicleDynamics } from './dynamics'
import type { Tuning } from './tuning'
import { tuning } from './tuning'

const G = 9.81
const RHO = 1.2

/** Car footprint, metres — the formula car is ~2.0 x 5.0. */
export const CAR_HALF_LENGTH = 2.48
export const CAR_HALF_WIDTH = 0.99

/** Per-gear top speeds (m/s): 8-speed. Top 96.5 m/s = 347 km/h. */
export const GEAR_TOP = [0, 27.5, 37, 46.5, 56, 65.5, 75, 85.5, 96.5]

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))

export function maxSteerAngle(v: number, t: Tuning = tuning): number {
  return Math.min(t.steerMax, t.steerLow + t.steerGain / (1 + Math.abs(v) * t.steerFalloff))
}

/**
 * Binary keys must not request full lock at 180-300 km/h. Low-speed authority
 * is retained for hairpins and recovery.
 */
export function digitalSteeringLimit(speed: number): number {
  const velocity = Math.abs(Number.isFinite(speed) ? speed : 0)
  return clamp(1.15 - velocity * 0.0105, 0.42, 1)
}

/**
 * Rate-limited digital steering input, from Apex's controls.js. The attack and
 * centre-return rates are live-tunable (leva → Steering): the shipped defaults
 * attack a little faster than the reference and return to centre much faster,
 * which is most of what "crisp" keyboard steering is.
 */
export function advanceSteeringInput(current: number, target: number, speed: number, dt: number, t: Tuning = tuning): number {
  const from = clamp(Number.isFinite(current) ? current : 0, -1, 1)
  const to = clamp(Number.isFinite(target) ? target : 0, -1, 1)
  const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 1)
  const velocity = Math.abs(Number.isFinite(speed) ? speed : 0)
  let rate: number
  if (to !== 0) {
    rate = t.steerAttack / (1 + velocity * 0.01)
    // decisive crossover through chicanes and corrections
    if (from * to < 0) rate *= 1.25
  } else {
    rate = t.steerReturn / (1 + velocity * 0.006)
  }
  const next = from + (to - from) * Math.min(1, rate * step)
  return Math.abs(next) < 1e-5 ? 0 : clamp(next, -1, 1)
}

/** How fast an analog (gamepad) steer request is followed, 1/s. */
const ANALOG_STEER_RATE = 22

export function wallSupportDistance(relativeHeading: number): number {
  return CAR_HALF_WIDTH * Math.abs(Math.cos(relativeHeading)) + CAR_HALF_LENGTH * Math.abs(Math.sin(relativeHeading))
}

export function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

export interface CarInput {
  /** -1..1, +1 turns left. Digital: held keys, shaped internally. */
  steer: number
  throttle: number
  brake: number
  handbrake: boolean
  boost: boolean
  /**
   * True when `steer` is a proportional (gamepad stick) request: the binary
   * key limiter and the attack/return shaping are bypassed and the stick is
   * followed near-directly — the physical speed-dependent wheel clamp
   * (`maxSteerAngle`) still applies.
   */
  analog?: boolean
}

export interface StepEvents {
  /** +1 crossed start/finish forward, -1 backward, 0 otherwise. */
  crossedSF: number
  /** One-tick wall impact intensity 0..1, 0 when none. */
  wallHit: number
  /**
   * One-tick car-vs-car impact intensity 0..1, 0 when none. Filled in by the
   * race session AFTER the step, because contacts are resolved once for the
   * whole field (src/race/contact.ts) rather than inside any one car's step.
   */
  carHit: number
}

const ATT_MAX = 0.045
const ATT_SNAP = 1e-4

export class CarController {
  readonly track: TrackFrame
  readonly vehicle: VehicleState

  x = 0
  z = 0
  heading = 0
  steer = 0
  roadWheelAngle = 0
  throttle = 0
  brake = 0
  gear = 1
  rpmFrac = 0.2
  /** Boost / Manual Override energy, 0..1. Braking harvests it back. */
  battery = 1
  boosting = false
  aeroX = false
  downforce = 0
  sampleIdx = 0
  lat = 0
  totalDist = 0
  slip = false
  wallHit = 0
  wallContact = false
  wallScrape = 0
  /** One-tick car-vs-car impact 0..1, written by ../race/contact.ts. */
  contactHit = 0
  /**
   * Seconds left before another car-vs-car contact may be CHARGED (severity,
   * kick, sparks, scrub). Counted down here, set by ../race/contact.ts; see
   * its CONTACT_REFRACTORY for why one shunt is one charge.
   */
  contactCool = 0
  impactKick = 0
  /**
   * Planar world point of the most recent contact — the wall face under a
   * scrape, or the midpoint between two touching cars. The sparks come out of
   * here, so it has to be the *contact*, not the car's centre: a shower coming
   * off the middle of the chassis reads as an explosion, one coming off the
   * left sidepod reads as a wall you just clipped.
   */
  impactX = 0
  impactZ = 0
  /** Visual body attitude, radians / metres. Never fed back into dynamics. */
  pitch = 0
  roll = 0

  private _xTimer = 0
  private _shiftCooldown = 0
  private _wallIncidentSide = 0
  private progressBase = 0
  private _lapFloor = 0
  private readonly surface: Surface = { grade: 0, camber: 0, grip: 1 }
  private readonly worldVelocity = { x: 0, z: 0 }

  constructor(track: TrackFrame = getTrackFrame()) {
    this.track = track
    this.vehicle = createVehicleState()
    this.placeAt(track.gridIndex)
  }

  get v(): number {
    return this.vehicle.velocityLong
  }
  get velocityLat(): number {
    return this.vehicle.velocityLat
  }
  get yawRate(): number {
    return this.vehicle.yawRate
  }
  get sideslip(): number {
    return this.vehicle.sideslip
  }
  get speed(): number {
    return Math.hypot(this.vehicle.velocityLong, this.vehicle.velocityLat)
  }
  /** Continuous race progress: metres from the lap origin, laps included. */
  get progress(): number {
    return this.totalDist + this.progressBase
  }

  /** Put the car on the centreline at a sample, at rest, facing forward. */
  placeAt(index: number): void {
    const s = this.track.samples[index]
    this.x = s.x
    this.z = s.z
    this.heading = Math.atan2(s.tx, s.tz)
    this.sampleIdx = index
    this.lat = 0
    resetVehicleState(this.vehicle, 0)
    this.steer = 0
    this.roadWheelAngle = 0
    this.gear = 1
    this.totalDist = 0
    this.progressBase = index * this.track.ds
    this._lapFloor = 0
    this._wallIncidentSide = 0
    this.wallContact = false
    this.wallScrape = 0
    this.wallHit = 0
    this.contactHit = 0
    this.contactCool = 0
    this.impactKick = 0
    this.pitch = 0
    this.roll = 0
  }

  /** The `R` key: back on the centreline nearest to wherever you ended up. */
  resetToNearest(): void {
    const index = nearestSample(this.track, this.x, this.z, this.sampleIdx)
    this.placeAt(index)
    this.battery = 1
  }

  step(dt: number, input: CarInput): StepEvents {
    const t = tuning
    const c = this.track
    const m = t.mass
    const events: StepEvents = { crossedSF: 0, wallHit: 0, carHit: 0 }

    // ---- input shaping ----------------------------------------------------
    if (input.analog) {
      const target = clamp(input.steer, -1, 1)
      this.steer = clamp(this.steer + (target - this.steer) * Math.min(1, dt * ANALOG_STEER_RATE), -1, 1)
    } else {
      const steerLimit = digitalSteeringLimit(this.v)
      this.steer = advanceSteeringInput(this.steer, clamp(input.steer, -1, 1) * steerLimit, this.v, dt, t)
    }
    this.throttle = clamp(input.throttle, 0, 1)
    this.brake = clamp(input.brake, 0, 1)
    this.slip = false
    this.wallHit = 0
    this.wallScrape = 0
    // Cleared here rather than in contact.ts: the race session resolves
    // contacts AFTER every car has stepped, so "cleared at the top of the
    // step, read at the bottom of the tick" is the only ordering in which a
    // contact survives exactly one tick and is seen by exactly one reader.
    this.contactHit = 0
    this.contactCool = Math.max(0, this.contactCool - dt)
    this.impactKick *= Math.max(0, 1 - dt * 8)

    const sample = c.samples[this.sampleIdx]
    this.surface.grade = sample.grade
    this.surface.camber = sample.camber
    this.surface.grip = 1

    // ---- active aero (X-mode on straights, Z-mode in corners) -------------
    const speed = this.speed
    const xEligible = Math.abs(this.steer) < 0.12 && speed > 50 && this.throttle > 0.6 && this.brake < 0.05
    this._xTimer = xEligible ? this._xTimer + dt : 0
    this.aeroX = this._xTimer > 0.35
    const cda = this.aeroX ? t.cdaX : t.cdaZ
    const cla = this.aeroX ? t.claX : t.claZ
    const downF = 0.5 * RHO * cla * speed * speed
    this.downforce = downF
    const mu = t.mu

    // ---- gears / rpm ------------------------------------------------------
    this._shiftCooldown -= dt
    const top = GEAR_TOP[this.gear]
    this.rpmFrac = clamp(Math.max(0, this.v) / top, 0.18, 1.04)
    if (t.autoGear && this._shiftCooldown <= 0) {
      if (this.rpmFrac > 0.97 && this.gear < 8) {
        this.gear++
        this._shiftCooldown = 0.25
      } else if (this.rpmFrac < 0.58 && this.gear > 1) {
        this.gear--
        this._shiftCooldown = 0.2
      }
    }

    // ---- steering clamp and powertrain demand -----------------------------
    const delta = this.steer * maxSteerAngle(this.v, t)
    this.roadWheelAngle = delta
    let pf = clamp(0.35 + this.rpmFrac * 0.75, 0, 1.05)
    if (this.rpmFrac > 1.0) pf *= 0.55 // limiter
    let power = t.power * pf
    this.boosting = !!input.boost && this.battery > 0.04 && this.throttle > 0.5
    if (this.boosting) {
      power += t.boostPower
      this.battery = Math.max(0, this.battery - dt * 0.16)
    }
    let fDrive = (this.throttle * power) / Math.max(Math.abs(this.v), 5.5)
    const rearSlip = Math.max(Math.abs(this.vehicle.wheels[2].slipRatio), Math.abs(this.vehicle.wheels[3].slipRatio))
    if (t.tc && rearSlip > 0.11) fDrive *= clamp(1.7 - rearSlip * 6, 0.18, 1)

    let fBrake = 0
    if (this.brake > 0 && this.v > 0) {
      const brakeMax = mu * (m * G + downF)
      fBrake = this.brake * brakeMax
      const w = this.vehicle.wheels
      const lockSlip = Math.min(w[0].slipRatio, w[1].slipRatio, w[2].slipRatio, w[3].slipRatio)
      if (t.abs && lockSlip < -0.14) fBrake *= clamp(1.65 + lockSlip * 5, 0.2, 1)
      if (!t.abs && this.brake > 0.96 && this.v > 12) this.slip = true
      this.battery = Math.min(1, this.battery + dt * 0.11 * this.brake) // harvest
    } else if (this.throttle < 0.3) {
      this.battery = Math.min(1, this.battery + dt * 0.015)
    }
    const fDrag = 0.5 * RHO * cda * speed * speed + t.rollDrag + 3.5 * speed

    // ---- four-wheel dynamics, substepped ----------------------------------
    const engineBrake = this.throttle < 0.12 && this.v > 2 ? 0.055 * m * G * (1 - this.throttle / 0.12) : 0
    const substeps = Math.max(1, Math.ceil(dt * 60 - 1e-9))
    const h = dt / substeps
    const params = {
      mass: m,
      steerAngle: delta,
      driveForce: fDrive,
      brakeForce: fBrake,
      engineBrakeForce: engineBrake,
      handbrakeForce: input.handbrake ? t.handbrakeForce : 0,
      rearGripScale: input.handbrake ? t.handbrakeGrip : 1,
      // The drift key also releases the electronic straitjacket: no lateral
      // damping and only a sliver of the desired-yaw controller, so the rear
      // can come around and stay out until the key is released.
      yawDampingScale: input.handbrake ? 0.18 : 1,
      brakeBias: 0.56,
      diffLock: 0.45,
      abs: t.abs,
      tc: t.tc && !input.handbrake,
      stabilityAssist: t.stability && !input.handbrake,
      downforce: downF,
      aeroBalance: 0.45,
      externalForceLong: -fDrag * Math.sign(this.v || 1),
      mu,
      yawInertia: t.yawInertia,
      cornerStiffness: t.cornerStiffness,
      frontCornerScale: t.frontCornerScale,
      surface: this.surface,
    }
    for (let sub = 0; sub < substeps; sub++) {
      const dynamics = stepVehicleDynamics(this.vehicle, params, h)
      this.slip ||= dynamics.slip
      this.heading += this.vehicle.yawRate * h
      bodyToWorldVelocity(this.vehicle, this.heading, this.worldVelocity)
      this.x += this.worldVelocity.x * h
      this.z += this.worldVelocity.z * h
    }

    // Reverse is the established recovery control: hold brake at rest.
    if (this.v <= 0.15 && this.brake > 0.5 && this.throttle < 0.1) {
      this.vehicle.velocityLong = Math.max(this.v - 6 * dt, -6)
      for (const wheel of this.vehicle.wheels) wheel.omega = this.vehicle.velocityLong / wheel.radius
    } else if (this.v < 0 && this.brake < 0.3) {
      this.vehicle.velocityLong = Math.min(this.v + 8 * dt, 0)
    }

    // ---- track relation, walls, progress ----------------------------------
    const prevIdx = this.sampleIdx
    events.wallHit = this.resolveWallCollision()
    this._stepAttitude(dt, t)

    let dd = this.sampleIdx - prevIdx
    if (dd > c.N / 2) dd -= c.N
    if (dd < -c.N / 2) dd += c.N
    this.totalDist += dd * c.ds
    const prog = this.totalDist + this.progressBase
    const lapFloor = Math.floor(prog / c.length)
    if (lapFloor !== this._lapFloor) {
      events.crossedSF = lapFloor > this._lapFloor ? 1 : -1
      this._lapFloor = lapFloor
    }
    return events
  }

  /**
   * Yaw-aware footprint against the measured corridor's walls. The contact is
   * decomposed in wall space so tangent progress survives a graze while the
   * outward component becomes a small inward separation velocity. Unlike the
   * reference, the limit differs per side and per sample: the corridor is the
   * measured asphalt, and the wall stands 0.8 m outside whichever edge.
   */
  resolveWallCollision(): number {
    const c = this.track
    this.sampleIdx = nearestSample(c, this.x, this.z, this.sampleIdx)
    const s = c.samples[this.sampleIdx]
    this.lat = lateralAt(c, this.x, this.z, this.sampleIdx)
    const trackAng = Math.atan2(s.tx, s.tz)
    const support = wallSupportDistance(angleDiff(this.heading, trackAng))
    const limPos = Math.max(0.1, s.wallPos - support)
    const limNeg = Math.max(0.1, s.wallNeg - support)

    const inside = this.lat <= limPos && this.lat >= -limNeg
    if (inside) {
      const clearance = Math.min(limPos - this.lat, this.lat + limNeg)
      if (this._wallIncidentSide && clearance > 0.25) {
        this._wallIncidentSide = 0
        this.wallContact = false
      } else {
        this.wallContact = this._wallIncidentSide !== 0
      }
      this.wallScrape = 0
      return 0
    }

    const side = this.lat > limPos ? 1 : -1
    const lim = side > 0 ? limPos : limNeg
    const newIncident = this._wallIncidentSide !== side
    this._wallIncidentSide = side
    this.wallContact = true

    // Correct only along the wall normal, never deleting along-track progress.
    const dx = this.x - s.x
    const dz = this.z - s.z
    const along = dx * s.tx + dz * s.tz
    this.x = s.x + s.tx * along + s.nx * side * lim
    this.z = s.z + s.tz * along + s.nz * side * lim
    this.lat = lateralAt(c, this.x, this.z, this.sampleIdx)
    // The wall face itself: the clamp holds the car's *centre* `support`
    // metres inside it, so that is exactly how far out the bodywork is
    // touching. Sparks are emitted from here.
    this.impactX = this.x + s.nx * side * support
    this.impactZ = this.z + s.nz * side * support

    const oldSign = this.v < 0 ? -1 : 1
    bodyToWorldVelocity(this.vehicle, this.heading, this.worldVelocity)
    const vx = this.worldVelocity.x
    const vz = this.worldVelocity.z
    const tangentVelocity = vx * s.tx + vz * s.tz
    const normalVelocity = vx * s.nx + vz * s.nz
    const outwardSpeed = Math.max(0, normalVelocity * side)

    if (outwardSpeed > 0) {
      const tangentRetention = clamp(0.96 - outwardSpeed * 0.005, 0.72, 0.94)
      const tangentAfter = tangentVelocity * tangentRetention
      // Restitution must never accelerate a crawling car.
      const separationSpeed = Math.min(6, outwardSpeed * 0.12)
      const normalAfter = -side * separationSpeed
      const nextVx = s.tx * tangentAfter + s.nx * normalAfter
      const nextVz = s.tz * tangentAfter + s.nz * normalAfter
      const retainedBeta = clamp(this.sideslip || 0, -0.02, 0.02)
      this.heading = Math.atan2(nextVx * oldSign, nextVz * oldSign) - retainedBeta
      setBodyVelocityFromWorld(this.vehicle, this.heading, nextVx, nextVz)
    }

    this.wallScrape = clamp((Math.abs(tangentVelocity) - 3) / 45, 0, 1) * clamp(1 - outwardSpeed / 22, 0.18, 1)

    if (newIncident && outwardSpeed > 2) {
      const intensity = clamp(0.15 + outwardSpeed / 45, 0, 1)
      this.wallHit = Math.max(this.wallHit, intensity)
      this.impactKick = Math.max(this.impactKick, intensity)
      return intensity
    }
    return 0
  }

  /** Visual-only body attitude: dive, squat, roll. Nothing feeds back. */
  private _stepAttitude(dt: number, t: Tuning): void {
    const aLong = this.vehicle.accelLong
    const aLat = this.vehicle.yawRate * this.v
    const still = Math.abs(this.v) < 0.5
    // rotation.x positive pitches the nose down: braking (aLong < 0) dives.
    const pitchT = still ? 0 : clamp(-aLong * t.attPitch, -ATT_MAX, ATT_MAX)
    // rotation.z positive lifts the car's left: a left turn (aLat > 0) leans right.
    const rollT = still ? 0 : clamp(aLat * t.attRoll, -ATT_MAX, ATT_MAX)
    this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 7)
    this.roll += (rollT - this.roll) * Math.min(1, dt * 6)
    if (Math.abs(this.pitch) < ATT_SNAP) this.pitch = 0
    if (Math.abs(this.roll) < ATT_SNAP) this.roll = 0
  }
}

let player: CarController | null = null

/** The single player car. Module-level so a Canvas remount never respawns it. */
export function getPlayer(): CarController {
  if (!player) player = new CarController()
  return player
}
