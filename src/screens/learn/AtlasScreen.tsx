import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { useGlobeStage, useStagePicking, useStageScene } from '../../app/globeStage'
import { useGlobeShift } from '../../app/useLayoutShift'
import { REGIONS, type Region } from '../../geo/countries'
import { frameCountry, frameMany } from '../../globe/framing'
import { CONTEXT_PAINT, TARGET_PAINT, type GlobeScene } from '../../globe/scene'
import { Choice } from '../../ui/controls'
import { FactCard } from '../../ui/FactCard'
import { Icon } from '../../ui/Icon'

/**
 * Free exploration: borders on, tap any country to see its name, capital, neighbours and facts.
 * It never scores anything, which is why names may be shown here and nowhere in the games.
 */
export function AtlasScreen({ onClose }: { onClose: () => void }) {
  const { geo, preferences } = useApp()
  const stage = useGlobeStage()
  const [region, setRegion] = useState<Region>('Europe')
  const [selected, setSelected] = useState<string | null>(null)
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

  const select = (id: string) => {
    setSelected(id)
    stage.flyTo(frameCountry(geo.feature(id), geo.factsOf(id).label))
  }
  const chooseRegion = (next: Region) => {
    setRegion(next)
    setSelected(null)
    const ids = geo.playableIds.filter((id) => geo.feature(id).properties.region === next)
    stage.flyTo(frameMany(ids.map((id) => geo.factsOf(id).label)))
  }

  useStagePicking((point) => {
    const id = geo.countries.countryAt(point)?.properties.id
    if (id && geo.playableIds.includes(id)) select(id)
  })

  const scene = useMemo<GlobeScene>(() => {
    if (!selected) return { paints: [], pins: [], arcs: [] }
    const facts = geo.factsOf(selected)
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
      ],
    }
  }, [geo, selected])
  useStageScene(scene)

  return (
    <div className="screen screen--passport">
      <section className="panel passport" aria-labelledby="atlas-title">
        <header className="passport__header">
          <div>
            <p className="eyebrow">Explore</p>
            <h2 className="passport__rank" id="atlas-title">
              Atlas
            </h2>
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
        {selected && (
          <div className="country-card">
            <h3 className="country-card__name">{geo.nameOf(selected)}</h3>
            <FactCard geo={geo} id={selected} units={preferences.units} />
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
