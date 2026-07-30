import { createRoot } from 'react-dom/client'
import { useGLTF } from '@react-three/drei'
import 'inter-ui'
import './styles.css'
import App from './App'

useGLTF.preload('/models/chassis-draco.glb')
useGLTF.preload('/models/wheel-draco.glb')

createRoot(document.getElementById('root')!).render(<App />)
