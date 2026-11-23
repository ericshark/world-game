# World Game — Design

A browser game played on a realistic 3D globe. The game names a country ("Find Peru"); the player
clicks where they think it is on a satellite-style Earth (borders are hidden unless the player switches them on), then sees the real country
highlighted, how far off they were, and their score.

## Goals

- **Purpose:** geography trainer and globe game. Live at <https://world-game-0qhx.onrender.com> and
  installable offline for solo play and Learn.
- **Players:** learners building durable map recall and geography enthusiasts chasing mastery and
  ranked challenges.
- **Platform:** desktop and mobile web browsers, installable via service worker.
- **Modes:** Learn & Atlas (spaced-repetition courses & reference), Pinpoint, GeoRush, Rare Earth,
  Mystery Country, World Journey, Daily World, and World Battle (bots, private rooms, Quick Duel).

## Core game: "Find X"

### Round flow

1. Prompt shows **"Find Peru"** and the round counter (e.g. 3 / 10).
2. Globe starts **fully zoomed out at a random rotation** (prevents free hints from the previous round).
3. Player spins/zooms the globe and **places a pin**. The pin can be moved freely.
4. Player presses **Confirm** to lock in the guess (prevents accidental clicks while dragging).
5. Result is revealed:
   - The target country lights up (highlighted outline/fill).
   - A line connects the pin to the nearest point of the target country.
   - **"You clicked Bolivia"** — the country actually clicked is named and outlined too
     (or e.g. "Western Sahara" / "Ocean" when applicable).
   - Distance (km) and points for the round.
   - **Next** button.

### Game structure

- **10 rounds** per game, max **10,000** points. No country repeats within a game.
  If a region's pool is smaller than 10 (e.g. Oceania without micro-states), the game uses the whole pool.
- **Enter** confirms the pin and moves to the next round.
- **No timer**, except on Hard (20 s a round; see Pinpoint options). Every clock stops while
  "How to play" is open.

### Scoring

- Click **inside** the target country (or within its hit radius) → **1000** points.
- Click **outside** → points decay smoothly with **distance to the nearest border** of the target,
  reaching 0 at a region-dependent cutoff:
  - World: ~2,000 km (≈950 at 100 km, ≈700 at 500 km, ≈400 at 1,000 km)
  - Continent modes: scaled down (e.g. ~1,000 km for Europe)
- Curve: `1000 × (1 − d/cutoff)^1.3`. Cutoffs: World and Oceania 2,000 km, Europe 1,000 km, other
  continents 1,500 km. All tunable in `src/geo/scoring.ts`.

### Tiny countries

At max zoom (continent view), micro-states and small islands are only a few pixels wide.

- Any country below a size threshold gets an invisible **hit radius of ~30 km** of slack.
- A **"Skip micro-states"** toggle on the start screen excludes them as targets.

## Which places count

- 193 UN members + Vatican City + Palestine, plus **Kosovo** and **Taiwan**.
- Each place carries a **status tag** in data, so the playable list can change without code changes.
- Neutral naming. Clicking Western Sahara reports "Western Sahara", not a country.
- Names are **English only** in v1, stored in a data file to allow translations later.

## Globe & visuals

