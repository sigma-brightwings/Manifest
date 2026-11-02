/* massdriver.test.js - the mass driver (2026-11-02).
 *
 *     node test/massdriver.test.js
 *
 * Pinned:
 *  - Astra's ruling: half a slug's damage to the shield (the coils' static
 *    charge), half to the hull whatever the shield's state; charge the
 *    shield could not hold goes through too;
 *  - a shot spends a round of cargo and kicks the ship back down the nose
 *    by the slug's momentum over her mass; dry, it refuses and says why;
 *  - a slug TRAVELS: nothing is hit the instant it is fired, and it lands
 *    when its flight time says;
 *  - fired between frames it still hits (the one-tick rule);
 *  - the lead pip's point, fired at, hits a crossing target, where aiming
 *    at the target itself misses;
 *  - slugs are bought a tonne at a time, with reasons for every refusal.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
var MD = require('../src/massdriver.js');
var Galaxy = require('../src/galaxy.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
var quiet = { say: function () {}, sound: function () {} };

console.log('--- the split ---');
var gun = Combat.GUNS.massdriver;
check('the mass driver is in the catalogue, kinetic, split half and half',
      !!gun && gun.kinetic && gun.split === 0.5 && gun.speed > 0, gun && gun.name);
var full = Combat.splitDamage(40, 30, gun);
check('against a full shield: half to the shield, half to the hull',
      Math.abs(full.shield - 15) < 1e-9 && Math.abs(full.hull - 15) < 1e-9, JSON.stringify(full));
var none = Combat.splitDamage(0, 30, gun);
check('with no shield up, all of it to the hull', Math.abs(none.hull - 30) < 1e-9 && none.shield === 0);
var thin = Combat.splitDamage(5, 30, gun);
check('a shield with 5 left holds 5 of the charge; the rest goes through with the slug',
      Math.abs(thin.shield - 5) < 1e-9 && Math.abs(thin.hull - 25) < 1e-9, JSON.stringify(thin));
var pulse = Combat.splitDamage(40, 30, Combat.GUNS.phpulse);
check('a laser is unchanged (a full shield takes a pulse whole)', pulse.hull === 0, JSON.stringify(pulse));

/* A system and a ship in it, far from anything. */
var g = Galaxy.build('kawartha');
var star = g.stars[0];
var sys = Gen.generateSystem(star.seed, Galaxy.systemOpts(g, star));
var T = 3e6;
var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
function game() {
  var ship = Sim.circularOrbit(planet, sys, T, planet.radius * 3, 0.1, 0);
  ship.credits = 20000; ship.cargo = {};
  Combat.initShip(ship); ship.hullId = 'kestrel';
  Sim.refreshShip(ship);
  ship.fwd = V.norm(V.cross(ship.vel, { x: 0, y: 0, z: 1 }));
  ship.right = V.norm(V.cross(ship.fwd, { x: 0, y: 0, z: 1 }));
  ship.up = V.cross(ship.right, ship.fwd);
  return { ship: ship, sys: sys, t: T, galaxy: g, here: star, standing: {}, wanted: {}, explosions: [] };
}
function target(G, along, side, velRel) {
  var spec = { id: 'md-' + Math.random().toString(36).slice(2, 7), kind: 'pirate', cls: 'pirate', faction: 'outlaw',
               name: 'target', size: 0.06, hullMax: 400, hullHp: 400, rail: { type: 'lifted' } };
  spec.live = { pos: V.add(V.addScaled(G.ship.pos, G.ship.fwd, along), V.scale(G.ship.right, side || 0)),
                vel: V.add(G.ship.vel, velRel || { x: 0, y: 0, z: 0 }), spec: spec, size: 0.06 };
  sys.patrols = (sys.patrols || []).filter(function (s) { return s.id.indexOf('md-') !== 0; });
  sys.patrols.push(spec); sys._ships = null;
  return spec;
}
/* Step the world the game's way: the clock moves, then everything flies.
 * The target coasts on its own velocity (it is a hand-made live body). */
function step(G, dt, spec) {
  G.t += dt;
  if (spec && spec.live) spec.live.pos = V.addScaled(spec.live.pos, spec.live.vel, dt);
  G.ship.pos = V.addScaled(G.ship.pos, G.ship.vel, dt);
  sys._ships = null;
  MD.update(sys, G, G.t, dt, quiet);
}

