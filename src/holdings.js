/* holdings.js — industry you own, and what owning it does to a system.
 *
 * Astra, 2026-10-07: "any struggling industry. In fact we can have this
 * work into a mechanic about turning a corrupt, low-tech system into a
 * lawful, high-tech one." And her four answers, which are the design:
 *
 *   - FOR SALE is books + events. Some plants start underwater, read off
 *     their own books, so a seed always has the same distressed plants;
 *     events in play push others under (phase 3).
 *   - UPLIFT is drift + investment. Every week a plant runs clean, the
 *     system's corruption creeps down and its development up; money spent
 *     on the plant pushes harder; crossing a threshold changes the
 *     government (phase 4).
 *   - THE SYNDICATE PUSHES BACK, and a hold can be lost to them (phase 3).
 *   - IT MIRRORS. A plant run dirty pays more and drags the system the
 *     other way.
 *
 * NOTHING HERE TOUCHES GENERATION. A system is still a pure function of
 * its seed. What lives on the save is a SHIFT on top of the government's
 * numbers, keyed by star — the same shape as `G.corruptionShift`, which is
 * the bribe layer in combat.js. The two differ in the one way that matters:
 * a bribe fades (a bought official retires), and this does not, because
 * it is not a favour, it is a plant with a payroll and a security office.
 * Both are read back through Combat.effectiveCorruption, so everything
 * that already answers to corruption — the grey market, the scans, the
 * bribes — answers to this without being told.
 *
 * Settled at the desk, weekly, beside wages and berthing (Fleet.settle).
 * Nothing ticks. */
