/* crookedlaw.test.js - ship AI slice 4: the crooked law (2026-11-22).
 *
 *     node test/crookedlaw.test.js
 *
 * claude/ship-ai-profiles.md section 3 and section 7 item 4. Astra's calls:
 * a shakedown is "pay, refuse or report"; a crooked cop shakes down you,
 * NPC traders, and (rarely) the Syndicate's own runners.
 *
 * Pinned here:
 *  - the envelope is HER: a bent inspector unwatched takes a quiet word,
 *    an honest one never does, a bent one under a colleague's eye writes
 *    it up;
 *  - in a bought system a bent inspector alone with you wants a fee even
 *    for a clean hold; not with a witness, not in a system that is not
 *    bought, never an honest one;
 *  - pay: she waves you on, the money is gone, the system is a little
 *    more bought; refuse: a full search, and a citation if she finds
 *    nothing; silence is refusal; report: upheld, she is recalled and stays
 *    off the lanes; not upheld, you are marked and searched;
 *  - NPC traders: shaken down, once in a while, and the dock knows her;
 *    the straight cop runs the Syndicate's runner down; a greedy bent one
 *    leans on the runner and the mob answers.
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
var T = 4e6;
var sys = null, star = null;
for (var si = 0; si < g.stars.length && !sys; si++) {
  var cand = g.stars[si], f = g.factionById[cand.factionId];
  if (!f || f.outlaw || f.minor || f.pirate) continue;
  var sy = Gen.generateSystem(cand.seed, Galaxy.systemOpts(g, cand));
  sy.starId = cand.id;
  if (!sy.ports || sy.ports.length < 2 || !sy.traffic || sy.traffic.length < 6) continue;
  if (!sy.patrols.some(function (p) { return p.kind === 'police' && !p.outlaw && p.faction !== 'outlaw'; })) continue;
  sys = sy; star = cand;
}
check('a lawful system with police', !!sys, sys && sys.name);
var lawFac = sys.patrols.filter(function (p) { return p.kind === 'police' && p.faction !== 'outlaw'; })[0].faction;

function live(pos) {
  return { pos: V.clone(pos), vel: { x: 0, y: 0, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } };
}
function game() {
  return { seed: 'kawartha', t: T, galaxy: g, here: star, sys: sys, standing: {}, journal: [], distress: [],
           wanted: {}, ledgerLog: [],
           ship: { pos: { x: 1e9, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, cargo: {}, credits: 5000,
                   hullMax: 100, hullHp: 100, fit: {}, docked: null } };
}
/* Cops with known characters: walk ids until the dials say bent / straight
 * at the corruption we set. The dials read the captain off the spec id. */
function findCop(G, wantBent, minProb) {
  for (var i = 0; i < 400; i++) {
    var c = { id: 'cl' + i, name: 'Vigil ' + (100 + i), kind: 'police', cls: 'police', className: 'interceptor',
              faction: lawFac, hullMax: 100, hullHp: 100, shieldHp: 0, shieldMax: 0, accel: 0.0315,
              mode: 'inspect', modeSince: 0, rail: { type: 'lifted' }, live: live({ x: 0, y: 0, z: 0 }) };
    c.live.spec = c;
    var d = AI.dials(G, sys, c);
    if (!d) continue;
    if (wantBent && d.bent) return c;
    if (!wantBent && !d.bent && d.probity >= (minProb || 0)) return c;
  }
  return null;
}
var realRandom = Math.random;
function scene(corruption) {
  sys.corruption = corruption;
  sys.patrols = [];
  sys._ships = null; sys._traffic = null;
  (sys.traffic || []).forEach(function (r) { r.suppressed = false; r.scannedAt = undefined; });
  var G = game();
  G.troublemaker = {}; G.suspended = {}; G.onTheTake = {};
  return G;
}
function place(c, pos) { c.live.pos = V.clone(pos); sys.patrols.push(c); return c; }

