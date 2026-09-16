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
  /* A THIRD BIGGER, AND THE RADIUS GOES WITH IT.
   *
   * Astra's rule for this project: when something is too small, add a third
   * and that is usually the right call. It was, and the reason it worked is
   * that it was applied to TWO numbers at once — this and the fuel tanks.
   *
   * The count and the radius move together so the density does not: 150/42
   * and 200/48.5 are both 0.027 stars per square light year, which is what
   * keeps a jump the same length of hop it always was. Growing the count
   * alone would have packed the cluster; growing the radius alone would
   * have stranded everyone.
   *
   * WHAT IT ACTUALLY BOUGHT, measured on seed kawartha: the longest hop
   * anyone can be FORCED to make — the loneliest star's distance to its
   * nearest neighbour, which is the number that decides whether a system is
   * reachable at all — falls from 11.85 ly to 9.00. More stars in a bigger
   * disc is not a longer walk; it is a shorter one, because the gaps fill
   * in faster than the edge moves out. A laden Mule could not reach ten
   * stars before this and can reach all of them after it. The span does
   * grow, 83 ly to 110, so crossing the whole cluster is a longer trip —
   * that part is the point. */
  var DEFAULT_STARS = 200;
  var CLUSTER_RADIUS = 48.5;     // ly
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
    /* Its own substream again, run last and reading only what is already
     * decided, so adding restricted space moved no star and changed no
     * flag in any seed that predates it. */
    assignRestricted(rootSeed, stars, factions);

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

    /* A BALANCED Voronoi, not a plain one.
     *
     * The premise is that the majors split the galaxy roughly evenly —
     * they are peers, each with a navy. A plain nearest-capital split does
     * not deliver that and never did: farthest-point sampling puts the
     * capitals as far apart as possible, which says nothing about how many
     * stars end up nearer to each. Measured on seed `kawartha` the three
     * cells came out 67 / 30 / 11 stars — one power holding six times what
     * another did, which is not three peers, it is an empire and two
     * neighbours.
     *
     * So capacity is capped at an even share and the assignment is greedy
     * on distance: every (star, capital) pair is sorted nearest-first and
     * taken in that order, skipping any capital that is already full. A
     * star only loses its first choice when that faction is out of room,
     * and it then goes to its next-nearest rather than anywhere — so the
     * cells stay contiguous regions with slightly negotiated borders,
     * which is what a border between peers looks like.
     *
     * Capitals are pinned to their own faction first: a capital in
     * somebody else's territory would be absurd, and greedy assignment
     * alone does not guarantee otherwise. */
    var cap = Math.ceil(stars.length / factions.length);
    var counts = {}, s2, f2;
    for (f2 = 0; f2 < factions.length; f2++) counts[factions[f2].id] = 0;
    for (s2 = 0; s2 < stars.length; s2++) stars[s2].factionId = null;
    for (f2 = 0; f2 < factions.length; f2++) {
      capitals[f2].factionId = factions[f2].id;
      counts[factions[f2].id]++;
    }

    var pairs = [];
    for (s2 = 0; s2 < stars.length; s2++) {
      if (stars[s2].factionId) continue;
      for (f2 = 0; f2 < factions.length; f2++) {
        pairs.push({ s: s2, f: f2, d: distance3(stars[s2], capitals[f2]) });
      }
    }
    pairs.sort(function (a, b) { return a.d - b.d; });
    for (var pi = 0; pi < pairs.length; pi++) {
      var pr2 = pairs[pi];
      if (stars[pr2.s].factionId) continue;
      var fid = factions[pr2.f].id;
      if (counts[fid] >= cap) continue;
      stars[pr2.s].factionId = fid;
      counts[fid]++;
    }
    /* Anything the caps shut out — possible only on the last star or two —
     * falls back to plain nearest. */
    for (s2 = 0; s2 < stars.length; s2++) {
      if (stars[s2].factionId) continue;
      var owner = factions[0], ownerD = distance3(stars[s2], capitals[0]);
      for (f2 = 1; f2 < factions.length; f2++) {
        var d2 = distance3(stars[s2], capitals[f2]);
        if (d2 < ownerD) { ownerD = d2; owner = factions[f2]; }
      }
      stars[s2].factionId = owner.id;
    }

    /* The majors are done and their draws are untouched above this line.
     * Everything that follows claims ground BACK off them, out of its own
     * stream, so a galaxy generated before pockets existed still lays its
     * three capitals in exactly the same places. */
    return factions.concat(assignPockets(rootSeed, stars, capitals));
  }

  /* --- the powers that are not majors -------------------------------------
   * Two things live here, and they are the same mechanism with different
   * numbers: a PIRATE hold and a MINOR power are both a pocket of stars
   * claimed off a major's Voronoi cell.
   *
   * The majors split the galaxy roughly evenly because they are the ones
   * with navies. What that model was missing is that an even split of a
   * cluster 84 light years across leaves an enormous amount of ground
   * nobody is actually standing on. Pirates hold some of it, and so do the
   * smaller polities that never grew a capital worth the name.
   *
   * WHY POCKETS AND NOT A CRIME ROLL. The obvious construction is to
   * generate every system, look at its crimeScore, and call the lawless
   * ones pirate space. Two things are wrong with it. It costs 150 full
   * system generations to draw the map, which is exactly the cost galaxy.js
   * exists to avoid — a star is a name, a position and a seed until someone
   * flies there. And crime is rolled per system independently, so the
   * result is SCATTER: a lawless system next door to a technocracy next
   * door to another lawless one, which reads as noise rather than as
   * territory. The same objection the capitals' farthest-point sampling
   * already answers for the majors.
   *
   * So the causality runs the other way, which is also the better story:
   * the pirates hold this pocket, THEREFORE it is lawless. generate.js
   * reads the ownership and biases the government roll toward anarchy,
   * rather than the ownership being read off a government that was rolled
   * blind. One decision, made where territory is decided.
   *
   * Seeds are drawn from the stars FARTHEST from any capital — a syndicate
   * sets up where the nearest fleet is three weeks away — and spread apart
   * from each other by the same farthest-point sampling the capitals use,
   * so three holds are three regions and not one lumpy one. Each hold then
   * claims its nearest unclaimed neighbours, which is what makes a pocket
   * contiguous. */
  var PIRATE_HOLDS = 3;
  var PIRATE_SHARE = 0.17;    // of all stars — measured, see below
  var MINOR_POWERS = 3;
  var MINOR_SHARE  = 0.10;

  function assignPockets(rootSeed, stars, capitals) {
    var pr = new RNG('galaxy-powers|' + rootSeed);
    var i, j;

    /* Distance to the nearest major capital, which is the one number both
     * kinds of pocket are chosen by. */
    var dcap = [];
    for (i = 0; i < stars.length; i++) {
      var d = Infinity;
      for (j = 0; j < capitals.length; j++) d = Math.min(d, distance3(stars[i], capitals[j]));
      dcap.push(d);
    }
    var capitalIds = {};
    for (j = 0; j < capitals.length; j++) capitalIds[capitals[j].id] = true;

    var claimed = {};                       // starId -> owning pocket faction id
    for (j = 0; j < capitals.length; j++) claimed[capitals[j].id] = 'capital';

    /* Stars ranked by how far out they are, so a band can be taken off
     * either end without sorting twice. */
    var byRemote = stars.map(function (st, k) { return { st: st, d: dcap[k] }; })
                        .sort(function (a, b) { return b.d - a.d; });

    function seedPocket(pool, seeds, count) {
      /* Farthest-point sampling among the candidates, first one drawn. */
      if (!pool.length) return;
      seeds.push(pool[pr.int(0, pool.length - 1)]);
      while (seeds.length < count && seeds.length < pool.length) {
        var best = null, bestD = -1;
        for (var a = 0; a < pool.length; a++) {
          if (seeds.indexOf(pool[a]) >= 0) continue;
          var near = Infinity;
          for (var b = 0; b < seeds.length; b++) {
            near = Math.min(near, distance3(pool[a], seeds[b]));
          }
          if (near > bestD) { bestD = near; best = pool[a]; }
        }
        if (!best) break;
        seeds.push(best);
      }
    }

    /* Claim the nearest unclaimed stars to a seed, seed included. This is
     * what makes a hold a REGION: growth is by proximity, so a pocket is
     * always connected and always convex-ish, whatever the local density. */
    function grow(seed, want, id) {
      var order = stars.slice().sort(function (a, b) {
        return distance3(a, seed) - distance3(b, seed);
      });
      var got = 0, from = {};
      for (var k = 0; k < order.length && got < want; k++) {
        if (claimed[order[k].id]) continue;
        /* WHOSE SPACE THIS WAS, and it is free to know. The majors' greedy
         * pass runs first and leaves no star unassigned, so every star a
         * pocket takes is already somebody's, and the previous owner is
         * sitting right here one line before it is overwritten.
         *
         * That answers the question the model could not previously answer:
         * a pocket is not a fourth empire standing beside the three, it is
         * a power operating INSIDE one of them. Tallied rather than read
         * off the seed star alone, because a pocket that straddles a border
         * belongs to whichever side most of it is on. */
        var was = order[k].factionId;
        if (was && was !== id) from[was] = (from[was] || 0) + 1;
        claimed[order[k].id] = id;
        order[k].factionId = id;
        got++;
      }
      var parent = null, bestN = 0;
      for (var f in from) if (from[f] > bestN) { bestN = from[f]; parent = f; }
      return { got: got, parent: parent };
    }

    var powers = [];

    /* --- pirates: one faction, several holds ----------------------------
     * ONE syndicate, not three gangs. They are described as closer to a
     * mafia than to a mob — they keep bases, they run territory, and they
     * trade with the factions whose law they are outside of. That is a
     * single organisation with several strongholds, so all three pockets
     * fly the same flag and a standing you burn in one is burnt in all.
     *
     * The id stays the literal string 'outlaw' that generate.js has
     * reserved for pirates since before any of this existed, so every
     * `faction === 'outlaw'` test in combat, traffic and the HUD keeps
     * working and simply starts resolving to a named power. */
    var remoteThird = byRemote.slice(0, Math.max(PIRATE_HOLDS, Math.floor(stars.length / 3)))
                              .map(function (r) { return r.st; })
                              .filter(function (st) { return !capitalIds[st.id]; });
    var pirateSeeds = [];
    seedPocket(remoteThird, pirateSeeds, PIRATE_HOLDS);
    var pirate = {
      id: 'outlaw',
      name: Gen.makeName(pr) + ' ' + pr.pick(Gen.PIRATE_STEM),
      color: '#ff7a6b',
      outlaw: true,
      /* Pirates ban radioactive waste in their own space and dump it in
       * everyone else's. The flag is here rather than inferred from
       * `outlaw` so that a minor power could adopt the same policy later
       * without having to become a criminal to do it. */
      wasteBan: true,
      holdIds: pirateSeeds.map(function (st) { return st.id; })
    };
    var pirateWant = Math.round(stars.length * PIRATE_SHARE);
    /* One parent per HOLD, aligned with holdIds, plus the dominant one on
     * the faction itself. A syndicate with three strongholds may well be
     * embedded in more than one empire at once, and which empire a given
     * hold sits inside is the interesting question — it decides whose law
     * is nominally being flouted there and whose officials are the ones
     * being bought. */
    var holdTally = {};
    pirate.holdParents = [];
    for (i = 0; i < pirateSeeds.length; i++) {
      var pgrew = grow(pirateSeeds[i], Math.ceil(pirateWant / pirateSeeds.length), 'outlaw');
      pirate.holdParents.push(pgrew.parent);
      if (pgrew.parent) holdTally[pgrew.parent] = (holdTally[pgrew.parent] || 0) + pgrew.got;
    }
    pirate.parentId = null;
    var bestHold = 0;
    for (var hp in holdTally) {
      if (holdTally[hp] > bestHold) { bestHold = holdTally[hp]; pirate.parentId = hp; }
    }
    if (pirateSeeds.length) powers.push(pirate);

    /* --- minor powers ---------------------------------------------------
     * Small polities with a flag and no fleet. They sit in the middle
     * band — not the core, where a major would simply have absorbed them,
     * and not the deep frontier, which is where the pirates already are.
     * They are ordinary factions in every respect the rest of the game
     * cares about; `minor` is a display fact, not a rule. */
    var lo = Math.floor(stars.length * 0.30), hi = Math.floor(stars.length * 0.85);
    var midBand = byRemote.slice(lo, hi).map(function (r) { return r.st; })
                          .filter(function (st) { return !claimed[st.id]; });
    var minorSeeds = [];
    seedPocket(midBand, minorSeeds, MINOR_POWERS);
    var minorWant = Math.round(stars.length * MINOR_SHARE);
    for (i = 0; i < minorSeeds.length; i++) {
      var mf = {
        id: 'gm' + i,
        name: Gen.makeName(pr) + ' ' + pr.pick(Gen.MINOR_STEM),
        color: Gen.FACTION_COLORS[(capitals.length + i) % Gen.FACTION_COLORS.length],
        capitalId: minorSeeds[i].id,
        outlaw: false,
        minor: true,
        wasteBan: false,
        arcSeed: 'galaxy-arc|' + rootSeed + '|gm' + i
      };
      var mgrew = grow(minorSeeds[i], Math.ceil(minorWant / minorSeeds.length), mf.id);
      if (mgrew.got > 0) {
        /* The empire this broker operates inside. A local manager holds
         * their systems for somebody, and this is who. */
        mf.parentId = mgrew.parent;
        powers.push(mf);
      }
    }

    return powers;
  }

  /* Does this star's owner ban radioactive waste? Asked by the jump
   * planner before you commit, by the star chart so it can mark the
   * system, and by the arrival check that levies the fine. One function so
   * the warning and the penalty can never disagree about where the line
   * is. */
  function wasteBanned(galaxy, star) {
    if (!galaxy || !star) return false;
    var f = galaxy.factionById[star.factionId];
    return !!(f && f.wasteBan);
  }

  /* ---- the systems you are not allowed into ------------------------------
   * Astra: "There should be restricted systems which are only able to be
   * visited by ships which are carrying a special transponder. Penal
   * colonies and manufacturing hubs for warships would qualify."
   *
   * Both kinds are the same rule and deliberately different places, because
   * what a power puts behind a checkpoint says what it is worried about:
   *
   *   A PENAL COLONY goes as far from its capital as the flag reaches. You
   *   do not build a prison in the middle of your own core, and the whole
   *   point of one is that getting out of it is a journey.
   *
   *   A WARSHIP YARD goes as deep INSIDE as the flag reaches. It is the
   *   thing a power least wants reached, so it sits behind everything else
   *   it has, in the system it holds hardest.
   *
   * One of each per major power, which keeps them rare — a handful of
   * systems in two hundred — and keeps them meaningful: every restricted
   * system belongs to somebody, so being turned away from one tells you
   * whose door you were at.
   *
   * No capital is ever restricted. A power's own seat has to be somewhere
   * a trader can go, or the flag means nothing to anyone who is not
   * already inside it.
   *
   * Pockets are skipped entirely. A syndicate hold is not restricted space,
   * it is lawless space — those are opposite problems and the game already
   * has the second one. */
  var HOME_CLEAR_LY = 14;          // no checkpoints in the first few hops

  function assignRestricted(rootSeed, stars, factions) {
    var rr = new RNG('galaxy-restricted|' + rootSeed);
    var byFac = {};
    var i;
    for (i = 0; i < stars.length; i++) {
      stars[i].restricted = null;
      var fid = stars[i].factionId;
      if (!fid) continue;
      (byFac[fid] = byFac[fid] || []).push(stars[i]);
    }

    for (var f = 0; f < factions.length; f++) {
      var fac = factions[f];
      if (fac.outlaw || fac.minor) continue;
      var owned = byFac[fac.id] || [];
      if (owned.length < 4) continue;                 // too small to hide anything in
      var capital = null;
      for (i = 0; i < stars.length; i++) if (stars[i].id === fac.capitalId) capital = stars[i];
      if (!capital) continue;

      /* AND NEVER ON THE DOORSTEP. The first galaxy built with this had
       * kawartha's nearest neighbour - 4 ly out, the obvious first jump of
       * a brand-new career - turned into a penal colony, so the opening
       * move of the game was a door that will not open and a fitting you
       * cannot afford. Rare and remote is the whole idea; rare and in the
       * way is a wall across the tutorial. */
      var ranked = owned.filter(function (st) {
        return st.id !== fac.capitalId &&
               distance3(st, stars[0]) > HOME_CLEAR_LY;
      }).sort(function (a, b) {
        return distance3(b, capital) - distance3(a, capital);
      });
      if (!ranked.length) continue;

      /* The furthest few, and the nearest few, drawn from rather than taken
       * flat — so two galaxies from different seeds do not put the prison
       * on the same rung of the same ladder every time. */
      var band = Math.max(1, Math.min(3, Math.floor(ranked.length / 6)));
      var penal = ranked[rr.int(0, band - 1)];
      penal.restricted = { kind: 'penal', label: 'Penal colony', faction: fac.id };

      var inner = ranked.slice(ranked.length - band);
      var yard = inner[rr.int(0, inner.length - 1)];
      if (yard && yard !== penal) {
        yard.restricted = { kind: 'yard', label: 'Warship yard', faction: fac.id };
      }
    }
  }

  /* Is this star behind a checkpoint, and does this ship answer it? Two
   * questions, one function, because the chart asks the first to draw the
   * marker and the jump planner asks the second to refuse the course — and
   * a version of each in two files is a bar that says one thing and does
   * another. */
  function restrictionOf(star) {
    return (star && star.restricted) || null;
  }

  function barredFrom(star, ship) {
    if (!restrictionOf(star)) return false;
    var C = global.Combat;
    /* AND WHETHER THE PAPERWORK PASSES HERE, which is not the same question
     * as whether you are carrying any. A forged transponder answers the
     * challenge at most stars and not at all of them, and which is which is
     * a fact about the star rather than a roll — so this can be asked by
     * the chart before you commit and by the jump planner at the moment you
     * do, and the two cannot disagree. */
    if (C && C.transponderPasses) return !C.transponderPasses(ship, star);
    return !(C && C.hasTransponder && C.hasTransponder(ship));
  }

  /* ---- how firmly a power holds a star ----------------------------------
   * Astra, of the chart: "The color should be more saturated the more
   * control that faction has in each system."
   *
   * Control is not stored anywhere, because it is not a decision anybody
   * made — it is a reading of the assignment that already happened, and
   * deriving it keeps it honest: a border that moves moves the shading with
   * it. Two terms, both of which already exist implicitly in the greedy
   * Voronoi above:
   *
   *   REACH   how deep inside this power's own sprawl the star sits,
   *           measured against that power's mean distance from its own
   *           capital rather than against a fixed number of light years. A
   *           tight three-system pocket is therefore fully in control of
   *           its three systems, and a sprawling major is thin at its edge.
   *
   *   MARGIN  how much nearer this capital is than the next power's. Two
   *           capitals equidistant is the definition of a contested star,
   *           and it is exactly the case where the greedy pass had to make
   *           a choice it could have made the other way.
   *
   * A hold is its own case and deliberately reads high: nobody is
   * contesting a pirate hold from a capital, and the thing that makes it
   * dangerous is precisely that the Syndicate's writ runs unopposed there.
   *
   * Cached on the star. The galaxy is immutable once built and this is a
   * pure function of it, so the first frame of the chart pays for it once. */
  function factionSpread(galaxy, fac) {
    if (fac._spread !== undefined) return fac._spread;
    var capital = galaxy.byId[fac.capitalId];
    var owned = galaxy.stars.filter(function (s) { return s.factionId === fac.id; });
    var sum = 0;
    for (var i = 0; i < owned.length; i++) sum += distance3(owned[i], capital);
    fac._spread = owned.length ? Math.max(1, sum / owned.length) : 1;
    return fac._spread;
  }

  function control(galaxy, star) {
    if (!galaxy || !star) return 0;
    if (star._control !== undefined) return star._control;
    var fac = galaxy.factionById[star.factionId];
    if (!fac) { star._control = 0; return 0; }
    var capital = galaxy.byId[fac.capitalId];
    if (!capital) { star._control = 0.5; return 0.5; }

    var d1 = distance3(star, capital);
    var reach = 1 - d1 / (factionSpread(galaxy, fac) * 2);
    if (reach < 0) reach = 0; else if (reach > 1) reach = 1;

    var d2 = Infinity;
    for (var i = 0; i < galaxy.factions.length; i++) {
      var other = galaxy.factions[i];
      if (other.id === fac.id) continue;
      var oc = galaxy.byId[other.capitalId];
      if (!oc) continue;
      var d = distance3(star, oc);
      if (d < d2) d2 = d;
    }
    var margin = (d2 === Infinity) ? 1 : (d2 - d1) / Math.max(1e-6, d2 + d1) * 2.2;
    if (margin < 0) margin = 0; else if (margin > 1) margin = 1;

    var ctl = 0.18 + 0.44 * reach + 0.38 * margin;
    if (fac.outlaw) ctl = Math.max(ctl, 0.78);     // unopposed, which is the problem
    if (star.id === fac.capitalId) ctl = 1;
    star._control = ctl > 1 ? 1 : ctl;
    return star._control;
  }

  /* ---- what you know, and what it costs to find out ----------------------
   * Astra: "The map is meant to pull its faction data when you jump into a
   * new system, so you are building the map yourself with every new system
   * you enter. The data for neighboring systems should be purchaseable from
   * starports and planetside ports as well."
   *
   * So there are two kinds of knowing and they are deliberately different
   * sizes. VISITING a system surveys it — who lives there, what they run,
   * what the ports deal in — and that has always been G.visited. CHARTING
   * one is the smaller fact: whose flag flies over it, which is what the
   * territory on the chart is drawn from. You chart a system by arriving in
   * it, and you can buy the charting of the systems AROUND a port without
   * ever going to them.
   *
   * The radius is in light years around the port's own star rather than a
   * count of systems, because that is the thing a chart seller actually
   * has: the local sheet. The price is per star and rises with the radius
   * asked for, so the far corners of a big purchase cost more than the
   * neighbours do — and stars you already know are free, which means
   * buying the same sheet twice is not possible rather than merely unwise.
   */
  var CHART_RADIUS_LY = 8;
  var CHART_BASE_COST = 85;             // cr per star at the port's own doorstep
  var CHART_PER_LY = 26;                // and this much more per light year out

  function chartOffer(galaxy, here, known, radiusLy) {
    var r = radiusLy || CHART_RADIUS_LY;
    var out = { stars: [], cost: 0, radius: r };
    if (!galaxy || !here) return out;
    for (var i = 0; i < galaxy.stars.length; i++) {
      var s = galaxy.stars[i];
      if (s.id === here.id) continue;
      if (known && known[s.id]) continue;
      var d = distance3(s, here);
      if (d > r) continue;
      out.stars.push(s);
      out.cost += CHART_BASE_COST + CHART_PER_LY * d;
    }
    out.cost = Math.round(out.cost);
    return out;
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
    return Math.max(0, lightYears) *
           Slip.hoursPerLyFor(Slip.allUpMass(ship), ship) * 3600;
  }

  /* How far could this ship jump right now? Note that spending fuel makes
   * the ship lighter, so the true reachable distance is slightly further
   * than a fixed-mass reading suggests; we quote the conservative number,
   * because a range readout that promises more than it delivers is the one
   * kind of lie a navigation instrument must never tell. */
  function maxRange(ship) {
    var m = shipAllUpMass(ship);
    if (m <= 0) return 0;
    /* A ship running hot is limited by the slugs in its hold, not by the
     * hydrogen it is no longer burning. Quoting the tank here would draw a
     * jump circle the drive cannot actually reach. */
    if (Slip.milRunning(ship)) {
      var slugs = (ship.cargo && ship.cargo.milfuel) || 0;
      return slugs / (Slip.MIL_FUEL_PER_LY_PER_TONNE * m);
    }
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
    /* Running a military drive changes what the corridor costs in three
     * ways at once — half the time, slugs instead of hydrogen, and waste
     * bred into the hold — and the plan has to quote all three, because
     * every one of them is something the pilot decides on BEFORE
     * committing. Especially the last: the waste is what the Syndicate
     * fines you for, so "what will I be carrying when I arrive" is part of
     * the plan, not a surprise at the other end. */
    var hot = Slip.milRunning(ship);
    var burn = Slip.militaryBurn(ship, d);
    var slugs = (ship.cargo && ship.cargo.milfuel) || 0;
    var enoughFuel = hot ? burn.fuel <= slugs : fuel <= ship.fuel;
    var banned = wasteBanned(galaxy, toStar);
    /* A CHECKPOINT IS NOT A SHORTFALL, and it is quoted separately for that
     * reason: `shortfall` is a number of tonnes you can go and fetch, and
     * this is a door. Both make `possible` false, and the chart says which
     * one it is rather than telling a pilot with a full tank that they are
     * short by zero. */
    var bar = restrictionOf(toStar);
    var barred = bar && barredFrom(toStar, ship);
    return {
      from: fromStar, to: toStar, distance: d,
      fuel: hot ? 0 : fuel, seconds: jumpSeconds(d, ship),
      /* What the corridor will move you at, so the chart can say it plainly.
       * A pilot deciding whether to drop cargo before a chase needs the
       * hours-per-light-year figure, not just the total. */
      hoursPerLy: Slip.hoursPerLyFor(Slip.allUpMass(ship), ship),
      hullClass: Slip.hullClassFor(Slip.allUpMass(ship)).id,
      military: hot,
      slugs: burn.fuel,
      waste: burn.waste,
      /* Would arriving like this be an offence where you are going? Quoted
       * whether or not you are running hot, because waste already in the
       * hold from a previous leg is the same offence. */
      wasteBan: banned,
      wasteAboard: ((ship.cargo && ship.cargo.waste) || 0) + burn.waste,
      arrivesDirty: banned &&
        (((ship.cargo && ship.cargo.waste) || 0) + burn.waste) > 0,
      /* What is behind the checkpoint, whether or not you can pass it: a
       * pilot who knows a prison is there and cannot get in is in a
       * different position from one who does not know why the course will
       * not lay in. */
      restricted: bar,
      barred: !!barred,
      possible: enoughFuel && !barred && toStar !== fromStar,
      shortfall: hot ? Math.max(0, burn.fuel - slugs)
                     : Math.max(0, fuel - ship.fuel)
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
    jumpPlan: jumpPlan,
    wasteBanned: wasteBanned,
    control: control,
    restrictionOf: restrictionOf,
    barredFrom: barredFrom,
    chartOffer: chartOffer,
    CHART_RADIUS_LY: CHART_RADIUS_LY,
    PIRATE_HOLDS: PIRATE_HOLDS,
    PIRATE_SHARE: PIRATE_SHARE,
    MINOR_POWERS: MINOR_POWERS,
    MINOR_SHARE: MINOR_SHARE
  };

  global.Galaxy = Galaxy;
  if (typeof module !== 'undefined' && module.exports) module.exports = Galaxy;
})(typeof window !== 'undefined' ? window : globalThis);
