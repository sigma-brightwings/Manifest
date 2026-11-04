/* glb2hulls.js — turn a folder of .glb ship models into src/hulls.js.
 *
 *     node tools/glb2hulls.js <folder-with-glbs> [out.js]
 *
 * The game's renderer eats one mesh format: { v: [[x,y,z]...], f: [[a,b,c]...],
 * c: [colourPerFace...] }, hand-rolled projection, painter's algorithm, no
 * GPU. So a model pipeline here is not "load glTF" — it is: walk the node
 * hierarchy, bake every transform into the vertices, keep one flat colour
 * per face from the material, normalise the whole ship to unit length on
 * the origin, and write it out as data the existing paintMesh draws with
 * zero new runtime code.
 *
 * Every model gets an ID — its filename stem — and that ID is the contract:
 * the game assigns hulls to ship classes BY ID, the viewer page labels them
 * BY ID, and re-running this tool over a bigger folder adds models without
 * renaming anything.
 *
 * Deliberately supported: positions, indices (u8/u16/u32), node TRS and
 * matrix transforms, baseColorFactor, emissiveFactor. Deliberately ignored:
 * textures, normals (the renderer computes its own), skins, animations.
 */
'use strict';
var fs = require('fs');
var path = require('path');

/* ---- two modes, one parser ---------------------------------------------
 * `--ports` converts PORTS instead of ships. It is a mode rather than a
 * second tool because everything above the classification step — the GLB
 * container, the accessors, the matrix kit, the palette compression — is
 * identical, and a sibling script would have been a hundred and thirty
 * copied lines waiting to drift out of step.
 *
 * What actually differs is three things, and each is marked PORTS below:
 * the axis convention (+z up out of the ground, not +y up), the scale
 * reference (a declared pad footprint, not the longest axis), and the set
 * of anchors extracted. See ref/PORT-MODELS.md.
 */
var argv = process.argv.slice(2).filter(function (a) { return a !== '--ports'; });
var PORTS = process.argv.indexOf('--ports') >= 0;

var SEAL = require('./hull-seal.js');
var SEAL_N = 400;                    // columns along her length: 9 cm on a Cutter, 41 cm on a Crawler
var srcDir = argv[0] || '.';
var outFile = argv[1] || path.join(__dirname, '..', 'src',
                                   PORTS ? 'ports.js' : 'hulls.js');

/* ---- tiny matrix kit (column-major 4x4, like glTF) ---------------------- */
function matIdentity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function matMul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return o;
}
function matFromTRS(t, q, s) {
  t = t || [0,0,0]; q = q || [0,0,0,1]; s = s || [1,1,1];
  var x=q[0], y=q[1], z=q[2], w=q[3];
  var m = [
    (1-2*(y*y+z*z))*s[0], (2*(x*y+z*w))*s[0], (2*(x*z-y*w))*s[0], 0,
    (2*(x*y-z*w))*s[1], (1-2*(x*x+z*z))*s[1], (2*(y*z+x*w))*s[1], 0,
    (2*(x*z+y*w))*s[2], (2*(y*z-x*w))*s[2], (1-2*(x*x+y*y))*s[2], 0,
    t[0], t[1], t[2], 1
  ];
  return m;
}
function matApply(m, p) {
  return [
    m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12],
    m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13],
    m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14]
  ];
}

/* ---- GLB container ------------------------------------------------------ */
function parseGlb(buf) {
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
  var jsonLen = buf.readUInt32LE(12);
  if (buf.toString('ascii', 16, 20) !== 'JSON') throw new Error('no JSON chunk');
  var json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  var binStart = 20 + jsonLen;
  var bin = null;
  if (binStart < buf.length) {
    var binLen = buf.readUInt32LE(binStart);
    bin = buf.slice(binStart + 8, binStart + 8 + binLen);
  }
  return { json: json, bin: bin };
}

function accessorData(g, idx) {
  var acc = g.json.accessors[idx];
  var bv = g.json.bufferViews[acc.bufferView];
  var base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  var n = acc.count;
  var compCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  var out = [];
  var stride, read;
  if (acc.componentType === 5126) { stride = 4; read = function (o) { return g.bin.readFloatLE(o); }; }
  else if (acc.componentType === 5125) { stride = 4; read = function (o) { return g.bin.readUInt32LE(o); }; }
  else if (acc.componentType === 5123) { stride = 2; read = function (o) { return g.bin.readUInt16LE(o); }; }
  else if (acc.componentType === 5121) { stride = 1; read = function (o) { return g.bin.readUInt8(o); }; }
  else throw new Error('componentType ' + acc.componentType);
  var byteStride = bv.byteStride || compCount * stride;
  for (var i = 0; i < n; i++) {
    var rec = [];
    for (var c = 0; c < compCount; c++) rec.push(read(base + i * byteStride + c * stride));
    out.push(compCount === 1 ? rec[0] : rec);
  }
  return out;
}

function materialColour(g, idx) {
  var m = (g.json.materials || [])[idx] || {};
  var pbr = m.pbrMetallicRoughness || {};
  var base = pbr.baseColorFactor || [0.72, 0.75, 0.8, 1];
  var em = m.emissiveFactor || [0, 0, 0];
  var lit = (em[0] + em[1] + em[2]) > 0.25;
  var c = lit ? em : base;
  function hex(v) {
    var b = Math.max(0, Math.min(255, Math.round(Math.pow(v, 1 / 2.2) * 255)));
    return ('0' + b.toString(16)).slice(-2);
  }
  return (lit ? '!#' : '#') + hex(c[0]) + hex(c[1]) + hex(c[2]);
}

/* ---- what belongs to the outside, and what belongs to the seat ----------
 * The redesigned models ship the cockpit inside the same file as the hull:
 * `cockpitInterior`, `pilotSeat` and `pilotSeatBack` sit just behind
 * `cockpitGlass` at the nose. Merging all of it into one mesh — which is
 * what this tool used to do — welds a chair inside the fuselage: invisible
 * from outside, several hundred wasted triangles, and no way to use it as
 * a cockpit.
 *
 * So geometry is sorted into two buckets by node name. The GLASS stays
 * with the exterior, because it is visible from outside, but its bounds
 * are recorded separately: that box is where the canopy is, and it is what
 * the seat view mounts its panels against. */
var INTERIOR_RE = /cockpitInterior|pilotSeat/i;
var GLASS_RE = /cockpitGlass/i;

/* ---- and where the guns actually are ------------------------------------
 * Every armed model carries its weapons as named nodes — `laser0`/`laser1`,
 * or `laserChin0`/`laserChin1` on the courier — each with a `laserPylon`,
 * a `laserBarrel` and a `laserEmitter`. That last one is the muzzle: it is
 * the tip of the barrel, modelled, in the right place, on every hull.
 *
 * combat.js used to guess this with four hand-tuned constants, which was
 * wrong twice over — the guess did not match the art, and it could not,
 * because a chin gun and a wing gun are not in the same place. Recording
 * the emitters here means a beam leaves the barrel the artist drew, and a
 * model redesigned tomorrow moves its own gunfire with it.
 *
 * Each emitter is kept as a SEPARATE instance rather than merged into one
 * box: two guns are two muzzles, and a merged bound would put both beams
 * out of the centreline between them. */
var EMITTER_RE = /laserEmitter/i;
/* One `engineGlow` node per engine: the model says how many engines it has,
 * and the renderer draws one plume per glow. */
var ENGINE_RE = /^engineGlow/i;

/* ---- the parts that MOVE ------------------------------------------------
 * Every hull is rigged for landing gear — `gearNose`, `gearRearLeft`,
 * `gearRearRight`, each carrying a static `gearBayPlate` with its caution
 * stripes, a `gearDoorHinge` over a `gearBayDoor`, and a `gearStrutHinge`
 * over a `gearStrut`, `gearBrace` and `gearFoot`. There are no animation
 * clips in the files: `animations: 0` in every one. The hinges are real
 * nodes, so the geometry supports actuation, but the motion was never
 * authored.
 *
 * AND THE MODELS WERE SAVED GEAR-DOWN. Baking every node transform into the
 * vertices therefore did not just lose the ability to animate — it welded
 * three legs to the belly of every ship in the game, permanently extended,
 * in flight, in combat, in slipspace. That was the actual bug behind
 * "Shift+G does nothing": the state was flipping correctly the whole time
 * and there was nothing on screen that could ever have shown it.
 *
 * So a node whose name ends in `Hinge` opens its own bucket instead of
 * writing into the hull, and comes out as a separate small mesh carrying
 * the pivot and axis it turns about. The static half of the leg — plate and
 * stripes — stays in the hull, because a bay is a hole in the ship whether
 * or not anything is hanging out of it. */
var HINGE_RE = /Hinge$/i;

/* Which leg a part belongs to, and which of the two hinges it is: both are
 * read off the node names rather than positions, so a model that adds a
 * fourth leg or a second door needs no change here. */
var LEG_RE = /^gear(Nose|RearLeft|RearRight|[A-Za-z]*)$/i;

function vNorm(v) {
  var L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
}
function vCross(a, b) {
  return [a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0]];
}
function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/* Rotate `p` about a unit `axis` through the origin, by `ang`. Rodrigues,
 * written out rather than pulled in, because this file has no dependencies
 * and one formula is cheaper than a vector library. */
function rotAbout(p, axis, ang) {
  var c = Math.cos(ang), s = Math.sin(ang);
  var d = vDot(axis, p);
  var cr = vCross(axis, p);
  return [p[0] * c + cr[0] * s + axis[0] * d * (1 - c),
          p[1] * c + cr[1] * s + axis[1] * d * (1 - c),
          p[2] * c + cr[2] * s + axis[2] * d * (1 - c)];
}

/* ---- WHICH WAY A HINGE TURNS, derived rather than guessed ---------------
 * A hinge node's matrix gives three candidate axes and nothing says which
 * one is the pin. Geometry alone cannot settle it either: a strut is a rod,
 * so it straddles BOTH axes perpendicular to its length and the two score
 * identically.
 *
 * What does settle it is that these legs are CANTED. Every one of them
 * leans out of vertical in a single plane — the nose fore-and-aft, the
 * rears left-and-right — and a hinge pin is perpendicular to the plane its
 * part swings in. So: take the direction the part extends away from its
 * pivot, drop its vertical component to get the lean, and the pin is the
 * cross product of hull-up with that lean. On the courier this returns the
 * lateral axis for all three doors and the nose strut, and the fore-aft
 * axis for the two rear struts, which is exactly the rig the artist drew.
 *
 * A part with no lean at all — a perfectly vertical strut — has no plane to
 * derive, and falls back to the hinge node's own local axis that the
 * geometry is most nearly centred on. */
var HULL_UP = [0, 1, 0];

function hingeAxis(extendDir, localAxes, spans, centres) {
  var lean = [extendDir[0], 0, extendDir[2]];
  if (Math.hypot(lean[0], lean[2]) > 1e-3) {
    return vNorm(vCross(HULL_UP, vNorm(lean)));
  }
  var best = 0, bestScore = Infinity;
  for (var a = 0; a < 3; a++) {
    var score = Math.abs(centres[a]) / (spans[a] / 2 + 1e-9) - spans[a];
    if (score < bestScore) { bestScore = score; best = a; }
  }
  return vNorm(localAxes[best]);
}

/* How far to turn it to stow it, and which way round.
 *
 * The authored pose is the DEPLOYED pose — that is what "saved gear-down"
 * means — so travel runs from the model as drawn to the model tucked away,
 * and stowed is the part lying flat against the hull.
 *
 * FLATNESS ALONE DOES NOT PICK A DIRECTION, and getting this wrong is
 * visible immediately: there are always TWO rotations that lay a leg flat,
 * one folding it into the bay and one swinging it up over the spine, and
 * they score identically on "how vertical is it". The first version scanned
 * for minimum verticality, found the two tied, kept whichever it reached
 * first, and put the nose leg through the roof of the ship.
 *
 * What breaks the tie is that a bay is INBOARD of the leg that lives in it.
 * A leg retracts toward the middle of the hull, never away from it — so of
 * the two flat poses, take the one whose foot ends up nearer the ship's
 * axis. `outward` is the pivot's own horizontal offset from the hull
 * centre, which is exactly the direction the leg must not fold toward.
 *
 * Both terms in one score, flatness weighted an order of magnitude above
 * inboardness so it decides the angle and inboardness only decides the
 * sign. A centreline pivot with no horizontal offset has no preference to
 * express and falls back to folding aft, which is the convention and, more
 * to the point, is deterministic. */
var STOW_AFT = [0, 0, -1];

function stowAngle(extendDir, axis, pivot) {
  var outward = [pivot[0], 0, pivot[2]];
  outward = Math.hypot(outward[0], outward[2]) > 1e-4
    ? vNorm(outward) : STOW_AFT.slice();

  var e0 = vNorm(extendDir);
  var best = 0;
  var bestScore = Math.abs(vDot(e0, HULL_UP)) * 10 + vDot(e0, outward);
  for (var deg = 1; deg <= 180; deg++) {
    for (var s = -1; s <= 1; s += 2) {
      var ang = s * deg * Math.PI / 180;
      var r = vNorm(rotAbout(e0, axis, ang));
      var score = Math.abs(vDot(r, HULL_UP)) * 10 + vDot(r, outward);
      if (score < bestScore - 1e-9) { bestScore = score; best = ang; }
    }
  }
  return best;
}

/* ---- LEGS THAT STAND LEVEL, AND FOLD AWAY (Astra, 2026-10-21) ----------
 * Two things the models as drawn do not do.
 *
 * 1. STAND LEVEL, CLEAR OF THE BELLY. On most hulls every foot reaches the
 *    same depth, but not all: the heavy enforcer's nose leg stops 6% of a
 *    hull length short of its rear legs, the runner's wing legs 11% short of
 *    its nose leg, and the bulk hauler's keel hangs below all of its feet.
 *    So every foot is brought down to one level: the deepest foot on the
 *    hull, or LEG_CLEAR under the lowest point of the hull itself if that is
 *    deeper. A leg is lengthened, never shortened: its lower half slides
 *    down along the leg's own line, which stretches the strut and moves the
 *    foot and the bottom of the brace with it.
 *
 * 2. FOLD IN HALF, THEN PULL UP INSIDE. A leg used to swing up whole about
 *    its hinge, and lay flat along the belly, outside it. Now each strut is
 *    cut at the knee, halfway down. The lower half (a `shin`) folds up
 *    about the knee until it lies alongside the upper half; then both pull
 *    straight up into the hull, far enough to clear the bay; then the door
 *    closes behind them. `lift` is that last move, in hull units; the
 *    renderer owns the timing. */
var LEG_CLEAR = 0.01;          // feet at least this far under the lowest point of the hull
var KNEE = 0.5;                // where the strut folds, as a fraction of its reach
var FOLD = 175 * Math.PI / 180;
var LIFT_SPARE = 0.006;        // how far above the bay mouth the folded leg ends up

/* Cut a triangle list by the plane dot(p, n) = k into the part below k and
 * the part at or above it. Sutherland-Hodgman per triangle, fanned back to
 * triangles; colours ride along. */
function splitByPlane(v, f, c, n, k) {
  var sides = [{ v: [], f: [], c: [] }, { v: [], f: [], c: [] }];
  for (var t = 0; t < f.length; t++) {
    var tri = [v[f[t][0]], v[f[t][1]], v[f[t][2]]];
    for (var s = 0; s < 2; s++) {
      var keep = function (p) { var d = vDot(p, n) - k; return s === 0 ? d < 0 : d >= 0; };
      var poly = [];
      for (var i = 0; i < 3; i++) {
        var a = tri[i], b = tri[(i + 1) % 3], ia = keep(a), ib = keep(b);
        if (ia) poly.push(a);
        if (ia !== ib) {
          var da = vDot(a, n) - k, db = vDot(b, n) - k, u = da / (da - db);
          poly.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
        }
      }
      if (poly.length < 3) continue;
      var S = sides[s], base = S.v.length;
      poly.forEach(function (p) { S.v.push(p); });
      for (var j = 1; j + 1 < poly.length; j++) { S.f.push([base, base + j, base + j + 1]); S.c.push(c[t]); }
    }
  }
  return sides;
}

/* Is there any hull surface straight above point w? A vertical ray against
 * every triangle, in the xz plane by barycentrics. */
function hullAbove(V, F, w) {
  for (var t = 0; t < F.length; t++) {
    var a = V[F[t][0]], b = V[F[t][1]], c = V[F[t][2]];
    if (Math.max(a[1], b[1], c[1]) <= w[1]) continue;
    var d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-12) continue;
    var l1 = ((b[2] - c[2]) * (w[0] - c[0]) + (c[0] - b[0]) * (w[2] - c[2])) / d;
    var l2 = ((c[2] - a[2]) * (w[0] - c[0]) + (a[0] - c[0]) * (w[2] - c[2])) / d;
    var l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    if (l1 * a[1] + l2 * b[1] + l3 * c[1] > w[1]) return true;
  }
  return false;
}

function shapeGear(parts, hullV, hullF, id) {
  var r3 = function (x) { return Math.round(x * 1000) / 1000; };
  var r4 = function (x) { return Math.round(x * 10000) / 10000; };
  var struts = parts.filter(function (p) { return p.role === 'strut'; });
  if (!struts.length) return parts;

  /* Unpack each strut to plain vertices and a face colour per face, and
   * find the line it hangs along: from the pin to its deepest point. */
  struts.forEach(function (p) {
    p._c = p.ci.map(function (i) { return p.pal[i]; });
    var low = p.v[0];
    p.v.forEach(function (q) { if (q[1] < low[1]) low = q; });
    p._e = vNorm(low);
    p._reach = Math.hypot(low[0], low[1], low[2]);
    p._foot = p.pivot[1] + low[1];
  });

  var belly = Infinity;
  hullV.forEach(function (q) { if (q[1] < belly) belly = q[1]; });
  var level = Math.min(belly - LEG_CLEAR, Math.min.apply(null, struts.map(function (p) { return p._foot; })));
  var notes = [];

  var out = parts.filter(function (p) { return p.role !== 'strut'; });
  struts.forEach(function (p) {
    var e = p._e, v = p.v;
    /* 1. Lengthen: everything below the knee slides down the leg's line. */
    var drop = p._foot - level;
    if (drop > 0.001 && e[1] < -0.2) {
      var d = drop / -e[1], cut = p._reach * KNEE;
      v = v.map(function (q) {
        return vDot(q, e) > cut ? [q[0] + e[0] * d, q[1] + e[1] * d, q[2] + e[2] * d] : q;
      });
      notes.push(p.id.split('/')[0].replace(/^gear/, '') + ' +' + r3(drop));
      p._reach += d;
    }

    /* 2. Cut at the knee. */
    var kd = p._reach * KNEE, knee = [e[0] * kd, e[1] * kd, e[2] * kd];
    var halves = splitByPlane(v, p.f, p._c, e, kd);

    /* Fold the shin toward the inside of the hull: of the two ways round,
     * the one that carries the foot nearer the ship's centreline. A leg on
     * the centreline folds aft. */
    var inward = Math.abs(p.pivot[0]) > 0.01 ? vNorm([-p.pivot[0], 0, 0]) : [0, 0, -1];
    var axis = p.axis, fold = FOLD;
    var probe = rotAbout(e, axis, Math.PI / 2);
    if (vDot(probe, inward) < vDot(rotAbout(e, axis, -Math.PI / 2), inward)) fold = -FOLD;

    /* 3. How far to pull the folded leg up: until its lowest point is above
     * the pin, which is where the bay's mouth is. */
    var lowest = Infinity;
    halves[0].v.forEach(function (q) { if (q[1] < lowest) lowest = q[1]; });
    halves[1].v.forEach(function (q) {
      var r = rotAbout([q[0] - knee[0], q[1] - knee[1], q[2] - knee[2]], axis, fold);
      if (r[1] + knee[1] < lowest) lowest = r[1] + knee[1];
    });
    var lift = [0, r4(-lowest + LIFT_SPARE), 0];

    /* Does the folded leg fit? Its top, stowed, against the highest hull
     * vertex over the same patch of belly. Said out loud per leg, because a
     * foot poking through the top of a wing is the one failure here that a
     * glance at the landed ship would never show. */
    var pts = [], out1 = 0;
    halves[0].v.forEach(function (q) { pts.push([p.pivot[0] + q[0], p.pivot[1] + q[1] + lift[1], p.pivot[2] + q[2]]); });
    halves[1].v.forEach(function (q) {
      var r = rotAbout([q[0] - knee[0], q[1] - knee[1], q[2] - knee[2]], axis, fold);
      pts.push([p.pivot[0] + r[0] + knee[0], p.pivot[1] + r[1] + knee[1] + lift[1], p.pivot[2] + r[2] + knee[2]]);
    });
    pts.forEach(function (w) { if (!hullAbove(hullV, hullF, w)) out1++; });
    /* WHERE THERE IS NO ROOM: the runner's wing legs hang from a wing far
     * too thin to hold them, folded or not. A leg that would mostly stick
     * out of the hull instead folds and then SWINGS up flat about its hinge
     * by the angle the whole leg used to stow by, so it ends up tucked
     * under the wing at half its old length rather than standing up through
     * the top of it. */
    var swing = 0;
    if (out1 > 0.25 * pts.length) {
      swing = p.stow;
      lift = [0, 0, 0];
      console.log('  ~ ' + id + ' ' + p.id.split('/')[0] + ': no room to pull up inside (' + Math.round(100 * out1 / pts.length) + '% outside); folds and swings flat instead');
    } else if (out1) {
      console.log('  ! ' + id + ' ' + p.id.split('/')[0] + ': ' + Math.round(100 * out1 / pts.length) + '% of the stowed leg has no hull above it');
    }

    function pack(h, origin) {
      var pp = { pal: [], ci: [] }, idx = {};
      h.c.forEach(function (col) {
        if (idx[col] === undefined) { idx[col] = pp.pal.length; pp.pal.push(col); }
        pp.ci.push(idx[col]);
      });
      pp.v = h.v.map(function (q) { return [r3(q[0] - origin[0]), r3(q[1] - origin[1]), r3(q[2] - origin[2])]; });
      pp.f = h.f;
      return pp;
    }
    var up = pack(halves[0], [0, 0, 0]), lo = pack(halves[1], knee);
    /* `hinge` and `swing` only when the leg swings: the shin then turns
     * about the hip by the same angle as the strut, carried with it. */
    var sw = swing ? { hinge: p.pivot, swing: r4(swing) } : {};
    out.push(Object.assign({ id: p.id, role: 'strut', pivot: p.pivot, axis: p.axis, stow: 0, lift: lift },
                           sw, { v: up.v, f: up.f, pal: up.pal, ci: up.ci }));
    out.push(Object.assign({ id: p.id.replace(/Hinge$/i, 'Knee'), role: 'shin',
               pivot: [r3(p.pivot[0] + knee[0]), r3(p.pivot[1] + knee[1]), r3(p.pivot[2] + knee[2])],
               axis: p.axis, stow: r4(fold), lift: lift },
               sw, { v: lo.v, f: lo.f, pal: lo.pal, ci: lo.ci }));
  });
  if (notes.length) console.log('  legs lengthened on ' + id + ': ' + notes.join(', '));
  out.sort(function (p, q) {
    return (p.role < q.role ? -1 : p.role > q.role ? 1 : 0) ||
           p.pivot[2] - q.pivot[2] || p.pivot[0] - q.pivot[0];
  });
  return out;
}

