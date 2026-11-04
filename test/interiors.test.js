/* interiors.test.js — inside a station on the way through (2026-11-03).
 *
 *     node test/interiors.test.js
 *
 * Astra's reports of 2026-11-03, each with the sweep that would have
 * caught it. berths.test.js measures the bays and the outer legs of the
 * rail; this one is what a hull meets once it is past the outer doors:
 * which compartment it is drawn in, the legs through the structure, the
 * lifts, the blast doors, the yards' doors, how a hull stands on its own
 * gear, and whether a wall is a slab or a sheet. Numbers are against the
 * triangles, never the occupancy grid (whose cells are 100-200 m).
 */
global.window = global.window || global;
var V = require('../src/vec3.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
require('../src/hulls.js');
require('../src/ports.js');
var Render = require('../src/render.js');

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

var HELD = Render.PORT_HELD_BACK || {};
var ORBITAL = Object.keys(global.PortLib || {}).filter(function (id) {
  var e = global.PortLib[id];
  return e && e.kind === 'orbital' && e.anchors && e.anchors.berths && e.anchors.berths.length &&
         !HELD[id] && !e.entrances && !/-site-[sml]$/.test(id);
});
/* One per family: the navy and Syndicate liveries share the plain shell,
 * except the yards' (yard-navy is its own model, and is listed). */
var PLAIN = ORBITAL.filter(function (id) { return !/-(navy|syn)-/.test(id); });
var sys = Gen.generateSystem('cut-sweep');
var st = sys.ports.filter(function (p) { return !p.surface && p.docking; })[0];
var role = Render.portRole(st), R0 = st.radius;

/* The fleet's widest half-extents, as Sim routes with (clearTransfer). */
var FLEET = (function () {
  var w = 0, h = 0;
  Object.keys(Render.HULL_ASSIGN).forEach(function (k) {
    var s = Render.hullSpan(k);
    if (s.w > w) w = s.w;
    if (s.h > h) h = s.h;
  });
  return { w: w, h: h };
})();

/* ---- C/H: IN A ROOM ONLY WHEN INSIDE ITS BOX ------------------------------
 * Astra mid-transfer at Halden Dock: a car and two leaves against black.
 * shipSection asked sectionAt (nearest berth in reach), the hull riding the
 * bore beside a bay got that bay's section, and with the inner gate shut the
 * bay was drawn alone. Now Render.roomAt: a section only inside its berth's
 * box. Every routed berth of every model, every second of the transfer leg:
 * a point roomAt names is inside that room's box, and the stand itself is in
 * its own room. The count of points sectionAt would have put in a room they
 * are not in is printed: it is the void she saw. */
console.log('--- a compartment only when the hull is in it ---');
(function () {
  st.radius = 4.91;
  var routed = 0, wrongRoom = [], strayNear = 0, standOk = 0, standBad = [];
  PLAIN.forEach(function (id) {
    Render.assignPort(role, id);
    var S = Render.portSections(id);
    if (!S) return;
    var nb = Math.max(1, Gen.bayGeometry(st).berths);
    for (var i = 0; i < nb; i++) {
      var rt = Gen.berthRoute(st, i);
      if (!rt) continue;
      routed++;
      var path = Sim.arrivalPath(st, i);
      var pl = [path[8]].concat(path.through, [path[9]]);
      /* At the stand, her own room or none (a cylinder's arm bays stand the
       * hull just outside the berth box: then the whole hull is drawn, which
       * is never a void). Never another berth's. */
      var stand = path[9], room = Render.roomAt(id, [stand.x, stand.y, stand.z]);
      var Ssorted = S.sections[i % S.sections.length];
      if (room < 0) standOk++;
      else if (S.sections[room] !== Ssorted) standBad.push(id + ' b' + i + ' in ' + room);
      for (var k = 1; k < pl.length; k++) {
        for (var u = 0.1; u < 1; u += 0.2) {
          var p = [pl[k - 1].x + (pl[k].x - pl[k - 1].x) * u, pl[k - 1].y + (pl[k].y - pl[k - 1].y) * u,
                   pl[k - 1].z + (pl[k].z - pl[k - 1].z) * u];
          var r = Render.roomAt(id, p);
          if (Render.sectionAt(id, p) >= 0 && r < 0) strayNear++;
          if (r < 0) continue;
          var bx = S.sections[r].box, pad = 0.05, inside = true;
          for (var a = 0; a < 3; a++) {
            var w = (bx.max[a] - bx.min[a]) * pad;
            if (p[a] < bx.min[a] - w || p[a] > bx.max[a] + w) inside = false;
          }
          if (!inside) wrongRoom.push(id + ' b' + i);
        }
      }
    }
  });
  Render.assignPort(role, null);
  st.radius = R0;
  console.log('  ' + routed + ' routed transfers; ' + strayNear + ' points sectionAt would have put in a room they are not in');
  check('a room is named only for a point inside its box', wrongRoom.length === 0, wrongRoom.slice(0, 4).join('; '));
  check('the transfer leg passes points outside every room (the bores, the halls)', strayNear > 0, strayNear + '');
  console.log('  ' + standOk + ' routed stands outside their own box (drawn with the whole hull)');
  check('no routed stand is put in another berth\'s room', standBad.length === 0, standBad.slice(0, 4).join('; '));
})();

/* ---- THE INNER LEGS THROUGH OPEN SPACE -----------------------------------
 * Every leg after the outer doors (settle, admit, board, lift, pad,
 * transfer), the hull's centre and her sides and top and keel at the
 * fleet's widest half-extents, against the triangles with every door posed
 * as the rail poses it (the far bay's inner gate included). Measured
 * 2026-11-03 at Waypoint Dock's radius: 85 of 131 berths through something
 * before; 55 after (Render.clearRoute re-routes a leg that crosses a
 * surface, Render movers seat a hull on the car's deck, carShafts opens the
 * plating a car runs through). 51 of the 55 are legs for which no route
 * through open space was found in the art (cylinder arms, skimmer hoists,
 * the yards' tracks), listed and held to the count; none of them is a ring,
 * a refinery or a spine-m/-s. */
console.log('--- the legs inside the station ---');
(function () {
  st.radius = 4.184;
  var basis = Sim.portBasis(st, sys, 0);
  function toM(pos) {
    var d = V.sub(pos, basis.entrance.pos);
    return [V.dot(d, basis.east) / st.radius, V.dot(d, basis.north) / st.radius, V.dot(d, basis.up) / st.radius];
  }
  function dirM(v) { return [V.dot(v, basis.east), V.dot(v, basis.north), V.dot(v, basis.up)]; }
  var berths = 0, bad = [], blocked = 0, clean = [];
  PLAIN.forEach(function (id) {
    Render.assignPort(role, id);
    var nb = Math.max(1, Gen.bayGeometry(st).berths);
    for (var i = 0; i < nb; i++) {
      var dur = Sim.arrivalTotal(st, i), rt = Gen.berthRoute(st, i);
      var entry = rt ? rt.entry : i, apE = Gen.berthApertures(st, entry), apI = Gen.berthApertures(st, i);
      var path = Sim.arrivalPath(st, i);
      if (!path) continue;
      berths++;
      if (path.blocked) blocked++;
      var prev = null, hits = 0, prevCar = null;
      /* A yard carriage's run in model units, for a hull riding it. */
      var cg = path.carriage ? Render.carriageFor(id, path.carriage) : null;
      for (var el = 0; el <= dur; el += 0.25) {
        var pose = Sim.arrivalPose(st, sys, 0, i, el);
        if (!pose) continue;
        var p = toM(pose.pos), ri = dirM(pose.right), up = dirM(pose.up), g = pose.gates;
        var doors = { open: 1 - g.apron, inner: 1 - g.inner, berth: entry, berthMid: apE && apE.mid,
                      car: pose.car || null, innerTo: typeof g.dest === 'number' ? 1 - g.dest : 0,
                      innerToMid: apI && apI.mid };
        if (prev && pose.leg >= 3) {
          var hw = FLEET.w / 2 / st.radius * 0.9, hh = FLEET.h / 2 / st.radius * 0.9;
          var offs = [[0, 0], [hw, 0], [-hw, 0], [0, hh], [0, -hh * 0.6]];
          for (var o = 0; o < offs.length; o++) {
            var oo = offs[o];
            var a = [prev[0] + ri[0] * oo[0] + up[0] * oo[1], prev[1] + ri[1] * oo[0] + up[1] * oo[1], prev[2] + ri[2] * oo[0] + up[2] * oo[1]];
            var b = [p[0] + ri[0] * oo[0] + up[0] * oo[1], p[1] + ri[1] * oo[0] + up[1] * oo[1], p[2] + ri[2] * oo[0] + up[2] * oo[1]];
            var hit = Render.portSegmentHit(id, a, b, doors);
            /* RIDING A CARRIAGE, the carriage moves with her: she is still
             * against its deck, so the carriage itself is asked about her
             * step in its own frame (where it was a quarter second ago),
             * and the rest of the station about her step through it. */
            if (hit && cg && pose.ride === 'ride' && hit.part === path.carriage && prevCar !== null) {
              var df = pose.car.f - prevCar;
              var a2 = [a[0] + cg.d[0] * df, a[1] + cg.d[1] * df, a[2] + cg.d[2] * df];
              var h2 = Render.portSegmentHit(id, a2, b, doors);
              if (!h2 || h2.part !== path.carriage) hit = null;
            }
            if (hit) { hits++; break; }
          }
        }
        prev = p;
        prevCar = pose.car ? pose.car.f : null;
      }
      if (hits) bad.push(id + ' b' + i + (path.blocked ? ' (no open route found)' : '') + ': ' + hits);
      else if (/^(ring|refinery)/.test(id) || /^spine-[ms]$/.test(id)) clean.push(id);
    }
  });
  Render.assignPort(role, null);
  st.radius = R0;
  console.log('  ' + berths + ' berths, ' + bad.length + ' with an inner leg through something, ' +
              blocked + ' with a leg no open route was found for');
  bad.forEach(function (s) { console.log('    ' + s); });
  /* 52 since the second pass (2026-11-03): the cylinders' arm bores whole
   * again (glb2hulls clipBores had cut armBoreC away and opened the hub to
   * space, so no cylinder bay could be routed and all of them were bridged
   * in a straight line), each route riding its arm's car; and a transfer
   * routed round the shut blast doors of bays it does not belong to
   * (Render.routeDoors). What is left is listed above: the arm bores' hub
   * ends, which open into the hub only through structure at the fleet's
   * width, the skimmers' hoists, the yards' tracks, two spine-l berths and
   * four cradle berths. */
  /* 32 since the yards' carriages ride (third pass, 2026-11-03): all 20
   * yard S/M bays were "no open route found", the hull carried up the
   * incline through her own carriage to stand on its rail. */
  check('the berths with an inner leg through something are no more than the 32 measured 2026-11-03 (52 before the third pass, 55 before the second)',
        bad.length <= 32, bad.length + '');
  check('no yard berth has an inner leg through anything',
        !bad.some(function (s) { return /^yard-[sml] /.test(s); }), bad.filter(function (s) { return /^yard-[sml] /.test(s); }).join('; '));
  check('no ring, refinery or small/medium spine berth has an inner leg through anything',
        !bad.some(function (s) { return /^(ring|refinery)/.test(s) || /^spine-[ms] /.test(s); }),
        bad.filter(function (s) { return /^(ring|refinery)/.test(s) || /^spine-[ms] /.test(s); }).join('; '));
})();

/* ---- D: THE LIFTS ----------------------------------------------------------
 * A hull on an inclined car rides on its DECK: armBoreBCar's box tops out
 * 0.026 radii over its deck, and seatRide stood the hull on the box, out
 * through the crown of the bore (Astra's 45-degree lift at Halden Dock).
 * Every mover a route rides: the boarding and alighting corners are a
 * standoff over the deck at that point of the run. And every car the art
 * declares: its top at the far end of its run is flush with the deck beside
 * the shaft, the plating across its run is cut, a downward run's pit is
 * capped flush under it, and the hatch over its shaft is shut exactly while
 * the car is away. */
console.log('--- the lifts ---');
(function () {
  function column(meshes, x, y) {
    var zs = [];
    meshes.forEach(function (mm) {
      if (!mm || !mm.f) return;
      mm.f.forEach(function (tri) {
        for (var j = 1; j + 1 < tri.length; j++) {
          var a = mm.v[tri[0]], b = mm.v[tri[j]], c = mm.v[tri[j + 1]];
          if (Math.max(a[0], b[0], c[0]) < x || Math.min(a[0], b[0], c[0]) > x ||
              Math.max(a[1], b[1], c[1]) < y || Math.min(a[1], b[1], c[1]) > y) continue;
          var d0 = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
          if (Math.abs(d0) < 1e-14) continue;
          var u = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / d0;
          var v = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / d0;
          if (u < 0 || v < 0 || u + v > 1) continue;
          zs.push(a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
        }
      });
    });
    return zs.sort(function (p, q) { return p - q; });
  }
  st.radius = 4.91;
  var seated = 0, offDeck = [];
  PLAIN.forEach(function (id) {
    Render.assignPort(role, id);
    var lib = Render.libPort(id);
    var nb = Math.max(1, Gen.bayGeometry(st).berths);
    for (var i = 0; i < nb; i++) {
      var path = Sim.arrivalPath(st, i);
      if (!path || !path.rideMover || !(path.rideAt >= 1)) continue;
      var mv = (lib.movers || []).filter(function (x) { return x.node === path.rideMover; })[0];
      if (!mv) continue;
      var pl = [path[8]].concat(path.through, [path[9]]);
      var g = Gen.bayGeometry(st);
      [pl[path.rideAt], pl[path.rideAt + 1]].forEach(function (P) {
        seated++;
        /* Along the run from her plan position: her height is the thing
         * being measured, so it must not feed the projection. */
        var hz = mv.axis[0] * mv.axis[0] + mv.axis[1] * mv.axis[1];
        var s = hz > 1e-6 ? ((P.x - mv.mid[0]) * mv.axis[0] + (P.y - mv.mid[1]) * mv.axis[1]) / hz
                          : (P.z - mv.mid[2]) * mv.axis[2];
        s = Math.max(mv.range[0], Math.min(mv.range[1], s));
        var deckAt = mv.deck + mv.axis[2] * s;
        if (Math.abs(P.z - (deckAt + g.standoff)) > 1e-6) offDeck.push(id + ' b' + i + ' ' + ((P.z - deckAt - g.standoff) * st.radius * 1000).toFixed(0) + ' m');
      });
    }
  });
  console.log('  ' + seated + ' ride stops on an inclined or vertical mover');
  check('every ride stop is a standoff over the car\'s deck, not its box', offDeck.length === 0, offDeck.slice(0, 4).join('; '));
  var tilted = [];
  PLAIN.forEach(function (id) {
    (Render.libPort(id).movers || []).forEach(function (mv) {
      if (mv.axis && Math.abs(mv.axis[2]) > 0.3 && Math.abs(mv.axis[2]) < 0.95) tilted.push(mv.max[2] - mv.deck);
    });
  });
  check('an inclined car\'s deck lies under its box top', tilted.length > 0 && tilted.every(function (d) { return d > 0; }),
        tilted.map(function (d) { return d.toFixed(3); }).join(' '));

  /* EVERY car now (item 3, 2026-11-03), not only the ring's: the skimmer's
   * sort lift and the spine's hub lift stopped 0.115 and 0.044-0.07 radii
   * short of the deck above them and stood a car's thickness proud of the
   * one below. Render.fitCarRuns refits each run to its decks (the car
   * definitions as fitted are portDoors(id).cars); carShafts cuts both decks
   * across the run, caps the lower end and puts a hatch in the upper one. */
  var cars = 0, notFlush = [], plated = [], pit = [], hatchBad = [], fits = [];
  ORBITAL.forEach(function (id) {
    var raw = global.PortLib[id];
    if (!raw.cars || /-(navy|syn)-/.test(id)) return;
    var d = Render.portDoors(id);
    fits.push(id + ': ' + (d.carFit || []).join(', '));
    (d.cars || raw.cars).forEach(function (c) {
      /* A yard carriage runs on an incline through an aperture of the art's
       * own, not up a shaft: section A below measures it. */
      if (c.carriage) return;
      cars++;
      var cx = (c.min[0] + c.max[0]) / 2, cy = (c.min[1] + c.max[1]) / 2;
      var w = c.max[0] - c.min[0], h = c.max[1] - c.min[1];
      var rest = c.max[2], far = c.max[2] + c.d[2];
      var lib = Render.libPort(id);
      var all = [d.hull, lib.interior, lib.spin];
      function beside(z) {
        var best = Infinity;
        [[c.min[0] - w * 0.15, cy], [c.max[0] + w * 0.15, cy], [cx, c.min[1] - h * 0.15], [cx, c.max[1] + h * 0.15]].forEach(function (pt) {
          column(all, pt[0], pt[1]).forEach(function (q) { if (Math.abs(q - z) < Math.abs(best)) best = q - z; });
        });
        return best;
      }
      var tol = 0.004;
      var bR = beside(rest), bF = beside(far);
      if (Math.abs(bR) > tol || Math.abs(bF) > tol) notFlush.push(id + ' ' + c.node + ' rest ' + bR.toFixed(4) + ' far ' + bF.toFixed(4));
      var inShaft = column([d.hull], cx, cy).filter(function (z) { return z > Math.min(rest, far) - 0.001 && z < Math.max(rest, far) + 0.001; });
      if (inShaft.length) plated.push(id + ' ' + c.node + ' ' + inShaft.length + ' surfaces across the run');
      /* The lower end: nothing in the shaft for a tenth of a run under the
       * car's underside there but its cap (the hull's own underside, a
       * plate that spans far past the shaft, may lie further down). */
      var capZ = c.d[2] < 0 ? c.min[2] + c.d[2] : c.min[2];
      var below = column([d.hull], cx, cy).filter(function (z) { return z < capZ - 0.001 && z > capZ - Math.abs(c.d[2]) * 0.1; });
      var cap = d.leaves.filter(function (l) { return l.fixed && l.node === c.node + 'PitFloor'; }).length;
      if (below.length || !cap) pit.push(id + ' ' + c.node + ' ' + below.length + ' under the lower end, cap ' + cap);
      /* The hatch over the upper end: gone with the car at that end, shut
       * with it anywhere else, and with no car pose at all (at rest). */
      var hatches = d.leaves.filter(function (l) { return l.hatch && l.overCar === c.node; });
      if (!hatches.length) hatchBad.push(id + ' ' + c.node + ' has no hatch over its upper end');
      hatches.forEach(function (l) {
        var end = l.hatchEnd || 0;
        var there = Render.partState(l, { car: { node: c.node, f: end } }).hidden;
        var away = Render.partState(l, { car: { node: c.node, f: 0.5 } }).hidden;
        var noCar = Render.partState(l, {}).hidden;
        if (!there || away || noCar !== (end === 0)) hatchBad.push(id + ' ' + l.node);
      });
    });
  });
  Render.assignPort(role, null);
  st.radius = R0;
  console.log('  ' + cars + ' cars; fitted: ' + fits.join('; '));
  check('every car is flush with the deck beside its shaft at both ends', cars >= 9 && notFlush.length === 0, notFlush.join('; '));
  check('nothing plates across any car\'s run', plated.length === 0, plated.join('; '));
  check('the lower end of every run is cut away and capped flush', pit.length === 0, pit.join('; '));
  check('the hatch over every shaft\'s upper end is gone with the car there and shut with it away', hatchBad.length === 0, hatchBad.join('; '));
})();

/* ---- THE INCLINED BORES ARE WHOLE, AND END ON WHAT THEY MEET (items 1-2) ---
 * glb2hulls clipBores cut a bore where its own centreline first "saw" open
 * space, which on a cylinder is a third of the way along every arm: armBoreC
 * kept 3 faces of ~140 between the hub and its pod, the hub's hole for it
 * opened onto space, and no cylinder bay could be routed. Each bore end is
 * now cut on the plane of the surface its walls cross there (the pod roof
 * armBoreA used to hang 0.053 radii through). Every inclined car's bore has
 * walls all along its run, in tenths. */
console.log('--- the inclined bores are whole ---');
(function () {
  var broken = [], n = 0;
  PLAIN.forEach(function (id) {
    var lib = Render.libPort(id);
    (lib.movers || []).forEach(function (m) {
      if (!m.axis || !(Math.abs(m.axis[2]) > 0.3 && Math.abs(m.axis[2]) < 0.95) || !/^armBore/.test(m.node)) return;
      n++;
      /* Across the bore from its axis, four ways, at tenths of the run: a
       * wall within 0.06 radii on at least three sides. */
      var ax = m.axis, la = Math.abs(ax[2]) < 0.9 ? [ax[1], -ax[0], 0] : [1, 0, 0];
      var ll = Math.sqrt(la[0] * la[0] + la[1] * la[1] + la[2] * la[2]);
      la = [la[0] / ll, la[1] / ll, la[2] / ll];
      var lb = [ax[1] * la[2] - ax[2] * la[1], ax[2] * la[0] - ax[0] * la[2], ax[0] * la[1] - ax[1] * la[0]];
      var bins = [], r0 = m.range[0], r1 = m.range[1], ONLY = { open: 1, inner: 1, onlyMine: true, berthMid: [9, 9, 9] };
      for (var u = 0.15; u < 0.9; u += 0.1) {
        var sv = r0 + (r1 - r0) * u, o = [m.mid[0] + ax[0] * sv, m.mid[1] + ax[1] * sv, m.mid[2] + ax[2] * sv], walls = 0;
        [la, lb, [-la[0], -la[1], -la[2]], [-lb[0], -lb[1], -lb[2]]].forEach(function (d) {
          if (Render.portSegmentHit(id, o, [o[0] + d[0] * 0.06, o[1] + d[1] * 0.06, o[2] + d[2] * 0.06], ONLY)) walls++;
        });
        bins.push(walls);
      }
      if (bins.some(function (w) { return w < 3; })) broken.push(id + ' ' + m.node + ' [' + bins.join(' ') + ']');
    });
  });
  check('every arm bore has walls the whole length of its car\'s run', n >= 8 && broken.length === 0, n + ' bores; ' + broken.join('; '));
})();

/* ---- F: THE BLAST DOORS BETWEEN THE BERTHS AND THE STATION ----------------
 * Every inner-gate frame with no leaf in it gets a pair (innerGateLeaves).
 * Shut, a line through the middle of the frame hits a leaf; with the gate
 * open at that berth it does not; the leaves are slabs with real depth. */
console.log('--- the inner blast doors ---');
(function () {
  var frames = 0, leaves = 0, notShut = [], notOpen = [], thin = [], walled = [];
  PLAIN.forEach(function (id) {
    var d = Render.portDoors(id);
    if (!d) return;
    var mine = d.leaves.filter(function (l) { return l.inner; });
    var byBerth = {};
    mine.forEach(function (l) { var k = l.berthMid.join(','); (byBerth[k] = byBerth[k] || []).push(l); });
    Object.keys(byBerth).forEach(function (k) {
      frames++;
      var pair = byBerth[k];
      leaves += pair.length;
      var lo = [9, 9, 9], hi = [-9, -9, -9];
      pair.forEach(function (l) {
        l.mesh.v.forEach(function (v) { for (var a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], v[a]); hi[a] = Math.max(hi[a], v[a]); } });
      });
      var ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      var nAx = ext.indexOf(Math.min.apply(null, ext));
      if (ext[nAx] < 0.0019) thin.push(id + ' ' + ext[nAx].toFixed(4));
      var mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      var a0 = mid.slice(), b0 = mid.slice();
      a0[nAx] -= 0.05; b0[nAx] += 0.05;
      var bm = pair[0].berthMid;
      var shut = Render.portSegmentHit(id, a0, b0, { open: 0, inner: 0, berthMid: bm });
      var open = Render.portSegmentHit(id, a0, b0, { open: 0, inner: 1, berthMid: bm });
      /* A shut hit must be a leaf (nearer than whatever is behind). */
      if (!shut) notShut.push(id);
      /* The same hit open as shut is the art's own wall in the doorway (the
       * yards' hall InnerCurtain stands in the inner gate's plane): listed,
       * a lead for the art, not a door that failed to open. */
      if (open && shut && Math.abs(open.t - shut.t) < 1e-9) walled.push(id);
      else if (open && shut && open.t < shut.t) notOpen.push(id);
    });
  });
  console.log('  ' + frames + ' inner gates fitted with ' + leaves + ' leaves' +
              (walled.length ? '; a wall of the art\'s own in the doorway: ' + walled.join(', ') : ''));
  check('every model with a leafless inner-gate frame now has leaves in it', frames >= 10, frames + '');
  check('shut, the doorway is closed', notShut.length === 0, notShut.join('; '));
  check('open at its berth, the leaves are out of the doorway', notOpen.length === 0, notOpen.join('; '));
  check('a blast door is a slab, at least 0.0019 radii deep', thin.length === 0, thin.join('; '));
})();

