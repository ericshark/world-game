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
import type { RecordedSession } from '../../game/profile/record'
import { frameMany } from '../../globe/framing'
import { HowToPlay } from '../../ui/HowToPlay'
import { Hud } from '../../ui/Hud'
import { ResultCard } from '../../ui/ResultCard'
import { ResultsScreen } from '../../ui/ResultsScreen'
import { useApp } from '../AppContext'
import { useStagePicking, useStageScene } from '../globeStage'
import { modeInfo } from '../modes'
import { useTestHook } from '../testHook'
import { useGameStage } from '../useGameStage'
import { useIntro } from '../useIntro'
import { useLocalSession } from '../useLocalSession'
import { journeyScene } from './scene'

interface JourneyGameProps {
  config: JourneyConfig
  onChangeSetup: () => void
  onHome: () => void
}

export function JourneyGame({ config, onChangeSetup, onHome }: JourneyGameProps) {
  const app = useApp()
  const { geo } = app
  const stage = useGameStage()
  const intro = useIntro('journey')
  const [draftPin, setDraftPin] = useState<LonLat | null>(null)
  const [showConnections, setShowConnections] = useState(false)
  const [recorded, setRecorded] = useState<RecordedSession | null>(null)
  const [showSummary, setShowSummary] = useState(false)

  const session = useLocalSession(
    journey,
    geo,
    {
      onOutcomes: app.recordOutcomes,
      onFinish: (summary) => {
        const result = app.finishSession(summary)
        setRecorded(result)
        play(result.isPersonalBest && result.previousBest !== null ? 'best' : 'finish')
      },
    },
    { config },
  )
  const state = session.state
  const finished = Boolean(state && state.endedAt !== null)

  // Open on a view of the whole trip; after that the camera is yours.
  const framed = useRef<string | null>(null)
  useEffect(() => {
    if (!state || framed.current === state.seed) return
    framed.current = state.seed
    stage.flyTo(frameMany([state.from, state.to].map((id) => geo.factsOf(id).label)))
  })

  const move = () => {
    if (!state || finished || !draftPin) return
    const next = session.send({
      type: 'submit',
      playerId: LOCAL_PLAYER,
      submission: { pin: draftPin, at: Date.now() },
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
    setRecorded(null)
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
  useStageScene(
    state
      ? journeyScene(state, geo, { draftPin, showConnections })
      : { paints: [], pins: [], arcs: [] },
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLButtonElement) return
      if (event.key === 'Enter') {
        event.preventDefault()
        move()
      } else if (event.key === ' ' && !finished) {
        event.preventDefault()
        setDraftPin(stage.center())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

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
        previousBest={recorded.previousBest}
        isPersonalBest={recorded.isPersonalBest}
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
        onPlayAgain={playAgain}
        onChangeSetup={onChangeSetup}
        onHome={onHome}
      />
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
                <button
                  type="button"
                  className="button button--primary"
                  disabled={!draftPin}
                  onClick={move}
                >
                  Go
                </button>
              </div>
            </div>
            <div className="answer-panel__actions">
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
