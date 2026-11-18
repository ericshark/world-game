import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openGame, pinTarget, snapshot, startPinpoint } from './helpers'

const facts = JSON.parse(readFileSync('public/data/facts.json', 'utf8')).countries as Record<
  string,
  { iso2: string }
>
const flagOf = (id: string) => facts[id].iso2.toLowerCase()

/** True once the picture has really loaded, not just been given a source. */
async function flagLoaded(page: Page, selector: string) {
  await expect
    .poll(() =>
      page
        .locator(selector)
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0)
}

test('Find it with flags: a flag is the question, and the globe is the answer', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openGame(page)
  await startPinpoint(page, ['Flags'])

  await expect(page.getByRole('heading', { name: 'Find the country with this flag' })).toBeVisible()
  await flagLoaded(page, '[data-testid="target-flag"]')
  // The flag is the question, so it must not announce its own answer.
  await expect(page.getByTestId('target-flag')).toHaveAttribute('alt', '')

  const { targetId } = await snapshot(page)
  await expect(page.getByTestId('target-flag')).toHaveAttribute('data-flag', flagOf(targetId!))
  await pinTarget(page)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(/You found/)).toBeVisible()
  // The reveal teaches the flag along with the facts.
  await expect(page.getByRole('img', { name: /^Flag of / })).toBeVisible()
  expect(errors).toEqual([])
})

test('Name it with flags: pick the highlighted country’s flag from look-alikes', async ({
  page,
}) => {
  await openGame(page)
  await startPinpoint(page, ['Name it', 'Flags'])

  await expect(page.getByRole('heading', { name: /Which flag is this country/ })).toBeVisible()
  const options = page.locator('.choice-grid--flags button')
  await expect(options).toHaveCount(4)
  await flagLoaded(page, '.choice-grid--flags .flag')
  // Options are named by position, so the buttons never give the answer away.
  await expect(options.first()).toHaveAccessibleName('Flag 1')

  const codes = await options
    .locator('img')
    .evaluateAll((imgs) => imgs.map((img) => img.getAttribute('data-flag')))
  expect(new Set(codes).size).toBe(4)

  const { targetId } = await snapshot(page)
  // A wrong pick is marked wrong; the right one scores.
  await options.locator(`img[data-flag="${flagOf(targetId!)}"]`).click()
  await expect(page.getByText(/Yes, it's/)).toBeVisible()
  await page.getByRole('button', { name: /^(Next|See results)$/ }).click()

  const second = await snapshot(page)
  const wrong = codes.find((code) => code !== flagOf(second.targetId!))
  const secondOptions = page.locator('.choice-grid--flags button')
  await expect(secondOptions).toHaveCount(4)
  const pick = await secondOptions
    .locator('img')
    .evaluateAll(
      (imgs, answer) => imgs.findIndex((img) => img.getAttribute('data-flag') !== answer),
      flagOf(second.targetId!),
    )
  expect(pick).toBeGreaterThanOrEqual(0)
  expect(wrong).toBeDefined()
  await secondOptions.nth(pick).click()
  await expect(page.getByText(/not /)).toBeVisible()
})

test('a lesson’s study card shows the flag, and credits name the artwork', async ({ page }) => {
  await openGame(page, '/#/learn/northern-africa-1')
  await expect(page.getByText('Meet the countries')).toBeVisible()
  await flagLoaded(page, '[data-testid="study-flag"]')

  await openGame(page, '/#/credits')
  await expect(page.getByText(/flag-icons/)).toBeVisible()
  await expect(page.getByText(/MIT licence/)).toBeVisible()
  const licence = await page.request.get('/flags/LICENSE')
  expect(licence.ok()).toBe(true)
  expect(await licence.text()).toContain('Permission is hereby granted, free of charge')
})