/* ---- the envelope ------------------------------------------------------- */
console.log('the envelope is her');
(function () {
  var G = scene(15);                         // clean: no shakedowns, envelopes are hers alone
  var bent = findCop(G, true), honest = findCop(G, false, 0.6);
  check('a bent cop and an honest one, even in a clean system', !!bent && !!honest,
        bent && honest && AI.dials(G, sys, bent).probity.toFixed(2) + ' / ' + AI.dials(G, sys, honest).probity.toFixed(2));
  Math.random = function () { return 0; };   // she searches
  place(bent, G.ship.pos);
  G.ship.cargo = { narcotics: 10 };
  var h = hooks(), r = Combat.resolveScan(G, bent, h);
  check('bent and unwatched, she takes a quiet word', r.bribed === true && G.ship.cargo.narcotics === 10, h.said.join(' | '));
  sys.patrols = [];
  place(honest, G.ship.pos);
  G.ship.cargo = { narcotics: 10 }; G.ship.credits = 5000;
  r = Combat.resolveScan(G, honest, hooks());
  check('honest, she writes it up', r.contraband && !r.bribed && !G.ship.cargo.narcotics, r.fine + ' cr');
  sys.patrols = [];
  place(bent, G.ship.pos);
  place(honest, V.add(G.ship.pos, { x: 5000, y: 0, z: 0 }));
  G.ship.cargo = { narcotics: 10 };
  r = Combat.resolveScan(G, bent, hooks());
  check('bent with a colleague in sight, she writes it up too', r.contraband && !r.bribed);
  Math.random = realRandom;
})();

/* ---- the shakedown ------------------------------------------------------ */
console.log('the shakedown');
var BOUGHT = 80;
(function () {
  var G = scene(BOUGHT);
  var bent = findCop(G, true), honest = findCop(G, false, 0.5);
  check('in a bought system, a bent cop and one still straight', !!bent && !!honest);
  place(bent, G.ship.pos);
  var h = hooks(), r = Combat.resolveScan(G, bent, h);
  check('alone with you, she wants a fee for a clean hold', r.shakedown && G.shakedown && G.shakedown.fee >= 80,
        G.shakedown && G.shakedown.fee + ' cr');
  check('and asks for it', saidAny(h, /Inspection fee/), h.said[0]);
  var fee = G.shakedown.fee, cr0 = G.ship.credits, corr0 = Combat.systemCorruption(G, sys);
  var pay = Combat.answerShakedown(G, 'pay', hooks());
  check('pay: the money is gone and she waves you on', pay.paid === fee && G.ship.credits === cr0 - fee && !G.shakedown);
  check('and the place is a little more bought', Combat.systemCorruption(G, sys) > corr0,
        corr0 + ' -> ' + Combat.systemCorruption(G, sys));
  check('and the dock can know her', Object.keys(G.onTheTake).length === 1);

  /* Refuse: by the book, and a citation for a clean hold. */
  G = scene(BOUGHT); place(bent, G.ship.pos);
  Combat.resolveScan(G, bent, hooks());
  var w0 = G.wanted[lawFac] || 0;
  var ref = Combat.answerShakedown(G, 'refuse', hooks());
  check('refuse: she searches properly and cites you anyway', ref.searched && ref.cited > 0 && G.wanted[lawFac] === w0 + ref.cited,
        ref.cited + ' cr');
  /* With contraband aboard, refusing is a full search with no envelope. */
  G = scene(BOUGHT); place(bent, G.ship.pos);
  G.ship.cargo = { narcotics: 8 };
  Combat.resolveScan(G, bent, hooks());
  ref = Combat.answerShakedown(G, 'refuse', hooks());
  check('refuse with contraband aboard: found, fined, no quiet word', ref.contraband && !ref.bribed && !G.ship.cargo.narcotics);
  /* Silence. */
  G = scene(BOUGHT); place(bent, G.ship.pos);
  Combat.resolveScan(G, bent, hooks());
  G.t = G.shakedown.until + 1;
  var hs = hooks();
  Combat.tickShakedown(G, hs);
  check('silence is a no', !G.shakedown && saidAny(hs, /silence as a no/), hs.said.join(' | '));
  /* Not with a witness; not an honest cop; not in a system that is not bought. */
  G = scene(BOUGHT); place(bent, G.ship.pos); place(honest, V.add(G.ship.pos, { x: 8000, y: 0, z: 0 }));
  Math.random = function () { return 0.999; };
  r = Combat.resolveScan(G, bent, hooks());
  check('not with another patrol in sight', !r.shakedown && !G.shakedown);
  G = scene(BOUGHT); place(honest, G.ship.pos);
  r = Combat.resolveScan(G, honest, hooks());
  check('never an honest cop', !r.shakedown);
  G = scene(45); var bent45 = findCop(G, true); place(bent45, G.ship.pos);
  r = Combat.resolveScan(G, bent45, hooks());
  check('not in a system that is only bribeable', !r.shakedown);
  Math.random = realRandom;
})();

