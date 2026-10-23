import { defineConfig, devices } from '@playwright/test'

// Ports of their own, so tests never reuse (or fight with) servers you are running.
const PORT = 5180
const BATTLE_SERVER_PORT = 8792

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // Each test renders WebGL in software; more than a couple at once starves the CPU.
  workers: Number(process.env.PW_WORKERS ?? 2),
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: process.env.PW_HEADLESS !== 'false',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // A phone: small portrait screen with touch.
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npx tsx server/index.ts',
      env: {
        PORT: String(BATTLE_SERVER_PORT),
        DATABASE_PATH: ':memory:',
        // Sign-in links point at the page the tests open (the Vite server).
        PUBLIC_ORIGIN: `http://localhost:${PORT}`,
        MAGIC_LINKS_PER_IP_PER_HOUR: '1000',
      },
      url: `http://localhost:${BATTLE_SERVER_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${PORT} --strictPort`,
      env: { WG_SERVER_PORT: String(BATTLE_SERVER_PORT) },
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
