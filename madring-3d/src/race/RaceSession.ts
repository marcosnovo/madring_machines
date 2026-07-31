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

/** Longitudinal spacing between grid rows, metres. */
const ROW_GAP = 9
/** Lateral stagger of the two grid files, metres. */
const FILE_OFFSET = 3.1

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

  /** Slot `i` counts from the front of the grid, two staggered files. */
  private placeOnGrid(car: CarController, i: number): void {
    const c = this.track
    const back = Math.round((i * ROW_GAP) / c.ds)
    const index = (((c.gridIndex - back) % c.N) + c.N) % c.N
    car.placeAt(index)
    const lat = (i % 2 === 0 ? 1 : -1) * FILE_OFFSET
    const s = c.samples[index]
    car.x += s.nx * lat
    car.z += s.nz * lat
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

    let playerEvents: StepEvents = { crossedSF: 0, wallHit: 0 }
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
    resolveCarContacts(cars, this.bodies, tuning.mass)

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
