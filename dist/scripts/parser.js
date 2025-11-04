"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIM_THRESHOLD = void 0;
const transformers_1 = require("@xenova/transformers");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const filterBySemanticQuality_1 = require("./utils/filterBySemanticQuality");
const TXT_FILE = './en-da-enwiktionary.txt';
const OUTPUT_FILE = './src/data.json';
const OUTPUT_FILE_WITH_ORIGINALS = './validations/data-originals.json';
const REJECTED_SEE_FILE = './validations/see-rejected.json';
const SHUFFLED_OUTPUT_FILE = './src/data-shuffled.json';
const SHUFFLE_SEED = 'danskify-v1';
const VALIDATE_SEMANTICS = process.env.VALIDATE_SEMANTICS === 'true';
exports.SIM_THRESHOLD = 0.42;
// -------------------------------------------------------------
// Embedding utilities (Xenova model)
// -------------------------------------------------------------
async function makeEmbedder() {
    const embedder = await (0, transformers_1.pipeline)('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    const cache = new Map();
    return async (text) => {
        const key = text.toLowerCase();
        if (cache.has(key)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return cache.get(key);
        }
        const result = await embedder(text, { pooling: 'mean', normalize: true });
        const tensor = result;
        const vec = tensor.data;
        cache.set(key, vec);
        return vec;
    };
}
// -------------------------------------------------------------
// SEE resolution with semantic validation
// -------------------------------------------------------------
async function resolveSEEReferencesSemantically(seeReferences, entries) {
    const getVec = await makeEmbedder();
    const accepted = [];
    const rejected = [];
    for (const reference of seeReferences) {
        const targets = entries.filter((entry) => entry.engelsk.toLowerCase() === reference.to.toLowerCase());
        if (targets.length === 0) {
            continue;
        }
        const sourceVec = await getVec(reference.from);
        const tgtVec = await getVec(reference.to);
        const sim = cosine(sourceVec, tgtVec);
        if (sim < exports.SIM_THRESHOLD) {
            rejected.push({ from: reference.from, to: reference.to, sim });
            continue;
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
            });
        }
    }
    console.log(`🧠 Semantic SEE filter: kept ${accepted.length.toString()}, dropped ${rejected.length.toString()}`);
    await promises_1.default.writeFile(REJECTED_SEE_FILE, JSON.stringify(rejected, null, 2), 'utf8');
    return accepted;
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
function parseExtraUsageContext(context) {
    if (!context) {
        return undefined;
    }
    const c = context.trim().toLowerCase();
    // Core POS
    if (['n', 'noun'].includes(c)) {
        return 'noun';
    }
    if (['v', 'verb'].includes(c)) {
        return 'verb';
    }
    if (['adj', 'adjective'].includes(c)) {
        return 'adjective';
    }
    if (['adv', 'adverb'].includes(c)) {
        return 'adverb';
    }
    if (['prep', 'preposition'].includes(c)) {
        return 'preposition';
    }
    if (['pron', 'pronoun'].includes(c)) {
        return 'pronoun';
    }
    if (['det', 'determiner'].includes(c)) {
        return 'determiner';
    }
    if (['conj', 'conjunction'].includes(c)) {
        return 'conjunction';
    }
    if (['interj', 'interjection'].includes(c)) {
        return 'interjection';
    }
    if (['phrase', 'idiom', 'expression'].includes(c)) {
        return 'phrase';
    }
    if (['prop', 'proper', 'proper noun'].includes(c)) {
        return 'properNoun';
    }
    if (['prefix'].includes(c)) {
        return 'prefix';
    }
    if (['suffix'].includes(c)) {
        return 'suffix';
    }
    if (['proverb'].includes(c)) {
        return 'proverb';
    }
    if (['particle'].includes(c)) {
        return 'particle';
    }
    if (['num', 'numeral'].includes(c)) {
        return 'numeral';
    }
    if (['abbr', 'abbreviation'].includes(c)) {
        return 'abbreviation';
    }
    if (['art', 'article'].includes(c)) {
        return 'article';
    }
    if (['contraction'].includes('contraction')) {
        return 'contraction';
    }
    console.log(`Unknown context ${context}`);
    return undefined;
}
const SKIPPED_FORMS = new Set([
    'article',
    'interjection',
    'abbreviation',
    'prefix',
    'suffix',
    'proverb'
]);
async function parseTxtFile(filePath) {
    const text = await promises_1.default.readFile(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const entries = [];
    const seeReferences = [];
    let removedEntriesCount = 0;
    for (const line of lines) {
        if (line.startsWith('#')) {
            continue;
        }
        const [lhsRaw, rhsRaw] = line.split('::');
        const lhs = lhsRaw.trim();
        const rhs = rhsRaw.trim();
        if (!lhs) {
            continue;
        }
        const isSeeReference = /SEE:/i.test(lhs) || /SEE:/i.test(rhs || '');
        if (!rhs && !isSeeReference) {
            continue;
        }
        const forms = [...lhs.matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim());
        const contexts = [...lhs.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
        const notes = [...(rhs.matchAll(/\[([^\]]+)\]/g) ?? [])].map((m) => m[1].trim());
        const form = parseExtraUsageContext(forms.find((f) => parseExtraUsageContext(f)));
        const extraUsageContext = contexts.join('; ') || undefined;
        const engelsk = lhs.split(/[({]/)[0].split(/SEE:/i)[0].trim();
        if (!engelsk) {
            continue;
        }
        if (form && SKIPPED_FORMS.has(form)) {
            removedEntriesCount += 1;
            continue;
        }
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const seeMatch = /SEE:\s*(.+)/i.exec(lhs) || /SEE:\s*(.+)/i.exec(rhs);
        if (seeMatch) {
            seeReferences.push({
                from: engelsk,
                to: seeMatch[1].trim(),
                form,
                context: extraUsageContext,
                originalLine: line
            });
            continue;
        }
        if (!rhs) {
            continue;
        }
        const danishVariants = rhs
            .replaceAll(/\{[^}]*\}/g, '')
            .replaceAll(/\[[^\]]*\]/g, '')
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
    const resolvedSEE = await resolveSEEReferencesSemantically(seeReferences, entries);
    entries.push(...resolvedSEE);
    // For all entries create a variant without the originalLines
    const entriesWithoutOriginalLines = entries.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ originalLine, ...rest }) => rest);
    console.log(`✅ Parsed ${entries.length.toString()} entries from ${node_path_1.default.basename(filePath)} `);
    console.log(`⚠️ Removed ${removedEntriesCount.toString()} entries due to filtering rules`);
    return [entries, entriesWithoutOriginalLines];
}
// xmur3/JSF-based deterministic PRNG
function xmur3(string_) {
    let h = 1_779_033_703 ^ string_.length;
    for (let index = 0; index < string_.length; index++) {
        // eslint-disable-next-line unicorn/prefer-code-point
        h = Math.imul(h ^ string_.charCodeAt(index), 3_432_918_353);
        h = (h << 13) | (h >>> 19);
    }
    return function () {
        h = Math.imul(h ^ (h >>> 16), 2_246_822_507);
        h = Math.imul(h ^ (h >>> 13), 3_266_489_909);
        return (h ^= h >>> 16) >>> 0;
    };
}
function sfc32(a, b, c, d) {
    return function () {
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4_294_967_296;
    };
}
/**

* Deterministic shuffle using a hash-based PRNG
  */
