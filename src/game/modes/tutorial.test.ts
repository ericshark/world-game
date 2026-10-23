import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { LOCAL_PLAYER } from '../core/types'
import { TUTORIAL_TARGETS, tutorial } from './tutorial'

const geo = loadTestGeoData()

describe('tutorial', () => {
  it('plays the same three untimed rounds and summarises them apart from Pinpoint', () => {
    let state = tutorial.start({ config: {}, seed: 's', now: 0, geo, players: [LOCAL_PLAYER] })
    expect(state.rounds.challenges.map((c) => c.countryId)).toEqual(TUTORIAL_TARGETS)
    expect(tutorial.deadline(state)).toBeNull()

    for (const [index, id] of TUTORIAL_TARGETS.entries()) {
      const pin = geo.factsOf(id).label
      state = tutorial.reduce(
        state,
        { type: 'submit', playerId: LOCAL_PLAYER, submission: { pin, at: index * 10 + 1 } },
        geo,
      )
      state = tutorial.reduce(state, { type: 'next', at: index * 10 + 2 }, geo)
    }
    expect(tutorial.isFinished(state)).toBe(true)
    const summary = tutorial.summarize(state, LOCAL_PLAYER)
    expect(summary).toMatchObject({ bestKey: 'tutorial', score: 3000, maxScore: 3000 })
    expect(summary.outcomes.map((o) => o.countryId)).toEqual(TUTORIAL_TARGETS)
  })
})
