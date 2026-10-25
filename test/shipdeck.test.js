/* shipdeck.test.js — the inside of your own ship (2026-10-24).
 *
 *     node test/shipdeck.test.js
 *
 * Astra: "We need to have a modeled interior for every ship that doesn't
 * have one, specifically the cockpit. There needs to be doors that slide
 * into the structure of the ship to open the way from the cockpit into the
 * rest of the ship, and the syndicate ships need to have the dark grey and
 * red motif on the interior too." See claude/ship-interiors.md.
 *
 * What it holds, for every hull in the game:
 *   - there is a room, cut by exactly the panes the seat view has always had;
 *   - every wall stands outside the glass, so the glass is never covered;
 *   - you can get up, walk aft through both sliding doors to the airlock,
 *     and only while the doors are open;
 *   - the leaves slide INTO the bulkhead, out of the doorway;
 *   - the same ship is the same inside every time;
 *   - the Syndicate's hulls are dark grey and red, and nobody else's are.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
var Crew = require('../src/crew.js');
require('../src/hulls.js');
var Walk = require('../src/walk.js');
var SD = require('../src/shipdeck.js');
require('../src/render.js');
var R = global.Render;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function ship(id, born) {
  var h = Combat.HULLS[id];
  return { hullId: id, bornId: born || id + '-1', dryMass: h.dryMass };
}
var ids = Object.keys(Combat.HULLS);

console.log('--- a room for every hull ---');
var noRoom = [], badPanes = [], nan = [];
ids.forEach(function (id) {
  var d = R.shipInterior(ship(id));
  if (!d || !d.meshes.room.f.length) { noRoom.push(id); return; }
  /* One pane per window the seat view punches: main, two quarter-lights,
   * two side windows, the floor — as triangles, two per quad, six for the
   * eight-sided windscreen. */
  if (d.meshes.portals.f.length !== 6 + 2 + 2 + 2 + 2 + 2) badPanes.push(id + ':' + d.meshes.portals.f.length);
  ['room', 'portals', 'seat'].forEach(function (k) {
    d.meshes[k].v.forEach(function (v) { if (!v.every(isFinite)) nan.push(id + ':' + k); });
  });
});
check('every hull has a room', !noRoom.length, noRoom.join(', ') || ids.length + ' hulls');
check('cut by exactly the panes the seat view has', !badPanes.length, badPanes.join(', '));
check('no vertex is NaN', !nan.length, nan.slice(0, 5).join(', '));

console.log('--- the glass is never covered ---');
/* From the seated eye (8 cm forward of the origin), a ray to the middle of
 * every pane must reach the pane before it meets any face of the room. */
function rayTri(o, d, a, b, c) {
  var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  var p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  var det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return Infinity;
  var inv = 1 / det, s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  var u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
  if (u < 0 || u > 1) return Infinity;
  var q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  var v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  var t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return t > 1e-6 ? t : Infinity;
}
var covered = [];
ids.forEach(function (id) {
  var d = R.shipInterior(ship(id)), eye = [0, 0, 0.08];
  d.geom.windows.forEach(function (w, wi) {
    var c = [0, 0, 0];
    w.forEach(function (p) { c[0] += p[0] / w.length; c[1] += p[1] / w.length; c[2] += p[2] / w.length; });
    var dir = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
    var paneT = 1;
    var m = d.meshes.room, hit = Infinity;
    for (var i = 0; i < m.f.length; i++) {
      var f = m.f[i];
      hit = Math.min(hit, rayTri(eye, dir, m.v[f[0]], m.v[f[1]], m.v[f[2]]));
    }
    if (hit < paneT - 1e-6) covered.push(id + ' pane ' + wi + ' at ' + hit.toFixed(3));
  });
});
check('from the seat, no wall stands between you and any window', !covered.length, covered.slice(0, 6).join('; '));
/* And the walls are there: aim just OUTSIDE a pane's edge — four
 * centimetres past each corner, away from the pane's middle — and the ray
 * meets the room close behind the glass. A window set in a wall, not a pane
 * hung in front of a distant box. Windscreen and both side windows; the
 * quarter-lights and the floor window are framed the same way. */
