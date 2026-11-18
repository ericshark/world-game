import { useEffect, useMemo, useState } from 'react'
import type { Lesson } from '../../game/modes/curriculum'
import { frameCountry } from '../../globe/framing'
import { CONTEXT_PAINT, TARGET_PAINT, type GlobeScene } from '../../globe/scene'
import { FactCard } from '../../ui/FactCard'
import { Flag } from '../../ui/Flag'
import { Hud } from '../../ui/Hud'
import { useApp } from '../AppContext'
import { useGlobeStage, useStageScene } from '../globeStage'
import { useGameStage } from '../useGameStage'

interface LessonStudyProps {
  lesson: Lesson
  onDone: () => void
  onQuit: () => void
}

/**
 * Meeting a lesson's countries before being quizzed on them: the camera flies to each one with
 * its borders, name, capital and neighbours shown, which no scored game ever does.
 */
export function LessonStudy({ lesson, onDone, onQuit }: LessonStudyProps) {
  const { geo, preferences } = useApp()
  const stage = useGameStage()
  const { setBordersOverride } = useGlobeStage()
  const [index, setIndex] = useState(0)
  const id = lesson.ids[index]
  const facts = geo.factsOf(id)
  const last = index === lesson.ids.length - 1

  useEffect(() => {
    setBordersOverride(true)
    return () => setBordersOverride(null)
  }, [setBordersOverride])

  useEffect(() => {
    stage.flyTo(frameCountry(geo.feature(id), facts.label))
  }, [stage, geo, id, facts.label])

  const scene = useMemo<GlobeScene>(
    () => ({
      paints: [
        ...facts.neighbors.map((neighbor) => ({ id: neighbor, ...CONTEXT_PAINT })),
        { id, ...TARGET_PAINT },
      ],
      pins: [],
      arcs: [],
      markers: [
        { at: facts.label, label: geo.nameOf(id), kind: 'goal' },
        ...facts.neighbors.map((neighbor) => ({
          at: geo.factsOf(neighbor).label,
          label: geo.nameOf(neighbor),
          kind: 'start' as const,
        })),
        { at: facts.capitals[0].at, label: facts.capitals[0].name, kind: 'city' },
      ],
    }),
    [geo, id, facts],
  )
  useStageScene(scene)

  return (
    <div className="screen screen--game">
      <Hud
        mode="Learn"
        progress={`${lesson.title} · ${index + 1} of ${lesson.ids.length}`}
        onQuit={onQuit}
      />
      <div className="action-bar">
        <section className="study" aria-labelledby="study-title" aria-live="polite">
          <p className="eyebrow">Meet the countries</p>
          <div className="study__title">
            <Flag geo={geo} id={id} size="medium" testId="study-flag" />
            <h2 className="study__name" id="study-title">
              {geo.nameOf(id)}
            </h2>
          </div>
          {facts.neighbors.length > 0 && (
            <p className="study__note">
              Borders{' '}
              {facts.neighbors
                .map((n) => geo.nameOf(n))
                .slice(0, 6)
                .join(', ')}
              {facts.neighbors.length > 6 && ` and ${facts.neighbors.length - 6} more`}
            </p>
          )}
          <FactCard geo={geo} id={id} units={preferences.units} />
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
              {last ? 'Start the quiz' : 'Next country'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
