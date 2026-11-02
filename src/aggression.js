/* aggression.js - who hunts whom (PLAN.md Phase 9), 2026-10-31.
 *
 * Astra: "we need to add NPC aggression, including pirates, police
 * arresting or disabling fleeing ships, and have that tie into the faction
 * standing stuff." Her choices, the same evening:
 *
 *   WHERE   real fights near you (the woken bubble, Sim.WAKE_RANGE), and
 *           off-screen raids as news: rolled from the timetable, the
 *           ship arrives light, her port runs short, word is on the dock.
 *   PREY    "best prey wins": cargo value x vulnerability / distance, over
 *           every candidate in reach - you are one of them. A fat, slow,
 *           laden freighter is robbed first; a lean armed ship is left be.
 *   LAW     pirates and smugglers run from the law; police shoot out the
 *           drive, come alongside and arrest - crew off, ship impounded.
 *           Syndicate RUNNERS (generate.js buildRunners) are never chased:
 *           "the syndicate pays off the police".
 *   STANDING  all four: HOSTILE standing and a faction's patrols shoot on
 *           sight; helping a victim or an arrest raises standing; rival
 *           empires' patrols skirmish where both fly; and getting in the
 *           way of an arrest costs you with the force and its empire.
 *
 * THE ONE STRUCTURAL CHANGE is Sim.updateEncounters asking focusOf() who a
 * ship is flying at, instead of assuming you. Everything else here is
 * state on the specs that are already live (sys.patrols): `target` (who
 * she is closing on), `threat` (who she is running from), `defendTarget`
 * (who she fires back at while she runs), `fugitive` (the cop running her
 * down). None of it is saved: a fight is a thing that happens while you
 * are there, and Sim.sleepNpc ends it when you are not.
 */
