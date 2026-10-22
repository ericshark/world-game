import { useState } from 'react'
import { useApp } from '../app/AppContext'
import type { Skill } from '../game/core/types'
import { skillStats } from '../game/profile/profile'
import { accuracy } from '../game/profile/stats'
import { Choice } from '../ui/controls'
import { Sheet } from '../ui/Sheet'
import { formatDistance } from './format'

const SKILLS: { value: Skill; label: string }[] = [
  { value: 'locate', label: 'Find' },
  { value: 'capital', label: 'Capitals' },
  { value: 'name', label: 'Name It' },
]

export function StatsScreen({ onClose }: { onClose: () => void }) {
  const { geo, profile, preferences } = useApp()
  const [skill, setSkill] = useState<Skill>('locate')
  const stats = skillStats(profile, skill)

  // Weakest first: lowest accuracy, then the furthest average miss.
  const rows = Object.entries(stats)
    .map(([id, entry]) => ({
      id,
      name: geo.nameOf(id),
      ...entry,
      accuracy: accuracy(entry),
      averageKm: entry.totalKm / entry.attempts,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.averageKm - a.averageKm)
  const attempts = rows.reduce((sum, row) => sum + row.attempts, 0)
  const hits = rows.reduce((sum, row) => sum + row.hits, 0)
  const showDistance = skill !== 'name'

  return (
    <Sheet eyebrow="Your stats" title="How well you know the world" onClose={onClose} wide>
      <Choice label="Skill" value={skill} onChange={setSkill} options={SKILLS} />
      {rows.length === 0 ? (
        <p className="empty">Nothing here yet. Your results will show up as you play.</p>
      ) : (
        <>
          <div className="stat-tiles">
            <Tile label="Countries seen" value={`${rows.length} / ${geo.playableIds.length}`} />
            <Tile label="Rounds played" value={String(attempts)} />
            <Tile label="Correct" value={`${Math.round((hits / attempts) * 100)}%`} />
          </div>

          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th scope="col">Country</th>
                  <th scope="col">Correct</th>
                  <th scope="col">Accuracy</th>
                  {showDistance && <th scope="col">Avg. miss</th>}
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
                    {showDistance && <td>{formatDistance(row.averageKm, preferences.units)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Sheet>
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
