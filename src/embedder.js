/* embedder.js — the model that reads what the player types.
 *
 * An ES module, loaded by index.html AFTER every classic script, because
 * transformers.js only ships as a module and everything else in src/ is a
 * plain script on `window`. It does one thing: start the sentence-embedding
 * model in the background and hand Messages an `embed` function once the
 * model is ready (Messages.useEmbedder). Until then — or forever, if the
 * files are missing, the page was opened from file://, or WebAssembly is
 * refused — Messages reads with its anchor matcher, and nothing else in the
 * game knows the difference.
 *
 * OFFLINE BY CONSTRUCTION. Remote model fetching is switched off: the
 * weights come from lang/ and the runtime from vendor/transformers/,
 * both staged by `npm run models`. A game that phoned the Hugging Face hub
 * on first launch would be a game that does not start on a train.
 *
 * Which model, and why: tools/bench-reader.mjs, 2026-10-18 — MiniLM-L12
 * had the best held-out accuracy of five candidates (92.9%; MiniLM-L6
 * 91.7%, gte-small 89.3%, bge-base 89.3%, bge-small 85.7%) at 35 MB and
 * ~7 ms a message on the Crawler's CPU. bge-base read paraphrases a little
 * better but tripped on denials and costs 111 MB and 20 ms.
 */
const MODEL = 'Xenova/all-MiniLM-L12-v2';
const POOLING = 'mean';

/* Where it got to, for anyone asking why the matcher is still reading —
 * the probe (tools/probe-reader.js) and the console both read this. A
 * fallback that does not say why is indistinguishable from a bug. */
const status = window.__reader = { stage: 'waiting', ms: 0, error: null };

async function start() {
  const M = window.Messages;
  if (!M || !M.useEmbedder) { status.stage = 'no Messages'; return; }
  const base = new URL('../', import.meta.url);
  const t0 = performance.now();
  const at = (s) => { status.stage = s; status.ms = Math.round(performance.now() - t0); };
  try {
    at('importing runtime');
    const T = await import(new URL('vendor/transformers/transformers.min.js', base).href);
    at('loading model');
    T.env.allowRemoteModels = false;
    T.env.allowLocalModels = true;
    /* The files are already on disk; and the browser Cache API refuses the
     * game:// scheme outright, so leaving this on printed four warnings at
     * every launch and cached nothing. */
    T.env.useBrowserCache = false;
    T.env.localModelPath = new URL('lang/', base).href;
    T.env.backends.onnx.wasm.wasmPaths = new URL('vendor/transformers/', base).href;
    /* Threads need cross-origin isolation, which game:// does not ask for.
     * One thread, measured in the real shell on the Crawler (2026-10-18):
     * ready ~2.2 s after launch, ~35 ms a message — node's native runtime
     * is ~7 ms, but 35 ms on a comms screen is nothing a player can see. */
    T.env.backends.onnx.wasm.numThreads = 1;
    const ext = await T.pipeline('feature-extraction', MODEL, { dtype: 'q8', device: 'wasm' });
    at('embedding prototypes');
    const embed = async (texts) => (await ext(texts, { pooling: POOLING, normalize: true })).tolist();
    const protos = await M.preparePrototypes(embed);
    M.useEmbedder(embed, protos, MODEL);
    at('ready');
    console.info('[reader] ' + MODEL + ' ready in ' + status.ms + ' ms');
  } catch (e) {
    status.error = (e && (e.stack || e.message)) || String(e);
    at('failed at ' + status.stage);
    console.warn('[reader] model unavailable (' + status.stage + '), reading with the phrase matcher: ' +
                 (e && e.message));
  }
}

/* After the first frame, so the model's load never delays the title card. */
if (typeof requestIdleCallback === 'function') requestIdleCallback(() => start(), { timeout: 3000 });
else setTimeout(start, 500);
