import { useMemo, useState } from 'react'
import { randomSeed } from '../../game/core/random'
import { buildCurriculum, regionOfExam } from '../../game/modes/curriculum'
import { EXAM_PASS_SHARE, learn } from '../../game/modes/learn'
import { buildQueue, examQueue, mixupQueue } from '../../game/modes/learnQueue'
import { nextDueAt } from '../../game/profile/review'
import type { HowToStep } from '../../ui/HowToPlay'
import { Sheet } from '../../ui/Sheet'
import { formatDue } from '../../screens/learn/format'
import { useApp } from '../AppContext'
import { RoundGame } from '../rounds/RoundGame'
import { LessonStudy } from './LessonStudy'

const HOW_TO: HowToStep[] = [
  {
    icon: 'compass',
    title: 'Learn, then remember',
    text: 'Each lesson shows a few countries, then asks you about them. Reviews bring back what you learned just before you would forget it.',
  },
  {
    icon: 'check',
    title: 'Misses come back',
    text: 'A question you get wrong is asked again at the end of the session.',
  },
  {
    icon: 'calendar',
    title: 'Come back tomorrow',
    text: 'Right answers move a country up a box, and the gaps between reviews grow from a day to weeks. That is what makes it stick.',
  },
]

interface LearnPlayProps {
  /** `review`, `mixups`, `exam-<region>`, or a lesson id. */
  target: string
  onHub: () => void
}

/** A lesson (study, then quiz) or a spaced review, built from the player's stats when opened. */
export function LearnPlay({ target, onHub }: LearnPlayProps) {
  const { geo, profile } = useApp()
  const lesson = useMemo(
    () => buildCurriculum(geo).find((candidate) => candidate.id === target) ?? null,
    [geo, target],
  )
  const examRegion = regionOfExam(target)
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
        : buildQueue({ countries: profile.countries, now, seed, lesson: lesson ?? undefined })
    return { now, queue, nextDue: nextDueAt(profile.countries, now) }
  })
  const [studied, setStudied] = useState(lesson === null)

  if (target !== 'review' && target !== 'mixups' && !examRegion && !lesson) {
    return (
      <Sheet title="That lesson was not found" onClose={onHub}>
        <p>The course may have changed. Pick a lesson from the list.</p>
      </Sheet>
    )
  }
  if (lesson && !studied) {
    return <LessonStudy lesson={lesson} onDone={() => setStudied(true)} onQuit={onHub} />
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
      : (lesson?.title ?? 'Review')
  return (
    <RoundGame
      rules={learn}
      config={{ queue: setup.queue, title, exam: examRegion ? { region: examRegion } : undefined }}
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
        { label: 'Countries', value: String(new Set(results.map((r) => r.targetId)).size) },
      ]}
      onChangeSetup={onHub}
      onHome={onHub}
    />
  )
}
