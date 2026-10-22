import { describe, expect, it } from 'vitest'
import { formatArea, formatDistance, formatPopulation } from './format'

describe('format', () => {
  it('shows distances in the chosen units', () => {
    expect(formatDistance(1234.4)).toBe('1,234 km')
    expect(formatDistance(1609.344, 'mi')).toBe('1,000 mi')
  })

  it('shows areas compactly', () => {
    expect(formatArea(0.49)).toBe('0.5 km²')
    expect(formatArea(357_177)).toBe('357,177 km²')
    expect(formatArea(16_924_111)).toBe('16.9M km²')
    expect(formatArea(2.59, 'mi')).toBe('1.0 mi²')
  })

  it('shows populations in words', () => {
    expect(formatPopulation(825)).toBe('825')
    expect(formatPopulation(5_380_508)).toBe('5.4 million')
    expect(formatPopulation(32_510_453)).toBe('33 million')
    expect(formatPopulation(1_397_715_000)).toBe('1.40 billion')
  })
})
