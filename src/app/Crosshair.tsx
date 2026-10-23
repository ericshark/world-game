import { Icon } from '../ui/Icon'
import { useApp } from './AppContext'

/** The centre-screen reticle for crosshair placement, while the player can place a pin. */
export function Crosshair({ active }: { active: boolean }) {
  const { preferences } = useApp()
  if (preferences.placement !== 'crosshair' || !active) return null
  return (
    <div className="crosshair" aria-hidden="true">
      <Icon name="crosshair" size={36} />
    </div>
  )
}
