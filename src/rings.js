/* rings.js — planetary rings, asteroid belts, and the rock in them.
 *
 * RUNG 0 OF THE MINING LADDER (claude/mining-and-survey.md): somewhere to
 * mine. Rings sit around giants inside the Roche limit; belts sit where a
 * giant's resonances would have stopped a planet forming, and past the last
 * planet. Neither existed before 2026-10-15, so both are built the way every
 * addition to this generator has been built:
 *
 *   ADDITIVE. Their own named substreams ('rings', 'belts'), forked off the
 *   system seed after every other generator has run. A fork does not draw
 *   from its parent, so not one star, planet, port, route or price moves.
 *   tools/fingerprint.cjs proves it; test/rings.test.js holds it.
 *
 *   ON RAILS. Nothing here is integrated. A ring chunk is a circular orbit
 *   in the ring plane; a rock in a belt field is a Clohessy-Wiltshire
 *   (Hill-frame) ellipse about a field centre that is itself a Kepler
 *   orbit. Every rock's position and velocity is a closed-form function of
 *   t, so a rock you mark today is where the formula says in a year.
 *
 *   FOUND LOCALLY. A belt has more rocks than the game could ever list, so
 *   none are listed. Ring chunks live on a lattice that co-rotates bin by
 *   bin; the renderer asks "what is within 3 km of this point" and gets an
 *   answer whose cost does not depend on the size of the ring.
 *
 * WHY BELT ROCK IS IN FIELDS. A real belt is nearly empty: the mean gap
 * between kilometre rocks is millions of kilometres, and a game that was
 * honest about that would have nothing to fly near. What a real belt also
 * has are collisional FAMILIES — fragments of one body, still sharing nearly
 * one orbit. Those are the fields: a few per belt, tens to hundreds of km
 * across, dense enough to fly through. Finding them is the survey's job
 * (rung 1). Between fields the belt is honest, which means empty.
 *
 * Loads after kepler.js, before generate.js (index.html). Node requires it
 * from generate.js, so the suites need no change to their load lists.
 */
