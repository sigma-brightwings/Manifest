/* gunnery.test.js — what a gunner on the bridge is for (2026-10-25).
 *
 *     node test/gunnery.test.js
 *
 * Astra: "gunners act as a stat boost on component heating and energy draw
 * requirements or increased damage/probability of hit for the forward
 * facing guns. They also increase missile targeting accuracy." Asked how,
 * she chose: each gunner has a KNACK (cool hand or marksman), the cool
 * hand's lower draw counts at the yard, and seekers can lose a lock that a
 * gunner makes them keep. See crew.js gunnery, combat.js fireOne /
 * fitSummary / fireGroup / updateMissiles.
 */
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
var V = require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
var Crew = require(path.join(SRC, 'crew.js'));

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
/* Seeded Math.random, so the live rolls are the same every run. */
var seed = 12345;
Math.random = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

function makeG(hullId) {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 5000; ship.cargo = {};
  Combat.initShip(ship);
  Sim.refreshShip(ship);
  if (hullId) { ship.hullId = hullId; ship.fit = {}; }
  return { ship: ship, sys: sys, t: 0, keys: {}, panel: 0, wanted: {}, standing: {}, missions: [],
           doneMissions: {}, beams: [], explosions: [], navTarget: null };
}
function gunner(id, rating, knack) { return { id: 'c|' + id, name: id, role: 'gunner', rating: rating, knack: knack }; }
function victim(G, range, opts) {
  opts = opts || {};
  var dir = opts.dir || { x: 1, y: 0, z: 0 };
  var spec = { id: 'v' + Math.random().toFixed(6), kind: 'trader', cls: 'freighter', className: 'freighter',
    name: 'Test Prey', faction: 'testfac', size: 0.12, accel: 0.004, rail: { type: 'lifted' },
    manifest: [{ cid: 'grain', tonnes: 20 }], mode: 'shadow', modeSince: 0,
    live: { pos: V.addScaled(V.clone(G.ship.pos), dir, range), vel: V.add(V.clone(G.ship.vel), opts.vel || { x: 0, y: 0, z: 0 }),
            fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: -1, z: 0 } } };
  spec.live.spec = spec; spec.live.id = spec.id; spec.live.name = spec.name;
  (G.sys.patrols = G.sys.patrols || []).push(spec);
  G.sys._ships = null;
  return spec;
}
var HOOKS = { say: function () {}, sound: function () {} };

console.log('--- the knack ---');
var hall = [];
for (var i = 0; i < 400; i++) hall.push({ id: 'c|port' + i, name: 'x', role: 'gunner', rating: 3 });
var cools = hall.filter(function (p) { return Crew.knackOf(p) === 'cool'; }).length;
check('every gunner has one, about half each way', cools > 150 && cools < 250, cools + ' cool of 400');
check('it is who they are: the same every time', hall.every(function (p) { return Crew.knackOf(p) === Crew.knackOf({ id: p.id, role: 'gunner' }); }));
check('engineers and pilots have none', Crew.knackOf({ id: 'c|e', role: 'engineer' }) === null);
check('the crew card says it', /cool hand|marksman/.test(Crew.describe(hall[0])));

console.log('--- who gives it ---');
var G = makeG();
check('nobody aboard: no change at all', (function () {
  var g = Crew.gunnery(G.ship);
  return g.heatMul === 1 && g.powerMul === 1 && g.dmgMul === 1 && g.coneMul === 1 && g.trackMul === 1;
})());
var Gm = makeG('cutter');
Gm.ship.crew = [gunner('ace', 5, 'marksman'), gunner('cool4', 4, 'cool')];
var g1 = Crew.gunnery(Gm.ship);
check('no turret: both gunners are on the bridge, both knacks count', g1.mark && g1.cool && g1.dmgMul > 1 && g1.heatMul < 1);
Gm.ship.turret = 'turret';
var g2 = Crew.gunnery(Gm.ship);
check('a turret takes the best gunner — the marksman — off the bridge', g2.mounts[0].id === 'c|ace' && !g2.mark && g2.dmgMul === 1 && g2.cool);
check('every gunner, turret or not, steadies the seekers', g2.trackMul > 1 && g2.guide.id === 'c|ace');
check('rated: an exceptional marksman gives the most there is', Math.abs(g1.dmgMul - (1 + Crew.GUNNERY_MAX.dmg)) < 1e-9);
var Gs = makeG('fighter');
Gs.ship.turret = 'turret';
Gs.ship.crew = [gunner('tail', 3, 'cool')];
check('on a small hull the pilot works the turret, so the gunner is all bridge', Crew.gunnery(Gs.ship).cool && !Crew.gunnery(Gs.ship).mounts.length);

console.log('--- the forward guns ---');
function shotHeat(crew) {
  var g = makeG(); g.ship.crew = crew; g.ship.heat = 0; g.gunCool = {};
  Combat.fireGun(g.sys, g, 0, HOOKS);
  return g.ship.heat;
}
var bare = shotHeat([]), cooled = shotHeat([gunner('c5', 5, 'cool')]);
check('a cool hand takes heat off every shot', bare > 0 && Math.abs(cooled / bare - (1 - Crew.GUNNERY_MAX.heat)) < 1e-6,
      bare.toFixed(2) + ' → ' + cooled.toFixed(2));
