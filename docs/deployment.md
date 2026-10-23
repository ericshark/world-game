# Deployment

How to run World Game for real, what it costs, and what to do when something goes wrong.
**Nothing here has been done.** No hosting has been bought, no domain registered, no OAuth app or
email account created, and nothing is deployed. Each of those needs the owner's decision.

What is prepared and what was tested:

| Piece                                           | State                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| Production build (`npm run build`, `npm start`) | Built and run locally; health, counters, headers, brotli verified |
| Load test (`scripts/loadtest.ts`)               | Run locally against the production build (numbers below)          |
| CI (`.github/workflows/ci.yml`)                 | Written; never run (nothing is pushed)                            |
| `Dockerfile`, `docker-compose.yml`, Litestream  | Written; **never built or run**: Docker is not usable here        |
| Backup and restore drill                        | **Not run** (needs Docker or the binaries); steps below           |
| WebKit tests                                    | Configured (`PW_WEBKIT=1`); not run here                          |

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
[Litestream releases](https://github.com/benbjohnson/litestream/releases) (the Dockerfile uses the
`0.5` image tag; pin an exact version after checking the releases page).

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

Fly.io works the same way with `fly launch` and a one-gigabyte volume mounted at `/data`; set
the secrets with `fly secrets set`. Keep it to one machine: two would each have their own rooms.

## Backups

With `LITESTREAM_REPLICA_URL` set, the container restores the database from the bucket when the
disk is empty, then runs the server under `litestream replicate`, which ships every change within
about ten seconds and keeps 72 hours of history. Without it the entrypoint logs a warning and
runs unprotected.

### Restore drill (run this once before trusting it)

This was **not** run. It needs Docker and about ten minutes, and uses MinIO as a stand-in for R2:

```bash
# 1. Start MinIO and the app, with backups pointed at a local bucket.
docker compose --profile backup up -d minio
docker run --rm --network host minio/mc sh -c \
  "mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb local/backups"
# In .env: LITESTREAM_REPLICA_URL=s3://backups/world-game.sqlite
#          LITESTREAM_ENDPOINT=http://minio:9000   LITESTREAM_ACCESS_KEY_ID=minioadmin
#          LITESTREAM_SECRET_ACCESS_KEY=minioadmin
docker compose --profile backup up -d --build app

# 2. Make some data: play a Daily at http://localhost:8789, set a nickname.

# 3. Destroy the disk, as a lost server would.
docker compose stop app && docker compose rm -f app && docker volume rm world-game_data

# 4. Start again: the entrypoint restores from the bucket.
docker compose --profile backup up -d app
docker compose logs app | grep -i restor
# The nickname and the Daily result should still be there.
```

For R2 instead of MinIO, set `LITESTREAM_ENDPOINT` to `https://<account>.r2.cloudflarestorage.com`
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
- CI (`.github/workflows/ci.yml`) runs lint, types, unit tests and an audit, then builds and
  runs the browser tests against the production build in Chromium (desktop and phone) and WebKit.
  Nothing is pushed, so it has not run.

## After launch

Run `npx tsx scripts/loadtest.ts` against a staging copy before expecting a crowd, and run the
`security-review` skill once the repository has a remote to compare against.
