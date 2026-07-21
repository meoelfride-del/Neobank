import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const spaRoutes = [
  'login', 'register', 'onboarding', 'dashboard', 'accounts',
  'transfer', 'cards', 'budget', 'chatbot', 'admin',
]

function spaRouteEntries() {
  return {
    name: 'spa-route-entries',
    closeBundle() {
      const entryFile = path.resolve('dist/index.html')
      for (const route of spaRoutes) {
        const routeDir = path.resolve('dist', route)
        fs.mkdirSync(routeDir, { recursive: true })
        fs.copyFileSync(entryFile, path.join(routeDir, 'index.html'))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), spaRouteEntries()],
})
