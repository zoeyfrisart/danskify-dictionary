/* eslint-disable unicorn/no-process-exit */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type { Tensor } from '@xenova/transformers'
import { pipeline } from '@xenova/transformers'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { IDictionaryEntry, WordForm } from '../src/types'
import { filterBySemanticQuality } from './utils/filterBySemanticQuality'

const TXT_FILE = './en-da-enwiktionary.txt'
const OUTPUT_FILE = './src/data.json'
const OUTPUT_FILE_WITH_ORIGINALS = './validations/data-originals.json'
const REJECTED_SEE_FILE = './validations/see-rejected.json'
const VALIDATE_SEMANTICS = process.env.VALIDATE_SEMANTICS === 'true'

export const SIM_THRESHOLD = 0.42

// -------------------------------------------------------------
// Embedding utilities (Xenova model)
// -------------------------------------------------------------
async function makeEmbedder() {
  const embedder = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  )
  const cache = new Map<string, Float32Array>()

  return async (text: string): Promise<Float32Array> => {
    const key = text.toLowerCase()
    if (cache.has(key)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return cache.get(key)!
    }

    const result = await embedder(text, { pooling: 'mean', normalize: true })
    const tensor = result as Tensor & { data: Float32Array }
    const vec = tensor.data
    cache.set(key, vec)
    return vec
  }
}

// -------------------------------------------------------------
// SEE resolution with semantic validation
// -------------------------------------------------------------
async function resolveSEEReferencesSemantically(
  seeReferences: {
    from: string
    to: string
    form?: string
    context?: string
    originalLine: string
  }[],
  entries: IDictionaryEntryWithOriginal[]
): Promise<IDictionaryEntryWithOriginal[]> {
  const getVec = await makeEmbedder()

  const accepted: IDictionaryEntryWithOriginal[] = []
  const rejected: { from: string; to: string; sim: number }[] = []

  for (const reference of seeReferences) {
    const targets = entries.filter(
      (entry) => entry.engelsk.toLowerCase() === reference.to.toLowerCase()
    )
    if (targets.length === 0) {
      continue
    }

    const sourceVec = await getVec(reference.from)
    const tgtVec = await getVec(reference.to)
    const sim = cosine(sourceVec, tgtVec)

    if (sim < SIM_THRESHOLD) {
      rejected.push({ from: reference.from, to: reference.to, sim })
      continue
    }

    for (const target of targets) {
      accepted.push({
        engelsk: reference.from,
        dansk: target.dansk,
        form: target.form,
        extraUsageContext: reference.context ?? target.extraUsageContext,
        ...(target.notes ? { notes: target.notes } : {}),
        wordCount: reference.from.split(/\s+/).length,
        originalLine: reference.originalLine
      })
    }
  }

  console.log(
    `🧠 Semantic SEE filter: kept ${accepted.length.toString()}, dropped ${rejected.length.toString()}`
  )
  await fs.writeFile(
    REJECTED_SEE_FILE,
    JSON.stringify(rejected, null, 2),
    'utf8'
  )
  return accepted
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

/**
 * Deduplicate an array of strings, preserving order
 */
function deduplicateNotes(notes: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const note of notes) {
    if (!seen.has(note)) {
      seen.add(note)
      unique.push(note)
    }
  }

  return unique
}

/**
 * Check if entry is a single letter fragment that should be filtered
 */
function isSingleLetterFragment(engelsk: string, dansk: string): boolean {
  const danskTrimmed = dansk.trim()
  // Filter out single letter fragments (unless it's a valid single-letter word)
  // Allow valid single letters: æ, ø, å, a-z, but filter out others like "f"
  return (
    danskTrimmed.length === 1 &&
    !/[æøåa-zæøå]/i.test(danskTrimmed) &&
    engelsk.length > 3
  )
}
/**
 * Check if entry has unmatched parentheses or brackets
 */
