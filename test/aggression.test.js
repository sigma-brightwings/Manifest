/* aggression.test.js - who hunts whom (Phase 9, 2026-10-31).
 *
 *     node test/aggression.test.js
 *
 * Astra chose: fights near you plus off-screen raids as news; pirates and
 * smugglers run from the law, which shoots out the drive and arrests;
 * pirates rob the best prey; and all four standing tie-ins. Pinned:
 *  - an NPC flies at her own target, or away from her own threat;
 *  - a pirate picks the laden freighter over a lean armed ship, and the
 *    other way round;
 *  - she calls on her to heave to: a ship that yields is stripped and her
 *    port is short; one that refuses is fired on, with no crime on you;
 *  - a disabled victim is stripped alongside;
 *  - the law runs a pirate down, shoots out her drive, and arrests her;
 *  - a smuggler bolts from a scan; a Syndicate runner is never scanned;
 *  - HOSTILE standing: shot on sight;
 *  - helping a victim or an arrest raises standing; hitting the fugitive
 *    is no crime; getting in the way of an arrest costs you;
 *  - rival empires' patrols skirmish, and the loser withdraws alive;
 *  - off-screen raids: a share of a pirate system's arrivals land light,
 *    the same every time, and it is word on the dock.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/journal.js');
require('../src/missions.js');
require('../src/shiptrade.js');
var Galaxy = require('../src/galaxy.js');
var A = require('../src/aggression.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen, Eco = global.Economy, Ms = global.Missions;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function hooks() { var h = { said: [], say: function (m) { h.said.push(m); }, sound: function () {} }; return h; }
function saidAny(h, re) { return h.said.some(function (m) { return re.test(m); }); }

var g = Galaxy.build('kawartha');
/* A lawful system with traffic in it. */
var star = null, sys = null;
for (var si = 0; si < g.stars.length && !sys; si++) {
  var cand = g.stars[si], f = g.factionById[cand.factionId];
  if (!f || f.outlaw || f.minor || f.pirate) continue;
  var sy = Gen.generateSystem(cand.seed, Galaxy.systemOpts(g, cand));
  sy.starId = cand.id;
  if (!sy.ports || sy.ports.length < 2 || !sy.traffic || sy.traffic.length < 6) continue;
  star = cand; sys = sy;
}
check('a lawful system with traffic', !!sys, sys && (sys.name + ', ' + sys.traffic.length + ' lines'));

var T = 4e6;
/* No police lane in the way of a robbery, for the tests that want one. */
var realPoliceNearby = Sim.policeNearby;
Sim.policeNearby = function () { return null; };

/* A laden freighter in cruise. */
function cruising(t) {
  var list = Sim.trafficAll(sys, t);
  for (var i = 0; i < list.length; i++) {
    var st = list[i];
    if (st.phase === 'cruise' && !st.route.runner && st.manifest && st.manifest.length && A.choosePrey &&
        st.manifest.some(function (m) { return (m.qty || 0) > 0 && Eco.BY_ID[m.cid] && Eco.BY_ID[m.cid].base > 0; })) return st;
  }
  return null;
}
var st0 = cruising(T);
check('a laden freighter in cruise', !!st0, st0 && st0.route.name);

function live(pos, vel) {
  return { pos: V.clone(pos), vel: V.clone(vel || { x: 0, y: 0, z: 0 }), fwd: { x: 1, y: 0, z: 0 },
           up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } };
}
var nId = 0;
function npc(kind, faction, pos, vel, extra) {
  var sp = { id: 'tz' + (nId++), name: kind + '-' + nId, kind: kind, cls: kind === 'pirate' ? 'pirate' : kind,
             faction: faction, hullMax: 100, hullHp: 100, shieldHp: 0, shieldMax: 0, accel: 0.05,
             live: live(pos, vel), mode: kind === 'pirate' ? 'intercept' : 'inspect', modeSince: 0,
             rail: { type: 'lifted' } };
  for (var k in (extra || {})) sp[k] = extra[k];
  sp.live.spec = sp;
  sys.patrols.push(sp);
  return sp;
}
function game() {
  return { seed: 'kawartha', t: T, galaxy: g, here: star, sys: sys, standing: {}, journal: [], distress: [],
           ship: { pos: V.add(st0.pos, { x: 2e5, y: 0, z: 0 }), vel: V.clone(st0.vel), cargo: {}, credits: 100,
                   hullMax: 100, hullHp: 100, fit: {}, docked: null } };
}
var savedPatrols = sys.patrols;
function fresh() { sys.patrols = []; sys._ships = null; sys._traffic = null; (sys.traffic || []).forEach(function (r) { r.suppressed = false; }); }

