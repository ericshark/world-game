import { useState, type FormEvent } from 'react'
import { useApp } from '../../app/AppContext'

/** Reads (once) how an OAuth sign-in ended from the address it returned to. */
function takeSignInResult(): string | null {
  const match = /[?&]signin=(\w+)/.exec(window.location.hash)
  if (!match) return null
  window.history.replaceState(null, '', '#/settings')
  return match[1] === 'ok' ? 'Signed in.' : 'That sign-in did not work. Please try again.'
}

/** Nickname, sign-in and data deletion; absent when there is no game server. */
export function AccountSection({ onSignIn }: { onSignIn: () => void }) {
  const { account, preferences, setPreferences } = useApp()
  const { me } = account
  // What is being typed; null shows the saved nickname.
  const [draft, setDraft] = useState<string | null>(null)
  const nickname = draft ?? me?.player.nickname ?? ''
  const [message, setMessage] = useState<string | null>(takeSignInResult)

  if (account.status !== 'ready' || !me) return null
  const canSignIn = me.providers.email || me.providers.google || me.providers.github

  const saveNickname = async (event: FormEvent) => {
    event.preventDefault()
    const problem = await account.setNickname(nickname)
    setMessage(problem ?? 'Nickname saved.')
    if (!problem) setDraft(null)
    // Rooms use this name unless the player has typed another there.
    if (!problem && !preferences.playerName.trim()) setPreferences({ playerName: nickname.trim() })
  }

  const deleteData = async () => {
    if (!window.confirm('Delete your online data (nickname, account and cloud progress)?')) return
    const problem = await account.deleteData()
    setMessage(problem ?? 'Your online data was deleted. Progress on this device is kept.')
  }

  return (
    <div className="field" data-testid="account">
      <p className="field__label">Account</p>
      <form className="account__nickname" onSubmit={saveNickname}>
        <label className="text-field">
          <span>Nickname</span>
          <input
            type="text"
            value={nickname}
            maxLength={20}
            placeholder="Choose a nickname"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="button button--ghost"
          disabled={nickname.trim().length < 2}
        >
          Save nickname
        </button>
      </form>
      {me.account ? (
        <p className="field__hint">
          Signed in{me.account.email ? ` as ${me.account.email}` : ''}.{' '}
          {account.sync === 'syncing'
            ? 'Syncing your progress…'
            : account.sync === 'error'
              ? 'Your progress could not be synced just now.'
              : 'Your progress follows you to other devices.'}
        </p>
      ) : (
        <p className="field__hint">
          You are playing as a guest.
          {canSignIn && ' Sign in to keep your progress on every device.'}
        </p>
      )}
      <div className="settings__actions">
        {me.account ? (
          <button type="button" className="button button--ghost" onClick={() => account.signOut()}>
            Sign out
          </button>
        ) : (
          canSignIn && (
            <button type="button" className="button button--ghost" onClick={onSignIn}>
              Sign in
            </button>
          )
        )}
        <button type="button" className="button button--danger" onClick={deleteData}>
          Delete my online data
        </button>
      </div>
      {message && (
        <p className="field__hint" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
