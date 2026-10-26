/* crew.js — the people aboard, and what having them there is worth.
 *
 * Astra: "Named people with skills", and "larger ships will require crew
 * to operate the turrets and stuff", and — the specific one this file is
 * built around — "a good engineer on the ship can slave the turrets to the
 * ship's targeting system, but traverse is half as fast, and fire rate is
 * two thirds of normal."
 *
 * THE POINT OF A CREW IS THAT NOT HAVING ONE COSTS SOMETHING. A roster
 * that only decorates the ship screen is a list of names. So the rule has
 * teeth in one place first, done properly, rather than in five places
 * vaguely: a turret on a hull too big for one pair of hands does not fire
 * unless somebody is on it — and the engineer's workaround is a real
 * workaround, worse than a gunner and far better than nothing.
 *
 * A SMALL HULL IS EXEMPT, and that is not a softening. One seat with
 * everything in reach is the whole design of a Talon; a pilot who can fly
 * it and shoot it is what a single-seat ship IS. The requirement arrives
 * with the second hull class, which is also when a player has the money to
 * answer it.
 *
 * Who is available at a port is a pure function of the port and the hour,
 * like the traffic and the market — a crew hall you can re-roll by walking
 * out and back in is a crew hall nobody believes.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG;

  /* ---- the three things a person can be -------------------------------
   * Three, not ten. Each one has to DO something the game already has, or
   * it is a label on a card. */
  var ROLES = {
    gunner:   { id: 'gunner',   name: 'Gunner',
                what: 'works a turret by hand — full traverse, full rate' },
    engineer: { id: 'engineer', name: 'Engineer',
                what: 'keeps her running; a good one can slave the turrets' },
    pilot:    { id: 'pilot',    name: 'Pilot',
                what: 'can helm her when you are not aboard' }
  };
  var ROLE_IDS = ['gunner', 'engineer', 'pilot'];

  /* Ratings run 1 to 5 and are said out loud, because a number with no
   * words attached is a number the player has to build their own scale
   * for. */
  var RATINGS = ['', 'green', 'steady', 'good', 'excellent', 'exceptional'];
  function ratingWord(n) { return RATINGS[Math.max(1, Math.min(5, n | 0))]; }

  /* "A GOOD engineer" — Astra's word, and this is the line it draws. */
  var SLAVE_RATING = 3;

  /* ---- what short-handed costs ----------------------------------------
   * The two numbers from the brief, named so they cannot be re-derived
   * slightly differently somewhere else. */
  var SLAVED_TRAVERSE = 0.5;        // half as fast
  var SLAVED_RATE = 2 / 3;          // and two thirds the fire rate

  /* ---- names -----------------------------------------------------------
   * Enough syllables that two people on the same deck rarely share a name,
   * and short enough to fit a row. */
  var GIVEN = ['Ama', 'Bren', 'Cal', 'Dova', 'Esk', 'Fen', 'Gret', 'Hale',
               'Ibe', 'Jann', 'Kes', 'Lior', 'Mira', 'Nesh', 'Oren', 'Pell',
               'Quill', 'Rue', 'Sasha', 'Teo', 'Ulla', 'Vann', 'Wren', 'Yara',
               'Zeke', 'Adia', 'Bo', 'Cass', 'Dell', 'Emi', 'Frey', 'Gus'];
  var FAMILY = ['Ardwick', 'Brill', 'Coyle', 'Danner', 'Esterhazy', 'Fallow',
                'Grieve', 'Hoyt', 'Iveson', 'Jarrah', 'Kepner', 'Lund',
                'Macklin', 'Nury', 'Orrell', 'Petrak', 'Quist', 'Rask',
                'Sable', 'Tirrell', 'Ustin', 'Vance', 'Wray', 'Yelland',
                'Zamora', 'Boquet', 'Chen', 'Drayton', 'Okonjo', 'Salt'];

  /* rng.int is inclusive at BOTH ends — int(0, n-1), not int(n). Getting
   * that wrong returned NaN and an empty crew hall at every port in the
   * galaxy, silently, because an empty list is a perfectly ordinary thing
   * for a small port to have. rng.pick says it once and cannot be got
   * wrong twice. */
  function personName(rng) {
    return rng.pick(GIVEN) + ' ' + rng.pick(FAMILY);
  }

  /* ---- who is going spare at this port, this week ----------------------
   *
   * A window rather than a moment, for the same reason the yard's hull
   * stock turns over on one: somebody who was here an hour ago is still
   * here, and somebody who was here last month has taken a berth. Two
   * days, the same window the hulls use. */
  var HALL_WINDOW = 2 * 86400;
  var HALL_MIN = 2, HALL_MAX = 5;

  function forHire(port, t) {
    if (!port || !port.market || !RNG) return [];
    var win = Math.floor((t || 0) / HALL_WINDOW);
    var rng = new RNG('crewhall|' + port.id + '|' + win);
    /* A developed port has more people looking for a berth, which is the
     * same reason it has more hulls on the floor. */
    var dev = (typeof port.market.dev === 'number') ? port.market.dev : 0.25;
    /* Effective, so a system your plants have trained up has better hands
     * in the hall (holdings.js). Only the dock you are at is ever asked. */
    var C = global.Combat;
    if (C && C.effectiveDev && global.Game) dev = C.effectiveDev(global.Game, port);
    var n = HALL_MIN + rng.int(0, Math.round((HALL_MAX - HALL_MIN) * (0.4 + dev)));
    var out = [];
    for (var i = 0; i < n; i++) {
      var role = rng.pick(ROLE_IDS);
      /* Skill leans on development too, but only leans: the best engineer
       * in the sector being at a mining camp is a story, and a rule that
       * forbids it is one fewer. */
      /* Two coins on top of a low roll, the second of them rare, so the
       * top of the scale is a thing you go looking for rather than a thing
       * you trip over — and so "exceptional" is a word that describes
       * somebody rather than a word nothing ever is. */
      var base = 1 + rng.int(0, 2) + (rng.chance(0.25 + dev * 0.4) ? 1 : 0) +
                 (rng.chance(0.05 + dev * 0.09) ? 1 : 0);
      out.push(make(personName(rng), role, Math.max(1, Math.min(5, base)),
                    port.id + '|' + win + '|' + i));
    }
    return out;
  }

  function make(name, role, rating, id) {
    return {
      id: 'c|' + (id || name),
      name: name,
      role: role,
      rating: Math.max(1, Math.min(5, rating | 0))
    };
  }

  /* What one of them wants. A signing fee up front and a wage that runs
   * while they are aboard — a crew that costs nothing is strictly better
   * than no crew, which makes hiring a decision with only one side. */
  var SIGN_BASE = 900, WAGE_BASE = 42;      // credits, and credits per day
  function signingFee(person) {
    return Math.round(SIGN_BASE * (0.55 + person.rating * 0.36));
  }
  function dailyWage(person) {
    /* `wageMul` is a deal struck with one person (favours.js): a captain
     * who came aboard as a friend works for less, and a partner flying
     * her own ship draws her half of the profit instead of a wage. */
    var mul = person.wageMul == null ? 1 : person.wageMul;
    return Math.round(WAGE_BASE * (0.6 + person.rating * 0.34) * mul);
  }

  /* ---- the wage actually running ---------------------------------------
   *
   * A wage that is printed on a card and never taken is a decoration, and
   * this file's whole argument is that a crew has to COST something. So the
   * payroll runs on the clock, in whole days, and the remainder is carried
   * rather than rounded away — a captain who docks twice in one afternoon
   * pays for one afternoon, not two.
   *
   * `from` is the moment the roster was last paid up to and `paidTo` is the
   * new one, which ADVANCES EVEN WHEN NOBODY IS ABOARD. Leaving it behind
   * on an empty deck would mean the next hand signed on inherited a month
   * of back pay they were not there for.
   */
  var WAGE_DAY = 86400;
  function payrollDue(crew, from, to) {
    var days = Math.floor(((to - from) || 0) / WAGE_DAY);
    if (!(days > 0)) return { days: 0, cr: 0, paidTo: from };
    var cr = 0, list = crew || [];
    for (var i = 0; i < list.length; i++) cr += dailyWage(list[i]) * days;
    return { days: days, cr: Math.round(cr), paidTo: from + days * WAGE_DAY };
  }

  /* ---- what a ship needs -----------------------------------------------
   *
   * Derived from the hull and the fit rather than tabulated, which is this
   * project's habit and the reason a hull nobody has written yet already
   * has the right answer. */
  function needsCrew(ship) {
    var C = global.Combat;
    if (!C || !C.HULLS) return false;
    var hull = C.HULLS[(ship && ship.hullId) || 'talon'];
    return !!hull && (hull.size === 'M' || hull.size === 'L' || hull.size === 'XL');
  }

  /* ---- HOW MANY HANDS SHE TAKES (2026-10-20) -----------------------------
   * Astra: "we also need to know the number of crew required to operate
   * each one without the player flying it, which is the number of crew
   * needed to run the lasers, the engines and the turrets, plus a pilot's
   * requirement unless the player takes control of it."
   *
   * Derived, like needsCrew, so every hull has an answer:
   *   PILOT     one, unless you are the one flying her.
   *   ENGINES   none on a small hull (the pilot minds them), one on an M,
   *             two on an L, and on an XL three plus one per thousand
   *             tonnes dry — a carrier's engine rooms are a town.
   *   LASERS    the pilot fires the forward pair on a small or medium
   *             hull; every other two hardpoints want a gunner, and on an
   *             L or XL — where the pilot only flies — all of them do. A
   *             capital mount is two gunners on its own.
   *   TURRETS   one gunner each (turretCrewing: a good engineer can stand
   *             in, slower).
   * Counted off what is FITTED when a ship is given, so an empty hardpoint
   * needs nobody; off her default outfit when only a hull id is. */
  function crewNeeded(shipOrHull, playerFlying) {
    var C = global.Combat;
    if (!C || !C.HULLS) return { pilot: 0, engineer: 0, gunner: 0, total: 0 };
    var ship = typeof shipOrHull === 'string' ? null : shipOrHull;
    var hullId = ship ? (ship.hullId || 'talon') : shipOrHull;
    var hull = C.HULLS[hullId];
    if (!hull) return { pilot: 0, engineer: 0, gunner: 0, total: 0 };
    var fitted = [];
    if (ship && C.fittedList) {
      fitted = C.fittedList(ship).map(function (f) { return { type: f.type, item: f.item }; });
    } else if (C.standardProbe && C.fitStock && C.fittedList) {
      var probe = C.standardProbe(hullId);
      C.fitStock(probe);
      fitted = C.fittedList(probe).map(function (f) { return { type: f.type, item: f.item }; });
    }
    var size = hull.size || 'M';
    var guns = 0, capitalGuns = 0, turrets = 0;
    fitted.forEach(function (f) {
      if (f.type === 'capital') capitalGuns++;
      else if (f.item.kind === 'gun') guns++;
      else if (f.item.kind === 'turret') turrets++;
    });
    var pilot = playerFlying ? 0 : 1;
    var engineer = size === 'S' ? 0 : size === 'M' ? 1 : size === 'L' ? 2
                 : 3 + Math.floor((hull.dryMass || 0) / 1000);
    var pilotFires = (size === 'S' || size === 'M') ? 2 : 0;
    var gunner = Math.ceil(Math.max(0, guns - pilotFires) / 2) + capitalGuns * 2 + turrets;
    return { pilot: pilot, engineer: engineer, gunner: gunner, total: pilot + engineer + gunner };
  }

  function aboard(ship) { return (ship && ship.crew) || []; }

  function best(ship, role) {
    var list = aboard(ship), top = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].role !== role) continue;
      if (!top || list[i].rating > top.rating) top = list[i];
    }
    return top;
  }

  /* THE ONE THAT MATTERS. How the turret on this ship is being worked, and
   * what that costs. `traverse` and `rate` are multipliers the gunnery
   * code spends; `mode` is what the ship screen says out loud. */
  function turretCrewing(ship) {
    var C = global.Combat;
    var has = !!(ship && ship.turret);
    if (!has) return { turret: false, mode: 'none', traverse: 0, rate: 0 };
    if (!needsCrew(ship)) {
      return { turret: true, mode: 'pilot', traverse: 1, rate: 1,
               why: 'one seat, everything in reach' };
    }
    var g = best(ship, 'gunner');
    if (g) {
      return { turret: true, mode: 'manned', traverse: 1, rate: 1, who: g,
               why: g.name + ' is on it' };
    }
    var e = best(ship, 'engineer');
    if (e && e.rating >= SLAVE_RATING) {
      return { turret: true, mode: 'slaved', traverse: SLAVED_TRAVERSE,
               rate: SLAVED_RATE, who: e,
               why: e.name + ' has it slaved to the targeting system' };
    }
    return { turret: true, mode: 'unmanned', traverse: 0, rate: 0,
             why: 'nobody on the turret' };
  }

  /* ---- WHAT A GUNNER ON THE BRIDGE IS FOR (2026-10-25) -------------------
   * Astra: "gunners act as a stat boost on component heating and energy
   * draw requirements or increased damage/probability of hit for the
   * forward facing guns. They also increase missile targeting accuracy."
   *
   * Asked how the "or" works, she chose BY THE GUNNER: every gunner has a
   * knack, one or the other, and you hire for the one you want.
   *   COOL HAND   the forward guns run cooler and draw less — and the
   *               lower draw counts at the yard, so a good one lets you fit
   *               guns the reactor could not otherwise carry (her choice);
   *   MARKSMAN    they hit harder, and the aiming cone is wider, so a shot
   *               a little off the nose still connects.
   * And every gunner, of either knack, steadies the missiles' seekers.
   *
   * WHO GIVES IT. The turret takes the best gunner aboard (turretCrewing
   * above has always picked that way), so the knacks come from the OTHER
   * gunners — the ones at the bridge's gunnery consoles. One of each knack
   * counts, the best of each. On a small hull the pilot works the turret,
   * so a gunner there is all bridge. Scaled by rating: a green hand gives a
   * fifth of what an exceptional one does.
   *
   * The knack is a pure function of who they are (their id), so it needs no
   * save field and a hand in the hall has the same knack aboard. */
  var KNACKS = {
    cool:     { id: 'cool', name: 'cool hand',
                what: 'runs the forward guns cooler and on less power' },
    marksman: { id: 'marksman', name: 'marksman',
                what: 'lays the forward guns: harder hits, a wider cone' }
  };
  /* At an exceptional rating (5). */
  var GUNNERY_MAX = { heat: 0.30, power: 0.25, dmg: 0.25, cone: 0.8, track: 0.6, slip: 0.5 };

  function knackOf(p) {
    if (!p || p.role !== 'gunner') return null;
    if (p.knack && KNACKS[p.knack]) return p.knack;
    var s = String(p.id || p.name || ''), h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h >>> 7) & 1 ? 'cool' : 'marksman';
  }

  function gunnery(ship) {
    var gunners = aboard(ship).filter(function (p) { return p.role === 'gunner'; });
    gunners.sort(function (a, b) { return (b.rating - a.rating) || (String(a.id) < String(b.id) ? -1 : 1); });
    var mounts = (ship && ship.turret && needsCrew(ship)) ? 1 : 0;
    var bridge = gunners.slice(mounts);
    var cool = null, mark = null;
    bridge.forEach(function (p) {
      var k = knackOf(p);
      if (k === 'cool' && (!cool || p.rating > cool.rating)) cool = p;
      if (k === 'marksman' && (!mark || p.rating > mark.rating)) mark = p;
    });
    var fc = cool ? cool.rating / 5 : 0, fm = mark ? mark.rating / 5 : 0;
    var guide = gunners.length ? gunners[0] : null, fg = guide ? guide.rating / 5 : 0;
    return {
      mounts: gunners.slice(0, mounts), bridge: bridge, cool: cool, mark: mark, guide: guide,
      heatMul: 1 - GUNNERY_MAX.heat * fc, powerMul: 1 - GUNNERY_MAX.power * fc,
      dmgMul: 1 + GUNNERY_MAX.dmg * fm, coneMul: 1 + GUNNERY_MAX.cone * fm,
      trackMul: 1 + GUNNERY_MAX.track * fg, slipMul: 1 - GUNNERY_MAX.slip * fg
    };
  }

  /* Can this ship be given an order? The next slice needs it and the
   * answer belongs with the people, not with the order. */
  function canBeOrdered(rec) {
    return !!(rec && rec.crew && best(rec, 'pilot'));
  }

  /* One line for a roster. */
  function describe(p) {
    var k = knackOf(p);
    return p.name + '  ·  ' + ROLES[p.role].name.toLowerCase() + ', ' +
           ratingWord(p.rating) + (k ? ', ' + KNACKS[k].name : '');
  }

  var Crew = {
    ROLES: ROLES, ROLE_IDS: ROLE_IDS, ratingWord: ratingWord,
    SLAVE_RATING: SLAVE_RATING,
    SLAVED_TRAVERSE: SLAVED_TRAVERSE, SLAVED_RATE: SLAVED_RATE,
    HALL_WINDOW: HALL_WINDOW,
    forHire: forHire, make: make, personName: personName,
    signingFee: signingFee, dailyWage: dailyWage,
    WAGE_DAY: WAGE_DAY, payrollDue: payrollDue,
    needsCrew: needsCrew, crewNeeded: crewNeeded, aboard: aboard, best: best,
    turretCrewing: turretCrewing, canBeOrdered: canBeOrdered,
    KNACKS: KNACKS, GUNNERY_MAX: GUNNERY_MAX, knackOf: knackOf, gunnery: gunnery,
    describe: describe
  };

  global.Crew = Crew;
  if (typeof module !== 'undefined' && module.exports) module.exports = Crew;
})(typeof window !== 'undefined' ? window : globalThis);
