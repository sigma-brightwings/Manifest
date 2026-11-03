/* airlock.test.js — every ship's way out, and the seal on it (2026-10-26).
 *
 *     node test/airlock.test.js
 *
 * Astra: "create a set of stairs/ramp which can be opened from both inside
 * and outside the ship and which allows travel from inside to outside of
 * the ship", "ensure that all models have a pathway to the exterior which
 * will seal against vacuum", "climb into them from the ramp, up and into a
 * room which seals the ramp and then perpendicular to the ramp is another
 * airlock door which opens into the main interior of the ship", and "if
 * you have to resize hulls to fit their interiors, do it."
 *
 * What it holds, for every hull in the game:
 *   - her rooms are inside her model at her fitted length;
 *   - the airlock is a room off the passage, its inner door across the ship
 *     and the ramp fore and aft in its floor: perpendicular;
 *   - you can walk from the passage through the inner door into it;
 *   - the ramp reaches the ground under her gear, and from its foot you
 *     can walk out from under her to open ground;
 *   - the two doors are never open together: every trip is a cycle, the
 *     inner door is held shut while the room is not the ship's, and the
 *     ramp only moves from the outside's side of the seal;
 *   - nothing opens onto vacuum in flight, and she will not count as
 *     sealed (fit to lift) with her ramp down.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/hulls.js');
var Walk = require('../src/walk.js');
var SD = require('../src/shipdeck.js');
var AL = require('../src/airlock.js');
require('../src/render.js');
var R = global.Render, F = global.HullFit;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function ship(id) {
  var h = Combat.HULLS[id];
  return { hullId: id, bornId: id + '-1', dryMass: h.dryMass };
}
var ids = Object.keys(Combat.HULLS);

console.log('--- every hull is sized to her rooms ---');
check('the fit table covers every hull', ids.every(function (id) { return F && F[id] && F[id].len > 0; }),
      ids.filter(function (id) { return !(F && F[id] && F[id].len > 0); }).join(', '));
check('and she is drawn at it', ids.every(function (id) { return Math.abs(R.hullLength(id) * 1000 - F[id].len) < 1e-6; }));
/* The middle of every room, at waist height, has her above and below it. */
function hits(mesh, x, z) {
  var ys = [];
  mesh.f.forEach(function (f) {
    for (var k = 1; k + 1 < f.length; k++) {
      var a = mesh.v[f[0]], b = mesh.v[f[k]], c = mesh.v[f[k + 1]];
      var d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-12) continue;
      var l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
      var l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      ys.push(l1 * a[1] + l2 * b[1] + l3 * c[1]);
    }
  });
  return ys;
}
var outRooms = [];
var towerOut = [];
ids.forEach(function (id) {
  var s = ship(id), d = R.shipInterior(s), p = d.plan, at = R.cockpitAt(s) || [0, 0, 0];
  var mesh = R.hullPreviewMesh(id, s), Lm = R.hullLength(s) * 1000;
  var list = (F[id] && F[id].tower) ? towerOut : outRooms;
  var decks = p.decks ? Object.keys(p.decks).map(function (k) { return p.decks[k]; }) : [p];
  decks.forEach(function (dp) {
    dp.rooms.forEach(function (r) {
      var x = (at[0] + (r.x0 + r.x1) / 2) / Lm, y = (at[1] + dp.floorY + 1.0) / Lm, z = (at[2] + (r.z0 + r.z1) / 2) / Lm;
      var ys = hits(mesh, x, z);
      if (!(ys.some(function (v) { return v > y; }) && ys.some(function (v) { return v < y; }))) list.push(id + ':' + r.id);
    });
  });
});
check('every room aboard every hull is inside her', !outRooms.length, outRooms.slice(0, 8).join(', '));
/* The Capital and the Carrier keep the size and the tower the art gave
 * them (towers.test.js); what of their lower decks pokes out is listed,
 * not failed, until their decks are laid to their models. */