function hasUnmatchedBrackets(dansk: string): boolean {
  const danskTrimmed = dansk.trim()
  return (
    (danskTrimmed.startsWith('(') && !danskTrimmed.includes(')')) ||
    (danskTrimmed.endsWith(')') && !danskTrimmed.includes('(')) ||
    (danskTrimmed.startsWith('[') && !danskTrimmed.includes(']')) ||
    (danskTrimmed.endsWith(']') && !danskTrimmed.includes('['))
  )
}

/**
 * Check if entry is an obvious mistranslation
 */
function isObviousMistranslation(engelsk: string, dansk: string): boolean {
  const engelskLower = engelsk.toLowerCase()
  const danskTrimmed = dansk.trim().toLowerCase()

  // "between" should not translate to "tilsammen" (together)
  if (engelskLower === 'between' && danskTrimmed.startsWith('tilsammen')) {
    return true
  }

  return false
}

/**
 * Check if entry is a sentence fragment
 */
function isSentenceFragment(dansk: string): boolean {
  const danskTrimmed = dansk.trim().toLowerCase()
  return (
    danskTrimmed.startsWith('which means') ||
    danskTrimmed.startsWith('do not confuse')
  )
}

/**
 * Check if an entry should be filtered out as obviously incorrect
 */
function shouldFilterEntry(engelsk: string, dansk: string): boolean {
  if (isSingleLetterFragment(engelsk, dansk)) {
    return true
  }
  if (hasUnmatchedBrackets(dansk)) {
    return true
  }
  if (isObviousMistranslation(engelsk, dansk)) {
    return true
  }
  if (isSentenceFragment(dansk)) {
    return true
  }
  return false
}

/**
 * Remove unmatched brackets at the end of a string
 */
function removeUnmatchedBrackets(text: string): string {
  return text.replaceAll(/\]\.?$/g, '').trim()
}

/**
 * Check if text looks like an English explanation
 * Note: We exclude "or" and "and" as they're common in both languages
 */
function looksLikeEnglishExplanation(text: string): boolean {
  return /\b(so|this|can|also|mean|is|in|Danish|more|fully|which|means|to|check|verify|do|not|confuse|with)\b/i.test(
    text
  )
}

/**
 * Find all parenthetical groups, handling nested parentheses
 * Returns array of {match: full match, content: content inside parentheses, start: index, end: index}
 */
function findParentheticalGroups(text: string): {
  match: string
  content: string
  start: number
  end: number
}[] {
  return findBracketGroups(text, '(', ')')
}

/**
 * Find all square bracket groups, handling nested brackets
 * Returns array of {match: full match, content: content inside brackets, start: index, end: index}
 */
function findSquareBracketGroups(text: string): {
  match: string
  content: string
  start: number
  end: number
}[] {
  return findBracketGroups(text, '[', ']')
}

/**
 * Generic function to find all bracket groups, handling nested brackets
 */
function findBracketGroups(
  text: string,
  openChar: string,
  closeChar: string
): {
  match: string
  content: string
  start: number
  end: number
}[] {
  const groups: {
    match: string
    content: string
    start: number
    end: number
  }[] = []
  let depth = 0
  let start = -1
  let content = ''

  for (let index = 0; index < text.length; index++) {
    if (text[index] === openChar) {
      if (depth === 0) {
        start = index
        content = ''
      } else {
        content += text[index]
      }
      depth++
    } else if (text[index] === closeChar) {
      depth--
      if (depth === 0) {
        const match = text.slice(start, index + 1)
        groups.push({ match, content, start, end: index + 1 })
      } else {
        content += text[index]
      }
    } else if (depth > 0) {
      content += text[index]
    }
  }

  return groups
}

/**
 * Extract English explanations from parentheses
 * Note: We exclude "or" and "and" as they're common in both languages
 */
