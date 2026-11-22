/* civilians.test.js - ship AI slice 3: what a freighter or a liner does
 * with somebody on her (2026-11-22).
 *
 *     node test/civilians.test.js
 *
 * claude/ship-ai-profiles.md section 5 (Trader, Passenger) and the Scared
 * options of section 4. Pinned:
 *  - the scores: an unarmed ship never fights; a ship with an empty hold
 *    never dumps; nobody dumps to YOU; a liner never fights and strikes
 *    sooner than a freighter when holed; a greedy armed trader would
 *    rather dump than comply; a frightened one with no way to outrun him
 *    and a gun is CORNERED and fights;
 *  - each answer to a pirate's "heave to", forced, does what it says:
 *    comply is stripped; dump drops real canisters, her hold and her port
 *    are short of them, the pirate stops and scoops whatever is left
 *    after LOOT_S - less if you got there first; fight turns on him;
 *    flee refuses and runs;
 *  - under fire: she strikes, turns, dumps or runs, and holds her answer
 *    for a few seconds unless a new one is clearly better;
 *  - a liner calls for help the moment a pirate comes for her;
 *  - your own "heave to": a calm crew answers as the old table did, a
 *    frightened one strikes sooner, an angered one hardly at all;
 *  - the same meeting answers the same way twice.
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
var Galaxy = require('../src/galaxy.js');
var A = require('../src/aggression.js');
var AI = require('../src/shipai.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen, Eco = global.Economy;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function hooks() { var h = { said: [], say: function (m) { h.said.push(m); }, sound: function () {} }; return h; }
function saidAny(h, re) { return h.said.some(function (m) { return re.test(m); }); }

var g = Galaxy.build('kawartha');
var star = null, sys = null;
for (var si = 0; si < g.stars.length && !sys; si++) {
  var cand = g.stars[si], f = g.factionById[cand.factionId];
  if (!f || f.outlaw || f.minor || f.pirate) continue;
  var sy = Gen.generateSystem(cand.seed, Galaxy.systemOpts(g, cand));
  sy.starId = cand.id;
  if (!sy.ports || sy.ports.length < 2 || !sy.traffic || sy.traffic.length < 6) continue;
  star = cand; sys = sy;
}
check('a lawful system with traffic', !!sys, sys && sys.name);
Sim.policeNearby = function () { return null; };
var T = 4e6;

function laden(t) {
  var list = Sim.trafficAll(sys, t);
  for (var i = 0; i < list.length; i++) {
    var st = list[i];
    if (st.phase === 'cruise' && !st.route.runner && st.route.flag !== 'outlaw' && st.manifest && st.manifest.length &&
        st.manifest.some(function (m) { return (m.qty || 0) > 2 && Eco.BY_ID[m.cid] && Eco.BY_ID[m.cid].base > 0; })) return st;
  }
  return null;
}
var st0 = laden(T);
check('a laden freighter in cruise', !!st0, st0 && st0.route.name);

function live(pos) {
  return { pos: V.clone(pos), vel: { x: 0, y: 0, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } };
}
var nId = 0;
function npc(kind, faction, pos, extra) {
  var sp = { id: 'cv' + (nId++), name: kind + ' ' + nId, kind: kind, cls: kind === 'pirate' ? 'pirate' : kind,
             faction: faction, hullMax: 100, hullHp: 100, shieldHp: 0, shieldMax: 0, accel: kind === 'pirate' ? 0.0255 : 0.005,
             live: live(pos), mode: kind === 'pirate' ? 'intercept' : 'breakoff', modeSince: 0, rail: { type: 'lifted' } };
  for (var k in (extra || {})) sp[k] = extra[k];
  sp.live.spec = sp;
  sys.patrols.push(sp);
  return sp;
}
function game() {
  return { seed: 'kawartha', t: T, galaxy: g, here: star, sys: sys, standing: {}, journal: [], distress: [],
           ship: { pos: V.add(st0.pos, { x: 0, y: 900, z: 0 }), vel: V.clone(st0.vel), cargo: {}, credits: 100, gun: true,
                   weapons: ['laser'], hullMax: 100, hullHp: 100, fit: {}, docked: null } };
}
function fresh() {
  sys.patrols = []; sys._ships = null; sys._flights = null; sys._flightsAt = undefined; sys._moodsAt = undefined;
  sys.canisters = [];
  (sys.traffic || []).forEach(function (r) { r.suppressed = false; });
}
function make(G, sp, d, mood) {
  var ai = AI.aiOf(G, sys, sp); for (var k in d) ai.dials[k] = d[k]; ai.at = T;
  if (mood) { ai.fear = mood.fear || 0; ai.anger = mood.anger || 0; }
  return ai;
}
var LINER = { cls: 'liner', liftedFrom: { id: 'lnr', cls: 'liner', souls: 120 }, souls: 120 };
var CARGO = [{ cid: 'grain', qty: 40 }, { cid: 'ore', qty: 30 }];

console.log('--- the scores ---');
fresh();
var G = game();
var pirate = npc('pirate', 'pb0', st0.pos);
var unarmedV = npc('trader', star.factionId, st0.pos, { cls: 'shuttle', manifest: CARGO.map(function (m) { return { cid: m.cid, qty: m.qty }; }) });
make(G, unarmedV, { nerve: 0.5, greed: 0.5 }, { fear: 0.7 });
var su = AI.civilScores(G, sys, unarmedV, pirate, 'demand', T).scores;
check('an unarmed ship never fights', su.fight === 0, JSON.stringify(su));
check('...and a frightened one heaves to', AI.choose(G, sys, unarmedV, pirate, 'demand', T).verb === 'comply');
var emptyV = npc('trader', star.factionId, st0.pos, { manifest: [] });
check('a ship with an empty hold never dumps', AI.civilScores(G, sys, emptyV, pirate, 'demand', T).scores.dump === 0);
check('nobody dumps to YOU (you are asking her to strike)', AI.civilScores(G, sys, unarmedV, null, 'demand', T).scores.dump === 0);
var linerV = npc('trader', star.factionId, st0.pos, Object.assign({ manifest: [] }, LINER));
check('a liner is a passenger ship', AI.civilRole(linerV) === 'passenger');
make(G, linerV, { nerve: 0.9 }, { fear: 0.9, anger: 0.9 });
check('a liner never fights, however brave or angry', AI.civilScores(G, sys, linerV, pirate, 'hit', T).scores.fight === 0);
var tradeH = npc('trader', star.factionId, st0.pos, { hullHp: 30, manifest: [] });
var linerH = npc('trader', star.factionId, st0.pos, Object.assign({ hullHp: 30, manifest: [] }, LINER));
make(G, tradeH, { nerve: 0.4 }, { fear: 0.6 }); make(G, linerH, { nerve: 0.4 }, { fear: 0.6 });
var sT = AI.civilScores(G, sys, tradeH, pirate, 'hit', T).scores.surrender, sL = AI.civilScores(G, sys, linerH, pirate, 'hit', T).scores.surrender;
check('holed and frightened, a liner strikes far sooner than a freighter', sL > 2.5 * sT, sL.toFixed(3) + ' vs ' + sT.toFixed(3));
check('a whole hull does not strike', AI.civilScores(G, sys, unarmedV, pirate, 'hit', T).scores.surrender === 0);
var greedy = npc('trader', star.factionId, st0.pos, { cls: 'freighter', manifest: CARGO.map(function (m) { return { cid: m.cid, qty: m.qty }; }) });
var meek = npc('trader', star.factionId, st0.pos, { cls: 'freighter', manifest: CARGO.map(function (m) { return { cid: m.cid, qty: m.qty }; }) });
make(G, greedy, { greed: 0.95, nerve: 0.4 }, { fear: 0.3 }); make(G, meek, { greed: 0.05, nerve: 0.4 }, { fear: 0.3 });
var sg = AI.civilScores(G, sys, greedy, pirate, 'demand', T).scores, sm = AI.civilScores(G, sys, meek, pirate, 'demand', T).scores;
check('a greedy captain would rather dump than hand over three fifths', sg.dump > sg.comply, 'dump ' + sg.dump.toFixed(3) + ' comply ' + sg.comply.toFixed(3));
check('...and a meek one would rather comply', sm.comply > sm.dump, 'comply ' + sm.comply.toFixed(3) + ' dump ' + sm.dump.toFixed(3));
/* Cornered: the same frightened armed captain, once with no way to run and once faster than him. */
var trapped = npc('trader', star.factionId, st0.pos, { cls: 'freighter', manifest: [] });
var quick = npc('trader', star.factionId, st0.pos, { cls: 'freighter', manifest: [], accel: 0.05 });
make(G, trapped, { nerve: 0.5 }, { fear: 0.8 }); make(G, quick, { nerve: 0.5 }, { fear: 0.8 });
var ct = AI.civilScores(G, sys, trapped, pirate, 'hit', T), cq = AI.civilScores(G, sys, quick, pirate, 'hit', T);
check('frightened, armed and unable to outrun him, she is cornered', ct.cornered && !cq.cornered);
check('cornered lifts the fight score by half again', ct.scores.fight > cq.scores.fight * 1.4,
      ct.scores.fight.toFixed(3) + ' vs ' + cq.scores.fight.toFixed(3));
