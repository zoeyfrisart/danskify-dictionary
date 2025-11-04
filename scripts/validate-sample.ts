import fs from "fs/promises";
import path from "path";
import { pipeline, Tensor } from "@xenova/transformers";

const SAMPLE_FILE = path.resolve("./validations/validation-sample.json");
const REPORT_FILE = path.resolve("./validations/validation-report.json");

// Similarity threshold for flagging suspicious pairs
const SIM_THRESHOLD = 0.35;

// Load model (MiniLM, small and fast)
async function makeEmbedder() {
  const embedder = await pipeline("feature-extraction", "Xenova/distiluse-base-multilingual-cased-v2");
  return async (text: string): Promise<Float32Array> => {
    const out = await embedder(text, { pooling: "mean", normalize: true });
    const t = out as Tensor & { data: Float32Array };
    return t.data;
  };
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  console.log("📖 Loading sample...");
  const data = JSON.parse(await fs.readFile(SAMPLE_FILE, "utf-8"));

  const getEmbedding = await makeEmbedder();

  const results: {
    engelsk: string;
    dansk: string;
    form?: string;
    sim: number;
  }[] = [];

  console.log(`🔍 Evaluating ${data.length} entries...`);
  let i = 0;
  for (const entry of data) {
    const e = entry.engelsk.trim();
    const d = entry.dansk.trim();
    if (!e || !d) continue;

    const [v1, v2] = await Promise.all([getEmbedding(e), getEmbedding(d)]);
    const sim = cosine(v1, v2);

    results.push({ engelsk: e, dansk: d, form: entry.form, sim });

    if (++i % 50 === 0) console.log(`  → processed ${i}/${data.length}`);
  }

  const badOnes = results.filter((r) => r.sim < SIM_THRESHOLD);
  const avg = results.reduce((a, b) => a + b.sim, 0) / results.length;

  console.log("\n📊 Validation Summary");
  console.log("---------------------");
  console.log(`Average similarity: ${avg.toFixed(3)}`);
  console.log(`Low-similarity entries (<${SIM_THRESHOLD}): ${badOnes.length}`);
  console.log(
    `≈ ${(100 * badOnes.length / results.length).toFixed(1)}% flagged`
  );

  await fs.writeFile(REPORT_FILE, JSON.stringify(results, null, 2));
  console.log(`💾 Detailed report saved → ${REPORT_FILE}`);

  if (badOnes.length > 0) {
    console.log("\n🚩 Examples of possible mistranslations:");
    for (const r of badOnes.slice(0, 10))
      console.log(`  ${r.engelsk} → ${r.dansk} (sim=${r.sim.toFixed(3)})`);
  }
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
