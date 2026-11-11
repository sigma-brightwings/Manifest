/* probe-scanner.js - for tools/electron-probe.cjs: the full-screen planetary
 * scanner (Shift+F3) after a polar survey with the grade-3 array and a
 * magnetometer (2026-11-10). Flies a fast synthetic polar orbit round the
 * nearest rock with a field and ground worth reading, then screenshots the
 * RESOURCES, MAGNETIC and BOTH layers, and the SURVEY MFD miniature.
 *
 *     node tools/electron-probe.cjs tools/probe-scanner.js "Claude outputs\scanner-probe"
 */
const G = window.Game, Sim = window.Sim, V = window.V, Sv = window.Survey;
G.title = null;
G.paused = true;
window.Combat.surveyLevel = function () { return 3; };
window.Combat.magLevel = function () { return 1; };
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
let pick = null;
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const b = G.sys.bodies.find(x => (x.kind === 'planet') && x.magnetosphere && x.rotation && x.rotation.period < 3 * 86400 &&
                                    Sv.groundMap(x, G.sys));
  if (b) { pick = { b, st }; break; }
}
if (!pick) return 'no suitable world found';
G.enterSystem(pick.st, { fresh: true });
const world = G.sys.bodies.find(x => x.id === pick.b.id);
const skey = (G.here.id || 'sys') + ':' + world.id;
G.navTarget = { kind: 'body', id: world.id };
G.surveys = G.surveys || {};
const fr = Sv.spinFrame(world, 0), n = fr.n, e1 = fr.e1;
const e2 = { x: n.y * e1.z - n.z * e1.y, y: n.z * e1.x - n.x * e1.z, z: n.x * e1.y - n.y * e1.x };
const inc = 88 * Math.PI / 180;
const q = { x: e2.x * Math.cos(inc) + n.x * Math.sin(inc), y: e2.y * Math.cos(inc) + n.y * Math.sin(inc), z: e2.z * Math.cos(inc) + n.z * Math.sin(inc) };
const r = world.radius * 1.3, mu = 6.6743e-20 * world.mass, om = Math.sqrt(mu / (r * r * r));
const P = 2 * Math.PI / om;
G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
const keep = { pos: G.ship.pos, vel: G.ship.vel };
const t0 = G.t, passes = 8;
/* A partial survey on purpose: stop part-way so the unflown columns show. */
const total = P * passes, dt = P / 200;
for (let t = 0; t <= total; t += dt) {
  const tt = t0 + t;
  const bs = Sim.bodyState(world, G.sys, tt), c = Math.cos(om * t), sn = Math.sin(om * t);
  G.ship.pos = V.add(bs.pos, { x: (e1.x * c + q.x * sn) * r, y: (e1.y * c + q.y * sn) * r, z: (e1.z * c + q.z * sn) * r });
  G.ship.vel = V.add(bs.vel, { x: (-e1.x * sn + q.x * c) * r * om, y: (-e1.y * sn + q.y * c) * r * om, z: (-e1.z * sn + q.z * c) * r * om });
  Sv.step(G, G.sys, tt, t === 0 ? 0 : dt);
}
G.t = t0 + total;
const rec = G.surveys[skey];
G._surveyNow = skey;
const idx = window.Game.modeIndex ? window.Game.modeIndex('scanner') : 11;
G.panel = idx;
G.cursor.active = true; G.cursor.x = 520; G.cursor.y = 330;
const out = ['world ' + world.name + ' (' + world.type + ') period ' + Math.round(world.rotation.period) + ' s, orbit ' + Math.round(P) + ' s',
             'rec ' + (rec ? 'cov ' + Math.round(rec.cov * 100) + '% covM ' + Math.round((rec.covM || 0) * 100) + '%' : 'none')];
/* A claim and a drone aboard, so the map's deploy control is live. */
G.claims = G.claims || {};
G.claims[skey] = { key: skey, until: G.t + 365 * 86400, filed: G.t };
G.ship.drones = 2;
const deps = window.Screens && G.surveys[skey] ? null : null;
const views = [
  ['z1', { layer: 'res', filter: 0, lines: true, style: 0, sweep: 1, zoom: 0 }, null],
  ['z4-deposit', { layer: 'res', filter: 0, lines: true, style: 0, sweep: 1, zoom: 2 }, 'dep'],
  ['z8-deposit', { layer: 'both', filter: 0, lines: true, style: 0, sweep: 1, zoom: 3 }, 'dep']
];
for (const [name, ui, pinWhat] of views) {
  G.scanUI = ui;
  if (pinWhat === 'dep') {
    /* Pin the richest ore cell, and put the view on it. */
    const gm = Sv.groundMap(world, G.sys);
    let bestC = 0;
    for (let c = 0; c < Sv.NCELL; c++) if (gm.grade.ores[c] > gm.grade.ores[bestC]) bestC = c;
    const lo = bestC % Sv.LON_BINS, la = Math.floor(bestC / Sv.LON_BINS);
    const flip = !!(world.rotation && world.rotation.period > 0);
    const col = flip ? Sv.LON_BINS - 1 - lo : lo;
    ui.pin = { key: skey, cell: bestC, x: col };
    ui.cx = col + 0.5; ui.cy = Sv.LAT_BINS - 0.5 - la;
    G.cursor.active = false;
  }
  await wait(1800);
  await shot('scanner-' + name);
  await wait(1200);
}
G.panel = 0;
await wait(300);
return out.join('\n') + '\nfps ' + Math.round(G.fps);
