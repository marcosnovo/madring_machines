/**
 * Measure the VISIBLE barrier line off the shipped circuit model.
 *
 * The analytic walls stand 0.8 m outside the measured asphalt edge — the only
 * closed line fit-circuit.mjs can measure. But the model's *visible* barriers
 * (concrete walls, branded track walls, tyre stacks, catch fencing) do not
 * everywhere stand at the asphalt edge: at the pit entry, the run-off aprons
 * and the lay-bys the paved corridor keeps going for tens of metres past the
 * wall the player can see, so the car could drive clean through a rendered
 * wall while staying inside the measured corridor. This script closes that
 * gap: it raycasts the shipped, draco-compressed model (no 135 MB source
 * needed) from the centreline outwards at every road sample and records where
 * the first wall-like surface actually stands, per side.
 *
 *   in   public/models/circuit-draco.glb, src/circuit/road.ts
 *   out  src/circuit/barriers.ts
 *
 * A survey point counts as a barrier only if rays at two heights (0.55 m and
 * 1.15 m above the road) hit nearly the same lateral distance — a vertical,
 * wall-sized surface — so painted lines, kerbs and overhanging signage do not
 * register. Single-sample spikes are removed with a 3-wide median; a hit
 * closer than MIN_KEEP to the centreline is treated as street furniture, not
 * a wall, and ignored.
 *
 * Run with `npm run build:barriers`, or `node scripts/measure-barriers.mjs
 * --diag` for the per-material survey that justifies BARRIER_MATERIALS.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const MODEL = resolve(ROOT, 'public/models/circuit-draco.glb')
const ROAD_TS = resolve(ROOT, 'src/circuit/road.ts')
const OUT = resolve(ROOT, 'src/circuit/barriers.ts')

/**
 * What counts as a wall the player can see. Everything solid that stands at
 * the edge of the road: the branded track walls (nd_walls1), plain concrete
 * (concrete_smooth), tyre stacks (rubber), catch fencing and its green variant
 * (wire_fence*), armco/steel barriers (Steel_Brushed_Stainless) and the metal
 * advertising boards that face the track (signs_metal). Buildings, kerbs,
 * lines, foliage and grandstands are deliberately not here: they are either
 * far outside the corridor or not wall-shaped at ray height.
 */
const BARRIER_MATERIALS = /^(nd_walls1|concrete_smooth|rubber|wire_fence|wire_fence_green|Steel_Brushed_Stainless|signs_metal)/

/** Ray heights above the sampled road surface, metres. */
const RAY_LOW = 0.55
const RAY_HIGH = 1.15
/** The two heights must agree to within this to count as one wall, metres. */
const AGREE = 1.2
/** Hits nearer the centreline than this are furniture, not walls, metres. */
const MIN_KEEP = 5.5
/** How far past the asphalt edge to keep looking, metres. */
const BEYOND_EDGE = 24
/** Broad-phase grid cell, metres. */
const CELL = 16

const DIAG = process.argv.includes('--diag')

// ---------------------------------------------------------------------------
// Road samples, replicating src/circuit/layout.ts's rotation exactly: sample 0
// is the start gantry (ROAD_START), tangent is the planar central difference,
// +n is the driver's left, bounded by edgeL.
// ---------------------------------------------------------------------------
const roadSrc = readFileSync(ROAD_TS, 'utf8')
const num = (name) => Number(roadSrc.match(new RegExp(`export const ${name} = ([-\\d.]+)`))[1])
const ROAD_START = num('ROAD_START')
const STRIDE = num('ROAD_STRIDE')
const body = roadSrc.match(/export const ROAD: number\[\] = \[([\s\S]*?)\]/)[1]
const ROAD = body
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length)
  .map(Number)
const N = ROAD.length / STRIDE
if (!Number.isInteger(N)) throw new Error(`ROAD length ${ROAD.length} not a multiple of stride ${STRIDE}`)

const wrap = (i) => ((i % N) + N) % N
const at = (i, f) => ROAD[wrap(i + ROAD_START) * STRIDE + f]

const samples = []
for (let i = 0; i < N; i++) {
  const px = at(i, 0)
  const py = at(i, 1)
  const pz = at(i, 2)
  let tx = at(i + 1, 0) - at(i - 1, 0)
  let tz = at(i + 1, 2) - at(i - 1, 2)
  const tLen = Math.hypot(tx, tz) || 1e-6
  tx /= tLen
  tz /= tLen
  samples.push({ x: px, y: py, z: pz, tx, tz, nx: tz, nz: -tx, edgeL: at(i, 3), edgeR: at(i, 4) })
}

// ---------------------------------------------------------------------------
// World-space barrier triangles from the shipped model.
// ---------------------------------------------------------------------------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
})
const doc = await io.read(MODEL)

