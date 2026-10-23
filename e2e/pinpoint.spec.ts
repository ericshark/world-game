import { expect, test } from '@playwright/test'
import { openGame, pinTarget, placePin, snapshot, startPinpoint } from './helpers'

test('plays a full game from the home screen and records stats', async ({ page }, info) => {
  // Ten rounds, a reload and the Passport, rendered in software.
  test.setTimeout(180_000)
  await openGame(page)
  await startPinpoint(page, ['Europe'])

  const confirm = page.getByRole('button', { name: 'Confirm' })
  await expect(confirm).toBeDisabled()

  // Round 1: a real click (or tap) on the globe places the pin, then we move it onto the target.
  const box = (await page.locator('canvas').boundingBox())!
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  if (info.project.name === 'phone') await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect(confirm).toBeEnabled()
  await pinTarget(page)
  await confirm.click()
  await expect(page.getByTestId('round-result')).toContainText(/Perfect/i)
  await expect(page.getByTestId('round-result')).toContainText('+1,000')

  // Round 2: a miss in the ocean, confirmed with Enter.
  await page.getByRole('button', { name: 'Next' }).click()
  await placePin(page, [-30, 0])
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('round-result')).toContainText('You clicked the ocean')

  for (let round = 3; round <= 10; round++) {
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.poll(async () => (await snapshot(page)).round).toBe(round - 1)
    await pinTarget(page)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('round-result')).toContainText(/Perfect/i)
  }

  await page.getByRole('button', { name: 'See results' }).click()
  await expect(page.getByTestId('summary-total')).toContainText('9,', { timeout: 5000 })
  await expect(page.getByText('Your first score in this setup')).toBeVisible()

  // Stats survive a reload.
  await page.getByRole('button', { name: 'Home' }).click()
  await page.reload()
  await openGame(page)
  await expect(page.getByText('Your World: 9 / 197 found')).toBeVisible()
  await page.getByRole('button', { name: /Your World/ }).click()
  await expect(page.locator('.passport .tile__value').nth(1)).toHaveText('9')
  await page.getByRole('radio', { name: 'Countries' }).click()
  await expect(page.locator('.passport .tile__value').nth(4)).toHaveText('10')
  await page.getByRole('radio', { name: 'Awards' }).click()
  await expect(page.locator('.awards .is-unlocked')).toContainText(['First steps'])
})

test('names countries: multiple choice on easy, typed with aliases on normal', async ({ page }) => {
  // Two games in one test.
  test.setTimeout(120_000)
  await openGame(page)
  await startPinpoint(page, ['Name it', 'Easy'])
  await expect(page.locator('.choice-grid button')).toHaveCount(4)
  await page.locator('.choice-grid button').first().click()
  await expect(page.getByTestId('round-result')).toBeVisible()

  await page.getByRole('button', { name: 'Quit' }).click()
  await startPinpoint(page, ['Name it', 'Normal'])
  const input = page.getByRole('combobox')
  await input.fill('Congo')
  await input.press('Enter')
  await expect(page.getByText('Which one did you mean?')).toBeVisible()
  await input.fill('Atlantis')
  await input.press('Enter')
  await expect(page.getByText(/We don't know "Atlantis"/)).toBeVisible()

  await input.fill('ivory')
  await expect(page.getByRole('option', { name: 'Côte d’Ivoire' })).toBeVisible()
  await input.fill('Ivory Coast')
  await input.press('Enter')
  await expect(page.getByTestId('round-result')).toBeVisible()
})

test('finds capitals', async ({ page }) => {
  await openGame(page)
  await startPinpoint(page, ['Capitals'])
  await expect(page.locator('.prompt__sub')).toContainText('capital of')
  await pinTarget(page)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByTestId('round-result')).toContainText('Bullseye')
})

test('plays by keyboard: arrows turn the globe, Space drops a pin, Enter confirms', async ({
  page,
}) => {
  await openGame(page)
  await startPinpoint(page)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('+')
  await page.keyboard.press(' ')
  await expect.poll(async () => (await snapshot(page)).draftPin).not.toBeNull()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('round-result')).toBeVisible()
})

test('remembers settings and uses miles', async ({ page }) => {
  await openGame(page)
  await page.getByRole('button', { name: /Settings/ }).click()
  await page.getByRole('radio', { name: 'Miles' }).click()
  await page.getByRole('radio', { name: 'Crosshair' }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  await page.reload()
  await openGame(page)
  await startPinpoint(page)
  await expect(page.locator('.crosshair')).toBeVisible()
  await page.getByRole('button', { name: 'Drop pin' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByTestId('round-result')).toContainText(/ mi|Perfect/)
})

test('a hard round keeps the pin that is down when time runs out', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One run is enough for a 20-second wait.')
  test.setTimeout(60_000)
  await openGame(page)
  await startPinpoint(page, ['Hard'])
  await expect(page.getByRole('timer')).toBeVisible()
  await placePin(page, [0, 0])
  await expect(page.getByTestId('round-result')).toBeVisible({ timeout: 25_000 })
  await expect(page.getByTestId('round-result')).not.toContainText("Time's up")
})

test('the round clock stops while the rules are open', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Clock behaviour does not depend on the screen.')
  await openGame(page)
  await startPinpoint(page, ['Hard'])
  const seconds = page.locator('.timer__seconds')
  await page.getByRole('button', { name: 'How to play' }).click()
  const shown = await seconds.textContent()
  await page.waitForTimeout(2_500)
  await expect(seconds).toHaveText(shown!)

  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(seconds).not.toHaveText(shown!, { timeout: 3_000 })
})
