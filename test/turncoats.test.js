/* turncoats.test.js - outlaws by corruption, and traders who turn (2026-11-22).
 *
 *     node test/turncoats.test.js
 *
 * Astra, 2026-11-22:
 *   "Syndicate ships should have a different name list. Pirate or syndicate
 *    presence should go up with the corruption level in a system, yes, but
 *    they shouldn't be a majority of most civilized placed."
 *   "is there a way for a non-pirate NPC to turn pirate if a juicy enough
 *    target passes?" - armed traders and Syndicate runners; afterwards an
 *    opportunist goes back to her lane, marked.
 *
 * Pinned here:
 *  - a clean system has at most one raider; raiders rise with corruption;
 *    in lawful space the outlaws never outnumber the lawful guns;
 *  - no two outlaw hulls in a system share a name, and a Syndicate
 *    flagship is named from its own list, never the raiders';
 *  - a raider knows her crew: the band in its own space, otherwise the
 *    freelancers working the same port, and shipai.js flies them that way;
 *  - temptation: an honest captain never turns; a bent, greedy one does
 *    for a rich enough, soft enough prize with no law watching;
 *  - live: a bent trader passing an unarmed pilot with a fortune aboard
 *    turns on some leg, the law runs her down like a pirate, her record
 *    follows the route, the next cop to scan her knows it, and an honest
 *    captain on the same legs never turns.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/journal.js');
require('../src/missions.js');
require('../src/shiptrade.js');
require('../src/captains.js');
var AI = require('../src/shipai.js');
var Galaxy = require('../src/galaxy.js');
var A = require('../src/aggression.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
}
function hooks() { var h = { said: [], say: function (m) { h.said.push(m); }, sound: function () {} }; return h; }
function saidAny(h, re) { return h.said.some(function (m) { return re.test(m); }); }

var g = Galaxy.build('kawartha');

/* ---- the generator ------------------------------------------------------ */
console.log('outlaws by corruption');
var rows = [], dupSys = [], badFlag = [], badBand = [], majority = [];
var pirateSet = {}; Gen.PIRATE_NAMES.forEach(function (n) { pirateSet['The ' + n] = true; });
var synSet = {}; Gen.SYNDICATE_FLAGSHIP_NAMES.forEach(function (n) { synSet['The ' + n] = true; });
var n = 0, sameCrewPair = null, twoCrewPair = null;
for (var si = 0; si < g.stars.length && n < 160; si++) {
  var star = g.stars[si];
  if (!star.factionId) continue;
  var sys = Gen.generateSystem(star.seed, Galaxy.systemOpts(g, star));
  if (!sys.ports || sys.ports.length < 2) continue;
  n++;
  var p = sys.patrols || [];
  var pir = p.filter(function (x) { return x.kind === 'pirate'; });
  var outl = p.filter(function (x) { return x.outlaw || x.faction === 'outlaw'; });
  var law = p.filter(function (x) {
    return !x.outlaw && x.faction !== 'outlaw' && (x.kind === 'police' || x.kind === 'navy' || x.kind === 'capital');
  });
  var names = {};
  outl.forEach(function (x) { if (names[x.name]) dupSys.push(sys.name + ': ' + x.name); names[x.name] = true; });
  p.forEach(function (x) {
    if (x.kind === 'capital' && x.outlaw && !synSet[x.name]) badFlag.push(sys.name + ': ' + x.name);
  });
  pir.forEach(function (x) {
    var want = sys.heldBy === 'pirate' ? sys.heldById : 'free:' + x.lurkAt;
    if (x.band !== want) badBand.push(sys.name + ': ' + x.name + ' ' + x.band + ' (want ' + want + ')');
  });
  if (!sys.pirateHeld && law.length && outl.length > law.length) majority.push(sys.name + ' ' + outl.length + '/' + law.length);
  if (!sys.pirateHeld && !law.length && pir.length > 1) majority.push(sys.name + ' (no law) ' + pir.length);
  /* Crews, for the flights check below. */
  for (var a = 0; a < pir.length; a++) for (var b = a + 1; b < pir.length; b++) {
    if (pir[a].band === pir[b].band && !sameCrewPair) sameCrewPair = [pir[a], pir[b]];
    if (pir[a].band !== pir[b].band && !twoCrewPair) twoCrewPair = [pir[a], pir[b]];
  }
  rows.push({ cor: sys.corruption, held: sys.heldBy, pir: pir.length });
}
function meanOf(f) { var a = rows.filter(f); return { n: a.length, m: a.reduce(function (s, r) { return s + r.pir; }, 0) / Math.max(1, a.length) }; }
var clean = meanOf(function (r) { return !r.held && r.cor < 25; });
var mid = meanOf(function (r) { return !r.held && r.cor >= 25 && r.cor < 60; });
var bought = meanOf(function (r) { return !r.held && r.cor >= 60; });
check('enough systems to read', n >= 120, n + ' systems');
check('a clean system has at most one raider',
      rows.every(function (r) { return r.held || r.cor >= 25 || r.pir <= 1; }),
      'mean ' + clean.m.toFixed(2) + ' over ' + clean.n);
