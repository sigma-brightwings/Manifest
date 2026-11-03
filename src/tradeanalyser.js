/* tradeanalyser.js — one port's market, its month, and what a run costs (2026-11-03).
 *
 * Astra: "add a trade analyzer as a buyable upgrade, 1000 cr, shows the
 * graph of how every commodity buys and sells at that port, and what the
 * average price is, your break-even price when factoring fuel in, and the
 * buy and sell prices should be visually distinct from one another ...
 * This screen will also be reachable by walking out of your ship and onto
 * a station in order to read it off a public computer terminal."
 *
 * THIS FILE IS THE DATA; main.js drawAnalyser is the page. Two routes reach
 * the screen — the fitting (combat.js `portanalyser`) and the terminal on a
 * concourse (walk.js placeTradeTerminal) — and both come through route()
 * into build(), so there is one answer to "what does this port's market
 * say", not two copies that can drift. The only differences between the
 * routes are the ones route() writes down in words: which port, and whether
 * the screen may see your ship's lock.
 *
 * NOTHING HERE IS INVENTED. Every price is Economy.price (now) or
 * Economy.priceAt (the past, the closed form the market already is), so
 * the graph is the market screen's own numbers over time and cannot
 * disagree with the counter. Pure functions of the system, the clock and
 * the ship — no Math.random, no state of its own; main.js keeps the cache.
 */
