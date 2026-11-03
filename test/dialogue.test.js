/* dialogue.test.js — talking to people on foot (2026-10-25).
 *
 *     node test/dialogue.test.js
 *
 * Astra: "let's make sure we have some more complex dialogue trees for
 * NPCs, based on a few rules which already exist for the comms traffic."
 * She chose all four of those rules — temper and values, their opinion of
 * you, memory without repeats, lies checked — and that talk feeds the
 * systems the game already has. See claude/dialogue.md.
 *
 * What it holds:
 *   - everybody on a real station deck can be talked to, opens with a line,
 *     and offers replies ending in Goodbye;
 *   - who someone is (temper, values) is a pure function of the seed, drawn
 *     as captains.js draws a ship's chair;
 *   - they judge you by Captains.judge: a career of piracy turns the law
 *     against you and a pirate-minded face towards you;
 *   - a docked crew speaks for their captain, and changes when she does;
 *   - nobody says the same opening twice running;
 *   - customs read your manifest and catch a lie, which goes in their memory
 *     and on your public record; the truth earns honesty;
 *   - a round at the bar costs credits and warms the bartender;
 *   - a hand haggled down signs on at the agreed wage;
 *   - a warrant can be paid at the customs desk;
 *   - unpaid wages come up when you ask your crew how they are;
 *   - a furious face offers nothing but Goodbye;
 *   - it all survives a save.
 */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
['vec3', 'kepler', 'rng', 'economy', 'generate', 'galaxy', 'sim'].forEach(function (m) { require(path.join(SRC, m + '.js')); });
var Combat = require(path.join(SRC, 'combat.js'));
var Crew = require(path.join(SRC, 'crew.js'));
['missions', 'shiptrade'].forEach(function (m) { require(path.join(SRC, m + '.js')); });
var Cap = require(path.join(SRC, 'captains.js'));
require(path.join(SRC, 'messages.js'));
require(path.join(SRC, 'favours.js'));
var Walk = require(path.join(SRC, 'walk.js'));
var Npc = require(path.join(SRC, 'npc.js'));
var D = require(path.join(SRC, 'dialogue.js'));
var Save = require(path.join(SRC, 'save.js'));
var Gen = global.Gen, Galaxy = global.Galaxy, Sim = global.Sim;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

/* ---- a real system, a real port ------------------------------------------ */
var SEED = 'kawartha';
var gal = Galaxy.build(SEED);
var star = null, sys = null, port = null;
for (var i = 0; i < gal.stars.length && i < 80 && !port; i++) {
  var s0 = Gen.generateSystem(gal.stars[i].seed, { faction: gal.factionById[gal.stars[i].factionId], allFactions: gal.factions });
  s0.starId = gal.stars[i].id;
  if ((s0.traffic || []).length < 4) continue;
  var ports = s0.bodies.filter(function (b) { return b.market && !b.surface && !b.underground; });
  for (var k = 0; k < ports.length; k++) {
    var t0 = 3 * 86400, occ = Sim.berthOccupants(ports[k], s0, t0);
    if (occ.length >= 1) { star = gal.stars[i]; sys = s0; port = ports[k]; break; }
  }
}
check('found a busy port to stand in', !!port, port ? port.name + ' at ' + star.name : '');
var T = 3 * 86400;

function freshGame(at) {
  return {
    seed: SEED, t: T, here: star, sys: sys, galaxy: gal, standing: {}, wanted: {},
    ship: { hullId: 'talon', credits: 100000, cargo: { grain: 12 }, crew: [], hullHp: 100, hullMax: 100,
            fuel: 30, fuelCap: 60, thrusterFuel: 10, thrusterCap: 20, missiles: 2, docked: (at || port).id,
            shipName: 'Abby', reg: 'AB-1234', wagesTo: T }
  };
}
var G = freshGame();
global.Game = G;
var plan = Walk.layout(port.id, { seed: SEED, yard: true, ships: [{ id: 's', size: 'M', name: 'Abby', current: true }] });
var sc = Npc.stationScene(plan, port, sys, { t: T, seed: SEED, livery: port.livery, corruption: sys.corruption });

console.log('--- everybody can be talked to ---');
var silent = [], noBye = [], kinds = {};
sc.people.forEach(function (p) {
  var st = D.open(G, sys, port, p, T);
  var opts = D.options(G, sys, port, st);
  kinds[D.kindOf(p)] = true;
  if (!st || !st.line) silent.push(p.name);
  if (!opts.length || opts[opts.length - 1].id !== 'leave') noBye.push(p.name);
});
check('every person on the deck opens with a line', !silent.length, silent.join(', ') || sc.people.length + ' people');
check('and every list of replies ends in Goodbye', !noBye.length, noBye.join(', '));
check('the deck has more than one kind of person to talk to', Object.keys(kinds).length >= 4, Object.keys(kinds).join(', '));

