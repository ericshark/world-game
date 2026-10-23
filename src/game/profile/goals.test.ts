import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { nextGoal } from './goals'
import { emptyProfile, type Profile } from './profile'

const geo = loadTestGeoData()
const hit = { attempts: 1, hits: 1, totalKm: 0, recent: [true] }

function withFound(ids: string[]): Profile {
  const profile = emptyProfile()
  for (const id of ids) profile.countries[id] = { locate: hit }
  return profile
}

describe('next goal', () => {
  it('starts with the next level', () => {
    expect(nextGoal(emptyProfile(), geo)).toEqual({ kind: 'level', level: 2, xpLeft: 200 })
  })

  it('points at a nearly finished region', () => {
    const oceania = geo.playableIds.filter((id) => geo.feature(id).properties.region === 'Oceania')
    const goal = nextGoal(withFound(oceania.slice(2)), geo)
    expect(goal).toEqual({ kind: 'region', region: 'Oceania', left: 2 })
  })
})