check('raiders rise with corruption', clean.m < mid.m && clean.m < bought.m,
      'clean ' + clean.m.toFixed(2) + ', bribeable ' + mid.m.toFixed(2) + ', bought ' + bought.m.toFixed(2));
check('in lawful space the outlaws never outnumber the law', !majority.length, majority.slice(0, 3).join('; '));
check('no two outlaw hulls in a system share a name', !dupSys.length, dupSys.slice(0, 3).join('; '));
check('a Syndicate flagship is named from its own list', !badFlag.length, badFlag.slice(0, 3).join('; '));
check('the two lists share no name',
      Gen.SYNDICATE_FLAGSHIP_NAMES.every(function (x) { return Gen.PIRATE_NAMES.indexOf(x) < 0 && Gen.HEAVY_NAMES.indexOf(x) < 0; }));
check('every raider knows her crew', !badBand.length, badBand.slice(0, 3).join('; '));
check('pirateRange: clean is none-or-one, bought up to four',
      Gen.pirateRange(10, 12).lo === 0 && Gen.pirateRange(10, 12).hi === 1 && Gen.pirateRange(80, 12).hi === 4 &&
      Gen.pirateRange(80, 2).hi === 1);
check('raiders of one crew fly as one organisation', !!sameCrewPair &&
      AI.orgOf(sameCrewPair[0]) === AI.orgOf(sameCrewPair[1]), sameCrewPair && AI.orgOf(sameCrewPair[0]));
check('raiders of two crews do not', !!twoCrewPair &&
      AI.orgOf(twoCrewPair[0]) !== AI.orgOf(twoCrewPair[1]),
      twoCrewPair && AI.orgOf(twoCrewPair[0]) + ' / ' + AI.orgOf(twoCrewPair[1]));

/* ---- temptation, pure --------------------------------------------------- */
console.log('temptation');
var honest = { probity: 0.6, greed: 0.9 }, bentLazy = { probity: 0.2, greed: 0.3 };
var bent = { probity: 0.2, greed: 0.8 }, rotten = { probity: 0.02, greed: 0.8 };
var rich = { prize: 300000, own: 3000, soft: 1, law: false };
check('an honest captain is never tempted', AI.temptation(honest, rich) === 0);
check('nor a bent one who is not greedy', AI.temptation(bentLazy, rich) === 0);
check('a bent, greedy one is', AI.temptation(bent, rich) > 0, AI.temptation(bent, rich).toFixed(3));
check('the more rotten, the more tempted', AI.temptation(rotten, rich) > AI.temptation(bent, rich));
check('nothing under JUICY_MIN is juicy',
      AI.temptation(rotten, { prize: AI.JUICY_MIN - 1, own: 0, soft: 1 }) === 0);
check('a prize no richer than her own hold is not juicy',
      AI.temptation(rotten, { prize: 60000, own: 60000, soft: 1 }) === 0);
check('richer is juicier', AI.juice(300000, 3000) > AI.juice(60000, 3000) && AI.juice(60000, 3000) > 0,
      AI.juice(60000, 3000).toFixed(2) + ' < ' + AI.juice(300000, 3000).toFixed(2));
check('an armed prize tempts half as much',
      Math.abs(AI.temptation(bent, { prize: 300000, own: 3000, soft: 0.5 }) - AI.temptation(bent, rich) / 2) < 1e-9);
check('a trader never turns under the law\'s eye',
      AI.temptation(rotten, { prize: 300000, own: 3000, soft: 1, law: true }) === 0);
