# Performance

How heavy the game is to load and to leave open, measured with `scripts/measure-load.mjs` against
the production build served by `npm start` (Chromium with software WebGL). The phone profile is a
Pixel 7 with 4× CPU slowdown and a 9 Mbit/s, 60 ms connection. Measured 2026-10-23.

| Measure                                      | Before (phase 2) | After    |
| -------------------------------------------- | ---------------- | -------- |
| JavaScript downloaded                        | 1,392 KB         | 329 KB   |
| Everything downloaded (first visit)          | 4.19 MB          | 1.72 MB  |
| Phone: first content on screen               | 1,848 ms         | 604 ms   |
| Phone: loading screen gone                   | 5,519 ms         | 3,684 ms |
| Desktop: first content on screen             | 184 ms           | 124 ms   |
| Phone: idle CPU, globe not moving (Passport) | 6.5 %            | 0 %      |

"Before" served the single 1.37 MB script with no compression (the server did not compress);
"after" serves pre-built brotli files. A CDN in front would narrow the transfer gap but not the
parsing and idle-CPU gains.

## What changed

- **Bundle.** One 1.4 MB script became a small app chunk plus lazily loaded screens and modes.
  The initial JavaScript (React, the app shell and shared pieces) is about 120 KB gzipped, under
  the 150 KB target. three.js, react-three-fiber and drei form one `three` chunk (253 KB brotli)
  that loads with the 3D scene, and is started at once so it downloads beside the menu.
- **Rendering.** The globe draws only when something changes (`frameloop="demand"`). Camera
  flights, pin drops, arc drawing, paint fades, pulses, auto-rotate and view shifts keep
  requesting frames while they run. A still globe uses no CPU.
- **Phones.** The country overlay is 2048 px wide on phones (quarter the memory and repaint
  cost). A reveal that only adds countries (GeoRush) paints just the new ones.
- **Assets.** The country data and textures are requested as `?v=<content hash>` and served with
  a one-year `immutable` cache; built scripts and styles have hashed names with the same
  lifetime. The page itself is `no-cache`. `scripts/precompress.mjs` writes brotli copies at
  build time and the server sends them to browsers that accept them.

KTX2 was not measured. The plan was to adopt it only if it clearly cut load time or GPU memory.
The textures are JPEGs (1.0 MB for the 4096 px phone version, 3.4 MB for the full day texture),
and phones already get the 4096 px tier. GPU-compressed textures would save GPU memory, but need
a build tool and per-device fallbacks; revisit them if real devices run out of memory.
