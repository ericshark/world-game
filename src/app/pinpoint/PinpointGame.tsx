import { useEffect, useRef, useState } from 'react'
import { play, vibrate } from '../../audio/sound'
import type { LonLat } from '../../geo/coords'
import type { CountryChallenge, RoundResult } from '../../game/core/types'
import { LOCAL_PLAYER } from '../../game/core/types'
import {
  DIFFICULTY_RULES,
  pinpoint,
  pinpointSkill,
  type PinpointConfig,
} from '../../game/modes/pinpoint'
import { skillStats } from '../../game/profile/profile'
import type { RecordedSession } from '../../game/profile/record'
import type { Units } from '../../game/profile/settings'
import type { GeoData } from '../../geo/facts'
import { frameCountry, framePair, randomOverview } from '../../globe/framing'
import { formatDistance } from '../../screens/format'
import { AnswerInput } from '../../ui/AnswerInput'
import { FactCard } from '../../ui/FactCard'
import { gradeOf } from '../../ui/grades'
import { HowToPlay } from '../../ui/HowToPlay'
import { Hud } from '../../ui/Hud'
import { Icon } from '../../ui/Icon'
import { ResultCard } from '../../ui/ResultCard'
import { ResultsScreen } from '../../ui/ResultsScreen'
import { TimerBar } from '../../ui/TimerBar'
import { useApp } from '../AppContext'
import { useStagePicking, useStageScene } from '../globeStage'
import { modeInfo } from '../modes'
import { bestStreak, trailingHits } from '../streaks'
import { useTestHook } from '../testHook'
import { useGameStage } from '../useGameStage'
import { useIntro } from '../useIntro'
import { useLocalSession } from '../useLocalSession'
import { describeConfig } from './describe'
import { pinpointScene } from './scene'

/** Auto-submits a timed round's pin this long before time runs out. */
const AUTO_SUBMIT_LEAD_MS = 150

interface PinpointGameProps {
  config: PinpointConfig
  onChangeSetup: () => void
  onHome: () => void
}

