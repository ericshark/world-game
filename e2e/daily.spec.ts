import { expect, test, type Page } from '@playwright/test'
import { openGame, pinTarget } from './helpers'

const DAY = '/?date=2026-10-21#/'

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
  await page.getByRole('button', { name: /Daily World #21/ }).click()
  await page.getByRole('button', { name: /^Daily Five/ }).click()
  await page.waitForFunction(() => window.__worldGame !== undefined)
  await dismissIntro(page)

  const confirm = () => page.getByRole('button', { name: 'Confirm' }).click()
  const next = () => page.getByRole('button', { name: /^(Next|See results)$/ }).click()

  await pinTarget(page) // 1: find
  await confirm()
  await next()
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

  await expect(page.locator('.daily-share__text')).toContainText('World Game Daily #21')
  await expect(page.getByRole('button', { name: 'Play again' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Done' }).click()

  // The hub shows it done, and it cannot be played again, even after a reload.
  await expect(page.getByRole('button', { name: /^Daily Five/ })).toBeDisabled()
  await page.goto('/?date=2026-10-21#/daily/five')
  await openGame(page, '/?date=2026-10-21#/daily/five')
  await expect(page.getByRole('button', { name: /^Daily Five/ })).toBeDisabled()

  // A bonus puzzle: give up the mystery, and it joins the share text.
  await page.getByRole('button', { name: /^Mystery Country/ }).click()
  await dismissIntro(page)
  await answer(page, 'Japan')
  await page.getByRole('button', { name: 'Give up' }).click()
  await page.getByRole('button', { name: 'See results' }).click()
  await expect(page.locator('.daily-share__text')).toContainText('Mystery country')
})