/* ---- PORTS: the anchors a port carries ---------------------------------
 * Same mechanism as the emitters above — a named node opens one bounding
 * box and its children add to it — applied to the things a PORT has to tell
 * the simulation rather than the renderer.
 *
 * The distinction that matters: a ship's anchors are cosmetic (where a beam
 * appears to leave), and a port's are LOAD-BEARING. The camera clamps
 * against the chamber and the floor, and ships are parked in the berths. A
 * bay whose anchors disagree with its geometry puts a ship inside a wall,
 * so these are extracted and then checked (see the sanity pass at the end
 * of convertPort).
 *
 * THE NAMES ARE THE STATION DESIGN'S OWN. An earlier version of this file
 * invented a convention — portPad, bayMouth, berth0 — before there was any
 * port art to look at. models/STATIONS.md then turned out to carry a far
 * better one, with `station-tests.js` asserting invariants behind it, so
 * these match THAT and the invented names are kept only where the design
 * has nothing to say yet (the surface bays, still to be built).
 *
 * The important one: a berth is a tagged GROUP, and the measurable volume
 * inside it is `…Throat`. STATIONS.md is explicit that the throat is the
 * thing to measure to test whether a hull fits, and that a berth's outward
 * normal is its group's local +Z.
 *
 * SINGLE boxes — one per port. */
var PORT_SINGLE = {
  /* Surface bays only. No station design uses these yet; the four orbital
   * patterns have no pad and normalise to radius 1 instead. */
  pad: /^portPad/i,
  mouth: /bayMouth/i,
  floor: /bayFloor/i,
  ceiling: /bayCeiling/i,
  chamber: /bayChamber/i
};

/* REPEATED boxes — an ordered list, one entry per instance. */
var PORT_MULTI = {
  /* The bay volume — and it is measured from the throat's PANELS, not from
   * the throat.
   *
   * `Throat$` is STATIONS.md's name for the reference volume and it was the
   * right thing to look for. It matched nothing, in all four station
   * patterns, and the cause is worth keeping because it is invisible from
   * either end. station.js DOES build the volume:
   *
   *     const throat = box(w, h, depth, matDeep, tag + 'Throat');
   *     throat.visible = false;
   *
   * It is hidden on purpose — a visible one is a dark slab filling the
   * aperture, which the lab fixed once already. three's GLTFExporter
   * defaults to `onlyVisible: true`, and three-d-stage.js exports with
   * `parseAsync(obj, { binary: true })` and no override. So the one volume
   * the whole berth system measures against is the one thing the exporter
   * drops, silently, and every station converted with geom=NONE.
   *
   * Turning onlyVisible off would bring it back AND weld every other
   * invisible helper into the drawn mesh, so the fix belongs here. The
   * throat's five structural panels do export — ThroatFloor, ThroatRoof,
   * ThroatWallL, ThroatWallR, ThroatBack — and they line the bay, so their
   * union IS the bay envelope. Arguably a better measurement than the
   * reference box: it is the surface a hull would actually hit.
   *
   * `^berth\d` is kept but no longer carries this alone — the real groups
   * are berthL, berthSM0L, berthPylon0, none of which put a digit straight
   * after "berth". The lamps are excluded (`ThroatLamp0` is a fixture, and
   * station.js already had to rename them 'lamp…' for the same reason) and
   * so is anything else that merely mentions a throat.
   *
   * MERGED PER BERTH by mergeKey below, or five panels would arrive as five
   * berths and a cylinder with one bay would report having five. */
  berths: /Throat(Floor|Roof|WallL|WallR|Back)$|Throat$|^berth\d/i,
  /* Everything that MOVES. The models are static at their stowed/open
   * positions and the game layer is expected to drive them, so each leaf
   * has to arrive as its own instance with its own box — a merged bound
   * would give one door where there are four leaves. */
  /* `leafGroup_…` is the newer station builder's own name for ONE LEAF:
   * a group holding the lap door and its chevrons, with the leaf's travel
   * in its extras (`doorLeaf`). It is the whole moving part, so it is the
   * gate, and nothing inside it may open a second one — see `inGate` in
   * walk. Without this the 2026-09-21 exports (cylinder, spine, hydrogen
   * refinery) converted with no doors at all on their lap-door berths:
   * `LapDoorL` matches none of the older names. */
  /* `…HatchLeafL0` is the ring's heavy-bay finger hatch and `…LeafL` the
   * spine's toothed slider (24-09): outer doors both, and without them those
   * bays had no way in at all. A yard garage (`berthLY…`) is a ROLL-UP
   * door, so its gates are the slats themselves — its `LeafL` is the
   * slats' guides, rails and motor, which do not move. */
  gates: /^leafGroup_|SlidingDoor[LR]\d|BlastDoor[LR]|ForceField|^berth(?!LY)(?!\w*Inner)\w*?(Hatch)?Leaf[LR]\d*$|^berthLY\d+Leaf[LR]Slat\d+$/i,
  innerGates: /InnerGate/i,
  /* Where a stowed leaf lives. STATIONS.md asserts >=90% of each leaf sits
   * inside its house, which is what makes an open door invisible rather
   * than proud of the hull. */
  pockets: /Door(Pocket|House)|Blast(Pocket|House)|Lap(Pocket|House)/i,
  /* Red to port, green to starboard — an orientation cue on approach, and
   * the one piece of dressing that is information rather than decoration. */
  navLights: /NavLight/i,
  lamps: /ApproachLamp|CycleLamp|mouthLamp|Beacon/i,
  signs: /^billboard|Designation$|^portSign/i,
  docks: /^dockPort\d/i
};

/* The pressurised inside: the hall hulls are moved to, and the transfer
 * line that carries them there. A deliberately separate structure in the
 * design — `checkConnectivity` allows it as a second component — so it is
 * its own bucket here rather than part of the shell. */
/* THE CAR IS NOT THE SHAFT, and conflating them made every cargo-elevator
 * pad in the game invisible (Astra, 2026-10-13: "the cargo elevator pads are
 * all invisible").
 *
 * `^transfer(Main|Lift)` was written for the transfer LINE — and for a
 * cradle that is exactly right: `transferMain` is a bed, fifty-two rollers,
 * rails and a hundred and fifty caution stripes, all of it inside the
 * pressurised hull and none of it visible from outside. But at the eight pad
 * sites the only `transferLift*` geometry is `transferLiftCarPad`,
 * `transferLiftCarHangar` and `transferLiftCarHangarSkirt` — the CAR, the
 * platform a hull parks on, which rides up to the open sky and is the single
 * most important thing to be able to see when you are standing on it. The
 * pattern was not hiding an interior; it was hiding the floor.
 *
 * So the car is spared by name and everything else under `transferLift`
 * stays interior — which matters, because `transferLiftCrewShaftWall*` is a
 * crew access shaft and genuinely belongs inside. Checked across all 96
 * models before narrowing it: `transferLift*` resolves to the car in eight
 * of them and to that crew shaft in two, and to nothing else anywhere. */
var PORT_INTERIOR_RE = /^hall|^transferMain|^transferLift(?!Car)|Conveyor|^liguide|^liftGuide|^portInterior/i;

var PORT_SPIN_RE = /stationSpin/i;

/* DISPLAY-ONLY, AND EXCLUDED. The station builders ground their output with
 * `min.y === 0` so it can be dropped on a ground plane in the design
 * workspace, and they add the furniture to match: a saddle, stand legs,
 * shoes, a cradle arc. None of that belongs on something in orbit, and a
 * station floating with its landing legs down would be the first thing
 * anybody noticed. Dropped rather than bucketed — there is no view in which
 * the game wants them. */
var PORT_OMIT_RE = /^groundSaddle|^standLeg|^standShoe|^cradleArc/i;

/* REFERENCE VOLUMES: measured, never painted.
 *
 * A bay's `…Throat` is a solid block spanning the whole aperture. The lab
 * builds it deliberately — STATIONS.md measures hull fit and the approach
 * corridor against its dimensions — and hides it, because a visible one is
 * a dark slab where the corridor should be.
 *
 * Hiding it used to mean losing it: GLTFExporter skips invisible nodes by
 * default, so it never reached the file and every station converted with no
 * bay dimensions. The exporter now emits it (see three-d-stage.js) and this
 * is the other half of that bargain — the volume arrives, is measured, and
 * is kept out of the drawn mesh here, where deciding what to paint belongs.
 *
 * Separate from PORT_OMIT_RE because the two mean opposite things. A stand
 * leg is dropped entirely: it is furniture that does not belong in orbit,
 * and nothing wants its bounds. This is dropped from the PICTURE only. */
var PORT_REFERENCE_RE = /Throat$/i;

/* A bay declared by its own group node: berthL…, berthLY…, berthSM… with
 * nothing after the qualifier, so `berthLAlphaHatch` (a door inside the
 * heavy bay) is not mistaken for a second bay.
 *
 * `berthSMs0` (24-09 evening cylinders): an SM bay drawn for a SMALL hull
 * only — its extras say `hullClass: 'S'`, beside `berthSM1` with 'M'. The
 * lower-case size letter is part of the bay's name, not a qualifier word,
 * and without it here half of every new cylinder's small bays vanished
 * from the index (cylinder-m converted with 2 SM berths of the 4 it
 * declares). */
var BERTH_GROUP_RE = /^berth(?:L|SM)[sml]?(?:Y|[A-Z][a-z]+)?\d*$/;
/* Geometry that opens, left out of the grid the interior routes are found
 * in. Leaves, slats, teeth, gates, fields, hatches and seals. */
/* Carriers, keyed by stem: `liftGuide0` and `liftRackBrace3` are both the
 * lift, `shaftWallL` the shaft, `dockLift1Guide2` dock lift 1. */
var CARRIER_RE = /^(transferLift|transferMain|transferLock|transferDeck|dockLift\d+|hangarLift\d+|spokeTransfer\d+|ringLift|ringHoist|ringFeed|cargoHoist|sortHoist\d*|hoist|shaft|lift|incline|ramp)/i;
/* TWO KINDS OF MOVING PART, and they used to share this one pattern.
 *
 * Astra, 2026-10-16: "Openables are one thing, then there are moving
 * surfaces-with-collision." A door OPENS: it gets out of the way, and a
 * route passes through the hole it leaves. A lift car MOVES: it is a floor,
 * and a route RIDES it. Lumped together, a car was just more empty air to
 * the route-finder, so routes cut straight through shafts and the walls
 * round them, and nothing ever drew the car under the hull riding it.
 *
 * OPENABLE_RE is the doors. A MOVER is any node whose extras declare how it
 * moves - `lift` (the comet platform, the ground sites' cars), `motion`
 * (the ring lift, the skimmer's sort lift, the spine's hub lift, the
 * cylinder's bore cars) or `rampCar` (the cradle hoist) - see moverStops.
 * MOVER_NAME_RE catches the cars that ride with a declared one but carry no
 * extras of their own (a car's skirt). Both are left out of the route grid
 * like a door, because the car's own swept volume is the way through. */
var OPENABLE_RE = /(?:SlidingDoor|BlastDoor|Leaf|Slat|Tooth|InnerGate|ForceField|Hatch|InnerSeal)[LR]?\d*$|^leafGroup_|ThroatBack$/i;
var MOVER_NAME_RE = /Lift(?:Car|Platform)\w*$|^hoistCar|^liftPlatform/i;
/* THE INCLINED BORES the ramp cars run in. Astra, 2026-10-16: "clip those
 * elevator shafts, the 45 degree ones, so that the top of the shaft
 * doesn't protrude from the wall? It looks sloppy." See clipBores. */
var BORE_RE = /^hoistBore[A-Z]$|^armBore[A-Z]$|^spineHoist[A-Z]$|^cargoHoist$/;

/* ---- the way through a station, from a heavy bay to a small one ---------
 * Astra, 2026-09-24: "make sure that when we land at the station, the ship
 * is able to path all the way through to the S or M bay from the L bay
 * entrances on the new designs."
 *
 * The new designs are built that way: the heavy bay's doors are the big
 * hole in the hull, and behind them a hall, a transfer lock, a hoist or a
 * lift carries a small hull on to its own bay — some of which (the
 * refinery's curtained chambers, the ring's inner bays) have no door onto
 * space at all. So for every S/M berth this finds a route from an L berth
 * through the inside of the model, WITH THE DOORS OPEN, and stores it on
 * the berth as `entry` (which L berth, by sorted index) and `via` (the
 * corners between the two stands, in the model's normalised frame).
 *
 * Found here, once, rather than in the game: it is a property of the art,
 * the same for every port that wears the model, and it is a few seconds of
 * voxel search per model that nobody should pay at a docking clamp.
 *
 * The grid is two views of one model. OPEN leaves out everything that
 * opens (OPENABLE_RE) and is what a route may pass through; CLOSED keeps it
 * and says what is inside the hull at all, so a route cannot leave through
 * one door and come back in through another. Cost rises near walls, so a
 * route keeps to the middle of a passage rather than scraping it. */
var ROUTE_N = +process.env.ROUTE_N || 128;
var ROUTE_SPAN = 1.06;               // the normalised model fits in +-1

