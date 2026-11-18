# Version 1 history

What was built in the original three-phase roadmap (2026-10-20 to 2026-10-27, released as `v1.0.0`).
This is a record, not a to-do list. Current status and next steps are in [roadmap](roadmap.md);
design choices are in [decisions](decisions.md).

| Phase                                              | Status | Git                         |
| -------------------------------------------------- | ------ | --------------------------- |
| 1. Single-player platform                          | Done   | `phase-1-start` → `phase-1` |
| 2. Multiplayer, identity, leaderboards, Quick Duel | Done   | `phase-2-start` → `phase-2` |
| 3. Production polish and launch preparation        | Done   | `phase-3-start` → `phase-3` |

## Phase 1 (tag `phase-1`)

- **Fixes:**
  - Challenge links reject unknown modes and impossible scores.
  - Sheets trap focus.
  - Game keys use one shared rule (`src/ui/useGameKeys.ts`).
- **Rules:**
  - Clocks pause while the rules are open (`pause` and `resume` events, `reduceRounds`).
  - Unfinished dailies resume instead of restarting (`src/game/profile/dailyProgress.ts`).
- **Globe scenes:**
  - Labelled markers, country pulses, coloured and arrowed arcs, and `own` pins.
  - Capital labels, journey start and goal labels, and the Mystery arrow.
- **Modes:**
  - GeoRush: Night Earth, a timer ring, a combo meter, and a review of misses.
  - Mystery and Journey: crosshair placement and Space. Journey also takes typed countries.
  - 11 expeditions.
  - Daily round tips.
  - The answer bar stays above the phone keyboard.
- **Progression:**
  - Passport stamps (worked out from personal bests).
  - 28 looks: pin shapes, trails, glows and titles.
  - Toasts.
  - A Next goal card on Home.
- **Tour:** a guided first game (`src/game/modes/tutorial.ts`, `#/tour`).
- **Shared code:** `useRecordedGame` and `Crosshair`.

## Phase 2 (tag `phase-2`)

- **Server correctness:**
  - An unknown answer id no longer crashes the server.
  - Room changes are guarded.
  - Timers re-arm when they fire early.
  - Views show who has answered, but not what.
  - Views leave out the seed; games are named by `gameId`.
  - A failed join keeps your seat.
  - A room that has gone clears on the client.
  - Online bests are kept apart from bot games.
- **Lobby:**
  - Ready-up.
  - Team sides.
  - Region and time per round.
  - Up to 7 bots, with a skill choice.
  - A cap of 8 players, bots included.
  - Pin shapes and titles (titles chosen from a fixed list).
  - Kick, host hand-over, and back to the lobby for anyone.
  - A name prompt for people joining by link.
- **Connections:**
  - A 30 s seat grace.
  - A 15 s server heartbeat.
  - A 500 ms submit grace.
  - Clock sync from several samples.
  - A reconnecting banner.
  - Restart and kick notices.
  - Name cleaning (NFKC, no control or direction characters).
- **Server platform:**
  - `server/` is split into `config.ts` (env vars), `db.ts` (WAL, numbered migrations on
    `user_version`), `app.ts` (Hono: `/api`, `/health`, built site with hashed-asset caching and a
    single-page fallback), `realtime.ts` (`/ws`) and `index.ts` (boot).
  - One port serves all three. `npm start` runs it in production mode (needs `DAILY_SECRET`).
- **Identity** (`server/auth/*`, `src/net/{api,session,profileSync}.ts`, `src/app/useAccount.ts`):
  - Anonymous players with hashed session tokens, checked nicknames (`obscenity`, `#1234`
    suffixes), email magic links (single use, 15 minutes, rate limited, dev mailbox at
    `/api/dev/mailbox`), Google and GitHub through `arctic` (on only when their env vars are set,
    tested against a mock), versioned profile sync with a keep-cloud or use-device choice, and a
    Settings account section with sign out and "delete my online data".
  - In dev, set `PUBLIC_ORIGIN` to the Vite address so emailed links open the app.
