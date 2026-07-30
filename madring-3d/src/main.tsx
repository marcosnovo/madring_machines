import { createRoot } from 'react-dom/client'
import { useGLTF } from '@react-three/drei'
import 'inter-ui'
import './styles.css'
import { DRACO_PATH } from './draco'
import App from './App'
import { getState, mutation } from './store'
import { getLayout } from './circuit/layout'

useGLTF.preload('/models/chassis-draco.glb', DRACO_PATH)
useGLTF.preload('/models/wheel-draco.glb', DRACO_PATH)

createRoot(document.getElementById('root')!).render(<App />)

// Dev-only handle so a headless browser can inspect the car and the layout.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__game = { getState, mutation, getLayout }
}
