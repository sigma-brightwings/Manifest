/* drives.test.js â€” the slipspace bay, drive classes, the milfuel tank, the linacs.
 *
 *     node test/drives.test.js
 *
 * Astra, 2026-11-09: "The increased drive class should actually increase
 * the possible range jumped. Drive fuel can be refilled from the cargo
 * hold and the ship status screen, and maximums that fill up a slipspace
 * drive/milfuel drive are dependent on the size of the ship." And later
 * the same day: "you need a slipspace drive or milfuel drive to travel
 * from one star system to another; a class I drive is standard with the
 * spaceframe of the S size ships, and class II comes with M size ships."
 *
 * Pinned here: every hull has one slipspace bay, never empty, holding her
 * size's standard drive (S I, M II, L III, XL IV), which covers her fully
 * laden and costs her nothing against the fit budget; Class I is the
 * reach every jump was tuned on, and each class up reaches further; a
 * drive is replaced (a trade-in), never sold off; no drive, no jump; old
 * saves are given theirs; the standard drive stays with an old hull and a
 * better one comes across; the milfuel tank is an eighth of the hydrogen
 * tank and fills from the hold; the proton linacs.
 */
global.window = global.window || global;
require('../src/vec3.js'); require('../src/rng.js');
require('../src/economy.js');
require('../src/sim.js');
var Combat = require('../src/combat.js');
var Slip = global.Slipspace || require('../src/slipspace.js');
var Galaxy = require('../src/galaxy.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
var H = Combat.HULLS, E = Combat.EQUIPMENT;

function ship(hullId) {
  var h = H[hullId];
  var s = { hullId: hullId, dryMass: h.dryMass, fuelCap: h.fuelCap, fuel: h.fuelCap,
            thrusterCap: h.thrusterCap, thrusterFuel: h.thrusterCap, cargoCap: h.cargoCap,
            cargo: {}, fit: {}, credits: 1e8 };
  Combat.migrateFit(s);
  return s;
}
function fit(s, id) { var r = Combat.fitItem(s, id); return r && r.ok ? r : (console.log('     (fit ' + id + ': ' + (r && r.why) + ')'), null); }
function near(a, b, t) { return Math.abs(a - b) <= (t || 1e-9) * Math.max(1, Math.abs(b)); }

console.log('--- the slipspace bay ---');
var want = { S: 'I', M: 'II', L: 'III', XL: 'IV' }, wrong = [], uncovered = [], charged = [];
for (var hid in H) {
  var s0 = ship(hid), cls = want[H[hid].size];
  if (s0.fit.core0 !== 'slipdrive' + cls) wrong.push(hid + ' ' + s0.fit.core0);
  var laden = ship(hid); laden.cargo.ore = H[hid].cargoCap || 0;
  if (!Slip.civilRunning(laden)) uncovered.push(hid);
  if (Combat.budgetMass(s0, E[s0.fit.core0]) !== 0 || Combat.budgetPower(s0, E[s0.fit.core0]) !== 0) charged.push(hid);
}
check('every hull leaves the yard with her size\'s drive: S I, M II, L III, XL IV', !wrong.length, wrong.join(', '));
check('and it covers her fully laden', !uncovered.length, uncovered.join(', '));
check('and costs her nothing against the fit budget', !charged.length, charged.join(', '));
var fg = ship('fighter');
check('a bay of its own: no internal slot is taken',
      Combat.slotKeys(fg).filter(function (k) { return /^internal/.test(k); }).length === H.fighter.slots.internal &&
      !Object.keys(fg.fit).some(function (k) { return /^internal/.test(k) && /drive/.test(fg.fit[k]); }));
var up = ship('talon');
check('a bigger drive costs only what it weighs and draws above the standard one',
      Combat.budgetMass(up, E.slipdriveII) === 2 && near(Combat.budgetPower(up, E.slipdriveII), 0.9, 1e-9),
      Combat.budgetMass(up, E.slipdriveII) + ' t, ' + Combat.budgetPower(up, E.slipdriveII).toFixed(1) + ' MW on a Talon');

console.log('--- reach ---');
var R = Slip.RANGE_BY_CLASS;
check('Class I is the reach every jump was tuned on; each class up reaches further',
      R.I === 1 && R.II > R.I && R.III > R.II && R.IV > R.III, [R.I, R.II, R.III, R.IV].join(' / '));
var tal = ship('talon'), r1 = Galaxy.maxRange(tal);
var calibrated = tal.fuel / (0.016 * Slip.allUpMass(tal));
check('so a Talon on her standard Class I jumps exactly as far as she always did', near(r1, calibrated, 1e-9),
      r1.toFixed(1) + ' ly');
var ranges = ['I', 'II', 'III', 'IV'].map(function (c) { var s = ship('talon'); fit(s, 'slipdrive' + c); return Galaxy.maxRange(s); });
check('and further with every class up', ranges[1] > ranges[0] && ranges[2] > ranges[1] && ranges[3] > ranges[2],
      ranges.map(function (r) { return r.toFixed(1); }).join(' / ') + ' ly');
var t2 = ship('talon'); fit(t2, 'slipdriveII');
check('the same jump costs less hydrogen', Galaxy.jumpFuel(t2, 5) < Galaxy.jumpFuel(tal, 5),
      Galaxy.jumpFuel(tal, 5).toFixed(2) + ' t -> ' + Galaxy.jumpFuel(t2, 5).toFixed(2) + ' t for 5 ly');
check('the civil drive runs the corridor at its own timetable',
      near(Slip.hoursPerLyFor(Slip.allUpMass(tal), tal), Slip.hoursPerLy(Slip.allUpMass(tal))));
var mil = ship('talon'); fit(mil, 'mildriveI');
check('the military drive still halves it',
      near(Slip.hoursPerLyFor(Slip.allUpMass(mil), mil), Slip.hoursPerLy(Slip.allUpMass(mil)) * Slip.MIL_FACTOR));
var mule = ship('mule');
check('an M hull\'s standard Class II reaches 15% further than she used to',
      near(Galaxy.maxRange(mule), mule.fuel * 1.15 / (0.016 * Slip.allUpMass(mule)), 1e-9), Galaxy.maxRange(mule).toFixed(1) + ' ly');
var heavy = ship('talon'); heavy.cargo.ore = 2500;
check('a drive too small for her mass still opens the corridor, at Class I\'s reach',
      Slip.rangeFactor(heavy) === 1 && Slip.hasDriveCore(heavy));

console.log('--- one drive, replaced, never sold off ---');
var b = ship('talon'), BG = { ship: b, standing: {}, sys: null };
var c0 = b.credits, rb = Combat.buyEquipment(BG, 'slipdriveII');
check('buying a better drive trades the standard one in',
      rb.ok && rb.replaced && b.fit.core0 === 'slipdriveII' && rb.tradeIn === Math.round(E.slipdriveI.price * Combat.RESALE) &&
      c0 - b.credits === E.slipdriveII.price - rb.tradeIn, rb.ok ? rb.cost + ' cr net' : rb.why);
check('a military drive goes into the same bay', Combat.canFit(b, 'mildriveI').ok, Combat.canFit(b, 'mildriveI').why);
check('the drive cannot be sold off', Combat.unfitItem(b, 'core0') === null && b.fit.core0 === 'slipdriveII');
var pv = Combat.drivePreview({ ship: ship('talon') }, 'slipdriveIII');
check('the yard quotes the swap: reach before and after, trade-in, net',
      pv && pv.ok && pv.core && pv.reachNow === 1 && pv.reachAfter === R.III && pv.replaces.id === 'slipdriveI',
      pv ? 'x' + pv.reachNow + ' -> x' + pv.reachAfter + ', ' + pv.net + ' cr net' : 'none');
var nod = ship('talon'); delete nod.fit.core0;
check('no drive, no jump', !Slip.hasDriveCore(nod));
var plan = null;
try { plan = Galaxy.jumpPlan(null, { x: 0, y: 0, z: 0, name: 'A' }, { x: 1, y: 0, z: 0, name: 'B' }, nod); } catch (e) { plan = { err: e.message }; }
check('and the jump plan says why', plan && !plan.possible && plan.noDrive, plan && plan.err);

console.log('--- saves and hulls ---');
var old = { hullId: 'mule', fit: { drive0: 'cruise1', utility0: 'cargoscoop' } };
Combat.migrateFit(old);
check('a save from before the bay is given her size\'s drive', old.fit.core0 === 'slipdriveII', old.fit.core0);
var early = { hullId: 'talon', fit: { drive0: 'cruise1', internal0: 'mildriveII' } };
Combat.migrateFit(early);
check('a drive fitted in an internal slot moves into the bay',
      early.fit.core0 === 'mildriveII' && !early.fit.internal0, JSON.stringify(early.fit));
var rp = Combat.replanFit(ship('talon'), H.mule);
check('the standard drive stays with the old hull', rp.ok && !rp.fit.core0, rp.why);
var nh = { hullId: 'mule', fit: rp.fit }; Combat.addHullStandard(nh);
check('and the new one arrives with her own', nh.fit.core0 === 'slipdriveII', nh.fit.core0);
var better = ship('talon'); fit(better, 'slipdriveIV');
var rp2 = Combat.replanFit(better, H.mule);
check('a better drive comes across instead', rp2.ok && rp2.fit.core0 === 'slipdriveIV', rp2.ok ? rp2.fit.core0 : rp2.why);

console.log('--- the milfuel tank ---');
check('no milfuel drive, no tank', Slip.milFuelCap(ship('talon')) === 0);
var allEighth = true, worst = '';
for (var hk in H) {
  if (!H[hk].fuelCap) continue;
  var m = ship(hk); m.modules = { mildrive: 'IV' };   // the tank, not whether a IV fits her
  var w = Math.round(H[hk].fuelCap / 8 * 10) / 10;
  if (Math.abs(Slip.milFuelCap(m) - w) > 1e-9) { allEighth = false; worst = hk + ' ' + Slip.milFuelCap(m) + ' vs ' + w; }
}
check('on every hull the tank is an eighth of her hydrogen tank', allEighth, worst);
var big = Object.keys(H).filter(function (k) { return H[k].fuelCap; })
  .sort(function (a, b2) { return H[b2].fuelCap - H[a].fuelCap; })[0];
var mt = ship('talon'); fit(mt, 'mildriveI');
var lev = ship(big); lev.modules = { mildrive: 'IV' };
check('so a big ship carries a bigger one', Slip.milFuelCap(lev) > Slip.milFuelCap(mt) * 3,
      'Talon ' + Slip.milFuelCap(mt) + ' t, ' + H[big].name + ' ' + Slip.milFuelCap(lev) + ' t');
mt.cargo.milfuel = 10;
check('milfuel in the hold does not power a jump', Galaxy.maxRange(mt) === 0);
var moved = Slip.milFuelFromHold(mt, 0);
check('the hold fills the tank to the brim and no further',
      moved === Slip.milFuelCap(mt) && mt.milFuel === Slip.milFuelCap(mt) && Math.abs(mt.cargo.milfuel - (10 - moved)) < 1e-9,
      moved + ' t moved, ' + mt.cargo.milfuel.toFixed(2) + ' t left in the hold');
check('a full tank tops up nothing', Slip.milFuelFromHold(mt, 0) === 0);
var hot = Galaxy.maxRange(mt);
mt.milArmed = false; var cold = Galaxy.maxRange(mt); mt.milArmed = true;
check('a full milfuel tank reaches as far as a full hydrogen tank', Math.abs(hot / cold - 1) < 0.02,
      hot.toFixed(1) + ' ly hot, ' + cold.toFixed(1) + ' ly cold');
var kept = ship('talon'); fit(kept, 'mildriveI'); kept.cargo.milfuel = 3;
check('contract cargo is kept back', Slip.milFuelFromHold(kept, 2) === 1 && kept.cargo.milfuel === 2);

var back = ship('talon'), KG = { ship: back, standing: {}, sys: null };
Combat.buyEquipment(KG, 'mildriveI'); back.cargo.milfuel = 2; Slip.milFuelFromHold(back, 0);
var tb = Combat.buyEquipment(KG, 'slipdriveII');
check('trading the military drive for a civil one empties its tank into the hold',
      tb.ok && !(back.milFuel > 0) && Math.abs(back.cargo.milfuel - 2) < 1e-9, (back.cargo.milfuel || 0) + ' t in the hold');
var swap = ship('talon'), SG = { ship: swap, standing: {}, sys: null };
var b1 = Combat.buyEquipment(SG, 'milcruise2'); swap.cargo.milfuel = 3; var inTank = Slip.milFuelFromHold(swap, 0);
var b2 = Combat.buyEquipment(SG, 'cruise3');
check('so does trading a milfuel cruise drive in for a plain one',
      b1.ok && b2.ok && b2.replaced && inTank > 0 && !(swap.milFuel > 0) && Math.abs(swap.cargo.milfuel - 3) < 1e-9,
      inTank + ' t in the tank before, ' + (swap.cargo.milfuel || 0) + ' t in the hold after');

console.log('--- proton linacs ---');
['linpulse', 'linint', 'linbeam'].forEach(function (id) {
  var g = E[id];
  check(id + ' is a proton gun with words of its own', !!g && g.particle === 'proton' && !!(g.pitch || g.blurb), g ? g.name : 'missing');
});
check('pulse, intermittent, beam: dearer each step',
      E.linpulse.price < E.linint.price && E.linint.price < E.linbeam.price);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
