// corruptverify.cjs — the corruption lever: display, drift, and its two
// new consequences (customs bribes, and the deliberate bribePort action).
'use strict';
var C = require('./combat.js');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok  ', msg);
}
function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }

// ---- decay math ---------------------------------------------------------
var G = { t: 0, here: { id: 's1' }, ship: { credits: 1e9, cargo: {} } };
C.bumpCorruption(G, 40);
assert(near(C.decayedShift(G, 's1'), 40), 'fresh bump reads back exactly (' + C.decayedShift(G, 's1') + ')');

G.t = C.CORRUPTION_HALFLIFE;
assert(near(C.decayedShift(G, 's1'), 20, 0.01), 'one half-life: 40 decays to 20 (' + C.decayedShift(G, 's1').toFixed(3) + ')');

G.t = C.CORRUPTION_HALFLIFE * 5;
assert(C.decayedShift(G, 's1') < 40 / 32 + 0.05, 'five half-lives: down near 1/32 (' + C.decayedShift(G, 's1').toFixed(3) + ')');

// ---- cap ------------------------------------------------------------------
var G2 = { t: 0, here: { id: 's2' }, ship: { credits: 1e9, cargo: {} } };
for (var i = 0; i < 10; i++) C.bumpCorruption(G2, 20);
assert(near(C.decayedShift(G2, 's2'), C.CORRUPTION_SHIFT_CAP),
  'repeated bumps cap at CORRUPTION_SHIFT_CAP (' + C.decayedShift(G2, 's2') + ' === ' + C.CORRUPTION_SHIFT_CAP + ')');

// ---- effectiveCorruption: base + shift, current system vs. an explicit id --
var G3 = { t: 0, here: { id: 'home' }, ship: { credits: 1e9, cargo: {} } };
assert(C.effectiveCorruption(G3, 30) === 30, 'no shift yet: effective equals base');
C.bumpCorruption(G3, 25);
assert(C.effectiveCorruption(G3, 30) === 55, 'shift adds onto base for the current system (' + C.effectiveCorruption(G3, 30) + ')');
assert(C.effectiveCorruption(G3, 30, 'elsewhere') === 30, 'a star you are not in, and never bribed, is unaffected');
assert(C.effectiveCorruption(G3, 90) === 100, 'clamped at 100 (' + C.effectiveCorruption(G3, 90) + ')');

// ---- hushWitness bumps corruption only when PAID, never when intimidated --
function makeHushG(standing, corruption) {
  return {
    t: 100, here: { id: 'hushtest' },
    standing: { outlaw: standing },
    ship: { credits: 1e9, cargo: {}, pos: { x: 0, y: 0 } },
    sys: null
  };
}
var sysLow = { corruption: 50, patrols: [{ name: 'Freighter', distressAt: 90, distressKind: 'assault', faction: 'civil' }] };
var Gp = makeHushG(0, 50);
Gp.sys = sysLow;
// Force a "stuck" outcome regardless of the hashed roll by using a corruption/standing
// combination whose `stick` is 1 is not reachable (cap 0.95/0.97) — instead just call
// hushWitness a few times across distinct victims until one sticks, OR read hushQuote's
// math directly and trust hushWitness's own roll (already covered by earlier design work).
// Simpler and deterministic: call hushWitness and check the corruption shift only in the
// case it reports `stuck: true`; retry with a fresh victim id (changes the hash) if not.
var stuckOnce = false, tries = 0;
while (!stuckOnce && tries < 50) {
  tries++;
  var G4 = makeHushG(0, 50);
  G4.sys = { corruption: 50, patrols: [
    { name: 'Freighter ' + tries, distressAt: 110, distressKind: 'assault', faction: 'civil' }
  ] };
  var before = C.decayedShift(G4, 'hushtest');
  var r = C.hushWitness(G4.sys, G4, 100, {});
  if (r && r.stuck) {
    stuckOnce = true;
    var after = C.decayedShift(G4, 'hushtest');
    assert(near(after - before, C.CORRUPTION_BUMP_HUSH), 'a PAID, stuck witness bumps corruption by CORRUPTION_BUMP_HUSH (' + (after - before).toFixed(2) + ')');
  }
}
assert(stuckOnce, 'found at least one stuck payoff across ' + tries + ' hashed victims to test with');

