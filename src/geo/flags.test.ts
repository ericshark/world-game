import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createRandom } from '../game/core/random'
import { flagChoices, lookAlikes } from '../game/core/targets'
import { loadTestGeoData } from '../test/loadTestCountries'

describe('flags', () => {
  const geo = loadTestGeoData()

  it('has a flag file for every playable place', () => {
    const missing = geo.playableIds.filter(
      (id) => !existsSync(`public/flags/${geo.factsOf(id).iso2.toLowerCase()}.svg`),
    )
    expect(missing).toEqual([])
  })

  it('gives every place a different flag', () => {
    const codes = geo.playableIds.map((id) => geo.factsOf(id).iso2)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it.each([
    ['Kosovo', 'XK'],
    ['Taiwan', 'TW'],
    ['Palestine', 'PS'],
    ['Vatican City', 'VA'],
  ])('covers %s (%s)', (_name, iso2) => {
    const id = geo.playableIds.find((candidate) => geo.factsOf(candidate).iso2 === iso2)
    expect(id, `${iso2} is playable`).toBeDefined()
    expect(existsSync(`public/flags/${iso2.toLowerCase()}.svg`)).toBe(true)
  })

  it('ships the licence beside the flags', () => {
    expect(existsSync('public/flags/LICENSE')).toBe(true)
  })

  it('offers look-alike decoys: Chad is shown next to Romania', () => {
    const chad = geo.playableIds.find((id) => geo.factsOf(id).iso2 === 'TD')!
    const romania = geo.playableIds.find((id) => geo.factsOf(id).iso2 === 'RO')!
    expect(lookAlikes(geo, chad)).toContain(romania)
    for (let seed = 0; seed < 20; seed++) {
      expect(flagChoices(geo, chad, createRandom(`s${seed}`))).toContain(romania)
    }
  })

  it('offers four distinct options including the answer, for every country', () => {
    for (const id of geo.playableIds) {
      const choices = flagChoices(geo, id, createRandom(id))
      expect(choices).toHaveLength(4)
      expect(new Set(choices).size).toBe(4)
      expect(choices).toContain(id)
    }
  })
})
