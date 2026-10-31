/* rumours.test.js — step 5: what people say about you, at the speed of ships.
 *
 * Run: node test/rumours.test.js
 */
'use strict';

var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
var V = require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
var RNG = require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'crew.js'));
require(path.join(SRC, 'fleet.js'));
require(path.join(SRC, 'missions.js'));
require(path.join(SRC, 'shiptrade.js'));
var Cap = require(path.join(SRC, 'captains.js'));
require(path.join(SRC, 'messages.js'));
var Fav = require(path.join(SRC, 'favours.js'));
var Rum = require(path.join(SRC, 'rumours.js'));
var Save = require(path.join(SRC, 'save.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }
var DAY = 86400;

var SEED = 'kawartha';
var galaxy = Galaxy.build(SEED);
var sysCache = {};
function systemFor(star) {
  if (!sysCache[star.id]) {
    sysCache[star.id] = Gen.generateSystem(star.seed,
      { faction: galaxy.factionById[star.factionId], allFactions: galaxy.factions });
    sysCache[star.id].starId = star.id;
  }
  return sysCache[star.id];
}
function busyStar() {
  for (var i = 0; i < galaxy.stars.length && i < 60; i++) {
    var sys = systemFor(galaxy.stars[i]);
    if ((sys.traffic || []).length >= 20) return galaxy.stars[i];
  }
  return galaxy.home;
}
var STAR = busyStar();
function makeG(star) {
  star = star || STAR;
  var sys = systemFor(star);
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 5000; ship.cargo = {};
  Combat.initShip(ship);
  Sim.refreshShip(ship);
  ship.shipName = 'Brightwing'; ship.bornId = 'hull-A';
  return { seed: SEED, ship: ship, sys: sys, t: 0, galaxy: galaxy, here: star,
           standing: {}, wanted: {}, missions: [], doneMissions: {}, captains: {}, fleet: [],
           rumours: [], hearsay: [] };
}
function trader(G, i) { return Sim.trafficState(G.sys.traffic[i], G.sys, G.t); }

/* ---- the timetable ---------------------------------------------------------- */
section('berthing times match the timetable');
(function () {
  var sys = systemFor(STAR), bad = 0, n = 0;
  for (var i = 0; i < 25; i++) {
    var r = sys.traffic[i];
    [r.from, r.to].forEach(function (X) {
      for (var k = 0; k < 6; k++) {
        /* Off the exact half-period. A route's period is 2 x (cruise +
         * layover), so she casts off from her far port at exactly t0 +
         * (n + 0.5) periods - and these samples land there whenever
         * 0.37k + 0.11i comes out at a half (k 5, i 15; k 2, i 16). At
         * that instant "berthed" and "gone" differ by a rounding error,
         * which is not what this checks. Found 2026-10-31, when every
         * port took a reactor's fissiles and the timetables moved. */
        var t = r.t0 + (k * 0.37 + i * 0.11 + 0.013) * r.period;
        var bt = Rum.berthTime(r, X, t, sys);
        var st = Sim.trafficState(r, sys, bt + 1);
        n++;
        if (bt < t || st.phase !== 'moored' || !st.to || st.to.id !== X) bad++;
        if (bt > t + 2) {
          var before = Sim.trafficState(r, sys, bt - 2);
          if (before.phase === 'moored' && before.to && before.to.id === X) bad++;
        }
      }
    });
  }
  check('every computed berth is a real one, and the first (' + n + ')', bad === 0, bad + ' wrong');
})();

/* ---- spreading through one system ------------------------------------------ */
section('one system');
(function () {
  var G = makeG(), sys = G.sys;
  var t0 = 5000;
  G.t = t0;
  /* Robbed in flight, so the news has to wait for her to berth. (Robbed
   * on a clamp, the port hears at once — it is standing right there.) */
  var victim = null;
  for (var vi = 0; vi < sys.traffic.length && !victim; vi++) {
    var cand = trader(G, vi);
    if (cand.phase !== 'moored') victim = cand;
  }
  var prop = Rum.propagate(sys, Rum.nodeOf(victim), t0);
  var net = Rum.netOf(sys);
  var portsHeard = Object.keys(prop).filter(function (n) { return n.charAt(0) === 'P'; });
  var shipsHeard = Object.keys(prop).filter(function (n) { return n.charAt(0) !== 'P'; });
  check('it reaches every port in the end', portsHeard.length === Object.keys(net.ports).length,
        portsHeard.length + '/' + Object.keys(net.ports).length);
  check('and most ships', shipsHeard.length >= Object.keys(net.ships).length * 0.8,
        shipsHeard.length + '/' + Object.keys(net.ships).length);
  var causal = true;
  shipsHeard.forEach(function (n) {
    var e = prop[n];
    if (e.t < t0) causal = false;
    if (e.via && (!prop['P:' + e.via] || prop['P:' + e.via].t > e.t)) causal = false;
  });
  check('nobody hears before the port they heard it at did', causal);
  var first = Math.min.apply(null, portsHeard.map(function (n) { return prop[n].t; }));
  check('the first port hears it when she berths, not at once', first > t0, ((first - t0) / 3600).toFixed(1) + ' h');
  var times = shipsHeard.map(function (n) { return prop[n].t - t0; }).sort(function (a, b) { return a - b; });
  check('and the system as a whole takes days', times[Math.floor(times.length / 2)] > 0.5 * DAY,
        'median ' + (times[Math.floor(times.length / 2)] / DAY).toFixed(1) + ' d');
})();

section('a stranger hears it when it reaches her');
(function () {
  var G = makeG(), sys = G.sys;
  G.t = 5000;
  var victim = trader(G, 3);
  var R = Rum.spawn(G, sys, 'piracy', victim, G.t, { n: 1 });
  check('robbing her starts a rumour aboard her ship', R && R.origin === Rum.nodeOf(victim) && /the /.test(R.v), R && R.v);
  var prop = Rum.propagate(sys, R.origin, R.t);
  /* A lawful stranger on another lane, who hears it late. */
  var stranger = null, when = 0;
  for (var i = 0; i < sys.traffic.length; i++) {
    var c = trader(G, i), p = Cap.profile(G, sys, c);
    var e = prop[Rum.nodeOf(c)];
    if (p && p.values === 'lawful' && c.route !== victim.route && e && e.t - R.t > 3600) {
      stranger = c; when = e.t; break;
    }
  }
  check('found a lawful stranger who hears it late', !!stranger);
  if (!stranger) return;
  G.t = when - 60;
  var before = Cap.opinion(G, sys, stranger);
  check('before it reaches her, she has heard nothing', before.band === 'neutral' || before.band === 'warm' ||
        before.band === 'cold' && !before.reason, before.band + ' ' + JSON.stringify(before.reason && before.reason.kind));
  var bTally = Rum.tally(G, sys, stranger, G.t, 'self');
  check('…and her tally is empty', !bTally.counts.piracy);
  G.t = when + 60;
  var after = Cap.opinion(G, sys, stranger);
  check('after, she thinks less of you', after.score < before.score, before.score.toFixed(2) + ' -> ' + after.score.toFixed(2));
  check('…for that reason', after.reason && after.reason.kind === 'piracy' && after.reason.rumour);
  /* Enough of it to make her say so. */
  for (var k = 0; k < 3; k++) Rum.spawn(G, sys, 'piracy', trader(G, 3 + k * 2), 5000 + k * 7200, { n: 1 });
  G.t = when + 30 * DAY;
  var g = Cap.greeting(G, sys, stranger, G.t);
  check('she says where she heard it', g && /they say you robbed|took off|gunpoint/.test(g.text), g && g.text);
})();

section('nobody saw it');
(function () {
  var G = makeG(), sys = G.sys;
  var ghost = { route: { id: 'zz', dead: true, name: 'Nobody' }, pos: { x: 1e15, y: 1e15, z: 1e15 } };
  G.ship.pos = { x: 1e15, y: 1e15, z: 1e15 };
  check('a kill with no witness starts no rumour', Rum.spawn(G, sys, 'kills', ghost, 100, null) === null);
  check('…and the record still counts it (the truth is not the talk)', (function () {
    Cap.bumpRecord(G, 'kills', 1, { sys: sys, ship: ghost, t: 100 });
    return Cap.recordOf(G, 'self').kills === 1 && G.rumours.length === 0;
  })());
})();

section('dead ships tell no tales');
(function () {
  var G = makeG(), sys = G.sys;
  G.t = 5000;
  var victim = null;
  for (var i = 0; i < sys.traffic.length && !victim; i++) {
    var c = trader(G, i);
    if (c.phase !== 'moored') victim = c;
  }
  var R = Rum.spawn(G, sys, 'piracy', victim, G.t, null);
  var reach = Object.keys(R.stars).length;
  /* She is destroyed a minute later, before she berths anywhere. */
  victim.route.dead = true; victim.route.diedAt = G.t + 60;
  sys._rumourGen = (sys._rumourGen || 0) + 1;
  Rum.onDeath(G, sys, G.t + 60);
  var prop = Rum.propagate(sys, R.origin, R.t);
  var ports = Object.keys(prop).filter(function (n) { return n.charAt(0) === 'P'; });
  check('robbed, then killed before she berths: no port ever hears it', ports.length === 0, ports.length);
  check('…and no other star', !Object.keys(R.stars).some(function (id) { return id !== R.star && R.stars[id].t < Infinity; }),
        reach + ' -> ' + Object.keys(R.stars).length);
  victim.route.dead = false; victim.route.diedAt = null;
  sys._rumourGen++;
})();

section('between stars');
(function () {
  var G = makeG(), sys = G.sys;
  G.t = 1000;
  var R = Rum.spawn(G, sys, 'piracy', trader(G, 0), G.t, null);
  var ids = Object.keys(R.stars);
  check('it travels to other stars', ids.length > 1, ids.length);
  check('…but not everywhere', ids.length < galaxy.stars.length, ids.length + '/' + galaxy.stars.length);
  var maxHops = Math.max.apply(null, ids.map(function (id) { return R.stars[id].hops; }));
  check('…at most ' + Rum.MAX_HOPS + ' hops', maxHops <= Rum.MAX_HOPS);
  var slow = true, faint = true;
  ids.forEach(function (id) {
    var e = R.stars[id];
    if (!e.hops) return;
    var d = Galaxy.distance3(galaxy.byId[R.star], galaxy.byId[id]);
    if (e.t - R.stars[R.star].t < d * Galaxy.HOURS_PER_LY * 3600 * 0.999) slow = false;
    if (Math.abs(e.s - Math.pow(Rum.HOP_FADE, e.hops)) > 1e-9) faint = false;
  });
  check('no faster than a ship could fly it', slow);
  check('fainter at every hop', faint);

  /* In the next system over. */
  var nb = ids.filter(function (id) { return R.stars[id].hops === 1; })[0];
  var star2 = galaxy.byId[nb];
  var G2 = makeG(star2); G2.rumours = G.rumours;
  var sys2 = G2.sys;
  var arrive = R.stars[nb].t;
  var prop2 = Rum.propagate(sys2, 'P:' + Rum.netOf(sys2).hub, arrive);
  var c2 = null, e2 = null;
  for (var i = 0; i < sys2.traffic.length && !c2; i++) {
    var c = Sim.trafficState(sys2.traffic[i], sys2, 0), e = prop2[Rum.nodeOf(c)];
    if (e) { c2 = c; e2 = e; }
  }
  G2.t = arrive - 1;
  check('over there, nobody knows before the news arrives', !Rum.tally(G2, sys2, c2, G2.t, 'self').counts.piracy);
  G2.t = e2.t + 1;
  var tl = Rum.tally(G2, sys2, c2, G2.t, 'self');
  check('…and then they do, more faintly', tl.counts.piracy > 0 && tl.counts.piracy < 1, tl.counts.piracy);
  var line = Rum.lineFor(G2, sys2, tl.top.piracy, 'x');
  check('…and say where it came from', line && line.indexOf(R.starName) >= 0, line);
})();

section('it sticks to who you were flying as');
(function () {
  var G = makeG(), sys = G.sys;
  G.t = 1000;
  Rum.spawn(G, sys, 'piracy', trader(G, 0), G.t, null);
  var c = trader(G, 0);
  G.t = 1000 + 400 * DAY;
  check('the real you is talked about', Rum.tally(G, sys, c, G.t, 'self').counts.piracy > 0);
  check('a fresh transponder is not', !Rum.tally(G, sys, c, G.t, 'x:ZZ-0001').counts.piracy);
})();

section('it fades');
(function () {
  var R = { n: 1, t: 0, star: 's', stars: { s: { t: 0, s: 1 } } };
  check('half as loud after the half-life', Math.abs(Rum.weightOf(R, 's', Rum.HALF_LIFE) - 0.5) < 1e-9);
  check('and nothing where it never reached', Rum.weightOf(R, 'elsewhere', 0) === 0);
})();

section('the same deed is one rumour');
(function () {
  var G = makeG(), v = trader(G, 2);
  Rum.spawn(G, G.sys, 'piracy', v, 100, null);
  Rum.spawn(G, G.sys, 'piracy', v, 160, null);
  check('two hits a minute apart merge', G.rumours.length === 1 && G.rumours[0].n === 2);
})();

section('a friend hears it when it reaches her');
(function () {
  var G = makeG(), sys = G.sys, c = null, p = null;
  for (var i = 0; i < sys.traffic.length; i++) {
    var t = trader(G, i), q = Cap.profile(G, sys, t);
    if (q && q.friend && /\/r\d+$/.test(q.friend)) { c = t; p = q; break; }
  }
  G.t = 500;
  Cap.record(G, sys, c, 'robbed', G.t, null);
  check('she is not told at once', !G.captains[p.friend] && G.hearsay.length >= 1);
  var h = G.hearsay.filter(function (x) { return x.key === p.friend; })[0];
  var friendNode = 'r:' + p.friend.split('/')[1];
  var at = Rum.propagate(sys, h.origin, h.t0)[friendNode];
  check('the news does reach her ship', !!at, friendNode);
  if (!at) return;
  Rum.settle(G, sys, at.t - 1, null);
  check('not a second early', !G.captains[p.friend]);
  Rum.settle(G, sys, at.t + 1, null);
  check('then she knows', G.captains[p.friend] && G.captains[p.friend].heard < 0);
})();

section('saves');
(function () {
  var G = makeG();
  Rum.spawn(G, G.sys, 'rescues', trader(G, 1), 100, null);
  var snap = Save.snapshot(Object.assign({ ledgerLog: [] }, G));
  check('rumours are saved', snap.rumours && snap.rumours.length === 1 && snap.rumours[0].stars);
  var old = makeG(); old.rumours = []; old.record = { self: { piracy: 6 } };
  old.recordLegacy = { self: { piracy: 6 } };
  var lawful = null;
  for (var i = 0; i < old.sys.traffic.length && !lawful; i++) {
    var c = trader(old, i), p = Cap.profile(old, old.sys, c);
    if (p && p.values === 'lawful') lawful = c;
  }
  check('a career saved before rumours still has its record read', Cap.opinion(old, old.sys, lawful).score < -3);
})();

section('cost');
(function () {
  var G = makeG(), t0 = Date.now();
  Rum._clearCache();
  for (var i = 0; i < 40; i++) Rum.spawn(G, G.sys, 'piracy', trader(G, i), 1000 + i * 4000, null);
  var spawnMs = Date.now() - t0;
  var c = trader(G, 50);
  G.t = 30 * DAY;
  var t1 = Date.now();
  for (var k = 0; k < 200; k++) Cap.opinion(G, G.sys, c);
  var opMs = (Date.now() - t1) / 200;
  check('forty rumours start in well under a second', spawnMs < 1500, spawnMs + ' ms');
  check('an opinion with forty rumours is cheap', opMs < 2, opMs.toFixed(3) + ' ms');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
