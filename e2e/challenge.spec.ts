import { expect, test } from '@playwright/test'
import { openGame, pinTarget, placePin, snapshot, startMode } from './helpers'

test('a challenge link replays the same game against your score', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Clipboard access is set up for desktop only.')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openGame(page)
  await startMode(page, 'GeoRush', ['Sudden death'])
  const firstTarget = (await snapshot(page)).targetId
  await pinTarget(page)
  await placePin(page, [-150, -40])
  await expect(page.getByTestId('summary-total')).toContainText('100')

  await page.getByRole('button', { name: 'Challenge a friend' }).click()
  await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  const link = text.match(/https?:\/\/\S+/)![0]
  expect(link).toContain('#/challenge/')

  await page.goto(link)
  await openGame(page, link.replace(/^https?:\/\/[^/]+/, ''))
  await expect(page.getByRole('dialog')).toContainText('Beat 100 in GeoRush')
  await page.getByRole('button', { name: 'Accept the challenge' }).click()
  await page.waitForFunction(() => window.__worldGame !== undefined)
  expect((await snapshot(page)).targetId).toBe(firstTarget)

  await pinTarget(page)
  await pinTarget(page)
  await placePin(page, [-150, -40])
  await expect(page.locator('.results__rival')).toContainText('You beat the challenge')
})
