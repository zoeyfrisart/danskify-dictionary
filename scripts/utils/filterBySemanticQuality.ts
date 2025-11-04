import type { Tensor } from '@xenova/transformers'
import { pipeline } from '@xenova/transformers'
import fs from 'node:fs/promises'

import type { IDictionaryEntry } from '../../src/types'

const SEMANTIC_THRESHOLD = 0.35 // below → drop
const VALIDATE_SEMANTICS = process.env.VALIDATE_SEMANTICS === 'true'

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

export async function filterBySemanticQuality(entries: IDictionaryEntry[]) {
  if (!VALIDATE_SEMANTICS) {
    return entries
  }

  console.log('🧠 Semantic quality filter active...')
  const embedder = await pipeline(
    'feature-extraction',
    'Xenova/distiluse-base-multilingual-cased-v2'
  )

  const getVec = async (txt: string): Promise<Float32Array> => {
    const out = await embedder(txt, { pooling: 'mean', normalize: true })
    return (out as Tensor & { data: Float32Array }).data
  }

  const passed: IDictionaryEntry[] = []
  const failed: (IDictionaryEntry & { sim: number })[] = []

  for (const entry of entries) {
    const [v1, v2] = await Promise.all([
      getVec(entry.engelsk),
      getVec(entry.dansk)
    ])
    const sim = cosine(v1, v2)
    if (sim >= SEMANTIC_THRESHOLD) {
      passed.push(entry)
    } else {
      failed.push({ ...entry, sim })
    }
  }

  await fs.writeFile(
    './validations/semantic-rejects.json',
    JSON.stringify(failed, null, 2)
  )
  console.log(
    `✅ Kept ${passed.length.toString()}, 🗑️ Dropped ${failed.length.toString()} low-similarity entries`
  )
  return passed
}