check('a runner, papers paid for, only rarely',
      Math.abs(AI.temptation(honest, { runner: true, prize: 300000, own: 3000, soft: 1, law: true }) -
               0.3 * AI.temptation(honest, { runner: true, prize: 300000, own: 3000, soft: 1 })) < 1e-9 &&
      AI.temptation(honest, { runner: true, prize: 300000, own: 3000, soft: 1 }) > 0);

/* ---- live --------------------------------------------------------------- */
console.log('a trader who turns');
var T = 4e6;
var realPoliceNearby = Sim.policeNearby;
Sim.policeNearby = function () { return null; };
/* A lawful system with a bent, greedy captain on an armed hull, and an
 * honest one on another. */
var lsys = null, lstar = null, turnSt = null, honestSt = null;
function G0(s, st) {
  return { seed: 'kawartha', t: T, galaxy: g, here: st, sys: s, standing: {}, journal: [], distress: [],
           ship: { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, cargo: {}, credits: 100,
                   hullMax: 100, hullHp: 100, fit: {}, docked: null } };
}
for (si = 0; si < g.stars.length && !(turnSt && honestSt); si++) {
  var cand = g.stars[si], f = g.factionById[cand.factionId];
  if (!f || f.outlaw || f.minor || f.pirate) continue;
  var sy = Gen.generateSystem(cand.seed, Galaxy.systemOpts(g, cand));
  sy.starId = cand.id;
  if (!sy.ports || sy.ports.length < 2 || !sy.traffic || sy.traffic.length < 6) continue;
  var Gs = G0(sy, cand), ts = null, hs = null;
  Sim.trafficAll(sy, T).forEach(function (st) {
    if (!st || !st.route || st.route.runner || st.phase !== 'cruise') return;
    if (!Combat.isArmedNpc({ cls: st.cls || st.route.cls })) return;
    var d = AI.dials(Gs, sy, st);
    if (!d || d.role !== 'trader') return;
    if (!ts && A.opportunistState(sy, Gs, st) && d.probity < 0.25) ts = st;
    if (!hs && d.probity > 0.6) hs = st;
  });
  if (ts && hs) { lsys = sy; lstar = cand; turnSt = ts; honestSt = hs; }
}
check('a lawful system with a bent captain and an honest one, both armed', !!lsys,
      lsys && lsys.name + ': ' + turnSt.route.name + ' / ' + honestSt.route.name);
