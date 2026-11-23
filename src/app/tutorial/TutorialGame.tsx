import { useEffect } from 'react'
import { TOUR_KEY, tutorial } from '../../game/modes/tutorial'
import type { CoachStep } from '../../ui/CoachMark'
import { useApp } from '../AppContext'
import { RoundGame, type CoachMoment } from '../rounds/RoundGame'
import { bestStreak } from '../streaks'

export { TOUR_KEY }

const NO_SETUP = {}

/** The guided first game: three easy finds with tips on spinning, zooming and placing pins. */
export function TutorialGame({ onHome }: { onHome: () => void }) {
  const { geo, preferences, setPreferences } = useApp()
  useEffect(() => {
    if (!preferences.seenIntros.includes(TOUR_KEY)) {
      setPreferences({ seenIntros: [...preferences.seenIntros, TOUR_KEY] })
    }
  }, [preferences.seenIntros, setPreferences])

  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const crosshair = preferences.placement === 'crosshair'
  const stepFor = ({ round, phase, hasPin, challenge }: CoachMoment): CoachStep | null => {
    const target = challenge.kind === 'locate' ? geo.nameOf(challenge.countryId) : ''
    if (phase === 'open' && round === 0) {
      if (hasPin) {
        return {
          title: 'Happy with it?',
          text: `You can move the pin as often as you like. When it is on ${target}, press Confirm${touch ? '' : ' (or Enter)'}.`,
        }
      }
      return {
        title: `Find ${target}`,
        text: crosshair
          ? 'Drag to spin the globe until the crosshair is on it, then press Drop pin.'
          : touch
            ? `Drag to spin the globe and pinch to zoom, then tap ${target} to drop a pin.`
            : `Drag to spin the globe and scroll to zoom, then click ${target} to drop a pin.`,
      }
    }
    if (phase === 'revealed' && round === 0) {
      return {
        title: 'How scoring works',
        text: 'Gold shows the answer. A pin inside it scores 1,000; the further off, the fewer points.',
      }
    }
    if (phase === 'open' && round === 1 && !hasPin) {
      return {
        title: 'Your turn',
        text: touch
          ? `Now ${target}, on your own.`
          : `Now ${target}, on your own. The arrow keys and + and − turn and zoom the globe too.`,
      }
    }
    if (phase === 'open' && round === 2 && !hasPin) {
      return {
        title: 'Last one',
        text: `${target} is smaller: zoom in to be sure of it.`,
      }
    }
    if (phase === 'revealed' && round === 2) {
      return {
        title: 'That’s the tour!',
        text: 'Every mode builds on this. Try today’s Daily World, or any mode from the home screen.',
      }
    }
    return null
  }

  return (
    <RoundGame
      rules={tutorial}
      config={NO_SETUP}
      mode="Tour"
      subtitle="Your first three"
      introKey="tutorial"
      howTo={[]}
      roundTimeMs={null}
      suggestions
      tiles={(results) => [
        { label: 'Correct', value: `${results.filter((r) => r.hit).length} / 3` },
        { label: 'Best streak', value: String(bestStreak(results)) },
      ]}
      coach={{ stepFor, onSkip: onHome }}
      onChangeSetup={onHome}
      onHome={onHome}
    />
  )
}
