# Deploying World Game to Fly.io

> **Not the live setup.** The site currently runs on Render's free plan; see
> [deployment.md](deployment.md). This guide is the prepared path for moving to an
> always-on Fly.io machine. It has not been run.

This is the exact list of things to do, in order, to put World Game on the internet. It takes about
an hour the first time. Everything the code needs is already in the repository (`Dockerfile`,
`fly.toml`, `docker/`). What is left needs **you**: accounts, money, a domain and secrets.

Background, sizing and the reasoning behind each choice live in [deployment.md](deployment.md).
What was checked before this guide was written is in [readiness-report.md](readiness-report.md).

**What you get:** one small Fly.io machine running the site, the API and the real-time games, with the
database on a disk and a live backup in Cloudflare R2. The cost is about **$6–8 a month plus the
domain** (prices last checked 2026-10-23, so check again).

---

## 0. Before you start

You need:

- A credit or debit card (for Fly.io; Cloudflare R2 and Resend have free tiers).
- About an hour.
- A terminal on this computer, in the project folder.

Decide two names now:

- **The Fly app name.** It must be unique on Fly, for example `world-game-eric`. Your site is first
  reachable at `https://<app-name>.fly.dev`.
- **Your domain**, for example `worldgame.example`. It's optional for a first test, but you need it
  for real email sign-in, because Resend sends only from a domain you own.

---

## 1. Create the accounts

Do these in a browser. Write every key down in a password manager as you go, because you need them in
step 4.

### 1a. Fly.io (hosting, required)

1. Sign up at <https://fly.io> and add a card under **Billing**.
2. Install the `flyctl` command-line tool:

   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

3. Close and reopen the terminal (so `fly` is on your PATH), then log in:

   ```bash
   fly auth login
   ```

### 1b. A domain (recommended)

Buy one from any registrar (Cloudflare Registrar, Namecheap, Porkbun: about $10–15 a year). You only
need to be able to add DNS records to it. Steps 6 and 1d use those records.

### 1c. Cloudflare R2 (database backups, strongly recommended)

Without this the game runs, but losing the machine loses every player's results.

1. Sign up at <https://dash.cloudflare.com>. Open **R2 Object Storage** and enable it. It's free up to
   10 GB, but it still asks for a card.
2. **Create bucket**: name it `world-game-backups` and leave the location on Automatic.
3. **Manage R2 API Tokens** → **Create API token**:
   - Permissions: **Object Read & Write**
   - Specify bucket: **only `world-game-backups`**
   - Create it, then copy the **Access Key ID** and **Secret Access Key**. They're shown only once.
4. Copy your **Account ID** (on the R2 overview page). Your endpoint is
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

### 1d. Resend (sign-in emails, needed for "Sign in with email")

