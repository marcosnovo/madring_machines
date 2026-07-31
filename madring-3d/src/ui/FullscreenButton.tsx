import { useCallback, useEffect, useState } from 'react'

function isFullscreen(): boolean {
  return document.fullscreenElement != null
}

function isSupported(): boolean {
  // iOS Safari on iPhone has no Fullscreen API at all (`requestFullscreen`
  // exists on iPad, not on iPhone) — showing a button that silently does
  // nothing is worse than not showing one, so this hides it there instead.
  return typeof document !== 'undefined' && document.fullscreenEnabled === true
}

/**
 * A single button that both requests and exits fullscreen, swapping its
 * glyph (⛶ / ✕) with `fullscreenchange` rather than needing two elements —
 * same "one control, one state" shape as TouchControls' camera toggle.
 */
export function FullscreenButton(): JSX.Element | null {
  const [supported] = useState(isSupported)
  const [full, setFull] = useState(isFullscreen)

  useEffect(() => {
    if (!supported) return
    const onChange = () => setFull(isFullscreen())
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [supported])

  const toggle = useCallback(() => {
    if (isFullscreen()) {
      document.exitFullscreen().catch(() => {})
    } else {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }, [])

  if (!supported) return null

  return (
    <button className="fullscreen-toggle" onClick={toggle} aria-label={full ? 'Exit fullscreen' : 'Enter fullscreen'}>
      {full ? '✕' : '⛶'}
    </button>
  )
}
