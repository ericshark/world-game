# Deployment

How to run World Game for real, what it costs, and what to do when something goes wrong.
**The step-by-step owner guide is [DEPLOY.md](../DEPLOY.md)** (Fly.io). This page is the background:
the design, sizing, a VM alternative and the backup drill. Nothing is deployed yet; no hosting,
domain, OAuth app or email account exists. Each of those needs the owner's decision.

What was checked is in the [readiness report](readiness-report.md) (2026-10-26).

## The shape of it

One Node process serves the site (`dist/`), the JSON API (`/api`) and the WebSocket (`/ws`) on one
port, with SQLite on a disk. Litestream copies the database to cheap object storage as it changes.
A free CDN (Cloudflare) in front caches the hashed assets and terminates TLS. There is nothing
else to run: no separate database server, queue or cache.

```
players ── Cloudflare (DNS, CDN, TLS) ── VM or Fly machine ── node dist-server/index.js ── SQLite
                                                                        └─ Litestream ── R2 bucket
```

## Costs (checked 2026-10-23; check again before buying)

These are from search results, not the providers' price pages, and prices moved a lot in 2026
(Hetzner raised cloud prices in April and June).

| Item                          | Estimate                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Hetzner Cloud, 2 vCPU / 4 GB  | CX22 was replaced by CX23; reported at about €5.5–6 a month with an IPv4 address (€0.50). Sources disagree: check hetzner.com/cloud |
| or Fly.io shared-cpu-1x, 1 GB | About $5.70–5.90 a month, plus $0.15 per GB-month for the volume (1 GB is plenty)                                                   |
| Cloudflare R2 (backups)       | Free up to 10 GB, 1 million writes and 10 million reads a month; then $0.015 per GB-month                                           |
| Cloudflare DNS and CDN        | Free plan                                                                                                                           |
| Resend (sign-in email)        | Free: 3,000 emails a month, at most 100 a day. Pro is $20 a month for 50,000                                                        |
| Domain                        | About $10–15 a year (not priced here)                                                                                               |
| **Total at launch scale**     | **About $6–8 a month plus the domain**, inside the $5–10 target                                                                     |

