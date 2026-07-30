/**
 * Lap timing. Three trigger walls across the road — the start/finish line and
 * two sector checkpoints. A lap only counts if both sectors were passed first,
 * so reversing back over the line does nothing.
 */
import { useBox } from '@react-three/cannon'
import { useCallback, useRef } from 'react'

import { getLayout, pointAt } from '../../circuit/layout'
import { insertScore } from '../../data'
import { getState, setState, useStore } from '../../store'

const SECTORS = [1 / 3, 2 / 3]

type Passed = { current: boolean[] }

function useTriggerAt(index: number, onCollideBegin: () => void, height = 6): void {
  const layout = getLayout()
  const sample = layout.samples[index]
  const p = pointAt(sample, 0, height / 2)
  const yaw = Math.atan2(-sample.t.x, -sample.t.z)
  useBox(() => ({
    isTrigger: true,
    userData: { trigger: true },
    args: [sample.halfWidth * 2, height, 0.4],
    position: [p.x, p.y, p.z],
    rotation: [0, yaw, 0],
    onCollideBegin,
  }))
}

function SectorTrigger({ index, sector, passed }: { index: number; sector: number; passed: Passed }): null {
  const onCheckpoint = useStore((state) => state.actions.onCheckpoint)
  useTriggerAt(
    index,
    useCallback(() => {
      passed.current[sector] = true
      onCheckpoint()
    }, [onCheckpoint, sector, passed]),
  )
  return null
}

function StartFinishTrigger({ passed }: { passed: Passed }): null {
  const layout = getLayout()
  const started = useRef(false)

  useTriggerAt(
    layout.startIndex,
    useCallback(() => {
      const { start } = getState()
      const now = Date.now()
      if (started.current && start && passed.current.every(Boolean)) {
        // Completed lap: record it, then immediately open the next one.
        const lap = Math.max(now - start, 0)
        setState({ finished: lap })
        void insertScore({ name: 'You', time: lap })
      }
      started.current = true
      passed.current = SECTORS.map(() => false)
      setState({ start: now, _start: now })
    }, [passed]),
  )
  return null
}

export function LapTiming(): JSX.Element {
  const layout = getLayout()
  const passed = useRef<boolean[]>(SECTORS.map(() => false))

  return (
    <>
      <StartFinishTrigger passed={passed} />
      {SECTORS.map((fraction, sector) => (
        <SectorTrigger key={sector} sector={sector} index={Math.round(fraction * layout.samples.length)} passed={passed} />
      ))}
    </>
  )
}
