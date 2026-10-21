import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const SERVER = process.env.NEXUS_SERVER ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // shared/constants.json lives one level up
    proxy: {
      '/api': SERVER,
      '/ws': { target: SERVER.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
  },
})