function extractEnglishExplanations(text: string): {
  cleaned: string
  notes: string[]
} {
  const groups = findParentheticalGroups(text)
  const englishNotes: string[] = []
  let cleaned = text

  // Process from end to start to maintain indices
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]
    const content = group.content.trim()

    // Check if it looks like an English explanation
    if (
      /\b(this|which|so|can|also|mean|is|in|Danish|more|fully|means|to|check|verify|do|not|confuse|with|choose|between|plague|cholera)\b/i.test(
        content
      )
    ) {
      // Clean up inner parentheses from the content
      let cleanedContent = content
      const innerGroups = findParentheticalGroups(content)
      for (
        let innerIndex = innerGroups.length - 1;
        innerIndex >= 0;
        innerIndex--
      ) {
        const innerGroup = innerGroups[innerIndex]
        cleanedContent =
          cleanedContent.slice(0, innerGroup.start) +
          innerGroup.content +
          cleanedContent.slice(innerGroup.end)
      }
      englishNotes.unshift(cleanedContent.trim())
      // Remove this group from the text
      cleaned = cleaned.slice(0, group.start) + cleaned.slice(group.end)
    }
  }

  return { cleaned: cleaned.trim(), notes: englishNotes }
}

/**
 * Extract Danish notes from parentheses
 */
function extractDanishNotes(text: string): string[] {
  console.log('[extractDanishNotes] Input text:', text)
  const groups = findParentheticalGroups(text)
  const danishNotes: string[] = []
  console.log('[extractDanishNotes] Found matches:', groups.length)

  for (const group of groups) {
    const noteText = group.content.trim()
    console.log('[extractDanishNotes] Processing match:', noteText)
    if (!noteText) {
      console.log('[extractDanishNotes] Empty noteText, skipping')
      continue
    }

    // Skip if it looks like an English explanation
    const isEnglish = looksLikeEnglishExplanation(noteText)
    console.log('[extractDanishNotes] Is English explanation?', isEnglish)
    if (isEnglish) {
      console.log('[extractDanishNotes] Skipping English explanation')
      continue
    }

    // If it contains commas, split it (e.g., "udestående, ubetalt")
    if (noteText.includes(',')) {
      const parts = noteText
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      // Only add parts that aren't already in the notes
      for (const part of parts) {
        if (!danishNotes.includes(part)) {
          danishNotes.push(part)
        }
      }
    } else {
      // Only add if not already in the notes
      if (!danishNotes.includes(noteText)) {
        danishNotes.push(noteText)
      }
    }
  }

  return danishNotes
}

/**
 * Remove all parenthetical notes from text, handling nested parentheses
 */
function removeParentheticalNotes(text: string): string {
  const groups = findParentheticalGroups(text)
  // Remove from end to start to maintain indices
  let cleaned = text
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]
    cleaned = cleaned.slice(0, group.start) + cleaned.slice(group.end)
  }
  return cleaned.trim()
}

/**
 * Clean up extra whitespace
 */
function cleanWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim()
}

/**
 * Split text on commas or semicolons, but ignore commas/semicolons inside brackets or parentheses
 */
function splitOnCommasIgnoringBrackets(text: string): string[] {
  const parts: string[] = []
  let currentPart = ''
  let squareBracketDepth = 0
  let parenDepth = 0

  for (const char of text) {
    switch (char) {
      case '[': {
        squareBracketDepth++
        currentPart += char
        break
      }
      case ']': {
        squareBracketDepth--
        currentPart += char
        break
      }
      case '(': {
        parenDepth++
        currentPart += char
        break
      }
      case ')': {
        parenDepth--
        currentPart += char
        break
      }
      case ',':
      case ';': {
        if (squareBracketDepth === 0 && parenDepth === 0) {
          // Only split on comma/semicolon if we're not inside brackets or parentheses
          const trimmed = currentPart.trim()
          if (trimmed) {
            parts.push(trimmed)
          }
          currentPart = ''
        } else {
          currentPart += char
        }
        break
      }
      default: {
        currentPart += char
        break
      }
    }
  }

  // Add the last part
  const trimmed = currentPart.trim()
  if (trimmed) {
    parts.push(trimmed)
  }

  return parts.filter(Boolean)
}

/**
 * Extract notes from square brackets
 */
