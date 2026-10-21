import { accuracy, type StatsByCountry } from '../game/stats'
import { formatKm } from './format'

interface StatsScreenProps {
  stats: StatsByCountry
  playableCount: number
  nameOf: (id: string) => string
  onReset: () => void
  onBack: () => void
}

export function StatsScreen({ stats, playableCount, nameOf, onReset, onBack }: StatsScreenProps) {
  // Weakest first: lowest accuracy, then the furthest average miss.
  const rows = Object.entries(stats)
    .map(([id, entry]) => ({
      id,
      name: nameOf(id),
      ...entry,
      accuracy: accuracy(entry),
      averageKm: entry.totalKm / entry.attempts,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.averageKm - a.averageKm)
  const attempts = rows.reduce((sum, row) => sum + row.attempts, 0)
  const hits = rows.reduce((sum, row) => sum + row.hits, 0)

  const handleReset = () => {
    if (window.confirm('Delete all your stats? This cannot be undone.')) onReset()
  }

  return (
    <div className="screen screen--center">
      <div className="panel stats-panel">
        <p className="eyebrow">Your stats</p>
        {rows.length === 0 ? (
          <p className="empty">No games played yet. Your results will show up here.</p>
        ) : (
          <>
            <div className="stat-tiles">
              <Tile label="Countries seen" value={`${rows.length} / ${playableCount}`} />
              <Tile label="Rounds played" value={String(attempts)} />
              <Tile label="Found" value={`${Math.round((hits / attempts) * 100)}%`} />
            </div>

            <div className="stats-table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th scope="col">Country</th>
                    <th scope="col">Found</th>
                    <th scope="col">Accuracy</th>
                    <th scope="col">Avg. miss</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.name}</th>
                      <td>
                        {row.hits} / {row.attempts}
                      </td>
                      <td>
                        <span className="meter" aria-hidden="true">
                          <span style={{ width: `${row.accuracy * 100}%` }} />
                        </span>
                        {Math.round(row.accuracy * 100)}%
                      </td>
                      <td>{formatKm(row.averageKm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="button-row">
          <button type="button" className="button button--primary" onClick={onBack} autoFocus>
            Back
          </button>
          {rows.length > 0 && (
            <button type="button" className="button button--ghost" onClick={handleReset}>
              Reset stats
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <p className="tile__value">{value}</p>
      <p className="tile__label">{label}</p>
    </div>
  )
}