function fresh(s) { s.patrols = []; s._ships = null; s._traffic = null; (s.traffic || []).forEach(function (r) { r.suppressed = false; r.turnLeg = null; }); }
/* Sit an unarmed pilot with a fortune of milfuel beside her, leg after leg. */
function tryLegs(route, legs) {
  for (var cyc = 0; cyc < legs; cyc++) {
    fresh(lsys);
    var tk = T + cyc * route.period;
    var sNow = Sim.trafficAll(lsys, tk).filter(function (x) { return x.route === route; })[0];
    if (!sNow || sNow.phase === 'moored' || sNow.landed || sNow.inside) continue;
    var G = G0(lsys, lstar);
    G.t = tk;
    G.ship.pos = V.add(sNow.pos, { x: 100, y: 0, z: 0 }); G.ship.vel = V.clone(sNow.vel);
    G.ship.cargo = { milfuel: 20 };
    lsys._runnerLookAt = 0;
    var h = hooks();
    A.runners(lsys, G, tk, h);
    var r = lsys.patrols.filter(function (p) { return p.turncoat && p.liftedFrom === route; })[0];
    if (r) return { r: r, G: G, h: h, t: tk, legs: cyc + 1 };
  }
  return null;
}
if (lsys) {
  var got = tryLegs(turnSt.route, 300);
  check('on some leg, the bent captain turns on the pilot', !!got, got && got.r.name + ' after ' + got.legs + ' legs');
  if (got) {
    var r = got.r;
    check('she fires first, at you', r.hostileToPlayer && r.mode === 'attack' && r.firedOnYouAt === got.t);
    check('and says so', saidAny(got.h, /breaks from her lane and opens fire on you/), got.h.said.join(' | '));
    var rec = A.crimeOf(got.G, lsys, turnSt.route, got.t);
    check('her route is marked', !!rec && rec.victim === 'you' && rec.star === lsys.starId, rec && JSON.stringify(rec));
    /* The law runs her down like a pirate. */
    Sim.policeNearby = realPoliceNearby;
    var cop = { id: 'tc-cop', name: 'Cutter', kind: 'police', cls: 'police', faction: lsys.ports[0].faction,
                hullMax: 100, hullHp: 100, shieldHp: 0, shieldMax: 0, accel: 0.0315, mode: 'inspect', modeSince: 0,
                rail: { type: 'lifted' },
                live: { pos: V.add(r.live.pos, { x: 300, y: 0, z: 0 }), vel: V.clone(r.live.vel), fwd: { x: 1, y: 0, z: 0 },
                        up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } } };
    cop.live.spec = cop;
    lsys.patrols.push(cop);
    A.update(lsys, got.G, got.t + 1, 1, hooks());
    check('the law runs her down like a pirate', cop.target === r && cop.pursuing === 'pirate',
          cop.target ? cop.target.name + ' / ' + cop.pursuing : 'no target');
    Sim.policeNearby = function () { return null; };

    /* Next week: a cop scanning her papers knows. */
    fresh(lsys);
    var t2 = got.t + 7 * 86400, st2 = null, k2;
    for (k2 = 0; k2 < 60 && !st2; k2++) {
      var tt = t2 + k2 * 3600;
      st2 = Sim.trafficAll(lsys, tt).filter(function (x) { return x.route === turnSt.route && x.phase === 'cruise'; })[0];
      if (st2) t2 = tt;
    }
    if (st2) {
      var G2 = G0(lsys, lstar); G2.t = t2; G2.turncoats = got.G.turncoats;
      G2.ship.pos = V.add(st2.pos, { x: 5000, y: 0, z: 0 });
      var cop2 = { id: 'tc-cop2', name: 'Cutter Two', kind: 'police', cls: 'police', faction: lsys.ports[0].faction,
                   hullMax: 100, hullHp: 100, shieldHp: 0, shieldMax: 0, accel: 0.0315, mode: 'inspect', modeSince: 0,
                   rail: { type: 'lifted' },
                   live: { pos: V.add(st2.pos, { x: 100, y: 0, z: 0 }), vel: V.clone(st2.vel), fwd: { x: 1, y: 0, z: 0 },
                           up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } } };
      cop2.live.spec = cop2;
      lsys.patrols.push(cop2);
      turnSt.route.scannedAt = undefined;
      var h2 = hooks();
      G2.ship.pos = V.add(st2.pos, { x: 1000, y: 0, z: 0 });
      A.update(lsys, G2, t2, 1, h2);
      check('a week on, the next cop to scan her knows', !!cop2.target && cop2.target.liftedFrom === turnSt.route &&
            cop2.target.turncoat, cop2.target ? cop2.target.name : 'no target');
      check('and says what for', saidAny(h2, /wanted for an assault/), h2.said.join(' | '));
    } else check('found her cruising a week on', false);

    /* The record lapses, and closes with her. */
    check('the record lapses after a month', !A.crimeOf({ turncoats: JSON.parse(JSON.stringify(got.G.turncoats)) },
          lsys, turnSt.route, got.t + A.TURNCOAT_MEMORY_S + 1));
    turnSt.route.impounded = true;
    var Gx = { turncoats: JSON.parse(JSON.stringify(got.G.turncoats)) };
    check('and closes when she is impounded', !A.crimeOf(Gx, lsys, turnSt.route, got.t + 10) &&
          !Object.keys(Gx.turncoats).length);
    turnSt.route.impounded = false;
  }
  var hon = tryLegs(honestSt.route, 300);
  check('an honest captain, the same fortune beside her, never turns', !hon, hon && hon.r.name);
  /* No fortune, no turn: the same bent captain beside a pilot with grain. */
  var poorTurn = null;
  for (var cy = 0; cy < 200 && !poorTurn; cy++) {
    fresh(lsys);
    var tq = T + cy * turnSt.route.period;
    var sq = Sim.trafficAll(lsys, tq).filter(function (x) { return x.route === turnSt.route; })[0];
    if (!sq || sq.phase === 'moored' || sq.landed || sq.inside) continue;
    var Gq = G0(lsys, lstar); Gq.t = tq;
    Gq.ship.pos = V.add(sq.pos, { x: 100, y: 0, z: 0 }); Gq.ship.cargo = { grain: 30 };
    lsys._runnerLookAt = 0;
    A.runners(lsys, Gq, tq, hooks());
    poorTurn = lsys.patrols.filter(function (p) { return p.turncoat; })[0] || null;
  }
  check('and nobody turns for a hold of grain', !poorTurn);
}
Sim.policeNearby = realPoliceNearby;

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
