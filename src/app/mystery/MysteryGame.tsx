import { useEffect, useRef, useState } from 'react'
import { play, vibrate } from '../../audio/sound'
import type { LonLat } from '../../geo/coords'
import { compassPoint } from '../../geo/distance'
import { LOCAL_PLAYER } from '../../game/core/types'
import {
  HINT_AFTER,
  HINT_COST,
  isSolved,
  mystery,
  MYSTERY_MAX_POINTS,
  mysteryScore,
  type MysteryConfig,
  type MysteryGuess,
} from '../../game/modes/mystery'
import type { RecordedSession } from '../../game/profile/record'
import { frameCountry, randomOverview } from '../../globe/framing'
import { TARGET_PAINT, type GlobeScene } from '../../globe/scene'
import { formatDistance } from '../../screens/format'
import { AnswerInput } from '../../ui/AnswerInput'
import { FactCard } from '../../ui/FactCard'
import { HowToPlay } from '../../ui/HowToPlay'
import { Hud } from '../../ui/Hud'
import { ResultCard } from '../../ui/ResultCard'
import { ResultsScreen } from '../../ui/ResultsScreen'
import { useApp } from '../AppContext'
import { useChallenge } from '../challenge'
import type { DailyGame } from '../daily/dailyGame'
import { celebrates } from '../celebrate'
import { useStagePicking, useStageScene } from '../globeStage'
import { modeInfo } from '../modes'
import { useTestHook } from '../testHook'
import { useGameStage } from '../useGameStage'
import { useIntro } from '../useIntro'
import { useLocalSession } from '../useLocalSession'
import { heatOf, heatPaint } from './heat'

const LIST_SHOWN = 5

interface MysteryGameProps {
  config: MysteryConfig
  /** A fixed seed: daily puzzles and challenge links. */
  seed?: string
  /** Set when this game is one of today's daily puzzles: one attempt, then share. */
  daily?: DailyGame
  onChangeSetup: () => void
  onHome: () => void
}

