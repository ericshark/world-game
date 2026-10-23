import { expect, test, type Page } from '@playwright/test'
import { openGame, pinTarget, snapshot } from './helpers'

// Ranked dailies are checked against the server's date, so these tests play today's puzzle.
const DAY = '/#/'
const TODAY = new Date()
const NUMBER =
  Math.round(
    (Date.UTC(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()) - Date.UTC(2026, 9, 1)) /
      86_400_000,
  ) + 1

async function dismissIntro(page: Page) {
  const gotIt = page.getByRole('button', { name: 'Got it' })
  if (await gotIt.isVisible()) await gotIt.click()
}

async function answer(page: Page, name: string) {
  const input = page.getByRole('combobox')
  await input.fill(name)
  await input.press('Enter')
}

test('Daily World: five rounds once a day, then share', async ({ page }) => {
  test.setTimeout(180_000)
  await openGame(page, DAY)
  await page.getByRole('button', { name: new RegExp(`Daily World #${NUMBER}`) }).click()
  await page.getByRole('button', { name: /^Daily Five/ }).click()
  await page.waitForFunction(() => window.__worldGame !== undefined)
  await dismissIntro(page)

  const confirm = () => page.getByRole('button', { name: 'Confirm' }).click()
  // The server answers each move, so wait for the round to change before acting on the next.
  const next = async () => {
    const before = (await snapshot(page)).round
    await page.getByRole('button', { name: /^(Next|See results)$/ }).click()
    await expect
      .poll(async () => {
        const after = await snapshot(page).catch(() => null)
        return after === null || after.round !== before || after.phase === 'finished'
      })
      .toBe(true)
  }

  await pinTarget(page) // 1: find
  await confirm()
  await next()

  // The server answers each move; wait for it before reading or leaving.
  await expect.poll(async () => (await snapshot(page)).round).toBe(1)
  // Leaving part-way through keeps the attempt: it carries on rather than starting over.
  const target = (await snapshot(page)).targetId
  await page.getByRole('button', { name: 'Quit' }).click()
  await page.getByRole('button', { name: /^Daily Five/ }).click()
  await page.waitForFunction(() => window.__worldGame !== undefined)
  await expect.poll(async () => (await snapshot(page)).round).toBe(1)
  expect((await snapshot(page)).targetId).toBe(target)

  await answer(page, 'Japan') // 2: name it
  await next()
  await answer(page, 'Brazil') // 3: think rare, then place the answer
  await pinTarget(page)
  await confirm()
  await next()
  await pinTarget(page) // 4: capital
  await confirm()
  await next()
  await pinTarget(page) // 5: final find
  await confirm()
  await next()

  await expect(page.locator('.daily-share__text')).toContainText(`World Game Daily #${NUMBER}`)
  await expect(page.getByRole('button', { name: 'Play again' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Done' }).click()

  // The hub shows it done, and it cannot be played again, even after a reload.
  await expect(page.getByRole('button', { name: /^Daily Five/ })).toBeDisabled()
  await page.goto('/#/daily/five')
  await openGame(page, '/#/daily/five')
  await expect(page.getByRole('button', { name: /^Daily Five/ })).toBeDisabled()

  // A bonus puzzle: give up the mystery, and it joins the share text.
  await page.getByRole('button', { name: /^Mystery Country/ }).click()
  await dismissIntro(page)
  await answer(page, 'Japan')
  await page.getByRole('button', { name: 'Give up' }).click()
  await page.getByRole('button', { name: 'See results' }).click()
  await expect(page.locator('.daily-share__text')).toContainText('Mystery country')
})
