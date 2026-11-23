import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { useCities } from '../../app/useCities'
import { useGlobeStage, useStagePicking, useStageScene } from '../../app/globeStage'
import { useGlobeShift } from '../../app/useLayoutShift'
import type { City } from '../../geo/cities'
import { REGIONS, type Region } from '../../geo/countries'
import { MIN_CAMERA_DISTANCE } from '../../globe/constants'
import { frameCountry, frameMany } from '../../globe/framing'
import { CONTEXT_PAINT, TARGET_PAINT, type GlobeScene, type MarkerSpec } from '../../globe/scene'
import { Choice, Switch } from '../../ui/controls'
import { FactCard } from '../../ui/FactCard'
import { Icon } from '../../ui/Icon'

const REGION_MARKERS_LIMIT = 12

/**
 * Free exploration: borders on, tap any country to see its name, capital, major cities,
 * neighbours and facts. Never scores anything, which is why names may be shown here.
 */
export function AtlasScreen({ onClose }: { onClose: () => void }) {
  const { geo, preferences } = useApp()
  const stage = useGlobeStage()
  const { cities } = useCities()
  const [region, setRegion] = useState<Region>('Europe')
  const [selected, setSelected] = useState<string | null>(null)
  const [focusedCity, setFocusedCity] = useState<string | null>(null)
  const [showCities, setShowCities] = useState(true)
  useGlobeShift({ x: -0.15, y: 0 }, { x: 0, y: 0.22 })

  useEffect(() => {
    stage.setBordersOverride(true)
    stage.setAutoRotate(false)
    return () => {
      stage.setBordersOverride(null)
      stage.setAutoRotate(true)
    }
  }, [stage])

  const inRegion = useMemo(
    () =>
      geo.playableIds
        .filter((id) => geo.feature(id).properties.region === region)
        .sort((a, b) => geo.nameOf(a).localeCompare(geo.nameOf(b))),
    [geo, region],
  )

  const regionCities = useMemo(
    () =>
      cities
        ? [...cities.inRegion(geo, region)]
            .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id))
            .slice(0, REGION_MARKERS_LIMIT)
        : [],
    [cities, geo, region],
  )

  const selectedCities = useMemo(
    () => (selected && cities ? cities.byCountry(selected) : []),
    [selected, cities],
  )

  const select = (id: string) => {
    setSelected(id)
    setFocusedCity(null)
    stage.flyTo(frameCountry(geo.feature(id), geo.factsOf(id).label))
  }
  const chooseRegion = (next: Region) => {
    setRegion(next)
    setSelected(null)
    setFocusedCity(null)
    const ids = geo.playableIds.filter((id) => geo.feature(id).properties.region === next)
    stage.flyTo(frameMany(ids.map((id) => geo.factsOf(id).label)))
  }
  const focusCity = (city: City) => {
    setFocusedCity(city.id)
    stage.flyTo({ center: city.at, distance: MIN_CAMERA_DISTANCE })
  }

  useStagePicking((point) => {
    const id = geo.countries.countryAt(point)?.properties.id
    if (id && geo.playableIds.includes(id)) select(id)
  })

  const scene = useMemo<GlobeScene>(() => {
    if (!selected) {
      return {
        paints: [],
        pins: [],
        arcs: [],
        markers: showCities
          ? regionCities.map((city) => ({
              at: city.at,
              label: city.name,
              kind: 'major' as const,
            }))
          : [],
      }
    }
    const facts = geo.factsOf(selected)
    const cityMarkers: MarkerSpec[] = showCities
      ? selectedCities.map((city) => ({
          at: city.at,
          label: city.name,
          kind: focusedCity === city.id ? 'goal' : 'major',
        }))
      : []
    return {
      paints: [
        ...facts.neighbors.map((id) => ({ id, ...CONTEXT_PAINT })),
        { id: selected, ...TARGET_PAINT },
      ],
      pins: [],
      arcs: [],
      markers: [
        { at: facts.label, label: geo.nameOf(selected), kind: 'goal' },
        ...facts.neighbors.map((id) => ({
          at: geo.factsOf(id).label,
          label: geo.nameOf(id),
          kind: 'start' as const,
        })),
        { at: facts.capitals[0].at, label: facts.capitals[0].name, kind: 'city' },
        ...cityMarkers,
      ],
    }
  }, [geo, selected, showCities, regionCities, selectedCities, focusedCity])
  useStageScene(scene)

  return (
    <div className="screen screen--passport">
      <section className="panel passport" aria-labelledby="atlas-title">
        <header className="passport__header">
          <div>
            <p className="eyebrow">Explore</p>
            <h1 className="passport__rank" id="atlas-title">
              Atlas
            </h1>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <p className="passport__hint">Tap a country on the globe, or choose one below.</p>
        <Choice
          label="Region"
          value={region}
          onChange={chooseRegion}
          options={REGIONS.map((r) => ({ value: r, label: r }))}
        />
        <Switch label="Major cities" checked={showCities} onChange={setShowCities} />
        {selected && (
          <div className="country-card">
            <h2 className="country-card__name">{geo.nameOf(selected)}</h2>
            <FactCard geo={geo} id={selected} units={preferences.units} cities={cities} />
            {selectedCities.length > 0 && (
              <p className="passport__hint">
                Fly to city:{' '}
                {selectedCities.map((city) => (
                  <button
                    type="button"
                    key={city.id}
                    className={`button button--link${focusedCity === city.id ? ' is-selected' : ''}`}
                    aria-pressed={focusedCity === city.id}
                    onClick={() => focusCity(city)}
                  >
                    {city.name}
                  </button>
                ))}
              </p>
            )}
            {geo.factsOf(selected).neighbors.length > 0 && (
              <p className="passport__hint">
                Neighbours:{' '}
                {geo.factsOf(selected).neighbors.map((id) => (
                  <button
                    type="button"
                    key={id}
                    className="button button--link"
                    onClick={() => select(id)}
                  >
                    {geo.nameOf(id)}
                  </button>
                ))}
              </p>
            )}
          </div>
        )}
        <ul className="atlas-list" aria-label={`Countries in ${region}`}>
          {inRegion.map((id) => (
            <li key={id}>
              <button
                type="button"
                className={`button button--link${id === selected ? ' is-selected' : ''}`}
                aria-pressed={id === selected}
                onClick={() => select(id)}
              >
                {geo.nameOf(id)}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
