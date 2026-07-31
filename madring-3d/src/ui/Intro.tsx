import { Suspense, useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'

import type { ReactNode } from 'react'

import { isTouchCapable } from '../controls/touchCapable'
import { useStore } from '../store'
import { Keys } from './Keys'

export function Intro({ children }: { children: ReactNode }): JSX.Element {
  const [clicked, setClicked] = useState(false)
  const [loading, setLoading] = useState(true)
  // Frozen at mount, same as TouchControls' own check — the keybinding legend
  // below is meaningless on a device with no keyboard, and in a short
  // landscape viewport its rows grow tall enough to sit over "Click to
  // start" and eat the tap.
  const [touch] = useState(isTouchCapable)
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
            {!touch && <Keys style={{ paddingBottom: 20 }} />}
            <p>
              {loading ? (
                `loading ${progress.toFixed()} %`
              ) : (
                <a className="start-link" href="#" onClick={() => setClicked(true)}>
                  {touch ? 'Tap to start' : 'Click to start'}
                </a>
              )}
            </p>
          </div>
        </div>
        {/* The upstream @pmndrs/branding Footer used to sit here. It is another
            organisation's branding on a derivative they had no part in, which
            reads as endorsement. Attribution is not lost — it lives in NOTICE
            and README, which is where the MIT licence actually requires it. */}
        {/* The circuit model is CC-BY-4.0. Attribution is a licence condition,
            not a courtesy, and the licence asks for this credit "wherever you
            share it" — so it goes on the screen the player actually sees, not
            only in NOTICE. Do not remove it while the model is in use. */}
        <footer className="attribution">
          Circuit: this work is based on{' '}
          <a href="https://sketchfab.com/3d-models/circuito-de-madring-2026-layout-5bbaf6e5048643858a498bc8a4ef4c05">
            &ldquo;Circuito de Madring 2026 layout&rdquo;
          </a>{' '}
          by <a href="https://sketchfab.com/Tyler_Dave">Dave Love SketchFab</a>, licensed <a href="http://creativecommons.org/licenses/by/4.0/">CC-BY-4.0</a>.
          Car model &amp; vehicle dynamics adapted from{' '}
          <a href="https://github.com/ahacker-1/apex-formula-2026">APEX FORMULA 2026</a> (© 2026 Avi Hacker, J.D., Apache-2.0).
          <br />
          Derivative of <a href="https://github.com/pmndrs/racing-game">@pmndrs/racing-game</a> and{' '}
          <a href="https://github.com/colyseus/react-racing-game">colyseus/react-racing-game</a>, both MIT. Centreline from{' '}
          <a href="https://github.com/bacinger/f1-circuits">f1-circuits</a> (MIT).
        </footer>
      </div>
    </>
  )
}
