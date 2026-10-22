import { expect, type Page } from '@playwright/test'

type Snapshot = ReturnType<NonNullable<Window['__worldGame']>['snapshot']>

/** Opens the game and waits until the Earth and the country data have loaded. */
export async function openGame(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('status')).toBeHidden()
  await page.waitForFunction(() => window.__worldGame !== undefined)
}

export function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => window.__worldGame!.snapshot())
}

/** Places the pin inside the current target (a guaranteed hit). */
export async function pinTarget(page: Page) {
  await page.evaluate(() => {
    const hook = window.__worldGame!
    hook.placePin(hook.targetPoint()!)
  })
}

export async function placePin(page: Page, point: [number, number]) {
  await page.evaluate((p) => window.__worldGame!.placePin(p), point)
}
