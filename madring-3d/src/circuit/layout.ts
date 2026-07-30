/**
 * Procedural circuit layout.
 *
 * Takes the 64 real centreline control points from ./centreline and turns them
 * into an evenly-sampled 3D road: arc length, signed curvature, elevation,
 * banking, width, and an orthonormal road frame at every sample.
 *
 * Everything downstream (visual ribbons, collision trimesh, kerbs, tunnels,
 * start/finish, grid pose) is generated from this one description, so the shape
 * is never restyled by hand — it is exactly the projected geodata.
 *
 * World units are metres, at TRUE SCALE: one lap is ~5.3 km. The centreline
 * pixels are divided by MADRING_WORLD.scale (px per metre) and re-centred on
 * the origin. Image +y maps to world +z so the layout reads the same way up as
 * the source map when seen from above (that is also how the minimap camera
 * looks at it).
 */
import { CatmullRomCurve3, Vector3 } from 'three'

import { MADRING_CP, MADRING_WORLD } from './centreline'

/** Number of evenly spaced samples around the lap (~5.2 m apart). */
export const SAMPLES = 1024

/** Half-width of the asphalt, metres. Real circuit is 12 m / 15 m on the main
 * straight; widened here for playability with an arcade vehicle. */
export const HALF_WIDTH = 7
export const HALF_WIDTH_MAIN = 7.5
/** Kerb width and height, metres. */
export const KERB_WIDTH = 1
export const KERB_HEIGHT = 0.12
/** Flat run-off apron outside the kerb, metres, and how far it drops. */
export const APRON_WIDTH = 9
export const APRON_DROP = 0.9

/** Total elevation change over a lap, metres (published figure: 10 m). */
export const ELEVATION_RANGE = 10

/** La Monumental: banking as a percentage grade, and the length it is held. */
export const MONUMENTAL_BANKING = 0.24
export const MONUMENTAL_LENGTH = 550
/** Ramp in/out length for the banking transition, metres. */
const BANK_RAMP = 130
/** Gentle banking elsewhere, proportional to curvature, capped at this grade. */
const CORNER_BANKING_MAX = 0.05
const CORNER_BANKING_GAIN = 4.5

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const wrap = (i: number, n: number): number => ((i % n) + n) % n

/** Circular moving average. */
function smooth(values: number[], halfWindow: number): number[] {
  const n = values.length
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = -halfWindow; j <= halfWindow; j++) sum += values[wrap(i + j, n)]
    out[i] = sum / (2 * halfWindow + 1)
  }
  return out
}

export interface Sample {
  /** Centreline position, elevation included. */
  p: Vector3
  /** Unit tangent (direction of travel). */
  t: Vector3
  /** Unit "driver's right", rotated by the banking angle. */
  r: Vector3
  /** Unit road normal, rotated by the banking angle. */
  u: Vector3
  /** Arc length from the start/finish line, metres. */
  s: number
  /** Signed curvature, 1/m. Positive turns right. */
  k: number
  /** Banking angle, radians. */
  bank: number
  /** Half-width of the asphalt here, metres. */
  halfWidth: number
}

export interface Section {
  /** Inclusive sample index range (may wrap past the end of the lap). */
  from: number
  to: number
  /** Arc length range, metres. */
  sFrom: number
  sTo: number
  length: number
}

export interface Layout {
  samples: Sample[]
  /** Lap length of the generated curve, metres. */
  lapLength: number
  /** Spacing between samples, metres. */
  ds: number
  /** The signature banked loop. */
  monumental: Section & { radius: number; headingChange: number }
  /** The two tunnel sections (cosmetic arches). */
  tunnels: Section[]
  /** The straight that carries the start/finish line. */
  mainStraight: Section
  /** Where the car is placed, a little before the line. */
  grid: { position: [number, number, number]; rotation: [number, number, number] }
  /** Sample index of the start/finish line (arc length 0). */
  startIndex: number
}

/** Vertex position at lateral offset `u` metres and height `h` above the road. */
export function pointAt(sample: Sample, u: number, h: number, target = new Vector3()): Vector3 {
  return target
    .copy(sample.p)
    .addScaledVector(sample.r, u)
    .addScaledVector(sample.u, h)
}

