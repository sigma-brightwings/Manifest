/* charts.js - THE CARTOGRAPHERS, and what a sheet of a world is worth.
 *
 * Astra: "Maybe we should have a cartographer's guild? For the survey
 * stuff?" And then, correcting the first design: "I don't think that the
 * mining guild would have a problem if you publish a survey of a world
 * that is of zero interest to them." And: "All factions should be trying
 * to expand outward."
 *
 * ---- why this is a second buyer and not a bigger number -----------------
 *
 * A planetary survey produces two different goods out of one flight, and
 * until today the game only sold one of them.
 *
 *   THE ASSAY is what is in the ground: grade, tonnage, which classes the
 *   instrument could read. The Mining Guild buys it (Survey.sell), prices
 *   it on the ore, and it goes stale - a year-old reading of a worked world
 *   is worth less, and the Guild says so. A barren world's assay is worth
 *   NOTHING, correctly: there is nothing in it they want.
 *
 *   THE SHEET is the chart: where the world is, what the surface does,
 *   where a hull can be put down. The Cartographers buy that, and it is
 *   worth something on a world with no ore at all - which was the hole in
 *   the first design. A dead rock on the frontier is a dead rock the next
 *   pilot still has to land on.
 *
 * The two are priced on almost opposite things, which is the point:
 *
 *   assay = f(what is down there, how much you saw, the instrument, age)
 *   sheet = f(whether anyone has this already, how far out it is, how much
 *            of the ball you went round)
 *
 * So a bonanza world in a capital's own system is a fat assay and a nearly
 * worthless sheet: everybody has that sheet. A barren rock eleven light
 * years past the last flag is a worthless assay and the best sheet you can
 * sell. Most worlds are somewhere in between and pay twice, a bit.
 *
 * ---- a sheet does not go off -------------------------------------------
 *
 * The assay's half-life is 180 days because ore gets dug and markets move.
 * A chart has NO decay, and that is not generosity, it is the physics the
 * rest of the game already runs on: the rotations change, the orbit does
 * not. intel.js says the same sentence about a fix on an installation.
 *
 * ---- publishing is a separate act, and that is the whole decision -------
 *
 * Selling the Guild an assay is a private transaction: they file it. PUBLISHING
 * a sheet puts the world in the public record, which is what the
 * Cartographers are paying for - they sell sheets on, that is their trade.
 *
 * On a world of zero interest to anybody's mining concern, that is free
 * money and there is no decision in it. On a world with real deposits, the
 * sheet is a signpost on somebody's quiet rock: prospectors follow charts.
 * So publishing a rich world costs you with the Mining Guild, in proportion
 * to what is actually down there, and publishing a barren one costs nothing
 * at all. Astra's correction, made mechanical.
 *
 * Note what the Guild is NOT objecting to: you have not leaked their assay.
 * You have told the galaxy the place exists and can be landed on. That is
 * why the grievance scales with the ore and not with your coverage.
 *
 * ---- and the factions want the frontier read ----------------------------
 *
 * "All factions should be trying to expand outward." A sheet of a world
 * out past the flags extends somebody's reach whether they asked or not, so
 * publishing one earns a point with whoever's capital is nearest - capped,
 * because charting is not a career with a government.
 *
 * Nothing here draws from the seed. Every input is either a pure function
 * of the immutable galaxy (Galaxy.control, capital distances) or of the
 * body the generator already made, so this file cannot move a star, a world
 * or a deposit. Additive: a career that never visits a Cartographers' desk
 * is the career it was.
 */
