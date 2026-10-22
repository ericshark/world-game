import { useState } from 'react'
import { ROOM_CODE_LENGTH } from '../../net/protocol'
import { Sheet } from '../../ui/Sheet'
import { useApp } from '../AppContext'
import { HomeScreen } from '../../screens/HomeScreen'

/** Start a private room, or join a friend's with their code. */
export function OnlineScreen({ onClose }: { onClose: () => void }) {
  const { navigate, preferences, setPreferences } = useApp()
  const [code, setCode] = useState('')
  const validCode = code.length === ROOM_CODE_LENGTH

  return (
    <>
      <HomeScreen />
      <Sheet eyebrow="World Battle" title="Play with friends" onClose={onClose}>
        <p className="sheet__text">
          Make a private room and share its code. Everyone plays the same rounds at the same time;
          answers stay secret until all are in.
        </p>
        <label className="text-field">
          <span>Your name</span>
          <input
            type="text"
            value={preferences.playerName}
            maxLength={20}
            placeholder="Your name"
            onChange={(event) => setPreferences({ playerName: event.target.value })}
          />
        </label>
        <button
          type="button"
          className="button button--primary button--large"
          disabled={!preferences.playerName.trim()}
          onClick={() => navigate({ name: 'room', code: 'NEW' })}
        >
          Create a room
        </button>
        <form
          className="join-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (validCode && preferences.playerName.trim()) navigate({ name: 'room', code })
          }}
        >
          <label className="text-field">
            <span>Or join with a code</span>
            <input
              type="text"
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="ABCD"
              autoCapitalize="characters"
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
          </label>
          <button
            type="submit"
            className="button"
            disabled={!validCode || !preferences.playerName.trim()}
          >
            Join
          </button>
        </form>
        <p className="field__hint">
          Online play needs the battle server running (<code>npm run server</code>). Friends on the
          same network can join through your computer's address.
        </p>
      </Sheet>
    </>
  )
}