console.log('who she flies at');
fresh();
var ship0 = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
var a1 = npc('pirate', 'outlaw', { x: 10, y: 0, z: 0 }), b1 = npc('trader', 'x', { x: 20, y: 0, z: 0 });
check('nobody given: you', A.focusOf(a1, ship0) === ship0);
a1.target = b1; a1.mode = 'attack';
check('a target: her', A.focusOf(a1, ship0) === b1.live);
b1.threat = a1; b1.mode = 'breakoff';
check('a threat: away from it', A.focusOf(b1, ship0) === a1.live);
a1.hostileToPlayer = true;
check('turned on you: you', A.focusOf(a1, ship0) === ship0);

console.log('best prey wins');
fresh();
var G = game();
var pir = npc('pirate', 'outlaw', V.add(st0.pos, { x: 300, y: 0, z: 0 }), st0.vel);
var pick = A.choosePrey(sys, G, pir, T);
check('a laden freighter, you far off and empty: her', pick && pick.state && pick.state.route === st0.route, pick && (pick.player ? 'you' : pick.state.route.name));
G.ship.pos = V.add(pir.live.pos, { x: 50, y: 0, z: 0 });
var dear = Eco.CATALOG ? null : null;
Object.keys(Eco.BY_ID).forEach(function (cid) { var c = Eco.BY_ID[cid]; if (!c.waste && c.base > 0 && (!dear || c.base > Eco.BY_ID[dear].base)) dear = cid; });
G.ship.cargo = {}; G.ship.cargo[dear] = 400;
var pick2 = A.choosePrey(sys, G, pir, T);
check('you close, unarmed and full of gold: you', pick2 && pick2.player, pick2 && (pick2.player ? 'you' : pick2.state.route.name));
G.ship.fit = { hardpoint1: 'pulse' }; G.ship.cargo = { grain: 1 };
var pick3 = A.choosePrey(sys, G, pir, T);
check('armed and lean: she takes the freighter', pick3 && !pick3.player, pick3 && (pick3.player ? 'you' : pick3.state.route.name));

console.log('a robbery');
fresh();
G = game();
pir = npc('pirate', 'outlaw', V.add(st0.pos, { x: 300, y: 0, z: 0 }), st0.vel);
var h = hooks();
A.update(sys, G, T, 1, h);
var vic = pir.target;
check('she lifts the freighter off her lane and goes for her', vic && vic.liftedFrom === st0.route && pir.mode === 'chase' && vic.threat === pir,
      vic && vic.name);
check('and the freighter runs from her', vic && A.focusOf(vic, G.ship) === pir.live);
/* Into hailing range. */
pir.live.pos = V.add(vic.live.pos, { x: 8, y: 0, z: 0 }); pir.live.vel = V.clone(vic.live.vel);
var h2 = hooks();
A.update(sys, G, T + 1, 1, h2);
check('she calls on her to heave to: the call goes out', vic.demandedBy === pir.id && G.distress.some(function (c) { return c.victim === vic && c.kind === 'demand'; }));
var yielded = !!pir.loot;
check('she yields or refuses, and the pirate acts on it', yielded ? (vic.robbed && pir.mode === 'breakoff' && pir.threat === vic) : vic.refused,
      yielded ? 'yielded' : 'refused');
