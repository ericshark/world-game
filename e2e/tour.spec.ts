import { expect, test } from '@playwright/test'
import { openGame, pinTarget } from './helpers'

test('the tour coaches a new player through three finds', async ({ page }) => {
  await openGame(page)
  await page.getByRole('button', { name: /Take the one-minute tour/ }).click()
  await page.waitForFunction(() => window.__worldGame !== undefined)

  const coach = page.locator('.coach')
  await expect(coach).toContainText('Find Brazil')
  await pinTarget(page)
  await expect(coach).toContainText('Happy with it?')
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(coach).toContainText('How scoring works')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(coach).toContainText('Now Australia')

  for (let round = 1; round < 3; round++) {
    await pinTarget(page)
    await page.getByRole('button', { name: 'Confirm' }).click()
    await page.getByRole('button', { name: /^(Next|See results)$/ }).click()
  }
  await expect(page.getByTestId('summary-total')).toContainText('3,000')

  // Offered once: the home screen moves on to goals.
  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page.getByText('Take the one-minute tour')).toHaveCount(0)
  await expect(page.getByText('Next goal')).toBeVisible()
})

test('the tour can be skipped', async ({ page }) => {
  await openGame(page)
  await page.getByRole('button', { name: 'No thanks' }).click()
  await expect(page.getByText('Take the one-minute tour')).toHaveCount(0)
  await page.reload()
  await openGame(page)
  await expect(page.getByText('Take the one-minute tour')).toHaveCount(0)
})
