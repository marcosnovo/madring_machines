/**
 * Fit the Sketchfab circuit model to our centreline, then read the road back
 * out of it.
 *
 *   in   assets/madring-sketchfab/scene.gltf  (+ scene.bin)
 *   out  src/circuit/fit.json        the transform, and how well it fits
 *        src/circuit/road.ts         the centreline, measured off the model
 *
 * Two things happen here.
 *
 * 1. ALIGNMENT.  The model is metric (1 unit = 1 m) and Z-up. Our world is
 *    Y-up, metric, and centred on the origin, with the layout derived from
 *    MADRING_CP (bacinger/f1-circuits, projected). To put the two in the same
 *    place we fit a rigid transform — yaw about Y, translation in XZ, no
 *    scaling, because both are already at true metric scale — by ICP: every
 *    vertex of the model's TarmacDark mesh is pushed to its nearest point on
 *    the Catmull-Rom centreline, and we minimise a *trimmed* RMS (worst 20% of
 *    residuals dropped) so that the pit lane, the run-off aprons and the
 *    stretches where the projected geodata and the artist's layout genuinely
 *    disagree do not drag the whole circuit sideways. 360 starting yaws are
 *    tried, mirrored and not, then Nelder-Mead refines the winner.
 *
 * 2. THE ROAD.  A rigid fit still leaves several metres of local disagreement
 *    — the two circuits are the same shape but not the same curve. Since the
 *    model is now what the player sees and drives on, the model wins: the
 *    aligned tarmac is rasterised to a 1 m occupancy/height grid, and for each
 *    sample the road is *measured* — scan left and right from the centreline
 *    until the tarmac ends, take the midpoint, the two half-widths, the surface
 *    height, and the cross-slope. That is written out as road.ts and becomes
 *    the centreline the game uses for lap timing, the minimap, respawns, the
 *    grid slot and the invisible walls, so all of them sit on the model's
 *    asphalt rather than near it.
 *
 * It also writes docs/fit-plan.png, a plan view of all of that, so the result
 * can be checked by eye.
 *
 * Run with `npm run build:fit`; the ICP takes a couple of minutes. Pass
 * `--road-only` to reuse the transform already in fit.json and re-measure the
 * road in under a second, which is what you want while tuning the scan.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
const crc32 = (buf) => {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SRC = resolve(ROOT, 'assets/madring-sketchfab')

/** Samples around the lap in the generated road. */
const SAMPLES = 1024
/** Raster cell size for the tarmac occupancy grid, metres. */
const CELL = 1
/** How far either side of a sample we look for the edge of the asphalt. */
const SCAN = 26
/** How far a sample may look sideways for asphalt to start with, and how far
 *  the snapped centre may end up from where the sample started. Both are caps
 *  against latching onto the wrong ribbon: the pit lane runs alongside the
 *  track, and the model has escape roads. */
/** Clamp on the measured half-width, metres. Stops the pit lane and the wide
 *  run-off aprons from being read as "road". */
const HALF_MIN = 4.5
const HALF_MAX = 18

// ---------------------------------------------------------------------------
// glTF reading (POSITION accessors only — no dependencies needed)
// ---------------------------------------------------------------------------
const gltf = JSON.parse(readFileSync(resolve(SRC, 'scene.gltf'), 'utf8'))
const bin = readFileSync(resolve(SRC, 'scene.bin'))
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }

function readVec3(accessorIndex) {
  const a = gltf.accessors[accessorIndex]
  if (a.componentType !== 5126 || a.type !== 'VEC3') throw new Error('expected float VEC3')
  const bv = gltf.bufferViews[a.bufferView]
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0)
  const stride = bv.byteStride || 12
  const out = new Float32Array(a.count * 3)
  for (let i = 0; i < a.count; i++) {
    const o = base + i * stride
    out[i * 3] = bin.readFloatLE(o)
    out[i * 3 + 1] = bin.readFloatLE(o + 4)
    out[i * 3 + 2] = bin.readFloatLE(o + 8)
  }
  return out
}

function readIndices(accessorIndex) {
  const a = gltf.accessors[accessorIndex]
  const bv = gltf.bufferViews[a.bufferView]
  const size = a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0)
  const stride = bv.byteStride || size * NC[a.type]
  const out = new Uint32Array(a.count)
  for (let i = 0; i < a.count; i++) {
    const o = base + i * stride
    out[i] = size === 4 ? bin.readUInt32LE(o) : size === 2 ? bin.readUInt16LE(o) : bin.readUInt8(o)
  }
  return out
}

