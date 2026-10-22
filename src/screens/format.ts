import type { Units } from '../game/profile/settings'

const numberFormat = new Intl.NumberFormat('en-US')
const compactFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const KM_PER_MILE = 1.609344

export function formatNumber(value: number): string {
  return numberFormat.format(Math.round(value))
}

export function formatDistance(km: number, units: Units = 'km'): string {
  return units === 'mi' ? `${formatNumber(km / KM_PER_MILE)} mi` : `${formatNumber(km)} km`
}

/** Areas are always shown in the player's units, squared. */
export function formatArea(km2: number, units: Units = 'km'): string {
  const value = units === 'mi' ? km2 / KM_PER_MILE ** 2 : km2
  const text =
    value < 10 ? value.toFixed(1) : value < 1e6 ? formatNumber(value) : compactFormat.format(value)
  return `${text} ${units === 'mi' ? 'mi²' : 'km²'}`
}

/** "32.5 million", "825". */
export function formatPopulation(people: number): string {
  if (people < 1e6) return formatNumber(people)
  const millions = people / 1e6
  if (millions < 1000)
    return `${millions < 10 ? millions.toFixed(1) : formatNumber(millions)} million`
  return `${(millions / 1000).toFixed(2)} billion`
}
