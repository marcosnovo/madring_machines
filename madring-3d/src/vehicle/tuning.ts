/**
 * Live tuning for the car, the camera and the visual body attitude.
 *
 * Every number the driver might want to move is in this one mutable object,
 * read fresh by the controller / camera every tick, so the leva panel
 * (ui/Editor.ts, toggled with `.`) changes the running game without a rebuild
 * or a respawn. Values persist to localStorage so a tuning session survives a
 * reload; `resetTuning()` puts the defaults back.
 *
 * The defaults are the APEX FORMULA 2026 car (see ./dynamics.ts for the
 * provenance and licence): 585 kW + 240 kW override, CLA 4.3 of downforce,
 * mu 1.62, and its speed-dependent steering clamp.
 */

export interface Tuning {
  /** Car mass, kg. */
  mass: number
  /** Base engine power, W. */
  power: number
  /** Extra power while boosting, W. */
  boostPower: number
  /** Peak tyre friction coefficient. */
  mu: number
  /** Downforce area CLA (0.5·rho·CLA·v²), high-downforce mode. */
  claZ: number
  /** Downforce area in low-drag (straight-line) mode. */
  claX: number
  /** Drag area CDA, high-downforce mode. */
  cdaZ: number
  /** Drag area in low-drag mode. */
  cdaX: number
  /** Rolling + mechanical drag, N (plus a small linear term internally). */
  rollDrag: number
  /** Front cornering stiffness share (rear is 1.12, front this × rear base). */
  frontCornerScale: number
  /** Tyre cornering stiffness, N/rad. */
  cornerStiffness: number
  /** Yaw inertia, kg·m². */
  yawInertia: number
  /** Steering clamp: floor of max road-wheel angle at speed, rad. */
  steerLow: number
  /** Steering clamp: extra lock available at rest, rad. */
  steerGain: number
  /** Steering clamp: how fast that extra lock bleeds off with speed. */
  steerFalloff: number
  /** Absolute cap on road-wheel angle, rad. */
  steerMax: number
  /** Traction control. */
  tc: boolean
  /** Anti-lock brakes. */
  abs: boolean
  /** Automatic gearbox. */
  autoGear: boolean
  /** Lateral-velocity damping assist (on with TC/ABS in the reference). */
  stability: boolean
  /** Handbrake (Space): rear brake force, N. */
  handbrakeForce: number
  /** Handbrake: rear grip multiplier while held. */
  handbrakeGrip: number
  /** Camera: field of view at rest, degrees. */
  fovBase: number
  /** Camera: how much wider it gets at top speed, degrees. */
  fovSpeed: number
  /** Camera: extra on top while boosting, degrees. */
  fovBoost: number
  /** Camera: position easing rate, 1/s (higher = tighter). */
  cameraEase: number
  /** Camera: high-speed shake amplitude, 0 disables. */
  shake: number
  /** Visual attitude: pitch gain (dive under braking / squat under power). */
  attPitch: number
  /** Visual attitude: roll-into-corners gain. */
  attRoll: number
}

export const TUNING_DEFAULTS: Tuning = {
  mass: 830,
  power: 585e3,
  boostPower: 240e3,
  mu: 1.62,
  claZ: 4.3,
  claX: 1.5,
  cdaZ: 1.45,
  cdaX: 0.92,
  rollDrag: 210,
  frontCornerScale: 0.84,
  cornerStiffness: 78000,
  yawInertia: 1080,
  steerLow: 0.05,
  steerGain: 0.42,
  steerFalloff: 0.085,
  steerMax: 0.38,
  tc: true,
  abs: true,
  autoGear: true,
  stability: true,
  handbrakeForce: 9000,
  handbrakeGrip: 0.72,
  fovBase: 62,
  fovSpeed: 22,
  fovBoost: 12,
  cameraEase: 7,
  shake: 1,
  attPitch: 0.0011,
  attRoll: 0.001,
}

const KEY = 'madring-3d.tuning'

const load = (): Tuning => {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') {
      const out = { ...TUNING_DEFAULTS }
      for (const k of Object.keys(TUNING_DEFAULTS) as (keyof Tuning)[]) {
        const v = (parsed as Record<string, unknown>)[k]
        if (typeof v === typeof TUNING_DEFAULTS[k]) (out as Record<string, unknown>)[k] = v
      }
      return out
    }
  } catch {
    // fall through to defaults
  }
  return { ...TUNING_DEFAULTS }
}

/** The live tuning. Mutated in place; consumers read it every tick. */
export const tuning: Tuning = typeof window === 'undefined' ? { ...TUNING_DEFAULTS } : load()

export function saveTuning(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(tuning))
  } catch {
    // private browsing / quota — losing tuning persistence is not fatal
  }
}

export function setTuning(patch: Partial<Tuning>): void {
  Object.assign(tuning, patch)
  saveTuning()
}

export function resetTuning(): void {
  Object.assign(tuning, TUNING_DEFAULTS)
  saveTuning()
}
