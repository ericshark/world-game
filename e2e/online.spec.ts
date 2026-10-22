import { expect, test, type Page } from '@playwright/test'
import { openGame, pinTarget, placePin } from './helpers'

async function confirm(page: Page) {
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByTestId('locked-in').or(page.getByTestId('round-result'))).toBeVisible()
}

test('two players share a room: same round, secret answers, revealed together', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Two WebGL pages at once is enough for one project.')
  test.setTimeout(180_000)
  const ana = await (await browser.newContext()).newPage()
  const ben = await (await browser.newContext()).newPage()

  await openGame(ana, '/#/online')
  await ana.getByPlaceholder('Your name').fill('Ana')
  await ana.getByRole('button', { name: 'Create a room' }).click()
  const code = (await ana.getByTestId('room-code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z]{4}$/)
  await expect(ana).toHaveURL(new RegExp(`#/room/${code}$`))

  await openGame(ben, `/#/room/${code}`)
  await expect(ana.locator('.lobby__members li')).toHaveCount(2)
  await expect(ben.getByText('Waiting for the host to start')).toBeVisible()

  await ana.getByRole('button', { name: /^Start/ }).click()
  for (const page of [ana, ben]) {
    const gotIt = page.getByRole('button', { name: 'Got it' })
    await expect(page.locator('.prompt__text').or(gotIt).first()).toBeVisible()
    if (await gotIt.isVisible()) await gotIt.click()
  }
  await expect(ana.locator('.prompt__text')).toHaveText(
    (await ben.locator('.prompt__text').textContent()) ?? '',
  )

  await pinTarget(ana)
  await confirm(ana)
  await expect(ana.getByTestId('locked-in')).toContainText('1 / 2')
  // Ben sees that Ana answered, but not where.
  await expect(ben.locator('.scoreboard li').first()).toBeVisible()
  await placePin(ben, [-150, -40])
  await confirm(ben)

  for (const page of [ana, ben]) {
    await expect(page.getByTestId('round-result')).toContainText('Ana')
    await expect(page.getByTestId('round-result')).toContainText('+1,000')
  }
  await ana.getByRole('button', { name: 'Ready' }).click()
  await ben.getByRole('button', { name: 'Ready' }).click()
  // Both move on together (on a slow machine the next round's clock may already have run out).
  for (const page of [ana, ben]) {
    await expect(page.locator('.hud__progress')).toHaveText(/Round [2-9]/)
  }
})