export function PinpointGame({ config, onChangeSetup, onHome }: PinpointGameProps) {
  const app = useApp()
  const { geo, preferences } = app
  const stage = useGameStage({ night: config.night })
  const [draftPin, setDraftPin] = useState<LonLat | null>(null)
  const draftRef = useRef<LonLat | null>(null)
  const [hintUsed, setHintUsed] = useState(false)
  const [recorded, setRecorded] = useState<RecordedSession | null>(null)
  const intro = useIntro('pinpoint')
  const [firstGame] = useState(() => app.profile.history.length === 0)
  const stats = () => skillStats(app.profile, pinpointSkill(config))

  const session = useLocalSession(
    pinpoint,
    geo,
    {
      onOutcomes: app.recordOutcomes,
      onFinish: (summary) => {
        const result = app.finishSession(summary)
        setRecorded(result)
        play(result.isPersonalBest && result.previousBest !== null ? 'best' : 'finish')
      },
    },
    { config, stats: stats() },
  )
  const state = session.state
  const rounds = state?.rounds
  const challenge = rounds && rounds.phase !== 'finished' ? rounds.challenges[rounds.round] : null
  const result = rounds?.phase === 'revealed' ? rounds.results[rounds.round][LOCAL_PLAYER] : null
  const pinChallenge = challenge?.kind === 'locate' || challenge?.kind === 'capital'
  const results = rounds?.results.map((round) => round[LOCAL_PLAYER]) ?? []
  const streak = trailingHits(results)

  const setPin = (pin: LonLat | null) => {
    draftRef.current = pin
    setDraftPin(pin)
  }

  const playAgain = () => {
    setRecorded(null)
    setPin(null)
    setHintUsed(false)
    session.start(config, { stats: stats() })
  }

  // The camera follows the game: a fresh view for each round, then framing the reveal.
  const cameraShot = useRef<string | null>(null)
  useEffect(() => {
    if (!state || state.rounds.phase === 'finished') return
    const shot = `${state.seed}:${state.rounds.round}:${state.rounds.phase}`
    if (cameraShot.current === shot) return
    cameraShot.current = shot
    const { round, phase, challenges, results: revealed } = state.rounds
    if (phase === 'open') {
      const upcoming = challenges[round]
      stage.flyTo(
        upcoming.kind === 'identify'
          ? frameCountry(geo.feature(upcoming.countryId), geo.factsOf(upcoming.countryId).label)
          : randomOverview(),
      )
    } else {
      const shown = revealed[round][LOCAL_PLAYER]
      if (shown.kind === 'locate' || shown.kind === 'capital') {
        stage.flyTo(framePair(shown.guess, shown.nearest))
      }
    }
  })

  const submit = (fields: { pin?: LonLat; answerId?: string }, at = Date.now()) => {
    const next = session.send({
      type: 'submit',
      playerId: LOCAL_PLAYER,
      submission: { ...fields, hintUsed, at },
    })
    const revealed = next?.rounds.results[next.rounds.round]?.[LOCAL_PLAYER]
    if (revealed) {
      announce(revealed, trailingHits(next.rounds.results.map((round) => round[LOCAL_PLAYER])))
    }
  }

  const confirmPin = () => {
    if (rounds?.phase === 'open' && pinChallenge && draftRef.current) {
      play('confirm')
      submit({ pin: draftRef.current })
    }
  }

  const dropAtCenter = () => {
    const center = stage.center()
    if (center && rounds?.phase === 'open' && pinChallenge) {
      setPin(center)
      play('pin')
    }
  }

  const next = () => {
    if (rounds?.phase !== 'revealed') return
    const after = session.send({ type: 'next', at: Date.now() })
    setPin(null)
    setHintUsed(false)
    if (after?.rounds.phase === 'open') play('next')
  }

  useStagePicking(
    rounds?.phase === 'open' && pinChallenge
      ? (point) => {
          setPin(point)
          play('pin')
          vibrate(8)
        }
      : null,
  )
  useStageScene(pinpointScene(state, draftPin, geo))

  // A timed round keeps whatever pin is down when time runs out. It is stamped no later than
  // the deadline: a busy main thread can fire this timer late, and the pin was down in time.
  const deadline = rounds?.phase === 'open' ? rounds.deadline : null
  useEffect(() => {
    if (deadline === null || !pinChallenge) return
    const timeout = window.setTimeout(
      () => {
        if (draftRef.current) submit({ pin: draftRef.current }, Math.min(Date.now(), deadline))
      },
      Math.max(0, deadline - Date.now() - AUTO_SUBMIT_LEAD_MS),
    )
    return () => window.clearTimeout(timeout)
  })

  // Enter confirms or moves on; Space drops the pin at the centre (keyboard play).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isFormControl(event.target)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        if (rounds?.phase === 'revealed') next()
        else confirmPin()
      } else if (event.key === ' ' && rounds?.phase === 'open' && pinChallenge) {
        event.preventDefault()
        dropAtCenter()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useTestHook({
    snapshot: () => ({
      view: 'game',
      round: rounds?.round ?? null,
      phase: rounds?.phase ?? null,
      targetId: challenge?.countryId ?? null,
      draftPin,
    }),
    placePin: (point) => {
      if (rounds?.phase === 'open' && pinChallenge) setPin(point)
    },
    targetPoint: () => {
      if (!challenge) return null
      const facts = geo.factsOf(challenge.countryId)
      return challenge.kind === 'capital' ? facts.capitals[0].at : facts.label
    },
  })

  if (!state || !rounds) return null
  const nameOf = (id: string) => geo.nameOf(id)
  const units = preferences.units
  const timeLimit = DIFFICULTY_RULES[config.difficulty].roundTimeMs

  if (rounds.phase === 'finished' && recorded) {
    const summary = pinpoint.summarize(state, LOCAL_PLAYER)
    const pinResults = results.filter((r) => r.kind === 'locate' || r.kind === 'capital')
    const averageKm =
      pinResults.reduce((sum, r) => sum + r.distanceKm, 0) / Math.max(1, pinResults.length)
    return (
      <ResultsScreen
        title="Pinpoint"
        subtitle={describeConfig(config)}
        score={summary.score}
        maxScore={summary.maxScore}
        previousBest={recorded.previousBest}
        isPersonalBest={recorded.isPersonalBest}
        tiles={[
          { label: 'Correct', value: `${results.filter((r) => r.hit).length} / ${results.length}` },
          { label: 'Best streak', value: String(bestStreak(results)) },
          pinResults.length > 0
            ? { label: 'Average distance', value: formatDistance(averageKm, units) }
            : { label: 'Hints used', value: String(results.filter(usedHint).length) },
        ]}
        rows={rounds.challenges.map((c, index) => ({
          key: `${c.countryId}-${index}`,
          label: roundLabel(c, nameOf, geo),
          detail: roundDetail(results[index], units),
          points: results[index].points,
          tone: gradeOf(results[index]).tone,
        }))}
        onPlayAgain={playAgain}
        onChangeSetup={onChangeSetup}
        onHome={onHome}
      />
    )
  }
  if (!challenge) return null

  const targetName = nameOf(challenge.countryId)
  const capital = geo.factsOf(challenge.countryId).capitals[0].name
  const coach = firstGame && rounds.round === 0

  return (
    <div className="screen screen--game">
      <Hud
        mode="Pinpoint"
        progress={`Round ${rounds.round + 1} / ${rounds.challenges.length}`}
        score={results.reduce((sum, r) => sum + r.points, 0)}
        streak={streak}
        onHelp={intro.show}
        onQuit={onHome}
      />

      <div className="prompt" aria-live="polite">
        {challenge.kind === 'identify' ? (
          <>
            <h1 className="prompt__text">Name this country</h1>
            {hintUsed && rounds.phase === 'open' && (
              <p className="prompt__sub">Starts with “{targetName[0]}”</p>
            )}
          </>
        ) : (
          <>
            <h1 className="prompt__text">
              Find{' '}
              <strong data-testid="target-name">
                {challenge.kind === 'capital' ? capital : targetName}
              </strong>
            </h1>
            {challenge.kind === 'capital' && config.difficulty !== 'hard' && (
              <p className="prompt__sub">capital of {targetName}</p>
            )}
          </>
        )}
        {timeLimit !== null && rounds.phase === 'open' && rounds.deadline !== null && (
          <TimerBar
            deadline={rounds.deadline}
            totalMs={timeLimit}
            onTick={(seconds) => seconds <= 5 && play('tick')}
          />
        )}
      </div>

      {preferences.placement === 'crosshair' && pinChallenge && rounds.phase === 'open' && (
        <div className="crosshair" aria-hidden="true">
          <Icon name="crosshair" size={36} />
        </div>
      )}

      <div className="action-bar">
        {result ? (
          <ResultCard
            grade={gradeOf(result)}
            verdict={verdictOf(result, challenge, nameOf, geo)}
            detail={detailOf(result, nameOf, units)}
            points={result.points}
            nextLabel={rounds.round + 1 >= rounds.challenges.length ? 'See results' : 'Next'}
            onNext={next}
          >
            <FactCard geo={geo} id={challenge.countryId} units={units} />
          </ResultCard>
        ) : challenge.kind === 'identify' ? (
          <div className="panel answer-panel">
            {challenge.choices ? (
              <div className="choice-grid">
                {challenge.choices.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="button button--choice"
                    onClick={() => submit({ answerId: id })}
                  >
                    {nameOf(id)}
                  </button>
                ))}
              </div>
            ) : (
              <AnswerInput
                key={rounds.round}
                matcher={geo.names}
                nameOf={nameOf}
                suggestions={config.difficulty !== 'hard'}
                placeholder="Country name"
                submitLabel="Answer"
                onSubmit={(id) => submit({ answerId: id })}
              />
            )}
            {!challenge.choices && !hintUsed && (
              <button
                type="button"
                className="button button--link"
                onClick={() => setHintUsed(true)}
              >
                Show first letter (half points)
              </button>
            )}
          </div>
        ) : (
          <div className="panel placing">
            <p className="placing__hint">
              {coach && !draftPin
                ? 'Drag to spin, scroll or pinch to zoom, then tap to drop your pin'
                : draftPin
                  ? 'Happy with your pin? You can still move it.'
                  : preferences.placement === 'crosshair'
                    ? 'Turn the globe until the crosshair is on target'
                    : 'Tap the globe to drop your pin'}
            </p>
            <div className="placing__actions">
              {preferences.placement === 'crosshair' && (
                <button type="button" className="button" onClick={dropAtCenter}>
                  <Icon name="crosshair" size={18} /> Drop pin
                </button>
              )}
              <button
                type="button"
                className="button button--primary"
                disabled={!draftPin}
                onClick={confirmPin}
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>

      {intro.open && (
        <HowToPlay mode="Pinpoint" steps={modeInfo('pinpoint').howTo} onClose={intro.close} />
      )}
    </div>
  )
}

