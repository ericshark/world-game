import { expect, test, type Browser, type BrowserContext } from '@playwright/test'
import { openGame } from './helpers'

test.skip(({ isMobile }) => isMobile, 'Two WebGL pages at once is enough for one project.')
test.describe.configure({ mode: 'serial' })

const contexts: BrowserContext[] = []
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()))
})

async function queuedPlayer(browser: Browser, name: string) {
  const context = await browser.newContext()
  contexts.push(context)
  const page = await context.newPage()
  await openGame(page, '/#/online')
  await page.getByPlaceholder('Your name').fill(name)
  await page.getByRole('button', { name: /Quick Duel/ }).click()
  return page
}

test('two players are matched and start a duel', async ({ browser }) => {
  test.setTimeout(120_000)
  const ana = await queuedPlayer(browser, 'Ana')
  await expect(ana.getByRole('heading', { name: 'Looking for an opponent…' })).toBeVisible()
  const ben = await queuedPlayer(browser, 'Ben')

  for (const page of [ana, ben]) {
    await expect(page).toHaveURL(/#\/room\/[A-Z]{5}$/)
    // Both are in the same running game, with no lobby in between.
    const gotIt = page.getByRole('button', { name: 'Got it' })
    await expect(page.locator('.prompt__text').or(gotIt).first()).toBeVisible()
  }
  const code = new URL(ana.url()).hash
  expect(new URL(ben.url()).hash).toBe(code)
})

test('a waiting player can cancel', async ({ browser }) => {
  const ana = await queuedPlayer(browser, 'Ana')
  await expect(ana.getByRole('heading', { name: 'Looking for an opponent…' })).toBeVisible()
  await ana.getByRole('button', { name: 'Cancel' }).click()
  await expect(ana).toHaveURL(/#\/$/)
})
