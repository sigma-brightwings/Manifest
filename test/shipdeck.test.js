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
  /* And, since 2026-10-25, a dome over each turret seat: ten segments in
   * two bands of quads and a cap of ten triangles. */
  var domes = (d.plan.turrets || []).length * (2 * 10 * 2 + 10);
  /* And on the two with a conning tower, the tower's glass all round the
   * bridge deck and lobby (towers.test.js) — more, never fewer. */
  var seatPanes = 6 + 2 + 2 + 2 + 2 + 2 + domes, nP = d.meshes.portals.f.length;
  if (d.plan.tower ? nP <= seatPanes : nP !== seatPanes) badPanes.push(id + ':' + nP);
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
/* 2026-10-26: the airlock left the end of the passage for its port side,
 * so its inner door is across the ship from the ramp in its floor (Astra:
 * "perpendicular to the ramp is another airlock door"). */
var tl = t.plan.rooms[2], tp = t.plan.rooms[1];
check('cockpit, passage, airlock: the cockpit forward, the airlock off the passage\'s port side',
      t.plan.rooms.map(function (r) { return r.kind; }).join(',') === 'cockpit,passage,airlock' &&
      t.plan.rooms[0].z0 > tp.z0 && tl.x1 <= tp.x0 + 1e-9 && tl.z1 <= tp.z1 && tl.z0 >= tp.z0 - 1e-9);
var lens = ['S', 'M', 'L', 'XL'].map(function (sz) {
  var p = SD.plan(t.geom, { hullId: 'talon', size: sz, key: 'x' });
  return p.rooms[1].z1 - p.rooms[1].z0;
});
/* A small ship's passage is as long as her airlock beside it needs, which
 * can be as long as a medium one's: never shorter. */
check('a bigger ship has a longer passage (never a shorter one)', lens[0] <= lens[1] && lens[1] < lens[2] && lens[2] < lens[3],
      lens.map(function (l) { return l.toFixed(1); }).join(' < '));
check('the bulkhead is a metre and more behind the seat', t.geom.bulkZ <= -1.3, t.geom.bulkZ.toFixed(2) + ' m');

console.log('--- the doors ---');
var stuck = [], early = [];
/* Walk `p` straight aft from `from` until z is below `z`, the doors
 * opening as you come. */