console.log('--- who they are ---');
var bad = [];
sc.people.forEach(function (p) {
  var a = D.persona(G, sys, port, p), b = D.persona(G, sys, port, p);
  if (a.temper !== b.temper || a.values !== b.values) bad.push(p.name);
  if (Cap.TEMPERS.indexOf(a.temper) < 0 || Cap.VALUES.indexOf(a.values) < 0) bad.push(p.name + '?');
});
check('temper and values are the same every time, and are captains\' own', !bad.length, bad.join(', '));
/* Weighted as captains.js weights a ship's chair: draw a crowd. */
var lawfulSec = 0, nSec = 0, synAbo = 0, nSyn = 0;
for (i = 0; i < 400; i++) {
  var ps = D.persona(G, sys, port, { id: 'sec|' + i, name: 'A B', role: 'security', liv: 'civ' });
  nSec++; if (ps.values === 'lawful') lawfulSec++;
  var py = D.persona(G, sys, port, { id: 'syn|' + i, name: 'A B', role: 'enforcer', liv: 'syn' });
  nSyn++; if (py.values === 'abolitionist') synAbo++;
}
check('port security leans lawful', lawfulSec / nSec > 0.55, Math.round(100 * lawfulSec / nSec) + '% lawful');
check('nobody in a Syndicate jacket is an abolitionist', synAbo === 0);

console.log('--- what they think of you ---');
function findLawfulSecurity() {
  for (var j = 0; j < 200; j++) {
    var pp = { id: 'test-sec|' + j, name: 'Ilse Varga', role: 'security', liv: 'civ' };
    var pe = D.persona(G, sys, port, pp);
    if (pe.values === 'lawful' && pe.temper !== 'friendly') return pp;
  }
  return null;
}
var sec = findLawfulSecurity();
var before = D.opinion(G, sys, port, sec).band;
G.record = { self: { piracy: 6, kills: 2, pirateKills: 0, rescues: 0 } };
var after = D.opinion(G, sys, port, sec).band;
check('a clean record is no worse than cold to a lawful officer', ['cold', 'neutral', 'warm'].indexOf(before) >= 0, before);
check('a career of piracy turns the law against you', after === 'angry' || after === 'furious', before + ' → ' + after);
var pirateFace = null;
for (i = 0; i < 300 && !pirateFace; i++) {
  var pf = { id: 'test-fix|' + i, name: 'Mags Rask', role: 'fixer', liv: 'syn' };
  if (D.persona(G, sys, port, pf).values === 'pirate') pirateFace = pf;
}
var fb = D.opinion(G, sys, port, pirateFace);
check('the same career is a reference to a pirate-minded fixer', fb.score > 0, fb.band + ' (' + fb.score.toFixed(1) + ')');
var furious = D.open(G, sys, port, sec, T);
G.record.self.piracy = 30; G.record.self.kills = 10;
var fs = D.open(G, sys, port, sec, T);
var fo = D.options(G, sys, port, fs);
check('a furious face offers nothing but Goodbye', fs.band !== 'furious' || (fo.length === 1 && fo[0].id === 'leave'),
      fs.band + ': ' + fo.map(function (o) { return o.id; }).join(','));
G.record = null;

console.log('--- a docked crew speaks for their captain ---');
var crewP = sc.people.filter(function (p) { return D.kindOf(p) === 'shipcrew' && p.route; })[0];
check('there is a docked crew to ask', !!crewP, crewP ? crewP.name + ' of the ' + crewP.shipName : '');
if (crewP) {
  var contact = { route: crewP.route, id: crewP.route.id, name: crewP.route.name, kind: crewP.route.kind || 'trade' };
  var capOp = Cap.opinion(G, sys, contact), crewOp = D.opinion(G, sys, port, crewP);
  check('their opinion is their captain\'s', capOp && crewOp.band === capOp.band, crewOp.band + ' / ' + (capOp && capOp.band));
  Cap.record(G, sys, contact, 'rescued', T, { stakes: ['ship', 'crew'] });
  var crewOp2 = D.opinion(G, sys, port, crewP);
  check('save their ship and her crew warm to you too', crewOp2.score > crewOp.score, crewOp.band + ' → ' + crewOp2.band);
  var st2 = D.open(G, sys, port, crewP, T);
  var o2 = D.options(G, sys, port, st2), hi = -1;
  o2.forEach(function (o, ix) { if (o.id === 'heard') hi = ix; });
  D.choose(G, sys, port, st2, hi);
  check('and they tell you what the skipper thinks of you', /Captain .* (thinks|owes)/.test(st2.line), st2.line);
  if (global.Favours) global.Favours.addDebt(G, sys, contact, 1, T, 'test');
  var st3 = D.open(G, sys, port, crewP, T), oi = -1;
  D.options(G, sys, port, st3).forEach(function (o, ix) { if (o.id === 'owes') oi = ix; });
  D.choose(G, sys, port, st3, oi);
  check('and whether she owes you', /owes you/.test(st3.line), st3.line);
}

