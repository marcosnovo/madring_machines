/**
 * Touch-capability detection, shared by the touch control overlay (Touch.tsx)
 * and the store's mobile quality tier (store.ts) — one function, so the two
 * can never disagree about what counts as "a phone".
 *
 * Deliberately not `pointer: coarse` or a screen-size sniff: a touchscreen
 * laptop with a mouse also has coarse-pointer media queries and a small
 * screen does not imply touch. `maxTouchPoints`/`ontouchstart` is what
 * actually answers "can this device receive a touch event", which is the
 * only thing that matters here — desktop must see nothing new.
 */
export function isTouchCapable(): boolean {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
}
