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
/* A star's own belt, not a giant's Trojans: stars stage 2 gave kawartha a
 * gas giant, and the first field anywhere became its Trojan swarm, whose
 * first chunk is slag - which skipped the booking and ore-share checks. */
systems.some(function (sys) {
  return (sys.belts || []).some(function (b) {
    if (b.kind === 'belt' && b.fields && b.fields.length) { bsys = sys; bbelt = b; bfield = b.fields[0]; return true; }
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
check('after 2 t of rock is cut, by the rock\'s hardness',
      shots === Math.ceil(Mn.PIECE_T / (gun.dmg * Mn.BEAM_T_PER_UNIT * Mn.HARDNESS[hit.rock.kind]) - 1e-9),
      shots + ' cycles on ' + hit.rock.kind);
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
    /* At least Saturn's mass (95 M_earth): since stars stage 2 the first gas
     * giant of all is Mirven VI, a light 72 M_earth one whose top runs at
     * 129 against the shield's 148; 65 of 76 giants in 40 systems exceed it. */
    if (!gasG && b.type === 'gasGiant' && b.mass >= 95 * 5.9722e24) gasG = { b: b, sys: sys };
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
  /* Nose along the orbit - into the air, the way a ram scoop flies. */
  sp.fwd = { x: 0, y: 1, z: 0 }; sp.up = { x: 1, y: 0, z: 0 }; sp.right = V.cross(sp.fwd, sp.up);
  return sp;
}
var Gg = { here: { id: 'test' }, extracted: {} };
Gg.ship = inAir(giant, gsys, 0.85, t0);
var hold0 = Gg.ship.cargo.hydrogen || 0;
var none = Mn.skimStep(Gg, gsys, t0, 1, false);
check('no intake, no hydrogen', none === 0 && (Gg.ship.cargo.hydrogen || 0) === hold0);
var got = Mn.skimStep(Gg, gsys, t0, 1, true);
var sk = Gg.skimming;
/* x SKIM_GIANT_GAIN (2026-11-03): a giant's intake is scaled back up by
 * what its co-rotating air took off a prograde pass - see mining.js. */
var expect = sk.rho * sk.v * 1000 * Mn.SKIM_AREA * sk.face / 1000 * sk.frac * Mn.SKIM_GIANT_GAIN;
check('density x speed x area x facing, in tonnes', Math.abs(got - expect) < 1e-9 && got > 0 && sk.face > 0.95,
      got.toFixed(3) + ' t/s at ' + sk.v.toFixed(1) + ' km/s, ' + Math.round(sk.frac * 100) + '% H, face ' + sk.face.toFixed(3));
/* A RAM SCOOP (Astra, 2026-10-18): face first or nothing. */
function aimed(fwd) { var Ga = { here: { id: 'test' }, extracted: {} }; Ga.ship = inAir(giant, gsys, 0.85, t0); Ga.ship.fwd = fwd;
  return { got: Mn.skimStep(Ga, gsys, t0, 1, true), sk: Ga.skimming }; }
var side = aimed({ x: 1, y: 0, z: 0 }), tail = aimed({ x: 0, y: -1, z: 0 });
/* 60 degrees off the AIR, which turns with the giant (2026-11-03): the
 * oncoming air is no longer exactly along the orbit (+y) once the giant's
 * spin - tilted, and a few km/s at this height - is taken off it, so the
 * angle is measured from the wind the scoop actually meets (sk.airDir).
 * This was 60 degrees off +y, which was 60 degrees off the air only while
 * the air stood still. */
var aDir = sk.airDir, aPerp = V.norm(V.cross(aDir, { x: 1, y: 0, z: 0 }));
var off60 = aimed(V.norm(V.add(V.scale(aDir, 0.5), V.scale(aPerp, Math.sqrt(3) / 2))));
check('side-on, the scoop takes nothing', side.got === 0 && side.sk && side.sk.face === 0);
check('tail first, nothing', tail.got === 0);
check('60 degrees off, about half', Math.abs(off60.got / got - 0.5) < 0.03, (off60.got / got).toFixed(3));
check('and the HUD knows which way the nose should go', side.sk.airDir && V.dot(side.sk.airDir, { x: 0, y: 1, z: 0 }) > 0.95);
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
/* All at t0: skimStep does not move the ship, and the giant does. At t0 + k
 * the static ship was in the air for 30 s only by luck of orbital phase;
 * stars stage 2 moved Oruun VII to 2.05 AU and it now leaves her behind in
 * under ten, so the hold-full check saw no air at all. */
for (var k = 0; k < 30; k++) fill += Mn.skimStep(Gf, gsys, t0, 1, true);
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

/* ---- a skim pass, retuned for air that turns (2026-11-03) -----------------
 * Once a giant's air co-rotated, a pass WITH the spin met it slower and ran
 * x0.53 the heat and x0.81 the intake it used to (40 giants); Astra: put a
 * typical prograde pass back where it was, keep against-the-spin harder.
 * Sim.GIANT_HEAT_GAIN and Mining.SKIM_GIANT_GAIN do that. The reference is
 * the same pass with the giant's spin stopped (period 1e30), which is the
 * old still-air model exactly - checked against 274be91^ over 32 giants, to
 * the digit. A pass: equatorial ellipse, apoapsis 3 radii, periapsis at
 * 0.85 of the air's top, nose held into the wind, flown with drag. */
console.log('--- a skim pass, with and against the spin ---');
function skimPass(g, dir, still) {
  var b = g.b, sys = g.sys, t = 5e5, rot0 = b.rotation;
  var om = Sim.spinOmega(b), wHat = V.norm(om);
  var any = Math.abs(wHat.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  var rHat = V.norm(V.cross(wHat, any)), tHat = V.scale(V.cross(wHat, rHat), dir);
  var mu = 6.6743e-20 * b.mass, rp = b.radius + b.atmosphere.top * 0.85, ra = 3 * b.radius;
  var a = (rp + ra) / 2, e = (ra - rp) / (ra + rp), p = a * (1 - e * e), h = Math.sqrt(mu * p);
  var nu = -Math.acos(Math.max(-1, Math.min(1, (p / (b.radius + b.atmosphere.top * 1.02) - 1) / e)));
  var rr = p / (1 + e * Math.cos(nu));
  var posL = V.add(V.scale(rHat, rr * Math.cos(nu)), V.scale(tHat, rr * Math.sin(nu)));
  var radH = V.norm(posL), tanH = V.norm(V.sub(V.scale(tHat, Math.cos(nu)), V.scale(rHat, Math.sin(nu))));
  var velL = V.add(V.scale(radH, mu / h * e * Math.sin(nu)), V.scale(tanH, mu / h * (1 + e * Math.cos(nu))));
  var bs = Sim.bodyState(b, sys, t);
  var sh = Sim.makeShip(V.add(bs.pos, posL), V.add(bs.vel, velL));
  sh.cargoCap = 1e9; Sim.refreshShip(sh);
  var Gp = { here: { id: 'pass' }, extracted: {}, ship: sh };
  if (still) b.rotation = { period: 1e30, tilt: (rot0 && rot0.tilt) || 0, phase: 0, az: rot0 && rot0.az };
  var heat = 0, intake = 0, inside = false, tt = t, dt = 0.5;
  for (var i = 0; i < 40000; i++) {
    var ctx = Sim.atmosphereContext(sh.pos, sys, tt);
    if (ctx && ctx.body === b) {
      inside = true;
      sh.fwd = V.norm(V.sub(sh.vel, Sim.airVelocity(ctx, sh.pos)));
      heat += Sim.heatFlux(sh, sys, tt) * dt;
      intake += Mn.skimStep(Gp, sys, tt, dt, true);
    } else if (inside) break;
    Sim.advanceShip(sh, sys, tt, dt, 200); tt += dt;
    if (sh.landed || sh.crashed) break;
  }
  b.rotation = rot0;
  return { heat: heat, intake: intake };
}
var passGiants = [];
systems.forEach(function (sys) { sys.bodies.forEach(function (b) { if (Mn.isGiant(b) && b.atmosphere && passGiants.length < 12) passGiants.push({ b: b, sys: sys }); }); });
function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[a.length >> 1]; }
var proH = [], proI = [], retH = [], ordered = 0;
passGiants.forEach(function (g) {
  var ref = skimPass(g, 1, true), pro = skimPass(g, 1, false), ret = skimPass(g, -1, false);
  /* Still air TODAY carries the gains too, so the old figure is today's
   * still-air one divided by them - both gains are flat multipliers. */
  var oldH = ref.heat / Sim.GIANT_HEAT_GAIN, oldI = ref.intake / Mn.SKIM_GIANT_GAIN;
  proH.push(pro.heat / oldH); proI.push(pro.intake / oldI); retH.push(ret.heat / oldH);
  if (ret.heat > pro.heat * 1.5) ordered++;
});
check('found giants to skim', passGiants.length >= 10, passGiants.length + ' giants');
check('a prograde pass costs the heat it did in still air (median within 10%)',
      Math.abs(median(proH) - 1) < 0.10, 'x' + median(proH).toFixed(3) + ' with GIANT_HEAT_GAIN ' + Sim.GIANT_HEAT_GAIN);
check('and swallows the hydrogen it did (median within 10%)',
      Math.abs(median(proI) - 1) < 0.10, 'x' + median(proI).toFixed(3) + ' with SKIM_GIANT_GAIN ' + Mn.SKIM_GIANT_GAIN);
check('against the spin is harder on every giant - over 1.5x the prograde heat',
      ordered === passGiants.length, ordered + ' of ' + passGiants.length + ', median retrograde x' + median(retH).toFixed(2) + ' of the old still-air pass');

console.log('--- the star (2026-10-24) ---');
/* Astra: empty systems have "hydrogen for fuel to keep moving at the star
 * or one of the planets". Not every system has a giant; every one has a
 * star. */
var starOf = {};
gal.stars.forEach(function (st) { if (!starOf[st.cls]) starOf[st.cls] = Gen.generateSystem(st.seed); });
function inCorona(sys, k, t) {
  var star = sys.root, bs = Sim.bodyState(star, sys, t);
  var r = star.radius * k, v = Math.sqrt(6.6743e-20 * star.mass / r);
  var sp = Sim.makeShip(V.add(bs.pos, { x: r, y: 0, z: 0 }), V.add(bs.vel, { x: 0, y: v, z: 0 }));
  Sim.refreshShip(sp);
  sp.fwd = { x: 0, y: 1, z: 0 }; sp.up = { x: 1, y: 0, z: 0 }; sp.right = V.cross(sp.fwd, sp.up);
  return sp;
}
var sunSys = starOf.G || starOf.K || starOf.F;
var Gs = { here: { id: 'test' }, extracted: {} };
Gs.ship = inCorona(sunSys, 1.5, t0);
Gs.ship.fuel = 2;
var tank0 = Gs.ship.fuel, holdH0 = Gs.ship.cargo.hydrogen || 0;
var sGot = Mn.skimStep(Gs, sunSys, t0, 1, true), ssk = Gs.skimming;
check('a star\'s corona can be skimmed', sGot > 0 && ssk && ssk.star, sGot.toFixed(3) + ' t/s in ' + sunSys.root.name + ' (' + sunSys.root.type + ')');
check('density x speed x area x facing, as for a giant',
      ssk && Math.abs(sGot - ssk.rho * ssk.v * 1000 * Mn.SKIM_AREA * ssk.face / 1000 * ssk.frac) < 1e-9);
/* Astra, 2026-10-24: "you skim and then choose to refuel from inside the
 * ship menu" - into the hold, and the tank only when asked. */
check('it goes into the hold, not the tank', Gs.ship.fuel === tank0 && Math.abs((Gs.ship.cargo.hydrogen || 0) - holdH0 - sGot) < 1e-9,
      sGot.toFixed(3) + ' t in the hold, tank still ' + tank0 + ' t');
for (var q = 0; q < 120; q++) Mn.skimStep(Gs, sunSys, t0 + q, 1, true);
var inHold = Gs.ship.cargo.hydrogen, room = Gs.ship.fuelCap - Gs.ship.fuel;
var moved = Mn.refuelFromHold(Gs.ship, 0);
check('refuelling from the hold fills the tank, no further', Math.abs(moved - Math.min(inHold, room)) < 0.011 && Gs.ship.fuel <= Gs.ship.fuelCap + 1e-9,
      moved.toFixed(2) + ' t moved, tank ' + Gs.ship.fuel.toFixed(2) + '/' + Gs.ship.fuelCap + ', hold ' + (Gs.ship.cargo.hydrogen || 0).toFixed(2) + ' t');
check('and the tonnes come out of the hold', Math.abs(((Gs.ship.cargo.hydrogen || 0) + moved) - inHold) < 1e-9);
check('a full tank takes nothing more', Mn.refuelFromHold(Gs.ship, 0) === 0);
var Gk = { ship: { fuel: 0, fuelCap: 30, cargo: { hydrogen: 10 } } };
check('hydrogen under contract is not burned', Mn.refuelFromHold(Gk.ship, 8) === 2 && Gk.ship.cargo.hydrogen === 8 && Gk.ship.fuel === 2);
check('and with none aboard, nothing', Mn.refuelFromHold({ fuel: 0, fuelCap: 30, cargo: {} }, 0) === 0);
var Gdeep = { here: { id: 'test' }, extracted: {} };
Gdeep.ship = inCorona(sunSys, 1.2, t0); Gdeep.ship.fuel = 0;
check('deeper takes more', Mn.skimStep(Gdeep, sunSys, t0, 1, true) > sGot * 2);
var Gout = { here: { id: 'test' }, extracted: {} };
Gout.ship = inCorona(sunSys, Sim.CORONA_TOP + 0.5, t0);
check('outside the corona, nothing', Mn.skimStep(Gout, sunSys, t0, 1, true) === 0 && !Gout.skimming);
check('and no drag: the corona is not air', !Sim.atmosphereContext(Gs.ship.pos, sunSys, t0));
var bare = 18;
if (starOf.M) check('a red dwarf can be skimmed deep on a bare hull',
  Sim.heatFlux(inCorona(starOf.M, 1.2, t0), starOf.M, t0) < bare, Sim.heatFlux(inCorona(starOf.M, 1.2, t0), starOf.M, t0).toFixed(0) + ' < ' + bare);
check('a sun-like star wants a heat shield halfway down',
  Sim.heatFlux(inCorona(sunSys, 1.5, t0), sunSys, t0) > bare && Sim.heatFlux(inCorona(sunSys, 1.5, t0), sunSys, t0) < shield,
  Sim.heatFlux(inCorona(sunSys, 1.5, t0), sunSys, t0).toFixed(0));
var hot = starOf.A || starOf.B || starOf.O;
if (hot) check('a hot star is dangerous deep even under one',
  Sim.heatFlux(inCorona(hot, 1.5, t0), hot, t0) > shield, hot.root.type + ': ' + Sim.heatFlux(inCorona(hot, 1.5, t0), hot, t0).toFixed(0) + ' > ' + shield);
var noCorona = gal.stars.filter(function (st, i) { return i < 120; }).filter(function (st) {
  var sy = Gen.generateSystem(st.seed, { empty: true });
  return !Sim.coronaContext(V.add(Sim.bodyState(sy.root, sy, 0).pos, { x: sy.root.radius * 2, y: 0, z: 0 }), sy, 0);
});
check('every star has a corona to skim', noCorona.length === 0, noCorona.length + ' without');

console.log('--- rock torpedoes ---');
var TG = Combat.MISSILES.rocktorp, TS = Combat.MISSILES.syndtorp;
check('two torpedoes: the Guild\'s and the Syndicate\'s', TG && TG.torpedo && TS && TS.torpedo && TS.grey && !TG.grey,
      TG.price + ' / ' + TS.price + ' cr');
var minePort = null, otherPort = null, tsys = null;
systems.some(function (sy2) {
  (sy2.ports || []).forEach(function (p) {
    var role = p.market && (p.market.role || p.market.roleId);
    if (role === 'mining' && !minePort) { minePort = p; tsys = sy2; }
  });
  return !!minePort;
});
(tsys.ports || []).forEach(function (p) { if (p !== minePort && !otherPort && (p.market && p.market.role) !== 'mining') otherPort = p; });
var Gs = { sys: tsys, standing: {} };
check('the Guild sells them at its halls', Combat.torpedoSoldAt(Gs, minePort, TG), minePort.name);
check('and nowhere else', !otherPort || !Combat.torpedoSoldAt(Gs, otherPort, TG));
check('the Syndicate sells where it is the landlord', Combat.torpedoSoldAt(Gs, { faction: 'outlaw', market: {} }, TS));

/* A rock, a ship 1.5 km off its face, the nose on it. */
function torpRig(rockPick) {
  var Gt = { here: { id: 'test' }, t: t0, extracted: {}, sys: bsys, warpIndex: 0, explosions: [] };
  var sp = Sim.makeShip(V.addScaled(rockPick.pos, dir, -(rockPick.size + 1.5)), rockPick.vel);
  Sim.refreshShip(sp);
  sp.fwd = dir; sp.up = V.norm(V.cross(dir, { x: 0, y: 0, z: 1 })); sp.right = V.cross(sp.fwd, sp.up);
  sp.credits = 50000;
  Combat.initShip(sp);
  sp.racks = { rocktorp: { id: 'rocktorp', n: 2, batch: null } };
  sp.missileId = 'rocktorp';
  Combat.syncRacks(sp);
  Gt.ship = sp;
  return Gt;
}
bsys.canisters = []; bsys.missiles = [];
var Gt = torpRig(rock);
var said2 = [];
var hk = { say: function (m) { said2.push(m); }, sound: function () {} };
Combat.fireMissile(bsys, Gt, t0, hk);
check('the missile key will not launch one', !(bsys.missiles || []).length && /ordnance panel/.test(said2[0] || ''), said2[0]);
var noGuard = Combat.launchTorpedo(bsys, Gt, t0, 'rocktorp', hk);
check('nor will the panel with the guard down', !noGuard.ok && !(bsys.missiles || []).length, noGuard.why);
Gt.torpCover = true;
var lt = Combat.launchTorpedo(bsys, Gt, t0, 'rocktorp', hk);
check('guard up, LAUNCH: away without a lock', lt.ok && (bsys.missiles || []).filter(function (m) { return m.torp; }).length === 1 &&
      Gt.ship.racks.rocktorp.n === 1);
check('and the guard drops after it - one per lift', !Gt.torpCover && !Combat.launchTorpedo(bsys, Gt, t0, 'rocktorp', hk).ok);
var tt = t0, boomAt = null;
for (var st = 0; st < 400 && !boomAt; st++) {
  Mn.updateTorpedoes(bsys, Gt, tt, 0.1, hk);
  tt += 0.1;
  if (!(bsys.missiles || []).some(function (m) { return m.torp; })) boomAt = tt;
}
var ore = bsys.canisters.filter(function (c) { return c.ore; });
check('it flies dumb and slow and goes off on the rock', !!boomAt && Math.abs((boomAt - t0) - 1.5 / Mn.TORP_SPEED) < 1.0,
      boomAt && ((boomAt - t0).toFixed(1) + ' s for 1.5 km'));
check('6 to 14 chunks thrown', ore.length >= 6 && ore.length <= 14, ore.length + ' chunks, ' + Gt.lastTorpedo.tonnes.toFixed(1) + ' t');
var sp0 = ore.map(function (c) { return V.dist(c.vel, rock.vel) * 1000; });
check('thrown hard - 10 to 40 m/s, a field to chase', Math.min.apply(null, sp0) >= 9.9 && Math.max.apply(null, sp0) <= 40.1,
      Math.min.apply(null, sp0).toFixed(0) + '-' + Math.max.apply(null, sp0).toFixed(0) + ' m/s');
check('the pilot 1.5 km back is outside the blast', Gt.ship.hullHp === Gt.ship.hullMax);
check('a chunk is a chunk the laser could have cut', ore.every(function (c) { return c.kind === 'debris' && c.life === Mn.CHUNK_LIFE; }));

/* The game's order, not the rig's (2026-11-01): the panel launches at G.t
 * and the next update comes with the clock already a frame on. The torpedo
 * was then a frame behind the rocks for its whole flight - 0.87 km at belt
 * speed and 15 fps - and passed through a 240 m rock without going off. */
(function () {
  var saveCan = bsys.canisters, saveMs = bsys.missiles;
  bsys.canisters = []; bsys.missiles = [];
  var Gl = torpRig(rock);
  Gl.torpCover = true;
  var hk2 = { say: function () {}, sound: function () {} };
  Combat.launchTorpedo(bsys, Gl, t0, 'rocktorp', hk2);
  var dtF = 1 / 15, tl = t0, went = null, closest = Infinity;
  for (var k = 0; k < 300 && !went; k++) {
    tl += dtF;                                         // the clock moves first
    Mn.updateTorpedoes(bsys, Gl, tl, dtF, hk2);
    var tpl = (bsys.missiles || []).filter(function (m) { return m.torp; })[0];
    if (!tpl) went = tl;
  }
  check('launched between frames, it still goes off on the rock',
        !!went && Gl.lastTorpedo && Gl.lastTorpedo.chunks >= 6,
        went ? ((went - t0).toFixed(2) + ' s, ' + (Gl.lastTorpedo && Gl.lastTorpedo.chunks) + ' chunks') : 'flew through');
  bsys.canisters = saveCan; bsys.missiles = saveMs;
})();

/* The refund: a safed torpedo (fired at nothing) earns half back; one that
 * paid for itself does not. */
function bareTorp(price, guild) { return { torp: true, id: 'tq' + price + guild, guild: guild, price: price, from: { x: 0, y: 0, z: 0 } }; }
var Gr2 = { here: { id: 'test' }, extracted: {}, ship: Gt.ship, sys: bsys, explosions: [] };
Mn.detonate(bsys, Gr2, t0, bareTorp(2500, true), { at: V.add(rock.pos, { x: 5000, y: 0, z: 0 }), spent: true }, hk);
check('a safed Guild torpedo: half back', Gr2.torpRefund === 1250);
Mn.detonate(bsys, Gr2, t0, bareTorp(1600, false), { at: V.add(rock.pos, { x: 5000, y: 0, z: 0 }), spent: true }, hk);
check('a safed Syndicate one: nothing', Gr2.torpRefund === 1250);
var richRock = { id: 'rich1', kind: 'metal', size: 0.2, pos: rock.pos, vel: rock.vel, key: 'k',
                 source: { kind: 'belt', id: 'rb', name: 'RB', ice: 0.05, metal: 0.8, fields: [1] } };
Mn.detonate(bsys, Gr2, t0, bareTorp(2500, true), { at: rock.pos, rock: richRock, normal: dir }, hk);
check('one that paid for itself: nothing back', Gr2.lastTorpedo.value >= 2500 && Gr2.torpRefund === 1250,
      Gr2.lastTorpedo.value + ' cr of ore');
var cr0 = Gt.ship.credits;
check('the desk pays the log out once', Mn.claimRefund(Gr2) === 1250 && Gt.ship.credits === cr0 + 1250 && Mn.claimRefund(Gr2) === 0);

/* Small rocks do not survive it. */
var pebble = null;
for (var pm = 0; pm < bfield.count && !pebble; pm++) {
  var pr2 = Rg.fieldMember(bfield, pm, bsys, t0, cen, hf);
  if (pr2.size < Mn.TORP_SHATTER) pebble = pr2;
}
if (pebble) {
  pebble.kind = Rg.memberKind(bfield, pebble); pebble.key = 'test:' + bbelt.id; pebble.source = bbelt;
  var Gp = { here: { id: 'test' }, extracted: {}, ship: Gt.ship, sys: bsys, explosions: [] };
  Mn.detonate(bsys, Gp, t0, bareTorp(2500, true), { at: pebble.pos, rock: pebble, normal: dir }, hk);
  var still = Mn.rocksNear(Gp, bsys, pebble.pos, t0, 0.01).filter(function (r) { return r.id === pebble.id; });
  check('a rock under 30 m is gone, and stays gone', Mn.isGone(Gp, pebble) && !still.length,
        (pebble.size * 1000).toFixed(0) + ' m');
}

/* Close enough to the flash, it hurts. */
var Gh = { here: { id: 'test' }, extracted: {}, sys: bsys, explosions: [] };
Gh.ship = Sim.makeShip(V.add(rock.pos, { x: 0.3, y: 0, z: 0 }), rock.vel); Sim.refreshShip(Gh.ship);
Combat.initShip(Gh.ship);
var hp0 = Gh.ship.hullHp;
Combat.blastAt(bsys, Gh, t0, rock.pos, Mn.TORP_BLAST, 140, hk);
check('300 m from the flash: hull, heat and a shove', Gh.ship.hullHp < hp0 && V.dist(Gh.ship.vel, rock.vel) > 0.004,
      (hp0 - Gh.ship.hullHp).toFixed(0) + ' hull');

console.log('--- the command link ---');
var Gd2 = torpRig(rock);
bsys.missiles = []; bsys.canisters = [];
Gd2.torpCover = true; Combat.launchTorpedo(bsys, Gd2, t0, 'rocktorp', hk);
var inFl = Mn.torpedoesInFlight(bsys);
check('one torpedo in flight, listed', inFl.length === 1);
Mn.updateTorpedoes(bsys, Gd2, t0, 1, hk);
var dis = Mn.disarmTorpedo(bsys, Gd2, t0 + 1, inFl[0].id, hk);
check('DISARM takes it out of flight', dis.ok && !Mn.torpedoesInFlight(bsys).length);
var inert = bsys.canisters.filter(function (c) { return c.torpInert; });
check('and leaves it drifting inert', inert.length === 1 && inert[0].torpKind === 'rocktorp');
var hold0b = Gd2.ship.racks.rocktorp.n;
for (var st2 = 0; st2 < 200; st2++) Mn.updateTorpedoes(bsys, Gd2, t0 + 1 + st2 * 0.1, 0.1, hk);
check('a disarmed torpedo never goes off', !bsys.canisters.some(function (c) { return c.ore; }) && Gd2.lastTorpedo === undefined);
check('the scoop puts it back in the rack', Mn.recoverInert(Gd2, inert[0], hk) && Gd2.ship.racks.rocktorp.n === hold0b + 1);
Gd2.torpCover = true; Combat.launchTorpedo(bsys, Gd2, t0 + 30, 'rocktorp', hk);
var second = Mn.torpedoesInFlight(bsys)[0];
var ref0 = Gd2.torpRefund || 0;
var det = Mn.detonateTorpedo(bsys, Gd2, t0 + 31, second.id, hk);
check('DETONATE blows it where it is', det.ok && !Mn.torpedoesInFlight(bsys).length && Gd2.lastTorpedo && Gd2.lastTorpedo.chunks === 0);
check('a commanded safing earns the Guild refund', (Gd2.torpRefund || 0) === ref0 + 1250);
Gd2.torpCover = true; Combat.launchTorpedo(bsys, Gd2, t0 + 40, 'rocktorp', hk);
var far = Mn.torpedoesInFlight(bsys)[0];
far.pos = V.add(Gd2.ship.pos, { x: Mn.TORP_LINK + 50, y: 0, z: 0 });
check('out past the command link it will not answer', !Mn.disarmTorpedo(bsys, Gd2, t0 + 41, far.id, hk).ok &&
      !Mn.detonateTorpedo(bsys, Gd2, t0 + 41, far.id, hk).ok && Mn.torpedoesInFlight(bsys).length === 1);
bsys.missiles = [];

console.log('--- out, never in ---');
var port = tsys.ports[0];
var ps2 = Sim.bodyState(port, tsys, t0);
function shipNearPort(towards) {
  var Gc = { here: { id: 'test' }, sys: tsys, t: t0, wanted: {}, standing: {} };
  var off = { x: 1500, y: 0, z: 0 };
  Gc.ship = Sim.makeShip(V.add(ps2.pos, off), V.add(ps2.vel, { x: towards ? -1 : 1, y: 0, z: 0 }));
  Sim.refreshShip(Gc.ship);
  return Gc;
}
var Go = shipNearPort(false);
Go.ship.racks = { rocktorp: { id: 'rocktorp', n: 3, batch: null } }; Go.ship.missileId = 'rocktorp'; Combat.syncRacks(Go.ship);
check('Guild torpedoes outbound: clear', Combat.torpedoSearch(Go, 'civil', t0, hk, 'Patrol') === null && Go.ship.missiles === 3);
var Gi = shipNearPort(true);
Gi.ship.racks = { rocktorp: { id: 'rocktorp', n: 3, batch: null } }; Gi.ship.missileId = 'rocktorp'; Combat.syncRacks(Gi.ship);
var ri = Combat.torpedoSearch(Gi, 'civil', t0, hk, 'Patrol');
check('inbound to a station: seized and fined', ri && ri.seized === 3 && Gi.ship.missiles === 0 && Gi.wanted.civil === 3 * Combat.TORP_FINE,
      ri && ri.fine + ' cr');
var Gx = shipNearPort(false);
Gx.ship.racks = { syndtorp: { id: 'syndtorp', n: 2, batch: null } }; Gx.ship.missileId = 'syndtorp'; Combat.syncRacks(Gx.ship);
var rx = Combat.torpedoSearch(Gx, 'civil', t0, hk, 'Patrol');
check('an unregistered charge is seized going either way', rx && rx.seized === 2);
var Gk = shipNearPort(false);
Gk.ship.docked = port.id;
Gk.ship.racks = { rocktorp: { id: 'rocktorp', n: 1, batch: null } }; Gk.ship.missileId = 'rocktorp'; Combat.syncRacks(Gk.ship);
check('docked with one is bringing it home', !!Combat.torpedoSearch(Gk, 'civil', t0, hk, 'Berth'));

console.log('--- sabotage ---');
var Gb = { here: { id: 'test' }, sys: tsys, t: t0, wanted: {}, standing: {}, extracted: {}, explosions: [] };
Gb.ship = Sim.makeShip(V.add(ps2.pos, { x: 40, y: 0, z: 0 }), ps2.vel); Sim.refreshShip(Gb.ship);
Mn.detonate(tsys, Gb, t0, bareTorp(2500, true), { at: V.add(ps2.pos, { x: 0.5, y: 0, z: 0 }), port: port }, hk);
var fac = port.faction || 'civil';
var ref = Combat.dockRefusal(Gb, port);
check('a torpedo on a station shuts its berths', ref && ref.why === 'sabotaged', ref && ref.text);
check('and the owners post a bounty', Gb.wanted[fac] >= 30000, Gb.wanted[fac] + ' cr with ' + fac);
check('no refund for a torpedo set off on a station', !Gb.torpRefund);
Gb.t = t0 + (Mn.SABOTAGE_DAYS + 1) * 86400;
check('repaired in ' + Mn.SABOTAGE_DAYS + ' days', !Combat.dockRefusal(Gb, port) || Combat.dockRefusal(Gb, port).why !== 'sabotaged');

/* ---- PIECES, WEAR AND THE CANNON (2026-10-18) -----------------------------
 * Astra: the beam runs continuously and ejects a piece every 2 t; that
 * depletes the store AND takes real pieces off the rock. Decided: real
 * mass, visible craters. And a mining laser cannon: a pulse, 3 s cooldown,
 * fully absorbed by shields, glowing red as it cools. */
console.log('--- pieces off a rock, by its real mass ---');
(function () {
  var Gw = { here: { id: 'test' }, extracted: {}, ship: ship, sys: bsys };
  var r0 = { id: rock.id, kind: hit.rock.kind, size: rock.size, shape: rock.shape, spin: rock.spin,
             pos: rock.pos, vel: rock.vel, key: rock.key, source: rock.source };
  var m0 = Mn.rockMass0(r0), rad = r0.size * 1000;
  check('a rock weighs its density times its volume',
        Math.abs(m0 - Mn.DENSITY[r0.kind] * 0.62 * 4 / 3 * Math.PI * rad * rad * rad) < 1e-6,
        Math.round(m0) + ' t of ' + r0.kind + ', ' + rad.toFixed(0) + ' m');
  bsys.canisters = [];
  var n = 0, got = null;
  while (n < 400 && !got) { var rr = Mn.cut(bsys, Gw, t0, gun, Infinity, hooks); n++; if (rr && rr.shard) got = rr; }
  check('the beam frees a piece of exactly 2 t of rock', !!got && Math.abs(Mn.rockMassLeft(Gw, r0) - (m0 - 2)) < 1e-6,
        got && (m0 - Mn.rockMassLeft(Gw, r0)).toFixed(2) + ' t gone');
  var wr = Gw.rockWear[Mn.rockKey(Gw, r0)];
  check('and leaves a crater where it was cut', wr && wr.c.length === 1 &&
        Math.abs(Math.hypot(wr.c[0][0], wr.c[0][1], wr.c[0][2]) - 1) < 1e-3);
  /* The crater is in the ROCK's frame: turned back into the world at the
   * moment of the cut, it points where the beam met the face. */
  var b = Rg.rockBasis(r0, t0), c = wr.c[0];
  var wdir = V.norm(V.add(V.add(V.scale(b.right, c[0]), V.scale(b.up, c[1])), V.scale(b.fwd, c[2])));
  check('in the rock\'s own frame, so it turns with the rock', V.dot(wdir, hit.normal) > 0.999, V.dot(wdir, hit.normal).toFixed(5));
  if (got.chunk.cid) check('a piece of ore is half to all ore by richness', got.chunk.tonnes >= 1 && got.chunk.tonnes <= 2, got.chunk.tonnes + ' t');
  /* A second piece at the same spot deepens that crater, not a new one. */
  got = null; n = 0;
  while (n < 400 && !got) { var r2 = Mn.cut(bsys, Gw, t0, gun, Infinity, hooks); n++; if (r2 && r2.shard) got = r2; }
  check('cutting the same face deepens the same crater', wr.c.length === 1 && wr.m === 4, wr.c.length + ' craters, ' + wr.m + ' t');

  /* Harder rock, slower beam. */
  var per = function (kind) { return Math.ceil(Mn.PIECE_T / (gun.dmg * Mn.BEAM_T_PER_UNIT * Mn.HARDNESS[kind]) - 1e-9); };
  check('ice cuts faster than stone, stone than metal', per('ice') < per('stone') && per('stone') < per('metal'),
        (per('ice') * gun.cooldown).toFixed(1) + ' / ' + (per('stone') * gun.cooldown).toFixed(1) + ' / ' +
        (per('metal') * gun.cooldown).toFixed(1) + ' s a piece');

  /* A small rock carved to nothing, piece by piece. */
  var Gs = { here: { id: 'test' } };
  var pb = { id: 'pebble-x', kind: 'ice', size: 0.004, shape: 2, spin: 0.37 };
  var pm0 = Mn.rockMass0(pb), pieces = 0, gone = false, lastK = 1, shrinking = true;
  while (!gone && pieces < 1000) {
    var nn = V.norm({ x: Math.sin(pieces * 1.7), y: Math.cos(pieces * 2.3), z: Math.sin(pieces * 0.9) + 0.1 });
    gone = Mn.carve(Gs, pb, nn, 1000 + pieces, Math.min(2, Mn.rockMassLeft(Gs, pb)));
    pieces++;
    var k = Mn.wearScale(Gs, pb);
    if (k > lastK + 1e-12) shrinking = false;
    lastK = k;
  }
  check('a 4 m ice rock (' + Math.round(pm0) + ' t) is gone after its mass in pieces',
        gone && Math.abs(pieces - Math.ceil(pm0 / 2)) <= 1 && Mn.isGone(Gs, pb), pieces + ' pieces');
  check('shrinking the whole way', shrinking);
  check('craters merge rather than pile up', Gs.rockWear[Mn.rockKey(Gs, pb)].c.length <= 24);

  /* The carved mesh. */
  var Gm = { here: { id: 'test' } };
  var big = { id: 'big-x', kind: 'stone', size: 0.006, shape: 3, spin: 0.61 };
  var released = 0;
  global.GLWorld = { releaseMesh: function () { released++; } };
  var nrm = { x: 1, y: 0, z: 0 };
  for (var q = 0; q < 6; q++) Mn.carve(Gm, big, nrm, 50, 2);
  var mesh = Mn.wornMesh(Gm, big), base = Rg.rockMesh(big.shape, big.kind, 2);
  var cw = Gm.rockWear[Mn.rockKey(Gm, big)].c[0];
  var inner = -1, bestDot = -2, far = -1, worstDot = 2;
  for (var vi = 0; vi < base.v.length; vi++) {
    var p = base.v[vi], l = Math.hypot(p[0], p[1], p[2]);
    var d = (p[0] * cw[0] + p[1] * cw[1] + p[2] * cw[2]) / l;
    if (d > bestDot) { bestDot = d; inner = vi; }
    if (d < worstDot) { worstDot = d; far = vi; }
  }
  var len = function (p) { return Math.hypot(p[0], p[1], p[2]); };
  check('the mesh is pressed in at the crater', len(mesh.v[inner]) < len(base.v[inner]) * 0.99,
        (len(mesh.v[inner]) / len(base.v[inner])).toFixed(3));
  check('and untouched on the far side', Math.abs(len(mesh.v[far]) - len(base.v[far])) < 1e-12);
  check('cut faces are fresh rock, a paler colour', mesh.c.some(function (cc, i) { return cc !== base.c[i]; }));
  check('the same mesh until another piece comes off', Mn.wornMesh(Gm, big) === mesh);
  Mn.carve(Gm, big, nrm, 60, 2);
  var mesh2 = Mn.wornMesh(Gm, big);
  check('then rebuilt, and the old one\'s video memory handed back', mesh2 !== mesh && released === 1);
  delete global.GLWorld;

  /* Rock state belongs to its system. */
  var Gk = { here: { id: 'star-a' } }, rk = { id: 'b7:r12:40' };
  Gk.shattered = {}; Gk.shattered[Mn.rockKey(Gk, rk)] = 1;
  check('a rock gone here is gone here', Mn.isGone(Gk, rk));
  Gk.here = { id: 'star-b' };
  check('but its namesake at another star is still there', !Mn.isGone(Gk, rk));
  Gk.shattered = { 'b7:r12:40': 1 };
  check('an old save\'s bare key still counts everywhere', Mn.isGone(Gk, rk));

  var saved = JSON.parse(JSON.stringify(Gs.rockWear));
  check('wear survives the save as plain data', JSON.stringify(saved) === JSON.stringify(Gs.rockWear));
})();

console.log('--- the mining laser cannon ---');
(function () {
  var cn = Combat.GUNS.miningcannon;
  check('it is in the catalogue: a pulse, 3 s between shots', cn && cn.mining && cn.variety === 'pulse' && cn.cooldown === 3);
  var Gc = { here: { id: 'test' }, extracted: {}, ship: ship, sys: bsys };
  bsys.canisters = [];
  var shots = 0, freed = null;
  while (shots < 10 && !freed) { var r = Mn.cut(bsys, Gc, t0, cn, Infinity, hooks); shots++; if (r && r.shard) freed = r; }
  var want = Math.ceil(cn.piece / (cn.pulseTonnes * Mn.HARDNESS[hit.rock.kind]) - 1e-9);
  check('each pulse knocks off what a pulse is worth', !!freed && shots === want, shots + ' pulse(s) on ' + hit.rock.kind);
  var sp = Combat.splitDamage(50, 12, cn);
  check('a shield up takes the whole shot', sp.hull === 0 && sp.shield > 0, JSON.stringify(sp));
  var last = Combat.splitDamage(2, 12, cn);
  check('even the shot that empties it: nothing goes through', last.hull === 0 && last.shield === 2);
  var bare = Combat.splitDamage(0, 12, cn);
  check('a bare hull takes it like a pulse', Math.abs(bare.hull - 12 * cn.vsHull) < 1e-9, bare.hull.toFixed(1));
  var phot = Combat.splitDamage(2, 12, Combat.GUNS.phpulse);
  check('(an ordinary pulse still breaks through)', phot.hull > 0);

  /* The glow, off the same cooldown the trigger obeys. */
  var sh = Sim.makeShip(ship.pos, ship.vel); Sim.refreshShip(sh); Combat.initShip(sh);
  var hk = Combat.slotKeys(sh).filter(function (k) { return Combat.slotType(k) === 'hardpoint'; })[0];
  sh.fit = sh.fit || {}; sh.fit[hk] = 'miningcannon';
  var Gg = { ship: sh, gunCool: {} };
  Gg.gunCool[hk] = 100 + cn.cooldown;
  var at = function (tt) { return Combat.cannonGlow(Gg, tt)[0].k; };
  check('red hot the instant it fires', Math.abs(at(100) - 1) < 1e-9);
  check('half way through, half the glow', Math.abs(at(101.5) - 0.5) < 1e-9);
  check('cold when it can fire again', at(103) === 0 && at(110) === 0);
  check('and nothing glows without a cannon fitted', Combat.cannonGlow({ ship: (function () {
    var s2 = Sim.makeShip(ship.pos, ship.vel); Sim.refreshShip(s2); Combat.initShip(s2); return s2; })(), gunCool: {} }, 0).length === 0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
