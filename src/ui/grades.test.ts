import { describe, expect, it } from 'vitest'
import type { LocateResult } from '../game/core/types'
import { gradeOf } from './grades'

const locate = (points: number, hit = false): LocateResult => ({
  kind: 'locate',
  targetId: 'PER',
  guess: [0, 0],
  clickedId: null,
  distanceKm: 1,
  nearest: [0, 0],
  points,
  hit,
})

describe('gradeOf', () => {
  it('grades pins by points', () => {
    expect(gradeOf(locate(1000, true)).label).toBe('Perfect')
    expect(gradeOf(locate(950)).label).toBe('Excellent')
    expect(gradeOf(locate(700)).label).toBe('Great')
    expect(gradeOf(locate(400)).label).toBe('Good')
    expect(gradeOf(locate(100)).label).toBe('Close')
    expect(gradeOf(locate(0)).tone).toBe('miss')
  })

  it('grades names and timeouts', () => {
    const named = {
      kind: 'identify',
      targetId: 'PER',
      answerId: 'BOL',
      hintUsed: false,
      hit: false,
    } as const
    expect(gradeOf({ ...named, verdict: 'neighbor', points: 200 }).label).toBe('Next door')
    expect(gradeOf({ kind: 'missed', targetId: 'PER', points: 0, hit: false }).label).toBe(
      "Time's up",
    )
  })
})
