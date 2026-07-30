/**
 * Compress the Sketchfab circuit model into something a browser can load.
 *
 *   in   assets/madring-sketchfab/scene.gltf  (+ scene.bin, textures/)
 *   out  public/models/circuit-draco.glb
 *
 * The source asset is "Circuito de Madring 2026 layout" by Dave Love,
 * CC-BY-4.0 — see ../NOTICE. The source stays in assets/ and is never shipped;
 * only the output of this script is.
 *
 * What it does, in order:
 *
 *   1. bakes the alignment transform found by fit-circuit.mjs into the scene
 *      root, so the model sits on our centreline with no runtime fiddling;
 *   2. drops vertex attributes nothing reads (TANGENT — three derives the
 *      tangent frame in the fragment shader; unused TEXCOORD_1);
 *   3. welds duplicate vertices;
 *   4. splits every mesh that spans more than CHUNK_SPAN metres into a grid of
 *      CHUNK_SIZE-metre tiles. The source is one merged mesh per material, each
 *      stretching over the whole 1.9 km circuit, so frustum culling could never
 *      reject anything. Tiled, the renderer draws only the tiles in view;
 *   5. resizes and re-encodes every texture to WebP;
 *   6. Draco-compresses the geometry.
 *
 * 134.65 MB in, 8.82 MB out, no triangles added or removed.
 *
 * Run with `npm run build:model`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { compactPrimitive, dedup, draco, prune, textureCompress, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SRC = resolve(ROOT, 'assets/madring-sketchfab/scene.gltf')
const OUT = resolve(ROOT, 'public/models/circuit-draco.glb')
const FIT = resolve(ROOT, 'src/circuit/fit.json')

/** Meshes wider than this (metres, either horizontal axis) get tiled. */
const CHUNK_SPAN = 320
/** Tile size, metres. */
const CHUNK_SIZE = 256
/** Largest texture edge we ship. The backdrop is 4096²; everything else is 256². */
const TEXTURE_MAX = 1024
/** Draco quantisation. 14 bits over a 256 m tile is 1.6 cm. */
const QUANT = { quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeGeneric: 12 }

const mb = (n) => (n / 1048576).toFixed(2) + ' MB'

function sourceSize() {
  const dir = resolve(ROOT, 'assets/madring-sketchfab')
  let total = 0
  const walk = (p) => {
    const st = statSync(p)
    if (st.isDirectory()) for (const f of readdirSync(p)) walk(resolve(p, f))
    else total += st.size
  }
  walk(dir)
  return total
}

/**
 * The transform that puts the model on our centreline.
 *
 * `fit.json` is written by fit-circuit.mjs: a rigid transform in the XZ plane
 * (yaw and translation, no scaling — the model is already metric) fitted to the
 * TarmacDark mesh by ICP against the projected centreline. `scale` is carried
 * through the matrix anyway so a future non-metric asset would still work. The
 * glTF's own root nodes carry a Z-up -> Y-up rotation which is folded in here,
 * so the baked matrix is the whole story and every node below it is identity.
 */
function alignment(fit) {
  const { theta, scale, tx, ty, tz } = fit
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  // source (X, Y, Z) -> model (X, -Z, Y) -> yaw about +Y, scale, translate.
  // Columns are the images of the source basis vectors, glTF column-major.
  //   e_x = (1,0,0) -> model ( 1, 0, 0) -> ( c, 0,  s) * scale
  //   e_y = (0,1,0) -> model ( 0, 0, 1) -> (-s, 0,  c) * scale
  //   e_z = (0,0,1) -> model ( 0,-1, 0) -> ( 0,-1,  0) * scale
  return [scale * c, 0, scale * s, 0, scale * -s, 0, scale * c, 0, 0, -scale, 0, 0, tx, ty, tz, 1]
}

