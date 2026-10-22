import type { ReactNode } from 'react'
import { REGIONS } from '../geo/countries'
import type { ScoringRegion } from '../geo/scoring'
import { formatNumber } from '../screens/format'
import { Choice } from './controls'
import { Sheet } from './Sheet'

interface SetupSheetProps {
  mode: string
  /** Shown above the Play button, e.g. pool size. */
  note?: string
  best?: number
  canPlay?: boolean
  onClose: () => void
  onPlay: () => void
  children: ReactNode
}

/** The sheet every mode's setup lives in: options above, Play below. */
export function SetupSheet({
  mode,
  note,
  best,
  canPlay = true,
  onClose,
  onPlay,
  children,
}: SetupSheetProps) {
  const footerNote = [note, best !== undefined && `Best ${formatNumber(best)}`]
    .filter(Boolean)
    .join(' · ')
  return (
    <Sheet
      eyebrow={mode}
      title="Set up your game"
      onClose={onClose}
      footer={
        <>
          {footerNote && <p className="sheet__note">{footerNote}</p>}
          <button
            type="button"
            className="button button--primary button--large"
            disabled={!canPlay}
            onClick={onPlay}
          >
            Play
          </button>
        </>
      }
    >
      {children}
    </Sheet>
  )
}

const REGION_OPTIONS: ScoringRegion[] = ['World', ...REGIONS]

export function RegionChoice({
  value,
  onChange,
}: {
  value: ScoringRegion
  onChange: (region: ScoringRegion) => void
}) {
  return (
    <Choice
      label="Region"
      layout="chips"
      value={value}
      onChange={onChange}
      options={REGION_OPTIONS.map((region) => ({ value: region, label: region }))}
    />
  )
}