/** Every primitive whose material name starts with one of `names`. */
function primitivesOf(names) {
  const out = []
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      const material = gltf.materials[prim.material]?.name ?? ''
      if (!names.some((n) => material.startsWith(n))) continue
      out.push({ position: readVec3(prim.attributes.POSITION), indices: readIndices(prim.indices) })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// our centreline (a verbatim re-read of src/circuit/centreline.ts)
// ---------------------------------------------------------------------------
const centrelineSrc = readFileSync(resolve(ROOT, 'src/circuit/centreline.ts'), 'utf8')
const world = /MADRING_WORLD = \{ W: (\d+), H: (\d+), scale: ([\d.]+)/.exec(centrelineSrc)
const W = +world[1]
const H = +world[2]
const PX_PER_M = +world[3]
const CP = [...centrelineSrc.matchAll(/\{\s*x:\s*(-?\d+),\s*y:\s*(-?\d+)\s*\}/g)].map((m) => [(+m[1] - W / 2) / PX_PER_M, (+m[2] - H / 2) / PX_PER_M])
if (CP.length !== 64) throw new Error(`expected 64 control points, got ${CP.length}`)

/** Closed centripetal Catmull-Rom, the same curve src/circuit/layout.ts builds. */
function catmullRom(points, samplesPerSegment = 96) {
  const n = points.length
  const alpha = 0.5
  const out = []
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]
    const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]) ** alpha
    const t0 = 0
    const t1 = t0 + d(p0, p1)
    const t2 = t1 + d(p1, p2)
    const t3 = t2 + d(p2, p3)
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = t1 + ((t2 - t1) * s) / samplesPerSegment
      const lerp = (a, b, ta, tb) => [
        ((tb - t) / (tb - ta)) * a[0] + ((t - ta) / (tb - ta)) * b[0],
        ((tb - t) / (tb - ta)) * a[1] + ((t - ta) / (tb - ta)) * b[1],
      ]
      const a1 = lerp(p0, p1, t0, t1)
      const a2 = lerp(p1, p2, t1, t2)
      const a3 = lerp(p2, p3, t2, t3)
      const b1 = lerp(a1, a2, t0, t2)
      const b2 = lerp(a2, a3, t1, t3)
      out.push(lerp(b1, b2, t1, t2))
    }
  }
  return out
}

const CURVE = catmullRom(CP)
const curveLength = CURVE.reduce((sum, p, i) => sum + Math.hypot(p[0] - CURVE[(i + 1) % CURVE.length][0], p[1] - CURVE[(i + 1) % CURVE.length][1]), 0)

// ---------------------------------------------------------------------------
// nearest-point lookups against the centreline
// ---------------------------------------------------------------------------
const HASH = 12
const hash = new Map()
const hkey = (i, j) => i * 100000 + j
CURVE.forEach((p, i) => {
  const k = hkey(Math.floor(p[0] / HASH), Math.floor(p[1] / HASH))
  let list = hash.get(k)
  if (!list) hash.set(k, (list = []))
  list.push(i)
})

function nearestOnCurve(x, z) {
  const cx = Math.floor(x / HASH)
  const cz = Math.floor(z / HASH)
  let best = Infinity
  for (let r = 0; r < 80; r++) {
    for (let i = cx - r; i <= cx + r; i++) {
      for (let j = cz - r; j <= cz + r; j++) {
        if (r > 0 && Math.abs(i - cx) < r && Math.abs(j - cz) < r) continue
        const list = hash.get(hkey(i, j))
        if (!list) continue
        for (const idx of list) {
          const d = (CURVE[idx][0] - x) ** 2 + (CURVE[idx][1] - z) ** 2
          if (d < best) best = d
        }
      }
    }
    if (best < Infinity && Math.sqrt(best) <= r * HASH) break
  }
  return Math.sqrt(best)
}

/** A coarse distance field, so the 720-way coarse yaw search is not O(forever). */
const DF_CELL = 4
const DF_X0 = -2400
const DF_Z0 = -2400
const DF_N = 1200
const df = new Float32Array(DF_N * DF_N).fill(1e6)
for (const p of CURVE) {
  const i = Math.round((p[0] - DF_X0) / DF_CELL)
  const j = Math.round((p[1] - DF_Z0) / DF_CELL)
  if (i >= 0 && i < DF_N && j >= 0 && j < DF_N) df[j * DF_N + i] = 0
}
{
  const A = DF_CELL
  const B = DF_CELL * Math.SQRT2
  for (let j = 1; j < DF_N - 1; j++)
    for (let i = 1; i < DF_N - 1; i++) {
      const k = j * DF_N + i
      df[k] = Math.min(df[k], df[k - 1] + A, df[k - DF_N] + A, df[k - DF_N - 1] + B, df[k - DF_N + 1] + B)
    }
  for (let j = DF_N - 2; j > 0; j--)
    for (let i = DF_N - 2; i > 0; i--) {
      const k = j * DF_N + i
      df[k] = Math.min(df[k], df[k + 1] + A, df[k + DF_N] + A, df[k + DF_N + 1] + B, df[k + DF_N - 1] + B)
    }
}
const dfAt = (x, z) => {
  const i = Math.round((x - DF_X0) / DF_CELL)
  const j = Math.round((z - DF_Z0) / DF_CELL)
  return i < 0 || i >= DF_N || j < 0 || j >= DF_N ? 4000 : df[j * DF_N + i]
}