console.log('--- firing ---');
var G = game();
var r0 = MD.fire(sys, G, G.t, gun, V.clone(G.ship.pos), quiet);
check('dry, it will not fire', r0 === null);
G.ship.cargo.slugs = 1;
var v0 = V.clone(G.ship.vel);
var sl = MD.fire(sys, G, G.t, gun, V.clone(G.ship.pos), quiet);
check('a round leaves', !!sl && Math.abs((G.ship.cargo.slugs || 0) - (1 - MD.SLUG_T)) < 1e-9,
      (G.ship.cargo.slugs || 0).toFixed(3) + ' t left');
var kick = V.dot(V.sub(G.ship.vel, v0), G.ship.fwd);
var want = -(MD.SLUG_T * gun.speed) / G.ship.mass;
check('and kicks the ship back down the nose by its momentum', Math.abs(kick - want) < 1e-12,
      (kick * 1000).toFixed(2) + ' m/s on ' + G.ship.mass.toFixed(0) + ' t');
check('the slug leaves at the ship\'s velocity plus its own', Math.abs(V.len(V.sub(sl.vel, v0)) - gun.speed) < 1e-9);

console.log('--- it travels ---');
sys.slugs = [];
G = game(); G.ship.cargo.slugs = 1;
var tg = target(G, 8, 0);
var hp0 = tg.hullHp;
MD.fire(sys, G, G.t, gun, V.addScaled(G.ship.pos, G.ship.fwd, 0.02), quiet);
step(G, 0.1, tg);
check('a tenth of a second out, nothing has been hit', tg.hullHp === hp0 && sys.slugs.length === 1);
var hitAt = null, t0 = G.t - 0.1;
for (var k = 0; k < 40 && hitAt === null; k++) { step(G, 0.1, tg); if (tg.hullHp < hp0) hitAt = G.t - t0; }
check('it lands when 8 km at 8 km/s says it should', hitAt !== null && Math.abs(hitAt - 1.0) < 0.15,
      hitAt === null ? 'never' : hitAt.toFixed(2) + ' s');
check('and the hull took its half at least', hp0 - tg.hullHp >= gun.dmg * 0.5 - 1e-9, (hp0 - tg.hullHp).toFixed(1));
check('and the slug is spent', !sys.slugs.length);

console.log('--- fired between frames ---');
/* The game fires inside a frame whose clock has already moved, and the
 * next update comes a frame later. A slug that did not know what time its
 * position was for would be tested a frame behind the ships — exactly how
 * the torpedoes missed every rock. */
sys.slugs = [];
G = game(); G.ship.cargo.slugs = 1;
var muz = V.addScaled(G.ship.pos, G.ship.fwd, 0.02);
var sl2 = MD.fire(sys, G, G.t, gun, muz, quiet);
var dtF = 1 / 15;
MD.update(sys, G, G.t + dtF, dtF, quiet);
var expect = V.addScaled(muz, sl2.vel, 2 * dtF);
check('the first update coasts the gap before it tests (gravity aside)', V.dist(sl2.pos, expect) < 1e-4,
      (V.dist(sl2.pos, expect) * 1000).toFixed(3) + ' m off');

console.log('--- leading a crossing target ---');
function crossing(aimAtLead) {
  sys.slugs = [];
  var Gx = game(); Gx.ship.cargo.slugs = 1;
  var t1 = target(Gx, 10, 0, V.scale(Gx.ship.right, 0.6));          // 600 m/s across
  var h0 = t1.hullHp;
  var aim = aimAtLead ? MD.lead(Gx.ship.pos, Gx.ship.vel, t1.live.pos, t1.live.vel, gun.speed).point : t1.live.pos;
  Gx.ship.fwd = V.norm(V.sub(aim, Gx.ship.pos));
  MD.fire(sys, Gx, Gx.t, gun, V.clone(Gx.ship.pos), quiet);
  for (var j = 0; j < 40 && t1.hullHp === h0; j++) step(Gx, 0.05, t1);
  return t1.hullHp < h0;
}
check('aimed at the target itself, a crossing ship is missed', !crossing(false));
check('aimed at the lead pip, it is hit', crossing(true));
check('no intercept when they outrun the slug',
      MD.lead({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }, 8) === null);

