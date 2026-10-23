import { useState, type ComponentType } from 'react'
import { EXPEDITIONS } from '../game/modes/expeditions'
import { loadPinpointConfig, sanitizePinpointConfig } from '../game/profile/settings'
import { formatNumber } from '../screens/format'
import { Sheet } from '../ui/Sheet'
import { HomeScreen } from '../screens/HomeScreen'
import { SignInLink } from '../screens/account/SignInLink'
import { LeaderboardScreen } from '../screens/LeaderboardScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { PassportScreen } from '../screens/passport/PassportScreen'
import { useApp } from './AppContext'
import { OnlineScreen } from './online/OnlineScreen'
import { RoomScreen } from './online/RoomScreen'
import { BattleSetup } from './battle/BattleSetup'
import { LocalBattle } from './battle/LocalBattle'
import { FORMAT_LABELS, loadBattleSetup, sanitizeBattleSetup } from './battle/setup'
import { decodeChallenge, GameContext } from './challenge'
import { DailyPlay } from './daily/DailyPlay'
import { DailyScreen } from './daily/DailyScreen'
import { todayKey } from './today'
import { PinpointGame } from './pinpoint/PinpointGame'
import { describeConfig } from './pinpoint/describe'
import { PinpointSetup } from './pinpoint/PinpointSetup'
import { modeInfo } from './modes'
import type { DailyPuzzle } from '../game/core/types'
import type { ModeKey, Route } from './router'
import { loadJourneyConfig, sanitizeJourneyConfig } from './journey/config'
import { JourneyGame } from './journey/JourneyGame'
import { JourneySetup } from './journey/JourneySetup'
import { loadMysteryConfig, sanitizeMysteryConfig } from './mystery/config'
import { MysteryGame } from './mystery/MysteryGame'
import { MysterySetup } from './mystery/MysterySetup'
import { loadRareEarthConfig, sanitizeRareEarthConfig } from './rareEarth/config'
import { RareEarthGame } from './rareEarth/RareEarthGame'
import { RareEarthSetup } from './rareEarth/RareEarthSetup'
import { loadRushConfig, rushSubtitle, sanitizeRushConfig } from './rush/config'
import { RushGame } from './rush/RushGame'
import { RushSetup } from './rush/RushSetup'
import { TutorialGame } from './tutorial/TutorialGame'

interface SetupProps {
  onClose: () => void
  onPlay: () => void
}

interface GameProps {
  onChangeSetup: () => void
  onHome: () => void
}

interface ModeScreens<Config> {
  Setup: ComponentType<SetupProps>
  Game: ComponentType<GameProps & { config: Config; seed?: string }>
  load: () => Config
  /** Cleans a setup that arrived in a link. */
  sanitize: (raw: Partial<Config>) => Config
  describe: (config: Config) => string
}

function screens<Config>(definition: ModeScreens<Config>) {
  return definition as unknown as ModeScreens<unknown>
}

/** Each mode's setup sheet and game screen. Games read the setup saved by the sheet. */
const SCREENS: Record<ModeKey, ModeScreens<unknown>> = {
  pinpoint: screens({
    Setup: PinpointSetup,
    Game: PinpointGame,
    load: loadPinpointConfig,
    sanitize: sanitizePinpointConfig,
    describe: describeConfig,
  }),
  rush: screens({
    Setup: RushSetup,
    Game: RushGame,
    load: loadRushConfig,
    sanitize: sanitizeRushConfig,
    describe: (c) => rushSubtitle(c),
  }),
  'rare-earth': screens({
    Setup: RareEarthSetup,
    Game: RareEarthGame,
    load: loadRareEarthConfig,
    sanitize: sanitizeRareEarthConfig,
    describe: (c) => (c.difficulty === 'hard' ? 'Hard' : 'Normal'),
  }),
  mystery: screens({
    Setup: MysterySetup,
    Game: MysteryGame,
    load: loadMysteryConfig,
    sanitize: sanitizeMysteryConfig,
    describe: (c) => (c.difficulty === 'hard' ? 'Hard' : 'Normal'),
  }),
  battle: screens({
    Setup: BattleSetup,
    Game: LocalBattle,
    load: loadBattleSetup,
    sanitize: sanitizeBattleSetup,
    describe: (c) => `${FORMAT_LABELS[c.format]} against ${c.skill} bots`,
  }),
  journey: screens({
    Setup: JourneySetup,
    Game: JourneyGame,
    load: loadJourneyConfig,
    sanitize: sanitizeJourneyConfig,
    describe: (c) =>
      c.kind === 'quick'
        ? `Quick journey · ${c.region}`
        : (EXPEDITIONS.find((e) => e.id === c.expeditionId)?.title ?? 'Expedition'),
  }),
}

