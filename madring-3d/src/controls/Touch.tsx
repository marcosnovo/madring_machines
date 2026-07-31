/**
 * Touch controls: a virtual steer pad plus hold buttons, HTML absolutely
 * positioned over the canvas — same trick as the rest of the HUD (`src/ui/`),
 * so it costs nothing in the 3D scene.
 *
 * Only mounted where `isTouchCapable()` is true (see App.tsx); a desktop
 * browser never renders any of this. Every element here is read the same way
 * Gamepad.ts is: a mutable object (`touchInput`) written from pointer events
 * and merged into the frame-loop input alongside keyboard and gamepad in
 * Vehicle.tsx — whichever source is actually being used wins, same rule as
 * the keyboard/gamepad merge already had.
 *
 * Steering is analog, not two digital buttons: the same `CarInput.analog`
 * path the gamepad stick uses (src/vehicle/CarController.ts) skips the
 * digital key-shaping and follows the drag proportionally, through the same
 * physical speed-dependent clamp — a drag pad is the only touch input that
 * can reach that path without inventing new plumbing, and analog was already
 * called out as the better feel.
 *
 * Multi-touch is inherent, not bolted on: each zone is its own element with
 * its own Pointer Event listeners, so a finger on the steer pad, a thumb held
 * on accelerate and a tap on boost are three independent pointers the browser
 * already tracks separately — nothing here has to arbitrate between them.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react'

import { useStore } from '../store'
import { isTouchCapable } from './touchCapable'

export interface TouchInput {
  /** -1..1, +1 = left. Analog: fed straight into CarInput.analog, like the pad. */
  steer: number
  throttle: number
  brake: number
  handbrake: boolean
  boost: boolean
}

/**
 * Read by Vehicle.tsx every physics tick, exactly like `gamepad` in
 * Gamepad.ts. Mutated in place from pointer handlers below — no store churn
 * for something written this often.
 */
export const touchInput: TouchInput = {
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  boost: false,
}

/** Drag distance for full steering lock, px. Tunable-by-eye, not exposed to leva. */
const STEER_RANGE = 68

/** Blocks scroll/zoom/callout for both the pointer handlers and the plain
 * `onContextMenu` (a long press on a touch button opens a context menu even
 * though it never fires a `contextmenu`-eligible mouse event on touch UAs
 * that still dispatch one on long-press). */
function preventDefault(e: SyntheticEvent): void {
  e.preventDefault()
}

/**
 * The steering pad: touch down anywhere in the zone, drag left/right from
 * wherever the thumb landed. The knob is moved by writing straight to the DOM
 * (a ref, not React state) on every pointermove — the same "no per-frame React
 * work" rule the rest of the HUD follows (see ui/RaceHud.tsx).
 */
function SteerPad(): JSX.Element {
  const knob = useRef<HTMLDivElement>(null)
  const originX = useRef<number | null>(null)
  const pointerId = useRef<number | null>(null)

  const setSteer = useCallback((v: number) => {
    touchInput.steer = v
    if (knob.current) knob.current.style.transform = `translate(${v * -STEER_RANGE}px, -50%)`
  }, [])

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      preventDefault(e)
      e.currentTarget.setPointerCapture(e.pointerId)
      pointerId.current = e.pointerId
      originX.current = e.clientX
      setSteer(0)
    },
    [setSteer],
  )

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerId.current !== e.pointerId || originX.current === null) return
      preventDefault(e)
      const dx = e.clientX - originX.current
      setSteer(Math.max(-1, Math.min(1, -dx / STEER_RANGE)))
    },
    [setSteer],
  )

  const onEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerId.current !== e.pointerId) return
      pointerId.current = null
      originX.current = null
      setSteer(0)
    },
    [setSteer],
  )

  return (
    <div className="touch-steer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} onContextMenu={preventDefault}>
      <div className="touch-steer-track">
        <div ref={knob} className="touch-steer-knob" style={{ transform: 'translate(0, -50%)' }} />
      </div>
    </div>
  )
}

interface HoldButtonProps {
  className: string
  label: string
  onChange: (down: boolean) => void
}

/** A press-and-hold zone: down sets the channel, up (or losing the pointer) clears it. */
function HoldButton({ className, label, onChange }: HoldButtonProps): JSX.Element {
  const pointerId = useRef<number | null>(null)
  const [pressed, setPressed] = useState(false)

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      preventDefault(e)
      e.currentTarget.setPointerCapture(e.pointerId)
      pointerId.current = e.pointerId
      setPressed(true)
      onChange(true)
    },
    [onChange],
  )

  const onUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerId.current !== e.pointerId) return
      pointerId.current = null
      setPressed(false)
      onChange(false)
    },
    [onChange],
  )

  return (
    <div
      className={`touch-button ${className}${pressed ? ' pressed' : ''}`}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={preventDefault}
    >
      {label}
    </div>
  )
}

export function TouchControls(): JSX.Element | null {
  const actions = useStore((state) => state.actions)
  const [enabled] = useState(isTouchCapable)

  const onCameraTap = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      preventDefault(e)
      actions.camera()
    },
    [actions],
  )

  // Belt and suspenders: if this ever unmounts mid-touch (camera panel, HMR),
  // don't leave a channel stuck on.
  useEffect(
    () => () => {
      touchInput.steer = 0
      touchInput.throttle = 0
      touchInput.brake = 0
      touchInput.handbrake = false
      touchInput.boost = false
    },
    [],
  )

  if (!enabled) return null

  return (
    <div className="touch-controls">
      <SteerPad />
      <HoldButton className="touch-brake" label="BRAKE" onChange={(v) => (touchInput.brake = v ? 1 : 0)} />
      <HoldButton className="touch-throttle" label="GO" onChange={(v) => (touchInput.throttle = v ? 1 : 0)} />
      <HoldButton className="touch-handbrake" label="DRIFT" onChange={(v) => (touchInput.handbrake = v)} />
      <HoldButton className="touch-boost" label="BOOST" onChange={(v) => (touchInput.boost = v)} />
      <div className="touch-camera" onPointerDown={onCameraTap} onContextMenu={preventDefault}>
        ⟳
      </div>
    </div>
  )
}
