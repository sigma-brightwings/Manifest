/* walk.js — on foot in a station (2026-10-20).
 *
 * Astra: "full first person walking. We do need to model station interiors
 * to walk in. We also want to be able to talk to NPC characters who are
 * also on site." And before that, the reason for it: "There needs to be a
 * way for the player to seamlessly move from one ship to another … if
 * they're docked at a port where two of their ships are."
 *
 * Asked where the rooms come from, Astra: code-built now, her generator's
 * modules later. So this file builds a DECK PLAN for every port from the
 * seed — the same port is the same building every visit — and walks and
 * draws it. When her modules arrive they replace rooms one kind at a time;
 * the plan's shape (rooms, doors between them, things to use) is what they
 * have to fill.
 *
 * THE PLAN, as Astra laid stations out on 2026-10-20: ships come in at the
 * L port, which "has double doors" and works as an airlock, and the berths
 * "descend in size as they get further from the L size docking port". So:
 *
 *   L port (the big airlock) — spine corridor — berths off both sides of it,
 *   L first, then M, then S — and at the far end the concourse: the bar,
 *   the market desk, the yard counter where there is a yard, the crew hall.
 *
 * Units are metres, +y up, the deck at y = 0. The plan is axis-aligned
 * boxes, which keeps collision exact and cheap: you may stand anywhere a
 * room or a doorway contains you, and nowhere else. Walls are simply the
 * edges of rooms, so THE DOORS ARE THE ONLY WAY BETWEEN ROOMS — the same
 * rule Astra set for the stations you fly into.
 *
 * Drawn on the 2D canvas with its own small camera: floors, walls and
 * ceilings tiled so the painter's sort holds, the walls cut where a door
 * goes through them, and only the room you are in plus the rooms its doors
 * open on — a corridor two rooms away is behind a wall anyway.
 */
