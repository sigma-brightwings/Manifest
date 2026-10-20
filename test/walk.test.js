/* walk.test.js — on foot in a station (2026-10-20).
 *
 * Astra: "full first person walking. We do need to model station interiors
 * to walk in." The rules checked here are the ones that make it a building
 * rather than a picture of one: the same port is the same plan every
 * visit; every room can be walked to from your berth; the doors are the
 * only way between rooms; berths get smaller the further they are from
 * the L port; and every ship of yours in port has a hatch you can reach.
 *
 *     node test/walk.test.js
 */
'use strict';
var path = require('path');
var Walk = require(path.join(__dirname, '..', 'src', 'walk.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}

var ships = [
  { id: 'me', size: 'M', name: 'Long Haul', current: true },
  { id: 'f1', size: 'L', name: 'Big Sister' },
  { id: 'f2', size: 'S', name: 'Errand' }
];
var plan = Walk.layout('port-7', { seed: 'kawartha', yard: true, ships: ships });

console.log('--- the plan ---');
check('the same port is the same building every visit',
      JSON.stringify(plan) === JSON.stringify(Walk.layout('port-7', { seed: 'kawartha', yard: true, ships: ships })));
check('another port is another building',
      JSON.stringify(plan.rooms) !== JSON.stringify(Walk.layout('port-8', { seed: 'kawartha', yard: true, ships: ships }).rooms) ||
      JSON.stringify(Walk.layout('port-9', { seed: 'kawartha', ships: [] }).rooms) !==
      JSON.stringify(Walk.layout('port-10', { seed: 'kawartha', ships: [] }).rooms));
var kinds = plan.rooms.map(function (r) { return r.kind; });
['lport', 'corridor', 'berth', 'concourse', 'bar', 'crewhall'].forEach(function (k) {
  check('it has a ' + k, kinds.indexOf(k) >= 0);
});
var berths = plan.rooms.filter(function (r) { return r.kind === 'berth'; });
var rank = { L: 0, M: 1, S: 2 };
var bySide = [-1, 1].map(function (sd) {
  return berths.filter(function (b) { return b.side === sd; }).sort(function (a, b) { return a.z0 - b.z0; });
});
check('berths get smaller the further they are from the L port (Astra)', bySide.every(function (list) {
  for (var i = 1; i < list.length; i++) if (rank[list[i].size] < rank[list[i - 1].size]) return false;
  return true;
}));
check('no two rooms overlap', plan.rooms.every(function (a, i) {
  return plan.rooms.every(function (b, j) {
    return i >= j || a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0;
  });
}));
check('a shipyard has a yard counter', plan.items.some(function (it) { return it.kind === 'yard'; }));
check('a port without a yard has none',
      !Walk.layout('p', { seed: 's', ships: [] }).items.some(function (it) { return it.kind === 'yard'; }));

console.log('--- walking it ---');
check('you start where you can stand', Walk.standable(plan, plan.spawn.x, plan.spawn.z));
/* Flood the floor from the spawn on a quarter-metre grid, moving the way
 * step() moves: one axis at a time, only onto standable ground. */
var G = 0.25, seen = {}, queue = [[Math.round(plan.spawn.x / G), Math.round(plan.spawn.z / G)]];
seen[queue[0].join(',')] = true;
while (queue.length) {
  var c = queue.shift();
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
    var n = [c[0] + d[0], c[1] + d[1]], key = n.join(',');
    if (seen[key]) return;
    if (!Walk.standable(plan, n[0] * G, n[1] * G)) return;
    seen[key] = true; queue.push(n);
  });
}
function reached(x, z) {
  for (var dx = -2; dx <= 2; dx++) for (var dz = -2; dz <= 2; dz++) {
    if (seen[(Math.round(x / G) + dx) + ',' + (Math.round(z / G) + dz)]) return true;
  }
  return false;
}
var unreached = plan.rooms.filter(function (r) { return !reached((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); });
check('every room can be walked to from your berth', !unreached.length, unreached.map(function (r) { return r.id; }).join(','));
var unreachedItems = plan.items.filter(function (it) { return !reached(it.x + (it.counter ? 0 : 0), it.z) &&
  !Object.keys(seen).some(function (k) {
    var p = k.split(',').map(Number);
    return Math.hypot(p[0] * G - it.x, p[1] * G - it.z) < Walk.REACH;
  }); });
check('and everything in it can be reached to use', !unreachedItems.length, unreachedItems.map(function (i) { return i.label; }).join(','));

var spine = plan.rooms.filter(function (r) { return r.id === 'spine'; })[0];
var b0 = berths[0];
var wallX = b0.side < 0 ? b0.x1 : b0.x0;
var midZ = (b0.z0 + b0.z1) / 2, offDoor = b0.z0 + 0.6;
check('you cannot stand inside a wall', !Walk.standable(plan, wallX, offDoor));
check('but you can stand in a doorway', Walk.standable(plan, wallX, midZ));
check('nor outside the station', !Walk.standable(plan, 500, 500));

/* Walk the corridor: hold W from the L port side and you go up the spine. */
var w = Walk.start(plan);
w.x = 0; w.z = 1; w.yaw = 0;
for (var t = 0; t < 60; t++) Walk.step(w, { w: true }, 0.1);
check('W walks you forward up the spine', w.z > 9, w.z.toFixed(2));
var before = w.x;
w.yaw = Math.PI / 2;          // face +x, into the spine's wall between doors
w.z = spine.z1 - 0.2 > spine.z0 ? Math.min(spine.z1 - 1, w.z) : w.z;
for (t = 0; t < 40; t++) Walk.step(w, { w: true }, 0.1);
check('a wall stops you (or a door lets you through, never the bare wall)',
      Walk.standable(plan, w.x, w.z), w.x.toFixed(2) + ',' + w.z.toFixed(2) + ' from ' + before.toFixed(2));
check('Shift runs', (function () {
  var a = Walk.start(plan); a.x = 0; a.z = 1; a.yaw = 0;
  var b = Walk.start(plan); b.x = 0; b.z = 1; b.yaw = 0;
  Walk.step(a, { w: true }, 0.5); Walk.step(b, { w: true, shift: true }, 0.5);
  return b.z - 1 > (a.z - 1) * 1.8;
})());

console.log('--- your ships ---');
var hatches = plan.items.filter(function (it) { return it.ship; });
check('every ship of yours in port has a hatch', hatches.length === ships.length, hatches.length);
check('each in a berth of her own size', hatches.every(function (it) {
  var br = plan.rooms.filter(function (r) { return r.id === it.berth; })[0];
  return br.size === Walk.sizeClass(it.ship.size);
}));
var mine = hatches.filter(function (it) { return it.kind === 'mine'; })[0];
check('you step out beside your own ship\'s hatch',
      mine && Math.hypot(plan.spawn.x - mine.x, plan.spawn.z - mine.z) < Walk.REACH);
var w2 = Walk.start(plan);
Walk.step(w2, {}, 0.016);
check('you step out facing into the berth, your back to her', w2.near !== mine);
w2.yaw += Math.PI;
Walk.step(w2, {}, 0.016);
check('turn round and E acts on your own ship', w2.near === mine, w2.near && w2.near.label);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
