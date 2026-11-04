/* npc.js — who is aboard, who is on the deck, and what each of them is
 * doing (2026-10-25).
 *
 * Astra: "We should use these crew models on ships and stations in game, in
 * the first person mode. They should also be on NPC ships. Give them each a
 * basic AI script so they do their assigned jobs by class."
 *
 * THREE KINDS OF PEOPLE, and where they come from — nobody is invented for
 * decoration where the game already knows who is there:
 *
 *   - YOUR CREW are the people on your ship's roster (crew.js), by name and
 *     role. They stand their watches at the stations shipdeck.js built for
 *     them, sleep in the bunks it gave them, and eat in its galley.
 *   - A STATION'S PEOPLE are its staff (a clerk at the market desk, one at
 *     the yard counter where there is a yard, a bartender, a hall steward),
 *     its security — whose colours say whose port it is — and the hands in
 *     the crew hall, who are exactly Crew.forHire's list for that port and
 *     week: the person you talk to on the deck is the person you can hire.
 *   - CREWS OF OTHER SHIPS are the traffic moored at the port right now
 *     (Sim.berthOccupants): each ship's people, in its owner's livery, some
 *     working her berth and some in the bar. crewForShip() is the same
 *     roster for any NPC ship, so boarding, when it comes, finds the same
 *     faces that were drinking on the concourse.
 *
 * THE SCRIPTS are small and deliberately so: a role is a list of places to
 * be and what to do there, and a person walks between them through the
 * plan's own doors. On a ship the watch runs on the GAME clock — eight-hour
 * watches, staggered by person, so at any hour two-thirds of the crew is on
 * station — and the fidgeting runs on the wall clock, like the walking.
 *
 * Determinism (doctrine 1 and 2): every choice is drawn from a stream keyed
 * on the person and the decision's index, never Math.random(), and no draw
 * comes from any stream another module relies on.
 *
 * Plans are walk.js's: rooms, doors and items as axis-aligned boxes in
 * metres, x across and z forward, the deck at y = 0. A person stands where
 * the player could (Walk.standable), and goes from room to room only
 * through doors — the same rule the player walks by.
 */
