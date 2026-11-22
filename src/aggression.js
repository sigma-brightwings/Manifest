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

  /* Put it on the open band, and tell the player it is there if they are
   * not already close enough to have been told the ordinary way. */
  function band(G, sys, t, hooks, kind, sp, other) {
    var B = global.Band;
    if (!B || !G || !sp) return;
    var before = (G.band || []).length;
    var id = B.open(G, sys, t, kind, sp, other);
    if (!id) return;
    var all = G.band || [];
    var e = null;
    for (var i = 0; i < all.length; i++) if (all[i].id === id) e = all[i];
    /* Only the FIRST broadcast is announced, and only when the player was
     * not standing in it already - otherwise the band repeats what the
     * hull just said. */
    if (e && all.length > before && !near(G, sp) && hooks && hooks.say) {
      hooks.say(B.hail(G, e), 6);
    }
  }

  function bandOff(G, t, kind, sp, how) {
    if (global.Band) global.Band.close(G, t, kind, sp, how);
  }
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
    /* What a stranger can SEE: a gun behind a concealed panel does not
     * count until it has fired (combat.js HOLD INTO A HARDPOINT) - which
     * is the whole point of hiding one. */
    if (C() && C().visiblyArmed) return C().visiblyArmed(ship);
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
    band(G, sys, t, hooks, 'robbery', v, pirate);
    /* A liner calls for help the moment she sees him coming, not when he
     * is close enough to hail her: lives aboard (shipai.js slice 3). */
    if (SA() && SA().civilRole && SA().civilRole(v) === 'passenger' && !v.callSent && C().broadcastDistress) {
      v.callSent = true;
      C().broadcastDistress(sys, G, t, v, 'assault', near(G, v) ? hooks : null);
    }
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
    if (SA()) SA().onRobbed(G, sys, v, t);
    pirate.loot = { from: v.id, at: t, value: cargoValue(took) };
    pirate.target = null;
    pirate.mode = 'breakoff';
    pirate.threat = v;
    v.threat = pirate;
    v.mode = 'breakoff';
    v.defendTarget = null;
    var Eco = global.Economy, what = took.length && Eco && Eco.BY_ID[took[0].cid] ? took[0].qty + 't of ' + Eco.BY_ID[took[0].cid].name : 'her hold';
    say(G, hooks, pirate, The(pirate) + ' took ' + what + ' off ' + the(v) + ' and is breaking away', 6);
    bandOff(G, t, 'robbery', v, 'robbed');
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
    /* Her answer (shipai.js slice 3): comply, dump part of her hold and
     * run, run for it, or turn and fight - by her role, her captain, her
     * mood and the odds. Without the ship AI, the old seeded coin. */
    var pick = SA() && SA().choose ? SA().choose(G, sys, v, pirate, 'demand', t) : null;
    var verb = pick ? pick.verb : (hash01('yield|' + v.id + '|' + pirate.id) < (armed ? 0.45 : 0.75) ? 'comply' : 'flee');
    if (verb === 'comply' || verb === 'surrender') { strip(sys, G, pirate, v, t, hooks); return; }
    if (verb === 'dump') { dumpCargo(sys, G, pirate, v, t, hooks); return; }
    v.refused = true;
    /* Her demand refused: the pirate is angry about it (shipai.js). */
    if (SA()) SA().onRefused(G, sys, pirate, t);
    if (verb === 'fight' && armed) {
      /* She turns on him rather than running - cornered, or confident. */
      v.target = pirate; v.mode = 'chase'; v.standoffKm = CHASE_KM; v.defendTarget = pirate; v.threat = null;
      say(G, hooks, v, The(v) + ' refuses ' + the(pirate) + ' and turns to fight' + (pick && pick.cornered ? ' - cornered' : ''), 5);
      return;
    }
    if (armed) v.defendTarget = pirate;
    say(G, hooks, v, The(v) + ' refuses ' + the(pirate) + ' and runs - she is under fire', 5);
  }

  /* DUMPING TO BUY OFF THE CHASE (shipai.js slice 3). She jettisons a share
   * of her first two lines as real canisters (Sim.dropCanister, the same
   * ones your own demand knocks loose) and runs; the pirate lets her go
   * and stops to scoop them, taking whatever is still there LOOT_S later.
   * Her port is short of what she dumped, as it is of what is stripped.
   * Get there first and the canisters are yours, and the pirate's haul
   * is thinner. */
  var DUMP_TAKE = 0.35;
  function dumpCargo(sys, G, pirate, v, t, hooks) {
    var Sm = S(), st = v._state, cans = [], i, gave = 0;
    var man = v.manifest || [];
    for (i = 0; i < man.length && gave < 2; i++) {
      var amount = man[i] && (man[i].qty || man[i].tonnes) || 0;
      if (!(amount > 0)) continue;
      var q = Math.max(1, Math.round(amount * DUMP_TAKE));
      if (amount - q < 1) q = amount;
      if (Sm && Sm.dropCanister && v.live) {
        var fake = { pos: v.live.pos, vel: v.live.vel, fwd: v.live.fwd || { x: 1, y: 0, z: 0 } };
        var c = Sm.dropCanister(sys, fake, man[i].cid, q, t);
        if (c) { c.dumpedBy = v.id; cans.push(c.id); }
      }
      if (man[i].qty !== undefined) man[i].qty -= q; else man[i].tonnes = amount - q;
      if (st && global.ShipTrade && global.ShipTrade.shortDelivery) {
        try { global.ShipTrade.shortDelivery(G, sys, st, man[i].cid, q, t); } catch (e) { /* no port for it */ }
      }
      gave++;
    }
    v.dumped = { for: pirate.id, at: t, cans: cans.slice() };
    v.mode = 'breakoff'; v.threat = pirate; v.defendTarget = null;
    pirate.target = null; pirate.mode = 'shadow'; pirate.standoffKm = null;
    pirate.scoop = { cans: cans, from: v.id, until: t + LOOT_S };
    if (SA()) SA().onRobbed(G, sys, v, t);
    var Eco = global.Economy, c0 = man[0] && Eco && Eco.BY_ID ? Eco.BY_ID[man[0].cid] : null;
    say(G, hooks, v, The(v) + ' dumps ' + (c0 ? c0.name.toLowerCase() : 'cargo') + ' out of her hatch and runs - ' + the(pirate) + ' stops to scoop it', 6);
    bandOff(G, t, 'robbery', v, 'robbed');
    return cans;
  }
  /* The scoop done: she takes what is still drifting there, and goes to
   * sell it. */
  function scoopDone(sys, G, pirate, t) {
    var sc = pirate.scoop, took = [], value = 0;
    pirate.scoop = null;
    if (!sc) return took;
    var left = [];
    (sys.canisters || []).forEach(function (c) {
      if (sc.cans.indexOf(c.id) >= 0) { took.push({ cid: c.cid, qty: c.tonnes }); return; }
      left.push(c);
    });
    if (sys.canisters) sys.canisters = left;
    value = cargoValue(took);
    pirate.loot = { from: sc.from, at: t, value: value, scooped: took.length };
    pirate.mode = 'breakoff';
    return took;
  }

  function pirates(sys, G, t, hooks) {
    sys.patrols.forEach(function (sp) {
      if (!alive(sp) || sp.kind !== 'pirate' || sp.disabled || sp.hostileToPlayer) return;
      if (alive(sp.fugitive)) return;                      // running from the law
      /* Stopped to scoop what a freighter dumped (dumpCargo). */
      if (sp.scoop) { if (t >= sp.scoop.until) scoopDone(sys, G, sp, t); return; }
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
  /* OPPORTUNISTS (2026-11-22). The runners' temptation, opened to armed
   * traders whose captains are bent and greedy (shipai.js temptation).
   * Astra: "is there a way for a non-pirate NPC to turn pirate if a juicy
   * enough target passes?" A trader who turns does what a runner does -
   * fires first, knocks the drive out, strips the hold - but nobody paid
   * for her: the law chases her like a pirate, and the record follows her
   * route afterwards (markCrime). */
  function opportunistState(sys, G, st) {
    if (!civilianState(st)) return null;
    var cls = st.cls || st.route.cls;
    if (!C().isArmedNpc({ cls: cls })) return null;
    if (st.route.playerPort || st.route.hired || st.route.company) return null;
    if (!SA() || !SA().dials) return null;
    var d = SA().dials(G, sys, st);
    if (!d || d.role !== 'trader' || !(SA().tempted(d, false) > 0)) return null;
    return d;
  }
  function runners(sys, G, t, hooks) {
    var Sm = S(), ship = G.ship;
    if (!ship || !ship.pos || !Sm.trafficAll) return;
    if (t < (sys._runnerLookAt || 0)) return;
    sys._runnerLookAt = t + RUNNER_LOOK_S;
    var list = Sm.trafficAll(sys, t);
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      if (!st || !st.route || !st.pos || st.phase === 'moored' || st.landed || st.inside) continue;
      if (st.route.dead || st.route.suppressed) continue;           // already lifted, or gone
      if (V.dist(st.pos, ship.pos) > SEE_KM) continue;
      var isRunner = !!st.route.runner, dials = null;
      if (!isRunner) {
        if (st.route.turnLeg === legKey(st, t)) continue;
        dials = opportunistState(sys, G, st);
        if (!dials) { st.route.turnLeg = legKey(st, t); continue; }
      }
      if (!C().isArmedNpc({ cls: st.cls || st.route.cls })) continue;
      var key = legKey(st, t);
      if (st.route.turnLeg === key) continue;                       // asked once a leg
      st.route.turnLeg = key;
      var roll = hash01((isRunner ? 'runner-turn|' : 'turncoat|') + (sys.seed || '') + '|' + key);
      /* Without the ship AI, the old flat chance for a runner and nothing
       * for a trader. With it, both are a matter of how tempting the
       * best prize in reach is (scored below, then rolled). */
      var byTemptation = !!(SA() && SA().temptation);
      if (!byTemptation && (!isRunner || roll >= RUNNER_TURN_P)) continue;
      if (byTemptation && !dials) dials = SA().dials(G, sys, st);
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
        if (!best || sc > best.score) best = { state: c, score: sc, value: val,
                                               soft: C().isArmedNpc({ cls: ccls }) ? 0.5 : 1, pos: c.pos };
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
          if (ps > 0 && (!best || ps > best.score)) best = { player: true, score: ps, value: playerValue(ship),
                                                             soft: playerArmed(ship) ? 0.5 : 1, pos: ship.pos };
        }
      }
      if (!best) continue;
      if (byTemptation) {
        var watched = Sm.policeNearby && sys.tithe !== 'suspected' &&
                      (Sm.policeNearby(sys, t, st.pos) || Sm.policeNearby(sys, t, best.pos));
        var tempt = SA().temptation(dials, { runner: isRunner, prize: best.value, own: cargoValue(st.manifest),
                                             soft: best.soft, law: !!watched });
        if (!(roll < tempt)) continue;
      }
      if (!isRunner) { turnTurncoat(sys, G, st, best, t, hooks); continue; }
      if (best.player) turnOnPlayer(sys, G, st, t, hooks);
      else turnRunner(sys, G, st, best.state, t, hooks);
    }
  }
  /* A trader turns (OPPORTUNISTS above). Flown exactly as a runner's turn -
   * fire first, drive out, alongside, strip - and then she is wanted:
   * `turncoat` makes every lawful cutter in sight run her down as it would
   * a pirate, and markCrime writes it against her route, so the next cop
   * who scans her papers knows, and the docks talk. */
  function turnTurncoat(sys, G, st, best, t, hooks) {
    var r = C().liftTrader(sys, st, t);
    if (!r || !r.live) return null;
    var v = null;
    if (!best.player) {
      v = C().liftTrader(sys, best.state, t);
      if (!v || !v.live) return null;
      v._state = best.state;
    }
    r.turncoat = true;
    r.aggressorAt = t;
    if (best.player) {
      r.hostileToPlayer = true;
      r.mode = 'attack';
      r.firedOnYouAt = t;
      if (hooks && hooks.say) hooks.say(The(r) + ' breaks from her lane and opens fire on you - she wants your hold', 6);
      if (hooks && hooks.sound) hooks.sound('warn');
    } else {
      r.raider = true;
      r.target = v;
      r.mode = 'chase'; r.standoffKm = CHASE_KM;
      r.preyName = v.name;
      v.threat = r; v.mode = 'breakoff'; v.refused = true;
      if (C().isArmedNpc(v)) v.defendTarget = r;
      if (C().broadcastDistress && !v.callSent) {
        v.callSent = true;
        C().broadcastDistress(sys, G, t, v, 'assault', near(G, v) ? hooks : null);
      }
      say(G, hooks, r, The(r) + ' breaks from her lane and runs down ' + the(v) + ' - no flag behind it but her own', 6);
      band(G, sys, t, hooks, 'runner', v, r);
    }
    markCrime(G, sys, st.route, { victim: best.player ? 'you' : v.name, at: t });
    return r;
  }

  /* THE RECORD THAT FOLLOWS HER (Astra, 2026-11-22: "opportunist, marked").
   * Kept on the game, keyed by star and route, so it outlives the meeting
   * and the save keeps it (save.js turncoats). It lapses after
   * TURNCOAT_MEMORY_S, or when she is arrested or killed. */
  var TURNCOAT_MEMORY_S = 30 * 86400;
  function crimeKey(G, sys, route) { return (sys.starId || sys.seed || '') + '|' + route.id; }
  function markCrime(G, sys, route, what) {
    if (!G || !route) return;
    G.turncoats = G.turncoats || {};
    var k = crimeKey(G, sys, route), prev = G.turncoats[k];
    G.turncoats[k] = { name: route.name || 'a trader', star: sys.starId || null, sysName: sys.name || null,
                       victim: what.victim, at: what.at, count: (prev ? prev.count : 0) + 1 };
  }
  function crimeOf(G, sys, route, t) {
    if (!G || !G.turncoats || !route) return null;
    var e = G.turncoats[crimeKey(G, sys, route)];
    if (!e) return null;
    /* Arrested, impounded or dead: the record closes with her. */
    if (route.dead || route.impounded ||
        (t !== undefined && t - e.at > TURNCOAT_MEMORY_S)) { delete G.turncoats[crimeKey(G, sys, route)]; return null; }
    return e;
  }
  function clearCrime(G, sys, route) {
    if (G && G.turncoats && route) delete G.turncoats[crimeKey(G, sys, route)];
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
    band(G, sys, t, hooks, 'runner', v, r);
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

  /* ---- THE CROOKED LAW (ship AI slice 4, 2026-11-22) -------------------
   * claude/ship-ai-profiles.md section 3. A cop's own probity (ShipAI.dials)
   * decides what she does with the ships she scans, not the system's
   * number: in a BOUGHT system a bent cop with no colleague in sight
   * shakes down the traders she stops - "inspection fees" - and, if she
   * is greedy enough to lean on the Syndicate's own runners, the
   * Syndicate answers. A straight cop (probity STRAIGHT and up) in a
   * system that is not bought runs a runner down: her papers are paid
   * for, and this one is not for sale. Astra chose all three targets:
   * you (combat.js resolveScan), NPC traders, and the runners. */
  var STRAIGHT = 0.7;          // probity at which a cop will touch the Syndicate's runners
  var SHAKE_MIN = 60;          // corruption: "bought"
  var SHAKE_EVERY_S = 900;     // one shakedown at a time; she has paperwork to "lose"
  /* Greedy enough to lean on the mob. Police greed is low by design (the
   * dials' role base): measured over 600 bent cops in a bought system,
   * median 0.21, 90th centile 0.38, top 0.49 - so the top sixth or so. */
  var MOB_GREED = 0.35;
  function corruptOf(G, sys) {
    return C() && C().systemCorruption ? C().systemCorruption(G, sys) : (sys.corruption || 40);
  }
  function witnessOf(sys, cop, t) {
    return C() && C().lawWitness ? C().lawWitness(sys, cop, t) : null;
  }
  function shakeDown(sys, G, cop, st, cd, t, hooks, mob) {
    if (cop.shookAt !== undefined && cop.shookAt !== null && t < cop.shookAt + SHAKE_EVERY_S) return null;
    cop.shookAt = t;
    var v = C().liftTrader(sys, st, t);
    if (!v || !v.live) return null;
    var fee = Math.max(80, Math.round(cargoValue(st.manifest) * 0.03 * (0.6 + 0.8 * cd.greed) / 10) * 10);
    v.shakenBy = { cop: cop.id, fee: fee, at: t };
    G.onTheTake = G.onTheTake || {};
    var star = (G.here && G.here.id) || sys.starId || 'here';
    var k = star + '|' + cop.id, e = G.onTheTake[k] || { name: cop.name, star: star, n: 0 };
    e.n++; e.at = t; if (mob) e.mob = (e.mob || 0) + 1;
    G.onTheTake[k] = e;
    if (SA() && SA().feel) {
      try { SA().feel(G, sys, v, 'robbed', t); } catch (er) { /* moods optional */ }
    }
    if (mob) {
      say(G, hooks, cop, nm(cop) + ' leans on the Syndicate runner ' + nm(v) + ' for ' + fee +
          ' cr of "inspection fee" - the mob will hear about that', 6);
      /* The Syndicate answers its own (shipai.js slice 2): as if she had
       * fired on the runner. */
      if (SA() && SA().onHit) { try { SA().onHit(G, sys, v, cop, t, hooks); } catch (er2) { /* optional */ } }
    } else {
      say(G, hooks, cop, nm(cop) + ' holds ' + the(v) + ' for an "inspection" - ' + fee +
          ' cr changes hands and she waves her on', 6);
    }
    return v;
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
    band(G, sys, t, hooks, 'pursuit', f, cop);
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
        if (!alive(p) || (p.kind !== 'pirate' && !p.turncoat) || (alive(p.fugitive) && p.fugitive !== cop)) return;
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
        /* Her papers say what she did (turnTurncoat): run her down. */
        var rec = crimeOf(G, sys, st.route, t);
        if (rec && !st.route.runner) {
          var w = C().liftTrader(sys, st, t);
          if (w && w.live) {
            w.turncoat = true;
            startPursuit(sys, G, cop, w, t, hooks, 'pirate',
              nm(cop) + ': "' + nm(w) + ', you are wanted for an assault on ' +
              (rec.victim === 'you' ? 'a private ship' : 'the ' + rec.victim.replace(/^the /i, '')) +
              '. Heave to." She runs.');
          }
          return;
        }
        /* THE CROOKED LAW (slice 4): her own probity decides. */
        var cd = SA() && SA().dials ? SA().dials(G, sys, cop) : null;
        if (cd && st.route.runner) {
          /* The straight cop: a runner's papers are bought, hers are not. */
          if (!cd.bent && cd.probity >= STRAIGHT && corruptOf(G, sys) < SHAKE_MIN) {
            var rr = C().liftTrader(sys, st, t);
            if (rr && rr.live) {
              rr.runner = true;
              startPursuit(sys, G, cop, rr, t, hooks, 'runner',
                nm(cop) + ': "' + nm(rr) + ', I know whose ship this is. Your friends do not pay me. Heave to." She runs.');
            }
            return;
          }
          /* The bent one leaning on the mob's own: rare, and they answer. */
          if (cd.bent && cd.greed >= MOB_GREED && corruptOf(G, sys) >= SHAKE_MIN && !witnessOf(sys, cop, t)) {
            shakeDown(sys, G, cop, st, cd, t, hooks, true);
            return;
          }
          continue;
        }
        if (cd && cd.bent && corruptOf(G, sys) >= SHAKE_MIN && !st.route.runner && !witnessOf(sys, cop, t)) {
          shakeDown(sys, G, cop, st, cd, t, hooks, false);
          return;
        }
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
        band(G, sys, t, hooks, 'duel', a, b);
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
    bandOff(G, t, 'duel', loser, 'withdrew');
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
  function SA() { return global.ShipAI && global.ShipAI.onHit ? global.ShipAI : null; }
  /* The hull she gives up at: an angered captain holds on to half of it
   * (shipai.js runHull). */
  function runAt(G, sys, sp, t) { return SA() ? SA().runHull(G, sys, sp, PIRATE_RUN_HULL, t) : PIRATE_RUN_HULL; }
  /* One ship hit by another (Combat.damageNpcBy). */
  function onNpcHit(sys, G, v, by, t, hooks) {
    if (!v || v.dead) return;
    /* Her mood, and her flight coming to cover her (shipai.js). */
    if (SA()) SA().onHit(G, sys, v, by, t, hooks);
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
      if (hullFrac(v) < runAt(G, sys, v, t)) {
        v.raider = false; v.target = null; v.mode = 'breakoff'; v.threat = by; return;
      }
      return;
    }
    if (v.kind === 'trader' || v.cls === 'shuttle') {
      /* Under fire she chooses (shipai.js slice 3): run, turn and fight,
       * dump part of her hold to buy off a robber, or strike. Sticky for a
       * few seconds, so she does not change her mind on every hit. */
      var pick = by && SA() && SA().choose ? SA().choose(G, sys, v, by, 'hit', t) : null;
      var verb = pick ? pick.verb : 'flee';
      if (!v.fugitive && !v.callSent && Cm.broadcastDistress && verb !== 'surrender') {
        v.callSent = true;
        Cm.broadcastDistress(sys, G, t, v, 'assault', near(G, v) ? hooks : null);
      }
      if (verb === 'surrender' && !v.disabled && Cm.disableNpc) {
        Cm.disableNpc(sys, G, v, 'surrender', t, hooks, by);
        if (by && by.target === v && by.kind === 'pirate') { by.mode = 'chase'; by.standoffKm = 0.3; }
        return;
      }
      if (verb === 'dump' && by && by.kind === 'pirate' && !v.dumped && !v.robbed) { dumpCargo(sys, G, by, v, t, hooks); return; }
      if (verb === 'fight' && Cm.isArmedNpc(v)) {
        if (v.target !== by) say(G, hooks, v, The(v) + ' turns on ' + the(by) + (pick && pick.cornered ? ' - cornered, she fights' : ''), 4);
        v.target = by; v.mode = 'chase'; v.standoffKm = CHASE_KM; v.defendTarget = by; v.threat = null;
        return;
      }
      v.mode = 'breakoff';
      v.threat = by;
      if (Cm.isArmedNpc(v)) v.defendTarget = by;
      return;
    }
    if (v.skirmish && v.target === by && hullFrac(v) < WITHDRAW_HULL) { withdraw(sys, G, v, by, t, hooks); return; }
    if (v.kind === 'pirate') {
      if (lawful(by) && !v.fugitive) { startPursuit(sys, G, by, v, t, hooks, 'pirate'); return; }
      if (alive(v.fugitive)) { v.defendTarget = by; return; }
      /* Somebody she is robbing shoots back, and it hurts: she gives up. */
      if (hullFrac(v) < runAt(G, sys, v, t)) { v.target = null; v.mode = 'breakoff'; v.threat = by; return; }
      return;
    }
    /* Anything armed with nobody to fight answers whoever hit her. */
    if (!alive(v.target) && !v.hostileToPlayer && Cm.isArmedNpc(v)) { v.target = by; v.mode = 'chase'; v.standoffKm = CHASE_KM; }
  }

  function onNpcKill(sys, G, dead, by, t, hooks) {
    if (by && by.target === dead) { by.target = null; by.pursuing = null; by.mode = by.kind === 'pirate' ? 'intercept' : 'shadow'; }
    /* Her flight mourns her, and picks a new leader or scatters. */
    if (SA()) SA().onKill(G, sys, dead, by, t, hooks);
  }

  /* You hit her (Combat.damageNpc, before the crime is booked). */
  function onPlayerHit(sys, G, sp, t, hooks) {
    /* Her mood, and her flight turning on you (shipai.js). */
    if (SA() && sp) SA().onPlayerHit(G, sys, sp, t, hooks);
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
      if (sp.kind === 'pirate' && hullFrac(sp) < runAt(G, sys, sp, t) && !sp.disabled) {
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
    if (SA() && sp) SA().onKill(G, sys, sp, null, t, hooks);
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

  function rebroadcast(sys, G, t) {
    var B = global.Band;
    if (!B || !B.touch) return;
    var all = (sys.patrols || []).concat(sys.traders || [], sys.npcs || []);
    for (var i = 0; i < all.length; i++) {
      var sp = all[i];
      if (!alive(sp)) continue;
      /* A ship with somebody on her is still in trouble, and says so. */
      if (sp.threat && !sp.robbed) B.touch(G, t, 'robbery', sp);
      if (sp.fleeing || sp.pursuedBy) B.touch(G, t, 'pursuit', sp);
      if (sp.skirmish) B.touch(G, t, 'duel', sp);
    }
  }

  function update(sys, G, t, dtSim, hooks) {
    if (!sys || !sys.patrols || !sys.patrols.length || !G || !G.ship || !C() || !S()) return;
    tidy(sys, t);
    /* Flights and moods (shipai.js, slice 2): who flies with whom, who is
     * scared or angry - before anybody decides what to do this frame. */
    if (global.ShipAI && global.ShipAI.tick) global.ShipAI.tick(sys, G, t, hooks);
    rebroadcast(sys, G, t);
    /* And arriving at a call that asked for one (band.js). */
    if (global.Band && global.Band.answer) global.Band.answer(G, sys, t, hooks);
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
    TURNCOAT_MEMORY_S: TURNCOAT_MEMORY_S, opportunistState: opportunistState, turnTurncoat: turnTurncoat,
    markCrime: markCrime, crimeOf: crimeOf, clearCrime: clearCrime, cargoValue: cargoValue,
    STRAIGHT: STRAIGHT, SHAKE_MIN: SHAKE_MIN, SHAKE_EVERY_S: SHAKE_EVERY_S, MOB_GREED: MOB_GREED, shakeDown: shakeDown,
    focusOf: focusOf, choosePrey: choosePrey, startRobbery: startRobbery, strip: strip,
    smuggler: smuggler, startPursuit: startPursuit, arrest: arrest, lawful: lawful, empireOf: empireOf,
    gunOf: gunOf, aimOf: aimOf, withdraw: withdraw,
    onNpcHit: onNpcHit, onNpcKill: onNpcKill, onPlayerHit: onPlayerHit, onPlayerKill: onPlayerKill,
    update: update, raidNews: raidNews, hash01: hash01, band: band, bandOff: bandOff,
    rebroadcast: rebroadcast
  };
  global.Aggression = Aggression;
  if (typeof module !== 'undefined' && module.exports) module.exports = Aggression;
})(typeof window !== 'undefined' ? window : globalThis);
