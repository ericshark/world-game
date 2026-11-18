import { useMemo, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { useGlobeShift } from '../../app/useLayoutShift'
import { REGIONS } from '../../geo/countries'
import {
  buildCurriculum,
  countryKnown,
  examTarget,
  lessonProgress,
  nextLesson,
} from '../../game/modes/curriculum'
import { confusedPairs } from '../../game/modes/learnQueue'
import { dueReviews, isExpert, nextDueAt, worldKnowledge } from '../../game/profile/review'
import { Icon } from '../../ui/Icon'
import { formatDue } from './format'

/** The course: reviews that are due, the next lesson, and every lesson with its progress. */
export function LearnScreen({ onClose }: { onClose: () => void }) {
  const { geo, profile, navigate } = useApp()
  const [now] = useState(() => Date.now())
  useGlobeShift({ x: -0.15, y: 0 }, { x: 0, y: 0.22 })

  const curriculum = useMemo(() => buildCurriculum(geo), [geo])
  const { countries } = profile
  const due = dueReviews(countries, now).length
  const upcoming = nextDueAt(countries, now)
  const next = nextLesson(countries, curriculum)
  const known = geo.playableIds.filter((id) => countryKnown(countries[id])).length
  const expert = geo.playableIds.filter((id) => isExpert(countries[id])).length
  const knowledge = Math.round(worldKnowledge(countries, geo.playableIds) * 100)
  const pairs = confusedPairs(profile.confusions).slice(0, 4)
  const open = (target: string) => navigate({ name: 'learn-play', target })

  return (
    <div className="screen screen--passport">
      <section className="panel passport" aria-labelledby="learn-title">
        <header className="passport__header">
          <div>
            <p className="eyebrow">Your course</p>
            <h2 className="passport__rank" id="learn-title">
              Learn the world
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <div className="stat-tiles">
          <div className="tile">
            <p className="tile__value">{knowledge}%</p>
            <p className="tile__label">World knowledge</p>
          </div>
          <div className="tile">
            <p className="tile__value">{known}</p>
            <p className="tile__label">Learned</p>
          </div>
          <div className="tile">
            <p className="tile__value">{expert}</p>
            <p className="tile__label">Expert</p>
          </div>
        </div>
        <p className="passport__hint">
          World knowledge counts a country fully only once you still remember it weeks later. Expert
          means you have kept finding and naming it for two weeks or more.
        </p>

        <div className="learn-actions">
          <button
            type="button"
            className="button button--primary"
            disabled={due === 0}
            onClick={() => open('review')}
          >
            {due > 0 ? `Review ${due} due` : 'No reviews due'}
          </button>
          {due === 0 && upcoming !== null && (
            <span className="learn-actions__note">Next {formatDue(upcoming, now)}</span>
          )}
          <button
            type="button"
            className="button button--ghost"
            onClick={() => navigate({ name: 'atlas' })}
          >
            Explore the atlas
          </button>
          {next && (
            <button type="button" className="button button--ghost" onClick={() => open(next.id)}>
              Next lesson: {next.title}
            </button>
          )}
        </div>

        {pairs.length > 0 && (
          <div className="learn-actions">
            <button type="button" className="button button--ghost" onClick={() => open('mixups')}>
              Drill your mix-ups
            </button>
            <span className="learn-actions__note">
              {pairs.map((p) => `${geo.nameOf(p.a)} / ${geo.nameOf(p.b)}`).join(' · ')}
            </span>
          </div>
        )}

        <div className="passport__body">
          <div className="field">
            <p className="field__label">Exams</p>
            <ul className="lessons">
              {REGIONS.map((region) => {
                const earned = profile.certificates[region]
                const count = geo.playableIds.filter(
                  (id) => geo.feature(id).properties.region === region,
                ).length
                return (
                  <li key={region}>
                    <button
                      type="button"
                      className={`lesson${earned ? ' is-done' : ''}`}
                      onClick={() => open(examTarget(region))}
                    >
                      <span className="lesson__title">{region}</span>
                      <span className="lesson__names">
                        Find all {count} countries with no help. Pass with 90%.
                      </span>
                      <span className="lesson__progress">
                        {earned
                          ? `✓ Certificate · ${new Date(earned).toLocaleDateString()}`
                          : 'Take exam'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          {REGIONS.map((region) => (
            <div className="field" key={region}>
              <p className="field__label">{region}</p>
              <ul className="lessons">
                {curriculum
                  .filter((lesson) => lesson.region === region)
                  .map((lesson) => {
                    const { known: done, total } = lessonProgress(countries, lesson)
                    return (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          className={`lesson${done === total ? ' is-done' : ''}`}
                          onClick={() => open(lesson.id)}
                        >
                          <span className="lesson__title">{lesson.title}</span>
                          <span className="lesson__names">
                            {lesson.ids.map((id) => geo.nameOf(id)).join(', ')}
                          </span>
                          <span className="lesson__progress">
                            {done === total ? '✓ ' : ''}
                            {done} / {total}
                          </span>
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