console.log('--- no repeats ---');
var talker = sc.people.filter(function (p) { return D.kindOf(p) === 'market' || D.kindOf(p) === 'bartender'; })[0] || sc.people[0];
var seen = [], dup = 0, prev = null;
for (i = 0; i < 4; i++) {
  var o = D.open(G, sys, port, talker, T);
  if (prev !== null && o.line === prev) dup++;
  if (seen.indexOf(o.line) >= 0) dup++;
  seen.push(o.line); prev = o.line;
}
check('the same person opens differently each time you walk up', dup === 0, seen.join(' | '));

console.log('--- lies are checked ---');
function findKind(kind) { return sc.people.filter(function (p) { return D.kindOf(p) === kind; })[0]; }
var customs = findKind('customs') || { id: 'test-officer', name: 'Lt. Hale', role: 'officer', liv: 'navy' };
G = freshGame(); global.Game = G;
var cs = D.open(G, sys, port, customs, T);
check('customs ask your business first', cs.node === 'business', cs.line);
var co = D.options(G, sys, port, cs), med = -1;
co.forEach(function (o, ix) { if (o.id === 'claim-medical') med = ix; });
D.choose(G, sys, port, cs, med);
var cm = D.memory(G, 'person|' + customs.id);
check('claiming medical supplies with grain in the hold is caught', /manifest|file|hold/.test(cs.line), cs.line);
check('and they remember it', cm && cm.honesty < 0 && cm.log.some(function (e) { return e.k === 'lied' || e.k === 'exploited'; }));
check('and it goes on your public record', ((Cap.recordOf(G) || {}).lies || 0) === 1);
var cs2 = D.open(G, sys, port, customs, T + 2 * 86400), ord = -1;
D.options(G, sys, port, cs2).forEach(function (o, ix) { if (o.id === 'claim-ordinary') ord = ix; });
D.choose(G, sys, port, cs2, ord);
check('the truth is accepted, and earns honesty', D.memory(G, 'person|' + customs.id).honesty > cm.honesty - 0.001 &&
      D.memory(G, 'person|' + customs.id).log.some(function (e) { return e.k === 'honest'; }), cs2.line);
var opener = D.open(G, sys, port, customs, T + 5 * 86400);
check('and next time they bring up the lie', /lie|lied|manifest|true/i.test(opener.line), opener.line);

console.log('--- the bar ---');
G = freshGame(); global.Game = G;
var bt = findKind('bartender');
check('the port has a bartender', !!bt);
if (bt) {
  var bs = D.open(G, sys, port, bt, T), bo = D.options(G, sys, port, bs), ri = -1, cost = 0;
  bo.forEach(function (o, ix) { if (o.id === 'round') { ri = ix; cost = parseInt(/\((\d+) cr\)/.exec(o.label)[1], 10); } });
  var cr0 = G.ship.credits;
  D.choose(G, sys, port, bs, ri);
  check('a round costs what it says', G.ship.credits === cr0 - cost, cost + ' cr');
  check('and warms the bartender', D.memory(G, 'person|' + bt.id).feeling > 0);
  var talk = D.options(G, sys, port, bs).filter(function (o) { return o.id === 'talk'; })[0];
  check('and loosens tongues', talk && talk.ok);
  var again = D.options(G, sys, port, D.open(G, sys, port, bt, T)).filter(function (o) { return o.id === 'round'; })[0];
  check('one round a day', again && !again.ok && /already/.test(again.why), again && again.why);
}

console.log('--- hiring ---');
var hands = sc.people.filter(function (p) { return D.kindOf(p) === 'hire'; });
check('the crew hall has hands to talk to', hands.length > 0, hands.length + '');
/* "Some will, some will not" is a claim about a crowd, and one crew hall
 * holds two hands. Since stars stage 2 the port above is a different one
 * and both its hands are mercenary-or-cold (0 of 2), so the halls of the
 * system's other orbital ports are pooled in until there are six. */