- Realistic, satellite-style Earth: **NASA Blue Marble** (true color, cloud-free), public domain.
- **No labels, no city dots.** Optional faint lat/long grid toggle, and an optional **country borders**
  setting (Settings, or the button in every game's top bar). It is a visual setting that applies in
  every mode, ranked play included: it changes no rules, scores or leaderboards. Lines come from
  `public/data/borders.json`, built from the same shapes used for hit-testing, and load on first use.
- Soft **atmosphere glow** at the limb. **Even lighting**, no night side.
- **Limited zoom:** from whole-Earth view down to **continent view** at most.
  Because of this, the whole Earth is **a single texture on a sphere** — no tile server, no API keys,
  no usage costs.
- Country polygons (for hit-testing, highlighting, distance) come from a public-domain boundary
  dataset (e.g. Natural Earth); they are never drawn until the result reveal.

## Screens

1. **Start** — region picker (World, or a continent), "Skip micro-states" toggle,
   "Practice my weak countries" mode.
2. **Playing** — prompt, round counter, globe, pin + Confirm.
3. **Round result** — reveal as described above, Next.
4. **Game summary** — total / 10,000, list of all 10 rounds, Play again.
5. **Stats** — per-country accuracy, weakest countries first.

## Progress tracking

- Per-country and per-subdivision results, SM-2 review cards, and Passport progression live in
  **browser storage**, with optional account sign-in (email magic link, Google, or GitHub) syncing
  your cloud profile, duel rating, and daily results to SQLite.
- **"Practice my weak countries / cities"** biases target selection toward weak items: a country you
  always miss is ~20× more likely than one you always find; unseen countries sit between.
- Stats can be exported, imported, or reset from the Settings screen. Last start-screen choices are
  remembered too.

## Tech stack

- **TypeScript + Vite + React**
- **Three.js via react-three-fiber** for the globe (with 4K/8K WebP textures and optional borders)
- **Node + Express + WebSocket + SQLite** backend for accounts, online rooms, Quick Duel, daily
  puzzles/leaderboards, and cookie-less daily usage totals
- **Service worker (`/sw.js`)** generated at build time for offline install and updates

## Pinpoint options

Pinpoint's setup combines a few choices:

- **Find it / Name it.** Find it names a place and you pin it. Name It highlights a country (the
  camera flies to it) and you name it. Name It scoring: correct 1,000; correct after the
  first-letter hint 500; naming a neighbor 200; anything else 0.
- **Countries / Capitals** (Find it only). A capital is a point: pins within 25 km score 1,000,
  and points fall to 0 at 1,000 km (World and Oceania), 750 km (other continents) or 500 km
  (Europe). Countries with several official capitals accept any of them.
- **Cities** (Find it only). Major non-capital cities from `public/data/cities.json` (250 cities
  across 70 countries, lazy-loaded). Scored like capitals (25 km bullseye; 0 at 1,000 km, 750 km or
  500 km by region), with "in Country" shown in the prompt. "Practise my weak cities" targets weak
  cities in the pool, and "Skip micro-states" is hidden.
- **States & provinces** (Find it and Name it). One lazy pack per country in
  `public/data/sub/<ID>.json` (United States, Canada, Mexico, Brazil, Australia, India, China and
  Germany). Shapes and internal borders are drawn as 3D vectors so small states stay sharp at high
  zoom, and the zero-points distance scales with the country's size (from 350 km in Germany to
  ~1,200 km in Canada and the United States). "Practise my weak states & provinces" weights by
  per-place stats, and "Skip micro-states" is hidden.
- **Difficulty.**
  - Easy keeps the better-known half of the region (at least 12 countries), scores with
    zero-point distances ×1.4, and offers 4 multiple-choice answers in Name It.
  - Normal plays every country.
  - Hard favours obscure, small countries (up to ~10×), uses distances ×0.75, and gives 20
    seconds a round. When time runs out, the pin already down is scored; with no pin, the round
    scores 0.
- **Night Earth** swaps in NASA's Black Marble city lights. **Practise weak countries** uses the
  stats of the skill being played.

The score stays out of 10,000 with no streak or speed bonus, so games stay comparable. Streaks
show in the HUD, and personal bests are kept per setup.

## GeoRush

- The clock starts at 60 s, and one tap answers. Hits add 2 s, misses cost 3 s and skips cost
  2 s. Banked time is capped at 90 s.
