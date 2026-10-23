# Roadmap status

Where the three-phase launch roadmap stands, and how to carry on. The full plan lives at
`~/.claude/plans/pasted-content-id-8702-world-typed-fountain.md`, and design choices are in
[decisions](decisions.md). Last updated 2026-10-23.

## Summary

| Phase                                              | Status             | Git                         |
| -------------------------------------------------- | ------------------ | --------------------------- |
| 1. Single-player platform                          | Done               | `phase-1-start` → `phase-1` |
| 2. Multiplayer, identity, leaderboards, Quick Duel | About a third done | from `phase-2-start`        |
| 3. Production polish and launch preparation        | Not started        | —                           |

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

## Still to do

Work through these in order. Each item should end with tests and a focused commit.

### Phase 2

1. **Server platform.** Nothing is installed yet; checked versions are `hono` 4.13,
   `@hono/node-server` 2.1, `arctic` 3.7 and `obscenity` 0.4. `node:sqlite` works on Node 24.
   - Split `server/index.ts` into `config.ts`, `app.ts` (Hono: `/api/*`, static `dist/`,
     `/health`), `realtime.ts` (ws upgrade, dispatch) and `db.ts` (WAL, numbered migrations).
   - Serve the site and `/ws` from one port.
   - Configure through env vars: `PORT`, `PUBLIC_ORIGIN`, `DATABASE_PATH`, `DAILY_SECRET`,
     `RESEND_API_KEY`, `GOOGLE_*` and `GITHUB_*`.
2. **Identity.**
   - **Anonymous player:** created with an httpOnly session cookie, and the session token is
     stored hashed.
   - **Nickname:** cleaned with `cleanName` from `src/net/protocol.ts`, length 2–20, checked by
     `obscenity`, with a `#1234` suffix for duplicates.
   - **Magic link:** single use, valid for 15 minutes, and rate limited. In dev it goes to a
     console and a dev-only mailbox instead of being emailed.
   - **OAuth:** through `arctic`, enabled only when its env vars are set, and tested against a
     mock.
   - **Profile sync:** versioned, with a "keep cloud" or "use this device" choice when the two
     conflict.
   - **Settings account section:** nickname, sign-in, sign-out, and delete my data.
3. **Ranked dailies.**
   - Seeds come from `HMAC(DAILY_SECRET, number)`. `daily.start` must take the seed from its
     start params; today it calls `dailySeed()` internally.
   - Add a `viewFor` to `ModeRules` that redacts later rounds, open category answers, the seed,
     and Mystery's `targetId` until the game is solved. The hint needs the target's region.
   - Daily sessions are played over HTTP and stored in SQLite: one attempt each, local dates
     within ±1 day of the server's, and answers under 300 ms flagged.
   - Client:
     - Refactor `RoundGame`, `MysteryGame` and `JourneyGame` to react to state changes instead
       of using the return value of `session.send()`, so a remote host works like
       `useLocalSession`.
     - Without a server, fall back to local play labelled "Offline practice — not ranked".
   - Count Daily Rare Earth answers, and show real "% of players" from 30 answers on.
4. **Quick Duel.**
   - A matchmaking queue whose rating window widens over time.
   - After 20 s, an offer of a labelled, unrated bot.
   - Glicko-2 ratings, checked against the paper's worked example.
   - Same-IP or same-account pairs are not rated, and any pair is rated at most 3 times a day.
   - Matches run as a `Room` playing Duel with mixed content.
5. **Leaderboards screen.**
   - Daily: today's top 100, your rank and your percentile.
   - Duel ladder: at least 5 games played.
   - All-time Daily: average over at least 7 plays.
   - With no server, the screen explains itself and never shows fake data.
6. **E2E.**
   - Quick Duel between two contexts.
   - A ranked Daily, and a second attempt refused.
   - Magic-link sign-in, with profile sync to a second context.
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