// ---------------------------------------------------------------------------
// the model's tarmac, in the model's own frame, converted Z-up -> Y-up
// ---------------------------------------------------------------------------
const tarmacPrims = primitivesOf(['TarmacDark'])
if (!tarmacPrims.length) throw new Error('no TarmacDark primitive found')

/** Source is Z-up: (x, y, z)_src -> (x, z, -y) is wrong for glTF's own root
 *  rotation; the composed scene matrices come out as (x, y, z) -> (x, -z, y). */
const srcToModel = (x, y, z) => [x, -z, y]

const tarmacXZ = []
const tarmacY = []
for (const { position } of tarmacPrims) {
  for (let i = 0; i < position.length; i += 3) {
    const [mx, my, mz] = srcToModel(position[i], position[i + 1], position[i + 2])
    tarmacXZ.push(mx, mz)
    tarmacY.push(my)
  }
}
const VERTS = tarmacY.length
console.log(`tarmac vertices   ${VERTS.toLocaleString('en-US')}`)
console.log(`centreline        ${CURVE.length} samples, ${curveLength.toFixed(1)} m`)

// ---------------------------------------------------------------------------
// 1. ICP: rigid yaw + translation, trimmed least squares
// ---------------------------------------------------------------------------
const TRIM = 0.8

function trimmedRms(theta, tx, tz, mirror, step, exact) {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const ds = []
  for (let i = 0; i < VERTS; i += step) {
    const x0 = mirror ? -tarmacXZ[i * 2] : tarmacXZ[i * 2]
    const z0 = tarmacXZ[i * 2 + 1]
    const x = x0 * c - z0 * s + tx
    const z = x0 * s + z0 * c + tz
    ds.push(exact ? nearestOnCurve(x, z) : dfAt(x, z))
  }
  ds.sort((a, b) => a - b)
  const keep = Math.max(1, Math.floor(ds.length * TRIM))
  let sum = 0
  for (let i = 0; i < keep; i++) sum += ds[i] * ds[i]
  return Math.sqrt(sum / keep)
}

const centroid = (() => {
  let x = 0
  let z = 0
  for (let i = 0; i < VERTS; i++) {
    x += tarmacXZ[i * 2]
    z += tarmacXZ[i * 2 + 1]
  }
  return [x / VERTS, z / VERTS]
})()
const curveCentroid = CURVE.reduce((a, p) => [a[0] + p[0] / CURVE.length, a[1] + p[1] / CURVE.length], [0, 0])

/** `--road-only` reuses the transform in fit.json and just re-measures the road. */
const ROAD_ONLY = process.argv.includes('--road-only')
const cached = ROAD_ONLY ? JSON.parse(readFileSync(resolve(ROOT, 'src/circuit/fit.json'), 'utf8')).transform : null

let coarse = cached ? { v: 0, theta: cached.theta, tx: cached.tx, tz: cached.tz, mirror: cached.mirror, deg: 0 } : null
for (const mirror of cached ? [] : [false, true]) {
  for (let deg = 0; deg < 360; deg++) {
    const theta = (deg * Math.PI) / 180
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    const mx = mirror ? -centroid[0] : centroid[0]
    const tx = curveCentroid[0] - (mx * c - centroid[1] * s)
    const tz = curveCentroid[1] - (mx * s + centroid[1] * c)
    const v = trimmedRms(theta, tx, tz, mirror, 41, false)
    if (!coarse || v < coarse.v) coarse = { v, theta, tx, tz, mirror, deg }
  }
}
console.log(`coarse yaw        ${coarse.deg}deg mirror=${coarse.mirror} trimmed-rms(4m grid) ${coarse.v.toFixed(2)} m`)

function nelderMead(f, x0, steps, iterations) {
  const n = x0.length
  let simplex = [x0.slice()]
  for (let i = 0; i < n; i++) {
    const v = x0.slice()
    v[i] += steps[i]
    simplex.push(v)
  }
  let values = simplex.map(f)
  for (let it = 0; it < iterations; it++) {
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
    simplex = order.map((i) => simplex[i])
    values = order.map((i) => values[i])
    const centre = new Array(n).fill(0)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centre[j] += simplex[i][j] / n
    const worst = simplex[n]
    const reflected = centre.map((c, j) => c + (c - worst[j]))
    const fr = f(reflected)
    if (fr < values[0]) {
      const expanded = centre.map((c, j) => c + 2 * (c - worst[j]))
      const fe = f(expanded)
      if (fe < fr) {
        simplex[n] = expanded
        values[n] = fe
      } else {
        simplex[n] = reflected
        values[n] = fr
      }
    } else if (fr < values[n - 1]) {
      simplex[n] = reflected
      values[n] = fr
    } else {
      const contracted = centre.map((c, j) => c + 0.5 * (worst[j] - c))
      const fc = f(contracted)
      if (fc < values[n]) {
        simplex[n] = contracted
        values[n] = fc
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]))
          values[i] = f(simplex[i])
        }
      }
    }
  }
  const best = values.indexOf(Math.min(...values))
  return { x: simplex[best], f: values[best] }
}