var open = [];
ids.forEach(function (id) {
  var d = R.shipInterior(ship(id)), eye = [0, 0, 0.08];
  [0, 3, 4].forEach(function (wi) {
    var w = d.geom.windows[wi], c = [0, 0, 0];
    w.forEach(function (p) { c[0] += p[0] / w.length; c[1] += p[1] / w.length; c[2] += p[2] / w.length; });
    w.forEach(function (p, pi) {
      var o = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], ol = Math.sqrt(o[0] * o[0] + o[1] * o[1] + o[2] * o[2]) || 1;
      var q = [p[0] + o[0] / ol * 0.04, p[1] + o[1] / ol * 0.04, p[2] + o[2] / ol * 0.04];
      var dir = [q[0] - eye[0], q[1] - eye[1], q[2] - eye[2]], m = d.meshes.room, hit = Infinity;
      for (var i = 0; i < m.f.length; i++) {
        var f = m.f[i];
        hit = Math.min(hit, rayTri(eye, dir, m.v[f[0]], m.v[f[1]], m.v[f[2]]));
      }
      /* Where two panes share an edge — the windscreen and a quarter-light
       * meet at the hinge — just past one is the other, and glass is as
       * good an edge as wall. */
      d.geom.windows.forEach(function (o2, oi) {
        if (oi === wi) return;
        for (var j = 1; j + 1 < o2.length; j++) hit = Math.min(hit, rayTri(eye, dir, o2[0], o2[j], o2[j + 1]));
      });
      /* Within twice the distance: where the wall turns back along the line
       * of sight (cockpitGeometry, Q to R) a grazing ray meets wall a little
       * further out — still wall, and no sky. A hole would be no hit at all. */
      if (!(hit < 2)) open.push(id + ' pane ' + wi + ' corner ' + pi + (isFinite(hit) ? ' at ' + hit.toFixed(2) : ' nothing'));
    });
  });
});
check('and each window is set in a wall right round its edge, with no sky past it', !open.length, open.slice(0, 6).join(', '));

console.log('--- the plan ---');
var t = R.shipInterior(ship('talon'));
check('the same ship is the same inside every time',
      JSON.stringify(SD.plan(t.geom, { hullId: 'talon', size: 'S', key: t.spec.key }).rooms) ===
      JSON.stringify(SD.plan(t.geom, { hullId: 'talon', size: 'S', key: t.spec.key }).rooms));
check('cockpit, passage, airlock, front to back',
      t.plan.rooms.map(function (r) { return r.kind; }).join(',') === 'cockpit,passage,airlock' &&
      t.plan.rooms[0].z0 > t.plan.rooms[1].z0 && t.plan.rooms[1].z0 > t.plan.rooms[2].z0);
var lens = ['S', 'M', 'L', 'XL'].map(function (sz) {
  var p = SD.plan(t.geom, { hullId: 'talon', size: sz, key: 'x' });
  return p.rooms[1].z1 - p.rooms[1].z0;
});
check('a bigger ship has a longer passage', lens[0] < lens[1] && lens[1] < lens[2] && lens[2] < lens[3],
      lens.map(function (l) { return l.toFixed(1); }).join(' < '));
check('the bulkhead is a metre and more behind the seat', t.geom.bulkZ <= -1.3, t.geom.bulkZ.toFixed(2) + ' m');

console.log('--- the doors ---');
var stuck = [], early = [];
ids.forEach(function (id) {
  var d = R.shipInterior(ship(id)), p = d.plan;
  p.doors.forEach(function (dd) { dd.open = 0; dd.shut = true; });
  var w = Walk.start({ rooms: p.rooms, doors: p.doors, items: p.items, spawn: p.spawn });
  /* Shut, the doorway is wall: a step into the sill is refused. */
  var bz = p.doors[0].wall[1];
  if (Walk.standable(p, 0, bz)) early.push(id);
  w.yaw = Math.PI;
  for (var i = 0; i < 2000; i++) {
    SD.updateDoors(p, w, 1 / 30);
    Walk.step(w, { w: true }, 1 / 30);
    if (w.z < p.rooms[2].z1 - 0.5) break;
  }
  if (!(w.z < p.rooms[2].z1 - 0.5)) stuck.push(id + ' z=' + w.z.toFixed(2));
});
check('a shut door is wall', !early.length, early.join(', '));
check('get up, walk aft, and both doors open for you all the way to the airlock', !stuck.length, stuck.join(', '));
var p0 = t.plan;
p0.doors.forEach(function (dd) { dd.open = 1; });
SD.updateDoors(p0, { x: 0, z: 50 }, 5);
check('and close behind you when you are gone', p0.doors.every(function (dd) { return dd.open === 0 && dd.shut; }));
check('a leaf slides its whole width into the wall', Math.abs(SD.leafTravel(1) - SD.DOOR_HW) < 1e-12 &&
      SD.leafTravel(0) === 0 && SD.leafTravel(0.5) > 0 && SD.leafTravel(0.5) < SD.DOOR_HW);