function interiorRoutes(buckets, berths, carried, doors) {
  var N = ROUTE_N, lo = -ROUTE_SPAN, cell = 2 * ROUTE_SPAN / N, inv = 1 / cell;
  var NN = N * N, NNN = N * N * N;
  var open = new Uint8Array(NNN), closed = new Uint8Array(NNN);
  function idx(x, y, z) { return (z * N + y) * N + x; }
  function rast(v, f, o) {
    for (var fi = 0; fi < f.length; fi++) {
      var a = v[f[fi][0]], b = v[f[fi][1]], c = v[f[fi][2]];
      if (!a || !b || !c) continue;
      var e = 0;
      for (var k = 0; k < 3; k++) {
        e = Math.max(e, Math.abs(b[k] - a[k]), Math.abs(c[k] - a[k]), Math.abs(c[k] - b[k]));
      }
      /* Enough samples to leave no hole at THIS grid: a capped count that
       * was enough at 128 leaves pinholes at 256, the outside floods in
       * through them, and bays that were inside the hull become space. */
      var n = Math.min(Math.ceil(160 * N / 128) * 2, Math.max(1, Math.ceil(e * inv * 2)));
      for (var i = 0; i <= n; i++) {
        for (var jj = 0; i + jj <= n; jj++) {
          var u = i / n, w = jj / n;
          var gx = Math.floor((a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * w - lo) * inv);
          var gy = Math.floor((a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * w - lo) * inv);
          var gz = Math.floor((a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * w - lo) * inv);
          if (gx < 0 || gy < 0 || gz < 0 || gx >= N || gy >= N || gz >= N) continue;
          var q = idx(gx, gy, gz);
          closed[q] = 1;
          if (!o[fi]) open[q] = 1;
        }
      }
    }
  }
  buckets.forEach(function (bk) { rast(bk.v, bk.f, bk.o || []); });

  /* Outside, with the doors shut: flood from the border. */
  var out = new Uint8Array(NNN), stack = new Int32Array(NNN), top = 0;
  function seed(q) { if (!closed[q] && !out[q]) { out[q] = 1; stack[top++] = q; } }
  for (var s0 = 0; s0 < N; s0++) {
    for (var s1 = 0; s1 < N; s1++) {
      seed(idx(s0, s1, 0)); seed(idx(s0, s1, N - 1)); seed(idx(s0, 0, s1));
      seed(idx(s0, N - 1, s1)); seed(idx(0, s0, s1)); seed(idx(N - 1, s0, s1));
    }
  }
  while (top) {
    var q0 = stack[--top], z0 = (q0 / NN) | 0, r0 = q0 - z0 * NN, y0 = (r0 / N) | 0, x0 = r0 - y0 * N;
    if (x0 > 0) seed(q0 - 1); if (x0 < N - 1) seed(q0 + 1);
    if (y0 > 0) seed(q0 - N); if (y0 < N - 1) seed(q0 + N);
    if (z0 > 0) seed(q0 - NN); if (z0 < N - 1) seed(q0 + NN);
  }

  if (process.env.ROUTE_PROBE) {
    JSON.parse(process.env.ROUTE_PROBE).forEach(function (pt) {
      var c = cellOf(pt), q = idx(c[0], c[1], c[2]);
      console.log('    probe ' + pt + ': out ' + out[q] + ' closed ' + closed[q] + ' open ' + open[q]);
      if (!out[q] || !process.env.ROUTE_LEAK) return;
      /* The way out: BFS through unclosed cells to the border, then the
       * path's last few cells before it leaves the model's extent. */
      var par = new Int32Array(NNN).fill(-2), Q = new Int32Array(NNN), h = 0, t = 0, end = -1;
      par[q] = -1; Q[t++] = q;
      while (h < t && end < 0) {
        var c0 = Q[h++], z = (c0 / NN) | 0, r = c0 - z * NN, y = (r / N) | 0, x = r - y * N;
        if (x === 0 || y === 0 || z === 0 || x === N - 1 || y === N - 1 || z === N - 1) { end = c0; break; }
        [1, -1, N, -N, NN, -NN].forEach(function (o) { var n2 = c0 + o; if (!closed[n2] && par[n2] === -2) { par[n2] = c0; Q[t++] = n2; } });
      }
      var path = [];
      for (var e = end; e >= 0; e = par[e]) path.push(e);
      path.reverse();
      /* The first cell whose 3x3x3 neighbourhood is mostly empty: where it is outside the hull. */
      var pts = path.map(function (c1) { var z = (c1 / NN) | 0, r = c1 - z * NN, y = (r / N) | 0, x = r - y * N; return [lo + (x + 0.5) * cell, lo + (y + 0.5) * cell, lo + (z + 0.5) * cell].map(function (v) { return v.toFixed(3); }).join(','); });
      console.log('      leak path (' + path.length + '): ' + pts.filter(function (_, i) { return i % Math.max(1, Math.floor(pts.length / 25)) === 0; }).join(' | '));
    });
  }
  /* Clearance: steps to the nearest open-grid wall, capped at 4. */
  var dist = new Uint8Array(NNN).fill(4);
  var qd = new Int32Array(NNN), qh = 0, qt = 0;
  for (var w0 = 0; w0 < NNN; w0++) if (open[w0]) { dist[w0] = 0; qd[qt++] = w0; }
  while (qh < qt) {
    var p = qd[qh++], d1 = dist[p] + 1;
    if (d1 >= 4) continue;
    var pz = (p / NN) | 0, pr = p - pz * NN, py = (pr / N) | 0, px = pr - py * N;
    var nb = [px > 0 ? p - 1 : -1, px < N - 1 ? p + 1 : -1, py > 0 ? p - N : -1,
              py < N - 1 ? p + N : -1, pz > 0 ? p - NN : -1, pz < N - 1 ? p + NN : -1];
    for (var ni = 0; ni < 6; ni++) {
      var nq = nb[ni];
      if (nq >= 0 && dist[nq] > d1) { dist[nq] = d1; qd[qt++] = nq; }
    }
  }
  /* Carriers: the cargo elevators, lift shafts and transfer decks that move
   * an S or M hull from the L bay's deck to its own. The route may cross
   * their volume wherever it lies inside the hull, deck plating and all —
   * the car carries the ship through it — and it costs no more than open
   * passage, so a route takes the lift rather than squeezing round it. */
  var carry = new Uint8Array(NNN);
  /* A LIFT IS RIDDEN, NOT FLOWN DOWN (Astra, 2026-10-16: "the ship should
   * wait for elevators to traverse their paths before continuing. The most
   * efficient path is not the one we want to see here."). A mover's run is
   * therefore CLOSED to ordinary passage - the route may stand at either
   * stop, where the car waits, but not fly the shaft between them - and a
   * deck change happens only as an explicit ride from one stop to the
   * other (rideRoute below). */
  var rides = (carried || []).filter(function (c) { return c.a && c.b; });
  var rideBlock = rides.length ? new Uint8Array(NNN) : null;
  rides.forEach(function (c) {
    var L = Math.sqrt(Math.pow(c.b[0] - c.a[0], 2) + Math.pow(c.b[1] - c.a[1], 2) + Math.pow(c.b[2] - c.a[2], 2));
    var stopZone = L > 1e-9 ? Math.min(0.45, (c.hz * 2 + cell * 2) / L) : 0.5;
    var a = cellOf(c.min), b = cellOf(c.max);
    for (var z = Math.max(0, Math.min(a[2], b[2]) - 1); z <= Math.min(N - 1, Math.max(a[2], b[2]) + 1); z++)
      for (var y = Math.max(0, Math.min(a[1], b[1]) - 1); y <= Math.min(N - 1, Math.max(a[1], b[1]) + 1); y++)
        for (var x = Math.max(0, Math.min(a[0], b[0]) - 1); x <= Math.min(N - 1, Math.max(a[0], b[0]) + 1); x++) {
          var p = centreOf(x, y, z);
          if (!(segDist(p, c.a, c.b) <= c.r + cell)) continue;
          var t = segT(p, c.a, c.b);
          if (t > stopZone && t < 1 - stopZone) rideBlock[idx(x, y, z)] = 1;
        }
  });
  (carried || []).forEach(function (c) {
    if (c.a && c.b) return;            // a ride, handled above
    var a = cellOf(c.min), b = cellOf(c.max);
    for (var z = Math.max(0, Math.min(a[2], b[2]) - 1); z <= Math.min(N - 1, Math.max(a[2], b[2]) + 1); z++)
      for (var y = Math.max(0, Math.min(a[1], b[1]) - 1); y <= Math.min(N - 1, Math.max(a[1], b[1]) + 1); y++)
        for (var x = Math.max(0, Math.min(a[0], b[0]) - 1); x <= Math.min(N - 1, Math.max(a[0], b[0]) + 1); x++) {
          var cq = idx(x, y, z);
          /* A MOVER'S RIDE is a capsule, not its box: within the car's
           * half-width (plus half a cell) of the line its centre runs on. */
          if (c.a && c.b && !(segDist(centreOf(x, y, z), c.a, c.b) <= c.r + cell * 0.5)) continue;
          if (!out[cq]) { carry[cq] = 1; if (dist[cq] < 2) dist[cq] = 2; }
        }
  });
  function centreOf(x, y, z) { return [lo + (x + 0.5) * cell, lo + (y + 0.5) * cell, lo + (z + 0.5) * cell]; }
  function segDist(p, a, b) {
    var ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    var L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    var t = L2 > 1e-12 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L2)) : 0;
    var dx = ap[0] - ab[0] * t, dy = ap[1] - ab[1] * t, dz = ap[2] - ab[2] * t;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function segT(p, a, b) {
    var ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    return L2 > 1e-12 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2 : 0;
  }
  function passable(q) { return (!open[q] || carry[q]) && !out[q] && !(rideBlock && rideBlock[q]); }
  function cellOf(pt) {
    return [Math.floor((pt[0] - lo) * inv), Math.floor((pt[1] - lo) * inv), Math.floor((pt[2] - lo) * inv)];
  }
  function nearestPassable(pt) {
    var c = cellOf(pt), best = -1, bd = Infinity;
    /* Eight cells at the 128 grid, the same DISTANCE at any other. */
    var rMax = Math.ceil(8 * N / 128);
    for (var r = 0; r <= rMax && best < 0; r++) {
      for (var dz = -r; dz <= r; dz++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        var x = c[0] + dx, y = c[1] + dy, z = c[2] + dz;
        if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) continue;
        var q = idx(x, y, z);
        if (!passable(q)) continue;
        var dd = dx * dx + dy * dy + dz * dz;
        if (dd < bd) { bd = dd; best = q; }
      }
    }
    return best;
  }

  /* A*, 26-connected, octile distance, a binary heap on typed arrays. */
  var g = new Float32Array(NNN), from = new Int32Array(NNN), shut = new Uint8Array(NNN);
  var heapI = new Int32Array(NNN * 2), heapF = new Float32Array(NNN * 2);
  var OFF = [];
  for (var oz = -1; oz <= 1; oz++) for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
    if (ox || oy || oz) OFF.push([ox, oy, oz, Math.sqrt(ox * ox + oy * oy + oz * oz)]);
  }
  function astar(sq, gq) {
    g.fill(Infinity); shut.fill(0);
    var hn = 0;
    function h(q) {
      var z = (q / NN) | 0, r = q - z * NN, y = (r / N) | 0, x = r - y * N;
      var gz = (gq / NN) | 0, gr = gq - gz * NN, gy = (gr / N) | 0, gx = gr - gy * N;
      var a = [Math.abs(x - gx), Math.abs(y - gy), Math.abs(z - gz)].sort(function (m, n) { return m - n; });
      return a[2] + 0.41 * a[1] + 0.32 * a[0];
    }
    function push(q, f) {
      var i = hn++;
      heapI[i] = q; heapF[i] = f;
      while (i > 0) {
        var pa = (i - 1) >> 1;
        if (heapF[pa] <= heapF[i]) break;
        var ti = heapI[pa], tf = heapF[pa];
        heapI[pa] = heapI[i]; heapF[pa] = heapF[i]; heapI[i] = ti; heapF[i] = tf; i = pa;
      }
    }
    function pop() {
      var q = heapI[0];
      hn--;
      heapI[0] = heapI[hn]; heapF[0] = heapF[hn];
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, rr = l + 1, m = i;
        if (l < hn && heapF[l] < heapF[m]) m = l;
        if (rr < hn && heapF[rr] < heapF[m]) m = rr;
        if (m === i) break;
        var ti = heapI[m], tf = heapF[m];
        heapI[m] = heapI[i]; heapF[m] = heapF[i]; heapI[i] = ti; heapF[i] = tf; i = m;
      }
      return q;
    }
    g[sq] = 0; from[sq] = -1; push(sq, h(sq));
    var steps = 0;
    while (hn > 0 && steps++ < Math.max(3000000, NNN)) {
      var q = pop();
      if (shut[q]) continue;
      if (q === gq) break;
      shut[q] = 1;
      var z = (q / NN) | 0, r = q - z * NN, y = (r / N) | 0, x = r - y * N;
      for (var k = 0; k < OFF.length; k++) {
        var nx = x + OFF[k][0], ny = y + OFF[k][1], nz = z + OFF[k][2];
        if (nx < 0 || ny < 0 || nz < 0 || nx >= N || ny >= N || nz >= N) continue;
        var nq = idx(nx, ny, nz);
        if (shut[nq] || !passable(nq)) continue;
        var cost = OFF[k][3] * (1 + 3 / (dist[nq] || 0.5));
        var ng = g[q] + cost;
        if (ng < g[nq]) { g[nq] = ng; from[nq] = q; push(nq, ng + h(nq)); }
      }
    }
    if (!isFinite(g[gq])) return null;
    var path = [];
    for (var c = gq; c >= 0; c = from[c]) path.push(c);
    return { cost: g[gq], cells: path.reverse() };
  }
  function centre(q) {
    var z = (q / NN) | 0, r = q - z * NN, y = (r / N) | 0, x = r - y * N;
    return [lo + (x + 0.5) * cell, lo + (y + 0.5) * cell, lo + (z + 0.5) * cell];
  }
  function sight(a, b) {
    var L = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2]));
    var n = Math.max(2, Math.ceil(L * inv * 3));
    for (var i = 0; i <= n; i++) {
      var t = i / n, c = cellOf([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      if (c[0] < 0 || c[1] < 0 || c[2] < 0 || c[0] >= N || c[1] >= N || c[2] >= N) return false;
      var q = idx(c[0], c[1], c[2]);
      if (!passable(q) || dist[q] < 1) return false;
    }
    return true;
  }
  function pull(cells) {
    var pts = cells.map(centre), outp = [pts[0]], i = 0;
    while (i < pts.length - 1) {
      var j2 = pts.length - 1;
      while (j2 > i + 1 && !sight(pts[i], pts[j2])) j2--;
      outp.push(pts[j2]); i = j2;
    }
    return outp;
  }

  var heavy = [], small = [];
  var found = 0, bridged = 0, rodeLift = 0, reachL = null, distL = null, srcL = null, reachCache = {};
  var r3 = function (x) { return Math.round(x * 1000) / 1000; };
  var r3p = function (p) { return [r3(p[0]), r3(p[1]), r3(p[2])]; };

  /* GROUND SITES (2026-09-24). Astra: the ground ports' "bays live
   * underground", and the way down to them is the site's own: the surface
   * pad door and its 45-degree cargo lift for S and M hulls, the hangar
   * door for the heavy ones, a portal in a mountain face or at the foot of
   * a runway ramp. So every berth of a model that declares entrances gets
   * a route in from one of them — `door`, the entrance's index, and
   * `doorVia`, the corners — found the same way as the heavy-bay routes
   * below, elevator fallback included. */
  if (doors && doors.length) {
    doors.forEach(function (d) {
      /* The door's normal: its thinnest axis, pointing to whichever side
       * of it is outside. */
      var sz = [d.max[0] - d.min[0], d.max[1] - d.min[1], d.max[2] - d.min[2]];
      var ax = sz.indexOf(Math.min(sz[0], sz[1], sz[2]));
      var pick1 = null;
      [1, -1].forEach(function (sg) {
        var hits = 0;
        for (var st = 2; st <= 16; st += 2) {
          var p = d.mid.slice(); p[ax] += sg * st * cell;
          var c = cellOf(p);
          if (c[0] < 0 || c[1] < 0 || c[2] < 0 || c[0] >= N || c[1] >= N || c[2] >= N) { hits++; continue; }
          if (out[idx(c[0], c[1], c[2])]) hits++;
        }
        if (!pick1 || hits > pick1.hits) pick1 = { sg: sg, hits: hits };
      });
      d.normal = [0, 0, 0]; d.normal[ax] = pick1.sg;
    });
    var liftDoor = /pad|surface/i, heavyDoor = /hangar|portal/i;
    var doorFound = 0, doorLift = 0;
    berths.forEach(function (b) {
      var gq = nearestPassable(b.mid);
      if (gq < 0) return;
      var want = b.cls === 'L' ? heavyDoor : liftDoor;
      var order = doors.map(function (_, i) { return i; }).sort(function (i, j) {
        var pi = want.test(doors[i].node) ? 0 : 1, pj = want.test(doors[j].node) ? 0 : 1;
        if (pi !== pj) return pi - pj;
        var di = Math.hypot(doors[i].mid[0] - b.mid[0], doors[i].mid[1] - b.mid[1], doors[i].mid[2] - b.mid[2]);
        var dj = Math.hypot(doors[j].mid[0] - b.mid[0], doors[j].mid[1] - b.mid[1], doors[j].mid[2] - b.mid[2]);
        return di - dj;
      });
      for (var oi = 0; oi < order.length; oi++) {
        var d = doors[order[oi]];
        var inside = [d.mid[0] - d.normal[0] * 2 * cell, d.mid[1] - d.normal[1] * 2 * cell, d.mid[2] - d.normal[2] * 2 * cell];
        var sq = nearestPassable(inside);
        if (sq < 0) continue;
        var got = astar(sq, gq), pts = null, lifted = false;
        if (got) pts = pull(got.cells);
        else {
          var br = bridgeFrom('door' + order[oi], [sq], gq);
          if (!br) continue;
          var a1 = astar(sq, br.a), t1 = astar(br.b, gq);
          if (!a1 || !t1) continue;
          pts = pull(a1.cells).concat(pull(t1.cells));
          lifted = br;
        }
        b.door = order[oi];
        b.doorVia = pts.slice(1, -1).map(r3p);
        if (lifted) { b.doorLift = 1; b.shaft = shaftSpec(lifted); doorLift++; }
        doorFound++;
        break;
      }
    });
    console.log('    ground entrances: ' + doors.map(function (d) { return d.node; }).join(', ') +
                ' - ' + doorFound + ' of ' + berths.length + ' berth(s) routed in' +
                (doorLift ? ' (' + doorLift + ' by elevator across unconnected decks)' : ''));
  }

  /* AN INNER HEAVY BAY (24-09 evening cylinders): `berthLArm` is an L bay
   * down the arm with a curtain and no door onto space — its extras name
   * `exitVia: 'berthLFwd'`, and its dockPath runs in through the forward
   * bay and along the hub. It is a destination, like a small bay, and never
   * an entry: routed from the heavy bays like S/M, and not offered as a way
   * in. Without this the arrival had no door to fly it through and
   * berths.test reported "no way in" for the arm bay of every cylinder. */
  /* Keyed by the bay's own name: a berth measured off its throat panels
   * carries the panel's node (`berthLFwdThroatFloor`), and `exitVia` names
   * the bay (`berthLFwd`). */
  var byNode = {};
  berths.forEach(function (b) {
    if (b.node) byNode[String(b.node).replace(/Throat(Floor|Roof|WallL|WallR|Back)?$/, '')] = b;
  });
  berths.forEach(function (b, k) {
    var via = b.exitVia && byNode[b.exitVia];
    var inner = b.cls === 'L' && via && via !== b && via.cls === 'L';
    if (inner) small.push(k);
    else if (b.cls === 'L') heavy.push(k);
    else if (b.cls === 'SM') small.push(k);
  });
  if (!heavy.length || !small.length) return 0;
  var declared = 0;
  /* A clear passage first. Then, for a CARRIAGE bay, the art's own route
   * before the elevator bridge — the bridge is a straight line through
   * whatever is in the way, and on the civil yard it had been "routing"
   * half the carriage bays through the hall walls while the art said
   * exactly how the carriage runs. Every other bay keeps the old order
   * (bridge, then the declared route as a last resort), so the stations
   * converted this morning route exactly as they did — the shaft report
   * is keyed on those bridges. */
  small.forEach(function (k) {
    if (routeVoxel(k, false)) { found++; return; }
    if (berths[k].carriage && routeDeclared(k)) { found++; declared++; return; }
    if (routeVoxel(k, true)) { found++; return; }
    if (routeDeclared(k)) { found++; declared++; }
  });
  if (bridged) console.log('    ' + bridged + ' S/M route(s) joined by elevator across unconnected decks');
  /* A route found some other way - the art's own dockPath, chiefly - that
   * nonetheless runs along a car's line IS a ride: mark the leg, so the
   * arrival stops on the car and lets it run rather than gliding down. */
  berths.forEach(function (b) {
    if (!b.via || b.ride || typeof b.entry !== 'number') return;
    var pts = [berths[b.entry].mid].concat(b.via);
    for (var i = 0; i + 1 < pts.length && !b.ride; i++) {
      var p = pts[i], q = pts[i + 1];
      var L = Math.sqrt(Math.pow(q[0] - p[0], 2) + Math.pow(q[1] - p[1], 2) + Math.pow(q[2] - p[2], 2));
      rides.forEach(function (c) {
        if (b.ride) return;
        var run = Math.sqrt(Math.pow(c.b[0] - c.a[0], 2) + Math.pow(c.b[1] - c.a[1], 2) + Math.pow(c.b[2] - c.a[2], 2));
        var tol = c.r + (c.hz || 0) + 3 * cell;
        if (L > 0.3 * run && segDist(p, c.a, c.b) <= tol && segDist(q, c.a, c.b) <= tol && i >= 1) {
          b.ride = [i - 1, i]; b.rideNode = c.key; rodeLift++;
        }
      });
    }
  });
  if (rodeLift) console.log('    ' + rodeLift + ' S/M route(s) RIDE a lift car stop to stop');
  if (declared) console.log('    ' + declared + ' route(s) taken from the art\'s own dockPath (carriage or unreachable deck)');
  berths.forEach(function (b) { delete b.declared; delete b.carriage; });
  return found;

  /* THE ART'S OWN ROUTE, where the voxels cannot find one (24-09 evening:
   * the civil yard's "carriage halls"). Each S/M bay there rides a carriage
   * — a floor that moves — on a track down to a hall reached through a
   * heavy bay, and the builder writes the way out into the bay's extras:
   * `dockPath`, from the carriage's end of the track out through its
   * `exitVia` bay's mouth. A voxel search over a static model cannot ride a
   * moving floor, so half the yard's bays had no way in at all.
   *
   * Taken backwards it is the way IN: from the heavy bay's stand, the
   * declared corners that lie inboard of that stand (the ones outboard are
   * the run in from space, which the heavy bay's own approach already
   * flies), ending at the foot of the carriage, then up the carriage to
   * this bay's stand. Only where the art names a real heavy bay to come in
   * through. */
  function routeDeclared(k) {
    var b = berths[k];
    if (!b.declared || !b.declared.length) return false;
    var h = b.exitVia && byNode[b.exitVia];
    var hi = h ? berths.indexOf(h) : -1;
    if (hi < 0 || heavy.indexOf(hi) < 0) return false;
    var n = h.normal, m = h.mid;
    var pts = b.declared.slice().reverse().filter(function (p) {
      if (!n) return true;
      return (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1] + (p[2] - m[2]) * n[2] <= 0;
    });
    /* NOT the carriage's `raised` point. Measured on yard-m it lies on the
     * straight run between dockPath[1] and dockPath[0], so appending it
     * after dockPath[0] sent the hull back down the track before the
     * climb. dockPath[0] is the foot of the carriage's diagonal and the
     * leg from it to the stand IS the carriage ride; `carriage` is kept
     * only as the mark that this bay has one. */
    if (!pts.length) return false;
    b.entry = hi;
    b.via = pts.map(function (p) { return [r3(p[0]), r3(p[1]), r3(p[2])]; });
    if (b.carriage) b.carriageRide = 1;
    return true;
  }

  function routeVoxel(k, allowBridge) {
    var gq = nearestPassable(berths[k].mid);
    if (gq < 0) return false;
    var best = null;
    heavy.forEach(function (h0) {
      var sq = nearestPassable(berths[h0].mid);
      if (sq < 0) return;
      var got = astar(sq, gq);
      if (got && (!best || got.cost < best.cost)) best = { cost: got.cost, cells: got.cells, from: h0 };
    });
    if (!best && process.env.ROUTE_DEBUG) {
      /* Why not: flood from the first heavy bay and see what it reaches. */
      var sq0 = nearestPassable(berths[heavy[0]].mid), seen = new Uint8Array(NNN), st2 = [sq0], cnt = 0, hit = false, nearest = Infinity;
      var gc = centre(gq);
      if (sq0 >= 0) seen[sq0] = 1;
      while (st2.length && sq0 >= 0) {
        var c0 = st2.pop(); cnt++;
        if (c0 === gq) hit = true;
        var cc = centre(c0), dd0 = Math.hypot(cc[0] - gc[0], cc[1] - gc[1], cc[2] - gc[2]);
        if (dd0 < nearest) nearest = dd0;
        var cz = (c0 / NN) | 0, cr = c0 - cz * NN, cy = (cr / N) | 0, cx = cr - cy * N;
        [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].forEach(function (o3) {
          var x = cx + o3[0], y = cy + o3[1], z = cz + o3[2];
          if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return;
          var q3 = idx(x, y, z);
          if (!seen[q3] && passable(q3)) { seen[q3] = 1; st2.push(q3); }
        });
      }
      console.log('    route debug ' + berths[k].node + ': from ' + berths[heavy[0]].node + ' reaches ' + cnt +
                  ' cells, closest ' + nearest.toFixed(3) + ' radii to the bay; goal out=' + out[gq]);
    }
    var pts;
    /* NO WAY ON FOOT: RIDE A LIFT. Drive to the car at one stop, ride it
     * the whole run to the other, drive on to the stand. */
    /* And even WITH a way on foot, when the bay is on another deck from the
     * heavy bay and a lift joins them: the art put the lift there for that,
     * and a hull dropping a kilometre and a half down an open void beside
     * the car is exactly what Astra did not want to see. */
    var deckChange = best && Math.abs(berths[k].mid[2] - berths[best.from].mid[2]) > 0.03;
    if ((!best || deckChange) && rides.length) {
      var rr = rideRoute(gq);
      if (rr) {
        berths[k].entry = rr.from;
        berths[k].via = rr.pts.slice(1, -1).map(function (p) { return [r3(p[0]), r3(p[1]), r3(p[2])]; });
        berths[k].ride = [rr.boardVia, rr.boardVia + 1];   // indices into via
        berths[k].rideNode = rr.node;
        rodeLift++;
        return true;
      }
    }
    if (best) pts = pull(best.cells);
    else if (!allowBridge) return false;
    else {
      /* THE ELEVATOR, where the art has the idea but not the connection: the
       * heavy bay's passages and this bay's passages both exist, but no
       * open voxel joins them — the car is parked on one deck and its shaft
       * is walled at the other, or the elevator is drawn as a shape rather
       * than a hole. The cargo elevator is exactly the thing that joins
       * them (Astra, 24-09), so the route is: through the heavy bay to the
       * point of its reach nearest this bay's, up or down the elevator in a
       * straight (possibly angled) line, and on through this bay's own
       * passages to the stand. The nearest pair is preferred inside a
       * carrier volume, which is where the elevator is. */
      var br = bridge(gq);
      if (!br) return false;
      heavy.forEach(function (h0) {
        var sq = nearestPassable(berths[h0].mid);
        if (sq < 0) return;
        var got = astar(sq, br.a);
        if (got && (!best || got.cost < best.cost)) best = { cost: got.cost, cells: got.cells, from: h0 };
      });
      var tail = astar(br.b, gq);
      if (!best || !tail) return false;
      pts = pull(best.cells).concat(pull(tail.cells));
      berths[k].lift = 1;
      berths[k].shaft = shaftSpec(br);
      bridged++;
    }
    berths[k].entry = best.from;
    berths[k].via = pts.slice(1, -1).map(function (p) { return [r3(p[0]), r3(p[1]), r3(p[2])]; });
    return true;
  }

  /* The best ride to a goal: for each car, board at one stop and alight at
   * the other, either way round, from whichever heavy bay is cheapest. The
   * stop points are the car's centre at the stop raised by its half-height
   * and a hull's clearance - where a hull stands on it. Returns the full
   * point list (heavy stand ... goal) and the index of the alighting point. */
  function rideRoute(gq) {
    var bestR = null;
    rides.forEach(function (c) {
      var lift = (c.hz || 0) + 2 * cell;
      var A = [c.a[0], c.a[1], c.a[2] + lift], B = [c.b[0], c.b[1], c.b[2] + lift];
      var qa = nearestPassable(A), qb = nearestPassable(B);
      if (process.env.ROUTE_DEBUG) console.log('    ride debug ' + c.key + ' A ' + A.map(r3) + ' -> ' + qa + ', B ' + B.map(r3) + ' -> ' + qb);
      if (qa < 0 || qb < 0) return;
      [[A, qa, B, qb], [B, qb, A, qa]].forEach(function (o) {
        var tail = astar(o[3], gq);
        if (process.env.ROUTE_DEBUG) console.log('      tail from ' + o[2].map(r3) + ': ' + (tail ? 'found' : 'none'));
        if (!tail) return;
        heavy.forEach(function (h0) {
          var sq = nearestPassable(berths[h0].mid);
          if (sq < 0) return;
          var head = astar(sq, o[1]);
          if (!head) return;
          var L = Math.sqrt(Math.pow(o[2][0] - o[0][0], 2) + Math.pow(o[2][1] - o[0][1], 2) + Math.pow(o[2][2] - o[0][2], 2));
          var cost = head.cost + tail.cost + L * inv;
          if (bestR && bestR.cost <= cost) return;
          var p1 = pull(head.cells), p2 = pull(tail.cells);
          /* Board exactly on the car and alight exactly off it: the pulled
           * corners end at cell centres near the stops, the ride is the
           * stop-to-stop line itself. */
          var headP = p1.length > 1 ? p1.slice(0, -1) : [p1[0]];
          var tailP = p2.length > 1 ? p2.slice(1) : [p2[0]];
          var pts = headP.concat([o[0], o[2]], tailP);
          /* pts[headP.length] boards, pts[headP.length + 1] alights; via is
           * pts without its first and last, so subtract one. */
          bestR = { cost: cost, pts: pts, boardVia: headP.length - 1, from: h0, node: c.key };
        });
      });
    });
    if (!bestR) return null;
    /* `board` counted in pts, where pts[0] is the heavy stand; via drops
     * that first point, so in via the boarding corner is board - 1. */
    return bestR;
  }

  /* Everything the heavy bays reach, once; and for a goal, the closest
   * cell of what IT reaches to that, measured as a straight line through
   * the hull (a multi-source BFS over inside cells, seeded from the heavy
   * reach). Capped at BRIDGE_MAX of the model's half-span. */
  function flood(seeds) {
    var seen = new Uint8Array(NNN), st = [];
    seeds.forEach(function (s) { if (s >= 0 && !seen[s]) { seen[s] = 1; st.push(s); } });
    while (st.length) {
      var c0 = st.pop();
      var cz = (c0 / NN) | 0, cr = c0 - cz * NN, cy = (cr / N) | 0, cx = cr - cy * N;
      for (var k2 = 0; k2 < OFF.length; k2++) {
        var x = cx + OFF[k2][0], y = cy + OFF[k2][1], z = cz + OFF[k2][2];
        if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) continue;
        var q3 = idx(x, y, z);
        if (!seen[q3] && passable(q3)) { seen[q3] = 1; st.push(q3); }
      }
    }
    return seen;
  }
  /* WHERE THE SHAFT THE ART IS MISSING WOULD GO (24-09: "we need actual
   * shafts for the lifts"). Written on the berth so a report can hand it
   * to whoever builds the model: the two ends in the model's normalised
   * frame, its length, its angle off vertical (0 a plain lift, 45 the pad
   * sites' inclined cars), and which carrier volume, if any, it runs
   * through — a named lift the art already has but has not opened. */
  function shaftSpec(br) {
    var a = centre(br.a), c = centre(br.b);
    var dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var ang = L > 1e-9 ? Math.acos(Math.min(1, Math.abs(dz) / L)) * 180 / Math.PI : 0;
    var inCar = null;
    (carried || []).forEach(function (cb) {
      if (inCar) return;
      var m = 2 * cell;
      function inside(p) {
        return p[0] >= cb.min[0] - m && p[0] <= cb.max[0] + m && p[1] >= cb.min[1] - m &&
               p[1] <= cb.max[1] + m && p[2] >= cb.min[2] - m && p[2] <= cb.max[2] + m;
      }
      if (inside(a) || inside(c)) inCar = cb.key || 'carrier';
    });
    return { from: r3p(a), to: r3p(c), len: r3(L), deg: Math.round(ang), carrier: inCar };
  }
  function bridge(goal) {
    return bridgeFrom('heavy', heavy.map(function (h0) { return nearestPassable(berths[h0].mid); }), goal);
  }
  function bridgeFrom(ck, seeds, goal) {
    var cached = reachCache[ck];
    if (cached) { reachL = cached.reach; distL = cached.dist; srcL = cached.src; }
    else {
      reachL = flood(seeds);
      /* Distance out from the heavy reach, through anything inside. */
      distL = new Uint16Array(NNN).fill(65535); srcL = new Int32Array(NNN).fill(-1);
      var qq = new Int32Array(NNN), h1 = 0, t1 = 0;
      for (var s = 0; s < NNN; s++) if (reachL[s]) { distL[s] = 0; srcL[s] = s; qq[t1++] = s; }
      var cap = Math.ceil(BRIDGE_MAX / cell);
      while (h1 < t1) {
        var p = qq[h1++], d = distL[p] + 1;
        if (d > cap) continue;
        var pz = (p / NN) | 0, pr = p - pz * NN, py = (pr / N) | 0, px = pr - py * N;
        for (var k3 = 0; k3 < OFF.length; k3++) {
          var x = px + OFF[k3][0], y = py + OFF[k3][1], z = pz + OFF[k3][2];
          if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) continue;
          var nq = idx(x, y, z);
          if (out[nq] || distL[nq] <= d) continue;
          distL[nq] = d; srcL[nq] = srcL[p]; qq[t1++] = nq;
        }
      }
      reachCache[ck] = { reach: reachL, dist: distL, src: srcL };
    }
    var mine = flood([goal]), bestB = -1, bestS = Infinity;
    for (var q = 0; q < NNN; q++) {
      if (!mine[q] || distL[q] === 65535) continue;
      var sc = distL[q] - ((carry[q] || carry[srcL[q]]) ? 6 : 0);
      if (sc < bestS) { bestS = sc; bestB = q; }
    }
    return bestB < 0 ? null : { a: srcL[bestB], b: bestB };
  }
}
var BRIDGE_MAX = 1.2;                // of the half-span: no elevator longer than that

