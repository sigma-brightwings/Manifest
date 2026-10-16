/* mining.test.js - mining rung 3: cutting rock and skimming gas.
 *
 *     node test/mining.test.js
 *
 * What this holds (claude/mining-and-survey.md, "3. Hand-mining and
 * skimming"):
 *   - THE LASER: a mining laser down the nose finds the rock the picture
 *     draws, piles work on it, and a chunk comes free at the face - a shard
 *     the scoop can take, that the wreck cap will not delete;
 *   - THE ROCK: what comes off is the survey's answer leaned by the rock's
 *     look, poorer ground gives more slag, and it is booked in G.extracted;
 *   - THE GAS: a skimmer in a giant's air takes density x speed x area,
 *     more and richer deeper, nothing without the intake or off a rocky
 *     world, never past the hold - and an ice giant's top is survivable
 *     under a heat shield where a gas giant's is not.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
var Rg = require('../src/rings.js');
var Sim = require('../src/sim.js');
var Sv = require('../src/survey.js');
var Combat = require('../src/combat.js');
var Mn = require('../src/mining.js');
var V = global.V;

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
var systems = [];
for (var s = 0; s < gal.stars.length && s < 40; s++) {
  var sy = Gen.generateSystem(gal.stars[s].seed, optsFor(gal.stars[s]));
  sy._star = gal.stars[s];
  systems.push(sy);
}

console.log('--- the laser ---');
var gun = Combat.GUNS.mininglaser;
check('a mining laser is in the catalogue', !!gun && gun.mining && gun.slot === 'hardpoint',
      gun && (gun.price + ' cr, ' + gun.range + ' km'));
check('it barely scratches a hull', gun.dmg <= 1 && gun.dmg / gun.cooldown < 10);

/* A belt field, and a rock in it a little way off the ship. */
var bsys = null, bfield = null, bbelt = null;
systems.some(function (sys) {
  return (sys.belts || []).some(function (b) {
    if (b.fields && b.fields.length) { bsys = sys; bbelt = b; bfield = b.fields[0]; return true; }
    return false;
  });
});
check('found a belt field', !!bfield, bbelt && bbelt.name);
var t0 = 5000 * 86400;
var cen = Rg.fieldCenter(bfield, bsys, t0), hf = Rg.hillFrame(cen);
var rock = null;
for (var m = 0; m < bfield.count && !rock; m++) {
  var r = Rg.fieldMember(bfield, m, bsys, t0, cen, hf);
  if (r.size > 0.05 && r.size < 0.5) rock = r;
}
var dir = V.norm({ x: 0.3, y: -0.8, z: 0.2 });
var G = { here: { id: 'test' }, t: t0, extracted: {} };
var ship = Sim.makeShip(V.addScaled(rock.pos, dir, -(rock.size + 1.2)), rock.vel);
Sim.refreshShip(ship);
ship.fwd = dir; ship.up = V.norm(V.cross(dir, { x: 0, y: 0, z: 1 })); ship.right = V.cross(ship.fwd, ship.up);
G.ship = ship; G.sys = bsys;
var near = Mn.rocksNear(G, bsys, ship.pos, t0, 3);
var same = near.filter(function (x) { return x.id === rock.id; })[0];
check('the rock the renderer draws is the rock the laser sees', !!same && V.dist(same.pos, rock.pos) < 1e-9,
      near.length + ' rocks within 3 km');
var hit = Mn.rayRock(near, ship.pos, dir, gun.range);
check('the ray down the nose meets it at its face', hit && hit.rock.id === rock.id && Math.abs(hit.dist - 1.2) < 1e-6,
      hit && hit.dist.toFixed(4) + ' km');
check('and misses when the nose is off it', !Mn.rayRock(near.filter(function (x) { return x.id === rock.id; }),
      ship.pos, V.norm(V.add(dir, { x: 0, y: 0, z: 0.8 })), gun.range));

