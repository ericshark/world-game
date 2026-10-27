# World Game

A geography game on a realistic, borderless 3D globe, built with React and
Three.js. It has seven ways to play:

- **Pinpoint:** find countries and capitals, or name them, optionally by night.
- **GeoRush:** find as many countries as you can against the clock.
- **Rare Earth:** name the rarest country that fits a category, then find it.
- **Mystery Country:** close in on a hidden country, hot and cold.
- **World Journey:** cross the world one border at a time.
- **Daily World:** the same puzzles for everyone, every day.
- **World Battle:** play against bots, or friends in private online rooms.

Progress, achievements and personal bests are kept in your browser, and follow you to other
devices if you sign in.

## Run locally

Use Node.js 22.12+ and npm. From the project root:

```bash
npm ci
npm run dev
```

Open the URL Vite prints. It starts on port 5174 and tries the next available
port if occupied.

### Playing with friends

Online rooms need the battle server running alongside the dev server:

```bash
npm run server
```

It listens on port 8788, or the next free one. The dev server forwards `/ws` to
it. If the server ends up on another port, start Vite with `WG_SERVER_PORT`
set to that port.

To play on your local network, run `npm run dev -- --host` and open the
network URL on other devices.

## Deploying

[DEPLOY.md](DEPLOY.md) is the step-by-step guide (Fly.io). What was checked before launch is in
the [readiness report](docs/readiness-report.md).

## Useful commands

- `npm test`: run unit tests.
- `npm run e2e`: play through every mode in headless Chromium (Playwright),
  at desktop and phone sizes. It starts its own servers on ports 5180 and 8792.
- `npm run server:watch`: run the battle server and restart it on changes.
- `npm run build`: type-check and build into `dist/`.
- `npm run lint`: lint the code.
- `npm run format:check`: check formatting.

## How it works

- `src/geo/`: coordinates, country lookup, facts, name matching, distance, and scoring.
- `src/game/core/`: the round engine, seeded randomness, and shared game types.
- `src/game/modes/`: each game mode's rules, as pure functions of plain state.
- `src/game/profile/`: saved progress, stats, personal bests, and settings.
- `src/app/` and `src/screens/`: hosting games in the browser, and the screens.
- `src/net/` and `server/`: the battle protocol, and the room server that runs
  the same rules.
- `src/globe/`: globe rendering, country paint overlay, pins, and camera.
- `data/`: curated places, capitals, aliases, and geography facts (see [data](docs/data.md)).

Country data and globe imagery are committed in `public/`. Rebuild them only
when changing assets: `npm run build:data` and `npm run build:texture`.
Downloads are cached in `.cache/`.

See the [game design](docs/design.md) for rules and design details.
Imagery: NASA Blue Marble Next Generation. Borders: Natural Earth. Both are
public domain.
