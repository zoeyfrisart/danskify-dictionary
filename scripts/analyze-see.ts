import fs from "fs";
import path from "path";
import { SIM_THRESHOLD } from "./parser";

const REJECTED_FILE = path.resolve("./validations/see-rejected.json");

type RejectedSEE = { from: string; to: string; sim: number };

function analyzeSEERejections(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error("❌ File not found:", filePath);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const data: RejectedSEE[] = JSON.parse(raw);

  if (!Array.isArray(data) || data.length === 0) {
    console.warn("⚠️ No rejected SEE entries found.");
    return;
  }

  const sims = data.map((d) => d.sim);
  sims.sort((a, b) => a - b);

  const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
  const median = sims[Math.floor(sims.length / 2)];
  const min = sims[0];
  const max = sims[sims.length - 1];

  console.log("📊 SEE Rejection Stats");
  console.log("---------------------");
  console.log(`Count: ${sims.length}`);
  console.log(`Avg similarity: ${avg.toFixed(3)}`);
  console.log(`Median: ${median.toFixed(3)}`);
  console.log(`Min: ${min.toFixed(3)}, Max: ${max.toFixed(3)}`);
  console.log(`Threshold: ${SIM_THRESHOLD}`);
  console.log();

  // Histogram in 0.05 bins
  const bins: Record<string, number> = {};
  for (const s of sims) {
    const bin = (Math.floor(s / 0.05) * 0.05).toFixed(2);
    bins[bin] = (bins[bin] ?? 0) + 1;
  }

  console.log("Histogram (bin width = 0.05):");
  for (const bin of Object.keys(bins).sort((a, b) => parseFloat(a) - parseFloat(b))) {
    const count = bins[bin];
    const bar = "█".repeat(Math.min(30, Math.round((count / sims.length) * 200)));
    console.log(`${bin.padEnd(4)} | ${bar} ${count}`);
  }

  console.log();

  // Borderline examples
  const borderline = data.filter((d) => d.sim >= SIM_THRESHOLD - 0.05 && d.sim < SIM_THRESHOLD);
  if (borderline.length > 0) {
    console.log("🔍 Borderline rejections (within 0.05 of threshold):");
    for (const e of borderline.slice(0, 20)) {
      console.log(`  ${e.from} → ${e.to}  (sim=${e.sim.toFixed(3)})`);
    }
    console.log(`...and ${Math.max(0, borderline.length - 20)} more`);
  } else {
    console.log("✅ No borderline rejections found.");
  }

  process.exit(0)
}

// Run
analyzeSEERejections(REJECTED_FILE);
