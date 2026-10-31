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

  /* ---- the way out (2026-10-26) ------------------------------------------
   * Astra: "create a set of stairs/ramp which can be opened from both
   * inside and outside the ship and which allows travel from inside to
   * outside of the ship", then "ensure that all models have a pathway to
   * the exterior which will seal against vacuum", and on the shape: "climb
   * into them from the ramp, up and into a room which seals the ramp and
   * then perpendicular to the ramp is another airlock door which opens into
   * the main interior of the ship." Asked, she chose a BELLY RAMP on every
   * hull, the two doors NEVER open together (every trip is a cycle), and
   * a suit put on in the airlock wherever the air outside is not air.
   *
   * So the airlock is a room off the passage's port side. Its inner door is
   * in the passage wall — a side door, across the ship — and the ramp runs
   * fore and aft in its floor: perpendicular, as she drew it. The ramp is
   * hinged at the landing's aft edge; raised, it IS the floor aft of the
   * landing and the seal under it; lowered, its far end drops through her
   * belly to the ground. `rampDrop` (opts) is how far the deck is above the
   * ground with her gear down, from her fitted model (render.js HULL_FIT);
   * a ship too tall for any ramp a room can hold gets a lift platform that
   * lowers straight down instead. */
  var LOCK_W = 2.4;                        // across the ship
  var LOCK_LAND = 1.6;                     // the landing: inner door to the ramp's head
  var RAMP_HW = { S: 0.6, M: 0.75, L: 0.85, XL: 1.0 };
  var RAMP_SLOPE = 30 * Math.PI / 180, STAIR_SLOPE = 42 * Math.PI / 180;
  var RAMP_MAX = 10.0;                     // m of ramp a room is allowed to hold
  var LIFT_LEN = 2.6;                      // m, a lift platform, fore and aft
  function rampShape(drop, size) {
    drop = drop > 0 ? drop : 2.6;
    var hw = RAMP_HW[size] || 0.75;
    var len = drop / Math.sin(RAMP_SLOPE);
    if (len <= RAMP_MAX) return { mode: 'ramp', len: Math.max(1.6, len), angle: Math.asin(Math.min(1, drop / Math.max(1.6, len))), drop: drop, hw: hw };
    len = drop / Math.sin(STAIR_SLOPE);
    if (len <= RAMP_MAX) return { mode: 'stair', len: len, angle: STAIR_SLOPE, drop: drop, hw: hw };
    return { mode: 'lift', len: LIFT_LEN, angle: 0, drop: drop, hw: Math.max(hw, 1.0) };
  }
  /* How near a sliding door has to be before it opens for you, and how long
   * it takes. Wall-clock seconds, like the station doors. */
  var DOOR_REACH = 1.7, DOOR_TIME = 0.7;
  /* The seat, where the plan has to keep you out of it. */
  var SEAT = [-0.30, -0.40, 0.30, 0.16];
  /* Where a body sitting in it is planted: on the pan, a hand's width in
   * front of the backrest (the pan runs -0.30 to 0.14, the back at -0.35).
   * Before 2026-10-25 a pilot at the helm was planted at the item's spot,
   * behind the backrest. */
  var SEAT_SIT_Z = -0.16;

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

  /* ---- the rest of her (2026-10-25) ----------------------------------------
   * Astra: "S ships aren't all one seaters. Some have crew positions for a
   * second pilot or gunner. M ships should have a small medbay, while S
   * ships have medical supplies in the cockpit." Asked which, and whether
   * the seat is needed to fly: the Wren and the Bollard have a co-pilot's
   * seat beside yours, the Lance a gunner's console behind you, the Talon
   * stays one seat — and the second seat is OPTIONAL. Nobody has to sit in
   * it (Crew.crewNeeded is unchanged); whoever you sign on does.
   *
   * And from M up, the rooms the crew's jobs were waiting for: an engine
   * room for the engineers' rounds, a medbay (small on an M, two beds from
   * L), and a cargo bay aft of the airlock, which is how cargo comes aboard.
   * Medbay and engine room off the passage to starboard.
   *
   * THE TURRET is a position for the one gunner a fitted turret takes
   * (crew.js turretCrewing), aft of the quarters to port, and it is there
   * only when a turret is fitted. Astra (same day): gunners otherwise work
   * the FORWARD guns and the seekers from the bridge's gunnery consoles
   * (crew.js gunnery) — no stock hull carries a turret, so a dome per
   * gunner, as first built, put every gunner in the wrong room. */
  var SECOND_SEAT = { wren: 'copilot', bollard: 'copilot', fighter: 'gunner' };
  var SIDE_GAP = 0.3;                      // m of passage wall between side rooms
  var MED = { M: [2.2, 2.4, 1], L: [2.6, 4.6, 2], XL: [2.8, 4.8, 2] };    // width, length, beds
  var ENGINE = { M: [2.6, 3.0], L: [3.0, 4.0], XL: [3.4, 5.0] };          // width, length
  var ENGINE_H = 2.7, TURRET_W = 2.2, TURRET_SEAT = 1.2, TURRET_MAX = 3;
  var CARGO = { M: [3.4, 4.0], L: [4.2, 6.0], XL: [5.2, 8.0] };           // width, length
  var CARGO_H = 2.9;
  /* The containers (cargokit.js) are a metre cube give or take, drawn at
   * the sheet's own size (the secure case's handles take it to 1.08 m, in
   * a 1.1 m slot); two of them stand 2.1 m, and a third would be into the
   * lights at 2.9. So a stack is two high now, not three (the 0.7 m boxes
   * before them went three), and a full hold is two to a slot. */
  var CRATE_SCALE = 1, CRATE_GAP = 0.02, CRATE_STACK = 2;
  var DOME_R = 0.42;                       // the turret's glass, over the gunner's head

  /* ---- decks, the lift and the tram (2026-10-25) ----------------------------
   * Astra (2026-10-24): "for the Capital and Carrier ships, there's a
   * conning tower, which means the Bridge is on the top of it, and an
   * elevator must be used to traverse from that to the flight deck or other
   * parts of the ship." The flight deck is the Carrier's hangar; the stops
   * are the bridge, the main deck and airlock, the hangar, and a junction
   * from which "the player can walk the rest of the way to engineering";
   * and the XL hulls with no tower (Meridian, Leviathan, Crawler) get decks
   * and a lift too. Asked on 2026-10-25: the lift is a REAL RIDE, the hangar
   * holds YOUR PARKED CRAFT, and the long way aft to engineering is a TRAM.
   *
   * ONE PLAN, SEVERAL DECKS. The plan still holds every room (the meshes and
   * the tests read it whole), and `decks` holds a walk.js plan per deck — a
   * view of the same rooms, doors and items, with its own floor height. The
   * walker only ever walks one of them, so the lift is the only way between
   * decks, and walls on another deck never get in the way.
   *
   * THE LAYOUT, in the ship's own x/z: the bridge deck runs forward of the
   * lift shaft, everything below runs aft of it. The car opens forward onto
   * the bridge deck's lobby and aft onto every other deck. So no two decks'
   * rooms are ever stacked where you could see one from the other. */
  var DECKED = { capital: true, carrier: true, meridian: true, leviathan: true, crawler: true };
  /* Bridge floor above the main deck, m (the brief's first guesses). */
  /* The Capital and the Carrier are drawn at their true length (render.js
   * TRUE_LEN, 2026-10-25) with the bridge up in the tower the models give
   * them, so their drops are measured off those: the Capital's observation
   * gallery stands ~41.5 m over a main deck at her waterline, the
   * Carrier's island cab ~35 m over one just under her flight deck. */
  var TOWER = { capital: 41.5, carrier: 35, leviathan: 8, crawler: 5, meridian: 4 };
  var LOBBY_L = 1.8, LOBBY_HW = 1.0;
  var CAR_HW = 1.0, CAR_D = 1.9, CAR_H = 2.4;
  var LIFT_SPEED = 3.0;                    // m/s, the car between decks
  /* A fast car in the tall towers, or forty metres is a quarter-minute in
   * a box. */
  var LIFT_FAST = { capital: 8.0, carrier: 8.0 };
  /* The two whose bridge is up in a conning tower with glass all round:
   * their bridge deck and lobby are glazed (meshes, towerGlass). */
  var TOWER_GLASS = { capital: true, carrier: true };
  var GLASS_SILL = 0.85, GLASS_HEAD = 0.25;
  function liftSpeed(hullId) { return LIFT_FAST[hullId] || LIFT_SPEED; }
  var DECK_H = 3.2;                        // main deck to the junction below it
  var PLAT_L = 3.2, PLAT_HW = 1.8;         // tram platforms
  var TRAM_HW = 1.3, TRAM_L = 3.0, TRAM_SPEED = 8.0;
  var SPINE = { capital: 38, carrier: 38, meridian: 34, leviathan: 34, crawler: 30 };
  var JUNCTION_ENGINE = [6.0, 7.0];        // the engine room down there: width, length
  var HANGAR = [22, 40, 9];                // the Carrier's: width, length, height
  var DECK_NAME = { bridge: 'Bridge', main: 'Main deck · airlock', junction: 'Engineering · tram', hangar: 'Hangar' };

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
    /* FITTED TO HER HULL (planFitted, 2026-10-31): rooms left out, and
     * rooms narrowed or shortened, so that every room is inside her skin.
     * Each is only ever made smaller than it would have been. */
    var omit = opts.omit || {};
    function W(kind, dflt) { var v = opts.roomW && opts.roomW[kind]; return v > 0 ? Math.min(dflt, v) : dflt; }
    function Ln(kind, dflt) { var v = opts.roomL && opts.roomL[kind]; return v > 0 ? Math.min(dflt, v) : dflt; }
    /* Which deck the next item is on (only decked hulls have more than one). */
    var itemDeck = 'bridge';
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
    var crewed = (roles.length > 0 || (size !== 'S' && opts.crew && opts.crew.total > 0)) && !omit.quarters;
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
    /* The rooms off the passage (2026-10-25), measured first because the
     * passage has to be long enough for both of its walls: the quarters
     * and the turret to port, the medbay and the engine room to starboard. */
    var big = size !== 'S';
    var decked = !!(DECKED[opts.hullId] && opts.decks !== false);
    var gunners = big && opts.turret && !omit.turret ? 1 : 0;
    var tLen = gunners ? 0.6 + gunners * TURRET_SEAT + 0.2 : 0;
    /* On a decked hull the engine room is far aft, down at the junction. */
    var med = big && !omit.medbay ? MED[size].slice() : null, eng = big && !decked && !omit.engine ? ENGINE[size].slice() : null;
    if (med) med[0] = W('medbay', med[0]);
    if (eng) eng[0] = W('engine', eng[0]);
    /* The airlock is the last room down the port side, on every hull. */
    var rs = rampShape(opts.rampDrop, size);
    /* Fitted (planFitted): a narrower ramp, where her hull will not take
     * an airlock as wide as the usual one round it. */
    if (opts.rampHW > 0) rs.hw = Math.min(rs.hw, opts.rampHW);
    /* The room is sized for `rampDrop` (hullfit's, rounded up a quarter
     * metre so the fit tool and the game build the same room); the ramp is
     * angled for her true height, `rampReach`, so its foot is on the ground
     * and not a hand's width under it. */
    if (opts.rampReach > 0 && rs.mode !== 'lift') {
      rs.angle = Math.asin(Math.min(1, opts.rampReach / rs.len));
      rs.drop = opts.rampReach;
    } else if (opts.rampReach > 0) rs.drop = opts.rampReach;
    var lockLen = LOCK_LAND + rs.len + 0.25;
    var portNeed = (crewed ? qLen : 0) + (tLen ? SIDE_GAP + WALL_T + tLen : 0) + SIDE_GAP + WALL_T + lockLen;
    var stbdNeed = big ? (med ? med[1] : 0) + (eng ? (med ? SIDE_GAP + WALL_T : 0) + eng[1] : 0) : 0;
    var len = PASSAGE_LEN[size] * (0.9 + 0.2 * rng.next());
    if (crewed) len = Math.max(len, qLen + 0.6);
    len = Math.max(len, portNeed + 0.6);
    if (big) len = Math.max(len, stbdNeed + 0.6);
    /* A ship bigger than her hull's fitted length (render.js shipInterior,
     * 2026-10-29) is run on aft: her hold takes the extra, or with no hold
     * her passage does. No draw is taken for it. */
    var stretch = opts.stretch > 0 ? opts.stretch : 0;
    if (!big) len += stretch;
    /* The lift (decked hulls): a lobby aft of the bridge door, then the
     * car; the main deck's passage starts aft of the car, a deck down. */
    var lobby = null, cars = {}, carZ = null;
    var p1 = doorFront - WALL_T;
    if (decked) {
      lobby = room('lobby', 'lobby', -LOBBY_HW, LOBBY_HW, p1 - LOBBY_L, p1, PASSAGE_H, 'Lift lobby');
      carZ = [lobby.z0 - WALL_T - CAR_D, lobby.z0 - WALL_T];
      p1 = carZ[0] - WALL_T;
    }
    var p0 = p1 - len;
    var passage = room('passage', 'passage', -PASSAGE_HW, PASSAGE_HW, p0, p1, PASSAGE_H, 'Passage');
    /* The bulkhead has thickness, and the plan's rooms are boxes that must
     * meet at a shared wall for a door to join them. So each door's box is
     * stretched across the wall's thickness: from the cockpit's aft wall to
     * the passage's forward one. */
    var dBridge = slider('bridge', deck || bridge, lobby || passage, doorFront, 'Bridge door');
    var bAft = lobby ? lobby.z1 : p1;
    dBridge.z0 = bAft - 0.8; dBridge.z1 = doorFront + 0.8; dBridge.wall = [bAft, doorFront];
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
      quarters = room('quarters', 'quarters', qx1 - W('quarters', QUARTERS_W), qx1, qz1 - qLen, qz1, QUARTERS_H, 'Crew quarters');
      quarters.side = -1;
      var zc = qz1 - 0.7;
      doors.push({ id: 'quarters', a: passage.id, b: quarters.id, axis: 'x', at: -PASSAGE_HW, w: DOOR_HW * 2, h: DOOR_H,
                   x0: qx1 - 0.8, x1: -PASSAGE_HW + 0.8, z0: zc - DOOR_HW, z1: zc + DOOR_HW, zc: zc,
                   wall: [qx1, -PASSAGE_HW], slide: true, open: 0, shut: true, label: 'Quarters door' });
    }

    /* A room off the passage, its door at its forward end, as the
     * quarters' is. `side` -1 for port, 1 for starboard; `z1` its forward
     * wall. The door's box spans the wall's thickness, as every door's does. */
    function sideRoom(id, kind, side, z1, width, length, h, label, doorLabel) {
      var xin = side * (PASSAGE_HW + WALL_T);
      var x0 = side < 0 ? xin - width : xin, x1 = side < 0 ? xin : xin + width;
      var r = room(id, kind, x0, x1, z1 - length, z1, h, label);
      var zc = z1 - 0.7;
      var wall = side < 0 ? [xin, -PASSAGE_HW] : [PASSAGE_HW, xin];
      doors.push({ id: id, a: passage.id, b: r.id, axis: 'x', at: side * PASSAGE_HW, w: DOOR_HW * 2, h: DOOR_H,
                   x0: wall[0] - 0.8, x1: wall[1] + 0.8, z0: zc - DOOR_HW, z1: zc + DOOR_HW, zc: zc,
                   wall: wall, side: side, slide: true, open: 0, shut: true, label: doorLabel });
      r.side = side;
      return r;
    }
    var turret = null, medbay = null, engine = null, cargo = null;
    if (big) {
      var zTop = p1 - SIDE_GAP;
      if (gunners) {
        var tz1 = quarters ? quarters.z0 - SIDE_GAP - WALL_T : zTop;
        turret = sideRoom('turret', 'turret', -1, tz1, W('turret', TURRET_W), tLen, QUARTERS_H, 'Turret', 'Turret door');
      }
      if (med) medbay = sideRoom('medbay', 'medbay', 1, zTop, med[0], med[1], QUARTERS_H, 'Medbay', 'Medbay door');
      if (eng) engine = sideRoom('engine', 'engine', 1, medbay ? medbay.z0 - SIDE_GAP - WALL_T : zTop, eng[0], eng[1], ENGINE_H,
                                 'Engine room', 'Engine room door');
      /* The cargo bay, off the passage's aft end (2026-10-26: it was aft of
       * the airlock, which now stands beside the passage). */
      /* `cargoHW`: a hold widened to her own beam (render.js shipInterior,
       * a ship bigger than her hull's fitted length). */
      if (!omit.cargo) {
        /* Fitted: `roomW.cargo` is a half-width, `roomL.cargo` a length. */
        var cz1 = p0 - WALL_T, cw = W('cargo', Math.max(Math.max(CARGO[size][0], 2 * LOCK_HW) / 2, opts.cargoHW > 0 ? opts.cargoHW : 0));
        var ch = opts.roomH && opts.roomH.cargo > 0 ? Math.min(CARGO_H, opts.roomH.cargo) : CARGO_H;
        cargo = room('cargo', 'cargo', -cw, cw, cz1 - Ln('cargo', CARGO[size][1] + stretch), cz1, ch, 'Cargo bay');
        var dCargo = slider('cargo', passage, cargo, p0, 'Cargo door');
        dCargo.z0 = cz1 - 0.8; dCargo.z1 = p0 + 0.8; dCargo.wall = [cz1, p0];
      }
    }
    /* THE AIRLOCK, last down the port side: the inner door in the passage
     * wall at its forward end, the landing inside it, the ramp aft of that
     * in the floor. Its door is `lock` and it SEALS: airlock.js holds it
     * shut whenever the room is not at the ship's own pressure. */
    var portTop = turret ? turret.z0 - SIDE_GAP - WALL_T
                : quarters ? quarters.z0 - SIDE_GAP - WALL_T : p1 - SIDE_GAP;
    var lock = sideRoom('airlock', 'airlock', -1, portTop, Math.max(2 * rs.hw + 0.3, W('airlock', LOCK_W)), lockLen, LOCK_H, 'Airlock', 'Airlock door');
    var dLock = doors[doors.length - 1];
    dLock.id = 'lock'; dLock.seal = true;
    var hinge = lock.z1 - LOCK_LAND, rxc = (lock.x0 + lock.x1) / 2;
    var rampSpec = { room: lock.id, xc: rxc, hw: rs.hw, x0: rxc - rs.hw, x1: rxc + rs.hw,
                     hinge: hinge, len: rs.len, foot: hinge - rs.len, angle: rs.angle, mode: rs.mode, drop: rs.drop,
                     /* Where it lands with her gear down: run along the floor below. */
                     run: rs.mode === 'lift' ? 0 : rs.len * Math.cos(rs.angle) };

    /* Things to use. */
    function item(kind, x, z, label, extra) {
      var it = { kind: kind, x: x, z: z, label: label, deck: itemDeck };
      for (var key in (extra || {})) it[key] = extra[key];
      items.push(it);
      return it;
    }
    /* Furniture you cannot stand in: the seat, the dash and both side
     * consoles. Counters in walk.js's sense, [x0, z0, x1, z1]. */
    item('seat', 0, SEAT[1] - 0.05, 'Take the seat', { counter: SEAT.slice(), sitZ: SEAT_SIT_Z });
    item('dash', 0, geom.dashNearZ, '', { counter: [-geom.dashHW, geom.dashNearZ - 0.02, geom.dashHW, geom.frontZ], silent: true });
    item('console', -geom.consoleX, geom.consoleZ0, '', { counter: [-geom.sideX, geom.consoleZ0, -geom.consoleX, geom.frontZ], silent: true });
    item('console', geom.consoleX, geom.consoleZ0, '', { counter: [geom.consoleX, geom.consoleZ0, geom.sideX, geom.frontZ], silent: true });
    /* The airlock's controls on its outboard wall at the landing (kind
     * `hatch`, as the old outer hatch was: whatever asked for the way out
     * still finds it), and the ramp's head in the floor aft of them. */
    itemDeck = 'main';
    item('hatch', lock.x0 + 0.3, dLock.zc, 'Airlock controls', { wallX: lock.x0 });
    item('ramp', rxc, hinge - 0.35, 'Ramp', { floor: true });

    /* THE STATIONS, down the deck's walls from the arch aft. Each is a
     * console against the wall and a seat facing it; the label says whose
     * it is, and that nobody is on watch until there is somebody to be. */
    var stations = [];
    itemDeck = 'bridge';
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
    itemDeck = 'main';
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

    /* THE NEW ROOMS' FURNITURE (2026-10-25). Its own seeded stream, so
     * adding it moved nothing the old stream already decided. */
    var rng2 = stream('shipdeck2|' + (opts.key || opts.hullId || ''));
    var turrets = [], beds = [], crates = [], drive = null;
    if (turret) {
      /* The seat (one: a ship carries one turret) on the outboard half,
       * under its dome, a sight on an arm in front of it; aft, so the door
       * at the forward end is clear. Written for several should a ship ever
       * carry more. */
      for (var ti = 0; ti < gunners; ti++) {
        var tzc = turret.z0 + 0.6 + ti * TURRET_SEAT, tx = turret.x0 + 0.75;
        var tu = item('turret', tx, tzc, 'Turret seat', { role: 'gunner', yaw: 0, n: ti,
                      counter: [tx - 0.3, tzc - 0.3, tx + 0.3, tzc + 0.62] });
        turrets.push(tu);
      }
    }
    if (medbay) {
      /* Beds along the outboard wall, a cabinet on the inboard one aft of
       * the door. */
      var mOut = medbay.x1, nb = med[2];
      for (var bi = 0; bi < nb; bi++) {
        var mbz0 = medbay.z0 + 0.2 + bi * 2.2, mb = { x0: mOut - 0.9, x1: mOut, z0: mbz0, z1: mbz0 + 2.0 };
        beds.push(mb);
        item('medbed', (mb.x0 + mb.x1) / 2, (mb.z0 + mb.z1) / 2, '', { silent: true, counter: [mb.x0, mb.z0, mb.x1, mb.z1] });
      }
      var cabZ1 = Math.min(medbay.z1 - 0.7 - DOOR_HW - 0.15, medbay.z0 + 1.3);
      item('medcab', medbay.x0 + 0.22, (medbay.z0 + 0.2 + cabZ1) / 2, 'Medical cabinet',
           { counter: [medbay.x0, medbay.z0 + 0.2, medbay.x0 + 0.45, cabZ1] });
    }
    if (engine) {
      /* The drive trunk down the outboard wall, the console on the aft
       * wall, inboard of it. */
      var dDep = size === 'M' ? 1.0 : 1.2;
      drive = { x0: engine.x1 - dDep, x1: engine.x1, z0: engine.z0 + 0.3, z1: engine.z1 - 0.3, bands: 2 + Math.floor(rng2.next() * 3) };
      item('drive', engine.x1 - dDep / 2, (engine.z0 + engine.z1) / 2, '', { silent: true,
           counter: [drive.x0, drive.z0, drive.x1, drive.z1] });
      var ecx0 = engine.x0 + 0.25, ecx1 = Math.min(drive.x0 - 0.5, ecx0 + 1.2);
      item('engine', (ecx0 + ecx1) / 2, engine.z0 + 0.3, 'Drive console', { yaw: Math.PI,
           counter: [ecx0, engine.z0, ecx1, engine.z0 + 0.55] });
    }
    if (cargo) {
      /* Crates in stacks down both walls, one or two high (CRATE_STACK),
       * the aisle clear; the manifest terminal by the door. */
      for (var cz = cargo.z0 + 0.3; cz + 1.1 <= cargo.z1 - 1.3; cz += 1.3) {
        [-1, 1].forEach(function (sd) {
          /* Every draw is still taken, loaded hold or not, so the rest of
           * this stream decides what it always decided. */
          var skip = rng2.next() < 0.15;
          var x0c = sd < 0 ? cargo.x0 + 0.1 : cargo.x1 - 1.2, cr = { x0: x0c, x1: x0c + 1.1, z0: cz, z1: cz + 1.1,
               high: Math.min(CRATE_STACK, 1 + Math.floor(rng2.next() * 3)), tint: rng2.next() };
          if (!skip || opts.load) crates.push(cr);
        });
      }
      /* A WIDENED HOLD (2026-10-29) has room for more than two walls of
       * crates: further rows inboard of them, a 1.8 m aisle kept clear down
       * the middle. Their own stream, so a hold of the usual width draws
       * nothing new and is the hold it always was. */
      var aisle = 0.9, inner = [];
      for (var ix0 = cargo.x0 + 1.3; ix0 + 1.1 <= -aisle; ix0 += 1.3) inner.push(ix0);
      for (var ix1 = cargo.x1 - 1.2 - 1.3; ix1 >= aisle; ix1 -= 1.3) inner.push(ix1);
      if (inner.length && opts.cargoHW > 0) {
        var rng3 = stream('shipdeck3|' + (opts.key || opts.hullId || ''));
        for (var cz2 = cargo.z0 + 0.3; cz2 + 1.1 <= cargo.z1 - 1.3; cz2 += 1.3) {
          inner.forEach(function (xi) {
            var skip2 = rng3.next() < 0.15;
            var cr2 = { x0: xi, x1: xi + 1.1, z0: cz2, z1: cz2 + 1.1, high: Math.min(CRATE_STACK, 1 + Math.floor(rng3.next() * 3)), tint: rng3.next() };
            if (!skip2 || opts.load) crates.push(cr2);
          });
        }
      }
      /* WHAT IS IN THE HOLD, NOT A RANDOM PILE (2026-10-28). The crates were
       * a seeded scatter, the same whatever she carried — "cargo crates are
       * random, they don't reflect what's actually in your hold". With
       * `opts.load` ({ fill 0..1, lines: [{ cid, t }] }) every slot down
       * both walls is a stack of up to CRATE_STACK, filled from the door aft in
       * proportion to how full she is, and each crate is tinted by what is
       * in it, so a hold of one cargo reads as one colour and a mixed one as
       * bands of several. Without it (no ship to ask), the old scatter. */
      if (opts.load) {
        /* FROM THE DOOR (2026-10-29). The comment above always said so; the
         * slots were filled from the far end, which left a half-empty hold
         * reading as an empty corridor from its door. Nearest the door
         * first, the wall rows before the inboard ones. */
        crates.sort(function (a, b) {
          return (b.z1 - a.z1) || (Math.abs(b.x0 + b.x1) - Math.abs(a.x0 + a.x1));
        });
        var units = crates.length * CRATE_STACK, full = Math.round(units * Math.max(0, Math.min(1, opts.load.fill || 0)));
        var lines = (opts.load.lines || []).filter(function (l) { return l.t > 0; });
        var total = lines.reduce(function (a, l) { return a + l.t; }, 0) || 1;
        /* EVERY LINE OF HER MANIFEST GETS CRATES (2026-10-29: "make sure that
         * the boxes in the hold are representative of what is actually in
         * the hold"). Each line its share of the filled units, at least one
         * however small, and its own stacks: a stack holds one cargo, so a
         * crate of medicine is never painted the colour of the ore beside
         * it, and a few tonnes of it are never rounded away. */
        if (lines.length && full < lines.length) full = Math.min(units, lines.length);
        var want = lines.map(function (l) { return Math.max(1, Math.round(full * l.t / total)); });
        var over = want.reduce(function (a, u) { return a + u; }, 0) - full;
        for (var wi = 0; over > 0 && wi < want.length * 4; wi++) {
          var most = want.indexOf(Math.max.apply(null, want));
          if (want[most] > 1) { want[most]--; over--; } else break;
        }
        /* Every line starts its own stack, so a line's odd last unit costs a
         * whole slot. Near full, those can add up to more slots than the
         * hold has, and the last line would run out of crates and its label
         * short of its tonnes; take units off the biggest line until the
         * stacks fit (2026-10-30, when stacks went from three to two). */
        var slotsFor = function () {
          return want.reduce(function (a, u) { return a + Math.ceil(u / CRATE_STACK); }, 0);
        };
        for (var wj = 0; slotsFor() > crates.length && wj < units; wj++) {
          var most2 = want.indexOf(Math.max.apply(null, want));
          if (want[most2] > 1) want[most2]--; else break;
        }
        var ci = 0, unitT = opts.load.cap > 0 ? opts.load.cap / units : 0;
        crates.forEach(function (cr) { cr.high = 0; cr.levels = []; });
        if (lines.length <= crates.length) {
          lines.forEach(function (l, li) {
            var left = want[li];
            while (left > 0 && ci < crates.length) {
              var cr = crates[ci++], h = Math.min(CRATE_STACK, left);
              cr.high = h; left -= h;
              cr.cid = l.cid; cr.tint = (hash('crate|' + l.cid) % 997) / 997;
              /* What this stack holds, in the line's own tonnes. */
              cr.tonnes = l.t * h / want[li];
              for (var lv = 0; lv < h; lv++) cr.levels.push({ cid: l.cid, t: l.t / want[li] });
            }
          });
        } else {
          /* MORE CARGOES THAN STACKS (2026-10-30). A small hold — a Mule's
           * has two slots — with a manifest of nine lines could only ever
           * show two of them, one container each. Each container says what
           * is in it now, so a stack need not be one cargo: here every
           * container is its own line, the biggest lines first, as many as
           * the hold has room for, two to a stack. What does not fit is
           * still on the manifest terminal by the door. */
          var order = lines.map(function (l, i) { return i; })
            .sort(function (a, b) { return lines[b].t - lines[a].t; });
          var budget = Math.min(units, Math.max(full, lines.length));
          var per = order.map(function () { return 1; });
          var spare = budget - per.length;
          if (spare < 0) { order = order.slice(0, budget); per = per.slice(0, budget); spare = 0; }
          /* The rest of the budget to the biggest lines, by size. */
          var totT = order.reduce(function (a, i) { return a + lines[i].t; }, 0) || 1;
          order.forEach(function (i, k) {
            var extra = Math.min(spare, Math.floor(spare * lines[i].t / totT));
            per[k] += extra;
          });
          var used = per.reduce(function (a, u) { return a + u; }, 0);
          for (var k2 = 0; used < budget && k2 < per.length; k2++, used++) per[k2]++;
          var slot = 0;
          order.forEach(function (i, k) {
            for (var u = 0; u < per[k] && slot < units; u++, slot++) {
              var cr2 = crates[Math.floor(slot / CRATE_STACK)];
              cr2.levels.push({ cid: lines[i].cid, t: lines[i].t / per[k] });
              cr2.high = cr2.levels.length;
            }
          });
          crates.forEach(function (cr3) {
            if (!cr3.levels.length) return;
            cr3.cid = cr3.levels[0].cid; cr3.tint = (hash('crate|' + cr3.cid) % 997) / 997;
            cr3.tonnes = cr3.levels.reduce(function (a, v) { return a + v.t; }, 0);
            cr3.mixed = cr3.levels.some(function (v) { return v.cid !== cr3.cid; });
          });
        }
        crates = crates.filter(function (cr) { return cr.high > 0; });
        if (!unitT) crates.forEach(function (cr) { delete cr.tonnes; });
      }
      /* A crate with a known cargo says what it is when you face it. */
      var ECO = global.Economy, nameOf = function (cid) {
        var c = ECO && ECO.BY_ID ? ECO.BY_ID[cid] : null;
        return c ? c.name : cid;
      };
      crates.forEach(function (cr) {
        /* A tenth of a tonne under a hundred: with stacks of two there are
         * more of them, and whole tonnes each added up to five short of a
         * 300 t line. */
        var tFmt = function (t) { return (t >= 100 ? Math.round(t) : t.toFixed(1)) + ' t'; };
        var lbl = !cr.cid ? ''
          : cr.mixed ? cr.levels.map(function (v) { return nameOf(v.cid) + (unitT ? ' ' + tFmt(v.t) : ''); }).join('  /  ')
          : nameOf(cr.cid) + (cr.tonnes ? '  ·  ' + tFmt(cr.tonnes) : '');
        /* What is in it, for a boarder pointing at it (boarding part 3):
         * the containers' cargoes and the stack's tonnes. */
        item('crate', cr.x0 + 0.55, cr.z0 + 0.55, lbl, { silent: !lbl, counter: [cr.x0, cr.z0, cr.x1, cr.z1], cid: cr.cid || null,
                                                         levels: (cr.levels || []).map(function (v) { return { cid: v.cid, t: v.t }; }),
                                                         tonnes: cr.tonnes || 0 });
      });
      item('cargo', cargo.x1 - 0.35, cargo.z1 - 0.25, 'Cargo manifest', { counter: [cargo.x1 - 0.6, cargo.z1 - 0.4, cargo.x1, cargo.z1] });
    }
    itemDeck = 'bridge';
    /* S: the second seat, and the medical supplies. */
    var second = size === 'S' ? (SECOND_SEAT[opts.hullId] || null) : null, seat2 = null;
    if (second === 'copilot') {
      var cx2 = Math.min(geom.sideX * 0.62, geom.consoleX - 0.02);
      /* Set back from the console where the cockpit is short in the nose. */
      var dz2 = Math.min(0, geom.consoleZ0 - 0.04 - 0.14);
      seat2 = item('copilot', cx2, SEAT[1] - 0.05, 'Co-pilot\'s seat', { role: 'pilot', yaw: 0, dz: dz2,
                   sitZ: SEAT_SIT_Z + dz2,
                   counter: [cx2 - 0.26, SEAT[1] + dz2, cx2 + 0.26, Math.min(SEAT[3], geom.consoleZ0 - 0.02)] });
    } else if (second === 'gunner') {
      /* Behind you, against the starboard wall aft of the console: a
       * station like the bridge's, in a one-seat cockpit's room. */
      var gz = geom.bulkZ + 0.62, gside = 1;
      var gxw = gside * geom.sideX, gxc = gside * (geom.sideX - STATION_CON), gxs = gside * (geom.sideX - STATION_CON - STATION_SEAT);
      seat2 = { role: 'gunner', side: gside, z: gz, n: 0, cockpit: true };
      stations.push(seat2);
      item('console', (gxw + gxc) / 2, gz, '', { silent: true,
           counter: [Math.min(gxw, gxc), gz - 0.45, Math.max(gxw, gxc), gz + 0.45] });
      item('station', (gxc + gxs) / 2, gz, 'Gunner\'s station',
           { role: 'gunner', counter: [Math.min(gxc, gxs), gz - 0.25, Math.max(gxc, gxs), gz + 0.25] });
    }
    var medkit = null;
    if (size === 'S') {
      /* Low on the bulkhead, to port of the door, where a hand finds it
       * from the seat's side and nothing covers the glass. */
      var mkx1 = -DOOR_HW - 0.12, mkx0 = Math.max(-geom.sideX + 0.06, mkx1 - 0.55);
      medkit = { x0: mkx0, x1: mkx1, z: geom.bulkZ };
      item('medkit', (mkx0 + mkx1) / 2, geom.bulkZ + 0.3, 'Medical supplies',
           { counter: [mkx0, geom.bulkZ, mkx1, geom.bulkZ + 0.24] });
    }

    /* ---- THE DECKS (2026-10-25) ---------------------------------------------
     * The car is a room on every deck at the same x/z; each deck's landing
     * door is on the side that deck lies (forward for the bridge, aft for the
     * rest). Junction: a tram platform aft of the car, the tramway (not
     * walkable: you ride it), the far platform, and the engine room. Hangar
     * (Carrier only): one big bay aft of the car, pads marked on the floor. */
    var deckY = null, deckOrder = null, tram = null, hangarPads = null;
    if (decked) {
      var mainY = geom.floorY - (TOWER[opts.hullId] || 6);
      deckOrder = ['bridge', 'main', 'junction'];
      deckY = { bridge: geom.floorY, main: mainY, junction: mainY - DECK_H };
      if (opts.hullId === 'carrier') {
        deckOrder.push('hangar');
        /* Below the junction by the bay's whole height, so its ceiling clears
         * the tramway that runs aft over the same ground. */
        deckY.hangar = deckY.junction - (HANGAR[2] + 0.6);
      }
      deckOrder.forEach(function (dk) {
        var c = room('lift-' + dk, 'lift', -CAR_HW, CAR_HW, carZ[0], carZ[1], CAR_H, 'Lift');
        c.deck = dk; cars[dk] = c;
      });
      /* The landing doors. The bridge's is forward of the car, into the
       * lobby; every other deck's is aft of it. */
      var dlb = slider('lift-bridge', lobby, cars.bridge, lobby.z0, 'Lift');
      dlb.z0 = carZ[1] - 0.8; dlb.z1 = lobby.z0 + 0.8; dlb.wall = [carZ[1], lobby.z0]; dlb.deck = 'bridge'; dlb.lift = true;
      var dlm = slider('lift-main', cars.main, passage, carZ[0], 'Lift');
      dlm.z0 = p1 - 0.8; dlm.z1 = carZ[0] + 0.8; dlm.wall = [p1, carZ[0]]; dlm.deck = 'main'; dlm.lift = true;
      /* The junction: platform, tramway, platform, engine room. */
      var pa1 = carZ[0] - WALL_T;
      var platA = room('platform-fwd', 'platform', -PLAT_HW, PLAT_HW, pa1 - PLAT_L, pa1, CAR_H + 0.4, 'Tram platform');
      var dlj = slider('lift-junction', cars.junction, platA, carZ[0], 'Lift');
      dlj.z0 = pa1 - 0.8; dlj.z1 = carZ[0] + 0.8; dlj.wall = [pa1, carZ[0]]; dlj.deck = 'junction'; dlj.lift = true;
      var spine = Ln('spine', SPINE[opts.hullId] || 32);
      var way = room('tramway', 'tramway', -TRAM_HW, TRAM_HW, platA.z0 - spine, platA.z0, CAR_H + 0.4, 'Tramway');
      way.walk = false;
      var platB = room('platform-aft', 'platform', -PLAT_HW, PLAT_HW, way.z0 - PLAT_L, way.z0, CAR_H + 0.4, 'Tram platform');
      var ej1 = platB.z0 - WALL_T;
      var engJ = room('engine', 'engine', -JUNCTION_ENGINE[0] / 2, JUNCTION_ENGINE[0] / 2, ej1 - JUNCTION_ENGINE[1], ej1, ENGINE_H, 'Engine room');
      engJ.fwdDoor = true;
      var dej = slider('engine', platB, engJ, platB.z0, 'Engine room door');
      dej.z0 = ej1 - 0.8; dej.z1 = platB.z0 + 0.8; dej.wall = [ej1, platB.z0];
      engine = engJ;
      /* Where the tram stands at each end, and where you step off. */
      tram = { a: platA.z0 - TRAM_L / 2, b: way.z0 + TRAM_L / 2, offA: platA.z0 + 0.8, offB: platB.z1 - 0.8,
               z0: way.z0, z1: way.z1 };
      itemDeck = 'junction';
      item('tram', 0, platA.z0 + 0.45, 'Tram  —  aft to engineering', { to: 'b', counter: [-TRAM_HW, platA.z0, TRAM_HW, platA.z0 + 0.12] });
      item('tram', 0, platB.z1 - 0.45, 'Tram  —  forward to the lift', { to: 'a', counter: [-TRAM_HW, platB.z1 - 0.12, TRAM_HW, platB.z1] });
      /* The engine room's furniture, as on a smaller hull's: the drive
       * trunk down both walls, the console on the aft wall. */
      var dDep = 1.2;
      drive = { x0: engJ.x1 - dDep, x1: engJ.x1, z0: engJ.z0 + 0.3, z1: engJ.z1 - 0.3, bands: 3 + Math.floor(rng2.next() * 3), both: true };
      item('drive', engJ.x1 - dDep / 2, (engJ.z0 + engJ.z1) / 2, '', { silent: true, counter: [drive.x0, drive.z0, drive.x1, drive.z1] });
      item('drive', engJ.x0 + dDep / 2, (engJ.z0 + engJ.z1) / 2, '', { silent: true, counter: [engJ.x0, drive.z0, engJ.x0 + dDep, drive.z1] });
      item('engine', 0, engJ.z0 + 0.3, 'Drive console', { yaw: Math.PI, counter: [-0.7, engJ.z0, 0.7, engJ.z0 + 0.55] });
      if (deckY.hangar !== undefined) {
        var hz1 = carZ[0] - WALL_T;
        var bay = room('hangar', 'hangar', -HANGAR[0] / 2, HANGAR[0] / 2, hz1 - HANGAR[1], hz1, HANGAR[2], 'Hangar');
        var dlh = slider('lift-hangar', cars.hangar, bay, carZ[0], 'Lift');
        dlh.z0 = hz1 - 0.8; dlh.z1 = carZ[0] + 0.8; dlh.wall = [hz1, carZ[0]]; dlh.deck = 'hangar'; dlh.lift = true;
        /* Three pads down the bay; your craft stand on them (render.js). */
        hangarPads = [];
        itemDeck = 'hangar';
        for (var hp = 0; hp < 3; hp++) {
          var pz = bay.z1 - 9 - hp * 11, px = hp % 2 ? 4.5 : -4.5;
          hangarPads.push({ x: px, z: pz, r: 4.2 });
          item('pad', px, pz, '', { silent: true, counter: [px - 3.0, pz - 4.0, px + 3.0, pz + 4.0] });
        }
        item('hangardoor', 0, bay.z0 + 0.6, 'Hangar doors', {});
      }
      /* The buttons: one per other deck, on the car's starboard wall, ▲ up
       * and ▼ down from the deck you are on — arrows, not words, for which
       * way (Astra's rule for anything that points). Picked by looking at
       * one (`aim`), not by which is nearest. */
      deckOrder.forEach(function (here, hi) {
        itemDeck = here;
        var n = 0;
        deckOrder.forEach(function (to, ti) {
          if (to === here) return;
          var arrow = ti < hi ? '▲' : '▼';
          item('liftbtn', CAR_HW - 0.12, carZ[0] + 0.35 + n * 0.4, arrow + '  ' + DECK_NAME[to], { to: to, aim: true });
          n++;
        });
      });
    }

    /* Where you stand when you get up: in the bay between the seat and the
     * bulkhead, facing aft at the door. And where you come aboard: inside
     * the hatch, facing forward up the passage. */
    var bay = (SEAT[1] - 0.30 + geom.bulkZ + 0.30) / 2;
    var spawn = { x: 0, z: bay, yaw: Math.PI };
    /* Coming aboard you are on the airlock's landing, facing its inner
     * door across the ship. */
    var aboard = { x: rxc, z: hinge + 0.6, yaw: Math.PI / 2 };

    /* The first three rooms are always cockpit, passage, airlock (the old
     * plan's order, which callers index); the bridge deck and quarters
     * follow when she has them. */
    var ORDER = { cockpit: 0, passage: 1, airlock: 2, bridgedeck: 3, quarters: 4,
                  turret: 5, medbay: 6, engine: 7, cargo: 8, lobby: 9, lift: 10,
                  platform: 11, tramway: 12, hangar: 13 };
    rooms.sort(function (a, b) { return ORDER[a.kind] - ORDER[b.kind]; });

    /* Every room, door and item knows its deck. */
    var BRIDGE_KINDS = { cockpit: 1, bridgedeck: 1, lobby: 1 };
    var JUNCTION_KINDS = { platform: 1, tramway: 1 };
    rooms.forEach(function (r) {
      if (r.deck) return;
      r.deck = !decked ? 'main' : BRIDGE_KINDS[r.kind] ? 'bridge' : JUNCTION_KINDS[r.kind] || (r.kind === 'engine') ? 'junction'
             : r.kind === 'hangar' ? 'hangar' : 'main';
    });
    var roomDeck = {};
    rooms.forEach(function (r) { roomDeck[r.id] = r.deck; });
    doors.forEach(function (d) {
      if (!d.deck) d.deck = decked ? (d.id === 'helm' || d.id === 'bridge' ? 'bridge' : roomDeck[d.a] || 'main') : 'main';
      d.yOff = deckY ? deckY[d.deck] - geom.floorY : 0;
    });
    if (!decked) items.forEach(function (it) { it.deck = 'main'; });

    var out = {
      kind: 'ship', hullId: opts.hullId || '', palette: paletteFor(opts.hullId, opts.libId),
      tower: !!(decked && TOWER_GLASS[opts.hullId]),
      rooms: rooms, doors: doors, items: items, spawn: spawn, aboard: aboard,
      floorY: geom.floorY, k: k, bay: bay, size: size,
      stations: stations, bunks: bunks, bunkAt: bunkAt, sides: sides,
      turrets: turrets, beds: beds, crates: crates, drive: drive, second: second, medkit: medkit,
      ramp: rampSpec
    };
    if (decked) {
      /* A walk.js plan per deck: the same objects, filtered, with that
       * deck's floor. `ship` points back at the whole. */
      out.deckY = deckY; out.deckOrder = deckOrder; out.tram = tram; out.hangarPads = hangarPads;
      out.carZ = carZ; out.decks = {};
      deckOrder.forEach(function (dk) {
        var v = {};
        for (var key in out) v[key] = out[key];
        v.deck = dk; v.floorY = deckY[dk]; v.ship = out; v.decks = null;
        v.rooms = rooms.filter(function (r) { return r.deck === dk && r.walk !== false; });
        v.doors = doors.filter(function (d) { return d.deck === dk; });
        v.items = items.filter(function (it) { return it.deck === dk; });
        out.decks[dk] = v;
      });
    }
    return out;
  }

  /* ---- A DECK THAT FITS HER (2026-10-31) -----------------------------------
   * Astra: "all ships should have interiors that exist as part of the ship
   * itself", "that follow the rules of making physical sense". Asked what
   * gives when a room will not fit, she chose shrink, then drop: a room is
   * narrowed or shortened to her hull, down to a size it can still do its
   * job in, and below that it is left out (its job goes to the consoles
   * that remain).
   *
   * `opts.fit.inside(x, y, z)` (render.js hullFitter) says whether a point,
   * in the plan's metres, is inside her hull. Each room is sampled a hand's
   * width in from its walls, at its floor and its ceiling; the first one
   * that is not wholly inside is dealt with — narrowed from its outboard
   * side, shortened from its aft end, or left out — and the deck is planned
   * again, until every room is inside or nothing more can be done. The
   * cockpit is not asked: its canopy stands proud of her skin by design. */
  var FIT_MIN_W = { quarters: BUNK_W + 0.9, turret: 1.5, medbay: 2.0, engine: 2.4, airlock: 0 };
  var FIT_MIN_CARGO_HW = 1.4, FIT_MIN_CARGO_L = 2.6, FIT_MIN_SPINE = 4;
  var FIT_DROP = { turret: 1, engine: 1, medbay: 1, quarters: 1, cargo: 1 };
  var FIT_MARGIN = 0.12;
  function roomInside(fit, r, fy, x0, x1, z0, z1) {
    var h = r.y1 || 2.2, ys = [fy + 0.1, fy + h - 0.1];
    var sx = Math.max(0.1, Math.min(0.5, x1 - x0 - 0.2)), ok = true;
    for (var x = x0 + 0.1; ok && x <= x1 - 0.1 + 1e-9; x += sx) {
      for (var z = z0 + 0.1; ok && z <= z1 - 0.1 + 1e-9; z += 0.5) {
        for (var i = 0; i < ys.length; i++) if (!fit.inside(x, ys[i], z)) { ok = false; break; }
      }
    }
    return ok;
  }
  function fitRooms(p) {
    var out = [];
    (p.decks ? Object.keys(p.decks).map(function (k) { return p.decks[k]; }) : [p]).forEach(function (dp) {
      dp.rooms.forEach(function (r) { if (r.kind !== 'cockpit' && r.walk !== false) out.push({ r: r, fy: dp.floorY }); });
    });
    return out;
  }
  function planFitted(geom, opts) {
    var fit = opts && opts.fit;
    if (!fit || !fit.inside) return plan(geom, opts);
    var o = {};
    for (var k in opts) o[k] = opts[k];
    o.omit = {}; o.roomW = {}; o.roomL = {}; o.roomH = {};
    var p = null, misfit = [];
    for (var pass = 0; pass < 24; pass++) {
      p = plan(geom, o);
      var bad = null;
      fitRooms(p).some(function (e) {
        if (misfit.indexOf(e.r.kind) >= 0) return false;
        if (roomInside(fit, e.r, e.fy, e.r.x0, e.r.x1, e.r.z0, e.r.z1)) return false;
        bad = e; return true;
      });
      if (!bad) break;
      var r = bad.r, kind = r.kind, done = false;
      /* A side room: as wide as she allows from the passage wall out. */
      if (r.side && FIT_MIN_W[kind] !== undefined) {
        var inb = r.side < 0 ? r.x1 : r.x0, w = r.x1 - r.x0, best = 0;
        for (var tw = w - 0.1; tw >= 0.5; tw -= 0.1) {
          var a = r.side < 0 ? inb - tw : inb, b = r.side < 0 ? inb : inb + tw;
          if (roomInside(fit, r, bad.fy, a - (r.side < 0 ? FIT_MARGIN : 0), b + (r.side > 0 ? FIT_MARGIN : 0), r.z0, r.z1)) { best = tw; break; }
        }
        var need = kind === 'airlock' ? (p.ramp ? (p.ramp.x1 - p.ramp.x0) + 0.3 : 1.8) : FIT_MIN_W[kind];
        if (best >= need) { o.roomW[kind] = best; done = true; }
        /* The airlock cannot be left out: a narrower ramp in it instead,
         * down to one a body still walks down comfortably. */
        else if (kind === 'airlock' && best > 0 && (best - 0.3) / 2 >= 0.55 && !(o.rampHW > 0 && o.rampHW <= (best - 0.3) / 2)) {
          o.rampHW = (best - 0.3) / 2; o.roomW.airlock = best; done = true;
        }
      } else if (kind === 'cargo') {
        /* The hold: narrower both sides, then shorter from aft. */
        var hw = (r.x1 - r.x0) / 2, bh = 0;
        for (var th = hw - 0.1; th >= FIT_MIN_CARGO_HW; th -= 0.1) {
          if (roomInside(fit, r, bad.fy, -th - FIT_MARGIN, th + FIT_MARGIN, r.z0, r.z1)) { bh = th; break; }
        }
        if (bh) { o.roomW.cargo = bh; done = true; }
        /* A lower deckhead, down to what two containers stacked need. */
        if (!done) {
          for (var thh = (r.y1 || 2.9) - 0.1; thh >= 2.6 - 1e-9; thh -= 0.1) {
            if (roomInside(fit, { y1: thh }, bad.fy, r.x0, r.x1, r.z0, r.z1)) {
              o.roomH = o.roomH || {}; o.roomH.cargo = thh; done = true; break;
            }
          }
        }
        if (!done) {
          var bl = 0;
          for (var tl = (r.z1 - r.z0) - 0.5; tl >= FIT_MIN_CARGO_L; tl -= 0.5) {
            if (roomInside(fit, r, bad.fy, r.x0, r.x1, r.z1 - tl - FIT_MARGIN, r.z1)) { bl = tl; break; }
          }
          if (bl) { o.roomL.cargo = bl; done = true; }
        }
      } else if (kind === 'engine' || (kind === 'platform' && r.id === 'platform-aft')) {
        /* Down at the junction: the tramway shorter, so engineering comes
         * forward into her. */
        var cur = o.roomL.spine || 999, sp0 = p.tram ? (p.tram.z1 - p.tram.z0) : 0;
        var next = Math.min(cur, sp0) - 4;
        if (sp0 && next >= FIT_MIN_SPINE) { o.roomL.spine = next; done = true; }
      }
      if (!done && FIT_DROP[kind] && !o.omit[kind]) { o.omit[kind] = true; done = true; }
      if (!done) misfit.push(kind);
    }
    p.fitted = { omitted: Object.keys(o.omit), narrowed: o.roomW, shortened: o.roomL, lowered: o.roomH, misfit: misfit };
    return p;
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
      /* A sealing door (the airlock's inner one) held by airlock.js stays
       * shut whoever is at it: nobody opens it onto the outside. */
      var want = d.locked ? 0 : (near || hold[d.id]) ? 1 : 0;
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
      /* A few centimetres past the pane's outer edge (2026-10-31): the
       * corner where this wall meets the one back to the side wall is a V
       * opening away from the seat, and sight lines just past the pane's
       * edge went out between the two. */
      frame(room, o, u, v, toPlane(g.quarters[qi], hinge, u, v),
            [[0, fy], [L + 0.05, fy], [L + 0.05, cy], [0, cy]], pal.wall);
      var R = [side * g.sideX, 0, g.meetZ];
      /* From the corner of the quarter-light's wall as built - EPS out from
       * the glass and a hair past its end - so the two walls close on each
       * other instead of leaving a crack down the corner (2026-10-31: the
       * taller side windows put a sight line right through it). */
      var Qs = add3(add3(outer, scl(nrm, EPS)), scl(u, EPS));
      /* ...and on out past it a little along its own line (which is the
       * line of sight, so the overlap is seen edge-on): a sight line that
       * lands exactly on the corner meets one wall or the other. */
      Qs = add3(Qs, scl(unit(sub(Qs, R)), 0.03));
      quad(room, [Qs[0], fy, Qs[2]], [R[0], fy, R[2]], [R[0], cy, R[2]], [Qs[0], cy, Qs[2]], pal.wall);
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
    for (var fi = 0; fi < foot.length; fi++) {
      var a2 = foot[fi], b2 = foot[(fi + 1) % foot.length];
      tri(room, [0, fy, 0], [a2[0], fy, a2[1]], [b2[0], fy, b2[1]], pal.floor);
    }
    /* THE CEILING, with the roof glass cut through it (2026-10-31): aft of
     * the glass a plain slab; across it, each half of the ship framed
     * round its pane; forward of it, the bulge out to the quarter-lights. */
    if (g.roofs && g.roofs.length === 2) {
      var zs0 = g.roofZ0 - 0.06, zs1 = g.meetZ, co = [0, cy, 0], cu = [1, 0, 0], cv = [0, 0, 1];
      if (zs0 > g.bulkZ + 1e-6) {
        quad(room, [-g.sideX, cy, g.bulkZ], [g.sideX, cy, g.bulkZ], [g.sideX, cy, zs0], [-g.sideX, cy, zs0], pal.ceil);
      } else zs0 = g.bulkZ;
      g.roofs.forEach(function (r) {
        var right = r[0][0] > 0;
        var rect = right ? [[0, zs0], [g.sideX, zs0], [g.sideX, zs1], [0, zs1]]
                         : [[-g.sideX, zs0], [0, zs0], [0, zs1], [-g.sideX, zs1]];
        frame(room, co, cu, cv, r.map(function (p) { return [p[0], p[2]]; }), rect, pal.ceil);
      });
      var fwdC = [[-g.sideX, zs1], [g.sideX, zs1], [QX, QZ], [g.hingeX, g.frontZ], [-g.hingeX, g.frontZ], [-QX, QZ]];
      var cxm = 0, czm = 0;
      fwdC.forEach(function (p) { cxm += p[0] / fwdC.length; czm += p[1] / fwdC.length; });
      for (fi = 0; fi < fwdC.length; fi++) {
        var c2 = fwdC[fi], d2 = fwdC[(fi + 1) % fwdC.length];
        tri(room, [cxm, cy, czm], [c2[0], cy, c2[1]], [d2[0], cy, d2[1]], pal.ceil);
      }
    } else {
      for (fi = 0; fi < foot.length; fi++) {
        var a3 = foot[fi], b3 = foot[(fi + 1) % foot.length];
        tri(room, [0, cy, 0], [a3[0], cy, a3[1]], [b3[0], cy, b3[1]], pal.ceil);
      }
    }
    /* Two light strips down the ceiling, aft of the overhead panel - and
     * aft of the roof glass, which they would otherwise be stuck across. */
    var stripEnd = Math.min(g.overheadZ0, g.roofs ? g.roofZ0 : Infinity) - 0.05;
    if (stripEnd > g.bulkZ + 0.35) {
      [-1, 1].forEach(function (s) {
        var x0 = s * 0.50 * k, x1 = s * 0.56 * k, y = cy - 0.006;
        quad(room, [x0, y, g.bulkZ + 0.25], [x1, y, g.bulkZ + 0.25], [x1, y, stripEnd],
             [x0, y, stripEnd], pal.light);
      });
    }
    /* This ship's frame bars across its panes (cockpitGeometry `bars`). */
    (g.bars || []).forEach(function (b) { quad(room, b[0], b[1], b[2], b[3], pal.jamb || pal.wall); });

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
      p.stations.forEach(function (st) { if (!st.cockpit) station(room, pal, fy, g.sideX, st); });
      if (p.tower) towerGlass(room, portals, pal, fy, cy, deck, dB, true);
      bulkhead(room, pal, fy, dB.wall[1], g.sideX, cy, dB.wall[0], p.decks ? LOBBY_HW : PASSAGE_HW, fy + PASSAGE_H, true, [pal.wall, pal.passWall]);
    } else {
      bulkhead(room, pal, fy, dB.wall[1], g.sideX, cy, dB.wall[0], p.decks ? LOBBY_HW : PASSAGE_HW, fy + PASSAGE_H, true);
    }

    /* A DECKED HULL (2026-10-25): the lobby aft of the bridge door and the
     * lift's landing at the bridge; then everything from the passage aft
     * is built as it always was, but into a mesh of its own that is moved
     * down to the main deck at the end. Door leaves are moved there by
     * their door's `yOff` (render.js), so they are built here at the
     * bridge's height like every other leaf. */
    var shipRoom = room, shipPortals = portals, dyMain = 0;
    if (p.decks) {
      var lob = roomByKind(p, 'lobby'), dLB = doorById(p, 'lift-bridge');
      boxRoom(room, lob.x0, fy, lob.z0, lob.x1, fy + PASSAGE_H, lob.z1, pal.passWall, pal.passFloor, pal.ceil, ['z0', 'z1']);
      quad(room, [-0.06, fy + PASSAGE_H - 0.01, lob.z0 + 0.3], [0.06, fy + PASSAGE_H - 0.01, lob.z0 + 0.3],
           [0.06, fy + PASSAGE_H - 0.01, lob.z1 - 0.3], [-0.06, fy + PASSAGE_H - 0.01, lob.z1 - 0.3], pal.light);
      bulkhead(room, pal, fy, dLB.wall[1], LOBBY_HW, fy + PASSAGE_H, dLB.wall[0], CAR_HW, fy + CAR_H, false, [pal.passWall, pal.lockWall]);
      liftSign(room, pal, fy, dLB.wall[1] + 0.006, 1, 'bridge', p);
      if (p.tower) towerGlass(room, portals, pal, fy, fy + PASSAGE_H, lob, null, false);
      dyMain = p.deckY.main - fy;
      room = mesh(); portals = mesh();
      /* The main deck's landing: the passage's forward wall, the car's
       * door through it. */
      var dLM = doorById(p, 'lift-main');
      bulkhead(room, pal, fy, dLM.wall[1], CAR_HW, fy + CAR_H, dLM.wall[0], PASSAGE_HW, fy + PASSAGE_H, false, [pal.lockWall, pal.passWall]);
      liftSign(room, pal, fy, dLM.wall[0] - 0.006, -1, 'main', p);
    }
    /* The passage's aft wall: the cargo bay's door through it from M up,
     * a plain wall on a small hull (2026-10-26: the airlock used to be
     * through here; it is off the port side now). */
    var dC = doorById(p, 'cargo'), cg = roomByKind(p, 'cargo');

    /* THE PASSAGE: ribs every metre and a bit, a light down the ceiling,
     * lockers along the starboard wall, a hazard edge to the floor. */
    var ps = p.rooms[1];
    /* Every door through the passage's side walls: the quarters' and the
     * turret's to port, the medbay's and the engine room's to starboard. */
    var sideDoors = p.doors.filter(function (d) { return d.axis === 'x'; });
    var portZ = sideDoors.filter(function (d) { return d.wall[1] <= 0; }).map(function (d) { return d.zc; });
    var stbdZ = sideDoors.filter(function (d) { return d.wall[0] >= 0; }).map(function (d) { return d.zc; });
    var skipP = dC ? ['z0', 'z1'] : ['z1'];
    if (portZ.length) skipP.push('x0');
    if (stbdZ.length) skipP.push('x1');
    boxRoom(room, ps.x0, fy, ps.z0, ps.x1, fy + PASSAGE_H, ps.z1, pal.passWall, pal.passFloor, pal.ceil, skipP);
    /* Each side wall with its doorways through it, into walls as thick as
     * a bulkhead; the rooms behind them are built below. */
    if (portZ.length) wallDoors(room, -PASSAGE_HW, ps.z0, ps.z1, fy, fy + PASSAGE_H, portZ, pal.passWall);
    if (stbdZ.length) wallDoors(room, PASSAGE_HW, ps.z0, ps.z1, fy, fy + PASSAGE_H, stbdZ, pal.passWall);
    sideDoors.forEach(function (d) { sideDoorFrame(room, pal, fy, d.wall[0], d.wall[1], d.zc); });
    function nearDoor(zs, z, pad) { return zs.some(function (zc) { return Math.abs(z - zc) < DOOR_HW + pad; }); }
    var z;
    for (z = ps.z1 - 0.6; z > ps.z0 + 0.3; z -= 1.25) {
      [-1, 1].forEach(function (s) {
        if (nearDoor(s < 0 ? portZ : stbdZ, z, 0.15)) return;
        var x = s * (PASSAGE_HW - 0.005);
        quad(room, [x, fy, z - 0.06], [x, fy, z + 0.06], [x, fy + PASSAGE_H, z + 0.06], [x, fy + PASSAGE_H, z - 0.06], pal.rib);
      });
      quad(room, [-PASSAGE_HW, fy + PASSAGE_H - 0.005, z - 0.06], [PASSAGE_HW, fy + PASSAGE_H - 0.005, z - 0.06],
           [PASSAGE_HW, fy + PASSAGE_H - 0.005, z + 0.06], [-PASSAGE_HW, fy + PASSAGE_H - 0.005, z + 0.06], pal.rib);
    }
    quad(room, [-0.06, fy + PASSAGE_H - 0.01, ps.z0 + 0.3], [0.06, fy + PASSAGE_H - 0.01, ps.z0 + 0.3],
         [0.06, fy + PASSAGE_H - 0.01, ps.z1 - 0.3], [-0.06, fy + PASSAGE_H - 0.01, ps.z1 - 0.3], pal.light);
    for (z = ps.z1 - 0.9; z > ps.z0 + 0.7; z -= 1.25) {
      /* No locker across a doorway. */
      if (nearDoor(stbdZ, z, 0.55)) continue;
      var xl = PASSAGE_HW - 0.01;
      quad(room, [xl, fy + 0.25, z - 0.5], [xl, fy + 0.25, z + 0.5], [xl, fy + 1.95, z + 0.5], [xl, fy + 1.95, z - 0.5], pal.locker);
      quad(room, [xl - 0.002, fy + 1.0, z - 0.42], [xl - 0.002, fy + 1.0, z - 0.38],
           [xl - 0.002, fy + 1.2, z - 0.38], [xl - 0.002, fy + 1.2, z - 0.42], pal.trim);
    }
    [-1, 1].forEach(function (s) {
      var x0 = s * (PASSAGE_HW - 0.12), x1 = s * (PASSAGE_HW - 0.04), y = fy + 0.004;
      quad(room, [x0, y, ps.z0], [x1, y, ps.z0], [x1, y, ps.z1], [x0, y, ps.z1], pal.hazard);
    });
    passageDetail(room, pal, fy, ps, portZ, stbdZ, p, !!(dC && cg));

    if (dC && cg) {
      bulkhead(room, pal, fy, dC.wall[1], PASSAGE_HW, fy + PASSAGE_H, dC.wall[0], cg.x1, fy + (cg.y1 || CARGO_H), false, [pal.passWall, pal.lockWall]);
    }

    /* THE AIRLOCK (2026-10-26): off the port side, its inner door in the
     * passage wall, the landing inside it and the ramp's well aft of that.
     * The floor is laid round the well; the ramp itself is a part of its own
     * (rampMesh), moved by how far it is down. */
    var lk = roomByKind(p, 'airlock'), rp = p.ramp;
    var lockMesh = airlockMesh(room, pal, fy, lk, dL, rp);
    var lampOk = lockMesh.lampOk, lampNo = lockMesh.lampNo;

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
    if (dQ && qr) quartersMesh(room, pal, fy, qr, dQ, p);
    /* Every side door's leaves, sliding fore and aft into the wall. */
    function sideLeaves(d) {
      var xm = (d.wall[0] + d.wall[1]) / 2;
      return [-1, 1].map(function (s) {
        var m = mesh();
        var z0 = s < 0 ? d.zc - DOOR_HW : d.zc, z1 = s < 0 ? d.zc : d.zc + DOOR_HW;
        box(m, xm - LEAF_T / 2, fy + 0.005, z0, xm + LEAF_T / 2, fy + DOOR_H - 0.01, z1, pal.leaf);
        var ze0 = s < 0 ? d.zc - 0.05 : d.zc, ze1 = s < 0 ? d.zc : d.zc + 0.05;
        [xm - LEAF_T / 2 - 0.002, xm + LEAF_T / 2 + 0.002].forEach(function (x) {
          quad(m, [x, fy + 0.05, ze0], [x, fy + 0.05, ze1], [x, fy + DOOR_H - 0.06, ze1], [x, fy + DOOR_H - 0.06, ze0], pal.leafEdge);
        });
        return m;
      });
    }

    /* THE NEW ROOMS (2026-10-25). */
    var tr = roomByKind(p, 'turret'), mr = roomByKind(p, 'medbay'), er = roomByKind(p, 'engine');
    if (tr) turretMesh(room, portals, pal, fy, tr, doorById(p, 'turret'), p);
    if (mr) medbayMesh(room, pal, fy, mr, doorById(p, 'medbay'), p);
    if (er && !er.fwdDoor) engineMesh(room, pal, fy, er, doorById(p, 'engine'), p);
    if (cg) cargoMesh(room, pal, fy, cg, p);
    /* And an S cockpit's fittings: the second seat and the medical
     * supplies. Their own mesh, drawn over the room as the pilot's seat is
     * — a co-pilot's seat stands between you and the starboard glass, as it
     * would, and the room's own walls still never do. */
    var fittings = mesh();
    var cop = p.items.filter(function (it) { return it.kind === 'copilot'; })[0];
    if (cop) {
      var dz = cop.dz || 0, cx = cop.x;
      box(fittings, cx - 0.24, fy, -0.30 + dz, cx + 0.24, fy + 0.46, 0.14 + dz, pal.seat, pal.seatPad);
      box(fittings, cx - 0.24, fy + 0.46, -0.40 + dz, cx + 0.24, fy + 1.20, -0.30 + dz, pal.seat);
      box(fittings, cx - 0.14, fy + 1.24, -0.38 + dz, cx + 0.14, fy + 1.44, -0.30 + dz, pal.seat, pal.seatPad);
      box(fittings, cx - 0.05, fy, -0.10 + dz, cx + 0.05, fy + 0.30, 0.05 + dz, pal.rib);
    }
    p.stations.forEach(function (st) { if (st.cockpit) station(fittings, pal, fy, g.sideX, st); });
    if (p.medkit) {
      var mk = p.medkit, mz = mk.z + 0.004;
      /* Below the rear screens' panels, which come down to about knee
       * height on the bulkhead. */
      box(fittings, mk.x0, fy + 0.06, mz, mk.x1, fy + 0.50, mz + 0.2, MEDCOL.cab);
      /* Its green band and the clasp, so it reads as the kit and not a box. */
      quad(fittings, [mk.x0 + 0.03, fy + 0.40, mz + 0.204], [mk.x1 - 0.03, fy + 0.40, mz + 0.204],
           [mk.x1 - 0.03, fy + 0.45, mz + 0.204], [mk.x0 + 0.03, fy + 0.45, mz + 0.204], MEDCOL.lit);
      quad(fittings, [(mk.x0 + mk.x1) / 2 - 0.04, fy + 0.20, mz + 0.204], [(mk.x0 + mk.x1) / 2 + 0.04, fy + 0.20, mz + 0.204],
           [(mk.x0 + mk.x1) / 2 + 0.04, fy + 0.30, mz + 0.204], [(mk.x0 + mk.x1) / 2 - 0.04, fy + 0.30, mz + 0.204], pal.rib);
    }

    /* THE SEAT, drawn only while you are out of it. */
    box(seat, -0.26, fy, -0.30, 0.26, fy + 0.46, 0.14, pal.seat, pal.seatPad);
    box(seat, -0.26, fy + 0.46, -0.40, 0.26, fy + 1.26, -0.30, pal.seat);
    quad(seat, [-0.22, fy + 0.55, -0.296], [0.22, fy + 0.55, -0.296], [0.22, fy + 1.20, -0.296], [-0.22, fy + 1.20, -0.296], pal.seatPad);
    box(seat, -0.15, fy + 1.30, -0.38, 0.15, fy + 1.52, -0.30, pal.seat, pal.seatPad);
    box(seat, -0.05, fy, -0.10, 0.05, fy + 0.30, 0.05, pal.rib);

    /* The main deck goes down to where it is, and the decks below it are
     * built in place. */
    var car = null, tramCar = null;
    if (p.decks) {
      merge(shipRoom, room, dyMain);
      merge(shipPortals, portals, dyMain);
      [lampOk, lampNo].forEach(function (lm) { lm.v = lm.v.map(function (v) { return [v[0], v[1] + dyMain, v[2]]; }); });
      room = shipRoom; portals = shipPortals;
      junctionMesh(room, pal, p);
      if (p.deckY.hangar !== undefined) hangarMesh(room, pal, p);
      car = carMesh(pal, p);
      tramCar = tramMesh(pal);
    }

    return {
      room: room, portals: portals, seat: seat, lampOk: lampOk, lampNo: lampNo,
      car: car, tram: tramCar, lampDy: dyMain,
      fittings: fittings.f.length ? fittings : null,
      leaves: (function () {
        var lv = { bridge: leaves(dB.wall[0], dB.wall[1]) };
        if (dC) lv.cargo = leaves(dC.wall[0], dC.wall[1]);
        sideDoors.forEach(function (d) { lv[d.id] = sideLeaves(d); });
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
  /* A STATION'S SCREEN AS AN MFD (2026-10-25). Astra: "On that conning
   * tower bridge should be MFD panels which are configurable, as with the
   * smaller ships." On a tower bridge (plan.tower) each station's two lit
   * blocks are covered by one live screen across the face — the same pages
   * as the helm's, assigned on F5 → PANELS. Its corners in the cockpit's
   * metres, a hair prouder than the blocks, in the order the GPU panel
   * wants them: top-left, top-right, bottom-right, bottom-left as seen by
   * whoever sits at it. Facing a starboard wall, forward is to your left;
   * facing a port one, to your right. */
  var STATION_SCREEN_PX = [460, 262];      // the helm's width, so every page lays out as it does there
  function stationScreen(st, sideX, fy) {
    var s = st.side, zc = st.z;
    var xc = s * (sideX - STATION_CON), deskY = fy + 0.76;
    var xTop = s * (sideX - 0.06), yTop = fy + 1.50;
    function onFace(u, v) {
      return [xc + (xTop - xc) * v - s * 0.012, deskY + (yTop - deskY) * v, zc - 0.43 + 0.86 * u];
    }
    var fwdU = 0.92, aftU = 0.08, top = 0.82, bot = 0.30;
    var lu = s > 0 ? fwdU : aftU, ru = s > 0 ? aftU : fwdU;
    return [onFace(lu, top), onFace(ru, top), onFace(ru, bot), onFace(lu, bot)];
  }
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

  /* ---- the rooms added 2026-10-25 --------------------------------------- */
  /* The medbay's whites and its green: a cross is a protected emblem, so
   * the medbay says what it is with colour, as the medic's kit does. */
  var MEDCOL = { bed: '#7d868d', sheet: '#b4bdc3', cab: '#a3abb1', lit: '!#5fd08a', screen: '!#7fe0b0' };
  /* The drive's glow, by whose ship it is. */
  var DRIVE_GLOW = { civil: '!#ffb04a', navy: '!#7fb8ff', syndicate: '!#ff5a3c' };

  /* A wall of constant x from z0 to z1 with doorways centred at each of
   * `zcs`: the panels between them, and a lintel over each. */
  function wallDoors(m, x, z0, z1, y0, y1, zcs, col) {
    var cuts = zcs.slice().sort(function (a, b) { return a - b; });
    var dh = y0 + DOOR_H, at = z0;
    cuts.forEach(function (zc) {
      var a = zc - DOOR_HW, b = zc + DOOR_HW;
      if (a > at) quad(m, [x, y0, at], [x, y0, a], [x, y1, a], [x, y1, at], col);
      if (y1 > dh) quad(m, [x, dh, a], [x, dh, b], [x, y1, b], [x, y1, a], col);
      at = b;
    });
    if (z1 > at) quad(m, [x, y0, at], [x, y0, z1], [x, y1, z1], [x, y1, at], col);
  }

  /* A side room's shell: its walls with the door on the passage side,
   * and a light down the middle of the ceiling. */
  function sideShell(m, pal, fy, r, door, top, wall, floor, noCeil) {
    var inb = r.side < 0 ? 'x1' : 'x0', xIn = r.side < 0 ? r.x1 : r.x0;
    var skip = [inb];
    if (noCeil) skip.push('ceil');
    boxRoom(m, r.x0, fy, r.z0, r.x1, top, r.z1, wall, floor, pal.ceil, skip);
    sideDoorWall(m, xIn, r.z0, r.z1, fy, top, door.zc, wall);
  }

  /* THE TURRET: a seat per gunner, each under a glass dome let into the
   * ceiling, a sight on an arm in front of it. The dome is a pane like the
   * windows — drawn depth-only first, so the sky shows through it — and
   * the ceiling is cut round it, a tile per seat. */
  function turretMesh(m, portals, pal, fy, r, door, p) {
    var top = fy + QUARTERS_H;
    sideShell(m, pal, fy, r, door, top, pal.passWall, pal.passFloor, true);
    var seats = p.turrets.slice().sort(function (a, b) { return a.z - b.z; });
    var at = r.z0, N = 10;
    seats.forEach(function (st) {
      var a = st.z - TURRET_SEAT / 2, b = st.z + TURRET_SEAT / 2;
      if (a > at + 1e-6) quad(m, [r.x0, top, at], [r.x1, top, at], [r.x1, top, a], [r.x0, top, a], pal.ceil);
      var hole = [];
      for (var i = 0; i < N; i++) {
        var t = i / N * Math.PI * 2;
        hole.push([st.x + Math.cos(t) * DOME_R, st.z + Math.sin(t) * DOME_R]);
      }
      /* In the ceiling's plane: s along x, t along z. */
      frame(m, [0, top, 0], [1, 0, 0], [0, 0, 1], hole, [[r.x0, a], [r.x1, a], [r.x1, b], [r.x0, b]], pal.ceil);
      /* The glass: a low dome above the cut, depth-only. */
      var rings = [[1, 0], [0.82, 0.55], [0.42, 0.9]], H = DOME_R * 0.75;
      for (var k = 0; k + 1 < rings.length; k++) {
        for (var j = 0; j < N; j++) {
          var t0 = j / N * Math.PI * 2, t1 = (j + 1) / N * Math.PI * 2;
          var P = function (rr, t) { return [st.x + Math.cos(t) * DOME_R * rr[0], top + H * rr[1], st.z + Math.sin(t) * DOME_R * rr[0]]; };
          quad(portals, P(rings[k], t0), P(rings[k], t1), P(rings[k + 1], t1), P(rings[k + 1], t0), '#000000');
        }
      }
      var capR = rings[rings.length - 1];
      for (j = 0; j < N; j++) {
        var c0 = j / N * Math.PI * 2, c1 = (j + 1) / N * Math.PI * 2;
        tri(portals, [st.x, top + H, st.z],
            [st.x + Math.cos(c0) * DOME_R * capR[0], top + H * capR[1], st.z + Math.sin(c0) * DOME_R * capR[0]],
            [st.x + Math.cos(c1) * DOME_R * capR[0], top + H * capR[1], st.z + Math.sin(c1) * DOME_R * capR[0]], '#000000');
      }
      /* A lit ring round the cut, so the dome is found from the door. */
      for (j = 0; j < N; j++) {
        var u0 = j / N * Math.PI * 2, u1 = (j + 1) / N * Math.PI * 2, r0 = DOME_R + 0.01, r1 = DOME_R + 0.05;
        quad(m, [st.x + Math.cos(u0) * r0, top - 0.004, st.z + Math.sin(u0) * r0], [st.x + Math.cos(u1) * r0, top - 0.004, st.z + Math.sin(u1) * r0],
             [st.x + Math.cos(u1) * r1, top - 0.004, st.z + Math.sin(u1) * r1], [st.x + Math.cos(u0) * r1, top - 0.004, st.z + Math.sin(u0) * r1], pal.trim);
      }
      /* The seat on its post, facing forward. */
      var x = st.x, z = st.z;
      /* Seat height as the bridge stations', so a body sits in it the same. */
      box(m, x - 0.22, fy + 0.30, z - 0.24, x + 0.22, fy + 0.46, z + 0.20, pal.seat, pal.seatPad);
      box(m, x - 0.22, fy + 0.46, z - 0.32, x + 0.22, fy + 1.15, z - 0.24, pal.seat);
      box(m, x - 0.06, fy, z - 0.06, x + 0.06, fy + 0.30, z + 0.06, pal.rib);
      box(m, x - 0.30, fy, z - 0.30, x + 0.30, fy + 0.06, z + 0.30, pal.hazardDark);
      /* The sight on its arm, in front of the gunner's face, and its grips. */
      box(m, x - 0.04, fy, z + 0.50, x + 0.04, fy + 1.02, z + 0.58, pal.rib);
      box(m, x - 0.20, fy + 1.02, z + 0.38, x + 0.20, fy + 1.28, z + 0.60, pal.console);
      quad(m, [x - 0.15, fy + 1.06, z + 0.376], [x + 0.15, fy + 1.06, z + 0.376], [x + 0.15, fy + 1.24, z + 0.376], [x - 0.15, fy + 1.24, z + 0.376], '!#c0392b');
      box(m, x - 0.30, fy + 0.86, z + 0.36, x - 0.20, fy + 0.98, z + 0.46, pal.seatPad);
      box(m, x + 0.20, fy + 0.86, z + 0.36, x + 0.30, fy + 0.98, z + 0.46, pal.seatPad);
      at = b;
    });
    if (r.z1 > at + 1e-6) quad(m, [r.x0, top, at], [r.x1, top, at], [r.x1, top, r.z1], [r.x0, top, r.z1], pal.ceil);
    /* A strip of light along the inboard side, clear of the domes. */
    var lx = r.x1 - 0.35;
    quad(m, [lx - 0.04, top - 0.006, r.z0 + 0.3], [lx + 0.04, top - 0.006, r.z0 + 0.3],
         [lx + 0.04, top - 0.006, r.z1 - 0.3], [lx - 0.04, top - 0.006, r.z1 - 0.3], pal.light);
  }

  /* THE MEDBAY: beds down the outboard wall with a screen over each, a
   * cabinet on the inboard wall, the room lit whiter than the rest. */
  /* ---- THE AIRLOCK AND ITS RAMP (2026-10-26) --------------------------------
   * The room: walls, ceiling, the inner door's wall, and a floor laid round
   * the ramp's well. The controls on the outboard wall at the landing, with
   * their lamp as two little meshes (green: the room is at the outside's
   * pressure and the way out is yours; red: sealed to the ship). */
  function airlockMesh(m, pal, fy, r, door, rp) {
    var top = fy + LOCK_H;
    boxRoom(m, r.x0, fy, r.z0, r.x1, top, r.z1, pal.lockWall, pal.passFloor, pal.ceil, ['x1', 'floor']);
    sideDoorWall(m, r.x1, r.z0, r.z1, fy, top, door.zc, pal.lockWall);
    var y = fy, F = pal.passFloor;
    /* Round the well: the landing forward of it, a strip aft, and the two
     * walkways down its sides. */
    quad(m, [r.x0, y, rp.hinge], [r.x1, y, rp.hinge], [r.x1, y, r.z1], [r.x0, y, r.z1], F);
    if (rp.foot > r.z0) quad(m, [r.x0, y, r.z0], [r.x1, y, r.z0], [r.x1, y, rp.foot], [r.x0, y, rp.foot], F);
    if (rp.x0 > r.x0) quad(m, [r.x0, y, rp.foot], [rp.x0, y, rp.foot], [rp.x0, y, rp.hinge], [r.x0, y, rp.hinge], F);
    if (r.x1 > rp.x1) quad(m, [rp.x1, y, rp.foot], [r.x1, y, rp.foot], [r.x1, y, rp.hinge], [rp.x1, y, rp.hinge], F);
    /* A hazard rim round the well, so its edge is the thing you see. */
    var e = 0.07, yy = y + 0.004;
    quad(m, [rp.x0 - e, yy, rp.hinge], [rp.x1 + e, yy, rp.hinge], [rp.x1 + e, yy, rp.hinge + e], [rp.x0 - e, yy, rp.hinge + e], pal.hazard);
    quad(m, [rp.x0 - e, yy, rp.foot - e], [rp.x1 + e, yy, rp.foot - e], [rp.x1 + e, yy, rp.foot], [rp.x0 - e, yy, rp.foot], pal.hazard);
    quad(m, [rp.x0 - e, yy, rp.foot], [rp.x0, yy, rp.foot], [rp.x0, yy, rp.hinge], [rp.x0 - e, yy, rp.hinge], pal.hazard);
    quad(m, [rp.x1, yy, rp.foot], [rp.x1 + e, yy, rp.foot], [rp.x1 + e, yy, rp.hinge], [rp.x1, yy, rp.hinge], pal.hazard);
    /* Chevrons across the landing. */
    for (var i = 0; i < 3; i++) {
      var zc = rp.hinge + 0.25 + i * 0.4;
      if (zc + 0.16 > r.z1 - 0.1) break;
      quad(m, [r.x0 + 0.2, yy, zc], [r.x1 - 0.2, yy, zc], [r.x1 - 0.2, yy, zc + 0.16], [r.x0 + 0.2, yy, zc + 0.16],
           i % 2 ? pal.hazardDark : pal.hazard);
    }
    /* Lights down the ceiling, over the landing and the well. */
    var xc = (r.x0 + r.x1) / 2;
    quad(m, [xc - 0.08, top - 0.01, r.z0 + 0.3], [xc + 0.08, top - 0.01, r.z0 + 0.3],
         [xc + 0.08, top - 0.01, r.z1 - 0.3], [xc - 0.08, top - 0.01, r.z1 - 0.3], pal.light);
    /* The controls: a housing on the outboard wall, its screen, and the
     * lamp over it. */
    var hz = door.zc, hx = r.x0 + 0.005;
    box(m, r.x0, fy + 1.05, hz - 0.22, r.x0 + 0.08, fy + 1.55, hz + 0.22, pal.jamb);
    quad(m, [hx + 0.08, fy + 1.12, hz - 0.17], [hx + 0.08, fy + 1.12, hz + 0.17],
         [hx + 0.08, fy + 1.48, hz + 0.17], [hx + 0.08, fy + 1.48, hz - 0.17], pal.trim);
    var lampAt = [hx + 0.01, fy + 1.75, hz];
    var lampOk = mesh(), lampNo = mesh();
    [[lampOk, pal.hatchLit], [lampNo, pal.hatchShut]].forEach(function (pr) {
      quad(pr[0], [lampAt[0], lampAt[1] - 0.05, lampAt[2] - 0.12], [lampAt[0], lampAt[1] - 0.05, lampAt[2] + 0.12],
           [lampAt[0], lampAt[1] + 0.05, lampAt[2] + 0.12], [lampAt[0], lampAt[1] + 0.05, lampAt[2] - 0.12], pr[1]);
    });
    return { lampOk: lampOk, lampNo: lampNo };
  }

  /* The ramp at `t` (0 raised and sealed, 1 down on the ground), in the
   * room's metres. A ramp or a stair turns about its hinge, the landing's
   * aft edge, so its far end drops through the belly; a lift platform
   * comes straight down. Treads every step, a hazard edge, rails both
   * sides. Built for a handful of t a second while it moves; the caller
   * keeps the result while it does not. */
  function rampPoint(rp, fy, t, x, y, z) {
    if (rp.mode === 'lift') return [x, y - rp.drop * t, z];
    var a = rp.angle * t, dz = z - rp.hinge, dy = y - fy;
    return [x, fy + dy * Math.cos(a) + dz * Math.sin(a), rp.hinge + dz * Math.cos(a) - dy * Math.sin(a)];
  }
  function rampMesh(pal, rp, fy, t) {
    var m = mesh();
    var P = function (x, y, z) { return rampPoint(rp, fy, t, x, y, z); };
    var x0 = rp.x0, x1 = rp.x1, z1 = rp.hinge, z0 = rp.foot, th = 0.12;
    /* The slab: its walking face, its underside (the seal, seen from
     * outside), and the edges. */
    quad(m, P(x0, fy, z0), P(x1, fy, z0), P(x1, fy, z1), P(x0, fy, z1), pal.passFloor);
    quad(m, P(x0, fy - th, z0), P(x0, fy - th, z1), P(x1, fy - th, z1), P(x1, fy - th, z0), pal.hatch);
    quad(m, P(x0, fy - th, z0), P(x1, fy - th, z0), P(x1, fy, z0), P(x0, fy, z0), pal.hazard);
    quad(m, P(x0, fy - th, z0), P(x0, fy, z0), P(x0, fy, z1), P(x0, fy - th, z1), pal.hatch);
    quad(m, P(x1, fy - th, z0), P(x1, fy - th, z1), P(x1, fy, z1), P(x1, fy, z0), pal.hatch);
    /* Treads: a step's worth of grip every 0.3 m, so a slope reads as
     * something you climb. */
    var yy = fy + 0.006;
    for (var z = z1 - 0.15; z > z0 + 0.1; z -= 0.3) {
      quad(m, P(x0 + 0.06, yy, z - 0.05), P(x1 - 0.06, yy, z - 0.05), P(x1 - 0.06, yy, z), P(x0 + 0.06, yy, z), pal.rib);
    }
    quad(m, P(x0, yy, z0), P(x0 + 0.06, yy, z0), P(x0 + 0.06, yy, z1), P(x0, yy, z1), pal.hazard);
    quad(m, P(x1 - 0.06, yy, z0), P(x1, yy, z0), P(x1, yy, z1), P(x1 - 0.06, yy, z1), pal.hazard);
    /* The rails, which fold flat with it when it is up. SOLID (2026-10-31):
     * each post and each handrail was one flat quad, a plane with no
     * thickness, so from the ramp itself - looking along a rail - it was
     * seen edge-on and shimmered as a line of broken pixels (Astra: "ensure
     * that ramp structures aren't width 0"). Every one is a box now. */
    if (t > 0.02) {
      var rh = 0.9 * Math.min(1, t * 1.5);
      [x0 + 0.04, x1 - 0.04].forEach(function (xr) {
        for (var zp = z1 - 0.2; zp > z0 + 0.1; zp -= 1.2) {
          rampBox(m, P, xr - 0.025, fy, zp - 0.025, xr + 0.025, fy + rh, zp + 0.025, pal.rib);
        }
        rampBox(m, P, xr - 0.025, fy + rh - 0.05, z0 + 0.1, xr + 0.025, fy + rh, z1 - 0.2, pal.trim);
      });
    }
    return m;
  }
  /* A box in the ramp's own frame: its eight corners through `P`, which
   * lays the ramp down at its angle. Six faces, so it has thickness from
   * every side. */
  function rampBox(m, P, x0, y0, z0, x1, y1, z1, col) {
    var a = P(x0, y0, z0), b = P(x1, y0, z0), c = P(x1, y0, z1), d = P(x0, y0, z1);
    var e = P(x0, y1, z0), f = P(x1, y1, z0), g = P(x1, y1, z1), h = P(x0, y1, z1);
    quad(m, e, f, g, h, col);      // top
    quad(m, a, d, c, b, col);      // bottom
    quad(m, a, b, f, e, col);      // foot end
    quad(m, d, h, g, c, col);      // hinge end
    quad(m, a, e, h, d, col);      // outboard
    quad(m, b, c, g, f, col);      // inboard
  }

  /* Where your feet are on the ramp, in the room's metres: the height of
   * its walking face under (x, z) at `t`, or null if (x, z) is not over it
   * as it lies now. */
  function rampFloor(rp, fy, t, x, z) {
    if (!rp || x < rp.x0 || x > rp.x1) return null;
    if (rp.mode === 'lift') return (z <= rp.hinge && z >= rp.foot) ? fy - rp.drop * t : null;
    var a = rp.angle * t, run = rp.len * Math.cos(a);
    if (z > rp.hinge || z < rp.hinge - run) return null;
    return fy + (z - rp.hinge) * Math.tan(a);
  }

  function medbayMesh(m, pal, fy, r, door, p) {
    var top = fy + QUARTERS_H;
    sideShell(m, pal, fy, r, door, top, pal.passWall, pal.passFloor);
    var cx = (r.x0 + r.x1) / 2;
    quad(m, [cx - 0.3, top - 0.006, r.z0 + 0.3], [cx + 0.3, top - 0.006, r.z0 + 0.3],
         [cx + 0.3, top - 0.006, r.z1 - 0.3], [cx - 0.3, top - 0.006, r.z1 - 0.3], pal.light);
    p.beds.forEach(function (b) {
      box(m, b.x0, fy, b.z0, b.x1, fy + 0.62, b.z1, MEDCOL.bed);
      box(m, b.x0 + 0.05, fy + 0.62, b.z0 + 0.05, b.x1 - 0.05, fy + 0.72, b.z1 - 0.05, MEDCOL.sheet);
      box(m, b.x0 + 0.1, fy + 0.72, b.z1 - 0.45, b.x1 - 0.1, fy + 0.8, b.z1 - 0.1, MEDCOL.sheet);
      /* The vitals screen on the wall at the head of the bed. */
      var xw = b.x1 - 0.004;
      quad(m, [xw, fy + 1.2, b.z1 - 0.8], [xw, fy + 1.2, b.z1 - 0.2], [xw, fy + 1.6, b.z1 - 0.2], [xw, fy + 1.6, b.z1 - 0.8], MEDCOL.screen);
      /* And the lamp over it, hung from the ceiling on its rod. */
      box(m, (b.x0 + b.x1) / 2 - 0.15, top - 0.5, b.z1 - 0.9, (b.x0 + b.x1) / 2 + 0.15, top - 0.42, b.z1 - 0.6, pal.rib);
      box(m, (b.x0 + b.x1) / 2 - 0.02, top - 0.42, b.z1 - 0.77, (b.x0 + b.x1) / 2 + 0.02, top, b.z1 - 0.73, pal.rib);
      quad(m, [(b.x0 + b.x1) / 2 - 0.12, top - 0.504, b.z1 - 0.87], [(b.x0 + b.x1) / 2 + 0.12, top - 0.504, b.z1 - 0.87],
           [(b.x0 + b.x1) / 2 + 0.12, top - 0.504, b.z1 - 0.63], [(b.x0 + b.x1) / 2 - 0.12, top - 0.504, b.z1 - 0.63], pal.light);
    });
    var cab = p.items.filter(function (it) { return it.kind === 'medcab'; })[0];
    if (cab) {
      var c = cab.counter;
      box(m, c[0], fy, c[1], c[2], fy + 1.9, c[3], MEDCOL.cab);
      quad(m, [c[2] + 0.004, fy + 1.55, c[1] + 0.05], [c[2] + 0.004, fy + 1.55, c[3] - 0.05],
           [c[2] + 0.004, fy + 1.62, c[3] - 0.05], [c[2] + 0.004, fy + 1.62, c[1] + 0.05], MEDCOL.lit);
      quad(m, [c[2] + 0.004, fy + 0.05, (c[1] + c[3]) / 2 - 0.004], [c[2] + 0.004, fy + 0.05, (c[1] + c[3]) / 2 + 0.004],
           [c[2] + 0.004, fy + 1.85, (c[1] + c[3]) / 2 + 0.004], [c[2] + 0.004, fy + 1.85, (c[1] + c[3]) / 2 - 0.004], pal.rib);
    }
  }

  /* THE ENGINE ROOM: the drive trunk down the outboard wall with its
   * glowing inspection bands, pipe runs overhead, the console on the aft
   * wall, grating stripes underfoot. Taller than the passage. */
  function engineMesh(m, pal, fy, r, door, p) {
    var top = fy + ENGINE_H, dr = p.drive;
    sideShell(m, pal, fy, r, door, top, pal.lockWall, pal.passFloor);
    var glow = DRIVE_GLOW[p.palette] || DRIVE_GLOW.civil;
    if (dr) {
      box(m, dr.x0, fy, dr.z0, dr.x1, top - 0.35, dr.z1, pal.bulk, pal.overhead);
      var span = dr.z1 - dr.z0;
      for (var i = 0; i < dr.bands; i++) {
        var zb = dr.z0 + span * (i + 1) / (dr.bands + 1), xf = dr.x0 - 0.004;
        quad(m, [xf, fy + 0.3, zb - 0.06], [xf, fy + 0.3, zb + 0.06], [xf, top - 0.6, zb + 0.06], [xf, top - 0.6, zb - 0.06], glow);
        box(m, dr.x0 - 0.04, fy + 0.25, zb - 0.14, dr.x0, top - 0.55, zb - 0.1, pal.rib);
        box(m, dr.x0 - 0.04, fy + 0.25, zb + 0.1, dr.x0, top - 0.55, zb + 0.14, pal.rib);
      }
      /* Two pipes from the trunk across the ceiling into the inboard wall. */
      [r.z0 + 0.6, r.z1 - 0.6].forEach(function (zp) {
        box(m, r.x0, top - 0.3, zp - 0.07, dr.x0, top - 0.16, zp + 0.07, pal.rib);
      });
    }
    var con = p.items.filter(function (it) { return it.kind === 'engine'; })[0];
    if (con) {
      var c = con.counter, dy = fy + 0.84;
      box(m, c[0], fy, c[1], c[2], dy, c[3], pal.console);
      quad(m, [c[0], dy, c[3]], [c[2], dy, c[3]], [c[2], fy + 1.6, c[1] + 0.06], [c[0], fy + 1.6, c[1] + 0.06], pal.console);
      var w = c[2] - c[0];
      function onFace(u, v) { return [c[0] + w * u, dy + (fy + 1.6 - dy) * v, c[3] + (c[1] + 0.06 - c[3]) * v + 0.006]; }
      quad(m, onFace(0.06, 0.25), onFace(0.48, 0.25), onFace(0.48, 0.8), onFace(0.06, 0.8), '!#b07a22');
      quad(m, onFace(0.54, 0.25), onFace(0.94, 0.25), onFace(0.94, 0.8), onFace(0.54, 0.8), glow);
    }
    for (var z = r.z0 + 0.4; z < r.z1 - 0.2; z += 0.5) {
      var xg1 = dr ? dr.x0 - 0.1 : r.x1 - 0.1;
      quad(m, [r.x0 + 0.1, fy + 0.003, z], [xg1, fy + 0.003, z], [xg1, fy + 0.003, z + 0.04], [r.x0 + 0.1, fy + 0.003, z + 0.04], pal.rib);
    }
    var lx = (r.x0 + (dr ? dr.x0 : r.x1)) / 2;
    quad(m, [lx - 0.05, top - 0.006, r.z0 + 0.3], [lx + 0.05, top - 0.006, r.z0 + 0.3],
         [lx + 0.05, top - 0.006, r.z1 - 0.3], [lx - 0.05, top - 0.006, r.z1 - 0.3], pal.light);
  }

  /* THE PASSAGE, DRESSED (2026-10-30). Astra: "add some more detail to the
   * walkway inside the ship." It was ribs, one light strip, lockers and two
   * hazard lines in a dark box. Now, everything inside 12 cm of a wall or
   * flat to the floor, so the 1.3 m you walk down is as wide as it was:
   *   - the floor in plates, with a tread runner down the middle;
   *   - kick plates along both walls, and low path lights set in them;
   *   - panel seams on the walls between the ribs;
   *   - a handrail at hip height down the port wall;
   *   - two pipe runs along the port wall under the ceiling, with coloured
   *     bands, and a cable tray along the starboard one;
   *   - vent grilles in the ceiling between the light and the walls;
   *   - a fire extinguisher by the aft door and a first-aid box by the fore;
   *   - lit signs, an arrow to each end and to the airlock. Astra wants
   *     direction shown as arrows rather than "left" and "right": the arrow
   *     on a sign points the way along the passage, worked out for the wall
   *     it hangs on, so it is right from either side.
   * Nothing here draws from the rng, so no deck lays out differently. */
  function passageDetail(m, pal, fy, ps, portZ, stbdZ, p, hasCargo) {
    var HW = PASSAGE_HW, top = fy + PASSAGE_H;
    var GAP = DOOR_HW + 0.12;              // keep this clear of a doorway's middle
    /* The stretches of a wall between its doorways. */
    function spans(zs) {
      var out = [], cuts = zs.slice().sort(function (a, b) { return a - b; }), z0 = ps.z0 + 0.05;
      cuts.forEach(function (zc) {
        if (zc - GAP > z0 + 0.05) out.push([z0, zc - GAP]);
        z0 = Math.max(z0, zc + GAP);
      });
      if (ps.z1 - 0.05 > z0 + 0.05) out.push([z0, ps.z1 - 0.05]);
      return out;
    }
    function clear(zs, z, pad) { return !zs.some(function (zc) { return Math.abs(z - zc) < DOOR_HW + pad; }); }
    var SEAM = pal.jamb, PIPE_A = pal.rib, PIPE_B = '#5c4a38', TRAY = pal.overhead, CABLE = '#15191f';

    /* The floor: plates 0.6 m long, a tread runner down the middle. */
    var fz = fy + 0.002;
    quad(m, [-0.22, fz, ps.z0], [0.22, fz, ps.z0], [0.22, fz, ps.z1], [-0.22, fz, ps.z1], pal.floor);
    for (var zp = ps.z0 + 0.6; zp < ps.z1 - 0.1; zp += 0.6) {
      quad(m, [-(HW - 0.12), fz + 0.001, zp - 0.008], [HW - 0.12, fz + 0.001, zp - 0.008],
           [HW - 0.12, fz + 0.001, zp + 0.008], [-(HW - 0.12), fz + 0.001, zp + 0.008], SEAM);
    }
    [-0.22, 0.22].forEach(function (x) {
      quad(m, [x - 0.006, fz + 0.001, ps.z0], [x + 0.006, fz + 0.001, ps.z0], [x + 0.006, fz + 0.001, ps.z1], [x - 0.006, fz + 0.001, ps.z1], SEAM);
    });

    [-1, 1].forEach(function (s) {
      var zs = s < 0 ? portZ : stbdZ, xw = s * HW;
      spans(zs).forEach(function (sp) {
        /* Kick plate, 14 cm, standing 2 cm off the wall. */
        box(m, Math.min(xw, s * (HW - 0.02)), fy, sp[0], Math.max(xw, s * (HW - 0.02)), fy + 0.14, sp[1], SEAM, pal.rib);
        /* Path lights in it, one a metre and a quarter. */
        for (var zl = sp[0] + 0.3; zl < sp[1] - 0.1; zl += 1.25) {
          var xf = s * (HW - 0.022);
          quad(m, [xf, fy + 0.06, zl - 0.05], [xf, fy + 0.06, zl + 0.05], [xf, fy + 0.085, zl + 0.05], [xf, fy + 0.085, zl - 0.05], pal.trim);
        }
        /* A horizontal panel seam at 1.2 m. */
        var xs = s * (HW - 0.006);
        quad(m, [xs, fy + 1.19, sp[0]], [xs, fy + 1.19, sp[1]], [xs, fy + 1.205, sp[1]], [xs, fy + 1.205, sp[0]], SEAM);
      });
      /* Vertical seams halfway between the ribs. */
      for (var zv = ps.z1 - 0.6 - 0.625; zv > ps.z0 + 0.2; zv -= 1.25) {
        if (!clear(zs, zv, 0.1)) continue;
        var xv = s * (HW - 0.006);
        quad(m, [xv, fy + 0.14, zv - 0.007], [xv, fy + 0.14, zv + 0.007], [xv, top - 0.25, zv + 0.007], [xv, top - 0.25, zv - 0.007], SEAM);
      }
    });

    /* The handrail, port side, at hip height, on brackets at the ribs. */
    spans(portZ).forEach(function (sp) {
      if (sp[1] - sp[0] < 0.6) return;
      box(m, -HW + 0.055, fy + 0.96, sp[0] + 0.1, -HW + 0.09, fy + 0.995, sp[1] - 0.1, pal.leaf, pal.leafEdge);
      for (var zb = sp[0] + 0.25; zb < sp[1] - 0.1; zb += 1.25) {
        box(m, -HW, fy + 0.965, zb - 0.015, -HW + 0.06, fy + 0.99, zb + 0.015, SEAM);
      }
    });

    /* Pipes along the port wall under the ceiling, banded every three
     * metres; a cable tray along the starboard wall, above the lockers. */
    function pipeZ(x, y, r, col) {
      var n = 6, ring = [];
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2;
        ring.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
      }
      for (i = 0; i < n; i++) {
        var a2 = ring[i], b2 = ring[(i + 1) % n];
        quad(m, [a2[0], a2[1], ps.z0], [b2[0], b2[1], ps.z0], [b2[0], b2[1], ps.z1], [a2[0], a2[1], ps.z1], col);
      }
      for (var zb2 = ps.z0 + 1.5; zb2 < ps.z1 - 0.5; zb2 += 3) {
        for (i = 0; i < n; i++) {
          var a3 = ring[i], b3 = ring[(i + 1) % n], k = 1.08;
          quad(m, [x + (a3[0] - x) * k, y + (a3[1] - y) * k, zb2 - 0.04], [x + (b3[0] - x) * k, y + (b3[1] - y) * k, zb2 - 0.04],
               [x + (b3[0] - x) * k, y + (b3[1] - y) * k, zb2 + 0.04], [x + (a3[0] - x) * k, y + (a3[1] - y) * k, zb2 + 0.04],
               col === PIPE_B ? pal.hazard : pal.leafEdge);
        }
      }
    }
    pipeZ(-HW + 0.05, top - 0.09, 0.035, PIPE_A);
    pipeZ(-HW + 0.05, top - 0.19, 0.028, PIPE_B);
    box(m, HW - 0.17, top - 0.21, ps.z0, HW - 0.01, top - 0.195, ps.z1, TRAY);
    box(m, HW - 0.15, top - 0.195, ps.z0, HW - 0.04, top - 0.16, ps.z1, CABLE);
    for (var zt = ps.z0 + 0.4; zt < ps.z1 - 0.2; zt += 1.25) {
      box(m, HW - 0.17, top - 0.21, zt - 0.01, HW - 0.01, top - 0.15, zt + 0.01, SEAM);   // a tie-down over the bundle
    }

    /* Vent grilles in the ceiling, either side of the light, every other bay. */
    var cy = top - 0.004;
    for (var zg = ps.z1 - 1.2, bay = 0; zg > ps.z0 + 0.6; zg -= 1.25, bay++) {
      if (bay % 2) continue;
      [-1, 1].forEach(function (s) {
        var x0 = s * 0.2, x1 = s * 0.46;
        quad(m, [x0, cy, zg - 0.22], [x1, cy, zg - 0.22], [x1, cy, zg + 0.22], [x0, cy, zg + 0.22], CABLE);
        for (var k = -2; k <= 2; k++) {
          var zk = zg + k * 0.08;
          quad(m, [x0 + s * 0.02, cy - 0.002, zk - 0.012], [x1 - s * 0.02, cy - 0.002, zk - 0.012],
               [x1 - s * 0.02, cy - 0.002, zk + 0.012], [x0 + s * 0.02, cy - 0.002, zk + 0.012], SEAM);
        }
      });
    }

    /* A fire extinguisher by the aft door, port side; a first-aid box by
     * the fore one. Only where the wall is clear. */
    /* The first clear spot from `z` stepping `dz` along the wall, up to
     * `n` steps; null if there is none. */
    function firstClear(zs, z, dz, n, pad) {
      for (var i3 = 0; i3 <= n; i3++, z += dz) {
        if (z < ps.z0 + 0.3 || z > ps.z1 - 0.3) return null;
        if (clear(zs, z, pad)) return z;
      }
      return null;
    }
    /* Below the handrail (0.96 m), so the two never cross. */
    var zx = firstClear(portZ, ps.z0 + 0.45, 0.4, 6, 0.2);
    if (zx !== null) {
      var xc = -HW + 0.085, r = 0.065, n2 = 8, ring2 = [];
      for (var i2 = 0; i2 < n2; i2++) {
        var a4 = i2 / n2 * Math.PI * 2;
        ring2.push([xc + Math.cos(a4) * r, zx + Math.sin(a4) * r]);
      }
      for (i2 = 0; i2 < n2; i2++) {
        var c1 = ring2[i2], c2 = ring2[(i2 + 1) % n2];
        quad(m, [c1[0], fy + 0.25, c1[1]], [c2[0], fy + 0.25, c2[1]], [c2[0], fy + 0.75, c2[1]], [c1[0], fy + 0.75, c1[1]], '#b8261f');
        tri(m, [xc, fy + 0.78, zx], [c1[0], fy + 0.75, c1[1]], [c2[0], fy + 0.75, c2[1]], '#b8261f');
      }
      box(m, xc - 0.02, fy + 0.75, zx - 0.02, xc + 0.02, fy + 0.83, zx + 0.02, '#1a1a1a');      // the valve
      box(m, -HW, fy + 0.5, zx - 0.09, -HW + 0.02, fy + 0.54, zx + 0.09, SEAM);                // the bracket
    }
    var za = firstClear(portZ, ps.z1 - 0.55, -0.4, 8, 0.2);
    if (za !== null) {
      box(m, -HW, fy + 1.35, za - 0.17, -HW + 0.09, fy + 1.6, za + 0.17, '#e6e9ec');
      var xa = -HW + 0.092;
      quad(m, [xa, fy + 1.455, za - 0.06], [xa, fy + 1.455, za + 0.06], [xa, fy + 1.495, za + 0.06], [xa, fy + 1.495, za - 0.06], '#1f9d55');
      quad(m, [xa, fy + 1.415, za - 0.02], [xa, fy + 1.415, za + 0.02], [xa, fy + 1.535, za + 0.02], [xa, fy + 1.535, za - 0.02], '#1f9d55');
    }

    /* SIGNS. Fore and aft name what is at each end; the airlock's points at
     * its door. Lit in the palette's trim, on a console-dark plate. */
    var CK = global.CargoKit;
    if (!CK || !CK.textRows) return;
    function arrowRows(right) {
      var a = ['   #   ', '    #  ', '     # ', '#######', '     # ', '    #  ', '   #   '];
      return right ? a : a.map(function (r) { return r.split('').reverse().join(''); });
    }
    /* A sign on the wall x = side·HW, centred at z, saying `word` with an
     * arrow pointing along +z (dir 1) or −z (dir −1). The reader faces the
     * wall; their right is n × up with n the wall's normal into the
     * passage (see cargokit.js faceFrame), which for x = side·HW is
     * (0, 0, −side): so +z is on their right on the port wall. */
    function sign(side, z, y, word, dir, off) {
      var nx = -side, rightZ = nx;                        // reader's right along z: sign of nx
      var pointsRight = dir * rightZ > 0;
      var txt = CK.textRows(word), arr = arrowRows(pointsRight), rows = [];
      for (var r = 0; r < 7; r++) rows.push(pointsRight ? txt[r] + '   ' + arr[r] : arr[r] + '   ' + txt[r]);
      var cols = rows[0].length, cell = 0.013, w = cols * cell + 0.06, h = 7 * cell + 0.05;
      var xw = side * (HW - 0.008 - (off || 0)), xs = side * (HW - 0.014 - (off || 0));
      /* The plate, then the lit cells, one quad a run. u runs along the
       * reader's right: +z·rightZ. */
      function at(uu, vv, x) { return [x, y + vv, z + rightZ * uu]; }
      quad(m, at(-w / 2, -h / 2, xw), at(w / 2, -h / 2, xw), at(w / 2, h / 2, xw), at(-w / 2, h / 2, xw), pal.console);
      for (var rr = 0; rr < 7; rr++) {
        var row = rows[rr], st = 0;
        for (var cc = 1; cc <= cols; cc++) {
          if (cc < cols && row.charAt(cc) === row.charAt(st)) continue;
          if (row.charAt(st) === '#') {
            var u0 = -cols * cell / 2 + st * cell, u1 = -cols * cell / 2 + cc * cell;
            var v1 = 3.5 * cell - rr * cell, v0 = v1 - cell;
            quad(m, at(u0, v0, xs), at(u1, v0, xs), at(u1, v1, xs), at(u0, v1, xs), pal.trim);
          }
          st = cc;
        }
      }
    }
    var foreWord = p.decks ? 'LIFT' : 'BRIDGE';
    /* Where things already hang on each wall, so no two signs (or a sign
     * and the first-aid box) overlap. */
    var taken = { '-1': za !== null ? [za] : [], '1': [] };
    function free(side, z) {
      return taken[side].every(function (t) { return Math.abs(t - z) > 0.75; });
    }
    /* The airlock's first: beside its door on the same wall (across from
     * it, an arrow at the door would be an arrow at the wall), pointing
     * along to it. */
    var dLk = doorById(p, 'lock');
    if (dLk && dLk.zc > ps.z0 && dLk.zc < ps.z1) {
      var zs2 = dLk.zc + (dLk.zc + 1.2 < ps.z1 ? 1.0 : -1.0);
      if (clear(portZ, zs2, 0.3) && free(-1, zs2)) {
        sign(-1, zs2, fy + 1.78, 'AIRLOCK', zs2 > dLk.zc ? -1 : 1);
        taken['-1'].push(zs2);
      }
    }
    /* Fore and aft signs near each end, at eye height, stepping in from
     * the end (`dz`) past doorways and other signs: on the port wall
     * (between the handrail and the pipes) where it is clear, else on the
     * starboard wall, stood off it far enough to hang in front of a locker. */
    function placeSign(z, word, dir, dz) {
      for (var i4 = 0; i4 <= 10; i4++, z += dz) {
        if (z < ps.z0 + 0.5 || z > ps.z1 - 0.5) return;
        var sides = [-1, 1];
        for (var j4 = 0; j4 < 2; j4++) {
          var sd = sides[j4], zs4 = sd < 0 ? portZ : stbdZ;
          if (clear(zs4, z, 0.45) && free(sd, z)) {
            sign(sd, z, fy + 1.78, word, dir, sd > 0 ? 0.012 : 0);
            taken[String(sd)].push(z);
            return;
          }
        }
      }
    }
    placeSign(ps.z0 + 1.1, foreWord, 1, 0.4);
    if (hasCargo) placeSign(ps.z1 - 1.1, 'CARGO', -1, -0.4);
  }

  /* THE CARGO BAY: crates stacked down both walls, hazard lines either side
   * of the aisle, lights in rows, the manifest terminal by the door. */
  function cargoMesh(m, pal, fy, r, p) {
    var top = fy + (r.y1 || CARGO_H);
    boxRoom(m, r.x0, fy, r.z0, r.x1, top, r.z1, pal.lockWall, pal.passFloor, pal.ceil, ['z1']);
    var CRATE = ['#4a5a4a', '#5a4e3a', '#3e4c5e', '#5e3e36'];
    /* THE CONTAINERS (2026-10-30): one kind per kind of cargo, from Claude
     * Design's sheet (cargokit.js) — a cryo tank of hydrogen, a hopper of
     * ore, a shielded cask of waste, each with its placard and its cargo's
     * name on the strip. Fronts to the aisle, two high. A stack with no
     * cargo named (no ship to ask) is a crate of some kind from its tint. */
    var CK = global.CargoKit, ECO = global.Economy;
    var kitH = CK ? CK.HEIGHT * CRATE_SCALE + CRATE_GAP : 0;
    p.crates.forEach(function (c) {
      if (CK) {
        var kinds = CK.kinds();
        var ccx = (c.x0 + c.x1) / 2, ccz = (c.z0 + c.z1) / 2;
        for (var k = 0; k < c.high; k++) {
          /* Each level its own cargo when the stack is mixed. */
          var cidK = c.levels && c.levels[k] ? c.levels[k].cid : c.cid;
          var kind = cidK ? CK.kindFor(cidK) : kinds[Math.floor(c.tint * kinds.length) % kinds.length];
          var cm = ECO && ECO.BY_ID && cidK ? ECO.BY_ID[cidK] : null;
          CK.build(m, kind, { x: ccx, y: fy + k * kitH, z: ccz, yaw: ccx < 0 ? Math.PI / 2 : -Math.PI / 2,
                              scale: CRATE_SCALE, label: cm ? cm.name : '' });
        }
        return;
      }
      var col = CRATE[Math.floor(c.tint * CRATE.length) % CRATE.length];
      for (var h = 0; h < c.high; h++) {
        var y0 = fy + h * 0.72, inset = h ? 0.04 : 0;
        box(m, c.x0 + inset, y0, c.z0 + inset, c.x1 - inset, y0 + 0.7, c.z1 - inset, col, pal.rib);
        /* A band round each, a stencil-strip of the hazard colour. */
        quad(m, [c.x0 + inset - 0.002, y0 + 0.3, c.z0 + inset], [c.x0 + inset - 0.002, y0 + 0.3, c.z1 - inset],
             [c.x0 + inset - 0.002, y0 + 0.36, c.z1 - inset], [c.x0 + inset - 0.002, y0 + 0.36, c.z0 + inset], pal.hazard);
        quad(m, [c.x1 - inset + 0.002, y0 + 0.3, c.z0 + inset], [c.x1 - inset + 0.002, y0 + 0.3, c.z1 - inset],
             [c.x1 - inset + 0.002, y0 + 0.36, c.z1 - inset], [c.x1 - inset + 0.002, y0 + 0.36, c.z0 + inset], pal.hazard);
      }
    });
    [-1, 1].forEach(function (s) {
      var x0 = s * 0.8, x1 = s * 0.86;
      quad(m, [x0, fy + 0.004, r.z0 + 0.2], [x1, fy + 0.004, r.z0 + 0.2], [x1, fy + 0.004, r.z1 - 0.2], [x0, fy + 0.004, r.z1 - 0.2], pal.hazard);
      quad(m, [s * 0.6 - 0.05, top - 0.006, r.z0 + 0.4], [s * 0.6 + 0.05, top - 0.006, r.z0 + 0.4],
           [s * 0.6 + 0.05, top - 0.006, r.z1 - 0.4], [s * 0.6 - 0.05, top - 0.006, r.z1 - 0.4], pal.light);
    });
    var man = p.items.filter(function (it) { return it.kind === 'cargo'; })[0];
    if (man) {
      var c = man.counter;
      box(m, c[0], fy, c[1], c[2], fy + 1.1, c[3], pal.console);
      quad(m, [c[0] - 0.004, fy + 0.95, c[1] + 0.03], [c[0] - 0.004, fy + 0.95, c[3] - 0.03],
           [c[0] - 0.004, fy + 1.4, c[3] - 0.03], [c[0] - 0.004, fy + 1.4, c[1] + 0.03], pal.trim);
    }
  }

  /* ---- the decks' meshes (2026-10-25) -------------------------------------- */
  /* Append `src` to `dst`, moved `dy` up. */
  function merge(dst, src, dy) {
    var n = dst.v.length;
    for (var i = 0; i < src.v.length; i++) dst.v.push([src.v[i][0], src.v[i][1] + (dy || 0), src.v[i][2]]);
    for (i = 0; i < src.f.length; i++) dst.f.push([src.f[i][0] + n, src.f[i][1] + n, src.f[i][2] + n]);
    for (i = 0; i < src.c.length; i++) dst.c.push(src.c[i]);
  }

  /* Beside a lift's landing door, on the wall at `z` facing `dir` (+1 aft
   * into the room behind, -1 forward): a lit panel with the deck's mark, so
   * a landing is found from down the corridor. */
  function liftSign(m, pal, fy, z, dir, deck, p) {
    var x0 = DOOR_HW + 0.15, x1 = DOOR_HW + 0.45;
    quad(m, [x0, fy + 1.2, z], [x1, fy + 1.2, z], [x1, fy + 1.7, z], [x0, fy + 1.7, z], pal.console);
    /* One bar per deck from the top, this deck's lit. */
    var order = p.deckOrder || [];
    order.forEach(function (dk, i) {
      var y = fy + 1.62 - i * 0.1;
      quad(m, [x0 + 0.05, y - 0.05, z + dir * 0.002], [x1 - 0.05, y - 0.05, z + dir * 0.002],
           [x1 - 0.05, y, z + dir * 0.002], [x0 + 0.05, y, z + dir * 0.002], dk === deck ? pal.trim : pal.rib);
    });
  }

  /* THE JUNCTION: the lift's landing, the forward platform, the tramway
   * with its rail and the lights strung down it (which is what makes the
   * ride read as a ride), the aft platform, and the engine room. */
  function junctionMesh(m, pal, p) {
    var fy = p.deckY.junction;
    var pa = p.rooms.filter(function (r) { return r.id === 'platform-fwd'; })[0];
    var pb = p.rooms.filter(function (r) { return r.id === 'platform-aft'; })[0];
    var way = roomByKind(p, 'tramway'), er = roomByKind(p, 'engine');
    var dLJ = doorById(p, 'lift-junction'), dE = doorById(p, 'engine');
    var top = fy + pa.y1;
    bulkhead(m, pal, fy, dLJ.wall[1], CAR_HW, fy + CAR_H, dLJ.wall[0], PLAT_HW, top, false, [pal.lockWall, pal.passWall]);
    liftSign(m, pal, fy, dLJ.wall[0] - 0.006, -1, 'junction', p);
    [pa, pb].forEach(function (pl) {
      boxRoom(m, pl.x0, fy, pl.z0, pl.x1, top, pl.z1, pal.passWall, pal.passFloor, pal.ceil, ['z0', 'z1']);
      /* Each platform's end wall round the tramway's mouth. */
      var zEnd = pl === pa ? pl.z0 : pl.z1;
      quad(m, [pl.x0, fy, zEnd], [-TRAM_HW, fy, zEnd], [-TRAM_HW, top, zEnd], [pl.x0, top, zEnd], pal.passWall);
      quad(m, [TRAM_HW, fy, zEnd], [pl.x1, fy, zEnd], [pl.x1, top, zEnd], [TRAM_HW, top, zEnd], pal.passWall);
      /* The edge: a hazard strip where the platform stops. */
      var ze = pl === pa ? pl.z0 + 0.12 : pl.z1 - 0.12;
      quad(m, [-TRAM_HW, fy + 0.004, ze - 0.1], [TRAM_HW, fy + 0.004, ze - 0.1], [TRAM_HW, fy + 0.004, ze + 0.1], [-TRAM_HW, fy + 0.004, ze + 0.1], pal.hazard);
      quad(m, [-0.06, top - 0.01, pl.z0 + 0.3], [0.06, top - 0.01, pl.z0 + 0.3], [0.06, top - 0.01, pl.z1 - 0.3], [-0.06, top - 0.01, pl.z1 - 0.3], pal.light);
    });
    /* The tramway: a tube a little below the platforms, two rails, lights
     * every four metres down both walls. */
    var wy = fy - 0.35;
    boxRoom(m, way.x0, wy, way.z0, way.x1, top, way.z1, pal.lockWall, pal.hazardDark, pal.ceil, ['z0', 'z1']);
    [-0.6, 0.6].forEach(function (x) { box(m, x - 0.04, wy, way.z0, x + 0.04, wy + 0.12, way.z1, pal.rib); });
    for (var z = way.z1 - 2; z > way.z0 + 1; z -= 4) {
      [-1, 1].forEach(function (s) {
        var x = s * (TRAM_HW - 0.004);
        quad(m, [x, top - 0.5, z - 0.4], [x, top - 0.5, z + 0.4], [x, top - 0.35, z + 0.4], [x, top - 0.35, z - 0.4], pal.light);
      });
      quad(m, [-TRAM_HW, wy + 0.004, z - 0.05], [TRAM_HW, wy + 0.004, z - 0.05], [TRAM_HW, wy + 0.004, z + 0.05], [-TRAM_HW, wy + 0.004, z + 0.05], pal.rib);
    }
    /* The engine room, through its door at the aft platform. */
    bulkhead(m, pal, fy, dE.wall[1], PLAT_HW, top, dE.wall[0], (er.x1 - er.x0) / 2, fy + ENGINE_H, false, [pal.passWall, pal.lockWall]);
    var etop = fy + ENGINE_H;
    boxRoom(m, er.x0, fy, er.z0, er.x1, etop, er.z1, pal.lockWall, pal.passFloor, pal.ceil, ['z1']);
    var glow = DRIVE_GLOW[p.palette] || DRIVE_GLOW.civil, dr = p.drive;
    [[dr.x0, dr.x1, -1], [er.x0, er.x0 + (dr.x1 - dr.x0), 1]].forEach(function (t) {
      box(m, t[0], fy, dr.z0, t[1], etop - 0.35, dr.z1, pal.bulk, pal.overhead);
      var face = t[2] < 0 ? t[0] - 0.004 : t[1] + 0.004, span = dr.z1 - dr.z0;
      for (var i = 0; i < dr.bands; i++) {
        var zb = dr.z0 + span * (i + 1) / (dr.bands + 1);
        quad(m, [face, fy + 0.3, zb - 0.06], [face, fy + 0.3, zb + 0.06], [face, etop - 0.6, zb + 0.06], [face, etop - 0.6, zb - 0.06], glow);
      }
    });
    var con = p.items.filter(function (it) { return it.kind === 'engine' && it.deck === 'junction'; })[0];
    if (con) {
      var c = con.counter, dy = fy + 0.84;
      box(m, c[0], fy, c[1], c[2], dy, c[3], pal.console);
      quad(m, [c[0], dy, c[3]], [c[2], dy, c[3]], [c[2], fy + 1.6, c[1] + 0.06], [c[0], fy + 1.6, c[1] + 0.06], pal.console);
      quad(m, [c[0] + 0.1, dy + 0.2, c[3] - 0.1], [c[2] - 0.1, dy + 0.2, c[3] - 0.1], [c[2] - 0.1, fy + 1.45, c[1] + 0.2], [c[0] + 0.1, fy + 1.45, c[1] + 0.2], glow);
    }
    quad(m, [-0.05, etop - 0.006, er.z0 + 0.4], [0.05, etop - 0.006, er.z0 + 0.4], [0.05, etop - 0.006, er.z1 - 0.4], [-0.05, etop - 0.006, er.z1 - 0.4], pal.light);
  }

  /* THE HANGAR (Carrier): the landing, one tall bay, the pads marked out,
   * the doors at the aft end lit along their seam. Your craft on the pads
   * are drawn by render.js from your fleet. */
  function hangarMesh(m, pal, p) {
    var fy = p.deckY.hangar, bay = roomByKind(p, 'hangar'), dLH = doorById(p, 'lift-hangar');
    var top = fy + HANGAR[2];
    bulkhead(m, pal, fy, dLH.wall[1], CAR_HW, fy + CAR_H, dLH.wall[0], bay.x1, top, false, [pal.lockWall, pal.lockWall]);
    liftSign(m, pal, fy, dLH.wall[0] - 0.006, -1, 'hangar', p);
    boxRoom(m, bay.x0, fy, bay.z0, bay.x1, top, bay.z1, pal.lockWall, pal.passFloor, pal.ceil, ['z1']);
    /* The doors: two leaves across the aft wall, a lit seam and edges. */
    var zd = bay.z0 + 0.01;
    quad(m, [bay.x0 + 1, fy, zd], [-0.05, fy, zd], [-0.05, top - 1, zd], [bay.x0 + 1, top - 1, zd], pal.leaf);
    quad(m, [0.05, fy, zd], [bay.x1 - 1, fy, zd], [bay.x1 - 1, top - 1, zd], [0.05, top - 1, zd], pal.leaf);
    quad(m, [-0.05, fy, zd + 0.002], [0.05, fy, zd + 0.002], [0.05, top - 1, zd + 0.002], [-0.05, top - 1, zd + 0.002], pal.trim);
    quad(m, [bay.x0 + 1, top - 1.1, zd + 0.002], [bay.x1 - 1, top - 1.1, zd + 0.002], [bay.x1 - 1, top - 1, zd + 0.002], [bay.x0 + 1, top - 1, zd + 0.002], pal.leafEdge);
    /* Pads: a hazard ring and a lit centre mark each. */
    (p.hangarPads || []).forEach(function (pd) {
      var N = 16;
      for (var i = 0; i < N; i++) {
        var a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, r0 = pd.r - 0.25, r1 = pd.r;
        quad(m, [pd.x + Math.cos(a0) * r0, fy + 0.004, pd.z + Math.sin(a0) * r0], [pd.x + Math.cos(a1) * r0, fy + 0.004, pd.z + Math.sin(a1) * r0],
             [pd.x + Math.cos(a1) * r1, fy + 0.004, pd.z + Math.sin(a1) * r1], [pd.x + Math.cos(a0) * r1, fy + 0.004, pd.z + Math.sin(a0) * r1],
             i % 2 ? pal.hazard : pal.hazardDark);
      }
      quad(m, [pd.x - 0.3, fy + 0.005, pd.z - 0.3], [pd.x + 0.3, fy + 0.005, pd.z - 0.3], [pd.x + 0.3, fy + 0.005, pd.z + 0.3], [pd.x - 0.3, fy + 0.005, pd.z + 0.3], pal.trim);
    });
    /* A walkway line from the lift to the doors, and the lights. */
    quad(m, [-0.06, fy + 0.004, bay.z0 + 1], [0.06, fy + 0.004, bay.z0 + 1], [0.06, fy + 0.004, bay.z1 - 0.5], [-0.06, fy + 0.004, bay.z1 - 0.5], pal.hazard);
    for (var z = bay.z1 - 3; z > bay.z0 + 2; z -= 6) {
      [-6, 0, 6].forEach(function (x) {
        quad(m, [x - 0.6, top - 0.01, z - 0.15], [x + 0.6, top - 0.01, z - 0.15], [x + 0.6, top - 0.01, z + 0.15], [x - 0.6, top - 0.01, z + 0.15], pal.light);
      });
    }
  }

  /* THE CAR, built at floor y = 0 and drawn where it is (render.js moves
   * it): walls with a doorway fore and aft, a light, the button panel on
   * the starboard wall, a floor indicator over each door. `doors` is the
   * pair of inner leaves shown only while it moves, so the shaft is never
   * seen. */
  function carMesh(pal, p) {
    var m = mesh(), z0 = p.carZ[0], z1 = p.carZ[1], h = CAR_H, dh = DOOR_H;
    quad(m, [-CAR_HW, 0, z0], [CAR_HW, 0, z0], [CAR_HW, 0, z1], [-CAR_HW, 0, z1], pal.passFloor);
    quad(m, [-CAR_HW, h, z0], [CAR_HW, h, z0], [CAR_HW, h, z1], [-CAR_HW, h, z1], pal.ceil);
    [-CAR_HW, CAR_HW].forEach(function (x) { quad(m, [x, 0, z0], [x, 0, z1], [x, h, z1], [x, h, z0], pal.lockWall); });
    [z0, z1].forEach(function (z) {
      quad(m, [-CAR_HW, 0, z], [-DOOR_HW, 0, z], [-DOOR_HW, h, z], [-CAR_HW, h, z], pal.lockWall);
      quad(m, [DOOR_HW, 0, z], [CAR_HW, 0, z], [CAR_HW, h, z], [DOOR_HW, h, z], pal.lockWall);
      quad(m, [-DOOR_HW, dh, z], [DOOR_HW, dh, z], [DOOR_HW, h, z], [-DOOR_HW, h, z], pal.lockWall);
      quad(m, [-0.15, dh + 0.08, z + (z === z0 ? 0.004 : -0.004)], [0.15, dh + 0.08, z + (z === z0 ? 0.004 : -0.004)],
           [0.15, dh + 0.22, z + (z === z0 ? 0.004 : -0.004)], [-0.15, dh + 0.22, z + (z === z0 ? 0.004 : -0.004)], pal.trim);
    });
    quad(m, [-0.4, h - 0.01, z0 + 0.4], [0.4, h - 0.01, z0 + 0.4], [0.4, h - 0.01, z1 - 0.4], [-0.4, h - 0.01, z1 - 0.4], pal.light);
    /* The button panel, and a lit square per button (the buttons are the
     * `liftbtn` items; this is where they are). */
    var xp = CAR_HW - 0.004, n = (p.deckOrder || []).length - 1;
    quad(m, [xp, 1.0, z0 + 0.2], [xp, 1.0, z0 + 0.5 + n * 0.4], [xp, 1.5, z0 + 0.5 + n * 0.4], [xp, 1.5, z0 + 0.2], pal.console);
    for (var i = 0; i < n; i++) {
      var zb = z0 + 0.35 + i * 0.4;
      quad(m, [xp - 0.002, 1.18, zb - 0.07], [xp - 0.002, 1.18, zb + 0.07], [xp - 0.002, 1.32, zb + 0.07], [xp - 0.002, 1.32, zb - 0.07], pal.trim);
    }
    box(m, -CAR_HW + 0.02, 0.9, z0 + 0.2, -CAR_HW + 0.06, 0.95, z1 - 0.2, pal.rib);
    var doors = mesh();
    [z0 + 0.03, z1 - 0.03].forEach(function (z) {
      quad(doors, [-DOOR_HW, 0, z], [DOOR_HW, 0, z], [DOOR_HW, dh, z], [-DOOR_HW, dh, z], pal.leaf);
      quad(doors, [-0.02, 0.05, z], [0.02, 0.05, z], [0.02, dh - 0.05, z], [-0.02, dh - 0.05, z], pal.leafEdge);
    });
    return { body: m, doors: doors };
  }

  /* THE TRAM, built round z = 0 at floor y = 0: an open car on the rails,
   * a bench each way, grab poles, a roof with a light. */
  function tramMesh(pal) {
    var m = mesh(), hw = TRAM_HW - 0.12, hl = TRAM_L / 2;
    box(m, -hw, -0.35, -hl, hw, 0, hl, pal.console, pal.passFloor);
    [-1, 1].forEach(function (s) {
      box(m, -hw + 0.1, 0, s * (hl - 0.45), hw - 0.1, 0.45, s * (hl - 0.05), pal.seat, pal.seatPad);
      box(m, -hw + 0.1, 0.45, s * (hl - 0.12), hw - 0.1, 1.0, s * (hl - 0.02), pal.seat);
      [-hw + 0.05, hw - 0.05].forEach(function (x) { box(m, x - 0.025, 0, s * 0.6 - 0.025, x + 0.025, 2.1, s * 0.6 + 0.025, pal.rib); });
    });
    box(m, -hw, 2.1, -hl, hw, 2.18, hl, pal.console);
    quad(m, [-0.3, 2.095, -hl + 0.3], [0.3, 2.095, -hl + 0.3], [0.3, 2.095, hl - 0.3], [-0.3, 2.095, hl - 0.3], pal.light);
    [-hl, hl].forEach(function (z) {
      quad(m, [-hw, -0.3, z], [hw, -0.3, z], [hw, -0.05, z], [-hw, -0.05, z], pal.hazard);
    });
    return m;
  }

  /* An inside-out box: the walls of a room. `skip` names the ends that are
   * bulkheads drawn elsewhere ('ceil' for a ceiling cut round something). */
  /* THE TOWER'S GLASS (2026-10-25). Astra: "the tower has a 360 degree
   * window view". A room's side walls become a run of panes between sill
   * and head, split by mullions; on the bridge deck the aft bulkhead does
   * too either side of its door, so the view goes all the way round to the
   * flight deck or the stern behind you. The panes are portals like the
   * windscreen's — depth-only, EPS inside the wall — so the wall behind
   * each is the frame round it, and a console against the wall still
   * stands in front of the glass. */
  function towerGlass(room, portals, pal, fy, cy, r, aftDoor, aft) {
    var y0 = fy + GLASS_SILL, y1 = cy - GLASS_HEAD;
    if (y1 < y0 + 0.4) return;
    function run(a0, a1, put) {
      var L = a1 - a0;
      if (L < 0.4) return;
      var n = Math.max(1, Math.round(L / 1.6)), step = L / n, mw = 0.06;
      for (var i = 0; i < n; i++) {
        var s0 = a0 + i * step + (i ? mw : 0), s1 = a0 + (i + 1) * step - (i < n - 1 ? mw : 0);
        put(s0, s1);
      }
    }
    [r.x0 + EPS, r.x1 - EPS].forEach(function (x) {
      run(r.z0 + 0.3, r.z1 - 0.3, function (z0, z1) {
        quad(portals, [x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], '#000000');
      });
    });
    if (aft && aftDoor) {
      /* Between the lobby's wall and the deck's: narrow on a bridge as
       * wide as these, but they are what you see the stern through. */
      var z = aftDoor.wall[1] + EPS, gap = LOBBY_HW + 0.12;
      run(gap, r.x1 - 0.12, function (a, b) {
        quad(portals, [a, y0, z], [b, y0, z], [b, y1, z], [a, y1, z], '#000000');
        quad(portals, [-a, y0, z], [-b, y0, z], [-b, y1, z], [-a, y1, z], '#000000');
      });
    }
  }

  function boxRoom(m, x0, y0, z0, x1, y1, z1, wall, floor, ceil, skip) {
    skip = skip || [];
    if (skip.indexOf('floor') < 0) quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], floor);
    if (skip.indexOf('ceil') < 0) quad(m, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], ceil);
    if (skip.indexOf('x0') < 0) quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], wall);
    if (skip.indexOf('x1') < 0) quad(m, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], wall);
    if (skip.indexOf('z0') < 0) quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], wall);
    if (skip.indexOf('z1') < 0) quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], wall);
  }

  var ShipDeck = {
    DOOR_HW: DOOR_HW, DOOR_H: DOOR_H, WALL_T: WALL_T, PASSAGE_LEN: PASSAGE_LEN,
    LOCK_HW: LOCK_HW, DOOR_REACH: DOOR_REACH, DOOR_TIME: DOOR_TIME, SEAT: SEAT,
    PALETTES: PALETTES, SYNDICATE: SYNDICATE, NAVY: NAVY,
    CRATE_STACK: CRATE_STACK, CRATE_SCALE: CRATE_SCALE,
    paletteFor: paletteFor, plan: plan, planFitted: planFitted, updateDoors: updateDoors, leafTravel: leafTravel,
    meshes: meshes, frame: frame,
    stationScreen: stationScreen, STATION_SCREEN_PX: STATION_SCREEN_PX,
    DECKED: DECKED, TOWER: TOWER, LIFT_SPEED: LIFT_SPEED, liftSpeed: liftSpeed, TRAM_SPEED: TRAM_SPEED, DECK_NAME: DECK_NAME,
    CAR_H: CAR_H, HANGAR: HANGAR,
    stationRoles: stationRoles, ROLE_NAME: ROLE_NAME, STATION_MAX: STATION_MAX,
    doorById: doorById, roomByKind: roomByKind,
    rampShape: rampShape, rampMesh: rampMesh, rampFloor: rampFloor, rampPoint: rampPoint,
    LOCK_W: LOCK_W, LOCK_LAND: LOCK_LAND, RAMP_MAX: RAMP_MAX
  };

  global.ShipDeck = ShipDeck;
  if (typeof module !== 'undefined' && module.exports) module.exports = ShipDeck;
})(typeof window !== 'undefined' ? window : globalThis);
