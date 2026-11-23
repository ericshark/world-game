# World Game

A geography game on an interactive 3D globe. Learn countries, capitals, flags, major cities, and states & provinces in spaced-repetition lessons, browse the Atlas, solve the daily puzzles, race the clock, or challenge friends and live opponents online. Installable for offline solo and Learn play.

[Play World Game](https://world-game.ericzwierzynski.dev)

![World Game on a 3D globe with its geography game controls](docs/screenshots/globe.jpg)

## How it works

React runs the games and Three.js (`react-three-fiber`) draws the globe. Play **Pinpoint** (Find it or Name it, with optional borders and states/provinces), **GeoRush**, **Rare Earth**, **Mystery Country**, **World Journey**, **Daily World**, or **World Battle** (against bots, in private online rooms, or in **Quick Duel**). Progress and personal bests live in the browser with optional sign-in sync, while a Node, Hono, WebSocket, and SQLite server runs online rooms, matchmaking, daily puzzles, and leaderboards. Once loaded, a service worker precaches the app, data, and 4K textures for offline play.

## Run locally

Use Node.js 22.12 or later and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, starting at port 5174. For private multiplayer rooms, also run `npm run server` in another terminal. The server starts at port 8788. If it moves to another port, set `WG_SERVER_PORT` to that port when starting Vite.

[Game design](docs/design.md) · [Geography data and credits](docs/data.md) · [Performance](docs/performance.md) · [Security](docs/security.md) · [Deployment](docs/deployment.md) · [Roadmap](docs/roadmap.md)
