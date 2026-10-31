/* probe-surface-station.js - a station founded on a surface (2026-10-31):
 * the pad on the ground, and her Crawler up top as the orbital half, with
 * her shuttle between them. Founds on a claimed world, runs the clock to
 * her opening, and looks at both halves.
 *
 *     node tools/electron-probe.cjs tools/probe-surface-station.js ".probe-shots\surface-station"
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
['oreworks', 'warehouse', 'quarters'].forEach((id, i) => {
  const rec = { id: 'probe-ss-' + i, crateId: id, aboard: true, due: 0, placed: 0, paid: 0, announced: true };
  G.stationModules.push(rec); G.ship.modules.push({ id: rec.id, crateId: id });
});
Sim.refreshShip(G.ship);
G.licences = G.licences || {};
G.licences[G.here.id] = { fac: window.Licence.issuer(G.sys), forged: false, at: 0 };
const worlds = G.sys.bodies.filter(b => (b.kind === 'planet' || b.kind === 'moon') && b.radius > 800 && b.type !== 'gasGiant' && b.type !== 'iceGiant');
let placed = null;
for (const w of worlds) {
  const hs = Sim.bodyState(w, G.sys, G.t);
  for (let k = 0; k < 24 && !placed; k++) {
    const a = k / 24 * Math.PI * 2, dir = { x: Math.cos(a), y: Math.sin(a), z: 0 };
    const pos = V.add(hs.pos, V.scale(dir, w.radius * 1.3));
    if (Sim.dominantBody(pos, G.sys, G.t) !== w) continue;
    G.ship.pos = pos; G.ship.vel = V.add(hs.vel, V.scale({ x: -dir.y, y: dir.x, z: 0 }, Math.sqrt(w.mu / (w.radius * 1.3))));
    G.claims = G.claims || {};
    G.claims[G.here.id + ':' + w.id] = { key: G.here.id + ':' + w.id, star: G.here.id, body: w.id, t: 0, until: 1e12 };
    if (S.refusal(G, G.sys, G.t, 'surface') === null) placed = w;
  }
  if (placed) break;
}
out.push('over ' + (placed ? placed.name : 'NOTHING: ' + S.refusal(G, G.sys, G.t, 'surface')));
if (!placed) return out.join(' | ');
const fc = S.forecastSite(G, G.sys, G.t, 'surface');
out.push('forecast ' + (fc ? fc.net + ' cr/wk' : 'none'));
const r = S.found(G, G.sys, G.t, 'surface', { say: () => {} });
out.push('found ' + r.ok + ' ' + (r.why || r.days.toFixed(2) + ' d'));
if (!r.ok) return out.join(' | ');
const st = r.st;
G.t = S.opensAt(st) + 120;
G.warpIndex = 0; G.viewMode = 'cockpit'; G.ship.thrust = V.zero(); G.ship.throttle = 0;
await wait(900);
const ground = G.sys.byId[S.portId(st)], up = G.sys.byId[S.upId(st)];
out.push('ground ' + (ground ? R.portModelFor(ground) : 'MISSING') + ' | up ' + (up ? R.portModelFor(up) : 'MISSING'));
if (!ground || !up) return out.join(' | ');
const face = (to, upv) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const u0 = upv || (Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 });
  const right = V.norm(V.cross(f, u0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
const pos = p => Sim.bodyPosition(p, G.sys, G.t), vel = p => Sim.bodyState(p, G.sys, G.t).vel;
/* 1. The orbital half, from a kilometre off. */
const ub = Sim.portBasis(up, G.sys, G.t);
G.ship.pos = V.add(V.add(pos(up), V.scale(ub.north, 1.1)), V.scale(ub.up, 0.4));
G.ship.vel = vel(up); face(pos(up));
await wait(1200);
await shot('1-orbital-half');
/* 2. The pad on the ground, from three kilometres above it. */
const wp = pos(placed), gp = pos(ground), upDir = V.norm(V.sub(gp, wp));
G.ship.pos = V.add(gp, V.scale(upDir, 3)); G.ship.vel = vel(ground);
face(gp, V.norm(V.cross(upDir, { x: 0, y: 0, z: 1 })));
await wait(1500);
await shot('2-ground-half');
const hop = G.sys.traffic.filter(q => q.playerPort === ground.id && (q.to === up.id || q.from === up.id));
out.push('shuttle routes ' + hop.length + ', same market ' + (up.market === ground.market));
return out.join(' | ');