var said = [];
var hooks = { say: function (m) { said.push(m); }, sound: function () {} };
bsys.canisters = [];
var shots = 0, freed = null;
while (shots < 200 && !freed) {
  var res = Mn.cut(bsys, G, t0, gun, Infinity, hooks);
  shots++;
  if (res && res.shard) freed = res;
}
check('held on the rock, a chunk comes free', !!freed, shots + ' cycles = ' + (shots * gun.cooldown).toFixed(1) + ' s');
check('after the work the catalogue says', shots === Math.ceil(Mn.CUT_PER_CHUNK / gun.dmg));
var sh = freed.shard;
check('at the face it was cut from', V.dist(sh.pos, hit.at) < 0.01);
var drift = V.dist(sh.vel, rock.vel) * 1000;
check('drifting off it slowly enough to scoop', drift >= 1 && drift <= 4, drift.toFixed(2) + ' m/s');
check('it is a shard, an ore chunk, kept from the wreck cap', sh.kind === 'debris' && sh.ore && sh.life === Mn.CHUNK_LIFE);
Sim.spawnDebris(bsys, 'wreck1', ship.pos, ship.vel, 0.3, t0, null);
for (var w = 0; w < 12; w++) Sim.spawnDebris(bsys, 'wreck' + w, ship.pos, ship.vel, 0.3, t0, null);
check('a dozen wrecks later it is still there', bsys.canisters.indexOf(sh) >= 0);
if (freed.chunk.cid) {
  check('its tonnes are booked against the belt', Math.abs(G.extracted['test:' + bbelt.id][freed.chunk.cid] - freed.chunk.tonnes) < 1e-9,
        freed.chunk.tonnes + ' t ' + freed.chunk.cid);
} else {
  check('slag books nothing', !G.extracted['test:' + bbelt.id]);
}

console.log('--- the rock ---');
check('a chunk is a pure function of rock and count', JSON.stringify(Mn.chunkOf(G, same, 7)) === JSON.stringify(Mn.chunkOf(G, same, 7)));
function tally(rk, n) {
  var o = { slag: 0, n: n };
  for (var k = 0; k < n; k++) { var c = Mn.chunkOf({ extracted: {} }, rk, k); o[c.cid || 'slag'] = (o[c.cid || 'slag'] || 0) + 1; }
  return o;
}
var src = { kind: 'belt', id: 'b', name: 'B', ice: 0.1, metal: 0.6, fields: [1] };
var metalRock = { id: 'mr', kind: 'metal', key: 'k', source: src };
var iceRock = { id: 'ir', kind: 'ice', key: 'k', source: { kind: 'belt', id: 'b', name: 'B', ice: 0.8, metal: 0.1, fields: [1] } };
var tm = tally(metalRock, 400), ti = tally(iceRock, 400);
check('a metal rock in a metal belt gives rare metals', (tm.rare || 0) > (tm.water || 0) && (tm.rare || 0) > 40, JSON.stringify(tm));
check('an ice rock in an icy belt gives water', (ti.water || 0) > (ti.rare || 0) * 3, JSON.stringify(ti));
/* The same stony rock, in a belt that is nearly all ice and in one that is
 * nearly all ore: in the first there is little in it a stone can hold. */
var poor = { id: 'pr', kind: 'stone', key: 'k', source: { kind: 'belt', id: 'p', name: 'P', ice: 0.95, metal: 0, fields: [1] } };
var rich = { id: 'pr', kind: 'stone', key: 'k', source: { kind: 'belt', id: 'r', name: 'R', ice: 0.02, metal: 0.3, fields: [1] } };
var tp = tally(poor, 400), tr = tally(rich, 400);
check('poorer ground for the rock, more slag', tp.slag > tr.slag * 1.5, tp.slag + ' vs ' + tr.slag + ' of 400');
var ringP = bsys.bodies.filter(function (b) { return b.ring; })[0] ||
            systems.map(function (x) { return x.bodies.filter(function (b) { return b.ring; })[0]; }).filter(Boolean)[0];
check('ring chunks are rock too', !!ringP && Sv.deposits({ kind: 'ring', planet: ringP }).length > 0, ringP && ringP.name);

