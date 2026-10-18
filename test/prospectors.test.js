/* prospectors.test.js - other prospectors' drones, and stealing from them.
 *
 *     node test/prospectors.test.js
 *
 * What this holds (claude/mining-and-survey.md, "Other prospectors"):
 *   - their drones are DERIVED from the seed: the same every time, nothing
 *     in generate.js, so no fingerprint moves;
 *   - a hopper is a pure function of the clock: it fills at the drone rate
 *     and the owner empties it on a schedule;
 *   - N beside one takes the hopper, tagged HOT; SHIFT+N takes the drone;
 *   - the owner reports it when they next come round, not before;
 *   - hot ore: a scan seizes only the hot tonnes; a fence buys a drone.
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
function sysOf(i) { return Gen.generateSystem(gal.stars[i].seed, optsFor(gal.stars[i])); }

console.log('--- census ---');
var N = Math.min(60, gal.stars.length), withAny = 0, total = 0, worlds = 0, claimed = 0, pick = null;
for (var i = 0; i < N; i++) {
  var s = sysOf(i);
  var G0 = { here: { id: gal.stars[i].id || ('s' + i) } };
  var list = Cl.npcDrones(G0, s);
  var keys = {};
  list.forEach(function (d) { keys[d.key] = 1; });
  s.bodies.forEach(function (b) { if (b.kind === 'planet' || b.kind === 'moon') worlds++; });
  claimed += Object.keys(keys).length;
  total += list.length;
  if (list.length) withAny++;
  if (!pick && list.length) pick = { i: i, sys: s, star: G0.here.id };
}
console.log('  ' + withAny + '/' + N + ' systems have prospectors; ' + claimed + ' of ' + worlds +
            ' worlds claimed; ' + total + ' drones');
check('prospectors in most systems with ports, not every world', withAny >= N * 0.4 && claimed < worlds * 0.2,
      withAny + ' systems, ' + (100 * claimed / worlds).toFixed(0) + '% of worlds');
check('found a system to rob', !!pick);

var again = Cl.npcDrones({ here: { id: pick.star } }, sysOf(pick.i));
var first = Cl.npcDrones({ here: { id: pick.star } }, pick.sys);
check('the same seed gives the same drones', JSON.stringify(again) === JSON.stringify(first), first.length + ' drones');

var sys = pick.sys, d = first[0], world = sys.byId[d.body];
var G = { here: { id: pick.star }, sys: sys, t: 0, surveys: {}, claims: {}, drones: [], extracted: {}, wanted: {} };

console.log('--- the hopper ---');
var svc = Cl.npcLastService(d, 400 * DAY);
var rate = Cl.DRONE_RATE * d.grade;
var h1 = Cl.npcHopper(G, d, svc + 1);
check('empty just after the owner has been', h1.tonnes < 0.01, h1.tonnes.toFixed(4) + ' t');
var h2 = Cl.npcHopper(G, d, svc + 10 * DAY);
check('fills at the drone rate', Math.abs(h2.tonnes - Math.min(Cl.HOPPER, rate * 10)) < 1e-6,
      h2.tonnes.toFixed(3) + ' t in 10 days (' + d.cid + ', grade ' + d.grade.toFixed(2) + ')');
var nxt = Cl.npcNextService(d, svc + 1);
check('and the owner empties it on schedule', Cl.npcHopper(G, d, nxt + 60).tonnes < 0.01 &&
      Math.abs(nxt - svc - d.period) < 1e-6, 'every ' + (d.period / DAY).toFixed(1) + ' days');

console.log('--- taking it ---');
var t = svc + 0.8 * d.period;
G.t = t;
var gp = Cl.groundPos(sys, d, t);
var hs = Sim.bodyState(world, sys, t);
var ship = Sim.makeShip(V.add(gp, V.scale(V.norm(V.sub(gp, hs.pos)), 0.004)), hs.vel);
Sim.refreshShip(ship);
ship.credits = 1000; ship.cargoCap = 200;
ship.landed = true; ship.crashed = false; ship.landedAt = Sim.landSpot(world, sys, t, ship.pos);
G.ship = ship;
var before = Cl.npcHopper(G, d, t).tonnes;
var r = Cl.act(G, sys, t);
var got = ship.cargo[d.cid] || 0;
check('N beside their drone takes the hopper', r.ok && got === Math.floor(before), r.text || r.why);
check('and it is hot', Cl.hotOf(G, d.cid) === got);
check('their hopper keeps the fraction left', Cl.npcHopper(G, d, t + 1).tonnes < 1);
check('the theft is logged, not yet reported', G.thefts.length === 1 && !G.thefts[0].reported &&
      G.thefts[0].reportAt >= Cl.npcNextService(d, t), 'report due in ' + ((G.thefts[0].reportAt - t) / DAY).toFixed(1) + ' days');
Cl.tickThefts(G, t + 60);
check('nothing reported before the owner comes', !G.wanted[d.fac]);
var said = [];
Cl.tickThefts(G, G.thefts[0].reportAt + 1, { say: function (m) { said.push(m); } });
check('the owner comes round and reports it', G.wanted[d.fac] >= Cl.THEFT_BOUNTY && said.length === 1, said[0]);

Sim.updateLandedShip(ship, sys, t + 120);
var r2 = Cl.recover(G, sys, t + 120);
check('SHIFT+N takes the drone itself', r2.ok && ship.drones === 1 && ship.hotDrones === 1, r2.text || r2.why);
check('and it is gone from the register', Cl.npcOn(G, sys, d.key, t + 200).indexOf(d) < 0 &&
      Cl.npcOn(G, sys, d.key, t - 200).indexOf(d) >= 0, 'still there before you took it');

console.log('--- hot goods ---');
ship.cargo[d.cid] = got + 5;
check('clean tonnes are not hot', Cl.hotOf(G, d.cid) === got);
ship.cargo[d.cid] = 2;
check('hot never exceeds what is held', Cl.hotOf(G, d.cid) === 2);
ship.cargo[d.cid] = 7; G.ship.hot[d.cid] = 2; Cl.spendHot(G, d.cid, 2);
check('a fenced tonne leaves the tag', Cl.hotOf(G, d.cid) === 0);
var fence = { name: 'Back Room', market: { blackMarket: true, role: 'trade' } };
var guild = { name: 'Guild Hall', market: { blackMarket: true, role: 'mining' } };
check('a fence is a back room that is not a Guild hall', Cl.isFence(fence) && !Cl.isFence(guild) &&
      !Cl.isFence({ market: { role: 'trade' } }));
var c0 = ship.credits, fd = Cl.fenceDrone(G, sys, fence);
check('a fence buys a stolen drone', fd.ok && ship.credits - c0 === Cl.fenceDronePrice(sys) && ship.hotDrones === 0 && ship.drones === 0,
      fd.paid + ' cr');
check('a Syndicate hold pays more', Cl.fenceDronePrice({ pirateHeld: true }) > Cl.fenceDronePrice({}) &&
      Cl.FENCE_ORE_SYND > Cl.FENCE_ORE);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
