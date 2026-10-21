# World Game

Find countries on a borderless, satellite-style 3D globe. The game names a country, you drop a pin
where you think it is, and the real country lights up with your distance and score.

See [docs/design.md](docs/design.md) for the game design.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (port 5174 by default).

## Scripts

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `npm run dev`           | Start the dev server                                      |
| `npm test`              | Run the unit tests (Vitest)                               |
| `npm run build`         | Type-check and build for production                       |
| `npm run lint`          | Lint with oxlint                                          |
| `npm run format`        | Format with Prettier                                      |
| `npm run build:data`    | Rebuild `public/data/countries.json` from Natural Earth   |
| `npm run build:texture` | Rebuild `public/textures/earth.jpg` from NASA Blue Marble |

The generated data and texture live in `public/` and belong in the repo, so the build scripts are
only needed to change them.
Their raw downloads are cached in `.cache/`.

## Layout

- `src/geo/`: coordinates, country lookup, distances and scoring (pure, unit-tested)
- `src/game/`: game state, target selection, stats and settings storage
- `src/globe/`: the Three.js globe (react-three-fiber), reveal overlay, pins and camera flights
- `src/screens/`: start, playing, summary, stats and loading screens
- `data/places.json`: the 197 playable places, with display names, status tags and regions
- `scripts/`: data and texture build scripts

## Credits

Imagery: NASA Blue Marble Next Generation. Borders: Natural Earth. Both are public domain.
