import { useProgress } from '@react-three/drei'
import { useState } from 'react'

/**
 * Covers the scene until the Earth texture and the country data have first loaded. Textures
 * loaded later (the night globe) do not bring it back.
 */
export function LoadingOverlay({ dataReady, error }: { dataReady: boolean; error: string | null }) {
  const { active, progress, loaded } = useProgress()
  const textureReady = loaded > 0 && !active
  const [done, setDone] = useState(false)
  if (!done && textureReady && dataReady && !error) setDone(true)
  if (done) return null

  return (
    <div className="loading" role="status">
      {error ? (
        <p className="error">Could not load the game: {error}</p>
      ) : (
        <>
          <p className="loading__title">World Game</p>
          <p>Loading Earth…</p>
          <div className="loading__bar">
            <span style={{ width: `${textureReady ? 100 : Math.round(progress)}%` }} />
          </div>
        </>
      )}
    </div>
  )
}
