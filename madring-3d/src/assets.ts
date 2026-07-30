/**
 * Runtime asset URLs.
 *
 * Vite rewrites asset paths it can see at build time, but not string literals
 * handed to loaders at runtime — `useGLTF('/models/car.glb')` stays absolute
 * and breaks the moment the site is served from a sub-path rather than the
 * domain root, which is exactly what GitHub Pages does. Everything under
 * public/ must therefore be addressed through `asset()`.
 *
 * import.meta.env.BASE_URL is Vite's `base`, and always ends in a slash.
 */
export const asset = (p: string): string => import.meta.env.BASE_URL + p.replace(/^\//, '')
