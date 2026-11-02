/* fit-raised.js — put every hull's cockpit at her canopy glass (2026-11-02).
 *
 *     node tools/fit-raised.js            # prints the RAISED table and why
 *     node tools/fit-raised.js talon      # one hull
 *
 * Astra, after the Talon's cockpit went up into her nose block: "the
 * cockpit fix should apply to all ships IF the glass isn't the forward-most
 * part of the cockpit." tools/fit-hulls.js places each hull's eye at the
 * lowest point her deck fits and never looks at her glass, so on most hulls
 * the pilot sits metres aft of and below the canopy her model carries. This
 * measures that per hull, and for each one whose glass is not the
 * forward-most part of her cockpit, finds the raise (shipdeck.js RAISED:
 * `rise` up, `fwd` forward, a stair of `treads` over `run`) that puts the
 * eye at the glass with every room still inside her.
 *
 * A hull QUALIFIES when her eye is more than EYE_OK from her glass box, or
 * her cockpit's front wall (the windscreen) stands ahead of the glass's
 * front. She is LEFT ALONE when she has a conning tower (render.js BRIDGE)
 * or decks (shipdeck.js DECKED: her cockpit is a deck of its own, reached
 * by lift, and moving it is moving the lift), or when her model's glass box
 * is not a canopy at all (off her centreline, or aft of her middle — a side
 * window or a wing panel named as glass).
 *
 * The search: the eye from the glass aft, low to high, the deck where
 * fit-hulls put it. A candidate is taken when
 *   - every room but the cockpit is inside her exactly as the fit test
 *     (test/boarding3) samples it, and planFitted gave up nothing more;
 *   - the cockpit itself, raised floor, stair and ceiling, has no point of
 *     its middle outside her and no more of its side and aft walls than it
 *     had before (its windscreen wall is ON the glass, so its front row is
 *     let graze it: that is the glass, standing proud as it always did);
 *   - the eye is within EYE_OK of the glass box and the windscreen no
 *     further forward than the glass.
 * EYE_OK is the 0.5 m the brief gave. A share of the walls allowed out was
 * tried first (25%) and measured: it let a Dart's cockpit stand a quarter
 * out through her skin, while every hull's cockpit before this change had
 * none out at all (doctrine 6) — so none is allowed now either.
 */
global.window = global.window || global;
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require(path.join(SRC, m + '.js')); });
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'crew.js'));
require(path.join(SRC, 'hullfit.js'));
require(path.join(SRC, 'hulls.js'));
require(path.join(SRC, 'walk.js'));
var SD = require(path.join(SRC, 'shipdeck.js'));
require(path.join(SRC, 'render.js'));
var R = global.Render;

var EYE_OK = 0.5;            // m, eye to glass box
var TREAD_RISE = 0.22, TREAD_RUN = 0.25;

function libOf(id) {
  var h = Combat.HULLS[id], lib = R.HULL_ASSIGN[h.mesh] || '';
  return h.mesh === 'crawler' ? 'crawler_civilian' : lib;
}
function shipOf(id, n) { var h = Combat.HULLS[id]; return { hullId: id, bornId: 'fr|' + id + '|' + n, dryMass: h.dryMass, cargo: {} }; }
function boxDist(p, lo, hi) {
  var d = 0;
  for (var i = 0; i < 3; i++) { var e = Math.max(lo[i] - p[i], 0, p[i] - hi[i]); d += e * e; }
  return Math.sqrt(d);
}
/* The stair a rise takes. */
function stairFor(rise, fwd) {
  if (Math.abs(rise) < 0.05) return { rise: 0, fwd: +fwd.toFixed(3), run: 0, treads: 0 };
  var n = Math.ceil(Math.abs(rise) / TREAD_RISE - 1e-9);
  return { rise: +rise.toFixed(3), fwd: +fwd.toFixed(3), run: +((n + 1) * TREAD_RUN).toFixed(3), treads: n };
}

/* Every room but the cockpit, as boarding3 samples it; and her cockpit. */
function measure(id, n) {
  var shp = shipOf(id, n), d = R.shipInterior(shp), fit = R.hullFitter(shp);
  var p = d.plan, bad = [];
  p.rooms.forEach(function (rm) {
    if (rm.kind === 'cockpit') return;
    var ok = true, sx = Math.max(0.1, Math.min(0.5, rm.x1 - rm.x0 - 0.2));
    for (var x = rm.x0 + 0.1; ok && x <= rm.x1 - 0.1 + 1e-9; x += sx)
      for (var z = rm.z0 + 0.1; ok && z <= rm.z1 - 0.1 + 1e-9; z += 0.5)
        if (!fit.inside(x, p.floorY + 0.1, z) || !fit.inside(x, p.floorY + (rm.y1 || 2.2) - 0.1, z)) ok = false;
    if (!ok) bad.push(rm.kind);
  });
  var ck = SD.roomByKind(p, 'cockpit'), rs = p.raised, core = 0, edge = 0, edgeN = 0, front = 0;
  var nx = Math.max(2, Math.ceil((ck.x1 - ck.x0) / 0.4)), nz = Math.max(2, Math.ceil((ck.z1 - ck.z0) / 0.4));
  for (var i = 0; i <= nx; i++) for (var j = 0; j <= nz; j++) {
    var x2 = ck.x0 + 0.05 + (ck.x1 - ck.x0 - 0.1) * i / nx, z2 = ck.z0 + 0.05 + (ck.z1 - ck.z0 - 0.1) * j / nz;
    var isEdge = i === 0 || j === 0 || i === nx || j === nz, isFront = j === nz;
    var fl = p.floorY + SD.floorAt(p, x2, z2), cl = p.floorY + (ck.y1 || 2.05);
    [fl + 0.05, cl - 0.05].forEach(function (y) {
      if (isEdge) edgeN++;
      if (fit.inside(x2, y, z2)) return;
      if (isFront) front++; else if (isEdge) edge++; else core++;
    });
  }
  return { d: d, p: p, at: R.cockpitAt(shp), out: bad, fitted: p.fitted, core: core, edge: edge, edgeN: edgeN, front: front, ck: ck };
}

