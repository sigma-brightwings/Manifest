/* saveroundtrip.test.js - DOES WHAT WENT IN THE SLOT COME BACK OUT?
 *
 *     node test/saveroundtrip.test.js
 *
 * THE FAULT THIS EXISTS FOR. On 2026-11-14 a bug hunt found four pieces
 * of career state that did not survive a reload: `outside`, `adrift` and
 * `crewRep` were written into the payload and read back by nobody, and
 * `seenItems` was never written at all. The suite was green throughout,
 * because save.js had no test of its own and every other test builds its
 * own G and never goes near a slot. A reload therefore handed a dying
 * hand a fresh candle, dropped anybody adrift out of the world, washed a
 * captain's name clean of what hands had heard, and shortened his
 * reference - none of it loudly.
 *
 * So the first test here is deliberately not a list of those four. It
 * walks the REAL payload, key by key, and insists each one lands back on
 * G. A field saved without a line to read it back fails this the day it
 * is added, which is the only way the next one gets caught. Two keys are
 * exempt and each is named with its reason; adding to that list is meant
 * to feel like a decision.
 *
 * The rest round-trip the four by value, because a restore line that
 * exists can still restore the wrong thing.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) {
  require('../src/' + m + '.js');
});
require('../src/combat.js');
require('../src/hulls.js');
require('../src/outside.js');
var Galaxy = require('../src/galaxy.js');
var Save = require('../src/save.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var star = gal.stars[0];
var sys = global.Gen.generateSystem(star.seed, Galaxy.systemOpts(gal, star));

function newShip() {
  var sh = { hullId: 'talon', cargo: {}, credits: 5000, fittings: [] };
  global.Combat.initShip(sh);
  global.Sim.refreshShip(sh);
  sh.pos = { x: 0, y: 0, z: 0 }; sh.vel = { x: 0, y: 0, z: 0 };
  sh.fwd = { x: 0, y: 1, z: 0 }; sh.up = { x: 0, y: 0, z: 1 };
  sh.right = { x: 1, y: 0, z: 0 };
  return sh;
}
function bareCareer(t) {
  return {
    seed: 'kawartha', t: t || 0, here: star, sys: sys, galaxy: gal,
    ship: newShip(), visited: {}, charted: {}, standing: {},
    surveys: {}, missions: []
  };
}

/* Keys the payload carries that are NOT expected to land on G under
 * their own name. Each is a judgement, so each is written down. */
var EXEMPT = {
  v: 'the save epoch itself - read by readSlot to decide whether the ' +
     'payload may be loaded at all, and never career state',
  ledger: 'the short payload name for G.ledgerLog, restored under that ' +
          'longer name (save.js) rather than this one'
};

/* ---- 1. EVERY PAYLOAD KEY COMES BACK -------------------------------- */
console.log('-- 1. nothing is written to the slot and dropped on load --');
(function () {
  var G = bareCareer(1000);
  var snap = Save.snapshot(G);
  var G2 = bareCareer(0);
  Save.restore(G2, snap, {});

  var keys = Object.keys(snap);
  check('the payload is not suspiciously small', keys.length > 50,
        keys.length + ' keys');

  var orphans = [];
  keys.forEach(function (k) {
    if (G2[k] === undefined && !EXEMPT[k]) orphans.push(k);
  });
  check('every payload key lands back on G, or is a named exemption',
        orphans.length === 0,
        orphans.length ? 'ORPHANED: ' + orphans.join(', ') : keys.length -
          Object.keys(EXEMPT).length + ' restored, ' +
          Object.keys(EXEMPT).length + ' exempt');

  /* And the exemptions must still be real, so the list cannot rot into
   * a licence for anything. */
  Object.keys(EXEMPT).forEach(function (k) {
    check('exempt key ' + k + ' is still in the payload',
          snap[k] !== undefined, EXEMPT[k].slice(0, 52) + '...');
  });
  check('ledger is restored under its longer name',
        Array.isArray(G2.ledgerLog), 'G.ledgerLog');
})();

/* ---- 2. THE FOUR, BY VALUE ------------------------------------------ */
console.log('\n-- 2. a hand on the hull, a hand adrift, a name, a library --');
(function () {
  var G = bareCareer(1000);
  G.outside = { id: 'c1', name: 'Halloway', role: 'engineer', rating: 3,
                t0: 900, o2: 9 * 3600, tether: true, mended: 12, warnedO2: false };
  G.adrift = [{ id: 'c2', name: 'Ruiz', t: 880, pos: { x: 10, y: 20, z: 0 } }];
  G.crewRep = -25;
  G.seenItems = { forgedtransponder: 1, shieldsurvey: 1 };
  G.carto = { paid: 18000, given: 3, frontier: {} };

  var G2 = bareCareer(0);
  Save.restore(G2, Save.snapshot(G), {});

  check('the hand outside is still outside',
        !!G2.outside && G2.outside.name === 'Halloway',
        G2.outside ? 'and ' + Math.round(G2.outside.o2 / 3600) + ' h of air with her' : 'GONE');
  check('her air is the air she had, not a fresh bottle',
        !!G2.outside && G2.outside.o2 === 9 * 3600);
  check('and she is still on the line', !!G2.outside && G2.outside.tether === true);
  check('the hand adrift is still in the world',
        Array.isArray(G2.adrift) && G2.adrift.length === 1 &&
        G2.adrift[0].name === 'Ruiz');
  check('the name does not launder on reload', G2.crewRep === -25,
        'crewRep ' + G2.crewRep);
  check('an item owned and sold stays in the reference',
        !!G2.seenItems && G2.seenItems.forgedtransponder === 1 &&
        G2.seenItems.shieldsurvey === 1);
  check('and the control still round-trips',
        !!G2.carto && G2.carto.paid === 18000 && G2.carto.given === 3);

  /* The restore must copy, not alias: editing the loaded career cannot
   * reach back into the slot it came from. */
  var snap2 = Save.snapshot(G);
  var G3 = bareCareer(0);
  Save.restore(G3, snap2, {});
  G3.adrift.push({ id: 'c9', name: 'nobody' });
  G3.adrift[0].name = 'overwritten';
  G3.seenItems.somethingelse = 1;
  G3.outside.o2 = 1;
  check('the loaded adrift list is a copy of the slot, not the slot',
        snap2.adrift.length === 1, snap2.adrift.length + ' in the slot still');
  check('and each record in it is its own, not the slot\'s',
        snap2.adrift[0].name === 'Ruiz', 'still ' + snap2.adrift[0].name);
  check('and so is the reference',
        snap2.seenItems.somethingelse === undefined);
  check('and the hand outside is her own object',
        snap2.outside.o2 === 9 * 3600,
        'the slot still reads ' + Math.round(snap2.outside.o2 / 3600) + ' h');
})();

