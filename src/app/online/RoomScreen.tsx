import { useEffect, useRef, useState } from 'react'
import { play } from '../../audio/sound'
import { battle } from '../../game/modes/battle'
import { cosmeticById, PIN_SKINS } from '../../game/profile/cosmetics'
import type { RecordedSession } from '../../game/profile/record'
import type { RoomSettings, RoomView } from '../../net/protocol'
import { Choice } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { ShareButton } from '../../ui/ShareButton'
import { useApp } from '../AppContext'
import { BattleGame, type MatchHost } from '../battle/BattleGame'
import { FORMAT_LABELS } from '../battle/setup'
import { celebrates } from '../celebrate'
import { loadSeat, useRoomConnection } from './useRoomConnection'

/**
 * A private online room: the lobby while people gather, then the battle, run by the server.
 * The code "NEW" creates a room.
 */
export function RoomScreen({ code, onHome }: { code: string; onHome: () => void }) {
  const app = useApp()
  const { navigate, preferences, profile } = app
  const me = {
    name: preferences.playerName.trim() || 'Player',
    color: cosmeticById(PIN_SKINS, profile.cosmetics.pin).color,
  }
  // The room this screen belongs to, once known; reconnects rejoin it rather than making another.
  const joined = useRef<string | null>(code === 'NEW' ? null : code)
  const connection = useRoomConnection((send) => {
    const target = joined.current
    if (!target) return send({ t: 'create', ...me })
    const seat = loadSeat()
    send({ t: 'join', code: target, ...me, token: seat?.code === target ? seat.token : undefined })
  })
  const { room, playerId, error, send } = connection
  useEffect(() => {
    if (room) joined.current = room.code
  }, [room])

  // Once the server has made the room, show its real code in the address bar.
  useEffect(() => {
    if (room && code !== room.code) navigate({ name: 'room', code: room.code }, { replace: true })
  }, [room, code, navigate])

  const recorded = useFinishedGame(room, playerId)

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
              <p>Can't reach the battle server. Is it running? (npm run server)</p>
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
    }
    return (
      <BattleGame
        host={host}
        recorded={recorded}
        onPlayAgain={room.hostId === playerId ? () => send({ t: 'lobby' }) : undefined}
        onHome={onHome}
      />
    )
  }

  return <Lobby room={room} playerId={playerId} error={error} send={send} onHome={onHome} />
}

/** Records the finished online game in the profile, once. */
function useFinishedGame(room: RoomView | null, playerId: string | null) {
  const app = useApp()
  const [recorded, setRecorded] = useState<RecordedSession | null>(null)
  const recordedSeed = useRef<string | null>(null)
  const view = room?.battle
  const finished = room?.phase === 'finished'
  useEffect(() => {
    if (!view || !playerId || !finished || recordedSeed.current === view.seed) return
    recordedSeed.current = view.seed
    const summary = battle.summarize(view, playerId)
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
  onHome,
}: {
  room: RoomView
  playerId: string
  error: string | null
  send: ReturnType<typeof useRoomConnection>['send']
  onHome: () => void
}) {
  const isHost = room.hostId === playerId
  const configure = (patch: Partial<RoomSettings>) =>
    send({ t: 'configure', settings: { ...room.settings, ...patch } })
  const invite = `${window.location.origin}${window.location.pathname}#/room/${room.code}`
  const players = room.members.length + room.settings.bots

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
          <button type="button" className="icon-button" onClick={onHome} aria-label="Leave room">
            <Icon name="close" />
          </button>
        </header>
        <div className="lobby__invite">
          <ShareButton text={`Join my World Game room: ${invite}`} label="Invite friends" />
          <span className="field__hint">or share the code {room.code}</span>
        </div>

        <ul className="lobby__members">
          {room.members.map((member) => (
            <li key={member.id} className={member.connected ? undefined : 'is-away'}>
              <span className="scoreboard__dot" style={{ background: member.color }} />
              {member.name}
              {member.id === room.hostId && <span className="tag">Host</span>}
              {member.id === playerId && <span className="tag">You</span>}
            </li>
          ))}
          {room.settings.bots > 0 && (
            <li className="lobby__bots">
              + {room.settings.bots} {room.settings.bots === 1 ? 'bot' : 'bots'} (
              {room.settings.botSkill})
            </li>
          )}
        </ul>

        {isHost ? (
          <>
            <Choice
              label="Format"
              value={room.settings.format}
              onChange={(format) => configure({ format })}
              options={(['duel', 'party', 'survival', 'teams'] as const).map((value) => ({
                value,
                label: FORMAT_LABELS[value],
              }))}
            />
            <Choice
              label="Rounds"
              value={room.settings.content}
              onChange={(content) => configure({ content })}
              options={[
                { value: 'pinpoint', label: 'Find countries' },
                { value: 'mixed', label: 'Mixed' },
              ]}
            />
            <Choice
              label="Bots"
              value={String(room.settings.bots)}
              onChange={(bots) => configure({ bots: Number(bots) })}
              options={['0', '1', '2', '3'].map((n) => ({ value: n, label: n }))}
            />
            {error && <p className="error">{error}</p>}
            <button
              type="button"
              className="button button--primary button--large"
              onClick={() => send({ t: 'start' })}
            >
              Start · {players} {players === 1 ? 'player' : 'players'}
            </button>
          </>
        ) : (
          <p className="waiting">
            {FORMAT_LABELS[room.settings.format]} ·{' '}
            {room.settings.content === 'mixed' ? 'mixed rounds' : 'find countries'}. Waiting for the
            host to start…
          </p>
        )}
      </section>
    </div>
  )
}