function announce(result: RoundResult, streak: number) {
  const tone = gradeOf(result).tone
  if (tone === 'perfect') {
    play(streak >= 3 && streak % 3 === 0 ? 'streak' : 'hit')
    vibrate([12, 40, 12])
  } else if (tone === 'great' || tone === 'good') {
    play('near')
  } else {
    play('miss')
    vibrate(30)
  }
}

function verdictOf(
  result: RoundResult,
  challenge: CountryChallenge,
  nameOf: (id: string) => string,
  geo: GeoData,
) {
  const target = nameOf(result.targetId)
  switch (result.kind) {
    case 'missed':
      return (
        <>
          It was{' '}
          <strong>
            {challenge.kind === 'capital' ? geo.factsOf(result.targetId).capitals[0].name : target}
          </strong>
        </>
      )
    case 'identify':
      if (result.verdict === 'correct') {
        return (
          <>
            Yes, it's <strong>{target}</strong>
          </>
        )
      }
      return (
        <>
          It's <strong>{target}</strong>
          {result.verdict === 'neighbor'
            ? `: ${nameOf(result.answerId)} is next door`
            : `, not ${nameOf(result.answerId)}`}
        </>
      )
    case 'capital':
      return result.hit ? (
        <>
          Bullseye: <strong>{result.capitalName}</strong>
        </>
      ) : (
        <>
          <strong>{result.capitalName}</strong> was here
        </>
      )
    case 'locate':
      if (result.hit) {
        return (
          <>
            You found <strong>{target}</strong>
          </>
        )
      }
      return (
        <>
          You clicked{' '}
          <strong className="is-wrong">
            {result.clickedId ? nameOf(result.clickedId) : 'the ocean'}
          </strong>
        </>
      )
  }
}

