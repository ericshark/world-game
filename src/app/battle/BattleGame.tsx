import { useEffect, useRef, useState } from 'react'
import { play, vibrate } from '../../audio/sound'
import type { LonLat } from '../../geo/coords'
import type { RoundResult, Submission } from '../../game/core/types'
import {
  BATTLE_REVEAL_MS,
  BATTLE_ROUND_MS,
  isWinner,
  standings,
  START_HP,
  START_LIVES,
  totalPoints,
  type BattleState,
} from '../../game/modes/battle'
import type { RecordedSession } from '../../game/profile/record'
import { frameCountry, frameMany, randomOverview } from '../../globe/framing'
import { formatDistance, formatNumber } from '../../screens/format'
import { gradeOf } from '../../ui/grades'
import { HowToPlay } from '../../ui/HowToPlay'
import { Hud } from '../../ui/Hud'
import { Icon } from '../../ui/Icon'
import { ResultsScreen } from '../../ui/ResultsScreen'
import { TimerBar } from '../../ui/TimerBar'
import { useGameKeys } from '../../ui/useGameKeys'
import { useApp } from '../AppContext'
import { Crosshair } from '../Crosshair'
import { useStagePicking, useStageScene } from '../globeStage'
import { modeInfo } from '../modes'
import { Prompt } from '../rounds/Prompt'
import { RoundInput } from '../rounds/RoundInput'
import { useTestHook } from '../testHook'
import { useGameStage } from '../useGameStage'
import { useIntro } from '../useIntro'
import { battleScene } from './scene'
import { FORMAT_LABELS } from './setup'

/**
 * Whoever runs the game (this browser against bots, or a server for online rooms) as seen by
 * the screen: the latest view for this player, and a way to act.
 */
export interface MatchHost {
  view: BattleState | null
  me: string
  /** Server time minus local time, so deadlines count down correctly. */
  clockOffset: number
  submit(fields: Omit<Submission, 'at'>): void
  ready(): void
}

interface BattleGameProps {
  host: MatchHost
  recorded: RecordedSession | null
  onPlayAgain?: () => void
  onHome: () => void
}

/** Your draft answer for a round; anything from an earlier round is ignored. */
interface Draft {
  round: number
  pin: LonLat | null
  answerId: string | null
  hintUsed: boolean
}

