import { useState } from 'react'
import { Icon } from './Icon'

/** Shares text with the system share sheet (phones), or copies it to the clipboard. */
export function ShareButton({ text, label = 'Share' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    try {
      if (navigator.share && window.matchMedia?.('(pointer: coarse)').matches) {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Cancelled or not allowed: nothing to do.
    }
  }

  return (
    <button type="button" className="button" onClick={share}>
      <Icon name={copied ? 'check' : 'play'} size={16} />
      {copied ? 'Copied!' : label}
    </button>
  )
}