function detailOf(result: RoundResult, nameOf: (id: string) => string, units: Units) {
  switch (result.kind) {
    case 'missed':
      return 'Time ran out before you answered'
    case 'identify':
      return result.hintUsed && result.verdict === 'correct' ? 'Half points for the hint' : null
    case 'capital': {
      const where = result.clickedId ? `in ${nameOf(result.clickedId)}` : 'in the ocean'
      return `${formatDistance(result.distanceKm, units)} away · your pin was ${where}`
    }
    case 'locate':
      if (result.hit) {
        return result.distanceKm > 0
          ? `Close enough: ${formatDistance(result.distanceKm, units)} from ${nameOf(result.targetId)}`
          : null
      }
      return `${formatDistance(result.distanceKm, units)} from ${nameOf(result.targetId)}`
  }
}

function roundLabel(challenge: CountryChallenge, nameOf: (id: string) => string, geo: GeoData) {
  const name = nameOf(challenge.countryId)
  return challenge.kind === 'capital'
    ? `${geo.factsOf(challenge.countryId).capitals[0].name}, ${name}`
    : name
}

function roundDetail(result: RoundResult, units: Units) {
  if ((result.kind === 'locate' || result.kind === 'capital') && !result.hit) {
    return formatDistance(result.distanceKm, units)
  }
  return gradeOf(result).label
}

function usedHint(result: RoundResult) {
  return result.kind === 'identify' && result.hintUsed
}

function isFormControl(target: EventTarget | null) {
  return (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}
