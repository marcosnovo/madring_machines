import { Suspense, useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'

import type { ReactNode } from 'react'

import { useStore } from '../store'
import { Keys } from './Keys'

export function Intro({ children }: { children: ReactNode }): JSX.Element {
  const [clicked, setClicked] = useState(false)
  const [loading, setLoading] = useState(true)
  const { progress } = useProgress()
  const set = useStore((state) => state.set)

  useEffect(() => {
    if (clicked && !loading) set({ ready: true })
  }, [clicked, loading])

  useEffect(() => {
    if (progress === 100) setLoading(false)
  }, [progress])

  return (
    <>
      <Suspense fallback={null}>{children}</Suspense>
      <div className={`fullscreen bg ${loading ? 'loading' : 'loaded'} ${clicked && 'clicked'}`}>
        <div className="stack">
          <div className="intro-keys">
            <Keys style={{ paddingBottom: 20 }} />
            <p>
              { loading ?
                  `loading ${progress.toFixed()} %` :
                  (<a className="start-link" href="#" onClick={() => setClicked(true)}>{ 'Click to start'}</a>)
              }
            </p>
          </div>
        </div>
        {/* The upstream @pmndrs/branding Footer used to sit here. It is another
            organisation's branding on a derivative they had no part in, which
            reads as endorsement. Attribution is not lost — it lives in NOTICE
            and README, which is where the MIT licence actually requires it. */}
        <footer className="attribution">
          Derivative of{' '}
          <a href="https://github.com/pmndrs/racing-game">@pmndrs/racing-game</a> and{' '}
          <a href="https://github.com/colyseus/react-racing-game">colyseus/react-racing-game</a>,
          both MIT. Circuit derived from{' '}
          <a href="https://github.com/bacinger/f1-circuits">f1-circuits</a> (MIT).
        </footer>
      </div>
    </>
  )
}
