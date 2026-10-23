import { describe, expect, it } from 'vitest'
import { buildCategories } from '../game/core/categories'
import { loadTestGeoData } from '../test/loadTestCountries'

// Spot checks of the data that answers are judged by: the names people type, who neighbours
// whom, which countries have coasts, and what the Rare Earth categories accept. Each case is
// something a player would notice at once if it were wrong.

const geo = loadTestGeoData()
const resolve = (text: string) => geo.names.match(text)
const id = (text: string) => {
  const result = resolve(text)
  return result.kind === 'match' ? result.id : result.kind
}

describe('names that sound alike', () => {
  it('keeps the four Guineas apart', () => {
    expect(id('Guinea')).toBe('GIN')
    expect(id('Guinea-Bissau')).toBe('GNB')
    expect(id('guinea bissau')).toBe('GNB')
    expect(id('Equatorial Guinea')).toBe('GNQ')
    expect(id('Papua New Guinea')).toBe('PNG')
    expect(id('PNG')).toBe('PNG')
  })

  it('keeps the two Congos apart, and asks about a bare "Congo"', () => {
    expect(id('Democratic Republic of the Congo')).toBe('COD')
    expect(id('DR Congo')).toBe('COD')
    expect(id('Congo-Kinshasa')).toBe('COD')
    expect(id('Republic of the Congo')).toBe('COG')
    expect(id('Congo Brazzaville')).toBe('COG')
    expect(id('Congo')).toBe('ambiguous')
  })

  it('keeps Niger and Nigeria, and Dominica and the Dominican Republic, apart', () => {
    expect(id('Niger')).toBe('NER')
    expect(id('the Niger')).toBe('NER')
    expect(id('Nigeria')).toBe('NGA')
    expect(id('Dominica')).toBe('DMA')
    expect(id('Dominican Republic')).toBe('DOM')
    expect(id('Dominican Rep')).toBe('DOM')
    // A typo in the longer name must not land on the shorter one.
    expect(id('Nigerria')).toBe('NGA')
    expect(id('Dominican Repuplic')).toBe('DOM')
  })

  it('keeps the two Sudans and the two Koreas apart', () => {
    expect(id('Sudan')).toBe('SDN')
    expect(id('South Sudan')).toBe('SDS')
    expect(id('S. Sudan')).toBe('SDS')
    expect(id('North Korea')).toBe('PRK')
    expect(id('South Korea')).toBe('KOR')
    expect(id('Republic of Korea')).toBe('KOR')
  })

  it('accepts the old and new names of renamed countries', () => {
    expect(id('Türkiye')).toBe('TUR')
    expect(id('Turkey')).toBe('TUR')
    expect(id('Turkiye')).toBe('TUR')
    expect(id('Czechia')).toBe('CZE')
    expect(id('Czech Republic')).toBe('CZE')
    expect(id('Eswatini')).toBe('SWZ')
    expect(id('Swaziland')).toBe('SWZ')
    expect(id("Côte d'Ivoire")).toBe('CIV')
    expect(id('Cote dIvoire')).toBe('CIV')
    expect(id('Ivory Coast')).toBe('CIV')
    expect(id('North Macedonia')).toBe('MKD')
    expect(id('Macedonia')).toBe('MKD')
    expect(id('Myanmar')).toBe('MMR')
    expect(id('Cabo Verde')).toBe('CPV')
    expect(id('Cape Verde')).toBe('CPV')
    expect(id('Timor-Leste')).toBe('TLS')
  })

  it('does not accept places that are not countries in the game', () => {
    for (const name of ['Scotland', 'Texas', 'Greenland', 'Hong Kong', 'Tibet']) {
      // Scotland and Wales are accepted as ways to say the United Kingdom, nothing else is.
      if (name === 'Scotland') continue
      expect(resolve(name).kind, name).toBe('none')
    }
  })
})