/* The open leaf lies between the bulkhead's two faces, out of the doorway:
 * its inner edge at the jamb, its body inside the wall. */
var leaf = t.meshes.leaves.bridge[1], lx = Infinity, lzs = [];
leaf.v.forEach(function (v) { lx = Math.min(lx, v[0] + SD.leafTravel(1)); lzs.push(v[2]); });
var wall = p0.doors[0].wall;
check('open, it is out of the doorway and inside the bulkhead',
      lx >= SD.DOOR_HW - 1e-9 && Math.min.apply(null, lzs) > wall[0] - 0.01 && Math.max.apply(null, lzs) < wall[1] + 0.01,
      'inner edge ' + lx.toFixed(3) + ' m, between ' + wall[0].toFixed(2) + ' and ' + wall[1].toFixed(2));
var near = Walk.facing(Walk.start({ rooms: p0.rooms, doors: p0.doors, items: p0.items, spawn: { x: 0, z: p0.bay, yaw: 0 } }));
check('standing up, facing forward, E takes the seat', !!near && near.kind === 'seat', near && near.kind);
check('the dash and consoles are furniture, never something to use',
      p0.items.filter(function (i) { return i.silent; }).length === 3);

console.log('--- the bridge and the crew ---');
/* Astra: "M and L size ships might have multiple crew stations on the
 * bridge", "match the geometry of the ship, but with multiple crew
 * stations", and "All ships which have crew stations require crew
 * quarters." A station for every hand the hull needs with you at the helm,
 * a bunk for each and one for you. */
function kinds(p) { return p.rooms.map(function (r) { return r.kind; }); }
var wrongStations = [], wrongBunks = [], noQuarters = [], soloExtra = [];
ids.forEach(function (id) {
  var p = R.shipInterior(ship(id)).plan, need = Crew.crewNeeded(id, true);
  var size = Combat.HULLS[id].size;
  if (size === 'S') {
    if (p.stations.length || kinds(p).indexOf('quarters') >= 0 || kinds(p).indexOf('bridgedeck') >= 0) soloExtra.push(id);
    return;
  }
  var want = Math.min(SD.STATION_MAX, need.engineer + need.gunner);
  if (p.stations.length !== want) wrongStations.push(id + ' ' + p.stations.length + '/' + want);
  if (p.stations.length && kinds(p).indexOf('quarters') < 0) noQuarters.push(id);
  if (p.bunks !== need.total + 1) wrongBunks.push(id + ' ' + p.bunks);
});
check('a one-seat ship is one seat: no bridge deck, no quarters', !soloExtra.length, soloExtra.join(', '));
check('every crewed hull has a station for every hand she needs (up to the deck\'s ' + SD.STATION_MAX + ')',
      !wrongStations.length, wrongStations.join(', '));
check('every ship with crew stations has crew quarters', !noQuarters.length, noQuarters.join(', '));
check('a bunk for every hand and one for you', !wrongBunks.length, wrongBunks.join(', '));
var kp = R.shipInterior(ship('kestrel')).plan;
check('a Kestrel\'s bridge: two engineering stations and gunnery',
      kp.stations.map(function (s) { return s.role; }).join(',') === 'engineer,engineer,gunner');
var cr = SD.stationRoles({ engineer: 6, gunner: 3 });
check('a crowded bridge shares its stations out, gunnery included',
      cr.length === SD.STATION_MAX && cr.indexOf('gunner') >= 0 && cr.indexOf('engineer') >= 0, cr.join(','));
/* Everything reachable: from where you stand up, with the doors open,
 * every room on every hull — so no station or bunk walls anything off. */
