import { defineConfig } from 'vite'
import reactRefresh from '@vitejs/plugin-react-refresh'
import reactJsx from 'vite-react-jsx'

export default defineConfig({
  // Served from a sub-path on GitHub Pages, from the root in dev. The deploy
  // workflow sets VITE_BASE; without it the dev server behaves as before.
  base: process.env.VITE_BASE || '/',
  plugins: [reactJsx(), reactRefresh()],
})
