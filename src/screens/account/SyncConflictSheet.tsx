import { levelForXp } from '../../game/profile/xp'
import type { Profile } from '../../game/profile/profile'
import { Sheet } from '../../ui/Sheet'

function describe(profile: Profile) {
  const games = profile.history.length
  return `Level ${levelForXp(profile.xp)} · ${games} game${games === 1 ? '' : 's'} played`
}

/** Both this device and the account have progress; the player decides which survives. */
export function SyncConflictSheet({
  local,
  cloud,
  onChoose,
}: {
  local: Profile
  cloud: Profile
  onChoose: (keep: 'cloud' | 'device') => void
}) {
  return (
    <Sheet eyebrow="Account" title="Which progress do you want to keep?">
      <p className="sheet__text">
        This device and your account both have progress. Choosing one replaces the other.
      </p>
      <div className="settings__actions">
        <button type="button" className="button button--primary" onClick={() => onChoose('cloud')}>
          Keep my account’s progress
          <small> {describe(cloud)}</small>
        </button>
        <button type="button" className="button button--ghost" onClick={() => onChoose('device')}>
          Use this device’s progress
          <small> {describe(local)}</small>
        </button>
      </div>
    </Sheet>
  )
}
