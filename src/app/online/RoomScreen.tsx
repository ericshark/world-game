import { useEffect, useRef, useState } from 'react'
import { play } from '../../audio/sound'
import { battle } from '../../game/modes/battle'
import { cosmeticById, PIN_SKINS, pinShapeOf, TITLES } from '../../game/profile/cosmetics'
import type { RecordedSession } from '../../game/profile/record'
import { MAX_PLAYERS, type ActiveQueue, type RoomSettings, type RoomView } from '../../net/protocol'
import { BATTLE_ROUND_CHOICES_MS } from '../../game/modes/battle'
import { RegionChoice } from '../../ui/SetupSheet'
import { Choice } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { ShareButton } from '../../ui/ShareButton'
import { Sheet } from '../../ui/Sheet'
import { HomeScreen } from '../../screens/HomeScreen'
import { useApp } from '../AppContext'
import { BattleGame, type MatchHost } from '../battle/BattleGame'
import { FORMAT_LABELS } from '../battle/setup'
import { celebrates } from '../celebrate'
import { loadSeat, useRoomConnection } from './useRoomConnection'

/** The address that means "find me an opponent" rather than a room. */
export const QUICK_CODE = 'QUICK'

/**
 * A private online room: the lobby while people gather, then the battle, run by the server.
 * The code "NEW" creates a room. Someone arriving by link is asked their name first.
 */
export function RoomScreen({ code, onHome }: { code: string; onHome: () => void }) {
  const { preferences } = useApp()
  const [named, setNamed] = useState(
    () => preferences.playerName.trim() !== '' || loadSeat()?.code === code,
  )
  if (!named) return <NamePrompt code={code} onJoin={() => setNamed(true)} onCancel={onHome} />
  return <ConnectedRoom code={code} onHome={onHome} />
}

function NamePrompt({
  code,
  onJoin,
  onCancel,
}: {
  code: string
  onJoin: () => void
  onCancel: () => void
}) {
  const { preferences, setPreferences } = useApp()
  const ready = preferences.playerName.trim() !== ''
  return (
    <>
      <HomeScreen />
      <Sheet eyebrow={`Room ${code}`} title="Join the game" onClose={onCancel}>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (ready) onJoin()
          }}
        >
          <label className="text-field">
            <span>Your name, as the others will see it</span>
            <input
              type="text"
              value={preferences.playerName}
              maxLength={20}
              placeholder="Your name"
              autoFocus
              onChange={(event) => setPreferences({ playerName: event.target.value })}
            />
          </label>
          <button type="submit" className="button button--primary button--large" disabled={!ready}>
            Join room {code}
          </button>
        </form>
      </Sheet>
    </>
  )
}

function ConnectedRoom({ code, onHome }: { code: string; onHome: () => void }) {
  const app = useApp()
  const { navigate, preferences, profile } = app
  const me = {
    name: preferences.playerName.trim() || 'Player',
    color: cosmeticById(PIN_SKINS, profile.cosmetics.pin).color,
    shape: pinShapeOf(profile.cosmetics.shape),
    ...(profile.cosmetics.title !== 'none' && { title: profile.cosmetics.title }),
  }
  // The room this screen belongs to, once known; reconnects rejoin it rather than making another.
  const quick = code === QUICK_CODE
  const joined = useRef<string | null>(code === 'NEW' || quick ? null : code)
  const connection = useRoomConnection((send) => {
    const target = joined.current
    if (!target) return send(quick ? { t: 'queue', ...me } : { t: 'create', ...me })
    const seat = loadSeat()
    send({ t: 'join', code: target, ...me, token: seat?.code === target ? seat.token : undefined })
  })
  const { room, playerId, error, send, queue, rating } = connection
  useEffect(() => {
    if (room) joined.current = room.code
  }, [room])

  // Once the server has made the room, show its real code in the address bar.
  useEffect(() => {
    if (room && code !== room.code) navigate({ name: 'room', code: room.code }, { replace: true })
  }, [room, code, navigate])

  const recorded = useFinishedGame(room, playerId)
  // Leaving on purpose gives the seat up straight away, rather than holding it for a return.
  const leave = () => {
    send({ t: 'leave' })
    send({ t: 'queue-leave' })
    onHome()
  }

  if (!room && !playerId && quick && queue) {
    return <Searching queue={queue} send={send} onCancel={leave} />
  }

  if (!room || !playerId) {
    return (
      <div className="screen screen--center">
        <div className="panel waiting waiting--column">
          {error ? (
            <>
              <p className="error">{error}</p>
              <button type="button" className="button" onClick={onHome}>
                Back
              </button>
            </>
          ) : connection.status === 'closed' ? (
            <>
              <p>
                {import.meta.env.DEV
                  ? "Can't reach the battle server. Is it running? (npm run server)"
                  : "Can't reach the game server."}
              </p>
              <p className="field__hint">Retrying…</p>
              <button type="button" className="button" onClick={onHome}>
                Back
              </button>
            </>
          ) : (
            <p>Connecting…</p>
          )}
        </div>
      </div>
    )
  }

  if (room.phase !== 'lobby' && room.battle) {
    const host: MatchHost = {
      view: room.battle,
      me: playerId,
      clockOffset: connection.clockOffset,
      submit: (fields) => send({ t: 'submit', round: room.battle!.rounds.round, ...fields }),
      ready: () => send({ t: 'ready' }),
      connected: connection.status === 'open',
    }
    return (
      <BattleGame
        host={host}
        recorded={recorded}
        rating={quick ? rating : undefined}
        onPlayAgain={quick ? undefined : () => send({ t: 'lobby' })}
        onHome={leave}
      />
    )
  }

  return <Lobby room={room} playerId={playerId} error={error} send={send} onLeave={leave} />
}

