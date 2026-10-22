import { expect, test } from '@playwright/test'
import { openGame, placePin } from './helpers'

test('World Journey: moves, missteps and connections on an expedition', async ({ page }, info) => {
  await openGame(page)
  await page.getByRole('button', { name: /^World Journey/ }).click()
  const setup = page.getByRole('dialog')
  await setup.getByRole('radio', { name: 'Expeditions' }).click()
  await setup.getByRole('radio', { name: /Cape to Cairo/ }).click()
  await setup.getByRole('button', { name: 'Play' }).click()
  const gotIt = page.getByRole('button', { name: 'Got it' })
  if (await gotIt.isVisible()) await gotIt.click()

  await expect(page.locator('.prompt__text')).toContainText('South Africa → Egypt')
  const go = page.getByRole('button', { name: 'Go' })
  await expect(go).toBeDisabled()

  // Harare, Zimbabwe: next door.
  await placePin(page, [31.05, -17.83])
  await go.click()
  await expect(page.locator('.journey-panel__status')).toContainText('You are in Zimbabwe')
  await expect(page.locator('.prompt__sub')).toContainText('Steps 1')

  // Cairo is far from Zimbabwe: a misstep.
  await placePin(page, [31.24, 30.04])
  await go.click()
  await expect(page.locator('.step-note')).toContainText("isn't connected to Zimbabwe")
  await expect(page.locator('.prompt__sub')).toContainText('Steps 2')

  await page.getByRole('button', { name: /Show connections/ }).click()
  await expect(page.locator('.prompt__sub')).toContainText('Steps 3')
  await page.waitForTimeout(1200)
  await page.screenshot({
    path:
      '/tmp/claude-1000/-home-eric-GitHub-world-game/0454089f-3b0d-41f0-86e3-1f7579fb7ace/scratchpad/shots/' +
      info.project.name +
      '-journey.png',
  })
})
