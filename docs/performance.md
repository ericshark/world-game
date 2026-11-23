# Performance

How heavy the game is to load and to leave open, measured with `scripts/measure-load.mjs` against
the production build served by `npm start` (Chromium with software WebGL). The phone profile is a
Pixel 7 with 4× CPU slowdown and a 9 Mbit/s, 60 ms connection. Baseline measured 2026-10-23; 2.0.0
re-measured 2026-11-23.

| Measure                                      | Before (phase 2) | After (2026-10-23) | 2.0.0 (2026-11-23) |
| -------------------------------------------- | ---------------- | ------------------ | ------------------ |
| JavaScript downloaded                        | 1,392 KB         | 329 KB             | 321 KB             |
| Everything downloaded (first visit)          | 4.19 MB          | 1.72 MB            | 1.43 MB            |
| Phone: first content on screen               | 1,848 ms         | 604 ms             | 252 ms             |
| Phone: loading screen gone                   | 5,519 ms         | 3,684 ms           | 3,182 ms           |
| Desktop: first content on screen             | 184 ms           | 124 ms             | 76 ms              |
| Desktop: loading screen gone                 | —                | —                  | 1,066 ms           |
| Phone: idle CPU, globe not moving (Passport) | 6.5 %            | 0 %                | 0 %                |
| JS heap (idle Passport)                      | —                | —                  | 16.4 MB / 16.9 MB  |

"Before" served the single 1.37 MB script with no compression (the server did not compress);
"after" and "2.0.0" serve pre-built brotli files (`16.4 MB` phone / `16.9 MB` desktop JS heap on
idle Passport). A CDN in front would narrow the transfer gap but not the parsing and idle-CPU gains.

## What changed

- **Bundle.** One 1.4 MB script became a small app chunk plus lazily loaded screens and modes.
  The initial JavaScript downloaded on first load is `321 KB` brotli-compressed (`~120 KB` gzipped for
  the entry shell plus lazily split screens and modes). `three.js`, `react-three-fiber` and `drei`
  form one `three` chunk that loads with the 3D scene and starts immediately beside the menu.
- **Rendering.** The globe draws only when something changes (`frameloop="demand"`). Camera
  flights, pin drops, arc drawing, paint fades, pulses, auto-rotate and view shifts keep
  requesting frames while they run. A still globe uses no CPU.
- **Phones.** The country overlay is 2048 px wide on phones (quarter the memory and repaint
  cost). A reveal that only adds countries (GeoRush) paints just the new ones.
- **Assets & offline.** The country data and textures are requested as `?v=<content hash>` and
  served with a one-year `immutable` cache; built scripts and styles have hashed names with the same
  lifetime. The page and `/sw.js` are served with `no-cache`. `scripts/precompress.mjs` writes
  brotli copies at build time and the server sends them to browsers that accept them. After initial
  data and the 3D globe load, `src/app/serviceWorker.ts` registers `/sw.js` (71 precached URLs for
  the app shell, bundles, core data JSONs, and 4K WebP textures) without slowing first paint.

KTX2 was not measured. The plan was to adopt it only if it clearly cut load time or GPU memory.
In 2.0.0, globe textures moved from JPEG to WebP (`672 KB` for 4K phone day vs `1.0 MB` JPEG;
`2.4 MB` for 8K day vs `3.4 MB` JPEG; `229 KB` 4K night; `815 KB` 8K night), cutting first-visit
transfer by `~290 KB` while keeping fast browser decode. GPU-compressed textures would save GPU
memory, but need a build tool and per-device fallbacks; revisit them if real devices run out of
memory.
