/**
 * Cheap sensation-of-speed overlay: a vignette that closes in and faint
 * radial streaks that appear at high speed, plus a cool tint while boosting.
 * Pure CSS, driven imperatively from the render loop — no React re-renders,
 * no shader passes, no cost when the car is slow.
 */
import { useEffect, useRef } from 'react'
import { addEffect } from '@react-three/fiber'

import { getState, mutation } from '../store'

/** km/h where the overlay starts to appear / saturates. */
const FROM = 140
const FULL = 330

export function SpeedLines(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      addEffect(() => {
        const el = ref.current
        if (!el) return
        const kmh = mutation.speed * 3.6
        const factor = Math.min(1, Math.max(0, (kmh - FROM) / (FULL - FROM)))
        const boosting = getState().controls.boost && mutation.boost > 0
        const opacity = factor * 0.55 + (boosting ? 0.2 : 0)
        const value = opacity < 0.01 ? '0' : opacity.toFixed(2)
        if (el.style.opacity !== value) el.style.opacity = value
        const boostClass = el.classList.contains('boosting')
        if (boostClass !== boosting) el.classList.toggle('boosting', boosting)
      }),
    [],
  )

  return (
    <div ref={ref} className="speedlines" style={{ opacity: 0 }}>
      <div className="speedlines-streaks" />
      <div className="speedlines-vignette" />
    </div>
  )
}
