import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { openGame } from './helpers'

test.describe.configure({ mode: 'serial' })

const contexts: BrowserContext[] = []
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()))
})

/** A saved profile with some progress, as the game would have written it. */
const profileWith = (xp: number, games: number) => ({
  version: 2,
  countries: {},
  bests: {},
  history: Array.from({ length: games }, (_, i) => ({
    mode: 'pinpoint',
    bestKey: 'pinpoint:test',
    score: 100,
    maxScore: 1000,
    endedAt: 1_700_000_000_000 + i,
  })),
  xp,
  achievements: {},
  masteredAt: {},
  daily: {},
  cosmetics: { pin: 'coral', shape: 'classic', trail: 'solid', glow: 'classic', title: 'none' },
})

async function newDevice(browser: Browser, profile?: object) {
  const context = await browser.newContext()
  contexts.push(context)
  if (profile) {
    await context.addInitScript((saved) => {
      if (!localStorage.getItem('world-game:profile:v2')) {
        localStorage.setItem('world-game:profile:v2', JSON.stringify(saved))
      }
    }, profile)
  }
  const page = await context.newPage()
  await openGame(page, '/#/settings')
  return page
}

/** Signs in through the emailed link, read from the server's development mailbox. */
async function signIn(page: Page, email: string) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByText('We sent a sign-in link')).toBeVisible()
  const mailbox = (await (await page.request.get('/api/dev/mailbox')).json()) as {
    to: string
    text: string
  }[]
  const mail = mailbox.filter((m) => m.to === email).at(-1)!
  const link = mail.text.match(/http\S+#\/signin\/[\w-]+/)![0]
  await page.goto(link)
  await expect(page.getByTestId('account')).toContainText(`Signed in as ${email}`)
}

const storedXp = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('world-game:profile:v2') ?? '{}').xp)

test('a nickname, a magic-link sign-in and a profile that follows the player', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'One project is enough for the account flow.')
  const email = `ana-${Date.now()}@example.com`

  const laptop = await newDevice(browser, profileWith(700, 3))
  await laptop.getByLabel('Nickname').fill('Ana')
  await laptop.getByRole('button', { name: 'Save nickname' }).click()
  await expect(laptop.getByText('Nickname saved.')).toBeVisible()
  await signIn(laptop, email)
  // The progress on the laptop is uploaded without being asked.
  await expect
    .poll(async () => (await (await laptop.request.get('/api/profile')).json()).version)
    .toBe(1)

  // A fresh phone signs in to the same account and receives it.
  const phone = await newDevice(browser)
  expect(await storedXp(phone)).toBeUndefined()
  await signIn(phone, email)
  await expect.poll(() => storedXp(phone)).toBe(700)
  await expect(phone.getByLabel('Nickname')).toHaveValue('Ana')

  // Signing out leaves the progress on the device.
  await phone.getByRole('button', { name: 'Sign out' }).click()
  await expect(phone.getByText('You are playing as a guest')).toBeVisible()
  expect(await storedXp(phone)).toBe(700)
})

test('different progress on a device and an account asks which to keep', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'One project is enough for the account flow.')
  const email = `ben-${Date.now()}@example.com`

  const first = await newDevice(browser, profileWith(900, 5))
  await signIn(first, email)
  await expect
    .poll(async () => (await (await first.request.get('/api/profile')).json()).version)
    .toBe(1)

  const second = await newDevice(browser, profileWith(40, 1))
  await signIn(second, email)
  const dialog = second.getByRole('dialog', { name: 'Which progress do you want to keep?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /Use this device/ }).click()
  await expect
    .poll(async () => (await (await second.request.get('/api/profile')).json()).profile.xp)
    .toBe(40)

  // The first device now receives the choice made on the second.
  await first.reload()
  await openGame(first, '/#/settings')
  await expect.poll(() => storedXp(first), { timeout: 20_000 }).toBe(40)
})

test('a link that was already used says so', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'One project is enough for the account flow.')
  const email = `cy-${Date.now()}@example.com`
  const page = await newDevice(browser)
  await signIn(page, email)
  const mailbox = (await (await page.request.get('/api/dev/mailbox')).json()) as {
    to: string
    text: string
  }[]
  const link = mailbox
    .filter((m) => m.to === email)
    .at(-1)!
    .text.match(/http\S+#\/signin\/[\w-]+/)![0]
  await page.goto(link)
  await expect(page.getByRole('alert')).toContainText('expired or was already used')
})