Sources: [Hetzner's 2026 price rise](https://findstack.com/resources/hetzner-price-increase-2026),
[a cloud price comparison](https://kimmo.suominen.com/stuff/cpc-2026-08.txt),
[Fly.io pricing](https://fly.io/docs/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/platform/pricing/),
[Resend pricing](https://resend.com/pricing.md),
[Litestream releases](https://github.com/benbjohnson/litestream/releases) (the Dockerfile pins
`0.5.17`, checked in the restore drill on 2026-10-26).

The 100 emails a day on the free Resend plan caps new sign-ins and returning sign-ins together.
At that point move to Pro or add a second sender.

## Sizing

`scripts/loadtest.ts` run against `npm start` on a developer machine (Intel i7-8700K, much faster
than a small VM), 300 simulated players for 60 seconds: 100 in party rooms, 100 playing the
ranked Daily Five over HTTP, 100 queueing for Quick Duels.

| Measure                        | Result                           |
| ------------------------------ | -------------------------------- |
| Errors                         | 0                                |
| Move latency (p50 / p95 / p99) | 1 / 4 / 23 ms                    |
| HTTP latency (p50 / p95 / p99) | 2 / 87 / 275 ms                  |
| Server CPU                     | mean 21 %, peak 85 % of one core |
| Server memory                  | 246 MB                           |

Node runs the game on one core, so a 2 vCPU machine has room for a second process only if you
split traffic, which this design does not do: **one process is the limit**. On a cheaper core
expect roughly two to three times the CPU for the same crowd. Treat these as triggers to move up:

- CPU above 70 % of a core for ten minutes (`/admin/counters` and the host's graphs), or
- move latency p95 above 150 ms in `loadtest`, or
- memory above 60 % of the machine.

The next step is a bigger single machine (a dedicated vCPU plan). Going beyond one process would
need rooms and the queue shared between processes, which is real work and not planned.

## Before launch: decisions and accounts (all need the owner)

1. Pick the host (Hetzner VM or Fly.io) and buy it.
2. Register the domain and point it at Cloudflare.
3. Create the Cloudflare R2 bucket and an API token limited to it.
4. Create the Resend account, verify the sending domain, create an API key.
5. Optional: register Google and GitHub OAuth apps (callbacks below).
6. Set `VITE_PRIVACY_CONTACT` (an email people can write to) when building: the privacy page shows
   it. Have the privacy page reviewed; it describes what the code does and is not legal advice.
7. Make `DAILY_SECRET` (`openssl rand -hex 32`) and `METRICS_TOKEN`, and keep them somewhere safe.
   Changing `DAILY_SECRET` changes every future daily puzzle, so do it only on purpose.

## Settings

`.env.example` lists every variable. The ones a deployment must set:

| Variable                      | Value                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`                    | `production` (the image sets it)                                                           |
| `PUBLIC_ORIGIN`               | `https://your.domain` (cookies, links, CSP and sharing tags use it)                        |
| `DAILY_SECRET`                | the long secret; the server refuses to start in production without it                      |
| `DATABASE_PATH`               | `/data/world-game.sqlite` on the persistent volume                                         |
| `TRUST_PROXY`                 | `1` behind Cloudflare or Caddy, so limits see the player's address                         |
| `CLIENT_IP_HEADER`            | `fly-client-ip` on Fly.io (its proxy appends to `X-Forwarded-For`); empty elsewhere        |
| `RESEND_API_KEY`, `MAIL_FROM` | sign-in email (without them, magic links cannot be sent in production)                     |
| `GOOGLE_*`, `GITHUB_*`        | optional; callbacks `https://your.domain/api/auth/google/callback` and `…/github/callback` |
| `METRICS_TOKEN`               | opens `/admin/counters` for monitoring                                                     |
| `LITESTREAM_*`                | the backup bucket (see below)                                                              |

## Deploy on a VM (Hetzner)

1. Create the server (Ubuntu or Debian), add your SSH key, install Docker and the compose plugin.
2. Install Caddy for TLS (or use Cloudflare's proxy with an origin certificate) and proxy your
   domain to `127.0.0.1:8789`. WebSockets pass through Caddy's `reverse_proxy` unchanged.
3. Copy the repository (or build the image elsewhere and push it to a registry), create `.env`
   from `.env.example`, and run `docker compose up -d --build`.
4. Check `https://your.domain/health/ready`, open the site, play a Daily, make a room.
5. In Cloudflare: proxy the DNS record, set SSL mode to Full (strict), and add a cache rule so
   `/assets/*`, `/textures/*` and `/data/*` cache (they carry long cache headers already).
   Do not cache `/api/*` or `/ws`.

On a VM, set `TRUST_PROXY=1` in `.env` (Caddy replaces `X-Forwarded-For`, so leave
`CLIENT_IP_HEADER` empty), and firewall port 8789 or keep the compose file's `127.0.0.1` binding so
nobody can reach the app around the proxy. With Cloudflare's proxy in front, also allow only
Cloudflare's addresses to reach ports 80 and 443, since `CF-Connecting-IP` is believed as sent.

Fly.io is the recommended path and has its own guide: [DEPLOY.md](../DEPLOY.md). It uses
`fly.toml`: one always-on machine, a volume at `/data`, and `CLIENT_IP_HEADER=fly-client-ip`,
because Fly's proxy appends to `X-Forwarded-For`.

## Backups

With `LITESTREAM_REPLICA_URL` set, the container restores the database from the bucket when the
disk is empty, then runs the server under `litestream replicate`, which ships every change within
about ten seconds and keeps 72 hours of history. Without it the entrypoint logs a warning and
runs unprotected.

### Restore drill (run this once before trusting it)

Run on 2026-10-26 and passed: after the data volume was deleted, the new container restored every
player, the nickname and the started daily, and an old session cookie still worked. It takes about
ten minutes and uses Versity Gateway, a small local S3 server, as a stand-in for R2 (MinIO no longer
publishes images):

```bash
# 1. Start the S3 stand-in (its "backups" bucket is created on start) and the app, backing up to it.
export DAILY_SECRET=$(openssl rand -hex 32) METRICS_TOKEN=drill-token \
  LITESTREAM_REPLICA_URL=s3://backups/world-game.sqlite LITESTREAM_ENDPOINT=http://s3:9000 \
  LITESTREAM_ACCESS_KEY_ID=drilladmin LITESTREAM_SECRET_ACCESS_KEY=drillsecret
docker compose --profile backup up -d --build s3 app
docker compose logs app | grep "replicating to"

# 2. Make some data: play a Daily at http://localhost:8789, set a nickname. Note the counters:
curl -H "Authorization: Bearer drill-token" http://localhost:8789/admin/counters

# 3. Destroy the disk, as a lost server would.
docker compose stop app && docker compose rm -f app && docker volume rm world-game_data

# 4. Start again: the entrypoint restores from the bucket (quietly; Litestream logs no line for it).
docker compose --profile backup up -d app
curl -H "Authorization: Bearer drill-token" http://localhost:8789/admin/counters
# The same players and daily sessions are back, and the nickname with them.

# 5. Clean up.
docker compose --profile backup down -v
```

For R2 instead of the stand-in, set `LITESTREAM_ENDPOINT` to `https://<account>.r2.cloudflarestorage.com`
and use an R2 API token's key pair.

## Rolling back and restoring

- **A bad release:** deploy the previous image (`docker compose up -d` with the old tag, or
  `git checkout <tag> && docker compose up -d --build`). The database schema only moves forward
  (numbered migrations), so a rollback after a release that added a migration keeps the new
  tables; older code ignores tables it does not know. Do not roll back across a migration that
  changed a column's meaning without restoring a backup.
- **A damaged or lost database:** stop the app, delete the volume's database files, start it:
  Litestream restores the latest copy. To go back in time, run
  `litestream restore -timestamp 2026-01-01T12:00:00Z -config /etc/litestream.yml /data/world-game.sqlite`
  inside the container before starting the server.
- **A leaked secret:** rotate it in `.env` and restart. A new `DAILY_SECRET` changes upcoming
  puzzles; a new `METRICS_TOKEN` or API key only needs the restart. Signed-in sessions are
  unaffected by any of these.

## Watching it

- `GET /health` answers while the process is up, `GET /health/ready` also checks the database.
  Point a free uptime monitor (UptimeRobot, Better Stack) at `/health/ready`.
- `GET /admin/counters` with `Authorization: Bearer $METRICS_TOKEN` returns uptime, rooms, sockets,
  queue length, players, accounts, daily sessions, matches and memory.
- Logs are one JSON object per line on standard output (`docker compose logs app`): starts, stops,
  one line per API request (path only, no query string, no email, no address) and errors.
  Browser crashes arrive as `client_error` lines carrying the code the crash page shows the player
  (`id`), the message, a short stack and the screen; search for a code a player quotes.
- CI (`.github/workflows/ci.yml`) runs lint, types, unit tests and an audit, then builds and
  runs the browser tests against the production build in Chromium (desktop and phone) and WebKit.
  It has passed since 2026-10-27; see the readiness report.

## After launch

Run `npx tsx scripts/loadtest.ts` against a staging copy before expecting a crowd, and run the
`security-review` skill once the repository has a remote to compare against.