export function BattleGame({ host, recorded, onPlayAgain, onHome }: BattleGameProps) {
  const { geo } = useApp()
  const stage = useGameStage()
  const intro = useIntro('battle')
  const { view, me } = host
  const rounds = view?.rounds
  const [draftState, setDraft] = useState<Draft>({
    round: -1,
    pin: null,
    answerId: null,
    hintUsed: false,
  })
  const draft =
    rounds && draftState.round === rounds.round
      ? draftState
      : { round: rounds?.round ?? -1, pin: null, answerId: null, hintUsed: false }
  const updateDraft = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })

  const challenge = rounds && rounds.phase !== 'finished' ? rounds.challenges[rounds.round] : null
  const open = rounds?.phase === 'open'
  const playing = Boolean(view?.active.includes(me))
  const submitted = Boolean(open && rounds.submissions[rounds.round][me])
  const placing =
    challenge?.kind === 'locate' ||
    challenge?.kind === 'capital' ||
    (challenge?.kind === 'category' && draft.answerId !== null)

  // Camera: an overview while answering, then everyone's pins at the reveal.
  const shot = useRef<string | null>(null)
  useEffect(() => {
    if (!view || !rounds || rounds.phase === 'finished') return
    const key = `${view.seed}:${rounds.round}:${rounds.phase}`
    if (shot.current === key) return
    shot.current = key
    const current = rounds.challenges[rounds.round]
    if (rounds.phase === 'open') {
      stage.flyTo(
        current.kind === 'identify'
          ? frameCountry(geo.feature(current.countryId), geo.factsOf(current.countryId).label)
          : randomOverview(),
      )
      return
    }
    const points = Object.values(rounds.results[rounds.round]).flatMap((r) =>
      'guess' in r ? [r.guess, r.nearest] : [],
    )
    if (points.length > 0) stage.flyTo(frameMany(points))
  })

  // Sound on the reveal: how did I do this round?
  const announced = useRef<string | null>(null)
  useEffect(() => {
    if (!view || rounds?.phase !== 'revealed') return
    const key = `${view.seed}:${rounds.round}`
    if (announced.current === key) return
    announced.current = key
    const mine = rounds.results[rounds.round][me]
    const best = Math.max(...Object.values(view.reports.at(-1)?.points ?? {}))
    if (mine && mine.points >= best && best > 0) {
      play('hit')
      vibrate([12, 40, 12])
    } else {
      play(mine && mine.points > 0 ? 'near' : 'miss')
    }
  })

  const send = (fields: Omit<Submission, 'at'>) => {
    if (!open || submitted || !playing) return
    play('confirm')
    host.submit({ ...fields, hintUsed: draft.hintUsed })
  }

  const confirm = () => {
    if (!placing || !draft.pin) return
    send(
      challenge?.kind === 'category'
        ? { pin: draft.pin, answerId: draft.answerId! }
        : { pin: draft.pin },
    )
  }

  useStagePicking(
    open && placing && !submitted && playing && !intro.open
      ? (point) => {
          updateDraft({ pin: point })
          play('pin')
        }
      : null,
  )
  useStageScene(view ? battleScene(view, me, draft.pin, geo) : { paints: [], pins: [], arcs: [] })

  useGameKeys((event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (rounds?.phase === 'revealed') host.ready()
      else confirm()
    }
  })

  useTestHook({
    snapshot: () => ({
      view: 'battle',
      round: rounds?.round ?? null,
      phase: rounds?.phase ?? null,
      targetId: challenge?.kind === 'category' ? draft.answerId : (challenge?.countryId ?? null),
      draftPin: draft.pin,
    }),
    placePin: (point) => {
      if (open && placing) updateDraft({ pin: point })
    },
    targetPoint: () => {
      if (!challenge) return null
      if (challenge.kind === 'category')
        return draft.answerId ? geo.factsOf(draft.answerId).label : null
      const facts = geo.factsOf(challenge.countryId)
      return challenge.kind === 'capital' ? facts.capitals[0].at : facts.label
    },
  })

  if (!view || !rounds) {
    return (
      <div className="screen screen--center">
        <p className="panel waiting">Starting the battle…</p>
      </div>
    )
  }

  const nameOf = (id: string) => view.config.roster.find((p) => p.id === id)?.name ?? id
  const title = `World Battle · ${FORMAT_LABELS[view.config.format]}`

  if (rounds.phase === 'finished') {
    if (!recorded) return null
    const table = standings(view)
    const mine = table.find((s) => s.id === me)
    const won = isWinner(view, me)
    return (
      <ResultsScreen
        title={won ? 'Victory!' : 'Game over'}
        subtitle={title}
        score={totalPoints(view, me)}
        maxScore={null}
        recorded={recorded}
        nameOf={(id) => geo.nameOf(id)}
        tiles={[
          { label: 'Place', value: mine ? `${mine.place} of ${table.length}` : '—' },
          { label: 'Rounds', value: String(view.reports.length) },
          { label: 'Result', value: won ? 'Won' : 'Lost' },
        ]}
        rows={table.map((s) => ({
          key: s.id,
          label: nameOf(s.id) + (s.id === me ? ' (you)' : ''),
          detail: standingDetail(view, s),
          points: s.points,
          tone: s.place === 1 ? 'perfect' : s.out ? 'miss' : 'good',
        }))}
        onPlayAgain={onPlayAgain}
        onChangeSetup={onHome}
        onHome={onHome}
      />
    )
  }
  if (!challenge) return null

  const deadline = open && rounds.deadline !== null ? rounds.deadline - host.clockOffset : null
  const answered = Object.keys(rounds.submissions[rounds.round]).length
  const used = new Set(
    view.rounds.results.flatMap((round) => {
      const result = round[me]
      return result?.kind === 'category' ? [result.answerId] : []
    }),
  )

  return (
    <div className="screen screen--game">
      <Hud
        mode={title}
        progress={`Round ${rounds.round + 1}`}
        score={totalPoints(view, me)}
        onHelp={intro.show}
        onQuit={onHome}
      />

      <Scoreboard view={view} me={me} />

      <div
        className={`prompt${challenge.kind === 'category' ? ' prompt--category' : ''}`}
        aria-live="polite"
      >
        <Prompt
          challenge={challenge}
          answerName={draft.answerId ? geo.nameOf(draft.answerId) : null}
          hintLetter={
            draft.hintUsed && open && challenge.kind === 'identify'
              ? geo.nameOf(challenge.countryId)[0]
              : null
          }
          showCapitalCountry
          nameOf={(id) => geo.nameOf(id)}
          capitalOf={(id) => geo.factsOf(id).capitals[0].name}
          open={open}
        />
        {deadline !== null && <TimerBar deadline={deadline} totalMs={BATTLE_ROUND_MS} tick />}
      </div>

      <Crosshair active={placing && open && !submitted} />

      <div className="action-bar">
        {rounds.phase === 'revealed' ? (
          <RoundReveal
            view={view}
            me={me}
            nameOf={nameOf}
            clockOffset={host.clockOffset}
            onReady={host.ready}
          />
        ) : !playing ? (
          <div className="panel waiting">You're out: watching the others play on.</div>
        ) : submitted ? (
          <div className="panel waiting" data-testid="locked-in">
            <Icon name="check" size={18} /> Answer locked in · waiting for the others ({answered} /{' '}
            {rounds.players.length})
          </div>
        ) : (
          <RoundInput
            challenge={challenge}
            round={rounds.round}
            answerId={draft.answerId}
            hasPin={draft.pin !== null}
            hintUsed={draft.hintUsed}
            suggestions
            usedAnswers={used}
            coach={false}
            onAnswer={(id) =>
              challenge.kind === 'identify' ? send({ answerId: id }) : updateDraft({ answerId: id })
            }
            onHint={() => updateDraft({ hintUsed: true })}
            onChangeAnswer={() => updateDraft({ answerId: null, pin: null })}
            onDropAtCenter={() => updateDraft({ pin: stage.center() })}
            onConfirm={confirm}
          />
        )}
      </div>

      {intro.open && (
        <HowToPlay mode="World Battle" steps={modeInfo('battle').howTo} onClose={intro.close} />
      )}
    </div>
  )
}

