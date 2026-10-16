/* claims.test.js - mining rung 2: claims, drones, and the ground they sit on.
 *
 *     node test/claims.test.js
 *
 * What this holds (claude/mining-and-survey.md, "2. Claims and drones"):
 *   - THE GROUND: a clean landing is a place on the world - it turns with
 *     it, and the drive lifts you off it only if it beats the gravity;
 *   - CLAIMS: filed only on ground surveyed a quarter or better, for a fee,
 *     for a year, renewable;
 *   - DRONES: a hopper that is a pure function of the clock (warp gives the
 *     answer flying would), capped, stopped by a lapsed claim, emptied by
 *     thieves at a rate the system's crime sets;
 *   - COLLECTION: tonnes go into the hold up to its room, and into the
 *     extraction ledger the survey reads.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
var Sv = require('../src/survey.js');
var Cl = require('../src/claims.js');
var V = global.V;
var DAY = 86400;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
function optsFor(st) {
  var fac = gal.factionById ? gal.factionById[st.factionId] : null;
  return fac ? { faction: fac, allFactions: gal.factions } : {};
}

/* A world the drive can lift off, with something a drone can dig. */
var sys = null, world = null, heavy = null;
var probe = Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
Sim.refreshShip(probe);
for (var si = 0; si < gal.stars.length && si < 80 && !(world && heavy); si++) {
  var sy = Gen.generateSystem(gal.stars[si].seed, optsFor(gal.stars[si]));
  sy.bodies.forEach(function (b) {
    if (b.kind !== 'planet' && b.kind !== 'moon') return;
    var g = Sim.surfaceG(b);
    if (!heavy && g > probe.maxAccel * 1.1) heavy = { sys: sy, body: b };
    if (world || g > probe.maxAccel * 0.5) return;
    var rows = Sv.deposits(b, sy).filter(function (r) { return r.cid !== 'hydrogen' && r.tonnes > 0; });
    if (rows.length) { sys = sy; world = b; }
  });
}
check('found a liftable world with ore', !!world, world ? world.name + ', g ' + (Sim.surfaceG(world) * 1e3).toFixed(4) + ' m/s2' : '');

var t0 = 1000 * DAY;
var G = { here: { id: 'test' }, sys: sys, t: t0, surveys: {}, claims: {}, drones: [], extracted: {} };
var hs = Sim.bodyState(world, sys, t0);
var spot = { lat: 0.3, lon: 1.1, elevation: 0.004 };
var ship = Sim.makeShip(V.add(hs.pos, Sim.surfaceOffset(world, spot, t0).pos), hs.vel);
Sim.refreshShip(ship);
ship.credits = 40000;
G.ship = ship;

console.log('--- the ground ---');
var ls = Sim.landSpot(world, sys, t0, ship.pos);
function angDiff(a, b) { var d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); }
check('a touchdown point reads back as the same lat/lon',
      Math.abs(ls.lat - spot.lat) < 1e-6 && angDiff(ls.lon, spot.lon) < 1e-6,
      'lat ' + ls.lat.toFixed(6) + ' lon ' + ls.lon.toFixed(6));
ship.landed = true; ship.crashed = false; ship.landedAt = ls;
Sim.updateLandedShip(ship, sys, t0 + 0.3 * DAY);
var hs2 = Sim.bodyState(world, sys, t0 + 0.3 * DAY);
var expect = V.add(hs2.pos, Sim.surfaceOffset(world, spot, t0 + 0.3 * DAY).pos);
check('a landed ship turns with the world', V.dist(ship.pos, expect) < 1e-3, V.dist(ship.pos, expect).toExponential(2) + ' km');
check('and stands on its surface', Math.abs(V.dist(ship.pos, hs2.pos) - world.radius - 0.004) < 1e-6);
ship.throttle = 0;
check('no throttle, no lift-off', !Sim.liftOff(ship, sys, t0).ok && ship.landed);
if (heavy) {
  var hp = Sim.bodyState(heavy.body, heavy.sys, t0);
  var hship = Sim.makeShip(V.add(hp.pos, Sim.surfaceOffset(heavy.body, spot, t0).pos), hp.vel);
  Sim.refreshShip(hship);
  hship.landed = true; hship.landedAt = Sim.landSpot(heavy.body, heavy.sys, t0, hship.pos); hship.throttle = 1;
  var lh = Sim.liftOff(hship, heavy.sys, t0);
  check('a world heavier than the drive keeps you', !lh.ok && hship.landed && lh.g > lh.max,
        heavy.body.name + ': g ' + (lh.g * 1e3).toFixed(3) + ' > ' + (lh.max * 1e3).toFixed(3) + ' m/s2');
}

console.log('--- claims ---');
var key = Cl.keyOf(G, world.id);
check('no survey, no claim', !Cl.claimable(G, sys, world, t0).ok);
G.surveys[key] = { key: key, cov: 0.2, t: t0 };
check('a fifth surveyed is not enough', !Cl.claimable(G, sys, world, t0).ok);
G.surveys[key].cov = 0.4;
var f = Cl.fileClaim(G, sys, world, t0);
check('a claim on ground surveyed 40%', f.ok && ship.credits === 40000 - Cl.CLAIM_FEE, ship.credits + ' cr left');
check('it runs a year', Math.round((f.claim.until - t0) / DAY) === 365);
check('no drone aboard, nothing to set down', !Cl.act(G, sys, t0).ok);
check('drones are bought', Cl.buyDrone(G).ok && Cl.buyDrone(G).ok && ship.drones === 2);
check('and the racks hold two', !Cl.buyDrone(G).ok && ship.drones === 2);

