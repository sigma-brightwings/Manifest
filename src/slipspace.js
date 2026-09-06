/* slipspace.js — the corridor between stars, and everyone else who is in it.
 *
 * Until now a jump was a cutscene: seven seconds of tunnel, a clock that ran
 * forward, and a new sky at the end. Nobody else was ever in there. This file
 * makes the corridor a PLACE — with traffic, with wakes at both mouths, and
 * with the possibility of being caught in it.
 *
 * Three ideas, in dependency order:
 *
 *  1. TRANSIT TIME IS MASS. The old flat 7 h/ly is replaced by a base plus a
 *     mass term. The number is chosen so that a FULLY LADEN player ship still
 *     takes almost exactly seven hours per light year — the game everyone has
 *     been playing is the heavy end of the new curve, not a different curve.
 *     Flying light is now genuinely faster, which is the whole premise: you
 *     cannot catch anybody in a full hold.
 *
 *  2. LANES ARE A TIMETABLE, NOT A FLEET. Interstellar traffic is generated
 *     the same way system traffic always was — a periodic schedule that is a
 *     pure function of (seed, t). Nothing is stored, nothing is ticked while
 *     you are elsewhere, and a wake you find is COMPUTED from the timetable
 *     rather than remembered. A ship only becomes an object with state at the
 *     moment you are actually in the corridor with it.
 *
 *  3. A WAKE IS EVIDENCE. Slipspace entry and exit both tear the local
 *     vacuum and leave exotic matter behind — red and arcing where a hull
 *     departed, blue where one arrived. It disperses over hours. Scanning it
 *     tells you where they went and roughly what they were, and how much it
 *     tells you depends on how fresh it is and how close you got. That is the
 *     whole intelligence loop: find the wake, read the wake, follow the ship.
 *
 * Two pieces of fitted hardware answer each other across this file. The WAKE
 * BAFFLE scatters what you leave behind, so you are hard to find at all. The
 * HARMONIC TRANSIT ANCHOR resists the pull once somebody has found you. They
 * are priced accordingly: the baffle is cheap because it only helps before
 * anything has gone wrong, and the anchor is dear because it is the one that
 * helps afterwards.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG || require('./rng.js');

  /* ---- hull classes ------------------------------------------------------
   * One axis, all-up tonnage, four bands. Everything sized to a hull — the
   * two modules, how hard you pull, how hard you resist — is sized off this
   * rather than off a separate stat, because a second stat would drift away
   * from the first one the moment somebody added a hull and forgot.
   *
   * The player's reference hull is 146 t fully laden, comfortably Class I.
   * The boundaries are set wide enough that a heavier player hull later can
   * be added without silently re-pricing everybody's fitted equipment. */
  /* `pull` deliberately spans far less than `resist` does. An early version
   * ran pull from 1.0 to 4.6 and it made the anchor worthless: a bulk hull
   * tore a light one out in six seconds whatever it had fitted, so the most
   * expensive module in the game bought a player nothing they could feel.
   * Mass should help an interdictor, but the defence has to be able to
   * answer it, and a defence that only works against your own weight class
   * is not a defence. */
  var HULL_CLASSES = [
    { idx: 0, id: 'I',   name: 'light',  maxTonnes: 200,      pull: 1.00, resist: 2.20 },
    { idx: 1, id: 'II',  name: 'medium', maxTonnes: 600,      pull: 1.45, resist: 3.00 },
    { idx: 2, id: 'III', name: 'heavy',  maxTonnes: 1800,     pull: 1.95, resist: 4.00 },
    { idx: 3, id: 'IV',  name: 'bulk',   maxTonnes: Infinity, pull: 2.50, resist: 5.50 }
  ];

  function hullClassFor(tonnes) {
    for (var i = 0; i < HULL_CLASSES.length; i++) {
      if (tonnes <= HULL_CLASSES[i].maxTonnes) return HULL_CLASSES[i];
    }
    return HULL_CLASSES[HULL_CLASSES.length - 1];
  }

  function hullClassById(id) {
    for (var i = 0; i < HULL_CLASSES.length; i++) {
      if (HULL_CLASSES[i].id === id) return HULL_CLASSES[i];
    }
    return null;
  }

  /* All-up mass of the player's ship, in tonnes. Deliberately the same sum
   * Galaxy.jumpFuel uses — if these two ever disagree, a jump could cost
   * fuel for a mass it does not take time for, which is nonsense. */
  function allUpMass(ship) {
    if (!ship) return 0;
    var cargo = 0;
    if (ship.cargo) for (var k in ship.cargo) cargo += ship.cargo[k];
    return (ship.dryMass || 0) + (ship.fuel || 0) + (ship.thrusterFuel || 0) + cargo;
  }

  /* ---- transit time ------------------------------------------------------
   * hours/ly = BASE + (all-up tonnes / 100) * PER_100T
   *
   * Calibration, and it is not an accident: the player's hull fully laden is
   * 42 dry + 28 jump fuel + 12 reaction mass + 64 cargo = 146 t, which lands
   * on 4.2 + 1.46*1.9 = 6.97 h/ly. The old constant was 7. So every jump the
   * game has ever made is still, to within a rounding error, the jump it
   * always was — and everything below a full hold is new speed the player
   * just acquired by unloading.
   *
   * Empty (82 t) comes out at 5.76 h/ly, about 21% faster than laden. A
   * Class III freighter at ~900 t takes 21.3 h/ly, three times slower. That
   * ratio is what makes interception possible at all: you can watch a
   * freighter leave, spend an hour deciding, jump after it, and still be in
   * the corridor with it. */
  var BASE_HOURS_PER_LY = 4.2;
  var HOURS_PER_LY_PER_100T = 1.9;
  var MAX_HOURS_PER_LY = 40;        // even a bulk hauler arrives eventually

  function hoursPerLy(tonnes) {
    var h = BASE_HOURS_PER_LY + (Math.max(0, tonnes) / 100) * HOURS_PER_LY_PER_100T;
    return Math.min(MAX_HOURS_PER_LY, h);
  }

  function transitSeconds(lightYears, tonnes) {
    return Math.max(0, lightYears) * hoursPerLy(tonnes) * 3600;
  }

  /* ---- fitted hardware ---------------------------------------------------
   * Both modules are sized to the hull they are fitted to, because the field
   * has to cover the hull: a Class I baffle on a bulk freighter would leave
   * most of the ship sticking out of it.
   *
   * Pricing, against a game where a courier contract pays 1,800-4,800 cr and
   * you start with 3,200. The baffle is a few good runs. The anchor is a
   * campaign. That gap is deliberate and it is the whole economic shape of
   * the feature: hiding is affordable, and being unpullable is not.
   *
   * The anchor RESISTS, it does not refuse. Bought, fitted and powered, it
   * makes a light interdictor unable to hold you at all and a heavy one work
   * for it — but a big enough hull with enough patience still gets you. A
   * module that ended the mechanic outright would delete the feature for
   * anybody who could afford it, including deleting your own piracy against
   * everyone rich enough to have one. */
  var MODULES = {
    baffle: {
      id: 'baffle',
      name: 'Wake Baffle',
      blurb: 'Scatters the exotic matter you leave at both mouths of a jump, ' +
             'so what you leave behind is harder to find and harder to read.',
      price: { I: 6000, II: 11000, III: 19000, IV: 28000 },
      /* Multiplies the strength of the wake you leave. Lower is better
       * hidden; it never reaches zero, because a jump is a violent thing and
       * something always tears. */
      wakeFactor: { I: 0.30, II: 0.34, III: 0.40, IV: 0.46 }
    },
    anchor: {
      id: 'anchor',
      name: 'Harmonic Transit Anchor',
      blurb: 'Holds your corridor against an interdiction harmonic. It will ' +
             'not refuse a determined heavy hull, but it will make one work.',
      price: { I: 28000, II: 55000, III: 95000, IV: 140000 },
      /* Multiplies the hull's own resistance. A hull always resists a little
       * on its own; the anchor is what turns that into a real defence. The
       * bigger units are marginally better in absolute terms because they
       * have more power to work with, but only marginally — the class is
       * about what the field COVERS, not how hard it pulls. */
      resistFactor: { I: 1.00, II: 1.06, III: 1.12, IV: 1.18 }
    }
  };

  function modulePrice(kind, classId) {
    var m = MODULES[kind];
    if (!m) return 0;
    return m.price[classId] || 0;
  }

  /* What is fitted, as a hull-class id, or null. Stored on the ship as
   * `ship.modules = { baffle: 'I', anchor: null }` so it saves with the ship
   * for free, exactly the way docking clearance does. */
  function fittedClass(ship, kind) {
    if (!ship || !ship.modules) return null;
    return ship.modules[kind] || null;
  }

  /* A module only works if it is rated for the hull it is bolted to. Fitting
   * a light baffle to a heavy hull is legal and useless, and the shop says
   * so rather than refusing the sale — a player is allowed to buy the wrong
   * thing, they are just told first. */
  function moduleEffective(ship, kind) {
    var fitted = fittedClass(ship, kind);
    if (!fitted) return false;
    var need = hullClassFor(allUpMass(ship));
    var have = hullClassById(fitted);
    return !!have && have.idx >= need.idx;
  }

  /* ---- interdiction arithmetic -------------------------------------------
   * Lock is a number in [0,1] that grows while an attacker holds a target
   * inside lock range and decays when it does not. The target's resistance
   * BLEEDS it continuously, so an outmatched attacker does not merely lock
   * slowly — the lock never grows at all, and the readout says so honestly
   * rather than creeping toward a number it will never reach.
   *
   *   d(lock)/dt = (pull - resist * BLEED) / LOCK_SECONDS      in range
   *   d(lock)/dt = -1 / LOCK_RELEASE                           out of range
   *
   * The measured shape, with the player's 146 t hull as the target:
   *
   *   unanchored, light attacker      38 s      the ordinary bad day
   *   Class I anchor, light attacker  5+ min    a light pirate gives up
   *   Class I anchor, medium          48 s      still gets you, working
   *   Class I anchor, bulk            16 s      mass eventually tells
   *
   * That is the promise the price is charging for: fit an anchor and the
   * cheap opportunist can no longer touch you, while the serious hunter
   * still can. Turning BLEED down to 0.22 collapsed the middle two rows
   * into each other and made the module feel like a rounding error. */
  var LOCK_SECONDS = 25;
  var LOCK_RELEASE = 6;        // seconds to bleed a full lock once you lose them
  var ANCHOR_BLEED = 0.42;

  function pullOf(tonnes) { return hullClassFor(tonnes).pull; }

  /* Resistance of a target: its hull's own stubbornness, multiplied by an
   * anchor if it is carrying one that fits. An unanchored hull resists a
   * little — mass is mass — which is why hullClassFor carries `resist` and
   * the anchor only scales it. */
  function resistOf(tonnes, anchorClassId) {
    var base = hullClassFor(tonnes).resist;
    if (!anchorClassId) return base * 0.36;   // bare hull: stubborn, not defended
    var mod = MODULES.anchor.resistFactor[anchorClassId] || 1;
    var need = hullClassFor(tonnes);
    var have = hullClassById(anchorClassId);
    // An undersized anchor covers only part of the hull, and helps only partly.
    var fit = (have && have.idx >= need.idx) ? 1 : 0.45;
    return base * mod * fit;
  }

  /* Net lock rate per second, before range gating. Negative or zero means
   * this attacker cannot hold this target however long they stay alongside,
   * and the HUD should say "CANNOT HOLD" rather than draw a stalled bar. */
  function lockRate(attackerTonnes, targetTonnes, targetAnchorClass) {
    var pull = pullOf(attackerTonnes);
    var resist = resistOf(targetTonnes, targetAnchorClass);
    return (pull - resist * ANCHOR_BLEED) / LOCK_SECONDS;
  }

  function canHold(attackerTonnes, targetTonnes, targetAnchorClass) {
    return lockRate(attackerTonnes, targetTonnes, targetAnchorClass) > 1e-6;
  }

  /* Seconds of unbroken proximity to complete a lock from cold, or Infinity
   * if it cannot be done. Quoting this is far more useful to a pilot than
   * quoting a rate. */
  function lockTime(attackerTonnes, targetTonnes, targetAnchorClass) {
    var r = lockRate(attackerTonnes, targetTonnes, targetAnchorClass);
    return r > 1e-6 ? 1 / r : Infinity;
  }

  /* Reaction mass, in tonnes, to actually tear a hull out once the lock
   * completes. Scaled by THEIR mass, because you are dragging it. This is
   * what rations piracy: the player's whole reaction tank is 12 t, so a
   * 900 t freighter costs five of them and you had better be sure the hold
   * is worth it.
   *
   * It was 0.9 at first, which made the same freighter cost 8.1 t — and left
   * a successful pirate sitting in interstellar space with two tonnes of
   * reaction mass and a robbery still to conduct. The cost should ration the
   * decision, not strand you the moment you win. At 0.55 the ceiling lands
   * around 2,100 t, which is most of the lane traffic and none of the bulk
   * haulers: to rob a bulker you need a bigger ship, and that is the right
   * thing for it to mean. */
  var TEAR_MASS_PER_100T = 0.55;

  function tearCost(targetTonnes) {
    return (Math.max(0, targetTonnes) / 100) * TEAR_MASS_PER_100T;
  }

  /* ---- corridor speed ----------------------------------------------------
   * Inside the corridor you have a throttle, and it is the only control that
   * matters. It trades reaction mass for corridor speed.
   *
   * THE BAND IS DELIBERATELY ASYMMETRIC, and this is the single most
   * important number in the feature. Pushing the corridor wider than your
   * mass wants it is hard: +35% and no more. Letting it close down is easy:
   * all the way to a fifth of nominal.
   *
   * The reason is the whole shape of an interception. Catching a freighter
   * is the easy half — you are three or four times its speed and you close
   * on it whatever you do. The hard half is STAYING alongside: overhaul it
   * at full tilt and you are past and gone in a second and a half, with the
   * lock barely started. So you have to throttle back and MATCH, and a
   * symmetric band would not let a fast hull slow to a freighter's pace at
   * all — you would be physically unable to hold the thing you had just
   * caught. A 0.20 floor covers a speed ratio of five to one, which is every
   * hull you are able to tear out anyway.
   *
   * This is the same lesson the in-system pirates already teach, arrived at
   * from the other side: they close, they match velocity, and only then do
   * they make their demand. */
  var THROTTLE_UP = 0.35;                // fastest you can force it: 1.35x
  var THROTTLE_DOWN = 0.80;              // slowest you can let it close: 0.20x
  var THROTTLE_BAND = THROTTLE_UP;       // kept for callers that quote the ceiling
  var BOOST_MASS_PER_HOUR = 0.55;        // t of reaction mass at full throttle

  function throttleScale(throttle) {
    var t = Math.max(-1, Math.min(1, throttle || 0));
    return t >= 0 ? (1 + t * THROTTLE_UP) : (1 + t * THROTTLE_DOWN);
  }

  /* Fraction of the corridor covered per SIM second at a given throttle. */
  function corridorRate(lightYears, tonnes, throttle) {
    var nominal = transitSeconds(lightYears, tonnes);
    if (nominal <= 0) return 1;
    return (1 / nominal) * throttleScale(throttle);
  }

  /* Reaction mass burned per REAL second of corridor flight. Quadratic in
   * throttle and free at neutral, so an ordinary jump never touches the
   * tank — but loitering alongside a freighter is not free, because holding
   * a corridor at a width it does not want is work in either direction.
   * Boosting costs more than braking, which is the same asymmetry the speed
   * band has and for the same reason. */
  function corridorBurn(throttle) {
    var t = Math.max(-1, Math.min(1, throttle || 0));
    var k = t >= 0 ? 1 : 0.55;
    return (BOOST_MASS_PER_HOUR / 3600) * t * t * k;
  }

  /* ---- lanes -------------------------------------------------------------
   * Which stars does traffic actually run between? Not all of them: a lane
   * needs a reason. Every star gets lanes to a handful of its nearest
   * neighbours, weighted so that same-faction pairs trade more than pairs
   * across a border, because that is what a border is for.
   *
   * Lanes are SYMMETRIC and derived from the pair, not from the endpoint you
   * happen to be standing on — the id is built from the two star ids in
   * sorted order. That matters: a wake you read at one end has to describe
   * the same ship the other end is expecting, or following it would take you
   * somewhere nobody was going. */
  var LANE_NEIGHBOURS = 5;        // candidate nearest stars per star
  var LANE_MAX_LY = 14;           // nobody runs a scheduled service further

  function laneId(a, b) {
    return a.id < b.id ? (a.id + '~' + b.id) : (b.id + '~' + a.id);
  }

  function dist3(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /* Unit vector from one star toward another, in galaxy coordinates. The
   * system view reuses this directly as a direction in world space, which is
   * what makes departure wakes cluster on the outward bearing of wherever
   * they are going — you can read the traffic pattern of a system off its
   * sky before you scan a single wake. */
  function bearing(from, to) {
    var dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return { x: dx / d, y: dy / d, z: dz / d };
  }

  /* The hulls that fly between stars. Bigger and slower than anything on the
   * in-system rails, because crossing four light years in a hull the size of
   * a shuttle is not a business. */
  var LANE_CLASSES = [
    { cls: 'packet',   w: 22, label: 'packet',        tonnes: [90, 210],    color: '#9fd4ff' },
    { cls: 'trader',   w: 30, label: 'trader',        tonnes: [260, 560],   color: '#d8c79a' },
    { cls: 'freighter', w: 28, label: 'freighter',    tonnes: [700, 1500],  color: '#c9b98a' },
    { cls: 'bulker',   w: 12, label: 'bulk hauler',   tonnes: [1900, 3600], color: '#a8d8c0' },
    { cls: 'liner',    w: 8,  label: 'liner',         tonnes: [420, 900],   color: '#e0c0ff' }
  ];

  function pickLaneClass(rng) {
    var total = 0, i;
    for (i = 0; i < LANE_CLASSES.length; i++) total += LANE_CLASSES[i].w;
    var r = rng.next() * total;
    for (i = 0; i < LANE_CLASSES.length; i++) {
      r -= LANE_CLASSES[i].w;
      if (r <= 0) return LANE_CLASSES[i];
    }
    return LANE_CLASSES[0];
  }

  var LANE_LINES = ['Ardent', 'Coldwater', 'Fenwick', 'Halcyon', 'Ironwake', 'Juno',
                    'Kestrel', 'Lodestar', 'Mirefast', 'Northlight', 'Overwater',
                    'Pilgrim', 'Quillon', 'Redsail', 'Slipstream', 'Tallow',
                    'Verity', 'Windlass'];
  var LANE_HULLS = ['Carrier', 'Runner', 'Drover', 'Packet', 'Barge', 'Clipper',
                    'Lighter', 'Tender', 'Wain', 'Ferryman', 'Longhaul'];

  /* Every lane that touches this star. Cached on the galaxy by star id,
   * because the answer never changes for a given galaxy — it is a pure
   * function of star positions, which are fixed at build time. */
  function lanesFrom(galaxy, star) {
    if (!galaxy || !star) return [];
    if (!galaxy._lanes) galaxy._lanes = {};
    if (galaxy._lanes[star.id]) return galaxy._lanes[star.id];

    /* Compared BY ID, not by object identity. A star handed in from a
     * rebuilt galaxy — after a load, or from a test that builds twice — is
     * an equal but different object, and an identity check silently let it
     * become its own nearest neighbour at zero distance. Nothing threw; the
     * lane list just quietly went wrong. Same lesson as nav locks storing
     * kind+id rather than a reference. */
    var near = [];
    for (var i = 0; i < galaxy.stars.length; i++) {
      var s = galaxy.stars[i];
      if (s.id === star.id) continue;
      var d = dist3(star, s);
      if (d > LANE_MAX_LY) continue;
      near.push({ star: s, d: d });
    }
    near.sort(function (a, b) { return a.d - b.d; });
    near = near.slice(0, LANE_NEIGHBOURS);

    var out = [];
    for (var n = 0; n < near.length; n++) {
      out.push(buildLane(galaxy, star, near[n].star, near[n].d));
    }
    galaxy._lanes[star.id] = out;
    return out;
  }

  /* One lane, built from the PAIR so both ends agree on it. Its own named
   * substream keyed off the galaxy seed and the sorted pair id, so adding
   * lanes could never have shifted a single existing star, faction or
   * system — the same additive discipline as ports and underground bays. */
  function buildLane(galaxy, from, to, distance) {
    var id = laneId(from, to);
    var rng = new RNG('galaxy-lane|' + galaxy.seed + '|' + id);

    /* Same-faction pairs run a denser service than cross-border ones. */
    var sameFlag = from.factionId && from.factionId === to.factionId;
    var runs = rng.int(sameFlag ? 2 : 1, sameFlag ? 4 : 2);

    var legs = [];
    for (var r = 0; r < runs; r++) {
      var spec = pickLaneClass(rng);
      var tonnes = Math.round(rng.range(spec.tonnes[0], spec.tonnes[1]));
      var cross = transitSeconds(distance, tonnes);
      var layover = rng.range(0.6, 3.2) * 86400;
      /* A round trip: out, sit, back, sit. The period is what makes the
       * timetable answer any t at all without simulating anything. */
      var period = 2 * (cross + layover);
      legs.push({
        idx: r,
        name: rng.pick(LANE_LINES) + ' ' + rng.pick(LANE_HULLS),
        cls: spec.cls,
        className: spec.label,
        color: spec.color,
        tonnes: tonnes,
        hullClass: hullClassFor(tonnes).id,
        /* Whether this operator fits a baffle, and an anchor. Big money
         * protects itself: the heavier the hull the likelier both. A lane
         * ship's kit is fixed for the life of the galaxy, so the freighter
         * you failed to hold last week is the same one you will fail to
         * hold next week — which is information, and worth remembering. */
        baffle: rng.chance(0.10 + hullClassFor(tonnes).idx * 0.10)
                  ? hullClassFor(tonnes).id : null,
        anchor: rng.chance(0.06 + hullClassFor(tonnes).idx * 0.13)
                  ? hullClassFor(tonnes).id : null,
        cross: cross,
        layover: layover,
        period: period,
        t0: rng.range(0, period),
        /* Which end this run starts from, so a lane's ships are not all
         * pointing the same way at the same time. */
        originId: rng.chance(0.5) ? from.id : to.id
      });
    }

    return {
      id: id,
      a: from.id < to.id ? from : to,
      b: from.id < to.id ? to : from,
      distance: distance,
      sameFaction: !!sameFlag,
      legs: legs
    };
  }

  /* Where is one scheduled run, at time t, relative to a given star?
   *
   * Returns null when the ship is sitting in port rather than in transit or
   * freshly moved. Otherwise: which way it is going, how far through, and
   * the two moments that matter — when it left and when it lands. */
  function runState(lane, leg, t) {
    var origin = leg.originId === lane.a.id ? lane.a : lane.b;
    var other = origin === lane.a ? lane.b : lane.a;

    var phase = ((t - leg.t0) % leg.period + leg.period) % leg.period;
    var cycleStart = t - phase;

    // out: [0, cross)   sit: [cross, cross+layover)
    // back: [cross+layover, 2cross+layover)   sit: rest
    if (phase < leg.cross) {
      return {
        lane: lane, leg: leg, dir: 'out',
        from: origin, to: other,
        departedAt: cycleStart,
        arrivesAt: cycleStart + leg.cross,
        progress: phase / leg.cross,
        inTransit: true
      };
    }
    var backStart = leg.cross + leg.layover;
    if (phase >= backStart && phase < backStart + leg.cross) {
      return {
        lane: lane, leg: leg, dir: 'back',
        from: other, to: origin,
        departedAt: cycleStart + backStart,
        arrivesAt: cycleStart + backStart + leg.cross,
        progress: (phase - backStart) / leg.cross,
        inTransit: true
      };
    }
    /* Not flying. Report the leg that most recently LANDED, because that is
     * what leaves an arrival wake behind, and the one about to leave. */
    if (phase < backStart) {
      return {
        lane: lane, leg: leg, dir: 'out',
        from: origin, to: other,
        departedAt: cycleStart,
        arrivesAt: cycleStart + leg.cross,
        progress: 1, inTransit: false
      };
    }
    return {
      lane: lane, leg: leg, dir: 'back',
      from: other, to: origin,
      departedAt: cycleStart + backStart,
      arrivesAt: cycleStart + backStart + leg.cross,
      progress: 1, inTransit: false
    };
  }

  /* Every run on every lane touching this star, at time t. */
  function runsAt(galaxy, star, t) {
    var lanes = lanesFrom(galaxy, star);
    var out = [];
    for (var i = 0; i < lanes.length; i++) {
      for (var j = 0; j < lanes[i].legs.length; j++) {
        var st = runState(lanes[i], lanes[i].legs[j], t);
        if (st) out.push(st);
      }
    }
    return out;
  }

  /* ---- wakes -------------------------------------------------------------
   * A wake is not stored anywhere. It is what you get when you ask the
   * timetable "did anything leave or land here recently", and it exists for
   * as long as the exotic matter takes to disperse.
   *
   * Red and arcing where a hull went in. Blue where one came out. That is
   * the entire read at a glance, before you scan anything: red means
   * somebody left and there is a trail to follow, blue means somebody
   * arrived and is probably still in the system. */
  /* Sixteen hours to disperse completely, and the fade is quadratic, so the
   * useful part is the first two. Measured against the timetable this puts
   * roughly two or three wakes in a busy system at any given moment and
   * leaves one entirely empty about a tenth of the time — which is the right
   * shape. The scarcity that matters is not "is there a wake", it is "is
   * there a wake still fresh enough to be worth following", and a six-hour
   * life put the wrong one of those in the player's way. */
  var WAKE_LIFE = 16 * 3600;         // seconds until it is gone entirely
  var WAKE_SCAN_RANGE = 240000;      // km — you have to go and look

  function wakesAt(galaxy, star, t) {
    var runs = runsAt(galaxy, star, t);
    var out = [];
    for (var i = 0; i < runs.length; i++) {
      var st = runs[i];
      // A departure from HERE leaves a red wake here.
      if (st.from.id === star.id) {
        var dAge = t - st.departedAt;
        if (dAge >= 0 && dAge < WAKE_LIFE) out.push(makeWake('departure', st, star, dAge));
      }
      // An arrival AT here leaves a blue one.
      if (st.to.id === star.id && !st.inTransit) {
        var aAge = t - st.arrivesAt;
        if (aAge >= 0 && aAge < WAKE_LIFE) out.push(makeWake('arrival', st, star, aAge));
      }
    }
    out.sort(function (a, b) { return a.age - b.age; });
    return out;
  }

  function makeWake(kind, st, star, age) {
    var other = st.from.id === star.id ? st.to : st.from;
    var b = bearing(star, other);
    /* Strength falls off smoothly and is cut by a baffle. A baffled hull's
     * wake is faint from the moment it forms, so it both fades out of scan
     * range sooner and reads worse while it lasts — one number doing both
     * jobs, which is why the baffle is worth its price without needing a
     * second mechanic. */
    var fade = 1 - (age / WAKE_LIFE);
    fade = fade * fade;                       // disperses fast at first
    var baffled = st.leg.baffle
      ? (MODULES.baffle.wakeFactor[st.leg.baffle] || 0.4) : 1;
    return {
      id: kind.charAt(0) + ':' + st.lane.id + ':' + st.leg.idx + ':' +
          Math.round(kind === 'departure' ? st.departedAt : st.arrivesAt),
      kind: kind,
      lane: st.lane,
      leg: st.leg,
      atStar: star,
      otherStar: other,
      dir: b,
      age: age,
      life: WAKE_LIFE,
      strength: fade * baffled,
      baffled: !!st.leg.baffle,
      departedAt: st.departedAt,
      arrivesAt: st.arrivesAt,
      run: st
    };
  }

  /* Where in the system does a wake actually hang?
   *
   * Ships do not drop into slipspace from a parking orbit — they climb out
   * past the last planet first, and they do it on the bearing of wherever
   * they are going. So wakes form a loose ring outside the system, and each
   * one sits on the line toward its own destination.
   *
   * That is worth more than it sounds. It means the pattern of wakes in a
   * system's outer sky IS its trade map: a cluster of red on one bearing is
   * a busy lane, and you can read which way traffic runs before you have
   * scanned a single one of them.
   *
   * The radius is cached on the system because it is a property of the
   * system, not of the wake, and recomputing it per wake per frame would
   * walk every body in the system several times a second. */
  function jumpRingRadius(sys) {
    if (!sys) return 1e9;
    if (sys._jumpRing) return sys._jumpRing;
    var far = 0;
    var bodies = sys.bodies || [];
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (b.orbit && b.orbit.a > far && b.parentBody === sys.root) far = b.orbit.a;
    }
    /* A system with nothing in orbit — an interstellar locale — still needs
     * a finite answer rather than zero, or every wake would sit on top of
     * the star. It will not be asked for one, but a renderer that divides by
     * this should not be able to find out the hard way. */
    if (far <= 0) far = (sys.root && sys.root.radius ? sys.root.radius : 7e5) * 400;
    sys._jumpRing = far * 1.15;
    return sys._jumpRing;
  }

  /* World position of a wake, given where the system's star is right now.
   * Kept Sim-free — the caller passes the star's position, because this file
   * deliberately knows nothing about how bodies move. */
  function wakePosition(wake, sunPos, radius) {
    var d = wake.dir;
    return {
      x: sunPos.x + d.x * radius,
      y: sunPos.y + d.y * radius,
      z: sunPos.z + d.z * radius
    };
  }

  /* ---- reading a wake ----------------------------------------------------
   * How much a wake tells you is a single number — fidelity — built from how
   * strong it still is and how close you got to it. Everything the scan can
   * say is gated behind a threshold on that number, so the degradation is
   * one ordering rather than four independent rules, and the instrument can
   * honestly report WHY it is not telling you more.
   *
   *   > 0.75  everything: destination, when, what class, how heavy
   *   > 0.50  destination, when it left, hull class
   *   > 0.28  destination and roughly when
   *   > 0.10  destination only
   *   below   a bearing, and the knowledge that something went that way
   */
  function scanFidelity(wake, distanceKm) {
    if (!wake) return 0;
    var d = Math.max(0, distanceKm || 0);
    var prox = 1 - (d / WAKE_SCAN_RANGE);
    if (prox <= 0) return 0;
    prox = Math.min(1, prox);
    // Being close cannot invent detail a faint wake never had, so it is a
    // product rather than a sum — and a baffled wake read from point blank
    // still tops out well short of a full read.
    return Math.max(0, Math.min(1, wake.strength * (0.35 + 0.65 * prox)));
  }

  function scanWake(wake, distanceKm) {
    var f = scanFidelity(wake, distanceKm);
    var res = {
      fidelity: f,
      kind: wake ? wake.kind : null,
      inRange: f > 0,
      bearing: wake ? wake.dir : null,
      destination: null,
      destinationName: null,
      departedAt: null,
      timeKnown: false,
      hullClass: null,
      className: null,
      tonnes: null,
      name: null,
      anchored: null,
      note: ''
    };
    if (!wake || f <= 0) { res.note = 'no return'; return res; }

    if (f > 0.10) {
      res.destination = wake.otherStar;
      res.destinationName = wake.otherStar.name;
    } else {
      res.note = 'bearing only — the trail is too thin to name a star';
      return res;
    }
    if (f > 0.28) {
      res.departedAt = wake.kind === 'departure' ? wake.departedAt : wake.arrivesAt;
      res.timeKnown = true;
    }
    if (f > 0.50) {
      res.hullClass = wake.leg.hullClass;
      res.className = wake.leg.className;
      res.name = wake.leg.name;
    }
    if (f > 0.75) {
      res.tonnes = wake.leg.tonnes;
      res.anchored = !!wake.leg.anchor;
      res.note = 'full return';
    } else if (f > 0.50) {
      res.note = 'class resolved, tonnage uncertain';
    } else if (f > 0.28) {
      res.note = 'destination and departure resolved';
    } else {
      res.note = 'destination only — too faint to time';
    }
    if (wake.baffled) res.note += ' · scattered return (baffled)';
    return res;
  }

  /* ---- following ---------------------------------------------------------
   * Having read a wake, can you actually catch it? This is the question the
   * chart wants answered before you spend the fuel, and it is pure
   * arithmetic: they left at a known time at a known speed, you would leave
   * now at yours, and either you overhaul them before the far end or you do
   * not.
   *
   * Returns the fraction of the corridor at which you would draw level. Over
   * 1 means they land first and the chase was never on. */
  function pursuit(distanceLy, targetTonnes, targetDepartedAt, chaserTonnes, now, throttle) {
    var tCross = transitSeconds(distanceLy, targetTonnes);
    var cRate = corridorRate(distanceLy, chaserTonnes, throttle === undefined ? 1 : throttle);
    var tRate = 1 / tCross;
    var head = Math.max(0, now - targetDepartedAt) * tRate;   // their progress now
    if (head >= 1) return { possible: false, at: Infinity, seconds: Infinity, headStart: head };
    if (cRate <= tRate) return { possible: false, at: Infinity, seconds: Infinity, headStart: head };
    var seconds = head / (cRate - tRate);
    var at = cRate * seconds;
    return {
      possible: at <= 1,
      at: at,
      seconds: seconds,
      headStart: head,
      /* Once level, you still have to HOLD them for a lock, and the corridor
       * may run out first. The chart quotes the margin so the decision is
       * made before the fuel is spent, not after. */
      remainingSeconds: at <= 1 ? (1 - at) / cRate : 0
    };
  }

  /* ---- the corridor ------------------------------------------------------
   * A jump used to be seven seconds of animation with the controls dead.
   * It still is, MOST of the time, and that is deliberate: a routine hop
   * down an empty lane should not become a thirty-second chore just because
   * the corridor is now a place. The tunnel only wakes up when there is
   * somebody in it with you.
   *
   * Time inside runs on a fixed conversion — so many transit-hours per real
   * second — applied identically to you and to everyone else. That is what
   * keeps the closing rates honest: a freighter that is a quarter your speed
   * in hours per light year is a quarter your speed on screen. When nothing
   * is within reach the whole thing compresses hard, so an empty twelve
   * light year haul is still over in a few seconds; the compression drops to
   * 1x the moment anyone is close enough to matter, and that transition is
   * itself the signal that you are no longer alone.
   *
   * Traffic comes from the lane timetable and nowhere else. If you jump
   * somewhere no scheduled service runs, the corridor is empty and always
   * will be — which quietly makes lanes worth knowing, and makes a scanned
   * wake worth more than the destination written on it. */
  var HOURS_PER_REAL_SECOND = 0.75;      // corridor time compression, base
  var SIM_PER_REAL = HOURS_PER_REAL_SECOND * 3600;
  var IDLE_COMPRESS = 9;                 // when nobody is near, get on with it
  var ENGAGE_LY = 0.45;                  // close enough to stop compressing
  var LOCK_RANGE_LY = 0.08;              // close enough to build a lock
  var CONTACT_SCAN_LY = 2.5;             // close enough to appear on the board

  /* Who else is on this lane during the crossing? Pure timetable — the same
   * function of (seed, t) that draws the wakes, asked a slightly different
   * question. A contact is a snapshot, not an object with a life of its own;
   * it only becomes real if you actually catch it. */
  function corridorTraffic(galaxy, fromStar, toStar, t) {
    if (!galaxy || !fromStar || !toStar) return [];
    var want = laneId(fromStar, toStar);
    var lanes = lanesFrom(galaxy, fromStar);
    var lane = null;
    for (var i = 0; i < lanes.length; i++) if (lanes[i].id === want) lane = lanes[i];
    if (!lane) return [];      // no scheduled service: an empty corridor

    var out = [];
    for (var j = 0; j < lane.legs.length; j++) {
      var leg = lane.legs[j];
      var st = runState(lane, leg, t);
      if (!st || !st.inTransit) continue;
      /* Which way along OUR corridor are they going? We measure progress
       * from our own origin, so a ship travelling the other way has its
       * progress mirrored — otherwise a head-on contact would appear to be
       * running alongside us. */
      var sameWay = st.from.id === fromStar.id;
      out.push({
        id: lane.id + ':' + leg.idx,
        name: leg.name,
        cls: leg.cls,
        className: leg.className,
        color: leg.color,
        tonnes: leg.tonnes,
        hullClass: leg.hullClass,
        anchor: leg.anchor,
        baffle: leg.baffle,
        sameWay: sameWay,
        hostile: false,
        progress: sameWay ? st.progress : (1 - st.progress),
        /* Their rate along OUR corridor, signed. They fly their own
         * timetable at neutral throttle — nobody else is racing. */
        rate: (sameWay ? 1 : -1) / st.leg.cross,
        departedAt: st.departedAt,
        arrivesAt: st.arrivesAt
      });
    }
    return out;
  }

  /* Is anybody hunting the PLAYER on this crossing?
   *
   * Deterministic in the lane, the departure, and how permissive the space
   * is — not a die rolled every time you press jump, because a threat you
   * can re-roll by reloading is not a threat. Gated on being worth robbing:
   * a broke pilot in an empty hull is not worth the reaction mass, which is
   * the same economics that make YOU pick your targets.
   *
   * Crime score is the local government's permissivity, the number the
   * contraband and police-scan mechanics already read. Lawless space is
   * where this happens, which is exactly what makes an escort contract
   * through it worth paying for. */
  var HUNT_FLOOR_VALUE = 4000;           // credits of cargo worth crossing for

  function corridorHunter(galaxy, fromStar, toStar, t, opts) {
    opts = opts || {};
    var crime = Math.max(opts.crimeFrom || 0, opts.crimeTo || 0);
    if (crime <= 0) return null;
    var worth = (opts.cargoValue || 0) + (opts.contraband ? 9000 : 0);
    if (worth < HUNT_FLOOR_VALUE) return null;

    /* One draw per lane per departure window, so the same jump at the same
     * moment always has the same answer. */
    var window = Math.floor(t / 3600);
    var rng = new RNG('corridor-hunt|' + (galaxy ? galaxy.seed : '') + '|' +
                      laneId(fromStar, toStar) + '|' + window);

    var chance = 0.04 + (crime / 100) * 0.30;
    if (worth > 20000) chance += 0.08;
    if (!rng.chance(chance)) return null;

    /* Interdictors are light and medium hulls. Nobody hunts in a bulker —
     * you cannot catch anything in one, which is the same reason the player
     * cannot either. */
    var heavy = rng.chance(0.35);
    var tonnes = heavy ? Math.round(rng.range(260, 520)) : Math.round(rng.range(110, 195));
    return {
      id: 'hunter:' + laneId(fromStar, toStar) + ':' + window,
      name: 'The ' + rng.pick(['Gallows', 'Cutwater', 'Shrike', 'Ferrymark',
                               'Blackwake', 'Tallowman', 'Riven', 'Coldiron']),
      cls: 'pirate',
      className: heavy ? 'heavy interdictor' : 'interdictor',
      color: '#ff8a76',
      tonnes: tonnes,
      hullClass: hullClassFor(tonnes).id,
      anchor: null,
      baffle: null,
      sameWay: true,
      hostile: true,
      /* They enter behind you and run you down, which is the only way this
       * reads as being hunted rather than ambushed. */
      progress: -0.06,
      rate: 0,          // filled in by openCorridor, which knows the distance
      departedAt: t,
      arrivesAt: t
    };
  }

  /* Open a corridor. `opts` carries the galaxy, the two stars, the player's
   * all-up mass, the sim time of departure, and whatever the local crime
   * situation is. */
  function openCorridor(opts) {
    var lightYears = opts.distanceLy !== undefined
      ? opts.distanceLy : dist3(opts.from, opts.to);
    var tonnes = opts.tonnes || 0;

    var contacts = corridorTraffic(opts.galaxy, opts.from, opts.to, opts.t || 0);
    var hunter = corridorHunter(opts.galaxy, opts.from, opts.to, opts.t || 0, opts);
    if (hunter) {
      /* A hunter is fast by construction — they are here to catch you, and
       * a hunter you outrun without trying is set dressing. Fifteen percent
       * on top of your own nominal rate, so you cannot simply hold full
       * throttle and be safe: you have to spend, or fight, or be anchored. */
      hunter.rate = corridorRate(lightYears, tonnes, 0) * 1.15;
      contacts.push(hunter);
    }

    return {
      from: opts.from, to: opts.to,
      distanceLy: lightYears,
      tonnes: tonnes,
      anchor: opts.anchor || null,
      departT: opts.t || 0,
      crossSeconds: transitSeconds(lightYears, tonnes),
      progress: 0,
      throttle: 0,
      contacts: contacts,
      /* The player's lock on somebody, and somebody's lock on the player.
       * Two separate numbers because both can be climbing at once, and the
       * instrument has to be able to show a pilot losing a race it is also
       * winning. */
      lockOn: null, lock: 0,
      huntedBy: null, huntLock: 0,
      elapsedReal: 0,
      compress: IDLE_COMPRESS,
      live: contacts.length > 0,
      outcome: null,            // 'arrived' | 'tore' | 'torn'
      events: []
    };
  }

  /* Range along the corridor to a contact, in light years, signed: positive
   * means they are ahead of you. */
  function contactRange(cor, c) {
    return (c.progress - cor.progress) * cor.distanceLy;
  }

  /* One frame. dtReal is real seconds; `input` carries the throttle and
   * whether the interdiction trigger is held. Returns the corridor state,
   * with anything worth saying pushed onto `events`. */
  function advanceCorridor(cor, dtReal, input, ship) {
    input = input || {};
    cor.events.length = 0;
    if (cor.outcome) return cor;

    cor.throttle = Math.max(-1, Math.min(1, input.throttle || 0));

    /* Reaction mass first, and if the tank is dry the throttle goes with
     * it — a corridor held open on an empty tank would be free speed. */
    if (ship) {
      var burn = corridorBurn(cor.throttle) * dtReal;
      if (burn > 0) {
        if ((ship.thrusterFuel || 0) <= 0) { cor.throttle = 0; }
        else ship.thrusterFuel = Math.max(0, ship.thrusterFuel - burn);
      }
    }

    /* Compression. Anyone within ENGAGE_LY drops it to real time; that
     * change of pace IS the warning, and it wants no separate alarm. */
    var nearest = null, nearestAbs = Infinity;
    for (var i = 0; i < cor.contacts.length; i++) {
      var d = Math.abs(contactRange(cor, cor.contacts[i]));
      if (d < nearestAbs) { nearestAbs = d; nearest = cor.contacts[i]; }
    }
    var wasCompressed = cor.compress > 1;
    cor.compress = (nearestAbs <= ENGAGE_LY) ? 1 : IDLE_COMPRESS;
    if (wasCompressed && cor.compress === 1 && nearest) {
      cor.events.push({ kind: 'contact', contact: nearest });
    }

    var dtSim = dtReal * cor.compress * SIM_PER_REAL;

    /* Move everybody. Contacts fly their own timetable; only the player has
     * a throttle, because only the player is trying to do something. */
    cor.progress += corridorRate(cor.distanceLy, cor.tonnes, cor.throttle) * dtSim;
    for (var j = 0; j < cor.contacts.length; j++) {
      cor.contacts[j].progress += cor.contacts[j].rate * dtSim;
    }
    cor.elapsedReal += dtReal;

    /* --- the player's lock ------------------------------------------- */
    var target = null;
    if (input.lockHeld) {
      /* Whoever is closest and inside lock range, going the same way. A
       * head-on contact crosses in a moment and cannot be held. */
      var best = null, bestAbs = Infinity;
      for (var k = 0; k < cor.contacts.length; k++) {
        var c = cor.contacts[k];
        if (!c.sameWay) continue;
        var r = Math.abs(contactRange(cor, c));
        if (r <= LOCK_RANGE_LY && r < bestAbs) { bestAbs = r; best = c; }
      }
      target = best;
    }
    if (target) {
      if (cor.lockOn && cor.lockOn !== target.id) cor.lock = 0;
      cor.lockOn = target.id;
      var rate = lockRate(cor.tonnes, target.tonnes, target.anchor);
      if (rate <= 0) {
        cor.lock = 0;
        cor.cannotHold = true;
      } else {
        cor.cannotHold = false;
        cor.lock = Math.min(1, cor.lock + rate * dtReal);
        if (cor.lock >= 1) {
          var cost = tearCost(target.tonnes);
          if (ship && (ship.thrusterFuel || 0) < cost) {
            cor.lock = 0;
            cor.events.push({ kind: 'tearFailed', contact: target, need: cost });
          } else {
            if (ship) ship.thrusterFuel = Math.max(0, ship.thrusterFuel - cost);
            cor.outcome = 'tore';
            cor.tornContact = target;
            cor.events.push({ kind: 'tore', contact: target, cost: cost });
            return cor;
          }
        }
      }
    } else {
      cor.cannotHold = false;
      if (cor.lock > 0) cor.lock = Math.max(0, cor.lock - dtReal / LOCK_RELEASE);
      if (cor.lock <= 0) cor.lockOn = null;
    }

    /* --- somebody's lock on the player -------------------------------- */
    var hunter = null;
    for (var m = 0; m < cor.contacts.length; m++) {
      if (!cor.contacts[m].hostile) continue;
      if (Math.abs(contactRange(cor, cor.contacts[m])) <= LOCK_RANGE_LY) {
        hunter = cor.contacts[m];
        break;
      }
    }
    if (hunter) {
      cor.huntedBy = hunter.id;
      var hRate = lockRate(hunter.tonnes, cor.tonnes, cor.anchor);
      /* Two different things the instrument has to be able to say, and an
       * early version conflated them: the anchor is WORKING (fitted, engaged,
       * making this take far longer than it otherwise would) and the anchor
       * is REFUSING (this attacker cannot finish the lock at all, ever).
       * Reporting only the second meant that in the ordinary case — an
       * anchor buying you five minutes instead of forty seconds — the panel
       * said nothing at all, and the most expensive module in the game
       * appeared to do nothing during the one event it was bought for. */
      cor.anchorHolding = !!cor.anchor;
      cor.anchorRefusing = cor.anchorHolding && hRate <= 0;
      /* How much longer this is taking than it would with nothing fitted —
       * the honest number to put next to the bar. */
      cor.anchorFactor = cor.anchorHolding
        ? (lockRate(hunter.tonnes, cor.tonnes, null) / Math.max(hRate, 1e-9))
        : 1;
      if (hRate > 0) {
        var before = cor.huntLock;
        cor.huntLock = Math.min(1, cor.huntLock + hRate * dtReal);
        if (before < 0.5 && cor.huntLock >= 0.5) {
          cor.events.push({ kind: 'huntWarn', contact: hunter });
        }
        if (cor.huntLock >= 1) {
          cor.outcome = 'torn';
          cor.tornBy = hunter;
          cor.events.push({ kind: 'torn', contact: hunter });
          return cor;
        }
      } else {
        cor.huntLock = 0;
      }
    } else {
      cor.anchorHolding = false;
      cor.anchorRefusing = false;
      cor.anchorFactor = 1;
      if (cor.huntLock > 0) cor.huntLock = Math.max(0, cor.huntLock - dtReal / LOCK_RELEASE);
      if (cor.huntLock <= 0) cor.huntedBy = null;
    }

    if (cor.progress >= 1) {
      cor.progress = 1;
      cor.outcome = 'arrived';
      cor.events.push({ kind: 'arrived' });
    }
    return cor;
  }

  /* How much sim time has actually elapsed inside the corridor so far. The
   * epoch clock reads from this, so the days still tick visibly past — which
   * was always the point of making a jump cost time. */
  function corridorClock(cor) {
    return cor.departT + cor.progress * cor.crossSeconds;
  }

  /* Contacts worth drawing on the board: near enough to see, sorted by how
   * close they are. */
  function corridorBoard(cor) {
    var out = [];
    for (var i = 0; i < cor.contacts.length; i++) {
      var c = cor.contacts[i];
      var r = contactRange(cor, c);
      if (Math.abs(r) > CONTACT_SCAN_LY) continue;
      out.push({
        contact: c, range: r,
        inLockRange: Math.abs(r) <= LOCK_RANGE_LY,
        closing: (corridorRate(cor.distanceLy, cor.tonnes, cor.throttle) - c.rate) *
                 (r > 0 ? 1 : -1) > 0,
        holdable: c.sameWay && canHold(cor.tonnes, c.tonnes, c.anchor),
        tearCost: tearCost(c.tonnes)
      });
    }
    out.sort(function (a, b) { return Math.abs(a.range) - Math.abs(b.range); });
    return out;
  }

  /* ---- being torn out ----------------------------------------------------
   * Where you land, and the promise that you can always leave again.
   *
   * The interstellar position is the honest one: a fraction of the way along
   * the line between two stars. The nearer of the two is the one you will
   * limp to, and the reserve guarantee is written in terms of THAT distance
   * — enough fuel to make the jump, plus six percent, because a reserve that
   * is exactly enough is not a reserve. */
  var RESERVE_MARGIN = 1.06;

  function dropPoint(fromStar, toStar, progress) {
    var p = Math.max(0, Math.min(1, progress));
    return {
      x: fromStar.x + (toStar.x - fromStar.x) * p,
      y: fromStar.y + (toStar.y - fromStar.y) * p,
      z: fromStar.z + (toStar.z - fromStar.z) * p,
      progress: p,
      from: fromStar,
      to: toStar,
      nearer: p < 0.5 ? fromStar : toStar,
      nearerLy: Math.min(p, 1 - p) * dist3(fromStar, toStar)
    };
  }

  /* Top a ship's jump tank up to the minimum that reaches the nearer star.
   * Returns how much was granted, so the game can SAY so — a reserve that
   * silently appears is indistinguishable from a bug, and a player who
   * thinks the fuel gauge lies will stop trusting every other instrument. */
  function grantReserve(ship, drop, fuelPerLyPerTonne) {
    var k = fuelPerLyPerTonne || 0.016;
    var need = drop.nearerLy * k * allUpMass(ship) * RESERVE_MARGIN;
    if (ship.fuel >= need) return 0;
    var granted = need - ship.fuel;
    ship.fuel = Math.min(ship.fuelCap !== undefined ? ship.fuelCap : need, need);
    return granted;
  }

  var Slipspace = {
    HULL_CLASSES: HULL_CLASSES,
    hullClassFor: hullClassFor,
    hullClassById: hullClassById,
    allUpMass: allUpMass,

    BASE_HOURS_PER_LY: BASE_HOURS_PER_LY,
    HOURS_PER_LY_PER_100T: HOURS_PER_LY_PER_100T,
    MAX_HOURS_PER_LY: MAX_HOURS_PER_LY,
    hoursPerLy: hoursPerLy,
    transitSeconds: transitSeconds,

    MODULES: MODULES,
    modulePrice: modulePrice,
    fittedClass: fittedClass,
    moduleEffective: moduleEffective,

    LOCK_SECONDS: LOCK_SECONDS,
    LOCK_RELEASE: LOCK_RELEASE,
    ANCHOR_BLEED: ANCHOR_BLEED,
    TEAR_MASS_PER_100T: TEAR_MASS_PER_100T,
    pullOf: pullOf,
    resistOf: resistOf,
    lockRate: lockRate,
    canHold: canHold,
    lockTime: lockTime,
    tearCost: tearCost,

    THROTTLE_BAND: THROTTLE_BAND,
    THROTTLE_UP: THROTTLE_UP,
    THROTTLE_DOWN: THROTTLE_DOWN,
    BOOST_MASS_PER_HOUR: BOOST_MASS_PER_HOUR,
    throttleScale: throttleScale,
    corridorRate: corridorRate,
    corridorBurn: corridorBurn,

    HOURS_PER_REAL_SECOND: HOURS_PER_REAL_SECOND,
    SIM_PER_REAL: SIM_PER_REAL,
    IDLE_COMPRESS: IDLE_COMPRESS,
    ENGAGE_LY: ENGAGE_LY,
    LOCK_RANGE_LY: LOCK_RANGE_LY,
    CONTACT_SCAN_LY: CONTACT_SCAN_LY,
    HUNT_FLOOR_VALUE: HUNT_FLOOR_VALUE,
    corridorTraffic: corridorTraffic,
    corridorHunter: corridorHunter,
    openCorridor: openCorridor,
    advanceCorridor: advanceCorridor,
    contactRange: contactRange,
    corridorClock: corridorClock,
    corridorBoard: corridorBoard,

    LANE_NEIGHBOURS: LANE_NEIGHBOURS,
    LANE_MAX_LY: LANE_MAX_LY,
    LANE_CLASSES: LANE_CLASSES,
    laneId: laneId,
    lanesFrom: lanesFrom,
    runState: runState,
    runsAt: runsAt,
    bearing: bearing,

    WAKE_LIFE: WAKE_LIFE,
    WAKE_SCAN_RANGE: WAKE_SCAN_RANGE,
    wakesAt: wakesAt,
    jumpRingRadius: jumpRingRadius,
    wakePosition: wakePosition,
    scanFidelity: scanFidelity,
    scanWake: scanWake,

    pursuit: pursuit,
    RESERVE_MARGIN: RESERVE_MARGIN,
    dropPoint: dropPoint,
    grantReserve: grantReserve
  };

  global.Slipspace = Slipspace;
  if (typeof module !== 'undefined' && module.exports) module.exports = Slipspace;
})(typeof window !== 'undefined' ? window : globalThis);
