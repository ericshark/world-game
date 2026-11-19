# Roadmap

Where World Game 2.0 stands and what comes next. Last updated 2026-11-19. The original v1 build is
recorded in [history-v1](history-v1.md); design choices are in [decisions](decisions.md).

2.0 turns the game into a geography trainer: optional borders, then learning and review, then
flags, cities, and states and provinces, then a polish pass. Physical geography is out of scope.

## Status

| Milestone | What                                         | Status | Tag      |
| --------- | -------------------------------------------- | ------ | -------- |
| v1        | Three-phase launch roadmap                   | Done   | `v1.0.0` |
| M0        | Production fixes, backups, CI, Dependabot    | Done   | `v2-m0`  |
| M1        | Optional country borders                     | Done   | `v2-m1`  |
| M2        | Learn: reviews, lessons, Atlas, exams        | Done   | `v2-m2`  |
| M3        | Flags                                        | Done   | `v2-m3`  |
| M4        | Major cities                                 | Done   | `v2-m4`  |
| M5        | States and provinces (prototype first)       | Done   | `v2-m5`  |
| M6        | Polish, offline install, launch pass (2.0.0) | Next   |          |

The site is live at <https://world-game-0qhx.onrender.com> on Render's free plan (v1.0.0 plus
commits up to `59b8d3a`). Hosting is deferred; nothing in M3 onward needs it.

## Up next

1. Dependabot PRs #3 (`mapshaper`), #5 (`d3-geo`) and #4 (`prettier`, rebased) are merged.
2. Tags `v2-m0` to `v2-m3` are pushed. `v2-m4` and `v2-m5` (and M4–M5 on `main`) are local only;
   push when ready to deploy.
3. Build M6 (below).

## Milestones

Each milestone ends with all checks green, a local commit, and a tag `v2-mN`. **Pushing `main`
deploys to production**, so pushes need approval.

### M0. Production blockers: done (`v2-m0`)

- Untracked the empty `.env`. Merged the duplicate deploy docs into [deployment](deployment.md),
  which describes what is live on Render. The Fly.io guide is [deploy-fly](deploy-fly.md).
