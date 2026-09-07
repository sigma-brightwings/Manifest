/* generate.js — the universe, from one number.
 *
 * Everything below is derived from the seed through NAMED substreams
 * (rng.fork). That means the star's properties don't depend on how many
 * moons we happened to roll, and adding a new feature next week won't
 * rewrite systems that already exist. Seed "kawartha" is the same star
 * system today, next month, and after we add hyperspace.
 *
 * The generator also enforces physical constraints rather than hoping for
 * them: no crossing orbits, nothing orbiting inside its parent's surface,
 * and no moon or station outside its parent's Hill sphere (where the star
 * would tear it away). Those are checked by the test suite over 200 seeds.
 */
(function (global) {
  'use strict';

  var V = global.V || require('./vec3.js');
  var K = global.Kepler || require('./kepler.js');
  var RNG = global.RNG || require('./rng.js');
  var Eco = global.Economy || require('./economy.js');

  /* ---- the reference ship ----------------------------------------------
   * The player's hull lives here rather than in sim.js because the WORLD
   * has to be built around it. A starport is only a starport if a loaded
   * ship can get off the pad again, so the generator needs to know what a
   * ship can do before it decides where ports may exist — and if that
   * number were duplicated in two files it would drift, and the drift would
   * show up as a world you can land on and never leave.
   *
   * kN divided by tonnes is exactly m/s^2, so MAX_SURFACE_G below is
   * directly comparable to a world's surface gravity.
   *
   * The margin is not decoration. Thrust equal to weight is a hover, not a
   * launch: you would sit on the pad burning reaction mass forever. 1.15
   * says a fully laden ship must be able to climb at about 1.6 m/s^2 off
   * the worst pad in the galaxy. */
  var SHIP_SPEC = {
    dryMass: 42,           // tonnes
    thrustKN: 1800,
    thrusterIsp: 450000,   // seconds — a torch, and it has to be
    thrusterFuel: 12, thrusterCap: 12,
    fuel: 28, fuelCap: 28,
    cargoCap: 64,
    credits: 3200
  };
  var LIFT_MARGIN = 1.15;

  function ladenMass(spec) {
    return spec.dryMass + spec.fuelCap + spec.thrusterCap + spec.cargoCap;
  }
  /* The heaviest world a full ship can leave, in m/s^2. */
  var MAX_SURFACE_G = (SHIP_SPEC.thrustKN / ladenMass(SHIP_SPEC)) / LIFT_MARGIN;

  /* Surface gravity of a body, in m/s^2. mu is km^3/s^2 and radius is km,
   * so mu/r^2 comes out in km/s^2 and wants a factor of a thousand. */
  function surfaceGravity(body) {
    var mu = body.mu !== undefined ? body.mu : V.G * body.mass;
    return (mu / (body.radius * body.radius)) * 1000;
  }

  var AU = 1.495978707e8;      // km
  var M_SUN = 1.98892e30;      // kg
  var M_EARTH = 5.9722e24;     // kg
  var R_SUN = 696340;          // km
  var DEG = Math.PI / 180;

  /* Spectral classes, weighted toward the small dim stars that actually
   * dominate the galaxy. mass in solar masses, temp in K. */
  var STAR_CLASSES = [
    { cls: 'M', w: 40, mass: [0.20, 0.50], temp: [2800, 3700], color: '#ff7a52' },
    { cls: 'K', w: 24, mass: [0.55, 0.85], temp: [3900, 5200], color: '#ffb26b' },
    { cls: 'G', w: 18, mass: [0.90, 1.10], temp: [5300, 5900], color: '#fff3c4' },
    { cls: 'F', w: 12, mass: [1.10, 1.55], temp: [6100, 7200], color: '#ffffff' },
    { cls: 'A', w: 6,  mass: [1.70, 2.40], temp: [7600, 9800], color: '#cfe0ff' }
  ];

  var PLANET_TYPES = {
    molten:   { density: 5400, color: '#c4553a', albedo: 0.08, name: 'Molten' },
    rocky:    { density: 5200, color: '#9a8f82', albedo: 0.14, name: 'Rocky' },
    desert:   { density: 4900, color: '#c9a06a', albedo: 0.28, name: 'Desert' },
    terran:   { density: 5500, color: '#5b8f6f', albedo: 0.30, name: 'Terran' },
    ocean:    { density: 5000, color: '#3f7fa8', albedo: 0.32, name: 'Ocean' },
    tundra:   { density: 4600, color: '#8fa3ac', albedo: 0.45, name: 'Tundra' },
    iceball:  { density: 2200, color: '#d7e6ee', albedo: 0.60, name: 'Ice' },
    iceGiant: { density: 1600, color: '#6fb6c9', albedo: 0.48, name: 'Ice giant' },
    gasGiant: { density: 1300, color: '#d9b48a', albedo: 0.50, name: 'Gas giant' }
  };

  /* Atmospheres, per world type.
   *
   *   rho0        surface density, kg/m^3 (Earth is 1.225, Mars about 0.020)
   *   scaleHeight km — the altitude over which density falls by 1/e
   *   cloud       0..1, how much of the sky is opaque weather
   *
   * An exponential atmosphere is a lie with a long history: real ones have
   * temperature structure this ignores completely. It is the right lie here
   * because everything the game asks of an atmosphere — how fast an orbit
   * decays, how hot the nose gets, where the sky stops — depends only on
   * density against altitude, and one exponential gets that right to well
   * inside the accuracy of anything else in the flight model.
   *
   * A null entry is genuine vacuum: no drag, no heating, no limb glow, and
   * no reason to buy a heat shield to land there.
   *
   * `cloud` is stored but not yet drawn. Weather is a rendering problem and
   * the renderer cannot express it today — but the VALUE has to be seeded
   * here with everything else, or the same world grows different clouds in
   * different sessions, which is the one thing this generator must never
   * do. */
  var ATMOSPHERES = {
    molten:   { rho0: 4.20,  scaleHeight: 13.0, cloud: 0.35 },  // thick, hot, opaque
    rocky:    null,                                             // airless
    desert:   { rho0: 0.022, scaleHeight: 11.2, cloud: 0.08 },  // Mars-thin
    terran:   { rho0: 1.225, scaleHeight: 8.5,  cloud: 0.55 },
    ocean:    { rho0: 1.310, scaleHeight: 8.8,  cloud: 0.72 },  // wet worlds are cloudy
    tundra:   { rho0: 0.680, scaleHeight: 9.6,  cloud: 0.40 },
    iceball:  { rho0: 0.004, scaleHeight: 7.0,  cloud: 0.02 },  // barely there
    iceGiant: { rho0: 0.450, scaleHeight: 27.0, cloud: 0.65 },
    gasGiant: { rho0: 1.050, scaleHeight: 41.0, cloud: 0.85 }
  };

  /* Above this many scale heights the density is under 1e-5 of surface and
   * nothing in the flight model can feel it. Having an explicit ceiling lets
   * every consumer early-out on one cheap comparison instead of evaluating
   * an exponential that was always going to return roughly zero. */
  var ATMO_SCALE_HEIGHTS = 12;

  /* A big moon's thin envelope. Low density over a tall scale height,
   * because a small body's weak gravity spreads what little air it has out
   * a long way — which is why it bites on a fast entry and does nothing at
   * all to a parked orbit. */
  function traceAtmosphere(rng) {
    var sh = rng.range(14, 24);
    return {
      rho0: rng.range(0.05, 0.35),
      scaleHeight: sh,
      top: sh * ATMO_SCALE_HEIGHTS,
      cloud: rng.range(0.10, 0.50)
    };
  }

  function makeAtmosphere(type, rng) {
    var def = ATMOSPHERES[type];
    if (!def) return null;
    /* Vary it per world, but keep the type recognisable: a terran world is
     * always breathable-thick, never accidentally a gas giant. */
    var rho0 = def.rho0 * rng.range(0.65, 1.55);
    var sh = def.scaleHeight * rng.range(0.85, 1.20);
    return {
      rho0: rho0,
      scaleHeight: sh,
      top: sh * ATMO_SCALE_HEIGHTS,
      cloud: Math.max(0, Math.min(1, def.cloud * rng.range(0.6, 1.4)))
    };
  }

  var SYL_A = ['ka', 've', 'thal', 'or', 'sy', 'mir', 'dra', 'ael', 'no', 'zu',
               'per', 'lin', 'gor', 'ta', 'ish', 'bel', 'cy', 'rho', 'un', 'sef'];
  var SYL_B = ['ran', 'dor', 'is', 'aq', 'ven', 'tar', 'eth', 'ul', 'ora', 'ynx',
               'ame', 'ost', 'ira', 'uun', 'ex', 'olm', 'ade', 'ysh'];
  var STATION_PRE = ['Anchor', 'Waypoint', 'Halden', 'Keel', 'Lantern', 'Meridian',
                     'Coldwater', 'Tessellate', 'Pilgrim', 'Longshore', 'Ferrier',
                     'Kestrel', 'Aubade', 'Threshold', 'Quiet', 'Marrow'];
  var STATION_SUF = ['Station', 'Depot', 'Yard', 'Platform', 'Relay', 'Dock',
                     'Terminal', 'Post', 'Array'];

  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
               'XI', 'XII', 'XIII', 'XIV'];
  var LETTERS = 'abcdefghijklmnop';

  function weightedPick(rng, list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].w;
    var roll = rng.next() * total;
    for (i = 0; i < list.length; i++) {
      roll -= list[i].w;
      if (roll <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  function makeName(rng) {
    var n = rng.pick(SYL_A) + rng.pick(SYL_B);
    if (rng.chance(0.3)) n += rng.pick(['a', 'is', 'or', 'ai', 'en']);
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  // Radius in km from mass (kg) and density (kg/m^3).
  function radiusFromMass(massKg, density) {
    var volumeM3 = massKg / density;
    var radiusM = Math.pow(3 * volumeM3 / (4 * Math.PI), 1 / 3);
    return radiusM / 1000;
  }

  function hillRadius(bodyMass, parentMass, a, e) {
    return a * (1 - e) * Math.pow(bodyMass / (3 * parentMass), 1 / 3);
  }

  /* Planet type from where it sits, judged by INSOLATION (how much starlight
   * it actually receives, in Earth units) rather than by raw distance. A
   * planet 0.1 AU from a dim red dwarf and one 1 AU from a bright F star are
   * comparably warm; keying off distance alone made every system's innermost
   * world a lava planet, which is neither varied nor true. */
  function classify(aAU, frostAU, hzInner, hzOuter, insol, rng) {
    if (aAU > frostAU * 1.15) {
      // Beyond the frost line, a planet can hold onto its volatiles.
      if (rng.chance(0.55)) return 'gasGiant';
      if (rng.chance(0.6)) return 'iceGiant';
      return 'iceball';
    }
    if (insol > 6) return 'molten';              // >6x Earth's sunlight
    if (aAU >= hzInner && aAU <= hzOuter) {
      return rng.pick(['terran', 'terran', 'ocean', 'desert', 'tundra']);
    }
    if (aAU < hzInner) {
      return insol > 2.5
        ? rng.pick(['rocky', 'desert', 'molten', 'desert'])
        : rng.pick(['rocky', 'rocky', 'desert', 'tundra']);
    }
    return rng.pick(['tundra', 'iceball', 'rocky']);
  }

  /* Just the star, for a fraction of the cost of the whole system.
   *
   * A galaxy map needs a name, a class and a colour for a hundred and fifty
   * stars at once, and generating a hundred and fifty complete planetary
   * systems to print a hundred and fifty labels would be absurd. This draws
   * from the SAME 'star' substream in the SAME order as generateSystem, so
   * the preview and the real thing can never disagree — which they would,
   * silently and permanently, if this were a second implementation. */
  function starPreview(seed) {
    var sr = new RNG(seed).fork('star');
    var klass = weightedPick(sr, STAR_CLASSES);
    var massSol = sr.range(klass.mass[0], klass.mass[1]);
    var name = makeName(sr);
    var temp = Math.round(sr.range(klass.temp[0], klass.temp[1]));
    return {
      seed: seed, name: name, cls: klass.cls, color: klass.color,
      massSol: massSol, mass: massSol * M_SUN,
      luminosity: Math.pow(massSol, 3.5),
      radius: R_SUN * Math.pow(massSol, 0.8),
      temp: temp
    };
  }

  function generateSystem(seed, opts) {
    opts = opts || {};
    var base = new RNG(seed);
    var id = 0;

    /* --- the star ------------------------------------------------------ */
    var pre = starPreview(seed);
    var starMass = pre.mass;
    var luminosity = pre.luminosity;
    var starName = pre.name;

    var star = {
      id: 'b0', name: starName, kind: 'star', type: pre.cls,
      mass: starMass, radius: pre.radius, color: pre.color,
      temp: pre.temp,
      luminosity: luminosity, orbit: null, children: []
    };
    id = 1;

    /* Frost line and habitable zone both scale with the square root of
     * luminosity (equal-insolation surfaces).
     *
     * The HZ bounds are the OPTIMISTIC ones — the recent-Venus and
     * early-Mars limits, ~0.75 to ~1.77 — rather than the conservative
     * runaway-greenhouse pair (0.95–1.67) this used before. Both are real
     * numbers out of the exoplanet literature and the optimistic pair is
     * the one that says "could have held liquid water at some point",
     * which is the right question for a game about places people settled.
     *
     * It also fixes a geometry problem. Orbits step by a factor of
     * 1.30–1.75 each (below), so a zone spanning a ratio of 1.76 was
     * BARELY ONE ORBITAL SLOT WIDE: most systems dropped no planet in it
     * at all, and none could ever hold two. At 2.36 the zone is wide
     * enough that a system can have two neighbours in it, which is what
     * makes a settled system feel settled. */
    var frostAU = 2.7 * Math.sqrt(luminosity);
    var hzInner = 0.75 * Math.sqrt(luminosity);
    var hzOuter = 1.77 * Math.sqrt(luminosity);

    /* --- planetary orbits --------------------------------------------- */
    var pr = base.fork('planet-orbits');
    var count = pr.int(opts.minPlanets || 6, opts.maxPlanets || 12);
    var axes = [];
    var a = pr.range(0.22, 0.55) * Math.sqrt(luminosity) * AU;
    for (var i = 0; i < count; i++) {
      axes.push(a);
      /* Titius-Bode-ish geometric spacing with jitter.
       *
       * The old floor of 1.42 was described as guaranteeing the
       * non-crossing constraint, but the actual constraint is looser than
       * that: two orbits do not cross while a₁(1+e) < a₂(1−e), and this
       * generator caps eccentricity at 0.09 (below), so the true floor is
       * 1.09/0.91 = 1.198. 1.30 keeps a comfortable margin over that and
       * fits noticeably more worlds into the habitable zone, which is the
       * whole point of the change. */
      a *= pr.range(1.30, 1.75);
    }

    var planets = [];
    for (var p = 0; p < axes.length; p++) {
      var prng = base.fork('planet-' + p);
      var aAU = axes[p] / AU;
      var insol = luminosity / (aAU * aAU);     // Earth = 1
      var type = classify(aAU, frostAU, hzInner, hzOuter, insol, prng);
      var def = PLANET_TYPES[type];

      var massKg;
      if (type === 'gasGiant') massKg = prng.logRange(60, 900) * M_EARTH;
      else if (type === 'iceGiant') massKg = prng.logRange(9, 45) * M_EARTH;
      else massKg = prng.logRange(0.06, 4.2) * M_EARTH;

      // Eccentricity: mostly near-circular, as real systems are.
      var ecc = Math.min(0.09, Math.abs(prng.gauss(0, 0.035)));
      // Inclination: a few degrees is realistic, but a system where every
      // orbit is coplanar wastes a 3D view, so one planet in six is a
      // "wanderer" on a steeply tilted orbit.
      var inc = prng.chance(0.16)
        ? prng.range(12, 31) * DEG
        : Math.abs(prng.gauss(0, 2.4)) * DEG;

      var planet = {
        id: 'b' + (id++), name: starName + ' ' + ROMAN[p],
        kind: 'planet', type: type, typeName: def.name,
        mass: massKg, radius: radiusFromMass(massKg, def.density),
        color: def.color, albedo: def.albedo,
        insolation: luminosity / (aAU * aAU),
        habitable: (aAU >= hzInner && aAU <= hzOuter &&
                    (type === 'terran' || type === 'ocean')),
        atmosphere: makeAtmosphere(type, prng),
        orbit: {
          parent: star.id, a: axes[p], e: ecc, inc: inc,
          lan: prng.angle(), argp: prng.angle(), m0: prng.angle()
        },
        children: []
      };
      star.children.push(planet);
      planets.push(planet);
    }

    /* --- moons --------------------------------------------------------- */
    for (var q = 0; q < planets.length; q++) {
      var pl = planets[q];
      var mrng = base.fork('moons-' + q);
      var isGiant = (pl.type === 'gasGiant' || pl.type === 'iceGiant');
      var nMoons = isGiant ? mrng.int(1, 5) : (mrng.chance(0.55) ? mrng.int(1, 2) : 0);

      var hill = hillRadius(pl.mass, star.mass, pl.orbit.a, pl.orbit.e);
      // Stay well inside the Hill sphere: beyond about half of it, orbits are
      // not stable against the star's tug over long timescales.
      var aMax = Math.min(hill * 0.40, pl.radius * 90);
      var aMin = pl.radius * 2.8;
      if (aMax <= aMin * 1.3) nMoons = 0;

      var moonA = aMin * mrng.range(1.0, 1.6);
      for (var m = 0; m < nMoons; m++) {
        if (moonA > aMax) break;
        var mDensity = mrng.range(2100, 3600);
        var mRadius = mrng.logRange(80, Math.min(2600, pl.radius * 0.42));
        var mMass = (4 / 3) * Math.PI * Math.pow(mRadius * 1000, 3) * mDensity;
        var mEcc = Math.min(0.05, Math.abs(mrng.gauss(0, 0.018)));
        // Keep apoapsis inside the safe zone even after eccentricity.
        if (moonA * (1 + mEcc) > aMax) break;

        pl.children.push({
          id: 'b' + (id++), name: pl.name + ' ' + LETTERS[m],
          kind: 'moon', type: 'moon',
          /* Small bodies do not hold onto air. Only the big ones get a
           * trace of it, which is enough to matter on a fast entry and not
           * enough to slow a parked orbit — the Titan case. */
          atmosphere: (mRadius > 1500 && mrng.chance(0.35))
            ? traceAtmosphere(mrng) : null,
          typeName: mrng.chance(0.25) ? 'Ice moon' : 'Rocky moon',
          mass: mMass, radius: mRadius,
          color: mrng.chance(0.25) ? '#cfe3ea' : '#8d8579',
          orbit: {
            parent: pl.id, a: moonA, e: mEcc,
            inc: Math.abs(mrng.gauss(0, 3.5)) * DEG,
            lan: mrng.angle(), argp: mrng.angle(), m0: mrng.angle()
          },
          children: []
        });
        moonA *= mrng.range(1.55, 2.4);
      }
    }

    /* --- space stations ------------------------------------------------- */
    /* Stations hang in near-circular orbits above the more interesting
     * worlds. They are on rails like everything else, so a docking approach
     * you plan today is still valid a thousand orbits from now. */
    var strng = base.fork('stations');
    var hosts = planets.slice().sort(function (x, y) {
      // Prefer habitable worlds, then giants (moons to mine), then the rest.
      var sx = (x.habitable ? 3 : 0) + (x.type === 'gasGiant' ? 2 : 0) + (x.children.length ? 1 : 0);
      var sy = (y.habitable ? 3 : 0) + (y.type === 'gasGiant' ? 2 : 0) + (y.children.length ? 1 : 0);
      if (sy !== sx) return sy - sx;
      return x.orbit.a - y.orbit.a; // stable tiebreak keeps this deterministic
    });
    var nStations = Math.min(hosts.length, strng.int(2, 4));
    /* How many worlds in this system anybody bothered to put a station
     * over is the most VISIBLE thing the settlement pressure controls —
     * development numbers are a readout, an empty sky is a feeling. So
     * pressure adds or removes a whole station here.
     *
     * The extra draw is taken only when the knob is off its default, which
     * is what keeps pressure 1.0 byte-identical to the generator this
     * replaced: same sequence, same systems. */
    var _p = Eco.SETTLEMENT.pressure;
    if (_p !== 1) {
      var _u = strng.range(0, 1);
      if (_p > 1 && _u < 0.45 * (_p - 1)) nStations++;
      if (_p < 1 && _u < 0.55 * (1 - _p)) nStations--;
      nStations = Math.max(1, Math.min(hosts.length, nStations));
    }
    for (var s = 0; s < nStations; s++) {
      var host = hosts[s];
      var hHill = hillRadius(host.mass, star.mass, host.orbit.a, host.orbit.e);
      var aStation = host.radius * strng.range(1.35, 4.5);
      if (aStation > hHill * 0.3) aStation = Math.max(host.radius * 1.15, hHill * 0.25);
      var stEcc = strng.range(0, 0.004);
      if (aStation * (1 - stEcc) < host.radius * 1.08) aStation = host.radius * 1.12;

      var stRadius = strng.range(0.6, 3.2); // km across
      host.children.push({
        id: 'b' + (id++),
        name: strng.pick(STATION_PRE) + ' ' + strng.pick(STATION_SUF),
        kind: 'station', type: 'station', typeName: 'Station',
        mass: strng.range(4e8, 9e9),   // real, but gravitationally irrelevant
        radius: stRadius,
        color: '#f2f7ff',
        docking: true,
        // How close, and how slow, counts as a successful docking approach.
        // Generous by real-world standards on purpose — this is a game, and
        // fumbling the last 50 m of a manual approach because the capture
        // envelope was modeled on the ISS's is not the difficulty we want.
        dockCaptureRadius: stRadius * 4,
        dockMaxSpeed: 0.006,   // 6 m/s relative
        orbit: {
          parent: host.id, a: aStation, e: stEcc,
          inc: strng.range(0, 6) * DEG,
          lan: strng.angle(), argp: strng.angle(), m0: strng.angle()
        },
        children: []
      });
    }

    /* --- second and third ports ------------------------------------------
     * A habitable world is a place people actually live, and one dock for a
     * whole planet reads as a diagram rather than a destination. Every
     * habitable world therefore gets AT LEAST two ports, and busy ones can
     * get a third — which is also what makes local traffic possible, since
     * a shuttle needs somewhere to shuttle to.
     *
     * This deliberately runs as its own named substream rather than being
     * folded into the block above. The stations generated before this point
     * come out of `fork('stations')` and are untouched by anything here, so
     * every port that existed in a given seed before today is still in the
     * same orbit around the same world with the same name. Adding ports is
     * additive; it does not rewrite anyone's system. */
    var por = base.fork('ports');
    var hostsNeedingMore = [];
    for (var hp = 0; hp < planets.length; hp++) {
      var cand = planets[hp];
      var have = cand.children.filter(isStation).length;
      /* The settlement chain's `fSettled` term — how many separate places
       * on one world are worth calling at. A frontier galaxy answers "one,
       * and be grateful"; a settled one puts a second city on a rock. */
      var want = cand.habitable ? (Eco.pressuredChance(por, 0.4) ? 3 : 2)
               : (have > 0 && Eco.pressuredChance(por, 0.45) ? 2 : have);
      if (want > have) hostsNeedingMore.push({ planet: cand, want: want, have: have });
    }
    /* If a system rolled no habitable world at all, make sure SOMETHING has
     * two ports, or there is nowhere for local traffic to run between and
     * the system reads as dead. */
    if (!hostsNeedingMore.length) {
      var fallback = null;
      for (var fb = 0; fb < planets.length; fb++) {
        if (planets[fb].children.filter(isStation).length === 1) { fallback = planets[fb]; break; }
      }
      if (fallback) hostsNeedingMore.push({ planet: fallback, want: 2, have: 1 });
    }

    for (var hm = 0; hm < hostsNeedingMore.length; hm++) {
      var entry = hostsNeedingMore[hm];
      var hostP = entry.planet;
      var used = hostP.children.filter(isStation).map(function (c) { return c.orbit.a; });
      for (var extra = entry.have; extra < entry.want; extra++) {
        var st = makeStation(hostP, star, por, used);
        if (!st) break;
        st.id = 'b' + (id++);
        hostP.children.push(st);
        used.push(st.orbit.a);
      }
    }

    /* --- surface starports -----------------------------------------------
     * The hard rule, and the reason MAX_SURFACE_G exists at the top of this
     * file: a port is only a port if a fully loaded ship can leave it. A
     * pad on a world whose gravity beats the drive is not a difficult
     * destination, it is a trap with a market attached — you would land,
     * trade, and then discover the game had quietly ended.
     *
     * So the gravity check comes first and nothing overrides it. Gas and
     * ice giants are excluded for the simpler reason that there is nothing
     * down there to land on. */
    var spr = base.fork('surface-ports');
    /* A separate, independently-seeded stream for the underground/open
     * decision. Keeping it off `spr` means adding this feature does not
     * consume an extra draw from the existing sequence, so every pad's
     * name, latitude, longitude and radius come out exactly as they did
     * before this feature existed — same seed, same systems, plus one
     * new fact about each pad. */
    var ugr = base.fork('underground-bays');
    var landable = [];
    for (var lp = 0; lp < planets.length; lp++) {
      collectLandable(planets[lp], landable);
      for (var lm = 0; lm < planets[lp].children.length; lm++) {
        collectLandable(planets[lp].children[lm], landable);
      }
    }
    for (var li = 0; li < landable.length; li++) {
      var world = landable[li];
      var wantPads = world.habitable ? (spr.chance(0.35) ? 2 : 1)
                   : (spr.chance(world.kind === 'moon' ? 0.30 : 0.38) ? 1 : 0);
      for (var pd = 0; pd < wantPads; pd++) {
        var padPort = makeSurfacePort(world, spr, pd, ugr);
        padPort.id = 'b' + (id++);
        world.children.push(padPort);
      }
    }

    var sys = finalize({
      root: star, seed: seed, seedHash: base.seed,
      name: starName,
      frostLine: frostAU * AU, hzInner: hzInner * AU, hzOuter: hzOuter * AU
    });

    buildRotations(sys, base);
    buildFactions(sys, base, opts);
    buildEconomy(sys, base);
    buildGovernment(sys, base);
    buildTraffic(sys, base);
    buildPatrols(sys, base);
    buildContraband(sys, base);
    buildPortDressing(sys, base);
    return sys;
  }

  /* --- interstellar space -------------------------------------------------
   * Where a ship lands when it is torn out of a corridor between two stars.
   *
   * The obvious way to build this would have been a special "no bodies"
   * locale and a pile of branches through the sim and the renderer to keep
   * dominantBody, localVertical, the attitude ladder, the radar and the
   * trajectory plotter from dividing by a universe that is not there. That
   * would have been a lot of code whose only job was to describe an absence.
   *
   * So it is not built that way. An interstellar locale is an ORDINARY
   * system, finalized by the ordinary function, containing exactly one body:
   * the nearer of the two stars, with no planets, and the ship sitting about
   * a light year away from it. Nothing in the engine needs to know anything
   * new. Gravity at that range is around 1e-13 m/s^2, so the physics is free
   * flight because it genuinely IS free flight rather than because a flag
   * said so; the star draws as a marker ring because it is under two pixels;
   * dominantBody still answers, so the ladder and the compass still work.
   *
   * And "limp to the nearer star" stops being a figure of speech. It is
   * right there, the only thing in the sky, and the reserve you were granted
   * is exactly enough to reach it.
   *
   * The star is built from starPreview, which is the same draw generateSystem
   * makes, so the sun you are looking at from out here is bit-for-bit the sun
   * you will be orbiting when you arrive. */
  function interstellarSystem(star, opts) {
    opts = opts || {};
    var pre = starPreview(star.seed);
    var sun = {
      id: 'b0', name: pre.name, kind: 'star', type: pre.cls,
      mass: pre.mass, radius: pre.radius, color: pre.color, temp: pre.temp,
      luminosity: pre.luminosity, orbit: null, children: []
    };

    var sys = finalize({
      root: sun, seed: star.seed, seedHash: new RNG(star.seed).seed,
      name: opts.name || ('deep space — ' + pre.name + ' approach'),
      /* Marked so the few places that genuinely care — the star map, the
       * market screen, anything that wants to say "there is nothing here" —
       * can ask rather than infer it from an empty port list. */
      interstellar: true,
      hostStar: star,
      frostLine: 0, hzInner: 0, hzOuter: 0
    });

    sys.ports = [];
    sys.traffic = [];
    sys.patrols = [];
    sys.factions = [];
    sys.factionById = { outlaw: OUTLAW };
    sys.outlaw = OUTLAW;
    /* No government reaches out here, which is the entire point of it as a
     * place to conduct a robbery. Crime score 100 is not flavour — the
     * contraband and police-scan code reads this number, and out here the
     * honest answer is that nobody is coming. */
    sys.government = { id: 'none', name: 'no jurisdiction', crime: 100 };
    sys.crimeScore = 100;
    sys.development = 0;
    return sys;
  }

  /* --- what a port looks like up close ------------------------------------
   * Signage, approach lighting and the buildings clustered round the
   * entrance. This is DATA, not drawing: the renderer decides how to paint
   * it, and this decides what is there — which is the same split the
   * atmosphere work used, and for the same reason. A port's dressing has to
   * be identical every time you visit it, so it belongs to the generator
   * with everything else the seed decides.
   *
   * Runs LAST, in its own substream, for two reasons. The obvious one is the
   * discipline every other late addition here follows: a fresh fork cannot
   * perturb a single planet, moon, station or patrol that already existed.
   * The less obvious one is that it needs the economy to have happened
   * already — the whole point of the signage is that it tells the truth
   * about the place. A reprocessing plant advertises waste disposal because
   * it really does take waste; a mining colony advertises ore because ore is
   * what it actually ships. Dressing generated before the roles existed
   * could only have said something generic. */

  var SIGN_GENERIC = [
    'ARRIVALS', 'CUSTOMS', 'BONDED STORAGE', 'CREW HIRING',
    'FUEL — HYDROGEN', 'BERTH ENQUIRIES', 'NO LOITERING',
    'MEDICAL ON CALL', 'SHIP REPAIRS'
  ];
  var SIGN_MOOD = [
    'MIND THE STEP DOWN', 'REPORT ALL LEAKS', 'THIS PORT NEVER CLOSES',
    'WELCOME BACK', 'DECLARE EVERYTHING', 'SAFE APPROACHES SINCE Y0'
  ];
  /* Board colours: the tired palette of somewhere that has been lit for a
   * long time. Nothing here is a pure hue — a saturated primary reads as a
   * UI element rather than as a sign on a building. */
  var SIGN_INK = ['#ffcf6b', '#ff8f5a', '#6fd8ff', '#b6ff8f', '#ff7ba8', '#e6e0c8'];

  function biggestExport(port) {
    var mkt = port.market;
    if (!mkt || !mkt.rows) return null;
    var best = null, bestScore = 0;
    for (var cid in mkt.rows) {
      var row = mkt.rows[cid];
      if (!row || !(row.prod > 0)) continue;
      var surplus = row.prod - (row.cons || 0);
      if (surplus > bestScore) { bestScore = surplus; best = cid; }
    }
    if (!best) return null;
    var good = Eco.BY_ID[best];
    return good ? good.name : null;
  }

  /* The role id lives on the MARKET, not on the port — `port.market.role`
   * — and economy.js keeps its own id lookup private, exporting only the
   * PORT_ROLES list. Both worth stating, because guessing either one wrong
   * fails silently: signage would simply come out generic everywhere and
   * look like a styling choice rather than a bug. */
  function portRole(port) {
    var id = port.market && port.market.role;
    if (!id || !Eco.PORT_ROLES) return null;
    for (var i = 0; i < Eco.PORT_ROLES.length; i++) {
      if (Eco.PORT_ROLES[i].id === id) return Eco.PORT_ROLES[i];
    }
    return null;
  }

  function portSigns(port, rng) {
    var out = [];
    var role = portRole(port);

    /* The one that says what this place is for. A port that reprocesses
     * waste says so in letters you can read on approach, because that is
     * the single most useful thing to know about it from outside. */
    if (role && role.wasteSink) {
      out.push({ text: 'REPROCESSING — WASTE ACCEPTED', kind: 'role' });
    } else {
      var exp = biggestExport(port);
      if (exp) out.push({ text: exp.toUpperCase() + ' — BULK RATES', kind: 'role' });
    }

    out.push({ text: port.name.toUpperCase(), kind: 'name' });
    out.push({ text: rng.pick(SIGN_GENERIC), kind: 'generic' });
    if (rng.chance(0.55)) out.push({ text: rng.pick(SIGN_MOOD), kind: 'mood' });

    /* Placement. `u` is the bearing around the pad, `r` how far out in pad
     * radii, `h` how high. Boards face the approach, so they cluster on the
     * side you come in from rather than ringing the place evenly. */
    for (var i = 0; i < out.length; i++) {
      var s = out[i];
      s.u = rng.range(-1.1, 1.1) + (i * 0.7);
      s.r = rng.range(1.15, 1.9);
      /* Height of the POST, then the board on top of it. Same pad-radii
       * units as the town, and sized like signage rather than like
       * architecture: a board 25 m across on a 10 m post. */
      s.h = rng.range(0.04, 0.13);
      s.w = rng.range(0.10, 0.26);
      s.tall = rng.range(0.025, 0.055);
      s.ink = rng.pick(SIGN_INK);
      s.lit = rng.chance(0.82);          // a few boards are always dead
      s.flicker = s.lit && rng.chance(0.18);
    }
    return out;
  }

  function portBlocks(port, host, rng) {
    /* How much town there is, driven by the world's DEVELOPMENT — the
     * economy's `dev`, which is this game's tech level under another name
     * (0.02 on a molten rock nobody chose to live on, up past 0.9 on a
     * settled habitable world). A frontier landing strip gets a handful of
     * sheds; a core world gets a skyline. Reading it off the economy rather
     * than inventing a second scale means the view out of the canopy and
     * the prices in the market cannot tell you different stories about the
     * same place.
     *
     * Falls back to the habitable flag when a port somehow has no market
     * yet, so this can never be the thing that breaks generation. */
    var dev = (port.market && typeof port.market.dev === 'number')
      ? port.market.dev
      : (host && host.habitable ? 0.7 : 0.25);
    var base = Math.round(2 + dev * dev * 34);   // ~2 sheds to ~36 blocks
    base += rng.int(-1, 2);
    if (port.underground) base = Math.max(2, Math.round(base * 0.45));
    base = Math.max(1, base);
    var out = [];
    /* Development buys height and reach as well as count — a rich world
     * builds up and sprawls out, a poor one is a few low sheds pressed
     * against the pad. Without this the difference between a frontier
     * strip and a core world would only be how many identical boxes there
     * were, which reads as density rather than as wealth.
     *
     * SIZES ARE IN PAD RADII, and getting that wrong is very visible. The
     * first pass used footprints of half a pad radius and heights over a
     * whole one — on a typical 1 km pad that is a city of kilometre-high
     * towers, and on screen it read as slabs floating beside the port
     * rather than as a town beside it. A 0.05 footprint is about 50 m,
     * which is a building; a 0.25 height is a tower block. */
    var tall = 0.35 + dev * 1.1;
    /* Kept TIGHT around the apron. Spread over four or five pad radii the
     * town stopped reading as a town at all — from any distance where you
     * could see the whole port it was a scatter of unrelated dots across
     * the landscape, with nothing to say they belonged to the pad. A
     * settlement pressed up against the edge of the field reads as a
     * settlement immediately, and it is also what a port town actually
     * is. */
    var reach = 1.5 + dev * 1.5;
    for (var i = 0; i < base; i++) {
      out.push({
        u: rng.angle(),
        r: rng.range(1.18, reach),         // pad radii from the centre
        w: rng.range(0.035, 0.13),
        d: rng.range(0.035, 0.13),
        h: rng.range(0.03, 0.22) * tall,
        /* Lit windows, and how many. Same idea as the liner's habitation
         * modules — a building with people in it reads completely
         * differently from a box. */
        windows: rng.range(0.15, 0.9),
        warm: rng.chance(0.7)
      });
    }
    return out;
  }

  /* Greenhouse domes.
   *
   * A colony on a world nobody can breathe on has to make its own air, and
   * the thing that does it is a garden under glass. So every port town gets
   * a few — more of them, and bigger, where the air outside is worse, which
   * makes them read as infrastructure rather than as decoration: an airless
   * rock is half greenhouse, a garden world has one for show.
   *
   * They sit in the inner ring of the town, because the one building nobody
   * puts on the outskirts is the one making the oxygen. */
  function portDomes(port, world, rng) {
    var out = [];
    if (!port.surface || !world) return out;
    /* How much of its own air the place has to grow. A breathable world
     * needs almost none; a rock needs all of it. */
    var need = world.habitable ? 0.25 : 1;
    var dev = 0.35;
    if (port.market && typeof port.market.dev === 'number') dev = port.market.dev;
    var count = Math.max(1, Math.round((1 + dev * 3) * need));
    for (var i = 0; i < count; i++) {
      out.push({
        u: rng.angle(),
        r: rng.range(1.15, 1.15 + 0.7 + dev * 0.5),
        rad: rng.range(0.06, 0.10 + dev * 0.09),     // pad radii
        h: rng.range(0.55, 0.85),                    // as a fraction of rad
        /* The glass is lit from inside at night and the crop shows through
         * it — that green is the whole point of the building. */
        crop: rng.pick(['#6fe08a', '#4fc86e', '#8fe07a', '#3fbf7f'])
      });
    }
    return out;
  }

  function buildPortDressing(sys, base) {
    var rng = base.fork('port-dressing');
    var ports = sys.ports || [];
    for (var i = 0; i < ports.length; i++) {
      var port = ports[i];
      var host = port.parentBody || null;
      port.dressing = {
        signs: portSigns(port, rng),
        blocks: port.surface ? portBlocks(port, host, rng) : [],
        domes: port.surface ? portDomes(port, host, rng) : [],
        /* Approach lighting. Surface pads run warm sodium, orbital docks
         * run cold — it is the quickest way to tell at a glance whether
         * you are looking at something on a planet or something in orbit. */
        padLight: port.surface ? '#ffb45c' : '#7fd0ff',
        hazard: rng.chance(0.5) ? '#ffcf3b' : '#ff7a3b',
        grime: rng.range(0, 1)
      };
    }
  }

  function collectLandable(body, out) {
    if (body.kind !== 'planet' && body.kind !== 'moon') return;
    if (body.type === 'gasGiant' || body.type === 'iceGiant') return;
    if (surfaceGravity(body) > MAX_SURFACE_G) return;
    out.push(body);
  }

  var PAD_PRE = ['Kestrel', 'Low', 'Ashford', 'Barrow', 'Cinder', 'Downwell',
                 'Estuary', 'Farside', 'Groundside', 'Harrow', 'Lowgate', 'Terminus'];
  var PAD_SUF = ['Field', 'Downport', 'Landing', 'Strip', 'Pads', 'Starport',
                 'Groundport', 'Basin'];
  /* Named differently from the open pads on purpose: a pilot should be able
   * to tell from the comms list alone that this one is a hole in the
   * ground, before the shaft ever comes into view. */
  var UNDER_SUF = ['Vault', 'Deep', 'Hold', 'Undercroft', 'Bunker', 'Depths'];

  /* Shaft depth and width, in pad radii. Fixed rather than randomised so
   * every underground bay shares one mesh (see Render.stationMeshes) —
   * the geometry is built once, in units of its own pad radius, and every
   * instance just scales it. */
  var UNDERGROUND_DEPTH = 4.0;
  var UNDERGROUND_TUNNEL = 1.35;

  /* EVERY surface port is now a hole with a door on it — there are no open
   * aprons left. A starport is a collar standing proud of the ground, a
   * shaft the pad rides down, and a hangar at the bottom; an "underground
   * bay" is simply the deep version of the same structure, and `underground`
   * survives as the flag that picks the depth and the naming rather than as
   * a different kind of place.
   *
   * The shallow depth is about a pad radius, so a typical field puts its
   * hangar six hundred metres down — far enough to feel like somewhere you
   * were taken, close enough that the descent is not a bus journey. */
  var SHALLOW_DEPTH = 0.9;

  /* How far the entrance collar stands above the ground, in pad radii.
   * Around twenty metres on a typical pad, which is what Astra asked for:
   * enough that the mouth reads as a structure rather than as a hole, and
   * enough to keep it clear of the planet's own surface in the depth
   * buffer (see PAD_GROUND_LIFT in main.js, which this replaces). */
  var COLLAR_HEIGHT = 0.02;

  /* ---- the shape of a bay, in ONE place --------------------------------
   *
   * Every number below is in PAD RADII and measured from the shaft MOUTH,
   * with +z up. Three modules need them and all three have to agree:
   *
   *   render.js  builds the mesh from these,
   *   sim.js     stands the docked ship on the floor and in a berth,
   *   main.js    keeps the exterior camera inside the room.
   *
   * They were three separate sets of magic numbers, and the result was a
   * hangar floor the ship did not stand on and a camera that spent its
   * time inside the concrete. A shared table is the fix: get one of them
   * wrong now and all three are wrong together, which is at least visible.
   *
   * BERTHS: alcoves off the chamber wall, big enough for a hull and no
   * bigger. One of them is the large bay; the rest take a small or a
   * medium without caring which, exactly as Astra asked. */
  /* Everything here is SQUARE. Astra's note: the ports read as too round.
   * A starport is poured concrete and welded plate — it is built out of
   * straight cuts and right angles, and the only round thing about one
   * should be the things that actually turn. So the mouth is a square
   * hatch, the shaft is a duct, and the hangar is a shed. */
  var BAY_MOUTH_R = 0.55;        // half-width of the square mouth
  var BAY_THROAT_R = 0.45;       // and at the bottom of the duct
  var BAY_CHAMBER_X = 1.30;      // the shed, inside faces, half-extents
  var BAY_CHAMBER_Y = 0.80;
  var BAY_HEADROOM = 0.36;       // floor to ceiling
  var BAY_BERTH_Y = 0.60;        // berths line the two long walls
  var BAY_STANDOFF = 0.012;      // gear-to-floor once parked
  var BERTH_COUNT = 6;           // five interchangeable, plus the large one
  var BAY_LIFT = 0.04;           // the model stands this proud of the ground

  /* What a MODELLED bay says about itself, or null. Field by field, so a
   * model that declares a floor and a mouth but no chamber gets its own
   * floor and mouth and the shared table's chamber — rather than an
   * all-or-nothing swap that would punish a half-finished model.
   *
   * Reached through `global` at call time rather than bound at load:
   * render.js owns the port library and loads after this file. Ports are
   * keyed by ROLE, which is what the model files are named for.
   *
   * These numbers are load-bearing. The camera clamps against chamberX/Y
   * and floorZ/ceilZ, and berthOffset parks ships against berthY — so this
   * is the function that decides whether a modelled shed is somewhere a
   * ship can actually sit, and it is why the converter warns about a berth
   * outside its own chamber instead of quietly writing it out. */
  function modelledBay(port) {
    var R = global.Render;
    if (!R || !R.libPort || !R.portModelFor || !port) return null;
    /* THE SAME KEY THE RENDERER DRAWS WITH. Not a second guess at it: if
     * this picked 'surface' where portModelFor picks 'bay' — which an
     * earlier version of this function did — the game would draw one shed
     * and park ships to another one's dimensions. */
    var got = R.libPort(R.portModelFor(port));
    return got && got.geom ? got.geom : null;
  }

  function bayGeometry(port) {
    var r = port.radius || 1;
    var depth = (port.shaftDepth || 0) / r;
    var m = modelledBay(port) || {};
    var num = function (a, b) { return typeof a === 'number' ? a : b; };
    var floorZ = num(m.floorZ, -depth);
    return {
      depth: depth,
      mouthR: num(m.mouthR, BAY_MOUTH_R),
      throatR: num(m.throatR, BAY_THROAT_R),
      chamberX: num(m.chamberX, BAY_CHAMBER_X),
      chamberY: num(m.chamberY, BAY_CHAMBER_Y),
      floorZ: floorZ,                       // top face of the hangar floor
      /* HEADROOM IS A HEIGHT, NOT A CEILING. A model gives an absolute
       * ceilZ; the constant gives a height above the floor. Reading the
       * model's ceiling as if it were a height would put the roof under the
       * floor of any deep bay, so the two are combined here rather than
       * being allowed to look interchangeable. */
      ceilZ: num(m.ceilZ, floorZ + BAY_HEADROOM),
      berthY: num(m.berthY, BAY_BERTH_Y),
      standoff: num(m.standoff, BAY_STANDOFF),
      berths: num(m.berths, BERTH_COUNT),
      /* How far the whole model stands proud of the ground. It exists so
       * the apron does not z-fight the planet's own surface, and the sim
       * has to add it too or the ship parks a few tens of metres under
       * the floor it is supposed to be standing on. */
      lift: num(m.lift, BAY_LIFT)
    };
  }

  /* Where berth `i` sits, in the same pad-radii mouth-relative frame.
   * Berth 0 is the large one and is given the extra elbow room; the rest
   * are evenly spaced round what is left. Deterministic, so a ship parked
   * in berth 3 is in berth 3 again after a save and a reload. */
  var BERTH_X = [-0.95, 0, 0.95];

  function berthOffset(port, i) {
    var g = bayGeometry(port);
    var n = Math.max(1, g.berths);
    var k = ((i % n) + n) % n;
    var side = k < BERTH_X.length ? 1 : -1;         // which long wall
    var x = BERTH_X[k % BERTH_X.length];
    return {
      x: x,
      y: side * g.berthY,
      z: g.floorZ + g.standoff,
      /* Nose pointed at the middle of the shed, so a berthed ship faces
       * the open floor rather than the wall it is parked against. */
      facing: -side,
      large: k === 0
    };
  }

  /* A pad on a world's surface. It has no orbit — it is bolted to the
   * ground and goes round with the planet, so its position comes from a
   * latitude, a longitude and the world's rotation (see Sim.surfaceOffset).
   * Still a pure function of t, still exact a thousand years out.
   *
   * `ug` is the independent underground-bay stream (see the call site) —
   * kept off `rng` so this feature could be added without shifting a single
   * existing pad's name, position or size for a seed already in play. */
  function makeSurfacePort(world, rng, index, ug) {
    var g = surfaceGravity(world);
    /* Ports cluster at temperate latitudes on worlds anyone lives on and
     * anywhere at all on the ones nobody does. */
    var lat = world.habitable
      ? rng.gauss(0, 0.55) : rng.range(-1.35, 1.35);
    lat = Math.max(-1.45, Math.min(1.45, lat));
    /* Pad radius in KILOMETRES, and it used to be 0.6–2.2 of them — a
     * two-kilometre apron and, once every port became a shaft, a hangar
     * nearly two kilometres across for a ship forty metres long. Seen from
     * orbit that reads fine; standing in it, every surface is a featureless
     * grey field because the nearest wall is half a kilometre away.
     *
     * 0.10–0.24 km is a starport at the scale of the things that use it: a
     * three-hundred-metre apron, a shed you can see the far end of, and a
     * town of five- to thirty-metre buildings rather than skyscrapers. All
     * the port's other measurements are multiples of this one, so they all
     * come down with it, and the seed stream is untouched — this is the
     * same roll, scaled. */
    var padRadius = rng.range(0.10, 0.24);
    /* Airless, sunbaked or radiation-scoured worlds bury their ports
     * against the weather; the pleasant ones mostly build in the open.
     * Rolled from `ug` — see the note above the function. */
    var underground = ug ? ug.chance(world.habitable ? 0.18 : 0.42) : false;
    var shaftDepth = padRadius * (underground ? UNDERGROUND_DEPTH : SHALLOW_DEPTH);
    return {
      id: null,
      name: rng.pick(PAD_PRE) + ' ' + rng.pick(underground ? UNDER_SUF : PAD_SUF),
      kind: 'station', type: 'station',
      typeName: underground ? 'Underground Bay' : 'Starport',
      surface: true,
      underground: underground,
      shaftDepth: shaftDepth,
      tunnelRadius: padRadius * UNDERGROUND_TUNNEL,
      collarHeight: padRadius * COLLAR_HEIGHT,
      /* The berth is at the BOTTOM of the shaft, which is why elevation is
       * negative for every port now. The mouth is recovered with
       * Sim.portEntrance() — the model hangs from there, and so does the
       * approach; only the ship's final resting place is down here. */
      lat: lat, lon: rng.angle(), elevation: -shaftDepth,
      mass: rng.range(2e9, 4e10),
      radius: padRadius,
      color: underground ? '#a9d6ff' : '#ffd9a8',
      docking: true,
      /* Both are shafts now, so both want care — but a deep bay wants more
       * of it. The envelope is where the port takes an interest, not the
       * width of the mouth: a shallow field will pick you up from further
       * out and tolerate a brisker arrival, a four-radius drop will not. */
      /* Floored in kilometres as well as scaled by the pad, because the
       * pads shrank by a factor of ten and the envelope is about how
       * precisely a human can fly the last leg, not about how wide the
       * concrete is. Six pad radii of a 150 m pad is under a kilometre,
       * which turns a good approach into a miss. */
      dockCaptureRadius: underground ? Math.max(padRadius * 2.4, 1.2)
                                     : Math.max(padRadius * 6, 2.5),
      dockMaxSpeed: underground ? 0.018 : 0.030,          // 18 or 30 m/s
      surfaceGravity: g,
      orbit: null,
      children: []
    };
  }

  /* --- rotation ---------------------------------------------------------
   * Worlds did not spin until surface ports needed somewhere to be. Kept in
   * its own substream so adding it did not shift a single existing planet,
   * moon or station — the same discipline the extra ports were added under.
   *
   * Moons are tidally locked, because almost every real one is, which also
   * means a pad on a moon keeps the same face toward its planet: a nice
   * thing to be able to see from orbit. */
  function buildRotations(sys, base) {
    var rr = base.fork('rotation');
    for (var i = 0; i < sys.bodies.length; i++) {
      var b = sys.bodies[i];
      if (b.kind !== 'planet' && b.kind !== 'moon') continue;
      var r = rr.fork('spin-' + b.id);
      var period;
      if (b.kind === 'moon') period = b.orbit.period;
      else if (b.type === 'gasGiant' || b.type === 'iceGiant') period = r.range(8, 18) * 3600;
      else period = r.range(9, 90) * 3600;
      // Venus exists, so retrograde rotation should too, rarely.
      if (b.kind !== 'moon' && r.chance(0.06)) period = -period;
      b.rotation = {
        period: period,
        tilt: Math.abs(r.gauss(0, 14)) * DEG,
        phase: r.angle()
      };
    }
  }

  /* --- factions ---------------------------------------------------------
   * Tags only, for now, and deliberately so. Every port and every ship
   * carries a faction id, a name and a colour; nothing yet reads standing,
   * enforces law, or owns territory. The point of putting the hooks in now
   * is that adding reputation later becomes a change to one system rather
   * than a change to traffic generation, patrol assignment, port markets
   * and the HUD all at once.
   *
   * Pirates are the exception that proves the shape: they get the reserved
   * 'outlaw' faction, which no port belongs to, so "whose side is that ship
   * on" already has an answer everywhere it is asked. */
  var FACTION_STEM = ['Concord', 'Compact', 'Union', 'Directorate', 'Assembly',
                      'Charter', 'League', 'Combine', 'Authority', 'Protectorate',
                      'Commonwealth', 'Accord'];
  var FACTION_COLORS = ['#7fb2ff', '#c9a2ff', '#7fd6c0', '#ffc46b', '#ff9fb0', '#9ad87f'];

  var OUTLAW = { id: 'outlaw', name: 'Unaligned', color: '#ff7a6b', outlaw: true };

  /* opts.faction, when given, is this system's GALACTIC owner — a real
   * faction object shared across every system that star's region controls
   * (see galaxy.js: territory is decided once, galaxy-wide, by nearest
   * capital). opts.allFactions is the full up-to-3 roster, so a contested
   * world can fly a genuine neighbouring flag instead of an invented one.
   * With no opts (a bare seed, a test, a tool with no galaxy behind it)
   * this falls back to the original behaviour: 2-4 factions rolled fresh
   * for this system alone. That fallback is deliberately byte-identical to
   * the pre-galaxy code path — nothing that calls generateSystem(seed)
   * with one argument should ever see a different result. */
  function buildFactions(sys, base, opts) {
    opts = opts || {};
    var fr = base.fork('factions');
    var worlds = sys.bodies.filter(function (b) {
      return b.kind === 'planet' && b.children.some(isStation);
    });
    var list, i;
    if (opts.faction) {
      var others = (opts.allFactions || []).filter(function (f) {
        return f.id !== opts.faction.id;
      });
      list = [opts.faction].concat(others);
    } else {
      var n = Math.max(1, Math.min(worlds.length, fr.int(2, 4)));
      list = [];
      for (i = 0; i < n; i++) {
        list.push({
          id: 'f' + i,
          name: makeName(fr) + ' ' + fr.pick(FACTION_STEM),
          color: FACTION_COLORS[i % FACTION_COLORS.length],
          outlaw: false
        });
      }
    }
    sys.factions = list;
    sys.outlaw = OUTLAW;
    sys.factionById = { outlaw: OUTLAW };
    for (i = 0; i < list.length; i++) sys.factionById[list[i].id] = list[i];

    /* A world belongs to one faction (its galactic owner, if there is one);
     * its ports normally follow, but one world in six is contested and its
     * ports answer to a rival flag instead. Owner/rival selection is
     * written so the legacy no-galaxy path produces EXACTLY the same
     * assignment as before (verified: rivals[w % rivals.length] lands on
     * the same faction list[(w+1) % list.length] always picked). */
    for (var w = 0; w < worlds.length; w++) {
      var owner = opts.faction || list[w % list.length];
      worlds[w].faction = owner.id;
      var rivals = list.filter(function (f) { return f.id !== owner.id; });
      var contested = rivals.length > 0 && fr.chance(0.16);
      var rival = contested ? rivals[w % rivals.length] : null;
      var ports = worlds[w].children.filter(isStation);
      for (var p = 0; p < ports.length; p++) {
        ports[p].faction = (contested && p > 0) ? rival.id : owner.id;
      }
      worlds[w].contested = !!contested;
    }
    // Anything that somehow missed out (a port above a moon, say) gets the
    // first faction rather than an undefined one.
    sys.bodies.forEach(function (b) {
      if (isStation(b) && !b.faction) b.faction = list[0].id;
    });
  }

  /* --- government & crime -------------------------------------------------
   * One government per SYSTEM, not per faction — the same faction can
   * administer a tightly-run core world and a barely-governed frontier one,
   * which is more interesting than "every Alliance system is a democracy".
   *
   * `crime` is a 0-100 PERMISSIVITY score: higher means the law looks the
   * other way more often (lower search chance later, in the scan mechanic)
   * but also means less policing keeps you safe, so the risk to your life
   * goes up with it, not down. It is deliberately NOT read off the
   * government type alone: crime = government's base tendency, nudged by
   * how developed the system actually is, plus real noise. That noise is
   * the whole point of "not all low-tech systems are high crime" — a
   * Technocracy rolls low on average, but a bad roll or a rich outpost of
   * one can still land anywhere in the range.
   *
   * `lowTechBias` similarly only WEIGHTS which government gets picked
   * (a poor world more often ends up Feudal than Technocracic) — it never
   * decides it outright, for the same reason. */
  var GOVERNMENTS = [
    { id: 'anarchy',      name: 'Anarchy',       crime: 90, lowTechBias: 0.95 },
    { id: 'feudal',       name: 'Feudal',        crime: 68, lowTechBias: 0.85 },
    { id: 'dictatorship', name: 'Dictatorship',  crime: 60, lowTechBias: 0.65 },
    { id: 'patronage',    name: 'Patronage',     crime: 55, lowTechBias: 0.55 },
    { id: 'theocracy',    name: 'Theocracy',     crime: 48, lowTechBias: 0.60 },
    { id: 'confederacy',  name: 'Confederacy',   crime: 42, lowTechBias: 0.45 },
    { id: 'collective',   name: 'Collective',    crime: 38, lowTechBias: 0.40 },
    { id: 'cooperative',  name: 'Cooperative',   crime: 28, lowTechBias: 0.35 },
    { id: 'corporate',    name: 'Corporate',     crime: 33, lowTechBias: 0.30 },
    { id: 'democracy',    name: 'Democracy',     crime: 20, lowTechBias: 0.15 },
    { id: 'technocracy',  name: 'Technocracy',   crime: 12, lowTechBias: 0.05 }
  ];
  var GOVERNMENT_BY_ID = {};
  for (var _gi = 0; _gi < GOVERNMENTS.length; _gi++) GOVERNMENT_BY_ID[GOVERNMENTS[_gi].id] = GOVERNMENTS[_gi];

  function clamp01to100(x) { return x < 0 ? 0 : x > 100 ? 100 : x; }

  /* Mean development across this system's ports — the cheapest honest
   * stand-in for "how advanced is this place" that doesn't require a
   * second, independent tech-level generator to keep in sync with the one
   * economy.js already rolls. Must run AFTER buildEconomy: that is what
   * sets port.market.dev. */
  function systemDevelopment(sys) {
    var ports = sys.ports || [];
    if (!ports.length) return 0.3;
    var sum = 0;
    for (var i = 0; i < ports.length; i++) sum += ports[i].market.dev;
    return sum / ports.length;
  }

  function buildGovernment(sys, base) {
    var gr = base.fork('government');
    var dev = systemDevelopment(sys);

    // Weight each government by how well its lowTechBias matches this
    // system's actual development, with a floor so nothing is ever
    // impossible — a rich Anarchy or a dirt-poor Technocracy should be
    // rare, not disallowed.
    var weighted = GOVERNMENTS.map(function (g) {
      var align = 1 - Math.abs(g.lowTechBias - (1 - dev));
      return { g: g, w: 1 + 4 * align * align };
    });
    var total = weighted.reduce(function (s, w) { return s + w.w; }, 0);
    var roll = gr.next() * total;
    var chosen = weighted[weighted.length - 1].g;
    for (var i = 0; i < weighted.length; i++) {
      roll -= weighted[i].w;
      if (roll <= 0) { chosen = weighted[i].g; break; }
    }

    var techTerm = (0.5 - dev) * 40;      // low dev pushes crime up, high dev pulls it down
    var noise = gr.gauss(0, 8);
    var crime = Math.round(clamp01to100(chosen.crime + techTerm + noise));

    sys.government = chosen;
    sys.crimeScore = crime;
    sys.development = dev;
  }

  /* --- ships that are not carrying anything -----------------------------
   * Police interceptors, hired escorts and pirates. They use the same rails
   * philosophy as the freighters — a police patrol is a timetable between
   * two of its faction's ports, an escort shadows a specific freight run,
   * and a pirate sits on a real Kepler orbit loitering above a busy lane.
   * All three are pure functions of t until the player gets close enough to
   * matter, at which point Sim.updateEncounters lifts them off the rail
   * (see sim.js for why that boundary is where it is). */
  /* Scaled against the player, not chosen in isolation. The whole
   * interdiction mechanic rests on a full hold being slower than a pirate
   * and an empty one being faster, so these move whenever the ship's
   * thrust does — and there is a test that fails if they stop straddling
   * it. Interceptors are faster than anything, which is the point of them. */
  var PATROL_CLASSES = {
    police: { size: 0.055, color: '#8fd0ff', accel: 0.0210, label: 'interceptor' },
    merc:   { size: 0.070, color: '#d8b0ff', accel: 0.0190, label: 'mercenary' },
    pirate: { size: 0.062, color: '#ff8a76', accel: 0.0170, label: 'pirate' },
    /* A faction's own warship. Slow — it does not chase, it ARRIVES, and
     * anything that wants to run from one can. What makes it frightening is
     * that it is enormous and it does not negotiate, not that it is quick.
     *
     * For now it only patrols: hunting the player on notoriety is a
     * separate piece of work, and a navy that merely EXISTS in the sky of
     * well-governed systems is worth having on its own. */
    navy:   { size: 0.240, color: '#b8c6d8', accel: 0.0060, label: 'naval cutter' },
    /* A rescue tender. Unarmed on purpose — its protection is that
     * shooting one is an unusually serious crime, not that it can fight
     * back. Present now so the hull is in the sky before the mechanic
     * that calls one exists; being able to SEE the service is half of
     * knowing you can use it. */
    tender: { size: 0.095, color: '#ffd36b', accel: 0.0125, label: 'rescue tender' }
  };
  var NAVY_NAMES = ['Resolute', 'Intransigent', 'Adamant', 'Sovereign', 'Implacable',
                    'Vigilant', 'Unyielding', 'Redoubt'];
  var TENDER_NAMES = ['Samaritan', 'Good Turn', 'Lifeline', 'Standby', 'Helping Hand',
                      'Second Wind', 'Fair Wind', 'Salvor'];
  var POLICE_NAMES = ['Vigil', 'Sentinel', 'Warden', 'Picket', 'Marshal', 'Bastion',
                      'Cordon', 'Lictor'];
  var MERC_NAMES = ['Hired', 'Contract', 'Retainer', 'Bondsman', 'Freelance'];
  var PIRATE_NAMES = ['Blackwake', 'Cutter', 'Grudge', 'Salt', 'Bonepick', 'Harrow',
                      'Vulture', 'Scrag', 'Tallow', 'Wraith'];

  /* A route object shaped exactly like a trade route, so Sim.trafficState
   * can fly it without knowing or caring that nobody aboard is trading. */
  function patrolRoute(id, name, spec, A, B, sys, rng, t0) {
    var parent = commonParent(A, B, sys);
    var ra = radiusAbout(A, parent, sys), rb = radiusAbout(B, parent, sys);
    var local = A.parentBody === B.parentBody;
    var dist = local ? Math.max(Math.abs(ra - rb), (ra + rb) * 0.45)
                     : Math.sqrt(ra * ra + rb * rb);
    var cruise = Math.max(600, Math.min(2 * Math.sqrt(dist / spec.accel), 90 * 86400));
    var layover = rng.range(0.05, 0.4) * 86400;   // patrols do not sit around
    var period = 2 * (cruise + layover);
    return {
      id: id, name: name, cls: spec.cls, className: spec.label,
      size: spec.size * rng.range(0.85, 1.2), color: spec.color,
      from: A.id, to: B.id, parentId: parent.id, local: local,
      cruise: cruise, layover: layover, period: period,
      t0: t0 === undefined ? rng.range(0, period) : t0,
      out: [], back: [], distance: dist
    };
  }

  function buildPatrols(sys, base) {
    var rng = base.fork('patrols');
    sys.patrols = [];
    var ports = sys.ports || [];
    if (ports.length < 2) return;
    var id = 0;

    /* Police: each faction patrols between a pair of its OWN ports. A
     * faction holding a single port instead runs a boundary patrol out to
     * the nearest neighbouring port, which is a more interesting line to
     * fly anyway. */
    (sys.factions || []).forEach(function (fac) {
      var mine = ports.filter(function (p) { return p.faction === fac.id; });
      if (!mine.length) return;
      // A permissive system is thinly policed, which is HOW it stays
      // permissive — crimeScore is set by buildGovernment, which always
      // runs before this. Legacy/standalone calls with no government pass
      // (crimeScore undefined) get the untouched original count.
      var crimeFactor = sys.crimeScore === undefined ? 1 : 1 - (sys.crimeScore / 100) * 0.5;
      var count = Math.max(1, Math.round(Math.min(3, Math.round(mine.length / 1.5)) * crimeFactor));
      for (var k = 0; k < count; k++) {
        var A = mine[k % mine.length];
        var B;
        if (mine.length > 1) B = mine[(k + 1) % mine.length];
        else {
          var others = ports.filter(function (p) { return p !== A; });
          B = others[rng.int(0, others.length - 1)];
        }
        if (!B || B === A) continue;
        var spec = { cls: 'police', accel: PATROL_CLASSES.police.accel,
                     size: PATROL_CLASSES.police.size, color: fac.color,
                     label: PATROL_CLASSES.police.label };
        sys.patrols.push({
          id: 'n' + (id++), kind: 'police', faction: fac.id,
          name: rng.pick(POLICE_NAMES) + ' ' + (rng.int(1, 40)),
          className: 'interceptor', color: fac.color,
          size: PATROL_CLASSES.police.size, accel: PATROL_CLASSES.police.accel,
          rail: { type: 'route', route: patrolRoute('n' + (id - 1), '', spec, A, B, sys, rng) }
        });
      }
    });

    /* The navy. Rare on purpose: a warship in every system is wallpaper,
     * and the point of one is that seeing it means something. A faction
     * fields one only where it has the industry to build it and the
     * order to justify it — high development, low crime — and never more
     * than one per faction per system.
     *
     * Note this reads sys.development, which buildGovernment sets from the
     * mean of the ports' own `dev`. Both it and crimeScore are already
     * computed by the time buildPatrols runs. */
    (sys.factions || []).forEach(function (fac) {
      var mine = ports.filter(function (p) { return p.faction === fac.id; });
      if (mine.length < 2) return;
      /* Thresholds measured, not guessed: across ten seeds sys.development
       * ran 0.28–0.61 and crimeScore 12–90. An earlier 0.62 gate excluded
       * every system that exists. 0.55 and 55 put a navy in roughly the
       * top third of well-run systems, which is what "rare but real" wants
       * to mean here. */
      var dev = sys.development === undefined ? 0.5 : sys.development;
      var crime = sys.crimeScore === undefined ? 40 : sys.crimeScore;
      if (dev < 0.55 || crime > 55) return;
      /* Even then, not every time. A seeded coin so two systems with the
       * same numbers do not both get one. */
      if (!rng.chance(0.45)) return;
      var NA = mine[rng.int(0, mine.length - 1)];
      var NB = mine.filter(function (p) { return p !== NA; })[0];
      if (!NB) return;
      var nspec = { cls: 'navy', accel: PATROL_CLASSES.navy.accel,
                    size: PATROL_CLASSES.navy.size, color: PATROL_CLASSES.navy.color,
                    label: PATROL_CLASSES.navy.label };
      sys.patrols.push({
        id: 'n' + (id++), kind: 'navy', faction: fac.id,
        name: 'FNS ' + rng.pick(NAVY_NAMES),
        className: PATROL_CLASSES.navy.label, color: fac.color,
        size: PATROL_CLASSES.navy.size, accel: PATROL_CLASSES.navy.accel,
        rail: { type: 'route', route: patrolRoute('n' + (id - 1), '', nspec, NA, NB, sys, rng) }
      });
    });

    /* Rescue tenders. One per system that has enough traffic to justify
     * the standing cost of keeping a crew waiting — which is what
     * development measures. They run a short local loop rather than a
     * long haul, because a tender that is halfway across the system when
     * you call is not a rescue service. */
    (function () {
      if (ports.length < 2) return;
      var dev = sys.development === undefined ? 0.5 : sys.development;
      if (dev < 0.35) return;
      var TA = ports[rng.int(0, ports.length - 1)];
      var TB = ports.filter(function (p) { return p !== TA; })[0];
      if (!TB) return;
      var tspec = { cls: 'tender', accel: PATROL_CLASSES.tender.accel,
                    size: PATROL_CLASSES.tender.size,
                    color: PATROL_CLASSES.tender.color,
                    label: PATROL_CLASSES.tender.label };
      sys.patrols.push({
        id: 'n' + (id++), kind: 'tender', faction: TA.faction || null,
        name: rng.pick(TENDER_NAMES),
        className: PATROL_CLASSES.tender.label,
        color: PATROL_CLASSES.tender.color,
        size: PATROL_CLASSES.tender.size, accel: PATROL_CLASSES.tender.accel,
        rail: { type: 'route', route: patrolRoute('n' + (id - 1), '', tspec, TA, TB, sys, rng) }
      });
    })();

    /* Escorts shadow a real freight run — same endpoints, same schedule,
     * a minute behind. Flying in loose formation with a freighter is the
     * cheapest way to make a hired gun legible without any AI at all. */
    var valuable = (sys.traffic || []).filter(function (r) {
      return !r.local && r.cls !== 'shuttle';
    });
    var nMerc = Math.min(valuable.length, rng.int(0, 2));
    for (var m = 0; m < nMerc; m++) {
      var host = valuable[rng.int(0, valuable.length - 1)];
      var A2 = sys.byId[host.from], B2 = sys.byId[host.to];
      var mspec = { cls: 'merc', accel: PATROL_CLASSES.merc.accel,
                    size: PATROL_CLASSES.merc.size, color: PATROL_CLASSES.merc.color,
                    label: PATROL_CLASSES.merc.label };
      var route = patrolRoute('n' + id, '', mspec, A2, B2, sys, rng, host.t0 - 90);
      // Match the freighter's own schedule so they actually stay together.
      route.cruise = host.cruise;
      route.layover = host.layover;
      route.period = host.period;
      sys.patrols.push({
        id: 'n' + (id++), kind: 'merc',
        faction: sys.byId[host.from].faction,
        name: rng.pick(MERC_NAMES) + ' ' + rng.pick(HULL_NAMES),
        className: 'mercenary escort', color: PATROL_CLASSES.merc.color,
        size: PATROL_CLASSES.merc.size, accel: PATROL_CLASSES.merc.accel,
        escorting: host.id,
        rail: { type: 'route', route: route }
      });
    }

    /* Pirates do not run a timetable — nobody is expecting them. They sit
     * on a genuine eccentric orbit above a world that has something worth
     * taking, which puts them near the traffic lanes without ever docking.
     * It is still a rail, so they cost nothing until you are close. */
    /* Pirates loiter in ORBIT above somewhere worth robbing. A surface port
     * is no use to them as an anchor — you cannot hold a parking orbit on
     * the ground — so pads are filtered out before the pick. */
    var lanes = ports.filter(function (p) { return !p.surface; }).sort(function (a, b) {
      return (b.market ? b.market.dev : 0) - (a.market ? a.market.dev : 0);
    });
    if (!lanes.length) return;
    var nPirates = rng.int(1, Math.min(4, Math.max(1, Math.round(ports.length / 2))));
    for (var q = 0; q < nPirates; q++) {
      var near = lanes[Math.min(lanes.length - 1, rng.int(0, 2))];
      var world = near.parentBody;
      /* Hill sphere against the world's OWN parent, not always the star.
       * A port above a moon is a perfectly good thing to lurk near, and
       * measuring a moon's Hill sphere against the star it does not orbit
       * gives a loitering orbit somewhere out past the planet. */
      var wParent = world.parentBody || sys.root;
      var hill = hillRadius(world.mass, wParent.mass, world.orbit.a, world.orbit.e);
      var lo = Math.max(near.orbit.a * 1.4, world.radius * 3);
      var hi = Math.min(hill * 0.42, Math.max(lo * 1.6, world.radius * 40));
      if (hi <= lo * 1.1) { lo = world.radius * 2.2; hi = world.radius * 8; }
      sys.patrols.push({
        id: 'n' + (id++), kind: 'pirate', faction: 'outlaw',
        name: 'The ' + rng.pick(PIRATE_NAMES),
        className: 'pirate', color: PATROL_CLASSES.pirate.color,
        size: PATROL_CLASSES.pirate.size, accel: PATROL_CLASSES.pirate.accel,
        lurkAt: near.id,
        rail: {
          type: 'orbit', parent: world.id,
          el: {
            a: rng.range(lo, hi), e: rng.range(0.22, 0.55),
            inc: rng.range(0, 28) * DEG,
            lan: rng.angle(), argp: rng.angle(), m0: rng.angle()
          }
        }
      });
    }
  }

  /* --- contraband ---------------------------------------------------------
   * The LAST thing generateSystem does, deliberately: legal traffic and
   * patrol routes are already fixed by the time this runs, so a black
   * market can never get picked up as a freighter's cargo or a mission
   * board's freight (see missions.js, which also excludes it explicitly —
   * belt and braces, since a generation-order guarantee is easy to break
   * by accident later and a filter is not). Own substream, so a port that
   * doesn't get chosen is byte-identical to a build without this feature.
   *
   * Chance scales with the system's OWN crime permissivity, which is the
   * whole point of that number existing: a permissive system has more
   * places willing to move contraband, not just a lower chance of getting
   * caught doing it. A port also needs SOME industrial base (dev > 0.25) —
   * synthesising narcotics or machining arms takes more than a farm. */
  function buildContraband(sys, base) {
    var cr = base.fork('contraband');
    var crime = sys.crimeScore === undefined ? 40 : sys.crimeScore;
    var chance = 0.06 + (crime / 100) * 0.34;   // ~6% at crime 0 up to ~40% at crime 100
    (sys.ports || []).forEach(function (port) {
      if (!port.market || port.market.dev < 0.25) return;
      if (!cr.chance(chance)) return;
      Eco.addBlackMarketRows(port, cr.fork('bm-' + port.id));
    });
  }

  function isStation(b) { return b.kind === 'station'; }

  /* One station in a clean orbit above `host`, placed so it does not share a
   * radius with any port already there. Returns null rather than crowding
   * the sky when there is genuinely no room left inside the Hill sphere —
   * a port that would be torn away by the star is not a port. */
  function makeStation(host, star, rng, usedAxes) {
    var hHill = hillRadius(host.mass, star.mass, host.orbit.a, host.orbit.e);
    var lo = host.radius * 1.15;
    var hi = Math.min(hHill * 0.30, host.radius * 22);
    if (hi <= lo * 1.25) return null;

    /* Try a few radii and keep the first that is comfortably clear of every
     * existing port. Two docks 200 km apart would be one dock with extra
     * steps, and worse, their orbital periods would be near-identical so
     * they would never actually pass each other. */
    var aStation = null;
    for (var attempt = 0; attempt < 14; attempt++) {
      var trial = rng.range(lo * 1.05, hi);
      var ok = true;
      for (var u = 0; u < usedAxes.length; u++) {
        var ratio = trial / usedAxes[u];
        if (ratio > 0.82 && ratio < 1.22) { ok = false; break; }
      }
      if (ok) { aStation = trial; break; }
    }
    if (aStation === null) return null;

    var stEcc = rng.range(0, 0.004);
    if (aStation * (1 - stEcc) < host.radius * 1.08) aStation = host.radius * 1.12;
    var stRadius = rng.range(0.6, 3.2);

    return {
      id: null,   // caller assigns, so ids stay dense and in creation order
      name: rng.pick(STATION_PRE) + ' ' + rng.pick(STATION_SUF),
      kind: 'station', type: 'station', typeName: 'Station',
      mass: rng.range(4e8, 9e9),
      radius: stRadius,
      color: '#f2f7ff',
      docking: true,
      dockCaptureRadius: stRadius * 4,
      dockMaxSpeed: 0.006,
      orbit: {
        parent: host.id, a: aStation, e: stEcc,
        inc: rng.range(0, 6) * DEG,
        lan: rng.angle(), argp: rng.angle(), m0: rng.angle()
      },
      children: []
    };
  }

  /* --- economy ----------------------------------------------------------
   * Development level is a property of the WORLD, not of the port, so both
   * ports above the same planet agree about how built-up it is and trade
   * accordingly. Everything downstream — what can be manufactured, how much
   * radioactive waste accumulates, what the luxuries cost — comes off that
   * one number. See economy.js. */
  function buildEconomy(sys, base) {
    var er = base.fork('economy');
    var i;

    for (i = 0; i < sys.bodies.length; i++) {
      var b = sys.bodies[i];
      if (b.kind !== 'planet' && b.kind !== 'moon') continue;
      var dr = er.fork('dev-' + b.id);
      var dev = Eco.developmentOf(b, dr);
      b.economy = { dev: dev, pop: Eco.populationOf(b, dev) };
    }

    sys.ports = sys.bodies.filter(isStation);
    for (i = 0; i < sys.ports.length; i++) {
      var port = sys.ports[i];
      /* parentBody rather than orbit.parent: a surface port has no orbit at
       * all, and every port needs a host to take its economy from. finalize
       * sets parentBody for everything, so it is the one lookup that works
       * for both kinds. */
      var host = port.parentBody;
      Eco.buildPortMarket(port, host, sys, er.fork('mkt-' + port.id));
    }

    priceFuelByHaulage(sys);

    /* Guarantee somewhere to dump the waste. A system where every port is a
     * producer and none will take it is a dead-end mechanic: the player
     * would see the payout, fill the hold, and then discover there is
     * nowhere in the system to unload. Promote the least-developed port. */
    if (!Eco.wasteSinks(sys).length && sys.ports.length) {
      var worst = sys.ports[0];
      for (i = 1; i < sys.ports.length; i++) {
        if (sys.ports[i].market.dev < worst.market.dev) worst = sys.ports[i];
      }
      var row = worst.market.rows.waste;
      row.sink = true;
      row.cons = Math.max(row.cons, row.prod * 4 + 20);
      row.cap = Math.max(row.cap, 900);
      worst.market.role = 'reprocessing';
      worst.market.roleName = 'Reprocessing plant';
    }
  }

  /* --- traffic ----------------------------------------------------------
   * Other ships, and the reason they are going anywhere.
   *
   * These are ON RAILS in exactly the sense the planets are: a route is a
   * timetable, and a ship's position is a pure function of t evaluated from
   * it (see Sim.trafficState). Nothing is integrated, so nothing drifts,
   * nothing needs culling logic to stay correct while you are not looking,
   * and a freighter you watched depart is still exactly where the timetable
   * says it should be after you skip six months of game time.
   *
   * Routes are not decorative. Their manifests are registered as scheduled
   * deliveries against the destination port's market, so the sawtooth you
   * see in a price chart is that specific ship arriving. */
  var SHIP_CLASSES = {
    shuttle:   { size: 0.030, color: '#9fd4ff', accel: 0.0035, label: 'shuttle' },
    freighter: { size: 0.120, color: '#d8c79a', accel: 0.0013, label: 'freighter' },
    tanker:    { size: 0.150, color: '#a8d8c0', accel: 0.0011, label: 'tanker' },
    hauler:    { size: 0.090, color: '#c9a2a2', accel: 0.0016, label: 'waste hauler' },
    /* People, not tonnage. A liner runs between two settled worlds, which
     * is the only run where there are enough people who want to go. It is
     * fast for its size because passengers will not sit through a
     * freighter's fortnight, and it is the brightest thing in the sky —
     * the model carries hundreds of self-lit windows. */
    liner:     { size: 0.145, color: '#cfe4ff', accel: 0.0021, label: 'liner' }
  };

  var LINE_NAMES = ['Ardent', 'Coldwater', 'Fenwick', 'Halcyon', 'Ironwake', 'Juno',
                    'Kestrel', 'Lodestar', 'Mirefast', 'Northlight', 'Overwater',
                    'Pilgrim', 'Quillon', 'Redsail', 'Slipstream', 'Tallow'];
  var HULL_NAMES = ['Carrier', 'Runner', 'Drover', 'Packet', 'Barge', 'Clipper',
                    'Lighter', 'Tender', 'Wain'];

  function commonParent(a, b, sys) {
    var chain = {};
    var p = a;
    while (p) { chain[p.id] = true; p = p.parentBody; }
    p = b;
    while (p) { if (chain[p.id]) return p; p = p.parentBody; }
    return sys.root;
  }

  /* What would A actually send to B? Whatever A has a surplus of that B is
   * short of — which is the same question the price function answers, so
   * the freighters and the player are reading the same market. */
  function manifestFor(from, to, rng) {
    var out = [];
    var order = from.market.order;
    for (var i = 0; i < order.length; i++) {
      var cid = order[i];
      var src = from.market.rows[cid];
      var dst = to.market.rows[cid];
      if (!src || !dst) continue;
      if (!src.exporter || !dst.importer) continue;
      out.push({ cid: cid, score: (src.prod - src.cons) + (dst.cons - dst.prod) });
    }
    out.sort(function (x, y) { return y.score - x.score; });
    return out.slice(0, 3).map(function (e) {
      return { cid: e.cid, qty: Math.max(12, e.score * rng.range(0.8, 2.4)) };
    });
  }

  /* A settled world with a real population — the only place a passenger
   * run has anyone to carry. Reads the same `dev` the rest of the file
   * treats as tech level rather than inventing a second measure. */
  function settled(port) {
    if (!port || !port.parentBody || !port.parentBody.habitable) return false;
    var dev = (port.market && typeof port.market.dev === 'number') ? port.market.dev : 0;
    return dev > 0.5;
  }

  function classifyRoute(manifest, local, A, B) {
    var hasWaste = false, hasFuel = false, bulk = 0;
    for (var i = 0; i < manifest.length; i++) {
      if (manifest[i].cid === 'waste') hasWaste = true;
      if (manifest[i].cid === 'hydrogen') hasFuel = true;
      bulk += manifest[i].qty;
    }
    if (hasWaste) return 'hauler';
    if (hasFuel && bulk > 200) return 'tanker';
    /* A liner takes over a light interplanetary run that touches a settled
     * world. ONE end, not both — measured across ten systems, only about a
     * fifth of ports sit on a habitable world, roughly two per system, and
     * two DIFFERENT settled worlds in the same system is rare enough that
     * requiring both ends produced zero liners anywhere. Which is the right
     * answer to a different question: the run between two settled worlds is
     * an interstellar one, and this game's traffic is per-system.
     *
     * So the liner is what carries people between the world they live on
     * and everywhere else in its system — including the orbital port where
     * they would catch something going further. It still carries whatever
     * the manifest says, because deliveries are registered the same way
     * whatever hull flies them: this changes what you SEE without touching
     * a single price. */
    if (!local && bulk < 420 && (settled(A) || settled(B))) return 'liner';
    if (local && bulk < 400) return 'shuttle';
    return 'freighter';
  }

  function buildTraffic(sys, base) {
    var tr = base.fork('traffic');
    var ports = sys.ports || [];
    sys.traffic = [];
    if (ports.length < 2) return;

    var pairs = [];
    var i, j;

    /* Local hops first — two ports above the same world is the busiest and
     * most visible traffic in the game, because it is the traffic you can
     * actually watch cross the sky while parked in orbit. */
    for (i = 0; i < ports.length; i++) {
      for (j = i + 1; j < ports.length; j++) {
        if (ports[i].parentBody !== ports[j].parentBody) continue;
        pairs.push({ a: ports[i], b: ports[j], local: true, score: 1e9 });
      }
    }

    /* Then interplanetary runs, ranked by how badly each end wants what the
     * other has. A route nobody would fly is not worth drawing. */
    for (i = 0; i < ports.length; i++) {
      for (j = i + 1; j < ports.length; j++) {
        if (ports[i].parentBody === ports[j].parentBody) continue;
        var mOut = manifestFor(ports[i], ports[j], tr);
        var mBack = manifestFor(ports[j], ports[i], tr);
        var score = 0;
        for (var k = 0; k < mOut.length; k++) score += mOut[k].qty;
        for (var k2 = 0; k2 < mBack.length; k2++) score += mBack[k2].qty;
        if (score < 1) continue;
        pairs.push({ a: ports[i], b: ports[j], local: false, score: score,
                     out: mOut, back: mBack });
      }
    }

    /* Waste runs are added explicitly rather than left to the surplus/
     * shortage matcher: a reprocessing plant "wants" waste in a sense no
     * price signal expresses well, and these are the routes that make the
     * disposal contract legible to a player watching the sky. */
    var sinks = Eco.wasteSinks(sys);
    for (i = 0; i < ports.length && sinks.length; i++) {
      var producer = ports[i];
      var wrow = producer.market.rows.waste;
      if (!wrow || wrow.sink || wrow.prod < 4) continue;
      var sink = sinks[tr.int(0, sinks.length - 1)];
      if (sink === producer) continue;
      pairs.push({ a: producer, b: sink, local: producer.parentBody === sink.parentBody,
                   score: 5e8, out: [{ cid: 'waste', qty: wrow.prod * tr.range(3, 9) }],
                   back: [] });
    }

    pairs.sort(function (x, y) { return y.score - x.score; });
    var maxRoutes = Math.min(28, 6 + ports.length * 3);
    pairs = pairs.slice(0, maxRoutes);

    for (i = 0; i < pairs.length; i++) {
      var pr = pairs[i];
      var A = pr.a, B = pr.b;
      var out = pr.out || manifestFor(A, B, tr);
      var back = pr.back || manifestFor(B, A, tr);
      var cls = classifyRoute(out.concat(back), pr.local, A, B);
      var spec = SHIP_CLASSES[cls];

      var parent = commonParent(A, B, sys);
      /* Nominal trip distance. For two ports above the same world it is the
       * chord between their orbits; between worlds it is the RMS separation
       * of two circular orbits, sqrt(a1^2 + a2^2), which is the honest
       * average rather than the best or worst case. */
      var ra = radiusAbout(A, parent, sys), rb = radiusAbout(B, parent, sys);
      var dist = pr.local ? Math.max(Math.abs(ra - rb), (ra + rb) * 0.45)
                          : Math.sqrt(ra * ra + rb * rb);
      /* Constant-acceleration crossing: accelerate to the midpoint, flip,
       * decelerate. t = 2*sqrt(d/a). Not simulated — this is the number the
       * timetable is built from, and the eased interpolation in
       * Sim.trafficState reproduces the same accel/coast/decel shape. */
      var cruise = 2 * Math.sqrt(dist / spec.accel);
      cruise = Math.max(600, Math.min(cruise, 90 * 86400));
      var layover = (pr.local ? tr.range(0.15, 1.1) : tr.range(0.8, 4.0)) * 86400;
      var period = 2 * (cruise + layover);

      var route = {
        id: 'r' + i,
        name: tr.pick(LINE_NAMES) + ' ' + tr.pick(HULL_NAMES),
        cls: cls, className: spec.label,
        size: spec.size * tr.range(0.8, 1.3),
        color: spec.color,
        from: A.id, to: B.id, parentId: parent.id,
        local: !!pr.local,
        cruise: cruise, layover: layover, period: period,
        t0: tr.range(0, period),
        out: out, back: back,
        distance: dist
      };
      sys.traffic.push(route);

      /* Register the manifests as scheduled deliveries so the market model
       * knows when this ship's cargo lands. The outbound leg arrives at B
       * at t0 + cruise; the return leg arrives at A at t0 + 2*cruise +
       * layover. Both repeat every period. */
      registerDeliveries(B, out, route.t0, cruise, period);
      registerDeliveries(A, back, route.t0, 2 * cruise + layover, period);
    }
  }

  function registerDeliveries(port, manifest, t0, offset, period) {
    for (var i = 0; i < manifest.length; i++) {
      var m = manifest[i];
      if (!port.market.rows[m.cid]) continue;
      port.market.inbound.push({
        cid: m.cid, qty: m.qty, t0: t0, cruise: offset, period: period
      });
    }
  }

  /* Orbital radius of `body` measured about `ancestor` — one hop for a
   * station about its planet, the planet's own orbit when the two ports are
   * around different worlds. */
  /* ---- what fuel costs where ---------------------------------------------
   * Hydrogen is skimmed from gas and ice giants and carried everywhere
   * else, so its price should be the price of the haul. Every port still
   * SELLS it — that guarantee is in economy.js and it is a gameplay
   * promise, not a physical one — but a port a long way from any giant
   * pays for every tonne to be brought in, and passes that on.
   *
   * Distance is measured as the difference in orbital radius about the
   * star, not as a distance at some instant: it is a structural fact about
   * where a port sits, and a structural factor must not depend on t. A
   * port ORBITING a giant reads zero and gets the refinery price.
   *
   * The consequence is the interesting part, and it was not designed in —
   * it falls out. A rich mining world far from any giant charges more for
   * its ores AND pays more for its fuel, so its real margin can be worse
   * than a poorer world sitting next to a refinery. "Expensive wares" and
   * "profitable to work" stop being the same statement, which is exactly
   * the sort of thing a trade game should make you learn by flying. */
  var FUEL_HAUL_PER_AU = 0.055;   // fraction added to the structural price
  var FUEL_HAUL_CAP = 0.85;       // never more than this over the refinery
  var FUEL_NO_GIANT = 0.95;       // a system with nothing to skim imports it

  function priceFuelByHaulage(sys) {
    var ports = sys.ports || [];
    if (!ports.length) return;

    var giants = sys.bodies.filter(function (b) {
      return b.type === 'gasGiant' || b.type === 'iceGiant';
    });

    for (var i = 0; i < ports.length; i++) {
      var row = ports[i].market && ports[i].market.rows[Eco.FUEL_ID];
      if (!row) continue;

      var haul;
      if (!giants.length) {
        haul = FUEL_NO_GIANT;      // nothing in this system to skim
      } else {
        var here = radiusAbout(ports[i], sys.root, sys);
        var best = Infinity;
        for (var g = 0; g < giants.length; g++) {
          /* A port whose host IS the giant has hauled it nowhere. */
          var anc = ports[i].parentBody;
          if (anc === giants[g]) { best = 0; break; }
          var there = giants[g].orbit ? giants[g].orbit.a : here;
          best = Math.min(best, Math.abs(here - there));
        }
        var au = best / AU;
        haul = Math.min(FUEL_HAUL_CAP, au * FUEL_HAUL_PER_AU);
      }
      row.local *= 1 + haul;
      row.haul = Math.round(haul * 100) / 100;   // for the market screen
    }
  }

  function radiusAbout(body, ancestor, sys) {
    var p = body;
    while (p && p.parentBody !== ancestor) p = p.parentBody;
    if (!p) p = body;
    // A pad sits on the ground, so its "orbital radius" about its own world
    // is that world's radius — which is exactly the distance a shuttle from
    // the orbital port has to cover to reach it.
    if (p.surface) return p.parentBody ? p.parentBody.radius : 1;
    return p.orbit ? p.orbit.a : (body.orbit ? body.orbit.a : 1);
  }

  /* Flatten the tree, compute gravitational parameters, and index by id. */
  function finalize(sys) {
    var bodies = [];
    (function walk(b, depth, parent) {
      b.depth = depth;
      b.parentBody = parent || null;
      b.mu = V.G * b.mass;
      if (b.orbit) {
        b.orbit.period = K.period(b.orbit.a, (parent ? parent.mu : 0) + b.mu);
      }
      bodies.push(b);
      for (var i = 0; i < b.children.length; i++) walk(b.children[i], depth + 1, b);
    })(sys.root, 0, null);

    sys.bodies = bodies;
    sys.byId = {};
    for (var i = 0; i < bodies.length; i++) sys.byId[bodies[i].id] = bodies[i];

    /* Only bodies that meaningfully bend a trajectory go in the gravity loop.
     * Skipping station-scale masses costs nothing physically (their pull is
     * ~1e-20 of a planet's) and keeps the integrator cheap. */
    sys.gravBodies = bodies.filter(function (b) { return b.mass > 1e18; });
    // Landing pads, indexed once: the flight loop asks "am I over a pad"
    // every physics substep and should not walk the whole system to find out.
    sys.pads = bodies.filter(function (b) { return !!b.surface; });
    sys._cache = { t: NaN, pos: {}, vel: {} };
    return sys;
  }

  /* Stable, comparable snapshot of a system's static definition — used by the
   * tests to prove two seeds produce identical universes. */
  function describe(sys) {
    return sys.bodies.map(function (b) {
      return {
        id: b.id, name: b.name, kind: b.kind, type: b.type,
        mass: b.mass, radius: b.radius,
        orbit: b.orbit ? {
          parent: b.orbit.parent, a: b.orbit.a, e: b.orbit.e,
          inc: b.orbit.inc, lan: b.orbit.lan, argp: b.orbit.argp, m0: b.orbit.m0
        } : null
      };
    });
  }

  var Gen = {
    AU: AU, M_SUN: M_SUN, M_EARTH: M_EARTH, R_SUN: R_SUN, DEG: DEG,
    PLANET_TYPES: PLANET_TYPES,
    SHIP_CLASSES: SHIP_CLASSES,
    PATROL_CLASSES: PATROL_CLASSES,
    OUTLAW: OUTLAW,
    SHIP_SPEC: SHIP_SPEC,
    LIFT_MARGIN: LIFT_MARGIN,
    MAX_SURFACE_G: MAX_SURFACE_G,
    ladenMass: ladenMass,
    surfaceGravity: surfaceGravity,
    buildRotations: buildRotations,
    makeSurfacePort: makeSurfacePort,
    buildFactions: buildFactions,
    FACTION_STEM: FACTION_STEM,
    FACTION_COLORS: FACTION_COLORS,
    makeName: makeName,
    buildGovernment: buildGovernment,
    GOVERNMENTS: GOVERNMENTS,
    GOVERNMENT_BY_ID: GOVERNMENT_BY_ID,
    /* Exported so render.js can build the shaft mesh to the SAME depth the
     * simulation berths ships at. Duplicating the number would mean a
     * hangar drawn somewhere the ship does not actually stop. */
    SHALLOW_DEPTH: SHALLOW_DEPTH,
    bayGeometry: bayGeometry,
    berthOffset: berthOffset,
    BERTH_COUNT: BERTH_COUNT,
    UNDERGROUND_DEPTH: UNDERGROUND_DEPTH,
    UNDERGROUND_TUNNEL: UNDERGROUND_TUNNEL,
    COLLAR_HEIGHT: COLLAR_HEIGHT,
    buildPatrols: buildPatrols,
    buildContraband: buildContraband,
    generateSystem: generateSystem,
    interstellarSystem: interstellarSystem,
    starPreview: starPreview,
    finalize: finalize,
    describe: describe,
    hillRadius: hillRadius,
    radiusFromMass: radiusFromMass,
    buildEconomy: buildEconomy,
    buildTraffic: buildTraffic,
    commonParent: commonParent,
    radiusAbout: radiusAbout
  };

  global.Gen = Gen;
  if (typeof module !== 'undefined' && module.exports) module.exports = Gen;
})(typeof window !== 'undefined' ? window : globalThis);
