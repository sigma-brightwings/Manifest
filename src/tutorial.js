/* tutorial.js — Captain Halloway's last run (2026-11-02).
 *
 * Astra: "Write a tutorial which plays like a mission, but teaches the
 * player exactly how to maneuver their ship, how to make money. Maybe have
 * it be an old ship captain retiring and wanting to show the ropes to a
 * new pilot, and when you complete his tutorial, you get his old ship."
 *
 * A NEW CAREER OPENS WITH HIM ON THE CHANNEL. Oren Halloway has flown
 * freight out of this system for forty years, and he is done. He walks
 * you through one honest run — buy where it is made, fly it up to the
 * station, sell where it is wanted, sign a contract, learn which way the
 * nose points and what a prograde burn does to the far side of an orbit,
 * and deliver — and at the end his Tallyman, the Patience, is handed over
 * on the clamp beside you as one of your fleet.
 *
 * AND THEN YOU CHOOSE YOUR SHIP (2026-11-03). Every new career starts
 * him in the classic Talon now; when his lessons end — by CLOSE or by END
 * LESSONS, see endLessons — the ship picker opens at a dock (main.js
 * startPick), and the Patience comes round after it. She is given either
 * way: Astra, "the Patience is always given".
 *
 * NOTHING HERE IS A SCRIPTED SANDBOX. Every lesson is the real system:
 * the real market, the real launch clearance, the real autopilot, the real
 * mission board, and a lesson is passed by reading the ship and the
 * ledger, not by pressing a key the tutorial is listening for. That is
 * what makes it worth playing twice — and what makes it safe to skip, or
 * to run ahead of: a pilot who docks before being told to has simply
 * passed the lesson early. The card only ever SAYS things; it does not
 * take the stick.
 *
 * THE ONE HOOK IT NEEDS from elsewhere is `note()`: the market and the
 * contract desk tell it what just happened (main.js trade(), missions.js
 * completeAtDock), because "did they buy something" cannot be read back
 * off a hold that started empty and might be emptied again.
 *
 * SAID ON ITS OWN CARD, never through say(). `say` holds one message and
 * the game already has plenty to tell you; the captain talking over the
 * port's clearance would be the captain being rude. main.js draws the
 * card from card() and routes its buttons to press().
 *
 * Saved with the career (save.js). A career saved before this existed
 * loads with no tutorial at all, which is right: nobody needs Halloway to
 * explain a ship they have been flying for a month.
 */
