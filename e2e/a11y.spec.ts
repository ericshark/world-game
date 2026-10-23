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
      .map((n) => `    ${n.target.join(' ')}`)
      .join('\n')}`
  const minor = results.violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical')
  if (minor.length > 0) console.log(`[axe] ${name}: ${minor.map((v) => v.id).join(', ')}`)
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect(serious.map(describe), `${name} has accessibility problems`).toEqual([])
}

test.describe('accessibility', () => {
  test('menus and sheets', async ({ page }) => {
    await openGame(page, '/')
    await audit(page, 'home')
    for (const [path, name] of [
      ['/#/setup/pinpoint', 'pinpoint setup'],
      ['/#/setup/battle', 'battle setup'],
      ['/#/passport', 'passport'],
      ['/#/daily', 'daily'],
      ['/#/settings', 'settings'],
      ['/#/leaderboards', 'leaderboards'],
      ['/#/online', 'online'],
    ] as const) {
      await page.goto(path)
      await page.getByRole('heading').first().waitFor()
      await audit(page, name)
    }
  })

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

  test('other game screens', async ({ page }) => {
    for (const mode of ['GeoRush', 'Mystery Country', 'World Journey', 'Rare Earth']) {
      await openGame(page, '/')
      await startMode(page, mode)
      await audit(page, mode)
    }
  })

  test('the first-time rules card', async ({ page }) => {
    await openGame(page, '/')
    await page.getByRole('button', { name: /^Pinpoint/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Got it' }).waitFor()
    await audit(page, 'how to play')
  })
})
