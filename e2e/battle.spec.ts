import { expect, test } from '@playwright/test'
import { openGame, pinTarget, startMode } from './helpers'

test('World Battle: win a duel against a bot', async ({ page }, info) => {
  test.setTimeout(240_000)
  await openGame(page)
  await startMode(page, 'World Battle', ['Duel', 'Novice'])
  await expect(page.locator('.scoreboard li')).toHaveCount(2)

  for (let round = 0; round < 15; round++) {
    await pinTarget(page)
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByTestId('round-result')).toBeVisible({ timeout: 30_000 })
    if (round === 0) {
      await expect(page.locator('.battle-reveal__list li')).toHaveCount(2)
      await page.screenshot({
        path:
          '/tmp/claude-1000/-home-eric-GitHub-world-game/0454089f-3b0d-41f0-86e3-1f7579fb7ace/scratchpad/shots/' +
          info.project.name +
          '-battle.png',
      })
    }
    const finished = (await page.getByRole('button', { name: 'See results' }).count()) > 0
    await page.getByRole('button', { name: /^(Ready|See results)$/ }).click()
    if (finished) break
  }

  await expect(page.getByRole('heading', { name: 'Victory!' })).toBeVisible()
  await expect(page.locator('.badges')).toContainText('Victorious')
})
