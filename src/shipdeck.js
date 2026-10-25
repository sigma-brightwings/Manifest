/* shipdeck.js — the inside of your own ship (2026-10-24).
 *
 * Astra: "We need to have a modeled interior for every ship that doesn't
 * have one, specifically the cockpit. There needs to be doors that slide
 * into the structure of the ship to open the way from the cockpit into the
 * rest of the ship, and the syndicate ships need to have the dark grey and
 * red motif on the interior too."
 *
 * Asked what kind of interior, she chose a real 3D room per hull on the
 * GPU, fitted to that hull's glass and size; a door you can walk through to
 * your airlock; and the Syndicate's colours on the Corsair Runner, the
 * Enforcer, the Syndicate Heavy and the Crawler in Syndicate livery.
 *
 * THIS FILE IS THE ONE SOURCE OF TRUTH for the inside of a ship. It takes
 * the cockpit's measurements (Render.cockpitGeometry, which is where the
 * glass already lives) and makes two things from them:
 *
 *   - a DECK PLAN in walk.js's own format — rooms, doors and things to use,
 *     axis-aligned boxes in metres — so Walk.step and Walk.standable walk
 *     it unchanged and Walk.draw is the fallback picture without WebGL;
 *   - the MESHES the GPU draws: the room, the window panes it is cut by,
 *     the door leaves, and the pilot's seat.
 *
 * Plan coordinates are the ship's own: x to starboard, z forward, metres.
 * The plan's deck is y = 0; in the ship that is `floorY`, below the seated
 * eye (which is the cockpit's origin, see Camera.buildCockpit). Meshes are
 * built in ship-local metres, y included, so they need no transform but the
 * ship's own frame and the metre-to-km scale.
 *
 * THE WINDOWS ARE NOT HOLES IN THE MESH. Every pane is drawn first as a
 * depth-only "portal", then the room: a wall behind a pane fails the depth
 * test and the world already in the buffer shows through. So each window
 * keeps exactly the tuned shape the seat view has always had, at any head
 * angle, and the walls only have to sit just outside the glass. They are
 * framed around the panes anyway (`frame` below) so that walking past a
 * window shows a window set in a wall rather than a pane floating in a box.
 *
 * Pure and headless: no canvas, no GL. render.js turns the meshes into
 * draw calls; main.js walks the plan.
 */
