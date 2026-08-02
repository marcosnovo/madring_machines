import { createRef } from 'react'
import create from 'zustand'
import shallow from 'zustand/shallow'
import type { RefObject } from 'react'
import type { Group } from 'three'
import type { GetState, SetState, StateSelector } from 'zustand'

import { keys } from './keys'
import { isTouchCapable } from './controls/touchCapable'
import { getPlayer, GEAR_TOP } from './vehicle/CarController'

export const cameras = ['DEFAULT', 'FIRST_PERSON', 'BIRD_EYE'] as const

export const dpr = 1.5 as const
export const levelLayer = 1 as const
export const maxBoost = 100 as const

/**
 * Mobile quality tier.
 *
 * A phone GPU is not this sandbox's SwiftShader, but it is also not a desktop
 * discrete card, and the scene is sized for one: AI cars, a crowd, ambient
 * birds/flags and a 2048² shadow map that follows the player (see App.tsx and
 * the README's *Performance* section for the draw-call/triangle budget this
 * is answering). Decided once, from `isTouchCapable()` — the same check the
 * touch overlay uses — so it can never disagree with whether the overlay is
 * showing, and a desktop browser (no touch points) takes neither branch.
 *
 * This only changes the *default* of the two knobs the leva panel already
 * exposed (`Performance` → dpr/shadows, src/ui/Editor.ts) — nothing is
 * removed, and a touch user who wants shadows back, or more dpr, can still
 * open the panel and ask for it.
 */
const isMobileTier = isTouchCapable()
/** Flat 1x pixel ratio on touch devices — no supersampling. Desktop keeps `dpr` (1.5). */
const MOBILE_DPR = 1 as const

/**
 * What is left of the old cannon-era vehicle config.
 *
 * The car itself no longer lives here — or in a physics engine at all. It is
 * the four-corner analytic model in src/vehicle/ (adapted from APEX FORMULA
 * 2026, see NOTICE), and everything the driver might tune lives in
 * src/vehicle/tuning.ts, live-editable from the leva panel on `.`. This object
 * only keeps the one number the HUD and the audio scale against.
 */
export const vehicleConfig = {
  /** Top speed in top gear, m/s. The gauge and engine audio scale to this. */
  maxSpeed: GEAR_TOP[8],
} as const

type VehicleConfig = typeof vehicleConfig

export const booleans = {
  binding: false,
  debug: false,
  editor: false,
  help: false,
  leaderboard: false,
  map: true,
  pickcolor: false,
  rank: false,
  ready: false,
  shadows: true,
  stats: false,
  sound: true,
}

type Booleans = keyof typeof booleans

const exclusiveBooleans = ['help', 'leaderboard', 'pickcolor'] as const
type ExclusiveBoolean = (typeof exclusiveBooleans)[number]
const isExclusiveBoolean = (v: unknown): v is ExclusiveBoolean => exclusiveBooleans.includes(v as ExclusiveBoolean)

export type Camera = (typeof cameras)[number]

const controls = {
  backward: false,
  boost: false,
  brake: false,
  forward: false,
  honk: false,
  left: false,
  right: false,
}
export type Controls = typeof controls
type Control = keyof Controls
export const isControl = (v: PropertyKey): v is Control => Object.hasOwnProperty.call(controls, v)

export type BindableActionName = Control | ExclusiveBoolean | Extract<Booleans, 'editor' | 'map' | 'sound'> | 'camera' | 'reset'

export type ActionInputMap = Record<BindableActionName, string[]>

const actionInputMap: ActionInputMap = {
  backward: ['arrowdown', 's'],
  boost: ['shift'],
  brake: [' '],
  camera: ['c'],
  editor: ['.'],
  forward: ['arrowup', 'w', 'z'],
  help: ['i'],
  honk: ['h'],
  leaderboard: ['l'],
  left: ['arrowleft', 'a', 'q'],
  map: ['m'],
  pickcolor: ['p'],
  reset: ['r'],
  right: ['arrowright', 'd', 'e'],
  sound: ['u'],
}

type Getter = GetState<IState>
export type Setter = SetState<IState>

type BaseState = Record<Booleans, boolean>

type BooleanActions = Record<Booleans, () => void>
type ControlActions = Record<Control, (v: boolean) => void>
type TimerActions = Record<'onCheckpoint' | 'onFinish' | 'onStart', () => void>

type Actions = BooleanActions &
  ControlActions &
  TimerActions & {
    camera: () => void
    reset: () => void
  }

