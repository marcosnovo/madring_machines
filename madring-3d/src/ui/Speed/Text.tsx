import { addEffect } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

import { mutation } from '../../store'

// `mutation.speed` is metres per second — the world is at true metric scale.
// Upstream printed it raw and labelled it "mph", so a car doing 300 km/h read
// "83 mph" and the whole game felt slow. Kilometres per hour, correctly.
const getSpeed = () => `${(mutation.speed * 3.6).toFixed()}`

export const Text = (): JSX.Element => {
  const ref = useRef<HTMLSpanElement>(null)

  let speed = getSpeed()

  useEffect(() =>
    addEffect(() => {
      if (!ref.current) return
      speed = getSpeed()
      if (ref.current.innerText !== speed) {
        ref.current.innerText = speed
      }
    }),
  )

  return (
    <div className="speed-text">
      <span ref={ref}>{speed}</span> km/h
    </div>
  )
}
