/*
 * Four-corner vehicle dynamics.
 *
 * Adapted from APEX FORMULA 2026 — js/vehicleDynamics.js
 *   Copyright 2026 Avi Hacker, J.D.
 *   https://github.com/ahacker-1/apex-formula-2026
 *   Licensed under the Apache License, Version 2.0 (the "License"); you may
 *   not use this file except in compliance with the License. You may obtain a
 *   copy of the License at http://www.apache.org/licenses/LICENSE-2.0 — a copy
 *   is also in ../../LICENSES/apex-formula-2026-Apache-2.0.txt. Distributed on
 *   an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 *
 * CHANGES from the original (per Apache-2.0 §4(b)): translated to TypeScript;
 * the tyre thermal/pressure model, wetness, per-wheel bump inputs and
 * ride-height-sensitive aero were removed (this game has no weather, no tyre
 * wear and no setup screen — surface grip is a single multiplier); a
 * handbrake input was added (rear-only brake force plus a rear grip
 * multiplier) for the drift key; cornering-stiffness front/rear split and the
 * yaw-damping constants are exposed as parameters so the leva tuning panel
 * can move them live. The structure — load-sensitive combined-slip tyres,
 * relaxation over distance, previous-tick load transfer, per-wheel spin with
 * TC/ABS clamps, desired-yaw damping — is Apex's.
 *
 * Why this model and not a physics engine: the sprung mass keeps real lateral
 * velocity and yaw inertia, so the car can be provoked into slip, yet every
 * term is bounded and deterministic. It is what makes the reference game feel
 * "real" while staying approachable — see README, "Making it drive".
 */

export const VEHICLE_DEFAULTS = {
  wheelbase: 2.65,
  frontCg: 1.35,
  rearCg: 1.3,
  frontTrack: 1.7,
  rearTrack: 1.7,
  cgHeight: 0.31,
  yawInertia: 1080,
  wheelRadius: 0.38,
  wheelInertia: 1.45,
  cornerStiffness: 78000,
  longitudinalStiffness: 92000,
  tyreRelaxationLength: 0.72,
  rollFrontShare: 0.52,
} as const

const G = 9.81
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))
const finite = (value: number | undefined, fallback: number): number => (Number.isFinite(value) ? (value as number) : fallback)

export interface WheelState {
  front: boolean
  left: boolean
  radius: number
  omega: number
  slipRatio: number
  slipAngle: number
  normalLoad: number
  fx: number
  fy: number
  forceUtilization: number
  contact: boolean
  _scratch: TyreForces
}

export interface TyreForces {
  fx: number
  fy: number
  utilization: number
  limit: number
}

export interface VehicleConfig {
  wheelbase: number
  frontCg: number
  rearCg: number
  frontTrack: number
  rearTrack: number
  cgHeight: number
  yawInertia: number
  wheelRadius: number
  wheelInertia: number
  cornerStiffness: number
  longitudinalStiffness: number
  tyreRelaxationLength: number
  rollFrontShare: number
}

export interface VehicleState {
  config: VehicleConfig
  velocityLong: number
  velocityLat: number
  yawRate: number
  accelLong: number
  accelLat: number
  sideslip: number
  wheels: [WheelState, WheelState, WheelState, WheelState]
  result: { forceLong: number; forceLat: number; yawMoment: number; tyreUse: number; slip: boolean }
}

export interface Surface {
  /** sin of the road's pitch along the direction of travel. */
  grade: number
  /** sin of the road's roll towards positive lat. */
  camber: number
  /** Grip multiplier of the surface, 1 = reference asphalt. */
  grip: number
}

export interface DynamicsParams {
  mass: number
  steerAngle: number
  driveForce: number
  brakeForce: number
  engineBrakeForce: number
  /** Rear-only brake force from the handbrake key, N. */
  handbrakeForce: number
  /** Rear grip multiplier while the handbrake is held (1 = untouched). */
  rearGripScale: number
  brakeBias: number
  diffLock: number
  abs: boolean
  tc: boolean
  stabilityAssist: boolean
  downforce: number
  aeroBalance: number
  externalForceLong: number
  mu: number
  yawInertia: number
  cornerStiffness: number
  frontCornerScale: number
  surface: Surface
}

