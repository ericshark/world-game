import { expect, test, type Page } from '@playwright/test'
import { openGame, pinTarget, snapshot } from './helpers'

/** Dismisses the first-time rules card, then waits for the quiz to be on screen. */
async function waitForQuiz(page: Page) {
  const gotIt = page.getByRole('button', { name: 'Got it' })
  await page.waitForFunction(
    () => window.__worldGame !== undefined || document.body.innerText.includes('Got it'),
  )
  if (await gotIt.isVisible()) await gotIt.click()
  await page.waitForFunction(() => window.__worldGame !== undefined)
}

/** Answers whatever comes up until the results screen: right where it can be done, else a guess. */
async function finishSession(page: Page) {
  for (let step = 0; step < 60; step++) {
    if (await page.getByTestId('summary-total').isVisible()) return
    const { phase } = await snapshot(page).catch(() => ({ phase: null }))
    if (phase === 'revealed') {
      await page.getByRole('button', { name: /^(Next|See results)$/ }).click()
    } else if (phase === 'open') {
      const choices = page.locator('.choice-grid button')
      if ((await choices.count()) > 0) await choices.first().click()
      else if (await page.getByRole('combobox').isVisible()) {
        // A typed naming question: an unknown answer counts as a miss, which is fine here.
        await page.getByRole('combobox').fill('Atlantis')
        await page.getByRole('combobox').press('Enter')
      } else {
        await pinTarget(page)
        await page.getByRole('button', { name: 'Confirm' }).click()
      }
    }
    await page.waitForTimeout(150)
  }
  throw new Error('The session did not finish')
}

test('a lesson: study each country, then the quiz, and the course remembers it', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await openGame(page)
  await page.getByRole('button', { name: /Learn the world/ }).click()
  await expect(page.getByRole('heading', { name: 'Learn the world' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'No reviews due' })).toBeDisabled()

  await page.getByRole('button', { name: /^Next lesson:/ }).click()
  // Study: each country in turn, with its capital and neighbours.
  await expect(page.getByText('Meet the countries')).toBeVisible()
  const total = Number((await page.locator('.hud__progress').innerText()).match(/of (\d+)/)![1])
  for (let i = 1; i < total; i++) {
    await page.getByRole('button', { name: 'Next country' }).click()
  }
  await page.getByRole('button', { name: 'Start the quiz' }).click()

  await waitForQuiz(page)
  await finishSession(page)
  await expect(page.getByTestId('summary-total')).toBeVisible()
  await page.locator('.results').getByRole('button', { name: 'Done', exact: true }).click()

  // Back in the course, the lesson shows what was learned.
  await expect(page.getByRole('heading', { name: 'Learn the world' })).toBeVisible()
  await expect(page.locator('.lesson').first().locator('.lesson__progress')).not.toHaveText(/^0 \//)
})

test('reviews that are due are listed on Home and can be played', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    if (localStorage.getItem('world-game:profile:v2')) return
    const overdue = { attempts: 2, hits: 2, totalKm: 0, recent: [true, true], box: 2, dueAt: 1 }
    localStorage.setItem(
      'world-game:profile:v2',
      JSON.stringify({
        version: 2,
        countries: { FRA: { locate: overdue }, BRA: { locate: overdue }, JPN: { locate: overdue } },
      }),
    )
  })
  await openGame(page)
  await expect(page.getByText('3 reviews due')).toBeVisible()

  await page.getByRole('button', { name: /Continue learning/ }).click()
  await page.getByRole('button', { name: 'Review 3 due' }).click()
  await waitForQuiz(page)
  await finishSession(page)
  await page.locator('.results').getByRole('button', { name: 'Done', exact: true }).click()

  // Answered right, so they move to tomorrow and nothing is due now.
  await expect(page.getByRole('button', { name: 'No reviews due' })).toBeVisible()
})

test('the atlas names a country, its capital and its neighbours', async ({ page }) => {
  await openGame(page, '/#/atlas')
  await expect(page.getByRole('heading', { name: 'Atlas' })).toBeVisible()
  await page.getByRole('button', { name: 'France', exact: true }).click()
  await expect(page.locator('.country-card__name')).toHaveText('France')
  await expect(page.locator('.country-card')).toContainText('Paris')
  await page.locator('.country-card').getByRole('button', { name: 'Spain' }).click()
  await expect(page.locator('.country-card__name')).toHaveText('Spain')
})

test('passing a regional exam earns its certificate', async ({ page }) => {
  test.setTimeout(240_000)
  await openGame(page, '/#/learn')
  await page.getByRole('button', { name: /Oceania.*Take exam/ }).click()
  await waitForQuiz(page)
  // Every question is a find-it, answered on the spot, so this passes.
  await finishSession(page)
  await expect(page.locator('.results')).toContainText('Passed')
  await page.locator('.results').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: /Oceania.*Certificate/ })).toBeVisible()
})

test('mix-ups you have made can be drilled side by side', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    if (localStorage.getItem('world-game:profile:v2')) return
    localStorage.setItem(
      'world-game:profile:v2',
      JSON.stringify({ version: 2, confusions: { 'SVK>SVN': 2, 'SVN>SVK': 1 } }),
    )
  })
  await openGame(page, '/#/learn')
  await expect(page.getByText('Slovakia / Slovenia')).toBeVisible()
  await page.getByRole('button', { name: 'Drill your mix-ups' }).click()
  await waitForQuiz(page)
  await finishSession(page)
  await expect(page.locator('.results')).toBeVisible()
})