function extractSquareBracketNotes(text: string): string[] {
  const groups = findSquareBracketGroups(text)
  const notes: string[] = []

  for (const group of groups) {
    const noteText = group.content.trim()
    if (!noteText) {
      continue
    }

    // Clean up inner square brackets from the content
    let cleanedContent = noteText
    const innerGroups = findSquareBracketGroups(noteText)
    for (
      let innerIndex = innerGroups.length - 1;
      innerIndex >= 0;
      innerIndex--
    ) {
      const innerGroup = innerGroups[innerIndex]
      cleanedContent =
        cleanedContent.slice(0, innerGroup.start) +
        innerGroup.content +
        cleanedContent.slice(innerGroup.end)
    }

    if (cleanedContent && !notes.includes(cleanedContent.trim())) {
      notes.push(cleanedContent.trim())
    }
  }

  return notes
}

/**
 * Remove all square bracket notes from text, handling nested brackets
 */
function removeSquareBracketNotes(text: string): string {
  const groups = findSquareBracketGroups(text)
  // Remove from end to start to maintain indices
  let cleaned = text
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]
    cleaned = cleaned.slice(0, group.start) + cleaned.slice(group.end)
  }
  return cleaned.trim()
}

/**
 * Clean up Danish translation by extracting notes from parentheses
 */
function cleanDanishTranslation(
  dansk: string,
  existingNotes: string[]
): { translation: string; notes: string[] } | null {
  console.log('[cleanDanishTranslation] Start:', dansk)
  let cleaned = dansk.trim()
  console.log('[cleanDanishTranslation] After trim:', cleaned)

  // Step 0: Extract square bracket notes first (before removing them)
  console.log('[cleanDanishTranslation] Step 0: Extract square bracket notes')
  const squareBracketNotes = extractSquareBracketNotes(cleaned)
  console.log(
    '[cleanDanishTranslation] Square bracket notes:',
    squareBracketNotes
  )
  // Remove square bracket notes immediately after extraction
  cleaned = removeSquareBracketNotes(cleaned)
  console.log(
    '[cleanDanishTranslation] After removing square brackets:',
    cleaned
  )

  // Step 1: Remove unmatched brackets
  console.log('[cleanDanishTranslation] Step 1: Remove unmatched brackets')
  cleaned = removeUnmatchedBrackets(cleaned)
  console.log('[cleanDanishTranslation] After Step 1:', cleaned)

  // Step 2: Extract English explanations (but keep them for now)
  console.log('[cleanDanishTranslation] Step 2: Extract English explanations')
  const englishResult = extractEnglishExplanations(cleaned)
  console.log('[cleanDanishTranslation] English result:', englishResult)
  const extractedEnglishNotes = englishResult.notes
  // Don't remove English explanations yet - we need them for Step 3
  console.log(
    '[cleanDanishTranslation] After Step 2:',
    cleaned,
    'notes:',
    extractedEnglishNotes
  )

  // Step 3: Extract Danish notes (before removing parentheses)
  // Do this BEFORE removing English explanations so we can distinguish them
  console.log('[cleanDanishTranslation] Step 3: Extract Danish notes')
  const danishNotes = extractDanishNotes(cleaned)
  console.log('[cleanDanishTranslation] Danish notes:', danishNotes)
  console.log('[cleanDanishTranslation] After Step 3:', cleaned)

  // Now remove the English explanations we found
  if (extractedEnglishNotes.length > 0) {
    console.log(
      '[cleanDanishTranslation] Removing extracted English explanations'
    )
    cleaned = englishResult.cleaned
    console.log(
      '[cleanDanishTranslation] After removing English explanations:',
      cleaned
    )
  }

  // Step 4: Remove all parenthetical notes
  console.log('[cleanDanishTranslation] Step 4: Remove parenthetical notes')
  cleaned = removeParentheticalNotes(cleaned)
  console.log('[cleanDanishTranslation] After Step 4:', cleaned)

  // Step 5: Clean up whitespace
  console.log('[cleanDanishTranslation] Step 5: Clean whitespace')
  cleaned = cleanWhitespace(cleaned)
  console.log('[cleanDanishTranslation] After Step 5:', cleaned)

  // Step 6: Check if we have anything left
  console.log('[cleanDanishTranslation] Step 6: Check if empty')
  if (!cleaned || cleaned.length === 0) {
    console.log('[cleanDanishTranslation] Empty after cleaning, returning null')
    return null
  }
  console.log('[cleanDanishTranslation] After Step 6:', cleaned)

  // Step 7: Combine all notes
  console.log('[cleanDanishTranslation] Step 7: Combine notes')
  console.log(
    '[cleanDanishTranslation] existingNotes:',
    existingNotes,
    'length:',
    existingNotes?.length
  )
  console.log(
    '[cleanDanishTranslation] extractedEnglishNotes:',
    extractedEnglishNotes,
    'length:',
    extractedEnglishNotes?.length
  )
  console.log(
    '[cleanDanishTranslation] danishNotes:',
    danishNotes,
    'length:',
    danishNotes?.length
  )
  let allNotes: string[]
  try {
    allNotes = [
      ...existingNotes,
      ...extractedEnglishNotes,
      ...danishNotes,
      ...squareBracketNotes
    ]
    // Deduplicate notes
    allNotes = deduplicateNotes(allNotes)
    console.log(
      '[cleanDanishTranslation] All notes:',
      allNotes,
      'length:',
      allNotes.length
    )
  } catch (error) {
    console.error('[cleanDanishTranslation] Error combining notes:', error)
    throw error
  }

  const result = {
    translation: cleaned,
    notes: allNotes
  }
  console.log('[cleanDanishTranslation] Final result:', result)
  return result
}