export function MysteryGame({ config, seed, daily, onChangeSetup, onHome }: MysteryGameProps) {
  const app = useApp()
  const { geo, preferences } = app
  const stage = useGameStage()
  const intro = useIntro('mystery')
  const [recorded, setRecorded] = useState<RecordedSession | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const session = useLocalSession(
    mystery,
    geo,
    {
      onOutcomes: app.recordOutcomes,
      onFinish: (summary) => {
        const result = app.finishSession(daily ? { ...summary, daily: daily.record } : summary)
        setRecorded(result)
        if (celebrates(result)) play('best')
      },
    },
    { config, seed },
  )
  const state = session.state
  const finished = Boolean(state && state.endedAt !== null)

  // Zoomed out to start; at the end, fly to the mystery country.
  const shot = useRef<string | null>(null)
  useEffect(() => {
    if (!state) return
    const key = `${state.seed}:${finished}`
    if (shot.current === key) return
    shot.current = key
    stage.flyTo(
      finished
        ? frameCountry(geo.feature(state.targetId), geo.factsOf(state.targetId).label)
        : randomOverview(),
    )
  })

  const guess = (fields: { answerId?: string; pin?: LonLat }) => {
    if (!state || finished) return
    const next = session.send({
      type: 'submit',
      playerId: LOCAL_PLAYER,
      submission: { ...fields, at: Date.now() },
    })
    if (next === state || !next) {
      const id =
        fields.answerId ?? (fields.pin && geo.countries.countryAt(fields.pin)?.properties.id)
      setMessage(
        !id
          ? 'That’s the ocean: tap a country'
          : state.guesses.some((g) => g.countryId === id)
            ? `You already guessed ${geo.nameOf(id)}`
            : `${geo.nameOf(id)} is not one of the 197 countries in the game`,
      )
      return
    }
    setMessage(null)
    const last = next.guesses.at(-1)!
    if (isSolved(next)) {
      play('best')
      vibrate([12, 40, 12, 40, 12])
    } else {
      play(last.distanceKm === 0 ? 'streak' : last.distanceKm <= 1500 ? 'near' : 'pin')
    }
  }

  const playAgain = () => {
    setRecorded(null)
    setShowSummary(false)
    setMessage(null)
    session.start(config)
  }

  useStagePicking(state && !finished && !intro.open ? (pin) => guess({ pin }) : null)
  useStageScene(
    state
      ? mysteryScene(state.guesses, finished ? state.targetId : null)
      : { paints: [], pins: [], arcs: [] },
  )

  const challenge = useChallenge(daily ? undefined : state?.seed, state ? mysteryScore(state) : 0)

  useTestHook({
    snapshot: () => ({
      view: 'game',
      round: state?.guesses.length ?? null,
      phase: state ? (finished ? 'finished' : 'open') : null,
      targetId: state?.targetId ?? null,
      draftPin: null,
    }),
    placePin: (pin) => guess({ pin }),
    targetPoint: () => (state ? geo.factsOf(state.targetId).label : null),
  })

  if (!state) return null
  const nameOf = (id: string) => geo.nameOf(id)
  const units = preferences.units
  const score = mysteryScore(state)
  const sorted = [...state.guesses].sort((a, b) => a.distanceKm - b.distanceKm)
  const closest = sorted.find((g) => g.countryId !== state.targetId)

  if (showSummary && recorded) {
    return (
      <ResultsScreen
        title="Mystery Country"
        subtitle={`It was ${nameOf(state.targetId)}`}
        score={score}
        maxScore={MYSTERY_MAX_POINTS}
        recorded={recorded}
        nameOf={nameOf}
        challenge={challenge}
        tiles={[
          { label: 'Guesses', value: String(state.guesses.length) },
          { label: 'Hint', value: state.hintUsed ? 'Used' : 'No' },
          { label: 'Result', value: state.gaveUp ? 'Gave up' : 'Found' },
        ]}
        rows={state.guesses.map((g, index) => ({
          key: g.countryId,
          label: nameOf(g.countryId),
          detail:
            g.countryId === state.targetId
              ? 'Found it'
              : `${formatDistance(g.distanceKm, units)} ${compassPoint(g.bearing)}`,
          points: g.countryId === state.targetId ? score : 0,
          tone: g.countryId === state.targetId ? 'perfect' : index === 0 ? 'miss' : toneOf(g),
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
      <Hud
        mode="Mystery Country"
        progress={`${state.guesses.length} ${state.guesses.length === 1 ? 'guess' : 'guesses'}`}
        onHelp={intro.show}
        onQuit={onHome}
      />

      <div className="prompt" aria-live="polite">
        <h1 className="prompt__text prompt__text--small">
          {finished ? (
            <>
              It was <strong>{nameOf(state.targetId)}</strong>
            </>
          ) : (
            'Find the mystery country'
          )}
        </h1>
        {!finished && (
          <p className="prompt__sub">
            {closest
              ? `Closest: ${nameOf(closest.countryId)}, ${closest.distanceKm === 0 ? 'a neighbour' : formatDistance(closest.distanceKm, units)}`
              : 'Guess any country to start'}
            {state.hintUsed && ` · It's in ${geo.feature(state.targetId).properties.region}`}
          </p>
        )}
      </div>

      <div className="action-bar">
        {finished ? (
          <ResultCard
            grade={
              state.gaveUp
                ? { label: 'Gave up', tone: 'miss' }
                : { label: `${state.guesses.length} guesses`, tone: 'perfect' }
            }
            verdict={
              state.gaveUp ? (
                <>
                  It was <strong>{nameOf(state.targetId)}</strong>
                </>
              ) : (
                <>
                  Found <strong>{nameOf(state.targetId)}</strong>!
                </>
              )
            }
            detail={state.hintUsed ? `The hint counted as ${HINT_COST} guesses` : null}
            points={score}
            maxPoints={MYSTERY_MAX_POINTS}
            nextLabel="See results"
            onNext={() => setShowSummary(true)}
          >
            <FactCard geo={geo} id={state.targetId} units={units} />
          </ResultCard>
        ) : (
          <div className="panel answer-panel">
            {sorted.length > 0 && (
              <ol className="guess-list" aria-label="Your guesses, closest first">
                {sorted.slice(0, LIST_SHOWN).map((g) => (
                  <GuessRow key={g.countryId} guess={g} name={nameOf(g.countryId)} units={units} />
                ))}
              </ol>
            )}
            <AnswerInput
              key={state.guesses.length}
              matcher={geo.names}
              nameOf={nameOf}
              suggestions={config.difficulty !== 'hard'}
              placeholder="Type a country, or tap one"
              submitLabel="Guess"
              onSubmit={(answerId) => guess({ answerId })}
            />
            {message && <p className="answer__message">{message}</p>}
            <div className="answer-panel__actions">
              {!state.hintUsed && state.guesses.length >= HINT_AFTER && (
                <button
                  type="button"
                  className="button button--link"
                  onClick={() =>
                    session.send({ type: 'hint', playerId: LOCAL_PLAYER, at: Date.now() })
                  }
                >
                  Reveal the continent (+{HINT_COST} guesses)
                </button>
              )}
              {state.guesses.length > 0 && (
                <button
                  type="button"
                  className="button button--link"
                  onClick={() =>
                    session.send({ type: 'giveUp', playerId: LOCAL_PLAYER, at: Date.now() })
                  }
                >
                  Give up
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {intro.open && (
        <HowToPlay mode="Mystery Country" steps={modeInfo('mystery').howTo} onClose={intro.close} />
      )}
    </div>
  )
}

function GuessRow({
  guess,
  name,
  units,
}: {
  guess: MysteryGuess
  name: string
  units: 'km' | 'mi'
}) {
  const heat = heatOf(guess.distanceKm)
  return (
    <li className="guess-row">
      <span className="guess-row__dot" style={{ background: heat.color }} />
      <span className="guess-row__name">{name}</span>
      <span className="guess-row__distance">
        {guess.distanceKm === 0 ? heat.label : formatDistance(guess.distanceKm, units)}
      </span>
      <span
        className="guess-row__arrow"
        style={{ transform: `rotate(${guess.bearing}deg)` }}
        aria-label={`towards the ${compassPoint(guess.bearing)}`}
      >
        ↑
      </span>
    </li>
  )
}

function toneOf(guess: MysteryGuess) {
  if (guess.distanceKm === 0) return 'close' as const
  if (guess.distanceKm <= 1500) return 'good' as const
  return 'miss' as const
}

/** Each guess painted by how hot it is; the answer in gold once found. */
function mysteryScene(guesses: MysteryGuess[], revealedId: string | null): GlobeScene {
  const paints = guesses
    .filter((g) => g.countryId !== revealedId)
    .map((g) => heatPaint(g.countryId, g.distanceKm))
  return {
    paints: revealedId ? [...paints, { id: revealedId, ...TARGET_PAINT }] : paints,
    pins: [],
    arcs: [],
  }
}