/* ---- reporting her -------------------------------------------------------- */
console.log('reporting her');
(function () {
  /* Walk the hour until we have seen it upheld and not. */
  var upheld = null, refused = null;
  for (var hr = 0; hr < 200 && !(upheld && refused); hr++) {
    var G = scene(BOUGHT);
    G.t = T + hr * 3600;
    var bent = findCop(G, true), honest = findCop(G, false, 0.5);
    place(bent, G.ship.pos);
    place(honest, V.add(G.ship.pos, { x: 9e5, y: 0, z: 0 }));   // in the system, not in sight
    Combat.resolveScan(G, bent, hooks());
    if (!G.shakedown) continue;
    var h = hooks(), r = Combat.answerShakedown(G, 'report', h);
    if (r.upheld && !upheld) upheld = { G: G, bent: bent, r: r, h: h };
    if (!r.upheld && !refused) refused = { G: G, bent: bent, r: r, h: h };
  }
  check('a report can be upheld', !!upheld, upheld && upheld.h.said.join(' | '));
  if (upheld) {
    check('and she is recalled', upheld.bent.dead && !!upheld.G.suspended[star.id + '|' + upheld.bent.id]);
    /* Back in the system tomorrow: she is still gone. */
    var again = Gen.generateSystem(star.seed, Galaxy.systemOpts(g, star));
    var copId = again.patrols.filter(function (p) { return p.kind === 'police'; })[0].id;
    upheld.G.suspended[star.id + '|' + copId] = { name: 'x', at: upheld.G.t };
    var n0 = again.patrols.length;
    Combat.applySuspensions(upheld.G, again, star.id);
    check('and stays off the lanes when you come back', again.patrols.length === n0 - 1 &&
          !again.patrols.some(function (p) { return p.id === copId; }));
    upheld.G.t += Combat.SUSPENDED_S + 1;
    var again2 = Gen.generateSystem(star.seed, Galaxy.systemOpts(g, star));
    Combat.applySuspensions(upheld.G, again2, star.id);
    check('for a month', again2.patrols.some(function (p) { return p.id === copId; }));
  }
  check('a report can go nowhere', !!refused, refused && refused.h.said.join(' | '));
  if (refused) {
    check('and marks you', !!refused.G.troublemaker[star.id]);
    /* Marked: the next bent cop searches you every time. */
    sys.patrols = [];
    sys.corruption = 45;                        // so she does not just ask for a fee again
    var c2 = findCop(refused.G, true);          // bent at THIS corruption
    place(c2, refused.G.ship.pos);
    refused.G.shakedown = null;
    var searched = 0;
    Math.random = function () { return 0.999; };
    for (var i = 0; i < 5; i++) { var rr = Combat.resolveScan(refused.G, c2, hooks()); if (rr.searched) searched++; }
    Math.random = realRandom;
    check('and the bent ones search you every time', searched === 5, searched + '/5');
  }
})();

