/* favours.js — who owes whom, who knows whom, and who flies with you.
 *
 * Step 4 of DESIGN-NOTES-CAPTAINS-RUMOURS-DISGUISE-v3 (sections 6 and 8).
 * Captains (captains.js) remember what you did to THEM. This file is what
 * that memory does next:
 *
 *   FAVOURS AND DEBTS. Every captain's memory carries `debt`: + they owe
 *   you, − you owe them. Saving a ship puts its captain in your debt;
 *   answering your honest mayday puts you in theirs. A captain who owes
 *   you pays it back — a tip-off when pirates are on your lane, unasked —
 *   or you call it in from the Talk menu (a tip-off, reaction mass passed
 *   across, a word with their people). A captain you owe calls it in, and
 *   saying no costs you with them.
 *
 *   FRIENDS AND RIVALS. Every captain has one of each (captains.js draws
 *   them from the seed). Cross a captain and their friend hears it, near
 *   first-hand — weighted above the public record. Help one and their
 *   rival grows suspicious of you. Kill one and their friend knows who.
 *
 *   GOING INTO BUSINESS. A grateful trader offers ("Looking for another
 *   fleetmate? We could go into business together."). Astra's call was
 *   "Offer both": she brings her ship as a PARTNER — it joins your fleet
 *   and takes standing orders, but it stays hers, profit is split 50/50,
 *   you cannot sell it, and she leaves if you mistreat her or turn into
 *   what she despises — or she comes aboard as CREW, a skilled officer at
 *   a friend's wage.
 *
 * Plain IIFE on `global`, like every other module. Uses Captains, Sim,
 * Combat, Fleet, Crew, Messages, Missions when present; tests load it in
 * node without a renderer.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG;
  var V = global.V || global.Vec3;

  function Cap() { return global.Captains; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist(a, b) {
    if (V && V.dist) return V.dist(a, b);
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function hash(s) { return (RNG && RNG.hashString ? RNG.hashString(s) : 0) >>> 0; }
  function unit(s) { return (hash(s) % 100000) / 100000; }

  /* ---- debts ----------------------------------------------------------------
   * A small signed integer on the memory of whoever they think you are (a
   * disguise they believe owes, and is owed, as itself — see resolve). The
   * clamp is the same argument as the dials': one rescue is a favour, not
   * a pension. */
  var DEBT_MAX = 5;

  function addDebt(G, sys, contact, n, t, why) {
    var C = Cap();
    if (!C || !C.hasCaptain(contact)) return null;
    var r = C.resolve(G, sys, contact);
    var m = C.memory(G, r.key, true);
    m.debt = clamp((m.debt || 0) + (n | 0), -DEBT_MAX, DEBT_MAX);
    if (why) m.debtWhy = why;
    return m;
  }

  function debtOf(G, sys, contact) {
    var C = Cap();
    if (!C || !C.hasCaptain(contact)) return 0;
    var m = C.resolve(G, sys, contact).m;
    return (m && m.debt) || 0;
  }

  /* ---- friends and rivals ---------------------------------------------------
   * Hearsay goes on the `heard` dial, not `feeling`: the friend was not
   * there. captains.js opinion() reads `heard` IN FULL for a captain who
   * has never seen you act (above the public record, which is everybody's
   * gossip) and at a third for one who has (their own eyes come first).
   *
   * WHICH YOU they heard about is whichever you the victim saw: a persona
   * memory key ('star/r3#x:AB-1234') passes its suffix on, so robbing
   * someone as the "Halcyon Tern" teaches her friend to hate the Halcyon
   * Tern. That is what rumours attaching to an identity means. */
  var FRIEND_SHARE = 0.6;
  var SPREAD = {
    attacked: true, robbed: true, exploited: true, lied: true, disguise: true,
    rescued: true, answered: true
  };

  function suffixOf(key) {
    var i = key ? key.indexOf('#') : -1;
    return i >= 0 ? key.slice(i) : '';
  }

  /* A profile for a roster key, so a friend can be named. Only works in
   * the system the captain lives in, which is the only place it is asked. */
  function profileByKey(G, sys, key) {
    var C = Cap();
    var roster = C.rosterOf(G, sys);
    for (var i = 0; i < roster.length; i++) {
      if (roster[i].key === key) return C.profile(G, sys, roster[i].ref);
    }
    return null;
  }

  function applyHearsay(G, key, delta, kind, t, aboutName) {
    var C = Cap();
    var m = C.memory(G, key, true);
    m.heard = clamp((m.heard || 0) + delta, -C.DIAL, C.DIAL);
    C._logEntry(m, kind, t, { f: aboutName });
    return m;
  }

  /* AT SHIP SPEED when rumours.js is loaded: the friend hears it when the
   * news reaches her ship, and not at all if nobody saw. Without it (the
   * node tests for this file), at once. */
  function hearsay(G, sys, contact, key, delta, kind, t, aboutName) {
    var R = global.Rumours;
    if (R && R.defer && sys) {
      R.defer(G, sys, contact, { key: key, d: delta, kind: kind, f: aboutName }, t);
      return null;
    }
    return applyHearsay(G, key, delta, kind, t, aboutName);
  }

  function afterRecord(G, sys, contact, kind, t, m, key) {
    if (!SPREAD[kind] || !sys) return;
    var C = Cap();
    var ev = C.EVENTS[kind];
    var p = C.profile(G, sys, contact);
    if (!p || !ev) return;
    var suf = suffixOf(key);
    var good = (ev.feeling || 0) > 0;
    if (p.friend) {
      var d = Math.round((ev.feeling || ev.honesty || 0) * FRIEND_SHARE);
      if (!d) d = good ? 1 : -1;
      hearsay(G, sys, contact, p.friend + suf, d, good ? 'friendSaved' : 'friendTold', t, p.name);
    }
    if (p.rival) {
      /* Help her and her rival wonders what you are after; cross her and
       * her rival is not sorry. Small either way — a rival's opinion of
       * you is mostly an opinion of her. */
      hearsay(G, sys, contact, p.rival + suf, good ? -(kind === 'rescued' ? 2 : 1) : 1,
              good ? 'rivalHelped' : 'rivalHurt', t, p.name);
    }
  }

  /* A captain you killed has a friend who knows who did it. Called from
   * Combat.killNpc for anything with a captain in the chair. */
  function died(G, sys, spec, t) {
    var C = Cap();
    if (!C || !C.hasCaptain(spec)) return;
    var p = C.profile(G, sys, spec);
    if (!p || !p.friend) return;
    var r = C.resolve(G, sys, spec);
    hearsay(G, sys, spec, p.friend + suffixOf(r.key), -6, 'killedFriend', t, p.name);
  }

  /* ---- calling in a favour --------------------------------------------------
   * What a captain who owes you can do for you, right now, from her chair.
   * Each costs one point of debt. The note says what it will do before it
   * is pressed (doctrine 5: a refusal carries its reason). */
  var MASS_RANGE = 50;          // km — close enough to pass a line across
  var MASS_GIFT = 0.35;         // of your tank, at most
  var WORD_STANDING = 5;

  function speaker(p, contact) {
    return p.title + ' ' + p.family + ', ' + (contact.name || 'her ship') + ': "';
  }

  function nearestPirate(G, sys, t) {
    var Sim = global.Sim;
    if (!Sim || !sys || !G.ship) return null;
    var list = Sim.shipsAll(sys, t), best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.kind !== 'pirate') continue;
      var d = dist(s.pos, G.ship.pos);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { ship: best, km: bd } : null;
  }

  function fmtKm(km) {
    if (km >= 10000) return Math.round(km / 1000) + 'k km';
    return Math.round(km) + ' km';
  }

  function hullOf(G) {
    var C = global.Combat;
    return C && C.HULLS ? C.HULLS[(G.ship && G.ship.hullId) || 'talon'] : null;
  }

  function favourOptions(G, sys, contact, t) {
    var C = Cap();
    var debt = debtOf(G, sys, contact);
    if (debt <= 0) return [];
    var p = C.profile(G, sys, contact);
    if (!p) return [];
    var out = [], owes = 'she owes you ' + debt;
    out.push({ id: 'tip', label: 'Favour: what is hunting on these lanes?',
               enabled: true, note: owes + ' · she tells you where the nearest pirate is' });
    var h = hullOf(G), s = G.ship || {};
    var room = h ? Math.max(0, h.thrusterCap - (s.thrusterFuel || 0)) : 0;
    var close = contact.pos && s.pos && dist(contact.pos, s.pos) <= MASS_RANGE;
    out.push({ id: 'mass', label: 'Favour: pass across some reaction mass',
               enabled: !!close && room > 0.5,
               note: !close ? 'come within ' + MASS_RANGE + ' km to pass a line'
                   : room <= 0.5 ? 'your tanks are full' : owes + ' · up to ' +
                     Math.round(Math.min(room, (h ? h.thrusterCap : 0) * MASS_GIFT)) + ' t' });
    var fac = p.faction && p.faction !== 'outlaw' ? p.faction : null;
    out.push({ id: 'word', label: 'Favour: put in a word with her people',
               enabled: !!fac && p.role !== 'pirate',
               note: !fac ? 'she has no people to speak to' : owes + ' · standing +' + WORD_STANDING });
    return out;
  }

  function callIn(G, sys, contact, id, t, hooks) {
    var C = Cap();
    function say(m, secs) { if (hooks && hooks.say) hooks.say(m, secs || 8); }
    var debt = debtOf(G, sys, contact);
    var p = C.profile(G, sys, contact);
    if (!p || debt <= 0) { say((contact.name || 'They') + ' owes you nothing.', 4); return { ok: false }; }
    var who = speaker(p, contact), line;
    if (id === 'tip') {
      var np = nearestPirate(G, sys, t);
      line = np ? 'There is a raider calling herself the ' + (np.ship.name || 'nobody') + ', ' +
                  fmtKm(np.km) + ' from you. Give her room.'
                : 'Lanes are clean, as far as anyone on my board can tell. Fly easy.';
    } else if (id === 'mass') {
      var h = hullOf(G), s = G.ship;
      var room = h ? Math.max(0, h.thrusterCap - (s.thrusterFuel || 0)) : 0;
      if (!(contact.pos && dist(contact.pos, s.pos) <= MASS_RANGE) || room <= 0.5) {
        say(who + 'Come alongside first, then we can talk tanks."', 5); return { ok: false };
      }
      var give = Math.min(room, h.thrusterCap * MASS_GIFT);
      s.thrusterFuel = (s.thrusterFuel || 0) + give;
      line = 'Line is across. ' + Math.round(give) + ' tonnes, and do not mention it.';
    } else if (id === 'word') {
      var M = global.Missions;
      if (!p.faction || p.faction === 'outlaw' || !M || !M.bumpStanding) {
        say(who + 'Nobody I know would listen."', 5); return { ok: false };
      }
      M.bumpStanding(G, p.faction, WORD_STANDING);
      line = 'I will tell them what you did for me. They will listen.';
    } else return { ok: false };
    addDebt(G, sys, contact, -1, t, null);
    C.record(G, sys, contact, 'favour', t, null);
    say(who + line + (debt - 1 <= 0 ? ' And now we are square."' : '"'), 9);
    return { ok: true, line: line };
  }

  /* ---- they call it in -------------------------------------------------------
   * One open ask at a time, from a captain you owe who is on your board.
   * It sits on her row in the comms page (screens.js) until you answer or
   * it runs out — and running out is an answer. */
  var ASK_SLOT = 3600;          // s — at most one new ask per captain per hour
  var ASK_CHANCE = 0.5;
  var ASK_LIFE = 3600;          // s
  var CHECK_EVERY = 30;         // s — the nearby walk is not a per-frame job

  function askFor(G, sys, contact, debt, t) {
    var C = Cap();
    var p = C.profile(G, sys, contact);
    if (!p) return null;
    var slot = Math.floor(t / ASK_SLOT);
    var u = unit('ask|' + G.seed + '|' + p.key + '|' + slot);
    if (u >= ASK_CHANCE) return null;
    var kind = unit('askkind|' + p.key + '|' + slot) < 0.5 ? 'credits' : 'mass';
    var amount = kind === 'credits' ? 150 * (1 + Math.min(3, -debt)) : 3 + Math.min(3, -debt);
    var shipRef = contact.route ? { route: contact.route.id } : { spec: (contact.spec || contact).id };
    return { key: C.keyOf(G, sys, contact), ref: shipRef, star: G.here && G.here.id,
             name: contact.name, speaker: p.title + ' ' + p.family,
             kind: kind, amount: amount, at: t, until: t + ASK_LIFE };
  }

  function askText(a) {
    return a.kind === 'credits'
      ? 'I am short ' + a.amount + ' cr on my berthing. You owe me one — can you wire it?'
      : 'My thruster tanks are running dry. Can you pass me ' + a.amount + ' t? You owe me one.';
  }

  function askContact(G, sys, a) {
    var M = global.Messages;
    return M && M.contactOf ? M.contactOf(sys, a.ref) : null;
  }

  function answerAsk(G, sys, give, t, hooks) {
    var C = Cap(), a = G.favourAsk;
    function say(m, secs) { if (hooks && hooks.say) hooks.say(m, secs || 8); }
    if (!a) return { ok: false };
    var contact = askContact(G, sys, a);
    var s = G.ship || {};
    if (give) {
      if (a.kind === 'credits') {
        if ((s.credits || 0) < a.amount) { say('You cannot cover ' + a.amount + ' cr.', 4); return { ok: false }; }
        s.credits -= a.amount;
      } else {
        var live = contact && global.Sim ? liveState(sys, contact, t) : null;
        if (!live || !live.pos || dist(live.pos, s.pos) > MASS_RANGE) {
          say('Come within ' + MASS_RANGE + ' km of the ' + a.name + ' to pass a line.', 5);
          return { ok: false };
        }
        if ((s.thrusterFuel || 0) < a.amount + 1) { say('You do not have it to spare.', 4); return { ok: false }; }
        s.thrusterFuel -= a.amount;
      }
    }
    G.favourAsk = null;
    if (contact) {
      C.record(G, sys, contact, give ? 'repaid' : 'refused', t, null);
      if (give) addDebt(G, sys, contact, 1, t, null);
    }
    say(a.speaker + ', ' + a.name + ': "' +
        (give ? 'Thank you. That is us square, or near enough."'
              : 'After everything. All right. I will remember that."'), 8);
    return { ok: true, gave: !!give };
  }

  function liveState(sys, contact, t) {
    var Sim = global.Sim;
    if (contact.route && Sim && Sim.trafficState) return Sim.trafficState(contact.route, sys, t);
    return contact.live || contact;
  }

  /* ---- going into business --------------------------------------------------
   * Only a trader can bring a ship: a patrol's hull belongs to its navy,
   * and a pirate's to whoever she took it from. Only a GRATEFUL one offers,
   * because that is the band reserved for a captain you did something for. */
  var PARTNER_SHARE = 0.5;
  var FRIEND_WAGE = 0.6;        // of the going rate — she is not here for the money

  function recruitRefusal(G, sys, contact) {
    var C = Cap();
    if (!C || !C.hasCaptain(contact)) return 'nobody in that chair to ask';
    var op = C.opinion(G, sys, contact);
    if (!op) return 'nobody in that chair to ask';
    var p = op.profile;
    var route = contact.route || null;
    if (p.role !== 'trade' || !route || !route.from) return 'she has a commission, not a ship of her own';
    if (G.joined && G.joined[p.key]) return 'she already flies with you';
    if (op.band !== 'grateful') return 'she would need a reason to throw in with you';
    return null;
  }

  var HULL_FOR = { shuttle: 'talon' };   // anything bigger is a working freighter

  function roleFor(p) {
    if (p.temper === 'gruff') return 'engineer';
    if (p.temper === 'mercenary') return 'gunner';
    return 'pilot';
  }

  function ratingFor(p) {
    return 4 + (unit('rating|' + p.key) < 0.35 ? 1 : 0);
  }

  function recruit(G, sys, contact, mode, t, hooks) {
    var C = Cap(), Crew = global.Crew, Fleet = global.Fleet, Combat = global.Combat;
    function say(m, secs) { if (hooks && hooks.say) hooks.say(m, secs || 9); }
    var why = recruitRefusal(G, sys, contact);
    if (why) return { ok: false, why: why };
    if (!Crew || (mode === 'partner' && !Fleet)) return { ok: false, why: 'nothing to sign' };
    var p = C.profile(G, sys, contact);
    var route = contact.route;
    var rec = null, member;
    var mKey = C.resolve(G, sys, contact).key;
    var m = C.memory(G, mKey, true);

    if (mode === 'partner') {
      var hullId = HULL_FOR[route.cls] || 'mule';
      var hull = Combat && Combat.HULLS ? Combat.HULLS[hullId] : null;
      var port = sys.byId ? sys.byId[route.to] : null;
      member = Crew.make(p.name, 'pilot', ratingFor(p), p.key);
      member.partner = true; member.wageMul = 0;
      var rs = C.recordOf(G, 'self');
      rec = {
        id: 'fp-' + p.key.replace(/[^A-Za-z0-9]/g, '') + '-' + Math.round(t),
        hullId: hullId, name: route.name || (hull ? hull.name : 'her ship'),
        reg: contact.reg || null, bornId: 'npc|' + p.key,
        fit: {}, cargo: {},
        fuel: hull ? hull.fuelCap : 0, thrusterFuel: hull ? hull.thrusterCap : 0,
        hullHp: hull ? hull.hullMax : 0,
        port: route.to, portName: port ? port.name : null,
        star: G.here ? G.here.id : null, starName: G.here ? G.here.name : null,
        crew: [member], passengers: 0,
        berthTo: t, wagesTo: t, arrears: 0,
        partner: { key: p.key, memKey: mKey, name: p.name, values: p.values,
                   share: PARTNER_SHARE, since: t, earned: 0,
                   piracyAt: rs.piracy || 0, killsAt: rs.kills || 0 }
      };
      Fleet.add(G, rec);
    } else {
      member = Crew.make(p.name, roleFor(p), ratingFor(p), p.key);
      member.wageMul = FRIEND_WAGE; member.friendOf = p.key;
      (G.ship.crew = Crew.aboard(G.ship).slice()).push(member);
    }
    /* SHE LEAVES THE LANE. Either way her ship stops flying its old
     * timetable: as a partner it is in your fleet now, as crew her mate
     * takes it home. Saved in G.joined and reapplied whenever the system
     * is entered, because the timetable itself is regenerated from the
     * seed and does not know. */
    G.joined = G.joined || {};
    G.joined[p.key] = { mode: mode, star: G.here ? G.here.id : null, route: route.id,
                        at: t, fleetId: rec ? rec.id : null };
    route.suppressed = true; route.joined = true;
    sys._traffic = null; sys._ships = null;
    m.joined = mode; m.debt = 0;
    var who = p.title + ' ' + p.family;
    if (mode === 'partner') {
      say(who + ': "Partners, then. Half of what she earns is yours, half is mine, and she stays my ship. ' +
          'You will find the ' + rec.name + ' at ' + (rec.portName || 'her next port') + '."', 10);
    } else {
      say(who + ' hands the ' + (route.name || 'ship') + ' to her mate and comes aboard as your ' +
          Crew.ROLES[member.role].name.toLowerCase() + ' — ' + Crew.ratingWord(member.rating) +
          ', at a friend\'s wage.', 10);
    }
    return { ok: true, mode: mode, rec: rec, member: member };
  }

  /* Her half. Called by Missions.deliverByCarrier with what the contract
   * paid; returns what reaches your account. */
  function partnerCut(G, rec, pay) {
    if (!rec || !rec.partner || !(pay > 0)) return pay;
    var hers = Math.round(pay * (rec.partner.share || PARTNER_SHARE));
    rec.partner.earned = (rec.partner.earned || 0) + hers;
    return pay - hers;
  }

  /* SHE LEAVES IF YOU MISTREAT HER. Three ways, each said in her words:
   * you let her berth run into arrears; you turned on her yourself (her
   * feeling for you fell); or you became the thing she would not fly
   * beside — piracy for a lawful or abolitionist partner, killing for
   * anyone. A profit-first partner minds only the money. */
  function partnerGrievance(G, rec) {
    var C = Cap(), P = rec.partner, Fleet = global.Fleet;
    var m = C.memory(G, P.memKey || P.key, false);
    if (m && (m.feeling || 0) < 2) return 'You said we were partners. Partners do not do what you did to me.';
    var fee = Fleet && Fleet.berthFee ? Fleet.berthFee(rec) : 0;
    if ((rec.arrears || 0) > 0 && (rec.arrears || 0) >= 2 * Math.max(1, fee)) {
      return 'The harbour has been chasing me for your berth fees. I am done covering for you.';
    }
    var rs = C.recordOf(G, 'self');
    if ((rs.kills || 0) > (P.killsAt || 0)) return 'You killed a crew. I will not fly under the same name as that.';
    if (P.values !== 'profit' && P.values !== 'pirate' && (rs.piracy || 0) - (P.piracyAt || 0) >= 2) {
      return 'You robbed honest traders. That was never the business I signed up for.';
    }
    return null;
  }

  function partnerLeaves(G, sys, rec, why, t, hooks) {
    var C = Cap(), Fleet = global.Fleet, P = rec.partner;
    if (Fleet) Fleet.remove(G, rec.id);
    if (G.joined) delete G.joined[P.key];
    var m = C.memory(G, P.memKey || P.key, true);
    m.joined = null;
    m.feeling = clamp((m.feeling || 0) - 3, -C.DIAL, C.DIAL);
    C._logEntry(m, 'leftYou', t, null);
    if (sys && sys.traffic) {
      for (var i = 0; i < sys.traffic.length; i++) {
        var r = sys.traffic[i];
        if (C.keyOf(G, sys, { route: r }) === P.key) { r.suppressed = false; r.joined = false; }
      }
      sys._traffic = null; sys._ships = null;
    }
    if (hooks && hooks.say) {
      hooks.say(P.name + ' has taken the ' + rec.name + ' out of your fleet: "' + why + '"', 12);
    }
  }

  /* ---- the tick ---------------------------------------------------------------
   * From main.js, after Messages.update. Re-hides joined ships (the
   * timetable is regenerated with the system), then at most every
   * CHECK_EVERY seconds walks the board for a captain who owes you and has
   * news, or one you owe who wants it back. */
  var TIP_GAP = 1800;

  function applyJoined(G, sys) {
    if (!G.joined || !sys || !sys.traffic) return;
    var C = Cap(), changed = false;
    for (var k in G.joined) {
      var j = G.joined[k];
      if (j.star && sys.starId && j.star !== sys.starId) continue;
      for (var i = 0; i < sys.traffic.length; i++) {
        var r = sys.traffic[i];
        if (r.id !== j.route || r.joined) continue;
        if (C.keyOf(G, sys, { route: r }) !== k) continue;
        r.suppressed = true; r.joined = true; changed = true;
      }
    }
    if (changed) { sys._traffic = null; sys._ships = null; }
  }

  function update(sys, G, t, hooks) {
    var C = Cap();
    if (!C || !G || !sys) return;
    applyJoined(G, sys);
    var slot = Math.floor(t / CHECK_EVERY);
    if (G._favourSlot === slot) return;
    G._favourSlot = slot;
    function say(m, secs) { if (hooks && hooks.say) hooks.say(m, secs || 9); }

    /* Partners first — a grievance does not wait for her to be nearby. */
    var fl = G.fleet || [];
    for (var f = fl.length - 1; f >= 0; f--) {
      if (!fl[f].partner) continue;
      var why = partnerGrievance(G, fl[f]);
      if (why) partnerLeaves(G, sys, fl[f], why, t, hooks);
    }

    /* An ask that ran out is a no. */
    if (G.favourAsk && t >= G.favourAsk.until) {
      var a = G.favourAsk, ac = askContact(G, sys, a);
      G.favourAsk = null;
      if (ac && (!a.star || !G.here || a.star === G.here.id)) C.record(G, sys, ac, 'refused', t, null);
    }

    if (G.ship && G.ship.docked) return;
    var Sim = global.Sim, Combat = global.Combat;
    if (!Sim) return;
    var range = (Combat && Combat.HAIL_RANGE_KM) || 120;
    var list = Sim.shipsAll(sys, t), pirates = null;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s.pos || s.kind === 'pirate' || s.kind === 'fleet' || s.hostileToPlayer) continue;
      if (dist(s.pos, G.ship.pos) > range) continue;
      if (!C.hasCaptain(s)) continue;
      var key = C.keyOf(G, sys, s);
      var raw = G.captains && (G.captains[key] || null);
      if (!raw) continue;                         // a stranger owes you nothing
      var debt = debtOf(G, sys, s);
      if (debt > 0 && t - (G.tipAt || -Infinity) >= TIP_GAP) {
        /* REPAID UNASKED. A captain who owes you and sees a raider on
         * your lane tells you, and counts it. */
        if (pirates === null) pirates = nearestPirate(G, sys, t);
        if (pirates && pirates.km < 100000) {
          var p = C.profile(G, sys, s);
          G.tipAt = t;
          addDebt(G, sys, s, -1, t, null);
          C.record(G, sys, s, 'tipped', t, null);
          say(speaker(p, s) + 'Heads up — a raider, the ' + (pirates.ship.name || 'unmarked') + ', ' +
              fmtKm(pirates.km) + ' off you. Consider that one on me."', 10);
          return;
        }
      }
      if (debt < 0 && !G.favourAsk) {
        var ask = askFor(G, sys, s, debt, t);
        if (ask) {
          G.favourAsk = ask;
          say(ask.speaker + ', ' + ask.name + ': "' + askText(ask) + '" — answer on the comms page.', 10);
          return;
        }
      }
    }
  }

  var Favours = {
    addDebt: addDebt, debtOf: debtOf, afterRecord: afterRecord, died: died,
    applyHearsay: applyHearsay,
    favourOptions: favourOptions, callIn: callIn,
    answerAsk: answerAsk, askText: askText, askFor: askFor,
    recruitRefusal: recruitRefusal, recruit: recruit, roleFor: roleFor,
    partnerCut: partnerCut, partnerGrievance: partnerGrievance, partnerLeaves: partnerLeaves,
    applyJoined: applyJoined, update: update, profileByKey: profileByKey,
    DEBT_MAX: DEBT_MAX, FRIEND_SHARE: FRIEND_SHARE, MASS_RANGE: MASS_RANGE,
    PARTNER_SHARE: PARTNER_SHARE, FRIEND_WAGE: FRIEND_WAGE, ASK_LIFE: ASK_LIFE,
    CHECK_EVERY: CHECK_EVERY, TIP_GAP: TIP_GAP
  };

  /* Wire into captains.js, which calls these by name when present. */
  if (global.Captains) {
    global.Captains.addDebt = addDebt;
    global.Captains._afterRecord = afterRecord;
  }
  global.Favours = Favours;
  if (typeof module !== 'undefined' && module.exports) module.exports = Favours;
})(typeof window !== 'undefined' ? window : globalThis);
