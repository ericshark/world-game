import { useMemo, useState } from 'react'
import { randomSeed } from '../../game/core/random'
import {
  buildCityDecks,
  buildCurriculum,
  buildSubLessons,
  regionOfExam,
  type CityDeck,
  type Lesson,
  type SubLesson,
} from '../../game/modes/curriculum'
import { EXAM_PASS_SHARE, learn } from '../../game/modes/learn'
import {
  buildCityDeckQueue,
  buildQueue,
  buildSubLessonQueue,
  examQueue,
  mixupQueue,
} from '../../game/modes/learnQueue'
import { duePlaceReviews, dueSubReviews, nextDueAt } from '../../game/profile/review'
import type { CityIndex } from '../../geo/cities'
import type { Region } from '../../geo/countries'
import { isSubPackId, type SubPackId, type SubdivisionPack } from '../../geo/subdivisions'
import type { HowToStep } from '../../ui/HowToPlay'
import { Sheet } from '../../ui/Sheet'
import { formatDue } from '../../screens/learn/format'
import { useApp } from '../AppContext'
import { RoundGame } from '../rounds/RoundGame'
import { useCities } from '../useCities'
import { useSubdivisionPacks } from '../useSubdivisions'
import { CityDeckStudy } from './CityDeckStudy'
import { LessonStudy } from './LessonStudy'
import { SubLessonStudy } from './SubLessonStudy'

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

function parseSubLessonPack(target: string): SubPackId | null {
  const match = target.match(/^sub-([a-z]{3})-\d+$/)
  if (!match) return null
  const upper = match[1].toUpperCase()
  return isSubPackId(upper) ? upper : null
}

/** A lesson or city deck (study, then quiz) or a spaced review, built from the player's stats. */
export function LearnPlay({ target, onHub }: LearnPlayProps) {
  const { profile } = useApp()
  const isCityDeck = target.startsWith('cities-')
  const subPackFromTarget = parseSubLessonPack(target)
  const [hasCityReviews] = useState(() => duePlaceReviews(profile.places, Date.now()).length > 0)
  const [dueSubPackIds] = useState<SubPackId[]>(() => [
    ...new Set(dueSubReviews(profile.places, Date.now()).map((r) => r.packId)),
  ])
  const neededSubPackIds = useMemo<SubPackId[]>(
    () => (subPackFromTarget ? [subPackFromTarget] : target === 'review' ? dueSubPackIds : []),
    [subPackFromTarget, target, dueSubPackIds],
  )
  const needsCities = isCityDeck || (target === 'review' && hasCityReviews)
  const needsSub = neededSubPackIds.length > 0
  const { cities, error: citiesError, retry: retryCities } = useCities(needsCities)
  const {
    packs: subdivisions,
    error: subError,
    retry: retrySub,
  } = useSubdivisionPacks(neededSubPackIds, needsSub)

  if ((needsCities && citiesError) || (needsSub && subError)) {
    return (
      <Sheet
        title={
          needsSub && subError ? 'Could not load states & provinces' : 'Could not load major cities'
        }
        onClose={onHub}
        footer={
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              if (needsCities && citiesError) retryCities()
              if (needsSub && subError) retrySub()
            }}
          >
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

  if ((needsCities && !cities) || (needsSub && !subdivisions)) {
    return (
      <div className="screen screen--center">
        <p className="panel waiting">
          {needsSub && !subdivisions ? 'Loading states & provinces…' : 'Loading cities…'}
        </p>
      </div>
    )
  }

  return (
    <LearnPlayReady
      target={target}
      cities={cities ?? undefined}
      subdivisions={subdivisions ?? undefined}
      onHub={onHub}
    />
  )
}

function LearnPlayReady({
  target,
  cities,
  subdivisions,
  onHub,
}: LearnPlayProps & {
  cities: CityIndex | undefined
  subdivisions: Partial<Record<SubPackId, SubdivisionPack>> | undefined
}) {
  const { geo, profile } = useApp()
  const lesson = useMemo<Lesson | null>(
    () => buildCurriculum(geo).find((candidate) => candidate.id === target) ?? null,
    [geo, target],
  )
  const cityDeck = useMemo<CityDeck | null>(
    () => (cities ? (buildCityDecks(geo, cities).find((d) => d.id === target) ?? null) : null),
    [geo, cities, target],
  )
  const subPackId = parseSubLessonPack(target)
  const subPack = subPackId ? (subdivisions?.[subPackId] ?? null) : null
  const subLesson = useMemo<SubLesson | null>(
    () => (subPack ? (buildSubLessons(subPack).find((l) => l.id === target) ?? null) : null),
    [subPack, target],
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
        : subLesson
          ? buildSubLessonQueue(subLesson, profile.places, seed)
          : cityDeck && cities
            ? buildCityDeckQueue(cityDeck, cities, profile.places, seed)
            : buildQueue({
                countries: profile.countries,
                places: profile.places,
                cities,
                subdivisions,
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
  const [studied, setStudied] = useState(lesson === null && cityDeck === null && subLesson === null)

  if (
    target !== 'review' &&
    target !== 'mixups' &&
    !examRegion &&
    !lesson &&
    !cityDeck &&
    !subLesson
  ) {
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
  if (subLesson && subPack && !studied) {
    return (
      <SubLessonStudy
        lesson={subLesson}
        pack={subPack}
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
      : (subLesson?.title ?? cityDeck?.title ?? lesson?.title ?? 'Review')
  const citiesOnly = setup.queue.every((item) => item.skill === 'city')
  const subOnly = setup.queue.every((item) => 'packId' in item)

  return (
    <RoundGame
      rules={learn}
      config={{ queue: setup.queue, title, exam: examRegion ? { region: examRegion } : undefined }}
      cities={cities}
      subdivisions={subdivisions}
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
          label: subOnly ? 'States & provinces' : citiesOnly ? 'Cities' : 'Countries',
          value: String(new Set(results.map((r) => r.targetId)).size),
        },
      ]}
      onChangeSetup={onHub}
      onHome={onHub}
    />
  )
}