console.log('--- the gas ---');
var giant = null, gsys = null, gasG = null, rocky = null, rsys = null;
systems.forEach(function (sys) {
  sys.bodies.forEach(function (b) {
    if (!b.atmosphere) return;
    if (!giant && b.type === 'iceGiant') { giant = b; gsys = sys; }
    if (!gasG && b.type === 'gasGiant') gasG = { b: b, sys: sys };
    if (!rocky && !Mn.isGiant(b) && b.kind === 'planet') { rocky = b; rsys = sys; }
  });
});
check('found an ice giant with air', !!giant, giant && giant.name);
function inAir(body, sys, frac, t) {
  var bs = Sim.bodyState(body, sys, t);
  var r = body.radius + body.atmosphere.top * frac;
  var v = Math.sqrt(6.6743e-20 * body.mass / r);
  var sp = Sim.makeShip(V.add(bs.pos, { x: r, y: 0, z: 0 }), V.add(bs.vel, { x: 0, y: v, z: 0 }));
  Sim.refreshShip(sp);
  return sp;
}
var Gg = { here: { id: 'test' }, extracted: {} };
Gg.ship = inAir(giant, gsys, 0.85, t0);
var hold0 = Gg.ship.cargo.hydrogen || 0;
var none = Mn.skimStep(Gg, gsys, t0, 1, false);
check('no intake, no hydrogen', none === 0 && (Gg.ship.cargo.hydrogen || 0) === hold0);
var got = Mn.skimStep(Gg, gsys, t0, 1, true);
var sk = Gg.skimming;
var expect = sk.rho * sk.v * 1000 * Mn.SKIM_AREA / 1000 * sk.frac;
check('density x speed x area, in tonnes', Math.abs(got - expect) < 1e-9 && got > 0,
      got.toFixed(3) + ' t/s at ' + sk.v.toFixed(1) + ' km/s, ' + Math.round(sk.frac * 100) + '% H');
check('into the hold and the ledger', Math.abs((Gg.ship.cargo.hydrogen || 0) - hold0 - got) < 1e-9 &&
      Math.abs(Gg.extracted['test:' + giant.id].hydrogen - got) < 1e-9);
var Gd = { here: { id: 'test' }, extracted: {} };
Gd.ship = inAir(giant, gsys, 0.6, t0);
var deep = Mn.skimStep(Gd, gsys, t0, 1, true);
check('deeper takes more, and richer', deep > got * 3 && Gd.skimming.frac > sk.frac,
      deep.toFixed(2) + ' t/s, ' + Math.round(Gd.skimming.frac * 100) + '% H');
var Gf = { here: { id: 'test' }, extracted: {} };
Gf.ship = inAir(giant, gsys, 0.6, t0);
Gf.ship.cargo.ores = Math.floor(Gf.ship.cargoCap - Sim.cargoMass(Gf.ship)) - 0.5;
Sim.refreshShip(Gf.ship);
var fill = 0;
for (var k = 0; k < 30; k++) fill += Mn.skimStep(Gf, gsys, t0 + k, 1, true);
check('never past the hold', Sim.cargoMass(Gf.ship) <= Gf.ship.cargoCap + 1e-9 && Gf.skimming.full, fill.toFixed(2) + ' t then full');
if (rocky) {
  var Gr = { here: { id: 'test' }, extracted: {} };
  Gr.ship = inAir(rocky, rsys, 0.5, t0);
  check('a rocky world\'s air gives nothing', Mn.skimStep(Gr, rsys, t0, 1, true) === 0 && !Gr.skimming, rocky.name);
}
var shield = 18 + Combat.MODULES.heatshield.shed;
var fluxIce = Sim.heatFlux(inAir(giant, gsys, 0.9, t0), gsys, t0);
check('an ice giant\'s top can be skimmed under a heat shield', fluxIce < shield, fluxIce.toFixed(0) + ' < ' + shield);
if (gasG) {
  var fluxGas = Sim.heatFlux(inAir(gasG.b, gasG.sys, 0.95, t0), gasG.sys, t0);
  check('a gas giant\'s cannot, for long', fluxGas > shield, gasG.b.name + ': ' + fluxGas.toFixed(0) + ' > ' + shield);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
