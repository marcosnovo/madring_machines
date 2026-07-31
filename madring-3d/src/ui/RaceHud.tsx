/**
 * Race HUD: the five-light start sequence overlay and the position board.
 *
 * Both poll the module-level race session at 10 Hz — DOM outside the Canvas,
 * so no store churn and no per-frame React work. The light cadence itself is
 * owned by RaceSession (grid hold → one red every 0.9 s → random hold →
 * lights out); this only draws it, plus a brief green "GO" on release.
 */
import { useEffect, useState } from 'react'

import { getRace } from '../race/RaceSession'
import { useStore } from '../store'

interface LightsState {
  visible: boolean
  lit: number
  go: boolean
}

export function StartLights(): JSX.Element | null {
  const ready = useStore((state) => state.ready)
  const [state, setState] = useState<LightsState>({ visible: false, lit: 0, go: false })

  useEffect(() => {
    if (!ready) return
    const id = setInterval(() => {
      const race = getRace()
      const go = race.phase === 'racing' && race.phaseT < 1.6
      setState({ visible: race.phase !== 'racing' || go, lit: race.lightsOn, go })
    }, 100)
    return () => clearInterval(id)
  }, [ready])

  if (!ready || !state.visible) return null
  return (
    <div className="startlights">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`startlight${state.go ? ' go' : i < state.lit ? ' lit' : ''}`} />
      ))}
      {state.go && <div className="startlights-go">GO</div>}
    </div>
  )
}

interface BoardState {
  position: number
  cars: number
  lap: number
}

export function PositionBoard(): JSX.Element | null {
  const ready = useStore((state) => state.ready)
  const [state, setState] = useState<BoardState | null>(null)

  useEffect(() => {
    if (!ready) return
    const id = setInterval(() => {
      const race = getRace()
      const player = race.playerEntry
      setState({ position: player.position, cars: race.entries.length, lap: player.lap })
    }, 250)
    return () => clearInterval(id)
  }, [ready])

  if (!ready || !state) return null
  return (
    <div className="positionboard">
      <span className="positionboard-pos">P{state.position}</span>
      <span className="positionboard-of">/{state.cars}</span>
      <span className="positionboard-lap">LAP {state.lap}</span>
    </div>
  )
}
