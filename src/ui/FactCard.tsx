import { useState } from 'react'
import type { GeoData } from '../geo/facts'
import type { Units } from '../game/profile/settings'
import { formatArea, formatPopulation } from '../screens/format'

interface FactCardProps {
  geo: GeoData
  id: string
  units: Units
}

const NEIGHBORS_SHOWN = 6

/** What's worth knowing about a country, shown at the reveal. */
export function FactCard({ geo, id, units }: FactCardProps) {
  const [expanded, setExpanded] = useState(false)
  const facts = geo.factsOf(id)
  const feature = geo.feature(id)
  const neighbors = facts.neighbors.map((n) => geo.nameOf(n))
  const tags = [
    facts.landlocked && 'Landlocked',
    facts.island && 'Island nation',
    facts.onEquator && 'On the equator',
  ]

  return (
    <div className="facts">
      <dl className="facts__grid">
        <div>
          <dt>Capital</dt>
          <dd>{facts.capitals.map((c) => c.name).join(' / ')}</dd>
        </div>
        <div>
          <dt>Population</dt>
          <dd>{formatPopulation(facts.population)}</dd>
        </div>
        <div>
          <dt>Region</dt>
          <dd>{facts.subregion || feature.properties.region}</dd>
        </div>
        {expanded && (
          <>
            <div>
              <dt>Area</dt>
              <dd>{formatArea(facts.areaKm2, units)}</dd>
            </div>
            <div className="facts__wide">
              <dt>Neighbours</dt>
              <dd>
                {neighbors.length === 0
                  ? 'None by land'
                  : neighbors.slice(0, NEIGHBORS_SHOWN).join(', ') +
                    (neighbors.length > NEIGHBORS_SHOWN
                      ? ` and ${neighbors.length - NEIGHBORS_SHOWN} more`
                      : '')}
              </dd>
            </div>
            {facts.coasts.length > 0 && (
              <div className="facts__wide">
                <dt>Coasts</dt>
                <dd>{facts.coasts.join(', ')}</dd>
              </div>
            )}
          </>
        )}
      </dl>
      <div className="facts__footer">
        {tags.filter(Boolean).map((tag) => (
          <span className="tag" key={String(tag)}>
            {tag}
          </span>
        ))}
        <button
          type="button"
          className="button button--link facts__toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Less' : 'More facts'}
        </button>
      </div>
    </div>
  )
}
