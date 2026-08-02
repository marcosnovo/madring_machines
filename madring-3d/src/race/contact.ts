/*
 * Car-vs-car contact: oriented 2D footprints, SAT, positional correction and a
 * low-restitution impulse.
 *
 * Adapted from APEX FORMULA 2026 — js/contact.js (the oriented-footprint SAT
 * and the world/body velocity plumbing) and js/race.js (solveContactPositions
 * and the accumulated-impulse pass of RaceSession._collisions).
 *   Copyright 2026 Avi Hacker, J.D.
 *   https://github.com/ahacker-1/apex-formula-2026
 *   Licensed under the Apache License, Version 2.0; see
 *   ../../LICENSES/apex-formula-2026-Apache-2.0.txt. Distributed on an "AS IS"
 *   BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 *
 * CHANGES from the original (per Apache-2.0 §4(b)): translated to TypeScript
 * and re-targeted at this project's CarController (the reference's phys.pos /
 * projectWallConstraint become x/z / resolveWallCollision); the damage,
 * scrape-audio, blue-flag and telemetry bookkeeping is removed — this port
 * keeps only what separates cars and exchanges momentum. Added on top: the
 * feedback channel (contact intensity, contact point, camera kick) and the
 * scrub below, so a hit is something the player hears, sees and pays for
 * rather than a silent nudge.
 */
import type { CarController } from '../vehicle/CarController'
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH } from '../vehicle/CarController'
import { bodyToWorldVelocity, setBodyVelocityFromWorld } from '../vehicle/dynamics'

const BROADPHASE_SQ = Math.pow(2 * Math.hypot(CAR_HALF_LENGTH, CAR_HALF_WIDTH), 2)
const CONTACT_SLOP = 0.002

/**
 * Closing speed below which a touch is not an impact, m/s.
 *
 * Cars racing nose-to-tail rub continuously at a few tenths of a metre per
 * second — the positional passes above shuffle them apart every tick. Every
 * one of those used to raise a (tiny) camera kick; with the sharper response
 * curve below they would raise an audible one, so the deadband moves out from
 * the impulse's 0.5 to a speed no amount of shuffling produces.
 */
const HIT_FLOOR = 1.2

/**
 * Closing speed that saturates the feedback, m/s. 13 m/s ≈ 47 km/h of closing
 * speed, which on this circuit is a genuine misjudged braking point into the
 * back of someone, not a side-by-side rub.
 */
const HIT_FULL = 13

/**
 * How much speed a square hit scrubs off, at full intensity.
 *
 * The impulse already deletes the *closing* component, which for a shallow
 * side-swipe is almost none of the car's speed — so before this, T-boning a
 * rival and brushing one cost the same lap time: nothing. A hit has to be
 * paid for or it is not a hit. 0.22 at saturation is roughly a lost corner,
 * and the sqrt shaping below keeps a light rub under 3 %.
 */
const HIT_SCRUB = 0.22

/**
 * Perceived severity of a contact, 0..1, from its closing speed.
 *
 * The linear (closing - 0.5) / 18 this replaces put a 5 m/s bang — the sort
 * that spins a car — at 0.25, then multiplied it by 0.75 for the camera kick:
 * about a fifth of a degree of shake, which is why contact read as nothing at
 * all. A sqrt keeps light rubs light (2 m/s → 0.25) while getting real hits
 * up where they can be felt (5 m/s → 0.55, 10 m/s → 0.85).
 */
function hitIntensity(closing: number): number {
  return Math.min(1, Math.sqrt(Math.max(0, closing - HIT_FLOOR) / (HIT_FULL - HIT_FLOOR)))
}

interface Body {
  car: CarController
  x: number
  z: number
  fx: number
  fz: number
  rx: number
  rz: number
  invMass: number
}

export interface Contact {
  nx: number
  nz: number
  penetration: number
}

const scratchVelocity = { x: 0, z: 0 }

export function syncBody(out: Body, car: CarController, mass: number): Body {
  const heading = car.heading
  out.car = car
  out.x = car.x
  out.z = car.z
  out.fx = Math.sin(heading)
  out.fz = Math.cos(heading)
  out.rx = Math.cos(heading)
  out.rz = -Math.sin(heading)
  out.invMass = 1 / Math.max(1, mass)
  return out
}

export function makeBody(car: CarController, mass: number): Body {
  return syncBody({ car, x: 0, z: 0, fx: 0, fz: 1, rx: 1, rz: 0, invMass: 1 / 830 }, car, mass)
}

function projectionRadius(body: Body, ax: number, az: number): number {
  return CAR_HALF_WIDTH * Math.abs(ax * body.rx + az * body.rz) + CAR_HALF_LENGTH * Math.abs(ax * body.fx + az * body.fz)
}

/** SAT for two oriented car footprints. Returned normal points from B to A. */
export function orientedCarContact(a: Body, b: Body): Contact | null {
  const dx = a.x - b.x
  const dz = a.z - b.z
  if (dx * dx + dz * dz > BROADPHASE_SQ) return null

  let bestOverlap = Infinity
  let bestX = 0
  let bestZ = 0
  const consider = (axisX: number, axisZ: number): boolean => {
    const center = dx * axisX + dz * axisZ
    const overlap = projectionRadius(a, axisX, axisZ) + projectionRadius(b, axisX, axisZ) - Math.abs(center)
    if (overlap <= 0) return false
    if (overlap < bestOverlap) {
      const direction = center < 0 ? -1 : 1
      bestOverlap = overlap
      bestX = axisX * direction
      bestZ = axisZ * direction
    }
    return true
  }
  if (!consider(a.rx, a.rz) || !consider(a.fx, a.fz) || !consider(b.rx, b.rz) || !consider(b.fx, b.fz)) return null
  if (!Number.isFinite(bestOverlap)) return null
  return { nx: bestX, nz: bestZ, penetration: bestOverlap }
}

