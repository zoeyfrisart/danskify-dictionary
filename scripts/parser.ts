import fs from "fs/promises";
import path from "path";
import { pipeline, Tensor } from "@xenova/transformers";

import type { IDictionaryEntry, WordForm } from "../src/types";
import { filterBySemanticQuality } from "./utils/filterBySemanticQuality";

const TXT_FILE = "./en-da-enwiktionary.txt";
const OUTPUT_FILE = "./src/data.json";
const OUTPUT_FILE_WITH_ORIGINALS = "./validations/data-originals.json"
const REJECTED_SEE_FILE = "./validations/see-rejected.json";
const SHUFFLED_OUTPUT_FILE = "./src/data-shuffled.json"
const SHUFFLE_SEED = "danskify-v1";
const VALIDATE_SEMANTICS = process.env.VALIDATE_SEMANTICS === "true";

export const SIM_THRESHOLD = 0.42;

// -------------------------------------------------------------
// Embedding utilities (Xenova model)
// -------------------------------------------------------------
async function makeEmbedder() {
  const embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const cache = new Map<string, Float32Array>();

  return async (text: string): Promise<Float32Array> => {
    const key = text.toLowerCase();
    if (cache.has(key)) return cache.get(key)!;
    const result = await embedder(text, { pooling: "mean", normalize: true });
    const tensor = result as Tensor & { data: Float32Array };
    const vec = tensor.data;
    cache.set(key, vec);
    return vec;
  };
}

// -------------------------------------------------------------
// SEE resolution with semantic validation
// -------------------------------------------------------------
async function resolveSEEReferencesSemantically(
  seeRefs: { from: string; to: string; form?: string; context?: string; originalLine: string }[],
  entries: IDictionaryEntryWithOriginal[]
): Promise<IDictionaryEntryWithOriginal[]> {
  const getVec = await makeEmbedder();

  const accepted: IDictionaryEntryWithOriginal[] = [];
  const rejected: { from: string; to: string; sim: number }[] = [];

  for (const ref of seeRefs) {
    const targets = entries.filter(
      (e) => e.engelsk.toLowerCase() === ref.to.toLowerCase()
    );
    if (targets.length === 0) continue;

    const srcVec = await getVec(ref.from);
    const tgtVec = await getVec(ref.to);
    const sim = cosine(srcVec, tgtVec);

    if (sim < SIM_THRESHOLD) {
      rejected.push({ from: ref.from, to: ref.to, sim });
      continue;
    }

    for (const target of targets) {
      accepted.push({
        engelsk: ref.from,
        dansk: target.dansk,
        form: target.form,
        extraUsageContext: ref.context ?? target.extraUsageContext,
        ...(target.notes ? { notes: target.notes } : {}),
        wordCount: ref.from.split(/\s+/).length,
        originalLine: ref.originalLine,
      });
    }
  }

  console.log(`🧠 Semantic SEE filter: kept ${accepted.length}, dropped ${rejected.length}`);
  await fs.writeFile(REJECTED_SEE_FILE, JSON.stringify(rejected, null, 2), "utf-8");
  return accepted;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}



function parseExtraUsageContext(
  context: string | undefined
): WordForm | undefined {
  if (!context) return undefined;
  const c = context.trim().toLowerCase();

  // Core POS
  if (["n", "noun"].includes(c)) return "noun";
  if (["v", "verb"].includes(c)) return "verb";
  if (["adj", "adjective"].includes(c)) return "adjective";
  if (["adv", "adverb"].includes(c)) return "adverb";
  if (["prep", "preposition"].includes(c)) return "preposition";
  if (["pron", "pronoun"].includes(c)) return "pronoun";
  if (["det", "determiner"].includes(c)) return "determiner";
  if (["conj", "conjunction"].includes(c)) return "conjunction";
  if (["interj", "interjection"].includes(c)) return "interjection";
  if (["phrase", "idiom", "expression"].includes(c)) return "phrase";
  if (["prop", "proper", "proper noun"].includes(c)) return "properNoun";
  if (["num", "numeral"].includes(c)) return "numeral";
  if (["abbr", "abbreviation"].includes(c)) return "abbreviation";
  if (["art", "article"].includes(c)) return "article";

  return undefined;
}

const SKIPPED_FORMS = new Set([
  "article",
  "interjection",
  "abbreviation",
]);


type IDictionaryEntryWithOriginal = IDictionaryEntry & { originalLine: string }