// Intimidation (standing >= INTIMIDATE_STANDING) must NOT bump corruption even when it sticks.
var stuckIntim = false; tries = 0;
while (!stuckIntim && tries < 50) {
  tries++;
  var G5 = makeHushG(C.INTIMIDATE_STANDING, 50);
  G5.sys = { corruption: 50, patrols: [
    { name: 'Trader ' + tries, distressAt: 110, distressKind: 'assault', faction: 'allied' }
  ] };
  var b2 = C.decayedShift(G5, 'hushtest');
  var r2 = C.hushWitness(G5.sys, G5, 100, {});
  if (r2 && r2.stuck) {
    stuckIntim = true;
    var a2 = C.decayedShift(G5, 'hushtest');
    assert(a2 === b2, 'an intimidated (unpaid) witness does NOT bump corruption (' + b2 + ' -> ' + a2 + ')');
  }
}
assert(stuckIntim, 'found at least one stuck intimidation across ' + tries + ' hashed victims to test with');

// ---- resolveScan's corrupt-customs branch ---------------------------------
// Force the search to happen (crimeScore low => high searchChance) and force
// contraband to be found; sample many corruption levels and confirm the
// bribe-out rate tracks (corrupt - HUSH_MIN_CORRUPTION)/100, capped at 0.75,
// and that a successful bribe leaves the cargo untouched and bumps corruption.
global.Economy = { BY_ID: { spice: { name: 'Spice', contraband: true } } };
function scanTrial(corruption, credits) {
  var G6 = {
    t: 500, here: { id: 'customs-' + corruption + '-' + Math.random() },
    sys: { crimeScore: 5, corruption: corruption },
    ship: { credits: credits, cargo: { spice: 10 } }
  };
  G6.sys.crimeScore = 5; // low permissivity => searchChance near max, always searched
  var spec = { name: 'Customs Cutter', faction: 'allied' };
  var r = C.resolveScan(G6, spec, {});
  return { r: r, G: G6 };
}
function sampleBribeRate(corruption, n) {
  var hits = 0;
  for (var k = 0; k < n; k++) {
    var t = scanTrial(corruption, 1e9);
    if (t.r && t.r.bribed) hits++;
  }
  return hits / n;
}
var n = 4000;
var rate25 = sampleBribeRate(25, n);
var rate60 = sampleBribeRate(60, n);
var rate100 = sampleBribeRate(100, n);
console.log('bribe rate @25:', rate25.toFixed(3), '@60:', rate60.toFixed(3), '@100:', rate100.toFixed(3));
assert(rate25 < 0.03, 'at the HUSH_MIN_CORRUPTION floor, bribe-out is ~never (' + rate25.toFixed(3) + ')');
assert(Math.abs(rate60 - 0.35) < 0.05, 'at corruption 60, bribe-out ~35% ((60-25)/100) (' + rate60.toFixed(3) + ')');
assert(Math.abs(rate100 - 0.75) < 0.05, 'at corruption 100, bribe-out caps at 0.75 (' + rate100.toFixed(3) + ')');

var poor = scanTrial(100, 0);
assert(poor.r.contraband === true && !poor.r.bribed, 'cannot afford the bribe: falls through to seizure (' + JSON.stringify(poor.r) + ')');
assert(poor.G.ship.cargo.spice === undefined, 'and the cargo really is gone when the bribe fails/cannot be paid');

var rich = null;
for (var attempt = 0; attempt < 200 && !rich; attempt++) {
  var t2 = scanTrial(95, 1e9);
  if (t2.r.bribed) rich = t2;
}
assert(!!rich, 'found a successful rich-bribe trial to inspect');
if (rich) {
  assert(rich.G.ship.cargo.spice === 10, 'a successful bribe leaves the cargo aboard');
  assert(C.decayedShift(rich.G, rich.G.here.id) === C.CORRUPTION_BUMP_CUSTOMS,
    'a successful bribe feeds corruption by CORRUPTION_BUMP_CUSTOMS (' + C.decayedShift(rich.G, rich.G.here.id) + ')');
}