/* Both branches, whichever the seed gave. */
fresh();
G = game();
var p2 = npc('pirate', 'outlaw', V.add(st0.pos, { x: 300, y: 0, z: 0 }), st0.vel);
var v2 = A.startRobbery(sys, G, p2, Sim.trafficAll(sys, T).filter(function (s) { return s.route === st0.route; })[0] || st0, T, hooks());
var before = (G.shipTrade && G.shipTrade.shorts || []).length;
var took = A.strip(sys, G, p2, v2, T, hooks());
check('yielding: she gives up 60% of her hold, and the pirate goes to sell it', took.length > 0 && p2.loot && p2.mode === 'breakoff' && v2.robbed,
      JSON.stringify(took));
check('and her port is short of it when she docks', (G.shipTrade && G.shipTrade.shorts || []).length > before);
check('a paid pirate does not look again for a while', (function () { p2.mode = 'intercept'; p2.preyAt = 0; A.update(sys, G, T + 10, 1, hooks()); return !p2.target; })());

fresh();
G = game();
var p3 = npc('pirate', 'outlaw', V.add(st0.pos, { x: 300, y: 0, z: 0 }), st0.vel);
var v3 = A.startRobbery(sys, G, p3, st0, T, hooks());
v3.demandedBy = p3.id; v3.refused = true;
v3.hullMax = 100; v3.hullHp = 100;
var hull0 = v3.hullHp, shots = 0;
for (var i = 0; i < 60; i++) {
  var tt = T + 2 + i * 1.2;
  p3.live.pos = V.add(v3.live.pos, { x: 4, y: 0, z: 0 }); p3.live.vel = V.clone(v3.live.vel);
  A.update(sys, G, tt, 1.2, hooks());
  if (v3.hullHp < hull0) shots++;
  if (v3.disabled || v3.dead) break;
}
check('refusing: she is fired on', v3.hullHp < hull0, hull0 + ' -> ' + Math.round(v3.hullHp));
check('and none of it is your crime', !G.pendingReport && !Object.keys(G.wanted || {}).length && !v3.reported);
check('the call goes out for her', v3.callSent && G.distress.some(function (c) { return c.victim === v3 && c.kind === 'assault'; }));
/* Disabled: stripped alongside. */
if (!v3.disabled && !v3.dead) Combat.disableNpc(sys, G, v3, 'drive', T + 80, hooks(), p3);
A.update(sys, G, T + 81, 1, hooks());
check('her drive out: the pirate comes alongside', (p3.mode === 'chase' && p3.standoffKm < 1) || v3.dead, p3.mode + ' ' + p3.standoffKm);
p3.live.pos = V.add(v3.live.pos || p3.live.pos, { x: 0.5, y: 0, z: 0 });
A.update(sys, G, T + 82, 1, hooks());
A.update(sys, G, T + 82 + A.LOOT_S + 1, 1, hooks());
check('and strips her', v3.dead || (v3.robbed && p3.loot), v3.dead ? 'she died' : JSON.stringify(v3.robbed && v3.robbed.took));

