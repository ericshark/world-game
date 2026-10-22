import { rarityTier } from '../../game/core/categories'
import type { CategoryResult, RoundResult } from '../../game/core/types'
import {
  rareEarth,
  RARE_EARTH_HARD_ROUND_MS,
  type RareEarthConfig,
} from '../../game/modes/rareEarth'
import { useApp } from '../AppContext'
import { modeInfo } from '../modes'
import { RoundGame } from '../rounds/RoundGame'

interface RareEarthGameProps {
  config: RareEarthConfig
  seed?: string
  onChangeSetup: () => void
  onHome: () => void
}

export function RareEarthGame({ config, ...props }: RareEarthGameProps) {
  const { geo } = useApp()
  const tiles = (results: RoundResult[]) => {
    const valid = results.filter((r): r is CategoryResult => r.kind === 'category' && r.valid)
    const rarest = valid.reduce<CategoryResult | null>(
      (best, r) => (!best || r.rarity > best.rarity ? r : best),
      null,
    )
    return [
      { label: 'Valid answers', value: `${valid.length} / ${results.length}` },
      { label: 'Rarest answer', value: rarest ? geo.nameOf(rarest.answerId) : '—' },
      { label: 'Best tier', value: rarest ? rarityTier(rarest.rarity) : '—' },
    ]
  }
  const hard = config.difficulty === 'hard'
  return (
    <RoundGame
      {...props}
      rules={rareEarth}
      config={config}
      mode="Rare Earth"
      subtitle={hard ? 'Hard' : 'Normal'}
      introKey="rare-earth"
      howTo={modeInfo('rare-earth').howTo}
      roundTimeMs={hard ? RARE_EARTH_HARD_ROUND_MS : null}
      suggestions={!hard}
      tiles={tiles}
    />
  )
}
