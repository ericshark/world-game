import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../test/loadTestCountries'
import { EXPEDITIONS } from '../game/modes/expeditions'
import { buildTravelGraph, cheapestRoute, costsFrom } from './graph'

const geo = loadTestGeoData()
const graph = buildTravelGraph(geo)
const linkTo = (from: string, to: string) => graph.get(from)!.find((l) => l.to === to)

describe('travel graph', () => {
  it('links land neighbours cheaply and nearby coasts by sea', () => {
    expect(linkTo('FRA', 'DEU')).toMatchObject({ by: 'land', cost: 1 })
    expect(linkTo('GBR', 'FRA')).toMatchObject({ by: 'sea', cost: 2 })
    expect(linkTo('ITA', 'TUN')).toMatchObject({ by: 'sea' })
    expect(linkTo('AUS', 'NZL')).toBeUndefined()
  })

  it('does not cross the Atlantic through French Guiana', () => {
    expect(linkTo('FRA', 'BRA')).toBeUndefined()
    expect(linkTo('BRA', 'FRA')).toBeUndefined()
  })

  it('is symmetric', () => {
    for (const [from, links] of graph) {
      for (const link of links) expect(linkTo(link.to, from)?.cost).toBe(link.cost)
    }
  })
})

describe('cheapestRoute', () => {
  it('finds the shortest way', () => {
    expect(cheapestRoute(graph, 'FRA', 'POL', {}, geo)).toEqual({
      cost: 2,
      path: ['FRA', 'DEU', 'POL'],
    })
  })

  it('respects avoided countries and waypoints', () => {
    const plain = cheapestRoute(graph, 'FRA', 'POL', {}, geo)!
    const avoiding = cheapestRoute(graph, 'FRA', 'POL', { avoid: ['DEU'] }, geo)!
    expect(avoiding.cost).toBeGreaterThan(plain.cost)
    expect(avoiding.path).not.toContain('DEU')
    const via = cheapestRoute(graph, 'FRA', 'POL', { visit: { ids: ['ITA'], count: 1 } }, geo)!
    expect(via.path).toContain('ITA')
  })

  it('reports unreachable places', () => {
    expect(cheapestRoute(graph, 'FRA', 'NZL', {}, geo)).toBeNull()
    expect(costsFrom(graph, 'FRA').has('NZL')).toBe(false)
  })

  it.each(EXPEDITIONS.map((e) => [e.id, e] as const))(
    'expedition %s can be completed',
    (_id, e) => {
      const route = cheapestRoute(graph, e.from, e.to, e.rules, geo)
      expect(route).not.toBeNull()
      expect(route!.cost).toBeGreaterThanOrEqual(4)
    },
  )
})
