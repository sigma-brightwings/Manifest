/* fleet.test.js — the harbour master's book, and the bill he sends.
 *
 *     node test/fleet.test.js
 *
 * Astra, on what a ship you are not flying should cost: "yeah, it does
 * cost money to keep it, but it's just a modest charge every week, not
 * every day. The charge is no more than a full fuel tank of that ship, or
 * 1500 cr, whichever is less."
 *
 * Most of this file is that sentence pinned down, plus the two things it
 * needs to be true of the world it lands in: that the crew stay with the
 * hull they signed on to, and that a bill nobody can pay does something
 * other than nothing.
 *
 * Every check here is arithmetic on a plain object. Nothing boots, nothing
 * draws, and no seed is generated — a berth fee that needed a star system
 * to quote would be the bug this file exists to prevent.
 */
global.window = global;
var Eco = require('../src/economy.js');
var Combat = require('../src/combat.js');
var Fleet = require('../src/fleet.js');
var Crew = require('../src/crew.js');

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

var DAY = 86400, WEEK = Fleet.BERTH_WEEK;

function shipOf(hullId, credits, crew) {
  var s = {};
  Combat.initShip(s);
  s.hullId = hullId || 'talon';
  s.credits = credits == null ? 100000 : credits;
  s.crew = crew || [];
  s.cargo = {}; s.fit = {};
  return s;
}
function person(role, rating) { return Crew.make(role + rating, role, rating); }
function gameAt(t, ship, fleet) {
  return { t: t, ship: ship, fleet: fleet || [] };
}
function parked(hullId, t, crew, name) {
  var rec = Fleet.record(shipOf(hullId, 0, crew), 'p1', name || 'Kestrel');
  rec.berthTo = rec.wagesTo = t;
  rec.portName = 'Ivy Deep';
  return rec;
}

console.log('--- the fee is a tank of fuel, capped ---');
(function () {
  var base = Eco.BY_ID[Eco.FUEL_ID].base;
  check('the cap is the number Astra gave', Fleet.BERTH_CAP === 1500);
  check('and the week is a week', WEEK === 7 * DAY);

  /* THE WHOLE POINT OF THE RULE, checked against every hull the game has
   * rather than against the two I happened to think about. */
  Object.keys(Combat.HULLS).forEach(function (id) {
    var h = Combat.HULLS[id];
    var want = Math.min(1500, Math.round(h.fuelCap * base));
    check(id + ' is a tank of hydrogen or 1500, whichever is less',
          Fleet.berthFee({ hullId: id }) === want,
          Fleet.berthFee({ hullId: id }) + ' vs ' + want);
    check(id + ' is never charged more than the cap',
          Fleet.berthFee({ hullId: id }) <= 1500);
  });

  /* A bigger tank is a bigger berth, up to the ceiling — the reason the
   * fee is priced off fuel at all rather than being one flat number. */
  var ids = Object.keys(Combat.HULLS).sort(function (a, b) {
    return Combat.HULLS[a].fuelCap - Combat.HULLS[b].fuelCap;
  });
  var smallest = Fleet.berthFee({ hullId: ids[0] });
  var biggest = Fleet.berthFee({ hullId: ids[ids.length - 1] });
  check('the smallest tank pays less than the largest', smallest < biggest,
        ids[0] + ' ' + smallest + ' vs ' + ids[ids.length - 1] + ' ' + biggest);

  /* THE PRICE IS THE REFERENCE PRICE, not the local one — a berth six
   * jumps away has to be quotable without generating a star system. The
   * test for that is that the call takes no port and no clock. */
  check('quoting a berth needs nothing but the record',
        Fleet.berthFee({ hullId: 'talon' }) === Fleet.berthFee({ hullId: 'talon', port: 'anywhere' }));
})();

console.log('--- weekly, not daily, and remainders are carried ---');
(function () {
  var rec = parked('kestrel', 0);
  check('six days owes nothing', Fleet.berthDue(rec, 6 * DAY).cr === 0);
  check('seven days owes one week', Fleet.berthDue(rec, 7 * DAY).weeks === 1);
  check('twenty days owes two', Fleet.berthDue(rec, 20 * DAY).weeks === 2);

  /* A charge that rounded up would bill a captain twice for docking twice
   * on a Tuesday. The carried remainder is what stops it. */
  var r2 = parked('kestrel', 0);
  var a = Fleet.berthDue(r2, 10 * DAY);
  r2.berthTo = a.berthTo;
  var b = Fleet.berthDue(r2, 10 * DAY + 3600);
  check('settling twice in one afternoon charges once',
        a.weeks === 1 && b.weeks === 0, a.weeks + ' then ' + b.weeks);
  check('and the unpaid days are still there to be paid later',
        Fleet.berthDue(r2, 14 * DAY).weeks === 1);

  /* A ship parked a moment ago is not a ship with a century of back rent:
   * a record whose clock was never started starts it now. */
  var fresh = Fleet.record(shipOf('talon'), 'p1', 'New');
  check('a record with no clock is not in arrears',
        fresh.berthTo === null && Fleet.berthDue(fresh, 500 * DAY).cr === 0);
})();

console.log('--- wages run on the same kind of clock ---');
(function () {
  var two = [person('gunner', 3), person('pilot', 5)];
  var rate = Crew.dailyWage(two[0]) + Crew.dailyWage(two[1]);
  var due = Crew.payrollDue(two, 0, 10 * DAY);
  check('ten days is ten days of both wages', due.cr === rate * 10,
        due.cr + ' vs ' + rate * 10);
  check('half a day is nothing yet', Crew.payrollDue(two, 0, DAY / 2).cr === 0);

  /* THE CLOCK ADVANCES ON AN EMPTY DECK. Left behind, it would hand the
   * next hand to sign on a month of back pay they were not there for. */
  var empty = Crew.payrollDue([], 0, 30 * DAY);
  check('an empty deck owes nothing', empty.cr === 0);
  check('but its clock still moves', empty.paidTo === 30 * DAY, empty.paidTo);
})();

