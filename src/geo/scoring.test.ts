import { describe, expect, it } from 'vitest'
import { MAX_POINTS, scoreGuess } from './scoring'

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
