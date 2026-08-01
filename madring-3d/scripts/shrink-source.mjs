/**
 * Shrink the Sketchfab source asset so it stays under GitHub's 100 MiB
 * per-file limit, without moving a single vertex.
 *
 *   in   assets/madring-sketchfab/{scene.gltf,scene.bin,textures/}
 *   out  the same, rewritten in place (or into --out <dir>)
 *
 * The source model is the project's ruler. `fit-circuit.mjs`, the root
 * `scripts/madring-model-fit.js` and `scripts/madring-road-centre.js` all read
 * the TarmacDark mesh straight out of scene.bin and derive the racing line,
 * the lap timing and the barriers from it, so anything that perturbs POSITION
 * silently moves the circuit. This script therefore touches everything EXCEPT
 * the things those readers look at.
 *
 * What it does, and why each step is safe:
 *
 *   1. INDICES u32 -> u16.  Every primitive in this model has fewer than 65536
 *      vertices, so the conversion is exactly lossless — the same integers,
 *      half the bytes.  -9.66 MiB
 *
 *   2. NORMAL f32 -> i16 normalized (KHR_mesh_quantization).  Normals are only
 *      ever consumed by the shader. `build-circuit-model.mjs` already Draco-
 *      compresses them to 10-bit octahedral on the way out, so 16 bits per
 *      component here is still strictly finer than anything that ships.
 *      Nothing in the measurement pipeline reads NORMAL.  -9.69 MiB
 *
 *   3. TANGENT dropped.  `build-circuit-model.mjs` already drops it (three.js
 *      derives the tangent frame in the fragment shader) and no material
 *      references it.  -3.72 MiB
 *
 *   4. TEXCOORD_1 dropped, and the three normalTexture `texCoord: 1`
 *      references rewritten to 0.  `build-circuit-model.mjs` already drops the
 *      attribute, and three.js's GLTFLoader ignores UV sets other than 0
 *      anyway ("Custom UV set 1 ... not yet supported"), so those normal maps
 *      already sample UV0 both here and in the shipped GLB. Rewriting the
 *      reference just makes the source a valid glTF again.  -2.61 MiB
 *
 *   5. Background.001_baseColor.png, a 4096x4096 24-bit PNG and on its own 94%
 *      of the texture weight, re-encoded to a 2048x2048 JPEG. It is the
 *      distant backdrop; the shipped GLB resizes every texture to 1024 and
 *      re-encodes it to WebP, so this is still twice the resolution of
 *      anything that reaches the player.  -31.9 MiB
 *
 * POSITION and TEXCOORD_0 are copied through byte for byte — the float bits
 * that come out are the float bits that went in — so `npm run build:assets`
 * reproduces src/circuit/fit.json and src/circuit/road.ts identically.
 *
 * The result is still "Circuito de Madring 2026 layout" by Dave Love,
 * CC-BY-4.0; textures/../license.txt and ../NOTICE stay as they are.
 *
 *     node scripts/shrink-source.mjs                 # rewrite in place
 *     node scripts/shrink-source.mjs --out <dir>     # write a copy instead
 *     node scripts/shrink-source.mjs --dry-run       # just report
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SRC = resolve(ROOT, 'assets/madring-sketchfab')

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const outArg = argv.indexOf('--out')
const OUT = outArg >= 0 ? resolve(argv[outArg + 1]) : SRC

/** The backdrop, and what to re-encode it to. */
const BACKDROP = 'textures/Background.001_baseColor.png'
const BACKDROP_SIZE = 2048
const BACKDROP_QUALITY = 92

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const mib = (n) => (n / 1048576).toFixed(2) + ' MiB'

const gltf = JSON.parse(readFileSync(resolve(SRC, 'scene.gltf'), 'utf8'))
const bin = readFileSync(resolve(SRC, 'scene.bin'))

if (gltf.buffers.length !== 1 || gltf.buffers[0].uri !== 'scene.bin') throw new Error('expected a single scene.bin buffer')
if (gltf.accessors.some((a) => a.sparse)) throw new Error('sparse accessors are not handled')

/** Read accessor `i` out of the source bin, honouring bufferView byteStride. */
function read(i) {
  const a = gltf.accessors[i]
  const bv = gltf.bufferViews[a.bufferView]
  const Type = COMPONENT[a.componentType]
  const n = NCOMP[a.type]
  const elem = Type.BYTES_PER_ELEMENT * n
  const stride = bv.byteStride ?? elem
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const at = bin.byteOffset + base
  if (stride === elem && at % Type.BYTES_PER_ELEMENT === 0) {
    // Tightly packed and aligned — which is how Sketchfab wrote every one of
    // them. Copy the run straight out; no float ever gets re-derived.
    return new Type(bin.buffer.slice(at, at + a.count * elem))
  }
  // Interleaved or oddly aligned — walk it element by element.
  const out = new Type(a.count * n)
  for (let e = 0; e < a.count; e++)
    for (let c = 0; c < n; c++) {
      const off = at + e * stride + c * Type.BYTES_PER_ELEMENT
      out[e * n + c] = new Type(bin.buffer.slice(off, off + Type.BYTES_PER_ELEMENT))[0]
    }
  return out
}

