import type { CountryFacts } from './facts'

/** 1 = household names (Brazil, Japan) … 5 = deep cuts (Tuvalu, Comoros). */
export type DifficultyTier = 1 | 2 | 3 | 4 | 5

// Share of countries at or below each tier, from easiest to hardest.
const TIER_CUMULATIVE_SHARE = [0.15, 0.35, 0.6, 0.8, 1]

/**
 * How likely a typical player is to know a country, from 0 (obscure) to 1 (famous).
 * A blend of Natural Earth's cartographic prominence, population, economy and size, nudged by
 * curated adjustments for places that are famous despite being small (Vatican City, Jamaica).
 * It drives difficulty tiers and Rare Earth rarity, so it only needs to rank countries sensibly.
 */
export function familiarityScore(facts: CountryFacts): number {
  const prominence = (6 - clamp(facts.labelRank, 2, 6)) / 4
  const population = scale(Math.log10(Math.max(facts.population, 1)), 4, 9.2)
  const economy = scale(Math.log10(Math.max(facts.gdpMd, 1)), 2, 7.4)
  const size = scale(Math.log10(Math.max(facts.areaKm2, 0.1)), 0, 7.2)
  const blended = 0.35 * prominence + 0.25 * population + 0.25 * economy + 0.15 * size
  return clamp(blended + 0.1 * facts.familiarityAdjust, 0, 1)
}

/**
 * Ranks countries from easiest to hardest to find and splits them into tiers. Small countries
 * are harder to click as well as less familiar, so size counts twice.
 */
export function difficultyTiers(
  countries: { id: string; familiarity: number; areaKm2: number }[],
): Map<string, DifficultyTier> {
  const ranked = countries
    .map(({ id, familiarity, areaKm2 }) => {
      const smallness = 1 - scale(Math.log10(Math.max(areaKm2, 0.1)), 0, 7.2)
      return { id, difficulty: 0.75 * (1 - familiarity) + 0.25 * smallness }
    })
    .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id))

  const tiers = new Map<string, DifficultyTier>()
  ranked.forEach(({ id }, index) => {
    const share = (index + 1) / ranked.length
    const tier = TIER_CUMULATIVE_SHARE.findIndex((limit) => share <= limit) + 1
    tiers.set(id, tier as DifficultyTier)
  })
  return tiers
}

function scale(value: number, min: number, max: number): number {
  return clamp((value - min) / (max - min), 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
