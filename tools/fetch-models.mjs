/* fetch-models.mjs — put the reader model where the game loads it.
 *
 *     npm run models
 *
 * The game reads what the player types with a small sentence-embedding
 * model run locally by transformers.js (see src/embedder.js and the
 * benchmark in tools/bench-reader.mjs that chose it). Neither the model nor
 * the library's browser build is checked in — 24 MB of weights and 22 MB of
 * WebAssembly do not belong in git — so this step stages both:
 *
 *   vendor/transformers/   the browser build and its ONNX runtime, copied
 *                          from node_modules (a devDependency)
 *   lang/<id>/           the model files, downloaded once from the
 *                          Hugging Face hub into the layout the game loads
 *                          from with remote fetching switched OFF
 *
 * Without either, the game still works: the reader falls back to the anchor
 * matcher. Run before `npm run dist`, which does so itself.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline, env } from '@huggingface/transformers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* Keep in step with src/embedder.js. */
export const MODEL = 'Xenova/all-MiniLM-L12-v2';

const dist = path.join(ROOT, 'node_modules/@huggingface/transformers/dist');
const vend = path.join(ROOT, 'vendor/transformers');
fs.mkdirSync(vend, { recursive: true });
for (const f of ['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  fs.copyFileSync(path.join(dist, f), path.join(vend, f));
  console.log('vendored ' + f);
}

env.cacheDir = path.join(ROOT, 'lang');
env.localModelPath = path.join(ROOT, 'lang');
const ext = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
const v = (await ext(['our drive has failed'], { pooling: 'mean', normalize: true })).tolist()[0];
console.log(`model ${MODEL} ready in lang/ (${v.length}-dim)`);
