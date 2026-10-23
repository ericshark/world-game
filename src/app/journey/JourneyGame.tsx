import { useEffect, useRef, useState } from 'react'
import { play, vibrate } from '../../audio/sound'
import type { LonLat } from '../../geo/coords'
import { LOCAL_PLAYER } from '../../game/core/types'
import { EXPEDITIONS } from '../../game/modes/expeditions'
import {
  HINT_COST,
  journey,
  JOURNEY_MAX_POINTS,
  journeyScore,
  journeyStars,
  visitsMade,
  type JourneyConfig,
  type JourneyState,
  type JourneyStep,
} from '../../game/modes/journey'
import { frameMany } from '../../globe/framing'
import { EMPTY_SCENE } from '../../globe/scene'
import { HowToPlay } from '../../ui/HowToPlay'
import { Hud } from '../../ui/Hud'
import { ResultCard } from '../../ui/ResultCard'
import { ResultsScreen } from '../../ui/ResultsScreen'
import { useGameKeys } from '../../ui/useGameKeys'
import { AnswerInput } from '../../ui/AnswerInput'
import { Crosshair } from '../Crosshair'
import { useApp } from '../AppContext'
import { useChallenge } from '../challenge'
import { useSaveDailyProgress, type DailyGame } from '../daily/dailyGame'
import { useStagePicking, useStageScene } from '../globeStage'
import { modeInfo } from '../modes'
import { useTestHook } from '../testHook'
import { useGameStage } from '../useGameStage'
import { useIntro } from '../useIntro'
import { useRecordedGame } from '../useRecordedGame'
import { useGameSession } from '../useGameSession'
import { journeyScene } from './scene'

interface JourneyGameProps {
  config: JourneyConfig
  /** A fixed seed: daily puzzles and challenge links. */
  seed?: string
  /** Set when this game is one of today's daily puzzles: one attempt, then share. */
  daily?: DailyGame
  onChangeSetup: () => void
  onHome: () => void
}

