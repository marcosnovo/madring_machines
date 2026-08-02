import { useCallback, useEffect, useState } from 'react'

import { useStore } from '../store'

/** Remembers an explicit dismissal of the hint, so it is asked once, not once per load. */
const HINT_KEY = 'madring-3d.fullscreen-hint'
/**
 * How long the hint lingers after the race starts before removing itself, ms.
 *
 * Deliberately measured from lights-out and not from mount. A wall-clock
 * timer started at mount runs during the asset load, which on a phone on
 * mobile data is comfortably longer than any sensible timeout — the hint then
 * expires behind the "loading 42 %" screen and the one player who needed to
 * read it never sees it. Tying it to `ready` means it is on screen for exactly
 * the stretch where it is useful (the intro, however long that lasts) and off
 * screen for the stretch where it would be clutter (driving).
 */
const HINT_LINGER = 6000

function isFullscreen(): boolean {
  return document.fullscreenElement != null
}

/**
 * Whether this browser can put an *element* into fullscreen.
 *
 * Deliberately a capability test and nothing else. There is no reliable way to
 * turn a user agent string into "does fullscreen work here", and guessing from
 * the platform gets it backwards in both directions: Chrome on Android has the
 * API, Chrome on an iPhone does not (every iOS browser is WebKit underneath,
 * and WebKit on iPhone exposes fullscreen for <video> only). `fullscreenEnabled`
 * is false in exactly the cases where the button would do nothing, which is the
 * only question being asked.
 */
function isSupported(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true
}

/**
 * Whether the page is already running as an installed / home-screen app, in
 * which case the browser chrome is gone already and there is nothing to
 * suggest. `navigator.standalone` is the iOS spelling and predates the
 * `display-mode` media query, which is why both are checked.
 */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

function hintDismissed(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === 'dismissed'
  } catch {
    // private browsing / storage disabled — showing the hint again is the
    // harmless failure here, so fall through to showing it.
    return false
  }
}

/**
 * The fullscreen control, and the fallback for browsers that have no
 * fullscreen to control.
 *
 * When the API exists this is a single button that both requests and exits
 * fullscreen, swapping its glyph (⛶ / ✕) with `fullscreenchange` rather than
 * needing two elements — same "one control, one state" shape as TouchControls'
 * camera toggle.
 *
 * When the API does *not* exist this used to render `null`, and that silence
 * was itself the bug report: a player on a phone saw no button, concluded the
 * feature had never been built, and had no way to find out that his device has
 * a perfectly good route to a full-screen game — installing the page to the
 * home screen, where it runs with no browser bars at all (index.html carries
 * the meta tags that make that work). So the absent button is replaced by one
 * quiet line saying so. It appears only where the API is genuinely missing,
 * never once the page is already running standalone, it can be dismissed for
 * good, and it clears itself shortly after the race starts so it cannot become
 * permanent HUD clutter.
 */
export function FullscreenButton(): JSX.Element | null {
  const [supported] = useState(isSupported)
  const [full, setFull] = useState(isFullscreen)
  const [hint, setHint] = useState(() => !isSupported() && !isStandalone() && !hintDismissed())
  const ready = useStore((state) => state.ready)

  useEffect(() => {
    if (!supported) return
    const onChange = () => setFull(isFullscreen())
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [supported])

  useEffect(() => {
    if (!hint || !ready) return
    const id = window.setTimeout(() => setHint(false), HINT_LINGER)
    return () => window.clearTimeout(id)
    // Runs once, when `ready` first flips: the timeout sets `hint` false and
    // nothing sets it back, so this cannot restart itself.
  }, [hint, ready])

  const toggle = useCallback(() => {
    // Both calls reject rather than throw when the browser declines — most
    // often because the click was not treated as a user gesture, or because a
    // permissions policy forbids it in an embedded frame. There is nothing
    // useful to do about either: the button simply does not take effect, and
    // the state stays honest because `full` is driven by `fullscreenchange`
    // rather than by assuming this succeeded. Swallowed deliberately, not
    // overlooked — an unhandled rejection here would be console noise on every
    // refused tap.
    const ignoreRefusal = (): void => undefined
    if (isFullscreen()) {
      document.exitFullscreen().catch(ignoreRefusal)
    } else {
      document.documentElement.requestFullscreen().catch(ignoreRefusal)
    }
  }, [])

  // Dismissing is remembered; ageing out at lights-out is not. Someone who
  // tapped ✕ has read it and does not want it again, while someone who simply
  // drove off may never have looked at it.
  const dismiss = useCallback(() => {
    setHint(false)
    try {
      window.localStorage.setItem(HINT_KEY, 'dismissed')
    } catch {
      // storage disabled — the hint reappearing next load is not fatal
    }
  }, [])

  if (!supported) {
    if (!hint) return null
    return (
      <div className="fullscreen-hint" role="note">
        <span>Fullscreen isn&rsquo;t available in this browser. Share &rarr; Add to Home Screen to play full-screen.</span>
        <button className="fullscreen-hint-close" onClick={dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    )
  }

  return (
    <button className="fullscreen-toggle" onClick={toggle} aria-label={full ? 'Exit fullscreen' : 'Enter fullscreen'}>
      {full ? '✕' : '⛶'}
    </button>
  )
}
