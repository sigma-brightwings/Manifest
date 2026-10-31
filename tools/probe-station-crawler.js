/* probe-station-crawler.js - a founded station drawn as her own Crawler,
 * docked in her belly hangar (2026-10-31). Founds a market station over a
 * world, runs the clock to her opening, then looks at her from outside,
 * from under her belly with the doors, and from her pad.
 *
 *     node tools/electron-probe.cjs tools/probe-station-crawler.js ".probe-shots\station-crawler"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, R = window.Render, S = window.Stations, C = window.Combat;
G.title = null;
const out = [];
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null; G.navTarget = null;
const H = C.HULLS.crawler;
Object.assign(G.ship, { hullId: 'crawler', dryMass: H.dryMass, cargoCap: H.cargoCap, thrustKN: H.thrustKN,
  fuelCap: H.fuelCap, fuel: H.fuelCap, hullMax: H.hullMax, hullHp: H.hullMax, craftBay: 'standard', shipName: 'Patience' });
G.stationModules = G.stationModules || [];
G.ship.modules = [];
['market', 'warehouse', 'quarters', 'berth', 'reactor'].forEach((id, i) => {
  const rec = { id: 'probe-sc-' + i, crateId: id, aboard: true, due: 0, placed: 0, paid: 0, announced: true };
  G.stationModules.push(rec); G.ship.modules.push({ id: rec.id, crateId: id });
});
Sim.refreshShip(G.ship);
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
    const vc = Math.sqrt(w.mu / (w.radius * 1.6));
    G.ship.pos = pos; G.ship.vel = V.add(hs.vel, V.scale({ x: -dir.y, y: dir.x, z: 0 }, vc));
    placed = w;
  }
  if (placed) break;
}
const fc = S.forecastSite(G, G.sys, G.t, 'orbital');
out.push('forecast ' + (fc ? fc.net + ' cr/wk' : 'none'));
const r = S.found(G, G.sys, G.t, 'orbital', { say: () => {} });
out.push('found ' + r.ok + (r.why ? ' ' + r.why : ''));
if (!r.ok) return out.join(' | ');
const st = r.st;
G.t = S.opensAt(st) + 120;
G.warpIndex = 0; G.viewMode = 'cockpit'; G.ship.thrust = V.zero(); G.ship.throttle = 0;
await wait(800);
const port = G.sys.byId[S.portId(st)];
out.push('port ' + (port ? R.portModelFor(port) : 'MISSING'));
if (!port) return out.join(' | ');
const basis = Sim.portBasis(port, G.sys, G.t);
const face = (to, up) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const u0 = up || (Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 });
  const right = V.norm(V.cross(f, u0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
const pp = () => Sim.bodyPosition(port, G.sys, G.t), pv = () => Sim.bodyState(port, G.sys, G.t).vel;
/* 1. Off her flank, a kilometre and a half out. */
G.ship.pos = V.add(V.add(pp(), V.scale(basis.north, 1.2)), V.scale(basis.up, 0.5));
G.ship.vel = pv(); face(pp());
await wait(1200);
await shot('1-her-flank');
/* 2. Under her belly, where the way in is, looking up into the door. */
G.ship.pos = V.add(pp(), V.scale(basis.up, 0.9));
G.ship.vel = pv(); face(pp(), basis.north);
await wait(1200);
await shot('2-under-her-belly');
/* 3. Berthed on her pad. */
G.ship.hullId = 'talon';
const T = C.HULLS.talon;
Object.assign(G.ship, { dryMass: T.dryMass, cargoCap: T.cargoCap, thrustKN: T.thrustKN, modules: [] });
Sim.refreshShip(G.ship);
try { Sim.dockShip(G.ship, port, G.sys, G.t); } catch (e) { out.push('dock threw ' + e.message); }
out.push('docked ' + G.ship.docked + ' berth ' + (G.ship.dockOffset && G.ship.dockOffset.berth));
G.viewMode = 'orbit';
await wait(1500);
await shot('3-berthed-chase');
G.viewMode = 'cockpit';
await wait(1200);
await shot('4-berthed-cockpit');
/* 5. The berth her Berth clamp added: the seventh, the last on the far wall. */
G.ship.docked = null; G.ship.dockOffset = null;
G.ship.pos = V.add(pp(), V.scale(basis.up, 0.9)); G.ship.vel = pv();
try { Sim.dockShip(G.ship, port, G.sys, G.t, Sim.berthCapacity(port) - 1); } catch (e) { out.push('dock7 threw ' + e.message); }
out.push('docked7 berth ' + (G.ship.dockOffset && G.ship.dockOffset.berth));
G.viewMode = 'orbit';
await wait(1500);
await shot('5-seventh-berth-chase');
const bg = window.Gen.bayGeometry(port);
out.push('bay floor ' + bg.floorZ.toFixed(3) + ' ceil ' + bg.ceilZ.toFixed(3) + ' berths ' + bg.berths + ' cap ' + Sim.berthCapacity(port));
return out.join(' | ');
