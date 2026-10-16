/* mining.js - rung 3 of the mining ladder: taking it yourself.
 *
 * claude/mining-and-survey.md, "3. Hand-mining and skimming". The answer to
 * the passive-income trap: flying is playing, so flying pays.
 *
 * ROCK. A mining laser on a hardpoint is aimed at a rock - a belt field's
 * member or a ring chunk, the same hashed objects rings.js already places
 * and the renderer already draws - and held on it. The beam's work piles up
 * on that rock; when it is enough, a chunk comes free at the spot you were
 * cutting and drifts off it. The chunk is a SHARD (sim.js spawnDebris's
 * kind), so the cargo scoop takes it with no new code: sim.js has said
 * since wreckage was built that a mining laser would be its second source.
 *
 *   What the chunk is, is the survey's answer: the belt's or ring's
 *   deposits, leaned by what the rock looks like (a dark metal rock is
 *   mostly metal, a pale one mostly ice). A poor belt gives a lot of slag -
 *   chunks with nothing in them worth the hold - which is what grade means
 *   when you are the one holding the laser. Every tonne cut is written to
 *   G.extracted, the ledger the survey reads.
 *
 * GAS. A skimmer intake (utility slot) collects from a GIANT's air as you
 * fly through it: mass flow = density x speed x capture area, the same
 * density and relative speed the drag and heat code already use. Deeper
 * air is denser and richer in hydrogen, and hotter, and the heat is the
 * price - an ice giant can be skimmed under a heat shield, a gas giant's
 * orbital speed makes it a short plunge whatever you fit.
 */
