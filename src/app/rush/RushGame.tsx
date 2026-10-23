import { useEffect, useRef, useState } from 'react'
import { play, vibrate } from '../../audio/sound'
import type { LonLat } from '../../geo/coords'
import { LOCAL_PLAYER } from '../../game/core/types'
import { rush, RUSH_START_MS, type RushAnswer, type RushConfig } from '../../game/modes/rush'
import { randomOverview } from '../../globe/framing'
import {
  CLICKED_PAINT,
  EMPTY_SCENE,
  TARGET_COLOR,
  TARGET_PAINT,
  type GlobeScene,
} from '../../globe/scene'
import { formatDistance, formatNumber } from '../../screens/format'
import type { Tone } from '../../ui/grades'
import { HowToPlay } from '../../ui/HowToPlay'
import { Hud } from '../../ui/Hud'
import { ResultsScreen } from '../../ui/ResultsScreen'
import { TimerBar } from '../../ui/TimerBar'
import { useGameKeys } from '../../ui/useGameKeys'
import { useApp } from '../AppContext'
import { Crosshair } from '../Crosshair'
import { useChallenge } from '../challenge'
import { useStagePicking, useStageScene } from '../globeStage'
import { modeInfo } from '../modes'
import { useTestHook } from '../testHook'
import { useGameStage } from '../useGameStage'
import { useIntro } from '../useIntro'
import { useRecordedGame } from '../useRecordedGame'
import { pinAndArc } from '../rounds/scene'
import { useLocalSession, usePauseWhile } from '../useLocalSession'

/** How long the last answer stays painted on the globe. */
const FLASH_MS = 1200

const OUTCOME_LABEL: Record<RushAnswer['outcome'], string> = {
  hit: 'Found',
  near: 'Close',
  miss: 'Miss',
  skip: 'Skipped',
}
const OUTCOME_TONE: Record<RushAnswer['outcome'], Tone> = {
  hit: 'perfect',
  near: 'close',
  miss: 'miss',
  skip: 'miss',
}

interface RushGameProps {
  config: RushConfig
  /** A fixed seed, for challenge links. */
  seed?: string
  onChangeSetup: () => void
  onHome: () => void
}

