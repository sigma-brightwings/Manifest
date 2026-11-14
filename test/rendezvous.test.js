/* rendezvous.test.js - two hulls with an arrangement (2026-11-12).
 *
 *     node test/rendezvous.test.js
 *
 * Astra: "We're gonna need NPC ships to both trade with each other ...
 * something that the player can come across in the local system chatter
 * and attempt to render aid or even pirate their ship." And, on the seed:
 * "why don't we build it on a seed which uses the last ship's ID that
 * showed up in system before you, plus a time variant, plus the game
 * seed?"
 *
 * What this holds:
 *   - the arrangement is in the SEED: same galaxy, same two hulls, same
 *     body, same hours, forever - and the additive rule, that leaving it
 *     out changes nothing else;
 *   - they actually MEET: both moored, a few thousand km apart, for the
 *     whole window;
 *   - what moves is Astra's seed, quantised to the WINDOW rather than to
 *     your arrival - which is the one change I made to her design, and
 *     the reason is that keyed to arrival it is a re-roll button;
 *   - the three things you can do, and that each shuts the others.
 */
global.window = global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
require('../src/weather.js');
var C = require('../src/combat.js');
var M = require('../src/missions.js');
var Cl = require('../src/claims.js');
var R = require('../src/rendezvous.js');
var V = global.V;

/* Whatever the yard actually calls its cheapest gun: a test that hard-codes
 * a fitting id is a test that breaks when the catalogue is renamed. */
function firstGun() {
  var ids = Object.keys(C.GUNS || {});
  return ids.length ? ids[0] : 'pulse';
}

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');

/* The first system that has one. */
var sys = null, star = null;
for (var i = 0; i < 60 && !sys; i++) {
  var o = Galaxy.systemOpts(gal, gal.stars[i]);
  var s = Gen.generateSystem(gal.stars[i].seed, o);
  if (s.rendezvous) { sys = s; star = gal.stars[i]; }
}
if (!sys) { console.log('no system in sixty has a rendezvous'); process.exit(1); }
var rv = sys.rendezvous;

console.log('--- it is in the seed ---');
check('a system can carry an arrangement', !!rv, sys.seed + ' at ' + rv.atName);
check('two hulls, named', !!(R.hullsOf(sys) && R.hullsOf(sys).a.name && R.hullsOf(sys).b.name),
      R.hullsOf(sys).a.name + ' + ' + R.hullsOf(sys).b.name);
check('out of two different berths', rv.fromA !== rv.fromB);
check('around a body with no dock on it',
      !(sys.ports || []).some(function (p) {
        return p.orbit && p.orbit.parent === rv.at;
      }));
var again = Gen.generateSystem(star.seed, Galaxy.systemOpts(gal, star));
check('and the same seed gives the same arrangement',
      again.rendezvous && again.rendezvous.at === rv.at &&
      Math.abs(again.rendezvous.t0 - rv.t0) < 1e-9);

/* THE ADDITIVE RULE, the way blacksites.test.js proves it. */
var withOut = Gen.generateSystem(star.seed,
  Object.assign({}, Galaxy.systemOpts(gal, star), { noRendezvous: true }));
check('left out, there is none', !withOut.rendezvous);
check('and the system is otherwise the same',
      withOut.bodies.length === again.bodies.length &&
      withOut.bodies.map(function (b) { return b.id; }).join(',') ===
      again.bodies.map(function (b) { return b.id; }).join(','));
check('with exactly two fewer hulls in the sky',
      again.patrols.length - withOut.patrols.length === 2,
      again.patrols.length + ' vs ' + withOut.patrols.length);
check('and every other hull unchanged',
      withOut.patrols.map(function (p) { return p.id; }).join(',') ===
      again.patrols.filter(function (p) { return p.kind !== 'meet'; })
           .map(function (p) { return p.id; }).join(','));