check('a ship that can outrun him would rather run', cq.scores.flee > cq.scores.fight, 'flee ' + cq.scores.flee.toFixed(3) + ' fight ' + cq.scores.fight.toFixed(3));

console.log('--- the answers to "heave to", each one forced ---');
var realChoose = AI.choose;
function forced(verb) { AI.choose = function (G2, s2, v, foe, why, t) { return { verb: verb, scores: {}, cornered: false }; }; }
function robberyWith(verb) {
  fresh();
  var G2 = game();
  var p = npc('pirate', 'pb0', V.add(st0.pos, { x: 300, y: 0, z: 0 }));
  var v = A.startRobbery(sys, G2, p, st0, T, hooks());
  p.live.pos = V.add(v.live.pos, { x: 8, y: 0, z: 0 }); p.live.vel = V.clone(v.live.vel);
  forced(verb);
  var h = hooks();
  A.update(sys, G2, T + 1, 1, h);
  AI.choose = realChoose;
  return { G: G2, p: p, v: v, h: h };
}
var rc = robberyWith('comply');
check('comply: she is stripped, and the pirate goes to sell it', !!rc.v.robbed && !!rc.p.loot && rc.p.mode === 'breakoff');

var hold0 = st0.manifest.map(function (m) { return { cid: m.cid, qty: m.qty || 0 }; });
var rd = robberyWith('dump');
var cans = (sys.canisters || []).filter(function (c) { return c.dumpedBy === rd.v.id; });
check('dump: real canisters go out of her hatch', cans.length > 0 && cans.length <= 2, cans.map(function (c) { return c.tonnes + 't ' + c.cid; }).join(', '));
var after = rd.v.manifest[0] ? (rd.v.manifest[0].qty || 0) : 0, before0 = hold0[0].qty;
check('...about a third of a line each, and her hold is that much lighter', after < before0 && after >= before0 * 0.55, before0 + ' -> ' + after);
check('...her port will be short of it', (rd.G.shipTrade && rd.G.shipTrade.shorts || []).length > 0);
check('...she runs, and the pirate lets her go and stops to scoop', rd.v.mode === 'breakoff' && !rd.p.target && rd.p.scoop && rd.v.dumped);
check('...and says so', saidAny(rd.h, /dumps .* and runs/), rd.h.said.join(' | '));
/* You get to one first. */
var mine = cans[0];
sys.canisters = sys.canisters.filter(function (c) { return c !== mine; });
A.update(sys, rd.G, T + 2, 1, hooks());
check('...she is still scooping before LOOT_S is up', !!rd.p.scoop);
A.update(sys, rd.G, T + 1 + A.LOOT_S + 1, 1, hooks());
var left = (sys.canisters || []).filter(function (c) { return c.dumpedBy === rd.v.id; });
check('...after it, she has scooped what was left and gone to sell it', !rd.p.scoop && !!rd.p.loot && rd.p.mode === 'breakoff' && left.length === 0,
      'scooped ' + (rd.p.loot && rd.p.loot.scooped) + ' of ' + cans.length);
