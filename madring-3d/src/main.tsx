import { createRoot } from 'react-dom/client'
import { useGLTF } from '@react-three/drei'
import 'inter-ui'
import './styles.css'
import { DRACO_PATH } from './draco'
import App from './App'
import { getState, mutation } from './store'
import { getLayout } from './circuit/layout'
import { getPlayer } from './vehicle/CarController'
import { getRace } from './race/RaceSession'
import { getRaceLine } from './race/line'
import { tuning } from './vehicle/tuning'

import { asset } from './assets'

useGLTF.preload(asset('models/f1car-2026.glb'), DRACO_PATH)

createRoot(document.getElementById('root')!).render(<App />)

// Dev-only handle so a headless browser can inspect the car and the layout.
if (import.meta.env.DEV) {
  const globals = window as unknown as Record<string, unknown>
  globals.__game = { getState, mutation, getLayout, getPlayer, getRace, getRaceLine, tuning }
}
