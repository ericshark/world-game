// Copies the flag of every playable place from the flag-icons package (MIT) into public/flags/,
// named by lower-case ISO 3166 code, with the package's licence beside them.
//   node scripts/build-flags.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'

const FLAGS_DIR = 'node_modules/flag-icons/flags/4x3'
const OUTPUT_DIR = 'public/flags'

const { countries } = JSON.parse(readFileSync('public/data/facts.json', 'utf8'))
const codes = Object.values(countries).map((facts) => facts.iso2.toLowerCase())

const missing = codes.filter((code) => !existsSync(`${FLAGS_DIR}/${code}.svg`))
if (missing.length > 0) {
  throw new Error(`flag-icons has no flag for: ${missing.join(', ')}`)
}

rmSync(OUTPUT_DIR, { recursive: true, force: true })
mkdirSync(OUTPUT_DIR, { recursive: true })
for (const code of codes) copyFileSync(`${FLAGS_DIR}/${code}.svg`, `${OUTPUT_DIR}/${code}.svg`)
copyFileSync('node_modules/flag-icons/LICENSE', `${OUTPUT_DIR}/LICENSE`)

const bytes = readdirSync(OUTPUT_DIR)
  .filter((name) => name.endsWith('.svg'))
  .reduce((sum, name) => sum + readFileSync(`${OUTPUT_DIR}/${name}`).length, 0)
console.log(`Wrote ${codes.length} flags to ${OUTPUT_DIR} (${Math.round(bytes / 1024)} KB)`)
