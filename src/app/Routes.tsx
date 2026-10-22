import { useState } from 'react'
import { loadPinpointConfig } from '../game/profile/settings'
import { HomeScreen } from '../screens/HomeScreen'
import { PinpointSetup } from '../screens/PinpointSetup'
import { SettingsScreen } from '../screens/SettingsScreen'
import { StatsScreen } from '../screens/StatsScreen'
import { useApp } from './AppContext'
import { PinpointGame } from './pinpoint/PinpointGame'
import type { Route } from './router'

export function Routes({ route }: { route: Route }) {
  const { navigate } = useApp()
  const home = () => navigate({ name: 'home' })

  switch (route.name) {
    case 'home':
      return <HomeScreen />
    case 'setup':
      return (
        <>
          <HomeScreen />
          <PinpointSetup
            onClose={home}
            onPlay={() => navigate({ name: 'play', mode: 'pinpoint' })}
          />
        </>
      )
    case 'play':
      return (
        <PlayPinpoint
          onChangeSetup={() => navigate({ name: 'setup', mode: 'pinpoint' }, { replace: true })}
          onHome={home}
        />
      )
    case 'stats':
      return (
        <>
          <HomeScreen />
          <StatsScreen onClose={home} />
        </>
      )
    case 'settings':
      return (
        <>
          <HomeScreen />
          <SettingsScreen onClose={home} />
        </>
      )
  }
}

/** Plays with the saved setup, so reloading mid-game starts a fresh game with the same choices. */
function PlayPinpoint(props: { onChangeSetup: () => void; onHome: () => void }) {
  const [config] = useState(loadPinpointConfig)
  return <PinpointGame config={config} {...props} />
}