function createWheelState(front: boolean, left: boolean, radius: number): WheelState {
  return {
    front,
    left,
    radius,
    omega: 0,
    slipRatio: 0,
    slipAngle: 0,
    normalLoad: 0,
    fx: 0,
    fy: 0,
    forceUtilization: 0,
    contact: true,
    _scratch: { fx: 0, fy: 0, utilization: 0, limit: 0 },
  }
}

export function createVehicleState(config: Partial<VehicleConfig> = {}): VehicleState {
  const cfg: VehicleConfig = { ...VEHICLE_DEFAULTS, ...config }
  return {
    config: cfg,
    velocityLong: 0,
    velocityLat: 0,
    yawRate: 0,
    accelLong: 0,
    accelLat: 0,
    sideslip: 0,
    wheels: [
      createWheelState(true, true, cfg.wheelRadius),
      createWheelState(true, false, cfg.wheelRadius),
      createWheelState(false, true, cfg.wheelRadius),
      createWheelState(false, false, cfg.wheelRadius),
    ],
    result: { forceLong: 0, forceLat: 0, yawMoment: 0, tyreUse: 0, slip: false },
  }
}

export function resetVehicleState(state: VehicleState, speed = 0): void {
  state.velocityLong = finite(speed, 0)
  state.velocityLat = 0
  state.yawRate = 0
  state.accelLong = 0
  state.accelLat = 0
  state.sideslip = 0
  for (const wheel of state.wheels) {
    wheel.omega = state.velocityLong / wheel.radius
    wheel.slipRatio = 0
    wheel.slipAngle = 0
    wheel.normalLoad = 0
    wheel.fx = 0
    wheel.fy = 0
    wheel.forceUtilization = 0
  }
}

/** Load-sensitive, combined-slip tyre. Pure; shared with the headless rig. */
export function combinedTyreForces(
  slipRatio: number,
  slipAngle: number,
  normalLoad: number,
  mu: number,
  longitudinalStiffness: number,
  cornerStiffness: number,
  out: TyreForces,
): TyreForces {
  const fz = Math.max(0, finite(normalLoad, 0))
  if (fz < 1) {
    out.fx = 0
    out.fy = 0
    out.utilization = 0
    out.limit = 0
    return out
  }
  // A tyre gains force sub-linearly with load: doubling Fz does not double grip.
  const loadSensitivity = Math.pow(4000 / Math.max(1000, fz), 0.075)
  const limit = Math.max(1, finite(mu, 1) * loadSensitivity * fz)
  const rawFx = limit * Math.tanh((longitudinalStiffness * finite(slipRatio, 0)) / limit)
  const rawFy = -limit * Math.tanh((cornerStiffness * finite(slipAngle, 0)) / limit)
  const demand = Math.hypot(rawFx, rawFy)
  const scale = demand > limit ? limit / demand : 1
  out.fx = rawFx * scale
  out.fy = rawFy * scale
  out.utilization = Math.min(1, demand / limit)
  out.limit = limit
  return out
}

