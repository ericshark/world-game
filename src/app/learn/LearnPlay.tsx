import { useMemo, useState } from 'react'
import { randomSeed } from '../../game/core/random'
import {
  buildCityDecks,
  buildCurriculum,
  regionOfExam,
  type CityDeck,
  type Lesson,
} from '../../game/modes/curriculum'
import { EXAM_PASS_SHARE, learn } from '../../game/modes/learn'
import { buildCityDeckQueue, buildQueue, examQueue, mixupQueue } from '../../game/modes/learnQueue'
import { duePlaceReviews, nextDueAt } from '../../game/profile/review'
import type { CityIndex } from '../../geo/cities'
import type { Region } from '../../geo/countries'
import type { HowToStep } from '../../ui/HowToPlay'
import { Sheet } from '../../ui/Sheet'
import { formatDue } from '../../screens/learn/format'
import { useApp } from '../AppContext'
import { RoundGame } from '../rounds/RoundGame'
import { useCities } from '../useCities'
import { CityDeckStudy } from './CityDeckStudy'
import { LessonStudy } from './LessonStudy'

const HOW_TO: HowToStep[] = [
  {
    icon: 'compass',
    title: 'Learn, then remember',
    text: 'Each lesson shows a few places, then asks you about them. Reviews bring back what you learned just before you would forget it.',
  },
  {
    icon: 'check',
    title: 'Misses come back',
    text: 'A question you get wrong is asked again at the end of the session.',
  },
  {
    icon: 'calendar',
    title: 'Come back tomorrow',
    text: 'Right answers move a skill up a box, and the gaps between reviews grow from a day to weeks. That is what makes it stick.',
  },
]

interface LearnPlayProps {
  /** `review`, `mixups`, `exam-<region>`, `cities-<region>-<n>`, or a lesson id. */
  target: string
  onHub: () => void
}

/** A lesson or city deck (study, then quiz) or a spaced review, built from the player's stats. */
export function LearnPlay({ target, onHub }: LearnPlayProps) {
  const { profile } = useApp()
  const isCityDeck = target.startsWith('cities-')
  const [hasCityReviews] = useState(() => duePlaceReviews(profile.places, Date.now()).length > 0)
  const needsCities = isCityDeck || (target === 'review' && hasCityReviews)
  const { cities, error, retry } = useCities(needsCities)

  if (needsCities && error) {
    return (
      <Sheet
        title="Could not load major cities"
        onClose={onHub}
        footer={
          <button type="button" className="button button--primary" onClick={retry}>
            Try again
          </button>
        }
      >
        <p className="error" role="alert">
          Check your connection and try again.
        </p>
      </Sheet>
    )
  }

  if (needsCities && !cities) {
    return (
      <div className="screen screen--center">
        <p className="panel waiting">Loading cities…</p>
      </div>
    )
  }

  return <LearnPlayReady target={target} cities={cities ?? undefined} onHub={onHub} />
}

function LearnPlayReady({
  target,
  cities,
  onHub,
}: LearnPlayProps & { cities: CityIndex | undefined }) {
  const { geo, profile } = useApp()
  const lesson = useMemo<Lesson | null>(
    () => buildCurriculum(geo).find((candidate) => candidate.id === target) ?? null,
    [geo, target],
  )
  const cityDeck = useMemo<CityDeck | null>(
    () => (cities ? (buildCityDecks(geo, cities).find((d) => d.id === target) ?? null) : null),
    [geo, cities, target],
  )
  const examRegion: Region | null = regionOfExam(target)

  // Read once: answering changes the profile, and the session must not rebuild itself.
  const [setup] = useState(() => {
    const now = Date.now()
    const seed = randomSeed()
    const queue = examRegion
      ? examQueue(
          geo.playableIds.filter((id) => geo.feature(id).properties.region === examRegion),
          seed,
        )
      : target === 'mixups'
        ? mixupQueue(profile.confusions, seed)
        : cityDeck && cities
          ? buildCityDeckQueue(cityDeck, cities, profile.places, seed)
          : buildQueue({
              countries: profile.countries,
              places: profile.places,
              cities,
              now,
              seed,
              lesson: lesson ?? undefined,
            })
    return {
      now,
      queue,
      nextDue: nextDueAt(profile.countries, now, profile.places),
    }
  })
  const [studied, setStudied] = useState(lesson === null && cityDeck === null)

  if (target !== 'review' && target !== 'mixups' && !examRegion && !lesson && !cityDeck) {
    return (
      <Sheet title="That lesson was not found" onClose={onHub}>
        <p>The course may have changed. Pick a lesson from the list.</p>
      </Sheet>
    )
  }
  if (lesson && !studied) {
    return <LessonStudy lesson={lesson} onDone={() => setStudied(true)} onQuit={onHub} />
  }
  if (cityDeck && cities && !studied) {
    return (
      <CityDeckStudy
        deck={cityDeck}
        cities={cities}
        onDone={() => setStudied(true)}
        onQuit={onHub}
      />
    )
  }
  if (setup.queue.length === 0) {
    return (
      <Sheet
        eyebrow={target === 'mixups' ? 'Mix-ups' : 'Review'}
        title={target === 'mixups' ? 'No mix-ups yet' : 'Nothing to review right now'}
        onClose={onHub}
      >
        <p>
          {target === 'mixups'
            ? 'Countries you take for each other will collect here, so you can practise them side by side.'
            : setup.nextDue
              ? `Your next review is ${formatDue(setup.nextDue, setup.now)}.`
              : 'Finish a lesson first, and your reviews will appear here.'}
        </p>
      </Sheet>
    )
  }

  const title = examRegion
    ? `${examRegion} exam`
    : target === 'mixups'
      ? 'Mix-ups'
      : (cityDeck?.title ?? lesson?.title ?? 'Review')
  const citiesOnly = setup.queue.every((item) => item.skill === 'city')

  return (
    <RoundGame
      rules={learn}
      config={{ queue: setup.queue, title, exam: examRegion ? { region: examRegion } : undefined }}
      cities={cities}
      mode="Learn"
      subtitle={title}
      introKey="learn"
      howTo={HOW_TO}
      roundTimeMs={null}
      suggestions
      replayable={false}
      tiles={(results) => [
        { label: 'Correct', value: `${results.filter((r) => r.hit).length} / ${results.length}` },
        examRegion
          ? {
              label: 'Exam',
              value:
                results.filter((r) => r.hit).length >= EXAM_PASS_SHARE * results.length
                  ? 'Passed ✓'
                  : 'Not yet',
            }
          : {
              label: 'To look at again',
              value: String(new Set(results.filter((r) => !r.hit).map((r) => r.targetId)).size),
            },
        {
          label: citiesOnly ? 'Cities' : 'Countries',
          value: String(new Set(results.map((r) => r.targetId)).size),
        },
      ]}
      onChangeSetup={onHub}
      onHome={onHub}
    />
  )
}
