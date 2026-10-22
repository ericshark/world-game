import { useEffect, useRef, useState, type ReactNode } from 'react'
import { play, vibrate } from '../../audio/sound'
import type { LonLat } from '../../geo/coords'
import type { ModeRules } from '../../game/core/mode'
import type { RoundsState } from '../../game/core/rounds'
import {
  LOCAL_PLAYER,
  type Challenge,
  type RoundResult,
  type SessionSummary,
} from '../../game/core/types'
import type { RecordedSession } from '../../game/profile/record'
import type { Units } from '../../game/profile/settings'
import type { StatsByCountry } from '../../game/profile/stats'
import { frameCountry, frameMany, framePair, randomOverview } from '../../globe/framing'
import { FactCard } from '../../ui/FactCard'
import { gradeOf } from '../../ui/grades'
import { HowToPlay, type HowToStep } from '../../ui/HowToPlay'
import { Hud } from '../../ui/Hud'
import { Icon } from '../../ui/Icon'
import { ResultCard } from '../../ui/ResultCard'
import { ResultsScreen } from '../../ui/ResultsScreen'
import { TimerBar } from '../../ui/TimerBar'
import { useApp } from '../AppContext'
import { celebrates } from '../celebrate'
import { useChallenge } from '../challenge'
import { useStagePicking, useStageScene } from '../globeStage'
import { trailingHits } from '../streaks'
import { useTestHook } from '../testHook'
import { useGameStage } from '../useGameStage'
import { useIntro } from '../useIntro'
import { useLocalSession } from '../useLocalSession'
import { Prompt } from './Prompt'
import { RoundInput } from './RoundInput'
import { roundScene } from './scene'
import { AnswerSpread } from './AnswerSpread'
import { detailOf, roundRow, verdictOf } from './text'

/** Auto-submits a timed round's pin this long before time runs out. */
const AUTO_SUBMIT_LEAD_MS = 150

/** Any mode that plays as a sequence of rounds. */
export interface RoundModeState {
  seed: string
  rounds: RoundsState<Challenge>
}

export interface RoundGameProps<Config, State extends RoundModeState> {
  rules: ModeRules<Config, State>
  config: Config
  /** Shown in the HUD and on the results screen. */
  mode: string
  subtitle: string
  /** Remembers whether the "How to play" card has been seen. */
  introKey: string
  howTo: HowToStep[]
  night?: boolean
  roundTimeMs: number | null
  /** Offer country names while typing. */
  suggestions: boolean
  /** Hard mode asks for a capital without saying whose it is. */
  hideCapitalCountry?: boolean
  /** The player's stats, for practice modes. */
  stats?: StatsByCountry
  /** A fixed seed: daily puzzles and challenge links. */
  seed?: string
  /** Adjusts the summary before it is recorded (e.g. marks a daily puzzle). */
  decorate?: (summary: SessionSummary) => SessionSummary
  tiles: (results: RoundResult[], units: Units) => { label: string; value: string }[]
  /** Daily puzzles cannot be replayed. */
  replayable?: boolean
  /** Extra content on the results screen, such as share buttons. */
  resultsExtra?: (state: State, recorded: RecordedSession) => ReactNode
  onChangeSetup: () => void
  onHome: () => void
}

/**
 * Plays any round-based mode: find a country or capital, name a highlighted country, or name a
 * country that fits a category and then find it. Pinpoint, Rare Earth and the Daily Five are
 * all this component with different rules.
 */
