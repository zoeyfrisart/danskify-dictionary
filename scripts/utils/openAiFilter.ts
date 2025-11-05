import 'dotenv/config'
import fs from 'node:fs/promises'
import OpenAI from 'openai'

import type { IDictionaryEntry } from '../../src'

const client = new OpenAI()
const INPUT_FILE = './data/data-removed.json'
const OUTPUT_FILE = './data/data-restored.json'

export async function filterUsingAi() {
  const data = JSON.parse(
    await fs.readFile(INPUT_FILE, 'utf8')
  ) as IDictionaryEntry[]

  const chunk = JSON.stringify(data)

  const prompt = `
Here are the flagged entries (JSON):
${chunk}
Return only the English words (field "engelsk") that are safe, joined by ';;'.
  `.trim()

  const response = await client.chat.completions.create({
    model: 'gpt-5',
    messages: [
      {
        role: 'system',
        content: `You check English→Danish dictionary entries.

Only return English words that are 100% safe for all ages.

Remove anything sexual, violent, hateful, profane, rude, or disturbing.
That includes: body parts, sex acts, insults, slurs, weapons, drugs, crime, death, or religion.

If you are unsure, do NOT include the word.

Output only the SAFE English words, separated by ;; with no extra text.
Example: apple;;table;;happy;;run
`
      },
      { role: 'user', content: prompt }
    ],
    reasoning_effort: 'low',
    max_completion_tokens: 10_000
  })

  const text = response.choices[0]?.message?.content ?? ''
  const restored = new Set(
    text
      .split(';;')
      .map((s) => s.trim())
      .filter(Boolean)
  )

  const restoredEntries = data.filter((entry) => restored.has(entry.engelsk))

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(restoredEntries, null, 2),
    'utf8'
  )

  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  console.log(`✅ Restored ${restoredEntries.length} safe entries`)
}