const tris = [] // flat: ax,ay,az,bx,by,bz,cx,cy,cz per triangle
const triMat = [] // material name per triangle (diag only)
const mul = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]

for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const m = node.getWorldMatrix()
  for (const prim of mesh.listPrimitives()) {
    const name = prim.getMaterial()?.getName() ?? ''
    if (!BARRIER_MATERIALS.test(name)) continue
    const pos = prim.getAttribute('POSITION')
    const idx = prim.getIndices()
    if (!pos) continue
    const p = pos.getArray()
    const indices = idx ? idx.getArray() : null
    const count = indices ? indices.length : pos.getCount()
    for (let i = 0; i < count; i += 3) {
      const i0 = (indices ? indices[i] : i) * 3
      const i1 = (indices ? indices[i + 1] : i + 1) * 3
      const i2 = (indices ? indices[i + 2] : i + 2) * 3
      tris.push(...mul(m, p[i0], p[i0 + 1], p[i0 + 2]), ...mul(m, p[i1], p[i1 + 1], p[i1 + 2]), ...mul(m, p[i2], p[i2 + 1], p[i2 + 2]))
      if (DIAG) triMat.push(name)
    }
  }
}
const T = tris.length / 9
console.log(`${T} barrier triangles from ${MODEL.split('/').pop()}`)

// Broad-phase: plan grid of triangle indices by XZ bounding box.
const grid = new Map()
const cellKey = (cx, cz) => cx * 100000 + cz
for (let t = 0; t < T; t++) {
  const o = t * 9
  const minX = Math.min(tris[o], tris[o + 3], tris[o + 6])
  const maxX = Math.max(tris[o], tris[o + 3], tris[o + 6])
  const minZ = Math.min(tris[o + 2], tris[o + 5], tris[o + 8])
  const maxZ = Math.max(tris[o + 2], tris[o + 5], tris[o + 8])
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const k = cellKey(cx, cz)
      let list = grid.get(k)
      if (!list) grid.set(k, (list = []))
      list.push(t)
    }
  }
}

/** Möller–Trumbore, horizontal ray. Returns distance or Infinity. */
function rayTri(ox, oy, oz, dx, dz, t) {
  const o = t * 9
  const ax = tris[o],
    ay = tris[o + 1],
    az = tris[o + 2]
  const e1x = tris[o + 3] - ax,
    e1y = tris[o + 4] - ay,
    e1z = tris[o + 5] - az
  const e2x = tris[o + 6] - ax,
    e2y = tris[o + 7] - ay,
    e2z = tris[o + 8] - az
  // h = d × e2 with d = (dx, 0, dz)
  const hx = -dz * e2y
  const hy = dz * e2x - dx * e2z
  const hz = dx * e2y
  const det = e1x * hx + e1y * hy + e1z * hz
  if (Math.abs(det) < 1e-9) return Infinity
  const inv = 1 / det
  const sx = ox - ax,
    sy = oy - ay,
    sz = oz - az
  const u = (sx * hx + sy * hy + sz * hz) * inv
  if (u < 0 || u > 1) return Infinity
  // q = s × e1
  const qx = sy * e1z - sz * e1y
  const qy = sz * e1x - sx * e1z
  const qz = sx * e1y - sy * e1x
  const v = (dx * qx + dz * qz) * inv
  if (v < 0 || u + v > 1) return Infinity
  const d = (e2x * qx + e2y * qy + e2z * qz) * inv
  return d > 0 ? d : Infinity
}

/** Nearest hit along the horizontal ray, walking grid cells. */
function cast(ox, oy, oz, dx, dz, maxDist) {
  let best = Infinity
  let bestTri = -1
  const seen = new Set()
  const steps = Math.ceil(maxDist / (CELL / 2))
  for (let s = 0; s <= steps; s++) {
    const px = ox + dx * (s * CELL) / 2
    const pz = oz + dz * (s * CELL) / 2
    for (let ax = -1; ax <= 1; ax++) {
      for (let az = -1; az <= 1; az++) {
        const k = cellKey(Math.floor(px / CELL) + ax, Math.floor(pz / CELL) + az)
        if (seen.has(k)) continue
        seen.add(k)
        const list = grid.get(k)
        if (!list) continue
        for (const t of list) {
          const d = rayTri(ox, oy, oz, dx, dz, t)
          if (d < best) {
            best = d
            bestTri = t
          }
        }
      }
    }
    if (best <= (s * CELL) / 2) break // nothing nearer can appear further on
  }
  return best <= maxDist ? { d: best, t: bestTri } : null
}

