import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * A fingerprint of the country data and textures. They are served from fixed names, so the
 * page asks for them as `?v=<this>`: a browser keeps them until their content changes.
 */
function assetVersion(): string {
  const hash = createHash('sha1')
  for (const directory of ['public/data', 'public/textures']) {
    for (const name of readdirSync(directory).sort()) {
      hash.update(name).update(readFileSync(`${directory}/${name}`))
    }
  }
  return hash.digest('hex').slice(0, 10)
}

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  define: { 'import.meta.env.VITE_ASSET_VERSION': JSON.stringify(assetVersion()) },
  // Default + 1; Vite moves to the next free port if this one is taken.
  server: {
    port: 5174,
    // The game server (npm run server); WG_SERVER_PORT lets tests use their own.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.WG_SERVER_PORT ?? 8788}`,
        configure: (proxy) => proxy.on('error', () => {}),
      },
      '/ws': {
        target: `ws://localhost:${process.env.WG_SERVER_PORT ?? 8788}`,
        ws: true,
        // Players drop connections all the time (closed tabs, sleeping phones); not an error.
        configure: (proxy) => proxy.on('error', () => {}),
      },
    },
  },
  build: {
    // The server build is only code; the site's files are served from dist/.
    copyPublicDir: !isSsrBuild,
    rolldownOptions: {
      output: {
        // three.js, react-three-fiber and drei are most of the weight and change rarely: one
        // chunk of their own caches well and keeps the app's own code small.
        codeSplitting: {
          groups: [
            // React is needed straight away; keeping it apart lets the 3D chunk load later.
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            {
              name: 'three',
              test: /node_modules[\\/](three|@react-three|three-stdlib|troika-[\w-]+|meshline|camera-controls|maath|@monogrid|detect-gpu|stats-gl|its-fine|suspend-react|zustand)[\\/]/,
            },
          ],
        },
      },
    },
  },
  preview: { port: 4174 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
}))