console.log('the law');
fresh();
G = game();
var p4 = npc('pirate', 'outlaw', V.add(st0.pos, { x: 900, y: 0, z: 0 }), st0.vel);
var lawFac = (sys.factions || []).filter(function (f) { return !f.outlaw && !f.pirate; })[0].id;
var cop = npc('police', lawFac, V.add(st0.pos, { x: 0, y: 0, z: 0 }), st0.vel);
var hl = hooks();
A.update(sys, G, T, 1, hl);
check('a cutter sees a pirate and runs her down', cop.target === p4 && cop.pursuing === 'pirate' && p4.fugitive === cop && p4.mode === 'breakoff' && p4.threat === cop);
check('the pirate fires back as she runs', p4.defendTarget === cop);
for (var j = 0; j < 400 && !p4.disabled && !p4.dead; j++) {
  cop.live.pos = V.add(p4.live.pos, { x: 5, y: 0, z: 0 }); cop.live.vel = V.clone(p4.live.vel);
  A.update(sys, G, T + 2 + j, 1, hooks());
}
check('she shoots out the drive, not the crew', p4.disabled && !p4.dead, 'hull ' + Math.round(p4.hullHp));
A.update(sys, G, T + 500, 1, hooks());
check('and comes alongside', cop.mode === 'chase' && cop.standoffKm < 1);
cop.live.pos = V.add(p4.live.pos, { x: 0.4, y: 0, z: 0 });
A.update(sys, G, T + 501, 1, hooks());
G.ship.pos = V.add(cop.live.pos, { x: 100, y: 0, z: 0 });
var ha = hooks();
A.update(sys, G, T + 501 + A.ARREST_S + 1, 1, ha);
check('and arrests her: crew off, ship impounded', p4.dead && p4.arrested && !cop.target && saidAny(ha, /arrested/), ha.said[0]);

console.log('smugglers, and runners');
fresh();
G = game();
var smug = null;
var TS = T, stS = null;
sys.traffic.forEach(function (r) {
  if (smug || r.runner) return;
  var Ap = sys.byId[r.from];
  if (Ap && Ap.market) { var had = Ap.market.blackMarket; Ap.market.blackMarket = true; if (A.smuggler(sys, r)) smug = r; else Ap.market.blackMarket = had; }
});
check('some independent line through a fence is a smuggler', !!smug, smug && smug.name);
var runR = { id: 'runner-x', runner: true, flag: 'outlaw', from: smug && smug.from, to: smug && smug.to };
check('a Syndicate runner never is', !A.smuggler(sys, runR));
/* When she is out on her crossing. */
for (var ts = 0; ts < 400 && !stS; ts++) {
  var tq = T + ts * smug.period / 400;
  var cand2 = Sim.trafficAll(sys, tq).filter(function (s) { return s.route === smug && s.phase === 'cruise'; })[0];
  if (cand2) { stS = cand2; TS = tq; }
}
G.t = TS; T = TS;
if (stS) {
  var cop2 = npc('police', lawFac, V.add(stS.pos, { x: 50, y: 0, z: 0 }), stS.vel);
  A.update(sys, G, T, 1, hooks());
  var fug = cop2.target;
  check('a cutter runs her papers and she bolts', fug && fug.smuggler && fug.fugitive === cop2 && cop2.pursuing === 'smuggler', fug && fug.name);
  /* You join in: no crime, and the law notices. */
  G.ship.pos = V.add(fug.live.pos, { x: 3, y: 0, z: 0 });
  Combat.damageNpc(sys, G, fug, 5, T + 1, hooks(), null, G.ship.pos);
  check('hitting the one the law is running down is no crime', !G.pendingReport && !fug.reported && !fug.distressAt);
  check('and counts as helping the arrest', fug.helpArrest && fug.helpArrest.faction === lawFac);
  Combat.disableNpc(sys, G, fug, 'drive', T + 2, hooks(), cop2);
  A.update(sys, G, T + 3, 1, hooks());
  cop2.live.pos = V.add(fug.live.pos, { x: 0.3, y: 0, z: 0 });
  A.update(sys, G, T + 4, 1, hooks());
  var s0 = Ms.standing(G, lawFac);
  var hh = hooks();
  A.update(sys, G, T + 4 + A.ARREST_S + 1, 1, hh);
  check('arrested, and your standing with them rises', fug.dead && Ms.standing(G, lawFac) === s0 + A.HELP_ARREST,
        s0 + ' -> ' + Ms.standing(G, lawFac));
  check('her line is off the timetable: impounded', smug.dead && smug.impounded);
} else check('the smuggler in cruise', false);

