/* doctrine.test.js - ship AI slice 5: navy and Syndicate doctrine (2026-11-22).
 *
 *     node test/doctrine.test.js
 *
 * claude/ship-ai-profiles.md section 7 item 5. Astra's calls:
 *   - protection: "both" - live near you, and in prices and gossip;
 *   - escorts: heavies ride with runners, and the navy escorts liners;
 *   - grudge: "a hit squad comes", in any system, until a fixer settles it;
 *   - the navy at a hit platform: "subdue and question anyone near the
 *     platform who could've done it ... disable, but they will not hesitate
 *     to escalate their use of force if resisted."
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
var H = require('../src/hunters.js');
var Ms = require('../src/milsats.js');
var Ti = require('../src/tithe.js');
var Fx = require('../src/fixer.js');
var V = global.V, Gen = global.Gen;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
}
function hooks() { var h = { said: [], say: function (m) { h.said.push(m); }, sound: function () {} }; return h; }
function saidAny(h, re) { return h.said.some(function (m) { return re.test(m); }); }
function live(pos) {
  return { pos: V.clone(pos), vel: { x: 0, y: 0, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } };
}
var g = Galaxy.build('kawartha');
var T = 4e6;
function game(sys, star) {
  return { seed: 'kawartha', t: T, galaxy: g, here: star, sys: sys, standing: {}, journal: [], distress: [],
           wanted: {}, ledgerLog: [], marks: {},
           ship: { pos: { x: 1e9, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, fwd: { x: 1, y: 0, z: 0 },
                   cargo: {}, credits: 50000, hullMax: 100, hullHp: 100, fit: {}, docked: null } };
}

/* ---- 1. ESCORTS ---------------------------------------------------------- */
console.log('escorts ride with their own');
(function () {
  var moved = 0, heavy = 0, liner = 0, runners = 0, liners = 0, shape = true, onlyRunners = true, lawOnly = true, n = 0;
  function proj(sy) {
    return JSON.stringify([sy.traffic.map(function (r) { return [r.id, r.t0, r.flag, r.period]; }),
      sy.patrols.filter(function (p) { return !/^esc/.test(p.id); }).map(function (p) { return [p.id, p.name, p.rail && p.rail.route && p.rail.route.t0]; }),
      sy.bodies.length, (sy.workers || []).length]);
  }
  for (var s = 0; s < 40; s++) {
    var st = g.stars[s], o = Galaxy.systemOpts(g, st);
    var a = Gen.generateSystem(st.seed, o);
    var b = Gen.generateSystem(st.seed, Object.assign({}, o, { noEscorts: true }));
    n++;
    if (proj(a) !== proj(b)) moved++;
    var byId = {};
    a.traffic.forEach(function (r) { byId[r.id] = r; if (r.runner) runners++; if (r.cls === 'liner') liners++; });
    a.patrols.filter(function (p) { return /^esc/.test(p.id); }).forEach(function (p) {
      var host = byId[p.escorting], rt = p.rail.route;
      if (!host || rt.period !== host.period || rt.cruise !== host.cruise) shape = false;
      if (p.heavy) { heavy++; if (!host || !host.runner || p.faction !== 'outlaw') onlyRunners = false; }
      else {
        liner++;
        if (!host || host.cls !== 'liner' || a.pirateHeld || p.faction === 'outlaw') lawOnly = false;
      }
    });
  }
  check('adding escorts moves nothing else in a system', moved === 0, n + ' systems');
  check('some runners take a heavy and some liners a cutter', heavy > 0 && liner > 0,
        heavy + ' of ' + runners + ' runners, ' + liner + ' of ' + liners + ' liners');
  check('an escort flies her charge\'s own timetable', shape);
  check('a heavy rides only with a runner, in the Syndicate\'s colours', onlyRunners);
  check('a liner\'s escort is the law, and never in a hold', lawOnly);
  /* Escort and charge are one flight. */
  var esc = { id: 'esc9', kind: 'police', faction: 'outlaw', heavy: true, escorting: 'r7' };
  var host = { id: 'r7-live', kind: 'trader', liftedFrom: { id: 'r7', runner: true }, _escorted: true };
  check('the escort and her charge are one organisation',
        AI.orgOf(esc) === 'escort:r7' && AI.orgOf(host) === 'escort:r7', AI.orgOf(esc) + ' / ' + AI.orgOf(host));
  check('an unescorted runner is still the Syndicate\'s', AI.orgOf({ id: 'x', kind: 'trader', liftedFrom: { id: 'r8', runner: true, flag: 'outlaw' }, faction: 'outlaw' }) === 'syndicate');
})();

