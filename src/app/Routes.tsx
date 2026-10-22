import { useState, type ComponentType } from 'react'
import { loadPinpointConfig } from '../game/profile/settings'
import { HomeScreen } from '../screens/HomeScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { PassportScreen } from '../screens/passport/PassportScreen'
import { useApp } from './AppContext'
import { DailyPlay } from './daily/DailyPlay'
import { DailyScreen } from './daily/DailyScreen'
import { todayKey } from './today'
import { PinpointGame } from './pinpoint/PinpointGame'
import { PinpointSetup } from './pinpoint/PinpointSetup'
import type { DailyPuzzle } from '../game/core/types'
import type { ModeKey, Route } from './router'
import { loadJourneyConfig } from './journey/config'
import { JourneyGame } from './journey/JourneyGame'
import { JourneySetup } from './journey/JourneySetup'
import { loadMysteryConfig } from './mystery/config'
import { MysteryGame } from './mystery/MysteryGame'
import { MysterySetup } from './mystery/MysterySetup'
import { loadRareEarthConfig } from './rareEarth/config'
import { RareEarthGame } from './rareEarth/RareEarthGame'
import { RareEarthSetup } from './rareEarth/RareEarthSetup'
import { loadRushConfig } from './rush/config'
import { RushGame } from './rush/RushGame'
import { RushSetup } from './rush/RushSetup'

interface SetupProps {
  onClose: () => void
  onPlay: () => void
}

interface GameProps {
  onChangeSetup: () => void
  onHome: () => void
}

/** Each mode's setup sheet and game screen. Games read the setup saved by the sheet. */
const SCREENS: Partial<
  Record<ModeKey, { Setup: ComponentType<SetupProps>; Game: ComponentType<GameProps> }>
> = {
  pinpoint: { Setup: PinpointSetup, Game: withConfig(PinpointGame, loadPinpointConfig) },
  rush: { Setup: RushSetup, Game: withConfig(RushGame, loadRushConfig) },
  'rare-earth': { Setup: RareEarthSetup, Game: withConfig(RareEarthGame, loadRareEarthConfig) },
  mystery: { Setup: MysterySetup, Game: withConfig(MysteryGame, loadMysteryConfig) },
  journey: { Setup: JourneySetup, Game: withConfig(JourneyGame, loadJourneyConfig) },
}

export function Routes({ route }: { route: Route }) {
  const { navigate } = useApp()
  const home = () => navigate({ name: 'home' })

  switch (route.name) {
    case 'home':
      return <HomeScreen />
    case 'setup': {
      const screens = SCREENS[route.mode]
      return (
        <>
          <HomeScreen />
          {screens && (
            <screens.Setup
              onClose={home}
              onPlay={() => navigate({ name: 'play', mode: route.mode })}
            />
          )}
        </>
      )
    }
    case 'play': {
      const screens = SCREENS[route.mode]
      if (!screens) return <HomeScreen />
      return (
        <screens.Game
          key={route.mode}
          onChangeSetup={() => navigate({ name: 'setup', mode: route.mode }, { replace: true })}
          onHome={home}
        />
      )
    }
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
    case 'settings':
      return (
        <>
          <HomeScreen />
          <SettingsScreen onClose={home} />
        </>
      )
  }
}

/** Reads the saved setup once, so reloading mid-game starts afresh with the same choices. */
function withConfig<Config>(
  Game: ComponentType<GameProps & { config: Config }>,
  load: () => Config,
): ComponentType<GameProps> {
  return function GameWithConfig(props: GameProps) {
    const [config] = useState(load)
    return <Game config={config} {...props} />
  }
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
