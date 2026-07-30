/**
 * Frame-time clamp.
 *
 * The upstream code smooths almost everything with `lerp(a, b, delta * k)` for
 * k up to 20. That is only a lerp while `delta * k <= 1`; above that it
 * extrapolates, and the terms that feed back into themselves (camera sway,
 * engine audio playback rate) diverge to infinity within a handful of frames.
 * On a slow machine that means a camera pointed at the sky and a stream of
 * "non-finite value" errors out of the Web Audio API.
 *
 * Clamping the step to 30 fps keeps every one of those terms contractive. The
 * physics is stepped separately by @react-three/cannon and is unaffected.
 */
export const MAX_DELTA = 1 / 30

export const clampDelta = (delta: number): number => (delta > MAX_DELTA ? MAX_DELTA : delta)
