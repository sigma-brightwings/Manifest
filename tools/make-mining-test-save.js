/* make-mining-test-save.js - a career set up for testing outposts and
 * drilling teams (Astra, 2026-11-19: "a save file with a ship that has all
 * the right gear, crew and another ship for sending my engineers down to
 * the planet").
 *
 *     node tools/electron-probe.cjs tools/make-mining-test-save.js <outdir>
 *
 * Writes <outdir>/manifest-mining-test.json, a save record the game imports
 * from the load page (I). What is in it:
 *   - docked at the station nearest a landable world with ore on it;
 *   - flying a Mule fitted with the deep survey array (grade 3), two drones
 *     racked, a pilot and a steady engineer aboard;
 *   - the world already surveyed (a real polar pass with that array) and a
 *     claim filed on it, and a station licence for the system;
 *   - a heavy shuttle, "Groundbreaker", on the next clamp with two
 *     engineers (good and excellent) signed on to her - the ship that takes
 *     the drilling team down;
 *   - 750,000 cr.
 * Then it proves the file loads: parsed, written to a slot, loaded through
 * the menu, and read back. */
const G = window.Game, Sim = window.Sim, V = window.V, Sv = window.Survey, C = window.Combat, Cw = window.Crew;
G.title = null;
G.paused = true;
const out = [];
/* A world: a planet or moon a heavy shuttle can lift off, ore on it, a
 * docking port in the same system. Nearest first. */
const probe = Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
probe.hullId = 'heavyshuttle'; probe.fit = {}; C.fitStock(probe); Sim.refreshShip(probe);
const stars = G.galaxy.stars.filter(s => s.factionId)
  .sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
let pick = null;
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const ports = G.sys.ports.filter(p => p.market && p.docking && !p.surface && p.kind === 'station');
  if (!ports.length) continue;
  const b = G.sys.bodies.find(x => (x.kind === 'planet' || x.kind === 'moon') && x.rotation && x.rotation.period < 3 * 86400 &&
                                    x.type !== 'gasGiant' && x.type !== 'iceGiant' && Sim.surfaceG(x) < probe.maxAccel * 0.6 &&
                                    Sv.groundMap(x, G.sys) &&
                                    Sv.deposits(x, G.sys).some(r => r.cid !== 'hydrogen' && r.tonnes > 0));
  if (b) { pick = { st, b }; break; }
}
if (!pick) return 'FAIL: no world found';
G.enterSystem(pick.st, { fresh: true });
const world = G.sys.bodies.find(x => x.id === pick.b.id);
const wpos = Sim.bodyPosition(world, G.sys, G.t);
const port = G.sys.ports.filter(p => p.market && p.docking && !p.surface && p.kind === 'station')
  .sort((a, b) => V.dist(Sim.bodyPosition(a, G.sys, G.t), wpos) - V.dist(Sim.bodyPosition(b, G.sys, G.t), wpos))[0];
out.push('system ' + G.here.name + ', world ' + world.name + ' (' + world.type + '), port ' + port.name);

/* The Mule, fitted. */
const s = G.ship;
s.docked = null; s.landed = false; s.crashed = false;
s.hullId = 'mule'; s.fit = {}; C.fitStock(s);
const fa = C.fitItem(s, 'deepsurvey');
out.push('deep survey array: ' + (fa.ok ? 'fitted' : fa.why));
Sim.refreshShip(s);
s.fuel = s.fuelCap; s.thrusterFuel = s.thrusterCap;
s.shipName = 'Prospect';
s.credits = 750000;
s.drones = 2;
s.crew = [Cw.make('Teo Brill', 'pilot', 3, 'mt-pilot'), Cw.make('Ama Hoyt', 'engineer', 2, 'mt-eng0')];

/* The survey: a real polar pass with the fitted array. */
const skey = (G.here.id || 'sys') + ':' + world.id;
G.surveys = G.surveys || {};
const fr = Sv.spinFrame(world, 0), n = fr.n, e1 = fr.e1;
const e2 = { x: n.y * e1.z - n.z * e1.y, y: n.z * e1.x - n.x * e1.z, z: n.x * e1.y - n.y * e1.x };
const inc = 88 * Math.PI / 180;
const q = { x: e2.x * Math.cos(inc) + n.x * Math.sin(inc), y: e2.y * Math.cos(inc) + n.y * Math.sin(inc), z: e2.z * Math.cos(inc) + n.z * Math.sin(inc) };
const r = world.radius * 1.3, mu = 6.6743e-20 * world.mass, om = Math.sqrt(mu / (r * r * r));
const P = 2 * Math.PI / om, t0 = G.t, total = P * 12, dt = P / 200;
for (let t = 0; t <= total; t += dt) {
  const tt = t0 + t, bs = Sim.bodyState(world, G.sys, tt), c = Math.cos(om * t), sn = Math.sin(om * t);
  s.pos = V.add(bs.pos, { x: (e1.x * c + q.x * sn) * r, y: (e1.y * c + q.y * sn) * r, z: (e1.z * c + q.z * sn) * r });
  s.vel = V.add(bs.vel, { x: (-e1.x * sn + q.x * c) * r * om, y: (-e1.y * sn + q.y * c) * r * om, z: (-e1.z * sn + q.z * c) * r * om });
  Sv.step(G, G.sys, tt, t === 0 ? 0 : dt);
}
G.t = t0 + total;
const rec = G.surveys[skey];
out.push('survey: ' + (rec ? Math.round(rec.cov * 100) + '% mapped' : 'none'));

