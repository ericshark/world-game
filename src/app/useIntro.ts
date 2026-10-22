import { useState } from 'react'
import { useApp } from './AppContext'

/** A mode's "How to play" card: shown automatically the first time, reopenable with "?". */
export function useIntro(mode: string) {
  const { preferences, setPreferences } = useApp()
  const [open, setOpen] = useState(() => !preferences.seenIntros.includes(mode))
  return {
    open,
    show: () => setOpen(true),
    close: () => {
      setOpen(false)
      if (!preferences.seenIntros.includes(mode)) {
        setPreferences({ seenIntros: [...preferences.seenIntros, mode] })
      }
    },
  }
}
