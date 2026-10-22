import { useEffect, useRef, useState } from 'react'
import { pinpointScene } from './app/pinpointScene'
import { useTestHook } from './app/testHook'
import { useLocalSession } from './app/useLocalSession'
import { LOCAL_PLAYER, type CountryOutcome, type SessionSummary } from './game/core/types'
import { pinpoint, type PinpointConfig } from './game/modes/pinpoint'
import {
  clearProfile,
  emptyProfile,
  loadProfile,
  saveProfile,
  skillStats,
  type Profile,
} from './game/profile/profile'
import { recordOutcomes, recordSession } from './game/profile/record'
import { loadLastConfig, saveLastConfig } from './game/profile/settings'
import type { LonLat } from './geo/coords'
import { loadGeoData, type GeoData } from './geo/facts'
import { CameraRig, type CameraFocus } from './globe/CameraRig'
import { CountryPaintLayer } from './globe/CountryPaintLayer'
import { framePair, randomOverview, type CameraView } from './globe/framing'
import { Globe } from './globe/Globe'
import { Markers } from './globe/Markers'
import { LoadingOverlay } from './screens/LoadingOverlay'
import { PlayingScreen } from './screens/PlayingScreen'
import { StartScreen } from './screens/StartScreen'
import { StatsScreen } from './screens/StatsScreen'
import { SummaryScreen } from './screens/SummaryScreen'

type View = 'start' | 'stats' | 'game'

export default function App() {
  const [geo, setGeo] = useState<GeoData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<View>('start')
  const [config, setConfig] = useState(loadLastConfig)
  const [profile, setProfile] = useState(() => loadProfile())
  const profileRef = useRef(profile)
  const [draftPin, setDraftPin] = useState<LonLat | null>(null)
  const [showGrid, setShowGrid] = useState(false)
  const [cameraFocus, setCameraFocus] = useState<CameraFocus | null>(null)
  const nextFocusId = useRef(0)

  useEffect(() => {
    loadGeoData()
      .then(setGeo)
      .catch((error: unknown) => setLoadError(String(error)))
  }, [])

  const changeProfile = (next: Profile) => {
    profileRef.current = next
    setProfile(next)
    saveProfile(next)
  }

  const session = useLocalSession(pinpoint, geo, {
    onOutcomes: (outcomes: CountryOutcome[]) =>
      changeProfile(recordOutcomes(profileRef.current, outcomes)),
    onFinish: (summary: SessionSummary) =>
      changeProfile(recordSession(profileRef.current, summary).profile),
  })

  const game = view === 'game' ? session.state : null
  const rounds = game?.rounds
  const result = rounds?.phase === 'revealed' ? rounds.results[rounds.round][LOCAL_PLAYER] : null
  const targetId =
    rounds && rounds.phase !== 'finished' ? rounds.challenges[rounds.round].countryId : null
  const nameOf = (id: string) => geo?.nameOf(id) ?? id

  const flyTo = ({ center, distance }: CameraView) => {
    nextFocusId.current += 1
    setCameraFocus({ id: nextFocusId.current, center, distance })
  }

  const startGame = (gameConfig: PinpointConfig) => {
    if (!geo) return
    saveLastConfig(gameConfig)
    session.start(gameConfig, { stats: skillStats(profileRef.current, 'locate') })
    setDraftPin(null)
    setView('game')
    flyTo(randomOverview())
  }

  const confirmGuess = () => {
    if (rounds?.phase !== 'open' || !draftPin) return
    const next = session.send({
      type: 'submit',
      playerId: LOCAL_PLAYER,
      submission: { pin: draftPin, at: Date.now() },
    })
    const revealed = next?.rounds.results[next.rounds.round]?.[LOCAL_PLAYER]
    if (revealed?.kind === 'locate') flyTo(framePair(revealed.guess, revealed.nearest))
  }

  const nextRound = () => {
    if (rounds?.phase !== 'revealed') return
    const next = session.send({ type: 'next', at: Date.now() })
    setDraftPin(null)
    if (next?.rounds.phase === 'open') flyTo(randomOverview())
  }

  const quit = () => {
    session.end()
    setView('start')
  }

  // Enter confirms the pin or moves on, unless a focused control is handling the key itself.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.repeat) return
      if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) {
        return
      }
      // Consume the key so it cannot also activate a button that the update focuses.
      event.preventDefault()
      if (rounds?.phase === 'revealed') nextRound()
      else confirmGuess()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useTestHook({
    snapshot: () => ({
      view,
      round: rounds?.round ?? null,
      phase: rounds?.phase ?? null,
      targetId,
      draftPin,
    }),
    placePin: (point) => {
      if (rounds?.phase === 'open') setDraftPin(point)
    },
    targetPoint: () => (geo && targetId ? geo.factsOf(targetId).label : null),
  })

  const canPick = rounds?.phase === 'open'
  const scene = pinpointScene(game, draftPin)
  const clickedId = result?.kind === 'locate' ? result.clickedId : null

  return (
    <div className="app">
      <Globe
        onPick={canPick ? setDraftPin : undefined}
        showGrid={showGrid}
        autoRotate={view === 'start'}
      >
        <CameraRig focus={cameraFocus} />
        {geo && <CountryPaintLayer countries={geo.countries} paints={scene.paints} />}
        <Markers pins={scene.pins} arcs={scene.arcs} />
      </Globe>

      {view === 'start' && (
        <StartScreen
          countries={geo?.countries ?? null}
          config={config}
          hasStats={Object.keys(skillStats(profile, 'locate')).length > 0}
          onConfigChange={setConfig}
          onPlay={() => startGame(config)}
          onShowStats={() => setView('stats')}
        />
      )}

      {game && rounds && targetId && (
        <PlayingScreen
          targetName={nameOf(targetId)}
          round={rounds.round}
          totalRounds={rounds.challenges.length}
          score={rounds.results.reduce((sum, r) => sum + r[LOCAL_PLAYER].points, 0)}
          hasPin={draftPin !== null}
          result={result}
          clickedName={clickedId && clickedId !== targetId ? nameOf(clickedId) : null}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
          onConfirm={confirmGuess}
          onNext={nextRound}
          onQuit={quit}
        />
      )}

      {game && rounds?.phase === 'finished' && (
        <SummaryScreen
          results={rounds.results.map((round) => round[LOCAL_PLAYER])}
          nameOf={nameOf}
          onPlayAgain={() => startGame(game.config)}
          onChangeSettings={quit}
        />
      )}

      {view === 'stats' && (
        <StatsScreen
          stats={skillStats(profile, 'locate')}
          playableCount={geo?.playableIds.length ?? 0}
          nameOf={nameOf}
          onReset={() => {
            clearProfile()
            changeProfile(emptyProfile())
          }}
          onBack={() => setView('start')}
        />
      )}

      <LoadingOverlay dataReady={geo !== null} error={loadError} />
      <footer className="credit">Imagery: NASA Blue Marble · Borders: Natural Earth</footer>
    </div>
  )
}