check('...and the one you took first is not in her haul', rd.p.loot.scooped === cans.length - 1);

var rf = robberyWith('fight');
var armedHere = Combat.isArmedNpc(rf.v);
check('fight: she refuses and turns on him' + (armedHere ? '' : ' (unarmed: she runs instead)'),
      armedHere ? (rf.v.refused && rf.v.target === rf.p && rf.v.mode === 'chase') : (rf.v.refused && rf.v.mode === 'breakoff'));
var rr = robberyWith('flee');
check('flee: she refuses and runs, and the pirate is angry about it', rr.v.refused && rr.v.mode === 'breakoff' && rr.v.threat === rr.p &&
      AI.moodOf(rr.G, sys, rr.p, T + 1).anger > 0);

console.log('--- under fire ---');
function hitWith(verb, extra) {
  fresh();
  var G2 = game();
  var p = npc('pirate', 'pb0', V.add(st0.pos, { x: 3, y: 0, z: 0 }));
  var v = npc('trader', star.factionId, st0.pos, Object.assign({ cls: 'freighter', manifest: CARGO.map(function (m) { return { cid: m.cid, qty: m.qty }; }) }, extra || {}));
  p.target = v; p.mode = 'chase';
  forced(verb);
  var h = hooks();
  A.onNpcHit(sys, G2, v, p, T, h);
  AI.choose = realChoose;
  return { G: G2, p: p, v: v, h: h };
}
var hs = hitWith('surrender');
check('surrender: she cuts her drive and strikes', hs.v.disabled === 'surrender' && hs.v.surrendered);
check('...and the pirate comes alongside to strip her', hs.p.mode === 'chase' && hs.p.standoffKm < 1);
var hf = hitWith('fight');
check('fight: she turns on him', hf.v.target === hf.p && hf.v.mode === 'chase' && saidAny(hf.h, /turns on/), hf.h.said.join(' | '));
var hd = hitWith('dump');
check('dump: she buys him off with part of her hold', !!hd.v.dumped && !!hd.p.scoop);
var hr = hitWith('flee');
check('flee: she runs and calls for help', hr.v.mode === 'breakoff' && hr.v.threat === hr.p && hr.v.callSent);
/* Sticky. Find a captain whose two best answers are within a quarter of
 * each other: if her last answer was the runner-up, a fresh hit inside
 * HOLD_S keeps it; once HOLD_S has passed she takes the better one. */
