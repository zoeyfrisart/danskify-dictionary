import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const INPUT_FILE = "./validations/data-originals.json";
const OUTPUT_FILE = "./validations/validation-sample.json";
const SAMPLE_SIZE = 500;

// Optional seed via CLI flag (e.g. `node validate-sample.js --seed 123`)
const argSeed = process.argv.find((a) => a.startsWith("--seed"));
const SEED = argSeed ? argSeed.split("=")[1] : crypto.randomUUID();

// PRNG seeded if provided, otherwise random each run
function seededRandom(seed: string) {
  let h = crypto.createHash("sha256").update(seed).digest();
  let idx = 0;
  return () => {
    if (idx >= h.length - 8) {
      h = crypto.createHash("sha256").update(h).digest();
      idx = 0;
    }
    const num = h.readUInt32LE(idx);
    idx += 4;
    return num / 0xffffffff;
  };
}

async function createValidationSample() {
  const absPath = path.resolve(INPUT_FILE);
  const data = JSON.parse(await fs.readFile(absPath, "utf-8"));

  if (!Array.isArray(data)) throw new Error("Input JSON is not an array");

  const rand = seededRandom(SEED);
  const shuffled = [...data];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const sample = shuffled.slice(0, SAMPLE_SIZE);

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(sample, null, 2), "utf-8");
  console.log(`✅ Wrote ${SAMPLE_SIZE} entries to ${OUTPUT_FILE}`);
  console.log(`Seed used: ${SEED}`);
}

createValidationSample().catch((err) => {
  console.error("❌ Failed to create validation sample:", err);
  process.exit(1);
});