(function (global) {
  'use strict';

  var V = global.V;
  function Rg() { return global.Rings; }
  function Sim() { return global.Sim; }
  function Sv() { return global.Survey; }

  var DAY = 86400;
  var CUT_PER_CHUNK = 90;        // beam work (gun dmg units) to free one chunk - ~11 s held
  var CHUNK_LIFE = 1800;         // s - a chunk waits half an hour for the scoop
  var ROCK_LOOK = 6;             // km - how far round the beam to look for rock
  var SKIM_AREA = 1500;          // m^2 - the intake's charged capture field
  var SKIM_MIN_GRADE = 0.3;      // a giant this poor in hydrogen is not worth the dive

  /* ---- what rock is near ------------------------------------------------- */

  /* Every rock within `range` of `point`: belt-field members and ring
   * chunks, each tagged with the survey key its tonnes are booked under.
   * The same enumeration drawRingsAndRock does for the picture, so what you
   * can see is what you can cut. */
  function rocksNear(G, sys, point, t, range) {
    var R = Rg(), S = Sim(), out = [];
    if (!R || !S || !sys) return out;
    var here = (G.here && G.here.id) || 'sys';
    (sys.belts || []).forEach(function (belt) {
      (belt.fields || []).forEach(function (fd) {
        var c = R.fieldCenter(fd, sys, t);
        if (V.dist(c.pos, point) > fd.radius + range) return;
        var hf = R.hillFrame(c);
        for (var m = 0; m < fd.count; m++) {
          var rk = R.fieldMember(fd, m, sys, t, c, hf);
          if (V.dist(rk.pos, point) > range + rk.size) continue;
          rk.kind = R.memberKind(fd, rk);
          rk.key = here + ':' + belt.id;
          rk.source = belt;
          out.push(rk);
        }
      });
    });
    (sys.bodies || []).forEach(function (p) {
      if (!p.ring) return;
      var ps = S.bodyState(p, sys, t);
      if (V.dist(point, ps.pos) > p.ring.outer + range) return;
      R.ringChunksNear(p, ps, point, range, t, 400).forEach(function (ck) {
        ck.kind = (R.mix32(ck.shape * 977 + Math.floor(ck.spin * 1e6)) / 4294967296) < p.ring.ice
                  ? 'ice' : 'stone';
        ck.key = here + ':' + p.id + ':ring';
        ck.source = { kind: 'ring', planet: p, name: p.name + ' ring' };
        out.push(ck);
      });
    });
    return out;
  }

  /* The first rock a ray from `from` along unit `dir` meets within `range`,
   * and where. Rocks are spheres of their own size. */
  function rayRock(rocks, from, dir, range) {
    var best = null, bestT = Infinity;
    for (var i = 0; i < rocks.length; i++) {
      var r = rocks[i];
      var oc = V.sub(from, r.pos);
      var b = V.dot(oc, dir), c = V.dot(oc, oc) - r.size * r.size;
      var disc = b * b - c;
      if (disc < 0) continue;
      var sq = Math.sqrt(disc);
      var tt = -b - sq;
      if (tt < 0) tt = -b + sq;           // starting inside a rock: the far wall
      if (tt < 0 || tt > range || tt >= bestT) continue;
      bestT = tt; best = r;
    }
    if (!best) return null;
    var at = V.addScaled(from, dir, bestT);
    return { rock: best, dist: bestT, at: at, normal: V.norm(V.sub(at, best.pos)) };
  }

  /* ---- what a chunk is -------------------------------------------------- */

  /* How much each commodity leans toward each look of rock. */
  var LEAN = {
    metal: { rare: 3, ores: 2, fissile: 1, water: 0.1 },
    stone: { ores: 2, rare: 0.5, fissile: 0.6, water: 0.3 },
    ice:   { water: 4, ores: 0.2, rare: 0.1, fissile: 0.1 }
  };

  function hash01(s) { return Sv() ? Sv().hash01(s) : 0.5; }

  /* The k-th chunk cut from a rock: a pure function of the rock, the count,
   * and the deposits as they stand. { cid|null, tonnes }. */
  function chunkOf(G, rock, k) {
    var S = Sv();
    var rows = S ? S.remaining(G, rock.key, S.deposits(rock.source, null)) : [];
    var lean = LEAN[rock.kind] || LEAN.stone;
    var tot = 0, rich = 0, w = [];
    rows.forEach(function (r) {
      if (r.cid === 'hydrogen' || !(r.tonnes > 0)) return;
      var x = r.grade * (lean[r.cid] || 0.2);
      /* Richness counts a commodity fully only where the rock's look suits
       * it: a stony rock in an icy belt is mostly slag, not mostly ice. */
      w.push({ cid: r.cid, x: x }); tot += x;
      rich = Math.max(rich, r.grade * Math.min(1, lean[r.cid] || 0.2));
    });
    var tag = rock.id + ':cut:' + k;
    var size = 1.5 + 3.5 * hash01(tag + ':t');
    /* Slag first: the poorer the ground, the more of what you cut is rock. */
    if (!tot || hash01(tag + ':slag') > 0.25 + 0.75 * Math.min(1, rich)) {
      return { cid: null, tonnes: Math.round(size * 10) / 10 };
    }
    var u = hash01(tag + ':cid') * tot, pick = w[w.length - 1].cid;
    for (var i = 0; i < w.length; i++) { u -= w[i].x; if (u <= 0) { pick = w[i].cid; break; } }
    return { cid: pick, tonnes: Math.round(size * (0.6 + 0.6 * rich) * 10) / 10 };
  }

  /* ---- the laser -------------------------------------------------------- */

  /* Called by Combat.fireOne for a mining gun. Looks down the nose for rock
   * nearer than `shipHitDist`; if there is some, the shot is spent on it and
   * the beam's end is returned. Null when the shot found no rock. */
  function cut(sys, G, t, gun, shipHitDist, hooks) {
    var s = G.ship;
    var range = Math.min(gun.range, shipHitDist);
    var rocks = rocksNear(G, sys, V.addScaled(s.pos, s.fwd, range / 2), t, range / 2 + ROCK_LOOK);
    var hit = rayRock(rocks, s.pos, V.norm(s.fwd), range);
    if (!hit) return null;
    var cutting = G.cutting;
    if (!cutting || cutting.id !== hit.rock.id) {
      cutting = G.cutting = { id: hit.rock.id, work: 0, k: 0, shown: 0 };
    }
    G.cutting.at = t;
    cutting.work += gun.dmg || 1;
    var frac = Math.min(1, cutting.work / CUT_PER_CHUNK);
    G.cutProgress = { frac: frac, rock: hit.rock, t: t };
    if (cutting.work >= CUT_PER_CHUNK) {
      cutting.work -= CUT_PER_CHUNK;
      var ch = chunkOf(G, hit.rock, (G.cutCount = G.cutCount || {})[hit.rock.id] || 0);
      G.cutCount[hit.rock.id] = (G.cutCount[hit.rock.id] || 0) + 1;
      var shard = spawnChunk(sys, hit, ch, t);
      if (ch.cid) {
        G.extracted = G.extracted || {};
        var ex = G.extracted[hit.rock.key] = G.extracted[hit.rock.key] || {};
        ex[ch.cid] = (ex[ch.cid] || 0) + ch.tonnes;
      }
      var name = ch.cid ? ((Sv() && Sv().NAMES[ch.cid]) || ch.cid).toLowerCase() : null;
      if (hooks && hooks.say) {
        hooks.say(ch.cid ? 'Chunk free - ' + ch.tonnes.toFixed(1) + ' t of ' + name + ', scoop it'
                         : 'Chunk free - slag, nothing in it worth the hold', 3);
      }
      if (hooks && hooks.sound) hooks.sound('scoop');
      return { end: hit.at, rock: hit.rock, chunk: ch, shard: shard };
    }
    return { end: hit.at, rock: hit.rock, chunk: null };
  }

  /* The chunk comes off the face you were cutting and drifts clear of it,
   * slowly - slowly enough for the scoop. */
  function spawnChunk(sys, hit, ch, t) {
    var S = Sim();
    if (!sys.canisters) sys.canisters = [];
    var tag = hit.rock.id + ':' + t.toFixed(3);
    var kick = 0.0015 + 0.002 * hash01(tag + 'k');           // 1.5-3.5 m/s off the face
    var dom = S ? S.dominantBody(hit.at, sys, t) : null;
    var c = {
      kind: 'debris',
      ore: true,
      id: 'ore' + (sys.canisterSeq = (sys.canisterSeq || 0) + 1),
      name: ch.cid ? 'Ore chunk' : 'Slag',
      cid: ch.cid, tonnes: ch.cid ? ch.tonnes : 0,
      rockKind: hit.rock.kind, shape: Math.floor(hash01(tag + 's') * 6),
      shard: 0,
      lengthKm: 0.0018 + 0.0012 * Math.cbrt(ch.tonnes / 3),
      pos: V.addScaled(hit.at, hit.normal, 0.004),
      vel: V.addScaled(hit.rock.vel, hit.normal, kick),
      spinAxis: V.norm({ x: hash01(tag + 'x') - 0.5, y: hash01(tag + 'y') - 0.5, z: hash01(tag + 'z') - 0.5 + 1e-3 }),
      spinRate: 0.2 + 0.6 * hash01(tag + 'r'),
      phase: 0,
      born: t, expires: t + CHUNK_LIFE, life: CHUNK_LIFE,
      domId: dom ? dom.id : null,
      radius: 0.003
    };
    sys.canisters.push(c);
    return c;
  }

  /* ---- skimming ---------------------------------------------------------- */

  function isGiant(b) { return b && (b.type === 'gasGiant' || b.type === 'iceGiant'); }

  /* One step of skimming. Returns tonnes taken this step (0 when not in a
   * giant's air, not fitted, or the hold is full). */
  function skimStep(G, sys, t, dt, hasIntake) {
    var S = Sim(), s = G.ship;
    G.skimming = null;
    if (!hasIntake || !S || !s || s.docked || s.landed || !(dt > 0)) return 0;
    var atmo = S.atmosphereContext(s.pos, sys, t);
    if (!atmo || !isGiant(atmo.body)) return 0;
    var body = atmo.body, at = body.atmosphere;
    var alt = V.dist(s.pos, atmo.pos) - body.radius;
    var rho = S.airDensity(body, alt);
    if (!(rho > 0)) return 0;
    var v = V.len(V.sub(s.vel, atmo.vel));                   // km/s
    var key = ((G.here && G.here.id) || 'sys') + ':' + body.id;
    var h2 = Sv() ? Sv().deposits(body, sys).filter(function (r) { return r.cid === 'hydrogen'; })[0] : null;
    var grade = h2 ? h2.grade : 0.6;
    /* Richer with depth: the top of the air is haze and ammonia, the
     * hydrogen fraction climbs toward the grade the survey reports. */
    var depth = Math.max(0, at.top - alt);
    var frac = grade * (0.55 + 0.45 * (1 - Math.exp(-depth / (4 * at.scaleHeight))));
    var tonnes = rho * v * 1000 * SKIM_AREA * dt / 1000 * frac;  // kg/m^3 * m/s * m^2 * s -> kg -> t
    var room = s.cargoCap - S.cargoMass(s);
    G.skimming = { body: body, rho: rho, v: v, frac: frac, rate: tonnes / dt, full: room <= 0.01,
                   poor: grade < SKIM_MIN_GRADE };
    if (room <= 0.01 || grade < SKIM_MIN_GRADE) return 0;
    tonnes = Math.min(tonnes, room);
    s.cargo.hydrogen = (s.cargo.hydrogen || 0) + tonnes;
    S.refreshShip(s);
    G.extracted = G.extracted || {};
    var ex = G.extracted[key] = G.extracted[key] || {};
    ex.hydrogen = (ex.hydrogen || 0) + tonnes;
    G.skimTotal = (G.skimTotal || 0) + tonnes;
    return tonnes;
  }

  var Mining = {
    CUT_PER_CHUNK: CUT_PER_CHUNK, CHUNK_LIFE: CHUNK_LIFE, SKIM_AREA: SKIM_AREA, SKIM_MIN_GRADE: SKIM_MIN_GRADE,
    rocksNear: rocksNear, rayRock: rayRock, chunkOf: chunkOf, cut: cut, spawnChunk: spawnChunk,
    skimStep: skimStep, isGiant: isGiant
  };
  global.Mining = Mining;
  if (typeof module !== 'undefined' && module.exports) module.exports = Mining;
})(typeof window !== 'undefined' ? window : globalThis);
