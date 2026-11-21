/* probe-outpost.js - the scanner map's outpost control (2026-11-19). Same
 * setup as probe-scanner.js (a partial polar survey of a world with ground
 * worth reading), then two of your drones on the claim, the richest one
 * pinned: the button, then the outpost being built, then standing.
 *
 *     node tools/electron-probe.cjs tools/probe-outpost.js <shots dir>
 */
const G = window.Game, Sim = window.Sim, V = window.V, Sv = window.Survey, Op = window.Outposts;
G.title = null;
G.paused = true;
window.Combat.surveyLevel = function () { return 3; };
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
let pick = null;
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const b = G.sys.bodies.find(x => x.kind === 'planet' && x.rotation && x.rotation.period < 3 * 86400 && Sv.groundMap(x, G.sys));
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
const t0 = G.t, total = P * 10, dt = P / 200;
for (let t = 0; t <= total; t += dt) {
  const tt = t0 + t, bs = Sim.bodyState(world, G.sys, tt), c = Math.cos(om * t), sn = Math.sin(om * t);
  G.ship.pos = V.add(bs.pos, { x: (e1.x * c + q.x * sn) * r, y: (e1.y * c + q.y * sn) * r, z: (e1.z * c + q.z * sn) * r });
  G.ship.vel = V.add(bs.vel, { x: (-e1.x * sn + q.x * c) * r * om, y: (-e1.y * sn + q.y * c) * r * om, z: (-e1.z * sn + q.z * c) * r * om });
  Sv.step(G, G.sys, tt, t === 0 ? 0 : dt);
}
G.t = t0 + total;
G._surveyNow = skey;
G.panel = window.Game.modeIndex ? window.Game.modeIndex('scanner') : 11;
G.claims = G.claims || {};
G.claims[skey] = { key: skey, star: G.here.id, body: world.id, name: world.name, t: G.t, until: G.t + 365 * 86400 };
G.ship.credits = Math.max(G.ship.credits, 60000);
/* Two drones on the claim, on the two richest ore cells the survey read. */
const gm = Sv.groundMap(world, G.sys), idx = [];
for (let c = 0; c < Sv.NCELL; c++) if (Sv.cellsOf(G.surveys[skey])[c]) idx.push(c);
idx.sort((a, b) => gm.grade.ores[b] - gm.grade.ores[a]);
const cells = [idx[0], idx[Math.min(idx.length - 1, 300)]];
G.drones = [];
cells.forEach((cell, k) => {
  const la = Math.floor(cell / Sv.LON_BINS), lo = cell % Sv.LON_BINS;
  G.drones.push({ id: 'drone-' + skey + '-' + k, key: skey, star: G.here.id, body: world.id, name: world.name,
                  at: { lat: -Math.PI / 2 + (la + 0.5) * Math.PI / Sv.LAT_BINS, lon: (lo + 0.5) * 2 * Math.PI / Sv.LON_BINS, elevation: 0 },
                  cid: 'ores', grade: Math.max(0.05, gm.grade.ores[cell]), t0: G.t - 40 * 86400, baseT: G.t - 40 * 86400, base: 0,
                  stripRate: 1e-9 });
});
const bestC = cells[0], lo = bestC % Sv.LON_BINS, la = Math.floor(bestC / Sv.LON_BINS);
const flip = !!(world.rotation && world.rotation.period > 0);
const col = flip ? Sv.LON_BINS - 1 - lo : lo;
G.scanUI = { layer: 'res', filter: 0, lines: true, style: 0, sweep: 1, zoom: 2, pin: { key: skey, cell: bestC, x: col },
             cx: col + 0.5, cy: Sv.LAT_BINS - 0.5 - la };
G.cursor.active = false;
const out = ['world ' + world.name + ' cells ' + cells.join(',')];
await wait(1500);
await shot('outpost-button');
out.push('refusal before: ' + Op.refusal(G, G.sys, G.t, G.drones[0].id));
const o = Op.order(G, G.sys, G.t, G.drones[0].id);
out.push('order: ' + (o.ok ? o.text : o.why));
await wait(1200);
await shot('outpost-building');
G.t = o.outpost.doneAt + 30 * 86400;
await wait(1200);
await shot('outpost-standing');
out.push('status: ' + Op.statusLine(G, o.outpost, G.t));
/* Landed at it with two engineers aboard: the drilling team. */
G.ship.docked = null;
G.ship.landed = true; G.ship.crashed = false;
G.ship.landedAt = { body: world.id, lat: o.outpost.at.lat, lon: o.outpost.at.lon, elevation: 0.004 };
Sim.updateLandedShip(G.ship, G.sys, G.t);
G.ship.crew = (G.ship.crew || []).filter(p => p.role !== 'engineer')
  .concat([window.Crew.make('Kes Lund', 'engineer', 3, 'pe1'), window.Crew.make('Mira Sable', 'engineer', 4, 'pe2')]);
G.forgedBlanks = 1;
G.ship.credits = Math.max(G.ship.credits, 120000);
await wait(1200);
await shot('drill-button');
out.push('post refusal: ' + Op.postRefusal(G, G.sys, G.t));
const pt = Op.postTeam(G, G.sys, G.t, { say: () => {} });
out.push('post: ' + (pt.ok ? pt.text : pt.why));
await wait(1200);
await shot('drill-digging');
out.push('status: ' + Op.statusLine(G, o.outpost, G.t));
G.panel = 0;
return out.join('\n');
