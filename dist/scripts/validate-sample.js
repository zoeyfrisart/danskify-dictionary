"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const transformers_1 = require("@xenova/transformers");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const SAMPLE_FILE = node_path_1.default.resolve('./validations/validation-sample.json');
const REPORT_FILE = node_path_1.default.resolve('./validations/validation-report.json');
// Similarity threshold for flagging suspicious pairs
const SIM_THRESHOLD = 0.35;
// Load model (MiniLM, small and fast)
async function makeEmbedder() {
    const embedder = await (0, transformers_1.pipeline)('feature-extraction', 'Xenova/distiluse-base-multilingual-cased-v2');
    return async (text) => {
        const out = await embedder(text, { pooling: 'mean', normalize: true });
        const t = out;
        return t.data;
    };
}
function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (const [index, element] of a.entries()) {
        dot += element * b[index];
        na += element * element;
        nb += b[index] * b[index];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
async function main() {
    console.log('📖 Loading sample...');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = JSON.parse(await promises_1.default.readFile(SAMPLE_FILE, 'utf8'));
    const getEmbedding = await makeEmbedder();
    const results = [];
    console.log(`🔍 Evaluating ${data.length.toString()} entries...`);
    let index = 0;
    for (const entry of data) {
        const engelsk = entry.engelsk.trim();
        const dansk = entry.dansk.trim();
        if (!engelsk || !dansk) {
            continue;
        }
        const [v1, v2] = await Promise.all([
            getEmbedding(engelsk),
            getEmbedding(dansk)
        ]);
        const sim = cosine(v1, v2);
        results.push({ engelsk: engelsk, dansk: dansk, form: entry.form, sim });
        if (++index % 50 === 0) {
            console.log(`  → processed ${index.toString()}/${data.length.toString()}`);
        }
    }
    const badOnes = results.filter((r) => r.sim < SIM_THRESHOLD);
    const avg = results.reduce((a, b) => a + b.sim, 0) / results.length;
    console.log('\n📊 Validation Summary');
    console.log('---------------------');
    console.log(`Average similarity: ${avg.toFixed(3)}`);
    console.log(`Low-similarity entries (<${SIM_THRESHOLD.toString()}): ${badOnes.length.toString()}`);
    console.log(`≈ ${((100 * badOnes.length) / results.length).toFixed(1)}% flagged`);
    await promises_1.default.writeFile(REPORT_FILE, JSON.stringify(results, null, 2));
    console.log(`💾 Detailed report saved → ${REPORT_FILE}`);
    if (badOnes.length > 0) {
        console.log('\n🚩 Examples of possible mistranslations:');
        for (const r of badOnes.slice(0, 10)) {
            console.log(`  ${r.engelsk} → ${r.dansk} (sim=${r.sim.toFixed(3)})`);
        }
    }
}
main().catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
});
