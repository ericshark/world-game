// Writes a brotli copy (.br) next to each text file in dist/, for the server to send as is.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'

const ROOT = new URL('../dist', import.meta.url).pathname
const EXTENSIONS = new Set(['.js', '.css', '.json', '.svg', '.html'])
// Smaller than this, brotli saves too little to be worth a second file.
const MIN_BYTES = 1024

let files = 0
let before = 0
let after = 0
function visit(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) visit(path)
    else if (EXTENSIONS.has(extname(name)) && statSync(path).size >= MIN_BYTES) {
      const source = readFileSync(path)
      const packed = brotliCompressSync(source, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
        },
      })
      writeFileSync(`${path}.br`, packed)
      files++
      before += source.length
      after += packed.length
    }
  }
}
visit(ROOT)
console.log(
  `precompress: ${files} files, ${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB`,
)