// ---------------------------------------------------------------------------
// Decide, per accessor, what it becomes. Everything not listed here is copied
// through unchanged.
// ---------------------------------------------------------------------------
const plan = new Map() // accessor index -> { role, componentType, normalized }
const dropped = { TANGENT: 0, TEXCOORD_1: 0 }

for (const mesh of gltf.meshes) {
  for (const prim of mesh.primitives) {
    for (const semantic of ['TANGENT', 'TEXCOORD_1']) {
      if (prim.attributes[semantic] !== undefined) {
        delete prim.attributes[semantic]
        dropped[semantic]++
      }
    }
    if (prim.indices !== undefined) plan.set(prim.indices, { role: 'indices' })
    if (prim.attributes.NORMAL !== undefined) plan.set(prim.attributes.NORMAL, { role: 'normal' })
  }
}

// A material may only ask for a UV set the primitives still carry.
let retargeted = 0
const retarget = (o) => {
  if (!o || typeof o !== 'object') return
  if (Array.isArray(o)) return o.forEach(retarget)
  if (o.texCoord !== undefined && o.texCoord !== 0) {
    o.texCoord = 0
    retargeted++
  }
  for (const v of Object.values(o)) retarget(v)
}
retarget(gltf.materials)

// ---------------------------------------------------------------------------
// Rebuild the buffer. Accessors are grouped into bufferViews by layout, the
// way Sketchfab had them, so the file stays tidy and every vertex-attribute
// element lands on a 4-byte boundary.
// ---------------------------------------------------------------------------
const groups = new Map() // key -> { target, byteStride, componentType, normalized, members: [] }
const shape = (i) => {
  const a = gltf.accessors[i]
  const p = plan.get(i)
  if (p?.role === 'indices') {
    const data = read(i)
    let max = 0
    for (const v of data) if (v > max) max = v
    const componentType = max < 65536 ? 5123 : 5125
    return { key: 'idx' + componentType, target: 34963, byteStride: undefined, componentType, normalized: false, data: componentType === 5123 ? Uint16Array.from(data) : data }
  }
  if (p?.role === 'normal') {
    const f = read(i)
    const q = new Int16Array(f.length)
    for (let k = 0; k < f.length; k++) q[k] = Math.round(Math.max(-1, Math.min(1, f[k])) * 32767)
    return { key: 'nrm', target: 34962, byteStride: 8, componentType: 5122, normalized: true, data: q }
  }
  const n = NCOMP[a.type]
  const elem = COMPONENT[a.componentType].BYTES_PER_ELEMENT * n
  const byteStride = Math.ceil(elem / 4) * 4
  return { key: 'v' + a.componentType + a.type, target: 34962, byteStride, componentType: a.componentType, normalized: false, data: read(i) }
}

/** Accessors still referenced by a primitive, in file order. */
const live = new Set()
for (const mesh of gltf.meshes) {
  for (const prim of mesh.primitives) {
    if (prim.indices !== undefined) live.add(prim.indices)
    for (const i of Object.values(prim.attributes)) live.add(i)
  }
}

const shapes = new Map()
for (let i = 0; i < gltf.accessors.length; i++) {
  if (!live.has(i)) continue
  const s = shape(i)
  shapes.set(i, s)
  if (!groups.has(s.key)) groups.set(s.key, { target: s.target, byteStride: s.byteStride, members: [] })
  groups.get(s.key).members.push(i)
}

const chunks = []
let cursor = 0
const bufferViews = []
const accessors = []
const remap = new Map()

