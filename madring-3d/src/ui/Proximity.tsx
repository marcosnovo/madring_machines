/**
 * Blind-spot markers: a chevron on the edge of the screen for a rival that is
 * CLOSE and OUTSIDE the camera's view.
 *
 * This is the answer to "los oponentes salen de la derecha, de la nada". They
 * do not, in fact, come out of nowhere — measured over ten minutes of
 * simulated racing against the real AI, an opponent within 40 m of the player
 * is outside the chase camera's frustum between 37 % and 58 % of the time,
 * depending on pace. Worst measured case: a car sat in the blind spot for
 * 54 s and then re-entered the frame at 4 m, 55° off the nose — i.e. it
 * appeared at the extreme edge of the screen, already alongside. Nothing was
 * teleporting; the player simply had no way to know it was there. The car has
 * no mirrors, the minimap drew only the player, and a chase camera sees
 * roughly a 105° cone out of the 360° a driver has to care about.
 *
 * Deliberately NOT a mirror or a rear-view render: a second render pass is the
 * single most expensive thing that could be added to a phone frame, and it
 * answers a question ("what is behind me exactly") the player does not have.
 * The question is "is anyone about to be alongside me, and on which side" —
 * two chevrons answer that for free.
 *
 * Pure CSS driven imperatively from `addEffect`, exactly like SpeedLines: no
 * React re-render, no store churn, and nothing at all while the track is clear.
 */
import { useEffect, useRef } from 'react'
import { addEffect } from '@react-three/fiber'

import { cameraRig } from '../effects/Cameras'
import { getRace } from '../race/RaceSession'
import { getState } from '../store'
import { getPlayer } from '../vehicle/CarController'

/** Beyond this a rival is not "about to be alongside", metres. */
const RANGE = 34
/** Inside this it is as urgent as it gets, metres. */
const CLOSE = 9

/**
 * How far INSIDE the true frustum edge a car still counts as hidden, radians.
 *
 * The marker must not blink out at the exact instant the car's centre crosses
 * the frustum plane — at that moment most of the car is still off-frame and
 * the player has not seen it yet. ~9° of overlap hands over cleanly: the
 * chevron is still up for the frame or two in which the car slides into view.
 */
const EDGE_MARGIN = 0.16

export interface BlindSpot {
  /** 0 = nobody, 1 = about to be hit. */
  left: number
  right: number
}

/**
 * The whole decision, as a pure function of the pose and the camera cone, so
 * it can be exercised against a headless race instead of a screenshot.
 *
 * `halfVisible` is the HORIZONTAL half-angle of what the player can actually
 * see, in radians. Writes into `out` — this runs every frame.
 */
export function blindSpots(
  out: BlindSpot,
  px: number,
  pz: number,
  heading: number,
  halfVisible: number,
  rivals: readonly { x: number; z: number }[],
): BlindSpot {
  out.left = 0
  out.right = 0
  const fx = Math.sin(heading)
  const fz = Math.cos(heading)
  // Track convention (src/circuit/trackFrame): (cos ψ, -sin ψ) is the driver's
  // LEFT, so a positive lateral component below is to the left.
  const lx = Math.cos(heading)
  const lz = -Math.sin(heading)
  const visible = Math.max(0.2, halfVisible - EDGE_MARGIN)
  for (const rival of rivals) {
    const dx = rival.x - px
    const dz = rival.z - pz
    const distance = Math.hypot(dx, dz)
    if (distance > RANGE) continue
    const forward = dx * fx + dz * fz
    const lateral = dx * lx + dz * lz
    // Anything behind the car is hidden by definition; ahead, only what falls
    // outside the lens.
    if (forward > 0 && Math.abs(Math.atan2(lateral, forward)) <= visible) continue
    const urgency = Math.min(1, Math.max(0, (RANGE - distance) / (RANGE - CLOSE)))
    if (lateral >= 0) out.left = Math.max(out.left, urgency)
    else out.right = Math.max(out.right, urgency)
  }
  return out
}

const sides: BlindSpot = { left: 0, right: 0 }
const rivalScratch: { x: number; z: number }[] = []

export function Proximity(): JSX.Element {
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      addEffect(() => {
        const l = left.current
        const r = right.current
        if (!l || !r) return

        sides.left = 0
        sides.right = 0

        const camera = cameraRig.persp
        // The bird's-eye camera already shows the whole field from above, so
        // a blind-spot warning there is noise. `ready` gates the intro screen.
        if (camera && getState().ready && getState().camera !== 'BIRD_EYE') {
          const player = getPlayer()
          // The real horizontal half-angle of the shot the player is looking
          // at, read live: `fov` is vertical and animated with speed/boost,
          // and `aspect` is whatever this phone's landscape frame happens to
          // be — a hard-coded cone would be wrong on every device but one.
          const halfH = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect)
          if (rivalScratch.length === 0) for (const entry of getRace().entries) if (!entry.isPlayer) rivalScratch.push(entry.car)
          blindSpots(sides, player.x, player.z, player.heading, halfH, rivalScratch)
        }

        apply(l, sides.left)
        apply(r, sides.right)
      }),
    [],
  )

  return (
    <div className="proximity" aria-hidden>
      <div ref={left} className="proximity-marker proximity-left" style={{ opacity: 0 }} />
      <div ref={right} className="proximity-marker proximity-right" style={{ opacity: 0 }} />
    </div>
  )
}

/**
 * Opacity carries distance; the `close` class turns the chevron from amber to
 * red and starts it pulsing. Both are written only when they change — this
 * runs every frame and a style write that is a no-op still costs a style
 * recalculation.
 */
function apply(el: HTMLDivElement, urgency: number): void {
  const value = urgency <= 0.01 ? '0' : (0.25 + urgency * 0.7).toFixed(2)
  if (el.style.opacity !== value) el.style.opacity = value
  const close = urgency > 0.62
  if (el.classList.contains('close') !== close) el.classList.toggle('close', close)
}
