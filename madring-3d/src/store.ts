import { createRef } from 'react'
import create from 'zustand'
import shallow from 'zustand/shallow'
import type { RefObject } from 'react'
import type { PublicApi, WheelInfoOptions } from '@react-three/cannon'
import type { Group } from 'three'
import type { GetState, SetState, StateSelector } from 'zustand'

import { keys } from './keys'
import { getLayout, nearestIndex, poseAt } from './circuit/layout'

export const cameras = ['DEFAULT', 'FIRST_PERSON', 'BIRD_EYE'] as const

export const dpr = 1.5 as const
export const levelLayer = 1 as const
export const maxBoost = 100 as const

/**
 * The car, tuned for arcade rather than simulation.
 *
 * Every number here was moved against a measurement, not a feeling: a headless
 * cannon-es rig (scripted controls, flat plane, same RaycastVehicle and the
 * same boolean keys the player has) reports 0-100, 0-200, 0-300, braking
 * distance and steady-state cornering radius, and a scripted driver laps the
 * measured circuit so the whole change can be judged end to end.
 *
 *                        before            after
 *   0-100 km/h            3.97 s            2.73 s
 *   0-200 km/h            8.05 s            5.52 s
 *   0-300 km/h           12.33 s            8.38 s
 *   200-0 km/h       4.13 s / 119 m    2.93 s / 95 m
 *   full-lock radius @120 km/h   39 m             22 m
 *                      @200 km/h  116 m             62 m
 *                      @280 km/h  229 m            118 m
 *   scripted lap driver, 150 s   5974 m           7516 m   (143 -> 180 km/h)
 *
 * The counter-intuitive one is `steerSpeedFalloff`. Bleeding the steering lock
 * off with speed makes the car turn *harder* at 280 km/h, not softer: at full
 * lock the front tyres were saturated and the car simply ploughed on.
 */
export const vehicleConfig = {
  width: 1.7,
  height: -0.3,
  front: 1.35,
  back: -1.3,
  /** Steering lock at a standstill, radians. */
  steer: 0.36,
  /**
   * Fraction of the lock given up at `maxSpeed`. Keeps the car pointable at
   * 300 km/h without making it vague, and stops the front tyres saturating.
   */
  steerSpeedFalloff: 0.5,
  force: 2600,
  maxBrake: 65,
  maxSpeed: 88,
  /** How far past `maxSpeed` the boost is allowed to push. */
  boostSpeed: 1.12,
  /** Engine-force multiplier while boosting. */
  boostForce: 1.7,
} as const

type VehicleConfig = typeof vehicleConfig

export type WheelInfo = Required<
  Pick<
    WheelInfoOptions,
    | 'axleLocal'
    | 'customSlidingRotationalSpeed'
    | 'dampingCompression'
    | 'dampingRelaxation'
    | 'directionLocal'
    | 'frictionSlip'
    | 'maxSuspensionTravel'
    | 'radius'
    | 'rollInfluence'
    | 'sideAcceleration'
    | 'suspensionRestLength'
    | 'suspensionStiffness'
    | 'useCustomSlidingRotationalSpeed'
  >
>

/**
 * More grip, less float. `frictionSlip` and `sideAcceleration` are what make
 * the car go where it is pointed; the suspension numbers are what stop it
 * wallowing on to the next corner, and they also cut the 200-0 km/h stop from
 * 119 m to 95 m, because a car that is not pitching keeps its wheels loaded.
 * `rollInfluence` stays at 0 — an arcade car does not roll over.
 */
export const wheelInfo: WheelInfo = {
  axleLocal: [-1, 0, 0],
  customSlidingRotationalSpeed: -0.01,
  dampingCompression: 8,
  dampingRelaxation: 12,
  directionLocal: [0, -1, 0],
  frictionSlip: 2.6,
  maxSuspensionTravel: 0.35,
  radius: 0.38,
  rollInfluence: 0,
  sideAcceleration: 4,
  suspensionRestLength: 0.35,
  suspensionStiffness: 45,
  useCustomSlidingRotationalSpeed: true,
}

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
  api: PublicApi | null
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
  wheelInfo: WheelInfo
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
     * Put the car back on the circuit: upright, on the centreline nearest to
     * wherever it ended up, pointing the right way down the road. Upstream only
     * reset the rotation and velocity, which on a 5 km circuit just left you
     * stranded (or falling) wherever you went off.
     */
    reset: () => {
      mutation.boost = maxBoost

      set((state) => {
        const layout = getLayout()
        const body = state.chassisBody.current
        const index = body ? nearestIndex(layout, body.matrixWorld.elements[12], body.matrixWorld.elements[14]) : layout.gridIndex
        const { position, rotation } = poseAt(layout, index)

        state.api?.velocity.set(0, 0, 0)
        state.api?.angularVelocity.set(0, 0, 0)
        state.api?.position.set(...position)
        state.api?.rotation.set(...rotation)

        return { ...state }
      })
    },
  }

  return {
    ...booleans,
    actionInputMap,
    actions,
    api: null,
    bestCheckpoint: 0,
    camera: cameras[0],
    chassisBody: createRef<Group>(),
    opponentChassisBody: createRef<Group>(),
    checkpoint: 0,
    color: '#FFFF00',
    controls,
    keyBindingsWithError: [],
    dpr,
    finished: 0,
    get,
    keyInput: null,
    level: createRef<Group>(),
    set,
    start: 0,
    _start: 0,
    vehicleConfig,
    wheelInfo,
    wheels: [createRef<Group>(), createRef<Group>(), createRef<Group>(), createRef<Group>()],
  }
})

interface Mutation {
  boost: number
  rpmTarget: number
  sliding: boolean
  speed: number
  velocity: [number, number, number]
}

export const mutation: Mutation = {
  // Everything in here is mutated to avoid even slight overhead
  boost: maxBoost,
  rpmTarget: 0,
  sliding: false,
  speed: 0,
  velocity: [0, 0, 0],
}

// Make the store shallow compare by default
const useStore = <T>(sel: StateSelector<IState, T>) => useStoreImpl(sel, shallow)
Object.assign(useStore, useStoreImpl)

const { getState, setState } = useStoreImpl

export { getState, setState, useStore }
