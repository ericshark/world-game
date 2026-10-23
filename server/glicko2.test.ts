import { describe, expect, it } from 'vitest'
import { NEW_RATING, updateRating } from './glicko2'

describe('Glicko-2', () => {
  it('matches the worked example in the paper', () => {
    // Glickman's example: a 1500 player (RD 200, volatility 0.06) beats a 1400 player and loses
    // to a 1550 and a 1700 player. The paper's answer is 1464.06, RD 151.52, volatility 0.05999.
    const next = updateRating({ rating: 1500, rd: 200, vol: 0.06 }, [
      { opponent: { rating: 1400, rd: 30, vol: 0.06 }, score: 1 },
      { opponent: { rating: 1550, rd: 100, vol: 0.06 }, score: 0 },
      { opponent: { rating: 1700, rd: 300, vol: 0.06 }, score: 0 },
    ])
    expect(next.rating).toBeCloseTo(1464.06, 1)
    expect(next.rd).toBeCloseTo(151.52, 1)
    expect(next.vol).toBeCloseTo(0.05999, 4)
  })

  it('moves winners up and losers down, more when they are less certain', () => {
    const win = updateRating(NEW_RATING, [{ opponent: NEW_RATING, score: 1 }])
    const loss = updateRating(NEW_RATING, [{ opponent: NEW_RATING, score: 0 }])
    expect(win.rating).toBeGreaterThan(1500)
    expect(loss.rating).toBeLessThan(1500)
    expect(win.rd).toBeLessThan(350)
    const settled = { rating: 1500, rd: 60, vol: 0.06 }
    const small = updateRating(settled, [{ opponent: settled, score: 1 }])
    expect(small.rating - 1500).toBeLessThan(win.rating - 1500)
  })

  it('treats a draw between equals as no change in rating', () => {
    const draw = updateRating(NEW_RATING, [{ opponent: NEW_RATING, score: 0.5 }])
    expect(draw.rating).toBeCloseTo(1500, 5)
  })

  it('only grows the uncertainty when no games were played', () => {
    const idle = updateRating({ rating: 1600, rd: 80, vol: 0.06 }, [])
    expect(idle.rating).toBe(1600)
    expect(idle.rd).toBeGreaterThan(80)
  })
})
