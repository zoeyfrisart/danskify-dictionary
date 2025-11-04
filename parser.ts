import * as cheerio from "cheerio";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type { IDictionaryEntry } from "./src/types";

const TXT_FILE = "./en-da-enwiktionary.txt";
const OUTPUT_FILE = "./src/data.json";

function parseExtraUsageContext(context: string | undefined): "noun" | "verb" | "adjective" | "phrase" | "pronoun" | undefined {
  if (!context) return undefined;
  const c = context.toLowerCase();

  if (["n", "noun"].includes(c)) return "noun";
  if (["v", "verb"].includes(c)) return "verb";
  if (["p", "phrase"].includes(c)) return "phrase";
  if (["pron", "pronoun"].includes(c)) return "pronoun";
  if (["adj", "adjective"].includes(c)) return "adjective";

  return undefined;
}

/**

* Parse the en-da.txt file
  */
async function parseTxtFile(filePath: string): Promise<IDictionaryEntry[]> {
  const text = await fs.readFile(filePath, "utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const entries: IDictionaryEntry[] = [];

  const lineRegex =
    /^(?<engelsk>[^{(]+?)\s*(?:\{(?<form>[^}]+)\})?\s*(?:\((?<context>[^)]+)\))?\s*::\s*(?<dansk>.+)$/;


  for (const line of lines) {
    const match = line.match(lineRegex);
    if (!match) continue;

    const [, engelskRaw, formRaw, contextRaw, danskRaw] = match;

    const engelsk = engelskRaw.trim().replace(/\.\.\.$/, "");
    const dansk = danskRaw.trim();
    const form = parseExtraUsageContext(formRaw);
    const extraUsageContext = contextRaw?.trim();

    if (!engelsk || !dansk) continue;

    const danishVariants = dansk.replace(/\{[^}]*\}/g, "")
      // remove {c}, {n}, etc. 
      .split(",")
      .map((d) => (
        d.trim()
          .replace(/\.\.\.$/, "")
      )) // strip trailing "..." 
      .filter(Boolean);

    for (const d of danishVariants) {
      entries.push({
        engelsk: engelsk.trim(),
        dansk: d,
        form: parseExtraUsageContext(form?.trim()),
        extraUsageContext: extraUsageContext?.trim(),
        wordCount: engelsk.trim().split(/\s+/).length,
      });
    }
  }

  console.log(`✅ Parsed ${entries.length} entries from ${path.basename(filePath)} `);
  return entries;
}

/**
 * Shuffles the array to randomize entries (used downstream to ensure fair distribution)
 */
function securilyShuffleMultiplePasses<T>(array: T[], passes: number): T[] {
  const shuffled = [...array];

  for (let pass = 0; pass < passes; pass++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }

  return shuffled;
}

/**

* Parse all input sources: HTML pages + TXT file
  */
async function parseAll(): Promise<void> {
  const allEntries: IDictionaryEntry[] = [];

  // Parse the .txt if it exists
  try {
    const txtEntries = await parseTxtFile(TXT_FILE);
    allEntries.push(...txtEntries);
  } catch (err) {
    console.warn(`⚠️ Could not parse ${TXT_FILE}: `, (err as Error | undefined)?.message);
  }

  console.log(`\n📘 Total entries parsed: ${allEntries.length} `);

  console.log("Shuffling entries...");
  const shuffled = securilyShuffleMultiplePasses(allEntries, 100);

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(shuffled, null, 2), "utf-8");

  console.log(`💾 Saved output → ${OUTPUT_FILE} `);
}

// Run
parseAll().catch((err) => {
  console.error("❌ Parsing failed:", err);
  process.exit(1);
});
