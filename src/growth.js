/* growth.js - ports that grow, and who builds them.
 *
 * Designed with Astra, 2026-10-19/20:
 *
 *   "use this to create modular ports, rather than keep using the same few
 *   designs ... We keep our pathing. Berths are added on to existing, known
 *   paths, and computed from there."
 *
 *   SYMMETRY, "except in poor or more anarchic star systems, and poor
 *   syndicate controlled systems" - those grow into WRECKHOLDS.
 *
 *   "outer doors can then become the doors between the inside and outside
 *   of the NEXT add-on" - a chain is pass-through pieces, door to door.
 *
 *   "We don't want things fractalling out, and after a certain size it's
 *   actually more economical to just build a new L size bay to build out
 *   from." - a chain limit, after which only a large hub continues it.
 *
 *   The CRAWLER (always an L ship) and its tugs, one fleet of the
 *   PORTBUILDERS' UNION, building for whoever pays. Union members also
 *   MOONLIGHT, hiring welders and mechanics off the books - "that's how
 *   you get a wreckhold".
 *
 *   "growth points should exist for all station types, not just the
 *   existing ones, so that custom stations can be built" - the points a
 *   station can grow from are the free points of every piece in it: the
 *   core's (src/growth-points.js) and each built module's (src/modules.js).
 *
 * SEED + CLOCK, like wars.js. Nothing ticks. A port's whole building
 * history, from twelve years before the game starts to forty after, is
 * worked out once and cached; asking for any moment reads it. The player
 * moves it in two ways only, both stored as small records: the corruption
 * they leave (G.corruptionShift, as for wars) lowers a system's ORDER, and a
 * Crawler stopped on its way (G.growthDelay) pushes its job back.
 *
 * ORDER, 0..1, per port: wealth (system development, the port's own
 * development) and law (corruption, violence), less for a Syndicate hold.
 * It picks the BUILDER of each piece as it is built:
 *   union      >= 0.58  Crawler and Union tugs; symmetric sets; only on the
 *                       core or a hub; never stripped
 *   moonlighter >= 0.36 a member off the books; pairs with gaps; short
 *                       chains; no Crawler
 *   scavenger  below    single pieces, chains to the limit, ship parts and
 *                       mismatched paint; cut loose again after some years
 * A station that slid from Union to scavenger keeps its clean Union
 * pieces in the middle, with the mess grown round them.
 *
 * Frames: everything is in PORT units (the core model's frame, +z up),
 * the same as its berths and growth points. Modules are in metres and are
 * divided by the port's metresPerUnit on the way in.
 */