export function RoundGame<Config, State extends RoundModeState>(
  props: RoundGameProps<Config, State>,
) {
  const { rules, config, mode, roundTimeMs, suggestions, stats, seed } = props
  const app = useApp()
  const { geo, preferences } = app
  const stage = useGameStage({ night: props.night })
  const intro = useIntro(props.introKey)
  const [draftPin, setDraftPin] = useState<LonLat | null>(null)
  const draftRef = useRef<LonLat | null>(null)
  const [answerId, setAnswerId] = useState<string | null>(null)
  const [hintUsed, setHintUsed] = useState(false)
  const [recorded, setRecorded] = useState<RecordedSession | null>(null)
  const [firstGame] = useState(() => app.profile.history.length === 0)

  const session = useLocalSession(
    rules,
    geo,
    {
      onOutcomes: app.recordOutcomes,
      onFinish: (summary) => {
        const result = app.finishSession(props.decorate ? props.decorate(summary) : summary)
        setRecorded(result)
        play(celebrates(result) ? 'best' : 'finish')
      },
    },
    { config, stats, seed },
  )
  const state = session.state
  const rounds = state?.rounds
  const open = rounds?.phase === 'open'
  const challenge = rounds && rounds.phase !== 'finished' ? rounds.challenges[rounds.round] : null
  const result = rounds?.phase === 'revealed' ? rounds.results[rounds.round][LOCAL_PLAYER] : null
  const results = rounds?.results.map((round) => round[LOCAL_PLAYER]) ?? []
  // Rounds answered with a pin: finding a place, or placing a category answer once named.
  const placing =
    challenge?.kind === 'locate' ||
    challenge?.kind === 'capital' ||
    (challenge?.kind === 'category' && answerId !== null)

  const setPin = (pin: LonLat | null) => {
    draftRef.current = pin
    setDraftPin(pin)
  }

  const resetRound = () => {
    setPin(null)
    setAnswerId(null)
    setHintUsed(false)
  }

  const playAgain = () => {
    setRecorded(null)
    resetRound()
    session.start(config, { stats })
  }

  // The camera follows the game: a fresh view for each round, then framing the reveal.
  const cameraShot = useRef<string | null>(null)
  useEffect(() => {
    if (!state || state.rounds.phase === 'finished') return
    const { round, phase, challenges, results: revealed } = state.rounds
    const shot = `${state.seed}:${round}:${phase}`
    if (cameraShot.current === shot) return
    cameraShot.current = shot
    const current = challenges[round]
    if (phase === 'open') {
      stage.flyTo(
        current.kind === 'identify'
          ? frameCountry(geo.feature(current.countryId), geo.factsOf(current.countryId).label)
          : randomOverview(),
      )
      return
    }
    const shown = revealed[round][LOCAL_PLAYER]
    if (current.kind === 'category') {
      const answers = [...current.category.valid, ...current.category.lenient]
      stage.flyTo(frameMany(answers.map((id) => geo.factsOf(id).label)))
    } else if (shown.kind === 'locate' || shown.kind === 'capital') {
      stage.flyTo(framePair(shown.guess, shown.nearest))
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

  const pinFields = (pin: LonLat) =>
    challenge?.kind === 'category' && answerId ? { pin, answerId } : { pin }

  const confirmPin = () => {
    if (open && placing && draftRef.current) {
      play('confirm')
      submit(pinFields(draftRef.current))
    }
  }

  const dropAtCenter = () => {
    const center = stage.center()
    if (center && open && placing) {
      setPin(center)
      play('pin')
    }
  }

  const next = () => {
    if (rounds?.phase !== 'revealed') return
    const after = session.send({ type: 'next', at: Date.now() })
    resetRound()
    if (after?.rounds.phase === 'open') play('next')
  }

  useStagePicking(
    open && placing && !intro.open
      ? (point) => {
          setPin(point)
          play('pin')
          vibrate(8)
        }
      : null,
  )
  useStageScene(roundScene(rounds ?? null, draftPin, geo))

  // A timed round keeps whatever pin is down when time runs out. It is stamped no later than
  // the deadline: a busy main thread can fire this timer late, and the pin was down in time.
  const deadline = open ? rounds.deadline : null
  useEffect(() => {
    if (deadline === null || !placing) return
    const timeout = window.setTimeout(
      () => {
        if (draftRef.current) submit(pinFields(draftRef.current), Math.min(Date.now(), deadline))
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
      } else if (event.key === ' ' && open && placing) {
        event.preventDefault()
        dropAtCenter()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const score = results.reduce((sum, r) => sum + r.points, 0)
  const rematch = useChallenge(state?.seed, score)

  useTestHook({
    snapshot: () => ({
      view: 'game',
      round: rounds?.round ?? null,
      phase: rounds?.phase ?? null,
      targetId: challenge?.kind === 'category' ? answerId : (challenge?.countryId ?? null),
      draftPin,
    }),
    placePin: (point) => {
      if (open && placing) setPin(point)
    },
    targetPoint: () => {
      if (!challenge) return null
      if (challenge.kind === 'category') return answerId ? geo.factsOf(answerId).label : null
      const facts = geo.factsOf(challenge.countryId)
      return challenge.kind === 'capital' ? facts.capitals[0].at : facts.label
    },
  })

  if (!state || !rounds) return null
  const units = preferences.units

  if (rounds.phase === 'finished' && recorded) {
    return (
      <ResultsScreen
        title={mode}
        subtitle={props.subtitle}
        score={score}
        maxScore={rounds.challenges.length * 1000}
        recorded={recorded}
        nameOf={(id) => geo.nameOf(id)}
        challenge={rematch}
        tiles={props.tiles(results, units)}
        rows={rounds.challenges.map((c, index) => ({
          key: `${index}`,
          ...roundRow(c, results[index], geo, units),
          points: results[index].points,
          tone: gradeOf(results[index]).tone,
        }))}
        onPlayAgain={props.replayable === false ? undefined : playAgain}
        onChangeSetup={props.onChangeSetup}
        onHome={props.onHome}
      >
        {props.resultsExtra?.(state, recorded)}
      </ResultsScreen>
    )
  }
  if (!challenge) return null

  const used = new Set(results.flatMap((r) => (r.kind === 'category' ? [r.answerId] : [])))
  const timer = roundTimeMs !== null && open && rounds.deadline !== null && (
    <TimerBar
      deadline={rounds.deadline}
      totalMs={roundTimeMs}
      onTick={(seconds) => seconds <= 5 && play('tick')}
    />
  )

  return (
    <div className="screen screen--game">
      <Hud
        mode={mode}
        progress={`Round ${rounds.round + 1} / ${rounds.challenges.length}`}
        score={score}
        streak={trailingHits(results)}
        onHelp={intro.show}
        onQuit={props.onHome}
      />

      <div
        className={`prompt${challenge.kind === 'category' ? ' prompt--category' : ''}`}
        aria-live="polite"
      >
        <Prompt
          challenge={challenge}
          answerName={answerId ? geo.nameOf(answerId) : null}
          hintLetter={
            hintUsed && open && challenge.kind === 'identify'
              ? geo.nameOf(challenge.countryId)[0]
              : null
          }
          showCapitalCountry={!props.hideCapitalCountry}
          nameOf={(id) => geo.nameOf(id)}
          capitalOf={(id) => geo.factsOf(id).capitals[0].name}
          open={open}
        />
        {timer}
      </div>

      {preferences.placement === 'crosshair' && placing && open && (
        <div className="crosshair" aria-hidden="true">
          <Icon name="crosshair" size={36} />
        </div>
      )}

      <div className="action-bar">
        {result ? (
          <ResultCard
            grade={gradeOf(result)}
            verdict={verdictOf(result, challenge, geo)}
            detail={detailOf(result, geo, units)}
            points={result.points}
            nextLabel={rounds.round + 1 >= rounds.challenges.length ? 'See results' : 'Next'}
            onNext={next}
          >
            {challenge.kind === 'category' ? (
              <AnswerSpread category={challenge.category} geo={geo} />
            ) : (
              <FactCard geo={geo} id={challenge.countryId} units={units} />
            )}
          </ResultCard>
        ) : (
          <RoundInput
            challenge={challenge}
            round={rounds.round}
            answerId={answerId}
            hasPin={draftPin !== null}
            hintUsed={hintUsed}
            suggestions={suggestions}
            usedAnswers={used}
            coach={firstGame && rounds.round === 0}
            onAnswer={(id) => {
              if (challenge.kind === 'identify') submit({ answerId: id })
              else {
                setAnswerId(id)
                play('pin')
              }
            }}
            onHint={() => setHintUsed(true)}
            onChangeAnswer={resetRound}
            onDropAtCenter={dropAtCenter}
            onConfirm={confirmPin}
          />
        )}
      </div>

      {intro.open && <HowToPlay mode={mode} steps={props.howTo} onClose={intro.close} />}
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

function isFormControl(target: EventTarget | null) {
  return (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}
