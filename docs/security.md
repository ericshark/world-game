# Security

What the server defends against, and what it does not. Reviewed by hand on 2026-10-23: the
`security-review` skill could not run, because it compares against `origin/HEAD` and this
repository has no remote. Run it again once there is one.

## In place

- **Sessions.** An httpOnly, `SameSite=Lax` cookie (`Secure` behind https). Only a SHA-256 hash
  of the token is stored. Signing in ends the old session and starts a new one, so a planted
  session is useless afterwards. Guests are rate limited per address and cleaned up when
  nothing is left to come back to.
- **Sign-in.** Magic links are single use, last 15 minutes, are stored hashed, and open the app
  (`/#/signin/…`, a fragment that never reaches a server log) before anything is spent, so mail
  scanners cannot use them up. Per-email and per-address limits; the same answer whether or not
  an address has an account. OAuth uses `state` and PKCE, and links an account by email only when
  the provider says the email is verified.
- **Requests.** Writes must be JSON and come from this site (`Origin` allowlist; `ALLOWED_ORIGINS`
  adds more); cross-site socket upgrades are refused. Bodies over 600 KB are refused before being
  read. Every query is parameterised.
- **Headers.** A content security policy (scripts only from this site, no frames, no plugins),
  `nosniff`, a referrer policy, a permissions policy, HSTS in production behind https, and
  `no-store` on the API. Checked against the production build in a real browser: no violations,
  and the socket connects.
- **Abuse limits.** Per address: 30 sockets, 20 new rooms per 10 minutes, 10 wrong room codes
  per minute, magic links, guest sessions, daily moves and leaderboard reads. At most 1,000
  rooms. A message flood gets one warning, then silence, then a closed socket. Room codes are
  five letters. Behind a proxy set `TRUST_PROXY=1` so addresses come from `CF-Connecting-IP` or
  `X-Forwarded-For`; without it those headers are ignored.
- **Secrets.** Only in environment variables. Emails are not logged in production (the
  development mail transport prints them, and its mailbox endpoint answers only a request from
  this machine that carries no forwarding header).
- **Data.** "Delete my online data" removes the account, its players, sessions, ratings link and
  cloud profile.
- **Cheating.** A test plays every battle format to the end and checks every message each seat
  receives: no seed, no rounds not yet reached, no answer list on an open question, no one else's
  answer before the reveal. Ranked dailies work the same way (`viewFor`).
- **Dependencies.** `npm audit --omit=dev` reports nothing.

## Known gaps

- A guest who clears cookies becomes a new guest and may replay a daily; the replay is a separate
  entry on the boards. Signing in is what ties a result to a person.
- The page needs `style-src 'unsafe-inline'`, because the game and the globe's labels set styles
  from code. Scripts do not.
- Name It rounds online show the country's shape to the client; that is the question.
- Names in rooms and the queue are cleaned of control and direction characters but are not
  checked for language (nicknames are).
- Bots can pace themselves past the 300 ms timing flag; it catches only the crudest scripts.
- No captcha or account lockout. The limits above are what protect sign-in.
- Not yet done: a `security-review` run against a remote, and a penetration test.