- **Ranked dailies** (`server/daily.ts`, `src/app/useRemoteSession.ts`, `useGameSession.ts`):
  - `ModeRules.viewFor` for the Daily Five, Mystery and Journey; `daily.start` takes its seed from
    its params. Server sessions are stored in `daily_sessions`, with timing flags and counts of
    Rare Earth answers (`daily_answers`); the reveal shows real "% of players" from 30 answers.
  - Games `await session.send(...)`, so a local or remote host works the same way. Without a
    server the daily is "Offline practice — not ranked". The e2e daily tests now play today's
    real date, because the server checks it.

- **Quick Duel** (`server/matchmaking.ts`, `glicko2.ts`, `ratings.ts`, `#/room/QUICK`):
  - Queue with a widening window, a bot offer after 20 s, Glicko-2 ratings (paper example in
    `glicko2.test.ts`), and unrated same-IP, same-account and repeat pairings. The results screen
    shows the rating change or the reason it did not count.
  - The WebSocket now reads the session cookie, so queueing needs a session.
- **Leaderboards** (`server/leaderboards.ts`, `src/screens/LeaderboardScreen.tsx`, `#/leaderboards`):
  - Daily top 100 per puzzle with your rank and percentile, the duel ladder (5 or more games), and
    all-time Daily Five averages (7 or more plays). Flagged results are excluded. Without a server
    the screen says why it is empty. The Daily results show "Ranked #N … you beat X%".

## Phase 3 (tag `phase-3`)

- **Performance.** Done (see [performance](performance.md)): code splitting with a lazy 3D
  chunk, on-demand rendering, a 2048 overlay with incremental paint on phones, hashed and brotli
  assets with cache headers. KTX2 was not tried.
- **Robustness.** Done: an app-level error page with an error id (`src/ui/ErrorBoundary.tsx`), a
  "3D unavailable" notice when WebGL is missing or the scene fails, WebGL context-loss recovery,
  a Try again button when the data cannot load, and entry-by-entry validation of saved, imported
  and cloud profiles with a size cap (`src/game/profile/sanitize.ts`). Tested in
  `e2e/robustness.spec.ts`. `#/crash` (development only) throws on purpose for that test.
- **Polish and accessibility.** Done:
  - `viewport-fit=cover`, `dvh` heights, and left and right safe areas; a phone-landscape layout
    that moves the prompt and controls to the sides; checked by screenshot at phone and tablet
    sizes in both orientations (tablets needed no changes).
  - `e2e/a11y.spec.ts` runs axe (WCAG 2.1 A and AA) on every screen; it found no serious issues.
    A low-time notice is read once to screen readers.
  - Page meta, Open Graph and Twitter tags (the server fills in the site address), a web
    manifest, real icons (`scripts/build-icons.mjs`), a static loading shell and a `noscript`
    message. Contrast over bright parts of the globe was not measured.
- **Balancing, retention.** Done (see [balance](balance.md)): `scripts/simulate.ts` and its
  test, an alias and data audit with fixes, streak freezes (worked out from the daily record, so
  no stored state; one per seven days in a row, two at most) and three weekly goals with XP
  (`src/game/profile/weekly.ts`, shown on the Daily screen). Scoring cutoffs, the GeoRush ramp,
  Journey par bands and Duel damage were not retuned: that needs real player data.
- **Security.** Done (see [security](security.md)): CSP and security headers, origin allowlists on
  writes and the socket, per-address connection, room, join and message limits, five-letter room
  codes, session rotation on sign-in, body limits, and an all-formats anti-cheat test. The
  `security-review` skill could not run without a remote, so the diff was reviewed by hand.
- **Operations.** Prepared, not executed (see [deployment](deployment.md)): the server builds to
  `dist-server/` and `npm start` runs it (JSON logs, `/health/ready`, a token-guarded
  `/admin/counters`), a `Dockerfile`, `docker-compose.yml` and Litestream config, `.env.example`,
  CI with a WebKit project, `scripts/loadtest.ts` (300 players: 21% of a core on average), a privacy
  page and a credits page, and a deployment runbook with prices checked on 2026-10-23.
  At the time the Docker image, the restore drill, CI and WebKit were not run; the
  [readiness report](readiness-report.md) (2026-10-26) records running them and what it fixed.

## Known gaps at v1

- Name It rounds online reveal the country's shape to the client. This is inherent to the round;
  see the decisions log.
- Small regions (for example Oceania without micro-states) give battles fewer rounds than the
  format's maximum.
