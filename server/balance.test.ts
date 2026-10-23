import { describe, expect, it } from 'vitest'
import { duelResults, roundScores } from '../scripts/simulate'
import type { BotSkill } from '../src/game/modes/bots'

// The computer opponents stand in for players of each level, so a better bot must really score
// more and win more. The full tables are made by `npx tsx scripts/simulate.ts`.
const ORDER: BotSkill[] = ['novice', 'traveller', 'explorer', 'cartographer']
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

describe('bot skill levels', () => {
  it.each(['locate', 'capital', 'identify', 'category'] as const)(
    'earn more points on %s rounds the better they are',
    (kind) => {
      const averages = ORDER.map((skill) => mean(roundScores(skill, kind, 'World', 150)))
      for (let i = 1; i < averages.length; i++) {
        expect(averages[i], `${ORDER[i]} vs ${ORDER[i - 1]}`).toBeGreaterThan(averages[i - 1])
      }
    },
  )

  it('never score perfectly on Rare Earth, where rarity is the point', () => {
    const best = mean(roundScores('cartographer', 'category', 'World', 150))
    expect(best).toBeLessThan(900)
  })

  it('win duels in line with their skill', () => {
    expect(duelResults('cartographer', 'novice', 20).winRate).toBeGreaterThanOrEqual(0.9)
    expect(duelResults('explorer', 'traveller', 20).winRate).toBeGreaterThan(0.6)
    // Equal bots are an even contest, give or take draws and luck.
    const even = duelResults('explorer', 'explorer', 30).winRate
    expect(even).toBeGreaterThan(0.2)
    expect(even).toBeLessThan(0.8)
  })

  it('finish a duel within a reasonable number of rounds', () => {
    const { rounds } = duelResults('traveller', 'traveller', 10)
    expect(rounds).toBeGreaterThan(6)
    expect(rounds).toBeLessThan(25)
  })
})
