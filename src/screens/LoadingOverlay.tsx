import { useState } from 'react'

/**
 * Covers the scene until the Earth texture and the country data have first loaded. Textures
 * loaded later (the night globe) do not bring it back.
 */
export function LoadingOverlay({
  dataReady,
  globe,
  error,
  onRetry,
}: {
  dataReady: boolean
  /** The 3D scene's first load: how far it has got, and whether the Earth is ready. */
  globe: { progress: number; ready: boolean }
  error: string | null
  onRetry: () => void
}) {
  const [done, setDone] = useState(false)
  if (!done && globe.ready && dataReady && !error) setDone(true)
  if (done) return null

  return (
    <div className="loading" role="status">
      {error ? (
        <>
          <p className="error">Could not load the game: {error}</p>
          <button type="button" className="button button--primary" onClick={onRetry}>
            Try again
          </button>
        </>
      ) : (
        <>
          <p className="loading__title">World Game</p>
          <p>Loading Earth…</p>
          <div className="loading__bar">
            <span style={{ width: `${globe.ready ? 100 : globe.progress}%` }} />
          </div>
        </>
      )}
    </div>
  )
}
