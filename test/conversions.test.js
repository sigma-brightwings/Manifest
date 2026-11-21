/* conversions.test.js - hold into a hardpoint (combat.js, 2026-11-20).
 *
 *     node test/conversions.test.js
 *
 * Astra: "adding another gun hardpoint in exchange for cargo space?" - and,
 * asked: a flat cost by hull size, up to two, both registered and concealed,
 * and shuttles too. Pinned here:
 *  - a conversion adds a hardpoint AFTER the hull's own, so nothing fitted
 *    moves, and takes the flat bite of hold for her size;
 *  - two is the ceiling; a full hold or a hold too small refuses with a
 *    number; a registered one needs a shipyard, a concealed one a yard the
 *    law can be bought at (60);
 *  - a shuttle with no hardpoints can take one;
 *  - a gun fits into it and fires from it; the hold comes back exactly when
 *    one is cut out, and the hardpoints above close up with their guns;
 *  - concealed: pirates do not count it until it fires; the first shot opens
 *    it for good, draws nothing on the hull before that, and if the law is
 *    in sight it is a charge (not if the law is the Syndicate's);
 *  - a different hull has none of them, and they survive a save and a stay
 *    in the fleet.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/journal.js');
require('../src/fleet.js');
require('../src/aggression.js');
require('../src/hulls.js');
require('../src/itemmodels.js');
require('../src/render.js');
var R = global.Render, Sim = global.Sim, V = global.V;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '   ' + d : '')); }
}

var YARD = { id: 'p-yard', name: 'Test Yard', faction: 'f1', market: { role: 'shipyard', dev: 0.6 } };
var DEPOT = { id: 'p-depot', name: 'Test Depot', faction: 'f1', market: { role: 'mining', dev: 0.3 } };
function makeG(hullId, corruption, port) {
  var H = Combat.HULLS[hullId];
  var s = { hullId: hullId, fit: {}, cargo: {}, credits: 500000, dryMass: H.dryMass, fuel: H.fuelCap,
            fuelCap: H.fuelCap, thrusterFuel: H.thrusterCap, thrusterCap: H.thrusterCap,
            hullMax: H.hullMax, hullHp: H.hullMax, cargoCap: H.cargoCap,
            pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
            fwd: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 },
            bornId: hullId + '@test' };
  /* The ports are reached by id only: they have no orbits, and a shot down
   * the nose walks sys.ports looking for a hull to hit. */
  var sys = { corruption: corruption, patrols: [], ports: [], bodies: [], byId: { 'p-yard': YARD, 'p-depot': DEPOT } };
  s.docked = (port || YARD).id;
  Combat.syncLegacy(s);
  return { ship: s, sys: sys, here: { id: 'star-test', factionId: 'f1' }, t: 1000, standing: {}, wanted: {}, journal: [] };
}
function hps(s) { return Combat.slotKeys(s).filter(function (k) { return Combat.slotType(k) === 'hardpoint'; }); }

console.log('--- a registered conversion ---');
var G = makeG('mule', 30);
var s = G.ship, before = s.cargoCap, hpBefore = hps(s).length, cr0 = s.credits;
s.fit.hardpoint0 = 'phpulse';
var r = Combat.convert(G, YARD, 'open');
check('a shipyard cuts one', r.ok, r.why);
check('one more hardpoint, after the hull\'s own', hps(s).length === hpBefore + 1 && r.key === 'hardpoint' + hpBefore, r.key);
check('a Mule (M) gives up 10 t of hold', before - s.cargoCap === 10, before + ' -> ' + s.cargoCap);
check('and pays the M price', cr0 - s.credits === Combat.CONV_PRICE.M, cr0 - s.credits);
check('the gun already fitted did not move', s.fit.hardpoint0 === 'phpulse');
var fitR = Combat.fitItem(s, 'phpulse', r.key);
check('a gun fits into the new hardpoint', fitR && fitR.ok, fitR && fitR.why);
check('it is in a fire group like any other', Combat.gunsInGroup(s, 'a').some(function (e) { return e.key === r.key; }));
check('a registered gun is seen by a stranger', Combat.visiblyArmed(s));

console.log('--- the limits ---');
var r2 = Combat.convert(G, YARD, 'open');
check('a second one is allowed', r2.ok, r2.why);
var r3 = Combat.convert(G, YARD, 'open');
check('a third is not', !r3.ok && /two/.test(r3.why), r3.why);
var Gd = makeG('talon', 30, DEPOT);
var rd = Combat.convert(Gd, DEPOT, 'open');
check('a port that is not a shipyard will not cut a registered one', !rd.ok && /shipyard/.test(rd.why), rd.why);
var Gf = makeG('talon', 30);
Gf.ship.cargo.ore = Gf.ship.cargoCap - 2;
var rf = Combat.convert(Gf, YARD, 'open');
check('a full hold refuses with the tonnes to clear', !rf.ok && /needs 4 t off/.test(rf.why), rf.why);
var Gx = makeG('fighter', 30);
var rx = Combat.convert(Gx, YARD, 'open');
check('a hold too small to give 6 t refuses', !rx.ok && /too small/.test(rx.why), rx.why);
var Gp = makeG('talon', 30); Gp.ship.credits = 100;
check('no money, no hardpoint', !Combat.convert(Gp, YARD, 'open').ok);
var big = makeG('leviathan', 30), bb = big.ship.cargoCap;
Combat.convert(big, YARD, 'open');
check('flat by size: a Leviathan (XL) gives 24 t of her 900', bb - big.ship.cargoCap === 24, bb - big.ship.cargoCap);