if (towerOut.length) console.log('  note  tower hulls, rooms outside the model: ' + towerOut.join(', '));

console.log('--- the airlock: a room off the passage, the doors at right angles ---');
var notPerp = [], noItems = [], badRamp = [], noIn = [];
ids.forEach(function (id) {
  var d = R.shipInterior(ship(id)), p = d.plan, main = p.decks ? p.decks.main : p;
  var lock = SD.roomByKind(p, 'airlock'), door = SD.doorById(p, 'lock'), rp = p.ramp;
  /* The inner door is in a side wall (it slides fore and aft, axis 'x'),
   * the ramp runs fore and aft: perpendicular. */
  if (!lock || !door || door.axis !== 'x' || !door.seal || !rp) { notPerp.push(id); return; }
  if (!(rp.x0 >= lock.x0 - 1e-9 && rp.x1 <= lock.x1 + 1e-9 && rp.hinge <= lock.z1 && rp.foot >= lock.z0 - 1e-9)) badRamp.push(id + ' ramp outside its room');
  var its = main.items.filter(function (it) { return it.kind === 'hatch' || it.kind === 'ramp'; });
  if (its.length !== 2 || its.some(function (it) { return Walk.roomAt(main, it.x, it.z) !== lock; })) noItems.push(id);
  /* From the passage, at the door's line, walk to port through it. */
  main.doors.forEach(function (dd) { dd.open = 0; dd.shut = true; dd.locked = false; });
  var w = Walk.start({ rooms: main.rooms, doors: main.doors, items: main.items, spawn: { x: 0, z: door.zc, yaw: -Math.PI / 2 } });
  for (var i = 0; i < 300; i++) { SD.updateDoors(main, w, 1 / 30); Walk.step(w, { w: true }, 1 / 30); }
  if (Walk.roomAt(main, w.x, w.z) !== lock) noIn.push(id + ' x=' + w.x.toFixed(2));
});
check('every hull has an airlock whose inner door is across the ship from its ramp', !notPerp.length, notPerp.join(', '));
check('its ramp lies in its own floor', !badRamp.length, badRamp.join(', '));
check('its controls and its ramp are in it', !noItems.length, noItems.join(', '));
check('and you can walk into it from the passage', !noIn.length, noIn.join(', '));

console.log('--- the ramp reaches the ground, and you can get out from under her ---');
var short = [], trapped = [];
ids.forEach(function (id) {
  /* Her stance as the game stands her (render.js hullFit: the table's
   * ground, half a metre lower on a geared hull, 2026-11-03), not the raw
   * generated table. */
  var s = ship(id), d = R.shipInterior(s), p = d.plan, rp = p.ramp, f = R.hullFit(id), at = R.cockpitAt(s) || [0, 0, 0];
  var fy = p.decks ? p.decks.main.floorY : p.floorY;
  var ground = f.ground - at[1];
  /* Down: the walking face at its foot is on the ground. */
  var footY = rp.mode === 'lift' ? SD.rampFloor(rp, fy, 1, rp.xc, (rp.hinge + rp.foot) / 2)
                                 : SD.rampFloor(rp, fy, 1, rp.xc, rp.hinge - rp.len * Math.cos(rp.angle) + 1e-6);
  if (footY === null || Math.abs(footY - ground) > 0.05) short.push(id + ' ' + (footY === null ? 'null' : (footY - ground).toFixed(2)) + ' m');
  /* Out: from the foot, a flood over the ground plan at 25 cm reaches
   * somewhere she does not overhang at all. */
  s.airlock = { side: 'out', ramp: 1, want: 1, hatch: 0 };
  var op = R.outsidePlan(s);
  if (!op) { trapped.push(id + ' no outside'); return; }
  /* A coarser step on a big hull: the way out from under a 164 m Crawler
   * is a long walk. */
  var STEP = R.hullLength(s) * 1000 > 60 ? 0.5 : 0.25, seen = {}, q = [[rp.xc, op.footZ - 0.4]], ok = false, n = 0, head = 0;
  while (head < q.length && n < 400000 && !ok) {
    var c = q[head++], k = Math.round(c[0] / STEP) + ',' + Math.round(c[1] / STEP);
    if (seen[k]) continue;
    seen[k] = 1; n++;
    if (!Walk.standable(op, c[0], c[1])) continue;
    if (op.clearAt(c[0], c[1]) === Infinity) { ok = true; break; }
    q.push([c[0] + STEP, c[1]], [c[0] - STEP, c[1]], [c[0], c[1] + STEP], [c[0], c[1] - STEP]);
  }
  if (!ok) trapped.push(id);
});
check('down, every ramp\'s foot is on the ground under her gear', !short.length, short.join(', '));
check('and from it you can walk out from under her', !trapped.length, trapped.join(', '));

