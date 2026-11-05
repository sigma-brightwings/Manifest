/* tradingfirm.js — the import/export house on the concourse (2026-11-03).
 *
 * Astra: "Is there a way for me to tell my fleet to go buy low and sell
 * high on commodities X, Y, Z etc, and actually give the ship a budget, if
 * it increases the budget, the captain stays on. NPCs would need a
 * mercantile skill?" — and then: "we can add another NPC type, they're
 * kinda like the fixer, but civilian, and their job is a combination of
 * economist and import/export company". Inter-system: "both" (the firm's
 * ships jump, and you can read other systems' prices on the analyser).
 * "Trading firms measure their traders by the quarter year."
 *
 * So the mercantile skill is not a crew stat. It belongs to a FIRM — a
 * factor standing on a concourse — and it is a RATING, 1 to 5, which
 * decides how good the firm's information is:
 *
 *   - a low-rated house trades off stale boards, with a clerk's errors in
 *     them, at the top of the book (it does not price its own size);
 *   - a middling one knows the depth of a shelf — that forty tonnes moves
 *     a price — and reads the boards fresher;
 *   - a high-rated one reads FORECASTS (the market's closed form at the
 *     hour she will arrive, not the hour she leaves), gets a better price
 *     at the desk, and remembers what YOUR OWN FLEET has already done to a
 *     market, so two of your hulls do not both pile into the same glut.
 *
 * Better houses cost more commission, run more hulls, and a top one will
 * not open a small account ("not worth our time under 50,000").
 *
 * ---- THE ACCOUNT IS NOT YOUR PURSE ----------------------------------------
 * A budget is a deposit into the firm's account for your ships. Every buy,
 * sale and tank of jump fuel the firm makes comes out of and goes into that
 * account, and nothing else does: the only ways money crosses between it
 * and G.ship.credits are deposit(), withdraw() and the final remittance
 * when an account closes (which is a withdrawal of everything). A bad firm
 * can lose its budget — buys are capped at the cash it holds — and never
 * more. Profit stays in the account, so the budget grows; you take it out
 * at the office.
 *
 * ---- THE QUARTER ---------------------------------------------------------
 * Every QUARTER (91 game days) from the day the account opened, the firm's
 * equity — its cash, plus what the cargo aboard its hulls cost — is put
 * against where the quarter began, less what you put in or took out. A
 * profit renews the account and the firm takes its commission out of the
 * profit. A loss ends it: you drop them, or (a top house with a small
 * account) they drop you. One quarter is the whole verdict, as Astra put
 * it; the measurement of how often that sacks a GOOD firm is in the test
 * and the report, not assumed.
 *
 * ---- WHY NOTHING HERE TICKS (the rails doctrine) -------------------------
 * A traded hull is a timetable, like every other ship of yours under
 * orders: she sits at a port until a decision instant, buys, departs on a
 * closed-form leg (Fleet.planLeg in-system; Galaxy.jumpSeconds plus an
 * inbound cruise between stars), and sells at the instant she arrives.
 * Those instants are BOOKED, lazily, by book(G, t) — every frame for the
 * cheap case, and at any desk — and booking is EXACT and IDEMPOTENT:
 *
 *   - every due event of every hull and every quarterly review goes through
 *     ONE queue, in time order, ties broken by kind and id. So it does not
 *     matter which hull is booked first, or whether a month is booked in one
 *     call or thirty; the same seed and the same instructions give the same
 *     accounts to the credit. Booking twice books nothing the second time.
 *
 *   - the firm prices off the market's CLOSED FORM (Economy.analyticStock),
 *     plus the firm's OWN footprint, which it keeps itself in G.firms.foot
 *     and which is saved. It does not read the market's live stepped state
 *     or the player's ledger, because both depend on where the player was
 *     standing and neither survives a save — a firm that read them would
 *     trade differently after a reload than it would have without one. Its
 *     trades are ALSO pressed into the real market (Economy.applyTrade), so
 *     the dent a fleet of yours makes in a price is the one you see at the
 *     counter.
 *
 * Pure where it can be: who the firm is, and whether there is one at a
 * port, is a function of the system's seed and nothing else.
 */
