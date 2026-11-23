/* probe-maghighs.js - planetary interiors slice 3: the magnetometer hears
 * the interior (2026-11-22). Finds, in the starting system, the world with
 * the most magnetic highs (buried ones counted double), and the loudest
 * world with a remanent crust; fits a magnetometer and a grade 2 survey
 * scanner, and shoots the MAGNETIC layer of each with its contact list.
 *
 * Set directly, and said so: the instrument grades (Combat.magLevel and
 * surveyLevel overridden), the lock, the scanner layer, and a survey
 * record marked fully swept (flying a polar orbit for a whole mapping is
 * what tools/probe-scanner.js is for). Scratch profile.
 *
 *     node tools/electron-probe.cjs tools/probe-maghighs.js "<outdir>"
 */
const G = window.Game, Sv = window.Survey;
G.title = null; G.tutorial = null; G.menu = null;
G.showHelp = false; G.showCatalogue = false;
const out = [];
let best = null, remn = null;
for (const b of G.sys.bodies) {
  if ((b.kind !== 'planet' && b.kind !== 'moon') || !(b.radius > 0)) continue;
  const mm = Sv.magMap(b, G.sys);
  if (!mm) continue;
  const cs = Sv.magContacts(b, G.sys, null, 2);
  const score = cs.reduce((s, c) => s + (c.broad ? 1 : 2), 0);
  if (!best || score > best.score) best = { b, score, cs };
  if (mm.remanence && (!remn || mm.max > remn.max)) remn = { b, max: mm.max };
}
const full = Sv.packCells(new Uint8Array(Sv.NCELL).fill(1));
const lock = (b) => {
  G.lock = b; G.focus = b; G.navTarget = { kind: 'body', id: b.id };
  const key = Sv.keyOf(G, b.id);
  G.surveys = G.surveys || {};
  G.surveys[key] = { key, cov: 1, covM: 1, cells: full, cellsM: full, t: G.t || 0, grade: 2 };
};
G.panel = 11;
/* The instruments, by their grades (as probe-blacksite.js does it). */
window.Combat.magLevel = function () { return 1; };
window.Combat.surveyLevel = function () { return 2; };
for (const [w, tag] of [[best && best.b, 'maghighs'], [remn && remn.b, 'magremn']]) {
  if (!w) { out.push(tag + ': none in ' + G.sys.name); continue; }
  lock(w);
  G.scanUI = { layer: 'mag', filter: 0, lines: false, style: 0, sweep: 1, zoom: 0, plane: 'xy' };
  await wait(500);
  const mm = Sv.magMap(w, G.sys);
  out.push(tag + ': ' + w.name + (mm.dipole ? ' (dipole)' : ' (no dipole)') + (mm.remanence ? ' remanent' : '') +
           ' max ' + mm.max.toFixed(2) + '\n  ' +
           Sv.magContacts(w, G.sys, G.surveys[Sv.keyOf(G, w.id)], 2)
             .map(c => (c.explained ? '' : '! ') + (c.broad ? 'prov ' : 'buried ') + Sv.describeMag(c)).join('\n  '));
  await shot(tag);
}
return out.join('\n');