/* ---- THE CIVIL YARDS' DOORS ------------------------------------------------
 * yard-s/m/l kept their leaves in the interior bucket, where portDoors did
 * not look: welded shut (gateFacesToShell). Open, a line down the middle of
 * each heavy bay's doorway reaches open space. */
console.log('--- the yards\' doors open ---');
(function () {
  st.radius = 4.184;
  ['yard-s', 'yard-m', 'yard-l'].forEach(function (id) {
    if (!global.PortLib[id]) return;
    Render.assignPort(role, id);
    var lib = Render.libPort(id), d = Render.portDoors(id);
    check(id + ': its leaves moved out of the interior', lib.gateFacesMoved > 0, lib.gateFacesMoved + ' faces');
    var nb = Math.max(1, Gen.bayGeometry(st).berths), tried = 0, through = [];
    for (var i = 0; i < nb; i++) {
      if (Gen.berthRoute(st, i)) continue;
      var bd = Sim.berthDoor(st, i), ap = Gen.berthApertures(st, i);
      if (!bd || !ap) continue;
      tried++;
      var a = [bd.door[0] - bd.entry[0] * 0.02, bd.door[1] - bd.entry[1] * 0.02, bd.door[2] - bd.entry[2] * 0.02];
      var b = [bd.door[0] + bd.entry[0] * 0.3, bd.door[1] + bd.entry[1] * 0.3, bd.door[2] + bd.entry[2] * 0.3];
      if (Render.portSegmentHit(id, a, b, { open: 1, inner: 0, berthMid: ap.mid })) through.push('b' + i);
      if (!Render.portSegmentHit(id, a, b, { open: 0, inner: 0, berthMid: ap.mid })) through.push('b' + i + ' shut but open');
    }
    check(id + ': each heavy bay\'s doorway is open with its doors open and shut with them shut',
          tried > 0 && through.length === 0, tried + ' bays; ' + through.join(', '));
  });
  Render.assignPort(role, null);
  st.radius = R0;
})();

