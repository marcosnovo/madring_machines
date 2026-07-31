import { useEffect, useState } from 'react'

function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth
}

/**
 * The whole HUD — RaceHud, Clock, Speed, TouchControls, the `.touch-device`
 * compact rules and the --pedal-clear math in styles.css — is built and
 * tuned for a landscape frame. Supporting portrait too would mean a second
 * layout to maintain (and re-verify on every future HUD change) for an
 * orientation a racing game gets little from anyway. Simpler to just not
 * support it: block play with a full-screen prompt instead until the device
 * (or window) is turned/resized to landscape.
 */
export function RotateGate(): JSX.Element | null {
  const [portrait, setPortrait] = useState(isPortrait)

  useEffect(() => {
    const onChange = () => setPortrait(isPortrait())
    window.addEventListener('resize', onChange)
    window.addEventListener('orientationchange', onChange)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
    }
  }, [])

  if (!portrait) return null

  return (
    <div className="rotate-gate">
      <div className="rotate-gate-icon">⟲</div>
      <p>Rotate your device to landscape to play</p>
    </div>
  )
}
