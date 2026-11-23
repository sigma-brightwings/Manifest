/* probe-surface.js - the surface under the scanner's readout (2026-11-22).
 * Picks the starting system's wettest solid world (coasts to see), marks
 * a band of it swept - the northern two-thirds, by both instruments - and
 * shoots the MAGNETIC and RESOURCES layers with SURFACE off, TRUE COLOUR
 * and OUTLINE. The southern third should stay blank: the surface shows
 * only where you have flown. The switch is driven by a real V keypress
 * through the game's key handling (the button runs the same one line).
 *
 * Set directly, and said so: the instrument grades (Combat overrides),
 * the lock, the layer, and the survey record. Scratch profile.
 *
 *     node tools/electron-probe.cjs tools/probe-surface.js "<outdir>"
 */
const G = window.Game, Sv = window.Survey, W = window.Weather;
G.title = null; G.tutorial = null; G.menu = null;
G.showHelp = false; G.showCatalogue = false;
const out = [];
const ws = G.sys.bodies.filter(b => (b.kind === 'planet' || b.kind === 'moon') && !/giant/i.test(b.type || ''));
/* The most coastline: land against sea, the thing a surface map is for. */
const coast = (b) => {
  const m = Sv.surfaceMap(b, G.sys); let c = 0;
  for (let i = 1; i < Sv.NCELL; i++) if ((m.cls[i] === 0) !== (m.cls[i - 1] === 0)) c++;
  return c;
};
ws.forEach(b => { b._coast = coast(b); });
ws.sort((a, b) => b._coast - a._coast);
const w = ws[0];
out.push(ws.slice(0, 4).map(b => b.name + ' ' + b.type + ' ' + b._coast).join(', '));
window.Combat.magLevel = () => 1;
window.Combat.surveyLevel = () => 2;
const a = new Uint8Array(Sv.NCELL);
for (let i = 0; i < Sv.NCELL; i++) if (Math.floor(i / Sv.LON_BINS) >= 60) a[i] = 1;   // rows 60..179: north two-thirds
const packed = Sv.packCells(a);
G.lock = w; G.focus = w; G.navTarget = { kind: 'body', id: w.id };
const skey = Sv.keyOf(G, w.id);
G.surveys = G.surveys || {};
G.surveys[skey] = { key: skey, cov: 0.67, covM: 0.67, cells: packed, cellsM: packed, t: G.t || 0, grade: 2 };
G.panel = 11;
const s = Sv.surfaceMap(w, G.sys);
const n = [0, 0, 0, 0]; for (let i = 0; i < Sv.NCELL; i++) n[s.cls[i]]++;
out.push(w.name + ' [' + w.type + '] land ' + n[0] + ' sea ' + n[1] + ' ice ' + n[2] + ' lava ' + n[3]);
G.scanUI = { layer: 'mag', filter: 0, lines: false, style: 0, sweep: 1, zoom: 0, plane: 'xy', base: 0 };
await wait(400);
await shot('surf-mag-off');
/* V, as a player would press it. */
const press = async () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', bubbles: true }));
  await wait(60);
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'v', code: 'KeyV', bubbles: true }));
  await wait(400);
};
await press();
out.push('after V: base ' + G.scanUI.base);
await shot('surf-mag-true');
await press();
out.push('after V: base ' + G.scanUI.base);
await shot('surf-mag-outline');
G.scanUI.layer = 'res';
await wait(400);
await shot('surf-res-outline');
await press(); await press();
out.push('base ' + G.scanUI.base);
await shot('surf-res-true');
return out.join('\n');