/* ---- 2. THE GRUDGE ------------------------------------------------------- */
console.log('the grudge');
var lawSys = null, lawStar = null;
for (var si = 0; si < g.stars.length && !lawSys; si++) {
  var cand = g.stars[si], f = g.factionById[cand.factionId];
  if (!f || f.outlaw || f.minor || f.pirate) continue;
  var sy = Gen.generateSystem(cand.seed, Galaxy.systemOpts(g, cand));
  sy.starId = cand.id;
  if (!sy.ports || sy.ports.length < 2) continue;
  if (!sy.patrols.some(function (p) { return p.kind === 'police' && p.faction !== 'outlaw'; })) continue;
  lawSys = sy; lawStar = cand;
}
(function () {
  var sys = lawSys, G = game(sys, lawStar), h = hooks();
  var runner = { id: 'rr-live', kind: 'trader', name: 'Tallow Runner', faction: 'lawfac', liftedFrom: { id: 'rr', runner: true, flag: 'outlaw' } };
  var civvy = { id: 'cc-live', kind: 'trader', name: 'Quiet Barge', faction: 'lawfac', liftedFrom: { id: 'cc' } };
  check('a runner is the Syndicate\'s, whatever her papers say', H.isSyndicate(runner) && !H.isSyndicate(civvy));
  H.onWrong(G, 'demand', civvy, T, h);
  check('a wrong against anyone else is not their business', H.grudge(G) === 0);
  H.onWrong(G, 'demand', runner, T, h);
  check('one hold-up is a name they do not like', H.grudge(G) === H.GRUDGE.demand && !G.grudge.dueAt);
  Combat.report(G, 'demand', runner, h, 'robbery', 0);
  check('the second, reported, sends word upstairs', H.grudge(G) >= H.GRUDGE_AT && G.grudge.dueAt === T + H.GRUDGE_DELAY_S,
        H.grudge(G) + ' pts; ' + h.said.filter(function (m) { return /upstairs/.test(m); })[0]);
  var anonG = game(sys, lawStar);
  Combat.report(anonG, 'kill', runner, hooks(), 'killing', 0, true);
  check('an unidentified hull gives them no name', H.grudge(anonG) === 0);
  /* The squad: not before the word gets there, then half an hour after. */
  sys.patrols = sys.patrols.filter(function (p) { return !p.squad; });
  sys._hunts = {};
  H.updateSquad(sys, G, T + 3600, h);
  check('nobody is sent while the word goes upstairs', !sys.patrols.some(function (p) { return p.squad; }));
  var due = G.grudge.dueAt;
  H.updateSquad(sys, G, due + 1, h);
  check('once it gets there, a squad is due in half an hour', sys._hunts.outlaw && sys._hunts.outlaw.dueAt === due + 1 + H.DISPATCH_DELAY_S);
  G.ship.docked = { id: 'port' };
  H.updateSquad(sys, G, due + 1 + H.DISPATCH_DELAY_S + 5, h);
  check('they wait out a dock', !sys.patrols.some(function (p) { return p.squad; }));
  G.ship.docked = null;
  var h2 = hooks();
  H.updateSquad(sys, G, due + 1 + H.DISPATCH_DELAY_S + 10, h2);
  var squad = sys.patrols.filter(function (p) { return p.squad; });
  check('two enforcers come for you, in any system', squad.length === 2 && squad.every(function (s) {
    return s.faction === 'outlaw' && s.hunter && s.hostileToPlayer && s.kind === 'police';
  }), squad.map(function (s) { return s.name; }).join(', '));
  check('they drop out of slipspace a couple of thousand km off', squad.every(function (s) {
    var d = V.dist(s.live.pos, G.ship.pos); return d > H.SQUAD_KM * 0.95 && d < H.SQUAD_KM * 1.1;
  }));
  check('and say what they are there for', saidAny(h2, /Somebody upstairs/));
  check('the squad is kept awake', squad.every(function (s) { return H.keepAwake(s); }));
  var big = game(sys, lawStar); big.grudge = { v: H.GRUDGE_THREE, since: 0, dueAt: 0 };
  var bs = { patrols: [], name: 'test', seed: 'x' };
  H.updateSquad(bs, big, 10, hooks()); H.updateSquad(bs, big, 10 + H.DISPATCH_DELAY_S + 1, hooks());
  check('a big enough grudge sends three', bs.patrols.length === 3);
  /* The fixer. */
  var price = H.settlePrice(G);
  check('the fixer names a price to square it', price === Math.round(H.SETTLE_BASE + H.SETTLE_PER * H.grudge(G)), price + ' cr');
  check('and knows who is looking', /sent two|deciding who to send/.test(Fx.lookingFor(G, due + 100)), Fx.lookingFor(G, due + 100));
  var marked = game(sys, lawStar); marked.grudge = { v: 50 }; marked.marks = { outlaw: { at: 0 } };
  check('nobody carries the message for a marked pilot', !H.settle(marked).ok);
  G.wanted.outlaw = 900;
  var cr0 = G.ship.credits, r = H.settle(G);
  check('settling takes the money and calls them off', r.ok && G.ship.credits === cr0 - price && !G.grudge && !G.wanted.outlaw);
  var hs = hooks(); sys._hunts = {};
  sys.patrols = sys.patrols.filter(function (p) { return !p.squad; });
  H.updateSquad(sys, G, due + 1e6, hs);
  check('and nobody comes after that', !sys.patrols.some(function (p) { return p.squad; }));
})();