(function (global) {
  'use strict';

  /* ---- a seeded stream of its own --------------------------------------
   * Its own hash and generator rather than a draw from any stream another
   * module relies on, so adding the deck plan moved no star, port or
   * market (the project's seed doctrine). */
  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function stream(key) {
    var a = hash(key) || 1;
    function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; }
    };
  }

  /* ---- sizes ------------------------------------------------------------ */
  var EYE = 1.65;              // m, standing eye height
  var RADIUS = 0.3;            // m, how close you can stand to a wall
  var WALK = 1.7, RUN = 3.6;   // m/s
  var TURN = 2.2;              // rad/s, arrow keys
  var DOOR_W = 1.8, DOOR_H = 2.4, BIG_DOOR_W = 6, BIG_DOOR_H = 4.5;
  var REACH = 1.8;             // m, how far E reaches

  /* A berth's airlock room, by the size of ship it serves. */
  var BERTH_ROOM = { L: { w: 12, d: 12, h: 5 }, M: { w: 9, d: 9, h: 4 }, S: { w: 7, d: 7, h: 3.4 } };
  var SPINE_W = 4, SPINE_H = 3.4;

  function sizeClass(hullSize) { return hullSize === 'S' ? 'S' : hullSize === 'M' ? 'M' : 'L'; }

  /* ---- the deck plan ----------------------------------------------------
   * `opts`: { seed, yard (bool), ships: [{ id, size, name, mine, current }] }
   * Every ship in `ships` is given a berth of its own size (an XL takes an
   * L berth), the current one first; the rest of the berths are empty or
   * somebody else's. */
  function layout(portId, opts) {
    opts = opts || {};
    var rng = stream('walk|' + (opts.seed || '') + '|' + portId);
    var rooms = [], doors = [], items = [];

    function room(id, kind, x0, x1, z0, z1, h, label) {
      var r = { id: id, kind: kind, x0: x0, x1: x1, z0: z0, z1: z1, y0: 0, y1: h, label: label || '' };
      rooms.push(r);
      return r;
    }
    /* A doorway between two rooms that share a wall. `axis` is the way you
     * walk through it; the box reaches 0.8 m into each room so the step
     * across the threshold is always inside something. */
    function door(a, b, axis, at, along, w, h) {
      var d = { a: a.id, b: b.id, axis: axis, w: w || DOOR_W, h: h || DOOR_H };
      if (axis === 'z') {          // a wall of constant z, crossed walking along z
        d.x0 = along - d.w / 2; d.x1 = along + d.w / 2; d.z0 = at - 0.8; d.z1 = at + 0.8; d.at = at;
      } else {
        d.z0 = along - d.w / 2; d.z1 = along + d.w / 2; d.x0 = at - 0.8; d.x1 = at + 0.8; d.at = at;
      }
      doors.push(d);
      return d;
    }

    /* Berths: one L, two or three M, two to four S — more where the port
     * is busier — and at least one of each size a ship of yours needs. */
    var need = { L: 0, M: 0, S: 0 };
    (opts.ships || []).forEach(function (s) { need[sizeClass(s.size)]++; });
    var count = {
      L: Math.max(1, need.L),
      M: Math.max(rng.int(2, 3), need.M),
      S: Math.max(rng.int(2, 4), need.S)
    };
    var order = [];
    ['L', 'M', 'S'].forEach(function (sz) { for (var i = 0; i < count[sz]; i++) order.push(sz); });

    /* The L port at the south end, the spine running north from it. */
    var lport = room('lport', 'lport', -10, 10, -16, 0, 7, 'L docking port');
    /* Berths alternate sides up the spine, biggest nearest the L port. */
    var z = 2, spineLen;
    var west = [], east = [];
    var berthRooms = [];
    for (var i = 0; i < order.length; i++) {
      var sz = order[i], dim = BERTH_ROOM[sz];
      var side = (i % 2 === 0) ? -1 : 1;
      var list = side < 0 ? west : east;
      var zc = (list.length ? list[list.length - 1].zEnd + 1 : 2) + dim.d / 2;
      var x0 = side < 0 ? -SPINE_W / 2 - dim.w : SPINE_W / 2;
      var br = room('berth' + i, 'berth', x0, x0 + dim.w, zc - dim.d / 2, zc + dim.d / 2, dim.h,
                    'Berth ' + (i + 1) + '  ·  ' + sz);
      br.size = sz; br.side = side; br.index = i;
      list.push({ zEnd: zc + dim.d / 2 });
      berthRooms.push(br);
    }
    var westEnd = west.length ? west[west.length - 1].zEnd : 0;
    var eastEnd = east.length ? east[east.length - 1].zEnd : 0;
    spineLen = Math.max(westEnd, eastEnd) + 2;
    var spine = room('spine', 'corridor', -SPINE_W / 2, SPINE_W / 2, 0, spineLen, SPINE_H, 'Spine');
    door(lport, spine, 'z', 0, 0, BIG_DOOR_W > SPINE_W ? SPINE_W - 0.4 : BIG_DOOR_W, DOOR_H + 0.4);
    berthRooms.forEach(function (br) {
      var wallX = br.side < 0 ? br.x1 : br.x0;
      door(spine, br, 'x', wallX, (br.z0 + br.z1) / 2, DOOR_W + (br.size === 'L' ? 1.2 : 0), DOOR_H + 0.3);
    });

    /* The concourse, north of the spine, and what is in it. */
    var cw = 26, cd = 20;
    var conc = room('concourse', 'concourse', -cw / 2, cw / 2, spineLen, spineLen + cd, 6, 'Concourse');
    door(spine, conc, 'z', spineLen, 0, SPINE_W - 0.4, DOOR_H + 0.4);
    var bar = room('bar', 'bar', -cw / 2 - 12, -cw / 2, spineLen + 4, spineLen + 16, 3.6, 'The bar');
    door(conc, bar, 'x', -cw / 2, spineLen + 10, 2.4, DOOR_H);
    var hall = room('crewhall', 'crewhall', cw / 2, cw / 2 + 10, spineLen + 3, spineLen + 13, 3.4, 'Crew hall');
    door(conc, hall, 'x', cw / 2, spineLen + 8, 2.0, DOOR_H);

    /* Things to use, each a spot you stand near and face. */
    function item(kind, x, zz, label, extra) {
      var it = { kind: kind, x: x, z: zz, label: label };
      for (var k in (extra || {})) it[k] = extra[k];
      items.push(it);
      return it;
    }
    item('market', 6, spineLen + cd - 1.2, 'Market desk', { counter: [3, spineLen + cd - 1.4, 9, spineLen + cd] });
    if (opts.yard) item('yard', -6, spineLen + cd - 1.2, 'Shipyard counter', { counter: [-9, spineLen + cd - 1.4, -3, spineLen + cd] });
    item('bar', -cw / 2 - 10.5, spineLen + 10, 'The bar', { counter: [-cw / 2 - 12, spineLen + 6, -cw / 2 - 11, spineLen + 14] });
    item('crew', cw / 2 + 8.8, spineLen + 8, 'Crew hall board', { counter: [cw / 2 + 9.4, spineLen + 5, cw / 2 + 10, spineLen + 11] });

    /* Your ships into berths of their size, the current one first. */
    var ships = (opts.ships || []).slice().sort(function (a, b) { return (b.current ? 1 : 0) - (a.current ? 1 : 0); });
    var free = berthRooms.slice();
    var spawn = null;
    ships.forEach(function (s) {
      var want = sizeClass(s.size);
      var k = -1;
      for (var j = 0; j < free.length; j++) if (free[j].size === want) { k = j; break; }
      if (k < 0) return;
      var br = free.splice(k, 1)[0];
      br.ship = s;
      /* The hatch is on the berth's outer wall, opposite its door. */
      var hx = br.side < 0 ? br.x0 + 0.9 : br.x1 - 0.9;
      item(s.current ? 'mine' : 'fleet', hx, (br.z0 + br.z1) / 2,
           (s.current ? 'Your ship' : 'Board') + '  ·  ' + (s.name || 'ship'), { ship: s, berth: br.id });
      if (s.current) spawn = { x: hx + (br.side < 0 ? 1.4 : -1.4), z: (br.z0 + br.z1) / 2,
                               yaw: br.side < 0 ? Math.PI / 2 : -Math.PI / 2 };
    });
    if (!spawn) spawn = { x: 0, z: -6, yaw: 0 };

    return { portId: portId, rooms: rooms, doors: doors, items: items, spawn: spawn };
  }

  /* ---- where you may stand ---------------------------------------------
   * Inside a room, a wall's width (RADIUS) back from its walls; or inside a
   * doorway, a wall's width in from its jambs. Counters are furniture: you
   * stand against them, not in them. */
  function standable(plan, x, z) {
    for (var i = 0; i < plan.items.length; i++) {
      var c = plan.items[i].counter;
      if (c && x > c[0] - RADIUS && x < c[2] + RADIUS && z > c[1] - RADIUS && z < c[3] + RADIUS) return false;
    }
    for (i = 0; i < plan.rooms.length; i++) {
      var r = plan.rooms[i];
      if (x > r.x0 + RADIUS && x < r.x1 - RADIUS && z > r.z0 + RADIUS && z < r.z1 - RADIUS) return true;
    }
    for (i = 0; i < plan.doors.length; i++) {
      var d = plan.doors[i];
      /* A sliding door (shipdeck.js) is only a way through while it is
       * open; shut, it is wall like the rest. */
      if (d.shut) continue;
      if (d.axis === 'z') {
        if (x > d.x0 + RADIUS && x < d.x1 - RADIUS && z > d.z0 && z < d.z1) return true;
      } else {
        if (z > d.z0 + RADIUS && z < d.z1 - RADIUS && x > d.x0 && x < d.x1) return true;
      }
    }
    return false;
  }

  function roomAt(plan, x, z) {
    for (var i = 0; i < plan.rooms.length; i++) {
      var r = plan.rooms[i];
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
    }
    return null;
  }

  /* ---- the walker -------------------------------------------------------- */
  function start(plan) {
    return { plan: plan, x: plan.spawn.x, z: plan.spawn.z, yaw: plan.spawn.yaw, pitch: 0, near: null };
  }

  /* One step. `keys` is the game's held-key map. Moves are tried one axis
   * at a time, so walking into a wall at an angle slides along it. */
  function step(w, keys, dt) {
    keys = keys || {};
    if (keys.arrowleft) w.yaw -= TURN * dt;
    if (keys.arrowright) w.yaw += TURN * dt;
    if (keys.arrowup) w.pitch = Math.min(1.2, w.pitch + TURN * 0.6 * dt);
    if (keys.arrowdown) w.pitch = Math.max(-1.2, w.pitch - TURN * 0.6 * dt);
    var f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    var r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    if (f || r) {
      var sp = (keys.shift ? RUN : WALK) * dt / (f && r ? Math.SQRT2 : 1);
      var sy = Math.sin(w.yaw), cy = Math.cos(w.yaw);
      var dx = (sy * f + cy * r) * sp, dz = (cy * f - sy * r) * sp;
      if (standable(w.plan, w.x + dx, w.z)) w.x += dx;
      if (standable(w.plan, w.x, w.z + dz)) w.z += dz;
    }
    w.near = facing(w);
    return w;
  }

  function look(w, dyaw, dpitch) {
    w.yaw += dyaw;
    w.pitch = Math.max(-1.2, Math.min(1.2, w.pitch + dpitch));
  }

  /* What E would act on: the nearest thing within reach that is in front of
   * you, so the label on screen is always the thing you are looking at. */
  function facing(w) {
    var best = null, bd = Infinity;
    var fx = Math.sin(w.yaw), fz = Math.cos(w.yaw);
    /* Only in the room you are standing in: in a ship the seat is two
     * metres from the passage, through a doorway, and E there should not
     * sit you down in it. */
    var here = roomAt(w.plan, w.x, w.z);
    for (var i = 0; i < w.plan.items.length; i++) {
      var it = w.plan.items[i];
      /* Furniture with nothing to use on it (a ship's dash and consoles)
       * is in the plan only to be walked round. */
      if (it.silent) continue;
      if (here && roomAt(w.plan, it.x, it.z) !== here) continue;
      var dx = it.x - w.x, dz = it.z - w.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > REACH + 0.6) continue;
      if (d > 0.2 && (dx * fx + dz * fz) / d < 0.35) continue;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  /* ---- drawing ------------------------------------------------------------ */
  var PAL = {
    lport:     { floor: '#2b3038', wall: '#3d444e', ceil: '#1f242b', trim: '#d9a521' },
    corridor:  { floor: '#2e333a', wall: '#48505b', ceil: '#23282f', trim: '#5fb8c9' },
    berth:     { floor: '#30343a', wall: '#434a53', ceil: '#22262c', trim: '#d9a521' },
    concourse: { floor: '#3a3631', wall: '#5a5248', ceil: '#2a2622', trim: '#7fd6c0' },
    bar:       { floor: '#2f2620', wall: '#4b3a30', ceil: '#211a16', trim: '#ff9f5a' },
    crewhall:  { floor: '#2e3330', wall: '#46504a', ceil: '#222724', trim: '#9fc7d2' }
  };
  var TILE = 2;

  function camera(w, W, H) {
    var cp = Math.cos(w.pitch), sp = Math.sin(w.pitch);
    var f = [Math.sin(w.yaw) * cp, sp, Math.cos(w.yaw) * cp];
    var r = [Math.cos(w.yaw), 0, -Math.sin(w.yaw)];
    var u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    return { eye: [w.x, EYE, w.z], f: f, r: r, u: u, cx: W / 2, cy: H / 2, flen: H * 0.85 };
  }
  function toCam(c, p) {
    var v = [p[0] - c.eye[0], p[1] - c.eye[1], p[2] - c.eye[2]];
    return { d: v[0] * c.f[0] + v[1] * c.f[1] + v[2] * c.f[2],
             x: v[0] * c.r[0] + v[1] * c.r[1] + v[2] * c.r[2],
             y: v[0] * c.u[0] + v[1] * c.u[1] + v[2] * c.u[2] };
  }
  var NEAR = 0.05;
  function project(c, pts) {
    var cs = pts.map(function (p) { return toCam(c, p); }), kept = [];
    for (var i = 0; i < cs.length; i++) {
      var a = cs[i], b = cs[(i + 1) % cs.length];
      if (a.d > NEAR) kept.push(a);
      if ((a.d > NEAR) !== (b.d > NEAR)) {
        var t = (NEAR - a.d) / (b.d - a.d);
        kept.push({ d: NEAR, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    if (kept.length < 3) return null;
    return kept.map(function (k) { return { x: c.cx + k.x * c.flen / k.d, y: c.cy - k.y * c.flen / k.d }; });
  }

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)),
        b = Math.min(255, Math.round((n & 255) * f));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* A wall of a room, minus the doors through it, cut into tiles. */
  function wallQuads(plan, room, side, out, pal) {
    var fixed, a0, a1, axis;
    if (side === 'x0') { fixed = room.x0; axis = 'x'; a0 = room.z0; a1 = room.z1; }
    if (side === 'x1') { fixed = room.x1; axis = 'x'; a0 = room.z0; a1 = room.z1; }
    if (side === 'z0') { fixed = room.z0; axis = 'z'; a0 = room.x0; a1 = room.x1; }
    if (side === 'z1') { fixed = room.z1; axis = 'z'; a0 = room.x0; a1 = room.x1; }
    var gaps = [];
    plan.doors.forEach(function (d) {
      if (d.axis !== axis || Math.abs(d.at - fixed) > 0.01) return;
      if (d.a !== room.id && d.b !== room.id) return;
      var g0 = axis === 'x' ? d.z0 : d.x0, g1 = axis === 'x' ? d.z1 : d.x1;
      gaps.push([g0, g1, d.h]);
    });
    gaps.sort(function (p, q) { return p[0] - q[0]; });
    var h = room.y1;
    /* Solid stretches between the gaps, and a lintel over each. */
    var spans = [], at = a0;
    gaps.forEach(function (g) {
      if (g[0] > at) spans.push([at, g[0], 0, h]);
      spans.push([g[0], g[1], g[2], h]);
      at = g[1];
    });
    if (at < a1) spans.push([at, a1, 0, h]);
    var lit = side === 'x0' || side === 'z1' ? 0.92 : 0.78;
    spans.forEach(function (s) {
      if (s[3] - s[2] < 0.01) return;
      for (var u = s[0]; u < s[1] - 1e-6; u += TILE) {
        var u1 = Math.min(s[1], u + TILE);
        for (var v = s[2]; v < s[3] - 1e-6; v += TILE) {
          var v1 = Math.min(s[3], v + TILE);
          var q = axis === 'x'
            ? [[fixed, v, u], [fixed, v, u1], [fixed, v1, u1], [fixed, v1, u]]
            : [[u, v, fixed], [u1, v, fixed], [u1, v1, fixed], [u, v1, fixed]];
          out.push({ pts: q, col: shade(pal.wall, lit * (v < 0.3 ? 0.8 : 1)) });
        }
      }
      /* A trim stripe at waist height along the solid stretches. */
      if (s[2] === 0) {
        var q2 = axis === 'x'
          ? [[fixed, 1.0, s[0]], [fixed, 1.0, s[1]], [fixed, 1.12, s[1]], [fixed, 1.12, s[0]]]
          : [[s[0], 1.0, fixed], [s[1], 1.0, fixed], [s[1], 1.12, fixed], [s[0], 1.12, fixed]];
        out.push({ pts: q2, col: pal.trim, bias: -0.02 });
      }
    });
  }

  function roomQuads(plan, room, out) {
    var pal = PAL[room.kind] || PAL.corridor;
    for (var x = room.x0; x < room.x1 - 1e-6; x += TILE) {
      var x1 = Math.min(room.x1, x + TILE);
      for (var z = room.z0; z < room.z1 - 1e-6; z += TILE) {
        var z1 = Math.min(room.z1, z + TILE);
        var chk = (Math.floor(x / TILE) + Math.floor(z / TILE)) % 2 ? 1 : 0.9;
        out.push({ pts: [[x, 0, z], [x1, 0, z], [x1, 0, z1], [x, 0, z1]], col: shade(pal.floor, chk) });
        out.push({ pts: [[x, room.y1, z], [x, room.y1, z1], [x1, room.y1, z1], [x1, room.y1, z]], col: pal.ceil });
      }
    }
    ['x0', 'x1', 'z0', 'z1'].forEach(function (s) { wallQuads(plan, room, s, out, pal); });
    /* Ceiling light strips down the long axis. */
    var long = (room.x1 - room.x0) > (room.z1 - room.z0);
    var cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2, y = room.y1 - 0.02;
    var strip = long
      ? [[room.x0 + 1, y, cz - 0.25], [room.x0 + 1, y, cz + 0.25], [room.x1 - 1, y, cz + 0.25], [room.x1 - 1, y, cz - 0.25]]
      : [[cx - 0.25, y, room.z0 + 1], [cx - 0.25, y, room.z1 - 1], [cx + 0.25, y, room.z1 - 1], [cx + 0.25, y, room.z0 + 1]];
    out.push({ pts: strip, col: '#e8f4ff', bias: -0.05 });
  }

  function boxQuads(b, y0, y1, col, out) {
    var x0 = b[0], z0 = b[1], x1 = b[2], z1 = b[3];
    out.push({ pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col: shade(col, 1.15) });
    out.push({ pts: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], col: shade(col, 0.8) });
    out.push({ pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], col: shade(col, 0.8) });
    out.push({ pts: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], col: shade(col, 0.9) });
    out.push({ pts: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], col: shade(col, 0.9) });
  }

  /* A hatch: a door-shaped panel on the berth's outer wall, lit when it is
   * one of yours. */
  function hatchQuads(it, room, out) {
    var x = it.x < (room.x0 + room.x1) / 2 ? room.x0 + 0.02 : room.x1 - 0.02;
    var z = it.z, col = it.kind === 'mine' ? '#7fd6c0' : it.kind === 'fleet' ? '#d9a521' : '#556';
    out.push({ pts: [[x, 0, z - 1.1], [x, 0, z + 1.1], [x, 2.6, z + 1.1], [x, 2.6, z - 1.1]], col: '#1a1e24', bias: -0.03 });
    out.push({ pts: [[x, 2.62, z - 1.2], [x, 2.62, z + 1.2], [x, 2.8, z + 1.2], [x, 2.8, z - 1.2]], col: col, bias: -0.04 });
  }

  /* `extra`: more polygons for the painter's sort, in the plan's metres —
   * the people on the deck when there is no GPU to draw them (npc.js,
   * 2026-10-25). Each is { pts: [[x,y,z] …], col }. */
  function draw(ctx, w, W, H, extra) {
    var plan = w.plan, c = camera(w, W, H);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, W, H);
    /* The room you are in, the rooms its doors open on, and the rooms
     * theirs open on — two doors deep, so a berth seen across the spine
     * through two open doors is a room and not a black hole. Further than
     * that is behind a wall from anywhere in this plan. */
    var here = roomAt(plan, w.x, w.z);
    var show = {};
    function open(id) {
      plan.doors.forEach(function (d) {
        if (d.a === id) show[d.b] = true;
        if (d.b === id) show[d.a] = true;
      });
    }
    if (here) {
      show[here.id] = true;
      open(here.id);
      Object.keys(show).forEach(open);
    } else plan.rooms.forEach(function (r) { show[r.id] = true; });
    var quads = [];
    plan.rooms.forEach(function (r) { if (show[r.id]) roomQuads(plan, r, quads); });
    plan.items.forEach(function (it) {
      var r = roomAt(plan, it.x, it.z);
      if (!r || !show[r.id]) return;
      if (it.counter) boxQuads(it.counter, 0, 1.05, it.kind === 'bar' ? '#6b4a33' : '#3f5560', quads);
      if (it.ship) hatchQuads(it, r, quads);
    });
    if (extra) for (var e = 0; e < extra.length; e++) quads.push(extra[e]);
    /* Far to near. */
    quads.forEach(function (q) {
      var m = [0, 0, 0];
      q.pts.forEach(function (p) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; });
      var n = q.pts.length;
      var dx = m[0] / n - c.eye[0], dy = m[1] / n - c.eye[1], dz = m[2] / n - c.eye[2];
      q.d = Math.sqrt(dx * dx + dy * dy + dz * dz) + (q.bias || 0);
    });
    quads.sort(function (a, b) { return b.d - a.d; });
    for (var i = 0; i < quads.length; i++) {
      var s = project(c, quads[i].pts);
      if (!s) continue;
      /* Distance haze: far plates darker, so depth reads. */
      var fog = Math.max(0.35, 1 - quads[i].d / 60);
      ctx.fillStyle = quads[i].col;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (var k = 1; k < s.length; k++) ctx.lineTo(s[k].x, s[k].y);
      ctx.closePath();
      ctx.fill();
      if (fog < 1) { ctx.fillStyle = 'rgba(5,7,10,' + (1 - fog).toFixed(3) + ')'; ctx.fill(); }
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    /* Labels over the things you can use in the room you are in — a label
     * from the next room would float through the wall between. */
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    plan.items.forEach(function (it) {
      var r = roomAt(plan, it.x, it.z);
      if (it.silent || !r || (here && r !== here)) return;
      var p = project(c, [[it.x, 2.4, it.z], [it.x, 2.4, it.z], [it.x, 2.4, it.z]]);
      var cs = toCam(c, [it.x, 2.4, it.z]);
      if (!p || cs.d < 0.3 || cs.d > 30) return;
      ctx.fillStyle = it === w.near ? '#ffe9a8' : 'rgba(180,240,255,0.75)';
      ctx.fillText(it.label, p[0].x, p[0].y);
    });
    ctx.textAlign = 'left';
    /* A dot where you are looking. */
    ctx.fillStyle = 'rgba(220,240,255,0.7)';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 2, 0, Math.PI * 2); ctx.fill();
    return { room: here };
  }

  /* ---- the station deck as one mesh, for the GPU (2026-10-25) ------------
   * The same plates draw() paints — floors, ceilings, the walls cut for
   * their doors, the trim, the light strips, the counters and the hatches —
   * in the renderer's mesh format ({ v, f, c }, '!' for a self-lit face),
   * so a station deck can be drawn on the world layer the way your own
   * ship's rooms are, and the people standing in it (npcgl.js) can be
   * depth-tested against its walls. Every room, not just the ones near you:
   * the GPU does not mind, and a closed building is what keeps the world
   * outside from showing through a far doorway. Built once per plan. */
  function hexOf(col) {
    if (col.charAt(0) === '#') return col;
    var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(col);
    if (!m) return '#808080';
    return '#' + [m[1], m[2], m[3]].map(function (n) { return ('0' + (+n).toString(16)).slice(-2); }).join('');
  }
  function meshFor(plan) {
    if (plan._mesh) return plan._mesh;
    var quads = [];
    /* The trim stripe lies ON its wall. The painter's sort kept it in front
     * with a bias; a depth buffer needs it actually in front, so it is
     * stood a centimetre off the wall into the room, or the two flicker. */
    plan.rooms.forEach(function (r) {
      var from = quads.length;
      roomQuads(plan, r, quads);
      for (var i = from; i < quads.length; i++) {
        if (!quads[i].bias || quads[i].bias > -0.01 || quads[i].bias < -0.03) continue;
        quads[i].pts = quads[i].pts.map(function (p) {
          var q = p.slice();
          if (Math.abs(q[0] - r.x0) < 1e-6) q[0] += 0.012; else if (Math.abs(q[0] - r.x1) < 1e-6) q[0] -= 0.012;
          if (Math.abs(q[2] - r.z0) < 1e-6) q[2] += 0.012; else if (Math.abs(q[2] - r.z1) < 1e-6) q[2] -= 0.012;
          return q;
        });
      }
    });
    plan.items.forEach(function (it) {
      var r = roomAt(plan, it.x, it.z);
      if (!r) return;
      if (it.counter) boxQuads(it.counter, 0, 1.05, it.kind === 'bar' ? '#6b4a33' : '#3f5560', quads);
      if (it.ship) hatchQuads(it, r, quads);
    });
    var m = { v: [], f: [], c: [] };
    quads.forEach(function (q) {
      var col = hexOf(q.col), lit = col.toLowerCase() === '#e8f4ff' || (q.bias || 0) <= -0.04;
      var n = m.v.length;
      q.pts.forEach(function (p) { m.v.push([p[0], p[1], p[2]]); });
      for (var i = 1; i + 1 < q.pts.length; i++) { m.f.push([n, n + i, n + i + 1]); m.c.push((lit ? '!' : '') + col); }
    });
    plan._mesh = m;
    return m;
  }

  var Walk = {
    EYE: EYE, RADIUS: RADIUS, WALK: WALK, RUN: RUN, REACH: REACH,
    layout: layout, standable: standable, roomAt: roomAt,
    start: start, step: step, look: look, facing: facing, draw: draw,
    sizeClass: sizeClass, meshFor: meshFor
  };

  global.Walk = Walk;
  if (typeof module !== 'undefined' && module.exports) module.exports = Walk;
})(typeof window !== 'undefined' ? window : globalThis);
