// Measures how heavy the game is to load and to leave open, against a running server.
//   node scripts/measure-load.mjs http://localhost:8789 [phone]
// Reports transfer sizes, the time until the loading screen goes away, and the CPU and memory
// used by an idle page (a tab left open on the home screen).
import { chromium, devices } from '@playwright/test'

const [base = 'http://localhost:8789', profile = 'desktop'] = process.argv.slice(2)
const phone = profile === 'phone'

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
})
const context = await browser.newContext(
  phone ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 } },
)
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Performance.enable')
if (phone) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  // Roughly a good 4G connection.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 60,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8,
  })
}

const requests = new Map()
cdp.on('Network.responseReceived', (e) =>
  requests.set(e.requestId, { url: e.response.url, type: e.type }),
)
let transferred = 0
let scriptBytes = 0
cdp.on('Network.loadingFinished', (e) => {
  transferred += e.encodedDataLength
  if (requests.get(e.requestId)?.type === 'Script') scriptBytes += e.encodedDataLength
})

const started = Date.now()
await page.goto(base)
await page
  .getByRole('status')
  .filter({ hasText: 'Loading' })
  .waitFor({ state: 'hidden', timeout: 120_000 })
const readyMs = Date.now() - started
const paintMs = await page.evaluate(
  () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
)

// Open the Passport (the globe stays still there) and watch the idle page for a few seconds.
await page.evaluate(() => (window.location.hash = '#/passport'))
await page.waitForTimeout(3000)
const metric = async () =>
  Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
  )
const first = await metric()
await page.waitForTimeout(5000)
const last = await metric()
const idleCpuPercent = ((last.TaskDuration - first.TaskDuration) / 5) * 100

console.log(
  JSON.stringify(
    {
      profile,
      transferredMB: +(transferred / 1e6).toFixed(2),
      scriptKB: Math.round(scriptBytes / 1024),
      requests: requests.size,
      firstContentfulPaintMs: paintMs === null ? null : Math.round(paintMs),
      loadingScreenGoneMs: readyMs,
      idleCpuPercentOfOneCore: +idleCpuPercent.toFixed(1),
      jsHeapMB: +(last.JSHeapUsedSize / 1e6).toFixed(1),
    },
    null,
    2,
  ),
)
await browser.close()
