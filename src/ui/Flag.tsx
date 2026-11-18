import type { GeoData } from '../geo/facts'
import { flagUrl } from '../geo/flags'

interface FlagProps {
  geo: GeoData
  id: string
  /**
   * What a screen reader hears. Leave it empty while the flag is the question, because its
   * country is the answer; name the country once it has been revealed.
   */
  label?: string
  size?: 'small' | 'medium' | 'large' | 'choice'
  testId?: string
}

/** A country's flag, drawn from the SVGs in public/flags. */
export function Flag({ geo, id, label = '', size = 'medium', testId }: FlagProps) {
  return (
    <img
      className={`flag flag--${size}`}
      src={flagUrl(geo, id)}
      alt={label}
      draggable={false}
      data-testid={testId}
      data-flag={geo.factsOf(id).iso2.toLowerCase()}
    />
  )
}
