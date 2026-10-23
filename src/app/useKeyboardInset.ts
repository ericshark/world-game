import { useEffect } from 'react'

/**
 * Keeps `--keyboard-inset` on the page set to the height of a phone's on-screen keyboard, so
 * the bottom panel can stay above it while typing an answer. Browsers that resize the page
 * for the keyboard leave it at 0.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop
      document.documentElement.style.setProperty(
        '--keyboard-inset',
        `${Math.max(0, Math.round(covered))}px`,
      )
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])
}
