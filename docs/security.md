# Security

What the server defends against, and what it does not. Whole-repo `security-best-practices` audit
completed on 2026-11-23 across server, auth, realtime WebSocket, config, and frontend surfaces.

## In place

- **Sessions & tokens.** An httpOnly, `SameSite=Lax` cookie (`Secure` behind https). Only a
  SHA-256 hash of the session token is stored. Signing in ends the old session and starts a new
  one, so a planted session is useless afterwards. Logging out passes matching cookie attributes
  (`path`, `secure`, `sameSite: 'Lax'`) to `deleteCookie`. Constant-time SHA-256 digest comparison
  (`tokensEqual` in `server/auth/tokens.ts`) protects `/admin/counters` (`Bearer` regex validation),
  OAuth `state` verification, and room seat reconnect tokens (`randomToken()` in `server/room.ts`).
  Room codes use `crypto.randomInt`. Guests are rate limited per address and cleaned up when
  nothing is left to come back to.
- **Sign-in & profile writes.** Magic links are single use, last 15 minutes, are stored hashed, and
  open the app (`/#/signin/…`, a fragment that never reaches a server log) before anything is
  spent, so mail scanners cannot use them up. Per-email and per-address limits protect
  `/api/auth/magic`, and `/api/auth/magic/verify` adds a per-IP `RateLimiter(30, 15 * 60_000)`.
  The response reveals nothing about whether an address has an account. OAuth uses `state` and
  PKCE, and links an account by email only when the provider verifies it. Outbound Resend and
  GitHub fetches carry a 10 s timeout (`AbortSignal.timeout(10_000)`). `PUT /api/profile` enforces
  `Buffer.byteLength <= MAX_PROFILE_BYTES` and non-negative integer `baseVersion`. Nickname
  collision retries are bounded (`setNickname` in `server/auth/store.ts`).
- **Requests & origin checks.** Writes must be JSON and come from the allowlisted origin (`Origin`
  allowlist; `PUBLIC_ORIGIN` normalized to an `http:` or `https:` `.origin` in `server/config.ts`,
  plus `ALLOWED_ORIGINS`); cross-site socket upgrades are refused. Bodies over 600 KB are refused
  before being read. Malformed URI escapes in `server/precompressed.ts` and `playerOf()`
  (`server/realtime.ts`) are caught instead of throwing. Every SQLite query is parameterised.
- **Headers.** A strict CSP (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`),
  `nosniff`, referrer policy, permissions policy, HSTS in production behind https, and
  `Cache-Control: no-store` on both `/api/*` and `/admin/*` (`server/security.ts`). External links
  in legal/credits screens use `rel="noopener noreferrer"`.
- **Abuse & memory bounds.** Per address: 30 sockets (with empty `connectionsByIp` sets deleted on
  close), 20 new rooms per 10 minutes, 10 wrong room codes per minute, magic links, guest sessions,
  daily moves, leaderboard reads, and 120/min on `POST /api/usage`. At most 1,000 open rooms
  (`MAX_OPEN_ROOMS` checked before `createRoom`). Moving into a room calls `matchmaker.drop(send)`,
  and `leave()` cleans up `ratingOf`. `RateLimiter` evicts its oldest entries if its in-memory map
  grows past 20,000 keys. Behind a proxy set `TRUST_PROXY=1` so addresses come from
  `CLIENT_IP_HEADER` / `X-Forwarded-For`; without it those headers are ignored.
- **Secrets & privacy.** Secrets stay in environment variables. Emails are omitted from production
  logs (`server/log.ts`). First-party daily counts (`POST /api/usage` → `usage_counts`) are sent
  with `credentials: 'omit'` and store only `(day, event, count)`. "Delete my online data" removes
  the account, its players, sessions, ratings link and cloud profile.
- **Cheating & dependencies.** Tests play every battle format and check every seat message: no seed,
  no future rounds, no answer list on an open question, no opponent answer before reveal. Ranked
  dailies use the same server-authoritative projection (`viewFor`). `npm audit --omit=dev` and
  `npm audit --audit-level=critical` run cleanly in CI.

## Known gaps

- A guest who clears cookies becomes a new guest and may replay a daily as a separate entry; signing
  in ties results to an account.
- The page uses `style-src 'unsafe-inline'` for globe label/HUD dynamic styles (`script-src`
  remains `'self'`).
- Name It rounds online show the country's silhouette/shape to the client; that is inherent to the
  question.
- Room and Quick Duel display names strip control/direction characters but are not profanity-filtered
  (account nicknames are).
- Bots can pace guesses past the 300 ms timing flag; it catches only simple automated scripts.
- No CAPTCHA or permanent account lockout on auth endpoints; per-IP and per-email rate limits apply.
- `POST /api/usage` is cookie-less and unauthenticated by design; a distributed flood from many
  addresses can inflate daily aggregate counts without exposing or corrupting player data.
- Real client IPs on Render depend on `CF-Connecting-IP` (`CLIENT_IP_HEADER=cf-connecting-ip`);
  actual forwarding headers on live Render, plus live OAuth, Resend, Litestream R2, and Fly.io
  deployments, have not been tested end-to-end with external production credentials.
