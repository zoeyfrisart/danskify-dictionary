import fs from 'node:fs'
import path from 'node:path'

import type { IDictionaryEntry } from '../src/types'

const file = path.resolve('data/data-clean.json')
const data: IDictionaryEntry[] = JSON.parse(
  fs.readFileSync(file, 'utf8')
) as IDictionaryEntry[]

function checkLengthMismatch(entry: IDictionaryEntry): string | null {
  const engelsk = entry.engelsk.trim()
  const dansk = entry.dansk.trim()
  if (!engelsk || !dansk) {
    return null
  }

  const engelskLength = engelsk.length
  const danskLength = dansk.length

  // Skip symbolic or single-letter cases (e.g. "a", "æ", "ø")
  if (engelskLength <= 2 && danskLength <= 2) {
    return null
  }

  const ratio =
    engelskLength > danskLength
      ? engelskLength / danskLength
      : danskLength / engelskLength

  // Flag if they differ wildly in proportional length
  if (ratio > 2.5) {
    return 'length-mismatch'
  }
  return null
}

function isSus(entry: IDictionaryEntry): string[] {
  const flags: string[] = []

  // Basic empty / malformed checks
  if (!entry.engelsk.trim() || !entry.dansk.trim()) {
    flags.push('missing-field')
  }

  // Detect accidental concatenations or non-words
  // Accept only Latin letters (including accents), spaces, hyphens, and apostrophes
  // Explicitly reject parentheses and other leftover markup symbols
  const VALID_DANISH_PATTERN = /^[\p{Script=Latin} \-']+$/u
  if (!VALID_DANISH_PATTERN.test(entry.dansk)) {
    // Only flag if bad symbols actually exist
    if (/[(){}[\]<>;,/]/.test(entry.dansk)) {
      flags.push('contains-delimiters')
    } else {
      flags.push('invalid-chars')
    }
  }

  // Check reversed entries (where english appears Danish-like)
  if (/[æøå]/i.test(entry.engelsk) && !/[æøå]/i.test(entry.dansk)) {
    flags.push('potentially-reversed')
  }

  if (entry.form === 'noun' && entry.engelsk.startsWith('to ')) {
    flags.push('noun-starts-with-to')
  }

  // Weird multiword cases
  const engelskWords = entry.engelsk.split(' ').length
  const danskWords = entry.dansk.split(' ').length
  if (Math.abs(engelskWords - danskWords) > 3) {
    flags.push('word-count-drift')
  }

  // Detect likely OCR or encoding noise
  if (/[\uFFFD]/.test(entry.dansk)) {
    flags.push('encoding-issue')
  }

  if (
    entry.engelsk.length > 40 ||
    entry.dansk.length > 40 ||
    entry.engelsk.length < 2 ||
    entry.dansk.length < 2
  ) {
    // Unlikely short/long cases
    const lengthMismatch = checkLengthMismatch(entry)
    if (lengthMismatch) {
      flags.push(lengthMismatch)
    }
  }

  return flags
}

const flagged = data
  .map((entry) => ({ ...entry, flags: isSus(entry) }))
  .filter((entry) => entry.flags.length > 0)

fs.writeFileSync(
  'validations/sus-entries.json',
  JSON.stringify(flagged, null, 2),
  'utf8'
)

console.log(`Flagged ${flagged.length.toString()} suspicious entries.`)
