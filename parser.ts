import * as cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";
import type { IDictionaryEntry } from "./src/types";

const TXT_FILE = "./en-da-enwiktionary.txt";
const OUTPUT_FILE = "./src/data.json";
const SHUFFLE_SEED = "danskify-v1";

function parseExtraUsageContext(context: string | undefined):
  | "noun"
  | "verb"
  | "adjective"
  | "phrase"
  | "pronoun"
  | undefined {
  if (!context) return undefined;
  const c = context.toLowerCase();

  if (["n", "noun"].includes(c)) return "noun";
  if (["v", "verb"].includes(c)) return "verb";
  if (["p", "phrase"].includes(c)) return "phrase";
  if (["pron", "pronoun"].includes(c)) return "pronoun";
  if (["adj", "adjective"].includes(c)) return "adjective";

  return undefined;
}

async function parseTxtFile(filePath: string): Promise<IDictionaryEntry[]> {
  const text = await fs.readFile(filePath, "utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const entries: IDictionaryEntry[] = [];
  const seeRefs: { from: string; to: string; form?: string; context?: string }[] = [];

  for (const line of lines) {
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

    const seeMatch = lhs.match(/SEE:\s*(.+)/i) || rhs?.match(/SEE:\s*(.+)/i);
    if (seeMatch) {
      seeRefs.push({
        from: engelsk,
        to: seeMatch[1].trim(),
        form,
        context: extraUsageContext,
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
      });
    }


  }

  // Resolve SEE: references
  for (const ref of seeRefs) {
    const targets = entries.filter(
      (e) => e.engelsk.toLowerCase() === ref.to.toLowerCase()
    );

    if (targets.length === 0) continue;


    for (const target of targets) {
      entries.push({
        engelsk: ref.from,
        dansk: target.dansk,
        form: target.form,
        extraUsageContext: ref.context ?? target.extraUsageContext,
        ...((target.notes?.length ?? 0) > 0 ? { notes: target.notes } : {}),
        wordCount: ref.from.split(/\s+/).length,
      });
    }
  }

  console.log(`✅ Parsed ${entries.length} entries from ${path.basename(filePath)} `);
  return entries;
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

  try {
    const txtEntries = await parseTxtFile(TXT_FILE);
    allEntries.push(...txtEntries);
  } catch (err) {
    console.warn(`⚠️ Could not parse ${TXT_FILE}:`, (err as Error | undefined)?.message);
  }

  console.log(`\n📘 Total entries parsed: ${allEntries.length}`);

  console.log("Deterministically shuffling entries...");
  const shuffled = seededShuffle(allEntries, SHUFFLE_SEED);

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(shuffled, null, 2), "utf-8");

  console.log(`💾 Saved output → ${OUTPUT_FILE}`);
}

// Run
parseAll().catch((err) => {
  console.error("❌ Parsing failed:", err);
  process.exit(1);
});