const mirror = coarse.mirror
let fit = { x: [coarse.theta, coarse.tx, coarse.tz] }
if (!cached) {
  fit = nelderMead((p) => trimmedRms(p[0], p[1], p[2], mirror, 41, false), fit.x, [0.05, 20, 20], 160)
  fit = nelderMead((p) => trimmedRms(p[0], p[1], p[2], mirror, 23, true), fit.x, [0.01, 6, 6], 200)
  fit = nelderMead((p) => trimmedRms(p[0], p[1], p[2], mirror, 11, true), fit.x, [0.002, 1.5, 1.5], 180)
}
const [THETA, TX, TZ] = fit.x
console.log(`fitted yaw        ${((THETA * 180) / Math.PI).toFixed(4)} deg`)
console.log(`fitted offset     tx ${TX.toFixed(3)} m   tz ${TZ.toFixed(3)} m`)

const COS = Math.cos(THETA)
const SIN = Math.sin(THETA)
/** model frame (Y-up, metric) -> world */
const toWorld = (mx, my, mz) => [(mirror ? -mx : mx) * COS - mz * SIN + TX, my, (mirror ? -mx : mx) * SIN + mz * COS + TZ]

const residuals = []
for (let i = 0; i < VERTS; i++) {
  const [x, , z] = toWorld(tarmacXZ[i * 2], 0, tarmacXZ[i * 2 + 1])
  residuals.push(nearestOnCurve(x, z))
}
residuals.sort((a, b) => a - b)
const pct = (p) => residuals[Math.min(residuals.length - 1, Math.floor(residuals.length * p))]
const stats = {
  mean: residuals.reduce((a, b) => a + b, 0) / residuals.length,
  median: pct(0.5),
  p95: pct(0.95),
  max: residuals[residuals.length - 1],
}
console.log(
  `tarmac vs centreline  mean ${stats.mean.toFixed(2)} m  median ${stats.median.toFixed(2)} m  p95 ${stats.p95.toFixed(2)} m  max ${stats.max.toFixed(2)} m`,
)

// ---------------------------------------------------------------------------
// 2. rasterise the aligned tarmac and measure the road off it
// ---------------------------------------------------------------------------
let minX = Infinity
let minZ = Infinity
let maxX = -Infinity
let maxZ = -Infinity
const worldPos = []
for (const { position } of tarmacPrims) {
  const w = new Float32Array(position.length)
  for (let i = 0; i < position.length; i += 3) {
    const [mx, my, mz] = srcToModel(position[i], position[i + 1], position[i + 2])
    const [x, y, z] = toWorld(mx, my, mz)
    w[i] = x
    w[i + 1] = y
    w[i + 2] = z
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  worldPos.push(w)
}
const GX = Math.ceil((maxX - minX) / CELL) + 2
const GZ = Math.ceil((maxZ - minZ) / CELL) + 2
const height = new Float32Array(GX * GZ).fill(NaN)
console.log(`tarmac raster     ${GX} x ${GZ} cells of ${CELL} m`)

let rasterised = 0
tarmacPrims.forEach(({ indices }, p) => {
  const pos = worldPos[p]
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3
    const b = indices[t + 1] * 3
    const c = indices[t + 2] * 3
    const ax = pos[a]
    const az = pos[a + 2]
    const bx = pos[b]
    const bz = pos[b + 2]
    const cx = pos[c]
    const cz = pos[c + 2]
    const i0 = Math.floor((Math.min(ax, bx, cx) - minX) / CELL)
    const i1 = Math.ceil((Math.max(ax, bx, cx) - minX) / CELL)
    const j0 = Math.floor((Math.min(az, bz, cz) - minZ) / CELL)
    const j1 = Math.ceil((Math.max(az, bz, cz) - minZ) / CELL)
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(det) < 1e-12) continue
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (i < 0 || i >= GX || j < 0 || j >= GZ) continue
        const x = minX + (i + 0.5) * CELL
        const z = minZ + (j + 0.5) * CELL
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det
        const l3 = 1 - l1 - l2
        if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue
        const y = l1 * pos[a + 1] + l2 * pos[b + 1] + l3 * pos[c + 1]
        const k = j * GX + i
        if (Number.isNaN(height[k]) || y > height[k]) height[k] = y
        rasterised++
      }
    }
  }
})
console.log(`raster cells hit  ${rasterised.toLocaleString('en-US')}`)