(function (global) {
  'use strict';

  var DAY = 86400, YEAR = 365 * DAY;
  var T_START = -12 * YEAR;          // history before the game begins
  var T_END = 40 * YEAR;
  var UNION_AT = 0.58, MOON_AT = 0.36;
  var CHAIN_MAX = 3;                  // pieces from the nearest L pass-through
  var CHILD_SHRINK = 0.85;            // a piece is no bigger than what it hangs on
  var FREE_CORE = 0.30;               // growth-points.cjs FREE: room checked off a core point
  var SIDE_CORE = 1.6;                // lateral allowance off a core point, x the depth allowance
  var SYM_TOL = 0.12;                 // symmetry match, x the core half-span
  var AX_TOL = 0.04;                  // a Union set's station along the main axis, x the half-span
  /* time (2026-10-24): a whole station is built out in about a year, not decades */
  var BUILDOUT_Y = { union: [0.7, 1.3], moonlighter: [1.2, 2.2], scavenger: [1.5, 3] };   // years, the whole build-out
  var BUILDOUT_LATEST = 4 * YEAR;     // the last a build-out begins; the earliest is T_START
  var PIECE_DAYS = { union: [7, 21], moonlighter: [20, 60], scavenger: [7, 70] };      // on site, one piece
  var CHURN_Y = 0.8;                  // after the build-out: a scavenger job about this often
  var CRAWLER_LEAD = 5, CRAWLER_STAY = 3;   // days the Crawler is on site before and after

  function hash01(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---- vectors and the 90-degree rotations a placement uses ------------- */
  var FACES = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  function faceOf(n) {
    var a = Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[1]) > 0.5 ? 1 : 2;
    return a * 2 + (n[a] > 0 ? 0 : 1);
  }
  function mv(R, v) {   // row-major 3x3
    return [R[0]*v[0] + R[1]*v[1] + R[2]*v[2], R[3]*v[0] + R[4]*v[1] + R[5]*v[2], R[6]*v[0] + R[7]*v[1] + R[8]*v[2]];
  }
  function mm(A, B) {
    var o = new Array(9);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++)
      o[r*3+c] = A[r*3]*B[c] + A[r*3+1]*B[3+c] + A[r*3+2]*B[6+c];
    return o;
  }
  var I3 = [1,0,0, 0,1,0, 0,0,1];
  function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
  /* Quarter turn about a unit axis k, q times (Rodrigues, exact for axes). */
  function turn(k, q) {
    q = ((q % 4) + 4) % 4;
    var c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q], x = k[0], y = k[1], z = k[2];
    return [c + x*x*(1-c),   x*y*(1-c) - z*s, x*z*(1-c) + y*s,
            y*x*(1-c) + z*s, c + y*y*(1-c),   y*z*(1-c) - x*s,
            z*x*(1-c) - y*s, z*y*(1-c) + x*s, c + z*z*(1-c)];
  }
  /* The rotation taking axis a onto axis b. */
  function align(a, b) {
    var d = dot(a, b);
    if (d > 0.5) return I3;
    if (d < -0.5) { var p = Math.abs(a[0]) < 0.5 ? [1,0,0] : [0,1,0]; return turn(cross(a, p).map(Math.abs).some(function (v) { return v > 0.5; }) ? unit(cross(a, p)) : [0,0,1], 2); }
    return turn(unit(cross(a, b)), 1);
  }
  function unit(v) { var l = Math.sqrt(dot(v, v)) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }

  /* ---- the libraries ------------------------------------------------------ */
  function points(model) { var P = global.GrowthPoints; return P && P[model] || null; }
  function mods() { var M = global.ModuleLib; return M && M.mods || []; }
  function portLib(model) { var L = global.PortLib; return L && L[model] || null; }

  /* ---- order -------------------------------------------------------------- */
  var HALF = 21 * DAY;   // Combat CORRUPTION_HALFLIFE, as wars.js
  function shiftAt(G, id, t) {
    var e = G && G.corruptionShift && G.corruptionShift[id];
    if (!e || !e.v || t < (e.t || 0)) return 0;
    return e.v * Math.pow(0.5, (t - (e.t || 0)) / HALF);
  }
  function wealthOf(sys, port) {
    var sd = sys && typeof sys.development === 'number' ? sys.development : 0.45;
    var pd = port && port.market && typeof port.market.dev === 'number' ? port.market.dev : 0.2;
    return clamp(0.5 * clamp((sd - 0.25) / 0.5, 0, 1) + 0.5 * clamp(pd / 0.5, 0, 1), 0, 1);
  }
  function baseOrder(sys, port) {
    var w = wealthOf(sys, port);
    var corr = sys && typeof sys.corruption === 'number' ? sys.corruption : 40;
    var viol = sys && typeof sys.violence === 'number' ? sys.violence : 25;
    var law = clamp(1 - 0.6 * corr / 100 - 0.4 * viol / 100, 0, 1);
    var o = 0.55 * w + 0.45 * law;
    if (sys && sys.pirateHeld) o -= 0.12 + 0.25 * (1 - w);   // a poor hold is a wreckhold
    return clamp(o, 0, 1);
  }
  function orderAt(ctx, t) {
    return clamp(baseOrder(ctx.sys, ctx.port) - 0.005 * shiftAt(ctx.G, ctx.starId, t), 0, 1);
  }
  function builderFor(o) { return o >= UNION_AT ? 'union' : o >= MOON_AT ? 'moonlighter' : 'scavenger'; }

  /* What a port of each role grows when it is not growing berths. */
  var THEMES = {
    mining:       ['storage', 'industry', 'power', 'structure'],
    reprocessing: ['industry', 'storage', 'power'],
    refinery:     ['industry', 'storage', 'power'],
    orbital:      ['habitat', 'command', 'comms', 'storage'],
    milfuel:      ['industry', 'storage', 'defence'],
    farm:         ['habitat', 'industry', 'power'],
    yard:         ['structure', 'industry', 'storage'],
    carrier:      ['defence', 'comms'],
    _:            ['habitat', 'storage', 'power', 'comms', 'structure']
  };

  /* ---- the main axis of a core --------------------------------------------
   * A spine is long: it grows at its ends and in rings along its length. A
   * ring or a dish is flat: it grows along its axle. A station about as
   * deep as it is wide has no main axis and the Union builds where it
   * likes. Returns 0/1/2, or -1. */
  var AXIS_LONG = 1.3, AXIS_FLAT = 0.6;
  function mainAxis(core) {
    var b = core && core.box;
    if (!b) return -1;
    var e = [0, 1, 2].map(function (a) { return b.max[a] - b.min[a]; });
    var o = [0, 1, 2].sort(function (p, q) { return e[q] - e[p]; });
    if (e[o[0]] >= AXIS_LONG * e[o[1]]) return o[0];
    if (e[o[2]] <= AXIS_FLAT * e[o[1]]) return o[2];
    return -1;
  }
  /* How much the Union wants a core point. Off the END of the main axis
   * (facing out along it, in the outer part of the station) it carries the
   * station on: three times as likely as anywhere else. */
  var END_WEIGHT = 3, END_FRAC = 0.5, LONE_WEIGHT = 0.35;
  function axisWeight(f, ax, core) {
    if (f.depth > 0) return 1;
    if (ax >= 0) {
      var c = (core.box.max[ax] + core.box.min[ax]) / 2, h = (core.box.max[ax] - core.box.min[ax]) / 2 || 1;
      var out = f.normal[ax] * (f.at[ax] - c) / h;
      if (Math.abs(f.normal[ax]) > 0.5 && out > END_FRAC) return END_WEIGHT;
    }
    /* off the ends, a point with no mirror mate makes a set of one */
    return f.mates ? 1 : LONE_WEIGHT;
  }

  /* ---- symmetry of a core ------------------------------------------------- */
  var symCache = {};
  /* named by the axes they negate: three mirrors, three half-turns */
  var SYMS = { x: [-1, 1, 1], y: [1, -1, 1], z: [1, 1, -1], xy: [-1, -1, 1], yz: [1, -1, -1], xz: [-1, 1, -1] };
  function symFn(k) { var s = SYMS[k]; return function (p) { return [p[0] * s[0], p[1] * s[1], p[2] * s[2]]; }; }
  var MIRRORS = [symFn('x'), symFn('y'), symFn('xy')];
  function symmetry(model) {
    if (symCache[model]) return symCache[model];
    var P = points(model), out = [];
    /* growth-points.cjs reads it off the mesh */
    if (P && P.sym) {
      P.sym.forEach(function (s) { if (SYMS[s]) out.push(symFn(s)); });
      return (symCache[model] = out);
    }
    if (P) {
      var tol = SYM_TOL * (P.half || 1), pts = P.points;
      MIRRORS.forEach(function (M) {
        var hit = 0;
        pts.forEach(function (q) { if (partner(pts, q, M, tol) >= 0) hit++; });
        if (pts.length && hit / pts.length >= 0.5) out.push(M);
      });
    }
    return (symCache[model] = out);
  }
  /* axTol: when given, a partner must also stand at the mirrored STATION
   * along main axis ax within axTol - a Union set is a clean rib round the
   * spine, not three pieces near each other. */
  function partner(pts, q, M, tol, ax, axTol) {
    var at = M(q.at), n = M(q.normal), best = -1, bd = tol;
    for (var i = 0; i < pts.length; i++) {
      var o = pts[i];
      if (dot(o.normal, n) < 0.99) continue;
      if (axTol && ax >= 0 && Math.abs(o.at[ax] - at[ax]) > axTol) continue;
      var dx = o.at[0]-at[0], dy = o.at[1]-at[1], dz = o.at[2]-at[2], d = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* ---- placing a module ---------------------------------------------------
   * The module's JOIN face (its route's way in, or its base) is turned to
   * face back into what it hangs on; then a quarter-turn spin about that
   * axis. Returns where its box and its own points land, in port units. */
  function place(mod, at, n, spin, mpu) {
    var jn = FACES[mod.join];
    var R = mm(turn(n, spin), align(jn, [-n[0], -n[1], -n[2]]));
    var s = mod.s, hx = s[0] / 2, hy = s[1] / 2;
    var box = [[-hx, hx], [-hy, hy], [0, s[2]]];
    var jc = [0, 0, 0];
    /* the point of the join face set on `at`: its DOORWAY when it has one
     * (2026-10-24, so the neck comes out where ships go in), else the
     * middle of the face */
    for (var a = 0; a < 3; a++) jc[a] = jn[a] > 0.5 ? box[a][1] : jn[a] < -0.5 ? box[a][0]
      : mod.jd ? clamp(mod.jd[a], box[a][0], box[a][1]) : (box[a][0] + box[a][1]) / 2;
    function T(m) {
      var r = mv(R, [m[0] - jc[0], m[1] - jc[1], m[2] - jc[2]]);
      return [at[0] + r[0] / mpu, at[1] + r[1] / mpu, at[2] + r[2] / mpu];
    }
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < 8; i++) {
      var c = T([box[0][i & 1], box[1][(i >> 1) & 1], box[2][(i >> 2) & 1]]);
      for (var b = 0; b < 3; b++) { if (c[b] < mn[b]) mn[b] = c[b]; if (c[b] > mx[b]) mx[b] = c[b]; }
    }
    var pts = mod.p.map(function (q) {
      var at = T(q), from = q[6] ? T(q[6]) : null;
      return { at: at, normal: mv(R, FACES[q[3]]).map(Math.round), type: q[4], cls: q[5],
               /* a route point's neck, back along into this piece's own route */
               from: from, neck: from ? Math.sqrt(dot([at[0]-from[0], at[1]-from[1], at[2]-from[2]], [at[0]-from[0], at[1]-from[1], at[2]-from[2]])) : 0 };
    }).filter(function (q) { return dot(q.normal, n) > -0.5; });   // not back into the parent: that face is the way in
    return { R: R, jc: jc, at: at, box: { min: mn, max: mx }, pts: pts };
  }
  function inVol(a, b) {   // volume of box a inside box b
    var v = 1;
    for (var i = 0; i < 3; i++) v *= Math.max(0, Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]));
    return v;
  }
  function overlap(a, b, shrink) {
    for (var i = 0; i < 3; i++) {
      var e = shrink * Math.min(a.max[i] - a.min[i], b.max[i] - b.min[i]);
      if (a.min[i] + e >= b.max[i] - e || b.min[i] + e >= a.max[i] - e) return false;
    }
    return true;
  }

  /* ---- the way in ---------------------------------------------------------
   * Astra, 2026-10-24: "ensure that all constructed stations have a path
   * for ships to enter from the primary L size berth and be taken through
   * to their docking bay somewhere inside the stations".
   *
   * The PRIMARY entrance is the L berth that most of the core's berth
   * routes come in through (a ground site's: the entrance most of its
   * routes start from). A free point is REACHED when a ship can get to it
   * from there, inside, and `reach` is the biggest class that can: a point
   * on a core route that comes in through the primary, a route point or
   * way on of a piece that is itself reached. A piece is reached when it
   * stands on a reached point by its doorway (ModuleLib `in`), and passes
   * on the smaller of the two classes. A docking bay is only built where
   * it is reached, by a ship of its size, and only from pieces with no bay
   * that opens straight to space (`ob`). Nothing stands in front of a
   * mouth that opens to space (a LANE, LANE_LEN of the half-span out and
   * LANE_W either side), and nothing is built over the primary's mouth.
   * An add-on over another outer door (a 'd' point) is that door's own
   * lane: it is the door now. */
  var LANE_W = 45;        // metres either side of a mouth's middle, at the least
  var LANE_LEN = 1.5;     // x the core's half-span, out from the mouth
  function isL(c) { return c === 'L'; }
  function fitsCls(need, have) { return !!have && (!isL(need) || isL(have)); }
  function minCls(a, b) { return a && b ? (isL(a) && isL(b) ? 'L' : 'SM') : null; }
  function entryKey(B, b) {
    if (b.doorVia && typeof b.door === 'number') return 'E' + b.door;
    if (b.entry !== undefined && B[b.entry]) return String(b.entry);
    if (b.exitVia) {
      for (var i = 0; i < B.length; i++) if (B[i].node === b.exitVia) return String(i);
    }
    return null;
  }
  function laneOf(m, mpu, H) {
    var n = m.normal, a = Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[1]) > 0.5 ? 1 : 2;
    var mn = [0, 0, 0], mx = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      if (i === a) {
        mn[i] = n[a] > 0 ? m.mid[i] : m.mid[i] - LANE_LEN * H;
        mx[i] = n[a] > 0 ? m.mid[i] + LANE_LEN * H : m.mid[i];
      } else {
        var hw = Math.max(LANE_W / mpu, m.min && m.max ? (m.max[i] - m.min[i]) / 2 : 0);
        mn[i] = m.mid[i] - hw; mx[i] = m.mid[i] + hw;
      }
    }
    return { node: m.node, min: mn, max: mx };
  }
  function inLane(b, l) {
    for (var i = 0; i < 3; i++) if (b.max[i] <= l.min[i] || b.min[i] >= l.max[i]) return false;
    return true;
  }
  var wayCache = {};
  function wayIn(model, lib, H) {
    if (wayCache[model]) return wayCache[model];
    var B = lib.anchors && lib.anchors.berths || [], E = lib.entrances || [], cnt = {}, best = null;
    B.forEach(function (b) { var k = entryKey(B, b); if (k !== null) cnt[k] = (cnt[k] || 0) + 1; });
    Object.keys(cnt).forEach(function (k) { if (best === null || cnt[k] > cnt[best]) best = k; });
    var mouth = best === null ? null : best[0] === 'E' ? E[+best.slice(1)] : B[+best];
    var enters = {};
    B.forEach(function (b) { if (best !== null && entryKey(B, b) === best) enters[b.node] = true; });
    var mpu = lib.metresPerUnit || 100;
    var mouths = E.concat(B.filter(function (b) { return !b.via && !b.doorVia; }))
      .filter(function (m) { return m && m.mid && m.normal; });
    return (wayCache[model] = {
      node: mouth ? mouth.node : null, mid: mouth ? mouth.mid : null, normal: mouth ? mouth.normal : null,
      enters: enters, lanes: mouths.map(function (m) { return laneOf(m, mpu, H); })
    });
  }
  /* in a lane it may not stand in: every lane but that of the door it covers */
  function blocksWay(way, box, f) {
    var own = f.depth === 0 && f.type === 'd' ? f.via : null;
    return way.lanes.some(function (l) { return l.node !== own && inLane(box, l); });
  }
  /* a dock this point can take: a way in from inside, no bay open to space,
   * and the route here wide enough for its biggest ship */
  function dockFits(m, f) {
    return !!(m['in'] && !m.ob && fitsCls(m.cls || 'SM', minCls(m['in'], f.reach)));
  }

  /* ---- the plan ----------------------------------------------------------- */
  var planCache = {};
  function delayKey(G, key) {
    var d = G && G.growthDelay && G.growthDelay[key];
    return d ? d.map(function (x) { return x.slot + ':' + Math.round(x.dt / DAY); }).join(',') : '';
  }
  function shiftKey(G, id) {
    var e = G && G.corruptionShift && G.corruptionShift[id];
    return e && e.v > 0.5 ? Math.round(e.v) + '@' + Math.round((e.t || 0) / DAY) : '';
  }

  /* ctx: {G, sys, port, starId, model, key?}
   *   model  the core's port-model id (Render.portModelFor)
   *   key    a stable id for this port (default starId + ':' + port.id) */
  function plan(ctx) {
    var key = ctx.key || ((ctx.starId || '') + ':' + (ctx.port && ctx.port.id));
    var ck = key + '|' + ctx.model + '|' + shiftKey(ctx.G, ctx.starId) + '|' + delayKey(ctx.G, key);
    if (planCache[ck]) return planCache[ck];
    var out = build(ctx, key);
    planCache[ck] = out;
    return out;
  }

  function build(ctx, key) {
    var core = points(ctx.model), lib = portLib(ctx.model);
    var res = { key: key, model: ctx.model, order0: orderAt(ctx, 0), wealth: wealthOf(ctx.sys, ctx.port),
                slots: [], crawlers: [], forms: {} };
    if (!core || !lib || !mods().length) return res;
    var mpu = lib.metresPerUnit || 100, H = core.half || 1;
    var role = (ctx.port && ctx.port.market && ctx.port.market.role) || '_';
    var theme = THEMES[role] || THEMES._;
    var liv = (ctx.port && ctx.port.livery) || 'civ';
    var R = function (label) { return hash01(key + '|' + ctx.model + '|' + label); };
    var sym = symmetry(ctx.model);
    var way = res.way = wayIn(ctx.model, lib, H);

    /* free points: {at, normal, type, cls, depth, size (max metres), slot (owner or -1), core idx,
     *               reach (biggest class that gets here from the primary, inside, or null)} */
    var free = core.points.map(function (q) {
      /* the room growth-points.cjs measured: the biggest module that could
       * stand here is about as big as the larger of its depth and its width */
      var rm = q.room || [FREE_CORE * H, FREE_CORE * H, FREE_CORE * H, FREE_CORE * H, FREE_CORE * H];
      var size = Math.max(rm[0], Math.min(rm[1] + rm[2], rm[3] + rm[4])) * mpu;
      var type = q.hull ? 'h' : q.door ? 'd' : 'r';
      return { at: q.at, normal: q.normal, type: type, cls: q.cls || null,
               depth: 0, size: size, room: rm, owner: -1, idx: q.i,
               via: q.via, reach: type === 'r' && way.enters[q.via] ? (q.cls || 'SM') : null,
               /* never over the primary's own mouth */
               used: type === 'd' && q.via === way.node,
               /* the NECK: the corridor cut from the berth route out through
                * the wall to where the piece stands */
               from: q.from || null, neck: q.neck || 0 };
    });
    var ax = mainAxis(core);
    res.axis = ax;
    /* how many mirror mates each core point has, at its own station */
    free.forEach(function (f) {
      f.mates = 0;
      sym.forEach(function (M) {
        var j = partner(core.points, core.points[f.idx], M, SYM_TOL * H, ax, AX_TOL * H);
        if (j >= 0 && j !== f.idx) f.mates++;
      });
    });
    /* CAP: how many pieces a port can carry at once - more for wealth, and
     * more for a wreckhold, which is all pieces. Counted on what is
     * STANDING, so a scavenger's piece cut loose makes room for the next.
     *
     * THE BUILD-OUT (Astra, 2026-10-24: "I don't think it'd take literal
     * decades to finish one of these things" - the whole station). A port
     * is built out in ONE stretch of BUILDOUT_Y years: about a year for the
     * Union, longer for moonlighters and scavengers. When that stretch
     * fell is the port's own: long before the game for most (they are
     * finished when you arrive), under way on the day it starts for some,
     * in your first few years for the rest, so there are always Crawlers
     * somewhere. After it the station is finished, except where scavengers
     * hold it: they keep welding on and cutting loose (a station that
     * slides into their hands is the mess grown round clean Union pieces). */
    var cap = Math.round(3 + 9 * res.wealth + (1 - res.order0) * (ctx.sys && ctx.sys.pirateHeld ? 14 : 5));
    var who0 = builderFor(res.order0);
    var span = (BUILDOUT_Y[who0][0] + (BUILDOUT_Y[who0][1] - BUILDOUT_Y[who0][0]) * R('span')) * YEAR;
    var start = T_START + R('start') * (BUILDOUT_LATEST - T_START);
    res.buildout = { t0: start, t1: start + span };
    var t = start, guard = 0;
    while (t < T_END && guard++ < 400) {
      var inWin = t < start + span;
      var o = orderAt(ctx, Math.max(t, 0));
      var who = builderFor(clamp(o + (R('who' + guard) - 0.5) * 0.08, 0, 1));
      /* in the build-out, jobs come one after another to fill the cap in
       * time; after it only scavengers work, every few months */
      t += (inWin ? span / (cap + 1) : CHURN_Y * YEAR) * (0.5 + R('gap' + guard));
      if (t >= T_END) break;
      /* after it: only where order really has fallen to scavengers (no
       * wobble - a middling port on the line does not churn for decades) */
      if (!(t < start + span) && builderFor(orderAt(ctx, Math.max(t, 0))) !== 'scavenger') { t += CHURN_Y * YEAR; continue; }
      if (!(t < start + span)) who = 'scavenger';
      var standing = res.slots.filter(function (s) { return s.t0 <= t && !(s.strip <= t); }).length;
      if (standing >= cap) continue;
      var wantBerth = R('berth' + guard) < (who === 'union' ? 0.45 : 0.3);
      tryPlace(ctx, res, free, who, wantBerth, theme, liv, mpu, H, t, guard, R, sym, core, ax);
    }
    /* the Union's jobs bring a Crawler */
    var sets = {};
    res.slots.forEach(function (s) { if (s.builder === 'union') (sets[s.set] = sets[s.set] || []).push(s); });
    Object.keys(sets).forEach(function (k) {
      var ss = sets[k], s0 = ss[0], size = Math.max.apply(null, s0.mod.s) / mpu;
      res.crawlers.push({ set: +k, slots: ss.map(function (s) { return s.id; }),
                         arrive: s0.t0 - CRAWLER_LEAD * DAY, leave: s0.t1 + CRAWLER_STAY * DAY,
                         at: [s0.at[0] + s0.n[0] * (size + 0.4 * H), s0.at[1] + s0.n[1] * (size + 0.4 * H), s0.at[2] + s0.n[2] * (size + 0.4 * H)],
                         tugs: 3 });
    });
    applyDelays(ctx.G, res);
    return res;
  }

  function candidatesFor(mlist, kind, wantBerth, liv, who, maxM, minM, needPass, fam) {
    var c = mlist.filter(function (m) {
      if (wantBerth ? !m.nb : ((kind && m.k !== kind) || m.nb)) return false;
      if (needPass && (!m.pass || (needPass === 'L' && m.pass !== 'L'))) return false;
      var big = Math.max(m.s[0], m.s[1], m.s[2]), small = Math.min(m.s[0], m.s[1], m.s[2]);
      if (big > maxM || big < minM) return false;
      if (small < 3 || small < big * 0.06) return false;          // a panel, not a piece
      if (who === 'scavenger') return true;                  // anything, any paint
      if (m.liv === 'ship') return false;
      return who === 'union' ? m.liv === liv : (m.liv === liv || m.liv === 'civ');
    });
    /* THEME (Astra: "so that the same station themes exist, but that more
     * variation is available"): the Union builds in the core's own family
     * when it has a piece that fits - a spine grows spine segments - and
     * only reaches into other families when it has none. A moonlighter
     * mostly does the same; a scavenger takes whatever is to hand. */
    if (fam && who !== 'scavenger') {
      var own = c.filter(function (m) { return m.fam === fam; });
      if (own.length) c = own.concat(who === 'moonlighter' ? c.slice(0, Math.ceil(c.length * 0.15)) : []);
    }
    return c;
  }

  /* The Union builds BIG: of the pieces that fit, the largest - anything
   * within UNION_BIG of the biggest. Moonlighters and scavengers take
   * whatever comes. */
  var UNION_BIG = 0.6;
  var REPEAT = 2;     // each time the Union has built a form here, a third (then a fifth...) as likely again
  var MIN_FORMS = 3;  // ...but never down to fewer forms than this if smaller ones fit
  function biggest(c) {
    if (c.length < 2) return c;
    var sz = function (m) { return Math.max(m.s[0], m.s[1], m.s[2]); };
    var form = function (m) { return m.f || m.id; };
    var top = 0;
    c.forEach(function (m) { if (sz(m) > top) top = sz(m); });
    var out = c.filter(function (m) { return sz(m) >= UNION_BIG * top; });
    /* A family with only one or two big pieces would build nothing else
     * (a pad site was five sets in six one form): reach down in size,
     * biggest first, until there are MIN_FORMS to choose from. */
    var forms = {};
    out.forEach(function (m) { forms[form(m)] = 1; });
    if (Object.keys(forms).length < MIN_FORMS) {
      c.filter(function (m) { return out.indexOf(m) < 0; })
       .sort(function (a, b) { return sz(b) - sz(a); })
       .forEach(function (m) {
         if (Object.keys(forms).length >= MIN_FORMS && !forms[form(m)]) return;
         if (Object.keys(forms).length < MIN_FORMS || forms[form(m)]) { out.push(m); forms[form(m)] = 1; }
       });
    }
    return out;
  }
  function pickWeighted(list, w, r) {
    var sum = 0, i;
    for (i = 0; i < list.length; i++) sum += w[i];
    var x = r * sum;
    for (i = 0; i < list.length; i++) { x -= w[i]; if (x < 0) return list[i]; }
    return list[list.length - 1];
  }

  function tryPlace(ctx, res, free, who, wantBerth, theme, liv, mpu, H, t, g, R, sym, core, ax) {
    var alive = res.slots.filter(function (s) { return s.t0 <= t && !(s.strip <= t); });
    /* which free points this builder may use */
    var pool = free.filter(function (f) {
      if (f.used) return false;
      if (f.owner >= 0) {
        var ow = res.slots[f.owner];
        if (!(ow.t1 <= t) || ow.strip <= t) return false;    // not finished, or gone
      }
      if (who === 'union' && f.depth > 0 && !f.hub) return false;
      if (who === 'moonlighter' && f.depth > 1) return false;
      if (f.depth >= CHAIN_MAX && !f.hub) return false;
      if (wantBerth) return !!f.reach;    // a bay only where a ship gets in from the primary
      return true;
    });
    if (!pool.length) return 0;
    /* A scavenger would rather weld onto the last thing welded on than
     * start clean on the core: that is the reef. */
    var onPieces = pool.filter(function (f) { return f.owner >= 0; });
    var all = mods();
    for (var tries = 0; tries < 6; tries++) {
      var from = (who === 'scavenger' && onPieces.length && R('reef' + g + '.' + tries) < 0.65) ? onPieces : pool;
      var f = who === 'union'
        ? pickWeighted(from, from.map(function (q) { return axisWeight(q, ax, core); }), R('pt' + g + '.' + tries))
        : from[Math.floor(R('pt' + g + '.' + tries) * from.length)];
      var kind = theme[Math.floor(R('kind' + g + '.' + tries) * theme.length)];
      var needPass = f.type === 'd' ? (f.cls || 'SM') : null;
      /* past the chain limit only a large hub carries on */
      var hubOnly = f.depth >= CHAIN_MAX - 1 && wantBerth && who !== 'scavenger';
      if (hubOnly) needPass = 'L';
      var maxM = f.size, minM = Math.min(f.size * (who === 'union' ? 0.5 : 0.3), 40);
      var fam = String(ctx.model).replace(/-(navy|syn)(?=-|$)/, '').replace(/-[sml]$/, '');
      var cand = candidatesFor(all, kind, wantBerth, liv, who, maxM, minM, needPass, fam);
      /* in the core's family, any kind it has will do: a spine's pieces
       * are whatever a spine is made of. The Union goes to its own family
       * BEFORE another family's piece of the right kind (2026-10-21: a rich
       * spine was growing refinery tanks and cradle bins because the spine
       * has no storage piece worth the name); others only when nothing fits. */
      var ownCand = function () {
        return candidatesFor(all.filter(function (m) { return m.fam === fam; }), null, wantBerth, liv, who, maxM, minM, needPass, fam)
          .filter(function (m) { return wantBerth || !m.nb; });
      };
      if (who === 'union' && !cand.some(function (m) { return m.fam === fam; })) {
        var oc = ownCand();
        if (oc.length) cand = oc;
      } else if (!cand.length && who !== 'scavenger') cand = ownCand();
      if (wantBerth) cand = cand.filter(function (m) { return dockFits(m, f); });
      if (who === 'union') cand = biggest(cand);
      if (!cand.length) continue;
      /* The Union does not build the same block over and over when it has
       * others: a form it has already built here is less likely each time
       * (2026-10-21: a rich pad site was five sets in six one form). */
      var mod = who === 'union'
        ? pickWeighted(cand, cand.map(function (m) { return 1 / (1 + REPEAT * (res.forms[m.f || m.id] || 0)); }), R('mod' + g + '.' + tries))
        : cand[Math.floor(R('mod' + g + '.' + tries) * cand.length)];
      var spin = Math.floor(R('spin' + g + '.' + tries) * 4);
      var pl = place(mod, f.at, f.normal, spin, mpu);
      if (f.depth === 0 && !fitsCore(pl, f, mpu, H)) continue;
      /* Off a piece, the core's geometry is not at hand at runtime, only its
       * box, and a station's box holds a lot of empty space. So a chain
       * must grow OUTWARD: no more of the new piece inside the core's box
       * than of the piece it hangs on. */
      if (f.depth > 0 && f.owner >= 0 &&
          inVol(pl.box, core.box) > inVol(res.slots[f.owner].box, core.box) * 1.0001 + 1e-9) continue;
      if (alive.some(function (s) { return overlap(pl.box, s.box, 0.02); })) continue;
      if (blocksWay(res.way, pl.box, f)) continue;
      /* the set: the Union builds every mirror at once; a moonlighter means
       * to and sometimes does not; a scavenger builds one */
      var group = [{ f: f, pl: pl }], wanted = 0;
      if (f.depth === 0 && f.idx !== undefined && who !== 'scavenger' && sym.length) {
        var o = orderAt(ctx, Math.max(t, 0));
        sym.forEach(function (M, mi) {
          if (who === 'moonlighter' && R('gap' + g + '.' + mi) < 0.35) return;
          var j = partner(core.points, core.points[f.idx], M, SYM_TOL * H, ax, who === 'union' ? AX_TOL * H : 0);
          if (j < 0) return;
          var fp = free.filter(function (x) { return x.owner < 0 && x.idx === j && !x.used; })[0];
          if (!fp || group.some(function (gq) { return gq.f === fp; })) return;
          wanted++;
          if (wantBerth && !dockFits(mod, fp)) return;
          var pp = place(mod, fp.at, fp.normal, spin, mpu);
          if (!fitsCore(pp, fp, mpu, H)) return;
          if (blocksWay(res.way, pp.box, fp)) return;
          if (alive.concat(group.map(function (gq) { return { box: gq.pl.box }; })).some(function (s) { return overlap(pp.box, s.box, 0.02); })) return;
          group.push({ f: fp, pl: pp });
        });
      }
      /* The Union does not build half a set: if a mirror is free but this
       * piece will not stand there, it tries another piece or place. */
      if (who === 'union' && group.length < wanted + 1) continue;
      var set = res.slots.length;
      if (who === 'union') res.forms[mod.f || mod.id] = (res.forms[mod.f || mod.id] || 0) + 1;
      /* on site, per piece (2026-10-24): a Crawler's tugs unpack an L piece
       * in hours (claude/crawler-and-station-modules.md: 1.5 cubes a day a
       * tug, two L modules to a cube); the rest is fitting out */
      var dD = PIECE_DAYS[who], dur = (dD[0] + (dD[1] - dD[0]) * R('dur' + g)) * DAY / YEAR;
      group.forEach(function (gq) {
        var id = res.slots.length;
        var parent = gq.f.owner;
        var strip = Infinity;
        if (who === 'scavenger') strip = t + dur * YEAR + (2 + 6 * R('life' + id)) * YEAR;
        if (parent >= 0) strip = Math.min(strip, res.slots[parent].strip);
        var hub = mod.pass === 'L' && mod.door;
        var slot = { id: id, set: set, mod: mod, builder: who, at: gq.f.at, n: gq.f.normal, R: gq.pl.R, jc: gq.pl.jc,
                     box: gq.pl.box, parent: parent, depth: hub ? 0 : gq.f.depth + 1, point: gq.f.idx,
                     /* what it stands on ('r' route, 'x' way on, 'd' door, 'h' hull), and the
                      * biggest class that gets into it from the primary entrance, or null */
                     via: gq.f.type, reach: mod['in'] && gq.f.reach ? minCls(mod['in'], gq.f.reach) : null,
                     t0: t, t1: t + dur * YEAR, strip: strip, hub: !!hub,
                     /* the corridor from the berth route to the piece, cut when
                      * the piece is: {from, to, cls}, port units */
                     neck: gq.f.from && gq.f.neck > 0.005 ? { from: gq.f.from, to: gq.f.at, cls: gq.f.cls || 'SM' } : null,
                     /* a berth over an outer door turns that door inward */
                     covers: gq.f.type === 'd' ? true : undefined };
        res.slots.push(slot);
        gq.f.used = true;
        var child = Math.max.apply(null, mod.s) * CHILD_SHRINK;
        gq.pl.pts.forEach(function (q) {
          free.push({ at: q.at, normal: q.normal, type: q.type, cls: q.cls, depth: slot.depth, size: hub ? FREE_CORE * H * mpu : child,
                      owner: id, used: false, hub: hub, from: q.from, neck: q.neck,
                      reach: slot.reach && (q.type === 'r' || q.type === 'x') ? minCls(q.cls || 'SM', slot.reach) : null });
        });
      });
      return group.length;
    }
    return 0;
  }

  /* Off a core point, the room growth-points.cjs checked: FREE_CORE of the
   * half-span outward, and a proportionate allowance to the sides. */
  function fitsCore(pl, f, mpu, H) {
    var b = pl.box, n = f.normal, a = Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[1]) > 0.5 ? 1 : 2;
    var rm = f.room;
    if (!rm) {
      var depth0 = b.max[a] - b.min[a], lat0 = 0;
      for (var i0 = 0; i0 < 3; i0++) if (i0 !== a) lat0 = Math.max(lat0, b.max[i0] - b.min[i0]);
      return depth0 <= FREE_CORE * H * 1.001 && lat0 <= FREE_CORE * H * SIDE_CORE;
    }
    /* outward: the box's far face no further out than the measured depth */
    var out = n[a] > 0 ? b.max[a] - f.at[a] : f.at[a] - b.min[a];
    if (out > rm[0] * 0.98) return false;
    /* sideways: each side within the clear distance measured that way */
    var axes = [0, 1, 2].filter(function (x) { return x !== a; });
    for (var k = 0; k < 2; k++) {
      var x = axes[k];
      if (b.max[x] - f.at[x] > rm[1 + 2 * k] * 0.98) return false;
      if (f.at[x] - b.min[x] > rm[2 + 2 * k] * 0.98) return false;
    }
    return true;
  }

  /* A Crawler stopped on its way pushes its job, and every job after it,
   * back by the time a replacement takes. */
  function applyDelays(G, res) {
    var d = G && G.growthDelay && G.growthDelay[res.key];
    if (!d || !d.length) return;
    res.slots.forEach(function (s) {
      var add = 0;
      d.forEach(function (x) { if (s.id >= x.slot) add += x.dt; });
      if (!add) return;
      s.t0 += add; s.t1 += add; if (isFinite(s.strip)) s.strip += add;
    });
    res.crawlers.forEach(function (c) {
      var s = res.slots[c.slots[0]];
      c.arrive = s.t0 - CRAWLER_LEAD * DAY; c.leave = s.t1 + CRAWLER_STAY * DAY;
    });
  }
  function delay(G, key, slot, dt) {
    G.growthDelay = G.growthDelay || {};
    (G.growthDelay[key] = G.growthDelay[key] || []).push({ slot: slot, dt: dt });
  }

  /* ---- reading a moment --------------------------------------------------- */
  function stateAt(ctx, t) {
    var p = plan(ctx);
    var slots = [];
    p.slots.forEach(function (s) {
      if (s.t0 > t || s.strip <= t) return;
      slots.push({ slot: s, phase: s.t1 <= t ? 'built' : 'building', progress: clamp((t - s.t0) / (s.t1 - s.t0), 0, 1) });
    });
    var crawlers = p.crawlers.filter(function (c) { return c.arrive <= t && t < c.leave; });
    return { order: orderAt(ctx, Math.max(0, t)), builder: builderFor(orderAt(ctx, Math.max(0, t))),
             slots: slots, crawlers: crawlers };
  }

  var Growth = {
    plan: plan, stateAt: stateAt, delay: delay,
    baseOrder: baseOrder, orderAt: orderAt, wealthOf: wealthOf, builderFor: builderFor,
    symmetry: symmetry, place: place, overlap: overlap, mainAxis: mainAxis, AX_TOL: AX_TOL, UNION_BIG: UNION_BIG,
    UNION_AT: UNION_AT, MOON_AT: MOON_AT, CHAIN_MAX: CHAIN_MAX, CHILD_SHRINK: CHILD_SHRINK,
    T_START: T_START, T_END: T_END, YEAR: YEAR, DAY: DAY,
    wayIn: function (model) { var lib = portLib(model), P = points(model); return lib && P ? wayIn(model, lib, P.half || 1) : null; },
    LANE_W: LANE_W, LANE_LEN: LANE_LEN,
    BUILDOUT_Y: BUILDOUT_Y, BUILDOUT_LATEST: BUILDOUT_LATEST, PIECE_DAYS: PIECE_DAYS,
    _clear: function () { planCache = {}; symCache = {}; wayCache = {}; }
  };
  global.Growth = Growth;
  if (typeof module !== 'undefined' && module.exports) module.exports = Growth;
})(typeof window !== 'undefined' ? window : globalThis);