/* ---- one model ---------------------------------------------------------- */
function convert(file) {
  var g = parseGlb(fs.readFileSync(file));
  var j = g.json;
  var ext = { v: [], f: [], c: [] };
  var inr = { v: [], f: [], c: [] };
  var glassMin = [Infinity, Infinity, Infinity];
  var glassMax = [-Infinity, -Infinity, -Infinity];
  var sawGlass = false;
  var emitters = [];        // one accumulated bounding box per laserEmitter
  var engines = [];         // one accumulated bounding box per engineGlow
  var hinged = [];          // one bucket per Hinge node — the parts that move
  var extTag = [];          // per exterior face, the node it came from (hull-seal's report; not emitted)

  function walk(nodeIdx, parentMat, inInterior, inEmitter, inHinge, legName, inEngine) {
    var node = j.nodes[nodeIdx];
    var local = node.matrix ? node.matrix.slice()
                            : matFromTRS(node.translation, node.rotation, node.scale);
    var world = matMul(parentMat, local);
    var name = node.name || '';

    /* A hinge opens its own bucket, and everything under it goes in there
     * rather than into the hull. Nested hinges are not a thing these models
     * have, and if one ever appears the outer bucket keeps it — which is
     * wrong but visible, rather than silently dropping the geometry. */
    /* A hinge is not a leg, and LEG_RE would otherwise match one — the
     * hinge test comes first so `gearNose/gearStrutHinge` does not come out
     * named `gearStrutHinge/gearStrutHinge`. */
    var leg = (!HINGE_RE.test(name) && LEG_RE.test(name)) ? name : legName;
    var hinge = inHinge;
    /* A hinge only counts as GEAR if it is inside a gear leg. The tender
     * carries a ninth `...Hinge` node halfway up its starboard flank —
     * service gear of some kind, not a landing leg — and claiming it put an
     * unmovable part in the gear list: no lean to derive an axis from, so
     * no rotation, so a "moving" part that never moved. Anything outside a
     * `gear*` subtree stays baked into the hull exactly as before, which is
     * both correct and a no-op for every model that has one. */
    if (!hinge && leg && HINGE_RE.test(name)) {
      hinge = { name: name, leg: leg, world: world, v: [], f: [], c: [] };
      hinged.push(hinge);
    }
    /* Classification is INHERITED: a named parent carries unnamed children
     * with it, which is how these files are actually assembled. */
    var interior = inInterior || INTERIOR_RE.test(name);
    /* A new emitter opens a new box; a child of one keeps adding to its
     * parent's, so a multi-part muzzle stays a single gun. */
    var emitter = inEmitter;
    if (!emitter && EMITTER_RE.test(name)) {
      emitter = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      emitters.push(emitter);
    }
    var engine = inEngine || null;
    if (!engine && ENGINE_RE.test(name)) {
      engine = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      engines.push(engine);
    }

    if (node.mesh !== undefined) {
      var mesh = j.meshes[node.mesh];
      var mname = name || mesh.name || '';
      var mine = interior || INTERIOR_RE.test(mname);
      var isGlass = GLASS_RE.test(mname);
      if (!emitter && EMITTER_RE.test(mname)) {
        emitter = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        emitters.push(emitter);
      }
      if (!engine && ENGINE_RE.test(mname)) {
        engine = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        engines.push(engine);
      }
      /* A hinged part is neither hull nor interior: it is its own small
       * mesh, drawn with its own frame. The test comes first because a
       * gear door is exterior geometry and would otherwise be welded into
       * the hull exactly as it is today. */
      var into = hinge ? hinge : (mine ? inr : ext);
      for (var p = 0; p < mesh.primitives.length; p++) {
        var prim = mesh.primitives[p];
        if (prim.mode !== undefined && prim.mode !== 4) continue;   // triangles only
        var pos = accessorData(g, prim.attributes.POSITION);
        var base = into.v.length;
        for (var i = 0; i < pos.length; i++) {
          var w = matApply(world, pos[i]);
          into.v.push(w);
          if (isGlass) {
            sawGlass = true;
            for (var a0 = 0; a0 < 3; a0++) {
              if (w[a0] < glassMin[a0]) glassMin[a0] = w[a0];
              if (w[a0] > glassMax[a0]) glassMax[a0] = w[a0];
            }
          }
          if (emitter) {
            for (var a1 = 0; a1 < 3; a1++) {
              if (w[a1] < emitter.min[a1]) emitter.min[a1] = w[a1];
              if (w[a1] > emitter.max[a1]) emitter.max[a1] = w[a1];
            }
          }
          if (engine) {
            for (var a2 = 0; a2 < 3; a2++) {
              if (w[a2] < engine.min[a2]) engine.min[a2] = w[a2];
              if (w[a2] > engine.max[a2]) engine.max[a2] = w[a2];
            }
          }
        }
        var col = materialColour(g, prim.material);
        var idx = prim.indices !== undefined
          ? accessorData(g, prim.indices)
          : pos.map(function (_, k) { return k; });
        for (var t = 0; t < idx.length; t += 3) {
          into.f.push([base + idx[t], base + idx[t + 1], base + idx[t + 2]]);
          into.c.push(col);
          if (into === ext) extTag.push(mname);
        }
      }
    }
    for (var ch = 0; ch < (node.children || []).length; ch++) {
      walk(node.children[ch], world, interior, emitter, hinge, leg, engine);
    }
  }

  var scene = j.scenes[j.scene || 0];
  for (var r = 0; r < scene.nodes.length; r++) {
    walk(scene.nodes[r], matIdentity(), false, null, null, null);
  }

  /* Normalise: centred on the origin, unit length along the LONGEST axis.
   * These assets follow the glTF convention (+Y up, front toward +Z), which
   * is the game's own convention, so no axis shuffle — but if a batch ever
   * arrives sideways, this is the one place to fix it.
   *
   * MEASURED ON THE EXTERIOR, APPLIED TO BOTH. This is the part that has to
   * be right: normalising each bucket against its own bounds would scale a
   * two-metre chair up to the length of the ship and park it at the origin.
   * One transform, derived from the hull, moves everything together and
   * keeps the seat registered to the canopy. It also means the hull's unit
   * length is unchanged from before this split existed, so nothing that was
   * tuned against the old scale moves. */
  /* MEASURED OVER THE WHOLE AUTHORED MODEL, gear included, even though the
   * gear no longer lives in `ext`. Pulling three legs out of the bucket the
   * bounds are taken from would shrink the vertical span and move the
   * centre, which would renormalise every hull in the library and quietly
   * invalidate every number tuned against the old scale — the canopy box,
   * the muzzles, the cockpit archetypes, SHIP_LEN itself. The split is
   * meant to change what MOVES, not how big anything is. */
  var mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  function bound(list) {
    for (var q = 0; q < list.length; q++) for (var b = 0; b < 3; b++) {
      if (list[q][b] < mins[b]) mins[b] = list[q][b];
      if (list[q][b] > maxs[b]) maxs[b] = list[q][b];
    }
  }
  bound(ext.v);
  for (var hb = 0; hb < hinged.length; hb++) bound(hinged[hb].v);
  var span = [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]];
  var mid = [(maxs[0] + mins[0]) / 2, (maxs[1] + mins[1]) / 2, (maxs[2] + mins[2]) / 2];
  var scale = 1 / Math.max(span[0], span[1], span[2], 1e-9);

  function place(p) {
    return [
      Math.round((p[0] - mid[0]) * scale * 1000) / 1000,
      Math.round((p[1] - mid[1]) * scale * 1000) / 1000,
      Math.round((p[2] - mid[2]) * scale * 1000) / 1000
    ];
  }
  for (var i3 = 0; i3 < ext.v.length; i3++) ext.v[i3] = place(ext.v[i3]);
  for (var i4 = 0; i4 < inr.v.length; i4++) inr.v[i4] = place(inr.v[i4]);

  /* Palette-compress the colour array: a handful of materials colour
   * hundreds of faces, and writing the hex string per face triples the
   * output size for nothing. */
  function palette(cols) {
    var pal = [], palIdx = {};
    var ci = cols.map(function (col) {
      if (palIdx[col] === undefined) { palIdx[col] = pal.length; pal.push(col); }
      return palIdx[col];
    });
    return { pal: pal, ci: ci };
  }
  var pe = palette(ext.c), pi = palette(inr.c);

  var out = {
    v: ext.v, f: ext.f, pal: pe.pal, ci: pe.ci,
    span: span.map(function (s) { return Math.round(s * scale * 1000) / 1000; })
  };
  if (inr.f.length) {
    out.interior = { v: inr.v, f: inr.f, pal: pi.pal, ci: pi.ci };
  }
  /* The canopy box, in the same normalised frame — where the glass is, and
   * therefore where a seat view looks out of and mounts its panels. */
  if (sawGlass) {
    var gmin = place(glassMin), gmax = place(glassMax);
    /* Rounded like every other coordinate here. An unrounded midpoint
     * writes 0.47050000000000003 into a generated file, which is noise in
     * the diff and bytes in the payload. */
    var r3 = function (x) { return Math.round(x * 1000) / 1000; };
    out.glass = {
      min: gmin, max: gmax,
      mid: [r3((gmin[0] + gmax[0]) / 2), r3((gmin[1] + gmax[1]) / 2),
            r3((gmin[2] + gmax[2]) / 2)]
    };
  }
  /* The muzzles, in the same normalised frame as everything else: the
   * FORWARD FACE of each emitter box, not its centre, because a beam leaves
   * the end of a barrel rather than the middle of one.
   *
   * Sorted left to right across the hull, so hardpoint order is stable
   * between runs and between models — glTF node order is whatever the
   * authoring tool wrote, and letting that decide which gun is hardpoint 0
   * would reshuffle a player's fire groups whenever a model was re-exported. */
  /* ---- the moving parts, as their own meshes ----------------------------
   * Each one is emitted RELATIVE TO ITS OWN PIVOT, so the game draws it with
   * a frame placed at the pivot and rotated about the axis, which is exactly
   * the shape `drawPortDoors` already uses for a sliding leaf and the port
   * library uses for a spinning ring. Nothing about the mesh format or
   * either renderer has to change: a part is a mesh and a frame, like
   * everything else this file emits.
   *
   * `stow` is the angle that puts it away, measured off the model rather
   * than typed in — see stowAngle. The game interpolates 0..stow and owns
   * the timing, because how long a leg takes to swing is a feel decision
   * and belongs where feel decisions live. */
  if (hinged.length) {
    var parts = [];
    for (var hg = 0; hg < hinged.length; hg++) {
      var H = hinged[hg];
      if (!H.f.length) continue;
      var m = H.world;
      var pivotRaw = [m[12], m[13], m[14]];
      var localAxes = [vNorm([m[0], m[1], m[2]]),
                       vNorm([m[4], m[5], m[6]]),
                       vNorm([m[8], m[9], m[10]])];

      /* Where the part reaches, measured in the hinge's own frame: spans to
       * pick a fallback axis with, and a centroid to give the direction it
       * extends away from the pin. */
      var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      var cen = [0, 0, 0];
      for (var pv = 0; pv < H.v.length; pv++) {
        var rel = [H.v[pv][0] - pivotRaw[0], H.v[pv][1] - pivotRaw[1], H.v[pv][2] - pivotRaw[2]];
        cen[0] += rel[0]; cen[1] += rel[1]; cen[2] += rel[2];
        for (var ax = 0; ax < 3; ax++) {
          var d = vDot(rel, localAxes[ax]);
          if (d < lo[ax]) lo[ax] = d;
          if (d > hi[ax]) hi[ax] = d;
        }
      }
      cen = [cen[0] / H.v.length, cen[1] / H.v.length, cen[2] / H.v.length];
      var spans = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      var centres = [(hi[0] + lo[0]) / 2, (hi[1] + lo[1]) / 2, (hi[2] + lo[2]) / 2];

      var axis = hingeAxis(cen, localAxes, spans, centres);
      /* The PLACED pivot, because "which way is inboard" is a question
       * about the hull's centre and `place` is what puts the origin there.
       * Handing stowAngle the raw glTF coordinate would measure outward
       * from wherever the artist's world origin happened to be. */
      var pivot = place(pivotRaw);
      var stow = stowAngle(cen, axis, pivot);

      var pp = palette(H.c);
      var r4 = function (x) { return Math.round(x * 10000) / 10000; };
      parts.push({
        id: H.leg + '/' + H.name,
        role: /door/i.test(H.name) ? 'door' : 'strut',
        pivot: pivot,
        axis: axis.map(r4),
        stow: r4(stow),
        v: H.v.map(function (p) {
          return [Math.round((p[0] - pivotRaw[0]) * scale * 1000) / 1000,
                  Math.round((p[1] - pivotRaw[1]) * scale * 1000) / 1000,
                  Math.round((p[2] - pivotRaw[2]) * scale * 1000) / 1000];
        }),
        f: H.f, pal: pp.pal, ci: pp.ci
      });
    }
    /* Sorted so the order is stable between runs and between models, for
     * the same reason the muzzles are: glTF node order is whatever the
     * authoring tool happened to write. */
    parts.sort(function (p, q) {
      return (p.role < q.role ? -1 : p.role > q.role ? 1 : 0) ||
             p.pivot[2] - q.pivot[2] || p.pivot[0] - q.pivot[0];
    });
    if (parts.length) out.gear = shapeGear(parts, ext.v, ext.f, id);
  }

  /* IS HER SKIN CLOSED (2026-11-03)? Measured on the exterior exactly as
   * it is emitted (placed and rounded), with tools/hull-seal.js - the same
   * code the tests use. Kept off the emitted object (not enumerable), so
   * hulls.js is byte-for-byte what it was. See the report in the loop at
   * the bottom, and tools/glb-patch.js for what to do about a warning. */
  Object.defineProperty(out, 'seal', { enumerable: false, value: {
    open: SEAL.openEdges(out),
    cols: SEAL.oddColumns(out, 1 / SEAL_N, null, extTag)
  } });

  var live = emitters.filter(function (e) { return isFinite(e.min[0]); });
  if (live.length) {
    out.muzzles = live.map(function (e) {
      var c = place([(e.min[0] + e.max[0]) / 2,
                     (e.min[1] + e.max[1]) / 2,
                     e.max[2]]);
      return c;
    }).sort(function (p, q) { return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; });
  }
  /* The engines: [x, y, z, r] per engineGlow, at the AFT face of its box
   * (the hull faces +z, so a plume leaves at min z) with r half the smaller
   * cross-section span. Sorted like the muzzles so the order is stable. */
  var liveE = engines.filter(function (e) { return isFinite(e.min[0]); });
  if (liveE.length) {
    out.engines = liveE.map(function (e) {
      var c = place([(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2, e.min[2]]);
      var r = Math.min(e.max[0] - e.min[0], e.max[1] - e.min[1]) / 2 * scale;
      c.push(Math.max(0.001, Math.round(r * 1000) / 1000));
      return c;
    }).sort(function (p, q) { return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; });
  }
  return out;
}

/* ---- PORTS: one port ----------------------------------------------------
 * Deliberately its own function rather than a pile of branches inside
 * convert(). The two share a container format and nothing else: different
 * axes, a different scale reference, different buckets and different
 * anchors, and interleaving them would have made both harder to read than
 * either is alone.
 */
/* The right-angle turn that takes a shared berth `up` to +z, or null. Needs
 * the berth boxes' own matrices, so it runs before anything is placed. */
function standUp(berths) {
  if (!berths || !berths.length) return null;
  var ups = [];
  for (var i = 0; i < berths.length; i++) {
    var b = berths[i];
    if (!b.mat) continue;
    var o = matApply(b.mat, [0, 0, 0]), y = matApply(b.mat, [0, 1, 0]);
    var g0 = [o[0], -o[2], o[1]], g1 = [y[0], -y[2], y[1]];     // toGame, inline
    var d = [g1[0] - g0[0], g1[1] - g0[1], g1[2] - g0[2]];
    var l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    if (!(l > 1e-9)) return null;
    ups.push([d[0] / l, d[1] / l, d[2] / l]);
  }
  if (!ups.length) return null;
  var u = ups[0];
  for (i = 1; i < ups.length; i++) {
    if (u[0] * ups[i][0] + u[1] * ups[i][1] + u[2] * ups[i][2] < 0.999) return null;   // they disagree
  }
  var ax = -1;
  for (var k = 0; k < 3; k++) if (Math.abs(u[k]) > 0.999) ax = k;
  if (ax < 0) return null;                       // not a world axis: leave it be
  var sgn = u[ax] > 0 ? 1 : -1;
  if (ax === 2) return sgn > 0 ? null : function (p) { return [p[0], -p[1], -p[2]]; };
  /* up = +/-y: turn about x.  up = +/-x: turn about y. Each maps u to +z. */
  if (ax === 1) return sgn > 0 ? function (p) { return [p[0], -p[2], p[1]]; }
                               : function (p) { return [p[0], p[2], -p[1]]; };
  return sgn > 0 ? function (p) { return [-p[2], p[1], p[0]]; }
                 : function (p) { return [p[2], p[1], -p[0]]; };
}

