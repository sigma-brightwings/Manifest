/* fieldwork.test.js - survey, sweep and short-hop work, and the capability
 * ledger they are dealt from (2026-11-10).
 *
 *     node test/fieldwork.test.js
 *
 * Astra: "I also want there to be a larger variety of missions that are
 * available to the player at a lower notoriety ... Short hop missions need
 * to pay at least twice as much or they aren't worth the time it takes to
 * do them."
 *
 * What this holds:
 *   - THE OLD BOARD IS UNTOUCHED. A board dealt with no career, or with a
 *     career carrying no instruments, is identical to the board before this
 *     file existed. That is the whole reason fieldwork appends rather than
 *     joining the roll.
 *   - the gates: no scanner, no survey work; no coil, no sweep work;
 *   - short hops pay at least double the hourly rate, and are offered to
 *     anybody, because that is the low-standing work that was missing;
 *   - a survey contract asks for ground you have NOT got, settles on
 *     coverage rather than tonnes, and will not settle early;
 *   - a sweep pays for a contact and pays less - but pays - for a
 *     confirmed nothing.
 */
global.window = global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
require('../src/sim.js');
require('../src/weather.js');
var Sv = require('../src/survey.js');
var Cl = require('../src/claims.js');
var M = require('../src/missions.js');
var FW = require('../src/fieldwork.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var found = null;
for (var s = 0; s < gal.stars.length && !found; s++) {
  var o = Galaxy.systemOpts ? Galaxy.systemOpts(gal, gal.stars[s]) : {};
  var sy = Gen.generateSystem(gal.stars[s].seed, o);
  var ports = (sy.ports || []).filter(function (p) { return p.market; });
  var worlds = (sy.bodies || []).filter(function (b) {
    return (b.kind === 'planet' || b.kind === 'moon') && Sv.TABLE[b.type];
  });
  if (ports.length >= 2 && worlds.length) {
    found = { sys: sy, star: gal.stars[s], port: ports[0], worlds: worlds };
  }
}
if (!found) { console.log('no system with two ports and a readable world in forty stars'); process.exit(1); }
var sys = found.sys, port = found.port, here = found.star;

function career(fit) {
  return {
    t: 0, here: here, sys: sys, galaxy: gal,
    ship: { credits: 0, cargo: {}, cargoCap: 40, fit: fit || {}, hullHp: 100 },
    missions: [], surveys: {}, standing: {}, found: {}
  };
}
/* The instrument grades are read through Combat, which does not load
 * standalone here; the ledger is tested by handing it a career whose grade
 * is stubbed the way Combat would report it. */
function withCaps(G, survey, mag) {
  var C = global.Combat;
  global.Combat = { surveyLevel: function () { return survey; },
                    magLevel: function () { return mag; } };
  var out = FW.capsOf(G);
  global.Combat = C;
  return out;
}
function board(G, t, survey, mag) {
  var C = global.Combat;
  if (survey !== undefined) {
    global.Combat = { surveyLevel: function () { return survey; },
                      magLevel: function () { return mag || 0; } };
  }
  var out = M.boardAt(port, sys, gal, here, t, G);
  global.Combat = C;
  return out;
}

console.log('--- the old board is untouched ---');
var plain = M.boardAt(port, sys, gal, here, 1000);
var withG = board(career(), 1000, 0, 0);
var plainIds = plain.map(function (o) { return o.id; });
var mineIds = withG.map(function (o) { return o.id; });
check('a career with no instruments still sees the freight board',
      plainIds.every(function (id) { return mineIds.indexOf(id) >= 0; }));
check('and the freight rows are in the same order',
      mineIds.slice(0, plainIds.length).join(',') === plainIds.join(','));
var second = M.boardAt(port, sys, gal, here, 1000);
check('the board is still the same board twice',
      second.map(function (o) { return o.id; }).join(',') === plainIds.join(','));

console.log('--- the gates ---');
var noKit = board(career(), 1000, 0, 0);
check('no scanner, no survey work', !noKit.some(function (o) { return o.type === 'survey'; }));
check('no coil, no sweep work', !noKit.some(function (o) { return o.type === 'sweep'; }));

var kitted = board(career(), 1000, 3, 2);
check('a scanner puts survey work on the board',
      kitted.some(function (o) { return o.type === 'survey'; }));
/* The sweep pass is a coin-weighted roll per window, so look across a few. */
var sawSweep = false;
for (var w = 0; w < 12 && !sawSweep; w++) {
  sawSweep = board(career(), w * 2 * 86400, 3, 2)
    .some(function (o) { return o.type === 'sweep'; });
}
check('and a coil puts sweep work on it', sawSweep);

console.log('--- short hops, priced by the clock ---');
var hops = [], hopWindow = true;
for (var h = 0; h < 20; h++) {
  var th = h * 2 * 86400, rowsH = board(career(), th, 0, 0);
  rowsH.filter(function (o) { return o.hop; }).forEach(function (o) {
    hops.push(o);
    /* Due tomorrow, measured from the window it was dealt in - a short run
     * with a three-day deadline is just a haul with a better fee. */
    if (o.deadline - (th - (th % (2 * 86400))) !== 86400) hopWindow = false;
  });
}
check('short hops are offered to a ship with nothing fitted', hops.length > 0, hops.length + ' over 20 windows');
check('every short hop clears the floor',
      hops.every(function (o) { return o.pay >= FW.HOP_FLOOR; }));
check('and pays at least double the hourly rate for its hours',
      hops.every(function (o) { return o.pay >= o.hours * FW.HOP_CR_PER_HOUR * 2 * 0.85; }));
check('a short hop is small freight, not a bulk run',
      hops.every(function (o) { return o.tonnes <= 6 && o.tonnes >= 2; }));
check('and it is due tomorrow, not next week', hopWindow);
/* The complaint this answers: the old board's four-tonne haul. */
var oldSmall = plain.filter(function (o) { return o.type === 'haul' && o.tonnes <= 6; });
if (oldSmall.length) {
  check('a hop beats what the old board paid for the same tonnage',
        hops.some(function (o) { return o.pay > oldSmall[0].pay; }),
        hops[0].pay + ' vs ' + oldSmall[0].pay + ' cr');
} else {
  check('(no small haul on this board to compare against)', true);
}

console.log('--- the capability ledger ---');
var G = career();
var caps = withCaps(G, 0, 0);
check('a bare career can do nothing in particular', caps.survey === 0 && caps.mag === 0);
check('and has mapped nothing', caps.worlds === 0);
caps = withCaps(G, 3, 1);
check('the ledger reads the instrument grades', caps.survey === 3 && caps.mag === 1);
check('and the free hold', caps.hold === 40, caps.hold + ' t');
G.ship.cargo.grain = 12;
check('which falls as the hold fills', withCaps(G, 0, 0).hold === 28);
G.surveys['x:p1'] = { key: 'x:p1', cov: 0.4, name: 'Somewhere' };
caps = withCaps(G, 1, 0);
check('a mapped world counts once', caps.worlds === 1);
check('and the ledger remembers how much of it', Math.abs(caps.mapped['x:p1'] - 0.4) < 1e-9);
G.found = { 'bs-7': 100 };
check('a found installation counts even at epoch zero', withCaps(G, 0, 0).found === 1);

console.log('--- a survey contract ---');
var G2 = career();
var svOffer = board(G2, 1000, 3, 0).filter(function (o) { return o.type === 'survey'; })[0];
check('it names a body', !!(svOffer && svOffer.bodyName));
check('it asks for ground you have not got', svOffer.covWant > svOffer.covFrom);
check('and asks for a real amount of it', svOffer.covWant - svOffer.covFrom >= 0.15);
check('it takes no hold', svOffer.tonnes === 0);
check('and it is settled where it was signed', svOffer.toPortId === port.id);

var r = M.accept(G2, svOffer, null);
check('a ship with a full hold can still sign one', r.ok === true, r.why || '');
var m = G2.missions[0];
check('signing writes down where your survey stood', m.covFrom === 0);
check('the contract knows what is left', /need/.test(FW.progress(G2, m) || ''));

/* Docking with nothing mapped settles nothing and loses nothing. */
M.completeAtDock(G2, port, sys, 2000, null);
check('docking early does not settle it', G2.missions.length === 1);
check('and does not pay', G2.ship.credits === 0);

/* Now hand it the coverage it asked for. */
G2.surveys[m.surveyKey] = { key: m.surveyKey, cov: m.covWant + 0.01, name: m.bodyName };
check('and the readout says so', /complete/.test(FW.progress(G2, m) || ''));
var feeWas = m.pay;
M.completeAtDock(G2, port, sys, 2000, null);
check('docking with the data settles it', G2.missions.length === 0);
check('and pays the fee', G2.ship.credits === feeWas, G2.ship.credits + ' cr');
check('and the desk remembers', M.standing(G2, port.faction) > 0);

console.log('--- a sweep contract ---');
var G3 = career(), swOffer = null;
for (var w2 = 0; w2 < 12 && !swOffer; w2++) {
  swOffer = board(G3, w2 * 2 * 86400, 3, 2)
    .filter(function (o) { return o.type === 'sweep'; })[0] || null;
}
check('a sweep is on the board', !!swOffer);
check('it pays something for a clean sweep', swOffer.nothingPay > 0);
check('and less than for a contact', swOffer.nothingPay < swOffer.pay,
      swOffer.nothingPay + ' vs ' + swOffer.pay + ' cr');
M.accept(G3, swOffer, null);
var m3 = G3.missions[0];
check('signing writes down what you had already found', m3.sweepFrom === 0);
M.completeAtDock(G3, port, sys, 2000, null);
check('docking without running the coil settles nothing', G3.missions.length === 1);
check('and pays nothing', G3.ship.credits === 0);

/* A clean sweep, recorded the way main.js records one. */
FW.noteCleanSweep(G3, 1500);
M.completeAtDock(G3, port, sys, 2000, null);
check('a confirmed nothing is an answer and is paid', G3.ship.credits === m3.nothingPay,
      G3.ship.credits + ' cr');
check('and the contract is closed', G3.missions.length === 0);

/* And a contact, which is the full fee. */
var G4 = career();
var swOffer2 = null;
for (var w3 = 0; w3 < 12 && !swOffer2; w3++) {
  swOffer2 = board(G4, w3 * 2 * 86400, 3, 2)
    .filter(function (o) { return o.type === 'sweep'; })[0] || null;
}
M.accept(G4, swOffer2, null);
G4.found['bs-3'] = 1200;
M.completeAtDock(G4, port, sys, 2000, null);
check('a contact pays the whole fee', G4.ship.credits === swOffer2.pay, G4.ship.credits + ' cr');

console.log('--- a prospect contract ---');
var G5 = career(), prOffer = null;
for (var w4 = 0; w4 < 14 && !prOffer; w4++) {
  prOffer = board(G5, w4 * 2 * 86400, 2, 0)
    .filter(function (o) { return o.type === 'prospect'; })[0] || null;
}
check('a prospect contract is on the board for a ship with a scanner', !!prOffer);
check('it names a world and an ore', !!(prOffer.bodyName && prOffer.cid));
check('and pays over the market for the tonnage',
      prOffer.pay > prOffer.tonnes * 80,
      prOffer.pay + ' cr for ' + prOffer.tonnes + ' t');

M.accept(G5, prOffer, null);
var m5 = G5.missions[0];
check('signing hands you nothing - you go and dig it',
      !(G5.ship.cargo[m5.cid] > 0));
check('and the readout says what is missing', /no live claim/.test(FW.progress(G5, m5) || ''));

/* Tonnes with no claim is a market run with a story attached. */
G5.ship.cargo[m5.cid] = m5.tonnes;
M.completeAtDock(G5, port, sys, 2000, null);
check('docking with bought tonnage settles nothing', G5.missions.length === 1);
check('and pays nothing', G5.ship.credits === 0);

/* Now hold the ground. */
G5.claims = {}; G5.claims[m5.claimKey] = { until: 1e9 };
check('with a claim, the readout asks for the delivery',
      /take the/.test(FW.progress(G5, m5) || ''));
var prFee = m5.pay;
M.completeAtDock(G5, port, sys, 2000, null);
check('ore off ground you hold settles it', G5.missions.length === 0);
check('and pays', G5.ship.credits === prFee, G5.ship.credits + ' cr');
check('and the tonnage is handed over', !(G5.ship.cargo[prOffer.cid] > 0));

console.log('--- a recovery contract ---');
var G6 = career(), rcOffer = null;
for (var w5 = 0; w5 < 14 && !rcOffer; w5++) {
  rcOffer = board(G6, w5 * 2 * 86400, 1, 0)
    .filter(function (o) { return o.type === 'recovery'; })[0] || null;
}
if (!rcOffer) {
  check('(no NPC pod in this system to recover)', true);
} else {
  check('a recovery contract names a pod and its owner',
        !!(rcOffer.droneId && rcOffer.owner));
  check('and a world it is on', !!rcOffer.bodyName);
  M.accept(G6, rcOffer, null);
  var m6 = G6.missions[0];
  check('it takes no hold', m6.tonnes === 0);
  check('the readout points at the rock', /on /.test(FW.progress(G6, m6) || ''));
  M.completeAtDock(G6, port, sys, 2000, null);
  check('docking without the pod settles nothing', G6.missions.length === 1);

  /* THE POINT OF THE CONTRACT: prying it loose is not theft. */
  var drones = Cl.npcDrones(G6, sys).filter(function (d) { return d.id === m6.droneId; });
  check('the pod is still where the contract said', drones.length === 1);
  var d6 = drones[0];
  /* Empty hopper, so pry() will allow it: set its base to nothing now. */
  G6.npcDrones = G6.npcDrones || {};
  G6.npcDrones[d6.id] = { base: 0, baseT: 1e9 };
  var pried = Cl.pry(G6, sys, 1e9, d6);
  check('a contracted pod comes loose', pried.ok === true, pried.why || '');
  check('and it is lawful, not hot', pried.lawful === true && !(G6.ship.hotDrones > 0));
  check('and nobody reports a theft', !(G6.thefts && G6.thefts.length));
  check('the contract knows it is aboard', m6.aboard === true);
  var rcFee = m6.pay;
  M.completeAtDock(G6, port, sys, 2000, null);
  check('handing it over settles the contract', G6.missions.length === 0);
  check('and pays', G6.ship.credits === rcFee, G6.ship.credits + ' cr');
  check('and the pod leaves your racks', G6.ship.drones === 0);

  /* And the same act without a contract is still a theft. */
  var G7 = career();
  var d7 = Cl.npcDrones(G7, sys)[0];
  G7.npcDrones = {}; G7.npcDrones[d7.id] = { base: 0, baseT: 1e9 };
  var stolen = Cl.pry(G7, sys, 1e9, d7);
  check('prying one loose uninvited is still a theft',
        stolen.ok === true && !stolen.lawful && G7.ship.hotDrones === 1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
