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

## Learning is derived from stats; reviews follow due dates (2026-11-17)

Lessons, progress, World knowledge and the Expert tier are computed from the per-country stats, as
Passport stamps are, so there is no lesson state to migrate. The only new stored data are a box and
due date on each skill's stats, a capped table of mix-ups, and the dates regional exams were
passed. Mastery and ranks keep their meaning, because achievements and the Passport rely on them;
Expert sits above them rather than replacing them.

A right answer climbs a box only once the skill is due, so one sitting cannot rush a country to
the top. Players whose stats predate reviews are placed from their recent answers and counted as
due, which re-verifies old mastery instead of trusting it. Learning is local and unranked:
nothing in it touches the server, leaderboards or the ranked dailies. Names are shown in lesson
study and the Atlas only.

## Borders apply everywhere, and certificates do not record them (2026-11-17)

The borders setting applies to ranked play too. It changes no rules or scores, only what is drawn.
A regional exam certificate does not record whether borders were on, so the "gold borderless seal"
from the first plan was not built. Adding it later needs one extra stored flag.

## Dependency updates and releases (2026-11-18)

`npm audit fix` is not run wholesale; only `hono` and `@hono/node-server` were updated, for two
advisories. Dependabot PRs are merged, not closed, once their checks pass. Each 2.0 milestone is
tagged `v2-mN` locally; tags do not deploy. Render deploys from `main`, so a push to `main` needs
the owner's approval. The `codex/world-game-next-level` branch was deleted from the remote.

## Flags: a separate skill, and the artwork (2026-11-18)

`flag-icons` is used because it is MIT, covers all 197 playable places (including XK, TW, PS and
VA) and uses ISO codes the facts file already carries. The licence text is shipped in
`public/flags/LICENSE` and credited on the credits page. Flags are a new `'flag'` skill rather than
a variant of `'name'`, so flag knowledge and naming knowledge stay separate in the review schedule
and the Passport. Mastery, Expert and world knowledge ignore it: knowing a flag says nothing about
where a country is, and ranks stay about geography. Flag rounds are always multiple choice, because
there is no fair way to type a flag. Flag choices and the answer being the country mean the alt
text is empty while a flag is the question. The Daily generator was not changed, so existing
dailies and the golden test are unaffected.

## Major cities: separate place stats and lazy city data (2026-11-19)

Major cities come from Natural Earth populated places compiled by `scripts/build-cities.mjs` from
rules in `data/cities.json` (excluding capitals and cities within 30 km of one, capping at 6 per
country, applying curated includes, excludes and renames, and keeping fold-distinct names across 250
cities). Keeping them in `public/data/cities.json` and lazy-loading on demand avoids adding 29 KB
of city data to the initial bundle when players only use country or flag modes.

Stats live in a capped `profile.places` map (`city:<id>`, up to 600 entries) under skill `'city'`
instead of sharing `profile.countries`. That leaves country Found, Mastered, Expert, world knowledge
and confusion tracking unchanged while sharing the review schedule and Passport summary. City rounds
are Find it only (showing the country disambiguates names and avoids typing 250 global city
spellings) and stay out of Daily, Battle and Ranked play so ranked play stays about countries and
capitals.

## States and provinces: vector shapes at high zoom, shared `PlacePack`, and `profile.places` (2026-11-19)

Prototyping the USA and Germany admin-1 packs exposed how soft the 4096 px (and 2048 px on phones)
equirectangular paint overlay gets at high zoom: 4096 px across 360° gives 11.38 px per degree (5.69
px on phones), so smaller states such as Saarland (0.68°, ~8 px on desktop and ~4 px on phones),
Rhode Island (0.87°, ~10 px), Bremen (0.59°, ~7 px) and Berlin (0.40°, ~5 px) blur into soft blobs
when the camera zooms in to `MIN_CAMERA_DISTANCE = 1.7`. The underlying Blue Marble satellite texture
stays acceptable as a backdrop, so `SubdivisionVectorLayer` draws pack shapes and shared subdivision
borders as 3D vector meshes and line segments directly on the sphere (triangulating polygon rings
with `THREE.ShapeUtils.triangulateShape` and subdividing large triangles so they hug the sphere
above the Earth mesh). Country modes keep the fast reuse-canvas `CountryPaintLayer`.

