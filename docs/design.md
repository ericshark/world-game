# World Game — Design

A browser game played on a realistic 3D globe. The game names a country ("Find Peru"); the player
clicks where they think it is on a borderless satellite-style Earth, then sees the real country
highlighted, how far off they were, and their score.

## Goals

- **Purpose:** personal hobby project, built for fun. May later become a free public site.
- **Players:** geography enthusiasts and people who want to get better at geography.
- **Platform:** desktop web browser only (for now). Runs locally; no hosting yet.
- **Mode:** single-player only.

## Core game: "Find X"

### Round flow

1. Prompt shows **"Find Peru"** and the round counter (e.g. 3 / 10).
2. Globe starts **fully zoomed out at a random rotation** (prevents free hints from the previous round).
3. Player spins/zooms the globe and **places a pin**. The pin can be moved freely.
4. Player presses **Confirm** to lock in the guess (prevents accidental clicks while dragging).
5. Result is revealed:
   - The target country lights up (highlighted outline/fill).
   - A line connects the pin to the nearest point of the target country.
   - **"You clicked Bolivia"** — the country actually clicked is named and outlined too
     (or e.g. "Western Sahara" / "Ocean" when applicable).
   - Distance (km) and points for the round.
   - **Next** button.

### Game structure

- **10 rounds** per game, max **10,000** points. No country repeats within a game.
  If a region's pool is smaller than 10 (e.g. Oceania without micro-states), the game uses the whole pool.
- **Enter** confirms the pin and moves to the next round.
- **No timer** in v1 (possible future "hard" option).

### Scoring

- Click **inside** the target country (or within its hit radius) → **1000** points.
- Click **outside** → points decay smoothly with **distance to the nearest border** of the target,
  reaching 0 at a region-dependent cutoff:
  - World: ~2,000 km (≈950 at 100 km, ≈700 at 500 km, ≈400 at 1,000 km)
  - Continent modes: scaled down (e.g. ~1,000 km for Europe)
- Curve: `1000 × (1 − d/cutoff)^1.3`. Cutoffs: World and Oceania 2,000 km, Europe 1,000 km, other
  continents 1,500 km. All tunable in `src/geo/scoring.ts`.

### Tiny countries

At max zoom (continent view), micro-states and small islands are only a few pixels wide.

- Any country below a size threshold gets an invisible **hit radius of ~30 km** of slack.
- A **"Skip micro-states"** toggle on the start screen excludes them as targets.

## Which places count

- 193 UN members + Vatican City + Palestine, plus **Kosovo** and **Taiwan**.
- Each place carries a **status tag** in data, so the playable list can change without code changes.
- Neutral naming. Clicking Western Sahara reports "Western Sahara", not a country.
- Names are **English only** in v1, stored in a data file to allow translations later.

## Globe & visuals

- Realistic, satellite-style Earth: **NASA Blue Marble** (true color, cloud-free), public domain.
- **No borders, no labels, no city dots.** Optional faint lat/long grid toggle.
- Soft **atmosphere glow** at the limb. **Even lighting**, no night side.
- **Limited zoom:** from whole-Earth view down to **continent view** at most.
  Because of this, the whole Earth is **a single texture on a sphere** — no tile server, no API keys,
  no usage costs.
- Country polygons (for hit-testing, highlighting, distance) come from a public-domain boundary
  dataset (e.g. Natural Earth); they are never drawn until the result reveal.

## Screens

1. **Start** — region picker (World, or a continent), "Skip micro-states" toggle,
   "Practice my weak countries" mode.
2. **Playing** — prompt, round counter, globe, pin + Confirm.
3. **Round result** — reveal as described above, Next.
4. **Game summary** — total / 10,000, list of all 10 rounds, Play again.
5. **Stats** — per-country accuracy, weakest countries first.

## Progress tracking

- Per-country results stored in **browser storage** (no accounts, no backend).
- **"Practice my weak countries"** biases target selection toward countries with poor accuracy:
  a country you always miss is ~20× more likely than one you always find; unseen countries sit between.
- Stats can be reset from the Stats screen. The last start-screen choices are remembered too.

## Tech stack

- **TypeScript + Vite + React**
- **Three.js via react-three-fiber** for the globe
- Static site, no backend. Runs locally for now.

## Out of scope for v1 (possible later)

- "Identify" mode (country highlighted → name it) and "guess from terrain" mode
- Timer / hard difficulty
- Mobile / touch support
- Hosting, daily challenge, leaderboards, accounts, multiplayer
- Shaded-relief imagery toggle
- Translations