function fill(p) {
  p.doors.forEach(function (d) { if (d.slide) { d.open = 1; d.shut = false; } });
  var h = 0.05, ox = p.spawn.x, oz = p.spawn.z, seen = { '0,0': 1 }, q = [[0, 0]];
  while (q.length) {
    var c = q.pop();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var i = c[0] + d[0], j = c[1] + d[1], key = i + ',' + j;
      if (seen[key] || !Walk.standable(p, ox + i * h, oz + j * h)) return;
      seen[key] = 1; q.push([i, j]);
    });
  }
  return function (x, z) { return !!seen[Math.round((x - ox) / h) + ',' + Math.round((z - oz) / h)]; };
}
var cutOff = [];
ids.forEach(function (id) {
  var p = R.shipInterior(ship(id)).plan, has = fill(p);
  p.rooms.forEach(function (r) {
    var ok = false;
    for (var x = r.x0 + 0.35; x < r.x1 - 0.3 && !ok; x += 0.05)
      for (var z = r.z0 + 0.35; z < r.z1 - 0.3 && !ok; z += 0.05) if (has(x, z)) ok = true;
    if (!ok) cutOff.push(id + ':' + r.kind);
  });
  p.doors.forEach(function (d) { if (d.slide) { d.open = 0; d.shut = true; } });
});
check('every room on every ship can be walked to', !cutOff.length, cutOff.join(', '));
/* The helm keeps its bulkhead where the seat has always had it; the
 * doorway through it is an open arch, and the sliding door is aft of the
 * bridge deck. */
var kd = R.shipInterior(ship('kestrel'));
var helm = SD.doorById(kd.plan, 'helm'), bdoor = SD.doorById(kd.plan, 'bridge');
check('the helm\'s bulkhead has not moved', !!helm && Math.abs(helm.wall[1] - kd.geom.bulkZ) < 1e-9);
check('its doorway is an open arch, never shut', helm.arch && !helm.slide && helm.shut === false);
check('the bridge door is at the bridge deck\'s aft end',
      Math.abs(bdoor.wall[1] - SD.roomByKind(kd.plan, 'bridgedeck').z0) < 1e-9);
/* E at a station says whose it is. */
var st0 = kd.plan.stations[0];
var at = Walk.start({ rooms: kd.plan.rooms, doors: kd.plan.doors, items: kd.plan.items,
                      spawn: { x: 0, z: st0.z, yaw: st0.side < 0 ? -Math.PI / 2 : Math.PI / 2 } });
var nearSt = Walk.facing(at);
check('in the aisle, facing a station, E is that station', !!nearSt && nearSt.kind === 'station' && nearSt.role === st0.role,
      nearSt && nearSt.label);
/* The quarters' door is a door: wall while it is shut, and its leaves go
 * into the passage wall, out of the doorway, when it opens. */
var qd = SD.doorById(kd.plan, 'quarters');
qd.open = 0; qd.shut = true;
check('the quarters door, shut, is wall', !Walk.standable(kd.plan, (qd.wall[0] + qd.wall[1]) / 2, qd.zc));
SD.updateDoors(kd.plan, { x: -0.3, z: qd.zc }, 5);
check('and opens as you reach it', qd.open === 1 && !qd.shut &&
      Walk.standable(kd.plan, (qd.wall[0] + qd.wall[1]) / 2, qd.zc));
var ql = kd.meshes.leaves.quarters[1], qz = Infinity, qxs = [];
ql.v.forEach(function (v) { qz = Math.min(qz, v[2] + SD.leafTravel(1)); qxs.push(v[0]); });
check('open, its leaves are out of the doorway and inside the wall',
      qz >= qd.zc + SD.DOOR_HW - 1e-9 && Math.min.apply(null, qxs) > qd.wall[0] - 0.01 && Math.max.apply(null, qxs) < qd.wall[1] + 0.01);
qd.open = 0; qd.shut = true;

