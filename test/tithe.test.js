/* tithe.test.js — the overboss's tithe (2026-10-26).
 *
 *     node test/tithe.test.js
 *
 * Astra: "in Syndicate controlled systems, paying a tithe to the overboss or
 * whatever is a great way to show you're not Navy or Police." Asked: the
 * collector hails you on arrival (pay / haggle / refuse) and a fixer in the
 * bar takes it too; paying buys being left alone, a little standing, doors
 * and prices; refusing marks you suspected; the lawful empires do not hold
 * paying against you.
 */
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global.window || global;
['vec3', 'kepler', 'rng', 'economy', 'generate', 'galaxy', 'sim'].forEach(function (m) { require(path.join(SRC, m + '.js')); });
var Combat = require(path.join(SRC, 'combat.js'));
['missions', 'shiptrade'].forEach(function (m) { require(path.join(SRC, m + '.js')); });
require(path.join(SRC, 'captains.js'));
require(path.join(SRC, 'messages.js'));
require(path.join(SRC, 'favours.js'));
var T = require(path.join(SRC, 'tithe.js'));
var D = require(path.join(SRC, 'dialogue.js'));
var Galaxy = global.Galaxy, Gen = global.Gen, Sim = global.Sim, Eco = global.Economy;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
var DAY = 86400;

var gal = Galaxy.build('kawartha');
var held = null, heldSys = null, lawful = null, lawfulSys = null;
for (var i = 0; i < gal.stars.length && !(held && lawful); i++) {
  var st = gal.stars[i], fac = gal.factionById[st.factionId];
  var sys = Gen.generateSystem(st.seed, fac ? { faction: fac, allFactions: gal.factions } : undefined);
  if (sys.pirateHeld && !held && (sys.ports || []).some(function (p) { return p.faction === 'outlaw' && p.market; })) { held = st; heldSys = sys; }
  if (!sys.pirateHeld && !lawful && (sys.ports || []).some(function (p) { return p.faction && p.faction !== 'outlaw' && p.market; })) { lawful = st; lawfulSys = sys; }
}
check('kawartha has a Syndicate hold with a market to test in', !!held, held ? held.name : '');

function game(here, sys) {
  return { t: 2 * DAY, here: here, sys: sys, galaxy: gal, standing: { outlaw: 0 }, wanted: {},
           ship: { hullId: 'talon', credits: 50000, cargo: {} } };
}

console.log('--- the collector calls ---');
var G = game(lawful, lawfulSys);
check('nobody calls in a lawful system', T.onArrive(G, lawfulSys, G.t) === null && T.status(G, lawfulSys, G.t) === null);
G = game(held, heldSys);
var call = T.onArrive(G, heldSys, G.t);
check('arriving in a hold, the collector names his price', call && call.asked && /tithe/.test(call.say), call && call.say);
check('and waits for an answer', T.status(G, heldSys, G.t) === 'asked');
var q0 = T.owed(G, heldSys, G.t);
check('the price is a round, sensible number', q0 >= 50 && q0 % 10 === 0 && q0 < 5000, q0 + ' cr');

var G0 = game(held, heldSys); G0.t = 0; T.onArrive(G0, heldSys, 0);
check('a call at the very start of a career still counts as a call', T.status(G0, heldSys, 0) === 'asked' &&
      T.tick(G0, heldSys, T.SILENCE_S + 1) !== null);

console.log('--- what it costs ---');
var G2 = game(held, heldSys); G2.ship.cargo = { grain: 40 };
check('a full hold pays more', T.quote(G2) > T.quote(game(held, heldSys)), T.quote(game(held, heldSys)) + ' → ' + T.quote(G2));
var G3 = game(held, heldSys); G3.ship.hullId = 'longhaul';
check('a bigger ship pays more', T.quote(G3) > T.quote(game(held, heldSys)), T.quote(G3) + ' cr for a ' + (Combat.HULLS.longhaul || {}).size);
var G4 = game(held, heldSys); G4.standing.outlaw = 60;
check('a friend of the Syndicate pays less', T.quote(G4) < T.quote(game(held, heldSys)), T.quote(G4) + ' cr');

console.log('--- paying ---');
var cr0 = G.ship.credits, law0 = JSON.stringify(G.wanted);
G.standing.navy = 12;
var r = T.pay(G, heldSys, G.t, 'channel');
check('paying takes the money', r.ok && G.ship.credits === cr0 - q0, r.say);
check('and marks you paid', T.status(G, heldSys, G.t) === 'paid' && T.paid(G, heldSys, G.t));
check('a little standing with the Syndicate', G.standing.outlaw === T.STANDING_GAIN, G.standing.outlaw);
check('and nothing at all with the law', G.standing.navy === 12 && JSON.stringify(G.wanted) === law0);
check('you cannot pay twice in a week', !T.pay(G, heldSys, G.t + DAY, 'channel').ok);
check('their doors read you higher while it lasts', Combat.syndicateStanding(G) === G.standing.outlaw + T.TRUST_BONUS,
      Combat.syndicateStanding(G));
