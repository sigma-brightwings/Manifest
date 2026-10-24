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
  var SKIM_AREA = 1500;          // m^2 - the ram scoop's mouth, square on to the flow
  /* A RAM SCOOP (Astra, 2026-10-18): "skimming hydrogen means going into the
   * atmosphere of a planet face first. The scoop collects gas as a ram
   * scoop." The mouth is on the nose, so what it swallows is the flow
   * through its face: density x speed x area x cos(the angle between the
   * nose and the oncoming air). Side-on or tail-first, nothing goes in. */
  var SKIM_ALIGN_MIN = 0.17;     // cos 80 deg - beyond this the mouth sees no flow
  var SKIM_MIN_GRADE = 0.3;      // a giant this poor in hydrogen is not worth the dive
  var STAR_GRADE = 0.9;          // a star's corona: hydrogen, near enough all of it (2026-10-24)

  /* ---- pieces and wear (2026-10-18) ---------------------------------------
   * Astra: the beam "can go continuously before 2t of mined material is
   * ejected from the asteroid. This should not only deplete the store of
   * minerals but it should also remove real pieces from that asteroid, one
   * by one, over time." Decided with her: REAL MASS, VISIBLE CRATERS. A rock
   * weighs what its size and material say; every piece cut comes off that
   * mass, and is carved out of the rock's mesh where the beam was. A 5 m
   * ice chunk (~470 t) is gone in a long session; a 20 m stone one carries
   * scars for years. Every tonne still books into G.extracted too, so the
   * survey's store depletes exactly as before. */
  var PIECE_T = 2;                       // t, one piece off the beam
  var BEAM_T_PER_UNIT = 0.03;            // t of stone per unit of beam work: ~0.25 t/s
  var HARDNESS = { ice: 1.5, stone: 1, metal: 0.6 };   // how fast it cuts
  var DENSITY = { ice: 0.92, stone: 2.7, metal: 5.0 };  // t per cubic metre
  var ROCK_FILL = 0.62;                  // the potato's volume against its bounding sphere
  var CRATER_MAX = 24;                   // craters kept per rock; nearer ones merge

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
          if (isGone(G, rk)) continue;
          rk.kind = R.memberKind(fd, rk);
          rk.key = here + ':' + belt.id;
          rk.source = belt;
          worn(G, rk);
          out.push(rk);
        }
      });
    });
    (sys.bodies || []).forEach(function (p) {
      if (!p.ring) return;
      var ps = S.bodyState(p, sys, t);
      if (V.dist(point, ps.pos) > p.ring.outer + range) return;
      R.ringChunksNear(p, ps, point, range, t, 400).forEach(function (ck) {
        if (isGone(G, ck)) return;
        ck.kind = (R.mix32(ck.shape * 977 + Math.floor(ck.spin * 1e6)) / 4294967296) < p.ring.ice
                  ? 'ice' : 'stone';
        ck.key = here + ':' + p.id + ':ring';
        ck.source = { kind: 'ring', planet: p, name: p.name + ' ring' };
        worn(G, ck);
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
  function chunkOf(G, rock, k, pieceT) {
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
    var size = pieceT || (1.5 + 3.5 * hash01(tag + ':t'));
    /* Slag first: the poorer the ground, the more of what you cut is rock. */
    if (!tot || hash01(tag + ':slag') > 0.25 + 0.75 * Math.min(1, rich)) {
      return { cid: null, tonnes: Math.round(size * 10) / 10 };
    }
    var u = hash01(tag + ':cid') * tot, pick = w[w.length - 1].cid;
    for (var i = 0; i < w.length; i++) { u -= w[i].x; if (u <= 0) { pick = w[i].cid; break; } }
    /* A piece of known mass is that much ROCK; what is worth the hold is
     * the share of it that is ore, half to all of it with richness. */
    if (pieceT) return { cid: pick, tonnes: Math.round(pieceT * (0.5 + 0.5 * Math.min(1, rich)) * 10) / 10 };
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
    var rock = hit.rock;
    var cutting = G.cutting;
    if (!cutting || cutting.id !== rock.id) {
      cutting = G.cutting = { id: rock.id, tonnes: 0, shown: 0 };
    }
    cutting.at = t;
    /* THE BEAM CUTS CONTINUOUSLY and the rock gives a piece every 2 t; the
     * CANNON (gun.pulseTonnes) knocks off what one pulse is worth. Ice cuts
     * fastest and metal slowest, by HARDNESS. */
    var piece = gun.piece || PIECE_T;
    var perShot = gun.pulseTonnes ? gun.pulseTonnes : (gun.dmg || 1) * BEAM_T_PER_UNIT;
    cutting.tonnes = (cutting.tonnes || 0) + perShot * (HARDNESS[rock.kind] || 1);
    var left = rockMassLeft(G, rock);
    if (left < piece) piece = Math.max(0.1, left);          // the last of it
    G.cutProgress = { frac: Math.min(1, cutting.tonnes / piece), rock: rock, t: t,
                      tonnes: cutting.tonnes, piece: piece };
    if (cutting.tonnes < piece - 1e-9) return { end: hit.at, rock: rock, chunk: null };
    cutting.tonnes -= piece;
    G.cutCount = G.cutCount || {};
    var ck = rockKey(G, rock);
    var ch = chunkOf(G, rock, G.cutCount[ck] || 0, piece);
    G.cutCount[ck] = (G.cutCount[ck] || 0) + 1;
    var shard = spawnChunk(sys, hit, ch, t);
    if (ch.cid) {
      G.extracted = G.extracted || {};
      var ex = G.extracted[rock.key] = G.extracted[rock.key] || {};
      ex[ch.cid] = (ex[ch.cid] || 0) + ch.tonnes;
    }
    /* AND THE ROCK IS THAT MUCH LESS. */
    var gone = carve(G, rock, hit.normal, t, piece);
    if (gone) G.cutting = null;
    var name = ch.cid ? ((Sv() && Sv().NAMES[ch.cid]) || ch.cid).toLowerCase() : null;
    if (hooks && hooks.say) {
      hooks.say((gone ? 'The last of it - the rock is gone. ' : '') +
                (ch.cid ? 'Piece free - ' + ch.tonnes.toFixed(1) + ' t of ' + name + ', scoop it'
                        : 'Piece free - slag, nothing in it worth the hold'), 3);
    }
    if (hooks && hooks.sound) hooks.sound('scoop');
    return { end: hit.at, rock: rock, chunk: ch, shard: shard, gone: gone };
  }

  /* ---- what is left of a rock --------------------------------------------- */

  /* Rock state is keyed by SYSTEM and rock id. Ring-rock ids are built from
   * planet ids ('b7:r12:40') and those repeat at every star, so a bare id
   * shattered in one system was also hiding its namesake in every other -
   * a bug found 2026-10-18 while adding wear. Bare keys from older saves are
   * still honoured, so nothing a torpedo already took comes back. */
  function rockKey(G, rock) {
    return ((G && G.here && G.here.id) || 'sys') + '|' + (rock && rock.id !== undefined ? rock.id : rock);
  }
  function isGone(G, rock) {
    var s = G && G.shattered;
    if (!s) return false;
    var id = rock && rock.id !== undefined ? rock.id : rock;
    return !!(s[rockKey(G, rock)] || s[id]);
  }

  /* What a rock weighed before anyone cut it: its material's density times
   * the potato's volume (ROCK_FILL of its bounding sphere). size is km. */
  function rockMass0(rock) {
    var r = (rock.size0 || rock.size) * 1000;
    return (DENSITY[rock.kind] || DENSITY.stone) * ROCK_FILL * (4 / 3) * Math.PI * r * r * r;
  }
  function wearOf(G, rock) { return G && G.rockWear ? G.rockWear[rockKey(G, rock)] : null; }
  function rockMassLeft(G, rock) {
    var w = wearOf(G, rock);
    return rockMass0(rock) - (w ? w.m : 0);
  }
  /* Uniform shrink by the mass that is gone - cube root, mass goes as
   * volume. The craters show WHERE it went; this keeps a small rock that has
   * lost half of itself from being drawn at its old size. */
  function wearScale(G, rock) {
    var w = wearOf(G, rock);
    if (!w || !(w.m > 0)) return 1;
    return Math.cbrt(Math.max(0.02, 1 - w.m / rockMass0(rock)));
  }
  /* Give a rock its worn size (size0 keeps the original for the mass). */
  function worn(G, rock) {
    if (rock.size0 === undefined) rock.size0 = rock.size;
    var k = wearScale(G, rock);
    rock.size = rock.size0 * k;
    rock.wear = k < 1 || !!wearOf(G, rock);
    return rock;
  }

  /* A crater is [x, y, z, volume m^3] in the rock's OWN frame (Rings.
   * rockBasis at the moment of the cut), so it turns with the rock. Its
   * mouth and depth come from its volume as a bowl: radius a with
   * (pi/4) a^3 = V, depth a/2, both against the rock's radius. */
  function craterShape(c, Rm) {
    var a = Math.cbrt(4 * c[3] / Math.PI);
    return { alpha: Math.min(1.2, a / Rm), depth: Math.min(0.5 * a, 0.55 * Rm) / Rm };
  }

  /* Take `tonnes` off a rock where a beam (or a blast) met it. Returns true
   * when that was the last of it. */
  function carve(G, rock, worldNormal, t, tonnes) {
    var R = Rg();
    G.rockWear = G.rockWear || {};
    var key = rockKey(G, rock);
    var w = G.rockWear[key] || (G.rockWear[key] = { m: 0, c: [], v: 0 });
    var Rm = (rock.size0 || rock.size) * 1000;
    if (R && R.rockBasis && worldNormal) {
      var b = R.rockBasis(rock, t);
      var d = [V.dot(worldNormal, b.right), V.dot(worldNormal, b.up), V.dot(worldNormal, b.fwd)];
      var dl = Math.hypot(d[0], d[1], d[2]) || 1;
      d = [d[0] / dl, d[1] / dl, d[2] / dl];
      var vol = tonnes / (DENSITY[rock.kind] || DENSITY.stone);
      /* Inside an existing crater's mouth: deepen and widen that one. */
      var into = null;
      for (var i = 0; i < w.c.length; i++) {
        var c = w.c[i], sh = craterShape(c, Rm);
        if (c[0] * d[0] + c[1] * d[1] + c[2] * d[2] > Math.cos(Math.max(0.02, sh.alpha * 0.8))) { into = c; break; }
      }
      if (into) into[3] += vol;
      else w.c.push([+d[0].toFixed(4), +d[1].toFixed(4), +d[2].toFixed(4), vol]);
      /* Too many: the smallest folds into its nearest neighbour. */
      while (w.c.length > CRATER_MAX) {
        var si = 0;
        for (var j = 1; j < w.c.length; j++) if (w.c[j][3] < w.c[si][3]) si = j;
        var sm = w.c.splice(si, 1)[0], best = 0, bd = -2;
        for (var k = 0; k < w.c.length; k++) {
          var dd = w.c[k][0] * sm[0] + w.c[k][1] * sm[1] + w.c[k][2] * sm[2];
          if (dd > bd) { bd = dd; best = k; }
        }
        w.c[best][3] += sm[3];
      }
    }
    w.m += tonnes;
    w.v++;
    if (rockMass0(rock) - w.m < PIECE_T * 0.25) {
      G.shattered = G.shattered || {};
      G.shattered[key] = t;
      return true;
    }
    return false;
  }

  /* The rock's own mesh, carved. The close-up shape with every crater
   * pressed in (a bowl: deepest at the centre, nothing at the rim) and the
   * cut faces a fresh, paler colour - new rock that has not seen the sun.
   * Built per rock, only for rocks that have been cut, and rebuilt only when
   * another piece comes off; the old one's video memory is handed back. */
  var WORN = {};
  function wornMesh(G, rock) {
    var R = Rg();
    var w = wearOf(G, rock);
    if (!R || !w) return null;
    var key = rockKey(G, rock);
    var have = WORN[key];
    if (have && have.v === w.v && have.kind === rock.kind) return have.mesh;
    var base = R.rockMesh(rock.shape, rock.kind, 2);
    var Rm = (rock.size0 || rock.size) * 1000;
    var shapes = w.c.map(function (c) { return craterShape(c, Rm); });
    var carved = [];
    var v = base.v.map(function (p, vi) {
      var l = Math.hypot(p[0], p[1], p[2]) || 1;
      var nx = p[0] / l, ny = p[1] / l, nz = p[2] / l, f = 1;
      for (var i = 0; i < w.c.length; i++) {
        var c = w.c[i], sh = shapes[i];
        var ca = Math.max(-1, Math.min(1, nx * c[0] + ny * c[1] + nz * c[2]));
        var th = Math.acos(ca);
        if (th >= sh.alpha) continue;
        var x = th / sh.alpha;
        f = Math.min(f, 1 - sh.depth * (1 - x * x));
      }
      if (f < 0.999) carved[vi] = true;
      return [p[0] * f, p[1] * f, p[2] * f];
    });
    var col = base.c.map(function (cc, fi) {
      var fc = base.f[fi];
      if (!(carved[fc[0]] || carved[fc[1]] || carved[fc[2]])) return cc;
      var n = parseInt(cc.slice(1), 16);
      function ch(x) { var s = Math.min(255, Math.round(x * 1.22 + 14)).toString(16); return s.length < 2 ? '0' + s : s; }
      return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
    });
    var mesh = { v: v, f: base.f, c: col };
    if (have && have.mesh && global.GLWorld && global.GLWorld.releaseMesh) global.GLWorld.releaseMesh(have.mesh);
    WORN[key] = { v: w.v, kind: rock.kind, mesh: mesh };
    return mesh;
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
    /* A giant's air, or (2026-10-24) a star's corona: every system has a
     * star, so every system has fuel. */
    var atmo = S.atmosphereContext(s.pos, sys, t);
    var star = null;
    if (!atmo || !isGiant(atmo.body)) {
      atmo = S.coronaContext ? S.coronaContext(s.pos, sys, t) : null;
      if (!atmo) return 0;
      star = atmo.body;
    }
    var body = atmo.body, at = body.atmosphere;
    var alt = V.dist(s.pos, atmo.pos) - body.radius;
    var rho = star ? S.coronaDensity(star, atmo.r) : S.airDensity(body, alt);
    if (!(rho > 0)) return 0;
    var rel = V.sub(s.vel, atmo.vel), v = V.len(rel);       // km/s, through the air
    /* Nose into the oncoming air. The air comes at you along -rel, so the
     * nose wants to point along +rel (where you are going through it). */
    var airDir = v > 1e-9 ? V.scale(rel, 1 / v) : null;
    var align = (airDir && s.fwd) ? V.dot(V.norm(s.fwd), airDir) : 0;
    var face = align > SKIM_ALIGN_MIN ? align : 0;
    var key = ((G.here && G.here.id) || 'sys') + ':' + body.id;
    var grade, frac, top;
    if (star) {
      /* A star's plasma is most of it hydrogen, top to bottom. */
      grade = STAR_GRADE; frac = STAR_GRADE; top = (S.CORONA_TOP - 1) * body.radius;
    } else {
      var h2 = Sv() ? Sv().deposits(body, sys).filter(function (r) { return r.cid === 'hydrogen'; })[0] : null;
      grade = h2 ? h2.grade : 0.6;
      /* Richer with depth: the top of the air is haze and ammonia, the
       * hydrogen fraction climbs toward the grade the survey reports. */
      var depth = Math.max(0, at.top - alt);
      frac = grade * (0.55 + 0.45 * (1 - Math.exp(-depth / (4 * at.scaleHeight))));
      top = at.top;
    }
    var tonnes = rho * v * 1000 * SKIM_AREA * face * dt / 1000 * frac;  // kg/m^3 * m/s * m^2 * s -> kg -> t
    /* THE TANKS FIRST (2026-10-24): skimmed hydrogen is reaction mass, so it
     * tops up the jump tank before anything goes in the hold - that is what
     * lets a ship keep moving through systems with no port. */
    var tankRoom = Math.max(0, (s.fuelCap || 0) - (s.fuel || 0));
    var room = s.cargoCap - S.cargoMass(s);
    /* Where the heat shield stops coping at this speed, for the panel. */
    var shed = (S.BASE_HEAT_SHED || 18) + (s.heatShed || 0);
    var line = star ? S.coronaLineAlt(star, shed) : (S.heatLineAlt ? S.heatLineAlt(body, v, shed) : 0);
    G.skimming = { body: body, star: !!star, rho: rho, v: v, frac: frac, rate: tonnes / dt,
                   full: room <= 0.01 && tankRoom <= 0.01, tankFull: tankRoom <= 0.01,
                   poor: grade < SKIM_MIN_GRADE, align: align, face: face, airDir: airDir,
                   alt: alt, lineAlt: line, top: top };
    if ((room <= 0.01 && tankRoom <= 0.01) || grade < SKIM_MIN_GRADE) return 0;
    var toTank = Math.min(tonnes, tankRoom);
    s.fuel = (s.fuel || 0) + toTank;
    var toHold = Math.min(tonnes - toTank, Math.max(0, room));
    tonnes = toTank + toHold;
    G.skimToTank = (G.skimToTank || 0) + toTank;
    if (toHold > 0) s.cargo.hydrogen = (s.cargo.hydrogen || 0) + toHold;
    S.refreshShip(s);
    G.extracted = G.extracted || {};
    var ex = G.extracted[key] = G.extracted[key] || {};
    ex.hydrogen = (ex.hydrogen || 0) + tonnes;
    G.skimTotal = (G.skimTotal || 0) + tonnes;
    return tonnes;
  }

  /* ---- rock torpedoes ------------------------------------------------------
   * Astra, 2026-10-16: "small nuclear bombs, dumb slow missile, breaks 6-14
   * chunks off an asteroid, and is only available thru the mining guild and
   * syndicate." Then: it is also a way to sabotage a station if you can get
   * close enough; you take one OUT to the belt and never bring one back
   * (scanned inbound with one aboard is an offence); and the Guild refunds
   * half of one you destroyed for safety - not one that paid for itself.
   *
   * DUMB. It leaves the rail at TORP_SPEED down the nose and coasts under
   * the dominant body's gravity like a shard does; no seeker, no lock. It
   * arms TORP_ARM from where it was fired, and goes off on the first rock,
   * ship or station it comes near - or at the end of its life, which is how
   * you safe one: fire it at nothing.
   *
   * Its path each frame is a SEGMENT tested against the rocks round it, so
   * a frame long enough to carry it past a boulder still finds the boulder.
   */
  var TORP_SPEED = 0.2;          // km/s off the rail
  var TORP_LIFE = 300;           // s - 60 km of flight, then it blows itself up
  var TORP_ARM = 0.5;            // km from launch before it will go off
  var TORP_SHIP_FUSE = 0.15;     // km - a hull this close sets it off
  var TORP_STATION_FUSE = 2.0;   // km - a station is a big thing to fly into
  var TORP_BLAST = 1.0;          // km - ships inside this are hurt
  var TORP_BLAST_DMG = 140;      // hull at the centre, falling to 0 at the edge
  var TORP_SHATTER = 0.03;       // km - a rock this small is gone entirely
  var TORP_CLEAR_OF_PORT = 50;   // km - the Guild logs a discharge this far out
  var SABOTAGE_DAYS = 20;        // per torpedo, a station's berths stay shut

  function launchTorpedo(sys, G, t, m, hooks) {
    var S = Sim(), s = G.ship;
    var dom = S ? S.dominantBody(s.pos, sys, t) : null;
    var tp = {
      torp: true, kind: m.id, guild: !m.grey, price: m.price,
      id: 'torp' + (sys.canisterSeq = (sys.canisterSeq || 0) + 1) + ':' + Math.round(t),
      pos: V.addScaled(s.pos, s.fwd, 0.06),
      vel: V.addScaled(s.vel, s.fwd, TORP_SPEED),
      from: V.clone(s.pos), born: t, dies: t + TORP_LIFE,
      domId: dom ? dom.id : null
    };
    (sys.missiles = sys.missiles || []).push(tp);
    if (hooks && hooks.say) hooks.say(m.name + ' away - arms at ' + Math.round(TORP_ARM * 1000) + ' m', 3);
    return tp;
  }

  function gravityAt(sys, body, pos, t) {
    var S = Sim();
    if (!body || !(body.mu > 0) || !S) return { x: 0, y: 0, z: 0 };
    var bp = S.bodyPosition(body, sys, t);
    var d = V.sub(bp, pos), r2 = V.dot(d, d);
    if (r2 < 1e-9) return { x: 0, y: 0, z: 0 };
    return V.scale(d, body.mu / (r2 * Math.sqrt(r2)));
  }

  /* Does a point moving at va from a come within r of one moving at vb from
   * b, at any moment in the next dt? Closest approach of the relative path. */
  function passesWithin(a, va, b, vb, dt, r) {
    var rel = V.sub(a, b), rv = V.sub(va, vb);
    var vv = V.dot(rv, rv);
    var s = vv > 1e-18 ? Math.max(0, Math.min(dt, -V.dot(rel, rv) / vv)) : 0;
    return V.len(V.addScaled(rel, rv, s)) < r;
  }

  function nearestPort(sys, pos, t) {
    var S = Sim(), best = null, bd = Infinity;
    (sys.ports || []).forEach(function (p) {
      var st = S.bodyState(p, sys, t);
      var d = V.dist(st.pos, pos);
      if (d < bd) { bd = d; best = { port: p, pos: st.pos, vel: st.vel, dist: d }; }
    });
    return best;
  }

  /* One frame of every torpedo in flight. Torpedoes ride in sys.missiles so
   * the renderer draws them with the seekers; Combat.updateMissiles leaves
   * them to this. */
  function updateTorpedoes(sys, G, t, dt, hooks) {
    var list = sys.missiles;
    if (!list || !list.length || !(dt > 0)) return;
    var keep = [];
    for (var i = 0; i < list.length; i++) {
      var tp = list[i];
      if (!tp.torp) { keep.push(tp); continue; }
      var body = tp.domId && sys.byId ? sys.byId[tp.domId] : null;
      var p0 = tp.pos;
      /* EVERYTHING IN THE TARGET'S FRAME. Out here a rock, a ship and the
       * torpedo are all doing some thirteen kilometres a second round the
       * star; what decides a hit is how the torpedo moves RELATIVE to each,
       * over this frame, with both read at the same instant. */
      var armed = t >= tp.born + TORP_ARM / TORP_SPEED;
      var boom = null;
      if (armed) {
        /* Rock first: the nearest face down the relative path. */
        var reach = TORP_SPEED * 2 * dt + 0.5;   // relative to the field it crawls
        var rocks = rocksNear(G, sys, p0, t, reach);
        var bestT = Infinity;
        for (var r = 0; r < rocks.length; r++) {
          var rk = rocks[r];
          var d = V.scale(V.sub(tp.vel, rk.vel), dt), len = V.len(d);
          if (len < 1e-12) continue;
          var h = rayRock([rk], p0, V.scale(d, 1 / len), len + 0.001);
          if (h && h.dist < bestT) { bestT = h.dist; boom = { at: h.at, rock: rk, normal: h.normal }; }
        }
        /* A ship or a station in the way sets it off just the same. */
        if (!boom) {
          var ships = Sim().shipsAll(sys, t);
          for (var k = 0; k < ships.length && !boom; k++) {
            if (passesWithin(p0, tp.vel, ships[k].pos, ships[k].vel, dt, TORP_SHIP_FUSE)) boom = { at: p0, ship: ships[k] };
          }
          if (!boom && !G.ship.docked && passesWithin(p0, tp.vel, G.ship.pos, G.ship.vel, dt, TORP_SHIP_FUSE)) {
            boom = { at: p0, player: true };
          }
          var np = nearestPort(sys, p0, t);
          if (!boom && np && passesWithin(p0, tp.vel, np.pos, np.vel, dt, TORP_STATION_FUSE)) boom = { at: p0, port: np.port };
        }
      }
      tp.vel = V.add(tp.vel, V.scale(gravityAt(sys, body, p0, t), dt));
      var p1 = V.add(p0, V.scale(tp.vel, dt));
      if (!boom && t + dt >= tp.dies) boom = { at: p1, spent: true };
      if (boom) { detonate(sys, G, t, tp, boom, hooks); continue; }
      tp.pos = p1;
      keep.push(tp);
    }
    sys.missiles = keep;
  }

  /* The bang, and everything it does. */
  function detonate(sys, G, t, tp, boom, hooks) {
    var Cb = global.Combat, Eco = global.Economy;
    (G.explosions = G.explosions || []).push({
      pos: V.clone(boom.at), size: 3.5,
      at: (typeof performance !== 'undefined' ? performance.now() : 0)
    });
    if (hooks && hooks.sound) hooks.sound('explosion');
    var value = 0, tonnes = 0, chunks = 0, notes = [];

    if (boom.rock) {
      var rock = boom.rock;
      var n = 6 + Math.floor(hash01(tp.id + ':n') * 9);           // 6 .. 14
      G.cutCount = G.cutCount || {};
      var rkey = rockKey(G, rock), thrown = 0;
      for (var c = 0; c < n; c++) {
        var k = G.cutCount[rkey] || 0;
        G.cutCount[rkey] = k + 1;
        /* Each chunk is a piece of known mass, 1.5-5 t of rock, and the rock
         * is that much less (carve, below) - the same rule as the beam. */
        var pieceT = Math.round((1.5 + 3.5 * hash01(rock.id + ':cut:' + k + ':t')) * 10) / 10;
        thrown += pieceT;
        var ch = chunkOf(G, rock, k, pieceT);
        /* Thrown, not peeled: a hemisphere off the blast face, 10-40 m/s. */
        var tag = tp.id + ':c' + c;
        var off = V.norm({ x: hash01(tag + 'x') - 0.5, y: hash01(tag + 'y') - 0.5, z: hash01(tag + 'z') - 0.5 });
        if (V.dot(off, boom.normal) < 0) off = V.scale(off, -1);
        var nrm = V.norm(V.add(boom.normal, off));
        var shard = spawnChunk(sys, { rock: rock, at: boom.at, normal: nrm }, ch, t + c * 1e-3);
        shard.vel = V.addScaled(rock.vel, nrm, 0.010 + 0.030 * hash01(tag + 'v'));
        if (ch.cid) {
          G.extracted = G.extracted || {};
          var ex = G.extracted[rock.key] = G.extracted[rock.key] || {};
          ex[ch.cid] = (ex[ch.cid] || 0) + ch.tonnes;
          tonnes += ch.tonnes;
          value += ch.tonnes * ((Eco && Eco.BY_ID[ch.cid] && Eco.BY_ID[ch.cid].base) || 0);
        }
        chunks++;
      }
      var blownOut = carve(G, rock, boom.normal, t, Math.min(thrown, rockMassLeft(G, rock)));
      if (blownOut || rock.size < TORP_SHATTER) {
        G.shattered = G.shattered || {};
        G.shattered[rockKey(G, rock)] = t;
        notes.push('the rock is gone');
      }
    }

    /* The blast reaches whatever is near, the pilot who fired it included. */
    if (Cb && Cb.blastAt) Cb.blastAt(sys, G, t, boom.at, TORP_BLAST, TORP_BLAST_DMG, hooks);

    /* A STATION is sabotage: its berths shut for weeks, and its owners
     * know exactly what came through their window. */
    var np = nearestPort(sys, boom.at, t);
    if (np && np.dist < TORP_STATION_FUSE * 1.5) {
      sabotage(sys, G, t, np.port, hooks);
      notes.push(np.port.name + ' damaged');
    }

    /* The Guild's log: a serial going off clear of every station. Half back
     * if it did not pay for itself - which is what safing one means. */
    if (tp.guild && (!np || np.dist > TORP_CLEAR_OF_PORT)) {
      if (value < tp.price) {
        var back = Math.round(tp.price / 2);
        G.torpRefund = (G.torpRefund || 0) + back;
        notes.push(back + ' cr refundable at any Guild desk');
      } else {
        notes.push('no refund - it paid for itself');
      }
    }
    G.lastTorpedo = { chunks: chunks, tonnes: tonnes, value: Math.round(value), at: t };
    if (hooks && hooks.say) {
      var head = boom.rock ? 'Torpedo on rock - ' + chunks + ' chunks thrown, ' + tonnes.toFixed(1) + ' t worth having'
               : boom.port ? 'Torpedo on ' + boom.port.name
               : boom.commanded ? 'Torpedo detonated on command'
               : boom.spent ? 'Torpedo spent - self-destructed'
               : 'Torpedo detonated';
      hooks.say(head + (notes.length ? ' - ' + notes.join(', ') : ''), 7);
    }
  }

  /* Station damage, closed form: shut until a date that each further hit
   * pushes out, owned by whoever did it. */
  function sabotage(sys, G, t, port, hooks) {
    G.sabotage = G.sabotage || {};
    var key = ((G.here && G.here.id) || 'sys') + ':' + port.id;
    var prev = G.sabotage[key];
    var from = prev && prev.until > t ? prev.until : t;
    G.sabotage[key] = { until: Math.min(from + SABOTAGE_DAYS * DAY, t + 90 * DAY), port: port.id,
                        name: port.name, faction: port.faction || 'civil', t: t };
    var Cb = global.Combat;
    if (Cb && Cb.reportSabotage) Cb.reportSabotage(sys, G, t, port, hooks);
    if (global.Missions && global.Missions.onSabotage) global.Missions.onSabotage(G, sys, port, t, hooks);
  }

  function sabotaged(G, port, t) {
    if (!G || !G.sabotage || !port) return null;
    var s = G.sabotage[((G.here && G.here.id) || 'sys') + ':' + port.id];
    return s && t < s.until ? s : null;
  }

  /* The Guild desk pays out what the log owes. */
  function claimRefund(G) {
    var owed = Math.round(G.torpRefund || 0);
    if (!owed) return 0;
    G.ship.credits += owed;
    G.torpRefund = 0;
    return owed;
  }

  /* ---- after launch: the command link --------------------------------------
   * Astra: "we also need a way to disarm active torps." A torpedo in flight
   * listens to the ship that fired it, out to TORP_LINK. Two commands, both
   * from the ordnance panel:
   *
   *   DISARM - the charge is safed and the motor dies. It coasts on as an
   *     inert canister on ordinary physics (a day before it is lost), and a
   *     scoop with rack room takes it back into the rack. Aboard again it is
   *     a torpedo aboard - the same customs rules apply.
   *   DETONATE - it goes off where it is, now. Clear of every station and
   *     short of anything worth the charge, that is a safing shot, and the
   *     Guild's half refund applies like any other. */
  var TORP_LINK = 200;            // km - the command link's reach

  function torpedoesInFlight(sys) {
    return (sys && sys.missiles || []).filter(function (m) { return m.torp; });
  }

  function linked(G, tp) {
    return V.dist(G.ship.pos, tp.pos) <= TORP_LINK;
  }

  function takeFromFlight(sys, id) {
    var list = sys.missiles || [], tp = null;
    for (var i = 0; i < list.length; i++) if (list[i].torp && list[i].id === id) { tp = list[i]; break; }
    if (tp) sys.missiles = list.filter(function (m) { return m !== tp; });
    return tp;
  }

  function disarmTorpedo(sys, G, t, id, hooks) {
    var tp = torpedoesInFlight(sys).filter(function (m) { return m.id === id; })[0];
    if (!tp) return { ok: false, why: 'no such torpedo in flight' };
    if (!linked(G, tp)) {
      if (hooks && hooks.say) hooks.say('Torpedo out of command range (' + TORP_LINK + ' km)', 4);
      return { ok: false, why: 'out of range' };
    }
    takeFromFlight(sys, id);
    var S = Sim();
    if (!sys.canisters) sys.canisters = [];
    var can = {
      kind: 'canister', torpInert: true, torpKind: tp.kind,
      id: 'inert' + (sys.canisterSeq = (sys.canisterSeq || 0) + 1),
      name: 'Disarmed torpedo',
      pos: V.clone(tp.pos), vel: V.clone(tp.vel),
      born: t, expires: t + ((S && S.CANISTER_LIFE) || 86400),
      spin: 0.2, radius: 0.003,
      armed: false                  // not caught again until it has got clear of you
    };
    sys.canisters.push(can);
    if (hooks && hooks.say) hooks.say('Torpedo disarmed - inert, drifting. Match speed and scoop it to re-rack.', 5);
    if (hooks && hooks.sound) hooks.sound('click');
    return { ok: true, canister: can };
  }

  function detonateTorpedo(sys, G, t, id, hooks) {
    var tp = torpedoesInFlight(sys).filter(function (m) { return m.id === id; })[0];
    if (!tp) return { ok: false, why: 'no such torpedo in flight' };
    if (!linked(G, tp)) {
      if (hooks && hooks.say) hooks.say('Torpedo out of command range (' + TORP_LINK + ' km)', 4);
      return { ok: false, why: 'out of range' };
    }
    takeFromFlight(sys, id);
    detonate(sys, G, t, tp, { at: V.clone(tp.pos), spent: true, commanded: true }, hooks);
    return { ok: true };
  }

  /* The scoop's half of disarming: an inert torpedo back into its rack, if
   * there is room in it. Returns true when it went aboard. */
  function recoverInert(G, c, hooks) {
    var Cb = global.Combat, s = G.ship;
    if (!c || !c.torpInert || !Cb) return false;
    var m = Cb.MISSILES[c.torpKind];
    if (!m) return false;
    s.racks = s.racks || {};
    var rk = s.racks[c.torpKind];
    var racksUsed = Object.keys(s.racks).filter(function (k) { return s.racks[k] && s.racks[k].n > 0; }).length;
    if (rk ? rk.n >= m.rack : racksUsed >= Cb.rackSlots(s)) {
      if (hooks && hooks.say) hooks.say('No rack room for the torpedo - left drifting', 3);
      return false;
    }
    if (!rk) rk = s.racks[c.torpKind] = { id: c.torpKind, n: 0, batch: null };
    rk.n += 1;
    Cb.syncRacks(s);
    if (hooks && hooks.say) hooks.say(m.name + ' recovered - back in the rack (' + rk.n + ')', 4);
    return true;
  }

  /* Shattered rocks stay gone: filtered out of what the laser and the
   * torpedo can find. (The renderer filters the same set.) */
  function isShattered(G, id) { return isGone(G, id); }

  var Mining = {
    CUT_PER_CHUNK: CUT_PER_CHUNK, CHUNK_LIFE: CHUNK_LIFE, SKIM_AREA: SKIM_AREA, SKIM_MIN_GRADE: SKIM_MIN_GRADE,
    TORP_SPEED: TORP_SPEED, TORP_LIFE: TORP_LIFE, TORP_ARM: TORP_ARM, TORP_BLAST: TORP_BLAST,
    TORP_SHATTER: TORP_SHATTER, SABOTAGE_DAYS: SABOTAGE_DAYS, TORP_CLEAR_OF_PORT: TORP_CLEAR_OF_PORT,
    rocksNear: rocksNear, rayRock: rayRock, chunkOf: chunkOf, cut: cut, spawnChunk: spawnChunk,
    skimStep: skimStep, isGiant: isGiant,
    launchTorpedo: launchTorpedo, updateTorpedoes: updateTorpedoes, detonate: detonate,
    sabotage: sabotage, sabotaged: sabotaged, claimRefund: claimRefund, isShattered: isShattered,
    /* pieces and wear (2026-10-18) */
    PIECE_T: PIECE_T, DENSITY: DENSITY, HARDNESS: HARDNESS, BEAM_T_PER_UNIT: BEAM_T_PER_UNIT, LEAN: LEAN,
    isGone: isGone, rockKey: rockKey, rockMass0: rockMass0, rockMassLeft: rockMassLeft,
    wearScale: wearScale, worn: worn, carve: carve, wornMesh: wornMesh, craterShape: craterShape,
    nearestPort: nearestPort,
    TORP_LINK: TORP_LINK, torpedoesInFlight: torpedoesInFlight,
    disarmTorpedo: disarmTorpedo, detonateTorpedo: detonateTorpedo, recoverInert: recoverInert
  };
  global.Mining = Mining;
  if (typeof module !== 'undefined' && module.exports) module.exports = Mining;
})(typeof window !== 'undefined' ? window : globalThis);
