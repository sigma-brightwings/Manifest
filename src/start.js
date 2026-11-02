/* start.js — what a new career is handed (2026-11-02).
 *
 * Astra: "I also want to be able to select the ship I start with based on
 * what I'm wanting to focus on - trade, mining, combat." Asked how, she
 * chose three difficulties: an EASY start in a working hull built for the
 * job, a NORMAL start in the small hull of each trade, and HARD, which is
 * the career this game has always opened with — a Talon Courier, a pulse
 * laser and 3,200 credits — "the Talon stays as the hard start".
 *
 * Three rules shape everything below.
 *
 *  1. HARD IS NOT A PRESET. It is the absence of one. `plan('hard')` is null
 *     and newGame takes exactly the path it took before this file existed,
 *     so the hard career cannot drift away from the one every test, every
 *     save and every bug report so far was made against. A preset that
 *     merely re-described the Talon would be a second copy of the starting
 *     kit, and the respawn bug in combat.js's STARTING_FIT note is what a
 *     second copy of the starting kit turns into.
 *
 *  2. WITHIN A DIFFICULTY, EVERY FOCUS IS WORTH THE SAME. Hull at list,
 *     every fitting at list, any seekers at list, and credits on top — and
 *     the credits are what make the three totals agree. The most expensive
 *     outfit gets the difficulty's FLOOR in cash; the others get the
 *     difference as well. So choosing a focus is choosing what shape your
 *     money is in, not how much of it you have: the Dart pilot is not
 *     poorer than the Tallyman's, she simply has less of it in the hull.
 *     List price, not the 0.9 package price buyPrice charges, because the
 *     question is what the start is WORTH, and a floor discount is a fact
 *     about one sale.
 *
 *  3. NO DICE. Nothing here draws from any stream — the port a career
 *     starts at is the nearest one of the right kind, by distance and then
 *     by id, so it is a pure function of the seed with nothing to fork. If
 *     a draw is ever wanted here (a choice between equally near ports, say)
 *     it goes in its own substream: base.fork('start').
 *
 * Every hull still gets HULL_STANDARD — the cargo scoop and the Class 1
 * cruise drive — before the preset's own list, filed the same way the yard
 * files it, so a preset can never be the one hull that left without a
 * scoop. */