console.log('--- they actually meet ---');
var h = R.hullsOf(sys);
var best = Infinity, moored = 0, n = 40;
for (var k = 0; k <= n; k++) {
  var t = rv.t0 + (k / n) * rv.layover;
  var sa = Sim.trafficState(h.a.rail.route, sys, t);
  var sb = Sim.trafficState(h.b.rail.route, sys, t);
  if (sa.phase === 'moored' && sb.phase === 'moored') moored++;
  best = Math.min(best, V.dist(sa.pos, sb.pos));
}
check('both are alongside for most of the window', moored > n * 0.7, moored + '/' + (n + 1));
check('and close enough to be doing something',
      best < 60000, (best / 1000).toFixed(1) + ' kkm apart');
check('the meeting is on while they are there', R.onNow(sys, rv.t0 + rv.layover * 0.5));
check('and off when they have gone home',
      !R.onNow(sys, rv.t0 + rv.period * 0.5));

console.log('--- what moves, and whose idea it was ---');
function career() {
  return { seed: 'kawartha', t: 0, here: star, sys: sys, galaxy: gal,
           ship: { credits: 500000, cargo: {}, cargoCap: 80, fit: { g1: firstGun() },
                   pos: { x: 0, y: 0, z: 0 } },
           standing: {}, rvDone: {}, rvBlown: {}, band: [] };
}
var G = career();
var mid = rv.t0 + rv.layover * 0.5;
var d0 = R.dealAt(G, sys, mid);
check('a window has a deal', !!d0);
check('and it knows which window it is', d0.n === R.windowIndex(sys, mid));
check('somebody came in ahead of it', !!d0.who, d0.who && d0.who.name);
check('and it is a hull with a name, not an id',
      d0.who && !/^n\d+$|^rv-/.test(d0.who.name), d0.who && d0.who.name);

/* ASTRA'S SEED, AND THE ONE CHANGE. Keyed to the window, the answer does
 * not move while you are in it - so leaving and coming back cannot shop
 * for a better hold. Keyed to arrival it would have. */
var early = R.dealAt(G, sys, rv.t0 + rv.layover * 0.1);
var late = R.dealAt(G, sys, rv.t0 + rv.layover * 0.9);
check('the deal is the same at both ends of the window',
      early.cid === late.cid && early.tonnes === late.tonnes && early.ask === late.ask,
      early.tonnes + 't ' + early.cid);
check('so leaving and coming back cannot shop for a better one', early.n === late.n);
var next = R.dealAt(G, sys, rv.t0 + rv.period + rv.layover * 0.5);
check('and the next meeting is its own thing',
      next.n === early.n + 1 &&
      (next.cid !== early.cid || next.tonnes !== early.tonnes), next.tonnes + 't ' + next.cid);

/* And it is a function of the seed, not of the clock reading. */
var G2 = career();
check('two careers on the same seed see the same hold',
      JSON.stringify(R.dealAt(G2, sys, mid).cid) === JSON.stringify(d0.cid));
var G3 = career(); G3.seed = 'beaverton';
var d3 = R.dealAt(G3, sys, mid);
check('and a different galaxy seed does not',
      d3.cid !== d0.cid || d3.tonnes !== d0.tonnes || d3.ask !== d0.ask);

console.log('--- being there ---');
var live = R.live(G, sys, mid);
check('a meeting in progress has a position', !!(live && live.pos));
check('and knows how far off you are', live.range > 0);
check('standing a long way off is not being at the scene',
      R.atScene(G, sys, mid) === null);
/* Pull alongside. */
G.ship.pos = { x: live.pos.x, y: live.pos.y, z: live.pos.z };
check('alongside, it is your business', !!R.atScene(G, sys, mid));
check('and there is nothing stopping you', R.refusal(G, sys, mid) === null,
      R.refusal(G, sys, mid) || '');