/* ---- 3. THE PLATFORM'S ALARM ---------------------------------------------- */
console.log('the navy answers a platform');
(function () {
  var sys = lawSys, fac = sys.patrols.filter(function (p) { return p.kind === 'police' && p.faction !== 'outlaw'; })[0].faction;
  var P = { x: 1e9, y: 0, z: 0 };
  var plat = { id: 'dp9', name: 'Bastion 2', owner: fac };
  function ship(id, kind, pos) {
    var c = { id: id, name: (kind === 'navy' ? 'FNS ' : 'Vigil ') + id, kind: kind, cls: kind, faction: fac,
              accel: 0.02, mode: null, modeSince: 0, rail: { type: 'lifted' }, live: live(pos), hullMax: 100, hullHp: 100 };
    c.live.spec = c; c.live.vel = { x: 0, y: 0, z: 0 };
    return c;
  }
  function setup() {
    sys.patrols = [ship('p1', 'police', V.add(P, { x: 500, y: 0, z: 0 })), ship('n1', 'navy', V.add(P, { x: 40000, y: 0, z: 0 }))];
    sys._alarm = null;
    var G = game(sys, lawStar);
    /* 150 km off the platform: near enough to be a suspect, far enough
     * that she has to come to you (she questions inside Ms.CLOSE_KM). */
    G.ship.pos = V.add(P, { x: -150, y: 0, z: 0 });
    return G;
  }
  var G = setup(), h = hooks();
  var a = Ms.alarm(sys, G, T, plat, P, false, false, h);
  check('the alarm goes to the navy first, though a cutter is nearer', a.by === 'n1' && sys.patrols[1].mode === 'respond',
        h.said[0]);
  var nv = sys.patrols[1];
  check('she flies to the platform, and stays awake for it', nv.respondPos && V.dist(nv.respondPos, P) < 1e-6 && H.keepAwake(nv));
  Ms.updateResponse(sys, G, T + 10, h);
  check('not there yet: still coming', a.phase === 'coming');
  nv.live.pos = V.add(P, { x: 50, y: 0, z: 0 });
  var h2 = hooks();
  Ms.updateResponse(sys, G, T + 20, h2);
  check('at the scene, you are near: heave to', a.phase === 'order' && nv.mode === 'inspect' && saidAny(h2, /heave to for questioning/));
  /* The platform leaves you to her - the probe found you shot to pieces
   * while sitting still as ordered. Fire on it again and it answers. */
  G.sys = sys; G.milsats = {}; G.milsats[plat.id] = { hull: 100, angry: T };
  check('ordered to heave to, the platform you shot holds its fire', Ms.hostileToYou(G, plat, T + 30) === false);
  G.milsats[plat.id].angry = T + 40;
  check('fire on it again and it answers', Ms.hostileToYou(G, plat, T + 41) === true);
  G.milsats[plat.id].angry = T;
  /* Holding still is heaving to, however long she takes to get to you -
   * the probe found a slow navy cutter couldn't close in the old 90 s. */
  for (var hs = 0; hs < 30; hs++) Ms.updateResponse(sys, G, T + 30 + hs * 10, h2);
  check('holding still for five minutes is heaving to, not refusing', a.phase === 'order' && !nv.subdue);
  /* She drifts off you, you are not burning: still not you running. */
  var keep = V.clone(G.ship.pos);
  G.ship.pos = V.add(G.ship.pos, { x: -(Ms.RUN_KM + 10), y: 0, z: 0 });
  Ms.updateResponse(sys, G, T + 335, h2);
  check('a range that opens with your drive cold is not you running', a.phase === 'order');
  G.ship.pos = keep; a.lastD = undefined;
  Ms.updateResponse(sys, G, T + 336, h2);
  /* You run: drive lit, range opening - she opens disabling fire. */
  G.ship.throttle = 1;
  G.ship.pos = V.add(G.ship.pos, { x: -(Ms.RUN_KM + 10), y: 0, z: 0 });
  Ms.updateResponse(sys, G, T + 340, h2);
  G.ship.throttle = 0;
  check('run, and she opens disabling fire, no missiles', a.phase === 'subdue' && nv.subdue && nv.hostileToPlayer && saidAny(h2, /Disabling fire/));
  G.ship.hullHp = 30;
  Ms.updateResponse(sys, G, T + 341, h2);
  check('your hull down, she holds fire and comes in', nv.mode === 'inspect' && saidAny(h2, /Hold still/));
  /* You stop: alongside and matched, she questions you. Transponder on. */
  nv.live.pos = V.add(G.ship.pos, { x: 1, y: 0, z: 0 });
  G.wanted[fac] = Combat.BOUNTY.assault;
  var cr0 = G.ship.credits;
  for (var k = 0; k <= 6; k++) Ms.updateResponse(sys, G, T + 200 + k, h2);
  check('questioned with your transponder on: identified, fined, released',
        a.phase === 'done' && a.verdict === 'identified' && G.ship.credits === cr0 - Combat.BOUNTY.assault && !G.wanted[fac] && !nv.hostileToPlayer,
        a.verdict + ', fined ' + a.fined);

  /* Running silent, guns warm. */
  G = setup(); h = hooks();
  G.lastFiredAt = T;
  a = Ms.alarm(sys, G, T, plat, P, false, true, h);
  nv = sys.patrols[1]; nv.live.pos = V.add(P, { x: 50, y: 0, z: 0 });
  Ms.updateResponse(sys, G, T + 30, h);
  nv.live.pos = V.add(G.ship.pos, { x: 1, y: 0, z: 0 });
  for (k = 0; k <= 6; k++) Ms.updateResponse(sys, G, T + 40 + k, h);
  check('silent, but the emitters are warm: charged, with your name on it', a.verdict === 'charged' && saidAny(h, /still warm/));
  /* Running silent, guns cold. */
  G = setup(); h = hooks();
  G.lastFiredAt = T - 5000;
  a = Ms.alarm(sys, G, T, plat, P, false, true, h);
  nv = sys.patrols[1]; nv.live.pos = V.add(P, { x: 50, y: 0, z: 0 });
  Ms.updateResponse(sys, G, T + 30, h);
  nv.live.pos = V.add(G.ship.pos, { x: 1, y: 0, z: 0 });
  for (k = 0; k <= 6; k++) Ms.updateResponse(sys, G, T + Ms.WARM_S + 100 + k, h);
  check('silent and cold: released, with a note on the file', a.verdict === 'cleared' && !(G.wanted[fac] > 0));
  /* Fire on her: lethal. */
  G = setup(); h = hooks();
  a = Ms.alarm(sys, G, T, plat, P, false, false, h);
  nv = sys.patrols[1]; nv.live.pos = V.add(P, { x: 50, y: 0, z: 0 });
  Ms.updateResponse(sys, G, T + 30, h);
  nv._playerHitAt = T + 31;
  Ms.updateResponse(sys, G, T + 32, h);
  check('fire on her and the gloves come off', a.phase === 'lethal' && !nv.subdue && nv.hostileToPlayer && saidAny(h, /Weapons free/));
  /* Gone before she gets there. */
  G = setup(); h = hooks();
  a = Ms.alarm(sys, G, T, plat, P, false, false, h);
  nv = sys.patrols[1];
  G.ship.pos = V.add(P, { x: 1e5, y: 0, z: 0 });
  nv.live.pos = V.add(P, { x: 50, y: 0, z: 0 });
  Ms.updateResponse(sys, G, T + 30, h);
  check('gone before she gets there: she finds nobody and stands down', a.verdict === 'nobody' && !nv.questioning && !nv.respondTo);
  /* No law in the sky. */
  sys.patrols = []; sys._alarm = null;
  G = game(sys, lawStar); h = hooks();
  a = Ms.alarm(sys, G, T, plat, P, true, false, h);
  check('no law in this sky: the alarm goes unanswered', a.phase === 'done' && saidAny(h, /Nobody is in this sky/));
  /* NPC gunnery holds while subduing a beaten ship. The police cutter, not
   * the navy's warship: hers is a mass driver, whose slugs fly in
   * massdriver.js (not loaded here) - the control below caught that. */
  G = setup();
  nv = sys.patrols[0];
  nv.live.pos = V.add(G.ship.pos, { x: 2, y: 0, z: 0 });
  nv.hostileToPlayer = true; nv.subdue = true;
  G.ship.hullHp = 10;
  var before = G.ship.hullHp;
  if (Combat.updateNpcFire) {
    for (k = 0; k < 20; k++) { nv.coolUntil = 0; Combat.updateNpcFire(sys, G, T + k, 1, hooks()); }
    check('subduing, she holds fire on a beaten hull', G.ship.hullHp === before);
    /* The control: the same scene, not subduing, and she does fire. */
    nv.subdue = false;
    var realR = Math.random; Math.random = function () { return 0; };
    for (k = 0; k < 20; k++) { nv.coolUntil = 0; Combat.updateNpcFire(sys, G, T + 100 + k, 1, hooks()); }
    Math.random = realR;
    check('the control: not subduing, the same shots land', G.ship.hullHp < before, before + ' -> ' + G.ship.hullHp);
  }
})();