console.log('--- the bill, settled at the desk ---');
(function () {
  var s = shipOf('talon', 100000, [person('gunner', 3)]);
  s.wagesTo = 0;
  var rec = parked('kestrel', 0, [person('pilot', 4)]);
  var G = gameAt(14 * DAY, s, [rec]);
  var before = s.credits;
  var lines = Fleet.settle(G, G.t);

  /* Asserted before it is spent: if the record had lost her pilot on the
   * way into the book, the arithmetic below would be measuring a different
   * ship and the failure would read as a pricing bug. */
  check('the parked ship still has the hand she was parked with',
        rec.crew.length === 1, JSON.stringify(rec.crew));
  var wageMine = Crew.dailyWage(s.crew[0]) * 14;
  var wageHers = rec.crew.length ? Crew.dailyWage(rec.crew[0]) * 14 : 0;
  var berth = Fleet.berthFee(rec) * 2;
  check('everything owed came out of one pocket',
        before - s.credits === wageMine + wageHers + berth,
        (before - s.credits) + ' vs ' + (wageMine + wageHers + berth));
  check('and every part of it was said out loud', lines.length === 3, lines.join(' | '));
  check('the clocks moved with the money',
        s.wagesTo === 14 * DAY && rec.wagesTo === 14 * DAY && rec.berthTo === 14 * DAY);

  /* AND SETTLING AGAIN CHANGES NOTHING. Docking, undocking and docking
   * again is the most ordinary thing a player does. */
  var mid = s.credits;
  var again = Fleet.settle(G, G.t);
  check('settling the same instant twice is free',
        s.credits === mid && again.length === 0, again.join(' | '));

  /* THE BERTH YOU ARE STANDING ON IS NOT CHARGED. A port charges for
   * storage, not for visiting. */
  var solo = shipOf('kestrel', 50000, []);
  solo.wagesTo = 0;
  var G2 = gameAt(60 * DAY, solo, []);
  Fleet.settle(G2, G2.t);
  check('the ship under your hands pays no berthing', solo.credits === 50000);
})();

console.log('--- and a bill nobody can pay ---');
(function () {
  /* PEOPLE FIRST: the deck under your feet, then the decks you left, then
   * the harbour master. */
  var s = shipOf('talon', 0, [person('gunner', 3)]);
  s.wagesTo = 0;
  var G = gameAt(30 * DAY, s, []);
  var lines = Fleet.settle(G, G.t);
  check('a crew that cannot be paid leaves', s.crew.length === 0);
  check('and says so', /PAYROLL/.test(lines.join(' ')), lines.join(' | '));
  check('nobody is charged into the red', s.credits >= 0, s.credits);

  /* Unpaid berthing is a debt before it is a seizure, and the debt is
   * visible on the record so the fleet page can show it. */
  var s2 = shipOf('talon', 0, []);
  s2.wagesTo = 0;
  var rec = parked('kestrel', 0, []);
  var G2 = gameAt(21 * DAY, s2, [rec]);
  Fleet.settle(G2, G2.t);
  check('an unpaid week becomes arrears', rec.arrears === Fleet.berthFee(rec) * 3,
        rec.arrears);
  check('and she is still yours', Fleet.list(G2).length === 1);

  /* Until the arrears pass what she is worth. On a Kestrel that is well
   * over a year of never once paying, which is the warning the rule owes
   * the player before it takes a ship. */
  var weeks = Math.ceil(Fleet.resale(rec) / Fleet.berthFee(rec)) + 1;
  check('foreclosure is a long way off', weeks > 20, weeks + ' weeks');
  var G3 = gameAt(weeks * WEEK, s2, [rec]);
  Fleet.settle(G3, G3.t);
  check('but it does come', Fleet.list(G3).length === 0);
  check('and it pays out nothing', s2.credits === 0, s2.credits);

  /* A TEST THAT PASSES WITH THE FIX REVERTED IS NOT A TEST: if arrears
   * never accumulated, the hull would survive this forever. */
  var rec2 = parked('kestrel', 0, []);
  var s3 = shipOf('talon', 0, []);
  s3.wagesTo = 0;
  var G4 = gameAt(WEEK, s3, [rec2]);
  for (var w = 1; w <= weeks; w++) { G4.t = w * WEEK; Fleet.settle(G4, G4.t); }
  check('a week at a time gets to the same place', Fleet.list(G4).length === 0);
})();

console.log('--- the crew stay with the hull ---');
(function () {
  /* The bug this replaced: Fleet.record wrote `crew: []`, so keeping a
   * ship quietly dismissed everybody aboard her. */
  var s = shipOf('kestrel', 0, [person('pilot', 4), person('gunner', 2)]);
  var rec = Fleet.record(s, 'p1', 'Old Girl');
  check('a parked ship keeps her people', rec.crew.length === 2);
  check('and they are the same people', rec.crew[0].id === s.crew[0].id);
  check('a ship with a pilot aboard can be ordered', Crew.canBeOrdered(rec));

  /* Copied, not shared: paying somebody off aboard the new ship must not
   * reach into the roster of the one on the clamp. */
  s.crew.length = 0;
  check('the roster was copied, not borrowed', rec.crew.length === 2);
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