/** Wrapped arc-length difference in [-lap/2, lap/2]. */
export function arcDelta(a: number, b: number, lap: number): number {
  let d = a - b
  while (d > lap / 2) d -= lap
  while (d < -lap / 2) d += lap
  return d
}

function build(): Layout {
  const { W, H, scale } = MADRING_WORLD

  // --- flat centreline curve, in metres, centred on the origin -------------
  const control = MADRING_CP.map((p) => new Vector3((p.x - W / 2) / scale, 0, (p.y - H / 2) / scale))
  // `centripetal` avoids the cusps/overshoot a uniform Catmull-Rom produces on
  // the tight hairpins; the control points are already evenly spaced.
  const curve = new CatmullRomCurve3(control, true, 'centripetal', 0.5)
  const lapLength = curve.getLength()
  const ds = lapLength / SAMPLES

  const flat = curve.getSpacedPoints(SAMPLES)
  flat.pop() // getSpacedPoints repeats the first point on a closed curve

  // --- signed curvature ----------------------------------------------------
  const rawK = new Array<number>(SAMPLES)
  for (let i = 0; i < SAMPLES; i++) {
    const a = flat[wrap(i - 1, SAMPLES)]
    const b = flat[i]
    const c = flat[wrap(i + 1, SAMPLES)]
    const t1x = b.x - a.x
    const t1z = b.z - a.z
    const t2x = c.x - b.x
    const t2z = c.z - b.z
    const l1 = Math.hypot(t1x, t1z) || 1e-6
    const l2 = Math.hypot(t2x, t2z) || 1e-6
    const cross = (t1x * t2z - t1z * t2x) / (l1 * l2)
    const dot = (t1x * t2x + t1z * t2z) / (l1 * l2)
    rawK[i] = Math.atan2(cross, dot) / ((l1 + l2) / 2)
  }
  const k = smooth(rawK, 6)

  // --- find La Monumental: the longest sustained single-direction turn -----
  // Prefix sums over the signed curvature: the ~550 m window whose *signed*
  // mean curvature is largest in magnitude is by definition the section that
  // turns hardest and never changes direction. On this layout that is the
  // teardrop loop at the north end.
  const windowSamples = Math.max(2, Math.round(MONUMENTAL_LENGTH / ds))
  const prefix = new Array<number>(SAMPLES * 2 + 1)
  prefix[0] = 0
  for (let i = 0; i < SAMPLES * 2; i++) prefix[i + 1] = prefix[i] + k[wrap(i, SAMPLES)]
  let bestStart = 0
  let bestMean = 0
  for (let i = 0; i < SAMPLES; i++) {
    const mean = (prefix[i + windowSamples] - prefix[i]) / windowSamples
    if (Math.abs(mean) > Math.abs(bestMean)) {
      bestMean = mean
      bestStart = i
    }
  }
  const monumental = {
    from: bestStart,
    to: wrap(bestStart + windowSamples, SAMPLES),
    sFrom: bestStart * ds,
    sTo: (bestStart + windowSamples) * ds,
    length: windowSamples * ds,
    radius: Math.abs(1 / bestMean),
    headingChange: bestMean * windowSamples * ds,
  }

  // --- banking -------------------------------------------------------------
  // La Monumental gets the published 24% grade, ramped in and out; every other
  // corner gets a mild curvature-proportional grade so corners read as banked.
  const bankGrade = new Array<number>(SAMPLES)
  const monumentalSign = Math.sign(bestMean)
  for (let i = 0; i < SAMPLES; i++) {
    const generic = Math.sign(k[i]) * Math.min(CORNER_BANKING_MAX, Math.abs(k[i]) * CORNER_BANKING_GAIN)

    // distance in metres inside the monumental window (negative = outside)
    const s = i * ds
    const dIn = arcDelta(s, monumental.sFrom, lapLength)
    const dOut = arcDelta(monumental.sTo, s, lapLength)
    const ramp = Math.min(smoothstep(0, BANK_RAMP, dIn), smoothstep(0, BANK_RAMP, dOut))
    const monu = monumentalSign * MONUMENTAL_BANKING * ramp

    bankGrade[i] = Math.abs(monu) > Math.abs(generic) ? monu : generic
  }
  const bank = smooth(bankGrade, 5).map(Math.atan)

  // --- straights, main straight and tunnels --------------------------------
  const isStraight = (i: number) => Math.abs(k[wrap(i, SAMPLES)]) < 1 / 600
  const straights: Section[] = []
  {
    let runStart: number | null = null
    for (let i = 0; i < SAMPLES * 2; i++) {
      if (isStraight(i)) {
        if (runStart === null) runStart = i
      } else if (runStart !== null) {
        if (i - runStart < SAMPLES) {
          straights.push({
            from: wrap(runStart, SAMPLES),
            to: wrap(i, SAMPLES),
            sFrom: wrap(runStart, SAMPLES) * ds,
            sTo: wrap(i, SAMPLES) * ds,
            length: (i - runStart) * ds,
          })
        }
        runStart = null
      }
    }
  }
  straights.sort((a, b) => b.length - a.length)
  // de-duplicate the wrapped copies
  const uniqueStraights = straights.filter((s, i) => straights.findIndex((o) => o.from === s.from) === i)

  const contains = (sec: Section, i: number) => {
    const span = wrap(sec.to - sec.from, SAMPLES)
    return wrap(i - sec.from, SAMPLES) <= span
  }
  const mainStraight = uniqueStraights.find((s) => contains(s, 0)) ?? uniqueStraights[0]
  const tunnels = uniqueStraights.filter((s) => s !== mainStraight && s.length > 140).slice(0, 2)

  // --- elevation -----------------------------------------------------------
  // Two harmonics of the lap, so the profile is smooth and closes on itself.
  // Scaled to the published 10 m of elevation change.
  const rawElevation = (u: number) => Math.sin(2 * Math.PI * u + 0.9) + 0.55 * Math.sin(4 * Math.PI * u + 2.4)
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < SAMPLES; i++) {
    const e = rawElevation(i / SAMPLES)
    lo = Math.min(lo, e)
    hi = Math.max(hi, e)
  }
  const eScale = ELEVATION_RANGE / (hi - lo)
  const eOffset = -((lo + hi) / 2) * eScale

  // --- width ---------------------------------------------------------------
  // The main straight is wider, like the real one.
  const halfWidths = new Array<number>(SAMPLES)
  for (let i = 0; i < SAMPLES; i++) {
    const inMain = contains(mainStraight, i) ? 1 : 0
    halfWidths[i] = HALF_WIDTH + (HALF_WIDTH_MAIN - HALF_WIDTH) * inMain
  }
  const halfWidth = smooth(halfWidths, 10)

  // --- assemble the road frames -------------------------------------------
  const points = flat.map((p, i) => new Vector3(p.x, rawElevation(i / SAMPLES) * eScale + eOffset, p.z))

  const up = new Vector3(0, 1, 0)
  const samples: Sample[] = []
  for (let i = 0; i < SAMPLES; i++) {
    const p = points[i]
    const t = new Vector3().subVectors(points[wrap(i + 1, SAMPLES)], points[wrap(i - 1, SAMPLES)]).normalize()
    // Road frame, not a Frenet frame: the road never rolls except where we bank it.
    const r = new Vector3().crossVectors(t, up).normalize()
    const u = new Vector3().crossVectors(r, t).normalize()
    // Roll about the tangent so the outside of the corner rises.
    const phi = bank[i]
    const rBanked = new Vector3().addScaledVector(r, Math.cos(phi)).addScaledVector(u, -Math.sin(phi)).normalize()
    const uBanked = new Vector3().crossVectors(rBanked, t).normalize()
    samples.push({ p, t, r: rBanked, u: uBanked, s: i * ds, k: k[i], bank: bank[i], halfWidth: halfWidth[i] })
  }

  // --- grid slot -----------------------------------------------------------
  // A few car lengths before the line, on the racing line, facing forward.
  const gridIndex = wrap(-Math.round(25 / ds), SAMPLES)
  const g = samples[gridIndex]
  const gp = pointAt(g, 0, 1.2)
  // The chassis is modelled nose-toward local -Z, so yaw = atan2(-Tx, -Tz).
  const yaw = Math.atan2(-g.t.x, -g.t.z)

  return {
    samples,
    lapLength,
    ds,
    monumental,
    tunnels,
    mainStraight,
    startIndex: 0,
    grid: { position: [gp.x, gp.y, gp.z], rotation: [0, yaw, 0] },
  }
}

let cached: Layout | null = null

export function getLayout(): Layout {
  if (!cached) cached = build()
  return cached
}
