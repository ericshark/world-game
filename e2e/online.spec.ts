import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { openGame, pinTarget, placePin } from './helpers'

// Each test drives several software-rendered globes at once; side by side they starve the CPU.
test.describe.configure({ mode: 'serial' })

/** Every player's browser, closed after each test so idle globes stop rendering. */
const contexts: BrowserContext[] = []
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()))
})

async function newPlayer(browser: Browser) {
  const context = await browser.newContext()
  contexts.push(context)
  return context.newPage()
}

async function confirm(page: Page) {
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByTestId('locked-in').or(page.getByTestId('round-result'))).toBeVisible()
}

async function dismissIntro(page: Page) {
  const gotIt = page.getByRole('button', { name: 'Got it' })
  await expect(page.locator('.prompt__text').or(gotIt).first()).toBeVisible()
  if (await gotIt.isVisible()) await gotIt.click()
}

/** A host who has made a room, and its code. */
async function hostRoom(browser: Browser, name: string) {
  const page = await newPlayer(browser)
  await openGame(page, '/#/online')
  await page.getByPlaceholder('Your name').fill(name)
  await page.getByRole('button', { name: 'Create a room' }).click()
  const code = (await page.getByTestId('room-code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z]{5}$/)
  await expect(page).toHaveURL(new RegExp(`#/room/${code}$`))
  return { page, code }
}

async function joinRoom(browser: Browser, code: string, name: string) {
  const page = await newPlayer(browser)
  // Arriving by link, a new player is asked their name first.
  await openGame(page, `/#/room/${code}`)
  await page.getByPlaceholder('Your name').fill(name)
  await page.getByRole('button', { name: `Join room ${code}` }).click()
  await expect(page.getByRole('button', { name: 'I’m ready' })).toBeVisible()
  return page
}

test('two players share a room: same round, secret answers, revealed together', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Two WebGL pages at once is enough for one project.')
  test.setTimeout(180_000)
  const { page: ana, code } = await hostRoom(browser, 'Ana')
  const ben = await joinRoom(browser, code, 'Ben')
  await expect(ana.locator('.lobby__members li')).toHaveCount(2)

  // The host can start only once everyone is ready.
  const start = ana.getByRole('button', { name: /^(Start|Waiting)/ })
  await expect(start).toBeDisabled()
  await ben.getByRole('button', { name: 'I’m ready' }).click()
  await expect(start).toBeEnabled()
  await start.click()
  for (const page of [ana, ben]) await dismissIntro(page)
  await expect(ana.locator('.prompt__text')).toHaveText(
    (await ben.locator('.prompt__text').textContent()) ?? '',
  )

  await pinTarget(ana)
  await confirm(ana)
  await expect(ana.getByTestId('locked-in')).toContainText('1 / 2')
  // Ben sees that Ana answered, but not where.
  await expect(ben.getByRole('list', { name: 'Players' }).getByLabel('answered')).toHaveCount(1)

  // Ben's connection drops (a reload); he comes back to the same round as himself.
  await ben.reload()
  await dismissIntro(ben)
  await expect(ben.locator('.hud__progress')).toHaveText(/Round 1/)
  await placePin(ben, [-150, -40])
  await confirm(ben)

  for (const page of [ana, ben]) {
    await expect(page.getByTestId('round-result')).toContainText('Ana')
    await expect(page.getByTestId('round-result')).toContainText('+1,000')
  }
  // Ready moves on early; otherwise the reveal ends by itself after a few seconds, which on a
  // slow machine may happen before the button is pressed.
  for (const page of [ana, ben]) {
    const ready = page.getByRole('button', { name: 'Ready' })
    if (await ready.isVisible()) await ready.click({ timeout: 2_000 }).catch(() => {})
  }
  // Both move on together (on a slow machine the next round's clock may already have run out).
  for (const page of [ana, ben]) {
    await expect(page.locator('.hud__progress')).toHaveText(/Round [2-9]/)
  }
})

test('three players play survival, with lives on the scoreboard', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'Three WebGL pages at once is enough for one project.')
  test.setTimeout(180_000)
  const { page: ana, code } = await hostRoom(browser, 'Ana')
  const ben = await joinRoom(browser, code, 'Ben')
  const cy = await joinRoom(browser, code, 'Cy')
  await ana.getByRole('radio', { name: 'Survival' }).click()
  for (const page of [ben, cy]) await page.getByRole('button', { name: 'I’m ready' }).click()
  await ana.getByRole('button', { name: /^Start · 3 players/ }).click()
  for (const page of [ana, ben, cy]) await dismissIntro(page)

  await pinTarget(ana)
  await confirm(ana)
  await pinTarget(ben)
  await confirm(ben)
  await placePin(cy, [-150, -40])
  await confirm(cy)
  // Cy scored lowest and loses a life; everyone sees the same table.
  for (const page of [ana, ben, cy]) {
    await expect(page.getByTestId('round-result')).toBeVisible()
    await expect(page.getByLabel('2 lives')).toHaveCount(1)
    await expect(page.getByLabel('3 lives')).toHaveCount(2)
  }
})
