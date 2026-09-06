/* galaxy.js — everywhere else.
 *
 * The whole reason this file is short is the decision made on day one: a
 * star system is a PURE FUNCTION OF ITS SEED. So a galaxy does not need to
 * store systems, or generate them ahead of time, or persist them between
 * sessions. It needs to store a name and a position for each star, and the
 * seed that will unfold into the rest whenever somebody actually goes
 * there. A hundred and fifty systems cost about four kilobytes and no
 * computation until you visit them, and the system you leave is bit-for-bit
 * the system you come back to a century later.
 *
 * The home star deliberately carries the game's own seed unchanged, so
 * index.html#kawartha still drops you into exactly the system it always
 * did — the galaxy grew around it rather than replacing it.
 *
 * SLIPSPACE, such as it is: a jump costs propellant out of the same tank
 * the manoeuvring drive uses, scaled by how much ship you are moving, and
 * it costs TIME. That second part is the interesting one. Because the
 * market is already a closed-form function of t, arriving three days later
 * means arriving to prices that have moved, freighters that have completed
 * runs, and the shortage you were flying toward possibly already relieved
 * by somebody closer. Nothing had to be added to the economy to make that
 * true; it falls out of having built it as a function of time.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG || require('./rng.js');
  var Gen = global.Gen || require('./generate.js');
  var Slip = global.Slipspace || require('./slipspace.js');

  var LY = 1;                    // the galaxy works in light years throughout
  var DEFAULT_STARS = 150;
  var CLUSTER_RADIUS = 42;       // ly
  var CLUSTER_THICKNESS = 7;     // ly, half-height — a squashed disc, not a ball
  var MIN_SEPARATION = 1.1;      // ly; two stars closer than this are one star

  /* Jump economics.
   *
   * Propellant scales with distance AND with the mass being moved, which is
   * the point: the hold that slows your manoeuvring also shortens your
   * reach, so "can I afford this cargo" and "can I get there" are the same
   * question rather than two unrelated ones. A linear model rather than a
   * rocket equation, and unapologetically so — this is the one piece of
   * contrived technology in a game that is otherwise honest about physics,
   * and pretending to derive it would be worse than admitting it. */
  var FUEL_PER_LY_PER_TONNE = 0.016;   // tonnes of hydrogen
  var HOURS_PER_LY = 7;

  var STAR_PREFIX = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta',
                     'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi'];

  function build(rootSeed, opts) {
    opts = opts || {};
    var count = opts.count || DEFAULT_STARS;
    var radius = opts.radius || CLUSTER_RADIUS;
    var rng = new RNG('galaxy|' + rootSeed);

    var stars = [];
    var attempts = 0;

    /* The home star sits at the origin and keeps the game's own seed, so
     * the system you have been flying around is star zero of the cluster
     * rather than something new bolted on beside it. */
    stars.push(makeStar('s0', rootSeed, 0, 0, 0));

    while (stars.length < count && attempts < count * 60) {
      attempts++;
      /* Density falls off toward the edge — sqrt gives a uniform disc, and
       * raising the exponent crowds the middle, which is what makes a map
       * read as a cluster with an interior rather than a scatter plot. */
      var r = radius * Math.pow(rng.next(), 0.62);
      var th = rng.angle();
      var z = rng.gauss(0, CLUSTER_THICKNESS * 0.45);
      if (Math.abs(z) > CLUSTER_THICKNESS) z = rng.range(-CLUSTER_THICKNESS, CLUSTER_THICKNESS);
      var x = r * Math.cos(th), y = r * Math.sin(th);

      var tooClose = false;
      for (var i = 0; i < stars.length; i++) {
        if (distance3(stars[i], { x: x, y: y, z: z }) < MIN_SEPARATION) { tooClose = true; break; }
      }
      if (tooClose) continue;

      var id = 's' + stars.length;
      stars.push(makeStar(id, rootSeed + ':' + id, x, y, z));
    }

    /* Display names. The preview draws from the same 'star' substream the
     * full generator uses, so the name on the map is the name on the HUD
     * when you get there — they cannot drift apart, because there is only
     * one implementation. A Greek prefix disambiguates the handful of
     * collisions a twenty-syllable name generator inevitably produces. */
    var seen = {};
    for (var s = 0; s < stars.length; s++) {
      var pre = Gen.starPreview(stars[s].seed);
      stars[s].name = pre.name;
      stars[s].cls = pre.cls;
      stars[s].color = pre.color;
      stars[s].luminosity = pre.luminosity;
      stars[s].temp = pre.temp;
      if (seen[pre.name] !== undefined) {
        stars[s].name = STAR_PREFIX[seen[pre.name] % STAR_PREFIX.length] + ' ' + pre.name;
        seen[pre.name]++;
      } else {
        seen[pre.name] = 1;
      }
    }

    /* Territory. Its own named substream, keyed off rootSeed directly (not
     * forked from `rng` above) so adding it never consumes a draw that star
     * placement or naming was relying on — additive, not a rewrite, same
     * discipline as ports and underground bays. */
    var factions = assignFactions(rootSeed, stars);

    var galaxy = {
      seed: rootSeed, stars: stars, radius: radius,
      byId: {}, home: stars[0], factions: factions, factionById: {}
    };
    for (var k = 0; k < stars.length; k++) galaxy.byId[stars[k].id] = stars[k];
    for (var fi = 0; fi < factions.length; fi++) galaxy.factionById[factions[fi].id] = factions[fi];
    return galaxy;
  }

  function makeStar(id, seed, x, y, z) {
    return { id: id, seed: seed, x: x, y: y, z: z, name: '', cls: '', color: '#ffffff', factionId: null };
  }

  function distance3(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /* --- territory ----------------------------------------------------------
   * Up to three factions actually hold ground; more may come later, but the
   * player asked for three and a fourth is easy to add (just raise the
   * count roll — nothing else here assumes exactly three).
   *
   * Ownership is a Voronoi split on capitals: whichever faction's capital a
   * star is nearest to, owns it. No border ever needs to be stored — it
   * falls out of a distance comparison every time anyone asks, so the same
   * seed always draws the same map and a query against any star is O(1)
   * against the capital list, not a lookup into some stored partition.
   *
   * Capitals are placed by farthest-point sampling (each new capital is the
   * star that maximises its distance to every capital already placed) so
   * three factions read as three separate REGIONS on the map rather than a
   * coin-flip scatter that happens to average out. */
  function assignFactions(rootSeed, stars) {
    var fr = new RNG('galaxy-factions|' + rootSeed);
    var count = fr.int(2, 3);   // "up to 3" per the brief

    var capitals = [stars[fr.int(0, stars.length - 1)]];
    while (capitals.length < count) {
      var best = null, bestD = -1;
      for (var i = 0; i < stars.length; i++) {
        var d = Infinity;
        for (var c = 0; c < capitals.length; c++) {
          d = Math.min(d, distance3(stars[i], capitals[c]));
        }
        if (d > bestD) { bestD = d; best = stars[i]; }
      }
      capitals.push(best);
    }

    var factions = [];
    for (var f = 0; f < count; f++) {
      factions.push({
        id: 'gf' + f,
        name: Gen.makeName(fr) + ' ' + fr.pick(Gen.FACTION_STEM),
        color: Gen.FACTION_COLORS[f % Gen.FACTION_COLORS.length],
        capitalId: capitals[f].id,
        outlaw: false,
        /* Which authored mission chain this faction runs — arcs.js reads
         * this to pick a shape, a pure function of the galaxy seed like
         * everything else about the faction. Its own substream, so adding
         * it never perturbs the name/color/capital rolls above. */
        arcSeed: 'galaxy-arc|' + rootSeed + '|gf' + f
      });
    }

    for (var s2 = 0; s2 < stars.length; s2++) {
      var owner = factions[0], ownerD = distance3(stars[s2], capitals[0]);
      for (var f2 = 1; f2 < factions.length; f2++) {
        var d2 = distance3(stars[s2], capitals[f2]);
        if (d2 < ownerD) { ownerD = d2; owner = factions[f2]; }
      }
      stars[s2].factionId = owner.id;
    }

    return factions;
  }

  /* ---- jumps ----------------------------------------------------------- */

  function shipAllUpMass(ship) {
    var cargo = 0;
    for (var k in ship.cargo) cargo += ship.cargo[k];
    return ship.dryMass + ship.fuel + (ship.thrusterFuel || 0) + cargo;
  }

  function jumpFuel(ship, lightYears) {
    return lightYears * FUEL_PER_LY_PER_TONNE * shipAllUpMass(ship);
  }

  /* Transit time used to be flat: seven hours per light year, whoever you
   * were and whatever you were carrying. It is now a function of all-up mass
   * (see slipspace.js), which is what makes it possible to catch anybody —
   * you cannot overhaul a freighter if the corridor moves everyone at the
   * same speed.
   *
   * The calibration is chosen so a FULLY LADEN reference hull still takes
   * 6.97 h/ly. Every jump the game has ever made is the jump it always was;
   * what is new is that unloading buys you time as well as acceleration.
   *
   * The ship argument is optional and the flat rate is the fallback, so old
   * callers (and the existing galaxy tests, which quote a bare distance to
   * age a market) keep answering exactly what they answered before. */
  function jumpSeconds(lightYears, ship) {
    if (!ship) return lightYears * HOURS_PER_LY * 3600;
    return Slip.transitSeconds(lightYears, Slip.allUpMass(ship));
  }

  /* How far could this ship jump right now? Note that spending fuel makes
   * the ship lighter, so the true reachable distance is slightly further
   * than a fixed-mass reading suggests; we quote the conservative number,
   * because a range readout that promises more than it delivers is the one
   * kind of lie a navigation instrument must never tell. */
  function maxRange(ship) {
    var m = shipAllUpMass(ship);
    if (m <= 0) return 0;
    return ship.fuel / (FUEL_PER_LY_PER_TONNE * m);
  }

  function reachable(galaxy, fromStar, ship) {
    var range = maxRange(ship);
    var out = [];
    for (var i = 0; i < galaxy.stars.length; i++) {
      var s = galaxy.stars[i];
      if (s === fromStar) continue;
      var d = distance3(fromStar, s);
      if (d <= range) out.push({ star: s, distance: d });
    }
    out.sort(function (a, b) { return a.distance - b.distance; });
    return out;
  }

  /* Everything the map needs to say about one candidate destination. */
  function jumpPlan(galaxy, fromStar, toStar, ship) {
    var d = distance3(fromStar, toStar);
    var fuel = jumpFuel(ship, d);
    return {
      from: fromStar, to: toStar, distance: d,
      fuel: fuel, seconds: jumpSeconds(d, ship),
      /* What the corridor will move you at, so the chart can say it plainly.
       * A pilot deciding whether to drop cargo before a chase needs the
       * hours-per-light-year figure, not just the total. */
      hoursPerLy: Slip.hoursPerLy(Slip.allUpMass(ship)),
      hullClass: Slip.hullClassFor(Slip.allUpMass(ship)).id,
      possible: fuel <= ship.fuel && toStar !== fromStar,
      shortfall: Math.max(0, fuel - ship.fuel)
    };
  }

  var Galaxy = {
    LY: LY,
    DEFAULT_STARS: DEFAULT_STARS,
    CLUSTER_RADIUS: CLUSTER_RADIUS,
    FUEL_PER_LY_PER_TONNE: FUEL_PER_LY_PER_TONNE,
    HOURS_PER_LY: HOURS_PER_LY,
    build: build,
    distance3: distance3,
    jumpFuel: jumpFuel,
    jumpSeconds: jumpSeconds,
    maxRange: maxRange,
    reachable: reachable,
    jumpPlan: jumpPlan
  };

  global.Galaxy = Galaxy;
  if (typeof module !== 'undefined' && module.exports) module.exports = Galaxy;
})(typeof window !== 'undefined' ? window : globalThis);