function seededShuffle(array, seed) {
    const seedFunction = xmur3(seed);
    const rand = sfc32(seedFunction(), seedFunction(), seedFunction(), seedFunction());
    const array_ = [...array];
    for (let index = array_.length - 1; index > 0; index--) {
        const index_ = Math.floor(rand() * (index + 1));
        [array_[index], array_[index_]] = [array_[index_], array_[index]];
    }
    return array_;
}
/**

* Parse all input sources and save output
  */
async function parseAll() {
    const allEntries = [];
    const allEntriesWithOriginal = [];
    try {
        const txtEntries = await parseTxtFile(TXT_FILE);
        allEntriesWithOriginal.push(...txtEntries[0]);
        allEntries.push(...txtEntries[1]);
    }
    catch (error) {
        console.warn(`⚠️ Could not parse ${TXT_FILE}:`, error?.message);
    }
    console.log(`\n📘 Total entries parsed: ${allEntries.length.toString()}`);
    let finalEntries = allEntries;
    if (VALIDATE_SEMANTICS) {
        finalEntries = await (0, filterBySemanticQuality_1.filterBySemanticQuality)(allEntries);
    }
    await promises_1.default.writeFile(OUTPUT_FILE, JSON.stringify(finalEntries, null, 2));
    console.log(`💾 Saved output → ${OUTPUT_FILE}`);
    await promises_1.default.writeFile(OUTPUT_FILE_WITH_ORIGINALS, JSON.stringify(allEntriesWithOriginal, null, 2));
    console.log(`💾 Saved output → ${OUTPUT_FILE_WITH_ORIGINALS}`);
    console.log('Deterministically shuffling entries...');
    const shuffled = seededShuffle(finalEntries, SHUFFLE_SEED);
    await promises_1.default.writeFile(SHUFFLED_OUTPUT_FILE, JSON.stringify(shuffled, null, 2), 'utf8');
    console.log(`💾 Saved output → ${SHUFFLED_OUTPUT_FILE}`);
}
// Run
parseAll().catch((error) => {
    console.error('❌ Parsing failed:', error);
    process.exit(1);
});
