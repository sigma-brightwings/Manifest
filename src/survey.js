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

  function cellsOf(rec) {
    if (!rec._cells) {
      var a = new Uint8Array(NCELL), s = rec.cells || '';
      for (var i = 0; i < NCELL; i++) {
        var nib = parseInt(s.charAt(i >> 2) || '0', 16);
        a[i] = (nib >> (i & 3)) & 1;
      }
      rec._cells = a;
    }
    return rec._cells;
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
    var cw = Math.cos(w), any = 0;
    for (var i = 0; i < NCELL; i++) {
      if (cells[i]) continue;
      var cc = CELL_CENTRES[i];
      if (cc[0] * bx + cc[1] * by + cc[2] * z >= cw) { cells[i] = 1; any++; }
    }
    return any;
  }

  /* The instrument. 0: none. 1: a survey scanner. 2: a deep survey array. */
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
                               cells: '', cov: 0, t: null, grade: 0, soldCov: 0 };
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
      var cells = cellsOf(rec), before = rec.cov;
      var bs = Sim.bodyState(body, sys, t);
      var rel = V.sub(ship.pos, bs.pos), vrel = V.sub(ship.vel, bs.vel);
      var r = len(rel), h = cross(rel, vrel), hl = len(h);
      var fr = spinFrame(body, t); fr.t = t;
      var period = body.rotation && body.rotation.period;
      var w = swathAt(body.radius, r);
      var dir = scale(rel, 1 / r);
      var gained = markAt(cells, fr, dir, t, period, w);
      /* THE ARC SWEPT THIS FRAME, walked back from here. */
      if (hl > 1e-12 && dt > 0) {
        var omega = hl / (r * r), sweep = omega * dt;
        var k = scale(h, 1 / hl), stepA = w * 0.8;
        var n = Math.min(4000, Math.ceil(sweep / stepA));
        for (var s2 = 1; s2 <= n; s2++) {
          var back = Math.min(sweep, s2 * stepA);
          gained += markAt(cells, fr, rotate(dir, k, -back), t - back / omega, period, w);
        }
      }
      if (gained) {
        rec.cells = packCells(cells);
        rec.cov = coverageOf(cells);
        rec.t = t;
        rec.grade = Math.max(rec.grade || 0, lvl);
        [0.25, 0.5, 0.75, 0.95].forEach(function (m) {
          if (before < m && rec.cov >= m) msgs.push('SURVEY  ' + body.name + ' — ' + Math.round(m * 100) + '% mapped');
        });
        /* A ring lies in its planet's equator: an orbit that maps the
         * equatorial band maps the ring. */
        if (body.ring) {
          var rr = recordFor(G, sys, keyOf(G, body.id + ':ring'), body.name + ' ring', 'ring');
          var rb = rr.cov;
          rr.cov = Math.max(rr.cov, bandCoverage(cells));
          if (rr.cov > rb) { rr.t = t; rr.grade = Math.max(rr.grade || 0, lvl); }
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
        if (!brec.fields[f]) {
          brec.fields[f] = 1;
          var before2 = brec.cov;
          brec.cov = Object.keys(brec.fields).length / belt.fields.length;
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
    if (rec.t === null || rec.t === undefined) return 0;
    var days = Math.max(0, (now - rec.t) / 86400);
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
    var sum = 0;
    rows.forEach(function (r) {
      var base = Eco && Eco.BY_ID && Eco.BY_ID[r.cid] ? Eco.BY_ID[r.cid].base : 80;
      sum += r.grade * base;
    });
    var inst = rec.grade >= 2 ? 1.0 : 0.6;
    var c = cov === undefined ? Math.max(0, rec.cov - (rec.soldCov || 0)) : cov;
    return Math.round(sum * BUY_RATE * c * inst * ageFactor(rec, now) / 10) * 10;
  }

  /* Everything mapped in THIS system the guild would pay for now. */
  function saleable(G, sys, now) {
    var here = (G.here && G.here.id) || 'sys';
    return Object.keys(G.surveys || {}).map(function (k) { return G.surveys[k]; }).filter(function (rec) {
      return rec.star === here && rec.cov - (rec.soldCov || 0) > 0.02;
    }).map(function (rec) {
      return { rec: rec, price: value(rec, sys, now) };
    }).filter(function (s) { return s.price > 0; });
  }
  function sell(G, sys, now) {
    var list = saleable(G, sys, now), total = 0;
    list.forEach(function (s) { total += s.price; s.rec.soldCov = s.rec.cov; });
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
    gradeWord: gradeWord, fmtTonnes: fmtTonnes
  };
  global.Survey = Survey;
  if (typeof module !== 'undefined' && module.exports) module.exports = Survey;
})(typeof window !== 'undefined' ? window : globalThis);