const occupied = (x, z) => {
  const i = Math.floor((x - minX) / CELL)
  const j = Math.floor((z - minZ) / CELL)
  if (i < 0 || i >= GX || j < 0 || j >= GZ) return NaN
  return height[j * GX + i]
}

/** Even-arc-length resample of a closed polyline. */
function resample(points, n) {
  const m = points.length
  const seg = []
  let total = 0
  for (let i = 0; i < m; i++) {
    const a = points[i]
    const b = points[(i + 1) % m]
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    seg.push(d)
    total += d
  }
  const out = []
  let i = 0
  let acc = 0
  for (let k = 0; k < n; k++) {
    const target = (total * k) / n
    while (acc + seg[i] < target) {
      acc += seg[i]
      i = (i + 1) % m
    }
    const t = seg[i] > 1e-9 ? (target - acc) / seg[i] : 0
    const a = points[i]
    const b = points[(i + 1) % m]
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return { points: out, length: total }
}

const smoothClosed = (values, half) => {
  const n = values.length
  return values.map((_, i) => {
    let sum = 0
    for (let j = -half; j <= half; j++) sum += values[(i + j + n * 2) % n]
    return sum / (2 * half + 1)
  })
}

/**
 * One pass: move every sample sideways onto the middle of the asphalt.
 *
 * `reach` is how far sideways a sample may look for asphalt at all, and how far
 * the result may end up from where it started. A wide reach drags the samples
 * onto the model's road where the two layouts disagree the most (the north
 * loop is over 20 m out); a narrow one keeps a sample that is already on the
 * road from hopping onto the pit lane or an escape road running alongside.
 * So the caller starts wide and narrows.
 *
 * The scan line is cut into contiguous runs of asphalt and we take the nearest
 * run that is *road-shaped* — no wider than ROAD_MAX. That matters more than it
 * sounds: the model's run-off aprons and escape roads are asphalt too, joined
 * to the track, and the projected centreline passes straight through one of
 * them on the outside of the north loop. Taking the nearest asphalt would park
 * a hundred metres of centreline in a lay-by. If no run is road-shaped (the
 * pit straight, where track and pit lane are one 40 m slab), we fall back to
 * the nearest run and cap each edge at EDGE_CAP so the midpoint stays on the
 * track rather than drifting into the pit lane.
 */
const EDGE_CAP = 20
const ROAD_MAX = 36
/** How far sideways the scan looks for the runs of asphalt, and the furthest
 *  out an asphalt edge is reported (the walls are built on those edges). */
const WINDOW = 60
const EDGE_MAX = 26

function snap(points, reach, quiet) {
  const n = points.length
  const out = []
  let missed = 0
  const STEP = CELL / 2
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const a = points[(i - 1 + n) % n]
    const b = points[(i + 1) % n]
    const tx = b[0] - a[0]
    const tz = b[1] - a[1]
    const tl = Math.hypot(tx, tz) || 1
    // driver's right, in a Y-up world: r = t x up
    const rx = -tz / tl
    const rz = tx / tl

    // occupancy along the scan line, and the runs of asphalt in it. A run that
    // reaches the end of the window is `clipped`: we cannot tell how wide it
    // really is, so it is not a candidate for the road-shaped test.
    const runs = []
    let runStart = null
    for (let d = -WINDOW; d <= WINDOW + STEP * 1.5; d += STEP) {
      const inside = d <= WINDOW + STEP / 2
      const on = inside && !Number.isNaN(occupied(p[0] + rx * d, p[1] + rz * d))
      if (on && runStart === null) runStart = d
      else if (!on && runStart !== null) {
        const to = d - STEP
        runs.push({ from: runStart, to, clipped: runStart <= -WINDOW || to >= WINDOW - STEP / 2 })
        runStart = null
      }
    }
    // only runs we could actually reach count as candidates
    for (let k = runs.length - 1; k >= 0; k--) {
      const r = runs[k]
      if (r.from > reach || r.to < -reach) runs.splice(k, 1)
    }
    if (!runs.length) {
      missed++
      out.push({ x: p[0], z: p[1], y: NaN, half: NaN, edgeL: NaN, edgeR: NaN })
      continue
    }
    const distanceTo = (r) => (r.from > 0 ? r.from : r.to < 0 ? -r.to : 0)
    const shaped = runs.filter((r) => !r.clipped && r.to - r.from + STEP <= ROAD_MAX)
    let mid
    let half
    let edgeL
    let edgeR
    if (shaped.length) {
      const run = shaped.reduce((best, r) => (distanceTo(r) < distanceTo(best) ? r : best))
      mid = (run.from + run.to) / 2
      half = (run.to - run.from + STEP) / 2
      edgeL = half
      edgeR = half
    } else {
      const run = runs.reduce((best, r) => (distanceTo(r) < distanceTo(best) ? r : best))
      // nearest point of that run to the sample, then capped edges either side
      const anchor = Math.max(run.from, Math.min(run.to, 0))
      const dr = Math.min(EDGE_CAP, run.to - anchor)
      const dl = Math.min(EDGE_CAP, anchor - run.from)
      mid = anchor + (dr - dl) / 2
      half = (dr + dl) / 2
      edgeL = anchor - run.from - mid
      edgeR = run.to - anchor + mid
    }
    mid = Math.max(-reach, Math.min(reach, mid))
    half = Math.min(HALF_MAX, Math.max(HALF_MIN, half))
    const x = p[0] + rx * mid
    const z = p[1] + rz * mid
    out.push({
      x,
      z,
      y: occupied(x, z),
      half,
      edgeL: Math.min(EDGE_MAX, Math.max(HALF_MIN, edgeL)),
      edgeR: Math.min(EDGE_MAX, Math.max(HALF_MIN, edgeR)),
    })
  }
  if (missed && !quiet) console.log(`  pass reach ${reach} m: ${missed} of ${n} samples found no asphalt`)
  return out
}

