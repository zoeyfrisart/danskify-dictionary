"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable unicorn/no-process-exit */
const node_crypto_1 = __importDefault(require("node:crypto"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const INPUT_FILE = './validations/data-originals.json';
const OUTPUT_FILE = './validations/validation-sample.json';
const SAMPLE_SIZE = 500;
// Optional seed via CLI flag (e.g. `node validate-sample.js --seed 123`)
const argumentSeed = process.argv.find((a) => a.startsWith('--seed'));
const SEED = argumentSeed ? argumentSeed.split('=')[1] : node_crypto_1.default.randomUUID();
// PRNG seeded if provided, otherwise random each run
function seededRandom(seed) {
    let h = node_crypto_1.default.createHash('sha256').update(seed).digest();
    let index = 0;
    return () => {
        if (index >= h.length - 8) {
            h = node_crypto_1.default.createHash('sha256').update(h).digest();
            index = 0;
        }
        const number_ = h.readUInt32LE(index);
        index += 4;
        return number_ / 0xff_ff_ff_ff;
    };
}
async function createValidationSample() {
    const absPath = node_path_1.default.resolve(INPUT_FILE);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = JSON.parse(await promises_1.default.readFile(absPath, 'utf8'));
    if (!Array.isArray(data)) {
        throw new TypeError('Input JSON is not an array');
    }
    const rand = seededRandom(SEED);
    const shuffled = [...data];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const index_ = Math.floor(rand() * (index + 1));
        [shuffled[index], shuffled[index_]] = [shuffled[index_], shuffled[index]];
    }
    const sample = shuffled.slice(0, SAMPLE_SIZE);
    await promises_1.default.writeFile(OUTPUT_FILE, JSON.stringify(sample, null, 2), 'utf8');
    console.log(`✅ Wrote ${SAMPLE_SIZE.toString()} entries to ${OUTPUT_FILE}`);
    console.log(`Seed used: ${SEED}`);
}
createValidationSample().catch((error) => {
    console.error('❌ Failed to create validation sample:', error);
    process.exit(1);
});
