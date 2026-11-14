/* dawdle.test.js - delivering at the last possible moment (2026-11-13).
 *
 *     node test/dawdle.test.js
 *
 * Astra wanted a penalty for burning a contract's whole window. The exploit
 * she first described - padding distance to run the clock - cannot pay,
 * because a fee is fixed when the offer is written and never reads where you
 * flew; what CAN happen, and had no cost, is sitting on a two-hour run for
 * three days with a family aboard.
 *
 * What this holds:
 *   - A TIMELY RUN IS FREE. Nothing under 70% of the window costs anything,
 *     and the threshold is generous on purpose;
 *   - IT RISES TO THE DEADLINE, and never past the full figure;
 *   - PEOPLE COST MORE THAN FREIGHT, and nearly as much as failing;
 *   - THE CLOCK RUNS FROM WHEN YOU SIGNED, not from when the offer was
 *     posted - taking a contract late in its window is not the same sin as
 *     taking one fresh and forgetting it;
 *   - A CONTRACT FROM AN OLD SAVE reads as timely rather than as maximally
 *     late, which is the difference between an additive change and one that
 *     fines everybody on load.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
require('../src/generate.js');
require('../src/sim.js');
require('../src/hulls.js');
require('../src/combat.js');
var M = require('../src/missions.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var DAY = 86400;
function m(opts) {
  opts = opts || {};
  return { took: opts.took === undefined ? 0 : opts.took,
           deadline: opts.deadline === undefined ? 4 * DAY : opts.deadline,
           souls: opts.souls || 0, faction: 'x', type: opts.type || 'haul',
           toName: 'Somewhere' };
}

console.log('--- a timely run is free ---');
check('arriving at once costs nothing', M.dawdle(m(), 0) === 0);
check('a quarter of the window is free', M.dawdle(m(), DAY) === 0);
check('half the window is free', M.dawdle(m(), 2 * DAY) === 0);
check('two thirds is still free', M.dawdle(m(), 2.6 * DAY) === 0);
check('the threshold is where it says it is',
      M.dawdle(m(), M.LATE_FROM * 4 * DAY) === 0, 'LATE_FROM ' + M.LATE_FROM);

console.log('--- past it, it rises to the deadline ---');
var justOver = M.dawdle(m(), (M.LATE_FROM + 0.01) * 4 * DAY);
check('a shade over the line is a shade of the penalty',
      justOver > 0 && justOver < 0.08, justOver.toFixed(3));
check('at the deadline it is the whole figure',
      Math.abs(M.dawdle(m(), 4 * DAY) - 1) < 1e-9);
check('it never goes past the whole figure', M.dawdle(m(), 40 * DAY) === 1);
var mid = M.dawdle(m(), (M.LATE_FROM + (1 - M.LATE_FROM) / 2) * 4 * DAY);
check('halfway between is half of it', Math.abs(mid - 0.5) < 1e-6, mid.toFixed(3));
var rising = true, prev = -1;
for (var k = 0; k <= 40; k++) {
  var v = M.dawdle(m(), k / 40 * 4 * DAY);
  if (v < prev - 1e-12) rising = false;
  prev = v;
}
check('it never falls as the window burns', rising);

console.log('--- the clock runs from when YOU signed ---');
/* Same deadline, same arrival; one signed fresh, one signed late. */
var fresh = M.dawdle({ took: 0, deadline: 4 * DAY }, 3.5 * DAY);
var lateSign = M.dawdle({ took: 3 * DAY, deadline: 4 * DAY }, 3.5 * DAY);
check('signing fresh and sitting on it is dawdling', fresh > 0, fresh.toFixed(2));
check('signing late and flying it at once is not',
      lateSign === 0, lateSign.toFixed(2));
check('and the one who sat on it is charged more', fresh > lateSign);

console.log('--- old saves ---');
check('a contract with no timestamp reads as timely',
      M.dawdle({ deadline: 4 * DAY }, 3.9 * DAY) === 0);
check('a nonsense window reads as timely',
      M.dawdle({ took: 5 * DAY, deadline: DAY }, 6 * DAY) === 0);
check('no contract at all reads as timely', M.dawdle(null, 1) === 0);

console.log('--- people cost more than freight ---');
check('freight is capped where it says', M.LATE_FREIGHT === 3, String(M.LATE_FREIGHT));
check('people are capped higher', M.LATE_SOULS > M.LATE_FREIGHT,
      M.LATE_SOULS + ' vs ' + M.LATE_FREIGHT);
/* A dawdled freight run should wipe out what the job earned, and dawdled
 * passage should hurt nearly as much as failing outright. */
check('dawdled freight cancels what a haul earned', M.LATE_FREIGHT >= 3);
check('dawdled passage stings nearly as much as failing',
      M.LATE_SOULS >= 5 && M.LATE_SOULS < 7, String(M.LATE_SOULS));

console.log('--- it is charged, and it is said ---');
/* The settle path is exercised through the module's own accept/settle in
 * the other suites; here the arithmetic that drives it. */
function cost(mm, t) {
  var f = M.dawdle(mm, t);
  return Math.round(f * ((mm.souls || 0) > 0 ? M.LATE_SOULS : M.LATE_FREIGHT));
}
check('a timely freight run costs nothing', cost(m(), DAY) === 0);
check('a timely passage costs nothing', cost(m({ souls: 4 }), DAY) === 0);
check('freight at the deadline costs the cap', cost(m(), 4 * DAY) === M.LATE_FREIGHT);
check('passage at the deadline costs the cap',
      cost(m({ souls: 4 }), 4 * DAY) === M.LATE_SOULS);
check('the same lateness costs more with people aboard',
      cost(m({ souls: 2 }), 3.8 * DAY) > cost(m(), 3.8 * DAY),
      cost(m({ souls: 2 }), 3.8 * DAY) + ' vs ' + cost(m(), 3.8 * DAY));
check('and it is never worse than failing outright',
      M.LATE_SOULS < 7, M.LATE_SOULS + ' < 7');

console.log('--- the contract records when it was signed ---');
var src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'missions.js'), 'utf8');
check('accept() stamps the record', /took:\s*G\.t/.test(src));
check('the settle path charges for it', /chargeDawdle\(G, m, t, hooks\)/.test(src));

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
