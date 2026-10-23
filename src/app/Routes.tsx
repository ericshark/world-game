import { lazy, Suspense, useState, type ComponentType } from 'react'
import { EXPEDITIONS } from '../game/modes/expeditions'
import { loadPinpointConfig, sanitizePinpointConfig } from '../game/profile/settings'
import { formatNumber } from '../screens/format'
import { Sheet } from '../ui/Sheet'
import { HomeScreen } from '../screens/HomeScreen'
import { useApp } from './AppContext'
import { FORMAT_LABELS, loadBattleSetup, sanitizeBattleSetup } from './battle/setup'
import { decodeChallenge, GameContext } from './challenge'
import { todayKey } from './today'
import { describeConfig } from './pinpoint/describe'
import { modeInfo } from './modes'
import type { DailyPuzzle } from '../game/core/types'
import type { ModeKey, Route } from './router'
import { loadJourneyConfig, sanitizeJourneyConfig } from './journey/config'
import { loadMysteryConfig, sanitizeMysteryConfig } from './mystery/config'
import { loadRareEarthConfig, sanitizeRareEarthConfig } from './rareEarth/config'
import { loadRushConfig, rushSubtitle, sanitizeRushConfig } from './rush/config'

// Each screen and game downloads when first opened, so the first visit loads only the menu.
const SignInLink = lazy(() =>
  import('../screens/account/SignInLink').then((m) => ({ default: m.SignInLink })),
)
const PrivacyScreen = lazy(() =>
  import('../screens/LegalScreens').then((m) => ({ default: m.PrivacyScreen })),
)
const CreditsScreen = lazy(() =>
  import('../screens/LegalScreens').then((m) => ({ default: m.CreditsScreen })),
)
const LeaderboardScreen = lazy(() =>
  import('../screens/LeaderboardScreen').then((m) => ({ default: m.LeaderboardScreen })),
)
const SettingsScreen = lazy(() =>
  import('../screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
)
const PassportScreen = lazy(() =>
  import('../screens/passport/PassportScreen').then((m) => ({ default: m.PassportScreen })),
)
const OnlineScreen = lazy(() =>
  import('./online/OnlineScreen').then((m) => ({ default: m.OnlineScreen })),
)
const RoomScreen = lazy(() =>
  import('./online/RoomScreen').then((m) => ({ default: m.RoomScreen })),
)
const BattleSetup = lazy(() =>
  import('./battle/BattleSetup').then((m) => ({ default: m.BattleSetup })),
)
const LocalBattle = lazy(() =>
  import('./battle/LocalBattle').then((m) => ({ default: m.LocalBattle })),
)
const DailyPlay = lazy(() => import('./daily/DailyPlay').then((m) => ({ default: m.DailyPlay })))
const DailyScreen = lazy(() =>
  import('./daily/DailyScreen').then((m) => ({ default: m.DailyScreen })),
)
const PinpointGame = lazy(() =>
  import('./pinpoint/PinpointGame').then((m) => ({ default: m.PinpointGame })),
)
const PinpointSetup = lazy(() =>
  import('./pinpoint/PinpointSetup').then((m) => ({ default: m.PinpointSetup })),
)
const JourneyGame = lazy(() =>
  import('./journey/JourneyGame').then((m) => ({ default: m.JourneyGame })),
)
const JourneySetup = lazy(() =>
  import('./journey/JourneySetup').then((m) => ({ default: m.JourneySetup })),
)
const MysteryGame = lazy(() =>
  import('./mystery/MysteryGame').then((m) => ({ default: m.MysteryGame })),
)
const MysterySetup = lazy(() =>
  import('./mystery/MysterySetup').then((m) => ({ default: m.MysterySetup })),
)
const RareEarthGame = lazy(() =>
  import('./rareEarth/RareEarthGame').then((m) => ({ default: m.RareEarthGame })),
)
const RareEarthSetup = lazy(() =>
  import('./rareEarth/RareEarthSetup').then((m) => ({ default: m.RareEarthSetup })),
)
const RushGame = lazy(() => import('./rush/RushGame').then((m) => ({ default: m.RushGame })))
const RushSetup = lazy(() => import('./rush/RushSetup').then((m) => ({ default: m.RushSetup })))
const TutorialGame = lazy(() =>
  import('./tutorial/TutorialGame').then((m) => ({ default: m.TutorialGame })),
)

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
  return (
    <Suspense fallback={null}>
      <CurrentRoute route={route} />
    </Suspense>
  )
}

function CurrentRoute({ route }: { route: Route }) {
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
    case 'crash':
      throw new Error('Crash test (development only)')
    case 'privacy':
      return <PrivacyScreen onClose={home} />
    case 'credits':
      return <CreditsScreen onClose={home} />
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
