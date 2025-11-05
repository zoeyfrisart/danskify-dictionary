/* eslint-disable unicorn/no-process-exit */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { pipeline } from '@xenova/transformers'
import fs from 'node:fs/promises'

import type { IDictionaryEntry } from '../src'
import { filterUsingAi } from './utils/openAiFilter'

const INPUT_FILE = './src/data.json'
const OUTPUT_CLEAN = './data/data-clean.json'
const OUTPUT_REMOVED = './data/data-removed.json'
const OUTPUT_REVIEW = './data/data-review.json'
const OUTPUT_HISTOGRAM = './data/toxicity-histogram.json'

const MODEL = 'Xenova/toxic-bert'
const TOXIC_THRESHOLD = 0.45
const REVIEW_MARGIN = 0.05
const BATCH_SIZE = 64

async function run() {
  console.log('🧠 Loading local toxicity model...')
  const classify = await pipeline('text-classification', MODEL)

  const data = JSON.parse(
    await fs.readFile(INPUT_FILE, 'utf8')
  ) as IDictionaryEntry[]
  const clean: IDictionaryEntry[] = []
  const removed: (IDictionaryEntry & { toxicScore: number })[] = []
  const review: (IDictionaryEntry & { toxicScore: number })[] = []
  const histogram: Record<string, number> = {}

  console.log(`📘 Loaded ${data.length} entries`)
  const totalBatches = Math.ceil(data.length / BATCH_SIZE)

  for (let b = 0; b < totalBatches; b++) {
    const start = b * BATCH_SIZE
    const end = Math.min(start + BATCH_SIZE, data.length)
    const batch = data.slice(start, end)

    const texts = batch.map((entry) => {
      if (entry.dansk.includes('slut')) {
        return entry.engelsk
      }

      return `${entry.engelsk} → ${entry.dansk}`
    })
    const results = await classify(texts, { topk: 3 })

    for (const [index, entry] of batch.entries()) {
      const resultSet = Array.isArray(results[index])
        ? results[index]
        : [results[index]]
      const toxicResult = resultSet.find((r) =>
        /toxic|obscene|hate/i.test(r.label)
      )
      const toxicScore = toxicResult?.score ?? 0

      const bucket = (Math.floor(toxicScore * 20) / 20).toFixed(2)
      histogram[bucket] = (histogram[bucket] ?? 0) + 1

      const diff = Math.abs(toxicScore - TOXIC_THRESHOLD)
      if (toxicScore > TOXIC_THRESHOLD) {
        removed.push({ ...entry, toxicScore })
      } else if (diff <= REVIEW_MARGIN) {
        review.push({ ...entry, toxicScore })
        clean.push(entry)
      } else {
        clean.push(entry)
      }
    }

    if (b % 10 === 0 || b === totalBatches - 1) {
      console.log(`🌀 Processed batch ${b + 1}/${totalBatches}`)
    }
  }

  const topReview = review
    .sort((a, b) => b.toxicScore - a.toxicScore)
    .slice(0, 30)
    .map((r) => ({
      engelsk: r.engelsk,
      dansk: r.dansk,
      score: r.toxicScore.toFixed(3)
    }))

  await fs.writeFile(OUTPUT_CLEAN, JSON.stringify(clean, null, 2))
  await fs.writeFile(OUTPUT_REMOVED, JSON.stringify(removed, null, 2))
  await fs.writeFile(OUTPUT_REVIEW, JSON.stringify(topReview, null, 2))
  await fs.writeFile(OUTPUT_HISTOGRAM, JSON.stringify(histogram, null, 2))

  const removedPct = ((removed.length / data.length) * 100).toFixed(2)
  const reviewPct = ((review.length / data.length) * 100).toFixed(2)

  console.log('\n📊 Toxicity histogram (score bins of 0.05):')
  for (const bin of Object.keys(histogram).sort()) {
    const count = histogram[bin]
    const bar = '█'.repeat(Math.min(20, Math.round(count / 50)))
    console.log(`${bin.padEnd(4)} | ${bar} ${count}`)
  }

  console.log(`\n✅ Filtering complete`)
  console.log(`   Kept: ${clean.length}`)
  console.log(`   Removed: ${removed.length} (${removedPct}%)`)
  console.log(`   Review bin: ${review.length} (${reviewPct}%)`)
  console.log(`\nTop 30 borderline entries:`)
  console.table(topReview)

  try {
    await filterUsingAi()
  } catch (error) {
    console.error(error)
  }
}

run().catch((error: unknown) => {
  console.error('❌ Filtering failed:', error)
  process.exit(1)
})
