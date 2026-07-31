/**
 * Gamepad support, via the Gamepad API. Standard mapping:
 *
 *   left stick X   steer (analog — the single biggest controls upgrade over
 *                  binary keys: the friction-circle tyre model responds to
 *                  exactly the angle you ask for)
 *   RT / LT        throttle / brake (analog)
 *   A              boost (Manual Override)
 *   X              drift / handbrake
 *   Y              cycle camera        B  reset to track
 *   d-pad          digital steer/throttle/brake fallback
 *
 * The pad is polled every animation frame into the mutable `gamepad` object;
 * the vehicle merges it with the keyboard each physics tick, so both stay
 * fully usable — whichever is actually moved wins. Dead zone and response
 * curve are live-tunable from the leva panel (`.` → Gamepad).
 */
import { useEffect } from 'react'
import { useStore } from '../store'
import { tuning } from '../vehicle/tuning'

export interface GamepadState {
  connected: boolean
  /** -1..1, +1 = left, dead-zoned and curve-shaped. */
  steer: number
  throttle: number
  brake: number
  handbrake: boolean
  boost: boolean
}

/** Read by Vehicle.tsx every physics tick. Mutated in place, like `mutation`. */
export const gamepad: GamepadState = {
  connected: false,
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  boost: false,
}

const shape = (raw: number, deadzone: number, curve: number): number => {
  const magnitude = Math.abs(raw)
  if (magnitude < deadzone) return 0
  const t = Math.min(1, (magnitude - deadzone) / (1 - deadzone))
  return Math.sign(raw) * Math.pow(t, curve)
}

const value = (pad: Gamepad, i: number): number => pad.buttons[i]?.value ?? 0
const pressed = (pad: Gamepad, i: number): boolean => !!pad.buttons[i]?.pressed

export function GamepadInput(): null {
  const actions = useStore((state) => state.actions)

  useEffect(() => {
    let raf = 0
    let prevCamera = false
    let prevReset = false

    const poll = () => {
      raf = requestAnimationFrame(poll)
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []
      let pad: Gamepad | null = null
      for (const candidate of pads) {
        if (candidate && candidate.connected) {
          pad = candidate
          break
        }
      }
      gamepad.connected = !!pad
      if (!pad) {
        gamepad.steer = 0
        gamepad.throttle = 0
        gamepad.brake = 0
        gamepad.handbrake = false
        gamepad.boost = false
        return
      }

      // +1 steer is left; stick X is +1 right.
      let steer = -shape(pad.axes[0] ?? 0, tuning.padDeadzone, tuning.padCurve)
      if (pressed(pad, 14)) steer = 1 // d-pad left
      if (pressed(pad, 15)) steer = -1 // d-pad right
      gamepad.steer = steer
      gamepad.throttle = Math.max(value(pad, 7), pressed(pad, 12) ? 1 : 0)
      gamepad.brake = Math.max(value(pad, 6), pressed(pad, 13) ? 1 : 0)
      gamepad.boost = pressed(pad, 0)
      gamepad.handbrake = pressed(pad, 2)

      // Edge-triggered utility buttons.
      const camera = pressed(pad, 3)
      if (camera && !prevCamera) actions.camera()
      prevCamera = camera
      const reset = pressed(pad, 1)
      if (reset && !prevReset) actions.reset()
      prevReset = reset
    }

    raf = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(raf)
  }, [actions])

  return null
}