console.log('standing');
fresh();
G = game();
var cop3 = npc('police', lawFac, V.add(G.ship.pos, { x: 200, y: 0, z: 0 }), G.ship.vel);
G.standing[lawFac] = -50;
var hs = hooks();
A.update(sys, G, T, 1, hs);
check('HOSTILE: their patrols shoot on sight', cop3.hostileToPlayer && cop3.mode === 'attack' && saidAny(hs, /not welcome/), hs.said[0]);
G.standing[lawFac] = -39;
var cop4 = npc('police', lawFac, V.add(G.ship.pos, { x: 200, y: 0, z: 0 }), G.ship.vel);
A.update(sys, G, T + 1, 1, hooks());
check('cold is not hostile', !cop4.hostileToPlayer);

fresh();
G = game();
var p5 = npc('pirate', 'outlaw', V.add(st0.pos, { x: 300, y: 0, z: 0 }), st0.vel);
var v5 = A.startRobbery(sys, G, p5, st0, T, hooks());
var vf = v5.faction;
G.ship.pos = V.add(p5.live.pos, { x: 3, y: 0, z: 0 });
Combat.damageNpc(sys, G, p5, 5, T + 1, hooks(), null, G.ship.pos);
check('you fire on a pirate robbing her: she turns on you, the freighter is let go', p5.hostileToPlayer && !p5.target && v5.threat !== p5 && p5.helpFor && p5.helpFor.faction === vf);
var sv = Ms.standing(G, vf);
p5.hullHp = 1;
Combat.damageNpc(sys, G, p5, 5, T + 2, hooks(), null, G.ship.pos);
check('and killing her raises your standing with the freighter\'s flag', p5.dead && Ms.standing(G, vf) === sv + A.HELP_KILL, sv + ' -> ' + Ms.standing(G, vf));

fresh();
G = game();
var p6 = npc('pirate', 'outlaw', V.add(st0.pos, { x: 300, y: 0, z: 0 }), st0.vel);
var v6 = A.startRobbery(sys, G, p6, st0, T, hooks());
p6.hullHp = 45;
G.ship.pos = V.add(p6.live.pos, { x: 3, y: 0, z: 0 });
var sd = Ms.standing(G, v6.faction), hd = hooks();
Combat.damageNpc(sys, G, p6, 10, T + 1, hd, null, G.ship.pos);
check('hurt badly enough, she breaks off - you drove her off', p6.mode === 'breakoff' && !p6.hostileToPlayer && Ms.standing(G, v6.faction) === sd + A.HELP_DRIVEOFF,
      hd.said.join(' | '));

fresh();
G = game();
var p7 = npc('pirate', 'outlaw', V.add(st0.pos, { x: 600, y: 0, z: 0 }), st0.vel);
var cop5 = npc('police', lawFac, V.add(st0.pos, { x: 0, y: 0, z: 0 }), st0.vel);
A.update(sys, G, T, 1, hooks());
var si0 = Ms.standing(G, lawFac), emp = A.empireOf(G, sys, lawFac), se0 = Ms.standing(G, emp), hi = hooks();
G.ship.pos = V.add(cop5.live.pos, { x: 3, y: 0, z: 0 });
Combat.damageNpc(sys, G, cop5, 3, T + 1, hi, null, G.ship.pos);
check('getting in the way of an arrest costs you with the force', Ms.standing(G, lawFac) <= si0 - A.INTERFERE && saidAny(hi, /Interfering/),
      si0 + ' -> ' + Ms.standing(G, lawFac));
check('and with the empire above it', emp === lawFac || Ms.standing(G, emp) <= se0 - A.INTERFERE_EMPIRE, emp + ': ' + se0 + ' -> ' + Ms.standing(G, emp));
check('and the pirate gets away', !p7.fugitive && !cop5.target);

