/**
 * The race: grid → five red lights → lights out.
 *
 * Owns the AI cars (the player's CarController stays where it always was) and
 * steps everything from one fixed-rate loop driven by Vehicle.tsx, so player
 * and opponents live in the same deterministic world: same track frame, same
 * walls, same tyre model — the AI cars differ only in who supplies the input.
 * The phase machine (grid hold, 0.9 s light cadence, random hold before
 * lights-out) follows APEX FORMULA 2026's race.js; the car-vs-car contact is
 * in ./contact.ts.
 */
import { getTrackFrame } from '../circuit/trackFrame'
import type { TrackFrame } from '../circuit/trackFrame'
import { CarController, getPlayer } from '../vehicle/CarController'
import type { CarInput, StepEvents } from '../vehicle/CarController'
import { tuning } from '../vehicle/tuning'
import { AiDriver } from './AiDriver'
import type { DriverSpec } from './AiDriver'
import { getRaceLine } from './line'
import { makeBody, resolveCarContacts } from './contact'

export type RacePhase = 'grid' | 'lights' | 'racing'

export interface RaceEntry {
  car: CarController
  ai: AiDriver | null
  spec: DriverSpec
  isPlayer: boolean
  /** Continuous race progress, metres from the lap origin. */
  progress: number
  lap: number
  position: number
}

/**
 * Grid hold: brake below the 0.5 reverse-engage threshold, so the field sits
 * still on the sloped start straight instead of rolling off it (the start
 * line is on a grade; with no input every car creeps downhill).
 */
const HOLD_INPUT: CarInput = { steer: 0, throttle: 0, brake: 0.45, handbrake: false, boost: false }

/** The AI field. Pace/consistency spread gives a race, not a train. */
const DRIVERS: DriverSpec[] = [
  { name: 'Vega', pace: 0.97, consistency: 0.93, color: '#c0392b' },
  { name: 'Okada', pace: 0.88, consistency: 0.85, color: '#2980b9' },
  { name: 'Laurent', pace: 0.75, consistency: 0.78, color: '#27ae60' },
  { name: 'Madrigal', pace: 0.62, consistency: 0.7, color: '#e8e6e1' },
]

/**
 * Longitudinal spacing between grid rows, metres.
 *
 * The car is 4.96 m long (2·CAR_HALF_LENGTH), so 9 m of centre-to-centre is
 * 4.04 m of clear air between bumpers — an F1 grid box, near enough, and
 * comfortably outside the 6.35 m + speed buffer the AI treats as its
 * nose-to-tail minimum (AiDriver's `safeGap`), which is what keeps the field
 * from panic-braking at itself the instant it converges onto the racing line.
 */
const ROW_GAP = 9
/** Lateral stagger of the two grid files, metres. */
const FILE_OFFSET = 3.1

/**
 * Lateral offset of the whole grid from the measured centreline, metres.
 *
 * The centreline is the middle of the measured *paved* corridor, and along the
 * pit straight the paved corridor is the track PLUS the pit lane, which are
 * one continuous piece of asphalt in the model. So lat = 0 is not the middle
 * of the racing surface here — it sits far to the right of it, and a grid laid
 * out symmetrically about it puts its right-hand file over the pit wall.
 *
 * Measured off the shipped model (public/models/circuit-draco.glb): the pit
 * wall — the `nd_walls1` geometry standing on the road surface — is at
 * lat -1.98 to -2.19 m over samples 1008..1020, i.e. the whole grid. The
 * surveyed left barrier (samples[i].wallPos) is at +11.6 to +14.3. The racing
 * surface is therefore roughly lat -2.0 .. +11.6, 13.6 m wide, and its middle
 * is +4.8 — not 0. At the shipped ±3.1 the right-hand file (P2 and P4) started
 * at lat -3.10, a metre PAST the pit wall, which is the car-shaped thing on
 * the far side of the barrier in the owner's start screenshots; a bird's-eye
 * capture of the grid shows P4 straddling the wall with its right wheels in
 * the pit lane.
 *
 * +4.5 puts the two files at +1.4 and +7.6: 3.4 m of clearance from the pit
 * wall and 4.0 m from the left barrier, with both cars on the tarmac they are
 * painted on.
 *
 * NOTE this is a workaround at the grid, not the cure. `wallNeg` is wrong on
 * this stretch for the same reason: scripts/measure-barriers.mjs discards any
 * hit closer than MIN_KEEP (5.5 m) as street furniture, so the pit wall at
 * ~2.0 m is thrown away, no barrier is recorded for samples 986..1000 and
 * 1006..1022, and the wall limit falls back to the asphalt edge — 14.6 to
 * 19.6 m, twelve metres of pit lane the corridor thinks is track. Fixing that
 * properly means teaching the survey to keep a wall this close to the
 * centreline (and lowering trackFrame's BARRIER_FLOOR of 4.5 m, which would
 * otherwise re-inflate it), then re-validating the corridor for the whole lap:
 * a lowered MIN_KEEP moves 92 of 1024 samples across eleven separate stretches
 * of the circuit, so it is its own change with its own testing, not a rider on
 * a start-line fix.
 */
