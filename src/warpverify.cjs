// warpverify.cjs — "time warp" should only pin to 1x for something actually
// dangerous, not for a routine police scan you have no say in anyway.
'use strict';
var Sim = require('./sim.js');
var CLOSE_RANGE = 250; // mirrors sim.js's own constant, not exported — see below

function makeShip() {
  return { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, docked: null, landed: null };
}
function makePatrol(kind, mode, hostile, rangeKm) {
  return {
    kind: kind, mode: mode, hostileToPlayer: !!hostile,
    live: { pos: { x: rangeKm, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
            fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } },
    accel: 0.02, modeSince: 100
  };
}
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok  ', msg);
}

// dtSim = 0 freezes steerNpc's integration loop entirely (its for-loop
// guards on `remaining > 1e-6`), so position/velocity/mode stay exactly
// what this test set them to — only the warp-policy read at the bottom of
// updateEncounters is under test.

// 1. A routine, non-hostile police scan sitting right on top of you no
//    longer pins the hard floor — only the softer "something is awake" cap.
var sys1 = { patrols: [makePatrol('police', 'inspect', false, 50)], gravBodies: [] };
var r1 = Sim.updateEncounters(sys1, 0, 0, makeShip());
assert(r1.closest === 50, 'closest tracks the scanning cop regardless (' + r1.closest + ')');
assert(r1.dangerClosest === Infinity, 'a non-hostile inspection is not "dangerous" (' + r1.dangerClosest + ')');
assert(r1.warpCap === 500, 'warp only capped at the soft 500x, not pinned to 1x (' + r1.warpCap + ')');

// 2. The same cop, but you are wanted and it has gone hostile (combat.js
//    sets hostileToPlayer + mode 'attack' the instant a warrant is live) —
//    THIS still pins the hard floor.
var sys2 = { patrols: [makePatrol('police', 'attack', true, 50)], gravBodies: [] };
var r2 = Sim.updateEncounters(sys2, 0, 0, makeShip());
assert(r2.dangerClosest === 50, 'a hostile cop with a warrant IS dangerous (' + r2.dangerClosest + ')');
assert(r2.warpCap === 1, 'and still pins warp to 1x (' + r2.warpCap + ')');

// 3. A pirate closing to rob you (intercept/demand) still pins the floor,
//    exactly as before this change — nothing about an actual threat got
//    easier to escape.
var sys3 = { patrols: [makePatrol('pirate', 'intercept', false, 50)], gravBodies: [] };
var r3 = Sim.updateEncounters(sys3, 0, 0, makeShip());
assert(r3.dangerClosest === 50, 'a closing pirate is dangerous even before it demands anything (' + r3.dangerClosest + ')');
assert(r3.warpCap === 1, 'pirate intercept still pins warp to 1x (' + r3.warpCap + ')');

var sys3b = { patrols: [makePatrol('pirate', 'demand', false, 50)], gravBodies: [] };
var r3b = Sim.updateEncounters(sys3b, 0, 0, makeShip());
assert(r3b.warpCap === 1, 'an active pirate demand still pins warp to 1x');

// 4. A merc or navy patrol just sharing the neighbourhood, not hostile —
//    same relief as the police scan case.
var sys4 = { patrols: [makePatrol('merc', 'shadow', false, 50)], gravBodies: [] };
var r4 = Sim.updateEncounters(sys4, 0, 0, makeShip());
assert(r4.warpCap === 500, 'a non-hostile escort nearby only gets the soft cap (' + r4.warpCap + ')');

// 5. Mixed: a benign cop right on top of you AND something already
//    hostile farther off (a merc gone hostile, say) — the danger distance
//    should track the HOSTILE contact, not the cop, and still pin to 1x
//    because that is the actual threat. (Not using a pirate here: a police
//    patrol this close to the ship makes any pirate break off on its own —
//    see `policeNearby` — which is correct pre-existing behaviour and not
//    what this case is testing.)
var sys5 = {
  patrols: [makePatrol('police', 'inspect', false, 20),
            makePatrol('merc', 'attack', true, 800)],
  gravBodies: []
};
var r5 = Sim.updateEncounters(sys5, 0, 0, makeShip());
assert(r5.closest === 20, 'closest still reports the nearer (benign) contact (' + r5.closest + ')');
assert(r5.dangerClosest === 800, 'dangerClosest tracks the actual threat, not the cop (' + r5.dangerClosest + ')');
assert(r5.warpCap === 1, 'still pinned, because 800 km is inside CLOSE_RANGE*4 (' + r5.warpCap + ')');

// 6. A pirate far enough away that even its danger distance clears the
//    hard-floor radius: only the soft cap applies.
var sys6 = { patrols: [makePatrol('pirate', 'intercept', false, CLOSE_RANGE * 5)], gravBodies: [] };
var r6 = Sim.updateEncounters(sys6, 0, 0, makeShip());
assert(r6.warpCap === 500, 'a pirate outside the hard-floor radius only gets the soft cap (' + r6.warpCap + ')');

// 7. Nothing at all nearby: no cap.
var sys7 = { patrols: [], gravBodies: [] };
var r7 = Sim.updateEncounters(sys7, 0, 0, makeShip());
assert(r7.warpCap === Infinity, 'an empty system has no warp cap at all');

if (process.exitCode) console.log('\nSOME CHECKS FAILED');
else console.log('\nall checks passed');