function parseExtraUsageContext(
  context: string | undefined
): WordForm | undefined {
  if (!context) {
    return undefined
  }
  const c = context.trim().toLowerCase()

  // Core POS
  if (['n', 'noun'].includes(c)) {
    return 'noun'
  }
  if (['v', 'verb'].includes(c)) {
    return 'verb'
  }
  if (['adj', 'adjective'].includes(c)) {
    return 'adjective'
  }
  if (['adv', 'adverb'].includes(c)) {
    return 'adverb'
  }
  if (['prep', 'preposition'].includes(c)) {
    return 'preposition'
  }
  if (['pron', 'pronoun'].includes(c)) {
    return 'pronoun'
  }
  if (['det', 'determiner'].includes(c)) {
    return 'determiner'
  }
  if (['conj', 'conjunction'].includes(c)) {
    return 'conjunction'
  }
  if (['interj', 'interjection'].includes(c)) {
    return 'interjection'
  }
  if (['phrase', 'idiom', 'expression'].includes(c)) {
    return 'phrase'
  }
  if (['prop', 'proper', 'proper noun'].includes(c)) {
    return 'properNoun'
  }
  if (['prefix'].includes(c)) {
    return 'prefix'
  }
  if (['suffix'].includes(c)) {
    return 'suffix'
  }
  if (['proverb'].includes(c)) {
    return 'proverb'
  }
  if (['particle'].includes(c)) {
    return 'particle'
  }

  if (['num', 'numeral'].includes(c)) {
    return 'numeral'
  }
  if (['abbr', 'abbreviation'].includes(c)) {
    return 'abbreviation'
  }
  if (['art', 'article'].includes(c)) {
    return 'article'
  }
  if (['contraction'].includes(c)) {
    return 'contraction'
  }

  console.log(`Unknown context ${context}`)

  return undefined
}

const SKIPPED_FORMS = new Set([
  'article',
  'interjection',
  'abbreviation',
  'prefix',
  'suffix',
  'proverb'
])

export type IDictionaryEntryWithOriginal = IDictionaryEntry & {
  originalLine: string
}

