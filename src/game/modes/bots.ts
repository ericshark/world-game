import { destinationPoint } from '../../geo/distance'
import type { GeoData } from '../../geo/facts'
import { fitsCategory } from '../core/categories'
import { createRandom, randomInt, type Random } from '../core/random'
import type { Challenge, Submission } from '../core/types'

export type BotSkill = 'novice' | 'traveller' | 'explorer' | 'cartographer'

interface SkillProfile {
  /** Chance of knowing a country exactly, before its difficulty is taken into account. */
  knows: number
  /** Typical miss distance when it does not. */
  missKm: number
  /** Chance of a valid Rare Earth answer, and how adventurous its answers are (0–1). */
  recall: number
  daring: number
  /** How long it takes to answer. */
  thinkMs: [number, number]
}

export const BOT_SKILLS: Record<BotSkill, SkillProfile> = {
  novice: { knows: 0.35, missKm: 1400, recall: 0.65, daring: 0.1, thinkMs: [9_000, 20_000] },
  traveller: { knows: 0.6, missKm: 700, recall: 0.8, daring: 0.35, thinkMs: [7_000, 16_000] },
  explorer: { knows: 0.8, missKm: 350, recall: 0.9, daring: 0.6, thinkMs: [5_000, 12_000] },
  cartographer: { knows: 0.95, missKm: 150, recall: 0.97, daring: 0.85, thinkMs: [3_000, 9_000] },
}

/**
 * A computer opponent's answer, as if it were a person: right more often on famous countries,
 * near misses otherwise, and a human-ish thinking time. Seeded per round and bot, so a replay
 * (or a server) produces the same answers.
 */
export function botSubmission(
  geo: GeoData,
  challenge: Challenge,
  skill: BotSkill,
  seed: string,
  openedAt: number,
): Submission {
  const random = createRandom(seed)
  const profile = BOT_SKILLS[skill]
  const at = thinkingTime(profile, random, openedAt)

  switch (challenge.kind) {
    case 'locate':
      return {
        pin: guessNear(
          geo,
          geo.factsOf(challenge.countryId).label,
          challenge.countryId,
          profile,
          random,
        ),
        at,
      }
    case 'capital':
      return {
        pin: guessNear(
          geo,
          geo.factsOf(challenge.countryId).capitals[0].at,
          challenge.countryId,
          profile,
          random,
          0.4,
        ),
        at,
      }
    case 'identify': {
      const knows = random() < profile.knows * (1 - 0.5 * geo.difficulty(challenge.countryId))
      if (knows) return { answerId: challenge.countryId, at }
      const neighbors = geo.factsOf(challenge.countryId).neighbors
      const pool = neighbors.length > 0 && random() < 0.6 ? neighbors : geo.playableIds
      return { answerId: pool[randomInt(random, pool.length)], at }
    }
    case 'category': {
      const { category } = challenge
      const answerId =
        random() < profile.recall
          ? pickAnswer(geo, [...category.valid, ...category.lenient], profile.daring, random)
          : pickWrong(geo, (id) => !fitsCategory(category, id), random)
      return {
        answerId,
        pin: guessNear(geo, geo.factsOf(answerId).label, answerId, profile, random),
        at,
      }
    }
  }
}

/** When a bot answers. Its first random draw, so it can be known without the geography. */
export function botAnswerTime(skill: BotSkill, seed: string, openedAt: number): number {
  return thinkingTime(BOT_SKILLS[skill], createRandom(seed), openedAt)
}

function thinkingTime(profile: SkillProfile, random: Random, openedAt: number): number {
  const [fastest, slowest] = profile.thinkMs
  return openedAt + fastest + random() * (slowest - fastest)
}

/** A pin on the target, or off it by a skill- and difficulty-scaled distance. */
function guessNear(
  geo: GeoData,
  target: [number, number],
  countryId: string,
  profile: SkillProfile,
  random: Random,
  scale = 1,
): [number, number] {
  const difficulty = geo.difficulty(countryId)
  if (random() < profile.knows * (1 - 0.6 * difficulty)) {
    return destinationPoint(target, random() * 360, random() * 15)
  }
  // Exponentially distributed misses: mostly near, occasionally wild.
  const distance = -Math.log(1 - random()) * profile.missKm * scale * (0.5 + difficulty)
  return destinationPoint(target, random() * 360, distance)
}

/** Daring bots reach past the obvious answers for rarer ones. */
function pickAnswer(geo: GeoData, answers: string[], daring: number, random: Random): string {
  const weights = answers.map((id) => (0.05 + geo.familiarity(id)) ** (3 - 4 * daring))
  let roll = random() * weights.reduce((sum, w) => sum + w, 0)
  for (let i = 0; i < answers.length; i++) {
    roll -= weights[i]
    if (roll < 0) return answers[i]
  }
  return answers[answers.length - 1]
}

function pickWrong(geo: GeoData, wrong: (id: string) => boolean, random: Random): string {
  const pool = geo.playableIds.filter(wrong)
  return pool[randomInt(random, pool.length)]
}