(function (global) {
  'use strict';

  var DAY = 86400;

  var CAPTAIN = {
    name: 'Oren Halloway',
    ship: 'Patience',
    hullId: 'trader',
    /* The face on the card (portrait.js). `captain` is the body that
     * always wears a beard; the id is fixed, so it is the same old man in
     * every galaxy. Picked from sixty draws of the composite kit for the
     * oldest plain face — 59, a side parting, no implants or rebreather:
     * a merchant, not a pirate. */
    person: { id: 'mentor|halloway|19', name: 'Oren Halloway', body: 'captain', role: 'captain', liv: 'civ' }
  };

  /* The numbers each lesson is passed at. Picked to be unmistakable rather
   * than hard: a pilot who has done the thing once has cleared them. */
  /* 10, not the 20 it was written with: played, a laden Talon took the
   * better part of a minute and a half of held W to make 20, and the
   * lesson is that W pushes, not endurance. Let go at 10 and she coasts
   * well past it anyway. */
  var CLIMB_KM = 10;         // off the pad and clear of the ground
  var TURN_DEG = 60;         // a turn you meant, not a twitch
  var APO_GAIN = 0.5;        // the far side half as high again...
  var APO_MIN_KM = 400;      // ...and at least this, so a low orbit still has to burn
  var BERTH_DAYS = 30;       // what he paid on the clamp for you
  var END_CONFIRM_S = 4;     // the second click that ends the lessons

  /* The goods he will not send you after: contraband (a first run is not
   * the time to meet customs), waste (it pays the other way round),
   * military fuel (licensed), the courier parcel (not a market good), and
   * hydrogen, which is your jump fuel and teaches the wrong thing about a
   * hold. */
  var NOT_FOR_A_FIRST_RUN = { waste: 1, milfuel: 1, parcel: 1, hydrogen: 1 };

  function E() { return global.Economy; }

  function goodName(cid) {
    var c = E() && E().BY_ID && E().BY_ID[cid];
    return c ? c.name : (cid || 'cargo');
  }

  function firstRunGood(cid) {
    var c = E() && E().BY_ID && E().BY_ID[cid];
    if (!c || c.contraband || c.cat === 'contraband') return false;
    return !NOT_FOR_A_FIRST_RUN[cid];
  }

  function km(x) {
    if (!isFinite(x)) return 'escaping';
    var a = Math.abs(x);
    return a >= 1e6 ? (x / 1e6).toFixed(2) + ' M km'
         : a >= 1000 ? Math.round(x).toLocaleString('en-US') + ' km'
         : x.toFixed(a < 10 ? 1 : 0) + ' km';
  }
  function cr(x) { return Math.round(x).toLocaleString('en-US') + ' cr'; }

  /* ---- the run he picks ---------------------------------------------------
   * Somewhere in orbit worth flying to, and the cargo worth taking there.
   *
   * ORBITAL ONLY for the destination: the lesson is the climb and the
   * autopilot's approach, and a second set of ground doors would teach
   * launch clearance twice. Scored on what a first hold would actually
   * clear — margin times the tonnes this pilot can afford — and divided
   * down by distance, because the first run should be the short one.
   *
   * THE DISTANCE TERM IS MEASURED, NOT FELT. Scored on profit alone, 40
   * sampled openings sent the pilot past the home world 70% of the time,
   * one of them 82 AU out, which is a two-hour autopilot leg in the middle
   * of a lesson. A station over the same world counts as no distance at
   * all; anything else loses half its score per ~100 million km
   * (two-thirds of an AU — under a minute of cruise). The best run still
   * wins when it is a long way better.
   *
   * If nothing is worth carrying, he still sends you up to the nearest
   * station (cid null) and the market lessons quietly stand aside. */
  var NEAR_KM = 1e8;
  function plan(sys, home, t, credits, hold) {
    var Eco = E(), S = global.Sim, Vv = global.V;
    var out = { dest: null, cid: null, buy: 0, sell: 0, score: 0 };
    if (!Eco || !sys || !home || !home.market) return out;
    var homeRows = {};
    Eco.priceList(home, t).forEach(function (r) { homeRows[r.id] = r; });
    var homeAt = S && Vv ? S.bodyPosition(home, sys, t) : null;
    var fallback = null, fallbackD = Infinity;
    (sys.ports || []).forEach(function (p) {
      if (p === home || !p.market || p.surface || p.underground || p.dark ||
          p.fleet || p.docking === false) return;
      var near = p.parentBody === home.parentBody ||
                 (p.parentBody && p.parentBody.parentBody === home.parentBody);
      var d = near ? 0 : homeAt ? Vv.len(Vv.sub(S.bodyPosition(p, sys, t), homeAt)) : NEAR_KM;
      if (d < fallbackD) { fallback = p; fallbackD = d; }
      var reach = 1 / (1 + d / NEAR_KM);
      Eco.priceList(p, t).forEach(function (r) {
        var h = homeRows[r.id];
        if (!h || !firstRunGood(r.id) || !(h.buy > 0) || r.sell === null || !(h.stock >= 10)) return;
        var margin = r.sell - h.buy;
        if (!(margin > 0)) return;
        var tonnes = Math.min(hold || 64, Math.floor((credits || 0) / h.buy), Math.floor(h.stock));
        var score = margin * Math.max(1, tonnes) * reach;
        if (score > out.score) {
          out = { dest: p, cid: r.id, buy: h.buy, sell: r.sell, score: score, km: d };
        }
      });
    });
    if (!out.dest) { out.dest = fallback; out.km = fallbackD; }
    return out;
  }

  /* ---- starting ----------------------------------------------------------- */
  function begin(G, sys, t) {
    if (!G || !G.ship || !G.ship.docked || !sys || !sys.byId) return null;
    var home = sys.byId[G.ship.docked];
    if (!home || !home.market) return null;
    var p = plan(sys, home, t || 0, G.ship.credits, G.ship.cargoCap);
    if (!p.dest) return null;
    return {
      v: 1, step: 'hello', entered: false, at: t || 0,
      star: G.here ? G.here.id : null, starName: G.here ? G.here.name : (sys.name || ''),
      home: home.id, homeName: home.name, surfaceStart: !!home.surface,
      host: home.parentBody ? home.parentBody.id : null,
      hostName: home.parentBody ? home.parentBody.name : '',
      dest: p.dest.id, destName: p.dest.name,
      cid: p.cid, buyAt: Math.round(p.buy), sellAt: Math.round(p.sell),
      bought: 0, spent: 0, sold: 0, gained: 0,
      collapsed: false, done: false
    };
  }

  /* ---- reading the ship --------------------------------------------------- */
  function inHomeSystem(G, tut) { return !tut.star || !G.here || G.here.id === tut.star; }

  function portById(G, tut, env, id) {
    if (!inHomeSystem(G, tut) || !env || !env.sys || !env.sys.byId) return null;
    return env.sys.byId[id] || null;
  }

  /* Out on your own: not on a clamp, not riding the car up a shaft, not
   * sitting on the ground. */
  function free(G) { return !!G.ship && !G.ship.docked && !G.ship.arrival && !G.ship.landed; }

  function altitudeOverHome(G, tut, env) {
    var S = global.Sim, V = global.V;
    var host = portById(G, tut, env, tut.host);
    if (!host || !S || !V) return null;
    return V.len(V.sub(G.ship.pos, S.bodyPosition(host, env.sys, env.t))) - host.radius;
  }

  function rangeTo(G, tut, env, id) {
    var S = global.Sim, V = global.V;
    var p = portById(G, tut, env, id);
    if (!p || !S || !V) return null;
    return V.len(V.sub(G.ship.pos, S.bodyPosition(p, env.sys, env.t)));
  }

  function angleDeg(a, b) {
    var d = a.x * b.x + a.y * b.y + a.z * b.z;
    return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
  }

  function held(G, cid) { return (cid && G.ship.cargo && G.ship.cargo[cid]) || 0; }

  /* (He used to "call ahead" here — set the clearance himself — because the
   * autopilot docked into full ports uncleared and a new player's first
   * docking was a FUGITIVE flag. Astra's answer, the same day, was to fix
   * the autopilot instead: it asks the port itself on the way in and holds
   * for a berth (main.js autodockClearance). So the old man no longer
   * needs to do anything but say how it works.) */

  /* Inside a station's hull: in a bay, its throat or a doorway
   * (Sim.insideStation). Null under node, where there is no model to be
   * inside, which reads as outside. */
  function insideHull(G, env) {
    var S = global.Sim;
    return !!(S && S.insideStation && G.ship && S.insideStation(G.ship.pos, env.sys, env.t));
  }

  function orbitNow(G, env) {
    var S = global.Sim;
    if (!S || !S.oscElements || !free(G)) return null;
    var oe = S.oscElements(G.ship, env.sys, env.t);
    return oe && oe.body ? oe : null;
  }

  function contractLine(c) {
    if (!c) return '';
    return (c.tonnes ? c.tonnes + ' t of ' + goodName(c.cid) + ' ' : '') + 'for ' + (c.toName || 'its port');
  }

  /* ---- the lessons --------------------------------------------------------
   * In order. Each one is:
   *   talk      passed with the card's NEXT button (he is just talking)
   *   skipIf    does not apply to this career (no ground doors, nothing
   *             bought); passed over silently
   *   enter     note where the ship is when the lesson starts
   *   done      read the ship and the ledger; true means passed
   *   words     what he says
   *   goal      what to do, with the keys, in one line
   *   progress  how far along, when there is a number to give */
  var LESSONS = {
    hello: {
      talk: true,
      words: function (G, tut) {
        return 'Name\'s Oren Halloway. Forty years hauling out of ' + tut.starName +
          ', and I\'m done: knees, eyes, the lot. My ship, the ' + CAPTAIN.ship +
          ', is a Tallyman, Ardwick-built like your Talon with nearly twice the hold. ' +
          'I\'d sooner she went to somebody I taught than to a breaker\'s yard. ' +
          'Fly one run my way, start to finish, and she\'s yours.';
      },
      goal: function () { return 'NEXT when you are ready  ·  or END LESSONS if you know the trade'; }
    },

    buy: {
      skipIf: function (G, tut) { return !tut.cid; },
      done: function (G, tut, env) { return tut.bought > 0 && !env.marketOpen; },
      words: function (G, tut) {
        return 'First rule: never fly empty. ' + tut.homeName + ' makes ' + goodName(tut.cid).toLowerCase() +
          ' — about ' + cr(tut.buyAt) + ' a tonne here — and ' + tut.destName + ' pays near ' +
          cr(tut.sellAt) + '. Comms is F4, and you\'re already on ' + tut.homeName +
          '\'s channel. Pick Market and fill what you can afford. Keep a little back for fuel and fines. ' +
          /* The desk prices a lot down the shelf (Economy.lotPrice,
           * 2026-11-04), so the first lesson in buying says so: the price on
           * the board is the first tonne's, and a full hold pays a little
           * more for its last. */
          'Every tonne you take puts the next one up a little — the board\'s price is the first tonne\'s.';
      },
      goal: function (G, tut) {
        return 'F4 → Market → ' + goodName(tut.cid) + '  ·  → buys, Shift+→ ten, Home fills  ·  Esc to close';
      },
      progress: function (G, tut) {
        return tut.bought > 0 ? 'bought ' + tut.bought + ' t for ' + cr(tut.spent) + '  ·  close the console when you are done'
                              : 'nothing bought yet';
      }
    },

    launch: {
      /* Free, or already docked somewhere else: a pilot who got there
       * first has plainly launched. */
      done: function (G, tut) { return free(G) || (!!G.ship.docked && G.ship.docked !== tut.home); },
      words: function (G, tut) {
        return tut.surfaceStart
          ? 'Ground ports keep their doors shut, and nobody opens them for a pilot who hasn\'t asked. ' +
            'Same channel: Request launch permission. Then U, and the car takes you up the shaft. ' +
            'At the top she\'s yours, nose up and climbing.'
          : 'An orbital clamp holds you by nothing but good manners. U lets go.';
      },
      goal: function (G, tut) {
        return tut.surfaceStart ? 'F4 → Request launch permission  ·  then U to ride up to the pad'
                                : 'U to undock';
      },
      progress: function (G) {
        return G.ship.arrival ? 'on the car — wait for the top' : G.ship.docked ? 'on the clamp' : null;
      }
    },

    climb: {
      skipIf: function (G, tut) { return !tut.surfaceStart; },
      done: function (G, tut, env) {
        if (!free(G)) return !!G.ship.docked && G.ship.docked !== tut.home;
        var alt = altitudeOverHome(G, tut, env);
        return alt === null || alt >= CLIMB_KM;
      },
      /* THE FRAME IS NOT RESET BY A NEW CAREER, and that cost a test ship:
       * the burn lesson of the previous run had left ORBITAL on, where W is
       * prograde — level with the ground at the top of the shaft — so held
       * W flew her sideways off the pad and into it at 178 m/s. So the
       * frame is read, and the lesson says which one you need. */
      words: function (G) {
        return (G.flightMode === 'orbital'
          ? 'You\'re in the ORBITAL frame, where W is along your orbit, not your nose. Press / for the SHIP frame first. '
          : '') +
          'You\'re pointing at the sky. In the SHIP frame W pushes along the nose, so hold it and climb, ' +
          'and don\'t let her settle back onto the pad. If you need your hands, Shift+] is vector ' +
          'assist: in air it holds your height when you let go.';
      },
      goal: function (G) {
        return (G.flightMode === 'orbital' ? '/ for SHIP frame, then ' : '') + 'hold W  ·  climb to ' + CLIMB_KM + ' km';
      },
      progress: function (G, tut, env) {
        if (G.ship.landed && G.ship.crashed) return 'wrecked — B for a new hull in orbit';
        var alt = altitudeOverHome(G, tut, env);
        return alt === null ? null : 'altitude ' + km(Math.max(0, alt)) + ' of ' + CLIMB_KM + ' km' +
          (G.flightMode === 'orbital' ? '  ·  ORBITAL frame — W is not up here' : '');
      }
    },

    lock: {
      done: function (G, tut) {
        var nt = G.navTarget, dt = G.dockTarget;
        return (!!nt && nt.kind === 'body' && nt.id === tut.dest && inHomeSystem(G, tut)) ||
               (!!dt && dt.id === tut.dest) || (!!G.ship.docked && G.ship.docked !== tut.home);
      },
      words: function (G, tut) {
        /* F3 FIRST. Played: from the pad, ] took 39 presses to reach the
         * station, because the lock walks every freighter in the sky on
         * the way. The nav list is sorted by range and a click locks. */
        return tut.destName + ' is up in orbit, and nobody flies to a station by eye. ' +
          'F3 is your navigation list, everything in range, nearest first; ports are the ones marked #. ' +
          'Click ' + tut.destName + ' and it\'s locked. [ and ] step through the same list from the cockpit.' +
          (tut.surfaceStart ? ' And don\'t dawdle: you\'re coasting, and what goes up comes down.' : '');
      },
      goal: function (G, tut) { return 'F3 → click ' + tut.destName + '  ·  or [ ] to step the lock'; },
      progress: function (G, tut, env) {
        var nt = G.navTarget, p = nt && nt.kind === 'body' ? env.sys.byId[nt.id] : null;
        return p ? 'locked: ' + p.name : 'nothing locked';
      }
    },

    autodock: {
      done: function (G, tut) { return !!G.ship.docked && G.ship.docked !== tut.home; },
      words: function (G, tut) {
        return 'T gives the clamp to whatever you\'ve locked. T again and the autopilot flies the ' +
          'whole approach: the climb, the cruise drive, the last few metres. She asks ' + tut.destName +
          ' for clearance herself when she drops out of cruise, and if every berth is taken she holds off ' +
          'and asks again. Touch a thruster and the stick is yours. Fly in by hand without asking ' +
          '(F4) and you\'re a fugitive.';
      },
      goal: function (G, tut) { return 'T, then T again  ·  dock at ' + tut.destName; },
      progress: function (G, tut, env) {
        var r = rangeTo(G, tut, env, tut.dest);
        var state = env.autodockPhase === 'hold' ? 'autopilot holding for a berth'
                  : env.autodock ? 'autopilot flying' : (G.dockTarget && G.dockTarget.id === tut.dest) ? 'clamp assigned' : 'no clamp yet';
        return (r === null ? '' : tut.destName + ' ' + km(r) + '  ·  ') + state;
      }
    },

    sell: {
      skipIf: function (G, tut) {
        if (!tut.bought) return true;
        /* Bought, never sold, and none aboard: it went down with a ship. */
        if (!tut.sold && held(G, tut.cid) <= 0) { tut.lost = true; return true; }
        return false;
      },
      done: function (G, tut, env) { return tut.sold > 0 && (!env.marketOpen || held(G, tut.cid) <= 0); },
      words: function (G, tut) {
        var here = G.ship.docked && G.sys && G.sys.byId[G.ship.docked];
        var off = here && here.id !== tut.dest;
        return (off ? 'Not where I sent you, but a market\'s a market. ' : 'Docked. ') +
          'Selling\'s the same desk the other way round: F4, Market, pick the ' + goodName(tut.cid).toLowerCase() +
          ', and ← sells. End sells the lot. You paid ' + cr(tut.bought ? tut.spent / tut.bought : tut.buyAt) +
          ' a tonne. Look at what they\'re paying before you let it go.';
      },
      goal: function (G, tut) { return 'F4 → Market → ' + goodName(tut.cid) + '  ·  ← sells, End sells all  ·  Esc to close'; },
      progress: function (G, tut) {
        return tut.sold ? 'sold ' + tut.sold + ' t for ' + cr(tut.gained) : held(G, tut.cid) + ' t aboard';
      }
    },

    contract: {
      enter: function (G, tut) {
        tut.known = (G.missions || []).map(function (m) { return m.id; });
      },
      done: function (G, tut) {
        var known = {};
        (tut.known || []).forEach(function (id) { known[id] = true; });
        var list = G.missions || [];
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (known[m.id] || m.campaign) continue;
          tut.missed = null;
          tut.contract = { id: m.id, type: m.type, cid: m.cid, tonnes: m.tonnes, toName: m.toName,
                           toPortId: m.toPortId || null, toStarId: m.toStarId || null, deadline: m.deadline };
          return true;
        }
        return false;
      },
      words: function (G, tut) {
        var profit = tut.sold && tut.bought
          ? 'That\'s ' + cr(tut.gained - tut.spent * Math.min(1, tut.sold / tut.bought)) + ' clear on one hold. Buy where it\'s made, sell where it\'s wanted: that\'s trading. '
          : tut.lost
          ? 'The ' + goodName(tut.cid).toLowerCase() + ' went down with the ship. That\'s the dear way to learn it: buy where it\'s made, sell where it\'s wanted, and get there in one piece. '
          : '';
        return profit + 'The other half of the living is the board. F7. Contracts pay for carrying ' +
          'other people\'s freight, and they pay whether prices move or not. A haul stays in this ' +
          'system: take one. Don\'t sign what you can\'t deliver by the deadline. They fine you, and they remember.';
      },
      goal: function () { return 'F7 → pick a contract on the board → sign it'; },
      progress: function (G) {
        var room = G.ship.cargoCap - (global.Sim ? global.Sim.cargoMass(G.ship) : 0);
        return Math.floor(room) + ' t of hold free';
      }
    },

    undock: {
      /* PASSED OUTSIDE THE HULL, not off the clamp. Found the hard way in
       * play: an orbital clamp lets go with a 3 m/s push and leaves you in
       * the bay, and the very next lessons are "turn the nose" and "burn
       * prograde". Turned and burned in there, the test ship went through
       * a bulkhead and was lost with the contract's freight aboard. */
      done: function (G, tut, env) { return free(G) && !insideHull(G, env); },
      words: function (G) {
        var here = G.ship.docked && G.sys && G.sys.byId[G.ship.docked];
        return here && here.surface
          ? 'Signed. Before you go anywhere, there\'s flying I want to see. Ground doors again: F4, Request launch permission, then U.'
          : 'Signed. Before you go anywhere, there\'s flying I want to see. U lets go of the clamp. Some ports carry ' +
            'you out on their own rail; the rest just push you off nose-first at walking pace, and then you\'re ' +
            'inside her hull until you\'re past the doors. Don\'t turn in there. Feather W, Shift for fine thrust, ' +
            'and come out straight.';
      },
      goal: function (G) {
        var here = G.ship.docked && G.sys && G.sys.byId[G.ship.docked];
        return here && here.surface ? 'F4 → Request launch permission  ·  then U'
                                    : 'U to undock  ·  then Shift+W, straight out through the doors';
      },
      progress: function (G, tut, env) {
        if (G.ship.docked) return 'on the clamp';
        if (G.ship.arrival) return 'on the port\'s rail — wait';
        return insideHull(G, env) ? 'inside the hull — ease her out' : null;
      }
    },

    attitude: {
      enter: function (G, tut) {
        var f = G.ship.fwd;
        tut.fwd0 = f ? { x: f.x, y: f.y, z: f.z } : null;
      },
      done: function (G, tut) {
        if (!free(G)) return false;
        if (!tut.fwd0) { LESSONS.attitude.enter(G, tut); return false; }
        return angleDeg(tut.fwd0, G.ship.fwd) >= TURN_DEG;
      },
      words: function () {
        return 'Learn which way you\'re pointing. ↑ and ↓ pitch the nose, ← and → yaw it, Q and E roll. ' +
          'Where she points has nothing to do with where she\'s going: turn her right round and you\'re ' +
          'still on the same orbit. Let go and the thrusters stop her turning; X cuts the engine.';
      },
      goal: function () { return '↑ ↓ ← →  and  Q E  ·  swing the nose ' + TURN_DEG + '°'; },
      progress: function (G, tut) {
        if (!free(G)) return 'undock first';
        return tut.fwd0 ? 'nose swung ' + Math.round(angleDeg(tut.fwd0, G.ship.fwd)) + '° of ' + TURN_DEG + '°' : null;
      }
    },

    burn: {
      enter: function (G, tut, env) {
        var oe = orbitNow(G, env);
        tut.orbit0 = oe && oe.closed ? { body: oe.body.id, apo: oe.apoAlt } : null;
      },
      done: function (G, tut, env) {
        var oe = orbitNow(G, env);
        if (!oe) return false;
        if (!tut.orbit0 || tut.orbit0.body !== oe.body.id) {
          tut.orbit0 = oe.closed ? { body: oe.body.id, apo: oe.apoAlt } : null;
          return false;
        }
        return !oe.closed || oe.apoAlt >= burnTarget(tut);
      },
      words: function () {
        return 'Now the part no autopilot can teach you. / swaps to the ORBITAL frame, where W is prograde: ' +
          'along the way you\'re already moving. V draws where you\'re going. Burn prograde and watch ' +
          'the far side of the orbit lift. Push on one side, the other side moves. That\'s the whole of it.';
      },
      goal: function () { return '/ for ORBITAL  ·  V to see the line  ·  hold W until the far side is half as high again'; },
      progress: function (G, tut, env) {
        var oe = orbitNow(G, env);
        if (!oe) return 'undock first';
        if (!tut.orbit0) return 'apoapsis ' + km(oe.apoAlt);
        return 'apoapsis ' + km(oe.apoAlt) + '  →  ' + km(burnTarget(tut)) +
               (G.flightMode === 'orbital' ? '  ·  ORBITAL frame' : '  ·  SHIP frame — / to swap');
      }
    },

    deliver: {
      skipIf: function (G, tut) { return !tut.contract; },
      done: function (G, tut) {
        if (tut.delivered) return true;
        /* GONE AND NOT DELIVERED is a blown contract. Back to the board:
         * the lesson is delivering one, not having signed one. */
        var live = (G.missions || []).some(function (m) { return m.id === tut.contract.id; });
        if (!live) { tut.missed = tut.contract; tut.contract = null; tut.back = 'contract'; }
        return false;
      },
      words: function (G, tut) {
        var c = tut.contract || {};
        var far = c.toStarId && (!G.here || c.toStarId !== G.here.id);
        /* Kept short on purpose: at 800 x 600 the first draft of this ran
         * the card two-thirds of the way down the canopy. */
        return 'Now earn it. The contract\'s for ' + (c.toName || 'its port') + '. ' +
          (far ? 'That\'s another star: F6 lays in the course, F8 jumps, then lock the port and dock. '
               : 'Lock it, T, T, same as before. ') +
          (G.flightMode === 'orbital' ? '/ puts you back in the SHIP frame for flying near things. ' : '') +
          'Docking there settles it. If you see HOLD on the autopilot, she\'s waiting for a berth: let her.';
      },
      goal: function (G, tut) { return 'deliver ' + contractLine(tut.contract) + '  ·  F7 shows where'; },
      progress: function (G, tut, env) {
        var c = tut.contract;
        if (!c) return null;
        var left = c.deadline - (env.t || 0);
        var d = Math.floor(left / DAY), h = Math.floor((left - d * DAY) / 3600);
        /* A ship lost on the way loses the freight with her, and the
         * contract then sits there unable to settle until its deadline
         * fines you. Say so, rather than leaving the card counting down. */
        var short = c.cid && c.type !== 'passage' && held(G, c.cid) + 1e-9 < (c.tonnes || 0);
        return (short ? 'freight missing: ' + Math.floor(held(G, c.cid)) + ' of ' + c.tonnes + ' t aboard  ·  ' : '') +
               (left > 0 ? 'due in ' + (d ? d + ' d ' : '') + h + ' h' : 'overdue');
      }
    },

    /* THE LAST WORDS COME BEFORE THE KEYS (2026-11-03). Astra: "make the
     * tutorial go first, then you get to choose your ship". So he says
     * goodbye here, CLOSE ends the lessons, the ship picker opens (main.js
     * startPick), and only then is the Patience brought round — see
     * HANDOVER, which is now last for exactly that reason. */
    farewell: {
      talk: true,
      words: function (G, tut) {
        return 'That\'s the trade. The rest is doing it again somewhere further away. ' +
          (tut.pickAtEnd
            ? 'One choice first: the yard will take the Talon in against a ship built for the work you want, ' +
              'and what you made today goes on top. Or keep her. Either way the ' + CAPTAIN.ship + ' is yours as well. '
            : 'Dock and I\'ll have the ' + CAPTAIN.ship + ' brought round. ') +
          'Jumps are F6 and F8, the yard is F5, and H lists every key there is. Fly safe, Captain.';
      },
      goal: function (G, tut) {
        return tut.pickAtEnd ? 'CLOSE to end the lessons and choose your ship' : 'CLOSE to end the lessons';
      }
    },

    /* AFTER THE LESSONS, and after the choice. Two reasons it is last:
     *  - the ship picker trades in the ship you are flying, and that must
     *    be the Talon. Handed over first, the Patience could be the hull
     *    you are sitting in when the picker opens (TAKE COMMAND is one
     *    click), and an Easy pick would then have traded HER in;
     *  - END LESSONS lands here too (endLessons), so a pilot who skips him
     *    still gets the ship he promised. Astra: the Patience is always
     *    given.
     * So she waits while G.startPending is up, and comes round the moment
     * the choice is made, at that dock. */
    handover: {
      done: function (G, tut, env) {
        if (!tut.given && G.ship.docked && !G.startPending) give(G, tut, env);
        if (!tut.given) return false;
        /* Taken command of: her record is gone. Not "flying a Tallyman"
         * any more, as it was — an Easy trade start IS a Tallyman, and
         * would have passed this before she was ever looked at. */
        var F = global.Fleet;
        return !!F && !F.byId(G, tut.recId);
      },
      words: function (G, tut) {
        if (!tut.given) {
          /* Docked with a choice waiting is the picker open, or closed for
           * later: say which way back to it, not "dock anywhere" to a pilot
           * sitting on a clamp (found by looking, 2026-11-03). */
          if (G.startPending) {
            return G.ship.docked
              ? 'Choose your ship first. The moment you have, I\'ll have the ' + CAPTAIN.ship + ' brought round to this clamp.'
              : 'Dock anywhere and choose your ship. I\'ll have the ' + CAPTAIN.ship + ' brought round to you there.';
          }
          return 'Dock anywhere and I\'ll have her brought round to you.';
        }
        /* "She wants hands": a Tallyman is too much ship for one pilot
         * (Crew.needsCrew), and the yard says so the moment you take her. */
        return (tut.delivered ? 'Paid, and on time. ' : '') + 'The ' + CAPTAIN.ship + ' is on the clamp beside you at ' +
          tut.givenAt + ', berth paid for a month. She pulls a little on a hard burn. Always has. Don\'t let ' +
          'anybody at a yard tell you that\'s a fault. She wants a hand or two aboard: the CREW tab at any yard. ' +
          'Take command on the FLEET tab. It\'s your name on the manifest now.';
      },
      goal: function (G, tut) {
        return tut.given ? 'F5 → FLEET → TAKE COMMAND  ·  or LATER'
             : G.startPending ? (G.ship.docked ? 'choose your ship  ·  Esc → Choose your ship'
                                               : 'Dock anywhere to choose your ship')
             : 'dock at any port';
      }
    }
  };

  /* Farewell before handover since 2026-11-03 — see HANDOVER. A career
   * saved with the old order sitting on HANDOVER is walked into
   * endLessons by update(), so it gets the picker before the ship. */
  var ORDER = ['hello', 'buy', 'launch', 'climb', 'lock', 'autodock', 'sell',
               'contract', 'undock', 'attitude', 'burn', 'deliver', 'farewell', 'handover'];
  var LAST_LESSON = 'farewell';

  function burnTarget(tut) {
    var a = tut.orbit0 ? tut.orbit0.apo : 0;
    return Math.max(a * (1 + APO_GAIN), a + APO_MIN_KM);
  }

  /* ---- the Patience -------------------------------------------------------
   * Handed over the way a commissioned hull is (Combat.deliverOrders): a
   * fleet record on the clamp you are standing at, with her yard outfit and
   * the hull's standard kit, so taking command is the ordinary FLEET row and
   * not a special case. Her month on the clamp is his parting gift. */
  function give(G, tut, env) {
    var C = global.Combat, F = global.Fleet, S = global.Sim;
    var port = G.ship.docked && env.sys && env.sys.byId ? env.sys.byId[G.ship.docked] : null;
    if (!C || !F || !C.HULLS || !port) return false;
    var h = C.HULLS[CAPTAIN.hullId];
    if (!h) return false;
    var t = env.t || 0;
    var ship = {
      hullId: h.id, fit: {}, cargo: {}, crew: [], passengers: 0,
      fuel: h.fuelCap, thrusterFuel: h.thrusterCap, hullHp: h.hullMax,
      shipName: CAPTAIN.ship, paint: null,
      reg: S && S.regCode ? S.regCode((G.seed || '') + '|halloway') : null,
      bornId: h.id + '@halloway#0'
    };
    var o = C.outfitOver ? C.outfitOver(h.id, {}) : null;
    if (o && o.fit) for (var k in o.fit) ship.fit[k] = o.fit[k];
    if (C.addHullStandard) C.addHullStandard(ship);
    var rec = F.record(ship, port.id, CAPTAIN.ship);
    rec.id = 'fs-halloway';
    rec.portName = port.name;
    rec.star = G.here ? G.here.id : null;
    rec.starName = G.here ? G.here.name : null;
    rec.berthTo = rec.wagesTo = t + BERTH_DAYS * DAY;
    F.add(G, rec);
    tut.given = true;
    tut.recId = rec.id;
    tut.givenAt = port.name;
    jot(G, 'favour', 'Captain ' + CAPTAIN.name + ' handed over the ' + CAPTAIN.ship +
        ', his Tallyman, at ' + port.name);
    if (env.hooks && env.hooks.sound) env.hooks.sound('pay');
    return true;
  }

  function jot(G, kind, text) {
    var J = global.Journal;
    if (J && J.add) J.add(G, kind, text);
  }

  /* ---- moving along -------------------------------------------------------- */
  function advance(G, tut, env, quietly) {
    var i = ORDER.indexOf(tut.step);
    /* Out of the last lesson is the end of the lessons, the same moment
     * END LESSONS reaches (endLessons). */
    if (tut.step === LAST_LESSON) { endLessons(G, tut, false); return; }
    tut.step = ORDER[i + 1] || null;
    tut.entered = false;
    tut.endArmedAt = null;
    if (!tut.step) { finish(G, tut); return; }
    if (!quietly && env && env.hooks && env.hooks.sound) env.hooks.sound('click');
  }

  /* THE LESSONS ARE OVER — by his CLOSE or by END LESSONS, which are now
   * the same road (2026-11-03). Both go to HANDOVER, so the Patience is
   * given either way, and both raise G.startPending for a career that has
   * not chosen its ship yet (tut.pickAtEnd, set by main.js newGame). The
   * flag is on G rather than on the tutorial because it outlives him: the
   * picker can still be waiting after the card has gone. main.js opens it
   * at a dock and clears the flag when a row is taken. */
  function endLessons(G, tut, skipped) {
    if (tut.ended) return;
    tut.ended = true;
    tut.skipped = !!skipped;
    tut.step = 'handover';
    tut.entered = false;
    tut.endArmedAt = null;
    if (tut.pickAtEnd && !tut.picked) G.startPending = true;
    jot(G, 'favour', skipped
      ? 'Told Captain ' + CAPTAIN.name + ' you knew the trade already'
      : 'Captain ' + CAPTAIN.name + '\'s lessons done');
  }

  /* The card goes: his ship is handed over and taken or left for LATER. */
  function finish(G, tut) {
    tut.done = true;
    tut.step = null;
  }

  /* Once a frame, from main.js update(). Steps that do not apply, and
   * steps already passed by a pilot running ahead, fall through in the same
   * frame — so docking at the station before being asked to lock it moves
   * straight past both. Bounded, so a lesson that is somehow always passed
   * cannot spin. */
  function update(G, env) {
    var tut = G && G.tutorial;
    if (!tut || tut.done || !G.ship || !env) return;
    /* A career saved under the old order (handover, then farewell) and
     * sitting on HANDOVER has not ended its lessons: end them now, so it
     * is asked its ship before the Patience is given — and if she was
     * given already, handover reads that and passes as it always did. */
    if (tut.step === 'handover' && !tut.ended) endLessons(G, tut, false);
    for (var guard = 0; guard < ORDER.length + 2; guard++) {
      var L = LESSONS[tut.step];
      if (!L) { finish(G, tut); return; }
      if (L.skipIf && L.skipIf(G, tut, env)) { advance(G, tut, env, true); continue; }
      if (!tut.entered) { tut.entered = true; tut.stepAt = env.t || 0; if (L.enter) L.enter(G, tut, env); }
      if (L.talk) return;
      if (L.done(G, tut, env)) { advance(G, tut, env); continue; }
      /* A lesson can send you back (a blown contract goes back to the
       * board). */
      if (tut.back) {
        tut.step = tut.back; tut.back = null; tut.entered = false;
        continue;
      }
      return;
    }
  }

  /* What just happened at a desk. kind 'buy' / 'sell': {cid, tonnes, cr}
   * (cr is what changed hands, always positive); 'contract': {id, pay}. */
  function note(G, kind, d) {
    var tut = G && G.tutorial;
    if (!tut || tut.done || !d) return;
    if (kind === 'buy' && d.tonnes > 0) {
      /* He named a good, but a pilot who buys something else has made a
       * choice, and the lesson follows the choice. */
      if (!tut.bought && d.cid !== tut.cid && firstRunGood(d.cid)) tut.cid = d.cid;
      if (d.cid !== tut.cid) return;
      tut.bought += d.tonnes;
      tut.spent += d.cr;
    } else if (kind === 'sell' && d.tonnes > 0 && d.cid === tut.cid && tut.bought) {
      tut.sold += d.tonnes;
      tut.gained += d.cr;
    } else if (kind === 'contract' && tut.contract && d.id === tut.contract.id) {
      tut.delivered = true;
    }
  }

  /* The card's buttons. `now` is real seconds, for the confirm on END. */
  function press(G, id, env) {
    var tut = G && G.tutorial;
    if (!tut || tut.done) return;
    var L = LESSONS[tut.step];
    if (id === 'hide') { tut.collapsed = true; return; }
    if (id === 'show') { tut.collapsed = false; return; }
    if (id === 'next' || id === 'skip' || id === 'later') { advance(G, tut, env); return; }
    if (id === 'end') {
      var now = env && env.now;
      if (tut.endArmedAt !== null && tut.endArmedAt !== undefined &&
          now - tut.endArmedAt >= 0 && now - tut.endArmedAt < END_CONFIRM_S) {
        endLessons(G, tut, true);
      } else {
        tut.endArmedAt = now;
      }
      return;
    }
    if (L && L.talk && id === 'close') advance(G, tut, env);
  }

  /* Everything main.js needs to draw the card, and nothing it has to work
   * out for itself. Null when there is no card. */
  function card(G, env) {
    var tut = G && G.tutorial;
    if (!tut || tut.done || !tut.step) return null;
    var L = LESSONS[tut.step];
    if (!L) return null;
    var n = ORDER.indexOf(tut.step);
    var buttons = [];
    if (tut.step === 'farewell') buttons.push({ id: 'close', label: 'CLOSE' });
    else if (L.talk) buttons.push({ id: 'next', label: 'NEXT' });
    else if (tut.step === 'handover') { if (tut.given) buttons.push({ id: 'later', label: 'LATER' }); }
    else buttons.push({ id: 'skip', label: 'SKIP STEP' });
    buttons.push({ id: 'hide', label: 'HIDE' });
    /* Not on his goodbye, and not after it: once the lessons have ended
     * there is nothing left for END LESSONS to end. */
    if (tut.step !== 'farewell' && !tut.ended) {
      var armed = tut.endArmedAt !== null && tut.endArmedAt !== undefined &&
                  env && env.now - tut.endArmedAt >= 0 && env.now - tut.endArmedAt < END_CONFIRM_S;
      buttons.push({ id: 'end', label: armed ? 'SURE? CLICK AGAIN' : 'END LESSONS', warn: armed });
    }
    var away = !inHomeSystem(G, tut) && ['lock', 'autodock', 'climb'].indexOf(tut.step) >= 0;
    var missed = tut.step === 'contract' && tut.missed;
    return {
      name: 'CAPTAIN ' + CAPTAIN.name.toUpperCase(),
      person: CAPTAIN.person,
      lesson: n + 1, of: ORDER.length,
      collapsed: !!tut.collapsed,
      words: (missed ? 'That one got away from you. It happens once. Take another, and watch the clock this time. ' : '') +
             L.words(G, tut, env),
      goal: away ? 'you have left ' + tut.starName + ' — come back, or SKIP STEP' : L.goal(G, tut, env),
      progress: L.progress ? L.progress(G, tut, env) : null,
      buttons: buttons
    };
  }

  var Tutorial = {
    CAPTAIN: CAPTAIN, ORDER: ORDER, LESSONS: LESSONS,
    CLIMB_KM: CLIMB_KM, TURN_DEG: TURN_DEG, APO_GAIN: APO_GAIN, APO_MIN_KM: APO_MIN_KM, BERTH_DAYS: BERTH_DAYS,
    plan: plan, begin: begin, update: update, note: note, press: press, card: card,
    give: give, burnTarget: burnTarget, endLessons: endLessons
  };
  global.Tutorial = Tutorial;
  if (typeof module !== 'undefined' && module.exports) module.exports = Tutorial;
})(typeof window !== 'undefined' ? window : globalThis);
