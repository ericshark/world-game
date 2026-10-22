import { expect, test } from '@playwright/test'
import { openGame, pinTarget, placePin, snapshot } from './helpers'

test('plays a full Pinpoint game and records stats', async ({ page }) => {
  await openGame(page)
  await page.getByRole('radio', { name: 'Europe' }).click()
  await page.getByRole('button', { name: 'Play' }).click()

  const confirm = page.getByRole('button', { name: 'Confirm' })
  await expect(confirm).toBeDisabled()

  // Round 1: a real click on the globe places the pin.
  await page.mouse.click(720, 450)
  await expect(confirm).toBeEnabled()
  expect((await snapshot(page)).draftPin).not.toBeNull()

  // Then pin the target exactly, so the result is predictable.
  await pinTarget(page)
  await confirm.click()
  await expect(page.getByTestId('round-result')).toContainText('Correct!')
  await expect(page.getByText('+1,000')).toBeVisible()

  // Round 2: a miss in the ocean, confirmed with Enter.
  await page.getByRole('button', { name: 'Next' }).click()
  await placePin(page, [-30, 0])
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('round-result')).toContainText('You clicked the ocean')

  for (let round = 3; round <= 10; round++) {
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await snapshot(page)).round).toBe(round - 1)
    await pinTarget(page)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('round-result')).toContainText('Correct!')
  }

  await page.getByRole('button', { name: 'See results' }).click()
  await expect(page.getByTestId('summary-total')).toContainText('9,')
  await expect(page.getByText('Found 9 of 10 countries')).toBeVisible()

  // Stats survive a reload.
  await page.getByRole('button', { name: 'Change settings' }).click()
  await page.reload()
  await openGame(page)
  await page.getByRole('button', { name: 'Your stats' }).click()
  await expect(page.getByText('Rounds played')).toBeVisible()
  await expect(page.locator('.tile__value').nth(1)).toHaveText('10')
})

test('quitting mid-game returns to the start screen', async ({ page }) => {
  await openGame(page)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.getByRole('button', { name: 'Quit' }).click()
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  expect((await snapshot(page)).view).toBe('start')
})