function survey(id) {
  var h = Combat.HULLS[id], lib = libOf(id), m = global.HullLib && global.HullLib[lib];
  if (R.bridgeSpec(id)) return { id: id, why: 'conning tower: her bridge is up the tower (render.js BRIDGE)' };
  if (SD.DECKED[id]) return { id: id, why: 'decked: her cockpit is a deck of its own, reached by lift; raising it moves the lift' };
  if (!m || !m.glass) return { id: id, why: 'no canopy glass in her model' };
  delete SD.RAISED[id];
  var base = measure(id, 'base'), L = R.hullLength(shipOf(id, 'L')) * 1000;
  var lo = m.glass.min.map(function (v) { return v * L; }), hi = m.glass.max.map(function (v) { return v * L; });
  var cx = (lo[0] + hi[0]) / 2;
  if (Math.abs(cx) > 0.6 || hi[2] < 0) {
    return { id: id, why: 'her model\'s glass box is not a canopy (centre x ' + cx.toFixed(1) + ' m, front z ' + hi[2].toFixed(1) + ' m)' };
  }
  var g = base.d.geom, at0 = base.at;
  var eye0 = boxDist(at0, lo, hi), front0 = at0[2] + g.frontZ - hi[2];
  var row = { id: id, lib: lib, eye0: +eye0.toFixed(2), front0: +front0.toFixed(2), glass: [lo, hi], edge0: base.edge + '/' + base.edgeN, core0: base.core, front0n: base.front };
  if (eye0 <= EYE_OK && front0 <= 0.05) { row.why = 'already at her glass'; return row; }
  /* Where the eye wants to be: the windscreen just inside the glass's
   * front, its band across the glass's height. */
  var ezT = hi[2] - 0.25 - g.frontZ, eyT = (lo[1] + hi[1]) / 2 - 0.16 * g.k;
  var cands = [];
  for (var ez = ezT + 0.3; ez >= ezT - 2.0; ez -= 0.1) {
    for (var ey = eyT - 0.8; ey <= eyT + 0.5; ey += 0.05) {
      var e = [at0[0], ey, ez];
      var dist = boxDist(e, lo, hi), front = ez + g.frontZ - hi[2];
      if (dist > EYE_OK || front > 0.05) continue;
      var rise = ey - at0[1], fwd = ez - at0[2];
      var rz = stairFor(rise, fwd);
      if (rz.fwd - rz.run < -0.5) continue;      // the passage is too short to give it
      cands.push({ rz: rz, score: dist + 0.4 * Math.abs(ey - eyT) + 0.1 * Math.abs(ez - ezT) });
    }
  }
  cands.sort(function (a, b) { return a.score - b.score; });
  var why = {};
  for (var c = 0; c < cands.length; c++) {
    SD.RAISED[id] = cands[c].rz;
    var r = measure(id, 'c' + c);
    var reason = r.out.length ? 'rooms out: ' + r.out.join(' ')
      : JSON.stringify(r.fitted.omitted) !== JSON.stringify(base.fitted.omitted) ? 'rooms dropped: ' + r.fitted.omitted.join(' ')
      : r.core ? 'cockpit middle out (' + r.core + ')'
      : r.edge > base.edge ? 'cockpit wall out ' + r.edge + '/' + r.edgeN : null;
    if (!reason) {
      row.raised = cands[c].rz; row.eye = r.at.map(function (v) { return +v.toFixed(2); });
      row.eyeToGlass = +boxDist(r.at, lo, hi).toFixed(2); row.edge = r.edge + '/' + r.edgeN; row.front = r.front;
      row.why = 'qualifies: eye ' + eye0.toFixed(2) + ' m from her glass' + (front0 > 0.05 ? ', windscreen ' + front0.toFixed(2) + ' m ahead of it' : '');
      delete SD.RAISED[id];
      return row;
    }
    why[reason.split(':')[0].split(' (')[0]] = (why[reason.split(':')[0].split(' (')[0]] || 0) + 1;
    if (!row.firstMiss) row.firstMiss = reason;
  }
  delete SD.RAISED[id];
  row.why = 'qualifies (eye ' + eye0.toFixed(2) + ' m from her glass) but NO raise fits: ' + cands.length + ' tried, ' + JSON.stringify(why);
  return row;
}

var only = process.argv[2];
var keep = {};
Object.keys(SD.RAISED).forEach(function (k) { keep[k] = SD.RAISED[k]; });
Object.keys(Combat.HULLS).forEach(function (id) {
  if (only && id !== only) return;
  var t0 = Date.now(), r = survey(id);
  console.log(JSON.stringify(r, function (k, v) { return typeof v === 'number' ? +v.toFixed(3) : v; }), (Date.now() - t0) + ' ms');
});
Object.keys(keep).forEach(function (k) { SD.RAISED[k] = keep[k]; });