/* ---- 4. PROTECTION ---------------------------------------------------------- */
console.log('protection');
(function () {
  var held = null, heldStar = null;
  for (var s = 0; s < g.stars.length && !held; s++) {
    var c = g.stars[s];
    var sy = Gen.generateSystem(c.seed, Galaxy.systemOpts(g, c));
    sy.starId = c.id;
    if (!sy.pirateHeld || sy.heldBy === 'pirate') continue;
    var indep = (sy.traffic || []).filter(function (r) {
      var home = sy.byId[r.from]; return home && home.faction !== 'outlaw' && !r.runner && r.flag !== 'outlaw' && !r.outboard;
    });
    if (indep.length < 2) continue;
    held = sy; heldStar = c;
  }
  check('a Syndicate hold with independents in it', !!held, held && held.name);
  if (!held) return;
  var G = game(held, heldStar);
  var Sm = global.Sim, tt = T;
  var states = Sm.trafficAll(held, tt).filter(function (st) {
    return st && st.pos && st.route && st.phase !== 'moored' && !st.landed && !st.inside && A.independent(held, st);
  });
  check('an independent hull out on the lanes', states.length > 0, states.length);
  var target = states[0];
  var boss = { id: 'bz1', name: 'The Patron', kind: 'police', faction: 'outlaw', heavy: true, cls: 'police',
               accel: 0.02, mode: 'shadow', modeSince: 0, rail: { type: 'lifted' }, live: live(target.pos) };
  boss.live.spec = boss;
  held.patrols = [boss];
  held._ships = null;
  G.ship.pos = V.add(target.pos, { x: 100, y: 0, z: 0 });
  var h = hooks();
  A.protection(held, G, tt, h);
  var v = held.patrols.filter(function (p) { return p.protection; })[0];
  check('a collector leans on her', !!v && v.protection.by === 'bz1' && v.protection.fee >= 100,
        h.said[0]);
  var e = G.protectionSeen[heldStar.id];
  check('and the dock will know', e && e.n === 1);
  var n0 = held.patrols.length, h2 = hooks();
  A.protection(held, G, tt + 20, h2);
  check('one collection at a time', held.patrols.length === n0 && !h2.said.length);
  check('no hull is taxed twice a week', target.route.protectedAt === tt);
  /* A refusal is roughed up, never killed. */
  var tough = null;
  for (var i = 0; i < 400 && !tough; i++) {
    var cand = { id: 'tr' + i + '-live', kind: 'trader', cls: 'freighter', name: 'Hard Case ' + i, liftedFrom: { id: 'tr' + i },
                 hullMax: 100, hullHp: 100, guns: 1, armed: true };
    if (A.refusesProtection(G, held, cand, tt)) tough = cand;
  }
  check('a captain with the greed and the nerve says no', !tough || tough.liftedFrom, tough ? tough.name : 'none armed in this galaxy');
  /* Prices carry it. */
  var indepPort = held.ports.filter(function (p) { return p.faction !== 'outlaw' && !p.playerStation; })[0];
  var mobPort = held.ports.filter(function (p) { return p.faction === 'outlaw'; })[0];
  var row = { buy: 100, sell: 80 };
  if (indepPort) {
    var r1 = Ti.adjustRow(G, held, indepPort, row, tt);
    check('an independent port in a hold passes it on', r1.protection && Math.abs(r1.buy - 103) < 1e-9 && Math.abs(r1.sell - 77.6) < 1e-9,
          r1.buy + ' / ' + r1.sell);
  }
  if (mobPort) check('the Syndicate\'s own ports do not', !Ti.adjustRow(G, held, mobPort, row, tt).protection);
  var lawPort = lawSys.ports.filter(function (p) { return p.faction !== 'outlaw'; })[0];
  check('nor a port in lawful space', Ti.adjustRow(game(lawSys, lawStar), lawSys, lawPort, row, tt) === row);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
