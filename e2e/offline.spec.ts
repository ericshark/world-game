import { expect, test } from '@playwright/test'
import { openGame, pinTarget, startMode } from './helpers'

test('service worker precaches shell, core data, and textures for offline play', async ({
  page,
  context,
}, info) => {
  test.skip(process.env.E2E_PRODUCTION !== '1', 'Service worker is only built for production.')
  test.skip(info.project.name !== 'desktop', 'One project is enough for offline caching.')

  await openGame(page, '/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // Ensure the activated worker controls subsequent fetches even if claim settled asynchronously.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  const cached = await page.evaluate(async () => {
    const names = await caches.keys()
    const swCache = names.find((name) => name.startsWith('world-game-'))
    if (!swCache) return []
    const cache = await caches.open(swCache)
    return (await cache.keys()).map((request) => new URL(request.url).pathname)
  })
  expect(cached).toContain('/')
  expect(cached).toContain('/data/countries.json')
  expect(cached).toContain('/data/facts.json')
  expect(cached).toContain('/data/borders.json')
  expect(cached).toContain('/data/cities.json')
  expect(cached).toContain('/textures/earth-4k.webp')
  expect(cached).toContain('/textures/night-4k.webp')

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: 'Loading Earth' })).toBeHidden({
    timeout: 60_000,
  })
  await startMode(page, 'Pinpoint')
  await pinTarget(page)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByTestId('round-result')).toBeVisible()

  await context.setOffline(false)
})