function walkAft(p, from, z) {
  var w = Walk.start({ rooms: p.rooms, doors: p.doors, items: p.items, spawn: from });
  w.yaw = Math.PI;
  for (var i = 0; i < 2000; i++) {
    SD.updateDoors(p, w, 1 / 30);
    Walk.step(w, { w: true }, 1 / 30);
    if (w.z < z) break;
  }
  return w;
}
ids.forEach(function (id) {
  var d = R.shipInterior(ship(id)), whole = d.plan;
  whole.doors.forEach(function (dd) { dd.open = 0; dd.shut = true; });
  /* A decked hull (2026-10-25): aft on the bridge deck into the lift, and
   * on the main deck out of it aft to the airlock. */
  var p = whole.decks ? whole.decks.bridge : whole;
  /* Shut, the doorway is wall: a step into the sill is refused. */
  var bz = SD.doorById(whole, 'bridge').wall[1];
  if (Walk.standable(p, 0, bz)) early.push(id);
  var lockZ = SD.roomByKind(whole, 'airlock').z1 - 0.5;
  if (whole.decks) {
    var carMid = (whole.carZ[0] + whole.carZ[1]) / 2;
    var w1 = walkAft(p, p.spawn, carMid);
    if (!(w1.z < carMid)) stuck.push(id + ' bridge z=' + w1.z.toFixed(2));
    var w2 = walkAft(whole.decks.main, { x: 0, z: carMid, yaw: Math.PI }, lockZ);
    if (!(w2.z < lockZ)) stuck.push(id + ' main z=' + w2.z.toFixed(2));
  } else {
    var w = walkAft(p, p.spawn, lockZ);
    if (!(w.z < lockZ)) stuck.push(id + ' z=' + w.z.toFixed(2));
  }
});
check('a shut door is wall', !early.length, early.join(', '));
check('get up, walk aft, and the doors open for you all the way to the airlock (by the lift on a decked hull)', !stuck.length, stuck.join(', '));
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
    /* Only the Lance's gunner console behind you, in the cockpit itself. */
    var inBridge = p.stations.filter(function (st) { return !st.cockpit; }).length;
    if (inBridge || kinds(p).indexOf('quarters') >= 0 || kinds(p).indexOf('bridgedeck') >= 0) soloExtra.push(id);
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
function fill(p, from) {
  from = from || p.spawn;
  p.doors.forEach(function (d) { if (d.slide) { d.open = 1; d.shut = false; } });
  var h = 0.05, ox = from.x, oz = from.z, seen = { '0,0': 1 }, q = [[0, 0]];
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
/* Each deck of a decked hull on its own, from the lift (2026-10-25): the
 * lift is the only way between them, and the tramway is ridden, not
 * walked. */
function eachDeck(whole, fn) {
  if (!whole.decks) { fn(whole, whole.spawn); return; }
  var mid = { x: 0, z: (whole.carZ[0] + whole.carZ[1]) / 2 };
  whole.deckOrder.forEach(function (dk) { fn(whole.decks[dk], mid); });
}
ids.forEach(function (id) {
  eachDeck(R.shipInterior(ship(id)).plan, function (p, from) {
    var has = fill(p, from);
    p.rooms.forEach(function (r) {
      var ok = false;
      for (var x = r.x0 + 0.35; x < r.x1 - 0.3 && !ok; x += 0.05)
        for (var z = r.z0 + 0.35; z < r.z1 - 0.3 && !ok; z += 0.05) if (has(x, z)) ok = true;
      /* The far platform and the engine room are the tram's end. */
      if (!ok && !(r.id === 'platform-aft' || (r.kind === 'engine' && r.deck === 'junction'))) cutOff.push(id + ':' + r.kind);
    });
    p.doors.forEach(function (d) { if (d.slide) { d.open = 0; d.shut = true; } });
  });
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

console.log('--- the rest of her (2026-10-25) ---');
/* Astra: "S ships aren't all one seaters... M ships should have a small
 * medbay, while S ships have medical supplies in the cockpit." */
var wrongRooms = [], wrongTurrets = [], wrongSecond = [], noKit = [], unreachable = [], wrongBeds = [];
var WANT_SECOND = { wren: 'copilot', bollard: 'copilot', fighter: 'gunner', talon: null };
ids.forEach(function (id) {
  var d = R.shipInterior(ship(id)), p = d.plan, size = Combat.HULLS[id].size, need = Crew.crewNeeded(id, true);
  var ks = kinds(p);
  var has = function (k) { return ks.indexOf(k) >= 0; };
  if (size === 'S') {
    if (has('medbay') || has('engine') || has('cargo') || has('turret')) wrongRooms.push(id);
    if (p.second !== WANT_SECOND[id]) wrongSecond.push(id + ':' + p.second);
    if (!p.items.some(function (it) { return it.kind === 'medkit'; })) noKit.push(id);
  } else {
    if (!has('medbay') || !has('engine') || !has('cargo')) wrongRooms.push(id + ' ' + ks.join('/'));
    /* And the turret-fitted deck is walked too, below. */
    p = R.shipInterior(Object.assign(ship(id), { turret: 'turret' })).plan;
    /* No turret fitted, no turret position; fit one and it is there, one
     * seat — the one gunner a turret takes (crew.js turretCrewing). */
    if (has('turret')) wrongRooms.push(id + ' turret without a turret');
    var pt = R.shipInterior(Object.assign(ship(id), { turret: 'turret' })).plan;
    if (pt.turrets.length !== 1 || !pt.rooms.some(function (r) { return r.kind === 'turret'; })) wrongTurrets.push(id + ' ' + pt.turrets.length);
    if (p.beds.length !== (size === 'M' ? 1 : 2)) wrongBeds.push(id + ' ' + p.beds.length);
  }
  /* Every room and every labelled thing in it can be walked to from the
   * airlock, with the doors open: a flood fill over the deck at 10 cm. */
  /* Deck by deck on a decked hull, from the lift — and on the junction
   * from the far end of the tram too, which is how engineering is reached. */
  var whole = p, starts = [];
  if (whole.decks) {
    var mid = { x: 0, z: (whole.carZ[0] + whole.carZ[1]) / 2 };
    whole.deckOrder.forEach(function (dk) {
      starts.push([whole.decks[dk], mid]);
      if (dk === 'junction') starts.push([whole.decks[dk], { x: 0, z: whole.tram.offB }]);
    });
  } else starts.push([whole, whole.aboard]);
  var cells = [], seenAll = {};
  starts.forEach(function (st) {
    var dpl = st[0];
    dpl.doors.forEach(function (dd) { if (dd.slide) { dd.open = 1; dd.shut = false; } });
    var k0 = [Math.round(st[1].x * 10), Math.round(st[1].z * 10)], q = [k0], seen = {};
    seen[k0] = true;
    while (q.length) {
      var c = q.pop(); cells.push([c[0], c[1], dpl.deck || 'main']);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
        var n = [c[0] + o[0], c[1] + o[1]];
        if (seen[n] || !Walk.standable(dpl, n[0] / 10, n[1] / 10)) return;
        seen[n] = true; q.push(n);
      });
    }
    dpl.doors.forEach(function (dd) { if (dd.slide) { dd.open = 0; dd.shut = true; } });
  });
  var near = function (x, z, r, dk) { return cells.some(function (c) { return (!dk || c[2] === dk) && Math.hypot(c[0] / 10 - x, c[1] / 10 - z) < r; }); };
  whole.rooms.forEach(function (rm) {
    if (rm.walk === false) return;
    if (!near((rm.x0 + rm.x1) / 2, (rm.z0 + rm.z1) / 2, Math.max(rm.x1 - rm.x0, rm.z1 - rm.z0) / 2, whole.decks ? rm.deck : null)) unreachable.push(id + ':' + rm.kind);
  });
  whole.items.forEach(function (it) {
    if (it.silent || !it.label) return;
    if (!near(it.x, it.z, 1.2, whole.decks ? it.deck : null)) unreachable.push(id + ':' + it.kind);
  });
});
check('S: no medbay, engine room, turret or cargo bay', !wrongRooms.filter(function (s) { return s.indexOf(' ') < 0; }).length);
check('M and up: a medbay, an engine room and a cargo bay; no turret position unless a turret is fitted',
      !wrongRooms.filter(function (s) { return s.indexOf(' ') >= 0; }).length, wrongRooms.join(', '));
check('a fitted turret puts one turret seat aboard every M and up', !wrongTurrets.length, wrongTurrets.join(', '));
check('S: a fitted turret is worked from the seat — no turret room', !R.shipInterior(Object.assign(ship('talon'), { turret: 'turret' })).plan.rooms.some(function (r) { return r.kind === 'turret'; }));
check('a small medbay (one bed) on an M, two beds from L', !wrongBeds.length, wrongBeds.join(', '));
check('Wren and Bollard have a co-pilot\'s seat, the Lance a gunner\'s, the Talon one seat',
      !wrongSecond.length, wrongSecond.join(', '));
check('every S cockpit carries medical supplies', !noKit.length, noKit.join(', '));
check('every room and everything labelled in it can be walked to from the airlock',
      !unreachable.length, unreachable.slice(0, 8).join(', '));
/* The second seat is optional: she still flies with nobody in it. */
check('the second seat asks nobody to be hired', ['wren', 'bollard', 'fighter'].every(function (id) {
  return Crew.crewNeeded(id, true).total === 0;
}));

console.log('--- conning towers, decks and the lift (2026-10-25) ---');
/* Astra: the Capital and Carrier have a conning tower with the bridge on
 * top and an elevator down; the stops are the bridge, the main deck and
 * airlock, the hangar (Carrier only), and a junction from which engineering
 * is reached — by tram, she chose; the other XL hulls get decks and a lift. */
var decked = ids.filter(function (id) { return !!R.shipInterior(ship(id)).plan.decks; }).sort();
check('the five XL hulls have decks, and nothing else does', decked.join(',') === 'capital,carrier,crawler,leviathan,meridian', decked.join(','));
var badDeck = [];
decked.forEach(function (id) {
  var p = R.shipInterior(ship(id)).plan, order = p.deckOrder;
  var want = id === 'carrier' ? 'bridge,main,junction,hangar' : 'bridge,main,junction';
  if (order.join(',') !== want) badDeck.push(id + ' stops ' + order.join(','));
  if (Math.abs(p.deckY.bridge - p.deckY.main - SD.TOWER[id]) > 1e-9) badDeck.push(id + ' tower');
  for (var i = 1; i < order.length; i++) if (!(p.deckY[order[i]] < p.deckY[order[i - 1]])) badDeck.push(id + ' order of floors');
  order.forEach(function (dk, hi) {
    var dp = p.decks[dk];
    if (!dp.rooms.some(function (r) { return r.kind === 'lift'; })) badDeck.push(id + ':' + dk + ' no car');
    if (!dp.doors.some(function (d) { return d.lift; })) badDeck.push(id + ':' + dk + ' no landing');
    var btn = dp.items.filter(function (it) { return it.kind === 'liftbtn'; });
    if (btn.length !== order.length - 1) badDeck.push(id + ':' + dk + ' buttons ' + btn.length);
    btn.forEach(function (b) {
      var up = order.indexOf(b.to) < hi;
      if (b.label.charAt(0) !== (up ? '▲' : '▼') || !b.aim) badDeck.push(id + ':' + dk + ' button ' + b.label);
    });
    if (dp.floorY !== p.deckY[dk]) badDeck.push(id + ':' + dk + ' floor');
  });
  /* The bridge deck is all forward of the car, every other deck all aft:
   * no deck is ever seen from another but through the lift. */
  p.decks.bridge.rooms.forEach(function (r) { if (r.kind !== 'lift' && r.z0 < p.carZ[1] - 1e-6) badDeck.push(id + ' bridge room ' + r.kind + ' aft of the car'); });
  order.slice(1).forEach(function (dk) {
    p.decks[dk].rooms.forEach(function (r) { if (r.kind !== 'lift' && r.z1 > p.carZ[0] + 1e-6) badDeck.push(id + ' ' + dk + ' room ' + r.kind + ' forward of the car'); });
  });
  /* The engine room is down at the junction, at the tram's far end. */
  var engs = p.rooms.filter(function (r) { return r.kind === 'engine'; });
  if (engs.length !== 1 || engs[0].deck !== 'junction' || !(engs[0].z1 <= p.tram.z0)) badDeck.push(id + ' engine room');
  if (!(p.tram.z1 - p.tram.z0 >= 30)) badDeck.push(id + ' spine ' + (p.tram.z1 - p.tram.z0));
  if (!p.decks.main.items.some(function (it) { return it.kind === 'hatch'; })) badDeck.push(id + ' no hatch on the main deck');
  if (p.decks.main.rooms.some(function (r) { return r.kind === 'cockpit'; })) badDeck.push(id + ' cockpit below');
  /* Below the junction, the hangar clears it: its roof is under the
   * tramway's floor, which runs aft over the same ground. */
  if (p.deckY.hangar !== undefined && !(p.deckY.hangar + SD.HANGAR[2] < p.deckY.junction - 0.35)) badDeck.push(id + ' hangar roof');
  var d = R.shipInterior(ship(id));
  if (!d.meshes.car || !d.meshes.tram || !d.meshes.car.doors.f.length) badDeck.push(id + ' car/tram mesh');
  if (d.meshes.room.v.some(function (v) { return !v.every(isFinite); })) badDeck.push(id + ' NaN');
});
check('each deck: a car, a landing, a button per other deck (▲ up, ▼ down, picked by looking)', !badDeck.length, badDeck.slice(0, 6).join('; '));
var cp = R.shipInterior(ship('carrier')).plan;
check('the Carrier\'s hangar has three pads marked', cp.hangarPads.length === 3 && !!SD.roomByKind(cp, 'hangar'));
check('only the Carrier has a hangar', decked.every(function (id) { return (id === 'carrier') === !!SD.roomByKind(R.shipInterior(ship(id)).plan, 'hangar'); }));
/* Looking at a button picks it, not the nearest one (walk.js aim). */
var mp = cp.decks.main, cm = { x: 0, z: (cp.carZ[0] + cp.carZ[1]) / 2 };
var bts = mp.items.filter(function (it) { return it.kind === 'liftbtn'; });
var picked = bts.every(function (b) {
  var w = Walk.start({ rooms: mp.rooms, doors: mp.doors, items: mp.items, spawn: { x: cm.x - 0.2, z: cm.z, yaw: 0 } });
  w.yaw = Math.atan2(b.x - w.x, b.z - w.z);
  var it = Walk.facing(w);
  return it === b;
});
check('in the car, the button you look at is the one E presses', picked, bts.map(function (b) { return b.label; }).join(' | '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
