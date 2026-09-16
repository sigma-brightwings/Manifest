/* missions.js — contracts, deadlines, and what the factions think of you.
 *
 * A mission board is a pure function of (port, time window), the same trick
 * the whole universe runs on: the offers at Halden Dock this week are the
 * offers at Halden Dock this week, whether you looked yesterday or not, and
 * two visits in the same window see the same board. Accepting one copies it
 * into the player's contract list, which is real mutable state — the board
 * is procedural, your obligations are yours.
 *
 * Three shapes of work, all of them the game's existing systems wearing a
 * pay grade:
 *
 *   HAUL     freight is loaded aboard; deliver it to a named port in this
 *            system by the deadline.
 *   COURIER  a sealed parcel to another STAR — any port there counts. Pays
 *            like it sounds, because the deadline includes a jump.
 *   DISPOSAL reactor waste nobody wants, to a port that can take it. The
 *            dirty-work premium on top of the waste economy that exists.
 *
 * Failure is real: miss a deadline and the contract fails on its own — the
 * fine comes out of your account and the faction remembers. The cargo stays
 * in your hold, because it is physically there and the universe does not
 * repossess by magic; selling a failed contract's freight is between you
 * and your standing.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG, V = global.V;

  var WINDOW = 2 * 86400;          // seconds per board refresh
  var HAUL_DEADLINE = 3 * 86400;
  var COURIER_DEADLINE = 10 * 86400;
  var STANDING_WIN = { haul: 3, courier: 5, disposal: 4, passage: 4 };
  var STANDING_LOSS = 7;
  var FINE_FRACTION = 0.5;

  /* The courier parcel is a commodity the market has never heard of: it can
   * sit in the hold and be jettisoned like anything else, but no port lists
   * it, so it cannot be sold — only delivered or thrown away. */
  function registerParcel() {
    var Eco = global.Economy;
    if (Eco && !Eco.BY_ID.parcel) {
      Eco.BY_ID.parcel = { id: 'parcel', name: 'Sealed courier parcel', base: 0, tier: 0 };
    }
  }

  function windowIndex(t) { return Math.floor(t / WINDOW); }

  /* Ports in this system that will take waste — the disposal mission needs
   * a legal destination before it can be offered. */
  function wasteTakers(sys, t) {
    var Eco = global.Economy;
    var out = [];
    for (var i = 0; i < (sys.ports || []).length; i++) {
      var p = sys.ports[i];
      if (!p.market) continue;
      var q = Eco.price(p, 'waste', t);
      if (q && q.sell !== null && q.sell >= 0) out.push(p);
    }
    return out;
  }

  /* ---- what the board says ----------------------------------------------
   * Two fields, and the split is the whole discipline:
   *
   *   text  the one line on the board. WHAT the job is. Terse, factual,
   *         capped at TEXT_MAX so a board stays scannable however baroque
   *         later mission types become.
   *   desc  WHO is asking and WHY, read on demand behind a button.
   *
   * The long half is assembled from a pool of fragments joined by rules,
   * and there is exactly one rule that keeps it from producing nonsense:
   *
   *     THE GRAMMAR MAY ONLY COMBINE FRAGMENTS THAT DESCRIBE STATE THE
   *     MISSION ACTUALLY HAS.
   *
   * Every slot is either a real value off the offer — the destination, the
   * commodity, the tonnage, the fee — or connective tissue from a pool
   * where every entry is true of every mission of that type. So the worst
   * case is a sentence that reads a little oddly. A sentence that describes
   * a job the player cannot do is structurally impossible, which is the
   * only failure that would actually matter.
   *
   * Fragments are drawn from the offer's OWN seeded stream, never from the
   * board's rng: a board must read the same when you come back to it, and
   * this must not consume a draw that offer generation was relying on. */
  var TEXT_MAX = 240;

  /* The headline gets a far tighter budget than the cap, because the cap is
   * a safety net and this is the actual readable width. The board clips at
   * roughly eighty characters and the ACTIVE CONTRACTS column at about
   * fifty, so a headline that spends its whole allowance is a headline
   * nobody reads the end of. Decorations are added only while they fit, in
   * priority order, and the CORE is never touched — see `headline`. */
  var HEAD_BUDGET = 64;

  /* ---- the pools ---------------------------------------------------------
   * Connective tissue ONLY. Every entry in every pool is true of EVERY
   * mission of that type, which is what lets the pools grow without the
   * grammar getting cleverer: a bad draw reads oddly and cannot lie.
   *
   * Anything that is NOT true of every mission of its type does not belong
   * here — it belongs in the fact-driven fragments below, which are chosen
   * by reading the world rather than by rolling dice. */
  var CLIENT = {
    haul: ['A factor', 'A shipping agent', 'A warehouse clerk',
           'A consortium buyer', 'A dock supervisor', 'A freight broker',
           'A co-operative steward', 'An outbound loadmaster',
           'A woman running her father’s dock', 'A bonded warehouseman'],
    courier: ['A quiet man', 'A legal office', 'A shipping agent',
              'Someone who did not give a name', 'A station registrar',
              'A woman with a courier bond and no small talk',
              'An estate solicitor', 'A clerk who kept checking the door'],
    disposal: ['The reactor supervisor', 'A waste contractor',
               'The site foreman', 'An environmental officer',
               'A decommissioning crew chief', 'The containment officer'],
    smuggle: ['A man who does not blink', 'A dock hand with a second job',
              'Somebody the harbourmaster has not met',
              'A voice on an unlisted channel']
  };
  var TONE = {
    haul: ['Standard terms.', 'Nothing unusual about it.',
           'Paid on delivery, as always.', 'Routine work, honestly priced.',
           'No surprises in the paperwork, and none expected in the hold.',
           'They have shipped this way for years.'],
    courier: ['No questions, and none expected.', 'Sealed, and it stays sealed.',
              'Discretion is most of the fee.', 'Hand it over intact and that is that.',
              'You are being paid to not be curious.',
              'The seal is their word, not yours.'],
    disposal: ['Licensed disposal only.', 'The paperwork follows the cargo.',
               'Do not be clever about where it ends up.',
               'Somebody checks. Somebody always checks.',
               'It is legal, it is filthy, and it pays like both.'],
    smuggle: ['Nobody signs anything.', 'If it is found, it was never theirs.',
              'The fee is for the risk, not the distance.']
  };
  var PRESSURE = ['They are not in a hurry, but the board clears at the deadline.',
                  'Sooner is better than later.',
                  'The deadline is real; the fine for missing it is realer.',
                  'They have asked twice already.',
                  'Late is the same as never, as far as the fee is concerned.',
                  'The clock started when you read this.'];

  /* Headline verbs, per type. The courier's carry the article because its
   * core is a bare noun phrase ("sealed parcel to the Vega system"). */
  var VERB = {
    haul: ['Run', 'Lift', 'Shift', 'Move', 'Carry'],
    disposal: ['Clear', 'Take', 'Haul off'],
    courier: ['Carry a', 'Run a', 'Hand-carry a'],
    smuggle: ['Move', 'Quietly shift']
  };
  var URGENT = ['Urgent:', 'Priority:', 'Rush:'];

  var DISTANCE_NOTE = ['It is {ly} out, and they know what that costs.',
                       '{ly} of lane, most of it empty.',
                       '{ly} away — the deadline allows for a jump and not much else.'];
  var LAWLESS_NOTE = ['The run goes through space where the law is a suggestion.',
                      'Nobody out that way is very interested in paperwork.',
                      'It is not policed space. Price that in yourself.'];

  /* ---- facts the world already knows -------------------------------------
   * Every field here is read off state the offer or the world ALREADY has,
   * which is what makes the richer prose safe: the grammar still only
   * combines fragments that describe state the mission actually has, and
   * these are simply more of that state than `describe` used to bother with.
   *
   * This is the starport-signage principle applied to prose — the boards
   * advertise what a port genuinely exports, and a contract should describe
   * the job the economy genuinely has.
   *
   * Two field traps, both silent if you get them wrong and both already
   * recorded against the dressing work: the role id lives on
   * `port.market.role`, NOT `port.role`; and economy.js keeps `ROLE_BY_ID`
   * private, so `roleName` off the market is the only lookup available here.
   *
   * `ctx` is optional and every field degrades to null. boardAt hands one
   * over per offer; a caller that does not (arcs.js used not to) still gets
   * a correct, plainer sentence rather than an exception. */
  function factsFor(offer, ctx) {
    ctx = ctx || {};
    var Eco = global.Economy;
    var com = (Eco && Eco.BY_ID) ? Eco.BY_ID[offer.cid] : null;
    var f = {
      commodity: com ? com.name : offer.cid,
      contraband: !!(com && com.contraband),
      roleName: null, role: null, dev: null,
      surface: false, underground: false,
      wantsIt: false, shortThere: false, glutHere: false,
      crime: null, lyAway: null
    };

    var dst = ctx.toPort;
    if (dst) {
      f.surface = !!dst.surface;
      f.underground = !!dst.underground;
      if (dst.market) {
        f.role = dst.market.role || null;
        f.roleName = dst.market.roleName || null;
        f.dev = dst.market.dev;
        var drow = dst.market.rows ? dst.market.rows[offer.cid] : null;
        if (drow) {
          f.wantsIt = !!drow.importer || drow.cons > drow.prod * 1.15;
          f.shortThere = drow.cons > drow.prod * 1.6;
        }
      }
    }
    var src = ctx.fromPort;
    if (src && src.market && src.market.rows) {
      var srow = src.market.rows[offer.cid];
      if (srow) f.glutHere = srow.prod > srow.cons * 1.6;
    }
    if (ctx.sys && ctx.sys.crimeScore !== undefined) f.crime = ctx.sys.crimeScore;
    if (ctx.here && ctx.toStar && global.Galaxy && global.Galaxy.distance3) {
      var d = global.Galaxy.distance3(ctx.here, ctx.toStar);
      if (d > 0) f.lyAway = d;
    }
    return f;
  }

  /* The destination, named as specifically as the world allows — and it
   * ALWAYS contains `offer.toName` verbatim, because the suite checks that
   * the prose names the real destination and because that property is the
   * whole reason this grammar is allowed to exist. */
  function placePhrase(offer, f) {
    var name = offer.toName;
    if (offer.type === 'courier') return 'the ' + name;   // toName is "<star> system"
    if (f.underground) return 'the underground bay at ' + name;
    /* 'orbital' is the role a port gets when it has no particular role —
     * PORT_ROLES gives it an empty bias list — so naming it says nothing
     * and merely lengthens every second sentence on the board. Every other
     * role is a real fact about what the place does. */
    if (f.roleName && f.role !== 'orbital') {
      return 'the ' + String(f.roleName).toLowerCase() + ' at ' + name;
    }
    return name;
  }

  /* Why this cargo is moving, when the economy has an actual answer. Null
   * when it does not — a sentence is better omitted than invented.
   *
   * `glutHere` is deliberately NOT used for a haul, and the reason is worth
   * writing down because the first draft did use it and it read badly at
   * once. boardAt only offers a haul in a good the origin EXPORTS, so "this
   * dock has more of it than it can use" is true of every haul ever offered
   * — a tautology dressed as insight, printed on two thirds of the board.
   * The same test that keeps a pool entry honest applies here: a fragment
   * that is true of every mission of its type carries no information. A
   * shortage at the far end is not automatic, so that one stays. */
  function reasonPhrase(offer, f) {
    if (offer.type === 'courier') return null;
    if (offer.type === 'disposal') {
      return f.role === 'reprocessing'
        ? 'They hold the licence for it, and nobody nearer does.' : null;
    }
    if (offer.type === 'smuggle' && f.glutHere) {
      // Black-market goods are not sourced from an exporter, so a glut here
      // is a real and unusual fact rather than the definition of the job.
      return 'There is more of it on this dock than anyone will admit to.';
    }
    if (f.shortThere) return 'They are running short of it, and the price there shows it.';
    if (f.wantsIt) return 'They buy more of it than they make.';
    return null;
  }

  /* How far up its own pay band this offer sits, 0..1, or null for a type
   * with no band to compare against. This is a REAL tell and it is meant to
   * be one: a fee at the top of the band is the game saying something is
   * unusual about the job without ever lying about what. */
  function payPressure(offer) {
    var lo, hi;
    if (offer.type === 'haul') { lo = offer.tonnes * 28 + 250; hi = offer.tonnes * 55 + 250; }
    else if (offer.type === 'disposal') { lo = offer.tonnes * 60; hi = offer.tonnes * 95; }
    else if (offer.type === 'courier') { lo = 1800; hi = 4800; }
    else return null;
    if (!(hi > lo)) return null;
    return Math.max(0, Math.min(1, (offer.pay - lo) / (hi - lo)));
  }

  /* A short true tail, or nothing. Disposal is excluded because its core
   * already says "reactor waste" and the row is already amber.
   *
   * No '— surplus here' tail, for the same reason `reasonPhrase` refuses
   * the matching sentence: a haul is always sourced from an exporter, so
   * the tail would print on nearly every row and stop meaning anything.
   * A headline decoration has to be worth the width it takes. */
  function headTail(offer, f) {
    if (offer.type === 'disposal' || offer.type === 'courier') return null;
    if (f.shortThere) return '— they are short';
    if (f.underground) return '— underground bay';
    return null;
  }

  /* ---- the headline generator --------------------------------------------
   *   [URGENCY] [VERB] <core> [— TAIL]
   *
   * The CORE is supplied by whoever built the offer and is never edited: it
   * carries the tonnage, the commodity and the destination, which are the
   * three things a headline exists to say. Everything else is a decoration
   * that has to earn its place in the budget, and the budget is checked
   * against the assembled string rather than guessed at per fragment.
   *
   * All three draws happen up front, before any of the fit tests, so that
   * adding or reordering a decoration later cannot shift the stream and
   * silently reword every board in the galaxy. */
  function headline(offer, f) {
    var r = new RNG('head|' + offer.id);
    var pool = VERB[offer.type];
    var verb = pool ? r.pick(pool) : null;
    var urgent = r.pick(URGENT);
    var tail = headTail(offer, f);

    var s = offer.core ||
            (offer.tonnes + 't ' + f.commodity + ' to ' + offer.toName);
    if (verb && (verb + ' ' + s).length <= HEAD_BUDGET) s = verb + ' ' + s;
    var p = payPressure(offer);
    if (p !== null && p >= 0.72 && (urgent + ' ' + s).length <= HEAD_BUDGET) {
      s = urgent + ' ' + s;
    }
    if (tail && (s + ' ' + tail).length <= HEAD_BUDGET) s = s + ' ' + tail;
    return s;
  }

  /* The long form. Assembled from sentences rather than one template per
   * type, so a fact that has nothing to say simply contributes nothing. */
  function describe(offer, f) {
    f = f || factsFor(offer, null);
    var r = new RNG('desc|' + offer.id);
    var who = r.pick(CLIENT[offer.type] || CLIENT.haul);
    var tone = r.pick(TONE[offer.type] || TONE.haul);
    var push = r.pick(PRESSURE);
    var far = r.pick(DISTANCE_NOTE);
    var lawless = r.pick(LAWLESS_NOTE);
    var where = placePhrase(offer, f);
    var goods = String(f.commodity || offer.cid).toLowerCase();
    var out = [];

    if (offer.type === 'courier') {
      out.push(who + ' at ' + offer.fromName +
               ' wants a sealed parcel carried to ' + where + '.');
      if (f.lyAway !== null) out.push(far.replace('{ly}', f.lyAway.toFixed(1) + ' ly'));
    } else if (offer.type === 'disposal') {
      out.push(who + ' at ' + offer.fromName + ' has ' + offer.tonnes +
               ' tonnes of reactor waste to move to ' + where +
               ', and is paying to make it somebody else’s problem.');
    } else if (offer.type === 'smuggle') {
      out.push(who + ' at ' + offer.fromName + ' has ' + offer.tonnes + ' tonnes of ' +
               goods + ' that never went onto a manifest, bound for ' + where + '.');
    } else {
      out.push(who + ' at ' + offer.fromName + ' has ' + offer.tonnes + ' tonnes of ' +
               goods + ' bound for ' + where + ' and no hull to put it in.');
    }

    var why = reasonPhrase(offer, f);
    if (why) out.push(why);
    out.push(tone);
    if (f.crime !== null && f.crime >= 62) out.push(lawless);
    if (offer.campaign) out.push('This is faction business, and they will remember how it goes.');
    out.push(push);
    out.push('Fee ' + offer.pay + ' cr on arrival.');
    return out.join(' ');
  }

  /* Applied to every offer as it is built, so no mission type can ship
   * without both fields or with a headline that runs off the board.
   *
   * An offer that arrives with its own `text` keeps it — that is how
   * arcs.js prefixes a chapter hook onto a cast step. Everything else gets
   * a generated headline from its `core`. */
  function finish(offer, ctx) {
    var f = factsFor(offer, ctx);
    if (!offer.text) offer.text = headline(offer, f);
    if (offer.text.length > TEXT_MAX) {
      offer.text = offer.text.slice(0, TEXT_MAX - 1) + '…';
    }
    if (!offer.desc) offer.desc = describe(offer, f);
    return offer;
  }

  /* The board. Deterministic in (port, window); the accepted/done sets are
   * the only thing that makes two lookups differ, and they are the
   * player's doing. */
  function boardAt(port, sys, galaxy, here, t) {
    if (!port || !port.market) return [];
    var Eco = global.Economy;
    var win = windowIndex(t);
    var rng = new RNG('missions|' + port.id + '|' + win + '|' + sys.seed);
    var offers = [];
    /* Index-aligned with `offers`. Carries the port and system objects the
     * prose reads its facts off, so nothing has to be stashed on the offer
     * itself and no live reference can leak into a signed contract or a
     * save. A branch that forgets to push one degrades to plainer text
     * rather than throwing, which is the right way for this to fail. */
    var ctxs = [];
    var others = (sys.ports || []).filter(function (p) { return p !== port && p.market; });
    var takers = wasteTakers(sys, t);

    var n = rng.int(3, 6);
    for (var i = 0; i < n; i++) {
      var id = 'm|' + port.id + '|' + win + '|' + i;
      var roll = rng.next();

      if (roll < 0.5 && others.length) {
        // HAUL: real freight to a real port, priced by tonnage and haste.
        var dst = rng.pick(others);
        var goods = Object.keys(port.market.rows).filter(function (cid) {
          /* AND NOT MILITARY FUEL. A haul contract HANDS you the freight —
           * accept() adds it to the hold for nothing — so a milfuel haul
           * was a licensed plant giving a stranger tonnes of naval materiel
           * on the word of a mission board, and then a police scan booking
           * that stranger for carrying it. Two wrongs in one offer, and
           * both of them are what the licence exists to prevent.
           *
           * It is also the offer the chain's new prices would have turned
           * into a cheat code: eighteen tonnes of slug is over a hundred
           * thousand credits of cargo against a fee of about a thousand.
           *
           * A LICENSED haul — offered only to somebody the navy already
           * trusts with it — is a good contract and a later one. The
           * blocker is that the board is generated per port and window
           * rather than per career, so "what you are cleared for" is not
           * in scope here yet. */
          return cid !== 'waste' && cid !== Eco.FUEL_ID && !Eco.BY_ID[cid].contraband &&
                 !Eco.BY_ID[cid].milfuel && port.market.rows[cid].exporter;
        });
        if (!goods.length) goods = ['grain'];
        var cid = rng.pick(goods);
        var tonnes = rng.int(4, 18);
        offers.push({
          id: id, type: 'haul', cid: cid, tonnes: tonnes,
          from: port.id, fromName: port.name,
          toPortId: dst.id, toName: dst.name,
          faction: port.faction || null,
          pay: Math.round(tonnes * rng.range(28, 55) + 250),
          deadline: t - (t % WINDOW) + HAUL_DEADLINE,
          core: tonnes + 't ' + (Eco.BY_ID[cid] ? Eco.BY_ID[cid].name : cid) +
                ' to ' + dst.name
        });
        ctxs.push({ fromPort: port, toPort: dst, sys: sys });
      } else if (roll < 0.78 && galaxy) {
        // COURIER: a parcel to a neighbouring star. Any port there counts.
        var near = galaxy.stars.filter(function (s) {
          if (s === here) return false;
          var d = global.Galaxy.distance3(here, s);
          return d > 0 && d < 9;
        });
        if (!near.length) { i--; n--; continue; }
        var star = rng.pick(near);
        offers.push({
          id: id, type: 'courier', cid: 'parcel', tonnes: 1,
          from: port.id, fromName: port.name,
          toStarId: star.id, toName: star.name + ' system',
          faction: port.faction || null,
          pay: Math.round(rng.range(1800, 4800)),
          deadline: t - (t % WINDOW) + COURIER_DEADLINE,
          core: 'sealed parcel to the ' + star.name + ' system'
        });
        ctxs.push({ fromPort: port, sys: sys, here: here, toStar: star });
      } else if (takers.length) {
        // DISPOSAL: their waste, your problem, everyone's premium.
        var tk = rng.pick(takers.filter(function (p) { return p !== port; }));
        if (!tk) continue;
        var wt = rng.int(6, 16);
        offers.push({
          id: id, type: 'disposal', cid: 'waste', tonnes: wt,
          from: port.id, fromName: port.name,
          toPortId: tk.id, toName: tk.name,
          faction: port.faction || null,
          pay: Math.round(wt * rng.range(60, 95)),
          deadline: t - (t % WINDOW) + HAUL_DEADLINE,
          core: wt + 't reactor waste to ' + tk.name
        });
        ctxs.push({ fromPort: port, toPort: tk, sys: sys });
      }
    }

    /* PASSAGE, appended in its own pass with its own stream. Deliberately
     * not a fourth branch of the roll above: adding one there would
     * re-deal every board at every port in every seed, and a board is
     * something a player reads and comes back to. Its own rng, run last,
     * is the same discipline the feeders and the heavies are built with. */
    passageOffers(port, sys, galaxy, here, t, offers, ctxs);
    navyOffers(port, sys, t, offers, ctxs);

    /* Every offer gets its headline generated and capped and its long form
     * written, in one place — so a mission type added later cannot ship
     * without both, and nobody has to remember to call this per branch
     * above. The ctx is the one thing a branch has to remember, and
     * forgetting it costs prose detail rather than correctness. */
    for (var f = 0; f < offers.length; f++) finish(offers[f], ctxs[f]);

    // Whatever the player has already taken or finished this window is gone.
    var taken = {};
    return offers.filter(function (o) { return !taken[o.id]; });
  }

  /* ---- passage -----------------------------------------------------------
   * Astra: "passengers as a mission type? Habitation Units that trade cargo
   * space for ability to move people?"
   *
   * A passage contract is a haul whose freight can be disappointed, and
   * every difference from a haul comes out of that one fact:
   *
   *   - it needs BERTHS rather than hold, so a ship that has not given up
   *     part of its hold to a habitation unit cannot take one at all;
   *   - people are picky about who is flying: they will not board a
   *     captain the local flag wants, and they leave if they find out what
   *     is in the hold;
   *   - and they can be hurt. Taking fire with passengers aboard is a
   *     different act from taking fire alone, and the contract knows it.
   *
   * THE OFFERS ARE SHOWN WHETHER OR NOT YOU CAN TAKE THEM. The board is
   * generated per port and window rather than per career — that is the same
   * constraint that still blocks a licensed haul — but here it is an
   * advantage rather than a limitation: seeing passage work you have no
   * berths for is exactly what makes a habitation unit worth buying, and
   * the accept path refuses in words, which this file has always preferred
   * to a row that will not say what is wrong. */
  var PASSAGE_DEADLINE = 4 * 86400;
  var PASSAGE_PER_SOUL_LOCAL = [340, 760];
  var PASSAGE_PER_SOUL_STAR = [1500, 2900];
  var PASSAGE_WHO = ['contract crew', 'a survey team', 'a family', 'pilgrims',
                     'a relief rotation', 'students', 'a medical team',
                     'off-shift miners', 'a trade delegation', 'refugees'];

  function passageOffers(port, sys, galaxy, here, t, offers, ctxs) {
    var win = windowIndex(t);
    var rng = new RNG('passage|' + port.id + '|' + win + '|' + sys.seed);
    /* People go where people are. A port on a settled world is somewhere
     * anyone might be leaving FROM; everywhere else it is a place you go
     * TO for work, which is why the roster below leans on the destination
     * rather than on the origin. */
    var others = (sys.ports || []).filter(function (p) { return p !== port && p.market; });
    var n = rng.int(0, 2);
    for (var i = 0; i < n; i++) {
      var id = 'p|' + port.id + '|' + win + '|' + i;
      var far = galaxy && rng.chance(0.35);
      var who = rng.pick(PASSAGE_WHO);

      if (far) {
        var near = galaxy.stars.filter(function (st) {
          if (st === here) return false;
          var d = global.Galaxy.distance3(here, st);
          return d > 0 && d < 9;
        });
        if (!near.length) continue;
        var star = rng.pick(near);
        var soulsF = rng.int(1, 4);
        var perF = Math.round(rng.range(PASSAGE_PER_SOUL_STAR[0], PASSAGE_PER_SOUL_STAR[1]));
        offers.push({
          id: id, type: 'passage', cid: null, tonnes: 0, souls: soulsF,
          from: port.id, fromName: port.name,
          toStarId: star.id, toName: star.name + ' system',
          faction: port.faction || null,
          pay: soulsF * perF,
          deadline: t - (t % WINDOW) + COURIER_DEADLINE,
          core: soulsF + ' aboard — ' + who + ' bound for the ' + star.name + ' system'
        });
        ctxs.push({ fromPort: port, sys: sys, here: here, toStar: star });
        continue;
      }

      if (!others.length) continue;
      var dst = rng.pick(others);
      var souls = rng.int(2, 6);
      var per = Math.round(rng.range(PASSAGE_PER_SOUL_LOCAL[0], PASSAGE_PER_SOUL_LOCAL[1]));
      offers.push({
        id: id, type: 'passage', cid: null, tonnes: 0, souls: souls,
        from: port.id, fromName: port.name,
        toPortId: dst.id, toName: dst.name,
        faction: port.faction || null,
        pay: souls * per,
        deadline: t - (t % WINDOW) + PASSAGE_DEADLINE,
        core: souls + ' aboard — ' + who + ' for ' + dst.name
      });
      ctxs.push({ fromPort: port, toPort: dst, sys: sys });
    }
  }

  /* ---- the navy's own board ----------------------------------------------
   * Astra: "The navy runs the carrier, and then there are those carrier
   * shipstations, they're basically floating cities." A fleet carrier has
   * been a place you can dock and trade since the day it was sited, and a
   * place with nothing to do at it is a place you visit once.
   *
   * THE LICENSED HAUL LIVES HERE, and this is what unblocks it. The
   * objection was never about the contract, it was about the board: offers
   * are generated per port and window rather than per career, so "what you
   * are cleared for" could not be asked at the point the board is built.
   * A carrier answers that by moving the question rather than solving it —
   * the offer is posted, and the CLEARANCE is checked when you sign, in
   * words, the same way a passage checks berths. Somebody who cannot take
   * it sees what they would be taking if the navy trusted them, which is a
   * better use of the constraint than hiding the row.
   *
   * And it is the one haul in the game that hands you naval materiel, so
   * it is also the one that pays like it. */
  function navyOffers(port, sys, t, offers, ctxs) {
    var Combat = global.Combat, Eco = global.Economy;
    if (!Combat || !Combat.fleetPort || !Combat.fleetPort(port)) return;
    var win = windowIndex(t);
    var rng = new RNG('navy|' + port.id + '|' + win + '|' + sys.seed);
    var others = (sys.ports || []).filter(function (p) { return p !== port && p.market; });
    if (!others.length) return;

    /* A fuel movement between naval facilities. The destination is any
     * port of the carrier's own flag where there is one — the navy does
     * not ship slugs to somebody else's dock — and otherwise anywhere in
     * the system, because a carrier that cannot move its own fuel is not
     * much of a carrier. */
    var mine = others.filter(function (p) { return p.faction === port.faction; });
    var dst = rng.pick(mine.length ? mine : others);
    var tonnes = rng.int(3, 9);
    var per = (Eco && Eco.BY_ID.milfuel) ? Eco.BY_ID.milfuel.base : 6370;
    offers.push({
      id: 'n|' + port.id + '|' + win + '|0', type: 'haul', cid: 'milfuel',
      tonnes: tonnes, licensed: true,
      from: port.id, fromName: port.name,
      toPortId: dst.id, toName: dst.name,
      faction: port.faction || null,
      /* Priced as a share of what is in the hold rather than per tonne off
       * a table: this is the only contract that hands over cargo worth more
       * than a hull, and a flat fee beside that would read as a joke. */
      pay: Math.round(tonnes * per * rng.range(0.10, 0.17)),
      deadline: t - (t % WINDOW) + HAUL_DEADLINE,
      core: tonnes + 't military fuel to ' + dst.name + ' (licensed)'
    });
    ctxs.push({ fromPort: port, toPort: dst, sys: sys });

    /* And a rotation. A carrier is a city that turns over. */
    if (rng.chance(0.6)) {
      var souls = rng.int(2, 6);
      offers.push({
        id: 'n|' + port.id + '|' + win + '|1', type: 'passage', cid: null,
        tonnes: 0, souls: souls, licensed: false,
        from: port.id, fromName: port.name,
        toPortId: dst.id, toName: dst.name,
        faction: port.faction || null,
        pay: souls * Math.round(rng.range(600, 1150)),
        deadline: t - (t % WINDOW) + PASSAGE_DEADLINE,
        core: souls + ' aboard — a crew rotation for ' + dst.name
      });
      ctxs.push({ fromPort: port, toPort: dst, sys: sys });
    }
  }

  /* What stops you signing a licensed haul, in words. The gate is the same
   * standing the contraband table reads, so the contract and the customs
   * officer cannot disagree about whether you are allowed the cargo. */
  function licenceRefusal(G, offer) {
    var Combat = global.Combat;
    if (!offer.licensed || !Combat) return null;
    var need = Combat.MILFUEL_LICENCE_STANDING;
    var have = standing(G, offer.faction);
    if (have >= need) return null;
    return 'the navy licenses this to ' + need + '+ standing — you are at ' +
           Math.round(have);
  }

  /* Will these people get on this ship? Two refusals, and both of them are
   * about the captain rather than the hull.
   *
   * Nobody boards a ship the local flag is hunting, because the thing that
   * happens to a wanted ship happens to everybody aboard it. And nobody
   * boards one with contraband in the hold by that same flag's law — they
   * are not judging you, they are declining to be in the room when it is
   * found. Both read the SAME tables the law reads, so a passenger cannot
   * disagree with the customs officer who would do the searching. */
  function passageRefusal(G, offer) {
    var Combat = global.Combat;
    if (!Combat) return null;
    var seats = Combat.seatsFree(G.ship);
    if (Combat.seatsOf(G.ship) <= 0) {
      return 'no berths — a habitation unit trades hold for people';
    }
    if (offer.souls > seats) {
      return 'needs ' + offer.souls + ' berths, you have ' + seats + ' free';
    }
    var fac = offer.faction;
    if (fac && Combat.wantedHere && Combat.wantedHere(G, fac)) {
      return 'they will not board a ship ' + fac + ' is hunting';
    }
    var dirty = fac && Combat.contrabandAboardFor
      ? Combat.contrabandAboardFor(G, fac) : null;
    if (dirty) {
      return 'they saw the manifest — nobody boards over ' + dirty.name.toLowerCase();
    }
    return null;
  }

  function alreadyHave(G, offerId) {
    var list = G.missions || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === offerId) return true;
    return (G.doneMissions || {})[offerId];
  }

  /* ---- freight you are carrying FOR somebody ----------------------------
   * accept() puts the contract's cargo in your hold for nothing, which is
   * the right feel — a haul is freight handed over at the dock, not a thing
   * you buy — and it left a hole you could drive a freighter through: sell
   * it at the next port and walk away with the whole value of the cargo for
   * a fee of a few hundred credits. Measured on the board as it stands:
   * twelve tonnes of AI cores is 50,400 credits of freight against an 829
   * credit fee, and seven offers in seven hundred were in that bracket.
   *
   * It was a hole before the fuel chain was repriced and it would have been
   * the best trade in the game after, which is what makes it this change's
   * business rather than somebody else's.
   *
   * So contract freight is BONDED: it counts against your hold and it is
   * not yours to sell. Deliberately not the same as "cannot be got rid of"
   * — you can still jettison it, and jettisoning somebody's freight is a
   * breach you chose, with the contract failing the way any undelivered
   * contract fails. What is closed is selling it and keeping the money,
   * which is not a choice, it is an accounting mistake.
   *
   * Counted rather than flagged per tonne: the hold is a bag of tonnages,
   * not a list of crates, so "how much of this commodity is spoken for" is
   * the only question that can honestly be asked of it.
   */
  function bondedTonnes(G, cid) {
    var list = (G && G.missions) || [];
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].cid === cid) n += list[i].tonnes || 0;
    }
    return n;
  }

  /* How much of what you are holding you may actually sell. */
  function sellableTonnes(G, cid, held) {
    return Math.max(0, (held || 0) - bondedTonnes(G, cid));
  }

  /* And which contract is holding it, for a refusal that teaches the rule
   * rather than one that reads as a broken button. */
  function bondHolder(G, cid) {
    var list = (G && G.missions) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].cid === cid) return list[i];
    }
    return null;
  }

  function accept(G, offer, hooks) {
    var Sim = global.Sim;
    if (alreadyHave(G, offer.id)) return { ok: false, why: 'already taken' };

    /* PEOPLE, NOT TONNES. Everything about the refusal is in one function
     * so the board's greyed row and the button that says no give the same
     * reason in the same words. */
    var unlicensed = licenceRefusal(G, offer);
    if (unlicensed) return { ok: false, why: unlicensed };

    if (offer.type === 'passage') {
      var no = passageRefusal(G, offer);
      if (no) return { ok: false, why: no };
      G.ship.passengers = (G.ship.passengers || 0) + offer.souls;
    } else {
      var free = G.ship.cargoCap - Sim.cargoMass(G.ship);
      if (offer.tonnes > free) {
        return { ok: false, why: 'need ' + offer.tonnes + 't of hold space' };
      }
      G.ship.cargo[offer.cid] = (G.ship.cargo[offer.cid] || 0) + offer.tonnes;
    }
    Sim.refreshShip(G.ship);
    (G.missions = G.missions || []).push({
      id: offer.id, type: offer.type, cid: offer.cid, tonnes: offer.tonnes,
      souls: offer.souls || 0,
      fromName: offer.fromName, toPortId: offer.toPortId || null,
      toStarId: offer.toStarId || null, toName: offer.toName,
      faction: offer.faction, pay: offer.pay, deadline: offer.deadline,
      text: offer.text,
      /* Carried, not regenerated. A contract you signed a week ago has to
       * still say what it said when you signed it. */
      desc: offer.desc || null,
      campaign: offer.campaign || false, factionId: offer.factionId,
      /* WHICH KIND OF CAMPAIGN. A generated faction arc and an authored
       * power chain both ride the `campaign` flag, and only this field
       * tells arcs.js which of the two settled — drop it here and the
       * chain delivers chapter one and then simply stops, which is what
       * happened. */
      power: offer.power || null,
      arcId: offer.arcId, step: offer.step
    });
    /* A campaign hook (chapter zero of a faction's chain) also opens the
     * chain's own progress record — everything after this rides on it. */
    if (offer.campaign) {
      G.campaigns = G.campaigns || {};
      G.campaigns[offer.factionId] = { arcId: offer.arcId, step: offer.step, status: 'active' };
    }
    if (hooks && hooks.say) hooks.say('Contract signed: ' + offer.text, 4);
    if (hooks && hooks.sound) hooks.sound('click');
    return { ok: true };
  }

  /* Called every dock. Completion needs the destination AND the freight —
   * a courier who sold the parcel arrives with nothing to hand over and the
   * contract just sits there until the deadline does its work. */
  /* THEY GET OFF WHERE THEY FIND OUT, not where you were taking them.
   *
   * passageRefusal keeps contraband off the ship at the door, which covers
   * the honest case and none of the interesting one: load the stuff after
   * they are aboard and the check has already happened. So it is asked
   * again at every dock, because a dock is the first place somebody who
   * has changed their mind can act on it. The contract is void, there is no
   * fee, and the flag whose people you did this to remembers.
   *
   * Every dock rather than only the destination, and that asymmetry is the
   * point: a stop on the way is exactly where you would pick up the cargo
   * you did not want them to see. */
  function passengersWalkOff(G, port, hooks) {
    var Combat = global.Combat;
    if (!Combat || !Combat.contrabandAboardFor) return;
    if (!(G.ship.passengers > 0)) return;
    var list = G.missions || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var m = list[i];
      if (m.type !== 'passage') continue;
      var dirty = m.faction ? Combat.contrabandAboardFor(G, m.faction) : null;
      if (!dirty) continue;
      G.ship.passengers = Math.max(0, (G.ship.passengers || 0) - (m.souls || 0));
      bumpStanding(G, m.faction, -STANDING_LOSS);
      (G.doneMissions = G.doneMissions || {})[m.id] = true;
      list.splice(i, 1);
      if (hooks && hooks.say) {
        hooks.say('Your passengers have walked off at ' + port.name +
                  ' — they found the ' + dirty.name.toLowerCase() + '. No fee.', 8);
      }
      if (hooks && hooks.sound) hooks.sound('warn');
    }
    if (global.Sim) global.Sim.refreshShip(G.ship);
  }

  function completeAtDock(G, port, sys, t, hooks) {
    var Sim = global.Sim;
    passengersWalkOff(G, port, hooks);
    var list = G.missions || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var m = list[i];
      var here = (m.toPortId && m.toPortId === port.id) ||
                 (m.toStarId && G.here && m.toStarId === G.here.id);
      if (!here) continue;

      /* A passage settles on people rather than on freight, and it can
       * settle badly: somebody who spent the trip locked in a hold with
       * contraband gets off here and is not paying for the privilege. */
      if (m.type === 'passage') {
        var aboard = Math.min(m.souls || 0, G.ship.passengers || 0);
        G.ship.passengers = Math.max(0, (G.ship.passengers || 0) - aboard);
        Sim.refreshShip(G.ship);
        (G.doneMissions = G.doneMissions || {})[m.id] = true;
        list.splice(i, 1);
        if (aboard < (m.souls || 0)) {
          /* Somebody did not arrive. There is no partial payment for that
           * and there should not be. */
          bumpStanding(G, m.faction, -STANDING_LOSS * 2);
          if (hooks && hooks.say) {
            hooks.say('PASSAGE FAILED — ' + ((m.souls || 0) - aboard) +
                      ' of ' + m.souls + ' did not arrive. No fee.', 8);
          }
          if (hooks && hooks.sound) hooks.sound('warn');
          continue;
        }
        var cut = passageCut(G, m);
        G.ship.credits += cut.pay;
        bumpStanding(G, m.faction, cut.standing);
        if (hooks && hooks.say) hooks.say(cut.text, 6);
        if (hooks && hooks.sound) hooks.sound(cut.pay > 0 ? 'pay' : 'warn');
        if (m.campaign && global.Arcs) global.Arcs.onStepComplete(G, m, port, sys, t, hooks);
        continue;
      }

      var held = G.ship.cargo[m.cid] || 0;
      if (held + 1e-9 < m.tonnes) {
        if (hooks && hooks.say) {
          hooks.say('Contract needs ' + m.tonnes + 't of ' + m.cid +
                    ' aboard — you have ' + held.toFixed(0) + 't', 5);
        }
        continue;
      }
      G.ship.cargo[m.cid] = held - m.tonnes;
      if (G.ship.cargo[m.cid] <= 1e-9) delete G.ship.cargo[m.cid];
      Sim.refreshShip(G.ship);
      G.ship.credits += m.pay;
      bumpStanding(G, m.faction, STANDING_WIN[m.type] || 3);
      (G.doneMissions = G.doneMissions || {})[m.id] = true;
      list.splice(i, 1);
      if (hooks && hooks.say) hooks.say('Contract complete — ' + m.pay + ' cr', 5);
      if (hooks && hooks.sound) hooks.sound('pay');
      /* A campaign chapter settling is what casts the next one — see
       * arcs.js. Ordinary contracts have no `campaign` flag and this is a
       * no-op for them. */
      if (m.campaign && global.Arcs) global.Arcs.onStepComplete(G, m, port, sys, t, hooks);
    }
  }

  /* WHAT THE TRIP WAS LIKE, in credits. The fee is the fee; what varies is
   * how much of it these people are willing to hand over having arrived.
   *
   * Astra picked the three things passengers react to, and two of them land
   * here. Being shot at is recorded while it happens (Combat marks the
   * contract), because the hull damage is long repaired by the time anyone
   * is paying; arriving late is read off the clock. The third — who they
   * are travelling with — is checked at the door in passageRefusal, which
   * is the only place it can be checked honestly, since by the time they
   * are aboard the decision is already made. */
  var ROUGH_TRIP_CUT = 0.45;      // of the fee, for a trip spent under fire
  var LATE_CUT = 0.40;

  function passageCut(G, m) {
    var pay = m.pay, why = [], standing = STANDING_WIN.passage || 4;
    if (m.rough) {
      pay = Math.round(pay * (1 - ROUGH_TRIP_CUT));
      standing -= 3;
      why.push('they were shot at');
    }
    if (G.t !== undefined && m.deadline && G.t > m.deadline) {
      pay = Math.round(pay * (1 - LATE_CUT));
      standing -= 2;
      why.push('you were late');
    }
    var text = why.length
      ? 'Passage ends — ' + pay + ' cr (' + why.join(', ') + ')'
      : 'Passage ends — ' + pay + ' cr, and they say so';
    return { pay: pay, standing: standing, text: text };
  }

  function update(G, t, hooks) {
    var list = G.missions || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var m = list[i];
      if (t <= m.deadline) continue;
      /* A LATE PASSAGE IS NOT A LATE PARCEL. Astra chose lateness as one of
       * the three things passengers react to, and the reaction is that they
       * are still aboard being late WITH you — so the contract does not
       * expire out from under them the way a haul's does. It stays live and
       * pays less (see passageCut); what expires here is only the patience
       * of anyone who has now been in your galley for twice as long as they
       * agreed to, which costs standing on a clock. */
      if (m.type === 'passage') {
        if (t <= m.deadline + PASSAGE_DEADLINE) continue;
        G.ship.passengers = Math.max(0, (G.ship.passengers || 0) - (m.souls || 0));
        bumpStanding(G, m.faction, -STANDING_LOSS * 2);
        (G.doneMissions = G.doneMissions || {})[m.id] = true;
        list.splice(i, 1);
        if (hooks && hooks.say) {
          hooks.say('PASSAGE ABANDONED: ' + m.souls +
                    ' gave up waiting and got off wherever you last stopped.', 8);
        }
        if (hooks && hooks.sound) hooks.sound('warn');
        if (global.Sim) global.Sim.refreshShip(G.ship);
        continue;
      }
      var fine = Math.round(m.pay * FINE_FRACTION);
      G.ship.credits = Math.max(0, G.ship.credits - fine);
      bumpStanding(G, m.faction, -STANDING_LOSS);
      (G.doneMissions = G.doneMissions || {})[m.id] = true;
      list.splice(i, 1);
      if (hooks && hooks.say) {
        hooks.say('CONTRACT FAILED: ' + m.text + ' — fined ' + fine + ' cr', 7);
      }
      if (hooks && hooks.sound) hooks.sound('warn');
      if (m.campaign && global.Arcs) global.Arcs.onStepFailed(G, m, t, hooks);
    }
  }

  /* ---- standing ---------------------------------------------------------
   * One number per faction, clamped, moved by outcomes and by crime (the
   * combat module calls bumpStanding too). It is reputation, not law — the
   * law is the bounty ledger next door. */
  /* Mark every live passage as a rough trip. Called by Combat the moment
   * the player's hull takes a hit with people aboard — recorded then rather
   * than inferred later, because by the time anybody is paying the hull is
   * long since repaired and there is nothing left to read. */
  function passengersUnderFire(G) {
    var list = G.missions || [];
    var any = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].type !== 'passage' || list[i].rough) continue;
      list[i].rough = true;
      any = true;
    }
    return any;
  }

  function standing(G, fac) { return (G.standing || {})[fac] || 0; }

  function bumpStanding(G, fac, delta) {
    if (!fac) return;
    G.standing = G.standing || {};
    G.standing[fac] = Math.max(-100, Math.min(100, (G.standing[fac] || 0) + delta));
  }

  function standingLabel(v) {
    return v <= -40 ? 'HOSTILE' : v <= -10 ? 'cold'
         : v < 10 ? 'neutral' : v < 40 ? 'warm' : 'ALLIED';
  }

  registerParcel();

  var Missions = {
    WINDOW: WINDOW,
    boardAt: boardAt, accept: accept,
    passageRefusal: passageRefusal, passageCut: passageCut,
    licenceRefusal: licenceRefusal,
    passengersUnderFire: passengersUnderFire, passengersWalkOff: passengersWalkOff,
    completeAtDock: completeAtDock, update: update,
    standing: standing, bumpStanding: bumpStanding, standingLabel: standingLabel,
    alreadyHave: alreadyHave,
    bondedTonnes: bondedTonnes, sellableTonnes: sellableTonnes,
    bondHolder: bondHolder,
    TEXT_MAX: TEXT_MAX, describe: describe, finish: finish
  };

  global.Missions = Missions;
  if (typeof module !== 'undefined' && module.exports) module.exports = Missions;
})(typeof window !== 'undefined' ? window : globalThis);
