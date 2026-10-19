/* bench-reader.mjs — which reader understands the player best, measured.
 *
 *     node tools/bench-reader.mjs [model ...]
 *
 * Doctrine 6: measure before choosing a threshold — and before choosing a
 * model. Runs every candidate sentence-embedding model over the labelled
 * phrasings in test/reader-phrases.json, through the SAME code the
 * game uses (Messages.embedRead), and prints accuracy and speed.
 *
 * TAU and MARGIN are tuned on the EVEN items and scored on the ODD ones, so
 * the number reported is not a number the tuning has seen. Models are
 * downloaded once into ./lang (the layout the game loads from offline).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { pipeline, env } from '@huggingface/transformers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.join(ROOT, 'src/vec3.js'));
require(path.join(ROOT, 'src/rng.js'));
const M = require(path.join(ROOT, 'src/messages.js'));

env.cacheDir = path.join(ROOT, 'lang');
env.allowLocalModels = true;
env.localModelPath = path.join(ROOT, 'lang');

const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/reader-phrases.json'), 'utf8')).items;

/* [id, pooling] — BGE models are trained for CLS pooling, MiniLM for mean. */
const ALL = [
  ['Xenova/all-MiniLM-L6-v2', 'mean'],
  ['Xenova/all-MiniLM-L12-v2', 'mean'],
  ['Xenova/bge-small-en-v1.5', 'cls'],
  ['Xenova/bge-base-en-v1.5', 'cls'],
  ['Xenova/gte-small', 'mean']
];
const pick = process.argv.slice(2);
const MODELS = pick.length ? ALL.filter(m => pick.some(p => m[0].includes(p))) : ALL;

function want(item, slot) {
  const w = item[slot];
  if (w == null) return null;
  return w;
}
function got(claim) {
  if (!claim) return null;
  return (claim.neg ? 'NOT ' : '') + claim.value;
}

async function score(items, reader) {
  let ok = 0, all = 0, whole = 0;
  const misses = [];
  for (const it of items) {
    const r = await reader(it.text);
    let itemOk = true;
    for (const slot of ['cargo', 'situation', 'threat']) {
      all++;
      if (want(it, slot) === got(r[slot])) ok++;
      else { itemOk = false; misses.push(`${slot}: wanted ${want(it, slot)} got ${got(r[slot])} — "${it.text}"`); }
    }
    if (itemOk) whole++;
  }
  return { slot: ok / all, whole: whole / items.length, misses };
}

const even = fx.filter((_, i) => i % 2 === 0), odd = fx.filter((_, i) => i % 2 === 1);
const para = fx.filter(it => it.kind === 'para');

const lexical = async t => M.read(t);
const lexAll = await score(fx, lexical), lexOdd = await score(odd, lexical), lexPara = await score(para, lexical);
console.log(`\nlexical matcher       held-out slots ${(lexOdd.slot * 100).toFixed(1)}%  ` +
            `whole ${(lexOdd.whole * 100).toFixed(1)}%   paraphrases ${(lexPara.slot * 100).toFixed(1)}%   all ${(lexAll.slot * 100).toFixed(1)}%`);

const results = [];
for (const [id, pooling] of MODELS) {
  let ext;
  const t0 = Date.now();
  try {
    ext = await pipeline('feature-extraction', id, { dtype: 'q8' });
  } catch (e) {
    console.log(`\n${id}: could not load — ${e.message}`);
    continue;
  }
  const loadMs = Date.now() - t0;
  /* Cached per text: the grid below reads the same clauses thousands of
   * times, and the model's answer for a string never changes. */
  const cache = new Map();
  const embed = async texts => {
    const missing = texts.filter(t => !cache.has(t));
    if (missing.length) {
      const v = (await ext(missing, { pooling, normalize: true })).tolist();
      missing.forEach((t, i) => cache.set(t, v[i]));
    }
    return texts.map(t => cache.get(t));
  };
  const rawEmbed = async texts => (await ext(texts, { pooling, normalize: true })).tolist();
  const protos = await M.preparePrototypes(embed);

  /* Speed: uncached, so it is what a player actually waits for. */
  await rawEmbed(['warm up']);
  const msg = 'Our drive is dead, we have wounded aboard and pirates closing';
  const ts = Date.now();
  for (let i = 0; i < 10; i++) await M.embedRead(msg + ' ' + i, rawEmbed, protos);
  const perMsg = (Date.now() - ts) / 10;

  /* Tune on even, score on odd. */
  let best = null;
  for (const mode of ['hybrid', 'model', 'sure']) {
    for (let tau = 0.30; tau <= 0.86; tau += 0.02) {
      for (const margin of [0, 0.01, 0.02, 0.04]) {
        for (const share of [0, 0.03, 0.06, 1]) {
          for (const sure of (mode === 'sure' ? [0.05, 0.1, 0.15] : [0])) {
           for (const skipFilled of (mode === 'hybrid' ? [false, true] : [false])) {
            const opts = { tau, margin, mode, share, sure, skipFilled };
            const r = await score(even, t => M.embedRead(t, embed, protos, opts));
            if (!best || r.slot > best.r.slot || (r.slot === best.r.slot && r.whole > best.r.whole)) {
              best = { opts, r };
            }
           }
          }
        }
      }
    }
  }
  const held = await score(odd, t => M.embedRead(t, embed, protos, best.opts));
  const paraR = await score(para, t => M.embedRead(t, embed, protos, best.opts));
  const allR = await score(fx, t => M.embedRead(t, embed, protos, best.opts));
  const size = dirSize(path.join(ROOT, 'lang', id));
  results.push({ id, pooling, opts: best.opts, held, paraR, allR, perMsg, loadMs, size });
  console.log(`\n${id}  (${pooling}, ${(size / 1e6).toFixed(0)} MB, load ${loadMs} ms, ${perMsg.toFixed(0)} ms/message)`);
  console.log(`  tuned  tau ${best.opts.tau.toFixed(2)}  margin ${best.opts.margin}  mode ${best.opts.mode}` +
              `  share ${best.opts.share}  sure ${best.opts.sure}  skipFilled ${best.opts.skipFilled}`);
  const mixed = fx.filter(it => it.kind === 'mixed');
  const mixR = await score(mixed, t => M.embedRead(t, embed, protos, best.opts));
  const mixLex = await score(mixed, lexical);
  console.log(`  mixed messages ${(mixR.slot * 100).toFixed(1)}%  (matcher alone ${(mixLex.slot * 100).toFixed(1)}%)`);
  console.log(`  held-out slots ${(held.slot * 100).toFixed(1)}%  whole ${(held.whole * 100).toFixed(1)}%   ` +
              `paraphrases ${(paraR.slot * 100).toFixed(1)}%   all ${(allR.slot * 100).toFixed(1)}%`);
  for (const m of allR.misses.slice(0, 6)) console.log('    miss  ' + m);
}

fs.writeFileSync(path.join(ROOT, 'lang', 'bench-reader.json'),
  JSON.stringify({ when: new Date().toISOString(), lexical: { held: lexOdd, para: lexPara, all: lexAll },
                   results: results.map(r => ({ ...r, held: { slot: r.held.slot, whole: r.held.whole },
                                                paraR: { slot: r.paraR.slot }, allR: { slot: r.allR.slot } })) },
                 null, 2));

function dirSize(p) {
  let n = 0;
  if (!fs.existsSync(p)) return 0;
  for (const f of fs.readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, f.name);
    n += f.isDirectory() ? dirSize(q) : fs.statSync(q).size;
  }
  return n;
}
