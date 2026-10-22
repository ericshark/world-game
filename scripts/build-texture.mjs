// Builds the globe textures in public/textures/ from NASA imagery (public domain):
// - earth.jpg: Blue Marble Next Generation, cloud-free true colour with shaded topography and
//   bathymetry, December 2004.
// - night.jpg: Black Marble 2016, city lights at night, for the Night Earth modifier.
// Each comes in a full and a 4096-wide "-4k" version for phones and smaller GPUs.
// Run with `npm run build:texture`. Raw downloads are cached in .cache/.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import sharp from 'sharp'

const SOURCES = [
  {
    name: 'earth',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x21600x10800.jpg',
    cache: '.cache/blue-marble-21600.jpg',
  },
  {
    name: 'night',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg',
    cache: '.cache/black-marble-13500.jpg',
  },
]
// 8192 is the largest texture width every desktop GPU supports, and plenty for continent-level
// zoom. Phones get 4096: an 8192 texture takes ~170 MB of GPU memory with mipmaps.
const WIDTHS = { '': 8192, '-4k': 4096 }

mkdirSync('.cache', { recursive: true })
mkdirSync('public/textures', { recursive: true })

for (const source of SOURCES) {
  if (!existsSync(source.cache)) {
    console.log(`Downloading ${source.url}`)
    execFileSync('curl', ['-sSLf', '-o', source.cache, source.url], { stdio: 'inherit' })
  }
  for (const [suffix, width] of Object.entries(WIDTHS)) {
    const output = `public/textures/${source.name}${suffix}.jpg`
    // The sources are larger than sharp's default pixel limit.
    await sharp(source.cache, { limitInputPixels: false })
      .resize(width, width / 2)
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(output)
    const sizeMb = (statSync(output).size / 1024 / 1024).toFixed(1)
    console.log(`Wrote ${output} (${width}x${width / 2}, ${sizeMb} MB)`)
  }
}
