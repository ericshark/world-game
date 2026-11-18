import { useApp } from '../app/AppContext'
import { Sheet } from '../ui/Sheet'
import { HomeScreen } from './HomeScreen'

/** Where people can ask about their data; set when building (VITE_PRIVACY_CONTACT). */
const CONTACT = import.meta.env.VITE_PRIVACY_CONTACT as string | undefined

/** What the game keeps, where, and how to get rid of it. */
export function PrivacyScreen({ onClose }: { onClose: () => void }) {
  const { navigate } = useApp()
  return (
    <>
      <HomeScreen />
      <Sheet eyebrow="World Game" title="Privacy" onClose={onClose} wide>
        <div className="legal">
          <p>
            World Game has no ads, no analytics and no tracking. This page says what it does keep.
          </p>

          <h3>On your device</h3>
          <p>
            Your progress (country stats, personal bests, history, XP, achievements, daily results
            and looks), your settings, the name you use in rooms, and any daily puzzle you have not
            finished are saved in your browser. They stay there unless you sign in, and you can
            download or delete them in Settings.
          </p>

          <h3>On the server</h3>
          <ul>
            <li>
              <strong>Everyone</strong> gets a random guest id, kept in one cookie (
              <code>wg_session</code>, readable only by the server, up to six months). It is needed
              for the ranked daily puzzles, Quick Duels and leaderboards. The server also keeps the
              nickname you choose, your ranked daily results and your duel rating.
            </li>
            <li>
              <strong>If you sign in</strong>, it also keeps your email address (or your Google or
              GitHub account id) to recognise you, and a copy of your progress so it follows you
              between devices. Sign-in emails are sent by Resend.
            </li>
            <li>
              Rooms and the Quick Duel queue live only in the server&apos;s memory and disappear
              when the game ends. Addresses are used briefly to limit abuse and are not stored in
              the database.
            </li>
            <li>
              If the game crashes, your browser sends the error message, where in the code it
              happened, the screen you were on and a short error code, so the problem can be found
              and fixed. Nothing else about you is included.
            </li>
            <li>
              The service that hosts the game, and any network in front of it, may log addresses as
              they carry traffic.
            </li>
          </ul>

          <h3>Cookies</h3>
          <p>
            One session cookie, plus a short-lived one while you sign in with Google or GitHub.
            Neither is for advertising or tracking.
          </p>

          <h3>Deleting your data</h3>
          <p>
            Settings → <em>Delete my online data</em> erases your account, nickname, results,
            ratings and cloud progress from the server (backups drop it within three days).{' '}
            <em>Reset all progress</em> clears what is saved in this browser.
          </p>

          {CONTACT && (
            <p>
              Questions about your data: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
            </p>
          )}
          <p>
            <button
              type="button"
              className="button button--link"
              onClick={() => navigate({ name: 'credits' })}
            >
              Credits
            </button>
          </p>
        </div>
      </Sheet>
    </>
  )
}

/** The sources of the pictures and data, and the software the game is made with. */
export function CreditsScreen({ onClose }: { onClose: () => void }) {
  return (
    <>
      <HomeScreen />
      <Sheet eyebrow="World Game" title="Credits" onClose={onClose} wide>
        <div className="legal">
          <h3>Pictures and data</h3>
          <ul>
            <li>
              Earth imagery: NASA Visible Earth, <em>Blue Marble</em> (day) and{' '}
              <em>Black Marble</em> (night). Public domain.
            </li>
            <li>Country borders, capitals, populations and areas: Natural Earth. Public domain.</li>
            <li>
              Flags: <a href="https://github.com/lipis/flag-icons">flag-icons</a> by Panayiotis
              Lipiridis, MIT licence. Copyright (c) 2013 Panayiotis Lipiridis. The full licence text
              is in <a href={`${import.meta.env.BASE_URL}flags/LICENSE`}>flags/LICENSE</a>.
            </li>
            <li>Distances between countries are worked out from those borders.</li>
          </ul>
          <h3>Software</h3>
          <p>
            Made with React, three.js and react-three-fiber, d3-geo, Hono and ws, and built with
            Vite. They are open-source libraries, used under their own licences.
          </p>
        </div>
      </Sheet>
    </>
  )
}
