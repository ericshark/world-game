import { LOCAL_PLAYER } from '../../game/core/types'
import { battle, battleViewFor } from '../../game/modes/battle'
import { cosmeticById, PIN_SKINS } from '../../game/profile/cosmetics'
import { HowToPlay } from '../../ui/HowToPlay'
import { useApp } from '../AppContext'
import { modeInfo } from '../modes'
import { useIntro } from '../useIntro'
import { useRecordedGame } from '../useRecordedGame'
import { useLocalSession } from '../useLocalSession'
import { BattleGame, type MatchHost } from './BattleGame'
import { localRoster, type BattleSetupConfig } from './setup'

interface LocalBattleProps {
  config: BattleSetupConfig
  seed?: string
  onChangeSetup: () => void
  onHome: () => void
}

/** A battle against computer opponents, hosted in this browser. */
export function LocalBattle({ config, seed, onHome }: LocalBattleProps) {
  const app = useApp()
  const intro = useIntro('battle')
  const { recorded, record, clear: clearRecorded } = useRecordedGame()
  const roster = () =>
    localRoster(config, {
      name: app.preferences.playerName,
      color: cosmeticById(PIN_SKINS, app.profile.cosmetics.pin).color,
    })

  const session = useLocalSession(
    battle,
    app.geo,
    {
      onOutcomes: app.recordOutcomes,
      onFinish: record,
    },
    // Bots do not wait, so the battle starts once the first-time intro is read.
    intro.open ? undefined : { config: roster(), seed },
  )

  if (!session.state) {
    return (
      <HowToPlay
        mode="World Battle"
        steps={modeInfo('battle').howTo}
        onClose={() => {
          intro.close()
          session.start(roster(), { seed })
        }}
      />
    )
  }

  const host: MatchHost = {
    view: battleViewFor(session.state, LOCAL_PLAYER),
    me: LOCAL_PLAYER,
    clockOffset: 0,
    submit: (fields) =>
      session.send({
        type: 'submit',
        playerId: LOCAL_PLAYER,
        submission: { ...fields, at: Date.now() },
      }),
    ready: () => session.send({ type: 'ready', playerId: LOCAL_PLAYER, at: Date.now() }),
  }

  return (
    <BattleGame
      host={host}
      recorded={recorded}
      onPlayAgain={() => {
        clearRecorded()
        session.start(roster())
      }}
      onHome={onHome}
    />
  )
}
