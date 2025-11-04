/* eslint-disable unicorn/no-process-exit */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { IDictionaryEntryWithOriginal } from './parser'

const INPUT_FILE = './validations/data-originals.json'
const OUTPUT_FILE = './validations/validation-sample.json'
const SAMPLE_SIZE = 500

// Optional seed via CLI flag (e.g. `node validate-sample.js --seed 123`)
const argumentSeed = process.argv.find((a) => a.startsWith('--seed'))
const SEED = argumentSeed ? argumentSeed.split('=')[1] : crypto.randomUUID()

// PRNG seeded if provided, otherwise random each run
function seededRandom(seed: string) {
  let h = crypto.createHash('sha256').update(seed).digest()
  let index = 0
  return () => {
    if (index >= h.length - 8) {
      h = crypto.createHash('sha256').update(h).digest()
      index = 0
    }
    const number_ = h.readUInt32LE(index)
    index += 4
    return number_ / 0xff_ff_ff_ff
  }
}

async function createValidationSample() {
  const absPath = path.resolve(INPUT_FILE)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const data: IDictionaryEntryWithOriginal[] | undefined = JSON.parse(
    await fs.readFile(absPath, 'utf8')
  )

  if (!Array.isArray(data)) {
    throw new TypeError('Input JSON is not an array')
  }

  const rand = seededRandom(SEED)
  const shuffled = [...data]

  for (let index = shuffled.length - 1; index > 0; index--) {
    const index_ = Math.floor(rand() * (index + 1))
    ;[shuffled[index], shuffled[index_]] = [shuffled[index_], shuffled[index]]
  }

  const sample = shuffled.slice(0, SAMPLE_SIZE)

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(sample, null, 2), 'utf8')
  console.log(`✅ Wrote ${SAMPLE_SIZE.toString()} entries to ${OUTPUT_FILE}`)
  console.log(`Seed used: ${SEED}`)
}

createValidationSample().catch((error: unknown) => {
  console.error('❌ Failed to create validation sample:', error)
  process.exit(1)
})
