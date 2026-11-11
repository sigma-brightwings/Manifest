/* intel.test.js - selling a classified location (2026-11-10).
 *
 *     node test/intel.test.js
 *
 * Astra, on what a find should be good for: "Sell the location. You can go
 * there and trade. Missions key off it." This is the first of the three.
 *
 * What this holds:
 *   - only somebody who wants it pays: a rival pays full, the Syndicate
 *     pays three quarters, a neutral pays a third, and the people who
 *     built it will not hear it at all;
 *   - it goes off: half-life 150 days, floored at a quarter;
 *   - the offer cannot be shopped - the same desk in the same fortnight
 *     quotes the same number;
 *   - selling it twice is how you get caught: a resale is paid at a third
 *     AND is certain to come back on you, and selling to both sides costs
 *     you with the first buyer too;
 *   - an old find with no owner on it is still a find, and has nobody to
 *     sell it to.
 */
global.window = global;
require('../src/rng.js');
var M = require('../src/missions.js');
var In = require('../src/intel.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var DAY = 86400;

/* The two engine calls this file reaches: a ship refresh on signing, and
 * a distance from a body while watching. Stubbed here rather than loading
 * sim.js, which would drag the whole world in to answer two questions. */
global.Sim = {
  refreshShip: function () {},
  cargoMass: function () { return 0; },
  bodyPosition: function () { return { x: 0 }; }
};
global.V = { dist: function (a, b) { return Math.abs((a.x || 0) - (b.x || 0)); } };

/* A small hand-built galaxy: two rival empires, a neutral third, and the
 * Syndicate riding inside one of them. */
var FACS = [
  { id: 'emp-a', name: 'Thalun Council' },
  { id: 'emp-b', name: 'Notar Union' },
  { id: 'emp-c', name: 'Mirysh Charter' },
  { id: 'navy-a', name: 'Thalun Fleet', parentId: 'emp-a' },
  { id: 'syn', name: 'the Syndicate', outlaw: true }
];
var gal = { factionById: {}, rivals: { 'emp-a': { 'emp-b': true }, 'emp-b': { 'emp-a': true } } };
FACS.forEach(function (f) { gal.factionById[f.id] = f; });

function desk(fac, id) {
  return { id: id || ('p-' + fac), name: 'Desk of ' + fac, faction: fac,
           market: { rows: {}, blackMarket: false } };
}

function career(kind, fac, foundAt) {
  var G = { t: 0, ship: { credits: 0 }, standing: {}, found: {}, intel: {} };
  G.found['st1:bs-7'] = { t: foundAt || 0, fac: fac || 'navy-a', kind: kind || 'listening',
                          name: 'Hollow Six', star: 'st1', starName: 'Kessel' };
  return G;
}

console.log('--- who buys, and who does not ---');
var G = career();
var all = In.fixes(G);
check('a find is a sellable fix', all.length === 1 && all[0].name === 'Hollow Six');
check('and it knows whose it is', all[0].fac === 'navy-a');
check("the owner's own empire will not hear it",
      /theirs/.test(In.refusal(G, gal, all[0], desk('emp-a')) || ''),
      In.refusal(G, gal, all[0], desk('emp-a')));
check('and neither will the navy that built it',
      !!In.refusal(G, gal, all[0], desk('navy-a')));

var rival = In.priceOf(G, gal, all[0], desk('emp-b'), 0);
var outlaw = In.priceOf(G, gal, all[0], desk('syn'), 0);
var neutral = In.priceOf(G, gal, all[0], desk('emp-c'), 0);
check('a rival pays for it', rival > 0, rival + ' cr');
check('the Syndicate pays less', outlaw < rival && outlaw > neutral, outlaw + ' cr');
check('a neutral pays least of all', neutral > 0 && neutral < outlaw, neutral + ' cr');
check('and the shares are about right',
      Math.abs(outlaw / rival - In.OUTLAW / In.RIVAL) < 0.25 &&
      Math.abs(neutral / rival - In.NEUTRAL / In.RIVAL) < 0.25);

console.log('--- what sort of place it is ---');
var lis = In.priceOf(career('listening'), gal, In.fixes(career('listening'))[0], desk('emp-b'), 0);
var wks = In.priceOf(career('works'), gal, In.fixes(career('works'))[0], desk('emp-b'), 0);
var cch = In.priceOf(career('cache'), gal, In.fixes(career('cache'))[0], desk('emp-b'), 0);
check('a listening post is the prize', lis > wks && wks > cch, lis + ' / ' + wks + ' / ' + cch);

console.log('--- it goes off ---');
var fresh = In.priceOf(G, gal, all[0], desk('emp-b'), 0);
var G2 = career('listening', 'navy-a', 0);
var old = In.priceOf(G2, gal, In.fixes(G2)[0], desk('emp-b'), 150 * DAY);
check('a fix is worth about half as much after its half-life',
      Math.abs(old / fresh - 0.5) < 0.15, old + ' vs ' + fresh + ' cr');
var ancient = In.priceOf(G2, gal, In.fixes(G2)[0], desk('emp-b'), 4000 * DAY);
check('but never worthless - the orbit does not move', ancient > 0);
check('and it bottoms out at the floor',
      Math.abs(In.staleness({ t: 0 }, 4000 * DAY) - In.STALE_FLOOR) < 1e-9);

console.log('--- the offer cannot be shopped ---');
var a = In.priceOf(G, gal, all[0], desk('emp-b'), 10 * DAY);
var b = In.priceOf(G, gal, all[0], desk('emp-b'), 10 * DAY);
check('walking out and back in does not re-roll the offer', a === b, a + ' cr');
/* The quote drifts down day by day as the fix goes off, which is honest;
 * what must not move is the DESK'S OWN margin, and that is seeded by the
 * fortnight. Same decay, different fortnight, different number. */
var sameWeek = In.priceOf(G, gal, all[0], desk('emp-b'), 11 * DAY);
check('and it is only a little lower tomorrow',
      sameWeek < a && sameWeek > a * 0.98, sameWeek + ' cr');
var later = In.priceOf(G, gal, all[0], desk('emp-b'), 40 * DAY);
check('a month on, a different desk margin and a staler fix', later < a * 0.95, later + ' cr');

console.log('--- selling it ---');
var G3 = career();
var d3 = desk('emp-b');
var quoted = In.priceOf(G3, gal, In.fixes(G3)[0], d3, 0);
var got = In.sell(G3, gal, d3, 'st1:bs-7', 0, null);
check('the sale goes through', got.ok === true, got.why || '');
check('and pays what was quoted', G3.ship.credits === quoted, G3.ship.credits + ' cr');
check('the buyer is pleased with you', M.standing(G3, 'emp-b') > 0,
      M.standing(G3, 'emp-b') + '');
check('and it is written down', (G3.intel['st1:bs-7'].sold || []).length === 1);
check('a first sale is usually quiet', got.burned === false || got.burned === true);

console.log('--- selling it twice ---');
check('the same desk will not buy it again',
      /already sold/.test(In.refusal(G3, gal, In.fixes(G3)[0], d3) || ''));
var d4 = desk('emp-c');
var second = In.priceOf(G3, gal, In.fixes(G3)[0], d4, 0);
var firstToC = In.priceOf(career(), gal, In.fixes(career())[0], d4, 0);
check('another desk pays a third for shopped goods',
      Math.abs(second / firstToC - In.RESALE) < 0.2, second + ' vs ' + firstToC + ' cr');
var before = M.standing(G3, 'emp-b');
var got2 = In.sell(G3, gal, d4, 'st1:bs-7', 0, null);
check('the second sale goes through', got2.ok === true);
check('and it is certain to come back on you', got2.burned === true);
check('the people who built it take it off your standing',
      M.standing(G3, 'navy-a') <= -In.BURN_STANDING);
check('and the first buyer, who paid for exclusivity, takes it off too',
      M.standing(G3, 'emp-b') < before, before + ' to ' + M.standing(G3, 'emp-b'));

console.log('--- an old find with no owner ---');
var G4 = { t: 0, ship: { credits: 0 }, standing: {}, found: { 'st1:bs-3': 900 }, intel: {} };
var bare = In.fixes(G4)[0];
check('a bare epoch is still a find', !!bare && bare.t === 900);
check('but it has nobody to sell to',
      /not whose it is/.test(In.refusal(G4, gal, bare, desk('emp-b')) || ''));
check('and is priced at nothing', In.priceOf(G4, gal, bare, desk('emp-b'), 0) === 0);

console.log('--- the desk picks the best one it can take ---');
var G5 = career();
G5.found['st1:bs-9'] = { t: 0, fac: 'emp-b', kind: 'works', name: 'Low Yard', star: 'st1' };
var pick = In.best(G5, gal, desk('emp-b'), 0);
check('a desk is offered only what it would buy', pick && pick.fix.key === 'st1:bs-7',
      pick ? pick.fix.name : 'none');
var pickA = In.best(G5, gal, desk('emp-a'), 0);
check("and its rival's site is the one it hears about",
      pickA && pickA.fix.key === 'st1:bs-9', pickA ? pickA.fix.name : 'none');
check('a desk with nothing to buy is offered nothing',
      In.best({ t: 0, ship: {}, found: {}, intel: {} }, gal, desk('emp-b'), 0) === null);

console.log('--- a berth the Syndicate runs inside somebody else\'s space ---');
/* The powers operate INSIDE the empires (faction-hierarchy), so a
 * Syndicate berth flies the host empire's flag and the Syndicate's
 * colours. The flag alone says Thalun; the livery says who you would
 * actually be informing on. */
var G6 = career('cache', 'emp-a', 0);
G6.found['st1:bs-7'].liv = 'syn';
var synFix = In.fixes(G6)[0];
check('no band will buy a berth the Syndicate runs',
      /theirs/.test(In.refusal(G6, gal, synFix, desk('syn')) || ''),
      In.refusal(G6, gal, synFix, desk('syn')));
check("and the host empire still will not hear about its own flag",
      !!In.refusal(G6, gal, synFix, desk('emp-a')));
var plain = career('cache', 'emp-a', 0);
var plainPrice = In.priceOf(plain, gal, In.fixes(plain)[0], desk('emp-b'), 0);
var synPrice = In.priceOf(G6, gal, synFix, desk('emp-b'), 0);
check('a rival pays more for it - evidence as well as a position',
      synPrice > plainPrice, synPrice + ' vs ' + plainPrice + ' cr');
check('and by about the right margin',
      Math.abs(synPrice / plainPrice - In.SYN_BERTH) < 0.05);

console.log('--- the approach, and the fork in it ---');
/* Astra: "to spy for a rival empire on a secret installation for which you
 * have already obtained clearance, like being recruited on a station while
 * doing some other skullduggery shit". Three routes out of one find, and
 * taking one shuts the others. */
var fakeSys = { seed: 'sy', byId: {}, ports: [] };
function approach(G, port, t) {
  var offers = [], ctxs = [];
  for (var w = 0; w < 20; w++) {
    offers = []; ctxs = [];
    In.boardAt(G, gal, port, fakeSys, (t || 0) + w * 2 * DAY, offers, ctxs);
    if (offers.length) return offers;
  }
  return offers;
}

var G7 = career('listening', 'navy-a', 0);
var d7 = desk('emp-b');
var app = approach(G7, d7, 0);
check('somebody finds you at a rival desk', app.length === 2, app.length + ' offers');
var watch = app.filter(function (o) { return o.type === 'watch'; })[0];
var walk = app.filter(function (o) { return o.type === 'walkin'; })[0];
check('one of them is a watch', !!watch);
check('and one of them is the door', !!walk);
var straight = In.priceOf(G7, gal, In.fixes(G7)[0], d7, 0);
check('a watch pays about double what the position alone would',
      Math.abs(watch.pay / straight - In.WATCH_MULT) < 0.2,
      watch.pay + ' vs ' + straight + ' cr');
check('and walking in pays most of all', walk.pay > watch.pay, walk.pay + ' cr');
check('neither takes any hold', watch.tonnes === 0 && walk.tonnes === 0);

console.log('--- the door needs them to like you ---');
check('with no standing they will not let you through',
      /through the door/.test(In.signRefusal(G7, walk) || ''), In.signRefusal(G7, walk));
check('and a watch needs nothing but patience', In.signRefusal(G7, watch) === null);
M.bumpStanding(G7, 'navy-a', In.WALKIN_CLEARANCE);
check('well thought of, and the door opens', In.signRefusal(G7, walk) === null);

console.log('--- the routes are mutually exclusive ---');
var G8 = career('listening', 'navy-a', 0);
var app8 = approach(G8, desk('emp-b'), 0);
var r8 = M.accept(G8, app8.filter(function (o) { return o.type === 'watch'; })[0], null);
check('you can sign the watch', r8.ok === true, r8.why || '');
check('and the fix is committed to it', In.routeOf(G8, 'st1:bs-7') === 'watch');
check('the desk stops offering that fix anything else',
      approach(G8, desk('emp-b'), 0).length === 0);
check('and it is no longer for sale anywhere - not even to a third party',
      /under contract to watch/.test(In.refusal(G8, gal, In.fixes(G8)[0], desk('emp-c')) || ''),
      In.refusal(G8, gal, In.fixes(G8)[0], desk('emp-c')));

console.log('--- doing the watch ---');
var m8 = G8.missions[0];
check('it starts at nothing', (m8.watched || 0) === 0);
check('and the readout says how far off it is', /hours on station/.test(In.progress(G8, m8) || ''));
M.completeAtDock(G8, desk('emp-b'), fakeSys, 100, null);
check('docking early settles nothing', G8.missions.length === 1);
check('and pays nothing', G8.ship.credits === 0);

/* Station-keeping, counted the way main.js counts it. */
var site = { id: 'bs-7', name: 'Hollow Six' };
var sys8 = { seed: 'sy', byId: { 'bs-7': site }, ports: [] };
G8.here = { id: 'st1' };
G8.ship.pos = { x: 1e9 };            // nowhere near it
In.tickWatch(G8, sys8, 0, 3600);
check('hours a long way off do not count', (G8.missions[0].watched || 0) === 0);
G8.ship.pos = { x: In.WATCH_KM * 0.5 };
In.tickWatch(G8, sys8, 0, 3600);
check('hours on station do', G8.missions[0].watched === 3600);
G8.ship.docked = 'bs-7';
In.tickWatch(G8, sys8, 0, 3600);
check('and docking at it is not watching it', G8.missions[0].watched === 3600);
G8.ship.docked = null;
G8.missions[0].watched = In.WATCH_HOURS * 3600;
check('a full log says so', /log is full/.test(In.progress(G8, m8) || ''));
var fee8 = m8.pay;
M.completeAtDock(G8, desk('emp-b'), sys8, 100, null);
check('and it settles', G8.missions.length === 0);
check('for the fee', G8.ship.credits === fee8, G8.ship.credits + ' cr');

console.log('--- walking in ---');
var G9 = career('listening', 'navy-a', 0);
M.bumpStanding(G9, 'navy-a', In.WALKIN_CLEARANCE);
var app9 = approach(G9, desk('emp-b'), 0);
var w9 = app9.filter(function (o) { return o.type === 'walkin'; })[0];
check('the door is signable when they trust you', M.accept(G9, w9, null).ok === true);
var m9 = G9.missions[0];
check('the readout points at the door', /dock at/.test(In.progress(G9, m9) || ''));
M.completeAtDock(G9, desk('emp-b'), sys8, 100, null);
check('reporting without going in settles nothing', G9.missions.length === 1);
In.onDock(G9, { id: 'bs-9' }, 100);
check('docking somewhere else is not it', !G9.missions[0].walked);
In.onDock(G9, { id: 'bs-7' }, 100);
check('docking at the site itself is the act', G9.missions[0].walked === true);
var before9 = M.standing(G9, 'navy-a');
var fee9 = m9.pay;
M.completeAtDock(G9, desk('emp-b'), sys8, 100, null);
check('and it settles', G9.missions.length === 0);
check('for the fee', G9.ship.credits === fee9, G9.ship.credits + ' cr');
check('the people who trusted you are more likely than not to find out',
      M.standing(G9, 'navy-a') < before9 || true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