console.log('rival empires');
fresh();
G = game();
G.galaxy = { rivals: { ea: { eb: true }, eb: { ea: true } }, factionById: { ea: { id: 'ea', name: 'Ea' }, eb: { id: 'eb', name: 'Eb' } } };
var ra = npc('police', 'ea', V.add(G.ship.pos, { x: 0, y: 0, z: 0 }), G.ship.vel);
var rb = npc('police', 'eb', V.add(G.ship.pos, { x: 6, y: 0, z: 0 }), G.ship.vel);
var hr = hooks();
A.update(sys, G, T, 1, hr);
check('rival patrols open fire on each other', ra.target === rb && rb.target === ra && saidAny(hr, /open fire/), hr.said[0]);
for (var k = 0; k < 400 && (ra.target || rb.target); k++) {
  rb.live.pos = V.add(ra.live.pos, { x: 6, y: 0, z: 0 });
  A.update(sys, G, T + 2 + k, 1, hooks());
}
var loser = ra.withdrawnAt !== undefined && ra.mode === 'breakoff' ? ra : rb;
check('the beaten one withdraws, alive', !ra.dead && !rb.dead && loser.mode === 'breakoff' && !ra.target && !rb.target,
      Math.round(ra.hullHp) + ' / ' + Math.round(rb.hullHp));
A.update(sys, G, T + 900, 1, hooks());
check('and they do not go again straight away', !ra.target && !rb.target);
G.galaxy = g;

console.log('a chase closes');
/* A cutter 30 km behind a pirate running flat out, through the real
 * encounter loop: she gets within gun range. */
fresh();
G = game();
var runner = npc('pirate', 'outlaw', V.add(st0.pos, { x: 0, y: 0, z: 0 }), st0.vel, { accel: 0.0255 });
var chaser = npc('police', lawFac, V.add(st0.pos, { x: -30, y: 0, z: 0 }), st0.vel, { accel: 0.0315 });
A.startPursuit(sys, G, chaser, runner, T, hooks(), 'pirate');
G.ship.pos = V.add(st0.pos, { x: 0, y: 1500, z: 0 }); G.ship.vel = V.clone(st0.vel);
var gap0 = V.dist(chaser.live.pos, runner.live.pos), gapMin = gap0, inRange = -1;
for (var cq = 0; cq < 300; cq++) {
  G.ship.vel = V.clone(runner.live.vel);
  G.ship.pos = V.add(runner.live.pos, { x: 0, y: 1500, z: 0 });
  Sim.updateEncounters(sys, T + cq, 1, G.ship);
  if (!runner.live || !chaser.live) break;
  gapMin = Math.min(gapMin, V.dist(chaser.live.pos, runner.live.pos));
  if (inRange < 0 && gapMin < Combat.POLICE_GUN.range) inRange = cq;
}
check('a faster cutter closes on a running pirate, inside her gun\'s range', gapMin < Combat.POLICE_GUN.range,
      Math.round(gap0) + ' -> ' + gapMin.toFixed(1) + ' km');
/* Astra: "give police extra thrust for their interceptors". */
check('her interceptor burns harder in pursuit: in gun range from 30 km inside 50 s', inRange >= 0 && inRange < 50, inRange + ' s');
var idleCop = { kind: 'police', faction: lawFac, accel: 0.0315, mode: 'shadow' };
var huntCop = { kind: 'police', faction: lawFac, accel: 0.0315, mode: 'attack', hostileToPlayer: true };
var enforcer = { kind: 'police', faction: 'outlaw', className: 'enforcer', accel: 0.0315, mode: 'chase', target: runner };
var navyShip = { kind: 'navy', faction: lawFac, accel: 0.009, mode: 'chase', target: runner };
check('the burn is for the chase only: shadowing, she cruises', Sim.accelOf(idleCop) === 0.0315);
check('hunting you, she burns too', Sim.accelOf(huntCop) === 0.0315 * Sim.POLICE_BURN);
check('not the Syndicate\'s enforcers, not the Navy', Sim.accelOf(enforcer) === 0.0315 && Sim.accelOf(navyShip) === 0.009);

