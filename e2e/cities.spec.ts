import { expect, test, type Page } from '@playwright/test'
import { openGame, pinTarget, snapshot, startPinpoint } from './helpers'

async function waitForQuiz(page: Page) {
  const gotIt = page.getByRole('button', { name: 'Got it' })
  await page.waitForFunction(
    () => window.__worldGame !== undefined || document.body.innerText.includes('Got it'),
  )
  if (await gotIt.isVisible()) await gotIt.click()
  await page.waitForFunction(() => window.__worldGame !== undefined)
}

async function finishCityQuiz(page: Page) {
  for (let step = 0; step < 40; step++) {
    if (await page.getByTestId('summary-total').isVisible()) return
    const { phase } = await snapshot(page).catch(() => ({ phase: null }))
    if (phase === 'revealed') {
      await page.getByRole('button', { name: /^(Next|See results)$/ }).click()
    } else if (phase === 'open') {
      await pinTarget(page)
      await page.getByRole('button', { name: 'Confirm' }).click()
    }
    await page.waitForTimeout(150)
  }
  throw new Error('The city quiz did not finish')
}

test('Pinpoint Cities lazy-loads cities.json, plays a round, and stores stats in profile.places only', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const cityRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('data/cities.json')) cityRequests.push(request.url())
  })

  await openGame(page)
  expect(cityRequests).toHaveLength(0)

  await page.getByRole('button', { name: /^Pinpoint/ }).click()
  const setup = page.getByRole('dialog')
  await setup.getByRole('radio', { name: 'Cities', exact: true }).click()
  await expect(setup.getByText(/cities in the pool/)).toBeVisible()
  await expect(setup.getByRole('switch', { name: 'Skip micro-states' })).toBeHidden()
  expect(cityRequests).toHaveLength(1)

  await setup.getByRole('button', { name: 'Play', exact: true }).click()
  await waitForQuiz(page)

  const { targetId } = await snapshot(page)
  expect(targetId).toMatch(/^[a-z]{3}-/)
  await expect(page.getByTestId('target-name')).toBeVisible()
  await pinTarget(page)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(/Bullseye:/)).toBeVisible()

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('world-game:profile:v2') ?? '{}'),
  )
  expect(Object.keys(stored.countries ?? {})).toEqual([])
  expect(stored.places?.[`city:${targetId}`]).toMatchObject({ attempts: 1, hits: 1 })
  expect(errors).toEqual([])
})

test('Learn Major cities: study a city deck, complete its quiz, and keep country mastery untouched', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await openGame(page, '/#/learn')
  await page.getByRole('radio', { name: 'Major cities', exact: true }).click()
  await expect(page.getByText(/major cities learned/)).toBeVisible()

  await page.locator('.lesson', { hasText: 'Oceania' }).first().click()
  await expect(page.getByText('Meet the cities')).toBeVisible()
  const total = Number((await page.locator('.hud__progress').innerText()).match(/of (\d+)/)![1])
  for (let i = 1; i < total; i++) {
    await page.getByRole('button', { name: 'Next city' }).click()
  }
  await page.getByRole('button', { name: 'Start the quiz' }).click()

  await waitForQuiz(page)
  await finishCityQuiz(page)
  await expect(page.getByTestId('summary-total')).toBeVisible()
  await page.locator('.results').getByRole('button', { name: 'Done', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Learn the world' })).toBeVisible()
  await page.getByRole('radio', { name: 'Major cities', exact: true }).click()
  await expect(page.locator('.lesson', { hasText: 'Oceania' }).first()).toContainText(
    `✓ ${total} / ${total}`,
  )
})

test('due major city reviews appear on Home and play in Learn Review', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    if (localStorage.getItem('world-game:profile:v2')) return
    localStorage.setItem(
      'world-game:profile:v2',
      JSON.stringify({
        version: 2,
        places: {
          'city:aus-sydney': {
            attempts: 2,
            hits: 2,
            totalKm: 0,
            recent: [true, true],
            box: 2,
            dueAt: 1,
          },
        },
      }),
    )
  })

  await openGame(page)
  await expect(page.getByText('1 review due')).toBeVisible()
  await page.getByRole('button', { name: /Continue learning/ }).click()
  await page.getByRole('button', { name: 'Review 1 due' }).click()

  await waitForQuiz(page)
  await expect(page.getByTestId('target-name')).toHaveText('Sydney')
  await finishCityQuiz(page)
  await page.locator('.results').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'No reviews due' })).toBeVisible()
})

test('Atlas shows major city markers, lists them on FactCard, focuses on click, and toggles off', async ({
  page,
}) => {
  await openGame(page, '/#/atlas')
  await expect(page.locator('.globe-label[data-marker="major"]').first()).toBeAttached()

  await page.getByRole('button', { name: 'France', exact: true }).click()
  await expect(page.locator('.country-card .facts')).toContainText('Major cities')
  await expect(page.locator('.country-card .facts')).toContainText('Lyon')
  await expect(
    page.locator('.globe-label[data-marker="major"]', { hasText: 'Lyon' }),
  ).toBeAttached()

  const lyonBtn = page.locator('.country-card').getByRole('button', { name: 'Lyon', exact: true })
  await lyonBtn.click()
  await expect(lyonBtn).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.globe-label[data-marker="goal"]', { hasText: 'Lyon' })).toBeAttached()

  await page.locator('label.switch', { hasText: 'Major cities' }).click()
  await expect(page.locator('.globe-label[data-marker="major"]')).toHaveCount(0)
})

test('Pinpoint Cities can be started via standard helper', async ({ page }) => {
  await openGame(page)
  await startPinpoint(page, ['Cities'])
  await expect(page.getByTestId('target-name')).toBeVisible()
})