async function parseTxtFile(filePath: string): Promise<[IDictionaryEntryWithOriginal[], IDictionaryEntry[]]> {
  const text = await fs.readFile(filePath, "utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const entries: IDictionaryEntryWithOriginal[] = [];
  const seeRefs: { from: string; to: string; form?: string; context?: string, originalLine: string }[] = [];
  let removedEntriesCount = 0

  for (const line of lines) {
    if (line.startsWith('#')) {
      continue
    }

    const [lhsRaw, rhsRaw] = line.split("::");
    const lhs = lhsRaw?.trim();
    const rhs = rhsRaw?.trim();

    if (!lhs) continue;

    const isSeeRef = /SEE:/i.test(lhs) || /SEE:/i.test(rhs || "");
    if (!rhs && !isSeeRef) continue;

    const forms = [...lhs.matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim());
    const contexts = [...lhs.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
    const notes = [...(rhs?.matchAll(/\[([^\]]+)\]/g) ?? [])].map((m) => m[1].trim());
    const form = parseExtraUsageContext(forms.find((f) => parseExtraUsageContext(f)));
    const extraUsageContext = contexts.join("; ") || undefined;

    const engelsk = lhs.split(/[({]/)[0].split(/SEE:/i)[0].trim();
    if (!engelsk) continue;

    if (form && SKIPPED_FORMS.has(form)) {
      removedEntriesCount += 1;
      continue;
    }

    const seeMatch = lhs.match(/SEE:\s*(.+)/i) || rhs?.match(/SEE:\s*(.+)/i);
    if (seeMatch) {
      seeRefs.push({
        from: engelsk,
        to: seeMatch[1].trim(),
        form,
        context: extraUsageContext,
        originalLine: line
      });

      continue;
    }

    if (!rhs) continue;

    const danishVariants = rhs
      .replace(/\{[^}]*\}/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .split(/[,;]+/)
      .map((d) => d.trim())
      .filter(Boolean);

    for (const d of danishVariants) {
      entries.push({
        engelsk,
        dansk: d,
        form,
        extraUsageContext,
        ...(notes.length > 0 ? { notes } : {}),
        wordCount: engelsk.split(/\s+/).length,
        originalLine: line
      });
    }


  }

  // Resolve SEE: references
  const resolvedSEE = await resolveSEEReferencesSemantically(seeRefs, entries);
  entries.push(...resolvedSEE);

  // For all entries create a variant without the originalLines
  const entriesWithoutOriginalLines: IDictionaryEntry[] = entries.map(({ originalLine, ...rest }) => rest) satisfies IDictionaryEntry[]

  console.log(`✅ Parsed ${entries.length} entries from ${path.basename(filePath)} `);
  console.log(`⚠️ Removed ${removedEntriesCount} entries due to filtering rules`)

  return [entries, entriesWithoutOriginalLines];
}

/**

* Deterministic shuffle using a hash-based PRNG
  */
function seededShuffle<T>(array: T[], seed: string): T[] {
  // xmur3/JSF-based deterministic PRNG
  function xmur3(str: string) {
    let h = 1779033703 ^ str.length;

    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }

    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  function sfc32(a: number, b: number, c: number, d: number) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  const seedFn = xmur3(seed);
  const rand = sfc32(seedFn(), seedFn(), seedFn(), seedFn());
  const arr = [...array];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

/**

* Parse all input sources and save output
  */
async function parseAll(): Promise<void> {
  const allEntries: IDictionaryEntry[] = [];
  const allEntriesWithOriginal: IDictionaryEntryWithOriginal[] = []

  try {
    const txtEntries = await parseTxtFile(TXT_FILE);
    allEntriesWithOriginal.push(...txtEntries[0])
    allEntries.push(...txtEntries[1]);
  } catch (err) {
    console.warn(`⚠️ Could not parse ${TXT_FILE}:`, (err as Error | undefined)?.message);
  }

  console.log(`\n📘 Total entries parsed: ${allEntries.length}`);

  let finalEntries = allEntries;

  if (VALIDATE_SEMANTICS) {
    finalEntries = await filterBySemanticQuality(allEntries);
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(finalEntries, null, 2))
  console.log(`💾 Saved output → ${OUTPUT_FILE}`);

  await fs.writeFile(OUTPUT_FILE_WITH_ORIGINALS, JSON.stringify(allEntriesWithOriginal, null, 2))
  console.log(`💾 Saved output → ${OUTPUT_FILE_WITH_ORIGINALS}`)

  console.log("Deterministically shuffling entries...");
  const shuffled = seededShuffle(finalEntries, SHUFFLE_SEED);
  await fs.writeFile(SHUFFLED_OUTPUT_FILE, JSON.stringify(shuffled, null, 2), "utf-8");
  console.log(`💾 Saved output → ${SHUFFLED_OUTPUT_FILE}`);
}

// Run
parseAll().catch((err) => {
  console.error("❌ Parsing failed:", err);
  process.exit(1);
});