console.log('--- whose colours ---');
var syn = ids.filter(function (id) { return R.shipInterior(ship(id)).plan.palette === 'syndicate'; }).sort();
check('the Syndicate\'s hulls and only theirs are dark grey and red', syn.join(',') === 'enforcer,enforcerheavy,runner', syn.join(','));
check('the Syndicate\'s Crawler is too', SD.paletteFor('crawler', 'crawler_syndicate') === 'syndicate');
check('the Navy\'s are navy', ['capital', 'carrier', 'cutter'].every(function (id) {
  return R.shipInterior(ship(id)).plan.palette === 'navy';
}));
var sp = SD.PALETTES.syndicate;
function rgb(h) { h = h.replace('!', ''); var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
var grey = ['wall', 'floor', 'ceil', 'console', 'bulk', 'leaf'].every(function (k) {
  var c = rgb(sp[k]); return Math.max.apply(null, c) - Math.min.apply(null, c) < 12 && c[0] < 80;
});
var red = ['leafEdge', 'trim', 'hazard'].every(function (k) { var c = rgb(sp[k]); return c[0] > 2 * c[1] && c[0] > 2 * c[2]; });
check('the Syndicate\'s room is dark grey where you put a hand or a foot', grey);
check('and red where something is telling you something', red);
var synRoom = R.shipInterior(ship('enforcer')).meshes.room.c;
check('and the Enforcer\'s room is built from it', synRoom.indexOf(sp.wall) >= 0 && synRoom.indexOf(sp.trim) >= 0 &&
      synRoom.indexOf(SD.PALETTES.civil.wall) < 0);

console.log('--- a Crawler in somebody\'s colours ---');
/* Astra: "Player crawlers can have syndicate livery if they're operating
 * for the Syndicate." Commissioned or repainted at their own yard, to a
 * captain they trust as far as an Enforcer's (40); a navy's the same way. */
var synYard = { id: 'y1', name: 'Red Slip', faction: 'outlaw', market: { role: 'shipyard' } };
var navYard = { id: 'y2', name: 'Fleet Slip', faction: 'empire', market: { role: 'shipyard' } };
var civYard = { id: 'y3', name: 'Free Slip', faction: 'civil', market: { role: 'shipyard' } };
var synDock = { id: 'y4', name: 'Red Dock', faction: 'outlaw', market: { role: 'trade' } };
function Gw(st) { return { standing: st || {}, warrants: {}, ship: { hullId: 'crawler', credits: 50000 } }; }
check('a civilian livery anywhere', Combat.liveryRefusal(Gw(), civYard, 'civ') === null);
check('the Syndicate\'s only at a yard they hold', !!Combat.liveryRefusal(Gw({ outlaw: 90 }), civYard, 'syn') &&
      !!Combat.liveryRefusal(Gw({ outlaw: 90 }), synDock, 'syn'));
check('and only to a captain they trust', !!Combat.liveryRefusal(Gw({ outlaw: 39 }), synYard, 'syn') &&
      Combat.liveryRefusal(Gw({ outlaw: 40 }), synYard, 'syn') === null,
      Combat.liveryRefusal(Gw({ outlaw: 39 }), synYard, 'syn'));
check('a navy\'s only at its own yard, to an ally', !!Combat.liveryRefusal(Gw({ empire: 90 }), synYard, 'navy') &&
      !!Combat.liveryRefusal(Gw({ empire: 20 }), navYard, 'navy') &&
      Combat.liveryRefusal(Gw({ empire: 40 }), navYard, 'navy') === null);
var crawler = { hullId: 'crawler', bornId: 'cr-1', dryMass: Combat.HULLS.crawler.dryMass };
check('a civilian Crawler is civilian inside', R.shipInterior(crawler).plan.palette === 'civil');
crawler.livery = 'syn';
check('in Syndicate colours she is theirs inside too', R.shipInterior(crawler).plan.palette === 'syndicate');
crawler.livery = 'navy';
check('and a navy\'s, navy', R.shipInterior(crawler).plan.palette === 'navy');
var other = { hullId: 'talon', bornId: 't-1', dryMass: 42, livery: 'syn' };
check('no other hull takes a livery', !Combat.LIVERY_HULLS.talon);
check('the fleet record carries it', (function () {
  require('../src/fleet.js');
  var rec = global.Fleet.record({ hullId: 'crawler', livery: 'syn', liveryFaction: 'outlaw', fit: {}, cargo: {} }, 'p1', 'Red Mule');
  return rec.livery === 'syn' && rec.liveryFaction === 'outlaw';
})());

/* A repaint, end to end, at a Syndicate yard. */
var Gr = Gw({ outlaw: 45 });
Gr.sys = { byId: { y1: synYard } };
Gr.ship.docked = 'y1';
var r1 = Combat.repaintLivery(Gr, 'syn');
check('a trusted captain can have her repainted in their colours, for the price',
      r1.ok && Gr.ship.livery === 'syn' && Gr.ship.credits === 50000 - Combat.REPAINT_PRICE, r1.why);
check('she stays theirs until she is repainted', !Combat.repaintLivery(Gr, 'syn').ok && Gr.ship.livery === 'syn');
var r2 = Combat.repaintLivery(Gr, 'civ');
check('and the same yard paints her back to civilian', r2.ok && Gr.ship.livery === null);
Gr.ship.hullId = 'talon';
check('nobody paints a Talon in faction colours', !Combat.repaintLivery(Gr, 'syn').ok);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