/** Waiting for a Quick Duel opponent: a timer, and after a while the offer of a bot. */
function Searching({
  queue,
  send,
  onCancel,
}: {
  queue: ActiveQueue
  send: ReturnType<typeof useRoomConnection>['send']
  onCancel: () => void
}) {
  const offered = queue.status === 'offer-bot'
  // The server reports the wait now and then; count the seconds in between locally.
  const [seconds, setSeconds] = useState(Math.floor(queue.waitedMs / 1000))
  useEffect(() => {
    const start = Date.now() - queue.waitedMs
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 500)
    return () => window.clearInterval(timer)
  }, [queue.waitedMs])
  return (
    <div className="screen screen--center">
      <section className="panel waiting waiting--column" aria-labelledby="searching-title">
        <p className="eyebrow">Quick Duel · rating {queue.rating}</p>
        <h2 id="searching-title">Looking for an opponent…</h2>
        <p role="status">Waiting {seconds} s. The search widens to nearby ratings as you wait.</p>
        {offered && (
          <div className="settings__actions">
            <button type="button" className="button" onClick={() => send({ t: 'queue-bot' })}>
              Play a bot instead (unrated)
            </button>
          </div>
        )}
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancel
        </button>
      </section>
    </div>
  )
}

/** Records the finished online game in the profile, once. */
function useFinishedGame(room: RoomView | null, playerId: string | null) {
  const app = useApp()
  const [recorded, setRecorded] = useState<RecordedSession | null>(null)
  const recordedGame = useRef<string | null>(null)
  const view = room?.battle
  const finished = room?.phase === 'finished'
  useEffect(() => {
    if (!view || !playerId || !finished || recordedGame.current === view.gameId) return
    recordedGame.current = view.gameId
    // Online games keep their own personal bests, apart from games against bots.
    const local = battle.summarize(view, playerId)
    const summary = { ...local, bestKey: `${local.bestKey}:online` }
    app.recordOutcomes(summary.outcomes)
    const result = app.finishSession(summary)
    setRecorded(result)
    play(celebrates(result) ? 'best' : 'finish')
  }, [view, playerId, finished, app])
  return room?.phase === 'finished' ? recorded : null
}