check('the week runs out', T.status(G, heldSys, G.t + T.PAID_DAYS * DAY + 1) === null);
var again = T.onArrive(G, heldSys, G.t + T.PAID_DAYS * DAY + 1);
check('and next time you come, he calls again', again && again.asked);
var G5 = game(held, heldSys); T.onArrive(G5, heldSys, G5.t); T.pay(G5, heldSys, G5.t, 'channel');
var back = T.onArrive(G5, heldSys, G5.t + DAY);
check('back inside the week, your mark is good', back && !back.asked && /mark is good/.test(back.say), back && back.say);

console.log('--- the better prices ---');
var synPort = heldSys.ports.filter(function (p) { return p.faction === 'outlaw' && p.market; })[0];
var rows = Eco.priceList(synPort, G5.t);
var buyRow = rows.filter(function (x) { return x.buy > 0; })[0], sellRow = rows.filter(function (x) { return x.sell > 0; })[0];
var adjB = T.adjustRow(G5, heldSys, synPort, buyRow, G5.t), adjS = T.adjustRow(G5, heldSys, synPort, sellRow, G5.t);
check('a Syndicate port sells to you cheaper', adjB.buy < buyRow.buy, buyRow.buy.toFixed(1) + ' → ' + adjB.buy.toFixed(1));
check('and buys from you dearer', adjS.sell > sellRow.sell, sellRow.sell.toFixed(1) + ' → ' + adjS.sell.toFixed(1));
check('without touching the port\'s own book', Eco.priceList(synPort, G5.t).filter(function (x) { return x.id === buyRow.id; })[0].buy === buyRow.buy);
var Gnp = game(held, heldSys);
check('nothing off for a ship that has not paid', T.adjustRow(Gnp, heldSys, synPort, buyRow, Gnp.t) === buyRow);
var lawPort = lawfulSys.ports.filter(function (p) { return p.market; })[0];
check('nor at anybody else\'s port', T.adjustRow(G5, heldSys, lawPort, buyRow, G5.t) === buyRow);

console.log('--- haggling ---');
var Gh = game(held, heldSys); T.onArrive(Gh, heldSys, Gh.t);
var qh = T.owed(Gh, heldSys, Gh.t), h1 = T.haggle(Gh, heldSys, Gh.t);
check('a haggle moves the price one way or the other', h1.ok && h1.quote !== qh, qh + ' → ' + h1.quote + (h1.won ? ' (won)' : ' (lost)'));
check('and the new price is what you pay', T.owed(Gh, heldSys, Gh.t) === h1.quote);
check('once', !T.haggle(Gh, heldSys, Gh.t).ok);
check('and the channel greys the button out after', !T.canHaggle(Gh, heldSys, Gh.t));
var Gh2 = game(held, heldSys); T.onArrive(Gh2, heldSys, Gh2.t);
check('the same day, the same answer — a reload does not reroll it', T.haggle(Gh2, heldSys, Gh2.t).quote === h1.quote);

console.log('--- refusing ---');
var Gr = game(held, heldSys); T.onArrive(Gr, heldSys, Gr.t);
var qr = T.owed(Gr, heldSys, Gr.t);
var rr = T.refuse(Gr, heldSys, Gr.t);
check('refuse and you are SUSPECTED', rr.ok && T.suspected(Gr, heldSys, Gr.t), rr.say);
check('no haggling after that', !T.haggle(Gr, heldSys, Gr.t).ok);
check('the way back costs more', T.owed(Gr, heldSys, Gr.t) > qr, qr + ' → ' + T.owed(Gr, heldSys, Gr.t));
check('and costs you nothing with the law', !Object.keys(Gr.wanted).length && Gr.standing.outlaw === 0);
var Gs = game(held, heldSys); T.onArrive(Gs, heldSys, Gs.t);
check('silence is not an answer for a while', T.tick(Gs, heldSys, Gs.t + 60) === null);
var sil = T.tick(Gs, heldSys, Gs.t + T.SILENCE_S + 1);
check('and then it is a refusal', sil && T.suspected(Gs, heldSys, Gs.t + T.SILENCE_S + 1), sil && sil.say);
var late = T.pay(Gr, heldSys, Gr.t + 100, 'fixer');
check('paying late clears it', late.ok && T.paid(Gr, heldSys, Gr.t + 100), late.say);
check('the suspicion lasts a week, then lapses', (function () {
  var Gx = game(held, heldSys); T.onArrive(Gx, heldSys, Gx.t); T.refuse(Gx, heldSys, Gx.t);
  return T.status(Gx, heldSys, Gx.t + T.SUSPECT_DAYS * DAY + 1) === null;
})());

