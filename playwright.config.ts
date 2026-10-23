import { defineConfig, devices } from '@playwright/test'

// Ports of their own, so tests never reuse (or fight with) servers you are running.
const PORT = 5180
const BATTLE_SERVER_PORT = 8792
// E2E_PRODUCTION=1 tests the built site served by the built server on one port, as deployed
// (build first with `VITE_E2E=1 npm run build`, which keeps the tests' hooks in the build).
const PRODUCTION = process.env.E2E_PRODUCTION === '1'
const PRODUCTION_PORT = 8793

const serverEnv = {
  DATABASE_PATH: ':memory:',
  MAGIC_LINKS_PER_IP_PER_HOUR: '1000',
  NEW_SESSIONS_PER_IP_PER_HOUR: '100000',
  // Not NODE_ENV=production: sign-in tests read links from the development mailbox.
  DAILY_SECRET: 'end-to-end-secret',
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // Each test renders WebGL in software; more than a couple at once starves the CPU.
  workers: Number(process.env.PW_WORKERS ?? 2),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PRODUCTION ? PRODUCTION_PORT : PORT}`,
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
    // Safari's engine, for iPhone-like coverage (CI installs it; PW_WEBKIT=1 turns it on).
    ...(process.env.PW_WEBKIT === '1'
      ? [{ name: 'webkit', use: { ...devices['iPhone 14'] } }]
      : []),
  ],
  webServer: PRODUCTION
    ? [
        {
          command: 'node dist-server/index.js',
          env: {
            ...serverEnv,
            PORT: String(PRODUCTION_PORT),
            PUBLIC_ORIGIN: `http://localhost:${PRODUCTION_PORT}`,
          },
          url: `http://localhost:${PRODUCTION_PORT}/health/ready`,
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ]
    : [
        {
          command: 'npx tsx server/index.ts',
          env: {
            ...serverEnv,
            PORT: String(BATTLE_SERVER_PORT),
            // Sign-in links point at the page the tests open (the Vite server).
            PUBLIC_ORIGIN: `http://localhost:${PORT}`,
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
