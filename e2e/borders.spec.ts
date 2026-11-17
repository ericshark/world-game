import { expect, test } from '@playwright/test'
import { openGame, pinTarget, startPinpoint } from './helpers'

test('country borders can be switched on in Settings, load once, and stay on', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openGame(page)

  // Off by default: the lines are not even downloaded.
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('data/borders.json')) requests.push(request.url())
  })
  await page.getByRole('button', { name: /Settings/ }).click()
  const borders = page.getByRole('switch', { name: 'Country borders' })
  await expect(borders).not.toBeChecked()
  expect(requests).toHaveLength(0)

  const loaded = page.waitForResponse((r) => r.url().includes('data/borders.json'))
  // The real checkbox sits under its styled track, so click the label as a player would.
  await page.locator('label.switch', { hasText: 'Country borders' }).click()
  await expect(borders).toBeChecked()
  expect((await loaded).ok()).toBe(true)

  // The choice survives a reload.
  await page.reload()
  // The reload keeps the Settings route, so the sheet is already open.
  await openGame(page, page.url())
  await expect(page.getByRole('switch', { name: 'Country borders' })).toBeChecked()
  expect(errors).toEqual([])
})

test('borders can be toggled from the game bar mid-game, and the game still plays', async ({
  page,
}) => {
  await openGame(page)
  await startPinpoint(page)
  const toggle = page.getByRole('button', { name: 'Country borders' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  await pinTarget(page)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('button', { name: /^(Next|See results)$/ })).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
})
