/**
 * "Is this a phone/tablet" detection, shared by the touch control overlay
 * (Touch.tsx), the compact HUD (`.touch-device` in styles.css, set from
 * App.tsx), and the store's mobile quality tier (store.ts) — one function,
 * so none of them can disagree about what counts as "mobile".
 *
 * Previously just `maxTouchPoints > 0` / `ontouchstart in window`, which
 * also fires on a touchscreen laptop — its trackpad makes it just as much
 * a mouse-driven desktop as any other, but it still got the on-screen
 * pedals overlay, the shrunk HUD text, and the lowered quality tier meant
 * for a phone's GPU. `(pointer: coarse) and (hover: none)` asks about the
 * PRIMARY pointer specifically: a touchscreen laptop's primary pointer is
 * its trackpad (fine, hover-capable) even though the screen also reports
 * touch events, while a phone or tablet has no such fallback — coarse and
 * hover-less is all it has. That's the actual distinction this needs.
 */
export function isTouchCapable(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(pointer: coarse) and (hover: none)').matches
  }
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}