export function JourneyGame({ config, seed, daily, onChangeSetup, onHome }: JourneyGameProps) {
  const app = useApp()
  const { geo, preferences } = app
  const stage = useGameStage()
  const intro = useIntro('journey')
  const [draftPin, setDraftPin] = useState<LonLat | null>(null)
  const [showConnections, setShowConnections] = useState(false)
  const { recorded, record, clear: clearRecorded } = useRecordedGame({ daily })
  const [showSummary, setShowSummary] = useState(false)
  const [typing, setTyping] = useState(false)

  const session = useGameSession(
    journey,
    geo,
    {
      onOutcomes: app.recordOutcomes,
      onFinish: record,
    },
    { config, seed, resume: daily?.saved as JourneyState | undefined },
    daily?.remote,
  )
  const state = session.state
  useSaveDailyProgress(daily, state)
  const finished = Boolean(state && state.endedAt !== null)

  // Open on a view of the whole trip; after that the camera is yours.
  const framed = useRef<string | null>(null)
  useEffect(() => {
    if (!state || framed.current === state.seed) return
    framed.current = state.seed
    stage.flyTo(frameMany([state.from, state.to].map((id) => geo.factsOf(id).label)))
  })

  /** Travels to the country under the pin, or to one typed by name. */
  const move = async (
    fields: { pin?: LonLat; answerId?: string } = { pin: draftPin ?? undefined },
  ) => {
    if (!state || finished || (!fields.pin && !fields.answerId)) return
    const next = await session.send({
      type: 'submit',
      playerId: LOCAL_PLAYER,
      submission: { ...fields, at: Date.now() },
    })
    setDraftPin(null)
    if (!next || next === state) return
    setShowConnections(false)
    const step = next.steps.at(-1)!
    if (next.endedAt !== null) {
      vibrate([12, 40, 12])
    } else if (step.kind === 'misstep') {
      play('miss')
      vibrate(30)
    } else {
      play(step.kind === 'sea' ? 'near' : 'hit')
    }
  }

  const hint = () => {
    if (!state || finished || showConnections) return
    session.send({ type: 'hint', playerId: LOCAL_PLAYER, at: Date.now() })
    setShowConnections(true)
  }

  const playAgain = () => {
    clearRecorded()
    setShowSummary(false)
    setDraftPin(null)
    setShowConnections(false)
    session.start(config)
  }

  useStagePicking(
    state && !finished && !intro.open
      ? (point) => {
          setDraftPin(point)
          play('pin')
        }
      : null,
  )
  useStageScene(state ? journeyScene(state, geo, { draftPin, showConnections }) : EMPTY_SCENE)

  useGameKeys((event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      move()
    } else if (event.key === ' ' && !finished) {
      event.preventDefault()
      setDraftPin(stage.center())
    }
  })

  const challenge = useChallenge(daily ? undefined : state?.seed, state ? journeyScore(state) : 0)

  useTestHook({
    snapshot: () => ({
      view: 'game',
      round: state?.steps.length ?? null,
      phase: state ? (finished ? 'finished' : 'open') : null,
      targetId: state?.route.at(-1) ?? null,
      draftPin,
    }),
    placePin: setDraftPin,
    targetPoint: () => (state ? geo.factsOf(state.to).label : null),
  })

  if (!state) return null
  const nameOf = (id: string) => geo.nameOf(id)
  const expedition =
    config.kind === 'expedition' ? EXPEDITIONS.find((e) => e.id === config.expeditionId) : null
  const title = expedition?.title ?? 'Quick journey'
  const stars = journeyStars(state)
  const score = journeyScore(state)
  const lastStep = state.steps.at(-1)
  const current = state.route.at(-1)!

  if (showSummary && recorded) {
    return (
      <ResultsScreen
        title="World Journey"
        subtitle={`${title} · ${nameOf(state.from)} → ${nameOf(state.to)}`}
        score={score}
        maxScore={JOURNEY_MAX_POINTS}
        recorded={recorded}
        nameOf={nameOf}
        challenge={challenge}
        tiles={[
          { label: 'Stars', value: '★'.repeat(stars) || '—' },
          { label: 'Steps (par)', value: `${state.cost} (${state.par})` },
          {
            label: 'Missteps',
            value: String(state.steps.filter((s) => s.kind === 'misstep').length),
          },
        ]}
        rows={state.steps.map((step, index) => ({
          key: `${step.countryId}-${index}`,
          label: nameOf(step.countryId),
          detail: stepLabel(step),
          points: step.cost,
          tone: step.kind === 'misstep' ? 'miss' : step.kind === 'sea' ? 'good' : 'perfect',
        }))}
        onPlayAgain={daily ? undefined : playAgain}
        onChangeSetup={onChangeSetup}
        onHome={onHome}
      >
        {daily?.share(recorded)}
      </ResultsScreen>
    )
  }

  return (
    <div className="screen screen--game">
      <Hud mode="World Journey" progress={title} onHelp={intro.show} onQuit={onHome} />

      <div className="prompt" aria-live="polite">
        <h1 className="prompt__text prompt__text--small">
          {nameOf(state.from)} → <strong>{nameOf(state.to)}</strong>
        </h1>
        <p className="prompt__sub">
          Steps {state.cost} · Par {state.par}
          {expedition?.ruleText && ` · ${expedition.ruleText}`}
          {state.rules.visit &&
            ` (${Math.min(visitsMade(state), state.rules.visit.count)}/${state.rules.visit.count})`}
        </p>
      </div>

      <Crosshair active={!finished} />

      <div className="action-bar">
        {finished ? (
          <ResultCard
            grade={
              state.gaveUp
                ? { label: 'Gave up', tone: 'miss' }
                : { label: `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, tone: 'perfect' }
            }
            verdict={
              state.gaveUp ? (
                <>Journey abandoned in {nameOf(current)}</>
              ) : (
                <>
                  You reached <strong>{nameOf(state.to)}</strong>
                </>
              )
            }
            detail={state.gaveUp ? null : `${state.cost} steps; the best route takes ${state.par}`}
            points={score}
            maxPoints={JOURNEY_MAX_POINTS}
            nextLabel="See results"
            onNext={() => setShowSummary(true)}
          />
        ) : (
          <div className="panel journey-panel">
            <p className="journey-panel__status">
              You are in <strong>{nameOf(current)}</strong>
              {lastStep && (
                <span className={`step-note step-note--${lastStep.kind}`}>
                  {stepNote(lastStep, state, nameOf)}
                </span>
              )}
            </p>
            <div className="placing">
              <p className="placing__hint">
                {draftPin ? 'Travel there?' : 'Tap the next country on your way'}
              </p>
              <div className="placing__actions">
                {preferences.placement === 'crosshair' && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => setDraftPin(stage.center())}
                  >
                    Drop pin
                  </button>
                )}
                <button
                  type="button"
                  className="button button--primary"
                  disabled={!draftPin}
                  onClick={() => move()}
                >
                  Go
                </button>
              </div>
            </div>
            {typing && (
              <AnswerInput
                key={state.steps.length}
                matcher={geo.names}
                nameOf={nameOf}
                suggestions
                placeholder="Type the next country"
                submitLabel="Go"
                onSubmit={(answerId) => move({ answerId })}
              />
            )}
            <div className="answer-panel__actions">
              {!typing && (
                <button
                  type="button"
                  className="button button--link"
                  onClick={() => setTyping(true)}
                >
                  Type a country instead
                </button>
              )}
              <button
                type="button"
                className="button button--link"
                disabled={showConnections}
                onClick={hint}
              >
                Show connections (+{HINT_COST} step)
              </button>
              <button
                type="button"
                className="button button--link"
                onClick={() =>
                  session.send({ type: 'giveUp', playerId: LOCAL_PLAYER, at: Date.now() })
                }
              >
                Give up
              </button>
            </div>
          </div>
        )}
      </div>

      {intro.open && (
        <HowToPlay mode="World Journey" steps={modeInfo('journey').howTo} onClose={intro.close} />
      )}
    </div>
  )
}

function stepLabel(step: JourneyStep) {
  if (step.kind === 'misstep') return step.reason === 'forbidden' ? 'Off limits' : 'Not connected'
  return step.kind === 'sea' ? 'By sea' : 'By land'
}

function stepNote(step: JourneyStep, state: JourneyState, nameOf: (id: string) => string) {
  const from = nameOf(state.route.at(-1)!)
  if (step.kind === 'misstep') {
    return step.reason === 'forbidden'
      ? ` · ${nameOf(step.countryId)} is off limits (+1)`
      : ` · ${nameOf(step.countryId)} isn't connected to ${from} (+1)`
  }
  return step.kind === 'sea' ? ' · arrived by sea (+2)' : ' · crossed the border (+1)'
}
