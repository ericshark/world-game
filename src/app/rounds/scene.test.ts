import { describe, expect, it } from 'vitest'
import { submitRound, startRounds } from '../../game/core/rounds'
import { evaluateChallenge } from '../../game/core/evaluate'
import { LOCAL_PLAYER, type Challenge } from '../../game/core/types'
import { journey } from '../../game/modes/journey'
import { TARGET_COLOR } from '../../globe/scene'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { journeyScene } from '../journey/scene'
import { roundScene } from './scene'

const geo = loadTestGeoData()

function revealed(challenge: Challenge, pin: [number, number]) {
  const rounds = startRounds([challenge], { players: [LOCAL_PLAYER], now: 0 })
  return submitRound(rounds, LOCAL_PLAYER, { pin, at: 1 }, (c, s) =>
    evaluateChallenge(geo, c, s, { region: 'World', cutoffScale: 1 }),
  )
}

describe('round scenes', () => {
  it('shows only your own pin while a round is open', () => {
    const rounds = startRounds([{ kind: 'locate', countryId: 'PER' }], {
      players: [LOCAL_PLAYER],
      now: 0,
    })
    const scene = roundScene(rounds, [10, 10], geo)
    expect(scene.pins).toEqual([expect.objectContaining({ at: [10, 10], own: true })])
    expect(scene.pulses ?? []).toEqual([])
  })

  it('pulses a found country and joins a miss to it with an arc', () => {
    const scene = roundScene(revealed({ kind: 'locate', countryId: 'PER' }, [0, 0]), null, geo)
    expect(scene.pulses).toEqual([{ id: 'PER', color: TARGET_COLOR }])
    expect(scene.arcs).toHaveLength(1)
    expect(scene.pins.filter((pin) => pin.own)).toHaveLength(1)
  })

  it('labels the capital at a capital reveal', () => {
    const capital = geo.factsOf('PER').capitals[0]
    const scene = roundScene(revealed({ kind: 'capital', countryId: 'PER' }, [0, 0]), null, geo)
    expect(scene.markers).toEqual([{ at: capital.at, label: capital.name, kind: 'city' }])
  })
})

describe('journey scene', () => {
  it('labels the start and goal and pulses the current country', () => {
    const state = journey.start({
      config: { kind: 'expedition', expeditionId: 'cape-to-cairo' },
      seed: 's',
      now: 0,
      geo,
      players: [LOCAL_PLAYER],
    })
    const scene = journeyScene(state, geo, { draftPin: null, showConnections: false })
    expect(scene.markers?.map((m) => [m.kind, m.label])).toEqual([
      ['start', 'South Africa'],
      ['goal', 'Egypt'],
    ])
    expect(scene.pulses?.map((p) => p.id)).toEqual(['ZAF'])
  })
})
