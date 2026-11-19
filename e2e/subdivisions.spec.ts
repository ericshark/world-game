import { expect, test, type Page } from '@playwright/test'
import { openGame, pinTarget, snapshot } from './helpers'

async function waitForQuiz(page: Page) {
  const gotIt = page.getByRole('button', { name: 'Got it' })
  await page.waitForFunction(
    () => window.__worldGame !== undefined || document.body.innerText.includes('Got it'),
  )
  if (await gotIt.isVisible()) await gotIt.click()
  await page.waitForFunction(() => window.__worldGame !== undefined)
}

async function finishSubSession(page: Page) {
  for (let step = 0; step < 50; step++) {
    if (await page.getByTestId('summary-total').isVisible()) return
    const { phase } = await snapshot(page).catch(() => ({ phase: null }))
    if (phase === 'revealed') {
      await page.getByRole('button', { name: /^(Next|See results)$/ }).click()
    } else if (phase === 'open') {
      const choices = page.locator('.choice-grid button')
      if ((await choices.count()) > 0) {
        await choices.first().click()
      } else {
        await pinTarget(page)
        await page.getByRole('button', { name: 'Confirm' }).click()
      }
    }
    await page.waitForTimeout(150)
  }
  throw new Error('The subdivision session did not finish')
}

test('Pinpoint States & provinces lazy-loads the selected pack, plays Find it and Name it, and stores stats in profile.places only', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const subRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('data/sub/')) subRequests.push(request.url())
  })

  await openGame(page)
  expect(subRequests).toHaveLength(0)

  await page.getByRole('button', { name: /^Pinpoint/ }).click()
  const setup = page.getByRole('dialog')
  await setup.getByRole('radio', { name: 'States & provinces', exact: true }).click()
  await expect(setup.getByText(/51 states in the pool/)).toBeVisible()
  await expect(setup.getByRole('switch', { name: 'Skip micro-states' })).toBeHidden()
  expect(subRequests.some((url) => url.includes('data/sub/USA.json'))).toBe(true)

  // Switch to Germany and verify it lazy-loads DEU.json.
  await setup.getByRole('radio', { name: 'Germany', exact: true }).click()
  await expect(setup.getByText(/16 states in the pool/)).toBeVisible()
  expect(subRequests.some((url) => url.includes('data/sub/DEU.json'))).toBe(true)

  await setup.getByRole('button', { name: 'Play', exact: true }).click()
  await waitForQuiz(page)

  const { targetId } = await snapshot(page)
  expect(targetId).toMatch(/^DE-/)
  await expect(page.getByTestId('target-name')).toBeVisible()
  await pinTarget(page)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(/You found/)).toBeVisible()

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('world-game:profile:v2') ?? '{}'),
  )
  expect(Object.keys(stored.countries ?? {})).toEqual([])
  expect(stored.places?.[`sub:deu:${targetId!.toLowerCase()}`]).toMatchObject({
    attempts: 1,
    hits: 1,
  })
  expect(errors).toEqual([])
})

test('Learn States & provinces: study a pack lesson, complete its quiz, and record per-pack progress', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await openGame(page, '/#/learn')
  await page.getByRole('radio', { name: 'States & provinces', exact: true }).click()
  await expect(page.getByText(/0 \/ 51 United States states learned/)).toBeVisible()

  await page.getByRole('radio', { name: 'Australia', exact: true }).click()
  await expect(page.getByText(/0 \/ 8 Australia states & territories learned/)).toBeVisible()

  await page.locator('.lesson').first().click()
  await expect(page.getByText('Meet the states & provinces')).toBeVisible()
  const total = Number((await page.locator('.hud__progress').innerText()).match(/of (\d+)/)![1])
  for (let i = 1; i < total; i++) {
    await page.getByRole('button', { name: 'Next state' }).click()
  }
  await page.getByRole('button', { name: 'Start the quiz' }).click()

  await waitForQuiz(page)
  await finishSubSession(page)
  await expect(page.getByTestId('summary-total')).toBeVisible()
  await page.locator('.results').getByRole('button', { name: 'Done', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Learn the world' })).toBeVisible()
  await page.getByRole('radio', { name: 'States & provinces', exact: true }).click()
  await page.getByRole('radio', { name: 'Australia', exact: true }).click()
  await expect(page.locator('.lesson').first().locator('.lesson__progress')).not.toHaveText(/^0 \//)
})

test('due subdivision reviews appear on Home and play in Learn Review', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    if (localStorage.getItem('world-game:profile:v2')) return
    localStorage.setItem(
      'world-game:profile:v2',
      JSON.stringify({
        version: 2,
        places: {
          'sub:deu:de-by': {
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
  await expect(page.getByTestId('target-name')).toHaveText('Bavaria')
  await finishSubSession(page)
  await page.locator('.results').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'No reviews due' })).toBeVisible()
})
