import { expect, test } from '@playwright/test'
import { openGame } from './helpers'

test.skip(({ isMobile }) => isMobile, 'These checks do not depend on the screen size.')

test('a crash shows a recovery page with an error id, and the menu is one click away', async ({
  page,
}) => {
  // Built sites report the crash to the server; development builds only log it.
  const reported =
    process.env.E2E_PRODUCTION === '1'
      ? page.waitForResponse((response) => response.url().endsWith('/api/client-error'))
      : null
  await page.goto('/#/crash')
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
  await expect(page.getByTestId('error-id')).toHaveText(/^[A-Z0-9]{4,6}$/)
  if (reported) {
    const response = await reported
    expect(response.status()).toBe(204)
    expect(response.request().postDataJSON().id).toBe(
      await page.getByTestId('error-id').textContent(),
    )
  }
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to the menu' }).click()
  await expect(page.getByRole('button', { name: /^Pinpoint/ })).toBeVisible()
})

test('a failed load offers a retry that works', async ({ page }) => {
  await page.route('**/data/countries.json*', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByText('Could not load the game')).toBeVisible()
  await page.unroute('**/data/countries.json*')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Loading Earth' })).toBeHidden({
    timeout: 60_000,
  })
  await expect(page.getByRole('button', { name: /^Pinpoint/ })).toBeVisible()
})

test('without WebGL the menus still work and the globe says why it is missing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.startsWith('webgl') || type === 'experimental-webgl') return null
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest) as never
    } as typeof original
  })
  await page.goto('/')
  await expect(page.getByText('The 3D globe is not available')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Loading Earth' })).toBeHidden()
  await page
    .getByRole('button', { name: /^Passport|Level/ })
    .first()
    .click()
})

test('a lost graphics context is announced, and the globe recovers', async ({ page }) => {
  await openGame(page, '/')
  const lose = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const gl = (canvas?.getContext('webgl2') ??
      canvas?.getContext('webgl')) as WebGLRenderingContext | null
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    ;(window as unknown as { __lose: WEBGL_lose_context }).__lose = extension
    extension.loseContext()
    return true
  })
  test.skip(!lose, 'This browser cannot simulate a lost context.')
  await expect(page.getByText('The globe lost its graphics connection')).toBeVisible()
  await page.evaluate(() =>
    (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext(),
  )
  await expect(page.getByText('The globe lost its graphics connection')).toBeHidden()
  // Still usable: the menu opens a game and its globe responds.
  await page.getByRole('button', { name: /^Pinpoint/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