/* ---- A: THE YARDS' CARRIAGES (2026-11-03) ----------------------------------
 * Astra at Halden Yard: "left elevator protrudes ... a cut in the floor
 * there for the elevator to come up through. When the elevator is not there,
 * there should be a blast door covering the shaft"; "the bottom of that
 * shaft needs to be flush with the floor, so the elevator comes down and
 * locks into the floor ... placed too high on the right and too high on the
 * left". Before: the carriages never moved, the art's run landed the upper
 * ones' deck 0.017 radii over the hall floor and the lower ones' 0.0075 (both
 * too high), the track leaves were welded into the interior bucket, and the
 * hull was carried up the incline to stand on the rail (yard-m, 0.36 radii,
 * 0.26 over her carriage's deck). Every S/M bay of yard-s/m/l: its carriage
 * is a car with faces of its own; its run is fitted so its deck at the hall
 * end is level with the floor beside the aperture (measured here again,
 * independently, against the interior's triangles); the hull stands on its
 * deck at home; the route's last leg is the ride, foot to stand exactly the
 * run; its leaves are no longer in the interior, are shut while it is home
 * and open while it is away; and the carriage and the hull it carries never
 * part. */
console.log('--- A: the yards\' carriages ---');
(function () {
  st.radius = 4.184;
  function column(m, x, y) {
    var zs = [];
    if (!m) return zs;
    m.f.forEach(function (t) {
      var A = m.v[t[0]], B = m.v[t[1]], C = m.v[t[2]];
      if (!A || !B || !C) return;
      var d0 = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
      if (Math.abs(d0) < 1e-14) return;
      var u = ((x - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (y - A[1])) / d0;
      var v = ((B[0] - A[0]) * (y - A[1]) - (x - A[0]) * (B[1] - A[1])) / d0;
      if (u < 0 || v < 0 || u + v > 1) return;
      zs.push(A[2] + u * (B[2] - A[2]) + v * (C[2] - A[2]));
    });
    return zs;
  }
  var bays = 0, offFloor = [], stands = [], rides = [], hatches = [], interiorLeaves = 0, wasHigh = [];
  ['yard-s', 'yard-m', 'yard-l'].forEach(function (id) {
    var raw = global.PortLib[id];
    if (!raw) return;
    Render.assignPort(role, id);
    var lib = Render.libPort(id), d = Render.portDoors(id);
    (raw.parts || []).forEach(function (pt) { if (pt.kind === 'hatch' && pt.bucket === 'interior') interiorLeaves++; });
    var nb = Math.max(1, Gen.bayGeometry(st).berths);
    for (var i = 0; i < nb; i++) {
      var path = Sim.arrivalPath(st, i);
      if (!path || !path.carriage) continue;
      bays++;
      var cg = Render.carriageFor(id, path.carriage);
      var cd = d.cars.filter(function (c) { return c.node === path.carriage; })[0];
      if (!cg || !cd || !cd.runScale) { offFloor.push(id + ' b' + i + ' not fitted'); continue; }
      wasHigh.push(cd.artLand - cd.floor);
      /* The floor beside the far end, from the interior's own triangles. */
      var w = cd.max[0] - cd.min[0], fx = (cd.min[0] + cd.max[0]) / 2 + cg.d[0], fy = cd.min[1] + cg.d[1] - (cd.max[1] - cd.min[1]) * 0.15;
      var land = cg.deck + cg.d[2], near = Infinity;
      column(lib.interior, fx, fy).concat(column(lib.interior, cd.min[0] + cg.d[0] - w * 0.15, (cd.min[1] + cd.max[1]) / 2 + cg.d[1]))
        .forEach(function (z) { if (Math.abs(z - land) < Math.abs(near)) near = z - land; });
      if (!(Math.abs(near) < 1e-4)) offFloor.push(id + ' b' + i + ' deck ' + (near * -1).toFixed(4) + ' off the floor');
      /* Her centre's height over the deck is the berth's standoff, the
       * same at every bay of a station: under a hull's height, and over the
       * deck, never the 0.26 radii she stood over it on the rail. */
      var stand = path[9], over = stand.z - cg.deck, hullH = Render.hullSpan('courier').h / st.radius;
      if (!(over > 0 && over < hullH * 2)) stands.push(id + ' b' + i + ' ' + over.toFixed(4) + ' over its deck');
      var pl = [path[8]].concat(path.through, [path[9]]), ft = pl[path.rideAt];
      if (path.rideAt !== pl.length - 2 || Math.abs(ft.x - stand.x - cg.d[0]) > 1e-6 || Math.abs(ft.y - stand.y - cg.d[1]) > 1e-6 ||
          Math.abs(ft.z - stand.z - cg.d[2]) > 1e-6) rides.push(id + ' b' + i + ' foot is not the run');
      /* The carriage under her: her height over its posed deck, every half
       * second of the transfer leg while it is in the hall or riding. */
      var dur = Sim.arrivalTotal(st, i), basis = Sim.portBasis(st, sys, 0), worst = 0, sawOpen = false, sawShut = false;
      var mine = d.leaves.filter(function (l) { return l.hatch && l.overCar === path.carriage; });
      for (var el = 0; el <= dur; el += 0.5) {
        var pose = Sim.arrivalPose(st, sys, 0, i, el);
        if (!pose || !pose.car) continue;
        var shut = mine.every(function (l) { return !Render.partState(l, { car: pose.car }).hidden; });
        if (pose.car.f > 0.05) sawOpen = sawOpen || !shut; else sawShut = sawShut || shut;
        if (pose.car.f > 0.05 && shut) hatches.push(id + ' b' + i + ' shut on a carriage away at ' + pose.car.f.toFixed(2));
        if (pose.ride === 'ride') {
          var rel = V.sub(pose.pos, basis.entrance.pos), z = V.dot(rel, basis.up) / st.radius;
          var deckNow = cg.deck + cg.d[2] * pose.car.f;
          worst = Math.max(worst, Math.abs(z - deckNow - over));
        }
      }
      if (worst > 1e-4) rides.push(id + ' b' + i + ' parts from its carriage by ' + worst.toFixed(5));
      if (mine.length < 2 || !sawShut || !sawOpen) hatches.push(id + ' b' + i + ': ' + mine.length + ' leaves, seen shut ' + sawShut + ', open ' + sawOpen);
    }
  });
  Render.assignPort(role, null);
  st.radius = R0;
  console.log('  ' + bays + ' carriage bays; the art landed their decks ' + Math.min.apply(null, wasHigh).toFixed(4) + '-' +
              Math.max.apply(null, wasHigh).toFixed(4) + ' radii over the hall floor');
  check('every yard S/M bay rides a carriage', bays === 20, bays + '');
  check('each carriage comes down flush with the hall floor', offFloor.length === 0, offFloor.slice(0, 4).join('; '));
  check('the hull stands on her carriage\'s deck at home', stands.length === 0, stands.slice(0, 4).join('; '));
  check('the last leg is the ride, and she never parts from the carriage', rides.length === 0, rides.slice(0, 4).join('; '));
  check('no track leaf is left in the interior bucket', interiorLeaves === 0, interiorLeaves + '');
  check('the leaves over a carriage\'s aperture are shut while it is home and open while it is away',
        hatches.length === 0, hatches.slice(0, 4).join('; '));
})();

/* ---- ON HER OWN GEAR -------------------------------------------------------
 * Sim.standLiftKm(ship, port): her centre at her own stance over the deck
 * (hullFit ground, carrying the half metre), not the fleet's standoff. A
 * Talon at a 0.3 km station had her feet 1.2 m into the deck, at a big one
 * 2 m over it; a Tanker stood 5 m in it. Every hull with a fit, at three
 * station sizes: feet on the deck to a centimetre. */
console.log('--- each hull on her own gear ---');
(function () {
  var bad = [], n = 0;
  Object.keys(global.HullFit || {}).forEach(function (h) {
    var f = Render.hullFit(h);
    if (!f || !(f.ground < 0)) return;
    [0.3, 1.32, 4.91].forEach(function (r) {
      st.radius = r;
      n++;
      var g = Gen.bayGeometry(st);
      var feet = (g.standoff * r + Sim.standLiftKm({ hullId: h }, st)) * 1000 + f.ground;
      if (Math.abs(feet) > 0.01) bad.push(h + ' at ' + r + ' km: ' + feet.toFixed(2) + ' m');
    });
  });
  st.radius = R0;
  check('every hull\'s feet are on the deck at every station size', n > 0 && bad.length === 0, n + ' cases; ' + bad.slice(0, 4).join('; '));
  /* F: AND AT A GROUND PORT (2026-11-03). Ground ports kept the old flat
   * half metre over the berth's standoff, so at Harrow Deep (standoff
   * 1.79 m) a Talon's centre stood 2.29 m over the bay floor on feet 4.78 m
   * under it: her gear 2.5 m into the floor, the Tanker's 9.3 m. Every hull
   * with a fit, at every ground port of the kawartha start: feet on the
   * floor to a centimetre. */
  var gsys = Gen.generateSystem('kawartha'), gbad = [], gn = 0;
  gsys.ports.filter(function (p) { return p.surface && !p.seaPlatform; }).forEach(function (p) {
    var g = Gen.bayGeometry(p);
    if (!g || !(g.standoff > 0)) return;
    Object.keys(global.HullFit || {}).forEach(function (h) {
      var f = Render.hullFit(h);
      if (!f || !(f.ground < 0)) return;
      gn++;
      var feet = (g.standoff * p.radius + Sim.standLiftKm({ hullId: h }, p)) * 1000 + f.ground;
      if (Math.abs(feet) > 0.01) gbad.push(h + ' at ' + p.name + ': ' + feet.toFixed(2) + ' m');
    });
  });
  check('every hull\'s feet are on the floor at every ground port', gn > 0 && gbad.length === 0, gn + ' cases; ' + gbad.slice(0, 4).join('; '));
  check('without a port it is the half metre on her gear it always was',
        Math.abs(Sim.standLiftKm({ hullId: 'talon' }) - 0.0005) < 1e-9, Sim.standLiftKm({ hullId: 'talon' }) + '');
})();

/* ---- G: NO SHEETS ------------------------------------------------------------
 * A connected piece of a station mesh flat to 1e-5 of a radius and a
 * hundredth of a radius or more across is a wall or a floor drawn as a
 * sheet: a 1 px line edge-on (Astra: "can you ensure that the surfaces are
 * more than 1px thick?"). libPort thickens each to SHEET_SLAB. Every
 * orbital model, shell and interior: none left. Smaller flat pieces are the
 * decals, marks and caution strips laid on surfaces, and stay flat. */
console.log('--- no walls or floors drawn as sheets ---');
(function () {
  function sheets(m) {
    if (!m || !m.f) return 0;
    var par = {}, idOf = {}, nid = 0;
    function find(x) { while (par[x] !== undefined && par[x] !== x) x = par[x] = par[par[x]]; return par[x] === undefined ? (par[x] = x) : x; }
    var fk = m.f.map(function (f) {
      var first = -1;
      f.forEach(function (k) {
        var p = m.v[k], q = Math.round(p[0] * 1e5) + '|' + Math.round(p[1] * 1e5) + '|' + Math.round(p[2] * 1e5);
        var id = idOf[q] === undefined ? (idOf[q] = nid++) : idOf[q];
        if (first < 0) first = id; else { var a = find(first), b = find(id); if (a !== b) par[a] = b; }
      });
      return first;
    });
    var C = {};
    m.f.forEach(function (f, i) {
      var g = find(fk[i]), c = C[g] || (C[g] = { lo: [9, 9, 9], hi: [-9, -9, -9] });
      f.forEach(function (k) { var v = m.v[k]; for (var a = 0; a < 3; a++) { c.lo[a] = Math.min(c.lo[a], v[a]); c.hi[a] = Math.max(c.hi[a], v[a]); } });
    });
    var n = 0;
    Object.keys(C).forEach(function (g) {
      var c = C[g], e = [c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]].sort(function (a, b) { return a - b; });
      if (e[0] < 1e-5 && e[2] >= 0.01) n++;
    });
    return n;
  }
  var bad = [], total = 0;
  PLAIN.forEach(function (id) {
    var lib = Render.libPort(id);
    total += lib.sheetsThickened || 0;
    var n = sheets(lib.shell) + sheets(lib.interior);
    if (n) bad.push(id + ' ' + n);
  });
  console.log('  ' + total + ' walls and floors thickened across ' + PLAIN.length + ' models');
  check('no wall or floor in any station mesh is a sheet', bad.length === 0, bad.join('; '));
})();

