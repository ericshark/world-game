import { geoDistance, geoInterpolate } from 'd3-geo'
import { useEffect, useReducer, useRef, useState } from 'react'
import { evaluateGuess } from './game/evaluateGuess'
import {
  gameReducer,
  initialGameState,
  isRevealed,
  ROUNDS_PER_GAME,
  type GameConfig,
  type RoundResult,
} from './game/gameReducer'
import { selectTargets, targetPool } from './game/selectTargets'
import { loadLastConfig, saveLastConfig } from './game/settings'
import { clearStats, loadStats, recordResult, saveStats } from './game/stats'
import type { LonLat } from './geo/coords'
import { loadCountries, type CountryIndex } from './geo/countries'
import { CameraRig, type CameraFocus } from './globe/CameraRig'
import { MAX_CAMERA_DISTANCE, MIN_CAMERA_DISTANCE } from './globe/constants'
import { Globe } from './globe/Globe'
import { HighlightOverlay } from './globe/HighlightOverlay'
import { PinAndArc } from './globe/PinAndArc'
import { LoadingOverlay } from './screens/LoadingOverlay'
import { PlayingScreen } from './screens/PlayingScreen'
import { StartScreen } from './screens/StartScreen'
import { StatsScreen } from './screens/StatsScreen'
import { SummaryScreen } from './screens/SummaryScreen'

export default function App() {
  const [countries, setCountries] = useState<CountryIndex | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [state, dispatch] = useReducer(gameReducer, initialGameState)
  const [config, setConfig] = useState(loadLastConfig)
  const [stats, setStats] = useState(() => loadStats())
  const [showGrid, setShowGrid] = useState(false)
  const [cameraFocus, setCameraFocus] = useState<CameraFocus | null>(null)
  const nextFocusId = useRef(0)

  useEffect(() => {
    loadCountries()
      .then(setCountries)
      .catch((error: unknown) => setLoadError(String(error)))
  }, [])

  const playing = state.screen === 'playing' ? state : null
  const revealed = playing ? isRevealed(playing) : false
  const result = playing && revealed ? playing.results[playing.round] : null
  const targetId = playing?.targetIds[playing.round]
  const target = (targetId && countries?.get(targetId)) || null
  const clicked = result?.clickedId ? (countries?.get(result.clickedId) ?? null) : null
  const nameOf = (id: string) => countries?.get(id)?.properties.name ?? id

  const flyTo = (center: LonLat, distance: number) => {
    nextFocusId.current += 1
    setCameraFocus({ id: nextFocusId.current, center, distance })
  }

  // Each round starts zoomed out over a random spot, so the last answer gives no hint.
  const flyToRandomView = () => {
    const lon = Math.random() * 360 - 180
    const lat = Math.random() * 100 - 40
    flyTo([lon, lat], MAX_CAMERA_DISTANCE)
  }

  const startGame = (gameConfig: GameConfig) => {
    if (!countries) return
    const pool = targetPool(countries.features, gameConfig)
    const targetIds = selectTargets(pool, ROUNDS_PER_GAME, {
      stats: gameConfig.practiceWeak ? stats : undefined,
    })
    saveLastConfig(gameConfig)
    dispatch({ type: 'start', config: gameConfig, targetIds })
    flyToRandomView()
  }

  const confirmGuess = () => {
    if (!playing?.pin || revealed || !countries || !targetId) return
    const roundResult = evaluateGuess(countries, targetId, playing.pin, playing.config.region)
    dispatch({ type: 'confirm', result: roundResult })

    const updatedStats = recordResult(stats, roundResult)
    setStats(updatedStats)
    saveStats(updatedStats)

    const { center, distance } = revealView(roundResult)
    flyTo(center, distance)
  }

  const nextRound = () => {
    if (!playing || !revealed) return
    dispatch({ type: 'next' })
    if (playing.round + 1 < playing.targetIds.length) flyToRandomView()
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
      if (revealed) nextRound()
      else confirmGuess()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const canPick = Boolean(playing && !revealed && countries)

  return (
    <div className="app">
      <Globe
        onPick={canPick ? (point) => dispatch({ type: 'placePin', point }) : undefined}
        showGrid={showGrid}
        autoRotate={state.screen === 'start'}
      >
        <CameraRig focus={cameraFocus} />
        {target && result && <HighlightOverlay target={target} clicked={clicked} />}
        {playing?.pin && <PinAndArc pin={playing.pin} nearest={result?.nearest} />}
      </Globe>

      {state.screen === 'start' && (
        <StartScreen
          countries={countries}
          config={config}
          hasStats={Object.keys(stats).length > 0}
          onConfigChange={setConfig}
          onPlay={() => startGame(config)}
          onShowStats={() => dispatch({ type: 'showStats' })}
        />
      )}

      {playing && target && (
        <PlayingScreen
          targetName={target.properties.name}
          round={playing.round}
          totalRounds={playing.targetIds.length}
          score={playing.results.reduce((sum, r) => sum + r.points, 0)}
          hasPin={playing.pin !== null}
          result={result}
          clickedName={clicked && clicked !== target ? clicked.properties.name : null}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
          onConfirm={confirmGuess}
          onNext={nextRound}
          onQuit={() => dispatch({ type: 'quit' })}
        />
      )}

      {state.screen === 'summary' && (
        <SummaryScreen
          results={state.results}
          nameOf={nameOf}
          onPlayAgain={() => startGame(state.config)}
          onChangeSettings={() => dispatch({ type: 'quit' })}
        />
      )}

      {state.screen === 'stats' && (
        <StatsScreen
          stats={stats}
          playableCount={countries?.playable.length ?? 0}
          nameOf={nameOf}
          onReset={() => {
            clearStats()
            setStats({})
          }}
          onBack={() => dispatch({ type: 'quit' })}
        />
      )}

      <LoadingOverlay dataReady={countries !== null} error={loadError} />
      <footer className="credit">Imagery: NASA Blue Marble · Borders: Natural Earth</footer>
    </div>
  )
}

/** Frames the guess and the target together: zooms in for near misses, out for far ones. */
function revealView({ guess, nearest }: RoundResult): { center: LonLat; distance: number } {
  const separation = geoDistance(guess, nearest)
  const distance = MIN_CAMERA_DISTANCE + 0.6 + separation * 2.5
  return {
    center: geoInterpolate(guess, nearest)(0.5),
    distance: Math.min(MAX_CAMERA_DISTANCE, Math.max(MIN_CAMERA_DISTANCE, distance)),
  }
}
