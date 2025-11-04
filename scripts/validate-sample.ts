/* eslint-disable unicorn/no-process-exit */
import type { Tensor } from '@xenova/transformers'
import { pipeline } from '@xenova/transformers'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { IDictionaryEntryWithOriginal } from './parser'

const SAMPLE_FILE = path.resolve('./validations/validation-sample.json')
const REPORT_FILE = path.resolve('./validations/validation-report.json')

// Similarity threshold for flagging suspicious pairs
const SIM_THRESHOLD = 0.35

// Load model (MiniLM, small and fast)
async function makeEmbedder() {
  const embedder = await pipeline(
    'feature-extraction',
    'Xenova/distiluse-base-multilingual-cased-v2'
  )
  return async (text: string): Promise<Float32Array> => {
    const out = await embedder(text, { pooling: 'mean', normalize: true })
    const t = out as Tensor & { data: Float32Array }
    return t.data
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    na = 0,
    nb = 0
  for (const [index, element] of a.entries()) {
    dot += element * b[index]
    na += element * element
    nb += b[index] * b[index]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function main() {
  console.log('📖 Loading sample...')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const data: IDictionaryEntryWithOriginal[] = JSON.parse(
    await fs.readFile(SAMPLE_FILE, 'utf8')
  )

  const getEmbedding = await makeEmbedder()

  const results: {
    engelsk: string
    dansk: string
    form?: string
    sim: number
  }[] = []

  console.log(`🔍 Evaluating ${data.length.toString()} entries...`)
  let index = 0
  for (const entry of data) {
    const engelsk = entry.engelsk.trim()
    const dansk = entry.dansk.trim()

    if (!engelsk || !dansk) {
      continue
    }

    const [v1, v2] = await Promise.all([
      getEmbedding(engelsk),
      getEmbedding(dansk)
    ])

    const sim = cosine(v1, v2)

    results.push({ engelsk: engelsk, dansk: dansk, form: entry.form, sim })

    if (++index % 50 === 0) {
      console.log(`  → processed ${index.toString()}/${data.length.toString()}`)
    }
  }

  const badOnes = results.filter((r) => r.sim < SIM_THRESHOLD)
  const avg = results.reduce((a, b) => a + b.sim, 0) / results.length

  console.log('\n📊 Validation Summary')
  console.log('---------------------')
  console.log(`Average similarity: ${avg.toFixed(3)}`)
  console.log(
    `Low-similarity entries (<${SIM_THRESHOLD.toString()}): ${badOnes.length.toString()}`
  )
  console.log(
    `≈ ${((100 * badOnes.length) / results.length).toFixed(1)}% flagged`
  )

  await fs.writeFile(REPORT_FILE, JSON.stringify(results, null, 2))
  console.log(`💾 Detailed report saved → ${REPORT_FILE}`)

  if (badOnes.length > 0) {
    console.log('\n🚩 Examples of possible mistranslations:')
    for (const r of badOnes.slice(0, 10)) {
      console.log(`  ${r.engelsk} → ${r.dansk} (sim=${r.sim.toFixed(3)})`)
    }
  }
}

main().catch((error: unknown) => {
  console.error('❌ Failed:', error)
  process.exit(1)
})