fresh();
G = game();
var sp = npc('pirate', 'pb0', st0.pos), sv = npc('trader', star.factionId, st0.pos, { cls: 'freighter', manifest: [] });
var close = null;
for (var fq = 0; fq <= 1.0001 && !close; fq += 0.02) {
  for (var nv = 0.1; nv <= 0.91 && !close; nv += 0.1) {
    make(G, sv, { nerve: nv, greed: 0.5, heat: 0.1 }, { fear: fq });
    var sc0 = AI.civilScores(G, sys, sv, sp, 'hit', T).scores;
    var ranked = AI.VERBS.filter(function (k) { return sc0[k] > 0; }).sort(function (a, b) { return sc0[b] - sc0[a]; });
    if (ranked.length >= 2 && sc0[ranked[0]] < AI.STICKY * sc0[ranked[1]] * 0.98) close = { fear: fq, nerve: nv, top: ranked[0], next: ranked[1] };
  }
}
check('there is a captain torn between two answers', !!close, close && (close.top + ' / ' + close.next + ' at fear ' + close.fear.toFixed(2)));
if (close) {
  make(G, sv, { nerve: close.nerve, greed: 0.5, heat: 0.1 }, { fear: close.fear });
  sv._choice = { verb: close.next, why: 'hit', at: T };
  check('inside HOLD_S she keeps her last answer through a near tie', AI.choose(G, sys, sv, sp, 'hit', T + 2).verb === close.next);
  sv._choice = { verb: close.next, why: 'hit', at: T };
  sv._ai.at = T + AI.HOLD_S + 1;
  check('...and takes the better one once it has passed', AI.choose(G, sys, sv, sp, 'hit', T + AI.HOLD_S + 1).verb === close.top);
}
/* A clearly better answer wins at once: a fast ship that was fighting runs. */
var qv = npc('trader', star.factionId, st0.pos, { cls: 'freighter', manifest: [], accel: 0.05 });
make(G, qv, { nerve: 0.5 }, { fear: 0.8 });
qv._choice = { verb: 'fight', why: 'hit', at: T };
check('a clearly better answer wins inside HOLD_S', AI.choose(G, sys, qv, sp, 'hit', T + 1).verb === 'flee');

