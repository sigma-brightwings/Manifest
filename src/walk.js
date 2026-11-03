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
  /* Crouching (2026-10-31, Astra: "we also need to be able to crouch with
   * L Ctrl"). Held, not toggled. CROUCH_EYE is only the fallback for when
   * there is no body to measure (node, or no NpcModel): with a body, the
   * eye is wherever the crouched body's eyes actually are (selfFigure). */
  var CROUCH_EYE = 1.1;        // m
  var CROUCH = 0.8;            // m/s, walking crouched; no running
  var CROUCH_RATE = 5;         // 1/s, how fast you go down and come up
  /* How far down you can look: 83 degrees, up from the 69 the deck had
   * before there was a body to look down at - at 69 a standing walker
   * saw the toes of their boots and nothing else. Up stays at 1.2. */
  var LOOK_DOWN = 1.45;        // rad

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
    if (opts.sea) return seaLayout(portId, opts);
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
    /* The ships moored here as well (2026-10-28): every one of them is in a
     * berth, so the deck has room for all of them. Adds berths, never draws
     * — the rng below is asked the same questions either way. */
    var needOthers = { L: 0, M: 0, S: 0 };
    (opts.others || []).slice(0, 6).forEach(function (o) { needOthers[sizeClass(o.size)]++; });
    var count = {
      L: Math.max(1, need.L + needOthers.L),
      M: Math.max(rng.int(2, 3), need.M + needOthers.M),
      S: Math.max(rng.int(2, 4), need.S + needOthers.S)
    };
    var order = [];
    ['L', 'M', 'S'].forEach(function (sz) { for (var i = 0; i < count[sz]; i++) order.push(sz); });

    /* THE HANGAR (2026-10-31). Astra: "we want to be able to get into our
     * ship, not walk into a room and use a door. I want the inside of the
     * ship and the inside of the station to be a clean, walkable path" -
     * and, asked, a hangar with her ramp rather than a docking collar. The
     * berth of the ship you are flying is sized to HER (main.js hands her
     * measurements in as ships[].hangar: her hull's box and her ramp's
     * foot in her cockpit's metres, and the floor her gear stands on), her
     * nose pointing out away from the spine so her ramp faces the door you
     * come in by. plan.hangar says where she stands in it, which is all
     * main.js needs to walk you from this floor up her ramp and back. */
    var hs = null;
    (opts.ships || []).forEach(function (s) { if (s.current && s.hangar) hs = s; });
    var hangarSize = hs ? sizeClass(hs.size) : null, hangarDone = false, hangar = null;

    /* The L port at the south end, the spine running north from it. */
    var lport = room('lport', 'lport', -10, 10, -16, 0, 7, 'L docking port');
    /* Berths alternate sides up the spine, biggest nearest the L port. */
    var z = 2, spineLen;
    var west = [], east = [];
    var berthRooms = [];
    for (var i = 0; i < order.length; i++) {
      var sz = order[i], dim = BERTH_ROOM[sz];
      var isHangar = !!(hs && !hangarDone && sz === hangarSize);
      if (isHangar) { dim = hangarDims(hs.hangar); hangarDone = true; }
      var side = (i % 2 === 0) ? -1 : 1;
      var list = side < 0 ? west : east;
      var zc = (list.length ? list[list.length - 1].zEnd + 1 : 2) + dim.d / 2;
      var x0 = side < 0 ? -SPINE_W / 2 - dim.w : SPINE_W / 2;
      var br = room('berth' + i, 'berth', x0, x0 + dim.w, zc - dim.d / 2, zc + dim.d / 2, dim.h,
                    'Berth ' + (i + 1) + '  ·  ' + sz);
      br.size = sz; br.side = side; br.index = i;
      if (isHangar) hangar = placeShip(br, hs.hangar);
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
      /* A hangar's door is wide enough to bring a cargo cart through. */
      door(spine, br, 'x', wallX, (br.z0 + br.z1) / 2, br.hangar ? 3.2 : DOOR_W + (br.size === 'L' ? 1.2 : 0), DOOR_H + 0.3);
    });

    /* THE CARGO HALL (2026-10-31). Astra: "there should be a central cargo
     * area on the station". Between the spine and the concourse, so every
     * walk from a berth to the bar goes through it: the station's freight
     * comes and goes here, and the freight office (`freight`, the market
     * by another door) is on its east wall. */
    var CARGO_W = 24, CARGO_D = 18;
    var cargo = room('cargo', 'cargohall', -CARGO_W / 2, CARGO_W / 2, spineLen, spineLen + CARGO_D, 9, 'Cargo hall');
    door(spine, cargo, 'z', spineLen, 0, SPINE_W - 0.4, DOOR_H + 0.4);
    var hub = spineLen + CARGO_D;

    /* The concourse, north of the cargo hall, and what is in it. */
    var cw = 26, cd = 20;
    var conc = room('concourse', 'concourse', -cw / 2, cw / 2, hub, hub + cd, 6, 'Concourse');
    door(cargo, conc, 'z', hub, 0, 4.4, DOOR_H + 0.8);
    var bar = room('bar', 'bar', -cw / 2 - 12, -cw / 2, hub + 4, hub + 16, 3.6, 'The bar');
    door(conc, bar, 'x', -cw / 2, hub + 10, 2.4, DOOR_H);
    var hall = room('crewhall', 'crewhall', cw / 2, cw / 2 + 10, hub + 3, hub + 13, 3.4, 'Crew hall');
    door(conc, hall, 'x', cw / 2, hub + 8, 2.0, DOOR_H);

    /* Things to use, each a spot you stand near and face. */
    function item(kind, x, zz, label, extra) {
      var it = { kind: kind, x: x, z: zz, label: label };
      for (var k in (extra || {})) it[k] = extra[k];
      items.push(it);
      return it;
    }
    item('market', 6, hub + cd - 1.2, 'Market desk', { counter: [3, hub + cd - 1.4, 9, hub + cd] });
    if (opts.yard) item('yard', -6, hub + cd - 1.2, 'Shipyard counter', { counter: [-9, hub + cd - 1.4, -3, hub + cd] });
    /* The freight office, on the cargo hall's east wall: the same trade
     * as the market desk, at the window the freight goes past. */
    item('freight', CARGO_W / 2 - 1.6, spineLen + 5, 'Freight office', { counter: [CARGO_W / 2 - 1.0, spineLen + 3, CARGO_W / 2, spineLen + 7] });
    /* The bar counter stands 1.3 m off its wall (2026-10-31), so the
     * bartender works behind it and the back bar (dressing.js) is behind
     * them; it used to be flush to the wall, with the bartender on the
     * customers' side. */
    item('bar', -cw / 2 - 9.4, hub + 10, 'The bar', { counter: [-cw / 2 - 10.7, hub + 6, -cw / 2 - 10, hub + 14],
                                                       post: { x: -cw / 2 - 11.3, z: hub + 10, yaw: Math.PI / 2 } });
    item('crew', cw / 2 + 8.8, hub + 8, 'Crew hall board', { counter: [cw / 2 + 9.4, hub + 5, cw / 2 + 10, hub + 11] });

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
      /* In her hangar there is no hatch to use: her ramp is the way
       * aboard, walked. The item marks its foot (silent - nothing to press)
       * and that is where you stand on the deck by default. */
      if (br.hangar && hangar && s.current) {
        var ft = hangar.foot;
        item('mine', ft.x, ft.z, 'Your ship  -  ' + (s.name || 'ship'), { ship: s, berth: br.id, silent: true });
        var away = br.side < 0 ? 1 : -1;
        spawn = { x: ft.x + away * 1.6, z: ft.z, yaw: away > 0 ? Math.PI / 2 : -Math.PI / 2 };
        return;
      }
      /* The hatch is on the berth's outer wall, opposite its door. */
      var hx = br.side < 0 ? br.x0 + 0.9 : br.x1 - 0.9;
      item(s.current ? 'mine' : 'fleet', hx, (br.z0 + br.z1) / 2,
           (s.current ? 'Your ship' : 'Board') + '  ·  ' + (s.name || 'ship'), { ship: s, berth: br.id });
      if (s.current) spawn = { x: hx + (br.side < 0 ? 1.4 : -1.4), z: (br.z0 + br.z1) / 2,
                               yaw: br.side < 0 ? Math.PI / 2 : -Math.PI / 2 };
    });
    /* AND EVERYBODY ELSE'S (2026-10-28), for boarding. `opts.others` are the
     * ships moored here now ({ name, size, route }) in the order the port's
     * timetable gives them; each takes a free berth of its size after yours,
     * and its hatch is the way aboard her. A ship with no berth of her size
     * left is still in port — her crew still drink in the bar — she just
     * has no hatch on this deck. */
    (opts.others || []).slice(0, 6).forEach(function (o) {
      var want = sizeClass(o.size);
      var k = -1;
      for (var j = 0; j < free.length; j++) if (free[j].size === want) { k = j; break; }
      if (k < 0) return;
      var br = free.splice(k, 1)[0];
      br.other = o;
      var hx = br.side < 0 ? br.x0 + 0.9 : br.x1 - 0.9;
      item('other', hx, (br.z0 + br.z1) / 2, 'Board  ·  ' + (o.name || 'ship'), { other: o, berth: br.id });
    });
    if (!spawn) spawn = { x: 0, z: -6, yaw: 0 };

    var plan = { portId: portId, rooms: rooms, doors: doors, items: items, spawn: spawn };
    if (hangar) plan.hangar = hangar;
    /* Whose port it is (generate.js stampLiveries: civ, navy or syn, and
     * pir should one ever fly it): the walls' colours here, and the whole
     * of the dressing's style. */
    plan.livery = opts.livery || 'civ';
    /* What is in the rooms (dressing.js): furniture, fittings, neon, and
     * the ads - for the bar, and for the outfitters (the yard counter, or
     * opts.outfitter: the nearest port in the system that has one). Its
     * own seeded stream, so this changes nothing above. */
    if (global.Dressing && global.Dressing.apply) global.Dressing.apply(plan, opts.seed || '', { livery: plan.livery, outfitter: opts.outfitter || null });
    return plan;
  }

  /* ---- A SEA PLATFORM'S DECK (2026-11-02) ----------------------------------
   *
   * Astra: "pads that have protected domes ... and a central bar, connected
   * by covered tubes." So the walk is: down her ramp onto the pad under
   * the dome (the hangar), out of the dome's door into the covered tube,
   * along the tube - its real length, opts.sea.tube metres - into the hub,
   * and the hub is the bar, the concourse with the market desk and the
   * crew hall, and the freight office. Then back the same way.
   *
   * `opts.sea`: { tube: m, dome: m (your dome's radius), pads: [{ k,
   * large, mine }] }. Your pad's tube runs along x into the hub's west
   * wall, so placeShip's hangar (which opens on x) is the dome room.
   *
   * WHAT IS NOT LITERAL, said plainly: the deck plan is axis-aligned
   * boxes (the walker's collision is exact for nothing else), so the other
   * pads' tubes leave the hub as stubs on its walls, each ending in the
   * hatch at the far end of that tube - a ship moored on that pad is
   * boarded there - rather than running out at forty-five degrees for
   * 120 m to a dome of their own. Your own tube and dome are the real
   * length and size.
   *
   * No draws from any stream another plan uses: its own stream, keyed
   * apart from the station layout's. */
  var SEA_TUBE_W = 4;          // m: the walkway inside a 9 m tube, floor to the curve
  function seaLayout(portId, opts) {
    var sea = opts.sea, rooms = [], doors = [], items = [];
    function room(id, kind, x0, x1, z0, z1, h, label) {
      var r = { id: id, kind: kind, x0: x0, x1: x1, z0: z0, z1: z1, y0: 0, y1: h, label: label || '' };
      rooms.push(r);
      return r;
    }
    function door(a, b, axis, at, along, w, h) {
      var d = { a: a.id, b: b.id, axis: axis, w: w || DOOR_W, h: h || DOOR_H };
      if (axis === 'z') { d.x0 = along - d.w / 2; d.x1 = along + d.w / 2; d.z0 = at - 0.8; d.z1 = at + 0.8; d.at = at; }
      else { d.z0 = along - d.w / 2; d.z1 = along + d.w / 2; d.x0 = at - 0.8; d.x1 = at + 0.8; d.at = at; }
      doors.push(d);
      return d;
    }
    function item(kind, x, zz, label, extra) {
      var it = { kind: kind, x: x, z: zz, label: label };
      for (var k in (extra || {})) it[k] = extra[k];
      items.push(it);
      return it;
    }
    var TUBE_W = SEA_TUBE_W, TUBE_H = 3.2, tubeLen = Math.max(20, sea.tube || 120);
    /* THE HUB: the concourse in the middle, the bar off its north wall,
     * the crew hall beside it. */
    var cw = 28, cd = 22;
    var conc = room('concourse', 'concourse', -cw / 2, cw / 2, 0, cd, 6, 'Concourse  ·  hub');
    var bar = room('bar', 'bar', -cw / 2 + 1, 0, cd, cd + 12, 3.6, 'The bar');
    door(conc, bar, 'z', cd, -cw / 4, 2.4, DOOR_H);
    var hall = room('crewhall', 'crewhall', 2, cw / 2 - 1, cd, cd + 10, 3.4, 'Crew hall');
    door(conc, hall, 'z', cd, cw / 4, 2.0, DOOR_H);
    item('bar', -cw / 4, cd + 9.4, 'The bar', { counter: [-cw / 4 - 4, cd + 10, -cw / 4 + 4, cd + 10.7],
                                                post: { x: -cw / 4, z: cd + 11.3, yaw: 0 } });
    item('crew', cw / 4 + 1, cd + 8.8, 'Crew hall board', { counter: [cw / 4 - 2, cd + 9.4, cw / 4 + 4, cd + 10] });
    item('market', 6, 1.2, 'Market desk', { counter: [3, 0, 9, 1.4] });
    if (opts.yard) item('yard', -6, 1.2, 'Shipyard counter', { counter: [-9, 0, -3, 1.4] });
    item('freight', cw / 2 - 1.6, cd / 2, 'Freight office', { counter: [cw / 2 - 1.0, cd / 2 - 2, cw / 2, cd / 2 + 2] });

    /* YOUR TUBE, west out of the hub, and your dome at the end of it. */
    var tz = cd / 2;
    var tube = room('tube', 'tube', -cw / 2 - tubeLen, -cw / 2, tz - TUBE_W / 2, tz + TUBE_W / 2, TUBE_H,
                    'Covered tube  ·  to your pad');
    door(tube, conc, 'x', -cw / 2, tz, TUBE_W - 0.4, TUBE_H - 0.2);
    var hs = null;
    (opts.ships || []).forEach(function (s) { if (s.current) hs = s; });
    var domeR = sea.dome || 50;
    var dim = (hs && hs.hangar) ? hangarDims(hs.hangar) : { w: 30, d: 30, h: 14 };
    /* The dome's floor is a circle; the room is the square inside it, at
     * least as big as her hangar wants and no bigger than the dome. */
    var inside = domeR * 1.41;
    dim = { w: Math.min(inside, Math.max(dim.w, 24)), d: Math.min(inside, Math.max(dim.d, 24)), h: Math.max(dim.h, 12) };
    var x1 = tube.x0, br = room('berth0', 'berth', x1 - dim.w, x1, tz - dim.d / 2, tz + dim.d / 2, dim.h,
                                'Pad ' + ((sea.mine || 0) + 1) + '  ·  under the dome');
    br.size = hs ? sizeClass(hs.size) : 'M'; br.side = -1; br.index = 0; br.dome = true;
    door(tube, br, 'x', x1, tz, 3.2, TUBE_H - 0.2);
    var hangar = null, spawn = null;
    if (hs && hs.hangar) {
      hangar = placeShip(br, hs.hangar);
      br.ship = hs;
      var ft = hangar.foot;
      item('mine', ft.x, ft.z, 'Your ship  -  ' + (hs.name || 'ship'), { ship: hs, berth: br.id, silent: true });
      spawn = { x: ft.x + 1.6, z: ft.z, yaw: Math.PI / 2 };
    } else if (hs) {
      var hx = br.x0 + 0.9;
      br.ship = hs;
      item('mine', hx, tz, 'Your ship  ·  ' + (hs.name || 'ship'), { ship: hs, berth: br.id });
      spawn = { x: hx + 1.4, z: tz, yaw: Math.PI / 2 };
    }

    /* THE OTHER PADS' TUBES, as stubs on the hub's walls with the hatch at
     * the far end - see above. Ships moored here are put at them in order. */
    var others = (sea.pads || []).filter(function (p) { return !p.mine; });
    var slots = [];
    [-cw / 2 + 4, 0, cw / 2 - 4].forEach(function (x) { slots.push({ wall: 'S', at: x }); });
    [cd * 0.25, cd * 0.75].forEach(function (z) { slots.push({ wall: 'E', at: z }); });
    [cd * 0.12, cd * 0.88].forEach(function (z) { slots.push({ wall: 'W', at: z }); });
    var STUB = 10, oth = (opts.others || []).slice();
    others.slice(0, slots.length).forEach(function (p, i) {
      var sl = slots[i], r, hxS, hzS, faceIn;
      var label = 'Tube to pad ' + (p.k + 1) + (p.large ? '  ·  large' : '');
      if (sl.wall === 'S') {
        r = room('tube' + p.k, 'tube', sl.at - TUBE_W / 2, sl.at + TUBE_W / 2, -STUB, 0, TUBE_H, label);
        door(r, conc, 'z', 0, sl.at, TUBE_W - 0.4, TUBE_H - 0.2);
        hxS = sl.at; hzS = -STUB + 0.9; faceIn = Math.PI;
      } else if (sl.wall === 'E') {
        r = room('tube' + p.k, 'tube', cw / 2, cw / 2 + STUB, sl.at - TUBE_W / 2, sl.at + TUBE_W / 2, TUBE_H, label);
        door(conc, r, 'x', cw / 2, sl.at, TUBE_W - 0.4, TUBE_H - 0.2);
        hxS = cw / 2 + STUB - 0.9; hzS = sl.at; faceIn = Math.PI / 2;
      } else {
        r = room('tube' + p.k, 'tube', -cw / 2 - STUB, -cw / 2, sl.at - TUBE_W / 2, sl.at + TUBE_W / 2, TUBE_H, label);
        door(r, conc, 'x', -cw / 2, sl.at, TUBE_W - 0.4, TUBE_H - 0.2);
        hxS = -cw / 2 - STUB + 0.9; hzS = sl.at; faceIn = -Math.PI / 2;
      }
      r.side = sl.wall === 'E' ? 1 : -1; r.pad = p.k;
      /* Somebody's ship on that pad, if the timetable has one there. */
      var o = null;
      for (var j = 0; j < oth.length; j++) if (oth[j].pad === p.k) { o = oth.splice(j, 1)[0]; break; }
      if (o) item('other', hxS, hzS, 'Board  ·  ' + (o.name || 'ship') + '  (pad ' + (p.k + 1) + ')', { other: o, berth: r.id });
      else item('padhatch', hxS, hzS, 'Pad ' + (p.k + 1) + '  ·  nobody berthed', { silent: true, faceIn: faceIn });
    });
    if (!spawn) spawn = { x: -cw / 2 - 4, z: tz, yaw: Math.PI / 2 };

    var plan = { portId: portId, rooms: rooms, doors: doors, items: items, spawn: spawn, sea: true };
    if (hangar) plan.hangar = hangar;
    plan.livery = opts.livery || 'civ';
    if (global.Dressing && global.Dressing.apply) global.Dressing.apply(plan, opts.seed || '', { livery: plan.livery, outfitter: opts.outfitter || null });
    return plan;
  }

  /* ---- where you may stand ---------------------------------------------
   * Inside a room, a wall's width (RADIUS) back from its walls; or inside a
   * doorway, a wall's width in from its jambs. Counters are furniture: you
   * stand against them, not in them. */
  function standable(plan, x, z) {
    /* A plan may veto ground of its own (2026-10-26): outside your ship,
     * where her belly comes down too low to walk under; inside, the ramp's
     * well while the ramp is moving. */
    if (plan.blocked && plan.blocked(x, z)) return false;
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

  /* ---- the hangar's geometry ----------------------------------------------
   * `hg` is main.js's measure of her: { box: [x0, z0, x1, z1] (her hull
   * and the ramp's foot, in her cockpit's metres), height (her top above
   * the floor), foot: { x, z } (the ramp's foot), gy (that floor, in her
   * cockpit's metres) }. The room is her box with HANGAR_MARGIN round it,
   * her length running out from the spine. */
  /* 7 m round her and 5 m over her (was 4 and 2, 2026-10-31): enough for
   * the chase camera to swing round her inside the hangar without riding
   * on her hull - main.js clampCameraToDeckHangar keeps the eye in here. */
  var HANGAR_MARGIN = 7;       // m of floor round her
  function hangarDims(hg) {
    var b = hg.box;
    return { w: (b[3] - b[1]) + 2 * HANGAR_MARGIN, d: Math.max(9, (b[2] - b[0]) + 2 * HANGAR_MARGIN),
             h: Math.max(8, (hg.height || 4) + 5) };
  }
  /* Where she stands in the room: her box centred in it, her nose (+z in
   * her frame) pointing away from the spine. A deck point (X, Z) and a
   * point of hers (sx, sz) are a rotation by theta and a shift apart:
   *   X = sx cos + sz sin + X0,   Z = -sx sin + sz cos + Z0,
   * and a heading turns by theta (yaw on the deck = her yaw + theta). */
  function placeShip(br, hg) {
    var th = br.side < 0 ? -Math.PI / 2 : Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    var b = hg.box, hcx = (b[0] + b[2]) / 2, hcz = (b[1] + b[3]) / 2;
    var RX = (br.x0 + br.x1) / 2, RZ = (br.z0 + br.z1) / 2;
    var H = { room: br.id, theta: th, cos: c, sin: s, gy: hg.gy || 0,
              X0: RX - (hcx * c + hcz * s), Z0: RZ - (-hcx * s + hcz * c) };
    var f = toStation(H, hg.foot.x, hg.foot.z);
    H.foot = { x: f.x, z: f.z };
    /* Her hull's footprint on this floor, for the dressing to keep clear. */
    var hb = hg.hull || b, cs = [[hb[0], hb[1]], [hb[2], hb[1]], [hb[2], hb[3]], [hb[0], hb[3]]].map(function (q) { return toStation(H, q[0], q[1]); });
    br.hangar = true;
    br.hullBox = [Math.min.apply(null, cs.map(function (q) { return q.x; })), Math.min.apply(null, cs.map(function (q) { return q.z; })),
                  Math.max.apply(null, cs.map(function (q) { return q.x; })), Math.max.apply(null, cs.map(function (q) { return q.z; }))];
    br.rampFoot = H.foot;
    br.label = br.label.replace(/^Berth/, 'Hangar');
    return H;
  }
  function toStation(H, sx, sz) { return { x: sx * H.cos + sz * H.sin + H.X0, z: -sx * H.sin + sz * H.cos + H.Z0 }; }
  function toShip(H, X, Z) {
    var dx = X - H.X0, dz = Z - H.Z0;
    return { x: dx * H.cos - dz * H.sin, z: dx * H.sin + dz * H.cos };
  }

  /* ---- the walker -------------------------------------------------------- */
  function start(plan) {
    return { plan: plan, x: plan.spawn.x, z: plan.spawn.z, yaw: plan.spawn.yaw, pitch: 0, near: null,
             crouch: 0, gait: 0, phase: 0 };
  }

  /* One step. `keys` is the game's held-key map. Moves are tried one axis
   * at a time, so walking into a wall at an angle slides along it. */
  function step(w, keys, dt) {
    keys = keys || {};
    if (keys.arrowleft) w.yaw -= TURN * dt;
    if (keys.arrowright) w.yaw += TURN * dt;
    if (keys.arrowup) w.pitch = Math.min(1.2, w.pitch + TURN * 0.6 * dt);
    if (keys.arrowdown) w.pitch = Math.max(-LOOK_DOWN, w.pitch - TURN * 0.6 * dt);
    /* Left Ctrl, held: down; let go: up. Eased, not snapped. */
    /* ...or held down for you, where her belly is too low to stand under
     * (main.js hangarWalk sets w.mustCrouch). */
    var cw = (keys.crouch || w.mustCrouch) ? 1 : 0, c0 = w.crouch || 0;
    w.crouch = cw > c0 ? Math.min(cw, c0 + CROUCH_RATE * dt) : Math.max(cw, c0 - CROUCH_RATE * dt);
    var f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    var r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    var x0 = w.x, z0 = w.z;
    if (f || r) {
      var pace = keys.shift && w.crouch < 0.5 ? RUN : WALK;
      pace += (CROUCH - pace) * w.crouch;
      var sp = pace * dt / (f && r ? Math.SQRT2 : 1);
      var sy = Math.sin(w.yaw), cy = Math.cos(w.yaw);
      var dx = (sy * f + cy * r) * sp, dz = (cy * f - sy * r) * sp;
      if (standable(w.plan, w.x + dx, w.z)) w.x += dx;
      if (standable(w.plan, w.x, w.z + dz)) w.z += dz;
    }
    /* The legs' clock: one stride per 1.4 m actually covered (a wall you
     * are pushing into does not walk you on the spot), and the gait eased
     * in and out so a stop is not a freeze mid-step. */
    var moved = Math.hypot(w.x - x0, w.z - z0);
    w.phase = ((w.phase || 0) + moved * Math.PI * 2 / 1.4) % (Math.PI * 2);
    var gw = moved > 1e-5 ? Math.min(1, moved / Math.max(dt, 1e-6) / WALK) : 0;
    w.gait = (w.gait || 0) + (gw - (w.gait || 0)) * Math.min(1, dt * 8);
    w.near = facing(w);
    return w;
  }

  function look(w, dyaw, dpitch) {
    w.yaw += dyaw;
    w.pitch = Math.max(-LOOK_DOWN, Math.min(1.2, w.pitch + dpitch));
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
      var cos = d > 1e-6 ? (dx * fx + dz * fz) / d : 1;
      if (d > 0.2 && cos < 0.35) continue;
      /* An `aim` item (a lift's buttons, 2026-10-25: a row of them a hand
       * apart) is picked by where you are looking, not by which is nearest
       * — or the nearest would always win. */
      var score = it.aim ? (1 - cos) * 8 + d * 0.1 : d;
      if (score < bd) { bd = score; best = it; }
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
    crewhall:  { floor: '#2e3330', wall: '#46504a', ceil: '#222724', trim: '#9fc7d2' },
    cargohall: { floor: '#2c3034', wall: '#3e444b', ceil: '#1c2024', trim: '#d9a521' },
    /* A sea platform's covered tube: pale, with the sea-blue trim of its
     * window strips (render.js seaPlatformMesh). */
    tube:      { floor: '#4a5158', wall: '#9aa6ae', ceil: '#7a868e', trim: '#9fe3ff' }
  };
  /* WHOSE PORT IT IS (2026-10-31, Astra: "stations should vary by
   * faction"). The Navy keeps its ports clean, light and bright; the
   * Syndicate's are near-black with one gold accent (the same language as
   * its people, npcmodel.js); a pirate hole is rust. The bar keeps a
   * darker version of each, being a bar. A civilian port is as it was. */
  var FACTION_PAL = {
    navy: { floor: '#59636f', wall: '#8994a1', ceil: '#4b5561', trim: '#7fc8ff',
            bar: { floor: '#3a424c', wall: '#56616e', ceil: '#2c333b', trim: '#7fc8ff' } },
    syn:  { floor: '#17171b', wall: '#222226', ceil: '#0e0e10', trim: '#c9a227',
            bar: { floor: '#140d0a', wall: '#22150f', ceil: '#0c0807', trim: '#c9a227' } },
    pir:  { floor: '#2b2420', wall: '#3d3027', ceil: '#1a1410', trim: '#ff5a3c',
            bar: { floor: '#231a14', wall: '#33251c', ceil: '#140e0a', trim: '#ff5a3c' } }
  };
  function palFor(plan, room) {
    var base = PAL[room.kind] || PAL.corridor, f = FACTION_PAL[plan && plan.livery];
    if (!f) return base;
    var o = room.kind === 'bar' ? f.bar : f;
    return { floor: o.floor, wall: o.wall, ceil: o.ceil, trim: o.trim || base.trim };
  }
  var TILE = 2;

  /* How high your eye is now: the body's eyes when there is a body
   * (selfFigure sets w.bodyEye each frame it poses you), otherwise eased
   * between standing and CROUCH_EYE. */
  function eyeOf(w) {
    if (w && typeof w.bodyEye === 'number') return w.bodyEye;
    var c = (w && w.crouch) || 0;
    c = c * c * (3 - 2 * c);
    return EYE + (CROUCH_EYE - EYE) * c;
  }

  function camera(w, W, H) {
    var cp = Math.cos(w.pitch), sp = Math.sin(w.pitch);
    var f = [Math.sin(w.yaw) * cp, sp, Math.cos(w.yaw) * cp];
    var r = [Math.cos(w.yaw), 0, -Math.sin(w.yaw)];
    var u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    return { eye: [w.x, eyeOf(w), w.z], f: f, r: r, u: u, cx: W / 2, cy: H / 2, flen: H * 0.85 };
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
    var pal = palFor(plan, room);
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
    if (room.kind === 'tube') tubeQuads(room, out, pal);
    /* Ceiling light strips down the long axis - not in a room lit by its
     * own lamps (dressing.js noStrip: the bar). */
    if (room.noStrip) return;
    var long = (room.x1 - room.x0) > (room.z1 - room.z0);
    var cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2, y = room.y1 - 0.02;
    var strip = long
      ? [[room.x0 + 1, y, cz - 0.25], [room.x0 + 1, y, cz + 0.25], [room.x1 - 1, y, cz + 0.25], [room.x1 - 1, y, cz - 0.25]]
      : [[cx - 0.25, y, room.z0 + 1], [cx - 0.25, y, room.z1 - 1], [cx + 0.25, y, room.z1 - 1], [cx + 0.25, y, room.z0 + 1]];
    out.push({ pts: strip, col: '#e8f4ff', bias: -0.05 });
  }

  /* A SEA PLATFORM'S COVERED TUBE (2026-11-02): the room is a box (the
   * walker's collision is boxes), and this dresses it as the tube it is.
   * Chamfer panels across all four long edges make the section an
   * octagon; down both flanks runs a glazed strip, pane by pane between
   * mullions, each pane the sea and sky outside it - painted, lit, a
   * horizon across it - since the deck view draws no world through a wall.
   * That is the one cheat here, and it is said. */
  var TUBE_CHAMFER = 0.9;      // m, across each long edge
  function tubeQuads(room, out, pal) {
    var alongX = (room.x1 - room.x0) >= (room.z1 - room.z0);
    var a0 = alongX ? room.x0 : room.z0, a1 = alongX ? room.x1 : room.z1;
    var w0 = alongX ? room.z0 : room.x0, w1 = alongX ? room.z1 : room.x1;
    var h = room.y1, c = TUBE_CHAMFER, IN = 0.02;
    /* [along, height, across] to [x, y, z]. */
    function P(al, y, ac) { return alongX ? [al, y, ac] : [ac, y, al]; }
    function quad(pts, col, lit) { out.push({ pts: pts, col: col, lit: !!lit, bias: lit ? 0 : undefined }); }
    var ceilC = shade(pal.ceil, 1.1), floorC = shade(pal.floor, 0.85);
    [[w0, 1], [w1, -1]].forEach(function (wall) {
      var w = wall[0], sd = wall[1];
      /* The chamfers: the wall's top meets the ceiling on a slant, the
       * floor's edge meets the wall on another. */
      quad([P(a0, h - c, w + sd * IN), P(a1, h - c, w + sd * IN), P(a1, h - IN, w + sd * c), P(a0, h - IN, w + sd * c)], ceilC);
      quad([P(a0, c * 0.5, w + sd * IN), P(a1, c * 0.5, w + sd * IN), P(a1, IN, w + sd * c * 0.5), P(a0, IN, w + sd * c * 0.5)], floorC);
      /* The glazing: panes 2.6 m long, 0.35 m mullions, from 1.0 m to
       * 2.25 m up; sky above the horizon at 1.55 m, sea below. */
      var y0 = 1.0, yH = 1.55, y1 = Math.min(h - c - 0.1, 2.25), off = w + sd * IN * 2;
      for (var x = a0 + 1.0; x + 2.6 <= a1 - 1.0; x += 2.95) {
        quad([P(x, yH, off), P(x + 2.6, yH, off), P(x + 2.6, y1, off), P(x, y1, off)], '#4a7fa6', true);
        quad([P(x, y0, off), P(x + 2.6, y0, off), P(x + 2.6, yH, off), P(x, yH, off)], '#1f4a6b', true);
        quad([P(x, yH - 0.015, off + sd * 0.002), P(x + 2.6, yH - 0.015, off + sd * 0.002),
              P(x + 2.6, yH + 0.015, off + sd * 0.002), P(x, yH + 0.015, off + sd * 0.002)], '#9cc6dc', true);
      }
    });
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
    var z = it.z, col = it.kind === 'mine' ? '#7fd6c0' : it.kind === 'fleet' ? '#d9a521' : it.kind === 'other' ? '#9aa6b4' : '#556';
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
      if (it.counter && !it.prop) boxQuads(it.counter, 0, 1.05, it.kind === 'bar' ? '#6b4a33' : '#3f5560', quads);
      if (it.ship || it.other) hatchQuads(it, r, quads);
    });
    if (plan.dress) Object.keys(show).forEach(function (id) {
      var dq = plan.dress[id];
      if (dq) for (var di = 0; di < dq.length; di++) quads.push(dq[di]);
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
    /* AND EVERY WALL STANDS A FEW MILLIMETRES INTO ITS OWN ROOM (2026-11-02).
     * Astra, at the bar on Downwell Bunker's concourse: "the door is
     * glitchy". Two rooms that share a wall each build that wall at the
     * same plane — the concourse's x0 and the bar's x1 are both x = -13 —
     * and the GPU culls nothing, so the two faces were drawn at one depth
     * and fought for every pixel round the doorway, the light concourse
     * wall and the dark bar wall flickering through each other as you
     * moved. Stood WALL_INSET into its own room, each room's wall is the
     * nearer one from inside that room, and the fight is over. The trim
     * stays a centimetre further in still, in front of its own wall. */
    var WALL_INSET = 0.006;
    var onPlane = function (q, r) {
      var axes = [['x', 0, r.x0, 1], ['x', 0, r.x1, -1], ['z', 2, r.z0, 1], ['z', 2, r.z1, -1]];
      for (var a = 0; a < axes.length; a++) {
        var k = axes[a][1], at = axes[a][2];
        if (q.pts.every(function (p) { return Math.abs(p[k] - at) < 1e-6; })) return axes[a];
      }
      return null;
    };
    plan.rooms.forEach(function (r) {
      var from = quads.length;
      roomQuads(plan, r, quads);
      for (var w0 = from; w0 < quads.length; w0++) {
        if (quads[w0].bias) continue;            // the trim: its own centimetre, below
        var ax = onPlane(quads[w0], r);
        if (!ax) continue;
        quads[w0].pts = quads[w0].pts.map(function (p) { var q = p.slice(); q[ax[1]] += ax[3] * WALL_INSET; return q; });
      }
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
      if (it.counter && !it.prop) boxQuads(it.counter, 0, 1.05, it.kind === 'bar' ? '#6b4a33' : '#3f5560', quads);
      if (it.ship || it.other) hatchQuads(it, r, quads);
    });
    if (plan.dress) Object.keys(plan.dress).forEach(function (id) {
      plan.dress[id].forEach(function (q) { quads.push(q); });
    });
    var m = { v: [], f: [], c: [] };
    quads.forEach(function (q) {
      var col = hexOf(q.col), lit = q.lit || col.toLowerCase() === '#e8f4ff' || (q.bias || 0) <= -0.04;
      var n = m.v.length;
      q.pts.forEach(function (p) { m.v.push([p[0], p[1], p[2]]); });
      for (var i = 1; i + 1 < q.pts.length; i++) { m.f.push([n, n + i, n + i + 1]); m.c.push((lit ? '!' : '') + col); }
    });
    plan._mesh = m;
    return m;
  }

  /* ---- your own body (2026-10-31) -------------------------------------
   * Astra: "Can we give the player first person view a body when we look
   * down?" The same generator the crew are built by (npcmodel.js), in a
   * pilot's pressure suit, posed every frame from what walk.js already
   * knows: the stride clock, the gait, the crouch.
   *
   * THE HEAD IS NOT DRAWN. The camera is where the eyes are, so the head
   * would be the inside of a helmet an inch from the lens. The body is cut
   * off at the collar; what you see is what you would see of yourself:
   * chest, arms, legs, boots.
   *
   * THE BODY IS FITTED TO THE EYE, not the eye to the body. A body comes in
   * a few centimetres either side of 1.65 m at the eyes, so it is scaled
   * about the feet until its eyes are at EYE. Crouched, the feet are put on
   * the floor (the lowest boot vertex, measured each frame) and the camera
   * goes where the crouched body's eyes then are - w.bodyEye - so the two
   * can never disagree about how low you are. */
  var SELF = { key: null, model: null, feet: null, eye: null, fit: 1 };
  var CHIN = 1.50;             // rest-pose metres per unit height: the cut

  function selfModel(name, liv) {
    var NM = global.NpcModel;
    if (!NM || !NM.build) return null;
    var key = name + '|' + liv;
    if (SELF.key === key) return SELF.model;
    var m = NM.build('pilot', name, liv);
    if (!m) return null;
    var h = (m.look && m.look.h) || 1, cut = CHIN * h;
    var keep = [];
    for (var t = 0; t < m.tris; t++) {
      var hi = Math.max(m.pos[t * 9 + 1], m.pos[t * 9 + 4], m.pos[t * 9 + 7]);
      if (hi <= cut) keep.push(t);
    }
    var out = {};
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k) && k.charAt(0) !== '_') out[k] = m[k];
    out.pos = new m.pos.constructor(keep.length * 9);
    out.uv = new m.uv.constructor(keep.length * 6);
    out.bone = new m.bone.constructor(keep.length * 3);
    out.emis = new m.emis.constructor(keep.length * 3);
    keep.forEach(function (t, j) {
      for (var i = 0; i < 9; i++) out.pos[j * 9 + i] = m.pos[t * 9 + i];
      for (var i2 = 0; i2 < 6; i2++) out.uv[j * 6 + i2] = m.uv[t * 6 + i2];
      for (var i3 = 0; i3 < 3; i3++) { out.bone[j * 3 + i3] = m.bone[t * 3 + i3]; out.emis[j * 3 + i3] = m.emis[t * 3 + i3]; }
    });
    out.tris = keep.length; out.count = keep.length * 3; out.self = true;
    /* The boot vertices, for putting the feet on the floor. */
    var ankles = [m.bones.names.indexOf('ankleL'), m.bones.names.indexOf('ankleR')];
    var feet = [];
    for (var v = 0; v < out.count; v++) if (ankles.indexOf(out.bone[v]) >= 0) feet.push(v);
    var F = (NM.HEAD_FIT && (NM.HEAD_FIT.pilot || NM.HEAD_FIT._)) || { eye: 1.644, front: 0.168 };
    SELF.key = key; SELF.model = out; SELF.feet = feet;
    /* Where the camera goes, in the rest pose, riding the torso (bone 0):
     * at the eyes' height and a few centimetres IN FRONT of the visor. A
     * real eye is ahead of the chest, so looking down you see the outside
     * of it; put the camera where the model's eyes are and it sits just
     * behind the chest line, and looking down looks into the collar
     * (2026-10-31, the first probe: a yellow ring filling the view). */
    SELF.eye = [0, F.eye * h, (F.front + 0.04) * h];
    SELF.fit = EYE / (F.eye * h);
    return out;
  }

  /* Left-multiply every bone matrix by "scale s about point p". */
  function scaleAbout(mats, n, s, px, py, pz) {
    for (var b = 0; b < n; b++) {
      var o = b * 16;
      for (var c = 0; c < 4; c++) {
        var i = o + c * 4, w = mats[i + 3];
        mats[i] = px * w + s * (mats[i] - px * w);
        mats[i + 1] = py * w + s * (mats[i + 1] - py * w);
        mats[i + 2] = pz * w + s * (mats[i + 2] - pz * w);
      }
    }
  }
  function apply(mats, b, p) {
    var o = b * 16;
    return [mats[o] * p[0] + mats[o + 4] * p[1] + mats[o + 8] * p[2] + mats[o + 12],
            mats[o + 1] * p[0] + mats[o + 5] * p[1] + mats[o + 9] * p[2] + mats[o + 13],
            mats[o + 2] * p[0] + mats[o + 6] * p[1] + mats[o + 10] * p[2] + mats[o + 14]];
  }

  /* The pose: npc.js's walk cycle, blended into a squat by the crouch. */
  function selfPose(w) {
    var g = w.gait || 0, ph = w.phase || 0, c = w.crouch || 0;
    c = c * c * (3 - 2 * c);
    var sw = Math.sin(ph), sw2 = Math.sin(ph + Math.PI), st = 1 - c * 0.6;
    var o = { x: 0, y: 0, z: 0, yaw: w.yaw, sink: 0, lean: 0.32 * c };
    o.hipL = g * 0.42 * sw * st + c * 1.45; o.hipR = g * 0.42 * sw2 * st + c * 1.45;
    o.kneeL = g * 0.55 * Math.max(0, Math.sin(ph - 0.9)) * st + c * 2.15;
    o.kneeR = g * 0.55 * Math.max(0, Math.sin(ph + Math.PI - 0.9)) * st + c * 2.15;
    o.ankleL = c * 0.7; o.ankleR = c * 0.7;
    o.shL = g * 0.35 * sw2 * st + c * 0.35; o.shR = g * 0.35 * sw * st + c * 0.35;
    o.elbowL = 0.15 + g * 0.2 + c * 0.5; o.elbowR = 0.15 + g * 0.2 + c * 0.5;
    return o;
  }

  /* This frame's figure for npcgl.js / the 2D painter: { model, mats,
   * person }, in the same metres as the deck, the feet on floorY. Sets
   * w.bodyEye (relative to floorY's deck, like EYE) for the camera. */
  function selfFigure(w, floorY, name, liv) {
    var NM = global.NpcModel;
    var m = selfModel(name || 'Commander', liv || 'civ');
    if (!m || !NM || !NM.skin) { delete w.bodyEye; return null; }
    var n = m.bones.names.length;
    w._selfMats = NM.skin(m, selfPose(w), w._selfMats);
    var mats = w._selfMats;
    scaleAbout(mats, n, SELF.fit, 0, 0, 0);
    /* Feet on the floor. */
    var lo = Infinity;
    for (var i = 0; i < SELF.feet.length; i++) {
      var v = SELF.feet[i], q = apply(mats, m.bone[v], [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]]);
      if (q[1] < lo) lo = q[1];
    }
    if (!isFinite(lo)) lo = 0;
    var e = apply(mats, 0, SELF.eye);
    /* Eyes over the walker's position, boots on the deck. */
    var tx = w.x - e[0], ty = floorY - lo, tz = w.z - e[2];
    for (var b = 0; b < n; b++) { mats[b * 16 + 12] += tx; mats[b * 16 + 13] += ty; mats[b * 16 + 14] += tz; }
    w.bodyEye = e[1] - lo;
    return { model: m, mats: mats, person: { id: 'self', x: w.x, z: w.z, self: true } };
  }

  var Walk = {
    EYE: EYE, RADIUS: RADIUS, WALK: WALK, RUN: RUN, REACH: REACH,
    CROUCH_EYE: CROUCH_EYE, CROUCH: CROUCH, eyeOf: eyeOf, selfFigure: selfFigure, selfPose: selfPose,
    hangarToShip: toShip, hangarToStation: toStation, HANGAR_MARGIN: HANGAR_MARGIN,
    layout: layout, standable: standable, roomAt: roomAt,
    start: start, step: step, look: look, facing: facing, draw: draw,
    sizeClass: sizeClass, meshFor: meshFor
  };

  global.Walk = Walk;
  if (typeof module !== 'undefined' && module.exports) module.exports = Walk;
})(typeof window !== 'undefined' ? window : globalThis);
