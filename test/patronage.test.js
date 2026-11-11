/* patronage.test.js - business brought to a faction buys goodwill
 * (2026-11-10).
 *
 *     node test/patronage.test.js
 *
 * Astra: "You should also gain faction level by bringing good trade to that
 * faction, say an increase of 2 for every 100,000 cr in berth fees and fuel
 * and stuff (equipment, ships and modules) you've bought from faction
 * stations?" - services only, capped around +25.
 *
 * What this holds:
 *   - the rate: +2 per 100,000 cr, counted on the running total rather than
 *     per bill, so ten small top-ups are worth one big one;
 *   - the cap: spending alone never buys more than +25, and flown work
 *     still carries you past it;
 *   - what does not count: nothing, a refund, an unflagged port;
 *   - the books are per faction, and a bare faction id stands in for a port
 *     because Fleet.settle pays berths with no system in hand;
 *   - a marked career buys nothing, because the marks guard outranks money.
 */
global.window = global;
require('../src/rng.js');
var M = require('../src/missions.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var PER = M.PATRON_PER, STEP = M.PATRON_STEP, CAP = M.PATRON_CAP;
function fresh() { return { ship: { credits: 0 }, t: 0 }; }
var PORT = { id: 'p1', name: 'Hoyle Yard', faction: 'emp-a' };

console.log('--- the rate ---');
check('a step is a hundred thousand credits of services', PER === 100000, PER + ' cr');
check('a step is worth two points of standing', STEP === 2);
check('spending alone never buys more than twenty-five', CAP === 25);

var G = fresh();
check('just short of a step pays nothing', M.patronage(G, PORT, PER - 1, 'fuel') === 0);
check('and leaves standing where it was', M.standing(G, 'emp-a') === 0);
check('the credit that completes it pays the step', M.patronage(G, PORT, 1, 'fuel') === STEP);
check('and the standing is actually granted', M.standing(G, 'emp-a') === STEP);

/* The ledger counts the running total, not each bill on its own - which is
 * the whole reason it is a ledger and not a per-purchase bonus. */
G = fresh();
for (var i = 0; i < 10; i++) M.patronage(G, PORT, PER / 10, 'fuel');
check('ten small bills add up to one step', M.standing(G, 'emp-a') === STEP);

console.log('--- the cap ---');
G = fresh();
check('one enormous bill stops at the cap', M.patronage(G, PORT, PER * 100, 'hull') === CAP);
check('standing stops there too', M.standing(G, 'emp-a') === CAP);
check('and spending past it buys nothing more', M.patronage(G, PORT, PER * 100, 'hull') === 0);
check('the cap holds', M.standing(G, 'emp-a') === CAP);

/* The cap is on what SPENDING bought, not on standing: work you flew for
 * them still carries you past it. */
G = fresh();
M.patronage(G, PORT, PER * 100, 'hull');
M.bumpStanding(G, 'emp-a', 30);
check('flown work still raises you above the spending cap',
      M.standing(G, 'emp-a') > CAP, M.standing(G, 'emp-a') + '');

console.log('--- what does not count ---');
G = fresh();
check('a free top-up buys nothing', M.patronage(G, PORT, 0, 'fuel') === 0);
check('a trade-in that pays you out buys nothing',
      M.patronage(G, PORT, -PER * 3, 'hull') === 0);
check('and neither moves the number', M.standing(G, 'emp-a') === 0);
check('an unflagged port has no desk to be grateful',
      M.patronage(G, { id: 'x', name: 'Nowhere', faction: null }, PER, 'fuel') === 0);
check('and no career, no ledger', M.patronage(null, PORT, PER, 'fuel') === 0);

/* A faction id stands in for a port, because the fleet's berth bill is
 * settled with no system in hand (Fleet.settle). */
G = fresh();
check('a bare faction id is as good as a port', M.patronage(G, 'emp-b', PER, 'berth') === STEP);
check('and the right desk is credited', M.standing(G, 'emp-b') === STEP);
check('while its neighbour gets nothing', M.standing(G, 'emp-a') === 0);

console.log('--- the books are per faction ---');
G = fresh();
M.patronage(G, PORT, PER * 0.6, 'fuel');
M.patronage(G, 'emp-b', PER * 0.6, 'fuel');
check('six-tenths of a step at one desk is not a step', M.standing(G, 'emp-a') === 0);
check('nor at the other', M.standing(G, 'emp-b') === 0);
check('and spending spread across two empires does not add up into one',
      !(M.standing(G, 'emp-a') > 0) && !(M.standing(G, 'emp-b') > 0));

console.log('--- what the player is shown ---');
G = fresh();
check('a desk you have never paid has no entry', M.patronageOf(G, 'emp-a') === null);
M.patronage(G, PORT, PER * 1.25, 'fuel');
var p = M.patronageOf(G, 'emp-a');
check('the readout knows what it has paid out', p.given === STEP);
check('and what you have spent', Math.abs(p.spent - PER * 1.25) <= 1, p.spent + ' cr');
check('and how far the next step is', Math.abs(p.toNext - PER * 0.75) <= 1, p.toNext + ' cr');
check('and that there is further to go', !p.capped);
M.patronage(G, PORT, PER * 100, 'hull');
p = M.patronageOf(G, 'emp-a');
check('until there is not', p.capped === true);
check('at which point nothing more is owed', p.toNext === 0);

console.log('--- a marked career gets nothing ---');
/* The marks guard forces -100 and no amount of money buys past it: a desk
 * that has you marked takes your fuel money and still wants you dead. */
G = fresh();
G.marks = { 'emp-a': { t: 0 } };
M.patronage(G, PORT, PER * 10, 'hull');
check('a marked career buys nothing but fuel', M.standing(G, 'emp-a') === -100);

console.log('--- rounding ---');
/* Fuel is priced per tonne and lands on fractions; the ledger keeps whole
 * credits so a long career cannot drift. */
G = fresh();
for (var j = 0; j < 1000; j++) M.patronage(G, PORT, 100.4, 'fuel');
check('the books are kept in whole credits', G.patron['emp-a'].spent === 100 * 1000,
      G.patron['emp-a'].spent + ' cr');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
