import { useState, type FormEvent } from 'react'
import { useApp } from '../../app/AppContext'
import { Sheet } from '../../ui/Sheet'

/** Sign in by emailed link, or with Google or GitHub when the server offers them. */
export function SignInSheet({ onClose }: { onClose: () => void }) {
  const { account } = useApp()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const providers = account.me?.providers

  const send = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const failed = await account.sendLink(email.trim())
    setBusy(false)
    setProblem(failed)
    if (!failed) setSentTo(email.trim())
  }

  return (
    <Sheet eyebrow="Account" title="Sign in" onClose={onClose}>
      <p className="sheet__text">
        Signing in keeps your progress safe and shares it between your devices. You can keep playing
        as a guest without it.
      </p>
      {sentTo ? (
        <p className="sheet__text" role="status">
          We sent a sign-in link to <strong>{sentTo}</strong>. It works once and expires in 15
          minutes.
        </p>
      ) : (
        providers?.email && (
          <form onSubmit={send}>
            <label className="text-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="button button--primary button--large"
              disabled={busy || !email.includes('@')}
            >
              Email me a sign-in link
            </button>
            {problem && (
              <p className="field__hint" role="alert">
                {problem}
              </p>
            )}
          </form>
        )
      )}
      {(providers?.google || providers?.github) && (
        <div className="settings__actions">
          {providers.google && (
            <a className="button button--ghost" href="/api/auth/google/start">
              Continue with Google
            </a>
          )}
          {providers.github && (
            <a className="button button--ghost" href="/api/auth/github/start">
              Continue with GitHub
            </a>
          )}
        </div>
      )}
    </Sheet>
  )
}
