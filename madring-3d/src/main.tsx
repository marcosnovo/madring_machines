import { createRoot } from 'react-dom/client'
import { useGLTF } from '@react-three/drei'
import 'inter-ui'
import './styles.css'
import App from './App'
import { getState, mutation } from './store'
import { getLayout } from './circuit/layout'

import { asset } from './assets'

useGLTF.preload(asset('models/f1car-2026.glb'))

createRoot(document.getElementById('root')!).render(<App />)

// Dev-only handle so a headless browser can inspect the car and the layout.
if (import.meta.env.DEV) {
  const globals = window as unknown as Record<string, unknown>
  globals.__game = { getState, mutation, getLayout }
}