const GRID_LAT = 4.5

/** Deterministic PRNG so every race start is the same race start. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class RaceSession {
  readonly track: TrackFrame
  readonly entries: RaceEntry[]
  phase: RacePhase = 'grid'
  phaseT = 0
  /** Red lights currently lit, 0..5. */
  lightsOn = 0
  private lightsHold = 0.5
  private readonly random = mulberry32(0x9e3779b9)
  private readonly bodies
  private readonly brakes = new Map<CarController, number>()
  private readonly carsScratch: CarController[] = []
  private standingsT = 0

  constructor(track: TrackFrame = getTrackFrame()) {
    this.track = track
    const line = getRaceLine(track)
    const player = getPlayer()

    this.entries = []
    // AI rows ahead of the player: the player starts at the back, with the
    // whole field visible at the lights.
    DRIVERS.forEach((spec, i) => {
      const car = new CarController(track)
      this.placeOnGrid(car, i)
      this.entries.push({ car, ai: new AiDriver(car, track, line, spec, this.random), spec, isPlayer: false, progress: 0, lap: 1, position: i + 1 })
    })
    this.placeOnGrid(player, DRIVERS.length)
    this.entries.push({
      car: player,
      ai: null,
      spec: { name: 'You', pace: 1, consistency: 1, color: '#f5b70f' },
      isPlayer: true,
      progress: 0,
      lap: 1,
      position: DRIVERS.length + 1,
    })
    this.bodies = this.entries.map((entry) => makeBody(entry.car, tuning.mass))
    this.updateStandings()
  }

  /**
   * Slot `i` counts from the front of the grid, two staggered files.
   *
   * The row offset has to be applied in METRES, not in samples. `placeAt` can
   * only put a car on a sample, and the samples are 5.3017 m apart, so
   * `round(i · 9 / 5.3017)` walked back 0, 2, 3, 5, 7 samples — row gaps of
   * 10.60, **5.30**, 10.60, 10.60 m instead of a uniform 9. P3 sat 5.30 m
   * behind P2 with a 4.96 m car: 0.34 m of bumper clearance, and only 8.20 m
   * from it in a straight line while every other pair on the grid was over
   * 12 m apart. It looks wrong standing still — two cars abreast in a field
   * that is otherwise strung out — and 1.5 s after lights-out, as the field
   * converges from the two files onto one racing line, P3 finds P2 5.0 m
   * ahead inside its own lane — under AiDriver's 6.9 m `safeGap` — and
   * stands on the brakes at
   * 43 km/h on the pit straight. P4 copies it through the brake-preview
   * channel, the tail of the field collapses to ~37 km/h, and the player,
   * flat out from the back row, arrives at 122 km/h: measured 40 km/h of
   * closing speed, severity 0.918, six contacts in 0.85 s and half the car's
   * speed gone. Nothing about that is a false positive — the contact code is
   * correctly gated — but it made simply holding the throttle feel like a
   * crash, every single start.
   *
   * So: pick the nearest sample as before, then slide along its tangent by
   * whatever the rounding cost, which puts every row exactly ROW_GAP apart.
   */
  private placeOnGrid(car: CarController, i: number): void {
    const c = this.track
    const backMetres = i * ROW_GAP
    const back = Math.round(backMetres / c.ds)
    const index = (((c.gridIndex - back) % c.N) + c.N) % c.N
    car.placeAt(index)
    // `index` is `back · ds` behind the grid line but wants to be `backMetres`
    // behind it, so make up the difference forwards along the tangent.
    const residual = back * c.ds - backMetres
    const lat = GRID_LAT + (i % 2 === 0 ? 1 : -1) * FILE_OFFSET
    const s = c.samples[index]
    car.x += s.tx * residual + s.nx * lat
    car.z += s.tz * residual + s.nz * lat
    car.lat = lat
  }

  /** True while the field (including the player) is held on the grid. */
  get holding(): boolean {
    return this.phase !== 'racing'
  }

  /**
   * One fixed physics tick for the whole field. Returns the player's step
   * events (lap timing in Vehicle.tsx consumes them exactly as before).
   * `ready` gates the start sequence on the intro screen being dismissed.
   */
  stepAll(dt: number, playerInput: CarInput, ready: boolean): StepEvents {
    // ---- phase machine (grid → lights → racing) --------------------------
    if (ready) this.phaseT += dt
    if (this.phase === 'grid') {
      if (this.phaseT > 2.6) {
        this.phase = 'lights'
        this.phaseT = 0
        this.lightsOn = 0
        this.lightsHold = 0.5 + this.random()
      }
    } else if (this.phase === 'lights') {
      this.lightsOn = Math.min(5, Math.floor(this.phaseT / 0.9) + 1)
      if (this.lightsOn >= 5 && this.phaseT > 5 * 0.9 + this.lightsHold) {
        this.phase = 'racing'
        this.phaseT = 0
        this.lightsOn = 0
      }
    }
    const live = this.phase === 'racing'

    // ---- step every car ---------------------------------------------------
    const cars = this.carsScratch
    cars.length = 0
    for (const entry of this.entries) cars.push(entry.car)

    let playerEvents: StepEvents = { crossedSF: 0, wallHit: 0, carHit: 0 }
    for (const entry of this.entries) {
      let input: CarInput
      if (entry.isPlayer) input = live ? playerInput : HOLD_INPUT
      else input = live ? entry.ai!.update(dt, cars, this.brakes) : HOLD_INPUT
      const events = entry.car.step(dt, input)
      this.brakes.set(entry.car, input.brake)
      if (entry.isPlayer) playerEvents = events
      else if (events.crossedSF > 0) entry.ai!.newLapNoise()
    }

    // ---- car-vs-car contact ----------------------------------------------
    // Contacts are resolved for the whole field at once, i.e. after every car
    // has stepped, so the player's own contact can only be read back out
    // here — `step()` had already returned by the time it happened.
    resolveCarContacts(cars, this.bodies, tuning.mass)
    playerEvents.carHit = this.playerEntry.car.contactHit

    // ---- standings, a few times a second ---------------------------------
    this.standingsT -= dt
    if (this.standingsT <= 0) {
      this.standingsT = 0.25
      this.updateStandings()
    }
    return playerEvents
  }

  private updateStandings(): void {
    const length = this.track.length
    for (const entry of this.entries) {
      entry.progress = entry.car.progress
      entry.lap = Math.max(1, Math.floor(entry.progress / length))
    }
    const order = [...this.entries].sort((a, b) => b.progress - a.progress)
    order.forEach((entry, i) => (entry.position = i + 1))
  }

  get playerEntry(): RaceEntry {
    return this.entries[this.entries.length - 1]
  }
}

let session: RaceSession | null = null

/** The single race session. Module-level so a Canvas remount never regrids it. */
export function getRace(): RaceSession {
  if (!session) session = new RaceSession()
  return session
}