console.log('--- left alone, or not ---');
var pirate = heldSys.patrols.filter(function (p) { return p.kind === 'pirate'; })[0];
var mobCop = heldSys.patrols.filter(function (p) { return p.kind === 'police' && p.faction === 'outlaw'; })[0];
function wake(spec, mood) {
  var s = JSON.parse(JSON.stringify(spec)); s.live = null;
  var sysView = { tithe: mood };
  Sim.wakeNpc(s, Sim.patrolState(spec, heldSys, 3 * DAY) || { pos: { x: 1, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, right: { x: 0, y: 0, z: 1 } }, sysView);
  return s.mode;
}
check('the hold has pirates and the mob\'s own patrols', !!pirate && !!mobCop);
if (pirate) {
  check('an unpaid ship is intercepted', wake(pirate, null) === 'intercept');
  check('a paid one is looked at and left be', wake(pirate, 'paid') === 'shadow');
}
if (mobCop) {
  check('their patrol inspects a stranger', wake(mobCop, null) === 'inspect');
  check('and waves a paid ship through', wake(mobCop, 'paid') === 'shadow');
}
/* A pirate already holding you up sees the mark and goes. */
if (pirate) {
  var Gl = game(held, heldSys);
  var liveSys = Gen.generateSystem(held.seed, { faction: gal.factionById[held.factionId], allFactions: gal.factions });
  var pz = liveSys.patrols.filter(function (p) { return p.kind === 'pirate'; })[0];
  var ps = Sim.patrolState(pz, liveSys, 3 * DAY);
  var ship = { pos: { x: ps.pos.x + 1, y: ps.pos.y, z: ps.pos.z }, vel: ps.vel, docked: null, landed: false };
  liveSys.tithe = null;
  Sim.updateEncounters(liveSys, 3 * DAY, 0.1, ship);
  pz.mode = 'demand'; pz.demanding = true;
  liveSys.tithe = 'paid';
  Sim.updateEncounters(liveSys, 3 * DAY + 0.1, 0.1, ship);
  check('pay while held up and the pirate breaks off', pz.mode === 'breakoff' && pz.brokeOffBecause === 'tithe', pz.mode);
}

console.log('--- scans ---');
var Gq = game(held, heldSys); T.onArrive(Gq, heldSys, Gq.t); T.refuse(Gq, heldSys, Gq.t);
var said = [];
var hooks = { say: function (m) { said.push(m); } };
var rnd = Math.random; Math.random = function () { return 0.85; };
var copSpec = { name: 'Enforcer', faction: 'outlaw', kind: 'police' };
var sc1 = Combat.resolveScan(Gq, copSpec, hooks);
var Gc = game(held, heldSys);
var sc2 = Combat.resolveScan(Gc, copSpec, hooks);
Math.random = rnd;
check('a suspected ship is searched where a stranger would be waved on', sc1.searched && !sc2.searched, said.join(' | '));

console.log('--- the fixer takes it too ---');
check('a fixer and a Syndicate face both take the tithe',
      D.TOPICS.fixer.some(function (tp) { return tp.id === 'tithe'; }) && D.TOPICS.syndicate.some(function (tp) { return tp.id === 'tithe'; }));
var fixer = { id: 'test-fix|tithe', name: 'Mags Rask', role: 'fixer', liv: 'syn' };
var Gf = game(held, heldSys); Gf.ship.docked = synPort.id; T.onArrive(Gf, heldSys, Gf.t);
global.Game = Gf;
var stF = D.open(Gf, heldSys, synPort, fixer, Gf.t);
var oF = D.options(Gf, heldSys, synPort, stF), ti = -1;
oF.forEach(function (o, ix) { if (o.id === 'tithe') ti = ix; });
if (ti >= 0 && oF[ti].ok) {
  D.choose(Gf, heldSys, synPort, stF, ti);
  check('pay across the bar and it counts', T.paid(Gf, heldSys, Gf.t), stF.line);
} else {
  check('the fixer offers the tithe', ti >= 0 && oF[ti].ok, ti >= 0 ? oF[ti].why : oF.map(function (o) { return o.id; }).join(','));
}

console.log('--- saved ---');
var src = require('fs').readFileSync(path.join(SRC, 'save.js'), 'utf8');
check('who you have paid and refused is in the save', /tithe: G\.tithe/.test(src) && /G\.tithe = /.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