(function (global) {
  'use strict';

  var DAY = 86400, HOUR = 3600;
  var QUARTER = 91 * DAY;
  /* LOADING, CLEARANCE AND FINDING THE CARGO: the turn at a clamp before
   * she casts off, by the kind of run. Matched to the traffic she shares
   * the lanes with (generate.js buildTraffic): a freighter on a local run
   * lies over 0.15–1.1 days, an interplanetary one 0.8–4 (measured over ten
   * home systems: median 1.9 h for the short ones, ~20 h at the 75th
   * percentile). The first draft turned every hull round in six hours, and
   * a sound house running one Kestrel hop-to-hop between two ports of one
   * world made 1.8 million a quarter off a 50,000 budget — the passive-
   * income trap the fleet's balance rule exists to stop (fleet.js, "THE
   * BRAKE IS TIME"). A firm's hull keeps the lanes' hours, not better ones. */
  var TURN_LOCAL = 12 * HOUR;      // between two ports of one world
  var TURN_SYSTEM = 1.5 * DAY;     // across the system
  var TURN_JUMP = 2 * DAY;         // out of it: papers for two governments
  var TURN = TURN_LOCAL;           // the least of them: first look after hand-over
  function turnFor(d, P) {
    P = P || FIRM_PACE;
    return d.kind === 'jump' ? P.turnJump : (d.leg && d.leg.local) ? P.turnLocal : P.turnSystem;
  }
  var FIRM_PACE = { turnLocal: TURN_LOCAL, turnSystem: TURN_SYSTEM, turnJump: TURN_JUMP };
  /* A firm that sees nothing worth doing waits a day and looks again: the
   * markets move on the scale of days (Economy row.periodS), so asking
   * every hour would be the same answer twenty-four times. */
  var WAIT = DAY;
  /* Clear of the port before a jump. A jump can be made from anywhere clear
   * of a world (tradeanalyser.js trip), so this is a clearance, not a leg. */
  var DEPART = HOUR;
  var BOOK_MAX = 20000;            // events in one call, a guard and nothing more
  var SLICES = 4;                  // a lot is priced as it moves the shelf
  var LOG_MAX = 10;

  /* ---- what a rating buys --------------------------------------------------
   * Index by rating, 1..5. The numbers are the design's ladder, and the
   * measurement that checks they come out in the right ORDER — a better
   * firm makes more per quarter — is tools/measure-firms.cjs and the
   * "rating changes outcomes" section of test/tradingfirm.test.js. */
  var STALE_DAYS  = [0, 5, 3, 1.5, 0.5, 0];        // how old the boards it reads are
  var NOISE       = [0, 0.10, 0.07, 0.045, 0.025, 0.01]; // a clerk's error on a read
  var EDGE        = [0, 0, 0.004, 0.008, 0.012, 0.016];  // better price at the desk
  var COMMISSION  = [0, 0.08, 0.10, 0.13, 0.17, 0.22];   // of a quarter's profit
  var MIN_ACCOUNT = [0, 0, 0, 5000, 20000, 50000];       // what it will open an account for
  var READING_FEE = [0, 120, 200, 350, 600, 900];        // the economist's reading
  var JUMP_STARS  = [0, 1, 2, 3, 3, 4];                  // how many other systems it trades into
  /* How much of YOUR FLEET'S OWN footprint in a far market the house has
   * noticed when it reads that market's board: none at the bottom, all of
   * it at the top ("notices when your own fleet has saturated a market").
   * The first draft gave every house below 4 none at all, and a sound house
   * sold 96 t of luxuries into the same glutted port three runs running,
   * at fifty thousand lost each time, until the account was gone — which
   * is not a worse house, it is a house with no memory. */
  var FOOT_SEEN = [0, 0, 0.25, 0.5, 1, 1];
  /* AND EVERY HOUSE REMEMBERS A LOSS. A run that lost money takes that good
   * to that port off its book for a week, whatever its rating: the clerk
   * who was burned does not need a forecast to know not to do it again. */
  var BURN_DAYS = 7;
  /* Idle quarters in a row before the account closes: one is a warning. */
  var IDLE_QUARTERS_MAX = 2;
  var DEPTH_FROM = 3;      // from this rating it prices its own size against the shelf
  var FORECAST_FROM = 4;   // from this rating it reads forecasts, and sees your own fleet's footprint
  var MARGIN_MIN = 150;    // cr: a run worth less than this is not worth the turn
  var MARGIN_FRAC = 0.04;  // ...nor one under 4% of what the load cost

  /* ---- what running a ship costs the account (Astra, 2026-11-03: "costs +
   * market depth") ----------------------------------------------------------
   * The first build measured no losing quarter in 520 and a Talon making
   * 1.65–3.35M a quarter off 20,000: the economy's own margins at the
   * lanes' pace, with nothing taken out but the cargo and the jump
   * hydrogen. Astra asked for the house to be reined in WITHOUT touching
   * your own margins at the counter, by two things a real house pays for:
   *
   *   RUNNING COSTS, charged to the account as they fall due —
   *     - the crew's wages, the same Crew.dailyWage the payroll pays, by the
   *       day (the fleet's payroll stops charging YOU for a hull on a
   *       house's book, from the day she was handed over);
   *     - a berth at every stop: the fleet's own weekly fee (a tank of
   *       hydrogen, capped at 1,500) by the day she is on the clamp, a day
   *       at least — the old exemption is gone;
   *     - insurance: a daily premium on the hull's list price for every day
   *       she is out, and a premium on the cargo per run;
   *     - fuel: the jump's hydrogen, as before. Reaction mass is not
   *       charged because nothing in the game charges for it — every clamp
   *       refills it free (fleet.js startWork, the player's own docking).
   *
   *   MARKET DEPTH — see TUNE.footHalfLife below, and the measurement that
   *   chose it.
   *
   * All of it is in TUNE so tools/measure-firms.cjs can try the
   * alternatives against the same seeds; the game never changes it. */
  var TUNE = {
    /* MARKET DEPTH, BOTH WAYS, MEASURED (tools/measure-firms.cjs depth and
     * sweep, 2026-11-03; numbers in CHANGELOG). Two knobs, each doing a
     * different job, and the house needs both:
     *
     *   footHalfLife — how long the house's OWN book remembers where it has
     *   been selling. The market forgets your trades and the house's on its
     *   own four days (Economy.LEDGER_HALFLIFE); the brokers, contracts and
     *   buyers who have learnt a house is coming remember longer. At 16 days
     *   a run repeating a lane inside a fortnight makes 0.65x a fresh one
     *   (0.93x at four days), so a rich lane flattens after a few runs and
     *   the house rotates — "so the house has to rotate routes". On its own
     *   it hardly moved the quarter (2.85M → 2.50M median at rating 4),
     *   because there are always other rich lanes to rotate to.
     *
     *   depthMul — how far the house's lot moves a shelf per tonne, against
     *   yours at 1: a house buys through brokers in announced lots, and the
     *   desk prices a known buyer accordingly. This is what cuts the quarter
     *   (x2, x3, x4: rating-5 median 2.16M, 1.51M, 1.30M), and it is where
     *   information shows: a house that prices its own size against the
     *   shelf (rating 3 up, DEPTH_FROM) buys a lot the shelf can bear; one
     *   that prices at the top of the book (1 and 2) overbuys, and at x4
     *   loses money in 62% (rating 1) and 12% (rating 2) of quarters, with
     *   real losses on real runs. x3 gave 12% and 6%. x4 it is: a back-
     *   street house is a bad bet, a small one a risky one, and a sound one
     *   steady. YOUR trades at the counter are untouched — this multiplies
     *   only the house's own view and its own execution.
     *
     *   x4 -> x1.7 (2026-11-04), RE-SWEPT after the economy retune
     *   (economy.js VALUE_REF, NEAR_SUPPLY). The margins the house lives on
     *   came down by about two thirds, and at x4 the bottom of the ladder
     *   stopped being a bad bet and became a certain one: rating 1 lost in
     *   98% of quarters and rating 2 in 86%. Same 20 seeds x 4 quarters,
     *   rating 1 / rating 2 losing quarters: x1 9% / 0%, x1.4 27% / 8%,
     *   x1.6 45% / 6%, x1.7 53% / 16%, x1.8 63% / 22%, x2 64% / 38%,
     *   x3 91% / 72%. x1.7 is the one that puts both back where x4 had
     *   them (62% and 12%), and ratings 3-5 still never lose. */
    footHalfLife: 16 * DAY,
    depthMul: 1.7,
    insHullDay: 0.0008,       // of the hull's list price, per day out of port
    insCargoRun: 0.02,        // of what the load cost, per run
    berthMinDays: 1
  };

  /* HOW A CONTRACT FLIES AND READS, in one place. A house's profile is its
   * rating's row of the ladder above. `c.hand` is MEASUREMENT ONLY
   * (tools/measure-firms.cjs baseline): the same decision rule handed what
   * a captain flying her own Talon has — the analyser's prices now, no
   * clerk, the counter's own price, your own footprint on the market's
   * four-day memory, a torch at full burn rather than a hired pilot's
   * throttle, an hour or two at each clamp, no wages to a house, no
   * commission. No contract the game makes ever sets it. */
  var HAND_PACE = { turnLocal: HOUR, turnSystem: 2 * HOUR, turnJump: 3 * HOUR };
  function prof(c) {
    if (c.hand) {
      return { stale: 0, noise: 0, edge: 0, footSeen: 1, depth: true, forecast: 0, jumps: 3,
               pace: HAND_PACE, speed: c.hand.speed || 1, costs: false,
               hl: (Eco() && Eco().LEDGER_HALFLIFE) || 4 * DAY, mul: 1 };
    }
    var r = clamp(c.rating | 0, 1, 5);
    return { stale: STALE_DAYS[r], noise: NOISE[r], edge: EDGE[r], footSeen: FOOT_SEEN[r], depth: r >= DEPTH_FROM,
             forecast: r >= 5 ? 1 : r >= FORECAST_FROM ? 0.5 : 0, jumps: JUMP_STARS[r],
             pace: FIRM_PACE, speed: 1, costs: true, hl: TUNE.footHalfLife, mul: TUNE.depthMul };
  }

  /* ---- placement -------------------------------------------------------------
   * "An office or concourse NPC at bigger civilian ports, more likely where
   * trade is busy and the law clean."
   *
   * MEASURED FIRST (doctrine 6; tools/measure-firms.cjs, 30 seeds × the six
   * nearest claimed stars, 2,690 ports): development runs 0.05–0.98 with a
   * median of 0.63; traffic routes touching a port run 3–77, median 32;
   * corruption is spread right across 0–100. So: a civilian port (not a
   * Navy or Syndicate livery, not an unmanned plant, not a milfuel works or
   * a fleet carrier) has a chance rising from nothing at development 0.4 to
   * full at 0.8, scaled by how busy its lanes are against 40 routes, cut by
   * up to three quarters by corruption and by half in a violent system.
   * PLACE_K 0.4 measures 1.34 firms per system, at 12.5% of civilian
   * ports, with 64% of systems having at least one — "you will usually
   * find one within a jump, and not at every port". */
  var PLACE_K = 0.4;
  var DEV_FLOOR = 0.4, DEV_FULL = 0.8, ROUTES_FULL = 40;

  /* ---- a private hash, so no draw here moves anybody else's ---------------
   * The same mixer npc.js uses, keyed on its own prefix (doctrine 2): adding
   * a firm to a port consumes nothing from any stream the port, its market
   * or its people were drawn from. */
  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function draw(key, n) {
    var a = hash('tradingfirm|' + key + '|' + n) || 1;
    a = (a + 0x6D2B79F5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function Eco() { return global.Economy; }
  function FleetM() { return global.Fleet; }

  var FAMILY = ['Halden', 'Ruiz', 'Okoro', 'Marsh', 'Vance', 'Albescu', 'Tanaka', 'Moreau', 'Kowal', 'Achterberg',
                'Lindqvist', 'Abara', 'Castell', 'Fenwick', 'Ibarra', 'Quill', 'Sato', 'Rhee', 'Dumont', 'Petrakis',
                'Mbeki', 'Hollis', 'Varga', 'Ostrander'];
  var HOUSE = ['Import-Export', 'Trading Company', 'Mercantile', 'Factors', 'Commodities', 'Freight & Factoring'];

  function routesAt(sys, portId) {
    if (!sys._firmRoutes) {
      var cnt = {};
      (sys.traffic || []).forEach(function (r) {
        if (r.kind === 'fleet') return;
        cnt[r.from] = (cnt[r.from] || 0) + 1; cnt[r.to] = (cnt[r.to] || 0) + 1;
      });
      /* Not enumerable: a system is never saved, but a cache on it should
       * not show up in anything that walks its keys either. */
      Object.defineProperty(sys, '_firmRoutes', { value: cnt, enumerable: false, configurable: true });
    }
    return sys._firmRoutes[portId] || 0;
  }

  function civilian(port, sys) {
    if (!port || !port.market || port.dark || port.plant) return false;
    if (sys && sys.pirateHeld) return false;
    var liv = port.livery || 'civ';
    if (liv !== 'civ') return false;
    var role = port.market.role;
    return role !== 'milfuel' && role !== 'carrier';
  }

  /* The chance, and why — exported so the measurement and the test read the
   * same formula the game places firms with. */
  function placeChance(port, sys) {
    if (!civilian(port, sys)) return 0;
    var dev = port.market.dev || 0;
    var corr = (sys && sys.corruption) || 0, viol = (sys && sys.violence) || 0;
    return PLACE_K * clamp((dev - DEV_FLOOR) / (DEV_FULL - DEV_FLOOR), 0, 1) *
           clamp(routesAt(sys, port.id) / ROUTES_FULL, 0, 1.25) *
           (1 - 0.75 * corr / 100) * (viol > 30 ? 0.5 : 1);
  }

  function keyOf(port, sys) { return (sys && sys.seed) + '|' + (port && port.id); }

  /* The firm at this port, or null. Pure: the system's seed and the port. */
  function firmAt(port, sys) {
    if (!port || !sys) return null;
    var key = keyOf(port, sys);
    if (draw(key, 'here') >= placeChance(port, sys)) return null;
    return statsFor(key, port);
  }

  /* What the firm is, from its key. RATING leans on the port's development
   * — a rich port's house is more often a good one — and is otherwise a
   * draw. The first formula (u·3.2 + dev·2.2) was written to look right
   * and measured 9/33/28/28/3% over 241 placed firms: a first-rank house
   * almost never existed. This one measures 14/27/22/24/12%
   * (tools/measure-firms.cjs place 30). Capacity rises with rating;
   * commission is the ladder's, with a seeded half-point either way so two
   * firms of one rating are not clones. */
  function statsFor(key, port) {
    var dev = (port && port.market && port.market.dev) || 0.5;
    var rating = clamp(1 + Math.floor(draw(key, 'rating') * 4.0 + (dev - 0.6) * 2.5), 1, 5);
    var cap = clamp(1 + Math.floor(rating * 0.6 + draw(key, 'cap') * 1.5), 1, 5);
    var comm = Math.round((COMMISSION[rating] + (draw(key, 'comm') - 0.5) * 0.02) * 200) / 200;
    var a = FAMILY[Math.floor(draw(key, 'n1') * FAMILY.length)];
    var b = FAMILY[Math.floor(draw(key, 'n2') * FAMILY.length)];
    if (a === b) b = FAMILY[(FAMILY.indexOf(a) + 7) % FAMILY.length];
    var house = HOUSE[Math.floor(draw(key, 'house') * HOUSE.length)];
    return {
      key: key, portId: port ? port.id : null, portName: port ? port.name : '',
      name: a + ' & ' + b + ' ' + house, short: a + ' & ' + b,
      rating: rating, capacity: cap, commission: comm,
      minAccount: MIN_ACCOUNT[rating], readingFee: READING_FEE[rating]
    };
  }

  function ratingWord(r) {
    return ['', 'a back-street house', 'a small house', 'a sound house', 'a serious house', 'a first-rank house'][clamp(r | 0, 1, 5)];
  }

  /* ---- the book ------------------------------------------------------------ */
  function book0(G) {
    if (!G.firms || typeof G.firms !== 'object') G.firms = {};
    var F = G.firms;
    if (!Array.isArray(F.contracts)) F.contracts = [];
    if (!F.foot || typeof F.foot !== 'object') F.foot = {};
    if (!(F.seq >= 0)) F.seq = 0;
    return F;
  }
  function contracts(G) { return (G && G.firms && G.firms.contracts) || []; }
  function contractById(G, id) {
    var l = contracts(G);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  /* Your open account with THIS firm, if you have one. */
  function contractWith(G, firm) {
    if (!firm) return null;
    var l = contracts(G);
    for (var i = 0; i < l.length; i++) if (l[i].firmKey === firm.key && !l[i].closed) return l[i];
    return null;
  }
  function contractFor(G, rec) { return rec && rec.trade ? contractById(G, rec.trade.contract) : null; }
  function hullsOf(G, c) {
    var F = FleetM(), out = [];
    var l = F ? F.list(G) : [];
    for (var i = 0; i < l.length; i++) if (l[i].trade && l[i].trade.contract === c.id) out.push(l[i]);
    return out;
  }

  /* ---- prices, the firm's way ------------------------------------------------ */
  function starById(G, id) {
    var gal = G && G.galaxy;
    if (!gal || !gal.stars) return null;
    if (!gal._firmStarIdx) {
      var idx = {};
      gal.stars.forEach(function (s) { idx[s.id] = s; });
      Object.defineProperty(gal, '_firmStarIdx', { value: idx, enumerable: false, configurable: true });
    }
    return gal._firmStarIdx[id] || null;
  }
  function systemOf(G, starId) {
    if (G.here && G.here.id === starId && G.sys) return G.sys;
    var F = FleetM(), st = starById(G, starId);
    if (st && F && F.systemFor) return F.systemFor(st);
    return null;
  }

  function footKey(starId, port, cid) { return starId + '|' + Eco().marketKey(port) + '|' + cid; }
  /* The firm's own dent in a shelf at `t`: every trade it made there up to
   * then, forgotten on the market's own half-life. Positive is stock added. */
  function footAt(G, k, t, hl) {
    var l = G.firms && G.firms.foot && G.firms.foot[k];
    if (!l) return 0;
    var v = 0;
    hl = hl || Eco().LEDGER_HALFLIFE || 4 * DAY;
    for (var i = 0; i < l.length; i++) if (l[i][0] <= t) v += l[i][1] * Math.pow(0.5, (t - l[i][0]) / hl);
    return v;
  }
  function footAdd(G, k, t, q, hl) {
    var F = book0(G), l = F.foot[k] || (F.foot[k] = []);
    l.push([t, q]);
    /* Forgotten past twelve half-lives (1/4096 of the trade). Pruned at the
     * EVENT's time, never the caller's clock, so a month booked in one call
     * and in thirty prunes the same entries at the same moments. */
    hl = hl || Eco().LEDGER_HALFLIFE || 4 * DAY;
    while (l.length && l[0][0] < t - 12 * hl) l.shift();
  }

  function stockAt(G, starId, port, cid, t, withFoot, P) {
    var E = Eco(), row = port.market && port.market.rows[cid];
    if (!row) return null;
    var s = E.analyticStock(port, cid, t) +
            (withFoot ? withFoot * (P ? P.mul : 1) * footAt(G, footKey(starId, port, cid), t, P && P.hl) : 0);
    return clamp(s, 0, row.cap);
  }

  /* A lot of `qty` tonnes, priced slice by slice as it moves the shelf:
   * what it costs to buy (side +1) or fetches to sell (side -1). With
   * `depth` false the whole lot is priced at the top of the book, which is
   * how a firm that does not price its own size gets it wrong. */
  function lotValue(port, cid, stock0, qty, side, depth, mul) {
    var E = Eco(), row = port.market.rows[cid], tot = 0, m = mul || 1;
    var n = depth ? SLICES : 1, sl = qty / n, st = stock0;
    for (var i = 0; i < n; i++) {
      var q = E.quoteStock(port, cid, clamp(st, 0, row.cap));
      var each = side > 0 ? q.buy : q.sell;
      if (each === null || each === undefined) return null;
      tot += each * sl;
      st += side > 0 ? -sl * m : sl * m;
    }
    return tot;
  }

  /* What the firm BELIEVES a shelf is: its board, at its rating. The desk
   * she is standing at is not a board — it is the price in front of her,
   * true for every house (`atDesk`); the boards are everywhere else. */
  function believedStock(G, c, starId, port, cid, tNow, tAt, ly, atDesk) {
    var P = prof(c);
    if (atDesk) return stockAt(G, starId, port, cid, tNow, 1, P);
    var tq;
    if (P.forecast) tq = tNow + (tAt - tNow) * P.forecast;
    else {
      var TA = global.TradeAnalyser;
      var age = ly > 0 && TA && TA.reportAgeDays ? TA.reportAgeDays(ly) : 0;
      tq = tNow - (P.stale + age) * DAY;
    }
    return stockAt(G, starId, port, cid, tq, P.footSeen, P);
  }
  function clerkError(c, starId, port, cid, tNow, atDesk) {
    var P = prof(c);
    if (atDesk || !P.noise) return 1;
    var h = draw(c.firmKey, starId + '|' + port.id + '|' + cid + '|' + Math.floor(tNow / DAY));
    return 1 + P.noise * (2 * h - 1);
  }

  /* ---- the decision rule --------------------------------------------------- */
  function hullOf(rec) { var C = global.Combat; return C && C.HULLS ? C.HULLS[rec.hullId] : null; }
  function fitMass(rec) {
    var C = global.Combat, m = 0;
    for (var k in (rec.fit || {})) {
      var it = C && C.EQUIPMENT ? C.EQUIPMENT[rec.fit[k]] : null;
      if (it && it.mass) m += it.mass;
    }
    return m;
  }
  /* A record as the corridor sees her: dry hull and gear, full tanks, and
   * the load. NO FIT on the proxy on purpose — Slipspace would read a
   * military drive off it and halve the corridor while the firm buys
   * hydrogen; a firm runs her clean, and prices her that way. */
  function corridorProxy(rec, cid, qty) {
    var h = hullOf(rec), cargo = {};
    if (cid && qty > 0) cargo[cid] = qty;
    return { dryMass: (h ? h.dryMass : 40) + fitMass(rec), fuel: h ? h.fuelCap : 20,
             thrusterFuel: h ? h.thrusterCap : 12, cargo: cargo };
  }

  function legalGood(cid) {
    var E = Eco(), com = E.BY_ID[cid];
    return !!com && !com.contraband && !com.waste && cid !== E.MILFUEL_ID;
  }
  function wants(c, cid) { return legalGood(cid) && (!c.goods || !c.goods.length || c.goods.indexOf(cid) >= 0); }

  /* Where she could go from port A: every port of this system with a
   * market, and every port of the nearest JUMP_STARS[rating] claimed stars
   * a full tank reaches with a full hold. Travel times are the fleet's own
   * arithmetic: Fleet.planLeg in-system, and between stars the clearance,
   * Galaxy.jumpSeconds at her laden mass, and the cruise in from the drop.
   * Memoised per decision, keyed by star, so a reposition that asks the
   * same question from three ports pays for the systems once. */
  function destinations(G, c, rec, sysA, starA, A, localOnly) {
    var F = FleetM(), Gal = global.Galaxy, Gen = global.Gen, out = [], P = prof(c);
    var h = hullOf(rec), cap = h ? h.cargoCap : 0;
    sysA.ports.forEach(function (B) {
      if (B === A || !B.market || B.dark) return;
      var leg = F.planLeg(rec, sysA, B.id);
      out.push({ port: B, sys: sysA, star: starA, ly: 0, kind: 'local', travel: leg.cruise / P.speed, leg: leg });
    });
    var sa = localOnly ? null : starById(G, starA);
    if (!sa || !Gal || !G.galaxy) return out;
    var near = G.galaxy.stars.filter(function (s) { return s.id !== starA && s.factionId; })
      .map(function (s) { return { s: s, d: Gal.distance3(sa, s) }; })
      .filter(function (x) { return Gal.jumpFuel(corridorProxy(rec, 'x', cap), x.d) <= (h ? h.fuelCap : 0); })
      .sort(function (a, b) { return a.d - b.d || (a.s.id < b.s.id ? -1 : 1); })
      .slice(0, P.jumps);
    near.forEach(function (x) {
      var sysB = systemOf(G, x.s.id);
      if (!sysB || !sysB.ports) return;
      sysB.ports.forEach(function (B) {
        if (!B.market || B.dark) return;
        var rB = Gen.radiusAbout(B, sysB.root, sysB);
        var inbound = F.legTimes(rec, rB).cruise / P.speed;
        out.push({ port: B, sys: sysB, star: x.s.id, starName: x.s.name, ly: x.d, kind: 'jump',
                   inbound: inbound, rB: rB });
      });
    });
    return out;
  }

  /* The best run out of port A at instant td, as the firm sees it. */
  function bestCarry(G, c, rec, sysA, starA, A, td, dests, cash) {
    var E = Eco(), Gal = global.Galaxy;
    var P = prof(c);
    var h = hullOf(rec), cap = h ? h.cargoCap : 0, edge = P.edge, depth = P.depth;
    var best = null;
    var goods = A.market.order.filter(function (cid) {
      var row = A.market.rows[cid];
      return row && (row.exporter || cid === E.FUEL_ID) && wants(c, cid);
    });
    for (var gi = 0; gi < goods.length; gi++) {
      var cid = goods[gi];
      var stA = believedStock(G, c, starA, A, cid, td, td, 0, true);
      if (!(stA >= 2)) continue;
      var askTop = E.quoteStock(A, cid, stA).buy;
      if (askTop === null) continue;
      var errA = 1;
      for (var di = 0; di < dests.length; di++) {
        var d = dests[di], B = d.port;
        if (!B.market.rows[cid]) continue;
        if (c.burnt && c.burnt[d.star + '|' + B.id + '|' + cid] > td) continue;
        var travel, fuelT = 0, fuelCr = 0, qty0 = Math.floor(Math.min(cap, stA - 1));
        if (d.kind === 'jump') {
          var px = corridorProxy(rec, cid, qty0);
          fuelT = Gal.jumpFuel(px, d.ly);
          fuelCr = fuelT * hydrogenAsk(A, td);
          travel = DEPART + Gal.jumpSeconds(d.ly, px) + d.inbound;
        } else travel = d.travel;
        var spend = cash - fuelCr;
        if (spend <= 0) continue;
        var qty = Math.floor(Math.min(qty0, spend / (askTop * (1 - edge) * errA * 1.02)));
        if (qty < 1) continue;
        var turn = turnFor(d, P.pace), tA = td + turn + travel;
        var stB = believedStock(G, c, d.star, B, cid, td, tA, d.ly);
        if (stB === null) continue;
        var buyV = lotValue(A, cid, stA, qty, +1, depth, P.mul), sellV = lotValue(B, cid, stB, qty, -1, depth, P.mul);
        if (buyV === null || sellV === null) continue;
        buyV *= errA * (1 - edge);
        sellV *= clerkError(c, d.star, B, cid, td) * (1 + edge);
        /* What the run will cost to run, as well as what the load costs:
         * a house that did not count its own wages and premiums would take
         * every thin run and lose on each. */
        var profit = sellV - buyV - fuelCr - (P.costs ? runCosts(rec, turn, travel, buyV) : 0);
        if (profit < Math.max(MARGIN_MIN, MARGIN_FRAC * buyV)) continue;
        var rate = profit / (turn + travel);
        if (!best || rate > best.rate + 1e-9) {
          best = { kind: 'carry', cid: cid, qty: qty, dest: d, travel: travel, fuelT: fuelT,
                   estProfit: profit, rate: rate, tA: tA, turn: turn };
        }
      }
    }
    return best;
  }

  function hydrogenAsk(port, t) {
    var E = Eco(), q = port.market && port.market.rows[E.FUEL_ID] ? E.quoteStock(port, E.FUEL_ID, E.analyticStock(port, E.FUEL_ID, t)) : null;
    return q && q.buy ? q.buy : E.BY_ID[E.FUEL_ID].base;
  }

  /* Nothing worth carrying from here: is there a port in THIS system she
   * should run to empty, because the run out of it is worth the trip? Only
   * in-system — a jump with an empty hold is the firm's money spent on
   * hydrogen to look at a market it could have read off a report. */
  function bestReposition(G, c, rec, sysA, starA, A, td, cash) {
    var F = FleetM(), best = null;
    var ports = sysA.ports.filter(function (C) { return C !== A && C.market && !C.dark; });
    for (var i = 0; i < ports.length; i++) {
      var C = ports[i];
      var leg = F.planLeg(rec, sysA, C.id);
      var P = prof(c), hop = { kind: 'local', leg: leg }, cruise = leg.cruise / P.speed;
      var tC = td + turnFor(hop, P.pace) + cruise;
      var ghost = {};
      for (var k in rec) ghost[k] = rec[k];
      ghost.port = C.id;
      var localDests = destinations(G, c, ghost, sysA, starA, C, true);
      var b = bestCarry(G, c, ghost, sysA, starA, C, tC, localDests, cash);
      if (!b) continue;
      var hopCost = P.costs ? runCosts(rec, turnFor(hop, P.pace), cruise, 0) : 0;
      var rate = (b.estProfit - hopCost) / (turnFor(hop, P.pace) + cruise + b.turn + b.travel);
      if (rate > 0 && (!best || rate > best.rate + 1e-9)) best = { kind: 'reposition', dest: { port: C, sys: sysA, star: starA, ly: 0, kind: 'local', travel: cruise, leg: leg }, travel: cruise, rate: rate, then: b.cid };
    }
    return best;
  }

  /* ---- doing it -------------------------------------------------------------- */
  /* The lot, at the desk, at the instant: the closed form plus the firm's
   * own footprint (which it always KNOWS about when it trades — what it may
   * not know is what it did a week ago when it is DECIDING), sliced through
   * the shelf, and the desk's edge. Pressed into the footprint and into the
   * real market both. Returns cr, or null. */
  function execute(G, c, starId, sys, port, cid, qty, t, side, maxCr) {
    var E = Eco();
    var P = prof(c);
    var st = stockAt(G, starId, port, cid, t, 1, P);
    if (st === null) return null;
    if (side > 0) qty = Math.min(qty, Math.floor(st - 0.5));
    if (!(qty > 0)) return null;
    var mul = side > 0 ? (1 - P.edge) : (1 + P.edge);
    var v = lotValue(port, cid, st, qty, side, true, P.mul);
    if (v === null) return null;
    /* NEVER PAST THE CASH. Priced first, committed after: if the slices
     * through the shelf come to more than the account holds, the lot is
     * cut until it fits — a firm can lose its budget, never more. */
    if (maxCr !== undefined) {
      while (qty > 0 && v * mul > maxCr) {
        qty = Math.floor(qty * Math.min(0.95, maxCr / (v * mul)));
        v = qty > 0 ? lotValue(port, cid, st, qty, side, true, P.mul) : 0;
      }
      if (!(qty > 0)) return null;
    }
    footAdd(G, footKey(starId, port, cid), t, side > 0 ? -qty : qty, P.hl);
    E.applyTrade(port, cid, side > 0 ? qty : -qty, t);
    return { cr: Math.round(v * mul), qty: qty };
  }

  function lineOut(G, out, text) { out.push(text); }
  function goodName(cid) { var E = Eco(), c = E && E.BY_ID[cid]; return c ? c.name.toLowerCase() : cid; }
  function cr(n) { return Math.round(n).toLocaleString('en-US') + ' cr'; }
  function pilotOf(rec) { var F = FleetM(); return F && F.pilotOf ? F.pilotOf(rec) : null; }
  function logLeg(c, text) {
    c.log = c.log || [];
    c.log.unshift(text);
    if (c.log.length > LOG_MAX) c.log.length = LOG_MAX;
  }

  /* ---- the running costs --------------------------------------------------- */
  function wagesPerDay(rec) {
    var Cr = global.Crew, w = 0;
    if (!Cr || !Cr.dailyWage) return 0;
    (rec.crew || []).forEach(function (m) { w += Cr.dailyWage(m) || 0; });
    return w;
  }
  function berthPerDay(rec) { var F = FleetM(); return F && F.berthFee ? F.berthFee(rec) / 7 : 0; }
  function hullPrice(rec) { var h = hullOf(rec); return h ? h.price || 0 : 0; }
  /* What a run of `turn` at the clamp and `travel` under way will cost to
   * run, on a load that cost `cargo`: the estimate the decision rule uses,
   * and the same arithmetic the charges below make. */
  function runCosts(rec, turn, travel, cargo) {
    return wagesPerDay(rec) * (turn + travel) / DAY +
           berthPerDay(rec) * Math.max(TUNE.berthMinDays, turn / DAY) +
           hullPrice(rec) * TUNE.insHullDay * travel / DAY +
           (cargo || 0) * TUNE.insCargoRun;
  }
  /* Out of the cash, and what the cash cannot cover is owed — taken from
   * the next sale, and counted off the equity meanwhile. Never below 0. */
  function charge(c, amt, kind) {
    /* Whole credits, so the account never carries a fraction it could not
     * hand back. */
    amt = Math.round(amt);
    if (!(amt > 0)) return 0;
    var pay = Math.min(amt, Math.max(0, c.cash));
    c.cash -= pay;
    c.owed = (c.owed || 0) + (amt - pay);
    c.spent = c.spent || {};
    c.spent[kind] = Math.round(((c.spent[kind] || 0) + amt) * 100) / 100;
    return amt;
  }
  /* The crew are paid by the day to the instant, from the account, from
   * the moment she was handed over (fleet.js settle stops charging you). */
  function payWages(c, rec, t) {
    var tr = rec.trade, P = prof(c);
    if (tr.wagesTo == null) tr.wagesTo = tr.since != null ? tr.since : t;
    var amt = P.costs && t > tr.wagesTo ? wagesPerDay(rec) * (t - tr.wagesTo) / DAY : 0;
    tr.wagesTo = Math.max(tr.wagesTo, t);
    return charge(c, amt, 'wages');
  }

  function decide(G, c, rec, td, out) {
    var tr = rec.trade;
    payWages(c, rec, td);
    /* AN EMPTY ACCOUNT STOPS. Wages and berths keep falling due on a hull
     * with nothing worth carrying, and an account run dry would otherwise
     * go on running up a debt nobody can pay: a house can lose its budget,
     * never more. So at the first decision with no cash left the account
     * closes, the way a quarter's loss closes it. */
    /* EMPTY means nothing left at all — not cash spent on a load another
     * of its hulls is carrying (the first draft read c.cash, and a house
     * whose Talon had just spent the budget on computers closed its own
     * account at the Kestrel's next look). */
    if (!c.closing && equity(G, c) <= 0 && !c.hand) {
      c.closing = { at: td, why: 'empty' };
      c.nextReview = null;
      var te = c.firmShort + ': the account is empty — the house stands its hulls down and closes it.';
      lineOut(G, out, te); journal(G, te);
    }
    if (c.closing) return release(G, c, rec, td, out, null);
    if (!pilotOf(rec)) return release(G, c, rec, td, out, 'nobody aboard can helm her');
    var sysA = systemOf(G, rec.star);
    var A = sysA && sysA.byId ? sysA.byId[rec.port] : null;
    if (!A || !A.market) return release(G, c, rec, td, out, 'her port is gone from the book');
    var dests = destinations(G, c, rec, sysA, rec.star, A);
    var plan = bestCarry(G, c, rec, sysA, rec.star, A, td, dests, c.cash);
    if (!plan) plan = bestReposition(G, c, rec, sysA, rec.star, A, td, c.cash);
    if (!plan) {
      /* A day on the clamp, paid for like any other. */
      if (prof(c).costs) charge(c, berthPerDay(rec) * WAIT / DAY, 'berth');
      tr.phase = 'idle'; tr.next = td + WAIT; tr.waits = (tr.waits || 0) + 1;
      return;
    }
    var d = plan.dest, leg = {
      kind: d.kind, from: A.id, fromName: A.name, fromStar: rec.star,
      to: d.port.id, toName: d.port.name, toStar: d.star, toStarName: d.starName || rec.starName || null,
      depart: td + turnFor(d, prof(c).pace), cid: null, qty: 0, cost: 0, fuelCr: 0, costs: 0
    };
    if (plan.kind === 'carry') {
      if (d.kind === 'jump') {
        /* The jump's hydrogen, bought at A out of the account first, so the
         * load is cut to what the cash left over buys. */
        var fuel = execute(G, c, rec.star, sysA, A, Eco().FUEL_ID, Math.max(1, Math.ceil(plan.fuelT)), td, +1, Math.floor(c.cash));
        if (!fuel || fuel.qty < plan.fuelT) {
          /* A port with too little hydrogen on the shelf (or an account
           * too thin to pay for it) does not send her into the corridor
           * on half a tank: she waits a day. */
          tr.phase = 'idle'; tr.next = td + WAIT; return;
        }
        var fcr = fuel.cr;
        c.cash -= fcr; leg.fuelCr = fcr;
      }
      var got = execute(G, c, rec.star, sysA, A, plan.cid, plan.qty, td, +1, Math.floor(c.cash));
      if (!got) {
        /* The load would not fill after the hydrogen was bought: the
         * hydrogen goes back across the same desk at the same instant (at
         * the bid, so the spread is the house's loss), rather than being
         * paid for and left in a tank she never jumps on. */
        if (leg.fuelCr) {
          var back = execute(G, c, rec.star, sysA, A, Eco().FUEL_ID, Math.max(1, Math.ceil(plan.fuelT)), td, -1);
          if (back) c.cash += back.cr;
        }
        tr.phase = 'idle'; tr.next = td + WAIT; return;
      }
      c.cash -= got.cr;
      rec.cargo = {}; rec.cargo[plan.cid] = got.qty;
      leg.cid = plan.cid; leg.qty = got.qty; leg.cost = got.cr; leg.estProfit = Math.round(plan.estProfit);
      tr.basis = got.cr;
    }
    if (d.kind === 'local') {
      leg.parentId = d.leg.parentId; leg.local = d.leg.local; leg.distance = d.leg.distance;
      leg.cruise = d.travel; leg.t0 = leg.depart;
      leg.arrive = leg.depart + d.travel;
    } else {
      var px = corridorProxy(rec, leg.cid, leg.qty);
      leg.jump = global.Galaxy.jumpSeconds(d.ly, px);
      leg.ly = d.ly; leg.inbound = d.inbound;
      leg.t0 = leg.depart;
      leg.arrive = leg.depart + DEPART + leg.jump + d.inbound;
    }
    /* The clamp for the turn, and the premiums for the run. Charged at
     * the clamp, when they are known, like the fuel. */
    if (prof(c).costs) {
      var turnS = leg.depart - td, outS = leg.arrive - leg.depart;
      leg.costs += charge(c, berthPerDay(rec) * Math.max(TUNE.berthMinDays, turnS / DAY), 'berth');
      leg.costs += charge(c, hullPrice(rec) * TUNE.insHullDay * outS / DAY + leg.cost * TUNE.insCargoRun, 'insurance');
      leg.costs += wagesPerDay(rec) * (leg.arrive - td) / DAY;   // for the log; paid as it falls due
    }
    tr.phase = 'leg'; tr.leg = leg; tr.next = leg.arrive; tr.waits = 0;
  }

  function arrive(G, c, rec, ta, out) {
    var tr = rec.trade, leg = tr.leg;
    payWages(c, rec, ta);
    var sysB = systemOf(G, leg.toStar);
    var B = sysB && sysB.byId ? sysB.byId[leg.to] : null;
    rec.port = leg.to; rec.portName = leg.toName;
    rec.star = leg.toStar; if (leg.toStarName) rec.starName = leg.toStarName;
    var gross = 0;
    if (leg.cid && leg.qty > 0 && B) {
      var got = execute(G, c, leg.toStar, sysB, B, leg.cid, leg.qty, ta, -1);
      gross = got ? got.cr : 0;
    }
    c.cash += gross;
    /* A commission the cash could not cover at the review is owed, and
     * taken out of the next sale. */
    if (c.owed > 0) { var pay = Math.min(c.owed, c.cash); c.cash -= pay; c.owed -= pay; }
    var net = gross - leg.cost - leg.fuelCr - (leg.costs || 0);
    if (leg.cid) {
      c.legs = (c.legs || 0) + 1;
      if (leg.kind === 'jump') c.jumps = (c.jumps || 0) + 1;
      logLeg(c, rec.name + ': ' + leg.qty + ' t ' + goodName(leg.cid) + ' ' + leg.fromName + ' → ' + leg.toName +
                (leg.kind === 'jump' ? ' (' + (leg.toStarName || 'another star') + ')' : '') +
                '  ' + (net >= 0 ? '+' : '') + cr(net));
      if (c.legs === 1) {
        lineOut(G, out, c.firmShort + ': the ' + rec.name + '\'s first run is in — ' + leg.qty + ' t of ' +
                goodName(leg.cid) + ' sold at ' + leg.toName + ', ' + (net >= 0 ? '+' : '') + cr(net));
      }
    }
    if (leg.cid && net < 0) {
      c.burnt = c.burnt || {};
      c.burnt[leg.toStar + '|' + leg.to + '|' + leg.cid] = ta + BURN_DAYS * DAY;
      for (var bk in c.burnt) if (c.burnt[bk] <= ta) delete c.burnt[bk];
    }
    /* MEASUREMENT ONLY: tools/measure-firms.cjs asks for every run, to see
     * how fast a lane flattens. Nothing in the game sets it. */
    if (c.traceRuns && leg.cid) c.traceRuns.push([ta, leg.fromStar + '|' + leg.from, leg.toStar + '|' + leg.to, leg.cid, Math.round(net)]);
    tr.made = (tr.made || 0) + net;
    tr.runs = (tr.runs || 0) + (leg.cid ? 1 : 0);
    tr.last = leg;
    rec.cargo = {}; tr.basis = 0; tr.leg = null;
    if (c.closing) return release(G, c, rec, ta, out, null);
    /* She sells on arrival and the house looks at its boards at once: the
     * turn before she casts off again is charged on the NEXT run, by the
     * kind of run it is. */
    tr.phase = 'idle'; tr.next = ta;
  }

  /* She is handed back: off the firm's book, on a clamp at the port she is
   * at, with her berth clock starting now. */
  function release(G, c, rec, t, out, why) {
    /* Her wages to the instant, from the account; from now on the payroll
     * at your desk pays them again, and her berth clock starts here. */
    payWages(c, rec, t);
    rec.trade = null;
    rec.berthTo = t;
    rec.wagesTo = t;
    c.hulls = (c.hulls || []).filter(function (id) { return id !== rec.id; });
    var F = FleetM();
    if (F && F.forgetRoute) F.forgetRoute(rec.id);
    lineOut(G, out, rec.name + ' stands down from ' + c.firmShort + ' at ' + (rec.portName || 'her port') +
            (why ? ' — ' + why : ''));
    if (c.closing && !c.hulls.length) finalize(G, c, t, out);
  }

  /* What the firm is worth to you at `t`: cash, plus what the loads aboard
   * its hulls cost (cost basis — not a guess at what they will fetch). */
  function equity(G, c) {
    var e = c.cash;
    hullsOf(G, c).forEach(function (rec) { e += (rec.trade && rec.trade.basis) || 0; });
    return e - (c.owed || 0);
  }

  function journal(G, text) {
    var J = global.Journal;
    if (J && J.add) J.add(G, 'trade', text);
  }

  function review(G, c, tq, out) {
    var eq = equity(G, c);
    var profit = Math.round(eq - c.qStart - c.qFlows);
    var entry = { q: c.qNo, from: c.qFrom, to: tq, start: Math.round(c.qStart), end: Math.round(eq),
                  flows: Math.round(c.qFlows), profit: profit, commission: 0, verdict: null };
    c.history = c.history || [];
    /* IDLE: no run sold all quarter. With running costs an idle quarter is
     * a small loss (wages and berths while she waits for something worth
     * carrying), but it is not the house LOSING money on a trade, and
     * Astra's call (2026-11-03) was a warning, not the sack: "warning only"
     * for an idle quarter; only an actual loss ends it. */
    var idle = (c.legs || 0) === (c.qLegs0 || 0);
    entry.runs = (c.legs || 0) - (c.qLegs0 || 0);
    if (profit > 0) {
      c.idleRun = 0;
      var comm = Math.round(profit * c.commission);
      var take = Math.min(comm, Math.max(0, c.cash));
      c.cash -= take; c.owed = (c.owed || 0) + (comm - take);
      entry.commission = comm; entry.verdict = 'renewed';
      c.qStart = eq - comm; c.qFlows = 0; c.qFrom = tq; c.qNo++; c.qLegs0 = c.legs || 0;
      c.nextReview = tq + QUARTER;
      var t1 = c.firmShort + ', quarter ' + entry.q + ': +' + cr(profit) + ' on the account, ' + cr(comm) +
               ' commission — renewed. The account stands at ' + cr(equity(G, c)) + '.';
      lineOut(G, out, t1); journal(G, t1);
    } else if (idle && (c.idleRun || 0) < IDLE_QUARTERS_MAX - 1) {
      /* A WARNING. The quarter rolls on from here, with no commission (there
       * is no profit to take it from). */
      c.idleRun = (c.idleRun || 0) + 1;
      entry.verdict = 'warned';
      c.qStart = eq; c.qFlows = 0; c.qFrom = tq; c.qNo++; c.qLegs0 = c.legs || 0;
      c.nextReview = tq + QUARTER;
      var tw = c.firmShort + ', quarter ' + entry.q + ': nothing carried, ' + cr(profit) + ' in running costs — a WARNING. ' +
               'Another idle quarter and the account closes.';
      lineOut(G, out, tw); journal(G, tw);
    } else if (idle) {
      /* A SECOND IDLE QUARTER IN A ROW ENDS IT. Six months with nothing
       * worth carrying is not a slow season — the markets cycle over
       * weeks (Economy row.periodS), so one dead quarter can be bad luck
       * on a narrow goods list, two is the list or the house — and the
       * account has been paying her wages and her berths the whole time.
       * Measured (tools/measure-firms.cjs onegood): see CHANGELOG. */
      c.idleRun = (c.idleRun || 0) + 1;
      entry.verdict = 'idle-twice';
      c.closing = { at: tq, why: 'idle' };
      c.nextReview = null;
      var ti = c.firmShort + ', quarter ' + entry.q + ': a second quarter with nothing carried — the account closes. ' +
               'Their hulls stand down.';
      lineOut(G, out, ti); journal(G, ti);
    } else {
      /* THE VERDICT. Astra's rule is the captain's: if it does not increase
       * the budget, they are off. Who says so depends on who has the
       * leverage — a first-rank house with a small account drops YOU. */
      var theyDrop = c.rating >= 4 && eq < 2 * (c.minAccount || 0);
      entry.verdict = theyDrop ? 'dropped-you' : 'dropped';
      c.closing = { at: tq, why: entry.verdict };
      c.nextReview = null;
      var t2 = c.firmShort + ', quarter ' + entry.q + ': ' + (profit === 0 ? 'nothing made' : cr(profit) + ' on the account') +
               (theyDrop ? ' — and they drop you: "we cannot carry an account this size at a loss."'
                         : ' — you drop them, as the contract says. Their hulls stand down after the runs they are on.');
      lineOut(G, out, t2); journal(G, t2);
    }
    c.history.push(entry);
    if (c.history.length > 12) c.history.shift();
    if (c.closing) {
      hullsOf(G, c).forEach(function (rec) { if (rec.trade.phase !== 'leg') release(G, c, rec, tq, out, null); });
      if (!c.hulls.length && !c.closed) finalize(G, c, tq, out);
    }
  }

  /* The account closes: any profit since the last review pays its
   * commission, what is owed is paid, and the balance is remitted to you.
   * This is the one place, besides withdraw(), where the account's money
   * reaches your credits — it IS a withdrawal, of everything. */
  function finalize(G, c, t, out) {
    if (c.closed) return;
    var eq = equity(G, c), profit = Math.round(eq - c.qStart - c.qFlows);
    if (profit > 0 && c.closing && c.closing.why === 'you') {
      var comm = Math.round(profit * c.commission);
      c.owed = (c.owed || 0) + comm;
    }
    var pay = Math.min(c.owed || 0, c.cash); c.cash -= pay; c.owed = 0;
    var remit = Math.max(0, Math.round(c.cash));
    moveToPlayer(G, c, remit);
    c.closed = true; c.closedAt = t;
    var t3 = c.firmShort + ' closes your account and remits ' + cr(remit) + '.';
    lineOut(G, out, t3); journal(G, t3);
  }

  function moveToPlayer(G, c, amt) {
    c.cash -= amt;
    c.withdrawn = (c.withdrawn || 0) + amt;
    if (G.ship) G.ship.credits = (G.ship.credits || 0) + amt;
  }

  /* ---- booking ---------------------------------------------------------------
   * Every due event, in one queue, in time order. Ties: a hull's event
   * before a review at the same instant (a sale that lands on the stroke of
   * the quarter counts in it), then by id. Returns lines to be said. */
  function book(G, T) {
    var out = [];
    if (!G || !G.firms || !G.firms.contracts || !G.firms.contracts.length) return out;
    var F = FleetM();
    var n = 0;
    while (n++ < BOOK_MAX) {
      var bestT = Infinity, bestKind = 2, bestId = '', bestRec = null, bestC = null;
      var l = F ? F.list(G) : [];
      for (var i = 0; i < l.length; i++) {
        var rec = l[i], tr = rec.trade;
        if (!tr || !(tr.next <= T)) continue;
        if (tr.next < bestT || (tr.next === bestT && (bestKind > 0 || rec.id < bestId))) {
          bestT = tr.next; bestKind = 0; bestId = rec.id; bestRec = rec; bestC = null;
        }
      }
      var cs = G.firms.contracts;
      for (var j = 0; j < cs.length; j++) {
        var c = cs[j];
        if (c.closed || c.nextReview == null || !(c.nextReview <= T)) continue;
        if (c.nextReview < bestT || (c.nextReview === bestT && bestKind === 1 && c.id < bestId)) {
          bestT = c.nextReview; bestKind = 1; bestId = c.id; bestC = c; bestRec = null;
        }
      }
      if (bestT === Infinity) break;
      if (bestRec) {
        var con = contractById(G, bestRec.trade.contract);
        if (!con || con.closed) { bestRec.trade = null; continue; }
        if (bestRec.trade.phase === 'leg') arrive(G, con, bestRec, bestT, out);
        else decide(G, con, bestRec, bestT, out);
      } else review(G, bestC, bestT, out);
    }
    return out;
  }

  /* ---- the refusals, in words ------------------------------------------------ */
  function hullRefusal(G, rec, firm, starId) {
    if (!rec) return 'no such ship';
    if (rec.partner) return 'the ' + rec.name + ' is ' + rec.partner.name + '\'s ship — not yours to hand to a firm';
    if (rec.trade) return 'the ' + rec.name + ' already trades for ' + ((contractFor(G, rec) || {}).firmShort || 'a firm');
    if (rec.order) return 'the ' + rec.name + ' is under way';
    if (rec.work) return 'the ' + rec.name + ' is working ' + rec.work.siteName + ' — recall her first';
    var here = rec.star || (G.here && G.here.id);
    if (here !== starId) return 'the ' + rec.name + ' is at ' + (rec.portName || 'another port') + ', ' +
                                (rec.starName || 'another star') + ' — she has to be in this system';
    if (!pilotOf(rec)) return 'nobody aboard the ' + rec.name + ' can helm her';
    if (rec.arrears > 0) return 'the harbour holds the ' + rec.name + ' for ' + rec.arrears + ' cr of berthing';
    var h = hullOf(rec);
    if (!h || !(h.cargoCap > 0)) return 'the ' + rec.name + ' has no hold to trade with';
    var tons = 0;
    for (var k in (rec.cargo || {})) tons += rec.cargo[k] || 0;
    if (tons > 0) return 'the ' + rec.name + ' has ' + Math.round(tons) + ' t aboard — the firm trades its own account, unload her first';
    return null;
  }

  /* Could you open an account here on these terms? { ok } or { ok:false, why }. */
  function canEngage(G, firm, port, sys, terms) {
    terms = terms || {};
    if (!firm) return { ok: false, why: 'there is no trading house at this port' };
    if (contractWith(G, firm)) return { ok: false, why: 'you already hold an account with ' + firm.short };
    var ids = terms.hulls || [];
    if (!ids.length) return { ok: false, why: 'hand them at least one ship' };
    if (ids.length > firm.capacity) return { ok: false, why: firm.short + ' runs ' + firm.capacity + ' hull' +
                                                      (firm.capacity > 1 ? 's' : '') + ' at most — their book is full' };
    var budget = Math.round(terms.budget || 0);
    if (!(budget > 0)) return { ok: false, why: 'name a budget' };
    if (budget < firm.minAccount) return { ok: false, why: '"Not worth our time under ' + firm.minAccount.toLocaleString('en-US') + '."' };
    if (!G.ship || (G.ship.credits || 0) < budget) return { ok: false, why: 'you have ' + Math.round((G.ship && G.ship.credits) || 0).toLocaleString('en-US') + ' cr' };
    var starId = (G.here && G.here.id) || null;
    var F = FleetM();
    for (var i = 0; i < ids.length; i++) {
      var why = hullRefusal(G, F.byId(G, ids[i]), firm, starId);
      if (why) return { ok: false, why: why };
    }
    var goods = terms.goods || [];
    for (var g = 0; g < goods.length; g++) {
      if (!legalGood(goods[g])) return { ok: false, why: goodName(goods[g]) + ' is not a good an honest house will touch' };
    }
    return { ok: true };
  }

  function engage(G, firm, port, sys, terms, t) {
    var ok = canEngage(G, firm, port, sys, terms);
    if (!ok.ok) return ok;
    book(G, t);
    var F0 = book0(G), Fl = FleetM();
    var budget = Math.round(terms.budget);
    var c = {
      id: 'tf' + (++F0.seq), firmKey: firm.key, firmName: firm.name, firmShort: firm.short,
      rating: firm.rating, commission: firm.commission, capacity: firm.capacity, minAccount: firm.minAccount,
      star: (G.here && G.here.id) || null, starName: (G.here && G.here.name) || null,
      portId: port.id, portName: port.name,
      goods: (terms.goods || []).slice().sort(),
      hulls: [], cash: 0, owed: 0, deposited: 0, withdrawn: 0,
      t0: t, qNo: 1, qLegs0: 0, idleRun: 0, qFrom: t, qStart: budget, qFlows: 0, nextReview: t + QUARTER,
      history: [], log: [], legs: 0, closing: null, closed: false
    };
    G.ship.credits -= budget;
    c.cash = budget; c.deposited = budget;
    F0.contracts.push(c);
    terms.hulls.slice().sort().forEach(function (id) { attach(G, c, Fl.byId(G, id), t); });
    var line = 'Account opened with ' + firm.name + ': ' + cr(budget) + ', ' + c.hulls.length + ' hull' +
               (c.hulls.length > 1 ? 's' : '') + ', reviewed every quarter at ' + Math.round(c.commission * 100) + '% of the profit.';
    journal(G, line);
    return { ok: true, contract: c, line: line };
  }

  function attach(G, c, rec, t) {
    rec.star = rec.star || (G.here && G.here.id) || null;
    if (!rec.starName && G.here) rec.starName = G.here.name;
    rec.trade = { contract: c.id, phase: 'idle', next: t + TURN, leg: null, basis: 0, made: 0, runs: 0, since: t, wagesTo: t };
    c.hulls.push(rec.id);
    var F = FleetM();
    if (F && F.forgetRoute) F.forgetRoute(rec.id);
  }

  function canAddHull(G, c, rec) {
    if (!c || c.closed) return { ok: false, why: 'you hold no open account here' };
    if (c.closing) return { ok: false, why: 'the account is closing' };
    if (c.hulls.length >= c.capacity) return { ok: false, why: c.firmShort + ' runs ' + c.capacity + ' hull' +
                                                  (c.capacity > 1 ? 's' : '') + ' at most — their book is full' };
    var why = hullRefusal(G, rec, null, c.star);
    return why ? { ok: false, why: why } : { ok: true };
  }
  function addHull(G, c, rec, t) {
    book(G, t);
    var ok = canAddHull(G, c, rec);
    if (!ok.ok) return ok;
    attach(G, c, rec, t);
    return { ok: true };
  }

  function canDeposit(G, c, amt) {
    if (!c || c.closed) return { ok: false, why: 'you hold no open account here' };
    if (c.closing) return { ok: false, why: 'the account is closing' };
    if (!(amt > 0)) return { ok: false, why: 'name an amount' };
    if (!G.ship || G.ship.credits < amt) return { ok: false, why: 'you have ' + Math.round((G.ship && G.ship.credits) || 0).toLocaleString('en-US') + ' cr' };
    return { ok: true };
  }
  function deposit(G, c, amt, t) {
    book(G, t);
    amt = Math.round(amt);
    var ok = canDeposit(G, c, amt);
    if (!ok.ok) return ok;
    G.ship.credits -= amt; c.cash += amt; c.qFlows += amt; c.deposited += amt;
    return { ok: true, amount: amt };
  }

  /* What you can take out now: cash, not cargo — a load aboard a hull in
   * the corridor is the firm's working money until she sells it. */
  function withdrawable(c) { return Math.max(0, Math.floor(c.cash - (c.owed || 0))); }
  function atOffice(G, c, port) { return !!port && port.id === c.portId && (!G.here || G.here.id === c.star); }
  function canWithdraw(G, c, amt, port) {
    if (!c || c.closed) return { ok: false, why: 'you hold no open account here' };
    if (!atOffice(G, c, port)) return { ok: false, why: 'withdrawals are made at their office at ' + c.portName + (c.starName ? ', ' + c.starName : '') };
    if (!(amt > 0)) return { ok: false, why: 'name an amount' };
    var cash = withdrawable(c);
    if (amt > cash) return { ok: false, why: 'the account holds ' + cash.toLocaleString('en-US') + ' cr in cash — the rest is aboard as cargo' };
    if (!c.closing && c.minAccount > 0 && c.cash - amt < c.minAccount) {
      return { ok: false, why: 'that would leave the account under ' + c.minAccount.toLocaleString('en-US') + ' — close it instead' };
    }
    return { ok: true };
  }
  function withdraw(G, c, amt, t, port) {
    book(G, t);
    amt = Math.floor(amt);
    var ok = canWithdraw(G, c, amt, port);
    if (!ok.ok) return ok;
    moveToPlayer(G, c, amt);
    c.qFlows -= amt;
    return { ok: true, amount: amt };
  }
  /* The profit, above everything you put in less everything you took out. */
  function profitAvailable(c) {
    return Math.max(0, Math.min(withdrawable(c), Math.floor(c.cash - (c.deposited - c.withdrawn))));
  }

  /* You end it. Hulls on a run finish it; the account remits when the last
   * is home. */
  function close(G, c, t, out) {
    out = out || [];
    book(G, t);
    if (!c || c.closed) return { ok: false, why: 'you hold no open account here' };
    if (c.closing) return { ok: false, why: 'the account is already closing' };
    c.closing = { at: t, why: 'you' };
    c.nextReview = null;
    hullsOf(G, c).forEach(function (rec) { if (rec.trade.phase !== 'leg') release(G, c, rec, t, out, null); });
    if (!c.hulls.length) finalize(G, c, t, out);
    return { ok: true, lines: out };
  }

  /* ---- the economist ------------------------------------------------------------
   * A paid market reading. For the goods in your hold — or, with an empty
   * hold, what this port sells — which are RISING and WHERE, over the next
   * three days, with a confidence. Built on what the analyser reads
   * (TradeAnalyser.reportAgeDays for how old another system's board is) and
   * on the firm's own board, so a back-street house reads you a stale
   * month and says so in its confidence, and a first-rank one reads you the
   * forecast. */
  var HORIZON = 3 * DAY;
  function reading(G, firm, port, sys, t) {
    var E = Eco(), ship = G.ship || {}, c = { rating: firm.rating, firmKey: firm.key };
    var star = (G.here && G.here.id) || 'here';
    var goods = Object.keys(ship.cargo || {}).filter(function (k) { return ship.cargo[k] > 0 && legalGood(k); });
    var whose = 'your hold';
    if (!goods.length) {
      goods = port.market.order.filter(function (k) { var r = port.market.rows[k]; return r && r.exporter && legalGood(k); });
      whose = port.name + '\'s exports';
    }
    goods = goods.slice(0, 4);
    var where = [];
    (sys.ports || []).forEach(function (p) { if (p.market && !p.dark) where.push({ p: p, star: star, ly: 0, starName: null }); });
    var Gal = global.Galaxy, here = starById(G, star);
    if (here && Gal && G.galaxy) {
      G.galaxy.stars.filter(function (s) { return s.id !== star && s.factionId; })
        .map(function (s) { return { s: s, d: Gal.distance3(here, s) }; })
        .sort(function (a, b) { return a.d - b.d || (a.s.id < b.s.id ? -1 : 1); })
        .slice(0, Math.max(1, JUMP_STARS[firm.rating] - 1))
        .forEach(function (x) {
          var s2 = systemOf(G, x.s.id);
          if (s2 && s2.ports) s2.ports.forEach(function (p) { if (p.market && !p.dark) where.push({ p: p, star: x.s.id, ly: x.d, starName: x.s.name }); });
        });
    }
    var out = [];
    goods.forEach(function (cid) {
      var best = null;
      where.forEach(function (w) {
        if (!w.p.market.rows[cid]) return;
        var now = believedStock(G, c, w.star, w.p, cid, t, t, w.ly);
        var then;
        if (firm.rating >= FORECAST_FROM) then = believedStock(G, c, w.star, w.p, cid, t, t + HORIZON, w.ly);
        else {
          /* No forecast: the board's own trend, the last three days of it,
           * carried forward three more. */
          var past = believedStock(G, c, w.star, w.p, cid, t - HORIZON, t - HORIZON, w.ly);
          then = now + (now - past);
        }
        var bidNow = E.quoteStock(w.p, cid, clamp(now, 0, w.p.market.rows[cid].cap)).sell;
        var bidThen = E.quoteStock(w.p, cid, clamp(then, 0, w.p.market.rows[cid].cap)).sell;
        var rise = bidThen - bidNow;
        if (!best || rise > best.rise) best = { w: w, now: bidNow, then: bidThen, rise: rise };
      });
      if (!best) return;
      var conf = clamp(0.3 + 0.12 * firm.rating - 0.03 * best.w.ly - (firm.rating < FORECAST_FROM ? 0.1 : 0), 0.15, 0.95);
      var at = best.w.p.name + (best.w.starName ? ' (' + best.w.starName + ')' : '');
      var word = best.rise > best.now * 0.02 ? 'rising' : best.rise > -best.now * 0.02 ? 'flat' : 'falling everywhere we read';
      out.push({ cid: cid, where: at, now: Math.round(best.now), then: Math.round(best.then), rising: best.rise > 0,
                 confidence: Math.round(conf * 100),
                 text: E.BY_ID[cid].name + ': ' + word + (word === 'rising' || word === 'flat' ? ' best at ' + at : '') + ', ' +
                       Math.round(best.now) + ' → ' + Math.round(best.then) + ' cr over three days, ' + Math.round(conf * 100) + '% confident' });
    });
    return { whose: whose, rows: out, fee: firm.readingFee };
  }

  /* ---- for the FLEET page and the hail ------------------------------------- */
  function fmtSpan(s) {
    if (s < 5400) return Math.max(1, Math.round(s / 60)) + ' min';
    if (s < 2 * DAY) return (s / HOUR).toFixed(s < 10 * HOUR ? 1 : 0) + ' h';
    return (s / DAY).toFixed(1) + ' d';
  }
  function phaseOf(rec, t) {
    var tr = rec.trade;
    if (!tr) return '';
    if (tr.phase === 'leg' && tr.leg) {
      var L = tr.leg, left = Math.max(0, L.arrive - t);
      var what = L.cid ? L.qty + ' t ' + goodName(L.cid) : 'running empty';
      return what + ' → ' + L.toName + (L.kind === 'jump' ? ' (' + (L.toStarName || 'another star') + ', ' + L.ly.toFixed(1) + ' ly)' : '') +
             ', alongside in ' + fmtSpan(left);
    }
    return 'at ' + (rec.portName || 'her port') + ', next run in ' + fmtSpan(Math.max(0, tr.next - t));
  }
  function quarterLine(c, t) {
    var last = c.history && c.history.length ? c.history[c.history.length - 1] : null;
    var lq = last ? 'last quarter ' + (last.profit >= 0 ? '+' : '') + cr(last.profit) + ' (' + last.verdict + ')' : 'first quarter';
    var left = c.nextReview != null ? '  ·  review in ' + fmtSpan(Math.max(0, c.nextReview - t)) : '';
    return lq + left;
  }

  /* The in-system leg as a route Fleet.syncRoutes can push into traffic:
   * the same shape an order's leg has. Only for a leg in THIS system and
   * only once she has actually cast off. */
  function routeLeg(rec, t) {
    var tr = rec.trade, L = tr && tr.leg;
    if (!L || L.kind !== 'local' || !(t >= L.t0)) return null;
    return L;
  }

  var TradingFirm = {
    QUARTER: QUARTER, TUNE: TUNE, runCosts: runCosts, wagesPerDay: wagesPerDay, berthPerDay: berthPerDay, TURN: TURN, TURN_LOCAL: TURN_LOCAL, TURN_SYSTEM: TURN_SYSTEM, TURN_JUMP: TURN_JUMP, WAIT: WAIT, DEPART: DEPART, HORIZON: HORIZON,
    IDLE_QUARTERS_MAX: IDLE_QUARTERS_MAX, STALE_DAYS: STALE_DAYS, FOOT_SEEN: FOOT_SEEN, BURN_DAYS: BURN_DAYS, NOISE: NOISE, EDGE: EDGE, COMMISSION: COMMISSION, MIN_ACCOUNT: MIN_ACCOUNT,
    READING_FEE: READING_FEE, JUMP_STARS: JUMP_STARS, DEPTH_FROM: DEPTH_FROM, FORECAST_FROM: FORECAST_FROM,
    PLACE_K: PLACE_K,
    placeChance: placeChance, firmAt: firmAt, statsFor: statsFor, keyOf: keyOf, civilian: civilian,
    ratingWord: ratingWord,
    contracts: contracts, contractById: contractById, contractWith: contractWith, contractFor: contractFor,
    hullsOf: hullsOf, equity: equity,
    canEngage: canEngage, engage: engage, hullRefusal: hullRefusal, canAddHull: canAddHull, addHull: addHull,
    canDeposit: canDeposit, deposit: deposit, canWithdraw: canWithdraw, withdraw: withdraw,
    withdrawable: withdrawable, profitAvailable: profitAvailable, atOffice: atOffice, close: close,
    book: book, reading: reading, phaseOf: phaseOf, quarterLine: quarterLine, routeLeg: routeLeg,
    legalGood: legalGood, goodName: goodName, fmtSpan: fmtSpan,
    _footAt: footAt, _systemOf: systemOf
  };
  global.TradingFirm = TradingFirm;
  if (typeof module !== 'undefined' && module.exports) module.exports = TradingFirm;
})(typeof window !== 'undefined' ? window : globalThis);
