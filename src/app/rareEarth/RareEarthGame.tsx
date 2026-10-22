import { useEffect, useRef, useState } from 'react'
import { play, vibrate } from '../../audio/sound'
import type { LonLat } from '../../geo/coords'
import { explainAnswer, rarities, rarityTier, type Category } from '../../game/core/categories'
import { LOCAL_PLAYER, type CategoryResult, type RoundResult } from '../../game/core/types'
import {
  rareEarth,
  RARE_EARTH_HARD_ROUND_MS,
  usedAnswers,
  type RareEarthConfig,
} from '../../game/modes/rareEarth'
import type { RecordedSession } from '../../game/profile/record'
import type { GeoData } from '../../geo/facts'
import { frameMany, randomOverview } from '../../globe/framing'
import { formatDistance } from '../../screens/format'
import { AnswerInput } from '../../ui/AnswerInput'
import type { Grade, Tone } from '../../ui/grades'
import { HowToPlay } from '../../ui/HowToPlay'
import { Hud } from '../../ui/Hud'
import { Icon } from '../../ui/Icon'
import { ResultCard } from '../../ui/ResultCard'
import { ResultsScreen } from '../../ui/ResultsScreen'
import { TimerBar } from '../../ui/TimerBar'
import { useApp } from '../AppContext'
import { celebrates } from '../celebrate'
import { useStagePicking, useStageScene } from '../globeStage'
import { modeInfo } from '../modes'
import { useTestHook } from '../testHook'
import { useGameStage } from '../useGameStage'
import { useIntro } from '../useIntro'
import { useLocalSession } from '../useLocalSession'
import { answerPoints, rareEarthScene, TIER_COLORS } from './scene'

const TIER_TONE: Record<ReturnType<typeof rarityTier>, Tone> = {
  Common: 'good',
  Uncommon: 'great',
  Rare: 'perfect',
  Exotic: 'perfect',
  Legendary: 'perfect',
}
const RAREST_SHOWN = 3

interface RareEarthGameProps {
  config: RareEarthConfig
  onChangeSetup: () => void
  onHome: () => void
}

