// Builds public/textures/earth.jpg from NASA Blue Marble Next Generation (public domain):
// cloud-free true colour with shaded topography and bathymetry, December 2004.
// Run with `npm run build:texture`. The raw download is cached in .cache/.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import sharp from 'sharp'

const SOURCE_URL =
  'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x21600x10800.jpg'
const CACHE_PATH = '.cache/blue-marble-21600.jpg'
const OUTPUT_PATH = 'public/textures/earth.jpg'
// 8192 is the largest texture width every desktop GPU supports, and plenty for continent-level zoom.
const OUTPUT_WIDTH = 8192

if (!existsSync(CACHE_PATH)) {
  mkdirSync('.cache', { recursive: true })
  console.log(`Downloading ${SOURCE_URL}`)
  execFileSync('curl', ['-sSLf', '-o', CACHE_PATH, SOURCE_URL], { stdio: 'inherit' })
}

mkdirSync('public/textures', { recursive: true })
// The source is 21600x10800, so sharp needs its default pixel limit lifted.
await sharp(CACHE_PATH, { limitInputPixels: false })
  .resize(OUTPUT_WIDTH, OUTPUT_WIDTH / 2)
  .jpeg({ quality: 85, mozjpeg: true })
  .toFile(OUTPUT_PATH)

const sizeMb = (statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1)
console.log(`Wrote ${OUTPUT_PATH} (${OUTPUT_WIDTH}x${OUTPUT_WIDTH / 2}, ${sizeMb} MB)`)