/**
 * Separate every overlapping pair (a few positional passes), then apply one
 * low-restitution impulse per contact with capped tangential friction. Every
 * pair reads the same pre-solve velocity snapshot; the accumulated deltas are
 * applied once per car, which removes entry-order bias in pile-ups. After any
 * correction the car is re-clamped against the walls.
 *
 * Each touching car is left with `contactHit` (0..1 severity, one tick),
 * `impactX/impactZ` (where the sparks come from) and a raised `impactKick`
 * (camera shake), and pays a longitudinal speed scrub proportional to that
 * severity.
 */
export function resolveCarContacts(cars: CarController[], bodies: Body[], mass: number): void {
  const n = cars.length
  for (let i = 0; i < n; i++) syncBody(bodies[i], cars[i], mass)

  // Velocity snapshot before any correction.
  const baseVx = new Array<number>(n)
  const baseVz = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    bodyToWorldVelocity(cars[i].vehicle, cars[i].heading, scratchVelocity)
    baseVx[i] = scratchVelocity.x
    baseVz[i] = scratchVelocity.z
  }

  // Positional passes.
  for (let pass = 0; pass < 6; pass++) {
    let any = false
    for (let i = 0; i < n; i++) syncBody(bodies[i], cars[i], mass)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const contact = orientedCarContact(bodies[i], bodies[j])
        if (!contact || contact.penetration <= CONTACT_SLOP) continue
        any = true
        const correction = Math.min(0.7, contact.penetration - CONTACT_SLOP)
        const move = Math.min(0.35, correction * 0.5)
        cars[i].x += contact.nx * move
        cars[i].z += contact.nz * move
        cars[j].x -= contact.nx * move
        cars[j].z -= contact.nz * move
      }
    }
    if (!any) break
    for (const car of cars) car.resolveWallCollision()
  }

  // Impulses from the pre-solve snapshot.
  let hardest = 0
  const deltaVx = new Array<number>(n).fill(0)
  const deltaVz = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) syncBody(bodies[i], cars[i], mass)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const contact = orientedCarContact(bodies[i], bodies[j])
      if (!contact) continue
      const rvx = baseVx[i] - baseVx[j]
      const rvz = baseVz[i] - baseVz[j]
      const closing = Math.max(0, -(rvx * contact.nx + rvz * contact.nz))
      if (closing <= 0.5) continue
      const invSum = bodies[i].invMass + bodies[j].invMass
      const normalImpulse = (1.04 * closing) / invSum
      const tx = -contact.nz
      const tz = contact.nx
      const tangentSpeed = rvx * tx + rvz * tz
      const tangentImpulse = Math.max(-normalImpulse * 0.16, Math.min(normalImpulse * 0.16, -tangentSpeed / invSum))
      const ix = contact.nx * normalImpulse + tx * tangentImpulse
      const iz = contact.nz * normalImpulse + tz * tangentImpulse
      deltaVx[i] += ix * bodies[i].invMass
      deltaVz[i] += iz * bodies[i].invMass
      deltaVx[j] -= ix * bodies[j].invMass
      deltaVz[j] -= iz * bodies[j].invMass

      // ---- feedback ------------------------------------------------------
      const intensity = hitIntensity(closing)
      if (intensity <= 0) continue
      // Where the sparks come from. The midpoint of two centres that are, by
      // definition of the contact, just touching along the normal lands on
      // the touching bodywork — near enough for a spark shower, and it needs
      // no witness points the SAT above does not produce.
      const px = (bodies[i].x + bodies[j].x) * 0.5
      const pz = (bodies[i].z + bodies[j].z) * 0.5
      const a = cars[i]
      const bCar = cars[j]
      a.impactKick = Math.max(a.impactKick, intensity * 0.75)
      a.contactHit = Math.max(a.contactHit, intensity)
      a.impactX = px
      a.impactZ = pz
      bCar.impactKick = Math.max(bCar.impactKick, intensity * 0.75)
      bCar.contactHit = Math.max(bCar.contactHit, intensity)
      bCar.impactX = px
      bCar.impactZ = pz
      hardest = Math.max(hardest, intensity)
    }
  }
  for (let i = 0; i < n; i++) {
    if (deltaVx[i] === 0 && deltaVz[i] === 0) continue
    setBodyVelocityFromWorld(cars[i].vehicle, cars[i].heading, baseVx[i] + deltaVx[i], baseVz[i] + deltaVz[i])
  }
  // The scrub is applied after the impulses, on the resulting body velocity,
  // so it costs speed in the direction the car is actually travelling rather
  // than fighting the momentum exchange. Longitudinal only: killing lateral
  // velocity as well would make a side-swipe *stabilise* the car, which is
  // the opposite of what a hit should feel like.
  if (hardest > 0) {
    for (const car of cars) {
      if (car.contactHit <= 0) continue
      car.vehicle.velocityLong *= 1 - HIT_SCRUB * car.contactHit
    }
  }
}
