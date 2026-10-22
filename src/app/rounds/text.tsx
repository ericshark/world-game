import type { GeoData } from '../../geo/facts'
import { explainAnswer, rarityTier } from '../../game/core/categories'
import type { Challenge, RoundResult } from '../../game/core/types'
import type { Units } from '../../game/profile/settings'
import { formatDistance } from '../../screens/format'
import { gradeOf } from '../../ui/grades'

/** The headline of a round's reveal. */
export function verdictOf(result: RoundResult, challenge: Challenge, geo: GeoData) {
  const nameOf = (id: string) => geo.nameOf(id)
  if (challenge.kind === 'category') {
    if (result.kind !== 'category') return <>Time ran out before you answered</>
    const name = nameOf(result.answerId)
    if (result.reused) {
      return (
        <>
          You already used <strong className="is-wrong">{name}</strong> this game
        </>
      )
    }
    if (!result.valid) {
      return (
        <span className="is-wrong-text">
          {explainAnswer(challenge.category, result.answerId, geo)}
        </span>
      )
    }
    const tier = rarityTier(result.rarity)
    return (
      <>
        <strong>{name}</strong> is {/^[AEIOU]/.test(tier) ? 'an' : 'a'} {tier.toLowerCase()} answer
      </>
    )
  }

  const target = nameOf(challenge.countryId)
  switch (result.kind) {
    case 'identify':
      if (result.verdict === 'correct') {
        return (
          <>
            Yes, it's <strong>{target}</strong>
          </>
        )
      }
      return (
        <>
          It's <strong>{target}</strong>
          {result.verdict === 'neighbor'
            ? `: ${nameOf(result.answerId)} is next door`
            : `, not ${nameOf(result.answerId)}`}
        </>
      )
    case 'capital':
      return result.hit ? (
        <>
          Bullseye: <strong>{result.capitalName}</strong>
        </>
      ) : (
        <>
          <strong>{result.capitalName}</strong> was here
        </>
      )
    case 'locate':
      if (result.hit) {
        return (
          <>
            You found <strong>{target}</strong>
          </>
        )
      }
      return (
        <>
          You clicked{' '}
          <strong className="is-wrong">
            {result.clickedId ? nameOf(result.clickedId) : 'the ocean'}
          </strong>
        </>
      )
    default:
      return (
        <>
          It was{' '}
          <strong>
            {challenge.kind === 'capital'
              ? geo.factsOf(challenge.countryId).capitals[0].name
              : target}
          </strong>
        </>
      )
  }
}

/** The line under the headline. */
export function detailOf(result: RoundResult, geo: GeoData, units: Units): string | null {
  switch (result.kind) {
    case 'missed':
      return 'Time ran out before you answered'
    case 'identify':
      return result.hintUsed && result.verdict === 'correct' ? 'Half points for the hint' : null
    case 'category': {
      if (!result.valid) return null
      const placed =
        result.distanceKm > 0
          ? `placed ${formatDistance(result.distanceKm, units)} off`
          : 'placed perfectly'
      return `${result.rarityPoints} for rarity · ${placed}`
    }
    case 'capital': {
      const where = result.clickedId ? `in ${geo.nameOf(result.clickedId)}` : 'in the ocean'
      return `${formatDistance(result.distanceKm, units)} away · your pin was ${where}`
    }
    case 'locate': {
      const from = `${formatDistance(result.distanceKm, units)} from ${geo.nameOf(result.targetId)}`
      if (!result.hit) return from
      return result.distanceKm > 0 ? `Close enough: ${from}` : null
    }
  }
}

/** A round in the results list. */
export function roundRow(challenge: Challenge, result: RoundResult, geo: GeoData, units: Units) {
  if (challenge.kind === 'category') {
    return {
      label: challenge.category.prompt.replace(/^Name /, ''),
      detail:
        result.kind === 'category'
          ? `${geo.nameOf(result.answerId)} · ${gradeOf(result).label}`
          : "Time's up",
    }
  }
  const name = geo.nameOf(challenge.countryId)
  const label =
    challenge.kind === 'capital'
      ? `${geo.factsOf(challenge.countryId).capitals[0].name}, ${name}`
      : name
  const detail =
    (result.kind === 'locate' || result.kind === 'capital') && !result.hit
      ? formatDistance(result.distanceKm, units)
      : gradeOf(result).label
  return { label, detail }
}
