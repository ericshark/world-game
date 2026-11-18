# Roadmap

Where World Game 2.0 stands and what comes next. Last updated 2026-11-18. The original v1 build is
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
| M3        | Flags                                        | Next   |          |
| M4        | Major cities                                 | Later  |          |
| M5        | States and provinces (prototype first)       | Later  |          |
| M6        | Polish, offline install, launch pass (2.0.0) | Later  |          |

The site is live at <https://world-game-0qhx.onrender.com> on Render's free plan (v1.0.0 plus
commits up to `59b8d3a`). Hosting is deferred; nothing in M3 onward needs it.

## Up next

1. Merge Dependabot PRs #1 to #5 (vitest, @vitejs/plugin-react, mapshaper, prettier, d3-geo). All
   have green checks. Merged, not closed. Merging into `main` deploys, so ask first.
2. Push the tags `v2-m0`, `v2-m1`, `v2-m2`. They are local only. Tags do not trigger deploys.
3. Build M3 (below).

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

### M3. Flags: next

- Flag artwork from the `flag-icons` npm package (MIT). Confirm the licence text, credit it on the
  credits page, and copy only the needed SVGs into `public/flags/` via `scripts/build-flags.mjs`.
- Every playable place must have a flag. Test it, including XK, TW, PS and VA.
- Locate and Identify challenges gain `show: 'name' | 'flag'`, with a new skill `'flag'`. A "pick
  the flag" round uses look-alike decoys (Chad and Romania, and similar).
- Surfaces: a Pinpoint target "Flags", the lesson study card, `FactCard`, and Learn sessions.
- Do not change the Daily generator. Its golden test must still pass.
- Verification: unit tests, flag e2e specs (desktop and phone), accessibility audit on the new
  screens, production-build e2e run, screenshot check. Commit locally and tag `v2-m3`. Do not push.

### M4. Major cities

- Natural Earth populated places (public domain) into `public/data/cities.json`: about 250
  non-capital cities, capped per country, with curated includes and excludes in `data/`.
  Lazy-loaded.
- `CityChallenge`, scored like capitals, with skill `'city'`. Stats go in a capped `profile.places`
  map (keys `city:<id>`), so per-country stats are unchanged.
- Surfaces: a Pinpoint target "Cities", city decks in Learn, city markers in the Atlas, cities on
  `FactCard`.

### M5. States and provinces (large; prototype first)

- Natural Earth admin-1, one lazy pack per country in `public/data/sub/<ID>.json`. First packs: USA,
  Canada, Mexico, Brazil, Australia, India, China, Germany.
- Packs load into their own `CountryIndex` behind a small interface, so the existing locate and
  identify evaluators run unchanged. Zero-points distance scales with size.
- Main risk: at high zoom the 4096 px paint overlay and the satellite texture go soft. Prototype
  USA and Germany first. Vector drawing may be needed for pack shapes.
- Surfaces: a "States & provinces" target, lessons per pack, per-pack progress. Not in battles,
  dailies or ranked play.

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
