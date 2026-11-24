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
  /* The naval decks' layout (navaldeck.js): in the page a script tag before
   * this one; headless (the tests, the tools), a file beside it. */
  if (!global.NavalDeck && typeof require === 'function') {
    try { require('./navaldeck.js'); } catch (e) { /* without it, the decks are as they were */ }
  }

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
  /* A LONGER, GENTLER RAMP (2026-11-03). Astra: "the ramp should be
   * longer", asked the same day as her ship standing half a metre higher
   * on her gear (render.js GEAR_LIFT). It was cut at 30°: 5.5 m of ramp at
   * 28.5° on a Talon, which is a stair's pitch with no treads, and the
   * lift alone would have steepened it (6.5 m at 28.7° once the room was
   * re-sized for the higher deck). 22° is about 1 in 2.5 - still steeper
   * than a building's ramp (1 in 12) but the pitch of a loading ramp or a
   * ship's gangway, walkable upright without reaching for the rail; on a
   * Talon that is 8.7 m of ramp at 21.1°. A drop too tall for 22° inside
   * RAMP_MAX no longer jumps straight to a 40° stair: it takes the whole
   * RAMP_MAX at whatever pitch that gives, up to 33° (RAMP_STEEP: the old
   * cut was 30°, and the Bollard, whose ramp has to stop short of a gear
   * door at 8 m, needs 32.1° for her room's quarter-metre drop - 31.3° as
   * built - to stay a ramp rather than become a 41° stair), and only past
   * that is it a stair. Measured over every hull
   * with her lifted drop: every room stays inside her (airlock.test.js). */
  var RAMP_SLOPE = 22 * Math.PI / 180, RAMP_STEEP = 33 * Math.PI / 180, STAIR_SLOPE = 42 * Math.PI / 180;
  /* The old cut, kept as the yardstick render.js shipInterior plans against:
   * a longer ramp is never allowed to cost her a room that 30° left her. */
  var RAMP_CUT_SLOPE = 30 * Math.PI / 180;
  var RAMP_MAX = 10.0;                     // m of ramp a room is allowed to hold
  var LIFT_LEN = 2.6;                      // m, a lift platform, fore and aft
  /* `maxLen` (optional): the longest ramp her own hull leaves room for
   * under her - render.js shipInterior measures where her gear legs stand
   * in the ramp's path, so a lengthened ramp does not run through a leg
   * (the Kestrel's and the Bollard's did, measured 2026-11-03). */
  function rampShape(drop, size, maxLen) {
    drop = drop > 0 ? drop : 2.6;
    var hw = RAMP_HW[size] || 0.75, MAX = maxLen > 0 ? Math.min(RAMP_MAX, maxLen) : RAMP_MAX;
    var len = drop / Math.sin(RAMP_SLOPE);
    if (len <= MAX) return { mode: 'ramp', len: Math.max(1.6, len), angle: Math.asin(Math.min(1, drop / Math.max(1.6, len))), drop: drop, hw: hw };
    if (drop / MAX <= Math.sin(RAMP_STEEP) + 1e-9) return { mode: 'ramp', len: MAX, angle: Math.asin(drop / MAX), drop: drop, hw: hw };
    len = drop / Math.sin(STAIR_SLOPE);
    if (len <= MAX) return { mode: 'stair', len: len, angle: STAIR_SLOPE, drop: drop, hw: hw };
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

  /* ---- A COCKPIT UP IN HER NOSE (2026-11-02) --------------------------------
   * Astra, of the Talon: "the cockpit on the starting ship is recessed into
   * the block that juts out with the cockpit glass on it ... it should be
   * cut into the nose block." Asked which block, she chose the jutting one:
   * the pilot sits up in it, right behind the glass, a step up from the
   * passage.
   *
   * Why it was recessed: tools/fit-hulls.js puts the eye at the lowest point
   * where every room fits, so the ramp is short, and never looks at the
   * glass. On the Talon that left the eye a metre aft of the canopy and
   * level with its bottom edge, the cockpit floor down in the wedge below
   * the nose block, and the wedge's own sloping skin running through the
   * room. Moving the whole deck up and forward to fix it does not fit: her
   * passage then comes out through the top of the block and her airlock
   * through her side (measured: 19 core samples out at the eye she wanted,
   * and lengthening her to 34 m does not cure it).
   *
   * So the cockpit alone goes up into the block, and the deck stays exactly
   * where fit-hulls put it. `rise` lifts the cockpit's floor above the
   * deck's (negative: the cockpit is DOWN a stair); `fwd` moves the eye
   * forward of where fit-hulls put it (render.js cockpitAt adds both); `run`
   * is the stair between them, `treads` of it, aft of the old bulkhead (aft
   * of the bridge deck, on a hull with one: it goes up with the helm), the
   * bridge door at its foot on the deck. Every room aft of the door is
   * planned `fwd - run` further aft in the cockpit's frame, which is where
   * it was in her hull. Only hulls listed here are changed; fit-hulls knows
   * nothing of this, and its `at` stays the deck's eye (the eye before).
   *
   * EVERY HULL WHOSE GLASS IS NOT THE FRONT OF HER COCKPIT (same day).
   * Astra: "the cockpit fix should apply to all ships IF the glass isn't
   * the forward-most part of the cockpit." Measured per hull by
   * tools/fit-raised.js — her model's canopy box against her planned
   * cockpit — and each raise below is what it found: the eye within half a
   * metre of the glass, the windscreen no further forward than it, every
   * room still inside her and none given up, and no wall of the cockpit
   * but its windscreen outside her skin. Rerun it when a model, a deck
   * plan or hullfit.js changes. Left alone, and why (the tool says so too):
   *   - at her glass already: Samaritan Tender, Heron Heavy Shuttle;
   *   - glass box not a canopy (off her centreline, or aft of her middle:
   *     a side window or a wing panel named as glass): Coldwater Tanker,
   *     Naval Cutter, Corsair Runner, Syndicate Heavy;
   *   - decked or towered, her cockpit a deck of its own reached by lift:
   *     Meridian, Leviathan, Crawler, Capital, Carrier;
   *   - the Mule qualifies (eye 8.3 m from her glass) but no raise fits:
   *     her bridge deck, raised with the helm, comes out through her skin
   *     at every eye the tool tried. */
  var RAISED = {
    /* Chosen by hand before the tool existed, and kept: eye 0.5 m up and
     * 1.2 m forward, [0, -0.05, 10.6] in her 25 m hull, 0.15 m aft of the
     * canopy, the windscreen across the glass's height, the cockpit floor
     * (-1.15) on the block's own underside, and not one sample of the
     * cockpit outside her (the tool's own pick has its windscreen row
     * grazing the glass). */
    talon: { rise: 0.5, fwd: 1.2, run: 0.6, treads: 2 },
    /* tools/fit-raised.js, 2026-11-02. */
    dart: { rise: -0.078, fwd: 3.587, run: 0.5, treads: 1 },
    kestrel: { rise: 0.611, fwd: 3.421, run: 1, treads: 3 },
    wren: { rise: 0.262, fwd: 2.016, run: 0.75, treads: 2 },
    /* Her windscreen stood 0.3 m ahead of her glass: moved aft, no stair. */
    bollard: { rise: 0, fwd: -0.45, run: 0, treads: 0 },
    /* The tugs' glass is a long way BELOW the eye: down six treads. */
    sump: { rise: -1.302, fwd: 1.25, run: 1.75, treads: 6 },
    heavytug: { rise: -1.306, fwd: 1.301, run: 1.75, treads: 6 },
    longhaul: { rise: 0.458, fwd: 2.616, run: 1, treads: 3 },
    trader: { rise: -0.27, fwd: 0.837, run: 0.75, treads: 2 },
    enforcer: { rise: 0.535, fwd: 5.119, run: 1, treads: 3 },
    fighter: { rise: -0.775, fwd: 4.287, run: 1.25, treads: 4 }
  };
  function raisedCockpit(hullId) { return (hullId && RAISED[hullId]) || null; }

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
  /* THE NAVAL DECKS (claude/naval-decks.md, stage 2, 2026-11-23). On these
   * four the decks under the bridge are navaldeck.js's: her own airlock deck
   * (this file's main deck, the rooms at the foot of her tower) becomes the
   * deck NAVAL_MERGE names, and the old junction and the Carrier's old
   * hangar give way to her engineering deck and her hangar bays. The
   * Carrier's airlock deck is her hangar deck, 43.6 m under her island cab
   * rather than 35 (the deck her island stood on). */
  var NAVAL_MERGE = { capital: '1', carrier: '1', meridian: 'B', leviathan: 'A' };
  TOWER.carrier = 43.6;
  var LOBBY_L = 1.8, LOBBY_HW = 1.0;
  /* A LONGER LOBBY WHERE THE SHAFT HAS TO GO FURTHER AFT (2026-11-02).
   * Astra: "fit the lift in the crawler to the hull". The car sits straight
   * aft of the lobby, and on the Crawler that put the shaft 7.3-9.2 m aft
   * of the bridge door, where her bridge deck is wide but the decks below
   * pass through a gap in her frame: the car on the main and junction decks
   * ran a metre outside her plating (the fit test carried an exemption for
   * it). Measured over every deck at once, a centred 2 x 1.9 m shaft is
   * inside her from 10 m aft to 20 m aft, so the lobby runs on 2.1 m and
   * the shaft lands at 9.4-11.3 m, a little more than a metre clear of
   * the gap. */
  var LOBBY_EXTRA = { crawler: 2.1 };
  var CAR_HW = 1.0, CAR_D = 1.9, CAR_H = 2.4;
  /* The buttons down the car's wall, as many as she has stops: 0.4 m apart,
   * closer when that would run them off the end of the car (a Carrier's
   * seven stops, 2026-11-23). */
  function btnStep(n) { return Math.min(0.4, (CAR_D - 0.7) / Math.max(1, n - 1)); }
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
      lockWall: '#2e3640', hazard: '#d9a521', hazardDark: '#1d1f24', seat: '#5a6474', seatPad: '#8a7052', seatPipe: '!#3f8f7c',
      hatch: '#3d4652', hatchLit: '!#7dffb0', hatchShut: '!#ff6b5a', locker: '#28303b', blanket: '#5a6b80'
    },
    navy: {
      wall: '#2e3744', floor: '#232a33', ceil: '#1e242c', console: '#29323e', glare: '#11161d',
      overhead: '#222a35', bulk: '#2d3643', jamb: '#1e252e', leaf: '#45505e', leafEdge: '#c9ced4',
      trim: '!#9fc4ff', light: '!#e8f0ff', rib: '#3a4553', passWall: '#303946', passFloor: '#22282f',
      lockWall: '#313a45', hazard: '#c9ced4', hazardDark: '#22406e', seat: '#5a6576', seatPad: '#2f5a9e', seatPipe: '!#5f86c4',
      hatch: '#414b57', hatchLit: '!#8fd8ff', hatchShut: '!#ff6b5a', locker: '#2b333d', blanket: '#33528a'
    },
    syndicate: {
      wall: '#2b2c2e', floor: '#1c1c1d', ceil: '#18181a', console: '#2a2a2c', glare: '#0e0e0f',
      overhead: '#232325', bulk: '#2f3033', jamb: '#1a1a1b', leaf: '#393b3d', leafEdge: '#a72e29',
      trim: '!#c8362f', light: '!#ffe2da', rib: '#4b4d51', passWall: '#2d2e30', passFloor: '#1e1e1f',
      lockWall: '#303134', hazard: '#792220', hazardDark: '#1c1c1d', seat: '#4a4b4f', seatPad: '#8e2a24', seatPipe: '!#a72e29',
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

    /* A cockpit up in the nose (RAISED): not on a hull with a bridge deck
     * or decks, whose door is not at the cockpit's own bulkhead. */
    /* A cockpit up in (or down into) her nose (RAISED). Not on a decked
     * hull, whose cockpit is a deck of its own reached by lift. */
    var rz = opts.raised && !DECKED[opts.hullId] ? opts.raised : null;
    var rise = rz ? rz.rise : 0, run = rz ? rz.run : 0, lead = rz ? rz.fwd - rz.run : 0;
    /* The reactor block (BLOCK_HULLS): a bridge deck always, and a raised
     * cockpit's stair at the helm's arch, so her bridge deck and all aft of
     * it are on the one deck and its side door is a door at deck level. */
    var block = !!(BLOCK_HULLS[opts.hullId] && opts.block !== false && !DECKED[opts.hullId]);
    var blockV = block ? blockVariant(opts) : null, stairFoot = null;
    /* Variant A's door is in the bridge's starboard wall at its forward end:
     * a landing clear of the stations there (BLOCK_LANDING), the stations
     * aft of it. */
    var stationTop = 0;
    /* A raised cockpit stands `fwd` forward of where it was; the old deck
     * ran its passage on forward under it (`lead`). Here the bridge deck
     * takes that length instead, so every room aft of it is where it was. */
    var blockLead = 0;
    if (block) { blockLead = lead; lead = 0; deckLen = Math.max(deckLen, 3.0); if (blockV === 'A') { deckLen += BLOCK_LANDING; stationTop = BLOCK_LANDING; } }
    var bridge = room('cockpit', 'cockpit', -geom.sideX, geom.sideX, geom.bulkZ - (deckLen ? 0 : run), geom.frontZ, H, 'Cockpit');
    /* Its floor `rise` over the deck's forward of `stepZ`, the stair aft
     * of that down (or up) to the deck: floorAt. */
    if (rz) { bridge.y0 = rise; bridge.y1 = rise + H; }
    /* The bridge door's wall: the cockpit's own bulkhead on a one-seat
     * ship, the aft end of the bridge deck on a crewed one — at the foot
     * of the stair, when she has one. The bridge deck goes up with the
     * helm: its stations are worked from the helm's own floor. */
    var doorFront = geom.bulkZ - run, deck = null, stepZ = geom.bulkZ;
    if (deckLen && block) {
      var bz1 = geom.bulkZ - WALL_T, bz0 = bz1 - deckLen - run - blockLead;
      deck = room('bridgedeck', 'bridgedeck', -geom.sideX, geom.sideX, bz0, bz1, H, 'Bridge');
      doorFront = bz0; stepZ = bz1; stairFoot = bz1 - run;
    } else if (deckLen) {
      var dz1 = geom.bulkZ - WALL_T, dz0 = dz1 - deckLen;
      deck = room('bridgedeck', 'bridgedeck', -geom.sideX, geom.sideX, dz0 - run, dz1, H, 'Bridge');
      if (rz) { deck.y0 = rise; deck.y1 = rise + H; }
      doorFront = dz0 - run; stepZ = dz0;
    }
    /* The rooms off the passage (2026-10-25), measured first because the
     * passage has to be long enough for both of its walls: the quarters
     * and the turret to port, the medbay and the engine room to starboard. */
    var big = size !== 'S';
    var decked = !!(DECKED[opts.hullId] && opts.decks !== false);
    var gunners = big && opts.turret && !omit.turret ? 1 : 0;
    var tLen = gunners ? 0.6 + gunners * TURRET_SEAT + 0.2 : 0;
    /* On a decked hull the engine room is far aft, down at the junction. */
    var med = big && !omit.medbay && !block ? MED[size].slice() : null, eng = big && !decked && !omit.engine && !block ? ENGINE[size].slice() : null;
    if (med) med[0] = W('medbay', med[0]);
    if (eng) eng[0] = W('engine', eng[0]);
    /* The airlock is the last room down the port side, on every hull. */
    var rs = rampShape(opts.rampDrop, size, opts.rampMax);
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
    if (block) stbdNeed = BLOCK_CTL + WALL_T + BLOCK_RL;
    var len = PASSAGE_LEN[size] * (0.9 + 0.2 * rng.next());
    if (crewed) len = Math.max(len, qLen + 0.6);
    len = Math.max(len, portNeed + 0.6);
    if (big) len = Math.max(len, stbdNeed + 0.6);
    /* A ship bigger than her hull's fitted length (render.js shipInterior,
     * 2026-10-29) is run on aft: her hold takes the extra, or with no hold
     * her passage does. No draw is taken for it. */
    var stretch = opts.stretch > 0 ? opts.stretch : 0;
    if (!big) len += stretch;
    /* Raised (RAISED): the passage runs on forward under the cockpit to the
     * foot of its stair, and everything off it stays where it was. */
    len += lead;
    /* The lift (decked hulls): a lobby aft of the bridge door, then the
     * car; the main deck's passage starts aft of the car, a deck down. */
    var lobby = null, cars = {}, carZ = null;
    var p1 = doorFront - WALL_T;
    /* The reactor block: the avionics bay (B) aft of the bridge, then the
     * cross passage, then the passage. */
    var crossZ1 = null;
    if (block) {
      crossZ1 = doorFront - WALL_T - (blockV === 'B' ? BLOCK_BAY + WALL_T : 0);
      p1 = crossZ1 - BLOCK_CROSS - WALL_T;
    }
    if (decked) {
      lobby = room('lobby', 'lobby', -LOBBY_HW, LOBBY_HW, p1 - LOBBY_L - (LOBBY_EXTRA[opts.hullId] || 0), p1, PASSAGE_H, 'Lift lobby');
      carZ = [lobby.z0 - WALL_T - CAR_D, lobby.z0 - WALL_T];
      p1 = carZ[0] - WALL_T;
    }
    var p0 = p1 - len;
    /* Where the rooms off the passage hang from: its forward end, less how
     * far it was run on forward under a raised cockpit. */
    var pTop = p1 - lead;
    var passage = room('passage', 'passage', -PASSAGE_HW, PASSAGE_HW, p0, p1, PASSAGE_H, 'Passage');
    /* The bulkhead has thickness, and the plan's rooms are boxes that must
     * meet at a shared wall for a door to join them. So each door's box is
     * stretched across the wall's thickness: from the cockpit's aft wall to
     * the passage's forward one. */
    if (!block) {
      var dBridge = slider('bridge', deck || bridge, lobby || passage, doorFront, 'Bridge door');
      var bAft = lobby ? lobby.z1 : p1;
      dBridge.z0 = bAft - 0.8; dBridge.z1 = doorFront + 0.8; dBridge.wall = [bAft, doorFront];
    }
    /* The helm's arch: the old doorway, always open. */
    if (deck) {
      doors.push({ id: 'helm', a: bridge.id, b: deck.id, axis: 'z', at: geom.bulkZ, w: ARCH_HW * 2, h: DOOR_H,
                   x0: -ARCH_HW, x1: ARCH_HW, z0: deck.z1 - 0.8, z1: geom.bulkZ + 0.8,
                   wall: [deck.z1, geom.bulkZ], arch: true, open: 1, shut: false, label: 'Bridge' });
    }
    /* The quarters, off the port side of the passage, the door at their
     * forward end. Its leaves slide fore and aft into the passage wall. */
    var quarters = null;
    function makeQuarters(qz1) {
      var qx1 = -PASSAGE_HW - WALL_T;
      quarters = room('quarters', 'quarters', qx1 - W('quarters', QUARTERS_W), qx1, qz1 - qLen, qz1, QUARTERS_H, block ? 'Bunks' : 'Crew quarters');
      quarters.side = -1;
      var zc = qz1 - 0.7;
      doors.push({ id: 'quarters', a: passage.id, b: quarters.id, axis: 'x', at: -PASSAGE_HW, w: DOOR_HW * 2, h: DOOR_H,
                   x0: qx1 - 0.8, x1: -PASSAGE_HW + 0.8, z0: zc - DOOR_HW, z1: zc + DOOR_HW, zc: zc,
                   wall: [qx1, -PASSAGE_HW], slide: true, open: 0, shut: true, label: block ? 'Bunks door' : 'Quarters door' });
    }
    if (crewed && !block) makeQuarters(pTop - 0.3);

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
      var zTop = pTop - SIDE_GAP;
      if (gunners && !block) {
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
                : quarters ? quarters.z0 - SIDE_GAP - WALL_T : pTop - SIDE_GAP;
    /* The reactor block: the airlock first, by the cross passage, as she
     * drew it; or (`blockLockAft`, render.js, where a gear leg would stand
     * in the ramp's way there) aft of the bunks, as the old deck had it. */
    var lockAft = block && !!opts.blockLockAft;
    if (block && lockAft && crewed) makeQuarters(pTop - 0.3);
    if (block) portTop = lockAft && quarters ? quarters.z0 - SIDE_GAP - WALL_T : pTop - SIDE_GAP;
    var lock = sideRoom('airlock', 'airlock', -1, portTop, Math.max(2 * rs.hw + 0.3, W('airlock', LOCK_W)), lockLen, LOCK_H, 'Airlock', 'Airlock door');
    var dLock = doors[doors.length - 1];
    var blockOut = null;
    if (block) {
      /* Her bunks aft of the airlock, then her turret, if she has one. */
      if (crewed && !lockAft) makeQuarters(lock.z0 - SIDE_GAP - WALL_T);
      if (gunners) {
        var lowest = quarters && quarters.z0 < lock.z0 ? quarters : lock;
        turret = sideRoom('turret', 'turret', -1, lowest.z0 - SIDE_GAP - WALL_T, W('turret', TURRET_W), tLen, QUARTERS_H,
                          'Turret', 'Turret door');
      }
      blockOut = buildBlock({ variant: blockV, geom: geom, deck: deck, passage: passage, crossZ1: crossZ1, p1: p1,
                              stairFoot: stairFoot, rooms: rooms, doors: doors, items: items, room: room, hullId: opts.hullId,
                              ctlW: W('engine', BLOCK_RW), sideW: W('blockSide', BLOCK_SIDE), bayW: opts.roomW && opts.roomW.blockBay,
                              floor: geom.floorY - rise });
    }
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
    /* TWO ABREAST (2026-11-22). A cockpit fit that seats you to one side
     * (render.js cabinOf: the L/XL fit B, on the left of two) moves the
     * helm there, and the seat beside you is the co-pilot's, mirrored
     * across the centre line, airliner-style. `opts.seatX` is the cabin's
     * seat in this room's units; 0 is the old single centre seat. */
    var seatX = Math.abs(opts.seatX) > 0.05
      ? Math.max(-(geom.consoleX - 0.30), Math.min(geom.consoleX - 0.30, opts.seatX)) : 0;
    item('seat', seatX, SEAT[1] - 0.05, 'Take the seat',
         { counter: [SEAT[0] + seatX, SEAT[1], SEAT[2] + seatX, SEAT[3]], sitZ: SEAT_SIT_Z });
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
      var zc = (stairFoot !== null ? stairFoot : deck.z1) - stationTop - 0.15 - STATION_LEN * (row + 0.5);
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

    /* The reactor block's bunks room keeps the medical cabinet the medbay
     * would have had: against its forward wall, outboard of the door's
     * way in. */
    if (block && quarters) {
      var mcx0 = quarters.x0 + BUNK_W + 0.1, mcx1 = Math.min(quarters.x1 - 0.9, mcx0 + 0.55);
      if (mcx1 > mcx0 + 0.3) item('medcab', (mcx0 + mcx1) / 2, quarters.z1 - 0.22, 'Medical cabinet',
                                  { counter: [mcx0, quarters.z1 - 0.45, mcx1, quarters.z1] });
    }
    /* Bunks too narrow for it (the fit narrowed them): a shallower one on
     * the cross passage's forward wall at its port end, by the airlock. */
    if (block && blockOut && !items.some(function (it) { return it.kind === 'medcab'; })) {
      var xr = blockOut.cross, mx0 = xr.x0 + 0.05, mx1 = Math.min(xr.x0 + 0.65, xr.x1 - 1.0);
      item('medcab', (mx0 + mx1) / 2, xr.z1 - 0.15, 'Medical cabinet', { counter: [mx0, xr.z1 - 0.3, mx1, xr.z1] });
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
    if (seatX) {
      /* The other of the two abreast: the same chair, across the aisle. */
      var cxm = -seatX;
      seat2 = item('copilot', cxm, SEAT[1] - 0.05, 'Co-pilot\'s seat', { role: 'pilot', yaw: 0, dz: 0, abreast: true,
                   sitZ: SEAT_SIT_Z,
                   counter: [cxm + SEAT[0], SEAT[1], cxm + SEAT[2], SEAT[3]] });
    } else if (second === 'copilot') {
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
      /* Raised: on the bulkhead at the foot of the stair, on the deck. */
      medkit = { x0: mkx0, x1: mkx1, z: doorFront, dy: -rise };
      item('medkit', (mkx0 + mkx1) / 2, doorFront + 0.3, 'Medical supplies',
           { counter: [mkx0, doorFront, mkx1, doorFront + 0.24] });
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
          item('liftbtn', CAR_HW - 0.12, carZ[0] + 0.35 + n * btnStep(deckOrder.length - 1), arrow + '  ' + DECK_NAME[to], { to: to, aim: true });
          n++;
        });
      });
    }

    /* Where you stand when you get up: in the bay between the seat and the
     * bulkhead, facing aft at the door. And where you come aboard: inside
     * the hatch, facing forward up the passage. */
    var bay = (SEAT[1] - 0.30 + geom.bulkZ + 0.30) / 2;
    var spawn = { x: seatX, z: bay, yaw: Math.PI };   // behind your own seat
    /* Coming aboard you are on the airlock's landing, facing its inner
     * door across the ship. */
    var aboard = { x: rxc, z: hinge + 0.6, yaw: Math.PI / 2 };

    /* The first three rooms are always cockpit, passage, airlock (the old
     * plan's order, which callers index); the bridge deck and quarters
     * follow when she has them. */
    var ORDER = { cockpit: 0, passage: 1, airlock: 2, bridgedeck: 3, quarters: 4,
                  turret: 5, medbay: 6, engine: 7, cargo: 8, lobby: 9, lift: 10,
                  platform: 11, tramway: 12, hangar: 13, naval: 14 };
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
      d.yOff = deckY ? deckY[d.deck] - geom.floorY : -rise;
    });
    if (!decked) items.forEach(function (it) { it.deck = 'main'; });

    var out = {
      kind: 'ship', hullId: opts.hullId || '', palette: paletteFor(opts.hullId, opts.libId),
      tower: !!(decked && TOWER_GLASS[opts.hullId]),
      rooms: rooms, doors: doors, items: items, spawn: spawn, aboard: aboard,
      /* The deck's floor. A raised cockpit's is `raised.rise` above it
       * (floorAt); every other hull's cockpit is on the deck. */
      floorY: geom.floorY - rise, k: k, bay: bay, size: size,
      raised: rz ? { rise: rise, run: run, fwd: rz.fwd, treads: rz.treads || 0, stepZ: stepZ,
                     doorZ: stairFoot !== null ? stairFoot : doorFront, block: block } : null,
      stations: stations, bunks: bunks, bunkAt: bunkAt, sides: sides,
      turrets: turrets, beds: beds, crates: crates, drive: drive, second: second, medkit: medkit,
      ramp: rampSpec
    };
    var deckAll = deckOrder;
    if (blockOut) {
      out.block = blockV;
      out.naval = { block: true, variant: blockV, style: BLOCK_MILITARY[opts.hullId] ? 'navy' : 'merchant', cx: 0,
                    reactors: blockOut.reactors, misfit: [], narrowed: [], dropped: [], lowered: [] };
    }
    if (decked && NAVAL_MERGE[opts.hullId] && global.NavalDeck && opts.naval !== false) {
      var nv = navalize({ out: out, geom: geom, opts: opts, carZ: carZ, deckY: deckY, rooms: rooms, doors: doors, items: items });
      if (nv) {
        deckY = nv.deckY; deckOrder = nv.deckOrder; deckAll = nv.deckAll; tram = nv.tram; hangarPads = nv.hangarPads;
        out.naval = nv.naval; out.deckName = nv.deckName; out.hangarY = nv.hangarY; out.drive = null;
      }
    }
    /* THE ENGINEERING FLAT (2026-11-23): the L hulls and the Crawler, a deck
     * under her own with her reactor. No lift goes there: ladders and
     * trunks do. */
    var flat = null;
    if (FLAT_HULLS[opts.hullId] && global.NavalDeck && opts.naval !== false) {
      flat = flatten({ out: out, geom: geom, opts: opts, decked: decked, deckY: deckY, rooms: rooms, doors: doors, items: items });
      if (flat) {
        deckY = flat.deckY; deckAll = flat.deckAll; out.naval = flat.naval;
        out.deckName = flat.deckName;
        if (!decked) deckOrder = [];
      }
    }
    if (decked || flat) {
      /* A walk.js plan per deck: the same objects, filtered, with that
       * deck's floor. `ship` points back at the whole. */
      out.deckY = deckY; out.deckOrder = deckOrder; out.deckAll = deckAll; out.tram = tram; out.hangarPads = hangarPads;
      out.carZ = carZ; out.decks = {};
      deckAll.forEach(function (dk) {
        var v = {};
        for (var key in out) v[key] = out[key];
        v.deck = dk; v.floorY = deckY[dk]; v.ship = out; v.decks = null;
        v.rooms = rooms.filter(function (r) { return r.deck === dk && r.walk !== false; });
        v.doors = doors.filter(function (d) { return d.deck === dk; });
        v.items = items.filter(function (it) { return it.deck === dk; });
        out.decks[dk] = v;
      });
      /* A hull with no lift has no bridge deck of her own: you get up from
       * the seat onto her one deck, which walks as it always did (no deck
       * name: the cockpit is seen through its door from it, shipWalkClip). */
      if (!decked) { out.decks.bridge = out.decks.main; out.decks.main.deck = undefined; }
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
  /* ---- THE NAVAL DECKS IN HER (stage 2, 2026-11-23) --------------------
   * navaldeck.js's layout, made into this file's plan: its rooms (kind
   * 'naval', `sub` what they are), its doors as sliding doors through their
   * walls, every ladder, scuttle and trunk an item at each end you climb
   * from (main.js startRide 'climb'), a lift stop on each of its decks with
   * the car's own landing door, the tram in her trunk, and the Carrier's
   * craft on the pads of her middle bay. Her bridge, her lift and her own
   * airlock deck are this file's, as before; the old junction and the old
   * hangar are gone. */
  function navalize(c) {
    var N = global.NavalDeck, out = c.out, geom = c.geom, opts = c.opts, carZ = c.carZ;
    var rooms = c.rooms, doors = c.doors, items = c.items;
    var hullId = opts.hullId, merge = NAVAL_MERGE[hullId];
    var main = c.deckY.main, cargo = rooms.filter(function (r) { return r.kind === 'cargo' && r.deck === 'main'; })[0];
    var aftMost = cargo || rooms.filter(function (r) { return r.deck === 'main'; }).sort(function (a, b) { return a.z0 - b.z0; })[0];
    var naval = N.NAVAL[hullId];
    if (!naval || !aftMost) return null;
    var merchant = naval.style === 'merchant';
    var jo = merchant ? { x: 0, z: aftMost.z0, axis: 'z' }
                      : { x: naval.cx < 0 ? aftMost.x0 : aftMost.x1, z: (aftMost.z0 + aftMost.z1) / 2, axis: 'x' };
    var nd = N.layout(hullId, {
      bridgeY: geom.floorY, mainY: main, mergeDeck: merge, noAirlock: true,
      lift: { x: 0, z: carZ[0] - WALL_T - N.LANDING / 2 },
      z1: merchant ? aftMost.z0 - WALL_T - 1.6 : undefined, join: jo, key: opts.key
    });
    if (!nd) return null;

    /* Out with the old junction and hangar. */
    var gone = { junction: 1, hangar: 1 };
    function keep(o) { return !gone[o.deck]; }
    [rooms, doors, items].forEach(function (arr) {
      for (var i = arr.length - 1; i >= 0; i--) if (!keep(arr[i])) arr.splice(i, 1);
    });
    for (var i = items.length - 1; i >= 0; i--) if (items[i].kind === 'liftbtn') items.splice(i, 1);

    /* Her decks: the bridge, her own (merged) one, and the rest. */
    var id = {}, deckY = { bridge: c.deckY.bridge, main: main }, deckName = {};
    deckName.bridge = DECK_NAME.bridge;
    nd.decks.forEach(function (d) {
      var mine = d.id === 'bridge' ? 'bridge' : d.id === merge ? 'main' : 'n' + d.id;
      id[d.id] = mine;
      if (mine !== 'bridge' && mine !== 'main') deckY[mine] = d.y;
      var nm = merchant ? d.name : d.num + '  ' + d.name;
      if (mine === 'main') nm = (merchant ? d.name : d.num + '  ' + d.name) + ' · airlock';
      if (mine !== 'bridge') deckName[mine] = nm;
    });
    var ndRoom = {}, mineRoom = {};
    nd.rooms.forEach(function (r) { ndRoom[r.id] = r; });
    nd.rooms.forEach(function (r) {
      if (r.kind === 'stub' || r.deck === 'bridge') return;
      var m = { id: 'nv-' + r.id, kind: 'naval', sub: r.kind, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1,
                y0: 0, y1: r.y1 - r.y0, label: r.label + (r.comp && !merchant ? '   ' + r.comp : ''), deck: id[r.deck],
                comp: r.comp };
      if (r.walk === false) m.walk = false;
      rooms.push(m);
      mineRoom[r.id] = m;
    });
    var dName = function (d) { return deckName[d] || DECK_NAME[d] || d; };

    /* FITTED TO HER (Astra, 2026-10-31: shrink, then drop). An outboard
     * room that leaves her skin is narrowed from its outboard side, down to
     * 2 m; one that still does not fit, and is a dead end (one door, so
     * nothing is reached through it), is left out. Passages, landings,
     * machinery and the reactors are never cut: a misfit there is reported
     * (out.naval.misfit) for the hull fit to answer. */
    var misfit = [], narrowed = [], dropped = [], lowered = [];
    if (opts.fit && opts.fit.inside) {
      var doorsOf = {};
      nd.links.forEach(function (l) { if (l.type === 'door' || l.type === 'wtdoor') { doorsOf[l.a] = (doorsOf[l.a] || 0) + 1; doorsOf[l.b] = (doorsOf[l.b] || 0) + 1; } });
      var frac = function (m) {
        var fy = deckY[m.deck], n2 = 0, k2 = 0;
        for (var x = m.x0 + 0.1; x <= m.x1 - 0.1 + 1e-9; x += Math.max(0.1, (m.x1 - m.x0 - 0.2) / 4)) {
          for (var z = m.z0 + 0.1; z <= m.z1 - 0.1 + 1e-9; z += Math.max(0.1, (m.z1 - m.z0 - 0.2) / 6)) {
            n2 += 2;
            if (opts.fit.inside(x, fy + 0.1, z)) k2++;
            if (opts.fit.inside(x, fy + m.y1 - 0.1, z)) k2++;
          }
        }
        return n2 ? k2 / n2 : 1;
      };
      var KEEP = { passage: 1, cross: 1, lobby: 1, landing: 1, engine: 1, aux: 1, reactor: 1, reactorctl: 1, hangar: 1,
                   platform: 1, tramway: 1, dccentral: 1, cic: 1, flagplot: 1 };
      /* Where she pinches in (a waist in her hull, 2026-11-23: three metres
       * of it on the Meridian at z −38, four on the Leviathan at z −34),
       * a room is cut to fit it: an outboard room from its outboard side,
       * anything else from both sides, down to a width it still works at;
       * then a lower deckhead, down to 2.1 m; and only then, for a dead-end
       * room, left out. */
      var NARROWEST = { passage: 0, cross: 0, lobby: 0, landing: 0, platform: 0, tramway: 0, hangar: 12, reactor: 3.6, reactorctl: 3.6 };
      Object.keys(mineRoom).forEach(function (nid) {
        var m = mineRoom[nid], src = ndRoom[nid];
        if (frac(m) >= 0.97) return;
        var w0 = m.x1 - m.x0, h0 = m.y1, min = NARROWEST[m.sub] !== undefined ? NARROWEST[m.sub] : 2.0;
        if (min > 0 && src.side) {
          var out0 = src.side > 0 ? 'x1' : 'x0';
          while ((m.x1 - m.x0) > min + 1e-6 && frac(m) < 0.97) m[out0] += src.side > 0 ? -0.25 : 0.25;
        } else if (min > 0) {
          while ((m.x1 - m.x0) > min + 0.5 - 1e-6 && frac(m) < 0.97) { m.x0 += 0.25; m.x1 -= 0.25; }
        }
        while (m.y1 > 2.1 + 1e-6 && frac(m) < 0.97) m.y1 = Math.round((m.y1 - 0.1) * 100) / 100;
        if (frac(m) >= 0.97) {
          if (m.x1 - m.x0 < w0 - 1e-6) narrowed.push(m.id);
          if (m.y1 < h0 - 1e-6) lowered.push(m.id);
          return;
        }
        /* A ship drawn bigger than her hull (render.js shipInterior,
         * `stretch`) keeps the rooms she has at her own size, as her own
         * deck does: her hold is what grows. */
        if (!KEEP[m.sub] && (doorsOf[nid] || 0) <= 1 && !(opts.stretch > 0)) {
          rooms.splice(rooms.indexOf(m), 1); delete mineRoom[nid]; dropped.push(m.id);
          return;
        }
        misfit.push(m.id + ' ' + Math.round(frac(m) * 100) + '%');
      });
    }

    /* Doors through her walls. */
    var nDoor = 0;
    function door(a, b, l) {
      var dd = { id: 'nv-' + l.id, a: a.id, b: b.id, w: DOOR_HW * 2, h: DOOR_H, slide: true, open: 0, shut: true,
                 deck: a.deck, naval: true, fit: l.fit || null };
      var G = 0.05;
      if (a.x1 <= b.x0 + 1e-6 || b.x1 <= a.x0 + 1e-6) {
        var L = a.x1 <= b.x0 + 1e-6 ? a : b, R = L === a ? b : a;
        var zlo = Math.max(a.z0, b.z0) + DOOR_HW + G, zhi = Math.min(a.z1, b.z1) - DOOR_HW - G;
        if (zhi < zlo) return null;
        var zc = Math.max(zlo, Math.min(zhi, l.z));
        dd.axis = 'x'; dd.wall = [L.x1, R.x0]; dd.at = (L.x1 + R.x0) / 2; dd.zc = zc;
        dd.x0 = L.x1 - 0.8; dd.x1 = R.x0 + 0.8; dd.z0 = zc - DOOR_HW; dd.z1 = zc + DOOR_HW;
      } else if (a.z1 <= b.z0 + 1e-6 || b.z1 <= a.z0 + 1e-6) {
        var A = a.z1 <= b.z0 + 1e-6 ? a : b, F = A === a ? b : a;
        var xlo = Math.max(a.x0, b.x0) + DOOR_HW + G, xhi = Math.min(a.x1, b.x1) - DOOR_HW - G;
        if (xhi < xlo) return null;
        var xc = Math.max(xlo, Math.min(xhi, l.x));
        dd.axis = 'z'; dd.wall = [A.z1, F.z0]; dd.at = (A.z1 + F.z0) / 2; dd.xc = xc;
        dd.x0 = xc - DOOR_HW; dd.x1 = xc + DOOR_HW; dd.z0 = A.z1 - 0.8; dd.z1 = F.z0 + 0.8;
      } else return null;                       // a platform in its compartment: no wall between
      dd.label = l.type === 'wtdoor' ? (l.fit === 'Z' ? 'Watertight door  (Z)' : l.fit === 'Y' ? 'Watertight door  (Y)' : 'Watertight door')
               : l.type === 'curtain' ? 'Fire curtain' : '';
      if (l.type === 'curtain') { dd.arch = true; dd.open = 1; dd.shut = false; }
      doors.push(dd); nDoor++;
      return dd;
    }
    /* Well inside a room, a body's width and more off its walls (walk.js
     * stands you only clear of them), and in the middle of a narrow one. */
    function inside(r, x, z) {
      var px = Math.min(0.5, (r.x1 - r.x0) / 2 - 0.01), pz = Math.min(0.5, (r.z1 - r.z0) / 2 - 0.01);
      return [Math.max(r.x0 + px, Math.min(r.x1 - px, x)), Math.max(r.z0 + pz, Math.min(r.z1 - pz, z))];
    }
    /* Each reactor's control panel, by the glass. */
    nd.reactors.forEach(function (rx) {
      var ctl = mineRoom[rx.control];
      if (!ctl) return;
      var cxm = rx.window ? (rx.window.x0 + rx.window.x1) / 2 : (ctl.x0 + ctl.x1) / 2;
      items.push({ kind: 'reactorctl', x: cxm, z: ctl.z0 + 0.6, deck: ctl.deck, label: 'Reactor control  —  the glass',
                   counter: [cxm - 1.0, ctl.z0, cxm + 1.0, ctl.z0 + 0.45] });
      /* Her tank: nobody walks into the water. */
      var rrm = mineRoom[rx.room];
      if (rrm && rx.window) {
        var tf = tankFoot(rrm, rx);
        items.push({ kind: 'core', x: (tf.x0 + tf.x1) / 2, z: (tf.z0 + tf.zb) / 2, deck: rrm.deck, label: '', silent: true,
                     counter: [tf.x0, tf.z0, tf.x1, tf.zb] });
      }
    });

    /* ...and off any counter in it (reactor control's panel by the glass):
     * a landing you cannot stand on is no landing. */
    function clear(r, pt) {
      items.forEach(function (it) {
        var cn = it.counter;
        if (!cn || it.deck !== r.deck) return;
        if (pt[0] > cn[0] - 0.5 && pt[0] < cn[2] + 0.5 && pt[1] > cn[1] - 0.5 && pt[1] < cn[3] + 0.5) {
          var up = cn[3] + 0.6, dn = cn[1] - 0.6;
          pt[1] = up < r.z1 - 0.4 ? up : Math.max(r.z0 + 0.4, dn);
        }
      });
      return pt;
    }
    var VERB = { ladder: 'Ladder', stair: 'Stairs', scuttle: 'Scuttle', trunk: 'Escape trunk' };
    nd.links.forEach(function (l) {
      var a = mineRoom[l.a], b = mineRoom[l.b];
      if (!a || !b) return;
      if (l.type === 'door' || l.type === 'wtdoor' || l.type === 'curtain') { door(a, b, l); return; }
      if (!VERB[l.type]) return;                 // the lift and the tram are built below
      var lo = ndRoom[l.a].y0 < ndRoom[l.b].y0 ? a : b, hi = lo === a ? b : a;
      var zLo = l.footZ !== undefined ? l.footZ - 0.35 : l.z, zHi = l.headZ !== undefined ? l.headZ + 0.35 : l.z;
      var pLo = clear(lo, inside(lo, l.x, zLo)), pHi = clear(hi, inside(hi, l.x, zHi));
      var dy = deckY[hi.deck] - deckY[lo.deck];
      /* Drawn where its foot was put (inside its room, off the counters):
       * the whole ladder moves with it. */
      var sx = pLo[0] - l.x, sz = pLo[1] - zLo;
      var base = { link: l.id, via: l.type, fit: l.fit || null, rule: l.rule || null, side: l.side || 0, aim: true,
                   foot: [l.x + sx, (l.footZ !== undefined ? l.footZ : l.z) + sz], head: [l.x + sx, (l.headZ !== undefined ? l.headZ : l.z) + sz] };
      function climbItem(at, from, to, toAt, up) {
        var it = { kind: 'climb', x: at[0], z: at[1], deck: from.deck, to: to.deck, tx: toAt[0], tz: toAt[1], up: up, dy: up ? dy : -dy,
                   label: (up ? '▲  ' : '▼  ') + VERB[l.type] + (up ? ' up to ' : ' down to ') + dName(to.deck) };
        for (var k in base) it[k] = base[k];
        items.push(it);
      }
      climbItem(pLo, lo, hi, pHi, true);
      climbItem(pHi, hi, lo, pLo, false);
    });

    /* Her lift: a car on every deck it stops at, its landing door aft. */
    var stops = ['bridge', 'main'];
    nd.rooms.forEach(function (r) {
      if (r.kind !== 'landing' || !mineRoom[r.id]) return;
      var dk = id[r.deck], land = mineRoom[r.id];
      var car = { id: 'lift-' + dk, kind: 'lift', x0: -CAR_HW, x1: CAR_HW, z0: carZ[0], z1: carZ[1], y0: 0, y1: CAR_H, label: 'Lift', deck: dk };
      rooms.push(car);
      var ld = { id: 'lift-' + dk, a: car.id, b: land.id, axis: 'z', at: carZ[0], w: DOOR_HW * 2, h: DOOR_H,
                 x0: -DOOR_HW, x1: DOOR_HW, z0: land.z1 - 0.8, z1: carZ[0] + 0.8, wall: [land.z1, carZ[0]],
                 slide: true, open: 0, shut: true, label: 'Lift', deck: dk, lift: true };
      doors.push(ld);
      stops.push(dk);
    });
    /* Her own airlock deck to the band: through her hold's wall. */
    if (nd.join && mineRoom[nd.join.room]) door(aftMost, mineRoom[nd.join.room], { id: 'join', x: nd.join.x, z: nd.join.z, type: 'door' });

    var deckAll = ['bridge', 'main'];
    nd.decks.forEach(function (d) { var m = id[d.id]; if (deckAll.indexOf(m) < 0) deckAll.push(m); });
    var byY = function (a, b) { return deckY[b] - deckY[a]; };
    deckAll.sort(byY);
    var deckOrder = stops.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(byY);
    /* The car's buttons, one per other stop: ▲ up, ▼ down. */
    deckOrder.forEach(function (here, hi) {
      var n = 0;
      deckOrder.forEach(function (to, ti) {
        if (to === here) return;
        items.push({ kind: 'liftbtn', x: CAR_HW - 0.12, z: carZ[0] + 0.35 + n * btnStep(deckOrder.length - 1), deck: here,
                     label: (ti < hi ? '▲' : '▼') + '  ' + dName(to), to: to, aim: true });
        n++;
      });
    });

    /* The tram, down her trunk. */
    var tram = null;
    if (nd.tram) {
      var pa = mineRoom[nd.tram.a], pb = mineRoom[nd.tram.b], way = mineRoom[nd.tram.way], tx = nd.tram.x;
      tram = { a: pa.z0 - TRAM_L / 2, b: way.z0 + TRAM_L / 2, offA: pa.z0 + 0.8, offB: pb.z1 - 0.8,
               z0: way.z0, z1: way.z1, x: tx, deck: id[nd.tram.deck] };
      items.push({ kind: 'tram', x: tx, z: pa.z0 + 0.45, deck: tram.deck, label: 'Tram  —  aft to engineering', to: 'b',
                   counter: [tx - TRAM_HW, pa.z0, tx + TRAM_HW, pa.z0 + 0.12] });
      items.push({ kind: 'tram', x: tx, z: pb.z1 - 0.45, deck: tram.deck, label: 'Tram  —  forward', to: 'a',
                   counter: [tx - TRAM_HW, pb.z1 - 0.12, tx + TRAM_HW, pb.z1] });
    }

    /* Her engine room's console, where the engineers' rounds go. */
    var eng = rooms.filter(function (r) { return r.kind === 'naval' && r.sub === 'engine'; })
                   .sort(function (a, b) { return a.z0 - b.z0; })[0];
    if (eng) {
      var ex = (eng.x0 + eng.x1) / 2;
      items.push({ kind: 'engine', x: ex, z: eng.z0 + 0.3, deck: eng.deck, label: 'Drive console', yaw: Math.PI,
                   counter: [ex - 0.7, eng.z0, ex + 0.7, eng.z0 + 0.55] });
    }
    /* The Carrier's craft: three pads across her middle bay. */
    var hangarPads = null, hangarY;
    var bays = rooms.filter(function (r) { return r.kind === 'naval' && r.sub === 'hangar'; }).sort(function (a, b) { return a.z0 - b.z0; });
    if (bays.length) {
      var mb = bays[Math.floor(bays.length / 2)], mzc = (mb.z0 + mb.z1) / 2, mxc = (mb.x0 + mb.x1) / 2;
      hangarPads = [-8, 0, 8].map(function (dx) { return { x: mxc + dx, z: mzc, r: 4.2 }; });
      hangarY = deckY[mb.deck];
      hangarPads.forEach(function (pd) {
        items.push({ kind: 'pad', x: pd.x, z: pd.z, deck: mb.deck, label: '', silent: true, counter: [pd.x - 3.0, pd.z - 4.0, pd.x + 3.0, pd.z + 4.0] });
      });
    }

    doors.forEach(function (d) { if (d.yOff === undefined || d.naval || d.lift) d.yOff = deckY[d.deck] - geom.floorY; });
    return {
      deckY: deckY, deckOrder: deckOrder, deckAll: deckAll, tram: tram, hangarPads: hangarPads, hangarY: hangarY, deckName: deckName,
      naval: { style: naval.style, cx: nd.cx, hw: nd.hw, reactors: nd.reactors.map(function (r) {
        var o = {}; for (var k in r) o[k] = r[k]; o.room = 'nv-' + r.room; o.control = 'nv-' + r.control;
        if (r.tunnel) o.tunnel = 'nv-' + r.tunnel;
        return o;
      }), links: nd.links.length, doors: nDoor, layout: nd, misfit: misfit, narrowed: narrowed, dropped: dropped, lowered: lowered }
    };
  }

  /* ---- THE ENGINEERING FLAT IN HER (2026-11-23) ---------------------------
   * navaldeck.js's flat, under her own deck: under the aft end of her
   * passage and her hold on an L hull (her own engine room stays where her
   * crew work it, off the passage; down here are the reactor, its control
   * room and the auxiliary machinery), under the far tram platform and the
   * engine room on the Crawler. Its ladders come up into the passage (the
   * platform), its trunks into the rooms over them. */
  /* The L hulls (kestrel, cutter, longhaul, tanker) are laid out
   * (navaldeck.js FLATS) but not aboard: at their length a 3 m flat does
   * not fit under their deck, and growing them (fit-hulls: Kestrel 34 to
   * 51 m, Longhaul 38 to 59) puts their glass 4-8 m ahead of the seat and
   * turns their ramps into lifts. Astra's call, 2026-11-23. */
  var FLAT_HULLS = { crawler: 1 };
  /* The reactor block's own rooms (BLOCK_HULLS, below): the side passage,
   * the cross passage, the avionics bay (variant B), reactor control and
   * the reactor; the bridge door; and the reactor's spec for navalMesh. Its
   * rooms are kind 'naval', so they are drawn as the naval decks' are, wall
   * by wall round whatever doors they have. */
  function buildBlock(c) {
    var g = c.geom, deck = c.deck, ps = c.passage, doors = c.doors, items = c.items, room = c.room;
    var sx = g.sideX, V = c.variant;
    function nroom(id, sub, x0, x1, z0, z1, h, label) {
      var r = room('bk-' + id, 'naval', x0, x1, z0, z1, h, label);
      r.sub = sub; r.blockRoom = true;
      return r;
    }
    /* A door through the wall `wall` = [low, high] (z for 'z', x for 'x'),
     * centred at `at` along it; its box reaches 0.8 m into each room. */
    function ndoor(id, a, b, axis, wall, at, opt) {
      var d = { id: id, a: a.id, b: b.id, axis: axis, w: DOOR_HW * 2, h: DOOR_H, wall: wall, at: (wall[0] + wall[1]) / 2,
                naval: true, slide: true, open: 0, shut: true, label: 'Door' };
      if (axis === 'z') { d.xc = at; d.x0 = at - DOOR_HW; d.x1 = at + DOOR_HW; d.z0 = wall[0] - 0.8; d.z1 = wall[1] + 0.8; }
      else { d.zc = at; d.z0 = at - DOOR_HW; d.z1 = at + DOOR_HW; d.x0 = wall[0] - 0.8; d.x1 = wall[1] + 0.8; }
      for (var k in (opt || {})) d[k] = opt[k];
      if (d.arch) { d.slide = false; d.open = 1; d.shut = false; }
      doors.push(d);
      return d;
    }
    var cz1 = c.crossZ1, cz0 = cz1 - BLOCK_CROSS, spX0, spX1, spZ0, spZ1, bay = null;
    if (V === 'A') {
      /* Down her side outboard of the bridge, its whole length. */
      spX0 = sx + WALL_T; spX1 = spX0 + c.sideW; spZ0 = deck.z0; spZ1 = deck.z1;
    } else {
      /* Inside the bridge's width, beside the avionics bay, up to the
       * bridge's aft door. */
      spX1 = sx; spX0 = sx - c.sideW; spZ1 = deck.z0 - WALL_T; spZ0 = cz1 + WALL_T;
      var bayX1 = spX0 - WALL_T, bayX0 = c.bayW > 0 ? Math.max(-sx, bayX1 - c.bayW) : -sx;
      bay = nroom('bay', 'aux', bayX0, bayX1, spZ0, spZ1, PASSAGE_H, 'Avionics bay');
    }
    var side = nroom('side', 'passage', spX0, spX1, spZ0, spZ1, PASSAGE_H, 'Passage');
    var ctlX0 = PASSAGE_HW + WALL_T, ctlX1 = ctlX0 + c.ctlW;
    var cross = nroom('cross', 'cross', ps.x0, Math.max(spX1, ctlX1), cz0, cz1, PASSAGE_H, 'Cross passage');
    var ctl = nroom('ctl', 'reactorctl', ctlX0, ctlX1, c.p1 - BLOCK_CTL, c.p1, ENGINE_H, 'Reactor control');
    var rxr = nroom('reactor', 'reactor', ctlX0, ctlX1, ctl.z0 - WALL_T - BLOCK_RL, ctl.z0 - WALL_T, ENGINE_H, 'Reactor');
    /* The bridge door: through the bridge's side at its forward end (A,
     * aft of a raised cockpit's stair), or through its aft wall (B). */
    if (V === 'A') {
      ndoor('bridge', deck, side, 'x', [sx, spX0], (c.stairFoot !== null ? c.stairFoot : deck.z1) - BLOCK_LANDING / 2, { label: 'Bridge door' });
    } else {
      ndoor('bridge', side, deck, 'z', [side.z1, deck.z0], (spX0 + spX1) / 2, { label: 'Bridge door' });
      ndoor('bk-bay', bay, side, 'x', [bay.x1, spX0], (spZ0 + spZ1) / 2, { label: 'Avionics bay door' });
    }
    ndoor('bk-side', cross, side, 'z', [cz1, spZ0], (spX0 + spX1) / 2, { arch: true, label: '' });
    ndoor('bk-aft', ps, cross, 'z', [ps.z1, cz0], 0, { arch: true, label: '' });
    ndoor('bk-ctl', ctl, cross, 'z', [ctl.z1, cz0], ctlX0 + 0.65, { label: 'Reactor control door' });
    var rdX = ctlX1 - 0.6;
    ndoor('bk-reactor', rxr, ctl, 'z', [rxr.z1, ctl.z0], rdX, { fit: 'X', reactorDoor: true, label: 'Reactor door  (X)' });
    /* The reactor: lying down on the Cutter, as the Navy's are, the rods in
     * from the front; standing on the rest, the rods from the top. The
     * glass inboard of the reactor door, the panel under it. */
    var military = !!BLOCK_MILITARY[c.hullId], axis = military ? 'h' : 'v';
    var wx0 = ctlX0 + 0.25, wx1 = rdX - DOOR_HW - 0.2;
    var cr = Math.min(0.4, BLOCK_RL * 0.08), clen = axis === 'h' ? Math.min(2.4, (wx1 - wx0) * 0.6) : Math.min(2.0, ENGINE_H * 0.6);
    var cxr = Math.max((wx0 + wx1) / 2, ctlX0 + (axis === 'h' ? clen / 2 : cr) + 0.55);
    var spec = {
      id: 'reactor-0', room: rxr.id, control: ctl.id, axis: axis, military: military,
      core: { x: cxr, y: c.floor + 1.2, z: (rxr.z0 + rxr.z1) / 2, r: cr, len: clen }, jacket: 1.2,
      rods: axis === 'h' ? { face: 'fwd', n: 5 } : { face: 'top', n: 5 },
      window: { z: (rxr.z1 + ctl.z0) / 2, x0: wx0, x1: wx1, y0: c.floor + 0.7, y1: c.floor + Math.min(ENGINE_H - 0.3, 2.3), faces: 'fwd' }
    };
    /* The tank is in the way: it stands against the bulkhead, across the
     * window and the core, back past the core by her jacket (reactorTank). */
    var hx = axis === 'h' ? clen / 2 : cr, hz = cr;
    var tkx0 = Math.max(rxr.x0 + 0.02, Math.min(wx0 - 0.15, cxr - hx - 0.45)), tkx1 = Math.min(rxr.x1 - 0.02, Math.max(wx1 + 0.15, cxr + hx + 0.45));
    var tkz0 = Math.max(rxr.z0 + 0.3, Math.min(spec.core.z - hz - spec.jacket, rxr.z1 - 1.2));
    items.push({ kind: 'core', x: cxr, z: spec.core.z, label: '', silent: true, counter: [tkx0, tkz0, tkx1, rxr.z1] });
    /* The panel under the glass: the reactor's controls and the drive's,
     * worked by whoever has the engineering watch. */
    items.push({ kind: 'engine', x: cxr, z: ctl.z0 + 0.3, yaw: Math.PI, label: 'Reactor and drive control  \u2014  the glass',
                 counter: [wx0, ctl.z0, wx1, ctl.z0 + 0.45] });
    return { reactors: [spec], side: side, cross: cross, bay: bay, ctl: ctl, reactor: rxr };
  }
  /* THE REACTOR BLOCK (Astra, 2026-11-23, her sketch): "grow the hulls, put
   * it in a like this space, split the reactor room in two so the crew can
   * operate panels in the room for controlling the reactor." The L hulls'
   * one deck, laid out as she drew it: a side passage down the starboard
   * side to the bridge, a cross passage aft of the bridge's solid aft wall,
   * the passage on aft to the hold; the reactor's compartment off the cross
   * passage to starboard (control forward, the reactor aft of the glass),
   * the airlock and then the bunks to port. Asked whether the block by the
   * side passage is the bridge itself or a wall with the bridge forward of
   * it, she said "have both layouts available": variant A, the block IS the
   * bridge and you come into it through its side at the forward end;
   * variant B, the bridge is further forward, the block is an avionics bay,
   * and the side passage runs on to the bridge's aft door. Which one a ship
   * has is her own seed's (planned by `opts.key`), so a ship is always the
   * same ship. No engine room or medbay of their own: the reactor's control
   * room is where the drive is run from, and the medical cabinet is in the
   * bunks room. */
  var BLOCK_HULLS = { kestrel: 1, cutter: 1, longhaul: 1, tanker: 1 };
  var BLOCK_MILITARY = { cutter: 1 };
  var BLOCK_MIN_W = { engine: 2.4, blockSide: 1.0, blockBay: 1.0 };
  var BLOCK_LANDING = 1.3, BLOCK_SIDE = 1.3, BLOCK_CROSS = 1.3, BLOCK_BAY = 2.6, BLOCK_RW = 3.0, BLOCK_CTL = 2.8, BLOCK_RL = 3.6;
  function blockVariant(opts) {
    if (opts.blockVariant === 'A' || opts.blockVariant === 'B') return opts.blockVariant;
    return hash('block|' + (opts.key || opts.hullId || '')) % 2 ? 'A' : 'B';
  }
  function flatten(c) {
    var N = global.NavalDeck, out = c.out, opts = c.opts, rooms = c.rooms, doors = c.doors, items = c.items;
    var hullId = opts.hullId, under = c.decked ? 'junction' : 'main';
    var stubY = c.decked ? c.deckY.junction : out.floorY;
    if (stubY === undefined) return null;
    var up = rooms.filter(function (r) { return r.deck === under && r.walk !== false && r.kind !== 'cockpit'; });
    var pas = c.decked ? up.filter(function (r) { return r.id === 'platform-aft'; })[0] : up.filter(function (r) { return r.kind === 'passage'; })[0];
    var hold = c.decked ? up.filter(function (r) { return r.kind === 'engine'; })[0] : (up.filter(function (r) { return r.kind === 'cargo'; })[0] || pas);
    if (!pas || !hold) return null;
    var h = 3.0, flatY = stubY - N.SLAB - h, run = (stubY - flatY) / Math.tan(Math.PI / 3);
    var px = (pas.x0 + pas.x1) / 2;
    /* The ladders' heads in the passage's aft end (on the platform), one
     * a little forward of the other; their feet in reactor control. */
    var headA = Math.min(pas.z1 - 0.4, pas.z0 + (c.decked ? 2.0 : 4.6)), headB = Math.min(pas.z1 - 0.4, pas.z0 + (c.decked ? 2.0 : 3.4));
    var xA = c.decked ? px + 0.9 : px, xB = c.decked ? px - 0.9 : px;
    var z1 = Math.max(headA, headB) + 0.6, FL = c.decked ? 14 : 12;
    var z0 = z1 - FL, zm = (z0 + z1) / 2;
    var hw = Math.max(2.4, Math.min(3.5, (hold.x1 - hold.x0) / 2 + 0.5));
    var hz = (hold.z0 + hold.z1) / 2;
    var nd = N.layout(hullId, {
      libId: opts.libId, mainY: stubY, z0: z0, z1: z1, hw: hw, key: opts.key,
      ladderAt: [[xA, headA - run / 2], [xB, headB - run / 2]],
      /* The reactor's trunk is navaldeck's to place, clear of her tank. */
      trunkAt: { aux: [(hold.x0 + hold.x1) / 2 + 0.4, Math.max(z0 + 0.8, Math.min(zm - 0.8, hz))] }
    });
    if (!nd) return null;
    var deckY = {}, k;
    if (c.deckY) for (k in c.deckY) deckY[k] = c.deckY[k];
    if (!c.decked) deckY.main = out.floorY;
    deckY.flat = nd.decks.filter(function (d) { return d.id === 'flat'; })[0].y;
    var deckName = {};
    if (out.deckName) for (k in out.deckName) deckName[k] = out.deckName[k];
    var navy = nd.style === 'navy';
    deckName.flat = (navy ? '2  ' : '') + 'Engineering flat';
    var ndRoom = {}, mine = {};
    nd.rooms.forEach(function (r) { ndRoom[r.id] = r; });
    nd.rooms.forEach(function (r) {
      if (r.kind === 'stub') return;
      var m = { id: 'nv-' + r.id, kind: 'naval', sub: r.kind, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: 0, y1: r.y1 - r.y0,
                label: r.label + (navy ? '   ' + r.comp : ''), deck: 'flat', comp: r.comp };
      rooms.push(m); mine[r.id] = m;
    });
    function roomOver(x, z) {
      var hit = up.filter(function (r) { return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; })[0];
      if (hit) return hit;
      var best = null, bd = Infinity;
      up.forEach(function (r) {
        var dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1), d = Math.hypot(dx, dz);
        if (d < bd) { bd = d; best = r; }
      });
      return best;
    }
    function inside(r, x, z) {
      var px2 = Math.min(0.5, (r.x1 - r.x0) / 2 - 0.01), pz2 = Math.min(0.5, (r.z1 - r.z0) / 2 - 0.01);
      return [Math.max(r.x0 + px2, Math.min(r.x1 - px2, x)), Math.max(r.z0 + pz2, Math.min(r.z1 - pz2, z))];
    }
    var VERB = { ladder: 'Ladder', stair: 'Stairs', scuttle: 'Scuttle', trunk: 'Escape trunk' };
    var dName = function (d) { return deckName[d] || DECK_NAME[d] || (d === 'main' ? 'Main deck' : d); };
    nd.links.forEach(function (l) {
      var a = mine[l.a], b = mine[l.b];
      if (a && b) {
        /* The watertight door between her two compartments down here. */
        var A = a.z1 <= b.z0 + 1e-6 ? a : b, F = A === a ? b : a;
        var xc = Math.max(Math.max(a.x0, b.x0) + DOOR_HW + 0.05, Math.min(Math.min(a.x1, b.x1) - DOOR_HW - 0.05, l.x));
        doors.push({ id: 'nv-' + l.id, a: a.id, b: b.id, axis: 'z', at: (A.z1 + F.z0) / 2, w: DOOR_HW * 2, h: DOOR_H, xc: xc,
                     x0: xc - DOOR_HW, x1: xc + DOOR_HW, z0: A.z1 - 0.8, z1: F.z0 + 0.8, wall: [A.z1, F.z0],
                     slide: true, open: 0, shut: true, deck: 'flat', naval: true, fit: l.fit || null,
                     label: l.reactorDoor ? 'Reactor door  (X)' : 'Watertight door' + (l.fit ? '  (' + l.fit + ')' : '') });
        return;
      }
      if (!VERB[l.type]) return;
      var lo = a || b;
      if (!lo) return;
      var topX = l.x, topZ = l.headZ !== undefined ? l.headZ : l.z;
      var hi = roomOver(topX, topZ);
      if (!hi) return;
      var zLo = l.footZ !== undefined ? l.footZ - 0.35 : l.z;
      var pLo = inside(lo, l.x, zLo), pHi = inside(hi, topX, l.headZ !== undefined ? l.headZ + 0.35 : l.z);
      var sx = pLo[0] - l.x, sz = pLo[1] - zLo, dy = stubY - flatY;
      var base = { link: l.id, via: l.type, fit: l.fit || null, rule: l.rule || null, side: l.side || 0, aim: true,
                   foot: [l.x + sx, (l.footZ !== undefined ? l.footZ : l.z) + sz], head: [l.x + sx, (l.headZ !== undefined ? l.headZ : l.z) + sz] };
      [[pLo, lo, hi, pHi, true], [pHi, hi, lo, pLo, false]].forEach(function (e) {
        var it = { kind: 'climb', x: e[0][0], z: e[0][1], deck: e[1].deck, to: e[2].deck, tx: e[3][0], tz: e[3][1], up: e[4], dy: e[4] ? dy : -dy,
                   label: (e[4] ? '▲  ' : '▼  ') + VERB[l.type] + (e[4] ? ' up to ' : ' down to ') + dName(e[2].deck) };
        for (var q in base) it[q] = base[q];
        items.push(it);
      });
    });
    /* Reactor control's panel, by the glass. */
    nd.reactors.forEach(function (rx) {
      var ctl = mine[rx.control];
      if (!ctl) return;
      var cxm = (ctl.x0 + ctl.x1) / 2;
      items.push({ kind: 'reactorctl', x: cxm, z: ctl.z0 + 0.6, deck: 'flat', label: 'Reactor control  —  the glass',
                   counter: [cxm - 0.9, ctl.z0, cxm + 0.9, ctl.z0 + 0.45] });
      /* Her tank: nobody walks into the water. */
      var rrm = mine[rx.room];
      if (rrm && rx.window) {
        var tf = tankFoot(rrm, rx);
        items.push({ kind: 'core', x: (tf.x0 + tf.x1) / 2, z: (tf.z0 + tf.zb) / 2, deck: 'flat', label: '', silent: true,
                     counter: [tf.x0, tf.z0, tf.x1, tf.zb] });
      }
    });
    doors.forEach(function (d) { if (d.deck === 'flat') d.yOff = deckY.flat - c.geom.floorY; });
    var deckAll = c.decked ? (c.deckAll || []).slice() : ['main'];
    if (c.decked) deckAll = Object.keys(c.deckY);
    deckAll.push('flat');
    deckAll.sort(function (p1, p2) { return deckY[p2] - deckY[p1]; });
    return {
      deckY: deckY, deckAll: deckAll, deckName: deckName,
      naval: { style: nd.style, cx: 0, hw: hw, flat: true, layout: nd, misfit: [], narrowed: [], dropped: [], lowered: [],
               reactors: nd.reactors.map(function (r) { var o = {}; for (var q in r) o[q] = r[q]; o.room = 'nv-' + r.room; o.control = 'nv-' + r.control; return o; }) }
    };
  }

  /* Plain walls round the naval rooms, each cut for its doors, the jambs
   * through the wall's thickness, a light down the ceiling; ladders,
   * scuttles and trunk hatches where their items are; and the reactor's
   * core and its glass lit blue (stage 3 builds the real fittings). */
  var NAVAL_TINT = { engine: 'lockWall', aux: 'lockWall', reactor: 'lockWall', tunnel: 'lockWall', reactorctl: 'console', magazine: 'lockWall',
                     hangar: 'lockWall', platform: 'lockWall', tramway: 'lockWall', passage: 'passWall', cross: 'passWall', lobby: 'passWall', landing: 'passWall' };
  /* The reactor window's glass (gl.js '~h': opacity h/15) and the rod
   * drives' lamps. The glow itself is reactorGlowMesh's. */
  var ROD_LAMP = '!#7dff9a';
  function deckFy(p, dk) { return p.deckY && p.deckY[dk] !== undefined ? p.deckY[dk] : p.floorY; }
  function navalMesh(m, pal, p) {
    var rs = p.rooms.filter(function (r) { return r.kind === 'naval'; });
    if (p.naval) p.naval.spill = [];
    rs.forEach(function (r) {
      var fy = deckFy(p, r.deck), h = r.y1, cy = fy + h;
      var wall = pal[NAVAL_TINT[r.sub] || 'wall'] || pal.wall;
      var floor = r.sub === 'passage' || r.sub === 'cross' || r.sub === 'lobby' || r.sub === 'tunnel' ? pal.passFloor : pal.floor;
      quad(m, [r.x0, fy, r.z0], [r.x1, fy, r.z0], [r.x1, fy, r.z1], [r.x0, fy, r.z1], floor);
      quad(m, [r.x0, cy, r.z0], [r.x1, cy, r.z0], [r.x1, cy, r.z1], [r.x0, cy, r.z1], pal.ceil);
      /* Each wall, round its doorways. */
      var cuts = { x0: [], x1: [], z0: [], z1: [] };
      p.doors.forEach(function (d) {
        if (d.deck !== r.deck || !d.wall) return;
        if (d.axis === 'x') {
          if (Math.abs(d.wall[0] - r.x1) < 1e-4 && d.zc > r.z0 && d.zc < r.z1) cuts.x1.push(d.zc);
          if (Math.abs(d.wall[1] - r.x0) < 1e-4 && d.zc > r.z0 && d.zc < r.z1) cuts.x0.push(d.zc);
        } else {
          var xc = d.xc !== undefined ? d.xc : 0;
          if (Math.abs(d.wall[0] - r.z1) < 1e-4 && xc > r.x0 && xc < r.x1) cuts.z1.push(xc);
          if (Math.abs(d.wall[1] - r.z0) < 1e-4 && xc > r.x0 && xc < r.x1) cuts.z0.push(xc);
        }
      });
      /* The reactor's window through the bulkhead between reactor and
       * control: a hole in the reactor's forward wall and in control's aft
       * one (glowMesh is what is seen through it). */
      var windows = { x0: [], x1: [], z0: [], z1: [] };
      ((p.naval && p.naval.reactors) || []).forEach(function (rx) {
        var w = rx.window;
        if (!w) return;
        if (rx.room === r.id) windows.z1.push({ u0: w.x0, u1: w.x1, v0: w.y0, v1: w.y1 });
        if (rx.control === r.id) windows.z0.push({ u0: w.x0, u1: w.x1, v0: w.y0, v1: w.y1 });
        /* And the tunnel's port onto her tank's side. */
        var pt = rx.port;
        if (pt && rx.room === r.id) windows.x1.push({ u0: pt.z0, u1: pt.z1, v0: pt.y0, v1: pt.y1 });
        if (pt && rx.tunnel === r.id) windows.x0.push({ u0: pt.z0, u1: pt.z1, v0: pt.y0, v1: pt.y1 });
      });
      function wallRun(side) {
        var alongX = side === 'z0' || side === 'z1', fixed = r[side], a0 = alongX ? r.x0 : r.z0, a1 = alongX ? r.x1 : r.z1;
        var P = function (u, y) { return alongX ? [u, y, fixed] : [fixed, y, u]; };
        var holes = cuts[side].map(function (cc) { return { u0: cc - DOOR_HW, u1: cc + DOOR_HW, v0: fy, v1: fy + DOOR_H }; })
          .concat(windows[side]);
        wallHoles(m, P, a0, a1, fy, cy, holes, wall);
      }
      ['x0', 'x1', 'z0', 'z1'].forEach(wallRun);
      /* The reactor's light spilling into this room through the window (or
       * a tunnel's port) in its wall (spillOnto). */
      ((p.naval && p.naval.reactors) || []).forEach(function (rx) {
        var viaWin = rx.control === r.id && rx.window, viaPort = rx.tunnel === r.id && rx.port;
        if (!viaWin && !viaPort) return;
        var T = reactorTank(p, rx);
        if (!T) return;
        var S = [T.core.x, T.core.y, T.core.z], e = 0.004, ap, N, skip;
        if (viaWin) {
          var w = rx.window;
          ap = [[w.x0, w.y0, r.z0], [w.x1, w.y0, r.z0], [w.x1, w.y1, r.z0], [w.x0, w.y1, r.z0]]; N = [0, 0, 1]; skip = 'z0';
        } else {
          var q = rx.port;
          ap = [[r.x0, q.y0, q.z0], [r.x0, q.y0, q.z1], [r.x0, q.y1, q.z1], [r.x0, q.y1, q.z0]]; N = [1, 0, 0]; skip = 'x0';
        }
        var surfs = [
          { poly: [[r.x0, fy + e, r.z0], [r.x1, fy + e, r.z0], [r.x1, fy + e, r.z1], [r.x0, fy + e, r.z1]], base: floor },
          { poly: [[r.x0, cy - e, r.z0], [r.x1, cy - e, r.z0], [r.x1, cy - e, r.z1], [r.x0, cy - e, r.z1]], base: pal.ceil }
        ];
        ['x0', 'x1', 'z0', 'z1'].forEach(function (side) {
          if (side === skip) return;
          var alongX = side === 'z0' || side === 'z1', inward = side === 'x0' || side === 'z0' ? e : -e, fixed = r[side] + inward;
          var holes = cuts[side].map(function (cc) { return { u0: cc - DOOR_HW, u1: cc + DOOR_HW, v0: fy, v1: fy + DOOR_H }; }).concat(windows[side]);
          holeRects(alongX ? r.x0 : r.z0, alongX ? r.x1 : r.z1, fy, cy, holes).forEach(function (h) {
            var P = function (u, y) { return alongX ? [u, y, fixed] : [fixed, y, u]; };
            surfs.push({ poly: [P(h.u0, h.v0), P(h.u1, h.v0), P(h.u1, h.v1), P(h.u0, h.v1)], base: wall });
          });
        });
        p.naval.spill = p.naval.spill.concat(spillOnto(S, ap, N, surfs));
      });
      /* A light down the middle, along the room's length. */
      var lx = (r.x0 + r.x1) / 2, lz = (r.z0 + r.z1) / 2, alongZ = (r.z1 - r.z0) >= (r.x1 - r.x0);
      var L2 = Math.max(0.3, (alongZ ? r.z1 - r.z0 : r.x1 - r.x0) / 2 - 0.4);
      if (r.sub !== 'tramway') {
        if (alongZ) lightRun(m, [lx - 0.06, cy - 0.01, lz - L2], [lx + 0.06, cy - 0.01, lz - L2], [lx + 0.06, cy - 0.01, lz + L2], [lx - 0.06, cy - 0.01, lz + L2], pal.light, pal.ceil);
        else lightRun(m, [lx - L2, cy - 0.01, lz - 0.06], [lx + L2, cy - 0.01, lz - 0.06], [lx + L2, cy - 0.01, lz + 0.06], [lx - L2, cy - 0.01, lz + 0.06], pal.light, pal.ceil);
      }
      if (r.sub === 'tramway') {
        /* The rail and its lights strung down the trunk. */
        box(m, lx - 0.08, fy, r.z0, lx + 0.08, fy + 0.12, r.z1, pal.rib);
        for (var tz = r.z0 + 2; tz < r.z1 - 1; tz += 6) quad(m, [lx - 0.3, cy - 0.01, tz - 0.3], [lx + 0.3, cy - 0.01, tz - 0.3], [lx + 0.3, cy - 0.01, tz + 0.3], [lx - 0.3, cy - 0.01, tz + 0.3], pal.light);
      }
    });
    /* The jambs, through the wall between a door's two rooms. */
    p.doors.forEach(function (d) {
      if (!d.naval || !d.wall) return;
      var fy = deckFy(p, d.deck), t0 = d.wall[0], t1 = d.wall[1];
      if (t1 - t0 < 1e-4) return;
      if (d.axis === 'x') {
        [d.zc - DOOR_HW, d.zc + DOOR_HW].forEach(function (z) { quad(m, [t0, fy, z], [t1, fy, z], [t1, fy + DOOR_H, z], [t0, fy + DOOR_H, z], pal.jamb); });
        quad(m, [t0, fy + DOOR_H, d.zc - DOOR_HW], [t1, fy + DOOR_H, d.zc - DOOR_HW], [t1, fy + DOOR_H, d.zc + DOOR_HW], [t0, fy + DOOR_H, d.zc + DOOR_HW], pal.jamb);
        quad(m, [t0, fy + 0.002, d.zc - DOOR_HW], [t1, fy + 0.002, d.zc - DOOR_HW], [t1, fy + 0.002, d.zc + DOOR_HW], [t0, fy + 0.002, d.zc + DOOR_HW], d.fit === 'Z' ? pal.hazard : pal.passFloor);
      } else {
        [d.xc - DOOR_HW, d.xc + DOOR_HW].forEach(function (x) { quad(m, [x, fy, t0], [x, fy, t1], [x, fy + DOOR_H, t1], [x, fy + DOOR_H, t0], pal.jamb); });
        quad(m, [d.xc - DOOR_HW, fy + DOOR_H, t0], [d.xc + DOOR_HW, fy + DOOR_H, t0], [d.xc + DOOR_HW, fy + DOOR_H, t1], [d.xc - DOOR_HW, fy + DOOR_H, t1], pal.jamb);
        quad(m, [d.xc - DOOR_HW, fy + 0.002, t0], [d.xc + DOOR_HW, fy + 0.002, t0], [d.xc + DOOR_HW, fy + 0.002, t1], [d.xc - DOOR_HW, fy + 0.002, t1], d.fit === 'Z' ? pal.hazard : pal.passFloor);
      }
    });
    /* Ladders, scuttles and trunk hatches, from their items' lower ends. */
    p.items.forEach(function (it) {
      if (it.kind !== 'climb' || !it.up) return;
      var fy = deckFy(p, it.deck), top = fy + (it.dy || 3);
      var r = p.rooms.filter(function (q) { return q.id && q.deck === it.deck && it.x >= q.x0 && it.x <= q.x1 && it.z >= q.z0 && it.z <= q.z1; })[0];
      var ceilY = r ? fy + r.y1 : top;
      if (it.via === 'ladder' || it.via === 'stair') {
        /* Two stringers on the incline, foot aft, head forward, and the
         * treads between them; the hatch's coaming round the head. */
        var x = it.foot[0], z0 = it.foot[1], z1 = it.head[1], hw = it.via === 'stair' ? 0.5 : 0.36;
        [-hw, hw].forEach(function (dx) {
          quad(m, [x + dx - 0.03, fy, z0], [x + dx + 0.03, fy, z0], [x + dx + 0.03, top, z1], [x + dx - 0.03, top, z1], pal.rib);
        });
        var nT = Math.max(4, Math.round((top - fy) / 0.24));
        for (var ti = 1; ti < nT; ti++) {
          var u = ti / nT, ty = fy + (top - fy) * u, tz2 = z0 + (z1 - z0) * u;
          quad(m, [x - hw, ty, tz2 - 0.11], [x + hw, ty, tz2 - 0.11], [x + hw, ty, tz2 + 0.11], [x - hw, ty, tz2 + 0.11], it.fit === 'Z' ? pal.hazard : pal.rib);
        }
        var hz0 = z1 - 1.0, hz1 = z1 + 0.2;
        box(m, x - hw - 0.1, ceilY - 0.06, hz0, x + hw + 0.1, ceilY, hz1, it.fit === 'Z' ? pal.hazard : pal.jamb);
      } else if (it.via === 'scuttle') {
        var sx = it.x, sz = it.z;
        [-0.2, 0.2].forEach(function (dx) { box(m, sx + dx - 0.02, fy, sz - 0.02, sx + dx + 0.02, ceilY, sz + 0.02, pal.rib); });
        for (var ry = fy + 0.3; ry < ceilY - 0.1; ry += 0.3) box(m, sx - 0.2, ry, sz - 0.015, sx + 0.2, ry + 0.03, sz + 0.015, pal.rib);
        box(m, sx - 0.35, ceilY - 0.05, sz - 0.35, sx + 0.35, ceilY, sz + 0.35, pal.hazardDark);
      } else {
        /* An escape trunk's hatch on the wall it is let into, ringed in
         * hazard yellow. */
        quad(m, [it.x - 0.4, fy + 0.3, it.z], [it.x + 0.4, fy + 0.3, it.z], [it.x + 0.4, fy + 1.6, it.z], [it.x - 0.4, fy + 1.6, it.z], pal.hazard);
        quad(m, [it.x - 0.32, fy + 0.38, it.z + 0.003], [it.x + 0.32, fy + 0.38, it.z + 0.003], [it.x + 0.32, fy + 1.52, it.z + 0.003], [it.x - 0.32, fy + 1.52, it.z + 0.003], pal.hatch);
      }
    });
    /* THE REACTORS (2026-11-23, "finish the reactor glow"). The water
     * jacket's tank stands against the bulkhead, so the window in it looks
     * straight into the water: control's side sees the core through the
     * glass, lit by its own Cherenkov light (glowMesh, drawn at whatever
     * power she is making). Here, the parts that do not glow: the tank's
     * steel outside, seen in the reactor's room; the window's reveal
     * through the bulkhead and its bolted frame; the glass, faintly
     * tinted; the control rods in the water and their drives. */
    ((p.naval && p.naval.reactors) || []).forEach(function (rx) {
      var T = reactorTank(p, rx);
      if (!T) return;
      var w = rx.window, fy = T.fy, zb = T.zb, zc = T.zc;
      box(m, T.x0, T.y0, T.z0, T.x0 + 0.04, T.y1, zb, pal.bulk);
      if (!rx.port) box(m, T.x1 - 0.04, T.y0, T.z0, T.x1, T.y1, zb, pal.bulk);
      else {
        /* The tunnel's port: the reveal through her wall's thickness, and a
         * bolted frame on the tunnel's side. */
        var pt = rx.port, tr = p.rooms.filter(function (q) { return q.id === rx.tunnel; })[0];
        var xa = T.x1, xt = tr ? tr.x0 : xa + WALL_T, xf = xt + 0.02;
        quad(m, [xa, pt.y0, pt.z0], [xt, pt.y0, pt.z0], [xt, pt.y0, pt.z1], [xa, pt.y0, pt.z1], pal.jamb);
        quad(m, [xa, pt.y1, pt.z0], [xt, pt.y1, pt.z0], [xt, pt.y1, pt.z1], [xa, pt.y1, pt.z1], pal.jamb);
        quad(m, [xa, pt.y0, pt.z0], [xa, pt.y1, pt.z0], [xt, pt.y1, pt.z0], [xt, pt.y0, pt.z0], pal.jamb);
        quad(m, [xa, pt.y0, pt.z1], [xa, pt.y1, pt.z1], [xt, pt.y1, pt.z1], [xt, pt.y0, pt.z1], pal.jamb);
        box(m, xt, pt.y0 - 0.12, pt.z0 - 0.12, xf, pt.y0, pt.z1 + 0.12, pal.jamb);
        box(m, xt, pt.y1, pt.z0 - 0.12, xf, pt.y1 + 0.12, pt.z1 + 0.12, pal.jamb);
        box(m, xt, pt.y0, pt.z0 - 0.12, xf, pt.y1, pt.z0, pal.jamb);
        box(m, xt, pt.y0, pt.z1, xf, pt.y1, pt.z1 + 0.12, pal.jamb);
        for (var pb = 0; pb <= 4; pb++) {
          var bz = pt.z0 - 0.06 + (pt.z1 - pt.z0 + 0.12) * pb / 4;
          [pt.y0 - 0.06, pt.y1 + 0.06].forEach(function (by) { box(m, xf, by - 0.015, bz - 0.015, xf + 0.012, by + 0.015, bz + 0.015, pal.rib); });
        }
      }
      box(m, T.x0, T.y0, T.z0, T.x1, T.y1, T.z0 + 0.04, pal.bulk);
      box(m, T.x0, T.y1 - 0.04, T.z0, T.x1, T.y1, zb, pal.overhead);
      /* THE PIT, dressed (Astra: "the reactor room needs texture, the pit
       * there would have more than flat matte walls around it"). Outside:
       * the tank's stiffening ribs, a flange round her rim, a kick plate in
       * hazard stripes at her foot, and her coolant pipes aft to the
       * bulkhead. Inside, dark against the glow: a ladder down her back
       * wall, and a spent-fuel rack on her floor behind the core. */
      var rrm = p.rooms.filter(function (q) { return q.id === rx.room; })[0];
      var ribs = function (a0, a1, f) { for (var a = a0 + 0.3; a < a1 - 0.15; a += 0.6) f(a); };
      ribs(T.z0, zb, function (z) { box(m, T.x0 - 0.07, T.y0, z - 0.04, T.x0, T.y1 - 0.06, z + 0.04, pal.rib); });
      if (!rx.port) ribs(T.z0, zb, function (z) { box(m, T.x1, T.y0, z - 0.04, T.x1 + 0.07, T.y1 - 0.06, z + 0.04, pal.rib); });
      ribs(T.x0, T.x1, function (x) { box(m, x - 0.04, T.y0, T.z0 - 0.07, x + 0.04, T.y1 - 0.06, T.z0, pal.rib); });
      /* The rim flange. */
      box(m, T.x0 - 0.09, T.y1 - 0.1, T.z0 - 0.09, T.x0, T.y1, zb, pal.jamb);
      if (!rx.port) box(m, T.x1, T.y1 - 0.1, T.z0 - 0.09, T.x1 + 0.09, T.y1, zb, pal.jamb);
      box(m, T.x0 - 0.09, T.y1 - 0.1, T.z0 - 0.09, T.x1 + (rx.port ? 0 : 0.09), T.y1, T.z0, pal.jamb);
      /* The kick plate, striped. */
      var kick = function (a0, a1, P) {
        for (var a = a0, k = 0; a < a1 - 1e-3; a += 0.25, k++) P(a, Math.min(a1, a + 0.25), k % 2 ? pal.hazardDark : pal.hazard);
      };
      kick(T.z0 - 0.08, zb, function (a, b, col) { quad(m, [T.x0 - 0.08, T.y0, a], [T.x0 - 0.08, T.y0, b], [T.x0 - 0.08, T.y0 + 0.14, b], [T.x0 - 0.08, T.y0 + 0.14, a], col); });
      kick(T.x0 - 0.08, T.x1 + (rx.port ? 0 : 0.08), function (a, b, col) { quad(m, [b, T.y0, T.z0 - 0.08], [a, T.y0, T.z0 - 0.08], [a, T.y0 + 0.14, T.z0 - 0.08], [b, T.y0 + 0.14, T.z0 - 0.08], col); });
      if (!rx.port) kick(T.z0 - 0.08, zb, function (a, b, col) { quad(m, [T.x1 + 0.08, T.y0, b], [T.x1 + 0.08, T.y0, a], [T.x1 + 0.08, T.y0 + 0.14, a], [T.x1 + 0.08, T.y0 + 0.14, b], col); });
      /* Her coolant pipes: two, out of her back, aft to the bulkhead. */
      if (rrm && T.z0 - rrm.z0 > 0.2) {
        var pmx = (T.x0 + T.x1) / 2;
        [[pmx - 0.5, fy + 0.7], [pmx + 0.5, fy + 1.3]].forEach(function (pp) {
          box(m, pp[0] - 0.11, pp[1] - 0.11, rrm.z0, pp[0] + 0.11, pp[1] + 0.11, T.z0 - 0.07, pal.console);
          box(m, pp[0] - 0.15, pp[1] - 0.15, T.z0 - 0.12, pp[0] + 0.15, pp[1] + 0.15, T.z0 - 0.07, pal.jamb);
        });
      }
      /* Inside: the ladder, in her back wall's corner. */
      var lx0 = T.x0 + 0.3, lzb = T.z0 + 0.05;
      box(m, lx0, T.y0, lzb, lx0 + 0.04, T.y1 - 0.04, lzb + 0.12, pal.rib);
      box(m, lx0 + 0.42, T.y0, lzb, lx0 + 0.46, T.y1 - 0.04, lzb + 0.12, pal.rib);
      for (var ly = T.y0 + 0.3; ly < T.y1 - 0.1; ly += 0.3) box(m, lx0 + 0.04, ly - 0.015, lzb + 0.08, lx0 + 0.42, ly + 0.015, lzb + 0.11, pal.rib);
      /* And the rack: a grid of square cells on her floor, behind the core
       * (so the glass's view of her is clear), in the corner away from the
       * ladder. */
      var rkz1 = T.core.z - T.core.hz - 0.25, rkz0 = Math.max(T.z0 + 0.1, rkz1 - 0.75);
      var rkx1 = T.x1 - 0.15, rkx0 = Math.max(lx0 + 0.7, rkx1 - 1.0), rkh = Math.min(0.9, (T.y1 - T.y0) * 0.35);
      if (rkz1 - rkz0 > 0.3 && rkx1 - rkx0 > 0.3) {
        for (var gx = rkx0; gx <= rkx1 + 1e-3; gx += (rkx1 - rkx0) / 4) box(m, gx - 0.015, T.y0, rkz0, gx + 0.015, T.y0 + rkh, rkz1, pal.rib);
        for (var gz = rkz0; gz <= rkz1 + 1e-3; gz += (rkz1 - rkz0) / 3) box(m, rkx0, T.y0, gz - 0.015, rkx1, T.y0 + rkh, gz + 0.015, pal.rib);
      }
      /* The window's reveal, through the bulkhead's thickness. */
      if (zc - zb > 1e-4) {
        quad(m, [w.x0, w.y0, zb], [w.x1, w.y0, zb], [w.x1, w.y0, zc], [w.x0, w.y0, zc], pal.jamb);
        quad(m, [w.x0, w.y1, zb], [w.x1, w.y1, zb], [w.x1, w.y1, zc], [w.x0, w.y1, zc], pal.jamb);
        quad(m, [w.x0, w.y0, zb], [w.x0, w.y1, zb], [w.x0, w.y1, zc], [w.x0, w.y0, zc], pal.jamb);
        quad(m, [w.x1, w.y0, zb], [w.x1, w.y1, zb], [w.x1, w.y1, zc], [w.x1, w.y0, zc], pal.jamb);
      }
      /* The frame on control's face, bolted, and the glass a hand's width
       * in: thick, and only faintly blue of itself. */
      var fz = zc + 0.02;
      box(m, w.x0 - 0.14, w.y0 - 0.14, zc, w.x1 + 0.14, w.y0, fz, pal.jamb);
      box(m, w.x0 - 0.14, w.y1, zc, w.x1 + 0.14, w.y1 + 0.14, fz, pal.jamb);
      box(m, w.x0 - 0.14, w.y0, zc, w.x0, w.y1, fz, pal.jamb);
      box(m, w.x1, w.y0, zc, w.x1 + 0.14, w.y1, fz, pal.jamb);
      for (var bi = 0; bi <= 6; bi++) {
        var bx = w.x0 - 0.07 + (w.x1 - w.x0 + 0.14) * bi / 6;
        [w.y0 - 0.07, w.y1 + 0.07].forEach(function (by) { box(m, bx - 0.015, by - 0.015, fz, bx + 0.015, by + 0.015, fz + 0.012, pal.rib); });
      }
      /* No pane drawn: gl.js draws see-through faces by dithering, which
       * greyed the whole view of the water (2026-11-23 probe). The frame
       * and the reveal say it is thick glass. */
      /* The control rods, dark against the glow, in a lattice across the
       * whole face of the core (reactorRods): a row along one edge would
       * leave that side cold and the far side hot, the neutron field badly
       * tilted (Astra, 2026-11-23). Lying down, they come in from the
       * front, each from its drive on a frame hung in the water between
       * the core and the glass; standing, down from drives on the lid. A
       * rod-position panel over the window, a lamp per rod, laid out as
       * the rods are. */
      var R = reactorRods(p, rx, T), c = T.core;
      if (R.face === 'fwd') {
        var zF = c.z + c.hz, zf = zF + Math.min(0.3, (zb - zF) * 0.45), zh = Math.min(zb - 0.03, zf + 0.15);
        var xa = Infinity, xb = -Infinity, ys = {};
        R.at.forEach(function (r) {
          box(m, r.x - 0.025, r.y - 0.025, c.z + c.hz * 0.2, r.x + 0.025, r.y + 0.025, zf, pal.rib);
          box(m, r.x - 0.045, r.y - 0.045, zf, r.x + 0.045, r.y + 0.045, zh, pal.console);
          xa = Math.min(xa, r.x); xb = Math.max(xb, r.x); ys[r.y.toFixed(3)] = r.y;
        });
        /* The frame: a light bar behind each row of drives, and a hanger
         * down from the lid at each end. */
        Object.keys(ys).forEach(function (k) {
          var yy = ys[k] + 0.06;
          box(m, xa - 0.12, yy, zh - 0.04, xb + 0.12, yy + 0.025, zh, pal.rib);
        });
        var yLo = Math.min.apply(null, Object.keys(ys).map(function (k) { return ys[k]; })) + 0.06;
        [xa - 0.12, xb + 0.12].forEach(function (hx) { box(m, hx - 0.02, yLo, zh - 0.04, hx + 0.02, T.y1 - 0.04, zh, pal.rib); });
      } else {
        R.at.forEach(function (r) {
          box(m, r.x - 0.025, c.y + c.hy * 0.3, r.z - 0.025, r.x + 0.025, T.y1 - 0.04, r.z + 0.025, pal.rib);
          box(m, r.x - 0.05, T.y1, r.z - 0.05, r.x + 0.05, Math.min(fy + T.roomH - 0.05, T.y1 + 0.4), r.z + 0.05, pal.console);
        });
      }
      /* The rod-position panel over the window: the lattice in lamps. */
      var pw = R.cols * 0.08 + 0.08, ph = R.rows * 0.08 + 0.08, pcx = (w.x0 + w.x1) / 2, py0 = w.y1 + 0.2;
      if (py0 + ph < fy + T.roomH - 0.05) {
        box(m, pcx - pw / 2, py0, zc, pcx + pw / 2, py0 + ph, fz + 0.04, pal.console);
        R.at.forEach(function (r) {
          var lx = pcx - pw / 2 + 0.08 + r.i * 0.08, ly = py0 + 0.08 + r.j * 0.08, lz = fz + 0.042;
          quad(m, [lx - 0.025, ly - 0.025, lz], [lx + 0.025, ly - 0.025, lz], [lx + 0.025, ly + 0.025, lz], [lx - 0.025, ly + 0.025, lz], ROD_LAMP);
        });
      }
    });
  }
  /* A flat wall from a0 to a1 along it, y0 to y1 up it, with rectangular
   * holes ({u0, u1, v0, v1}: doors, windows) cut out. Split at every
   * hole's edges along the wall; each strip is walled wherever no hole
   * covers it. */
  function wallHoles(m, P, a0, a1, y0, y1, holes, col) {
    holeRects(a0, a1, y0, y1, holes).forEach(function (q) {
      quad(m, P(q.u0, q.v0), P(q.u1, q.v0), P(q.u1, q.v1), P(q.u0, q.v1), col);
    });
  }
  /* The solid rectangles of a wall with holes in it (wallHoles), as
   * {u0, u1, v0, v1}: the spill of reactor light lands on these and not
   * in a doorway. */
  function holeRects(a0, a1, y0, y1, holes) {
    var out = [];
    var hs = holes.map(function (h) {
      return { u0: Math.max(a0, h.u0), u1: Math.min(a1, h.u1), v0: Math.max(y0, h.v0), v1: Math.min(y1, h.v1) };
    }).filter(function (h) { return h.u1 > h.u0 + 1e-6 && h.v1 > h.v0 + 1e-6; });
    var cuts = [a0, a1];
    hs.forEach(function (h) { cuts.push(h.u0, h.u1); });
    cuts.sort(function (a, b) { return a - b; });
    for (var i = 0; i + 1 < cuts.length; i++) {
      var ua = cuts[i], ub = cuts[i + 1];
      if (ub - ua < 1e-6) continue;
      var over = hs.filter(function (h) { return h.u0 <= ua + 1e-6 && h.u1 >= ub - 1e-6; })
        .sort(function (a, b) { return a.v0 - b.v0; });
      var at = y0;
      over.forEach(function (h) {
        if (h.v0 > at + 1e-6) out.push({ u0: ua, u1: ub, v0: at, v1: h.v0 });
        at = Math.max(at, h.v1);
      });
      if (y1 > at + 1e-6) out.push({ u0: ua, u1: ub, v0: at, v1: y1 });
    }
    return out;
  }

  /* THE SPILL (2026-11-23). Astra: "the glow should spill out into the
   * hallway in straight lines from where it starts." The core's light goes
   * out through the window (and a tunnel's port) in straight lines, so what
   * it lights in the room beyond is the wedge from the core through the
   * opening's four edges: on the floor, the far and side walls and the
   * ceiling, a patch with straight edges, cut round the doorways. Each
   * patch is kept here as a polygon on its surface (navalMesh finds them,
   * with the surface's own colour); reactorGlowMesh tints it by the
   * reactor's power. Lit like the surface it lies on, not self-lit, so at
   * no power it is that surface exactly and never shows an edge. */
  function clipPoly(poly, n, d) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var da = n[0] * a[0] + n[1] * a[1] + n[2] * a[2] + d, db = n[0] * b[0] + n[1] * b[1] + n[2] * b[2] + d;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        var t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    return out;
  }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  /* The light from S through the opening `ap` (four corners, in order
   * round it, and N, its normal into the room) landing on the room's
   * surfaces: [{ pts, base }]. `surfs`: [{ poly, base }], each a convex
   * polygon on a surface of the room, already off it by a few millimetres. */
  function spillOnto(S, ap, N, surfs) {
    var ac = [0, 1, 2].map(function (k) { return (ap[0][k] + ap[1][k] + ap[2][k] + ap[3][k]) / 4; });
    var planes = [];
    for (var i = 0; i < 4; i++) {
      var n = cross3(sub3(ap[i], S), sub3(ap[(i + 1) % 4], S));
      if (dot3(n, sub3(ac, S)) < 0) n = [-n[0], -n[1], -n[2]];
      planes.push([n, -dot3(n, S)]);
    }
    planes.push([N, -dot3(N, ac) - 0.01]);           // beyond the opening
    var out = [];
    surfs.forEach(function (s) {
      var poly = s.poly;
      for (var j = 0; j < planes.length && poly.length >= 3; j++) poly = clipPoly(poly, planes[j][0], planes[j][1]);
      if (poly.length >= 3) out.push({ pts: poly, base: s.base, ac: ac });
    });
    return out;
  }
  /* Where a reactor's tank, core and window are, in the plan's metres. The
   * tank stands on the reactor room's floor against its forward wall (the
   * bulkhead the window is in), across the window and the core, and back
   * past the core by her water jacket. */
  function reactorTank(p, rx) {
    var rr = p.rooms.filter(function (q) { return q.id === rx.room; })[0];
    if (!rr || !rx.window) return null;
    var ctl = p.rooms.filter(function (q) { return q.id === rx.control; })[0];
    var fy = deckFy(p, rr.deck), c = rx.core, w = rx.window;
    var hx = rx.axis === 'h' ? c.len / 2 : c.r, hy = rx.axis === 'h' ? c.r : c.len / 2, hz = c.r;
    /* Her core stands on a support plate, water under it as round it,
     * centred on the window so the whole of her is in sight over the
     * control panel; never closer than 30 cm to the floor, nor so high
     * her rods' drives would leave the lid no room. */
    var yc = Math.max(fy + hy + 0.3, Math.min((w.y0 + w.y1) / 2, fy + rr.y1 - 0.45 - hy));
    var F = tankFoot(rr, rx), x0 = F.x0, x1 = F.x1, zb = F.zb, z0 = F.z0;
    var y1 = Math.min(fy + rr.y1 - 0.1, Math.max(w.y1, yc + hy) + 0.35);
    return { fy: fy, roomH: rr.y1, x0: x0, x1: x1, y0: fy, y1: y1, z0: z0, zb: zb,
             zc: ctl ? ctl.z0 : w.z + (w.z - zb),
             core: { x: c.x, y: yc, z: Math.min(c.z, zb - hz - 0.5), hx: hx, hy: hy, hz: hz } };
  }

  /* A reactor tank's footprint in her room ({x0, x1, z0, zb}): against the
   * forward bulkhead (zb, the window's), across the window and the core,
   * back past the core by her jacket; to the tunnel's wall where a tunnel's
   * port is in her side. reactorTank draws it; the walk is kept out of it
   * (the 'core' items, navalize and the flat). */
  function tankFoot(rr, rx) {
    var c = rx.core, w = rx.window;
    var hx = rx.axis === 'h' ? c.len / 2 : c.r, hz = c.r;
    var x0 = Math.max(rr.x0 + 0.02, Math.min(w.x0 - 0.15, c.x - hx - 0.45));
    var x1 = rx.port ? rr.x1 : Math.min(rr.x1 - 0.02, Math.max(w.x1 + 0.15, c.x + hx + 0.45));
    var zb = rr.z1, z0 = Math.max(rr.z0 + 0.3, Math.min(c.z - hz - (rx.jacket || 1.2), zb - 1.2));
    return { x0: x0, x1: x1, z0: z0, zb: zb };
  }
  /* Where a reactor's control rods go in: a square lattice about 45 cm
   * apart across the whole face they enter by (lying down, her forward
   * face, x by y; standing, her head, x by z), centred on the core and
   * reaching to within an eighth of her edges, so the rods' pull on the
   * neutrons is even across her. At least 2 by 2, at most 7 by 7.
   * { face, cols, rows, at: [{ i, j, x, y, z }] }. */
  var ROD_PITCH = 0.45;
  function reactorRods(p, rx, T) {
    T = T || reactorTank(p, rx);
    var c = T.core, fwd = rx.rods && rx.rods.face === 'fwd';
    var hu = c.hx, hv = fwd ? c.hy : c.hz;
    var nOf = function (h) { return Math.max(2, Math.min(7, Math.ceil(2 * h * 0.75 / ROD_PITCH - 1e-9) + 1)); };
    var cols = nOf(hu), rows = nOf(hv), at = [];
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var u = c.x + (i / (cols - 1) - 0.5) * 2 * hu * 0.75, v = (j / (rows - 1) - 0.5) * 2 * hv * 0.75;
      at.push(fwd ? { i: i, j: j, x: u, y: c.y + v, z: c.z + c.hz }
                  : { i: i, j: j, x: u, y: c.y + c.hy, z: c.z + v });
    }
    return { face: fwd ? 'fwd' : 'top', cols: cols, rows: rows, at: at };
  }

  /* THE GLOW (2026-11-23). The water in a reactor's tank and her core,
   * lit by the core's Cherenkov light at `level` (0 cold, 1 full power):
   * the faces seen through the glass, each split into a fine grid so the
   * light can fall off across it (per-vertex colour, `vcol`, which gl.js
   * draws; the 2D path takes each face's own colour). Brightest at the
   * core, a deep blue by the tank's walls, near black when she is cold.
   * Self-lit throughout: the water's light is its own. One mesh per level,
   * made when first wanted (render.js queueCockpitRoom). */
  var GLOW_COLD = [0.02, 0.05, 0.08], GLOW_BLUE = [0.16, 0.52, 1.0], GLOW_HOT = [0.80, 0.94, 1.0];
  /* How strongly the spill tints what it falls on (before the room's own
   * shading, which darkens it as it does the surface). */
  var SPILL_K = 1.6;
  /* By the square root of her power, as an eye takes light: an afterglow of
   * a few percent is a faint blue, not black. And spread far enough that a
   * Capital's three-metre window is lit water, not grey. */
  function glowColour(level, d) {
    var I = Math.sqrt(level) * (0.3 + 0.7 * Math.exp(-d / 1.4));
    var k = Math.min(1, I * 1.5), hot = Math.max(0, I - 0.55) / 0.45;
    return [0, 1, 2].map(function (i) {
      var c = GLOW_COLD[i] + (GLOW_BLUE[i] - GLOW_COLD[i]) * k;
      return Math.min(1, c + (GLOW_HOT[i] - c) * hot);
    });
  }
  function hex3(c) {
    return '#' + c.map(function (u) { var h = Math.round(Math.max(0, Math.min(1, u)) * 255).toString(16); return h.length < 2 ? '0' + h : h; }).join('');
  }
  function reactorGlowMesh(p, level) {
    var m = mesh();
    m.vcol = [];
    level = Math.max(0, Math.min(1, level || 0));
    ((p.naval && p.naval.reactors) || []).forEach(function (rx) {
      var T = reactorTank(p, rx);
      if (!T) return;
      var c = T.core;
      function dist(q) {
        var dx = Math.max(0, Math.abs(q[0] - c.x) - c.hx), dy = Math.max(0, Math.abs(q[1] - c.y) - c.hy), dz = Math.max(0, Math.abs(q[2] - c.z) - c.hz);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      /* A face of the water, a grid of cells about 20 cm across. */
      function sheet(o, U, V, nu, nv, skip) {
        for (var i = 0; i < nu; i++) for (var j = 0; j < nv; j++) {
          var P = function (a, b) { return [o[0] + U[0] * a + V[0] * b, o[1] + U[1] * a + V[1] * b, o[2] + U[2] * a + V[2] * b]; };
          if (skip && skip(P((i + 0.5) / nu, (j + 0.5) / nv))) continue;
          var q = [P(i / nu, j / nv), P((i + 1) / nu, j / nv), P((i + 1) / nu, (j + 1) / nv), P(i / nu, (j + 1) / nv)];
          var cols = q.map(function (v) { return glowColour(level, dist(v)); });
          var mid = [0, 1, 2].map(function (k) { return (cols[0][k] + cols[1][k] + cols[2][k] + cols[3][k]) / 4; });
          var n0 = m.v.length;
          q.forEach(function (v, k) { m.v.push(v); m.vcol.push(cols[k]); });
          m.f.push([n0, n0 + 1, n0 + 2], [n0, n0 + 2, n0 + 3]);
          m.c.push('!' + hex3(mid), '!' + hex3(mid));
        }
      }
      var e = 0.05, x0 = T.x0 + e, x1 = T.x1 - e, y0 = T.y0 + e, y1 = T.y1 - e, z0 = T.z0 + e, z1 = T.zb - 0.005;
      var nx = Math.max(2, Math.ceil((x1 - x0) / 0.2)), ny = Math.max(2, Math.ceil((y1 - y0) / 0.2)), nz = Math.max(2, Math.ceil((z1 - z0) / 0.2));
      sheet([x0, y0, z0], [x1 - x0, 0, 0], [0, y1 - y0, 0], nx, ny);          // the back of the tank
      sheet([x0, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0], nz, ny);          // her sides
      /* A flat face of the water across x (ax 'z': a is x) or across z (ax
       * 'x': a is z), b up; with a hole (a window, a port) cut out on its
       * own edges, as up to four sheets round it. */
      function plane(ax, val, a0, a1, b0, b1) {
        if (a1 - a0 < 0.01 || b1 - b0 < 0.01) return;
        var o = ax === 'x' ? [val, b0, a0] : [a0, b0, val], U = ax === 'x' ? [0, 0, a1 - a0] : [a1 - a0, 0, 0];
        sheet(o, U, [0, b1 - b0, 0], Math.max(1, Math.ceil((a1 - a0) / 0.2)), Math.max(1, Math.ceil((b1 - b0) / 0.2)));
      }
      function holed(ax, val, a0, a1, b0, b1, h) {
        if (!h) return plane(ax, val, a0, a1, b0, b1);
        var ha0 = Math.max(a0, h.a0), ha1 = Math.min(a1, h.a1), hb0 = Math.max(b0, h.b0), hb1 = Math.min(b1, h.b1);
        plane(ax, val, a0, ha0, b0, b1); plane(ax, val, ha1, a1, b0, b1);
        plane(ax, val, ha0, ha1, b0, hb0); plane(ax, val, ha0, ha1, hb1, b1);
      }
      /* Her starboard side, open where the tunnel's port looks in; and her
       * front against the bulkhead, open where the window does (from the
       * port, the water reaches the glass, not a dark wall). */
      var pt = rx.port, wn = rx.window;
      holed('x', x1, z0, z1, y0, y1, pt && { a0: pt.z0, a1: pt.z1, b0: pt.y0, b1: pt.y1 });
      holed('z', T.zb - 0.01, x0, x1, y0, y1, { a0: wn.x0, a1: wn.x1, b0: wn.y0, b1: wn.y1 });
      sheet([x0, y0, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], nx, nz);          // the floor
      sheet([x0, y1, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], nx, nz);          // and the water's surface
      /* Her liner (Astra: "the pit there would have more than flat matte
       * walls"): stainless plates a metre square, their welds dark lines
       * on the lit steel, on her back, her sides and her floor; not across
       * the window or a port. */
      function seam(a, b, c, d) {
        var n0 = m.v.length, q = [a, b, c, d];
        var cols = q.map(function (v) { return glowColour(level, dist(v)).map(function (u) { return u * 0.45; }); });
        var mid = [0, 1, 2].map(function (k) { return (cols[0][k] + cols[1][k] + cols[2][k] + cols[3][k]) / 4; });
        q.forEach(function (v, k) { m.v.push(v); m.vcol.push(cols[k]); });
        m.f.push([n0, n0 + 1, n0 + 2], [n0, n0 + 2, n0 + 3]);
        m.c.push('!' + hex3(mid), '!' + hex3(mid));
      }
      /* Welds on a face: across it (ax 'x': a along z; 'z': a along x;
       * 'y': a along x, b along z) at whole metres, split round a hole. */
      function welds(ax, val, a0, a1, b0, b1, hole) {
        var W = 0.012, P = function (a, b) {
          return ax === 'x' ? [val, b, a] : ax === 'z' ? [a, b, val] : [a, val, b];
        };
        var runs = function (lo, hi, hlo, hhi, cutIt) {
          return cutIt && hhi > lo && hlo < hi ? [[lo, Math.max(lo, hlo)], [Math.min(hi, hhi), hi]] : [[lo, hi]];
        };
        for (var u = Math.ceil(a0 + 0.3); u < a1 - 0.3; u += 1.0) {
          var inA = hole && u > hole.a0 && u < hole.a1;
          runs(b0, b1, hole ? hole.b0 : 0, hole ? hole.b1 : 0, inA).forEach(function (r2) {
            if (r2[1] - r2[0] > 0.05) seam(P(u - W, r2[0]), P(u + W, r2[0]), P(u + W, r2[1]), P(u - W, r2[1]));
          });
        }
        for (var v = Math.ceil(b0 + 0.3); v < b1 - 0.3; v += 1.0) {
          var inB = hole && v > hole.b0 && v < hole.b1;
          runs(a0, a1, hole ? hole.a0 : 0, hole ? hole.a1 : 0, inB).forEach(function (r2) {
            if (r2[1] - r2[0] > 0.05) seam(P(r2[0], v - W), P(r2[1], v - W), P(r2[1], v + W), P(r2[0], v + W));
          });
        }
      }
      var so = 0.008;
      welds('z', z0 + so, x0, x1, y0, y1, null);                                   // her back
      welds('x', x0 + so, z0, z1, y0, y1, null);                                   // her sides
      welds('x', x1 - so, z0, z1, y0, y1, pt && { a0: pt.z0, a1: pt.z1, b0: pt.y0, b1: pt.y1 });
      welds('y', y0 + so, x0, x1, z0, z1, null);                                   // her floor
      /* The core: white-blue at power, a dull slate when she is cold. */
      var coreCol = '!' + hex3([0, 1, 2].map(function (k) { return 0.22 + (GLOW_HOT[k] + 0.12 - 0.22) * Math.sqrt(level); }));
      var b0 = m.f.length;
      box(m, c.x - c.hx, c.y - c.hy, c.z - c.hz, c.x + c.hx, c.y + c.hy, c.z + c.hz, coreCol);
      var rgbC = coreCol.slice(2).match(/../g).map(function (h) { return parseInt(h, 16) / 255; });
      while (m.vcol.length < m.v.length) m.vcol.push(rgbC);
    });
    /* The spill (spillOnto): each patch its surface's own colour, tinted
     * blue by the reactor's light, strongest by the opening and falling off
     * with the distance from it. Lit as the surface is (no '!'), so at no
     * power it is the surface. */
    (p.naval && p.naval.spill || []).forEach(function (s) {
      var bh = String(s.base).replace(/^[^#]*/, ''), base = [1, 3, 5].map(function (i) { return parseInt(bh.substr(i, 2), 16) / 255; });
      var n0 = m.v.length;
      s.pts.forEach(function (v) {
        var dx = v[0] - s.ac[0], dy = v[1] - s.ac[1], dz = v[2] - s.ac[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var I = Math.sqrt(level) * SPILL_K / (1 + (d / 2.5) * (d / 2.5));
        m.v.push(v);
        m.vcol.push([0, 1, 2].map(function (k) { return Math.min(1, base[k] + GLOW_BLUE[k] * I); }));
      });
      for (var i = 1; i + 1 < s.pts.length; i++) { m.f.push([n0, n0 + i, n0 + i + 1]); m.c.push(bh); }
    });
    return m;
  }
  /* The leaves of the naval doors, each at its own doorway. */
  function navalLeaves(pal, p, fy0) {
    var lv = {};
    p.doors.forEach(function (d) {
      if (!d.naval || d.arch || !d.wall) return;
      var mid = (d.wall[0] + d.wall[1]) / 2, out = [];
      [-1, 1].forEach(function (s) {
        var m = mesh();
        if (d.axis === 'x') {
          var z0 = s < 0 ? d.zc - DOOR_HW : d.zc, z1 = s < 0 ? d.zc : d.zc + DOOR_HW;
          box(m, mid - LEAF_T / 2, fy0 + 0.005, z0, mid + LEAF_T / 2, fy0 + DOOR_H - 0.01, z1, d.fit === 'Z' ? pal.hazardDark : pal.leaf);
        } else {
          var x0 = s < 0 ? d.xc - DOOR_HW : d.xc, x1 = s < 0 ? d.xc : d.xc + DOOR_HW;
          box(m, x0, fy0 + 0.005, mid - LEAF_T / 2, x1, fy0 + DOOR_H - 0.01, mid + LEAF_T / 2, d.fit === 'Z' ? pal.hazardDark : pal.leaf);
        }
        out.push(m);
      });
      lv[d.id] = out;
    });
    return lv;
  }

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
      /* The naval decks fit themselves (navalize: shrink, then drop). */
      dp.rooms.forEach(function (r) { if (r.kind !== 'cockpit' && (r.kind !== 'naval' || r.blockRoom) && r.walk !== false) out.push({ r: r, fy: dp.floorY }); });
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
        if (misfit.indexOf(e.r.blockRoom ? e.r.id : e.r.kind) >= 0) return false;
        if (roomInside(fit, e.r, e.fy, e.r.x0, e.r.x1, e.r.z0, e.r.z1)) return false;
        bad = e; return true;
      });
      if (!bad) break;
      var r = bad.r, kind = r.kind, done = false;
      /* THE REACTOR BLOCK (BLOCK_HULLS): its compartment narrower from her
       * outboard side, down to what the glass and the reactor door need;
       * the side passage the same, down to a body's width; the avionics
       * bay from its port side. They are never left out: what is still
       * outside her after that is reported (misfit). */
      if (r.blockRoom) {
        var bk = r.sub === 'reactorctl' || r.sub === 'reactor' ? 'engine' : r.id === 'bk-side' ? 'blockSide' : r.id === 'bk-bay' ? 'blockBay' : null;
        if (bk) {
          var fromX1 = bk !== 'blockBay', w2 = r.x1 - r.x0, bw = 0, minW = BLOCK_MIN_W[bk];
          for (var t2 = w2 - 0.1; t2 >= minW - 1e-9; t2 -= 0.1) {
            var a2 = fromX1 ? r.x0 : r.x1 - t2, b2 = fromX1 ? r.x0 + t2 : r.x1;
            if (roomInside(fit, r, bad.fy, a2 - (fromX1 ? 0 : FIT_MARGIN), b2 + (fromX1 ? FIT_MARGIN : 0), r.z0, r.z1)) { bw = t2; break; }
          }
          if (bw) { o.roomW[bk] = bw; done = true; }
        }
        if (!done) misfit.push(r.id);
        continue;
      }
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
    /* The reactor block's layout B is longer by the avionics bay: where that
     * would cost her a room (or leave one outside her), she is laid out as
     * A. Never the other way: A is the shorter. */
    if (p.block === 'B' && !opts.noFallback && (p.fitted.omitted.length || p.fitted.misfit.length)) {
      var oa = {};
      for (var ka in opts) oa[ka] = opts[ka];
      oa.blockVariant = 'A'; oa.noFallback = true;
      var pa = planFitted(geom, oa);
      if (pa.fitted.omitted.length + pa.fitted.misfit.length < p.fitted.omitted.length + p.fitted.misfit.length) {
        pa.fitted.blockFrom = 'B';
        return pa;
      }
    }
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
      var cx = d.axis === 'x' ? (d.wall[0] + d.wall[1]) / 2 : (d.xc !== undefined ? d.xc : 0);
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
  /* CEILING LIGHTS AS LAMPS, NOT STRIPS (2026-11-09). Astra, from the
   * Talon's airlock in 1.2.0 "Brian": a full-bright strip the length of a
   * room, drawn without shading, reads from one end as a white wedge
   * converging on the far door - the same glitch the station tubes had
   * (walk.js tubeLights) - and through a ramp opening it looked like a
   * slab hanging out of the ceiling. So a long light (over 1.4 m) is laid
   * as a run of separate fittings along the same line: each a lens with a
   * dimmer surround that steps down towards the ceiling's colour. Short
   * lights and anything not lying flat (a bunk's wall lamp) are drawn as
   * they were. */
  function hex6(c) { c = String(c).replace('!', ''); return c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c; }
  function mixCol(a, b, t) {
    var A = hex6(a), B = hex6(b), out = '#';
    for (var i = 1; i < 7; i += 2) {
      var v = Math.round(parseInt(A.substr(i, 2), 16) * (1 - t) + parseInt(B.substr(i, 2), 16) * t);
      out += ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
    }
    return (String(a).charAt(0) === '!' ? '!' : '') + out;
  }
  function lightRun(m, a, b, c, d, col, ceil) {
    var flat = Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[1] - c[1]) < 1e-6 && Math.abs(a[1] - d[1]) < 1e-6;
    var U = [b[0] - a[0], 0, b[2] - a[2]], V = [d[0] - a[0], 0, d[2] - a[2]];
    var lu = Math.hypot(U[0], U[2]), lv = Math.hypot(V[0], V[2]);
    var long = Math.max(lu, lv);
    if (!flat || long < 1.4 || !ceil) { quad(m, a, b, c, d, col); return; }
    var alongU = lu >= lv;
    function P(u, v, dy) { return [a[0] + U[0] * u + V[0] * v, a[1] + dy, a[2] + U[2] * u + V[2] * v]; }
    function rect(s0, s1, w0, w1, dy, cl) {
      // s = along the light, w = across it, both 0..1 of the original quad
      if (alongU) quad(m, P(s0, w0, dy), P(s1, w0, dy), P(s1, w1, dy), P(s0, w1, dy), cl);
      else quad(m, P(w0, s0, dy), P(w1, s0, dy), P(w1, s1, dy), P(w0, s1, dy), cl);
    }
    var n = Math.max(2, Math.round(long / 1.5)), step = 1 / n;
    var lens = Math.min(0.55, (long / n) * 0.45) / long;      // as a fraction of the run
    var rim = Math.min(0.1, (long / n) * 0.1) / long;
    var halo = mixCol(col, ceil, 0.55);
    for (var i = 0; i < n; i++) {
      var mid = step * (i + 0.5);
      rect(mid - lens / 2 - rim, mid + lens / 2 + rim, -0.35, 1.35, 0, halo);
      /* The lens a few millimetres nearer the room than its surround, so
       * the two never fight for the same depth. */
      rect(mid - lens / 2, mid + lens / 2, 0, 1, -0.004, col);
    }
  }
  function fan(m, pts, col) { for (var i = 1; i + 1 < pts.length; i++) tri(m, pts[0], pts[i], pts[i + 1], col); }
  /* An axis-aligned box, all six faces. */
  function box(m, x0, y0, z0, x1, y1, z1, col, top) {
    var p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
             [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    quad(m, p[0], p[1], p[2], p[3], col); quad(m, p[4], p[5], p[6], p[7], col);
    quad(m, p[0], p[1], p[5], p[4], col); quad(m, p[3], p[2], p[6], p[7], top || col);
    quad(m, p[0], p[3], p[7], p[4], col); quad(m, p[1], p[2], p[6], p[5], col);
  }

  /* A PILOT'S CHAIR (2026-11-22). Astra: "We want the seat to be
   * visible." It wasn't: the chair was darker than the walls behind it,
   * and in a docked cabin lit only by its instruments it was a hole. So
   * the shell is a lighter grey than any wall, the cushions are the
   * palette's own warm or bright colour (tan in a civil ship, navy blue,
   * the Syndicate's red), and the backrest and headrest are piped with a
   * dim strip of the palette's accent light, which the room's shading
   * leaves alone (`!`) - so its outline reads in the dark. Yours and the
   * co-pilot's twin are the same chair. */
  function pilotChair(m, pal, fy, x) {
    var pipe = pal.seatPipe || pal.trim;
    box(m, x - 0.26, fy, -0.30, x + 0.26, fy + 0.46, 0.14, pal.seat, pal.seatPad);           // the seat
    box(m, x - 0.26, fy + 0.46, -0.40, x + 0.26, fy + 1.26, -0.30, pal.seat);                  // the back
    quad(m, [x - 0.22, fy + 0.55, -0.296], [x + 0.22, fy + 0.55, -0.296], [x + 0.22, fy + 1.20, -0.296], [x - 0.22, fy + 1.20, -0.296], pal.seatPad);
    box(m, x - 0.15, fy + 1.30, -0.38, x + 0.15, fy + 1.52, -0.30, pal.seat, pal.seatPad);    // headrest
    quad(m, [x - 0.13, fy + 1.33, -0.296], [x + 0.13, fy + 1.33, -0.296], [x + 0.13, fy + 1.49, -0.296], [x - 0.13, fy + 1.49, -0.296], pal.seatPad);
    box(m, x - 0.05, fy, -0.10, x + 0.05, fy + 0.30, 0.05, pal.rib);                            // the pedestal
    /* The piping: up both edges of the back, across its top, and over the
     * headrest - on the face toward the dash and on the back, so the chair
     * reads from the seat beside it and from the deck behind it. */
    [-0.296, -0.404].forEach(function (z) {
      [-1, 1].forEach(function (s) {
        var x0 = x + s * 0.235, x1 = x + s * 0.250;
        quad(m, [x0, fy + 0.50, z], [x1, fy + 0.50, z], [x1, fy + 1.24, z], [x0, fy + 1.24, z], pipe);
      });
      quad(m, [x - 0.25, fy + 1.235, z], [x + 0.25, fy + 1.235, z], [x + 0.25, fy + 1.25, z], [x - 0.25, fy + 1.25, z], pipe);
      quad(m, [x - 0.14, fy + 1.505, z + (z < -0.35 ? 0.02 : 0)], [x + 0.14, fy + 1.505, z + (z < -0.35 ? 0.02 : 0)],
              [x + 0.14, fy + 1.515, z + (z < -0.35 ? 0.02 : 0)], [x - 0.14, fy + 1.515, z + (z < -0.35 ? 0.02 : 0)], pipe);
    });
    /* And down the front edge of the cushion, where a hand finds it. */
    quad(m, [x - 0.25, fy + 0.40, 0.144], [x + 0.25, fy + 0.40, 0.144], [x + 0.25, fy + 0.415, 0.144], [x - 0.25, fy + 0.415, 0.144], pipe);
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
        lightRun(room, [x0, y, g.bulkZ + 0.25], [x1, y, g.bulkZ + 0.25], [x1, y, stripEnd],
             [x0, y, stripEnd], pal.light, pal.ceil);
      });
    }
    /* This ship's frame bars across its panes (cockpitGeometry `bars`), in
     * her livery when the caller says what it is (render.js barColour,
     * 2026-11-01), the room's jamb otherwise. */
    (g.bars || []).forEach(function (b) { quad(room, b[0], b[1], b[2], b[3], p.barColour || pal.jamb || pal.wall); });

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
    /* Everything from the bridge door aft goes into a mesh of its own that
     * is moved down to its deck at the end: on a decked hull the main deck
     * (below), on a raised cockpit (RAISED) the deck the stair comes down
     * to. Built at the cockpit's floor height like every leaf is. */
    var shipRoom = room, shipPortals = portals, dyMain = 0, rs = p.raised;
    /* A wall of constant z from x0 to x1, a doorway through it at each xc. */
    function zWall(m2, x0, x1, z, y0, y1, xcs, col) {
      var at = x0, dh = y0 + DOOR_H;
      xcs.slice().sort(function (a, b) { return a - b; }).forEach(function (xc) {
        var a = xc - DOOR_HW, b = xc + DOOR_HW;
        if (a > at) quad(m2, [at, y0, z], [a, y0, z], [a, y1, z], [at, y1, z], col);
        if (y1 > dh) quad(m2, [a, dh, z], [b, dh, z], [b, y1, z], [a, y1, z], col);
        at = b;
      });
      if (x1 > at) quad(m2, [at, y0, z], [x1, y0, z], [x1, y1, z], [at, y1, z], col);
    }
    if (p.block && dH && deck) {
      /* THE REACTOR BLOCK'S BRIDGE (BLOCK_HULLS): the helm's bulkhead as
       * ever; a raised cockpit's stair just aft of it, down to the deck; the
       * bridge deck on the deck, its aft wall solid (A) or with the door
       * through it (B), its starboard wall with the door through it (A). */
      bulkhead(room, pal, fy, dH.wall[1], g.sideX, cy, dH.wall[0], g.sideX, cy, true, [pal.bulk, pal.wall]);
      if (rs) {
        stairMesh(room, pal, g, fy, cy, rs);
        if (rs.rise > 0) {
          var ySoff = fy - rs.rise + (cy - fy);
          quad(room, [-g.sideX, ySoff, rs.doorZ], [g.sideX, ySoff, rs.doorZ], [g.sideX, cy, rs.doorZ], [-g.sideX, cy, rs.doorZ], pal.wall);
        }
        dyMain = -rs.rise;
        room = mesh(); portals = mesh();
      }
      var bz1 = rs ? rs.doorZ : deck.z1;
      quad(room, [deck.x0, fy, deck.z0], [deck.x1, fy, deck.z0], [deck.x1, fy, bz1], [deck.x0, fy, bz1], pal.floor);
      quad(room, [deck.x0, cy, deck.z0], [deck.x1, cy, deck.z0], [deck.x1, cy, bz1], [deck.x0, cy, bz1], pal.ceil);
      quad(room, [deck.x0, fy, deck.z0], [deck.x0, fy, bz1], [deck.x0, cy, bz1], [deck.x0, cy, deck.z0], pal.wall);
      if (dB.axis === 'x') wallDoors(room, deck.x1, deck.z0, bz1, fy, cy, [dB.zc], pal.wall);
      else quad(room, [deck.x1, fy, deck.z0], [deck.x1, fy, bz1], [deck.x1, cy, bz1], [deck.x1, cy, deck.z0], pal.wall);
      zWall(room, deck.x0, deck.x1, deck.z0, fy, cy, dB.axis === 'z' ? [dB.xc] : [], pal.bulk);
      [-1, 1].forEach(function (s) {
        var x0 = s * 0.50 * k, x1 = s * 0.56 * k, y = cy - 0.006;
        lightRun(room, [x0, y, deck.z0 + 0.25], [x1, y, deck.z0 + 0.25], [x1, y, bz1 - 0.25], [x0, y, bz1 - 0.25], pal.light, pal.ceil);
      });
      p.stations.forEach(function (st) { if (!st.cockpit) station(room, pal, fy, g.sideX, st); });
    } else if (dH && deck) {
      /* The helm's bulkhead stays where the seat has always had it, rear
       * screens and all, with the doorway open as an arch; the bridge deck
       * is through it, and the sliding door at the deck's aft end. */
      bulkhead(room, pal, fy, dH.wall[1], g.sideX, cy, dH.wall[0], g.sideX, cy, true, [pal.bulk, pal.wall]);
      /* Raised (RAISED): the deck at the helm's height forward of its
       * stair, which runs down aft of it to the bridge door. */
      var dzs = rs ? rs.stepZ : deck.z0;
      boxRoom(room, deck.x0, fy, dzs, deck.x1, cy, deck.z1, pal.wall, pal.floor, pal.ceil, ['z0', 'z1']);
      [-1, 1].forEach(function (s) {
        var x0 = s * 0.50 * k, x1 = s * 0.56 * k, y = cy - 0.006;
        lightRun(room, [x0, y, dzs + 0.25], [x1, y, dzs + 0.25], [x1, y, deck.z1 - 0.25], [x0, y, deck.z1 - 0.25], pal.light, pal.ceil);
      });
      /* A hazard line down the middle of the deck: the way aft. */
      quad(room, [-0.03, fy + 0.004, dzs], [0.03, fy + 0.004, dzs], [0.03, fy + 0.004, deck.z1], [-0.03, fy + 0.004, deck.z1], pal.hazard);
      p.stations.forEach(function (st) { if (!st.cockpit) station(room, pal, fy, g.sideX, st); });
      if (p.tower) towerGlass(room, portals, pal, fy, cy, deck, dB, true);
      if (rs) {
        var cyS = stairMesh(room, pal, g, fy, cy, rs);
        dyMain = -rs.rise;
        room = mesh(); portals = mesh();
        bulkhead(room, pal, fy, dB.wall[1], g.sideX, cyS + rs.rise, dB.wall[0], PASSAGE_HW, fy + PASSAGE_H, true, [pal.wall, pal.passWall]);
      } else {
        bulkhead(room, pal, fy, dB.wall[1], g.sideX, cy, dB.wall[0], p.decks ? LOBBY_HW : PASSAGE_HW, fy + PASSAGE_H, true, [pal.wall, pal.passWall]);
      }
    } else if (rs) {
      /* The stair, in the cockpit's own mesh at its true heights; then the
       * bulkhead at its foot, in the deck's, its cockpit face up to the
       * cockpit's ceiling once it is moved down. */
      var cyS2 = stairMesh(room, pal, g, fy, cy, rs);
      dyMain = -rs.rise;
      room = mesh(); portals = mesh();
      bulkhead(room, pal, fy, dB.wall[1], g.sideX, cyS2 + rs.rise, dB.wall[0], PASSAGE_HW, fy + PASSAGE_H, true);
    } else {
      bulkhead(room, pal, fy, dB.wall[1], g.sideX, cy, dB.wall[0], p.decks ? LOBBY_HW : PASSAGE_HW, fy + PASSAGE_H, true);
    }

    /* A DECKED HULL (2026-10-25): the lobby aft of the bridge door and the
     * lift's landing at the bridge; then everything from the passage aft
     * is built as it always was, but into a mesh of its own that is moved
     * down to the main deck at the end. Door leaves are moved there by
     * their door's `yOff` (render.js), so they are built here at the
     * bridge's height like every other leaf. */
    if (p.decks && p.carZ) {
      var lob = roomByKind(p, 'lobby'), dLB = doorById(p, 'lift-bridge');
      boxRoom(room, lob.x0, fy, lob.z0, lob.x1, fy + PASSAGE_H, lob.z1, pal.passWall, pal.passFloor, pal.ceil, ['z0', 'z1']);
      lightRun(room, [-0.06, fy + PASSAGE_H - 0.01, lob.z0 + 0.3], [0.06, fy + PASSAGE_H - 0.01, lob.z0 + 0.3],
           [0.06, fy + PASSAGE_H - 0.01, lob.z1 - 0.3], [-0.06, fy + PASSAGE_H - 0.01, lob.z1 - 0.3], pal.light, pal.ceil);
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
    /* Her own deck's side doors (the naval decks' are navalMesh's). */
    var sideDoors = p.doors.filter(function (d) { return d.axis === 'x' && !d.naval; });
    var portZ = sideDoors.filter(function (d) { return d.wall[1] <= 0; }).map(function (d) { return d.zc; });
    var stbdZ = sideDoors.filter(function (d) { return d.wall[0] >= 0; }).map(function (d) { return d.zc; });
    var skipP = dC ? ['z0', 'z1'] : ['z1'];
    if (portZ.length) skipP.push('x0');
    if (stbdZ.length) skipP.push('x1');
    boxRoom(room, ps.x0, fy, ps.z0, ps.x1, fy + PASSAGE_H, ps.z1, pal.passWall, pal.passFloor, pal.ceil, skipP);
    if (p.block) zWall(room, ps.x0, ps.x1, ps.z1, fy, fy + PASSAGE_H, [0], pal.passWall);
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
    lightRun(room, [-0.06, fy + PASSAGE_H - 0.01, ps.z0 + 0.3], [0.06, fy + PASSAGE_H - 0.01, ps.z0 + 0.3],
         [0.06, fy + PASSAGE_H - 0.01, ps.z1 - 0.3], [-0.06, fy + PASSAGE_H - 0.01, ps.z1 - 0.3], pal.light, pal.ceil);
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
    if (p.block) p.items.forEach(function (it) {
      if (it.kind !== 'medcab') return;
      var c2 = it.counter;
      box(room, c2[0], fy, c2[1], c2[2], fy + 1.9, c2[3], MEDCOL.cab);
      quad(room, [c2[0] + 0.05, fy + 1.55, c2[1] - 0.004], [c2[2] - 0.05, fy + 1.55, c2[1] - 0.004],
           [c2[2] - 0.05, fy + 1.62, c2[1] - 0.004], [c2[0] + 0.05, fy + 1.62, c2[1] - 0.004], MEDCOL.lit);
    });
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
    if (cop && cop.abreast) {
      /* Two abreast: the twin of your own chair, headrest and all. */
      pilotChair(fittings, pal, fy, cop.x);
    } else if (cop) {
      var dz = cop.dz || 0, cx = cop.x;
      box(fittings, cx - 0.24, fy, -0.30 + dz, cx + 0.24, fy + 0.46, 0.14 + dz, pal.seat, pal.seatPad);
      box(fittings, cx - 0.24, fy + 0.46, -0.40 + dz, cx + 0.24, fy + 1.20, -0.30 + dz, pal.seat);
      box(fittings, cx - 0.14, fy + 1.24, -0.38 + dz, cx + 0.14, fy + 1.44, -0.30 + dz, pal.seat, pal.seatPad);
      box(fittings, cx - 0.05, fy, -0.10 + dz, cx + 0.05, fy + 0.30, 0.05 + dz, pal.rib);
    }
    p.stations.forEach(function (st) { if (st.cockpit) station(fittings, pal, fy, g.sideX, st); });
    if (p.medkit) {
      var mk = p.medkit, mz = mk.z + 0.004, mfy = fy + (mk.dy || 0);
      /* Below the rear screens' panels, which come down to about knee
       * height on the bulkhead. */
      box(fittings, mk.x0, mfy + 0.06, mz, mk.x1, mfy + 0.50, mz + 0.2, MEDCOL.cab);
      /* Its green band and the clasp, so it reads as the kit and not a box. */
      quad(fittings, [mk.x0 + 0.03, mfy + 0.40, mz + 0.204], [mk.x1 - 0.03, mfy + 0.40, mz + 0.204],
           [mk.x1 - 0.03, mfy + 0.45, mz + 0.204], [mk.x0 + 0.03, mfy + 0.45, mz + 0.204], MEDCOL.lit);
      quad(fittings, [(mk.x0 + mk.x1) / 2 - 0.04, mfy + 0.20, mz + 0.204], [(mk.x0 + mk.x1) / 2 + 0.04, mfy + 0.20, mz + 0.204],
           [(mk.x0 + mk.x1) / 2 + 0.04, mfy + 0.30, mz + 0.204], [(mk.x0 + mk.x1) / 2 - 0.04, mfy + 0.30, mz + 0.204], pal.rib);
    }

    /* THE SEAT, drawn only while you are out of it — where the plan put
     * it (one side of two abreast, or the centre). */
    var helm = p.items.filter(function (it) { return it.kind === 'seat'; })[0];
    pilotChair(seat, pal, fy, helm ? helm.x : 0);

    /* The main deck goes down to where it is, and the decks below it are
     * built in place. */
    var car = null, tramCar = null;
    if (p.decks && p.carZ) {
      merge(shipRoom, room, dyMain);
      merge(shipPortals, portals, dyMain);
      [lampOk, lampNo].forEach(function (lm) { lm.v = lm.v.map(function (v) { return [v[0], v[1] + dyMain, v[2]]; }); });
      room = shipRoom; portals = shipPortals;
      if (p.deckY.junction !== undefined) junctionMesh(room, pal, p);
      if (p.deckY.hangar !== undefined) hangarMesh(room, pal, p);
      if (p.naval) navalMesh(room, pal, p);
      car = carMesh(pal, p);
      tramCar = tramMesh(pal);
    } else if (rs) {
      merge(shipRoom, room, dyMain);
      merge(shipPortals, portals, dyMain);
      [lampOk, lampNo].forEach(function (lm) { lm.v = lm.v.map(function (v) { return [v[0], v[1] + dyMain, v[2]]; }); });
      room = shipRoom; portals = shipPortals;
    }
    /* An engineering flat with no lift (the L hulls), built in place. */
    if (p.naval && !p.carZ) navalMesh(room, pal, p);

    return {
      room: room, portals: portals, seat: seat, lampOk: lampOk, lampNo: lampNo,
      car: car, tram: tramCar, lampDy: dyMain,
      fittings: fittings.f.length ? fittings : null,
      leaves: (function () {
        var lv = dB.naval ? {} : { bridge: leaves(dB.wall[0], dB.wall[1]) };
        if (dC) lv.cargo = leaves(dC.wall[0], dC.wall[1]);
        sideDoors.forEach(function (d) { lv[d.id] = sideLeaves(d); });
        if (p.naval) { var nl = navalLeaves(pal, p, fy); for (var nk in nl) lv[nk] = nl[nk]; }
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
  /* A RAISED COCKPIT'S STAIR (RAISED, 2026-11-02): between the bridge door
   * at `doorZ` and the cockpit's old bulkhead line at `stepZ`, the width of
   * the cockpit, two treads up from the deck to the cockpit's floor `fy`.
   * Its side walls run from the deck to the cockpit's ceiling and it is
   * roofed at the cockpit's ceiling, so from the seat looking aft the room
   * simply goes on back and down to the door. */
  function stairMesh(m, pal, g, fy, cy, rs) {
    var x0 = -g.sideX, x1 = g.sideX, d0 = rs.doorZ, sz = rs.stepZ, y0 = fy - rs.rise;
    var n = rs.treads || 0;
    if (n > 0) {
      /* The landing at the door, then `n` treads of equal rise up to the
       * cockpit's floor at `stepZ`: each riser faces aft, each nosing a
       * hazard edge. */
      var tz = rs.run / (n + 1), dh = rs.rise / n;
      quad(m, [x0, y0, d0], [x1, y0, d0], [x1, y0, d0 + tz], [x0, y0, d0 + tz], pal.floor);
      for (var t = 1; t <= n; t++) {
        var za = d0 + tz * t, zb = t === n ? sz : za + tz, ya = y0 + dh * (t - 1), yb = y0 + dh * t;
        quad(m, [x0, ya, za], [x1, ya, za], [x1, yb, za], [x0, yb, za], pal.wall);
        quad(m, [x0, yb, za], [x1, yb, za], [x1, yb, zb], [x0, yb, zb], pal.floor);
        quad(m, [x0, yb + 0.003, za], [x1, yb + 0.003, za], [x1, yb + 0.003, za + 0.05], [x0, yb + 0.003, za + 0.05], pal.hazard);
      }
    } else {
      /* No rise: the cockpit only moved, and the room runs back flat. */
      quad(m, [x0, fy, d0], [x1, fy, d0], [x1, fy, sz], [x0, fy, sz], pal.floor);
    }
    /* Roofed at the cockpit's ceiling, or, where the cockpit is DOWN a
     * stair (a negative rise), at the passage's, so the bridge door at
     * the stair's head still fits under it; a soffit closes the step down
     * to the cockpit's lower ceiling. */
    var cs = Math.max(cy, y0 + PASSAGE_H);
    [x0, x1].forEach(function (x) { quad(m, [x, Math.min(y0, fy), d0], [x, Math.min(y0, fy), sz], [x, cs, sz], [x, cs, d0], pal.wall); });
    quad(m, [x0, cs, d0], [x1, cs, d0], [x1, cs, sz], [x0, cs, sz], pal.ceil);
    if (cs > cy + 0.001) quad(m, [x0, cy, sz], [x1, cy, sz], [x1, cs, sz], [x0, cs, sz], pal.wall);
    return cs;
  }
  /* How far above the deck's floor the floor is at (x, z) in plan `p`: a
   * raised cockpit's `rise` up in it, eased up its stair, 0 everywhere
   * else. The walker stands on it (main.js stepWalk) and her people do
   * (npc.js). Eased over the whole stair rather than stepped tread by
   * tread, so the eye climbs it instead of jumping. */
  function floorAt(p, x, z) {
    var rs = p && (p.raised || (p.ship && p.ship.raised));
    if (!rs || (p.deck && p.deck !== 'main')) return 0;
    var r = roomByKind(p, 'cockpit'), bd = roomByKind(p, 'bridgedeck');
    var inR = function (q) { return q && x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1; };
    /* The helm's doorway, between the bridge deck's forward wall and the
     * cockpit's aft one, is at the cockpit's floor when the stair is aft of
     * it in the bridge deck (the reactor block's). */
    var inGap = rs.block && r && bd && x >= Math.max(r.x0, bd.x0) && x <= Math.min(r.x1, bd.x1) && z > bd.z1 && z < r.z0;
    if (inGap) return rs.rise;
    if (z < rs.doorZ || !(inR(r) || inR(bd))) return 0;
    if (z >= rs.stepZ) return rs.rise;
    if (rs.stepZ - rs.doorZ < 0.2) return rs.rise;
    var u = (z - rs.doorZ - 0.1) / (rs.stepZ - rs.doorZ - 0.1);
    return rs.rise * Math.max(0, Math.min(1, u));
  }

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
    lightRun(m, [ax - 0.05, top - 0.006, q.z0 + 0.4], [ax + 0.05, top - 0.006, q.z0 + 0.4],
         [ax + 0.05, top - 0.006, q.z1 - 0.4], [ax - 0.05, top - 0.006, q.z1 - 0.4], pal.light, pal.ceil);
    p.bunkAt.forEach(function (b) {
      var levels = b.two ? [0.28, 1.22] : [0.28];
      levels.forEach(function (y) {
        box(m, b.x0, fy + y, b.z0, b.x1, fy + y + 0.12, b.z1, pal.rib);
        box(m, b.x0 + 0.04, fy + y + 0.12, b.z0 + 0.04, b.x1 - 0.04, fy + y + 0.24, b.z1 - 0.04, pal.blanket || pal.seatPad);
        /* A reading lamp on the wall at the head of each bunk. */
        var xw = b.inboard ? b.x1 - 0.004 : b.x0 + 0.004;
        lightRun(m, [xw, fy + y + 0.55, b.z1 - 0.32], [xw, fy + y + 0.55, b.z1 - 0.18],
             [xw, fy + y + 0.62, b.z1 - 0.18], [xw, fy + y + 0.62, b.z1 - 0.32], pal.light, pal.ceil);
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
    lightRun(m, [lx - 0.04, top - 0.006, r.z0 + 0.3], [lx + 0.04, top - 0.006, r.z0 + 0.3],
         [lx + 0.04, top - 0.006, r.z1 - 0.3], [lx - 0.04, top - 0.006, r.z1 - 0.3], pal.light, pal.ceil);
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
    lightRun(m, [xc - 0.08, top - 0.01, r.z0 + 0.3], [xc + 0.08, top - 0.01, r.z0 + 0.3],
         [xc + 0.08, top - 0.01, r.z1 - 0.3], [xc - 0.08, top - 0.01, r.z1 - 0.3], pal.light, pal.ceil);
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
    lightRun(m, [cx - 0.3, top - 0.006, r.z0 + 0.3], [cx + 0.3, top - 0.006, r.z0 + 0.3],
         [cx + 0.3, top - 0.006, r.z1 - 0.3], [cx - 0.3, top - 0.006, r.z1 - 0.3], pal.light, pal.ceil);
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
      lightRun(m, [(b.x0 + b.x1) / 2 - 0.12, top - 0.504, b.z1 - 0.87], [(b.x0 + b.x1) / 2 + 0.12, top - 0.504, b.z1 - 0.87],
           [(b.x0 + b.x1) / 2 + 0.12, top - 0.504, b.z1 - 0.63], [(b.x0 + b.x1) / 2 - 0.12, top - 0.504, b.z1 - 0.63], pal.light, pal.ceil);
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
    lightRun(m, [lx - 0.05, top - 0.006, r.z0 + 0.3], [lx + 0.05, top - 0.006, r.z0 + 0.3],
         [lx + 0.05, top - 0.006, r.z1 - 0.3], [lx - 0.05, top - 0.006, r.z1 - 0.3], pal.light, pal.ceil);
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
      lightRun(m, [s * 0.6 - 0.05, top - 0.006, r.z0 + 0.4], [s * 0.6 + 0.05, top - 0.006, r.z0 + 0.4],
           [s * 0.6 + 0.05, top - 0.006, r.z1 - 0.4], [s * 0.6 - 0.05, top - 0.006, r.z1 - 0.4], pal.light, pal.ceil);
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
      lightRun(m, [-0.06, top - 0.01, pl.z0 + 0.3], [0.06, top - 0.01, pl.z0 + 0.3], [0.06, top - 0.01, pl.z1 - 0.3], [-0.06, top - 0.01, pl.z1 - 0.3], pal.light, pal.ceil);
    });
    /* The tramway: a tube a little below the platforms, two rails, lights
     * every four metres down both walls. */
    var wy = fy - 0.35;
    boxRoom(m, way.x0, wy, way.z0, way.x1, top, way.z1, pal.lockWall, pal.hazardDark, pal.ceil, ['z0', 'z1']);
    [-0.6, 0.6].forEach(function (x) { box(m, x - 0.04, wy, way.z0, x + 0.04, wy + 0.12, way.z1, pal.rib); });
    for (var z = way.z1 - 2; z > way.z0 + 1; z -= 4) {
      [-1, 1].forEach(function (s) {
        var x = s * (TRAM_HW - 0.004);
        lightRun(m, [x, top - 0.5, z - 0.4], [x, top - 0.5, z + 0.4], [x, top - 0.35, z + 0.4], [x, top - 0.35, z - 0.4], pal.light, pal.ceil);
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
    lightRun(m, [-0.05, etop - 0.006, er.z0 + 0.4], [0.05, etop - 0.006, er.z0 + 0.4], [0.05, etop - 0.006, er.z1 - 0.4], [-0.05, etop - 0.006, er.z1 - 0.4], pal.light, pal.ceil);
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
        lightRun(m, [x - 0.6, top - 0.01, z - 0.15], [x + 0.6, top - 0.01, z - 0.15], [x + 0.6, top - 0.01, z + 0.15], [x - 0.6, top - 0.01, z + 0.15], pal.light, pal.ceil);
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
    lightRun(m, [-0.4, h - 0.01, z0 + 0.4], [0.4, h - 0.01, z0 + 0.4], [0.4, h - 0.01, z1 - 0.4], [-0.4, h - 0.01, z1 - 0.4], pal.light, pal.ceil);
    /* The button panel, and a lit square per button (the buttons are the
     * `liftbtn` items; this is where they are). */
    var xp = CAR_HW - 0.004, n = (p.deckOrder || []).length - 1, bs = btnStep(n);
    quad(m, [xp, 1.0, z0 + 0.2], [xp, 1.0, z0 + 0.5 + (n - 1) * bs], [xp, 1.5, z0 + 0.5 + (n - 1) * bs], [xp, 1.5, z0 + 0.2], pal.console);
    for (var i = 0; i < n; i++) {
      var zb = z0 + 0.35 + i * bs;
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
    lightRun(m, [-0.3, 2.095, -hl + 0.3], [0.3, 2.095, -hl + 0.3], [0.3, 2.095, hl - 0.3], [-0.3, 2.095, hl - 0.3], pal.light, pal.ceil);
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

  /* THE REACTOR'S POWER (2026-11-23), 0..1, for the glow. Ticking over on
   * her hotel load at a berth; at sea, more with the drive's throttle; and
   * eased, rods moving at the speed rods move. A SCRAM drops her at once
   * to the afterglow of her decay heat, about 7 % and fading over minutes
   * to a faint 1.5 %, until she is restarted, when she comes back up slower
   * than she runs. Kept on the ship (`reactor`, `_rx`), worked out from
   * the game's clock `t` (s). */
  var RX_DOCKED = 0.2, RX_IDLE = 0.3, RX_AFTER = 0.06, RX_AFTER_TAU = 300, RX_FLOOR = 0.015;
  function reactorPower(ship, t) {
    if (!ship) return 0;
    var st = ship._rx || (ship._rx = { p: null, t: t, slow: false });
    var rs = ship.reactor;
    if (rs && rs.scramAt !== undefined && rs.scramAt !== null) {
      var age = Math.max(0, t - rs.scramAt);
      st.p = RX_FLOOR + RX_AFTER * Math.exp(-age / RX_AFTER_TAU);
      st.t = t; st.slow = true;
      return st.p;
    }
    var target = ship.docked ? RX_DOCKED : Math.min(1, RX_IDLE + (1 - RX_IDLE) * Math.max(0, ship.throttle || 0));
    if (st.p === null) { st.p = target; st.t = t; return st.p; }
    var dt = Math.max(0, Math.min(3600, t - st.t));
    st.t = t;
    var tau = target > st.p ? (st.slow ? 20 : 4) : 1.5;
    st.p += (target - st.p) * (1 - Math.exp(-dt / tau));
    if (st.slow && Math.abs(target - st.p) < 0.01) st.slow = false;
    return st.p;
  }
  function scramReactor(ship, t) { if (ship) ship.reactor = { scramAt: t }; }
  function restartReactor(ship, t) {
    if (!ship) return;
    ship.reactor = null;
    if (ship._rx) { ship._rx.t = t; ship._rx.slow = true; }
  }

  var ShipDeck = {
    DOOR_HW: DOOR_HW, DOOR_H: DOOR_H, WALL_T: WALL_T, PASSAGE_LEN: PASSAGE_LEN,
    LOCK_HW: LOCK_HW, DOOR_REACH: DOOR_REACH, DOOR_TIME: DOOR_TIME, SEAT: SEAT,
    reactorGlowMesh: reactorGlowMesh, reactorPower: reactorPower, scramReactor: scramReactor, restartReactor: restartReactor,
    reactorTank: reactorTank,
    reactorRods: reactorRods,
    PALETTES: PALETTES, FLAT_HULLS: FLAT_HULLS, BLOCK_HULLS: BLOCK_HULLS, blockVariant: blockVariant, SYNDICATE: SYNDICATE, NAVY: NAVY,
    CRATE_STACK: CRATE_STACK, CRATE_SCALE: CRATE_SCALE,
    paletteFor: paletteFor, plan: plan, planFitted: planFitted, updateDoors: updateDoors, leafTravel: leafTravel,
    meshes: meshes, frame: frame,
    stationScreen: stationScreen, STATION_SCREEN_PX: STATION_SCREEN_PX,
    DECKED: DECKED, TOWER: TOWER, LIFT_SPEED: LIFT_SPEED, liftSpeed: liftSpeed, TRAM_SPEED: TRAM_SPEED, DECK_NAME: DECK_NAME,
    CAR_H: CAR_H, HANGAR: HANGAR,
    stationRoles: stationRoles, ROLE_NAME: ROLE_NAME, STATION_MAX: STATION_MAX,
    doorById: doorById, roomByKind: roomByKind,
    RAISED: RAISED, raisedCockpit: raisedCockpit, floorAt: floorAt,
    rampShape: rampShape, rampMesh: rampMesh, rampFloor: rampFloor, rampPoint: rampPoint,
    LOCK_W: LOCK_W, LOCK_LAND: LOCK_LAND, RAMP_MAX: RAMP_MAX, RAMP_SLOPE: RAMP_SLOPE, RAMP_CUT_SLOPE: RAMP_CUT_SLOPE
  };

  global.ShipDeck = ShipDeck;
  if (typeof module !== 'undefined' && module.exports) module.exports = ShipDeck;
})(typeof window !== 'undefined' ? window : globalThis);