var pool = hands.map(function (h) { return { h: h, port: port }; });
sys.bodies.filter(function (b) { return b.market && !b.surface && !b.underground && b !== port; })
  .forEach(function (op) {
    if (pool.length >= 6) return;
    var opPlan = Walk.layout(op.id, { seed: SEED, yard: true, ships: [{ id: 's', size: 'M', name: 'Abby', current: true }] });
    Npc.stationScene(opPlan, op, sys, { t: T, seed: SEED, livery: op.livery, corruption: sys.corruption })
      .people.forEach(function (p) { if (D.kindOf(p) === 'hire') pool.push({ h: p, port: op }); });
  });
var signedOne = null, haggled = 0;
pool.forEach(function (ph) {
  var h = ph.h, port = ph.port;
  G = freshGame(port); global.Game = G;
  var hs = D.open(G, sys, port, h, T), ho = D.options(G, sys, port, hs), hgi = -1;
  ho.forEach(function (o, ix) { if (o.id === 'haggle') hgi = ix; });
  if (hgi < 0) return;
  var wage0 = Crew.dailyWage(h.forHire);
  D.choose(G, sys, port, hs, hgi);
  var took = h.forHire.wageMul && h.forHire.wageMul < 1;
  if (took) haggled++;
  var si = -1, fee = 0;
  D.options(G, sys, port, hs).forEach(function (o, ix) { if (o.id === 'sign') { si = ix; fee = parseInt(/\((\d+) cr\)/.exec(o.label)[1], 10); } });
  if (si >= 0 && took && !signedOne) {
    var c0 = G.ship.credits;
    D.choose(G, sys, port, hs, si);
    signedOne = { h: h, ok: G.ship.crew.length === 1 && G.ship.credits === c0 - fee && Crew.dailyWage(G.ship.crew[0]) < wage0,
                  fee: fee, wage: Crew.dailyWage(G.ship.crew[0]) + ' < ' + wage0 };
  }
  delete h.forHire.wageMul; delete h.forHire.feeMul;
});
check('some hands will take less from a stranger, and some will not', haggled > 0 && haggled < pool.length, haggled + ' of ' + pool.length);
check('one haggled down signs on at the agreed fee and wage', !signedOne || signedOne.ok, signedOne ? signedOne.fee + ' cr, ' + signedOne.wage : 'nobody agreed this seed');

console.log('--- a warrant ---');
G = freshGame(); global.Game = G;
var fac = D.persona(G, sys, port, customs).faction;
if (fac) {
  G.wanted[fac] = 600;
  var ws = D.open(G, sys, port, customs, T + 9 * 86400);
  ws.node = null;
  var wo = D.options(G, sys, port, ws), wi = -1;
  wo.forEach(function (o, ix) { if (o.id === 'warrant') wi = ix; });
  var c1 = G.ship.credits;
  D.choose(G, sys, port, ws, wi);
  check('a warrant can be settled at the customs desk', !G.wanted[fac] && G.ship.credits === c1 - 960, ws.line);
} else check('a warrant can be settled at the customs desk (no faction here)', true);

console.log('--- your own crew ---');
G = freshGame(); global.Game = G;
var hand = { id: 'c|test', name: 'Rue Sable', role: 'engineer', rating: 3, paidTo: T };
G.ship.crew = [hand];
var you = { id: 'c|test', name: 'Rue Sable', role: 'engineer', crew: hand, liv: 'civ' };
var ys = D.open(G, sys, port, you, T), mi = -1;
D.options(G, sys, port, ys).forEach(function (o, ix) { if (o.id === 'mood') mi = ix; });
D.choose(G, sys, port, ys, mi);
var paidLine = ys.line;
G.ship.wagesTo = T - 4 * 86400;
var ys2 = D.open(G, sys, port, you, T + 86400), mi2 = -1;
D.options(G, sys, port, ys2).forEach(function (o, ix) { if (o.id === 'mood') mi2 = ix; });
D.choose(G, sys, port, ys2, mi2);
check('unpaid wages come up when you ask how they are', /wages/.test(ys2.line) && !/wages/.test(paidLine), ys2.line);
var si2 = -1;
var ys3 = D.open(G, sys, port, you, T + 86400);
D.options(G, sys, port, ys3).forEach(function (o, ix) { if (o.id === 'status') si2 = ix; });
D.choose(G, sys, port, ys3, si2);
check('and the engineer reports the real ship', /Hull at 100%/.test(ys3.line) && /30 of 60/.test(ys3.line), ys3.line);

console.log('--- saved ---');
var payload = Save.serialize ? Save.serialize(G) : null;
if (payload) {
  var back = JSON.parse(JSON.stringify(payload));
  check('who you have talked to is in the save', back.people && back.people['person|c|test']);
} else {
  var src = require('fs').readFileSync(path.join(SRC, 'save.js'), 'utf8');
  check('who you have talked to is in the save', /people: G\.people/.test(src) && /G\.people = /.test(src));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