/** Everyone in the game, best first, with HP, lives or points, and who has answered. */
function Scoreboard({ view, me }: { view: BattleState; me: string }) {
  const { rounds, config } = view
  const table = standings(view)
  const answered = rounds.phase === 'open' ? rounds.submissions[rounds.round] : {}
  const last = rounds.phase === 'revealed' ? view.reports.at(-1) : undefined
  return (
    <ol className="scoreboard" aria-label="Players">
      {table.map((s) => {
        const player = config.roster.find((p) => p.id === s.id)!
        return (
          <li key={s.id} className={`${s.out ? 'is-out' : ''}${s.id === me ? ' is-me' : ''}`}>
            <span className="scoreboard__dot" style={{ background: player.color }} />
            <span className="scoreboard__name">
              {player.name}
              {player.team && <small> · Team {player.team}</small>}
            </span>
            {s.hp !== undefined && (
              <span className="hp-bar" aria-label={`${s.hp} HP`}>
                <span style={{ width: `${(s.hp / START_HP) * 100}%` }} />
              </span>
            )}
            {s.lives !== undefined && (
              <span className="scoreboard__lives" aria-label={`${s.lives} lives`}>
                {'♥'.repeat(Math.max(0, s.lives))}
                <span>{'♥'.repeat(START_LIVES - Math.max(0, s.lives))}</span>
              </span>
            )}
            <span className="scoreboard__points">
              {last ? `+${formatNumber(last.points[s.id] ?? 0)}` : formatNumber(s.points)}
            </span>
            {rounds.phase === 'open' && !s.out && (
              <span
                className="scoreboard__status"
                aria-label={answered[s.id] ? 'answered' : 'thinking'}
              >
                {answered[s.id] ? <Icon name="check" size={14} /> : '…'}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The round's results for everyone, damage dealt, and the way on. */
function RoundReveal({
  view,
  me,
  nameOf,
  clockOffset,
  onReady,
}: {
  view: BattleState
  me: string
  nameOf: (id: string) => string
  clockOffset: number
  onReady: () => void
}) {
  const { geo, preferences } = useApp()
  const report = view.reports.at(-1)!
  const results = view.rounds.results[view.rounds.round]
  const order = Object.keys(results).sort(
    (a, b) => (report.points[b] ?? 0) - (report.points[a] ?? 0),
  )
  const ready = view.ready.includes(me)
  const nextAt = (view.revealedAt ?? 0) + BATTLE_REVEAL_MS - clockOffset
  const last = view.decided
  return (
    <section
      className="panel result-card battle-reveal"
      data-testid="round-result"
      aria-live="polite"
    >
      <ol className="battle-reveal__list">
        {order.map((id) => (
          <li key={id} className={id === me ? 'is-me' : undefined}>
            <span
              className="scoreboard__dot"
              style={{ background: view.config.roster.find((p) => p.id === id)?.color }}
            />
            <span className="battle-reveal__name">{nameOf(id)}</span>
            <span className="battle-reveal__detail">
              {describe(results[id], (c) => geo.nameOf(c), preferences.units)}
            </span>
            <span className="battle-reveal__points">+{formatNumber(report.points[id] ?? 0)}</span>
          </li>
        ))}
      </ol>
      {Object.entries(report.damage).map(([side, damage]) => (
        <p key={side} className="battle-reveal__damage">
          {side === 'A' || side === 'B' ? `Team ${side}` : nameOf(side)} takes{' '}
          {formatNumber(damage)} damage
          {report.multiplier > 1 && ` (×${report.multiplier})`}
        </p>
      ))}
      {report.lostLife.length > 0 && (
        <p className="battle-reveal__damage">
          {report.lostLife.map(nameOf).join(', ')} {report.lostLife.length === 1 ? 'loses' : 'lose'}{' '}
          a life
          {report.eliminated.length > 0 && ` · ${report.eliminated.map(nameOf).join(', ')} out!`}
        </p>
      )}
      <div className="battle-reveal__next">
        <TimerBar deadline={nextAt} totalMs={BATTLE_REVEAL_MS} />
        <button
          type="button"
          className="button button--primary"
          disabled={ready}
          onClick={onReady}
          autoFocus
        >
          {ready ? 'Waiting…' : last ? 'See results' : 'Ready'}
        </button>
      </div>
    </section>
  )
}

function describe(result: RoundResult, nameOf: (id: string) => string, units: 'km' | 'mi'): string {
  switch (result.kind) {
    case 'missed':
      return 'No answer'
    case 'identify':
      return `${nameOf(result.answerId)} · ${gradeOf(result).label}`
    case 'category':
      return `${nameOf(result.answerId)} · ${gradeOf(result).label}`
    default:
      return result.hit ? gradeOf(result).label : formatDistance(result.distanceKm, units)
  }
}

function standingDetail(view: BattleState, s: ReturnType<typeof standings>[number]): string {
  if (s.hp !== undefined) return `${formatNumber(s.hp)} HP`
  if (s.lives !== undefined)
    return s.out ? 'Out' : `${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left`
  return view.config.format === 'party' ? `Place ${s.place}` : ''
}