(function (global) {
  'use strict';

  /* ---- its own seeded stream, as walk.js has, so nothing else moves ---- */
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
      range: function (lo, hi) { return lo + (hi - lo) * next(); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; }
    };
  }

  /* ---- sizes, in metres ------------------------------------------------- */
  var DOOR_HW = 0.45, DOOR_H = 2.0;      // the opening: 0.9 m by 2 m
  var WALL_T = 0.16;                     // a bulkhead, thick enough to hide a leaf
  var LEAF_T = 0.04;
  var PASSAGE_HW = 0.65, PASSAGE_H = 2.25;
  var PASSAGE_LEN = { S: 2.4, M: 3.8, L: 5.6, XL: 8.0 };
  var LOCK_HW = 1.2, LOCK_D = 2.4, LOCK_H = 2.3;
  var HATCH_HW = 0.55, HATCH_H = 1.95;
  /* How near a sliding door has to be before it opens for you, and how long
   * it takes. Wall-clock seconds, like the station doors. */
  var DOOR_REACH = 1.7, DOOR_TIME = 0.7;
  /* The seat, where the plan has to keep you out of it. */
  var SEAT = [-0.30, -0.40, 0.30, 0.16];

  /* ---- the bridge and the crew (2026-10-24, second pass) -----------------
   * Astra: "All ship cockpits have to be sized to the type of ship they
   * operate - M and L size ships might have multiple crew stations on the
   * bridge", "create them so that they match the geometry of the ship, but
   * with multiple crew stations", and "All ships which have crew stations
   * require crew quarters."
   *
   * Asked what decides the stations, she said use crew models if we have
   * them; there are none (no GLB has anything but the pilot's seat, and the
   * game draws no people), so they are built here, one per hand the hull
   * needs with you at the helm (Crew.crewNeeded(hullId, true)): engineers
   * first, then gunners. Her NPCs sit in them later.
   *
   * The helm keeps the room it has, rear screens, greebles and all: the
   * bulkhead behind the seat becomes an open arch, and the BRIDGE DECK
   * behind it carries the stations along its side walls, each a console
   * against the wall and a seat facing it. The sliding bridge door moves to
   * the aft end of the deck. On a narrow hull the stations go down the port
   * side only, so the way aft stays clear. */
  var STATION_LEN = 1.15;                // m of wall each station takes
  var STATION_CON = 0.32, STATION_SEAT = 0.50;   // console depth, seat depth from it
  var STATION_MAX = 6;
  var ARCH_HW = DOOR_HW;                 // the helm arch is the old doorway, open
  var ROLE_NAME = { engineer: 'Engineering', gunner: 'Gunnery' };
  /* Quarters: a bunk for every hand and one for you, two to a stack, down
   * the outboard wall, and down the inboard one too when there are more
   * than two stacks; lockers and a galley, as the navy yards' crew rooms
   * have (yard-navy-*.glb bay*Crew*: bunks, lockers, galley, kit). */
  var BUNK_LEN = 2.1, BUNK_W = 0.85, QUARTERS_W = 2.5, QUARTERS_H = 2.25;

  /* More hands than the bridge has room for (a Carrier's nine) share the
   * stations it does have in proportion, so gunnery is never crowded out. */
  function stationRoles(crew) {
    var out = [], i;
    if (!crew) return out;
    var e = crew.engineer || 0, g = crew.gunner || 0;
    if (e + g > STATION_MAX) {
      var e2 = Math.max(g ? 1 : 0, Math.round(STATION_MAX * e / (e + g)));
      e2 = Math.min(e2, STATION_MAX - (g ? 1 : 0));
      g = STATION_MAX - e2; e = e2;
    }
    for (i = 0; i < e; i++) out.push('engineer');
    for (i = 0; i < g; i++) out.push('gunner');
    return out;
  }

  /* ---- whose colours ----------------------------------------------------
   * Keyed off the HULL, not the paint: the yard's paints are a hull colour
   * and a trim, and no paint makes a Runner into something else inside.
   * A player's Crawler wears `crawler_civilian` (render.js HULL_ASSIGN), so
   * the Syndicate Crawler is the library id `crawler_syndicate` — the inside
   * of one is Syndicate whoever ends up flying it. */
  var SYNDICATE = { runner: true, enforcer: true, enforcerheavy: true, crawler_syndicate: true };
  var NAVY = { cutter: true, capital: true, carrier: true, crawler_navy: true };

  function paletteFor(hullId, libId) {
    if (SYNDICATE[hullId] || SYNDICATE[libId]) return 'syndicate';
    if (NAVY[hullId] || NAVY[libId]) return 'navy';
    return 'civil';
  }

  /* Base colours, which the indoor lamp-at-the-eye shading in gl.js takes
   * down to roughly 40–65 %. Chosen so the room seen from the seat comes
   * out where the old flat-filled cockpit was (#131a25 and thereabouts),
   * with the light now coming from the instruments and the strips.
   *
   * THE SYNDICATE'S are the hull art's own: `synHullPlating`, `syndicate_
   * hullDark`, `syndicate_truss` greys, and the reds from the Crawler's
   * containers and the enforcers' accent trim (#792220, #a72e29). Dark
   * grey everywhere you put a hand or a foot, red where something is
   * telling you something. */
  var PALETTES = {
    civil: {
      wall: '#2a3442', floor: '#222a35', ceil: '#1c232d', console: '#26303e', glare: '#10151c',
      overhead: '#1f2834', bulk: '#283240', jamb: '#1c242f', leaf: '#3b4656', leafEdge: '#e0a63a',
      trim: '!#7fe6c8', light: '!#d8ecff', rib: '#334050', passWall: '#2c3542', passFloor: '#20262f',
      lockWall: '#2e3640', hazard: '#d9a521', hazardDark: '#1d1f24', seat: '#2a2f38', seatPad: '#3b4250',
      hatch: '#3d4652', hatchLit: '!#7dffb0', hatchShut: '!#ff6b5a', locker: '#28303b', blanket: '#5a6b80'
    },
    navy: {
      wall: '#2e3744', floor: '#232a33', ceil: '#1e242c', console: '#29323e', glare: '#11161d',
      overhead: '#222a35', bulk: '#2d3643', jamb: '#1e252e', leaf: '#45505e', leafEdge: '#c9ced4',
      trim: '!#9fc4ff', light: '!#e8f0ff', rib: '#3a4553', passWall: '#303946', passFloor: '#22282f',
      lockWall: '#313a45', hazard: '#c9ced4', hazardDark: '#22406e', seat: '#262d36', seatPad: '#22406e',
      hatch: '#414b57', hatchLit: '!#8fd8ff', hatchShut: '!#ff6b5a', locker: '#2b333d', blanket: '#33528a'
    },
    syndicate: {
      wall: '#2b2c2e', floor: '#1c1c1d', ceil: '#18181a', console: '#2a2a2c', glare: '#0e0e0f',
      overhead: '#232325', bulk: '#2f3033', jamb: '#1a1a1b', leaf: '#393b3d', leafEdge: '#a72e29',
      trim: '!#c8362f', light: '!#ffe2da', rib: '#4b4d51', passWall: '#2d2e30', passFloor: '#1e1e1f',
      lockWall: '#303134', hazard: '#792220', hazardDark: '#1c1c1d', seat: '#1c1c1d', seatPad: '#5e1a18',
      hatch: '#3a3b3e', hatchLit: '!#ff8a7a', hatchShut: '!#ff3b30', locker: '#262628', blanket: '#7a2420'
    }
  };

  function sizeLetter(s) { return s === 'S' || s === 'M' || s === 'L' || s === 'XL' ? s : 'M'; }

  /* ---- the deck plan -----------------------------------------------------
   * `geom` is Render.cockpitGeometry(spec). `opts`: { hullId, libId, size,
   * key } — `key` is the cockpit's own seed (cockpitSeed: hull + bornId),
   * so the ship you learned is the ship you keep.
   *
   * Cockpit — sliding door — passage — sliding door — airlock, front to
   * back. The passage gets longer as the ship gets bigger; past that the
   * rest of a big ship's decks are for later. */
  function plan(geom, opts) {
    opts = opts || {};
    var rng = stream('shipdeck|' + (opts.key || opts.hullId || ''));
    var size = sizeLetter(opts.size);
    var k = geom.k;
    var rooms = [], doors = [], items = [];
    var H = geom.ceilY - geom.floorY;

    function room(id, kind, x0, x1, z0, z1, h, label) {
      var r = { id: id, kind: kind, x0: x0, x1: x1, z0: z0, z1: z1, y0: 0, y1: h, label: label };
      rooms.push(r);
      return r;
    }
    /* A sliding door across a wall of constant z. The box reaches 0.8 m
     * into each room, as walk.js's doors do, so the step across the sill is
     * always inside something; `shut` is what makes it a door rather than a
     * gap (Walk.standable honours it). */
    function slider(id, a, b, at, label) {
      var d = { id: id, a: a.id, b: b.id, axis: 'z', at: at, w: DOOR_HW * 2, h: DOOR_H,
                x0: -DOOR_HW, x1: DOOR_HW, z0: at - 0.8, z1: at + 0.8,
                slide: true, open: 0, shut: true, label: label };
      doors.push(d);
      return d;
    }

    /* Who works her: a station per hand, and a bunk per hand plus yours. */
    var roles = size === 'S' ? [] : stationRoles(opts.crew);
    var crewed = roles.length > 0 || (size !== 'S' && opts.crew && opts.crew.total > 0);
    var sides = geom.sideX >= 1.5 ? [-1, 1] : [-1];
    var perSide = Math.ceil(roles.length / sides.length);
    var deckLen = roles.length ? perSide * STATION_LEN + 1.0 : 0;
    var bunks = crewed ? (opts.crew.total || roles.length) + 1 : 0;
    var stacks = Math.ceil(bunks / 2);
    var twoWalls = stacks > 2;
    var perWall = twoWalls ? Math.ceil(stacks / 2) : stacks;
    var qLen = crewed ? Math.max(2.6, perWall * BUNK_LEN + 1.4) : 0;

    var bridge = room('cockpit', 'cockpit', -geom.sideX, geom.sideX, geom.bulkZ, geom.frontZ, H, 'Cockpit');
    /* The bridge door's wall: the cockpit's own bulkhead on a one-seat
     * ship, the aft end of the bridge deck on a crewed one. */
    var doorFront = geom.bulkZ, deck = null;
    if (deckLen) {
      var dz1 = geom.bulkZ - WALL_T, dz0 = dz1 - deckLen;
      deck = room('bridgedeck', 'bridgedeck', -geom.sideX, geom.sideX, dz0, dz1, H, 'Bridge');
      doorFront = dz0;
    }
    var len = PASSAGE_LEN[size] * (0.9 + 0.2 * rng.next());
    if (crewed) len = Math.max(len, qLen + 0.6);
    var p1 = doorFront - WALL_T, p0 = p1 - len;
    var passage = room('passage', 'passage', -PASSAGE_HW, PASSAGE_HW, p0, p1, PASSAGE_H, 'Passage');
    var l1 = p0 - WALL_T, l0 = l1 - LOCK_D;
    var lock = room('airlock', 'airlock', -LOCK_HW, LOCK_HW, l0, l1, LOCK_H, 'Airlock');
    /* The bulkhead has thickness, and the plan's rooms are boxes that must
     * meet at a shared wall for a door to join them. So each door's box is
     * stretched across the wall's thickness: from the cockpit's aft wall to
     * the passage's forward one. */
    var dBridge = slider('bridge', deck || bridge, passage, doorFront, 'Bridge door');
    dBridge.z0 = p1 - 0.8; dBridge.z1 = doorFront + 0.8; dBridge.wall = [p1, doorFront];
    var dLock = slider('lock', passage, lock, p0, 'Airlock door');
    dLock.z0 = l1 - 0.8; dLock.z1 = p0 + 0.8; dLock.wall = [l1, p0];
    /* The helm's arch: the old doorway, always open. */
    if (deck) {
      doors.push({ id: 'helm', a: bridge.id, b: deck.id, axis: 'z', at: geom.bulkZ, w: ARCH_HW * 2, h: DOOR_H,
                   x0: -ARCH_HW, x1: ARCH_HW, z0: deck.z1 - 0.8, z1: geom.bulkZ + 0.8,
                   wall: [deck.z1, geom.bulkZ], arch: true, open: 1, shut: false, label: 'Bridge' });
    }
    /* The quarters, off the port side of the passage, the door at their
     * forward end. Its leaves slide fore and aft into the passage wall. */
    var quarters = null;
    if (crewed) {
      var qx1 = -PASSAGE_HW - WALL_T, qz1 = p1 - 0.3;
      quarters = room('quarters', 'quarters', qx1 - QUARTERS_W, qx1, qz1 - qLen, qz1, QUARTERS_H, 'Crew quarters');
      var zc = qz1 - 0.7;
      doors.push({ id: 'quarters', a: passage.id, b: quarters.id, axis: 'x', at: -PASSAGE_HW, w: DOOR_HW * 2, h: DOOR_H,
                   x0: qx1 - 0.8, x1: -PASSAGE_HW + 0.8, z0: zc - DOOR_HW, z1: zc + DOOR_HW, zc: zc,
                   wall: [qx1, -PASSAGE_HW], slide: true, open: 0, shut: true, label: 'Quarters door' });
    }

    /* Things to use. */
    function item(kind, x, z, label, extra) {
      var it = { kind: kind, x: x, z: z, label: label };
      for (var key in (extra || {})) it[key] = extra[key];
      items.push(it);
      return it;
    }
    /* Furniture you cannot stand in: the seat, the dash and both side
     * consoles. Counters in walk.js's sense, [x0, z0, x1, z1]. */
    item('seat', 0, SEAT[1] - 0.05, 'Take the seat', { counter: SEAT.slice() });
    item('dash', 0, geom.dashNearZ, '', { counter: [-geom.dashHW, geom.dashNearZ - 0.02, geom.dashHW, geom.frontZ], silent: true });
    item('console', -geom.consoleX, geom.consoleZ0, '', { counter: [-geom.sideX, geom.consoleZ0, -geom.consoleX, geom.frontZ], silent: true });
    item('console', geom.consoleX, geom.consoleZ0, '', { counter: [geom.consoleX, geom.consoleZ0, geom.sideX, geom.frontZ], silent: true });
    /* The outer hatch is on the port side of the airlock. */
    item('hatch', -LOCK_HW + 0.35, (l0 + l1) / 2, 'Airlock hatch', { wallX: -LOCK_HW });

    /* THE STATIONS, down the deck's walls from the arch aft. Each is a
     * console against the wall and a seat facing it; the label says whose
     * it is, and that nobody is on watch until there is somebody to be. */
    var stations = [];
    roles.forEach(function (role, i) {
      var side = sides[i % sides.length], row = Math.floor(i / sides.length);
      var zc = deck.z1 - 0.15 - STATION_LEN * (row + 0.5);
      var xw = side * geom.sideX, xc = side * (geom.sideX - STATION_CON);
      var xs = side * (geom.sideX - STATION_CON - STATION_SEAT);
      var st = { role: role, side: side, z: zc, n: i };
      stations.push(st);
      item('console', (xw + xc) / 2, zc, '', { silent: true,
           counter: [Math.min(xw, xc), zc - 0.45, Math.max(xw, xc), zc + 0.45] });
      item('station', (xc + xs) / 2, zc, (ROLE_NAME[role] || role) + ' station',
           { role: role, counter: [Math.min(xc, xs), zc - 0.25, Math.max(xc, xs), zc + 0.25] });
    });

    /* THE QUARTERS: bunk stacks down the outboard wall from forward of
     * the door's line aft (and down the inboard wall aft of the door when
     * there are more than two stacks), lockers on the inboard wall, the
     * galley across the aft end. */
    var bunkAt = [];
    if (quarters) {
      var q = quarters;
      for (var s = 0; s < stacks; s++) {
        var inboard = twoWalls && s >= perWall;
        var n = inboard ? s - perWall : s;
        var bz1 = q.z1 - (inboard ? 1.4 : 0.2) - n * BUNK_LEN, bz0 = bz1 - BUNK_LEN + 0.1;
        var bx0 = inboard ? q.x1 - BUNK_W : q.x0, bx1 = bx0 + BUNK_W;
        bunkAt.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, inboard: inboard,
                      two: s * 2 + 1 < bunks });
        item('bunk', (bx0 + bx1) / 2, (bz0 + bz1) / 2, '', { silent: true, counter: [bx0, bz0, bx1, bz1] });
      }
      var galleyZ1 = q.z0 + 0.62;
      var gx0 = q.x0 + BUNK_W, gx1 = twoWalls ? q.x1 - BUNK_W : q.x1;
      item('galley', (gx0 + gx1) / 2, q.z0 + 0.3, 'Galley', { counter: [gx0, q.z0, gx1, galleyZ1] });
      if (!twoWalls) {
        item('lockers', q.x1 - 0.2, (galleyZ1 + q.z1 - 1.4) / 2, '', { silent: true,
             counter: [q.x1 - 0.4, galleyZ1, q.x1, q.z1 - 1.3] });
      }
    }

    /* Where you stand when you get up: in the bay between the seat and the
     * bulkhead, facing aft at the door. And where you come aboard: inside
     * the hatch, facing forward up the passage. */
    var bay = (SEAT[1] - 0.30 + geom.bulkZ + 0.30) / 2;
    var spawn = { x: 0, z: bay, yaw: Math.PI };
    var aboard = { x: -LOCK_HW + 0.9, z: (l0 + l1) / 2, yaw: 0 };

    /* The first three rooms are always cockpit, passage, airlock (the old
     * plan's order, which callers index); the bridge deck and quarters
     * follow when she has them. */
    var ORDER = { cockpit: 0, passage: 1, airlock: 2, bridgedeck: 3, quarters: 4 };
    rooms.sort(function (a, b) { return ORDER[a.kind] - ORDER[b.kind]; });

    return {
      kind: 'ship', hullId: opts.hullId || '', palette: paletteFor(opts.hullId, opts.libId),
      rooms: rooms, doors: doors, items: items, spawn: spawn, aboard: aboard,
      floorY: geom.floorY, k: k, bay: bay, size: size,
      stations: stations, bunks: bunks, bunkAt: bunkAt, sides: sides
    };
  }

  /* ---- the doors, every frame --------------------------------------------
   * Each sliding door opens while the walker is within reach of it and
   * shuts when they leave; `hold` keeps one open regardless (the bridge door
   * while you are standing up out of the seat, say). Eased on the wall
   * clock. The door is passable once it is most of the way open — a leaf
   * still across half the frame is still in the way. */
  function updateDoors(p, w, dt, hold) {
    hold = hold || {};
    for (var i = 0; i < p.doors.length; i++) {
      var d = p.doors[i];
      /* An arch has nothing to shut. */
      if (d.arch) { d.open = 1; d.shut = false; continue; }
      if (!d.slide) continue;
      /* The middle of the doorway: on a fore-and-aft wall, the middle of
       * its thickness at x = 0; on a side wall, the same across x at its zc. */
      var cx = d.axis === 'x' ? (d.wall[0] + d.wall[1]) / 2 : 0;
      var cz = d.axis === 'x' ? d.zc : (d.wall ? (d.wall[0] + d.wall[1]) / 2 : d.at);
      var near = w ? Math.hypot(w.x - cx, w.z - cz) < DOOR_REACH : false;
      var want = (near || hold[d.id]) ? 1 : 0;
      var step = Math.max(0, dt || 0) / DOOR_TIME;
      d.open = want > d.open ? Math.min(1, d.open + step) : Math.max(0, d.open - step);
      d.shut = d.open < 0.85;
    }
  }

  /* How far a leaf has travelled, in metres, for a door's `open`. Eased,
   * so a leaf starts and stops rather than snapping. */
  function leafTravel(open) {
    var t = Math.max(0, Math.min(1, open || 0));
    return DOOR_HW * t * t * (3 - 2 * t);
  }

  /* ---- mesh building -----------------------------------------------------
   * The renderer's format: { v: [[x,y,z]], f: [[a,b,c]], c: ['#hex' per
   * face] }, '!' for a self-lit face. Faces are double-sided in the shader,
   * so winding does not matter. */
  function mesh() { return { v: [], f: [], c: [] }; }
  function tri(m, a, b, c, col) {
    var n = m.v.length;
    m.v.push(a, b, c);
    m.f.push([n, n + 1, n + 2]);
    m.c.push(col);
  }
  function quad(m, a, b, c, d, col) { tri(m, a, b, c, col); tri(m, a, c, d, col); }
  function fan(m, pts, col) { for (var i = 1; i + 1 < pts.length; i++) tri(m, pts[0], pts[i], pts[i + 1], col); }
  /* An axis-aligned box, all six faces. */
  function box(m, x0, y0, z0, x1, y1, z1, col, top) {
    var p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
             [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    quad(m, p[0], p[1], p[2], p[3], col); quad(m, p[4], p[5], p[6], p[7], col);
    quad(m, p[0], p[1], p[5], p[4], col); quad(m, p[3], p[2], p[6], p[7], top || col);
    quad(m, p[0], p[3], p[7], p[4], col); quad(m, p[1], p[2], p[6], p[5], col);
  }

  /* A flat wall with a convex hole in it: the ring between `hole` and the
   * rectangle `rect`, both lying on one plane. `o`, `u`, `v` are the plane's
   * origin and two axes; points are given in that plane's own (s, t).
   *
   * Cut, not walked. For each edge of the hole, its share of the wall is the
   * part of the outline that lies between the two lines from the hole's
   * middle through that edge's ends, and on the far side of the edge. Each
   * share is the outline clipped by three straight lines, so it is convex
   * and fans cleanly; the shares meet along those lines and together are
   * exactly outline minus hole. (A first version walked the two rings round
   * by angle; with a big windscreen touching its own wall's edges it
   * overlapped itself and left gaps.) */
  function frame(m, o, u, v, hole, rect, col) {
    var cx = 0, cy = 0, i;
    for (i = 0; i < hole.length; i++) { cx += hole[i][0]; cy += hole[i][1]; }
    cx /= hole.length; cy /= hole.length;
    var H = ccw(hole), R = ccw(rect);
    function P(st) { return [o[0] + u[0] * st[0] + v[0] * st[1], o[1] + u[1] * st[0] + v[1] * st[1],
                              o[2] + u[2] * st[0] + v[2] * st[1]]; }
    for (i = 0; i < H.length; i++) {
      var a = H[i], b = H[(i + 1) % H.length];
      /* Keep the side where cross(dir, p - from) >= 0. */
      var piece = clip2(R, [cx, cy], [a[0] - cx, a[1] - cy]);                 // anticlockwise of c→a
      piece = clip2(piece, [cx, cy], [cx - b[0], cy - b[1]]);                // clockwise of c→b
      piece = clip2(piece, a, [a[0] - b[0], a[1] - b[1]]);                   // outside a→b
      for (var j = 1; j + 1 < piece.length; j++) tri(m, P(piece[0]), P(piece[j]), P(piece[j + 1]), col);
    }
  }
  function ccw(pts) {
    var s = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      s += p[0] * q[1] - q[0] * p[1];
    }
    return s >= 0 ? pts.slice() : pts.slice().reverse();
  }
  /* A 2D polygon cut by a line through `at` along `dir`, keeping the left. */
  function clip2(poly, at, dir) {
    var out = [];
    function side(p) { return dir[0] * (p[1] - at[1]) - dir[1] * (p[0] - at[0]); }
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var sa = side(a), sb = side(b);
      if (sa >= -1e-12) out.push(a);
      if ((sa >= -1e-12) !== (sb >= -1e-12)) {
        var t = sa / (sa - sb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scl(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(a) { var l = Math.sqrt(dot(a, a)) || 1; return scl(a, 1 / l); }
  /* A point list on a plane, in that plane's (s, t). */
  function toPlane(pts, o, u, v) {
    return pts.map(function (p) { var d = sub(p, o); return [dot(d, u), dot(d, v)]; });
  }

  /* ---- the meshes --------------------------------------------------------
   * Returns { room, portals, leaves: { bridge: [port, starboard], lock: […] },
   * seat, lampOk, lampNo }. Built once per cockpit key and cached by the
   * caller. */
  var EPS = 0.012;          // how far a wall stands behind the glass in it

  function meshes(geom, p) {
    var pal = PALETTES[p.palette] || PALETTES.civil;
    var g = geom, k = g.k;
    var room = mesh(), portals = mesh(), seat = mesh();
    var fy = g.floorY, cy = g.ceilY;
    var i;

    /* THE PANES, depth-only. Exactly the polygons the seat view has always
     * cut its windows from. */
    g.windows.forEach(function (w) { fan(portals, w, '#000000'); });

    /* The windscreen's wall: the frame round the main pane, up to the
     * ceiling, and the panels either side of the footwell below the sill. */
    var zf = g.frontZ + EPS;
    frame(room, [0, 0, zf], [1, 0, 0], [0, 1, 0],
          g.main.map(function (q) { return [q[0], q[1]]; }),
          [[-g.hingeX, g.sillY], [g.hingeX, g.sillY], [g.hingeX, cy], [-g.hingeX, cy]], pal.wall);
    quad(room, [-g.hingeX, fy, zf], [-g.footHW, fy, zf], [-g.footHW, g.sillY, zf], [-g.hingeX, g.sillY, zf], pal.wall);
    quad(room, [g.footHW, fy, zf], [g.hingeX, fy, zf], [g.hingeX, g.sillY, zf], [g.footHW, g.sillY, zf], pal.wall);

    /* The quarter-lights' walls, hinge to outer edge, each framing its whole
     * pane; then from the outer edge Q a short wall straight back along the
     * line of sight to the side wall at R — edge-on from the seat, so it
     * hides no glass (see cockpitGeometry). */
    var QX = g.quarterOuter[0], QZ = g.quarterOuter[1];
    [1, -1].forEach(function (side, qi) {
      var hinge = [side * g.hingeX, 0, g.frontZ], outer = [side * QX, 0, QZ];
      var u = unit(sub(outer, hinge)), v = [0, 1, 0];
      var nrm = unit(cross(u, v));
      if (dot(nrm, hinge) < 0) nrm = scl(nrm, -1);
      var o = add3(hinge, scl(nrm, EPS));
      var L = Math.sqrt(dot(sub(outer, hinge), sub(outer, hinge)));
      frame(room, o, u, v, toPlane(g.quarters[qi], hinge, u, v),
            [[0, fy], [L, fy], [L, cy], [0, cy]], pal.wall);
      var R = [side * g.sideX, 0, g.meetZ];
      quad(room, [outer[0], fy, outer[2]], [R[0], fy, R[2]], [R[0], cy, R[2]], [outer[0], cy, outer[2]], pal.wall);
    });

    /* The side walls, each framing its side window — or the part of it aft
     * of R; on a short-nosed hull the side window reaches forward of where
     * the wall turns, and that part of the pane stands just inside the
     * room's edge instead. */
    [-1, 1].forEach(function (side, si) {
      var o = [side * g.sideX, 0, 0], u = [0, 0, 1], v = [0, 1, 0];
      var hole = clipS(toPlane(g.sides[si], o, u, v), g.meetZ - 0.002);
      var rect = [[g.bulkZ, fy], [g.meetZ, fy], [g.meetZ, cy], [g.bulkZ, cy]];
      if (hole.length >= 3) frame(room, o, u, v, hole, rect, pal.wall);
      else quad(room, [o[0], fy, g.bulkZ], [o[0], fy, g.meetZ], [o[0], cy, g.meetZ], [o[0], cy, g.bulkZ], pal.wall);
    });

    /* Floor and ceiling over the cockpit's footprint. It bulges out at the
     * quarter-lights, so it is not convex — but every edge of it can be seen
     * from the seat, so a fan from the seat covers it exactly. */
    var foot = [[-g.sideX, g.bulkZ], [g.sideX, g.bulkZ], [g.sideX, g.meetZ], [QX, QZ],
                [g.hingeX, g.frontZ], [-g.hingeX, g.frontZ], [-QX, QZ], [-g.sideX, g.meetZ]];
    [[fy, pal.floor], [cy, pal.ceil]].forEach(function (lv) {
      for (var fi = 0; fi < foot.length; fi++) {
        var a2 = foot[fi], b2 = foot[(fi + 1) % foot.length];
        tri(room, [0, lv[0], 0], [a2[0], lv[0], a2[1]], [b2[0], lv[0], b2[1]], lv[1]);
      }
    });
    /* Two light strips down the ceiling, aft of the overhead panel. */
    [-1, 1].forEach(function (s) {
      var x0 = s * 0.50 * k, x1 = s * 0.56 * k, y = cy - 0.006;
      quad(room, [x0, y, g.bulkZ + 0.25], [x1, y, g.bulkZ + 0.25], [x1, y, g.overheadZ0 - 0.05],
           [x0, y, g.overheadZ0 - 0.05], pal.light);
    });

    /* THE FOOTWELL under the dash slot, floored with the landing window. */
    var fw = g.floorWin, fo = fw[3], fu = [1, 0, 0];
    var fv = unit(sub(fw[0], fw[3]));                // aft edge to forward edge, along the slope
    fv = unit(sub(fv, scl(fu, dot(fv, fu))));
    var yAt = function (z) { return fo[1] + (z - fo[2]) * (fv[1] / fv[2]); };
    var fz0 = g.dashNearZ, fz1 = g.footZ;
    var fn = unit(cross(fu, fv)); if (fn[1] > 0) fn = scl(fn, -1);
    var fOrig = add3([0, yAt(0), 0], scl(fn, EPS));
    var fHole = toPlane(fw, [0, yAt(0), 0], fu, fv);
    var tOf = function (z) { return (z / fv[2]); };
    frame(room, fOrig, fu, fv, fHole,
          [[-g.footHW, tOf(fz0)], [g.footHW, tOf(fz0)], [g.footHW, tOf(fz1)], [-g.footHW, tOf(fz1)]], pal.floor);
    /* The channel's walls run up to the underside of the desk and then
     * along under the sill, so there is no gap between them and the dash
     * for the sky to show through. */
    [-1, 1].forEach(function (s) {
      var x = s * g.footHW, zm = Math.min(g.frontZ, fz1);
      quad(room, [x, yAt(fz0), fz0], [x, yAt(zm), zm], [x, g.sillY - 0.005, zm], [x, g.deskY(fz0) - 0.005, fz0], pal.console);
      if (fz1 > zm + 1e-6) {
        quad(room, [x, yAt(zm), zm], [x, yAt(fz1), fz1], [x, g.sillY - 0.005, fz1], [x, g.sillY - 0.005, zm], pal.console);
      }
    });
    quad(room, [-g.footHW, yAt(fz1), fz1], [g.footHW, yAt(fz1), fz1], [g.footHW, g.sillY, fz1], [-g.footHW, g.sillY, fz1], pal.console);
    quad(room, [-g.footHW, g.sillY - 0.01, g.frontZ], [g.footHW, g.sillY - 0.01, g.frontZ],
         [g.footHW, g.sillY - 0.01, fz1], [-g.footHW, g.sillY - 0.01, fz1], pal.console);

    /* THE DASH: glare shield and desk, both split round the slot, and the
     * console front below the desk with a knee gap into the footwell. */
    g.dashFaces.forEach(function (f) { quad(room, f.pts[0], f.pts[1], f.pts[2], f.pts[3], pal[f.tone] || pal.console); });
    var dn = g.dashNearZ, dy = g.deskY(dn);
    quad(room, [-g.consoleX, fy, dn], [-g.footHW, fy, dn], [-g.footHW, dy, dn], [-g.consoleX, dy, dn], pal.console);
    quad(room, [g.footHW, fy, dn], [g.consoleX, fy, dn], [g.consoleX, dy, dn], [g.footHW, dy, dn], pal.console);

    /* THE SIDE CONSOLES: the sloped top the greebles sit on, the face
     * toward the seat, and both ends. */
    g.consoles.forEach(function (c) {
      var q = c.top;
      quad(room, q[0], q[1], q[2], q[3], pal.console);
      var inA = c.inner[0], inB = c.inner[1];
      quad(room, inA, inB, [inB[0], fy, inB[2]], [inA[0], fy, inA[2]], pal.console);
      [c.end, c.front].forEach(function (en) {
        quad(room, en[0], en[1], [en[1][0], fy, en[1][2]], [en[0][0], fy, en[0][2]], pal.console);
      });
    });

    /* THE OVERHEAD, and its skirts up to the ceiling so it is a box hung
     * from the roof rather than a slab floating in the air. */
    var oh = g.overhead;
    quad(room, oh[0], oh[1], oh[2], oh[3], pal.overhead);
    for (i = 0; i < 4; i++) {
      var a = oh[i], b = oh[(i + 1) % 4];
      quad(room, a, b, [b[0], cy, b[2]], [a[0], cy, a[2]], pal.overhead);
    }

    /* THE BULKHEADS, both faces, each with a door through it and the
     * pockets its leaves slide into between the faces. The passage side is
     * only as wide as the passage; the pockets run behind its own walls. */
    var dB = doorById(p, 'bridge'), dL = doorById(p, 'lock');
    var dH = doorById(p, 'helm'), dQ = doorById(p, 'quarters');
    var deck = roomByKind(p, 'bridgedeck'), qr = roomByKind(p, 'quarters');
    if (dH && deck) {
      /* The helm's bulkhead stays where the seat has always had it, rear
       * screens and all, with the doorway open as an arch; the bridge deck
       * is through it, and the sliding door at the deck's aft end. */
      bulkhead(room, pal, fy, dH.wall[1], g.sideX, cy, dH.wall[0], g.sideX, cy, true, [pal.bulk, pal.wall]);
      boxRoom(room, deck.x0, fy, deck.z0, deck.x1, cy, deck.z1, pal.wall, pal.floor, pal.ceil, ['z0', 'z1']);
      [-1, 1].forEach(function (s) {
        var x0 = s * 0.50 * k, x1 = s * 0.56 * k, y = cy - 0.006;
        quad(room, [x0, y, deck.z0 + 0.25], [x1, y, deck.z0 + 0.25], [x1, y, deck.z1 - 0.25], [x0, y, deck.z1 - 0.25], pal.light);
      });
      /* A hazard line down the middle of the deck: the way aft. */
      quad(room, [-0.03, fy + 0.004, deck.z0], [0.03, fy + 0.004, deck.z0], [0.03, fy + 0.004, deck.z1], [-0.03, fy + 0.004, deck.z1], pal.hazard);
      p.stations.forEach(function (st) { station(room, pal, fy, g.sideX, st); });
      bulkhead(room, pal, fy, dB.wall[1], g.sideX, cy, dB.wall[0], PASSAGE_HW, fy + PASSAGE_H, true, [pal.wall, pal.passWall]);
    } else {
      bulkhead(room, pal, fy, dB.wall[1], g.sideX, cy, dB.wall[0], PASSAGE_HW, fy + PASSAGE_H, true);
    }
    bulkhead(room, pal, fy, dL.wall[1], PASSAGE_HW, fy + PASSAGE_H, dL.wall[0], LOCK_HW, fy + LOCK_H, false);

    /* THE PASSAGE: ribs every metre and a bit, a light down the ceiling,
     * lockers along the starboard wall, a hazard edge to the floor. */
    var ps = p.rooms[1];
    boxRoom(room, ps.x0, fy, ps.z0, ps.x1, fy + PASSAGE_H, ps.z1, pal.passWall, pal.passFloor, pal.ceil,
            dQ ? ['z0', 'z1', 'x0'] : ['z0', 'z1']);
    if (dQ) {
      /* The port wall, with the quarters' door through it into a wall as
       * thick as a bulkhead; the quarters are built below. */
      sideDoorWall(room, -PASSAGE_HW, ps.z0, ps.z1, fy, fy + PASSAGE_H, dQ.zc, pal.passWall);
      sideDoorFrame(room, pal, fy, dQ.wall[0], dQ.wall[1], dQ.zc);
    }
    var z;
    for (z = ps.z1 - 0.6; z > ps.z0 + 0.3; z -= 1.25) {
      [-1, 1].forEach(function (s) {
        if (dQ && s < 0 && Math.abs(z - dQ.zc) < DOOR_HW + 0.15) return;
        var x = s * (PASSAGE_HW - 0.005);
        quad(room, [x, fy, z - 0.06], [x, fy, z + 0.06], [x, fy + PASSAGE_H, z + 0.06], [x, fy + PASSAGE_H, z - 0.06], pal.rib);
      });
      quad(room, [-PASSAGE_HW, fy + PASSAGE_H - 0.005, z - 0.06], [PASSAGE_HW, fy + PASSAGE_H - 0.005, z - 0.06],
           [PASSAGE_HW, fy + PASSAGE_H - 0.005, z + 0.06], [-PASSAGE_HW, fy + PASSAGE_H - 0.005, z + 0.06], pal.rib);
    }
    quad(room, [-0.06, fy + PASSAGE_H - 0.01, ps.z0 + 0.3], [0.06, fy + PASSAGE_H - 0.01, ps.z0 + 0.3],
         [0.06, fy + PASSAGE_H - 0.01, ps.z1 - 0.3], [-0.06, fy + PASSAGE_H - 0.01, ps.z1 - 0.3], pal.light);
    for (z = ps.z1 - 0.9; z > ps.z0 + 0.7; z -= 1.25) {
      var xl = PASSAGE_HW - 0.01;
      quad(room, [xl, fy + 0.25, z - 0.5], [xl, fy + 0.25, z + 0.5], [xl, fy + 1.95, z + 0.5], [xl, fy + 1.95, z - 0.5], pal.locker);
      quad(room, [xl - 0.002, fy + 1.0, z - 0.42], [xl - 0.002, fy + 1.0, z - 0.38],
           [xl - 0.002, fy + 1.2, z - 0.38], [xl - 0.002, fy + 1.2, z - 0.42], pal.trim);
    }
    [-1, 1].forEach(function (s) {
      var x0 = s * (PASSAGE_HW - 0.12), x1 = s * (PASSAGE_HW - 0.04), y = fy + 0.004;
      quad(room, [x0, y, ps.z0], [x1, y, ps.z0], [x1, y, ps.z1], [x0, y, ps.z1], pal.hazard);
    });

    /* THE AIRLOCK: hazard chevrons on the floor, the hatch on the port
     * wall with its status lamp, a light over it. */
    var lk = p.rooms[2];
    boxRoom(room, lk.x0, fy, lk.z0, lk.x1, fy + LOCK_H, lk.z1, pal.lockWall, pal.passFloor, pal.ceil, ['z1']);
    for (i = 0; i < 6; i++) {
      var zc = lk.z0 + 0.25 + i * 0.38;
      quad(room, [-0.9, fy + 0.004, zc], [0.9, fy + 0.004, zc], [0.9, fy + 0.004, zc + 0.16], [-0.9, fy + 0.004, zc + 0.16],
           i % 2 ? pal.hazardDark : pal.hazard);
    }
    var hz = (lk.z0 + lk.z1) / 2, hx = -LOCK_HW + 0.005;
    quad(room, [hx, fy, hz - HATCH_HW - 0.08], [hx, fy, hz + HATCH_HW + 0.08], [hx, fy + HATCH_H + 0.08, hz + HATCH_HW + 0.08],
         [hx, fy + HATCH_H + 0.08, hz - HATCH_HW - 0.08], pal.jamb);
    quad(room, [hx + 0.004, fy + 0.02, hz - HATCH_HW], [hx + 0.004, fy + 0.02, hz + HATCH_HW],
         [hx + 0.004, fy + HATCH_H, hz + HATCH_HW], [hx + 0.004, fy + HATCH_H, hz - HATCH_HW], pal.hatch);
    quad(room, [hx + 0.008, fy + 1.0, hz - 0.03], [hx + 0.008, fy + 1.0, hz + 0.03],
         [hx + 0.008, fy + 1.6, hz + 0.03], [hx + 0.008, fy + 1.6, hz - 0.03], pal.leafEdge);
    quad(room, [-0.5, fy + LOCK_H - 0.01, hz - 0.08], [0.5, fy + LOCK_H - 0.01, hz - 0.08],
         [0.5, fy + LOCK_H - 0.01, hz + 0.08], [-0.5, fy + LOCK_H - 0.01, hz + 0.08], pal.light);
    /* The hatch's lamp is its own little mesh, so it can say green or red
     * without rebuilding the room. */
    var lampAt = [hx + 0.01, fy + HATCH_H + 0.16, hz];
    var lampOk = mesh(), lampNo = mesh();
    [[lampOk, pal.hatchLit], [lampNo, pal.hatchShut]].forEach(function (pr) {
      quad(pr[0], [lampAt[0], lampAt[1] - 0.05, lampAt[2] - 0.12], [lampAt[0], lampAt[1] - 0.05, lampAt[2] + 0.12],
           [lampAt[0], lampAt[1] + 0.05, lampAt[2] + 0.12], [lampAt[0], lampAt[1] + 0.05, lampAt[2] - 0.12], pr[1]);
    });

    /* THE DOORS' LEAVES, each modelled where it sits shut; the caller moves
     * it along x by leafTravel(open). Inside the bulkhead's thickness, so
     * open it is between the two faces and out of sight. */
    function leaves(zWall0, zWall1) {
      var zc2 = (zWall0 + zWall1) / 2, out = [];
      [-1, 1].forEach(function (s) {
        var m = mesh();
        var x0 = s < 0 ? -DOOR_HW : 0, x1 = s < 0 ? 0 : DOOR_HW;
        box(m, x0, fy + 0.005, zc2 - LEAF_T / 2, x1, fy + DOOR_H - 0.01, zc2 + LEAF_T / 2, pal.leaf);
        /* A stripe down the meeting edge, and a rail across at hand height. */
        var xe0 = s < 0 ? -0.05 : 0.0, xe1 = s < 0 ? 0.0 : 0.05;
        [zc2 - LEAF_T / 2 - 0.002, zc2 + LEAF_T / 2 + 0.002].forEach(function (zf2) {
          quad(m, [xe0, fy + 0.05, zf2], [xe1, fy + 0.05, zf2], [xe1, fy + DOOR_H - 0.06, zf2], [xe0, fy + DOOR_H - 0.06, zf2], pal.leafEdge);
          quad(m, [x0 + 0.06, fy + 1.05, zf2], [x1 - 0.06, fy + 1.05, zf2], [x1 - 0.06, fy + 1.10, zf2], [x0 + 0.06, fy + 1.10, zf2], pal.rib);
        });
        out.push(m);
      });
      return out;
    }

    /* THE QUARTERS, and the leaves of their door, which slide fore and
     * aft into the passage wall. */
    var leavesQ = null;
    if (dQ && qr) {
      quartersMesh(room, pal, fy, qr, dQ, p);
      var xm = (dQ.wall[0] + dQ.wall[1]) / 2;
      leavesQ = [-1, 1].map(function (s) {
        var m = mesh();
        var z0 = s < 0 ? dQ.zc - DOOR_HW : dQ.zc, z1 = s < 0 ? dQ.zc : dQ.zc + DOOR_HW;
        box(m, xm - LEAF_T / 2, fy + 0.005, z0, xm + LEAF_T / 2, fy + DOOR_H - 0.01, z1, pal.leaf);
        var ze0 = s < 0 ? dQ.zc - 0.05 : dQ.zc, ze1 = s < 0 ? dQ.zc : dQ.zc + 0.05;
        [xm - LEAF_T / 2 - 0.002, xm + LEAF_T / 2 + 0.002].forEach(function (x) {
          quad(m, [x, fy + 0.05, ze0], [x, fy + 0.05, ze1], [x, fy + DOOR_H - 0.06, ze1], [x, fy + DOOR_H - 0.06, ze0], pal.leafEdge);
        });
        return m;
      });
    }

    /* THE SEAT, drawn only while you are out of it. */
    box(seat, -0.26, fy, -0.30, 0.26, fy + 0.46, 0.14, pal.seat, pal.seatPad);
    box(seat, -0.26, fy + 0.46, -0.40, 0.26, fy + 1.26, -0.30, pal.seat);
    quad(seat, [-0.22, fy + 0.55, -0.296], [0.22, fy + 0.55, -0.296], [0.22, fy + 1.20, -0.296], [-0.22, fy + 1.20, -0.296], pal.seatPad);
    box(seat, -0.15, fy + 1.30, -0.38, 0.15, fy + 1.52, -0.30, pal.seat, pal.seatPad);
    box(seat, -0.05, fy, -0.10, 0.05, fy + 0.30, 0.05, pal.rib);

    return {
      room: room, portals: portals, seat: seat, lampOk: lampOk, lampNo: lampNo,
      leaves: (function () {
        var lv = { bridge: leaves(dB.wall[0], dB.wall[1]), lock: leaves(dL.wall[0], dL.wall[1]) };
        if (leavesQ) lv.quarters = leavesQ;
        return lv;
      })()
    };
  }

  /* Clip a quarter pane, in its strip's (s, t), to the part forward of the
   * side wall (s <= L). */
  function clipS(poly, L) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var ain = a[0] <= L + 1e-9, bin = b[0] <= L + 1e-9;
      if (ain) out.push(a);
      if (ain !== bin) {
        var t = (L - a[0]) / (b[0] - a[0]);
        out.push([L, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  /* One bulkhead with a door through it: the face toward the front at z1
   * (half-width w1, up to y1), the face toward the back at z0 (w0, y0), and
   * the jambs and head of the opening between them. */
  function bulkhead(m, pal, fy, z1, w1, y1, z0, w0, y0, bridge, cols) {
    var dh = fy + DOOR_H;
    var c1 = cols ? cols[0] : (bridge ? pal.bulk : pal.passWall);
    var c0 = cols ? cols[1] : (bridge ? pal.passWall : pal.lockWall);
    [[z1, w1, y1, c1], [z0, w0, y0, c0]].forEach(function (f) {
      var z = f[0], w = f[1], top = f[2];
      quad(m, [-w, fy, z], [-DOOR_HW, fy, z], [-DOOR_HW, top, z], [-w, top, z], f[3]);
      quad(m, [DOOR_HW, fy, z], [w, fy, z], [w, top, z], [DOOR_HW, top, z], f[3]);
      if (top > dh + 0.001) quad(m, [-DOOR_HW, dh, z], [DOOR_HW, dh, z], [DOOR_HW, top, z], [-DOOR_HW, top, z], f[3]);
    });
    /* Jambs and head. */
    quad(m, [-DOOR_HW, fy, z0], [-DOOR_HW, fy, z1], [-DOOR_HW, dh, z1], [-DOOR_HW, dh, z0], pal.jamb);
    quad(m, [DOOR_HW, fy, z0], [DOOR_HW, fy, z1], [DOOR_HW, dh, z1], [DOOR_HW, dh, z0], pal.jamb);
    quad(m, [-DOOR_HW, dh, z0], [DOOR_HW, dh, z0], [DOOR_HW, dh, z1], [-DOOR_HW, dh, z1], pal.jamb);
    quad(m, [-DOOR_HW, fy + 0.002, z0], [DOOR_HW, fy + 0.002, z0], [DOOR_HW, fy + 0.002, z1], [-DOOR_HW, fy + 0.002, z1], pal.hazard);
    /* A lit trim round the opening on both faces: the door is the one
     * thing in the room that should be found in the dark. */
    [z1 + 0.004, z0 - 0.004].forEach(function (z) {
      var t = 0.035;
      quad(m, [-DOOR_HW - t, fy, z], [-DOOR_HW, fy, z], [-DOOR_HW, dh, z], [-DOOR_HW - t, dh, z], pal.trim);
      quad(m, [DOOR_HW, fy, z], [DOOR_HW + t, fy, z], [DOOR_HW + t, dh, z], [DOOR_HW, dh, z], pal.trim);
      quad(m, [-DOOR_HW - t, dh, z], [DOOR_HW + t, dh, z], [DOOR_HW + t, dh + t, z], [-DOOR_HW - t, dh + t, z], pal.trim);
    });
  }

  function doorById(p, id) {
    for (var i = 0; i < p.doors.length; i++) if (p.doors[i].id === id) return p.doors[i];
    return null;
  }
  function roomByKind(p, kind) {
    for (var i = 0; i < p.rooms.length; i++) if (p.rooms[i].kind === kind) return p.rooms[i];
    return null;
  }

  /* A wall of constant x from z0 to z1, with a doorway centred at zc. */
  function sideDoorWall(m, x, z0, z1, y0, y1, zc, col) {
    var a = zc - DOOR_HW, b = zc + DOOR_HW, dh = y0 + DOOR_H;
    if (a > z0) quad(m, [x, y0, z0], [x, y0, a], [x, y1, a], [x, y1, z0], col);
    if (z1 > b) quad(m, [x, y0, b], [x, y0, z1], [x, y1, z1], [x, y1, b], col);
    if (y1 > dh) quad(m, [x, dh, a], [x, dh, b], [x, y1, b], [x, y1, a], col);
  }
  /* The jambs, head, sill and lit trim of a doorway through a side wall
   * that runs from x = xa to x = xb. */
  function sideDoorFrame(m, pal, fy, xa, xb, zc) {
    var a = zc - DOOR_HW, b = zc + DOOR_HW, dh = fy + DOOR_H;
    quad(m, [xa, fy, a], [xb, fy, a], [xb, dh, a], [xa, dh, a], pal.jamb);
    quad(m, [xa, fy, b], [xb, fy, b], [xb, dh, b], [xa, dh, b], pal.jamb);
    quad(m, [xa, dh, a], [xb, dh, a], [xb, dh, b], [xa, dh, b], pal.jamb);
    quad(m, [xa, fy + 0.002, a], [xb, fy + 0.002, a], [xb, fy + 0.002, b], [xa, fy + 0.002, b], pal.hazard);
    [xa - 0.004, xb + 0.004].forEach(function (x) {
      var t = 0.035;
      quad(m, [x, fy, a - t], [x, fy, a], [x, dh, a], [x, dh, a - t], pal.trim);
      quad(m, [x, fy, b], [x, fy, b + t], [x, dh, b + t], [x, dh, b], pal.trim);
      quad(m, [x, dh, a - t], [x, dh, b + t], [x, dh + t, b + t], [x, dh + t, a - t], pal.trim);
    });
  }

  /* A crew station against a side wall (x = side * sideX): a console with
   * a sloped face and its screens, a kick-plate, and a seat facing it. The
   * screens say what the station is for: engineering amber, gunnery red. */
  var ROLE_SCREEN = { engineer: ['!#b07a22', '!#6fbf8a'], gunner: ['!#c0392b', '!#e0a63a'] };
  function station(m, pal, fy, sideX, st) {
    var s = st.side, zc = st.z;
    var xw = s * sideX, xc = s * (sideX - STATION_CON);
    var lo = Math.min(xw, xc), hi = Math.max(xw, xc);
    var deskY = fy + 0.76;
    box(m, lo, fy, zc - 0.45, hi, deskY, zc + 0.45, pal.console);
    /* The face: from the desk's inner edge up and back to the wall. */
    var xTop = s * (sideX - 0.06), yTop = fy + 1.50;
    var f0 = [xc, deskY, zc - 0.43], f1 = [xc, deskY, zc + 0.43], f2 = [xTop, yTop, zc + 0.43], f3 = [xTop, yTop, zc - 0.43];
    quad(m, f0, f1, f2, f3, pal.console);
    /* Cheeks either side, so the face is a housing and not a sheet. */
    [zc - 0.43, zc + 0.43].forEach(function (z) {
      tri(m, [xc, deskY, z], [xTop, yTop, z], [xw, deskY, z], pal.console);
      tri(m, [xw, deskY, z], [xTop, yTop, z], [xw, yTop, z], pal.console);
    });
    /* Two screens on the face, set a hair proud of it. */
    var scr = ROLE_SCREEN[st.role] || ['!#2f6f8f', '!#6fbf8a'];
    function onFace(u, v) {           // u along z (0..1), v up the face (0..1)
      return [xc + (xTop - xc) * v - s * 0.006, deskY + (yTop - deskY) * v, zc - 0.43 + 0.86 * u];
    }
    quad(m, onFace(0.08, 0.30), onFace(0.48, 0.30), onFace(0.48, 0.82), onFace(0.08, 0.82), scr[0]);
    quad(m, onFace(0.54, 0.30), onFace(0.92, 0.30), onFace(0.92, 0.82), onFace(0.54, 0.82), scr[1]);
    /* A strip of key lights along the desk's front edge. */
    quad(m, [xc - s * 0.002, deskY - 0.06, zc - 0.36], [xc - s * 0.002, deskY - 0.06, zc + 0.36],
         [xc - s * 0.002, deskY - 0.03, zc + 0.36], [xc - s * 0.002, deskY - 0.03, zc - 0.36], pal.trim);
    /* The seat, facing the console: pan, back on the aisle side, a post. */
    var xs = s * (sideX - STATION_CON - STATION_SEAT / 2);
    box(m, xs - 0.22, fy + 0.28, zc - 0.22, xs + 0.22, fy + 0.46, zc + 0.22, pal.seat, pal.seatPad);
    var xb = xs - s * 0.22, xb2 = xb - s * 0.08;
    box(m, Math.min(xb, xb2), fy + 0.46, zc - 0.22, Math.max(xb, xb2), fy + 1.12, zc + 0.22, pal.seat);
    box(m, xs - 0.04, fy, zc - 0.04, xs + 0.04, fy + 0.28, zc + 0.04, pal.rib);
  }

  /* The crew quarters: an inside-out room whose inboard wall has the door,
   * bunk stacks, lockers and the galley. */
  function quartersMesh(m, pal, fy, q, door, p) {
    var top = fy + QUARTERS_H;
    boxRoom(m, q.x0, fy, q.z0, q.x1, top, q.z1, pal.passWall, pal.passFloor, pal.ceil, ['x1']);
    sideDoorWall(m, q.x1, q.z0, q.z1, fy, top, door.zc, pal.passWall);
    /* Two lights down the ceiling over the aisle. */
    var ax = (q.x0 + BUNK_W + q.x1) / 2;
    quad(m, [ax - 0.05, top - 0.006, q.z0 + 0.4], [ax + 0.05, top - 0.006, q.z0 + 0.4],
         [ax + 0.05, top - 0.006, q.z1 - 0.4], [ax - 0.05, top - 0.006, q.z1 - 0.4], pal.light);
    p.bunkAt.forEach(function (b) {
      var levels = b.two ? [0.28, 1.22] : [0.28];
      levels.forEach(function (y) {
        box(m, b.x0, fy + y, b.z0, b.x1, fy + y + 0.12, b.z1, pal.rib);
        box(m, b.x0 + 0.04, fy + y + 0.12, b.z0 + 0.04, b.x1 - 0.04, fy + y + 0.24, b.z1 - 0.04, pal.blanket || pal.seatPad);
        /* A reading lamp on the wall at the head of each bunk. */
        var xw = b.inboard ? b.x1 - 0.004 : b.x0 + 0.004;
        quad(m, [xw, fy + y + 0.55, b.z1 - 0.32], [xw, fy + y + 0.55, b.z1 - 0.18],
             [xw, fy + y + 0.62, b.z1 - 0.18], [xw, fy + y + 0.62, b.z1 - 0.32], pal.light);
      });
      /* End boards, floor to the top of the stack, and the rail on the
       * upper bunk. */
      var yTop = fy + (b.two ? 1.85 : 0.9);
      [b.z0, b.z1].forEach(function (z) { box(m, b.x0, fy, z - 0.02, b.x1, yTop, z + 0.02, pal.locker); });
      if (b.two) {
        var xr = b.inboard ? b.x0 + 0.02 : b.x1 - 0.02;
        box(m, xr - 0.02, fy + 1.50, b.z0 + 0.3, xr + 0.02, fy + 1.54, b.z1 - 0.6, pal.rib);
      }
    });
    /* The galley across the aft end: a counter and a lit splashback. */
    var gx0 = q.x0 + BUNK_W, gx1 = p.bunkAt.some(function (b) { return b.inboard; }) ? q.x1 - BUNK_W : q.x1;
    box(m, gx0, fy, q.z0, gx1, fy + 0.92, q.z0 + 0.62, pal.console, pal.locker);
    quad(m, [gx0 + 0.05, fy + 1.05, q.z0 + 0.004], [gx1 - 0.05, fy + 1.05, q.z0 + 0.004],
         [gx1 - 0.05, fy + 1.12, q.z0 + 0.004], [gx0 + 0.05, fy + 1.12, q.z0 + 0.004], pal.trim);
    box(m, gx0 + 0.1, fy + 1.25, q.z0, gx1 - 0.1, fy + 1.85, q.z0 + 0.35, pal.locker);
    /* Lockers down the inboard wall aft of the door, when the bunks leave
     * it free. */
    if (!p.bunkAt.some(function (b) { return b.inboard; })) {
      var lz0 = q.z0 + 0.62, lz1 = door.zc - DOOR_HW - 0.15;
      for (var z = lz0; z + 0.55 <= lz1 + 1e-6; z += 0.6) {
        box(m, q.x1 - 0.4, fy, z, q.x1, fy + 1.95, z + 0.56, pal.locker);
        quad(m, [q.x1 - 0.404, fy + 1.0, z + 0.44], [q.x1 - 0.404, fy + 1.0, z + 0.48],
             [q.x1 - 0.404, fy + 1.2, z + 0.48], [q.x1 - 0.404, fy + 1.2, z + 0.44], pal.trim);
      }
    }
  }

  /* An inside-out box: the walls of a room. `skip` names the ends that are
   * bulkheads drawn elsewhere. */
  function boxRoom(m, x0, y0, z0, x1, y1, z1, wall, floor, ceil, skip) {
    skip = skip || [];
    quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], floor);
    quad(m, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], ceil);
    if (skip.indexOf('x0') < 0) quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], wall);
    if (skip.indexOf('x1') < 0) quad(m, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], wall);
    if (skip.indexOf('z0') < 0) quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], wall);
    if (skip.indexOf('z1') < 0) quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], wall);
  }

  var ShipDeck = {
    DOOR_HW: DOOR_HW, DOOR_H: DOOR_H, WALL_T: WALL_T, PASSAGE_LEN: PASSAGE_LEN,
    LOCK_HW: LOCK_HW, DOOR_REACH: DOOR_REACH, DOOR_TIME: DOOR_TIME, SEAT: SEAT,
    PALETTES: PALETTES, SYNDICATE: SYNDICATE, NAVY: NAVY,
    paletteFor: paletteFor, plan: plan, updateDoors: updateDoors, leafTravel: leafTravel,
    meshes: meshes, frame: frame,
    stationRoles: stationRoles, ROLE_NAME: ROLE_NAME, STATION_MAX: STATION_MAX,
    doorById: doorById, roomByKind: roomByKind
  };

  global.ShipDeck = ShipDeck;
  if (typeof module !== 'undefined' && module.exports) module.exports = ShipDeck;
})(typeof window !== 'undefined' ? window : globalThis);