/* ---- 3. A CAREER FROM BEFORE ANY OF IT ------------------------------ */
console.log('\n-- 3. additive: an older career loses nothing by this --');
(function () {
  var G = bareCareer(1000);
  var snap = Save.snapshot(G);
  /* Exactly what a save written before outside.js and the catalogue
   * record existed looks like. */
  delete snap.outside; delete snap.adrift;
  delete snap.crewRep; delete snap.seenItems;

  var G2 = bareCareer(0);
  var threw = null;
  try { Save.restore(G2, snap, {}); } catch (e) { threw = e; }

  check('it loads without complaint', !threw, threw ? String(threw.message) : '');
  check('nobody is outside', G2.outside === null);
  check('nobody is adrift', Array.isArray(G2.adrift) && G2.adrift.length === 0);
  check('the name is clean, which for that career is true', G2.crewRep === 0);
  check('and the reference is empty rather than undefined',
        !!G2.seenItems && Object.keys(G2.seenItems).length === 0);
})();

/* ---- 3b. THE CARTO LEDGER, INCLUDING WHAT CLOSES THE FARM ----------- */
console.log('\n-- 3b. a reload is not a way round one-nod-per-world --');
(function () {
  var G = bareCareer(1000);
  G.carto = { paid: 18000, given: 3,
              frontier: { mirysh: 7 },
              nodded: { 'linethor:linethor': 1, 'ashfall:ashfall-ii': 1 } };

  var G2 = bareCareer(0);
  Save.restore(G2, Save.snapshot(G), {});

  check('what the Cartographers have paid comes back', G2.carto.paid === 18000);
  check('and what they have given back for it', G2.carto.given === 3);
  check('the per-faction frontier count comes back',
        G2.carto.frontier && G2.carto.frontier.mirysh === 7);
  check('and so does the record of which worlds already nodded',
        G2.carto.nodded && G2.carto.nodded['linethor:linethor'] === 1 &&
        G2.carto.nodded['ashfall:ashfall-ii'] === 1,
        'without this, reloading reopens the slice farm');

  /* The ledger is the career's own, not the slot's. */
  var snap = Save.snapshot(G);
  var G3 = bareCareer(0);
  Save.restore(G3, snap, {});
  G3.carto.nodded['somewhere-else'] = 1;
  G3.carto.frontier.mirysh = 99;
  check('and it is a copy: writing to it cannot reach the slot',
        snap.carto.nodded['somewhere-else'] === undefined &&
        snap.carto.frontier.mirysh === 7);

  /* A career from before the record existed. Through JSON, because
   * snapshot() hands out the live carto object and deleting from it would
   * reach back into G - the very aliasing this file tests for. */
  var snapOld = JSON.parse(JSON.stringify(Save.snapshot(G)));
  delete snapOld.carto.nodded;
  var G4 = bareCareer(0);
  Save.restore(G4, snapOld, {});
  check('an older career restores an empty record rather than undefined',
        !!G4.carto.nodded && Object.keys(G4.carto.nodded).length === 0,
        'so its worlds may each extend somebody once more, inside the same cap');
})();

/* ---- 4. STANDING STAYS INSIDE ITS OWN BOUNDS ------------------------ */
console.log('\n-- 4. a hand-edited or corrupt slot cannot escape the scale --');
(function () {
  var O = global.Outside;
  check('the live table still publishes its bounds',
        O && typeof O.REP_MIN === 'number' && typeof O.REP_MAX === 'number',
        O ? O.REP_MIN + ' .. ' + O.REP_MAX : 'MISSING');
  if (!O) return;

  [[-9999, O.REP_MIN], [9999, O.REP_MAX], [O.REP_MIN, O.REP_MIN],
   [O.REP_MAX, O.REP_MAX]].forEach(function (p) {
    var G = bareCareer(1000);
    G.crewRep = p[0];
    var G2 = bareCareer(0);
    Save.restore(G2, Save.snapshot(G), {});
    check('crewRep ' + p[0] + ' restores as ' + p[1], G2.crewRep === p[1]);
  });

  var G = bareCareer(1000);
  var snap = Save.snapshot(G);
  snap.crewRep = 'not a number';
  var G2 = bareCareer(0);
  Save.restore(G2, snap, {});
  check('a non-number restores as 0 rather than NaN', G2.crewRep === 0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
