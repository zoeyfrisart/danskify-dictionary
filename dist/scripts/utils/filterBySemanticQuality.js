"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterBySemanticQuality = filterBySemanticQuality;
const transformers_1 = require("@xenova/transformers");
const promises_1 = __importDefault(require("node:fs/promises"));
const SEMANTIC_THRESHOLD = 0.35; // below → drop
const VALIDATE_SEMANTICS = process.env.VALIDATE_SEMANTICS === 'true';
function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (const [index, element] of a.entries()) {
        dot += element * b[index];
        na += element * element;
        nb += b[index] * b[index];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
async function filterBySemanticQuality(entries) {
    if (!VALIDATE_SEMANTICS) {
        return entries;
    }
    console.log('🧠 Semantic quality filter active...');
    const embedder = await (0, transformers_1.pipeline)('feature-extraction', 'Xenova/distiluse-base-multilingual-cased-v2');
    const getVec = async (txt) => {
        const out = await embedder(txt, { pooling: 'mean', normalize: true });
        return out.data;
    };
    const passed = [];
    const failed = [];
    for (const entry of entries) {
        const [v1, v2] = await Promise.all([
            getVec(entry.engelsk),
            getVec(entry.dansk)
        ]);
        const sim = cosine(v1, v2);
        if (sim >= SEMANTIC_THRESHOLD) {
            passed.push(entry);
        }
        else {
            failed.push({ ...entry, sim });
        }
    }
    await promises_1.default.writeFile('./validations/semantic-rejects.json', JSON.stringify(failed, null, 2));
    console.log(`✅ Kept ${passed.length.toString()}, 🗑️ Dropped ${failed.length.toString()} low-similarity entries`);
    return passed;
}