(function (global) {
  'use strict';
  var V = global.V;

  var PREY_EVERY = 5;           // s: how often an idle pirate looks round
  var PREY_KM = 2500;           // ...and how far
  var PREY_FLOOR_KM = 50;       // distance never counts for less than this
  var ROB_KM = 15;              // close enough to call on her to heave to
  var LOOT_KM = 2, LOOT_S = 15; // alongside a disabled ship, this long, to strip her
  var SATED_S = 3600;           // a paid pirate goes to sell it before looking again
  var RAID_TAKE = 0.6;          // of each line in her hold
  var PIRATE_RUN_HULL = 0.4;    // a pirate someone is hurting breaks off here
  var LAW_SEE_KM = 1500;        // a cutter sees a pirate this far
  var SCAN_KM = 400, SCAN_EVERY = 10, RESCAN_S = 3600;
  var SMUGGLER_P = 0.08;        // of independent lines in a system with a fence
  var ARREST_KM = 1.5, ARREST_S = 20, ARREST_STANDOFF = 0.5;
  var COP_DISABLE_HULL = 0.15;  // the law does not kill a runner: under this, her drive goes
  var RIVAL_SEE_KM = 800, WITHDRAW_HULL = 0.5, RIVAL_REST_S = 3600, RIVAL_STANDOFF = 6;
  var CHASE_KM = 4;             // a chaser holds this far off, inside every NPC gun's range
  var HOSTILE_STANDING = -40, HOSTILE_KM = 1500;
  var HELP_KILL = 5, HELP_DRIVEOFF = 2, HELP_ARREST = 3, HELP_WINDOW = 600;
  var INTERFERE = 10, INTERFERE_EMPIRE = 5;
  var SEE_KM = 6000;            // said aloud if it happens this near you
  /* A Syndicate runner that turns on a civilian (2026-11-01). Astra, in
   * October: "Syndicate runners don't get chased by cops unless they are
   * firing on a civilian vessel as the aggressor. The syndicate pays off
   * the police." The payoff covers what she carries, not what she does. */
  var RUNNER_TURN_P = 0.12;     // of a runner's legs near you, she turns on somebody
  var RUNNER_PREY_KM = 600;     // and only on a ship already close: opportunity, not a hunt
  var RUNNER_LOOK_S = 8;        // how often the runners near you are looked over
  var AGGRESSOR_S = 1800;       // firing first marks her this long in the law's eyes

  function C() { return global.Combat; }
  function S() { return global.Sim; }
  function M() { return global.Missions; }
  function hash01(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function alive(sp) { return !!(sp && !sp.dead && sp.live && sp.live.pos); }
  function dist(a, b) { return V.dist(a.live.pos, b.live.pos); }
  function near(G, sp) { return !!(G && G.ship && G.ship.pos && sp && sp.live && V.dist(sp.live.pos, G.ship.pos) < SEE_KM); }
  function say(G, hooks, sp, m, s) { if (hooks && hooks.say && near(G, sp)) hooks.say(m, s || 5); }
  function nm(sp) { return (sp && sp.name) || 'ship'; }
  /* "the Slipstream Wain", but "The Salt" stays "The Salt". */
  function the(sp) { var n = nm(sp); return /^the /i.test(n) ? n : 'the ' + n; }
  function The(sp) { var n = the(sp); return n.charAt(0).toUpperCase() + n.slice(1); }
  function hullFrac(sp) {
    var max = sp.hullMax || 50, hp = sp.hullHp === undefined ? max : sp.hullHp;
    return hp / max;
  }

  /* The law, for arrests and skirmishes: a cutter or a warship under a
   * lawful flag. The Syndicate's own enforcers are police-kind, but they
   * run nobody down for anybody. */
  function lawful(sp) {
    return !!sp && (sp.kind === 'police' || sp.kind === 'navy') && sp.faction && sp.faction !== 'outlaw';
  }
  function patrolKind(sp) { return !!sp && (sp.kind === 'police' || sp.kind === 'navy'); }

  /* An empire, from any faction: walk the parents (faction-hierarchy). */
  function factionOf(G, sys, id) {
    var g = G && G.galaxy;
    return (g && g.factionById && g.factionById[id]) || (sys && sys.factionById && sys.factionById[id]) || null;
  }
  function empireOf(G, sys, id) {
    var f = factionOf(G, sys, id), guard = 0;
    while (f && f.parentId && guard++ < 6) f = factionOf(G, sys, f.parentId);
    return f ? f.id : id || null;
  }
  function facName(G, sys, id) { var f = factionOf(G, sys, id); return (f && f.name) || id || 'them'; }
  function bump(G, fac, d) { if (fac && M() && M().bumpStanding) M().bumpStanding(G, fac, d); }
  function standing(G, fac) { return M() && M().standing ? M().standing(G, fac) : 0; }

  /* ---- who she is flying at ------------------------------------------- */
  function focusOf(spec, ship) {
    if (!spec || spec.hostileToPlayer) return ship;
    if (spec.mode === 'breakoff' && alive(spec.threat)) return spec.threat.live;
    if (alive(spec.target) && (spec.mode === 'attack' || spec.mode === 'chase' || spec.mode === 'alongside')) return spec.target.live;
    return ship;
  }

  /* ---- what a hold is worth, and how soft a hull is ------------------- */
  function cargoValue(list) {
    var Eco = global.Economy, v = 0;
    (list || []).forEach(function (m) {
      var c = Eco && Eco.BY_ID ? Eco.BY_ID[m.cid] : null;
      if (c && !c.waste) v += (m.qty || m.tonnes || 0) * (c.base || 0);
    });
    return v;
  }
  function playerValue(ship) {
    var Eco = global.Economy, v = 0;
    for (var cid in (ship.cargo || {})) {
      var c = Eco && Eco.BY_ID ? Eco.BY_ID[cid] : null;
      if (c && !c.waste) v += (ship.cargo[cid] || 0) * (c.base || 0);
    }
    return v + (ship.credits || 0) * 0.05;
  }
  function playerArmed(ship) {
    return !!(ship.gun || ship.turret || ship.missiles > 0 ||
              (ship.fit && Object.keys(ship.fit).some(function (k) { return /^hardpoint/.test(k) && ship.fit[k]; })));
  }
  function playerVuln(ship) {
    var v = playerArmed(ship) ? 0.5 : 1.4;
    var max = ship.hullMax || 100, hp = ship.hullHp === undefined ? max : ship.hullHp;
    return v * (1 + 0.5 * (1 - Math.max(0, Math.min(1, hp / max))));
  }
  function stateVuln(st) {
    var cls = st.cls || (st.route && st.route.cls);
    return (cls === 'shuttle' || cls === 'tender') ? 1.6 : 1.0;
  }

  /* Every candidate in reach, scored. Ships the law sits over are left
   * alone - flying a patrol lane is genuinely safer (PLAN Phase 9). */
  function choosePrey(sys, G, pirate, t) {
    var Sm = S(), best = null, ship = G.ship, here = pirate.live.pos;
    var lawWatch = function (pos) { return sys.tithe !== 'suspected' && Sm.policeNearby && Sm.policeNearby(sys, t, pos); };
    if (ship && ship.pos && !ship.docked && !ship.landed) {
      var dp = V.dist(ship.pos, here);
      if (dp < PREY_KM && !lawWatch(ship.pos)) {
        best = { player: true, score: playerValue(ship) * playerVuln(ship) / Math.max(dp, PREY_FLOOR_KM) };
      }
    }
    var list = Sm.trafficAll ? Sm.trafficAll(sys, t) : [];
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      if (!st || !st.pos || st.phase === 'moored' || st.landed || st.inside || st.towed) continue;
      if (!st.route || st.route.dead || st.route.joined || st.route.oneWay) continue;
      var d = V.dist(st.pos, here);
      if (d > PREY_KM) continue;
      var val = cargoValue(st.manifest);
      if (!(val > 0)) continue;
      if (lawWatch(st.pos)) continue;
      var sc = val * stateVuln(st) / Math.max(d, PREY_FLOOR_KM);
      if (!best || sc > best.score) best = { state: st, score: sc };
    }
    return best;
  }

  /* ---- pirates ---------------------------------------------------------- */
  function startRobbery(sys, G, pirate, state, t, hooks) {
    var v = C().liftTrader(sys, state, t);
    if (!v || !v.live) return null;
    v._state = state;                      // her leg, for the shortfall at her port
    pirate.target = v;
    pirate.mode = 'chase'; pirate.standoffKm = CHASE_KM;
    pirate.preyName = v.name;
    v.threat = pirate;
    v.mode = 'breakoff';
    say(G, hooks, pirate, The(pirate) + ' is running down ' + the(v), 5);
    return v;
  }

  /* What she gives up: RAID_TAKE of every line, and her port is short of
   * it when she docks (ShipTrade.shortDelivery, saved like a cargo bought
   * off her). The pirate goes to sell it. */
  function strip(sys, G, pirate, v, t, hooks) {
    var st = v._state, took = [];
    (v.manifest || []).forEach(function (m) {
      var q = Math.round((m.qty || m.tonnes || 0) * RAID_TAKE);
      if (!(q > 0)) return;
      took.push({ cid: m.cid, qty: q });
      if (st && global.ShipTrade && global.ShipTrade.shortDelivery) {
        try { global.ShipTrade.shortDelivery(G, sys, st, m.cid, q, t); } catch (e) { /* no port for it */ }
      }
    });
    v.robbed = { by: pirate.id, at: t, took: took };
    pirate.loot = { from: v.id, at: t, value: cargoValue(took) };
    pirate.target = null;
    pirate.mode = 'breakoff';
    pirate.threat = v;
    v.threat = pirate;
    v.mode = 'breakoff';
    v.defendTarget = null;
    var Eco = global.Economy, what = took.length && Eco && Eco.BY_ID[took[0].cid] ? took[0].qty + 't of ' + Eco.BY_ID[took[0].cid].name : 'her hold';
    say(G, hooks, pirate, The(pirate) + ' took ' + what + ' off ' + the(v) + ' and is breaking away', 6);
    return took;
  }

  function robbery(sys, G, pirate, t, hooks) {
    var v = pirate.target;
    var d = dist(pirate, v);
    if (v.disabled) {
      /* Dead in space: alongside, and strip her. Flown as a close chase -
       * 'alongside' is the mode of a ship YOU asked aboard (boarding.js). */
      pirate.mode = 'chase';
      pirate.standoffKm = 0.3;
      if (d < LOOT_KM) {
        if (!pirate.lootSince) pirate.lootSince = t;
        if (t - pirate.lootSince >= LOOT_S) strip(sys, G, pirate, v, t, hooks);
      } else pirate.lootSince = 0;
      return;
    }
    pirate.mode = 'chase'; pirate.standoffKm = CHASE_KM;
    if (d > ROB_KM || v.demandedBy) return;
    /* "Heave to." Seeded per pair: the same captain answers the same
     * pirate the same way. */
    v.demandedBy = pirate.id;
    if (C().broadcastDistress) C().broadcastDistress(sys, G, t, v, 'demand', near(G, v) ? hooks : null);
    var armed = C().isArmedNpc ? C().isArmedNpc(v) : false;
    if (hash01('yield|' + v.id + '|' + pirate.id) < (armed ? 0.45 : 0.75)) {
      strip(sys, G, pirate, v, t, hooks);
      return;
    }
    v.refused = true;
    if (armed) v.defendTarget = pirate;
    say(G, hooks, v, The(v) + ' refuses ' + the(pirate) + ' - she is under fire', 5);
  }

  function pirates(sys, G, t, hooks) {
    sys.patrols.forEach(function (sp) {
      if (!alive(sp) || sp.kind !== 'pirate' || sp.disabled || sp.hostileToPlayer) return;
      if (alive(sp.fugitive)) return;                      // running from the law
      if (alive(sp.target)) { robbery(sys, G, sp, t, hooks); return; }
      if (sp.loot && t - sp.loot.at < SATED_S) return;     // gone to sell it
      if (sp.mode !== 'intercept' || t < (sp.preyAt || 0)) return;
      sp.preyAt = t + PREY_EVERY;
      var best = choosePrey(sys, G, sp, t);
      if (best && best.state) startRobbery(sys, G, sp, best.state, t, hooks);
    });
  }

  /* ---- Syndicate runners who fire first (2026-11-01) --------------------
   * A runner is ordinary traffic flying the Syndicate's flag (generate.js
   * buildRunners). The law leaves her alone, because the Syndicate pays it
   * to. Some legs she turns on a soft civilian beside her, and FIRES
   * FIRST, no "heave to": she is the aggressor, which is the one thing the
   * payoff does not cover. Any lawful cutter that sees her then runs her
   * down exactly as it would a pirate.
   *
   * Seeded per leg (route id and cycle), so the same runner on the same
   * leg makes the same choice however often you reload; only near you,
   * because a fight is a thing that happens while you are there; and only
   * an armed hull (a shuttle has nothing to fire). */
  function legKey(st, t) {
    var r = st.route;
    var cyc = r && r.period > 0 && r.t0 !== undefined ? Math.floor((t - r.t0) / r.period) : 0;
    return r.id + '|' + cyc + (st.outbound === false ? 'b' : 'o');
  }
  function civilianState(st) {
    return !!(st && st.route && !st.route.runner && st.route.flag !== 'outlaw' && !st.route.dead &&
              !st.route.joined && !st.route.oneWay && st.pos && st.phase !== 'moored' &&
              !st.landed && !st.inside && !st.towed);
  }
  function runners(sys, G, t, hooks) {
    var Sm = S(), ship = G.ship;
    if (!ship || !ship.pos || !Sm.trafficAll) return;
    if (t < (sys._runnerLookAt || 0)) return;
    sys._runnerLookAt = t + RUNNER_LOOK_S;
    var list = Sm.trafficAll(sys, t);
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      if (!st || !st.route || !st.route.runner || !st.pos || st.phase === 'moored' || st.landed || st.inside) continue;
      if (st.route.dead || st.route.suppressed) continue;           // already lifted, or gone
      if (V.dist(st.pos, ship.pos) > SEE_KM) continue;
      if (!C().isArmedNpc({ cls: st.cls || st.route.cls })) continue;
      var key = legKey(st, t);
      if (st.route.turnLeg === key) continue;                       // asked once a leg
      st.route.turnLeg = key;
      if (hash01('runner-turn|' + (sys.seed || '') + '|' + key) >= RUNNER_TURN_P) continue;
      /* The softest, richest civilian close by, and only one she can
       * take: unarmed, or no tougher than she is. The first runner tried
       * in the suite was a 40-hull hauler that picked a 55-hull freighter,
       * lost the exchange and died; a captain running for the Syndicate
       * knows better. */
      var myHull = hullOfCls(st.cls || st.route.cls);
      var best = null;
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (c === st || !civilianState(c)) continue;
        var ccls = c.cls || c.route.cls;
        if (C().isArmedNpc({ cls: ccls }) && hullOfCls(ccls) > myHull) continue;
        var d = V.dist(c.pos, st.pos);
        if (d > RUNNER_PREY_KM) continue;
        var val = cargoValue(c.manifest);
        if (!(val > 0)) continue;
        var sc = val * stateVuln(c) / Math.max(d, PREY_FLOOR_KM);
        if (!best || sc > best.score) best = { state: c, score: sc };
      }
      /* AND YOU (Astra's call, 2026-11-01). Measured across 6 seeds
       * (tools/measure-runner-turns.cjs), 0.2% of runners have an NPC
       * civilian within reach at any moment: traffic lanes do not cross
       * close. The civilian a runner actually meets is you. Scored the
       * same way a pirate scores you (your hold, how soft you look), and
       * held to the same rule: armed and tougher than her, you are left
       * be. */
      if (!ship.docked && !ship.landed) {
        var dp = V.dist(ship.pos, st.pos);
        var tough = playerArmed(ship) && (ship.hullMax || 100) > myHull;
        if (dp <= RUNNER_PREY_KM && !tough) {
          var ps = playerValue(ship) * playerVuln(ship) / Math.max(dp, PREY_FLOOR_KM);
          if (ps > 0 && (!best || ps > best.score)) best = { player: true, score: ps };
        }
      }
      if (best && best.player) turnOnPlayer(sys, G, st, t, hooks);
      else if (best) turnRunner(sys, G, st, best.state, t, hooks);
    }
  }
  function turnOnPlayer(sys, G, st, t, hooks) {
    var r = C().liftTrader(sys, st, t);
    if (!r || !r.live) return null;
    r.runner = true;
    r.hostileToPlayer = true;
    r.mode = 'attack';
    r.aggressorAt = t;
    r.firedOnYouAt = t;          // combat.js crime(): shooting back is not assault
    if (hooks && hooks.say) hooks.say('Syndicate runner ' + nm(r) + ' opens fire on you without a word', 6);
    if (hooks && hooks.sound) hooks.sound('warn');
    return r;
  }
  function hullOfCls(cls) {
    var H = C().NPC_HULL;
    return (H && H[cls]) || 50;
  }
  function turnRunner(sys, G, st, preyState, t, hooks) {
    var r = C().liftTrader(sys, st, t);
    var v = r && C().liftTrader(sys, preyState, t);
    if (!r || !r.live || !v || !v.live) return null;
    v._state = preyState;
    r.runner = true;
    r.raider = true;
    r.target = v;
    r.mode = 'chase'; r.standoffKm = CHASE_KM;
    r.aggressorAt = t;
    r.preyName = v.name;
    v.threat = r; v.mode = 'breakoff'; v.refused = true;
    if (C().isArmedNpc(v)) v.defendTarget = r;
    if (C().broadcastDistress && !v.callSent) {
      v.callSent = true;
      C().broadcastDistress(sys, G, t, v, 'assault', near(G, v) ? hooks : null);
    }
    say(G, hooks, r, 'Syndicate runner ' + nm(r) + ' opens fire on ' + the(v) + ' without a word', 6);
    return r;
  }
  /* Her run, frame by frame: knock the drive out, come alongside, strip
   * her, go. Running from the law takes precedence over all of it. */
  function raid(sys, G, r, t, hooks) {
    var v = r.target;
    if (alive(r.fugitive)) return;
    var d = dist(r, v);
    if (v.disabled) {
      r.mode = 'chase'; r.standoffKm = 0.3;
      if (d < LOOT_KM) {
        if (!r.lootSince) r.lootSince = t;
        if (t - r.lootSince >= LOOT_S) strip(sys, G, r, v, t, hooks);
      } else r.lootSince = 0;
      return;
    }
    r.mode = 'chase'; r.standoffKm = CHASE_KM;
    /* Her guns are not meant to kill: a freighter with no drive is the
     * prize. Same line the law draws (COP_DISABLE_HULL). */
    if (hullFrac(v) < COP_DISABLE_HULL && C().disableNpc) C().disableNpc(sys, G, v, 'drive', t, hooks, r);
  }
  function raiders(sys, G, t, hooks) {
    sys.patrols.forEach(function (sp) {
      if (!alive(sp) || !sp.raider || sp.hostileToPlayer) return;
      if (!alive(sp.target)) return;
      /* Her own drive out: she can still strip a ship she is already
       * alongside, but she cannot chase one. */
      if (sp.disabled && dist(sp, sp.target) >= LOOT_KM) return;
      raid(sys, G, sp, t, hooks);
    });
  }
  /* Fired first within the window: the payoff no longer covers her. */
  function aggressor(sp, t) {
    return !!(sp && sp.runner && sp.aggressorAt !== undefined && t - sp.aggressorAt < AGGRESSOR_S);
  }

  /* ---- the law ---------------------------------------------------------- */
  /* An independent smuggler: a line through a port with a fence, never a
   * Syndicate runner (paid for), seeded per route. */
  function smuggler(sys, route) {
    if (!route || route.runner || route.flag === 'outlaw' || route.oneWay || route.joined || route.playerPort) return false;
    var A = sys.byId && sys.byId[route.from], B = sys.byId && sys.byId[route.to];
    var fence = (A && A.market && A.market.blackMarket) || (B && B.market && B.market.blackMarket);
    return !!fence && hash01('smuggle|' + (sys.seed || '') + '|' + route.id) < SMUGGLER_P;
  }

  function startPursuit(sys, G, cop, f, t, hooks, why, line) {
    cop.target = f;
    cop.mode = 'chase'; cop.standoffKm = CHASE_KM;
    cop.pursuing = why;
    cop.alongsideSince = 0;
    f.fugitive = cop;
    f.fugitiveWhy = why;
    /* A pirate drops whoever she was working; that ship is let go. */
    if (f.target) { if (f.target.threat === f) f.target.threat = null; f.target = null; }
    f.mode = 'breakoff';
    f.threat = cop;
    /* A runner who turned on you drops you to run from the law. */
    if (why === 'runner') f.hostileToPlayer = false;
    if (C().isArmedNpc && C().isArmedNpc(f)) f.defendTarget = cop;
    say(G, hooks, cop, line || (nm(cop) + ': "' + nm(f) + ', heave to and stand by to be boarded." She runs.'), 5);
  }

  function arrest(sys, G, cop, f, t, hooks) {
    f.dead = true;
    f.arrested = { by: cop.id, at: t };
    f.diedAt = t;
    f.distressAt = null;
    if (f.liftedFrom) { f.liftedFrom.dead = true; f.liftedFrom.diedAt = t; f.liftedFrom.impounded = true; }
    f.live = null;
    sys._ships = null; sys._traffic = null;
    sys._rumourGen = (sys._rumourGen || 0) + 1;
    cop.target = null; cop.pursuing = null; cop.mode = 'shadow'; cop.standoffKm = null;
    var line = nm(cop) + ' has arrested ' + the(f) + ' - her crew taken off, the ship impounded';
    if (near(G, cop) && hooks && hooks.say) {
      hooks.say(line, 6);
      if (global.Journal && global.Journal.add) global.Journal.add(G, 'law', line);
    }
    /* You helped: you put shots into her before the law took her. */
    if (f.helpArrest && t - f.helpArrest.at < HELP_WINDOW) {
      bump(G, cop.faction, HELP_ARREST);
      if (hooks && hooks.say) hooks.say(facName(G, sys, cop.faction) + ' will remember who helped bring ' + the(f) + ' in', 5);
    }
  }

  function pursue(sys, G, cop, t, hooks) {
    var f = cop.target;
    if (f.disabled || f.surrendered) {
      cop.mode = 'chase';
      cop.standoffKm = ARREST_STANDOFF;
      if (dist(cop, f) < ARREST_KM) {
        if (!cop.alongsideSince) cop.alongsideSince = t;
        if (t - cop.alongsideSince >= ARREST_S) arrest(sys, G, cop, f, t, hooks);
      } else cop.alongsideSince = 0;
      return;
    }
    cop.mode = 'chase'; cop.standoffKm = CHASE_KM;
    /* Her drive, not her life: the law wants her crew in a cell. */
    if (hullFrac(f) < COP_DISABLE_HULL && C().disableNpc) C().disableNpc(sys, G, f, 'drive', t, hooks, cop);
  }

  function law(sys, G, t, hooks) {
    var pats = sys.patrols;
    pats.forEach(function (cop) {
      if (!alive(cop) || !lawful(cop) || cop.hostileToPlayer || cop.disabled || cop.rescue || cop.respondTo) return;
      if (alive(cop.target)) { if (cop.pursuing) pursue(sys, G, cop, t, hooks); return; }
      /* A pirate in sight, working or not. */
      var best = null, bd = LAW_SEE_KM;
      pats.forEach(function (p) {
        if (!alive(p) || p.kind !== 'pirate' || (alive(p.fugitive) && p.fugitive !== cop)) return;
        var d = dist(cop, p);
        if (d < bd) { bd = d; best = p; }
      });
      if (best) { startPursuit(sys, G, cop, best, t, hooks, 'pirate'); return; }
      /* A runner who fired first, in sight. Paid for or not. */
      var rb = null, rd = LAW_SEE_KM;
      pats.forEach(function (p) {
        if (!alive(p) || !aggressor(p, t) || (alive(p.fugitive) && p.fugitive !== cop)) return;
        var d = dist(cop, p);
        if (d < rd) { rd = d; rb = p; }
      });
      if (rb) {
        startPursuit(sys, G, cop, rb, t, hooks, 'runner',
          nm(cop) + ': "' + nm(rb) + ', your papers do not cover firing on a civilian. Heave to." She runs.');
        return;
      }
      /* A trader's papers, every so often, if one is passing. */
      if (t < (cop.scanAt || 0)) return;
      cop.scanAt = t + SCAN_EVERY;
      var Sm = S(), list = Sm.trafficAll ? Sm.trafficAll(sys, t) : [];
      for (var i = 0; i < list.length; i++) {
        var st = list[i];
        if (!st || !st.pos || !st.route || st.phase === 'moored' || st.landed || st.inside) continue;
        if (V.dist(st.pos, cop.live.pos) > SCAN_KM) continue;
        if (st.route.scannedAt !== undefined && t - st.route.scannedAt < RESCAN_S) continue;
        st.route.scannedAt = t;
        if (!smuggler(sys, st.route)) continue;
        var f = C().liftTrader(sys, st, t);
        if (f && f.live) { f.smuggler = true; startPursuit(sys, G, cop, f, t, hooks, 'smuggler'); }
        return;
      }
    });
  }

  /* ---- rival empires ---------------------------------------------------- */
  function rivalsOf(G, a, b) {
    var Gx = global.Galaxy;
    if (Gx && Gx.rivalsOf) return Gx.rivalsOf(G && G.galaxy, a, b);
    var r = G && G.galaxy && G.galaxy.rivals;
    return !!(r && r[a] && r[a][b]);
  }
  function rivals(sys, G, t, hooks) {
    var pol = sys.patrols.filter(function (sp) {
      return alive(sp) && lawful(sp) && !alive(sp.target) && !sp.hostileToPlayer && !sp.disabled &&
             !sp.respondTo && !(sp.withdrawnAt !== undefined && t - sp.withdrawnAt < RIVAL_REST_S);
    });
    for (var i = 0; i < pol.length; i++) {
      for (var j = i + 1; j < pol.length; j++) {
        var a = pol[i], b = pol[j];
        if (alive(a.target) || alive(b.target)) continue;
        var ea = empireOf(G, sys, a.faction), eb = empireOf(G, sys, b.faction);
        if (!ea || !eb || ea === eb || !rivalsOf(G, ea, eb)) continue;
        if (dist(a, b) > RIVAL_SEE_KM) continue;
        a.target = b; b.target = a;
        a.mode = 'chase'; b.mode = 'chase'; a.standoffKm = b.standoffKm = RIVAL_STANDOFF;
        a.skirmish = b.skirmish = true;
        say(G, hooks, a, nm(a) + ' (' + facName(G, sys, ea) + ') and ' + nm(b) + ' (' + facName(G, sys, eb) + ') open fire on each other', 6);
      }
    }
  }
  /* Half her hull gone, a rival withdraws: these are border clashes, not a
   * war - nobody is lost, and the lanes keep their patrols. */
  function withdraw(sys, G, loser, winner, t, hooks) {
    loser.target = null; loser.skirmish = false;
    loser.mode = 'breakoff'; loser.threat = winner; loser.withdrawnAt = t;
    if (winner) { winner.target = null; winner.skirmish = false; winner.mode = 'shadow'; winner.withdrawnAt = t; }
    say(G, hooks, loser, nm(loser) + ' is hit hard and withdraws from ' + nm(winner), 5);
  }

  /* ---- HOSTILE standing: shot on sight ---------------------------------- */
  function hostileOnSight(sys, G, t, hooks) {
    var ship = G.ship;
    if (!ship || !ship.pos || ship.docked || ship.landed) return;
    sys.patrols.forEach(function (sp) {
      if (!alive(sp) || !patrolKind(sp) || sp.hostileToPlayer || sp.disabled || !sp.faction) return;
      if (standing(G, sp.faction) > HOSTILE_STANDING) return;
      if (V.dist(sp.live.pos, ship.pos) > HOSTILE_KM) return;
      sp.hostileToPlayer = true;
      sp.mode = 'attack';
      sp.target = null; sp.pursuing = null;
      sp.onSight = true;
      if (hooks && hooks.say) hooks.say(nm(sp) + ': "You are not welcome in ' + facName(G, sys, sp.faction) + ' space." Weapons hot.', 6);
      if (hooks && hooks.sound) hooks.sound('warn');
    });
  }

  /* ---- guns -------------------------------------------------------------- */
  function gunOf(sp) {
    var Cm = C();
    /* A runner on a raid is fitted for it: the Syndicate's ships pass as
     * freighters, and the gun under the cargo hatch is the part that
     * does not. With a freighter's own popgun she lost the exchange to
     * the 55-hull freighter she had picked on (aggression.test, 2026-11-01). */
    if (sp.raider) return Cm.NPC_GUN;
    if (sp.kind === 'trader' || sp.cls === 'shuttle') return Cm.TRADER_GUN;
    if (sp.kind === 'police' && sp.faction === 'outlaw') return Cm.SYNDICATE_GUN;
    if (sp.kind === 'police' || sp.kind === 'navy' || sp.kind === 'capital') return Cm.POLICE_GUN;
    return Cm.NPC_GUN;
  }
  /* Who she shoots this frame, if anyone. */
  function aimOf(sp) {
    if (sp.hostileToPlayer) return null;              // combat.js fires those at you
    var tg = sp.target;
    if (alive(tg) && (sp.mode === 'attack' || sp.mode === 'chase') && !tg.disabled && !tg.surrendered) {
      if (sp.kind === 'pirate' && !tg.refused && !tg.fugitive) return null;   // asking first
      return tg;
    }
    if (alive(sp.defendTarget)) return sp.defendTarget;
    return null;
  }
  function fire(sys, G, t, hooks) {
    var Cm = C(), now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    sys.patrols.forEach(function (sp) {
      if (!alive(sp) || sp.disabled && sp.surrendered) return;
      var tg = aimOf(sp);
      if (!tg || !Cm.isArmedNpc(sp)) return;
      var gun = gunOf(sp), d = dist(sp, tg);
      if (d > gun.range || t < (sp.coolUntil || 0)) return;
      sp.coolUntil = t + gun.cooldown;
      var transverse = V.len(V.sub(tg.live.vel, sp.live.vel));
      var cop = lawful(sp);
      var chance = Math.max(cop ? 0.25 : 0.12, Math.min(0.85, 1.0 - d / gun.range * 0.5 - transverse * (cop ? 0.8 : 1.4)));
      var hit = hash01('shot|' + sp.id + '|' + Math.floor(t * 10)) < chance;
      if (near(G, sp)) {
        (G.beams = G.beams || []).push(Cm.shotFx(V.clone(sp.live.pos), V.clone(tg.live.pos), tg.live,
                                         sp.hunter ? '#9fe8ff' : cop ? '#8fd0ff' : sp.kind === 'pirate' ? '#ff8a76' : '#ffc46b',
                                         Cm.npcShotVariety(sp, gun), now, !hit, { src: sp.live, t: t }));
      }
      if (hit) Cm.damageNpc(sys, G, tg, gun.dmg, t, hooks, gun, V.clone(sp.live.pos), sp);
    });
  }

  /* ---- what a hit means ----------------------------------------------- */
  /* One ship hit by another (Combat.damageNpcBy). */
  function onNpcHit(sys, G, v, by, t, hooks) {
    if (!v || v.dead) return;
    var Cm = C();
    /* A runner on a raid answers fire like a pirate does, rather than
     * fleeing the freighter she is robbing; and every shot she lands on a
     * civilian renews her mark as the aggressor. */
    if (by && by.raider && alive(by.target) && by.target === v) by.aggressorAt = t;
    if (v.raider) {
      if (lawful(by) && !alive(v.fugitive)) {
        startPursuit(sys, G, by, v, t, hooks, 'runner'); return;
      }
      if (alive(v.fugitive)) { v.defendTarget = by; return; }
      if (hullFrac(v) < PIRATE_RUN_HULL) {
        v.raider = false; v.target = null; v.mode = 'breakoff'; v.threat = by; return;
      }
      return;
    }
    if (v.kind === 'trader' || v.cls === 'shuttle') {
      v.mode = 'breakoff';
      v.threat = by;
      if (Cm.isArmedNpc(v)) v.defendTarget = by;
      if (!v.fugitive && !v.callSent && Cm.broadcastDistress) {
        v.callSent = true;
        Cm.broadcastDistress(sys, G, t, v, 'assault', near(G, v) ? hooks : null);
      }
      return;
    }
    if (v.skirmish && v.target === by && hullFrac(v) < WITHDRAW_HULL) { withdraw(sys, G, v, by, t, hooks); return; }
    if (v.kind === 'pirate') {
      if (lawful(by) && !v.fugitive) { startPursuit(sys, G, by, v, t, hooks, 'pirate'); return; }
      if (alive(v.fugitive)) { v.defendTarget = by; return; }
      /* Somebody she is robbing shoots back, and it hurts: she gives up. */
      if (hullFrac(v) < PIRATE_RUN_HULL) { v.target = null; v.mode = 'breakoff'; v.threat = by; return; }
      return;
    }
    /* Anything armed with nobody to fight answers whoever hit her. */
    if (!alive(v.target) && !v.hostileToPlayer && Cm.isArmedNpc(v)) { v.target = by; v.mode = 'chase'; v.standoffKm = CHASE_KM; }
  }

  function onNpcKill(sys, G, dead, by, t, hooks) {
    if (by && by.target === dead) { by.target = null; by.pursuing = null; by.mode = by.kind === 'pirate' ? 'intercept' : 'shadow'; }
  }

  /* You hit her (Combat.damageNpc, before the crime is booked). */
  function onPlayerHit(sys, G, sp, t, hooks) {
    /* Getting in the way of an arrest. Once per cop. */
    if (lawful(sp) && alive(sp.target) && sp.pursuing && !sp.interfered) {
      sp.interfered = true;
      bump(G, sp.faction, -INTERFERE);
      var emp = empireOf(G, sys, sp.faction);
      if (emp && emp !== sp.faction) bump(G, emp, -INTERFERE_EMPIRE);
      if (hooks && hooks.say) hooks.say('Interfering with an arrest - ' + facName(G, sys, sp.faction) + ' will not forget it', 6);
      if (sp.target.fugitive === sp) sp.target.fugitive = null;    // she gets away
      sp.target = null; sp.pursuing = null;
      return;
    }
    /* Hitting the one the law is running down helps the law. */
    if (alive(sp.fugitive) && lawful(sp.fugitive)) {
      sp.helpArrest = { faction: sp.fugitive.faction, at: t };
      return;
    }
    /* Hitting a ship that is attacking somebody else helps her victim. */
    var victim = alive(sp.target) ? sp.target : null;
    if (victim && victim.faction && !victim.fugitive) {
      sp.helpFor = { faction: victim.faction, name: victim.name, at: t, victim: victim };
      /* A pirate hurt badly while robbing somebody breaks off and runs. */
      if (sp.kind === 'pirate' && hullFrac(sp) < PIRATE_RUN_HULL && !sp.disabled) {
        sp.hostileToPlayer = false; sp.mode = 'breakoff'; sp.threat = null; sp.target = null;
        bump(G, victim.faction, HELP_DRIVEOFF);
        if (victim.threat === sp) victim.threat = null;
        if (hooks && hooks.say) hooks.say(The(sp) + ' breaks off - ' + the(victim) + ' owes you, and so does ' + facName(G, sys, victim.faction), 6);
        return;
      }
    }
    /* She turned on you: whoever she was after is let go. */
    if (victim && victim.threat === sp) victim.threat = null;
    if (sp.kind === 'trader' || sp.cls === 'shuttle') { sp.threat = null; sp.defendTarget = null; }
    sp.target = null;
  }

  /* You killed her. */
  function onPlayerKill(sys, G, sp, t, hooks) {
    if (sp.helpFor && t - sp.helpFor.at < HELP_WINDOW) {
      bump(G, sp.helpFor.faction, HELP_KILL);
      if (hooks && hooks.say) hooks.say(facName(G, sys, sp.helpFor.faction) + ' will remember who saved ' + the({ name: sp.helpFor.name }), 5);
    } else if (sp.helpArrest && t - sp.helpArrest.at < HELP_WINDOW) {
      bump(G, sp.helpArrest.faction, HELP_ARREST);
    }
    if (alive(sp.fugitive)) { sp.fugitive.target = null; sp.fugitive.pursuing = null; sp.fugitive.mode = 'shadow'; }
  }

  /* ---- the frame ------------------------------------------------------- */
  function tidy(sys, t) {
    sys.patrols.forEach(function (sp) {
      if (!sp.live || sp.dead) return;
      if (sp.target && !alive(sp.target)) {
        sp.target = null;
        if (sp.pursuing) { sp.pursuing = null; sp.mode = 'shadow'; }
        else if (sp.kind === 'pirate' && (sp.mode === 'attack' || sp.mode === 'chase' || sp.mode === 'alongside')) sp.mode = 'intercept';
        else if ((sp.mode === 'attack' || sp.mode === 'chase' || sp.mode === 'alongside') && !sp.hostileToPlayer) sp.mode = 'shadow';
        sp.standoffKm = null;
      }
      if (sp.threat && !alive(sp.threat)) sp.threat = null;
      if (sp.defendTarget && !alive(sp.defendTarget)) sp.defendTarget = null;
      if (sp.fugitive && !alive(sp.fugitive)) sp.fugitive = null;
      if (sp.hostileToPlayer && sp.target) sp.target = null;
    });
  }

  function update(sys, G, t, dtSim, hooks) {
    if (!sys || !sys.patrols || !sys.patrols.length || !G || !G.ship || !C() || !S()) return;
    tidy(sys, t);
    hostileOnSight(sys, G, t, hooks);
    pirates(sys, G, t, hooks);
    runners(sys, G, t, hooks);
    raiders(sys, G, t, hooks);
    law(sys, G, t, hooks);
    rivals(sys, G, t, hooks);
    fire(sys, G, t, hooks);
  }

  /* ---- off-screen raids, as news ---------------------------------------
   * The raid itself is closed form (generate.js attachRaids, economy.js
   * raidedArrival): a seeded share of the legs flown in a system with
   * pirates in it arrive RAID_TAKE light, and her port's shelf shows it on
   * the same curve the delivery would have gone in on. This is the word on
   * the dock: the most recent raided arrival at the port you just docked
   * at, inside the last day. */
  var NEWS_S = 86400;
  function raidNews(sys, port, t) {
    var Eco = global.Economy;
    if (!port || !port.market || !port.market.inbound || !Eco || !Eco.raidedArrival) return null;
    var best = null;
    port.market.inbound.forEach(function (d) {
      if (!(d.raidP > 0) || !d.route) return;
      var first = d.t0 + d.cruise, n = Math.floor((t - first) / d.period);
      if (n < 0) return;
      var at = first + n * d.period;
      if (t - at > NEWS_S || !Eco.raidedArrival(d, n)) return;
      if (!best || at > best.at) best = { at: at, d: d };
    });
    if (!best) return null;
    var route = (sys.traffic || []).filter(function (r) { return r.id === best.d.route; })[0];
    var c = Eco.BY_ID && Eco.BY_ID[best.d.cid];
    var src = route && sys.byId ? sys.byId[best.d.leg ? route.to : route.from] : null;
    return 'Word on the dock: ' + (route ? 'the ' + route.name : 'a freighter') +
      (src ? ' came in from ' + src.name : ' came in') + ' robbed by pirates' +
      (c ? ' - ' + c.name + ' is short here' : '');
  }

  var Aggression = {
    PREY_KM: PREY_KM, ROB_KM: ROB_KM, RAID_TAKE: RAID_TAKE, LAW_SEE_KM: LAW_SEE_KM, SCAN_KM: SCAN_KM,
    ARREST_KM: ARREST_KM, ARREST_S: ARREST_S, RIVAL_SEE_KM: RIVAL_SEE_KM, WITHDRAW_HULL: WITHDRAW_HULL,
    HOSTILE_STANDING: HOSTILE_STANDING, HELP_KILL: HELP_KILL, HELP_DRIVEOFF: HELP_DRIVEOFF,
    HELP_ARREST: HELP_ARREST, INTERFERE: INTERFERE, INTERFERE_EMPIRE: INTERFERE_EMPIRE,
    SMUGGLER_P: SMUGGLER_P, LOOT_S: LOOT_S,
    RUNNER_TURN_P: RUNNER_TURN_P, RUNNER_PREY_KM: RUNNER_PREY_KM, AGGRESSOR_S: AGGRESSOR_S,
    runners: runners, turnRunner: turnRunner, turnOnPlayer: turnOnPlayer, aggressor: aggressor, legKey: legKey,
    focusOf: focusOf, choosePrey: choosePrey, startRobbery: startRobbery, strip: strip,
    smuggler: smuggler, startPursuit: startPursuit, arrest: arrest, lawful: lawful, empireOf: empireOf,
    gunOf: gunOf, aimOf: aimOf, withdraw: withdraw,
    onNpcHit: onNpcHit, onNpcKill: onNpcKill, onPlayerHit: onPlayerHit, onPlayerKill: onPlayerKill,
    update: update, raidNews: raidNews, hash01: hash01
  };
  global.Aggression = Aggression;
  if (typeof module !== 'undefined' && module.exports) module.exports = Aggression;
})(typeof window !== 'undefined' ? window : globalThis);