console.log('--- drones ---');
Sim.updateLandedShip(ship, sys, t0);
var dep = Cl.act(G, sys, t0);
check('landed on the claim, N sets a drone down', dep.ok && ship.drones === 1 && G.drones.length === 1, dep.text || dep.why);
var d = G.drones[0];
var rows = Sv.remaining(G, key, Sv.deposits(world, sys)).filter(function (r) { return r.cid !== 'hydrogen' && r.tonnes > 0; });
var bestV = Math.max.apply(null, rows.map(function (r) { return r.grade * Eco.BY_ID[r.cid].base; }));
check('it digs the most valuable thing there', Math.abs(d.grade * Eco.BY_ID[d.cid].base - bestV) < 1e-9, d.cid + ' grade ' + d.grade.toFixed(2));
d.stripRate = 1e-9;                         // a quiet system, for the arithmetic
var h10 = Cl.hopper(G, d, t0 + 10 * DAY);
check('the hopper fills at rate x grade', Math.abs(h10.tonnes - Cl.DRONE_RATE * d.grade * 10) < 1e-9, h10.tonnes.toFixed(3) + ' t in 10 days');
var asked = [];
for (var k = 1; k <= 40; k++) asked.push(Cl.hopper(G, d, t0 + k * DAY).tonnes);
check('asking along the way changes nothing (warp = flying)', Cl.hopper(G, d, t0 + 10 * DAY).tonnes === h10.tonnes);
check('it stops at the hopper', Cl.hopper(G, d, t0 + 3000 * DAY).tonnes === Cl.HOPPER);

console.log('--- collection ---');
var tc = t0 + 30 * DAY, before = Cl.hopper(G, d, tc).tonnes;
Sim.updateLandedShip(ship, sys, tc);
var cg = Cl.collect(G, sys, tc, d);
check('collecting puts whole tonnes in the hold', cg.taken === Math.floor(before) && ship.cargo[d.cid] === cg.taken, cg.text);
check('and in the extraction ledger the survey reads', G.extracted[key][d.cid] === cg.taken &&
      Sv.remaining(G, key, Sv.deposits(world, sys)).filter(function (r) { return r.cid === d.cid; })[0].tonnes ===
      Sv.deposits(world, sys).filter(function (r) { return r.cid === d.cid; })[0].tonnes - cg.taken);
check('the hopper restarts from what was left', Math.abs(Cl.hopper(G, d, tc).tonnes - (before - cg.taken)) < 1e-9);
var room = ship.cargoCap - Sim.cargoMass(ship);
ship.cargo.ores = (ship.cargo.ores || 0) + Math.max(0, Math.floor(room) - 3);
Sim.refreshShip(ship);
var tf = tc + 400 * DAY;                     // past the claim
var full = Cl.hopper(G, d, tf);
check('a lapsed claim stops the digging', full.lapsed && full.tonnes <= Cl.DRONE_RATE * d.grade * (f.claim.until - tc) / DAY + 1 + 1e-9);
var c2 = Cl.collect(G, sys, tf, d);
check('a near-full hold takes what fits', c2.taken <= 3 && c2.left > 0, c2.text);
check('a drone with ore in it will not be picked up', !Cl.recover(G, sys, tf).ok);

console.log('--- stripping ---');
var calm = Cl.stripRate({ crimeScore: 0 }), wild = Cl.stripRate({ crimeScore: 100 });
check('lawless systems strip more', wild > calm * 10, (1 / calm).toFixed(0) + ' days vs ' + (1 / wild).toFixed(0) + ' days between');
var n = 0, M = 400;
for (var i = 0; i < M; i++) {
  var dd = { id: 'x' + i, t0: 0, stripRate: wild };
  var cnt = 0, s = 0;
  while (true) { var u = Math.max(1e-9, Sv.hash01(dd.id + ':strip:' + cnt)); s += -Math.log(u) / wild * DAY; if (s > 365 * DAY) break; cnt++; }
  n += cnt;
}
var mean = n / M;
check('strips per year match the rate', Math.abs(mean - wild * 365) < wild * 365 * 0.15, mean.toFixed(2) + ' vs ' + (wild * 365).toFixed(2));
var dz = { id: 'z', key: key, cid: 'ores', grade: 0.5, t0: t0, baseT: t0, base: 0, stripRate: wild };
var sAt = Cl.lastStripBefore(dz, t0 + 200 * DAY);
check('the strip times are fixed when it goes down', sAt === Cl.lastStripBefore(dz, t0 + 200 * DAY) && sAt > t0);
var hz = Cl.hopper(G, dz, t0 + 200 * DAY);
check('a strip empties the hopper', hz.stripped && Math.abs(hz.tonnes - Math.min(Cl.HOPPER, Cl.DRONE_RATE * 0.5 * (t0 + 200 * DAY - sAt) / DAY)) < 1e-9);

console.log('--- renewal ---');
G.t = tf;
var bal = ship.credits;
var r2 = Cl.fileClaim(G, sys, world, tf);
check('a lapsed claim refiles from today', r2.ok && !r2.renewed && Math.round((r2.claim.until - tf) / DAY) === 365 && ship.credits === bal - Cl.CLAIM_FEE);
var after = Cl.hopper(G, d, tf);
check('and credits no digging for the gap', Math.abs(after.tonnes - c2.left) < 1e-9, after.tonnes.toFixed(2) + ' t');
var r3 = Cl.fileClaim(G, sys, world, tf + 10 * DAY);
check('a live claim renews on top', r3.ok && r3.renewed && Math.round((r3.claim.until - tf) / DAY) === 730);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
