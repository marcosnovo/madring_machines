/**
 * Impact sparks: a burst when something is hit, a continuous shower while the
 * bodywork is dragged along a wall.
 *
 * Why this exists at all: the analytic wall response and the car-vs-car
 * contact solver were already correct — speed was lost, the car was deflected,
 * the camera was kicked — and players still reported that crashes "did not
 * feel like anything". Nothing on screen changed at the moment of contact.
 * A hit that produces light where the panels met reads as a hit even when the
 * underlying numbers are unchanged, which is why this is a particle system and
 * not a physics change.
 *
 * One InstancedMesh, one pool, no allocation per frame: a spark is four
 * numbers of state (position, velocity, life) in flat arrays, and dead sparks
 * are parked at zero scale rather than removed. The burst is driven off the
 * store's impact counter (a sequence, not a flag — see store.ts) so it can
 * never eat an event the crash audio needed, or miss one the audio ate.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D } from 'three'
import type { InstancedMesh } from 'three'

import { mutation, useStore } from '../store'
import { getPlayer } from '../vehicle/CarController'
import { clampDelta } from '../frame'

/** Pool size. A saturated wall hit spawns ~46, so this holds three of them. */
const COUNT = 140
/** How long a spark lives, seconds. Short: this is a flash, not a firework. */
const LIFE = 0.42
/** Gravity on a spark, m/s². Exaggerated so the shower arcs down fast. */
const GRAVITY = 26
/** Spark size at birth, metres. */
const SIZE = 0.09

/** Below this the scrape is a graze and should not throw sparks. */
const SCRAPE_FLOOR = 0.06
/** Sparks per second at a full-intensity scrape. */
const SCRAPE_RATE = 90

const o = new Object3D()

export function Impact(): JSX.Element {
  const ref = useRef<InstancedMesh>(null)
  const chassisBody = useStore((state) => state.chassisBody)
  const S = useRef({
    px: new Float32Array(COUNT),
    py: new Float32Array(COUNT),
    pz: new Float32Array(COUNT),
    vx: new Float32Array(COUNT),
    vy: new Float32Array(COUNT),
    vz: new Float32Array(COUNT),
    life: new Float32Array(COUNT),
    next: 0,
    lastSeq: 0,
    /** Any spark still alive — the idle fast path below hangs off this. */
    burning: false,
    // Fractional spark carried between frames, so the scrape rate is per
    // second and not per frame — at 20 fps a per-frame emitter is a trickle.
    scrapeDebt: 0,
  }).current

  /**
   * `speed` is the throw velocity; `spread` how much of it goes sideways
   * rather than up. Sparks inherit a share of the car's own velocity so a
   * shower thrown at 300 km/h trails behind the car instead of hanging in the
   * air like confetti.
   */
  const spawn = (x: number, y: number, z: number, speed: number, dragX: number, dragZ: number): void => {
    const i = S.next
    S.next = (S.next + 1) % COUNT
    S.px[i] = x
    S.py[i] = y
    S.pz[i] = z
    const angle = Math.random() * Math.PI * 2
    const flat = 0.35 + Math.random() * 0.65
    S.vx[i] = Math.cos(angle) * speed * flat + dragX
    S.vy[i] = (0.5 + Math.random()) * speed * 0.6
    S.vz[i] = Math.sin(angle) * speed * flat + dragZ
    S.life[i] = LIFE * (0.6 + Math.random() * 0.4)
    S.burning = true
  }

  useFrame((_, rawDelta) => {
    const mesh = ref.current
    if (!mesh) return
    const delta = clampDelta(rawDelta)
    const player = getPlayer()
    // Sparks keep a third of the car's velocity: enough to lay the shower out
    // behind the car, not so much that it flies away with it.
    const dragX = Math.sin(player.heading) * player.v * 0.33
    const dragZ = Math.cos(player.heading) * player.v * 0.33

    // ---- burst ------------------------------------------------------------
    if (mutation.impactSeq !== S.lastSeq) {
      S.lastSeq = mutation.impactSeq
      const [x, y, z] = mutation.impactPoint
      const n = Math.round(6 + mutation.impact * 40)
      const speed = 3.5 + mutation.impact * 13
      for (let k = 0; k < n; k++) spawn(x, y, z, speed, dragX, dragZ)
    }

    // ---- scrape -----------------------------------------------------------
    // `wallScrape` has been measured by the wall response since it was
    // written and, until now, read by nothing at all.
    const scrape = player.wallScrape
    const chassis = chassisBody.current
    if (scrape > SCRAPE_FLOOR && chassis) {
      S.scrapeDebt += scrape * SCRAPE_RATE * delta
      // Height from the chassis, not from the last burst's point: a car can
      // slide into a wall gently enough that no impact is ever registered
      // (`resolveWallCollision` only reports one above 2 m/s of outward
      // speed), and then `impactPoint` is wherever the last real bang was —
      // possibly a kilometre and several metres of elevation away.
      const y = chassis.position.y + 0.25
      while (S.scrapeDebt >= 1) {
        S.scrapeDebt -= 1
        spawn(player.impactX, y, player.impactZ, 1.5 + scrape * 5, dragX, dragZ)
      }
    } else {
      S.scrapeDebt = 0
    }

    // ---- integrate --------------------------------------------------------
    // Nothing burning and nothing spawned: skip the whole pool. This effect
    // is idle for almost the entire lap and must cost nothing when it is.
    if (!S.burning) {
      if (mesh.visible) mesh.visible = false
      return
    }
    let alive = false
    for (let i = 0; i < COUNT; i++) {
      const life = S.life[i]
      if (life <= 0) {
        o.scale.setScalar(0)
      } else {
        const next = life - delta
        S.life[i] = next
        if (next <= 0) {
          o.scale.setScalar(0)
        } else {
          alive = true
          S.vy[i] -= GRAVITY * delta
          S.px[i] += S.vx[i] * delta
          S.py[i] += S.vy[i] * delta
          S.pz[i] += S.vz[i] * delta
          o.position.set(S.px[i], S.py[i], S.pz[i])
          // Fade by shrinking: one material for the whole pool means no
          // per-instance opacity without a custom shader, and at this size a
          // spark going out by getting smaller is indistinguishable from one
          // getting dimmer. The per-frame random factor is deliberate — it
          // makes each spark twinkle rather than shrink smoothly, which is
          // what hot metal actually does and what sells them as sparks
          // rather than as orange confetti.
          o.scale.setScalar((next / LIFE) * (0.6 + Math.random() * 0.4))
        }
      }
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    }
    S.burning = alive
    mesh.instanceMatrix.needsUpdate = true
    // The frame the last spark dies still uploads its zero scales, so hiding
    // the mesh here cannot leave a stale spark frozen on screen.
    mesh.visible = alive
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <boxGeometry args={[SIZE, SIZE, SIZE]} />
      {/* Unlit and tone-mapping-exempt so the sparks stay hot-white/orange
          against a bright daylit circuit instead of being graded down into
          the asphalt. depthWrite off: they are additive-looking specks that
          must never occlude the car behind them. */}
      <meshBasicMaterial color="#ffb347" toneMapped={false} transparent opacity={0.95} depthWrite={false} />
    </instancedMesh>
  )
}
