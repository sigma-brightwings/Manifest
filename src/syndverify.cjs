// syndverify.cjs — the Syndicate's own arms locker.
//
// Checks two things introduced together, because they are one design:
//   1. A player who is far enough inside the Syndicate (standing >= 70,
//      same threshold as INTIMIDATE_STANDING) can buy syndbeam at a port
//      the Syndicate holds, and nowhere else, and not before then.
//   2. Their own enforcement wing — a `police`-kind patrol flying under
//      the outlaw flag — fires SYNDICATE_GUN, not the flat NPC_GUN every
//      other patrol carries, and a loitering `pirate`-kind raider (same
//      faction id, different job) still carries the ordinary gun.
'use strict';
global.V = {
  dist: function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },
  sub: function (a, b) { return { x: a.x - b.x, y: a.y - b.y }; },
  len: function (a) { return Math.hypot(a.x, a.y); },
  clone: function (a) { return { x: a.x, y: a.y }; }
};
var C = require('./combat.js');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok  ', msg);
}

// ---- 1. stockAt gating -----------------------------------------------
var port = { faction: 'outlaw', market: { dev: 0.3 } };
var alliedPort = { faction: 'allied', market: { dev: 0.6 } };

function findSynd(G, p) {
  var rows = C.stockAt(G, p);
  return rows.filter(function (r) { return r.item.id === 'syndbeam'; })[0];
}

var lowStanding = { standing: { outlaw: 20 }, sys: { corruption: 80, crimeScore: 80 } };
var row = findSynd(lowStanding, port);
assert(row && !row.available, 'standing 20 at a Syndicate port: listed, not available');
assert(row && /70\+ standing with the Syndicate/.test(row.why), 'refusal names the threshold: "' + (row && row.why) + '"');

var highStanding = { standing: { outlaw: 70 }, sys: { corruption: 80, crimeScore: 80 } };
row = findSynd(highStanding, port);
assert(row && row.available, 'standing 70 at a Syndicate port: available');

var wantedHigh = { standing: { outlaw: 90 }, wanted: { outlaw: 5000 }, sys: { corruption: 80, crimeScore: 80 } };
row = findSynd(wantedHigh, port);
assert(row && !row.available && /will not arm/.test(row.why), 'wanted by the Syndicate itself, even at standing 90: refused ("' + (row && row.why) + '")');

var atAllied = findSynd({ standing: { outlaw: 90, allied: 90 }, sys: { corruption: 10, crimeScore: 10 } }, alliedPort);
assert(!atAllied, 'not stocked at all at a port the Syndicate does not hold, any standing');

// A high-standing Syndicate friend should NOT unlock it through low corruption alone —
// syndicate branch never reads corrupt/crime.
var lowCorruptSyndPort = { faction: 'outlaw', market: { dev: 0.3 } };
row = findSynd({ standing: { outlaw: 70 }, sys: { corruption: 5, crimeScore: 5 } }, lowCorruptSyndPort);
assert(row && row.available, 'gate is standing, not corruption — available even where corruption is low');

// ---- 2. NPC gun selection ---------------------------------------------
var sys = {
  patrols: [
    { id: 'enforcer', kind: 'police', faction: 'outlaw', hostileToPlayer: true, cls: 'police',
      live: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } } },
    { id: 'legit-cop', kind: 'police', faction: 'allied', hostileToPlayer: true, cls: 'police',
      live: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } } },
    { id: 'raider', kind: 'pirate', faction: 'outlaw', hostileToPlayer: true, cls: 'pirate',
      live: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } } }
  ]
};
function freshG() {
  return { ship: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, hullHp: 999, panels: [] }, beams: [] };
}

var G1 = freshG();
C.updateNpcFire(sys, G1, 0, 1, {});
var enforcerShot = G1.beams.filter(function (b) { return true; });
// Fire many ticks to get past the RNG hit-chance roll and read the cooldown that got set.
sys.patrols[0].coolUntil = 0;
G1 = freshG();
C.updateNpcFire(sys, G1, 0, 1, {});
assert(sys.patrols[0].coolUntil === C.SYNDICATE_GUN.cooldown,
  'Syndicate enforcer (police/outlaw) cooldown reads off SYNDICATE_GUN (' + sys.patrols[0].coolUntil + ' === ' + C.SYNDICATE_GUN.cooldown + ')');

sys.patrols[1].coolUntil = 0;
G1 = freshG();
C.updateNpcFire(sys, G1, 0, 1, {});
assert(sys.patrols[1].coolUntil === C.NPC_GUN.cooldown,
  'legit police (allied) still on flat NPC_GUN (' + sys.patrols[1].coolUntil + ' === ' + C.NPC_GUN.cooldown + ')');

sys.patrols[2].coolUntil = 0;
G1 = freshG();
C.updateNpcFire(sys, G1, 0, 1, {});
assert(sys.patrols[2].coolUntil === C.NPC_GUN.cooldown,
  'loitering pirate (pirate/outlaw) still on flat NPC_GUN, not elevated by the faction id alone (' + sys.patrols[2].coolUntil + ' === ' + C.NPC_GUN.cooldown + ')');

console.log('\nDPS check: NPC_GUN', (C.NPC_GUN.dmg / C.NPC_GUN.cooldown).toFixed(2),
  'vs SYNDICATE_GUN', (C.SYNDICATE_GUN.dmg / C.SYNDICATE_GUN.cooldown).toFixed(2),
  '(' + (C.SYNDICATE_GUN.dmg / C.SYNDICATE_GUN.cooldown / (C.NPC_GUN.dmg / C.NPC_GUN.cooldown)).toFixed(2) + 'x)');

if (process.exitCode) { console.log('\nSOME CHECKS FAILED'); }
else console.log('\nall checks passed');