/** Linearly interpolate the samples that found no asphalt across the gap. */
function bridgeGaps(snapped) {
  const n = snapped.length
  const ok = (i) => !Number.isNaN(snapped[(i + n) % n].half)
  if (!snapped.some((_, i) => ok(i))) return
  for (let i = 0; i < n; i++) {
    if (ok(i)) continue
    let before = i
    let after = i
    while (!ok(before)) before--
    while (!ok(after)) after++
    const a = snapped[(before + n * 2) % n]
    const b = snapped[after % n]
    const t = (i - before) / (after - before)
    snapped[i] = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: NaN, half: NaN, edgeL: NaN, edgeR: NaN }
  }
}

// Snap the projected centreline onto the model's asphalt: one wide pass to drag
// the samples across wherever the two layouts genuinely disagree, then three
// narrow ones to settle them in the middle of the road they landed on. Between
// passes the polyline is smoothed and re-spaced so a sample that missed the
// asphalt is carried along by its neighbours instead of being left behind.
let road = resample(CURVE, SAMPLES).points
for (const [reach, smoothing] of [
  [34, 8],
  [24, 3],
  [20, 2],
  [20, 2],
]) {
  const snapped = snap(road, reach)
  // A sample that found no asphalt at all is not left where it was — on the
  // outside of the north loop the projected centreline is 60 m off the model's
  // road, further than any scan we dare make. Instead it is interpolated
  // between the nearest samples that did land, which puts it close enough for
  // the next pass to snap it properly.
  bridgeGaps(snapped)
  const xs = smoothClosed(
    snapped.map((s) => s.x),
    smoothing,
  )
  const zs = smoothClosed(
    snapped.map((s) => s.z),
    smoothing,
  )
  road = resample(
    xs.map((x, i) => [x, zs[i]]),
    SAMPLES,
  ).points
}
const measured = snap(road, 20)
const lap = resample(road, SAMPLES).length

// heights: fill gaps, then smooth
let ys = measured.map((s) => s.y)
for (let i = 0; i < ys.length; i++) {
  if (!Number.isNaN(ys[i])) continue
  for (let d = 1; d < ys.length; d++) {
    const a = ys[(i - d + ys.length) % ys.length]
    const b = ys[(i + d) % ys.length]
    if (!Number.isNaN(a)) {
      ys[i] = a
      break
    }
    if (!Number.isNaN(b)) {
      ys[i] = b
      break
    }
  }
}
ys = smoothClosed(ys, 2)
const halves = smoothClosed(
  measured.map((s) => (Number.isNaN(s.half) ? HALF_MIN : s.half)),
  6,
)
// distance from the centreline to the edge of the paved corridor, left and
// right — this is where the invisible walls go, so it is smoothed hard enough
// that the walls do not zig-zag but not so hard that they cut a corner
const edgesL = smoothClosed(
  measured.map((s, i) => (Number.isNaN(s.edgeL) ? halves[i] : s.edgeL)),
  5,
)
const edgesR = smoothClosed(
  measured.map((s, i) => (Number.isNaN(s.edgeR) ? halves[i] : s.edgeR)),
  5,
)

// cross-slope, from the surface height at +-60% of the half-width
const banks = measured.map((s, i) => {
  const a = road[(i - 1 + SAMPLES) % SAMPLES]
  const b = road[(i + 1) % SAMPLES]
  const tx = b[0] - a[0]
  const tz = b[1] - a[1]
  const tl = Math.hypot(tx, tz) || 1
  const rx = -tz / tl
  const rz = tx / tl
  const d = halves[i] * 0.6
  const yr = occupied(s.x + rx * d, s.z + rz * d)
  const yl = occupied(s.x - rx * d, s.z - rz * d)
  if (Number.isNaN(yr) || Number.isNaN(yl)) return 0
  return Math.atan2(yl - yr, 2 * d) // positive = right side lower = banked right
})
const bank = smoothClosed(banks, 6)

