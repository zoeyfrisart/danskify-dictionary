import { pipeline, Tensor } from "@xenova/transformers";
import fs from "fs/promises";

import { IDictionaryEntry } from "../../src/types";

const SEMANTIC_THRESHOLD = 0.35; // below → drop
const VALIDATE_SEMANTICS = process.env.VALIDATE_SEMANTICS === "true";

export async function filterBySemanticQuality(entries: IDictionaryEntry[]) {
  if (!VALIDATE_SEMANTICS) return entries;

  console.log("🧠 Semantic quality filter active...");
  const embedder = await pipeline(
    "feature-extraction",
    "Xenova/distiluse-base-multilingual-cased-v2"
  );

  const getVec = async (txt: string): Promise<Float32Array> => {
    const out = await embedder(txt, { pooling: "mean", normalize: true });
    return (out as Tensor & { data: Float32Array }).data;
  };

  function cosine(a: Float32Array, b: Float32Array): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  const passed: IDictionaryEntry[] = [];
  const failed: Array<IDictionaryEntry & { sim: number }> = [];

  for (const e of entries) {
    const [v1, v2] = await Promise.all([getVec(e.engelsk), getVec(e.dansk)]);
    const sim = cosine(v1, v2);
    if (sim >= SEMANTIC_THRESHOLD) passed.push(e);
    else failed.push({ ...e, sim });
  }

  await fs.writeFile("./validations/semantic-rejects.json", JSON.stringify(failed, null, 2));
  console.log(`✅ Kept ${passed.length}, 🗑️ Dropped ${failed.length} low-similarity entries`);
  return passed;
}
