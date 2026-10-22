import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../test/loadTestCountries'
import { editDistance, normalizeName } from './names'

const { names } = loadTestGeoData()

describe('normalizeName', () => {
  it('ignores case, accents, punctuation and a leading "the"', () => {
    expect(normalizeName('  Côte d’Ivoire ')).toBe('cote divoire')
    expect(normalizeName('The Gambia')).toBe('gambia')
    expect(normalizeName('Bosnia & Herzegovina')).toBe('bosnia and herzegovina')
    expect(normalizeName('St. Lucia')).toBe('saint lucia')
    expect(normalizeName('Guinea-Bissau')).toBe('guinea bissau')
  })
})

describe('NameMatcher.match', () => {
  it.each([
    ['peru', 'PER'],
    ['Ivory Coast', 'CIV'],
    ["cote d'ivoire", 'CIV'],
    ['Burma', 'MMR'],
    ['DRC', 'COD'],
    ['Congo-Brazzaville', 'COG'],
    ['UK', 'GBR'],
    ['England', 'GBR'],
    ['USA', 'USA'],
    ['united states of america', 'USA'],
    ['Czech Republic', 'CZE'],
    ['Swaziland', 'SWZ'],
    ['Holy See', 'VAT'],
    ['East Timor', 'TLS'],
    ['St Kitts and Nevis', 'KNA'],
    ['Sao Tome and Principe', 'STP'],
    ['Türkiye', 'TUR'],
    ['Niger', 'NER'],
    ['Nigeria', 'NGA'],
    ['Dominica', 'DMA'],
    ['Dominican Republic', 'DOM'],
    ['Sudan', 'SDN'],
    ['South Sudan', 'SDS'],
    ['Guinea', 'GIN'],
  ])('%s → %s', (input, id) => {
    expect(names.match(input)).toEqual({ kind: 'match', id })
  })

  it('forgives small typos in longer names', () => {
    expect(names.match('Kazakstan')).toEqual({ kind: 'match', id: 'KAZ' })
    expect(names.match('Phillipines')).toEqual({ kind: 'match', id: 'PHL' })
    expect(names.match('Lichtenstein')).toEqual({ kind: 'match', id: 'LIE' })
    expect(names.match('Mozambqiue')).toEqual({ kind: 'match', id: 'MOZ' })
  })

  it('does not guess short names', () => {
    expect(names.match('Bali').kind).toBe('none')
    expect(names.match('Malu').kind).toBe('none')
  })

  it('asks when a name fits several countries', () => {
    expect(names.match('Congo')).toEqual({ kind: 'ambiguous', ids: ['COG', 'COD'] })
    expect(names.match('Korea')).toEqual({ kind: 'ambiguous', ids: ['KOR', 'PRK'] })
    // One letter from both Niger and Nigeria.
    expect(names.match('Nigera')).toEqual({ kind: 'ambiguous', ids: ['NER', 'NGA'] })
  })

  it('rejects unknown and empty input', () => {
    expect(names.match('Atlantis')).toEqual({ kind: 'none' })
    expect(names.match('  ')).toEqual({ kind: 'none' })
    // Not a playable country.
    expect(names.match('Greenland')).toEqual({ kind: 'none' })
  })
})

describe('NameMatcher.suggest', () => {
  it('offers countries whose name or a word in it starts with the input', () => {
    expect(names.suggest('ger')).toEqual(['DEU'])
    expect(names.suggest('kor')).toEqual(expect.arrayContaining(['KOR', 'PRK']))
    expect(names.suggest('guinea')).toEqual(expect.arrayContaining(['GIN', 'GNB', 'GNQ', 'PNG']))
  })

  it('puts matching official names before alias matches', () => {
    expect(names.suggest('ic')[0]).toBe('ISL')
  })

  it('limits the list and returns nothing for empty input', () => {
    expect(names.suggest('s', 5)).toHaveLength(5)
    expect(names.suggest('')).toEqual([])
  })
})

describe('editDistance', () => {
  it('counts insertions, deletions, substitutions and swaps', () => {
    expect(editDistance('peru', 'peru')).toBe(0)
    expect(editDistance('peru', 'pero')).toBe(1)
    expect(editDistance('peru', 'epru')).toBe(1)
    expect(editDistance('peru', 'per')).toBe(1)
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })

  it('stops at the limit', () => {
    expect(editDistance('abcdef', 'uvwxyz', 2)).toBe(2)
  })
})