// ---- bribePort: the deliberate action --------------------------------------
var portCheap = { faction: 'civil', market: { dev: 0.3 } };
var sysClean = { corruption: 10 };
var G7 = { t: 0, here: { id: 'bribeme' }, ship: { credits: 1e9, cargo: {} } };
var costLow = C.bribeCost(G7, sysClean, portCheap);
var before7 = C.systemCorruption(G7, sysClean);
var res7 = C.bribePort(G7, sysClean, portCheap, {});
assert(res7 && res7.ok && res7.paid === costLow, 'bribePort spends exactly bribeCost (' + res7.paid + ' === ' + costLow + ')');
assert(G7.ship.credits === 1e9 - costLow, 'credits actually deducted');
var after7 = C.systemCorruption(G7, sysClean);
assert(after7 - before7 === C.CORRUPTION_BRIBE_AMOUNT, 'effective corruption rose by CORRUPTION_BRIBE_AMOUNT (' + (after7 - before7) + ')');

// Cost scales down as the port is already more corrupt.
var costOnCorrupt = C.bribeCost(G7, { corruption: 80 }, portCheap);
var costOnClean = C.bribeCost(G7, { corruption: 5 }, { faction: 'civil', market: { dev: 0.3 } });
assert(costOnCorrupt < costOnClean, 'bribing an already-corrupt port costs less than a clean one (' + costOnCorrupt + ' < ' + costOnClean + ')');

// Cost scales up with port development.
var costPoor = C.bribeCost({ t: 0, here: { id: 'x1' }, ship: {} }, { corruption: 30 }, { faction: 'civil', market: { dev: 0.2 } });
var costRich = C.bribeCost({ t: 0, here: { id: 'x2' }, ship: {} }, { corruption: 30 }, { faction: 'civil', market: { dev: 0.9 } });
assert(costRich > costPoor, 'a developed port costs more to buy into than a backwater (' + costPoor + ' < ' + costRich + ')');

// Refusal at the cap: can't keep buying past CORRUPTION_SHIFT_CAP.
var G8 = { t: 0, here: { id: 'maxedout' }, ship: { credits: 1e9, cargo: {} } };
C.bumpCorruption(G8, C.CORRUPTION_SHIFT_CAP);
var before8 = G8.ship.credits;
var res8 = C.bribePort(G8, { corruption: 20 }, portCheap, {});
assert(res8 && !res8.ok && res8.maxed, 'refused once the shift is already at cap');
assert(G8.ship.credits === before8, 'and no money changes hands on refusal');

// Insufficient funds: refused, no partial spend.
var G9 = { t: 0, here: { id: 'broke' }, ship: { credits: 10, cargo: {} } };
var res9 = C.bribePort(G9, { corruption: 20 }, portCheap, {});
assert(res9 && !res9.ok && G9.ship.credits === 10, 'refused outright when the player cannot afford it');

// ---- grey market gate reacts to a bribed-up corruption shift ---------------
var portGrey = { faction: 'civil', market: { dev: 0.3 } };
function greyOffer(G) {
  return C.stockAt(G, portGrey).filter(function (r) { return r.item.id === 'greyphint'; })[0];
}
var G10 = { t: 0, here: { id: 'greytest' }, standing: {}, sys: { corruption: 20, crimeScore: 20 } };
var offBefore = greyOffer(G10);
// Below minCorrupt the grey branch `continue`s — no row at all, not an
// unavailable one — same "does not exist here" distinction stockAt's own
// comment draws.
assert(!offBefore, 'corruption 20: grey market has no row at all here yet');
C.bumpCorruption(G10, 45); // 20 + 45 = 65, clears the 60 threshold
var offAfter = greyOffer(G10);
assert(offAfter && offAfter.available, 'after enough bribery to cross 60 effective, the grey market opens (' + C.systemCorruption(G10, G10.sys) + ')');

if (process.exitCode) console.log('\nSOME CHECKS FAILED');
else console.log('\nall checks passed');