Each country's admin-1 pack (`public/data/sub/<ID>.json`, built by `scripts/build-subdivisions.mjs`
for `USA`, `CAN`, `MEX`, `BRA`, `AUS`, `IND`, `CHN` and `DEU`) lazy-loads on demand into its own
`CountryIndex` and `NameMatcher` behind `PlacePack`, so `evaluateLocate`, `evaluateIdentify`,
`nameChoices` and `weightByDifficulty` run unchanged with a zero-points distance scaled by the host
country's area (`clamp(sqrt(totalAreaKm2) * 0.38, 350, 1200)`, from 350 km in Germany to ~1,169 km
in the United States and ~1,197 km in Canada). Stats live in `profile.places` under
`sub:<pack>:<unit>` so country Found, Mastered, Expert and world knowledge stay untouched while due
state/province reviews join Learn and Home review counts. States and provinces stay out of Daily,
Battle and Ranked play.

## Polish and launch pass: grouped Home, `/sw.js`, WebP textures, and `usage_counts` (2026-11-23)

- **Grouped Home keeping all sections mounted.** `HomeScreen` groups everything into `Learn` (course
  progress + Explore the Atlas), `Daily`, `Play` (`Pinpoint` featured + 2×2 grid for `GeoRush`,
  `Rare Earth`, `Mystery Country`, `World Journey`), and `Compete` (`World Battle` + `Play online`
  & `Leaderboards`), with `Passport` and `Settings` in the header and a sticky four-button section
  nav (`Learn` / `Daily` / `Play` / `Compete`). Keeping all four sections mounted avoids hiding
  routes behind unmounted tab panels so keyboard discovery and existing screen flows keep working on
  desktop, phone portrait, and phone landscape (`orientation: landscape` and `max-height: 500px`).
  Flat translucent surface fills replaced nested `backdrop-filter` on `.home-nav` and diagonal card
  gradients on `.mode-tile` / `.daily-card` after Chromium SwiftShader screenshots revealed a
  compositor artifact across featured tiles.
- **Deferred service worker + `popover="manual"` update toast.** `scripts/build-sw.mjs` emits
  `dist/sw.js` after `vite build`, precaching the app shell, built JS/CSS assets, core JSON data,
  and 4K WebP textures (`earth-4k.webp` and `night-4k.webp`), while runtime-caching flags,
  subdivision packs, and 8K textures (capped at 250 entries, falling back to 4K offline).
  `src/app/serviceWorker.ts` waits until initial country data and the 3D scene settle (`geo &&
globe.ready`) before registering `/sw.js` so precaching never competes with first-render
  downloads. When a waiting worker arrives, `Toasts` renders it inside a `popover="manual"` top-layer
  region paired with an always-mounted `.sr-only` polite live region and explicit **Reload**
  (`SKIP_WAITING`) and **Dismiss** buttons.
- **WebP globe textures over JPEG or AVIF.** `scripts/build-texture.mjs` encodes the NASA Blue
  Marble & Black Marble equirectangular maps to WebP (`quality: 80, effort: 5`: `672 KB` 4K day,
  `2.4 MB` 8K day, `229 KB` 4K night, `815 KB` 8K night). `scripts/measure-load.mjs` confirmed a
  drop from `1.72 MB` to `1.43 MB` first-visit transfer (76 ms desktop / 252 ms phone FCP) with fast
  decode across Chromium and WebKit and none of AVIF's slow software encode cost.
- **Cookie-less SQLite daily totals (`usage_counts`).** Schema migration #4 adds `usage_counts(day,
event, count)` in `server/db.ts`. `src/net/usage.ts` posts aggregate lifecycle counts (`visit`,
  `mode:*`, `finish:*`) with `credentials: 'omit'` while server code increments `room:created` and
  `duel:matched` directly. `POST /api/usage` (`server/usage.ts`) rate-limits per IP (120/min) and
  never reads cookies or stores player IDs or addresses; `GET /admin/counters` surfaces totals for
  operational visibility without third-party analytics.
