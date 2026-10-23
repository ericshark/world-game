import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { dailyShareText } from '../profile/share'
import { LOCAL_PLAYER, type Submission } from '../core/types'
import { daily, dailyChallenges, dailySeed, dailyTwist, type DailyState } from './daily'

const geo = loadTestGeoData()

describe('daily five', () => {
  it('is the same puzzle for everyone on a date, and different the next day', () => {
    const today = dailyChallenges(geo, '2026-10-21')
    expect(dailyChallenges(geo, '2026-10-21')).toEqual(today)
    expect(dailyChallenges(geo, '2026-10-22')).not.toEqual(today)
    expect(today.map((c) => c.kind)).toEqual([
      'locate',
      'identify',
      'category',
      'capital',
      'locate',
    ])
  })

  // A golden puzzle: if this changes, published dailies changed. Bump GENERATOR_VERSION.
  it('keeps published puzzles stable', () => {
    const ids = dailyChallenges(geo, '2026-10-21').map((c) =>
      c.kind === 'category' ? c.category.id : c.countryId,
    )
    expect(ids).toMatchSnapshot()
  })

  it('gets harder towards the end, with weekly twists', () => {
    for (const day of ['2026-10-19', '2026-10-20', '2026-10-21']) {
      const [first, , , , last] = dailyChallenges(geo, day)
      if (first.kind !== 'locate' || last.kind !== 'locate') throw new Error('shape')
      expect(geo.difficultyTier(first.countryId)).toBeLessThan(geo.difficultyTier(last.countryId))
    }
    expect(dailyTwist('2026-10-24')).toBe('night') // a Saturday
    expect(dailyTwist('2026-10-25')).toBe('micro')
    const sunday = dailyChallenges(geo, '2026-10-25')[4]
    expect(sunday.kind === 'locate' && geo.feature(sunday.countryId).properties.isMicro).toBe(true)
  })

  it('plays through to a summary out of 5,000 with a tone per round', () => {
    let state: DailyState = daily.start({
      config: { dateKey: '2026-10-21' },
      seed: dailySeed('2026-10-21', 'five'),
      now: 0,
      geo,
      players: [LOCAL_PLAYER],
    })
    for (let round = 0; round < 5; round++) {
      const challenge = state.rounds.challenges[round]
      let submission: Submission
      if (challenge.kind === 'identify') submission = { answerId: challenge.countryId, at: 1 }
      else if (challenge.kind === 'category') {
        const answerId = challenge.category.valid[0]
        submission = { answerId, pin: geo.factsOf(answerId).label, at: 1 }
      } else if (challenge.kind === 'capital') {
        submission = { pin: geo.factsOf(challenge.countryId).capitals[0].at, at: 1 }
      } else submission = { pin: geo.factsOf(challenge.countryId).label, at: 1 }
      state = daily.reduce(state, { type: 'submit', playerId: LOCAL_PLAYER, submission }, geo)
      state = daily.reduce(state, { type: 'next', at: 2 }, geo)
    }
    const summary = daily.summarize(state, LOCAL_PLAYER)
    expect(summary).toMatchObject({ mode: 'daily', bestKey: 'daily:five', maxScore: 5000 })
    expect(summary.score).toBeGreaterThan(4000)
    expect(summary.metrics).toMatchObject({ tone0: 4, tone1: 4, tone3: 4, tone4: 4 })
  })

  it('is decided by the seed it is given', () => {
    const start = (seed: string) =>
      daily.start({ config: { dateKey: '2026-10-21' }, seed, now: 0, geo, players: [LOCAL_PLAYER] })
    expect(start('secret-a').rounds.challenges).toEqual(start('secret-a').rounds.challenges)
    expect(start('secret-a').rounds.challenges).not.toEqual(start('secret-b').rounds.challenges)
    expect(start('secret-a').seed).toBe('secret-a')
  })

  it('shows a player only what they may know', () => {
    let state = daily.start({
      config: { dateKey: '2026-10-21' },
      seed: 'secret',
      now: 0,
      geo,
      players: [LOCAL_PLAYER],
    })
    const view = (s: DailyState) => daily.viewFor!(s, LOCAL_PLAYER)
    const known = (s: DailyState) =>
      view(s).rounds.challenges.map((c) => (c.kind === 'category' ? c.category.id : c.countryId))

    // The seed never leaves the server, and only the current round is shown.
    expect(view(state).seed).toBe('')
    const first = state.rounds.challenges[0]
    expect(known(state)[0]).toBe(first.kind === 'category' ? first.category.id : first.countryId)
    expect(
      known(state)
        .slice(1)
        .every((id) => id === ''),
    ).toBe(true)

    // Once the first round is over, the next stays hidden until the player moves on.
    const pin = geo.factsOf(first.kind === 'category' ? 'FRA' : first.countryId).label
    state = daily.reduce(
      state,
      { type: 'submit', playerId: LOCAL_PLAYER, submission: { pin, at: 1 } },
      geo,
    )
    expect(state.rounds.phase).toBe('revealed')
    expect(
      known(state)
        .slice(1)
        .every((id) => id === ''),
    ).toBe(true)
    state = daily.reduce(state, { type: 'next', at: 2 }, geo)
    expect(known(state)[1]).not.toBe('')
    expect(
      known(state)
        .slice(2)
        .every((id) => id === ''),
    ).toBe(true)
  })

  it('hides the open category’s accepted answers until it is revealed', () => {
    let state = daily.start({
      config: { dateKey: '2026-10-21' },
      seed: 'secret',
      now: 0,
      geo,
      players: [LOCAL_PLAYER],
    })
    // Skip to the category round (the third).
    for (let round = 0; round < 2; round++) {
      const challenge = state.rounds.challenges[round]
      const submission: Submission =
        challenge.kind === 'identify'
          ? { answerId: challenge.countryId, at: 1 }
          : { pin: geo.factsOf((challenge as { countryId: string }).countryId).label, at: 1 }
      state = daily.reduce(state, { type: 'submit', playerId: LOCAL_PLAYER, submission }, geo)
      state = daily.reduce(state, { type: 'next', at: 2 }, geo)
    }
    const open = daily.viewFor!(state, LOCAL_PLAYER).rounds.challenges[2]
    if (open.kind !== 'category') throw new Error('expected the category round')
    expect(open.category.prompt).not.toBe('')
    expect(open.category.valid).toEqual([])
    expect(open.category.lenient).toEqual([])

    const answerId = (state.rounds.challenges[2] as { category: { valid: string[] } }).category
      .valid[0]
    state = daily.reduce(
      state,
      {
        type: 'submit',
        playerId: LOCAL_PLAYER,
        submission: { answerId, pin: geo.factsOf(answerId).label, at: 3 },
      },
      geo,
    )
    const revealed = daily.viewFor!(state, LOCAL_PLAYER).rounds.challenges[2]
    if (revealed.kind !== 'category') throw new Error('expected the category round')
    expect(revealed.category.valid.length).toBeGreaterThan(0)
  })

  it('shares results without spoilers', () => {
    const text = dailyShareText(
      '2026-10-21',
      {
        five: { score: 4215, tones: ['perfect', 'good', 'great', 'close', 'miss'] },
        mystery: { score: 600, guesses: 5, solved: true },
        route: { score: 850, stars: 2 },
      },
      3,
      'https://example.test/#/daily',
    )
    expect(text).toBe(
      [
        'World Game Daily #21',
        'Daily Five 4,215/5,000',
        '📍🟩 🔎🟨 💎🟩 🏙️🟧 📍🟥',
        '🕵️ Mystery country in 5 guesses',
        '🧭 Route ★★☆',
        '🔥 3-day streak',
        'https://example.test/#/daily',
      ].join('\n'),
    )
  })
})