async function parseTxtFile(
  filePath: string
): Promise<[IDictionaryEntryWithOriginal[], IDictionaryEntry[]]> {
  const text = await fs.readFile(filePath, 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)

  const entries: IDictionaryEntryWithOriginal[] = []
  const seeReferences: {
    from: string
    to: string
    form?: string
    context?: string
    originalLine: string
  }[] = []
  let removedEntriesCount = 0

  for (const line of lines) {
    if (line.startsWith('#')) {
      continue
    }

    const [lhsRaw, rhsRaw] = line.split('::')
    const lhs = lhsRaw.trim()
    const rhs = rhsRaw.trim()

    if (!lhs) {
      continue
    }

    const isSeeReference = /SEE:/i.test(lhs) || /SEE:/i.test(rhs || '')
    if (!rhs && !isSeeReference) {
      continue
    }

    const forms = [...lhs.matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim())
    const contexts = [...lhs.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim())
    // Extract notes from square brackets, handling nested brackets
    const squareBracketGroups = findSquareBracketGroups(rhs || '')
    const notes = squareBracketGroups
      .map((group) => {
        // Clean up inner square brackets from the content
        let cleanedContent = group.content.trim()
        const innerGroups = findSquareBracketGroups(cleanedContent)
        for (
          let innerIndex = innerGroups.length - 1;
          innerIndex >= 0;
          innerIndex--
        ) {
          const innerGroup = innerGroups[innerIndex]
          cleanedContent =
            cleanedContent.slice(0, innerGroup.start) +
            innerGroup.content +
            cleanedContent.slice(innerGroup.end)
        }
        return cleanedContent.trim()
      })
      .filter(Boolean)
    const form = parseExtraUsageContext(
      forms.find((f) => parseExtraUsageContext(f))
    )
    const extraUsageContext = contexts.join('; ') || undefined

    const engelsk = lhs.split(/[({]/)[0].split(/SEE:/i)[0].trim()
    if (!engelsk) {
      continue
    }

    if (form && SKIPPED_FORMS.has(form)) {
      removedEntriesCount += 1
      continue
    }

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const seeMatch = /SEE:\s*(.+)/i.exec(lhs) || /SEE:\s*(.+)/i.exec(rhs)
    if (seeMatch) {
      seeReferences.push({
        from: engelsk,
        to: seeMatch[1].trim(),
        form,
        context: extraUsageContext,
        originalLine: line
      })

      continue
    }

    if (!rhs) {
      continue
    }

    // Remove curly braces but keep square brackets for now (they'll be extracted as notes)
    // Split on commas/semicolons, but NOT inside square brackets
    const danishVariants = splitOnCommasIgnoringBrackets(
      rhs.replaceAll(/\{[^}]*\}/g, '')
    )

    for (const dansk of danishVariants) {
      // Filter out obviously incorrect entries
      if (shouldFilterEntry(engelsk, dansk)) {
        continue
      }

      console.log('[parseTxtFile] Processing:', dansk, 'notes:', notes)
      // Clean up the Danish translation
      const cleanedDansk = cleanDanishTranslation(dansk, notes)
      console.log('[parseTxtFile] Cleaned result:', cleanedDansk)

      if (!cleanedDansk) {
        console.log('[parseTxtFile] Skipping - cleanedDansk is null')
        continue
      }

      console.log('[parseTxtFile] Creating entry object')
      console.log(
        '[parseTxtFile] cleanedDansk.notes:',
        cleanedDansk.notes,
        'length:',
        cleanedDansk.notes?.length
      )
      console.log('[parseTxtFile] notes:', notes, 'length:', notes?.length)

      let entryNotes: string[] | undefined
      if (cleanedDansk.notes.length > 0 || notes.length > 0) {
        console.log('[parseTxtFile] Combining notes arrays')
        try {
          entryNotes = [...notes, ...cleanedDansk.notes]
          // Deduplicate notes
          entryNotes = deduplicateNotes(entryNotes)
          console.log(
            '[parseTxtFile] Combined notes:',
            entryNotes,
            'length:',
            entryNotes.length
          )
        } catch (error) {
          console.error('[parseTxtFile] Error combining notes:', error)
          throw error
        }
      } else {
        console.log('[parseTxtFile] No notes to combine')
      }

      const entry = {
        engelsk,
        dansk: cleanedDansk.translation,
        form,
        extraUsageContext,
        ...(entryNotes ? { notes: entryNotes } : {}),
        wordCount: engelsk.split(/\s+/).length,
        originalLine: line
      }
      console.log('[parseTxtFile] Entry created:', entry)

      console.log('[parseTxtFile] Pushing to entries array')
      try {
        entries.push(entry)
        console.log(
          '[parseTxtFile] Entry pushed successfully, entries.length:',
          entries.length
        )
      } catch (error) {
        console.error('[parseTxtFile] Error pushing entry:', error)
        console.error('[parseTxtFile] Entry that failed:', entry)
        throw error
      }
      console.log('[parseTxtFile] After push, continuing to next variant')
    }
    console.log(
      '[parseTxtFile] Finished processing danishVariants for:',
      engelsk
    )
  }
  console.log(
    '[parseTxtFile] Finished processing all lines, entries.length:',
    entries.length
  )

  // Resolve SEE: references
  console.log(
    '[parseTxtFile] Resolving SEE references, count:',
    seeReferences.length
  )
  try {
    const resolvedSEE = await resolveSEEReferencesSemantically(
      seeReferences,
      entries
    )
    console.log(
      '[parseTxtFile] Resolved SEE references, count:',
      resolvedSEE.length
    )
    console.log('[parseTxtFile] Pushing resolved SEE references to entries')
    try {
      entries.push(...resolvedSEE)
      console.log(
        '[parseTxtFile] SEE references pushed, entries.length:',
        entries.length
      )
    } catch (error) {
      console.error('[parseTxtFile] Error pushing SEE references:', error)
      console.error('[parseTxtFile] resolvedSEE length:', resolvedSEE.length)
      throw error
    }
  } catch (error) {
    console.error('[parseTxtFile] Error resolving SEE references:', error)
    throw error
  }

  // For all entries create a variant without the originalLines
  console.log(
    '[parseTxtFile] Creating entries without originalLines, count:',
    entries.length
  )
  let entriesWithoutOriginalLines: IDictionaryEntry[]
  try {
    entriesWithoutOriginalLines = entries.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ originalLine, ...rest }) => rest
    ) satisfies IDictionaryEntry[]
    console.log(
      '[parseTxtFile] Entries without originalLines created, count:',
      entriesWithoutOriginalLines.length
    )
  } catch (error) {
    console.error(
      '[parseTxtFile] Error creating entries without originalLines:',
      error
    )
    console.error('[parseTxtFile] entries.length:', entries.length)
    throw error
  }

  console.log(
    `✅ Parsed ${entries.length.toString()} entries from ${path.basename(filePath)} `
  )
  console.log(
    `⚠️ Removed ${removedEntriesCount.toString()} entries due to filtering rules`
  )

  return [entries, entriesWithoutOriginalLines]
}