/* ---- ROUTED BEFORE SHE ARRIVES (item 10, 2026-11-03) -----------------------
 * The first arrival at a routed berth paid its whole route search in one
 * frame (0.1-1.1 s a berth in node, up to 4.4 s on a loaded box).
 * Sim.warmTransfers routes a system's berths a few milliseconds a frame:
 * the answer must be the one the cold path finds, nothing may be routed
 * cold after it, and the work must actually come in slices. */
console.log('--- routes warmed in slices ---');
(function () {
  var wsys = Gen.generateSystem('warm-sweep');
  var ports = wsys.ports.filter(function (p) {
    var r = Render.portModelFor(p);
    return !p.surface && p.docking && r && global.PortLib[r] && /^(cylinder|cradle|spine)/.test(r);
  }).slice(0, 2);
  if (!ports.length) { check('a cylinder or cradle to warm', false); return; }
  /* The cold answer first, then forgotten, so the warm-up has to find it. */
  var cold = {}, routed = 0;
  ports.forEach(function (p) {
    var nb = Math.max(1, Gen.bayGeometry(p).berths);
    for (var i = 0; i < nb; i++) {
      if (!Gen.berthRoute(p, i)) continue;
      routed++;
      cold[p.id + '#' + i] = JSON.stringify(Sim.arrivalPath(p, i).through);
    }
    Sim.forgetTransfers(p);
  });
  var before = Sim.transferStats.cold, s0 = Sim.transferStats.slices, w0 = Sim.transferStats.warmed;
  var frames = 0, worst = 0, two = { ports: ports };
  for (;;) {
    var t0 = Date.now(), left = Sim.warmTransfers(two, 3);
    worst = Math.max(worst, Date.now() - t0);
    frames++;
    if (!left || frames > 100000) break;
  }
  var same = 0;
  Object.keys(cold).forEach(function (k) {
    var p = ports.filter(function (q) { return k.indexOf(q.id + '#') === 0; })[0], i = +k.split('#')[1];
    if (JSON.stringify(Sim.arrivalPath(p, i).through) === cold[k]) same++;
  });
  console.log('  ' + routed + ' routed berths at ' + ports.map(function (p) { return p.name; }).join(', ') +
              ': ' + frames + ' frames, ' + (Sim.transferStats.slices - s0) + ' slices, worst frame ' + worst + ' ms');
  check('every routed berth is warmed', Sim.transferStats.warmed - w0 === routed, (Sim.transferStats.warmed - w0) + ' of ' + routed);
  check('a warmed route is the route the cold path finds', same === routed, same + ' of ' + routed);
  check('nothing is routed cold once the system is warm', Sim.transferStats.cold - before === 0,
        (Sim.transferStats.cold - before) + ' cold');
  check('the work comes in slices, many per route', Sim.transferStats.slices - s0 > routed * 20,
        (Sim.transferStats.slices - s0) + ' slices');
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
