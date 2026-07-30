/**
 * The Draco decoder is served from `public/draco/` rather than the
 * `https://www.gstatic.com/draco/...` CDN that @react-three/drei defaults to,
 * so the game loads with no third-party network requests at all. The files are
 * copied from the `three` package (Apache-2.0, Google); see ../NOTICE.
 */
import { asset } from './assets'

export const DRACO_PATH = asset('draco/')
