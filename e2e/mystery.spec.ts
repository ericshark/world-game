import { expect, test } from '@playwright/test'
import { openGame, pinTarget, snapshot, startMode } from './helpers'

test('Mystery Country: guesses get distances, then the find', async ({ page }) => {
  await openGame(page)
  await startMode(page, 'Mystery Country')
  const target = (await snapshot(page)).targetId
  const first = target === 'JPN' ? 'Brazil' : 'Japan'

  const input = page.getByRole('combobox')
  await input.fill(first)
  await input.press('Enter')
  await expect(page.locator('.guess-row')).toHaveCount(1)
  await expect(page.locator('.prompt__sub')).toContainText(`Closest: ${first}`)

  await pinTarget(page)
  await expect(page.getByTestId('round-result')).toContainText('Found')
  await expect(page.getByTestId('round-result')).toContainText('+900')
  await page.getByRole('button', { name: 'See results' }).click()
  await expect(page.getByTestId('summary-total')).toContainText('900')
})

test('Mystery Country: guessing with the crosshair and Space', async ({ page }) => {
  await openGame(page)
  await page.getByRole('button', { name: /Settings/ }).click()
  await page.getByRole('radio', { name: 'Crosshair' }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  await startMode(page, 'Mystery Country')
  await expect(page.locator('.crosshair')).toBeVisible()
  // Space types into the guess box while it has focus; away from it, Space guesses.
  await page.getByRole('combobox').blur()
  await page.keyboard.press(' ')
  // The centre of the screen may be a country (a guess) or the sea (a nudge to aim at land).
  await expect(page.locator('.guess-row, .answer__message').first()).toBeVisible()
})