/** Barrier distance on one side of a sample, or 0 when none is found. */
function barrierAt(s, side) {
  const dx = s.nx * side
  const dz = s.nz * side
  const edge = side > 0 ? s.edgeL : s.edgeR
  const maxDist = edge + BEYOND_EDGE
  const low = cast(s.x, s.y + RAY_LOW, s.z, dx, dz, maxDist)
  if (!low) return { d: 0, mat: null }
  const high = cast(s.x, s.y + RAY_HIGH, s.z, dx, dz, maxDist)
  if (!high || Math.abs(high.d - low.d) > AGREE) {
    // A fence with an open lower gap (catch fence on posts): accept the high
    // ray alone if the low ray found nothing within AGREE of it.
    if (high && (!low || Math.abs(high.d - low.d) > AGREE) && low.d > high.d) return { d: 0, mat: null }
    return { d: 0, mat: null }
  }
  const d = Math.min(low.d, high.d)
  if (d < MIN_KEEP) return { d: 0, mat: null }
  return { d, mat: DIAG ? triMat[low.t] : null }
}

console.log(`surveying ${N} samples...`)
const rawL = new Array(N)
const rawR = new Array(N)
const matStats = new Map()
for (let i = 0; i < N; i++) {
  const s = samples[i]
  const L = barrierAt(s, 1)
  const R = barrierAt(s, -1)
  rawL[i] = L.d
  rawR[i] = R.d
  if (DIAG) {
    for (const [hit, side] of [
      [L, 'L'],
      [R, 'R'],
    ]) {
      if (!hit.mat) continue
      const k = hit.mat
      const st = matStats.get(k) || { count: 0, inside: 0 }
      st.count++
      const edge = side === 'L' ? s.edgeL : s.edgeR
      if (hit.d < edge - 0.5) st.inside++
      matStats.set(k, st)
    }
  }
}

// 3-wide circular median: kills single-sample spikes, keeps real steps.
const median3 = (arr) => {
  const out = new Array(N)
  for (let i = 0; i < N; i++) {
    const a = arr[wrap(i - 1)] || Infinity
    const b = arr[i] || Infinity
    const c = arr[wrap(i + 1)] || Infinity
    const m = [a, b, c].sort((x, y) => x - y)[1]
    out[i] = Number.isFinite(m) ? m : 0
  }
  return out
}
const barL = median3(rawL)
const barR = median3(rawR)

// ---------------------------------------------------------------------------
// Report + write
// ---------------------------------------------------------------------------
let insideL = 0
let insideR = 0
let missL = 0
let missR = 0
let worst = []
for (let i = 0; i < N; i++) {
  const s = samples[i]
  if (!barL[i]) missL++
  else if (barL[i] < s.edgeL - 0.5) {
    insideL++
    worst.push({ i, side: 'L', gap: s.edgeL - barL[i] })
  }
  if (!barR[i]) missR++
  else if (barR[i] < s.edgeR - 0.5) {
    insideR++
    worst.push({ i, side: 'R', gap: s.edgeR - barR[i] })
  }
}
worst.sort((a, b) => b.gap - a.gap)
console.log(`barrier inside the asphalt edge by >0.5 m:  left ${insideL}, right ${insideR} of ${N} samples`)
console.log(`no barrier found within ${BEYOND_EDGE} m past the edge:  left ${missL}, right ${missR}`)
console.log(
  'worst divergences:',
  worst
    .slice(0, 12)
    .map((w) => `#${w.i}${w.side} ${w.gap.toFixed(1)}m`)
    .join('  '),
)
if (DIAG) {
  console.log('hit materials:')
  for (const [k, st] of [...matStats.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${k}: ${st.count} hits, ${st.inside} inside the asphalt edge`)
  }
}

const fmt = (v) => (v ? +v.toFixed(2) : 0)
const rows = []
for (let i = 0; i < N; i++) rows.push(`  ${fmt(barL[i])},${fmt(barR[i])},`)
const header = `// GENERATED DATA — do not edit by hand. Rebuild with \`npm run build:barriers\`.
//
// The VISIBLE barrier line, measured off the shipped circuit model
// (scripts/measure-barriers.mjs raycasts public/models/circuit-draco.glb from
// the centreline outwards at every road sample). Where a rendered wall stands
// inside the measured asphalt edge — pit entry, run-off aprons, lay-bys — the
// analytic wall clamp follows this line instead of the asphalt, so what looks
// like a wall acts like one. See src/circuit/trackFrame.ts.
//
// Two numbers per sample, metres from the centreline (sample order matches
// getLayout(): index 0 is the start gantry). 0 = no wall-like surface found
// within ${BEYOND_EDGE} m of the asphalt edge on that side (the asphalt-edge wall
// applies unchanged there).

export const BARRIER_STRIDE = 2

export const BARRIERS: number[] = [
`
writeFileSync(OUT, header + rows.join('\n') + '\n]\n')
console.log(`wrote ${OUT} (${N} samples)`)
