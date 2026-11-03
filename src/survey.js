/* survey.js — what is under the ground, and how much of it you have mapped.
 *
 * Rung 1 of the mining ladder (claude/mining-and-survey.md). Astra,
 * 2026-10-15: "Perhaps we could set up some form of like scan planet for
 * minerals and mining." Agreed the same night: deposits are seed data;
 * coverage is your ground track; a survey is dated; surveys sell.
 *
 * DEPOSITS ARE SEED DATA, AND THEY DRAW NOTHING. Every grade below is a
 * hash of the star, the body and the commodity, so the same galaxy always
 * has the same ore under the same mountain and no other number in the
 * generator moves to make room for it. Then the world's EXISTING industry
 * is read back: a mining head on a world means that world is rich in what
 * the head sells, and a refinery on a giant means its hydrogen is worth
 * skimming. A survey therefore explains why a port is where it is, instead
 * of contradicting it.
 *
 * COVERAGE IS YOUR GROUND TRACK. A world's surface is a grid of latitude
 * bands by longitude sectors in its own spin frame; the survey instrument
 * sees a swath around the point beneath you, and the world turns under
 * you. An equatorial orbit maps a band. A polar orbit, given enough
 * revolutions, maps everything. Nothing is invented: the cells you have
 * flown over are the cells you know.
 *
 * Under time warp a frame can be several orbits long, so the step does not
 * mark the point it lands on - it walks the arc the orbit swept, rotated
 * back from where the ship is now about its own angular momentum, with the
 * world's spin taken off each sample. Warping through a survey maps what
 * flying it would have.
 */
