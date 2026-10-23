// Draws the PNG icons and the sharing image from public/favicon.svg and the Earth texture.
//   node scripts/build-icons.mjs
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const icon = readFileSync(new URL('../public/favicon.svg', import.meta.url))
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  await sharp(icon, { density: 384 }).resize(size, size).png().toFile(out(name))
}

// A maskable icon needs the artwork inside the central 80%, on a full-bleed background.
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#02030a' },
})
  .composite([{ input: await sharp(icon, { density: 384 }).resize(384, 384).png().toBuffer() }])
  .png()
  .toFile(out('icon-maskable-512.png'))

// The picture shown when a link is shared: the Earth, with the name over a dark band.
const title = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#02030a" stop-opacity=".92"/>
        <stop offset=".62" stop-color="#02030a" stop-opacity=".55"/>
        <stop offset="1" stop-color="#02030a" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#fade)"/>
    <text x="72" y="300" font-family="Arial, Helvetica, sans-serif" font-size="104" font-weight="700" fill="#ffffff">World Game</text>
    <text x="76" y="368" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#9aaccb">Find every country on a spinning Earth</text>
    <text x="76" y="560" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#ffd54a">Daily puzzles · Duels · Journeys</text>
  </svg>`)
await sharp(new URL('../public/textures/earth-4k.jpg', import.meta.url).pathname)
  .resize(1200, 630, { fit: 'cover', position: 'centre' })
  .composite([{ input: title }])
  .jpeg({ quality: 82 })
  .toFile(out('og-image.jpg'))
console.log('icons written')
