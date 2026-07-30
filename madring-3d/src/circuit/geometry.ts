/**
 * Turns the circuit layout into renderable and collidable geometry.
 *
 * Everything is a "ribbon": a closed strip swept along the centreline whose
 * cross-section is described, per sample, as a list of (lateral offset, height)
 * pairs in the banked road frame. Asphalt, kerbs, run-off and the collision
 * mesh are all the same sweep with different cross-sections.
 */
import { BufferAttribute, BufferGeometry, Vector3 } from 'three'

import type { Layout, Sample, Section } from './layout'
import { APRON_DROP, APRON_WIDTH, KERB_HEIGHT, KERB_WIDTH, pointAt } from './layout'

export type CrossSection = { u: number; h: number }

export interface RibbonOptions {
  /** Cross-section at a given sample. Must return the same length every time. */
  section: (sample: Sample, index: number) => CrossSection[]
  /** Optional per-segment colour, e.g. for kerb stripes. */
  color?: (index: number) => [number, number, number]
  /** How many samples to step (2 = half resolution). Ignored when `range` is set. */
  step?: number
  /** Explicit sample indices to sweep. When given, the ribbon is left open. */
  range?: number[]
}

const scratch = new Vector3()

/** Sweeps a cross-section ribbon along the lap (or along `range`). */
export function ribbon(layout: Layout, options: RibbonOptions): BufferGeometry {
  const { section, color, step = 1, range } = options
  const { samples } = layout
  const n = samples.length
  const ringIndices = range ?? Array.from({ length: Math.floor(n / step) }, (_, ri) => ri * step)
  const closed = !range
  const rings = ringIndices.length
  const cols = section(samples[ringIndices[0]], ringIndices[0]).length

  const positions = new Float32Array(rings * cols * 3)
  const uvs = new Float32Array(rings * cols * 2)
  const colors = color ? new Float32Array(rings * cols * 3) : null

  let totalS = 0
  for (let ri = 0; ri < rings; ri++) {
    const i = ringIndices[ri]
    const sample = samples[i]
    const cs = section(sample, i)
    const rgb = color ? color(i) : null
    for (let c = 0; c < cols; c++) {
      pointAt(sample, cs[c].u, cs[c].h, scratch)
      const o = (ri * cols + c) * 3
      positions[o] = scratch.x
      positions[o + 1] = scratch.y
      positions[o + 2] = scratch.z
      uvs[(ri * cols + c) * 2] = c / (cols - 1)
      uvs[(ri * cols + c) * 2 + 1] = totalS / 8
      if (colors && rgb) {
        colors[o] = rgb[0]
        colors[o + 1] = rgb[1]
        colors[o + 2] = rgb[2]
      }
    }
    totalS += layout.ds * step
  }

  const indices: number[] = []
  const lastRing = closed ? rings : rings - 1
  for (let ri = 0; ri < lastRing; ri++) {
    const next = (ri + 1) % rings
    for (let c = 0; c < cols - 1; c++) {
      const a = ri * cols + c
      const b = ri * cols + c + 1
      const d = next * cols + c
      const e = next * cols + c + 1
      // Wound so the face normal is cross(r, t) = up: the road must face the
      // sky, both to be lit and because cannon's wheel raycast skips backfaces.
      indices.push(a, b, d, b, e, d)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  if (colors) geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Asphalt: flat across the banked road frame. */
export const asphaltGeometry = (layout: Layout): BufferGeometry =>
  ribbon(layout, {
    section: (s) => [
      { u: -s.halfWidth, h: 0 },
      { u: -s.halfWidth / 2, h: 0 },
      { u: 0, h: 0 },
      { u: s.halfWidth / 2, h: 0 },
      { u: s.halfWidth, h: 0 },
    ],
  })

/**
 * Kerbs: a raised lip on both sides, striped by alternating vertex colour every
 * few metres. Built as one ribbon that skips across the road so the stripes
 * stay in phase on both sides.
 */
export function kerbGeometry(layout: Layout, side: 1 | -1): BufferGeometry {
  const stripeEvery = Math.max(1, Math.round(4 / layout.ds))
  return ribbon(layout, {
    section: (s) => [
      { u: side * s.halfWidth, h: 0 },
      { u: side * (s.halfWidth + KERB_WIDTH * 0.35), h: KERB_HEIGHT },
      { u: side * (s.halfWidth + KERB_WIDTH), h: KERB_HEIGHT * 0.7 },
    ],
    color: (i) => (Math.floor(i / stripeEvery) % 2 === 0 ? [0.78, 0.11, 0.13] : [0.93, 0.93, 0.93]),
  })
}

/** Flat run-off / verge outside the kerbs, dropping away from the road. */
export function apronGeometry(layout: Layout, side: 1 | -1): BufferGeometry {
  return ribbon(layout, {
    section: (s) => [
      { u: side * (s.halfWidth + KERB_WIDTH), h: KERB_HEIGHT * 0.7 },
      { u: side * (s.halfWidth + KERB_WIDTH + 2), h: -0.15 },
      { u: side * (s.halfWidth + KERB_WIDTH + APRON_WIDTH * 0.5), h: -APRON_DROP * 0.55 },
      { u: side * (s.halfWidth + KERB_WIDTH + APRON_WIDTH), h: -APRON_DROP },
    ],
  })
}

/** Visual barrier wall along the outer edge of the run-off. */
export function wallGeometry(layout: Layout, side: 1 | -1): BufferGeometry {
  const stripeEvery = Math.max(1, Math.round(9 / layout.ds))
  const edge = (s: Sample) => side * (s.halfWidth + KERB_WIDTH + APRON_WIDTH + 0.6)
  return ribbon(layout, {
    section: (s) => [
      { u: edge(s), h: -APRON_DROP - 0.4 },
      { u: edge(s), h: -APRON_DROP + 1.5 },
      { u: edge(s) + side * 0.35, h: -APRON_DROP + 1.5 },
    ],
    color: (i) => (Math.floor(i / stripeEvery) % 2 === 0 ? [0.88, 0.88, 0.9] : [0.13, 0.28, 0.6]),
  })
}

/**
 * The single ribbon the physics engine actually sees: asphalt + kerbs + apron
 * in one closed trimesh. Half resolution — a cannon Trimesh has to be
 * octree-indexed and shipped to the physics worker, and 10 m sampling is well
 * inside the wheel raycast spacing.
 */
export function collisionGeometry(layout: Layout): BufferGeometry {
  return ribbon(layout, {
    step: 2,
    section: (s) => [
      { u: -(s.halfWidth + KERB_WIDTH + APRON_WIDTH), h: -APRON_DROP },
      { u: -(s.halfWidth + KERB_WIDTH), h: KERB_HEIGHT * 0.7 },
      { u: -s.halfWidth, h: 0 },
      { u: 0, h: 0 },
      { u: s.halfWidth, h: 0 },
      { u: s.halfWidth + KERB_WIDTH, h: KERB_HEIGHT * 0.7 },
      { u: s.halfWidth + KERB_WIDTH + APRON_WIDTH, h: -APRON_DROP },
    ],
  })
}

/** Vertex/index arrays in the shape @react-three/cannon's useTrimesh wants. */
export function trimeshArgs(geometry: BufferGeometry): [Float32Array, Uint32Array] {
  const position = geometry.getAttribute('position') as BufferAttribute
  const index = geometry.getIndex() as BufferAttribute
  return [position.array as Float32Array, new Uint32Array(index.array)]
}

/**
 * Barrier boxes along the outside of the run-off. cannon-es has no
 * convex-vs-trimesh narrowphase, so the chassis box would slide straight
 * through the collision ribbon's walls; boxes give it something solid to hit.
 * Returned in sector groups so each compound body keeps a small AABB.
 */
export interface Barrier {
  position: [number, number, number]
  rotation: [number, number, number]
  args: [number, number, number]
}

export function barriers(layout: Layout, sectors = 24): Barrier[][] {
  const { samples } = layout
  const n = samples.length
  const spacing = Math.max(1, Math.round(24 / layout.ds))
  const length = spacing * layout.ds * 1.08
  const groups: Barrier[][] = Array.from({ length: sectors }, () => [])

  for (let i = 0; i < n; i += spacing) {
    const s = samples[i]
    const sector = Math.min(sectors - 1, Math.floor((i / n) * sectors))
    const yaw = Math.atan2(-s.t.x, -s.t.z)
    for (const side of [-1, 1] as const) {
      const offset = side * (s.halfWidth + 1 + APRON_WIDTH + 0.6)
      const p = pointAt(s, offset, -APRON_DROP + 0.7)
      groups[sector].push({
        position: [p.x, p.y, p.z],
        rotation: [0, yaw, 0],
        args: [0.5, 1.6, length],
      })
    }
  }
  return groups
}

/**
 * Cosmetic tunnel: a half-pipe arch swept over a straight. Purely visual — it
 * has no collision, so the roof cannot be hit.
 */
export function tunnelGeometry(layout: Layout, section: Section, segments = 12): BufferGeometry {
  const indices = sectionIndices(layout, section)
  return ribbon(layout, {
    range: indices,
    section: (s) => {
      const halfSpan = s.halfWidth + KERB_WIDTH + 1.5
      const height = halfSpan * 0.85
      const out: CrossSection[] = []
      for (let j = 0; j <= segments; j++) {
        const a = Math.PI * (j / segments)
        out.push({ u: -Math.cos(a) * halfSpan, h: Math.sin(a) * height - 0.4 })
      }
      return out
    },
  })
}

/** A flat painted band across the road, `width` metres along the lap. */
export function bandGeometry(layout: Layout, index: number, width: number, height = 0.03): BufferGeometry {
  const s = layout.samples[index]
  const half = width / 2
  const positions: number[] = []
  const uvs: number[] = []
  const v = new Vector3()
  for (const along of [-half, half]) {
    for (const lateral of [-s.halfWidth, s.halfWidth]) {
      v.copy(s.p).addScaledVector(s.r, lateral).addScaledVector(s.u, height).addScaledVector(s.t, along)
      positions.push(v.x, v.y, v.z)
      uvs.push((lateral / s.halfWidth + 1) / 2, along > 0 ? 1 : 0)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex([0, 2, 1, 1, 2, 3])
  geometry.computeVertexNormals()
  return geometry
}

/** Sample indices covered by a section, in order. */
export function sectionIndices(layout: Layout, section: Section): number[] {
  const n = layout.samples.length
  const span = ((section.to - section.from) % n + n) % n
  const out: number[] = []
  for (let j = 0; j <= span; j++) out.push((section.from + j) % n)
  return out
}
