import { useEffect, useMemo, useState } from 'react'
import type { CityDeck } from '../../game/modes/curriculum'
import type { CityIndex } from '../../geo/cities'
import { frameCountry } from '../../globe/framing'
import { CONTEXT_PAINT, TARGET_AREA_PAINT, type GlobeScene } from '../../globe/scene'
import { formatPopulation } from '../../screens/format'
import { FactCard } from '../../ui/FactCard'
import { Flag } from '../../ui/Flag'
import { Hud } from '../../ui/Hud'
import { useApp } from '../AppContext'
import { useGlobeStage, useStageScene } from '../globeStage'
import { useGameStage } from '../useGameStage'

interface CityDeckStudyProps {
  deck: CityDeck
  cities: CityIndex
  onDone: () => void
  onQuit: () => void
}

/**
 * Meeting a city deck's major cities before being quizzed on them: the camera flies to each
 * city with country borders, name, population and capital shown.
 */
export function CityDeckStudy({ deck, cities, onDone, onQuit }: CityDeckStudyProps) {
  const { geo, preferences } = useApp()
  const stage = useGameStage()
  const { setBordersOverride } = useGlobeStage()
  const [index, setIndex] = useState(0)
  const city = cities.get(deck.cityIds[index])!
  const facts = geo.factsOf(city.countryId)
  const last = index === deck.cityIds.length - 1

  useEffect(() => {
    setBordersOverride(true)
    return () => setBordersOverride(null)
  }, [setBordersOverride])

  useEffect(() => {
    const view = frameCountry(geo.feature(city.countryId), city.at)
    stage.flyTo({ center: city.at, distance: Math.min(view.distance, 2.2) })
  }, [stage, geo, city])

  const scene = useMemo<GlobeScene>(
    () => ({
      paints: [
        ...facts.neighbors.map((neighbor) => ({ id: neighbor, ...CONTEXT_PAINT })),
        { id: city.countryId, ...TARGET_AREA_PAINT },
      ],
      pins: [],
      arcs: [],
      markers: [
        { at: city.at, label: city.name, kind: 'goal' },
        { at: facts.capitals[0].at, label: facts.capitals[0].name, kind: 'city' },
      ],
    }),
    [city, facts],
  )
  useStageScene(scene)

  return (
    <div className="screen screen--game">
      <Hud
        mode="Learn"
        progress={`${deck.title} · ${index + 1} of ${deck.cityIds.length}`}
        onQuit={onQuit}
      />
      <div className="action-bar">
        <section className="study" aria-labelledby="study-title" aria-live="polite">
          <p className="eyebrow">Meet the cities</p>
          <div className="study__title">
            <Flag geo={geo} id={city.countryId} size="medium" testId="study-flag" />
            <h2 className="study__name" id="study-title">
              {city.name}
            </h2>
          </div>
          <p className="study__note">
            In {geo.nameOf(city.countryId)} · Pop. {formatPopulation(city.population)}
          </p>
          <FactCard geo={geo} id={city.countryId} units={preferences.units} cities={cities} />
          <div className="button-row">
            <button
              type="button"
              className="button button--ghost"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              Back
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => (last ? onDone() : setIndex(index + 1))}
              autoFocus
            >
              {last ? 'Start the quiz' : 'Next city'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