/* ---- CLIP THE INCLINED BORES AT THE WALL (2026-10-16) --------------------
 * Astra: "clip those elevator shafts, the 45 degree ones, so that the top
 * of the shaft doesn't protrude from the wall? It looks sloppy."
 *
 * The builders lay a bore down as a straight run and stop it at a length,
 * not at the hull, so on the cradle the hoist's rack and walls run on out
 * through the lower block's side and hang in space. A face test would not
 * do: a bore wall is one long panel, inside at one end and outside at the
 * other. So each bore is CUT, on the wall's own plane:
 *
 *   1. the hull WITHOUT the bores is voxelised;
 *   2. walking out along the bore's centreline, the first point that can
 *      see open space down two or more axes is where it has left the hull
 *      (one is not enough - a bay mouth opens one way);
 *   3. the escape axis most along the bore is the wall's normal, and the
 *      wall's own faces nearby give its exact plane;
 *   4. every face of that bore is clipped to the inside of the plane.
 *
 * Orbital stations only; a ground site's incline is meant to reach the
 * surface. A bore that never leaves the hull is left exactly as it was. */
function clipBores(buckets, bores, file) {
  /* (The voxel grid and the escape test of the first version are gone with
   * it: see EACH END ON THE SURFACE ITS WALLS CROSS below.) */
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  var clippedTotal = 0;
  bores.forEach(function (bore, bi) {
    var pts = [];
    buckets.forEach(function (bk) {
      for (var fi = 0; fi < bk.f.length; fi++) if (bk.bo[fi] === bi) bk.f[fi].forEach(function (vi) { pts.push(bk.v[vi]); });
    });
    if (pts.length < 9) return;
    var cen = [0, 0, 0];
    pts.forEach(function (p) { cen[0] += p[0]; cen[1] += p[1]; cen[2] += p[2]; });
    cen = [cen[0] / pts.length, cen[1] / pts.length, cen[2] / pts.length];
    /* The bore's long axis: power iteration on the covariance. */
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    pts.forEach(function (p) {
      var d = [p[0] - cen[0], p[1] - cen[1], p[2] - cen[2]];
      for (var r = 0; r < 3; r++) for (var s = 0; s < 3; s++) C[r][s] += d[r] * d[s];
    });
    var ax = [0.577, 0.577, 0.577];
    for (var it = 0; it < 40; it++) {
      var nx = [dot(C[0], ax), dot(C[1], ax), dot(C[2], ax)];
      var l = Math.sqrt(dot(nx, nx)) || 1;
      ax = [nx[0] / l, nx[1] / l, nx[2] / l];
    }
    var sMin = Infinity, sMax = -Infinity, rad = 0;
    pts.forEach(function (p) {
      var d = [p[0] - cen[0], p[1] - cen[1], p[2] - cen[2]], s = dot(d, ax);
      sMin = Math.min(sMin, s); sMax = Math.max(sMax, s);
      var lat = [d[0] - ax[0] * s, d[1] - ax[1] * s, d[2] - ax[2] * s];
      rad = Math.max(rad, Math.sqrt(dot(lat, lat)));
    });
    /* EACH END ON THE SURFACE ITS WALLS CROSS (2026-11-03). Astra, at
     * Halden Dock: "why is the shaft protruding from the wall at the top
     * and bottom of the shaft? It should be cut flush with the wall."
     *
     * The first version (above, 2026-10-16) walked out along the centreline
     * to the first point that could see open space down two axes and cut
     * there. Two things were wrong with that:
     *
     *   - A cylinder's arm bore IS the arm: from the hub it runs through
     *     open space to its pod, so its own centreline (its walls left out of
     *     the grid) sees space a third of the way along. armBoreC was cut on
     *     a plane at the hub that kept almost none of it (3 faces of 140
     *     left between the hub and the pod), the hub's hole for it opened
     *     onto space, the converter's route grid flooded the whole hub as
     *     OUTSIDE, and not one S/M bay of any cylinder could be routed
     *     through it: they were all "joined by elevator" in a straight line
     *     through the structure (item 1).
     *   - Where nothing was cut, each end was left square to the bore, as
     *     the builder stopped it, so an inclined bore that meets a level
     *     deck stands proud of it by up to its own width on one side.
     *
     * So each END is taken on its own. Lines parallel to the bore just
     * outside each of its four walls are walked in from the end; the first
     * surface (not the bore's own) that at least three of them cross within
     * the end's last stretch is the one the bore meets there - the deck it
     * opens onto, the pod roof it comes down through, the hull wall it
     * leaves by - and the bore is cut on that surface's own plane, keeping
     * the side toward its middle. A bore whose end meets nothing is left
     * as it is. */
    var lat1 = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    var la = [ax[1] * lat1[2] - ax[2] * lat1[1], ax[2] * lat1[0] - ax[0] * lat1[2], ax[0] * lat1[1] - ax[1] * lat1[0]];
    var lal = Math.sqrt(dot(la, la)); la = [la[0] / lal, la[1] / lal, la[2] / lal];
    var lb = [ax[1] * la[2] - ax[2] * la[1], ax[2] * la[0] - ax[0] * la[2], ax[0] * la[1] - ax[1] * la[0]];
    /* The walls' half-extents across, each way: the cross-section is a
     * box, not a circle, so the four lines sit just outside each wall. */
    var ea = 0, eb = 0;
    pts.forEach(function (p) {
      var d = [p[0] - cen[0], p[1] - cen[1], p[2] - cen[2]];
      ea = Math.max(ea, Math.abs(dot(d, la))); eb = Math.max(eb, Math.abs(dot(d, lb)));
    });
    var len = sMax - sMin, STRETCH = Math.max(0.03, len * 0.2);
    [1, -1].forEach(function (sg) {
      var endS = sg > 0 ? sMax : sMin;
      var endP = [cen[0] + ax[0] * endS, cen[1] + ax[1] * endS, cen[2] + ax[2] * endS];
      var inward = [-ax[0] * sg, -ax[1] * sg, -ax[2] * sg];
      /* Candidate triangles: not this bore's, near this end. */
      var reach = STRETCH + Math.max(ea, eb) * 2;
      var tris = [];
      buckets.forEach(function (bk) {
        for (var fi = 0; fi < bk.f.length; fi++) {
          if (bk.bo[fi] === bi) continue;
          var A = bk.v[bk.f[fi][0]], B = bk.v[bk.f[fi][1]], Cq = bk.v[bk.f[fi][2]];
          if (!A || !B || !Cq) continue;
          var far = false;
          for (var k = 0; k < 3 && !far; k++) {
            if (Math.min(A[k], B[k], Cq[k]) > endP[k] + reach || Math.max(A[k], B[k], Cq[k]) < endP[k] - reach) far = true;
          }
          if (!far) tris.push([A, B, Cq]);
        }
      });
      var hits = [];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
        var off = [la[0] * o[0] * ea * 1.15 + lb[0] * o[1] * eb * 1.15, la[1] * o[0] * ea * 1.15 + lb[1] * o[1] * eb * 1.15,
                   la[2] * o[0] * ea * 1.15 + lb[2] * o[1] * eb * 1.15];
        /* From a little beyond the end (a square end may stop just short
         * of the surface on its low side) in along the bore. */
        var o0 = [endP[0] + off[0] - inward[0] * Math.max(ea, eb), endP[1] + off[1] - inward[1] * Math.max(ea, eb),
                  endP[2] + off[2] - inward[2] * Math.max(ea, eb)];
        var lim = STRETCH + Math.max(ea, eb), best = null;
        tris.forEach(function (T) {
          var t = rayTri(o0, inward, T[0], T[1], T[2]);
          if (t >= 0 && t <= lim && (!best || t < best.t)) best = { t: t, tri: T };
        });
        if (best) hits.push({ p: [o0[0] + inward[0] * best.t, o0[1] + inward[1] * best.t, o0[2] + inward[2] * best.t], tri: best.tri });
      });
      if (process.env.CLIP_DEBUG) {
        var zx = -Infinity, zn = Infinity;
        pts.forEach(function (p) { zx = Math.max(zx, p[2]); zn = Math.min(zn, p[2]); });
        console.log('      ' + bore.node + ' end ' + endP.map(function (v) { return v.toFixed(3); }) + ': ' + hits.length + ' of 4 lines meet a surface; bore z ' + zn.toFixed(3) + '..' + zx.toFixed(3) + ' half ' + ea.toFixed(3) + ',' + eb.toFixed(3));
      }
      if (hits.length < 3) return;
      /* One surface: the normals agree. Its plane through the hits, put
       * where the furthest-out of them lies so nothing of the bore is left
       * standing proud of it. */
      var nrm = function (T) {
        var e1 = [T[1][0] - T[0][0], T[1][1] - T[0][1], T[1][2] - T[0][2]], e2 = [T[2][0] - T[0][0], T[2][1] - T[0][1], T[2][2] - T[0][2]];
        var nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        var l = Math.sqrt(dot(nn, nn)) || 1;
        nn = [nn[0] / l, nn[1] / l, nn[2] / l];
        if (dot(nn, inward) > 0) nn = [-nn[0], -nn[1], -nn[2]];   // facing out of the bore's end
        return nn;
      };
      var n = nrm(hits[0].tri), agree = hits.filter(function (h) { return dot(nrm(h.tri), n) > 0.98; });
      if (agree.length < 3) return;
      /* A wall the bore runs along is not one it ends on. */
      if (Math.abs(dot(n, inward)) < 0.2) return;
      var dpl = -Infinity;
      agree.forEach(function (h) { dpl = Math.max(dpl, dot(h.p, n)); });
      /* Nothing to cut: the end is already at or inside the surface. */
      var proud = -Infinity;
      pts.forEach(function (p) { proud = Math.max(proud, dot(p, n) - dpl); });
      if (!(proud > 1e-5)) return;
      clippedTotal += clipBucketFaces(buckets, bi, n, dpl);
      console.log('    cut ' + bore.node + ' at its end by ' + endP.map(function (v) { return v.toFixed(3); }).join(',') +
                  ' flush with the surface it meets (normal ' + n.map(function (v) { return v.toFixed(2); }).join(',') +
                  '), ' + (proud * 1000).toFixed(1) + ' thousandths of a radius proud before');
    });
  });
  return clippedTotal;
}
/* Moller-Trumbore, both-sided: distance along d (unit) to triangle abc, or -1. */
function rayTri(o, d, a, b, c) {
  var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  var p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  var det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-14) return -1;
  var inv = 1 / det, t0 = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  var u = (t0[0] * p[0] + t0[1] * p[1] + t0[2] * p[2]) * inv;
  if (u < 0 || u > 1) return -1;
  var q = [t0[1] * e1[2] - t0[2] * e1[1], t0[2] * e1[0] - t0[0] * e1[2], t0[0] * e1[1] - t0[1] * e1[0]];
  var v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return -1;
  var t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return t >= 0 ? t : -1;
}
/* ---- FLUSH PANELS, LIFTED (2026-10-16) -----------------------------------
 * The rest of the flicker after the five-place fix is in the art itself: a
 * panel, a stripe or a plate laid EXACTLY on a wall, facing the same way.
 * Two faces in one plane z-fight however fine the depth buffer is. So
 * where two faces of different colour share a plane, face the same way and
 * genuinely overlap, the smaller - the panel, not the wall - is lifted off
 * along its normal by LIFT_EPS (8 cm on a 4 km station), on its own copy of
 * its vertices so its neighbours stay where they are. Measured on cradle-s
 * at five places: 955 such pairs; ring-s 191. */
var LIFT_EPS = 2e-5;
function liftCoplanar(buckets) {
  var lifted = 0;
  function r5(x) { return Math.round(x * 100000) / 100000; }
  buckets.forEach(function (bk) {
    var T = [];
    for (var fi = 0; fi < bk.f.length; fi++) {
      var a = bk.v[bk.f[fi][0]], b = bk.v[bk.f[fi][1]], c = bk.v[bk.f[fi][2]];
      if (!a || !b || !c) continue;
      var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      var n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      var l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
      if (l < 1e-14) continue;
      n = [n[0] / l, n[1] / l, n[2] / l];
      var off = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
      /* Same-facing only: the key keeps the normal's sign. */
      var key = Math.round(n[0] * 500) + ',' + Math.round(n[1] * 500) + ',' + Math.round(n[2] * 500) + '|' + Math.round(off * 50000);
      var ax = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : (Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2);
      var o1 = ax === 0 ? 1 : 0, o2 = ax === 2 ? 1 : 2;
      var P = [[a[o1], a[o2]], [b[o1], b[o2]], [c[o1], c[o2]]];
      T.push({ fi: fi, key: key, n: n, area: l / 2, col: bk.c[fi], P: P,
               bb: [Math.min(P[0][0], P[1][0], P[2][0]), Math.min(P[0][1], P[1][1], P[2][1]),
                    Math.max(P[0][0], P[1][0], P[2][0]), Math.max(P[0][1], P[1][1], P[2][1])] });
    }
    var groups = {};
    T.forEach(function (t) { (groups[t.key] = groups[t.key] || []).push(t); });
    var lift = {};
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 2 || g.length > 6000) return;
      for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++) {
        var p = g[i], q = g[j];
        if (p.col === q.col) continue;
        if (p.bb[2] <= q.bb[0] || q.bb[2] <= p.bb[0] || p.bb[3] <= q.bb[1] || q.bb[3] <= p.bb[1]) continue;
        if (!(triHit(p.P, q.P) || triHit(q.P, p.P))) continue;
        var small = p.area <= q.area ? p : q;
        lift[small.fi] = small.n;
      }
    });
    Object.keys(lift).forEach(function (fs) {
      var fi = +fs, n = lift[fs], base = bk.v.length;
      bk.f[fi].forEach(function (vi) {
        var v = bk.v[vi];
        bk.v.push([r5(v[0] + n[0] * LIFT_EPS), r5(v[1] + n[1] * LIFT_EPS), r5(v[2] + n[2] * LIFT_EPS)]);
      });
      bk.f[fi] = [base, base + 1, base + 2];
      lifted++;
    });
  });
  return lifted;
}
/* Does an interior point of P (its centre, or a point most of the way to a
 * corner) lie strictly inside Q? Neighbours sharing an edge do not count. */
function triHit(P, Q) {
  var c = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3];
  var pts = [c, [c[0] + (P[0][0] - c[0]) * 0.7, c[1] + (P[0][1] - c[1]) * 0.7],
             [c[0] + (P[1][0] - c[0]) * 0.7, c[1] + (P[1][1] - c[1]) * 0.7],
             [c[0] + (P[2][0] - c[0]) * 0.7, c[1] + (P[2][1] - c[1]) * 0.7]];
  var a = Q[0], b = Q[1], d0 = Q[2];
  var den = (b[1] - d0[1]) * (a[0] - d0[0]) + (d0[0] - b[0]) * (a[1] - d0[1]);
  if (Math.abs(den) < 1e-16) return false;
  for (var k = 0; k < pts.length; k++) {
    var p = pts[k];
    var l1 = ((b[1] - d0[1]) * (p[0] - d0[0]) + (d0[0] - b[0]) * (p[1] - d0[1])) / den;
    var l2 = ((d0[1] - a[1]) * (p[0] - d0[0]) + (a[0] - d0[0]) * (p[1] - d0[1])) / den;
    if (l1 > 0.02 && l2 > 0.02 && 1 - l1 - l2 > 0.02) return true;
  }
  return false;
}
/* Keep the part of bore `bi`'s faces with n.p <= d; split the ones that
 * straddle the plane. Returns how many faces changed. */
function clipBucketFaces(buckets, bi, n, d) {
  var changed = 0, eps = 1e-7;
  function r3(x) { return Math.round(x * 100000) / 100000; }   // vertex precision: five places
  buckets.forEach(function (bk) {
    var F = [], Cc = [], O = [], B = [], PK = [];
    var pk = bk.pk || [];
    for (var fi = 0; fi < bk.f.length; fi++) {
      var f = bk.f[fi];
      var pkf = pk[fi] === undefined ? -1 : pk[fi];
      if (bk.bo[fi] !== bi) { F.push(f); Cc.push(bk.c[fi]); O.push(bk.o[fi]); B.push(bk.bo[fi]); PK.push(pkf); continue; }
      var P = f.map(function (vi) { return bk.v[vi]; });
      var s = P.map(function (p) { return p[0] * n[0] + p[1] * n[1] + p[2] * n[2] - d; });
      if (s[0] <= eps && s[1] <= eps && s[2] <= eps) { F.push(f); Cc.push(bk.c[fi]); O.push(bk.o[fi]); B.push(bi); PK.push(pkf); continue; }
      changed++;
      if (s[0] > -eps && s[1] > -eps && s[2] > -eps) continue;     // wholly outside: gone
      /* Sutherland-Hodgman against one plane: a triangle becomes a
       * triangle or a quad, fanned back into triangles. */
      var poly = [];
      for (var k = 0; k < 3; k++) {
        var a = P[k], b = P[(k + 1) % 3], sa = s[k], sb = s[(k + 1) % 3];
        if (sa <= eps) poly.push(a);
        if ((sa < -eps && sb > eps) || (sa > eps && sb < -eps)) {
          var t = sa / (sa - sb);
          poly.push([r3(a[0] + (b[0] - a[0]) * t), r3(a[1] + (b[1] - a[1]) * t), r3(a[2] + (b[2] - a[2]) * t)]);
        }
      }
      if (poly.length < 3) continue;
      var base = bk.v.length;
      poly.forEach(function (p) { bk.v.push(p); });
      for (var q = 1; q + 1 < poly.length; q++) {
        F.push([base, base + q, base + q + 1]); Cc.push(bk.c[fi]); O.push(bk.o[fi]); B.push(bi); PK.push(pkf);
      }
    }
    bk.f = F; bk.c = Cc; bk.o = O; bk.bo = B; bk.pk = PK;
  });
  return changed;
}

