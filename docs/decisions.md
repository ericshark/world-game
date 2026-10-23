# Decisions

Short records of choices that shape the code, newest last. Each says what was decided and why,
so later changes can weigh the same trade-offs.

## Game rules are pure and run anywhere

Every mode is a `ModeRules` object: plain-JSON state, with no clock, randomness or rendering
inside. Time arrives in events and randomness comes from a seed. The browser hosts single-player
games (`useLocalSession`), and the Node server hosts battles with the same code. A lint rule keeps
React and three.js out of `src/geo`, `src/game`, `src/net` and `server`.

## Clocks pause by shifting deadlines (2026-10-23)

Timed rounds and the GeoRush clock stop while "How to play" is open. `pause` and `resume` events
record when the clock stopped and move the deadline on by the paused time. The rules still never
read a clock, and a submission made while paused counts as of the pause.

## Daily puzzles resume instead of restarting (2026-10-23)

A daily puzzle's state is saved after every move and restored when it is reopened. This stops
players from quitting a bad Daily to reroll it, and survives an accidental reload. It was chosen
over scoring a partial attempt: the share text and streak stay meaningful, and resuming is kinder.
Saves are keyed by date and seed, so a generator change never forces an old state onto a new
puzzle.

## Stamps come from personal bests (2026-10-23)

Expedition stamps are worked out from `journey:<id>` personal bests rather than stored on their
own, so there is one source of truth and no profile migration.

## Strictness: `strict` yes, `noUncheckedIndexedAccess` no (2026-10-23)

TypeScript 6 makes `strict` the default, so it was already on. `noUncheckedIndexedAccess` would
add about 250 errors, nearly all on `Record<PlayerId, …>` lookups whose keys are known to exist.
Fixing them would mean `!` everywhere without making anything safer, so it stays off. The
challenge-link crash that prompted the question is fixed by validating the input instead.

## Leaderboards need the server to be the referee (2026-10-23, planned)

Anything on a leaderboard (the ranked dailies and Quick Duel) will be played through the server,
with secret daily seeds and one round sent at a time. Personal progress (XP, Passport,
achievements) stays in the browser and is synced; it is not competitive, so it does not need
anti-cheat. Without a server, the Daily falls back to local, unranked play.

## Identity: guests by default, cloud sync only for accounts (2026-10-23)

Every browser gets an anonymous player and an httpOnly session cookie (only its SHA-256 hash is
stored). A nickname is optional; duplicates get a `#1234` suffix, and `#` is not allowed in typed
names. Signing in (emailed link, Google or GitHub) turns that player into an account, or hands the
session to the account's existing player on a second device.

Profiles are uploaded only for signed-in accounts, so guests cost the server nothing and no
progress is stored for people who never asked for it. Sync is versioned (a save names the version
it started from), so two devices cannot silently overwrite each other. When a device and an
account both hold different progress on first sign-in, or both changed since the last sync, the
player chooses which to keep (`planSync` in `src/net/profileSync.ts`).

Magic links open the web app (`/#/signin/<token>`), which then posts the token. Opening the link
does nothing by itself, so mail scanners that prefetch links cannot use them up. Writes must send
JSON, which a form on another site cannot, and cookies are `SameSite=Lax`.

## Ranked dailies are hosted by the server (2026-10-23)

With a game server, the three dailies are played over HTTP (`POST /api/daily/:puzzle/start` and
`/send`). The server runs the same pure rules, stamps every move with its own clock, stores the
state in SQLite and sends back `viewFor` snapshots: no seed, no later rounds, no open category
answers, and Mystery's country only once it is over. Seeds are `HMAC(DAILY_SECRET, puzzle:number)`.
A puzzle is one attempt per player; reopening it resumes. The local date must be within a day of
the server's UTC date. Moves under 300 ms after the previous one set a `flagged` mark (kept off
leaderboards later). Without a server the daily is local practice, labelled as such.

Limits: a player can clear their cookie to become a new guest and play again; that guest is a
separate leaderboard entry. Name It rounds still reveal the country's shape.

## Quick Duel: Glicko-2, and what is allowed to move a rating (2026-10-23)

The public queue pairs players inside a rating window that starts at ±100 and widens by 25 each
second (either player's window may bridge the gap). After 20 s a labelled bot match is offered;
it never changes a rating. A match runs as an ordinary `Room` playing Duel with mixed rounds, so
all the battle rules and reconnection behaviour are reused. Ratings are Glicko-2, each match its
own rating period, and the code is tested against the worked example in Glickman's paper.

A finished match leaves ratings alone when both players share an IP or an account, or when the
same pair has already been rated three times in 24 hours. A player who left and did not return
within the 30 s seat grace loses. Ratings notes are sent to the connection that was seated when
the game ended, so a player who reconnects after the end may not see theirs (the rating itself
is saved).
