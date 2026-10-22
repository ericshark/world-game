import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import type { Challenge, Submission } from '../core/types'
import {
  battle,
  battleViewFor,
  BATTLE_HURRY_MS,
  BATTLE_REVEAL_MS,
  damageMultiplier,
  isWinner,
  standings,
  START_HP,
  START_LIVES,
  type BattleConfig,
  type BattlePlayer,
  type BattleState,
} from './battle'
import { botSubmission } from './bots'

const geo = loadTestGeoData()
const human = (id: string, team?: 'A' | 'B'): BattlePlayer => ({
  id,
  name: id,
  color: '#fff',
  team,
})

function start(config: BattleConfig, seed = 'battle'): BattleState {
  return battle.start({ config, seed, now: 0, geo, players: config.roster.map((p) => p.id) })
}

/** A perfect or a terrible answer to the current challenge. */
function answerFor(challenge: Challenge, good: boolean, at: number): Submission {
  if (challenge.kind === 'category') {
    const answerId = good ? challenge.category.valid[0] : 'XXX'
    return {
      answerId: good
        ? answerId
        : geo.playableIds.find(
            (id) =>
              !challenge.category.valid.includes(id) && !challenge.category.lenient.includes(id),
          )!,
      pin: [-150, -40],
      at,
    }
  }
  if (challenge.kind === 'identify') return { answerId: good ? challenge.countryId : 'NRU', at }
  const facts = geo.factsOf(challenge.countryId)
  return {
    pin: good ? (challenge.kind === 'capital' ? facts.capitals[0].at : facts.label) : [-150, -40],
    at,
  }
}

function playRound(state: BattleState, quality: Record<string, boolean>, at = 1000): BattleState {
  const challenge = state.rounds.challenges[state.rounds.round]
  for (const [id, good] of Object.entries(quality)) {
    state = battle.reduce(
      state,
      { type: 'submit', playerId: id, submission: answerFor(challenge, good, at) },
      geo,
    )
  }
  return state
}

function readyAll(state: BattleState, at = 2000): BattleState {
  for (const p of state.config.roster)
    state = battle.reduce(state, { type: 'ready', playerId: p.id, at }, geo)
  return state
}