/* ---- the lanes ------------------------------------------------------------ */
console.log('on the lanes');
(function () {
  var G = scene(BOUGHT);
  var realPN = Sim.policeNearby;
  /* A laden trader in cruise, and a bent cop beside her. */
  var st = Sim.trafficAll(sys, T).filter(function (s) {
    return s.phase === 'cruise' && !s.route.runner && s.manifest && s.manifest.length;
  })[0];
  check('a laden trader in cruise', !!st, st && st.route.name);
  var bent = findCop(G, true);
  place(bent, V.add(st.pos, { x: 50, y: 0, z: 0 }));
  bent.scanAt = 0; bent.target = null;
  G.ship.pos = V.add(st.pos, { x: 2000, y: 0, z: 0 });
  st.route.scannedAt = undefined;
  var h = hooks();
  A.update(sys, G, T, 1, h);
  var v = sys.patrols.filter(function (p) { return p.liftedFrom === st.route; })[0];
  check('a bent cop shakes down a trader', !!(v && v.shakenBy && v.shakenBy.cop === bent.id), h.said.join(' | '));
  check('and it is seen', saidAny(h, /"inspection"/));
  check('and the dock can know her', !!G.onTheTake[star.id + '|' + bent.id]);
  /* Not again for a while. */
  var n1 = G.onTheTake[star.id + '|' + bent.id].n;
  bent.scanAt = 0;
  (sys.traffic || []).forEach(function (r) { r.scannedAt = undefined; });
  A.update(sys, G, T + 30, 1, hooks());
  check('one at a time', G.onTheTake[star.id + '|' + bent.id].n === n1);

  /* The runner: a straight cop in a system that is not bought runs her down. */
  G = scene(30);
  var rs = Sim.trafficAll(sys, T).filter(function (s) { return s.phase === 'cruise' && s.route !== st.route; })[0];
  var wasR = rs.route.runner, wasF = rs.route.flag;
  rs.route.runner = true; rs.route.flag = 'outlaw';
  try {
    var straight = findCop(G, false, 0.7);
    check('a straight cop', !!straight, straight && AI.dials(G, sys, straight).probity.toFixed(2));
    place(straight, V.add(rs.pos, { x: 50, y: 0, z: 0 }));
    straight.scanAt = 0; rs.route.scannedAt = undefined;
    G.ship.pos = V.add(rs.pos, { x: 2000, y: 0, z: 0 });
    var h2 = hooks();
    A.update(sys, G, T, 1, h2);
    check('runs the Syndicate runner down', !!(straight.target && straight.target.liftedFrom === rs.route &&
          straight.pursuing === 'runner'), h2.said.join(' | '));
    check('and says why', saidAny(h2, /Your friends do not pay me/));
    /* A greedy bent cop in a bought system leans on the runner instead. */
    G = scene(BOUGHT);
    var greedy = null;
    for (var i = 0; i < 600 && !greedy; i++) {
      var c = { id: 'gr' + i, name: 'Picket ' + i, kind: 'police', cls: 'police', className: 'interceptor', faction: lawFac,
                hullMax: 100, hullHp: 100, shieldHp: 0, shieldMax: 0, accel: 0.0315, mode: 'inspect', modeSince: 0,
                rail: { type: 'lifted' }, live: live({ x: 0, y: 0, z: 0 }) };
      c.live.spec = c;
      var d = AI.dials(G, sys, c);
      if (d && d.bent && d.greed >= A.MOB_GREED) greedy = c;
    }
    check('a greedy bent cop', !!greedy);
    if (greedy) {
      place(greedy, V.add(rs.pos, { x: 50, y: 0, z: 0 }));
      greedy.scanAt = 0; rs.route.scannedAt = undefined;
      var h3 = hooks();
      G.ship.pos = V.add(rs.pos, { x: 2000, y: 0, z: 0 });
      A.update(sys, G, T, 1, h3);
      check('leans on the runner, and the mob will hear', saidAny(h3, /Syndicate runner .* the mob will hear/), h3.said.join(' | '));
      var e = G.onTheTake[star.id + '|' + greedy.id];
      check('the dock knows that too', !!(e && e.mob));
    }
  } finally { rs.route.runner = wasR; rs.route.flag = wasF; Sim.policeNearby = realPN; }
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
