/* cruisedrive.test.js — cruise drive classes, milfuel, second drives, mass.
 *
 *     node test/cruisedrive.test.js
 *
 * Astra, 2026-10-19: class two costs about ten times class one, class three
 * ten times again; milfuel drives run at five times their class; some ships
 * have a second drive slot, and a second drive adds half of what a class
 * would. Chosen with her: each class doubles the speed, milfuel's five is
 * on top of the class, and a heavier ship is slower on the same drive.
 */
global.window = global.window || global;
require('../src/vec3.js'); require('../src/rng.js');
require('../src/economy.js');
var Sim = require('../src/sim.js');
var Combat = require('../src/combat.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function near(a, b, t) { return Math.abs(a - b) <= (t || 1e-9) * Math.max(1, Math.abs(b)); }
var D = Combat.CRUISE_DRIVES, H = Combat.HULLS;

function ship(hull, cargo, mass) {
  var s = { hullId: hull, cargo: cargo || {}, fit: {}, credits: 1e7, mass: mass || Combat.CRUISE_REF_MASS };
  Combat.migrateFit(s);
  s.mass = mass || Combat.CRUISE_REF_MASS;     // refreshShip set it from the stub; pin it
  return s;
}

console.log('--- prices ---');
check('Class 2 is ten times Class 1', D.cruise2.price === 10 * D.cruise1.price);
check('Class 3 is ten times Class 2', D.cruise3.price === 10 * D.cruise2.price);
check('every class has a milfuel version, dearer than the plain one',
      [1, 2, 3].every(function (c) { return D['milcruise' + c].mil && D['milcruise' + c].price > D['cruise' + c].price; }));

console.log('--- every ship has one ---');
var t = ship('talon');
check('a new Talon carries a Class 1', Combat.cruiseDrives(t).length === 1 && Combat.cruiseDrives(t)[0].item.id === 'cruise1');
var old = { hullId: 'talon', cargo: {}, fit: { hardpoint0: 'phpulse', utility0: 'cargoscoop' } };
Combat.migrateFit(old);
check('a save from before drives is given a Class 1', Combat.cruiseDrives(old).length === 1);
check('and the last drive cannot be sold off the ship', Combat.unfitItem(t, Combat.cruiseDrives(t)[0].key) === null &&
      Combat.cruiseDrives(t).length === 1);
check('small hulls have one drive slot, big ones two',
      Combat.driveSlotCount(H.talon) === 1 && Combat.driveSlotCount(H.mule) === 1 &&
      Combat.driveSlotCount(H.kestrel) === 2 && Combat.driveSlotCount(H.leviathan) === 2);

console.log('--- speed ---');
var base = Combat.cruiseTopC(t);
check('a laden Talon on a Class 1 is the base speed', near(base, Combat.CRUISE_BASE_C), base.toFixed(1) + 'c');
function withDrive(id, cargo) {
  var s = ship('talon', cargo);
  var G = { ship: s, standing: {}, sys: null };
  var r = Combat.buyEquipment(G, id);
  return { s: s, r: r };
}
var c2 = withDrive('cruise2'), c3 = withDrive('cruise3');
check('Class 2 doubles it', near(Combat.cruiseTopC(c2.s), base * 2));
check('Class 3 doubles it again', near(Combat.cruiseTopC(c3.s), base * 4));
check('buying into a full bay trades the old one in at 45%',
      c2.r.ok && c2.r.tradeIn === Math.round(D.cruise1.price * 0.45) && c2.r.cost === D.cruise2.price - c2.r.tradeIn,
      c2.r.ok ? c2.r.cost + ' cr net' : c2.r.why);
var m2 = withDrive('milcruise2', { milfuel: 5 }), m2dry = withDrive('milcruise2', {});
check('milfuel runs at five times its class', near(Combat.cruiseTopC(m2.s), base * 2 * 5));
check('with no slugs it is an ordinary drive of its class', near(Combat.cruiseTopC(m2dry.s), base * 2));
check('and only then does it burn milfuel', Combat.cruiseOnMilfuel(m2.s) && !Combat.cruiseOnMilfuel(m2dry.s));

console.log('--- a second drive ---');
var k = ship('kestrel');
var G = { ship: k, standing: {}, sys: null };
var one = Combat.cruiseTopC(k);
var r2 = Combat.buyEquipment(G, 'cruise1');
check('a big hull takes a second drive into its free slot', r2.ok && Combat.cruiseDrives(k).length === 2 && !r2.tradeIn);
check('two Class 1s are half a class better than one', near(Combat.cruiseTopC(k), one * 1.5),
      one.toFixed(0) + 'c -> ' + Combat.cruiseTopC(k).toFixed(0) + 'c');
var r3 = Combat.buyEquipment(G, 'cruise3');
check('a third purchase replaces the weaker one', r3.ok && r3.tradeIn > 0 && Combat.cruiseDrives(k).length === 2);
check('Class 3 plus Class 1: 4 x (1 + 0.5 x 1/4)', near(Combat.cruiseTopC(k), one * 4 * 1.125));

console.log('--- mass ---');
var light = ship('talon', {}, 36.5), heavy = ship('talon', {}, 584);
check('a ship four times lighter is twice as fast', near(Combat.cruiseTopC(light), base * 2));
check('four times heavier, half as fast', near(Combat.cruiseTopC(heavy), base / 2));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
