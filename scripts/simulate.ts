// Plays the computer opponents against the rules to see how the game's numbers behave.
//   npx tsx scripts/simulate.ts [rounds-per-cell] [duels-per-pair]
// Prints the score each skill level earns on each kind of round, and how often each level
// beats each other in a duel. The tables go in docs/balance.md.
import { loadServerGeo } from '../server/index'
import { evaluateChallenge } from '../src/game/core/evaluate'
import { createRandom, shuffled } from '../src/game/core/random'
import type { Challenge } from '../src/game/core/types'
import { battle, type BattlePlayer, type BattleState } from '../src/game/modes/battle'
import { botSubmission, BOT_SKILLS, type BotSkill } from '../src/game/modes/bots'
import { pickCategories } from '../src/game/modes/rareEarth'
import type { ScoringRegion } from '../src/geo/scoring'

const [roundsArg = '300', duelsArg = '40'] = process.argv.slice(2)
const ROUNDS = Number(roundsArg)
const DUELS = Number(duelsArg)
const SKILLS = Object.keys(BOT_SKILLS) as BotSkill[]
const geo = loadServerGeo()

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

export function roundScores(
  skill: BotSkill,
  kind: Exclude<Challenge['kind'], 'city'>,
  region: ScoringRegion,
  count: number,
): number[] {
  const random = createRandom(`sim:${skill}:${kind}:${region}`)
  const pool = geo.playableIds.filter(
    (id) =>
      !geo.feature(id).properties.isMicro &&
      (region === 'World' || geo.feature(id).properties.region === region),
  )
  const scores: number[] = []
  const ids = shuffled(pool, random)
  for (let i = 0; i < count; i++) {
    const countryId = ids[i % ids.length]
    const challenge: Challenge =
      kind === 'category'
        ? { kind: 'category', category: pickCategories(geo, 1, random)[0] }
        : kind === 'identify'
          ? { kind, countryId, choices: null }
          : { kind, countryId }
    const submission = botSubmission(geo, challenge, skill, `sim-${skill}-${i}`, 0)
    const result = evaluateChallenge(geo, challenge, submission, {
      region,
      cutoffScale: 1,
      usedAnswers: [],
    })
    scores.push(result.points)
  }
  return scores
}

function playDuel(first: BotSkill, second: BotSkill, seed: string) {
  const roster: BattlePlayer[] = [
    { id: 'a', name: 'A', color: '#ff0000', bot: first },
    { id: 'b', name: 'B', color: '#0000ff', bot: second },
  ]
  let state: BattleState = battle.start({
    config: { format: 'duel', content: 'mixed', roster },
    seed,
    now: 0,
    geo,
    players: [],
  })
  for (let step = 0; step < 2000 && !battle.isFinished(state); step++) {
    const due = battle.deadline(state)
    if (due === null) break
    state = battle.reduce(state, { type: 'tick', at: due }, geo)
  }
  const winner = battle.isFinished(state)
    ? state.hp.a === state.hp.b
      ? 'draw'
      : state.hp.a > state.hp.b
        ? 'a'
        : 'b'
    : 'unfinished'
  return { winner, rounds: state.reports.length }
}

export function duelResults(first: BotSkill, second: BotSkill, count: number) {
  let wins = 0
  let draws = 0
  const lengths: number[] = []
  for (let i = 0; i < count; i++) {
    const { winner, rounds } = playDuel(first, second, `duel-${first}-${second}-${i}`)
    if (winner === 'a') wins++
    if (winner === 'draw') draws++
    lengths.push(rounds)
  }
  return { winRate: wins / count, draws, rounds: mean(lengths) }
}

if (process.argv[1]?.endsWith('simulate.ts')) {
  console.log(
    `\nPoints per round (median / mean), ${ROUNDS} rounds each, countries without micro-states`,
  )
  for (const region of ['World', 'Europe', 'Africa'] as ScoringRegion[]) {
    console.log(`\n${region}`)
    console.log(
      ['skill', 'find', 'capital', 'name it', 'rare earth'].map((h) => h.padEnd(14)).join(''),
    )
    for (const skill of SKILLS) {
      const cells = (['locate', 'capital', 'identify', 'category'] as const).map((kind) => {
        const scores = roundScores(skill, kind, region, ROUNDS)
        return `${median(scores)} / ${Math.round(mean(scores))}`.padEnd(14)
      })
      console.log(skill.padEnd(14) + cells.join(''))
    }
  }
  console.log(`\nDuels, ${DUELS} per pair: first skill's win rate (rounds per game)`)
  console.log(['', ...SKILLS].map((h) => h.padEnd(14)).join(''))
  for (const first of SKILLS) {
    const cells = SKILLS.map((second) => {
      const { winRate, rounds } = duelResults(first, second, DUELS)
      return `${Math.round(winRate * 100)}% (${rounds.toFixed(1)})`.padEnd(14)
    })
    console.log(first.padEnd(14) + cells.join(''))
  }
}