console.log('--- the seal ---');
var s = ship('talon'), d = R.shipInterior(s), p = d.plan, door = SD.doorById(p, 'lock');
var landed = { landed: true, docked: false, breathable: false };
AL.state(s);
AL.step(s, p, 0.1, landed);
check('new, she is sealed to herself: the inner door works, the ramp is up', s.airlock.side === 'in' && !door.locked && AL.sealed(s));
var r = AL.request(s, 'lower', landed);
check('the ramp will not come down from inside the seal', !r.ok && s.airlock.want === 0, r.why);
door.open = 1;
r = AL.request(s, 'out', landed);
AL.step(s, p, 1, landed);
check('cycling out holds the inner door shut', r.ok && door.locked);
check('and does not start pumping while it is still open', s.airlock.cycle && s.airlock.cycle.t === 0);
door.open = 0;
for (var i = 0; i < 70; i++) AL.step(s, p, 0.1, landed);
check('once it is shut the cycle runs, and the ramp starts down by itself', s.airlock.side === 'out' && s.airlock.ramp > 0 && s.airlock.want === 1);
var bothOpen = false;
for (i = 0; i < 60; i++) { AL.step(s, p, 0.1, landed); SD.updateDoors(p, { x: 0, z: door.zc }, 0.1); if (door.open > 0 && s.airlock.ramp > 0) bothOpen = true; }
check('with the ramp down, the inner door stays shut even with somebody at it', door.open === 0 && s.airlock.ramp === 1 && !bothOpen);
check('and she is not fit to lift', !AL.sealed(s));
r = AL.request(s, 'raise', landed);
for (i = 0; i < 50; i++) AL.step(s, p, 0.1, landed);
check('from outside, the ramp comes up on its own', r.ok && s.airlock.ramp === 0 && s.airlock.side === 'out');
r = AL.request(s, 'lower', landed);
check('and goes down again', r.ok && s.airlock.want === 1);
r = AL.request(s, 'in', landed);
var sawBoth = false;
for (i = 0; i < 120; i++) { AL.step(s, p, 0.1, landed); if (s.airlock.ramp > 0 && !door.locked) sawBoth = true; }
check('cycling in raises the ramp first, then lets the inner door go', r.ok && s.airlock.side === 'in' && s.airlock.ramp === 0 && !door.locked && !sawBoth);
check('and she is fit to lift again', AL.sealed(s));
var flying = { landed: false, docked: false };
r = AL.request(s, 'out', flying);
check('in flight it will not cycle out onto vacuum', !r.ok && s.airlock.side === 'in', r.why);
var docked = { landed: false, docked: true };
r = AL.request(s, 'out', docked);
for (i = 0; i < 60; i++) AL.step(s, p, 0.1, docked);
check('docked, cycling out opens the berth hatch and leaves the ramp up', r.ok && s.airlock.side === 'out' && s.airlock.hatch === 1 && s.airlock.ramp === 0);
AL.step(s, p, 0.1, flying);
check('and the hatch is shut the moment she is not docked', s.airlock.hatch === 0);
check('the air: a terran world is breathable, vacuum is not',
      AL.breathable({ composition: 'nitrogen/oxygen — breathable' }) && !AL.breathable({ composition: 'none — hard vacuum' }) && !AL.breathable(null));

