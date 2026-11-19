import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openGame, startMode } from './helpers'

// Every screen is checked against WCAG 2.1 A and AA rules. Serious and critical problems fail
// the test; the rest are printed so they are not forgotten.
async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const describe = (v: (typeof results.violations)[number]) =>
    `${v.id} (${v.impact}): ${v.help}\n${v.nodes
      .slice(0, 3)
      .map((n) => `    ${n.target.join(' ')}: ${n.any[0]?.message ?? ''}`)
      .join('\n')}`
  const minor = results.violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical')
  if (minor.length > 0) console.log(`[axe] ${name}: ${minor.map((v) => v.id).join(', ')}`)
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect(serious.map(describe), `${name} has accessibility problems`).toEqual([])
}

test.describe('accessibility', () => {
  // Sheets fade in, and mid-fade axe measures half-transparent colours as low contrast. The app
  // turns animations off for reduced motion, so the audit sees screens as they settle.
  test.use({ reducedMotion: 'reduce' })

  test('home', async ({ page }) => {
    await openGame(page, '/')
    await audit(page, 'home')
  })

  // One test per screen: an axe pass takes several seconds on a CI runner rendering WebGL in
  // software, so ten in one test ran past the timeout.
  for (const [path, name] of [
    ['/#/setup/pinpoint', 'pinpoint setup'],
    ['/#/setup/battle', 'battle setup'],
    ['/#/passport', 'passport'],
    ['/#/learn', 'learn course'],
    ['/#/atlas', 'atlas'],
    ['/#/learn/northern-africa-1', 'lesson study'],
    ['/#/daily', 'daily'],
    ['/#/settings', 'settings'],
    ['/#/leaderboards', 'leaderboards'],
    ['/#/online', 'online'],
    ['/#/privacy', 'privacy'],
    ['/#/credits', 'credits'],
  ] as const) {
    test(name, async ({ page }) => {
      await openGame(page, path)
      await page.getByRole('heading').first().waitFor()
      await audit(page, name)
    })
  }

  test('sign-in', async ({ page }) => {
    await openGame(page, '/#/settings')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await audit(page, 'sign in')
  })

  test('playing Pinpoint, a result, and the end', async ({ page }) => {
    await openGame(page, '/')
    await startMode(page, 'Pinpoint')
    await audit(page, 'pinpoint question')
  })

  for (const [choices, name] of [
    [['Flags'], 'flag to find'],
    [['Name it', 'Flags'], 'flag to pick'],
    [['Cities'], 'cities'],
    [['States & provinces'], 'states and provinces'],
  ] as const) {
    test(`playing Pinpoint: ${name}`, async ({ page }) => {
      await openGame(page, '/')
      await startMode(page, 'Pinpoint', [...choices])
      await audit(page, name)
    })
  }

  test('learn major cities tab', async ({ page }) => {
    await openGame(page, '/#/learn')
    await page.getByRole('radio', { name: 'Major cities', exact: true }).click()
    await page.getByText(/major cities learned/).waitFor()
    await audit(page, 'learn major cities')
  })

  test('learn states & provinces tab', async ({ page }) => {
    await openGame(page, '/#/learn')
    await page.getByRole('radio', { name: 'States & provinces', exact: true }).click()
    await page.getByText(/states learned/).waitFor()
    await audit(page, 'learn states and provinces')
  })

  test('city deck study', async ({ page }) => {
    await openGame(page, '/#/learn/cities-oceania-1')
    await page.getByText('Meet the cities').waitFor()
    await audit(page, 'city deck study')
  })

  test('subdivision lesson study', async ({ page }) => {
    await openGame(page, '/#/learn/sub-deu-1')
    await page.getByText('Meet the states & provinces').waitFor()
    await audit(page, 'subdivision lesson study')
  })

  test('atlas with major cities', async ({ page }) => {
    await openGame(page, '/#/atlas')
    await page.getByRole('button', { name: 'France', exact: true }).click()
    await page.locator('.country-card .facts').getByText('Major cities').waitFor()
    await audit(page, 'atlas with major cities')
  })

  for (const mode of ['GeoRush', 'Mystery Country', 'World Journey', 'Rare Earth']) {
    test(`playing ${mode}`, async ({ page }) => {
      await openGame(page, '/')
      await startMode(page, mode)
      await audit(page, mode)
    })
  }

  test('the first-time rules card', async ({ page }) => {
    await openGame(page, '/')
    await page.getByRole('button', { name: /^Pinpoint/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Got it' }).waitFor()
    await audit(page, 'how to play')
  })
})
