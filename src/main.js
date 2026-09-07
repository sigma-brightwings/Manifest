/* main.js — game loop, camera, input, HUD. */
(function (global) {
  'use strict';

  var V = global.V, K = global.Kepler, Gen = global.Gen,
      Sim = global.Sim, Render = global.Render, RNG = global.RNG,
      Eco = global.Economy, Galaxy = global.Galaxy,
      Combat = global.Combat, Missions = global.Missions,
      Slip = global.Slipspace;
  var DEG = Math.PI / 180;
  var AU = Gen.AU;

  var WARPS = [1, 5, 25, 100, 500, 2500, 10000, 50000, 250000, 1000000];

  /* The slowest time is allowed to run while the player is still asking for
   * more. Nothing near a massive body drops below this any more: a powered
   * approach inside a planet's well has a predicted impact ahead of it for
   * most of its length, and cutting to real time for that made a
   * twenty-hour burn something you had to sit through rather than fly.
   *
   * Five is deliberately small enough to stay controllable — you can still
   * see and correct an attitude error at 5x — and large enough that a long
   * transfer is minutes rather than an evening. The floor is dropped only
   * when a collision is inside IMPACT_HANDS_ON, which is the single case
   * where one-to-one time is genuinely what the player wants. */
  var WARP_FLOOR = 5;
  var WARP_FLOOR_INDEX = 1;          // WARPS.indexOf(WARP_FLOOR)
  var IMPACT_HANDS_ON = 25;          // s — inside this, real time, no argument

  var G = {
    seed: 'kawartha',
    galaxy: null,         // the cluster: positions and seeds, nothing more
    here: null,           // the star we are currently inside
    visited: {},          // star id -> true
    systemCache: {},      // star id -> generated system (keeps player-caused state)
    starMap: null,        // open slipspace chart, or null
    sys: null,
    ship: null,
    t: 0,                 // absolute simulation time, seconds
    warpIndex: 0,
    paused: false,
    /* 'ship' drives the nose, 'orbital' drives prograde/radial/normal.
     * Ship is the default because it is the one that behaves the way
     * pointing at something implies it should. */
    flightMode: 'ship',
    assist: true,
    focus: null,          // body we are looking at, or null for the ship
    followShip: true,
    cam: new Render.Camera(),
    stars: null,
    keys: {},
    showOrbits: true,
    showPrediction: true,
    showGrid: true,
    showHelp: false,
    /* Resolution the world layer is drawn at, as a fraction of the screen.
     * Set from storage at boot (see loadRenderScale) and cycled with ` —
     * a property of this machine's GPU, so it is not part of a career. */
    renderScale: 1,
    viewMode: 'orbit',    // 'orbit' (exterior, mouse-orbited) or 'cockpit'
    cockpitFov: 68 * DEG, // the canopy's field of view; zooming narrows it
    /* The pause menu and the title screen. Both stop time while they are up
     * — see update() — and neither is career state, so neither is saved. */
    menu: null,
    title: null,
    soundVolume: 0.5,     // matches sound.js's own default, so boot is silent about it
    soundMuted: false,
    trajectory: null,
    trajectoryStale: 0,
    /* The prediction in progress, if any — see advancePrediction. Runtime
     * only: it is a few frames of arithmetic, never saved. */
    trajJob: null,
    impactForecast: null,     // long-horizon scan result, kept alive independently
    impactForecastStale: 0,   // of the per-frame safety scan (see update())
    lastMassiveBody: null,    // compass target: last non-star body the ship was near/orbiting
    dockTarget: null,     // a station body, or null
    dockStatus: null,
    physicsLimited: false,
    warpCap: Infinity,
    orbitPaths: {},
    fps: 60,
    message: null,
    messageUntil: 0,

    showTraffic: true,
    /* Console screens shot out, by panel id. Damage, so it survives a save
     * and costs money to undo — see Combat.repair. */
    deadPanels: {},
    hitAt: 0,                 // performance.now() of the last hull hit
    showCockpitFrame: true,
    /* Cockpit chrome, cycled by K:
     *   0  the flat instrument band, over a cockpit you can see the top of
     *   1  band stowed — the console's own three screens are the instruments
     *   2  no interior at all, just the canopy and the band
     * The band and the dashboard want the same 200-odd pixels at the bottom
     * of the screen, and no window size gives both. So it is a choice, made
     * on one key, rather than a compromise that serves neither. */
    cockpitChrome: 0,
    /* The pilot's head, not the ship. Yaw and pitch of the view inside the
     * cockpit, entirely independent of where the nose is pointed. */
    look: { yaw: 0, pitch: 0 },
    navTarget: null,      // { kind: 'body'|'ship', id } — the locked target
    navCursor: 0,         // position in the NAV list
    panel: 0,             // which of the nine instrument pages is up
    contact: null,        // nearest ship, for the contact readout
    encounter: null,      // NPCs currently lifted off their rails
    encounterWarned: false,
    lastDtSim: 0,         // sim seconds advanced last frame; encounters run on it
    hyper: null,          // the jump sequence, while one is playing
    cruise: null,         // the cruise drive, while engaged
    autodock: null,       // auto-dock guidance, while flying it
    market: null,         // open trade console: { port, rows, sel } or null
    marketQty: 1,         // how many tonnes a single buy/sell moves
    ledgerLog: [],        // recent transactions, newest first

    /* ---- manoeuvre nodes ----
     * The node itself is four numbers (see Sim.makeNode). Everything else
     * here is derived and cached, because re-deriving it is an integration
     * from now to the node and that is far too expensive to do per frame. */
    node: null,           // Sim.makeNode(...) — one at a time, by design
    nodePlan: null,       // cached Sim.nodePlan result
    nodeAfter: null,      // predicted trajectory from the post-burn state
    nodeStale: 0,         // seconds until the plan is recomputed
    nodeAxis: 0,          // which axis the keys are nudging: see NODE_AXES
    nodeBurn: null,       // live burn state while the autopilot flies it
    nodeHandles: null,    // screen-space handle positions, for hit-testing

    /* Holding Left Alt takes the mouse away from the ship and hands it to
     * the interface. Without it there is nowhere for a cursor to live: the
     * mouse is already the head in the cockpit and the camera outside, and
     * a drag handle you cannot reach without also yawing the ship is not a
     * handle. */
    cursor: { active: false, x: 0, y: 0, over: null },
    nodeDrag: null,       // { axis, sign, startValue, startX, startY } mid-drag

    /* ---- the screens ----
     * Every clickable thing on any screen registers a rectangle here while
     * it draws, and the mouse handler walks the list backwards. Drawing and
     * hit-testing then cannot disagree about where a button is, because
     * there is only one set of coordinates and the draw call produced it. */
    hotspots: [],
    invSel: 0,            // highlighted row in the inventory
    commsSel: 0,          // highlighted contact in the comms directory
    missionSel: 0,
    mouseAim: false,      // F9: mouse steers the nose instead of the head
    aimSens: 1.0,
    /* Held mouse triggers, one per fire group, live only while mouse-aim is
     * on. Combat.update reads these alongside the Space key each frame — a
     * beam is a trigger you lean on, not a click. */
    trigger: { a: false, b: false },
    /* The mouse's contribution to the attitude command, in the same -1..1
     * units the arrow keys produce. It decays rather than being consumed,
     * so holding the mouse still mid-drag holds a rate instead of dropping
     * to zero between move events. */
    aimCmd: { pitch: 0, yaw: 0 }
  };

  /* The four things a node has, in the order the cycle key walks them.
   * Prograde first because it is the one nearly every burn needs, and time
   * last because it is the one you set once and then leave alone. */
  var NODE_AXES = [
    { id: 'pro', label: 'PROGRADE', short: 'PRO', color: '#8fe36a' },
    { id: 'nor', label: 'NORMAL',   short: 'NOR', color: '#c98ff0' },
    { id: 'rad', label: 'RADIAL',   short: 'RAD', color: '#6fb8ff' },
    { id: 'time', label: 'TIME',    short: 'T',   color: '#ffd27a' }
  ];

  /* ---- formatting ----------------------------------------------------- */

  function fmtDist(km) {
    var a = Math.abs(km);
    if (a < 1) return (km * 1000).toFixed(0) + ' m';
    if (a < 1000) return km.toFixed(2) + ' km';
    if (a < 1e6) return Math.round(km).toLocaleString('en-US') + ' km';
    if (a < 0.02 * AU) return (km / 1e6).toFixed(3) + ' Mkm';
    return (km / AU).toFixed(4) + ' AU';
  }

  function fmtSpeed(kms) {
    if (Math.abs(kms) < 0.001) return (kms * 1e6).toFixed(0) + ' mm/s';
    if (Math.abs(kms) < 1) return (kms * 1000).toFixed(1) + ' m/s';
    return kms.toFixed(3) + ' km/s';
  }

  function fmtTime(s) {
    if (!isFinite(s)) return '∞';
    var a = Math.abs(s);
    if (a < 90) return s.toFixed(1) + ' s';
    if (a < 5400) return (s / 60).toFixed(1) + ' min';
    if (a < 172800) return (s / 3600).toFixed(2) + ' h';
    if (a < 3.15e7) return (s / 86400).toFixed(2) + ' d';
    return (s / 3.1557e7).toFixed(3) + ' yr';
  }

  function fmtEpoch(s) {
    var yr = Math.floor(s / 3.1557e7);
    var rem = s - yr * 3.1557e7;
    var d = Math.floor(rem / 86400);
    rem -= d * 86400;
    var h = Math.floor(rem / 3600);
    var m = Math.floor((rem - h * 3600) / 60);
    return 'Y' + yr + ' D' + d + ' ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function fmtMass(kg) {
    if (kg > 1e29) return (kg / Gen.M_SUN).toFixed(3) + ' M☉';
    if (kg > 1e22) return (kg / Gen.M_EARTH).toFixed(3) + ' M⊕';
    return kg.toExponential(2) + ' kg';
  }

  function say(msg, seconds) {
    G.message = msg;
    G.messageUntil = performance.now() + (seconds || 3) * 1000;
  }

  /* ---- setup ---------------------------------------------------------- */

  /* Real seconds since the page loaded. Anything that blinks, flashes or
   * pulses because it is a physical light — as opposed to something the
   * simulation is doing — should be driven from here, so that time warp
   * and pausing leave it alone. */
  function nowSeconds() {
    return (global.performance && global.performance.now
            ? global.performance.now() : Date.now()) / 1000;
  }

  /* A new game is now a new GALAXY. The seed builds a cluster of a hundred
   * and fifty stars, of which star zero carries the seed unchanged — so
   * #kawartha still drops you into precisely the system it always did, with
   * everywhere else arranged around it. */
  function newGame(seed) {
    G.seed = seed;
    G.galaxy = Galaxy.build(seed);
    G.systemCache = {};
    G.visited = {};
    G.ship = null;
    G.t = 0;
    G.starMap = null;
    G.hyper = null;
    /* A new seed is a new career: no debts, no friends, no warrants. */
    G.standing = {};
    G.wanted = {};
    G.missions = [];
    G.doneMissions = {};
    G.campaigns = {};
    G.beams = [];
    G.explosions = [];
    G.hullWarned = false;
    G.wasDocked = false;
    enterSystem(G.galaxy.home, { fresh: true });

    if (typeof location !== 'undefined' &&
        decodeURIComponent((location.hash || '').replace(/^#/, '')) !== String(seed)) {
      try { history.replaceState(null, '', '#' + encodeURIComponent(seed)); } catch (e) {}
    }
    say(G.sys.name + '  —  ' + G.galaxy.stars.length + ' stars within reach of seed "' + seed + '"', 6);
    /* A pad is only a good opening if the way off it is obvious — and it has
     * to be ONE line, because `say` holds a single message. Two calls here
     * meant the first was overwritten before it was ever drawn, so the
     * player was told which key launches and never told what they were
     * sitting on. */
    if (G.startedDocked) {
      say('Docked at ' + G.startedDocked.name +
          '  —  M trade, F5 yard, F4 for launch clearance, then U', 12);
      G.startedDocked = null;
    }
  }

  /* Systems are cached by star, not regenerated. Generation is
   * deterministic so a fresh build would be identical — but the market's
   * player ledger and anything else the player has personally done to a
   * system lives on the system object, and a trade route you disturbed
   * should still be disturbed when you come back to it. */
  function systemFor(star) {
    if (!G.systemCache[star.id]) {
      var fac = (G.galaxy && G.galaxy.factionById) ? G.galaxy.factionById[star.factionId] : null;
      var opts = fac ? { faction: fac, allFactions: G.galaxy.factions } : undefined;
      G.systemCache[star.id] = Gen.generateSystem(star.seed, opts);
    }
    return G.systemCache[star.id];
  }

  function enterSystem(star, opts) {
    opts = opts || {};
    G.here = star;
    G.visited[star.id] = true;
    G.sys = systemFor(star);
    /* Clearances belong to the system you got them in. Nobody in the next
     * one has heard of you, which is also what stops a granted clearance
     * from quietly becoming permanent. */
    if (global.Combat) {
      Combat.clearAllClearances(G);
      /* Escaping the system ends the pursuit. The bounty stays on the
       * books — this buys distance from people who care, not absolution. */
      var fled = Combat.fleeSystem(G);
      if (fled) {
        say('You are clear of ' + fled.faction.toUpperCase() +
            ' space. The citation follows you; their patrols do not.', 6);
      }
    }
    G.wasDocked = false;

    G.stars = Render.makeStarfield(star.seed, 1600);
    /* Hand the sky to the GPU layer too. Same array, so the cruise-warp
     * smear in 2D still has the stars it needs to streak. */
    if (global.GLWorld && global.GLWorld.available) global.GLWorld.setStarfield(G.stars);
    G.orbitPaths = {};
    G.warpIndex = 0;
    /* A node names a moment and an orbit in the system it was planned in.
     * Neither survives arriving somewhere else, and a node object holding a
     * body from the system you just left is exactly the kind of stale
     * reference the nav lock was deliberately designed to avoid. */
    G.node = null; G.nodePlan = null; G.nodeAfter = null;
    G.nodeBurn = null; G.nodeHandles = null; G.nodeDrag = null;

    // Cache the local-space shape of every orbit once; the shape never
    // changes, only the parent it hangs off moves.
    for (var i = 0; i < G.sys.bodies.length; i++) {
      var b = G.sys.bodies[i];
      if (b.orbit) G.orbitPaths[b.id] = K.samplePath(b.orbit, b.kind === 'planet' ? 192 : 96);
    }

    // Start in orbit above a world worth being above: prefer one with a
    // station, then a habitable one, then just something in the middle.
    var host = null, stationHost = null, habitable = null;
    for (var j = 0; j < G.sys.bodies.length; j++) {
      var body = G.sys.bodies[j];
      if (body.kind === 'station' && !body.surface && !stationHost) stationHost = body.parentBody;
      if (body.kind === 'planet' && body.habitable && !habitable) habitable = body;
    }
    host = stationHost || habitable ||
           G.sys.bodies.filter(function (b) { return b.kind === 'planet'; })[1];

    // Find that world's station, if it has one, and start just below its
    // orbit — a lower orbit is a faster orbit, so you slowly catch up to it.
    // That is the first lesson in orbital mechanics, delivered for free.
    /* Arriving from slipspace, prefer the busiest world in the system —
     * the jump is aimed at a gravity well and there is no reason to aim it
     * at a quiet one. Starting a new game keeps the old rule. */
    if (opts.arrive) {
      var bestPort = null, bestDev = -1;
      (G.sys.ports || []).forEach(function (p) {
        if (p.market && p.market.dev > bestDev) { bestDev = p.market.dev; bestPort = p; }
      });
      if (bestPort) host = bestPort.parentBody;
    }

    var station = host.children.filter(function (c) { return c.kind === 'station'; })[0];
    G.homeStation = station || null;
    G.spawnHost = host;

    if (opts.arrive && G.ship) {
      /* Keep the ship and everything in it — the hull crossed the gap, and
       * so did the cargo, the money and whatever fuel the jump did not eat.
       * You emerge in a wide capture orbit rather than at rest in deep
       * space, because being dropped stationary next to a star with a full
       * hold and no plan is not an arrival, it is a problem. */
      var keep = G.ship;
      G.ship = Sim.circularOrbit(host, G.sys, G.t, host.radius * 5.5, 0.12, 1.1);
      G.ship.credits = keep.credits;
      G.ship.fuel = keep.fuel;
      G.ship.thrusterFuel = keep.thrusterFuel;
      G.ship.cargo = keep.cargo;
      Sim.refreshShip(G.ship);
      G.dockTarget = null;
      G.dockStatus = null;
      G.reported = false;
    } else {
      spawnShip(host, station, G.t);
      /* A NEW CAREER STARTS ON A PAD, not in a parking orbit.
       *
       * It used to open in a circular orbit above the home world, which
       * meant you began holding an orbit you had not established and did not
       * understand, looking at your own hull from an exterior camera whose
       * up is the world z axis and which therefore has no idea where the
       * planet's down is.
       *
       * (This is NOT what "it spawns on its side" turned out to be. That was
       * Sim.dockShip randomising roll through anyPerpendicular, which
       * save.js's re-dock on load then applied to every restored career —
       * see the note there. The spawn attitude itself measured exactly level
       * across five seeds. Both are fixed; they were separate.)
       *
       * Docked is a better first frame in every way. You are stationary,
       * nothing is decaying, the trade console and the yard are both
       * available before you have risked anything, and LAUNCHING is the
       * first thing you choose to do rather than the thing that has already
       * happened to you. It also means the first orbit you fly is one you
       * put yourself into, which is the lesson this game is actually about.
       *
       * Only on `fresh`, and only if the home world HAS somewhere to dock.
       * A respawn after a crash still arrives in orbit — being handed back
       * your ship on a pad would quietly undo the cost of having crashed. */
      if (opts.fresh) {
        /* A GROUND PORT FIRST, and a station only if the world has none.
         *
         * Not a preference about scenery — the two dock paths are not equally
         * safe to drop a ship into. The surface branch of Sim.dockShip places
         * the ship itself: it assigns a berth, positions the hull in the shed
         * and sets a level attitude with the nose out toward the doors. The
         * orbital branch captures the ship's CURRENT offset from the station,
         * which is right for something that has just flown a rendezvous and
         * wrong for us — spawnShip has just put the hull at 93% of the
         * station's orbital radius, so latching there would leave the player
         * "docked" a few hundred kilometres off the port.
         *
         * So the station case snaps the ship onto the clamps first, and the
         * ground case needs nothing. */
        var startPort = (G.sys.ports || []).filter(function (p) {
          return p.surface && p.parentBody === host && p.market;
        })[0] || station;
        if (startPort) {
          if (!startPort.surface) {
            var ps = Sim.bodyState(startPort, G.sys, G.t);
            G.ship.pos = V.clone(ps.pos);
            G.ship.vel = V.clone(ps.vel);
          }
          /* ARRIVE CLEARED, and this one bit almost immediately.
           *
           * Being docked makes the arrival check fire, and an arrival with
           * no clearance is an offence: the first frame of a brand-new
           * career charged 500 credits and logged the player FUGITIVE at
           * their own home port, for the crime of existing there. Worse, it
           * cascaded — a fugitive is refused docking, so the auto-dock tests
           * two thousand lines away started failing with "docked=null",
           * which reads like a broken autopilot rather than a fine.
           *
           * Clearance is SPENT on arrival, so granting it here is not a
           * favour, it is the correct bookkeeping for a ship that is already
           * on the pad: it had permission, and using it consumed it. */
          G.ship.cleared = G.ship.cleared || {};
          G.ship.cleared[startPort.id] = true;
          Sim.dockShip(G.ship, startPort, G.sys, G.t);
          /* G.homeStation IS DELIBERATELY LEFT ALONE. It looks like the
           * field for "the port you started at", and it is not: respawnShip
           * passes it straight to spawnShip, which reads `station.orbit.a`
           * to pick a parking altitude. A surface port has no `.orbit`, so
           * pointing homeStation at one turns the next crash into a
           * TypeError. It stays the orbital station, which is what every
           * reader of it already assumes. */
          G.spawnHost = host;
          G.viewMode = 'cockpit';
          G.dockTarget = null;
          G.dockStatus = null;
          /* NO LAUNCH CLEARANCE, deliberately. Both permissions are spent at
           * the moment they are used, so a ship that is already on the pad
           * has already spent its docking clearance — and asking for the
           * way OUT is a far better first action than being handed it.
           * It puts the player on the comms channel in the first minute,
           * which is where half this game's content lives and which nothing
           * else was ever going to teach them.
           *
           * It is only a good opening if it cannot read as being stuck, so
           * newGame says the two keys out loud below. */
          G.startedDocked = startPort;
        }
      }
    }

    G.focus = host;
    G.followShip = false;
    G.cam.target = V.clone(Sim.bodyPosition(host, G.sys, G.t));
    G.cam.dist = (station ? station.orbit.a : host.radius * 3) * 3.2;
    G.cam.yaw = 0.7; G.cam.pitch = 0.38;
    G.trajectoryStale = 0;
    G.trajJob = null;              // a job plotted in the old system means nothing here
    G.impactForecast = null;
    G.impactForecastStale = 0;
    G.lastMassiveBody = host;
    G.market = null;
    G.contact = null;
    /* A lock on something in the system you just left is not a lock, it is
     * a stale id that happens to match a different body. Release it. */
    G.navTarget = null;
    /* And a wake chase ends when you arrive: either you are here because you
     * followed it, in which case it is spent, or you went somewhere else, in
     * which case it was abandoned. Either way the intercept arithmetic was
     * computed from a departure point you are no longer standing on. */
    G.wakeChase = null;
    G._wakes = null;
    G.autodock = null;
    G.cruise = null;
    G.ledgerLog = [];
    G.fuelWarned = false;
    G.encounter = null;
    G.encounterWarned = false;
    G.lastDtSim = 0;
  }

  /* ---- interstellar space ------------------------------------------------
   * Arriving nowhere.
   *
   * `G.here` becomes a SYNTHETIC star sitting at the drop point rather than
   * one of the galaxy's real ones. That one substitution buys everything:
   * the chart's distances are measured from where you actually are, so the
   * jump out is priced honestly (you are only a light year or so from the
   * nearer star, and it is cheap); the wake code asks the timetable about a
   * star id no lane mentions and correctly finds nothing; and enterSystem
   * still takes a real star when you leave. Nothing else needed teaching.
   *
   * The other ship is planted as an ordinary patrol on an ordinary Kepler
   * orbit about the distant sun. Its period out here is measured in millions
   * of years, so it is stationary for every practical purpose — which is
   * exactly what a ship dead in the water should be — and the existing
   * wake/steer/sleep machinery handles it with no new code at all. The
   * player is then placed relative to IT rather than the other way round,
   * which avoids having to solve for orbital elements that land on a chosen
   * point. */
  var DROP_SEPARATION = 34;      // km between the two hulls on arrival

  function enterInterstellar(drop, other, mine) {
    var LY_KM = 9.4607304725808e12;
    var here = {
      id: 'drop:' + drop.from.id + '>' + drop.to.id + ':' +
          drop.progress.toFixed(4),
      seed: drop.nearer.seed,
      name: 'deep space',
      x: drop.x, y: drop.y, z: drop.z,
      cls: drop.nearer.cls, color: drop.nearer.color,
      temp: drop.nearer.temp, luminosity: drop.nearer.luminosity,
      factionId: null,
      interstellar: true,
      nearer: drop.nearer
    };

    G.here = here;
    G.sys = Gen.interstellarSystem(drop.nearer, {
      name: 'deep space — ' + drop.from.name + ' to ' + drop.to.name
    });
    /* NOT cached by id. A drop point is a place you were, once; caching one
     * would grow a dictionary of empty systems for the whole career and
     * every one of them would be identical anyway. */

    if (global.Combat) Combat.clearAllClearances(G);
    G.wasDocked = false;
    G.stars = Render.makeStarfield(drop.nearer.seed + ':deep', 1600);
    if (global.GLWorld && global.GLWorld.available) global.GLWorld.setStarfield(G.stars);
    G.orbitPaths = {};
    G.warpIndex = 0;
    G.node = null;

    /* Where the star actually is, in kilometres. The drop is measured along
     * the lane, so the range to the nearer star is the honest one. */
    var standoff = Math.max(0.02, drop.nearerLy) * LY_KM;

    var sun = G.sys.root;
    var spec = plantDropContact(other, standoff, mine);
    var npc = spec ? Sim.shipsAll(G.sys, G.t).filter(function (s) {
      return s.spec === spec;
    })[0] : null;

    /* Place the ship beside whatever we dropped next to. Matching its
     * velocity exactly, because the corridor collapsed around both of you at
     * once — arriving with a relative velocity would be a different event. */
    var basePos = npc ? npc.pos : { x: standoff, y: 0, z: 0 };
    var baseVel = npc ? npc.vel : V.zero();
    var side = V.norm(V.cross(V.norm(basePos), { x: 0, y: 0, z: 1 }));
    if (!isFinite(side.x)) side = { x: 0, y: 1, z: 0 };

    G.ship.pos = V.addScaled(basePos, side, DROP_SEPARATION);
    G.ship.vel = V.clone(baseVel);
    G.ship.thrust = V.zero();
    G.ship.docked = null;
    G.ship.landed = false;
    /* Face the thing you just pulled out of slipspace, or the star if there
     * is nothing to face — a ship that arrives pointing at nothing in an
     * empty sky gives the player no orientation to start from.
     *
     * Built as a whole orthonormal basis rather than by setting fwd alone.
     * Attitude here is fwd/up/right kept orthonormal every frame, and
     * assigning one of the three leaves the other two pointing wherever they
     * were before — which is how the ship once spawned at ninety degrees of
     * roll and made the whole game look broken on load. */
    var look = V.norm(npc ? V.sub(npc.pos, G.ship.pos) : V.scale(G.ship.pos, -1));
    if (!isFinite(look.x) || V.len(look) < 1e-9) look = { x: 1, y: 0, z: 0 };
    var refUp = { x: 0, y: 0, z: 1 };
    var right = V.cross(look, refUp);
    if (V.len(right) < 1e-6) right = V.cross(look, { x: 0, y: 1, z: 0 });
    right = V.norm(right);
    G.ship.fwd = look;
    G.ship.right = right;
    G.ship.up = V.norm(V.cross(right, look));
    Sim.refreshShip(G.ship);

    /* CLEARED, and this was a real bug the moment it was not.
     *
     * `homeStation` is an object plucked out of the system you were in. Out
     * here it points into a system that is no longer G.sys, so the HUD's
     * station pointer walked its parentBody chain looking for an orbit's mu
     * and found undefined — every frame, forever. Nothing about deep space
     * caused it; the arrival simply inherited a reference that had quietly
     * stopped meaning anything.
     *
     * This is the same trap the nav lock was deliberately built to avoid by
     * storing kind+id instead of an object, and it is why enterSystem has
     * its own long list of resets. Any new way of arriving somewhere has to
     * clear everything that names a place, not just the obvious ones. */
    G.homeStation = null;
    G.spawnHost = sun;
    G.reported = false;
    G.fuelWarned = false;

    G.focus = sun;
    G.followShip = true;
    G.cam.target = V.clone(G.ship.pos);
    G.cam.dist = 4.5;
    G.trajectory = null;
    G.trajectoryStale = 0;
    G.trajJob = null;
    G.impactForecast = null;
    G.impactForecastStale = 0;
    G.lastMassiveBody = sun;
    G.market = null;
    G.contact = null;
    G.navTarget = npc ? { kind: 'ship', id: spec.id } : null;
    G.dockTarget = null;
    G.dockStatus = null;
    G.autodock = null;
    G.cruise = null;
    G.ledgerLog = [];
    G.encounter = null;
    G.encounterWarned = false;
    G.lastDtSim = 0;
    G.starMap = null;
    G.panel = 0;
    G.wakeChase = null;
    G._wakes = null;
  }

  /* The other hull, as a patrol spec on a real (if absurdly slow) orbit. */
  function plantDropContact(other, standoff, mine) {
    if (!other) return null;
    var Pat = Gen.PATROL_CLASSES;
    var kind = other.hostile ? 'pirate' : 'trader';
    var art = other.hostile ? Pat.pirate : Gen.SHIP_CLASSES.freighter;

    var spec = {
      id: 'drop-' + (other.id || 'x').replace(/[^a-z0-9]/gi, ''),
      kind: kind,
      faction: other.hostile ? 'outlaw' : null,
      name: other.name,
      className: other.className,
      color: other.color || art.color,
      size: art.size,
      accel: art.accel,
      /* Carried through so the panels can say what you are looking at, and
       * so a later robbery knows how big a hull it is dealing with. */
      tonnes: other.tonnes,
      hullClass: other.hullClass,
      anchor: other.anchor,
      tornOut: true,
      interdictedByPlayer: !!mine,
      rail: {
        type: 'orbit',
        parent: G.sys.root.id,
        /* Circular, edge on, at the real standoff. The period at this radius
         * runs to millions of years, so "orbiting" is a technicality — it is
         * a way of being somewhere definite that the existing code already
         * knows how to evaluate. */
        el: { a: standoff, e: 0, inc: 0.02, lan: 0.4, argp: 0, m0: 0.2 }
      }
    };
    G.sys.patrols.push(spec);
    return spec;
  }

  /* ---- slipspace --------------------------------------------------------
   * The jump itself is four lines of bookkeeping, and that is the payoff
   * for having made a system a pure function of its seed: there is nothing
   * to save, nothing to load, and nothing to keep consistent. Burn the
   * propellant, advance the clock, and unfold the destination.
   *
   * Advancing the clock is the part that has teeth. Three days of transit
   * means arriving to a market that has moved three days on — freighters
   * have completed runs, warehouses have drained and refilled, and the
   * shortage you set out to exploit may have been relieved by somebody
   * who was closer. None of that needed writing; the economy was built as
   * a function of time, so it simply answers the new time correctly. */
  /* ---- the jump sequence ------------------------------------------------
   * The transit itself is bookkeeping — burn the propellant, advance the
   * clock, unfold the destination. But it is also the single most dramatic
   * thing that happens in this game, and Frontier understood that a jump
   * you cannot see is a jump that does not feel like one.
   *
   * So it plays out over about seven seconds of real time in three acts:
   * the drive spins up, the tunnel opens, and you come out the other side.
   * The system is swapped part-way through the tunnel, so you emerge into
   * the new sky rather than watching it appear.
   *
   * The clock runs visibly forward across the whole sequence — days
   * ticking past on the epoch readout — because the days are the point.
   */
  var HYPER_CHARGE = 1.5, HYPER_TUNNEL = 4.4, HYPER_EXIT = 1.3;
  var HYPER_SWAP_AT = 0.52;          // fraction through the tunnel

  function doJump(plan) {
    if (!plan || !plan.possible) {
      say('Not enough propellant — that jump needs ' + plan.fuel.toFixed(1) + ' t', 4);
      return;
    }
    if (G.ship.landed) { say('Cannot jump from a planetary surface', 3); return; }
    if (G.hyper) return;

    if (G.ship.docked) {
      Sim.undockShip(G.ship, G.sys, G.t, 0.003);
      G.dockTarget = null;
      G.dockStatus = null;
    }

    /* Settle the system we are leaving before the clock moves: put every
     * market back on its closed form at the CURRENT time, and put every
     * NPC back on its rail. Skipping this would fold a stale live stock
     * level into the ledger against a timestamp days in the future. */
    if (Eco) Eco.update(G.sys, G.t, null, Sim.bodyPosition);
    Sim.sleepAll(G.sys);
    HOOKS.sound('jump');

    G.ship.fuel = Math.max(0, G.ship.fuel - plan.fuel);
    Sim.refreshShip(G.ship);
    G.starMap = null;
    G.market = null;
    G.paused = false;
    G.keys = {};
    G.ship.thrust = V.zero();

    G.hyper = {
      plan: plan,
      phase: 'charge',
      elapsed: 0,
      total: HYPER_CHARGE + HYPER_TUNNEL + HYPER_EXIT,
      swapped: false,
      wasNew: !G.visited[plan.to.id],
      fromName: G.sys.name,
      departT: G.t,
      arriveT: G.t + plan.seconds,
      clock: G.t,
      time: 0, intensity: 0, flash: 0,
      /* The corridor. Opened for every jump, but it only becomes something
       * you FLY when the timetable says somebody else is in there — see
       * openCorridor. A hop down an empty lane still plays the seven-second
       * cutscene it always did, and that is deliberate: making every routine
       * jump interactive would tax the thing players do most in order to
       * decorate the thing they do rarely. */
      corridor: Slip.openCorridor({
        galaxy: G.galaxy,
        from: G.here, to: plan.to,
        distanceLy: plan.distance,
        tonnes: Slip.allUpMass(G.ship),
        anchor: Slip.moduleEffective(G.ship, 'anchor')
                  ? Slip.fittedClass(G.ship, 'anchor') : null,
        t: G.t,
        crimeFrom: G.sys.crimeScore || 0,
        crimeTo: crimeGuess(plan.to),
        cargoValue: cargoValue(G.ship),
        contraband: hasContraband(G.ship)
      })
    };
    if (G.hyper.corridor.live) {
      say('Slipspace corridor — traffic on this lane   ·   , / . throttle   ·   SPACE lock', 5);
    } else {
      say('Slipspace drive charging — ' + plan.to.name, 2.5);
    }
  }

  /* What the hold is worth, roughly, at catalogue value. Used only to decide
   * whether anybody thinks you are worth crossing a corridor for — a precise
   * figure would be false precision, since a pirate cannot read your manifest
   * before they catch you either. */
  function cargoValue(ship) {
    var total = 0;
    for (var cid in ship.cargo) {
      var row = Eco && Eco.BY_ID ? Eco.BY_ID[cid] : null;
      total += (ship.cargo[cid] || 0) * Math.abs(row ? row.base : 300);
    }
    return total;
  }

  function hasContraband(ship) {
    for (var cid in ship.cargo) {
      if ((ship.cargo[cid] || 0) <= 0) continue;
      var row = Eco && Eco.BY_ID ? Eco.BY_ID[cid] : null;
      if (row && row.contraband) return true;
    }
    return false;
  }

  /* How lawless is the place we are going? We have not been there, and we
   * are not going to generate a whole system to find out — that would cost a
   * full worldgen on every keystroke in the star chart. A visited system
   * answers honestly from the cache; an unvisited one is treated as neutral,
   * which is also the honest answer, because you genuinely do not know. */
  function crimeGuess(star) {
    var cached = G.systemCache && G.systemCache[star.id];
    if (cached && cached.crimeScore !== undefined) return cached.crimeScore;
    return 40;
  }

  /* One frame of the sequence. Returns true while it owns the game. */
  function advanceHyper(dtReal) {
    var hy = G.hyper;
    hy.elapsed += dtReal;
    hy.time += dtReal;

    /* A LIVE corridor takes over the middle act. The charge and the exit are
     * unchanged — they are the drive spinning up and settling down, and
     * nothing about having company changes either. What changes is that the
     * tunnel now lasts as long as the crossing takes rather than 4.4
     * seconds, and you fly it.
     *
     * The system swap moves to the START OF THE EXIT here, rather than 52%
     * of the way through the tunnel as it does for an ordinary jump. It has
     * to: you can be torn out at any point in the corridor, and swapping
     * early would mean already standing in the destination system at the
     * moment you get dragged into deep space instead. */
    if (hy.corridor && hy.corridor.live && hy.elapsed >= HYPER_CHARGE && !hy.corridorDone) {
      return advanceCorridorPhase(dtReal);
    }

    var e = hy.elapsed;
    if (e < HYPER_CHARGE) {
      hy.phase = 'charge';
      var c = e / HYPER_CHARGE;
      // Spins up slowly then all at once, which is what spinning up is.
      hy.intensity = c * c * 0.85;
      hy.flash = c > 0.93 ? (c - 0.93) / 0.07 * 0.9 : 0;
    } else if (e < HYPER_CHARGE + HYPER_TUNNEL) {
      hy.phase = 'tunnel';
      var u = (e - HYPER_CHARGE) / HYPER_TUNNEL;
      hy.intensity = 1;
      // Entry flash decaying, then the exit flash beginning to build.
      hy.flash = u < 0.12 ? (1 - u / 0.12) * 0.9 : 0;

      /* Swap systems mid-tunnel. Doing it at the far end would mean the
       * exit flash clears onto the sky you just left for a frame; doing it
       * here means you genuinely come out somewhere else. */
      if (!hy.swapped && u >= HYPER_SWAP_AT) {
        hy.swapped = true;
        G.t = hy.arriveT;
        enterSystem(hy.plan.to, { arrive: true });
      }
    } else {
      hy.phase = 'exit';
      var x = (e - HYPER_CHARGE - HYPER_TUNNEL) / HYPER_EXIT;
      hy.intensity = 1 - x * x;
      hy.flash = x < 0.30 ? (1 - x / 0.30) * 0.75 : 0;
    }

    /* The clock, running forward across the whole sequence. Eased so it
     * gallops through the middle and settles at the end rather than
     * ticking over linearly like a progress bar. */
    var p = Math.min(1, e / hy.total);
    hy.clock = hy.departT + (hy.arriveT - hy.departT) * Sim.smootherstep(p);

    if (hy.elapsed >= hy.total) {
      var plan = hy.plan, wasNew = hy.wasNew;
      G.hyper = null;
      if (!G.visited[plan.to.id]) enterSystem(plan.to, { arrive: true });
      say((wasNew ? 'Arrived at ' + G.sys.name + ' — first visit' : 'Arrived at ' + G.sys.name) +
          '   ·   ' + fmtTime(plan.seconds) + ' elapsed   ·   ' +
          plan.fuel.toFixed(1) + ' t burned', 8);
      return false;
    }
    return true;
  }

  /* ---- flying the corridor ----------------------------------------------
   * The middle act, when there is somebody in there with you.
   *
   * Two controls and no more. The throttle is a LEVER, not a momentary key:
   * , and . move it and it stays where you left it, because the whole skill
   * of an interception is setting a speed that matches somebody else's and
   * then leaving it alone. A momentary key would make holding station a
   * matter of drumming your fingers.
   *
   * Space is the interdiction trigger, which is the same key that fires the
   * guns in normal space. That is not laziness — in both cases it is the key
   * that means "do the aggressive thing to the contact I am on", and one
   * fewer binding to learn is worth more than a distinction nobody asked for.
   */
  var THROTTLE_RATE = 1.15;      // lever units per second while a key is held

  function advanceCorridorPhase(dtReal) {
    var hy = G.hyper, cor = hy.corridor;
    hy.phase = 'tunnel';
    hy.intensity = 1;
    hy.flash = Math.max(0, hy.flash - dtReal * 3);

    /* The lever. Clamped, and deliberately not self-centring. */
    var want = cor.throttle;
    if (G.keys['.']) want += THROTTLE_RATE * dtReal;
    if (G.keys[',']) want -= THROTTLE_RATE * dtReal;
    want = Math.max(-1, Math.min(1, want));

    Slip.advanceCorridor(cor, dtReal, {
      throttle: want,
      lockHeld: !!G.keys[' ']
    }, G.ship);

    // The clock keeps running forward, which was always the point of a jump.
    hy.clock = Slip.corridorClock(cor);
    G.t = hy.clock;

    for (var i = 0; i < cor.events.length; i++) {
      var ev = cor.events[i];
      if (ev.kind === 'contact') {
        say('CONTACT — ' + ev.contact.name + '  ·  ' + ev.contact.className +
            (ev.contact.hostile ? '  ·  HOSTILE' : ''), 4);
        HOOKS.sound(ev.contact.hostile ? 'alarm' : 'blip');
      } else if (ev.kind === 'huntWarn') {
        say('INTERDICTION LOCK BUILDING — ' + ev.contact.name, 5);
        HOOKS.sound('alarm');
      } else if (ev.kind === 'tearFailed') {
        say('Not enough reaction mass to tear them out — needs ' +
            ev.need.toFixed(1) + ' t', 5);
      }
    }

    if (cor.outcome === 'tore') {
      hy.corridorDone = true;
      dropOut(cor, cor.tornContact, true);
      return false;
    }
    if (cor.outcome === 'torn') {
      hy.corridorDone = true;
      dropOut(cor, cor.tornBy, false);
      return false;
    }
    if (cor.outcome === 'arrived') {
      /* Hand back to the ordinary sequence for the exit flash, with the
       * clock already where it should be. Rewinding `elapsed` to the top of
       * the exit phase is what makes the last 1.3 seconds play normally. */
      hy.corridorDone = true;
      hy.elapsed = HYPER_CHARGE + HYPER_TUNNEL;
      hy.arriveT = G.t;
      hy.departT = G.t - cor.crossSeconds;
      hy.swapped = true;
      enterSystem(hy.plan.to, { arrive: true });
    }
    return true;
  }

  /* ---- torn out ----------------------------------------------------------
   * Somewhere between two stars, with one other ship and nothing else.
   *
   * The locale is an ordinary system containing exactly one body — the
   * nearer star, about a light year off — so nothing in the sim or the
   * renderer needs a special case for "nowhere". See Gen.interstellarSystem.
   *
   * `mine` says whose doing this was: you tore them out, or they tore you.
   * The difference is entirely in who is holding whom up afterwards; the
   * physics of arriving is identical, which is as it should be. */
  function dropOut(cor, other, mine) {
    var drop = Slip.dropPoint(cor.from, cor.to, cor.progress);
    var granted = Slip.grantReserve(G.ship, drop, Galaxy.FUEL_PER_LY_PER_TONNE);

    G.hyper = null;
    G.paused = false;
    G.keys = {};

    enterInterstellar(drop, other, mine);

    if (mine) {
      say('TORN OUT — ' + other.name + ' is dead in the water beside you', 9);
      /* AND WHAT TO DO WITH IT. The chase, the lock and the drop-out were
       * all built before there was anything to do at the end of them, and
       * the arrival read as an empty room partly because nobody was told
       * where the door was: the demand lives on the comms channel, three
       * keys away, and a player who has never robbed anyone in-system has no
       * reason to guess that. Said as a separate line from the alarm so it
       * survives being skimmed.
       *
       * And it says what is TRUE about doing it here, which is not "nobody
       * will know". There are no witnesses in deep space — witnessNear finds
       * nothing, because there is nothing — but the victim still squawks its
       * own distress call about ten seconds in, and that is what puts a
       * bounty on you. So the line points at the real decision rather than
       * promising a free crime the law will immediately disprove. */
      say('F4 to hail them. No witnesses out here — but they can still call it in.', 9);
    } else {
      say('INTERDICTED — ' + other.name + ' has pulled you out of the corridor', 9);
    }
    if (granted > 0) {
      /* Say it out loud. A reserve that silently appears on the gauge is
       * indistinguishable from a bug, and a player who decides the fuel
       * readout lies will stop believing every other instrument too. */
      say('Emergency reserve tapped — ' + granted.toFixed(1) +
          ' t, enough to reach ' + drop.nearer.name, 8);
    }
    HOOKS.sound('alarm');
  }

  /* Stars sorted by how far they are from here — the order the map lists
   * them in, and the order the selection walks. */
  function jumpCandidates() {
    var here = G.here;
    var out = [];
    for (var i = 0; i < G.galaxy.stars.length; i++) {
      var s = G.galaxy.stars[i];
      if (s === here) continue;
      out.push(Galaxy.jumpPlan(G.galaxy, here, s, G.ship));
    }
    out.sort(function (a, b) { return a.distance - b.distance; });
    return out;
  }

  function openStarMap() {
    if (G.ship.landed) { say('No slipspace drive alignment on the ground', 3); return; }
    G.keys = {};
    G.ship.thrust = V.zero();
    selectPanel(5);
  }

  /* The plotted course: whichever star the chart is sitting on. The JUMP
   * mode reads it, so plotting and engaging are two deliberate acts on two
   * different screens rather than one keystroke on a list. */
  function plottedCourse() {
    if (!G.starMap || !G.starMap.list.length) return null;
    return G.starMap.list[Math.min(G.starMap.sel, G.starMap.list.length - 1)];
  }

  function handleStarMapKey(e) {
    var m = G.starMap;
    if (!m) return false;
    var key = e.key.toLowerCase();
    m.list = jumpCandidates();
    if (key === 'arrowdown') { m.sel = Math.min(m.list.length - 1, m.sel + 1); return true; }
    if (key === 'arrowup') { m.sel = Math.max(0, m.sel - 1); return true; }
    if (key === 'pagedown') { m.sel = Math.min(m.list.length - 1, m.sel + 10); return true; }
    if (key === 'pageup') { m.sel = Math.max(0, m.sel - 10); return true; }
    if (key === 'home') { m.sel = 0; return true; }
    if (key === 'enter') { selectPanel(7); return true; }
    return false;
  }

  /* Placed here rather than inline so a crash has somewhere to go back to:
   * respawnShip() calls this again at the current sim time. */
  function spawnShip(host, station, atTime, keepShip) {
    var startAlt = station
      ? (station.orbit.a * 0.93 - host.radius)
      : host.radius * 0.55;
    if (startAlt < host.radius * 0.06) startAlt = host.radius * 0.25;

    var prev = keepShip ? G.ship : null;
    G.ship = Sim.circularOrbit(host, G.sys, atTime, startAlt,
                               station ? station.orbit.inc : 0.05, 0.6);
    /* A respawn after a crash replaces the hull, not the career: credits
     * survive, and so does the fuel bill. The cargo does not — it was in
     * the hull. */
    if (prev) {
      G.ship.credits = prev.credits;
      G.ship.fuel = Math.max(prev.fuel * 0.5, G.ship.fuelCap * 0.35);
      G.ship.thrusterFuel = G.ship.thrusterCap;
    }
    Combat.initShip(G.ship);
    /* Your own registration, painted on the hull of every ship you will
     * ever fly under this seed. The career keeps the code; hulls come and
     * go. */
    G.ship.reg = Sim.regCode(G.seed + '|player');
    Sim.refreshShip(G.ship);
    G.reported = false;
    G.dockTarget = null;
    G.market = null;
    G.viewMode = 'orbit';
  }

  /* Bring the ship back after a crash. There is no "undo" for a decayed
   * orbit or a bad burn — you get a fresh start above the same world you
   * spawned at, at the CURRENT simulation time, not a reload. */
  function respawnShip() {
    if (!G.ship.landed) { say('Not crashed — nothing to respawn from', 2); return; }
    spawnShip(G.spawnHost, G.homeStation, G.t, true);
    Combat.stripForRespawn(G.ship);
    G.deadPanels = {};
    say('Respawned above ' + G.spawnHost.name + ' — cargo lost, hull replaced', 5);
  }

  /* Hull at zero. Same deal as a crash — the hull and everything bolted to
   * or stacked in it is gone; the pilot, the money, the reputation and the
   * warrants all survive, because none of those were in the hull. */
  function playerDestroyed() {
    (G.explosions = G.explosions || []).push({
      pos: V.clone(G.ship.pos), at: performance.now(), size: 2.5
    });
    HOOKS.sound('explosion');
    spawnShip(G.spawnHost, G.homeStation, G.t, true);
    Combat.stripForRespawn(G.ship);
    G.hullWarned = false;
    G.deadPanels = {};              // a new hull comes with working screens
    G.navTarget = null;
    G.autodock = null;
    G.cruise = null;
    say('SHIP DESTROYED — pod recovered above ' + G.spawnHost.name +
        '. Cargo and fittings lost; credits and reputation intact.', 10);
  }

  /* Everything the combat and mission modules are allowed to do back to
   * the game: talk, make noise, and end you. */
  var HOOKS = {
    say: say,
    sound: function (n) { if (global.Sound) global.Sound.fx(n); },
    destroyed: playerDestroyed,
    hullHit: hullHit
  };

  /* ---- damage, from the inside -------------------------------------------
   * Hull loss used to be a number on a page. It is now something that
   * happens in the room you are sitting in: the lights flare, and a hit
   * hard enough can take a console screen out until a yard replaces it.
   *
   * The screens are not decoration — losing the scope in a fight is losing
   * the thing that tells you where your attacker is, and that is exactly
   * the cost a hit should carry. Nothing is destroyed permanently; the yard
   * charges for the glass along with the hull. */
  var PANEL_IDS = ['left', 'centre', 'right', 'rear-left', 'rear-right'];

  function hullHit(dmg) {
    G.hitAt = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (!G.deadPanels) G.deadPanels = {};
    /* A graze rattles the cabin; a real hit has about an even chance of
     * taking a screen with it. Capped so that one unlucky salvo cannot
     * blind you completely — the last living panel is never the one that
     * goes. */
    var live = PANEL_IDS.filter(function (id) { return !G.deadPanels[id]; });
    if (live.length <= 1) return;
    if (Math.random() > Math.min(0.5, dmg / 30)) return;
    var id = live[(Math.random() * live.length) | 0];
    G.deadPanels[id] = true;
    say(id.replace('-', ' ').toUpperCase() + ' PANEL OUT — a yard can replace it', 5);
    if (global.Sound) global.Sound.fx('hit');
  }

  /* ---- input ---------------------------------------------------------- */

  var canvas, ctx, dragging = false, lastX = 0, lastY = 0;

  /* Held mouse-trigger state, read by Combat.update every frame. Module
   * scope rather than inside bindInput because everything that takes the
   * mouse away — losing the window, dropping out of mouse-aim, opening a
   * screen — has to be able to let go of the trigger, and a ship that goes
   * on firing at nothing because the release never arrived is the worst
   * possible version of this bug. */
  function releaseTriggers() {
    if (!G.trigger) return;
    G.trigger.a = false; G.trigger.b = false;
    /* Latches go too. Letting go because the window was lost or the mode
     * changed is not a shot the player asked for. */
    G.trigger.aLatch = false; G.trigger.bLatch = false;
  }

  /* Can a click be a trigger pull at all? Every case where a click means
   * something else has to be excluded first, and each exclusion here is a
   * bug that would otherwise be indistinguishable from the guns not
   * working. View-independent: the guns do not stop existing because you
   * pulled the camera outside to watch. */
  function weaponsLive() {
    return flying() && !menuOpen() && !G.cursor.active &&
           !G.hyper && !G.ship.docked && !G.ship.landed;
  }

  /* Mouse 1 is a trigger only where it is not already the camera. In the
   * exterior view, left-drag swings the view around the ship and that is
   * what the view is FOR, so out there the primary group stays on Space and
   * only the buttons nothing else wants — right, and the side button — do
   * any shooting. Gating all three on the cockpit was the reason the mouse
   * appeared to do nothing at all from outside. */
  function mouseArmed() {
    return weaponsLive() && G.viewMode === 'cockpit' && G.mouseAim;
  }

  /* Which button, treating "didn't say" as the main one. Synthetic events —
   * the render suite's, and anything else that dispatches by hand — carry
   * no `button`, and reading undefined as "not the left button" turned every
   * one of them into a no-op. Nothing else in this file had ever looked at
   * `button` before triggers arrived, so nothing was passing one. */
  function mouseButton(e) { return (e && e.button) || 0; }

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      /* Space is the trigger, and left to itself a browser takes it as
       * "scroll the page" — which for a full-viewport canvas means a
       * gunfight that jiggles. */
      if (e.key === 'Tab' || e.key === ' ' || e.key.indexOf('Arrow') === 0) e.preventDefault();
      if (global.Sound) global.Sound.poke();

      /* The instrument bar. Function keys first, digits as the fallback,
       * because a browser that insists F1 means "help" should cost the
       * player a page of instruments, not the whole control scheme. */
      /* Left Alt is the cursor modifier, not a character. Swallow it before
       * anything else looks at it: left to itself a browser takes Alt as
       * "focus the menu bar", which pulls keyboard focus clean out of the
       * canvas and leaves the ship deaf mid-burn. */
      /* The two Alts are the two ways of taking the mouse off the stick, and
       * they are symmetric on purpose: LEFT hands it to the interface, RIGHT
       * hands it to your neck. Right Alt was already being swallowed here
       * and thrown away, so the test for it predates the feature.
       *
       * Free-look exists because mouse-aim now steers with no button held —
       * which is what freed the buttons to be triggers, and which left no
       * way at all to look around. A modifier rather than a toggle, for the
       * reason setCursorMode already gives: you reach for it, do one thing,
       * and let go, so there is never a state to be surprised by while
       * somebody is shooting at you. */
      if (e.key === 'Alt') {
        e.preventDefault();
        if (e.location !== 2) setCursorMode(true);   // 2 = right Alt
        else setFreeLook(true);
        return;
      }

      /* The mode keys are answered before anything else can claim them, so
       * there is always a way back to the cockpit from any screen. The one
       * exception is the tunnel: you cannot press anything mid-jump. */
      /* The menu and the title screen sit in front of everything, including
       * the instrument keys: they stopped time, and a function key that
       * changed the page underneath a modal would be changing something you
       * cannot see. They are answered before the F-keys for that reason. */
      if (G.title) { handleTitleKey(e); return; }
      if (G.menu) { handleMenuKey(e); return; }

      /* A text field takes the WHOLE keyboard, and it has to be asked here
       * rather than down in modeKey: the function keys and the number row
       * are claimed a few lines below, and a pilot named "Kat 7" would
       * otherwise flip to MFD page 7 halfway through typing her own name. */
      if (global.Screens && global.Screens.editing()) {
        e.preventDefault();
        global.Screens.editKey(e);
        return;
      }

      var fk = /^F(10|[1-9])$/.exec(e.key);
      if (fk) {
        e.preventDefault();
        if (!G.hyper && !G.market) {
          var fkIdx = parseInt(fk[1], 10) - 1;
          /* F1 twice: already flying, so the second press flips between the
           * cockpit and the exterior chase camera. One key, both ways of
           * looking at your own ship. */
          if (fkIdx === 0 && flying()) toggleView();
          else selectPanel(fkIdx);
        }
        return;
      }
      /* The number row mirrors the function keys. 0 is the tenth mode
       * because it sits where a 10 key would if keyboards had one. */
      if (!G.hyper && !G.market && /^[0-9]$/.test(e.key)) {
        var numIdx = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
        if (numIdx === 0 && flying()) toggleView();
        else selectPanel(numIdx);
        return;
      }

      /* While the trade console is up it takes every key. A market screen
       * that let the arrow keys also pitch the ship would be a menu that
       * silently flies you into a station. */
      /* Nothing to fly while you are in the tunnel, and nothing to press.
       * Frontier did not let you steer mid-jump either.
       *
       * UNLESS the corridor is live. Then there are exactly three keys — the
       * two throttle keys and the interdiction trigger — and they have to be
       * recorded as HELD state rather than handled here, because the throttle
       * is a lever you push and the trigger is something you hold. Everything
       * else stays dead: you still cannot steer, open a screen, or change
       * your mind about where you are going. */
      if (G.hyper) {
        if (G.hyper.corridor && G.hyper.corridor.live &&
            (e.key === ',' || e.key === '.' || e.key === ' ')) {
          G.keys[e.key.toLowerCase()] = true;
          e.preventDefault();
        }
        return;
      }
      if (G.market) { handleMarketKey(e); return; }
      /* A full-screen mode gets first refusal on the keyboard: the arrow
       * keys mean "walk this list" while a list is what you are looking at,
       * and mean "point the nose" when it is not. Anything the mode does
       * not want falls through to the flight controls, so the ship never
       * stops answering the thrust keys just because you opened a screen. */
      if (!flying() && modeKey(e)) return;

      G.keys[e.key.toLowerCase()] = true;

      switch (e.key.toLowerCase()) {
        /* In cruise these set the drive's speed instead of the clock —
         * there is no reason to accelerate time when you are already
         * crossing a system in a couple of minutes. */
        case ',':
          if (G.cruise) G.cruise.speed = Math.max(CRUISE_MIN, G.cruise.speed / 1.6);
          else G.warpIndex = Math.max(0, G.warpIndex - 1);
          break;
        case '.':
          if (G.cruise) G.cruise.speed = Math.min(G.cruise.maxSpeed, G.cruise.speed * 1.6);
          else G.warpIndex = Math.min(WARPS.length - 1, G.warpIndex + 1);
          break;
        case 'p': G.paused = !G.paused; break;
        case 'o': G.showOrbits = !G.showOrbits; break;
        case 'v': G.showPrediction = !G.showPrediction; break;
        /* G is two things, split by the shift key: the grid unshifted, the
         * landing gear shifted. They share a case because they have to —
         * a second `case 'g'` further down is unreachable, which is exactly
         * how the gear binding failed silently the first time.
         *
         * Shift for the gear, deliberately: unshifted G is one slip from the
         * thrust keys, and dropping the gear at speed in an atmosphere is
         * not a mistake to make with a little finger. F12 was the first
         * choice and cannot be used at all — Chrome keeps it for the
         * developer tools and the page never sees the key. */
        case 'g':
          if (e.shiftKey) toggleGear();
          else G.showGrid = !G.showGrid;
          break;
        case 'h': G.showHelp = !G.showHelp; break;
        /* Escape means "out of this" everywhere, and it already meant it on
         * every mode screen (modeKey sends you back to flight). In flight
         * there was nothing left to back out to, which is exactly where a
         * pause menu belongs. The help card counts as something to leave. */
        case 'escape':
          if (G.showHelp) { G.showHelp = false; break; }
          openMenu();
          break;
        /* Context-sensitive rather than a second keybinding: while someone
         * is holding you up, C is the only thing you would want it to mean,
         * and the demand panel says so. Everywhere else it is the camera. */
        case 'c':
          if (G.encounter && G.encounter.demand) { complyWithDemand(); break; }
          if (!G.followShip) { G.followShip = true; say('Camera tracking ship'); }
          else if (G.focus) { G.followShip = false; say('Camera holding on ' + G.focus.name); }
          else say('Nothing else focused — Tab picks a body first', 2);
          break;
        case 'tab': cycleFocus(e.shiftKey ? -1 : 1); break;
        /* Every letter on the keyboard was already spoken for, which is
         * why the flight-mode toggle lives on a punctuation key. Shift
         * splits it: the mode itself, and the assist that rides on it. */
        case '/': case '?':
          if (e.shiftKey) {
            G.assist = !G.assist;
            say(G.assist ? 'Flight assist ON — drift nulled against your lock'
                         : 'Flight assist OFF — full Newtonian', 4);
          } else {
            G.flightMode = (G.flightMode === 'ship') ? 'orbital' : 'ship';
            say(G.flightMode === 'ship'
                  ? 'SHIP frame — W drives the nose, A/D and R/F strafe'
                  : 'ORBITAL frame — W prograde, A/D radial, R/F normal', 5);
          }
          break;
        case 'n':
          var freshSeed = prompt('Seed for the new system:', G.seed) || G.seed;
          if (global.Save) global.Save.clear(freshSeed);  // N means NEW, not "reload"
          newGame(freshSeed);
          break;
        case 'x': killRotation(); break;
        /* B was respawn from the start; missiles arrived later and wanted a
         * key. It stays both, split by context: a crashed ship has no
         * missiles worth speaking of, and a flying one has no respawning to
         * do. */
        case 'b':
          if (G.ship.landed) respawnShip();
          else Combat.fireMissile(G.sys, G, G.t, HOOKS);
          break;
        case 'enter':
          toggleView();
          break;
        case 't':
          /* Shift turns the docking key into the other two autopilots: the
           * three of them are one idea — let the ship fly the boring part
           * toward the thing you have locked — so they live on one key. */
          if (e.shiftKey) { startAutoMode('match'); break; }
          if (G.ship.docked) { say('Already docked — U to undock', 2); break; }
          /* Prefer the navigation lock, falling back to the camera focus.
           * Having to Tab the camera onto a station before you could dock
           * with it conflated two unrelated things: where you are looking
           * and where you are going. */
          var dockCand = null;
          var nav = navTargetState();
          if (nav && nav.kind === 'body' && nav.obj.kind === 'station') dockCand = nav.obj;
          else if (G.focus && G.focus.kind === 'station') dockCand = G.focus;
          /* T is the whole docking control, and it is contextual because
           * every letter that would have made a good second one is already
           * a thruster. Assign the clamp first; press it again and the
           * autopilot flies the approach.
           *
           * The obvious binding for auto-dock was A — which is also radial-
           * in thrust, so engaging it registered a manual burn on the same
           * keystroke and it cancelled itself before the next frame. */
          if (G.autodock) { cancelAutodock('cancelled'); break; }
          if (dockCand && G.dockTarget === dockCand) { startAutodock(); break; }
          if (dockCand) {
            G.dockTarget = dockCand;
            say('Docking clamp assigned: ' + dockCand.name + '  —  T again to auto-dock', 4);
          } else {
            say('Lock a station first — [ ] cycles the nav list, then T', 3);
          }
          break;
        case '[': cycleNavTarget(-1); break;
        case ']': cycleNavTarget(1); break;
        case 'l':
          if (e.shiftKey) { startAutoMode('follow'); break; }
          clearNavTarget();
          break;
        case 'home': recentreLook(); break;
        case 'm': openMarket(); break;
        case 'k':
          /* A career saved before this key existed comes back without the
           * field, and NaN % 3 is a state you cannot cycle out of. */
          G.cockpitChrome = ((G.cockpitChrome || 0) + 1) % 3;
          G.showCockpitFrame = G.cockpitChrome !== 2;
          say(G.cockpitChrome === 0 ? 'Instrument band' :
              G.cockpitChrome === 1 ? 'Band stowed — instruments on the console' :
                                      'Canopy only', 2.5);
          break;
        case 'y': G.showTraffic = !G.showTraffic;
                  say(G.showTraffic ? 'Traffic shown' : 'Traffic hidden', 2); break;
        case '`': case '~': cycleRenderScale(); break;
        /* J is the chart; Shift+J lays a course in from whatever wake the
         * scanner can currently read. A shifted branch inside the one case,
         * NOT a `case 'J'` — this switch matches lowercased keys, so an
         * upper-case case label is silently unreachable. */
        case 'j':
          if (e.shiftKey) followWake();
          else openStarMap();
          break;
        case 'z': toggleCruise(); break;

        /* Manoeuvre nodes. Deliberately a cluster on the right of the
         * keyboard, well away from the thrust and attitude keys — planning
         * and flying are different activities and a mis-hit should not turn
         * one into the other. (This is the mistake auto-dock made once, by
         * living on A, which was also radial-in thrust.) */
        case 'i':
          if (e.shiftKey) clearNode();
          else if (!G.node) placeNode();
          else cycleNodeAxis(1);
          break;
        /* Zoom, unless there is a manoeuvre node up — then these are the
         * node's delta-v nudge, which is what you want them to be while you
         * are looking at a burn you are planning. Placing a node is I, so
         * nothing is lost: only the node's own adjustment shares the keys,
         * and only while a node exists. Both the shifted and unshifted forms
         * are bound because the two differ by keyboard layout and nobody
         * pressing "minus" cares which one the browser reports. */
        case '-': case '_':
          if (G.node) adjustNode(-1, e.shiftKey, e.ctrlKey);
          else zoomBy(1.25, true);
          break;
        case '=': case '+':
          if (G.node) adjustNode(+1, e.shiftKey, e.ctrlKey);
          else zoomBy(1 / 1.25, true);
          break;
        case ';': case ':': snapNode('peri'); break;
        case "'": case '"': snapNode('apo'); break;
        case '\\': case '|': startNodeBurn(); break;
        case 'backspace': jettisonWaste(); break;
        case 'u':
          if (G.ship.docked) {
            /* A surface port is a hangar behind closed doors now, so
             * leaving one is something you are given rather than something
             * you take. Orbital docks are open clamps and stay free to
             * leave — nothing is holding you in. */
            var leaving = G.sys.byId[G.ship.docked];
            if (leaving && leaving.surface && !Combat.launchCleared(G, leaving)) {
              say(leaving.name + ': "The doors are shut. Request launch on F4."', 5);
              HOOKS.sound('warn');
              break;
            }
            if (leaving) Combat.spendLaunch(G);
          }
          if (G.ship.docked) {
            // Fully let go: clear the nav target too, or the capture check
            // in update() sees the ship still sitting inside the envelope
            // one frame later (a few m/s of separation isn't far) and
            // re-docks it before the player's thumb is off the key. Press
            // T again to re-target if you actually want back in.
            var left = Sim.undockShip(G.ship, G.sys, G.t, 0.003);
            G.dockTarget = null;
            G.dockStatus = null;
            HOOKS.sound('undock');
            say('Undocked from ' + left.name + '  (T to re-target)', 4);
          } else {
            say('Not docked', 2);
          }
          break;
      }
    });
    window.addEventListener('keyup', function (e) {
      /* Both, unconditionally. A keyup does not always report the location
       * the keydown did — and a free-look that latches on because the
       * release came back as the wrong Alt is a ship that has stopped
       * answering the mouse for no visible reason. */
      if (e.key === 'Alt') { setCursorMode(false); setFreeLook(false); return; }
      G.keys[e.key.toLowerCase()] = false;
    });
    /* Alt-tabbing away releases the key somewhere we will never hear about
     * it, and a cursor mode that latches on is a mouse that has stopped
     * flying the ship for no visible reason. */
    window.addEventListener('blur', function () {
      setCursorMode(false); setFreeLook(false); G.keys = {};
    });

    /* ---- the mouse as a weapon -------------------------------------------
     * The conflict, stated plainly: in the cockpit, left-drag already turns
     * your head. Mouse 1 cannot both look and fire.
     *
     * The resolution is that mouse weapons are part of MOUSE-AIM MODE (F9).
     * With it on, the mouse is a stick and does not need a held button to
     * steer, so the buttons are free to be triggers: 1 fires group A, 2
     * fires group B, and the middle button launches the selected missile —
     * which is where missiles had to go once both main buttons became
     * triggers. With mouse-aim off, nothing below changes: left-drag looks
     * around exactly as it always did, and Space and B still shoot, because
     * somebody flying on a trackpad still needs to fight.
     *
     * G.trigger is HELD state, read by Combat.update each frame, not a
     * one-shot on the click: a beam is a trigger you lean on. */
    canvas.addEventListener('mousedown', function (e) {
      lastX = e.clientX; lastY = e.clientY;

      /* Buttons first, always. The icon bar and every control on a mode
       * screen live here, and a click that lands on one must never also
       * swing the camera, turn the pilot's head, or fire the guns. */
      if (global.Sound) global.Sound.poke();
      var spot = overHot(e.clientX, e.clientY);
      if (spot) { HOOKS.sound('click'); spot.fn(); return; }

      if (G.cursor.active) {
        cursorAt(e.clientX, e.clientY);
        beginHandleDrag();
        return;                       // never both grab a handle and pan
      }

      var btn = mouseButton(e);
      if (weaponsLive()) {
        /* The latch is what makes a TAP fire. Held state is read once per
         * frame, so a press and release inside one frame — a quick click,
         * or any synthetic event pair — would set the trigger and clear it
         * again without a single frame ever seeing it, and the gun would
         * silently not go off. The latch survives the release until the
         * frame after it has been read, so a click is exactly one shot and
         * a hold is sustained fire, which is what both gestures mean. */
        if (btn === 0 && mouseArmed()) {
          G.trigger.a = true; G.trigger.aLatch = true; return;
        }
        if (btn === 2) { G.trigger.b = true; G.trigger.bLatch = true; return; }
        /* Missiles on the side button (mouse 4) and on the wheel click.
         *
         * Mouse 4 is the one you want: it is where a thumb already rests, it
         * is not a button you press by accident, and clicking a scroll wheel
         * hard enough to register tends to scroll at the same time. The wheel
         * stays bound anyway because plenty of mice and every trackpad have
         * no fourth button, and B works from the keyboard regardless — a
         * binding nobody can reach is not a binding.
         *
         * Deliberately NOT a held trigger like the guns. A missile is a
         * discrete thing you spend, and it needs a lock (fireMissile refuses
         * without one and says so), so leaning on the button would just
         * repeat the same refusal several times a second. */
        if (btn === 3 || btn === 1) {
          if (e.preventDefault) e.preventDefault();
          Combat.fireMissile(G.sys, G, G.t, HOOKS);
          return;
        }
      }

      /* Nothing to drag on a full-screen mode: the world is not visible, so
       * a drag would be turning a camera nobody can see. The orbit map is
       * the exception — turning the world is what it is for. */
      if (!flying() && !mapMode()) return;
      /* A modal stopped the world; dragging the camera around behind it is
       * not something the click was asking for. */
      if (menuOpen()) return;
      /* Only the left button pans. Before triggers existed every button
       * landed here, so a right-click swung the camera and opened the
       * browser menu on top of it. */
      if (btn !== 0) return;
      dragging = true;
    });
    window.addEventListener('mouseup', function (e) {
      dragging = false;
      /* Only the two buttons that ARE triggers release one. The `else` here
       * used to catch the side button too, so launching a missile mid-burst
       * cut your own guns. */
      var up = mouseButton(e);
      if (up === 2) G.trigger.b = false;
      else if (up === 0) G.trigger.a = false;
      if (G.nodeDrag) { G.nodeDrag = null; G.nodeStale = 0; }
    });
    /* Without this, mouse 2 opens the browser's context menu mid-fight —
     * over the canvas only, so a right-click on anything else on the page
     * still behaves like the web. */
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    /* And without this, mouse 4 is the browser's Back button: launching a
     * missile would navigate out of the game and lose the flight. Chrome
     * raises that navigation off auxclick rather than off the mousedown we
     * already swallowed, so both have to be caught — as does the wheel
     * click, which is otherwise autoscroll. Canvas only, so the rest of the
     * page still behaves like a page. */
    canvas.addEventListener('auxclick', function (e) {
      if (mouseButton(e) !== 0) e.preventDefault();
    });
    /* A held trigger and a lost window is a ship that goes on firing at
     * nothing until you come back to it. Same reasoning as the keys reset
     * below, and the same failure it prevents. */
    window.addEventListener('blur', releaseTriggers);
    window.addEventListener('mousemove', function (e) {
      /* With the cursor out, the mouse belongs to the interface: it does not
       * turn the pilot's head and it does not swing the camera. This is the
       * whole point of the modifier — a drag handle you cannot reach without
       * also yawing the ship is not a handle. */
      if (G.cursor.active) {
        cursorAt(e.clientX, e.clientY);
        if (G.nodeDrag) dragHandleTo(e.clientX, e.clientY, e.shiftKey);
        lastX = e.clientX; lastY = e.clientY;
        return;
      }
      /* Mouse-aim is the one mode where the mouse steers with NO button
       * held, and it has to be, now that the buttons are triggers: keeping
       * the old drag requirement would have meant you could only turn the
       * ship while firing it. Everywhere else a drag is still a drag. */
      var aiming = mouseArmed() && !G.freeLook;
      /* Free-look reaches the head with no button held too — the whole
       * point is that it replaces the stick, not that it adds a drag. */
      var looking = G.freeLook && G.viewMode === 'cockpit' && flying() &&
                    !menuOpen() && !G.cursor.active;
      if (!dragging && !aiming && !looking) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      /* The same gesture means two, now three, different things depending
       * on where you are sitting and which way you told F9 you wanted it.
       * Outside, you are grabbing the scene and turning it around the ship.
       * Inside, you are either turning your head — so the view follows the
       * mouse rather than opposing it, which is what a head does — or you
       * are flying, and the mouse is a stick. */
      if (aiming) aimBy(dx, dy);
      else if (G.viewMode === 'cockpit') lookBy(dx * 0.0042, -dy * 0.0042);
      // (free-look lands in the branch above: cockpit, head, not the stick)
      else {
        G.cam.yaw -= dx * 0.006;
        G.cam.pitch += dy * 0.006;
        G.cam.pitch = wrapAngle(G.cam.pitch);
      }
      lastX = e.clientX; lastY = e.clientY;
    });
    /* The wheel zooms whichever view you are in — in the cockpit it used to
     * move G.cam.dist, which the cockpit camera does not read, so the wheel
     * was silently doing nothing at all in the seat. */
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (menuOpen()) return;
      /* A list under the pointer gets the wheel first. Rolling the wheel
       * over a shop and having the camera fly backwards out of the cockpit
       * is the kind of thing that reads as the interface being broken. */
      /* Reached through `global`, not as a bare name: under test `global` is
       * a stand-in window object, so a bare `Screens` is not in scope even
       * when `global.Screens` is set. */
      if (global.Screens && global.Screens.wheelAt(e.clientX, e.clientY, e.deltaY)) return;
      zoomBy(Math.pow(1.0016, e.deltaY));
    }, { passive: false });

    // Touch: one finger orbits, two fingers pinch to zoom.
    var pinch = 0;
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) { dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
      else if (e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (e.touches.length === 1 && dragging) {
        var tdx = e.touches[0].clientX - lastX, tdy = e.touches[0].clientY - lastY;
        if (G.viewMode === 'cockpit') lookBy(tdx * 0.005, -tdy * 0.005);
        else {
          G.cam.yaw -= tdx * 0.008;
          G.cam.pitch += tdy * 0.008;
          G.cam.pitch = wrapAngle(G.cam.pitch);
        }
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
        if (pinch > 0 && d > 0) zoomBy(pinch / d);
        pinch = d;
      }
    }, { passive: false });
    canvas.addEventListener('touchend', function () { dragging = false; pinch = 0; });
  }

  function focusList() {
    var list = [{ ship: true, name: 'Ship' }];
    for (var i = 0; i < G.sys.bodies.length; i++) list.push(G.sys.bodies[i]);
    return list;
  }

  function cycleFocus(dir) {
    var list = focusList();
    var idx = 0;
    if (G.followShip) idx = 0;
    else for (var i = 0; i < list.length; i++) if (list[i] === G.focus) idx = i;
    idx = (idx + dir + list.length) % list.length;
    var pick = list[idx];
    if (pick.ship) { G.followShip = true; G.focus = null; say('Tracking ship'); }
    else {
      G.followShip = false; G.focus = pick;
      G.cam.dist = Math.max(pick.radius * 6, pick.kind === 'star' ? pick.radius * 40 : pick.radius * 8);
      if (pick.children.length) {
        var far = 0;
        for (var j = 0; j < pick.children.length; j++)
          far = Math.max(far, pick.children[j].orbit.a);
        G.cam.dist = far * 3;
      }
      say(pick.name + '  —  ' + (pick.typeName || pick.kind));
    }
  }

  function killRotation() {
    // Cancel thrust immediately.
    G.ship.thrust = V.zero();
    say('Thrust cut');
  }

  /* ---- looking around ---------------------------------------------------
   * You can turn all the way round — a full 180° to either shoulder — and a
   * long way up and down. The old clamp stopped just short of the bulkhead
   * on the grounds that there was nothing back there worth seeing, which
   * was true right up until the rear panels went in. It is a swivel seat.
   * Pitch is still short of straight up: there is a helmet and a headrest
   * in the way and nothing above them. */
  var LOOK_YAW_MAX = Math.PI, LOOK_PITCH_MAX = 1.15;

  /* Fold an angle into (-pi, pi]. The exterior camera's pitch used to be
   * clamped just short of straight up, so you could never get over the top
   * of your own ship; now it simply keeps going, and this is only here to
   * stop the number growing without bound while someone drags in circles. */
  function wrapAngle(a) {
    var TAU = Math.PI * 2;
    a = a % TAU;
    if (a > Math.PI) a -= TAU;
    if (a <= -Math.PI) a += TAU;
    return a;
  }

  function lookBy(dyaw, dpitch) {
    if (G.viewMode !== 'cockpit') return;
    G.look.yaw = Math.max(-LOOK_YAW_MAX, Math.min(LOOK_YAW_MAX, G.look.yaw + dyaw));
    G.look.pitch = Math.max(-LOOK_PITCH_MAX, Math.min(LOOK_PITCH_MAX, G.look.pitch + dpitch));
  }

  /* Mouse as a stick. The delta becomes a command in the same -1..1 units
   * the arrow keys hand to the attitude integrator, so both control paths
   * meet at exactly one place and cannot disagree about what "pitch up"
   * means. */
  function aimBy(dx, dy) {
    var k = 0.055 * G.aimSens;
    G.aimCmd.yaw = Math.max(-1, Math.min(1, G.aimCmd.yaw - dx * k));
    G.aimCmd.pitch = Math.max(-1, Math.min(1, G.aimCmd.pitch - dy * k));
  }

  /* Home is the one key that always gives you back a view you can fly with.
   * It used to refuse outright outside the cockpit, which meant a chase
   * camera lost at the wrong distance had no reset at all. */
  function recentreLook() {
    if (G.viewMode !== 'cockpit') {
      G.cam.dist = CHASE_DIST;
      say('Camera reset to chase distance', 1.5);
      return;
    }
    G.look.yaw = 0; G.look.pitch = 0;
    G.cockpitFov = COCKPIT_FOV;
    say('View centred', 1.5);
  }

  /* ---- multi-function displays ------------------------------------------
   * Three panels, each cycling through its own pages on its own key, the
   * way Frontier's did. The point of pages rather than one crowded readout
   * is that the thing you need while docking and the thing you need while
   * picking a trade route are different things, and neither should be
   * competing for the same square of dashboard. */
  /* Modes, not panels. F1 is flying — the cockpit, the glass and the flight
   * instruments, and nothing else competing for the screen. Every other key
   * takes the whole display for one job, the way a real multi-function
   * display does: you are either flying or you are reading, and the failure
   * of the old band was pretending you could do both in 178 pixels.
   *
   * The number row mirrors the function keys throughout, because browsers
   * have opinions about F1 and F5 and a control scheme should not depend on
   * winning that argument. */
  var MODES = [
    { key: 'F1',  label: 'FLIGHT',   id: 'flight',     icon: 'cockpit' },
    { key: 'F2',  label: 'ORBITS',   id: 'system',     icon: 'star' },
    { key: 'F3',  label: 'NAV',      id: 'navigation', icon: 'nav' },
    { key: 'F4',  label: 'COMMS',    id: 'comms',      icon: 'comms' },
    { key: 'F5',  label: 'SHIP',     id: 'ship',       icon: 'hold' },
    { key: 'F6',  label: 'GALAXY',   id: 'galaxy',     icon: 'galaxy' },
    { key: 'F7',  label: 'MISSIONS', id: 'missions',   icon: 'missions' },
    { key: 'F8',  label: 'JUMP',     id: 'jump',       icon: 'jump' },
    { key: 'F9',  label: 'AIM',      id: 'aim',        icon: 'aim' },
    { key: 'F10', label: 'NODES',    id: 'node',       icon: 'node' }
  ];
  /* The old name, kept pointing at the new table: the manoeuvre-node work
   * reaches for PANELS and there is no reason to make it care. */
  var PANELS = MODES;

  function modeId() { return MODES[G.panel] ? MODES[G.panel].id : 'flight'; }
  function flying() { return G.panel === 0; }
  /* The orbit map is the one mode that still shows the world — it IS the
   * world, seen from outside — so a handful of things that gate on
   * flying() gate on this instead. */
  function mapMode() { return modeId() === 'system'; }

  /* Roughly the framing the game boots with: exterior, tracking the ship,
   * pulled out far enough that the local orbits read as a diagram. */
  var CHASE_DIST = 0.06;             // km — close enough to admire the hull

  /* The zoom stops. MIN_CAM_DIST used to be 1.0 km, which is a hundred times
   * further out than the chase camera parks — so the first notch of the
   * wheel in the exterior view did not zoom in at all, it CLAMPED the camera
   * a kilometre away from a ten-metre ship and left it there. The hull went
   * to a nine-pixel speck, zooming in could not get back under the floor,
   * and F1's reframe window (below) was too narrow to rescue it either. Six
   * metres is just outside a 10 m hull: close enough to read a hull number,
   * still outside the geometry. */
  var MIN_CAM_DIST = 0.006;          // km
  var MAX_CAM_DIST = 6e10;           // km

  /* Cockpit zoom is a field of view, not a distance — there is no camera
   * boom to shorten when the camera is your own eye. Narrowing the FOV is
   * what a pair of binoculars does and what every other cue in the cockpit
   * (canopy frame, console, ladder) is already built to follow, because all
   * of them project through this same camera. */
  var COCKPIT_FOV = 68 * DEG;
  var FOV_MIN = 22 * DEG, FOV_MAX = 95 * DEG;

  function cockpitFov() {
    var f = G.cockpitFov;
    return (typeof f === 'number' && isFinite(f) && f > 0) ? f : COCKPIT_FOV;
  }

  /* One zoom control for both views: `f` below 1 zooms in, above 1 zooms
   * out, and which quantity that moves is the view's business rather than
   * the caller's. Wheel, pinch and the +/- keys all come through here, so
   * they cannot drift apart or clamp differently. */
  function zoomBy(f, announce) {
    if (!isFinite(f) || f <= 0) return;
    if (G.viewMode === 'cockpit') {
      G.cockpitFov = Math.max(FOV_MIN, Math.min(FOV_MAX, cockpitFov() * f));
      if (announce) {
        say(Math.abs(G.cockpitFov - COCKPIT_FOV) < 1e-6
              ? 'Canopy zoom 1.0×  (' + (COCKPIT_FOV / DEG).toFixed(0) + '° field)'
              : 'Canopy zoom ' + (COCKPIT_FOV / G.cockpitFov).toFixed(1) + '×  ('
                + (G.cockpitFov / DEG).toFixed(0) + '° field)', 1.5);
      }
    } else {
      G.cam.dist = Math.max(MIN_CAM_DIST, Math.min(MAX_CAM_DIST, G.cam.dist * f));
      if (announce) say('Camera ' + fmtDist(G.cam.dist), 1.5);
    }
  }


  function frameOrbitMap() {
    G.viewMode = 'orbit';
    G.followShip = true;
    G.focus = null;
    var dom = Sim.dominantBody(G.ship.pos, G.sys, G.t);
    if (dom) {
      G.cam.dist = Math.max(G.cam.dist, dom.radius * 8);
      if (dom.kind !== 'star') G.cam.dist = Math.min(G.cam.dist, dom.radius * 40);
    }
  }

  function selectPanel(i) {
    if (i < 0 || i >= MODES.length) return;
    var was = G.panel;
    /* Walking away from the page abandons whatever was half-typed on it.
     * A field still holding the keyboard on a screen nobody is looking at
     * is how you get a ship that has stopped answering its controls. */
    if (global.Screens && global.Screens.editing()) global.Screens.cancelEdit();
    G.panel = i;
    /* Two modes are really the same screen the rest of the game already
     * had, so entering them opens it rather than drawing a second copy. */
    if (MODES[i].id === 'galaxy' && !G.starMap) {
      if (G.ship.landed) { G.panel = was; say('No slipspace alignment on the ground', 3); return; }
      G.starMap = { sel: 0, list: jumpCandidates() };
    }
    if (MODES[i].id !== 'galaxy' && MODES[i].id !== 'jump') G.starMap = null;

    /* The orbit map borrows the camera. What you were doing with it —
     * cockpit or chase, whatever you were focused on, however far out —
     * is put back exactly when you leave, because a map that scrambles
     * your view on the way out is a map you stop opening. */
    if (MODES[i].id === 'system' && was !== i) {
      G.mapReturn = { viewMode: G.viewMode, followShip: G.followShip,
                      focus: G.focus, dist: G.cam.dist };
      frameOrbitMap();
    } else if (MODES[was] && MODES[was].id === 'system' && i !== was && G.mapReturn) {
      G.viewMode = G.mapReturn.viewMode;
      G.followShip = G.mapReturn.followShip;
      G.focus = G.mapReturn.focus;
      G.cam.dist = G.mapReturn.dist;
      G.mapReturn = null;
    }

    if (i !== was) { G.hotspots = []; G.piracyMenu = null; }
  }

  /* F1's second press. Cockpit and chase camera are the two ways to fly,
   * and one key flips between them; coming out to the chase view parks the
   * camera close enough that the hull is a ship, not a dot. */
  function toggleView() {
    G.viewMode = (G.viewMode === 'cockpit') ? 'orbit' : 'cockpit';
    if (G.viewMode === 'cockpit') {
      G.followShip = true; G.focus = null;
      say('Cockpit view', 2);
    } else {
      G.followShip = true; G.focus = null;
      /* The reframe window was 0.3×–40× of chase distance, which happened to
       * contain the old 1 km zoom floor — so when the wheel stranded the
       * camera out there, coming back out to the chase view left it stranded
       * and the hull stayed a speck. A tighter window means F1 always gives
       * you a ship-sized ship back; Home does the same without the toggle. */
      if (G.cam.dist > CHASE_DIST * 8 || G.cam.dist < CHASE_DIST * 0.1) {
        G.cam.dist = CHASE_DIST;
      }
      say('Exterior view', 2);
    }
  }

  /* What the keyboard means while a screen is up. Returns true if the mode
   * consumed the key; anything it does not want reaches the ship. */
  function modeKey(e) {
    var key = e.key.toLowerCase();
    if (key === 'escape') { selectPanel(0); return true; }

    switch (modeId()) {
      case 'galaxy':
        return handleStarMapKey(e);

      case 'ship': {
        var held = heldCargo();
        if (key === 'arrowdown') { G.invSel = Math.min(held.length - 1, G.invSel + 1); return true; }
        if (key === 'arrowup') { G.invSel = Math.max(0, G.invSel - 1); return true; }
        /* Jettison is deliberately not on Enter. Enter is "yes" everywhere
         * else in the interface and this is the one control that throws
         * away something you paid for. */
        if (key === 'backspace' || key === 'delete') {
          if (held[G.invSel]) jettison(held[G.invSel].cid, e.shiftKey ? Infinity : 1);
          return true;
        }
        return false;
      }

      case 'comms': {
        var contacts = global.Screens.commsContacts();
        if (key === 'arrowdown') { G.commsSel = Math.min(contacts.length - 1, G.commsSel + 1); G.piracyMenu = null; return true; }
        if (key === 'arrowup') { G.commsSel = Math.max(0, G.commsSel - 1); G.piracyMenu = null; return true; }
        if (key === 'enter') { hailSelected(contacts[G.commsSel]); return true; }
        /* Y only means anything against a standing quote, so it shadows
         * nothing the player would otherwise want here. */
        if (key === 'y') { payOutstanding(); return true; }
        return false;
      }

      case 'missions':
        if (key === 'arrowdown') { G.missionSel++; return true; }
        if (key === 'arrowup') { G.missionSel = Math.max(0, G.missionSel - 1); return true; }
        return false;

      case 'jump':
        if (key === 'enter') {
          var course = plottedCourse();
          if (!course) { say('No course plotted — F6 opens the chart', 3); return true; }
          if (!course.possible) { say('Out of range on current fuel', 3); return true; }
          selectPanel(0);
          doJump(course);
          return true;
        }
        return false;

      case 'aim':
        if (key === 'enter') { setMouseAim(!G.mouseAim); return true; }
        if (key === '-' || key === '_') { G.aimSens = Math.max(0.25, G.aimSens - 0.25); return true; }
        if (key === '=' || key === '+') { G.aimSens = Math.min(3, G.aimSens + 0.25); return true; }
        return false;
    }
    return false;
  }

  /* Hold right Alt and the mouse stops flying the ship and starts turning
   * your head. Letting go puts the view back where it was looking, because
   * a held free-look that leaves your head hanging off to port is a control
   * you have to remember to undo — and the entire argument for a modifier
   * over a toggle is that there is nothing to remember.
   *
   * The aim command is zeroed on the way IN, not just on the way out: the
   * mouse has been feeding a decaying rate, and carrying that into a look
   * would have the ship keep turning while you are only glancing sideways. */
  function setFreeLook(on) {
    on = !!on;
    if (G.freeLook === on) return;
    G.freeLook = on;
    if (G.viewMode !== 'cockpit') return;
    G.aimCmd.yaw = 0; G.aimCmd.pitch = 0;
    if (!on) { G.look.yaw = 0; G.look.pitch = 0; }
  }

  function setMouseAim(on) {
    G.mouseAim = !!on;
    /* Dropping out of it must let go of the triggers, or the guns keep
     * firing on a button the mode no longer reads. */
    if (!G.mouseAim) releaseTriggers();
    say(G.mouseAim ? 'Mouse aim ON — the mouse is the stick, 1 and 2 are the fire groups, middle launches'
                   : 'Mouse aim off — drag turns your head, Space and B shoot', 4);
  }

  /* ---- the cruise drive -------------------------------------------------
   * An honest orbital transfer between two planets takes months, and a
   * constant-thrust one costs more reaction mass than any tank can hold.
   * Both are true, and between them they would make interplanetary flight
   * something you never actually do. So there is a third thing: a drive
   * that warps the sky and crosses a system in minutes.
   *
   * It is openly contrived, like slipspace, and it is fenced accordingly:
   *
   *   - MASS LOCK. Your top speed is proportional to how far you are from
   *     the nearest significant body. Deep space is fast; near a planet you
   *     crawl. This is what stops it being a teleport, and it produces the
   *     right shape of journey for free — you accelerate away, coast the
   *     middle, and are slowed down by your destination as you arrive.
   *   - IT COSTS. Reaction mass per distance covered, so crossing a system
   *     is a real expense and route choice stays a decision.
   *   - IT DROPS YOU IN ORBIT. Arriving at rest beside a planet would mean
   *     falling straight into it, so dropping out hands you the local
   *     circular velocity instead.
   */
  var CRUISE_MIN = 60;              // km/s
  var CRUISE_MAX = 2.0e6;           // km/s — contrived, and admitted to
  var CRUISE_LOCK_K = 0.55;         // speed limit per km of clearance
  var CRUISE_BURN = 1.1e-8;         // tonnes of reaction mass per km flown
  var CRUISE_CLEAR = 2.5;           // body radii you must be outside to engage

  /* How fast may we go here, and what is holding us back? */
  function cruiseLock() {
    var best = null, bestClear = Infinity, worst = null, ratio = Infinity;
    for (var i = 0; i < G.sys.gravBodies.length; i++) {
      var b = G.sys.gravBodies[i];
      var d = V.dist(Sim.bodyPosition(b, G.sys, G.t), G.ship.pos);
      var clear = d - b.radius;
      if (clear < bestClear) { bestClear = clear; best = b; }
      var r = d / b.radius;
      if (r < ratio) { ratio = r; worst = b; }
    }
    var maxSpeed = Math.max(CRUISE_MIN,
      Math.min(CRUISE_MAX, CRUISE_LOCK_K * Math.max(0, bestClear)));
    return {
      body: worst || best,
      clearance: bestClear,
      maxSpeed: maxSpeed,
      can: ratio > CRUISE_CLEAR && !G.ship.docked && !G.ship.landed
    };
  }

  /* `keepAuto` is passed by the autopilot, which spins the drive up itself
   * on a long approach — without it, engaging cruise would cancel the very
   * autopilot that asked for it. */
  function toggleCruise(keepAuto) {
    if (G.cruise) { dropCruise('disengaged'); return; }
    if (G.hyper) return;
    var lock = cruiseLock();
    if (!lock.can) {
      say(G.ship.docked ? 'Cruise drive will not spin up on the clamps'
        : G.ship.landed ? 'Cruise drive will not spin up on the ground'
        : 'Mass locked by ' + lock.body.name + ' — climb clear first', 4);
      return;
    }
    if (G.ship.thrusterFuel < 0.5) { say('Not enough reaction mass to cruise', 3); return; }
    if (!keepAuto) cancelAutodock(null);
    /* A node is a plan against a trajectory, and cruise is not a
     * trajectory — inside the bubble gravity does not apply and the ship is
     * moved kinematically. Whatever was planned before engaging cannot
     * survive it, so say so rather than leaving a stale line on the map. */
    if (G.node) { clearNode(true); say('Cruise engaged — manoeuvre node dropped', 4); }
    G.cruise = {
      speed: Math.min(lock.maxSpeed, 2000),
      maxSpeed: lock.maxSpeed,
      lockBody: lock.body,
      rate: CRUISE_BURN * 1e6,        // quoted per Mkm, which is readable
      travelled: 0
    };
    G.warpIndex = 0;
    say('Cruise drive engaged — , and . set speed, Z to drop out', 5);
  }

  function dropCruise(why) {
    if (!G.cruise) return;
    /* Hand back a sane velocity. Coming out of cruise at rest next to a
     * planet would mean falling into it, so we leave in the circular orbit
     * we are standing in — which is where a drive like this would put you
     * and is the only arrival that is any use. */
    var dom = Sim.dominantBody(G.ship.pos, G.sys, G.t);
    var bs = Sim.bodyState(dom, G.sys, G.t);
    var rel = V.sub(G.ship.pos, bs.pos);
    var r = V.len(rel);
    if (r > 1e-6 && dom.mu > 0) {
      var up = V.scale(rel, 1 / r);
      var ref = Math.abs(up.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
      var along = V.norm(V.cross(ref, up));
      G.ship.vel = V.addScaled(bs.vel, along, Math.sqrt(dom.mu / r));
    }
    G.cruise = null;
    G.ship.thrust = V.zero();
    say('Cruise drive disengaged' + (why ? ' — ' + why : ''), 4);
  }

  /* One frame of cruise. Kinematic on purpose: inside the bubble you are
   * not on a trajectory, so gravity does not apply and the integrator is
   * not consulted. */
  function advanceCruise(dtReal) {
    var c = G.cruise;
    var lock = cruiseLock();
    c.maxSpeed = lock.maxSpeed;
    c.lockBody = lock.body;
    if (c.speed > c.maxSpeed) c.speed = c.maxSpeed;
    if (c.speed < CRUISE_MIN) c.speed = CRUISE_MIN;

    /* Refuse to fly along a degenerate nose. Cheap insurance: anything that
     * left the attitude basis in a bad state would otherwise show up as a
     * cruise drive that runs, burns fuel and never goes anywhere. */
    if (V.len(G.ship.fwd) < 1e-9) {
      G.ship.fwd = V.len(G.ship.vel) > 1e-9 ? V.norm(G.ship.vel) : { x: 1, y: 0, z: 0 };
      G.ship.right = V.norm(V.cross(G.ship.fwd, { x: 0, y: 0, z: 1 }));
      if (V.len(G.ship.right) < 1e-6) G.ship.right = { x: 0, y: 1, z: 0 };
      G.ship.up = V.cross(G.ship.right, G.ship.fwd);
    }

    var step = c.speed * dtReal;                 // km this frame
    var burn = step * CRUISE_BURN;
    if (burn >= G.ship.thrusterFuel) {
      G.ship.thrusterFuel = 0;
      Sim.refreshShip(G.ship);
      dropCruise('out of reaction mass');
      return;
    }
    G.ship.thrusterFuel -= burn;
    c.travelled += step;
    Sim.refreshShip(G.ship);

    G.ship.pos = V.addScaled(G.ship.pos, G.ship.fwd, step);
    G.ship.vel = V.scale(G.ship.fwd, c.speed);
    G.t += dtReal;

    /* Arrival. If the lock is squeezing us down to nothing we have run into
     * something's gravity well, which is exactly how you are supposed to
     * arrive — so drop out rather than grinding along at the floor speed. */
    if (lock.clearance < 0) { dropCruise('collision avoidance'); return; }

    /* Arrival, and it has to test that we are CLOSING. Dropping out simply
     * because the target is nearby would strand you the moment you engaged
     * cruise while still locked onto the place you were leaving — which is
     * the normal way anyone would use it. */
    var nav = navTargetState();
    if (nav && nav.closing > 0 && nav.range < Math.max(400, c.speed * 2.5)) {
      dropCruise('arrived at ' + nav.name);
      return;
    }
    if (c.maxSpeed <= CRUISE_MIN * 1.02) dropCruise('mass locked by ' + lock.body.name);
  }

  /* ---- auto-dock --------------------------------------------------------
   * Not a teleport and not a cutscene: it commands thrust and attitude the
   * same way you would, and the same physics moves the ship. Which means it
   * can be watched, it can be interrupted, and if it is going to fail you
   * can see it failing.
   *
   * Two phases. CLOSE flies to a standoff point off the station on a
   * saturated proportional-derivative law; BERTH creeps in along the last
   * few km slowly enough for the capture envelope to catch. The standoff
   * exists so the approach never cuts through the station itself. */
  function startAutodock() {
    if (G.autodock) { cancelAutodock('cancelled'); return; }
    if (G.ship.docked) { say('Already docked', 2); return; }
    var nav = navTargetState();
    var st = nav && nav.kind === 'body' && nav.obj.kind === 'station' ? nav.obj : G.dockTarget;
    if (!st) { say('Lock a station first — [ ] cycles the nav list', 4); return; }
    G.dockTarget = st;
    /* No range limit any more. It used to refuse past 300,000 km, which
     * made auto-dock a parking assistant: fine once you were already
     * there, useless for the part of the journey that is actually tedious.
     * It now uses the cruise drive for the long leg exactly as you would —
     * point at the station, spin up, drop out on arrival — and only then
     * flies the approach it always flew. The refusal became a phase. */
    G.autodock = {
      mode: 'dock', target: st, lock: { kind: 'body', id: st.id },
      phase: 'close', elapsed: 0
    };
    var range = V.dist(Sim.bodyPosition(st, G.sys, G.t), G.ship.pos);
    say('Auto-dock engaged: ' + st.name +
        (range > AUTO_CRUISE_RANGE ? ' — cruising in first' : ''), 4);
  }

  /* Match orbit, and follow. Two things you constantly want and could only
   * do by hand: sit still relative to something, and stay with something
   * that is moving. Both are the same guidance law auto-dock already uses
   * with a different aim point, which is why they are a handful of lines
   * rather than a subsystem. */
  var AUTO_CRUISE_RANGE = 3e5;      // km — beyond this, cruise the leg
  var MATCH_DONE = 0.0015;          // km/s — 1.5 m/s counts as matched

  function startAutoMode(mode) {
    if (G.autodock && G.autodock.mode === mode) { cancelAutodock('cancelled'); return; }
    if (G.ship.docked) { say('Undock first', 2); return; }
    if (G.ship.landed) { say('On the ground', 2); return; }
    var nav = navTargetState();
    if (!nav) { say('Lock something first — [ ] cycles the nav list', 4); return; }
    G.autodock = {
      mode: mode,
      target: nav.obj,
      lock: { kind: nav.kind, id: nav.id !== undefined ? nav.id : nav.obj.id },
      phase: mode === 'match' ? 'match' : 'follow',
      elapsed: 0
    };
    say((mode === 'match' ? 'Matching orbit with ' : 'Following ') + nav.name, 4);
  }

  /* Where the thing we are chasing is, this instant, whether it is a world
   * on rails or a ship being flown by somebody else. */
  function autoTargetState(ad) {
    if (ad.lock && ad.lock.kind === 'ship') {
      var ships = Sim.shipsAll(G.sys, G.t);
      for (var i = 0; i < ships.length; i++) {
        if (ships[i].id === ad.lock.id) {
          return { obj: ships[i], pos: ships[i].pos,
                   vel: ships[i].vel || V.zero(), name: ships[i].name || 'contact' };
        }
      }
      return null;                      // it jumped, docked, or was destroyed
    }
    var b = ad.lock ? G.sys.byId[ad.lock.id] : ad.target;
    if (!b) return null;
    var bs = Sim.bodyState(b, G.sys, G.t);
    return { obj: b, pos: bs.pos, vel: bs.vel, name: b.name };
  }

  function cancelAutodock(why) {
    if (!G.autodock) return;
    G.autodock = null;
    G.ship.thrust = V.zero();
    if (why) say('Auto-dock ' + why, 3);
  }

  /* Point the ship at whatever the autopilot is chasing, and drop out of
   * cruise once we are close enough for the approach law to take it. Used
   * only while the bubble is up. */
  function steerAutoCruise() {
    var ad = G.autodock;
    if (!ad || ad.mode !== 'dock') return;
    var ss = autoTargetState(ad);
    if (!ss) return;
    var rel = V.sub(ss.pos, G.ship.pos);
    var range = V.len(rel);
    if (range < 1e-9) return;
    ad.phase = 'cruise';
    G.ship.fwd = V.scale(rel, 1 / range);
    G.ship.right = V.norm(V.cross(G.ship.fwd, { x: 0, y: 0, z: 1 }));
    if (V.len(G.ship.right) < 1e-6) G.ship.right = V.norm(V.cross(G.ship.fwd, { x: 0, y: 1, z: 0 }));
    G.ship.up = V.cross(G.ship.right, G.ship.fwd);

    /* Wind the drive up, which a pilot would do and the first version of
     * this did not: cruise engages at 2,000 km/s and only the , and . keys
     * ever moved it, so the autopilot crossed two million kilometres at the
     * speed it spun up at — sixteen real minutes of watching a dot. Speed
     * is asked for as a fraction of the distance left, so it winds itself
     * back down on the way in instead of arriving flat out. */
    G.cruise.speed = Math.max(G.cruise.speed,
      Math.min(G.cruise.maxSpeed, Math.max(CRUISE_MIN, range * 0.2)));
    if (G.cruise.speed > range * 0.35) G.cruise.speed = Math.max(CRUISE_MIN, range * 0.2);

    /* Hand over well outside the approach: cruise covers ground far faster
     * than the guidance law updates, and dropping out on top of the station
     * would mean arriving with all of that speed still to kill. */
    if (range < AUTO_CRUISE_RANGE * 0.5) dropCruise('arrived at ' + ss.name);
  }

  /* No autopilot may ask for more than the engine has. Every mode below
   * ends in this, so none of them can quietly command a burn the ship
   * cannot fly and then wonder why it never converges. */
  function clipAccel(cmd) {
    var mag = V.len(cmd);
    return mag > G.ship.maxAccel ? V.scale(cmd, G.ship.maxAccel / mag) : cmd;
  }

  /* Returns the commanded acceleration, or null when it is done. */
  function advanceAutodock(dtSim) {
    var ad = G.autodock;
    var st = ad.target;
    if (G.ship.docked) { G.autodock = null; return null; }
    ad.elapsed += dtSim;

    var ss = autoTargetState(ad);
    if (!ss) { cancelAutodock('lost the contact'); return null; }
    var rel = V.sub(ss.pos, G.ship.pos);
    var range = V.len(rel);
    var vrel = V.sub(G.ship.vel, ss.vel);

    /* ---- match orbit ---------------------------------------------------
     * Null the relative velocity and stop. Not "fly to it" — just stop
     * moving with respect to it, which is the manoeuvre that turns a
     * flyby into a rendezvous and is miserable to fly by eye. */
    if (ad.mode === 'match') {
      var closing = V.len(vrel);
      if (closing < MATCH_DONE) {
        G.autodock = null;
        say('Orbit matched with ' + ss.name + ' — ' +
            fmtSpeed(closing) + ' relative', 5);
        return V.zero();
      }
      G.warpIndex = Math.min(closing > 1 ? 3 : closing > 0.05 ? 2 : 1, WARPS.length - 1);
      return clipAccel(V.scale(V.sub(ss.vel, G.ship.vel), 0.6));
    }

    /* ---- follow --------------------------------------------------------
     * Hold station off something and stay there while it moves. The aim
     * point is where you already are relative to it, pulled to a sensible
     * standoff, so engaging it does not swing you round to some canonical
     * side — it just stops you drifting. It never completes; it is a mode
     * you fly in until you cancel it. */
    if (ad.mode === 'follow') {
      var stand = Math.max(2, (ss.obj.radius || 0.05) * 8);
      var out = range > 1e-9 ? V.scale(rel, -1 / range) : { x: 1, y: 0, z: 0 };
      var hold = V.addScaled(ss.pos, out, stand);
      var toHold = V.sub(hold, G.ship.pos);
      var dHold = V.len(toHold);
      var vHold = Math.min(2, Math.sqrt(2 * G.ship.maxAccel * 0.55 * Math.max(0, dHold)));
      var dirHold = dHold > 1e-9 ? V.scale(toHold, 1 / dHold) : V.zero();
      G.warpIndex = Math.min(dHold > 5e3 ? 3 : dHold > 100 ? 2 : 1, WARPS.length - 1);
      return clipAccel(V.scale(V.sub(V.addScaled(ss.vel, dirHold, vHold), G.ship.vel), 0.5));
    }

    /* ---- the long leg, under cruise ------------------------------------
     * Point at the station, spin the drive up and let cruise's own arrival
     * logic drop us out near it. No thrust is commanded while the bubble is
     * up, because inside it the ship is moved kinematically and thrust is
     * not what is flying it. */
    if (range > AUTO_CRUISE_RANGE || (G.cruise && range > AUTO_CRUISE_RANGE * 0.5)) {
      ad.phase = 'cruise';
      G.ship.fwd = V.norm(rel);
      G.ship.right = V.norm(V.cross(G.ship.fwd, { x: 0, y: 0, z: 1 }));
      if (V.len(G.ship.right) < 1e-6) G.ship.right = V.norm(V.cross(G.ship.fwd, { x: 0, y: 1, z: 0 }));
      G.ship.up = V.cross(G.ship.right, G.ship.fwd);
      if (!G.cruise) {
        /* One attempt per second or so, not per frame: if the drive will
         * not spin up (mass locked, dry tank) the approach simply carries
         * on under thrust, slowly, which still gets there. */
        if (!ad.cruiseTry || ad.elapsed - ad.cruiseTry > 1) {
          ad.cruiseTry = ad.elapsed;
          if (cruiseLock().can && G.ship.thrusterFuel > 0.5) toggleCruise(true);
        }
      }
      if (G.cruise) return V.zero();
    } else if (G.cruise) {
      dropCruise('arrived at ' + ss.name);
    }

    if (range > 5e5 && !G.cruise && ad.phase !== 'cruise') {
      cancelAutodock('lost the station'); return null;
    }

    /* Aim at a point off the station rather than at the station, until the
     * last stretch. Flying straight at a docking port from three thousand
     * kilometres means arriving with the whole structure between you and
     * where you wanted to be. */
    var standoff = st.dockCaptureRadius * (ad.phase === 'close' ? 2.6 : 0.35);
    ad.phase = range < st.dockCaptureRadius * 4 ? 'berth' : 'close';

    /* An underground bay is not "off to one side" of anything — it is
     * straight down a shaft, and there is exactly one direction that leads
     * into it without threading a needle. So CLOSE flies to a point over
     * the mouth first, on the shaft's own axis, rather than the generic
     * "offset toward wherever you already are" standoff below; by the time
     * BERTH takes over the ship is already lined up and the ordinary logic
     * carries it the rest of the way down. */
    var shaftAxis = null, shaftMouth = null;
    if (st.underground && st.parentBody) {
      shaftMouth = Sim.portEntrance(st, G.sys, G.t);
      var hostPos = Sim.bodyPosition(st.parentBody, G.sys, G.t);
      shaftAxis = V.norm(V.sub(shaftMouth.pos, hostPos));
    }

    /* Drive the clock rather than merely capping it.
     *
     * The first version only clamped the warp down, which meant the
     * autopilot flew the whole approach at one times real time: correct,
     * convergent, and about ten minutes of watching a dot creep. A pilot
     * handed a long approach would wind the clock up and then wind it back
     * down for the delicate part, so that is what this does.
     *
     * The ceiling is set by the guidance loop, not by taste: the law
     * updates once a frame, so a frame must stay short against the time it
     * takes to brake from the current speed (v/a, of order a minute here).
     * A few seconds of simulation per frame is comfortable; a few minutes
     * would sail straight past the station between corrections. */
    var want = range > 2.0e4 ? 4        // 500x  -> ~8 s per frame
             : range > 2.0e3 ? 3        // 100x  -> ~1.6 s
             : range > st.dockCaptureRadius * 3 ? 2   // 25x -> ~0.4 s
             : 1;                       // 5x, for the last few km
    G.warpIndex = Math.min(want, WARPS.length - 1);

    var aim = (shaftAxis && ad.phase === 'close')
      ? V.addScaled(shaftMouth.pos, shaftAxis, standoff)
      : V.addScaled(ss.pos, V.norm(V.scale(rel, -1)), standoff);
    var toAim = V.sub(aim, G.ship.pos);
    var dAim = V.len(toAim);

    /* Approach speed we can still stop from, with a margin. This is the
     * whole guidance law: go as fast as braking distance allows, and null
     * the sideways drift. */
    var brake = G.ship.maxAccel * 0.55;
    var vWant = Math.min(ad.phase === 'berth' ? 0.9 : 45,
                         Math.sqrt(2 * brake * Math.max(0, dAim)));
    var dirAim = dAim > 1e-9 ? V.scale(toAim, 1 / dAim) : V.zero();
    var desired = V.addScaled(ss.vel, dirAim, vWant);
    var err = V.sub(desired, G.ship.vel);

    var cmd = V.scale(err, 0.5);
    var mag = V.len(cmd);
    if (mag > G.ship.maxAccel) cmd = V.scale(cmd, G.ship.maxAccel / mag);

    // Point the nose where we are pushing; it is what a pilot would do.
    if (V.len(cmd) > 1e-9) {
      G.ship.fwd = V.norm(cmd);
      G.ship.right = V.norm(V.cross(G.ship.fwd, { x: 0, y: 0, z: 1 }));
      if (V.len(G.ship.right) < 1e-6) G.ship.right = V.norm(V.cross(G.ship.fwd, { x: 0, y: 1, z: 0 }));
      G.ship.up = V.cross(G.ship.right, G.ship.fwd);
    }
    return cmd;
  }

  /* ---- manoeuvre nodes --------------------------------------------------
   * Plan a burn, see the orbit it gives you, then fly it. This is the
   * difference between steering by feel and navigating.
   *
   * The node is planned as an impulse and flown as a real burn — see the
   * long note in sim.js for why that split is the right one. What that
   * means up here is that there are two numbers on the instrument the
   * player has to reconcile: the delta-v the plan wants, and the minutes of
   * engine time it costs. Both are shown, always.
   */

  /* Nudge steps, in km/s. Small enough that the fine step can trim a
   * transfer, coarse enough that the normal step gets you across a
   * planetary insertion without wearing out a key. */
  var NODE_DV_STEP = 0.005;        // 5 m/s
  var NODE_DV_FINE = 0.0005;       // 0.5 m/s
  var NODE_DV_COARSE = 0.05;       // 50 m/s

  function nodeTimeStep(fine, coarse) {
    /* Time steps are a FRACTION OF THE ORBIT, not a fixed number of
     * seconds. A node in a 90-minute low orbit and a node in a six-month
     * heliocentric one are both dragged around their own orbit at the same
     * feel, which a fixed step cannot do — 60 s is a big move in the first
     * and invisible in the second. */
    var ap = Sim.apsisTimes(G.ship, G.sys, G.t);
    var period = (ap && isFinite(ap.period)) ? ap.period : 3600;
    var frac = fine ? 0.002 : coarse ? 0.05 : 0.01;
    return Math.max(1, period * frac);
  }

  function placeNode() {
    if (G.ship.docked) { say('Nothing to plan from the clamps — undock first', 3); return; }
    if (G.ship.landed) { say('Nothing to plan from the ground', 3); return; }
    /* Default placement is the next apoapsis. Almost every burn worth
     * planning happens at an apsis, and dropping the node at "somewhere
     * ahead of you" would mean the player's first act is always to go
     * hunting for one. On a circular orbit there is no apsis to find, so
     * fall back to a quarter of an orbit ahead — far enough to see. */
    var ap = Sim.apsisTimes(G.ship, G.sys, G.t);
    var lead;
    if (ap && !ap.circular) lead = ap.toApoapsis;
    else if (ap) lead = ap.period * 0.25;
    else lead = 600;
    G.node = Sim.makeNode(G.t + Math.max(5, lead), { pro: 0, nor: 0, rad: 0 });
    G.nodeAxis = 0;
    G.nodeStale = 0;
    say('Node placed — I cycles axis, − and = set it, \\ flies it', 6);
  }

  function clearNode(quiet) {
    if (!G.node) { if (!quiet) say('No node to clear', 1.5); return; }
    cancelNodeBurn(null);
    G.node = null; G.nodePlan = null; G.nodeAfter = null;
    G.nodeHandles = null; G.nodeDrag = null;
    if (!quiet) say('Manoeuvre node cleared', 2);
  }

  function cycleNodeAxis(dir) {
    G.nodeAxis = (G.nodeAxis + dir + NODE_AXES.length) % NODE_AXES.length;
    say('Node axis: ' + NODE_AXES[G.nodeAxis].label, 1.8);
  }

  /* One nudge of whichever axis is selected. */
  function adjustNode(sign, fine, coarse) {
    if (!G.node) { placeNode(); return; }
    var axis = NODE_AXES[G.nodeAxis];
    if (axis.id === 'time') {
      var dt = nodeTimeStep(fine, coarse) * sign;
      /* A node cannot be in the past, and it cannot be so close that the
       * burn would have to have started already. Clamp to a few seconds
       * ahead rather than refusing the keystroke — refusing feels broken. */
      G.node.t = Math.max(G.t + 2, G.node.t + dt);
    } else {
      var step = fine ? NODE_DV_FINE : coarse ? NODE_DV_COARSE : NODE_DV_STEP;
      G.node.dv[axis.id] += step * sign;
      if (Math.abs(G.node.dv[axis.id]) < 1e-9) G.node.dv[axis.id] = 0;
    }
    G.nodeStale = 0;
  }

  function snapNode(which) {
    if (!G.node) { placeNode(); return; }
    var ap = Sim.apsisTimes(G.ship, G.sys, G.t);
    if (!ap) { say('No closed orbit to snap to', 2.5); return; }
    if (ap.circular) { say('Orbit is circular — no apsis to snap to', 3); return; }
    G.node.t = G.t + (which === 'peri' ? ap.toPeriapsis : ap.toApoapsis);
    G.nodeStale = 0;
    say('Node at next ' + (which === 'peri' ? 'periapsis' : 'apoapsis'), 2.5);
  }

  /* Recompute the plan and the resulting orbit. Expensive — it integrates
   * from now to the node — so it runs on its own stale clock like the live
   * prediction does, and any edit resets that clock to zero for an
   * immediate redraw. */
  function refreshNodePlan(dtReal) {
    if (!G.node) { G.nodePlan = null; G.nodeAfter = null; return; }
    G.nodeStale -= dtReal;
    if (G.nodeStale > 0) return;
    G.nodeStale = 0.3;

    var ref = (G.trajectory && G.trajectory.reference)
      || Sim.dominantBody(G.ship.pos, G.sys, G.t);
    G.nodePlan = Sim.nodePlan(G.ship, G.sys, G.t, G.node,
      { samples: 220, reference: ref, maxSteps: 4000 });
    if (G.nodePlan && G.nodePlan.magnitude > 1e-9) {
      G.nodeAfter = Sim.predictAfterNode(G.nodePlan, G.sys,
        { maxPoints: 420, reference: ref });
    } else {
      G.nodeAfter = null;
    }
  }

  /* ---- the cursor -------------------------------------------------------
   * Left Alt swaps what the mouse is for. Held down, the mouse stops being
   * the pilot's head (in the cockpit) or the camera gimbal (outside) and
   * becomes a cursor that can grab things. Released, it goes straight back.
   *
   * A modifier rather than a mode toggle on purpose: you reach for it, do
   * one thing, and let go, so there is never a state to be surprised by.
   * Letting go mid-drag also ends the drag, which is the behaviour a hand
   * expects from a key it is holding. */
  function setCursorMode(on) {
    if (G.cursor.active === on) return;
    G.cursor.active = on;
    /* Either direction: taking the mouse away for the interface has to let
     * go of the triggers, and so does handing it back. */
    releaseTriggers();
    if (!on) {
      G.nodeDrag = null;
      G.cursor.over = null;
      G.nodeStale = 0;
      dragging = false;
    }
  }

  function cursorAt(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    G.cursor.x = clientX - r.left;
    G.cursor.y = clientY - r.top;
    G.cursor.over = G.nodeDrag ? G.nodeDrag.handle : hitHandle(G.cursor.x, G.cursor.y);
  }

  /* Which handle, if any, is under a screen point. Handles are stashed by
   * the renderer each frame (it is the only thing that knows where the
   * camera put them), so this is a plain distance test. */
  function hitHandle(x, y) {
    var hs = G.nodeHandles;
    if (!hs || !hs.length) return null;
    var best = null, bestD = 14 * 14;    // 14 px grab radius
    for (var i = 0; i < hs.length; i++) {
      var dx = hs[i].x - x, dy = hs[i].y - y;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = hs[i]; }
    }
    return best;
  }

  function beginHandleDrag() {
    var h = G.cursor.over;
    if (!h || !G.node) return;
    G.nodeDrag = {
      handle: h, axis: h.axis, sign: h.sign,
      startValue: G.node.dv[h.axis],
      startX: G.cursor.x, startY: G.cursor.y
    };
    G.nodeAxis = h.axisIndex;
  }

  /* Drag maths: project the mouse's travel onto the handle's own on-screen
   * direction. Pulling the prograde handle outward adds prograde, pushing
   * it back through the node takes it away and keeps going into retrograde
   * — one handle covers both halves of the axis, which is why there is no
   * separate retrograde handle to hunt for. */
  function dragHandleTo(clientX, clientY, fine) {
    var d = G.nodeDrag;
    if (!d || !G.node) return;
    var r = canvas.getBoundingClientRect();
    var x = clientX - r.left, y = clientY - r.top;
    var along = (x - d.startX) * d.handle.dirX + (y - d.startY) * d.handle.dirY;
    var perKm = d.handle.kmsPerPx * (fine ? 0.1 : 1);
    G.node.dv[d.axis] = d.startValue + along * perKm * d.sign;
    if (Math.abs(G.node.dv[d.axis]) < 1e-9) G.node.dv[d.axis] = 0;
    G.nodeStale = 0;
  }

  /* ---- flying the node --------------------------------------------------
   * Same contract as auto-dock: it commands thrust and attitude, the same
   * physics moves the ship, and touching a thruster takes it back.
   *
   * Two phases. ALIGN points the nose along the planned delta-v and waits
   * for the clock. BURN holds that attitude and runs the engine until the
   * delta-v is spent — counted by integrating what the engine actually
   * delivered, not by running a stopwatch, so a burn interrupted by
   * anything at all resumes with the right amount left rather than the
   * amount the plan predicted at ignition. */
  function startNodeBurn() {
    if (!G.node) { say('No node to fly', 2); return; }
    if (G.nodeBurn) { cancelNodeBurn('cancelled'); return; }
    if (G.ship.docked) { say('Release the clamps first', 2.5); return; }
    if (G.cruise) { say('Drop out of cruise first', 3); return; }
    var plan = G.nodePlan;
    if (!plan || plan.magnitude < 1e-9) { say('Node has no delta-v set', 3); return; }
    if (!plan.burn.feasible) {
      say('Not enough reaction mass: needs ' + plan.burn.fuel.toFixed(2) +
          ' t, tank holds ' + G.ship.thrusterFuel.toFixed(2) + ' t', 6);
      return;
    }
    cancelAutodock(null);
    G.nodeBurn = { phase: 'align', remaining: plan.magnitude, dir: null, spent: 0 };
    say('Node autopilot armed — burn in ' + fmtTime(Math.max(0, plan.countdown)), 5);
  }

  function cancelNodeBurn(why) {
    if (!G.nodeBurn) return;
    G.nodeBurn = null;
    G.ship.thrust = V.zero();
    if (why) say('Node autopilot ' + why, 3);
  }

  /* Returns the commanded acceleration, or null when it has nothing to
   * command this frame (still waiting for the clock, or finished). */
  function advanceNodeBurn(dtSim) {
    var nb = G.nodeBurn, plan = G.nodePlan;
    if (!plan) return null;

    /* The burn direction is FROZEN AT IGNITION. Recomputing it every frame
     * from the live orbital frame would chase its own tail — the burn is
     * changing the very velocity vector that defines "prograde", so a
     * node asking for pure prograde would curve away from the plan it was
     * checked against. A real spacecraft holds inertial attitude through a
     * burn for the same reason. */
    if (!nb.dir) {
      nb.dir = plan.magnitude > 1e-12
        ? V.scale(plan.dvVec, 1 / plan.magnitude) : null;
      if (!nb.dir) { cancelNodeBurn('has no direction'); return null; }
    }

    // Point the nose along the burn, always — even while waiting, so the
    // player can see the autopilot has the attitude before the clock runs.
    G.ship.fwd = V.clone(nb.dir);
    G.ship.right = V.norm(V.cross(G.ship.fwd, { x: 0, y: 0, z: 1 }));
    if (V.len(G.ship.right) < 1e-6) {
      G.ship.right = V.norm(V.cross(G.ship.fwd, { x: 0, y: 1, z: 0 }));
    }
    G.ship.up = V.cross(G.ship.right, G.ship.fwd);
    G.ship.angRate = { pitch: 0, yaw: 0, roll: 0 };

    var toIgnition = plan.ignition - G.t;
    if (nb.phase === 'align') {
      /* Hold the clock down as ignition approaches, or a single warped
       * frame steps clean over the whole burn window. Coming down in
       * stages rather than straight to 1x means the wait is not tedious. */
      if (toIgnition < 120) G.warpIndex = Math.min(G.warpIndex, 2);
      if (toIgnition < 20) G.warpIndex = 0;
      if (toIgnition > 0) return null;
      nb.phase = 'burn';
      say('Ignition — ' + fmtSpeed(nb.remaining) + ' to burn', 4);
    }

    if (nb.phase === 'burn') {
      G.warpIndex = 0;
      if (nb.remaining <= 0) { finishNodeBurn(); return null; }
      if (G.ship.thrusterFuel <= 0) { cancelNodeBurn('out of reaction mass'); return null; }

      /* Throttle back over the last fraction of a second of burn so the
       * final substep cannot overshoot the target delta-v. Without this a
       * frame worth more delta-v than remains would sail straight past it
       * and the node would never converge. */
      var accel = G.ship.maxAccel;
      var dt = Math.max(dtSim, 1e-6);
      var throttle = Math.min(1, nb.remaining / (accel * dt));
      var cmd = V.scale(nb.dir, accel * throttle);
      // Count what the engine will actually deliver this step.
      nb.remaining -= accel * throttle * dt;
      nb.spent += accel * throttle * dt;
      if (nb.remaining <= 1e-9) nb.remaining = 0;
      return cmd;
    }
    return null;
  }

  function finishNodeBurn() {
    var spent = G.nodeBurn ? G.nodeBurn.spent : 0;
    G.nodeBurn = null;
    G.ship.thrust = V.zero();
    G.node = null; G.nodePlan = null; G.nodeAfter = null; G.nodeHandles = null;
    var oe = Sim.oscElements(G.ship, G.sys, G.t);
    say('Burn complete — ' + fmtSpeed(spent) + ' delivered'
        + (oe ? '.  Periapsis ' + fmtDist(oe.periAlt) + ', apoapsis '
                + (isFinite(oe.apoAlt) ? fmtDist(oe.apoAlt) : 'escape') : ''), 7);
  }

  /* ---- navigation targets -----------------------------------------------
   * Everything in the system you might want to fly at, in one list, sorted
   * by how far away it is. Bodies and ships together deliberately: from the
   * cockpit "that freighter" and "that moon" are the same kind of question,
   * and having two separate target systems for them would only mean
   * learning two sets of keys. */
  function navList() {
    var out = [];
    var i;
    for (i = 0; i < G.sys.bodies.length; i++) {
      var b = G.sys.bodies[i];
      var bs = Sim.bodyState(b, G.sys, G.t);
      out.push({
        kind: 'body', id: b.id, obj: b, name: b.name,
        type: b.typeName || b.kind, pos: bs.pos, vel: bs.vel,
        color: bodyDotColor(b.kind),
        range: V.dist(bs.pos, G.ship.pos)
      });
    }
    if (G.showTraffic) {
      var ships = Sim.shipsAll(G.sys, G.t);
      for (i = 0; i < ships.length; i++) {
        var s = ships[i];
        out.push({
          kind: 'ship', id: s.id, obj: s, name: s.name,
          type: s.className, pos: s.pos, vel: s.vel,
          color: s.color, hostile: s.hostile,
          range: V.dist(s.pos, G.ship.pos)
        });
      }
    }
    out.sort(function (a, b) { return a.range - b.range; });
    return out;
  }

  /* Resolve the stored lock to a live entry. Stored as a kind and an id
   * rather than an object reference on purpose: traffic states are rebuilt
   * every frame, and a held reference would quietly become a snapshot of
   * where that ship was when you locked it. */
  function navTargetState() {
    if (!G.navTarget) return null;
    var list = navList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].kind === G.navTarget.kind && list[i].id === G.navTarget.id) {
        var e = list[i];
        var rel = V.sub(e.pos, G.ship.pos);
        var vrel = V.sub(e.vel, G.ship.vel);
        e.closing = e.range > 1e-9 ? -V.dot(rel, vrel) / e.range : 0;
        e.relSpeed = V.len(vrel);
        e.eta = e.closing > 1e-6 ? e.range / e.closing : Infinity;
        return e;
      }
    }
    // The lock has gone — a docked freighter that departed, most likely.
    G.navTarget = null;
    return null;
  }

  function cycleNavTarget(dir) {
    var list = navList();
    if (!list.length) return;
    var idx = -1;
    if (G.navTarget) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].kind === G.navTarget.kind && list[i].id === G.navTarget.id) { idx = i; break; }
      }
    }
    idx = (idx + dir + list.length) % list.length;
    G.navCursor = idx;
    G.navTarget = { kind: list[idx].kind, id: list[idx].id };
    say('Locked: ' + list[idx].name + '   ' + fmtDist(list[idx].range), 2.5);
  }

  function clearNavTarget() {
    if (!G.navTarget) { say('No navigation lock', 1.5); return; }
    G.navTarget = null;
    say('Navigation lock released', 2);
  }

  /* ---- trade ------------------------------------------------------------
   * The console is deliberately not a modal pause. The near-field economy
   * is stepping while you stand here, so a price you are staring at drifts,
   * and at time warp it drifts fast — which is the whole reason the market
   * was built as a simulation near the ship rather than a lookup table. */

  function fmtCredits(c) {
    var neg = c < 0;
    var s = Math.abs(Math.round(c)).toLocaleString('en-US');
    return (neg ? '−' : '') + s + ' cr';
  }

  function heldTonnes(cid) { return G.ship.cargo[cid] || 0; }

  function openMarket() {
    if (!G.ship.docked) {
      say('Trade console needs a docking clamp — dock at a port first', 3);
      return;
    }
    var port = G.sys.byId[G.ship.docked];
    if (!port.market) { say('No registered market at ' + port.name, 3); return; }
    /* Drop any keys the player was holding when they opened the console, or
     * a thruster stays lit behind a menu that has stopped listening to it. */
    G.keys = {};
    G.ship.thrust = V.zero();
    G.market = { port: port, sel: 0 };
  }

  function marketRows() {
    if (!G.market) return [];
    var list = Eco.priceList(G.market.port, G.t);
    /* Anything the player is carrying stays on the list even where the port
     * does not trade it, or a hold full of ore at a port that has never
     * heard of ore would simply have nowhere to appear. */
    for (var cid in G.ship.cargo) {
      if (G.ship.cargo[cid] <= 0) continue;
      var found = false;
      for (var i = 0; i < list.length; i++) if (list[i].id === cid) { found = true; break; }
      if (!found) {
        list.push({ id: cid, name: Eco.BY_ID[cid].name, mid: 0, buy: null, sell: null,
                    stock: 0, cap: 0, fill: 0, tradeable: false, accepts: false });
      }
    }
    return list;
  }

  function handleMarketKey(e) {
    var rows = marketRows();
    var m = G.market;
    var step = e.shiftKey ? 10 : 1;
    var key = e.key.toLowerCase();

    if (key === 'escape' || key === 'm') { G.market = null; return; }
    if (key === 'arrowdown') { m.sel = Math.min(rows.length - 1, m.sel + 1); return; }
    if (key === 'arrowup') { m.sel = Math.max(0, m.sel - 1); return; }
    if (key === 'f') { refuelFull(); return; }
    if (key === 'u') {
      var left = Sim.undockShip(G.ship, G.sys, G.t, 0.003);
      G.dockTarget = null; G.dockStatus = null; G.market = null;
      say('Undocked from ' + left.name, 4);
      return;
    }
    var row = rows[m.sel];
    if (!row) return;
    if (key === 'arrowright') { trade(row, step); return; }
    if (key === 'arrowleft') { trade(row, -step); return; }
    if (key === 'home') { trade(row, maxBuyable(row)); return; }
    if (key === 'end') { trade(row, -heldTonnes(row.id)); return; }
  }

  function holdFree() { return G.ship.cargoCap - Sim.cargoMass(G.ship); }

  function maxBuyable(row) {
    if (row.buy === null) return 0;
    var byHold = Math.floor(holdFree());
    var byStock = Math.floor(row.stock);
    /* A negative buy price means the port is PAYING you to take it (waste),
     * so credits are not a constraint — only the hold and the pile are. */
    var byCredits = row.buy > 0 ? Math.floor(G.ship.credits / row.buy) : Infinity;
    return Math.max(0, Math.min(byHold, byStock, byCredits));
  }

  /* Positive tonnes = the player buys and the port's stock falls.
   * Negative = the player sells. Both go through Economy.applyTrade, which
   * is what makes the price move under you when you shift real volume. */
  function trade(row, tonnes) {
    if (!tonnes) return;
    var cid = row.id;
    var port = G.market.port;

    if (tonnes > 0) {
      /* A refusal has to teach the rule, or the row just looks broken.
       * A port sells what it produces and buys anything, so the honest
       * answer names the port as a consumer and points somewhere else. */
      if (row.buy === null) {
        say(port.name + ' consumes ' + row.name.toLowerCase() +
            ', it does not export it — they will buy yours', 4);
        return;
      }
      var can = maxBuyable(row);
      tonnes = Math.min(tonnes, can);
      if (tonnes <= 0) {
        say(holdFree() < 1 ? 'Hold full' :
            row.stock < 1 ? 'None in stock' : 'Not enough credits', 2);
        return;
      }
      var cost = tonnes * row.buy;
      G.ship.credits -= cost;
      G.ship.cargo[cid] = heldTonnes(cid) + tonnes;
      Eco.applyTrade(port, cid, tonnes, G.t);
      logTrade((cost < 0 ? 'Collected ' : 'Bought ') + tonnes + 't ' + row.name +
               '  ' + fmtCredits(-cost));
    } else {
      var qty = Math.min(-tonnes, heldTonnes(cid));
      if (qty <= 0) { say('Nothing to sell', 2); return; }
      if (row.sell === null) {
        say(port.name + ' will not take ' + row.name + (row.id === 'waste'
            ? ' — find a reprocessing plant' : ''), 3);
        return;
      }
      var gain = qty * row.sell;
      if (gain < 0 && G.ship.credits + gain < 0) {
        say('Disposal fee exceeds your credits', 3);
        return;
      }
      G.ship.credits += gain;
      G.ship.cargo[cid] = heldTonnes(cid) - qty;
      if (G.ship.cargo[cid] <= 1e-9) delete G.ship.cargo[cid];
      Eco.applyTrade(port, cid, -qty, G.t);
      logTrade((gain < 0 ? 'Disposed of ' : 'Sold ') + qty + 't ' + row.name +
               '  ' + fmtCredits(gain));
    }
    Sim.refreshShip(G.ship);
  }

  function logTrade(text) {
    G.ledgerLog.unshift({ text: text, t: G.t });
    if (G.ledgerLog.length > 6) G.ledgerLog.length = 6;
    say(text, 3);
  }

  /* Fuel is a commodity like any other: it is bought from the port's own
   * hydrogen stock at the port's own hydrogen price, which is why refuelling
   * at a gas-giant refinery is cheap and refuelling at a farming co-op is
   * not. Range is therefore a function of your route, not a global number. */
  function refuelFull() {
    var port = G.ship.docked ? G.sys.byId[G.ship.docked] : null;
    if (!port || !port.market) { say('Not docked', 2); return; }
    var p = Eco.price(port, Eco.FUEL_ID, G.t);
    if (!p || p.buy === null) { say(port.name + ' sells no hydrogen', 3); return; }
    var want = G.ship.fuelCap - G.ship.fuel;
    if (want < 0.01) { say('Tank already full', 2); return; }
    var afford = p.buy > 0 ? G.ship.credits / p.buy : Infinity;
    var got = Math.min(want, p.stock, afford);
    if (got < 0.01) {
      say(p.stock < 0.01 ? 'No hydrogen in stock' : 'Not enough credits for fuel', 3);
      return;
    }
    got = Math.round(got * 100) / 100;
    G.ship.credits -= got * p.buy;
    G.ship.fuel += got;
    Eco.applyTrade(port, Eco.FUEL_ID, got, G.t);
    Sim.refreshShip(G.ship);
    logTrade('Jump fuel +' + got.toFixed(2) + 't  ' + fmtCredits(-got * p.buy));
  }

  /* Hand over what the pirate asked for. There is no combat in this pass,
   * so the alternative is not "fight" — it is "outrun", and whether you can
   * depends on how full your hold is. That is the whole point of the mass
   * budget: a laden ship accelerates at half the rate an empty one does,
   * and a pirate's is fixed. Being rich is what makes you catchable. */
  function complyWithDemand() {
    var spec = G.encounter && G.encounter.demand;
    if (!spec) return;
    var paid = Sim.payPirate(spec, G.ship, Eco);
    say('Handed over ' + paid + ' — ' + spec.name + ' is breaking off', 6);
    G.ledgerLog.unshift({ text: 'Robbed of ' + paid + ' by ' + spec.name, t: G.t });
    if (G.ledgerLog.length > 6) G.ledgerLog.length = 6;
  }

  /* Dumping waste in space rather than paying to dispose of it properly.
   * Allowed, because refusing would be a lie about what a ship can do. It
   * is NOT free: the payout for waste lands when you LOAD it, not when you
   * deliver it, so unlike every other jettison there is nothing left to
   * forfeit — which is precisely why it has to be a crime instead. See
   * Combat.dumping. */
  /* Hail whoever is highlighted in the comms directory.
   *
   * Ports get asked for docking clearance, which is the only conversation
   * that exists so far. Ships are in the list because they are people you
   * can see, and being told there is nothing to say to them yet is a more
   * honest answer than leaving the key silently dead. */
  /* What the police channel owes you when you call it, and what it will
   * take. Reporting a crime is a later piece of work; this is the half you
   * need when the trouble is your own. */
  function hailAuthority(fac) {
    var owed = Math.round((G.wanted || {})[fac.id] || 0);
    var fugitive = Combat.isFugitive(G, fac.id);
    var standing = Math.round((G.standing || {})[fac.id] || 0);
    var label = global.Missions ? Missions.standingLabel(standing) : '';

    if (!owed && !fugitive) {
      G.payOffer = null;
      say(fac.name + ' Control: "No outstanding matters. Standing ' +
          label + '." ', 6);
      return;
    }

    /* Quoted, then confirmed. Spending a chunk of the player's money on a
     * single keypress in a list they were scrolling is not something to do
     * on one press, and the second key is also where the price gets to be
     * stated plainly before it is taken. */
    var cost = fugitive ? Math.round(owed * 1.2) : Math.round(owed * 1.6);
    G.payOffer = { faction: fac.id, name: fac.name, cost: cost,
                   fugitive: fugitive, until: G.t + 60 };
    say(fac.name + ' Control: "' + (fugitive ? 'You are logged FUGITIVE. ' : '') +
        owed + ' cr outstanding, ' + cost + ' cr to settle including costs. ' +
        'Standing ' + label + '."   — Y to pay', 8);
  }

  function payOutstanding() {
    var off = G.payOffer;
    if (!off) { say('Nothing quoted — hail the police channel first', 3); return; }
    if (G.t > off.until) { G.payOffer = null; say('That quote has expired', 3); return; }
    var paid = off.fugitive ? Combat.payFugitive(G) : Combat.payBounty(G, off.faction);
    if (paid < 0) {
      say('Declined — ' + Math.abs(paid) + ' cr required, you have ' +
          Math.round(G.ship.credits), 5);
      HOOKS.sound('warn');
      return;
    }
    G.payOffer = null;
    say(off.name + ' Control: "Settled, ' + paid + ' cr. Fly safe."', 6);
    HOOKS.sound('click');
  }

  function hailSelected(contact) {
    if (!contact) { say('Nobody selected', 2); return; }
    if (contact.kind === 'authority') { hailAuthority(contact.obj); return; }
    if (contact.kind !== 'station') {
      say('No channel open to ' + contact.name, 3);
      return;
    }
    var port = contact.obj;
    /* Docked at this port, the only thing you can usefully ask for is a way
     * out — so the same key asks the question that actually applies. */
    if (G.ship.docked === port.id) {
      if (Combat.launchCleared(G, port)) {
        say(port.name + ': "You are cleared to launch. U when ready."', 4);
        return;
      }
      Combat.requestLaunch(G, port, HOOKS);
      return;
    }
    if (Combat.isCleared(G, port)) {
      say(port.name + ': "You are already cleared. Come on in."', 4);
      return;
    }
    Combat.requestClearance(G, port, HOOKS);
  }

  /* Landing gear.
   *
   * Refused while docked or landed for the obvious reason: the gear is
   * holding the ship up, and retracting it where it is bearing weight is
   * not a thing a pilot gets to do by accident.
   *
   * Extending it costs drag (Sim.GEAR_DRAG_FACTOR) and is required both to
   * be caught by a landing pad and to touch down on open ground without
   * writing the ship off. There is no speed limit on the actuation itself —
   * the atmosphere already punishes doing it early, and a hard interlock
   * would only be a second thing to explain. */
  function toggleGear() {
    var s = G.ship;
    if (s.docked || s.landed) {
      say('Gear is bearing the ship — not while we are down', 3);
      return;
    }
    s.gear = !s.gear;
    Sim.refreshShip(s);            // the drag area changes with it
    /* Both arms of the old ternary here were 'click', which reads as an
     * intention that was never finished — there is no down/up pair in the
     * FX table to choose between. One click until there is. */
    if (global.Sound) global.Sound.fx('click');
    say(s.gear ? 'Landing gear DOWN — locked' : 'Landing gear UP', 3);
  }

  function jettisonWaste() {
    if (heldTonnes('waste') <= 0) { say('No waste aboard', 2); return; }
    jettison('waste', Infinity);
  }

  /* The hold, as a list, newest-heaviest first and stable frame to frame so
   * the selection does not move under the cursor. Fitted equipment is not
   * in here and never will be: cargo is what you can throw out of the ship,
   * and a drive you have bolted to the hull is not that. */
  function heldCargo() {
    var s = G.ship, out = [];
    var ids = Object.keys(s.cargo);
    for (var i = 0; i < ids.length; i++) {
      if (s.cargo[ids[i]] <= 1e-9) continue;
      var good = Eco.BY_ID[ids[i]];
      out.push({ cid: ids[i], name: good ? good.name : ids[i],
                 tonnes: s.cargo[ids[i]], good: good });
    }
    out.sort(function (a, b) {
      return b.tonnes - a.tonnes || (a.cid < b.cid ? -1 : 1);
    });
    return out;
  }

  /* Throwing cargo out of the airlock. It is a real loss — nobody pays you
   * for it and nobody hands it back — but it is instant and it works while
   * you are being chased, which is the entire reason it exists: the mass
   * budget says a full hold cannot outrun a pirate, and this is the lever
   * that argument leaves you holding.
   *
   * The tonnage goes somewhere. A canister on your old trajectory is a
   * scannable object, so anyone with a cargo scanner can see what you
   * dumped and where, and pick it up if they are quick. */
  function jettison(cid, tonnes) {
    var have = heldTonnes(cid);
    if (have <= 0) { say('None aboard', 2); return 0; }
    var qty = Math.min(have, tonnes);
    qty = Math.round(qty * 100) / 100;
    if (qty <= 0) return 0;

    G.ship.cargo[cid] = have - qty;
    if (G.ship.cargo[cid] <= 1e-9) delete G.ship.cargo[cid];
    Sim.refreshShip(G.ship);

    /* Docked, it goes onto the pad rather than into orbit. Same loss, and
     * no canister for anyone to find. */
    var good = Eco.BY_ID[cid];
    if (!G.ship.docked && !G.ship.landed && Sim.dropCanister) {
      var can = Sim.dropCanister(G.sys, G.ship, cid, qty, G.t);
      /* Waste leaves evidence. The canister is a scannable object that
       * outlives the moment of dumping, and tagging it here — rather than
       * inside dropCanister, which does not know whose airlock it came
       * out of — is what lets anything later tell an accident from a
       * crime. */
      if (can && good && good.waste) { can.illegal = true; can.dumpedBy = 'player'; }
    }

    /* Dumping waste is a crime and resolves at the moment of the act, the
     * same way a police scan does. Docked or landed it never reaches this:
     * you cannot dump on a pad, the cargo just goes back into the port's
     * hands. */
    if (good && good.waste && !G.ship.docked && !G.ship.landed && Combat.dumping) {
      Combat.dumping(G.sys, G, G.t, cid, qty, HOOKS);
    } else {
      say('Jettisoned ' + qty.toFixed(qty < 1 ? 2 : 0) + 't ' +
          (good ? good.name : cid), 3);
    }
    if (G.invSel >= heldCargo().length) G.invSel = Math.max(0, heldCargo().length - 1);
    return qty;
  }

  /* ---- keeping the predicted path affordable ---------------------------
   * Profiled on the target laptop (i5-8350U/UHD 620), predictTrajectory was
   * the single most expensive thing in the game: 12-25 ms a call against a
   * 2.2 ms median frame, producing a metronomic stall every 16th frame — and
   * applyControls drops the interval from 0.25 s to 0.08 s the moment you
   * touch the throttle, so it was worst exactly while decelerating, which is
   * where it was reported.
   *
   * Cost is (points x substeps), and substeps saturate at 8, so cost is very
   * nearly linear in the point count. That is the knob. Rather than cutting
   * the path short — a quarter of an ellipse is a worse instrument than a
   * whole one drawn coarsely — the resolution adapts to hit a time budget,
   * climbing back toward full detail whenever the path is cheap. */
  var TRAJ_SEGMENTS = 240;     // ellipse resolution; smooth at any zoom
  var TRAJ_INT_POINTS = 260;   // points when we do have to integrate
  var TRAJ_INT_HORIZON = 6 * 3600;   // s — how far ahead integration looks

  /* Which of the two to draw.
   *
   * Integration is the truthful answer and the expensive one. It earns its
   * cost in exactly two situations: when the player is burning, because the
   * osculating ellipse is a snapshot of an orbit that is actively being
   * changed and would lie about where the ship is going; and when something
   * is about to be hit, because an ellipse drawn straight through a planet
   * is worse than no prediction at all.
   *
   * Everywhere else — which is most of the time, including all of cruise and
   * all of orbit — the ship is on a conic and the closed form is both cheaper
   * and smoother. Cheap enough that the 0.08 s recompute rate under thrust
   * (see applyControls) stops mattering.
   *
   * Note the integrated branch looks only six hours ahead rather than a whole
   * period. Under thrust the far end of a predicted orbit is fiction anyway —
   * the burn will have changed it long before you get there — and it is the
   * near field you are actually flying on. */
  /* Does the current osculating orbit reach the ground of the body it is
   * about? Closed form, from elements the HUD already computes. This is a
   * guard on the ellipse branch, not a general impact test — it knows only
   * about the dominant body, so it can say "this orbit definitely hits" but
   * never "nothing can be hit" (a safe orbit about a planet can still meet a
   * moon). Used only to force the truthful path where it is cheap to know we
   * need one. */
  var PERIAPSIS_MARGIN = 1.06;         // clear the surface by 6% of a radius

  function orbitReachesGround() {
    var oe = Sim.oscElements(G.ship, G.sys, G.t);
    if (!oe || !oe.body) return true;                 // unknown: be truthful
    if (!oe.closed || !isFinite(oe.period)) return true;
    return oe.periapsis < oe.body.radius * PERIAPSIS_MARGIN;
  }

  /* How much of a frame the predictor is allowed. The measured cost of a
   * full integration is 12-25 ms; at 3 ms a frame it lands complete inside
   * a tenth of a second and never owns a frame. */
  var TRAJ_FRAME_BUDGET = 3;
  /* And how far out of date a job may get before it is worth starting
   * again. At 1x this is never hit; at high warp the world moves under a
   * job faster than it can finish, and a path plotted from where you were
   * two seconds of simulation ago is a path drawn somewhere else. */
  var TRAJ_MAX_LAG = 2;

  /* One frame's worth of prediction.
   *
   * The cheap branch (a stable orbit, drawn as its own ellipse) is still
   * computed outright, because it costs well under a millisecond. Only the
   * integrated branch — burning, falling, in air — becomes a job, and the
   * previous path stays on screen while the new one is being built, so the
   * display never blinks. */
  function advancePrediction(dtReal) {
    if (!G.showPrediction || G.ship.landed || G.ship.docked) {
      G.trajJob = null;
      return;
    }

    if (G.trajJob) {
      if (G.t - G.trajJob.t0 > TRAJ_MAX_LAG * Math.max(1, WARPS[G.warpIndex])) {
        G.trajJob = null;                 // overtaken by the clock; start over
      } else if (Sim.stepPrediction(G.trajJob, G.sys, TRAJ_FRAME_BUDGET)) {
        G.trajectory = G.trajJob.result;
        G.trajJob = null;
        G.trajectoryStale = 0.25;
      } else {
        return;                           // still working; nothing else to do
      }
    }

    G.trajectoryStale -= dtReal;
    if (G.trajectoryStale > 0) return;

    var ellipse = plotEllipsePath();
    if (ellipse) {
      G.trajectory = ellipse;
      G.trajectoryStale = 0.25;
      return;
    }
    G.trajJob = Sim.beginPrediction(G.ship, G.sys, G.t, {
      maxPoints: TRAJ_INT_POINTS,
      includeThrust: false,
      horizon: TRAJ_INT_HORIZON
    });
  }

  /* The closed-form branch on its own, or null when this is a case only
   * integration can answer honestly. */
  function plotEllipsePath() {
    var burning = G.ship.thrust && V.len(G.ship.thrust) > 0;
    var impactSoon = !!G.impactForecast;
    /* Inside an atmosphere the ellipse is simply false: drag is bleeding
     * energy every second, so the orbit is not a conic and the closed form
     * would draw a path the ship will never fly. Integration is the only
     * honest answer here, and it is also where the player most needs one. */
    var inAir = !!Sim.atmosphereContext(G.ship.pos, G.sys, G.t);
    if (burning || impactSoon || inAir || orbitReachesGround()) return null;
    return Sim.ellipsePath(G.ship, G.sys, G.t, TRAJ_SEGMENTS);
  }

  /* ---- thrust in the orbital frame ------------------------------------ */
  /* Prograde/radial/normal is the frame that actually matters in orbit, and
   * every direction is shown on screen as an arrow pointing where the burn
   * will push you. */
  function orbitalFrame() {
    var dom = Sim.dominantBody(G.ship.pos, G.sys, G.t);
    var bs = Sim.bodyState(dom, G.sys, G.t);
    var rel = V.sub(G.ship.pos, bs.pos);
    var vrel = V.sub(G.ship.vel, bs.vel);
    var prograde = V.norm(vrel);
    var radial = V.norm(rel);
    var normal = V.norm(V.cross(rel, vrel));
    if (V.len(normal) < 1e-12) normal = { x: 0, y: 0, z: 1 };
    return { body: dom, prograde: prograde, radial: radial, normal: normal, rel: rel, vrel: vrel };
  }

  /* Where the thrust keys push.
   *
   * SHIP frame is the default and the one that stops the game being
   * confusing: W drives you along the nose, so pointing at something and
   * holding W takes you toward it. That sounds obvious and was not what
   * this did — thrust used to be applied in the ORBITAL frame, so W meant
   * prograde regardless of where you were looking, and aiming at a station
   * then burning sent you somewhere else entirely.
   *
   * ORBITAL frame is kept, not replaced. Prograde/radial/normal is the
   * right vocabulary for a transfer burn and the manoeuvre-node system
   * speaks it, so it stays available on the same keys under a mode toggle
   * rather than being thrown away for the sake of one default. */
  function shipFrameThrust(mag, active) {
    var s = G.ship, acc = V.zero();
    if (G.keys['w']) { acc = V.addScaled(acc, s.fwd, mag); active.fore = 1; }
    if (G.keys['s']) { acc = V.addScaled(acc, s.fwd, -mag); active.aft = 1; }
    if (G.keys['d']) { acc = V.addScaled(acc, s.right, mag); active.stbd = 1; }
    if (G.keys['a']) { acc = V.addScaled(acc, s.right, -mag); active.port = 1; }
    if (G.keys['r']) { acc = V.addScaled(acc, s.up, mag); active.up = 1; }
    if (G.keys['f']) { acc = V.addScaled(acc, s.up, -mag); active.down = 1; }
    return acc;
  }

  function orbitalFrameThrust(fr, mag, active) {
    var acc = V.zero();
    if (G.keys['w']) { acc = V.addScaled(acc, fr.prograde, mag); active.pro = 1; }
    if (G.keys['s']) { acc = V.addScaled(acc, fr.prograde, -mag); active.ret = 1; }
    if (G.keys['d']) { acc = V.addScaled(acc, fr.radial, mag); active.rout = 1; }
    if (G.keys['a']) { acc = V.addScaled(acc, fr.radial, -mag); active.rin = 1; }
    if (G.keys['r']) { acc = V.addScaled(acc, fr.normal, mag); active.nplus = 1; }
    if (G.keys['f']) { acc = V.addScaled(acc, fr.normal, -mag); active.nminus = 1; }
    return acc;
  }

  /* What the ship should hold station against, or null when there is
   * nothing sensible. Flight assist is only meaningful RELATIVE TO
   * SOMETHING, and picking the wrong something is what makes assists in
   * orbital games unusable: cancel drift against the planet you are
   * orbiting and the computer fights your seven kilometres a second of
   * orbital velocity forever, emptying the tank to hold an attitude.
   *
   * Against a target it is exactly right — the station shares your orbit,
   * so nulling drift relative to IT costs almost nothing and turns a
   * docking approach into pointing and waiting. */
  /* Returns the reference VELOCITY, not the object. The nav list holds
   * bodies and live ships side by side and only the bodies can be asked
   * for a velocity by id, so resolving to a vector here keeps both kinds
   * working through one path. */
  /* How close you have to be for the assist to take an interest, and how
   * much of the engine it may ever spend.
   *
   * Both exist because the first version had neither and was unusable: with
   * a dock locked thirty thousand kilometres away, the drift "relative to
   * the target" is most of your orbital velocity, so the computer pinned
   * the throttle at 100% and held it there, burning the tank to fly a
   * transfer it had no business flying. Assist is a MANOEUVRING aid — it
   * belongs in the last few hundred kilometres, and it should never be able
   * to out-argue the pilot. */
  var ASSIST_RANGE = 150;        // km
  var ASSIST_AUTHORITY = 0.6;    // fraction of max thrust it may ever use

  function assistRefVelocity() {
    if (G.dockTarget) {
      var p = Sim.bodyPosition(G.dockTarget, G.sys, G.t);
      if (V.dist(p, G.ship.pos) > ASSIST_RANGE) return null;
      return Sim.bodyVelocity(G.dockTarget, G.sys, G.t);
    }
    var nav = navTargetState();
    if (nav && nav.vel && nav.range <= ASSIST_RANGE) return nav.vel;
    return null;
  }

  function applyControls(dtReal) {
    var fr = orbitalFrame();
    var acc = V.zero();
    var mag = G.ship.maxAccel * (G.keys['shift'] ? 0.08 : 1);
    var active = {};

    if (!G.ship.docked) {
      acc = (G.flightMode === 'orbital')
        ? orbitalFrameThrust(fr, mag, active)
        : shipFrameThrust(mag, active);
    }

    /* Everything below distinguishes PILOT input from computer input, and
     * `manual` is that line. Flight assist is applied further down, after
     * the autopilots have decided whether a human is flying — the first
     * version added it before, and since assist is thrust like any other,
     * every autopilot instantly concluded the pilot had grabbed the
     * controls and handed back. Auto-dock stopped docking entirely. */
    var manual = V.len(acc);

    /* Auto-dock flies the ship the same way you do — by commanding thrust —
     * so it goes here, and any manual input on the burn keys takes it back.
     * A pilot reaching for the controls should always win. */
    if (G.autodock) {
      if (manual > 0) {
        cancelAutodock('handed back to you');
      } else {
        var cmd = advanceAutodock(G.lastDtSim || 0.016);
        if (cmd) acc = cmd;
      }
    }

    /* The node autopilot sits alongside auto-dock and obeys the same rule:
     * a hand on the thrust keys always wins. It runs on SIM seconds because
     * that is what the engine is billed in — see advanceShip. */
    if (G.nodeBurn) {
      if (manual > 0) {
        cancelNodeBurn('handed back to you');
      } else {
        var ncmd = advanceNodeBurn(G.lastDtSim || 0.016);
        if (ncmd) acc = ncmd;
      }
    }

    /* Flight assist, last: it spends whatever thrust the PILOT is not
     * using to kill sideways drift relative to whatever is locked, leaving
     * the along-nose component alone. Leaving the forward component
     * untouched is what makes it an assist rather than a brake — the
     * velocity vector swings round to follow the nose instead of the ship
     * crabbing past a berth.
     *
     * Skipped entirely while an autopilot is flying: those already null
     * their own relative velocity, and two controllers pushing at the same
     * target is how you get a ship that hunts instead of arriving. */
    if (G.flightMode === 'ship' && G.assist &&
        !G.ship.docked && !G.ship.landed && !G.autodock && !G.nodeBurn) {
      var rv = assistRefVelocity();
      if (rv) {
        var rel = V.sub(G.ship.vel, rv);
        var along = V.dot(rel, G.ship.fwd);
        var lateral = V.addScaled(rel, G.ship.fwd, -along);
        var lat = V.len(lateral);
        if (lat > 1e-7) {
          var spare = Math.max(0, G.ship.maxAccel * ASSIST_AUTHORITY - manual);
          var dtA = Math.max(G.lastDtSim || dtReal || 0.016, 1e-3);
          var use = Math.min(spare, lat / dtA);
          if (use > 0) {
            acc = V.addScaled(acc, V.scale(lateral, 1 / lat), -use);
            active.assist = 1;
          }
        }
      }
    }

    G.ship.thrust = acc;
    G.ship.throttle = V.len(acc) / G.ship.maxAccel;
    G.activeThrust = active;
    G.frame = fr;
    // Re-plot promptly while burning, but not every frame: the prediction is
    // the most expensive thing we compute, and 12 Hz looks identical.
    /* Re-plot promptly while burning. 0.08 s was the old number, chosen
     * when a re-plot was one expensive frame and you wanted as few of them
     * as you could stand; now that the work is spread out, a job takes
     * about that long to finish on its own, so asking for one twice as
     * often as it can be built just means integrating continuously. 0.18 s
     * keeps the path visibly live under thrust and halves the standing
     * cost. */
    if (V.len(acc) > 0) G.trajectoryStale = Math.min(G.trajectoryStale, 0.18);

    /* Attitude (facing) is controlled separately from translation, because a
     * spacecraft can point anywhere regardless of where it's burning. It
     * runs on real time rather than sim time so aiming stays responsive at
     * any warp level — rotating the ship doesn't need to be "warped", only
     * the orbit does. ArrowUp/Down pitch the nose, ArrowLeft/Right yaw it,
     * Q/E roll. Sign convention: ArrowUp pitches the nose toward the
     * ship's own "up", verified against the attitude ladder in testing. */
    if (!G.ship.docked) {
      // Verified empirically (test/physics.test.js, "attitude control sign
      // conventions"): with this mapping, ArrowUp pitches the nose toward
      // the ship's own up, ArrowRight yaws it toward the ship's own right,
      // and E rolls the top of the ship toward the right (rolls right).
      var rot = attitudeCommand();
      Sim.integrateAttitude(G.ship, dtReal, rot);
    }
  }

  /* The attitude stick: keys plus, if F9 says so, the mouse. One function,
   * so cruise and normal flight cannot end up steering differently. */
  function attitudeCommand() {
    var rot = {
      pitch: (G.keys['arrowup'] ? 1 : 0) - (G.keys['arrowdown'] ? 1 : 0),
      yaw: (G.keys['arrowleft'] ? 1 : 0) - (G.keys['arrowright'] ? 1 : 0),
      roll: (G.keys['e'] ? 1 : 0) - (G.keys['q'] ? 1 : 0)
    };
    if (G.mouseAim) {
      rot.pitch = Math.max(-1, Math.min(1, rot.pitch + G.aimCmd.pitch));
      rot.yaw = Math.max(-1, Math.min(1, rot.yaw + G.aimCmd.yaw));
      G.aimCmd.pitch *= 0.86;
      G.aimCmd.yaw *= 0.86;
      if (Math.abs(G.aimCmd.pitch) < 1e-3) G.aimCmd.pitch = 0;
      if (Math.abs(G.aimCmd.yaw) < 1e-3) G.aimCmd.yaw = 0;
    }
    return rot;
  }

  /* ---- update --------------------------------------------------------- */

  /* How much warning does the player get before impact, in REAL seconds,
   * at the current warp setting? Below this, a jump can eat the whole
   * final approach between one rendered frame and the next — which is
   * exactly what happened the first time this was left unhandled: a warp
   * jump silently carried a decaying orbit straight into the star. */
  var IMPACT_REACTION_SECONDS = 2.5;

  function update(dtReal) {
    /* The menu stops the world. Not G.paused — that is the player's own
     * pause and has to still be however they left it when the menu closes —
     * but a genuine early return, so nothing ages, no fuel burns and nobody
     * closes on you while you are reading a slot list. The camera still
     * tracks the ship so the view behind the overlay is not left pointing
     * at where the ship used to be. */
    if (G.menu || G.title) {
      if (G.followShip && G.ship) G.cam.target = V.clone(G.ship.pos);
      return;
    }

    /* In transit nothing else happens. No physics, no markets, no
     * encounters — you are not anywhere for them to happen in. The camera
     * still follows the ship so the cockpit stays put around you. */
    if (G.hyper) {
      advanceHyper(dtReal);
      G.cam.target = V.clone(G.ship.pos);
      return;
    }

    /* Cruise runs its own kinematics — you are not on a trajectory inside
     * the bubble — but steering still works, so attitude is integrated
     * before the drive moves you along the nose. */
    if (G.cruise) {
      if (!G.ship.docked) Sim.integrateAttitude(G.ship, dtReal, attitudeCommand());
      /* Auto-dock's long leg is flown inside the bubble, and this branch
       * returns before applyControls ever runs — so the autopilot gets its
       * one job here: keep the nose on the station, and call the drop-out.
       * Steering it from applyControls looked right and never executed. */
      if (G.autodock) steerAutoCruise();
      /* steerAutoCruise can drop us out of cruise on arrival, and the
       * kinematics must not then run against a bubble that is gone. */
      if (G.cruise) advanceCruise(dtReal);
      if (Eco) Eco.update(G.sys, G.t, G.ship.pos, Sim.bodyPosition);
      G.cam.target = V.clone(G.ship.pos);
      G.trajectory = null;
      G.trajJob = null;
      return;
    }

    applyControls(dtReal);

    var warp = WARPS[G.warpIndex];
    G.lastDtSim = 0;

    /* Honest time warp: work out the largest simulation step we can take
     * while still integrating the ship properly, and clamp to it rather than
     * pretending. Close to a moon that means low warp; out in deep space you
     * can skip years. */
    var h = Sim.suggestedStep(G.ship, G.sys, G.t);
    var maxDt = h * 3000;
    G.warpCap = maxDt / Math.max(dtReal, 1e-3);
    G.physicsLimited = false;
    G.impactWarning = null;

    if (!G.paused && G.ship.docked) {
      /* Docked: rigidly attached to the target, so there is nothing to
       * integrate and nothing that can go wrong — time is free to run at
       * full warp with no collision risk and no accuracy cap. */
      G.lastDtSim = warp * dtReal;
      G.t += G.lastDtSim;
      Sim.updateDockedShip(G.ship, G.sys, G.t);
    } else if (!G.paused && !G.ship.landed) {
      var dtSim = warp * dtReal;
      if (dtSim > maxDt) {
        /* The integrator wants a smaller step than the player asked for.
         * Clamp to what it can actually do — but never below the floor,
         * because five times real time is only 0.08 s of simulation and
         * sits comfortably inside the step budget even hard against a
         * surface. In practice this branch almost never reaches the floor;
         * it is here so that "physics limited" can never again mean
         * "unplayable". */
        dtSim = Math.max(maxDt, Math.min(dtSim, WARP_FLOOR * dtReal));
        G.physicsLimited = true;
      }
      G.lastDtSim = dtSim;

      /* Look for an impact inside this jump BEFORE taking it. Prefer the
       * already-computed prediction (cheap, multi-body-accurate); if
       * prediction display is off, fall back to a direct scan so the safety
       * net still works with the green line hidden. */
      var predictedHit = (G.trajectory && G.trajectory.impact) ? G.trajectory.impact : null;
      var timeToImpact = predictedHit ? (predictedHit.t - G.t) : Infinity;
      if (!G.showPrediction) {
        var scan = Sim.scanForImpact(G.ship, G.sys, G.t, Math.max(dtSim, warp * IMPACT_REACTION_SECONDS));
        if (scan) { timeToImpact = scan.inSeconds; predictedHit = scan; }
      }

      if (isFinite(timeToImpact)) {
        var reactionWindow = Math.max(warp * IMPACT_REACTION_SECONDS, 4);
        if (timeToImpact < reactionWindow) {
          // Close enough that this warp setting would blow through it:
          // never advance past just short of the impact in one jump, and
          // drop warp so the player gets real reaction time back.
          dtSim = Math.min(dtSim, Math.max(0, timeToImpact - 0.5));
          /* Step DOWN toward the floor rather than falling to 1x.
           *
           * Slamming warp to 1x was technically safe and miserable to
           * play: a long powered approach to a station in a planet's well
           * has a predicted impact somewhere ahead of it almost the whole
           * way, so the safety net fired over and over and left a
           * twenty-hour burn to be sat through in real time.
           *
           * Descending one notch at a time keeps the reaction window
           * growing every frame the danger persists, which is the actual
           * point of the mechanism, while WARP_FLOOR keeps a burn from
           * ever becoming unplayable. The floor is abandoned only when
           * impact is genuinely seconds away, which is the one case where
           * real time is what you want. */
          if (timeToImpact < IMPACT_HANDS_ON) {
            if (G.warpIndex > 0) {
              G.warpIndex = 0;
              say('IMPACT IMMINENT — ' + predictedHit.body.name + ' — warp 1×', 4);
            }
          } else if (WARPS[G.warpIndex] > WARP_FLOOR) {
            G.warpIndex = Math.max(WARP_FLOOR_INDEX, G.warpIndex - 1);
            if (WARPS[G.warpIndex] <= WARP_FLOOR) {
              say('Collision course with ' + predictedHit.body.name +
                  ' — warp held at ' + WARP_FLOOR + '×', 4);
            }
          }
          G.impactWarning = { danger: true,
            text: 'COLLISION COURSE — ' + predictedHit.body.name + ' in ' + fmtTime(Math.max(0, timeToImpact)) };
        } else if (timeToImpact < 3.6e4) {
          // Further out: no need to intervene yet, just keep it on the HUD.
          G.impactWarning = { danger: false,
            text: 'impact predicted: ' + predictedHit.body.name + ' in ' + fmtTime(timeToImpact) };
        }
      }

      // The urgent scan above is deliberately narrow once warp is low — its
      // window is tied to the CURRENT warp's reaction time, so it stays
      // cheap every frame. That means right after it forces a safety
      // warp-drop, its own window shrinks too and the informational
      // "impact predicted in X" banner disappears — exactly when the player
      // most wants to know how much runway they actually have. With
      // prediction display off there is no G.trajectory to fall back on
      // either, so keep a separate, much longer-horizon scan alive on its
      // own slower clock purely to backfill that banner. It never touches
      // dtSim or warp — only the urgent scan above is allowed to do that.
      if (!G.showPrediction) {
        G.impactForecastStale -= dtReal;
        if (G.impactForecastStale <= 0) {
          G.impactForecast = Sim.scanForImpact(G.ship, G.sys, G.t, 3.6e4, 3000);
          /* This scan is the other 20 ms spike in the frame, for the same
           * reason the predicted path was: it integrates ten hours ahead,
           * and it did so twice a second regardless of whether anything
           * could plausibly be hit.
           *
           * It still runs on every orbit — it must, because it is the only
           * thing that sees a MOON in the way, which the osculating ellipse
           * about the planet knows nothing about. But when the orbit clears
           * its own primary's surface and the engine is off, nothing is
           * developing quickly, and it can run at a quarter of the rate.
           * Any burn resets it to the fast cadence through the same path
           * that resets the trajectory. */
          var relaxed = !(G.ship.thrust && V.len(G.ship.thrust) > 0) &&
                        !G.impactForecast && !orbitReachesGround();
          G.impactForecastStale = relaxed ? 2.0 : 0.5;
        }
        if (!G.impactWarning && G.impactForecast) {
          var farOut = G.impactForecast.t - G.t;
          if (farOut > 0 && farOut < 3.6e4) {
            G.impactWarning = { danger: false,
              text: 'impact predicted: ' + G.impactForecast.body.name + ' in ' + fmtTime(farOut) };
          }
        }
      } else {
        G.impactForecast = null;
      }

      var res = Sim.advanceShip(G.ship, G.sys, G.t, dtSim, 3000);
      G.t = res.t;
      if (G.ship.landed && !G.reported) {
        G.reported = true;
        say(G.ship.crashed
          ? 'Impact with ' + G.ship.landedOn.name + ' at ' + fmtSpeed(G.ship.impactSpeed) + '   (B to respawn)'
          : 'Touchdown on ' + G.ship.landedOn.name, 8);
        G.warpIndex = 0;
      }
      if (!G.ship.landed) G.reported = false;

      /* A pad inside its envelope declined to catch us because the gear was
       * up. Sim raises the flag; saying why is this layer's job, and it has
       * to be said — an approach that silently does nothing reads as a
       * broken pad, and the player's next move is to fly it again. */
      if (G.ship.gearBalked) {
        G.ship.gearBalked = false;
        if (!G.gearNagAt || G.t - G.gearNagAt > 8) {
          G.gearNagAt = G.t;
          say('Pad will not take you with the gear up — Shift+G', 5);
          if (global.Sound) global.Sound.fx('warn');
        }
      }

      // Are we close enough and slow enough to latch onto the docking
      // target? Checked every physics tick, not just on approach — a
      // sloppy final few metres is exactly when this matters most.
      if (G.dockTarget && !G.ship.landed) {
        G.dockStatus = Sim.dockingStatus(G.ship, G.dockTarget, G.sys, G.t);
        if (G.dockStatus.inRange && G.dockStatus.slowEnough) {
          /* Traffic control has a warrant list. A wanted ship sitting in
           * the envelope is not docked; it is loitering outside a door
           * that will not open. Surface pads stay usable — nobody can
           * stop you landing on dirt — which quietly makes them the
           * smuggler's route home. */
          if (Combat.dockRefused(G, G.dockTarget)) {
            if (performance.now() > (G.dockDeniedUntil || 0)) {
              G.dockDeniedUntil = performance.now() + 6000;
              say(G.dockTarget.name + ': "Docking DENIED. Settle your bounty elsewhere."', 6);
              HOOKS.sound('warn');
            }
          } else {
            Sim.dockShip(G.ship, G.dockTarget, G.sys, G.t);
            say('Docked with ' + G.dockTarget.name, 5);
            G.warpIndex = 0;
          }
        }
      }
    }

    /* Arriving at a port — orbital or on the ground — settles the
     * clearance: spends it, or books the citation for turning up
     * unannounced.
     *
     * Detected as a TRANSITION rather than hooked into the places that
     * dock, because there are two of them: the explicit Sim.dockShip call
     * above, and pad capture, which completes deep inside Sim.checkImpact
     * where there is no call site to hook at all.
     *
     * Placed HERE, outside the whole if/else chain, and that position is
     * the entire point. The first version sat inside the not-docked branch
     * and ran BEFORE the dock call a few lines below it — so on the frame
     * the ship docked the edge had not happened yet, and on every frame
     * after, that branch was skipped because the ship was docked. It
     * silently never fired: no fine, no clearance consumed. Out here it
     * runs once a frame whatever the ship is doing. */
    if (!G.wasDocked && G.ship.docked) {
      var arrivedAt = G.sys.byId[G.ship.docked];
      if (arrivedAt) Combat.arriveAtPort(G, arrivedAt, HOOKS);
    }
    G.wasDocked = !!G.ship.docked;

    if (G.ship.docked) {
      G.dockStatus = null;
      G.trajectory = null;
      G.trajJob = null;
    } else if (G.dockTarget && !G.paused) {
      G.dockStatus = Sim.dockingStatus(G.ship, G.dockTarget, G.sys, G.t);
    }

    // Compass target: the last non-star body the ship was gravitationally
    // dominated by. Updated continuously while near a planet/moon/station,
    // but deliberately left alone once you coast out into interplanetary
    // space and the star's faint pull technically "wins" -- snapping the
    // needle to the star the instant you leave orbit would make the
    // compass useless for the one thing it is for: finding your way back
    // to wherever you just came from.
    var domNow = Sim.dominantBody(G.ship.pos, G.sys, G.t);
    if (domNow && domNow.kind !== 'star') G.lastMassiveBody = domNow;
    else if (!G.lastMassiveBody) G.lastMassiveBody = domNow;

    advancePrediction(dtReal);

    /* The node plan, on its own slower clock. It is the most expensive
     * thing in the frame when it runs — a full integration from now out to
     * the node — so it is throttled harder than the live prediction, and
     * any edit sets nodeStale to zero for an immediate redraw.
     *
     * A node that has arrived and was never flown is dropped rather than
     * left sitting in the past drawing a burn that can no longer happen. */
    if (G.node && G.node.t < G.t - 1 && !G.nodeBurn) {
      clearNode(true);
      say('Node time passed — plan dropped', 4);
    }
    refreshNodePlan(dtReal);

    /* Markets. Ports close to the ship step forward continuously; everything
     * else stays on its closed form and costs nothing. Economy.update is
     * what decides which is which, and it is safe to call every frame at
     * any warp — see the note on MAX_LIVE_STEP in economy.js. */
    if (Eco) Eco.update(G.sys, G.t, G.ship.pos, Sim.bodyPosition);

    /* Encounters. Everything stays on its rail until it is close enough to
     * matter; this is the call that lifts one off and steers it. It runs on
     * SIM seconds, not real ones, so an intercept from 3000 km out resolves
     * in seconds of your time while you are warping — and it hands back a
     * warp cap, because the moment something is genuinely alongside you is
     * the moment you need your own reaction time back. */
    /* Anything anyone has thrown out of an airlock falls on the same physics
     * as the ship that threw it, while it is close enough to matter. */
    Sim.updateCanisters(G.sys, G.ship.pos, G.t, G.lastDtSim || 0);

    /* Resolve the lock once a frame, here rather than as a side effect of
     * drawing the target page. A lock on a freighter that has since docked
     * has to release itself whether or not you happen to be looking at the
     * screen that would have noticed — which is exactly what went wrong the
     * moment the pages stopped all being drawn at once. */
    navTargetState();

    G.encounter = Sim.updateEncounters(G.sys, G.t, G.lastDtSim || 0, G.ship);

    /* A police scan resolves itself the instant it happens — there is no
     * player choice the way a pirate's demand has one, so it is handled
     * here rather than waiting on a key press. */
    if (G.encounter.scanNow) Combat.resolveScan(G, G.encounter.scanNow, HOOKS);

    if (G.encounter.warpCap < Infinity) {
      var maxIdx = 0;
      for (var wi = 0; wi < WARPS.length; wi++) if (WARPS[wi] <= G.encounter.warpCap) maxIdx = wi;
      if (G.warpIndex > maxIdx) {
        G.warpIndex = maxIdx;
        if (!G.encounterWarned) {
          G.encounterWarned = true;
          say(G.encounter.closest < 1000
            ? 'Ship alongside — time warp held at ' + WARPS[maxIdx] + '×'
            : 'Traffic closing — time warp limited', 4);
        }
      }
    }
    if (!G.encounter.active.length) G.encounterWarned = false;

    /* Combat: weapons, damage, distress calls and the reaping of the dead.
     * Runs after the encounter step so an NPC turned hostile this frame
     * steers on it next frame — one frame of lag nobody can perceive. */
    Combat.update(G.sys, G, G.t, G.lastDtSim || 0, HOOKS);

    /* Re-entry heating, on the live ship only — the predictor's ghosts run
     * the same integrator and must never bank heat of their own. */
    if (!G.paused && !G.ship.docked && G.lastDtSim > 0) {
      var cooked = Sim.updateHeating(G.ship, G.sys, G.t, G.lastDtSim);
      if (G.ship.heat > Sim.HEAT_LIMIT * 0.55 && !G.heatWarned) {
        G.heatWarned = true;
        say('HULL TEMPERATURE RISING — shallow out or slow down', 5);
        if (global.Sound) global.Sound.fx('warn');
      } else if (G.ship.heat < Sim.HEAT_LIMIT * 0.25) {
        G.heatWarned = false;
      }
      if (cooked > 0 && G.ship.hullHp <= 0) playerDestroyed();
    }

    /* Contracts age whether or not you are looking at them. */
    Missions.update(G, G.t, HOOKS);

    /* Scooping. Drift onto a canister slowly enough and it is yours — the
     * other half of jettison, and the whole point of robbing a freighter
     * of its cargo rather than its credits. */
    scoopCanisters();

    /* The dock is an event, not just a state: contracts settle, the ledger
     * hits the disk, and the clamps make their noise, exactly once. */
    if (G.ship.docked && !G.wasDocked) {
      var dockedPort = G.sys.byId[G.ship.docked];
      Missions.completeAtDock(G, dockedPort, G.sys, G.t, HOOKS);
      HOOKS.sound('dock');
      if (global.Save) global.Save.store(G);
    }
    G.wasDocked = !!G.ship.docked;

    /* The drive's noise follows the throttle. */
    if (global.Sound) {
      global.Sound.thrust((G.ship.docked || G.ship.landed) ? 0 : (G.ship.throttle || 0));
    }

    /* Nearest other ship, for the cockpit's contact readout. Range-limited:
     * a freighter four AU away is technically the nearest contact and
     * practically not worth a line of the HUD. */
    G.contact = Sim.nearestShip(G.sys, G.t, G.ship.pos, 0.35 * AU);

    if (G.ship.fuelOut && !G.fuelWarned) {
      G.fuelWarned = true;
      say('Reaction mass exhausted — no thrust. Docking refills it free.', 7);
    }
    if (G.ship.thrusterFuel > 0.01) G.fuelWarned = false;

    /* Camera follows its subject. Following the SHIP snaps instantly rather
     * than easing in: the ship already moves smoothly frame to frame, so
     * there is nothing to smooth, and a fixed easing rate applied to a body
     * doing several km/s leaves a lag of hundreds of metres — invisible
     * zoomed out to a whole system, but enough to lose the ship entirely
     * once you are close enough to see its hull (docking, formation flying).
     * Following a FOCUS BODY still eases in, because that case is exactly
     * the opposite: a human just pressed Tab and a smooth pan reads better
     * than a jump cut. */
    /* Follow the ship whenever there is nothing else to follow. Entering
     * the cockpit clears the focus body, so toggling tracking off after
     * that used to leave the camera chasing null — a crash that only
     * showed up once something actually pressed every key in order. */
    if (G.followShip || !G.focus) {
      G.cam.target = V.clone(G.ship.pos);
    } else {
      var want = Sim.bodyPosition(G.focus, G.sys, G.t);
      var k = Math.min(1, dtReal * 8);
      G.cam.target = {
        x: G.cam.target.x + (want.x - G.cam.target.x) * k,
        y: G.cam.target.y + (want.y - G.cam.target.y) * k,
        z: G.cam.target.z + (want.z - G.cam.target.z) * k
      };
    }

    if (G.followShip || !G.focus) clampCameraToEnclosure();
  }

  /* ---- the exterior camera stays in the room the ship is in -------------
   *
   * Pull the boom back from a ship berthed underground and it goes through
   * the wall — and what you get is not an outside view, it is the inside
   * of a planet: nothing to see, or one piece of geometry a metre from the
   * lens filling the screen. No amount of shading rescues that, because
   * the camera is genuinely somewhere there is nothing to look at.
   *
   * Two clamps, in order of how specific they are:
   *
   *   1. Berthed in a hangar, the boom cannot be longer than the hangar.
   *   2. Anywhere else, the eye cannot go below the ground the ship is
   *      flying over — which also stops the camera sinking into a world
   *      whenever you fly low, not just at ports.
   *
   * Arithmetic, not a swept collision test: the room is a drum of known
   * size around a known point and the ground is a sphere of known radius,
   * so both answers are one subtraction, and one rule that is always right
   * is worth more here than a general query nothing else would use. */
  /* The port whose shaft is worth cutting a hole in the ground for: the one
   * you are berthed in, or failing that the nearest surface port close
   * enough that its mouth is more than a couple of pixels across. Only ever
   * one — you can only be at one port, and two mouths on screen at once are
   * both far enough away that neither hole would be visible.
   *
   * SHAFT_MOUTH is the shaft's top radius in pad radii and has to match the
   * bay mesh in render.js; it is read from there rather than repeated, for
   * the same reason SHALLOW_DEPTH is shared with the generator — a hole cut
   * to a different size than the hole that was modelled is a rim of ground
   * hanging in mid air. */
  var SHAFT_CUT_RANGE = 400;    // km

  /* Rock, not sky. Dark enough to read as "no light gets here", warm
   * enough not to be mistaken for empty space. */
  var ROCK_CLEAR = [0.055, 0.048, 0.043];
  var ROCK_CLEAR_CSS = '#0e0c0b';

  /* The world the camera is inside, if it is inside one. Cheap: it is only
   * ever the body the ship is closest to, and being underground at all
   * means being at a port on that body. */
  function undergroundHost(cam) {
    if (!cam || !cam.eye || !G.ship || !G.sys) return null;
    var host = G.lastMassiveBody || Sim.dominantBody(G.ship.pos, G.sys, G.t);
    if (!host || !host.radius) return null;
    var hc = Sim.bodyPosition(host, G.sys, G.t);
    return V.dist(cam.eye, hc) < host.radius ? host : null;
  }

  function activeShaft() {
    if (!G.ship || !G.sys) return null;
    var port = berthedPort();
    if (!port) {
      var best = null, bestD = SHAFT_CUT_RANGE;
      var list = G.sys.pads || [];
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (!p.surface || !p.parentBody) continue;
        var d = V.dist(Sim.portEntrance(p, G.sys, G.t).pos, G.ship.pos);
        if (d < bestD) { bestD = d; best = p; }
      }
      port = best;
    }
    if (!port || !port.parentBody) return null;
    return {
      hostId: port.parentBody.id,
      mouth: Sim.portEntrance(port, G.sys, G.t).pos,
      /* A shade wider than the modelled mouth. The collar ring stands
       * around the hole and hides the seam; cutting exactly to the shaft
       * radius leaves a hairline of planet showing between the two. */
      radius: port.radius * 0.58
    };
  }

  var GROUND_CAM_LIFT = 1.02;   // keep the eye this far above the surface
  var HANGAR_MARGIN = 0.02;     // pad radii of clearance off every surface

  /* Shorten the boom until the eye is inside the hangar rather than inside
   * its walls. The room is a cylinder of known size around a known axis —
   * from the same table the mesh was built from — so this is three
   * one-dimensional limits and a minimum, not a collision query.
   *
   * The floor is the tight one: a berthed ship stands about a dozen metres
   * off it, so a camera swung underneath has almost nowhere to go and gets
   * pulled right in. That is correct. There genuinely is no room down
   * there, and a view from inside the concrete is not the alternative. */
  /* How far a ray starting at `p0` and travelling `d` per unit can go
   * before it leaves the slab |x| <= half. Infinity when it is travelling
   * along the slab and will never leave it. */
  function slabLimit(p0, d, half) {
    if (d > 1e-12) return (half - p0) / d;
    if (d < -1e-12) return (-half - p0) / d;
    return Infinity;
  }

  function clampCameraToHangar(port) {
    if (!Gen || !Gen.bayGeometry || !Sim.groundBasis) return;
    var basis = Sim.groundBasis(port, G.sys, G.t);
    if (!basis) return;
    var g = Gen.bayGeometry(port);
    var r = port.radius || 1;

    var cp = Math.cos(G.cam.pitch), sp = Math.sin(G.cam.pitch);
    var cyw = Math.cos(G.cam.yaw), syw = Math.sin(G.cam.yaw);
    var dir = { x: cp * cyw, y: cp * syw, z: sp };      // target -> eye

    // The ship's own place in the room, in pad radii off the mouth.
    var rel = V.sub(G.cam.target, basis.entrance.pos);
    var z0 = V.dot(rel, basis.up) / r - g.lift;
    var e0 = V.dot(rel, basis.east) / r, n0 = V.dot(rel, basis.north) / r;

    var dz = V.dot(dir, basis.up) / r;                  // per km of boom
    var de = V.dot(dir, basis.east) / r, dn = V.dot(dir, basis.north) / r;

    var limit = G.cam.dist;
    var floor = g.floorZ + HANGAR_MARGIN;
    var ceil = g.ceilZ - HANGAR_MARGIN;
    if (dz < -1e-12) limit = Math.min(limit, (z0 - floor) / -dz);
    else if (dz > 1e-12) limit = Math.min(limit, (ceil - z0) / dz);

    /* Sideways: the shed is a box, so the sideways limit is a slab test on
     * each of its two axes and the nearer of the two wins. */
    limit = Math.min(limit, slabLimit(e0, de, g.chamberX - HANGAR_MARGIN));
    limit = Math.min(limit, slabLimit(n0, dn, g.chamberY - HANGAR_MARGIN));

    if (limit < G.cam.dist) G.cam.dist = Math.max(MIN_CAM_DIST, limit);
  }

  function berthedPort() {
    if (!G.ship || !G.ship.docked || !G.sys) return null;
    var port = G.sys.byId[G.ship.docked];
    return (port && port.surface) ? port : null;
  }

  /* ---- INSIDE A PORT, and therefore nowhere else ------------------------
   * When the ship is berthed in a shed, the shed is the whole world. The
   * camera clamp already keeps the eye between its walls and `buried`
   * already takes the stars away — but that left the planets, the orbit
   * lines, the ecliptic grid, the traffic and the sun's glare all still
   * being drawn, so you looked past the end of the hangar and saw the solar
   * system. Half-enclosed reads worse than not enclosed at all: it makes
   * the walls look like a texture rather than a room.
   *
   * So this is the one predicate every world-drawing step asks, and when it
   * answers, only two things are drawn: the port itself, and what is inside
   * it with you.
   *
   * SURFACE PORTS ONLY, and that is not an oversight. Docking at an orbital
   * station is a clamp on the OUTSIDE of it — you are hanging off a ring in
   * open space and you should see the sky, because it is there. When the
   * orbital stations grow the interiors their design already describes —
   * bays you fly into, a hall you are carried to — they will want this too,
   * and the way in is to widen this function rather than to teach every
   * caller a second rule. */
  function enclosedPort() {
    return berthedPort();
  }

  function clampCameraToEnclosure() {
    if (G.viewMode === 'cockpit') return;   // the eye is the pilot's, not a boom
    var port = berthedPort();
    if (port) {
      clampCameraToHangar(port);
      return;
    }
    var host = G.lastMassiveBody ||
               (G.ship ? Sim.dominantBody(G.ship.pos, G.sys, G.t) : null);
    if (!host || !host.radius) return;
    var hc = Sim.bodyPosition(host, G.sys, G.t);
    var shipR = V.dist(G.ship.pos, hc);
    if (shipR < host.radius) return;        // already inside; case 1 owns that
    /* Where the eye would land at the current boom length. Rebuilt here
     * rather than read off cam.eye because cam.build has not run yet this
     * frame — reading the previous frame's eye makes the clamp lag by one
     * frame, which is visible as a flicker at the moment you touch down. */
    var cp = Math.cos(G.cam.pitch), sp = Math.sin(G.cam.pitch);
    var cy = Math.cos(G.cam.yaw), sy = Math.sin(G.cam.yaw);
    var dir = { x: cp * cy, y: cp * sy, z: sp };
    var eye = V.addScaled(G.cam.target, dir, G.cam.dist);
    var floor = host.radius * GROUND_CAM_LIFT;
    if (V.dist(eye, hc) >= floor) return;
    /* Solve for the boom length that puts the eye exactly on the floor
     * sphere: |target + dir*s - hc| = floor, a quadratic in s with one
     * positive root worth having. */
    var rel = V.sub(G.cam.target, hc);
    var b = V.dot(rel, dir);
    var c = V.dot(rel, rel) - floor * floor;
    var disc = b * b - c;
    if (disc <= 0) return;                  // the boom never clears; leave it
    var s = -b + Math.sqrt(disc);
    if (s > MIN_CAM_DIST && s < G.cam.dist) G.cam.dist = s;
  }

  /* Collect any canister the ship drifts onto gently. The thresholds are
   * deliberately tight — 80 metres and 20 m/s — because scooping is meant
   * to be a piece of flying, not a vacuum cleaner. */
  function scoopCanisters() {
    if (G.ship.docked || G.ship.landed) return;
    var cans = G.sys.canisters;
    if (!cans || !cans.length) return;
    for (var i = cans.length - 1; i >= 0; i--) {
      var c = cans[i];
      /* Most wreckage is wreckage. A shard only goes aboard if something on
       * it survived worth having — the rest is scrap you fly through, and
       * quietly hoovering it up would turn a debris field into a chore. */
      if (!c.cid || !(c.tonnes > 0)) continue;
      if (V.dist(c.pos, G.ship.pos) > 0.08) continue;
      if (V.dist(c.vel, G.ship.vel) > 0.02) continue;
      var free = G.ship.cargoCap - Sim.cargoMass(G.ship);
      if (free <= 0) { say('Hold full — canister left drifting', 3); return; }
      var take = Math.min(c.tonnes, free);
      /* Read the commodity BEFORE the shard is emptied — clearing `cid` is
       * how an emptied shard stops being scoopable, and reading it
       * afterwards named the haul `undefined`. */
      var cid = c.cid;
      G.ship.cargo[cid] = (G.ship.cargo[cid] || 0) + take;
      Sim.refreshShip(G.ship);
      c.tonnes -= take;
      /* An emptied shard is still a piece of a ship, so it keeps drifting
       * and keeps being drawn; an emptied crate was only ever its contents
       * and goes. Clearing the cid is what stops it being scooped twice. */
      if (c.tonnes <= 1e-9) {
        if (c.kind === 'debris') { c.cid = null; c.tonnes = 0; c.name = 'Wreckage'; }
        else cans.splice(i, 1);
      }
      var good = Eco.BY_ID[cid];
      say((c.kind === 'debris' ? 'Salvaged ' : 'Scooped ') +
          take.toFixed(take < 1 ? 2 : 0) + 't ' +
          (good ? good.name : cid), 4);
      HOOKS.sound('scoop');
    }
  }

  /* ---- drawing -------------------------------------------------------- */

  /* Is the GPU world layer actually running this frame? Checked rather than
   * assumed at every branch point, because the 2D path has to stay a
   * complete renderer in its own right — see boot(). */
  function glLive() {
    return !!(global.GLWorld && global.GLWorld.available);
  }

  var _starPos = null;      // this frame's star position, for GL lighting

  function draw() {
    var w = canvas.width / (window.devicePixelRatio || 1);
    var h = canvas.height / (window.devicePixelRatio || 1);
    var cam = G.cam;
    if (G.viewMode === 'cockpit') {
      cam.cockpitFov = cockpitFov();
      cam.buildCockpit(G.ship, w, h, G.look);
      applyCockpitSway(cam);
    }
    else cam.build(w, h);

    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    /* With the GL layer live the sky is ITS clear colour, and this canvas
     * has to be genuinely transparent or it would paint over the world it is
     * supposed to be an overlay on. Without GL, nothing has changed and the
     *2D layer still owns the background. */
    /* Are we inside a world? Underground the sky is not sky, it is the rock
     * the room was cut out of — so the background stops being black with
     * stars in it and becomes something you can believe is a wall. Without
     * this you look past the end of the hangar and see the galaxy. */
    var buried = undergroundHost(cam);
    /* Berthed in a shed: the shed is the world. See enclosedPort.
     *
     * EXCEPT IN THE ORBIT MAP, which is a chart rather than a window. F2 is
     * the player asking to see the system from outside itself; answering
     * with the inside of a hangar because that is where the hull happens to
     * be parked would be a blank screen and a bug report. The suppression
     * below is about what you can SEE from where you are, and a chart is
     * not a thing you see from anywhere. */
    var inside = mapMode() ? null : enclosedPort();

    /* Rock behind a shed as well as behind a burrow. `buried` is a
     * geometric test — is the eye below the planet's radius — and a camera
     * up at the mouth of a shallow bay can be berthed and still just above
     * it, which would have shown one frame of empty space through the roof
     * on the way in. */
    var rock = buried || inside;

    if (glLive()) {
      ctx.clearRect(0, 0, w, h);
      global.GLWorld.begin(rock ? ROCK_CLEAR : null);
      /* Cut the shaft mouth out of the world it is sunk into. Without this
       * the planet's own surface is drawn straight across the opening —
       * the sphere has no hole in it — so from outside you get a painted
       * circle where a hole should be, and from just inside the collar you
       * get ground where the sky should be. */
      var shaft = activeShaft();
      if (shaft) {
        global.GLWorld.setSurfaceHole(shaft.hostId, shaft.mouth, shaft.radius);
      }
    } else {
      ctx.fillStyle = rock ? ROCK_CLEAR_CSS : '#04060c';
      ctx.fillRect(0, 0, w, h);
    }

    /* In transit the tunnel IS the world — but you are still sitting in
     * your own cockpit looking out at it, which is the whole reason the
     * frame is real geometry rather than a picture. So the hyperspace
     * layer goes exactly where the starfield and the planets would, and
     * everything after it runs unchanged. */
    if (G.hyper) {
      Render.drawHyperspace(ctx, w, h, G.hyper);
      if (G.viewMode === 'cockpit') drawCockpitView(ctx, cam, w, h);
      else drawShip(ctx, cam);
      drawHUD(ctx, w, h);
      if (G.hyper.corridor && G.hyper.corridor.live && G.hyper.phase === 'tunnel') {
        drawCorridorHUD(ctx, w, h, G.hyper.corridor);
      }
      return;
    }

    /* A full-screen mode covers the world completely, so there is no point
     * drawing the world first. The one exception is the orbit map (F2),
     * which IS the world — the same view the game boots into — so it falls
     * through and draws everything. */
    if (!flying() && !mapMode()) {
      G.gridStep = 0;
      drawHUD(ctx, w, h);
      drawCursor(ctx);
      return;
    }

    /* The sky belongs to the world layer when there is one. Drawn in 2D it
     * would sit ON TOP of every planet — the overlay canvas has no way to be
     * behind anything — which put stars across the face of whatever world
     * you were looking at. */
    /* No stars underground. They are the one thing that cannot possibly be
     * true down there, and they are exactly what made a berthed ship look
     * like it was parked in orbit. */
    if (!buried && !inside) {
      if (glLive()) global.GLWorld.drawStars(cam);
      else Render.drawStarfield(ctx, cam, G.stars);
    }

    /* Cruise smears the sky over the top of the real one. The system stays
     * drawn underneath — you still need to see the planet you are aiming
     * at — which is the difference between this and hyperspace. */
    if (G.cruise) {
      Render.drawCruiseWarp(ctx, cam, G.stars, G.ship.fwd,
                            G.cruise.speed / Math.max(G.cruise.maxSpeed, 1), w, h);
    }

    var starPos = Sim.bodyPosition(G.sys.root, G.sys, G.t);
    var starScreen = cam.project(starPos);
    _starPos = starPos;

    /* None of the system's furniture belongs in a hangar. The grid is a
     * plane through the ecliptic, the orbit lines are hundreds of thousands
     * of kilometres across, and both would be drawn straight through the
     * wall you are parked against. */
    G.gridStep = 0;
    if (G.showGrid && !inside) {
      G.gridStep = Render.drawEclipticGrid(ctx, cam, cam.target, cam.dist * 1.15);
    }

    /* Orbit paths. A moon's path is drawn around wherever its planet is at
     * this instant, which is why the shape is cached in local space. Forced
     * on in the orbit map, whatever the O toggle says — a map of orbits
     * with the orbits hidden is a joke at the player's expense. */
    if ((G.showOrbits || mapMode()) && !inside) {
      for (var i = 0; i < G.sys.bodies.length; i++) {
        var b = G.sys.bodies[i];
        if (!b.orbit) continue;

        /* Only draw orbits at a scale the current view can actually show.
         * Zoomed in on a moon, the planet's 34-million-km orbit around the
         * star is a near-straight line whipping past the camera — visual
         * noise that reads as a rendering bug. Zoomed out to the whole
         * system, a 20,000 km station orbit is sub-pixel clutter. */
        var rel = b.orbit.a / cam.dist;
        if (rel > 26 || rel < 0.0025) continue;
        // Fade in and out at the edges of that window instead of popping.
        var fade = Math.min(1, Math.min(rel / 0.012, (26 - rel) / 12));

        var pts = G.orbitPaths[b.id];
        var off = Sim.bodyPosition(G.sys.byId[b.orbit.parent], G.sys, G.t);
        var col = b.kind === 'planet' ? '#4a6f9c'
                : b.kind === 'moon' ? '#6b7f8f' : '#7fd6c0';
        var alpha = (b.kind === 'planet' ? 0.55 : 0.4) * fade;
        if (G.focus === b || (b.parentBody && G.focus === b.parentBody)) alpha = 0.85 * fade;
        if (alpha < 0.03) continue;
        Render.strokePath(ctx, cam, pts, col, 1, alpha, null, off);
      }
    }

    /* Bodies, painted far to near so nearer ones overlap correctly. An
     * underground bay's TRUE position is buried inside its world — used
     * everywhere docking, distance and navigation care about — but for
     * this list, which only decides what gets drawn where and in front of
     * what, it stands in for its own entrance. Sorting and marker
     * placement by the true (negative-elevation) point would put the bay
     * nearer the camera than the planet's own near-side surface and paint
     * it floating in space in front of the world instead of hidden inside
     * it; the entrance is exactly the point that already sits correctly on
     * the visible surface, same as any open pad. */
    var items = [];
    for (var j = 0; j < G.sys.bodies.length; j++) {
      var body = G.sys.bodies[j];
      /* Inside a shed, the only body worth drawing is the shed. Everything
       * else — the world it is cut into most of all — would be painted
       * across the room you are standing in, because an impostor sphere has
       * no notion of being outside a wall.
       *
       * The port stays in the list rather than being drawn separately, so
       * it keeps its labels, its lamps, its doors and its dressing without
       * any of that machinery learning about this case. */
      if (inside && body !== inside) continue;
      var pos = body.underground
        ? Sim.portEntrance(body, G.sys, G.t).pos
        : Sim.bodyPosition(body, G.sys, G.t);
      var sp = cam.project(pos);
      if (!sp) continue;
      items.push({ body: body, pos: pos, sp: sp, rpx: body.radius * sp.scale });
    }
    items.sort(function (p, q) { return q.sp.depth - p.sp.depth; });

    G.labelQueue = [];
    for (var m = 0; m < items.length; m++) drawBody(ctx, cam, items[m], starScreen);
    placeLabels(ctx, G.labelQueue, w, h);

    /* Predicted trajectory — the whole point of the exercise. Not while
     * berthed: a ship on the clamps has no trajectory worth predicting, and
     * the path it last had is a line across the hangar wall. */
    if (G.showPrediction && G.trajectory && !inside) {
      // The prediction is stored relative to its reference body; anchor it to
      // wherever that body is right now.
      var tOff = Sim.bodyPosition(G.trajectory.reference, G.sys, G.t);
      Render.strokePath(ctx, cam, G.trajectory.points, '#63e6a8', 1.6, 0.9, null, tOff);
      if (G.trajectory.impact) {
        var ip = cam.project(V.add(tOff, G.trajectory.impact.rel));
        if (ip) {
          ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ip.x - 7, ip.y - 7); ctx.lineTo(ip.x + 7, ip.y + 7);
          ctx.moveTo(ip.x + 7, ip.y - 7); ctx.lineTo(ip.x - 7, ip.y + 7);
          ctx.stroke();
          ctx.fillStyle = '#ff8a8a';
          ctx.font = '11px ui-monospace, monospace';
          ctx.fillText('impact in ' + fmtTime(G.trajectory.impact.t - G.t), ip.x + 11, ip.y - 9);
        }
      }
    }

    drawNodeOverlay(ctx, cam);

    /* Wakes BEFORE the traffic, so a freighter climbing out toward its own
     * jump point is drawn in front of the cloud it is about to make rather
     * than behind it. They are also on the traffic toggle, because that is
     * exactly what they are — the timetable, seen after the fact. */
    /* Neither belongs in a hangar. A wake hangs outside the last planet in
     * the system, and the nearest freighter is thousands of kilometres up —
     * both would be drawn through the roof. */
    if (G.showTraffic && !inside) drawWakes(ctx, cam);

    if (G.showTraffic && !inside) drawTraffic(ctx, cam);

    /* Wreckage before the muzzle flashes, so a shard tumbling through a
     * beam is lit by it rather than drawn over it. Not on the traffic
     * toggle: Y hides the timetable, and what is left of a ship you shot is
     * not the timetable. */
    drawDebris(ctx, cam);

    /* Weapons fire, missiles and explosions render regardless of the
     * traffic toggle: Y hides the timetable, not the fight. */
    drawCombatFx(ctx, cam);

    if (G.viewMode === 'cockpit') drawCockpitView(ctx, cam, w, h);
    else drawShip(ctx, cam);
    drawHUD(ctx, w, h);
    drawBurnBanner(ctx, w, h);
    drawCursor(ctx);
  }

  /* The burn clock. Big, central, and only present while there is something
   * to count down to — the two moments a pilot cannot afford to be reading
   * a small number in a corner are the seconds before ignition and the
   * seconds before cutoff. */
  function drawBurnBanner(ctx, w, h) {
    if (!G.nodeBurn || !G.nodePlan) return;
    var nb = G.nodeBurn, plan = G.nodePlan;
    var burning = nb.phase === 'burn';
    var label = burning
      ? 'BURNING   ' + fmtSpeed(nb.remaining) + ' remaining'
      : 'IGNITION IN  ' + fmtTime(Math.max(0, plan.ignition - G.t));
    ctx.save();
    ctx.font = 'bold 15px ui-monospace, monospace';
    var tw = ctx.measureText(label).width;
    var x = (w - tw) / 2, y = 46;
    ctx.fillStyle = 'rgba(8,12,18,0.72)';
    ctx.fillRect(x - 14, y - 17, tw + 28, 25);
    ctx.strokeStyle = burning ? '#ffb347' : '#ffd27a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 14, y - 17, tw + 28, 25);
    ctx.fillStyle = burning ? '#ffb347' : '#ffd27a';
    ctx.fillText(label, x, y);

    // A plain progress bar under it: fraction of the delta-v delivered.
    if (burning && plan.magnitude > 0) {
      var frac = Math.max(0, Math.min(1, nb.spent / plan.magnitude));
      ctx.fillStyle = 'rgba(255,179,71,0.25)';
      ctx.fillRect(x - 14, y + 10, tw + 28, 4);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(x - 14, y + 10, (tw + 28) * frac, 4);
    }
    ctx.restore();
  }

  /* The cursor only exists while Left Alt is held, and it is drawn as a
   * reticle rather than an arrow so it reads as part of the instrument
   * rather than the operating system's pointer sitting on top of it. */
  function drawCursor(ctx) {
    if (!G.cursor.active) return;
    var x = G.cursor.x, y = G.cursor.y;
    var hot = !!G.cursor.over;
    ctx.save();
    ctx.strokeStyle = hot ? '#ffd27a' : 'rgba(190,215,240,0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, hot ? 9 : 6, 0, Math.PI * 2);
    ctx.moveTo(x - 13, y); ctx.lineTo(x - 7, y);
    ctx.moveTo(x + 7, y); ctx.lineTo(x + 13, y);
    ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 7);
    ctx.moveTo(x, y + 7); ctx.lineTo(x, y + 13);
    ctx.stroke();
    if (hot) {
      ctx.fillStyle = '#ffd27a';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('drag ' + G.cursor.over.short, x + 15, y - 8);
    }
    ctx.restore();
  }

  /* ---- the node on the map ----------------------------------------------
   * Three curves and a marker. The dim dashed one is the coast from here to
   * the node — the part of the plan you do nothing for. The amber one is
   * the orbit the burn buys, which is the whole reason the feature exists:
   * it is the answer to "what happens if I do this", shown before doing it.
   *
   * Both are drawn in the same reference-body frame the live prediction
   * uses, and anchored to wherever that body is NOW, or a plan around a
   * planet would be drawn two million km from the planet. */
  var NODE_COLOR = '#ffb347';
  var NODE_COAST = 'rgba(255,179,71,0.34)';

  function drawNodeOverlay(ctx, cam) {
    G.nodeHandles = null;
    var plan = G.nodePlan;
    if (!plan || !plan.path || !plan.path.length) return;

    var refNow = Sim.bodyPosition(plan.reference, G.sys, G.t);

    // The coast to the node.
    Render.strokePath(ctx, cam, plan.path, NODE_COAST, 1.3, 1, [5, 5], refNow);

    // The orbit the burn puts us on.
    if (G.nodeAfter && G.nodeAfter.points.length > 1) {
      var aRef = Sim.bodyPosition(G.nodeAfter.reference, G.sys, G.t);
      Render.strokePath(ctx, cam, G.nodeAfter.points, NODE_COLOR, 1.7, 0.95, null, aRef);
    }

    var nodeRel = plan.path[plan.path.length - 1];
    var nodeWorld = V.add(refNow, nodeRel);
    var sp = cam.project(nodeWorld);
    if (!sp || !isFinite(sp.x) || Math.abs(sp.x) > 1e5 || Math.abs(sp.y) > 1e5) return;

    /* Handle sensitivity is scaled to how fast you are actually going.
     * A fixed metres-per-pixel is unusable at both ends: it is far too
     * coarse for a docking trim and far too fine for a planetary
     * injection, and those are both things this same handle has to do. */
    var speed = V.len(plan.basis.vrel);
    var kmsPerPx = Math.max(2e-4, speed * 6e-4);
    var BASE_PX = 48;

    var handles = [];
    for (var i = 0; i < 3; i++) {
      var axis = NODE_AXES[i];
      var dir = axis.id === 'pro' ? plan.basis.prograde
              : axis.id === 'nor' ? plan.basis.normal
              : plan.basis.radial;
      // A unit step along this axis, in screen pixels, near the node.
      var probe = cam.project(V.addScaled(nodeWorld, dir, BASE_PX / sp.scale));
      if (!probe) continue;
      var sx = probe.x - sp.x, sy = probe.y - sp.y;
      var slen = Math.hypot(sx, sy);
      if (slen < 1e-6) continue;           // axis points at the camera
      var dirX = sx / slen, dirY = sy / slen;

      /* The handle is a slider, not a button: it sits BASE_PX out at zero
       * and slides along its axis as the value changes, so its position is
       * the readout. Push it back through the node and the value goes
       * negative — which is why there is no separate retrograde handle. */
      var offPx = BASE_PX + G.node.dv[axis.id] / kmsPerPx;
      var hx = sp.x + dirX * offPx, hy = sp.y + dirY * offPx;
      handles.push({
        axis: axis.id, axisIndex: i, sign: 1, color: axis.color,
        x: hx, y: hy, dirX: dirX, dirY: dirY, kmsPerPx: kmsPerPx,
        value: G.node.dv[axis.id], short: axis.short
      });

      // The axis line, drawn from the node out past the handle.
      ctx.save();
      ctx.strokeStyle = axis.color;
      ctx.globalAlpha = (G.nodeAxis === i) ? 0.85 : 0.4;
      ctx.lineWidth = (G.nodeAxis === i) ? 1.8 : 1.1;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.restore();
    }

    // The node itself: a ring with a cross, in the burn colour.
    ctx.save();
    ctx.strokeStyle = NODE_COLOR;
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sp.x - 11, sp.y); ctx.lineTo(sp.x - 4, sp.y);
    ctx.moveTo(sp.x + 4, sp.y); ctx.lineTo(sp.x + 11, sp.y);
    ctx.moveTo(sp.x, sp.y - 11); ctx.lineTo(sp.x, sp.y - 4);
    ctx.moveTo(sp.x, sp.y + 4); ctx.lineTo(sp.x, sp.y + 11);
    ctx.stroke();
    ctx.restore();

    // The handles, drawn after the node so they sit on top of it.
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    for (var j = 0; j < handles.length; j++) {
      var hd = handles[j];
      var hot = G.cursor.active &&
                (G.nodeDrag ? G.nodeDrag.axis === hd.axis
                            : (G.cursor.over && G.cursor.over.axis === hd.axis));
      ctx.fillStyle = hd.color;
      ctx.globalAlpha = hot ? 1 : 0.8;
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, hot ? 6 : 4.2, 0, Math.PI * 2);
      ctx.fill();
      if (hot || Math.abs(hd.value) > 1e-9) {
        ctx.globalAlpha = 1;
        ctx.fillText(hd.short + ' ' + fmtSpeed(hd.value), hd.x + 9, hd.y + 3.5);
      }
    }
    ctx.restore();

    /* Only offer the handles to the mouse while the cursor is actually out.
     * Otherwise a click meant to swing the camera past the node would grab
     * a handle instead, which is the exact confusion the Alt modifier
     * exists to prevent. */
    G.nodeHandles = G.cursor.active ? handles : null;

    // The label: delta-v, when, and how long the engine has to run for it.
    var lines = [
      fmtSpeed(plan.magnitude) + '  Δv',
      'T−' + fmtTime(Math.max(0, plan.eta)),
      'burn ' + fmtTime(plan.burn.duration)
    ];
    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = plan.burn.feasible ? NODE_COLOR : '#ff7a6a';
    for (var L = 0; L < lines.length; L++) {
      ctx.fillText(lines[L], sp.x + 14, sp.y - 12 + L * 13);
    }
    ctx.restore();
  }

  /* The pilot is strapped into a seat, not welded to the hull. Under thrust
   * their eye sits back a few centimetres, and the canopy frame — which IS
   * welded to the hull — shifts against the stars by a dozen pixels. It is
   * a tiny effect and it is the single cheapest thing that makes the
   * cockpit read as a physical place rather than a picture frame. It only
   * works because the frame is real 3D geometry projected from this eye
   * point; a 2D overlay could not do it at all. */
  function applyCockpitSway(cam) {
    var mag = V.len(G.ship.thrust);
    if (mag <= 0) return;
    var throttle = Math.min(1, mag / Math.max(G.ship.maxAccel, 1e-12));
    var now = performance.now() / 1000;
    var eye = V.addScaled(cam.eye, V.norm(G.ship.thrust), -3.0e-5 * throttle);
    var buzz = 5.0e-6 * throttle;
    eye = V.addScaled(eye, cam.r, Math.sin(now * 31.0) * buzz);
    eye = V.addScaled(eye, cam.u, Math.sin(now * 27.3) * buzz);
    cam.eye = eye;
  }

  /* Other people's ships. Same hull model as the player's, scaled to the
   * class flying the route, and the same scale rule every body in this
   * system follows: real geometry when it would actually resolve, a marker
   * below that. The blinking navigation lights are the only thing here that
   * is purely decorative, and they are worth it — a moving light is what
   * makes a distant speck read as a vessel rather than a star. */
  /* ---- wakes -------------------------------------------------------------
   * The red and blue clouds hanging in the outer system where ships have
   * gone into slipspace and come out of it.
   *
   * There is no scan KEY. Your scanner is always running; the verb is
   * flying closer, and the read gets better as you do. That is not a
   * shortcut around a binding — it is the better mechanic, because it turns
   * "read the wake" into a piece of flying rather than a keypress, and it
   * makes the fidelity falloff something the player feels rather than
   * something a menu tells them about.
   *
   * The wake list is a pure function of t, so it is recomputed rather than
   * stored — but memoised on the frame's own timestamp, because draw() is
   * not the only thing that wants it and walking the lane timetable several
   * times a frame would be silly. */
  function wakesNow() {
    if (!Slip || !G.galaxy || !G.here || !G.sys || G.sys.interstellar) return [];
    if (G._wakes && G._wakes.t === G.t) return G._wakes.list;
    var list = [];
    try {
      list = Slip.wakesAt(G.galaxy, G.here, G.t);
    } catch (e) { list = []; }
    G._wakes = { t: G.t, list: list };
    return list;
  }

  /* The best read available on anything in range right now, or null. Used by
   * the HUD as well as the world layer, which is why it is separate. */
  function bestWakeRead() {
    var list = wakesNow();
    if (!list.length) return null;
    var sunPos = Sim.bodyPosition(G.sys.root, G.sys, G.t);
    var radius = Slip.jumpRingRadius(G.sys);
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var pos = Slip.wakePosition(list[i], sunPos, radius);
      var d = V.dist(pos, G.ship.pos);
      var f = Slip.scanFidelity(list[i], d);
      if (f > 0 && (!best || f > best.read.fidelity)) {
        best = { wake: list[i], pos: pos, range: d, read: Slip.scanWake(list[i], d) };
      }
    }
    return best;
  }

  function drawWakes(ctx, cam) {
    var list = wakesNow();
    if (!list.length) return;
    var sunPos = Sim.bodyPosition(G.sys.root, G.sys, G.t);
    var radius = Slip.jumpRingRadius(G.sys);
    /* Size comes off the WAKE, and it is a function of the tonnage that tore
     * it (Slip.wakeRadius) — a bulk hauler leaves a hole five times the one
     * a packet leaves, so which mark is worth flying to is legible from
     * across the system before you have scanned anything.
     *
     * It is a real physical size, not a fraction of the system. Scaling it
     * to the jump ring was the first attempt and was wrong twice over: a
     * wake at two percent of a ring is five and a half MILLION kilometres
     * across — thirty times the scan range, so you would be reading a cloud
     * you were nowhere near the edge of — and in a big system it rendered as
     * a screen-filling wash of orange that washed the whole game out. */
    var now = performance.now() / 1000;

    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      var pos = Slip.wakePosition(w, sunPos, radius);
      var p = Render.drawWake(ctx, cam, pos, w, w.radius || 30000, now);
      if (!p) continue;

      /* Label it only once it is worth reading. A sky full of permanently
       * captioned smudges would be noise; a caption appearing as you close
       * on one is the instrument doing its job in front of you. */
      var d = V.dist(pos, G.ship.pos);
      var read = Slip.scanWake(w, d);
      if (!read.inRange) continue;

      /* On its own dark backing, and offset clear of the cloud.
       *
       * Without the backing this collided with the body labels — a wake sits
       * out among the planets, and "DEPARTURE WAKE / Perdor · 72.9 min ago"
       * landing on top of "Mirven" made both unreadable. The label dropper
       * that handles colliding BODY labels does not know about this text, so
       * the caption has to be able to survive being drawn over anything.
       *
       * Offset down-right of the cloud rather than centred on it, so the
       * arcs stay visible next to the words describing them. */
      ctx.save();
      ctx.font = '10px ui-monospace, monospace';
      var head = (w.kind === 'departure' ? 'DEPARTURE WAKE' : 'ARRIVAL WAKE');
      var body = wakeReadLine(read, w);
      var lx = p.x + 16, ly = p.y + 14;
      var bw = Math.max(ctx.measureText(head).width, ctx.measureText(body).width);
      ctx.fillStyle = 'rgba(4,7,13,0.78)';
      ctx.fillRect(lx - 5, ly - 12, bw + 10, 28);
      ctx.fillStyle = w.kind === 'departure' ? '#ff9a86' : '#8fc4ff';
      ctx.fillText(head, lx, ly);
      ctx.fillStyle = 'rgba(170,198,235,0.9)';
      ctx.fillText(body, lx, ly + 12);
      ctx.restore();
    }
  }

  /* ---- following a wake --------------------------------------------------
   * The verb the whole scanning mechanic exists to serve. Reading a wake
   * tells you where somebody went; this is what turns that into going after
   * them, and it answers the only question that matters before you spend the
   * fuel — can you actually beat them there?
   *
   * The answer degrades with the scan, on purpose. A full read knows their
   * tonnage and can give you a real intercept point. A partial read knows
   * only the hull class, so it estimates from a typical ship of that class
   * and says that it is estimating. A faint read cannot say at all. That is
   * what makes closing on a fresh wake worth the flying: not better prose,
   * but the difference between a decision and a gamble.
   *
   * Shift+J, because J is the chart and this lays a course in on it. Every
   * unshifted letter on the keyboard was already spoken for. */
  function followWake() {
    if (!Slip || !G.galaxy) return;
    var best = bestWakeRead();
    if (!best) { say('No slipspace wake within scanner range', 3); return; }

    var read = best.read, wake = best.wake;
    if (!read.destination) {
      say('That trail is too thin to name a star — get closer, or find a fresher one', 4);
      return;
    }

    /* Lay the course in the same way the chart does, so JUMP (F8) picks it
     * up unchanged. Selecting by INDEX into the live candidate list rather
     * than stashing a star object, because that list is rebuilt constantly
     * and a held reference would go stale exactly the way nav locks used
     * to. */
    var list = jumpCandidates();
    var sel = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].to.id === read.destination.id) { sel = i; break; }
    }
    if (sel < 0) {
      say('Their destination is not on the chart from here', 4);
      return;
    }
    G.starMap = { sel: sel, list: list };
    var plan = list[sel];

    /* Can we catch them? Their tonnage first-hand if the scan got it, from
     * the hull class if it only got that far, and otherwise not at all. */
    var tonnes = read.tonnes ||
                 (read.hullClass ? Slip.classTypicalTonnes(read.hullClass) : 0);
    var estimated = !read.tonnes && !!read.hullClass;

    var who = read.name || (read.className ? 'a ' + read.className : 'somebody');
    var head = 'Course laid for ' + read.destinationName + ' — following ' + who;

    if (!plan.possible) {
      say(head + '. Not enough propellant for the jump: needs ' +
          plan.fuel.toFixed(1) + ' t', 7);
      G.wakeChase = null;
      return;
    }
    if (!tonnes) {
      say(head + '. Too faint to judge her speed — you are jumping blind', 7);
      G.wakeChase = { starId: read.destination.id, name: who, blind: true };
      return;
    }

    var chase = Slip.pursuit(plan.distance, tonnes, read.departedAt,
                             Slip.allUpMass(G.ship), G.t, 1);
    G.wakeChase = {
      starId: read.destination.id,
      starName: read.destinationName,
      name: who,
      blind: false,
      estimated: estimated,
      at: chase.at,
      possible: chase.possible,
      remaining: chase.remainingSeconds
    };

    if (!chase.possible) {
      say(head + '. ' + (estimated ? 'On a class estimate, she' : 'She') +
          ' lands before you could draw level — you would arrive behind her', 8);
    } else {
      say(head + '. Intercept at ' + (chase.at * 100).toFixed(0) +
          '% of the corridor, ' + fmtTime(chase.remaining) +
          ' of corridor left to hold her' +
          (estimated ? '  (estimated from hull class)' : ''), 9);
    }
  }

  /* One line describing what the scan actually resolved. Deliberately says
   * what it CANNOT see as well as what it can — an instrument that silently
   * omits the tonnage it failed to read is one the player will assume is
   * broken the first time they need that number. */
  function wakeReadLine(read, wake) {
    if (!read.destination) return 'bearing only · too faint to name a star';
    var bits = [read.destinationName];
    if (read.timeKnown) {
      var age = Math.max(0, wake.age);
      bits.push(fmtTime(age) + ' ago');
    } else {
      bits.push('time unresolved');
    }
    if (read.className) bits.push(read.className);
    if (read.tonnes) bits.push(Math.round(read.tonnes) + ' t' + (read.anchored ? ' · anchored' : ''));
    else if (read.className) bits.push('tonnage uncertain');
    if (wake.baffled) bits.push('baffled');
    return bits.join('  ·  ');
  }

  function drawTraffic(ctx, cam) {
    var list = Sim.shipsAll(G.sys, G.t);
    if (!list.length) return;
    var sunPos = Sim.bodyPosition(G.sys.root, G.sys, G.t);
    var blink = (performance.now() / 1000) % 2;

    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var sp = cam.project(s.pos);
      if (!sp) continue;
      if (sp.x < -60 || sp.x > cam.w + 60 || sp.y < -60 || sp.y > cam.h + 60) continue;

      /* The drive first, so the hull sits in front of its own glare rather
       * than behind it. Also the reason a ship stays visible long after the
       * hull has shrunk to nothing: a plume is a streak, not a dot. */
      // Offset each drive's flicker by its index so a formation of ships
      // does not pulse in unison like a string of fairy lights.
      Render.drawShipExhaust(ctx, cam, s, s.size,
                             s.throttle === undefined ? 1 : s.throttle,
                             s.cls, null, performance.now() / 1000 + i * 0.37);

      var lenPx = s.size * sp.scale;
      if (lenPx > 4) {
        var sunDir = V.norm(V.sub(sunPos, s.pos));
        Render.drawHullModel(ctx, cam, s, s.size, sunDir, s.color, s.cls);
        // Port red, starboard green, in the ship's own frame — so which way
        // it is facing is readable without a label.
        if (lenPx > 14 && blink < 1) {
          var pl = cam.project(Render.localToWorld(s, -s.size * 0.55, 0, -s.size * 0.35));
          var pr2 = cam.project(Render.localToWorld(s, s.size * 0.55, 0, -s.size * 0.35));
          ctx.save();
          if (pl) { ctx.fillStyle = '#ff6b6b'; ctx.fillRect(pl.x - 1, pl.y - 1, 2.4, 2.4); }
          if (pr2) { ctx.fillStyle = '#7dffb0'; ctx.fillRect(pr2.x - 1, pr2.y - 1, 2.4, 2.4); }
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1;
        var d = 3;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - d); ctx.lineTo(sp.x + d, sp.y);
        ctx.lineTo(sp.x, sp.y + d); ctx.lineTo(sp.x - d, sp.y);
        ctx.closePath(); ctx.stroke();
        if (blink < 0.9) {
          ctx.fillStyle = s.phase === 'moored' ? '#ffd479' : s.color;
          ctx.fillRect(sp.x - 0.8, sp.y - 0.8, 1.8, 1.8);
        }
        ctx.restore();
      }

      /* The field goes on AFTER the hull, because it is in front of it — it
       * stands a metre or so off the plating, and drawing it first would put
       * the ship on top of its own shield. Outside the size branch, though:
       * a ship too small for a model still has a shield worth seeing flare,
       * and drawShipShield picks the cheap path for itself. */
      drawShipShield(ctx, cam, s, lenPx);

      /* Blooms likewise: at that distance the flash is the only thing
       * telling you the shot landed at all. */
      drawHullBlooms(ctx, cam, s);

      /* A hostile gets a hard bracket regardless of how small it is. Losing
       * track of the pirate because it was two pixels wide is not the kind
       * of difficulty this game is after. */
      if (s.hostile && s.spec && s.spec.live) {
        ctx.save();
        ctx.strokeStyle = '#ff6b5a';
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 180);
        var b = Math.max(9, lenPx * 0.9);
        ctx.strokeRect(sp.x - b, sp.y - b, b * 2, b * 2);
        ctx.restore();
      }

      // Name only when it is genuinely nearby; otherwise the sky fills with
      // labels for ships you cannot see.
      if (lenPx > 2.2 || (s.spec && s.spec.live)) {
        ctx.save();
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = s.hostile ? 'rgba(255,150,130,0.9)' : 'rgba(190,215,240,0.75)';
        var tag = s.name;
        if (s.kind !== 'trade') tag += '  [' + s.className + ']';
        ctx.fillText(tag, sp.x + 9, sp.y + 3);
        ctx.restore();
      }
    }
  }

  /* ---- shields, and what a hit does to one ------------------------------
   * HOW LONG A FIELD STAYS VISIBLE, and this is the answer to "faint only
   * when charged and recently hit". A shell drawn all the time around every
   * armed ship in the sky would cost the silhouette, which the mesh design
   * says is the only information that survives at combat distances, and it
   * would also tell you who has shields before you have earned the right to
   * know. A shell drawn ONLY during the half-second flash would deny you the
   * readout exactly when you need it, which is while somebody is shooting at
   * you. So it lights on the first hit and stays lit through the fight,
   * fading out a few seconds after the last one.
   *
   * Six seconds is not arbitrary: it is `MODULES.shield.regenDelay`, the
   * quiet period a shield needs before it starts refilling. So the field is
   * visible for exactly as long as it is still *under fire* by the shield's
   * own definition, and it goes dark at the moment it starts recovering.
   * One number, two meanings, no second thing to tune. */
  var SHIELD_LINGER = 6;
  var SHIELD_FADE = 1.6;          // s of that spent fading out

  /* 0 when the field should not be drawn at all, up to 1 just after a hit. */
  function shieldLit(spec, tSim) {
    if (!spec || !(spec.shieldMax > 0) || !(spec.shieldHp > 0)) return 0;
    var since = tSim - (spec.lastHitAt || -1e9);
    if (!(since >= 0) || since > SHIELD_LINGER) return 0;
    var left = SHIELD_LINGER - since;
    return left >= SHIELD_FADE ? 1 : left / SHIELD_FADE;
  }

  /* IMPACT STAMPS ARE REAL SECONDS, not sim seconds — see the note on
   * Combat.markImpact. A flash is for the player's eyes, so it runs on the
   * player's clock, exactly as the beam fade already does, and handing one of
   * these a sim time would make every flare vanish inside a frame under warp.
   *
   * The clock is `nowSeconds()` from the top of this file, whose own comment
   * is this rule written down: "anything that blinks, flashes or pulses
   * because it is a physical light... should be driven from here, so that
   * time warp and pausing leave it alone." A second helper beside it would
   * have been one more thing to pick the wrong one of. */
  function liveImpacts(spec, nowS) {
    var out = [], list = spec && spec.impacts;
    if (!list) return out;
    for (var i = 0; i < list.length; i++) {
      if (nowS - list[i].at <= Render.SHIELD_FLASH_LIFE) out.push(list[i]);
    }
    return out;
  }

  /* Below this the shell is not worth walking. A form-fitting field on a
   * twelve-pixel ship is a twelve-pixel blob whichever way you compute it,
   * and the shell pass costs three transforms and three projections PER FACE
   * — the one part of this feature with a real per-frame price, since an
   * imported hull carries far more triangles than the procedural ones do.
   * So there are two paths and the small one is a single gradient, which at
   * that size is indistinguishable and costs one fill. */
  var SHELL_MIN_PX = 16;

  function drawShipShield(ctx, cam, s, lenPx) {
    var spec = s.spec || s;
    /* Two clocks, deliberately: the LINGER is a game-time quantity, because
     * it is the shield's own regeneration delay, so it reads G.t. The FLARES
     * are lights, so they read the wall clock. */
    var lit = shieldLit(spec, G.t);
    if (!(lit > 0)) return;
    var nowS = nowSeconds();
    var charge = spec.shieldHp / spec.shieldMax;
    var live = liveImpacts(spec, nowS);
    if (lenPx >= SHELL_MIN_PX) {
      Render.drawShellField(ctx, cam, s, s.size, s.cls, charge, lit, live, nowS);
    } else {
      farShieldGlow(ctx, cam, s, charge, lit, live, lenPx, nowS);
    }
  }

  /* The distant form of a field: a soft disc the size of the ship's own
   * shell, brightening when it is struck. It carries the same hue, so the
   * "that one's shield is nearly down" read survives all the way out to the
   * range where the ship itself is a marker dot. */
  function farShieldGlow(ctx, cam, s, charge, lit, impacts, lenPx, nowS) {
    var p = cam.project(s.pos);
    if (!p) return;
    var flare = 0;
    for (var i = 0; i < impacts.length; i++) {
      flare = Math.max(flare, Render.shellFlare(1, nowS - impacts[i].at));
    }
    var a = lit * (0.10 + 0.55 * flare);
    if (!(a > 0.005)) return;
    var col = Render.shieldTint(charge);
    var n = parseInt(col.slice(1), 16);
    var cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255;
    var R = Math.max(4, lenPx * 0.85 * (1 + Render.SHIELD_STANDOFF * 2));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
    g.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a.toFixed(3) + ')');
    g.addColorStop(0.6, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (a * 0.45).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, K.TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---- your own shield, from the seat ------------------------------------
   * THE PROBLEM THIS SOLVES. Everything above draws a shell around a HULL,
   * and from the cockpit you cannot see your own hull — so the entire
   * feature would have been invisible during ordinary play, visible only if
   * you happened to be flying in the exterior view when somebody shot you.
   * A soaked hit had no expression in here at all: hullHit already flares
   * the cabin and can take a console screen out, but that only fires when
   * damage reaches the plating. A shield doing its job was silent.
   *
   * So the flare comes to you. The field wraps the canopy a metre out, and a
   * hit anywhere on it lights a wide soft patch of your view in the
   * direction it came from — which makes it a WARNING as well as an effect,
   * because the direction is where the shooter is.
   *
   * BEARING, NOT POSITION. cam.projectDir is the projection for things at
   * effective infinity, and it is the right one here: the flare's screen
   * place is a direction, not a point. Projecting an actual point on the
   * shell would put it 1.2 m from the eye, where the perspective divide
   * blows it up across the whole screen — the same trap the beam muzzles
   * fell into.
   *
   * AND WHEN IT CAME FROM BEHIND, which projectDir cannot answer, the flare
   * is pinned to the edge of the view on the correct side. That is the case
   * that matters most: being shot from an angle you are not looking at is
   * exactly when you need to be told where to look. */
  function drawCanopyShieldFlare(ctx, cam, w, h) {
    var s = G.ship;
    var cap = s.shield ? Combat.MODULES.shield.cap : 0;
    if (!(cap > 0)) return;
    var list = s.impacts;
    if (!list || !list.length) return;

    var col = Render.shieldTint(Math.max(0, s.shieldHp) / cap);
    var n = parseInt(col.slice(1), 16);
    var cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255;
    var R = Math.min(w, h) * 0.30;
    var nowS = nowSeconds();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var im = list[i];
      if (!im.soaked) continue;               // the plating's business, not the field's
      var age = nowS - im.at;
      var amp = Render.shellFlare(1, age);    // 1 = dead centre of the flare
      if (!(amp > 0.004)) continue;

      var dir = im.dir;
      var x, y;
      var p = dir ? cam.projectDir(dir) : null;
      if (p) {
        x = p.x; y = p.y;
      } else {
        /* Behind, or nowhere in particular. Put it at the edge on the side
         * it came from, using the bearing's own components in the camera's
         * axes — and dead astern, which has no side, goes to the bottom,
         * because that is where you would flinch. */
        var sx = dir ? V.dot(dir, cam.r) : 0;
        var sy = dir ? V.dot(dir, cam.u) : -1;
        var m = Math.hypot(sx, sy);
        if (!(m > 1e-6)) { sx = 0; sy = -1; m = 1; }
        x = w / 2 + (sx / m) * w * 0.46;
        y = h / 2 - (sy / m) * h * 0.46;
      }

      var a = Math.min(0.62, amp * 0.62);
      var g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a.toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(' + cr + ',' + cg + ',' + cb + ',' +
                     (a * 0.35).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, K.TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---- and what an unshielded hit looks like ----------------------------
   * A bloom on the plating, and it is deliberately a different SHAPE from
   * the shield flare rather than a different colour. The shield's flare
   * spreads across a surface; this is a hot sphere sitting on one, because
   * that is what a few megawatts arriving on a metre of hull actually makes.
   *
   * So which effect you are looking at tells you whether the shield is still
   * holding, from any distance and without reading a number — which is the
   * whole point of having two of them. A shot that punches through a failing
   * shield produces both at once, and that is exactly what that moment is.
   *
   * Drawn in screen space as a radial gradient rather than as geometry: it
   * is a glow, it has no surface, and the same argument the beams and the
   * plumes already make applies. */
  var BLOOM_LIFE = 0.45;

  function drawHullBlooms(ctx, cam, s) {
    var spec = s.spec || s;
    var list = spec && spec.impacts;
    if (!list || !list.length) return;
    var nowS = nowSeconds();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var im = list[i];
      if (!im.through) continue;                  // the shield held; nothing here
      var age = nowS - im.at;
      if (!(age >= 0) || age > BLOOM_LIFE) continue;
      var u = age / BLOOM_LIFE;

      /* On the hull, on the side it came from. Half the ship's own length
       * out from the centre puts it on the plating rather than inside. */
      var at = s.pos;
      if (im.dir) at = V.addScaled(s.pos, im.dir, s.size * 0.42);
      var p = cam.project(at);
      if (!p) continue;

      /* Grows a little and fades a lot — an expanding shell of hot vapour
       * coming off the plating, which is what the damage actually is. */
      var rPx = Math.max(2.2, s.size * 0.35 * p.scale) * (0.45 + 1.15 * u);
      var a = (1 - u) * (1 - u) * Math.min(1, 0.35 + im.hull / 30);
      if (!(a > 0.004)) continue;

      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rPx);
      g.addColorStop(0, 'rgba(255,246,226,' + (a * 0.95).toFixed(3) + ')');
      g.addColorStop(0.35, 'rgba(255,190,120,' + (a * 0.6).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,110,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rPx, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---- wreckage, drawn ---------------------------------------------------
   * Shards tumble, so each one needs an attitude every frame. It is built
   * here rather than stored on the shard, for two reasons: an orthonormal
   * basis is three vectors of state per fragment and there can be ninety-six
   * of them, and a rotation is cheaper to evaluate than to keep correct —
   * anything that STORES a basis has to re-orthonormalise it or it shears,
   * which is a bug this project has already had once on the player's hull.
   *
   * So the spin is an axis, a rate and a phase, and the frame is a function
   * of the clock. It is exact at any t, which is the same property the rails
   * and the market both have and for the same reason.
   *
   * Rodrigues, written out. Two rotations of one fixed pair of axes about
   * the shard's own spin axis — no matrices, no allocations beyond the frame
   * itself, and it runs inside the per-frame budget the predictor has
   * already spent most of. */
  var shardFrame = { pos: null, right: null, up: null, fwd: null };

  function spinFrame(c, tSec) {
    var ang = c.phase + c.spinRate * tSec;
    var k = c.spinAxis, ca = Math.cos(ang), sa = Math.sin(ang);
    /* A seed axis that is never parallel to the spin axis, so the cross
     * product below cannot collapse. */
    var seed = Math.abs(k.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    var a = V.norm(V.cross(k, seed));
    var b = V.cross(k, a);                       // already unit: k ⟂ a, both unit
    shardFrame.pos = c.pos;
    shardFrame.fwd = { x: a.x * ca + b.x * sa, y: a.y * ca + b.y * sa,
                       z: a.z * ca + b.z * sa };
    shardFrame.up = k;
    shardFrame.right = V.cross(shardFrame.up, shardFrame.fwd);
    return shardFrame;
  }

  function drawDebris(ctx, cam) {
    var list = G.sys.canisters;
    if (!list || !list.length) return;
    var sunPos = Sim.bodyPosition(G.sys.root, G.sys, G.t);
    var tSec = performance.now() / 1000;

    ctx.save();
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.kind !== 'debris') continue;
      var sp = cam.project(c.pos);
      if (!sp) continue;
      if (sp.x < -40 || sp.x > cam.w + 40 || sp.y < -40 || sp.y > cam.h + 40) continue;

      /* Fading out over the last quarter of its life, so a field thins
       * rather than blinking out a piece at a time. */
      var left = (c.expires - G.t) / Sim.DEBRIS_LIFE;
      var fade = left > 0.25 ? 1 : Math.max(0, left / 0.25);
      if (fade <= 0) continue;

      var lenPx = c.lengthKm * sp.scale;
      if (lenPx > 3) {
        ctx.globalAlpha = fade;
        Render.drawShardModel(ctx, cam, spinFrame(c, tSec), c.lengthKm,
                              V.norm(V.sub(sunPos, c.pos)),
                              c.cid ? '#c8b487' : '#8d949e', c.shard);
        ctx.globalAlpha = 1;
      } else {
        /* Too small for a model and too important to drop: a debris field
         * you cannot see is a debris field you fly into. Salvage keeps its
         * warmer colour all the way down, because at this size the colour is
         * the only thing telling you which piece to go to. */
        ctx.globalAlpha = fade * (c.cid ? 0.95 : 0.55);
        ctx.fillStyle = c.cid ? '#ffd36b' : '#7c848f';
        var d = c.cid ? 1.9 : 1.2;
        ctx.fillRect(sp.x - d / 2, sp.y - d / 2, d, d);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /* ---- weapons fire, drawn ---------------------------------------------
   * Beams are two projected points and a bright line — a laser has no
   * transit time worth animating at these ranges. Missiles are a dot and a
   * plume. Explosions are an expanding pair of rings that live under a
   * second, and what is left once they fade is the debris field drawDebris
   * paints above — which is what those rings were standing in for. */
  /* Shortest a beam is ever drawn, in pixels. Small enough that it never
   * reads as a bar across a close-quarters fight, big enough to catch the
   * eye at a zoom where the whole ship is two pixels. */
  var MIN_BEAM_PX = 14;

  /* How long a tracer takes to cross the weapon's whole envelope, in real
   * seconds. Nothing in the simulation reads this: the shot has already hit
   * or missed by the time the first pixel is drawn. It is slow purely so
   * that firing LOOKS like firing — at true beam speed the whole event
   * occupies less than one frame and the gun reads as broken, which is how
   * this arrived as a bug report in the first place.
   *
   * It was 0.30 s while a bolt was a short slug, because a slug is only
   * visible where it happens to be and had to dawdle to be seen at all.
   * Render.boltSpan made the bolt a STREAK that elongates as it travels, and
   * a streak says "a shot happened" along its whole length — so the head can
   * cross faster without the event disappearing between frames, which is the
   * other half of the "too chunky and too slow" report. */
  var TRACER_CROSS = 0.20;

  /* Hairline core, wide faint halo — the same fix the wake lightning needed
   * and for the same reason. The old 7 px core was doing the glow AND the
   * shape with one stroke, which is what read as chunky: a bright bar has no
   * centre for the eye to find. Splitting them lets the core get thin enough
   * to look hot while the halo carries the light. Under 'lighter' the two
   * passes add, so the middle of the streak still burns out to white. */
  var TRACER_HALO_W = 3.6;    // halo width, as a multiple of the core
  var TRACER_HALO_A = 0.20;   // halo alpha, as a fraction of the core's

  /* ---- and the bolt is an OBJECT, not a decal ----------------------------
   * Reported twice, and the second report was the real one: the perspective
   * was wrong. Two separate faults, both from drawing the tracer in screen
   * space between two projected endpoints.
   *
   * 1. THE WIDTH WAS A PIXEL RAMP. It ran 2.4 px at the muzzle to 0.55 at the
   *    far end, and the constant was frankly labelled "perspective, faked
   *    cheaply". So every shot narrowed by the same 4.4x whatever its
   *    geometry — a bolt fired down the boresight at something 20 km ahead
   *    and a bolt crossing the canopy broadside tapered identically. Broadside
   *    both ends are the same distance away and the thing should be a uniform
   *    ribbon; down the boresight the far end should be far thinner than 4.4x.
   *
   * 2. THE TRAVEL WAS INTERPOLATED ON THE SCREEN. `a.x + dx * head` walks the
   *    head at a constant rate in PIXELS, and a point moving at constant speed
   *    down a receding ray does not do that — it should appear to slow sharply
   *    as it goes away from you. Sliding at uniform screen speed is exactly
   *    what makes a thing read as painted on the glass rather than flying
   *    through the world, and it is what survived the first fix.
   *
   * Both die the same way: interpolate in WORLD space and project each
   * sample, so the foreshortening and the width both fall out of the camera
   * instead of being guessed at. A straight world segment still projects to a
   * straight screen segment — perspective maps lines to lines — so the streak
   * needs no bending; what it needs is its WIDTH sampled along its length,
   * because that varies hyperbolically with depth.
   *
   * The sampling itself lives in `Render.boltRibbon`, with the rest of the
   * drawing maths and for the same reason `boltSpan` does: it can be held to
   * the camera there without a canvas, and "broadside is a constant-width
   * ribbon, receding is not" is a claim a test can actually make.
   *
   * Kept here: the two widths for the tiny-on-screen fallback below, where
   * there is no perspective left to get right and the whole event is a few
   * pixels of tick mark. */
  var TRACER_NEAR_W = 2.4;
  var TRACER_FAR_W = 0.55;

  /* A tapered, fading quad between two screen points. Canvas cannot vary a
   * stroke's width along its length, so this is a filled polygon with a
   * gradient — exactly the trick drawExhaust already uses on the torch
   * plumes, and for the same reason: a tapered quad reads far better than
   * any number of triangles, and a plume and a tracer are the same problem.
   *
   * Wide and bright at the muzzle, thin and faint at the far end, which is
   * what gives the shot its direction without needing an arrowhead. */
  function taperedTracer(ctx, ax, ay, bx, by, w0, w1, color, a0, a1) {
    var dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    if (!(L > 0.5)) return;
    var nx = -dy / L, ny = dx / L;
    var g = ctx.createLinearGradient(ax, ay, bx, by);
    g.addColorStop(0, hexToRgba(color, a0));
    g.addColorStop(1, hexToRgba(color, a1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ax + nx * w0, ay + ny * w0);
    ctx.lineTo(bx + nx * w1, by + ny * w1);
    ctx.lineTo(bx - nx * w1, by - ny * w1);
    ctx.lineTo(ax - nx * w0, ay - ny * w0);
    ctx.closePath();
    ctx.fill();
  }

  /* A tracer as two passes: a wide dim halo, then a hairline core on top.
   * Every weapon variety goes through this rather than through taperedTracer
   * directly, so none of them can drift back into being one fat bar. */
  function glowTracer(ctx, ax, ay, bx, by, w0, w1, color, a0, a1) {
    taperedTracer(ctx, ax, ay, bx, by,
                  w0 * TRACER_HALO_W, w1 * TRACER_HALO_W, color,
                  a0 * TRACER_HALO_A, a1 * TRACER_HALO_A);
    taperedTracer(ctx, ax, ay, bx, by, w0, w1, color, a0, a1);
  }

  /* One pass of a streak, as a ribbon along the WORLD ray between two
   * fractions of it. See the note by BOLT_R for why this is not done between
   * two projected endpoints.
   *
   * Drawn as a single polygon rather than as a run of quads. Butting quads
   * end to end under 'lighter' double-covers every seam and leaves a ladder
   * of faint bright rungs down the middle of the bolt; one closed outline up
   * one side and back down the other has no seams to brighten, and is one
   * fill instead of four.
   *
   * Returns false if any sample is behind the camera, which is the caller's
   * cue to fall back — a ray that straddles the eye has no honest ribbon. */
  function worldTracerPass(ctx, cam, rib, col, a0, a1, wMul, aMul) {
    var n = rib.length - 1, i;
    var dx = rib[n].x - rib[0].x, dy = rib[n].y - rib[0].y;
    var L = Math.hypot(dx, dy);
    if (!(L > 0.4)) return;                      // nothing to draw, but valid
    var nx = -dy / L, ny = dx / L;
    var g = ctx.createLinearGradient(rib[0].x, rib[0].y, rib[n].x, rib[n].y);
    g.addColorStop(0, hexToRgba(col, a0 * aMul));
    g.addColorStop(1, hexToRgba(col, a1 * aMul));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(rib[0].x + nx * rib[0].w * wMul, rib[0].y + ny * rib[0].w * wMul);
    for (i = 1; i <= n; i++) {
      ctx.lineTo(rib[i].x + nx * rib[i].w * wMul, rib[i].y + ny * rib[i].w * wMul);
    }
    for (i = n; i >= 0; i--) {
      ctx.lineTo(rib[i].x - nx * rib[i].w * wMul, rib[i].y - ny * rib[i].w * wMul);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* `wScale` carries both the miss dimming and the variety's own thickness —
   * a beam is the fattest of the three because the load never stops arriving,
   * a pulse the thinnest. It multiplies the PHYSICAL radius, before the floor
   * and the cap, so at long range everything converges on the same hairline
   * and the difference between the varieties is one you only see up close.
   * That is the correct way round: at 20 km you are being told a shot
   * happened, not which emitter fired it. */
  function worldTracer(ctx, cam, origin, seg, f0, f1, col, a0, a1, wScale) {
    var rib = Render.boltRibbon(cam, origin, seg, f0, f1, wScale);
    if (!rib) return false;
    worldTracerPass(ctx, cam, rib, col, a0, a1, TRACER_HALO_W, TRACER_HALO_A);
    worldTracerPass(ctx, cam, rib, col, a0, a1, 1, 1);
    return true;
  }

  /* The beam colours in the catalogue are '#rrggbb'; a gradient needs an
   * alpha per stop, so they have to be unpacked. */
  function hexToRgba(hex, a) {
    var h = String(hex || '#ff6b5a').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' +
           (n & 255) + ',' + a.toFixed(3) + ')';
  }

  function drawCombatFx(ctx, cam) {
    var i, a, b;
    var nowS = performance.now() / 1000;

    if (G.beams && G.beams.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < G.beams.length; i++) {
        var beam = G.beams[i];
        /* The player's own beams carry a muzzle in the SHIP'S axes and are
         * resolved here, against the attitude the ship has right now. Two
         * bugs die on this line: the origin is no longer eight centimetres
         * behind the pilot's eye, where projecting it divided by a depth of
         * nothing and threw the beam sideways off the canopy; and it no
         * longer stays where the ship WAS, which at 5.5 km/s left the beam
         * half a kilometre astern before it faded. */
        /* From the seat, the tracer comes from under the nose rather than
         * from the true barrel: the real chin gun is only nine degrees below
         * the boresight, above the canopy sill, so a line drawn from it
         * starts in clear air attached to nothing. Render.seatMuzzle puts
         * the apparent origin below the sill, where the hull would be hiding
         * the barrel if the cockpit view drew a hull. Outside, the real
         * emitters are used — out there you can see the guns. */
        var mz = beam.muzzle;
        if (beam.fromShip && mz && G.viewMode === 'cockpit') {
          /* Just below the instrument deck — deckTop() is already this
           * file's answer to "where the screen stops belonging to the
           * world", so the tracer emerges from behind the panels rather
           * than from a fixed angle that only suited one window. The 26 px
           * is how far under the edge it starts, which is enough that the
           * near end is genuinely hidden and not enough to waste travel. */
          var drop = ((deckTop(cam.h) + 26) - cam.cy) / cam.flen;
          mz = Render.seatMuzzle(beam.side || 1, drop);
        }
        var origin = (beam.fromShip && mz)
          ? Render.localToWorld(G.ship, mz.r, mz.u, mz.f)
          : beam.from;
        /* And the far end has to be just as live, or the beam pivots about
         * its muzzle as the ship moves and the view fills with a fan of
         * stale rays — which is precisely what 25x warp made of it. Follow
         * the target if there still is one, otherwise run out along the
         * CURRENT nose; fall back to the frozen point for anything that
         * never had either, which is every NPC's fire. */
        var far = beam.to;
        if (beam.target && beam.target.pos) far = beam.target.pos;
        else if (beam.fromShip && beam.range) far = V.addScaled(origin, G.ship.fwd, beam.range);
        a = cam.project(origin); b = cam.project(far);
        if (!a || !b) continue;

        /* A miss is drawn missing: skewed past the target rather than
         * through it, so being hard to hit LOOKS like being hard to hit.
         *
         * THE SKEW MOVED INTO THE WORLD. It used to be added to the projected
         * endpoint, which was fine while the streak was drawn between two
         * screen points and is not fine now that the whole ray is walked in
         * world space — a far end that exists only on the screen has no
         * fractions along it to interpolate. So the offset is applied to the
         * world point instead, in the camera's own axes and scaled by that
         * point's depth, which reproduces exactly the same on-screen skew at
         * any range or zoom while leaving a real ray to sample.
         *
         * The roll stays `Math.random`: whether a shot connects is an
         * in-the-moment die roll, which the seed doctrine explicitly exempts,
         * and it is memoised on the beam so it does not jitter frame to
         * frame. */
        if (beam.miss) {
          if (beam.missX === undefined) {
            beam.missX = (Math.random() - 0.5) * 60;
            beam.missY = (Math.random() - 0.5) * 60;
          }
          var mk = b.depth / cam.flen;             // pixels -> km at that depth
          far = V.addScaled(far, cam.r, beam.missX * mk);
          far = V.addScaled(far, cam.u, -beam.missY * mk);   // screen y is down
          b = cam.project(far) || b;
        }
        var ex = b.x, ey = b.y;
        /* A 22 km beam with the camera 120,000 km out is a third of a pixel,
         * so from the exterior view's default zoom the guns appeared not to
         * fire at all — which is exactly how it was reported. A beam is a
         * TRACER: its whole job is to say that a shot happened. So the drawn
         * length is floored, along its own direction, and nothing else is
         * touched — the aim, the range envelope, the falloff and the damage
         * are all decided in combat.js and none of them can see this. */
        var dx = ex - a.x, dy = ey - a.y, L = Math.hypot(dx, dy);
        if (L > 1e-6 && L < MIN_BEAM_PX) {
          ex = a.x + dx / L * MIN_BEAM_PX;
          ey = a.y + dy / L * MIN_BEAM_PX;
          dx = ex - a.x; dy = ey - a.y; L = MIN_BEAM_PX;
        }

        /* How far the tracer has got. Purely cosmetic — see TRACER_CROSS.
         * A beam is drawn full length from the first frame because that is
         * what "continuous" means; the other two travel. */
        var age = nowS - (beam.born || nowS);
        var span = Render.boltSpan(age, TRACER_CROSS);
        var head = beam.variety === 'beam' ? 1 : Math.max(0.06, span.head);
        /* And it fades out over the last third of its life rather than
         * vanishing, so a burst trails off instead of blinking. */
        var life = (beam.until - (beam.born || nowS)) || 0.42;
        var fade = Math.max(0, Math.min(1, (1 - (age / life)) * 3));
        if (fade <= 0) continue;

        var dim = beam.miss ? 0.4 : 1;
        var col = beam.color || '#ff6b5a';

        /* THE RAY, in the world. Every fraction below is a fraction of THIS,
         * not of the projected line, which is the whole correction. */
        var seg = V.sub(far, origin);

        /* Under the floor there is no perspective left to get right: the
         * entire shot is a dozen pixels of tick mark whose only job is to say
         * a gun went off, and the world ray it came from is shorter than one
         * sample. So that case keeps the old screen-space draw, floor and
         * all — this is the exterior-view fix from two builds ago and it must
         * not be lost to a correction it has nothing to do with. */
        var tiny = L <= MIN_BEAM_PX + 0.001;
        var w0 = TRACER_NEAR_W * dim, w1 = TRACER_FAR_W * dim;
        var hx = a.x + dx * head, hy = a.y + dy * head;

        if (beam.variety === 'intermittent') {
          /* A broken line: the delivery is bursts, so the tracer is too. The
           * dashes are cut from the WORLD ray, so they crowd together toward
           * the far end exactly as evenly spaced things do when they recede —
           * which on the old screen-space parameterisation they never did. */
          var DASH = 7, lit = 0.62, d, t0, t1;
          for (d = 0; d < DASH; d++) {
            t0 = (d / DASH) * head; t1 = ((d + lit) / DASH) * head;
            if (tiny || !worldTracer(ctx, cam, origin, seg, t0, t1, col,
                                     fade * (0.95 - 0.75 * t0),
                                     fade * (0.95 - 0.75 * t1), dim)) {
              glowTracer(ctx,
                a.x + dx * t0, a.y + dy * t0, a.x + dx * t1, a.y + dy * t1,
                w0 + (w1 - w0) * t0, w0 + (w1 - w0) * t1,
                col, fade * (0.95 - 0.75 * t0), fade * (0.95 - 0.75 * t1));
            }
          }
        } else if (beam.variety === 'beam') {
          // Continuous, and the widest of the three: the load never stops.
          if (tiny || !worldTracer(ctx, cam, origin, seg, 0, head, col,
                                   fade * 0.95, fade * 0.12, dim * 1.25)) {
            glowTracer(ctx, a.x, a.y, hx, hy, w0 * 1.25, w1, col,
                       fade * 0.95, fade * 0.12);
          }
        } else {
          /* A pulse is a packet of particles, and a packet debunches — so it
           * is drawn as a streak that ELONGATES behind its head rather than
           * as a fixed-length slug sliding along the run. Render.boltSpan
           * carries the reasoning and the two numbers.
           *
           * Bright at the head and falling away down the tail, because that
           * is which end the dense part of the bunch is at: the leaders have
           * outrun the stragglers, so the light thins out behind them.
           *
           * Measured against the floored `head` rather than span.head, so the
           * first-frame floor survives into the length test — otherwise a
           * shot's opening frame computes a zero-length streak and draws
           * nothing at all. */
          if (head - span.tail > 1e-4) {
            if (tiny || !worldTracer(ctx, cam, origin, seg, span.tail, head,
                                     col, fade * 0.05, fade * 1.0, dim * 0.7)) {
              glowTracer(ctx, a.x + dx * span.tail, a.y + dy * span.tail,
                         hx, hy, w0 * 0.5, w0 * 0.9, col,
                         fade * 0.05, fade * 1.0);
            }
          }
        }
      }
      ctx.restore();
    }

    var ms = G.sys.missiles;
    if (ms && ms.length) {
      ctx.save();
      for (i = 0; i < ms.length; i++) {
        var m = ms[i];
        var mp = cam.project(m.pos);
        if (!mp) continue;
        var tail = cam.project(V.addScaled(m.pos, V.norm(m.vel), -0.4));
        if (tail) {
          var g = ctx.createLinearGradient(mp.x, mp.y, tail.x, tail.y);
          g.addColorStop(0, 'rgba(255,220,150,0.9)');
          g.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(mp.x, mp.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
        }
        ctx.fillStyle = '#ffe6a8';
        ctx.fillRect(mp.x - 1.4, mp.y - 1.4, 2.8, 2.8);
      }
      ctx.restore();
    }

    if (G.explosions && G.explosions.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < G.explosions.length; i++) {
        var ex = G.explosions[i];
        var ep = cam.project(ex.pos);
        if (!ep) continue;
        var age = (nowS * 1000 - ex.at) / 900;         // 0..1
        if (age < 0 || age > 1) continue;
        var r = Math.max(3, ex.size * ep.scale) * (0.3 + age * 1.6);
        ctx.globalAlpha = (1 - age) * 0.9;
        ctx.strokeStyle = '#ffd9a0';
        ctx.lineWidth = 2.5 * (1 - age) + 0.5;
        ctx.beginPath(); ctx.arc(ep.x, ep.y, r, 0, K.TAU); ctx.stroke();
        ctx.strokeStyle = '#ff8a5a';
        ctx.beginPath(); ctx.arc(ep.x, ep.y, r * 0.55, 0, K.TAU); ctx.stroke();
        if (age < 0.35) {
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = (0.35 - age) * 2.2;
          ctx.beginPath(); ctx.arc(ep.x, ep.y, r * 0.3, 0, K.TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /* ---- cockpit ----------------------------------------------------------
   * The interior is real geometry (render.js). This function is the
   * division of labour the cockpit design is built on: flight-critical
   * symbology is PROJECTED ON THE GLASS, clipped to the window and blended
   * additively so it glows over the world; data-heavy readouts live on
   * PHYSICAL PANELS set into the dashboard, drawn in perspective. That is
   * the split Frontier used, and it is the right one — the ladder has to
   * be out where you are looking, and the cargo manifest does not. */
  /* Painter's order is the whole trick here, and it is worth naming:
   *   hull  ->  glass  ->  HUD on the glass  ->  interior.
   * The interior comes last because the dashboard is physically between the
   * pilot and the canopy, so it should cut off the bottom of the attitude
   * ladder rather than the ladder floating over the console. That mattered
   * a little before; now that the head can turn, it matters constantly. */
  function drawCockpitView(ctx, cam, w, h) {
    var shell = G.showCockpitFrame ? Render.drawCockpitShell(ctx, cam, G.ship, w, h) : null;
    var apertures = shell ? shell.apertures : null;
    var aperture = shell ? shell.aperture : null;

    if (shell) {
      /* No star to glare off the canopy while you are between them — the
       * tunnel does its own lighting. Nor under a roof: the sun is on the
       * far side of several metres of hangar, and a lens flare through it
       * was the last thing still insisting you were outdoors. */
      if (G.hyper || enclosedPort()) {
        Render.drawGlass(ctx, apertures, w, h, {});
      } else {
        var starPos = Sim.bodyPosition(G.sys.root, G.sys, G.t);
        var starRel = V.sub(starPos, cam.eye);
        Render.drawGlass(ctx, apertures, w, h, {
          starScreen: cam.project(starPos),
          starVisible: V.dot(V.norm(starRel), cam.f) > 0
        });
      }
    }

    var lv = Sim.localVertical(G.ship.pos, G.sys, G.t);
    var fr = G.frame || orbitalFrame();
    var centred = Math.abs(G.look.yaw) < 0.42 && Math.abs(G.look.pitch) < 0.42;

    /* Nothing to be level with in the tunnel, and nowhere to be going that
     * a flight-path marker could point at. The glass carries the drive
     * readout instead — which is what those instruments are FOR, rather
     * than a ladder pretending it still knows which way is up. */
    if (G.hyper) {
      Render.glassBegin(ctx, aperture);
      drawTransitGlass(ctx, w, h);
      Render.glassEnd(ctx);
      if (shell) {
        var hyperInner = Render.drawCockpitInterior(ctx, cam, G.ship, w, h);
        drawDashPanels(ctx, hyperInner.mfds, true);
        Render.drawProjectionWash(ctx, aperture, hyperInner.emitters, w, h,
                                  Math.floor(performance.now() / 90));
      }
      return;
    }

    Render.glassBegin(ctx, aperture);
    var angles = Render.drawAttitudeLadder(ctx, cam, G.ship, lv.up, w, h);
    Render.drawFlightPathMarker(ctx, cam, fr.prograde, w, h);
    // The bank scale is a fixed instrument on the glass ahead of you, so it
    // has no business being drawn once you have looked away from it.
    if (centred) Render.drawBankScale(ctx, w, h, angles.rollDeg, h * 0.30);

    // The navigation lock gets the strongest box on the glass.
    var nav = navTargetState();
    if (nav) {
      Render.drawHoloTarget(ctx, cam, nav.pos, nav.name,
        fmtDist(nav.range) + (isFinite(nav.eta) ? '  ETA ' + fmtTime(nav.eta) : ''),
        nav.hostile ? '#ff6b5a' : '#ffd36b', w, h);
    }
    if (G.dockTarget && !G.ship.docked && (!nav || nav.obj !== G.dockTarget)) {
      var tp = Sim.bodyPosition(G.dockTarget, G.sys, G.t);
      Render.drawHoloTarget(ctx, cam, tp, G.dockTarget.name,
        fmtDist(V.dist(tp, G.ship.pos)), '#7dffb0', w, h);
    }
    /* Anything awake gets boxed on the glass — a pirate in red, because
     * that is the one contact you must never have to hunt for. */
    if (G.encounter && G.encounter.active.length) {
      G.encounter.active.forEach(function (spec) {
        if (!spec.live) return;
        Render.drawHoloTarget(ctx, cam, spec.live.pos, spec.name,
          spec.className + ' · ' + fmtDist(V.dist(spec.live.pos, G.ship.pos)),
          spec.kind === 'pirate' ? '#ff6b5a' : '#7dffb0', w, h);
      });
    }

    if (centred) {
      ctx.save();
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = '#6ef0c0';
      ctx.textAlign = 'center';
      ctx.fillText(angles.degenerate ? '' :
        'PITCH ' + angles.pitchDeg.toFixed(1) + '°   ROLL ' + angles.rollDeg.toFixed(1) +
        '°   REF ' + lv.body.name.toUpperCase(), w / 2, h / 2 + 40);
      ctx.textAlign = 'left';
      ctx.restore();
    }
    /* Last thing on the glass, and INSIDE the clip on purpose: the field
     * flares a metre outside the canopy, so you see it through the glass and
     * it should be cut off by the frame exactly as the sky is. */
    drawCanopyShieldFlare(ctx, cam, w, h);
    Render.glassEnd(ctx);

    if (shell) {
      /* Interior last, because the console is physically between the pilot
       * and the canopy — that is what makes the dash cut off the bottom of
       * the ladder rather than the ladder floating over it. The three
       * screens set into the dash are filled here: scope, orbit and target,
       * the three things you look at while flying rather than while
       * reading. The flat band along the bottom still carries everything,
       * so nothing depends on being able to read a surface in perspective. */
      var inner = Render.drawCockpitInterior(ctx, cam, G.ship, w, h);
      drawDashPanels(ctx, inner.mfds, false);
      Render.drawProjectionWash(ctx, aperture, inner.emitters, w, h,
                                Math.floor(performance.now() / 90));
    }

    /* Taking a hit, from inside. Half a second of red across the whole
     * cabin — the cockpit is the thing that got shot, so the flare belongs
     * on the frame and the glass alike rather than on a HUD element. */
    var sinceHit = (performance.now() - (G.hitAt || 0)) / 1000;
    if (sinceHit >= 0 && sinceHit < 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30 * (1 - sinceHit / 0.5);
      var flare = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.1,
                                           w / 2, h * 0.55, Math.max(w, h) * 0.75);
      flare.addColorStop(0, 'rgba(255,90,70,0.0)');
      flare.addColorStop(1, 'rgba(255,70,50,1)');
      ctx.fillStyle = flare;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    /* Say plainly which way you are facing when it is not forward. Without
     * this, looking away and then getting distracted reads as the ship
     * having mysteriously rotated. */
    if (!centred) {
      var yawDeg = Math.round(G.look.yaw / DEG), pitchDeg = Math.round(G.look.pitch / DEG);
      ctx.save();
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = '#ffd36b';
      ctx.textAlign = 'center';
      var bits = [];
      if (Math.abs(yawDeg) > 4) bits.push(Math.abs(yawDeg) + '° ' + (yawDeg > 0 ? 'RIGHT' : 'LEFT'));
      if (Math.abs(pitchDeg) > 4) bits.push(Math.abs(pitchDeg) + '° ' + (pitchDeg > 0 ? 'UP' : 'DOWN'));
      ctx.fillText('LOOKING ' + bits.join('  ') + '   ·   Home to centre', w / 2, 28);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  /* What the canopy projector shows while you are in transit: the drive
   * state, where you left, where you are going, and the date running
   * forward. Deliberately sparse — the tunnel is the thing to look at. */
  function drawTransitGlass(ctx, w, h) {
    var hy = G.hyper;
    var cx = w / 2, cy = h / 2;
    var p = Math.min(1, hy.elapsed / hy.total);

    ctx.save();
    ctx.textAlign = 'center';

    // A ring that closes as the drive charges and opens as you arrive.
    var ringR = Math.min(w, h) * (hy.phase === 'charge'
      ? 0.34 - 0.16 * (hy.elapsed / HYPER_CHARGE)
      : 0.18 + 0.16 * Math.max(0, (hy.elapsed - HYPER_CHARGE - HYPER_TUNNEL) / HYPER_EXIT));
    ctx.strokeStyle = 'rgba(150,230,255,0.55)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(8, ringR), 0, K.TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(hy.phase === 'charge' ? 'SLIPSPACE DRIVE — CHARGING'
               : hy.phase === 'exit' ? 'EMERGENCE' : 'IN TRANSIT',
                 cx, cy - Math.max(8, ringR) - 18);

    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText(hy.fromName + '   ➜   ' + hy.plan.to.name,
                 cx, cy + Math.max(8, ringR) + 22);
    ctx.fillStyle = '#ffd36b';
    ctx.fillText(fmtEpoch(hy.clock), cx, cy + Math.max(8, ringR) + 38);
    ctx.fillStyle = 'rgba(180,240,255,0.7)';
    ctx.fillText(fmtLy(hy.plan.distance) + '   ·   ' + fmtTime(hy.plan.seconds) + ' of transit',
                 cx, cy + Math.max(8, ringR) + 54);

    // A plain progress bar, because a jump you cannot see the end of is
    // just a long pause.
    var bw = Math.min(360, w * 0.4), bx = cx - bw / 2, by = cy + Math.max(8, ringR) + 70;
    ctx.strokeStyle = 'rgba(150,230,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, 5);
    ctx.fillStyle = 'rgba(180,240,255,0.85)';
    ctx.fillRect(bx, by, bw * p, 5);

    ctx.textAlign = 'left';
    ctx.restore();
  }

  /* ---- dashboard panels -------------------------------------------------
   * Each panel is drawn into a flat 260x176 pixel space which render.js maps
   * onto the projected quad. Writing them in flat coordinates means the
   * layout code has no idea it is being displayed in perspective, which is
   * exactly how it should be. */
  /* ---- MFD chrome -------------------------------------------------------
   * Frontier First Encounters' panels had a look, and it came from four
   * things rather than from detail: a hard rectangular bezel, a filled
   * title bar in reverse video, tab markers showing which page of several
   * you are on, and a soft-key strip along the bottom telling you what the
   * keys do RIGHT NOW. That last one is the part modern UI usually drops
   * and the part that made those cockpits usable without a manual.
   *
   * Everything below is drawn in a flat 260x176 pixel space that render.js
   * maps onto the physical panel; this code has no idea it is being viewed
   * in perspective, which is exactly how it should be. */
  var MFD_W = 460, MFD_H = 178;
  var MFD_BODY_TOP = 26, MFD_BODY_BOTTOM = 152;
  var MFD_INK = '#d8f0c8', MFD_DIM = '#6aa8ba', MFD_HOT = '#ffd36b', MFD_EDGE = '#4a97b0';

  function mfdShell(ctx, title, softkeys) {
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(0, 0, MFD_W, MFD_H);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, MFD_W - 4, MFD_H - 4);

    // Title bar, reverse video.
    ctx.fillStyle = '#12414f';
    ctx.fillRect(4, 4, MFD_W - 8, 19);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(title, 10, 18);

    // Soft-key strip: what the keys do RIGHT NOW, which is the part of a
    // Frontier cockpit that made it usable without a manual.
    ctx.fillStyle = '#08161d';
    ctx.fillRect(4, MFD_H - 24, MFD_W - 8, 20);
    ctx.strokeStyle = 'rgba(74,151,176,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, MFD_H - 24, MFD_W - 8, 20);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText(softkeys || '', 10, MFD_H - 10);
  }

  function mfdRow(ctx, y, label, value, color) {
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText(label, 10, y);
    ctx.fillStyle = color || MFD_INK;
    ctx.textAlign = 'right';
    ctx.fillText(value, MFD_W - 10, y);
    ctx.textAlign = 'left';
  }

  function mfdBar(ctx, y, frac, color) {
    ctx.fillStyle = 'rgba(74,151,176,0.22)';
    ctx.fillRect(10, y, MFD_W - 20, 7);
    ctx.fillStyle = color;
    ctx.fillRect(10, y, (MFD_W - 20) * Math.max(0, Math.min(1, frac)), 7);
    ctx.strokeStyle = 'rgba(74,151,176,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, y, MFD_W - 20, 7);
  }

  function mfdLabelled(ctx, y, text, right, color) {
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText(text, 10, y);
    if (right) {
      ctx.fillStyle = color || MFD_INK;
      ctx.textAlign = 'right';
      ctx.fillText(right, MFD_W - 10, y);
      ctx.textAlign = 'left';
    }
  }

  function clipText(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* One-letter type marks, so a nav list scans without reading words. */
  function navMark(entry) {
    if (entry.kind === 'ship') return entry.hostile ? '!' : '>';
    switch (entry.obj.kind) {
      case 'star': return '*';
      case 'planet': return 'O';
      case 'moon': return 'o';
      case 'station': return '#';
      default: return '·';
    }
  }

  /* ---- the console ------------------------------------------------------
   * Everything you read lives here now, drawn flat and square to the
   * screen: a band across the bottom holding the flight controls on the
   * left, the selected instrument page in the middle, a status column on
   * the right, and the nine-slot key bar underneath.
   *
   * The pages themselves are unchanged from when they were mapped onto the
   * dashboard in perspective — they always drew into their own flat pixel
   * space and never knew how they were being displayed, which is exactly
   * why moving them was a change of two lines rather than a rewrite. */
  var CONSOLE_H = MFD_H, FBAR_H = 40;

  /* Where the screen stops belonging to the world. In flight that is the
   * top of the instrument band; on any other mode the mode owns everything
   * down to the icon bar. Anything drawn over the top — warnings, messages,
   * the footer — asks this rather than measuring from the bottom edge, which
   * is how the footer hint once ended up painted through the key bar. */
  function deckTop(h) { return h - FBAR_H - (bandShown() ? CONSOLE_H : 0); }

  /* The flat band is drawn while flying — unless you have stowed it in the
   * cockpit, in which case the console's own screens are the instruments
   * and the band would be sitting on top of them. Everything that measures
   * from the bottom of the world asks this rather than assuming, which is
   * what keeps warnings, messages and the footer off the icon bar. */
  function bandShown() {
    return flying() && !(G.cockpitChrome === 1 && G.viewMode === 'cockpit');
  }

  /* ---- clickable things -------------------------------------------------
   * A button is a rectangle plus a function, registered by whatever drew it,
   * in the same coordinates it drew in. Nothing else can then disagree about
   * where it is. The list is rebuilt from scratch every frame, so a control
   * that stops being drawn stops being clickable in the same instant. */
  function hot(x, y, w, h, fn, hint) {
    G.hotspots.push({ x: x, y: y, w: w, h: h, fn: fn, hint: hint || null });
    return { x: x, y: y, w: w, h: h };
  }

  function hitHot(x, y) {
    for (var i = G.hotspots.length - 1; i >= 0; i--) {
      var s = G.hotspots[i];
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
    }
    return null;
  }

  /* Was the mouse over a button when it went down? Used by the drag handler
   * so clicking an icon does not also swing your head round. */
  function overHot(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return hitHot(clientX - r.left, clientY - r.top);
  }

  function drawConsole(ctx, w, h) {
    G.hotspots = [];
    /* The dashboard panels were drawn long before this — the cockpit is
     * part of the world pass — and this is where the hotspot list gets
     * rebuilt, so their click targets are replayed in here rather than
     * registered where they were drawn and then thrown away. They go in
     * FIRST so that anything the band draws on top of them wins the click,
     * which is the same rule the screen has: whatever is in front. */
    if (G.viewMode === 'cockpit' && flying()) {
      for (var ph = 0; ph < panelHots.length; ph++) G.hotspots.push(panelHots[ph]);
    }
    var barY = h - FBAR_H;
    if (bandShown()) drawFlightBand(ctx, w, h, barY);
    else if (flying()) drawStowedHint(ctx, w, barY);
    else if (mapMode()) drawOrbitMapChrome(ctx, w, barY);
    else drawModeScreen(ctx, w, barY);
    drawIconBar(ctx, w, barY);
  }

  /* ---- F2: the orbit map ------------------------------------------------
   * The view the game boots into, on a key of its own: the world from
   * outside, orbit lines forced on, drag to turn it, wheel to zoom, Tab to
   * walk the camera through the bodies, C to come back to the ship. The
   * chrome is deliberately thin — a survey strip and a clickable body list
   * over translucent panels — because the map is the content. */
  function drawOrbitMapChrome(ctx, w, bottom) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,14,0.82)';
    ctx.fillRect(0, 0, w, 26);
    ctx.strokeStyle = 'rgba(90,190,220,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 26.5); ctx.lineTo(w, 26.5); ctx.stroke();
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    var mapTitle = 'SYSTEM ORBITS — ' + G.sys.name;
    ctx.fillText(mapTitle, 14, 18);
    /* The hint only gets the space the title leaves it — at narrow widths
     * the two were meeting in the middle. */
    var hintRoom = w - 28 - ctx.measureText(mapTitle).width - 24;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#5d8fa4';
    ctx.textAlign = 'right';
    ctx.fillText(clipText(
      'drag to turn · wheel to zoom · Tab walks the bodies · C back to the ship · Esc to the cockpit',
      Math.max(0, Math.floor(hintRoom / 5.6))), w - 14, 18);
    ctx.textAlign = 'left';
    ctx.restore();

    /* The survey, top-left, translucent so the sky stays a sky. */
    var infoW = Math.min(340, w * 0.32);
    ctx.save();
    ctx.globalAlpha = 0.88;
    global.Screens.tile(ctx, 10, 34, infoW, global.Screens.tileHeight(infoW), drawSystemPage);
    ctx.restore();

    /* The bodies, right edge, each one a button: click to swing the camera
     * there, click again to lock it as the nav target. */
    var listW = Math.min(230, w * 0.24);
    var lx = w - listW - 10, ly = 34;
    var list = G.sys.bodies;
    var maxRows = Math.floor((bottom - ly - 30) / 15);
    ctx.save();
    ctx.fillStyle = 'rgba(4,10,14,0.82)';
    ctx.fillRect(lx, ly, listW, Math.min(list.length, maxRows) * 15 + 30);
    ctx.strokeStyle = 'rgba(74,151,176,0.5)';
    ctx.strokeRect(lx + 0.5, ly + 0.5, listW - 1, Math.min(list.length, maxRows) * 15 + 29);
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = '#5d8fa4';
    ctx.fillText('BODIES  ·  click to view, again to lock', lx + 8, ly + 15);
    ctx.font = '11px ui-monospace, monospace';
    for (var i = 0; i < Math.min(list.length, maxRows); i++) {
      var b = list[i], yy = ly + 30 + i * 15;
      var focused = G.focus === b;
      var locked = G.navTarget && G.navTarget.kind === 'body' && G.navTarget.id === b.id;
      ctx.fillStyle = bodyDotColor(b.kind);
      ctx.fillText(navMark({ kind: 'body', obj: b }), lx + 8, yy);
      ctx.fillStyle = locked ? MFD_HOT : focused ? '#b4f0ff' : (b.habitable ? '#7dffb0' : MFD_INK);
      ctx.fillText(clipText(b.name, 20), lx + 20, yy);
      hot(lx + 4, yy - 11, listW - 8, 15, (function (body) {
        return function () {
          if (G.focus === body) {
            G.navTarget = { kind: 'body', id: body.id };
            say('Locked ' + body.name, 2);
          } else {
            G.followShip = false;
            G.focus = body;
            G.cam.dist = body.kind === 'star' ? body.radius * 40 : body.radius * 8;
            say('Viewing ' + body.name + ' — click again to lock', 2);
          }
        };
      })(b));
    }
    ctx.restore();
  }

  /* With the band stowed there is nothing along the bottom but the icon
   * bar, so one line says why and how to get it back. */
  function drawStowedHint(ctx, w, barY) {
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(125,255,207,0.55)';
    ctx.textAlign = 'center';
    /* Above the footer line, not through it — the footer already owns
     * barY - 8, and two strings sharing a baseline is how you get a smear. */
    ctx.fillText('instruments on the console  ·  K for the band  ·  click a panel to change its page',
                 w / 2, barY - 24);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /* ---- F1: flying -------------------------------------------------------
   * The only mode that leaves the world visible, so it gets the smallest
   * possible band: what you touch on the left, the scope in the middle
   * where a scope belongs, and what the ship most needs to tell you on the
   * right. Everything you have to READ has its own screen now. */
  function drawFlightBand(ctx, w, h, barY) {
    var y = barY - CONSOLE_H;

    ctx.save();
    var face = ctx.createLinearGradient(0, y, 0, h);
    face.addColorStop(0, 'rgba(12,18,26,0.92)');
    face.addColorStop(1, 'rgba(6,10,16,0.97)');
    ctx.fillStyle = face;
    ctx.fillRect(0, y, w, CONSOLE_H + FBAR_H);
    ctx.strokeStyle = 'rgba(90,150,190,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    ctx.restore();

    var ctlW = Math.min(330, w * 0.34);
    drawFlightControls(ctx, 10, y, ctlW, CONSOLE_H);

    var statusW = Math.min(240, Math.max(180, w * 0.22));
    var statusX = w - statusW - 10;
    var scopeX = ctlW + 20;
    var scopeW = statusX - scopeX - 12;

    if (scopeW > 150) drawDeckScope(ctx, scopeX, y, scopeW, CONSOLE_H);
    if (statusX > scopeX) drawStatusColumn(ctx, statusX, y, statusW, CONSOLE_H);
  }

  /* The scope, at whatever size the space allows. Frontier's fishbowl: a
   * plan view seen at an angle with a vertical stalk to every contact, so
   * the third dimension is drawn in explicitly instead of projected away.
   *
   * It takes its geometry as arguments rather than reading the screen size,
   * because the next thing that wants to draw it is a physical surface in
   * the cockpit and it should not have to care which it is. */
  function drawDeckScope(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(x, y + 2, w, h - 4);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 4, w - 4, h - 8);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(x + 4, y + 6, w - 8, 19);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('SCOPE', x + 10, y + 20);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.textAlign = 'right';
    ctx.fillText('0.75 AU  ·  nose up', x + w - 10, y + 20);
    ctx.textAlign = 'left';
    ctx.restore();

    scopeBody(ctx, x + w / 2, y + 26 + (h - 34) * 0.55,
              Math.min((w - 40) / 2, 150), Math.min((h - 44) * 0.42, 46));
  }

  /* The ellipse and everything on it. Shared by the flight band and the
   * navigation screen, which is why it takes a centre and two radii. */
  function scopeBody(ctx, cx, cy, rx, ry) {
    ctx.save();
    ctx.strokeStyle = 'rgba(74,151,176,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, K.TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(74,151,176,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.5, ry * 0.5, 0, 0, K.TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy); ctx.lineTo(cx + rx, cy);
    ctx.moveTo(cx, cy - ry); ctx.lineTo(cx, cy + ry);
    ctx.stroke();
    ctx.restore();

    var stalk = ry * 0.85;

    function blip(pos, color, shape, ring) {
      var rel = Sim.relativeToShipFrame(G.ship, pos);
      if (rel.range > RADAR_RANGE || rel.range < 1e-6) return;
      var frac = Math.min(1, Math.hypot(rel.fwd, rel.right) / RADAR_RANGE);
      var px = cx + Math.sin(rel.azimuth) * frac * rx;
      var py = cy - Math.cos(rel.azimuth) * frac * ry;
      var stem = Math.sin(rel.elevation) * stalk;
      ctx.save();
      ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - stem); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color; ctx.strokeStyle = color;
      var ty = py - stem;
      if (shape === 'hostile') {
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(px, ty - 4); ctx.lineTo(px + 4, ty);
        ctx.lineTo(px, ty + 4); ctx.lineTo(px - 4, ty);
        ctx.closePath(); ctx.stroke();
      } else if (shape === 'square') {
        ctx.fillRect(px - 2, ty - 2, 4, 4);
      } else if (shape === 'cross') {
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px - 3, ty); ctx.lineTo(px + 3, ty);
        ctx.moveTo(px, ty - 3); ctx.lineTo(px, ty + 3);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(px, ty, 2.4, 0, K.TAU); ctx.fill();
      }
      if (ring) {
        ctx.strokeStyle = MFD_HOT; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(px, ty, 6.5, 0, K.TAU); ctx.stroke();
      }
      ctx.restore();
    }

    var lock = G.navTarget;
    var i;
    for (i = 0; i < G.sys.bodies.length; i++) {
      var b = G.sys.bodies[i];
      if (G.ship.docked && b.id === G.ship.docked) continue;
      blip(Sim.bodyPosition(b, G.sys, G.t), bodyDotColor(b.kind),
           b.kind === 'station' ? 'square' : 'dot',
           lock && lock.kind === 'body' && lock.id === b.id);
    }
    var ships = Sim.shipsAll(G.sys, G.t);
    for (i = 0; i < ships.length; i++) {
      var sh = ships[i];
      blip(sh.pos, sh.hostile ? '#ff8a76' : '#8fe36a',
           sh.hostile ? 'hostile' : 'dot',
           lock && lock.kind === 'ship' && lock.id === sh.id);
    }
    /* Jettisoned cargo reads as a cross: not a ship, not a rock, and worth
     * a second look if it is not yours. */
    var cans = Sim.canistersAll(G.sys);
    for (i = 0; i < cans.length; i++) {
      var cn = cans[i];
      /* Wreckage is a dim dot and salvage is the same cross a crate gets —
       * because what the radar is for is telling you which of the sixteen
       * pieces of that freighter is worth flying to. Scrap still shows: a
       * debris field you cannot see is a debris field you fly into. */
      if (cn.kind === 'debris' && !cn.cid) blip(cn.pos, '#6b7480', 'dot', false);
      else blip(cn.pos, '#ffd36b', 'cross', false);
    }
  }

  /* ---- the three screens in the dashboard -------------------------------
   * render.js hands back a projected quad per panel and a flat pixel space
   * to draw it in; everything below draws in that flat space and has no
   * idea it is being viewed at an angle.
   *
   * Five screens: three on the arc in front of you at ten, twelve and two,
   * and two on the rear bulkhead for when you turn round. What each one
   * shows is the pilot's business, not the game's — click a panel to walk
   * it through the pages. The defaults are the set you fly with: where
   * things are, the path you are on, and the thing you are aimed at, with
   * the housekeeping behind you.
   *
   * None of this replaces the flat band along the bottom, which has not
   * lost a row; K chooses which of the two owns the bottom of the screen,
   * because they want the same pixels and no window size gives both. */
  /* ---- the aft view -----------------------------------------------------
   * A camera looking backwards, drawn into a panel. Not a second pass of
   * the renderer: the world pass is half in the GL layer and rendering it
   * twice a frame to fill a 460-pixel screen would cost more than the whole
   * rest of the frame. This builds the picture from the same world data
   * instead — the ship's own aft-facing camera basis, everything projected
   * through it, bodies as discs and traffic as marks.
   *
   * What it is for is the thing behind you, so that is what it draws
   * loudest: hostiles in red with a range, and a closing arrow.
   */
  var AFT_FOV = 82 * DEG;
  var aftCam = null;

  function drawAftView(ctx, w, h) {
    mfdShell(ctx, 'AFT', 'looking astern   ·   ' + (AFT_FOV / DEG).toFixed(0) + '° field');
    var top = MFD_BODY_TOP + 2, bot = MFD_H - 26;
    var vw = w - 8, vh = bot - top;

    ctx.save();
    ctx.beginPath();
    ctx.rect(4, top, vw, vh);
    ctx.clip();
    ctx.fillStyle = '#02060a';
    ctx.fillRect(4, top, vw, vh);

    if (!aftCam) aftCam = new Render.Camera();
    aftCam.cockpitFov = AFT_FOV;
    aftCam.buildCockpit(G.ship, vw, vh, { yaw: Math.PI, pitch: 0 });
    /* buildCockpit centres on (vw/2, vh/2); the panel's viewport starts at
     * (4, top), so shift the principal point rather than translating the
     * canvas — projections elsewhere in this frame must not move. */
    aftCam.cx += 4; aftCam.cy += top;

    /* Stars first, faint: they are what makes it read as a view out rather
     * than a diagram, and they cost one projection each. */
    var st = G.stars || [];
    ctx.fillStyle = 'rgba(150,190,220,0.55)';
    for (var s = 0; s < st.length; s += 3) {          // every third: it is a small screen
      var sp = aftCam.projectDir(st[s].d);
      if (sp) ctx.fillRect(sp.x, sp.y, 1, 1);
    }

    // Horizon-ish cross, so the picture has an orientation.
    ctx.strokeStyle = 'rgba(90,190,180,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, top + vh / 2); ctx.lineTo(4 + vw, top + vh / 2);
    ctx.moveTo(4 + vw / 2, top); ctx.lineTo(4 + vw / 2, top + vh);
    ctx.stroke();

    // Bodies, as discs where they resolve and marks where they do not.
    var i, p;
    for (i = 0; i < G.sys.bodies.length; i++) {
      var b = G.sys.bodies[i];
      var bp = b.underground ? Sim.portEntrance(b, G.sys, G.t).pos
                             : Sim.bodyPosition(b, G.sys, G.t);
      p = aftCam.project(bp);
      if (!p) continue;
      var rpx = b.radius * p.scale;
      ctx.fillStyle = bodyDotColor(b.kind);
      ctx.globalAlpha = b.kind === 'star' ? 1 : 0.85;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.2, Math.min(rpx, vh)), 0, K.TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (rpx > 3) {
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(210,240,255,0.75)';
        ctx.fillText(clipText(b.name, 14), p.x + Math.min(rpx, 40) + 4, p.y + 3);
      }
    }

    /* Traffic. A ship astern is the entire reason this screen exists, so it
     * gets a bracket, a name and a range — and a hostile one gets all of
     * that in red whatever else is on screen. */
    var ships = Sim.shipsAll(G.sys, G.t);
    ctx.font = '9px ui-monospace, monospace';
    var closest = null, closestRange = Infinity;
    for (i = 0; i < ships.length; i++) {
      var sh = ships[i];
      p = aftCam.project(sh.pos);
      var rng = V.dist(sh.pos, G.ship.pos);
      if (rng < closestRange) { closestRange = rng; closest = sh; }
      if (!p) continue;
      var col = sh.hostile ? '#ff6b5a' : '#8fe36a';
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.2;
      ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
      ctx.fillText(fmtDist(rng), p.x + 8, p.y + 3);
    }

    // Missiles under way astern: the one contact worth a shout.
    var ms = (G.sys.missiles || []);
    for (i = 0; i < ms.length; i++) {
      p = aftCam.project(ms[i].pos);
      if (!p) continue;
      ctx.fillStyle = '#ffd36b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, K.TAU);
      ctx.fill();
    }
    ctx.restore();

    /* The line under the picture is the summary you would want if you only
     * glanced at it: what is back there and whether it is gaining. */
    ctx.font = '10px ui-monospace, monospace';
    if (closest) {
      var rel = V.sub(closest.vel || V.zero(), G.ship.vel);
      var toward = V.dot(V.norm(V.sub(G.ship.pos, closest.pos)), rel);
      ctx.fillStyle = closest.hostile ? '#ff8a76' : MFD_DIM;
      ctx.fillText('nearest  ' + clipText(closest.name || 'contact', 16) + '   ' +
                   fmtDist(closestRange) + (toward > 0 ? '   CLOSING' : ''),
                   10, MFD_H - 28);
    } else {
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('nothing astern', 10, MFD_H - 28);
    }
  }

  /* What a panel can be set to. Every one of these already draws into the
   * flat 460x178 page space, which is why a screen on the dashboard and a
   * screen on the F3 page are the same code seen two ways. */
  var DASH_PAGES = [
    { id: 'scope',   title: 'SCOPE',   draw: function (ctx, w, h) { drawDeckScope(ctx, 0, 0, w, h); } },
    { id: 'aft',     title: 'AFT',     draw: function (ctx, w, h) { drawAftView(ctx, w, h); } },
    { id: 'orbit',   title: 'ORBIT',   draw: function (ctx) { drawOrbitPage(ctx); } },
    { id: 'target',  title: 'TARGET',  draw: function (ctx) { drawTargetPage(ctx); } },
    { id: 'nav',     title: 'NAV',     draw: function (ctx) { drawNavPage(ctx); } },
    { id: 'ship',    title: 'SHIP',    draw: function (ctx) { drawShipPage(ctx); } },
    { id: 'cargo',   title: 'CARGO',   draw: function (ctx) { drawCargoPage(ctx); } },
    { id: 'auto',    title: 'AUTO',    draw: function (ctx) { drawAutoPage(ctx); } },
    { id: 'node',    title: 'NODE',    draw: function (ctx) { drawNodePage(ctx); } },
    { id: 'system',  title: 'SYSTEM',  draw: function (ctx) { drawSystemPage(ctx); } },
    { id: 'blank',   title: 'OFF',     draw: null }
  ];
  var DASH_PAGE_BY_ID = {};
  DASH_PAGES.forEach(function (p) { DASH_PAGE_BY_ID[p.id] = p; });

  function dashPageFor(id) {
    if (!G.dashPages) {
      /* The default set is the one you fly with: where things are, the path
       * you are on, and the thing you are aimed at, with the housekeeping
       * pages behind you where they belong. */
      G.dashPages = { left: 'scope', centre: 'orbit', right: 'target',
                      'rear-left': 'aft', 'rear-right': 'ship' };
    }
    return DASH_PAGE_BY_ID[G.dashPages[id]] || DASH_PAGE_BY_ID.blank;
  }

  function cycleDashPage(id, dir) {
    var cur = dashPageFor(id);
    var i = DASH_PAGES.indexOf(cur);
    var next = DASH_PAGES[(i + (dir || 1) + DASH_PAGES.length) % DASH_PAGES.length];
    G.dashPages[id] = next.id;
    say(id.replace('-', ' ') + ' panel  →  ' + next.title, 2);
  }

  /* Click targets for the panels, held until drawConsole rebuilds the
   * hotspot list. See the note there. */
  var panelHots = [];

  /* A screen that has been shot out. Dark, cracked, and still faintly
   * powered — a black rectangle would read as a rendering bug, and the
   * point is that you can see it is broken rather than missing. */
  function drawDeadPanel(ctx, p) {
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, p.w, p.h);
    ctx.strokeStyle = 'rgba(120,150,190,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, p.w - 4, p.h - 4);

    /* Fracture lines, seeded off the panel id so a given screen keeps the
     * same crack for as long as it is broken rather than shattering anew
     * sixty times a second. */
    var rng = new RNG('crack|' + p.id);
    ctx.strokeStyle = 'rgba(150,190,225,0.30)';
    ctx.lineWidth = 1;
    var ox = p.w * rng.range(0.3, 0.7), oy = p.h * rng.range(0.3, 0.7);
    for (var i = 0; i < 7; i++) {
      var a = rng.angle(), len = rng.range(0.25, 0.9) * p.w * 0.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len * 0.6);
      ctx.stroke();
    }

    // A dying backlight, so it reads as powered and broken, not merely off.
    var flick = 0.06 + 0.05 * Math.abs(Math.sin(performance.now() / 380 + ox));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(90,170,200,' + flick.toFixed(3) + ')';
    ctx.fillRect(4, 4, p.w - 8, p.h - 8);
    ctx.globalCompositeOperation = 'source-over';

    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#ff8a76';
    ctx.fillText('PANEL OUT', 12, 22);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('a yard can replace the glass', 12, 40);
  }

  function drawDashPanels(ctx, mfds, hyper) {
    panelHots.length = 0;
    if (!mfds || !mfds.length) return;
    for (var i = 0; i < mfds.length; i++) {
      var p = mfds[i];
      var page = dashPageFor(p.id);

      /* Click it to change what it shows. The hotspot is the bounding box
       * of the projected quad rather than the quad itself: a couple of
       * pixels of slop at the corners of a panel you are looking at from an
       * angle, against a click test that stays four numbers. */
      if (!hyper) {
        var bb = Render.polyBounds(p.quad);
        panelHots.push({ x: bb.minX, y: bb.minY, w: bb.w, h: bb.h,
                         hint: 'click to change this panel',
                         fn: (function (id) { return function () { cycleDashPage(id, 1); }; })(p.id) });
      }

      if (!Render.mfdBegin(ctx, p)) continue;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      if (G.deadPanels && G.deadPanels[p.id]) {
        drawDeadPanel(ctx, p);
        Render.mfdEnd(ctx);
        continue;
      }
      if (hyper) {
        /* No system to be in, so the pages have nothing true to say and the
         * screens say so rather than drawing a stale one. */
        mfdShell(ctx, page.title, 'no returns in the tunnel');
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillStyle = MFD_DIM;
        ctx.fillText('HYPERSPACE', 10, MFD_BODY_TOP + 26);
      } else if (page.draw) {
        page.draw(ctx, p.w, p.h);
      } else {
        mfdShell(ctx, 'OFF', 'click to bring this panel up');
      }

      /* A phosphor wash and scanlines, inside the panel's own space so they
       * lie on the glass of the screen and foreshorten with it. */
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = '#7dffcf';
      for (var y = 0; y < p.h; y += 3) ctx.fillRect(2, y, p.w - 4, 1);
      ctx.globalAlpha = 1;

      Render.mfdEnd(ctx);
    }
  }

  /* tile/modeFrame/btn and the mode screens themselves live in screens.js,
   * wired through Screens.bind at boot. */

  function drawModeScreen(ctx, w, bottom) {
    if (!global.Screens.draw(ctx, w, bottom, modeId())) selectPanel(0);
  }

  /* ---- the icon bar -----------------------------------------------------
   * Ten slots, drawn rather than written: an icon says which screen at a
   * glance, the key and the word underneath say which key gets you there.
   * Every slot is clickable, because a bar of labelled buttons that you can
   * only reach from the keyboard is a keyboard shortcut wearing a costume. */
  function drawIconBar(ctx, w, y) {
    var n = MODES.length;
    var slotW = Math.min(132, (w - 12) / n);
    var x0 = (w - slotW * n) / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(5,10,16,0.97)';
    ctx.fillRect(0, y, w, FBAR_H);
    ctx.strokeStyle = 'rgba(90,150,190,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    ctx.restore();

    for (var i = 0; i < n; i++) {
      var x = x0 + i * slotW;
      var on = i === G.panel;
      var over = G.cursor.active && G.cursor.x >= x && G.cursor.x <= x + slotW &&
                 G.cursor.y >= y && G.cursor.y <= y + FBAR_H;

      ctx.save();
      ctx.fillStyle = on ? '#12414f' : (over ? 'rgba(20,44,58,0.95)' : 'rgba(10,18,26,0.9)');
      ctx.fillRect(x + 1, y + 3, slotW - 2, FBAR_H - 6);
      ctx.strokeStyle = on ? '#b4f0ff' : 'rgba(74,151,176,0.45)';
      ctx.lineWidth = on ? 1.4 : 1;
      ctx.strokeRect(x + 1, y + 3, slotW - 2, FBAR_H - 6);

      var ink = on ? '#b4f0ff' : (over ? '#cfeaf4' : '#78a6b8');
      drawModeIcon(ctx, MODES[i].icon, x + 15, y + FBAR_H / 2, 9, ink);

      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = on ? '#7fd6c0' : '#4f7d90';
      ctx.fillText(MODES[i].key, x + 28, y + 17);
      ctx.font = on ? 'bold 10px ui-monospace, monospace' : '10px ui-monospace, monospace';
      ctx.fillStyle = on ? '#ffffff' : '#93b8c6';
      ctx.fillText(MODES[i].label, x + 28, y + 30);
      ctx.restore();

      hot(x, y, slotW, FBAR_H, (function (idx) {
        return function () { selectPanel(idx); };
      })(i), MODES[i].label);
    }
  }

  /* Line art, because a glyph font would be one more thing that has to load
   * before the game can draw itself. Each icon is centred on (cx, cy) and
   * fits inside a box of half-width r. */
  function drawModeIcon(ctx, kind, cx, cy, r, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    switch (kind) {
      case 'cockpit':                       // a canopy seen from inside
        ctx.moveTo(cx - r, cy + r * 0.6);
        ctx.quadraticCurveTo(cx, cy - r * 1.1, cx + r, cy + r * 0.6);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.55); ctx.lineTo(cx, cy + r * 0.6);
        ctx.stroke();
        break;
      case 'star':                          // a sun with rays
        ctx.arc(cx, cy, r * 0.42, 0, K.TAU);
        ctx.fill();
        for (var a = 0; a < 8; a++) {
          var th = a * K.TAU / 8;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(th) * r * 0.62, cy + Math.sin(th) * r * 0.62);
          ctx.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r);
          ctx.stroke();
        }
        break;
      case 'nav':                           // the scope ellipse
        ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, K.TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.8, 1.6, 0, K.TAU);
        ctx.fill();
        break;
      case 'comms':                         // a dish
        ctx.arc(cx, cy + r * 0.2, r * 0.85, Math.PI, K.TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy + r * 0.2); ctx.lineTo(cx + r * 0.6, cy - r * 0.9);
        ctx.stroke();
        break;
      case 'hold':                          // a crate
        ctx.rect(cx - r * 0.85, cy - r * 0.7, r * 1.7, r * 1.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.85, cy); ctx.lineTo(cx + r * 0.85, cy);
        ctx.stroke();
        break;
      case 'galaxy':                        // scattered stars
        ctx.arc(cx, cy, r * 0.95, 0, K.TAU);
        ctx.stroke();
        var pts = [[-0.4, -0.3], [0.35, -0.45], [0.15, 0.4], [-0.25, 0.35]];
        for (var p = 0; p < pts.length; p++) {
          ctx.beginPath();
          ctx.arc(cx + pts[p][0] * r, cy + pts[p][1] * r, 1.3, 0, K.TAU);
          ctx.fill();
        }
        break;
      case 'missions':                      // a clipboard
        ctx.rect(cx - r * 0.7, cy - r * 0.85, r * 1.4, r * 1.7);
        ctx.stroke();
        for (var ln = 0; ln < 3; ln++) {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.4, cy - r * 0.4 + ln * r * 0.45);
          ctx.lineTo(cx + r * 0.4, cy - r * 0.4 + ln * r * 0.45);
          ctx.stroke();
        }
        break;
      case 'jump':                          // a bolt
        ctx.moveTo(cx + r * 0.35, cy - r);
        ctx.lineTo(cx - r * 0.45, cy + r * 0.1);
        ctx.lineTo(cx + r * 0.05, cy + r * 0.1);
        ctx.lineTo(cx - r * 0.35, cy + r);
        ctx.lineTo(cx + r * 0.5, cy - r * 0.15);
        ctx.lineTo(cx, cy - r * 0.15);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'aim':                           // a reticle
        ctx.arc(cx, cy, r * 0.6, 0, K.TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r * 0.3, cy);
        ctx.moveTo(cx + r * 0.3, cy); ctx.lineTo(cx + r, cy);
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy - r * 0.3);
        ctx.moveTo(cx, cy + r * 0.3); ctx.lineTo(cx, cy + r);
        ctx.stroke();
        break;
      case 'node':                          // an orbit with a burn mark
        ctx.ellipse(cx, cy, r, r * 0.62, 0, 0, K.TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + r, cy, 2.2, 0, K.TAU);
        ctx.fill();
        break;
      default:
        ctx.rect(cx - r * 0.7, cy - r * 0.7, r * 1.4, r * 1.4);
        ctx.stroke();
    }
    ctx.restore();
  }

  /* Flight controls: the things you touch rather than read. Throttle, the
   * six burn directions as arrows pointing where they push, and the two
   * tanks. */
  function drawFlightControls(ctx, x, y, w, h) {
    var s = G.ship;
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(x, y + 2, w, h - 4);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 4, w - 4, h - 8);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(x + 4, y + 6, w - 8, 19);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('FLIGHT', x + 10, y + 20);
    ctx.restore();

    // Burn rose. Arrows, never words: "prograde" is true from any angle
    // and "left" is not.
    var cx = x + 62, cy = y + 84, R = 40;
    var a = G.activeThrust || {};
    var dirs = [
      { key: 'pro',    dx: 1,  dy: 0,  tag: 'PRO' },
      { key: 'ret',    dx: -1, dy: 0,  tag: 'RET' },
      { key: 'rout',   dx: 0,  dy: -1, tag: 'R+' },
      { key: 'rin',    dx: 0,  dy: 1,  tag: 'R-' },
      { key: 'nplus',  dx: 0.72, dy: -0.72, tag: 'N+' },
      { key: 'nminus', dx: -0.72, dy: 0.72, tag: 'N-' }
    ];
    ctx.save();
    ctx.strokeStyle = 'rgba(74,151,176,0.3)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, K.TAU); ctx.stroke();
    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i], on = !!a[d.key];
      Render.drawArrow(ctx, cx + d.dx * 11, cy + d.dy * 11, d.dx, d.dy, R - 13,
                       on ? '#7dfaff' : 'rgba(120,170,200,0.40)', on ? 2.4 : 1.2, on ? 8 : 6);
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = on ? '#7dfaff' : 'rgba(140,175,200,0.6)';
      var tw = ctx.measureText(d.tag).width;
      ctx.fillText(d.tag, cx + d.dx * (R + 12) - tw / 2, cy + d.dy * (R + 12) + 3.5);
    }
    ctx.restore();

    // Throttle and the two tanks.
    var bx = x + 120, bw = w - 132;
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';

    ctx.fillStyle = MFD_DIM;
    ctx.fillText('throttle  ' + Math.round((s.throttle || 0) * 100) + '%', bx, y + 46);
    bar(bx, y + 50, (s.throttle || 0), '#7dfaff');

    ctx.fillStyle = MFD_DIM;
    ctx.fillText('jump fuel  ' + s.fuel.toFixed(1) + ' t   ·   ' +
                 fmtLy(Galaxy.maxRange(s)), bx, y + 76);
    bar(bx, y + 80, s.fuel / s.fuelCap, s.fuel / s.fuelCap < 0.2 ? '#ff7a7a' : '#6ef0c0');

    var endur = Sim.thrusterEndurance(s);
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('thrusters  ' + s.thrusterFuel.toFixed(1) + ' t   ·   ' +
                 fmtTime(endur) + ' burn', bx, y + 106);
    bar(bx, y + 110, s.thrusterFuel / s.thrusterCap,
        s.thrusterFuel / s.thrusterCap < 0.15 ? '#ff7a7a' : '#9fd4ff');

    ctx.fillStyle = MFD_DIM;
    ctx.fillText('hold  ' + Sim.cargoMass(s).toFixed(0) + ' / ' + s.cargoCap + ' t', bx, y + 136);
    bar(bx, y + 140, Sim.cargoMass(s) / s.cargoCap, '#ffd36b');

    /* Credits on the left, acceleration on the right — but only if the two
     * will not meet in the middle. Narrow the window and they overlap into
     * an unreadable smear, so the accel figure is the one that goes. */
    ctx.fillStyle = MFD_HOT;
    ctx.font = '11px ui-monospace, monospace';
    var money = fmtCredits(s.credits);
    ctx.fillText(money, bx, y + 164);
    var accel = (s.maxAccel * 1000).toFixed(2) + ' m/s²';
    ctx.font = '10px ui-monospace, monospace';
    if (ctx.measureText(money).width * 1.1 + ctx.measureText(accel).width + 16 < bw) {
      ctx.fillStyle = MFD_DIM;
      ctx.textAlign = 'right';
      ctx.fillText(accel, bx + bw, y + 164);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    function bar(bxx, byy, frac, color) {
      ctx.fillStyle = 'rgba(74,151,176,0.22)';
      ctx.fillRect(bxx, byy, bw, 6);
      ctx.fillStyle = color;
      ctx.fillRect(bxx, byy, bw * Math.max(0, Math.min(1, frac)), 6);
      ctx.strokeStyle = 'rgba(74,151,176,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bxx, byy, bw, 6);
    }
  }

  /* The right-hand column: where you are, what is happening, and whatever
   * the ship most needs to tell you right now. */
  function drawStatusColumn(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(x, y + 2, w, h - 4);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 4, w - 4, h - 8);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(x + 4, y + 6, w - 8, 19);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('STATUS', x + 10, y + 20);

    var oe = (G.ship.landed || G.ship.docked) ? null : Sim.oscElements(G.ship, G.sys, G.t);
    var line = 0;
    function row(label, value, color) {
      var yy = y + 44 + line * 15;
      if (yy > y + h - 14) return;
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(label, x + 10, yy);
      ctx.fillStyle = color || MFD_INK;
      ctx.textAlign = 'right';
      ctx.fillText(value, x + w - 10, yy);
      ctx.textAlign = 'left';
      line++;
    }

    row('system', G.sys.name, MFD_HOT);
    row('epoch', fmtEpoch(G.t));
    row('warp', G.paused ? 'PAUSED' : WARPS[G.warpIndex] + '×',
        G.paused || G.physicsLimited ? '#ffb86b' : null);

    /* The warrant goes near the top, not at the bottom with the other
     * fighting numbers. `row` silently drops anything past the bottom of
     * the column, and the line that says police will shoot you on sight is
     * the last one that should lose that race — it was losing it whenever
     * you were locked on, shielded and carrying missiles, which is exactly
     * the state a wanted pilot is in. */
    var owedNow = Combat.bountyTotal(G);
    if (owedNow > 0) row('WANTED', Math.round(owedNow) + ' cr', '#ff5a5a');
    if (G.cruise) {
      row('CRUISE', fmtSpeed(G.cruise.speed), '#b4f0ff');
    } else if (G.ship.docked) {
      var st = G.sys.byId[G.ship.docked];
      row('docked', clipText(st.name, 16), '#7dffb0');
    } else if (oe) {
      row('re', oe.body.name);
      row('altitude', fmtDist(oe.altitude));
      row('speed', fmtSpeed(oe.relSpeed));
    } else if (G.ship.landed) {
      row('on', G.ship.landedOn ? G.ship.landedOn.name : '—',
          G.ship.crashed ? '#ff7a7a' : null);
    }
    if (G.autodock) {
      row(G.autodock.mode === 'match' ? 'MATCHING'
        : G.autodock.mode === 'follow' ? 'FOLLOWING' : 'AUTODOCK',
          G.autodock.phase.toUpperCase(), '#7dffb0');
    }
    var nav = navTargetState();
    if (nav) row('target', clipText(nav.name, 16), MFD_HOT);

    /* The fighting numbers. Hull always — it is the one that ends you —
     * the rest only when they exist to report. */
    var hullFrac = G.ship.hullHp / G.ship.hullMax;
    row('hull', Math.max(0, Math.round(G.ship.hullHp)) + ' / ' + G.ship.hullMax,
        hullFrac < 0.25 ? '#ff5a5a' : hullFrac < 0.6 ? '#ffb86b' : '#7dffb0');
    if (G.ship.shield) {
      row('shield', Math.round(G.ship.shieldHp) + ' / ' + Combat.MODULES.shield.cap,
          G.ship.shieldHp > 5 ? '#7dfaff' : '#ffb86b');
    }
    /* Gear, but only when it is DOWN. An indicator that is always lit is
     * wallpaper; one that appears only in the state you might have
     * forgotten about is a reminder. Amber rather than green on purpose —
     * gear down in flight is a configuration you are meant to notice and
     * undo, not a healthy resting state. */
    if (G.ship.gear && !G.ship.docked && !G.ship.landed) {
      row('GEAR', 'DOWN', '#ffb86b');
    }

    /* Which way the thrust keys push, and whether anything is helping.
     * Always shown while flying: getting this wrong is the difference
     * between arriving and drifting past, and it is not visible anywhere
     * else on the panel. */
    if (!G.ship.docked && !G.ship.landed) {
      var shipFrame = G.flightMode === 'ship';
      row('FRAME', shipFrame ? 'SHIP' : 'ORBITAL', shipFrame ? '#7dffb0' : '#7dfaff');
      if (shipFrame) {
        /* Three states, not two: off, armed but out of range, and actually
         * doing something. The middle one matters — an assist that says
         * "ON" while sitting idle at long range teaches the player it is
         * broken. */
        var live = !!assistRefVelocity();
        var lock = G.dockTarget || navTargetState();
        row('ASSIST', !G.assist ? 'OFF'
                    : live ? 'ACTIVE'
                    : lock ? 'standby >' + ASSIST_RANGE + ' km'
                    : 'no lock',
            !G.assist ? '#7e93b3' : live ? '#7dffb0' : '#ffb86b');
      }
    }

    /* Clearance, shown only while you actually have somewhere to dock —
     * it is a fact about an approach, not a permanent readout. Amber for
     * "you have not asked yet" rather than red: arriving uncleared is a
     * fine, not a wall, and the colour should not claim otherwise. */
    if (G.dockTarget && !G.ship.docked) {
      var ok = Combat.isCleared(G, G.dockTarget);
      row('CLEARANCE', ok ? 'GRANTED' : 'NOT REQUESTED',
          ok ? '#7dffb0' : '#ffb86b');
    }
    if (G.ship.missiles > 0) row('missiles', G.ship.missiles + '  (B fires)');
    /* FUGITIVE outranks the bounty line and sits above it. A bounty is a
     * number that is slowly getting worse; this is a thing happening to
     * you right now, and it should read that way. */
    if (G.fugitive) {
      row('FUGITIVE', G.fugitive.faction.toUpperCase() + '  ' +
          Math.round(G.fugitive.amount) + ' cr', '#ff5a5a');
    }
    ctx.restore();
  }

  /* --- AUTO: cruise and auto-dock ---------------------------------------- */
  function drawAutoPage(ctx) {
    mfdShell(ctx, 'AUTOPILOT', 'Z cruise    T clamp then T again to dock    any burn cancels');
    var y = MFD_BODY_TOP + 16;
    var nav = navTargetState();

    if (G.cruise) {
      mfdRow(ctx, y, 'mode', 'CRUISE ENGAGED', '#b4f0ff');
      mfdRow(ctx, y + 16, 'speed', fmtSpeed(G.cruise.speed));
      mfdRow(ctx, y + 32, 'limit', fmtSpeed(G.cruise.maxSpeed) + '  (mass lock)');
      mfdRow(ctx, y + 48, 'burn rate', G.cruise.rate.toFixed(3) + ' t / Mkm');
      mfdRow(ctx, y + 64, 'nearest', G.cruise.lockBody ? G.cruise.lockBody.name : '—');
      mfdRow(ctx, y + 80, 'target', nav ? clipText(nav.name, 22) : 'none', MFD_HOT);
      if (nav) mfdRow(ctx, y + 96, 'range', fmtDist(nav.range));
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(', and . set speed   ·   Z disengages', 10, MFD_BODY_BOTTOM - 2);
      return;
    }

    if (G.autodock) {
      var adMode = G.autodock.mode === 'match' ? 'MATCH ORBIT'
                 : G.autodock.mode === 'follow' ? 'FOLLOW' : 'AUTO-DOCK';
      mfdRow(ctx, y, 'mode', adMode, '#7dffb0');
      mfdRow(ctx, y + 16, 'phase', G.autodock.phase);
      mfdRow(ctx, y + 32, G.autodock.mode === 'dock' ? 'station' : 'contact',
             clipText(G.autodock.target.name || '—', 22), MFD_HOT);
      /* Match and follow have no docking status to report — they are not
       * going to a port — so they report the thing they are actually
       * controlling: how fast the gap is changing. */
      if (G.autodock.mode !== 'dock') {
        var tgt = autoTargetState(G.autodock);
        if (tgt) {
          mfdRow(ctx, y + 48, 'range', fmtDist(V.dist(tgt.pos, G.ship.pos)));
          mfdRow(ctx, y + 64, 'rel. speed', fmtSpeed(V.len(V.sub(G.ship.vel, tgt.vel))));
        }
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = MFD_DIM;
        ctx.fillText('any manual burn hands it back', 10, MFD_BODY_BOTTOM - 2);
        return;
      }
      var ds = G.dockStatus;
      if (ds) {
        mfdRow(ctx, y + 48, 'range', fmtDist(ds.range));
        mfdRow(ctx, y + 64, 'closing', fmtSpeed(ds.closingSpeed));
        mfdRow(ctx, y + 80, 'rel. speed', fmtSpeed(ds.relSpeed),
               ds.slowEnough ? '#7dffb0' : '#ffb86b');
      }
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('A or any manual control cancels', 10, MFD_BODY_BOTTOM - 2);
      return;
    }

    mfdRow(ctx, y, 'mode', 'MANUAL', MFD_DIM);
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('Z    engage cruise drive — crosses a', 10, y + 22);
    ctx.fillText('     whole system in minutes', 10, y + 35);
    ctx.fillText('T    clamp, then T again to dock', 10, y + 55);
    ctx.fillText('     (it will cruise the long leg itself)', 10, y + 68);
    ctx.fillText('Shift+T  match orbit    Shift+L  follow', 10, y + 85);
    ctx.fillStyle = nav ? MFD_INK : '#ff8a76';
    ctx.fillText(nav ? ('locked: ' + clipText(nav.name, 26))
                     : 'no lock — [ ] to pick a destination', 10, y + 103);

    var lock = cruiseLock();
    ctx.fillStyle = lock.can ? '#7dffb0' : '#ffb86b';
    ctx.fillText(lock.can ? 'cruise drive ready'
                          : 'mass locked by ' + lock.body.name, 10, y + 119);
  }

  /* --- NODE: the manoeuvre plan -----------------------------------------
   * The three delta-v components, the two orbits (before and after), and
   * the cost. The last of those is the point: a plan that reads 4.2 km/s is
   * not obviously impossible, but one that reads "11.4 t of 12 t" is, and
   * the ship carries only so much reaction mass. */
  function drawNodePage(ctx) {
    mfdShell(ctx, 'MANOEUVRE', 'I place / cycle    − =  adjust    ; peri  \' apo    \\ fly');
    var y = MFD_BODY_TOP + 14;

    if (!G.node) {
      mfdRow(ctx, y, 'plan', 'NONE', MFD_DIM);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('I    place a node at the next apoapsis', 10, y + 26);
      ctx.fillText('I    again cycles pro / nor / rad / time', 10, y + 40);
      ctx.fillText('− =  adjust  (shift fine, ctrl coarse)', 10, y + 54);
      ctx.fillText('; \'  snap to periapsis / apoapsis', 10, y + 68);
      ctx.fillText('\\    fly it   ·   shift-I clears', 10, y + 82);
      ctx.fillStyle = MFD_HOT;
      ctx.fillText('hold LEFT ALT to drag the handles', 10, y + 104);
      return;
    }

    var plan = G.nodePlan;
    if (!plan) { mfdRow(ctx, y, 'plan', 'computing…', MFD_DIM); return; }

    var sel = NODE_AXES[G.nodeAxis].id;
    var d = G.node.dv;
    mfdRow(ctx, y, 'prograde', fmtSpeed(d.pro), sel === 'pro' ? MFD_HOT : MFD_INK);
    mfdRow(ctx, y + 15, 'normal', fmtSpeed(d.nor), sel === 'nor' ? MFD_HOT : MFD_INK);
    mfdRow(ctx, y + 30, 'radial', fmtSpeed(d.rad), sel === 'rad' ? MFD_HOT : MFD_INK);
    mfdRow(ctx, y + 45, 'total Δv', fmtSpeed(plan.magnitude), '#ffb347');
    mfdRow(ctx, y + 60, 'in', fmtTime(Math.max(0, plan.eta)),
           sel === 'time' ? MFD_HOT : MFD_INK);

    /* Burn time and propellant, side by side with the delta-v, because the
     * three are one decision. An infeasible plan is coloured, not hidden —
     * you are allowed to draw a burn you cannot afford, you just cannot
     * fly it. */
    var okColor = plan.burn.feasible ? '#7dffb0' : '#ff8a76';
    mfdRow(ctx, y + 78, 'burn time', fmtTime(plan.burn.duration), okColor);
    mfdRow(ctx, y + 93, 'propellant',
           plan.burn.fuel.toFixed(3) + ' / ' + G.ship.thrusterFuel.toFixed(2) + ' t', okColor);
    mfdRow(ctx, y + 108, 'ignition', 'T−' + fmtTime(Math.max(0, plan.countdown)), okColor);

    // What it does to the orbit — the answer the whole feature exists for.
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('about ' + clipText(plan.body.name, 16), 10, y + 128);
    ctx.fillStyle = MFD_INK;
    ctx.fillText('peri ' + fmtDist(plan.before.periAlt) + '  →  '
                 + fmtDist(plan.after.periAlt), 10, y + 141);
    ctx.fillText('apo  ' + (isFinite(plan.before.apoAlt) ? fmtDist(plan.before.apoAlt) : 'escape')
                 + '  →  '
                 + (isFinite(plan.after.apoAlt) ? fmtDist(plan.after.apoAlt) : 'ESCAPE'),
                 10, y + 154);

    if (G.nodeBurn) {
      ctx.fillStyle = '#ffd27a';
      ctx.fillText(G.nodeBurn.phase === 'align'
        ? 'AUTOPILOT ARMED — holding attitude'
        : 'BURNING — ' + fmtSpeed(G.nodeBurn.remaining) + ' remaining',
        10, MFD_BODY_BOTTOM - 2);
    }
  }

  /* --- NAV: the target list ---------------------------------------------
   * Everything in the system, nearest first, with the lock highlighted.
   * The list scrolls to keep the lock in view rather than making you hunt
   * for where the cursor went. */
  function drawNavPage(ctx) {
    mfdShell(ctx, 'NAVIGATION', '[ ] cycle target    L release    T assign dock clamp');
    var list = navList();
    var rows = 8, rowH = 14;
    var sel = -1;
    if (G.navTarget) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].kind === G.navTarget.kind && list[i].id === G.navTarget.id) { sel = i; break; }
      }
    }
    var top = 0;
    if (sel >= 0) top = Math.max(0, Math.min(list.length - rows, sel - Math.floor(rows / 2)));

    ctx.font = '11px ui-monospace, monospace';
    for (var r = 0; r < rows; r++) {
      var idx = top + r;
      if (idx >= list.length) break;
      var e = list[idx];
      var y = MFD_BODY_TOP + 12 + r * rowH;
      if (idx === sel) {
        ctx.fillStyle = 'rgba(255,211,107,0.20)';
        ctx.fillRect(6, y - 10, MFD_W - 12, rowH);
        ctx.fillStyle = MFD_HOT;
        ctx.fillText('>', 8, y);
      }
      ctx.fillStyle = e.hostile ? '#ff8a76' : (idx === sel ? MFD_HOT : e.color);
      ctx.fillText(navMark(e), 18, y);
      ctx.fillStyle = idx === sel ? MFD_HOT : MFD_INK;
      ctx.fillText(clipText(e.name, 20), 30, y);
      ctx.fillStyle = idx === sel ? MFD_HOT : MFD_DIM;
      ctx.textAlign = 'right';
      ctx.fillText(fmtDist(e.range), MFD_W - 10, y);
      ctx.textAlign = 'left';
    }
    if (list.length > rows) {
      ctx.fillStyle = MFD_DIM;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText((top + 1) + '-' + Math.min(list.length, top + rows) + ' of ' + list.length,
                   10, MFD_BODY_BOTTOM - 2);
    }
  }

  /* --- SYSTEM: where you are --------------------------------------------- */
  function drawSystemPage(ctx) {
    mfdShell(ctx, 'SYSTEM', 'where you are');
    var sys = G.sys;
    var planets = sys.bodies.filter(function (b) { return b.kind === 'planet'; }).length;
    var moons = sys.bodies.filter(function (b) { return b.kind === 'moon'; }).length;
    var y = MFD_BODY_TOP + 14;
    mfdRow(ctx, y, 'star', sys.name + ' (' + sys.root.type + ')', MFD_HOT);
    mfdRow(ctx, y + 16, 'luminosity', sys.root.luminosity.toFixed(2) + ' L☉');
    mfdRow(ctx, y + 32, 'worlds', planets + ' planets, ' + moons + ' moons');
    mfdRow(ctx, y + 48, 'habitable', String(sys.bodies.filter(function (b) { return b.habitable; }).length));
    mfdRow(ctx, y + 64, 'ports', String((sys.ports || []).length));
    mfdRow(ctx, y + 80, 'traffic', (sys.traffic || []).length + ' runs, ' +
                                   (sys.patrols || []).length + ' patrols');
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('flags: ' + clipText((sys.factions || []).map(function (f) {
      return f.name;
    }).join(', ') || '—', 34), 10, y + 100);
  }

  /* --- CHART: where you could go ----------------------------------------- */
  function drawChartPage(ctx) {
    mfdShell(ctx, 'CHART', 'J opens the full slipspace chart');
    var y = MFD_BODY_TOP + 14;
    mfdRow(ctx, y, 'here', G.here.name, MFD_HOT);
    mfdRow(ctx, y + 16, 'jump fuel', G.ship.fuel.toFixed(1) + ' / ' + G.ship.fuelCap + ' t');
    mfdRow(ctx, y + 32, 'reach', fmtLy(Galaxy.maxRange(G.ship)));

    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('NEAREST REACHABLE', 10, y + 54);

    var reach = Galaxy.reachable(G.galaxy, G.here, G.ship).slice(0, 4);
    if (!reach.length) {
      ctx.fillStyle = '#ff8a76';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText('nothing in range — refuel', 10, y + 72);
      return;
    }
    ctx.font = '11px ui-monospace, monospace';
    for (var i = 0; i < reach.length; i++) {
      var yy = y + 68 + i * 14;      // must finish above MFD_BODY_BOTTOM
      var plan = Galaxy.jumpPlan(G.galaxy, G.here, reach[i].star, G.ship);
      ctx.fillStyle = G.visited[reach[i].star.id] ? MFD_INK : MFD_DIM;
      ctx.fillText(clipText(reach[i].star.name, 16), 10, yy);
      ctx.textAlign = 'right';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(fmtLy(plan.distance) + '  ' + plan.fuel.toFixed(1) + 't', MFD_W - 10, yy);
      ctx.textAlign = 'left';
    }
  }

  /* --- TARGET: everything about the lock --------------------------------- */
  function drawTargetPage(ctx) {
    var nav = navTargetState();
    mfdShell(ctx, 'TARGET', nav ? '[ ] cycle    L release    T clamp / auto-dock'
                                : '[ ] to lock something');
    if (!nav) {
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('NO LOCK', 10, MFD_BODY_TOP + 24);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('[ and ] step through everything', 10, MFD_BODY_TOP + 44);
      ctx.fillText('in the system, nearest first.', 10, MFD_BODY_TOP + 58);
      return;
    }
    var y = MFD_BODY_TOP + 14;
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = nav.hostile ? '#ff8a76' : MFD_HOT;
    ctx.fillText(clipText(nav.name, 24), 10, y);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    /* The registration beside the class — the code you would quote to
     * traffic control, or read off a wreck. */
    var navReg = nav.obj && nav.obj.reg ? '   ·   ' + nav.obj.reg : '';
    ctx.fillText(nav.type + navReg, 10, y + 13);

    mfdRow(ctx, y + 32, 'range', fmtDist(nav.range));
    mfdRow(ctx, y + 48, 'closing', fmtSpeed(nav.closing),
           nav.closing > 0 ? '#7dffb0' : '#ff9f7a');
    mfdRow(ctx, y + 64, 'rel. speed', fmtSpeed(nav.relSpeed));
    mfdRow(ctx, y + 80, 'ETA', isFinite(nav.eta) ? fmtTime(nav.eta) : 'opening', MFD_DIM);

    if (nav.kind === 'body' && nav.obj.kind === 'station') {
      var mkt = nav.obj.market;
      mfdRow(ctx, y + 96, 'port', mkt ? mkt.roleName : 'Station');
      var fac = G.sys.factionById && G.sys.factionById[nav.obj.faction];
      mfdRow(ctx, y + 112, 'flag', fac ? clipText(fac.name, 18) : '—',
             fac ? fac.color : MFD_DIM);
    } else if (nav.kind === 'ship') {
      var fac2 = G.sys.factionById && G.sys.factionById[nav.obj.faction];
      mfdRow(ctx, y + 96, 'flag', fac2 ? clipText(fac2.name, 18) : 'Unaligned',
             fac2 ? fac2.color : '#ff8a76');
      var man = nav.obj.manifest || [];
      mfdRow(ctx, y + 112, 'carrying', man.length
        ? clipText(man.map(function (m) { return Eco.BY_ID[m.cid].name; }).join(', '), 18)
        : '—', MFD_DIM);
    } else {
      mfdRow(ctx, y + 96, 'radius', fmtDist(nav.obj.radius));
      mfdRow(ctx, y + 112, 'gravity',
        fmtSpeed(nav.obj.mu / (nav.obj.radius * nav.obj.radius)) + '²');
    }
  }

  /* --- SHIP: the two tanks, the hold, and the money ---------------------- */
  function drawShipPage(ctx) {
    mfdShell(ctx, 'SHIP', G.ship.docked ? 'M trade    F refuel    U undock'
                                        : 'T dock    J chart    Z cruise');
    var s = G.ship;
    var cargo = Sim.cargoMass(s);
    var y = MFD_BODY_TOP + 14;

    mfdRow(ctx, y, 'credits', fmtCredits(s.credits), MFD_HOT);

    mfdLabelled(ctx, y + 20, 'jump fuel  ' + s.fuel.toFixed(1) + ' / ' + s.fuelCap + ' t',
                fmtLy(Galaxy.maxRange(s)), MFD_INK);
    mfdBar(ctx, y + 25, s.fuel / s.fuelCap, s.fuel / s.fuelCap < 0.2 ? '#ff7a7a' : '#6ef0c0');

    /* Reaction mass is shown as HOURS, not as a fraction. A tank that is
     * good for nine hours of continuous burn is not a resource you ration
     * by percentage — the only question you ever ask of it is whether you
     * have enough left to finish what you are doing. */
    var endur = Sim.thrusterEndurance(s);
    mfdLabelled(ctx, y + 50, 'thrusters  ' + s.thrusterFuel.toFixed(1) + ' / ' + s.thrusterCap + ' t',
                fmtTime(endur) + ' burn', endur < 1800 ? '#ffb86b' : MFD_INK);
    mfdBar(ctx, y + 55, s.thrusterFuel / s.thrusterCap,
           s.thrusterFuel / s.thrusterCap < 0.15 ? '#ff7a7a' : '#9fd4ff');

    mfdLabelled(ctx, y + 80, 'hold  ' + cargo.toFixed(0) + ' / ' + s.cargoCap + ' t',
                (s.cargoCap - cargo).toFixed(0) + ' t free', MFD_INK);
    mfdBar(ctx, y + 85, cargo / s.cargoCap, '#ffd36b');

    /* One line, not two. The soft-key strip starts at 154 and a page that
     * writes past MFD_BODY_BOTTOM draws its last row straight through it —
     * invisible at dashboard size, obvious the moment a screen showed the
     * page at full scale. */
    mfdRow(ctx, y + 108, 'mass / accel',
           Sim.shipMass(s).toFixed(0) + ' t   ·   ' +
           (s.maxAccel * 1000).toFixed(2) + ' m/s²',
           s.fuelOut ? '#ff7a7a' : MFD_INK);
  }

  /* --- CARGO: the manifest, priced where you are ------------------------- */
  function drawCargoPage(ctx) {
    mfdShell(ctx, 'CARGO', G.ship.docked ? 'M to open the market'
                                         : 'dock at a port to trade');
    var s = G.ship;
    var ids = Object.keys(s.cargo).filter(function (c) { return s.cargo[c] > 0; });
    var port = s.docked ? G.sys.byId[s.docked] : null;
    var y = MFD_BODY_TOP + 14;

    if (!ids.length) {
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('HOLD EMPTY', 10, y + 10);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(s.cargoCap + ' tonnes available', 10, y + 30);
      return;
    }
    ids.sort(function (a, b) { return s.cargo[b] - s.cargo[a]; });
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText(port ? 'VALUE HERE' : 'ABOARD', MFD_W - 74, y - 2);

    var total = 0;
    ctx.font = '11px ui-monospace, monospace';
    for (var i = 0; i < Math.min(ids.length, 7); i++) {
      var cid = ids[i], yy = y + 14 + i * 15;
      var tn = s.cargo[cid];
      ctx.fillStyle = cid === 'waste' ? '#ffb86b' : MFD_INK;
      ctx.fillText(clipText(Eco.BY_ID[cid].name, 18), 10, yy);
      var worth = null;
      if (port) {
        var q = Eco.price(port, cid, G.t);
        if (q && q.sell !== null) { worth = q.sell * tn; total += worth; }
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(tn.toFixed(0) + 't' + (worth !== null ? '  ' + fmtCredits(worth) : ''),
                   MFD_W - 10, yy);
      ctx.textAlign = 'left';
    }
    if (port && total) {
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = MFD_HOT;
      ctx.textAlign = 'right';
      ctx.fillText('total  ' + fmtCredits(total), MFD_W - 10, MFD_BODY_BOTTOM - 2);
      ctx.textAlign = 'left';
    }
  }

  /* --- SCANNER: the FFE fishbowl ----------------------------------------
   * Frontier's scanner was not a flat radar circle, it was an ellipse seen
   * at an angle with a vertical stalk to every blip — a plan view with the
   * third dimension drawn in explicitly rather than projected away. It is
   * still the clearest way anyone has found to show relative position in
   * 3D on a 2D panel, so it is what this is. */
  function drawScannerPage(ctx) {
    mfdShell(ctx, 'SCANNER', '0.75 AU   ·   nose up   ·   stalks show height');
    var cx = MFD_W / 2, cy = MFD_BODY_TOP + 58, rx = 96, ry = 40;

    ctx.save();
    ctx.strokeStyle = 'rgba(74,151,176,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, K.TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(74,151,176,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.5, ry * 0.5, 0, 0, K.TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy); ctx.lineTo(cx + rx, cy);
    ctx.moveTo(cx, cy - ry); ctx.lineTo(cx, cy + ry);
    ctx.stroke();
    ctx.restore();

    function blip(pos, color, square, hostile) {
      var rel = Sim.relativeToShipFrame(G.ship, pos);
      if (rel.range > RADAR_RANGE || rel.range < 1e-6) return;
      var frac = Math.min(1, Math.hypot(rel.fwd, rel.right) / RADAR_RANGE);
      var px = cx + Math.sin(rel.azimuth) * frac * rx;
      var py = cy - Math.cos(rel.azimuth) * frac * ry;
      var stem = Math.sin(rel.elevation) * 34;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - stem); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      if (hostile) {
        ctx.strokeStyle = '#ff6b5a'; ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(px, py - stem - 4); ctx.lineTo(px + 4, py - stem);
        ctx.lineTo(px, py - stem + 4); ctx.lineTo(px - 4, py - stem);
        ctx.closePath(); ctx.stroke();
      } else if (square) {
        ctx.fillRect(px - 2, py - stem - 2, 4, 4);
      } else {
        ctx.beginPath(); ctx.arc(px, py - stem, 2.4, 0, K.TAU); ctx.fill();
      }
      return { x: px, y: py - stem };
    }

    var i;
    for (i = 0; i < G.sys.bodies.length; i++) {
      var b = G.sys.bodies[i];
      if (G.ship.docked && b.id === G.ship.docked) continue;
      blip(Sim.bodyPosition(b, G.sys, G.t), bodyDotColor(b.kind), false, false);
    }
    var ships = Sim.shipsAll(G.sys, G.t);
    for (i = 0; i < ships.length; i++) blip(ships[i].pos, ships[i].color, true, ships[i].hostile);

    // Ring the lock so you can see where it is on the bowl.
    var nav = navTargetState();
    if (nav) {
      var p = blip(nav.pos, MFD_HOT, nav.kind === 'ship', false);
      if (p) {
        ctx.strokeStyle = MFD_HOT; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, K.TAU); ctx.stroke();
      }
    }

    // Own ship, at the centre of its own bowl.
    ctx.fillStyle = MFD_INK;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5); ctx.lineTo(cx - 3.5, cy + 4); ctx.lineTo(cx + 3.5, cy + 4);
    ctx.closePath(); ctx.fill();

    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText(ships.length + ' ships', 10, MFD_BODY_BOTTOM - 2);
    if (nav) {
      ctx.fillStyle = MFD_HOT;
      ctx.textAlign = 'right';
      ctx.fillText(clipText(nav.name, 16) + ' ' + fmtDist(nav.range), MFD_W - 10, MFD_BODY_BOTTOM - 2);
      ctx.textAlign = 'left';
    }
  }

  /* --- ORBIT: the ellipse you are actually on ---------------------------- */
  function drawOrbitPage(ctx) {
    mfdShell(ctx, 'ORBIT', 'the ellipse you are actually on');
    var oe = (G.ship.landed || G.ship.docked) ? null : Sim.oscElements(G.ship, G.sys, G.t);
    if (!oe) {
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(G.ship.docked ? 'DOCKED' : 'ON SURFACE', 10, MFD_BODY_TOP + 24);
      return;
    }
    var y = MFD_BODY_TOP + 14;
    mfdRow(ctx, y, 'about', oe.body.name, MFD_HOT);
    mfdRow(ctx, y + 15, 'altitude', fmtDist(oe.altitude));
    mfdRow(ctx, y + 30, 'apoapsis', oe.closed ? fmtDist(oe.apoAlt) : 'ESCAPING',
           oe.closed ? MFD_INK : '#ffb86b');
    mfdRow(ctx, y + 45, 'periapsis', fmtDist(oe.periAlt), oe.periAlt < 0 ? '#ff7a7a' : MFD_INK);
    mfdRow(ctx, y + 60, 'ecc / inc', oe.e.toFixed(3) + ' / ' + (oe.inc / DEG).toFixed(1) + '°');
    mfdRow(ctx, y + 75, 'period', oe.closed ? fmtTime(oe.period) : '—');

    /* A sketch of the ellipse with the body at the focus and you on it.
     * Numbers tell you the shape; the picture tells you at a glance whether
     * you are about to graze the atmosphere. */
    if (!oe.closed || !isFinite(oe.a)) return;
    var cx = MFD_W / 2, cy = MFD_BODY_BOTTOM - 26;
    var a = oe.a, e = Math.min(oe.e, 0.95);
    var bAxis = a * Math.sqrt(1 - e * e);
    var scale = Math.min(58 / a, 20 / Math.max(bAxis, 1e-9));

    /* Drawn in the orbit's OWN plane, not projected from world space: the
     * question this picture answers is "what shape am I on and where am I
     * round it", and a foreshortened view of an inclined orbit answers that
     * worse than a clean side-on one. Periapsis is to the right, so the
     * ellipse centre sits a*e to the LEFT of the focus. */
    ctx.save();
    ctx.strokeStyle = 'rgba(120,240,190,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx - a * e * scale, cy, a * scale, bAxis * scale, 0, 0, K.TAU);
    ctx.stroke();

    // The body at the focus, to scale against its own orbit.
    ctx.fillStyle = oe.body.color;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.6, oe.body.radius * scale), 0, K.TAU);
    ctx.fill();

    /* Us, at our true anomaly. Recovered from the orbit equation rather
     * than carried around: r = a(1-e^2)/(1+e cos v), and the sign comes
     * from whether we are climbing or falling. */
    var rel = V.sub(G.ship.pos, Sim.bodyPosition(oe.body, G.sys, G.t));
    var vrel = V.sub(G.ship.vel, Sim.bodyVelocity(oe.body, G.sys, G.t));
    var r = V.len(rel);
    var nu;
    if (e < 1e-6) {
      nu = 0;
    } else {
      var cosNu = ((a * (1 - e * e) / r) - 1) / e;
      nu = Math.acos(Math.max(-1, Math.min(1, cosNu)));
      if (V.dot(rel, vrel) < 0) nu = -nu;   // falling toward periapsis
    }
    ctx.fillStyle = MFD_HOT;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(nu) * r * scale, cy - Math.sin(nu) * r * scale, 2.8, 0, K.TAU);
    ctx.fill();
    ctx.restore();
  }

  /* The full-screen mode bodies live in screens.js. */

  function drawBody(ctx, cam, item, starScreen) {
    var b = item.body, sp = item.sp, rpx = item.rpx;

    if (b.kind === 'station') {
      /* Same scale rule as everything else: real geometry once it would
       * actually resolve, a marker below that. A station is a couple of km
       * across in a system six billion km wide, so the marker is what you
       * see almost always — but the model is what you dock with, and what
       * tells you at a glance whether you are approaching a farm, a
       * refinery or a shipyard. */
      var labelCol = b.underground ? '#a9d6ff' : b.surface ? '#ffd9a8' : '#9ff0dc';
      if (rpx > 3.5) {
        var model = stationModelFor(b);
        /* A MODELLED STATION MAY TURN ONLY PART OF ITSELF. If the art
         * declared a `stationSpin` ring, the shell is drawn on a frame that
         * does not rotate and the ring on one that does — so a hub keeps
         * still and stays something you can aim a docking approach at.
         * Anything without that bucket, procedural ports included, spins as
         * one piece exactly as it always did. */
        var turns = Render.portSpins(model);
        var frame = stationFrame(b, turns);
        if (frame) {
          var sun = V.norm(V.sub(Sim.bodyPosition(G.sys.root, G.sys, G.t), item.pos));
          Render.drawStationModel(ctx, cam, frame, b.radius, sun, model, b.color);
          if (turns) {
            Render.drawPortPart(ctx, cam, stationFrame(b), b.radius, sun,
                                model, 'spin', b.color);
          }
          /* The town, the boards and the pad lighting. Held to a higher
           * threshold than the pad itself: the dressing is detail, and
           * detail smaller than a few pixels is cost without information. */
          if (b.surface && rpx > 14) {
            Render.drawPortDressing(ctx, cam, frame, b, b.radius, sun);
          }
          /* The lamps come in earlier than the rest of the dressing: a
           * ring of lights is the first thing you can read about a port on
           * approach, and whether it is red is the thing you most want to
           * know before you have committed to the descent. */
          if (b.surface && rpx > 5) {
            /* Wall clock, not G.t: the lamps are a light bulb on a timer in
             * the world, not something the simulation drives. Feeding sim
             * time in means the blink rate rides the time warp and turns
             * into a strobe blur the moment you speed up. */
            Render.drawPortLamps(ctx, cam, frame, b, b.radius, sun,
                                 Combat.isCleared(G, b), nowSeconds());
          }
          /* The doors, at whatever point of their travel they have reached.
           * Drawn at the same threshold as the lamps: the lamps tell you
           * the port has said yes, and the doors are that answer made
           * physical — showing one without the other is a port that agrees
           * to take you and stays sealed. */
          if (b.surface && rpx > 5) {
            Render.drawPortDoors(ctx, cam, frame, b, b.radius, sun, doorPhase(b));
          }
          queueLabel(sp, b.name, labelCol, rpx + 8, 4 + rpx);
          return;
        }
      }
      ctx.save();
      ctx.strokeStyle = b.underground ? '#7fb8ff' : b.surface ? '#ffb877' : '#7fd6c0';
      ctx.fillStyle = b.underground ? '#cfe8ff' : b.surface ? '#ffe9cc' : '#d8fff4';
      ctx.lineWidth = 1.2;
      var s = Math.max(3.2, Math.min(9, rpx * 3));
      ctx.beginPath();
      if (b.surface) {
        // A pad reads as a square on the ground, not as a diamond in space.
        // An underground mouth is the same square with a dark centre, so
        // even at marker size it doesn't read as just another open pad.
        ctx.rect(sp.x - s * 0.8, sp.y - s * 0.8, s * 1.6, s * 1.6);
      } else {
        ctx.moveTo(sp.x, sp.y - s); ctx.lineTo(sp.x + s, sp.y);
        ctx.lineTo(sp.x, sp.y + s); ctx.lineTo(sp.x - s, sp.y);
        ctx.closePath();
      }
      ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.fill();
      if (b.underground) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#04070c';
        ctx.beginPath(); ctx.arc(sp.x, sp.y, s * 0.4, 0, K.TAU); ctx.fill();
      }
      ctx.restore();
      queueLabel(sp, b.name, labelCol, s + 6, 2 + Math.min(6, s));
      return;
    }

    /* A world you are INSIDE is not drawn at all — see the matching
     * discard in the GL planet shader. Underground in a starport the eye
     * is a few hundred metres below the surface, and a sphere shaded from
     * inside is a grey slab across the whole screen with the hangar,
     * the ship and the shaft all hidden behind it. What you should see
     * down there is the room you are in and daylight up the shaft. */
    if (cam.eye && V.dist(cam.eye, item.pos) < b.radius) return;

    if (rpx < 2.4) {
      // Sub-pixel body: draw a marker ring so it is still findable, and a
      // dropline so you can see it sits above or below the ecliptic.
      if (b.kind === 'star') {
        // Never let the light source of the system degrade to a grey speck.
        var sg = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 14);
        sg.addColorStop(0, 'rgba(255,240,200,0.85)');
        sg.addColorStop(0.3, 'rgba(255,215,150,0.35)');
        sg.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 14, 0, K.TAU); ctx.fill();
        ctx.fillStyle = '#fff6e0';
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.4, 0, K.TAU); ctx.fill();
        queueLabel(sp, b.name, '#ffe6a8', 10, 100);
        return;
      }
      Render.drawDropline(ctx, cam, item.pos, '#3d5878', G.cam.target.z, G.cam.dist * 1.2);
      ctx.save();
      ctx.strokeStyle = b.color; ctx.globalAlpha = 0.85; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 4.5, 0, K.TAU); ctx.stroke();
      ctx.fillStyle = b.color; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.6, 0, K.TAU); ctx.fill();
      ctx.restore();
      queueLabel(sp, b.name, '#9fb6d4', 8,
                 (b.kind === 'planet' ? 6 : b.kind === 'star' ? 40 : 1));
      return;
    }

    if (b.kind === 'star') {
      // Corona.
      var glow = ctx.createRadialGradient(sp.x, sp.y, rpx * 0.9, sp.x, sp.y, rpx * 5);
      glow.addColorStop(0, 'rgba(255,220,150,0.45)');
      glow.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, rpx * 5, 0, K.TAU); ctx.fill();
    }

    Render.drawDropline(ctx, cam, item.pos, '#3d5878', G.cam.target.z, G.cam.dist * 1.2);

    /* The one place the world layer takes over from the 2D renderer. The
     * body's screen position and radius were computed by the SAME camera
     * call the rest of this function uses, so the GPU disc and the label
     * pinned beside it cannot disagree. */
    var drewOnGpu = false;
    if (glLive() && _starPos) {
      var toStar = V.sub(_starPos, item.pos);
      var dlen = V.len(toStar);
      /* A body sitting on top of the star has no meaningful sun direction;
       * light it from the camera rather than dividing by zero. */
      var sunDir = dlen > 1e-9 ? V.scale(toStar, 1 / dlen) : V.scale(cam.f, -1);
      drewOnGpu = global.GLWorld.queueBody(b, sp, rpx, cam, sunDir, G.t, item.pos);
    }
    if (!drewOnGpu) Render.shadeBody(ctx, sp, rpx, b, starScreen);

    if (b.habitable) {
      ctx.save();
      ctx.strokeStyle = '#7dffb0'; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, rpx + 5, 0, K.TAU); ctx.stroke();
      ctx.restore();
    }
    queueLabel(sp, b.name, b.kind === 'star' ? '#ffe6a8' : '#c7d8ee', rpx + 6,
               rpx + (b.kind === 'star' ? 60 : b.kind === 'planet' ? 12 : 0));
  }

  /* How far this port's doors have actually travelled, 0 shut to 1 open.
   *
   * Combat.doorsOpen says where they SHOULD be; this eases toward it so
   * they slide rather than teleport. Real seconds, not sim time — a door
   * takes as long to open at 10,000x warp as it does at 1x, because it is
   * a machine in the world and not part of the orbit solution. Twelve
   * seconds end to end: long enough to watch, short enough to wait for.
   *
   * The phase lives on the port object rather than in G, so it neither
   * saves nor needs to: a door caught halfway when you quit is a door that
   * should be wherever your clearance says it is when you come back. */
  var DOOR_SECONDS = 12;

  function doorPhase(port) {
    var want = Combat.doorsOpen(G, port) ? 1 : 0;
    var now = nowSeconds();
    var st = port._door;
    if (!st) { st = port._door = { at: want, t: now }; return want; }
    var step = Math.min(1, Math.max(0, (now - st.t))) / DOOR_SECONDS;
    st.t = now;
    if (st.at < want) st.at = Math.min(want, st.at + step);
    else if (st.at > want) st.at = Math.max(want, st.at - step);
    return st.at;
  }

  /* Which model a port wears. The rule moved to Render.portModelFor, because
   * it now decides which imported model's DIMENSIONS bayGeometry reads as
   * well as which mesh gets drawn — and a copy of it here would eventually
   * draw one shed while parking ships in the shape of another. This is the
   * name the rest of this file already calls. */
  function stationModelFor(station) {
    return Render.portModelFor(station);
  }

  /* Stations carry no attitude in the simulation — nothing needs one, so
   * nothing stores one. For drawing we derive a frame the same way docking
   * does: from the station's own orbital basis, which is stable, needs no
   * state, and is a pure function of t like everything else.
   *
   * Then it spins. A ring habitat that did not turn would be a ring
   * habitat with no gravity in it, and the rotation is just an angle in t —
   * so it costs nothing and stays exact across a warp jump. Surface ports
   * do not spin: they are bolted down, and their frame comes from local
   * vertical instead. */
  /* Fraction of pad radius the whole bay model stands proud of the ground.
   * Read from the shared bay table rather than kept here, because the
   * simulation adds the same lift when it stands a ship in a berth — the
   * two disagreeing by even a few tens of metres is a ship sunk into its
   * own hangar floor. */
  var PAD_GROUND_LIFT = (Gen && Gen.bayGeometry)
    ? Gen.bayGeometry({ radius: 1, shaftDepth: 1 }).lift : 0.04;

  /* `still` asks for the frame WITHOUT the spin applied.
   *
   * The procedural stations turn by rotating the whole frame, which is
   * right for them: a wheel with a hub drawn as one mesh has to spin as one
   * thing. An imported model can do better — it can declare which part
   * turns, with a `stationSpin` node — and then the hub must NOT spin,
   * because a hub that rotates with its own ring is a hub with no docking
   * bay you can aim at. So a modelled station is drawn twice: shell on the
   * still frame, ring on the turning one.
   *
   * Surface ports ignore the flag. They are bolted down and their frame
   * comes from local vertical, so there is no spin to leave out. */
  function stationFrame(station, still) {
    /* An underground bay is hung from its ENTRANCE, not from where it truly
     * is. The mesh already carries the drop down the shaft in its own
     * geometry (see stationMeshes().underground); anchoring the frame at
     * the true (buried) position would put the collar itself underground
     * and, worse, would give the object a camera-space depth nearer than
     * the planet's surface on the near side — which paints the whole bay
     * floating in open space in front of the world instead of hidden
     * inside it. Anchoring at the mouth is exactly what a normal surface
     * pad already does (elevation 0), so this is that same math, just also
     * used by a body whose true elevation is negative. */
    /* EVERY surface port hangs from its mouth now, not just the deep ones.
     * The berth is at the bottom of the shaft for all of them, so anchoring
     * on the body's own position would bury the whole model — collar,
     * apron and all — inside the planet, where the depth buffer duly hides
     * it. That is exactly what happened the first time: shallow starports
     * simply stopped being drawn. */
    var ss = station.surface
      ? Sim.portEntrance(station, G.sys, G.t)
      : Sim.bodyState(station, G.sys, G.t);
    var host = station.parentBody;
    if (!host) return null;
    var hs = Sim.bodyState(host, G.sys, G.t);
    var up = V.norm(V.sub(ss.pos, hs.pos));
    if (V.len(up) < 1e-9) return null;

    if (station.surface) {
      // Model is built flat in xy with +z up, so the pad's "forward" is the
      // local vertical and the other two axes lie along the ground.
      var east = V.norm(V.cross({ x: 0, y: 0, z: 1 }, up));
      if (V.len(east) < 1e-6) east = V.norm(V.cross({ x: 0, y: 1, z: 0 }, up));
      /* Stand the apron slightly PROUD of the ground.
       *
       * A pad's position is exactly the planet's radius, and the planet is
       * drawn as an impostor sphere whose depth is computed from that same
       * radius — so the two surfaces are coincident and the depth test
       * decides between them pixel by pixel. The result is a starport half
       * sunk into the floor, with the far side eaten. Lifting it by a few
       * per cent of its own radius (tens of metres, not visible as height)
       * separates them cleanly and costs nothing else. The dressing rides
       * on this same frame, so the town comes up with it. */
      var lifted = V.addScaled(ss.pos, up, station.radius * PAD_GROUND_LIFT);
      return { pos: lifted, fwd: up, right: east, up: V.cross(east, up) };
    }

    var prograde = V.norm(V.sub(ss.vel, hs.vel));
    var normal = V.norm(V.cross(up, prograde));
    if (V.len(normal) < 1e-9) normal = { x: 0, y: 0, z: 1 };
    // Spin about the station's own axis: one turn every couple of minutes,
    // scaled so bigger rings turn more slowly, as they must.
    var rate = 0.06 / Math.max(0.4, station.radius);
    var ang = still ? 0 : G.t * rate;
    var a = V.rotateAroundAxis(up, normal, ang);
    var b = V.rotateAroundAxis(prograde, normal, ang);
    return { pos: ss.pos, fwd: normal, right: a, up: b };
  }

  function queueLabel(sp, text, color, offset, priority) {
    G.labelQueue.push({ sp: sp, text: text, color: color, offset: offset, pri: priority });
  }

  /* Draw the important labels and drop the ones that would collide.
   * Zoomed out, a dozen names land on the same few pixels; showing all of
   * them is worse than showing the three that matter. Bigger and more
   * significant bodies win. */
  function placeLabels(ctx, queue, w, h) {
    queue.sort(function (a, b) { return b.pri - a.pri; });
    ctx.save();
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    var taken = [];
    for (var i = 0; i < queue.length; i++) {
      var q = queue[i];
      var x = q.sp.x + q.offset, y = q.sp.y + 3;
      if (x < -40 || x > w + 40 || y < 0 || y > h) continue;
      var tw = ctx.measureText(q.text).width;
      var box = { x: x - 2, y: y - 10, w: tw + 4, h: 13 };
      var clash = false;
      for (var j = 0; j < taken.length; j++) {
        var o = taken[j];
        if (box.x < o.x + o.w && box.x + box.w > o.x &&
            box.y < o.y + o.h && box.y + box.h > o.y) { clash = true; break; }
      }
      if (clash) continue;
      taken.push(box);
      ctx.fillStyle = q.color;
      ctx.globalAlpha = 0.92;
      ctx.fillText(q.text, x, y);
    }
    ctx.restore();
  }

  function label(ctx, sp, text, color, offset) {
    ctx.save();
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillText(text, sp.x + offset, sp.y + 3);
    ctx.restore();
  }

  function drawShip(ctx, cam) {
    var sp = cam.project(G.ship.pos);
    if (!sp) return;
    var fr = G.frame || orbitalFrame();

    /* Only draw the flight arrows when the ship's orbit is actually
     * resolvable on screen. Zoomed out to the whole system they would be a
     * fixed-length smear across a planet, pointing at nothing useful. */
    var orbitPx = V.len(fr.rel) * sp.scale;
    var showArrows = orbitPx > 9;

    // Velocity and thrust as arrows in the 3D scene: you see which way the
    // ship is actually going, and which way the burn is pushing it.
    var pv = showArrows ? cam.project(V.addScaled(G.ship.pos, fr.prograde, cam.dist * 0.04)) : null;
    if (pv) Render.drawArrow(ctx, sp.x, sp.y, pv.x - sp.x, pv.y - sp.y, 46, '#ffd36b', 1.7, 7);
    if (showArrows && V.len(G.ship.thrust) > 0) {
      var th = V.norm(G.ship.thrust);
      var pt = cam.project(V.addScaled(G.ship.pos, th, cam.dist * 0.06));
      if (pt) Render.drawArrow(ctx, sp.x, sp.y, pt.x - sp.x, pt.y - sp.y, 34, '#7dfaff', 2.2, 8);
    }

    /* Our own drive. The plume goes opposite the THRUST, not out of the
     * tail — in this ship translation and attitude are separate systems, so
     * burning prograde while pointing somewhere else is a normal thing to
     * do, and the exhaust should show where the reaction mass is actually
     * going rather than where the nose happens to be. */
    if (V.len(G.ship.thrust) > 0) {
      Render.drawShipExhaust(ctx, cam, G.ship, Render.SHIP_LEN,
                             Math.min(1, V.len(G.ship.thrust) / Math.max(G.ship.maxAccel, 1e-12)),
                             'courier', G.ship.thrust, performance.now() / 1000);
    }

    // Real hull once it would actually be visible as one; a marker dot
    // below that reads better than a blob of sub-pixel triangles — the same
    // scale rule every other body in this system follows.
    var lenPx = Render.shipScreenLength(cam, G.ship);
    if (lenPx > 4) {
      var sunDir = V.norm(V.sub(Sim.bodyPosition(G.sys.root, G.sys, G.t), G.ship.pos));
      Render.drawShipModel(ctx, cam, G.ship, sunDir,
        G.ship.crashed ? '#ff8a7a' : null);
    } else {
      ctx.save();
      ctx.fillStyle = G.ship.crashed ? '#ff6b6b' : '#ffffff';
      ctx.strokeStyle = '#8fb4ff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 3.4, 0, K.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 8, 0, K.TAU); ctx.stroke();
      ctx.restore();
    }
    /* Both outside the size branch, same reasoning as the traffic versions:
     * being zoomed out is not a reason to miss having been hit. Your own
     * field goes on the courier hull, because drawShipModel hard-codes that
     * mesh — a form-fitting shield has to fit the ship that is on screen. */
    playerShieldShell(ctx, cam);
    drawHullBlooms(ctx, cam, G.ship);
  }

  /* Your own shell. The player's ship carries the same three fields every
   * NPC does — shieldMax, shieldHp and impacts — because damagePlayer and
   * damageNpc go through one splitDamage and one markImpact, so there is
   * nothing here to keep in step with the other path. */
  function playerShieldShell(ctx, cam) {
    var s = G.ship;
    var cap = s.shield ? Combat.MODULES.shield.cap : 0;
    if (!(cap > 0) || !(s.shieldHp > 0)) return;
    /* lastHitAt on the player is REAL milliseconds — damagePlayer has always
     * written performance.now() there, because the regen tick compares it
     * against a millisecond clock. The NPC path writes sim seconds. So the
     * linger is computed here rather than through shieldLit, which would
     * otherwise be handed two different units and quietly believe both. */
    var sinceS = ((typeof performance !== 'undefined' ? performance.now() : 0)
                  - (s.lastHitAt || -1e9)) / 1000;
    if (!(sinceS >= 0) || sinceS > SHIELD_LINGER) return;
    var leftS = SHIELD_LINGER - sinceS;
    var lit = leftS >= SHIELD_FADE ? 1 : leftS / SHIELD_FADE;
    var lenPx = Render.shipScreenLength(cam, s);
    var nowS = nowSeconds();
    var live = liveImpacts(s, nowS);
    if (lenPx >= SHELL_MIN_PX) {
      Render.drawShellField(ctx, cam, s, Render.SHIP_LEN, 'courier',
                            s.shieldHp / cap, lit, live, nowS);
    } else {
      farShieldGlow(ctx, cam, s, s.shieldHp / cap, lit, live, lenPx, nowS);
    }
  }

  /* ---- HUD ------------------------------------------------------------ */

  /* `solid` for anything you are meant to READ rather than glance at.
   * The translucent panel is right for a HUD overlay sitting on the world,
   * and wrong for a full-screen dialog: with the cockpit behind it, the
   * attitude ladder and canopy struts show straight through a price table
   * and turn a column of numbers into noise. */
  /* ---- the corridor board ------------------------------------------------
   * What a pilot needs while flying a corridor with somebody else in it, and
   * nothing else. Four things, in the order they matter:
   *
   *   how far through the crossing you are, and where everyone else is on it
   *   the throttle lever, because matching speed IS the skill
   *   your lock on somebody
   *   somebody's lock on you
   *
   * Positioned from the TOP, not the bottom. Everything drawn from the
   * bottom edge in this game has to clear the console band and the F-key
   * bar, and a panel that only ever appears during a jump would be the
   * easiest thing in the world to forget to re-measure when those move. */
  function drawCorridorHUD(ctx, w, h, cor) {
    var board = Slip.corridorBoard(cor);
    var PW = Math.min(430, w - 40);
    var x = (w - PW) / 2, y = 54;
    var rows = Math.min(4, board.length);
    var PH = 108 + rows * 17 + (cor.huntedBy ? 26 : 0);

    panel(ctx, x, y, PW, PH, true);
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';

    /* --- the corridor itself, as a line you are somewhere along --------- */
    ctx.fillStyle = '#8fb4ff';
    ctx.fillText('SLIPSPACE CORRIDOR', x + 12, y + 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6f8fbf';
    ctx.fillText(cor.from.name + '  →  ' + cor.to.name, x + PW - 12, y + 18);
    ctx.textAlign = 'left';

    var tx = x + 12, tw = PW - 24, ty = y + 28;
    ctx.strokeStyle = 'rgba(120,160,220,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx, ty + 4); ctx.lineTo(tx + tw, ty + 4); ctx.stroke();

    // Everyone else on the line first, so your own marker sits on top.
    for (var i = 0; i < cor.contacts.length; i++) {
      var c = cor.contacts[i];
      var cp = Math.max(0, Math.min(1, c.progress));
      ctx.fillStyle = c.hostile ? '#ff6b5a' : (c.color || '#d8c79a');
      ctx.fillRect(tx + cp * tw - 1.5, ty, 3, 9);
    }
    var pp = Math.max(0, Math.min(1, cor.progress));
    ctx.fillStyle = '#7dffb0';
    ctx.beginPath();
    ctx.moveTo(tx + pp * tw, ty - 3);
    ctx.lineTo(tx + pp * tw + 4, ty + 4);
    ctx.lineTo(tx + pp * tw, ty + 11);
    ctx.lineTo(tx + pp * tw - 4, ty + 4);
    ctx.closePath(); ctx.fill();

    /* --- the throttle lever -------------------------------------------- */
    var ly2 = y + 50;
    ctx.fillStyle = '#6f8fbf';
    ctx.fillText('THROTTLE', x + 12, ly2 + 4);
    var lx = x + 74, lw = PW - 150;
    ctx.strokeStyle = 'rgba(120,160,220,0.3)';
    ctx.strokeRect(lx, ly2 - 6, lw, 10);
    // Neutral is marked, because neutral is free and everything else is not.
    var mid = lx + lw * (1 / 2);
    ctx.strokeStyle = 'rgba(120,160,220,0.5)';
    ctx.beginPath(); ctx.moveTo(mid, ly2 - 8); ctx.lineTo(mid, ly2 + 6); ctx.stroke();
    var tv = (cor.throttle + 1) / 2;
    ctx.fillStyle = cor.throttle > 0 ? '#ffd36b' : (cor.throttle < 0 ? '#7dfaff' : '#7dffb0');
    ctx.fillRect(lx + tv * lw - 2, ly2 - 8, 4, 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8fb4ff';
    ctx.fillText((Slip.throttleScale(cor.throttle) * 100).toFixed(0) + '%',
                 x + PW - 12, ly2 + 4);
    ctx.textAlign = 'left';

    /* --- who is out there ---------------------------------------------- */
    var by = y + 70;
    ctx.fillStyle = '#6f8fbf';
    ctx.fillText(board.length ? 'CONTACTS' : 'NO CONTACTS IN RANGE', x + 12, by);
    by += 14;
    for (var b = 0; b < rows; b++) {
      var it = board[b];
      var c2 = it.contact;
      ctx.fillStyle = c2.hostile ? '#ff8a76' : '#d8c79a';
      ctx.fillText(c2.name.slice(0, 20), x + 12, by);
      ctx.fillStyle = '#6f8fbf';
      ctx.fillText(c2.className.slice(0, 14), x + 150, by);
      ctx.textAlign = 'right';
      /* Range in light years reads as nonsense at these scales, so it is
       * quoted as a fraction of the corridor — which is the unit the pilot
       * is actually flying in. */
      ctx.fillStyle = it.inLockRange ? '#7dffb0' : '#8fb4ff';
      ctx.fillText((it.range >= 0 ? '+' : '') +
                   (it.range / Math.max(cor.distanceLy, 1e-9) * 100).toFixed(1) + '%',
                   x + PW - 76, by);
      ctx.fillStyle = it.holdable ? '#7dffb0' : '#ff8a76';
      ctx.fillText(c2.hostile ? 'HOSTILE'
                 : it.holdable ? (it.tearCost.toFixed(1) + ' t') : 'ANCHORED',
                   x + PW - 12, by);
      ctx.textAlign = 'left';
      by += 17;
    }

    /* --- your lock ------------------------------------------------------ */
    var ky = y + PH - (cor.huntedBy ? 40 : 18);
    if (cor.cannotHold) {
      ctx.fillStyle = '#ff8a76';
      ctx.fillText('CANNOT HOLD — their anchor outmatches this hull', x + 12, ky);
    } else if (cor.lockOn) {
      ctx.fillStyle = '#ffd36b';
      ctx.fillText('LOCK', x + 12, ky);
      corridorBar(ctx, x + 46, ky - 7, PW - 120, 9, cor.lock, '#ffd36b');
      ctx.textAlign = 'right';
      ctx.fillText((cor.lock * 100).toFixed(0) + '%', x + PW - 12, ky);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = '#4f6f9f';
      ctx.fillText('SPACE holds an interdiction lock when alongside', x + 12, ky);
    }

    /* --- somebody's lock on you ----------------------------------------- */
    if (cor.huntedBy) {
      var hy2 = y + PH - 14;
      if (cor.anchorRefusing) {
        ctx.fillStyle = '#7dffb0';
        ctx.fillText('ANCHOR HOLDING — they cannot complete a lock', x + 12, hy2);
      } else {
        ctx.fillStyle = '#ff6b5a';
        ctx.fillText('THEIR LOCK', x + 12, hy2);
        corridorBar(ctx, x + 76, hy2 - 7, PW - 150, 9, cor.huntLock, '#ff6b5a');
        ctx.textAlign = 'right';
        ctx.fillText(cor.anchorHolding
          ? 'anchor ×' + cor.anchorFactor.toFixed(1)
          : (cor.huntLock * 100).toFixed(0) + '%', x + PW - 12, hy2);
        ctx.textAlign = 'left';
      }
    }
    ctx.restore();
  }

  /* Named `corridorBar`, not `bar`. There is already a local `bar` nested
   * inside another draw function in this file with a completely different
   * signature, and a top-level one sharing its name is exactly the shadowing
   * trap that once broke docking here — two functions, same name, later
   * declaration silently wins, nothing warns. */
  function corridorBar(ctx, x, y, w, h, v, color) {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,160,220,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, Math.max(0, Math.min(1, v)) * (w - 2), h - 2);
    ctx.restore();
  }

  function panel(ctx, x, y, w, h, solid) {
    ctx.save();
    ctx.fillStyle = solid ? 'rgba(5,9,16,0.975)' : 'rgba(8,14,24,0.78)';
    ctx.strokeStyle = 'rgba(120,160,220,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var r = 6;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function rows(ctx, x, y, list, labelColor, valueColor, width) {
    ctx.save();
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      ctx.fillStyle = labelColor;
      ctx.fillText(list[i][0], x, y + i * 15);
      ctx.fillStyle = list[i][2] || valueColor;
      ctx.textAlign = 'right';
      ctx.fillText(list[i][1], x + width, y + i * 15);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function drawHUD(ctx, w, h) {
    /* In the cockpit the instruments are physically in the cockpit — on the
     * glass and in the dashboard panels — so the floating 2D panels stay
     * out of the way entirely. Only things that are genuinely not part of
     * the ship (warnings, messages, the help card, the trade console) are
     * still drawn flat over the top. */
    /* In transit the instruments have nothing to report. The cockpit
     * already carries the drive readout on its glass; the exterior view
     * gets the same information as a plain panel. */
    if (G.hyper) {
      if (G.viewMode !== 'cockpit') drawTransitPanel(ctx, w, h);
      drawOverlays(ctx, w, h);
      return;
    }

    /* One console, both views. The instruments belong to the ship, not to
     * the camera, so they read the same whether you are sitting in the seat
     * or watching from outside — and there is now exactly one place any
     * number lives, instead of six floating panels competing for corners. */
    drawConsole(ctx, w, h);
    /* The off-screen pointer belongs to the world; with a mode up there is
     * no world on screen for it to point into, and it lands on top of
     * whatever the mode drew there. Warnings still get through, because a
     * collision alarm you can miss by having a screen open is not an alarm. */
    if (flying()) drawStationPointer(ctx, w, h);
    drawOverlays(ctx, w, h);
  }

  /* Superseded by the console band; kept only so the old exterior layout is
   * one call away if the flat console ever turns out to be a mistake. */
  function drawLegacyHUD(ctx, w, h) {
    var oe = (G.ship.landed || G.ship.docked) ? null : Sim.oscElements(G.ship, G.sys, G.t);
    var dockedAt = G.ship.docked ? G.sys.byId[G.ship.docked] : null;
    var dom = oe ? oe.body : (dockedAt || G.ship.landedOn || G.sys.root);

    /* --- left: the system and the clock --- */
    panel(ctx, 12, 12, 250, 178);
    ctx.save();
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText(G.sys.name + ' (' + G.sys.root.type + ')', 24, 32);
    ctx.restore();
    rows(ctx, 24, 52, [
      ['seed', '"' + G.seed + '"', '#9ff0dc'],
      ['epoch', fmtEpoch(G.t)],
      ['time warp', (G.paused ? 'PAUSED' : WARPS[G.warpIndex] + '×'),
        G.paused ? '#ffb86b' : (G.physicsLimited ? '#ffb86b' : '#cfe0ff')],
      ['worlds', String(G.sys.bodies.filter(function (b) { return b.kind === 'planet'; }).length) +
        ' planets, ' + G.sys.bodies.filter(function (b) { return b.kind === 'moon'; }).length + ' moons'],
      ['ports', String((G.sys.ports || []).length)],
      ['factions', String((G.sys.factions || []).length)],
      ['traffic', String((G.sys.traffic || []).length) + ' runs, ' +
        String((G.sys.patrols || []).length) + ' patrols'],
      ['jump range', fmtLy(Galaxy.maxRange(G.ship)) + '   (J)', '#7fd6c0'],
      ['charted', Object.keys(G.visited).length + ' / ' + G.galaxy.stars.length + ' stars']
    ], '#7e93b3', '#cfe0ff', 226);

    if (G.physicsLimited) {
      ctx.save();
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = '#ffb86b';
      ctx.fillText('warp capped at ' + Math.round(G.warpCap) + '× by gravity', 24, 182);
      ctx.restore();
    }

    /* --- right: flight data, quoted about whatever dominates --- */
    var px = w - 262;
    panel(ctx, px, 12, 250, oe ? 176 : 120);
    ctx.save();
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = '#cfe0ff';
    ctx.fillText(dockedAt ? 'DOCKED' : G.ship.landed ? (G.ship.crashed ? 'WRECKED' : 'LANDED') : 'ORBIT', px + 12, 32);
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#7e93b3';
    ctx.textAlign = 'right';
    ctx.fillText('re: ' + dom.name, px + 238, 32);
    ctx.textAlign = 'left';
    ctx.restore();

    if (oe) {
      rows(ctx, px + 12, 52, [
        ['altitude', fmtDist(oe.altitude)],
        ['speed', fmtSpeed(oe.relSpeed)],
        ['apoapsis', oe.closed ? fmtDist(oe.apoAlt) : 'escaping',
          oe.closed ? '#cfe0ff' : '#ffb86b'],
        ['periapsis', fmtDist(oe.periAlt),
          oe.periAlt < 0 ? '#ff7a7a' : '#cfe0ff'],
        ['eccentricity', oe.e.toFixed(4)],
        ['inclination', (oe.inc / DEG).toFixed(2) + '°'],
        ['period', oe.closed ? fmtTime(oe.period) : '—'],
        ['gravity here', fmtSpeed(V.len(Sim.acceleration(G.ship.pos, G.sys, G.t))) + '²']
      ], '#7e93b3', '#cfe0ff', 226);
      if (oe.periAlt < 0 && oe.closed) {
        ctx.save();
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = '#ff7a7a';
        ctx.fillText('periapsis is below the surface', px + 12, 180);
        ctx.restore();
      }
    } else if (dockedAt) {
      rows(ctx, px + 12, 52, [
        ['station', dockedAt.name],
        [dockedAt.underground ? 'under' : dockedAt.surface ? 'on' : 'orbiting', dockedAt.parentBody.name],
        ['undock', 'press U']
      ], '#7e93b3', '#7dfaff', 226);
    } else {
      rows(ctx, px + 12, 52, [
        ['on', G.ship.landedOn ? G.ship.landedOn.name : '—'],
        ['contact speed', fmtSpeed(G.ship.impactSpeed || 0),
          G.ship.crashed ? '#ff7a7a' : '#7dffb0'],
        ['surface gravity', fmtSpeed(dom.mu / (dom.radius * dom.radius)) + '²']
      ], '#7e93b3', '#cfe0ff', 226);
    }

    drawDockingPanel(ctx, w, h);
    drawThrustRose(ctx, w, h);
    drawStationPointer(ctx, w, h);
    drawRadarCompass(ctx, w, h);
    drawCargoPanel(ctx, w, h);
    drawOverlays(ctx, w, h);
  }

  function drawOverlays(ctx, w, h) {
    /* --- taking fire: the screen itself flinches --- */
    var sinceHit = performance.now() - (G.ship.lastHitAt || -1e9);
    if (sinceHit < 320) {
      ctx.save();
      var f = 1 - sinceHit / 320;
      var vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32,
                                        w / 2, h / 2, Math.max(w, h) * 0.72);
      vg.addColorStop(0, 'rgba(255,60,40,0)');
      vg.addColorStop(1, 'rgba(255,60,40,' + (0.38 * f).toFixed(3) + ')');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    /* --- a wake chase: persistent, because it is a standing intention ---
     * say() fades after nine seconds, and the whole point of laying in a
     * course off a wake is that you then fly for a while before jumping. If
     * the only record of who you are chasing and whether you can catch them
     * disappeared while you were still climbing out of the gravity well, the
     * player would have to re-scan the wake — which by then may have faded
     * past the fidelity that told them in the first place. */
    /* NOT during a jump. The corridor board occupies y 54 upward and this
     * banner sits at 106, so the two would overlap — and inside the corridor
     * the chase has stopped being an intention anyway: the contact list in
     * front of you is the live version of the same information. Exactly the
     * class of collision the tests are structurally blind to, which is why
     * it is worth the extra clause rather than a look-and-see. */
    if (G.wakeChase && flying() && !G.hyper) {
      var wc = G.wakeChase;
      var wcText = 'CHASING ' + wc.name +
        (wc.starName ? '  →  ' + wc.starName : '') + '   ·   ' +
        (wc.blind ? 'speed unknown'
         : !wc.possible ? 'she lands first'
         : 'intercept ' + (wc.at * 100).toFixed(0) + '%' +
           (wc.estimated ? ' (est)' : ''));
      ctx.save();
      ctx.font = '11px ui-monospace, monospace';
      var wcW = ctx.measureText(wcText).width;
      panel(ctx, (w - wcW) / 2 - 14, 106, wcW + 28, 26);
      ctx.fillStyle = wc.blind ? '#ffb86b' : (wc.possible ? '#7dffb0' : '#ff8a76');
      ctx.textAlign = 'center';
      ctx.fillText(wcText, w / 2, 123);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    /* --- collision warning: persistent, not on a timer like say() --- */
    if (G.impactWarning) {
      var iw = G.impactWarning;
      ctx.save();
      ctx.font = (iw.danger ? 'bold ' : '') + '13px ui-monospace, monospace';
      var iwW = ctx.measureText(iw.text).width;
      var flash = iw.danger ? (0.55 + 0.45 * Math.sin(performance.now() / 140)) : 1;
      ctx.globalAlpha = 1;
      panel(ctx, (w - iwW) / 2 - 16, 70, iwW + 32, 30);
      ctx.globalAlpha = flash;
      ctx.fillStyle = iw.danger ? '#ff5a5a' : '#ffb86b';
      ctx.textAlign = 'center';
      ctx.fillText(iw.text, w / 2, 90);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    /* The contacts panel belongs to flying. On any full-screen mode it was
     * painting straight over the middle of whatever you were reading — and
     * it is not needed there, because the screens carry their own signals
     * (the icon bar stays visible, and a demand still pins time warp). The
     * one thing that must follow you into a menu is an actual hold-up, so
     * an interdiction shows a one-line banner instead of the whole panel. */
    if (flying()) {
      drawEncounterPanel(ctx, w, h);
    } else if (G.encounter && G.encounter.demand) {
      ctx.save();
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = '#ff7a6b';
      ctx.textAlign = 'center';
      ctx.fillText('INTERDICTION IN PROGRESS — F1', w / 2, 64);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    /* Everything below here has to clear whatever the deck currently owns —
     * the instrument band in flight, the whole screen on any other mode.
     * Both of these used to be positioned from the bottom edge and both
     * ended up drawn straight through the key bar. */
    var top = deckTop(h);

    /* --- transient message, sat just above the deck --- */
    if (G.message && performance.now() < G.messageUntil) {
      ctx.save();
      ctx.font = '13px ui-monospace, monospace';
      var tw = ctx.measureText(G.message).width;
      panel(ctx, (w - tw) / 2 - 14, top - 66, tw + 28, 30, !flying());
      ctx.fillStyle = '#e6f0ff';
      ctx.fillText(G.message, (w - tw) / 2, top - 46);
      ctx.restore();
    }

    /* --- footer hint ---
     * Trimmed, too: the icon bar and the soft-key strips already say what
     * most of these keys do, so this is down to the few that live nowhere
     * else, plus the scale readout and the frame rate.
     *
     * On a full-screen mode there is no footer to put it in — the mode owns
     * every pixel down to the bar, and writing over the bottom of whatever
     * panel it drew there is how the last version of this went wrong. So it
     * goes in the mode's own title bar instead. */
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.55)';
    if (!flying()) {
      /* modeFrame already drew the help and frame-rate line in its own
       * title bar; there is nothing to add down here. */
    } else {
      /* Mouse aim no longer needs a held button — the buttons are the fire
       * groups now — so the hint stopped being true the moment that
       * changed. A control hint that describes the previous build is worse
       * than none: it teaches the wrong gesture and then the player blames
       * the ship. */
      var hint = G.viewMode === 'cockpit'
        ? 'H help   ·   ' + (G.freeLook ? 'FREE LOOK — release right Alt to fly'
                             : G.mouseAim ? 'mouse aims · R-Alt looks · 1/2 fire · 4 launches'
                                          : 'drag to look') +
          '   ·   wheel / +- zoom   ·   Esc menu   ·   Enter exterior   ·   '
        : 'H help   ·   drag to orbit   ·   wheel / +- zoom   ·   Esc menu   ·   Enter cockpit   ·   ';
      ctx.fillText(hint +
                   (G.gridStep ? 'grid ring ' + fmtDist(G.gridStep) + '   ·   ' : '') +
                   Math.round(G.fps) + ' fps', 14, top - 8);
    }
    ctx.restore();

    if (G.showHelp) drawHelp(ctx, w, h);
    if (G.market) drawMarket(ctx, w, h);
    /* Last of all, and in this order: the menu covers the market, and the
     * title screen covers everything including the menu. Both clear the
     * hotspot list as they draw, so nothing behind them can be clicked. */
    if (G.menu) drawPauseMenu(ctx, w, h);
    if (G.title) drawTitleScreen(ctx, w, h);
  }

  function fmtLy(d) { return d.toFixed(2) + ' ly'; }

  /* The exterior view's version of the transit readout. */
  function drawTransitPanel(ctx, w, h) {
    var hy = G.hyper;
    var pw = 420, ph = 132;
    var px = (w - pw) / 2, py = 76;
    panel(ctx, px, py, pw, ph);
    ctx.save();
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(hy.phase === 'charge' ? 'SLIPSPACE DRIVE — CHARGING'
               : hy.phase === 'exit' ? 'EMERGENCE' : 'IN TRANSIT', px + 20, py + 28);
    ctx.restore();
    rows(ctx, px + 20, py + 52, [
      ['from', hy.fromName],
      ['to', hy.plan.to.name + '  (' + hy.plan.to.cls + ')', '#ffd36b'],
      ['distance', fmtLy(hy.plan.distance)],
      ['date', fmtEpoch(hy.clock), '#ffd36b']
    ], '#7e93b3', '#cfe0ff', pw - 40);

    var p = Math.min(1, hy.elapsed / hy.total);
    ctx.save();
    ctx.strokeStyle = 'rgba(150,230,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 20, py + ph - 18, pw - 40, 5);
    ctx.fillStyle = 'rgba(180,240,255,0.85)';
    ctx.fillRect(px + 20, py + ph - 18, (pw - 40) * p, 5);
    ctx.restore();
  }

  /* The star map itself now lives in screens.js and is reached through the
   * galaxy screen. */

  /* Who is awake and what they want. Shown in both views, because being
   * interdicted is not a thing you should be able to miss by happening to
   * be looking at the orbit display. */
  function drawEncounterPanel(ctx, w, h) {
    var enc = G.encounter;
    if (!enc || !enc.active.length) return;

    var demand = enc.demand;
    var lines = enc.active.map(function (spec) {
      var st = spec.live;
      var rng = st ? V.dist(st.pos, G.ship.pos) : 0;
      var what = spec.mode === 'attack' ? 'ATTACKING'
        : spec.kind === 'trader' ? 'fleeing'
        : spec.kind === 'pirate'
        ? (spec.mode === 'breakoff' ? 'breaking off' : spec.mode === 'demand' ? 'HOLDING YOU UP' : 'closing')
        : spec.kind === 'police' ? 'inspecting' : 'escorting';
      return [spec.name + '  (' + spec.className + ')', fmtDist(rng) + '  ' + what,
              spec.kind === 'pirate' ? '#ff8a7a' : '#7dffb0'];
    });

    var ph = 44 + lines.length * 15 + (demand ? 52 : 0);
    var px = w / 2 - 190, py = 112;
    panel(ctx, px, py, 380, ph);

    ctx.save();
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = demand ? '#ff7a6b' : '#7dfaff';
    ctx.fillText(demand ? 'INTERDICTION' : 'CONTACTS', px + 14, py + 24);
    ctx.restore();
    rows(ctx, px + 14, py + 44, lines, '#a9bcd6', '#cfe0ff', 352);

    if (!demand) return;

    var d = Sim.pirateDemand(demand, G.ship, Eco);
    var dy = py + 44 + lines.length * 15 + 8;
    ctx.save();
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#ffb86b';
    var text = d.type === 'cargo'
      ? demand.name + ' demands ' + d.tonnes + 't of ' + d.name
      : demand.name + ' demands ' + fmtCredits(d.credits);
    ctx.fillText(text, px + 14, dy + 12);
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(200,220,245,0.8)';
    ctx.fillText('C to hand it over   ·   or outrun them  (' +
                 (Sim.cargoMass(G.ship) > G.ship.cargoCap * 0.5
                   ? 'you are heavy — they are faster' : 'you are light — you are faster') + ')',
                 px + 14, dy + 30);
    ctx.restore();
  }

  /* Cargo, fuel and money, in the exterior view. In the cockpit this same
   * information is on the centre dashboard panel instead. */
  function drawCargoPanel(ctx, w, h) {
    var s = G.ship;
    var cargo = Sim.cargoMass(s);
    var ids = Object.keys(s.cargo).filter(function (c) { return s.cargo[c] > 0; });
    var lines = Math.min(ids.length, 5);
    var ph = 104 + lines * 15;
    var px = 12, py = h - 152 - ph - 10;
    panel(ctx, px, py, 312, ph);

    ctx.save();
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText(fmtCredits(s.credits), px + 12, py + 22);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#7e93b3';
    ctx.textAlign = 'right';
    ctx.fillText('HOLD ' + cargo.toFixed(0) + '/' + s.cargoCap + ' t', px + 300, py + 22);
    ctx.textAlign = 'left';
    ctx.restore();

    /* Jump fuel gets the bar, because it is the one that is a decision.
     * The thruster tank gets a line, in hours rather than tonnes, because
     * the only question anyone asks of it is whether there is enough left
     * to finish the manoeuvre. */
    ctx.save();
    ctx.fillStyle = 'rgba(120,160,220,0.20)';
    ctx.fillRect(px + 12, py + 32, 288, 8);
    var frac = s.fuel / s.fuelCap;
    ctx.fillStyle = frac < 0.2 ? '#ff7a7a' : '#7dfaff';
    ctx.fillRect(px + 12, py + 32, 288 * Math.max(0, frac), 8);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#9fb6d4';
    ctx.fillText('jump fuel ' + s.fuel.toFixed(1) + ' t   ·   reach ' +
                 fmtLy(Galaxy.maxRange(s)) +
                 '   ·   accel ' + (s.maxAccel * 1000).toFixed(2) + ' m/s²',
                 px + 12, py + 54);
    var endur = Sim.thrusterEndurance(s);
    ctx.fillStyle = endur < 1800 ? '#ffb86b' : 'rgba(140,165,200,0.7)';
    ctx.fillText('thrusters ' + s.thrusterFuel.toFixed(1) + ' t  (' + fmtTime(endur) +
                 ' of burn, refilled free on docking)', px + 12, py + 68);
    ctx.restore();

    if (!ids.length) {
      ctx.save();
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(140,165,200,0.6)';
      ctx.fillText('hold empty  —  dock at a port and press M to trade', px + 12, py + 90);
      ctx.restore();
      return;
    }
    ids.sort(function (a, b) { return s.cargo[b] - s.cargo[a]; });
    var rowsList = [];
    for (var i = 0; i < lines; i++) {
      rowsList.push([Eco.BY_ID[ids[i]].name, s.cargo[ids[i]].toFixed(0) + ' t',
                     ids[i] === 'waste' ? '#ffb86b' : '#cfe0ff']);
    }
    rows(ctx, px + 12, py + 90, rowsList, '#7e93b3', '#cfe0ff', 288);
  }

  /* ---- the trade console -----------------------------------------------
   * Deliberately a keyboard instrument rather than a mouse one: everything
   * else in this game is flown from the keyboard, and a menu you have to
   * reach for the mouse to use breaks the seat you are sitting in.
   *
   * The two columns that matter are BUY and SELL, and they are different
   * numbers — a spread, like any real market. The rightmost column is the
   * one that turns this from a list into a decision: how full the port's
   * warehouse is, which is what is setting the price. */
  function drawMarket(ctx, w, h) {
    var m = G.market;
    var port = m.port;
    var list = marketRows();
    if (m.sel >= list.length) m.sel = Math.max(0, list.length - 1);

    var pw = 720, ph = 120 + list.length * 18 + 66;
    ph = Math.min(ph, h - 40);
    var px = (w - pw) / 2, py = (h - ph) / 2;
    panel(ctx, px, py, pw, ph, true);

    ctx.save();
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText(port.name, px + 20, py + 30);
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText((port.underground ? 'Underground bay' : port.surface ? 'Surface starport' : port.market.roleName) +
                 '  ·  ' + port.parentBody.name +
                 '  ·  development ' + Math.round(port.market.dev * 100) + '%',
                 px + 20, py + 48);
    ctx.fillStyle = '#ffe6a8';
    ctx.textAlign = 'right';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(fmtCredits(G.ship.credits), px + pw - 20, py + 30);
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#9fb6d4';
    ctx.fillText('hold ' + Sim.cargoMass(G.ship).toFixed(0) + ' / ' + G.ship.cargoCap +
                 ' t   ·   jump fuel ' + G.ship.fuel.toFixed(1) + ' / ' + G.ship.fuelCap +
                 ' t   ·   reach ' + fmtLy(Galaxy.maxRange(G.ship)),
                 px + pw - 20, py + 48);
    ctx.textAlign = 'left';

    var hy = py + 76;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#7e93b3';
    ctx.fillText('COMMODITY', px + 44, hy);
    ctx.textAlign = 'right';
    ctx.fillText('BUY', px + 330, hy);
    ctx.fillText('SELL', px + 420, hy);
    ctx.fillText('IN HOLD', px + 510, hy);
    ctx.fillText('IN STOCK', px + 610, hy);
    ctx.textAlign = 'left';
    ctx.fillText('SUPPLY', px + 626, hy);
    ctx.restore();

    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var y = hy + 20 + i * 18;
      if (y > py + ph - 60) break;
      var sel = (i === m.sel);
      var held = heldTonnes(r.id);

      if (sel) {
        ctx.save();
        ctx.fillStyle = 'rgba(125,250,255,0.10)';
        ctx.fillRect(px + 14, y - 12, pw - 28, 17);
        ctx.fillStyle = '#7dfaff';
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText('▶', px + 22, y);
        ctx.restore();
      }

      ctx.save();
      ctx.font = '11px ui-monospace, monospace';
      var isWaste = r.id === 'waste';
      ctx.fillStyle = isWaste ? '#ffb86b' : (held > 0 ? '#e6f0ff' : '#a9bcd6');
      ctx.fillText(r.name, px + 44, y);
      if (isWaste) {
        ctx.fillStyle = 'rgba(255,184,107,0.65)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(r.sink ? '  (accepts for disposal)' : '  (pays you to haul it)',
                     px + 44 + ctx.measureText(r.name).width + 34, y);
        ctx.font = '11px ui-monospace, monospace';
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = r.buy === null ? '#4c5c72'
                    : r.buy < 0 ? '#7dffb0' : '#cfe0ff';
      ctx.fillText(r.buy === null ? '—' : fmtCredits(r.buy), px + 330, y);
      ctx.fillStyle = r.sell === null ? '#4c5c72'
                    : r.sell < 0 ? '#ffb86b' : '#7dffb0';
      ctx.fillText(r.sell === null ? '—' : fmtCredits(r.sell), px + 420, y);
      ctx.fillStyle = held > 0 ? '#ffe6a8' : '#4c5c72';
      ctx.fillText(held > 0 ? held.toFixed(0) + ' t' : '—', px + 510, y);
      ctx.fillStyle = '#a9bcd6';
      ctx.fillText(r.tradeable ? Math.round(r.stock) + ' t' : '—', px + 610, y);
      ctx.textAlign = 'left';

      // Supply bar: the actual cause of the price in the columns to its left.
      if (r.tradeable && r.cap > 0) {
        ctx.fillStyle = 'rgba(120,160,220,0.18)';
        ctx.fillRect(px + 626, y - 8, 72, 7);
        ctx.fillStyle = r.fill > 0.66 ? '#7dffb0' : r.fill > 0.3 ? '#ffd36b' : '#ff7a7a';
        ctx.fillRect(px + 626, y - 8, 72 * r.fill, 7);
      }
      ctx.restore();
    }

    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.7)';
    ctx.fillText('↑↓ select   ·   → buy 1t   ·   ← sell 1t   ·   hold Shift for 10t   ·   ' +
                 'Home buy max   ·   End sell all   ·   F fill tank   ·   U undock   ·   M close',
                 px + 20, py + ph - 34);
    if (G.ledgerLog.length) {
      ctx.fillStyle = '#7fd6c0';
      ctx.fillText(G.ledgerLog[0].text, px + 20, py + ph - 16);
    }
    ctx.restore();
  }

  /* The thrust rose: six arrows, each pointing the way that burn pushes you.
   * Arrows rather than words, and orbital-frame names rather than screen
   * directions, because "prograde" is true from any camera angle. */
  function drawThrustRose(ctx, w, h) {
    var cx = 78, cy = h - 88, R = 40;
    panel(ctx, 12, h - 152, 312, 128);

    ctx.save();
    ctx.strokeStyle = 'rgba(120,160,220,0.25)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, K.TAU); ctx.stroke();
    ctx.restore();

    var a = G.activeThrust || {};
    var dirs = [
      { key: 'pro',    dx: 1,  dy: 0,  tag: 'PRO', hint: 'W' },
      { key: 'ret',    dx: -1, dy: 0,  tag: 'RET', hint: 'S' },
      { key: 'rout',   dx: 0,  dy: -1, tag: 'R+',  hint: 'D' },
      { key: 'rin',    dx: 0,  dy: 1,  tag: 'R-',  hint: 'A' },
      { key: 'nplus',  dx: 0.72, dy: -0.72, tag: 'N+', hint: 'R' },
      { key: 'nminus', dx: -0.72, dy: 0.72, tag: 'N-', hint: 'F' }
    ];
    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i];
      var on = !!a[d.key];
      Render.drawArrow(ctx, cx + d.dx * 12, cy + d.dy * 12, d.dx, d.dy,
                       R - 14, on ? '#7dfaff' : 'rgba(140,170,210,0.42)',
                       on ? 2.4 : 1.3, on ? 8 : 6);
      ctx.save();
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = on ? '#7dfaff' : 'rgba(150,175,210,0.6)';
      var tw = ctx.measureText(d.tag).width;
      ctx.fillText(d.tag, cx + d.dx * (R + 13) - tw / 2, cy + d.dy * (R + 13) + 3.5);
      ctx.restore();
    }

    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#7e93b3';
    ctx.fillText('THRUST', cx - 20, h - 136);
    ctx.restore();

    // Throttle bar and drive numbers.
    var bx = 152, by = h - 120;
    rows(ctx, bx, by + 8, [
      ['throttle', Math.round((G.ship.throttle || 0) * 100) + '%'],
      ['accel', fmtSpeed(G.ship.maxAccel) + '²'],
      ['fine', G.keys['shift'] ? 'on · 8%' : 'Shift']
    ], '#7e93b3', '#cfe0ff', 148);

    ctx.save();
    ctx.fillStyle = 'rgba(120,160,220,0.2)';
    ctx.fillRect(bx, by + 58, 148, 6);
    ctx.fillStyle = '#7dfaff';
    ctx.fillRect(bx, by + 58, 148 * Math.min(1, G.ship.throttle || 0), 6);
    ctx.restore();
  }

  /* Docking guidance: range, closing speed, and how those compare to the
   * target's actual capture envelope — the numbers a manual approach is
   * flown on. Shown under the main ORBIT panel whenever a target is set. */
  function drawDockingPanel(ctx, w, h) {
    if (!G.dockTarget || G.ship.docked || !G.dockStatus) return;
    var ds = G.dockStatus;
    var px = w - 262, py = 12 + (Sim.oscElements(G.ship, G.sys, G.t) ? 176 : 120) + 12;
    panel(ctx, px, py, 250, 96);
    ctx.save();
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = ds.inRange && ds.slowEnough ? '#7dffb0' : '#7dfaff';
    ctx.fillText('DOCKING: ' + G.dockTarget.name, px + 12, py + 20);
    ctx.restore();
    rows(ctx, px + 12, py + 40, [
      ['range', fmtDist(ds.range), ds.inRange ? '#7dffb0' : '#cfe0ff'],
      ['closing', fmtSpeed(ds.closingSpeed) + (ds.closingSpeed > 0 ? ' (approach)' : ' (away)')],
      ['rel. speed', fmtSpeed(ds.relSpeed), ds.slowEnough ? '#7dffb0' : '#ffb86b'],
      ['capture at', '≤' + fmtDist(G.dockTarget.dockCaptureRadius) + ', ≤' + fmtSpeed(G.dockTarget.dockMaxSpeed)]
    ], '#7e93b3', '#cfe0ff', 226);
  }

  var RADAR_RANGE = 0.75 * AU;

  function bodyDotColor(kind) {
    return kind === 'star' ? '#ffe6a8'
         : kind === 'planet' ? '#7fb2ff'
         : kind === 'moon' ? '#a9b7c6'
         : kind === 'station' ? '#7dffb0'
         : '#cfe0ff';
  }

  /* Radar + compass, both drawn in the ship's own body-frame axes (not the
   * camera's) so they read the same in cockpit and orbit view, like a real
   * aircraft's heading-up display. The radar plots everything within 0.75
   * AU as a dot on a plan view (fwd = 12 o'clock, right = 3 o'clock), with
   * a stem line above or below the dot showing whether the object sits
   * above or below that plane. The compass is a separate, unlimited-range
   * needle to whichever massive body the ship was last near/orbiting — it
   * keeps pointing home long after that body has fallen outside the
   * radar's own bubble. */
  function drawRadarCompass(ctx, w, h) {
    var cx = w - 124, cy = h - 140, R = 70;
    panel(ctx, w - 236, h - 244, 224, 208);

    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#7e93b3';
    ctx.fillText('RADAR · 0.75 AU · nose-relative', w - 224, h - 232);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(120,160,220,0.30)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, K.TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,160,220,0.16)';
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, K.TAU); ctx.stroke();
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,190,230,0.7)';
    // Tick labels sit just INSIDE the ring, not outside — the compass
    // needle below needs the outer margin to itself, and the two would
    // otherwise collide whenever the reference body happens to bear R/L/etc.
    var ticks = [[0, 'FWD'], [Math.PI / 2, 'R'], [Math.PI, 'AFT'], [-Math.PI / 2, 'L']];
    for (var ti = 0; ti < ticks.length; ti++) {
      var tx = cx + Math.sin(ticks[ti][0]) * (R - 12);
      var ty = cy - Math.cos(ticks[ti][0]) * (R - 12);
      var tw = ctx.measureText(ticks[ti][1]).width;
      ctx.fillText(ticks[ti][1], tx - tw / 2, ty + 3);
    }
    // Ship marker: always at center, nose "up" — this display is drawn in
    // the ship's own frame, so the ship itself never moves on it.
    ctx.fillStyle = '#cfe0ff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6); ctx.lineTo(cx - 4, cy + 5); ctx.lineTo(cx + 4, cy + 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    for (var i = 0; i < G.sys.bodies.length; i++) {
      var b = G.sys.bodies[i];
      if (G.ship.docked && b.id === G.ship.docked) continue; // nothing to say about the thing you're bolted to
      var bpos = Sim.bodyPosition(b, G.sys, G.t);
      var rel = Sim.relativeToShipFrame(G.ship, bpos);
      if (rel.range > RADAR_RANGE || rel.range < 1e-6) continue;

      var planarKm = Math.hypot(rel.fwd, rel.right);
      var planarFrac = Math.min(1, planarKm / RADAR_RANGE);
      var px = cx + Math.sin(rel.azimuth) * planarFrac * R;
      var py = cy - Math.cos(rel.azimuth) * planarFrac * R;
      var stem = Math.sin(rel.elevation) * R * 0.85; // + = above the plane, drawn upward
      var col = bodyDotColor(b.kind);
      var isRef = b === G.lastMassiveBody;

      ctx.save();
      ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - stem); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(px, py - stem, isRef ? 4 : 2.6, 0, K.TAU); ctx.fill();
      if (isRef) {
        ctx.strokeStyle = col; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(px, py - stem, 7, 0, K.TAU); ctx.stroke();
      }
      ctx.restore();
    }

    // Compass needle: unlimited range, always live, points to the last
    // massive body the ship was locked to / orbiting.
    if (G.lastMassiveBody) {
      var homePos = Sim.bodyPosition(G.lastMassiveBody, G.sys, G.t);
      var homeRel = Sim.relativeToShipFrame(G.ship, homePos);
      if (homeRel.range > 1e-6) {
        var nx = Math.sin(homeRel.azimuth), ny = -Math.cos(homeRel.azimuth);
        Render.drawArrow(ctx, cx + nx * (R + 9), cy + ny * (R + 9), nx, ny, 15, '#ffd479', 2, 7);
        ctx.save();
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = '#ffd479';
        var label = G.lastMassiveBody.name + '  ' + fmtDist(homeRel.range);
        var lw = ctx.measureText(label).width;
        ctx.fillText(label, cx - lw / 2, h - 16);
        ctx.restore();
      }
    }
  }

  /* An arrow at the screen edge pointing to the home station whenever it is
   * off screen, plus the range to it. Direction as a pointer, not a word. */
  function drawStationPointer(ctx, w, h) {
    if (!G.homeStation) return;
    var pos = Sim.bodyPosition(G.homeStation, G.sys, G.t);
    var sp = G.cam.project(pos);
    var range = V.dist(pos, G.ship.pos);
    /* The pointer lives in the part of the screen that shows the world, not
     * the part that shows instruments. Measured against the full height it
     * put the label inside the flight band, over the fuel gauges. */
    var deck = deckTop(h);
    var onScreen = sp && sp.x > 40 && sp.x < w - 40 && sp.y > 40 && sp.y < deck - 40;
    if (onScreen) return;

    // Point from screen centre toward the target in camera space.
    var vec = V.sub(pos, G.cam.eye);
    var sx = V.dot(vec, G.cam.r), sy = V.dot(vec, G.cam.u);
    var l = Math.hypot(sx, sy) || 1;
    var dx = sx / l, dy = -sy / l;
    var cx = w / 2, cy = deck / 2, rad = Math.min(w, deck) * 0.34;

    Render.drawArrow(ctx, cx + dx * rad, cy + dy * rad, dx, dy, 26, '#7fd6c0', 2, 9);
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#9ff0dc';
    ctx.fillText(G.homeStation.name + '  ' + fmtDist(range),
                 cx + dx * (rad + 34) - 40, cy + dy * (rad + 34) + 14);
    ctx.restore();
  }

  /* ================= the pause menu, the slots and the options ===========
   *
   * Escape stops the world and puts a menu in front of it. Three things go
   * through here — saving, loading, and settings — and they share one
   * overlay because they share one property: none of them is a thing you do
   * while flying, and all of them are things you should be able to find
   * without knowing a key.
   *
   * The menu OWNS time while it is up: update() returns early, so nothing
   * ages, no fuel burns and no pirate closes while you read a slot list.
   * That is deliberately not the same as G.paused, which is the player's own
   * pause and must still be theirs when the menu closes.
   *
   * It also owns the keyboard and the mouse: handleMenuKey takes every key
   * before the flight controls see it, and the draw clears the hotspot list
   * so the instrument bar behind the overlay cannot be clicked through.
   */

  function menuOpen() { return !!(G.menu || G.title); }

  function openMenu() {
    if (G.hyper) { say('Not mid-jump', 2); return; }
    G.menu = { page: 'main', sel: 0, edit: null, note: null };
    G.market = null;
    HOOKS.sound('click');
  }

  function closeMenu() { G.menu = null; }

  /* Quit does not close the window — there is no IPC to the shell to do it
   * with, and a game that can only be left by killing it is worse than one
   * that cannot be left at all. It goes back to a title screen instead,
   * which is the piece the game did not have: somewhere to load a different
   * career from, or start one on a new seed, without touching the URL. */
  function quitToTitle() {
    if (global.Save && G.ship && !G.ship.crashed) global.Save.store(G);
    G.menu = null;
    G.market = null;
    G.title = { sel: 0, edit: null, note: 'Career committed to the autosave.' };
  }

  /* ---- and quitting for real ---------------------------------------------
   * The comment on quitToTitle says quit "does not close the window — there
   * is no IPC to the shell to do it with". That was true of the shell and
   * never true of the platform: an Electron renderer calling window.close()
   * closes its own BrowserWindow, and electron/main.js already quits the app
   * when the last window goes. So this needs no preload and no IPC — which
   * matters, because that file's stated reason for having neither is that
   * handing the renderer Node would widen what a bug could reach, and this
   * costs exactly nothing against it.
   *
   * A BROWSER WILL REFUSE, and has to say so rather than offering a dead
   * button. window.close() only works on a window a script opened, so in an
   * ordinary tab the call quietly does nothing at all — which is the failure
   * mode this project keeps naming: indistinguishable from a bug. The
   * refusal carries its reason, the way canFit's does.
   *
   * The desktop build is recognised by its ORIGIN. electron/main.js serves
   * the game over `game://` precisely so it has a real one, and nothing else
   * in the world does — a far more honest test than sniffing the user agent
   * for the word Electron, which is a string anything may claim. */
  function isDesktopShell() {
    return typeof location !== 'undefined' && location.protocol === 'game:';
  }

  function quitGame() {
    /* The autosave first, and in every case, including the one where the
     * window then refuses to close. Someone who quits and finds themselves
     * still looking at the title screen must not also have lost the hour.
     * beforeunload commits too, but only if the close actually happens. */
    if (global.Save && G.ship && !G.ship.crashed) global.Save.store(G);
    storePrefs();

    if (!isDesktopShell()) {
      if (G.title) {
        G.title.note = 'A browser will not let a page close its own tab — ' +
                       'close it yourself. Your career is saved.';
      }
      return;
    }
    if (G.title) G.title.note = 'Closing…';
    try {
      if (typeof window !== 'undefined' && window.close) window.close();
    } catch (e) {
      if (G.title) G.title.note = 'The window refused to close.';
    }
  }

  function menuItems() {
    return [
      { label: 'Resume', hint: 'back to the ship', run: closeMenu },
      { label: 'Save game', hint: 'write a career to one of six slots',
        run: function () { G.menu.page = 'save'; G.menu.sel = 0; } },
      { label: 'Load game', hint: 'pick up a saved career',
        run: function () { G.menu.page = 'load'; G.menu.sel = 0; } },
      { label: 'Options', hint: 'sound, display, flight, keys',
        run: function () { G.menu.page = 'options'; G.menu.sel = firstOption(); } },
      { label: 'Quit to main menu', hint: 'commits the autosave first', run: quitToTitle }
    ];
  }

  function titleItems() {
    return [
      { label: 'Resume career', hint: currentCareerLine(),
        run: function () { G.title = null; } },
      { label: 'Load game', hint: 'a slot from any galaxy',
        run: function () { G.title = null; G.menu = { page: 'load', sel: 0, edit: null, note: null, fromTitle: true }; } },
      { label: 'New career', hint: 'a seed is a universe',
        run: beginSeedEntry },
      { label: 'Options', hint: 'sound, display, flight, keys',
        run: function () { G.title = null; G.menu = { page: 'options', sel: firstOption(), edit: null, note: null, fromTitle: true }; } },
      /* Last, and set apart by its hint rather than by a separator: it is the
       * only item here that does not come back. The hint tells the truth
       * about which build you are in before you press it, so nobody clicks a
       * button in a browser tab expecting the window to go away. */
      { label: 'Quit',
        hint: isDesktopShell() ? 'close the window — the autosave is committed first'
                               : 'a browser tab cannot close itself',
        run: quitGame }
    ];
  }

  function currentCareerLine() {
    if (!G.ship) return 'no career loaded';
    return G.sys.name + '  ·  ' + fmtCredits(G.ship.credits) + '  ·  ' + fmtEpoch(G.t);
  }

  /* ---- slots ------------------------------------------------------------ */

  function slotList() {
    return (global.Save && global.Save.slots) ? global.Save.slots() : [];
  }

  function slotLine(s) {
    if (!s.used) return 'empty';
    var m = s.meta || {};
    return (m.system || '?') + '  ·  ' + fmtCredits(m.credits || 0) +
           '  ·  ' + fmtEpoch(m.t || 0);
  }

  function slotWhen(s) {
    if (!s.used || !s.meta || !s.meta.written) return '';
    var d = new Date(s.meta.written);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* Saving asks for a name, because a list of six identical dates is not a
   * list you can choose from. The default is where you are, which is the
   * thing you would have typed anyway — Enter twice is the whole gesture. */
  function beginSlotSave(n) {
    if (!global.Save) { G.menu.note = 'No storage available in this browser.'; return; }
    G.menu.edit = {
      title: 'Name save ' + n,
      value: global.Save.autoLabel(G),
      max: 40,
      commit: function (text) {
        var ok = global.Save.writeSlot(n, G, text || global.Save.autoLabel(G));
        G.menu.note = ok ? ('Saved to slot ' + n + '.')
                         : ('Slot ' + n + ' could not be written — storage refused.');
        if (ok) HOOKS.sound('click');
      }
    };
  }

  function loadSlot(n) {
    var rec = global.Save && global.Save.readSlot(n);
    if (!rec) { G.menu.note = 'That slot is empty.'; return; }
    try {
      /* A slot carries its own seed, and loading one is allowed to change
       * which galaxy you are in — so the world is rebuilt from that seed
       * first and the snapshot goes into the rebuilt world, exactly the
       * order boot() uses. */
      newGame(rec.data.seed);
      global.Save.restore(G, rec.data, { enterSystem: enterSystem });
      G.menu = null;
      G.title = null;
      G.panel = 0;
      G.market = null;
      say('Loaded "' + rec.label + '" — ' + fmtCredits(G.ship.credits) + ', ' +
          fmtEpoch(G.t), 6);
    } catch (err) {
      console.error('slot load failed', err);
      if (G.menu) G.menu.note = 'That save could not be read.';
    }
  }

  function beginSeedEntry() {
    G.title.edit = {
      title: 'Seed for the new career',
      value: G.seed,
      max: 32,
      commit: function (text) {
        var seed = (text || '').trim() || G.seed;
        if (global.Save) global.Save.clear(seed);   // NEW means new
        newGame(seed);
        G.title = null;
        G.menu = null;
        G.panel = 0;
      }
    };
  }

  /* ---- options ----------------------------------------------------------
   * One table drives the drawing, the keyboard and the mouse, so a setting
   * cannot appear on screen without being adjustable or be adjustable
   * without appearing. Headings are rows too, and are skipped when the
   * selection moves — that is what makes them free to add. */
  function optionRows() {
    return [
      { kind: 'head', label: 'SOUND' },
      { kind: 'range', label: 'Volume', key: '',
        get: function () { return G.soundVolume; },
        set: function (v) { G.soundVolume = clamp01(v); applyAudioPrefs(); },
        step: 0.1,
        show: function () { return Math.round(G.soundVolume * 100) + '%'; } },
      { kind: 'toggle', label: 'Mute', key: '',
        get: function () { return !!G.soundMuted; },
        set: function (v) { G.soundMuted = !!v; applyAudioPrefs(); } },

      { kind: 'head', label: 'DISPLAY' },
      { kind: 'toggle', label: 'Orbit lines', key: 'O',
        get: function () { return G.showOrbits; },
        set: function (v) { G.showOrbits = v; } },
      { kind: 'toggle', label: 'Trajectory prediction', key: 'V',
        get: function () { return G.showPrediction; },
        set: function (v) { G.showPrediction = v; } },
      { kind: 'toggle', label: 'Ecliptic grid', key: 'G',
        get: function () { return G.showGrid; },
        set: function (v) { G.showGrid = v; } },
      { kind: 'toggle', label: 'Traffic', key: 'Y',
        get: function () { return G.showTraffic; },
        set: function (v) { G.showTraffic = v; } },
      { kind: 'choice', label: 'Cockpit chrome', key: 'K',
        options: ['Instrument band', 'Band stowed', 'Canopy only'],
        get: function () { return G.cockpitChrome || 0; },
        set: function (i) {
          G.cockpitChrome = i;
          G.showCockpitFrame = G.cockpitChrome !== 2;
        } },

      { kind: 'head', label: 'FLIGHT' },
      { kind: 'toggle', label: 'Flight assist', key: 'Shift+/',
        get: function () { return G.assist; },
        set: function (v) { G.assist = v; } },
      { kind: 'choice', label: 'Control frame', key: '/',
        options: ['Ship — nose and strafe', 'Orbital — prograde and radial'],
        get: function () { return G.flightMode === 'orbital' ? 1 : 0; },
        set: function (i) { G.flightMode = i ? 'orbital' : 'ship'; } },
      { kind: 'toggle', label: 'Mouse aim', key: 'F9',
        get: function () { return G.mouseAim; },
        set: function (v) { G.mouseAim = !!v; } },
      { kind: 'range', label: 'Aim sensitivity', key: '',
        get: function () { return G.aimSens; },
        set: function (v) { G.aimSens = Math.max(0.25, Math.min(3, v)); },
        step: 0.25,
        show: function () { return G.aimSens.toFixed(2) + '×'; } },

      { kind: 'head', label: 'REFERENCE' },
      { kind: 'action', label: 'Keybindings', key: 'H',
        run: function () { G.showHelp = true; G.menu = null; } }
    ];
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function firstOption() {
    var rows = optionRows();
    for (var i = 0; i < rows.length; i++) if (rows[i].kind !== 'head') return i;
    return 0;
  }

  function moveOptionSel(dir) {
    var rows = optionRows();
    var i = G.menu.sel;
    for (var guard = 0; guard < rows.length; guard++) {
      i = (i + dir + rows.length) % rows.length;
      if (rows[i].kind !== 'head') { G.menu.sel = i; return; }
    }
  }

  /* Left/right on a row, and Enter as "the obvious direction" — right for a
   * range, flip for a toggle, next for a choice.
   *
   * A toggle flips on left, right and Enter alike. It used to set absolutely
   * — right meant on, left meant off — which is coherent on its own but not
   * next to its neighbours: 'Control frame' is a two-option `choice`, drawn
   * as one value in the same column as a toggle's ON/off, and it flips on
   * either arrow because choices wrap. Two rows that look identical and
   * answer the same key differently is the bug, whichever half you call
   * correct. Toggles are two-option choices, so they wrap too. */
  function nudgeOption(row, dir) {
    if (!row) return;
    if (row.kind === 'toggle') row.set(!row.get());
    else if (row.kind === 'range') row.set(row.get() + (dir === 0 ? row.step : row.step * dir));
    else if (row.kind === 'choice') {
      var n = row.options.length;
      row.set((row.get() + (dir === 0 ? 1 : dir) + n) % n);
    } else if (row.kind === 'action' && (dir === 0 || dir > 0)) row.run();
    storePrefs();
  }

  /* ---- preferences ------------------------------------------------------ */

  function applyAudioPrefs() {
    if (!global.Sound) return;
    global.Sound.setVolume(G.soundMuted ? 0 : G.soundVolume);
    global.Sound.mute(!!G.soundMuted);
  }

  function storePrefs() {
    if (!global.Save || !global.Save.savePrefs) return;
    global.Save.savePrefs({
      soundVolume: G.soundVolume, soundMuted: !!G.soundMuted,
      showOrbits: !!G.showOrbits, showPrediction: !!G.showPrediction,
      showGrid: !!G.showGrid, showTraffic: !!G.showTraffic,
      cockpitChrome: G.cockpitChrome || 0,
      assist: !!G.assist, flightMode: G.flightMode,
      mouseAim: !!G.mouseAim, aimSens: G.aimSens,
      cockpitFov: G.cockpitFov
    });
  }

  function applyPrefs() {
    var p = (global.Save && global.Save.loadPrefs) ? global.Save.loadPrefs() : null;
    if (p) {
      if (typeof p.soundVolume === 'number') G.soundVolume = clamp01(p.soundVolume);
      if (typeof p.soundMuted === 'boolean') G.soundMuted = p.soundMuted;
      if (typeof p.showOrbits === 'boolean') G.showOrbits = p.showOrbits;
      if (typeof p.showPrediction === 'boolean') G.showPrediction = p.showPrediction;
      if (typeof p.showGrid === 'boolean') G.showGrid = p.showGrid;
      if (typeof p.showTraffic === 'boolean') G.showTraffic = p.showTraffic;
      if (typeof p.cockpitChrome === 'number') {
        G.cockpitChrome = p.cockpitChrome % 3;
        G.showCockpitFrame = G.cockpitChrome !== 2;
      }
      if (typeof p.assist === 'boolean') G.assist = p.assist;
      if (p.flightMode === 'ship' || p.flightMode === 'orbital') G.flightMode = p.flightMode;
      if (typeof p.mouseAim === 'boolean') G.mouseAim = p.mouseAim;
      if (typeof p.aimSens === 'number') G.aimSens = Math.max(0.25, Math.min(3, p.aimSens));
      if (typeof p.cockpitFov === 'number' && p.cockpitFov > 0) {
        G.cockpitFov = Math.max(FOV_MIN, Math.min(FOV_MAX, p.cockpitFov));
      }
    }
    applyAudioPrefs();
  }

  /* ---- the keyboard ----------------------------------------------------- */

  /* Text entry, shared by naming a slot and typing a seed. It is the only
   * place in the game that wants characters rather than commands, so it sits
   * in front of everything else while it is open. */
  function handleEditKey(edit, e, cancel) {
    var k = e.key;
    if (k === 'Escape') { cancel(); return true; }
    if (k === 'Enter') { var v = edit.value; cancel(); edit.commit(v); return true; }
    if (k === 'Backspace') { edit.value = edit.value.slice(0, -1); return true; }
    if (k.length === 1 && edit.value.length < edit.max) { edit.value += k; return true; }
    return true;                       // swallow everything: this is a field
  }

  function handleMenuKey(e) {
    e.preventDefault();
    var m = G.menu;
    if (m.edit) {
      handleEditKey(m.edit, e, function () { m.edit = null; });
      return;
    }
    var k = e.key.toLowerCase();
    m.note = null;

    if (k === 'escape') {
      if (m.page === 'main') { closeMenu(); return; }
      if (m.fromTitle) { G.menu = null; G.title = { sel: 0, edit: null, note: null }; return; }
      m.page = 'main'; m.sel = 0; return;
    }

    if (m.page === 'options') {
      var rows = optionRows();
      if (k === 'arrowup') { moveOptionSel(-1); return; }
      if (k === 'arrowdown') { moveOptionSel(1); return; }
      if (k === 'arrowleft') { nudgeOption(rows[m.sel], -1); return; }
      if (k === 'arrowright') { nudgeOption(rows[m.sel], 1); return; }
      if (k === 'enter' || k === ' ') { nudgeOption(rows[m.sel], 0); return; }
      return;
    }

    if (m.page === 'save' || m.page === 'load') {
      var slots = slotList();
      if (k === 'arrowup') { m.sel = (m.sel - 1 + slots.length) % slots.length; return; }
      if (k === 'arrowdown') { m.sel = (m.sel + 1) % slots.length; return; }
      if (k === 'enter') {
        var n = slots[m.sel] ? slots[m.sel].n : 0;
        if (!n) return;
        if (m.page === 'save') beginSlotSave(n);
        else loadSlot(n);
        return;
      }
      /* Deleting a save is the one destructive thing on this screen, so it
       * is on the destructive keys and nowhere near Enter. */
      if ((k === 'delete' || k === 'backspace') && slots[m.sel] && slots[m.sel].used) {
        global.Save.clearSlot(slots[m.sel].n);
        m.note = 'Slot ' + slots[m.sel].n + ' cleared.';
        return;
      }
      /* The digits pick a slot outright — six slots, six keys, no walking. */
      if (/^[1-6]$/.test(k)) {
        m.sel = parseInt(k, 10) - 1;
        if (m.page === 'save') beginSlotSave(m.sel + 1); else loadSlot(m.sel + 1);
        return;
      }
      return;
    }

    // main page
    var items = menuItems();
    if (k === 'arrowup') { m.sel = (m.sel - 1 + items.length) % items.length; return; }
    if (k === 'arrowdown') { m.sel = (m.sel + 1) % items.length; return; }
    if (k === 'enter' || k === ' ') { items[m.sel].run(); return; }
  }

  function handleTitleKey(e) {
    e.preventDefault();
    var t = G.title;
    if (t.edit) { handleEditKey(t.edit, e, function () { t.edit = null; }); return; }
    var k = e.key.toLowerCase();
    t.note = null;
    var items = titleItems();
    if (k === 'arrowup') { t.sel = (t.sel - 1 + items.length) % items.length; return; }
    if (k === 'arrowdown') { t.sel = (t.sel + 1) % items.length; return; }
    if (k === 'enter' || k === ' ') { items[t.sel].run(); return; }
    /* Escape out of the title screen resumes: it is a menu, not a wall. */
    if (k === 'escape') { G.title = null; return; }
  }

  /* ---- drawing ---------------------------------------------------------- */

  var MENU_W = 520;

  function menuShell(ctx, w, h, title, subtitle, rows) {
    /* Everything behind the menu stops being clickable. Leaving the icon bar
     * live under a modal is how you end up changing instrument page by
     * clicking "Resume". */
    G.hotspots = [];
    ctx.save();
    ctx.fillStyle = 'rgba(3,6,12,0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    var ph = Math.min(h - 60, 128 + rows * 30);
    var px = (w - MENU_W) / 2, py = (h - ph) / 2;
    panel(ctx, px, py, MENU_W, ph, true);

    ctx.save();
    ctx.font = '16px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText(title, px + 24, py + 34);
    if (subtitle) {
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = '#7fd6c0';
      ctx.fillText(subtitle, px + 24, py + 54);
    }
    ctx.restore();
    return { x: px, y: py, w: MENU_W, h: ph, top: py + 76 };
  }

  /* One row painter for every list on these screens, so the highlight, the
   * click target and the hover all behave the same wherever you are. */
  function menuRow(ctx, box, i, y, label, value, selected, onPick, dim) {
    var x = box.x + 18, rw = box.w - 36;
    if (selected) {
      ctx.save();
      ctx.fillStyle = 'rgba(120,190,235,0.16)';
      ctx.fillRect(x, y - 15, rw, 24);
      ctx.strokeStyle = 'rgba(140,210,245,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y - 14.5, rw - 1, 23);
      ctx.restore();
    }
    ctx.save();
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = dim ? '#6d86a4' : (selected ? '#eaf4ff' : '#bcd2ea');
    ctx.fillText(label, x + 12, y + 2);
    if (value !== null && value !== undefined && value !== '') {
      ctx.textAlign = 'right';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = dim ? '#5f7790' : (selected ? '#ffe6a8' : '#8fb4d6');
      ctx.fillText(String(value), x + rw - 12, y + 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    if (onPick) hot(x, y - 15, rw, 24, onPick);
  }

  function drawEditField(ctx, box, edit) {
    var x = box.x + 18, y = box.y + box.h - 62, rw = box.w - 36;
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,28,0.95)';
    ctx.fillRect(x, y, rw, 40);
    ctx.strokeStyle = 'rgba(140,210,245,0.6)';
    ctx.strokeRect(x + 0.5, y + 0.5, rw - 1, 39);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText(edit.title + '   —   Enter to confirm, Esc to cancel', x + 10, y + 14);
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = '#eaf4ff';
    /* A caret that does not blink: this screen is drawn every frame whether
     * anything changed or not, and a blinking one would be the only moving
     * thing on a stopped world. */
    ctx.fillText(edit.value + '_', x + 10, y + 31);
    ctx.restore();
  }

  /* Above the key hint, not on top of it — the hint is always there and the
   * note only sometimes, so the note is the one that has to move. */
  function drawMenuNote(ctx, box, note) {
    if (!note) return;
    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#ffd08a';
    ctx.fillText(note, box.x + 30, box.y + box.h - 40);
    ctx.restore();
  }

  function drawPauseMenu(ctx, w, h) {
    var m = G.menu;
    if (m.page === 'options') return drawOptionsPage(ctx, w, h);
    if (m.page === 'save' || m.page === 'load') return drawSlotsPage(ctx, w, h);

    var items = menuItems();
    var box = menuShell(ctx, w, h, 'PAUSED', currentCareerLine(), items.length + 1);
    for (var i = 0; i < items.length; i++) {
      (function (i) {
        menuRow(ctx, box, i, box.top + i * 30, items[i].label, items[i].hint, i === m.sel,
                function () { m.sel = i; items[i].run(); });
      })(i);
    }
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.55)';
    ctx.fillText('arrows move  ·  Enter chooses  ·  Esc resumes',
                 box.x + 30, box.y + box.h - 20);
    ctx.restore();
  }

  function drawSlotsPage(ctx, w, h) {
    var m = G.menu;
    var saving = m.page === 'save';
    var slots = slotList();
    var box = menuShell(ctx, w, h, saving ? 'SAVE GAME' : 'LOAD GAME',
                        saving ? 'six slots, any galaxy — the autosave is separate and untouched'
                               : 'a slot remembers its own seed, so loading can change galaxy',
                        slots.length + 2);
    for (var i = 0; i < slots.length; i++) {
      (function (i) {
        var s = slots[i];
        var label = s.n + '.  ' + (s.used ? s.label : '—');
        menuRow(ctx, box, i, box.top + i * 30, label,
                s.used ? slotLine(s) : 'empty', i === m.sel,
                function () {
                  m.sel = i;
                  if (saving) beginSlotSave(s.n); else loadSlot(s.n);
                },
                !s.used && !saving);
      })(i);
    }
    /* The wall-clock date of the highlighted slot, which is what actually
     * tells two similar careers apart — but only for the one you are on, so
     * the list stays readable. */
    var cur = slots[m.sel];
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.55)';
    ctx.fillText((cur && cur.used ? 'written ' + slotWhen(cur) + '   ·   ' : '') +
                 (saving ? '1-6 or Enter saves  ·  Del clears  ·  Esc back'
                         : '1-6 or Enter loads  ·  Del clears  ·  Esc back'),
                 box.x + 30, box.y + box.h - 20);
    ctx.restore();
    if (m.note) drawMenuNote(ctx, box, m.note);
    if (m.edit) drawEditField(ctx, box, m.edit);
  }

  function drawOptionsPage(ctx, w, h) {
    var m = G.menu;
    var rows = optionRows();
    var box = menuShell(ctx, w, h, 'OPTIONS',
                        'settings follow you, not the career — they are not in the save',
                        rows.length + 1);
    for (var i = 0; i < rows.length; i++) {
      var y = box.top + i * 26;
      var r = rows[i];
      if (r.kind === 'head') {
        ctx.save();
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = '#7fd6c0';
        ctx.fillText(r.label, box.x + 30, y + 2);
        ctx.restore();
        continue;
      }
      (function (i, r, y) {
        var val = r.kind === 'toggle' ? (r.get() ? 'ON' : 'off')
                : r.kind === 'choice' ? r.options[r.get()]
                : r.kind === 'range'  ? r.show()
                : '›';
        var label = r.label + (r.key ? '   [' + r.key + ']' : '');
        menuRow(ctx, box, i, y, label, val, i === m.sel,
                function () { m.sel = i; nudgeOption(r, 0); });
      })(i, r, y);
    }
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.55)';
    ctx.fillText('up/down moves  ·  left/right adjusts  ·  Enter toggles  ·  Esc back',
                 box.x + 30, box.y + box.h - 20);
    ctx.restore();
  }

  function drawTitleScreen(ctx, w, h) {
    var t = G.title;
    var items = titleItems();
    /* Opaque, not a dim: this is meant to read as having LEFT the game
     * rather than as another panel floating over the cockpit. */
    ctx.save();
    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    G.hotspots = [];

    var ph = 150 + items.length * 32;
    var px = (w - MENU_W) / 2, py = (h - ph) / 2;
    panel(ctx, px, py, MENU_W, ph, true);

    ctx.save();
    ctx.font = '20px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText('PROCEDURAL SPACE GAME', px + 24, py + 40);
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText('seed "' + G.seed + '"  —  ' + G.galaxy.stars.length + ' stars', px + 24, py + 60);
    ctx.restore();

    var box = { x: px, y: py, w: MENU_W, h: ph, top: py + 96 };
    for (var i = 0; i < items.length; i++) {
      (function (i) {
        menuRow(ctx, box, i, box.top + i * 32, items[i].label, items[i].hint, i === t.sel,
                function () { t.sel = i; items[i].run(); });
      })(i);
    }
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.55)';
    ctx.fillText('arrows move  ·  Enter chooses  ·  Esc resumes', px + 30, py + ph - 20);
    ctx.restore();
    if (t.note) drawMenuNote(ctx, box, t.note);
    if (t.edit) drawEditField(ctx, box, t.edit);
  }

  function drawHelp(ctx, w, h) {
    var lines = [
      ['GAME', ''],
      ['Esc', 'pause menu — save, load, options, quit to the main menu'],
      ['', 'and the main menu has Quit, which closes the window'],
      ['P', 'pause the clock without leaving the cockpit'],
      ['', ''],
      ['VIEW', ''],
      ['Enter', 'toggle cockpit view'],
      ['drag (in the cockpit)', 'look around — your head, not the ship'],
      ['Home', 'reset the view — centre your head, undo the zoom'],
      ['drag (outside)', 'orbit the exterior camera'],
      ['wheel / pinch', 'zoom — camera distance outside, canopy field of view in the seat'],
      ['+ / -', 'the same zoom on the keyboard (nudges a manoeuvre node while one is up)'],
      ['Tab / Shift+Tab', 'cycle camera focus through every body'],
      ['C', 'track the ship'],
      ['', ''],
      ['SCREENS  (F1 flies; every other key takes the whole display)', ''],
      ['F1', 'Main view — press again to flip cockpit / exterior chase camera'],
      ['F2', 'Orbit map — the system from outside, orbit lines on, like at boot'],
      ['F3', 'Local navigation — contacts, the lock, the scope, the autopilot'],
      ['F4', 'Comms — everyone in range you could talk to'],
      ['F5', 'Ship status and inventory — with a jettison control per cargo'],
      ['F6', 'Galaxy map and course plotter'],
      ['F7', 'Mission status'],
      ['F8', 'Jump to hyperspace — engages the course F6 laid in'],
      ['F9', 'Keyboard / mouse aim'],
      ['F10', 'Manoeuvre planning'],
      ['1…0', 'the same ten screens, for keyboards that argue about F-keys'],
      ['Esc', 'back to the cockpit from any screen'],
      ['click', 'the icon bar and everything on a screen is clickable'],
      ['', ''],
      ['NAVIGATION', ''],
      ['[ and ]', 'step the lock through everything in the system'],
      ['L', 'release the lock'],
      ['T', 'assign the docking clamp to a locked station'],
      ['J', 'slipspace chart'],
      ['', ''],
      ['SLIPSPACE WAKES  (red where a ship left, blue where one arrived)', ''],
      ['', 'they hang outside the last planet, each on the bearing of'],
      ['', 'wherever its ship was going — no scan key, the scanner reads'],
      ['', 'whatever you fly close to, and reads it better the fresher it is'],
      ['Shift+J', 'lay in a course after the wake the scanner can see,'],
      ['', 'and say whether you could actually beat them there'],
      ['', ''],
      ['IN THE CORRIDOR  (only when there is traffic on the lane)', ''],
      [', and .', 'throttle — a lever, not a tap. Match their speed to hold them'],
      ['Space', 'hold an interdiction lock on whoever you are alongside'],
      ['', ''],
      ['FLIGHT  (burn directions are shown as arrows, lower left)', ''],
      ['W / S', 'prograde / retrograde  —  raises or lowers the far side'],
      ['D / A', 'radial out / in'],
      ['R / F', 'normal + / −  —  changes inclination'],
      ['Shift', 'hold for 8% fine thrust'],
      ['X', 'cut thrust'],
      ['', ''],
      ['ATTITUDE  (where the nose points — independent of the burn above)', ''],
      ['Arrow Up / Down', 'pitch'],
      ['Arrow Left / Right', 'yaw'],
      ['Q / E', 'roll'],
      ['', ''],
      ['COMBAT  (buy better at any shipyard — F5 while docked)', ''],
      ['Space', 'fire group A down the nose  —  hold it'],
      ['Shift+Space', 'fire group B  —  assign guns to it on F5, FIT'],
      ['B', 'launch a missile at the locked ship  (respawns when crashed)'],
      ['', 'with F9 mouse aim on: mouse 1 and 2 are the two groups,'],
      ['', 'the middle button launches, and the nose follows the mouse'],
      ['', 'a beam strips shields, a pulse opens hulls — carry both'],
      ['', 'every shot heats your own hull; a bare one sheds 18/s'],
      ['', 'the turret, once fitted, fires itself at hostiles'],
      ['', 'shields soak hits and recharge when things go quiet'],
      ['', 'hull repairs cost credits at the yard; at zero you lose'],
      ['', 'the ship, the cargo and the fittings — never the career'],
      ['', ''],
      ['PIRACY  (F4, pick a ship, "Piracy…")', ''],
      ['', 'demand cargo or credits; armed threats work, empty ones amuse'],
      ['', 'a witness in range reports you at once. A victim takes ten'],
      ['', 'seconds to raise the alarm — silence it first and no one knows'],
      ['', 'wanted: police attack on sight and that faction refuses docking'],
      ['', 'surface pads still take you; pay the bounty off elsewhere'],
      ['', ''],
      ['FLYING  (two frames, one set of keys)', ''],
      ['/', 'switch between SHIP and ORBITAL frame'],
      ['', 'SHIP:    W/S drive the nose, A/D strafe, R/F up and down'],
      ['', 'ORBITAL: W/S prograde, A/D radial, R/F normal — for transfers'],
      ['Shift + /', 'flight assist on/off'],
      ['', 'assist spends spare thrust killing sideways drift relative to'],
      ['', 'whatever you have LOCKED, so point at a berth and hold W.'],
      ['', 'It needs a lock: against a planet it would fight your orbit'],
      ['', 'and it only wakes inside 150 km — it is a docking aid, not a'],
      ['', 'way to fly a transfer. Beyond that it says "standby"'],
      ['arrows / Q E', 'pitch and yaw  ·  roll'],
      ['hold Shift', 'fine thrust, 8% — use it for the last few metres'],
      ['', ''],
      ['THE LAW  (F4 — police channels are marked * at the top of the list)', ''],
      ['Enter', 'hail a police channel: what you owe, and your standing'],
      ['Y', 'pay the quoted settlement — quoted first, never on one press'],
      ['', 'a fugitive pays 1.2x; an ordinary bounty costs 1.6x in fees'],
      ['', 'a quote lasts a minute, then hail again'],
      ['', ''],
      ['DOCKING', ''],
      ['F4 then Enter', 'hail the selected port and ask for docking clearance'],
      ['', 'every port expects to be asked — orbital docks and surface pads'],
      ['', 'arriving unannounced is allowed, and is a fine: a strict system'],
      ['', 'charges properly, a frontier one grumbles. Never quite free'],
      ['', 'refused if you are wanted there, or the faction is hostile'],
      ['', 'clearance lasts until you use it or leave the system'],
      ['', 'open ground away from any pad needs no clearance at all —'],
      ['', 'which is how a wanted pilot still gets down somewhere'],
      ['U', 'undock'],
      ['', 'docking also refills the thruster tank, free'],
      ['', ''],
      ['LANDING GEAR', ''],
      ['Shift + G', 'raise / lower the gear'],
      ['', 'a landing pad will not catch you with it up, and touching down'],
      ['', 'on open ground without it writes the ship off at any speed'],
      ['', 'down it costs a third again in drag — free in vacuum, not in air'],
      ['', ''],
      ['TRADE  (jump fuel is a commodity — reach depends where you buy it)', ''],
      ['M', 'open the trade console while docked'],
      ['↑ ↓ / ← →', 'select a commodity  ·  sell / buy one tonne'],
      ['Shift + ← →', 'ten tonnes at a time'],
      ['Home / End', 'buy as many as fit  /  sell the lot'],
      ['F', 'fill the tank at the local hydrogen price'],
      ['', ''],
      ['THE HOLD  (F5)', ''],
      ['↑ ↓', 'pick a cargo'],
      ['Del', 'eject one tonne  ·  Shift+Del ejects the lot'],
      ['Backspace', 'eject radioactive waste from anywhere (forfeits the fee)'],
      ['', 'what you eject becomes a canister on your old trajectory —'],
      ['', 'it falls, it can be scanned, and anyone quick can collect it'],
      ['', 'fitted equipment is listed but has no eject control'],
      ['', ''],
      ['SALVAGE', ''],
      ['', 'a destroyed ship comes apart, and some of the pieces carry'],
      ['', 'what was still in its hold. drift onto one gently — under'],
      ['', '80 m and 20 m/s — and it goes aboard like any canister'],
      ['', 'on the radar: amber cross is worth taking, grey dot is scrap'],
      ['', 'wreckage clears after about a minute and a half, or when you leave'],
      ['', ''],
      ['MANOEUVRE NODES  (plan a burn, see the orbit, then fly it)', ''],
      ['I', 'place a node at the next apoapsis  ·  again cycles pro/nor/rad/time'],
      ['Shift + I', 'delete the node'],
      ['− / =', 'adjust the selected axis   (Shift fine, Ctrl coarse)'],
      [';  /  \'', 'snap the node to the next periapsis / apoapsis'],
      ['\\', 'fly it — the autopilot aligns, waits, burns, and hands back'],
      ['hold Left Alt', 'the mouse becomes a cursor: drag the coloured handles'],
      ['', 'the burn is planned as an impulse and flown for real, so the'],
      ['', 'engine lights at T minus half the burn time, not at the node'],
      ['', ''],
      ['SLIPSPACE', ''],
      ['J or F6', 'open the star chart'],
      ['↑ ↓ / Enter', 'pick a destination  /  lay in the course'],
      ['F8', 'engage the drive on the course you laid in'],
      ['', 'range comes out of the same tank — a full hold shortens your reach'],
      ['', 'days pass in transit, and the markets move while you are gone'],
      ['', ''],
      ['OTHER SHIPS', ''],
      ['freighters / shuttles', 'run scheduled cargo between ports'],
      ['interceptors', 'faction police — pirates will not work near them'],
      ['pirates', 'red diamond on radar; they interdict, they do not shoot'],
      ['C', 'hand over what a pirate demands  (otherwise outrun them)'],
      ['', 'a full hold halves your acceleration — being rich is what makes you catchable'],
      ['', ''],
      ['RADAR / COMPASS  (lower right — ship-nose-relative, not camera-relative)', ''],
      ['radar dots', 'everything within 0.75 AU  —  stem shows above/below'],
      ['yellow needle', 'bearing to the last massive body you were near/orbiting'],
      ['', ''],
      ['TIME', ''],
      [', / .', 'time warp down / up'],
      ['P', 'pause'],
      ['', ''],
      ['VIEW', ''],
      ['O', 'orbit lines'],
      ['V', 'predicted trajectory'],
      ['G', 'ecliptic grid'],
      ['Y', 'other ships'],
      ['Shift+T', 'match orbit with the lock (kill relative velocity)'],
      ['Shift+L', 'follow the lock and hold station off it'],
      ['K', 'band / console instruments / canopy only'],
      ['`', 'render scale 100 / 75 / 50% — draws the world smaller for frames,'],
      ['', 'instruments and labels stay sharp either way'],
      ['F11', 'full screen (in the desktop build)'],
      ['click a panel', 'change what that screen shows'],
      ['N', 'new galaxy from a seed you choose'],
      ['B', 'respawn above your start world after a crash'],
      ['H', 'close this']
    ];
    /* Two columns once the list outgrows the window, split at a section
     * break so a heading never ends up orphaned at the foot of a column.
     * The card has grown every time the game has, and a controls list you
     * have to scroll is a controls list nobody reads. */
    var lineH = 16, chrome = 60;
    var perCol = lines.length;
    var cols = 1;
    if (lines.length * lineH + chrome > h - 40) {
      cols = 2;
      perCol = Math.ceil(lines.length / 2);
      // Slide the break to the next blank separator so headings stay put.
      while (perCol < lines.length - 1 && lines[perCol][0] !== '') perCol++;
    }
    var colW = 520;
    var pw = colW * cols, ph = Math.min(h - 24, perCol * lineH + chrome);
    var px = (w - pw) / 2, py = (h - ph) / 2;
    panel(ctx, px, py, pw, ph, true);
    ctx.save();
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText('CONTROLS', px + 18, py + 26);
    ctx.font = '11px ui-monospace, monospace';
    for (var i = 0; i < lines.length; i++) {
      var col = Math.floor(i / perCol);
      if (col >= cols) break;
      var ox = px + col * colW;
      var y = py + 48 + (i - col * perCol) * lineH;
      if (y > py + ph - 8) continue;
      if (!lines[i][1]) {
        ctx.fillStyle = '#7fd6c0';
        ctx.fillText(lines[i][0], ox + 18, y);
      } else {
        ctx.fillStyle = '#cfe0ff';
        ctx.fillText(lines[i][0], ox + 18, y);
        ctx.fillStyle = '#8fa6c4';
        ctx.fillText(lines[i][1], ox + 180, y);
      }
    }
    ctx.restore();
  }

  /* ---- boot ----------------------------------------------------------- */

  /* Render scale applies to the world layer and to nothing else.
   *
   * The GL canvas is where the fragment cost lives — planets, atmospheres,
   * the sky — and it is the layer that survives being drawn small and
   * stretched, because it is all gradients. The 2D overlay is text: labels,
   * instrument numerals, the readouts you are supposed to be able to read.
   * Scaling that down would trade the thing the player looks at for frames
   * on the thing they look past. So the two canvases are the same size on
   * screen and different sizes in memory, which is what `GL.resize` taking
   * its own dpr was always for.
   *
   * A device preference, not a career one: it belongs to this machine's
   * GPU, so it is stored under its own key and survives N and a new seed.
   */
  var RENDER_SCALES = [1, 0.75, 0.5];
  var SCALE_KEY = 'psg1|renderScale';

  function loadRenderScale() {
    try {
      var v = parseFloat(localStorage.getItem(SCALE_KEY));
      if (RENDER_SCALES.indexOf(v) >= 0) return v;
    } catch (e) { /* storage can be absent or refuse */ }
    return 1;
  }

  function cycleRenderScale() {
    var i = RENDER_SCALES.indexOf(G.renderScale);
    G.renderScale = RENDER_SCALES[(i < 0 ? 0 : i + 1) % RENDER_SCALES.length];
    try { localStorage.setItem(SCALE_KEY, String(G.renderScale)); } catch (e) {}
    resize();
    var pct = Math.round(G.renderScale * 100);
    say('Render scale ' + pct + '%' +
        (G.renderScale === 1 ? ' — native' : ' — world upscaled, instruments sharp'), 3);
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    if (global.GLWorld && global.GLWorld.available) {
      global.GLWorld.resize(window.innerWidth, window.innerHeight,
                            dpr * (G.renderScale || 1));
    }
  }

  function boot() {
    canvas = document.getElementById('view');
    ctx = canvas.getContext('2d');
    /* The world layer. If WebGL2 is missing this stays false for the whole
     * session and every draw path below falls back to the 2D renderer, which
     * is still complete — an old driver should cost you weather, not the
     * game. */
    var glCanvas = document.getElementById('gl');
    if (glCanvas && global.GLWorld) global.GLWorld.init(glCanvas);
    G.renderScale = loadRenderScale();
    resize();
    window.addEventListener('resize', resize);
    bindInput();

    /* Hand the screens module everything it is allowed to touch. One call,
     * one object, and the dependency points one way: screens.js never
     * reaches back into this file. */
    global.Screens.bind({
      G: G,
      say: say, selectPanel: selectPanel, hot: hot,
      navList: navList, navTargetState: navTargetState, navMark: navMark,
      jettison: jettison, heldCargo: heldCargo,
      plottedCourse: plottedCourse, jumpCandidates: jumpCandidates,
      /* The wake read, handed over so the SCANNER page can quote the same
       * thing the world layer is captioning. One source, so the panel and
       * the label can never disagree about what the scanner can see. */
      wakesNow: wakesNow, bestWakeRead: bestWakeRead, wakeReadLine: wakeReadLine,
      doJump: doJump, complyWithDemand: complyWithDemand,
      /* The comms panel's buttons and its keyboard have to be the SAME
       * actions, or they drift apart and one of them starts lying. */
      hailAuthority: hailAuthority, payOutstanding: payOutstanding,
      hailSelected: hailSelected,
      scopeBody: scopeBody, rows: rows, panel: panel,
      bodyDotColor: bodyDotColor, setMouseAim: setMouseAim,
      fmtDist: fmtDist, fmtSpeed: fmtSpeed, fmtTime: fmtTime,
      fmtEpoch: fmtEpoch, fmtCredits: fmtCredits, fmtLy: fmtLy,
      clipText: clipText,
      pages: {
        system: drawSystemPage, chart: drawChartPage, orbit: drawOrbitPage,
        target: drawTargetPage, auto: drawAutoPage, node: drawNodePage,
        ship: drawShipPage
      },
      RADAR_RANGE: RADAR_RANGE,
      MFD_W: MFD_W, MFD_H: MFD_H,
      MFD_INK: MFD_INK, MFD_DIM: MFD_DIM, MFD_HOT: MFD_HOT, MFD_EDGE: MFD_EDGE
    });

    /* Settings before the world: they are this machine's, not this career's,
     * so they apply whichever seed boots and whether or not a save exists. */
    applyPrefs();

    var seed = decodeURIComponent((location.hash || '').replace(/^#/, '')) || 'kawartha';
    newGame(seed);

    /* If this seed has a career saved, pick it up where it left off. The
     * universe regenerated identically from the seed a moment ago; the save
     * carries only what the player did to it. N starts over. */
    if (global.Save) {
      var saved = global.Save.load(seed);
      if (saved) {
        try {
          global.Save.restore(G, saved, { enterSystem: enterSystem });
          say('Career restored — ' + fmtCredits(G.ship.credits) + ', ' +
              fmtEpoch(G.t) + '. N starts a fresh one.', 6);
        } catch (err) {
          console.error('save restore failed', err);
          say('Save was unreadable — starting fresh', 5);
        }
      }
      window.addEventListener('beforeunload', function () {
        if (G.ship && !G.ship.crashed) global.Save.store(G);
        /* Settings are written here rather than on every keystroke: the
         * display toggles and the zoom live on keys you press constantly,
         * and touching localStorage on each of them would be a disk write
         * per wheel notch. The options page writes immediately because it
         * is a place you leave, not a key you hold. */
        storePrefs();
      });
    }

    /* A seed in the URL is the natural way to share a system: paste
     * ...index.html#kawartha and you get that exact universe. Changing the
     * fragment on an already-loaded page does not reload it, so listen for
     * the change and rebuild. */
    window.addEventListener('hashchange', function () {
      var sd = decodeURIComponent((location.hash || '').replace(/^#/, ''));
      if (sd && sd !== G.seed) newGame(sd);
    });

    var last = performance.now();
    (function frame(now) {
      var dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      G.fps = G.fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;
      try {
        update(dt);
        draw();
        /* Flush the world layer AFTER the whole frame has been walked, not
         * partway through it. Ships and stations are queued well after the
         * planets are, and draw() has several early returns — hyperspace,
         * the full-screen modes — that would each have to remember to
         * flush. Out here there is exactly one exit and it cannot be
         * missed. Ordering within the frame does not matter: the GL canvas
         * is composited by the DOM, not by draw order. */
        if (glLive()) global.GLWorld.end();
      } catch (err) {
        console.error(err);
        ctx.fillStyle = '#ff8080';
        ctx.font = '13px monospace';
        ctx.fillText('error: ' + err.message, 20, 200);
      }
      requestAnimationFrame(frame);
    })(last);
  }

  G.newGame = newGame;
  /* Exposed for the same reason newGame is: a headless playtest needs to be
   * able to arrive somewhere without starting a career. It is also the hook
   * Save.restore already takes, so this is not a new entry point into the
   * world — it is the existing one, named. */
  G.enterSystem = enterSystem;
  /* One hand-cranked frame. The browser parks requestAnimationFrame the
   * moment the tab is hidden, which is correct for players and useless for
   * a script trying to playtest through a hidden pane — this is the crank
   * handle on the side of the engine. */
  G.step = function (dt) { update(dt || 0.016); draw(); };
  /* The same object combat and missions are handed. Exposed so a test — or
   * a console — can put the ship through something the game would do to it
   * rather than reaching in and setting the aftermath by hand. */
  G.hooks = HOOKS;
  global.Game = G;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