(function (global) {
  'use strict';

  var V = global.V || require('./vec3.js');
  var K = global.Kepler || require('./kepler.js');
  var RNG = global.RNG || require('./rng.js');

  var G_KM = 6.67430e-20;              // km^3 kg^-1 s^-2, same as sim.js
  var AU = 1.495978707e8;              // km
  var DEG = Math.PI / 180;
  var TAU = Math.PI * 2;
  var ICE_DENSITY = 917;               // kg/m^3 — what ring particles are made of
  var ROCK_DENSITY = 2600;

  /* ---- hashing --------------------------------------------------------
   * Integer hashing for the lattice and the field members. Not the RNG:
   * a lattice cell has to answer "what is here" from its own coordinates
   * alone, without having walked the stream from the start. Salt first,
   * then an avalanche tail — SLIPSPACE-TODO's lesson about FNV and a
   * last-byte change not diffusing upward. */
  function mix32(h) {
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function hash3(salt, a, b, c) {
    var h = mix32((salt >>> 0) ^ 0x9e3779b9);
    h = mix32(h ^ (a | 0));
    h = mix32(h ^ Math.imul(b | 0, 0x85ebca6b));
    h = mix32(h ^ Math.imul(c | 0, 0xc2b2ae35));
    return h;
  }
  function unit(h) { return h / 4294967296; }
  /* A second and third independent number from one hash. */
  function unit2(h) { return unit(mix32(h ^ 0x68e31da4)); }
  function unit3(h) { return unit(mix32(h ^ 0x1b56c4e9)); }
  function unit4(h) { return unit(mix32(h ^ 0x3c6ef372)); }

  /* Smooth value noise in one dimension, the CPU twin of the shader's. Kept
   * deliberately simple so the two languages compute the same thing: the
   * picture of a ring and the density a mining laser reads off it must not
   * be two different rings.
   *
   * INTEGER, not the usual fract(sin(x) * 43758). That one is fine as
   * decoration and useless as a twin: float32 sin at an argument of 1e5
   * keeps about two decimal places, so the GPU and the CPU would draw two
   * different rings. GLSL ES 3.0 has 32-bit uints that wrap exactly like
   * Math.imul, so this hash is bit-identical in both. */
  function vhash(i, s) {
    return unit(mix32(((i | 0) ^ Math.imul(s | 0, 0x27d4eb2d)) >>> 0));
  }
  function vnoise(x, s) {
    var i = Math.floor(x), f = x - i;
    var u = f * f * (3 - 2 * f);
    return vhash(i, s) * (1 - u) + vhash(i + 1, s) * u;
  }
  function smoothstep(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function isGiant(b) { return b.type === 'gasGiant' || b.type === 'iceGiant'; }
  function bulkDensity(b) {
    var rM = b.radius * 1000;
    return b.mass / ((4 / 3) * Math.PI * rM * rM * rM);
  }

  /* ---- the ring plane --------------------------------------------------
   * A ring lies in its planet's EQUATORIAL plane, because that is where an
   * oblate planet's gravity flattens a debris disc to. The pole is read out
   * of the same construction sim.js uses to put a port on the ground and
   * gl.js uses to band the clouds: body-fixed +z tipped about x by the
   * tilt. So x is the node line, and the ring frame is
   *   e1 = (1, 0, 0),  e2 = (0, cos t, sin t),  n = (0, -sin t, cos t)
   * — right-handed, e1 x e2 = n. A ring circulates the way its planet
   * spins, so a retrograde world has retrograde rings. */
  function ringFrame(planet) {
    var tilt = planet.rotation ? planet.rotation.tilt : 0;
    var c = Math.cos(tilt), s = Math.sin(tilt);
    var spin = (planet.rotation && planet.rotation.period < 0) ? -1 : 1;
    /* A locked world's frame is also turned about z by `az` (sim.js
     * surfaceOffset). Zero for everything else, which is the old frame. */
    var az = (planet.rotation && planet.rotation.az) || 0;
    var ca = Math.cos(az), sa = Math.sin(az);
    return {
      e1: { x: ca, y: sa, z: 0 },
      e2: { x: -sa * c, y: ca * c, z: s },
      n: { x: sa * s, y: -ca * s, z: c },
      spin: spin
    };
  }

  /* The Roche limit for a FLUID satellite of ice — the radius inside which
   * a loose clump of ring material is pulled apart faster than it can
   * gather. Rings live inside it and moons outside it, which is the whole
   * reason rings exist where they do. */
  function rocheIce(planet) {
    return 2.44 * planet.radius * Math.pow(bulkDensity(planet) / ICE_DENSITY, 1 / 3);
  }

  var RING_ROCK = [0x6e, 0x60, 0x52];     // radiation-darkened, dusty
  var RING_ICE = [0xea, 0xe4, 0xd6];      // fresh water ice
  function hex2(n) { var s = Math.round(n).toString(16); return s.length < 2 ? '0' + s : s; }
  function iceColour(ice) {
    return '#' + hex2(RING_ROCK[0] + (RING_ICE[0] - RING_ROCK[0]) * ice) +
                 hex2(RING_ROCK[1] + (RING_ICE[1] - RING_ROCK[1]) * ice) +
                 hex2(RING_ROCK[2] + (RING_ICE[2] - RING_ROCK[2]) * ice);
  }

  function buildRings(sys, base) {
    var rr = base.fork('rings');
    var planets = sys.root.children.filter(function (b) { return b.kind === 'planet'; });
    for (var i = 0; i < planets.length; i++) {
      var p = planets[i];
      if (!isGiant(p)) continue;
      var r = rr.fork('ring-' + p.id);
      var gas = p.type === 'gasGiant';
      /* Every giant in our own system has rings; most are faint. So the
       * question per giant is less "does it" than "would you notice". */
      if (!r.chance(gas ? 0.72 : 0.55)) continue;

      var roche = rocheIce(p);
      var innerMoon = Infinity;
      for (var m = 0; m < p.children.length; m++) {
        var c = p.children[m];
        if (c.kind === 'moon' && c.orbit) {
          innerMoon = Math.min(innerMoon, c.orbit.a * (1 - c.orbit.e));
        }
      }
      var inner = p.radius * r.range(1.11, 1.42);
      var outer = Math.min(roche * r.range(0.86, 1.0), innerMoon * 0.9);
      if (!(outer > inner * 1.18)) continue;

      var grand = gas && r.chance(0.34);
      var opacity = grand ? r.range(0.72, 0.92) : r.range(0.18, 0.42);
      var ice = grand ? r.range(0.86, 0.99)
              : gas ? r.range(0.25, 0.7) : r.range(0.12, 0.5);

      /* Gaps, in absolute km. Some are what moonlets clear; the Cassini-like
       * one in a grand ring is wide. A STATION ORBITING INSIDE THE RING keeps
       * a lane swept round its own radius — otherwise it would be flying
       * through ice twice an orbit, which nobody would build. */
      var gaps = [];
      var nGaps = grand ? r.int(2, 5) : r.int(0, 3);
      for (var g = 0; g < nGaps; g++) {
        var at = inner + (outer - inner) * r.range(0.12, 0.9);
        var hw = (outer - inner) * (g === 0 && grand ? r.range(0.025, 0.05) : r.range(0.004, 0.018));
        gaps.push({ r: at, hw: hw, kind: 'moonlet' });
      }
      for (var s = 0; s < p.children.length; s++) {
        var st = p.children[s];
        if (st.kind !== 'station' || !st.orbit || st.surface) continue;
        var lo = st.orbit.a * (1 - st.orbit.e), hi = st.orbit.a * (1 + st.orbit.e);
        if (hi < inner || lo > outer) continue;
        var lane = Math.max(250, (st.radius || 1) * 60);
        gaps.push({ r: (lo + hi) / 2, hw: (hi - lo) / 2 + lane, kind: 'lane', station: st.id });
      }
      /* The shader carries eight. Station lanes are never the ones dropped:
       * a lane is a promise the station is not flying through ice. */
      while (gaps.length > 8) {
        var drop = -1;
        for (var gd = gaps.length - 1; gd >= 0; gd--) if (gaps[gd].kind === 'moonlet') { drop = gd; break; }
        if (drop < 0) { gaps.length = 8; break; }
        gaps.splice(drop, 1);
      }

      p.ring = {
        inner: inner, outer: outer, opacity: opacity, ice: ice,
        grand: grand, color: iceColour(ice),
        gaps: gaps,
        /* An integer: the noise is an integer hash (see vhash). */
        seed: r.int(1, 999983),
        /* Real rings are tens of metres thick. This is how far chunks are
         * scattered out of the plane, and it is generous so a ring you are
         * flying through feels like a layer and not a sheet of paper. */
        thickness: r.range(0.08, 0.35),
        roche: roche
      };
    }
  }

  /* Optical depth of a ring at radius r (km from the planet's centre),
   * 0..~1. THE SAME FUNCTION THE SHADER DRAWS: profile edges, three octaves
   * of ringlet structure, gaps. What a chunk lattice or a mining scan reads
   * off a ring is therefore what the player sees. */
  function ringDensity(ring, r) {
    if (!ring || r <= ring.inner || r >= ring.outer) return 0;
    var span = ring.outer - ring.inner;
    var x = (r - ring.inner) / span;
    var d = smoothstep(0, 0.035, x) * (1 - smoothstep(0.955, 1, x));
    var s = ring.seed;
    var n = 0.52 + 0.30 * vnoise(x * 23, s) + 0.14 * vnoise(x * 97, s + 101) +
            0.10 * vnoise(x * 389, s + 211);
    d *= ring.opacity * Math.min(1.15, n);
    for (var i = 0; i < ring.gaps.length; i++) {
      var g = ring.gaps[i];
      d *= smoothstep(g.hw * 0.55, g.hw, Math.abs(r - g.r));
    }
    return Math.max(0, Math.min(1, d));
  }

  /* ---- belts -----------------------------------------------------------
   *
   * THE INNER BELT sits inside the first giant, where that giant's
   * resonances kept the planetesimals stirred up too fast to stick — the
   * main belt between Mars and Jupiter is 0.40 to 0.63 of Jupiter's orbit,
   * and those are the fractions used. It also has to clear the planet
   * inside it, or the belt would be drawn through somebody's orbit.
   *
   * THE OUTER BELT is the Kuiper analogue past the last planet: icy, wide,
   * and starting a little outside the last planet's 3:2 resonance.
   *
   * KIRKWOOD GAPS are where a rock would orbit a whole number of times for
   * every few of the giant's — 3:1, 5:2, 7:3, 2:1 — and get kicked out.
   * a = a_giant * (q/p)^(2/3). Fields are never placed in one. */
  var RESONANCES = [[3, 1], [5, 2], [7, 3], [2, 1]];
  var FIELD_NAMES = ['Cinder', 'Hollow', 'Shale', 'Gravel', 'Anvil', 'Slag',
                     'Talus', 'Scree', 'Flint', 'Ember', 'Rime', 'Clinker',
                     'Basalt', 'Tumble', 'Cairn', 'Drift', 'Breccia', 'Lode'];
  var LETTER = 'ABCDEFGHIJKL';

  function buildBelts(sys, base) {
    var br = base.fork('belts');
    var star = sys.root;
    var planets = star.children.filter(function (b) { return b.kind === 'planet'; });
    planets.sort(function (a, b) { return a.orbit.a - b.orbit.a; });
    sys.belts = [];
    if (!planets.length) return;

    var giantIdx = -1;
    for (var i = 1; i < planets.length; i++) if (isGiant(planets[i])) { giantIdx = i; break; }
    var ir = br.fork('inner');
    if (giantIdx > 0 && ir.chance(0.78)) {
      var gi = planets[giantIdx], pv = planets[giantIdx - 1];
      var inner = Math.max(pv.orbit.a * (1 + pv.orbit.e) * 1.22, gi.orbit.a * ir.range(0.36, 0.44));
      var outer = gi.orbit.a * (1 - gi.orbit.e) * ir.range(0.62, 0.68);
      if (outer > inner * 1.15) {
        var gaps = [];
        for (var k = 0; k < RESONANCES.length; k++) {
          var ra = gi.orbit.a * Math.pow(RESONANCES[k][1] / RESONANCES[k][0], 2 / 3);
          if (ra > inner && ra < outer) {
            gaps.push({ a: ra, hw: gi.orbit.a * 0.006, res: RESONANCES[k][0] + ':' + RESONANCES[k][1] });
          }
        }
        sys.belts.push(makeBelt(sys, 'belt-inner', star.name + ' Belt', inner, outer,
                                ir.range(0.04, 0.22), gaps, gi, ir.fork('fields')));
      }
    }
    /* MEASURED, AND WHY THE TROJANS EXIST. Over 80 kawartha systems the
     * inner belt above fired ZERO times. This generator steps orbits by
     * 1.30-1.75 (generate.js), so the planet inside a giant always sits
     * well past 0.65 of the giant's orbit, and there is no stable room for
     * a belt between them — a giant clears about three Hill radii either
     * side, ~0.3 of its orbit. That is the honest answer, and it is kept
     * rather than forced: a seed whose spacing ever does leave the room
     * gets its belt.
     *
     * What a giant DOES hold, everywhere, is Trojans: rock parked at the
     * L4 and L5 points sixty degrees ahead of and behind it on its own
     * orbit, where the giant's pull and the star's balance. Jupiter's are
     * thought to be as numerous as the main belt's. Same orbit, same mean
     * motion, so a Trojan field stays sixty degrees off its giant forever
     * with no special case anywhere — it is just a Kepler orbit with a
     * different m0. (The real ones librate slowly about the point; that
     * is the one simplification, and it is invisible at game timescales.) */
    for (var gti = 0; gti < planets.length; gti++) {
      var gt = planets[gti];
      if (!isGiant(gt)) continue;
      var tr = br.fork('trojans-' + gt.id);
      if (!tr.chance(gt.type === 'gasGiant' ? 0.62 : 0.42)) continue;
      sys.belts.push(makeTrojans(sys, gt, tr));
    }
    var or = br.fork('outer');
    var last = planets[planets.length - 1];
    if (or.chance(0.6)) {
      var oi = last.orbit.a * (1 + last.orbit.e) * or.range(1.32, 1.5);
      var oo = oi * or.range(1.4, 1.9);
      sys.belts.push(makeBelt(sys, 'belt-outer', star.name + ' Outer Belt', oi, oo,
                              or.range(0.75, 0.97), [], last, or.fork('fields')));
    }
  }

  function inGap(belt, a, margin) {
    for (var i = 0; i < belt.gaps.length; i++) {
      if (Math.abs(a - belt.gaps[i].a) < belt.gaps[i].hw * (margin || 1)) return true;
    }
    return false;
  }

  function makeBelt(sys, id, name, inner, outer, ice, gaps, shepherd, fr) {
    var belt = {
      id: id, kind: 'belt', name: name, inner: inner, outer: outer,
      /* The belt's own scatter out of the ecliptic — a real belt is a thick
       * torus, not a ring, and on the chart this is how fat it is drawn. */
      spread: fr.range(4, 9) * DEG,
      ice: ice, gaps: gaps, shepherd: shepherd ? shepherd.id : null,
      fields: []
    };
    var nf = fr.int(4, 9);
    var names = FIELD_NAMES.slice();
    for (var f = 0, tries = 0; f < nf && tries < 60; tries++) {
      var a = fr.range(inner * 1.03, outer * 0.97);
      if (inGap(belt, a, 2.5)) continue;
      /* Keep the whole orbit inside the belt, so a field is never found
       * sitting among the planets. */
      var eMax = Math.max(0.005, Math.min(1 - inner / a, outer / a - 1) * 0.9);
      var e = Math.min(eMax, Math.abs(fr.gauss(0, 0.05)));
      var nameIdx = fr.int(0, names.length - 1);
      var nm = names.splice(nameIdx, 1)[0] || ('Field ' + LETTER.charAt(f));
      /* Composition: an inner belt runs from stony near the star to
       * carbonaceous and icy far out, the way the real one does; metal is
       * the minority everywhere and the reason anybody goes. Recorded here,
       * read by the survey (rung 1). */
      var x = (a - inner) / (outer - inner);
      var fIce = Math.max(0, Math.min(1, ice + (x - 0.5) * 0.3 + fr.gauss(0, 0.08)));
      var metal = Math.max(0.01, Math.min(0.6, fr.range(0.02, 0.18) + (fr.chance(0.18) ? fr.range(0.15, 0.35) : 0)));
      belt.fields.push({
        id: id + '-f' + f,
        name: nm + ' Field',
        belt: id,
        orbit: {
          parent: sys.root.id, a: a, e: e,
          inc: Math.abs(fr.gauss(0, belt.spread / 1.8)),
          lan: fr.angle(), argp: fr.angle(), m0: fr.angle()
        },
        radius: fr.logRange(40, 260),          // km
        count: fr.int(70, 240),
        ice: fIce, metal: metal,
        seed: fr.int(1, 2147483646)
      });
      f++;
    }
    return belt;
  }

  /* A giant's two Trojan clouds, as fields on its own orbit sixty degrees
   * either side of it. L4 leads, L5 trails. */
  function makeTrojans(sys, giant, tr) {
    var go = giant.orbit;
    var cloud = {
      id: 'trojan-' + giant.id, kind: 'trojan', name: giant.name + ' Trojans',
      giant: giant.id, inner: go.a * (1 - go.e), outer: go.a * (1 + go.e),
      spread: tr.range(6, 14) * DEG,
      /* Trojans are dark and primitive — carbon-rich, with ice under the
       * crust the further out the giant is. Set by where the giant sits
       * against the frost line, not rolled. */
      ice: Math.max(0.1, Math.min(0.85, 0.25 + 0.5 * Math.log(go.a / (sys.frostLine || go.a)) / Math.log(4))),
      gaps: [], shepherd: giant.id, fields: []
    };
    var names = FIELD_NAMES.slice();
    var f = 0;
    [{ pt: 'L4', sign: 1 }, { pt: 'L5', sign: -1 }].forEach(function (L) {
      var n = tr.int(1, 2);
      for (var k = 0; k < n; k++) {
        var nm = names.splice(tr.int(0, names.length - 1), 1)[0];
        cloud.fields.push({
          id: cloud.id + '-f' + f,
          name: nm + ' Field (' + L.pt + ')',
          belt: cloud.id, lagrange: L.pt,
          orbit: {
            parent: sys.root.id,
            /* EXACTLY the giant's semi-major axis. Same a is same mean
             * motion, which is the only thing keeping the field at its
             * Lagrange point; 0.4% off and it would drift a radian from it
             * in thirty orbits. Shape and tilt can differ freely. */
            a: go.a,
            e: Math.max(0, go.e + tr.gauss(0, 0.01)),
            inc: Math.abs(go.inc + tr.gauss(0, cloud.spread / 3)),
            lan: go.lan, argp: go.argp,
            m0: go.m0 + L.sign * Math.PI / 3 + tr.gauss(0, 7 * DEG)
          },
          radius: tr.logRange(50, 300),
          count: tr.int(80, 240),
          ice: Math.max(0, Math.min(1, cloud.ice + tr.gauss(0, 0.08))),
          metal: Math.max(0.01, Math.min(0.5, tr.range(0.02, 0.12) + (tr.chance(0.15) ? tr.range(0.12, 0.3) : 0))),
          seed: tr.int(1, 2147483646)
        });
        f++;
      }
    });
    return cloud;
  }

  /* ---- the rock, on rails ----------------------------------------------- */

  function starMu(sys) { return G_KM * sys.root.mass; }

  /* A field's centre: an ordinary Kepler orbit about the star. The star
   * sits at the origin (sim.js bodyState: a body with no orbit is at zero),
   * so this is already a world position. */
  function fieldCenter(field, sys, t) {
    return K.state(field.orbit, starMu(sys), t);
  }

  /* The Hill frame at the field centre: x out from the star, z along the
   * orbit's angular momentum, y along-track. */
  function hillFrame(c) {
    var x = V.norm(c.pos);
    var z = V.norm(V.cross(c.pos, c.vel));
    return { x: x, y: V.cross(z, x), z: z };
  }

  /* One member of a field: a BOUNDED Clohessy-Wiltshire orbit about the
   * centre. These are the exact linearised solutions of relative motion
   * near a circular orbit with the drift term set to zero —
   *     x = A cos(nt + p)
   *     y = y0 - 2A sin(nt + p)
   *     z = B cos(nt + q)
   * a 2:1 ellipse in the orbit plane plus a bob out of it, each with the
   * orbital period. Over the hours a pilot spends in a field the rocks
   * barely move against each other, which is what a family really looks
   * like; over years they go round their ellipses and never disperse,
   * which is the game's guarantee that a rock you marked stays marked.
   * Size is log-distributed with a long tail: mostly boulders, a few
   * kilometre-class rocks you could land on. */
  function fieldMember(field, i, sys, t, c, hf) {
    c = c || fieldCenter(field, sys, t);
    hf = hf || hillFrame(c);
    var R = field.radius;
    var h = hash3(field.seed, i, 0, 0);
    var A = R * 0.3 * unit(h);
    var y0 = (2 * unit2(h) - 1) * (R - 2 * A);
    var B = R * 0.35 * unit3(h);
    var p = unit4(h) * TAU;
    var h2 = hash3(field.seed, i, 1, 0);
    var q = unit(h2) * TAU;
    var n = Math.sqrt(starMu(sys) / Math.pow(V.len(c.pos), 3));
    var ph = n * t + p, qh = n * t + q;
    var cp = Math.cos(ph), sp = Math.sin(ph), cq = Math.cos(qh), sq = Math.sin(qh);
    var lx = A * cp, ly = y0 - 2 * A * sp, lz = B * cq;
    var vx = -A * n * sp, vy = -2 * A * n * cp, vz = -B * n * sq;
    var off = V.add(V.add(V.scale(hf.x, lx), V.scale(hf.y, ly)), V.scale(hf.z, lz));
    var vh = V.add(V.add(V.scale(hf.x, vx), V.scale(hf.y, vy)), V.scale(hf.z, vz));
    /* The Hill frame turns at n about z, so the inertial relative velocity
     * carries omega x r on top of the in-frame one. */
    var wxr = V.scale(V.cross(hf.z, off), n);
    var u = unit2(h2);
    var size = u < 0.04 ? 0.6 + unit3(h2) * 1.9
             : Math.exp(Math.log(0.015) + (Math.log(0.6) - Math.log(0.015)) * Math.pow(unit3(h2), 1.7));
    return {
      id: field.id + ':' + i,
      pos: V.add(c.pos, off),
      vel: V.add(c.vel, V.add(vh, wxr)),
      size: size,                      // km, a radius
      shape: mix32(h2 ^ 0x5bd1e995) % ROCK_SHAPES,
      spin: unit4(h2)
    };
  }

  /* Fields whose centre lies within `range` of a point, nearest first. */
  function fieldsNear(sys, point, t, range) {
    var out = [];
    var belts = sys.belts || [];
    for (var b = 0; b < belts.length; b++) {
      var fs = belts[b].fields;
      for (var f = 0; f < fs.length; f++) {
        var c = fieldCenter(fs[f], sys, t);
        var d = V.dist(c.pos, point);
        if (d < range + fs[f].radius) out.push({ field: fs[f], center: c, dist: d });
      }
    }
    out.sort(function (x, y) { return x.dist - y.dist; });
    return out;
  }

  /* ---- ring chunks, on a co-rotating lattice ------------------------------
   *
   * The ring is cut into radial bins CHUNK_DR wide. Each bin is a circle of
   * slots CHUNK_S apart that turns at that radius's own Keplerian rate, so
   * the lattice shears exactly as a ring does — the inner edge laps the
   * outer — and each slot holds a chunk or not by a hash of (bin, slot)
   * weighted by the ring's optical depth there. Gaps are empty because the
   * density is zero there; the same function the shader draws decides it.
   *
   * Neighbouring bins slide past each other at 1.5 n dR: a few centimetres
   * a second. Flying through a ring, the ice around you is all but still,
   * which is the honest answer and the one mining wants. */
  var CHUNK_DR = 0.32, CHUNK_S = 0.32;   // km

  function ringChunksNear(planet, pState, point, radius, t, max) {
    var ring = planet.ring;
    if (!ring) return [];
    var fr = ringFrame(planet);
    var rel = V.sub(point, pState.pos);
    var lu = V.dot(rel, fr.e1), lv = V.dot(rel, fr.e2), lh = V.dot(rel, fr.n);
    if (Math.abs(lh) > radius + ring.thickness) return [];
    var r = Math.sqrt(lu * lu + lv * lv);
    if (r + radius < ring.inner || r - radius > ring.outer) return [];
    var phi = Math.atan2(lv, lu);
    var mu = G_KM * planet.mass;
    var salt = (ring.seed * 7919) >>> 0;
    var out = [];
    var j0 = Math.max(0, Math.floor((r - radius) / CHUNK_DR));
    var j1 = Math.floor((r + radius) / CHUNK_DR);
    for (var j = j0; j <= j1; j++) {
      var aj = (j + 0.5) * CHUNK_DR;
      var dens = ringDensity(ring, aj);
      if (dens <= 0.002) continue;
      var n = Math.sqrt(mu / (aj * aj * aj)) * fr.spin;
      var N = Math.max(8, Math.floor(TAU * aj / CHUNK_S));
      var dphi = TAU / N;
      var theta = (phi - n * t) % TAU;
      if (theta < 0) theta += TAU;
      var kc = Math.round(theta / dphi);
      var dk = Math.ceil(radius / (aj * dphi)) + 1;
      for (var k = kc - dk; k <= kc + dk; k++) {
        var kk = ((k % N) + N) % N;
        var h = hash3(salt, j, kk, 1);
        if (unit(h) > dens * 0.9) continue;
        var a = aj + (unit2(h) - 0.5) * CHUNK_DR * 0.8;
        var ang = (kk + (unit3(h) - 0.5) * 0.8) * dphi + n * t;
        var z = (unit4(h) - 0.5) * ring.thickness;
        var ca = Math.cos(ang), sa = Math.sin(ang);
        var lp = { x: a * ca, y: a * sa };
        var dx = lp.x - lu, dy = lp.y - lv, dz = z - lh;
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > radius * radius) continue;
        var vt = a * n;
        var h2 = mix32(h ^ 0x2545f491);
        var u = unit(h2);
        /* Five to forty metres, and one in thirty up to ~120. Real ring
         * particles run centimetres to a few metres; these are the ones big
         * enough to be worth a laser, and measured in play, anything under
         * five metres at a few hundred was a speck nobody could find. */
        var size = u < 0.03 ? 0.05 + unit2(h2) * 0.07
                 : Math.exp(Math.log(0.005) + (Math.log(0.04) - Math.log(0.005)) * Math.pow(unit3(h2), 1.5));
        out.push({
          id: planet.id + ':r' + j + ':' + kk,
          pos: V.add(pState.pos, V.add(V.add(V.scale(fr.e1, lp.x), V.scale(fr.e2, lp.y)), V.scale(fr.n, z))),
          vel: V.add(pState.vel, V.add(V.scale(fr.e1, -vt * sa), V.scale(fr.e2, vt * ca))),
          size: size,
          shape: h2 % ROCK_SHAPES,
          spin: unit4(h2),
          d2: d2
        });
      }
    }
    out.sort(function (x, y) { return x.d2 - y.d2; });
    if (max && out.length > max) out.length = max;
    return out;
  }

  /* ---- rock meshes ---------------------------------------------------------
   *
   * A handful of shapes, made once and shared by every rock in the game:
   * an icosahedron split once (80 faces), each vertex pushed in or out by a
   * hash and the whole squashed along one axis, so no two shapes read as
   * the same potato. Eighty faces is the RX 540 budget talking — a field
   * draws up to a couple of hundred of these, and a rock filling the screen
   * is the rare case. Unit radius; the renderer scales by the rock's size.
   *
   * One colour per face, the format every other mesh here uses, so these
   * go through the ordinary mesh pass with no new GPU program. Colour is a
   * per-face jitter around a base set by composition: ice reads pale and
   * blue-grey, stone brown-grey, and metal dark with the odd bright face —
   * which is what a survey is for telling apart properly. */
  var ROCK_SHAPES = 6;
  var meshCache = {};

  function icosphere() {
    var t = (1 + Math.sqrt(5)) / 2;
    var v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
             [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    var f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9],
             [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2],
             [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10],
             [8, 6, 7], [9, 8, 1]];
    v = v.map(function (p) { var l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
    var mid = {};
    function midpoint(a, b) {
      var key = a < b ? a + ',' + b : b + ',' + a;
      if (mid[key] !== undefined) return mid[key];
      var p = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2];
      var l = Math.hypot(p[0], p[1], p[2]);
      v.push([p[0] / l, p[1] / l, p[2] / l]);
      return (mid[key] = v.length - 1);
    }
    var out = [];
    for (var i = 0; i < f.length; i++) {
      var a = f[i][0], b = f[i][1], c = f[i][2];
      var ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      out.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    return { v: v, f: out };
  }

  var ROCK_BASE = {
    ice:   [0xc4, 0xd0, 0xd8],
    stone: [0x7d, 0x70, 0x63],
    metal: [0x55, 0x58, 0x5c]
  };

  /* THE CLOSE-UP MESH. Eighty faces is right for a boulder a few pixels
   * across and visibly crude for a two-kilometre rock filling the canopy —
   * seen in play, it reads as a cut gem. So a rock big on screen gets the
   * same shape split twice more (1,280 faces), each new vertex nudged by a
   * finer hash. Split from the DISPLACED coarse mesh, not the sphere, so the
   * silhouette is the one the far mesh had: the swap adds detail, it does
   * not change the rock. Only the few rocks big on screen pay for it. */
  function subdivide(mesh, salt, rough) {
    var v = mesh.v.slice(), f = [], mid = {};
    function midpoint(a, b) {
      var key = a < b ? a + ',' + b : b + ',' + a;
      if (mid[key] !== undefined) return mid[key];
      var p = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2];
      var k = 1 + (unit(hash3(salt, a, b, 3)) - 0.5) * rough;
      v.push([p[0] * k, p[1] * k, p[2] * k]);
      return (mid[key] = v.length - 1);
    }
    var parent = [];
    for (var i = 0; i < mesh.f.length; i++) {
      var a = mesh.f[i][0], b = mesh.f[i][1], c = mesh.f[i][2];
      var ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      f.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      parent.push(i, i, i, i);
    }
    return { v: v, f: f, parent: parent };
  }

  /* kind: 'ice' | 'stone' | 'metal'; detail 2 is the close-up mesh. */
  function rockMesh(shape, kind, detail) {
    kind = ROCK_BASE[kind] ? kind : 'stone';
    if (detail === 2) {
      var dkey = kind + shape + ':2';
      if (meshCache[dkey]) return meshCache[dkey];
      var coarse = rockMesh(shape, kind, 1);
      var dsalt = 0x2c1b3c6d + shape * 131;
      var s1 = subdivide(coarse, dsalt, 0.10);
      var s2 = subdivide(s1, dsalt + 1, 0.05);
      var cc = s2.f.map(function (ff, i) {
        var col = coarse.c[s1.parent[s2.parent[i]]];
        /* A small per-face shift around the parent's colour, so the fine
         * facets catch the light differently without the rock changing
         * colour as it swaps in. */
        var j = 0.93 + unit(hash3(dsalt, i, 5, 0)) * 0.14;
        var n = parseInt(col.slice(1), 16);
        return '#' + hex2(Math.min(255, ((n >> 16) & 255) * j)) +
                     hex2(Math.min(255, ((n >> 8) & 255) * j)) +
                     hex2(Math.min(255, (n & 255) * j));
      });
      return (meshCache[dkey] = { v: s2.v, f: s2.f, c: cc });
    }
    var key = kind + shape;
    if (meshCache[key]) return meshCache[key];
    var s = icosphere();
    var salt = 0x51ed27 + shape * 7717;
    var sq = 0.62 + unit(hash3(salt, 9, 9, 9)) * 0.35;      // flattening
    var v = s.v.map(function (p, i) {
      var h = hash3(salt, i, 0, 0);
      var k = 0.78 + unit(h) * 0.38;
      return [p[0] * k, p[1] * k * sq, p[2] * k * (0.85 + unit2(h) * 0.25)];
    });
    var base = ROCK_BASE[kind];
    var c = s.f.map(function (f, i) {
      var h = hash3(salt, i, 1, 0);
      var j = 0.82 + unit(h) * 0.3;
      if (kind === 'metal' && unit2(h) < 0.08) j = 1.9;     // a fresh, bright face
      return '#' + hex2(Math.min(255, base[0] * j)) + hex2(Math.min(255, base[1] * j)) +
                   hex2(Math.min(255, base[2] * j));
    });
    return (meshCache[key] = { v: v, f: s.f, c: c });
  }

  /* Which mesh colouring a field member gets: the field's composition sets
   * the odds, the rock's own hash rolls them. */
  function memberKind(field, rock) {
    var u = unit(hash3(field.seed, rock.shape, 7, Math.floor(rock.spin * 1e6)));
    if (u < field.metal) return 'metal';
    if (u < field.metal + field.ice * (1 - field.metal)) return 'ice';
    return 'stone';
  }

  /* ---- the entry point ---------------------------------------------------- */

  function build(sys, base) {
    buildRings(sys, base);
    buildBelts(sys, base);
  }

  /* HOW A ROCK IS TURNED at time t: a slow tumble about a hashed axis, with
   * periods of one to fifteen minutes - enough to read as a loose rock,
   * never enough to look like a top. Here rather than in main.js (where it
   * started) because the mining beam needs the same answer: a crater has to
   * be carved where the beam hit in the ROCK's own frame, or it would stay
   * pointing at the ship while the rock turned under it. */
  function rockBasis(rock, t) {
    var u = rock.spin;
    var ax = V.norm({ x: Math.sin(u * 37.1), y: Math.cos(u * 53.7), z: Math.sin(u * 91.3) + 0.2 });
    var ang = u * TAU + t * (0.0007 + 0.0098 * ((u * 7.13) % 1));
    ang = ang % TAU;
    var ref = Math.abs(ax.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    var r0 = V.norm(V.cross(ref, ax)), u0 = V.cross(ax, r0);
    return {
      right: V.rotateAroundAxis(r0, ax, ang),
      up: V.rotateAroundAxis(u0, ax, ang),
      fwd: ax
    };
  }

  var Rings = {
    rockBasis: rockBasis,
    AU: AU,
    CHUNK_DR: CHUNK_DR,
    CHUNK_S: CHUNK_S,
    ROCK_SHAPES: ROCK_SHAPES,
    build: build,
    ringFrame: ringFrame,
    ringDensity: ringDensity,
    rocheIce: rocheIce,
    ringChunksNear: ringChunksNear,
    fieldCenter: fieldCenter,
    fieldMember: fieldMember,
    fieldsNear: fieldsNear,
    hillFrame: hillFrame,
    rockMesh: rockMesh,
    memberKind: memberKind,
    vhash: vhash,
    mix32: mix32,
    isGiant: isGiant
  };

  global.Rings = Rings;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rings;
})(typeof window !== 'undefined' ? window : globalThis);
