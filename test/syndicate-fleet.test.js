/* syndicate-fleet.test.js — the Syndicate flies its own muscle.
 *
 *     node test/syndicate-fleet.test.js
 *
 * Astra, 2026-09-24: "give the syndicate all ships with the addition of
 * enforcer-* and enforcer_heavy-*. Syndicate is mafia. Pirates are like
 * their disposable muscle."
 *
 * What this pins down:
 *   - the mob's beat cops (police-kind, outlaw flag) wear the enforcer hull
 *     at a hashed S/M/L, and nobody else's cops do;
 *   - a hold may carry a HEAVY (enforcer_heavy), which is police-kind and
 *     so can never be mistaken for a naval garrison;
 *   - the hull key reaches the renderer through Sim's live state, while
 *     `cls` stays the kind combat reads;
 *   - nothing already generated moves (the fleet's tallest hull, the
 *     garrison rule, the pirates' flag).
 */
global.window = global.window || global;
require('../src/rng.js'); require('../src/vec3.js'); require('../src/kepler.js');
require('../src/arcs.js'); require('../src/economy.js');
var Gen = require('../src/generate.js');
require('../src/slipspace.js');
var Galaxy = require('../src/galaxy.js');
require('../src/missions.js');
var Sim = require('../src/sim.js');
var Combat = require('../src/combat.js');
require('../src/hulls.js'); require('../src/ports.js');
var Render = require('../src/render.js');
Gen = global.Gen || Gen; Galaxy = global.Galaxy || Galaxy;
Sim = global.Sim || Sim; Combat = global.Combat || Combat; Render = global.Render || Render;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

console.log('--- the hulls are in the library ---');
var A = Render.HULL_ASSIGN;
check('enforcer and enforcer_heavy are hull keys', A.enforcer === 'enforcer-m' && A.enforcer_heavy === 'enforcer_heavy-m');
['enforcer', 'enforcer_heavy'].forEach(function (fam) {
  var have = ['s', 'm', 'l'].filter(function (l) { return global.HullLib && global.HullLib[fam + '-' + l]; });
  check(fam + ' ships at all three sizes', have.length === 3, have.join('/'));
});
/* fleetHalfHeight in generate.js reads the TALLEST hull in HULL_ASSIGN to
 * set every berth's standoff. A new key taller than the rest would quietly
 * move every ship parked in every bay. */
var tallestOld = 0, tallestNew = 0;
Object.keys(A).forEach(function (k) {
  var sp = Render.hullSpan && Render.hullSpan(k);
  if (!sp) return;
  if (k !== 'enforcer' && k !== 'enforcer_heavy') tallestOld = Math.max(tallestOld, sp.h);
  tallestNew = Math.max(tallestNew, sp.h);
});
check('neither new hull is the tallest in the fleet, so no berth moves',
      tallestOld > 0 && tallestNew === tallestOld, tallestOld.toFixed(4) + ' km');

console.log('--- who flies them ---');
var seeds = ['kawartha', 'alpha', 'beta'];
var held = 0, withHeavy = 0, mobCops = 0, mobCopsBad = 0, lawCopsBad = 0;
var heavyOutside = 0, heavyNotPolice = 0, heldGarrison = 0, pirates = 0, piratesNotOutlaw = 0;
var copL = { s: 0, m: 0, l: 0 }, hvL = { s: 0, m: 0, l: 0 };
var sampleHeavy = null, sampleSys = null, sampleSeed = null, sampleOpts = null;
seeds.forEach(function (seed) {
  var g = Galaxy.build(seed);
  g.stars.forEach(function (st) {
    var fac = g.factionById[st.factionId];
    var opts = fac ? { faction: fac, allFactions: g.factions } : undefined;
    var sys = Gen.generateSystem(st.seed, opts);
    if (sys.pirateHeld) held++;
    var any = false;
    (sys.patrols || []).forEach(function (p) {
      if (p.kind === 'pirate') { pirates++; if (p.faction !== 'outlaw') piratesNotOutlaw++; }
      if (p.kind === 'navy' && !p.passing && sys.pirateHeld) heldGarrison++;
      if (p.heavy) {
        any = true;
        if (!sys.pirateHeld) heavyOutside++;
        if (p.kind !== 'police' || p.faction !== 'outlaw' || p.hullClass !== 'enforcer_heavy') heavyNotPolice++;
        hvL[p.sizeLetter]++;
        if (!sampleHeavy) { sampleHeavy = p; sampleSys = sys; sampleSeed = st.seed; sampleOpts = opts; }
        return;
      }
      if (p.kind !== 'police') return;
      if (p.faction === 'outlaw') {
        mobCops++;
        if (p.hullClass !== 'enforcer' || !p.sizeLetter || p.className !== 'enforcer') mobCopsBad++;
        else copL[p.sizeLetter]++;
      } else if (p.hullClass || p.sizeLetter || p.className !== 'interceptor') lawCopsBad++;
    });
    if (any) withHeavy++;
  });
});
check('every Syndicate beat cop wears an enforcer hull', mobCops > 0 && mobCopsBad === 0, mobCops + ' cops');
check('and at every size', copL.s > 0 && copL.m > 0 && copL.l > 0, 's' + copL.s + ' m' + copL.m + ' l' + copL.l);
check('nobody else\'s police changed hull or name', lawCopsBad === 0);
check('heavies fly in holds and only in holds', withHeavy > 0 && heavyOutside === 0,
      withHeavy + ' of ' + held + ' holds');
check('a heavy is rarer than a hold', withHeavy < held);
check('a heavy is the mob\'s police, never a navy', heavyNotPolice === 0);
check('heavies come in every size', hvL.s > 0 && hvL.m > 0 && hvL.l > 0, 's' + hvL.s + ' m' + hvL.m + ' l' + hvL.l);
check('still no naval garrison in any hold', heldGarrison === 0);
check('pirates still fly the Syndicate\'s flag — its disposable muscle', pirates > 0 && piratesNotOutlaw === 0);

console.log('--- the same seed is the same mob ---');
var again = Gen.generateSystem(sampleSeed, sampleOpts);
var h2 = again.patrols.filter(function (p) { return p.heavy; });
var h1 = sampleSys.patrols.filter(function (p) { return p.heavy; });
check('same heavies, same names, same sizes, same beats',
      JSON.stringify(h1.map(function (p) { return [p.id, p.name, p.sizeLetter, p.rail.route.from, p.rail.route.to]; })) ===
      JSON.stringify(h2.map(function (p) { return [p.id, p.name, p.sizeLetter, p.rail.route.from, p.rail.route.to]; })));
check('heavy ids do not collide with anything else in the sky',
      sampleSys.patrols.filter(function (p) { return p.id === sampleHeavy.id; }).length === 1);

console.log('--- the hull reaches the screen; the rules do not change ---');
var st = Sim.patrolState(sampleHeavy, sampleSys, 1e5);
check('live state carries the hull key', st && st.hullClass === 'enforcer_heavy', st && st.hullClass);
check('and keeps its kind as cls, which combat reads', st && st.cls === 'police');
check('and its size letter, so the renderer picks S/M/L', st && st.sizeLetter === sampleHeavy.sizeLetter);
var arm = Combat.npcArmament(sampleHeavy, sampleSys);
check('a heavy carries the enforcement wing\'s gun', arm.armed && arm.dmg === Combat.SYNDICATE_GUN.dmg, arm.gun);
check('it answers a call for security', Combat.eligibleResponder(sampleHeavy, Combat.HELP_SECURITY));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
