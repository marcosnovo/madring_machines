/*
 * AI driver: pure pursuit on the racing line, braking-horizon speed control,
 * avoidance and overtaking, defending, battle variance, consistency-based
 * mistakes, boost tactics.
 *
 * Adapted from APEX FORMULA 2026 — js/ai.js.
 *   Copyright 2026 Avi Hacker, J.D.
 *   https://github.com/ahacker-1/apex-formula-2026
 *   Licensed under the Apache License, Version 2.0; see
 *   ../../LICENSES/apex-formula-2026-Apache-2.0.txt. Distributed on an "AS IS"
 *   BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 *
 * CHANGES from the original (per Apache-2.0 §4(b)): translated to TypeScript
 * and re-targeted at this project's track frame and CarController; the
 * race-direction integrations (VSC, blue flags, track-limit scrubs), weather,
 * damage, fuel modes, tyre wear, dirty air and ERS strategy hooks are
 * removed. Width limits come from the per-sample corridor (wallPos/wallNeg —
 * this circuit's width varies 12–50 m) instead of a constant halfWidth, and
 * the racing line is the elastic-band line of ./line.ts.
 */
import type { TrackFrame } from '../circuit/trackFrame'
import type { CarController, CarInput } from '../vehicle/CarController'
import { angleDiff, maxSteerAngle } from '../vehicle/CarController'
import type { RaceLine } from './line'

const ABRAKE_PLAN = 38

export interface DriverSpec {
  name: string
  /** 0..1 baseline pace. */
  pace: number
  /** 0..1; low consistency = more mistakes. */
  consistency: number
  /** Body colour, hex. */
  color: string
}

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

export class AiDriver {
  readonly car: CarController
  readonly driver: DriverSpec
  private readonly track: TrackFrame
  private readonly line: RaceLine
  private readonly random: () => number
  readonly skill: number
  private avoidOffset = 0
  private mistakeTimer = 0
  private mistakeCooldown: number
  private lapNoise = 1
  private defendOffset = 0
  private defendT = 0
  private _defendSide = 0
  private _defendMag = 1.8
  private _defendCool = 0
  private _defendArmed = true
  private battleT = 0

