/* navaldeck.js — the decks of the large ships (2026-11-23).
 *
 * Astra: "for the capital and carrier, use the precedent of US naval ships
 * of the post WW2 era for the multi-deck layout. I want there to be
 * multiple ways to connect up those decks and rooms", and "all large size
 * ships need multiple decks and different rooms, larger reactor rooms".
 * The design is claude/naval-decks.md; this is its stage 1: the LAYOUT as
 * data — decks, rooms, the watertight bulkheads, compartment labels, every
 * way between rooms (the connection graph), the reactor rooms — and the
 * questions asked of it (can you get there, by what route, at general
 * quarters). shipdeck.js builds walls round it in stage 3; nothing in the
 * game reads it yet, so nothing in the game has moved.
 *
 * Units and frame are shipdeck's: metres, x starboard, y up, z forward,
 * the seated eye at 0. A room is an axis-aligned box {x0,x1,y0,y1,z0,z1}
 * with its deck's floor at y0.
 *
 * THE RULES IT KEEPS (US Navy, post-war):
 *   - Decks: the main deck is 1; below it 2, 3, 4; above it the 01, 02 ...
 *     levels. On a carrier the hangar deck is 1, the gallery 03 and the
 *     flight deck 04.
 *   - Compartment numbers, deck-frame-position-use: `2-120-1-L`. Frames
 *     are 1.22 m (4 ft) from the bow; the number is the room's forward-most
 *     frame. Position 0 on the centreline, odd to starboard, even to port,
 *     rising outboard.
 *   - The 2nd deck is the damage-control deck. BELOW IT, A MAIN WATERTIGHT
 *     BULKHEAD HAS NO DOOR: from one compartment to the next you go up,
 *     along and down again.
 *   - Fittings are classed X-ray, Yoke or Zebra. In the game X and Y you
 *     open and close as you pass; at general quarters every Z is dogged
 *     and stays shut. Scuttles (Y) in Z hatches, escape trunks (none), the
 *     lift and the tram stay open.
 *   - Ladders come in pairs: up and forward to starboard, down and aft to
 *     port. Both stand foot aft, head forward.
 * A merchant hull keeps none of the Navy's numbering: lettered decks, stair
 * towers, and watertight doors that close on damage only (class D). */
