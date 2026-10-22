# World Game

A geography game built with React and Three.js. Find a named country on a
borderless 3D globe, drop a pin, and see the country's outline, your distance,
and your score.

## Run locally

Use Node.js 22.12+ and npm. From the project root:

```bash
npm ci
npm run dev
```

Open the URL Vite prints. It starts on port 5174 and tries the next available
port if occupied.

## Useful commands

- `npm test`: run unit tests.
- `npm run e2e`: play through the game in headless Chromium (Playwright). It starts its own
  dev server on port 5180.
- `npm run build`: type-check and build into `dist/`.
- `npm run lint`: lint the code.
- `npm run format:check`: check formatting.

## How it works

- `src/geo/`: coordinates, country lookup, facts, name matching, distance, and scoring.
- `src/game/core/`: the round engine, seeded randomness, and shared game types.
- `src/game/modes/`: each game mode's rules, as pure functions of plain state.
- `src/game/profile/`: saved progress, stats, personal bests, and settings.
- `src/app/` and `src/screens/`: hosting a game in the browser, and the game screens.
- `src/globe/`: globe rendering, country paint overlay, pins, and camera.
- `data/`: curated places, capitals, aliases, and geography facts (see [data](docs/data.md)).

Country data and globe imagery are committed in `public/`. Rebuild them only
when changing assets: `npm run build:data` and `npm run build:texture`.
Downloads are cached in `.cache/`.

See the [game design](docs/design.md) for rules and design details.
Imagery: NASA Blue Marble Next Generation. Borders: Natural Earth. Both are
public domain.