export function stepVehicleDynamics(state: VehicleState, params: DynamicsParams, dt: number): VehicleState['result'] {
  const cfg = state.config
  const mass = Math.max(1, finite(params.mass, 830))
  const u0 = state.velocityLong
  const v0 = state.velocityLat
  const r0 = state.yawRate
  const absSpeed = Math.hypot(u0, v0)
  const surface = params.surface
  const wheels = state.wheels
  const frontStatic = (mass * G * cfg.rearCg) / cfg.wheelbase
  const rearStatic = mass * G - frontStatic

  const aero = Math.max(0, finite(params.downforce, 0))
  const aeroBalance = clamp(finite(params.aeroBalance, 0.45), 0.36, 0.55)

  // Previous-tick acceleration gives deterministic, non-iterative load transfer.
  const longTransfer = (mass * state.accelLong * cfg.cgHeight) / cfg.wheelbase
  const frontTotal = Math.max(200, frontStatic - longTransfer + aero * aeroBalance)
  const rearTotal = Math.max(200, rearStatic + longTransfer + aero * (1 - aeroBalance))
  const lateral = mass * state.accelLat * cfg.cgHeight
  const frontLatTransfer = (lateral * cfg.rollFrontShare) / cfg.frontTrack
  const rearLatTransfer = (lateral * (1 - cfg.rollFrontShare)) / cfg.rearTrack
  const loads = [
    frontTotal * 0.5 + frontLatTransfer,
    frontTotal * 0.5 - frontLatTransfer,
    rearTotal * 0.5 + rearLatTransfer,
    rearTotal * 0.5 - rearLatTransfer,
  ]

  const steer = finite(params.steerAngle, 0)
  const drive = Math.max(0, finite(params.driveForce, 0))
  const braking = Math.max(0, finite(params.brakeForce, 0))
  const engineBrake = Math.max(0, finite(params.engineBrakeForce, 0))
  const handbrake = Math.max(0, finite(params.handbrakeForce, 0))
  const rearGripScale = clamp(finite(params.rearGripScale, 1), 0.3, 1)
  const brakeBias = clamp(finite(params.brakeBias, 0.56), 0.45, 0.68)
  const diffLock = clamp(finite(params.diffLock, 0.45), 0, 1)
  const omegaDelta = wheels[2].omega - wheels[3].omega
  const driveLeftShare = clamp(0.5 - omegaDelta * 0.0035 * diffLock, 0.18, 0.82)
  const driveShares = [0, 0, driveLeftShare, 1 - driveLeftShare]
  const brakeShares = [brakeBias * 0.5, brakeBias * 0.5, (1 - brakeBias) * 0.5, (1 - brakeBias) * 0.5]

  let forceLong = finite(params.externalForceLong, 0) - mass * G * Math.sin(surface.grade)
  let forceLat = -mass * G * Math.sin(surface.camber)
  let yawMoment = 0
  let maxUse = 0
  let slip = false

  const baseCornerStiffness = finite(params.cornerStiffness, cfg.cornerStiffness)
  const frontCornerScale = finite(params.frontCornerScale, 0.84)

  for (let i = 0; i < 4; i++) {
    const wheel = wheels[i]
    const x = (wheel.left ? -1 : 1) * (wheel.front ? cfg.frontTrack : cfg.rearTrack) * 0.5
    const y = wheel.front ? cfg.frontCg : -cfg.rearCg
    const delta = wheel.front ? steer : 0
    const cos = Math.cos(delta)
    const sin = Math.sin(delta)
    wheel.normalLoad = clamp(loads[i], 0, mass * G * 0.65 + aero * 0.5)
    wheel.contact = wheel.normalLoad > 40

    const hubLong = u0 - r0 * x
    const hubLat = v0 + r0 * y
    const wheelLong = cos * hubLong + sin * hubLat
    const wheelLat = -sin * hubLong + cos * hubLat
    const denom = Math.max(3, Math.abs(wheelLong))
    wheel.slipRatio = clamp((wheel.omega * wheel.radius - wheelLong) / denom, -2.5, 2.5)
    wheel.slipAngle = clamp(Math.atan2(wheelLat, Math.max(2, Math.abs(wheelLong))), -0.7, 0.7)

    const mu = Math.max(0.05, finite(params.mu, 1.6) * surface.grip * (wheel.front ? 1 : rearGripScale))
    const drivenCap = drive * driveShares[i]
    const brakingCap = braking * brakeShares[i] + engineBrake * (wheel.front ? 0 : 0.5) + (wheel.front ? 0 : handbrake * 0.5)
    // A freely rolling axle cannot consume the friction circle with a phantom
    // longitudinal demand that is immediately clamped away below.
    const forceSlipRatio = drivenCap + brakingCap > 1 ? wheel.slipRatio : 0
    const target = combinedTyreForces(
      forceSlipRatio,
      wheel.slipAngle,
      wheel.normalLoad,
      mu,
      cfg.longitudinalStiffness,
      baseCornerStiffness * (wheel.front ? frontCornerScale : 1.12),
      wheel._scratch,
    )
    // The contact patch cannot transmit more longitudinal force than the
    // applied shaft/brake torque can support.
    target.fx = clamp(target.fx, -brakingCap, drivenCap)
    // Relaxation length avoids instantaneous force steps.
    const relax = Math.min(1, (dt * Math.max(5, absSpeed)) / cfg.tyreRelaxationLength)
    wheel.fx += (target.fx - wheel.fx) * relax
    wheel.fy += (target.fy - wheel.fy) * relax
    wheel.forceUtilization = target.utilization
    maxUse = Math.max(maxUse, target.utilization)
    if (Math.abs(wheel.slipRatio) > 0.18 || Math.abs(wheel.slipAngle) > 0.18) slip = true

    const tyreLong = wheel.fx * cos - wheel.fy * sin
    const tyreLat = wheel.fx * sin + wheel.fy * cos
    forceLong += tyreLong
    forceLat += tyreLat
    yawMoment += y * tyreLat - x * tyreLong

    const driveTorque = drive * driveShares[i] * wheel.radius
    const engineTorque = engineBrake * (wheel.front ? 0 : 0.5) * wheel.radius
    const brakeTorque = (braking * brakeShares[i] + (wheel.front ? 0 : handbrake * 0.5)) * wheel.radius
    const rollingSign = Math.sign(wheel.omega || wheelLong || 1)
    const netTorque = driveTorque - (engineTorque + brakeTorque) * rollingSign - wheel.fx * wheel.radius
    wheel.omega += (netTorque / cfg.wheelInertia) * dt
    if (params.abs && braking > 0 && wheelLong > 5) {
      wheel.omega = Math.max(wheel.omega, (wheelLong * 0.87) / wheel.radius)
    }
    if (params.tc && !wheel.front && drive > 0 && wheelLong > 3) {
      wheel.omega = Math.min(wheel.omega, (wheelLong * 1.14) / wheel.radius)
    }
    if (braking > 0 && Math.sign(wheel.omega) !== rollingSign && Math.abs(wheelLong) < 4) wheel.omega = 0
  }

  // Aerodynamic yaw damping is tiny in steady cornering but kills numerical
  // oscillation after a large impulse. No heading-derived kinematic yaw is used.
  if (params.stabilityAssist) {
    const lateralDamping = clamp(v0 * mass * (2.8 + absSpeed * 0.018), -mass * G * 0.7, mass * G * 0.7)
    forceLat -= lateralDamping
  }
  const rawDesiredYaw = Math.abs(u0) > 1 ? (u0 * Math.tan(steer)) / cfg.wheelbase : 0
  const lateralCapacity = (wheels[0]._scratch.limit + wheels[1]._scratch.limit + wheels[2]._scratch.limit + wheels[3]._scratch.limit) / mass
  const yawLimit = clamp((0.85 * lateralCapacity) / Math.max(3, Math.abs(u0)), 0.18, 2.4)
  const desiredYaw = clamp(rawDesiredYaw, -yawLimit, yawLimit)
  yawMoment -= (r0 - desiredYaw) * (14500 + absSpeed * 240)
  // Integrate body-frame velocity derivatives, but publish and retain physical
  // CG acceleration for telemetry and the next tick's load transfer.
  const bodyAccelLong = forceLong / mass + r0 * v0
  const bodyAccelLat = forceLat / mass - r0 * u0
  const yawAccel = yawMoment / Math.max(1, finite(params.yawInertia, cfg.yawInertia))
  state.velocityLong = clamp(u0 + bodyAccelLong * dt, -8, 115)
  state.velocityLat = clamp(v0 + bodyAccelLat * dt, -32, 32)
  state.yawRate = clamp(r0 + yawAccel * dt, -3.2, 3.2)

  // Parked-state regularisation prevents slip-angle noise from walking a car.
  if (Math.hypot(state.velocityLong, state.velocityLat) < 0.18 && drive < 50) {
    state.velocityLat *= Math.max(0, 1 - dt * 16)
    state.yawRate *= Math.max(0, 1 - dt * 14)
  }
  state.accelLong = forceLong / mass
  state.accelLat = forceLat / mass
  state.sideslip = Math.atan2(state.velocityLat, Math.max(0.5, Math.abs(state.velocityLong)))
  const result = state.result
  result.forceLong = forceLong
  result.forceLat = forceLat
  result.yawMoment = yawMoment
  result.tyreUse = maxUse
  result.slip = slip
  return result
}

export interface PlanarVelocity {
  x: number
  z: number
}

export function bodyToWorldVelocity(state: VehicleState, heading: number, out: PlanarVelocity): PlanarVelocity {
  const sin = Math.sin(heading)
  const cos = Math.cos(heading)
  out.x = sin * state.velocityLong + cos * state.velocityLat
  out.z = cos * state.velocityLong - sin * state.velocityLat
  return out
}

export function setBodyVelocityFromWorld(state: VehicleState, heading: number, vx: number, vz: number): void {
  const sin = Math.sin(heading)
  const cos = Math.cos(heading)
  state.velocityLong = vx * sin + vz * cos
  state.velocityLat = vx * cos - vz * sin
  state.sideslip = Math.atan2(state.velocityLat, Math.max(0.5, Math.abs(state.velocityLong)))
}