export function RareEarthGame({ config, onChangeSetup, onHome }: RareEarthGameProps) {
  const app = useApp()
  const { geo, preferences } = app
  const stage = useGameStage()
  const intro = useIntro('rare-earth')
  const [answerId, setAnswerId] = useState<string | null>(null)
  const [draftPin, setDraftPin] = useState<LonLat | null>(null)
  const [recorded, setRecorded] = useState<RecordedSession | null>(null)

  const session = useLocalSession(
    rareEarth,
    geo,
    {
      onOutcomes: app.recordOutcomes,
      onFinish: (summary) => {
        const result = app.finishSession(summary)
        setRecorded(result)
        play(celebrates(result) ? 'best' : 'finish')
      },
    },
    { config },
  )
  const state = session.state
  const rounds = state?.rounds
  const open = rounds?.phase === 'open'
  const category =
    rounds && rounds.phase !== 'finished' ? rounds.challenges[rounds.round].category : null
  const result = rounds?.phase === 'revealed' ? rounds.results[rounds.round][LOCAL_PLAYER] : null

  // A fresh overview for each question; at the reveal, pull back to show every valid answer.
  const shot = useRef<string | null>(null)
  useEffect(() => {
    if (!state || state.rounds.phase === 'finished') return
    const key = `${state.seed}:${state.rounds.round}:${state.rounds.phase}`
    if (shot.current === key) return
    shot.current = key
    stage.flyTo(
      state.rounds.phase === 'open' ? randomOverview() : frameMany(answerPoints(state, geo)),
    )
  })

  const confirm = () => {
    if (!open || !answerId || !draftPin) return
    play('confirm')
    const next = session.send({
      type: 'submit',
      playerId: LOCAL_PLAYER,
      submission: { answerId, pin: draftPin, at: Date.now() },
    })
    const revealed = next?.rounds.results[next.rounds.round]?.[LOCAL_PLAYER]
    if (revealed?.kind === 'category' && revealed.valid) {
      play(revealed.rarity >= 0.55 ? 'streak' : 'hit')
      vibrate([12, 40, 12])
    } else if (revealed) {
      play('miss')
      vibrate(30)
    }
  }

  const next = () => {
    if (rounds?.phase !== 'revealed') return
    const after = session.send({ type: 'next', at: Date.now() })
    setAnswerId(null)
    setDraftPin(null)
    if (after?.rounds.phase === 'open') play('next')
  }

  const playAgain = () => {
    setRecorded(null)
    setAnswerId(null)
    setDraftPin(null)
    session.start(config)
  }

  useStagePicking(
    open && answerId && !intro.open
      ? (point) => {
          setDraftPin(point)
          play('pin')
        }
      : null,
  )
  useStageScene(rareEarthScene(state, draftPin, geo))

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLInputElement) return
      if (event.target instanceof HTMLButtonElement) return
      if (event.key === 'Enter') {
        event.preventDefault()
        if (rounds?.phase === 'revealed') next()
        else confirm()
      } else if (event.key === ' ' && open && answerId) {
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
      round: rounds?.round ?? null,
      phase: rounds?.phase ?? null,
      targetId: answerId,
      draftPin,
    }),
    placePin: (point) => {
      if (open && answerId) setDraftPin(point)
    },
    targetPoint: () => (answerId ? geo.factsOf(answerId).label : null),
  })

  if (!state || !rounds) return null
  const nameOf = (id: string) => geo.nameOf(id)
  const used = new Set(usedAnswers(rounds, LOCAL_PLAYER))
  const results = rounds.results.map((round) => round[LOCAL_PLAYER])

  if (rounds.phase === 'finished' && recorded) {
    const valid = results.filter((r) => r.kind === 'category' && r.valid) as CategoryResult[]
    const rarest = valid.reduce<CategoryResult | null>(
      (best, r) => (!best || r.rarity > best.rarity ? r : best),
      null,
    )
    return (
      <ResultsScreen
        title="Rare Earth"
        subtitle={config.difficulty === 'hard' ? 'Hard' : 'Normal'}
        score={results.reduce((sum, r) => sum + r.points, 0)}
        maxScore={rounds.challenges.length * 1000}
        recorded={recorded}
        nameOf={nameOf}
        tiles={[
          { label: 'Valid answers', value: `${valid.length} / ${results.length}` },
          { label: 'Rarest answer', value: rarest ? nameOf(rarest.answerId) : '—' },
          {
            label: 'Best tier',
            value: rarest ? rarityTier(rarest.rarity) : '—',
          },
        ]}
        rows={rounds.challenges.map((c, index) => ({
          key: c.category.id,
          label: c.category.prompt.replace(/^Name /, ''),
          detail: rowDetail(results[index], nameOf),
          points: results[index].points,
          tone: gradeOf(results[index]).tone,
        }))}
        onPlayAgain={playAgain}
        onChangeSetup={onChangeSetup}
        onHome={onHome}
      />
    )
  }
  if (!category) return null

  return (
    <div className="screen screen--game">
      <Hud
        mode="Rare Earth"
        progress={`Round ${rounds.round + 1} / ${rounds.challenges.length}`}
        score={results.reduce((sum, r) => sum + r.points, 0)}
        onHelp={intro.show}
        onQuit={onHome}
      />

      <div className="prompt prompt--category" aria-live="polite">
        <p className="prompt__eyebrow">
          <Icon name="gem" size={16} /> Think rare
        </p>
        <h1 className="prompt__text prompt__text--small">{category.prompt}</h1>
        {open && answerId && (
          <p className="prompt__sub">
            Now find <strong>{nameOf(answerId)}</strong> on the globe
          </p>
        )}
        {open && config.difficulty === 'hard' && rounds.deadline !== null && (
          <TimerBar
            deadline={rounds.deadline}
            totalMs={RARE_EARTH_HARD_ROUND_MS}
            onTick={(seconds) => seconds <= 5 && play('tick')}
          />
        )}
      </div>

      <div className="action-bar">
        {result ? (
          <ResultCard
            grade={gradeOf(result)}
            verdict={verdictOf(result, category, geo)}
            detail={detailOf(result, preferences.units)}
            points={result.points}
            nextLabel={rounds.round + 1 >= rounds.challenges.length ? 'See results' : 'Next'}
            onNext={next}
          >
            <AnswerSpread category={category} geo={geo} />
          </ResultCard>
        ) : !answerId ? (
          <div className="panel answer-panel">
            <AnswerInput
              key={rounds.round}
              matcher={geo.names}
              nameOf={nameOf}
              suggestions={config.difficulty !== 'hard'}
              placeholder="Name a country"
              submitLabel="Next"
              onSubmit={(id) => {
                setAnswerId(id)
                play('pin')
              }}
              unavailable={{ ids: used, reason: 'already used this game' }}
            />
            <p className="answer-panel__hint">
              The rarer the answer, the more it is worth. You'll then place it on the globe.
            </p>
          </div>
        ) : (
          <div className="panel placing">
            <p className="placing__hint">
              {draftPin ? `Is that ${nameOf(answerId)}?` : `Tap ${nameOf(answerId)} on the globe`}
            </p>
            <div className="placing__actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  setAnswerId(null)
                  setDraftPin(null)
                }}
              >
                Change answer
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={!draftPin}
                onClick={confirm}
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>

      {intro.open && (
        <HowToPlay mode="Rare Earth" steps={modeInfo('rare-earth').howTo} onClose={intro.close} />
      )}
    </div>
  )
}