(function (global) {
  'use strict';

  var RNG_KEY = 'npc';
  var WALK_SPEED = 1.25, RUN_SPEED = 2.6;     // m/s
  var TURN_RATE = 5;                           // rad/s
  var STRIDE = 1.35;                           // m per full walk cycle
  var WATCH = 8 * 3600;                        // s of game time
  var PERSONAL = 0.55;                         // m, how close two bodies stand

  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /* One number in [0,1) for (key, n): every decision a person makes is
   * keyed on who they are and which decision it is, so the same deck at
   * the same moment is the same scene. */
  function draw(key, n) {
    var a = hash(RNG_KEY + '|' + key + '|' + n) || 1;
    a = (a + 0x6D2B79F5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pickOf(arr, key, n) { return arr[Math.floor(draw(key, n) * arr.length) % arr.length]; }

  /* ---- liveries ---------------------------------------------------------
   * Whose colours a crew wears, from what the game knows about the ship or
   * the port. The faction id 'outlaw' is the Syndicate (galaxy.js keeps the
   * literal id); the pirate bands are 'pb0'..; a navy hull or a patrol is
   * Navy; everything else is civilian, which has no uniform. */
  function liveryFor(info) {
    info = info || {};
    var fac = String(info.faction || ''), cls = String(info.cls || info.kind || '').toLowerCase();
    if (info.livery === 'syn' || info.livery === 'navy') return info.livery;
    if (/pirate|raider/.test(cls) || /^pb\d/.test(fac)) return 'pir';
    if (fac === 'outlaw' || /enforcer|syndicate|runner/.test(cls)) return 'syn';
    if (/navy|police|patrol|cutter|garrison|capital|carrier/.test(cls)) return 'navy';
    return 'civ';
  }

  /* ---- what each role does ---------------------------------------------
   * `body` is the npcmodel role key. Ship-crew roles wear the ship's
   * livery; the faction roles (enforcer, marine, raider …) wear their own. */
  var LINES = {
    pilot: ['She handles light today.', 'I can take her out the moment you say.', 'Traffic control is slow again.',
            'Keep the nose clean on the way in and she will thank you.'],
    engineer: ['Plant is steady. Do not push the drive past her rating.', 'Couplings are warm but holding.',
               'If something rattles, tell me before it stops rattling.', 'Coolant loop is topped up.'],
    gunner: ['Turret is clear and traversing.', 'Give me a lead and I will give you a hole in it.',
             'Ammunition counted twice.', 'Quiet watch so far.'],
    security: ['Move along, please.', 'Keep it civil on my deck.', 'Report anything that looks wrong.'],
    tactical: ['This lock is covered.', 'Nobody cuts in on my watch.', 'Stand clear of the hatch.'],
    medic: ['Sleep, fluids, and stop picking at it.', 'Shout if anything hurts.', 'Kit is restocked.'],
    loadmaster: ['Mind the clamps.', 'Cargo is lashed and logged.', 'Do not stand under the load.'],
    enforcer: ['Business is good when everybody behaves.', 'You are not here to make trouble, are you.'],
    heavy: ['Keep walking.'],
    fixer: ['Not here. Not now.', 'If you want something, you will know who to ask.'],
    factor: ['Buy where they make it, sell where they want it. The rest is timing.', 'Our boards are fresher than the terminal\'s.',
             'A quarter is a long time in a market, and not long at all on a ledger.'],
    marine: ['Papers in order, I hope.', 'Keep your hands where I can see them.'],
    officer: ['Customs is closed to complaints.', 'Fly straight and we will never meet again.'],
    raider: ['What are you looking at.'],
    captain: ['Everything has a price.'],
    clerk: ['The desk is open.', 'Prices are on the board.'],
    bartender: ['What will it be?', 'Quiet night.'],
    steward: ['The board lists who is looking for a berth.']
  };

  /* ---- a person ---------------------------------------------------------- */
  function person(id, name, body, liv, role, extra) {
    var p = {
      id: id, name: name, body: body, liv: liv || 'civ', role: role || body,
      x: 0, z: 0, yaw: 0, path: [], goal: null, act: 'stand', until: 0, n: 0,
      phase: draw(id, 'phase') * 6.28, gait: 0, sit: 0, lie: 0, work: 0, wait: 0,
      model: null, mats: null, line: 0
    };
    for (var k in (extra || {})) p[k] = extra[k];
    return p;
  }

  /* ---- the plan, as places to go ----------------------------------------- */
  function roomAt(plan, x, z) {
    for (var i = 0; i < plan.rooms.length; i++) {
      var r = plan.rooms[i];
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
    }
    return null;
  }
  function roomById(plan, id) {
    for (var i = 0; i < plan.rooms.length; i++) if (plan.rooms[i].id === id) return plan.rooms[i];
    return null;
  }
  function roomsOfKind(plan, kind) { return plan.rooms.filter(function (r) { return r.kind === kind; }); }
  function itemsOfKind(plan, kind) { return plan.items.filter(function (it) { return it.kind === kind; }); }

  /* A door's two sides: a point just inside each room, square to the wall,
   * and the middle of the doorway. */
  function doorPoints(plan, d, fromId) {
    var mid, a, b, ax = d.axis;
    if (ax === 'z') {
      var cx = (d.x0 + d.x1) / 2, at = d.wall ? (d.wall[0] + d.wall[1]) / 2 : d.at;
      mid = { x: cx, z: at };
      var lo = d.wall ? Math.min(d.wall[0], d.wall[1]) : at, hi = d.wall ? Math.max(d.wall[0], d.wall[1]) : at;
      a = { x: cx, z: lo - 0.55 }; b = { x: cx, z: hi + 0.55 };
    } else {
      var cz = d.zc !== undefined ? d.zc : (d.z0 + d.z1) / 2, atx = d.wall ? (d.wall[0] + d.wall[1]) / 2 : d.at;
      mid = { x: atx, z: cz };
      var lx = d.wall ? Math.min(d.wall[0], d.wall[1]) : atx, hx = d.wall ? Math.max(d.wall[0], d.wall[1]) : atx;
      a = { x: lx - 0.55, z: cz }; b = { x: hx + 0.55, z: cz };
    }
    /* Order the two sides so the walk enters from `fromId`'s side. */
    var ra = roomAt(plan, a.x, a.z);
    if (ra && ra.id !== fromId) { var t = a; a = b; b = t; }
    return [a, { x: mid.x, z: mid.z, door: d.id }, b];
  }

  /* Rooms to cross, breadth-first through doors. */
  function roomRoute(plan, fromId, toId) {
    if (fromId === toId) return [];
    var prev = {}, seen = {}, q = [fromId];
    seen[fromId] = true;
    while (q.length) {
      var id = q.shift();
      if (id === toId) break;
      for (var i = 0; i < plan.doors.length; i++) {
        var d = plan.doors[i], nx = d.a === id ? d.b : d.b === id ? d.a : null;
        if (!nx || seen[nx]) continue;
        seen[nx] = true; prev[nx] = { room: id, door: d }; q.push(nx);
      }
    }
    if (!seen[toId]) return null;
    var hops = [];
    for (var at = toId; at !== fromId; at = prev[at].room) hops.unshift(prev[at]);
    return hops;
  }

  /* Furniture in the way of a straight line: one step round the nearer
   * end of it. Enough for a room with a counter in it; rooms are convex, so
   * nothing else can be. */
  function detour(plan, a, b) {
    for (var i = 0; i < plan.items.length; i++) {
      var c = plan.items[i].counter;
      if (!c) continue;
      var x0 = c[0] - 0.4, z0 = c[1] - 0.4, x1 = c[2] + 0.4, z1 = c[3] + 0.4;
      if (!segBox(a, b, x0, z0, x1, z1)) continue;
      if (inBox(a, x0, z0, x1, z1) || inBox(b, x0, z0, x1, z1)) continue;
      var corners = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }].filter(function (p) {
        return standable(plan, p.x, p.z);
      });
      corners.sort(function (p, q) { return (dist(a, p) + dist(p, b)) - (dist(a, q) + dist(q, b)); });
      if (corners.length) return corners[0];
    }
    return null;
  }
  function inBox(p, x0, z0, x1, z1) { return p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1; }
  function segBox(a, b, x0, z0, x1, z1) {
    var t0 = 0, t1 = 1, dx = b.x - a.x, dz = b.z - a.z;
    var p = [-dx, dx, -dz, dz], q = [a.x - x0, x1 - a.x, a.z - z0, z1 - a.z];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      var r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t0 < t1;
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function standable(plan, x, z) { var W = global.Walk; return W ? W.standable(plan, x, z) : !!roomAt(plan, x, z); }

  function route(plan, from, to) {
    var ra = roomAt(plan, from.x, from.z), rb = roomAt(plan, to.x, to.z);
    var pts = [];
    if (ra && rb && ra.id !== rb.id) {
      var hops = roomRoute(plan, ra.id, rb.id);
      if (!hops) return [to];
      hops.forEach(function (h) { pts = pts.concat(doorPoints(plan, h.door, h.room)); });
    }
    pts.push({ x: to.x, z: to.z });
    /* Round any counter between consecutive points. */
    var out = [], at = { x: from.x, z: from.z };
    pts.forEach(function (p) {
      var d = p.door ? null : detour(plan, at, p);
      if (d) out.push(d);
      out.push(p); at = p;
    });
    return out;
  }

  /* A standable spot in a room, drawn from the person's stream. */
  function spotIn(plan, room, key, n, margin) {
    margin = margin || 0.7;
    for (var tries = 0; tries < 12; tries++) {
      var x = room.x0 + margin + draw(key, n + '|x' + tries) * Math.max(0.01, room.x1 - room.x0 - 2 * margin);
      var z = room.z0 + margin + draw(key, n + '|z' + tries) * Math.max(0.01, room.z1 - room.z0 - 2 * margin);
      if (standable(plan, x, z)) return { x: x, z: z };
    }
    return { x: (room.x0 + room.x1) / 2, z: (room.z0 + room.z1) / 2 };
  }

  /* ---- the ship's watch bill ---------------------------------------------
   * Who is on station now: an eight-hour watch on the game clock, offset
   * per person, on two of every three watches. Off watch, a person is in
   * their bunk or the galley. */
  function onWatch(p, t) {
    var k = Math.floor((t / WATCH) + draw(p.id, 'watch') * 3);
    return (k % 3) !== 2;
  }

  /* ---- building a scene -------------------------------------------------- */
  /* Your crew, aboard. `ship` is G.ship; `plan` the deck shipdeck.js built
   * for her. Engineers and gunners take the stations of their kind, in
   * roster order; a pilot takes the helm when you are out of it. */
  function shipScene(plan, ship, opts) {
    opts = opts || {};
    var CrewM = global.Crew;
    var roster = (CrewM && CrewM.aboard) ? CrewM.aboard(ship) : (ship && ship.crew) || [];
    var liv = liveryFor({ livery: ship && ship.livery, faction: ship && ship.liveryFaction });
    /* Assigned off the whole ship: on a decked hull `plan` is one deck. */
    var W = plan.ship || plan;
    var stations = { engineer: [], gunner: [] };
    itemsOfKind(W, 'station').forEach(function (it) { if (stations[it.role]) stations[it.role].push(it); });
    var used = { engineer: 0, gunner: 0 };
    /* The turret's seat (2026-10-25) goes to the gunner the turret takes —
     * the best one, as crew.js turretCrewing chooses — and every other
     * gunner works the forward guns from a bridge gunnery station (crew.js
     * gunnery). On an S ship, the second seat — a co-pilot's or a gunner's
     * console — goes to whoever fits it, and failing that to anybody. */
    var turrets = itemsOfKind(W, 'turret').slice(), tUsed = 0;
    var gy = CrewM && CrewM.gunnery ? CrewM.gunnery(ship) : null;
    var onMount = {};
    if (gy) gy.mounts.forEach(function (c) { onMount[c.id || c.name] = true; });
    var spare = itemsOfKind(W, 'copilot').concat(W.size === 'S' ? itemsOfKind(W, 'station') : []);
    var taken = [];
    var people = roster.map(function (c, i) {
      var role = (c.role === 'engineer' || c.role === 'gunner' || c.role === 'pilot') ? c.role : 'engineer';
      var p = person('crew|' + (c.id || c.name), c.name, role, liv, role, { crew: c, rating: c.rating });
      if (role === 'gunner' && tUsed < turrets.length && (!gy || onMount[c.id || c.name])) { p.turret = turrets[tUsed++]; return p; }
      /* One person to a seat. A second gunner for a one-gunner hull still
       * stands the watch — at the shoulder of whoever has the seat. */
      var list = stations[role];
      if (role === 'pilot') list = itemsOfKind(W, 'copilot');
      if (list && list.length) {
        if (used[role] < list.length) p.station = list[used[role]];
        else p.assist = list[used[role] % list.length];
        used[role]++;
      }
      if (p.station) taken.push(p.station);
      return p;
    });
    people.forEach(function (p) {
      if (p.station || p.turret) return;
      var free = spare.filter(function (it) { return taken.indexOf(it) < 0; })[0];
      if (free) { p.station = free; p.assist = null; taken.push(free); }
    });
    people.forEach(function (p, i) {
      p.bunk = W.bunkAt && W.bunkAt.length ? W.bunkAt[i % W.bunkAt.length] : null;
      p.upper = W.bunkAt && W.bunkAt.length ? (Math.floor(i / W.bunkAt.length) % 2 === 1) : false;
      return p;
    });
    var sc = { kind: 'ship', plan: plan, people: people, floorY: plan.floorY || 0, key: opts.key || '',
               deck: plan.deck || null, car: plan.deck ? roomById(plan, 'lift-' + plan.deck) : null };
    people.forEach(function (p) { placeAtStart(sc, p, opts.t || 0); });
    return sc;
  }

  /* SOMEBODY ELSE'S SHIP, with you aboard her (2026-10-28).
   *
   * Astra chose boarding to come next, and the faces on her deck are the
   * ones crewForShip has always promised: the same ids, names and bodies
   * that were drinking on the concourse, so the engineer you bought a round
   * for is the engineer at her drive console. `info` is what crewForShip
   * takes ({ id, name, faction, cls, souls, size }) plus `route`, so each
   * of them can speak for their captain the way they do in the bar.
   *
   * Who works where follows the hull's own consoles, as your crew do, with
   * two differences that are hers and not yours: the first of them (her
   * master — captain, officer, enforcer) holds the helm, since nobody aboard
   * is waiting for you to sit in it; and the hands with no console of their
   * kind stand their watch in a room that suits them — marines and security
   * at the airlock, a loadmaster in the hold, a medic in the medbay. */
  var GUARD_ROOM = { marine: 'airlock', security: 'airlock', tactical: 'airlock', heavy: 'airlock',
                     raider: 'cargo', loadmaster: 'cargo', medic: 'medbay', officer: 'passage',
                     enforcer: 'passage', captain: 'passage' };
  function visitScene(plan, info, opts) {
    opts = opts || {};
    var W = plan.ship || plan;
    var crew = crewForShip(info);
    var stations = { engineer: [], gunner: [] };
    itemsOfKind(W, 'station').forEach(function (it) { if (stations[it.role]) stations[it.role].push(it); });
    var used = { engineer: 0, gunner: 0 }, turrets = itemsOfKind(W, 'turret').slice(), tUsed = 0;
    var copilots = itemsOfKind(W, 'copilot'), cUsed = 0;
    var extraBase = { shipName: info.name || '', ship: info.name || '', route: info.route || null, aboard: true };
    var people = crew.map(function (c, i) {
      var extra = {};
      for (var k in extraBase) extra[k] = extraBase[k];
      extra.master = i === 0;
      var p = person(c.id, c.name, c.body, c.liv, c.role, extra);
      if (i === 0) { p.helmSeat = true; return p; }
      if (c.role === 'gunner' && tUsed < turrets.length) { p.turret = turrets[tUsed++]; return p; }
      if (c.role === 'pilot' && cUsed < copilots.length) { p.station = copilots[cUsed++]; return p; }
      var list = stations[c.role];
      if (list && used[c.role] < list.length) { p.station = list[used[c.role]++]; return p; }
      p.guard = GUARD_ROOM[c.role] || 'passage';
      return p;
    });
    people.forEach(function (p, i) {
      p.bunk = W.bunkAt && W.bunkAt.length ? W.bunkAt[i % W.bunkAt.length] : null;
      p.upper = W.bunkAt && W.bunkAt.length ? (Math.floor(i / W.bunkAt.length) % 2 === 1) : false;
    });
    var sc = { kind: 'ship', plan: plan, people: people, floorY: plan.floorY || 0, key: 'visit|' + (info.id || info.name),
               deck: plan.deck || null, car: plan.deck ? roomById(plan, 'lift-' + plan.deck) : null, visit: true };
    people.forEach(function (p) { placeAtStart(sc, p, opts.t || 0); });
    return sc;
  }

  /* A port's people. `port` and `sys` are the game's; `opts` carries the
   * clock, whether the port has a yard, and who controls it. */
  function stationScene(plan, port, sys, opts) {
    opts = opts || {};
    var t = opts.t || 0, key = 'port|' + (opts.seed || '') + '|' + (port && port.id);
    var people = [];
    var conc = roomById(plan, 'concourse'), bar = roomById(plan, 'bar'), hall = roomById(plan, 'crewhall'),
        spine = roomById(plan, 'spine'), lport = roomById(plan, 'lport');
    /* Whose port: the livery generate.js stamped on it (stampLiveries) —
     * the same answer the building's own paint gives. */
    var portLiv = opts.livery || liveryFor({ faction: opts.faction });
    var staffName = function (role) { return nameFrom(key + '|' + role); };

    /* Staff, at their counters. */
    itemsOfKind(plan, 'market').forEach(function (it) {
      people.push(person(key + '|clerk', staffName('clerk'), 'pilot', 'civ', 'clerk', { post: postBy(plan, it), staff: 'Market clerk' }));
    });
    itemsOfKind(plan, 'yard').forEach(function (it) {
      people.push(person(key + '|yard', staffName('yard'), 'engineer', 'civ', 'clerk', { post: postBy(plan, it), staff: 'Yard clerk' }));
    });
    itemsOfKind(plan, 'bar').forEach(function (it) {
      people.push(person(key + '|bartender', staffName('bartender'), 'medic', 'civ', 'bartender', { post: postBy(plan, it), staff: 'Bartender' }));
    });
    itemsOfKind(plan, 'crew').forEach(function (it) {
      people.push(person(key + '|steward', staffName('steward'), 'loadmaster', 'civ', 'steward', { post: postBy(plan, it), staff: 'Hall steward' }));
    });
    /* The cargo hall's freight office (2026-10-31). */
    itemsOfKind(plan, 'freight').forEach(function (it) {
      people.push(person(key + '|freight', staffName('freight'), 'loadmaster', 'civ', 'clerk', { post: postBy(plan, it), staff: 'Freight clerk' }));
    });

    /* Security, by whose port it is: the Syndicate keeps its own; a port
     * with a Navy garrison has marines at the big lock and an officer on
     * customs; anywhere else, the port's own officers. */
    if (portLiv === 'syn') {
      people.push(person(key + '|enf1', staffName('enf1'), 'enforcer', 'syn', 'enforcer', { patrol: ['spine', 'concourse', 'bar'] }));
      if (lport) people.push(person(key + '|heavy', staffName('heavy'), 'heavy', 'syn', 'heavy', { post: guardPost(plan, lport, 'heavy') }));
    } else if (opts.navy || portLiv === 'navy') {
      if (lport) people.push(person(key + '|mar1', staffName('mar1'), 'marine', 'navy', 'marine', { post: guardPost(plan, lport, 'mar1') }));
      if (conc) people.push(person(key + '|officer', staffName('officer'), 'officer', 'navy', 'officer', { patrol: ['concourse', 'spine'] }));
      people.push(person(key + '|sec1', staffName('sec1'), 'security', 'civ', 'security', { patrol: ['spine', 'concourse'] }));
    } else {
      people.push(person(key + '|sec1', staffName('sec1'), 'security', 'civ', 'security', { patrol: ['spine', 'cargo', 'concourse', 'bar'] }));
      if (lport) people.push(person(key + '|tac1', staffName('tac1'), 'tactical', 'civ', 'tactical', { post: guardPost(plan, lport, 'tac1') }));
    }

    /* The crew hall: the hands that are actually for hire here this week —
     * less anyone you have already signed on, as the hall's own list is. */
    var CrewM = global.Crew, signed = opts.signed || [];
    if (hall && CrewM && CrewM.forHire) {
      CrewM.forHire(port, t).filter(function (c) { return signed.indexOf(c.id) < 0; }).forEach(function (c) {
        var body = (c.role === 'pilot' || c.role === 'engineer' || c.role === 'gunner') ? c.role : 'engineer';
        people.push(person('hire|' + c.id, c.name, body, 'civ', body, { room: 'crewhall', forHire: c, rating: c.rating }));
      });
    }

    /* The ships in port: their crews, in their colours. A berth of hers is
     * a free berth on this plan (yours are taken first); some of each crew
     * work it, the rest are in the bar or on the concourse. */
    var Sim = global.Sim;
    var occ = (Sim && Sim.berthOccupants && port && sys) ? Sim.berthOccupants(port, sys, t) : [];
    var free = roomsOfKind(plan, 'berth').filter(function (b) { return !b.ship && !b.other; });
    occ.slice(0, 6).forEach(function (o, i) {
      var r = o.route || {};
      var crew = crewForShip({ id: r.id || o.name, name: o.name, faction: r.faction, cls: r.cls || r.className,
                               souls: r.souls, size: r.size });
      /* Her own berth, where the plan gave her one (walk.js `others`, for
       * boarding: 2026-10-28) — the hand working it stands by the hatch you
       * would board her by. Otherwise one of the free ones, as before. */
      var berth = roomsOfKind(plan, 'berth').filter(function (b) { return b.other && b.other.name === o.name; })[0] ||
                  free[i] || null;
      crew.slice(0, 4).forEach(function (c, j) {
        /* `route`: the ship she berthed off, so her people can speak for
         * their captain (dialogue.js reads Captains.opinion off it). */
        var extra = { shipName: o.name, ship: crew.ship, route: r.id ? r : null };
        if (berth && j === 0) extra.post = berthPost(plan, berth, c.id);
        else extra.patrol = j % 2 ? ['bar', 'concourse'] : ['concourse', 'bar'];
        people.push(person(c.id, c.name, c.body, c.liv, c.role, extra));
      });
    });

    /* YOUR HANGAR'S HAND (2026-10-31). A berth with your ship in it is
     * worked like anyone else's: one of the port's hands stands in a corner
     * clear of her, by the door end, so the chase camera round her has
     * somebody in it as well as the walker. The first corner that is floor
     * and not under her (plan.blocked, where the hangar was armed). */
    var hgr = plan.hangar && plan.hangar.room;
    if (plan.hangar && !(hgr && hgr.x0 !== undefined)) hgr = plan.rooms.filter(function (r) { return r.hangar; })[0];
    if (hgr && hgr.x0 !== undefined) {
      var corners = [[hgr.x0 + 1.4, hgr.z0 + 1.4], [hgr.x1 - 1.4, hgr.z0 + 1.4],
                     [hgr.x0 + 1.4, hgr.z1 - 1.4], [hgr.x1 - 1.4, hgr.z1 - 1.4]];
      var spot = corners.filter(function (c) {
        return standable(plan, c[0], c[1]) && !(typeof plan.blocked === 'function' && plan.blocked(c[0], c[1]));
      })[0];
      if (spot) {
        var hcx = (hgr.x0 + hgr.x1) / 2, hcz = (hgr.z0 + hgr.z1) / 2;
        people.push(person(key + '|hangarhand', staffName('hangarhand'), 'loadmaster', 'civ', 'loadmaster',
          { post: { x: spot[0], z: spot[1], yaw: Math.atan2(hcx - spot[0], hcz - spot[1]), working: true },
            staff: 'Berth hand' }));
      }
    }

    /* A Syndicate face in the bar: more likely where the port is bought, and
     * possible even in a clean port (Astra, 2026-10-20: "there might be a
     * syndicate contact in the bar of any station, even outside syndicate
     * controlled space"). Only standing about for now — what they offer is
     * the next slice of walking-stations. */
    var corrupt = (opts.corruption || 0) / 100;
    if (bar && draw(key, 'fixer|' + Math.floor(t / (2 * 86400))) < 0.12 + 0.6 * corrupt + (portLiv === 'syn' ? 0.3 : 0)) {
      people.push(person(key + '|fixer', staffName('fixer'), 'fixer', 'syn', 'fixer', { room: 'bar', sitting: true }));
    }

    /* THE TRADING HOUSE'S FACTOR (tradingfirm.js, 2026-11-03): where the
     * port has a house, its factor stands at the trade terminal on the
     * concourse — a step to the side of the screen, facing the floor, so
     * the terminal and the person who reads it for a living are found
     * together. Whether there is a house is TradingFirm.firmAt, a pure
     * function of the system and the port; the factor's face and name are
     * drawn off the house's own key, so the same port is the same person. */
    var TFm = global.TradingFirm, firm = TFm && TFm.firmAt && port && sys ? TFm.firmAt(port, sys) : null;
    if (firm) {
      var term = itemsOfKind(plan, 'tradeterm')[0], fpost = null;
      if (term && term.face) {
        var fx = term.face.x, fz = term.face.z;
        [1, -1].forEach(function (side) {
          if (fpost) return;
          var px = term.x + fx * 0.9 + fz * 1.1 * side, pz = term.z + fz * 0.9 - fx * 1.1 * side;
          if (standable(plan, px, pz)) fpost = { x: px, z: pz, yaw: Math.atan2(fx, fz) };
        });
      }
      var fextra = { staff: 'Factor', firmKey: firm.key };
      if (fpost) fextra.post = fpost; else fextra.room = conc ? 'concourse' : 'bar';
      people.push(person(key + '|factor', nameFrom('firm|' + firm.key), 'pilot', 'civ', 'factor', fextra));
    }

    var sc = { kind: 'station', plan: plan, people: people, floorY: 0, key: key };
    people.forEach(function (p) { placeAtStart(sc, p, t); });
    return sc;
  }

  /* An NPC ship's people, by role and livery. Pure: the same ship is the
   * same crew wherever she is met, so the faces on her deck when she is
   * boarded are the ones that were on the concourse. */
  var SHIP_ROLES = {
    civ: ['pilot', 'engineer', 'loadmaster', 'gunner', 'medic', 'security'],
    navy: ['officer', 'marine', 'pilot', 'engineer', 'marine', 'gunner', 'medic', 'tactical'],
    syn: ['enforcer', 'pilot', 'engineer', 'heavy', 'gunner', 'enforcer'],
    pir: ['captain', 'raider', 'raider', 'engineer', 'raider', 'gunner']
  };
  /* A traffic route's `size` is a number (her mass fraction, sim.js), not a
   * letter, so every ship in port used to come out as an S with a crew of
   * two — and a hauler you boarded had one hand aboard besides her master
   * (found boarding, 2026-10-28). The letter is the hull's: the player hull
   * built on the model her class flies, the same one boarding walks her as. */
  function sizeLetter(info) {
    if (typeof info.size === 'string') return info.size;
    var H = global.Combat && global.Combat.HULLS, cls = info.cls;
    if (H && cls) for (var k in H) if (H[k].mesh === cls) return H[k].size || 'M';
    return null;
  }
  function crewForShip(info) {
    info = info || {};
    var liv = liveryFor(info), id = 'ship|' + (info.id || info.name || '?');
    var sz = sizeLetter(info);
    var n = Math.max(1, Math.min(8, (info.souls | 0) || (sz === 'L' || sz === 'XL' ? 5 : sz === 'M' ? 3 : 2)));
    var roles = SHIP_ROLES[liv];
    /* Where in the list a ship starts, so a port full of freighters is not
     * a bar full of engineers — the first role stays first (the captain,
     * the officer), the rest rotate by the ship. */
    var off = Math.floor(draw(id, 'roles') * (roles.length - 1));
    var out = [];
    for (var i = 0; i < n; i++) {
      var role = i === 0 ? roles[0] : roles[1 + ((i - 1 + off) % (roles.length - 1))];
      out.push({ id: id + '|' + i, name: nameFrom(id + '|' + i), body: role, role: role,
                 liv: liv, ship: info.name || '' });
    }
    out.ship = info.name || '';
    return out;
  }

  /* Names from crew.js's own lists, so a stranger on the deck sounds like
   * the people in the crew hall. */
  var GIVEN = ['Ama', 'Bren', 'Cal', 'Dova', 'Esk', 'Fen', 'Gret', 'Hale', 'Ibe', 'Jann', 'Kes', 'Lior', 'Mira', 'Nesh',
               'Oren', 'Pell', 'Quill', 'Rue', 'Sasha', 'Teo', 'Ulla', 'Vann', 'Wren', 'Yara', 'Zeke', 'Adia', 'Bo', 'Cass'];
  var FAMILY = ['Ardwick', 'Brill', 'Coyle', 'Danner', 'Esterhazy', 'Fallow', 'Grieve', 'Hoyt', 'Iveson', 'Jarrah',
                'Kepner', 'Lund', 'Macklin', 'Nury', 'Orrell', 'Petrak', 'Quist', 'Rask', 'Sable', 'Tirrell', 'Vance', 'Wray'];
  function nameFrom(key) { return pickOf(GIVEN, key, 'g') + ' ' + pickOf(FAMILY, key, 'f'); }

  /* Where staff stand: beside their counter, on the room side, facing out
   * into the room — the counters are against walls, so there is no
   * "behind". */
  function postBy(plan, it) {
    /* A counter with a "behind" (the bar, 2026-10-31) says where. */
    if (it.post) return { x: it.post.x, z: it.post.z, yaw: it.post.yaw };
    var c = it.counter, room = roomAt(plan, it.x, it.z);
    if (!c || !room) return { x: it.x, z: it.z, yaw: 0 };
    var cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
    var wide = (c[2] - c[0]) > (c[3] - c[1]);
    var spot = wide ? { x: c[2] + 0.55, z: (c[1] + c[3]) / 2 } : { x: (c[0] + c[2]) / 2, z: c[3] + 0.55 };
    if (!standable(plan, spot.x, spot.z)) spot = wide ? { x: c[0] - 0.55, z: (c[1] + c[3]) / 2 } : { x: (c[0] + c[2]) / 2, z: c[1] - 0.55 };
    /* A counter can run right up to a wall; keep the post a body's width in. */
    spot.x = Math.max(room.x0 + 0.45, Math.min(room.x1 - 0.45, spot.x));
    spot.z = Math.max(room.z0 + 0.45, Math.min(room.z1 - 0.45, spot.z));
    if (!standable(plan, spot.x, spot.z)) {
      var wide2 = !wide;
      spot = wide2 ? { x: c[0] - 0.6, z: (c[1] + c[3]) / 2 } : { x: (c[0] + c[2]) / 2, z: c[1] - 0.6 };
      if (!standable(plan, spot.x, spot.z)) spot = spotIn(plan, room, 'post|' + it.kind, 0);
    }
    return { x: spot.x, z: spot.z, yaw: Math.atan2(cx - spot.x, cz - spot.z) };
  }
  function guardPost(plan, room, key) {
    var d = plan.doors.filter(function (dd) { return dd.a === room.id || dd.b === room.id; })[0];
    if (!d) return { x: (room.x0 + room.x1) / 2, z: (room.z0 + room.z1) / 2, yaw: 0 };
    var side = draw(key, 'side') < 0.5 ? -1 : 1;
    var x = (d.x0 + d.x1) / 2 + side * ((d.x1 - d.x0) / 2 + 0.9), z = Math.max(room.z0 + 0.8, Math.min(room.z1 - 0.8, (d.at || 0) - 1.2));
    return { x: x, z: z, yaw: Math.PI };
  }
  /* Off to one side of her hatch, not in front of it (2026-10-28). The hand
   * used to stand within a metre of the hatch's middle, so with boarding,
   * E facing the hatch found the hand first — nearer than the thing you
   * were looking at — and you could talk to her crew all day and never get
   * aboard. Two metres and more along the wall clears it. */
  function berthPost(plan, berth, key) {
    var hx = berth.side < 0 ? berth.x0 + 1.6 : berth.x1 - 1.6, zc = (berth.z0 + berth.z1) / 2;
    var side = draw(key, 'bz') < 0.5 ? -1 : 1;
    var reach = Math.min(2.0 + draw(key, 'bz2') * 0.9, (berth.z1 - berth.z0) / 2 - 0.5);
    return { x: hx, z: zc + side * reach, yaw: berth.side < 0 ? -Math.PI / 2 : Math.PI / 2, working: true };
  }

  /* ---- what to do next --------------------------------------------------
   * Each role's script, returning { at, act, hold, yaw } — where to go, what
   * to do there, and for how long (wall-clock seconds). */
  function nextTask(sc, p, t, ctx) {
    var plan = sc.plan, n = p.n++;
    var hold = 20 + draw(p.id, n + 'h') * 70;
    if (sc.kind === 'ship') {
      /* THE WHOLE SHIP, not just this deck (2026-10-25): on a decked hull a
       * hand's station may be on the bridge while you are on the main deck.
       * Every task says which deck it is on; update() sends a hand whose
       * next job is elsewhere into the lift, and brings one out of it whose
       * job is here. `W` is the whole plan; `dp(room)` the deck plan a spot
       * is drawn from. */
      var W = plan.ship || plan;
      var dp = function (rm) { return (W.decks && rm && W.decks[rm.deck]) || plan; };
      var on = function (task, d) { task.deck = d || null; return task; };
      /* ABOARD SOMEBODY ELSE'S SHIP (visitScene, 2026-10-28): her master
       * holds her helm, and the hands with no console of their own — her
       * marines, her security, her raiders — stand their watch in a room
       * rather than at a seat. Both flags are only ever set by visitScene,
       * so your own crew's scripts are untouched. */
      /* Held to one spot (main.js, boarding part 3, 2026-10-31): her master
       * in her airlock, between a boarder and her inner door. */
      if (p.holdAt) return on({ at: { x: p.holdAt.x, z: p.holdAt.z }, act: 'stand', yaw: p.holdAt.yaw || 0, hold: 600 }, p.holdAt.deck || null);
      if (p.helmSeat) {
        var hs = itemsOfKind(W, 'seat')[0];
        if (hs) return on({ at: { x: hs.x, z: hs.sitZ !== undefined ? hs.sitZ : hs.z - 0.08 }, act: 'sit', yaw: 0, hold: 600, station: true }, hs.deck);
      }
      if (p.guard && onWatch(p, t)) {
        var gr = roomsOfKind(W, p.guard)[0] || roomsOfKind(W, 'passage')[0];
        if (gr) return on({ at: spotIn(dp(gr), gr, p.id, n, 0.8), act: 'stand', hold: 8 + draw(p.id, n + 'g') * 14 }, gr.deck);
      }
      /* The pilot has the conn whenever you do not. */
      if (p.role === 'pilot') {
        var seat = itemsOfKind(W, 'seat')[0];
        if (ctx.playerWalking && seat && ctx.helmFree) {
          return on({ at: { x: seat.x, z: seat.sitZ !== undefined ? seat.sitZ : seat.z - 0.08 }, act: 'sit', yaw: 0, hold: 600, helm: true }, seat.deck);
        }
      }
      /* A ship with no bunks (an S) keeps no watches: whoever is aboard is
       * at their seat. */
      var watch = (W.bunkAt && W.bunkAt.length) ? onWatch(p, t) : true;
      if (watch && (p.station || p.turret)) {
        /* On watch: at the station, with now and then a round. An
         * engineer's goes to the engine room, or now and then the cargo
         * bay, to look at what is there (2026-10-25: before there was an
         * engine room, the airlock); anybody else's is a stretch in the
         * passage. */
        if (draw(p.id, n + 'r') < (p.role === 'engineer' ? 0.3 : 0.1) && !p.lastRound) {
          p.lastRound = true;
          if (p.role === 'engineer') {
            var con = itemsOfKind(W, 'engine')[0], hold2 = 15 + draw(p.id, n + 'w') * 30;
            if (con && draw(p.id, n + 'e') < 0.7) {
              return on({ at: { x: con.x + (draw(p.id, n + 'ex') - 0.5) * 0.5, z: con.counter[3] + 0.4 }, act: 'work', yaw: Math.PI, hold: hold2 }, con.deck);
            }
            var hold3 = roomsOfKind(W, 'cargo')[0] || roomsOfKind(W, 'airlock')[0];
            if (hold3) return on({ at: spotIn(dp(hold3), hold3, p.id, n, 1.0), act: 'work', hold: 6 + draw(p.id, n + 'w') * 10 }, hold3.deck);
          }
          /* A stretch on the deck their station is on. */
          var stDeck = (p.turret || p.station || {}).deck;
          var aft = roomsOfKind(W, 'passage').concat(roomsOfKind(W, 'bridgedeck')).filter(function (r) { return !stDeck || r.deck === stDeck; })[0]
                    || roomsOfKind(W, 'passage')[0];
          if (aft) return on({ at: spotIn(dp(aft), aft, p.id, n), act: 'stand', hold: 6 + draw(p.id, n + 'w') * 8 }, aft.deck);
        }
        p.lastRound = false;
        if (p.turret) {
          var tu = p.turret;
          return on({ at: { x: tu.x, z: tu.z - 0.1 }, act: 'sit', yaw: 0, hold: hold * 2, station: true }, tu.deck);
        }
        var st = p.station, side = st.x < 0 ? -1 : 1;
        /* A seat that faces forward (the co-pilot's) is sat in like the
         * helm; a console against a wall is faced. */
        if (st.yaw !== undefined) return on({ at: { x: st.x, z: st.sitZ !== undefined ? st.sitZ : st.z - 0.08 }, act: 'sit', yaw: st.yaw, hold: hold * 2, station: true }, st.deck);
        return on({ at: { x: st.x - side * 0.08, z: st.z }, act: 'sit', yaw: side * Math.PI / 2, hold: hold * 2, station: true }, st.deck);
      }
      /* With you in the seat, the pilot on watch stands at your shoulder. */
      if (p.role === 'pilot' && onWatch(p, t)) {
        var ck = roomsOfKind(W, 'cockpit')[0];
        if (ck && W.bay !== undefined) {
          var bx = Math.max(ck.x0 + 0.45, Math.min(ck.x1 - 0.45, (ck.x1 - ck.x0) > 1.6 ? ck.x0 + 0.5 : 0));
          return on({ at: { x: bx, z: W.bay }, act: 'stand', yaw: 0, hold: hold }, ck.deck);
        }
      }
      if (onWatch(p, t) && p.assist) {
        var as = p.assist, sd = as.x < 0 ? -1 : 1;
        return on({ at: { x: as.x - sd * 0.55, z: as.z - 0.55 }, act: 'stand', yaw: sd * Math.PI / 2, hold: hold }, as.deck);
      }
      /* Off watch: the bunk most of the time, the galley the rest. */
      var galley = itemsOfKind(W, 'galley')[0];
      /* And now and then the medbay, for whatever a hand goes there for. */
      var medb = roomsOfKind(W, 'medbay')[0];
      if (medb && draw(p.id, n + 'm') < 0.06) return on({ at: spotIn(dp(medb), medb, p.id, n, 0.6), act: 'stand', hold: 10 + draw(p.id, n + 'mh') * 20 }, medb.deck);
      var qr = roomsOfKind(W, 'quarters')[0];
      if (p.bunk && draw(p.id, n + 'b') < 0.6) {
        var b = p.bunk;
        return on({ at: { x: b.inboard ? b.x0 - 0.35 : b.x1 + 0.35, z: (b.z0 + b.z1) / 2 }, act: 'lie', yaw: Math.PI, hold: hold * 3, bunk: b, upper: p.upper && b.two }, qr && qr.deck);
      }
      if (galley) return on({ at: { x: galley.x + (draw(p.id, n + 'gx') - 0.5) * 0.8, z: galley.z + 0.65 }, act: 'work', yaw: Math.PI, hold: hold }, galley.deck);
      var pass = roomsOfKind(W, 'passage')[0] || W.rooms[0];
      return on({ at: spotIn(dp(pass), pass, p.id, n, 0.35), act: 'stand', hold: hold }, pass.deck);
    }
    /* On a station deck. */
    if (p.post) {
      /* A post is held, with a few steps off it now and then. */
      if (p.post.working || draw(p.id, n + 'p') > 0.18) {
        return { at: { x: p.post.x, z: p.post.z }, act: p.post.working ? 'work' : 'stand', yaw: p.post.yaw, hold: hold };
      }
      var here = roomAt(plan, p.post.x, p.post.z);
      return { at: here ? spotIn(plan, here, p.id, n) : p.post, act: 'stand', hold: 4 + draw(p.id, n + 'q') * 6 };
    }
    if (p.room) {
      var r = roomById(plan, p.room);
      /* Somebody who sits, sits on something (dressing.js seats,
       * 2026-10-31): a stool, a chair, the booth. */
      var seatsHere = p.sitting && plan.seats ? plan.seats.filter(function (s) { return s.room === p.room; }) : [];
      if (r && seatsHere.length) {
        var st = seatsHere[Math.floor(draw(p.id, 'seat') * seatsHere.length)];
        return { at: { x: st.x, z: st.z }, act: 'sit', yaw: st.yaw, hold: hold * 4 };
      }
      if (r) return { at: spotIn(plan, r, p.id, n), act: p.sitting ? 'sit' : 'stand', yaw: draw(p.id, n + 'y') * 6.28, hold: hold * (p.sitting ? 4 : 1) };
    }
    if (p.patrol) {
      var rid = p.patrol[n % p.patrol.length], rr = roomById(plan, rid) || plan.rooms[0];
      var patroller = p.role === 'security' || p.role === 'enforcer' || p.role === 'officer' || p.role === 'marine';
      return { at: spotIn(plan, rr, p.id, n), act: 'stand', hold: patroller ? 4 + draw(p.id, n + 'k') * 10 : hold };
    }
    return { at: { x: p.x, z: p.z }, act: 'stand', hold: hold };
  }

  /* Somebody seen for the first time is already where their script has
   * them, not walking there from a corner. */
  function placeAtStart(sc, p, t) {
    var task = nextTask(sc, p, t, { playerWalking: false, helmFree: false });
    /* On another deck: not here, until their work brings them here. */
    p.away = elsewhere(sc, task);
    if (p.away && sc.car) {
      var cm = carMiddle(sc);
      p.x = cm.x; p.z = cm.z; p.yaw = 0; p.sit = 0; p.lie = 0;
      begin(p, task, 0);
      p.act = 'away';
      return;
    }
    p.x = task.at.x; p.z = task.at.z;
    if (!standable(sc.plan, p.x, p.z) && task.act !== 'sit' && task.act !== 'lie') {
      var r = roomAt(sc.plan, task.at.x, task.at.z) || sc.plan.rooms[0], s = spotIn(sc.plan, r, p.id, 'start');
      p.x = s.x; p.z = s.z;
    }
    p.yaw = task.yaw !== undefined ? task.yaw : draw(p.id, 'yaw') * 6.28;
    begin(p, task, 0);
    p.sit = task.act === 'sit' ? 1 : 0;
    p.lie = task.act === 'lie' ? 1 : 0;
  }
  function elsewhere(sc, task) { return !!(sc.deck && task.deck && task.deck !== sc.deck); }
  function carMiddle(sc) { return { x: (sc.car.x0 + sc.car.x1) / 2, z: (sc.car.z0 + sc.car.z1) / 2 }; }
  function begin(p, task, now) {
    p.task = task; p.act = 'walk'; p.until = now + task.hold;
    p.helm = !!task.helm;
  }

  /* ---- one tick ----------------------------------------------------------
   * `ctx`: { now (wall s), t (game s), player {x,z} or null, playerWalking,
   * helmFree }. Moves everybody, settles their pose, and returns which
   * sliding doors somebody is waiting at — the caller hands that to
   * ShipDeck.updateDoors as its `hold`. */
  function update(sc, dt, ctx) {
    ctx = ctx || {};
    /* The scene last ticked, for a probe or the console to read. */
    Npc.lastScene = sc;
    talkingTo = ctx.talkTo || null;   // who the player is talking to, for the talking clips
    var plan = sc.plan, hold = {}, now = ctx.now || 0;
    sc.people.forEach(function (p) {
      /* A pilot sitting at the helm gets up when you want it back. */
      if (p.helm && !ctx.playerWalking) { p.task = null; p.until = 0; p.sit = 0; }
      /* And goes to it as soon as you leave it, not when the job in hand
       * is done — a seat nobody is in is the first thing a pilot sees. */
      if (sc.kind === 'ship' && p.role === 'pilot' && !p.helm && ctx.playerWalking && ctx.helmFree &&
          p.task && !p.task.helm && itemsOfKind(plan.ship || plan, 'seat').length) { p.task = null; }
      if (!p.task || (p.act !== 'walk' && now >= p.until)) {
        var task = nextTask(sc, p, ctx.t || 0, ctx);
        begin(p, task, now);
        if (elsewhere(sc, task)) {
          /* Work on another deck: into the lift, and gone. Already gone, they
           * stay gone. */
          if (p.away) { p.act = 'away'; return; }
          p.leaving = true;
          p.path = route(plan, { x: p.x, z: p.z }, carMiddle(sc));
        } else {
          /* Work here: out of the lift if they were away. */
          if (p.away) { var cm = carMiddle(sc); p.x = cm.x; p.z = cm.z; p.away = false; p.sit = 0; p.lie = 0; }
          p.leaving = false;
          p.path = route(plan, { x: p.x, z: p.z }, task.at);
        }
      }
      if (p.away) return;
      /* Somebody you are talking to (dialogue.js) stops what they are doing
       * and turns to you, sitting or standing as they were; the task picks
       * up again when you walk away. */
      if (ctx.talkTo && ctx.talkTo === p.id && ctx.player) {
        p.gait = 0;
        face(p, ctx.player, dt);
        if (p.act === 'walk') { p.until = now + 2; }
        return;
      }
      if (p.act === 'walk') {
        /* Get up first. */
        if (p.sit > 0 || p.lie > 0) {
          p.sit = Math.max(0, p.sit - dt * 2.2); p.lie = Math.max(0, p.lie - dt * 1.6);
          p.gait = 0;
          return;
        }
        var wp = p.path[0];
        if (!wp) {
          if (p.leaving) { p.away = true; p.leaving = false; p.act = 'away'; p.gait = 0; return; }
          p.act = p.task.act; p.gait = 0; return;
        }
        /* A shut door is waited at — and asked to open. */
        if (wp.door) {
          var dd = null;
          for (var i = 0; i < plan.doors.length; i++) if (plan.doors[i].id === wp.door) dd = plan.doors[i];
          if (dd && dd.slide) {
            hold[dd.id] = true;
            if (dd.shut && dist(p, wp) < 1.3) { p.gait *= 0.8; face(p, wp, dt); return; }
          }
        }
        /* Give way to you: stop short rather than walk through you — for a
         * couple of seconds, and then squeeze past, or a passage with you
         * standing in it would hold them for ever. */
        if (ctx.player && dist(p, ctx.player) < PERSONAL + 0.2) {
          var ahead = (wp.x - p.x) * (ctx.player.x - p.x) + (wp.z - p.z) * (ctx.player.z - p.z);
          if (ahead > 0 && (p.wait += dt) < 2.5) { p.gait *= 0.85; return; }
        } else p.wait = 0;
        var dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
        var sp = (p.role === 'tactical' && ctx.alarm) ? RUN_SPEED : WALK_SPEED;
        var stepLen = Math.min(d, sp * dt);
        if (d > 1e-4) { p.x += dx / d * stepLen; p.z += dz / d * stepLen; face(p, wp, dt); }
        p.phase += stepLen / STRIDE * 2 * Math.PI;
        p.gait = Math.min(1, p.gait + dt * 4);
        if (d < 0.06) p.path.shift();
      } else {
        p.gait = Math.max(0, p.gait - dt * 4);
        if (p.task && p.task.yaw !== undefined) turnTo(p, p.task.yaw, dt);
        if (p.act === 'sit') p.sit = Math.min(1, p.sit + dt * 2);
        if (p.act === 'lie') p.lie = Math.min(1, p.lie + dt * 1.2);
        p.phase += dt * 1.3;
      }
    });
    return hold;
  }
  function face(p, wp, dt) { turnTo(p, Math.atan2(wp.x - p.x, wp.z - p.z), dt); }
  function turnTo(p, target, dt) {
    var d = target - p.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    var s = TURN_RATE * dt;
    p.yaw += Math.abs(d) < s ? d : (d > 0 ? s : -s);
  }

  /* ---- the pose a person's limbs are in, now ------------------------------
   * Walking swings hips and shoulders opposite each other and bends the
   * knee on the swing; sitting folds hip and knee square and drops the
   * body onto the seat; lying turns it onto its back in the bunk; working
   * raises the forearms to a console or a bench. Blended by how far into
   * each the person is, so getting up is a movement and not a cut. */
  var SEAT_SINK = 0.36, BUNK_Y = 0.52, BUNK_Y_UPPER = 1.46;
  function pose(sc, p) {
    var g = p.gait, ph = p.phase, sw = Math.sin(ph), sw2 = Math.sin(ph + Math.PI);
    var o = { x: p.x, z: p.z, y: sc.floorY || 0, yaw: p.yaw, sink: 0, lean: 0 };
    /* Up in a raised cockpit, or on its stair (shipdeck.js RAISED). */
    var SDn = global.ShipDeck;
    if (sc.kind === 'ship' && sc.plan && sc.plan.raised && SDn && SDn.floorAt) o.y += SDn.floorAt(sc.plan, p.x, p.z);
    o.hipL = g * 0.42 * sw; o.hipR = g * 0.42 * sw2;
    o.kneeL = g * 0.55 * Math.max(0, Math.sin(ph - 0.9)); o.kneeR = g * 0.55 * Math.max(0, Math.sin(ph + Math.PI - 0.9));
    o.ankleL = 0; o.ankleR = 0;
    o.shL = g * 0.35 * sw2; o.shR = g * 0.35 * sw;
    o.elbowL = 0.15 + g * 0.2; o.elbowR = 0.15 + g * 0.2;
    o.sink = g * 0.02 * Math.abs(Math.cos(ph));
    /* Idle: breathing, a little weight shift. */
    var idle = 1 - g;
    o.shL += idle * 0.03 * Math.sin(ph * 0.7); o.shR -= idle * 0.03 * Math.sin(ph * 0.7);
    var work = p.act === 'work' ? 1 : 0;
    if (work) { o.elbowL = 1.0 + 0.12 * Math.sin(ph * 2.1); o.elbowR = 1.1 + 0.12 * Math.sin(ph * 1.7); o.shL += 0.35; o.shR += 0.35; }
    var s = p.sit;
    if (s > 0) {
      o.hipL = o.hipL * (1 - s) + s * 1.55; o.hipR = o.hipR * (1 - s) + s * 1.55;
      o.kneeL = o.kneeL * (1 - s) + s * 1.55; o.kneeR = o.kneeR * (1 - s) + s * 1.55;
      o.sink += s * SEAT_SINK;
      /* Hands to the console when sitting at a station or the helm. */
      if (p.task && (p.task.station || p.task.helm)) {
        o.elbowL = o.elbowL * (1 - s) + s * (1.2 + 0.08 * Math.sin(ph * 2.3));
        o.elbowR = o.elbowR * (1 - s) + s * (1.25 + 0.08 * Math.sin(ph * 1.9));
        o.shL += s * 0.45; o.shR += s * 0.45;
      }
      /* Back onto the seat: the hips land where the person stood. */
      o.x -= Math.sin(p.yaw) * 0.05 * s; o.z -= Math.cos(p.yaw) * 0.05 * s;
    }
    var l = p.lie;
    if (l > 0 && p.task && p.task.bunk) {
      var bk = p.task.bunk;
      o.lean = -Math.PI / 2 * l;
      o.y = (sc.floorY || 0) + l * ((p.task.upper ? BUNK_Y_UPPER : BUNK_Y) + 0.1);
      o.x = o.x * (1 - l) + l * (bk.x0 + bk.x1) / 2;
      /* Feet at the foot of the bunk, head under the reading lamp at z1. */
      o.z = o.z * (1 - l) + l * (bk.z0 + 0.15);
      o.yaw = p.yaw * (1 - l) + l * Math.PI;
      o.hipL *= 1 - l; o.hipR *= 1 - l; o.kneeL = 0.15 * l; o.kneeR = 0.1 * l;
      o.shL = 0.1; o.shR = 0.1; o.elbowL = 0.4 * l; o.elbowR = 0.3 * l;
      o.sink = 0;
    }
    return o;
  }

  /* ---- for the renderer ------------------------------------------------------
   * Builds bodies lazily — at most `budget` a frame, nearest first, so a
   * concourse full of people arrives over a few frames rather than as one
   * long hitch — and returns [{ model, mats, person }] for npcgl.js. */
  var talkingTo = null;
  function figures(sc, eye, budget) {
    var NM = global.NpcModel;
    if (!NM) return [];
    budget = budget === undefined ? 2 : budget;
    /* Nobody on another deck (2026-10-25). */
    var list = sc.people.filter(function (p) { return !p.away; });
    if (eye) list.sort(function (a, b) { return dist(a, eye) - dist(b, eye); });
    var out = [];
    list.forEach(function (p) {
      /* The face kit that shows through a sealed suit (eyepiece, goggles,
       * rebreather …) goes on the body too: portrait.js rolls it. */
      if (!p.model && budget > 0) { p.model = NM.build(p.body, p.name, p.liv, global.Portrait && global.Portrait.gearOf ? global.Portrait.gearOf(p) : null); budget--; }
      if (!p.model) return;
      var o = pose(sc, p);
      p.mats = NM.skin(p.model, o, p.mats);
      /* The Quaternius body (people.js), where its data is loaded: the same
       * person, the same kit, moved by the animation library. Built on the
       * same budget, after the old figure it borrows its paint and kit from. */
      var PP = global.People, RG = global.Rig;
      if (PP && RG && p.rig === undefined && budget > 0) { p.rig = PP.build(p.body, p.name, p.liv, global.Portrait && global.Portrait.gearOf ? global.Portrait.gearOf(p) : null) || null; budget--; }
      if (p.rig) {
        var s = p.sit || 0;
        /* The sitting clips put the hips back over the seat on their own,
         * a quarter-metre behind where they stand: bring them forward by
         * that so they land where npc.js sat them. */
        var fwd = s * 0.24, yaw = o.yaw || 0;
        /* Posed about the person's own feet; where they stand is added once,
         * at the end (npcgl.js). Folded into every bone, a deck position
         * thousands of metres from the frame's origin rounded differently in
         * each of the four bones a chest vertex blends, and tore the torso
         * into shards (2026-10-26). */
        p.rmats = RG.pose(p.rig.body, PP.layers(p, !!(talkingTo && talkingTo === p.id)), {
          x: 0, z: 0, y: 0, yaw: yaw, lean: o.lean || 0, scale: p.rig.scale }, p.rmats);
        p.rpos = { x: o.x + Math.sin(yaw) * fwd, y: (o.y || 0), z: o.z + Math.cos(yaw) * fwd };
      }
      out.push({ model: p.model, mats: p.mats, person: p, rig: p.rig || null, rmats: p.rig ? p.rmats : null, rpos: p.rig ? p.rpos : null });
    });
    return out;
  }

  /* Who E would talk to: the nearest person in front of you and within
   * reach, as walk.js's `facing` finds things to use. */
  function facing(sc, w, reach) {
    reach = reach || 1.9;
    var best = null, bd = Infinity, fx = Math.sin(w.yaw), fz = Math.cos(w.yaw);
    sc.people.forEach(function (p) {
      if (p.away) return;
      var dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
      if (d > reach || d < 0.05) return;
      if ((dx * fx + dz * fz) / d < 0.5) return;
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  }

  /* What they say: their name, what they are, and a line in character. */
  function talk(p) {
    var lines = LINES[p.role] || LINES[p.body] || ['…'];
    var line = lines[p.line++ % lines.length];
    var CrewM = global.Crew;
    var who = p.name;
    /* A gunner's knack (crew.js, 2026-10-25) is what you hire one for, so
     * they say it. */
    var kn = CrewM && CrewM.knackOf ? CrewM.knackOf(p.forHire || p.crew) : null;
    var kw = kn ? ' (' + CrewM.KNACKS[kn].name + ')' : '';
    if (p.staff) who += ', ' + p.staff.toLowerCase();
    else if (p.forHire && CrewM && CrewM.ratingWord) who += ', ' + CrewM.ratingWord(p.forHire.rating) + ' ' + p.role + kw + ', looking for a berth';
    else if (p.crew) who += ', your ' + p.role + kw;
    else if (p.shipName) who += ' of the ' + p.shipName;
    return who + ':  "' + line + '"';
  }

  /* What sits in a scene's walls, for doors that must open: the caller
   * merges this with the walker's own proximity. */
  var Npc = {
    WATCH: WATCH, liveryFor: liveryFor, crewForShip: crewForShip, visitScene: visitScene,
    shipScene: shipScene, stationScene: stationScene,
    update: update, pose: pose, figures: figures, facing: facing, talk: talk,
    route: route, onWatch: onWatch, nameFrom: nameFrom
  };

  global.Npc = Npc;
  if (typeof module !== 'undefined' && module.exports) module.exports = Npc;
})(typeof window !== 'undefined' ? window : globalThis);