  readonly input: CarInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false, analog: true }

  constructor(car: CarController, track: TrackFrame, line: RaceLine, driver: DriverSpec, random: () => number = Math.random) {
    this.car = car
    this.track = track
    this.line = line
    this.driver = driver
    this.random = random
    this.skill = 0.945 + 0.055 * driver.pace
    this.mistakeCooldown = 8 + this.random() * 8
  }

  newLapNoise(): void {
    this.lapNoise = 1 + (this.random() - 0.5) * 0.012 * (2 - this.driver.consistency)
  }

  /** Room to either side of the centreline at sample `i`, for line changes. */
  private room(i: number): { left: number; right: number } {
    const s = this.track.samples[i]
    return { left: Math.max(0.4, s.wallPos - 1.8), right: Math.max(0.4, s.wallNeg - 1.8) }
  }

  update(dt: number, others: CarController[], brakes: Map<CarController, number>): CarInput {
    const c = this.track
    const line = this.line
    const car = this.car
    const N = c.N
    const ds = c.ds
    const idx = car.sampleIdx

    if (this.defendT > 0) this.defendT = Math.max(0, this.defendT - dt)

    // ---- mistakes ----
    this.mistakeCooldown -= dt
    if (this.mistakeTimer > 0) this.mistakeTimer -= dt
    else if (this.mistakeCooldown <= 0) {
      this.mistakeCooldown = 9 + this.random() * 14
      const p = (1 - this.driver.consistency) * 0.55
      if (this.random() < p && line.curv[idx] > 1 / 400) this.mistakeTimer = 1.1 // brake late / run wide
    }
    const mistake = this.mistakeTimer > 0

    // ---- steering lookahead ----
    const lookM = Math.min(58, Math.max(9, car.v * 0.52))
    const li = (idx + Math.round(lookM / ds)) % N
    const straight = line.curv[idx] < 1 / 650

    // ---- avoidance / overtaking / defending / battle awareness ----
    let targetAvoid = 0
    let avoidDist = 1e9
    let chase: CarController | null = null
    let chaseDist = 1e9
    let follow: CarController | null = null
    let followDist = 1e9
    let brakeLead: CarController | null = null
    let brakeLeadDist = 1e9
    let attacker: CarController | null = null
    let attackerDist = 1e9
    let nearestGapT = 1e9
    const selfSample = c.samples[idx]
    const selfAlong = (car.x - selfSample.x) * selfSample.tx + (car.z - selfSample.z) * selfSample.tz
    for (const o of others) {
      if (o === car) continue
      let ahead = o.sampleIdx - idx
      if (ahead > N / 2) ahead -= N
      if (ahead < -N / 2) ahead += N
      // sampleIdx is quantised to ds, which is a car length here. Add each
      // car's along-track residual so following decisions do not flicker.
      const otherSample = c.samples[o.sampleIdx]
      const otherAlong = (o.x - otherSample.x) * otherSample.tx + (o.z - otherSample.z) * otherSample.tz
      const dAhead = ahead * ds + otherAlong - selfAlong
      const absD = Math.abs(dAhead)
      if (dAhead > 0 && dAhead < 140) {
        const gapT = dAhead / Math.max(car.v, 28)
        if (gapT < nearestGapT) nearestGapT = gapT
      }
      // a faster car close behind is an attacker worth covering off
      if (dAhead < -5.8 && dAhead > -22 && o.v > car.v + 0.5 && Math.abs(o.lat - car.lat) < 4.5) {
        if (absD < attackerDist) {
          attackerDist = absD
          attacker = o
        }
      }
      if (dAhead < -4 || dAhead > 42) continue
      const latDiff = o.lat - car.lat
      if (dAhead < chaseDist && dAhead > 0.35) {
        chaseDist = dAhead
        chase = o
      }
      if (dAhead < followDist && dAhead > 0.35 && Math.abs(latDiff) < 2.55) {
        followDist = dAhead
        follow = o
      }
      if (dAhead < brakeLeadDist && dAhead > 0.35 && Math.abs(latDiff) < 2.8) {
        brakeLeadDist = dAhead
        brakeLead = o
      }
      if (Math.abs(latDiff) < 3.6 && dAhead > 0 && dAhead < 30 && dAhead < avoidDist && o.v < car.v + 4) {
        const room = this.room(li)
        const side = o.lat > 0 ? -1 : 1
        targetAvoid = clamp(o.lat + side * 3.7, -room.right, room.left) - line.lat[li]
        avoidDist = dAhead
      }
    }
    const avoidRate = targetAvoid !== 0 ? 3.4 : 2.6
    this.avoidOffset += (targetAvoid - this.avoidOffset) * Math.min(1, dt * avoidRate)

    // ---- defending: one legal line change per straight ----
    if (this._defendCool > 0) this._defendCool = Math.max(0, this._defendCool - dt)
    if (!straight) this._defendArmed = true
    if (straight && attacker && this._defendArmed && this.defendT <= 0 && this._defendCool <= 0 && car.v > 40) {
      this._defendArmed = false
      this.defendT = 2.4
      this._defendCool = 7
      this._defendSide = Math.sign(attacker.lat - car.lat) || (car.lat > 0 ? -1 : 1)
      const room = this.room(idx)
      this._defendMag = Math.min(1.8, Math.max(0.9, (Math.min(room.left, room.right) - 0.1) * 0.5))
    }
    const defendTarget = this.defendT > 0 && targetAvoid === 0 ? this._defendSide * this._defendMag : 0
    this.defendOffset += (defendTarget - this.defendOffset) * Math.min(1, dt * 2.2)

    // ---- battle variance: a sustained close fight raises commitment ----
    if (nearestGapT < 1) this.battleT = Math.min(12, this.battleT + dt)
    else this.battleT = Math.max(0, this.battleT - dt * 2)
    const fightF = this.battleT > 5 ? 1.009 : 1

    // ---- steering: pure pursuit on racing line + lateral offsets ----
    const baseLat = line.lat[li]
    let off = this.avoidOffset
    if (this.defendOffset !== 0) {
      const room = this.room(li)
      off = clamp(baseLat + off + this.defendOffset, -room.right, room.left) - baseLat
    }
    const s = c.samples[li]
    const tx = line.x[li] + s.nx * off - car.x
    const tz = line.z[li] + s.nz * off - car.z
    const desired = Math.atan2(tx, tz)
    let dh = angleDiff(desired, car.heading)
    if (mistake) dh += 0.05
    const steer = dh / Math.max(0.04, maxSteerAngle(car.v))
    this.input.steer = clamp(steer * 1.15, -1, 1)

    // ---- speed target: min over braking horizon ----
    const horizon = Math.max(20, (car.v * car.v) / (2 * ABRAKE_PLAN) + 30)
    const hs = Math.round(horizon / ds)
    let vT = 1e9
    for (let j = 0; j <= hs; j += 2) {
      const jj = (idx + j) % N
      const allow = Math.sqrt(line.spd[jj] * line.spd[jj] + 2 * ABRAKE_PLAN * j * ds)
      if (allow < vT) vT = allow
    }
    vT *= this.skill * this.lapNoise * fightF
    if (mistake) vT *= 1.055

    // Keep a real nose-to-tail buffer until the cars have PHYSICALLY separated
    // laterally.
    let followBrake = 0
    if (follow) {
      const closing = Math.max(0, car.v - follow.v)
      const speedBuffer = Math.min(3.2, car.v * 0.045)
      const safeGap = 6.35 + speedBuffer + Math.min(7, closing * 0.6)
      const gapError = safeGap - followDist
      if (gapError > 0) {
        const backoff = Math.min(4, 0.85 + gapError * 0.35 + closing * 0.2)
        vT = Math.min(vT, Math.max(follow.v - backoff, 6))
        followBrake = Math.min(0.7, 0.04 + gapError * 0.12 + closing * 0.06)
      }
    }

    const err = vT - car.v
    this.input.throttle = err > 0.4 ? Math.min(1, 0.45 + err * 0.28) : err > -0.6 ? 0.28 : 0
    this.input.brake = err < -0.8 ? Math.min(1, -err * 0.22) : 0
    if (followBrake > 0) {
      this.input.throttle = 0
      this.input.brake = Math.max(this.input.brake, followBrake)
    }
    // Propagate a braking wave before it becomes a contact wave.
    const brakePreview = 6.35 + Math.min(3.2, car.v * 0.045) + Math.max(4, Math.min(14, car.v * 0.18))
    if (brakeLead && brakeLeadDist < brakePreview) {
      const leadBrake = brakes.get(brakeLead) ?? 0
      if (leadBrake > 0.03) {
        this.input.throttle = 0
        this.input.brake = Math.max(this.input.brake, Math.min(0.92, leadBrake * 0.96))
      }
    }

    // ---- Manual Override boost: chase within range on straights ----
    this.input.boost = straight && car.battery > 0.35 && car.v > 45 && this.input.brake < 0.03 && ((chase !== null && chaseDist < 26) || car.battery > 0.92)

    return this.input
  }
}
