import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Default + 1; Vite moves to the next free port if this one is taken.
  server: {
    port: 5174,
    // The battle server (npm run server); WG_SERVER_PORT lets tests use their own.
    proxy: {
      '/ws': {
        target: `ws://localhost:${process.env.WG_SERVER_PORT ?? 8788}`,
        ws: true,
        // Players drop connections all the time (closed tabs, sleeping phones); not an error.
        configure: (proxy) => proxy.on('error', () => {}),
      },
    },
  },
  preview: { port: 4174 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
