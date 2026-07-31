/**
 * The racing line, derived from the measured track frame.
 *
 * The AI needs two things the raw centreline does not give: a lateral offset
 * per sample that cuts corners the way a driver does, and an allowed speed per
 * sample. Both are computed once from the same data the walls use, so the
 * line can never leave the corridor.
 *
 * The line is an elastic band: each pass pulls every sample towards the chord
 * of its neighbours (which straightens corners onto their apexes) and the
 * walls push back. ~300 passes over 1024 samples is a few milliseconds, once.
 *
 * The speed is the corner-speed solution of the same tyre/downforce model the
 * car runs: v²·k = μ·(g + q·v²) with q = ½ρ·CLA/m — downforce makes fast
 * corners faster, exactly as the player's car experiences.
 */
import type { TrackFrame } from '../circuit/trackFrame'
import { getTrackFrame } from '../circuit/trackFrame'
import { TUNING_DEFAULTS } from '../vehicle/tuning'

export interface RaceLine {
  /** Lateral offset of the line from the centreline, per sample. */
  lat: Float32Array
  /** Line position, world planar. */
  x: Float32Array
  z: Float32Array
  /** Unsigned curvature of the line, 1/m. */
  curv: Float32Array
  /** Allowed speed on the line, m/s. */
  spd: Float32Array
}

/** Clearance kept between the line and the wall face, metres. */
const LINE_MARGIN = 2.4
/** Elastic-band smoothing passes. */
const PASSES = 320
/** Global speed cap, m/s (the car is gear-limited at 96.5). */
const V_MAX = 94
/** Confidence applied to the theoretical corner speed. */
const GRIP_TRUST = 0.94

let cached: RaceLine | null = null

export function getRaceLine(track: TrackFrame = getTrackFrame()): RaceLine {
  if (cached) return cached
  const { samples, N, ds } = track

  // --- elastic band: straighten within the walls ---------------------------
  const lat = new Float64Array(N)
  const lo = new Float64Array(N)
  const hi = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    hi[i] = Math.max(0.6, samples[i].wallPos - LINE_MARGIN)
    lo[i] = -Math.max(0.6, samples[i].wallNeg - LINE_MARGIN)
  }
  const px = new Float64Array(N)
  const pz = new Float64Array(N)
  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = 0; i < N; i++) {
      const s = samples[i]
      px[i] = s.x + s.nx * lat[i]
      pz[i] = s.z + s.nz * lat[i]
    }
    for (let i = 0; i < N; i++) {
      const prev = (i + N - 1) % N
      const next = (i + 1) % N
      const s = samples[i]
      // pull towards the neighbour chord, expressed as a lateral offset
      const mx = (px[prev] + px[next]) / 2 - s.x
      const mz = (pz[prev] + pz[next]) / 2 - s.z
      const want = mx * s.nx + mz * s.nz
      const value = lat[i] + (want - lat[i]) * 0.22
      lat[i] = Math.min(hi[i], Math.max(lo[i], value))
    }
  }

  // --- curvature of the line (smoothed, like the layout's) -----------------
  for (let i = 0; i < N; i++) {
    const s = samples[i]
    px[i] = s.x + s.nx * lat[i]
    pz[i] = s.z + s.nz * lat[i]
  }
  const rawCurv = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const a = (i + N - 1) % N
    const b = (i + 1) % N
    const t1x = px[i] - px[a]
    const t1z = pz[i] - pz[a]
    const t2x = px[b] - px[i]
    const t2z = pz[b] - pz[i]
    const l1 = Math.hypot(t1x, t1z) || 1e-6
    const l2 = Math.hypot(t2x, t2z) || 1e-6
    const cross = (t1x * t2z - t1z * t2x) / (l1 * l2)
    const dot = (t1x * t2x + t1z * t2z) / (l1 * l2)
    rawCurv[i] = Math.abs(Math.atan2(cross, dot)) / ((l1 + l2) / 2)
  }
  const curv = new Float32Array(N)
  const HALF = 4
  for (let i = 0; i < N; i++) {
    let sum = 0
    for (let j = -HALF; j <= HALF; j++) sum += rawCurv[(i + j + N) % N]
    curv[i] = sum / (2 * HALF + 1)
  }

  // --- allowed speed -------------------------------------------------------
  const t = TUNING_DEFAULTS
  const mu = t.mu * GRIP_TRUST
  const q = (0.5 * 1.2 * t.claZ) / t.mass // downforce lateral-g gain per v²
  const G = 9.81
  const spd = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const k = curv[i]
    const denominator = k - mu * q
    spd[i] = denominator <= 1e-5 ? V_MAX : Math.min(V_MAX, Math.sqrt((mu * G) / denominator))
  }
  // Cheap forward pass so the speed profile respects corner exits: the AI's
  // braking horizon handles entries, but nothing else limits how hard the
  // planner believes a car can accelerate out of a hairpin.
  const A_ACC = 14
  for (let lap = 0; lap < 2; lap++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      const allowed = Math.sqrt(spd[i] * spd[i] + 2 * A_ACC * ds)
      if (spd[j] > allowed) spd[j] = allowed
    }
  }

  const latF = new Float32Array(N)
  const xF = new Float32Array(N)
  const zF = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    latF[i] = lat[i]
    xF[i] = px[i]
    zF[i] = pz[i]
  }
  cached = { lat: latF, x: xF, z: zF, curv, spd }
  return cached
}