console.log('--- the three things you can do ---');
/* BUY. */
var Gb = career();
var lb = R.live(Gb, sys, mid);
Gb.ship.pos = { x: lb.pos.x, y: lb.pos.y, z: lb.pos.z };
var db = R.dealAt(Gb, sys, mid);
var before = Gb.ship.credits;
var rb = R.buy(Gb, sys, mid, null);
check('you can buy into it', rb.ok === true, rb.why || '');
check('the cargo is aboard', (Gb.ship.cargo[db.cid] || 0) === rb.tonnes);
check('and you paid under the counter for it', Gb.ship.credits < before);
check('a second go is refused - you already did this one',
      R.doneAt(Gb, sys, mid) === 'bought');

/* ROB. */
var Gr = career();
var lr = R.live(Gr, sys, mid);
Gr.ship.pos = { x: lr.pos.x, y: lr.pos.y, z: lr.pos.z };
var dr = R.dealAt(Gr, sys, mid);
var rr2 = R.rob(Gr, sys, mid, null);
check('you can take it instead', rr2.ok === true, rr2.why || '');
check('the hold has it', (Gr.ship.cargo[dr.cid] || 0) === rr2.tonnes);
check('you paid nothing', Gr.ship.credits === 500000);
check('and it is hot', (Cl.hotOf ? Cl.hotOf(Gr, dr.cid) : 0) > 0);
check('both flags took it off your standing',
      rr2.flags.every(function (f) { return M.standing(Gr, f) <= -R.ROB_STANDING; }),
      rr2.flags.join(','));
check('and they are lying low afterwards', R.blownUntil(Gr, sys) > mid);
check('so the next few meetings do not happen',
      !R.onNow(sys, mid + rv.period, Gr));

/* An unarmed hull is not robbing anybody. */
var Gu = career();
Gu.ship.fit = {};
var lu = R.live(Gu, sys, mid);
Gu.ship.pos = { x: lu.pos.x, y: lu.pos.y, z: lu.pos.z };
check('with nothing to threaten them with, they decline',
      R.rob(Gu, sys, mid, null).ok === false);

/* TELL. */
var Gt = career();
var lt = R.live(Gt, sys, mid);
Gt.ship.pos = { x: lt.pos.x, y: lt.pos.y, z: lt.pos.z };
var rt = R.tell(Gt, sys, mid, null);
check('or you can tell somebody', rt.ok === true, rt.why || '');
check('there is a finder\'s fee', Gt.ship.credits > 500000, rt.fee + ' cr');
check('the flag you told thinks better of you', M.standing(Gt, rt.law) > 0);
check('and the two of them work out who was alongside',
      [rv.fromA, rv.fromB].some(function (pid) {
        var p = sys.byId[pid];
        return p && p.faction && M.standing(Gt, p.faction) < 0;
      }));
check('and they lie low', R.blownUntil(Gt, sys) > mid);

console.log('--- across the galaxy ---');
var seen = 0, eligible = 0, met = 0, dirty = 0;
for (var j = 0; j < 60; j++) {
  var oj = Galaxy.systemOpts(gal, gal.stars[j]);
  var sj = Gen.generateSystem(gal.stars[j].seed, oj);
  if ((sj.ports || []).filter(function (p) { return p.market && !p.classified; }).length >= 2) eligible++;
  if (!sj.rendezvous) continue;
  seen++;
  var hj = R.hullsOf(sj);
  var tj = sj.rendezvous.t0 + sj.rendezvous.layover * 0.5;
  var aj = Sim.trafficState(hj.a.rail.route, sj, tj);
  var bj = Sim.trafficState(hj.b.rail.route, sj, tj);
  if (aj.phase === 'moored' && bj.phase === 'moored') met++;
  var Gj = career(); Gj.here = gal.stars[j];
  for (var w = 0; w < 6; w++) {
    var dj = R.dealAt(Gj, sj, sj.rendezvous.t0 + w * sj.rendezvous.period + sj.rendezvous.layover * 0.5);
    if (dj && dj.contraband) dirty++;
  }
}
check('arrangements are uncommon, not everywhere',
      seen > 0 && seen < eligible * 0.6, seen + ' of ' + eligible + ' eligible systems');
check('and every one of them actually meets', met === seen, met + '/' + seen);
check('some of what moves is not on any manifest', dirty > 0, dirty + ' windows');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