/* The claim, and a station licence (a real one) for the port to come. */
const fc = window.Claims.fileClaim(G, G.sys, world, G.t);
out.push('claim: ' + (fc.ok ? 'filed to day ' + Math.floor(fc.claim.until / 86400) : fc.why));
const L = window.Licence;
if (L && L.needed(G.sys)) {
  G.licences = G.licences || {};
  G.licences[G.here.id] = { fac: L.issuer(G.sys), forged: false, at: G.t };
  out.push('licence: held, from ' + L.issuer(G.sys));
} else out.push('licence: none needed here');

/* Docked at the port, the shuttle on the next clamp. */
Sim.dockShip(s, port, G.sys, G.t);
/* A clean slate for a test bed: Halloway's lessons done, nobody wanting
 * anything for the unannounced docking above, the hull whole. */
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
G.wanted = {}; G.fugitive = null;
s.hullHp = (C.HULLS[s.hullId] && C.HULLS[s.hullId].hullMax) || s.hullHp;
G.navTarget = { kind: 'body', id: world.id };
const ps = Sim.bodyState(port, G.sys, G.t);
const lander = Sim.makeShip(V.clone(ps.pos), V.clone(ps.vel));
lander.hullId = 'heavyshuttle'; lander.fit = {}; C.fitStock(lander); Sim.refreshShip(lander);
lander.fuel = lander.fuelCap; lander.thrusterFuel = lander.thrusterCap;
lander.shipName = 'Groundbreaker';
lander.crew = [Cw.make('Kes Lund', 'engineer', 3, 'mt-eng1'), Cw.make('Mira Sable', 'engineer', 4, 'mt-eng2')];
/* Most of the dig's stores in the hold: haul them down and unload, and
 * the rest is either a second run or the Guild's contract. */
lander.cargo = { alloys: Math.min(30, Math.floor(lander.cargoCap || 30)) };
Sim.refreshShip(lander);
out.push('lander hold: ' + lander.cargo.alloys + ' t alloys of ' + Math.floor(lander.cargoCap) + ' t');
lander.hullHp = (C.HULLS.heavyshuttle && C.HULLS.heavyshuttle.hullMax) || lander.hullHp;
window.Fleet.park(G, lander, port.id, 'Groundbreaker');
out.push('fleet: ' + G.fleet.map(f => f.name + ' (' + f.hullId + ', ' + f.crew.length + ' crew) at ' + port.name).join('; '));
await wait(1500);
await shot('mining-test-docked');

/* Out to a file. */
/* The docking above lands a citation a moment after it, in the game loop. */
G.wanted = {}; G.fugitive = null; G.citations = [];
const label = 'Mining test - ' + world.name;
const text = window.Save.recordText(G, label);
await file('manifest-mining-test.json', text);
out.push('file: ' + Math.round(text.length / 1024) + ' kB');

/* And back in, the way the game will take it: parsed, into a slot, loaded
 * through the load page. */
const pr = window.Save.parseRecord(text);
out.push('parse: ' + (pr.ok ? 'ok' : pr.why));
window.Save.writeRecord(3, pr.rec);
G.menu = { page: 'load', sel: 2, note: null };
await key('3');
await wait(2500);
const flying = G.ship;
out.push('loaded: ' + (flying.shipName || '?') + ' ' + flying.hullId + ', crew ' + (flying.crew || []).map(p => p.name + ' (' + p.role + ')').join(', ') +
         ', drones ' + flying.drones + ', ' + Math.round(flying.credits) + ' cr, docked at ' + (G.sys.byId[flying.docked] || {}).name);
out.push('loaded fleet: ' + (G.fleet || []).map(f => f.name + ' with ' + f.crew.map(p => p.name).join(' & ')).join('; '));
out.push('loaded: tutorial ' + (G.tutorial && G.tutorial.done ? 'done' : 'ON') + ', wanted ' + JSON.stringify(G.wanted || {}) +
         ', hull ' + flying.hullHp + ', world landable by her: ' + (Sim.surfaceG(world) < flying.maxAccel ? 'yes' : 'NO') +
         ', by the shuttle: ' + (Sim.surfaceG(world) < probe.maxAccel ? 'yes' : 'NO'));
out.push('loaded claim: ' + Object.keys(G.claims || {}).join(', ') + '  survey ' + Math.round(((G.surveys || {})[skey] || {}).cov * 100) + '%');
G.menu = null;
await wait(800);
await shot('mining-test-loaded');
return out.join('\n');