(function (global) {
  'use strict';

  /* ---- the commodities a survey reports ------------------------------- */
  var CIDS = ['ores', 'rare', 'fissile', 'water', 'hydrogen'];

  /* WHICH INSTRUMENT READS WHICH CLASS (Astra, 2026-10-15): "a grade 1
   * scanner tells you where low grade minerals are, and grade 2 will tell
   * you where fissiles are, and a grade 3 tells you where precious metals
   * are." Cumulative - grade 3 reads all three - and physically honest:
   * bulk ore and ice show in reflected light, fissiles announce themselves
   * in gamma, and trace metals hide in ordinary rock until the deepest
   * instrument resolves them. Grade 3 is also the one that gives tonnes.
   *
   * A record keeps one coverage per class: cells/cov (every grade),
   * cellsF/covF (grade 2 and up), cells2/cov2 (grade 3, the array; the name
   * is older than the middle grade). */
  var CLASS = { ores: 1, water: 1, hydrogen: 1, fissile: 2, rare: 3 };
  var TOP = 3;
  function classOf(cid) { return CLASS[cid] || 1; }
  var NAMES = { ores: 'Metal ores', rare: 'Rare metals', fissile: 'Fissiles',
                water: 'Water ice', hydrogen: 'Hydrogen' };

  /* Per world type: [chance it is there at all, low grade, high grade]. */
  var TABLE = {
    molten:   { ores: [1, 0.40, 0.90], rare: [0.60, 0.10, 0.50], fissile: [0.50, 0.10, 0.40] },
    rocky:    { ores: [1, 0.30, 0.80], rare: [0.50, 0.05, 0.35], fissile: [0.35, 0.05, 0.30], water: [0.20, 0.00, 0.10] },
    desert:   { ores: [1, 0.20, 0.60], rare: [0.30, 0.02, 0.20], fissile: [0.25, 0.02, 0.20], water: [0.6, 0.02, 0.15] },
    terran:   { ores: [1, 0.15, 0.50], rare: [0.30, 0.02, 0.15], fissile: [0.20, 0.02, 0.15], water: [1, 0.30, 0.90] },
    ocean:    { ores: [1, 0.10, 0.40], rare: [0.25, 0.02, 0.12], fissile: [0.15, 0.02, 0.12], water: [1, 0.60, 0.95] },
    tundra:   { ores: [1, 0.15, 0.50], rare: [0.30, 0.02, 0.15], fissile: [0.20, 0.02, 0.15], water: [1, 0.40, 0.80] },
    iceball:  { ores: [0.8, 0.05, 0.30], rare: [0.20, 0.00, 0.10], water: [1, 0.60, 0.95] },
    iceGiant: { hydrogen: [1, 0.35, 0.70], water: [1, 0.30, 0.70] },
    gasGiant: { hydrogen: [1, 0.60, 0.95] },
    rockyMoon:{ ores: [1, 0.25, 0.75], rare: [0.45, 0.05, 0.35], fissile: [0.30, 0.05, 0.30], water: [0.15, 0.00, 0.10] },
    iceMoon:  { ores: [0.7, 0.05, 0.25], rare: [0.15, 0.00, 0.10], water: [1, 0.60, 0.95] }
  };

  /* FNV-1a, to [0, 1). No rng is touched. */
  function hash01(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }

  function typeKey(body) {
    if (body.kind === 'moon') return /ice/i.test(body.typeName || '') ? 'iceMoon' : 'rockyMoon';
    return TABLE[body.type] ? body.type : 'rocky';
  }

  function portsOn(body, sys) {
    var out = [];
    (sys.bodies || []).forEach(function (b) {
      if (b.kind !== 'station') return;
      var host = b.parentBody ? (b.parentBody.id || b.parentBody) : (b.orbit && b.orbit.parent);
      if (host === body.id) out.push(b);
    });
    return out;
  }
  function roleOf(port) {
    var m = port.market;
    return m && (m.role || m.roleId) || null;
  }

  /* Tonnage scale for a body, in megatonnes per unit grade: what a mining
   * concern could plausibly take out of its accessible crust, not the mass
   * of the planet. Grows with surface area, so a moon is a small find. */
  function tonnageScale(body) {
    var rk = Math.max(50, body.radius || 1000) / 1000;
    /* About a gigatonne for a rich Earth-sized world: enough that a single
     * drone never dents it, small enough that a mining head working it for
     * decades shows on a fresh survey (G.extracted). */
    return 40 * rk * rk;
  }

  /* Deposits on a planet or moon. */
  function bodyDeposits(body, sys) {
    var key = typeKey(body), row = TABLE[key] || TABLE.rocky;
    var star = sys.star ? sys.star.id : (sys.root && sys.root.id) || '';
    var tag = (sys.seedTag || sys.name || star) + '|' + body.id + '|';
    var g = {};
    CIDS.forEach(function (cid) {
      var r = row[cid];
      if (!r) return;
      if (hash01(tag + cid + ':p') >= r[0]) return;
      g[cid] = r[1] + (r[2] - r[1]) * hash01(tag + cid + ':g');
    });
    /* THE INDUSTRY ALREADY HERE agrees with the survey. */
    portsOn(body, sys).forEach(function (p) {
      var role = roleOf(p);
      if (role === 'mining') {
        var best = null, bp = -1;
        var rows = (p.market && p.market.rows) || {};
        ['ores', 'rare', 'fissile'].forEach(function (cid) {
          var prod = rows[cid] ? (rows[cid].prod || 0) : 0;
          if (prod > bp) { bp = prod; best = cid; }
        });
        best = best || 'ores';
        g[best] = Math.max(g[best] || 0, 0.7 + 0.25 * hash01(tag + 'mine'));
      }
      if (role === 'refinery' || p.plant === 'skimmer' || p.plant === 'refinery') {
        g.hydrogen = Math.max(g.hydrogen || 0, 0.8);
      }
    });
    var scale = tonnageScale(body);
    var giant = key === 'gasGiant' || key === 'iceGiant';
    return CIDS.filter(function (cid) { return g[cid] > 0.005; }).map(function (cid) {
      return { cid: cid, name: NAMES[cid], grade: g[cid],
               /* A giant's hydrogen is the atmosphere: no bottom to it. */
               tonnes: (giant && cid === 'hydrogen') ? Infinity : Math.round(g[cid] * scale * 1e6) };
    });
  }

  /* Deposits in a belt, from the composition the belt already carries. */
  function beltDeposits(belt) {
    var ice = belt.ice || 0, metal = belt.metal || 0;
    var n = (belt.fields && belt.fields.length) || 1;
    var scale = 60 * n;           // Mt per unit grade, the belt's fields together
    var tag = (belt.id || belt.name) + '|';
    var g = { ores: Math.max(0, (1 - ice) * (0.4 + 0.4 * hash01(tag + 'o'))),
              rare: Math.min(0.9, metal * (1.0 + 0.6 * hash01(tag + 'r'))),
              water: ice,
              fissile: hash01(tag + 'fp') < 0.25 ? 0.02 + 0.1 * hash01(tag + 'f') : 0 };
    return CIDS.filter(function (cid) { return g[cid] > 0.005; }).map(function (cid) {
      return { cid: cid, name: NAMES[cid], grade: g[cid], tonnes: Math.round(g[cid] * scale * 1e6) };
    });
  }

  /* Deposits in a planet's ring: ice, mostly; dark rock where it is old. */
  function ringDeposits(planet) {
    var R = planet.ring || {};
    var ice = typeof R.ice === 'number' ? R.ice : (R.rocky ? 0.25 : 0.85);
    var span = Math.max(0, (R.outer || 0) - (R.inner || 0)) / 1000;
    var scale = 200 * Math.max(1, span / 10);
    var out = [{ cid: 'water', name: NAMES.water, grade: ice, tonnes: Math.round(ice * scale * 1e6) }];
    if (ice < 0.9) out.push({ cid: 'ores', name: NAMES.ores, grade: (1 - ice) * 0.5,
                              tonnes: Math.round((1 - ice) * 0.5 * scale * 1e6) });
    return out;
  }

  /* What a survey target holds, pristine. Depletion by extraction is the
   * ledger G.extracted (filled by the later rungs) - see remaining(). */
  function deposits(target, sys) {
    if (!target) return [];
    if (target.kind === 'belt' || target.kind === 'trojan') return beltDeposits(target);
    if (target.kind === 'ring') return ringDeposits(target.planet);
    return bodyDeposits(target, sys);
  }

  /* ---- WHERE ON THE WORLD IT IS (2026-10-25) ------------------------------
   *
   * Astra: "planets should have mineral deposits which are location-based,
   * where you might find metals/precious metals in some ratio in one
   * place, water where there's water on the surface, fissiles show up with
   * the gamma spectrometer, and so on."
   *
   * A world's grade (bodyDeposits, above) is now its BEST ground, and the
   * ground map says where that is: one local grade per survey cell, per
   * commodity. Seed data like the rest - hashes of the star, the world and
   * the commodity, no rng - so the same ore is under the same mountain in
   * every game, and asking draws nothing.
   *
   *   METALS come in provinces: two to five ore bodies, each a patch of the
   *   world with its own centre, size and MIX - one is nearly all base
   *   metal, another carries a good share of precious metal with it. Ore
   *   and rare metals are read off the same provinces, so where you find
   *   one you find the other in that province's ratio. Ore bodies stand on
   *   land where the world has seas (a drone needs ground to stand on).
   *   A surface mining port sits on its world's first province: the mine
   *   is where the ore is.
   *   FISSILES are hotspots - one to three, small - which is why they want
   *   the gamma spectrometer: in reflected light they are ordinary rock.
   *   WATER is where the picture shows it: under the seas and in the ice
   *   caps you can see from orbit (Weather.terrainAt, the shader's own
   *   arithmetic), a little in the ground elsewhere. A molten world's sea
   *   is lava and counts for nothing. An ice world is ice all over. A
   *   tidally locked world's ice is its night side.
   *   HYDROGEN is a giant's air: the same everywhere.
   *
   * Every map's best cell is the world's grade, so nothing anywhere pays
   * more than the world did before; what changed is that most of a world
   * pays less, and you have to find the good ground. */
  var GROUND_CACHE = new WeakMap();
  var ORE_FLOOR = 0.12, RARE_FLOOR = 0.03, FISSILE_FLOOR = 0.02, DAMP_FLOOR = 0.08;

  function sphereDir(tag) {
    var z = 2 * hash01(tag + 'z') - 1, a = 2 * Math.PI * hash01(tag + 'a');
    var s = Math.sqrt(Math.max(0, 1 - z * z));
    return [s * Math.cos(a), s * Math.sin(a), z];
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function dirOfLatLon(lat, lon) {
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  }
  /* The survey cell a latitude/longitude falls in - the same lat/lon a pad
   * or a landing spot carries (sim.js surfaceOffset, landSpot). */
  function cellOfLatLon(lat, lon) {
    var la = Math.floor((lat + Math.PI / 2) / (Math.PI / LAT_BINS));
    la = Math.max(0, Math.min(LAT_BINS - 1, la));
    var l = lon % (2 * Math.PI); if (l < 0) l += 2 * Math.PI;
    var lo = Math.min(LON_BINS - 1, Math.floor(l / (2 * Math.PI / LON_BINS)));
    return la * LON_BINS + lo;
  }
  /* A world direction at time t, to its cell (the inverse of markAt). */
  function cellOfWorld(body, dirW, t) {
    var fr = spinFrame(body, t);
    var x = dot(dirW, fr.e1), y = dot(dirW, fr.e2), z = dot(dirW, fr.n);
    var c = Math.cos(-fr.turn), s = Math.sin(-fr.turn);
    var bx = x * c - y * s, by = x * s + y * c;
    var r = Math.sqrt(bx * bx + by * by + z * z) || 1;
    return cellOfLatLon(Math.asin(Math.max(-1, Math.min(1, z / r))), Math.atan2(by, bx));
  }
  /* A cell's centre as a body-fixed vector in world axes: the shader's
   * frame (Weather.bodyFixed), so the two agree on where a coastline is. */
  function cellBodyFixed(fr, i) {
    var cc = CELL_CENTRES[i];
    return { x: cc[0] * fr.e1.x + cc[1] * fr.e2.x + cc[2] * fr.n.x,
             y: cc[0] * fr.e1.y + cc[1] * fr.e2.y + cc[2] * fr.n.y,
             z: cc[0] * fr.e1.z + cc[1] * fr.e2.z + cc[2] * fr.n.z };
  }
  /* Seas and ice per cell, as the picture paints them (null: no picture to
   * ask, which is a giant, or a run without weather.js). */
  function terrainCells(body, sys) {
    var W = global.Weather;
    if (!W || !W.terrainAt) return null;
    var T = W.terrainOf(body);
    if (!(T.ocean > 0.001) && !(T.ice > 0.001) && !body.habitableBand) return null;
    var fr = spinFrame(body, 0);
    var sunB = null;
    if (body.habitableBand === 'terminator' && global.Sim && global.Sim.bodyPosition && sys && sys.root) {
      var Sim = global.Sim;
      var sp = Sim.bodyPosition(sys.root, sys, 0), bp = Sim.bodyPosition(body, sys, 0);
      var d = { x: sp.x - bp.x, y: sp.y - bp.y, z: sp.z - bp.z }, dl = len(d) || 1;
      sunB = W.bodyFixed(body, scale(d, 1 / dl), 0);
    }
    var sea = new Float32Array(NCELL), ice = new Float32Array(NCELL);
    for (var i = 0; i < NCELL; i++) {
      var g = W.terrainAt(body, cellBodyFixed(fr, i), sunB);
      sea[i] = g.lava ? 0 : g.sea;
      ice[i] = g.ice;
    }
    return { sea: sea, ice: ice, lava: !!T.lava };
  }
  /* A field of bumps, normalised so its best cell is 1, over a floor. */
  function bumps(list, floor) {
    var f = new Float32Array(NCELL), top = 0;
    for (var i = 0; i < NCELL; i++) {
      var cc = CELL_CENTRES[i], v = 0;
      for (var j = 0; j < list.length; j++) {
        var b = list[j];
        var ang = Math.acos(Math.max(-1, Math.min(1, dot3(cc, b.c))));
        v = Math.max(v, b.w * Math.exp(-(ang / b.r) * (ang / b.r)));
      }
      f[i] = v; if (v > top) top = v;
    }
    for (i = 0; i < NCELL; i++) f[i] = floor + (1 - floor) * (top > 0 ? f[i] / top : 0);
    return f;
  }

  function groundMap(body, sys) {
    if (!body || (body.kind !== 'planet' && body.kind !== 'moon')) return null;
    var star = sys.star ? sys.star.id : (sys.root && sys.root.id) || '';
    var tag = (sys.seedTag || sys.name || star) + '|' + body.id + '|';
    /* Cached on the body object itself, not by tag: body ids repeat from
     * system to system, and so, now and then, do star names. */
    var hit = GROUND_CACHE.get(body);
    if (hit && hit.sys === sys) return hit;
    var rows = bodyDeposits(body, sys), g = {};
    rows.forEach(function (r) { g[r.cid] = r.grade; });
    var key = typeKey(body);
    var terr = terrainCells(body, sys);
    var out = { tag: tag, sys: sys, world: g, grade: {}, sea: terr ? terr.sea : null, ice: terr ? terr.ice : null };

    /* METAL PROVINCES. Province 0 is the strongest. Each surface mining
     * port stands on one - on the middle of its cell, so the ground it
     * stands on is the province's best - and a port that sells rare metals
     * stands on a rich mix. Each carries its own rare-metal share. */
    var heads = portsOn(body, sys).filter(function (p) {
      return p.surface && roleOf(p) === 'mining' && typeof p.lat === 'number';
    }).map(function (p) {
      var rows2 = (p.market && p.market.rows) || {}, best = 'ores', bp = -1;
      ['ores', 'rare', 'fissile'].forEach(function (cid) {
        var prod = rows2[cid] ? (rows2[cid].prod || 0) : 0;
        if (prod > bp) { bp = prod; best = cid; }
      });
      var cc0 = CELL_CENTRES[cellOfLatLon(p.lat, p.lon)];
      return { c: [cc0[0], cc0[1], cc0[2]], cid: best };
    });
    var metalHeads = heads.filter(function (h) { return h.cid !== 'fissile'; });
    var nProv = Math.max(metalHeads.length + 1, 2 + Math.floor(hash01(tag + 'prov#') * 4));
    /* ORE STANDS ON DRY LAND WHERE THERE IS ANY (fixed 2026-11-03). Two ways
     * a world with land used to end up with its best ore offshore or under
     * a cap, both found when stars stage 2 made wet worlds common (282 of
     * 286 land worlds passed ground.test; the four were all one of these):
     *   - A mostly-ocean world, 5-22 dry cells of 288: twelve random tries
     *     at a dry spot all fall in the sea about as often as not, and the
     *     fallback was one more random spot, wet. Now the fallback is the
     *     dry cell nearest that spot — still seed data, still no draws, and
     *     only the provinces that used to miss move.
     *   - Every mine standing on ice or at a sea platform: the province is
     *     the mine (that is right, a mine is where the ore is), but then no
     *     province on land was at full strength. Now the first province
     *     that is not a mine's is, in that case only. */
    var dryCell = function (i) { return terr.sea[i] < 0.5 && terr.ice[i] < 0.5; };
    var landCells = [];
    if (terr && !terr.lava) for (var lc = 0; lc < NCELL; lc++) if (dryCell(lc)) landCells.push(lc);
    var headOnLand = !terr || terr.lava || metalHeads.some(function (h) {
      return dryCell(cellOfLatLon(Math.asin(h.c[2]), Math.atan2(h.c[1], h.c[0])));
    });
    var prov = [];
    for (var j = 0; j < nProv; j++) {
      var pt = tag + 'prov' + j + ':', c = null;
      if (j < metalHeads.length) c = metalHeads[j].c;
      for (var tries = 0; !c && tries < 12; tries++) {
        var cand = sphereDir(pt + tries);
        if (!terr || terr.lava) { c = cand; break; }
        var ci = cellOfLatLon(Math.asin(cand[2]), Math.atan2(cand[1], cand[0]));
        if (terr.sea[ci] < 0.5 && terr.ice[ci] < 0.5) c = cand;
      }
      if (!c) {
        c = sphereDir(pt + 'last');
        if (landCells.length) {
          var bestDot = -2, bestC = null;
          for (var lk = 0; lk < landCells.length; lk++) {
            var lcc = CELL_CENTRES[landCells[lk]], dd = dot3(lcc, c);
            if (dd > bestDot) { bestDot = dd; bestC = lcc; }
          }
          c = [bestC[0], bestC[1], bestC[2]];
        }
      }
      var share = hash01(pt + 'share');
      share = share * share;
      var isHead = j < metalHeads.length;
      if (isHead && metalHeads[j].cid === 'rare') share = Math.max(share, 0.8);
      var fullDry = !headOnLand && j === metalHeads.length && landCells.length > 0;
      prov.push({ c: c, r: 0.16 + 0.38 * hash01(pt + 'r'),
                  w: (j === 0 || isHead || fullDry) ? 1 : 0.45 + 0.5 * hash01(pt + 'w'),
                  share: share });
    }
    if (g.ores) {
      var of = bumps(prov, ORE_FLOOR);
      out.grade.ores = scaleBy(of, g.ores, terr, 0.75);
    }
    if (g.rare) {
      var rf = bumps(prov.map(function (p) { return { c: p.c, r: p.r * 0.8, w: p.w * (0.15 + 0.85 * p.share) }; }),
                     RARE_FLOOR);
      out.grade.rare = scaleBy(rf, g.rare, terr, 0.75);
    }
    out.provinces = prov.map(function (p) { return { lat: Math.asin(p.c[2]), lon: Math.atan2(p.c[1], p.c[0]),
                                                     r: p.r, share: p.share }; });
    /* FISSILE HOTSPOTS. */
    if (g.fissile) {
      var fisHeads = heads.filter(function (h) { return h.cid === 'fissile'; });
      var nHot = Math.max(fisHeads.length, 1 + Math.floor(hash01(tag + 'hot#') * 3)), hots = [];
      for (var k = 0; k < nHot; k++) {
        hots.push({ c: k < fisHeads.length ? fisHeads[k].c : sphereDir(tag + 'hot' + k + ':'),
                    r: 0.08 + 0.14 * hash01(tag + 'hot' + k + ':r'),
                    w: (k === 0 || k < fisHeads.length) ? 1 : 0.4 + 0.6 * hash01(tag + 'hot' + k + ':w') });
      }
      out.grade.fissile = scaleBy(bumps(hots, FISSILE_FLOOR), g.fissile, terr, 0.5);
    }
    /* WATER, where the picture has it. */
    if (g.water) {
      var wf = new Float32Array(NCELL), icy = key === 'iceball' || key === 'iceMoon';
      var damp = icy ? 0.6 : DAMP_FLOOR, any = 0;
      for (var i = 0; i < NCELL; i++) {
        var v = damp;
        if (terr) v = Math.max(v, terr.sea[i], terr.ice[i]);
        wf[i] = v; if (v > any) any = v;
      }
      /* No sea and no cap to be seen (a dry rock, a moon the shader does
       * not dress): the ice is buried, poleward, in patches. */
      if (!terr || any <= damp + 1e-6) {
        var buried = [];
        for (var q = 0; q < 3; q++) {
          var dq = sphereDir(tag + 'ice' + q + ':');
          var pole = hash01(tag + 'ice' + q + ':p') < 0.5 ? -1 : 1;
          dq[2] = pole * (0.6 + 0.4 * Math.abs(dq[2]));
          var dl3 = Math.sqrt(dot3(dq, dq)); dq = [dq[0] / dl3, dq[1] / dl3, dq[2] / dl3];
          buried.push({ c: dq, r: 0.25 + 0.3 * hash01(tag + 'ice' + q + ':r'), w: q === 0 ? 1 : 0.6 });
        }
        var bf = bumps(buried, damp);
        for (i = 0; i < NCELL; i++) wf[i] = Math.max(wf[i], bf[i]);
      }
      var wTop = 0;
      for (i = 0; i < NCELL; i++) if (wf[i] > wTop) wTop = wf[i];
      out.grade.water = new Float32Array(NCELL);
      for (i = 0; i < NCELL; i++) out.grade.water[i] = g.water * (wTop > 0 ? wf[i] / wTop : 0);
    }
    if (g.hydrogen) {
      out.grade.hydrogen = new Float32Array(NCELL);
      for (i = 0; i < NCELL; i++) out.grade.hydrogen[i] = g.hydrogen;
    }
    GROUND_CACHE.set(body, out);
    return out;
  }
  /* World grade times the local field. Under a sea the ore is still there
   * but harder to reach: `wet` of it is lost where the cell is drowned. */
  function scaleBy(f, grade, terr, wet) {
    var o = new Float32Array(NCELL);
    for (var i = 0; i < NCELL; i++) {
      var k = terr ? 1 - wet * terr.sea[i] : 1;
      o[i] = grade * f[i] * k;
    }
    return o;
  }
  /* The local grade of one commodity in one cell (0 where there is none). */
  function localGrade(body, sys, cid, cell) {
    var m = groundMap(body, sys);
    var a = m && m.grade[cid];
    return a ? a[cell] : 0;
  }
  /* Everything in one cell, richest first by value. */
  function groundAt(body, sys, cell) {
    var m = groundMap(body, sys);
    if (!m) return [];
    var Eco = global.Economy;
    return CIDS.filter(function (cid) { return m.grade[cid] && m.grade[cid][cell] > 0.005; }).map(function (cid) {
      var gr = m.grade[cid][cell];
      var base = Eco && Eco.BY_ID && Eco.BY_ID[cid] ? Eco.BY_ID[cid].base : 1;
      return { cid: cid, name: NAMES[cid], grade: gr, worth: gr * base };
    }).sort(function (a, b) { return b.worth - a.worth; });
  }
  /* Has the survey read this commodity on this cell? Its class's own
   * coverage, cell by cell. */
  function cellRead(rec, cid, cell) {
    if (!rec) return false;
    var cls = classOf(cid);
    var field = cls >= 3 ? 'cells2' : cls === 2 ? 'cellsF' : 'cells';
    var a = cellsOf(rec, field);
    return !!a[cell];
  }

  function remaining(G, key, rows) {
    var ex = (G && G.extracted && G.extracted[key]) || {};
    return rows.map(function (r) {
      var left = isFinite(r.tonnes) ? Math.max(0, r.tonnes - (ex[r.cid] || 0)) : r.tonnes;
      return { cid: r.cid, name: r.name, grade: r.grade, tonnes: left,
               depleted: isFinite(r.tonnes) && r.tonnes > 0 ? 1 - left / r.tonnes : 0 };
    });
  }

  /* ---- coverage -------------------------------------------------------- */
  var LAT_BINS = 12, LON_BINS = 24, NCELL = LAT_BINS * LON_BINS;
  var CELL_PAD = 0.09;            // rad, ~5 degrees - see markAt
  var LAT_W = [];
  (function () {
    var tot = 0;
    for (var i = 0; i < LAT_BINS; i++) {
      var a = -Math.PI / 2 + i * Math.PI / LAT_BINS, b = a + Math.PI / LAT_BINS;
      LAT_W[i] = (Math.sin(b) - Math.sin(a)) / LON_BINS;
      tot += LAT_W[i] * LON_BINS;
    }
    for (i = 0; i < LAT_BINS; i++) LAT_W[i] /= tot;
  })();
  var CELL_CENTRES = [];
  for (var li = 0; li < LAT_BINS; li++) {
    for (var lo = 0; lo < LON_BINS; lo++) {
      var la = -Math.PI / 2 + (li + 0.5) * Math.PI / LAT_BINS, ln = (lo + 0.5) * 2 * Math.PI / LON_BINS;
      CELL_CENTRES.push([Math.cos(la) * Math.cos(ln), Math.cos(la) * Math.sin(ln), Math.sin(la)]);
    }
  }

  /* `field` is 'cells' (everything mapped, by either instrument) or
   * 'cells2' (what the deep array itself mapped). Each has its own
   * unpacked cache beside it. */
  function cellsOf(rec, field) {
    field = field || 'cells';
    var cache = '_' + field;
    if (!rec[cache]) {
      var a = new Uint8Array(NCELL), s = rec[field] || '';
      for (var i = 0; i < NCELL; i++) {
        var nib = parseInt(s.charAt(i >> 2) || '0', 16);
        a[i] = (nib >> (i & 3)) & 1;
      }
      rec[cache] = a;
    }
    return rec[cache];
  }

  /* SCANNER AUDIT, 2026-10-17. Two things a record now keeps that it did
   * not, both because the old single numbers could be gamed:
   *   cov2  - the share mapped WITH THE DEEP ARRAY. `grade` used to be the
   *           best instrument ever used, so a world mapped 99% with the
   *           scanner and one cell with the array sold, and showed
   *           tonnages, as if the array had mapped all of it.
   *   tMean - the coverage-weighted date of the mapping. Value used to age
   *           off `t`, the last time any ground was gained, so one fresh
   *           cell made a year-old survey sell as new. `t` stays, for the
   *           page's "as of".
   * An older record has neither: its array share is all or nothing by its
   * grade, and its date is `t`, exactly what it was worth before. */
  function arrayCov(rec) {
    if (typeof rec.cov2 === 'number') return rec.cov2;
    return (rec.grade || 0) >= 2 ? (rec.cov || 0) : 0;
  }
  function meanT(rec) {
    return typeof rec.tMean === 'number' ? rec.tMean : rec.t;
  }
  /* Bring a record from before the split up to date, once: an array-grade
   * record counts everything it had as array-mapped, anything else as
   * scanner-mapped. Worth exactly what it was before. */
  /* Version 2 (2026-10-21) is the three-grade survey. Before it, grade 2
   * WAS the deep array, and the array read every class - so an old array
   * record becomes grade 3 with its fissile coverage equal to its array
   * coverage, worth exactly what it was. An old scanner record reads the
   * common class only, because that is what the scanner reads now. */
  function migrateRec(rec) {
    if (!rec || rec.v >= 2) return;
    var arr = (rec.grade || 0) >= 2;
    if (typeof rec.cov2 !== 'number') {
      rec.cells2 = arr ? (rec.cells || '') : '';
      if (rec.fields) rec.fields2 = arr ? Object.assign({}, rec.fields) : {};
      rec.cov2 = arr ? (rec.cov || 0) : 0;
      if (rec.soldCov2 === undefined) rec.soldCov2 = arr ? (rec.soldCov || 0) : 0;
    }
    rec.cellsF = rec.cells2 || '';
    if (rec.fields2) rec.fieldsF = Object.assign({}, rec.fields2);
    rec.covF = rec.cov2 || 0;
    rec.soldCovF = rec.soldCov2 || 0;
    if (arr) rec.grade = TOP;
    rec.v = 2;
    delete rec._cells2; delete rec._cellsF;
  }
  /* Coverage, and coverage already sold, of one class. A record from
   * before version 2 answers by the old rule: only the array read
   * fissiles. */
  function covClass(rec, cls) {
    if (!rec) return 0;
    if (cls >= 3) return arrayCov(rec);
    if (cls === 2) return typeof rec.covF === 'number' ? rec.covF : arrayCov(rec);
    return rec.cov || 0;
  }
  function soldClass(rec, cls) {
    if (!rec) return 0;
    if (cls >= 3) return soldArray(rec);
    if (cls === 2) return typeof rec.soldCovF === 'number' ? rec.soldCovF : soldArray(rec);
    return rec.soldCov || 0;
  }
  /* Has this survey read this commodity well enough to say anything? The
   * same tenth-of-the-ground floor the SURVEY page has always used. */
  function readable(rec, cid) { return covClass(rec, classOf(cid)) >= 0.1; }
  function unsoldAny(rec) {
    var u = 0;
    for (var c = 1; c <= TOP; c++) u = Math.max(u, covClass(rec, c) - soldClass(rec, c));
    return u;
  }
  /* Fold `gained` coverage taken at time t into the record's mean date. */
  function ageIn(rec, before, after, t) {
    var add = Math.max(0, after - before);
    if (!add) return;
    var prev = meanT(rec);
    rec.tMean = (prev === null || prev === undefined || before <= 0) ? t
              : (prev * before + t * add) / after;
  }
  function packCells(a) {
    var s = '';
    for (var i = 0; i < NCELL; i += 4) {
      s += ((a[i] | (a[i + 1] << 1) | (a[i + 2] << 2) | (a[i + 3] << 3)) & 15).toString(16);
    }
    return s;
  }
  function coverageOf(a) {
    var c = 0;
    for (var i = 0; i < NCELL; i++) if (a[i]) c += LAT_W[(i / LON_BINS) | 0];
    return Math.min(1, c);
  }
  /* The equatorial band a ring lies in: the cells within 15 degrees. */
  function bandCoverage(a) {
    var c = 0, t = 0;
    for (var i = 0; i < NCELL; i++) {
      var lat = (i / LON_BINS) | 0;
      if (lat < LAT_BINS / 2 - 1 || lat > LAT_BINS / 2) continue;
      t++; if (a[i]) c++;
    }
    return t ? c / t : 0;
  }

  /* The world's spin frame: n its axis (Rings.ringFrame is the one
   * derivation of it), e1/e2 the equator, and how far it has turned. */
  function spinFrame(body, t) {
    var Rg = global.Rings;
    var f = Rg && Rg.ringFrame ? Rg.ringFrame(body)
          : { e1: { x: 1, y: 0, z: 0 }, e2: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 } };
    var rot = body.rotation, turn = 0;
    if (rot && rot.period) turn = (rot.phase || 0) + 2 * Math.PI * t / rot.period;
    return { e1: f.e1, e2: f.e2, n: f.n, turn: turn };
  }

  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function scale(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  /* Rodrigues: v turned by angle th about unit axis k. */
  function rotate(v, k, th) {
    var c = Math.cos(th), s = Math.sin(th);
    return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
  }

  /* Mark the swath around one sub-ship direction (unit, world frame). */
  function markAt(cells, fr, dirW, tAt, rotPeriod, w) {
    var turn = fr.turn;
    if (rotPeriod) turn += 2 * Math.PI * (tAt - fr.t) / rotPeriod;
    var x = dot(dirW, fr.e1), y = dot(dirW, fr.e2), z = dot(dirW, fr.n);
    /* Into the body's own frame: undo the turn about the axis. */
    var c = Math.cos(-turn), s = Math.sin(-turn);
    var bx = x * c - y * s, by = x * s + y * c;
    /* A cell counts once the swath reaches into it, not only once it
     * covers the cell's centre: CELL_PAD is about a third of a cell's
     * width. Without it a low orbit's narrow swath (~9 degrees at 1.05 R)
     * could run diagonally between centres 15 degrees apart and leave a
     * chequerboard of holes it had plainly flown over. */
    var cw = Math.cos(w + CELL_PAD), any = 0;
    for (var i = 0; i < NCELL; i++) {
      if (cells[i]) continue;
      var cc = CELL_CENTRES[i];
      if (cc[0] * bx + cc[1] * by + cc[2] * z >= cw) { cells[i] = 1; any++; }
    }
    return any;
  }

  /* The instrument's grade. 0: none. 1: survey scanner (ores, ice,
   * hydrogen). 2: gamma spectrometer (+ fissiles). 3: deep survey array
   * (+ rare metals, and tonnes). */
  function level(ship) {
    var C = global.Combat;
    return C && C.surveyLevel ? C.surveyLevel(ship) : 0;
  }

  /* RANGE: within three radii of a world's centre is "in orbit about it"
   * for surveying. The swath is half the angle to the horizon - wide from
   * high up, narrow down low - and never more than about 35 degrees. */
  var RANGE_R = 3.0;
  function swathAt(R, rad) {
    var horizon = Math.acos(Math.max(-1, Math.min(1, R / Math.max(rad, R * 1.0001))));
    return Math.max(0.035, Math.min(0.6, horizon * 0.5));
  }

  function recordFor(G, sys, key, name, kind) {
    G.surveys = G.surveys || {};
    var rec = G.surveys[key];
    if (!rec) {
      rec = G.surveys[key] = { key: key, star: (G.here && G.here.id) || null, name: name, kind: kind,
                               cells: '', cov: 0, t: null, grade: 0, soldCov: 0,
                               cells2: '', cov2: 0, soldCov2: 0,
                               cellsF: '', covF: 0, soldCovF: 0, v: 2 };
    }
    return rec;
  }
  function keyOf(G, id) { return ((G.here && G.here.id) || 'sys') + ':' + id; }

  /* One frame of surveying. Returns a list of messages (milestones). */
  function step(G, sys, t, dt) {
    var msgs = [];
    var lvl = level(G.ship);
    if (!lvl || !sys || !G.ship || G.ship.docked || G.ship.landed) { G._surveyPrev = null; return msgs; }
    var Sim = global.Sim, V = global.V;
    if (!Sim || !V) return msgs;
    var ship = G.ship;
    /* The world you are in orbit about: the nearest planet or moon within
     * RANGE_R of its own radius. */
    var best = null, bd = Infinity;
    for (var i = 0; i < sys.bodies.length; i++) {
      var b = sys.bodies[i];
      if (b.kind !== 'planet' && b.kind !== 'moon') continue;
      var bp = Sim.bodyPosition(b, sys, t);
      var d = V.dist(bp, ship.pos);
      if (d < b.radius * RANGE_R && d / b.radius < bd) { bd = d / b.radius; best = { b: b, pos: bp }; }
    }
    G._surveyNow = null;
    if (best) {
      var body = best.b, rec = recordFor(G, sys, keyOf(G, body.id), body.name, 'world');
      G._surveyNow = rec.key;
      migrateRec(rec);
      var cells = cellsOf(rec), before = rec.cov;
      var cellsF = lvl >= 2 ? cellsOf(rec, 'cellsF') : null, gainedF = 0;
      var cells2 = lvl >= 3 ? cellsOf(rec, 'cells2') : null, gained2 = 0;
      var bs = Sim.bodyState(body, sys, t);
      var rel = V.sub(ship.pos, bs.pos), vrel = V.sub(ship.vel, bs.vel);
      var r = len(rel), h = cross(rel, vrel), hl = len(h);
      var fr = spinFrame(body, t); fr.t = t;
      var period = body.rotation && body.rotation.period;
      var w = swathAt(body.radius, r);
      var dir = scale(rel, 1 / r);
      var gained = markAt(cells, fr, dir, t, period, w);
      if (cellsF) gainedF += markAt(cellsF, fr, dir, t, period, w);
      if (cells2) gained2 += markAt(cells2, fr, dir, t, period, w);
      /* THE ARC SWEPT THIS FRAME, walked back from here. */
      if (hl > 1e-12 && dt > 0) {
        var omega = hl / (r * r), sweep = omega * dt;
        var k = scale(h, 1 / hl), stepA = w * 0.8;
        var n = Math.min(4000, Math.ceil(sweep / stepA));
        for (var s2 = 1; s2 <= n; s2++) {
          var back = Math.min(sweep, s2 * stepA);
          var dBack = rotate(dir, k, -back), tBack = t - back / omega;
          gained += markAt(cells, fr, dBack, tBack, period, w);
          if (cellsF) gainedF += markAt(cellsF, fr, dBack, tBack, period, w);
          if (cells2) gained2 += markAt(cells2, fr, dBack, tBack, period, w);
        }
      }
      if (gainedF) {
        rec.cellsF = packCells(cellsF);
        rec.covF = coverageOf(cellsF);
      }
      if (gained2) {
        rec.cells2 = packCells(cells2);
        rec.cov2 = coverageOf(cells2);
      }
      /* Re-flying mapped ground with a better instrument gains nothing in
       * the common class, but it is still a better survey. */
      if (gainedF || gained2) rec.grade = Math.max(rec.grade || 0, lvl);
      if (gained) {
        rec.cells = packCells(cells);
        rec.cov = coverageOf(cells);
        ageIn(rec, before - (rec.soldCov || 0), rec.cov - (rec.soldCov || 0), t);
        rec.t = t;
        rec.grade = Math.max(rec.grade || 0, lvl);
        [0.25, 0.5, 0.75, 0.95].forEach(function (m) {
          if (before < m && rec.cov >= m) msgs.push('SURVEY  ' + body.name + ' — ' + Math.round(m * 100) + '% mapped');
        });
        /* A ring lies in its planet's equator: an orbit that maps the
         * equatorial band maps the ring. */
      }
      if (gained || gainedF || gained2) {
        if (body.ring) {
          var rr = recordFor(G, sys, keyOf(G, body.id + ':ring'), body.name + ' ring', 'ring');
          migrateRec(rr);
          var rb = rr.cov;
          rr.cov = Math.max(rr.cov, bandCoverage(cells));
          if (cellsF) rr.covF = Math.max(rr.covF || 0, bandCoverage(cellsF));
          if (cells2) rr.cov2 = Math.max(rr.cov2, bandCoverage(cells2));
          if (cellsF || cells2) rr.grade = Math.max(rr.grade || 0, lvl);
          if (rr.cov > rb) {
            ageIn(rr, rb - (rr.soldCov || 0), rr.cov - (rr.soldCov || 0), t);
            rr.t = t; rr.grade = Math.max(rr.grade || 0, lvl);
          }
          if (rb < 0.95 && rr.cov >= 0.95) msgs.push('SURVEY  ' + body.name + ' ring — mapped');
        }
      }
    }
    /* BELTS: field by field, by flying through them. */
    var Rg = global.Rings;
    (sys.belts || []).forEach(function (belt) {
      if (!belt.fields || !belt.fields.length || !Rg || !Rg.fieldCenter) return;
      var brec = null;
      for (var f = 0; f < belt.fields.length; f++) {
        var fld = belt.fields[f];
        var c = Rg.fieldCenter(fld, sys, t);
        if (!c || V.dist(c.pos, ship.pos) > (fld.radius || 50) * 1.5) continue;
        brec = brec || recordFor(G, sys, keyOf(G, belt.id), belt.name, 'belt');
        brec.fields = brec.fields || {};
        migrateRec(brec);
        brec.fieldsF = brec.fieldsF || {};
        brec.fields2 = brec.fields2 || {};
        if (lvl >= 2 && !brec.fieldsF[f]) {
          brec.fieldsF[f] = 1;
          brec.covF = Object.keys(brec.fieldsF).length / belt.fields.length;
          brec.grade = Math.max(brec.grade || 0, lvl);
        }
        if (lvl >= 3 && !brec.fields2[f]) {
          brec.fields2[f] = 1;
          brec.cov2 = Object.keys(brec.fields2).length / belt.fields.length;
          brec.grade = Math.max(brec.grade || 0, lvl);
        }
        if (!brec.fields[f]) {
          brec.fields[f] = 1;
          var before2 = brec.cov;
          brec.cov = Object.keys(brec.fields).length / belt.fields.length;
          ageIn(brec, before2 - (brec.soldCov || 0), brec.cov - (brec.soldCov || 0), t);
          brec.t = t; brec.grade = Math.max(brec.grade || 0, lvl);
          msgs.push('SURVEY  ' + belt.name + ' — ' + (fld.name || 'field') + ' mapped (' +
                    Math.round(brec.cov * 100) + '% of the belt)');
          if (before2 < 1 && brec.cov >= 1) msgs.push('SURVEY  ' + belt.name + ' — complete');
        }
      }
    });
    return msgs;
  }

  /* ---- what a survey is worth --------------------------------------------
   * The Mining Guild buys what you have mapped that it has not already paid
   * you for, priced on what is there, how much of it you saw, how good the
   * instrument was, and how old the reading is. A year-old survey of a busy
   * world is worth less, and the guild says so. */
  /* Tuned in play, 2026-10-16: at 55 the Guild offered 26,950 cr for 60%
   * of one rich world with the deep array, and a system full of worlds
   * out-earned a milfuel run - the balance rule says a survey pays well
   * but never beats active hauling. At 20 a fully mapped rich world is
   * about 16k with the array and 10k with the scanner. */
  var BUY_RATE = 20;              // credits per unit grade per commodity-credit, roughly
  var HALF_LIFE_DAYS = 180;
  function ageFactor(rec, now) {
    var tm = meanT(rec);
    if (tm === null || tm === undefined) return 0;
    var days = Math.max(0, (now - tm) / 86400);
    return Math.pow(0.5, days / HALF_LIFE_DAYS);
  }
  function targetFor(sys, rec) {
    var id = rec.key.split(':').slice(1).join(':');
    if (/:ring$/.test(id)) {
      var p = sys.byId[id.replace(/:ring$/, '')];
      return p ? { kind: 'ring', planet: p, name: p.name + ' ring' } : null;
    }
    var b = sys.byId && sys.byId[id];
    if (b) return b;
    var bl = (sys.belts || []).filter(function (x) { return x.id === id; })[0];
    return bl || null;
  }
  function value(rec, sys, now, cov) {
    var tgt = targetFor(sys, rec);
    if (!tgt) return 0;
    var Eco = global.Economy;
    var rows = deposits(tgt, sys);
    /* Each commodity is paid on the ground mapped by an instrument that
     * reads its class, and no other: a grade-1 survey of a rare-metal world
     * sells for its ore and its ice. The array-mapped part at full rate,
     * the rest at 0.6, as before. */
    var a2 = Math.max(0, arrayCov(rec) - soldArray(rec));
    var sum = 0;
    rows.forEach(function (r) {
      var base = Eco && Eco.BY_ID && Eco.BY_ID[r.cid] ? Eco.BY_ID[r.cid].base : 80;
      var cls = classOf(r.cid);
      var c = Math.max(0, covClass(rec, cls) - soldClass(rec, cls));
      if (cov !== undefined) c = Math.min(c, cov);
      var ca = Math.min(c, a2);
      sum += r.grade * base * (ca * 1.0 + (c - ca) * 0.6);
    });
    return Math.round(sum * BUY_RATE * ageFactor(rec, now) / 10) * 10;
  }
  function soldArray(rec) {
    if (typeof rec.soldCov2 === 'number') return rec.soldCov2;
    return (rec.grade || 0) >= 2 ? (rec.soldCov || 0) : 0;
  }

  /* Everything mapped in THIS system the guild would pay for now. */
  function saleable(G, sys, now) {
    var here = (G.here && G.here.id) || 'sys';
    return Object.keys(G.surveys || {}).map(function (k) { return G.surveys[k]; }).filter(function (rec) {
      migrateRec(rec);
      return rec.star === here && unsoldAny(rec) > 0.02;
    }).map(function (rec) {
      return { rec: rec, price: value(rec, sys, now) };
    }).filter(function (s) { return s.price > 0; });
  }
  function sell(G, sys, now) {
    var list = saleable(G, sys, now), total = 0;
    list.forEach(function (s) {
      total += s.price;
      s.rec.soldCov = s.rec.cov;
      s.rec.soldCov2 = arrayCov(s.rec);
      s.rec.soldCovF = covClass(s.rec, 2);
      /* Nothing unsold is left, so the next ground gained starts its own date. */
      delete s.rec.tMean;
    });
    if (G.ship) G.ship.credits += total;
    return { total: total, count: list.length };
  }

  /* Grade words, for the scanner that does not do numbers. */
  function gradeWord(g) {
    return g >= 0.8 ? 'BONANZA' : g >= 0.55 ? 'RICH' : g >= 0.3 ? 'FAIR' : g >= 0.1 ? 'POOR' : 'TRACE';
  }
  function fmtTonnes(t) {
    if (!isFinite(t)) return 'no bottom to it';
    if (t >= 1e9) return (t / 1e9).toFixed(1) + ' Gt';
    if (t >= 1e6) return (t / 1e6).toFixed(0) + ' Mt';
    return Math.round(t / 1e3) + ' kt';
  }

  var Survey = {
    CIDS: CIDS, NAMES: NAMES, TABLE: TABLE, LAT_BINS: LAT_BINS, LON_BINS: LON_BINS, RANGE_R: RANGE_R,
    hash01: hash01, deposits: deposits, remaining: remaining,
    step: step, level: level, keyOf: keyOf, targetFor: targetFor,
    cellsOf: cellsOf, coverageOf: coverageOf, packCells: packCells, markAt: markAt, spinFrame: spinFrame,
    swathAt: swathAt,
    value: value, saleable: saleable, sell: sell, ageFactor: ageFactor,
    arrayCov: arrayCov, meanT: meanT, migrateRec: migrateRec, CELL_PAD: CELL_PAD,
    CLASS: CLASS, TOP: TOP, classOf: classOf, covClass: covClass, soldClass: soldClass,
    readable: readable, unsoldAny: unsoldAny,
    gradeWord: gradeWord, fmtTonnes: fmtTonnes,
    groundMap: groundMap, localGrade: localGrade, groundAt: groundAt, cellRead: cellRead,
    cellOfLatLon: cellOfLatLon, cellOfWorld: cellOfWorld, NCELL: NCELL
  };
  global.Survey = Survey;
  if (typeof module !== 'undefined' && module.exports) module.exports = Survey;
})(typeof window !== 'undefined' ? window : globalThis);
