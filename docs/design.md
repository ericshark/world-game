# World Game — Design

A browser game played on a realistic 3D globe. The game names a country ("Find Peru"); the player
clicks where they think it is on a borderless satellite-style Earth, then sees the real country
highlighted, how far off they were, and their score.

## Goals

- **Purpose:** personal hobby project, built for fun. May later become a free public site.
- **Players:** geography enthusiasts and people who want to get better at geography.
- **Platform:** desktop and mobile web browsers. Runs locally; no hosting yet.
- **Modes:** Pinpoint, GeoRush, Rare Earth, Mystery Country and World Journey. Daily World and
  World Battle are planned.

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

## Pinpoint options

Pinpoint's setup combines a few choices:

- **Find it / Name it.** Find it names a place and you pin it. Name It highlights a country (the
  camera flies to it) and you name it. Name It scoring: correct 1,000; correct after the
  first-letter hint 500; naming a neighbor 200; anything else 0.
- **Countries / Capitals** (Find it only). A capital is a point: pins within 25 km score 1,000,
  and points fall to 0 at 1,000 km (World and Oceania), 750 km (other continents) or 500 km
  (Europe). Countries with several official capitals accept any of them.
- **Difficulty.**
  - Easy keeps the better-known half of the region (at least 12 countries), scores with
    zero-point distances ×1.4, and offers 4 multiple-choice answers in Name It.
  - Normal plays every country.
  - Hard favours obscure, small countries (up to ~10×), uses distances ×0.75, and gives 20
    seconds a round. When time runs out, the pin already down is scored; with no pin, the round
    scores 0.
- **Night Earth** swaps in NASA's Black Marble city lights. **Practise weak countries** uses the
  stats of the skill being played.

The score stays out of 10,000 with no streak or speed bonus, so games stay comparable. Streaks
show in the HUD, and personal bests are kept per setup.

## GeoRush

- The clock starts at 60 s, and one tap answers. Hits add 2 s, misses cost 3 s and skips cost
  2 s. Banked time is capped at 90 s.
- Hits score 100 × a streak multiplier: ×2 at 3, ×3 at 6, ×4 at 10 and ×5 at 15. A near miss
  (within 1/8 of the region's zero-points distance) scores 40 × the multiplier and keeps the
  streak.
- Targets come from four difficulty bands, and the band rises every 5 hits.
- Sudden death has no clock and no skips; the first miss ends the run.

## Rare Earth

- 5 categories from different kinds, each with 4–40 accepted answers.
- Name a country, then place it. A valid answer scores
  `(100 + 900 × rarity) × (0.25 + 0.75 × placement)`. Wrong or repeated answers score 0.
- Rarity is the share of "likely answer" weight held by more familiar answers, using
  `(0.05 + familiarity)²` weights. It is shown as tiers: Common, Uncommon, Rare, Exotic,
  Legendary.
- Lenient answers are accepted: within ±10 % of numeric thresholds, coasts on marginal seas, and
  islets on the equator.
- Hard hides suggestions and allows 45 s a round.

## Mystery Country

- Guess any country by typing or tapping. Each guess shows its border-to-border distance and a
  bearing, and is painted from cold to hot.
- Score: 1,000 for the first guess, minus 100 per extra guess, with a minimum of 100. After 6
  guesses the continent can be revealed, which costs 2 guesses.
- Normal excludes micro-states; Hard includes everything.

## World Journey

- Move by tapping the next country and pressing Go. A land border costs 1 step, and a sea crossing
  to a coast within 500 km costs 2. Tapping an unconnected or forbidden country is a misstep (+1),
  and "Show connections" costs +1.
- Par is the cheapest route, computed with Dijkstra over the travel graph and the expedition's
  rules. Score: 1,000 at par, minus 150 per step over, with a minimum of 100. Stars: 3 at par, 2
  within par + 2, and 1 for finishing.
- Quick journeys pick a pair with par 5–9. The 8 expeditions add rules: countries to avoid,
  coastal-only routes, and waypoints to visit.

## Platform

- Home screen with mode tiles; setup sheets remember the last choices.
- Shared HUD, result card (grade, points, fact card with capital, population, neighbours) and
  results screen with personal bests.
- Settings: sound (synthesised with Web Audio), motion (system, reduced or full), km or miles,
  tap or crosshair pin placement, latitude and longitude grid, reset progress.
- Keyboard play: arrow keys turn the globe, +/− zoom, Space drops a pin at the screen centre,
  Enter confirms.
- Phones get a bottom-sheet layout, a wider field of view in portrait, and 4096-wide textures.

## Out of scope for v1 (possible later)

- "Guess from terrain" mode
- Hosting, leaderboards, accounts
- Shaded-relief imagery toggle
- Translations