/**

* Parse all input sources and save output
  */
async function parseAll(): Promise<void> {
  const allEntries: IDictionaryEntry[] = []
  const allEntriesWithOriginal: IDictionaryEntryWithOriginal[] = []

  try {
    const txtEntries = await parseTxtFile(TXT_FILE)
    allEntriesWithOriginal.push(...txtEntries[0])
    allEntries.push(...txtEntries[1])
  } catch (error) {
    console.warn(
      `⚠️ Could not parse ${TXT_FILE}:`,
      (error as Error | undefined)?.message
    )
  }

  console.log(`\n📘 Total entries parsed: ${allEntries.length.toString()}`)

  let finalEntries = allEntries

  if (VALIDATE_SEMANTICS) {
    finalEntries = await filterBySemanticQuality(allEntries)
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(finalEntries, null, 2))
  console.log(`💾 Saved output → ${OUTPUT_FILE}`)

  await fs.writeFile(
    OUTPUT_FILE_WITH_ORIGINALS,
    JSON.stringify(allEntriesWithOriginal, null, 2)
  )
  console.log(`💾 Saved output → ${OUTPUT_FILE_WITH_ORIGINALS}`)
}

// Run
parseAll().catch((error: unknown) => {
  console.error('❌ Parsing failed:', error)
  process.exit(1)
})