function Lobby({
  room,
  playerId,
  error,
  send,
  onLeave,
}: {
  room: RoomView
  playerId: string
  error: string | null
  send: ReturnType<typeof useRoomConnection>['send']
  onLeave: () => void
}) {
  const isHost = room.hostId === playerId
  const me = room.members.find((m) => m.id === playerId)
  const { settings } = room
  const configure = (patch: Partial<RoomSettings>) =>
    send({ t: 'configure', settings: { ...settings, ...patch } })
  const invite = `${window.location.origin}${window.location.pathname}#/room/${room.code}`
  const players = room.members.length + settings.bots
  const maxBots = MAX_PLAYERS - room.members.length
  const waitingFor = room.members.filter((m) => m.id !== room.hostId && (!m.connected || !m.ready))

  return (
    <div className="screen screen--center">
      <section className="panel lobby" aria-labelledby="lobby-title">
        <header className="passport__header">
          <div>
            <p className="eyebrow">Private room</p>
            <h2 className="lobby__code" id="lobby-title" data-testid="room-code">
              {room.code}
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onLeave} aria-label="Leave room">
            <Icon name="close" />
          </button>
        </header>
        <div className="lobby__invite">
          <ShareButton text={`Join my World Game room: ${invite}`} label="Invite friends" />
          <span className="field__hint">or share the code {room.code}</span>
        </div>

        <ul className="lobby__members" aria-label="Players">
          {room.members.map((member) => (
            <li key={member.id} className={member.connected ? undefined : 'is-away'}>
              <span className="scoreboard__dot" style={{ background: member.color }} />
              <span className="lobby__name">
                {member.name}
                {member.title && <small> · {titleLabel(member.title)}</small>}
              </span>
              {settings.format === 'teams' && member.team && (
                <span className="tag">Team {member.team}</span>
              )}
              {member.id === room.hostId && <span className="tag">Host</span>}
              {member.id === playerId && <span className="tag">You</span>}
              {!member.connected ? (
                <span className="lobby__status">Away</span>
              ) : (
                member.id !== room.hostId && (
                  <span className={`lobby__status${member.ready ? ' is-ready' : ''}`}>
                    {member.ready ? 'Ready' : 'Not ready'}
                  </span>
                )
              )}
              {isHost && member.id !== playerId && (
                <button
                  type="button"
                  className="icon-button lobby__kick"
                  aria-label={`Remove ${member.name}`}
                  onClick={() => send({ t: 'kick', playerId: member.id })}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </li>
          ))}
          {settings.bots > 0 && (
            <li className="lobby__bots">
              + {settings.bots} {settings.bots === 1 ? 'bot' : 'bots'} ({settings.botSkill})
            </li>
          )}
        </ul>

        {settings.format === 'teams' && me && (
          <Choice
            label="Your side"
            value={me.team ?? 'A'}
            onChange={(team) => send({ t: 'team', team })}
            options={[
              { value: 'A', label: 'Team A' },
              { value: 'B', label: 'Team B' },
            ]}
          />
        )}

        {isHost ? (
          <>
            <Choice
              label="Format"
              value={settings.format}
              onChange={(format) => configure({ format })}
              options={(['duel', 'party', 'survival', 'teams'] as const).map((value) => ({
                value,
                label: FORMAT_LABELS[value],
              }))}
            />
            <Choice
              label="Rounds"
              value={settings.content}
              onChange={(content) => configure({ content })}
              options={[
                { value: 'pinpoint', label: 'Find countries' },
                { value: 'mixed', label: 'Mixed' },
              ]}
            />
            <RegionChoice value={settings.region} onChange={(region) => configure({ region })} />
            <Choice
              label="Time per round"
              value={String(settings.roundMs)}
              onChange={(roundMs) => configure({ roundMs: Number(roundMs) })}
              options={BATTLE_ROUND_CHOICES_MS.map((ms) => ({
                value: String(ms),
                label: `${ms / 1000} s`,
              }))}
            />
            <Choice
              label="Bots"
              layout="chips"
              value={String(Math.min(settings.bots, maxBots))}
              onChange={(bots) => configure({ bots: Number(bots) })}
              options={Array.from({ length: maxBots + 1 }, (_, n) => ({
                value: String(n),
                label: String(n),
              }))}
            />
            {settings.bots > 0 && (
              <Choice
                label="Bot skill"
                // Chips wrap; four segments with "Cartographer" do not fit a phone's width.
                layout="chips"
                value={settings.botSkill}
                onChange={(botSkill) => configure({ botSkill })}
                options={BOT_SKILL_OPTIONS}
              />
            )}
            {error && <p className="error">{error}</p>}
            <button
              type="button"
              className="button button--primary button--large"
              disabled={waitingFor.length > 0}
              onClick={() => send({ t: 'start' })}
            >
              {waitingFor.length > 0
                ? `Waiting for ${waitingFor.length} to be ready`
                : `Start · ${players} ${players === 1 ? 'player' : 'players'}`}
            </button>
          </>
        ) : (
          <>
            <p className="waiting">
              {FORMAT_LABELS[settings.format]} ·{' '}
              {settings.content === 'mixed' ? 'mixed rounds' : 'find countries'} · {settings.region}{' '}
              · {settings.roundMs / 1000} s a round
            </p>
            <button
              type="button"
              className={`button button--large ${me?.ready ? 'button--ghost' : 'button--primary'}`}
              onClick={() => send({ t: 'set-ready', ready: !me?.ready })}
            >
              {me?.ready ? 'Not ready yet' : 'I’m ready'}
            </button>
            <p className="field__hint">The host starts the game once everyone is ready.</p>
          </>
        )}
      </section>
    </div>
  )
}

const BOT_SKILL_OPTIONS = (['novice', 'traveller', 'explorer', 'cartographer'] as const).map(
  (value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }),
)

function titleLabel(id: string): string {
  return TITLES.find((title) => title.id === id)?.label ?? ''
}
