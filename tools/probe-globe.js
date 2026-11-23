/* probe-globe.js - the scanner map wrapped onto a globe (2026-11-22).
 * Mirven II (the starting system's most-coastline world), northern
 * two-thirds swept by both instruments, SURFACE on TRUE COLOUR. O toggles
 * the globe and the arrows turn it, both pressed as real keys through the
 * game's key handling. Shots: resources on the globe, turned 90 degrees
 * east, tipped to the north pole, and the magnetic layer; and the time a
 * frame of the globe costs, still and while turning.
 *
 * Set directly, and said so: the instrument grades (Combat overrides),
 * the lock, the starting layer and surface mode, and the survey record.
 *
 *     node tools/electron-probe.cjs tools/probe-globe.js "<outdir>"
 */
const G = window.Game, Sv = window.Survey;
G.title = null; G.tutorial = null; G.menu = null;
G.showHelp = false; G.showCatalogue = false;
const out = [];
const w = G.sys.bodies.find(b => b.name === 'Mirven II') || G.sys.bodies.find(b => b.kind === 'planet');
window.Combat.magLevel = () => 1;
window.Combat.surveyLevel = () => 2;
const a = new Uint8Array(Sv.NCELL);
for (let i = 0; i < Sv.NCELL; i++) if (Math.floor(i / Sv.LON_BINS) >= 60) a[i] = 1;
const packed = Sv.packCells(a);
G.lock = w; G.focus = w; G.navTarget = { kind: 'body', id: w.id };
const skey = Sv.keyOf(G, w.id);
G.surveys = G.surveys || {};
G.surveys[skey] = { key: skey, cov: 0.67, covM: 0.67, cells: packed, cellsM: packed, t: G.t || 0, grade: 2 };
G.panel = 11;
G.scanUI = { layer: 'res', filter: 0, lines: false, style: 0, sweep: 1, zoom: 0, plane: 'xy', base: 1 };
const press = async (k, code) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: code, bubbles: true }));
  await wait(40);
  window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: code, bubbles: true }));
  await wait(350);
};
const frameMs = async (n) => {
  const t0 = performance.now(); let c = 0;
  await new Promise(res => { const f = () => { if (++c >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  return ((performance.now() - t0) / n).toFixed(1);
};
await wait(300);
out.push('flat frame ' + await frameMs(30) + ' ms');
await press('o', 'KeyO');
out.push('after O: globe ' + G.scanUI.globe);
out.push('globe still frame ' + await frameMs(30) + ' ms');
await shot('globe-res');
await press('ArrowRight', 'ArrowRight'); await press('ArrowRight', 'ArrowRight');
await press('ArrowRight', 'ArrowRight'); await press('ArrowRight', 'ArrowRight');
await press('ArrowRight', 'ArrowRight'); await press('ArrowRight', 'ArrowRight');
out.push('yaw ' + G.scanUI.gYaw + ' pitch ' + G.scanUI.gPitch);
await shot('globe-res-east');
for (let i = 0; i < 4; i++) await press('ArrowUp', 'ArrowUp');
out.push('yaw ' + G.scanUI.gYaw + ' pitch ' + G.scanUI.gPitch);
await shot('globe-res-north');
G.scanUI.layer = 'mag'; await wait(350);
await shot('globe-mag-north');
G.scanUI.layer = 'res';
/* Turning, every frame a new view: the table rebuild's cost. */
let turnMs = 0;
for (let i = 0; i < 10; i++) {
  G.scanUI.gYaw = (G.scanUI.gYaw + 3) % 360;
  const t0 = performance.now();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  turnMs += (performance.now() - t0) / 2;
}
out.push('globe turning frame ~' + (turnMs / 10).toFixed(1) + ' ms');
/* Pointing: a point projected to the screen and back lands where it
 * started (the hover readout and the pin go through the unprojection). */
{
  const S = window.Screens, V = { cx: 700, cy: 460, R: 320, yaw: 1.1, pitch: 0.5 };
  let worst = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const u = Math.random(), v = 0.05 + 0.9 * Math.random();
    const p = S.globeProject(V, u, v);
    if (!p) continue;
    const q = S.globeUnproject(V, p.x, p.y);
    const du = Math.min(Math.abs(q.u - u), 1 - Math.abs(q.u - u));
    worst = Math.max(worst, du * 360, Math.abs(q.v - v) * 180); n++;
  }
  out.push('round trip over ' + n + ' near-side points: worst ' + worst.toExponential(2) + ' deg');
}
G.scanUI.gPitch = 20; G.scanUI.gYaw = 60;
await press('m', 'KeyM');
await shot('globe-mag');
return out.join('\n');
