/* probe-reader.js — for tools/electron-probe.cjs: does the reader model load
 * in the real shell (game://, the vendored browser build, WebAssembly)?
 *
 *     node tools/electron-probe.cjs tools/probe-reader.js
 *
 * Waits for embedder.js to hand Messages a model, then reads two messages
 * the anchor matcher cannot, through the same draft path the comms page
 * uses. Prints which reader answered and what it read. */
const M = window.Messages;
if (!M) return 'FAIL: no Messages on the page';
let waited = 0;
while (M.readerName() === 'phrase matcher' && waited < 60000 &&
       !(window.__reader && /failed/.test(window.__reader.stage))) { await wait(250); waited += 250; }
log('reader after ' + waited + ' ms: ' + M.readerName() + '  status ' + JSON.stringify(window.__reader));
const G = window.Game;
const out = [];
for (const text of ['Thrusters are offline and we are spinning',
                    'We have orphans from the colony aboard, oxygen is almost gone']) {
  const t0 = performance.now();
  const d = M.draft(G, G.sys, G.t, 'distress', text, null);
  while (d.pending) await wait(5);
  out.push(text + '  =>  ' + M.describeClaims(d.claims) + '  [' + d.reader + ', ' +
           Math.round(performance.now() - t0) + ' ms]');
  G.msgDraft = null;
}
return out.join('\n');