/** The rarity legend plus the rarest answers you could have given. */
function AnswerSpread({ category, geo }: { category: Category; geo: GeoData }) {
  const ranked = [...rarities(category, geo)].sort((a, b) => b[1] - a[1])
  const valid = category.valid.length + category.lenient.length
  return (
    <div className="spread">
      <p className="spread__line">
        {valid} accepted answers · rarest:{' '}
        {ranked
          .slice(0, RAREST_SHOWN)
          .map(([id]) => geo.nameOf(id))
          .join(', ')}
      </p>
      <ul className="spread__legend" aria-label="Rarity colours on the globe">
        {Object.entries(TIER_COLORS).map(([tier, color]) => (
          <li key={tier}>
            <span style={{ background: color }} />
            {tier}
          </li>
        ))}
      </ul>
    </div>
  )
}

function gradeOf(result: RoundResult): Grade {
  if (result.kind !== 'category') return { label: "Time's up", tone: 'miss' }
  if (result.reused) return { label: 'Already used', tone: 'miss' }
  if (!result.valid) return { label: 'Not valid', tone: 'miss' }
  const tier = rarityTier(result.rarity)
  return { label: tier, tone: TIER_TONE[tier] }
}

function verdictOf(result: RoundResult, category: Category, geo: GeoData) {
  if (result.kind !== 'category') return <>Time ran out before you answered</>
  const name = geo.nameOf(result.answerId)
  if (result.reused) {
    return (
      <>
        You already used <strong className="is-wrong">{name}</strong> this game
      </>
    )
  }
  if (!result.valid) {
    return <span className="is-wrong-text">{explainAnswer(category, result.answerId, geo)}</span>
  }
  return (
    <>
      <strong>{name}</strong> is {/^[AEIOU]/.test(rarityTier(result.rarity)) ? 'an' : 'a'}{' '}
      {rarityTier(result.rarity).toLowerCase()} answer
    </>
  )
}

function detailOf(result: RoundResult, units: 'km' | 'mi') {
  if (result.kind !== 'category' || !result.valid) return null
  const placed =
    result.distanceKm > 0
      ? `placed ${formatDistance(result.distanceKm, units)} off`
      : 'placed perfectly'
  return `${result.rarityPoints} for rarity · ${placed}`
}

function rowDetail(result: RoundResult, nameOf: (id: string) => string) {
  if (result.kind !== 'category') return "Time's up"
  return `${nameOf(result.answerId)} · ${gradeOf(result).label}`
}
