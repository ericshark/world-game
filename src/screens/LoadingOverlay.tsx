import { useProgress } from '@react-three/drei'

/** Covers the scene until the Earth texture and the country data have both loaded. */
export function LoadingOverlay({ dataReady, error }: { dataReady: boolean; error: string | null }) {
  const { active, progress, loaded } = useProgress()
  const textureReady = loaded > 0 && !active
  if (textureReady && dataReady && !error) return null

  return (
    <div className="loading" role="status">
      {error ? (
        <p className="error">Could not load the game: {error}</p>
      ) : (
        <>
          <p>Loading Earth…</p>
          <div className="loading__bar">
            <span style={{ width: `${textureReady ? 100 : Math.round(progress)}%` }} />
          </div>
        </>
      )}
    </div>
  )
}