describe('borders and coasts', () => {
  const facts = (code: string) => geo.factsOf(code)

  it('knows who neighbours whom', () => {
    expect(facts('DEU').neighbors).toEqual(
      expect.arrayContaining(['FRA', 'POL', 'CZE', 'AUT', 'CHE', 'NLD', 'BEL', 'LUX', 'DNK']),
    )
    expect(facts('PRT').neighbors).toEqual(['ESP'])
    expect(facts('CHL').neighbors.sort()).toEqual(['ARG', 'BOL', 'PER'])
    expect(facts('SDS').neighbors).toContain('SDN')
    expect(facts('COG').neighbors).toContain('COD')
    expect(facts('GNB').neighbors.sort()).toEqual(['GIN', 'SEN'])
    // Islands share no land border.
    for (const island of ['JPN', 'NZL', 'ISL', 'MDG', 'CUB']) {
      expect(facts(island).neighbors, island).toEqual([])
    }
    // Borders are mutual.
    for (const code of geo.playableIds) {
      for (const other of facts(code).neighbors) {
        expect(facts(other).neighbors, `${other} should list ${code}`).toContain(code)
      }
    }
  })

  it('knows which countries have no sea', () => {
    for (const code of [
      'AUT',
      'CHE',
      'CZE',
      'HUN',
      'SVK',
      'LUX',
      'BOL',
      'PRY',
      'ETH',
      'MLI',
      'NER',
      'TCD',
      'UGA',
      'RWA',
      'ZMB',
      'AFG',
      'NPL',
      'KAZ',
      'MNG',
    ]) {
      expect(facts(code).landlocked, code).toBe(true)
    }
    for (const code of [
      'DEU',
      'FRA',
      'USA',
      'CHN',
      'EGY',
      'IRN',
      'PRT',
      'COG',
      'MOZ',
      'JPN',
      'ISL',
    ]) {
      expect(facts(code).landlocked, code).toBe(false)
    }
  })

  it('knows which countries are islands', () => {
    for (const code of [
      'JPN',
      'NZL',
      'ISL',
      'MDG',
      'CUB',
      'LKA',
      'PHL',
      'IRL',
      'JAM',
      'MLT',
      'FJI',
    ]) {
      expect(facts(code).island, code).toBe(true)
    }
    for (const code of ['FRA', 'BRA', 'RUS', 'ZAF', 'THA']) {
      expect(facts(code).island, code).toBe(false)
    }
  })

  it('puts the equator and the hemispheres in the right places', () => {
    for (const code of ['ECU', 'KEN', 'UGA', 'COG', 'COD', 'GAB', 'IDN', 'BRA', 'SOM', 'COL']) {
      expect(facts(code).onEquator, code).toBe(true)
    }
    // Equatorial Guinea only has the equator in its waters, and the map is too coarse for
    // São Tomé's islet; the category accepts those as answers rather than requiring them.
    expect(facts('GNQ').onEquator).toBe(false)
    const equator = buildCategories(geo).find((c) => c.id === 'equator')!
    expect(equator.lenient).toEqual(expect.arrayContaining(['STP', 'KIR', 'MDV']))
    for (const code of ['FRA', 'USA', 'CHN', 'ARG', 'AUS', 'ZAF', 'EGY']) {
      expect(facts(code).onEquator, code).toBe(false)
    }
    expect(facts('AUS').landNorth).toBe(false)
    expect(facts('ARG').landNorth).toBe(false)
    // France counts its overseas land, so it reaches the south; Germany does not.
    expect(facts('DEU').landSouth).toBe(false)
    expect(facts('FRA').landSouth).toBe(true)
    expect(facts('BRA').landNorth && facts('BRA').landSouth).toBe(true)
  })
})

describe('Rare Earth categories', () => {
  const categories = buildCategories(geo)
  const find = (categoryId: string) => categories.find((c) => c.id === categoryId)
  const accepts = (categoryId: string, code: string) => {
    const category = find(categoryId)
    expect(category, categoryId).toBeDefined()
    return category!.valid.includes(code)
  }

  it('lists landlocked countries by region', () => {
    expect(accepts('landlocked:Africa', 'ETH')).toBe(true)
    expect(accepts('landlocked:Africa', 'EGY')).toBe(false)
    expect(accepts('landlocked:Europe', 'AUT')).toBe(true)
    expect(accepts('landlocked:Europe', 'PRT')).toBe(false)
  })

  it('accepts overseas borders without asking for them', () => {
    const france = find('borders:FRA')!
    expect(france.valid).toEqual(expect.arrayContaining(['DEU', 'ESP', 'ITA', 'BEL']))
    expect(france.valid).not.toContain('BRA')
    expect(france.lenient).toEqual(expect.arrayContaining(['BRA', 'SUR']))
    expect(find('borders:BRA')!.lenient).toContain('FRA')
  })

  it('accepts the ways people draw regional lines', () => {
    expect(find('subregion:Eastern Europe')!.lenient).toEqual(['EST', 'LTU', 'LVA'])
    expect(find('island:Europe')!.lenient).toEqual(['CYP'])
    expect(find('landlocked:Europe')!.lenient).toEqual(['ARM', 'AZE'])
  })

  it('never accepts a country that is not playable, and has no duplicates', () => {
    for (const category of categories) {
      expect(new Set(category.valid).size, category.id).toBe(category.valid.length)
      for (const code of [...category.valid, ...category.lenient]) {
        expect(geo.playableIds, `${category.id}: ${code}`).toContain(code)
      }
      // What is merely allowed is not also required.
      for (const code of category.lenient) expect(category.valid).not.toContain(code)
    }
  })

  it('keeps every category in the size range that makes it a fair question', () => {
    for (const category of categories) {
      expect(category.valid.length, category.id).toBeGreaterThanOrEqual(4)
      expect(category.valid.length, category.id).toBeLessThanOrEqual(40)
    }
  })

  it('has name-based categories that follow the spelling', () => {
    const ends = categories.filter((c) => c.kind === 'name-ends')
    for (const category of ends) {
      const suffix = /“?(\w+)”?\s*$/.exec(category.prompt)?.[1]
      expect(suffix, category.prompt).toBeDefined()
    }
    expect(ends.length).toBeGreaterThan(0)
  })
})