(function (global) {
  'use strict';

  var Gal = global.Galaxy || (typeof require !== 'undefined' ? require('./galaxy.js') : null);

  /* ---- the sheet ---------------------------------------------------------
   * Tuned against the real galaxy (tools/chart-sweep.cjs): see CHANGELOG. */
  /* CHART_BASE was first set to 6000 by arithmetic on a guess, and the
   * sweep said the top sheet in the galaxy then paid 20,570 cr - a BARREN
   * rim gas giant matching the richest assay anywhere, with a system full
   * of them behind it. The balance rule is that a survey pays well and
   * never beats active hauling, and a chart of a dead rock certainly never
   * beats a rich world's ore. Set so a fully mapped Earth-sized world on
   * the far rim is about 4,700 cr and the very best sheet in the galaxy is
   * about 8,400 - comfortably under the 16,000 a fully mapped rich world's
   * assay pays. */
  var CHART_BASE = 3600;          // cr for a whole unmapped Earth on the frontier
  var COV_POWER = 1.5;            // a half-mapped world is not half a sheet
  var COV_FLOOR = 0.15;           // below this there is no sheet to sell
  var REF_RAD_KM = 6371;          // a sheet's size reference
  /* A gas giant is eleven Earth radii, and its cloud deck is not eleven
   * times the chart: what is bought is a usable sheet of a place. The cap
   * is most of what this term does, and it is meant to be. */
  var SIZE_LO = 0.6, SIZE_HI = 1.8;
  var NOVELTY_FLOOR = 0.05;       // even a capital's world is worth a token
  /* One port in a system means somebody charted it; the twelfth port means
   * very little more than the sixth. The first pass added a flat 0.16 per
   * port, and with systems holding up to eighteen that pinned every busy
   * system at the ceiling: novelty came out BIMODAL over the real galaxy,
   * 0.05 or 1.0 with nothing in between, which is not a premium a player
   * can feel. Saturating instead. */
  var PORT_KNOWN = 0.30;          // one port in the system, and it is this charted
  var PORT_SPAN = 0.45;           // approaching this much more, with many
  var PORT_SCALE = 4;             // ports, e-folding
  var REACH_LO = 0.6, REACH_SPAN = 0.8;

  /* ---- what the Cartographers think of you ------------------------------ */
  var CARTO_PER = 12000;          // cr of sheet per point
  var CARTO_MAX_PER_SALE = 5;

  /* ---- what the Mining Guild thinks of it ------------------------------- */
  /* MEASURED, not guessed (tools/measure-charts.cjs over 8,386 worlds):
   * ore interest runs min 11, p25 37, median 64, p75 194, p95 359, max 992.
   * The first numbers here were 900 and 7000, which sat above the entire
   * galaxy - every world came out free to publish and Astra's distinction
   * did not exist. The floor is set so about three worlds in four are of
   * genuinely no interest, and the top so that only the real prizes cost
   * the full four. */
  var MIND_FLOOR = 200;           // ore interest below this: nobody minds
  var MIND_RICH = 650;            // and at this, they mind as much as they do
  var MIND_MAX = 4;               // points of standing, at the top

  /* ---- the frontier nod -------------------------------------------------- */
  var FRONTIER_CTL = 0.35;        // control below this is frontier
  var FRONTIER_CAP = 15;          // total points charting can earn one faction

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* How much of the ball the sheet covers. The chart is topography, so it
   * is the broadest coverage the record has - any instrument that passed
   * over the ground drew it. */
  function sheetCov(rec) {
    return rec ? (rec.cov || 0) : 0;
  }
  function published(rec) {
    return rec && typeof rec.pubCov === 'number' ? rec.pubCov : 0;
  }
  function unpublished(rec) {
    return Math.max(0, sheetCov(rec) - published(rec));
  }

  /* A bigger world is more sheet, but not proportionally: what is being
   * bought is a usable chart of a place, and the place being four times
   * the area does not make it four times as useful to a pilot. */
  function sizeOf(target) {
    /* `radius`, in km, is what generate.js puts on a body. The first pass
     * read `rad`, which no body has, so every world in the galaxy came out
     * the size of Earth and the term did nothing at all. A ring or a belt
     * has no radius and reads as the reference, which is fair: a ring sheet
     * is a sheet. */
    var rad = (target && (target.radius || target.rad)) || REF_RAD_KM;
    /* SIZE_LO is the INTERCEPT, not a clamp: a body of no size at all is
     * still a place, and still worth most of a sheet. The first pass wrote
     * `clamp(0.6 + 0.4 * x, SIZE_LO, SIZE_HI)` with SIZE_LO at 0.6, which
     * the floor could never reach - a constant that cannot bind is a lie in
     * the source, and the suite said so. */
    var sz = SIZE_LO + (1 - SIZE_LO) * (rad / REF_RAD_KM);
    return sz > SIZE_HI ? SIZE_HI : sz;
  }

  /* HOW WELL CHARTED THIS SYSTEM ALREADY IS, which is the whole of what the
   * Cartographers are buying. Two inputs, both already in the galaxy:
   * whose writ runs here (Galaxy.control: 0 in no-man's land, 1 at a
   * capital), and whether anybody has built a port - a system with a berth
   * in it has been charted by whoever built the berth. */
  function knownness(galaxy, star, sys) {
    var ctl = (Gal && Gal.control && galaxy && star) ? Gal.control(galaxy, star) : 0;
    var ports = (sys && sys.ports) ? sys.ports.length : 0;
    var byPort = ports > 0
      ? PORT_KNOWN + PORT_SPAN * (1 - Math.exp(-(ports - 1) / PORT_SCALE))
      : 0;
    /* Either route can have charted it, so they compound rather than one
     * winning: a system with a flag AND a berth is better known than one
     * with either. */
    return clamp(1 - (1 - clamp(ctl, 0, 1)) * (1 - clamp(byPort, 0, 1)), 0, 1);
  }
  function noveltyOf(galaxy, star, sys) {
    return Math.max(NOVELTY_FLOOR, 1 - knownness(galaxy, star, sys));
  }

  /* HOW FAR OUT IT IS. Distance to the nearest capital of anybody, over the
   * cluster's radius: 0 on a capital's doorstep, 1 at the rim. This is the
   * term that makes expanding outward pay. */
  function frontierOf(galaxy, star) {
    if (!galaxy || !star || !Gal || !Gal.distance3) return 0.5;
    var best = Infinity;
    var facs = galaxy.factions || [];
    for (var i = 0; i < facs.length; i++) {
      var cap = galaxy.byId && galaxy.byId[facs[i].capitalId];
      if (!cap) continue;
      var d = Gal.distance3(star, cap);
      if (d < best) best = d;
    }
    if (best === Infinity) return 1;
    var R = (Gal.CLUSTER_RADIUS || 72.75);
    return clamp(best / R, 0, 1);
  }
  function reachOf(galaxy, star) {
    return REACH_LO + REACH_SPAN * frontierOf(galaxy, star);
  }

  /* WHAT IS DOWN THERE, as a single number, independent of how much of it
   * you saw. This is the Guild's interest in the world, not yours: a rock
   * they would want nobody pointing at. */
  function oreInterest(target, sys) {
    var Sv = global.Survey, Eco = global.Economy;
    if (!Sv || !target) return 0;
    var rows = Sv.deposits(target, sys) || [];
    var sum = 0;
    for (var i = 0; i < rows.length; i++) {
      var base = (Eco && Eco.BY_ID && Eco.BY_ID[rows[i].cid]) ? Eco.BY_ID[rows[i].cid].base : 80;
      sum += (rows[i].grade || 0) * base;
    }
    return sum;
  }

  /* How much the Guild minds, 0..1, and the standing it costs. */
  function mindFrac(target, sys) {
    var v = oreInterest(target, sys);
    if (!(v > MIND_FLOOR)) return 0;
    return clamp((v - MIND_FLOOR) / (MIND_RICH - MIND_FLOOR), 0, 1);
  }
  function guildCost(target, sys) {
    return Math.round(MIND_MAX * mindFrac(target, sys));
  }

  /* ---- the price -------------------------------------------------------- */

  /* What the Cartographers would pay for the unpublished part of this
   * record. No age term, deliberately. */
  function value(rec, sys, galaxy, star) {
    var Sv = global.Survey;
    if (!Sv || !rec) return 0;
    var fresh = unpublished(rec);
    if (!(sheetCov(rec) >= COV_FLOOR) || !(fresh > 0.01)) return 0;
    var tgt = Sv.targetFor(sys, rec);
    if (!tgt) return 0;
    /* Paid on the sheet you are adding: the whole-world figure at your
     * coverage, less what the earlier edition already paid for. */
    var whole = Math.pow(sheetCov(rec), COV_POWER);
    var had = Math.pow(published(rec), COV_POWER);
    var add = Math.max(0, whole - had);
    var px = CHART_BASE * sizeOf(tgt) * add *
             noveltyOf(galaxy, star, sys) * reachOf(galaxy, star);
    return Math.round(px / 10) * 10;
  }

  /* Everything in THIS system with sheet the Cartographers have not had,
   * each with what it pays and what publishing it costs with the Guild. */
  function offers(G, sys, galaxy) {
    var Sv = global.Survey;
    if (!Sv || !G || !sys) return [];
    var here = (G.here && G.here.id) || 'sys';
    var star = (galaxy && galaxy.byId) ? galaxy.byId[here] : G.here;
    var out = [];
    Object.keys(G.surveys || {}).forEach(function (k) {
      var rec = G.surveys[k];
      Sv.migrateRec(rec);
      if (rec.star !== here) return;
      var price = value(rec, sys, galaxy, star);
      if (!(price > 0)) return;
      var tgt = Sv.targetFor(sys, rec);
      out.push({
        rec: rec, key: k, target: tgt,
        name: (tgt && tgt.name) || k,
        price: price,
        cov: sheetCov(rec),
        was: published(rec),
        guild: guildCost(tgt, sys),
        ore: oreInterest(tgt, sys),
        frontier: frontierOf(galaxy, star) 
      });
    });
    out.sort(function (a, b) { return b.price - a.price; });
    return out;
  }

  /* The one the desk would act on: the world your nav is locked to if it
   * has a sheet to sell, else the best-paying one here. The same rule the
   * claim row follows, for the same reason - publishing is a per-world
   * decision and a desk that published everything at once would be taking
   * it for you. */
  function pick(G, sys, galaxy) {
    var list = offers(G, sys, galaxy);
    if (!list.length) return null;
    if (G.navTarget && G.navTarget.kind === 'body') {
      for (var i = 0; i < list.length; i++) {
        if (list[i].target && list[i].target.id === G.navTarget.id) return list[i];
      }
    }
    return list[0];
  }

  /* Why the row is dark, in words, because a refusal carries its reason. */
  function why(G, sys, galaxy) {
    var Sv = global.Survey;
    if (!Sv) return 'no survey instrument aboard';
    var here = (G.here && G.here.id) || 'sys';
    var any = false, part = 0, allPub = false;
    Object.keys(G.surveys || {}).forEach(function (k) {
      var rec = G.surveys[k];
      if (rec.star !== here) return;
      any = true;
      part = Math.max(part, sheetCov(rec));
      if (sheetCov(rec) >= COV_FLOOR && unpublished(rec) <= 0.01) allPub = true;
    });
    if (!any) return 'nothing of this system mapped yet';
    if (part < COV_FLOOR) {
      return 'a sheet starts at ' + Math.round(COV_FLOOR * 100) + '% of a world - ' +
             'best here is ' + Math.round(part * 100) + '%';
    }
    if (allPub) return 'every sheet you hold here is already in the record';
    return 'nothing here they have not got';
  }

  /* The faction whose capital is nearest, for the frontier nod. */
  function nearestPower(galaxy, star) {
    if (!galaxy || !star || !Gal || !Gal.distance3) return null;
    var best = null, bd = Infinity;
    var facs = galaxy.factions || [];
    for (var i = 0; i < facs.length; i++) {
      if (facs[i].outlaw) continue;        // the Syndicate is not expanding lawfully
      var cap = galaxy.byId && galaxy.byId[facs[i].capitalId];
      if (!cap) continue;
      var d = Gal.distance3(star, cap);
      if (d < bd) { bd = d; best = facs[i]; }
    }
    return best;
  }

  /* ---- publishing ------------------------------------------------------- */

  function cartoCredit(G, total) {
    var M = global.Missions;
    if (!M || !M.bumpStanding || !(total > 0)) return 0;
    G.carto = G.carto || { paid: 0, given: 0, frontier: {} };
    G.carto.paid += Math.round(total);
    var want = Math.min(
      (G.carto.given || 0) + CARTO_MAX_PER_SALE,
      Math.floor(G.carto.paid / CARTO_PER)
    );
    var up = want - (G.carto.given || 0);
    if (!(up > 0)) return 0;
    G.carto.given = want;
    M.bumpStanding(G, 'carto', up);
    return up;
  }

  /* A sheet of a world nobody holds extends whoever is nearest, so they
   * notice. Capped, and only on the genuine frontier. */
  function frontierNod(G, galaxy, star) {
    var M = global.Missions;
    if (!M || !M.bumpStanding || !galaxy || !star) return null;
    var ctl = (Gal && Gal.control) ? Gal.control(galaxy, star) : 1;
    if (ctl >= FRONTIER_CTL) return null;
    var fac = nearestPower(galaxy, star);
    if (!fac) return null;
    G.carto = G.carto || { paid: 0, given: 0, frontier: {} };
    G.carto.frontier = G.carto.frontier || {};
    var had = G.carto.frontier[fac.id] || 0;
    if (had >= FRONTIER_CAP) return { fac: fac, up: 0, capped: true };
    G.carto.frontier[fac.id] = had + 1;
    M.bumpStanding(G, fac.id, 1);
    return { fac: fac, up: 1, capped: false };
  }

  /* Publish one world's sheet. Irreversible by construction: the record
   * remembers the edition, so the same ground is never paid for twice, and
   * there is no unpublishing a thing that is in the record. */
  function publish(G, sys, galaxy, key, hooks) {
    var Sv = global.Survey;
    if (!Sv) return { ok: false, why: 'no survey data' };
    var rec = (G.surveys || {})[key];
    if (!rec) return { ok: false, why: 'no survey of that' };
    Sv.migrateRec(rec);
    var here = (G.here && G.here.id) || 'sys';
    if (rec.star !== here) return { ok: false, why: 'that survey is of another system' };
    var star = (galaxy && galaxy.byId) ? galaxy.byId[here] : G.here;
    var price = value(rec, sys, galaxy, star);
    if (!(price > 0)) return { ok: false, why: why(G, sys, galaxy) };

    var tgt = Sv.targetFor(sys, rec);
    var cost = guildCost(tgt, sys);
    var M = global.Missions;

    rec.pubCov = sheetCov(rec);
    if (G.ship) G.ship.credits += price;

    var up = cartoCredit(G, price);
    if (cost > 0 && M && M.bumpStanding) M.bumpStanding(G, 'guild', -cost);
    var nod = frontierNod(G, galaxy, star);

    var res = {
      ok: true, price: price, guild: cost, carto: up,
      name: (tgt && tgt.name) || key,
      cov: rec.pubCov, nod: nod
    };
    if (hooks && hooks.say) {
      var line = res.name + ' is in the record - ' + price + ' cr';
      if (up > 0) line += ', +' + up + ' with the Cartographers';
      if (cost > 0) line += '. The Guild has noticed (-' + cost + ')';
      if (nod && nod.up > 0) line += '. ' + (nod.fac.name || nod.fac.id) + ' is pleased (+1)';
      hooks.say(line, 6);
    }
    return res;
  }

  var Charts = {
    CHART_BASE: CHART_BASE, COV_POWER: COV_POWER, COV_FLOOR: COV_FLOOR,
    REF_RAD_KM: REF_RAD_KM, SIZE_LO: SIZE_LO, SIZE_HI: SIZE_HI,
    NOVELTY_FLOOR: NOVELTY_FLOOR, PORT_KNOWN: PORT_KNOWN,
    PORT_SPAN: PORT_SPAN, PORT_SCALE: PORT_SCALE,
    REACH_LO: REACH_LO, REACH_SPAN: REACH_SPAN,
    CARTO_PER: CARTO_PER, CARTO_MAX_PER_SALE: CARTO_MAX_PER_SALE,
    MIND_FLOOR: MIND_FLOOR, MIND_RICH: MIND_RICH, MIND_MAX: MIND_MAX,
    FRONTIER_CTL: FRONTIER_CTL, FRONTIER_CAP: FRONTIER_CAP,
    sheetCov: sheetCov, published: published, unpublished: unpublished,
    sizeOf: sizeOf, knownness: knownness, noveltyOf: noveltyOf,
    frontierOf: frontierOf, reachOf: reachOf,
    oreInterest: oreInterest, mindFrac: mindFrac, guildCost: guildCost,
    value: value, offers: offers, pick: pick, why: why,
    nearestPower: nearestPower,
    cartoCredit: cartoCredit, frontierNod: frontierNod, publish: publish
  };
  global.Charts = Charts;
  if (typeof module !== 'undefined' && module.exports) module.exports = Charts;
})(typeof window !== 'undefined' ? window : globalThis);
