import { expect, test } from '@playwright/test'
import { openGame, pinTarget, startMode } from './helpers'

test('Rare Earth: name, place, reveal, and no repeats', async ({ page }) => {
  await openGame(page)
  await startMode(page, 'Rare Earth')
  await expect(page.locator('.prompt__text')).toContainText('Name a')

  const input = page.getByRole('combobox')
  await input.fill('France')
  await input.press('Enter')
  await expect(page.locator('.prompt__sub')).toContainText('Now find France')
  await pinTarget(page)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByTestId('round-result')).toContainText('accepted answers')

  await page.getByRole('button', { name: 'Next' }).click()
  await input.fill('France')
  await input.press('Enter')
  await expect(page.getByText('France: already used this game')).toBeVisible()
})