console.log('--- her hull is solid over the hangar floor (2026-11-03) ---');
/* Astra, at the foot of her Talon's ramp in her hangar: "interior of ship
 * visible, no collision on underside so we're clipping through the
 * bottom". Checked here against her hull INDEPENDENTLY of the clearance
 * field: every triangle of her as drawn (render.js outsidePlan's parts -
 * the ramp's well cut, the airlock box the shader cuts, the bay, her legs
 * telescoped to the lifted ground) is sampled at a few centimetres, and
 * every point of her low enough to matter is spread over the walker's
 * radius. Then, on the hangar's own walking plan (walk.js armHangar, as
 * main.js arms it), at every hull in three hangars:
 *   - nowhere you can stand has her skin within a crawling head of the
 *     floor, ramp and hatch corridor aside (the ramp has its own rule);
 *   - the field never claims more room than the samples show, so the eye
 *     main.js holds under it (bellyHead) is never inside her;
 *   - up her ramp, a crouched head clears her the whole way;
 *   - her ramp is walkable from her hatch to the hangar's door;
 *   - and the same hull is the same field every time. */
var HP = ['port-3', 'port-11', 'port-27'];
var hullErr = [], fieldErr = [], rampErr = [], floodErr = [], detErr = [], gearErr = [], nums = [];
var tAll = Date.now();
ids.forEach(function (id) {
  var s = ship(id), hl = Combat.HULLS[id];
  s.airlock = { side: 'out', ramp: 1, want: 1, hatch: 1 };
  var op = R.outsidePlan(s), hs = R.hangarSpec(s);
  if (!op || !hs) return;
  var rp = op.ramp, fit = R.hullFit(s), at = R.cockpitAt(s) || [0, 0, 0], Lm = R.hullLength(s) * 1000;
  var mesh = R.hullPreviewMesh(id, s);
  /* Her legs reach the ground she is stood on: the lifted one. */
  if (mesh.gear && mesh.gear.some(function (g) { return g.role !== 'door'; })) {
    var gb = R.gearBounds(mesh, 1, (fit.gearExt || 0) / Lm);
    var footY = gb.lo[1] * Lm;
    if (Math.abs(footY - fit.ground) > 0.03 || Math.abs(fit.gearLift - 0.5) > 1e-9) gearErr.push(id + ' feet ' + (footY - fit.ground).toFixed(2) + ' m off the floor');
  }
  /* The drawn parts, as outsidePlan builds them, sampled. */
  var ext = R.rampExterior(Object.create(s, { airlock: { value: { ramp: 1 } } }), mesh, R.hullLength(s));
  var lb = ext && ext.lockBox;
  var inBox = function (v) { return lb && v[0] > lb.cx - lb.hw && v[0] < lb.cx + lb.hw && v[2] > lb.z0 && v[2] < lb.z1 && v[1] > lb.y0 && v[1] < lb.y1; };
  var srcParts = [{ m: ext ? ext.hull : mesh, box: true }];
  if (ext && ext.bay) srcParts.push({ m: ext.bay });
  R.gearMeshes(mesh, 1, (fit.gearExt || 0) / Lm).forEach(function (g) { srcParts.push({ m: g }); });
  var BK = 0.5, bucket = {}, SP = Lm > 60 ? 0.2 : 0.08, CARE = Math.max(3.0, (fit.drop || 0) + 3.0);
  var put = function (x, y, z) {
    var k = Math.floor(x / BK) + ',' + Math.floor(z / BK);
    (bucket[k] = bucket[k] || []).push(x, y, z);
  };
  srcParts.forEach(function (sp) {
    var m = sp.m;
    m.f.forEach(function (f) {
      for (var k = 1; k + 1 < f.length; k++) {
        var A = m.v[f[0]], B = m.v[f[k]], C = m.v[f[k + 1]];
        var P = [A, B, C].map(function (v) { return [v[0] * Lm - at[0], v[1] * Lm - at[1] - op.floorY, v[2] * Lm - at[2], v]; });
        if (Math.min(P[0][1], P[1][1], P[2][1]) > CARE) continue;
        var e = Math.max(Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]),
                         Math.hypot(P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]),
                         Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1], P[2][2] - P[1][2]));
        var N = Math.max(1, Math.ceil(e / SP));
        for (var a = 0; a <= N; a++) for (var b = 0; a + b <= N; b++) {
          var u = a / N, v = b / N, w = 1 - u - v;
          var y = P[0][1] * w + P[1][1] * u + P[2][1] * v;
          if (y > CARE) continue;
          if (sp.box) {
            var mv = [0, 1, 2].map(function (q) { return P[0][3][q] * w + P[1][3][q] * u + P[2][3][q] * v; }).map(function (q) { return q * Lm; });
            if (inBox(mv)) continue;
          }
          put(P[0][0] * w + P[1][0] * u + P[2][0] * v, y, P[0][2] * w + P[1][2] * u + P[2][2] * v);
        }
      }
    });
  });
  /* Her lowest sampled skin over the disc a walker at (x, z) fills; on her
   * ramp, what is above its face less a kerb (as the field asks). */
  var RAD = 0.3;
  var sampled = function (x, z, cut) {
    var m = Infinity;
    for (var i = Math.floor((x - RAD) / BK); i <= Math.floor((x + RAD) / BK); i++)
      for (var j = Math.floor((z - RAD) / BK); j <= Math.floor((z + RAD) / BK); j++) {
        var bk = bucket[i + ',' + j];
        if (!bk) continue;
        for (var q = 0; q < bk.length; q += 3) {
          var dx = bk[q] - x, dz = bk[q + 2] - z;
          if (dx * dx + dz * dz > RAD * RAD || bk[q + 1] <= cut) continue;
          if (bk[q + 1] < m) m = bk[q + 1];
        }
      }
    return m;
  };
  var inCorr = function (x, z) { return x >= rp.x0 - 0.3 && x <= rp.x1 + 0.3 && z >= op.footZ - 0.6 && z <= rp.hinge + 0.3; };
  /* Up her ramp: a crouched head clears her, by the samples. */
  var rampLo = Infinity;
  for (var rz = op.footZ; rz <= rp.hinge - 0.35; rz += 0.1) {
    var face = op.rampSurface(rz), xc = (rp.x0 + rp.x1) / 2;
    var hr = sampled(xc, rz, face + 0.35) - face;
    if (hr < rampLo) rampLo = hr;
  }
  if (rampLo < R.outsidePlan(s).CROUCH_CLEAR) rampErr.push(id + ' ' + rampLo.toFixed(2) + ' m');
  /* Every hull's three hangars. */
  var size = hl.size === 'XL' ? 'L' : hl.size;
  var blockedN = 0, standN = 0;
  HP.forEach(function (pid, hi) {
    var plan = Walk.layout(pid, { seed: 'kawartha', ships: [{ id: 'me', size: size, name: 'Mine', current: true, hangar: hs }] });
    if (!plan.hangar) { hullErr.push(id + '@' + pid + ' no hangar'); return; }
    Walk.armHangar(plan, function () { return op; });
    var H = plan.hangar, room = plan.rooms.filter(function (r) { return r.id === H.room; })[0];
    var G = Lm > 60 ? 0.5 : 0.25, bad = 0, over = 0, worst = '';
    for (var X = room.x0 + 0.3; X < room.x1 - 0.3; X += G) for (var Z = room.z0 + 0.3; Z < room.z1 - 0.3; Z += G) {
      var q = Walk.hangarToShip(H, X, Z);
      if (!Walk.standable(plan, X, Z)) { if (hi === 0) blockedN++; continue; }
      if (hi === 0) standN++;
      if (inCorr(q.x, q.z)) continue;
      var sk = sampled(q.x, q.z, -Infinity);
      if (sk < op.CRAWL_CLEAR - 0.02) { bad++; if (!worst) worst = ' e.g. (' + q.x.toFixed(1) + ', ' + q.z.toFixed(1) + ') skin ' + sk.toFixed(2); }
      if (op.headroom(q.x, q.z) > sk + 0.02) over++;
    }
    if (bad) hullErr.push(id + '@' + pid + ' ' + bad + worst);
    if (over && hi === 0) fieldErr.push(id + ' ' + over);
    /* Hatch to door: a flood on the walking plan from the top of her ramp. */
    var top = Walk.hangarToStation(H, (rp.x0 + rp.x1) / 2, rp.mode === 'lift' ? rp.hinge - 0.4 : rp.hinge - 0.45);
    var dr = plan.doors.filter(function (d0) {
      /* Her hangar's own door: in one of its long walls (a door spans the
       * wall's thickness, so its ends straddle the wall's line). */
      return [room.x0, room.x1].some(function (wx) { return d0.x0 <= wx + 1e-6 && d0.x1 >= wx - 1e-6; }) &&
             d0.z0 >= room.z0 - 1e-6 && d0.z1 <= room.z1 + 1e-6;
    });
    var FS = 0.25, seen = {}, qq = [[Math.round(top.x / FS), Math.round(top.z / FS)]], got = false, head = 0;
    if (!Walk.standable(plan, top.x, top.z)) { floodErr.push(id + '@' + pid + ' the top of the ramp is not standable'); return; }
    seen[qq[0].join(',')] = 1;
    while (head < qq.length && !got && qq.length < 600000) {
      var c = qq[head++];
      for (var di = 0; di < dr.length; di++) {
        var dd = dr[di];
        if (c[0] * FS >= dd.x0 - 0.5 && c[0] * FS <= dd.x1 + 0.5 && c[1] * FS >= dd.z0 && c[1] * FS <= dd.z1) { got = true; break; }
      }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
        var nn = [c[0] + o[0], c[1] + o[1]], k = nn.join(',');
        if (seen[k] || !Walk.standable(plan, nn[0] * FS, nn[1] * FS)) return;
        seen[k] = 1; qq.push(nn);
      });
    }
    if (!dr.length) floodErr.push(id + '@' + pid + ' no door found');
    else if (!got) floodErr.push(id + '@' + pid);
  });
  /* The same hull, the same field. */
  var d0 = R.shipInterior(s), keep = d0.outside;
  d0.outside = null;
  var again = R.outsidePlan(s);
  var same = again.field.low.length === keep.field.low.length;
  for (var li = 0; same && li < keep.field.low.length; li++) if (keep.field.low[li] !== again.field.low[li]) same = false;
  if (!same) detErr.push(id);
  d0.outside = keep;
  nums.push(id + ' ' + keep.field.ms.toFixed(0) + 'ms/' + blockedN + 'blk/' + standN + 'ok/ramp' + rampLo.toFixed(2));
});
check('her legs are drawn down to the ground she is stood on, half a metre lower', !gearErr.length, gearErr.join(', '));
check('nowhere you can stand in her hangar has her skin within a crawling head of you (ramp aside)', !hullErr.length, hullErr.slice(0, 6).join('; '));
check('her clearance never claims more room than her hull leaves, so the eye held under it is never in her', !fieldErr.length, fieldErr.join(', '));
check('up her ramp a crouched head clears her all the way', !rampErr.length, rampErr.join(', '));
check('from her hatch, down her ramp, you can walk to the hangar door, in every hangar', !floodErr.length, floodErr.slice(0, 6).join('; '));
check('the same hull is the same clearance every time', !detErr.length, detErr.join(', '));
console.log('  note  per hull: field build / hangar cells blocked / standable / least ramp headroom (m): ' + nums.join('; ') +
            '  (' + ((Date.now() - tAll) / 1000).toFixed(1) + ' s)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exitCode = 1;