describe('battle', () => {
  it('deals duel damage from the score difference, growing each round', () => {
    expect([0, 1, 2, 3, 4].map(damageMultiplier)).toEqual([1, 1, 1.5, 2, 2.5])
    let state = start({ format: 'duel', content: 'pinpoint', roster: [human('ana'), human('ben')] })
    state = playRound(state, { ana: true, ben: false })
    expect(state.reports[0].damage).toEqual({ ben: 1000 })
    expect(state.hp).toEqual({ ana: START_HP, ben: START_HP - 1000 })

    // Keep winning until Ben runs out of HP.
    while (!battle.isFinished(state)) state = playRound(readyAll(state), { ana: true, ben: false })
    expect(state.hp.ben).toBe(0)
    expect(isWinner(state, 'ana')).toBe(true)
    expect(battle.summarize(state, 'ana').metrics).toMatchObject({
      won: 1,
      flawless: 1,
      placement: 1,
    })
    expect(battle.summarize(state, 'ben').metrics).toMatchObject({ won: 0, placement: 2 })
  })

  it('hides other players’ answers until the reveal', () => {
    let state = start({
      format: 'party',
      content: 'pinpoint',
      roster: [human('ana'), human('ben')],
    })
    state = battle.reduce(
      state,
      { type: 'submit', playerId: 'ana', submission: { pin: [0, 0], at: 1 } },
      geo,
    )
    expect(battleViewFor(state, 'ben').rounds.submissions[0]).toEqual({})
    expect(battleViewFor(state, 'ana').rounds.submissions[0]).toHaveProperty('ana')
    // The first answer hurries everyone else.
    expect(state.rounds.deadline).toBe(1 + BATTLE_HURRY_MS)
  })

  it('does not reveal later rounds or the answers to an open Rare Earth round', () => {
    let state = start({ format: 'party', content: 'mixed', roster: [human('ana'), human('ben')] })
    expect(battleViewFor(state, 'ana').rounds.challenges).toHaveLength(1)
    while (state.rounds.challenges[state.rounds.round].kind !== 'category') {
      state = readyAll(playRound(state, { ana: true, ben: true }))
    }
    const open = battleViewFor(state, 'ana').rounds.challenges.at(-1)!
    expect(open.kind === 'category' && open.category.valid).toEqual([])
    const revealed = battleViewFor(
      playRound(state, { ana: true, ben: true }),
      'ana',
    ).rounds.challenges.at(-1)!
    expect(revealed.kind === 'category' && revealed.category.valid.length).toBeGreaterThan(0)
  })

  it('moves on after the reveal when everyone is ready, or when time is up', () => {
    let state = start({
      format: 'party',
      content: 'pinpoint',
      roster: [human('ana'), human('ben')],
    })
    state = playRound(state, { ana: true, ben: true })
    expect(battle.deadline(state)).toBe(1000 + BATTLE_REVEAL_MS)
    const one = battle.reduce(state, { type: 'ready', playerId: 'ana', at: 1500 }, geo)
    expect(one.rounds.phase).toBe('revealed')
    expect(readyAll(state).rounds.round).toBe(1)
    const timedOut = battle.reduce(state, { type: 'tick', at: 1000 + BATTLE_REVEAL_MS }, geo)
    expect(timedOut.rounds).toMatchObject({ round: 1, phase: 'open' })
  })

  it('knocks out the lowest scorer each round in survival', () => {
    let state = start({
      format: 'survival',
      content: 'pinpoint',
      roster: [human('ana'), human('ben'), human('cy')],
    })
    for (let i = 0; i < START_LIVES; i++) {
      state = playRound(state, { ana: true, ben: true, cy: false })
      if (i < START_LIVES - 1) state = readyAll(state)
    }
    expect(state.reports.at(-1)!.eliminated).toEqual(['cy'])
    expect(state.active).toEqual(['ana', 'ben'])
    // Everyone tying at the bottom does not knock everyone out.
    state = readyAll(state)
    for (let i = 0; i < 5 && !state.decided; i++)
      state = readyAll(playRound(state, { ana: false, ben: false }))
    expect(state.active.length).toBeGreaterThanOrEqual(1)
    expect(standings(state).at(-1)!.id).toBe('cy')
  })

  it('fights team against team with averaged scores', () => {
    const state = playRound(
      start({
        format: 'teams',
        content: 'pinpoint',
        roster: [human('a1', 'A'), human('a2', 'A'), human('b1', 'B'), human('b2', 'B')],
      }),
      { a1: true, a2: false, b1: false, b2: false },
    )
    expect(state.reports[0].damage).toEqual({ B: 500 })
  })

  it('splits a shared Rare Earth answer between the players who gave it', () => {
    let state = start({
      format: 'party',
      content: 'mixed',
      roster: [human('ana'), human('ben'), human('cy')],
    })
    while (state.rounds.challenges[state.rounds.round].kind !== 'category') {
      state = readyAll(playRound(state, { ana: true, ben: true, cy: true }))
    }
    const challenge = state.rounds.challenges[state.rounds.round]
    if (challenge.kind !== 'category') throw new Error('expected a category round')
    const [shared, solo] = challenge.category.valid
    const say = (id: string, answerId: string) =>
      (state = battle.reduce(
        state,
        {
          type: 'submit',
          playerId: id,
          submission: { answerId, pin: geo.factsOf(answerId).label, at: 5 },
        },
        geo,
      ))
    say('ana', shared)
    say('ben', shared)
    say('cy', solo)
    const results = state.rounds.results.at(-1)!
    const unshared = results.cy
    expect(results.ana.points).toBeLessThan(unshared.points + 1000)
    expect(state.reports.at(-1)!.points.ana).toBe(results.ana.points)
  })

  it('lets bots answer by themselves, deterministically', () => {
    const config: BattleConfig = {
      format: 'duel',
      content: 'mixed',
      roster: [human('me'), { id: 'bot', name: 'Bot', color: '#0f0', bot: 'explorer' }],
    }
    let state = start(config)
    const due = battle.deadline(state)!
    expect(due).toBeLessThan(25_000)
    state = battle.reduce(state, { type: 'tick', at: due }, geo)
    expect(state.rounds.submissions[0]).toHaveProperty('bot')
    // Humans cannot submit for a bot.
    expect(
      battle.reduce(
        state,
        { type: 'submit', playerId: 'bot', submission: { pin: [0, 0], at: due } },
        geo,
      ),
    ).toBe(state)
    // The same seed gives the same bot answer.
    const challenge = state.rounds.challenges[0]
    expect(botSubmission(geo, challenge, 'explorer', 'x', 0)).toEqual(
      botSubmission(geo, challenge, 'explorer', 'x', 0),
    )
  })

  it('makes bots hurry when someone answers first', () => {
    let state = start({
      format: 'duel',
      content: 'pinpoint',
      roster: [human('me'), { id: 'bot', name: 'Bot', color: '#0f0', bot: 'novice' }],
    })
    state = battle.reduce(
      state,
      { type: 'submit', playerId: 'me', submission: { pin: [0, 0], at: 500 } },
      geo,
    )
    state = battle.reduce(state, { type: 'tick', at: battle.deadline(state)! }, geo)
    expect(state.rounds.phase).toBe('revealed')
    expect(state.rounds.results[0].bot.kind).not.toBe('missed')
  })

  it('skilled bots find more countries than novices', () => {
    const hits = (skill: 'novice' | 'cartographer') =>
      geo.playableIds.slice(0, 60).filter((id) => {
        const { pin } = botSubmission(geo, { kind: 'locate', countryId: id }, skill, `s:${id}`, 0)
        return pin && geo.countries.countryAt(pin)?.properties.id === id
      }).length
    expect(hits('cartographer')).toBeGreaterThan(hits('novice') + 10)
  })
})
