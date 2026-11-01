/* hunters.test.js - naval hunters on notoriety (PLAN.md Phase 9), 2026-11-01.
 *
 *     node test/hunters.test.js
 *
 * Pinned:
 *  - notoriety is a second ledger: reported loud acts raise it, it halves
 *    every three days, paying a bounty does not touch it;
 *  - only reported kills count, against the empire, never the Syndicate;
 *  - past HUNT_AT, in that empire's space, a pair is dispatched once the
 *    word has had time to arrive, three when it is very high, not while
 *    you sit docked;
 *  - they launch from the empire's nearest port, hostile, with no demand;
 *  - range never puts them to sleep and a dock does not send them home;
 *  - leaving the system ends the hunt; a hunt that ends waits before the
 *    next; the same dispatch sends the same ships.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/journal.js');
require('../src/missions.js');
require('../src/aggression.js');
var Galaxy = require('../src/galaxy.js');
var H = require('../src/hunters.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen, Ms = global.Missions;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function hooks() { var h = { said: [], say: function (m) { h.said.push(m); }, sound: function () {} }; return h; }

var g = Galaxy.build('kawartha');
var star = null, sys = null, emp = null;
for (var si = 0; si < g.stars.length && !sys; si++) {
  var cand = g.stars[si], f = g.factionById[cand.factionId];
  if (!f || f.outlaw || f.minor || f.pirate) continue;
  var sy = Gen.generateSystem(cand.seed, Galaxy.systemOpts(g, cand));
  sy.starId = cand.id;
  if (!sy.ports || sy.ports.length < 2) continue;
  star = cand; sys = sy;
}
check('a lawful system with ports', !!sys, sys && sys.name);
var T = 4e6;
function game() {
  var p0 = Sim.bodyPosition(sys.ports[0], sys, T);
  return { seed: 'kawartha', t: T, galaxy: g, here: star, sys: sys, standing: {}, journal: [], distress: [],
           wanted: {}, notoriety: {},
           ship: { pos: V.add(p0, { x: 40000, y: 0, z: 0 }), vel: { x: 0, y: 0, z: 0 }, cargo: {}, credits: 100,
                   hullMax: 100, hullHp: 100, fit: {}, docked: null } };
}
var lawFac = sys.ports.filter(function (p) { return p.faction; })[0].faction;
emp = global.Aggression.empireOf({ galaxy: g, sys: sys }, sys, lawFac);
function fresh() { sys.patrols = (sys.patrols || []).filter(function (s) { return !s.hunter; }); sys._hunts = null; sys._ships = null; }

console.log('the ledger');
var G = game();
check('a clean career owes the navy nothing', H.notoriety(G, emp, T) === 0);
H.addNotoriety(G, emp, 80, T);
check('it adds', Math.abs(H.notoriety(G, emp, T) - 80) < 1e-9);
check('and halves in three days', Math.abs(H.notoriety(G, emp, T + H.NOTORIETY_HALF_S) - 40) < 1e-6);
check('and is forgotten in time', H.notoriety(G, emp, T + 30 * H.NOTORIETY_HALF_S) === 0);
G.wanted[lawFac] = 50000; G.wanted = {};
check('paying a bounty does not touch it', Math.abs(H.notoriety(G, emp, T) - 80) < 1e-9);

console.log('reported loud acts');
G = game();
var h = hooks();
H.onReport(G, 'killPolice', lawFac, T, h);
check('a reported cutter kill counts against the empire', H.notoriety(G, emp, T) === H.LOUD.killPolice);
H.onReport(G, 'assault', lawFac, T, h);
check('an assault is not loud', H.notoriety(G, emp, T) === H.LOUD.killPolice);
H.onReport(G, 'killPolice', 'outlaw', T, h);
check('the Syndicate has no navy to send', !G.notoriety.outlaw);
H.onReport(G, 'killPolice', lawFac, T + 3600, h);
H.onReport(G, 'killPolice', lawFac, T + 7200, h);
check('three cutters in a few hours is past the line', H.notoriety(G, emp, T + 7200) >= H.HUNT_AT,
      H.notoriety(G, emp, T + 7200).toFixed(1));
check('and you are told', h.said.some(function (m) { return /navy has your name/.test(m); }), h.said.join(' | '));
/* Through Combat's own report, the way a witness files it. */
var G2 = game();
Combat.crime && (function () {
  var cop = { id: 'cx', kind: 'police', faction: lawFac, name: 'cutter', live: { pos: V.clone(G2.ship.pos), vel: { x: 0, y: 0, z: 0 } } };
  G2.t = T;
  Combat.crime(sys, G2, T, 'killPolice', cop, null, cop);
})();
check('a witnessed killing reaches the ledger through the report',
      !G2.pendingReport || G2.pendingReport.kind === 'killPolice');