function convertPort(file) {
  var g = parseGlb(fs.readFileSync(file));
  var j = g.json;
  /* pk: which car or hatch part each face belongs to, -1 for none. */
  var ext = { v: [], f: [], c: [], o: [], bo: [], pk: [] };     // the shell
  var inr = { v: [], f: [], c: [], o: [], bo: [], pk: [] };     // only visible from inside
  var spn = { v: [], f: [], c: [], o: [], bo: [], pk: [] };     // turns about +z
  /* Which inclined bore a face belongs to (-1: none) - see clipBores. */
  var bores = [];
  var single = {}, multi = {}, extras = [], groups = [], carriers = {};
  /* ENTRANCES: the outer doors a port opens to traffic control's say-so
   * (`airlock.outerOpensOn: 'dockingClearance'`). An orbital berth is its
   * own entrance; a ground site is not — its bays are underground, and the
   * way in is a surface pad door, a hangar door or a portal in a mountain
   * face (Astra, 24-09). Keyed by node name, grown over the door's subtree. */
  var entrances = {}, sweeps = [];
  /* MOVERS (2026-10-16): one box per declared car, grown over its subtree,
   * with where it can go (see moverStops). */
  var movers = [];
  /* CARS THAT RIDE (2026-10-17). Astra: "we need the car to ride with the
   * ship." A node that declares `extras.motion` of kind `lift` — the ring's
   * `ringLiftPlatform`, `{ axis: 'y', from: 63.1, to: 9.35 }` in its
   * parent's frame — is a car the game should MOVE, not just a volume a
   * route may cross. Each is measured over its whole subtree (platform,
   * turntable and all) at the position it was exported at, and written out
   * with its travel as a vector, so the renderer can lift those triangles
   * out of the hull and draw them wherever the car is this frame. Additive
   * on purpose: the carrier boxes the interior routes are found in are not
   * touched, so no route moves because of this. */
  var cars = {};
  /* EXACTLY WHICH FACES ARE THE CAR, and which are the hatch over it. A box
   * will not do for the ring: its platform parks flush in the heavy bay's
   * inner gate, same footprint and the same few metres of height, so a box
   * drawn round either takes the other with it. So the faces each one owns
   * are recorded as they are emitted — runs of indices into the bucket's
   * face list, which is written out in that same order. A hatch is any
   * node the art tags `hatch: true` (the ring's InnerGate and InnerSeal). */
  var parts = [];
  /* THE RUNS ARE RE-READ AT THE END (merge, 2026-10-25). They are noted as
   * faces are emitted, but the bores are clipped and their faces rebuilt
   * after that (clipBores), which moves every index after the first one it
   * touches. So each face also carries its part's number in the bucket's
   * `pk` list, which the clip carries along with the face, and partRuns
   * rebuilds `r` from it once the faces are final. */
  function notePart(name, kind, bucketName, from, to, b, bucket) {
    if (to <= from) return;
    var last = parts.length ? parts[parts.length - 1] : null;
    if (last && last.node === name && last.bucket === bucketName &&
        last.r[last.r.length - 1][1] === from) {
      last.r[last.r.length - 1][1] = to;
    } else if (last && last.node === name && last.bucket === bucketName) {
      last.r.push([from, to]);
    } else {
      parts.push({ node: name, kind: kind, bucket: bucketName, r: [[from, to]], box: b });
    }
    if (bucket) for (var k = from; k < to; k++) bucket.pk[k] = parts.length - 1;
  }
  function partRuns() {
    var byName = { shell: ext, interior: inr, spin: spn };
    parts.forEach(function (pt, pi) {
      var bk = byName[pt.bucket], r = [];
      for (var fi = 0; fi < bk.f.length; fi++) {
        if (bk.pk[fi] !== pi) continue;
        if (r.length && r[r.length - 1][1] === fi) r[r.length - 1][1] = fi + 1;
        else r.push([fi, fi + 1]);
      }
      pt.r = r;
    });
    parts = parts.filter(function (pt) { return pt.r.length; });
  }
  /* The scene root's own transform. A bay's declared `dockPath` is written
   * in the root's LOCAL frame (the station as designed, before the builder
   * grounded it), so it needs the root's matrix and nothing else — measured
   * on yard-m: the carriage's `raised` point (hall frame) and dockPath[0]
   * agree on x and y exactly once each is taken to the root frame. */
  var rootMat = null;
  var key;
  for (key in PORT_MULTI) multi[key] = [];

  function box() {
    return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  }

  /* Which anchor, if any, this node should JOIN rather than start.
   *
   * Returns a key that several nodes can agree on, or null to mean "this
   * node is its own instance" — which is the answer for everything except
   * berths. A berth's five throat panels all reduce to the berth's own tag,
   * so they accumulate into one box with one orientation.
   *
   * KEYED ON THE PARENT NODE, not on the name, and the difference is not
   * academic. Keying on the text before 'Throat' looked right and was
   * measured wrong: the ring station carries its bays in two mirrored
   * halves, and both halves export panels called `berthSM0ThroatFloor`. A
   * name key merged a berth with the berth on the OPPOSITE SIDE of the
   * station, so the ring reported 3 bays instead of 5 and two of those
   * boxes spanned the whole structure. A box like that would say a hull
   * fits where it would hit the far wall.
   *
   * A node's parent is unique per instance whatever it is called. Using it
   * also keeps the measurement off the group itself, which is what we want:
   * the group holds the jambs, the lintel and the sill as well, and those
   * stand proud of the aperture, so measuring it would report a bay bigger
   * than the hole a ship actually has to fly through. */
  var merged = {};
  function mergeKey(kind, name, parentIdx) {
    if (kind !== 'berths') return null;
    /* Both the reference volume and its panels, so a bay that ships both
     * is ONE berth. Without the bare `Throat$` arm here, a model exported
     * with its reference volumes intact reports every bay twice — the box
     * once and its lining once — which is the failure that arrives the
     * moment onlyVisible:false starts working. */
    if (!/Throat(?:Floor|Roof|WallL|WallR|Back)?$/i.test(name)) return null;
    /* A node with NO parent merges with nothing. The station builder puts a
     * bay's volume and its lining inside a group, so they share a parent
     * and belong together; a flat model — the synthetic fixtures, or any
     * bay authored by hand — hangs several complete `…Throat` volumes off
     * the scene root, where they share the non-parent -1 and are three
     * different bays. Keying on that would have reported the orbital
     * fixture's two S/M berths and one heavy as a single berth spanning
     * the station. */
    if (!(parentIdx >= 0)) return null;
    return 'berth|' + parentIdx;
  }

  /* Is this node the bay's own reference volume, as opposed to the plates
   * that line it? The distinction decides which measurement wins below. */
  function isReference(name) { return /Throat$/i.test(name); }
  function grow(b, p) {
    for (var a = 0; a < 3; a++) {
      if (p[a] < b.min[a]) b.min[a] = p[a];
      if (p[a] > b.max[a]) b.max[a] = p[a];
    }
  }

  /* THE AXIS SWAP, and it lives here and nowhere else.
   *
   * glTF gives +Y up and +Z front. bayGeometry and the ground basis want
   * +Z UP OUT OF THE GROUND — the floor is at a negative z, headroom is
   * measured up in z, berths spread across x and y. Ships never needed this
   * because the renderer's own convention is +y up; ports do because their
   * frame was written from the ground upward.
   *
   * A PROPER ROTATION, not an exchange. The obvious (x, y, z) -> (x, z, y)
   * is a reflection: determinant -1, which mirrors the model and inverts
   * every face winding, so a shed would come out inside-out and lit from
   * the wrong side. Negating the new y makes it a -90 degree rotation about
   * x instead, determinant +1, which is a rotation and changes nothing but
   * the axis names. glTF front (+Z) therefore becomes the bay's -Y. */
  function toGame(p) { return [p[0], -p[2], p[1]]; }

  function walk(nodeIdx, parentMat, inInterior, inSpin, anchors, inOmit, parentIdx, inGate, inOpen, inCarry, inEntr, inMover, inBore, inCar, inHatch) {
    var node = j.nodes[nodeIdx];
    var local = node.matrix ? node.matrix.slice()
                            : matFromTRS(node.translation, node.rotation, node.scale);
    var world = matMul(parentMat, local);
    var name = node.name || '';
    var mo = node.extras && node.extras.motion;
    var carKey = inCar || null;
    if (!carKey && mo && mo.kind === 'lift' && typeof mo.from === 'number' &&
        typeof mo.to === 'number' && /^[xyz]$/.test(mo.axis || '')) {
      carKey = name;
      var ax = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[mo.axis];
      var dl = mo.to - mo.from;
      var q0 = toGame(matApply(parentMat, [0, 0, 0]));
      var q1 = toGame(matApply(parentMat, [ax[0] * dl, ax[1] * dl, ax[2] * dl]));
      cars[carKey] = box();
      cars[carKey].node = name;
      cars[carKey].d = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
      var cmk = CARRIER_RE.exec(name);
      cars[carKey].key = cmk ? cmk[1].toLowerCase() : null;
    }
    /* A YARD CARRIAGE IS A CAR (2026-11-03). Astra at Halden Yard, of the
     * civil yards' 45-degree carriages: "left elevator protrudes ... with a
     * cut in the floor there for the elevator to come up through. When the
     * elevator is not there, there should be a blast door covering the
     * shaft", and "the bottom of that shaft needs to be flush with the
     * floor, so the elevator comes down and locks into the floor ... placed
     * too high on the right and too high on the left". The carriage halls'
     * S/M bays (and the cargo cars beside them) declare their run as
     * `carriage: {dir, travel}` in the bay's parent (hall) frame, and
     * nothing read it: the carriage stayed where the art left it, parked in
     * its storage level over the hall's crown or under its floor, and the
     * hull was carried up the incline to stand on the RAIL above it. Now
     * the bay group is a car like the ring's lift, its own faces claimed
     * face by face (a box would take the rail its bogie runs on with it),
     * with `d` its run to the hall end; Render.carriageFit fits that run to
     * the hall's floor and Sim rides the hull on its deck. */
    var cxr = node.extras && node.extras.carriage;
    if (!carKey && cxr && Array.isArray(cxr.dir) && cxr.dir.length === 3 && typeof cxr.travel === 'number') {
      carKey = name;
      var cq0 = toGame(matApply(parentMat, [0, 0, 0]));
      var cq1 = toGame(matApply(parentMat, [cxr.dir[0] * cxr.travel, cxr.dir[1] * cxr.travel, cxr.dir[2] * cxr.travel]));
      cars[carKey] = box();
      cars[carKey].node = name;
      cars[carKey].d = [cq1[0] - cq0[0], cq1[1] - cq0[1], cq1[2] - cq0[2]];
      cars[carKey].key = null;
      cars[carKey].carriage = { fromAbove: !!cxr.fromAbove, hatch: typeof cxr.hatch === 'string' ? cxr.hatch : null,
                                cargo: !!node.extras.cargoCar };
    }
    if (parentIdx === -1 && !rootMat) rootMat = world;
    /* A bore: named as one, and never the car inside it (the car is a
     * mover, drawn on its own and clipped by its stops). */
    var boreHere = (inBore === undefined || inBore === null) ? -1 : inBore;
    if (boreHere < 0 && BORE_RE.test(name)) { boreHere = bores.length; bores.push({ node: name }); }
    /* A MOVER starts here when this node declares motion; its unnamed parts
     * ride with it. Never the scene root: the cradle's root carries a
     * `lift` block describing the whole station's hoist, and a station is
     * not a car. */
    var mvHere = inMover || null;
    var mxx = node.extras;
    if (!mvHere && parentIdx !== -1 && mxx && typeof mxx === 'object' &&
        ((mxx.lift && typeof mxx.lift === 'object') || (mxx.motion && typeof mxx.motion === 'object') ||
         mxx.rampCar === true)) {
      mvHere = box();
      mvHere.node = name;
      mvHere.nodeIdx = nodeIdx;
      mvHere.parentIdx = parentIdx;
      mvHere.local = local;
      mvHere.parentMat = parentMat;
      mvHere.extras = mxx;
      movers.push(mvHere);
    }
    /* Anything that opens: leaves, gates, fields, hatches. Drawn like any
     * other geometry, but left out of the voxel grid the interior routes
     * are found in — a route runs through doors with the doors open. A
     * mover is left out too: its swept volume is added back as the ride. */
    var openHere = inOpen || OPENABLE_RE.test(name) || !!mvHere || MOVER_NAME_RE.test(name);
    /* A CARRIER: a lift, a hoist, a conveyor, a shaft. Its whole volume is
     * somewhere a hull can be taken, decks and all — a lift car IS the hole
     * in the floor (Astra, 24-09: "angled cargo elevators to move the S and
     * M sized ships to their berths"). Grouped by stem so a shaft modelled
     * as four thin walls becomes one volume. */
    var cm = CARRIER_RE.exec(name), ckey = inCarry || null;
    if (cm) {
      ckey = cm[1].toLowerCase();
      if (!carriers[ckey]) carriers[ckey] = box();
    }
    /* A car that DECLARES its travel (`lift.travel`, the pad sites' 45
     * degree incline) sweeps its whole run, not just the landing it was
     * exported at: the car is drawn at the top, and the hull rides it to
     * the bottom. Swept after the walk, once the car's own box is known. */
    var lx = node.extras && node.extras.lift;
    if (ckey && lx && lx.travel && typeof lx.travel === 'object') {
      var o0 = toGame(matApply(parentMat, [0, 0, 0]));
      var o1 = toGame(matApply(parentMat, [+lx.travel.x || 0, +lx.travel.y || 0, +lx.travel.z || 0]));
      sweeps.push({ key: ckey, d: [o1[0] - o0[0], o1[1] - o0[1], o1[2] - o0[2]] });
    }
    var ekey = inEntr || null;
    var al = node.extras && node.extras.airlock;
    if (!ekey && al && al.outerOpensOn === 'dockingClearance' && !/^berth/i.test(name)) {
      ekey = name;
      entrances[ekey] = box();
      entrances[ekey].node = name;
      if (node.extras.clearOpening) entrances[ekey].opening = node.extras.clearOpening;
    }

    /* Inherited, like every other classification here: a named parent takes
     * its unnamed children with it, which is how a stand leg made of six
     * unnamed pieces goes away as one leg. */
    /* A reference volume is omitted from the picture but NOT inherited as
     * omitted — it has no children today, and if one ever grows some they
     * are geometry until they say otherwise. PORT_OMIT_RE keeps inheriting,
     * because a stand leg's six unnamed pieces go away with the leg. */
    var omit = inOmit || PORT_OMIT_RE.test(name) || PORT_REFERENCE_RE.test(name);
    var inOmitNext = inOmit || PORT_OMIT_RE.test(name);
    /* A car is never "interior": it is the floor a ship stands on, and it
     * has to be drawn wherever that ship can be seen from - which, with the
     * cutaway, is from outside too. Same lesson as the lift-car fix of
     * 2026-10-13, now by declaration rather than by name. */
    /* A HATCH TAKES ITS CHILDREN (2026-11-03): the yards' track leaves are
     * `trackNLeafF`/`LeafA` groups tagged `hatch`, their plates two unnamed
     * meshes under them, so the tag on the group claimed no face at all and
     * the leaves stayed welded into the hall. */
    var hatchKey = inHatch || ((node.extras && node.extras.hatch === true) ? name : null);
    /* A car and a hatch are never "interior" either, for the same reason:
     * the yards' carriages and their hatches were in the interior bucket
     * with the rest of the hall, which nothing ever moves (portDoors splits
     * moving parts out of the shell). */
    var interior = !mvHere && !carKey && !hatchKey && (inInterior || PORT_INTERIOR_RE.test(name));
    var spin = inSpin || PORT_SPIN_RE.test(name);

    /* glTF `extras` is where three.js's GLTFExporter puts userData, and
     * userData is where STATIONS.md keeps the airlock's gate sequence — the
     * one part of the design that is behaviour rather than geometry. Carried
     * through verbatim: this file has no business interpreting it, and the
     * game layer that drives the doors is the thing that should. */
    if (node.extras && typeof node.extras === 'object') {
      extras.push({ name: name, data: node.extras });
    }

    /* Anchors are inherited the same way geometry classification is: a named
     * parent's unnamed children add to ITS box, so a multi-part berth stays
     * one berth. A named node inside another named node opens its own. */
    var mine = anchors;
    var k;
    for (k in PORT_SINGLE) {
      if (PORT_SINGLE[k].test(name)) {
        if (!single[k]) single[k] = box();
        mine = single[k];
      }
    }
    /* A BERTH DECLARED BY ITS OWN GROUP (the 22-09 designs). Their bays
     * carry `berthKind` in extras and many have no throat panels at all —
     * the spine's toothed sliders, the refinery's curtained chambers, the
     * yard's garages, the ring's heavy bay — so the throat rule above never
     * saw them. The group node's own axes are the bay's frame (+Z out
     * through the door, +Y up), exactly as for the throat berths. Kept as a
     * candidate: if the same group turns out to hold throat panels, those
     * win and this is dropped (see the merge after the walk). */
    if (BERTH_GROUP_RE.test(name) && node.extras && node.extras.berthKind) {
      var gb = box();
      gb.mat = world; gb.node = name; gb.idx = nodeIdx; gb.kind = node.extras.berthKind;
      /* The bay the art says a ship leaves by. Read by interiorRoutes for
       * a HEAVY bay that is itself inside the station (see there). */
      if (typeof node.extras.exitVia === 'string') gb.exitVia = node.extras.exitVia;
      /* THE ROUTE THE ART DECLARES (24-09 evening civil yard, and the new
       * cylinders): `dockPath` runs from the bay out through its exitVia
       * bay's mouth, in the root's frame; a carriage bay adds
       * `carriage.raised`, the carriage's track point, in the bay's parent
       * frame. Kept in game axes here and used only where the voxel router
       * cannot find a way — a carriage is a moving floor, and the router
       * only knows fixed ones. */
      if (Array.isArray(node.extras.dockPath) && rootMat) {
        gb.declaredRaw = node.extras.dockPath.filter(function (q) {
          return Array.isArray(q) && q.length === 3;
        }).map(function (q) { return toGame(matApply(rootMat, q)); });
      }
      var cx = node.extras.carriage;
      if (cx && Array.isArray(cx.raised) && cx.raised.length === 3) {
        gb.carriageRaw = toGame(matApply(parentMat, cx.raised));
      }
      groups.push(gb);
      mine = gb;
    }
    var gateHere = false;
    for (k in PORT_MULTI) {
      /* ONE LEAF, ONE GATE. A leaf group's own door plate is also called
       * a door (`…BlastDoorL` inside `leafGroup_…_L`); opening a second
       * gate for it would split one moving part in two and leave the
       * chevrons behind when it slid. */
      if (k === 'gates' && inGate) continue;
      if (PORT_MULTI[k].test(name)) {
        if (k === 'gates') gateHere = true;
        /* SEVERAL NODES, ONE ANCHOR. A berth arrives as five separate
         * throat panels (see PORT_MULTI.berths), and taking each as its own
         * instance would report a one-bay cylinder as having five. Panels
         * that share a berth tag share a box: `berthSM0LThroatFloor` and
         * `berthSM0LThroatBack` both reduce to `berthSM0L`.
         *
         * Only the berths merge. Everything else in PORT_MULTI is genuinely
         * one box per node — four door leaves ARE four leaves — so
         * mergeKey returns null for them and the old behaviour stands. */
        var mk = mergeKey(k, name, parentIdx);
        if (mk && merged[mk]) {
          var have = merged[mk];
          /* THE REFERENCE VOLUME WINS, and it is not merely a tie-break.
           *
           * The panels LINE the throat, so their union is the aperture plus
           * a wall thickness all round — a bay measured that way reads
           * bigger than the hole a hull has to fly through, and this number
           * decides whether a hull fits. Erring large is the dangerous
           * direction: it says yes to a ship that would hit the jamb.
           *
           * So when the true volume turns up, it replaces whatever the
           * panels had accumulated and locks the box; panels seen
           * afterwards are measured into a scratch box and discarded. When
           * no reference volume is present — every model exported before
           * the exporter was fixed — the panel union stands, which is what
           * the bays are measured from today. */
          if (isReference(name) && !have.authoritative) {
            have.min = [Infinity, Infinity, Infinity];
            have.max = [-Infinity, -Infinity, -Infinity];
            have.mat = world;
            have.node = name;
            have.authoritative = true;
            mine = have;
          } else if (have.authoritative && !isReference(name)) {
            mine = box();                    // measured nowhere, deliberately
          } else {
            mine = have;
          }
          continue;
        }
        var b = box();
        if (mk) { merged[mk] = b; b.authoritative = isReference(name); }
        /* THE NODE'S OWN ORIENTATION, kept alongside its bounds.
         *
         * A bounding box has no direction, and for a berth the direction is
         * the whole question — STATIONS.md's approach-corridor check casts
         * its rays along "the group's local +Z", and a spine station has
         * berths facing opposite ways while a cylinder's face inward. Take
         * only the bounds and every berth comes out pointing the same way,
         * which is worse than useless: it would say a ship can fly into a
         * bay it would actually hit the far wall of.
         *
         * So the transform is carried here and reduced to a unit vector at
         * output. It is the one piece of information this tool was throwing
         * away that the simulation cannot reconstruct. */
        b.mat = world;
        b.node = name;
        /* A leaf group carries its own travel (`doorLeaf.travel`, in the
         * model's own units). Kept raw and scaled on the way out, because
         * the art's number is the distance the builder actually animates —
         * better than any distance measured back off a stowed leaf. */
        if (k === 'gates' && node.extras && node.extras.doorLeaf &&
            typeof node.extras.doorLeaf.travel === 'number') {
          b.travelRaw = node.extras.doorLeaf.travel;
        }
        /* THE 22-09 DIALECT: a telescoping pair of leaves per side
         * (`SlidingDoorL1`, `SlidingDoorL2`), each carrying the two stops it
         * runs between in its own local X — `door: {openX, closedX}`. The
         * outer leaf of the pair has to run further than the inner one, and
         * measuring either against the centreline gave the outer leaf almost
         * nothing: 110 leaves across the new set reported "does not move".
         * The art's own stops are the travel. */
        if (k === 'gates' && b.travelRaw === undefined && node.extras && node.extras.door &&
            typeof node.extras.door.openX === 'number' && typeof node.extras.door.closedX === 'number') {
          b.travelRaw = Math.abs(node.extras.door.openX - node.extras.door.closedX);
        }
        multi[k].push(b);
        mine = b;
      }
    }

    /* MEASURED EVEN WHEN NOT DRAWN, and the two used to be the same
     * decision. `omit` skipped the whole block, so a node excluded from the
     * mesh contributed nothing to its anchor either — which is fine for a
     * stand leg and wrong for a reference volume, whose entire purpose is
     * to be measured and never painted. Now the vertices are always walked
     * and only the pushing is conditional. */
    if (node.mesh !== undefined) {
      var mesh = j.meshes[node.mesh];
      var into = interior ? inr : (spin ? spn : ext);
      for (var p = 0; p < mesh.primitives.length; p++) {
        var prim = mesh.primitives[p];
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        var pos = accessorData(g, prim.attributes.POSITION);
        var base = into.v.length;
        for (var i = 0; i < pos.length; i++) {
          var w = toGame(matApply(world, pos[i]));
          if (!omit) into.v.push(w);
          if (mine) grow(mine, w);
          if (ckey) grow(carriers[ckey], w);
          if (carKey) grow(cars[carKey], w);
          if (ekey) grow(entrances[ekey], w);
          if (mvHere && !omit) grow(mvHere, w);
        }
        if (omit) continue;                 // measured, deliberately unpainted
        var col = materialColour(g, prim.material);
        var idx = prim.indices !== undefined
          ? accessorData(g, prim.indices)
          : pos.map(function (_, n) { return n; });
        var fStart = into.f.length;
        for (var t = 0; t < idx.length; t += 3) {
          into.f.push([base + idx[t], base + idx[t + 1], base + idx[t + 2]]);
          into.c.push(col);
          into.o.push(openHere ? 1 : 0);
          into.bo.push(mvHere ? -1 : boreHere);
          into.pk.push(-1);
        }
        var bucketName = into === inr ? 'interior' : (into === spn ? 'spin' : 'shell');
        if (carKey) notePart(carKey, 'car', bucketName, fStart, into.f.length, cars[carKey], into);
        else if (hatchKey) {
          /* One box per hatch over all its plates: notePart extends the
           * same part while the run continues, so grow the part's box. */
          var lastP = parts.length ? parts[parts.length - 1] : null;
          var hb = (lastP && lastP.node === hatchKey && lastP.kind === 'hatch') ? lastP.box : box();
          for (var hv = 0; hv < pos.length; hv++) grow(hb, toGame(matApply(world, pos[hv])));
          notePart(hatchKey, 'hatch', bucketName, fStart, into.f.length, hb, into);
        }
      }
    }
    for (var ch = 0; ch < (node.children || []).length; ch++) {
      walk(node.children[ch], world, interior, spin, mine, inOmitNext, nodeIdx,
           inGate || gateHere, openHere, ckey, ekey, mvHere, boreHere, carKey, hatchKey);
    }
  }

  var scene = j.scenes[j.scene || 0];
  for (var r = 0; r < scene.nodes.length; r++) {
    walk(scene.nodes[r], matIdentity(), false, false, null, false, -1);
  }
  movers.forEach(function (mv) { mv.stops = moverStops(mv); });
  movers = movers.filter(function (mv) { return isFinite(mv.min[0]); });

  /* WHERE A CAR CAN GO: its stops, as displacements from where the art left
   * it, in game axes and model units. Read from the declaration, in the
   * dialect each builder wrote:
   *   lift.travel {x,y,z}           ground sites: one run, parent frame
   *   lift.idleY/deckY/surfaceY     the comet platform: stops on parent y
   *   motion {axis:'y', from, to}   ring, skimmer sort lift, spine hub lift
   *   motion {axis:'ramp', from,to} bore cars: along the bore
   *   rampCar (no motion)           the cradle hoist: the whole bore
   * A ramp's direction is the parent's declared `ramp` (a -> b) where there
   * is one, else the bore's own long axis, measured in the bore's frame -
   * the bore is modelled straight and then turned, so its local box is
   * tight where its world box is a useless 45-degree square. */
  function moverStops(mv) {
    var ex = mv.extras || {}, L = ex.lift, M = ex.motion;
    var cur = [mv.local[12], mv.local[13], mv.local[14]];
    var a0 = toGame(matApply(mv.parentMat, cur));
    function at(localPt) {
      var p = toGame(matApply(mv.parentMat, localPt));
      return [p[0] - a0[0], p[1] - a0[1], p[2] - a0[2]];
    }
    var out = [[0, 0, 0]];
    if (L && L.travel && typeof L.travel === 'object') {
      out.push(at([cur[0] + (+L.travel.x || 0), cur[1] + (+L.travel.y || 0), cur[2] + (+L.travel.z || 0)]));
      return out;
    }
    if (L && typeof L.idleY === 'number') {
      ['idleY', 'deckY', 'surfaceY', 'raisedY', 'loweredY'].forEach(function (k) {
        if (typeof L[k] === 'number') out.push(at([cur[0], L[k], cur[2]]));
      });
      return out;
    }
    if (M && M.axis === 'y' && typeof M.from === 'number' && typeof M.to === 'number') {
      out.push(at([cur[0], M.from, cur[2]]), at([cur[0], M.to, cur[2]]));
      return out;
    }
    /* Ramps: the bore's direction and extent in the PARENT's frame. */
    var bore = boreAxis(mv.parentIdx);
    if (!bore) return out;
    var s0 = (cur[0] - bore.c[0]) * bore.d[0] + (cur[1] - bore.c[1]) * bore.d[1] + (cur[2] - bore.c[2]) * bore.d[2];
    function along(s) {
      return at([cur[0] + bore.d[0] * (s - s0), cur[1] + bore.d[1] * (s - s0), cur[2] + bore.d[2] * (s - s0)]);
    }
    /* A declared ramp run is trusted when it is a real fraction of the
     * bore. The skimmer's hoist car says -1.9 -> 1.7 in a 26-unit bore -
     * a number in some other unit, or the car's own wobble - and taken at
     * its word the car would move 14 metres up a 360-metre ramp. */
    if (M && M.axis === 'ramp' && typeof M.from === 'number' && typeof M.to === 'number' &&
        Math.abs(M.to - M.from) >= 0.25 * 2 * bore.half) {
      out.push(along(M.from), along(M.to));
      return out;
    }
    /* rampCar alone: end to end of the bore, less the car's own length. */
    var carHalf = 0;
    var cb = localBox(mv.nodeIdx, mv.local);
    if (cb) carHalf = Math.abs((cb.max[0] - cb.min[0]) * bore.d[0]) / 2 +
                      Math.abs((cb.max[1] - cb.min[1]) * bore.d[1]) / 2 +
                      Math.abs((cb.max[2] - cb.min[2]) * bore.d[2]) / 2;
    var reach = Math.max(0, bore.half - carHalf);
    out.push(along(-reach), along(reach));
    return out;
  }
  /* The bore a ramp car runs in: the parent's declared ramp, else the long
   * axis of the parent's geometry measured in the parent's own frame. */
  function boreAxis(pIdx) {
    var p = j.nodes[pIdx];
    if (!p) return null;
    var rp = p.extras && p.extras.ramp;
    if (rp && Array.isArray(rp.a) && Array.isArray(rp.b)) {
      var dx = rp.b[0] - rp.a[0], dy = rp.b[1] - rp.a[1], dz = rp.b[2] - rp.a[2];
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l > 1e-9) return { d: [dx / l, dy / l, dz / l], half: l / 2,
                             c: [(rp.a[0] + rp.b[0]) / 2, (rp.a[1] + rp.b[1]) / 2, (rp.a[2] + rp.b[2]) / 2] };
    }
    var b = localBox(pIdx, matIdentity());
    if (!b) return null;
    var sz = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    var ax = sz.indexOf(Math.max(sz[0], sz[1], sz[2]));
    var d = [0, 0, 0]; d[ax] = 1;
    return { d: d, half: sz[ax] / 2,
             c: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] };
  }
  /* A subtree's bounds in the frame `base` maps it into (identity: the
   * node's own frame; the node's local matrix: its parent's). */
  function localBox(idx, base) {
    var bb = box(), any = false;
    (function lw(i, m) {
      var n = j.nodes[i];
      if (n.mesh !== undefined) {
        j.meshes[n.mesh].primitives.forEach(function (pr) {
          if (pr.mode !== undefined && pr.mode !== 4) return;
          accessorData(g, pr.attributes.POSITION).forEach(function (q) { grow(bb, matApply(m, q)); any = true; });
        });
      }
      (n.children || []).forEach(function (c) {
        var cn = j.nodes[c];
        lw(c, matMul(m, cn.matrix ? cn.matrix.slice() : matFromTRS(cn.translation, cn.rotation, cn.scale)));
      });
    })(idx, base);
    return any ? bb : null;
  }
  sweeps.forEach(function (s) {
    var b = carriers[s.key];
    if (!b || !isFinite(b.min[0])) return;
    grow(b, [b.min[0] + s.d[0], b.min[1] + s.d[1], b.min[2] + s.d[2]]);
    grow(b, [b.max[0] + s.d[0], b.max[1] + s.d[1], b.max[2] + s.d[2]]);
  });

  /* Group-declared berths join the list only where the group held no throat
   * panels; where it did, the throat berth stands and just learns its kind.
   * Every berth also learns its CLASS from its name — `berthL…` is a heavy
   * bay, `berthSM…` a small/medium one — which is what the interior routes
   * below are keyed on. */
  var groupByIdx = {};
  groups.forEach(function (gb2) { groupByIdx[gb2.idx] = gb2; });
  multi.berths.forEach(function (b0) {
    for (var mk2 in merged) {
      if (merged[mk2] === b0) {
        var gidx = +mk2.split('|')[1];
        if (groupByIdx[gidx]) {
          b0.kind = groupByIdx[gidx].kind;
          if (groupByIdx[gidx].exitVia) b0.exitVia = groupByIdx[gidx].exitVia;
          if (groupByIdx[gidx].declaredRaw) b0.declaredRaw = groupByIdx[gidx].declaredRaw;
          if (groupByIdx[gidx].carriageRaw) b0.carriageRaw = groupByIdx[gidx].carriageRaw;
          groupByIdx[gidx].claimed = true;
        }
      }
    }
  });
  groups.forEach(function (gb3) {
    if (!gb3.claimed && isFinite(gb3.min[0])) multi.berths.push(gb3);
  });
  multi.berths.forEach(function (b1) {
    var nm = String(b1.node || '');
    b1.cls = /^berthL/.test(nm) ? 'L' : (/^berthSM/.test(nm) ? 'SM' : null);
  });

  /* ---- scale, and where the origin is ----------------------------------
   * A surface bay is measured in PAD RADII, which is a gameplay quantity
   * and not a bounding box — so the model declares it with `portPad` and
   * everything else falls out. An orbital station has no pad and normalises
   * to radius 1 off its own bounds, which is what the procedural stations
   * already do. */
  /* ---- STAND IT UP THE WAY THE GAME STANDS STATIONS -----------------------
   *
   * The game's port frame has +z up: a berth's deck is below it on z, the
   * camera clamps against z, and a station that turns, turns about z.
   * Every model before 2026-09-21 was built that way round. The new
   * cylinder is not — it lies on its side, its bays ringing a bore that
   * runs along y, every bay's up pointing down that bore — so parked hulls
   * stood on their tails against a deck the game was looking for on z, and
   * the whole station would have tumbled end over end instead of turning
   * on its long axis.
   *
   * So if EVERY berth agrees on an up, and it is a world axis that is not
   * +z, the model is turned a quarter or half turn to make it +z. Only
   * then, and only by a right angle: a rotation by a multiple of 90
   * degrees keeps every axis-aligned box axis-aligned, so no anchor has to
   * be re-measured, and a model whose bays disagree about up is left
   * exactly as its maker built it. */
  var fix = standUp(multi.berths);
  if (fix) {
    [ext, inr, spn].forEach(function (bucket) {
      for (var q = 0; q < bucket.v.length; q++) bucket.v[q] = fix(bucket.v[q]);
    });
    var fixBox = function (b) {
      if (!b || !isFinite(b.min[0])) return;
      var c1 = fix(b.min), c2 = fix(b.max);
      b.min = [Math.min(c1[0], c2[0]), Math.min(c1[1], c2[1]), Math.min(c1[2], c2[2])];
      b.max = [Math.max(c1[0], c2[0]), Math.max(c1[1], c2[1]), Math.max(c1[2], c2[2])];
      b.fix = fix;
    };
    for (var sk in single) fixBox(single[sk]);
    for (var mk2 in multi) multi[mk2].forEach(fixBox);
    for (var ck2 in carriers) fixBox(carriers[ck2]);
    for (var ek2 in entrances) fixBox(entrances[ek2]);
    /* A stop is a displacement, and fix is a pure rotation, so it turns
     * the same way a point does. */
    movers.forEach(function (mv) {
      fixBox(mv);
      mv.stops = (mv.stops || []).map(function (s) { return fix(s); });
    });
    /* A car's travel is a direction, and `fix` is a right-angle rotation
     * about the origin, so it turns the vector the same way. */
    for (var cr2 in cars) { fixBox(cars[cr2]); cars[cr2].d = fix(cars[cr2].d); }
    /* A car part shares its car's box, fixed just above; a hatch has its own. */
    parts.forEach(function (pt) { if (pt.kind === 'hatch') fixBox(pt.box); });
  }

  var all = ext.v.concat(inr.v, spn.v);
  var mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  for (var i2 = 0; i2 < all.length; i2++) {
    for (var a2 = 0; a2 < 3; a2++) {
      if (all[i2][a2] < mins[a2]) mins[a2] = all[i2][a2];
      if (all[i2][a2] > maxs[a2]) maxs[a2] = all[i2][a2];
    }
  }
  var scale, origin, kind;
  if (single.pad && isFinite(single.pad.min[0])) {
    kind = 'surface';
    var pad = single.pad;
    var halfX = (pad.max[0] - pad.min[0]) / 2;
    scale = 1 / Math.max(halfX, 1e-9);
    /* Centred on the pad in the horizontal, and GROUND LEVEL AT ITS TOP
     * FACE — a pad is a thing you land on, so z = 0 is its surface rather
     * than the middle of the slab. */
    origin = [(pad.min[0] + pad.max[0]) / 2,
              (pad.min[1] + pad.max[1]) / 2,
              pad.max[2]];
  } else {
    kind = 'orbital';
    var span = [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]];
    scale = 1 / Math.max(span[0] / 2, span[1] / 2, span[2] / 2, 1e-9);
    origin = [(maxs[0] + mins[0]) / 2, (maxs[1] + mins[1]) / 2,
              (maxs[2] + mins[2]) / 2];
  }

  var r3 = function (x) { return Math.round(x * 1000) / 1000; };
  function place(p) {
    return [r3((p[0] - origin[0]) * scale),
            r3((p[1] - origin[1]) * scale),
            r3((p[2] - origin[2]) * scale)];
  }
  /* VERTICES AT FIVE PLACES, NOT THREE (2026-10-16). Astra: "internal
   * surfaces in stations appear to flicker. Are they wafer thin, maybe?"
   * They were made so here. Three places of a unit radius is a 4-metre
   * grid on a 4 km station: a caution stripe raised a few centimetres off
   * its deck, a lit panel proud of its wall, the two faces of a thin
   * bulkhead - all snapped into one plane, and two surfaces in one plane
   * z-fight. Measured on cradle-s: 13,766 differently-coloured coplanar
   * overlapping pairs. Five places is 4 cm on the same station. Anchors
   * keep three: they are boxes, and nothing about them is that fine. */
  var r5 = function (x) { return Math.round(x * 100000) / 100000; };
  function placeV(p) {
    return [r5((p[0] - origin[0]) * scale), r5((p[1] - origin[1]) * scale), r5((p[2] - origin[2]) * scale)];
  }
  [ext, inr, spn].forEach(function (bucket) {
    for (var i = 0; i < bucket.v.length; i++) bucket.v[i] = placeV(bucket.v[i]);
  });
  if (kind === 'orbital' && bores.length) clipBores([ext, inr], bores, file);
  var lifted = liftCoplanar([ext, inr, spn]);
  if (lifted) console.log('    lifted ' + lifted + ' flush panel face(s) off the surface beneath');
  partRuns();

  function placedBox(b) {
    if (!b || !isFinite(b.min[0])) return null;
    var toG = b.fix ? function (q) { return b.fix(toGame(q)); } : toGame;
    var lo = place(b.min), hi = place(b.max);
    var out = { min: lo, max: hi,
                mid: [r3((lo[0] + hi[0]) / 2), r3((lo[1] + hi[1]) / 2),
                      r3((lo[2] + hi[2]) / 2)] };
    if (b.node) out.node = b.node;
    if (b.cls) out.cls = b.cls;
    if (b.kind) out.kind = b.kind;
    if (b.exitVia) out.exitVia = b.exitVia;
    /* Declared route points, in the same placed coordinates as the box.
     * Working data for interiorRoutes; stripped before the index is written. */
    var fixP = function (q) { return place(b.fix ? b.fix(q) : q); };
    if (b.declaredRaw && b.declaredRaw.length) out.declared = b.declaredRaw.map(fixP);
    if (b.carriageRaw) out.carriage = fixP(b.carriageRaw);
    if (typeof b.travelRaw === 'number') out.travel = r3(b.travelRaw * scale);
    /* The node's local +Z, in game axes: the direction a ship approaches
     * along. Taken as the DIFFERENCE of two transformed points rather than
     * the matrix's third column, so a node with a negative scale — a
     * mirrored berth, which the ring station's whole upper half is — gives
     * the direction it actually faces rather than the one it would face
     * unmirrored. toGame is a pure rotation, so it is valid on a direction. */
    if (b.mat) {
      var p0 = toG(matApply(b.mat, [0, 0, 0]));
      var p1 = toG(matApply(b.mat, [0, 0, 1]));
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l > 1e-9) out.normal = [r3(dx / l), r3(dy / l), r3(dz / l)];
      /* And the node's local +Y — the bay's own UP, its deck-to-ceiling
       * direction. Every berth before 2026-09-21 had it equal to game +z,
       * which is why nothing asked. The cylinder's bays ring its bore, so
       * each one's deck faces a different way. */
      var p2 = toG(matApply(b.mat, [0, 1, 0]));
      var ux = p2[0] - p0[0], uy = p2[1] - p0[1], uz = p2[2] - p0[2];
      var ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
      if (ul > 1e-9) out.up = [r3(ux / ul), r3(uy / ul), r3(uz / ul)];
    }
    return out;
  }

  function palette(cols) {
    var pal = [], palIdx = {};
    var ci = cols.map(function (col) {
      if (palIdx[col] === undefined) { palIdx[col] = pal.length; pal.push(col); }
      return palIdx[col];
    });
    return { pal: pal, ci: ci };
  }
  var pe = palette(ext.c);
  var out = { kind: kind, v: ext.v, f: ext.f, pal: pe.pal, ci: pe.ci };
  if (inr.f.length) {
    var pi2 = palette(inr.c);
    out.interior = { v: inr.v, f: inr.f, pal: pi2.pal, ci: pi2.ci };
  }
  if (spn.f.length) {
    var ps2 = palette(spn.c);
    out.spin = { v: spn.v, f: spn.f, pal: ps2.pal, ci: ps2.ci };
  }

  /* Berths and docks are SORTED before numbering, left to right then along.
   * glTF node order is whatever the authoring tool happened to write, and
   * letting that decide which berth is berth 0 would move a parked ship
   * every time a model was re-exported — the same reason the muzzles are
   * sorted rather than taken in file order. */
  function sortedBoxes(list) {
    return list.map(placedBox).filter(Boolean).sort(function (p, q) {
      return p.mid[0] - q.mid[0] || p.mid[1] - q.mid[1] || p.mid[2] - q.mid[2];
    });
  }
  var anchors = {};
  for (key in PORT_MULTI) {
    var got = sortedBoxes(multi[key]);
    if (got.length) anchors[key] = got;
  }
  for (key in PORT_SINGLE) {
    var one = placedBox(single[key]);
    if (one) anchors[key] = one;
  }
  /* The routes from the heavy bays to the small ones, where the model has
   * both (see interiorRoutes). Orbital stations only: a ground port's bays
   * are reached down its own shaft. */
  /* A GARAGE'S BERTH IS BEHIND ITS DOOR (24-09). The yards declare each
   * heavy garage as a group holding the door frame — jambs, lintel, sill,
   * nav lights — and the slatted leaves, so the group's box is the frame,
   * proud of the hull OUTSIDE the leaves, and a hull parked at its middle
   * sat in the doorway with the garage (0.47 radii deep, measured) empty
   * behind it and no door between it and space. So the box is moved in
   * along the berth's normal to lie behind the leaves, keeping its size:
   * the leaves become its outer gate like every other bay's. */
  /* The gates here are the garage's SLATS (see PORT_MULTI.gates): a
   * roll-up door, which render.js draws as there-or-not like a field
   * rather than sliding each slat sideways. */
  (anchors.berths || []).forEach(function (b) {
    if (b.kind !== 'garage' || !b.normal || !b.node || !anchors.gates) return;
    var leaves = anchors.gates.filter(function (g) { return g.node && g.node.indexOf(b.node + 'Leaf') === 0; });
    if (!leaves.length) return;
    var n = b.normal, lm = [0, 1, 2].map(function (k) {
      return leaves.reduce(function (s, g) { return s + g.mid[k]; }, 0) / leaves.length;
    });
    var d = (b.mid[0] - lm[0]) * n[0] + (b.mid[1] - lm[1]) * n[1] + (b.mid[2] - lm[2]) * n[2];
    if (!(d > -1e-3)) return;                    // already behind its door
    var depth = Math.abs(n[0]) * (b.max[0] - b.min[0]) + Math.abs(n[1]) * (b.max[1] - b.min[1]) +
                Math.abs(n[2]) * (b.max[2] - b.min[2]);
    var s = -(d + depth / 2);
    for (var k = 0; k < 3; k++) {
      b.min[k] = r3(b.min[k] + n[k] * s); b.max[k] = r3(b.max[k] + n[k] * s); b.mid[k] = r3(b.mid[k] + n[k] * s);
    }
  });
  if (anchors.berths) anchors.berths.sort(function (p, q) {
    return p.mid[0] - q.mid[0] || p.mid[1] - q.mid[1] || p.mid[2] - q.mid[2];
  });

  var routed = 0;
  var carried = Object.keys(carriers).map(function (ck) {
    var pb = placedBox(carriers[ck]);
    if (pb) pb.key = ck;
    return pb;
  }).filter(Boolean);
  if (process.env.ROUTE_DEBUG) carried.forEach(function (c) {
    console.log('    carrier ' + c.key + ' ' + JSON.stringify(c.min) + ' .. ' + JSON.stringify(c.max));
  });
  var doorList = Object.keys(entrances).map(function (ek) {
    var pb = placedBox(entrances[ek]);
    if (pb) { pb.node = ek; if (entrances[ek].opening) pb.opening = entrances[ek].opening; }
    return pb;
  }).filter(Boolean).sort(function (p, q) {
    return p.mid[0] - q.mid[0] || p.mid[1] - q.mid[1] || p.mid[2] - q.mid[2];
  });
  /* THE MOVERS, placed: the car's box, the line it runs on (a unit axis in
   * the normalised frame) and how far along it, either way, it can go from
   * where the art left it. Every stop the art declares lies on one line -
   * a lift is a lift - so two numbers say it all. A car with nowhere to go
   * (no stops beyond its own) is still a mover: drawn, never interior. */
  var moverOut = movers.map(function (mv) {
    var pb = placedBox(mv);
    if (!pb) return null;
    pb.node = mv.node;
    var st = (mv.stops || [[0, 0, 0]]).map(function (s) { return [s[0] * scale, s[1] * scale, s[2] * scale]; });
    var far = null, fd = 0;
    st.forEach(function (s) { var d = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]); if (d > fd) { fd = d; far = s; } });
    if (far && fd > 1e-4) {
      var ax = [far[0] / fd, far[1] / fd, far[2] / fd];
      var lo2 = 0, hi2 = 0;
      st.forEach(function (s) { var p = s[0] * ax[0] + s[1] * ax[1] + s[2] * ax[2]; lo2 = Math.min(lo2, p); hi2 = Math.max(hi2, p); });
      pb.axis = [r3(ax[0]), r3(ax[1]), r3(ax[2])];
      pb.range = [r3(lo2), r3(hi2)];
    }
    if (mv.extras && mv.extras.lift && Array.isArray(mv.extras.lift.servesSizes)) pb.serves = mv.extras.lift.servesSizes.slice();
    return pb;
  }).filter(Boolean);
  if (moverOut.length) out.movers = moverOut;

  /* WHAT A ROUTE MAY RIDE. Where the model declares movers, the ride is
   * each car's own path - a capsule round the line its centre runs on -
   * and nothing else. The old carriers were whole named groups (`shaft`,
   * `hoist`, `lift`) taken as axis-aligned boxes, walls and all, and for a
   * 45-degree bore that box is a square the size of the bore's run: the
   * route-finder treated everything inside it as open and cut straight
   * through the hull. Models with no declared movers keep the carriers,
   * so nothing that routed before stops routing for want of a car. */
  var rides = moverOut.filter(function (m) { return m.axis && m.range[1] - m.range[0] > 1e-3; }).map(function (m) {
    var a = [m.mid[0] + m.axis[0] * m.range[0], m.mid[1] + m.axis[1] * m.range[0], m.mid[2] + m.axis[2] * m.range[0]];
    var b = [m.mid[0] + m.axis[0] * m.range[1], m.mid[1] + m.axis[1] * m.range[1], m.mid[2] + m.axis[2] * m.range[1]];
    var hx = (m.max[0] - m.min[0]) / 2, hy = (m.max[1] - m.min[1]) / 2, hz = (m.max[2] - m.min[2]) / 2;
    /* Radius: the car's half-size across the run, so the ride is as wide
     * as the floor that carries it and no wider. */
    var ax = m.axis, across = Math.sqrt(Math.max(0,
      hx * hx * (1 - ax[0] * ax[0]) + hy * hy * (1 - ax[1] * ax[1]) + hz * hz * (1 - ax[2] * ax[2])) / 2);
    return { key: 'mover:' + m.node, a: a, b: b, r: Math.max(across, 0.004), hz: hz,
             min: [Math.min(a[0], b[0]) - across, Math.min(a[1], b[1]) - across, Math.min(a[2], b[2]) - across],
             max: [Math.max(a[0], b[0]) + across, Math.max(a[1], b[1]) + across, Math.max(a[2], b[2]) + across] };
  });
  var routeCarried = rides.length ? rides : carried;
  if (kind === 'orbital' && anchors.berths) routed = interiorRoutes([ext, inr], anchors.berths, routeCarried, doorList);
  /* The art's declared routes are working data for the router, not index. */
  (anchors.berths || []).forEach(function (b) { delete b.declared; delete b.carriage; });
  if (carried.length) out.carriers = carried.map(function (c) { return { min: c.min, max: c.max, key: c.key }; });
  /* The cars, at their exported position, with the run to the far end of
   * their travel as `d` in the same normalised units (a vector, so scaled
   * but not moved by the origin). */
  var carList = Object.keys(cars).map(function (cn) {
    var pb = placedBox(cars[cn]);
    if (!pb) return null;
    var dv = cars[cn].d;
    var co = { node: cars[cn].node, key: cars[cn].key, min: pb.min, max: pb.max, mid: pb.mid,
               d: [r3(dv[0] * scale), r3(dv[1] * scale), r3(dv[2] * scale)] };
    if (cars[cn].carriage) co.carriage = cars[cn].carriage;
    return co;
  }).filter(Boolean);
  if (carList.length) out.cars = carList;
  /* And the faces each car and hatch owns, as [from, to) runs into its
   * bucket's face list, with where it is so the game can tell whose it is. */
  var partList = parts.map(function (pt) {
    var pb = placedBox(pt.box);
    return pb ? { node: pt.node, kind: pt.kind, bucket: pt.bucket, r: pt.r, mid: pb.mid } : null;
  }).filter(Boolean);
  if (partList.length) out.parts = partList;
  /* The model's own metres per normalised unit, so a shaft spec can be
   * handed back to the builder in the units it was drawn in. */
  out.metresPerUnit = Math.round(1000 / scale) / 1000;
  out.origin = origin.map(function (v) { return Math.round(v * 1000) / 1000; });   // game axes, model units
  if (doorList.length) out.entrances = doorList.map(function (d) {
    var e = { node: d.node, min: d.min, max: d.max, mid: d.mid, normal: d.normal || [0, 0, 1] };
    if (d.opening) e.opening = d.opening;
    return e;
  });

  /* ---- the numbers the simulation actually reads -----------------------
   * Derived here rather than in the game, so generate.js gets the same
   * shape bayGeometry already hands out and does not have to learn what a
   * bounding box is. Anything the model did not declare is simply absent
   * and the existing constant is used instead. */
  var geom = {};
  if (anchors.floor) geom.floorZ = anchors.floor.max[2];
  if (anchors.ceiling) geom.ceilZ = anchors.ceiling.min[2];
  if (anchors.mouth) {
    geom.mouthR = r3(Math.max(anchors.mouth.max[0] - anchors.mouth.mid[0],
                              anchors.mouth.max[1] - anchors.mouth.mid[1]));
  }
  if (anchors.chamber) {
    geom.chamberX = r3(anchors.chamber.max[0] - anchors.chamber.mid[0]);
    geom.chamberY = r3(anchors.chamber.max[1] - anchors.chamber.mid[1]);
  }
  if (anchors.berths) geom.berths = anchors.berths.length;
  if (Object.keys(geom).length) out.geom = geom;
  if (Object.keys(anchors).length) out.anchors = anchors;

  /* Whatever the design attached as userData, carried through untouched.
   * STATIONS.md keeps the airlock's gate sequence there — which gate is the
   * outer one, that it only cycles when the bay is occupied, that pilot
   * control is withheld until it is fully open — and that is behaviour, not
   * geometry. This file should not have an opinion about it; the game layer
   * that drives the doors should. */
  if (extras.length) out.extras = extras;

  /* ---- and a sanity pass, because these anchors are load-bearing -------
   * A ship's muzzle in the wrong place is a cosmetic bug. A berth outside
   * its own shed parks a ship inside a wall, and a ceiling under its floor
   * gives the camera clamp a negative interval to solve. Warned rather than
   * thrown: a half-finished model should still convert so it can be looked
   * at, and the modeller should be TOLD rather than left to find out by
   * flying into it. */
  out.warnings = [];
  if (kind === 'surface' && !anchors.pad) out.warnings.push('no portPad — scale is a guess');
  if (geom.floorZ !== undefined && geom.ceilZ !== undefined &&
      geom.ceilZ <= geom.floorZ) {
    out.warnings.push('bayCeiling is at or below bayFloor (' +
                      geom.floorZ + ' -> ' + geom.ceilZ + ')');
  }
  if (anchors.berths && geom.chamberX !== undefined) {
    var stray = anchors.berths.filter(function (b) {
      return Math.abs(b.mid[0]) > geom.chamberX + 0.05 ||
             Math.abs(b.mid[1]) > (geom.chamberY || Infinity) + 0.05;
    }).length;
    if (stray) out.warnings.push(stray + ' berth(s) outside bayChamber');
  }
  if (kind === 'surface' && !anchors.berths) {
    out.warnings.push('no berths — ships will fall back to the shared table');
  }
  if (anchors.berths) {
    var smN = anchors.berths.filter(function (b) { return b.cls === 'SM'; }).length;
    var lN = anchors.berths.filter(function (b) { return b.cls === 'L'; }).length;
    if (lN && smN && routed < smN) out.warnings.push((smN - routed) + ' of ' + smN + ' S/M berth(s) have no route in from an L bay');
    out.routes = routed;
  }
  if (!out.warnings.length) delete out.warnings;
  return out;
}