/** Triangle-level spatial split, so frustum culling has something to reject. */
function tileMesh(doc, mesh) {
  let added = 0
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    const idx = prim.getIndices()
    if (!pos || !idx) continue
    const min = pos.getMin([0, 0, 0])
    const max = pos.getMax([0, 0, 0])
    // Source is Z-up: the horizontal axes are X and Y.
    const span = Math.max(max[0] - min[0], max[1] - min[1])
    if (span < CHUNK_SPAN) continue

    const indices = idx.getArray()
    const p = pos.getArray()
    const cells = new Map()
    for (let t = 0; t < indices.length; t += 3) {
      const i0 = indices[t] * 3
      const i1 = indices[t + 1] * 3
      const i2 = indices[t + 2] * 3
      const cx = Math.floor((p[i0] + p[i1] + p[i2]) / 3 / CHUNK_SIZE)
      const cy = Math.floor((p[i0 + 1] + p[i1 + 1] + p[i2 + 1]) / 3 / CHUNK_SIZE)
      const key = cx + ',' + cy
      let list = cells.get(key)
      if (!list) cells.set(key, (list = []))
      list.push(indices[t], indices[t + 1], indices[t + 2])
    }
    if (cells.size < 2) continue

    for (const [, list] of cells) {
      const clone = prim.clone()
      const newIdx = doc.createAccessor().setArray(new Uint32Array(list)).setType('SCALAR')
      clone.setIndices(newIdx)
      // Give the clone its own copy of every attribute, then drop the vertices
      // this tile does not use, so its bounding box is the tile's, not the
      // whole circuit's — that is the entire point of the exercise.
      for (const semantic of clone.listSemantics()) {
        const src = clone.getAttribute(semantic)
        clone.setAttribute(semantic, doc.createAccessor().setArray(src.getArray().slice()).setType(src.getType()).setNormalized(src.getNormalized()))
      }
      compactPrimitive(clone)
      mesh.addPrimitive(clone)
      added++
    }
    mesh.removePrimitive(prim)
    prim.dispose()
  }
  return added
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`missing source model: ${SRC}\nDownload it into assets/madring-sketchfab/ first (see NOTICE).`)
    process.exit(1)
  }
  const fit = JSON.parse(readFileSync(FIT, 'utf8'))

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  })

  const before = sourceSize()
  console.log(`source            ${mb(before)}`)

  const doc = await io.read(SRC)
  const root = doc.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]

  // ---- 1. bake the alignment ------------------------------------------------
  // Every mesh here hangs off one chain of transform-only Sketchfab wrapper
  // nodes. Put our matrix on the top of that chain and flatten everything below
  // it to identity, so the file arrives in world space and the renderer needs
  // no magic numbers of its own.
  const matrix = alignment(fit.transform)
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const top = new Set(scene.listChildren())
  for (const node of root.listNodes()) node.setMatrix(top.has(node) ? matrix : IDENTITY)

  // ---- 2. drop attributes nothing reads -------------------------------------
  let dropped = 0
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of ['TANGENT', 'TEXCOORD_1', 'TEXCOORD_2', 'COLOR_0']) {
        if (prim.getAttribute(semantic)) {
          prim.setAttribute(semantic, null)
          dropped++
        }
      }
    }
  }
  console.log(`dropped attrs     ${dropped}`)

  // ---- 3. weld --------------------------------------------------------------
  await doc.transform(weld())

  // ---- 4. tile --------------------------------------------------------------
  let tiles = 0
  for (const mesh of root.listMeshes()) tiles += tileMesh(doc, mesh)
  console.log(`tiles created     ${tiles}`)

  await doc.transform(dedup(), prune())

  // ---- 5. textures ----------------------------------------------------------
  await doc.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [TEXTURE_MAX, TEXTURE_MAX],
      quality: 82,
    }),
  )

  // ---- 6. draco -------------------------------------------------------------
  await doc.transform(draco({ ...QUANT, quantizationVolume: 'mesh' }))

  mkdirSync(dirname(OUT), { recursive: true })
  await io.write(OUT, doc)

  const after = statSync(OUT).size
  let prims = 0
  let tris = 0
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      prims++
      tris += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3
    }
  console.log(`primitives        ${prims}`)
  console.log(`triangles         ${Math.round(tris).toLocaleString('en-US')}`)
  console.log(`output            ${mb(after)}   (${(before / after).toFixed(1)}x smaller)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