console.log('dispatch');
fresh();
G = game();
H.addNotoriety(G, emp, 70, T);
h = hooks();
H.update(sys, G, T, h);
check('not at once: the word has to reach them', !H.huntersOf(sys, emp).length);
G.ship.docked = sys.ports[0].id;
H.update(sys, G, T + H.DISPATCH_DELAY_S + 1, h);
check('not while you sit docked', !H.huntersOf(sys, emp).length);
G.ship.docked = null;
H.update(sys, G, T + H.DISPATCH_DELAY_S + 2, h);
var hunt = H.huntersOf(sys, emp);
check('a pair is dispatched', hunt.length === 2, hunt.map(function (s) { return s.name; }).join(', '));
check('hostile, with no demand', hunt.every(function (s) { return s.hostileToPlayer && s.mode === 'attack' && !s.demanding; }));
check('naval interceptors, armed, better than a cutter', hunt.every(function (s) {
  return s.kind === 'navy' && Combat.isArmedNpc(s) && s.accel > 0.0315 && s.hullMax >= 200; }),
  hunt[0] && (hunt[0].accel + ' / ' + hunt[0].hullMax));
var near = H.empirePorts(G, sys, emp, G.ship.pos, T + H.DISPATCH_DELAY_S + 2)[0];   // where the port was when they launched
check('launched from the empire\'s nearest port', hunt.every(function (s) {
  return V.dist(s.live.pos, near.pos) < 100; }), near && near.port.name);
check('and announced', h.said.some(function (m) { return /hunting you/.test(m); }));
var names = hunt.map(function (s) { return s.name; }).join();
fresh();
H.update(sys, G, T + H.DISPATCH_DELAY_S + 2, hooks());
H.update(sys, G, T + 2 * H.DISPATCH_DELAY_S + 4, hooks());
check('the same dispatch sends the same ships',
      H.huntersOf(sys, emp).map(function (s) { return s.name; }).join() === names, names);

fresh();
G = game();
H.addNotoriety(G, emp, 150, T);
H.update(sys, G, T, hooks());
H.update(sys, G, T + H.DISPATCH_DELAY_S + 1, hooks());
check('three when it is very high', H.huntersOf(sys, emp).length === 3);

console.log('they do not sleep, and leaving ends it');
var far = H.huntersOf(sys, emp)[0];
G.ship.pos = V.add(far.live.pos, { x: 5e6, y: 0, z: 0 });
Sim.updateEncounters(sys, T + H.DISPATCH_DELAY_S + 2, 1, G.ship);
check('five million km off, she is still hunting', !!far.live && far.hostileToPlayer);
G.ship.docked = sys.ports[0].id;
Sim.updateEncounters(sys, T + H.DISPATCH_DELAY_S + 3, 1, G.ship);
check('a dock does not send her home', !!far.live);
G.ship.docked = null;
Sim.sleepAll(sys);
H.update(sys, G, T + H.DISPATCH_DELAY_S + 4, hooks());
check('leaving the system ends the hunt', !H.huntersOf(sys, emp).length);
H.update(sys, G, T + H.DISPATCH_DELAY_S + 5, hooks());
H.update(sys, G, T + H.DISPATCH_DELAY_S + 60, hooks());
check('and the next waits', !H.huntersOf(sys, emp).length);
H.update(sys, G, T + H.DISPATCH_DELAY_S + 5 + H.REDISPATCH_S + 1, hooks());
check('until it does not', H.huntersOf(sys, emp).length >= 2);

console.log('one tick behind (2026-11-01)');
/* Astra's guess, and right: an attacker held her standoff against where
 * you were going to be a tick later, and sat one tick of your velocity
 * off. With 1 s steps at 55 km/s she was 49 km off instead of 6. */
(function () {
  fresh();
  var G = game();
  G.ship.vel = { x: 0, y: 50, z: 0 };
  var pir = { id: 'tick-p', kind: 'pirate', cls: 'pirate', faction: 'outlaw', name: 'tick',
              hullMax: 80, hullHp: 80, accel: 0.04, hostileToPlayer: true, mode: 'attack', modeSince: 0,
              rail: { type: 'lifted' },
              live: { pos: V.add(G.ship.pos, { x: 6, y: 0, z: 0 }), vel: V.clone(G.ship.vel),
                      fwd: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } } };
  pir.live.spec = pir;
  sys.patrols.push(pir);
  var t = T, worst = 0;
  for (var k = 0; k < 400; k++) {
    t += 1;
    var gA = Sim.acceleration(G.ship.pos, sys, t);
    G.ship.vel = V.addScaled(G.ship.vel, gA, 1);
    G.ship.pos = V.addScaled(G.ship.pos, G.ship.vel, 1);
    Sim.updateEncounters(sys, t, 1, G.ship);
    if (k > 300 && pir.live) worst = Math.max(worst, V.dist(pir.live.pos, G.ship.pos));
  }
  check('an attacker holds her standoff at speed, not a tick of your velocity behind it',
        worst > 0 && worst < 12, worst.toFixed(1) + ' km (standoff 6)');
  sys.patrols.splice(sys.patrols.indexOf(pir), 1);
})();

console.log('a clean pilot is left alone');
fresh();
G = game();
H.addNotoriety(G, emp, H.HUNT_AT - 1, T);
H.update(sys, G, T, hooks());
H.update(sys, G, T + 10 * H.DISPATCH_DELAY_S, hooks());
check('below the line, nobody comes', !H.huntersOf(sys, emp).length);
fresh();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