(function (global) {
  var DAY = 86400;

  /* THE WINDOW: thirty days, a point every twelve hours. A month because
   * the slowest thing in a port's market — the seasonal swing of a row
   * (Economy row.periodS) — runs over weeks, and a window shorter than
   * that shows a slope with no idea whether it is a trend or the half of a
   * wave you happened to catch. Twelve hours because the delivery pulses
   * that put the jags in a price come every day or two, and sampling
   * slower than they arrive would draw them as noise. 61 points × ~17 goods
   * is ~1,000 price calls, measured at 0.6 µs each: under a millisecond. */
  var WINDOW_DAYS = 30;
  var STEP_H = 12;
  var SAMPLES = WINDOW_DAYS * 24 / STEP_H + 1;

  /* ---- prices from other systems --------------------------------------
   * A port's prices reach another system the way everything else does: in
   * a freighter's datalink, across the corridor. So a report is as old as
   * the corridor is long, at the pace of the hull that carries it — a
   * medium (class II) freighter, the typical one on the lanes
   * (Slipspace.CLASS_TYPICAL.II, 400 t), and Slipspace.hoursPerLy is the
   * same table every jump is timed by. 11.8 h per light year at the time of
   * writing: a system five light years off is read as it was two and a
   * half days ago. Asked of Slipspace rather than written here, so a
   * retuned corridor retunes the news with it. */
  var REPORT_TONNES = 400;
  function reportHoursPerLy() {
    var Slip = global.Slipspace;
    var t = Slip && Slip.CLASS_TYPICAL ? Slip.CLASS_TYPICAL.II || REPORT_TONNES : REPORT_TONNES;
    return Slip && Slip.hoursPerLy ? Slip.hoursPerLy(t) : 11.8;
  }
  function reportAgeDays(ly) { return Math.max(0, ly) * reportHoursPerLy() / 24; }

  /* WHICH SYSTEMS. Measured over twenty seeds, a Talon with a full tank
   * reaches 60 to 90 stars (24 ly) — far too many to list, and generating
   * each costs 5–70 ms (median 19). So: the NEAREST_CAP nearest you can
   * reach on what is in the tank now, then the systems you have been to,
   * nearest first, to LIST_CAP in all — and the star you have plotted, if
   * it is neither. The near ones because they are the runs you can make;
   * the visited ones because you know them and may be heading back. */
  var NEAREST_CAP = 8;
  var LIST_CAP = 12;

  function eco() { return global.Economy; }

  function sumCargo(ship) {
    var m = 0;
    if (ship && ship.cargo) for (var k in ship.cargo) m += ship.cargo[k];
    return m;
  }

  /* ---- the history of one row at one port ------------------------------
   * The last point is price() — the live shelf when you are docked — and
   * every earlier one priceAt(). `adjust` is the caller's view of a quote
   * (main.js passes the tithe's better price at a port the overboss
   * holds), applied to every point alike so the line is one line. */
  function history(port, cid, now, adjust) {
    var Eco = eco(), out = [];
    for (var k = SAMPLES - 1; k >= 0; k--) {
      var t = now - k * STEP_H * 3600;
      var q = k === 0 ? Eco.price(port, cid, t) : Eco.priceAt(port, cid, t);
      if (!q) continue;
      if (adjust) q = adjust(port, q);
      out.push({ t: t, buy: q.buy, sell: q.sell, mid: q.mid });
    }
    return out;
  }

  /* "AVERAGE PRICE" IS THE MID, halfway between ask and bid — Astra's
   * "what the average price is", asked of a market with two prices — WHERE
   * THE PORT QUOTES BOTH. Where it quotes one (it only buys, or it is a
   * waste producer that only pays you to take it), the average is of that
   * one line: the first draft averaged the mid there too, and drew an
   * "average" floating above the only line on the graph, a price nobody
   * at that port ever quotes. The basis is said on screen, and the system
   * average is taken on the SAME basis, over the ports that quote it, so
   * the two averages are always the same kind of number. */
  function basisFor(row) {
    return row.buy !== null && row.sell !== null ? 'mid' : row.sell !== null ? 'sell' : 'buy';
  }
  function meanOf(series, key) {
    var s = 0, n = 0;
    for (var i = 0; series && i < series.length; i++) {
      var v = series[i][key || 'mid'];
      if (v === null || v === undefined) continue;
      s += v; n++;
    }
    return n ? s / n : null;
  }
  function meanMid(series) { return meanOf(series, 'mid'); }

  /* The system's average over the same window: every port under this star
   * that quotes the good on that basis, each averaged over the same
   * samples, and those averaged. */
  function systemAverage(sys, cid, now, adjust, key) {
    key = key || 'mid';
    var Eco = eco(), ports = (sys && sys.ports) || [], sum = 0, n = 0;
    for (var i = 0; i < ports.length; i++) {
      var p = ports[i];
      if (!p.market || !p.market.rows[cid] || p.dark) continue;
      var q = Eco.price(p, cid, now);
      /* A mid needs both prices; a bid or an ask needs that one. */
      if (key === 'mid' ? (q.buy === null || q.sell === null) : q[key] === null) continue;
      var m = meanOf(history(p, cid, now, adjust), key);
      if (m === null) continue;
      sum += m; n++;
    }
    return n ? { mean: sum / n, n: n } : { mean: null, n: 0 };
  }

  /* ---- the rows ---------------------------------------------------------
   * Everything the port lists, in its own display order, each with its
   * month. ONLY-BUYS and ONLY-SELLS said per row: a port sells only what it
   * makes (Economy.price's asymmetry), and waste at a producer is taken off
   * you and never bought back — so some rows have one line, and the screen
   * has to say which rather than draw a gap. */
  function rows(port, now, adjust) {
    var Eco = eco(), out = [], order = (port.market && port.market.order) || [];
    for (var i = 0; i < order.length; i++) {
      var cid = order[i];
      var q = Eco.price(port, cid, now);
      if (!q) continue;
      if (adjust) q = adjust(port, q);
      out.push({
        id: cid, name: q.name, buy: q.buy, sell: q.sell, mid: q.mid,
        stock: q.stock, cap: q.cap, waste: !!(Eco.BY_ID[cid] && Eco.BY_ID[cid].waste),
        onlyBuys: q.buy === null && q.sell !== null,
        onlySells: q.sell === null && q.buy !== null,
        series: history(port, cid, now, adjust)
      });
    }
    return out;
  }

  /* ---- which port, and what it may know: the two routes ------------------
   * Returns { ok, why } or the context build() takes. `opts`:
   *   port        — the terminal's port (via 'terminal')
   *   courseStar  — the star id you have plotted (main.js G.courseStar)
   *   burnPerKm   — main.js CRUISE_BURN, the cruise drive's reaction mass per km
   *   adjust      — (port, quote) -> quote, the tithe
   *   systemFor   — main.js systemFor, the system cache a visit uses
   *
   * THE FITTING, DOCKED, reads the port you are clamped to, and costs the
   * trip from there to whatever you have locked: a port in this system
   * (the nav lock, T) or a star (the chart's plotted course, or one picked
   * on this screen's other-systems list).
   *
   * THE FITTING, IN FLIGHT, reads the port you have locked, wherever it is
   * under this star. No range limit, and that is deliberate: the market
   * survey array already reads every port in the system from orbit, and
   * a seventh-of-the-price display of ONE port's published figures failing
   * where the dearer receiver works would be a rule with no reason. It does
   * not cost a trip — there is no "here" to buy at until you dock — and
   * says so.
   *
   * THE TERMINAL reads its own port and does NOT see your ship's lock. It
   * is a public machine bolted to a concourse floor; your nav computer is
   * in your ship. So it shows everything but the break-even and says why,
   * and that difference is most of what the fitting is for. */
  function route(G, via, opts) {
    opts = opts || {};
    var Combat = global.Combat;
    var sys = G.sys, ship = G.ship, port = null, origin = null, lock = null, lockNote = '';
    if (via === 'terminal') {
      port = opts.port;
      if (!port) return { ok: false, why: 'The terminal has lost its port' };
      lockNote = 'public terminal: it cannot see your ship\'s lock, so no break-even here';
    } else {
      if (!(Combat && Combat.hasPortAnalyser && Combat.hasPortAnalyser(ship))) {
        return { ok: false, why: 'No trade analyser fitted — 1,000 cr at any yard, a utility slot. The public terminal on a station concourse shows the same screen' };
      }
      if (ship.docked) {
        port = sys.byId[ship.docked];
        origin = port;
      } else {
        var nt = G.navTarget, b = nt && nt.kind === 'body' ? sys.byId[nt.id] : null;
        if (!b || !b.market) {
          return { ok: false, why: b ? b.name + ' is not a port — in flight the analyser reads the port you have locked (T)'
                                     : 'In flight the analyser reads the port you have locked — lock one (T), or dock' };
        }
        port = b;
        lockNote = 'in flight: dock to cost a trip from here';
      }
    }
    if (!port || !port.market) return { ok: false, why: 'No registered market at ' + (port ? port.name : 'this port') };
    if (port.dark) return { ok: false, why: port.name + ' is DARK - no power, no market' };

    if (origin) {
      var nt2 = G.navTarget, lb = nt2 && nt2.kind === 'body' ? sys.byId[nt2.id] : null;
      if (lb && lb.market && lb !== port) lock = { kind: 'port', port: lb, name: lb.name };
      else if (opts.courseStar && G.galaxy) {
        var st = null;
        for (var i = 0; i < G.galaxy.stars.length; i++) if (G.galaxy.stars[i].id === opts.courseStar) { st = G.galaxy.stars[i]; break; }
        if (st && st !== G.here) lock = { kind: 'star', star: st, name: st.name };
      }
      if (!lock) {
        lockNote = lb && lb === port ? 'your lock is this port — lock where you will sell (T), or plot a star'
                 : lb ? lb.name + ' has no market — lock a port (T), or plot a star'
                 : 'lock a target to cost the trip — a port (T), or a star (Enter on the systems list)';
      }
    }
    return {
      ok: true, via: via === 'terminal' ? 'terminal' : 'fitting',
      sys: sys, port: port, origin: origin, lock: lock, lockNote: lockNote,
      t: G.t, ship: ship, galaxy: G.galaxy, here: G.here, visited: G.visited || {},
      burnPerKm: opts.burnPerKm || 0, adjust: opts.adjust || null, systemFor: opts.systemFor || null
    };
  }

  /* The rows, for a context. The same port at the same instant gives the
   * same rows whichever route asked: that is the test of "one screen". */
  function build(ctx) {
    return {
      via: ctx.via, port: ctx.port, t: ctx.t, lock: ctx.lock, lockNote: ctx.lockNote,
      rows: rows(ctx.port, ctx.t, ctx.adjust)
    };
  }

  /* ---- the tonnage a break-even is quoted on -------------------------------
   * A FULL HOLD OF THIS GOOD: your free hold now, capped by what you can
   * afford at the ask and by what is on the shelf. Fuel is a fixed cost per
   * trip, so the break-even per tonne depends entirely on how many tonnes
   * share it, and the honest number is the load you could actually take on
   * this minute — not the hold's size, which you may have half filled. The
   * screen says which of the three set it. */
  function tonnesFor(ship, row) {
    var Sim = global.Sim;
    var free = Math.floor((ship.cargoCap || 0) - (Sim && Sim.cargoMass ? Sim.cargoMass(ship) : sumCargo(ship)));
    var afford = row.buy > 0 ? Math.floor((ship.credits || 0) / row.buy) : Infinity;
    var stock = Math.floor(row.stock || 0);
    var t = Math.max(0, Math.min(free, afford, stock));
    var by = t === free ? 'your free hold' : t === afford ? 'what you can afford' : 'what is in stock';
    return { tonnes: t, by: by, free: free, afford: afford, stock: stock };
  }

  /* What a tonne of fuel costs you here. The jump tank and the cruise
   * drive's reaction mass are both hydrogen, and every port sells it
   * (Economy.price's fuel exception), so this port's ask; at a port that
   * somehow does not, hydrogen's list price, and the screen says so. */
  function fuelPrice(port, now, cid) {
    var Eco = eco(), id = cid || Eco.FUEL_ID;
    var q = port && port.market && port.market.rows[id] ? Eco.price(port, id, now) : null;
    if (q && q.buy !== null && q.buy > 0) return { cr: q.buy, note: 'at this port\'s ask' };
    return { cr: Eco.BY_ID[id].base, note: 'at list price (not sold here)' };
  }

  /* ---- the trip ---------------------------------------------------------
   * TO A PORT IN THIS SYSTEM: the cruise drive, at main.js's CRUISE_BURN
   * tonnes of reaction mass per km, over the straight line between the two
   * ports now — cruise flies straight, and the line it takes is the line
   * between them. Reaction mass is refilled free at a clamp, so this is
   * what the burn is WORTH (priced as the hydrogen it is), not a bill; the
   * screen says that too. A milfuel cruise drive burns slugs instead and is
   * not modelled here: the line says reaction mass.
   *
   * TO A STAR: the jump, Galaxy.jumpPlan — the same call the chart quotes —
   * asked of the ship AS SHE WOULD BE, with the load aboard, because jump
   * fuel scales with all-up mass and a full hold costs more to move than an
   * empty one. Running a military drive it burns slugs from the hold, priced
   * at this port's milfuel ask. The in-system leg to where you jump from is
   * not added: a jump can be made from anywhere clear of a world. */
  function trip(ctx, cid, tonnes) {
    var lock = ctx.lock;
    if (!lock) return null;
    var Sim = global.Sim, Galaxy = global.Galaxy, Eco = eco();
    if (lock.kind === 'port') {
      var a = Sim.bodyPosition(ctx.origin, ctx.sys, ctx.t), b = Sim.bodyPosition(lock.port, ctx.sys, ctx.t);
      var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z, km = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var fuelT = km * (ctx.burnPerKm || 0), fp = fuelPrice(ctx.origin, ctx.t);
      return { kind: 'port', km: km, fuelT: fuelT, fuelCr: fuelT * fp.cr, price: fp.cr,
               what: 'reaction mass', note: fp.note, free: true };
    }
    var laden = {};
    for (var k in ctx.ship) laden[k] = ctx.ship[k];
    laden.cargo = {};
    for (var c in (ctx.ship.cargo || {})) laden.cargo[c] = ctx.ship.cargo[c];
    laden.cargo[cid] = (laden.cargo[cid] || 0) + tonnes;
    var plan = Galaxy.jumpPlan(ctx.galaxy, ctx.here, lock.star, laden);
    if (plan.military) {
      var mp = fuelPrice(ctx.origin, ctx.t, Eco.MILFUEL_ID);
      return { kind: 'star', ly: plan.distance, fuelT: plan.slugs, fuelCr: plan.slugs * mp.cr, price: mp.cr,
               what: 'milfuel', note: mp.note, overTank: false };
    }
    var hp = fuelPrice(ctx.origin, ctx.t);
    return { kind: 'star', ly: plan.distance, fuelT: plan.fuel, fuelCr: plan.fuel * hp.cr, price: hp.cr,
             what: 'jump fuel', note: hp.note, overTank: plan.fuel > (ctx.ship.fuelCap || Infinity) };
  }

  /* ---- break-even ---------------------------------------------------------
   * break-even sell price = buy price + fuel cost of the trip ÷ tonnes
   * carried. Returns { price, ... } or { why } — a missing break-even says
   * what is missing, in words, never a blank. `compare` is what the far end
   * pays: the locked port's bid now, or a locked star's best reported bid. */
  function breakEven(ctx, row, reports) {
    if (ctx.via === 'terminal' || !ctx.origin) return { why: ctx.lockNote };
    if (row.waste) return { why: 'waste runs backwards — the port pays you to take it' };
    if (row.buy === null) return { why: ctx.port.name + ' does not sell ' + row.name.toLowerCase() + ' — nothing to buy here' };
    var load = tonnesFor(ctx.ship, row);
    if (!ctx.lock) return { why: ctx.lockNote, buy: row.buy, load: load };
    if (load.tonnes < 1) {
      return { why: load.free < 1 ? 'hold full — make room to cost a load' : load.afford < 1 ? 'you cannot afford a tonne' : 'none in stock',
               buy: row.buy, load: load };
    }
    var tr = trip(ctx, row.id, load.tonnes);
    var out = { price: row.buy + tr.fuelCr / load.tonnes, buy: row.buy, load: load, trip: tr };
    if (ctx.lock.kind === 'port') {
      var q = eco().price(ctx.lock.port, row.id, ctx.t);
      if (q && ctx.adjust) q = ctx.adjust(ctx.lock.port, q);
      out.compare = q && q.sell !== null ? { bid: q.sell, where: ctx.lock.port.name, ageDays: 0 } : null;
    } else {
      var rep = reports && reports[ctx.lock.star.id];
      var g = rep && rep.goods[row.id];
      out.compare = g && g.bid !== null ? { bid: g.bid, where: g.bidPort + ', ' + ctx.lock.star.name, ageDays: rep.ageDays }
                  : rep ? { bid: null, where: ctx.lock.star.name, ageDays: rep.ageDays } : null;
    }
    return out;
  }

  /* Both averages and the break-even for the selected good. */
  function detail(ctx, data, cid, reports) {
    var row = null;
    for (var i = 0; i < data.rows.length; i++) if (data.rows[i].id === cid) { row = data.rows[i]; break; }
    if (!row) return null;
    var basis = basisFor(row);
    var sa = systemAverage(ctx.sys, cid, ctx.t, ctx.adjust, basis);
    return { row: row, basis: basis, portAvg: meanOf(row.series, basis), sysAvg: sa.mean, sysN: sa.n,
             be: breakEven(ctx, row, reports) };
  }

  /* ---- the other systems ---------------------------------------------------
   * Which stars, nearest first; see NEAREST_CAP above. `lockStar` is
   * always included, so a break-even to a star has its report. */
  function candidates(ctx) {
    var Galaxy = global.Galaxy, here = ctx.here, gal = ctx.galaxy;
    if (!gal || !here) return [];
    var seen = {}, out = [];
    function add(st) {
      if (!st || st === here || seen[st.id]) return;
      seen[st.id] = true;
      out.push({ star: st, ly: Galaxy.distance3(here, st) });
    }
    var reach = Galaxy.reachable(gal, here, ctx.ship);
    for (var i = 0; i < reach.length && out.length < NEAREST_CAP; i++) add(reach[i].star);
    var vis = gal.stars.filter(function (s) { return ctx.visited[s.id] && s !== here && !seen[s.id]; })
      .map(function (s) { return { s: s, d: Galaxy.distance3(here, s) }; })
      .sort(function (a, b) { return a.d - b.d || (a.s.id < b.s.id ? -1 : 1); });
    for (var j = 0; j < vis.length && out.length < LIST_CAP; j++) add(vis[j].s);
    if (ctx.lock && ctx.lock.kind === 'star') add(ctx.lock.star);
    out.sort(function (a, b) { return a.ly - b.ly || (a.star.id < b.star.id ? -1 : 1); });
    return out;
  }

  /* One system's report, every good at once, as it stood when the report
   * left: now less the corridor's age. The best bid anywhere in it (where
   * you would sell) and the best ask with stock to load (where you would
   * buy), each with its port. `sys` is the cached system (main.js
   * systemFor), so these are the markets you would find on arrival, less
   * the time the news took. */
  function systemReport(sys, star, ly, now, adjust) {
    var Eco = eco(), age = reportAgeDays(ly), at = now - age * DAY, goods = {};
    var ports = (sys && sys.ports) || [];
    for (var i = 0; i < ports.length; i++) {
      var p = ports[i];
      if (!p.market || p.dark) continue;
      for (var j = 0; j < p.market.order.length; j++) {
        var cid = p.market.order[j], q = Eco.priceAt(p, cid, at);
        if (!q) continue;
        if (adjust) q = adjust(p, q);
        var g = goods[cid] || (goods[cid] = { bid: null, bidPort: null, ask: null, askPort: null, n: 0 });
        g.n++;
        if (q.sell !== null && (g.bid === null || q.sell > g.bid)) { g.bid = q.sell; g.bidPort = p.name; }
        if (q.buy !== null && q.stock >= 1 && (g.ask === null || q.buy < g.ask)) { g.ask = q.buy; g.askPort = p.name; }
      }
    }
    return { star: star, ly: ly, ageDays: age, at: at, goods: goods };
  }

  var TradeAnalyser = {
    WINDOW_DAYS: WINDOW_DAYS, STEP_H: STEP_H, SAMPLES: SAMPLES,
    NEAREST_CAP: NEAREST_CAP, LIST_CAP: LIST_CAP, REPORT_TONNES: REPORT_TONNES,
    reportHoursPerLy: reportHoursPerLy, reportAgeDays: reportAgeDays,
    history: history, meanMid: meanMid, meanOf: meanOf, basisFor: basisFor, systemAverage: systemAverage, rows: rows,
    route: route, build: build, detail: detail,
    tonnesFor: tonnesFor, fuelPrice: fuelPrice, trip: trip, breakEven: breakEven,
    candidates: candidates, systemReport: systemReport
  };
  global.TradeAnalyser = TradeAnalyser;
  if (typeof module !== 'undefined' && module.exports) module.exports = TradeAnalyser;
})(typeof window !== 'undefined' ? window : globalThis);