// ---------------------------------------------------------------------------
// coverage check: is there asphalt everywhere the car can legally be?
// ---------------------------------------------------------------------------
// The walls stand on edgeL/edgeR, and cannon's drive surface is this same
// TarmacDark mesh, so any hole inside those edges is somewhere the car falls
// through the world. Sample a lateral line at every sample and count.
{
  let holes = 0
  let cells = 0
  for (let i = 0; i < SAMPLES; i++) {
    const a = road[(i - 1 + SAMPLES) % SAMPLES]
    const b = road[(i + 1) % SAMPLES]
    const tx = b[0] - a[0]
    const tz = b[1] - a[1]
    const tl = Math.hypot(tx, tz) || 1
    const rx = -tz / tl
    const rz = tx / tl
    const s = measured[i]
    const l = Number.isNaN(s.edgeL) ? HALF_MIN : s.edgeL
    const r = Number.isNaN(s.edgeR) ? HALF_MIN : s.edgeR
    for (let d = -l + 0.5; d <= r - 0.5; d += 1) {
      cells++
      if (Number.isNaN(occupied(s.x + rx * d, s.z + rz * d))) holes++
    }
  }
  console.log(`drivable coverage ${(((cells - holes) / cells) * 100).toFixed(2)}% of ${cells} sampled square metres between the walls`)
}

// ---------------------------------------------------------------------------
// where the start/finish line is: the model draws one, so use it
// ---------------------------------------------------------------------------
// The gantry over the start line is its own material. Its centroid, projected
// onto the measured road, is the sample the lap starts and ends on — which
// means the game's timing line and the model's painted line are the same line.
const gantry = primitivesOf(['startgantry'])
let startIndex = 0
if (gantry.length) {
  let gx = 0
  let gz = 0
  let count = 0
  for (const { position } of gantry) {
    for (let i = 0; i < position.length; i += 3) {
      const [mx, my, mz] = srcToModel(position[i], position[i + 1], position[i + 2])
      const [x, , z] = toWorld(mx, my, mz)
      gx += x
      gz += z
      count++
    }
  }
  gx /= count
  gz /= count
  let best = Infinity
  road.forEach((p, i) => {
    const d = (p[0] - gx) ** 2 + (p[1] - gz) ** 2
    if (d < best) {
      best = d
      startIndex = i
    }
  })
  console.log(`start gantry      (${gx.toFixed(1)}, ${gz.toFixed(1)}) -> sample ${startIndex}, ${Math.sqrt(best).toFixed(1)} m from the centreline`)
}

const elevation = { min: Math.min(...ys), max: Math.max(...ys) }
console.log(`measured lap      ${lap.toFixed(1)} m`)
console.log(`measured width    ${(2 * Math.min(...halves)).toFixed(1)} - ${(2 * Math.max(...halves)).toFixed(1)} m`)
console.log(
  `paved corridor    ${(Math.min(...edgesL) + Math.min(...edgesR)).toFixed(1)} - ${(Math.max(...edgesL) + Math.max(...edgesR)).toFixed(1)} m edge to edge`,
)
console.log(`measured elevation ${elevation.min.toFixed(1)} .. ${elevation.max.toFixed(1)} m  (range ${(elevation.max - elevation.min).toFixed(1)} m)`)
console.log(`measured bank     max ${((Math.max(...bank.map(Math.abs)) * 180) / Math.PI).toFixed(1)} deg`)

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------
const transform = { theta: THETA, scale: 1, tx: TX, ty: 0, tz: TZ, mirror }
writeFileSync(
  resolve(ROOT, 'src/circuit/fit.json'),
  JSON.stringify(
    {
      note: 'GENERATED by scripts/fit-circuit.mjs — rigid fit of the model TarmacDark mesh to MADRING_CP.',
      transform,
      residualsMetres: stats,
      tarmacVertices: VERTS,
    },
    null,
    2,
  ) + '\n',
)

const f2 = (v) => Number(v.toFixed(2))
const f4 = (v) => Number(v.toFixed(4))
const rows = road.map((p, i) => [f2(p[0]), f2(ys[i]), f2(p[1]), f2(edgesL[i]), f2(edgesR[i]), f4(bank[i])])
const body = rows.map((r) => '  ' + r.join(',') + ',').join('\n')

