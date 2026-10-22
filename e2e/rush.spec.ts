import { expect, test } from '@playwright/test'
import { openGame, pinTarget, placePin, snapshot, startMode } from './helpers'

test('GeoRush: hits build a multiplier, skips cost time', async ({ page }) => {
  await openGame(page)
  await startMode(page, 'GeoRush')
  await expect(page.getByRole('timer')).toBeVisible()

  for (let i = 0; i < 3; i++) {
    const before = (await snapshot(page)).targetId
    await pinTarget(page)
    await expect.poll(async () => (await snapshot(page)).targetId).not.toBe(before)
  }
  await expect(page.locator('.hud__multiplier')).toHaveText('×2')
  await expect(page.getByLabel('Score 400')).toBeVisible()

  const skipped = (await snapshot(page)).targetId
  await page.getByRole('button', { name: /Skip/ }).click()
  await expect.poll(async () => (await snapshot(page)).targetId).not.toBe(skipped)
  await expect(page.locator('.hud__multiplier')).toBeHidden()
})

test('GeoRush sudden death ends on the first miss', async ({ page }) => {
  await openGame(page)
  await startMode(page, 'GeoRush', ['Sudden death'])
  await pinTarget(page)
  await placePin(page, [-150, -40])
  await expect(page.getByTestId('summary-total')).toContainText('100')
  await expect(page.getByText('Your first score in this setup')).toBeVisible()
})