- `render.yaml` has the four Litestream backup variables (empty until set in Render).
- CI runs on pull requests. Dependabot added.
- Open owner tasks: see [Needs the owner](#needs-the-owner).

### M1. Borders option: done (`v2-m1`)

- Border data is built in `scripts/build-countries.mjs` from the same simplified shapes used for
  hit-testing, into `public/data/borders.json`.
- `src/globe/BorderLines.tsx` draws the lines on the globe, loaded on first use.
- One setting, `showBorders`: a Settings switch plus a game-bar toggle (`aria-pressed`). It applies
  in every mode, including ranked play, and changes no rules or scores.
- Copy no longer calls the game "borderless". Tests: `e2e/borders.spec.ts` (desktop and phone).

### M2. Learn: done (`v2-m2`)

- `src/game/profile/review.ts`: Leitner boxes 0 to 6 (gaps of 1, 3, 7, 16, 35, 90 days). A right
  answer climbs only when due; a miss drops to box 1. Old saves are placed from recent answers and
  count as due.
- `src/game/modes/curriculum.ts` generates lessons from the data (region, subregion, about five
  countries). `learn.ts` and `learnQueue.ts` build sessions, re-ask misses once, and handle exams
  and mix-up drills.
- Screens: `src/app/learn/` (lesson study, play) and `src/screens/learn/` (hub, Atlas).
- Expert tier: both core skills at box 4 or higher. World knowledge is the mean over all countries.
- Routes: `#/learn`, `#/learn/<target>` (`review`, `mixups`, `exam-<region>`, or a lesson id),
  `#/atlas`.
- Tests: `review.test.ts`, `learn.test.ts`, `profile.test.ts`, `router.test.ts`,
  `e2e/learn.spec.ts`, and `a11y.spec.ts` entries.
- Design is in [design](design.md#learn); the reasoning is in [decisions](decisions.md).

### M3. Flags: done (`v2-m3`)

- Artwork from the `flag-icons` npm package 7.6.0 (MIT, Copyright (c) 2013 Panayiotis Lipiridis).
  `scripts/build-flags.mjs` copies the 4:3 SVG of every playable place into `public/flags/<iso2>.svg`
  (197 files, about 1.3 MB, lazy-loaded as images) with the licence beside them. It fails if a
  flag is missing. The credits page names the package and links the licence.
- `show?: 'name' | 'flag'` on Locate and Identify challenges, and a new skill `'flag'`. Flag
  identify rounds always carry four flag `choices`, using look-alike decoys
  (`LOOK_ALIKE_FLAGS` in `targets.ts`; the most confusable flag, such as Romania for Chad, is
  always offered).
- Pinpoint target **Flags**: Find it shows a flag to place on the globe; Name it shows a country
  and asks for its flag. Best keys `pinpoint:flags` and `pinpoint:flags-pick`.
- Learn: lessons ask the flag skill too (pick it while new or forgotten, place it on the globe
  once known). The lesson study card and `FactCard` show the flag.
- The Daily generator is untouched; its golden test passes. Tests: `src/geo/flags.test.ts`,
  additions to `pinpoint.test.ts` and `learn.test.ts`, `e2e/flags.spec.ts`, and `a11y.spec.ts`
  entries.

### M4. Major cities: done (`v2-m4`)

- Natural Earth populated places (public domain) compiled into `public/data/cities.json` (250
  non-capital cities across 70 countries, capped at 6 per country, with curated includes, excludes
  and renames in `data/cities.json`) via `scripts/build-cities.mjs`. Lazy-loaded via
  `src/geo/cities.ts`.
- `CityChallenge`, scored like capitals, with skill `'city'`. Stats go in a capped `profile.places`
  map (limit 600, keys `city:<id>`), leaving per-country stats and ranks unchanged while merging
  into due reviews.
- Surfaces: a Pinpoint target "Cities" (Find it only), regional "Major cities" decks in Learn, city
  markers and "Fly to city:" links in the Atlas, and a "Major cities" row on `FactCard`.

### M5. States and provinces: done (`v2-m5`)

- Natural Earth 1:10m admin-1 states and provinces compiled by `scripts/build-subdivisions.mjs`
  (`npm run build:sub`) into one lazy pack per country in `public/data/sub/<ID>.json` (`USA` 51,
  `CAN` 13, `MEX` 32, `BRA` 27, `AUS` 8, `IND` 36, `CHN` 31, `DEU` 16).
- Each pack loads on demand via `src/geo/subdivisions.ts` into its own `CountryIndex` and
  `NameMatcher` behind the `PlacePack` interface, so `evaluateLocate`, `evaluateIdentify`,
  `nameChoices` and `weightByDifficulty` run unchanged with an area-scaled zero-points distance
  (350 km in Germany up to ~1,200 km in Canada and the United States).
- Prototyping USA and Germany showed that at high zoom (`MIN_CAMERA_DISTANCE = 1.7`) the 4096 px
  (2048 px on phones) equirectangular canvas overlay only gives 4–10 px across small states
  (Saarland, Bremen, Berlin, Rhode Island), making rasterized shapes look soft. Pack fills, outlines
  and internal borders are therefore drawn as 3D vectors on the sphere in
  `src/globe/SubdivisionVectorLayer.tsx` (recorded in [decisions](decisions.md)).
- Surfaces: a Pinpoint target "States & provinces" (Find it and Name it) with a country picker,
  a "States & provinces" course switch in Learn with per-pack progress and lessons (study + quiz),
  and due reviews in `profile.places` (`sub:<pack>:<unit>`). Not in battles, dailies or ranked play.
- Tests: `src/geo/subdivisions.test.ts`, additions to `evaluate.test.ts`, `pinpoint.test.ts` and
  `learn.test.ts`, `e2e/subdivisions.spec.ts`, and `a11y.spec.ts` entries.

### M6. Polish and launch pass (last)

- Home and navigation grouped into Learn, Daily, Play and Compete, using the existing tokens, with
  an `impeccable` critique pass.
- Offline install: a service worker that precaches the shell, data and phone textures, with an
  "update available" toast.
- Lighter imagery (AVIF or WebP) only if `scripts/measure-load.mjs` shows a clear win.
- First-party, cookie-less usage counts in SQLite, added to `/admin/counters`. Update the privacy
  page.
- Accessibility pass on every new screen. Re-measure the table in [performance](performance.md).
- Update `README`, `design.md` and `decisions.md`. Version 2.0.0.

## Hosting (deferred)

Options when ready: an always-on paid Render instance, Fly.io ([deploy-fly](deploy-fly.md)), or
staying on Render Free. The M0 backups make data survive on any of them; only cold starts and
dropped rooms differ. See [deployment](deployment.md).

## Needs the owner

- Approve each push to `main` (it deploys) and each Dependabot merge.
- A Cloudflare R2 bucket, then the four `LITESTREAM_*` values in Render.
- At least one OAuth app (GitHub or Google) or a Resend sender.
- Run the `security-review` skill (the repository now has a remote).
- Set `VITE_PRIVACY_CONTACT` (in `fly.toml` and Render) and have the privacy page reviewed.
- Decide later whether certificates should record whether borders were on, for a "borderless seal".
  That needs an extra stored flag.
- Revisit scoring, the GeoRush ramp, Journey par bands and Duel damage once there is real player
  data. They were not retuned ([balance](balance.md)).
- Hosting choice (above), and any accounts it needs.

## Working rules

- Commit focused changes when checks pass. Don't push `main` or rewrite history. Never buy hosting,
  deploy publicly, or create OAuth or email accounts without asking.
- Leaderboard data must be server-authoritative. Learning stays local and unranked.
- Before committing, run `npm test`, `npm run lint`, `npm run format:check`, `npx tsc -b`,
  `npm run build`, and the relevant `PW_HEADLESS=true npx playwright test`.
- Production-build browser run: `VITE_E2E=1 npm run build`, then
  `E2E_PRODUCTION=1 PW_HEADLESS=true npx playwright test`, then rebuild without `VITE_E2E`.
- Dev servers start on the default port + 1 or above (Vite 5174, battle server 8788). Stop
  everything you start and check ports 5174, 5180, 8788 and 8792 are free.
- Running e2e specs side by side starves the CPU, because every page renders WebGL in software.
  Close browser contexts after multi-player tests (see `e2e/online.spec.ts`).
- Vite's `ws proxy error: ECONNRESET` log lines during e2e are harmless noise.

## Known gaps

- Name It rounds online reveal the country's shape to the client. This is inherent to the round;
  see [decisions](decisions.md).
- Small regions (for example Oceania without micro-states) give battles fewer rounds than the
  format's maximum.
- Certificates do not record whether borders were on.
- Not verified: Fly.io itself, real Resend email, real R2 and real Google or GitHub sign-in. See the
  [readiness report](readiness-report.md).
