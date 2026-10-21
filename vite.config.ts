import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Default + 1; Vite moves to the next free port if this one is taken.
  server: { port: 5174 },
  preview: { port: 4174 },
  test: {
    environment: 'node',
  },
})