Without it, players can still play as guests with a nickname; the game hides email sign-in (and the
**Sign in** button, if Google and GitHub aren't set up either).

1. Sign up at <https://resend.com>.
2. **Domains** → **Add domain** → your domain. Add the DNS records it shows at your registrar, then
   wait until Resend says **Verified**. This can take minutes to hours.
3. **API Keys** → **Create API key** with **Sending access**, limited to that domain. Copy it
   (`re_…`).
4. Your sender is `World Game <noreply@yourdomain>`.

The free plan sends 100 emails a day. If sign-ins grow past that, move to Pro ($20 a month).

### 1e. Google and GitHub sign-in (optional, can be added later)

Skip this for the first launch if you like; the buttons only appear when the keys are set. Use your
**final** address (your domain, not `fly.dev`), because the callback URLs must match exactly.

- **GitHub:** <https://github.com/settings/developers> → **New OAuth App**.
  - Homepage URL: `https://yourdomain`
  - Authorization callback URL: `https://yourdomain/api/auth/github/callback`
  - Copy the **Client ID** and generate a **Client secret**.
- **Google:** <https://console.cloud.google.com> → create a project → **APIs & Services** →
  **OAuth consent screen**: External, app name "World Game", your email. Then **Credentials** →
  **Create credentials** → **OAuth client ID** → **Web application**.
  - Authorized redirect URI: `https://yourdomain/api/auth/google/callback`
  - Copy the **Client ID** and **Client secret**. Publish the consent screen when you're ready, or
    only test users can sign in.

---

## 2. Make your two secrets

Run this twice and keep both values in your password manager:

```bash
openssl rand -hex 32
```

- The first one is `DAILY_SECRET`. It decides every ranked daily puzzle. **Never change it** after
  launch: a new value changes every future puzzle, and anyone who learns it can work out the answers.
- The second one is `METRICS_TOKEN`. It opens the private stats page at `/admin/counters`.

---

## 3. Point the settings at your app

Open [fly.toml](../fly.toml) and change these four lines:

| Line                   | Change it to                                                                 |
| ---------------------- | ---------------------------------------------------------------------------- |
| `app = ...`            | your app name, e.g. `'world-game-eric'`                                      |
| `primary_region = ...` | the region nearest your players (`iad` US East, `lhr` London, `fra`, `syd`…) |
| `VITE_PRIVACY_CONTACT` | an email address people can write to about their data                        |
| `PUBLIC_ORIGIN`        | `'https://<app-name>.fly.dev'` for now (step 6 changes it to your domain)    |

Leave everything else as it is. In particular:

- Leave `auto_stop_machines = 'off'`. If the machine stopped, every game in progress would end.
- Leave `TRUST_PROXY` and `CLIENT_IP_HEADER` alone. Without them, every player would share one rate
  limit.

Then create the app and its disk, in the same region as `primary_region`:

```bash
fly apps create world-game-eric
```

```bash
fly volumes create data --size 1 --region iad --app world-game-eric
```

Fly warns that one volume means no high availability. That's expected: this game is designed for
exactly one machine. Answer **y**.

---

## 4. Store the secrets on Fly

Create a file named `secrets.env` **outside** the project folder (so it can never be committed), for
example in your home folder. Put in the values from steps 1 and 2 and leave out any lines you skipped:

```
DAILY_SECRET=<first openssl value>
METRICS_TOKEN=<second openssl value>
RESEND_API_KEY=re_...
MAIL_FROM=World Game <noreply@yourdomain>
LITESTREAM_REPLICA_URL=s3://world-game-backups/world-game.sqlite
LITESTREAM_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
LITESTREAM_ACCESS_KEY_ID=<R2 access key id>
LITESTREAM_SECRET_ACCESS_KEY=<R2 secret access key>
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Send it to Fly, then delete the file:

```bash
fly secrets import --app world-game-eric < ~/secrets.env
```

```bash
rm ~/secrets.env
```

Check that the names are listed (Fly never shows the values again):

```bash
fly secrets list --app world-game-eric
```

---

## 5. Deploy

From the project folder:

```bash
fly deploy --ha=false
```

Fly builds the Docker image on its own servers (you don't need Docker installed), starts **one**
machine and waits for `/health/ready`. The first build takes about 3–5 minutes.

Check that it's healthy, and that there's exactly one machine:

```bash
fly status --app world-game-eric
```

Look at the logs:

```bash
fly logs --app world-game-eric
```

If backups are set up, you should see a Litestream line `msg="replicating to" type=s3 ...` and
**no** `no-backup` warning. Then open
`https://world-game-eric.fly.dev`.

---

## 6. Use your own domain

1. Ask Fly for a certificate (use your real domain):

   ```bash
   fly certs add yourdomain --app world-game-eric
   ```

2. Fly prints the DNS records to add. Add them at your registrar.
   - **For the bare domain** (`yourdomain`): an `A` record and an `AAAA` record with the addresses
     from `fly ips list --app world-game-eric`.
   - **For a subdomain** (`play.yourdomain`): a `CNAME` to `world-game-eric.fly.dev`.
   - If your DNS is on Cloudflare, set these records to **DNS only (grey cloud)**, not Proxied. Fly
     already handles HTTPS. Cloudflare's proxy would hide the player's real address, so everyone
     would share one rate limit.
3. Wait until this says the certificate is issued:

   ```bash
   fly certs check yourdomain --app world-game-eric
   ```

4. In [fly.toml](../fly.toml), set `PUBLIC_ORIGIN = 'https://yourdomain'`. To keep the `fly.dev` address
   working too, add this line under `[env]`:
   `ALLOWED_ORIGINS = 'https://world-game-eric.fly.dev'`. Then deploy again:

   ```bash
   fly deploy --ha=false
   ```

`PUBLIC_ORIGIN` must be the address people actually use. Cookies, sign-in links, OAuth callbacks
and the security policy are all built from it, so on any other address sign-in and online play are
refused.

---

## 7. Check that everything works (about 10 minutes)

Do each of these on the real site:

- [ ] `https://yourdomain/health/ready` shows `{"status":"ready"}`.
- [ ] The home page loads and the globe spins, on a computer **and** on a phone.
- [ ] Play the **Daily Five** to the end. **Leaderboards** then shows your result.
- [ ] Settings: set a nickname. Then **Sign in** with your email: the email arrives (check spam) and
      the link signs you in.
- [ ] **Play online → Create a room** on the computer, and join it from the phone with the code.
      Play a round.
- [ ] **Quick Duel** on two devices finds a match, or offers a bot after about 20 seconds.
- [ ] Your private stats page answers (it should list rooms, sockets and players):

  ```bash
  curl -H "Authorization: Bearer <METRICS_TOKEN>" https://yourdomain/admin/counters
  ```

- [ ] After a few minutes, the R2 bucket `world-game-backups` in the Cloudflare dashboard has files
      in it.
- [ ] Add a free uptime monitor (UptimeRobot or Better Stack) on `https://yourdomain/health/ready`,
      every 5 minutes, emailing you.
- [ ] Read the Privacy page on the site. It describes what the code does, but it isn't legal advice:
      have someone check it before a wide launch.

---

## 8. Day-to-day

**Ship an update.** Commit your change, then:

```bash
fly deploy --ha=false
```

There are a few seconds of downtime while the one machine restarts. Players in a room see
"Reconnecting" and their seat is kept for 30 seconds.

**Roll back a bad release.** List the past images, then deploy the previous one:

```bash
fly releases --image --app world-game-eric
```

```bash
fly deploy --ha=false --image registry.fly.io/world-game-eric:deployment-XXXXXXXX
```

The database only moves forward, so rolling back code keeps the newer tables. Older code ignores
them.

**Restore the database** after damage or loss. Open a shell on the machine:

```bash
fly ssh console --app world-game-eric
```

Inside it, delete the database. On restart the server restores the latest backup from R2 by itself:

```
rm -f /data/world-game.sqlite /data/world-game.sqlite-wal /data/world-game.sqlite-shm
exit
```

```bash
fly apps restart world-game-eric
```

To go back to a moment in time instead, do this inside the shell before `exit`:
`litestream restore -timestamp 2026-11-01T12:00:00Z -config /etc/litestream.yml -o /data/restored.sqlite /data/world-game.sqlite`.
Then move `restored.sqlite` over `world-game.sqlite`, remove the `-wal` and `-shm` files, and
restart.

**Rotate a leaked key.** Set the new value and Fly restarts the machine:

```bash
fly secrets set RESEND_API_KEY=re_new --app world-game-eric
```

Don't rotate `DAILY_SECRET` unless it truly leaked, because it changes every future puzzle.

**Watch it.** Check `fly logs`, the Fly dashboard's CPU and memory graphs, and `/admin/counters`.
Move up to a bigger machine (`fly scale vm shared-cpu-2x`) if CPU stays above 70% for ten minutes.
**Never** run `fly scale count 2`: two machines would each have their own rooms and their own
database.

---

## Costs (check before buying)

| Item                                  | About                                       |
| ------------------------------------- | ------------------------------------------- |
| Fly.io shared-cpu-1x, 1 GB, always on | $5.70–5.90 a month                          |
| Fly volume, 1 GB                      | $0.15 a month                               |
| Cloudflare R2                         | Free up to 10 GB                            |
| Resend                                | Free up to 3,000 emails a month (100 a day) |
| Domain                                | $10–15 a year                               |
| **Total**                             | **About $6–8 a month plus the domain**      |

## If something goes wrong

| Symptom                                                       | Likely cause and fix                                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Deploy fails: `DAILY_SECRET must be set`                      | Step 4 was skipped. Run `fly secrets list` and import again.                                                               |
| Site loads, but sign-in or rooms say "came from another site" | `PUBLIC_ORIGIN` isn't the address in the browser bar. Fix it in `fly.toml` (or add `ALLOWED_ORIGINS`) and deploy.          |
| Sign-in email never arrives                                   | The Resend domain isn't verified yet, `MAIL_FROM` isn't on that domain, or the 100-a-day limit was hit. Check `fly logs`.  |
| Log says `no-backup`                                          | The `LITESTREAM_*` secrets are missing or misspelled.                                                                      |
| Players get "Slow down" or can't connect                      | `TRUST_PROXY` or `CLIENT_IP_HEADER` were removed from `fly.toml`, or Cloudflare's orange-cloud proxy is on.                |
| A player quotes an error code from "Something went wrong"     | Find it with `fly logs --app world-game-eric --no-tail \| grep <code>`: the `client_error` line has the message and stack. |
| Rooms vanish at random                                        | More than one machine is running (`fly status`). Scale back with `fly scale count 1`.                                      |
