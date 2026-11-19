import { useEffect, useMemo, useState } from 'react'
import type { SubLesson } from '../../game/modes/curriculum'
import type { SubdivisionPack } from '../../geo/subdivisions'
import { frameCountry } from '../../globe/framing'
import { CONTEXT_PAINT, TARGET_PAINT, type GlobeScene } from '../../globe/scene'
import { formatArea } from '../../screens/format'
import { FactCard } from '../../ui/FactCard'
import { Flag } from '../../ui/Flag'
import { Hud } from '../../ui/Hud'
import { useApp } from '../AppContext'
import { useGlobeStage, useStageScene } from '../globeStage'
import { useGameStage } from '../useGameStage'

interface SubLessonStudyProps {
  lesson: SubLesson
  pack: SubdivisionPack
  onDone: () => void
  onQuit: () => void
}

/**
 * Meeting a state or province lesson's units before being quizzed on them: the camera flies to
 * each one with subdivision borders, vector highlights, name, neighbours and area shown.
 */
export function SubLessonStudy({ lesson, pack, onDone, onQuit }: SubLessonStudyProps) {
  const { geo, preferences } = useApp()
  const stage = useGameStage()
  const { setBordersOverride } = useGlobeStage()
  const [index, setIndex] = useState(0)
  const unitId = lesson.unitIds[index]
  const facts = pack.factsOf(unitId)
  const last = index === lesson.unitIds.length - 1

  useEffect(() => {
    setBordersOverride(true)
    return () => setBordersOverride(null)
  }, [setBordersOverride])

  useEffect(() => {
    stage.flyTo(frameCountry(pack.feature(unitId), facts.label))
  }, [stage, pack, unitId, facts.label])

  const scene = useMemo<GlobeScene>(
    () => ({
      paints: [],
      pins: [],
      arcs: [],
      subPack: {
        id: pack.countryId,
        paints: [
          ...facts.neighbors.map((neighbor) => ({ id: neighbor, ...CONTEXT_PAINT })),
          { id: unitId, ...TARGET_PAINT },
        ],
      },
      markers: [
        { at: facts.label, label: pack.nameOf(unitId), kind: 'goal' },
        ...facts.neighbors.map((neighbor) => ({
          at: pack.factsOf(neighbor).label,
          label: pack.nameOf(neighbor),
          kind: 'start' as const,
        })),
      ],
    }),
    [pack, unitId, facts],
  )
  useStageScene(scene)

  return (
    <div className="screen screen--game">
      <Hud
        mode="Learn"
        progress={`${lesson.title} · ${index + 1} of ${lesson.unitIds.length}`}
        onQuit={onQuit}
      />
      <div className="action-bar">
        <section className="study" aria-labelledby="study-title" aria-live="polite">
          <p className="eyebrow">Meet the states & provinces</p>
          <div className="study__title">
            <Flag geo={geo} id={pack.countryId} size="medium" testId="study-flag" />
            <h2 className="study__name" id="study-title">
              {pack.nameOf(unitId)}
            </h2>
          </div>
          <p className="study__note">
            In {pack.countryName} · Area {formatArea(facts.areaKm2, preferences.units)}
            {facts.neighbors.length > 0 && (
              <>
                {' · Borders '}
                {facts.neighbors
                  .map((n) => pack.nameOf(n))
                  .slice(0, 6)
                  .join(', ')}
                {facts.neighbors.length > 6 && ` and ${facts.neighbors.length - 6} more`}
              </>
            )}
          </p>
          <FactCard geo={geo} id={pack.countryId} units={preferences.units} />
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
              {last ? 'Start the quiz' : 'Next state'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