console.log('--- a liner sees him coming ---');
fresh();
G = game();
var lst = Sim.trafficAll(sys, T).filter(function (s) { return s.route && s.route.cls === 'liner' && s.phase === 'cruise'; })[0];
if (lst) {
  var lp = npc('pirate', 'pb0', V.add(lst.pos, { x: 600, y: 0, z: 0 }));
  var lv = A.startRobbery(sys, G, lp, lst, T, hooks());
  check('a liner calls for help the moment a pirate comes for her', lv && lv.callSent && G.distress.some(function (c) { return c.victim === lv; }));
} else {
  var lp2 = npc('pirate', 'pb0', V.add(st0.pos, { x: 600, y: 0, z: 0 }));
  st0.route.cls = 'liner';
  var lv2 = A.startRobbery(sys, G, lp2, st0, T, hooks());
  delete st0.route.cls;
  check('a liner calls for help the moment a pirate comes for her (a freighter dressed as one)', lv2 && lv2.callSent);
}
fresh();
G = game();
var fp = npc('pirate', 'pb0', V.add(st0.pos, { x: 600, y: 0, z: 0 }));
var fv = A.startRobbery(sys, G, fp, st0, T, hooks());
check('...a freighter waits until he hails her', fv && !fv.callSent);

console.log('--- your own "heave to" ---');
fresh();
G = game();
var yv = npc('trader', star.factionId, V.add(G.ship.pos, { x: 5, y: 0, z: 0 }), { cls: 'freighter', manifest: [] });
var base = Combat.surrenderBase(yv);
make(G, yv, { nerve: 0.5, heat: 0.5 }, { fear: 0, anger: 0 });
check('a calm crew answers exactly as the old table did', Math.abs(AI.strikeFactor(G, sys, yv, T) - 1) < 1e-9);
var calm = Combat.surrenderOdds(sys, G, yv);
yv._ai.fear = 0.8; yv._ai.at = G.t;
var scared = Combat.surrenderOdds(sys, G, yv);
yv._ai.fear = 0.1; yv._ai.anger = 0.9; yv._ai.at = G.t;
var angry = Combat.surrenderOdds(sys, G, yv);
check('a frightened crew strikes to you sooner, an angered one hardly at all', scared > calm && angry < calm,
      'calm ' + calm.toFixed(2) + ', frightened ' + scared.toFixed(2) + ', angered ' + angry.toFixed(2));
var lz = npc('trader', star.factionId, G.ship.pos, Object.assign({ manifest: [] }, LINER));
check('a liner\'s crew is the likeliest of all to strike', Combat.surrenderBase(lz) === 0.9 && Combat.surrenderBase(lz) > base);

console.log('--- the same meeting, twice ---');
function meet() {
  fresh();
  var G2 = game();
  var p = npc('pirate', 'pb0', V.add(st0.pos, { x: 8, y: 0, z: 0 }));
  var v = A.startRobbery(sys, G2, p, st0, T, hooks());
  p.live.pos = V.add(v.live.pos, { x: 8, y: 0, z: 0 }); p.live.vel = V.clone(v.live.vel);
  A.update(sys, G2, T + 1, 1, hooks());
  return (v.robbed ? 'comply' : v.dumped ? 'dump' : v.target === p ? 'fight' : v.refused ? 'flee' : '?') + '|' + JSON.stringify(v._choice && v._choice.scores);
}
nId = 5000; var a1 = meet();
nId = 5000; var a2 = meet();
check('the same seed and the same meeting give the same answer', a1 === a2, a1.split('|')[0]);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