writeFileSync(
  resolve(ROOT, 'src/circuit/road.ts'),
  `// GENERATED DATA — do not edit by hand. Rebuild with \`npm run build:fit\`.
//
// The circuit centreline, measured off the 3D model rather than invented.
// scripts/fit-circuit.mjs aligns "Circuito de Madring 2026 layout" by Dave Love
// (CC-BY-4.0, see ../../NOTICE) to the projected geodata in ./centreline.ts,
// rasterises its TarmacDark mesh, and walks across the asphalt at every sample
// to find the middle of the road, its half-width, its height and its
// cross-slope. Everything the game does with the circuit — lap timing, the
// minimap, respawns, the grid slot, the invisible walls — is driven from here,
// so it all lines up with what the player can see.
//
//   samples    ${SAMPLES} at even arc length, ${(lap / SAMPLES).toFixed(2)} m apart
//   lap        ${lap.toFixed(1)} m
//   paved      ${(Math.min(...edgesL) + Math.min(...edgesR)).toFixed(1)} - ${(Math.max(...edgesL) + Math.max(...edgesR)).toFixed(1)} m wide, edge to edge
//   elevation  ${elevation.min.toFixed(1)} .. ${elevation.max.toFixed(1)} m
//   alignment  yaw ${((THETA * 180) / Math.PI).toFixed(4)}deg, offset (${TX.toFixed(2)}, ${TZ.toFixed(2)}) m, no scaling
//   fit        mean ${stats.mean.toFixed(2)} m / median ${stats.median.toFixed(2)} m from the projected centreline

/**
 * Six numbers per sample:
 *   x, y, z     the middle of the paved corridor, in world metres
 *   edgeL       metres from there to the left-hand edge of the asphalt
 *   edgeR       metres to the right-hand edge
 *   bank        cross-slope in radians, positive when the left side is higher
 */
export const ROAD_STRIDE = 6

export const ROAD_LAP = ${lap.toFixed(1)}

/** Sample index of the model's own start/finish gantry. */
export const ROAD_START = ${startIndex}

export const ROAD: number[] = [
${body}
]
`,
)
console.log('wrote src/circuit/fit.json and src/circuit/road.ts')

// ---------------------------------------------------------------------------
// a plan view of the fit, so it can be checked by eye rather than by faith
// ---------------------------------------------------------------------------
// docs/fit-plan.png: the model's asphalt in grey (shaded by height), the
// projected geodata control points in blue, the measured centreline in red and
// the lines the walls stand on in green. If the red follows the grey and the
// blue sits on it, the fit is right.
{
  const SCALE = 2 // metres per pixel
  const PAD = 12
  const W = Math.ceil((maxX - minX) / SCALE) + PAD * 2
  const H = Math.ceil((maxZ - minZ) / SCALE) + PAD * 2
  const rgb = Buffer.alloc(W * H * 3, 18)
  const at = (x, z) => [Math.round((x - minX) / SCALE) + PAD, Math.round((z - minZ) / SCALE) + PAD]
  const put = (x, z, r, g, b) => {
    const [i, j] = at(x, z)
    if (i < 0 || i >= W || j < 0 || j >= H) return
    const o = (j * W + i) * 3
    rgb[o] = r
    rgb[o + 1] = g
    rgb[o + 2] = b
  }
  const lo = elevation.min - 4
  const hi = elevation.max + 4
  for (let j = 0; j < GZ; j++) {
    for (let i = 0; i < GX; i++) {
      const y = height[j * GX + i]
      if (Number.isNaN(y)) continue
      const v = Math.round(70 + ((y - lo) / (hi - lo)) * 150)
      put(minX + i * CELL, minZ + j * CELL, v, v, v)
    }
  }
  for (const [x, z] of CP) for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) put(x + d * SCALE, z + e * SCALE, 80, 150, 255)
  road.forEach((p, i) => {
    const a = road[(i - 1 + SAMPLES) % SAMPLES]
    const b = road[(i + 1) % SAMPLES]
    const tx = b[0] - a[0]
    const tz = b[1] - a[1]
    const tl = Math.hypot(tx, tz) || 1
    const rx = -tz / tl
    const rz = tx / tl
    put(p[0] - rx * edgesL[i], p[1] - rz * edgesL[i], 60, 220, 90)
    put(p[0] + rx * edgesR[i], p[1] + rz * edgesR[i], 60, 220, 90)
    put(p[0], p[1], 255, 60, 60)
  })

  // minimal PNG writer: 8-bit RGB, one zlib stream, no dependencies
  const raw = Buffer.alloc(H * (W * 3 + 1))
  for (let j = 0; j < H; j++) {
    raw[j * (W * 3 + 1)] = 0 // filter: none
    rgb.copy(raw, j * (W * 3 + 1) + 1, j * W * 3, (j + 1) * W * 3)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  mkdirSync(resolve(ROOT, 'docs'), { recursive: true })
  writeFileSync(resolve(ROOT, 'docs/fit-plan.png'), png)
  console.log(`wrote docs/fit-plan.png (${W} x ${H})`)
}