console.log('--- buying slugs ---');
G = game();
var nb = MD.buySlugs(G, 1);
check('no driver, no slugs: and it says so', !nb.ok && /no mass driver/.test(nb.why), nb.why);
G.ship.fit = null; Combat.initShip(G.ship);
var cf = Combat.canFit(G.ship, 'massdriver');
Combat.fitItem(G.ship, 'massdriver');
check('it fits a hardpoint', cf.ok, cf.why);
var b1 = MD.buySlugs(G, 1);
check('a tonne is forty rounds', b1.ok && MD.roundsAboard(G.ship) === 40, JSON.stringify(b1));
G.ship.credits = 10;
var b2 = MD.buySlugs(G, 1);
check('and a refusal names the money', !b2.ok && /credits/.test(b2.why), b2.why);
G.ship.credits = 1e6; G.ship.cargo.ballast = G.ship.cargoCap;
var b3 = MD.buySlugs(G, 1);
check('or the hold', !b3.ok && /room/.test(b3.why), b3.why);

console.log('--- Syndicate and navy only ---');
/* Astra: "mass drivers are a syndicate/navy only weapon." */
function shelf(G2, port) {
  return Combat.stockAt(G2, port).filter(function (e) { return e.item.id === 'massdriver'; })[0];
}
G = game();
var lawful = sys.ports.filter(function (p) { return p.faction && p.faction !== 'outlaw' && p.market && p.market.role !== 'carrier' && p.market.role !== 'shipyard'; })[0];
check('an ordinary lawful port does not stock it at all', lawful && !shelf(G, lawful), lawful && lawful.name);
var carrier = { id: 'md-carrier', name: 'Test carrier', faction: lawful.faction, fleet: true, market: { role: 'carrier', dev: 0.2 } };
var cs = shelf(G, carrier);
check('a fleet carrier has it on the shelf', !!cs);
check('but not for a stranger, and says why', cs && !cs.available && /navy issue/.test(cs.why), cs && cs.why);
G.standing[lawful.faction] = 60;
check('to someone the navy trusts, it sells', shelf(G, carrier).available);
var synPort = { id: 'md-syn', name: 'Test den', faction: 'outlaw', market: { role: 'orbital', dev: 0.3 } };
var ss = shelf(G, synPort);
check('on the Syndicate\'s turf it is stocked, behind their trust', ss && !ss.available && /Syndicate/.test(ss.why), ss && ss.why);

console.log('--- in their hands ---');
check('the navy and the Syndicate\'s enforcers carry one; a pirate and a cutter do not',
      Combat.carriesDriver({ kind: 'navy' }) && Combat.carriesDriver({ kind: 'police', faction: 'outlaw' }) &&
      Combat.carriesDriver({ kind: 'police', hunter: true }) &&
      !Combat.carriesDriver({ kind: 'pirate' }) && !Combat.carriesDriver({ kind: 'police', faction: 'gf0' }));
check('and a scan says so', /mass driver/.test(Combat.npcArmament({ kind: 'navy', cls: 'navy', faction: 'gf0', hullMax: 200 }).text),
      Combat.npcArmament({ kind: 'navy', cls: 'navy', faction: 'gf0', hullMax: 200 }).text);
function npcShot(jink) {
  sys.slugs = [];
  var Gn = game();
  var nv = target(Gn, 9, 0);
  nv.kind = 'navy'; nv.faction = lawful.faction;
  nv.live.fwd = V.scale(Gn.ship.fwd, -1);
  var hull0 = Gn.ship.hullHp, sh0 = Gn.ship.shieldHp || 0;
  var real = Math.random; Math.random = function () { return 0.5; };   // dead on: no spread
  try { MD.fireNpc(sys, Gn, Gn.t, nv, Combat.NPC_DRIVER, quiet); } finally { Math.random = real; }
  if (jink) Gn.ship.vel = V.addScaled(Gn.ship.vel, Gn.ship.right, 0.15);   // 150 m/s sideways, after the shot
  for (var j = 0; j < 40; j++) step(Gn, 0.05, nv);
  return Gn.ship.hullHp < hull0 || (Gn.ship.shieldHp || 0) < sh0;
}
check('their slug finds a ship that holds its course', npcShot(false));
check('and misses one that jinks after the shot', !npcShot(true));

sys.patrols = (sys.patrols || []).filter(function (s) { return s.id.indexOf('md-') !== 0; });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