- Hits score 100 × a streak multiplier: ×2 at 3, ×3 at 6, ×4 at 10 and ×5 at 15. A near miss
  (within 1/8 of the region's zero-points distance) scores 40 × the multiplier and keeps the
  streak.
- Targets come from four difficulty bands, and the band rises every 5 hits.
- Sudden death has no clock and no skips; the first miss ends the run.
- Night Earth is an option, with its own personal best.
- The clock is a ring in the HUD, ticking through the last 10 s. A combo meter shows the
  multiplier and how many hits in a row raise it, and the fanfare plays at each step.
- After a run, every miss can be reviewed on the globe.

## Rare Earth

- 5 categories from different kinds, each with 4–40 accepted answers.
- Name a country, then place it. A valid answer scores
  `(100 + 900 × rarity) × (0.25 + 0.75 × placement)`. Wrong or repeated answers score 0.
- Rarity is the share of "likely answer" weight held by more familiar answers, using
  `(0.05 + familiarity)²` weights. It is shown as tiers: Common, Uncommon, Rare, Exotic,
  Legendary.
- Lenient answers are accepted: within ±10 % of numeric thresholds, coasts on marginal seas, and
  islets on the equator.
- Hard hides suggestions and allows 45 s a round.

## Mystery Country

- Guess any country by typing, tapping, or with the crosshair and Space. Each guess shows its
  border-to-border distance and a bearing, and is painted from cold to hot. The latest guess
  pulses and an arrow on the globe points from it towards the answer (500–1,500 km long, never
  reaching it). The globe turns to show typed guesses.
- Score: 1,000 for the first guess, minus 100 per extra guess, with a minimum of 100. After 6
  guesses the continent can be revealed, which costs 2 guesses.
- Normal excludes micro-states; Hard includes everything.

## World Journey

- Move by tapping (or typing) the next country and pressing Go. A land border costs 1 step, and a sea crossing
  to a coast within 500 km costs 2. Tapping an unconnected or forbidden country is a misstep (+1),
  and "Show connections" costs +1.
- Par is the cheapest route, computed with Dijkstra over the travel graph and the expedition's
  rules. Score: 1,000 at par, minus 150 per step over, with a minimum of 100. Stars: 3 at par, 2
  within par + 2, and 1 for finishing.
- Quick journeys pick a pair with par 5–9. The 11 expeditions add rules: countries to avoid,
  coastal-only routes, and waypoints to visit. A test checks that every one can be finished.
- Start and goal are labelled on the globe, and each arrival pulses.
- Expedition stars become **stamps** in the Passport.

## Daily World

- Every puzzle is generated from the local date alone, so everyone sees the same one:
  `daily:<puzzle>:<number>:v1`. Puzzle #1 was 2026-10-01. Changing the generator means bumping
  the version, and a golden test guards it.
- **Daily Five** (the main daily, which drives the streak): find a tier 1–2 country, name a tier
  2–3 country, a Rare Earth category, a tier 2–4 capital, and a tier 4–5 finale. Saturdays are
  played at night, and Sundays end on a micro-state. One attempt, scored out of 5,000. Each round
  shows a one-line chip saying how it works.
- **One attempt** means one: every puzzle is saved after each move, and leaving part-way resumes it
  rather than starting over.
- **Bonus dailies:** a Mystery Country (Normal) and a World Route (a quick journey, World).
- **Hub:** the streak (a day without the Daily Five breaks it; yesterday still counts until
  today's puzzle is played), a countdown, a four-week calendar and a score distribution.
- **Sharing** uses spoiler-free emoji text.

## World Battle

- Everyone gets the same seeded challenges. Rounds are either Pinpoint only, or mixed: find,
  capital, name and Rare Earth.
- Answers are secret until all players have answered or 25 s have passed. Once someone answers,
  the others have at most 10 s more. Everyone's answers are revealed together.
- **Duel:** 6,000 HP each. The lower round score loses HP equal to the gap × a multiplier, which
  is ×1 for two rounds, then +0.5 a round.
- **Party:** 10 rounds; the most points wins.
- **Survival:** 3 lives each. The lowest round score loses a life, but a tie across the whole
  table spares everyone.
- **Teams:** team averages fight a Duel.
- In Rare Earth rounds, players who gave the same valid answer split its points.
- **Bots** (Novice to Cartographer) are players whose answers the rules compute from a seed. They
  are right more often on famous countries, and when someone else has answered they hurry to
  beat the shortened clock.
- After a reveal the game moves on when everyone is ready, or after 8 s.

## Online rooms

- `server/` is a Node WebSocket server that runs the battle rules authoritatively. Rooms have
  four-letter codes, a lobby and host settings (format, round content, bots), with up to 8
  players.
- Clients send only what the player did. The server timestamps it, scores it, keeps the clock,
  and sends each player a view where unrevealed answers are hidden.
- Clients reconnect with a per-room token. Disconnected players never hold up a reveal, and the
  host role passes on if the host leaves. Messages are validated, limited to 4 KB, and
  rate-limited.

### Still needed for public online play

- Hosting: static files on a CDN, plus a WebSocket service with TLS.
- Accounts (passkeys or OAuth), so progress follows players between devices.
- A database for profiles and match history (SQLite or Postgres).
- Public matchmaking with a queue, and ranked play with Glicko-2 ratings.
- Global Daily World leaderboards and percentiles, and real answer frequencies to replace
  estimated rarity.
- Moderation of display names, and abuse reporting.
- Several server instances with room routing (for example, sticky sessions), and room state
  that survives a restart.
- Stronger anti-cheat: check submission timing against the server clock and flag implausible
  answers. Views already leave out later rounds and the answers to open rounds.

## Learn

The part of the game that teaches, rather than tests. Everything below is derived from the saved
per-country stats, so nothing about it is stored beyond two small tables.

- **Review schedule** (`src/game/profile/review.ts`). Each country skill (find it, name it, its
  capital) sits in a Leitner box 0 to 6, with gaps of about 1, 3, 7, 16, 35 and 90 days. A right
  answer moves it up only when it is due, so repeating a country in one sitting does not climb
  the boxes; a wrong answer drops it to box 1. Every mode feeds this through `recordOutcomes`.
  Stats saved before reviews existed are placed from their recent answers and count as due, so
  old progress is checked again rather than assumed.
- **Lessons** (`curriculum.ts`). The course is generated from the data: each region splits into
  UN subregions, and each subregion into lessons of about five countries, taught well-known
  first with neighbours together. A lesson opens with a **study** step (the camera flies to each
  country, with borders, names, capital and neighbours shown), then a quiz.
- **Sessions** (`learn.ts`, `learnQueue.ts`). A lesson asks every skill of its countries not yet
  answered right, plus a few due reviews; a review session asks the most overdue. A question
  missed is asked again once at the end. Naming is multiple choice when new or just forgotten.
  Sessions play through the same `RoundGame` as Pinpoint.
- **World knowledge and Expert.** World knowledge counts each core skill (find it, name it) as
  its box over 4, so a country answered right once counts for a quarter and one remembered across
  weeks counts in full. A country is **Expert** when both core skills are in box 4 or higher.
  Mastery and explorer ranks are unchanged.
- **Mix-ups.** Wrong pins and answers record which country was taken for which, in a capped
  table; the hub offers a drill that asks both of the most confused pairs side by side.
- **Exams and certificates.** A regional exam finds every country of a region once, with no
  help and no re-asks; 90% passes and earns that region's certificate. Whether borders were on is
  not recorded, so a certificate does not distinguish borderless passes.
- **Atlas.** Free exploration with borders on: tap a country for its name, capital, neighbours
  and facts. Names appear only here and in lesson study, never in scored games.

### Flags

Flag artwork is the `flag-icons` package (MIT), copied by `scripts/build-flags.mjs` into
`public/flags/`. Challenges gain `show: 'name' | 'flag'` and a new skill `flag`.

- **Pinpoint target "Flags".** Find it: a flag is shown and the player places its country on the
  globe. Name it: a country is highlighted and the player picks its flag from four, whose decoys
  are look-alikes (Chad and Romania, Indonesia and Monaco, and so on) before neighbours.
- **Accessibility.** A flag that is the question has empty alt text and flag options are named
  "Flag 1" to "Flag 4", because the country is the answer. Flags are named once revealed (the
  `FactCard` flag reads "Flag of ...").
- **Learn.** Lessons add the flag skill; the study card and `FactCard` show the flag.
- **Mastery.** Flags are their own track and do not count towards Found, Mastered, Expert or
  world knowledge.
- Flag rounds are not in battles, dailies or ranked play.

### Major cities

Major non-capital cities (250 cities across 70 countries) live in `public/data/cities.json` and
load on demand so players can learn cities beyond capitals without inflating first load.

- **Prompt & scoring.** City rounds are Find it only, show `in <country>` beneath the city name and
  score by distance using the same bands as capitals (25 km bullseye; 0 at 1,000 km in World and
  Oceania, 750 km on other continents or 500 km in Europe).
- **Learn.** A **Major cities** course switch splits the 250 cities into regional decks of up to
  10 cities, studying and quizzing with borders shown. Due city reviews mix into Learn and Home
  review counts.
- **Atlas & `FactCard`.** Countries list their major cities on `FactCard`, and the Atlas adds a
  **Major cities** marker toggle (showing regional highlights or the selected country's cities) plus
  **Fly to city:** links.
- **Mastery & Passport.** City stats are kept in `profile.places` (`city:<id>`, capped at 600) under
  skill `'city'`, leaving Found, Mastered, Expert, world knowledge and mix-up confusions unchanged.
  Cities are not in battles, dailies or ranked play.

### States and provinces

Natural Earth 1:10m admin-1 states, provinces and territories are compiled by
`scripts/build-subdivisions.mjs` into one lazy pack per country in `public/data/sub/<ID>.json`
(United States 51, Canada 13, Mexico 32, Brazil 27, Australia 8, India 36, China 31, Germany 16).

- **Evaluator & scoring.** Each pack loads into its own `CountryIndex` and `NameMatcher` behind the
  `PlacePack` interface, so `evaluateLocate`, `evaluateIdentify`, `nameChoices` and
  `weightByDifficulty` run unchanged. Zero-points distance scales with the country's total area
  (350 km in Germany up to ~1,200 km in Canada and the United States).
- **Vector rendering.** At high zoom the 4096 px (2048 px on phones) equirectangular paint texture
  only gives a few pixels to small states (Saarland, Bremen, Rhode Island), so
  `SubdivisionVectorLayer` draws pack fills, outlines and internal borders as 3D vector meshes and
  lines directly on the sphere.
- **Surfaces.** Pinpoint adds a **States & provinces** target (Find it and Name it) with a country
  picker. Learn adds a **States & provinces** course switch with a country picker, per-pack progress
  and subregional lessons (study step with vector borders and neighbours, then quiz).
- **Mastery.** Stats live in `profile.places` (`sub:<pack>:<unit>`), feeding due reviews without
  affecting country Found, Mastered, Expert or world knowledge. Not in battles, dailies or ranked
  play.

## Progression

- **Mastery** per country, across all skills: Seen, Found (right at least once), or Mastered
  (3 of the last 4 right in one skill, or right in two skills).
- **Explorer ranks**, by mastered countries: Newcomer, Wanderer (10), Traveller (30),
  Explorer (60), Navigator (100), Cartographer (150), Atlas (197).
- **XP per game:** 60 + 140 × performance + 20 per newly mastered country + 50 per achievement
  - 50 for a daily. Level L needs 100 × L × (L − 1) XP in total.
- **Looks** (28 in all) are purely visual. Pin colours, pin shapes, arc trails (dashed, comet,
  rainbow) and atmosphere glows unlock by level or by particular achievements. Titles are earned
  by achievements.
- **Toasts** announce achievements, level-ups, new looks and countries mastered mid-game.
- **Next goal:** the home screen names the nearest target: completing a region, the next explorer
  rank, or the next level.
- **Achievements:** 34 pure checks over the profile and the finished game.
- **Challenge links** encode the mode, setup, seed and score in the URL hash, so a friend plays
  the same game against your score.
- **Backup:** progress can be downloaded and restored from Settings.

## Platform

- Home screen grouped into **Learn**, **Daily**, **Play** (`Pinpoint` featured plus a compact
  grid for `GeoRush`, `Rare Earth`, `Mystery Country` and `World Journey`), and **Compete** (`World
Battle`, `Play online`, and `Leaderboards`), with `Passport` and `Settings` in the header and a
  sticky four-tab jump bar. Setup sheets remember the last choices.
- Shared HUD, result card (grade, points, fact card with capital, population, neighbours) and
  results screen with personal bests.
- Settings: sound (synthesised with Web Audio), motion (system, reduced or full), km or miles,
  tap or crosshair pin placement, optional country borders, latitude and longitude grid, cloud
  account sync/deletion, backup export/import, and reset progress.
- Keyboard play: arrow keys turn the globe, +/− zoom, Space drops a pin at the screen centre,
  Enter confirms.
- Phones get a bottom-sheet portrait layout, a side-panel landscape layout, a wider field of view
  in portrait, and 4096-wide WebP textures. The answer panel stays above the on-screen keyboard.
- **Globe scenes** hold paints, vector subdivision highlights, pins, arcs, labelled markers
  (capitals, major cities, journey ends) and brief country pulses. The player's own pins and arcs
  carry their chosen looks.
- **Tour:** new players are offered a one-minute guided game, which teaches spinning, zooming,
  placing and confirming with tips that suit touch, mouse or crosshair. It can be replayed from
  Settings.
- **Offline install & updates:** after data and the 3D scene finish loading, the app registers
  `/sw.js` (precache of shell, JS/CSS bundles, core data JSONs, and 4K WebP textures) and surfaces
  waiting service-worker updates in a persistent `popover="manual"` toast with Reload and Dismiss
  controls.
- **First-party anonymous counts:** cookie-less requests (`credentials: 'omit'`) record daily
  aggregate totals for visits, mode launches/finishes, rooms created, and Quick Duel pairings in
  SQLite (`usage_counts`), exposed only to operators via `GET /admin/counters`.

## Future ideas (out of scope for 2.0)

- Physical geography / "Guess from terrain" mode
- Shaded-relief imagery toggle
- Translations