(function (global) {
  'use strict';

  var DAY = 86400, WEEK = 7 * DAY;

  /* ---- what counts as an industry ----------------------------------------
   * Every port with a productive role, a crop or a giant's plant. Two are
   * NOT for sale, ever, and say why: a milfuel factory runs under a navy or
   * Syndicate licence, and a fleet carrier is a warship somebody parked. */
  var INDUSTRY = { refinery: 1, shipyard: 1, agri: 1, mining: 1, reprocessing: 1 };
  var STATE_ASSET = {
    milfuel: 'a milfuel factory runs under licence — it is not the harbour\'s to sell',
    carrier: 'a fleet carrier is a warship; the navy does not sell those'
  };

  /* Which kind of plant this is, for comparing like with like. */
  function kindOf(port) {
    if (!port || !port.market) return null;
    if (port.crop) return 'farm-' + port.crop;
    if (port.plant) return 'plant-' + port.plant;
    return port.market.role;
  }

  /* ---- health: a plant against plants of its own kind --------------------
   * MEASURED, NOT CHOSEN (2026-10-07, two galaxies, 3,080 industries).
   *
   * The first idea was the plant's own books: what it exports over what it
   * imports. Across roles that is useless — every gas-giant skimmer reads
   * as failing (median 0.25) because hydrogen is cheap, and every
   * reprocessing plant as thriving (3.99). So a plant is measured against
   * the MEDIAN OF ITS KIND, below, which puts every role on one scale:
   * after it, the role medians run 0.44-0.65.
   *
   * Then the racket and the violence take their cut. Corruption is the
   * heavier term on purpose — a skim comes off every tonne, a robbery off
   * some — and it is what makes distress gather where the uplift game
   * needs it: under DISTRESS, 7.4% of plants in clean systems (corruption
   * under 40) and 29.7% in corrupt ones (60 and over). Nothing places them
   * there. The books do. */
  var KIND_MEDIAN = {
    agri: 1.42, mining: 2.92, reprocessing: 3.99, shipyard: 3.45,
    refinery: 0.92, 'plant-refinery': 0.92, 'plant-skimmer': 0.25,
    'farm-gold': 5.06, 'farm-grape': 3.50
  };
  var SKIM_WEIGHT = 0.6;          // corruption's cut, at 100
  var VIOLENCE_WEIGHT = 0.3;      // violence's cut, at 100
  var DISTRESS = 0.35;            // under this, the plant is for sale

  /* The plant's own books: export value over import value, at base prices
   * and the port's structural multiplier. Seed-constant — what changes in
   * play is the cut taken off it, never the plant. Waste is left out: it
   * runs backwards and it is the disposal contract, not the plant. */
  function books(port) {
    var Eco = global.Economy;
    var m = port && port.market;
    var exp = 0, imp = 0;
    if (!m || !Eco) return { exp: 0, imp: 0, ratio: 0 };
    for (var cid in m.rows) {
      var r = m.rows[cid], c = Eco.BY_ID[cid];
      if (!c || c.waste) continue;
      var net = r.prod - r.cons, v = Math.abs(net) * c.base * r.local;
      if (net > 0) exp += v; else imp += v;
    }
    return { exp: exp, imp: imp, ratio: exp / Math.max(1, imp) };
  }

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

  function healthFrom(ratio, kind, corruption, violence) {
    var med = KIND_MEDIAN[kind] || 1;
    return (ratio / med) *
           (1 - SKIM_WEIGHT * clamp(corruption, 0, 100) / 100) *
           (1 - VIOLENCE_WEIGHT * clamp(violence, 0, 100) / 100);
  }

  /* ---- the shift a system carries ---------------------------------------
   * `G.uplift[starId] = { corr, viol, dev }` — points of corruption and
   * violence (negative is cleaner) and development as a fraction. Written
   * only by settle(); read by everything.
   *
   * CAPPED, because the government underneath should still show through:
   * a Feudal world run clean for a decade is a well-run Feudal world, not
   * a Technocracy, until phase 4 says its government changed. The caps
   * are wide enough to take the worst system in the galaxy (corruption
   * 94 at p90) to the clean side of the 40 line. */
  var CAP_CORR = 60, CAP_VIOL = 30, CAP_DEV = 0.35;

  function shiftOf(G, starId) {
    var u = G && G.uplift && starId ? G.uplift[starId] : null;
    return u ? { corr: u.corr || 0, viol: u.viol || 0, dev: u.dev || 0 }
             : { corr: 0, viol: 0, dev: 0 };
  }

  function addShift(G, starId, d) {
    if (!G || !starId) return;
    G.uplift = G.uplift || {};
    var u = G.uplift[starId] || (G.uplift[starId] = { corr: 0, viol: 0, dev: 0 });
    u.corr = clamp((u.corr || 0) + (d.corr || 0), -CAP_CORR, CAP_CORR);
    u.viol = clamp((u.viol || 0) + (d.viol || 0), -CAP_VIOL, CAP_VIOL);
    u.dev  = clamp((u.dev  || 0) + (d.dev  || 0), -CAP_DEV, CAP_DEV);
  }

  /* The readers. Corruption goes through Combat.effectiveCorruption, which
   * adds the bribe layer AND this one, so there is one answer to "how
   * corrupt is this place" rather than two that can disagree. */
  function corruptionOf(G, sys, starId) {
    var C = global.Combat;
    var base = (sys && sys.corruption !== undefined) ? sys.corruption : 40;
    return C && C.effectiveCorruption ? C.effectiveCorruption(G, base, starId)
                                      : clamp(base + shiftOf(G, starId).corr, 0, 100);
  }
  function violenceOf(G, sys, starId) {
    var base = (sys && sys.violence !== undefined) ? sys.violence : 20;
    return clamp(Math.round(base + shiftOf(G, starId).viol), 0, 100);
  }
  /* crimeScore is a function of the other two (generate.js permissivity),
   * so it is recomputed from the effective pair rather than shifted on its
   * own — otherwise cleaning a system up would lower its corruption and
   * leave its crime score where it was. Untouched systems answer with the
   * generated number exactly.
   *
   * THIS LAYER ONLY, NOT THE BRIBES. A bribe has only ever moved the
   * corruption readers (the grey market, hush money) and never how often
   * the police search you; folding it in here would have quietly changed
   * that for every existing career. A plant is a different thing — it
   * changes who works the docks — so it moves both. */
  function crimeOf(G, sys, starId) {
    var Gen = global.Gen;
    var base = (sys && sys.crimeScore !== undefined) ? sys.crimeScore : 40;
    var s = shiftOf(G, starId);
    if (!s.corr && !s.viol) return base;
    if (!Gen || !Gen.permissivity || !sys || sys.violence === undefined ||
        sys.corruption === undefined) return base;
    return Gen.permissivity(violenceOf(G, sys, starId),
                            clamp(sys.corruption + s.corr, 0, 100));
  }
  function devOf(G, port, starId) {
    var d = (port && port.market && typeof port.market.dev === 'number') ? port.market.dev : 0.25;
    var s = shiftOf(G, starId).dev;
    return s ? clamp(d + s, 0.02, 0.98) : d;
  }

  /* ---- the asking price, and what it pays --------------------------------
   * A distressed plant moves a median of 23k cr of goods a day (p10 7.5k,
   * p90 111k, measured). The asking price is about a WEEK of that, marked
   * down by how far under it has gone: the worse the books, the cheaper,
   * because nobody else wants it. That puts the median plant at 134k —
   * more than a Kestrel, so this is a career's second act, not its first.
   *
   * What it pays is a slice of the same throughput, weekly, scaled by the
   * plant's health. A plant bought at 0.35 pays a little over half what a
   * healthy one does; clean the system up and the same plant pays more,
   * because the racket was taking that cut. That feedback is the point —
   * the money and the uplift pull the same way until the Syndicate notices
   * (phase 3).
   *
   * MEASURED on kawartha, all 253 plants for sale: asking prices run 47k
   * to 696k (p10-p90), median 134k. At a margin of 0.04 they paid back in
   * 42-78 weeks, median 2.7k a week — next to a milfuel run's 30-70k, too
   * thin to be worth a second look. At 0.06 it is 28-52 weeks before the
   * system improves, and the plant's own health rising takes that down
   * further. Still slow on purpose: the return on a plant is mostly the
   * system it changes. */
  var PRICE_DAYS = 7;
  var MARGIN = 0.06;              // of a week's throughput, at health 0.6
  var DIRTY_PAY = 1.6;            // a skim pays — that is why there is one

  function askingPrice(exp, health) {
    return Math.max(5000, Math.round(exp * PRICE_DAYS * (0.6 + clamp(health, 0, 0.6)) / 100) * 100);
  }

  /* ---- drift, and the money that pushes it -------------------------------
   * Per plant, per week. Clean: corruption and violence come down and
   * development goes up. Dirty: the mirror, minus the development — a
   * laundromat does not train anybody. One clean plant with nothing spent
   * on it takes a corruption-75 system to 35 in about fifty weeks; fully
   * invested, about twenty. Two plants, half that. These are starting
   * numbers to be tuned in play, and they say so. */
  var RATE = {
    clean: { corr: -0.8, viol: -0.3, dev: 0.004 },
    dirty: { corr:  1.0, viol:  0.2, dev: 0 }
  };
  /* Three things to spend on, three levels each. Each level costs a share
   * of what the plant cost, rising — the first guard post is cheap, a
   * whole security directorate is not. */
  var INVEST = {
    security:   { label: 'Security',   viol: 0.75, corr: 0,    dev: 0,    pay: 0 },
    automation: { label: 'Automation', viol: 0,    corr: 0,    dev: 0.75, pay: 0.1 },
    training:   { label: 'Training',   viol: 0,    corr: 0.5,  dev: 0.25, pay: 0 }
  };
  var INVEST_MAX = 3;
  var INVEST_FRAC = 0.2;

  function investCost(h, kind) {
    var lvl = (h.invest && h.invest[kind]) || 0;
    return Math.round(h.price * INVEST_FRAC * (lvl + 1) / 100) * 100;
  }

  function mult(h, axis) {
    var m = 1, inv = h.invest || {};
    for (var k in INVEST) m += (INVEST[k][axis] || 0) * (inv[k] || 0);
    return m;
  }

  function weeklyDrift(h) {
    var r = RATE[h.mode] || RATE.clean;
    return { corr: r.corr * mult(h, 'corr'),
             viol: r.viol * mult(h, 'viol'),
             dev:  r.dev  * mult(h, 'dev') };
  }

  /* A held plant's health now: its seed-constant books, under the cut the
   * system takes TODAY. Stored base numbers rather than a regenerated
   * system, so settling a plant six jumps away costs nothing. */
  function healthOf(G, h) {
    var sys = { corruption: h.baseCorr, violence: h.baseViol };
    return healthFrom(h.ratio, h.kind, corruptionOf(G, sys, h.star), violenceOf(G, sys, h.star));
  }

  function weeklyIncome(G, h) {
    var f = clamp(healthOf(G, h) / 0.6, 0.2, 1.5);
    return Math.round(h.exp * 7 * MARGIN * f * (h.mode === 'dirty' ? DIRTY_PAY : 1) * mult(h, 'pay'));
  }

  /* ---- what is for sale, and why not -------------------------------------
   * One answer for every port, so the yard's list and the BUY button cannot
   * disagree. Refusals carry reasons (doctrine 5). */
  function keyOf(starId, port) { return String(starId) + '/' + port.id; }

  function list(G) { return (G && G.holdings) || []; }
  function owned(G, starId, port) {
    var k = keyOf(starId, port), l = list(G);
    for (var i = 0; i < l.length; i++) if (l[i].id === k) return l[i];
    return null;
  }

  function quote(G, sys, starId, port) {
    var kind = kindOf(port);
    if (!kind) return { ok: false, why: 'nothing here to buy' };
    var role = port.market.role;
    if (STATE_ASSET[role]) return { ok: false, why: STATE_ASSET[role] };
    if (!(INDUSTRY[role] || port.crop || port.plant)) {
      return { ok: false, why: 'a trading port, not a plant — there is no works to buy' };
    }
    if (owned(G, starId, port)) return { ok: false, why: 'already yours', mine: true };
    var b = books(port);
    var health = healthFrom(b.ratio, kind, corruptionOf(G, sys, starId), violenceOf(G, sys, starId));
    var price = askingPrice(b.exp, health);
    if (health >= DISTRESS) {
      return { ok: false, why: 'not for sale — the books are sound (' + Math.round(health * 100) +
               '% health; a plant goes on the market under ' + Math.round(DISTRESS * 100) + '%)',
               health: health, price: price };
    }
    return { ok: true, health: health, price: price, kind: kind, books: b };
  }

  function forSale(G, sys, starId) {
    var out = [];
    var ports = (sys && sys.ports) || [];
    for (var i = 0; i < ports.length; i++) {
      var q = quote(G, sys, starId, ports[i]);
      if (q.ok) out.push({ port: ports[i], quote: q });
    }
    return out;
  }

  /* Bought at the plant's own desk, which is where a liquidator sits. */
  function buy(G, sys, starId, port) {
    var s = G && G.ship;
    if (!s) return { ok: false, why: 'no ship' };
    if (s.docked !== port.id) return { ok: false, why: 'sold only at its own desk — dock at ' + port.name };
    var q = quote(G, sys, starId, port);
    if (!q.ok) return q;
    if (s.credits < q.price) {
      return { ok: false, why: 'the liquidator wants ' + q.price + ' cr; you have ' + Math.floor(s.credits) };
    }
    s.credits -= q.price;
    var h = {
      id: keyOf(starId, port), star: starId, port: port.id,
      name: port.name, sysName: sys.name || '', kind: q.kind,
      ratio: q.books.ratio, exp: q.books.exp,
      baseCorr: sys.corruption !== undefined ? sys.corruption : 40,
      baseViol: sys.violence !== undefined ? sys.violence : 20,
      price: q.price, boughtAt: G.t || 0, paidTo: G.t || 0,
      mode: 'clean', invest: { security: 0, automation: 0, training: 0 }
    };
    G.holdings = list(G).concat([h]);
    return { ok: true, holding: h, price: q.price };
  }

  function setMode(G, id, mode) {
    if (!RATE[mode]) return { ok: false, why: 'run it clean or dirty' };
    var h = byId(G, id);
    if (!h) return { ok: false, why: 'not yours' };
    h.mode = mode;
    return { ok: true, holding: h };
  }

  function invest(G, id, kind) {
    var h = byId(G, id);
    if (!h) return { ok: false, why: 'not yours' };
    if (!INVEST[kind]) return { ok: false, why: 'nothing called that to spend on' };
    h.invest = h.invest || {};
    var lvl = h.invest[kind] || 0;
    if (lvl >= INVEST_MAX) return { ok: false, why: INVEST[kind].label + ' is as far as it goes' };
    var cost = investCost(h, kind);
    if (!G.ship || G.ship.credits < cost) {
      return { ok: false, why: INVEST[kind].label + ' level ' + (lvl + 1) + ' costs ' + cost + ' cr' };
    }
    G.ship.credits -= cost;
    h.invest[kind] = lvl + 1;
    return { ok: true, holding: h, cost: cost };
  }

  function byId(G, id) {
    var l = list(G);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  /* ---- the desk ----------------------------------------------------------
   * Whole weeks since each plant was last settled: the money comes in and
   * the system moves, a week at a time, oldest first, so a plant settled
   * after a long absence pays each week at the health that week had rather
   * than all of it at today's. Remainders carry, as with berthing. */
  function settle(G, t) {
    var lines = [], l = list(G);
    for (var i = 0; i < l.length; i++) {
      var h = l[i];
      if (h.paidTo == null) h.paidTo = t;
      var weeks = Math.floor(((t - h.paidTo) || 0) / WEEK);
      if (!(weeks > 0)) continue;
      var cr = 0;
      for (var w = 0; w < weeks; w++) {
        cr += weeklyIncome(G, h);
        addShift(G, h.star, weeklyDrift(h));
      }
      h.paidTo += weeks * WEEK;
      if (G.ship) G.ship.credits += cr;
      lines.push(h.name + ' ' + (h.mode === 'dirty' ? '(off the books) ' : '') + '+' + cr +
                 ' cr  ·  ' + weeks + ' wk');
    }
    return lines;
  }

  var Holdings = {
    kindOf: kindOf, books: books, healthFrom: healthFrom, healthOf: healthOf,
    quote: quote, forSale: forSale, buy: buy, setMode: setMode, invest: invest,
    investCost: investCost, weeklyIncome: weeklyIncome, weeklyDrift: weeklyDrift,
    list: list, byId: byId, owned: owned, settle: settle,
    shiftOf: shiftOf, addShift: addShift,
    corruptionOf: corruptionOf, violenceOf: violenceOf, crimeOf: crimeOf, devOf: devOf,
    KIND_MEDIAN: KIND_MEDIAN, DISTRESS: DISTRESS, INVEST: INVEST, INVEST_MAX: INVEST_MAX,
    RATE: RATE, CAP_CORR: CAP_CORR, CAP_VIOL: CAP_VIOL, CAP_DEV: CAP_DEV,
    STATE_ASSET: STATE_ASSET, WEEK: WEEK
  };

  global.Holdings = Holdings;
  if (typeof module !== 'undefined' && module.exports) module.exports = Holdings;
})(typeof window !== 'undefined' ? window : globalThis);
