import { useEffect, useRef } from 'react'
import { addEffect } from '@react-three/fiber'
import { useStore } from '../store'
import { readableTime } from './LeaderBoard'

const getTime = (start: number) => readableTime(start ? Date.now() - start : 0)

export function Clock() {
  const ref = useRef<HTMLSpanElement>(null)
  const { finished, start } = useStore(({ finished, start }) => ({ finished, start }))

  useEffect(() => {
    let lastTime = 0
    return addEffect((time) => {
      if (!ref.current || time - lastTime < 100) return
      lastTime = time
      const text = getTime(start)
      if (ref.current.innerText !== text) ref.current.innerText = text
    })
  }, [start])

  return (
    <div className="clock">
      <span ref={ref}>{getTime(start)}</span>
      {finished ? <small style={{ display: 'block', fontSize: '0.45em', opacity: 0.75 }}>last {readableTime(finished)}</small> : null}
    </div>
  )
}
