import { useEffect, useRef } from 'react'

/** Widgets that use the arrow keys (or any typing) themselves. */
const OWNS_KEYS =
  'input, textarea, select, [contenteditable="true"], [role="radiogroup"], [role="tablist"], [role="listbox"], [role="slider"]'

/** True when a key belongs to something other than the game: a field, or a dialog over it. */
export function keyBelongsElsewhere(event: KeyboardEvent, { buttonsToo = true } = {}): boolean {
  if (document.querySelector('[aria-modal="true"]')) return true
  const target = event.target
  if (!(target instanceof Element)) return false
  if (target.closest(OWNS_KEYS)) return true
  // Enter and Space already press a focused button; acting on them too would do it twice.
  return buttonsToo && target.closest('button, a[href]') !== null
}

/**
 * Keyboard play for a game screen: the handler sees each key press, but not repeats, typing,
 * presses meant for a focused button, or anything while a dialog is open.
 */
export function useGameKeys(onKey: (event: KeyboardEvent) => void) {
  const handler = useRef(onKey)
  useEffect(() => {
    handler.current = onKey
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented || keyBelongsElsewhere(event)) return
      handler.current(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
