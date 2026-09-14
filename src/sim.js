/* sim.js — where the clockwork meets the chaos.
 *
 * Two different kinds of motion live in this file, on purpose:
 *
 *   Bodies (planets, moons, stations) are ON RAILS. Their position is
 *   evaluated analytically from orbital elements at time t. No integration,
 *   no error accumulation, no possibility of decay or ejection. You can warp
 *   a thousand years ahead, or come back from hyperspace, and the system is
 *   exactly where the maths says it should be.
 *
 *   The ship is FREE. It feels the summed Newtonian pull of every massive
 *   body at once — no sphere-of-influence switching, no fudging — integrated
 *   with RK4. That is where the interesting gameplay lives: slingshots,
 *   transfer burns, and the fact that a badly planned orbit really will put
 *   you into a mountain.
 */
(function (global) {
  'use strict';

  var V = global.V || require('./vec3.js');
  var K = global.Kepler || require('./kepler.js');
  /* Bound the same way, and needed for the same reason vec3 is: wreckage is
   * hashed off the victim's id rather than rolled. Bound at the top rather
   * than reached for through `global` at the call site — regCode below does
   * that and falls back to a hash of ZERO when it is missing, which for a
   * registration is a cosmetic wrong answer and for a debris field would be
   * every shard thrown in exactly the same direction. Under a browser-shaped
   * harness the globals hang off `window`, not off node's global, so the
   * bare name does not resolve; this is what the require fallback is for. */
  var RNG = global.RNG || require('./rng.js');
  /* The reference hull is defined in generate.js, because the generator has
   * to know what a ship can do before it can decide where ports may be. */
  var Gen = global.Gen || (typeof require !== 'undefined' ? require('./generate.js') : null);
  var SPEC = (Gen && Gen.SHIP_SPEC) || {};

  /* Gravitational parameter governing a body's orbit about its parent.
   * Using (parent + self) keeps finalize() and the evaluator in agreement. */
  function orbitMu(body, sys) {
    var parent = sys.byId[body.orbit.parent];
    return parent.mu + body.mu;
  }

  /* ---- rails ---------------------------------------------------------- */

  /* Absolute world position of a body at time t.
   * Cached per time value: a single frame asks for the same positions many
   * times (render, gravity substeps, HUD), and a moon's position requires
   * walking up to its planet and then to the star. */
  /* ---- bolted to the ground --------------------------------------------
   * A surface port has no orbit. It sits at a latitude and longitude on a
   * spinning world, which makes its position a pure function of t exactly
   * like everything else here — just driven by the world's rotation rather
   * than by Kepler's equation. Same guarantee: exact a thousand years out,
   * no integration, no drift.
   *
   * Worth noticing that this gives a pad a real velocity. A world turning
   * once a day carries its ports round at a few hundred metres a second,
   * so landing means matching that, and taking off hands it back to you. */
  function surfaceOffset(host, port, t) {
    var rot = host.rotation || { period: 86400, tilt: 0, phase: 0 };
    var w = K.TAU / rot.period;                  // rad/s, signed
    var lon = port.lon + rot.phase + w * t;
    var clat = Math.cos(port.lat), slat = Math.sin(port.lat);
    // Body-fixed equatorial frame, then tipped by the axial tilt about x.
    var ex = clat * Math.cos(lon), ey = clat * Math.sin(lon), ez = slat;
    var ct = Math.cos(rot.tilt), st = Math.sin(rot.tilt);
    var r = host.radius + (port.elevation || 0);
    var px = ex * r, py = (ey * ct - ez * st) * r, pz = (ey * st + ez * ct) * r;

    // v = omega x r, with omega = (0,0,w) tipped by the same rotation.
    var oy = -st * w, oz = ct * w;
    return {
      pos: { x: px, y: py, z: pz },
      vel: { x: oy * pz - oz * py, y: oz * px, z: -oy * px }
    };
  }

  function bodyState(body, sys, t) {
    var cache = sys._cache;
    if (cache.t !== t) { cache.t = t; cache.pos = {}; cache.vel = {}; }
    var hit = cache.pos[body.id];
    if (hit) return { pos: hit, vel: cache.vel[body.id] };

    var pos, vel;
    if (body.surface) {
      var hostState = bodyState(body.parentBody, sys, t);
      var off = surfaceOffset(body.parentBody, body, t);
      pos = V.add(hostState.pos, off.pos);
      vel = V.add(hostState.vel, off.vel);
    } else if (!body.orbit) {
      pos = V.zero();
      vel = V.zero();
    } else {
      var rel = K.state(body.orbit, orbitMu(body, sys), t);
      var parent = bodyState(sys.byId[body.orbit.parent], sys, t);
      pos = V.add(parent.pos, rel.pos);
      vel = V.add(parent.vel, rel.vel);
    }
    cache.pos[body.id] = pos;
    cache.vel[body.id] = vel;
    return { pos: pos, vel: vel };
  }

  function bodyPosition(body, sys, t) { return bodyState(body, sys, t).pos; }
  function bodyVelocity(body, sys, t) { return bodyState(body, sys, t).vel; }

  /* Where a surface port's mouth is, regardless of how far underground the
   * port itself sits. For an open pad this is just bodyState(port, ...) —
   * elevation is already 0. For an underground bay it is the point on the
   * actual surface directly above the bay: same lat/lon, same rotation,
   * elevation 0. Docking, distances and the rest of the sim only ever care
   * where the port TRULY is (bodyState); this is purely for the entrance a
   * pilot can see from outside — the visual anchor render.js hangs the
   * shaft mesh from, and nothing else. */
  /* The ground frame at a surface port: local vertical plus two axes lying
   * flat on the ground. Derived exactly the way the renderer derives the
   * frame it draws the bay's mesh in — same cross products, same order —
   * because a berth computed in a different basis than the one the hangar
   * was drawn in is a ship parked in the wall. */
  function groundBasis(port, sys, t) {
    var host = port.parentBody;
    if (!host) return null;
    var ent = portEntrance(port, sys, t);
    var hs = bodyState(host, sys, t);
    var up = V.norm(V.sub(ent.pos, hs.pos));
    if (V.len(up) < 1e-9) return null;
    var east = V.norm(V.cross({ x: 0, y: 0, z: 1 }, up));
    if (V.len(east) < 1e-6) east = V.norm(V.cross({ x: 0, y: 1, z: 0 }, up));
    return { up: up, east: east, north: V.cross(east, up), entrance: ent };
  }

  /* ---- the same thing for something in orbit -----------------------------
   * groundBasis stands on a planet. An orbital station has no ground, so its
   * local frame is built from its own orbit: the model's +z along the orbit
   * normal, and its x/y spinning in the orbital plane.
   *
   * SAME SHAPE AS groundBasis ON PURPOSE — `up` is the model's +z, `east`
   * its +x, `north` its +y — because berthState is written against that
   * shape and a berth is a berth whether the shed is bolted to a rock or
   * flying round one. That is the whole of what was missing: the berth
   * arithmetic was already general, and only the frame was surface-only.
   *
   * IT MUST MATCH WHAT IS DRAWN, or ships park where the station is not.
   * The numbers below are main.js's `stationFrame`, moved here so there is
   * one derivation rather than two that have to be kept in agreement — the
   * rule the file already states about portModelFor, applied to the other
   * thing a port has to agree with itself about.
   *
   * THE SPIN, and which half of the model it belongs to. A model that
   * declares a `spin` bucket is drawn as a still shell with a turning ring
   * on top, and the bays are part of the SHELL: you dock to the hub, which
   * is precisely why the hub does not turn. Anything else holds still — see
   * the note on `frozen` below for why that default was inverted, and where
   * the question "does this model have a ring" now lives (Render.portSpins,
   * one copy, asked by the renderer that needs it). */
  function stationBasis(port, sys, t, still) {
    var host = port && port.parentBody;
    if (!host) return null;
    var ss = bodyState(port, sys, t);
    var hs = bodyState(host, sys, t);
    var up = V.norm(V.sub(ss.pos, hs.pos));
    if (V.len(up) < 1e-9) return null;
    var prograde = V.norm(V.sub(ss.vel, hs.vel));
    var normal = V.cross(up, prograde);
    if (V.len(normal) < 1e-9) return null;
    normal = V.norm(normal);
    /* One turn every couple of minutes, slower for bigger rings — as it
     * must be, or the rim runs at an absurd speed. */
    var rate = 0.06 / Math.max(0.4, port.radius || 1);
    /* STILL BY DEFAULT, and that is the opposite of what it used to be.
     *
     * The old default spun anything whose model declared no `stationSpin`
     * bucket — which is every model in the shipped library, so every
     * station in the game turned as one piece, docking throats and all.
     * That is precisely the case PORT-MODELS.md warns against: "a hub that
     * rotates with its own ring is not something a pilot can aim an
     * approach at." It is also the wrong read for the art, which is towers,
     * spines and cradles with flat decks and gantries rather than
     * centrifuges.
     *
     * So spin is opt-in now: a model turns only the geometry it puts in
     * `stationSpin`, and the renderer asks for that pass explicitly with
     * still=false. Everything else holds still, which is what the arrival
     * sequence needs to have something to aim at. Adding a real ring to a
     * model later is then purely additive. */
    var frozen = (still === undefined) ? true : !!still;
    var ang = frozen ? 0 : t * rate;
    return {
      up: normal,
      east: V.rotateAroundAxis(up, normal, ang),
      north: V.rotateAroundAxis(prograde, normal, ang),
      entrance: { pos: V.clone(ss.pos), vel: V.clone(ss.vel) }
    };
  }

  /* Either kind of port, one call. Everything that wants "where is this
   * port's local frame" should come through here rather than choosing. */
  function portBasis(port, sys, t) {
    if (!port) return null;
    return port.surface ? groundBasis(port, sys, t) : stationBasis(port, sys, t);
  }

  /* Which berth a ship gets. Stable per port and per hull size, so you are
   * put back in the same bay when you reload — a starport that reshuffles
   * its parking every time you look away is a starport you cannot learn.
   * Berth 0 is the large bay and is reserved for hulls that need it; the
   * rest take a small or a medium interchangeably. */
  function portHash(port) {
    var k = String((port && port.id) || 'x');
    var h = 0;
    for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return h;
  }

  /* A modelled port's berths as BOXES IN KILOMETRES, indexed exactly as
   * Gen.berthOffset indexes them. The shared sort is the whole point: if
   * this ordered them differently, berth 3 here and berth 3 there would be
   * two different alcoves and a ship would be measured against one and
   * parked in the other. */
  /* A model's berths IN ONE ORDER, and everything that indexes them goes
   * through here. The shared sort is the whole point: berthOffset places
   * the hull, berthBoxes measures whether it fits and berthRoom clamps the
   * camera inside it — three readers of "berth 3", and if any two of them
   * ordered the list differently they would be talking about different
   * alcoves. (generate.js's berthOffset carries the matching sort across
   * the module boundary; berths.test.js pins that the two agree.) */
  function sortedBerths(port) {
    var Gen = global.Gen;
    var mb = Gen && Gen.modelledBerths && Gen.modelledBerths(port);
    if (!mb || !mb.length) return null;
    return mb.slice().sort(function (a, b) {
      return a.mid[0] - b.mid[0] || a.mid[1] - b.mid[1] || a.mid[2] - b.mid[2];
    });
  }

  function berthBoxes(port) {
    var sorted = sortedBerths(port);
    if (!sorted) return null;
    var r = (port && port.radius) || 1;
    return sorted.map(function (b) {
      if (!b.min || !b.max) return null;        // a berth with no extent
      return [(b.max[0] - b.min[0]) * r,
              (b.max[1] - b.min[1]) * r,
              (b.max[2] - b.min[2]) * r];
    });
  }

  /* THE ROOM A BERTHED SHIP IS ACTUALLY IN, in the port's own normalised
   * units, or null when the port has no model to ask.
   *
   * The camera clamp used to measure against bayGeometry's chamber for
   * everything, which is right for a shed built from the constant table and
   * wrong for a modelled station: the ring parks you in an alcove out on
   * the rim at 0.65 radii while the chamber table describes a hall at the
   * hub. Clamping to the hall would have hauled the eye across the station
   * and through several walls to get there. The alcove IS the room. */
  function berthRoom(port, i) {
    var sorted = sortedBerths(port);
    if (!sorted) return null;
    var k = ((i % sorted.length) + sorted.length) % sorted.length;
    var b = sorted[k];
    if (!b || !b.min || !b.max) return null;
    return { x0: b.min[0], x1: b.max[0],
             y0: b.min[1], y1: b.max[1],
             z0: b.min[2], z1: b.max[2] };
  }

  /* What this ship needs a berth to be. Read off the model it wears, via
   * the one function that knows which model that is. */
  function hullBox(ship) {
    var R = global.Render;
    var kind = (ship && (ship.meshKind || ship.cls)) || 'courier';
    var sp = R && R.hullSpan ? R.hullSpan(kind) : null;
    return sp ? [sp.w, sp.h, sp.l] : [0.005, 0.005, 0.010];
  }

  /* Does this hull go in this alcove? Both boxes are sorted longest-first
   * before comparing, which allows the hull to lie along whichever of the
   * berth's axes is the long one — berths in the library open along +x,
   * -x and -y, and requiring a particular correspondence would condemn a
   * bay for being modelled sideways. */
  function boxFits(need, box) {
    if (!box) return false;
    var a = need.slice().sort(function (x, y) { return y - x; });
    var b = box.slice().sort(function (x, y) { return y - x; });
    return a[0] <= b[0] && a[1] <= b[1] && a[2] <= b[2];
  }

  function boxVol(box) { return box ? box[0] * box[1] * box[2] : 0; }

  /* Which berth a ship gets, and where a port has a model it is decided by
   * MEASUREMENT rather than by a table.
   *
   * The old rule was "dryMass over 260 tonnes takes berth 0, everything
   * else takes a hash", and both halves were wrong once real station art
   * arrived. Mass is not size. And berth 0 is not the large bay: berthOffset
   * sorts a model's berths across the shed and marks the BIGGEST `large`,
   * which is index 2 on the ring, 3 on the spine and 1 on the cradle — so
   * every heavy hull was being sent to a rim alcove.
   *
   * It never showed, because the stations are drawn far larger than the
   * fleet they were modelled around: the smallest berth in the library is
   * about twenty-five times the length of the biggest hull, so nothing
   * could fail to fit and nothing checked. Both halves of that are fixed
   * here — the fit is measured, and ships.test.js now sweeps the whole
   * fleet against every station model, so a hull added later cannot quietly
   * stop fitting somewhere.
   *
   * An UNMODELLED port has no boxes to measure and keeps the old rule,
   * which is the right answer for a shed built from a constant table. */
  function assignBerth(ship, port) {
    var Gen = global.Gen;
    var boxes = berthBoxes(port);
    if (!boxes || !boxes.length) {
      var n0 = (Gen && Gen.BERTH_COUNT) || 6;
      var big = (ship && ship.dryMass || 0) > 260;   // t; freighters and up
      if (big || n0 < 2) return 0;
      return 1 + (portHash(port) % (n0 - 1));
    }

    var need = hullBox(ship);
    var fits = [], i;
    for (i = 0; i < boxes.length; i++) if (boxFits(need, boxes[i])) fits.push(i);

    /* NOTHING FITS is still an answer. A hull wedged into the largest bay
     * the port has is a wrong thing you can see and report; a ship with no
     * berth at all is a throw from inside the docking code. The test is
     * what turns the first into a build failure. */
    if (!fits.length) {
      var best = 0;
      for (i = 1; i < boxes.length; i++) if (boxVol(boxes[i]) > boxVol(boxes[best])) best = i;
      return best;
    }

    /* The SMALLEST bay that takes it, so a courier does not park in the
     * heavy berth and leave a freighter circling. Ties broken by the port's
     * own hash, so the choice is still stable across a save and a reload. */
    fits.sort(function (a, b) { return boxVol(boxes[a]) - boxVol(boxes[b]) || a - b; });
    var floor = boxVol(boxes[fits[0]]) * 1.05;
    var band = fits.filter(function (j) { return boxVol(boxes[j]) <= floor; });
    return band[portHash(port) % band.length];
  }

  /* WHICH WAY A BERTHED HULL POINTS, in world space, and there is one of
   * these rather than three.
   *
   * A berth's outward direction used to be a scalar — ±1 along the port
   * frame's north — which can only express two of the six directions a bay
   * can open. That was survivable while every modelled shed was the same
   * shed, and stopped being survivable the moment real station art arrived:
   * a ring opens its side bays along ±x and a spine opens two opposed rows,
   * none of which is ±north.
   *
   * So when the model declares a normal, use it whole; otherwise fall back
   * to the scalar, which is still what an unmodelled port returns. Three
   * call sites needed this answer (the surface dock, the orbital dock and
   * the arrival rail's final leg) and three copies of it would have been
   * three chances to disagree about which way a ship is parked. */
  function berthFacing(basis, off) {
    if (off && off.normal) {
      var n = off.normal;
      var v = V.addScaled(V.scale(basis.east, n[0]), basis.north, n[1]);
      v = V.addScaled(v, basis.up, n[2]);
      if (V.len(v) > 1e-9) return V.norm(v);
    }
    return V.norm(V.scale(basis.north, (off && off.facing) || 1));
  }

  /* ---- A STATION IS A SOLID OBJECT -------------------------------------
   *
   * Render.portSolidity voxelises a model once and answers "wall / open
   * space / room" for a point in its normalised frame. This is the half
   * that knows about PORTS rather than meshes: which role a port wears,
   * where its doors are, and how to get from a world position into the
   * model's own frame.
   *
   * The doors are cut here, on first use, because where a berth's throat
   * runs is something Gen.berthApertures answers off the art and render.js
   * has no business asking a second time. The grid is cached per ROLE and
   * the cut is in station radii, so every station wearing a model shares
   * one carved grid — the cut does not depend on how big the station is.
   *
   * A station with no modelled berths gets the hall's hatch cut instead,
   * straight down the hub axis, which is the route its arrival flies. */
  function stationSolidity(port) {
    var R = global.Render, Gen = global.Gen;
    if (!R || !R.portSolidity || !Gen || !port || port.surface) return null;
    var role = R.portModelFor ? R.portModelFor(port) : null;
    if (!role) return null;
    var sol = R.portSolidity(role);
    if (!sol || sol.carved) return sol;

    var g = Gen.bayGeometry(port);
    var n = Math.max(1, g.berths), cut = 0;
    for (var i = 0; i < n; i++) {
      var ap = Gen.berthApertures ? Gen.berthApertures(port, i) : null;
      if (!ap || !ap.normal || typeof ap.gate !== 'number') continue;
      var off = Gen.berthOffset(port, i);
      /* From well outside the doors, in past the berth to the inner gate.
       * The lead matters: a corridor that starts AT the door plane leaves a
       * ship on final approach outside the cut and therefore inside a wall. */
      var lead = ap.gate + holdLead(port) + 0.2;
      var deep = (typeof ap.inner === 'number') ? Math.abs(ap.inner) : 0.2;
      R.carveThroat(sol,
                    [off.x + ap.normal[0] * lead,
                     off.y + ap.normal[1] * lead,
                     off.z + ap.normal[2] * lead],
                    [-ap.normal[0], -ap.normal[1], -ap.normal[2]],
                    lead + deep, g.mouthR);
      cut++;
    }
    if (!cut && g.mouthZ > 0) {
      R.carveThroat(sol, [0, 0, g.mouthZ + holdLead(port) + 0.2], [0, 0, -1],
                    holdLead(port) + 0.2 + (g.mouthZ - g.floorZ), g.mouthR);
    }
    sol.carved = true;
    return sol;
  }

  /* What is at this world point, as far as this station is concerned:
   * Render.SOLID_WALL, SOLID_IN (a room) or SOLID_OUT (open space).
   *
   * portBasis, on the STILL frame, because that is the frame the shell is
   * drawn on and the frame the berths are placed in. A collision hull that
   * turned while the hull it represents did not would be a wall in a place
   * with no wall in it. */
  function stationSolidAt(port, pos, sys, t) {
    var R = global.Render;
    if (!R) return 2;
    var basis = portBasis(port, sys, t);
    if (!basis) return R.SOLID_OUT;
    var r = port.radius || 1;
    var rel = V.sub(pos, basis.entrance.pos);
    var x = V.dot(rel, basis.east) / r,
        y = V.dot(rel, basis.north) / r,
        z = V.dot(rel, basis.up) / r;

    var sol = stationSolidity(port);
    if (sol && R.solidityAt) return R.solidityAt(sol, x, y, z);

    /* NO MODEL TO VOXELISE — ports.js absent, or a station wearing nothing.
     * The constant table's hall is then the only room there is, and it is
     * the room the procedural mesh draws and the arrival flies into, so it
     * is the room that has to answer here. Nothing is WALL in this case:
     * without geometry there is no honest way to say where the metal is,
     * and inventing a box to bounce off would be worse than letting a ship
     * through a station that has no model. */
    var Gen = global.Gen;
    var g = (Gen && Gen.bayGeometry) ? Gen.bayGeometry(port) : null;
    if (!g) return R.SOLID_OUT;
    /* Up to the MOUTH rather than the ceiling: the throat above the hall is
     * inside the station too, and it is the half of the route where the sky
     * coming back is most obviously wrong. */
    if (Math.abs(x) <= g.chamberX && Math.abs(y) <= g.chamberY &&
        z >= g.floorZ && z <= g.mouthZ) return R.SOLID_IN;
    return R.SOLID_OUT;
  }

  /* IS THIS POINT INSIDE A STATION — in a room of one, rather than merely
   * near it? The orbital twin of insideShaft, and it exists for the same
   * reason: undocking used to drop the sky, the planets and the orbit lines
   * back on you while the hull was still in the throat, drawn straight
   * through the station around it. Being docked was never the question; the
   * question is whether something is over your head.
   *
   * Returns the port, so the caller can use it as the enclosure. */
  function insideStation(pos, sys, t) {
    var R = global.Render;
    if (!R || !sys || !sys.ports) return null;
    for (var i = 0; i < sys.ports.length; i++) {
      var p = sys.ports[i];
      if (!p || p.surface || !p.docking) continue;
      /* Cheap reject first: a point further off than the model can reach is
       * not in any room of it, and this is what keeps the sweep from asking
       * every port in the system for a grid it will never use. */
      var r = p.radius || 1;
      if (V.dist(pos, bodyPosition(p, sys, t)) > r * 1.8) continue;
      /* A ROOM, OR A DOORWAY. Both are inside the hull, and the doorway
       * half matters: a cut throat is made of cells that were METAL before
       * the doors were opened, so it never became a room and a ship halfway
       * through one would otherwise have the sky handed back to it in the
       * middle of the wall. What is NOT inside is the corridor's lead-in,
       * which was open space before the carve and still is — which is how
       * holding off the doors stays outdoors. */
      var at = stationSolidAt(p, pos, sys, t);
      if (at === R.SOLID_IN || at === R.SOLID_DOOR) return p;
    }
    return null;
  }

  /* Where in the world berth `i` of this port is, and which way the ship
   * parked in it faces. */
  function berthState(port, sys, t, i) {
    var Gen = global.Gen;
    /* portBasis, not groundBasis. This function was always general — the
     * berth offsets come out of bayGeometry, which reads a modelled bay
     * whether that model is a starport or a station — and the only thing
     * keeping it on the ground was this line. An orbital dock used to leave
     * the hull frozen wherever it happened to be when clearance came
     * through, which from the seat is a ship parked in open space a few
     * hundred metres off a station it is supposedly inside. */
    var basis = portBasis(port, sys, t);
    if (!basis || !Gen || !Gen.berthOffset) return null;
    var g = Gen.bayGeometry(port);
    var off = Gen.berthOffset(port, i || 0);
    var r = port.radius || 1;
    var p = V.addScaled(basis.entrance.pos, basis.up, (off.z + g.lift) * r);
    p = V.addScaled(p, basis.east, off.x * r);
    p = V.addScaled(p, basis.north, off.y * r);
    return { pos: p, vel: V.clone(basis.entrance.vel), basis: basis, off: off };
  }

  /* Where the port's control cabinet is standing right now, and how far the
   * ship is from it.
   *
   * Placed through `groundBasis` exactly as `berthState` places a berth —
   * the cabinet's offset is in the same mouth-relative pad-radii frame, so
   * this is one more consumer of that basis rather than a second derivation
   * of where the ground is. House rule 6.
   *
   * Returns null when the port has no cabinet (an orbital clamp), which is
   * the answer the caller needs in order to say why. */
  function controlState(port, sys, t) {
    var Gen = global.Gen;
    if (!Gen || !Gen.controlFor) return null;
    var c = Gen.controlFor(port, sys);
    if (!c) return null;
    var basis = groundBasis(port, sys, t);
    if (!basis) return null;
    var r = port.radius || 1;
    var p = V.addScaled(basis.entrance.pos, basis.up, c.at.z * r);
    p = V.addScaled(p, basis.east, c.at.x * r);
    p = V.addScaled(p, basis.north, c.at.y * r);
    return { control: c, pos: p, vel: V.clone(basis.entrance.vel),
             range: c.commsRange * r, basis: basis };
  }

  /* In range of the cabinet? Distance in world km against a range expressed
   * in pad radii, converted once here so no caller has to know the unit. */
  function controlInRange(ship, port, sys, t) {
    var cs = controlState(port, sys, t);
    if (!cs || !ship || !ship.pos) return false;
    return V.dist(ship.pos, cs.pos) <= cs.range;
  }

  function portEntrance(port, sys, t) {
    var host = port.parentBody;
    var hostState = bodyState(host, sys, t);
    var off = surfaceOffset(host, { lat: port.lat, lon: port.lon, elevation: 0 }, t);
    return { pos: V.add(hostState.pos, off.pos), vel: V.add(hostState.vel, off.vel) };
  }

  /* ---- gravity -------------------------------------------------------- */

  /* Summed gravitational acceleration at a point, in km/s^2.
   * Softened at 0.35 radii so a trajectory that clips a body's centre
   * produces a large-but-finite force rather than NaN; impacts are detected
   * separately and honestly. */
  function acceleration(pos, sys, t, out) {
    var ax = 0, ay = 0, az = 0;
    var list = sys.gravBodies;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var bp = bodyPosition(b, sys, t);
      var dx = bp.x - pos.x, dy = bp.y - pos.y, dz = bp.z - pos.z;
      var d2 = dx * dx + dy * dy + dz * dz;
      var soft = b.radius * 0.35;
      if (d2 < soft * soft) d2 = soft * soft;
      var d = Math.sqrt(d2);
      var f = b.mu / (d2 * d); // mu / d^3, ready to multiply by the vector
      ax += dx * f; ay += dy * f; az += dz * f;
    }
    if (out) { out.x = ax; out.y = ay; out.z = az; return out; }
    return { x: ax, y: ay, z: az };
  }

  /* Which body is currently in charge of this point — the one exerting the
   * strongest pull. Drives the HUD readout and the reference frame the
   * player's apoapsis/periapsis are quoted in. */
  function dominantBody(pos, sys, t) {
    var best = null, bestPull = -Infinity;
    for (var i = 0; i < sys.gravBodies.length; i++) {
      var b = sys.gravBodies[i];
      var d = V.dist(bodyPosition(b, sys, t), pos);
      if (d < 1e-6) d = 1e-6;
      var pull = b.mu / (d * d);
      if (pull > bestPull) { bestPull = pull; best = b; }
    }
    return best;
  }

  /* ---- the ship ------------------------------------------------------- */

  /* Any unit vector not parallel to v, for building a starting basis. */
  function anyPerpendicular(v) {
    var ref = Math.abs(v.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    return V.norm(V.cross(ref, v));
  }

  /* "Up," locally: the direction away from whatever body currently
   * dominates this point. This is the reference the attitude ladder banks
   * and pitches against — the same local-vertical convention every
   * spacecraft navball and HUD in real use is built on. Between planets it
   * still resolves (toward whatever has the most pull, however faint),
   * so the ladder is always well-defined, just not always meaningful to
   * "level" against. */
  function localVertical(pos, sys, t) {
    var dom = dominantBody(pos, sys, t);
    var toBody = V.sub(bodyPosition(dom, sys, t), pos);
    var d = V.len(toBody);
    return { up: d > 1e-9 ? V.scale(toBody, -1 / d) : { x: 0, y: 0, z: 1 }, body: dom };
  }

  /* Where does a point sit relative to the ship's own body-frame axes?
   * The pure math behind the radar/compass HUD: a "plan view" through
   * ship-body-fixed fwd/right (fwd = 12 o'clock, right = 3 o'clock), with
   * "up" giving how far above (+) or below (-) that plane the point sits.
   * Deliberately tied to attitude, not to whatever camera happens to be
   * active, so the instrument reads the same in cockpit and orbit view —
   * exactly like a real aircraft's heading-up radar/HSI. */
  function relativeToShipFrame(ship, targetPos) {
    var rel = V.sub(targetPos, ship.pos);
    var range = V.len(rel);
    if (range < 1e-9) {
      return { range: 0, azimuth: 0, elevation: 0, fwd: 0, right: 0, up: 0 };
    }
    var fwd = V.dot(rel, ship.fwd);
    var right = V.dot(rel, ship.right);
    var up = V.dot(rel, ship.up);
    var planarRange = Math.hypot(fwd, right);
    return {
      range: range,
      azimuth: Math.atan2(right, fwd),           // 0 = dead ahead, +pi/2 = right, radians
      elevation: Math.atan2(up, planarRange || 1e-9),
      fwd: fwd, right: right, up: up              // raw ship-frame components, km
    };
  }

  /* Pitch and roll of a ship's attitude relative to a local-vertical
   * reference, i.e. the pure math behind the cockpit attitude ladder,
   * separated from drawing so it can be tested and reasoned about on its
   * own. "Pitch" is the angle of the nose above/below the local horizontal
   * plane; "roll" is how far the ship's own up has been rotated away from
   * local vertical, measured about the nose. Degenerate exactly when the
   * nose points along local vertical (looking straight at the zenith or
   * nadir), where "horizontal heading" stops being a meaningful concept —
   * every real ADI has this same pole. */
  function attitudeAngles(ship, upRef) {
    var fwd = ship.fwd;
    var vComp = V.dot(fwd, upRef);
    var horizFwd = V.sub(fwd, V.scale(upRef, vComp));
    var hLen = V.len(horizFwd);
    if (hLen < 1e-4) {
      return { pitchDeg: vComp > 0 ? 90 : -90, rollDeg: 0, horizFwd: null, degenerate: true };
    }
    horizFwd = V.scale(horizFwd, 1 / hLen);
    var pitchDeg = Math.asin(Math.max(-1, Math.min(1, vComp))) / (Math.PI / 180);

    var upRefPerp = V.sub(upRef, V.scale(fwd, V.dot(upRef, fwd)));
    var uLen = V.len(upRefPerp);
    var rollDeg = 0;
    if (uLen > 1e-6) {
      upRefPerp = V.scale(upRefPerp, 1 / uLen);
      rollDeg = Math.atan2(V.dot(V.cross(upRefPerp, ship.up), fwd), V.dot(upRefPerp, ship.up)) / (Math.PI / 180);
    }
    return { pitchDeg: pitchDeg, rollDeg: rollDeg, horizFwd: horizFwd, degenerate: false };
  }

  /* ---- the ship's mass budget ------------------------------------------
   * Once there is cargo, "how hard can I push" stops being a constant. The
   * drive produces a fixed FORCE, so acceleration is force over mass, and
   * mass is hull plus fuel plus whatever is in the hold. A full hold is
   * therefore genuinely slower to manoeuvre than an empty one, which is the
   * whole reason a trade route is a decision rather than a price lookup.
   *
   * Units: thrust in kN, masses in tonnes. kN/t is exactly m/s^2, so the
   * only conversion in here is the /1000 into the km/s^2 the rest of the
   * simulation speaks. */
  var G0 = 9.80665e-3;      // km/s^2, for Tsiolkovsky

  /* ---- two tanks, and only one of them is a decision -------------------
   *
   * The ship carries hydrogen for JUMPS and reaction mass for THRUSTERS,
   * and they are deliberately different problems.
   *
   * Jump fuel is the resource the game is about. It is scarce, it scales
   * with how much you are hauling, and running out of it strands you.
   *
   * Thruster propellant is not, and an earlier version was wrong to make it
   * so. The manoeuvring drive is a fusion torch with an exhaust velocity
   * north of a thousand km/s — the same performance the freighters must
   * have to fly the constant-acceleration transfers they fly — which means
   * nine tonnes of reaction mass is about nine hours of continuous
   * full-throttle burn. You will not spend that on an orbital insertion,
   * and stations top the tank off as part of docking. It is modelled, it is
   * displayed, and it will bite you if you hold the throttle down for half
   * a day in deep space; the rest of the time it is correctly beneath
   * notice. Flying should be about where to go, not about whether you can
   * afford to turn. */
  function cargoMass(ship) {
    var m = 0;
    for (var k in ship.cargo) m += ship.cargo[k];
    return m;
  }

  function shipMass(ship) {
    return ship.dryMass + ship.fuel + (ship.thrusterFuel || 0) + cargoMass(ship);
  }

  /* Exhaust velocity, km/s. Isp is quoted in seconds as everyone quotes it. */
  function exhaustVelocity(ship) { return (ship.thrusterIsp || ship.isp) * G0; }

  /* Tsiolkovsky on the thruster tank. With a torch drive this is a very
   * large number — that is the honest consequence of the exhaust velocity,
   * and it is why endurance rather than delta-v is the figure worth putting
   * in front of a pilot. */
  function deltaV(ship) {
    var m0 = shipMass(ship);
    var m1 = m0 - (ship.thrusterFuel || 0);
    if (m1 <= 0 || !(ship.thrusterFuel > 0)) return 0;
    return exhaustVelocity(ship) * Math.log(m0 / m1);
  }

  /* Seconds of continuous full-throttle burn left in the thruster tank.
   * The number a pilot can actually use. */
  function thrusterEndurance(ship) {
    // Tonnes per second, the same expression fuelBurn uses. (Reading this
    // as kg/s and then converting is exactly how the first version came out
    // a thousand times too long — nine thousand hours of endurance is a
    // number you notice, which is why there is a test for it.)
    var mdot = ship.thrustKN / (ship.thrusterIsp * 9.80665);
    if (!(mdot > 0)) return Infinity;
    return ship.thrusterFuel / mdot;
  }

  /* Recompute derived performance after anything changes the mass — a
   * trade, a refuel, a jettison. Cheap, so callers can just call it. */
  function refreshShip(ship) {
    ship.mass = shipMass(ship);
    ship.maxAccel = (ship.thrustKN / ship.mass) / 1000;   // km/s^2
    ship.deltaV = deltaV(ship);
    /* Frontal area for drag, derived rather than tabulated: area goes as
     * the two-thirds power of mass for anything built to roughly the same
     * proportions, so one expression covers every hull in the catalogue and
     * stays right for hulls nobody has written yet. Uses DRY mass, because
     * loading cargo makes a ship heavier without making it any wider —
     * which is exactly why a laden ship falls through an atmosphere faster
     * than an empty one, and it should. */
    ship.dragArea = 0.9 * Math.pow(Math.max(ship.dryMass || 1, 1), 2 / 3);
    /* Gear down is a third again as much to push through the air. Small
     * enough to ignore in vacuum, where it costs nothing at all, and large
     * enough that dropping it early on an entry is a decision rather than a
     * free habit — which is the only thing that makes remembering to raise
     * it worth anything. */
    if (ship.gear) ship.dragArea *= GEAR_DRAG_FACTOR;
    return ship;
  }

  var GEAR_DRAG_FACTOR = 1.34;

  /* Propellant burned in dt seconds at the ship's current thrust setting.
   *   mdot [kg/s] = F [N] / (Isp [s] * g0 [m/s^2])
   * with F = thrustKN * 1000, and the result divided by 1000 again to land
   * in tonnes — so the two conversions cancel and the expression below is
   * simply thrustKN * throttle * dt / (Isp * g0). Worth spelling out: the
   * first version of this dropped the newton conversion and burned fuel a
   * thousand times too slowly, which made the tank effectively infinite and
   * quietly removed the entire point of having range as a constraint. */
  function fuelBurn(ship, dt) {
    var throttle = ship.maxAccel > 0 ? V.len(ship.thrust) / ship.maxAccel : 0;
    if (throttle <= 0) return 0;
    return (ship.thrustKN * throttle * dt) / (ship.thrusterIsp * 9.80665);   // tonnes
  }

  function makeShip(pos, vel) {
    // Face prograde by default — the direction you are actually going is
    // the only sane default when nothing else has been chosen yet.
    var fwd = V.len(vel) > 1e-9 ? V.norm(vel) : { x: 1, y: 0, z: 0 };
    var right = anyPerpendicular(fwd);
    var up = V.cross(right, fwd);
    var ship = {
      pos: V.clone(pos),
      vel: V.clone(vel),
      thrust: V.zero(),      // commanded acceleration, km/s^2
      throttle: 0,
      maxAccel: 2.0e-5,      // recomputed from thrust/mass by refreshShip

      /* Mass budget. A fusion torch: high exhaust velocity, so the tank is
       * small relative to the delta-v it buys, but not free — a full hold
       * roughly halves both acceleration and range. */
      /* The hull's numbers live in generate.js, not here. The world is
       * built around them — whether a world may have a surface port at all
       * is decided by whether this ship can lift off it — so there has to
       * be exactly one copy, and the generator is the thing that needs it
       * first. The fallbacks below are only for loading sim.js alone. */
      dryMass: SPEC.dryMass || 42,
      thrustKN: SPEC.thrustKN || 1800,
      isp: 4200,                                  // legacy field
      thrusterIsp: SPEC.thrusterIsp || 450000,
      thrusterFuel: SPEC.thrusterFuel || 12,      // reaction mass; free on docking
      thrusterCap: SPEC.thrusterCap || 12,
      fuel: SPEC.fuel || 28,                      // hydrogen — JUMP fuel, the scarce one
      fuelCap: SPEC.fuelCap || 28,
      gear: false,                                // landing gear, Shift+G
      cargo: {},                                  // commodity id -> tonnes
      cargoCap: SPEC.cargoCap || 64,
      credits: SPEC.credits || 3200,
      fuelOut: false,

      landed: false,
      crashed: false,
      landedOn: null,
      docked: null,           // body this ship is docked to, or null

      /* Attitude: an orthonormal basis, NOT tied to the velocity vector.
       * A spacecraft can point anywhere regardless of where it's going —
       * that's the whole reason attitude and translation are separate
       * systems here, just as they are on a real vehicle. */
      fwd: fwd, up: up, right: right,
      angRate: { pitch: 0, yaw: 0, roll: 0 }   // rad/s, body-frame
    };
    return refreshShip(ship);
  }

  /* Simplification, noted honestly: real rigid-body rotation is
   * frictionless and would spin forever once started, same as translation.
   * We add damping here so the ship "coasts to a stop" when the player lets
   * go, the way almost every playable space sim models RCS with assumed
   * damping thrusters rather than making the player fight momentum on every
   * axis. A true free-rotation mode (no damping) would be a fine option to
   * add later, not a fix — this is a deliberate playability choice. */
  var ANG_ACCEL = 0.6;     // rad/s^2 while a rotation key is held
  var ANG_DAMPING = 1.8;   // 1/s
  var ANG_RATE_MAX = 0.8;  // rad/s

  function integrateAttitude(ship, dt, cmd) {
    var r = ship.angRate;
    r.pitch = clampRate(r.pitch + ((cmd.pitch || 0) * ANG_ACCEL - r.pitch * ANG_DAMPING) * dt);
    r.yaw   = clampRate(r.yaw   + ((cmd.yaw   || 0) * ANG_ACCEL - r.yaw   * ANG_DAMPING) * dt);
    r.roll  = clampRate(r.roll  + ((cmd.roll  || 0) * ANG_ACCEL - r.roll  * ANG_DAMPING) * dt);

    // Body rates -> one world-frame angular velocity vector, applied as a
    // single Rodrigues rotation this step (first-order but accurate for the
    // small angles a frame covers).
    var wx = ship.right.x * r.pitch + ship.up.x * r.yaw + ship.fwd.x * r.roll;
    var wy = ship.right.y * r.pitch + ship.up.y * r.yaw + ship.fwd.y * r.roll;
    var wz = ship.right.z * r.pitch + ship.up.z * r.yaw + ship.fwd.z * r.roll;
    var wLen = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (wLen > 1e-10) {
      var axis = { x: wx / wLen, y: wy / wLen, z: wz / wLen };
      var ang = wLen * dt;
      ship.fwd = V.rotateAroundAxis(ship.fwd, axis, ang);
      ship.up = V.rotateAroundAxis(ship.up, axis, ang);
    }
    orthonormalize(ship);
  }

  function clampRate(r) { return Math.max(-ANG_RATE_MAX, Math.min(ANG_RATE_MAX, r)); }

  /* Floating-point drift and the first-order rotation above both nudge the
   * basis away from orthonormal over many frames. Fix it every step — cheap,
   * and it means the ship model and cockpit view never visibly skew. */
  function orthonormalize(ship) {
    ship.fwd = V.norm(ship.fwd);
    ship.right = V.norm(V.cross(ship.fwd, ship.up));
    ship.up = V.cross(ship.right, ship.fwd);
  }

  /* One RK4 step of dt seconds starting at absolute time t.
   * The acceleration field is time-dependent (the bodies move underneath us),
   * so each stage samples the field at its own time offset. */
  /* ---- atmosphere -------------------------------------------------------
   * Density at an altitude, as a plain exponential. Below the surface it
   * clamps rather than running away to infinity, because the integrator can
   * and does step a ghost briefly underground before checkImpact catches
   * it, and an exponential evaluated at negative altitude would hand back a
   * drag force large enough to fling that ghost across the system. */
  function airDensity(body, altitudeKm) {
    var at = body && body.atmosphere;
    if (!at) return 0;
    if (altitudeKm >= at.top) return 0;
    if (altitudeKm < 0) altitudeKm = 0;
    return at.rho0 * Math.exp(-altitudeKm / at.scaleHeight);
  }

  /* Is the ship inside anything's air, and if so whose?
   *
   * Resolved ONCE per integration step rather than per RK4 stage: the four
   * stages span at most a few seconds of a body's orbit, so which body owns
   * the air cannot change between them, and doing the lookup four times
   * would put dominantBody back in the hot path that the trajectory work
   * just got it out of. */
  function anyAtmosphere(sys) {
    if (sys._anyAtmosphere === undefined) {
      var any = false;
      for (var i = 0; i < sys.bodies.length; i++) {
        if (sys.bodies[i].atmosphere) { any = true; break; }
      }
      sys._anyAtmosphere = any;
    }
    return sys._anyAtmosphere;
  }

  function atmosphereContext(pos, sys, t) {
    if (!anyAtmosphere(sys)) return null;
    var dom = dominantBody(pos, sys, t);
    if (!dom || !dom.atmosphere) return null;
    var st = bodyState(dom, sys, t);
    var alt = V.dist(pos, st.pos) - dom.radius;
    if (alt >= dom.atmosphere.top) return null;
    return { body: dom, pos: st.pos, vel: st.vel };
  }

  /* Drag acceleration, km/s^2.
   *
   *   a = ½ ρ v² (Cd·A) / m
   *
   * with ρ in kg/m³, v in km/s and m in tonnes, the unit conversions cancel
   * to exactly one half — the metres in v² cancel the tonnes in m. Worth
   * stating because it looks like a missing constant and is not.
   *
   * Velocity is measured RELATIVE TO THE BODY, not absolutely: a ship
   * parked in a planet's atmosphere is still doing 30 km/s around the star,
   * and charging it drag for the planet's own orbital motion would burn it
   * up while sitting on the pad. Rotation of the atmosphere itself is
   * ignored; it is a few hundred m/s against entry speeds in the thousands. */
  function dragAccel(pos, vel, atmo, ship) {
    if (!atmo) return ZERO_ACC;
    var alt = V.dist(pos, atmo.pos) - atmo.body.radius;
    var rho = airDensity(atmo.body, alt);
    if (rho <= 0) return ZERO_ACC;
    var rel = V.sub(vel, atmo.vel);
    var speed = V.len(rel);
    if (speed < 1e-9) return ZERO_ACC;
    var k = 0.5 * rho * speed * (ship.dragArea || DEFAULT_DRAG_AREA) /
            Math.max(ship.mass || 1, 1e-6);
    return { x: -rel.x * k, y: -rel.y * k, z: -rel.z * k };
  }

  var ZERO_ACC = { x: 0, y: 0, z: 0 };
  var DEFAULT_DRAG_AREA = 14;      // Cd*A, m^2 — a small ship, blunt side on

  function stepShip(ship, sys, t, dt) {
    var p0 = ship.pos, v0 = ship.vel, th = ship.thrust;
    var atmo = ship.noDrag ? null : atmosphereContext(p0, sys, t);

    var a1 = acceleration(p0, sys, t);
    var p1 = p0, v1 = v0;
    var d1 = dragAccel(p0, v1, atmo, ship);
    var A1 = { x: a1.x + th.x + d1.x, y: a1.y + th.y + d1.y, z: a1.z + th.z + d1.z };

    var p2 = V.addScaled(p0, v1, dt / 2);
    var v2 = V.addScaled(v0, A1, dt / 2);
    var a2 = acceleration(p2, sys, t + dt / 2);
    var d2 = dragAccel(p2, v2, atmo, ship);
    var A2 = { x: a2.x + th.x + d2.x, y: a2.y + th.y + d2.y, z: a2.z + th.z + d2.z };

    var p3 = V.addScaled(p0, v2, dt / 2);
    var v3 = V.addScaled(v0, A2, dt / 2);
    var a3 = acceleration(p3, sys, t + dt / 2);
    var d3 = dragAccel(p3, v3, atmo, ship);
    var A3 = { x: a3.x + th.x + d3.x, y: a3.y + th.y + d3.y, z: a3.z + th.z + d3.z };

    var p4 = V.addScaled(p0, v3, dt);
    var v4 = V.addScaled(v0, A3, dt);
    var a4 = acceleration(p4, sys, t + dt);
    var d4 = dragAccel(p4, v4, atmo, ship);
    var A4 = { x: a4.x + th.x + d4.x, y: a4.y + th.y + d4.y, z: a4.z + th.z + d4.z };

    var sixth = dt / 6;
    ship.pos = {
      x: p0.x + sixth * (v1.x + 2 * v2.x + 2 * v3.x + v4.x),
      y: p0.y + sixth * (v1.y + 2 * v2.y + 2 * v3.y + v4.y),
      z: p0.z + sixth * (v1.z + 2 * v2.z + 2 * v3.z + v4.z)
    };
    ship.vel = {
      x: v0.x + sixth * (A1.x + 2 * A2.x + 2 * A3.x + A4.x),
      y: v0.y + sixth * (A1.y + 2 * A2.y + 2 * A3.y + A4.y),
      z: v0.z + sixth * (A1.z + 2 * A2.z + 2 * A3.z + A4.z)
    };
    return ship;
  }

  /* ---- re-entry heating -------------------------------------------------
   * Compression heating, as a Sutton-Graves proxy: flux goes as the square
   * root of density times the CUBE of speed. No fluid dynamics, and none
   * needed — the cube is the whole story a player has to feel. It says that
   * halving your entry speed cuts the heating eightfold, which is precisely
   * the lesson a shallow approach is supposed to teach, and no amount of
   * real CFD would teach it better.
   *
   * Deliberately NOT part of stepShip. The integrator is run on throwaway
   * ghosts hundreds of times a second by the trajectory predictor and the
   * impact scanner, and a ghost that banked heat would either corrupt the
   * player's hull from a prediction or need the state carefully stripped
   * out afterwards. Heat belongs to the one real ship, so it is applied
   * from the live update and nowhere else. */
  var HEAT_K = 4.0;             // tunes sqrt(rho) * v^3 into heat units/s
  var HEAT_LIMIT = 100;         // hull starts cooking above this
  /* Stored heat is capped rather than left to accumulate. Uncapped, a steep
   * entry ran the figure to twelve times the limit within seconds, which
   * had two bad consequences: the damage rate became effectively unbounded,
   * and the heat shield's 42-a-second stopped mattering at all, since
   * nothing it sheds makes a dent in a number that large. Capping it means
   * the shield is always doing something you can feel, and the worst case
   * is a survivable ten hull points a second rather than an instant kill. */
  var HEAT_MAX = 300;
  var HEAT_DAMAGE = 0.025;      // hull points/s per unit of overshoot
  /* Tuned against the measured flux envelope rather than guessed. Across a
   * thick world, flux runs from 0.1 units/s high and slow to 10,000 deep
   * and fast — the cube law means SPEED is almost the whole story, and
   * dropping from orbital to a third of it cuts heating roughly fortyfold.
   *
   * Bare hull sheds 18, which covers a properly flown descent: slow first,
   * then down. It does not cover arriving at orbital speed, and should not.
   * The shield's 130 covers a fast entry at sensible altitude and still
   * fails if you take it deep at speed — there is meant to be a way to die
   * with one fitted, or it is not a decision, just a tax. */
  var BASE_HEAT_SHED = 18;      // what bare hull radiates away, units/s

  /* ---- surface-pad landing ---------------------------------------------
   * A pad no longer silently refuses a fast approach — you always touch
   * down, but touching down HARD costs hull, the same way heat does. These
   * are first-pass numbers meant to be tuned by flying it, not derived.
   * Speeds are km/s (the sim's native unit): dockMaxSpeed on a pad is
   * 0.03 = 30 m/s, so LAND_SAFE sits just under a comfortable manual
   * approach and LAND_FATAL is a genuine smack. */
  var LAND_SAFE_SPEED  = 0.02;   // km/s — at or below this, a clean seat, no damage
  var LAND_FATAL_SPEED = 0.09;   // km/s — at or above this, the hull does not survive
  var LAND_DAMAGE_MAX  = 140;    // hull points dealt at the fatal speed (> any hull's HP)
  var LAND_GEAR_UP_MULT = 3.0;   // a belly landing (no gear) multiplies the hit
  /* Contact damage: 0 below safe, ramping to LAND_DAMAGE_MAX at fatal,
   * squared so a small overspeed is cheap and the top of the range bites.
   * gearDown false triples it, so setting down on the hull hurts even slow. */
  function landingDamage(contactSpeed, gearDown) {
    if (contactSpeed <= LAND_SAFE_SPEED) return 0;
    var f = (contactSpeed - LAND_SAFE_SPEED) / (LAND_FATAL_SPEED - LAND_SAFE_SPEED);
    if (f > 1) f = 1;
    var dmg = f * f * LAND_DAMAGE_MAX;
    return gearDown ? dmg : dmg * LAND_GEAR_UP_MULT;
  }
  /* The flux that reads as a fully lit shock layer. Set at 60 to begin
   * with, which was far too low: a survivable entry already runs well past
   * it, so the glow pinned at maximum the moment air was touched and the
   * whole orange-to-white progression the shader draws was never once
   * visible in play. Only looking at it showed that up.
   *
   * 220 puts the interesting part of the curve where the interesting part
   * of the flight is — faint at speeds you can survive, fierce when you are
   * in trouble — and the square root spreads the low end out, because
   * apparent brightness is not linear in flux and the difference between
   * "warm" and "worryingly warm" is the one worth seeing. */
  var GLOW_REFERENCE = 220;

  function heatFlux(ship, sys, t) {
    var atmo = atmosphereContext(ship.pos, sys, t);
    if (!atmo) { ship.windDir = null; return 0; }
    var alt = V.dist(ship.pos, atmo.pos) - atmo.body.radius;
    var rho = airDensity(atmo.body, alt);
    if (rho <= 0) { ship.windDir = null; return 0; }
    var rel = V.sub(ship.vel, atmo.vel);
    var v = V.len(rel);
    /* Which way the air is arriving from, in world space. Stored rather
     * than recomputed by the renderer: it falls out of the flux
     * calculation for free, and it is the only thing the plasma shader
     * needs to know WHERE on the hull to burn — the windward faces, not
     * the whole ship. A hull that glows uniformly looks like it is on
     * fire; one that glows only where it is hitting the air looks like it
     * is going too fast, which is the thing being communicated. */
    ship.windDir = v > 1e-9 ? { x: rel.x / v, y: rel.y / v, z: rel.z / v } : null;
    return HEAT_K * Math.sqrt(rho) * v * v * v;
  }

  /* Returns hull damage dealt this step, so the caller can react to it
   * (warn, make a noise, kill the player) without sim.js having to know
   * what any of those mean. */
  function updateHeating(ship, sys, t, dt) {
    if (!(dt > 0)) return 0;
    var flux = heatFlux(ship, sys, t);
    ship.heatFlux = flux;

    /* Shedding is THROUGHPUT, and it is the whole distinction between the
     * two shields on sale. An energy shield is a bucket: large capacity,
     * refilled slowly, perfect against one hard hit and useless against a
     * sustained load. A heat shield is a pipe: no capacity at all, but it
     * moves heat away continuously for as long as the load lasts. Buying
     * the wrong one for the job is a real mistake, and it should be. */
    var shed = BASE_HEAT_SHED + (ship.heatShed || 0);
    ship.heat = Math.max(0, Math.min(HEAT_MAX,
                (ship.heat || 0) + (flux - shed) * dt));
    ship.reentryGlow = Math.max(0, Math.min(1, Math.sqrt(flux / GLOW_REFERENCE)));

    if (ship.heat <= HEAT_LIMIT) return 0;
    var dmg = (ship.heat - HEAT_LIMIT) * HEAT_DAMAGE * dt;
    if (ship.hullHp !== undefined) ship.hullHp = Math.max(0, ship.hullHp - dmg);
    return dmg;
  }

  /* ---- landing gear, as a thing with travel ------------------------------
   * `ship.gear` is the SWITCH — what the pilot asked for — and every rule
   * that depends on the gear reads it: the drag area, whether a pad will
   * catch you, whether open ground is a landing or a wreck. None of that
   * changes here, deliberately, because a mechanism that is legally down
   * only when it has finished moving is a new way to bounce off a pad.
   *
   * `ship.gearTravel` is where it actually IS, 0 stowed to 1 locked, and it
   * exists purely so the renderer has something to interpolate. The two are
   * allowed to disagree for a couple of seconds and nothing but the picture
   * cares.
   *
   * ON SIM TIME, like the weapon cooldowns and for the same stated reason:
   * the mechanism belongs to the world it is moving in. Under compression
   * that means it completes almost instantly, which is correct — time
   * really is passing — and never visible, because warp is pinned to 1x
   * anywhere you would be lowering the gear.
   *
   * ON THE GROUND IT IS DOWN, whatever the switch says. A berthed or landed
   * ship is standing on its legs; drawing it belly-down on a pad because a
   * flag was never set would be the same class of lie the baked-in legs
   * were. */
  var GEAR_TRAVEL_TIME = 2.4;   // seconds, hinge to lock

  function updateGear(ship, dt) {
    if (!ship) return 0;
    var want = (ship.gear || ship.landed || ship.docked) ? 1 : 0;
    var cur = typeof ship.gearTravel === 'number' ? ship.gearTravel : want;
    if (dt > 0) {
      var step = dt / GEAR_TRAVEL_TIME;
      cur = cur < want ? Math.min(want, cur + step) : Math.max(want, cur - step);
    }
    ship.gearTravel = cur;
    return cur;
  }

  /* A sensible integration step: a fixed small fraction of the orbital period
   * at the current distance from whatever body dominates. Close to a moon
   * that means seconds; out between planets it means many minutes. */
  function suggestedStep(ship, sys, t) {
    var dom = dominantBody(ship.pos, sys, t);
    var r = V.dist(bodyPosition(dom, sys, t), ship.pos);
    if (r < dom.radius) r = dom.radius;
    var localPeriod = K.TAU * Math.sqrt((r * r * r) / dom.mu);
    return Math.max(0.05, Math.min(localPeriod / 900, 7200));
  }

  /* Would advancing dtSim seconds fly straight through something?
   * A big warp jump takes one giant physical step; if the ship's current
   * trajectory intersects a body anywhere inside that span, the substepped
   * integration will find the impact correctly, but the PLAYER never saw it
   * coming — the periapsis was eaten between one rendered frame and the
   * next. This runs the same forward integration the trajectory line uses,
   * cheaply (it reuses suggestedStep's adaptive sizing, not a fixed fine
   * grid), and reports the first impact so callers can warn or cap warp
   * before committing to the jump rather than after. */
  function scanForImpact(ship, sys, t, dtSim, maxSteps) {
    maxSteps = maxSteps || 2000;
    var ghost = makeShip(ship.pos, ship.vel);
    var tt = t, remaining = dtSim;
    for (var i = 0; i < maxSteps && remaining > 1e-6; i++) {
      var h = Math.min(suggestedStep(ghost, sys, tt), remaining);
      stepShip(ghost, sys, tt, h);
      tt += h; remaining -= h;
      var hit = checkImpact(ghost, sys, tt);
      if (hit) return { body: hit, t: tt, inSeconds: tt - t, speed: ghost.impactSpeed };
    }
    return null;
  }

  /* Advance the ship by dtSim seconds of game time, substepping for accuracy.
   * If honest accuracy would need more substeps than we can afford in a
   * frame, we say so (physicsLimited) rather than quietly integrating
   * garbage — a lie in the physics is worse than a lower time warp. */
  function advanceShip(ship, sys, t, dtSim, maxSteps) {
    maxSteps = maxSteps || 3000;
    if (ship.landed || ship.crashed) return { t: t + dtSim, steps: 0, physicsLimited: false };

    var h = suggestedStep(ship, sys, t);
    var steps = Math.ceil(Math.abs(dtSim) / h);
    var limited = false;
    if (steps > maxSteps) { steps = maxSteps; limited = true; }
    if (steps < 1) steps = 1;
    h = dtSim / steps;

    /* Propellant is spent in SIMULATION seconds, not real ones. This is the
     * one place that distinction really bites: holding W at 10,000x burns
     * ten thousand times the fuel, because it is ten thousand times the
     * burn. Anything else would make time warp a free delta-v cheat. */
    ship.fuelOut = false;
    for (var i = 0; i < steps; i++) {
      if (ship.thrusterFuel <= 0 && V.len(ship.thrust) > 0) {
        ship.thrust = V.zero();
        ship.throttle = 0;
        ship.fuelOut = true;
      }
      var burn = fuelBurn(ship, Math.abs(h));
      if (burn > 0) {
        if (burn >= ship.thrusterFuel) {
          /* Ran dry inside this substep. Rather than pretend the whole step
           * was powered, scale the thrust down to what the remaining
           * reaction mass could actually deliver and then shut the drive
           * off. Note this is the THRUSTER tank; the jump tank is never
           * touched by manoeuvring. */
          var frac = ship.thrusterFuel / burn;
          ship.thrust = V.scale(ship.thrust, frac);
          ship.thrusterFuel = 0;
          ship.fuelOut = true;
        } else {
          ship.thrusterFuel -= burn;
        }
        refreshShip(ship);
      }
      /* WHERE THE HULL WAS, so the collision check can test the PATH
       * rather than the endpoint. Without it a fast ship steps straight
       * through a plate and nothing ever notices. */
      var was = V.clone(ship.pos), wasT = t;
      stepShip(ship, sys, t, h);
      t += h;
      var hit = checkImpact(ship, sys, t, true, was, wasT);
      if (hit) break;
    }
    if (ship.fuelOut) ship.thrust = V.zero();
    return { t: t, steps: steps, physicsLimited: limited, fuelOut: ship.fuelOut };
  }

  /* ---- other ships -----------------------------------------------------
   * Traffic is ON RAILS, in exactly the sense the planets are. A route is a
   * timetable — depart A, cross, sit at B, cross back — and this function
   * evaluates where that puts a ship at time t. Nothing is integrated, so
   * a freighter cannot drift, cannot need catching up after a warp jump,
   * and is in precisely the same place every time you visit that instant.
   *
   * The one thing worth being careful about is the reference frame, because
   * it is the same trap that bit the trajectory display and the ship's
   * spawn attitude. Interpolating between two ports in ABSOLUTE coordinates
   * would drag every local shuttle hop sideways through the planet's own
   * ~48 km/s solar orbit, and the result looks like the ship is being flung
   * across the system. So the crossing is computed relative to the two
   * ports' COMMON PARENT — the planet for a local hop, the star for an
   * interplanetary run — and only then placed back into world coordinates.
   *
   * The path itself is a spiral rather than a straight line: rotate the
   * departure direction toward the arrival direction while easing the
   * radius from one orbit to the other. That costs nothing extra, reads as
   * a transfer rather than a ruler line, and — the actual reason — it can
   * never pass through the body both ports are orbiting, which a straight
   * lerp between opposite sides of a star very much would. */
  function smootherstep(u) {
    return u * u * u * (u * (u * 6 - 15) + 10);
  }
  function smootherstepPrime(u) {
    return 30 * u * u * (u - 1) * (u - 1);
  }

  /* Body position/velocity WITHOUT touching the per-frame memo.
   *
   * Needed because a leg's geometry is defined at its scheduled departure
   * and arrival times, not at the current instant, and the normal
   * bodyState() cache holds exactly one time value — asking it for t+cruise
   * would flush every position the rest of the frame is about to reuse.
   * A station is three links from the root, so this is a handful of Kepler
   * solves and it is called once per leg, not once per frame. */
  function bodyStateAt(body, sys, t) {
    if (body.surface) {
      var hostAt = bodyStateAt(body.parentBody, sys, t);
      var off = surfaceOffset(body.parentBody, body, t);
      return { pos: V.add(hostAt.pos, off.pos), vel: V.add(hostAt.vel, off.vel) };
    }
    if (!body.orbit) return { pos: V.zero(), vel: V.zero() };
    var rel = K.state(body.orbit, orbitMu(body, sys), t);
    var parent = bodyStateAt(sys.byId[body.orbit.parent], sys, t);
    return { pos: V.add(parent.pos, rel.pos), vel: V.add(parent.vel, rel.vel) };
  }

  /* Where a ship parks when it is alongside a port rather than inside it —
   * straight "up" from the port, along the port's own radial. Returned as a
   * world vector so the cruise arc can blend into it at both ends. */
  function parkOffset(port, sys, t, parentFallback) {
    var host = port.parentBody || parentFallback;
    var ps = bodyStateAt(port, sys, t);
    var hs = bodyStateAt(host, sys, t);
    var radial = V.norm(V.sub(ps.pos, hs.pos));
    if (V.len(radial) < 1e-9) radial = { x: 0, y: 0, z: 1 };
    var park = (port.dockCaptureRadius || port.radius * 4) * 0.85;
    return { dir: radial, vec: V.scale(radial, park) };
  }

  /* A single leg's geometry, frozen.
   *
   * This is the fix for a bug worth recording. The first version built the
   * transfer arc from where the two ports are RIGHT NOW and rotated the
   * departure bearing toward the arrival bearing along the shorter way
   * round. But the ports keep orbiting during the crossing, so the angle
   * between them sweeps — and the instant it passes 180 degrees, "the
   * shorter way round" flips to the other side and the ship jumped bodily
   * across the sky mid-flight.
   *
   * A leg is therefore pinned to its own two moments in time: where port A
   * is when it departs, and where port B will be when it arrives. Those are
   * constants for the whole crossing, so the arc cannot flip, and the ship
   * still leaves exactly from A and still arrives exactly at B, because
   * those are the very points the arc was built from. It also makes the
   * "on rails" claim literally true: a leg is a fixed arc between two fixed
   * events, not a curve recomputed from live inputs every frame. */
  function legGeometry(route, sys, key, src, dst, parent, tDep, tArr) {
    if (route._leg && route._leg.key === key) return route._leg;

    var pDep = bodyStateAt(parent, sys, tDep), pArr = bodyStateAt(parent, sys, tArr);
    var sState = bodyStateAt(src, sys, tDep), dState = bodyStateAt(dst, sys, tArr);
    var s = V.sub(sState.pos, pDep.pos);
    var d = V.sub(dState.pos, pArr.pos);
    var rs = V.len(s), rd = V.len(d);
    var sh = rs > 1e-9 ? V.scale(s, 1 / rs) : { x: 1, y: 0, z: 0 };
    var dh = rd > 1e-9 ? V.scale(d, 1 / rd) : { x: 0, y: 1, z: 0 };

    var cosA = Math.max(-1, Math.min(1, V.dot(sh, dh)));
    var ang = Math.acos(cosA);
    var axis = V.cross(sh, dh);
    var al = V.len(axis);
    if (al < 1e-9) axis = anyPerpendicular(sh);
    else axis = V.scale(axis, 1 / al);

    route._leg = {
      key: key, sh: sh, dh: dh, rs: rs, rd: rd, ang: ang, axis: axis,
      chord: V.sub(d, s),
      vs: V.sub(sState.vel, pDep.vel), vd: V.sub(dState.vel, pArr.vel),
      srcPark: parkOffset(src, sys, tDep, parent),
      dstPark: parkOffset(dst, sys, tArr, parent)
    };
    return route._leg;
  }

  /* ---- where a moored ship actually is ----------------------------------
   * Traffic used to park alongside every port the same way, which is right
   * for a station in orbit and wrong for the two kinds of port that are
   * holes in a planet: a freighter "moored" at a surface pad hovered a few
   * kilometres over it for hours, and one at an underground bay hung above
   * the mouth it was supposed to be inside. Ports read as places when the
   * traffic uses them the way you do.
   *
   * Still a pure function of t — the pose is derived from the port, not
   * integrated — so nothing here breaks the rails. */
  function dockPose(dst, sys, t, parent) {
    var host = dst.parentBody || parent;
    var hs = bodyState(host, sys, t);
    var ds = bodyState(dst, sys, t);
    var up = V.norm(V.sub(ds.pos, hs.pos));
    if (V.len(up) < 1e-9) up = { x: 0, y: 0, z: 1 };

    if (dst.underground) {
      /* Down the shaft and out of sight. Parked a little below the collar,
       * so from orbit the bay reads as occupied rather than as a ship
       * sitting on a hole. */
      var mouth = portEntrance(dst, sys, t);
      var mup = V.norm(V.sub(mouth.pos, hs.pos));
      return {
        pos: V.addScaled(mouth.pos, mup, -(dst.tunnelRadius || dst.radius) * 1.6),
        vel: mouth.vel, up: mup, fwd: mup, inside: true
      };
    }
    if (dst.surface) {
      // Sitting on the pad, nose up, the way it would have landed.
      return {
        pos: V.addScaled(ds.pos, up, dst.radius * 0.4),
        vel: ds.vel, up: up, fwd: up, landed: true
      };
    }
    /* An orbital station: alongside, not inside. A freighter drawn exactly
     * on top of the port's own marker just looks like the marker got
     * brighter. */
    var park = (dst.dockCaptureRadius || dst.radius * 4) * 0.85;
    var along = V.sub(ds.vel, hs.vel);
    return {
      pos: V.addScaled(ds.pos, up, park), vel: ds.vel, up: up,
      fwd: V.len(along) > 1e-9 ? V.norm(along) : up
    };
  }

  /* The last of an approach and the first of a departure are flown as a
   * descent and a climb rather than as more of the crossing. This is the
   * fraction of a leg each of those takes. */
  var TRAFFIC_TOUCHDOWN = 0.05;

  function trafficState(route, sys, t) {
    var A = sys.byId[route.from], B = sys.byId[route.to];
    var parent = sys.byId[route.parentId];
    var period = route.period, cruise = route.cruise, lay = route.layover;

    var cycle = Math.floor((t - route.t0) / period);
    var cycleStart = route.t0 + cycle * period;
    var ph = t - cycleStart;

    var outbound, u, moored, tDep;
    if (ph < cruise) {
      outbound = true; moored = false; u = ph / cruise; tDep = cycleStart;
    } else if (ph < cruise + lay) {
      outbound = true; moored = true; u = 1; tDep = cycleStart;
    } else if (ph < 2 * cruise + lay) {
      outbound = false; moored = false;
      u = (ph - cruise - lay) / cruise; tDep = cycleStart + cruise + lay;
    } else {
      outbound = false; moored = true; u = 1; tDep = cycleStart + cruise + lay;
    }

    var src = outbound ? A : B, dst = outbound ? B : A;

    if (moored) {
      var pose = dockPose(dst, sys, t, parent);
      var moor = finishTraffic(route, pose.pos, pose.vel, pose.fwd, pose.up,
                               'moored', u, src, dst, outbound);
      moor.throttle = 0;              // parked; drives cold
      moor.landed = !!pose.landed;
      moor.inside = !!pose.inside;
      return moor;
    }

    var leg = legGeometry(route, sys, cycle * 2 + (outbound ? 0 : 1),
                          src, dst, parent, tDep, tDep + cruise);
    var ps = bodyState(parent, sys, t);

    var e = smootherstep(u);
    var dir = V.rotateAroundAxis(leg.sh, leg.axis, leg.ang * e);
    var r = leg.rs + (leg.rd - leg.rs) * e;
    // A small outward bow, so the arc reads as a transfer with an apoapsis
    // rather than as a radius sweep at constant altitude.
    r *= 1 + 0.055 * Math.sin(Math.PI * e);

    /* Blend from parked-alongside-A to parked-alongside-B across the
     * crossing, so the cruise meets the moored phase at both ends with no
     * step. Without this the ship jumped by the parking offset — small, but
     * exactly the kind of small jump that reads as a glitch. */
    var wpos = {
      x: ps.pos.x + dir.x * r + leg.srcPark.vec.x * (1 - e) + leg.dstPark.vec.x * e,
      y: ps.pos.y + dir.y * r + leg.srcPark.vec.y * (1 - e) + leg.dstPark.vec.y * e,
      z: ps.pos.z + dir.z * r + leg.srcPark.vec.z * (1 - e) + leg.dstPark.vec.z * e
    };

    /* Velocity, from the analytic derivative of the straight-chord form of
     * the same motion. It differs from the spiral's true derivative by a
     * few percent mid-crossing — invisible on a heading arrow — and is
     * right at both ends, where it is the difference between a ship that
     * arrives station-keeping and one that arrives sideways. */
    var ep = smootherstepPrime(u) / cruise;
    var velRel = {
      x: leg.vs.x + (leg.vd.x - leg.vs.x) * e + leg.chord.x * ep,
      y: leg.vs.y + (leg.vd.y - leg.vs.y) * e + leg.chord.y * ep,
      z: leg.vs.z + (leg.vd.z - leg.vs.z) * e + leg.chord.z * ep
    };
    var wvel = V.add(ps.vel, velRel);
    var heading = V.len(velRel) > 1e-9 ? V.norm(velRel) : dir;

    /* Past the midpoint the ship has flipped to brake — that is what a
     * constant-acceleration transfer IS, and it is the single detail that
     * makes watching traffic legible: a freighter coming toward you is
     * pointing at you, and one that has already turned over is showing you
     * its drive. The velocity is unchanged; only which way it faces. */
    var facing = u > 0.5 ? V.scale(heading, -1) : heading;

    /* Touchdown and lift-off. The crossing above ends alongside the port;
     * these last and first moments take the ship the rest of the way in —
     * down onto a pad, or down the shaft of a bay — and back out again. It
     * is an interpolation rather than a landing simulation, but it is the
     * difference between traffic that visits ports and traffic that stops
     * near them, and it costs one blend.
     *
     * Only surface pads and underground bays get this. A station in orbit
     * is already where a moored ship should be. */
    var phase = 'cruise', landing = 0, pose = null;
    if (u > 1 - TRAFFIC_TOUCHDOWN && (dst.surface || dst.underground)) {
      pose = dockPose(dst, sys, t, parent);
      landing = smootherstep((u - (1 - TRAFFIC_TOUCHDOWN)) / TRAFFIC_TOUCHDOWN);
      phase = 'descent';
    } else if (u < TRAFFIC_TOUCHDOWN && (src.surface || src.underground)) {
      pose = dockPose(src, sys, t, parent);
      landing = smootherstep(1 - u / TRAFFIC_TOUCHDOWN);
      phase = 'liftoff';
    }
    if (pose) {
      wpos = {
        x: wpos.x + (pose.pos.x - wpos.x) * landing,
        y: wpos.y + (pose.pos.y - wpos.y) * landing,
        z: wpos.z + (pose.pos.z - wpos.z) * landing
      };
      wvel = {
        x: wvel.x + (pose.vel.x - wvel.x) * landing,
        y: wvel.y + (pose.vel.y - wvel.y) * landing,
        z: wvel.z + (pose.vel.z - wvel.z) * landing
      };
      /* The nose comes up to vertical when the ship is CLOSE, not when the
       * clock says it is nearly there. Blending on the phase fraction had a
       * freighter standing on its tail thirteen thousand kilometres out,
       * because five percent of an interplanetary crossing is still a long
       * way — the manoeuvre belongs to the last few pad-widths, so it is
       * driven by the distance that is actually left. */
      var flare = V.dist(wpos, pose.pos);
      var faceUp = 1 - Math.min(1, flare / Math.max((dst.radius || 0.05) * 60, 8));
      facing = V.norm({
        x: facing.x + (pose.up.x - facing.x) * faceUp,
        y: facing.y + (pose.up.y - facing.y) * faceUp,
        z: facing.z + (pose.up.z - facing.z) * faceUp
      });
      if (V.len(facing) < 1e-9) facing = pose.up;
    }

    var st = finishTraffic(route, wpos, wvel, facing, dir, phase, u, src, dst, outbound);
    st.throttle = phase === 'cruise' ? 1 : Math.max(0.25, 1 - landing * 0.75);
    st.braking = u > 0.5 && phase !== 'liftoff';
    st.landing = landing;
    return st;
  }

  /* ---- ships that are not carrying anything ---------------------------
   * Police, escorts and pirates. Two kinds of rail: a police patrol or an
   * escort flies a timetable, which is exactly a trade route with an empty
   * manifest, so it goes straight through trafficState. A pirate instead
   * sits on a real Kepler orbit — nobody is expecting a pirate, so a
   * timetable would be the wrong shape for it, and an eccentric loiter
   * above a busy port is both cheaper and more honest.
   *
   * Either way it stays a pure function of t right up until the player is
   * close enough for it to matter. */
  function patrolState(spec, sys, t) {
    if (spec.live) return spec.live;

    /* A lifted trader has no rail of its own — its rail is the traffic
     * route it came off, and combat.js reaps it the moment it sleeps. If
     * anything asks in the one frame between those two events, the honest
     * answer is nothing. */
    if (spec.rail.type === 'lifted') return null;

    var st;
    if (spec.rail.type === 'route') {
      st = trafficState(spec.rail.route, sys, t);
    } else {
      var parent = sys.byId[spec.rail.parent];
      var ps = bodyState(parent, sys, t);
      var rel = K.state(spec.rail.el, parent.mu, t);
      var pos = V.add(ps.pos, rel.pos);
      var vel = V.add(ps.vel, rel.vel);
      var fwd = V.norm(rel.vel);
      if (V.len(fwd) < 1e-9) fwd = { x: 1, y: 0, z: 0 };
      st = finishTraffic(spec.rail.route || { id: spec.id, name: spec.name },
                         pos, vel, fwd, V.norm(rel.pos), 'loiter', 0,
                         parent, parent, true);
      // Loitering on a Kepler orbit is coasting: no thrust, just the idle
      // glow of a drive that is lit but not pushing.
      st.throttle = 0.12;
    }
    decorate(st, spec);
    return st;
  }

  function decorate(st, spec) {
    st.spec = spec;
    st.kind = spec.kind;
    st.faction = spec.faction;
    st.reg = spec.reg || (spec.reg = regCode(spec.id));
    st.name = spec.name;
    st.className = spec.className;
    st.color = spec.color;
    st.size = spec.size;
    st.hostile = spec.kind === 'pirate';
    st.mode = spec.mode || null;
    /* `cls` is the hull key the renderer looks a mesh up by. Trade ships
     * carry theirs from the route; patrols take it from their kind, so
     * every ship state has one and the renderer never has to work out which
     * sort of thing it is holding. */
    st.cls = spec.kind;
    return st;
  }

  /* Everything flying in the system at time t: freighters and patrols
   * together, because every consumer (renderer, radar, contact readout)
   * wants the same list and should not have to know which rail a given
   * ship happens to be on. */
  function shipsAll(sys, t) {
    if (sys._ships && sys._ships.t === t) return sys._ships.list;
    var list = trafficAll(sys, t).slice();
    var patrols = sys.patrols || [];
    for (var i = 0; i < patrols.length; i++) {
      if (patrols[i].dead) continue;
      var st = patrolState(patrols[i], sys, t);
      if (st) list.push(st);
    }
    sys._ships = { t: t, list: list };
    return list;
  }

  function nearestShip(sys, t, pos, maxRange) {
    var list = shipsAll(sys, t);
    var best = null, bestD = maxRange || Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = V.dist(list[i].pos, pos);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    if (best) best.range = bestD;
    return best;
  }

  /* ---- encounters -------------------------------------------------------
   * The one place where determinism is deliberately given up, and only
   * where it buys something a rail cannot: a ship reacting to the player.
   *
   * An NPC on a rail is free and exact. Inside WAKE_RANGE it is lifted off
   * the rail into a small steered agent that feels the same gravity field
   * the player does; outside SLEEP_RANGE it is put back. The hysteresis gap
   * matters — a single threshold would flicker a ship between two different
   * positions every frame at exactly the range where you are most likely to
   * be looking at it. Waking and sleeping both happen thousands of km away,
   * where the discontinuity is sub-pixel.
   *
   * Steering is a saturated PD controller toward a standoff point beside
   * the player. Saturation is what makes it read as a ship rather than a
   * spring: far away it is a flat-out burn, and it only becomes a
   * proportional hold in the last few km.
   *
   * Time is the awkward part. Space is big enough that closing even 3000 km
   * at a few g takes minutes of real time, so NPCs integrate in SIMULATION
   * seconds — an intercept resolves in seconds of real time while you are
   * warping. Once anyone is genuinely close, warp is pinned back down (the
   * caller enforces `warpCap`), because that is the moment the player needs
   * their own reaction time back. */
  var WAKE_RANGE = 3000;        // km — lift off the rail
  var SLEEP_RANGE = 5200;       // km — put back on it
  var CLOSE_RANGE = 250;        // km — warp is pinned to 1x inside this
  var PIRATE_STANDOFF = 18;     // km
  var POLICE_STANDOFF = 45;     // km
  var POLICE_DETERRENT = 30000; // km — a pirate will not work this close to the law

  function wakeNpc(spec, railState) {
    spec.live = {
      pos: V.clone(railState.pos), vel: V.clone(railState.vel),
      fwd: V.clone(railState.fwd), up: V.clone(railState.up), right: V.clone(railState.right),
      phase: 'live', progress: 0, from: railState.from, to: railState.to,
      route: railState.route, manifest: []
    };
    spec.mode = spec.kind === 'pirate' ? 'intercept'
              : spec.kind === 'police' ? 'inspect' : 'shadow';
    spec.modeSince = 0;
    spec.hailed = false;
    decorate(spec.live, spec);
    return spec.live;
  }

  function steerNpc(spec, sys, t, dtSim, ship) {
    var live = spec.live;
    var toShip = V.sub(ship.pos, live.pos);
    var range = V.len(toShip);
    /* Attackers close to knife range; everyone else holds a polite
     * distance. 6 km against 12 km guns means a fight is a fight, not an
     * exchange of letters. */
    var standoff = spec.mode === 'attack' ? 6
                 : spec.kind === 'pirate' ? PIRATE_STANDOFF : POLICE_STANDOFF;

    var aim;
    if (spec.mode === 'breakoff') {
      // Run for it: aim well past the player's far side.
      aim = V.addScaled(live.pos, V.norm(V.sub(live.pos, ship.pos)), SLEEP_RANGE);
    } else {
      // Hold station beside the player, on whatever bearing we came in from.
      var bearing = range > 1e-6 ? V.scale(toShip, -1 / range) : { x: 1, y: 0, z: 0 };
      aim = V.addScaled(ship.pos, bearing, standoff);
    }

    var offset = V.sub(aim, live.pos);
    var vErr = V.sub(spec.mode === 'breakoff' ? V.zero() : ship.vel, live.vel);
    var w = 0.010;                              // rad/s, closes in ~100 s
    var cmd = {
      x: offset.x * w * w + vErr.x * 2 * w,
      y: offset.y * w * w + vErr.y * 2 * w,
      z: offset.z * w * w + vErr.z * 2 * w
    };
    var mag = V.len(cmd);
    if (mag > spec.accel) cmd = V.scale(cmd, spec.accel / mag);

    /* Integrate in sim seconds, substepped. Capped rather than unbounded:
     * beyond this the caller has already pinned warp down, so a slight lag
     * costs nothing and an unbounded loop would cost a frame. */
    var remaining = Math.max(0, dtSim);
    for (var i = 0; i < 80 && remaining > 1e-6; i++) {
      var h = Math.min(remaining, 5);
      var g = acceleration(live.pos, sys, t);
      live.vel = {
        x: live.vel.x + (g.x + cmd.x) * h,
        y: live.vel.y + (g.y + cmd.y) * h,
        z: live.vel.z + (g.z + cmd.z) * h
      };
      live.pos = V.addScaled(live.pos, live.vel, h);
      remaining -= h;
    }

    // Point where it is going; that is what a pilot would do and it makes
    // the hull silhouette readable.
    var fwd = V.len(live.vel) > 1e-9 ? V.norm(V.sub(live.vel, ship.vel)) : live.fwd;
    if (V.len(fwd) < 1e-6) fwd = live.fwd;
    live.fwd = fwd;
    live.right = V.norm(V.cross(live.fwd, V.norm(live.pos)));
    if (V.len(live.right) < 1e-9) live.right = anyPerpendicular(live.fwd);
    live.up = V.cross(live.right, live.fwd);
    live.mode = spec.mode;
    // A woken NPC is manoeuvring hard, and the plume should say so.
    live.throttle = Math.min(1, mag / spec.accel);
    return range;
  }

  /* Is the law close enough to spoil a robbery? Checked against rail
   * positions as well as woken ones, so flying inside a patrol lane
   * genuinely protects you without anything needing to be simulated. */
  function policeNearby(sys, t, pos) {
    var patrols = sys.patrols || [];
    for (var i = 0; i < patrols.length; i++) {
      /* A warship counts. It is not the law in the sense a cutter is, but
       * no pirate is going to hold somebody up in front of one. */
      if (patrols[i].kind !== 'police' && patrols[i].kind !== 'navy') continue;
      var st = patrolState(patrols[i], sys, t);
      if (V.dist(st.pos, pos) < POLICE_DETERRENT) return patrols[i];
      }
    return null;
  }

  function updateEncounters(sys, t, dtSim, ship) {
    var result = { active: [], demand: null, closest: Infinity,
                    dangerClosest: Infinity, warpCap: Infinity };
    var patrols = sys.patrols || [];
    if (!patrols.length) return result;

    // Docked is safe. Nobody boards a ship sitting on a station's clamps.
    var safe = !!ship.docked || !!ship.landed;

    for (var i = 0; i < patrols.length; i++) {
      var spec = patrols[i];
      var state = patrolState(spec, sys, t);
      if (!state) continue;              // a lifted trader between sleep and reap
      var range = V.dist(state.pos, ship.pos);

      if (!spec.live && !safe && range < WAKE_RANGE) { wakeNpc(spec, state); }

      if (spec.live) {
        if (safe) { sleepNpc(spec); continue; }

        if (spec.kind === 'pirate' && spec.mode !== 'breakoff' && policeNearby(sys, t, ship.pos)) {
          spec.mode = 'breakoff';
          spec.brokeOffBecause = 'police';
        }

        range = steerNpc(spec, sys, t, dtSim, ship);
        spec.modeSince += dtSim;

        if (range > SLEEP_RANGE) { sleepNpc(spec); continue; }

        /* A pirate that has actually matched course and closed is in a
         * position to demand something. Requiring BOTH proximity and a low
         * relative speed is what stops a fly-past at 40 km/s counting as a
         * hold-up. */
        if (spec.kind === 'pirate' && spec.mode === 'intercept') {
          var relSpeed = V.dist(spec.live.vel, ship.vel);
          if (range < CLOSE_RANGE && relSpeed < 0.9) {
            spec.holdTime = (spec.holdTime || 0) + dtSim;
            if (spec.holdTime > 4) { spec.mode = 'demand'; spec.demanding = true; }
          } else {
            spec.holdTime = 0;
          }
        }

        /* A police scan needs no player input, unlike a pirate's demand —
         * it just HAPPENS once the patrol has held alongside long enough,
         * which is why this is a one-shot `scanNow` flag rather than a
         * mode the caller has to keep noticing. `spec.scanned` stops the
         * same patrol re-rolling every frame for the rest of the hold. */
        if (spec.kind === 'police' && spec.mode === 'inspect' && !spec.scanned) {
          var relSpeedP = V.dist(spec.live.vel, ship.vel);
          if (range < CLOSE_RANGE && relSpeedP < 0.9) {
            spec.scanHoldTime = (spec.scanHoldTime || 0) + dtSim;
            if (spec.scanHoldTime > 3) { spec.scanned = true; result.scanNow = spec; }
          } else {
            spec.scanHoldTime = 0;
          }
        }

        if (spec.demanding && spec.mode === 'demand') result.demand = spec;
        result.active.push(spec);
        result.closest = Math.min(result.closest, range);
        /* DANGEROUS is not the same question as CLOSE. A pirate closing to
         * rob you, or anything already shooting (`hostileToPlayer` — set
         * the instant a demand times out, a pirate is fired on, or a
         * wanted player draws a warrant into a fight; see combat.js), is
         * what actually needs the player's real-time reflexes. A `police`
         * patrol merely holding you for `mode: 'inspect'` is neither — the
         * scan "resolves itself the instant it happens... there is no
         * player choice the way a pirate's demand has one" (resolveScan's
         * own comment), so there is nothing here to react to and no reason
         * to make leaving afterward crawl at 1×. */
        var dangerous = spec.hostileToPlayer ||
          (spec.kind === 'pirate' && (spec.mode === 'intercept' || spec.mode === 'demand'));
        if (dangerous) result.dangerClosest = Math.min(result.dangerClosest, range);
      }
    }

    /* Warp policy. Anything awake keeps the clock sane — good enough for a
     * routine police scan, or a patrol just sharing your neighbourhood —
     * and a genuine threat pins it at 1×, because that is exactly when the
     * player needs to be able to react in real time. Once a scan finishes
     * (or a pirate breaks off) there is nothing dangerous left nearby and
     * the cap lifts back to 500 on its own, which is what lets you actually
     * leave rather than crawling away from an inspector who is done with
     * you. */
    if (result.active.length) result.warpCap = 500;
    if (result.dangerClosest < CLOSE_RANGE * 4) result.warpCap = 1;
    sys._ships = null;   // the live states just moved; drop the per-frame memo
    return result;
  }

  function sleepNpc(spec) {
    spec.live = null;
    spec.mode = null;
    spec.demanding = false;
    spec.holdTime = 0;
    spec.scanned = false;
    spec.scanHoldTime = 0;
  }

  /* Put every NPC in a system back on its rail. Called when the player
   * leaves the system entirely: a live agent's position is only meaningful
   * relative to a player who is no longer there, and leaving one frozen
   * mid-intercept would mean returning years later to find it still hanging
   * exactly where you left it. Back on the rail, it is wherever the
   * timetable says — which is the whole point of the rail. */
  function sleepAll(sys) {
    var patrols = sys.patrols || [];
    for (var i = 0; i < patrols.length; i++) {
      sleepNpc(patrols[i]);
      patrols[i]._demand = null;
    }
    sys._ships = null;
  }

  /* What a pirate wants, quoted in the player's own cargo. It asks for the
   * most valuable thing aboard; an empty hold is shaken down for credits
   * instead, because "you have nothing I want, carry on" would make running
   * empty strictly safer than the alternative and that is a boring rule. */
  function pirateDemand(spec, ship, Economy) {
    if (spec._demand) return spec._demand;
    var bestId = null, bestValue = -Infinity;
    for (var cid in ship.cargo) {
      if (ship.cargo[cid] <= 0) continue;
      var com = Economy.BY_ID[cid];
      if (!com || com.waste) continue;      // nobody robs you of your rubbish
      if (com.base > bestValue) { bestValue = com.base; bestId = cid; }
    }
    if (bestId) {
      spec._demand = {
        type: 'cargo', cid: bestId, name: Economy.BY_ID[bestId].name,
        tonnes: Math.max(1, Math.ceil(ship.cargo[bestId] * 0.6))
      };
    } else {
      spec._demand = {
        type: 'credits',
        credits: Math.max(200, Math.round(ship.credits * 0.25))
      };
    }
    return spec._demand;
  }

  function payPirate(spec, ship, Economy) {
    var d = pirateDemand(spec, ship, Economy);
    var paid;
    if (d.type === 'cargo') {
      var take = Math.min(d.tonnes, ship.cargo[d.cid] || 0);
      ship.cargo[d.cid] -= take;
      if (ship.cargo[d.cid] <= 1e-9) delete ship.cargo[d.cid];
      paid = take + 't of ' + d.name;
    } else {
      var cash = Math.min(d.credits, ship.credits);
      ship.credits -= cash;
      paid = Math.round(cash) + ' credits';
    }
    refreshShip(ship);
    spec.mode = 'breakoff';
    spec.demanding = false;
    spec._demand = null;
    spec.brokeOffBecause = 'paid';
    return paid;
  }

  /* Every hull that flies carries a registration — deterministic from its
   * id, so the same ship reads the same code forever without a byte of
   * stored state. Two letters, a dash, four digits: enough to quote over
   * comms, short enough for a scanner readout. */
  function regCode(id) {
    var h = global.RNG ? global.RNG.hashString('reg|' + id) : 0;
    var letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';           // no I/O/Q: they read as digits
    return letters[h % letters.length] +
           letters[Math.floor(h / 23) % letters.length] + '-' +
           ('000' + (h % 10000)).slice(-4);
  }

  function finishTraffic(route, pos, vel, fwd, upRef, phase, u, src, dst, outbound) {
    var right = V.cross(fwd, upRef);
    if (V.len(right) < 1e-9) right = anyPerpendicular(fwd);
    right = V.norm(right);
    var up = V.cross(right, fwd);
    return {
      route: route, id: route.id, name: route.name,
      reg: route.reg || (route.reg = regCode(route.id)),
      kind: route.kind || 'trade',
      cls: route.cls, className: route.className,
      size: route.size, color: route.color,
      pos: pos, vel: vel, fwd: fwd, up: up, right: right,
      phase: phase, progress: u, from: src, to: dst, outbound: outbound,
      manifest: outbound ? route.out : route.back
    };
  }

  /* Every traffic ship at time t, memoised per time value the same way body
   * positions are — the renderer, the radar and the HUD all ask for this
   * list within a single frame. */
  /* ---- berth occupancy ---------------------------------------------------
   * How many of a port's berths are taken, right now, and when the next one
   * comes free.
   *
   * CLOSED FORM, from the same timetable the ships fly. Every route already
   * knows its own period, cruise and layover, so "is route r moored at port P
   * at time t" is arithmetic — no counter to keep, nothing to save, nothing to
   * drift, and the answer is identical after a time warp, a reload, or a jump
   * out and back. A stateful occupancy count would have been the easier thing
   * to write and the wrong shape: it is the rails-versus-integration split
   * applied to a number instead of to a position.
   *
   * Capacity comes off the MODEL — bayGeometry reads a modelled bay's own
   * berth count — so a port with a bigger hangar really does hold more ships,
   * and re-exporting the model changes the game rather than just the picture.
   */
  var DEFAULT_BERTHS = 4;

  /* Does this hull need the large bay? The rule already exists — assignBerth
   * reserves berth 0 for hulls over 260t and hands out the rest
   * interchangeably — and the queue has to ask the SAME question, or a ship
   * would be told to wait for a berth it was not going to be given, or waved
   * into one it does not fit. One rule, two callers. */
  function needsLargeBerth(ship) {
    return ((ship && ship.dryMass) || 0) > 260;
  }

  /* The same question asked of a traffic route, which carries a class rather
   * than a mass. The split falls on the gap that already exists in
   * SHIP_CLASSES — hauler 0.090, freighter 0.120 — so this is not a tuned
   * threshold, it is the seam in the table. Measured across 25 systems and
   * 57,400 samples: the large bay is occupied 31% of the time and the five
   * small ones never once filled, which is what makes waiting a thing that
   * happens to big ships and not to couriers. */
  var LARGE_ROUTE_SIZE = 0.10;
  function routeNeedsLargeBerth(route) {
    return ((route && route.size) || 0) >= LARGE_ROUTE_SIZE;
  }

  function berthCapacity(port) {
    if (!port) return 0;
    if (typeof port.berths === 'number') return port.berths;
    if (Gen && Gen.bayGeometry) {
      var g = Gen.bayGeometry(port);
      if (g && typeof g.berths === 'number' && g.berths > 0) return g.berths;
    }
    return DEFAULT_BERTHS;
  }

  /* Which traffic routes are sitting at this port at time t, and when each of
   * them leaves. Sorted by departure so the caller can say how LONG a wait is
   * rather than only that there is one. */
  function berthOccupants(port, sys, t) {
    var out = [];
    if (!port || !sys || !sys.traffic) return out;
    for (var i = 0; i < sys.traffic.length; i++) {
      var route = sys.traffic[i];
      if (route.from !== port.id && route.to !== port.id) continue;
      var st = trafficState(route, sys, t);
      if (!st || st.phase !== 'moored') continue;
      if (!st.to || st.to.id !== port.id) continue;
      /* When this one goes. The moored window runs from the end of a cruise
         to the end of the layover, so the departure is the start of the
         moored phase plus the layover — derived from the route's own cycle
         rather than measured, for the same reason the occupancy is. */
      var cycle = Math.floor((t - route.t0) / route.period);
      var cycleStart = route.t0 + cycle * route.period;
      var ph = t - cycleStart;
      var leaves = (ph < route.cruise + route.layover)
        ? cycleStart + route.cruise + route.layover
        : cycleStart + route.period;
      out.push({ route: route, name: route.name, leavesAt: leaves,
                 large: routeNeedsLargeBerth(route) });
    }
    out.sort(function (a, b) { return a.leavesAt - b.leavesAt; });
    return out;
  }

  /* Whether THIS ship can have a berth here, now, and if not how long until
   * one it can use comes free.
   *
   * Full is not a property of the port alone — it is a property of the port
   * and the hull asking. A courier is essentially never turned away; a
   * freighter is, because there is one large bay and something is in it about
   * a third of the time. That asymmetry is the whole feature: it makes what
   * you fly matter at the door.
   */
  function berthStatus(port, sys, t, ship) {
    var cap = berthCapacity(port);
    var occ = berthOccupants(port, sys, t);
    var large = 0, small = 0, i;
    for (i = 0; i < occ.length; i++) { if (occ[i].large) large++; else small++; }

    var largeCap = cap >= 2 ? 1 : cap;          // berth 0, as assignBerth has it
    var smallCap = Math.max(0, cap - largeCap);

    var wantsLarge = needsLargeBerth(ship);
    var used = wantsLarge ? large : small;
    var mine = wantsLarge ? largeCap : smallCap;
    var full = used >= mine;

    /* The wait is until a berth OF THE RIGHT KIND frees, not until anything
       moves: telling a freighter it can go in four minutes because a shuttle
       is leaving would be a lie it could act on. */
    var next = 0;
    if (full) {
      for (i = 0; i < occ.length; i++) {
        if (occ[i].large === wantsLarge) { next = occ[i].leavesAt; break; }
      }
    }
    return {
      capacity: cap, largeCapacity: largeCap, smallCapacity: smallCap,
      occupied: occ.length, large: large, small: small,
      wantsLarge: wantsLarge,
      free: Math.max(0, mine - used),
      full: full,
      nextFreeAt: next || t,
      waitFor: full && next ? Math.max(0, next - t) : 0,
      occupants: occ
    };
  }

  function trafficAll(sys, t) {
    if (!sys.traffic || !sys.traffic.length) return [];
    if (sys._traffic && sys._traffic.t === t) return sys._traffic.list;
    var list = [];
    for (var i = 0; i < sys.traffic.length; i++) {
      /* A dead route stays dead — combat killed the ship that flew it. A
       * suppressed one is temporarily off the timetable because its ship
       * has been lifted into the encounter system (being robbed, usually)
       * and is being drawn from there instead. */
      var r = sys.traffic[i];
      if (r.dead || r.suppressed) continue;
      list.push(trafficState(r, sys, t));
    }
    sys._traffic = { t: t, list: list };
    return list;
  }

  /* The nearest traffic ship to a point, for the cockpit's contact readout.
   * Range-limited so a scan does not report a freighter four AU away as
   * "nearest contact", which is technically true and practically useless. */
  function nearestTraffic(sys, t, pos, maxRange) {
    var list = trafficAll(sys, t);
    var best = null, bestD = maxRange || Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = V.dist(list[i].pos, pos);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    if (best) best.range = bestD;
    return best;
  }

  /* Is the ship inside a landing pad's envelope, arriving gently enough to
   * use it?
   *
   * This is checked against the PADS, not against the ground. The first
   * version only looked once the ship had already crossed the planet's
   * radius — that is, once it was underground — so a perfect approach to a
   * hovering stop three hundred metres over the pad did nothing at all, and
   * the only way to land was to fly into the dirt and hope. A pad catches
   * you where a pad is, which is above the surface. */
  function padCapture(ship, sys, t) {
    var pads = sys.pads || [];
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i];
      var ps = bodyState(pad, sys, t);
      if (V.dist(ps.pos, ship.pos) > pad.dockCaptureRadius) continue;
      /* Speed relative to the PAD, which is itself being carried round by
       * the world underneath it. Hovering motionless above a spinning
       * planet is not hovering over the pad. */
      var contact = V.dist(ship.vel, ps.vel);
      /* A pad no longer REFUSES a fast or gear-up approach. The old model
       * returned null on either — you never landed and got no reason why,
       * indistinguishable from a broken pad. Now you always touch down when
       * you are over the pad; how hard you hit and whether the gear was
       * down is REPORTED, and the caller (checkImpact) turns that into hull
       * damage via landingDamage. This is the FE2 model: the game lets you
       * make the mistake and charges you for it, rather than quietly
       * declining to let you make it. */
      return { pad: pad, speed: contact, gearDown: !!ship.gear };
    }
    return null;
  }

  /* ---- LANDING IN A BERTH ----------------------------------------------
   *
   * Astra: "make stations consider you docked if you are gear down, moving
   * slowly and colliding with your berth's floor." Which turns docking from
   * a capture radius into a piece of FLYING — the same thing a pad already
   * is, and for the same reason.
   *
   * So this is padCapture's twin, deliberately, down to what it does NOT
   * check. A pad no longer refuses a fast or gear-up approach: you always
   * touch down, and how hard you hit and whether the gear was down is
   * REPORTED so the caller can charge you for it. Refusing would mean
   * bouncing off your own berth with no explanation, which is the failure
   * that model was written to avoid. A clean seat is free; a smack costs
   * hull; a belly landing costs three times as much.
   *
   * IN METRES, NOT IN RADII. Every other measurement around a port scales
   * with the port, and this one must not: the thing being caught is a
   * hull, and a hull is the same size at a two-hundred-metre station and a
   * one-kilometre one. Forty metres is a hull and a half — close enough
   * that you are unambiguously in the bay, loose enough to be flyable by
   * hand without instruments made for it.
   *
   * YOUR berth, not any berth. assignBerth is deterministic per ship and
   * port, so it is the same alcove traffic control cleared you into and the
   * same one the arrival rail would have carried you to. */
  var BERTH_CAPTURE_KM = 0.04;

  function berthCapture(ship, sys, t) {
    var Gen2 = global.Gen;
    var ports = sys.ports || [];
    for (var i = 0; i < ports.length; i++) {
      var p = ports[i];
      if (!p || p.surface || !p.docking) continue;
      var r = p.radius || 1;
      /* Cheap reject on the station before asking it anything expensive. */
      if (V.dist(bodyPosition(p, sys, t), ship.pos) > r * 2) continue;
      /* CLEARED, OR THE CLAMPS DO NOT CLOSE.
       *
       * Astra: "create a subsystem to ensure you aren't docked again unless
       * you leave and then come back or re-request landing permission."
       * There already is one. Clearance is granted on approach and SPENT
       * the moment you arrive, so a ship that has just launched holds none
       * — and the catch simply does not fire. Come back and the ten
       * kilometre sweep grants you another, or hail and ask; both re-arm
       * it, which is exactly the two ways out she described.
       *
       * It reads `ship.cleared` rather than calling Combat.isCleared
       * because that wants the whole game object and this has a ship. It is
       * the same flag, in the same place, keyed the same way.
       *
       * This does make an orbital berth a HARD gate where the soft one
       * fines you — but only for the three cases that were already being
       * refused out loud: wanted here, hostile, or full. A pilot who is
       * none of those is cleared automatically before they are within four
       * kilometres of the thing. */
      if (!(ship.cleared && ship.cleared[p.id])) continue;
      /* THE BERTH YOU ARE ACTUALLY IN, not the one you were assigned.
       *
       * The first version caught only assignBerth's answer, which is the
       * alcove traffic control cleared you into — defensible, and wrong to
       * fly. Put the hull down perfectly in the bay next door and nothing
       * happened, silently, which is the same trap as a door that never
       * opens. Worse, docking would then have moved you to the assigned
       * berth anyway, so a clean landing ended in a teleport.
       *
       * So: the nearest berth that FITS this hull. Fit still matters —
       * parking a freighter in a shuttle's alcove is not a landing, it is
       * a collision, and the wall test above will have said so. */
      var berth = -1, bs = null, bd = BERTH_CAPTURE_KM;
      var count = Math.max(1, (Gen2 && Gen2.bayGeometry) ? Gen2.bayGeometry(p).berths : 1);
      var boxes = berthBoxes(p);
      var need = hullBox(ship);
      for (var bi = 0; bi < count; bi++) {
        if (boxes && boxes[bi] && !boxFits(need, boxes[bi])) continue;
        var cand = berthState(p, sys, t, bi);
        if (!cand) continue;
        var cd = V.dist(cand.pos, ship.pos);
        if (cd > bd) continue;
        bd = cd; berth = bi; bs = cand;
      }
      if (!bs) continue;
      /* Speed relative to the STATION, which is itself in orbit at some
       * kilometres a second. Holding still against the stars a few metres
       * off a berth is not holding still against the berth. */
      return { port: p, berth: berth, speed: V.dist(ship.vel, bs.vel),
               gearDown: !!ship.gear };
    }
    return null;
  }

  /* ---- AND THE REST OF THE STATION IS SOLID ------------------------------
   *
   * "No collision detection enabled on the interiors or exteriors of
   * stations", and her call on it: solid hull, open door. Sim.stationSolidAt
   * answers wall / doorway / room / open space off the voxel grid, so this
   * is only the response.
   *
   * WHICH IS A STOP, NOT A CRASH. A station is a structure you are flying
   * INSIDE; clipping a doorframe on the way into a bay should cost you paint
   * and momentum, not the ship. So the hull takes landingDamage on the speed
   * it arrived at — the same curve a pad charges, so a gentle graze is free
   * and a fast one is not — and the ship is pushed back out of the wall with
   * its inbound motion killed.
   *
   * PUSHED OUT ALONG THE WAY OUT, found by asking the grid. A voxel has no
   * surface normal, but the directions that are NOT wall point away from
   * one, and their sum is a good enough normal for a hull that should not
   * have been there in the first place. Sampling a cell out rather than a
   * neighbour cell matters: at a big station a cell is forty metres, and
   * nudging by less than that leaves the hull still inside the wall and
   * colliding again on the next frame, which reads as being stuck. */
  var WALL_PUSH_CELLS = 1.35;

  function stationEscape(port, pos, sys, t) {
    var R = global.Render;
    var sol = stationSolidity(port);
    var basis = portBasis(port, sys, t);
    if (!sol || !basis || !R) return null;
    var r = port.radius || 1;
    var rel = V.sub(pos, basis.entrance.pos);
    var lx = V.dot(rel, basis.east) / r,
        ly = V.dot(rel, basis.north) / r,
        lz = V.dot(rel, basis.up) / r;
    var cell = [1 / sol.inv[0], 1 / sol.inv[1], 1 / sol.inv[2]];
    var dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    /* REACH FURTHER UNTIL SOMETHING IS NOT WALL. One cell out finds the
     * face you clipped; deep inside a thick structure — which is where a
     * hull ends up if it was put there rather than flown there — every
     * neighbour is wall too, and giving up leaves the ship buried and
     * colliding again on every frame forever. A cylinder's end cap is
     * exactly that thick. */
    for (var reach = WALL_PUSH_CELLS; reach <= 12; reach *= 2) {
      var n = { x: 0, y: 0, z: 0 }, found = 0;
      for (var i = 0; i < dirs.length; i++) {
        var d = dirs[i];
        var at = R.solidityAt(sol, lx + d[0] * cell[0] * reach,
                                   ly + d[1] * cell[1] * reach,
                                   lz + d[2] * cell[2] * reach);
        if (at === R.SOLID_WALL) continue;
        found++;
        /* Model axes onto world: x is east, y is north, z is up. */
        n = V.add(n, V.scale(basis.east, d[0]));
        n = V.add(n, V.scale(basis.north, d[1]));
        n = V.add(n, V.scale(basis.up, d[2]));
      }
      if (found && V.len(n) > 1e-9) {
        return { normal: V.norm(n),
                 step: Math.max(cell[0], cell[1], cell[2]) * reach * r * 1.1 };
      }
    }
    return null;                       // nowhere in this model is not wall
  }

  /* Did the hull just put itself through a station wall? Returns the port
   * it hit, having moved the ship out of it, or null. */
  /* HOW FAR BACK OFF A SURFACE A STOPPED HULL IS PLACED, as a fraction of
   * the step that hit it, plus an absolute floor. Purely so the next frame
   * does not start exactly on the face and re-collide against the same
   * triangle forever, which reads as being stuck. */
  /* The nearest hit of the hull's cross-section: the centreline plus four
   * segments offset by `rad` square to the direction of travel. `rad` is in
   * the same normalised units as the points. Returns the same shape
   * portSegmentHit does, so the caller resolves against it unchanged. */
  function bundleHit(R, role, a, b, rad) {
    var best = R.portSegmentHit(role, a, b);
    if (!(rad > 0)) return best;
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(L > 1e-12)) return best;
    dx /= L; dy /= L; dz /= L;
    /* Any vector not parallel to the travel, made perpendicular. */
    var ux = 0, uy = 0, uz = 1;
    if (Math.abs(dz) > 0.9) { ux = 1; uy = 0; uz = 0; }
    var d1 = ux * dx + uy * dy + uz * dz;
    ux -= dx * d1; uy -= dy * d1; uz -= dz * d1;
    var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    var vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    var offs = [[ux, uy, uz], [-ux, -uy, -uz], [vx, vy, vz], [-vx, -vy, -vz]];
    for (var i = 0; i < offs.length; i++) {
      var o = offs[i];
      var h = R.portSegmentHit(role,
        [a[0] + o[0] * rad, a[1] + o[1] * rad, a[2] + o[2] * rad],
        [b[0] + o[0] * rad, b[1] + o[1] * rad, b[2] + o[2] * rad]);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }

  /* Is this point walled in on every side within a hull's length, and if so
   * which way is out? Returns [nx, ny, nz, dist] in the model's own frame,
   * or null when any direction is clear — the test that keeps this from
   * firing on a ship flying past a station in open space, which is exactly
   * what the voxel grid's escape could not do once a cell grew to 300 m.
   * The way out is the direction with the most room, and the distance is
   * far enough to clear the surface it found. */
  function triangleEscape(R, role, at, r, ship) {
    if (!R.hullSpan || !ship || !ship.cls || !(r > 0)) return null;
    var sp = R.hullSpan(ship.cls);
    if (!sp) return null;
    /* A hull's longest dimension, in the model's normalised units. */
    var step = Math.max(sp.w, sp.h, sp.l) / r;
    if (!(step > 0)) return null;
    var dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    var best = null, bestT = -1;
    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i];
      var to = [at[0] + d[0] * step, at[1] + d[1] * step, at[2] + d[2] * step];
      var h = R.portSegmentHit(role, at, to);
      /* One clear direction and the hull is not buried — it is beside the
       * station, not inside it. */
      if (!h) return null;
      if (h.t > bestT) { bestT = h.t; best = d; }
    }
    /* Out along the roomiest axis, far enough to be past what it found. */
    return [best[0], best[1], best[2], step * (bestT + 0.25)];
  }

  var WALL_BACKOFF_KM = 0.002;          // 2 m
  /* And a metre of daylight off the face itself, so the next step does not
   * begin coplanar with the plate it just stopped against. */
  var WALL_SKIN_KM = 0.001;             // 1 m

  function checkStationImpact(ship, sys, t, from, fromT) {
    var R = global.Render;
    if (!R || !R.SOLID_WALL) return null;
    var ports = sys.ports || [];
    for (var i = 0; i < ports.length; i++) {
      var p = ports[i];
      if (!p || p.surface || !p.docking) continue;
      var r = p.radius || 1;
      if (V.dist(bodyPosition(p, sys, t), ship.pos) > r * 2) continue;

      /* ---- THE PATH, AGAINST THE ART ----------------------------------
       *
       * This used to be a point test against the voxel grid, and it was a
       * fair one while a cell was about the size of a hull. At
       * STATION_SCALE 3.5 a cell is 88-466 m against a 25 m ship, so the
       * grid cannot represent a wall at all and collision quietly stopped
       * working — which is exactly what Astra reported after the stations
       * grew. Render.portSegmentHit asks the triangles instead: no
       * resolution to outgrow, no watertightness required (these meshes
       * have four times as many unshared edges as shared ones), and it
       * tests the whole STEP rather than its endpoint, so a fast hull
       * cannot tunnel through a plate between two frames.
       *
       * The grid is still right for enclosure — "am I in a room" — which
       * is what stationSolidAt keeps answering. It was only ever wrong as
       * a surface. */
      var basis = portBasis(p, sys, t);
      var role = R.portModelFor ? R.portModelFor(p) : null;
      if (basis && role && R.portSegmentHit) {
        var toModel = function (b, w) {
          var rel = V.sub(w, b.entrance.pos);
          return [V.dot(rel, b.east) / r,
                  V.dot(rel, b.north) / r,
                  V.dot(rel, b.up) / r];
        };
        /* EACH END IN THE FRAME IT WAS MEASURED IN, and this is the whole
         * difference between a collision check and noise.
         *
         * A station's frame is not still: it rides an orbit at tens of
         * kilometres a second and spins on top of that. Measured here, one
         * 0.05 s step moves the frame 1521 m. Converting the START of the
         * step with the frame as it stands at the END therefore produced a
         * model-space segment a kilometre and a half long, pointing down
         * the orbit — a path the ship never flew, sweeping through whatever
         * geometry happened to lie along it. Real crossings were missed and
         * imaginary ones were available; collision read as simply absent,
         * which is what Astra kept reporting.
         *
         * Converting each end with its own basis gives the hull's path
         * RELATIVE TO THE STATION, which is the only frame in which "did I
         * hit that wall" is a meaningful question — and it keeps the spin
         * honestly, so a ring turning into a stationary ship still hits it. */
        var fb = (fromT === undefined || fromT === t)
          ? basis : (portBasis(p, sys, fromT) || basis);
        var b0 = from ? toModel(fb, from) : null;

        /* ---- THE HULL HAS A WIDTH, AND THAT IS NOT A REFINEMENT ---------
         *
         * A single segment tests where the ship's CENTRE went, and a
         * station is not a solid block — it is an open FRAME. The models
         * are watertight (welded by position, spine, ring and cradle have
         * no boundary edges at all), but watertight is not the same as
         * gapless: each girder is a closed solid with hundreds of metres of
         * daylight around it. Measured on spine-l, a 600 m line five metres
         * to the side of a face crosses the entire station without touching
         * anything. A point-sized ship threads between the members.
         *
         * Some of that is architecture and should stay flyable. What should
         * not is a 25 m hull fitting through a 10 m gap, which a point test
         * happily allows.
         *
         * So the ship stops being a point. A bundle of parallel segments —
         * the centreline plus four at the hull's own half-width, square to
         * the direction of travel — is the hull's cross-section, near
         * enough. A 25 m ship then cannot fit through a 10 m gap, which is
         * the correct answer whatever the mesh does, and the nearest hit of
         * the five is the one that stops it.
         *
         * Five queries rather than one, at about two microseconds each, and
         * only for a ship already within two radii of a station. */
        var hb = (R.hullSpan && ship.cls) ? R.hullSpan(ship.cls) : null;
        var rad = hb ? Math.max(hb.w, hb.h) * 0.5 / r : 0;
        var worst = 0, touched = false;
        /* RESOLVED UNTIL IT IS RESOLVED, not once.
         *
         * One pass is enough for a hull meeting one plate square on, and
         * that is the rare case. A station is a box of plates: kill the
         * motion into the first face and the hull slides along it straight
         * into the next one, in the same step. Resolving once and moving on
         * let it work its way between two surfaces and out the far side —
         * measured at 29 of 50 head-on shots ending up THROUGH the face
         * they were aimed at, while collisions were firing the whole time.
         * That is the shape of Astra's report: it hits something, and then
         * it keeps going.
         *
         * Four passes, because that is a corner in three dimensions plus
         * one, and a hull that still has somewhere to go after four has
         * found a crack rather than a wall. */
        /* OUTSIDE THE LOOP because the buried check below needs it even when
         * there is no previous position to sweep from — a caller with no
         * `from` (the chart's ghosts, a direct checkImpact) gets no path
         * test at all, and `b1` declared inside the loop would be undefined
         * for it. */
        var b1 = toModel(basis, ship.pos);
        for (var pass = 0; b0 && pass < 4; pass++) {
          b1 = toModel(basis, ship.pos);
          var sweep = bundleHit(R, role, b0, b1, rad);
          if (!sweep) break;
          touched = true;

          /* Back down the way we came — the start of the segment is a place
           * we know was clear — and then OFF the face along its own normal.
           * The retreat alone leaves the hull sitting exactly on the plate,
           * where the next step begins coplanar with it and the crossing
           * test cannot see the surface it is already touching. A metre of
           * daylight is what stops that. */
          var seg = V.sub(ship.pos, from);
          var segLen = V.len(seg);
          var back = segLen > 1e-9
            ? Math.min(1, (WALL_BACKOFF_KM / segLen) + 1e-4) : 0;
          var u = Math.max(0, sweep.t - back);

          /* The face normal, turned from model axes back into the world. */
          var nrm = V.norm(V.add(V.add(
            V.scale(basis.east,  sweep.normal[0]),
            V.scale(basis.north, sweep.normal[1])),
            V.scale(basis.up,    sweep.normal[2])));

          ship.pos = V.addScaled(V.addScaled(from, seg, u), nrm, WALL_SKIN_KM);

          var bv2 = bodyVelocity(p, sys, t);
          var rel2 = V.sub(ship.vel, bv2);
          var into2 = -V.dot(rel2, nrm);
          if (into2 < 0) into2 = 0;
          /* Kill the motion INTO the surface and keep the rest, so a hull
           * grazing a doorframe slides along it instead of stopping dead. */
          ship.vel = V.addScaled(ship.vel, nrm, into2);
          if (into2 > worst) worst = into2;
        }
        if (touched) return { port: p, speed: worst };
        /* NO CROSSING, NO COLLISION — AND THE GRID DOES NOT GET A SECOND
         * VOTE, which is the single worst bug in this file's history.
         *
         * The fallback below asks the voxel grid whether the hull is inside
         * a wall and, if it says yes, shoves it out by 1.35 CELLS. That was
         * a sane recovery when a cell was nine metres. At STATION_SCALE 3.5
         * a cell is 183-315 m, so the push is 248 to 425 m — and because
         * the grid at that resolution calls most of the space around a
         * station "wall", it fired on a hull merely flying NEAR one.
         *
         * Measured: a ship holding station thirty metres off a plate was
         * teleported 294 m sideways on its first step and every step after.
         * That is both of the things Astra has been reporting at once. You
         * cannot collide with a wall you are being flung away from, so
         * "collision is still not working"; and the camera's own target
         * jumps a quarter of a kilometre every frame, so it "keeps doing
         * that thing". One cause, two symptoms, and it was mine — the grid
         * was fine until I made the stations ten times bigger.
         *
         * Where there are triangles, they are the answer, and silence from
         * them means open space. The grid keeps the job it is good at:
         * enclosure, via insideStation — "am I in a room" is a question
         * about volume, where a coarse cell is a fair approximation, not a
         * question about surfaces, where it is not. */
        /* EXCEPT FOR A HULL THAT IS ALREADY BURIED, which is a different
         * question and needs a different test. A path test sees crossings;
         * a ship that was PUT inside solid — a save loaded into a station
         * that has since changed, an undock gone wrong — never crossed
         * anything and would simply be left there. So: cast a hull's length
         * along six axes, and if EVERY one of them hits, the ship is inside
         * something smaller than itself. That cannot fire in open space,
         * which is precisely what the grid's version could not promise. */
        var esc2 = triangleEscape(R, role, b1, r, ship);
        if (esc2) {
          var en = V.norm(V.add(V.add(
            V.scale(basis.east,  esc2[0]),
            V.scale(basis.north, esc2[1])),
            V.scale(basis.up,    esc2[2])));
          ship.pos = V.addScaled(ship.pos, en, esc2[3] * r);
          var bv3 = bodyVelocity(p, sys, t);
          var into3 = -V.dot(V.sub(ship.vel, bv3), en);
          if (into3 < 0) into3 = 0;
          ship.vel = V.addScaled(ship.vel, en, into3);
          return { port: p, speed: into3 };
        }
        continue;
      }

      /* ONLY WHERE THERE IS NO MODEL TO ASK. A procedural station has no
       * triangles, so the grid is the only thing that knows where its metal
       * is, and its escape is better than nothing. */
      if (stationSolidAt(p, ship.pos, sys, t) !== R.SOLID_WALL) continue;

      var esc = stationEscape(p, ship.pos, sys, t);
      var bv = bodyVelocity(p, sys, t);
      var rel = V.sub(ship.vel, bv);
      var into = esc ? -V.dot(rel, esc.normal) : V.len(rel);
      if (into < 0) into = 0;

      if (esc) {
        ship.pos = V.addScaled(ship.pos, esc.normal, esc.step);
        /* Kill the motion INTO the wall and keep the rest: a hull sliding
         * along a doorframe should slide, not stop dead. */
        ship.vel = V.addScaled(ship.vel, esc.normal, into);
      } else {
        /* NOWHERE TO PUSH IT. Deliberately nothing: matching the station's
         * velocity here pinned the hull in place and re-ran every frame,
         * which is a ship that cannot be flown out of the wall it is stuck
         * in. Being buried with no way out is already a bug state; freezing
         * the ship in it is the worst available answer to one. */
        return null;
      }
      return { port: p, speed: into };
    }
    return null;
  }

  /* Is the ship inside a starport's shaft or hangar on this body?
   *
   * The volume is the union of two boxes in the port's own ground frame:
   * the duct from the mouth down to the floor, and the shed at the bottom.
   * Generous by a margin, because the cost of saying no when the answer is
   * yes is a crash into the ground you are supposed to be flying through,
   * and the cost of saying yes when the answer is no is a few metres of
   * rock you can briefly clip.
   *
   * Only surface ports on `host` are checked, and only ones the ship is
   * genuinely near — this runs inside the collision loop. */
  var SHAFT_SLACK = 0.10;        // pad radii

  function insideShaft(ship, sys, t, host) {
    var Gen = global.Gen;
    var pads = sys.pads;
    if (!pads || !pads.length || !Gen || !Gen.bayGeometry) return null;
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (!p.surface || p.parentBody !== host) continue;
      var r = p.radius || 1;
      var basis = groundBasis(p, sys, t);
      if (!basis) continue;
      var rel = V.sub(ship.pos, basis.entrance.pos);
      var z = V.dot(rel, basis.up) / r;
      var g = Gen.bayGeometry(p);
      if (z > g.lift + SHAFT_SLACK || z < g.floorZ - 0.2) continue;
      var e = Math.abs(V.dot(rel, basis.east)) / r;
      var n = Math.abs(V.dot(rel, basis.north)) / r;
      // In the duct...
      if (z > g.floorZ && e < g.mouthR + SHAFT_SLACK && n < g.mouthR + SHAFT_SLACK) return p;
      // ...or in the shed under it.
      if (e < g.chamberX + SHAFT_SLACK && n < g.chamberY + SHAFT_SLACK) return p;
    }
    return null;
  }

  /* Did we hit something? Returns the body if so.
   *
   * `allowDock` is passed only by advanceShip, i.e. by the authoritative
   * ship. Trajectory prediction and the collision scanner run throwaway
   * copies of the ship through here too, and a ghost latching onto a
   * landing pad would end the prediction with a phantom dock rather than
   * telling the player what they wanted to know. */
  function checkImpact(ship, sys, t, allowDock, from, fromT) {
    /* THE STATION'S OWN HULL — and ONLY on the authoritative pass.
     *
     * The honest version of this would run for predicted ghosts too, since
     * a trajectory drawn straight through a station is a lie. It is gated
     * anyway, and the reason is the machine this game is for: the predictor
     * is where the frame time goes, it runs this hundreds of times per
     * frame at times that defeat the body-position cache, and the cheap
     * reject here is a distance to every station in the system — which is a
     * Kepler solve apiece. Paying that on every ghost step to make a line
     * on a chart slightly more truthful is the wrong trade on a Latitude.
     *
     * So: a real hull collides; a drawn prediction does not. If the chart
     * ever needs to know, the place to fix it is a cheaper broad phase, not
     * this line. */
    /* THE BERTH GETS ASKED FIRST, and that ordering is the whole of why a
     * manual landing did not take. A hull settling onto its own deck IS
     * touching station geometry, so the wall test fired, pushed it back off
     * the floor and killed the descent — every frame, forever, and the
     * capture below never got a hull that was still on the deck to catch.
     * berthCapture is pure and far more specific (cleared, gear down, slow,
     * inside a berth that fits), so when it answers, that is the answer.
     * Ramming a station at speed meets none of those and still hits a
     * wall. */
    var landing = allowDock ? berthCapture(ship, sys, t) : null;
    var wall = (allowDock && !landing) ? checkStationImpact(ship, sys, t, from, fromT) : null;
    if (wall) {
      var wdmg = landingDamage(wall.speed, !!ship.gear);
      if (wdmg > 0) {
        ship.hullHp -= wdmg;
        ship.lastLandingHit = { dmg: wdmg, speed: wall.speed,
                                gearDown: !!ship.gear, t: t, wall: true };
        if (ship.hullHp <= 0) {
          ship.hullHp = 0;
          ship.crashed = true;
          ship.crashedOn = wall.port;
          return wall.port;
        }
      }
    }

    /* Pads first, and independently of the ground. Coming to rest over a
     * starport is a landing; it should not have to become a collision with
     * the planet before anyone notices. */
    if (allowDock) {
      /* AND A BERTH IS A PAD IN ORBIT. Same shape, same consequences: you
       * touch down when you are in the bay, and how hard you hit and
       * whether the gear was down is what it costs. This is the manual way
       * in — it needs no clamp assigned, no autopilot and no capture
       * envelope, which is the whole point of it. The arrival rail still
       * exists for anyone who assigns a dock target and lets it fly. */
      var bcap = landing;
      if (bcap) {
        var bdmg = landingDamage(bcap.speed, bcap.gearDown);
        if (bdmg > 0) {
          ship.hullHp -= bdmg;
          ship.lastLandingHit = { dmg: bdmg, speed: bcap.speed,
                                  gearDown: bcap.gearDown, t: t };
          if (ship.hullHp <= 0) {
            ship.hullHp = 0;
            ship.crashed = true;
            ship.crashedOn = bcap.port;
            return bcap.port;
          }
        }
        dockShip(ship, bcap.port, sys, t, bcap.berth);
        ship.landed = false;
        ship.crashed = false;
        ship.landedOn = null;
        return bcap.port;
      }

      var cap = padCapture(ship, sys, t);
      if (cap) {
        var pad = cap.pad;
        /* The landing consequence, FE2-style: how hard you hit costs hull.
         * A clean seat (<= LAND_SAFE_SPEED) is free; a smack ramps to
         * fatal; gear-up multiplies it. This runs ONLY here, inside the
         * authoritative allowDock path, so the predictor's throwaway ghosts
         * never take real damage — the same guard the dock itself relies
         * on. Heat damage uses the identical `hullHp -= dmg` shape. */
        var ldmg = landingDamage(cap.speed, cap.gearDown);
        if (ldmg > 0) {
          ship.hullHp -= ldmg;
          ship.lastLandingHit = { dmg: ldmg, speed: cap.speed, gearDown: cap.gearDown, t: t };
          if (ship.hullHp <= 0) {
            /* You wrecked it on touchdown. Mark it; main.js reads `crashed`
             * and runs the loss the same way a hull-zero in combat does. */
            ship.hullHp = 0;
            ship.crashed = true;
            ship.crashedOn = pad;
            return pad;
          }
        }
        /* THIS is where a surface arrival actually begins. beginArrival
         * refuses when there is no bay geometry to be carried through, so a
         * bare pad still docks in one frame as it always did. */
        if (!beginArrival(ship, pad, sys, t)) dockShip(ship, pad, sys, t);
        ship.landed = false;
        ship.crashed = false;
        ship.landedOn = null;
        return pad;
      }
    }

    for (var i = 0; i < sys.bodies.length; i++) {
      var b = sys.bodies[i];
      if (b.kind === 'station') continue; // docking, not impact — handled elsewhere
      var bp = bodyPosition(b, sys, t);
      if (V.dist(bp, ship.pos) < b.radius) {
        /* Below the surface is not always underground. A starport is a
         * shaft cut through this exact ground, and a ship in the shaft —
         * descending, berthed, or climbing back out — is inside the body's
         * radius on purpose. Without this the first metre of a launch is
         * a crash into the planet you are standing in a hangar inside. */
        if (insideShaft(ship, sys, t, b)) continue;
        var bv = bodyVelocity(b, sys, t);
        var relSpeed = V.dist(ship.vel, bv);

        ship.landed = true;
        ship.landedOn = b;
        /* Gear down, 100 m/s relative is a hard but survivable arrival.
         * Gear up, there is no such thing as a good one — you are landing
         * on the hull, and the number that matters is not your speed. */
        ship.crashed = !ship.gear || relSpeed > 0.1;
        ship.impactSpeed = relSpeed;
        // Sit on the surface rather than inside it.
        var n = V.norm(V.sub(ship.pos, bp));
        ship.pos = V.add(bp, V.scale(n, b.radius));
        ship.vel = V.clone(bv);
        return b;
      }
    }
    return null;
  }

  /* ---- docking ---------------------------------------------------------
   * A station has no attitude of its own in this model — it doesn't spin or
   * bank — so a docked ship's offset from it only needs to be expressed in
   * the station's ORBITAL frame (radial / prograde / normal), not a full
   * attitude. Recomputing that frame from the station's live position and
   * velocity every frame is enough to keep the ship sitting still relative
   * to the station as it swings around its own orbit, with no extra state
   * to track on the station's side. */
  function orbitalBasis(pos, vel) {
    var radial = V.norm(pos);
    var prograde = V.norm(vel);
    var normal = V.norm(V.cross(radial, prograde));
    if (V.len(normal) < 1e-12) normal = { x: 0, y: 0, z: 1 };
    // Re-orthogonalize prograde against radial so small numerical wobble in
    // a near-circular station orbit can't tilt the docked ship over time.
    prograde = V.norm(V.cross(normal, radial));
    return { radial: radial, prograde: prograde, normal: normal };
  }

  /* Is the ship inside the target's capture envelope right now? Read-only —
   * callers decide whether to actually latch on. */
  function dockingStatus(ship, target, sys, t) {
    var ts = bodyState(target, sys, t);
    var rel = V.sub(ship.pos, ts.pos);
    var vrel = V.sub(ship.vel, ts.vel);
    var range = V.len(rel);
    var closingSpeed = range > 1e-9 ? -V.dot(rel, vrel) / range : 0; // + = approaching
    return {
      target: target, range: range, relSpeed: V.len(vrel), closingSpeed: closingSpeed,
      inRange: range <= (target.dockCaptureRadius || target.radius * 4),
      slowEnough: V.len(vrel) <= (target.dockMaxSpeed || 0.006)
    };
  }

  /* Latch the ship to the target. Captures the current offset in the
   * station's orbital frame so the relative position is preserved as the
   * station moves. */
  function dockShip(ship, target, sys, t, wantBerth) {
    var ts = bodyState(target, sys, t);
    /* Docking instantly ENDS any arrival, and this is the one place that
     * can be guaranteed to run for all of them: the rail's own last act is
     * to call this, but so is a save being loaded on top of a running
     * arrival, and so is anything that decides to skip the show. Left set,
     * `arrival` would have stepArrival dragging the hull back onto the rail
     * on the next frame, one frame after dockShip parked it. */
    if (ship) ship.arrival = null;

    /* A pad is not an orbital clamp. There is no orbital frame to express
     * an offset in — the thing is bolted to a planet — so the ship simply
     * sits on it, a few metres up, and rides round with the world. */
    if (target.surface) {
      ship.docked = target.id;
      /* Berthed, not parked on the roof. `height` survives as the fallback
       * for anything that has no bay geometry to place a berth in. */
      ship.dockOffset = { surface: true, berth: assignBerth(ship, target),
                          height: Math.max(0.006, target.radius * 0.05) };
      ship.thrust = V.zero();
      ship.throttle = 0;
      ship.angRate = { pitch: 0, yaw: 0, roll: 0 };
      ship.thrusterFuel = ship.thrusterCap;
      ship.fuelOut = false;
      refreshShip(ship);
      updateDockedShip(ship, sys, t);
      /* Parked, not stood on its tail. A berthed ship sits level with its
       * nose out toward the middle of the shed, which is how a thing that
       * has to be pushed back out is left. The old nose-up attitude was
       * from when a surface port was an open pad you took off vertically
       * from; leaving is a script now (see the launch clearance), and it
       * can stand the ship up itself. */
      var bs2 = berthState(target, sys, t, ship.dockOffset.berth);
      if (bs2) {
        ship.fwd = berthFacing(bs2.basis, bs2.off);
        ship.up = V.clone(bs2.basis.up);
        ship.right = V.cross(ship.fwd, ship.up);
      } else {
        var up = V.norm(V.sub(ship.pos, bodyPosition(target.parentBody, sys, t)));
        ship.fwd = V.clone(up);
        ship.right = anyPerpendicular(ship.fwd);
        ship.up = V.cross(ship.right, ship.fwd);
      }
      return;
    }

    /* IN A BERTH, not wherever the approach happened to end.
     *
     * This used to capture `ship.pos - station.pos` in the orbital frame and
     * freeze it, which is a perfectly good way to hold a ship still relative
     * to a moving station and a terrible description of being docked: the
     * hull stayed hanging in open space a few hundred metres off the hull it
     * was supposedly inside, while the market, the comms and the refuelling
     * all behaved as though it were parked on a deck. Astra, looking at it:
     * "so we're docked right now yeah? Why is the ship floating in empty
     * space and not parked in the docking bay?"
     *
     * The berth arithmetic needed nothing new — see berthState — so this is
     * now the same two lines the surface branch above runs, and a station
     * and a starport park a ship the same way for the same reasons.
     *
     * The captured offset is KEPT as the fallback. A station with no
     * modelled bay has no berth to put anything in, and holding position
     * off its side is the right answer there; it is only wrong when there
     * is a deck to stand on. */
    ship.docked = target.id;
    /* THE BERTH, IF THE CALLER KNOWS ONE. A ship that has just landed in a
     * bay is already in a bay, and re-deriving the answer from assignBerth
     * would pick it up and put it in a different one — a clean landing
     * ending in a teleport. Everything that does not know keeps the old
     * behaviour by passing nothing. */
    var oBerth = (typeof wantBerth === 'number' && wantBerth >= 0)
      ? wantBerth : assignBerth(ship, target);
    var obs = berthState(target, sys, t, oBerth);
    var basis = orbitalBasis(ts.pos, ts.vel);
    var rel = V.sub(ship.pos, ts.pos);
    var berthOut = null;
    if (obs) {
      ship.dockOffset = { station: true, berth: oBerth };
    } else {
      ship.dockOffset = {
        radial: V.dot(rel, basis.radial),
        prograde: V.dot(rel, basis.prograde),
        normal: V.dot(rel, basis.normal)
      };
    }
    ship.thrust = V.zero();
    ship.angRate = { pitch: 0, yaw: 0, roll: 0 };
    /* Reaction mass is topped up on the clamps, free. It is a bulk
     * commodity a station has in tanks and no reason to meter; the fuel
     * worth charging for, and worth the player thinking about, is the
     * hydrogen that crosses light years. */
    ship.thrusterFuel = ship.thrusterCap;
    ship.fuelOut = false;
    refreshShip(ship);

    /* BERTHED: move the hull into the bay FIRST, then work out which way it
     * is pointing from where it now is. `rel` is recomputed for the same
     * reason — it was measured from the approach position, and the ship is
     * no longer there.
     *
     * THE POSITION COMES FROM THE BERTH; THE ATTITUDE DOES NOT, and that
     * split is deliberate. The obvious thing is to take the pose wholesale
     * from the bay — nose along the berth's facing, up off the bay floor —
     * which is what a pad does and what this first tried. Three checks said
     * no, at ninety degrees each: a station's model +z is its ORBIT NORMAL,
     * so the bay floor is edge-on to the local vertical, and a ship stood on
     * it reads as lying on its side on every instrument in the cockpit.
     *
     * Those checks exist because of a real complaint — quit docked, come
     * back, and the attitude ladder reads ninety degrees of bank before you
     * have touched anything — and being level is the settled answer to it.
     * So level wins, and the nose gets the berth's facing flattened into
     * the horizontal plane: as much of the bay's own orientation as being
     * level leaves room for.
     *
     * WORTH A LOOK IN THE GAME. If the modelled bays turn out to have their
     * floors across the orbit normal rather than along it, the honest fix is
     * in the station models or in what the attitude indicator reads while
     * docked — not here. This is the conservative version: it puts the ship
     * in the bay, which is what was actually wrong, and changes nothing
     * about which way up a docked ship has read for the whole project. */
    if (obs) {
      updateDockedShip(ship, sys, t);
      rel = V.sub(ship.pos, ts.pos);
      berthOut = berthFacing(obs.basis, obs.off);
    }

    // Face the station on capture — cosmetic, but arriving nose-first and
    // ending up staring out into space would look wrong.
    /* Face the station on capture. The guard matters more than it looks:
     * if the ship is sitting exactly on the station's centre — which auto
     * -dock will not do but a script or a lucky approach can — then rel is
     * the zero vector, norm() of it is also zero, and the ship ends up with
     * a zero-length "forward". Nothing complains. Attitude integration
     * keeps it zero, the hull renders as a point, and anything that flies
     * along the nose (cruise, most obviously) silently stops moving the
     * ship at all. Fall back to the station's own prograde instead. */
    /* LEVEL FIRST, POINTING SECOND. The obvious construction — face the
     * station, then roll so up is as near the radial as it can be — is not
     * good enough, because it is only level when the nose happens to be
     * perpendicular to the radial. Approach a station from directly below it
     * and the nose IS the radial, at which point "as near as it can be" is
     * forty degrees off and the ship sits on the clamps cocked over.
     *
     * A berthed ship should be level whatever it flew in along, so up is the
     * radial outright and the nose gets whatever is left: the direction of
     * the station flattened into the horizontal plane. Being parked straight
     * matters more than aiming the nose exactly at the port. */
    /* THE UP REFERENCE IS NOT basis.radial. `orbitalBasis` takes absolute
     * position and normalises it, so its radial points away from the SYSTEM
     * ORIGIN — the star — not away from the planet the station is orbiting.
     * That is harmless for the dockOffset above, which only needs a
     * consistent frame that turns with the station, and it is quite wrong as
     * a local vertical: it left a berthed ship fifty-eight degrees off level
     * and reading three degrees of roll.
     *
     * orbitalBasisAt already answers this properly, against whatever body
     * actually dominates where the station is. */
    /* In a berth, the direction that means something is the berth's own —
     * out across the open floor of the bay. Off the side of a station with
     * no bay, it is back toward the thing holding you. Either way it is
     * flattened against the local vertical below, so the ship is level. */
    /* THE BAY WINS. Astra's call, 2026-09-14, after looking at it in the
     * game — which is exactly what the note above asked for.
     *
     * Everything below this was built to keep a berthed ship LEVEL against
     * the planet, because a station's model +z is its orbit normal and a
     * ship stood on a bay floor therefore reads as banked on the attitude
     * ladder. That is true, and the conclusion was backwards: the ladder was
     * answering a question you stopped asking the moment you docked. Keeping
     * the instrument happy cost the thing you can actually SEE, which is a
     * hull lying on its side in its own berth — measured at up = model +x,
     * ninety degrees out, at every station in the game.
     *
     * So a modelled berth gets the bay's own pose, the same three lines the
     * surface branch above runs and the same three arrivalPose ends on —
     * which also means the rail no longer snaps the hull to a different
     * attitude on its last frame. main.js reads the bay's up for the ladder
     * while you are berthed, so being level has moved to where it belongs:
     * the instrument, not the hull. */
    if (obs && berthOut) {
      ship.fwd = berthOut;
      ship.right = V.cross(ship.fwd, obs.basis.up);
      if (V.len(ship.right) < 1e-9) ship.right = anyPerpendicular(ship.fwd);
      ship.right = V.norm(ship.right);
      ship.up = V.norm(V.cross(ship.right, ship.fwd));
      updateDockedShip(ship, sys, t);
      return;
    }

    /* AND OFF THE SIDE OF A STATION WITH NO BAY, level still wins, because
     * there is no deck to be square to and the planet is the only reference
     * left. Everything from here down is that case. */
    var facing = berthOut || V.scale(rel, -1);
    var upRef = orbitalBasisAt(ts.pos, ts.vel, sys, t).radial;
    var flat = V.sub(facing, V.scale(upRef, V.dot(facing, upRef)));
    ship.fwd = V.len(flat) > 1e-9 ? V.norm(flat) : V.clone(basis.prograde);
    /* LEVEL, NOT ARBITRARY, and this line was a real bug for as long as
     * saves have existed.
     *
     * `anyPerpendicular` picks any vector at right angles to the nose. That
     * is fine for making a basis and terrible for making an ATTITUDE: the
     * roll it produces is whatever falls out of the arithmetic, so a ship on
     * the clamps sat at some random bank angle.
     *
     * Which nobody would mind, except that save.js re-docks on load —
     * restore() sets the saved fwd/up/right and then calls dockShip, which
     * lands here and throws the restored attitude away. Its own comment says
     * saves are made on a station's clamps "given when saves happen", and
     * main.js restores the autosave at boot. So the common path was: quit
     * docked, come back, and be lying on your side, with the attitude ladder
     * reading ninety degrees of bank before you had touched anything.
     *
     * circularOrbit already solved this for the spawn and its comment
     * describes the identical symptom. Same construction here: right from
     * fwd x radial puts UP along the local vertical, so a berthed ship is
     * level and its gear points at the planet. The fallback is only reachable
     * with the nose exactly along the radial, where "level" has no meaning. */
    ship.right = V.cross(ship.fwd, upRef);
    ship.right = V.len(ship.right) > 1e-9
      ? V.norm(ship.right) : anyPerpendicular(ship.fwd);
    ship.up = V.cross(ship.right, ship.fwd);
  }

  /* Recompute a docked ship's world position/velocity from wherever its
   * target is right now. Call this every frame instead of advanceShip while
   * ship.docked is set. */
  function updateDockedShip(ship, sys, t) {
    var target = sys.byId[ship.docked];
    /* A NO-OP FOR A SHIP THAT IS NOT DOCKED, rather than a TypeError.
     * `bodyState` dereferences `body.id` on its first line, so calling this
     * on a ship whose `docked` is null threw from two frames deep with a
     * stack that named neither the caller nor the reason. There is now one
     * more way to be not-docked than there used to be — being carried in on
     * the arrival rail — and any caller that gets the state wrong deserves
     * to do nothing, not to crash. */
    if (!target) return;
    var ts = bodyState(target, sys, t);

    if (target.surface) {
      /* In a berth in the hangar at the bottom of the shaft, riding round
       * with the world. The berth is derived from the SAME table the mesh
       * is built from (Gen.bayGeometry / Gen.berthOffset), so the ship
       * stands on the floor that is drawn rather than near it. */
      var bs = berthState(target, sys, t, ship.dockOffset && ship.dockOffset.berth);
      if (bs) {
        ship.pos = bs.pos;
        ship.vel = bs.vel;
        return target;
      }
      // Fallback: no bay geometry available, so sit on the pad itself.
      var host = bodyState(target.parentBody, sys, t);
      var up = V.norm(V.sub(ts.pos, host.pos));
      ship.pos = V.addScaled(ts.pos, up, ship.dockOffset.height);
      ship.vel = V.clone(ts.vel);
      return target;
    }

    var off = ship.dockOffset;

    /* Berthed inside the station, which is now the ordinary case. Recomputed
     * from `t` every frame exactly like the surface branch above, so a hull
     * parked in a bay that turns goes round with it rather than being left
     * behind by its own station. */
    if (off && off.station) {
      var sbs = berthState(target, sys, t, off.berth);
      if (sbs) {
        ship.pos = sbs.pos;
        ship.vel = sbs.vel;
        return target;
      }
      /* The model went away under us — a library swapped in the hull viewer,
       * or a save made against a build that had one. Sit on the station's
       * centre-line rather than at the origin of the universe, and let the
       * next dock re-derive a real offset. */
      ship.pos = V.clone(ts.pos);
      ship.vel = V.clone(ts.vel);
      return target;
    }

    var basis = orbitalBasis(ts.pos, ts.vel);
    var offset = V.add(V.add(V.scale(basis.radial, off.radial), V.scale(basis.prograde, off.prograde)),
                       V.scale(basis.normal, off.normal));
    ship.pos = V.add(ts.pos, offset);
    ship.vel = V.clone(ts.vel);
    return target;
  }

  /* Push away with a small separation velocity along the current offset
   * (i.e., straight out from the station) so undocking never immediately
   * re-triggers capture. */
  /* ---- THE ARRIVAL, ANIMATED ---------------------------------------------
   * `dockShip` and `undockShip` have always been scripts — one runs a hull
   * into a berth off the side of the shed, the other runs it back to the
   * foot of the shaft and stands it on its tail. Both executed in a single
   * frame, so the script was something you could read in the source and
   * never see. This plays it.
   *
   * IT IS A RAIL, in the sense doctrine 3 means: a closed-form path
   * parameterised by elapsed time, not an integration. The ship is not
   * flying here and nothing is pushing it — a cargo lift and a traverser
   * are moving it, and those move at a known rate along a known line. The
   * only correct model of a hull on a traverser is a scripted one.
   *
   * The instant versions are DELIBERATELY LEFT INTACT as the rail's
   * endpoint, and that is what keeps this additive. `save.js` re-docks on
   * load, and three tests dock directly; if docking had become a
   * multi-second animation, loading a save would have dropped the player
   * into the middle of a lift ride and those tests would have run their
   * guard loops to exhaustion waiting for a state that arrives eighteen
   * seconds later. So: `beginArrival` starts the show, `stepArrival` runs
   * it, and the last thing it does is call the same `dockShip` everything
   * else already calls. Nothing that docks today behaves differently
   * unless it opts in.
   *
   * The frame is the one `berthOffset` and `berthState` already use:
   * mouth-relative, in pad radii, x along east, y along north, z along up.
   * Reusing it rather than inventing a second one is house rule 6 — the
   * lining and the void came apart last time a dimension was derived
   * twice. */

  /* Seconds per leg, at 1x. These are sim seconds because doors and lifts
   * are world events, not presentation — but see the warp clamp in main.js:
   * at 500x the whole arrival would resolve inside one frame, which is the
   * same bug the weapon cooldowns had. */
  var ARRIVAL_LEGS = [
    /* Handover. The autopilot's last metres, nose still where flight left
     * it, so the cut from flying to being carried is not a snap. */
    { id: 'approach', dur: 3.0, apron: 1, inner: 1, lift: 0, bay: 1 },
    /* On the apron with the doors coming open under the hull. The car is
     * already staged 1.4 below flush — it cannot BE flush while the leaves
     * are shut, because at flush its deck occupies their slot. That
     * interlock is mechanical and it is the model's, not mine. */
    { id: 'pad', dur: 2.5, apron: 0, inner: 1, lift: 0, bay: 1 },
    /* Down the shaft. The car stays level; the shaft is what is inclined. */
    { id: 'descend', dur: 6.0, apron: 1, inner: 1, lift: 1, bay: 1 },
    /* Off the car, through the inboard gate, onto the traverser. */
    { id: 'traverse', dur: 4.0, apron: 1, inner: 0, lift: 1, bay: 1 },
    /* Across to the assigned bay and onto the stand. */
    { id: 'berth', dur: 3.0, apron: 1, inner: 1, lift: 1, bay: 0 }
  ];

  /* From `descend` onward the hull is under the doors, so this is the leg
   * at which the sky stops being a thing that exists. main.js reads it
   * rather than hardcoding an index. */
  var ARRIVAL_ENCLOSED_FROM = 2;

  /* ---- and the same show in orbit ---------------------------------------
   *
   * A station has no shaft and no lift, so the legs above do not describe
   * it — but the SHAPE is the same and so is every piece of machinery
   * underneath: waypoints in the port's own mouth-relative frame, eased
   * per leg, gates posed as numbers, one flag saying when the sky stops.
   * Only the table and the waypoints differ.
   *
   * THE ROUTE IS THE ART'S. Every orbital model declares, per berth, a
   * throat floor with a `normal`, a set of outer doors outboard of it and
   * an inner gate inboard (see Gen.berthApertures). So the arrival is a
   * straight line along that normal: hold off the doors, they run back,
   * you are drawn in through the throat, they close behind you, and the
   * inner gate opens onto the concourse. Nothing here decides where a
   * station's door is — it is measured off the model every time.
   *
   * A station whose model declares no berths (the city ports) has no
   * throat to be drawn down, and gets the hall instead: in through the
   * hatch on the hub axis and across to a stand. Same table, different
   * waypoints, which is the whole point of keeping the two apart. */
  var ORBITAL_LEGS = [
    /* Lined up on the berth, station-keeping, doors shut in front of you. */
    { id: 'lineup', dur: 3.0, apron: 1, inner: 1, lift: 1, bay: 1 },
    /* The outer doors run back. The hull holds at the threshold — it does
     * not move into a hole that is not open yet, which is the same
     * mechanical interlock the surface apron has. */
    { id: 'open', dur: 2.5, apron: 0, inner: 1, lift: 1, bay: 0 },
    /* Drawn in through the throat. Past the door plane the station is
     * over you and the sky is gone. */
    { id: 'enter', dur: 5.0, apron: 0, inner: 1, lift: 1, bay: 0 },
    /* Onto the stand, and the outer doors close behind. */
    { id: 'settle', dur: 3.0, apron: 1, inner: 1, lift: 1, bay: 0 },
    /* The inner gate opens. Nothing moves; this leg exists so the last
     * thing the arrival does is show you what you have arrived INSIDE of,
     * down the corridor, rather than ending on a shut door. */
    { id: 'admit', dur: 2.5, apron: 1, inner: 0, lift: 1, bay: 0 }
  ];

  /* `enter` is the leg that crosses the door plane. */
  var ORBITAL_ENCLOSED_FROM = 2;

  /* WHERE THE ARRIVAL STARTS, and why it stopped being a plain constant.
   *
   * ORBITAL_HOLD_LEAD is in station radii, which was right when every
   * station was about a kilometre across. At STATION_SCALE 3.5 the largest
   * are 11 km in radius, so 0.45 radii put the hold point FIVE KILOMETRES
   * off the doors — and the run-in leg, clamped to twelve seconds, crossed
   * it at a peak of 761 m/s. A hull does not approach a berth at Mach two.
   *
   * The hold point is a station-keeping position a few hundred metres off
   * the doors; that is a real distance, and it should read the same at
   * every station rather than growing with the hull behind it. So the
   * fraction is capped in kilometres. Small stations are unaffected — at
   * 2.1 km radius the cap is looser than the fraction — and the largest
   * hold at 1.5 km instead of 5.
   *
   * BOTH CALLERS GO THROUGH HERE, and that is the point. The other one
   * carves the approach corridor through the occupancy grid, and a corridor
   * carved shorter than the hold point leaves a ship on final approach
   * outside the cut and therefore inside a wall — which the note over that
   * carve has warned about since it was written. One function, one answer. */
  var HOLD_LEAD_MAX = 1.5;        // km

  function holdLead(port) {
    var r = (port && port.radius) || 1;
    return Math.min(ORBITAL_HOLD_LEAD, HOLD_LEAD_MAX / r);
  }

  /* How far outside the doors the rail picks you up, in station radii.
   * About 95 m at the smallest station and 500 m at the largest — far
   * enough that the handover is an approach rather than a jump cut, close
   * enough to be well inside the docking envelope, which is four radii. */
  var ORBITAL_HOLD_LEAD = 0.45;

  /* WHICH TABLE. Decided here and nowhere else, for the same reason
   * bayGeometry decides which geometry table applies: a caller that
   * answered this question itself would be the second opinion that puts
   * the doors on one schedule and the hull on another. */
  /* HOW LONG EACH LEG TAKES, WHICH IS NOT A CONSTANT ONCE STATIONS DIFFER
   * IN SIZE BY A FACTOR OF FIVE.
   *
   * The waypoints are in station radii, so raising STATION_SCALE to 3.5
   * multiplied every distance the arrival covers without touching the clock
   * it covers them on. Measured straight after that change: the run-in leg
   * crossed 4.5 km in three seconds at the largest station — fifteen
   * hundred metres a second, threading a hangar. The whole arrival averaged
   * 125-394 m/s where it used to average 8-45.
   *
   * So the two legs that TRAVEL get their duration from the distance they
   * have to cover, at a speed that reads right, and the ones that do not —
   * the doors running back, the hull settling, the inner gate opening — keep
   * the times they had. Those are ceremony, and ceremony does not take
   * longer because the building is bigger.
   *
   * THE CLAMPS ARE WHAT MAKE IT A GAME RATHER THAN A COMMUTE. Without a
   * ceiling the largest station would open with a hundred-second cutscene;
   * without a floor the smallest would snap. Inside the clamps the speed is
   * honest, and at the ceiling it rises — which is the right way round,
   * because a ship closing on a structure twenty-two kilometres across
   * SHOULD be moving.
   *
   * Cached per port: arrivalPose asks for this every frame of the sequence,
   * and orbitalPath costs a berth lookup and a bay solve. */
  var RUN_IN_SPEED = 0.10;        // km/s, the leg from the hold to the gate
  var THREAD_SPEED = 0.04;        // km/s, the leg from the gate to the stand
  var RUN_IN_DUR = [3.0, 12.0];   // seconds, floor and ceiling
  var THREAD_DUR = [5.0, 20.0];
  var LEGS_CACHE = {};

  function scaledLegs(port) {
    var path = orbitalPath(port, 0);
    if (!path || path.length < 5) return ORBITAL_LEGS;
    var r = port.radius || 1;
    var span = function (a, b) {
      var dx = path[b].x - path[a].x, dy = path[b].y - path[a].y,
          dz = path[b].z - path[a].z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) * r;
    };
    var fit = function (km, speed, lim) {
      return Math.max(lim[0], Math.min(lim[1], km / speed));
    };
    var out = [];
    for (var i = 0; i < ORBITAL_LEGS.length; i++) {
      var L = ORBITAL_LEGS[i], dur = L.dur;
      if (L.id === 'lineup') dur = fit(span(0, 1), RUN_IN_SPEED, RUN_IN_DUR);
      else if (L.id === 'enter') dur = fit(span(2, 3), THREAD_SPEED, THREAD_DUR);
      if (dur === L.dur) { out.push(L); continue; }
      /* A COPY, never a mutation of the table — ORBITAL_LEGS is shared by
       * every station in the galaxy, and editing it in place would give the
       * last port asked the timings of every other one. */
      out.push({ id: L.id, dur: dur, apron: L.apron, inner: L.inner,
                 lift: L.lift, bay: L.bay });
    }
    return out;
  }

  function legsFor(port) {
    if (!port || port.surface) return ARRIVAL_LEGS;
    var key = port.id;
    if (key === undefined || key === null) return scaledLegs(port);
    if (LEGS_CACHE[key]) return LEGS_CACHE[key];
    LEGS_CACHE[key] = scaledLegs(port);
    return LEGS_CACHE[key];
  }

  function enclosedFrom(port) {
    return (port && !port.surface) ? ORBITAL_ENCLOSED_FROM : ARRIVAL_ENCLOSED_FROM;
  }

  /* Defaults to the surface table when asked without a port, because that
   * is what it has always answered and three callers rely on it. */
  function arrivalTotal(port) {
    var L = legsFor(port);
    var s = 0;
    for (var i = 0; i < L.length; i++) s += L[i].dur;
    return s;
  }

  /* Smoothstep. Every leg starts and ends at rest: a traverser that begins
   * at full speed reads as a hull being thrown across a room. */
  function ease(u) { return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u); }

  /* The waypoints, in the mouth-relative pad-radii frame.
   *
   * The descent is the interesting one. A 45-degree shaft moves the hull
   * along the ground by as much as it drops, so the foot of the shaft is
   * NOT under the pad — it is one drop-length inboard of it. A port that
   * declares a vertical lift instead gets run = 0 and the same code walks
   * it straight down. That is the whole of "some traversers are also
   * elevators": the leg is a line in three dimensions and the angle is
   * data, not a branch. */
  function arrivalPath(port, berth) {
    var Gen = global.Gen;
    if (!Gen || !Gen.bayGeometry || !Gen.berthOffset) return null;
    if (port && !port.surface) return orbitalPath(port, berth);
    var g = Gen.bayGeometry(port);
    var off = Gen.berthOffset(port, berth || 0);
    var stand = g.floorZ + g.lift + g.standoff;
    var deck = g.lift + g.standoff;
    /* How far inboard the shaft foot sits. `incline` is the modelled
     * angle when there is a model; 45 degrees is the default because that
     * is what the cargo lifts are, and tan(45) = 1 makes run == drop. */
    var ang = (port.incline && port.incline.angle) || 45;
    var run = ang >= 89.5 ? 0
            : Math.abs(g.floorZ) / Math.tan(ang * Math.PI / 180);
    return [
      { x: 0, y: 0, z: deck + 0.9 },       // approach, above the apron
      { x: 0, y: 0, z: deck },             // pad
      { x: 0, y: -run, z: stand },         // shaft foot
      { x: off.x, y: -run, z: stand },     // across the hall on the traverser
      { x: off.x, y: off.y, z: off.z + g.lift + g.standoff }  // the stand
    ];
  }

  /* The station's, in the same frame and the same five slots.
   *
   * THE MODELLED ROUTE is a straight line along the berth's own normal:
   * hold, the door plane, the door plane again while the leaves run back,
   * the throat floor, the throat floor again while the inner gate opens.
   * The waypoints repeat because two of the five legs are things happening
   * TO the hull rather than moves by it — the same reason the surface
   * table's last leg goes nowhere.
   *
   * THE HALL is the fallback, for a station whose model declares no berths
   * at all. There is no throat to be drawn along, so the route is the one
   * the hatch describes: hold off the hub face, then in and across to a
   * stand in a single move. Gen.stationBay owns that geometry and this
   * reads it rather than repeating any of it. */
  function orbitalPath(port, berth) {
    var Gen = global.Gen;
    var g = Gen.bayGeometry(port);
    var off = Gen.berthOffset(port, berth || 0);
    var z = off.z + g.lift;
    var ap = Gen.berthApertures ? Gen.berthApertures(port, berth || 0) : null;

    if (ap && ap.normal && typeof ap.gate === 'number') {
      var n = ap.normal;
      var at = function (d) {
        return { x: off.x + n[0] * d, y: off.y + n[1] * d, z: z + n[2] * d };
      };
      return [at(ap.gate + holdLead(port)), at(ap.gate), at(ap.gate),
              at(0), at(0)];
    }

    /* No modelled berth: in through the hatch. */
    if (!(g.mouthZ > 0)) return null;
    var mouth = { x: 0, y: 0, z: g.mouthZ };
    var lead = { x: 0, y: 0, z: g.mouthZ + holdLead(port) };
    var stand = { x: off.x, y: off.y, z: z };
    return [lead, mouth, mouth, stand, stand];
  }

  /* Where the hull is, and which way it is pointing, `el` seconds in.
   * Pure: same port, same berth, same elapsed gives the same pose, which
   * is what lets the renderer ask for it without owning any state. */
  function arrivalPose(port, sys, t, berth, el) {
    /* portBasis, not groundBasis, and that one word is the whole of what
     * lets this run in orbit — the arithmetic below was always general,
     * because the waypoints are in the port's own frame and a frame is a
     * frame. Same move that widened berthState and the camera clamp. */
    var basis = portBasis(port, sys, t);
    var path = arrivalPath(port, berth);
    if (!basis || !path) return null;
    var Gen = global.Gen;
    var orbital = !!(port && !port.surface);
    var LEGS = legsFor(port);

    var leg = 0, acc = 0;
    while (leg < LEGS.length - 1 && el >= acc + LEGS[leg].dur) {
      acc += LEGS[leg].dur; leg++;
    }
    var L = LEGS[leg];
    var u = ease(L.dur > 0 ? (el - acc) / L.dur : 1);

    var a = path[leg], b = path[Math.min(leg + 1, path.length - 1)];
    var loc = { x: a.x + (b.x - a.x) * u,
                y: a.y + (b.y - a.y) * u,
                z: a.z + (b.z - a.z) * u };

    var r = port.radius || 1;
    var pos = V.addScaled(basis.entrance.pos, basis.up, loc.z * r);
    pos = V.addScaled(pos, basis.east, loc.x * r);
    pos = V.addScaled(pos, basis.north, loc.y * r);

    /* ATTITUDE: level, nose along the way it is going. A hull being
     * carried does not bank and does not turn on the spot — the entire
     * reason the sorting floor is a corridor with a traverser in it rather
     * than a roundabout is that a hull never rotates. So the nose follows
     * the leg, and on the final leg it blends to the berth's own facing,
     * which is the pose `dockShip` will set when the rail ends. */
    var dx = b.x - a.x, dy = b.y - a.y;
    var fwd;
    if (orbital) {
      /* NOSE OUT THE WHOLE WAY, and it is not a compromise — it is what
       * the art asks for. A berthed hull faces the way it leaves (see
       * berthFacing, which reads the berth's own normal), and the way it
       * leaves is the way it came in. So a ship is drawn into a station
       * stern-first, the way a truck backs onto a loading dock, and never
       * turns at all: no rotation to animate, no blend at the end, and the
       * pose the rail hands to dockShip is the pose it started with.
       *
       * The surface branch below has to turn because a shed's traverser
       * carries a hull across a room and then onto a stand at right angles
       * to it. A station has no room to cross. */
      fwd = berthFacing(basis, Gen.berthOffset(port, berth || 0));
    } else if (Math.abs(dx) + Math.abs(dy) > 1e-6) {
      fwd = V.norm(V.addScaled(V.scale(basis.east, dx), basis.north, dy));
    } else {
      fwd = V.clone(basis.north);          // straight down the shaft: keep facing
    }
    if (!orbital && leg === LEGS.length - 1) {
      /* Blend to the pose dockShip will set when the rail ends, and read it
       * the same way dockShip does — through berthFacing — so the hull is
       * not turned to one heading by the animation and snapped to another
       * the instant it finishes. */
      var want = berthFacing(basis, Gen.berthOffset(port, berth || 0));
      fwd = V.norm(V.add(V.scale(fwd, 1 - u), V.scale(want, u)));
    }
    var up = V.clone(basis.up);
    var right = V.cross(fwd, up);
    if (V.len(right) < 1e-9) return null;
    right = V.norm(right);

    return {
      pos: pos, vel: V.clone(basis.entrance.vel),
      fwd: fwd, up: V.norm(V.cross(right, fwd)), right: right,
      leg: leg, legId: L.id, u: u,
      enclosed: leg >= enclosedFrom(port),
      /* The mechanism poses, 0 open and 1 sealed, matching the model's own
       * setApronDoors/setInnerGate/setLift/setBayGates. Interpolated within
       * the leg so a door is caught half open rather than popping. */
      gates: {
        apron: mixGate(L.apron, LEGS[Math.max(0, leg - 1)].apron, u),
        inner: mixGate(L.inner, LEGS[Math.max(0, leg - 1)].inner, u),
        lift: L.id === 'descend' ? u : L.lift,
        bay: mixGate(L.bay, LEGS[Math.max(0, leg - 1)].bay, u)
      }
    };
  }

  /* A gate moves at the START of the leg that wants it moved, so it is
   * open by the time the hull needs the hole. */
  function mixGate(want, prev, u) {
    if (want === prev) return want;
    var k = Math.min(1, u / 0.35);
    return prev + (want - prev) * k;
  }

  function arrivalActive(ship) {
    return !!(ship && ship.arrival);
  }

  /* Opt in. Returns false when this port cannot be arrived at slowly, and
   * the caller then does what it has always done and docks instantly.
   *
   * It used to refuse every orbital station outright — "no shaft, no
   * traverser" — which was true of the SHAFT legs and not of the idea. A
   * station is refused now only when it genuinely has no route in: no
   * modelled berth to be drawn down and no hatch either, or a berth whose
   * normal lies along the frame's own up, which leaves no way to build an
   * attitude from it. Both come back as a null path or a null pose, so the
   * refusal is something measured rather than a class of port. */
  function beginArrival(ship, port, sys, t) {
    if (!ship || !port) return false;
    if (!arrivalPath(port, 0)) return false;
    var berth = assignBerth(ship, port);
    if (!arrivalPose(port, sys, t, berth, 0)) return false;
    ship.arrival = { port: port.id, berth: berth, at: t, dur: arrivalTotal(port) };
    ship.thrust = V.zero();
    ship.throttle = 0;
    ship.angRate = { pitch: 0, yaw: 0, roll: 0 };
    return true;
  }

  /* One frame of it. Returns the pose so the caller can read `enclosed`
   * and the gate poses without recomputing them. */
  function stepArrival(ship, sys, t) {
    if (!ship || !ship.arrival) return null;
    var port = sys.byId[ship.arrival.port];
    /* The port stopped existing — a system change under a running
     * arrival. Abandon it rather than ride a rail to nowhere. */
    if (!port) { ship.arrival = null; return null; }

    var el = t - ship.arrival.at;
    if (!(el >= 0)) el = 0;                 // clock went backwards; start over

    if (el >= ship.arrival.dur) {
      ship.arrival = null;
      dockShip(ship, port, sys, t);
      return null;
    }
    var pose = arrivalPose(port, sys, t, ship.arrival.berth, el);
    if (!pose) { ship.arrival = null; dockShip(ship, port, sys, t); return null; }
    ship.pos = pose.pos;
    ship.vel = pose.vel;
    ship.fwd = pose.fwd; ship.up = pose.up; ship.right = pose.right;
    return pose;
  }

  function undockShip(ship, sys, t, sepSpeed) {
    var target = sys.byId[ship.docked];
    var ts = bodyState(target, sys, t);
    var away;

    if (target.surface) {
      /* Leaving the ground is straight up, and the pad gives you nothing —
       * you climb on the drive alone. This is the moment the whole
       * MAX_SURFACE_G rule exists to protect: if the generator had put a
       * port on a world whose gravity beat the drive, this is where the
       * game would quietly stop. */
      /* THE LAUNCH SCRIPT. A berthed ship is parked in an alcove off the
       * side of the shed, nose pointed at the middle of the floor — it
       * cannot simply climb from where it stands, because what is directly
       * above it is the ceiling. So leaving runs the ship out of the berth
       * and back to the bottom of the shaft first, stands it on its tail,
       * and hands it over pointed at the open sky. That is the whole of
       * "a script to put the ship back at the bottom of the shaft".
       *
       * The doors are already open: main.js will not undock a surface port
       * without launch clearance, and clearance is what opens them. */
      var basis0 = groundBasis(target, sys, t);
      away = basis0 ? basis0.up
                    : V.norm(V.sub(ts.pos, bodyPosition(target.parentBody, sys, t)));
      var Gen0 = global.Gen;
      if (basis0 && Gen0 && Gen0.bayGeometry) {
        var g0 = Gen0.bayGeometry(target);
        var r0 = target.radius || 1;
        ship.pos = V.addScaled(basis0.entrance.pos, basis0.up,
                               (g0.floorZ + g0.lift + g0.standoff * 2) * r0);
        ship.vel = V.clone(basis0.entrance.vel);
      } else {
        ship.pos = V.addScaled(ship.pos, away, target.radius * 0.5);
      }
      ship.docked = null;
      ship.dockOffset = null;
      ship.vel = V.addScaled(ship.vel, away, sepSpeed || 0.002);
      ship.fwd = V.clone(away);
      ship.right = anyPerpendicular(ship.fwd);
      ship.up = V.cross(ship.right, ship.fwd);
      return target;
    }

    away = V.norm(V.sub(ship.pos, ts.pos));
    if (V.len(away) < 1e-9) away = V.scale(ship.fwd, -1);
    // ... and if the nose was degenerate too, pick any direction rather
    // than pushing off along a zero vector and going nowhere.
    if (V.len(away) < 1e-9) away = anyPerpendicular(orbitalBasis(ts.pos, ts.vel).radial);
    if (V.len(ship.fwd) < 1e-9) {
      ship.fwd = V.clone(away);
      ship.right = anyPerpendicular(ship.fwd);
      ship.up = V.cross(ship.right, ship.fwd);
    }
    ship.docked = null;
    ship.dockOffset = null;
    ship.vel = V.addScaled(ship.vel, away, sepSpeed || 0.002);
    return target;
  }

  /* Forward trajectory prediction: integrate a throwaway copy of the ship and
   * hand back a polyline. This is the single most important thing on screen —
   * it turns invisible gravity into a shape the player can steer. */
  /* IMPORTANT: the points come back RELATIVE TO A REFERENCE BODY, not in
   * absolute world coordinates. This is not a detail — it is the difference
   * between a usable navigation display and a useless one. A ship in a
   * 10-hour orbit of a planet is, in absolute terms, also being carried
   * 2 million km around the star during those 10 hours, so an absolute
   * trajectory shoots off the screen in a straight smear and tells you
   * nothing. Drawn in the planet's frame, the same data is the clean closed
   * ellipse you actually want to steer. */
  /* ---- prediction as a resumable job ------------------------------------
   * The integration below is the most expensive thing in the game, and it
   * used to happen in one lump inside a single frame: 12-25 ms against a
   * 2.2 ms median, four to twelve times a second, producing a stall you
   * could feel exactly while burning — which is the one time the display is
   * worth having.
   *
   * Nothing here is faster than it was. It is the same arithmetic, split
   * into a job the caller can advance a few milliseconds at a time and
   * collect when it finishes. The cost is unchanged and the frame is no
   * longer where it lands: the path is a few frames old instead of the
   * frame being a few frames long, and a prediction of the next six hours
   * does not care about a hundred milliseconds.
   *
   * predictTrajectory is kept as the synchronous form — begin, run to
   * completion, hand back the result — because the tests and the node
   * planner want an answer now and are not inside a frame. */
  function beginPrediction(ship, sys, t, opts) {
    opts = opts || {};
    var maxPoints = opts.maxPoints || 900;
    var horizon = opts.horizon;         // seconds of look-ahead
    var includeThrust = !!opts.includeThrust;
    var ref = opts.reference || dominantBody(ship.pos, sys, t);

    var ghost = makeShip(ship.pos, ship.vel);
    if (includeThrust) ghost.thrust = V.clone(ship.thrust);

    if (!horizon) {
      var oe0 = oscElements(ship, sys, t);
      horizon = (oe0 && oe0.closed && isFinite(oe0.period))
        ? Math.min(oe0.period * 1.05, 3.2e7)
        : 8.64e5;
    }

    return {
      ghost: ghost, ref: ref, maxPoints: maxPoints, horizon: horizon,
      t0: t, tt: t, h: Math.max(horizon / maxPoints, 0.5), i: 0,
      pts: [ V.sub(ghost.pos, bodyPosition(ref, sys, t)) ],
      impact: null, truncated: false, done: false, result: null
    };
  }

  /* Advance a job by at most `budgetMs` of wall clock (0 = run it out).
   * Returns true when the job is finished and job.result is ready. */
  function stepPrediction(job, sys, budgetMs) {
    if (job.done) return true;
    var clock = (budgetMs > 0 && typeof performance !== 'undefined') ? performance : null;
    var startedAt = clock ? clock.now() : 0;

    while (job.i < job.maxPoints) {
      // Refine the step near a body so predictions stay faithful where it
      // matters most — close approaches.
      var sub = Math.min(8, Math.max(1, Math.ceil(job.h / suggestedStep(job.ghost, sys, job.tt))));
      var hs = job.h / sub;
      for (var k = 0; k < sub; k++) { stepShip(job.ghost, sys, job.tt, hs); job.tt += hs; }
      job.pts.push(V.sub(job.ghost.pos, bodyPosition(job.ref, sys, job.tt)));
      job.i++;

      var hit = checkImpact(job.ghost, sys, job.tt);
      if (hit) {
        job.impact = {
          body: hit,
          rel: V.sub(job.ghost.pos, bodyPosition(job.ref, sys, job.tt)),
          t: job.tt, speed: job.ghost.impactSpeed
        };
        break;
      }
      /* Checked every 16 points, because performance.now() is not free and
       * the whole point of this is to stop paying for things per point. */
      if (clock && (job.i & 15) === 0 && clock.now() - startedAt > budgetMs) return false;
    }

    finishPrediction(job);
    return true;
  }

  function finishPrediction(job) {
    job.done = true;
    job.result = {
      points: job.pts, impact: job.impact, reference: job.ref,
      horizon: job.horizon, endTime: job.tt, truncated: job.truncated,
      startedAt: job.t0
    };
    return job.result;
  }

  function predictTrajectory(ship, sys, t, opts) {
    opts = opts || {};
    var maxPoints = opts.maxPoints || 900;
    var horizon = opts.horizon;         // seconds of look-ahead
    var includeThrust = !!opts.includeThrust;
    var ref = opts.reference || dominantBody(ship.pos, sys, t);

    /* An optional wall-clock ceiling, in milliseconds. This is a SAFETY NET,
     * not the main cost control — the caller is expected to size maxPoints so
     * the whole path fits its budget, because a path cut short mid-flight is
     * a worse display than a complete one drawn coarsely. This exists so that
     * a pathological case (a near-parabolic orbit whose period explodes, a
     * hundred-body system) can never blow a single frame outright.
     * Checked every 32 points, because performance.now() is not free. */
    var budgetMs = opts.budgetMs || 0;
    var job = beginPrediction(ship, sys, t, {
      maxPoints: maxPoints, horizon: horizon,
      includeThrust: includeThrust, reference: ref
    });

    /* The budget keeps its old meaning here: a safety net that truncates
     * rather than a scheduler. Callers that want the work spread out use
     * beginPrediction/stepPrediction directly. */
    if (!stepPrediction(job, sys, budgetMs)) {
      job.truncated = true;
      finishPrediction(job);
    }
    return job.result;
  }

  /* The closed-form alternative to integrating, and the reason the predicted
   * path is affordable at all.
   *
   * predictTrajectory's cost is driven by the HORIZON, not by the point
   * count: drawing a full closed loop means integrating one whole orbital
   * period, and a 60-day period is 60 days of n-body stepping — measured at
   * 20-90 ms on the target laptop, four times a second. No amount of
   * budgeting or resolution-tuning fixes that, because the work is
   * proportional to the time span being covered.
   *
   * But a stable orbit does not need integrating. It is an ellipse, and the
   * game already propagates bodies and jettisoned canisters on exactly this
   * closed form — this is the same rails-versus-integration split applied to
   * the one thing that had been left out of it. Pure trigonometry, no
   * stepping, and the whole loop for well under a millisecond.
   *
   * The honest caveat: this is the OSCULATING two-body ellipse, so it
   * ignores perturbation from everything except the dominant body. Where
   * that matters — under thrust, or on a path heading for a surface — the
   * caller integrates instead, which is what predictTrajectory is for. */
  function ellipsePath(ship, sys, t, segments, reference) {
    var dom = reference || dominantBody(ship.pos, sys, t);
    if (!dom || !(dom.mu > 0)) return null;
    var rel = V.sub(ship.pos, bodyPosition(dom, sys, t));
    var vrel = V.sub(ship.vel, bodyVelocity(dom, sys, t));
    var el = K.elementsFromState(rel, vrel, dom.mu);
    if (!el.closed || !isFinite(el.period)) return null;
    return {
      points: K.samplePath(el, segments || 240),
      impact: null,
      reference: dom,
      horizon: el.period,
      endTime: t + el.period,
      truncated: false,
      kepler: true          // callers can tell an ellipse from an integration
    };
  }

  /* The ship's current osculating orbit about its dominant body — the
   * ellipse it would follow from here if everything else vanished. */
  function oscElements(ship, sys, t) {
    var dom = dominantBody(ship.pos, sys, t);
    if (!dom) return null;
    var rel = V.sub(ship.pos, bodyPosition(dom, sys, t));
    var vrel = V.sub(ship.vel, bodyVelocity(dom, sys, t));
    var oe = K.elementsFromState(rel, vrel, dom.mu);
    oe.body = dom;
    oe.altitude = V.len(rel) - dom.radius;
    oe.apoAlt = oe.closed ? oe.apoapsis - dom.radius : Infinity;
    oe.periAlt = oe.periapsis - dom.radius;
    oe.relSpeed = V.len(vrel);
    return oe;
  }

  /* Put a ship into a clean circular orbit at a given altitude above a body —
   * used to place the player at the start, and handy for testing. */
  function circularOrbit(body, sys, t, altitude, inclination, phase) {
    var r = body.radius + altitude;
    var speed = Math.sqrt(body.mu / r);
    inclination = inclination || 0;
    phase = phase || 0;
    var pos = K.perifocalToWorld(r * Math.cos(phase), r * Math.sin(phase), inclination, 0, 0);
    var vel = K.perifocalToWorld(-speed * Math.sin(phase), speed * Math.cos(phase), inclination, 0, 0);
    var bs = bodyState(body, sys, t);
    var ship = makeShip(V.add(bs.pos, pos), V.add(bs.vel, vel));

    /* makeShip's own default faces absolute velocity, which is dominated by
     * whatever body WE orbit is itself orbiting (a planet's ~50 km/s around
     * its star dwarfs the few km/s the ship actually has relative to that
     * planet). "Face prograde" only means something sensible measured
     * relative to the body you are spawning above, so re-face the ship
     * along the RELATIVE velocity we just computed — the same frame the
     * prograde arrow and the flight-path marker already use. */
    ship.fwd = V.norm(vel);

    /* ... and roll level while we are at it. anyPerpendicular() picks an
     * arbitrary vector at right angles to the nose, which is fine for a
     * basis and terrible for a first impression: it spawned the player at
     * ninety degrees of bank, so the attitude ladder came up as a set of
     * vertical stripes and the game looked broken before you touched
     * anything. It was not — the maths was right and the ship really was
     * on its side.
     *
     * Building right from fwd x radialOut makes up come out exactly along
     * the local vertical (the two are perpendicular on a circular orbit),
     * so the ladder reads zero roll on spawn, which is what a ship parked
     * in orbit ought to look like. */
    var radialOut = V.norm(pos);
    ship.right = V.cross(ship.fwd, radialOut);
    ship.right = V.len(ship.right) > 1e-9 ? V.norm(ship.right) : anyPerpendicular(ship.fwd);
    ship.up = V.cross(ship.right, ship.fwd);
    return ship;
  }

  /* ---- manoeuvre nodes ---------------------------------------------------
   * A node is a planned burn: a delta-v vector, expressed in the orbital
   * frame, at a specific moment in the future. Everything else here is
   * derived from those four numbers.
   *
   * THE BURN IS PLANNED IMPULSIVELY AND FLOWN FINITELY, and the split is
   * deliberate. Planning impulsively is what makes the node cheap enough to
   * re-evaluate while the player drags it around — one coast to the node,
   * one vector addition, one call to elementsFromState, and the resulting
   * orbit is exact rather than sampled. Flying it finitely is what stops it
   * being a cheat: a burn takes real minutes, spends real reaction mass at
   * the rocket equation's rate, and the ship moves while it happens. The
   * cost of the difference is handed to the player rather than hidden —
   * `burn.duration` and the T-minus-half-duration ignition lead are on the
   * instrument, so a burn long enough for the impulsive plan to be a poor
   * approximation is visibly a burn long enough for that to be true.
   *
   * The dv components are in the SAME frame the manual thrust keys use
   * (main.js orbitalFrame): prograde along relative velocity, radial out
   * along the position vector, normal along r x v. That is not a
   * convenience — it means "3 m/s prograde" on the node and "hold W" are
   * the same axis, so a plan can be flown by hand without a mental
   * transform. */

  /* The orbital basis at an ARBITRARY state, not just the ship's current
   * one. A node's frame has to be evaluated where and WHEN the node is, not
   * where the ship is now: prograde at apoapsis points somewhere quite
   * different from prograde at periapsis, and a node whose axes were baked
   * from the current frame would silently change meaning as the ship coasted
   * toward it. */
  /* NAME COLLISION, fixed here: this used to be called orbitalBasis, which
   * is also the name of the two-argument helper the docking code has used
   * since docking existed (see above, ~line 1150). Two function
   * declarations with the same name in one scope means the later one wins
   * silently, so every dockShip/updateDockedShip call was landing in this
   * function with sys and t undefined — docking threw the moment anything
   * touched a clamp. Renamed rather than merged because the two genuinely
   * answer different questions: that one takes a state already relative to
   * its primary, this one works out which primary applies. */
  function orbitalBasisAt(pos, vel, sys, t) {
    var dom = dominantBody(pos, sys, t);
    var bs = bodyState(dom, sys, t);
    var rel = V.sub(pos, bs.pos);
    var vrel = V.sub(vel, bs.vel);
    var prograde = V.len(vrel) > 1e-12 ? V.norm(vrel) : { x: 1, y: 0, z: 0 };
    var radial = V.len(rel) > 1e-12 ? V.norm(rel) : { x: 0, y: 0, z: 1 };
    var normal = V.cross(rel, vrel);
    normal = V.len(normal) > 1e-12 ? V.norm(normal) : { x: 0, y: 0, z: 1 };
    return {
      body: dom, bodyState: bs, rel: rel, vrel: vrel,
      prograde: prograde, radial: radial, normal: normal
    };
  }

  function makeNode(tAt, dv) {
    dv = dv || {};
    return {
      t: tAt,
      dv: { pro: dv.pro || 0, nor: dv.nor || 0, rad: dv.rad || 0 }
    };
  }

  function nodeMagnitude(node) {
    var d = node.dv;
    return Math.sqrt(d.pro * d.pro + d.nor * d.nor + d.rad * d.rad);
  }

  /* Coast a throwaway copy forward to an absolute time, optionally recording
   * the path. Unpowered by construction — a node is planned against the
   * orbit you are ON, so a thruster the player happens to be holding down
   * must not leak into the plan. */
  function coastTo(ship, sys, tTarget, t, opts) {
    opts = opts || {};
    var maxSteps = opts.maxSteps || 4000;
    var ghost = makeShip(ship.pos, ship.vel);
    ghost.thrust = V.zero();
    var ref = opts.reference || null;
    var pts = opts.samples ? [] : null;
    var every = 1, steps = 0, tt = t;
    var remaining = tTarget - t;

    if (pts) pts.push(ref ? V.sub(ghost.pos, bodyPosition(ref, sys, tt)) : V.clone(ghost.pos));
    if (remaining <= 0) {
      return { pos: V.clone(ship.pos), vel: V.clone(ship.vel), t: t,
               steps: 0, truncated: false, points: pts };
    }
    /* Sample thinning: a node a full period out is ~900 integration steps,
     * and a polyline does not need 900 vertices to read as a curve. */
    if (pts && opts.samples) {
      var est = Math.max(1, Math.ceil(remaining / Math.max(suggestedStep(ghost, sys, tt), 1e-6)));
      every = Math.max(1, Math.ceil(est / opts.samples));
    }
    while (remaining > 1e-9 && steps < maxSteps) {
      var h = Math.min(suggestedStep(ghost, sys, tt), remaining);
      stepShip(ghost, sys, tt, h);
      tt += h; remaining -= h; steps++;
      if (pts && (steps % every === 0)) {
        pts.push(ref ? V.sub(ghost.pos, bodyPosition(ref, sys, tt)) : V.clone(ghost.pos));
      }
    }
    if (pts) pts.push(ref ? V.sub(ghost.pos, bodyPosition(ref, sys, tt)) : V.clone(ghost.pos));
    return {
      pos: ghost.pos, vel: ghost.vel, t: tt, steps: steps,
      truncated: remaining > 1e-6, points: pts
    };
  }

  /* What a delta-v of this size actually costs this ship, right now.
   * Tsiolkovsky for the propellant, mass flow for the clock. Both depend on
   * current mass, so a laden ship is quoted a longer burn for the same plan
   * — which is the mass model doing its job, not a penalty bolted on. */
  function nodeBurn(ship, dv) {
    var m0 = shipMass(ship);
    var ve = exhaustVelocity(ship);
    var mdot = ship.thrustKN / ((ship.thrusterIsp || ship.isp) * G0 * 1000);  // t/s
    if (!(dv > 0)) {
      return { dv: 0, fuel: 0, duration: 0, lead: 0, feasible: true, massAfter: m0 };
    }
    var mf = m0 * Math.exp(-dv / ve);
    var fuel = m0 - mf;
    var duration = mdot > 0 ? fuel / mdot : Infinity;
    return {
      dv: dv, fuel: fuel, duration: duration,
      /* Ignition lead. A finite burn centred on the node's instant is the
       * standard approximation to the impulse the plan assumed — half the
       * delta-v goes in early, half late, and the errors largely cancel.
       * Starting AT the node instead puts the entire burn late. */
      lead: duration / 2,
      feasible: fuel <= (ship.thrusterFuel || 0) + 1e-12,
      massAfter: mf
    };
  }

  /* Everything the instruments and the renderer need about a node, in one
   * object: where the ship will be, what the burn does to the orbit, what it
   * costs, and when to light the engine. */
  function nodePlan(ship, sys, t, node, opts) {
    opts = opts || {};
    if (!node) return null;
    var arrive = coastTo(ship, sys, node.t, t, {
      maxSteps: opts.maxSteps || 4000,
      samples: opts.samples || 0,
      reference: opts.reference || null
    });
    var basis = orbitalBasisAt(arrive.pos, arrive.vel, sys, arrive.t);

    var dvVec = V.zero();
    dvVec = V.addScaled(dvVec, basis.prograde, node.dv.pro);
    dvVec = V.addScaled(dvVec, basis.normal, node.dv.nor);
    dvVec = V.addScaled(dvVec, basis.radial, node.dv.rad);
    var magnitude = V.len(dvVec);
    var postVel = V.add(arrive.vel, dvVec);

    var mu = basis.body.mu;
    var before = K.elementsFromState(basis.rel, basis.vrel, mu);
    var after = K.elementsFromState(basis.rel, V.sub(postVel, basis.bodyState.vel), mu);
    before.periAlt = before.periapsis - basis.body.radius;
    before.apoAlt = before.closed ? before.apoapsis - basis.body.radius : Infinity;
    after.periAlt = after.periapsis - basis.body.radius;
    after.apoAlt = after.closed ? after.apoapsis - basis.body.radius : Infinity;

    var burn = nodeBurn(ship, magnitude);
    return {
      node: node,
      pos: arrive.pos, vel: arrive.vel, postVel: postVel,
      dvVec: dvVec, magnitude: magnitude,
      basis: basis, body: basis.body,
      /* The frame the path points are expressed in. The caller has to know
       * it to anchor them, exactly as it does for a live prediction. */
      reference: opts.reference || basis.body,
      before: before, after: after,
      burn: burn,
      eta: node.t - t,
      ignition: node.t - burn.lead,
      countdown: (node.t - burn.lead) - t,
      path: arrive.points,
      truncated: arrive.truncated
    };
  }

  /* The orbit the burn puts you on, as a polyline — the same forward
   * integration the live prediction uses, started from the post-burn state.
   * Integrated rather than drawn as a conic on purpose: the conic is only
   * the osculating approximation, and the whole reason this game integrates
   * the ship at all is that the approximation is where transfers go wrong. */
  function predictAfterNode(plan, sys, opts) {
    opts = opts || {};
    if (!plan) return null;
    var ghost = makeShip(plan.pos, plan.postVel);
    return predictTrajectory(ghost, sys, plan.node.t, {
      maxPoints: opts.maxPoints || 420,
      horizon: opts.horizon,
      reference: opts.reference || plan.body,
      includeThrust: false
    });
  }

  /* Time to the next periapsis and apoapsis on the current osculating orbit.
   * This is what makes a node placeable rather than merely draggable: almost
   * every burn worth planning happens at an apsis, and hunting for one by
   * nudging a time cursor is miserable. Returns null on an open orbit (a
   * hyperbola has a periapsis but may already be past it) or a circle (where
   * no apsis is defined and snapping would be meaningless). */
  function apsisTimes(ship, sys, t) {
    var dom = dominantBody(ship.pos, sys, t);
    if (!dom || !(dom.mu > 0)) return null;
    var bs = bodyState(dom, sys, t);
    var rel = V.sub(ship.pos, bs.pos);
    var vrel = V.sub(ship.vel, bs.vel);
    var oe = K.elementsFromState(rel, vrel, dom.mu);
    if (!oe.closed || !isFinite(oe.period)) return null;

    var r = V.len(rel);
    var mu = dom.mu;
    var v2 = V.dot(vrel, vrel);
    var eVec = V.sub(V.scale(rel, (v2 - mu / r) / mu),
                     V.scale(vrel, V.dot(rel, vrel) / mu));
    var e = V.len(eVec);
    if (e < 1e-6) return { body: dom, period: oe.period, circular: true, e: e,
                           toPeriapsis: 0, toApoapsis: oe.period / 2 };

    // True anomaly, then eccentric, then mean — the standard chain.
    var cosNu = V.dot(eVec, rel) / (e * r);
    var nu = Math.acos(Math.max(-1, Math.min(1, cosNu)));
    if (V.dot(rel, vrel) < 0) nu = K.TAU - nu;
    var E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2),
                           Math.sqrt(1 + e) * Math.cos(nu / 2));
    var M = K.wrapAngle(E - e * Math.sin(E));
    var n = K.TAU / oe.period;
    return {
      body: dom, period: oe.period, circular: false, e: e,
      toPeriapsis: (K.TAU - M) / n,
      toApoapsis: K.wrapAngle(Math.PI - M) / n
    };
  }

  /* ---- jettisoned cargo -------------------------------------------------
   * A canister is a ship with no engine: it inherits your state vector at
   * the moment you push it out, and from then on it is on the same physics
   * as everything else. That is the whole model, and it gets three things
   * right for free — dumping cargo in a low orbit means watching it burn in
   * later, dumping it on an escape trajectory means never seeing it again,
   * and anything with a cargo scanner can read the manifest off it.
   *
   * They are integrated only while the player is near enough to see them
   * (WAKE_RANGE, same as an NPC), and they are forgotten after a day of
   * game time, because a system littered with every tonne anyone ever
   * dropped is a memory leak with a story attached. */
  var CANISTER_LIFE = 86400;     // seconds of game time before it is gone
  var CANISTER_TUMBLE = 0.35;    // rad/s, so the scanner return flickers
  var ZERO = { x: 0, y: 0, z: 0 };

  function dropCanister(sys, ship, cid, tonnes, t) {
    if (!sys.canisters) sys.canisters = [];
    /* Push it gently out of the lock, away from the nose: a canister that
     * shares your velocity exactly is a canister you will re-collide with
     * the moment you decelerate. */
    var away = V.len(ship.fwd) > 1e-9 ? V.norm(ship.fwd) : { x: 1, y: 0, z: 0 };
    var can = {
      kind: 'canister',
      id: 'can' + (sys.canisterSeq = (sys.canisterSeq || 0) + 1),
      name: 'Cargo canister',
      cid: cid,
      tonnes: tonnes,
      pos: V.addScaled(ship.pos, away, -0.05),      // 50 m behind
      vel: V.addScaled(ship.vel, away, -0.012),     // 12 m/s, a good shove
      born: t,
      expires: t + CANISTER_LIFE,
      spin: CANISTER_TUMBLE,
      radius: 0.004                                  // 4 m, for the scanner
    };
    sys.canisters.push(can);
    return can;
  }

  /* The same rails-versus-integration split everything else in this game
   * uses. Near the player a canister is integrated, because that is the
   * only time the difference between an ellipse and the real n-body path
   * is visible. Far away it is a Kepler orbit about whatever dominates
   * where it is, evaluated in closed form — which costs one Kepler solve
   * and, crucially, is still MOVING. The first version simply stopped
   * integrating out of range, which froze the canister in absolute space
   * while the planet it was orbiting flew off at 42 km/s. */
  function canisterRail(c, sys, t) {
    var dom = dominantBody(c.pos, sys, t);
    if (!dom || !(dom.mu > 0)) return null;
    var bs = bodyState(dom, sys, t);
    var el = K.elementsFromState(V.sub(c.pos, bs.pos), V.sub(c.vel, bs.vel), dom.mu);
    // An escaping canister has no ellipse to sit on; it is simply gone.
    if (!el.closed) return null;
    el.m0 = el.m - K.meanMotion(el.a, dom.mu) * t;
    return { parent: dom.id, el: el };
  }

  function canisterAt(c, sys, t) {
    var parent = sys.byId[c.rail.parent];
    var ps = bodyState(parent, sys, t);
    var rel = K.state(c.rail.el, parent.mu, t);
    return { pos: V.add(ps.pos, rel.pos), vel: V.add(ps.vel, rel.vel) };
  }

  function updateCanisters(sys, shipPos, t, dtSim) {
    var list = sys.canisters;
    if (!list || !list.length) return;
    var keep = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (t >= c.expires) continue;

      var near = V.dist(c.pos, shipPos) < WAKE_RANGE;

      /* Wreckage takes the cheap path and takes it first. Out of range it is
       * simply dropped rather than parked on an ellipse — the player asked
       * for despawn-on-leaving-the-area, and the wake radius is already this
       * game's definition of "the area". */
      if (c.kind === 'debris') {
        if (!near) continue;
        if (dtSim > 0) stepDebris(c, sys, t, dtSim);
        keep.push(c);
        continue;
      }

      if (near) {
        // Waking: pick up wherever the rail says it got to.
        if (c.rail) {
          var st = canisterAt(c, sys, t);
          c.pos = st.pos; c.vel = st.vel;
          c.rail = null;
        }
        if (dtSim > 0) {
          /* Sub-stepped the same way the ship is, so a canister dropped in
           * a low orbit does not tunnel through the planet at high warp. */
          var left = dtSim, guard = 0, tt = t;
          c.thrust = ZERO;
          while (left > 1e-9 && guard++ < 64) {
            var h = Math.min(left, suggestedStep(c, sys, tt));
            stepShip(c, sys, tt, h);
            left -= h; tt += h;
          }
          /* It falls like anything else falls. Hitting the ground is the
           * end of it — there is no crater to inspect. */
          if (checkImpact(c, sys, t)) continue;
        }
      } else {
        // Sleeping: freeze the ellipse once, then read it off every frame.
        if (!c.rail) {
          c.rail = canisterRail(c, sys, t);
          if (!c.rail) continue;          // escaping: nobody will see it again
        }
        var s2 = canisterAt(c, sys, t);
        c.pos = s2.pos; c.vel = s2.vel;
      }
      keep.push(c);
    }
    sys.canisters = keep;
  }

  function canistersAll(sys) { return sys.canisters || []; }

  /* ---- wreckage ---------------------------------------------------------
   * What is left of a ship, and the thing the explosion has been standing in
   * for since combat existed. Also, eventually, what comes off a rock under
   * a mining laser — same shards, same physics, same scoop, two sources.
   *
   * IN sys.canisters, NOT BESIDE IT. A shard shares almost everything with a
   * jettisoned crate: it drifts, it expires, it is a scanner return, it can
   * be flown into, and some of it is worth taking aboard. Giving it its own
   * list would mean a second collision test, a second scoop, a second
   * expiry sweep and a second thing to remember on every code path that
   * touches loose objects — four chances to forget one. So it goes in the
   * same array with `kind: 'debris'`, and the handful of places that care
   * branch once.
   *
   * WHAT IT DOES NOT SHARE IS THE PHYSICS, and that is deliberate. A canister
   * lives a DAY of game time and is put on a Kepler rail when it sleeps,
   * because it has to still be there — and still be moving correctly — when
   * you come back for it tomorrow. A shard lives ninety seconds. Solving an
   * ellipse for something that will not exist by the time it completes one
   * degree of it is work done for nobody, and the frame budget on the target
   * machine is not there to spend: the trajectory predictor already costs
   * ~25 ms and the renderer ~3 ms. So debris gets:
   *
   *   - no Kepler rail. Out of range is GONE, not asleep.
   *   - no stepShip, no substepping, no impact test against terrain. One
   *     gravity evaluation and a velocity-Verlet-ish half step.
   *   - ONE dominant body, resolved at spawn and never again. A shard covers
   *     a few kilometres in its whole life, so the body that dominates where
   *     it died still dominates where it dies. This is the single biggest
   *     saving here and it costs nothing in fidelity.
   *
   * MEASURED, because the rule is that anything on the per-frame path gets
   * costed against the budget explicitly rather than asserted to be cheap.
   * A FULL field — 96 shards, the cap — through updateCanisters:
   *
   *     updateCanisters, full field   0.0143 ms/frame
   *     spawnDebris, one whole wreck  0.0168 ms   (once per kill, not per frame)
   *     one Sim.acceleration call     0.0097 ms   <- the unit to compare against
   *
   * So the worst case the cap allows is about one and a half gravity
   * evaluations a frame, against a predictor that costs ~25 ms and a
   * renderer that costs ~3. It is the dominant-body shortcut that buys this:
   * resolving one per shard per frame would have made it 96 of them.
   */
  var DEBRIS_LIFE = 90;          // seconds of game time
  var DEBRIS_MAX = 96;           // shards alive at once, system-wide
  var DEBRIS_SALVAGE_FRAC = 0.3; // share of a wreck's hold that survives it

  /* Wreckage the cap is allowed to throw away. A spent heat sink is on the
   * debris path for its physics but is not litter, so it does not count
   * toward the cap and is never the piece the cap deletes. */
  function isCullable(c) { return c.kind === 'debris' && !c.sink; }

  /* Everything about a wreck is a pure function of the ship that made it, so
   * a replayed kill throws the same pieces the same way. Math.random() here
   * would have been invisible — nobody re-watches an explosion frame by
   * frame — which is exactly the kind of place the doctrine exists to cover.
   *
   * One hash, read in slices, the same way manifestFor does it: one call and
   * one place to look when a shard comes out wrong. */
  function shardHash(id, i) {
    /* Salt FIRST and avalanche after. `wakeHash` learned this the hard way:
     * appending the index to a shared prefix and reading the high bits does
     * not diffuse in FNV-1a, so every arc of a wake came out identical and
     * drew stacked on top of itself. */
    var h = RNG.hashString('shard|' + i + '|' + id);
    h ^= h >>> 13; h = (h * 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return h >>> 0;
  }

  /* Blow a ship apart. `at`/`vel` are where and how fast it was going; the
   * shards inherit that and get a radial kick, because an explosion is a
   * thing that happens to a ship rather than a thing that stops it. */
  function spawnDebris(sys, id, at, vel, size, t, salvage) {
    if (!sys || !at) return [];
    if (!sys.canisters) sys.canisters = [];

    /* Count follows the hull. A shuttle coming apart should not litter the
     * sky the way a bulk freighter does. */
    var scale = Math.max(0.02, size || 0.06);
    var n = Math.max(6, Math.min(16, Math.round(8 + scale * 90)));

    /* Resolved once, for all of them — see the note above. */
    var dom = dominantBody(at, sys, t);
    var domId = dom ? dom.id : null;

    var made = [];
    for (var i = 0; i < n; i++) {
      var h = shardHash(id, i);

      /* A direction off the hash, not off Math.random. Spherical, and taken
       * from two independent slices so the shards do not band. */
      var u = ((h & 1023) / 1023) * 2 - 1;              // cos(polar)
      var az = (((h >>> 10) & 1023) / 1023) * K.TAU;
      var r = Math.sqrt(Math.max(0, 1 - u * u));
      var dir = { x: r * Math.cos(az), y: r * Math.sin(az), z: u };

      /* Kick, in km/s. Scaled to hull size — a big ship holds more energy —
       * and spread over a wide range so the field stretches instead of
       * expanding as a shell, which is what actually reads as an explosion. */
      var kick = (0.004 + ((h >>> 20) & 255) / 255 * 0.026) * (0.6 + scale * 6);

      var c = {
        kind: 'debris',
        id: 'dbr' + (sys.canisterSeq = (sys.canisterSeq || 0) + 1),
        name: 'Wreckage',
        shard: (h >>> 28) & 7,                          // which mesh
        /* Metres, roughly: a plate off a hull, not a whole deck. */
        lengthKm: 0.006 + ((h >>> 5) & 31) / 31 * 0.020,
        tint: null,
        pos: V.addScaled(at, dir, 0.004),
        vel: V.addScaled(vel || ZERO, dir, kick),
        /* Tumble: an axis and a rate. Anything torn off something that just
         * exploded is spinning, and a shard that does not is a floating
         * brick. */
        spinAxis: { x: ((h >>> 3) & 255) / 255 - 0.5,
                    y: ((h >>> 11) & 255) / 255 - 0.5,
                    z: ((h >>> 19) & 255) / 255 - 0.5 },
        spinRate: 0.4 + ((h >>> 26) & 15) / 15 * 2.6,   // rad/s
        phase: (h & 63) / 63 * K.TAU,
        born: t,
        expires: t + DEBRIS_LIFE,
        domId: domId,
        radius: 0.003
      };
      var sl = V.len(c.spinAxis);
      c.spinAxis = sl > 1e-6 ? V.scale(c.spinAxis, 1 / sl) : { x: 0, y: 0, z: 1 };
      sys.canisters.push(c);
      made.push(c);
    }

    /* SOME OF IT IS WORTH TAKING. Salvage rides on the shards rather than on
     * a parallel object, so the scoop, the hold accounting and the scanner
     * all work on it with no new code — a shard with a `cid` is a canister
     * that happens to be shaped like a piece of a ship. */
    if (salvage && salvage.length) {
      var slots = Math.min(made.length, Math.max(2, Math.min(4, salvage.length + 1)));
      var put = 0;
      for (var s = 0; s < salvage.length && put < slots; s++) {
        var amount = (salvage[s].qty || salvage[s].tonnes || 0) * DEBRIS_SALVAGE_FRAC;
        if (!(amount > 0)) continue;
        /* Spread over up to two shards so salvage is a small FIELD to fly
         * through rather than one lucky pixel. */
        var pieces = amount > 6 ? 2 : 1;
        for (var p = 0; p < pieces && put < slots; p++, put++) {
          var sh = made[put];
          sh.cid = salvage[s].cid;
          sh.tonnes = Math.max(0.1, Math.round((amount / pieces) * 10) / 10);
          sh.name = 'Salvage';
          sh.lengthKm = Math.max(sh.lengthKm, 0.014);   // worth spotting
        }
      }
    }

    /* Globally capped, oldest first. An uncapped field is a memory leak that
     * grows with the body count, and the oldest shards are the ones the
     * player has already stopped looking at. Only debris is culled — a
     * jettisoned canister is somebody's cargo and is not litter, and a spent
     * heat sink is a record of where you were, which is exactly the thing
     * the wreck of the ship you just killed must not be allowed to delete. */
    var live = 0, k;
    for (k = 0; k < sys.canisters.length; k++) {
      if (isCullable(sys.canisters[k])) live++;
    }
    while (live > DEBRIS_MAX) {
      for (k = 0; k < sys.canisters.length; k++) {
        if (isCullable(sys.canisters[k])) { sys.canisters.splice(k, 1); break; }
      }
      live--;
    }
    return made;
  }

  /* One shard, one frame. Deliberately not stepShip: see the note above. */
  function stepDebris(c, sys, t, dt) {
    var parent = c.domId && sys.byId ? sys.byId[c.domId] : null;
    if (parent && parent.mu > 0) {
      var bp = bodyPosition(parent, sys, t);
      var dx = bp.x - c.pos.x, dy = bp.y - c.pos.y, dz = bp.z - c.pos.z;
      var d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 1e-9) {
        var d = Math.sqrt(d2), a = parent.mu / d2 / d;   // mu/d^2, then normalise
        c.vel.x += dx * a * dt;
        c.vel.y += dy * a * dt;
        c.vel.z += dz * a * dt;
      }
    }
    c.pos.x += c.vel.x * dt;
    c.pos.y += c.vel.y * dt;
    c.pos.z += c.vel.z * dt;
  }

  /* ---- the ejected heat sink --------------------------------------------
   * `G.sinkEjections` has been written and never read since heat sinks were
   * built, with a note saying the physical object was the debris system's
   * job. Phase 4 landed; this is that job.
   *
   * IT IS A SHARD, not a fourth kind of loose object. Everything a spent
   * sink needs — drift, expiry, a scanner return, a place in the one array
   * that already holds loose things — a shard already has, and the file's
   * own doctrine is that salvage rides on shards rather than beside them
   * ("a shard with a `cid` is a canister that happens to be shaped like a
   * piece of a ship"). So a shard with `sink` set is a shard that happens
   * to be glowing. Three places branch on it and nothing else changes.
   *
   * WHAT IT DOES NOT SHARE with wreckage is its lifetime and its cull. It
   * lives two and a half minutes rather than ninety seconds, because the
   * point of the thing is that it outlasts the fight that made it; and it
   * is exempt from DEBRIS_MAX, because being deleted by the sixteen shards
   * of the ship you just killed is precisely the case it exists for.
   *
   * THE HEAT IS CLOSED-FORM, not ticked. A half-life read off `born` costs
   * nothing per frame, cannot drift if a frame is long or a step is
   * skipped, and is the same idiom `corruptionShift` already uses. */
  var SINK_LIFE = 150;          // seconds of game time before it is gone
  var SINK_HALFLIFE = 34;       // seconds to shed half of what it carries
  var SINK_SHOVE = 0.025;       // km/s — a launcher throws harder than a hand

  /* What the block is carrying NOW. Anything reading a sink's heat asks
   * this rather than the stored figure, which is what it left with. */
  function sinkHeatAt(c, t) {
    if (!c || !c.sink) return 0;
    var age = Math.max(0, t - (c.born || 0));
    return (c.sinkHeat0 || 0) * Math.pow(0.5, age / SINK_HALFLIFE);
  }

  function spawnSink(sys, ship, heat, t) {
    if (!sys || !ship) return null;
    if (!sys.canisters) sys.canisters = [];

    /* Out of the launcher and clear of the hull, away from the nose. Same
     * reasoning as a jettisoned crate — a block that keeps your exact
     * velocity is a block you will meet again the moment you decelerate —
     * except thrown about twice as hard, because this one was fired rather
     * than pushed. */
    var away = V.len(ship.fwd) > 1e-9 ? V.norm(ship.fwd) : { x: 1, y: 0, z: 0 };
    var dom = dominantBody(ship.pos, sys, t);

    var c = {
      kind: 'debris',
      sink: true,
      id: 'snk' + (sys.canisterSeq = (sys.canisterSeq || 0) + 1),
      name: 'Spent heat sink',
      shard: 0,
      lengthKm: 0.005,                                 // 5 m of ablative block
      sinkHeat0: Math.max(0, heat || 0),
      pos: V.addScaled(ship.pos, away, -0.06),
      vel: V.addScaled(ship.vel, away, -SINK_SHOVE),
      /* It tumbles, but lazily — it was ejected, not blown off. */
      spinAxis: { x: 0.3, y: 0.9, z: 0.2 },
      spinRate: 0.7,
      phase: 0,
      born: t,
      expires: t + SINK_LIFE,
      life: SINK_LIFE,
      domId: dom ? dom.id : null,
      radius: 0.003
    };
    var sl = V.len(c.spinAxis);
    c.spinAxis = sl > 1e-6 ? V.scale(c.spinAxis, 1 / sl) : { x: 0, y: 0, z: 1 };
    sys.canisters.push(c);
    return c;
  }

  function debrisAll(sys) {
    var list = sys.canisters, out = [];
    if (!list) return out;
    for (var i = 0; i < list.length; i++) {
      if (list[i].kind === 'debris') out.push(list[i]);
    }
    return out;
  }

  var Sim = {
    orbitMu: orbitMu,
    bodyState: bodyState,
    bodyPosition: bodyPosition,
    bodyVelocity: bodyVelocity,
    acceleration: acceleration,
    dominantBody: dominantBody,
    localVertical: localVertical,
    relativeToShipFrame: relativeToShipFrame,
    attitudeAngles: attitudeAngles,
    makeShip: makeShip,
    integrateAttitude: integrateAttitude,
    stepShip: stepShip,
    suggestedStep: suggestedStep,
    advanceShip: advanceShip,
    checkImpact: checkImpact,
    scanForImpact: scanForImpact,
    dockingStatus: dockingStatus,
    dockShip: dockShip,
    updateDockedShip: updateDockedShip,
    controlState: controlState, controlInRange: controlInRange,
    beginArrival: beginArrival, stepArrival: stepArrival,
    arrivalActive: arrivalActive, arrivalPose: arrivalPose,
    arrivalPath: arrivalPath, arrivalTotal: arrivalTotal,
    ARRIVAL_LEGS: ARRIVAL_LEGS,
    ARRIVAL_ENCLOSED_FROM: ARRIVAL_ENCLOSED_FROM,
    ORBITAL_LEGS: ORBITAL_LEGS,
    ORBITAL_ENCLOSED_FROM: ORBITAL_ENCLOSED_FROM,
    legsFor: legsFor,
    undockShip: undockShip,
    GEAR_DRAG_FACTOR: GEAR_DRAG_FACTOR,
    airDensity: airDensity,
    atmosphereContext: atmosphereContext,
    heatFlux: heatFlux,
    updateHeating: updateHeating,
    updateGear: updateGear, GEAR_TRAVEL_TIME: GEAR_TRAVEL_TIME,
    HEAT_LIMIT: HEAT_LIMIT,
    predictTrajectory: predictTrajectory,
    beginPrediction: beginPrediction,
    stepPrediction: stepPrediction,
    ellipsePath: ellipsePath,
    oscElements: oscElements,
    orbitalBasis: orbitalBasis,
    orbitalBasisAt: orbitalBasisAt,
    makeNode: makeNode,
    nodeMagnitude: nodeMagnitude,
    coastTo: coastTo,
    nodeBurn: nodeBurn,
    nodePlan: nodePlan,
    predictAfterNode: predictAfterNode,
    apsisTimes: apsisTimes,
    circularOrbit: circularOrbit,
    cargoMass: cargoMass,
    shipMass: shipMass,
    exhaustVelocity: exhaustVelocity,
    deltaV: deltaV,
    thrusterEndurance: thrusterEndurance,
    refreshShip: refreshShip,
    fuelBurn: fuelBurn,
    surfaceOffset: surfaceOffset,
    portEntrance: portEntrance,
    groundBasis: groundBasis,
    stationBasis: stationBasis,
    portBasis: portBasis,
    insideShaft: insideShaft,
    berthState: berthState,
    berthCapture: berthCapture,
    checkStationImpact: checkStationImpact,
    stationSolidity: stationSolidity,
    stationSolidAt: stationSolidAt,
    insideStation: insideStation,
    /* Exported so a test can ask what the berth's own facing IS, rather than
     * re-deriving it and pinning its own arithmetic instead of the game's. */
    berthFacing: berthFacing,
    assignBerth: assignBerth,
    hullBox: hullBox, berthBoxes: berthBoxes, boxFits: boxFits,
    berthRoom: berthRoom,
    padCapture: padCapture,
    landingDamage: landingDamage,
    smootherstep: smootherstep,
    trafficState: trafficState,
    trafficAll: trafficAll,
    berthStatus: berthStatus,
    berthCapacity: berthCapacity,
    berthOccupants: berthOccupants,
    needsLargeBerth: needsLargeBerth,
    nearestTraffic: nearestTraffic,
    bodyStateAt: bodyStateAt,
    patrolState: patrolState,
    shipsAll: shipsAll,
    nearestShip: nearestShip,
    updateEncounters: updateEncounters,
    policeNearby: policeNearby,
    pirateDemand: pirateDemand,
    payPirate: payPirate,
    sleepAll: sleepAll,
    regCode: regCode,
    dropCanister: dropCanister,
    updateCanisters: updateCanisters,
    canistersAll: canistersAll,
    spawnDebris: spawnDebris, debrisAll: debrisAll, stepDebris: stepDebris,
    spawnSink: spawnSink, sinkHeatAt: sinkHeatAt,
    SINK_LIFE: SINK_LIFE, SINK_HALFLIFE: SINK_HALFLIFE,
    DEBRIS_LIFE: DEBRIS_LIFE, DEBRIS_MAX: DEBRIS_MAX,
    CANISTER_LIFE: CANISTER_LIFE,
    WAKE_RANGE: WAKE_RANGE,
    SLEEP_RANGE: SLEEP_RANGE,
    CLOSE_RANGE: CLOSE_RANGE
  };

  global.Sim = Sim;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
