import { expect, test } from '@playwright/test'
import { openGame } from './helpers'

test.skip(({ isMobile }) => isMobile, 'The desktop project covers the ranked flow.')

async function answer(page: import('@playwright/test').Page, name: string) {
  const input = page.getByRole('combobox')
  await input.fill(name)
  await input.press('Enter')
}

async function playMystery(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^Mystery Country/ }).click()
  const gotIt = page.getByRole('button', { name: 'Got it' })
  if (await gotIt.isVisible()) await gotIt.click()
  await answer(page, 'Japan')
  await page.getByRole('button', { name: 'Give up' }).click()
  await page.getByRole('button', { name: 'See results' }).click()
}

test('a ranked daily is played once, even when the browser forgets its progress', async ({
  page,
}) => {
  await openGame(page, '/#/daily')
  await playMystery(page)
  await expect(page.locator('.daily-share__text')).toContainText('Mystery country')
  await expect(page.locator('.practice-tag')).toHaveCount(0)

  // Wipe everything the browser remembers except the server's cookie: the server still knows.
  await page.evaluate(() => localStorage.clear())
  await page.goto('/#/daily/mystery')
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'You’ve played this one' })).toBeVisible()
})

test('without a server the daily is offline practice, and says so', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
  await openGame(page, '/#/daily')
  await expect(page.getByText('dailies are offline practice and are not ranked')).toBeVisible()
  await playMystery(page)
  await expect(page.locator('.daily-share__text')).toContainText('Mystery country')
})

test('the server never sends tomorrow’s answers to the browser', async ({ page }) => {
  const bodies: string[] = []
  page.on('response', async (response) => {
    if (!response.url().includes('/api/daily/')) return
    // The page may close while a body is still arriving; that is not what this test checks.
    await response.text().then(
      (text) => bodies.push(text),
      () => {},
    )
  })
  await openGame(page, '/#/daily')
  await page.getByRole('button', { name: /^Daily Five/ }).click()
  await expect.poll(() => bodies.length).toBeGreaterThan(0)
  const view = JSON.parse(bodies[0]).view
  expect(view.seed).toBe('')
  expect(view.rounds.challenges.slice(1).every((c: { countryId?: string }) => !c.countryId)).toBe(
    true,
  )
})
