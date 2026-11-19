import { geoContains } from 'd3-geo'
import { describe, expect, it } from 'vitest'
import { loadTestSubdivisionPack } from '../test/loadTestCountries'
import {
  isSubPackId,
  parseSubPlaceKey,
  SUB_PACK_IDS,
  SUB_PACKS,
  subPackMeta,
  subPlaceKey,
} from './subdivisions'

describe('subdivision packs', () => {
  it('lists all eight first packs with expected counts and unique ids', () => {
    expect(SUB_PACK_IDS).toEqual(['USA', 'CAN', 'MEX', 'BRA', 'AUS', 'IND', 'CHN', 'DEU'])
    for (const id of SUB_PACK_IDS) {
      expect(isSubPackId(id)).toBe(true)
      const meta = subPackMeta(id)
      const pack = loadTestSubdivisionPack(id)
      expect(pack.countryId).toBe(id)
      expect(pack.playableIds).toHaveLength(meta.count)
      expect(pack.zeroPointsKm).toBeGreaterThanOrEqual(350)
      expect(pack.zeroPointsKm).toBeLessThanOrEqual(1200)
      expect(pack.borders.length).toBeGreaterThan(0)

      for (const unitId of pack.playableIds) {
        const feature = pack.feature(unitId)
        const facts = pack.factsOf(unitId)
        expect(feature.properties.name.length).toBeGreaterThan(0)
        expect(facts.areaKm2).toBeGreaterThan(0)
        expect(geoContains(feature, facts.label)).toBe(true)
        expect(pack.countries.countryAt(facts.label)?.properties.id).toBe(unitId)
        expect(pack.difficulty(unitId)).toBeGreaterThanOrEqual(0)
        expect(pack.difficulty(unitId)).toBeLessThanOrEqual(1)
      }
    }
    expect(SUB_PACKS).toHaveLength(8)
    expect(isSubPackId('FRA')).toBe(false)
  })

  it('scales zeroPointsKm with country size and matches names and aliases', () => {
    const usa = loadTestSubdivisionPack('USA')
    const deu = loadTestSubdivisionPack('DEU')
    expect(usa.zeroPointsKm).toBeGreaterThan(deu.zeroPointsKm * 2)

    expect(usa.names.match('California')).toEqual({ kind: 'match', id: 'US-CA' })
    expect(usa.names.match('District of Columbia')).toEqual({ kind: 'match', id: 'US-DC' })
    expect(deu.names.match('Bavaria')).toEqual({ kind: 'match', id: 'DE-BY' })
    expect(deu.names.match('Bayern')).toEqual({ kind: 'match', id: 'DE-BY' })
    expect(deu.names.match('Bremen')).toEqual({ kind: 'match', id: 'DE-HB' })
  })

  it('round-trips subdivision place keys', () => {
    const key = subPlaceKey('USA', 'US-CA')
    expect(key).toBe('sub:usa:us-ca')
    expect(parseSubPlaceKey(key)).toEqual({ packId: 'USA', unitId: 'US-CA' })
    expect(parseSubPlaceKey('city:aus-sydney')).toBeNull()
    expect(parseSubPlaceKey('sub:fra:fr-75')).toBeNull()
  })
})