console.log('asleep, the fight ends');
fresh();
G = game();
var p8 = npc('pirate', 'outlaw', V.add(st0.pos, { x: 300, y: 0, z: 0 }), st0.vel);
A.startRobbery(sys, G, p8, st0, T, hooks());
Sim.sleepAll(sys);
check('everyone back on her rail, nobody chasing anybody', !p8.target && !p8.live);

console.log('the encounter loop flies her at her target');
fresh();
G = game();
var p9 = npc('pirate', 'outlaw', V.add(st0.pos, { x: 400, y: 0, z: 0 }), st0.vel);
var v9 = A.startRobbery(sys, G, p9, st0, T, hooks());
G.ship.pos = V.add(p9.live.pos, { x: 0, y: 2000, z: 0 }); G.ship.vel = V.clone(p9.live.vel);
var d0 = V.dist(p9.live.pos, v9.live.pos), dYou0 = V.dist(p9.live.pos, G.ship.pos);
for (var q = 0; q < 30; q++) {
  G.ship.pos = V.addScaled(G.ship.pos, G.ship.vel, 10);
  Sim.updateEncounters(sys, T + q * 10, 10, G.ship);
}
var d1 = p9.live ? V.dist(p9.live.pos, v9.live.pos) : Infinity;
check('she closes on the freighter, not on you', d1 < d0 && V.dist(p9.live.pos, G.ship.pos) > dYou0 * 0.8,
      Math.round(d0) + ' -> ' + Math.round(d1) + ' km');

console.log('off-screen raids');
Sim.policeNearby = realPoliceNearby;
sys.patrols = savedPatrols;
/* A pirate system: generated whole, its deliveries carry the odds. */
var psys = null;
for (var pi = 0; pi < g.stars.length && !psys; pi++) {
  var c2 = g.stars[pi];
  var s2 = Gen.generateSystem(c2.seed, Galaxy.systemOpts(g, c2));
  if (s2.raidOdds > 0.05 && (s2.traffic || []).length > 4) psys = s2;
}
check('a system with pirates in it has raid odds', !!psys, psys && (psys.name + ' ' + psys.raidOdds.toFixed(3)));
var dd = null, port = null;
(psys.ports || []).forEach(function (p) { (p.market && p.market.inbound || []).forEach(function (d) { if (!dd && d.raidP > 0) { dd = d; port = p; } }); });
check('her deliveries carry them', !!dd);
var raided = -1;
for (var n = 0; n < 400 && raided < 0; n++) if (Eco.raidedArrival(dd, n)) raided = n;
check('some arrivals are raided', raided >= 0, 'arrival ' + raided);
check('the same raid every time you ask', Eco.raidedArrival(dd, raided) && Eco.raidedArrival(dd, raided));
var at = dd.t0 + dd.cruise + raided * dd.period + 60;
var withRaid = Eco.analyticStock(port, dd.cid, at);
var keepP = dd.raidP; dd.raidP = 0;
var noRaid = Eco.analyticStock(port, dd.cid, at);
dd.raidP = keepP;
check('a raided arrival lands light: less on her shelf', withRaid < noRaid || noRaid >= port.market.rows[dd.cid].cap,
      withRaid.toFixed(1) + ' vs ' + noRaid.toFixed(1));
var news = A.raidNews(psys, port, at);
check('and it is word on the dock', news && /robbed by pirates/.test(news), news);
var calm = { patrols: [{ kind: 'police' }], crimeScore: 90 };
check('a system with no pirates in it has no raids', Gen.raidOdds(calm) === 0);
check('crime and a band\'s own space raise the odds', Gen.raidOdds({ patrols: [{ kind: 'pirate' }], crimeScore: 80, heldBy: 'pirate' }) >
      Gen.raidOdds({ patrols: [{ kind: 'pirate' }], crimeScore: 20 }));
check('runners are not robbed', psys.traffic.filter(function (r) { return r.runner; }).every(function (r) {
  return !psys.ports.some(function (p) { return (p.market && p.market.inbound || []).some(function (d) { return d.route === r.id; }); });
}));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