export function Routes({ route }: { route: Route }) {
  const { navigate } = useApp()
  const home = () => navigate({ name: 'home' })

  switch (route.name) {
    case 'home':
      return <HomeScreen />
    case 'setup': {
      const { Setup } = SCREENS[route.mode]
      return (
        <>
          <HomeScreen />
          <Setup onClose={home} onPlay={() => navigate({ name: 'play', mode: route.mode })} />
        </>
      )
    }
    case 'play':
      return (
        <PlayMode
          key={route.mode}
          mode={route.mode}
          onChangeSetup={() => navigate({ name: 'setup', mode: route.mode }, { replace: true })}
          onHome={home}
        />
      )
    case 'challenge':
      return <ChallengeRoute token={route.token} onHome={home} />
    case 'online':
      return <OnlineScreen onClose={home} />
    case 'room':
      return (
        <RoomScreen
          // One screen for the whole visit: the address changes from NEW to the room's code.
          key="room"
          code={route.code}
          onHome={home}
        />
      )
    case 'daily':
      return (
        <DailyScreen onPlay={(puzzle) => navigate({ name: 'daily-play', puzzle })} onClose={home} />
      )
    case 'daily-play':
      return (
        <DailyGate
          key={route.puzzle}
          puzzle={route.puzzle}
          onPlay={(puzzle) => navigate({ name: 'daily-play', puzzle })}
          onDone={() => navigate({ name: 'daily' }, { replace: true })}
          onHome={home}
        />
      )
    case 'passport':
      return <PassportScreen onClose={home} />
    case 'tour':
      return <TutorialGame onHome={home} />
    case 'leaderboards':
      return (
        <>
          <HomeScreen />
          <LeaderboardScreen onClose={home} />
        </>
      )
    case 'signin':
      return <SignInLink token={route.token} />
    case 'settings':
      return (
        <>
          <HomeScreen />
          <SettingsScreen onClose={home} />
        </>
      )
  }
}

/** Plays a mode with its saved setup, read once so a reload starts afresh with the same choices. */
function PlayMode({ mode, ...props }: GameProps & { mode: ModeKey }) {
  const { Game, load } = SCREENS[mode]
  const [config] = useState(load)
  return (
    <GameContext.Provider value={{ mode, config, rival: null }}>
      <Game config={config} {...props} />
    </GameContext.Provider>
  )
}

/** Someone shared a game: show what it is and the score to beat, then play the same one. */
function ChallengeRoute({ token, onHome }: { token: string; onHome: () => void }) {
  const [accepted, setAccepted] = useState(false)
  const link = decodeChallenge(token)
  const mode = link ? SCREENS[link.mode] : null
  if (!link || !mode) {
    return (
      <>
        <HomeScreen />
        <Sheet title="This challenge link is broken" onClose={onHome}>
          <p>It may have been cut short when it was copied. Ask for the link again.</p>
        </Sheet>
      </>
    )
  }
  const config = mode.sanitize(link.config as Partial<unknown>)
  if (accepted) {
    return (
      <GameContext.Provider value={{ mode: link.mode, config, rival: link.score }}>
        <mode.Game config={config} seed={link.seed} onChangeSetup={onHome} onHome={onHome} />
      </GameContext.Provider>
    )
  }
  return (
    <>
      <HomeScreen />
      <Sheet
        eyebrow="You've been challenged"
        title={`Beat ${formatNumber(link.score)} in ${modeInfo(link.mode).title}`}
        onClose={onHome}
        footer={
          <button
            type="button"
            className="button button--primary button--large"
            onClick={() => setAccepted(true)}
          >
            Accept the challenge
          </button>
        }
      >
        <p>{mode.describe(config)}. You'll get exactly the same game, so it is a fair contest.</p>
      </Sheet>
    </>
  )
}

/**
 * One go per puzzle per day: a puzzle already played today shows the hub instead. Decided
 * when the puzzle opens, so finishing it does not swap the results screen away.
 */
function DailyGate(props: {
  puzzle: DailyPuzzle
  onPlay: (puzzle: DailyPuzzle) => void
  onDone: () => void
  onHome: () => void
}) {
  const { profile } = useApp()
  const [alreadyPlayed] = useState(() => Boolean(profile.daily[todayKey()]?.[props.puzzle]))
  if (alreadyPlayed) return <DailyScreen onPlay={props.onPlay} onClose={props.onHome} />
  return <DailyPlay puzzle={props.puzzle} onDone={props.onDone} />
}