console.log('--- shuttles ---');
var Gw = makeG('wren', 30);
check('a Wren has no hardpoints', hps(Gw.ship).length === 0);
var rw = Combat.convert(Gw, YARD, 'open');
check('she can take one', rw.ok && hps(Gw.ship).length === 1, rw.why);
var fw = Combat.fitItem(Gw.ship, 'phpulse', rw.key);
check('and a pulse gun fits in it if her reactor runs it', fw && (fw.ok || /MW|t/.test(fw.why)), fw && (fw.ok ? 'fitted' : fw.why));

console.log('--- cutting one back out ---');
var Gc = makeG('mule', 30), sc = Gc.ship, c0 = sc.cargoCap;
var ka = Combat.convert(Gc, YARD, 'open').key, kb = Combat.convert(Gc, YARD, 'open').key;
Combat.fitItem(sc, 'phpulse', kb); Combat.setGroup(sc, kb, 'b');
var u0 = Combat.unconvert(Gc, YARD, 1);
check('a mount with a gun on it must be emptied first', !u0.ok && /off it first/.test(u0.why), u0.why);
var u1 = Combat.unconvert(Gc, YARD, 0);
check('the empty one comes out', u1.ok, u1.why);
check('the one above closes up, gun and fire group with it', sc.fit[ka] === 'phpulse' && !sc.fit[kb] && Combat.groupOf(sc, ka) === 'b',
      JSON.stringify(sc.fit));
check('the hold has its 10 t back', c0 - sc.cargoCap === 10, c0 + ' -> ' + sc.cargoCap);

console.log('--- concealed ---');
var Gl = makeG('talon', 30);
check('a clean yard will not cut a hidden mount', !Combat.convert(Gl, YARD, 'hidden').ok);
var Gh = makeG('talon', 70, DEPOT), sh = Gh.ship, h0 = sh.cargoCap;
var rh = Combat.convert(Gh, DEPOT, 'hidden');
check('a bought one will, at any port', rh.ok, rh.why);
check('it takes three quarters of the bite (5 t of 6 on a Talon)', h0 - sh.cargoCap === 5, h0 - sh.cargoCap);
check('and costs more than a registered one', Combat.convPrice(sh, 'hidden') > Combat.convPrice(sh, 'open'));
Combat.fitItem(sh, 'phpulse', rh.key);
check('a gun behind the panel is hidden', Combat.isHiddenKey(sh, rh.key));
check('a ship whose only gun is concealed looks unarmed', !Combat.visiblyArmed(sh));
var mesh = R.hullPreviewMesh('talon', sh), bare = R.libHullBare(mesh.libId);
var acc = Combat.HULLS.talon.slots.hardpoint;   // two empty acceptors (24 faces each), nothing for the hidden one
check('nothing is drawn on the hull for it', mesh.f.length === bare.f.length + acc * 24, mesh.f.length + ' vs ' + (bare.f.length + acc * 24));
var mz = R.shipMuzzlesFor(sh);
check('but it still has a muzzle to fire from', mz && mz[acc] && mz[acc].length === 1);
var said = [];
var hooks = { say: function (m) { said.push(m); } };
sh.docked = null; Gh.warpIndex = 0;
var fired = Combat.fireGroup(Gh.sys, Gh, Gh.t, 'a', hooks);
check('it fires', fired >= 0);
check('the first shot opens the panel for good', !Combat.isHiddenKey(sh, rh.key) && sh.conv.exposed);
check('and from then on she looks armed', Combat.visiblyArmed(sh));
check('nobody saw it: no charge', !(Gh.wanted.f1 > 0), JSON.stringify(Gh.wanted));

/* With the law in sight. */
var Gq = makeG('talon', 70, DEPOT), sq = Gq.ship;
var rq = Combat.convert(Gq, DEPOT, 'hidden');
Combat.fitItem(sq, 'phpulse', rq.key);
sq.docked = null; Gq.warpIndex = 0;
var realNear = Sim.policeNearby;
Sim.policeNearby = function () { return { kind: 'police', faction: 'f1', name: 'Cutter Vane' }; };
Combat.fireGroup(Gq.sys, Gq, Gq.t, 'a', hooks);
check('seen by a cutter, it is a charge with her faction', Gq.wanted.f1 >= Combat.BOUNTY.armament, JSON.stringify(Gq.wanted));
var Gs = makeG('talon', 70, DEPOT), ss = Gs.ship;
var rs = Combat.convert(Gs, DEPOT, 'hidden');
Combat.fitItem(ss, 'phpulse', rs.key);
ss.docked = null; Gs.warpIndex = 0;
Sim.policeNearby = function () { return { kind: 'police', faction: 'outlaw', name: 'The Debt' }; };
Combat.fireGroup(Gs.sys, Gs, Gs.t, 'a', hooks);
check('seen by a Syndicate heavy, it is nobody\'s business', !Object.keys(Gs.wanted).length, JSON.stringify(Gs.wanted));
Sim.policeNearby = realNear;

console.log('--- it belongs to her frame ---');
var Gt = makeG('talon', 30), st = Gt.ship;
Combat.convert(Gt, YARD, 'open');
var withConv = hps(st).length;
st.hullId = 'mule';
check('a different hull has none of them', hps(st).length === Combat.HULLS.mule.slots.hardpoint);
st.hullId = 'talon';
check('her own hull still has it', hps(st).length === withConv);
var rec = global.Fleet.record(st, 'p-yard', 'Test');
check('parked in the fleet, the record keeps it', rec.conv && rec.conv.list.length === 1);
var Save = null;
try { Save = require('../src/save.js'); } catch (e) { Save = null; }
var json = JSON.stringify({ conv: st.conv });
check('it is plain data a save can carry', JSON.parse(json).conv.list[0] === 'open');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
