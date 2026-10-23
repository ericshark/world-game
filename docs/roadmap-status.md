# Roadmap status

Where the three-phase launch roadmap stands, and how to carry on. The full plan lives at
`~/.claude/plans/pasted-content-id-8702-world-typed-fountain.md`, and design choices are in
[decisions](decisions.md). Last updated 2026-10-23.

## Summary

| Phase                                              | Status          | Git                         |
| -------------------------------------------------- | --------------- | --------------------------- |
| 1. Single-player platform                          | Done            | `phase-1-start` → `phase-1` |
| 2. Multiplayer, identity, leaderboards, Quick Duel | About half done | from `phase-2-start`        |
| 3. Production polish and launch preparation        | Not started     | —                           |

## Decisions already made with the owner

- **Identity:** anonymous by default (a device identity plus a nickname). Optional sign-in by email
  magic link, or Google/GitHub OAuth, carries a profile across devices.
- **Matchmaking:** a public Quick Duel queue with Glicko-2 ratings. After about 20 s, offer a
  clearly labelled, unrated bot match. Party, Survival and Teams stay private-room only.
- **Hosting target:** about $5–10/mo, on one server. One Node process serves the static site,
  WebSockets and the API, with SQLite plus Litestream and a free CDN in front.
- **Never** buy hosting, deploy publicly, or create OAuth or email accounts without asking first.

## Done

### Phase 1 (tag `phase-1`)

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

### Phase 2 so far

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
  - In dev, set `PUBLIC_ORIGIN` to the Vite address so emailed links open the app.- **Ranked dailies** (`server/daily.ts`, `src/app/useRemoteSession.ts`, `useGameSession.ts`):
  - `ModeRules.viewFor` for the Daily Five, Mystery and Journey; `daily.start` takes its seed from
    its params. Server sessions are stored in `daily_sessions`, with timing flags and counts of
    Rare Earth answers (`daily_answers`); the reveal shows real "% of players" from 30 answers.
  - Games `await session.send(...)`, so a local or remote host works the same way. Without a
    server the daily is "Offline practice — not ranked". The e2e daily tests now play today's
    real date, because the server checks it.

Work through these in order. Each item should end with tests and a focused commit.

### Phase 2

5. **Leaderboards screen.**
   - Daily: today's top 100, your rank and your percentile.
   - Duel ladder: at least 5 games played.
   - All-time Daily: average over at least 7 plays.
   - With no server, the screen explains itself and never shows fake data.
6. **E2E.**
   - Quick Duel between two contexts.
   - A ranked Daily, and a second attempt refused.
   - (Done in `e2e/account.spec.ts`: magic-link sign-in with sync to a second context.)
   - The leaderboard.
   - Then run the full suite and tag `phase-2`.

### Phase 3

- **Performance.**
  - Code-split each mode and screen, and put three.js, r3f and drei in their own vendor chunk.
    The bundle is one 1.37 MB chunk today.
  - Render the globe only on demand (`frameloop="demand"` plus `invalidate()`).
  - Use a 2048 overlay on phones, and paint incrementally.
  - Give assets hashed URLs with cache headers.
- **Robustness.**
  - Error boundaries, a "3D unavailable" fallback, and recovery from WebGL context loss.
  - Retry when loading fails.
  - Deep validation of saved and imported profiles, with a size cap.
- **Polish and accessibility.**
  - A pass over phone landscape and tablet sizes, plus `viewport-fit=cover` and `dvh`.
  - Axe audits.
  - Meta tags, Open Graph, the manifest and icons.
- **Balancing.** A `scripts/simulate.ts` bot simulation, an alias and data audit, streak freezes,
  and weekly goals.
- **Security.**
  - CSP and security headers, and origin allowlists.
  - Per-IP connection and room-creation caps.
  - 5-letter room codes.
  - Run the `security-review` skill.
- **Operations.**
  - Docker and docker-compose, with Litestream tested against MinIO.
  - CI with a WebKit project.
  - `scripts/loadtest.ts`.
  - A privacy page.
  - `docs/deployment.md` with the runbook and re-checked prices.

## Working rules

- Commit focused changes when checks pass. Don't push or rewrite history.
- Before committing, run `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, and
  the relevant `PW_HEADLESS=true npx playwright test`.
- Dev servers start on default port + 1 or above. The app's Vite default is 5174 and the battle
  server's is 8788. Stop everything you start, and check the ports are free.
- Running e2e specs side by side starves the CPU, because every page renders WebGL in software.
  Close browser contexts after multi-player tests (see `e2e/online.spec.ts`).
- Vite's `ws proxy error: ECONNRESET` log lines during e2e are harmless noise.

## Known gaps

- Name It rounds online reveal the country's shape to the client. This is inherent to the round;
  see the decisions log.
- Small regions (for example Oceania without micro-states) give battles fewer rounds than the
  format's maximum.