export interface IState extends BaseState {
  actions: Actions
  bestCheckpoint: number
  camera: Camera
  chassisBody: RefObject<Group>
  opponentChassisBody: RefObject<Group>
  checkpoint: number
  color: string
  controls: Controls
  actionInputMap: ActionInputMap
  keyBindingsWithError: number[]
  dpr: number
  finished: number
  get: Getter
  level: RefObject<Group>
  set: Setter
  start: number
  _start: number
  vehicleConfig: VehicleConfig
  wheels: [RefObject<Group>, RefObject<Group>, RefObject<Group>, RefObject<Group>]
  keyInput: string | null
}

const setExclusiveBoolean = (set: Setter, boolean: ExclusiveBoolean) => () =>
  set((state) => ({ ...exclusiveBooleans.reduce((o, key) => ({ ...o, [key]: key === boolean ? !state[boolean] : false }), state) }))

const useStoreImpl = create<IState>((set: SetState<IState>, get: GetState<IState>) => {
  const controlActions = keys(controls).reduce<Record<Control, (value: boolean) => void>>((o, control) => {
    o[control] = (value: boolean) => set((state) => ({ controls: { ...state.controls, [control]: value } }))
    return o
  }, {} as Record<Control, (value: boolean) => void>)

  const booleanActions = keys(booleans).reduce<Record<Booleans, () => void>>((o, boolean) => {
    o[boolean] = isExclusiveBoolean(boolean) ? setExclusiveBoolean(set, boolean) : () => set((state) => ({ ...state, [boolean]: !state[boolean] }))
    return o
  }, {} as Record<Booleans, () => void>)

  const actions: Actions = {
    ...booleanActions,
    ...controlActions,
    camera: () => set((state) => ({ camera: cameras[(cameras.indexOf(state.camera) + 1) % cameras.length] })),
    onCheckpoint: () => {
      const { start } = get()
      if (start) {
        const checkpoint = Date.now() - start
        set({ checkpoint })
      }
    },
    onFinish: () => {
      const { finished, start } = get()
      if (start && !finished) {
        set({ finished: Math.max(Date.now() - start, 0) })
      }
    },
    onStart: () => {
      set({ finished: 0, start: Date.now(), _start: Date.now() })
    },
    /**
     * Put the car back on the circuit: on the centreline nearest to wherever
     * it ended up, at rest, pointing the right way down the road, with the
     * boost gauge refilled.
     */
    reset: () => {
      getPlayer().resetToNearest()
      mutation.boost = maxBoost
    },
  }

  return {
    ...booleans,
    shadows: isMobileTier ? false : booleans.shadows,
    actionInputMap,
    actions,
    bestCheckpoint: 0,
    camera: cameras[0],
    chassisBody: createRef<Group>(),
    opponentChassisBody: createRef<Group>(),
    checkpoint: 0,
    color: '#f5b70f',
    controls,
    keyBindingsWithError: [],
    dpr: isMobileTier ? MOBILE_DPR : dpr,
    finished: 0,
    get,
    keyInput: null,
    level: createRef<Group>(),
    set,
    start: 0,
    _start: 0,
    vehicleConfig,
    wheels: [createRef<Group>(), createRef<Group>(), createRef<Group>(), createRef<Group>()],
  }
})

interface Mutation {
  boost: number
  rpmTarget: number
  sliding: boolean
  speed: number
  velocity: [number, number, number]
  /**
   * Impacts are published as a COUNTER, not a flag.
   *
   * `wallHit` used to be a one-tick number that whoever noticed it first reset
   * to 0. That worked while the crash audio was the only consumer, but it
   * silently breaks the moment there are two (audio + sparks): the first one
   * to run each frame ate the event, and with sound off nobody reset it at
   * all, so the flag stayed hot. A monotonically increasing sequence has
   * neither problem — every consumer latches its own last-seen value and can
   * miss nothing and consume nothing.
   *
   * The physics runs at a fixed 60 Hz inside a render frame that may be far
   * slower, so Vehicle.tsx folds every substep's impact into ONE bump per
   * frame carrying the hardest of them.
   */
  impactSeq: number
  /** Intensity 0..1 of the impact that last bumped `impactSeq`. */
  impact: number
  /** True when that impact was car-vs-car rather than car-vs-wall. */
  impactCar: boolean
  /** World point of that impact — where the sparks come from. */
  impactPoint: [number, number, number]
}

export const mutation: Mutation = {
  // Everything in here is mutated to avoid even slight overhead
  boost: maxBoost,
  rpmTarget: 0,
  sliding: false,
  speed: 0,
  velocity: [0, 0, 0],
  impactSeq: 0,
  impact: 0,
  impactCar: false,
  impactPoint: [0, 0, 0],
}

// Make the store shallow compare by default
const useStore = <T>(sel: StateSelector<IState, T>) => useStoreImpl(sel, shallow)
Object.assign(useStore, useStoreImpl)

const { getState, setState } = useStoreImpl

export { getState, setState, useStore }