(function (global) {
  'use strict';

  var DIFFICULTIES = ['easy', 'normal', 'hard'];
  var FOCI = ['trade', 'mining', 'combat'];

  var DIFF_NAME = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
  var FOCUS_NAME = { trade: 'Trade', mining: 'Mining', combat: 'Combat' };

  /* ---- the presets ------------------------------------------------------
   * The hulls are Astra's. The fits are checked against each hull's real
   * slots, power and fit mass (start.test), and where the obvious fit did
   * not go in, the note says why rather than leaving a gap to look like a
   * mistake.
   *
   * `floor` is the cash the DEAREST outfit at that difficulty carries; see
   * rule 2. Fifteen thousand on easy is a Tallyman hold's worth of most
   * mid-price goods, which is what a trade start has to be able to do on
   * day one. Six thousand on normal is about two Talon holds of the cheap
   * end — enough that a Bollard pilot can also buy fuel and a first rock
   * torpedo, not so much that the start stops being a start. */
  var PRESETS = {
    easy: {
      floor: 15000,
      trade: { hull: 'trader', fit: ['phint', 'phpulse', 'shield', 'tradescan'],
               note: 'the Tallyman\'s own maker\'s fit' },
      /* ONE HARDPOINT, and the mining laser takes it: the Sump's stock
       * pulse laser has nowhere to go. A miner with a shield and no gun is
       * the honest version of "fitted for ore" — the belt is where she
       * earns, not where she fights. */
      mining: { hull: 'sump', fit: ['mininglaser', 'surveyscan', 'shield'],
                note: 'ore-fitted: the laser takes the only hardpoint' },
      /* A beam to drain shields and a pulse to work the hull — the pair the
       * damage model is built around (see the vsShield / vsHull note in
       * combat.js) — and a shield, which the Dart's 1.6 MW margin over
       * twin intermittents would not otherwise carry. */
      combat: { hull: 'dart', fit: ['phbeam', 'phpulse', 'shield'],
                seekers: { id: 'hawk', n: 4 },
                note: 'beam and pulse, a shield and four Hawks' }
    },
    normal: {
      floor: 6000,
      /* The Talon is the hard start's hull too; what normal adds is the
       * trade analyser and a shield, and most of all the money. */
      trade: { hull: 'talon', fit: ['phpulse', 'tradescan', 'shield'],
               note: 'a Talon with an analyser and a shield' },
      mining: { hull: 'bollard', fit: ['mininglaser', 'surveyscan', 'shield'],
                note: 'ore-fitted: the laser takes the only hardpoint' },
      /* NO SHIELD, and not by choice. A generator is four tonnes and the
       * Lance's whole fit budget is six, one of which the scoop has: with a
       * shield aboard there is room for no gun at all (start.test pins the
       * refusal). So the Lance's fight fit is the better pair of guns and
       * four seekers in her one rack — the strike-wing loadout she was
       * built for. */
      combat: { hull: 'fighter', fit: ['phbeam', 'phint'],
                seekers: { id: 'hawk', n: 4 },
                note: 'beam and intermittent, four Hawks (no room for a shield)' }
    }
  };

  function Combat() { return global.Combat; }

  function itemPrice(id) {
    var C = Combat(), it = C && C.EQUIPMENT[id];
    return (it && it.price) || 0;
  }

  function seekerValue(sk) {
    var C = Combat(), m = sk && C && C.MISSILES && C.MISSILES[sk.id];
    return m ? (m.price || 0) * sk.n : 0;
  }

  /* The kit before the cash: hull, HULL_STANDARD, the preset's list and any
   * seekers, all at list. */
  function kitValue(p) {
    var C = Combat();
    var v = C.HULLS[p.hull].price;
    var std = C.HULL_STANDARD || ['cargoscoop', 'cruise1'];
    for (var i = 0; i < std.length; i++) v += itemPrice(std[i]);
    for (var j = 0; j < p.fit.length; j++) v += itemPrice(p.fit[j]);
    return v + seekerValue(p.seekers);
  }

  /* What every focus at this difficulty is worth: the dearest kit plus the
   * floor. Computed, not written down, so repricing a laser cannot quietly
   * make one focus richer than the others. */
  function totalFor(difficulty) {
    var set = PRESETS[difficulty];
    if (!set) return 0;
    var top = 0;
    for (var i = 0; i < FOCI.length; i++) top = Math.max(top, kitValue(set[FOCI[i]]));
    return top + set.floor;
  }

  /* The whole start, or null for HARD (rule 1). */
  function plan(difficulty, focus) {
    var set = PRESETS[difficulty];
    if (!set || !set[focus]) return null;
    var p = set[focus], C = Combat(), h = C.HULLS[p.hull];
    var kit = kitValue(p), total = totalFor(difficulty);
    return {
      difficulty: difficulty, focus: focus,
      hull: p.hull, hullName: h.name, cargoCap: h.cargoCap,
      fit: p.fit.slice(), seekers: p.seekers ? { id: p.seekers.id, n: p.seekers.n } : null,
      note: p.note,
      kit: kit, credits: total - kit, total: total
    };
  }

  /* ---- putting her together ---------------------------------------------
   * In the order buyHull uses and for the reason it gives: the hull FIRST,
   * because slot keys are derived from it and gear filed before the hull is
   * decided goes against the wrong slots. Then the standard kit, then the
   * preset's list. Every fitting goes through canFit, and one that is
   * refused is reported back rather than dropped — start.test fails on any
   * refusal, so a repriced or re-massed item cannot silently thin a start. */
  function outfit(ship, p, G) {
    var C = Combat(), h = C.HULLS[p.hull];
    ship.disguise = null;
    ship.hullId = h.id;
    ship.meshKind = null;
    /* The hull's birth mark, derived exactly as buyHull derives it — which
     * hull, where, at what hour — so the cockpit flair it seeds is the same
     * for the same career every time. */
    var here = G && G.here;
    ship.bornId = h.id + '@' + (here ? here.id : 'void') + '#' +
                  Math.round(((G && G.t) || 0) / 3600);
    ship.dryMass = h.dryMass;
    ship.thrustKN = h.thrustKN;
    ship.thrusterCap = h.thrusterCap;
    ship.thrusterFuel = h.thrusterCap;
    ship.fuelCap = h.fuelCap;
    ship.fuel = h.fuelCap;
    ship.cargoCap = h.cargoCap;
    ship.hullMax = h.hullMax;
    ship.hullHp = h.hullMax;
    ship.fit = {};
    ship.groups = {};
    var refused = [];
    var list = (C.HULL_STANDARD || ['cargoscoop', 'cruise1']).concat(p.fit);
    for (var i = 0; i < list.length; i++) {
      var v = C.canFit(ship, list[i]);
      if (v.ok) ship.fit[v.key] = list[i];
      else refused.push(list[i] + ': ' + v.why);
    }
    C.syncLegacy(ship);
    /* Seekers are rounds in a rack, not fittings; the rack shape is the one
     * racksOf migrates to. */
    ship.racks = {};
    ship.missiles = 0;
    ship.missileId = null;
    if (p.seekers && (C.rackSlots ? C.rackSlots(ship) : 1) > 0) {
      ship.racks[p.seekers.id] = { id: p.seekers.id, n: p.seekers.n, batch: null };
      ship.missileId = p.seekers.id;
      ship.missiles = p.seekers.n;
      if (C.syncRacks) C.syncRacks(ship);
    }
    ship.credits = p.credits;
    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(ship);
    return refused;
  }

  /* ---- where she starts --------------------------------------------------
   * TRADE: wherever a new career has always started (null here means
   * "leave enterSystem's own choice alone").
   * MINING: the nearest mining head — every mining head is a Guild hall,
   * that is what sells the Guild's rock torpedoes (combat.torpedoSoldAt).
   * Measured on 30 seeds: 26 home systems have one.
   * COMBAT: the nearest shipyard, because that is where a fighter is
   * refitted; failing that the most developed port, which has the deepest
   * outfitter shelf. Measured: 15 of 30 home systems have a yard.
   *
   * "Nearest" is from the world a trade start would dock at, by the
   * distance between the two worlds at t = 0, then surface before orbital
   * (the ground dock path places the ship itself — see enterSystem), then
   * id. All of that is in the seed, so the same seed starts at the same
   * port every time. */
  function portScore(sys, from, p) {
    var Sim = global.Sim;
    var a = Sim.bodyPosition(from, sys, 0), b = Sim.bodyPosition(p.parentBody, sys, 0);
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function dockable(p) {
    return !!(p && p.market && p.parentBody && (p.surface || p.orbit));
  }

  function nearestPort(sys, from, test) {
    var best = null, bestD = Infinity;
    var ports = (sys && sys.ports) || [];
    for (var i = 0; i < ports.length; i++) {
      var p = ports[i];
      if (!dockable(p) || !test(p)) continue;
      var d = from ? portScore(sys, from, p) : 0;
      var better = d < bestD - 1e-6 ||
        (Math.abs(d - bestD) <= 1e-6 && best &&
         ((p.surface && !best.surface) ||
          (!!p.surface === !!best.surface && String(p.id) < String(best.id))));
      if (!best || better) { best = p; bestD = d; }
    }
    return best;
  }

  function isMiningHead(p) { return !!(p.market && p.market.role === 'mining'); }

  /* The port for this focus in this system, or null if there is none of
   * that kind here. `from` is the trade start's world. */
  function pickPort(sys, focus, from) {
    var C = Combat();
    if (focus === 'mining') return nearestPort(sys, from, isMiningHead);
    if (focus === 'combat') {
      var yard = nearestPort(sys, from, function (p) { return C.isShipyard(p); });
      if (yard) return yard;
      var best = null;
      ((sys && sys.ports) || []).forEach(function (p) {
        if (!dockable(p)) return;
        if (!best || p.market.dev > best.market.dev + 1e-9 ||
            (Math.abs(p.market.dev - best.market.dev) <= 1e-9 && String(p.id) < String(best.id))) best = p;
      });
      return best;
    }
    return null;
  }

  /* ---- words --------------------------------------------------------------
   * For the title rows and the arrival line. The guns are counted and named
   * because "two guns" tells you nothing a fight will care about. */
  function itemName(id) {
    var C = Combat(), it = C && C.EQUIPMENT[id];
    return it ? it.name : id;
  }

  /* Short gun names: the title row has room for "beam, pulse" and not
   * for "Photon beam laser, Photon pulse laser". The family is dropped
   * because every start gun is a photon; the mining laser keeps its whole
   * name, because "mining" alone reads like a job, not a gun. */
  function gunName(it) {
    if (it.id === 'mininglaser') return 'mining laser';
    return it.name.replace(/^Photon /, '').replace(/ laser$/, '').toLowerCase();
  }

  function gunsLine(p) {
    var C = Combat(), names = [];
    for (var i = 0; i < p.fit.length; i++) {
      var it = C.EQUIPMENT[p.fit[i]];
      if (it && it.slot === 'hardpoint') names.push(gunName(it));
    }
    return names.length ? names.join(', ') : 'unarmed';
  }

  /* The rest of what she carries that a choice would turn on. */
  var KIT_SHORT = { shield: 'shield', tradescan: 'trade analyser', surveyscan: 'survey scanner' };
  function kitLine(p) {
    var out = [];
    for (var i = 0; i < p.fit.length; i++) if (KIT_SHORT[p.fit[i]]) out.push(KIT_SHORT[p.fit[i]]);
    if (p.seekers) out.push(p.seekers.n + ' seekers');
    return out.join(', ');
  }

  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* A focus row says four things, the same four in the same order, so
   * three of them stacked are a comparison rather than three descriptions:
   * the hull and the cash on the row itself (the cash is the number a
   * choice turns on, so it is never the part that gets clipped), and the
   * hold, the guns and the kit on the line under it. */
  function hintLine(p) { return p.hullName + '  \u00b7  ' + fmt(p.credits) + ' cr'; }

  function rowLine(p) {
    var kit = kitLine(p);
    return p.cargoCap + ' t hold \u00b7 guns: ' + gunsLine(p) + (kit ? ' \u00b7 ' + kit : '');
  }

  /* The same four things for HARD, read off the hull and the spec the
   * career is actually built from rather than written down, so the row
   * cannot describe a Talon the game no longer issues. */
  function hardLine() {
    var C = Combat(), h = C.HULLS.talon;
    var spec = (global.Gen && global.Gen.SHIP_SPEC) || {};
    return h.name + ' \u00b7 ' + (spec.cargoCap || h.cargoCap) + ' t hold \u00b7 guns: pulse \u00b7 ' +
           fmt(spec.credits || 3200) + ' cr';
  }

  /* A difficulty row's second line: the three hulls and what each focus
   * is worth at it. */
  function diffLine(difficulty) {
    if (!PRESETS[difficulty]) return hardLine();
    var C = Combat(), names = [];
    for (var i = 0; i < FOCI.length; i++) {
      names.push(C.HULLS[PRESETS[difficulty][FOCI[i]].hull].name.split(' ')[0]);
    }
    return names.join(' / ') + ' \u00b7 ' + fmt(totalFor(difficulty)) + ' cr each, ship and cash';
  }

  /* What the focus set you up for, said on the pad. */
  function arrivalLine(p, port) {
    var gear = [];
    for (var i = 0; i < p.fit.length; i++) {
      var id = p.fit[i];
      if (id === 'mininglaser' || id === 'surveyscan' || id === 'shield' || id === 'tradescan') gear.push(itemName(id).toLowerCase());
    }
    var at = port ? port.name : 'port';
    var why = p.focus === 'mining'
      ? (port && isMiningHead(port) ? at + ' is a mining head - the Guild hall sells rock torpedoes and buys ore. '
                                    : 'No mining head within reach; this is the nearest port. ') +
        'Orbit a world to map what is under it (the SURVEY page), cut rock with the laser, scoop the chunks'
      : p.focus === 'combat'
        ? (port && Combat().isShipyard(port) ? at + ' is a shipyard - refits and hulls are sold here. '
                                             : at + ' has the best outfitter in the system. ') +
          'Bounties and patrol work are on the mission board'
        : 'Buy low here, sell where it is scarce - the analyser shows you where';
    return FOCUS_NAME[p.focus] + ' start: ' + p.hullName +
           (gear.length ? ' with ' + gear.join(', ') : '') +
           ', ' + fmt(p.credits) + ' cr.  ' + why + '.';
  }

  /* The ONE line `say` can hold on the pad (main.js newGame explains why it
   * is one): what you are in, where, what kind of port it is, and the keys
   * off the pad. The long version goes in the journal. */
  function dockLine(p, port) {
    var kind = port && isMiningHead(port) ? ' (mining head, Guild hall)'
             : port && Combat().isShipyard(port) ? ' (shipyard)' : '';
    return FOCUS_NAME[p.focus] + ' start: ' + p.hullName + ' at ' +
           (port ? port.name : 'port') + kind +
           '  -  F4 to trade or ask to launch, F5 for the yard, then U';
  }

  var Start = {
    DIFFICULTIES: DIFFICULTIES, FOCI: FOCI, PRESETS: PRESETS,
    DIFF_NAME: DIFF_NAME, FOCUS_NAME: FOCUS_NAME,
    plan: plan, kitValue: kitValue, totalFor: totalFor,
    outfit: outfit, pickPort: pickPort, isMiningHead: isMiningHead,
    rowLine: rowLine, hintLine: hintLine, gunsLine: gunsLine, kitLine: kitLine, hardLine: hardLine, diffLine: diffLine,
    arrivalLine: arrivalLine, dockLine: dockLine, fmt: fmt
  };
  global.Start = Start;
  if (typeof module !== 'undefined' && module.exports) module.exports = Start;
})(typeof window !== 'undefined' ? window : globalThis);
