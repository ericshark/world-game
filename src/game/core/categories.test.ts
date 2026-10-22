import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import {
  buildCategories,
  explainAnswer,
  fitsCategory,
  MAX_ANSWERS,
  MIN_ANSWERS,
  rarities,
  rarityTier,
} from './categories'

const geo = loadTestGeoData()
const categories = buildCategories(geo)
const byId = (id: string) => categories.find((c) => c.id === id)!

describe('buildCategories', () => {
  it('only keeps categories with a fair number of answers', () => {
    expect(categories.length).toBeGreaterThan(100)
    for (const category of categories) {
      expect(category.valid.length).toBeGreaterThanOrEqual(MIN_ANSWERS)
      expect(category.valid.length).toBeLessThanOrEqual(MAX_ANSWERS)
      expect(category.lenient.some((id) => category.valid.includes(id))).toBe(false)
    }
    expect(new Set(categories.map((c) => c.id)).size).toBe(categories.length)
  })

  it('builds the expected answers from the facts', () => {
    expect(byId('landlocked:Africa').valid).toHaveLength(16)
    expect(byId('borders:DEU').valid).toEqual([
      'AUT',
      'BEL',
      'CHE',
      'CZE',
      'DNK',
      'FRA',
      'LUX',
      'NLD',
      'POL',
    ])
    expect(byId('name-ends:stan').valid).toHaveLength(7)
    expect(byId('coast:Caspian Sea').valid).toEqual(['AZE', 'IRN', 'KAZ', 'RUS', 'TKM'])
  })

  it('splits oceans with too many shores by region', () => {
    expect(categories.some((c) => c.id === 'coast:Atlantic Ocean')).toBe(false)
    expect(byId('coast:Atlantic Ocean:Africa').valid).toContain('NGA')
  })

  it('accepts reasonable edge cases leniently', () => {
    // A marginal sea: Belgium faces the North Sea, part of the Atlantic.
    expect(fitsCategory(byId('coast:Atlantic Ocean:Europe'), 'BEL')).toBe(true)
    expect(byId('coast:Atlantic Ocean:Europe').valid).not.toContain('BEL')
    // The equator crosses São Tomé's smallest islet.
    expect(fitsCategory(byId('equator'), 'STP')).toBe(true)
  })
})

describe('explainAnswer', () => {
  it('says why an answer does or does not fit', () => {
    expect(explainAnswer(byId('landlocked:Africa'), 'NGA', geo)).toBe('Nigeria has a coast')
    expect(explainAnswer(byId('landlocked:Africa'), 'MNG', geo)).toBe(
      'Mongolia is in Asia, not Africa',
    )
    expect(explainAnswer(byId('borders:DEU'), 'ITA', geo)).toBe('Italy does not border Germany')
  })
})

describe('rarity', () => {
  it('ranks obvious answers common and obscure ones rare', () => {
    const r = rarities(byId('landlocked:Africa'), geo)
    expect(r.get('ETH')).toBe(0)
    expect(r.get('LSO')!).toBeGreaterThan(0.9)
    expect(rarityTier(r.get('ETH')!)).toBe('Common')
    expect(rarityTier(r.get('LSO')!)).toBe('Legendary')
  })
})