for (const [, g] of groups) {
  while (cursor % 4) {
    chunks.push(Buffer.alloc(4 - (cursor % 4)))
    cursor += 4 - (cursor % 4)
  }
  const bvIndex = bufferViews.length
  const bvStart = cursor
  for (const i of g.members) {
    const a = gltf.accessors[i]
    const s = shapes.get(i)
    const n = NCOMP[a.type]
    const bytes = s.data.BYTES_PER_ELEMENT * n
    const stride = g.byteStride ?? bytes
    const buf = Buffer.alloc(a.count * stride)
    const view = new (s.data.constructor)(buf.buffer, buf.byteOffset, buf.byteLength / s.data.BYTES_PER_ELEMENT)
    const per = stride / s.data.BYTES_PER_ELEMENT
    for (let e = 0; e < a.count; e++) for (let c = 0; c < n; c++) view[e * per + c] = s.data[e * n + c]

    const rebuilt = { bufferView: bvIndex, componentType: s.componentType, count: a.count, type: a.type }
    if (cursor - bvStart) rebuilt.byteOffset = cursor - bvStart
    if (s.normalized) rebuilt.normalized = true
    if (a.min && a.max) {
      const min = new Array(n).fill(Infinity)
      const max = new Array(n).fill(-Infinity)
      for (let e = 0; e < a.count; e++)
        for (let c = 0; c < n; c++) {
          const v = s.data[e * n + c]
          if (v < min[c]) min[c] = v
          if (v > max[c]) max[c] = v
        }
      rebuilt.min = min
      rebuilt.max = max
    }
    if (a.name) rebuilt.name = a.name
    remap.set(i, accessors.length)
    accessors.push(rebuilt)
    chunks.push(buf)
    cursor += buf.length
  }
  const bv = { buffer: 0, byteLength: cursor - bvStart, name: 'floatBufferViews', target: g.target }
  if (bvStart) bv.byteOffset = bvStart
  if (g.byteStride !== undefined) bv.byteStride = g.byteStride
  bufferViews.push(bv)
}

for (const mesh of gltf.meshes) {
  for (const prim of mesh.primitives) {
    if (prim.indices !== undefined) prim.indices = remap.get(prim.indices)
    for (const [k, v] of Object.entries(prim.attributes)) prim.attributes[k] = remap.get(v)
  }
}

const newBin = Buffer.concat(chunks)
gltf.accessors = accessors
gltf.bufferViews = bufferViews
gltf.buffers = [{ byteLength: newBin.length, uri: 'scene.bin' }]

const used = new Set(gltf.extensionsUsed ?? [])
const required = new Set(gltf.extensionsRequired ?? [])
if (accessors.some((a) => a.normalized)) {
  used.add('KHR_mesh_quantization')
  required.add('KHR_mesh_quantization')
}
gltf.extensionsUsed = [...used].sort()
if (required.size) gltf.extensionsRequired = [...required].sort()

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------
const backdrop = gltf.images.findIndex((im) => im.uri === BACKDROP)
const BACKDROP_OUT = BACKDROP.replace(/\.png$/, '.jpg')
let backdropBuf = null
if (backdrop >= 0) {
  backdropBuf = await sharp(resolve(SRC, BACKDROP))
    .resize(BACKDROP_SIZE, BACKDROP_SIZE)
    .jpeg({ quality: BACKDROP_QUALITY, mozjpeg: true })
    .toBuffer()
  gltf.images[backdrop].uri = BACKDROP_OUT
  gltf.images[backdrop].mimeType = 'image/jpeg'
}

// ---------------------------------------------------------------------------
// Report, then write
// ---------------------------------------------------------------------------
const before = statSync(resolve(SRC, 'scene.bin')).size
console.log(`indices u32 -> u16   ${accessors.filter((a) => a.componentType === 5123).length} accessors`)
console.log(`NORMAL f32 -> i16    ${accessors.filter((a) => a.normalized).length} accessors`)
console.log(`dropped TANGENT      ${dropped.TANGENT} primitives`)
console.log(`dropped TEXCOORD_1   ${dropped.TEXCOORD_1} primitives`)
console.log(`texCoord -> 0        ${retargeted} texture references`)
console.log(`scene.bin            ${mib(before)} -> ${mib(newBin.length)}`)
if (backdropBuf) console.log(`backdrop             ${mib(statSync(resolve(SRC, BACKDROP)).size)} -> ${mib(backdropBuf.length)} (${BACKDROP_SIZE}px JPEG)`)

if (DRY) process.exit(0)

mkdirSync(resolve(OUT, 'textures'), { recursive: true })
if (OUT !== SRC) {
  copyFileSync(resolve(SRC, 'license.txt'), resolve(OUT, 'license.txt'))
  for (const f of readdirSync(resolve(SRC, 'textures'))) copyFileSync(resolve(SRC, 'textures', f), resolve(OUT, 'textures', f))
}
if (backdropBuf) {
  writeFileSync(resolve(OUT, BACKDROP_OUT), backdropBuf)
  rmSync(resolve(OUT, BACKDROP), { force: true })
}
writeFileSync(resolve(OUT, 'scene.bin'), newBin)
writeFileSync(resolve(OUT, 'scene.gltf'), JSON.stringify(gltf, null, 2))
console.log(`wrote                ${OUT}`)
