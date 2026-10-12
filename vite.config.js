import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  css: { postcss: fileURLToPath(new URL('.', import.meta.url)) },
})
