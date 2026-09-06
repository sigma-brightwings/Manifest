/* economy.js — what worlds make, what they need, and what it costs.
 *
 * The design problem here is the same one the orbits had: the player can
 * skip a million seconds between two rendered frames, and a market that is
 * a stepped simulation would either have to catch up (slow, and drifting a
 * little further from "true" every jump) or quietly lie.
 *
 * So the market is built the same way the orbits are — as a FUNCTION OF
 * TIME. A port's stock of grain at t is a closed-form expression: its
 * baseline holding, a seasonal wobble, the decaying sawtooth left by every
 * scheduled freighter that has delivered grain there, and whatever the
 * player has personally done to it. Jump a year ahead and the number is
 * exact, not approximated, and it costs a few multiplies to evaluate.
 *
 * On top of that, ports NEAR THE SHIP run a genuine stepped simulation, so
 * the market you are actually standing in reacts continuously rather than
 * snapping between closed-form samples. The two paths are made to agree at
 * the boundary: a port going live is seeded from its analytic value, and a
 * port going dormant folds the difference it accumulated back into the same
 * player-perturbation ledger that trades use. There is exactly one number
 * that carries state across the boundary, and it decays.
 *
 * Prices come from scarcity, not from a table: how full the warehouse is
 * relative to what it can hold, times a structural factor for whether this
 * world is a natural exporter or importer of the thing. That is what makes
 * a trade route findable — a mining world's ore is cheap because it has
 * too much of it, not because a designer typed a low number.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG || require('./rng.js');

  var DAY = 86400;
  var TAU = Math.PI * 2;

  /* ---- the goods -------------------------------------------------------
   * `tier` is roughly industrial sophistication: tier 0 comes out of soil
   * and water, tier 4 comes out of a fab that took a century to build. A
   * world can only make what its development level supports, which is the
   * whole reason trade exists in this game — nobody can make everything.
   *
   * `base` is credits per tonne at a neutral, half-full market. Radioactive
   * waste is the one negative entry: it is a good with negative value, so
   * every price expression involving it comes out backwards, and that is
   * the point rather than a bug. Loading it PAYS you.
   *
   * `bulk` is how many tonnes of hold one "unit" occupies — everything here
   * is priced and carried by the tonne, so bulk stays 1 and exists only so
   * a future low-density cargo (hydrogen, say, or passengers) has somewhere
   * to say so.
   */
  var COMMODITIES = [
    { id: 'water',    name: 'Water',            tier: 0, base: 18,   cat: 'raw' },
    { id: 'grain',    name: 'Grain',            tier: 0, base: 64,   cat: 'agri' },
    { id: 'livestock',name: 'Livestock',        tier: 0, base: 128,  cat: 'agri' },
    { id: 'timber',   name: 'Timber',           tier: 0, base: 44,   cat: 'agri' },
    { id: 'fish',     name: 'Aquaculture',      tier: 0, base: 96,   cat: 'agri' },

    { id: 'ores',     name: 'Metal ores',       tier: 1, base: 82,   cat: 'raw' },
    { id: 'rare',     name: 'Rare metals',      tier: 1, base: 640,  cat: 'raw' },
    { id: 'hydrogen', name: 'Hydrogen fuel',    tier: 1, base: 55,   cat: 'raw', fuel: true },
    { id: 'fissile',  name: 'Fissiles',         tier: 1, base: 980,  cat: 'raw' },

    { id: 'chemicals',name: 'Chemicals',        tier: 2, base: 210,  cat: 'industrial' },
    { id: 'alloys',   name: 'Structural alloys',tier: 2, base: 265,  cat: 'industrial' },
    { id: 'textiles', name: 'Textiles',         tier: 2, base: 190,  cat: 'industrial' },
    { id: 'farmmach', name: 'Farm machinery',   tier: 2, base: 480,  cat: 'industrial' },

    { id: 'computers',name: 'Computers',        tier: 3, base: 1150, cat: 'tech' },
    { id: 'robotics', name: 'Robotics',         tier: 3, base: 1620, cat: 'tech' },
    { id: 'medical',  name: 'Medical supplies', tier: 3, base: 890,  cat: 'tech' },
    { id: 'fusion',   name: 'Fusion cells',     tier: 3, base: 1980, cat: 'tech' },

    { id: 'aicores',  name: 'AI cores',         tier: 4, base: 4200, cat: 'luxury' },
    { id: 'genetech', name: 'Gene therapies',   tier: 4, base: 3600, cat: 'luxury' },
    { id: 'luxuries', name: 'Luxury goods',     tier: 4, base: 2450, cat: 'luxury' },

    /* The interesting one. Negative base value: a built-up world will pay
     * to have this taken away, and somewhere with nothing to lose will take
     * it for a smaller fee. The margin between those two numbers is a real
     * trade, and unlike every other cargo it runs from rich worlds to poor
     * ones — which is exactly why it is worth having in the game. */
    { id: 'waste',    name: 'Radioactive waste',tier: 1, base: -310, cat: 'special',
      waste: true }
  ];

  var BY_ID = {};
  for (var ci = 0; ci < COMMODITIES.length; ci++) BY_ID[COMMODITIES[ci].id] = COMMODITIES[ci];

  /* ---- contraband -------------------------------------------------------
   * Registered the same way missions.js adds the courier parcel: after the
   * fact, into the same BY_ID table, rather than living in COMMODITIES
   * itself. That keeps every existing tier/order calculation untouched and
   * makes these two goods opt-in per port (see addBlackMarketRows) instead
   * of something every market in the game suddenly produces.
   *
   * These are legally manufactured, dual-use goods — nobody needs a permit
   * to run a chemical plant or a foundry — so the illegality lives entirely
   * in carrying them, not in making or selling them. That is what a police
   * SCAN checks for (see combat.js); crime permissivity decides how often
   * one happens and how hard the law comes down when it finds something. */
  var CONTRABAND = [
    { id: 'narcotics', name: 'Narcotics',        tier: 2, base: 980,  cat: 'contraband', contraband: true },
    { id: 'arms',      name: 'Restricted arms',  tier: 2, base: 1450, cat: 'contraband', contraband: true }
  ];
  var contrabandRegistered = false;
  function registerContraband() {
    if (contrabandRegistered) return;
    for (var i = 0; i < CONTRABAND.length; i++) BY_ID[CONTRABAND[i].id] = CONTRABAND[i];
    contrabandRegistered = true;
  }
  registerContraband();

  var FUEL_ID = 'hydrogen';
  var SPREAD = 0.09;            // bid/ask gap, fraction of mid price
  var LEDGER_HALFLIFE = 4 * DAY; // how fast a market forgets what you did

  /* ---- what a world can make ------------------------------------------
   * Keyed off the planet type the port orbits. These are the things the
   * surface (or the local rock) supplies for free; everything else has to
   * be manufactured, and manufacturing is gated on development below. */
  var NATIVE = {
    terran:   ['grain', 'livestock', 'timber', 'water'],
    ocean:    ['fish', 'water', 'grain'],
    desert:   ['rare', 'ores', 'chemicals'],
    tundra:   ['water', 'ores', 'hydrogen'],
    iceball:  ['water', 'hydrogen'],
    rocky:    ['ores', 'alloys'],
    molten:   ['rare', 'fissile'],
    gasGiant: ['hydrogen', 'chemicals'],
    iceGiant: ['hydrogen', 'water'],
    moon:     ['ores', 'water']
  };

  /* Manufacturing unlocked by development level. A world at 0.3 can bend
   * metal; a world at 0.9 can print a mind. */
  var INDUSTRY = [
    { at: 0.30, goods: ['alloys', 'textiles', 'chemicals'] },
    { at: 0.52, goods: ['farmmach', 'medical', 'computers'] },
    { at: 0.70, goods: ['robotics', 'fusion'] },
    { at: 0.85, goods: ['aicores', 'genetech', 'luxuries'] }
  ];

  /* What a settled place burns through regardless of what it makes. */
  var UNIVERSAL_DEMAND = ['water', 'grain'];

  var PORT_ROLES = [
    { id: 'orbital',      name: 'Orbital port',   bias: [] },
    { id: 'highport',     name: 'Highport',       bias: ['luxuries', 'medical', 'computers'] },
    { id: 'refinery',     name: 'Refinery',       bias: ['hydrogen', 'chemicals'] },
    { id: 'shipyard',     name: 'Shipyard',       bias: ['alloys', 'robotics'] },
    { id: 'agri',         name: 'Agricultural co-op', bias: ['grain', 'livestock', 'fish'] },
    { id: 'mining',       name: 'Mining head',    bias: ['ores', 'rare', 'fissile'] },
    { id: 'reprocessing', name: 'Reprocessing plant', bias: [], wasteSink: true }
  ];
  var ROLE_BY_ID = {};
  for (var ri = 0; ri < PORT_ROLES.length; ri++) ROLE_BY_ID[PORT_ROLES[ri].id] = PORT_ROLES[ri];

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

  /* ---- the settlement chain --------------------------------------------
   * Drake's equation, with the biology thrown away.
   *
   * Drake multiplies a chain of fractions to answer "how many civilisations
   * are there". Most of its terms are about life arising, becoming
   * intelligent and learning to broadcast — and this galaxy has no aliens
   * in it. Every settlement is human, so the filter is economic rather than
   * biological and those terms have nothing to attach to.
   *
   * What is worth stealing is the SHAPE: a named chain of factors, each one
   * a thing you could argue about separately, multiplying out to a headline
   * number. Every term below was already being computed somewhere in this
   * file or in generate.js; naming them buys two things — you can see why
   * a galaxy came out the way it did, and there is a single place to turn
   * when it should feel different.
   *
   *     worlds settled  =  systems
   *                     ×  nHab      habitable worlds per system
   *                     ×  fSettled  of those, the fraction anyone claimed
   *                     ×  fGrown    of those, how far past subsistence
   *                     ×  fHub      of those, the fraction that became hubs
   *
   * PRESSURE is the knob, and it is deliberately the only one. 1.0 is the
   * galaxy this game has always generated; below that is a frontier where
   * ports are small and far apart, above it a settled core with real cities
   * and industry on rocks nobody would otherwise bother with.
   *
   * It works by biasing a roll rather than by moving bounds: u^(1/p) pushes
   * a uniform draw toward the top of its range as p rises and toward the
   * bottom as it falls, monotonically, without ever leaving the range the
   * designer chose. At p = 1 the exponent is 1 and the draw is untouched,
   * which is what makes the default byte-identical to the old generator —
   * the same single rng draw, in the same order, producing the same number. */
  var SETTLEMENT = {
    pressure: 1.0,
    MIN: 0.25,
    MAX: 3.0
  };

  function setPressure(p) {
    SETTLEMENT.pressure = clamp(+p || 1, SETTLEMENT.MIN, SETTLEMENT.MAX);
    return SETTLEMENT.pressure;
  }

  /* One draw, biased. Callers must use this instead of rng.range wherever
   * the result is a SETTLEMENT decision, so the knob reaches all of them. */
  function pressured(rng, lo, hi) {
    var u = rng.range(0, 1);
    var p = SETTLEMENT.pressure;
    if (p !== 1) u = Math.pow(u, 1 / p);
    return lo + (hi - lo) * u;
  }

  /* A yes/no settlement decision, biased the same way. A frontier galaxy
   * says no more often. */
  function pressuredChance(rng, base) {
    var u = rng.range(0, 1);
    var p = SETTLEMENT.pressure;
    if (p !== 1) u = Math.pow(u, p);      // note: p, not 1/p — this is a test
    return u < base;                       // against the threshold, not a draw
  }

  /* ---- development -----------------------------------------------------
   * How built-up is the world this port serves? This one number drives
   * almost everything downstream: what can be manufactured, how much gets
   * consumed, how much radioactive waste piles up, and how expensive the
   * luxuries are. Habitable worlds get a real civilisation; everywhere else
   * gets an outpost whose size depends on whether there is anything worth
   * digging up.
   *
   * This is the chain's `fGrown` term. */
  function developmentOf(planet, rng) {
    var d;
    if (planet.habitable) {
      d = pressured(rng, 0.55, 0.97);
    } else if (planet.type === 'gasGiant' || planet.type === 'iceGiant') {
      d = pressured(rng, 0.18, 0.55);     // fuel skimming, some real industry
    } else if (planet.type === 'molten') {
      d = pressured(rng, 0.05, 0.28);     // nobody lives here on purpose
    } else {
      d = pressured(rng, 0.10, 0.62);
    }
    // A world with moons has somewhere to put the dirty industries.
    if (planet.children && planet.children.length > 2) d += 0.04;
    return clamp(d, 0.02, 0.98);
  }

  /* Population is only ever used as a scale factor on flow rates, so it is
   * quoted in arbitrary "millions" and never shown as a hard fact the game
   * would then have to be consistent about. */
  function populationOf(planet, dev) {
    var sizeFactor = clamp(planet.radius / 6371, 0.15, 3.0);
    return Math.max(0.01, dev * dev * 4200 * sizeFactor);
  }

  /* ---- building a port's market ---------------------------------------- */

  /* The chain's `fHub` term: of the worlds that grew, which ones became
   * somewhere that matters. A highport and a shipyard are the two roles
   * that mark a real hub, so they are the two that answer to pressure. */
  function pickRole(port, host, dev, rng) {
    if (host.habitable && dev > 0.75 && pressuredChance(rng, 0.55)) return 'highport';
    if (host.type === 'gasGiant' || host.type === 'iceGiant') {
      return rng.chance(0.7) ? 'refinery' : 'orbital';
    }
    if (host.habitable && dev > 0.5 && pressuredChance(rng, 0.3)) return 'shipyard';
    if (host.habitable && rng.chance(0.35)) return 'agri';
    if (!host.habitable && dev < 0.3) {
      // Somewhere nobody wants to be is exactly where the waste goes.
      return rng.chance(0.45) ? 'reprocessing' : 'mining';
    }
    if (!host.habitable && rng.chance(0.5)) return 'mining';
    return 'orbital';
  }

  /* Everything a single port trades, as flow rates in tonnes per day plus
   * the warehouse capacity that turns those flows into a stock level. */
  function buildPortMarket(port, host, sys, rng) {
    var dev = host.economy ? host.economy.dev : developmentOf(host, rng);
    var pop = host.economy ? host.economy.pop : populationOf(host, dev);
    var roleId = pickRole(port, host, dev, rng);
    var role = ROLE_BY_ID[roleId];

    var rows = {};
    var scale = 0.9 + rng.range(0, 0.6);          // this port's share of trade
    var flow = (8 + pop * 0.06) * scale;          // tonnes/day, the base unit

    function ensure(cid) {
      if (!rows[cid]) {
        rows[cid] = { id: cid, prod: 0, cons: 0, cap: 0, local: 1, value: BY_ID[cid].base };
      }
      return rows[cid];
    }

    /* Native production: whatever the rock and the biosphere give you. */
    var native = NATIVE[host.type] || NATIVE.rocky;
    for (var n = 0; n < native.length; n++) {
      var r = ensure(native[n]);
      r.prod += flow * rng.range(0.55, 1.35) * (1 - 0.35 * BY_ID[native[n]].tier * 0.25);
    }

    /* Manufactured production, gated on how developed the world is. */
    for (var s = 0; s < INDUSTRY.length; s++) {
      if (dev < INDUSTRY[s].at) break;
      var headroom = clamp((dev - INDUSTRY[s].at) / 0.2, 0.15, 1);
      for (var g = 0; g < INDUSTRY[s].goods.length; g++) {
        if (!rng.chance(0.72)) continue;
        var rr = ensure(INDUSTRY[s].goods[g]);
        rr.prod += flow * headroom * rng.range(0.18, 0.55);
      }
    }

    /* The role tips the scales rather than replacing the above — a refinery
     * orbiting a gas giant still trades everything, it just moves a great
     * deal more hydrogen than the next port over. */
    for (var b = 0; b < role.bias.length; b++) {
      var br = ensure(role.bias[b]);
      br.prod += flow * rng.range(0.4, 1.1);
    }

    /* Consumption. Everyone eats and drinks; industry eats feedstock; and
     * an agricultural world buys the machinery it cannot build. */
    for (var u = 0; u < UNIVERSAL_DEMAND.length; u++) {
      ensure(UNIVERSAL_DEMAND[u]).cons += flow * rng.range(0.5, 1.0);
    }
    /* Every port burns hydrogen, so every port stocks it. This is a
     * gameplay guarantee as much as a plausible one: jump range comes out
     * of this tank, and a port that could not sell you any would be a place
     * you could arrive at and never leave. Refuelling is expensive at a
     * farming co-op and cheap at a gas-giant refinery — that is the honest
     * difference — but it is never impossible. */
    ensure(FUEL_ID).cons += flow * rng.range(0.35, 0.9);
    if (dev > 0.25) {
      ensure('alloys').cons += flow * dev * rng.range(0.25, 0.6);
      ensure('chemicals').cons += flow * dev * rng.range(0.2, 0.5);
      ensure('ores').cons += flow * dev * rng.range(0.3, 0.8);
    }
    if (dev > 0.5) {
      ensure('rare').cons += flow * dev * rng.range(0.06, 0.2);
      ensure('computers').cons += flow * dev * rng.range(0.05, 0.16);
      ensure('medical').cons += flow * dev * rng.range(0.04, 0.14);
    }
    if (dev > 0.72) {
      ensure('fissile').cons += flow * dev * rng.range(0.02, 0.09);
      ensure('robotics').cons += flow * dev * rng.range(0.03, 0.11);
      ensure('luxuries').cons += flow * dev * rng.range(0.02, 0.08);
    }
    // Agricultural worlds are machinery importers — that is the classic
    // Frontier trade and it should exist in every system that has a farm.
    if (rows.grain || rows.livestock || rows.fish) {
      ensure('farmmach').cons += flow * rng.range(0.10, 0.30);
      if (dev > 0.4) ensure('robotics').cons += flow * rng.range(0.03, 0.09);
    }

    /* Radioactive waste. Output scales with the SQUARE of development: a
     * subsistence outpost makes almost none, a fully industrialised world
     * makes an embarrassing amount of it, and that asymmetry is what makes
     * the disposal run worth flying. */
    var wasteRow = ensure('waste');
    wasteRow.prod += flow * dev * dev * rng.range(0.12, 0.34);
    wasteRow.sink = !!role.wasteSink;
    if (role.wasteSink) {
      wasteRow.cons += flow * rng.range(1.2, 3.0);   // capacity to absorb it
    }

    /* Turn flows into stock: capacity is a few days of throughput, floored
     * so a tiny port still has something on the shelf. */
    var ids = Object.keys(rows);
    for (var k = 0; k < ids.length; k++) {
      var row = rows[ids[k]];
      var throughput = Math.max(row.prod, row.cons, flow * 0.05);
      row.cap = Math.round(throughput * rng.range(5, 14) + 120);

      var net = row.prod - row.cons;
      /* Structural price factor. A place that makes more than it uses sells
       * cheap; a place that needs more than it makes pays up. This is what
       * a trade route actually IS. */
      var ratio = net / Math.max(row.prod + row.cons, 1e-6);   // -1..+1
      row.local = clamp(1 - ratio * 0.34, 0.6, 1.5);
      row.exporter = net > throughput * 0.08;
      row.importer = net < -throughput * 0.08;

      /* Baseline fill and its seasonal wobble. Exporters sit on a pile;
       * importers run close to empty and depend on deliveries arriving. */
      row.base = clamp(0.5 + ratio * 0.34, 0.10, 0.93);
      row.amp = rng.range(0.03, 0.11);
      row.periodS = rng.range(9, 40) * DAY;
      row.phase = rng.angle();
    }

    port.market = {
      rows: rows,
      order: ids.slice().sort(function (a, b) {
        return (BY_ID[a].tier - BY_ID[b].tier) || (BY_ID[a].base - BY_ID[b].base);
      }),
      dev: dev, pop: pop, role: roleId, roleName: role.name,
      inbound: [],       // filled in once traffic routes exist
      ledger: {},        // player-caused perturbation, decays
      live: null,        // stepped near-field state, or null when dormant
      liveT: 0
    };
    return port.market;
  }

  /* ---- black markets -----------------------------------------------------
   * Called on a MINORITY of already-built ports, from its own substream, well
   * after the legal economy exists — additive, not a rewrite: a port that
   * doesn't get picked is byte-identical to a game without this feature at
   * all, and the legal rows above never learn these two ids exist (no
   * change to NATIVE/INDUSTRY, so no legal freighter, mission board or
   * trade-route score is disturbed). Same prod/cons/cap/local shape as any
   * other row — Eco.price and Eco.stock cannot tell the difference — so the
   * only thing that marks these as different is BY_ID[cid].contraband,
   * which combat.js's scan checks and the ordinary trade UI does not. */
  function addBlackMarketRows(port, rng) {
    registerContraband();
    var flow = 3 + rng.range(0, 7);
    for (var i = 0; i < CONTRABAND.length; i++) {
      var cid = CONTRABAND[i].id;
      var isSource = rng.chance(0.5);
      var prod = isSource ? flow * rng.range(0.3, 1.0) : 0;
      var cons = isSource ? 0 : flow * rng.range(0.2, 0.8);
      var throughput = Math.max(prod, cons, flow * 0.05);
      var net = prod - cons;
      var ratio = net / Math.max(prod + cons, 1e-6);
      var row = {
        id: cid, prod: prod, cons: cons, local: clamp(1 - ratio * 0.34, 0.6, 1.5),
        value: BY_ID[cid].base,
        cap: Math.round(throughput * rng.range(5, 14) + 40),
        exporter: net > throughput * 0.08, importer: net < -throughput * 0.08,
        base: clamp(0.5 + ratio * 0.34, 0.10, 0.93),
        amp: rng.range(0.03, 0.11), periodS: rng.range(9, 40) * DAY, phase: rng.angle()
      };
      port.market.rows[cid] = row;
    }
    port.market.order = Object.keys(port.market.rows).sort(function (a, b) {
      return (BY_ID[a].tier - BY_ID[b].tier) || (BY_ID[a].base - BY_ID[b].base);
    });
    port.market.blackMarket = true;
  }

  /* ---- analytic stock --------------------------------------------------
   * Closed form, valid for any t, past or future, with no state. This is
   * the market's equivalent of Kepler.state(): jump a decade and the answer
   * is exact rather than accumulated. */
  function scheduledDeliveries(mkt, cid, t) {
    var add = 0;
    for (var i = 0; i < mkt.inbound.length; i++) {
      var d = mkt.inbound[i];
      if (d.cid !== cid) continue;
      /* Arrivals happen at t0 + cruise + n*period. Only the last couple
       * still matter — the pile is consumed away with a time constant of
       * roughly one delivery interval — so we sum two terms, not a series. */
      var first = d.t0 + d.cruise;
      var n = Math.floor((t - first) / d.period);
      for (var k = 0; k < 2; k++) {
        var arrival = first + (n - k) * d.period;
        var age = t - arrival;
        if (age < 0) continue;
        add += d.qty * Math.exp(-age / (d.period * 0.55));
      }
    }
    return add;
  }

  function analyticStock(port, cid, t) {
    var mkt = port.market;
    var row = mkt.rows[cid];
    if (!row) return 0;
    var lvl = row.base + row.amp * Math.sin(TAU * (t / row.periodS) + row.phase);
    var stock = lvl * row.cap + scheduledDeliveries(mkt, cid, t);
    return clamp(stock, 0, row.cap);
  }

  /* The player's own footprint on this market, decaying toward forgotten.
   * Positive means the player has ADDED stock (sold to them). */
  function ledgerAt(mkt, cid, t) {
    var e = mkt.ledger[cid];
    if (!e) return 0;
    var age = t - e.t0;
    if (age < 0) return e.q;
    var v = e.q * Math.pow(0.5, age / LEDGER_HALFLIFE);
    return Math.abs(v) < 1e-6 ? 0 : v;
  }

  /* The number everything else asks for: how much of this is actually on
   * the shelf right now. Uses the stepped near-field state when this port
   * is live, and the closed form plus the player's ledger when it is not. */
  function stock(port, cid, t) {
    var mkt = port.market;
    var row = mkt.rows[cid];
    if (!row) return 0;
    if (mkt.live && mkt.live[cid] !== undefined) return clamp(mkt.live[cid], 0, row.cap);
    return clamp(analyticStock(port, cid, t) + ledgerAt(mkt, cid, t), 0, row.cap);
  }

  /* ---- prices ----------------------------------------------------------
   * Scarcity does the work. A warehouse at 10% charges a premium; one at
   * 90% is desperate to move it. The structural factor (`local`) says
   * whether this world is a natural source or sink for the good, which is
   * what separates a trade route from noise. */
  function price(port, cid, t) {
    var mkt = port.market;
    var row = mkt.rows[cid];
    if (!row) return null;
    var com = BY_ID[cid];
    var st = stock(port, cid, t);
    var fill = row.cap > 0 ? clamp(st / row.cap, 0, 1) : 0.5;

    if (com.waste) return wastePrice(port, row, st, fill);

    var scarcity = 0.55 + 0.95 * (1 - fill);
    var mid = com.base * row.local * scarcity;
    return {
      id: cid, name: com.name, mid: mid,
      buy: mid * (1 + SPREAD / 2),      // what the player pays per tonne
      sell: mid * (1 - SPREAD / 2),     // what the player is paid per tonne
      stock: st, cap: row.cap, fill: fill,
      exporter: row.exporter, importer: row.importer,
      tradeable: true, accepts: true
    };
  }

  /* Waste runs backwards and it is worth being explicit about why rather
   * than letting the sign fall out of a shared formula.
   *
   * At a PRODUCER the stuff is a liability: they pay you to load it, and
   * the more of it they have stacked up the more they will pay. Both of the
   * player's prices are therefore negative — "buying" a tonne credits you.
   *
   * At a SINK you are the one paying, but far less than you were paid, and
   * only a place with a reprocessing plant will take it at all. The gap
   * between the two is the margin, and the catch is geographic: sinks are
   * by construction at the poor, undeveloped end of the system, a long way
   * from the industrial worlds generating the stuff. That is the trade —
   * a good margin in exchange for a bad itinerary. */
  function wastePrice(port, row, st, fill) {
    var magnitude = Math.abs(BY_ID.waste.base);
    if (row.sink) {
      var fee = magnitude * 0.42 * (0.7 + 0.5 * fill);
      return {
        id: 'waste', name: 'Radioactive waste', mid: fee,
        buy: null,                     // a dump does not sell you waste
        sell: -fee,                    // negative: you pay to unload
        stock: st, cap: row.cap, fill: fill,
        tradeable: true, accepts: true, sink: true
      };
    }
    var payout = magnitude * (0.45 + 0.55 * fill);
    return {
      id: 'waste', name: 'Radioactive waste', mid: -payout,
      buy: -payout,                    // negative: taking it pays you
      sell: null,                      // they will not take it back
      stock: st, cap: row.cap, fill: fill,
      tradeable: true, accepts: false, sink: false
    };
  }

  /* Everything this port will talk to you about, in a stable display order. */
  function priceList(port, t) {
    var out = [];
    for (var i = 0; i < port.market.order.length; i++) {
      var p = price(port, port.market.order[i], t);
      if (p) out.push(p);
    }
    return out;
  }

  /* ---- the player's own trades -----------------------------------------
   * `tonnes` positive means stock leaves the port (the player bought it).
   * Applied to the live stepped state when the port is live, and to the
   * decaying ledger when it is not — the two are made equivalent by
   * goLive/goDormant below, so it does not matter which path a trade takes. */
  function applyTrade(port, cid, tonnes, t) {
    var mkt = port.market;
    var row = mkt.rows[cid];
    if (!row) return;
    if (mkt.live && mkt.live[cid] !== undefined) {
      mkt.live[cid] = clamp(mkt.live[cid] - tonnes, 0, row.cap);
      return;
    }
    var cur = ledgerAt(mkt, cid, t);
    mkt.ledger[cid] = { q: cur - tonnes, t0: t };
  }

  /* ---- near-field stepped simulation ------------------------------------
   * Within LIVE_RANGE of the ship, a port stops being a formula and starts
   * being a simulation: stock integrates forward continuously, so prices
   * creep while you sit docked watching them rather than jumping between
   * closed-form samples.
   *
   * Two rules keep the two models honest with each other:
   *   - going live SEEDS from the analytic value, so nothing jumps; and
   *   - going dormant folds (live - analytic) into the ledger, so the
   *     divergence you caused survives and then decays, exactly as a trade
   *     does. There is no third source of truth.
   *
   * If a single step is enormous (a big warp jump), integrating it would be
   * both slow and less accurate than the closed form we already have, so we
   * resynchronise to the analytic value instead of pretending. That is the
   * same bargain the time-warp code strikes with the integrator. */
  var LIVE_RANGE = 2.0e6;         // km
  var MAX_LIVE_STEP = 6 * 3600;   // beyond this, trust the closed form

  function goLive(port, t) {
    var mkt = port.market;
    var live = {};
    for (var i = 0; i < mkt.order.length; i++) {
      var cid = mkt.order[i];
      live[cid] = clamp(analyticStock(port, cid, t) + ledgerAt(mkt, cid, t),
                        0, mkt.rows[cid].cap);
    }
    mkt.live = live;
    mkt.liveT = t;
  }

  function goDormant(port, t) {
    var mkt = port.market;
    if (!mkt.live) return;
    for (var i = 0; i < mkt.order.length; i++) {
      var cid = mkt.order[i];
      var delta = mkt.live[cid] - analyticStock(port, cid, t);
      if (Math.abs(delta) > 1e-6) mkt.ledger[cid] = { q: delta, t0: t };
      else delete mkt.ledger[cid];
    }
    mkt.live = null;
  }

  function stepLive(port, t) {
    var mkt = port.market;
    var dt = t - mkt.liveT;
    mkt.liveT = t;
    if (dt <= 0) return;
    if (dt > MAX_LIVE_STEP) {
      // Too big a jump to integrate honestly — take the exact answer, and
      // keep the player's divergence by re-seeding through the ledger.
      goDormant(port, t);
      goLive(port, t);
      return;
    }
    var days = dt / DAY;
    for (var i = 0; i < mkt.order.length; i++) {
      var cid = mkt.order[i];
      var row = mkt.rows[cid];
      var net = (row.prod - row.cons) * days;
      /* Pull gently toward the analytic baseline as well as applying the
       * raw flow. Without this a live port would wander away from its
       * closed form over a long dock and then snap when it went dormant;
       * with it, the simulation is the closed form plus local texture. */
      var target = analyticStock(port, cid, t);
      var cur = mkt.live[cid];
      var pull = (target - cur) * clamp(dt / (2 * DAY), 0, 0.25);
      mkt.live[cid] = clamp(cur + net + pull, 0, row.cap);
    }
  }

  /* Called once a frame with the ship's position. Decides which ports are
   * close enough to be worth simulating and steps them. */
  function update(sys, t, shipPos, bodyPosition) {
    var ports = sys.ports || [];
    for (var i = 0; i < ports.length; i++) {
      var port = ports[i];
      if (!port.market) continue;
      var d = Infinity;
      if (shipPos) {
        var pp = bodyPosition(port, sys, t);
        d = Math.sqrt((pp.x - shipPos.x) * (pp.x - shipPos.x) +
                      (pp.y - shipPos.y) * (pp.y - shipPos.y) +
                      (pp.z - shipPos.z) * (pp.z - shipPos.z));
      }
      if (d <= LIVE_RANGE) {
        if (!port.market.live) goLive(port, t);
        else stepLive(port, t);
      } else if (port.market.live) {
        goDormant(port, t);
      }
    }
  }

  /* ---- helpers for the rest of the game -------------------------------- */

  /* Which ports here are worth flying a given cargo to? Used both to pick
   * NPC freighter routes at generation time and to fill the "best market"
   * line on the trade console. */
  function bestBuyers(sys, cid, t, limit) {
    var out = [];
    var ports = sys.ports || [];
    for (var i = 0; i < ports.length; i++) {
      var p = price(ports[i], cid, t);
      if (!p || p.sell === null) continue;
      out.push({ port: ports[i], price: p.sell });
    }
    out.sort(function (a, b) { return b.price - a.price; });
    return out.slice(0, limit || 3);
  }

  function wasteSinks(sys) {
    var out = [];
    var ports = sys.ports || [];
    for (var i = 0; i < ports.length; i++) {
      var row = ports[i].market && ports[i].market.rows.waste;
      if (row && row.sink) out.push(ports[i]);
    }
    return out;
  }

  /* ---- reading the chain back -------------------------------------------
   * Measure a sample of real systems and report the chain's terms as they
   * actually came out. This is the other half of naming them: a knob you
   * cannot read the effect of is a knob you tune by superstition.
   *
   * Takes the generator as an argument rather than requiring it, because
   * generate.js already depends on this file and the cycle would be real. */
  function galaxyProfile(Gen, seeds) {
    var systems = 0, planets = 0, habitable = 0, ports = 0;
    var settledPorts = 0, hubs = 0, devSum = 0;
    for (var i = 0; i < seeds.length; i++) {
      var sys = Gen.generateSystem(seeds[i]);
      systems++;
      var pl = sys.bodies.filter(function (b) { return b.kind === 'planet'; });
      planets += pl.length;
      habitable += pl.filter(function (p) { return p.habitable; }).length;
      var ps = sys.ports || [];
      ports += ps.length;
      for (var j = 0; j < ps.length; j++) {
        var m = ps[j].market;
        if (!m) continue;
        devSum += m.dev;
        if (ps[j].parentBody && ps[j].parentBody.habitable) settledPorts++;
        if (m.role === 'highport' || m.role === 'shipyard') hubs++;
      }
    }
    var r2 = function (x) { return Math.round(x * 100) / 100; };
    return {
      pressure: SETTLEMENT.pressure,
      systems: systems,
      planetsPerSystem: r2(planets / systems),
      nHab: r2(habitable / systems),                    // habitable worlds per system
      portsPerSystem: r2(ports / systems),
      fSettled: r2(ports ? settledPorts / ports : 0),   // ports on habitable worlds
      fGrown: r2(ports ? devSum / ports : 0),           // mean development
      fHub: r2(ports ? hubs / ports : 0),               // highports and shipyards
      hubsPerSystem: r2(hubs / systems)
    };
  }

  var Economy = {
    SETTLEMENT: SETTLEMENT,
    setPressure: setPressure,
    pressured: pressured,
    pressuredChance: pressuredChance,
    galaxyProfile: galaxyProfile,
    DAY: DAY,
    COMMODITIES: COMMODITIES,
    BY_ID: BY_ID,
    FUEL_ID: FUEL_ID,
    SPREAD: SPREAD,
    LIVE_RANGE: LIVE_RANGE,
    LEDGER_HALFLIFE: LEDGER_HALFLIFE,
    PORT_ROLES: PORT_ROLES,
    NATIVE: NATIVE,
    INDUSTRY: INDUSTRY,
    CONTRABAND: CONTRABAND,
    addBlackMarketRows: addBlackMarketRows,
    developmentOf: developmentOf,
    populationOf: populationOf,
    buildPortMarket: buildPortMarket,
    analyticStock: analyticStock,
    ledgerAt: ledgerAt,
    stock: stock,
    price: price,
    priceList: priceList,
    applyTrade: applyTrade,
    goLive: goLive,
    goDormant: goDormant,
    stepLive: stepLive,
    update: update,
    bestBuyers: bestBuyers,
    wasteSinks: wasteSinks
  };

  global.Economy = Economy;
  if (typeof module !== 'undefined' && module.exports) module.exports = Economy;
})(typeof window !== 'undefined' ? window : globalThis);