(function (global) {
  'use strict';

  /* ---- its own seeded stream, as shipdeck's and walk.js's are ---------- */
  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function stream(key) {
    var a = hash(key) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var FRAME = 1.22;            // 4 ft, a US frame
  var WALL = 0.16;             // shipdeck's WALL_T
  var PASS_W = 1.3;            // a passageway, as shipdeck's passage
  var SLAB = 0.3;              // a deck's own thickness, floor to the ceiling below
  var LANDING = 2.4;           // a lift landing, square
  /* THE TRAM AT GENERAL QUARTERS (Astra, 2026-11-23): "the tram can run on
   * a battery system during GQ - half speed - it goes out if the ship's
   * hull reaches below 40%". Under Zebra her main power is not the tram's
   * to use; on battery she runs at half speed, and with the hull under
   * 40 % the battery's feed is gone and she stands where she is. */
  var TRAM_BATTERY = { speed: 0.5, outBelow: 0.4 };
  /* GENERAL QUARTERS ON DAMAGE (Astra, 2026-11-23): "if the ship's hull is
   * below 75% the ship automatically goes to GQ". Below it she is at GQ
   * whatever was ordered; above it, GQ is the captain's to call or stand
   * down. So the tram's 40 % only ever bites at GQ, because a hull under
   * 40 % is a ship already at GQ. */
  var GQ_BELOW = 0.75;
  function condAt(cond, hull) {
    return hull !== undefined && hull !== null && hull < GQ_BELOW ? 'zebra' : (cond || 'normal');
  }

  /* ---- THE HULLS ----------------------------------------------------------
   * Measured with tools/hull-envelope.js (2026-11-23), in the plan frame.
   *   cx   her centreline's x (the towers stand off it: the Capital's
   *        gallery 44 m to starboard of her keel, the Carrier's island 29 m,
   *        which is where a carrier's island is);
   *   hw   the half-width of the band the decks are laid in — not her
   *        beam: she is 70–90 m across, and a hall that wide is a walk
   *        through nothing;
   *   z0, z1  the stack's aft and forward ends; B the main bulkhead spacing;
   *   zBow her stem, for the frame numbers.
   * Deck floors are y; h is the clear height. Each deck's ceiling is below
   * the next one up by at least SLAB (the tests hold it to that).
   *
   * role:  'stub'  a room shipdeck already builds (the bridge, or a smaller
   *                hull's own main deck), standing in for it here;
   *        'super' a level in the tower or island, rooms round the lift;
   *        'twin'  twin side passageways, rooms between and outboard, a
   *                cross-passage at each bulkhead (navy 1, 2, 03);
   *        'line'  one passageway down the middle (merchant decks);
   *        'hangar' the Carrier's bays, between twin-passage zones;
   *        'below' one compartment a zone, no doors through main bulkheads;
   *        'flat'  a smaller hull's engineering flat under her own deck. */
  var NAVAL = {
    capital: {
      style: 'navy', military: true, cx: -44.3, hw: 9, z0: -150, z1: 18, B: 24, zBow: 57.7, dc: '2',
      decks: [
        { id: 'bridge', num: '05', name: 'Navigation bridge', role: 'stub', y: -1.2, h: 2.4 },
        { id: '03', num: '03', name: 'Combat information center', role: 'super', y: -6.0, h: 2.6, rooms: ['cic'] },
        { id: '1', num: '1', name: 'Main deck', role: 'twin', y: -42.5, h: 2.6,
          centre: ['launcher', 'wardroom', 'office', 'galley', 'office', 'wardroom', 'launcher'],
          side: ['berthing', 'stores', 'berthing', 'office', 'berthing', 'stores', 'berthing'] },
        { id: '2', num: '2', name: 'Second deck', role: 'twin', y: -45.6, h: 2.6,
          centre: ['mess', 'berthing', 'sickbay', 'dccentral', 'mess', 'berthing', 'repair'],
          side: ['berthing', 'repair', 'berthing', 'stores', 'berthing', 'repair', 'stores'] },
        { id: '3', num: '3', name: 'Third deck', role: 'below', y: -48.7, h: 2.6,
          zones: ['magazine', 'stores', 'stores', 'aux', 'stores', 'stores', 'magazine'] },
        { id: '4', num: '4', name: 'Fourth deck · engineering', role: 'below', y: -52.8, h: 3.8,
          zones: ['aux', 'aux', 'reactor', 'reactor', 'engine', 'engine', 'aux'], tram: true }
      ],
      lift: { x: 0, z: -8, stops: ['bridge', '03', '1', '2', '4'] },
      airlock: { deck: '1', zone: 3 },
      reactors: { axis: 'h', n: 2 }
    },
    carrier: {
      style: 'navy', military: true, cx: -29.4, hw: 14, z0: -165, z1: 85, B: 25, zBow: 106.3, dc: '2',
      decks: [
        { id: 'bridge', num: '09', name: 'Navigation bridge', role: 'stub', y: -1.2, h: 2.4 },
        { id: '08', num: '08', name: 'Flag bridge', role: 'super', y: -4.5, h: 2.6, rooms: ['flagplot'] },
        { id: '04', num: '04', name: 'Island base · flight deck', role: 'super', y: -31.9, h: 2.8, rooms: ['flightdeckhatch'] },
        { id: '03', num: '03', name: 'Gallery deck', role: 'twin', y: -35.2, h: 2.6,
          centre: ['catapult', 'ready', 'ready', 'cic', 'ready', 'ready', 'office', 'ready', 'catapult', 'stores'],
          side: ['berthing', 'office', 'berthing', 'office', 'stores', 'berthing', 'office', 'berthing', 'stores', 'berthing'] },
        { id: '1', num: '1', name: 'Hangar deck', role: 'hangar', y: -44.8, h: 7.6, bays: [3, 4, 5],
          centre: ['stores', 'berthing', 'repair', null, null, null, 'repair', 'stores', 'berthing', 'stores'],
          side: ['berthing', 'stores', 'berthing', null, null, null, 'berthing', 'stores', 'berthing', 'stores'] },
        { id: '2', num: '2', name: 'Second deck', role: 'twin', y: -48.0, h: 2.6,
          centre: ['mess', 'berthing', 'mess', 'sickbay', 'dccentral', 'mess', 'berthing', 'mess', 'repair', 'berthing'],
          side: ['berthing', 'repair', 'berthing', 'stores', 'berthing', 'berthing', 'repair', 'berthing', 'stores', 'berthing'] },
        { id: '4', num: '4', name: 'Fourth deck · engineering', role: 'below', y: -52.2, h: 3.6,
          zones: ['aux', 'engine', 'engine', 'reactor', 'aux', 'reactor', 'engine', 'engine', 'aux', 'magazine'], tram: true }
      ],
      lift: { x: 0, z: -6, stops: ['bridge', '08', '04', '03', '1', '2', '4'] },
      airlock: { deck: '1', zone: 4 },
      reactors: { axis: 'h', n: 2 }
    },
    meridian: {
      style: 'merchant', military: false, cx: 0, hw: 8, z0: -60, z1: -14, B: 11.5, zBow: 6.1, bandLen: 29.6,
      decks: [
        { id: 'bridge', num: 'Bridge', name: 'Bridge', role: 'stub', y: -1.2, h: 2.4 },
        /* Her superstructure ends where her hull steps down, a waist at
         * z −39 (measured, 2026-11-23), 9.2 m aft of where her band starts
         * behind her own airlock deck: A deck is aft of it, up the stairs
         * from B. */
        { id: 'A', num: 'A', name: 'A deck · promenade', role: 'line', y: -4.2, h: 2.4, zEndAft: 9.2,
          centre: ['lounge', 'dining', 'lounge', 'galley'], side: ['cabin', 'cabin', 'cabin', 'cabin'] },
        { id: 'B', num: 'B', name: 'B deck · cabins', role: 'line', y: -7.4, h: 2.6,
          centre: ['cabin', 'cabin', 'sickbay', 'cabin'], side: ['cabin', 'cabin', 'cabin', 'cabin'] },
        /* Floored where the old junction was, so the lift's landing at her
         * forward end is inside her (measured, 2026-11-23). */
        { id: 'C', num: 'C', name: 'C deck · crew and machinery', role: 'line', y: -10.6, h: 2.8, wt: true,
          centre: ['mess', 'berthing', 'reactor', 'engine'], side: ['berthing', 'stores', null, null] }
      ],
      lift: { x: 0, z: -12.5, stops: ['bridge', 'B', 'C'] },
      airlock: { deck: 'B', zone: 2 },
      reactors: { axis: 'v', n: 1 }
    },
    leviathan: {
      style: 'merchant', military: false, cx: 0, hw: 7, z0: -48, z1: 0, B: 12, zBow: 19.6, bandLen: 17.6,
      decks: [
        { id: 'bridge', num: 'Bridge', name: 'Bridge', role: 'stub', y: -1.2, h: 2.4 },
        { id: 'A', num: 'A', name: 'A deck · accommodation', role: 'line', y: -4.2, h: 2.6,
          centre: ['mess', 'galley', 'office'], side: ['stores', 'berthing', 'berthing'] },
        /* No tram (2026-11-23): her own airlock deck takes her forward 28 m,
         * and the 20 m left aft of it is a walk. */
        { id: 'B', num: 'B', name: 'B deck · machinery', role: 'below', y: -7.2, h: 2.7, wt: true,
          zones: ['engine', 'reactor', 'stores'] }
      ],
      lift: { x: 0, z: 2.0, stops: ['bridge', 'A', 'B'] },
      airlock: { deck: 'A', zone: 2 },
      reactors: { axis: 'v', n: 1 }
    }
  };
  /* The L hulls and the Crawler: a lower deck under her own. `zf` is the
   * flat's forward end and `zl` its length, as fractions of her length aft
   * of the eye; `mainY` her own deck's floor. Their main deck stays
   * shipdeck's (a stub here); the hull fit (tools/fit-hulls.js) grows a hull
   * that cannot take the flat under it. */
  var FLATS = {
    kestrel:  { hw: 3.0, zf: 0.20, zl: 0.42, len: 34, mainY: -1.25 },
    cutter:   { hw: 3.5, zf: 0.20, zl: 0.42, len: 36, mainY: -1.25, military: true },
    longhaul: { hw: 3.5, zf: 0.30, zl: 0.36, len: 38, mainY: -1.25 },
    tanker:   { hw: 3.5, zf: 0.10, zl: 0.30, len: 51, mainY: -1.25 },
    /* The Crawler's flat is under her junction deck, forward of her craft
     * bay, where she is solid. */
    crawler:  { hw: 2.6, z1: -38, z0: -52, mainY: -8.2, under: 'junction', len: 164 }
  };
  var CRAWLER_MILITARY = { crawler_navy: true, crawler_syndicate: true };

  /* What a room is for: the use letter of its compartment number. */
  var USE = {
    passage: 'L', cross: 'L', lobby: 'L', landing: 'L', berthing: 'L', mess: 'L', sickbay: 'L', wardroom: 'L',
    galley: 'L', office: 'L', ready: 'L', cabin: 'L', lounge: 'L', dining: 'L',
    stores: 'A', magazine: 'M', engine: 'E', aux: 'E', reactor: 'E', reactorctl: 'C', repair: 'Q', dccentral: 'C',
    cic: 'C', flagplot: 'C', launcher: 'C', catapult: 'Q', hangar: 'Q', airlock: 'Q', flightdeckhatch: 'Q',
    platform: 'T', trunk: 'T', stub: 'C'
  };
  var LABEL = {
    passage: 'Passageway', cross: 'Cross-passage', lobby: 'Passageway', landing: 'Lift', berthing: 'Berthing',
    mess: 'Mess deck', sickbay: 'Sick bay', wardroom: 'Wardroom', galley: 'Galley', office: 'Office',
    ready: 'Ready room', cabin: 'Cabins', lounge: 'Lounge', dining: 'Dining saloon', stores: 'Storeroom',
    magazine: 'Missile magazine', engine: 'Engine room', aux: 'Auxiliary machinery', reactor: 'Reactor',
    reactorctl: 'Reactor control', repair: 'Repair locker', dccentral: 'Damage control central',
    cic: 'Combat information center', flagplot: 'Flag plot', launcher: 'Launcher control', catapult: 'Catapult machinery',
    hangar: 'Hangar bay', airlock: 'Airlock', flightdeckhatch: 'Flight deck access', platform: 'Tram platform', stub: ''
  };

  function deckNum(spec, id) {
    for (var i = 0; i < spec.decks.length; i++) if (spec.decks[i].id === id) return spec.decks[i].num;
    return id;
  }

  /* ---- THE LAYOUT -------------------------------------------------------- */
  function layout(hullId, opts) {
    opts = opts || {};
    if (NAVAL[hullId]) return naval(hullId, fitSpec(NAVAL[hullId], opts), opts);
    if (FLATS[hullId]) return flat(hullId, FLATS[hullId], opts);
    return null;
  }

  /* IN HER AS SHE IS (stage 2, 2026-11-23). shipdeck.js builds the bridge,
   * the lift car and her airlock deck itself, so the stack is moved to fit
   * them: `opts.bridgeY` her bridge floor (the tower and island levels go
   * with it), `opts.mainY` the floor of her own airlock deck, which the
   * deck named `opts.mergeDeck` becomes (the rest of the stack goes with
   * it); `opts.lift` where her car's landings are; `opts.z1` a merchant's
   * forward end, aft of her own airlock deck's rooms. */
  function fitSpec(base, opts) {
    var spec = {}, k;
    for (k in base) spec[k] = base[k];
    var dyS = opts.bridgeY !== undefined ? opts.bridgeY - base.decks[0].y : 0, dyM = 0;
    if (opts.mergeDeck && opts.mainY !== undefined) {
      base.decks.forEach(function (d) { if (d.id === opts.mergeDeck) dyM = opts.mainY - d.y; });
    }
    spec.decks = base.decks.map(function (d) {
      var c = {};
      for (var j in d) c[j] = d[j];
      c.y = d.y + (d.role === 'stub' || d.role === 'super' ? dyS : dyM);
      return c;
    });
    if (opts.lift) spec.lift = { x: opts.lift.x, z: opts.lift.z, stops: base.lift.stops };
    /* A merchant's band starts behind her own airlock deck, wherever that
     * ends (a ship drawn bigger than her hull runs her hold on aft,
     * render.js shipInterior), and keeps its own length. */
    if (opts.z1 !== undefined) {
      spec.z1 = Math.min(base.z1, opts.z1);
      if (base.bandLen) spec.z0 = spec.z1 - base.bandLen;
    }
    var zFwd = spec.z1;
    spec.decks.forEach(function (d) { if (d.zEndAft !== undefined) d.zEnd = zFwd - d.zEndAft; });
    return spec;
  }
  var TRUNK_W = 2.6;           // the tram's trunk, down her port side

  function newPlan(hullId, spec, opts) {
    return {
      hullId: hullId, style: spec.style, military: !!spec.military, cx: spec.cx || 0, hw: spec.hw,
      zBow: spec.zBow, dc: spec.dc || null, decks: [], rooms: [], links: [], bulkheads: [], reactors: [],
      key: 'navaldeck|' + (opts.key || hullId)
    };
  }
  function addDeck(p, d) {
    var dk = { id: d.id, num: d.num, name: d.name, role: d.role, y: d.y, h: d.h };
    p.decks.push(dk);
    return dk;
  }
  function room(p, deck, kind, x0, x1, z0, z1, extra) {
    var r = { id: kind + '-' + deck.id + '-' + p.rooms.length, kind: kind, deck: deck.id,
              x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1),
              y0: deck.y, y1: deck.y + deck.h, label: LABEL[kind] || kind };
    if (extra) for (var k in extra) r[k] = extra[k];
    p.rooms.push(r);
    return r;
  }
  /* A way from room a to room b. type: door | wtdoor | curtain | ladder |
   * scuttle | trunk | stair | lift | tram. fit: 'X' | 'Y' | 'Z' | 'D' | null. */
  function link(p, type, a, b, fit, at, extra) {
    var l = { id: type + '-' + p.links.length, type: type, a: a.id, b: b.id, fit: fit || null, x: at[0], z: at[1] };
    if (extra) for (var k in extra) l[k] = extra[k];
    p.links.push(l);
    return l;
  }

  function naval(hullId, spec, opts) {
    var p = newPlan(hullId, spec, opts);
    var rnd = stream(p.key);
    var navy = spec.style === 'navy';
    var cx = spec.cx, hw = spec.hw;
    /* As many compartments as the decks' lists say; their length from her
     * band (which a merchant's own airlock deck may shorten). */
    var nz = 0;
    spec.decks.forEach(function (d) { nz = Math.max(nz, (d.zones || d.centre || []).length); });
    if (!nz) nz = Math.round((spec.z1 - spec.z0) / spec.B);
    var B = (spec.z1 - spec.z0) / nz;
    var zones = [];
    for (var i = 0; i < nz; i++) zones.push([spec.z0 + i * B, spec.z0 + (i + 1) * B]);
    /* Zone 0 is aft. The bulkheads between zones are the main watertight
     * ones; the frame numbers count from her stem. */
    for (i = 1; i < nz; i++) p.bulkheads.push({ z: zones[i][0], frame: frameAt(spec.zBow, zones[i][0]), main: true });
    p.zones = zones;
    var dcIndex = -1;
    spec.decks.forEach(function (d, di) { if (d.id === spec.dc) dcIndex = di; });

    var byDeck = {};          // deck id -> { pass: {p:[], s:[], c:[]}, zone rooms }
    var P = Math.min(hw * 0.45, 5.0);     // the twin passages' distance off her centreline
    spec.decks.forEach(function (d, di) {
      var dk = addDeck(p, d), here = byDeck[d.id] = { deck: dk, zoneRoom: [], pass: { p: [], s: [], c: [] }, side: { p: [], s: [] } };
      if (d.role === 'stub') {
        var sz0 = spec.lift.z + LANDING / 2 + WALL;
        here.stub = room(p, dk, 'stub', spec.lift.x - 2, spec.lift.x + 2, sz0, sz0 + 4, { label: d.name });
        return;
      }
      if (d.role === 'super') return;           // rooms round the lift, below
      zones.forEach(function (zn, zi) {
        var za = zn[0] + WALL / 2, zb = zn[1] - WALL / 2;
        /* A deck that ends short of her band's forward end (d.zEnd). */
        if (d.zEnd !== undefined) {
          if (za + 2.5 >= d.zEnd) return;
          zb = Math.min(zb, d.zEnd);
        }
        if (d.role === 'below') {
          var kind = (d.zones && d.zones[zi]) || 'stores';
          /* A tram deck's compartments stand inboard of the tram's trunk. */
          var bx0 = d.tram ? cx - hw + TRUNK_W + WALL : cx - hw;
          if (kind === 'reactor') {
            /* Reactor control forward, the reactor aft of it, the glass in
             * the bulkhead between (reactorRoom). */
            var rr = reactorRoom(p, dk, zn, (bx0 + cx + hw) / 2, (cx + hw - bx0) / 2, spec.reactors.axis, spec.military);
            here.zoneRoom[zi] = rr.control;
            here.reactorAt = here.reactorAt || {};
            here.reactorAt[zi] = rr;
          } else {
            here.zoneRoom[zi] = room(p, dk, kind, bx0, cx + hw, za, zb, { zone: zi });
          }
          return;
        }
        if (d.role === 'hangar' && d.bays.indexOf(zi) >= 0) {
          var bay = room(p, dk, 'hangar', cx - hw, cx + hw, za, zb, { zone: zi, bay: d.bays.indexOf(zi) });
          here.zoneRoom[zi] = bay;
          return;
        }
        if (d.role === 'twin' || d.role === 'hangar') {
          var ps = room(p, dk, 'passage', cx - P - PASS_W / 2, cx - P + PASS_W / 2, za, zb, { zone: zi, side: -1 });
          var ss = room(p, dk, 'passage', cx + P - PASS_W / 2, cx + P + PASS_W / 2, za, zb, { zone: zi, side: 1 });
          here.pass.p[zi] = ps; here.pass.s[zi] = ss;
          var ix0 = cx - P + PASS_W / 2 + WALL, ix1 = cx + P - PASS_W / 2 - WALL;
          var cr = room(p, dk, 'cross', ix0, ix1, za, za + PASS_W, { zone: zi });
          link(p, 'door', ps, cr, null, [ix0, za + PASS_W / 2]);
          link(p, 'door', cr, ss, null, [ix1, za + PASS_W / 2]);
          var ck = d.centre && d.centre[zi];
          if (ck) {
            var c = room(p, dk, ck, ix0, ix1, za + PASS_W + WALL, zb, { zone: zi });
            link(p, 'door', cr, c, null, [cx, za + PASS_W + WALL / 2]);
          }
          var sk = d.side && d.side[zi];
          if (sk) {
            var so = room(p, dk, sk, cx + P + PASS_W / 2 + WALL, cx + hw, za, zb, { zone: zi, side: 1 });
            var po = room(p, dk, sk, cx - hw, cx - P - PASS_W / 2 - WALL, za, zb, { zone: zi, side: -1 });
            link(p, 'door', ss, so, null, [cx + P + PASS_W / 2, (za + zb) / 2]);
            link(p, 'door', ps, po, null, [cx - P - PASS_W / 2, (za + zb) / 2]);
            here.side.s[zi] = so; here.side.p[zi] = po;
          }
          here.zoneRoom[zi] = ss;
          return;
        }
        if (d.role === 'line') {
          var lp = room(p, dk, 'passage', cx - PASS_W / 2, cx + PASS_W / 2, za, zb, { zone: zi, side: 0 });
          here.pass.c[zi] = lp; here.pass.s[zi] = lp; here.pass.p[zi] = lp;
          var lk = d.centre && d.centre[zi];
          if (lk === 'reactor') {
            /* A merchant reactor is a zone of its own across the deck: the
             * passage stops at its control room's door. */
            p.rooms.pop(); here.pass.c[zi] = here.pass.s[zi] = here.pass.p[zi] = null;
            var mr = reactorRoom(p, dk, zn, cx, hw, spec.reactors.axis, spec.military);
            here.zoneRoom[zi] = mr.control;
            here.reactorAt = here.reactorAt || {};
            here.reactorAt[zi] = mr;
            return;
          }
          if (lk === 'engine') {
            p.rooms.pop(); here.pass.c[zi] = here.pass.s[zi] = here.pass.p[zi] = null;
            here.zoneRoom[zi] = room(p, dk, 'engine', cx - hw, cx + hw, za, zb, { zone: zi });
            return;
          }
          if (lk) {
            var lc = room(p, dk, lk, cx + PASS_W / 2 + WALL, cx + hw, za, zb, { zone: zi, side: 1 });
            link(p, 'door', lp, lc, null, [cx + PASS_W / 2, (za + zb) / 2]);
            here.side.s[zi] = lc;
          }
          var lsk = d.side && d.side[zi];
          if (lsk) {
            var lo = room(p, dk, lsk, cx - hw, cx - PASS_W / 2 - WALL, za, zb, { zone: zi, side: -1 });
            link(p, 'door', lp, lo, null, [cx - PASS_W / 2, (za + zb) / 2]);
            here.side.p[zi] = lo;
          }
          here.zoneRoom[zi] = lp;
        }
      });

      /* Along the deck, through the main bulkheads. */
      var belowDC = navy && dcIndex >= 0 && di > dcIndex;
      for (var zi = 1; zi < nz; zi++) {
        var zw = zones[zi][0];
        if (d.role === 'twin' || d.role === 'hangar') {
          var isDC = d.id === spec.dc;
          var wfit = isDC ? 'Z' : 'Y';
          [['p', -1], ['s', 1]].forEach(function (sd) {
            var a = endRoom(here, zi - 1, sd[0], d), b = endRoom(here, zi, sd[0], d);
            if (!a || !b || a === b) return;
            var curtain = a.kind === 'hangar' && b.kind === 'hangar';
            if (curtain && sd[0] === 'p') return;                  // one curtain spans the bay
            link(p, curtain ? 'curtain' : 'wtdoor', a, b, curtain ? null : wfit,
                 [curtain ? cx : cx + sd[1] * P, zw], { bulkhead: zw });
          });
        } else if (d.role === 'line') {
          var a = here.zoneRoom[zi - 1], b = here.zoneRoom[zi];
          if (!a || !b) continue;
          link(p, 'wtdoor', a, b, d.wt ? 'D' : null, [cx, zw], { bulkhead: zw });
        } else if (d.role === 'below' && !belowDC && !navy) {
          /* A merchant's lower deck: watertight doors that close on damage. */
          link(p, 'wtdoor', here.zoneRoom[zi - 1], here.zoneRoom[zi], 'D', [cx, zw], { bulkhead: zw });
        }
        /* Navy, below the damage-control deck: no door at all. */
      }
    });

    /* ---- BETWEEN DECKS ---------------------------------------------------- */
    var stack = spec.decks.filter(function (d) { return d.role !== 'stub' && d.role !== 'super'; });
    var stations = [1, Math.floor(nz / 2), nz - 2].filter(function (v, i, a) { return v >= 0 && v < nz && a.indexOf(v) === i; });
    for (var si = 0; si + 1 < stack.length; si++) {
      var up = byDeck[stack[si].id], dn = byDeck[stack[si + 1].id];
      var dnBelow = stack[si + 1].role === 'below';
      if (!dnBelow) {
        /* Ladder stations, a pair at each: starboard up-and-forward, port
         * down-and-aft. Merchant: stair towers, no hatch. */
        stations.forEach(function (zi) {
          [['s', 1, 'up'], ['p', -1, 'down']].forEach(function (sd) {
            var lo = ladderRoom(dn, zi, sd[0]), hi = ladderRoom(up, zi, sd[0]);
            if (!lo || !hi) return;
            var zm = (zones[zi][0] + zones[zi][1]) / 2, x = navy ? cx + sd[1] * P : cx + sd[1] * 0.4;
            ladder(p, lo, hi, navy ? 'Z' : null, x, zm, sd[1], sd[2], navy).station = true;
          });
        });
        /* Every watertight compartment of the damage-control deck (or a
         * merchant's watertight deck) has its own way up, so shutting its
         * doors never shuts anyone in: a single ladder (with its scuttle)
         * where there is no ladder station, sides alternating, and an
         * escape trunk from any machinery or reactor down there. */
        var dnSealed = (navy && stack[si + 1].id === spec.dc) || stack[si + 1].wt;
        if (dnSealed) zones.forEach(function (zn, zi) {
          var rr = dn.reactorAt && dn.reactorAt[zi];
          if (stations.indexOf(zi) < 0) {
            var side = zi % 2 ? 'p' : 's', sx = side === 's' ? 1 : -1;
            var lo = ladderRoom(dn, zi, side), hi = ladderRoom(up, zi, side);
            if (lo && hi) ladder(p, lo, hi, navy ? 'Z' : null, navy ? cx + sx * P : cx + sx * 0.4, zn[0] + B * 0.3, sx, sx > 0 ? 'up' : 'down', navy);
          }
          var lz = dn.zoneRoom[zi];
          if (rr || (lz && (lz.kind === 'engine' || lz.kind === 'aux'))) {
            var top = ladderRoom(up, zi, 'p') || ladderRoom(up, zi, 's');
            if (top) link(p, 'trunk', rr ? rr.reactor : lz, top, null, [cx - Math.min(P, hw - 1), zn[0] + B * 0.7], { climb: true });
          }
        });
      } else {
        /* Down into the compartments under the damage-control deck: each
         * by its own hatch (Z, with a scuttle in it), sides alternating,
         * and every machinery space with an escape trunk besides. */
        zones.forEach(function (zn, zi) {
          var lo = dn.zoneRoom[zi]; if (!lo) return;
          var side = zi % 2 ? 'p' : 's', sx = side === 's' ? 1 : -1;
          var hi = ladderRoom(up, zi, side) || ladderRoom(up, zi, side === 's' ? 'p' : 's');
          if (!hi) return;
          var zm = zn[0] + B * 0.35;
          ladder(p, lo, hi, navy ? 'Z' : null, cx + sx * Math.min(P, hw - 1), zm, sx, sx > 0 ? 'up' : 'down', navy);
          var mach = lo.kind === 'engine' || lo.kind === 'aux' || lo.kind === 'reactorctl' || lo.kind === 'magazine';
          var rr = dn.reactorAt && dn.reactorAt[zi];
          if (mach || rr) {
            /* Up to the damage-control deck itself, past anything between. */
            var dcd = byDeck[spec.dc] || up;
            var top = ladderRoom(dcd, zi, side === 's' ? 'p' : 's') || ladderRoom(dcd, zi, side);
            var from = rr ? rr.reactor : lo;
            if (top) link(p, 'trunk', from, top, null, [cx - sx * Math.min(P, hw - 1), zn[0] + B * 0.65], { climb: true });
          }
        });
        /* Below one 'below' deck, another: compartment to compartment. */
      }
    }
    /* Navy: below-to-below (the Capital's 3rd and 4th), zone by zone. */
    for (si = 0; si + 1 < stack.length; si++) {
      if (stack[si].role !== 'below' || stack[si + 1].role !== 'below') continue;
      var u2 = byDeck[stack[si].id], d2 = byDeck[stack[si + 1].id];
      zones.forEach(function (zn, zi) {
        var lo = d2.zoneRoom[zi], hi = u2.zoneRoom[zi];
        if (!lo || !hi) return;
        var sx = zi % 2 ? 1 : -1;
        var reach = Math.min(lo.x1 - spec.cx, spec.cx - lo.x0, hi.x1 - spec.cx, spec.cx - hi.x0) - 1.0;
        ladder(p, lo, hi, navy ? 'Z' : null, spec.cx + sx * reach, zn[0] + B * 0.5, sx, sx > 0 ? 'up' : 'down', navy);
        /* Machinery down here gets its escape trunk straight up to the
         * damage-control deck, through the deck between. */
        var rr2 = d2.reactorAt && d2.reactorAt[zi];
        var mach2 = lo.kind === 'engine' || lo.kind === 'aux' || lo.kind === 'reactorctl' || lo.kind === 'magazine';
        if (mach2 || rr2) {
          var top2 = ladderRoom(byDeck[spec.dc], zi, sx > 0 ? 'p' : 's');
          if (top2) link(p, 'trunk', rr2 ? rr2.reactor : lo, top2, null, [spec.cx - sx * reach, zn[0] + B * 0.8], { climb: true });
        }
      });
    }

    /* ---- THE LIFT -------------------------------------------------------- */
    var lf = spec.lift, prevLanding = null;
    lf.stops.forEach(function (id) {
      var here = byDeck[id], dk = here.deck;
      /* Her own airlock deck has her own landing (shipdeck.js). */
      if (id === opts.mergeDeck) return;
      var lzi = zoneAt(zones, lf.z);
      var land = room(p, dk, 'landing', lf.x - LANDING / 2, lf.x + LANDING / 2, lf.z - LANDING / 2, lf.z + LANDING / 2);
      if (here.stub) link(p, 'door', here.stub, land, null, [lf.x, lf.z + LANDING / 2]);
      else if (dk.role === 'super') {
        var lvl = (spec.decks.filter(function (d) { return d.id === id; })[0].rooms || [])[0];
        if (lvl) {
          var lr = room(p, dk, lvl, lf.x - 4, lf.x + 4, lf.z - LANDING / 2 - WALL - 6, lf.z - LANDING / 2 - WALL);
          link(p, 'door', land, lr, null, [lf.x, lf.z - LANDING / 2]);
        }
      } else {
        var inBand = Math.abs(lf.x - cx) + LANDING / 2 <= hw;
        if (inBand) {
          /* Forward or aft of the band, on her centreline: a passage along
           * to the nearest zone. */
          var tz = (dk.role === 'line' && here.pass.c[lzi]) || here.zoneRoom[lzi];
          if (tz) {
            var fwd = lf.z > (tz.z0 + tz.z1) / 2;
            var ez = fwd ? tz.z1 : tz.z0, gz = fwd ? land.z0 - ez : ez - land.z1;
            if (gz > 0.6) {
              var lz0 = fwd ? ez + WALL : land.z1 + WALL, lz1 = fwd ? land.z0 - WALL : ez - WALL;
              var lbz = room(p, dk, 'lobby', lf.x - PASS_W / 2, lf.x + PASS_W / 2, lz0, lz1);
              link(p, 'door', land, lbz, null, [lf.x, fwd ? lz1 : lz0]);
              link(p, 'door', lbz, tz, null, [lf.x, ez]);
            } else link(p, 'door', land, tz, null, [lf.x, ez]);
          }
        } else {
          /* Off her centreline band (a tower standing to starboard): a
           * passage across to it. */
          var target = landingTarget(here, lzi, lf.x > cx ? 's' : 'p');
          if (target) {
            var edge = lf.x > cx ? target.x1 : target.x0;
            var gap = Math.abs(lf.x - edge) - LANDING / 2;
            if (gap > 0.6) {
              var lx0 = lf.x > cx ? edge + WALL : lf.x + LANDING / 2 + WALL;
              var lx1 = lf.x > cx ? lf.x - LANDING / 2 - WALL : edge - WALL;
              var lob = room(p, dk, 'lobby', lx0, lx1, lf.z - PASS_W / 2, lf.z + PASS_W / 2);
              link(p, 'door', land, lob, null, [lf.x > cx ? lx1 : lx0, lf.z]);
              link(p, 'door', lob, target, null, [edge, lf.z]);
            } else link(p, 'door', land, target, null, [edge, lf.z]);
          }
        }
      }
      if (prevLanding) link(p, 'lift', prevLanding, land, null, [lf.x, lf.z]);
      prevLanding = land;
    });

    /* ---- THE TRAM: a sealed trunk down her port side, end to end -------
     * A platform in the trunk at each end, a door from each into its
     * compartment, and the tramway between them, ridden and never walked. */
    spec.decks.forEach(function (d) {
      if (!d.tram) return;
      var here = byDeck[d.id], fz = -1, az = -1;
      for (var zi = nz - 1; zi >= 0; zi--) if (here.zoneRoom[zi]) { fz = zi; break; }
      for (zi = 0; zi < nz; zi++) if (here.zoneRoom[zi]) { az = zi; break; }
      if (fz < 0 || az < 0 || fz === az) return;
      var tx0 = cx - hw, tx1 = cx - hw + TRUNK_W, PL = 3.2;
      var fa = here.zoneRoom[fz], ab = here.zoneRoom[az];
      var pa = room(p, here.deck, 'platform', tx0, tx1, zones[fz][1] - WALL / 2 - PL, zones[fz][1] - WALL / 2, { zone: fz });
      var pb = room(p, here.deck, 'platform', tx0, tx1, zones[az][0] + WALL / 2, zones[az][0] + WALL / 2 + PL, { zone: az });
      var way = room(p, here.deck, 'tramway', tx0, tx1, pb.z1 + WALL, pa.z0 - WALL, { walk: false });
      link(p, 'door', pa, fa, null, [tx1, (pa.z0 + pa.z1) / 2]);
      link(p, 'door', pb, ab, null, [tx1, (pb.z0 + pb.z1) / 2]);
      link(p, 'tram', pa, pb, null, [(tx0 + tx1) / 2, (pa.z0 + pb.z1) / 2], { battery: TRAM_BATTERY });
      p.tram = { deck: d.id, a: pa.id, b: pb.id, way: way.id, x: (tx0 + tx1) / 2 };
    });

    /* ---- THE AIRLOCK ----------------------------------------------------- */
    if (!opts.noAirlock) {
      var al = spec.airlock, ah = byDeck[al.deck], azr = ah.zoneRoom[al.zone];
      var anchor = (ah.side.s[al.zone]) || azr;
      var ax0 = cx + hw + WALL, z0a = (azr.z0 + azr.z1) / 2 - 1.6;
      var lock = room(p, ah.deck, 'airlock', ax0, ax0 + 2.6, z0a, z0a + 3.2, { zone: al.zone, side: 1 });
      link(p, 'door', anchor, lock, null, [cx + hw, z0a + 1.6]);
      p.airlock = lock.id;
    }
    /* ---- HER OWN AIRLOCK DECK (opts.join) ----------------------------------
     * shipdeck.js's rooms at the foot of her tower, standing in for the
     * Navy's quarterdeck: a passage from the point on its wall `join` names
     * to the nearest room of the band, on the deck it becomes. */
    if (opts.join && opts.mergeDeck && byDeck[opts.mergeDeck]) {
      var jh = byDeck[opts.mergeDeck], jd = jh.deck, J = opts.join, jz = zoneAt(zones, J.z);
      var jt = jh.deck.role === 'line' ? (jh.pass.c[nz - 1] || jh.zoneRoom[nz - 1]) : landingTarget(jh, jz, J.x > cx ? 's' : 'p');
      if (J.axis === 'z') {
        jt = jh.pass.c[nz - 1] || jh.zoneRoom[nz - 1];
        var gz0 = jt.z1 + WALL, gz1 = J.z - WALL;
        var jl = gz1 - gz0 > 0.3 ? room(p, jd, 'lobby', J.x - PASS_W / 2, J.x + PASS_W / 2, gz0, gz1) : null;
        if (jl) link(p, 'door', jl, jt, null, [J.x, jt.z1]);
        p.join = { room: jl ? jl.id : jt.id, x: J.x, z: J.z, axis: 'z', deck: opts.mergeDeck };
      } else {
        var e2 = J.x > cx ? jt.x1 : jt.x0;
        var gx0 = J.x > cx ? e2 + WALL : J.x + WALL, gx1 = J.x > cx ? J.x - WALL : e2 - WALL;
        var jl2 = room(p, jd, 'lobby', gx0, gx1, J.z - PASS_W / 2, J.z + PASS_W / 2);
        link(p, 'door', jl2, jt, null, [e2, J.z]);
        p.join = { room: jl2.id, x: J.x, z: J.z, axis: 'x', deck: opts.mergeDeck };
      }
      if (!p.airlock) p.airlock = p.join.room;
    }
    p.bridge = byDeck.bridge.stub.id;

    labelAll(p, spec);
    p.seed = rnd();
    return p;
  }

  /* The reactor zone: control forward, the reactor aft of a bulkhead with
   * the glass in it. A military core lies on her side with the rod drives
   * on its forward face; a civilian one stands, its drives on top. */
  function reactorRoom(p, dk, zn, cx, hw, axis, military, sizeOpt) {
    var za = zn[0] + WALL / 2, zb = zn[1] - WALL / 2, L = zb - za;
    var ctlL = Math.max(2.4, Math.min(5, L * 0.4));
    var zw = zb - ctlL;                         // the window's bulkhead
    var ctl = room(p, dk, 'reactorctl', cx - hw, cx + hw, zw + WALL / 2, zb);
    var rx = room(p, dk, 'reactor', cx - hw, cx + hw, za, zw - WALL / 2);
    link(p, 'door', ctl, rx, 'X', [cx + hw - 1.0, zw], { reactorDoor: true });
    var rLen = zw - WALL / 2 - za, cr = Math.min(0.4, rLen * 0.08);
    var r = {
      id: 'reactor-' + p.reactors.length, room: rx.id, control: ctl.id, axis: axis, military: !!military,
      /* The core: about 0.8 m across, in a water jacket 1.5–2 m all round,
       * which is her coolant and her crew's shield both. */
      core: { x: cx, y: dk.y + Math.min(1.4, dk.h * 0.45), z: (za + zw) / 2, r: cr, len: axis === 'h' ? Math.min(2.4, hw * 1.2) : Math.min(2.0, dk.h * 0.6) },
      jacket: Math.max(1.2, Math.min(2.0, rLen * 0.3)),
      rods: axis === 'h' ? { face: 'fwd', n: 7 } : { face: 'top', n: 7 },
      window: { z: zw, x0: cx - Math.min(1.6, hw * 0.6), x1: cx + Math.min(1.6, hw * 0.6),
                y0: dk.y + 0.7, y1: dk.y + Math.min(dk.h - 0.3, 2.3), faces: 'fwd' }
    };
    p.reactors.push(r);
    return { control: ctl, reactor: rx, spec: r };
  }

  function ladder(p, lo, hi, fit, x, z, side, rule, navy) {
    /* Foot aft, head forward: about 60 degrees, so its run is its rise
     * over tan 60. */
    var rise = hi.y0 - lo.y0, run = rise / Math.tan(Math.PI / 3);
    var l = link(p, navy ? 'ladder' : 'stair', lo, hi, fit, [x, z], {
      side: side, rule: rule, footZ: z - run / 2, headZ: z + run / 2, rise: rise
    });
    if (navy && fit === 'Z') {
      /* The scuttle let into the hatch: Yoke, so open at general quarters;
       * a vertical ladder, one at a time. */
      link(p, 'scuttle', lo, hi, 'Y', [x + side * 0.35, z + run / 2 - 0.4], { of: l.id, climb: true });
    }
    return l;
  }

  function endRoom(here, zi, side, d) {
    var r = here.zoneRoom[zi];
    if (r && r.kind === 'hangar') return r;
    return side === 's' ? here.pass.s[zi] : here.pass.p[zi];
  }
  function ladderRoom(here, zi, side) {
    if (!here) return null;
    var r = here.zoneRoom[zi];
    if (r && (r.kind === 'hangar' || here.deck.role === 'below')) return r;
    var pr = side === 's' ? here.pass.s[zi] : here.pass.p[zi];
    return pr || r || null;
  }
  function landingTarget(here, zi, side) {
    var r = here.zoneRoom[zi];
    if (here.deck.role === 'below' || (r && r.kind === 'hangar')) return r;
    return (side === 's' ? here.side.s[zi] || here.pass.s[zi] : here.side.p[zi] || here.pass.p[zi]) || r;
  }
  function zoneAt(zones, z) {
    for (var i = 0; i < zones.length; i++) if (z >= zones[i][0] && z < zones[i][1]) return i;
    return z < zones[0][0] ? 0 : zones.length - 1;
  }
  function frameAt(zBow, z) { return Math.max(0, Math.round((zBow - z) / FRAME)); }

  /* ---- A SMALLER HULL'S FLAT ---------------------------------------------
   * Under her own deck (a stub here), aft: an engine room and a reactor
   * zone. Two ways down — the ladder pair, a trunk from each machinery
   * space — and a watertight door between the two below. */
  function flat(hullId, f, opts) {
    var military = !!f.military || !!CRAWLER_MILITARY[opts.libId];
    if (opts.hw) f = Object.assign({}, f, { hw: Math.min(f.hw, opts.hw) });
    var spec = { style: hullId === 'cutter' || (hullId === 'crawler' && military) ? 'navy' : 'merchant',
                 military: military, cx: 0, hw: f.hw, zBow: (f.len || 30) * 0.35 };
    var p = newPlan(hullId, spec, opts);
    var navy = spec.style === 'navy';
    var mainY = opts.mainY !== undefined ? opts.mainY : f.mainY;
    var main = addDeck(p, { id: f.under || 'main', num: navy ? '1' : 'Main', name: f.under === 'junction' ? 'Engineering · tram' : 'Main deck', role: 'stub', y: mainY, h: 2.25 });
    var h = 3.0;
    var low = addDeck(p, { id: 'flat', num: navy ? '2' : 'Lower', name: 'Engineering flat', role: 'flat', y: mainY - SLAB - h, h: h });
    /* Where it goes in her (shipdeck.js: under her passage and hold) may be
     * given; otherwise the table's fractions of her length. */
    var z1 = opts.z1 !== undefined ? opts.z1 : f.z1 !== undefined ? f.z1 : -(f.len * f.zf);
    var z0 = opts.z0 !== undefined ? opts.z0 : f.z0 !== undefined ? f.z0 : z1 - f.len * f.zl;
    var zm = (z0 + z1) / 2;
    var stub = room(p, main, 'stub', -f.hw, f.hw, z0, z1, { label: main.name });
    p.zones = [[z0, zm], [zm, z1]];
    p.bulkheads.push({ z: zm, frame: frameAt(spec.zBow, zm), main: true });
    /* Her engine room is on her own deck (shipdeck.js, off the passage):
     * down here, the auxiliary machinery — pumps, the reactor's coolant
     * plant, the turbines' condensers. */
    var eng = room(p, low, 'aux', -f.hw, f.hw, z0 + WALL / 2, zm - WALL / 2, { zone: 0 });
    var rr = reactorRoom(p, low, [zm, z1], 0, f.hw, military ? 'h' : 'v', military);
    /* The watertight door between them is on the control room's side. */
    link(p, 'wtdoor', eng, rr.control, navy ? 'Z' : 'D', [f.hw - 0.8, zm], { bulkhead: zm });
    /* The ladders' heads and the trunks' tops may be placed (opts.ladderAt:
     * [starboard, port] centres; opts.trunkAt: { aux, reactor }), so they
     * come up into the rooms over them. */
    var zl = z1 - 1.2, la = opts.ladderAt || [[f.hw * 0.5, zl], [-f.hw * 0.5, zl]], ta = opts.trunkAt || {};
    ladder(p, rr.control, stub, navy ? 'Z' : null, la[0][0], la[0][1], 1, 'up', navy);
    ladder(p, rr.control, stub, navy ? 'Z' : null, la[1][0], la[1][1], -1, 'down', navy);
    link(p, 'trunk', eng, stub, null, ta.aux || [-f.hw + 0.8, z0 + 1.2], { climb: true });
    link(p, 'trunk', rr.reactor, stub, null, ta.reactor || [-f.hw + 0.8, zm + 1.0], { climb: true });
    p.airlock = stub.id;          // her own airlock is on her own deck
    p.bridge = stub.id;
    labelAll(p, spec);
    return p;
  }

  /* ---- COMPARTMENT NUMBERS -------------------------------------------------
   * deck-frame-position-use. Position: 0 on the centreline, starboard 1, 3,
   * 5 outboard, port 2, 4, 6. A merchant's rooms are named, not numbered;
   * they carry their deck letter and the frame. */
  function labelAll(p, spec) {
    var byDeckFrame = {};
    p.rooms.forEach(function (r) {
      var mid = (r.x0 + r.x1) / 2, off = mid - p.cx, frame = frameAt(spec.zBow, r.z1);
      var side = Math.abs(off) < 0.75 ? 0 : off > 0 ? 1 : -1;
      var key = r.deck + '|' + frame + '|' + side, n = byDeckFrame[key] = (byDeckFrame[key] || 0) + 1;
      var pos = side === 0 ? 0 : side > 0 ? 2 * n - 1 : 2 * n;
      r.frame = frame; r.pos = pos;
      r.comp = deckNum(p, r.deck) + '-' + frame + '-' + pos + '-' + (USE[r.kind] || 'Q');
    });
  }

  /* ---- THE GRAPH ---------------------------------------------------------
   * cond: 'normal' (at sea) or 'zebra' (general quarters). Under zebra every
   * Z fitting is dogged; X and Y you open as you pass; a D door closes only
   * on damage (opts.damaged, a list of link ids). */
  function passable(l, cond, damaged, hull) {
    cond = condAt(cond, hull);
    if (cond === 'zebra' && l.fit === 'Z') return false;
    if (cond === 'zebra' && l.battery && hull !== undefined && hull < l.battery.outBelow) return false;
    if (damaged && l.fit === 'D' && damaged.indexOf(l.id) >= 0) return false;
    return true;
  }
  function roomById(p, id) {
    if (!p._ix) { p._ix = {}; p.rooms.forEach(function (r) { p._ix[r.id] = r; }); }
    return p._ix[id];
  }
  function centre(r) { return [(r.x0 + r.x1) / 2, r.y0, (r.z0 + r.z1) / 2]; }
  function adjacency(p, cond, damaged, hull) {
    var adj = {};
    p.rooms.forEach(function (r) { adj[r.id] = []; });
    p.links.forEach(function (l) {
      if (!passable(l, cond, damaged, hull)) return;
      adj[l.a].push({ to: l.b, l: l, up: roomById(p, l.b).y0 > roomById(p, l.a).y0 });
      adj[l.b].push({ to: l.a, l: l, up: roomById(p, l.a).y0 > roomById(p, l.b).y0 });
    });
    return adj;
  }
  function reachable(p, from, cond, damaged, hull) {
    var adj = adjacency(p, cond, damaged, hull), seen = {}, q = [from];
    seen[from] = true;
    while (q.length) {
      var id = q.shift();
      adj[id].forEach(function (e) { if (!seen[e.to]) { seen[e.to] = true; q.push(e.to); } });
    }
    return seen;
  }
  /* What a step costs, in metres walked: the distance between the two rooms'
   * middles through the link, a climb's time as distance, the lift and the
   * tram at their speeds; and a ladder taken against the traffic rule a
   * crewman's reluctance (RULE_COST) on top. */
  var RULE_COST = 25;
  function stepCost(p, from, e, cond) {
    var a = centre(roomById(p, from)), b = centre(roomById(p, e.to)), l = e.l;
    var walk = Math.hypot(l.x - a[0], l.z - a[2]) + Math.hypot(b[0] - l.x, b[2] - l.z);
    var dy = Math.abs(b[1] - a[1]);
    if (l.type === 'lift') return walk * 0.2 + dy / 8 * 1.4 + 6;   // 8 m/s, and the wait for the car
    if (l.type === 'tram') {
      var v = 8 * (cond === 'zebra' && l.battery ? l.battery.speed : 1);
      return Math.abs(b[2] - a[2]) / v * 1.4 + 4;
    }
    if (l.type === 'scuttle' || l.type === 'trunk') return walk + dy * 2.2 + 2;
    if (l.type === 'ladder' || l.type === 'stair') {
      var against = (e.up && l.rule === 'down') || (!e.up && l.rule === 'up');
      return walk + dy * 1.2 + (against ? RULE_COST : 0);
    }
    return walk + (l.fit ? 1 : 0);
  }
  function route(p, from, to, opts) {
    opts = opts || {};
    var cond = condAt(opts.cond, opts.hull);
    var adj = adjacency(p, cond, opts.damaged, opts.hull);
    var dist = {}, prev = {}, done = {};
    dist[from] = 0;
    for (;;) {
      var u = null, best = Infinity;
      for (var k in dist) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
      if (u === null) return null;
      if (u === to) break;
      done[u] = true;
      adj[u].forEach(function (e) {
        var c = best + stepCost(p, u, e, cond);
        if (dist[e.to] === undefined || c < dist[e.to]) { dist[e.to] = c; prev[e.to] = { from: u, l: e.l, up: e.up }; }
      });
    }
    var steps = [], at = to;
    while (at !== from) { steps.unshift({ room: at, link: prev[at].l, up: prev[at].up }); at = prev[at].from; }
    return { cost: dist[to], steps: steps };
  }

  global.NavalDeck = {
    NAVAL: NAVAL, FLATS: FLATS, USE: USE, TRAM_BATTERY: TRAM_BATTERY, GQ_BELOW: GQ_BELOW, condAt: condAt, LANDING: LANDING, FRAME: FRAME, SLAB: SLAB, RULE_COST: RULE_COST,
    layout: layout, reachable: reachable, route: route, passable: passable, frameAt: frameAt,
    hulls: function () { return Object.keys(NAVAL).concat(Object.keys(FLATS)); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.NavalDeck;
})(typeof window !== 'undefined' ? window : globalThis);