function dealt(crew, offAxis) {
  var g = makeG(); g.ship.crew = crew; g.gunCool = {};
  var v = victim(g, 5);
  var to = V.norm(V.sub(v.live.pos, g.ship.pos));
  /* Turn the nose off the target by `offAxis` radians about an axis
   * across the line to it. */
  var side = V.norm(V.cross(to, { x: 0, y: 0, z: 1 }));
  g.ship.fwd = V.norm(V.add(V.scale(to, Math.cos(offAxis)), V.scale(side, Math.sin(offAxis))));
  v.hullHp = v.hullMax = 1000; v.shieldHp = 0; v.shieldMax = 0;
  Combat.fireGun(g.sys, g, 0, HOOKS);
  return 1000 - v.hullHp;
}
var straight = dealt([], 0), marked = dealt([gunner('m5', 5, 'marksman')], 0);
check('a marksman makes the same shot hit harder', marked > straight * 1.1, straight.toFixed(1) + ' → ' + marked.toFixed(1));
/* At 5 km the cone is 0.035 rad plus the target's own 80 m (0.016): 0.051
 * bare, 0.079 with an exceptional marksman. */
var off = 0.065;
check('a shot a little off the nose misses bare', dealt([], off) === 0);
check('and connects with a marksman on the console', dealt([gunner('m5', 5, 'marksman')], off) > 0);

console.log('--- power, at the yard and after ---');
var Gp = makeG('cutter');
Gp.ship.fit = {};
var gunId = Object.keys(Combat.EQUIPMENT).filter(function (id) { return Combat.EQUIPMENT[id].kind === 'gun'; })
  .sort(function (a, b) { return Combat.EQUIPMENT[b].power - Combat.EQUIPMENT[a].power; })[0];
var s0 = Combat.fitSummary(Gp.ship);
/* Fill her with the hungriest gun until the yard says no, bare. */
var bareN = 0;
while (Combat.canFit(Gp.ship, gunId).ok) { Gp.ship.fit[Combat.canFit(Gp.ship, gunId).key] = gunId; bareN++; if (bareN > 12) break; }
Gp.ship.crew = [gunner('cool5', 5, 'cool')];
var withCool = Combat.fitSummary(Gp.ship);
check('a cool hand lowers the forward guns\' draw on the yard\'s own count', withCool.powerUsed < Combat.fitSummary({ hullId: 'cutter', fit: Gp.ship.fit }).powerUsed);
var moreN = 0;
while (Combat.canFit(Gp.ship, gunId).ok) { Gp.ship.fit[Combat.canFit(Gp.ship, gunId).key] = gunId; moreN++; if (moreN > 12) break; }
check('so the yard will fit more gun than she carries bare', moreN > 0 || withCool.powerFree > 0,
      bareN + ' bare, +' + moreN + ' with a cool hand (' + gunId + ', slots ' + s0.slotsTotal + ')');
Gp.ship.crew = [];
var paidOff = Combat.fitSummary(Gp.ship);
check('pay the cool hand off and she is over budget', moreN === 0 || paidOff.powerFree < 0, paidOff.powerFree.toFixed(2) + ' MW free');
if (paidOff.powerFree < 0) {
  Gp.gunCool = {};
  Combat.fireGroup(Gp.sys, Gp, 0, 'a', HOOKS);
  var key = Object.keys(Gp.gunCool)[0], cd = Combat.EQUIPMENT[gunId].cooldown;
  check('over budget, the guns cycle slower in proportion', key && Gp.gunCool[key] > cd * 1.0001,
        key ? (Gp.gunCool[key] / cd).toFixed(3) + 'x' : 'no gun fired');
}

console.log('--- the seekers ---');
/* A target crossing at `cross` km/s from 10 km; the target is moved here,
 * the missile by the game's own loop. Returns the fraction that hit. */
function salvo(crew, missileId, cross, n) {
  var hits = 0;
  for (var k = 0; k < n; k++) {
    var g = makeG(); g.ship.crew = crew; g.ship.missileId = missileId;
    g.ship.racks = {}; g.ship.racks[missileId] = { id: missileId, n: 4, batch: null };
    g.ship.missiles = 4; g.ship.missileBatch = null;
    var v = victim(g, 10, { dir: { x: 0, y: 1, z: 0 }, vel: { x: cross, y: 0, z: 0 } });
    v.hullHp = v.hullMax = 1e6;
    g.ship.fwd = { x: 0, y: 1, z: 0 };
    g.navTarget = { kind: 'ship', id: v.id };
    Combat.fireMissile(g.sys, g, 0, HOOKS);
    if (!g.sys.missiles || !g.sys.missiles.length) continue;
    var t = 0, hit = false;
    while (t < 70 && g.sys.missiles.length) {
      v.live.pos = V.addScaled(v.live.pos, v.live.vel, 0.1);
      var hp = v.hullHp;
      Combat.updateMissiles(g.sys, g, t, 0.1, HOOKS);
      if (v.hullHp < hp) { hit = true; break; }
      t += 0.1;
    }
    if (hit) hits++;
  }
  return hits / n;
}
var slow = salvo([], 'hawk', 0.1, 20);
check('a Hawk at a slow crosser hits, gunner or not', slow === 1, Math.round(slow * 100) + '%');
var hawkBare = salvo([], 'hawk', 0.8, 40), hawkGun = salvo([gunner('g5', 5, 'cool')], 'hawk', 0.8, 40);
check('a fast crosser can shake a Hawk\'s seeker', hawkBare < 0.8, Math.round(hawkBare * 100) + '%');
check('and a gunner aboard makes it hold on', hawkGun > hawkBare + 0.2, Math.round(hawkBare * 100) + '% → ' + Math.round(hawkGun * 100) + '%');
var bootBare = salvo([], 'bootleg', 0.5, 40), hawkSame = salvo([], 'hawk', 0.5, 40);
check('a Bootleg gives up sooner than a Hawk, as its catalogue says', bootBare < hawkSame, Math.round(bootBare * 100) + '% vs ' + Math.round(hawkSame * 100) + '%');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
