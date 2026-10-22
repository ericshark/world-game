import { expect, type Page } from '@playwright/test'

type Snapshot = ReturnType<NonNullable<Window['__worldGame']>['snapshot']>

/** Opens the game and waits until the Earth and the country data have loaded. */
export async function openGame(page: Page, path = '/') {
  await page.goto(path)
  // The first load can take a while: Vite may optimise dependencies and reload the page.
  await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toBeHidden({
    timeout: 60_000,
  })
}

/** From the home screen: opens Pinpoint's setup, applies choices, and starts the game. */
export function startPinpoint(page: Page, choices: string[] = []) {
  return startMode(page, 'Pinpoint', choices)
}

/** From the home screen: opens a mode's setup, applies choices, and starts the game. */
export async function startMode(page: Page, mode: string, choices: string[] = []) {
  await page.getByRole('button', { name: new RegExp(`^${mode}`) }).click()
  const setup = page.getByRole('dialog')
  for (const choice of choices)
    await setup.getByRole('radio', { name: choice, exact: true }).click()
  await setup.getByRole('button', { name: 'Play' }).click()
  await page.waitForFunction(() => window.__worldGame !== undefined)
  // First-time "How to play" card.
  const gotIt = page.getByRole('button', { name: 'Got it' })
  if (await gotIt.isVisible()) await gotIt.click()
}

export function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => window.__worldGame!.snapshot())
}

/** Places the pin on the current target (a guaranteed hit). */
export async function pinTarget(page: Page) {
  await page.evaluate(() => {
    const hook = window.__worldGame!
    hook.placePin(hook.targetPoint()!)
  })
}

export async function placePin(page: Page, point: [number, number]) {
  await page.evaluate((p) => window.__worldGame!.placePin(p), point)
}
