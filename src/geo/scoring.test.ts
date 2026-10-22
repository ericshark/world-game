import { describe, expect, it } from 'vitest'
import { MAX_POINTS, scoreCapitalGuess, scoreGuess } from './scoring'

const normal = { isMicro: false }
const micro = { isMicro: true }

describe('scoreGuess', () => {
  it('gives full points inside the country', () => {
    expect(scoreGuess(0, normal, 'World')).toEqual({ points: MAX_POINTS, hit: true })
  })

  it('decays with distance on the World map', () => {
    expect(scoreGuess(100, normal, 'World').points).toBe(935)
    expect(scoreGuess(500, normal, 'World').points).toBe(688)
    expect(scoreGuess(1000, normal, 'World').points).toBe(406)
    expect(scoreGuess(2000, normal, 'World').points).toBe(0)
    expect(scoreGuess(5000, normal, 'World').points).toBe(0)
  })

  it('is stricter in Europe', () => {
    expect(scoreGuess(500, normal, 'Europe').points).toBeLessThan(
      scoreGuess(500, normal, 'World').points,
    )
    expect(scoreGuess(1000, normal, 'Europe').points).toBe(0)
  })

  it('counts clicks near a micro-state as hits', () => {
    expect(scoreGuess(25, micro, 'World')).toEqual({ points: MAX_POINTS, hit: true })
    expect(scoreGuess(35, micro, 'World').hit).toBe(false)
  })

  it('does not give the micro-state radius to normal countries', () => {
    const score = scoreGuess(25, normal, 'World')
    expect(score.hit).toBe(false)
    expect(score.points).toBeLessThan(MAX_POINTS)
  })
})

describe('scoring difficulty', () => {
  it('is more forgiving on easy and stricter on hard', () => {
    const normalPoints = scoreGuess(800, normal, 'World').points
    expect(scoreGuess(800, normal, 'World', 1.4).points).toBeGreaterThan(normalPoints)
    expect(scoreGuess(800, normal, 'World', 0.75).points).toBeLessThan(normalPoints)
  })
})

describe('scoreCapitalGuess', () => {
  it('counts pins within 25 km as on the capital', () => {
    expect(scoreCapitalGuess(20, 'World')).toEqual({ points: MAX_POINTS, hit: true })
    expect(scoreCapitalGuess(30, 'World').hit).toBe(false)
  })

  it('decays smoothly from the hit radius to zero', () => {
    expect(scoreCapitalGuess(26, 'World').points).toBeGreaterThan(990)
    expect(scoreCapitalGuess(300, 'World').points).toBeGreaterThan(
      scoreCapitalGuess(600, 'World').points,
    )
    expect(scoreCapitalGuess(1025, 'World').points).toBe(0)
    expect(scoreCapitalGuess(400, 'Europe').points).toBeLessThan(
      scoreCapitalGuess(400, 'World').points,
    )
  })
})