/* ---- the whole folder --------------------------------------------------- */
var files = fs.readdirSync(srcDir).filter(function (f2) { return /\.glb$/i.test(f2); }).sort();
if (!files.length) { console.error('no .glb files in ' + srcDir); process.exit(1); }

var lib = {};
for (var fi = 0; fi < files.length; fi++) {
  var id = files[fi].replace(/\.glb$/i, '');
  if (PORTS) {
    var pm = convertPort(path.join(srcDir, files[fi]));
    lib[id] = pm;
    var bits = [pm.kind, pm.v.length + ' verts', pm.f.length + ' tris'];
    if (pm.interior) bits.push('interior ' + pm.interior.f.length);
    if (pm.spin) bits.push('spin ' + pm.spin.f.length);
    var an = pm.anchors || {};
    if (an.berths) bits.push(an.berths.length + ' berths');
    if (an.docks) bits.push(an.docks.length + ' docks');
    if (an.signs) bits.push(an.signs.length + ' signs');
    if (pm.routes) bits.push(pm.routes + ' S/M routed via L');
    if (pm.geom) {
      bits.push('floorZ ' + (pm.geom.floorZ === undefined ? '-' : pm.geom.floorZ));
      bits.push('mouthR ' + (pm.geom.mouthR === undefined ? '-' : pm.geom.mouthR));
    }
    console.log(id.padEnd(14) + bits.join(', '));
    /* Warnings go out per model and immediately under it, because a wall of
     * models followed by a wall of warnings makes you count lines to find
     * out which one is wrong. */
    (pm.warnings || []).forEach(function (w) { console.log('  ! ' + w); });
    continue;
  }
  var m = convert(path.join(srcDir, files[fi]));
  lib[id] = m;
  console.log(id + ': ' + m.v.length + ' verts, ' + m.f.length + ' tris, ' +
              m.pal.length + ' colours, span ' + m.span.join(' x ') +
              (m.interior ? '   + interior ' + m.interior.f.length + ' tris'
                          : '   NO INTERIOR') +
              (m.glass ? '   glass@' + m.glass.mid.join(',') : '   no glass') +
              /* Reported per model, because "how many legs came out of this
               * hull" is the one number that says whether the rig was
               * found — and a model that silently loses its gear back into
               * the baked mesh looks completely normal in every other line
               * of this output. */
              (m.gear ? '   + ' + m.gear.length + ' hinged' : '   NO GEAR') +
              '   open edges ' + m.seal.open);
  /* An open edge is often harmless (an engine bell's mouth, an upright
   * decal); a column a vertical ray crosses an odd number of times is a
   * hole you can see into from under her, or a lone sheet with nothing
   * behind it, and the hangar's clearance reads her by exactly those rays.
   * Said loudly, under the model, with the parts that do it. */
  var oc = m.seal.cols;
  if (oc.odd.length) {
    var worst = Object.keys(oc.by).sort(function (p, q) { return oc.by[q] - oc.by[p]; }).slice(0, 6);
    console.log('  ! WARNING: skin open to ' + oc.odd.length + ' of ' + oc.columns + ' vertical rays, from ' +
                worst.map(function (k) { return k + ' (' + oc.by[k] + ')'; }).join(', ') +
                (Object.keys(oc.by).length > 6 ? ' ...' : '') + '. See tools/glb-patch.js.');
  }
}
if (!PORTS) {
  var leaky = Object.keys(lib).filter(function (k) { return lib[k].seal && lib[k].seal.cols.odd.length; });
  if (leaky.length) console.log('\n' + leaky.length + ' model(s) with an open skin (odd vertical rays): ' + leaky.join(', '));
}
/* Loud, because a model that arrives without an interior is not an error —
 * it is an older export, and the only way to notice is to be told. */
