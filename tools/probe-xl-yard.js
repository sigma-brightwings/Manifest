/* probe-xl-yard.js - two Crawlers stitched into an XL shipyard
 * (2026-10-31). Founds a shipyard over a world, opens her, flies a second
 * Crawler alongside and stitches her on, then looks at the pair.
 *
 *     node tools/electron-probe.cjs tools/probe-xl-yard.js ".probe-shots\xl-yard"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, R = window.Render, S = window.Stations, C = window.Combat;
G.title = null;
const out = [];
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null; G.navTarget = null;
const H = C.HULLS.crawler;
function makeCrawler(crates, tag) {
  Object.assign(G.ship, { hullId: 'crawler', dryMass: H.dryMass, cargoCap: H.cargoCap, thrustKN: H.thrustKN,
    fuelCap: H.fuelCap, fuel: H.fuelCap, hullMax: H.hullMax, hullHp: H.hullMax, craftBay: 'standard', shipName: 'Patience ' + tag });
  G.stationModules = G.stationModules || [];
  G.ship.modules = [];
  crates.forEach((id, i) => {
    const rec = { id: 'probe-xl-' + tag + i, crateId: id, aboard: true, due: 0, placed: 0, paid: 0, announced: true };
    G.stationModules.push(rec); G.ship.modules.push({ id: rec.id, crateId: id });
  });
  Sim.refreshShip(G.ship);
}
makeCrawler(['slipway', 'repair', 'quarters'], 'A');
G.licences = G.licences || {};
G.licences[G.here.id] = { fac: window.Licence.issuer(G.sys), forged: false, at: 0 };
const worlds = G.sys.bodies.filter(b => (b.kind === 'planet' || b.kind === 'moon') && b.radius > 800);
let placed = null;
for (const w of worlds) {
  const hs = Sim.bodyState(w, G.sys, G.t);
  for (let k = 0; k < 24 && !placed; k++) {
    const a = k / 24 * Math.PI * 2, dir = { x: Math.cos(a), y: Math.sin(a), z: 0 };
    const pos = V.add(hs.pos, V.scale(dir, w.radius * 1.6));
    if (Sim.dominantBody(pos, G.sys, G.t) !== w) continue;
    if (!G.sys.ports.every(p => p.surface || V.dist(Sim.bodyPosition(p, G.sys, G.t), pos) > 800)) continue;
    G.ship.pos = pos; G.ship.vel = V.add(hs.vel, V.scale({ x: -dir.y, y: dir.x, z: 0 }, Math.sqrt(w.mu / (w.radius * 1.6))));
    placed = w;
  }
  if (placed) break;
}
const r = S.found(G, G.sys, G.t, 'orbital', { say: () => {} });
out.push('found ' + r.ok + (r.why ? ' ' + r.why : ''));
if (!r.ok) return out.join(' | ');
const st = r.st;
G.t = S.opensAt(st) + 120;
G.warpIndex = 0; G.viewMode = 'cockpit'; G.ship.thrust = V.zero(); G.ship.throttle = 0;
await wait(800);
const port = G.sys.byId[S.portId(st)];
/* A second Crawler, alongside. */
makeCrawler(['berth'], 'B');
const cs = S.crawlerState(st, G.sys, G.t);
G.ship.pos = V.add(cs.pos, { x: 3, y: 0, z: 0 }); G.ship.vel = V.clone(cs.vel);
const sr = S.stitch(G, G.sys, st, G.t, { say: () => {} });
out.push('stitch ' + sr.ok + (sr.why ? ' ' + sr.why : ' crawlers ' + sr.crawlers) + ' | model ' + R.portModelFor(port) +
  ' | xlYard ' + port.xlYard + ' | type ' + S.typeName(st, G.t) + ' | leviathan ' + (C.orderRefusal(G, port, 'leviathan') || 'ok'));
await wait(600);
const basis = Sim.portBasis(port, G.sys, G.t);
const face = (to) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const u0 = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = V.norm(V.cross(f, u0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
const pp = Sim.bodyPosition(port, G.sys, G.t);
G.ship.pos = V.add(V.add(pp, V.scale(basis.east, 1.3)), V.scale(basis.up, 0.6));
G.ship.vel = Sim.bodyState(port, G.sys, G.t).vel; face(pp);
await wait(1500);
await shot('1-two-crawlers');
G.ship.pos = V.add(pp, V.scale(basis.up, 1.2)); face(pp);
await wait(1200);
await shot('2-from-under');
return out.join(' | ');