export function RushGame({ config, seed, onChangeSetup, onHome }: RushGameProps) {
  const app = useApp()
  const { geo, preferences } = app
  const stage = useGameStage()
  const { recorded, record, clear: clearRecorded } = useRecordedGame()
  const [flash, setFlash] = useState<RushAnswer | null>(null)
  const intro = useIntro('rush')

  const session = useLocalSession(
    rush,
    geo,
    {
      onOutcomes: app.recordOutcomes,
      onFinish: record,
    },
    // The clock should not run while the first-time intro is being read.
    intro.open ? undefined : { config, seed },
  )
  usePauseWhile(session, intro.open)
  const state = session.state
  const closeIntro = () => {
    intro.close()
    if (!session.state) session.start(config, { seed })
  }

  // Start zoomed out somewhere random; after that the camera is yours.
  const framed = useRef<string | null>(null)
  useEffect(() => {
    if (!state || framed.current === state.seed) return
    framed.current = state.seed
    stage.flyTo(randomOverview())
  })

  // The last answer is painted briefly, then cleared so it does not clutter the next search.
  useEffect(() => {
    if (!flash) return
    const timeout = window.setTimeout(() => setFlash(null), FLASH_MS)
    return () => window.clearTimeout(timeout)
  }, [flash])

  const answered = (next: typeof state) => {
    const last = next?.answers.at(-1)
    if (!next || !last || last === state?.answers.at(-1)) return
    setFlash(last)
    if (last.outcome === 'hit') {
      play(next.streak >= 3 && next.streak % 3 === 0 ? 'streak' : 'hit')
      vibrate(10)
    } else if (last.outcome === 'near') {
      play('near')
    } else {
      play('miss')
      vibrate(30)
    }
  }

  const answer = (pin: LonLat) => {
    if (!state || state.endedAt !== null) return
    answered(
      session.send({ type: 'submit', playerId: LOCAL_PLAYER, submission: { pin, at: Date.now() } }),
    )
  }

  const skip = () => {
    if (!state || state.endedAt !== null) return
    answered(session.send({ type: 'skip', playerId: LOCAL_PLAYER, at: Date.now() }))
  }

  const playAgain = () => {
    clearRecorded()
    setFlash(null)
    session.start(config)
  }

  const playing = Boolean(state && state.endedAt === null && !intro.open)
  useStagePicking(playing ? answer : null)
  useStageScene(flash ? flashScene(flash) : EMPTY_SCENE)

  useGameKeys((event) => {
    if (event.key === ' ' && playing) {
      event.preventDefault()
      const center = stage.center()
      if (center) answer(center)
    } else if (event.key.toLowerCase() === 's' && playing && !config.suddenDeath) {
      skip()
    }
  })

  const challenge = useChallenge(state?.seed, state?.score ?? 0)

  useTestHook({
    snapshot: () => ({
      view: 'game',
      round: state?.answers.length ?? null,
      phase: state ? (state.endedAt === null ? 'open' : 'finished') : null,
      targetId: state?.current ?? null,
      draftPin: null,
    }),
    placePin: answer,
    targetPoint: () => (state?.current ? geo.factsOf(state.current).label : null),
  })

  if (!state) {
    return intro.open ? (
      <HowToPlay mode="GeoRush" steps={modeInfo('rush').howTo} onClose={closeIntro} />
    ) : null
  }
  const nameOf = (id: string) => geo.nameOf(id)
  const found = state.answers.filter((a) => a.outcome === 'hit').length
  const title = config.suddenDeath ? 'GeoRush · Sudden death' : 'GeoRush'

  if (state.endedAt !== null && recorded) {
    return (
      <ResultsScreen
        title="GeoRush"
        subtitle={[config.region, config.suddenDeath ? 'Sudden death' : '60 seconds'].join(' · ')}
        score={state.score}
        maxScore={null}
        recorded={recorded}
        nameOf={nameOf}
        challenge={challenge}
        tiles={[
          { label: 'Found', value: String(found) },
          { label: 'Best streak', value: String(state.bestStreak) },
          {
            label: 'Accuracy',
            value: `${Math.round((found / Math.max(1, state.answers.length)) * 100)}%`,
          },
        ]}
        rows={state.answers.map((a, index) => ({
          key: `${a.targetId}-${index}`,
          label: nameOf(a.targetId),
          detail:
            a.outcome === 'miss' && a.distanceKm !== null
              ? formatDistance(a.distanceKm, preferences.units)
              : OUTCOME_LABEL[a.outcome],
          points: a.points,
          tone: OUTCOME_TONE[a.outcome],
        }))}
        onPlayAgain={playAgain}
        onChangeSetup={onChangeSetup}
        onHome={onHome}
      />
    )
  }

  const multiplier = state.answers.at(-1)?.outcome === 'hit' ? state.answers.at(-1)!.multiplier : 1
  return (
    <div className="screen screen--game">
      <Hud
        mode={title}
        progress={`${found} found`}
        score={state.score}
        streak={state.streak}
        onHelp={intro.show}
        onQuit={onHome}
      >
        {multiplier > 1 && <span className="hud__multiplier">×{multiplier}</span>}
      </Hud>

      <div className="prompt" aria-live="polite">
        <h1 className="prompt__text">
          Find <strong data-testid="target-name">{state.current && nameOf(state.current)}</strong>
        </h1>
        {state.clockEndsAt !== null && (
          <TimerBar
            deadline={state.clockEndsAt}
            totalMs={RUSH_START_MS}
            pausedAt={state.pausedAt}
            onTick={(seconds) => seconds <= 5 && play('tick')}
          />
        )}
        {flash && (
          <p key={flash.at} className={`rush-feedback rush-feedback--${flash.outcome}`}>
            {feedbackText(flash, nameOf)}
          </p>
        )}
      </div>

      <Crosshair active={playing} />

      <div className="action-bar">
        <div className="panel placing">
          <p className="placing__hint">
            {preferences.placement === 'crosshair'
              ? 'Line up the crosshair and press Answer (or Space)'
              : 'Tap the country to answer: no confirming, be quick!'}
          </p>
          <div className="placing__actions">
            {preferences.placement === 'crosshair' && (
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  const center = stage.center()
                  if (center) answer(center)
                }}
              >
                Answer
              </button>
            )}
            {!config.suddenDeath && (
              <button type="button" className="button" onClick={skip}>
                Skip (−2 s)
              </button>
            )}
          </div>
        </div>
      </div>

      {intro.open && (
        <HowToPlay mode="GeoRush" steps={modeInfo('rush').howTo} onClose={closeIntro} />
      )}
    </div>
  )
}

function feedbackText(answer: RushAnswer, nameOf: (id: string) => string): string {
  const time =
    answer.timeDeltaMs === 0
      ? ''
      : ` ${answer.timeDeltaMs > 0 ? '+' : '−'}${Math.abs(answer.timeDeltaMs) / 1000} s`
  switch (answer.outcome) {
    case 'hit':
      return `+${formatNumber(answer.points)}${answer.multiplier > 1 ? ` ×${answer.multiplier}` : ''}${time}`
    case 'near':
      return `Close! +${formatNumber(answer.points)} · that was ${nameOf(answer.clickedId ?? answer.targetId)}`
    case 'miss':
      return `${answer.clickedId ? nameOf(answer.clickedId) : 'Ocean'}${time}`
    case 'skip':
      return `Skipped ${nameOf(answer.targetId)}${time}`
  }
}

/** The answer just given: the target in gold, where you tapped in coral. */
function flashScene(answer: RushAnswer): GlobeScene {
  const clicked =
    answer.clickedId && answer.clickedId !== answer.targetId
      ? [{ id: answer.clickedId, ...CLICKED_PAINT }]
      : []
  const missed = answer.outcome !== 'hit'
  return {
    paints: [...clicked, { id: answer.targetId, ...TARGET_PAINT }],
    ...(answer.guess && answer.nearest
      ? pinAndArc(answer.guess, answer.nearest, missed)
      : { pins: [], arcs: [] }),
    pulses: missed ? [{ id: answer.targetId, color: TARGET_COLOR }] : [],
  }
}
