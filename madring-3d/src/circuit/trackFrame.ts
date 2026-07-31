/**
 * The measured road, re-expressed as the track frame the car model drives in.
 *
 * The vehicle model (src/vehicle/) does not live in a physics engine. Its
 * whole world is this: a closed chain of centreline samples with a planar
 * tangent and normal, a signed lateral offset measured along that normal, and
 * a wall distance per side. Everything here is derived once from the measured
 * road in ./layout (which is itself measured off the circuit model — see
 * README) and cached.
 *
 * Conventions, fixed here and used by everything in src/vehicle/:
 *
 *   - heading ψ: the car's yaw, with the planar forward direction
 *     (sin ψ, cos ψ). A sample's tangent heading is atan2(t.x, t.z), which is
 *     exactly the yaw `poseAt` spawns the car with.
 *   - the track normal n = (cos ψt, -sin ψt) for the tangent heading ψt.
 *     Positive lateral offset ("lat") is towards +n. A positive yaw rate
 *     rotates the velocity towards +n, so positive lat is the driver's LEFT,
 *     and it is bounded by the measured left edge (`edgeLeft`).
 *   - `wallPos` / `wallNeg` bound lat on the +n / -n side: the measured edge
 *     plus the same 0.8 m margin the old cannon wall chain stood at.
 *
 * Elevation and camber are carried per sample: `y` is the centreline height,
 * `latSlope` is dY per metre of positive lat, and `grade`/`camber` are the
 * small-angle gravity terms the dynamics consume (README, "The circuit").
 */
import { getLayout } from './layout'

/** How far outside the measured asphalt edge the wall face stands, metres. */
export const WALL_MARGIN = 0.8

export interface TrackSample {
  /** Planar centreline position. */
  x: number
  z: number
  /** Centreline height at this sample, metres. */
  y: number
  /** Planar unit tangent (direction of travel). */
  tx: number
  tz: number
  /** Planar unit normal; positive lat (driver's left) is towards +n. */
  nx: number
  nz: number
  /** Unsigned curvature, 1/m. */
  curv: number
  /** Wall distance on the +n side (left), metres from the centreline. */
  wallPos: number
  /** Wall distance on the -n side (right), metres from the centreline. */
  wallNeg: number
  /** dY per metre of +lat — the measured cross-slope. */
  latSlope: number
  /** Longitudinal slope term: sin of the road's pitch along +t. */
  grade: number
  /** Lateral slope term: sin of the road's roll towards +lat. */
  camber: number
}

export interface TrackFrame {
  samples: TrackSample[]
  N: number
  /** Spacing between samples, metres. */
  ds: number
  /** Lap length, metres. */
  length: number
  /** Sample index of the start/finish line. */
  startIndex: number
  /** Sample index of the grid slot. */
  gridIndex: number
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))

let cached: TrackFrame | null = null

export function getTrackFrame(): TrackFrame {
  if (cached) return cached
  const layout = getLayout()
  const n = layout.samples.length
  const samples: TrackSample[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const s = layout.samples[i]
    const tLen = Math.hypot(s.t.x, s.t.z) || 1e-6
    const tx = s.t.x / tLen
    const tz = s.t.z / tLen
    // The layout's `r` is the driver's right; +n here is the driver's left.
    // dY/dlat follows: moving +1 m along +n moves -1 m along r.
    const latSlope = -s.r.y
    samples[i] = {
      x: s.p.x,
      z: s.p.z,
      y: s.p.y,
      tx,
      tz,
      nx: tz,
      nz: -tx,
      curv: Math.abs(s.k),
      wallPos: s.edgeLeft + WALL_MARGIN,
      wallNeg: s.edgeRight + WALL_MARGIN,
      latSlope,
      grade: clamp(s.t.y, -0.35, 0.35),
      camber: clamp(latSlope, -0.35, 0.35),
    }
  }
  cached = {
    samples,
    N: n,
    ds: layout.ds,
    length: layout.lapLength,
    startIndex: layout.startIndex,
    gridIndex: layout.gridIndex,
  }
  return cached
}

/**
 * Index of the sample nearest a planar point. With a hint this is a local
 * search around the previous answer (the car moves at most a couple of samples
 * per tick); without one, or if the hint has gone stale, a coarse global scan.
 */
export function nearestSample(track: TrackFrame, x: number, z: number, hint?: number): number {
  const { samples, N } = track
  if (hint == null || !Number.isFinite(hint)) return globalNearest(track, x, z)
  let best = hint
  let bestD = Infinity
  for (let o = -30; o <= 60; o++) {
    const i = (((hint + o) % N) + N) % N
    const dx = x - samples[i].x
    const dz = z - samples[i].z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (bestD > 90 * 90) return globalNearest(track, x, z)
  return best
}

function globalNearest(track: TrackFrame, x: number, z: number): number {
  const { samples, N } = track
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < N; i += 4) {
    const dx = x - samples[i].x
    const dz = z - samples[i].z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** Signed lateral offset of a planar point from sample `i`'s centreline. */
export function lateralAt(track: TrackFrame, x: number, z: number, i: number): number {
  const s = track.samples[i]
  return (x - s.x) * s.nx + (z - s.z) * s.nz
}

/**
 * Road surface height under a planar point, interpolated along the lap and
 * offset by the measured cross-slope. `hint` keeps the sample search local.
 */
export function surfaceY(track: TrackFrame, x: number, z: number, hint?: number): number {
  const { samples, N } = track
  const i = nearestSample(track, x, z, hint)
  const s = samples[i]
  const along = (x - s.x) * s.tx + (z - s.z) * s.tz
  const j = (((along >= 0 ? i + 1 : i - 1) % N) + N) % N
  const f = clamp(Math.abs(along) / track.ds, 0, 1)
  const other = samples[j]
  const y = s.y * (1 - f) + other.y * f
  const slope = s.latSlope * (1 - f) + other.latSlope * f
  const lat = (x - s.x) * s.nx + (z - s.z) * s.nz
  return y + slope * lat
}
