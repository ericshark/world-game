import { expect, test } from '@playwright/test'
import { openGame, pinTarget, startMode } from './helpers'

test('World Battle: win a duel against a bot', async ({ page }) => {
  // Each round waits for the bot to answer, and a duel can run to 15 rounds.
  test.setTimeout(360_000)
  await openGame(page)
  await startMode(page, 'World Battle', ['Duel', 'Novice'])
  await expect(page.locator('.scoreboard li')).toHaveCount(2)

  for (let round = 0; round < 15; round++) {
    await pinTarget(page)
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByTestId('round-result')).toBeVisible({ timeout: 30_000 })
    if (round === 0) await expect(page.locator('.battle-reveal__list li')).toHaveCount(2)
    const finished = (await page.getByRole('button', { name: 'See results' }).count()) > 0
    await page.getByRole('button', { name: /^(Ready|See results)$/ }).click()
    if (finished) break
  }

  await expect(page.getByRole('heading', { name: 'Victory!' })).toBeVisible()
  await expect(page.locator('.badges')).toContainText('Victorious')
})