if (!PORTS) {
  var noInterior = Object.keys(lib).filter(function (k) { return !lib[k].interior; });
  if (noInterior.length) {
    console.log('\n' + noInterior.length + ' model(s) have NO cockpit interior:');
    console.log('  ' + noInterior.join(', '));
  }
}

var portHeader = [
  '/* ports.js — GENERATED by tools/glb2hulls.js --ports. Do not edit by hand.',
  ' *',
  ' * Port models imported from .glb files, keyed by ROLE (the source',
  ' * filename): orbital, highport, refinery, shipyard, agri, mining,',
  ' * reprocessing, surface, bay, underground.',
  ' *',
  ' * Coordinates are +z UP OUT OF THE GROUND, not +y up — a port frame is',
  ' * written from the ground upward, which is what bayGeometry and the',
  ' * ground basis already assume. A surface port is measured in PAD RADII',
  ' * with its origin on the pad surface; an orbital station is normalised',
  ' * to radius 1 about its centre. See ref/PORT-MODELS.md.',
  ' *',
  ' * `anchors` are load-bearing, not decoration: the berths park ships and',
  ' * the chamber and floor clamp the camera. `geom` is the same shape',
  ' * Gen.bayGeometry hands out, so a modelled bay overrides the shared',
  ' * constant table field by field and anything absent falls back to it.',
  ' *',
  ' * This file is OPTIONAL. The game runs without it and every role falls',
  ' * back to its procedural mesh.',
  ' */',
  '(function (global) {',
  "  'use strict';",
  '  global.PortLib = '
].join('\n');

var header = [
  '/* hulls.js — GENERATED by tools/glb2hulls.js. Do not edit by hand.',
  ' *',
  ' * Ship models imported from .glb files, one entry per model, keyed by ID',
  ' * (the source filename). Vertices are unit-length, origin-centred, +z',
  ' * forward, +y up; colours are a per-model palette indexed per face, with',
  ' * the emissive-marker convention render.js already uses (a leading ! means',
  ' * full-bright). render.js decompresses these into its own mesh format at',
  ' * load. To add models: drop .glb files in a folder and re-run the tool.',
  ' */',
  '(function (global) {',
  "  'use strict';",
  '  global.HullLib = '
].join('\n');

/* ---- PORTS ARE SPLIT: a small index eagerly, the geometry on demand ------
 * Astra, 2026-09-22: "Lazy-load." The 22-09 drop is 102 port models and
 * 280 MB of GLB; baked into one script it was a 127 MB ports.js that every
 * boot parsed before the first frame, on the same laptop that runs the
 * game. Nearly all of it is triangles for stations in systems you are not
 * in.
 *
 * So ports.js keeps EVERYTHING THE SIMULATION READS — kind, anchors (the
 * berths, gates, pockets, signs), geom, extras — for every model, because
 * the model a port wears and where its berths are must be known the instant
 * a system is generated, and a berth that moved once the art arrived would
 * move a parked ship. Only the drawing buckets (v f pal ci interior spin)
 * go to src/ports/<id>.js, fetched the first time something asks
 * Render.libPort for that model. See PortGeo below and libPort in render.js.
 *
 * Ids in the index stay exactly the ids they always were, so poolFor and
 * every Object.keys(PortLib) reader see the whole library from boot. */
var PORT_GEO_KEYS = ['v', 'f', 'pal', 'ci', 'interior', 'spin'];
var PORT_LOADER = [
  "",
  "  /* ---- PortGeo: the geometry, on demand ------------------------------",
  "   * An index entry carries `lazy: true` until its drawing buckets arrive.",
  "   * load(id) answers \"is the geometry here NOW\": in node it requires the",
  "   * file synchronously (tests see a whole library); in a page it tries a",
  "   * synchronous fetch first, so the first answer is already the real one,",
  "   * and falls back to a <script> tag when the scheme will not allow that",
  "   * (file:// in a browser). The async path tells its listeners on arrival",
  "   * so anything that cached \"no model\" can forget it.",
  "   *",
  "   * STORED PACKED (tools/pack.cjs, 2026-10-30). The repo holds",
  "   * ports/<id>.js.gz; the plain .js exists only where something unpacked",
  "   * it (the exe's game:// scheme, tools/serve.js, the Pages workflow). On a",
  "   * host that serves the repo as it stands, the .js is a 404 - and that is",
  "   * exactly what a branch-deployed GitHub Pages did on 2026-10-31, so every",
  "   * station drew as its procedural stand-in. So when the .js is missing the",
  "   * page fetches the .js.gz and unpacks it itself (DecompressionStream).",
  "   * A host that already sends it decoded (Content-Encoding: gzip) is",
  "   * caught by the magic-number check and read as plain text.",
  "   *",
  "   * A model that still cannot be had is no longer silent: onfail",
  "   * listeners are told, and the game says so on the comms line. */",
  "  var GEO_STATE = {}, GEO_LISTENERS = [], GEO_FAIL_LISTENERS = [];",
  "  var GEO_BASE = null;",
  "  if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {",
  "    GEO_BASE = document.currentScript.src.replace(/[^\\/]*$/, '') + 'ports/';",
  "  }",
  "  function geoMerge(id, d) {",
  "    var m = global.PortLib && global.PortLib[id];",
  "    if (!m || !d) return false;",
  "    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) m[k] = d[k];",
  "    m.lazy = false;",
  "    GEO_STATE[id] = 'loaded';",
  "    return true;",
  "  }",
  "  function geoTake(id) {",
  "    var bag = global.PortGeoData;",
  "    if (!bag || !bag[id]) return false;",
  "    var ok = geoMerge(id, bag[id]);",
  "    delete bag[id];",
  "    return ok;",
  "  }",
  "  function geoTell(list, id) {",
  "    for (var i = 0; i < list.length; i++) {",
  "      try { list[i](id); } catch (e) { /* a listener is not allowed to stop the others */ }",
  "    }",
  "  }",
  "  function geoFail(id) { GEO_STATE[id] = 'failed'; geoTell(GEO_FAIL_LISTENERS, id); }",
  "  /* The packed copy, unpacked in the page. Always async: a browser has no",
  "   * synchronous gunzip, so the procedural mesh draws until it lands. */",
  "  function geoPacked(id) {",
  "    if (typeof fetch !== 'function' || typeof DecompressionStream === 'undefined') { geoFail(id); return; }",
  "    fetch(GEO_BASE + id + '.js.gz').then(function (r) {",
  "      if (!r.ok) throw new Error('HTTP ' + r.status);",
  "      return r.arrayBuffer();",
  "    }).then(function (buf) {",
  "      var b = new Uint8Array(buf);",
  "      if (b.length > 1 && b[0] === 0x1f && b[1] === 0x8b) {",
  "        return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();",
  "      }",
  "      return new TextDecoder('utf-8').decode(b);",
  "    }).then(function (text) {",
  "      (new Function(text))();",
  "      if (geoTake(id)) geoTell(GEO_LISTENERS, id); else geoFail(id);",
  "    }).catch(function () { geoFail(id); });",
  "  }",
  "  function geoLoad(id) {",
  "    var m = global.PortLib && global.PortLib[id];",
  "    if (!m) return false;",
  "    if (!m.lazy) return true;",
  "    if (geoTake(id)) return true;",
  "    if (GEO_STATE[id] === 'failed' || GEO_STATE[id] === 'pending') return false;",
  "    if (typeof document === 'undefined' && typeof require === 'function' && typeof __dirname === 'string') {",
  "      try {",
  "        /* Stored packed (tools/pack.cjs): the .js.gz is the tracked copy and",
  "         * the plain .js only a working copy, so read whichever is there. */",
  "        var fs_ = require('fs'), file = require('path').join(__dirname, 'ports', id + '.js'), d;",
  "        if (fs_.existsSync(file)) d = require(file);",
  "        else {",
  "          var mod = { exports: {} };",
  "          (new Function('module', 'exports', require('zlib').gunzipSync(fs_.readFileSync(file + '.gz')).toString('utf8')))(mod, mod.exports);",
  "          d = mod.exports;",
  "        }",
  "        if (global.PortGeoData) delete global.PortGeoData[id];",
  "        return geoMerge(id, d);",
  "      } catch (e) { geoFail(id); return false; }",
  "    }",
  "    if (!GEO_BASE || typeof XMLHttpRequest === 'undefined') { geoFail(id); return false; }",
  "    var missing = false;",
  "    try {",
  "      var x = new XMLHttpRequest();",
  "      x.open('GET', GEO_BASE + id + '.js', false);",
  "      x.send(null);",
  "      if ((x.status === 200 || x.status === 0) && x.responseText) {",
  "        (new Function(x.responseText))();",
  "        if (geoTake(id)) return true;",
  "      }",
  "      missing = x.status === 404;",
  "    } catch (e) { /* the scheme refused a synchronous read: go async */ }",
  "    GEO_STATE[id] = 'pending';",
  "    if (missing) { geoPacked(id); return false; }",
  "    var s = document.createElement('script');",
  "    s.src = GEO_BASE + id + '.js';",
  "    s.async = true;",
  "    s.onload = function () { if (geoTake(id)) geoTell(GEO_LISTENERS, id); else geoPacked(id); };",
  "    s.onerror = function () { geoPacked(id); };",
  "    (document.head || document.documentElement).appendChild(s);",
  "    return false;",
  "  }",
  "  global.PortGeo = {",
  "    load: geoLoad,",
  "    loaded: function (id) { var m = global.PortLib && global.PortLib[id]; return !!(m && !m.lazy); },",
  "    state: function (id) { return GEO_STATE[id] || null; },",
  "    onload: function (fn) { if (typeof fn === 'function') GEO_LISTENERS.push(fn); },",
  "    onfail: function (fn) { if (typeof fn === 'function') GEO_FAIL_LISTENERS.push(fn); },",
  "    prefetch: function (ids) { (ids || []).forEach(function (id) { geoLoad(id); }); }",
  "  };",
  ""
].join('\n');

if (PORTS) {
  var geoDir = path.join(path.dirname(outFile), 'ports');
  fs.mkdirSync(geoDir, { recursive: true });
  var index = {}, geoBytes = 0;
  Object.keys(lib).forEach(function (pid) {
    var full = lib[pid], meta = {}, geo = {};
    Object.keys(full).forEach(function (k) {
      if (PORT_GEO_KEYS.indexOf(k) >= 0) geo[k] = full[k]; else meta[k] = full[k];
    });
    meta.lazy = true;
    index[pid] = meta;
    var body = '/* ' + pid + ' - GENERATED by tools/glb2hulls.js --ports. Geometry only; the anchors are in ports.js. */\n' +
      '(function (g) {\n  var d = ' + JSON.stringify(geo) + ';\n' +
      '  (g.PortGeoData || (g.PortGeoData = {}))[' + JSON.stringify(pid) + '] = d;\n' +
      "  if (typeof module !== 'undefined' && module.exports) module.exports = d;\n" +
      "})(typeof window !== 'undefined' ? window : globalThis);\n";
    fs.writeFileSync(path.join(geoDir, pid + '.js'), body);
    geoBytes += body.length;
  });
  /* A model removed from ref/ports must not linger as a file nothing indexes. */
  fs.readdirSync(geoDir).forEach(function (f3) {
    if (/\.js$/.test(f3) && !index[f3.replace(/\.js$/, '')]) fs.unlinkSync(path.join(geoDir, f3));
  });
  fs.writeFileSync(outFile,
    portHeader + JSON.stringify(index) + ';\n' + PORT_LOADER +
    "  if (typeof module !== 'undefined' && module.exports) module.exports = global.PortLib;\n" +
    "})(typeof window !== 'undefined' ? window : globalThis);\n");
  console.log('\nwrote ' + outFile + ' (' + Math.round(fs.statSync(outFile).size / 1024) + ' KB index, ' +
              files.length + ' ports) + ' + geoDir + ' (' + Math.round(geoBytes / 1048576) + ' MB geometry, loaded on demand)');
  var warnedP = Object.keys(lib).filter(function (k) { return lib[k].warnings; });
  if (warnedP.length) console.log(warnedP.length + ' port(s) converted WITH WARNINGS: ' + warnedP.join(', '));
  process.exit(0);
}

var libName = PORTS ? 'PortLib' : 'HullLib';
fs.writeFileSync(outFile,
  (PORTS ? portHeader : header) + JSON.stringify(lib) + ';\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = global." +
  libName + ';\n' +
  "})(typeof window !== 'undefined' ? window : globalThis);\n");
console.log('\nwrote ' + outFile + ' (' + Math.round(fs.statSync(outFile).size / 1024) + ' KB, ' +
            files.length + (PORTS ? ' ports)' : ' models)'));
if (PORTS) {
  var warned = Object.keys(lib).filter(function (k) { return lib[k].warnings; });
  if (warned.length) {
    console.log(warned.length + ' port(s) converted WITH WARNINGS: ' + warned.join(', '));
  }
  console.log('add <script src="src/ports.js"></script> to index.html before render.js');
}
