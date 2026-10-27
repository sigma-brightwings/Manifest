/* captains.js — every ship out there has somebody in the chair.
 *
 * DESIGN-NOTES-CAPTAINS-RUMOURS-DISGUISE-v3, steps 1 and onward. The guiding
 * rule, Astra's: "you lead with your actions, not what you say you'll do."
 * Rumours shape a first impression; what a captain has SEEN with their own
 * eyes always overrides them. Names, transponders and claims can be faked.
 * What people have seen cannot.
 *
 * THREE LAYERS, and they are kept apart on purpose:
 *
 *   PROFILE  — who the captain is: name, temperament, values, home port,
 *              one friend and one rival. A pure function of the seed and
 *              the ship, regenerated on demand and never saved. Ten
 *              thousand captains cost nothing until one of them matters.
 *
 *   MEMORY   — what THIS captain thinks of YOU. Numbers, never text: two
 *              separate dials (honesty, feeling), a rumour-only opinion
 *              (heard), a count of first-hand encounters (seen), one most
 *              memorable event (tag), a favour balance (debt) and the hulls
 *              they have seen you in. Created lazily, the first time a
 *              captain actually deals with you — `G.captains`, saved.
 *
 *   RECORD   — what you have DONE, in public: `G.record`, counters the
 *              crime and rescue paths bump. It is what a captain who has
 *              never met you can go on, before rumours (step 5) give them
 *              something better.
 *
 * HONESTY AND FEELING ARE SEPARATE DIALS. Two numbers make four
 * relationships rather than a line: likes you but knows you lie; respects
 * your honesty but hates you; and the two obvious ones. One "reputation"
 * number would have flattened exactly the cases that make a captain feel
 * like a person.
 *
 * DOCTRINE 2. Every draw here comes from its own RNG built off
 * ('captain|' + seed + '|' + key) — nothing is taken from a stream any
 * existing generator was relying on, so adding captains changed no seed.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG;

  /* ---- names ---------------------------------------------------------------
   * Deliberately a mix with no single culture dominating, because the lanes
   * are where everybody ends up. Invented combinations — none of these is
   * meant to be anyone. */
  var GIVEN = [
    'Imre', 'Sabine', 'Tomasz', 'Adaeze', 'Kenji', 'Marisol', 'Oskar', 'Priya',
    'Dmitri', 'Yewande', 'Hollis', 'Ines', 'Rafael', 'Signe', 'Tariq', 'Wren',
    'Bram', 'Celeste', 'Joaquin', 'Linnea', 'Mattias', 'Noor', 'Oriel', 'Petra',
    'Quill', 'Rosalind', 'Soren', 'Talia', 'Ulric', 'Vesna', 'Wynn', 'Ximena',
    'Yusuf', 'Zora', 'Anouk', 'Bastian', 'Calla', 'Dorian', 'Esme', 'Farid',
    'Greer', 'Halvard', 'Ilse', 'Jory', 'Kasimir', 'Leilani', 'Mags', 'Nikolai'
  ];
  var FAMILY = [
    'Vasko', 'Okonkwo', 'Lindqvist', 'Haddad', 'Moreau', 'Takeda', 'Brennan',
    'Achterberg', 'Szabo', 'Quarshie', 'Delacroix-Ward', 'Ferreira', 'Halloran',
    'Ivanova', 'Jaramillo', 'Kowalczyk', 'Lachance', 'Mbeki', 'Nordahl', 'Oyelaran',
    'Petrakis', 'Rasmussen', 'Sandoval', 'Thorsen', 'Underhill', 'Varga',
    'Whitlock', 'Yilmaz', 'Zeller', 'Abernathy', 'Castellanos', 'Drummond',
    'Eriksen', 'Fairweather', 'Galloway', 'Hawthorne', 'Kettering', 'Mistry'
  ];

  /* ---- temperament and values ---------------------------------------------
   * TEMPER is how they talk; VALUES are what they care about. Values decide
   * who answers a distress call (step 3) and how the public record reads to
   * them; temper only colours the words. A wary captain who is glad to see
   * you still sounds wary — that is the point of having both. */
  var TEMPERS = ['wary', 'friendly', 'mercenary', 'principled', 'gruff'];
  var VALUES = ['abolitionist', 'profit', 'lawful', 'pirate'];

  /* Weights by what the ship IS. A trader's chair is a cross-section; a
   * cutter's is mostly the law; a pirate's is mostly not. Never a certainty
   * — a lawful pirate is rare, not impossible, and a cutter captain with a
   * price is exactly what the corruption system already says exists. */
  var VALUE_WEIGHTS = {
    trade:  { abolitionist: 3, profit: 5, lawful: 4, pirate: 1 },
    police: { abolitionist: 2, profit: 1, lawful: 8, pirate: 0.3 },
    navy:   { abolitionist: 2, profit: 0.5, lawful: 8, pirate: 0.2 },
    pirate: { abolitionist: 0.5, profit: 3, lawful: 0.2, pirate: 8 },
    other:  { abolitionist: 2, profit: 3, lawful: 3, pirate: 1 }
  };
  var TEMPER_WEIGHTS = {
    trade:  { wary: 3, friendly: 3, mercenary: 2, principled: 2, gruff: 2 },
    police: { wary: 2, friendly: 1, mercenary: 0.5, principled: 4, gruff: 3 },
    navy:   { wary: 2, friendly: 1, mercenary: 0.3, principled: 4, gruff: 3 },
    pirate: { wary: 2, friendly: 1, mercenary: 5, principled: 0.5, gruff: 3 },
    other:  { wary: 2, friendly: 2, mercenary: 2, principled: 2, gruff: 2 }
  };

  function weighted(rng, table) {
    var total = 0, k;
    for (k in table) total += table[k];
    var roll = rng.next() * total;
    for (k in table) { roll -= table[k]; if (roll <= 0) return k; }
    return k;
  }

  function roleOf(contact) {
    var k = (contact && (contact.kind || (contact.route && contact.route.kind))) || 'trade';
    if (k === 'pirate' || (contact && contact.outlaw)) return 'pirate';
    if (k === 'police') return 'police';
    if (k === 'navy' || k === 'capital') return 'navy';
    if (k === 'trade' || k === 'liner' || k === 'feeder' || k === 'heavy' ||
        k === 'shuttle' || k === 'runner') return 'trade';
    return 'other';
  }

  /* ---- identity --------------------------------------------------------------
   * A captain is keyed by star and ship. Route ids are per-system ('r0',
   * 'r1'...), so the star has to be in the key or every system's first
   * freighter would be the same person. */
  function starIdOf(G, sys) {
    return (sys && sys.starId) || (G && G.here && G.here.id) || 'here';
  }

  /* A trader you have pulled off its rails (Combat.liftTrader) becomes a
   * patrol-shaped spec with id 'r3-live' — but it is the SAME ship with the
   * same person in the chair, so it answers to its route's id. A live state
   * carries its spec; a spec carries the route it was lifted from.
   *
   * A PATROL IS ITS SPEC, NOT ITS LANE. Some patrols ride a traffic route's
   * own timetable (rail.type 'route'), so their live state carries that
   * route — the freighter's route. Keying a patrol by `contact.route` put
   * the cutter and the freighter it escorts in the same chair, and read the
   * cutter as a merchant. Anything with a spec (a live state carries one;
   * a bare spec has a `rail`) is identified by the spec; only a plain
   * timetabled trader is identified by its route. */
  function specOf(contact) {
    if (!contact) return null;
    return contact.spec || (contact.rail || contact.liftedFrom ? contact : null);
  }

  function shipIdOf(contact) {
    if (!contact) return null;
    var spec = specOf(contact);
    if (spec) return (spec.liftedFrom && spec.liftedFrom.id) || spec.id || null;
    if (contact.route && contact.route.id) return contact.route.id;
    return contact.id || contact.name || null;
  }

  function routeOf(contact) {
    if (!contact) return null;
    var spec = specOf(contact);
    if (spec) return spec.liftedFrom || null;
    return contact.route || null;
  }

  function keyOf(G, sys, contact) {
    var id = shipIdOf(contact);
    return id ? starIdOf(G, sys) + '/' + id : null;
  }

  /* Your own ships do not get a stranger in the chair — that is your hired
   * pilot, and Fleet already speaks for them. Nor does a contact with no
   * stable id: a captain who would be a different person next frame is
   * worse than no captain. */
  function hasCaptain(contact) {
    if (!contact) return false;
    var route = routeOf(contact);
    if (route && route.kind === 'fleet') return false;
    if (contact.kind === 'fleet' || contact.mine) return false;
    return !!shipIdOf(contact);
  }

  /* Every captain in a system, as a list of {key, contact-ish} — the pool a
   * friend and a rival are drawn from. Routes and patrols both, in their
   * stored order, which is itself a pure function of the seed. */
  function rosterOf(G, sys) {
    var out = [], i, sid = starIdOf(G, sys);
    var tr = (sys && sys.traffic) || [];
    for (i = 0; i < tr.length; i++) {
      if (tr[i].kind === 'fleet') continue;
      out.push({ key: sid + '/' + tr[i].id, ref: { route: tr[i], id: tr[i].id, name: tr[i].name,
                                                     kind: tr[i].kind || 'trade' } });
    }
    var pt = (sys && sys.patrols) || [];
    for (i = 0; i < pt.length; i++) {
      /* A lifted trader is already on the roster under its route. */
      if (!pt[i].id || pt[i].liftedFrom) continue;
      out.push({ key: sid + '/' + pt[i].id, ref: { id: pt[i].id, name: pt[i].name,
                                                     kind: pt[i].kind, faction: pt[i].faction } });
    }
    return out;
  }

  /* ---- the profile -----------------------------------------------------------
   * Pure. Memoised per (seed, key) only because the comms page asks every
   * frame; the cache is a convenience and is never saved. */
  var _profiles = {};

  function profile(G, sys, contact) {
    if (!hasCaptain(contact)) return null;
    var key = keyOf(G, sys, contact);
    var memo = (G && G.seed) + '|' + key;
    if (_profiles[memo]) return _profiles[memo];

    var rng = new RNG('captain|' + (G && G.seed) + '|' + key);
    /* Role off the route when there is a REAL one, so a lifted trader is
     * still a trader (its spec says 'trader', its route says what it
     * carries). A patrol never gets here with a route (see specOf), and a
     * route without a `from` is a stub, not a timetable. */
    var route = routeOf(contact);
    if (route && !route.from) route = null;
    var spec = specOf(contact) || contact;
    var role = roleOf(route ? { kind: route.kind || 'trade', outlaw: spec.outlaw } : spec);
    var given = rng.pick(GIVEN), family = rng.pick(FAMILY);
    var temper = weighted(rng, TEMPER_WEIGHTS[role]);
    var values = weighted(rng, VALUE_WEIGHTS[role]);

    /* Home port: a trader is based where its route starts, which is the
     * same rule ShipTrade.flagOf uses for its flag. A patrol is based in
     * the system it patrols. */
    var homeId = (route && route.from) || null;
    var home = (homeId && sys && sys.byId) ? sys.byId[homeId] : null;

    var faction = spec.faction || contact.faction || (route && route.flag) ||
                  (home && home.faction) || null;
    if (role === 'pirate') faction = faction || 'outlaw';

    /* One friend and one rival from the same system's roster, drawn from a
     * fork so the order captains are generated in cannot change who knows
     * whom. Never yourself; never the same person twice. */
    var roster = rosterOf(G, sys).filter(function (r) { return r.key !== key; });
    var friend = null, rival = null;
    if (roster.length) {
      var fr = rng.fork('ties');
      friend = roster[fr.int(0, roster.length - 1)].key;
      if (roster.length > 1) {
        var ri = fr.int(0, roster.length - 2);
        var pool = roster.filter(function (r) { return r.key !== friend; });
        rival = pool[ri].key;
      }
    }

    var p = {
      key: key,
      given: given, family: family,
      name: given + ' ' + family,
      title: role === 'navy' ? 'Commander' : role === 'police' ? 'Lieutenant'
           : role === 'pirate' ? 'Captain' : 'Captain',
      role: role, temper: temper, values: values,
      home: home ? home.id : null,
      homeName: home ? home.name : (sys && sys.name) || null,
      faction: faction,
      friend: friend, rival: rival
    };
    _profiles[memo] = p;
    return p;
  }

  /* ---- memory -----------------------------------------------------------------
   * Small clamped integers. The clamp is what keeps one terrible afternoon
   * from being unforgivable and a dozen polite hails from buying a saint. */
  var DIAL = 10;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function memory(G, key, create) {
    if (!key) return null;
    G.captains = G.captains || {};
    var m = G.captains[key];
    if (!m && create) {
      m = G.captains[key] = { honesty: 0, feeling: 0, heard: 0, seen: 0,
                              tag: null, tagAt: null, debt: 0, hulls: [], met: null };
    }
    return m || null;
  }

  /* THE MOST MEMORABLE THING, ranked. A new event replaces the stored one
   * only if it ranks at least as high — so dialogue can say "last time you
   * lied to me about your hold" and mean the worst (or best) thing, not
   * merely the latest. Positive and negative share one ladder because a
   * captain remembers whichever was BIGGER, not whichever was nicer. */
  var TAGS = {
    EXPLOITED_COMPASSION: { rank: 10, good: false },
    ATTACKED_ME:          { rank: 9,  good: false },
    SAVED_MY_SHIP:        { rank: 9,  good: true },
    ROBBED_ME:            { rank: 8,  good: false },
    ANSWERED_MY_DISTRESS: { rank: 7,  good: true },
    CAUGHT_IN_DISGUISE:   { rank: 6,  good: false },
    LIED_ABOUT_CARGO:     { rank: 5,  good: false },
    IGNORED_MY_DISTRESS:  { rank: 4,  good: false },
    KEPT_YOUR_WORD:       { rank: 3,  good: true },
    TRADED_FAIRLY:        { rank: 1,  good: true }
  };

  /* What each kind of act does to the dials. Seen-ness is the point: every
   * one of these is something the captain was THERE for. */
  var EVENTS = {
    attacked: { feeling: -5, tag: 'ATTACKED_ME' },
    robbed:   { feeling: -6, tag: 'ROBBED_ME' },
    killedFriend: { feeling: -4 },
    rescued:  { feeling: 6, tag: 'SAVED_MY_SHIP' },
    answered: { feeling: 4, tag: 'ANSWERED_MY_DISTRESS' },
    ignored:  { feeling: -2, tag: 'IGNORED_MY_DISTRESS' },
    traded:   { feeling: 1, honesty: 1, tag: 'TRADED_FAIRLY' },
    lied:     { feeling: -2, honesty: -3, tag: 'LIED_ABOUT_CARGO' },
    exploited:{ feeling: -7, honesty: -5, tag: 'EXPLOITED_COMPASSION' },
    honest:   { honesty: 1 },
    /* Came to your call and you were not there. Not a lie — a waste. */
    wasted:   { feeling: -1 },
    /* You said something to them. No dial moves; the words are kept, so
     * they can be said back to you. */
    told:     {},
    disguise: { feeling: -2, honesty: -3, tag: 'CAUGHT_IN_DISGUISE' },
    /* Step 4 — favours (favours.js). Doing her a favour she asked for
     * when you owed her; saying no; her paying you back. */
    repaid:   { feeling: 1, tag: 'KEPT_YOUR_WORD' },
    refused:  { feeling: -2 },
    tipped:   {},
    favour:   {}
  };

  /* The same act reported twice in one breath is one act. crime() is called
   * per hit for an assault, and a burst of fire is not six separate
   * grievances. */
  var REPEAT_WINDOW = 120;   // s

  function record(G, sys, contact, kind, t, opts) {
    var ev = EVENTS[kind];
    if (!ev || !hasCaptain(contact)) return null;
    /* WHICH YOU did it. In honest colours, or in a disguise they saw
     * through, it lands on the captain's memory of the real you. In a
     * disguise they did not see through, it lands on that persona — and
     * stays there, so robbing someone as the "Halcyon Tern" does not teach
     * them to hate the real Brightwing. See resolve(). */
    var r = resolve(G, sys, contact);
    if (r.through && kind !== 'disguise') {
      /* Seeing through the paint is itself a seen lie, recorded first and
       * once; the act then goes on the real you. */
      record(G, sys, contact, 'disguise', t, null);
      r = resolve(G, sys, contact);
    }
    var key = r.key;
    var m = memory(G, key, true);
    if (kind === 'disguise') {
      m.caught = m.caught || [];
      var idk = identity(G).key;
      if (m.caught.indexOf(idk) >= 0) return m;
      m.caught.push(idk);
    }
    if (m.lastKind === kind && t - (m.lastAt || -Infinity) < REPEAT_WINDOW) return m;
    m.lastKind = kind; m.lastAt = t;
    if (m.met == null) m.met = t;
    /* SEEN means seen you ACT — something that moved how they feel. Being
     * told something, or finding you were straight about it, moves only
     * honesty; it is kept (the words are in the log) but it does not
     * replace everything they have heard about you with one chat. */
    if (ev.feeling) m.seen = (m.seen || 0) + 1;
    if (ev.honesty) m.honesty = clamp((m.honesty || 0) + ev.honesty, -DIAL, DIAL);
    if (ev.feeling) m.feeling = clamp((m.feeling || 0) + ev.feeling, -DIAL, DIAL);
    if (ev.tag) {
      var cur = m.tag && TAGS[m.tag];
      if (!cur || TAGS[ev.tag].rank >= cur.rank) { m.tag = ev.tag; m.tagAt = t; }
    }
    /* Which hull they saw it done from — the disguise system (step 2)
     * reads this to decide whether a new paint job fools them. */
    var hull = (opts && opts.hull) || hullIdOf(G);
    if (hull && m.hulls.indexOf(hull) < 0) {
      m.hulls.push(hull);
      if (m.hulls.length > 4) m.hulls.shift();
    }
    /* AND WHAT HAPPENED, IN A FORM THEY CAN TALK ABOUT. The dials say how
     * they feel; the log says why, specifically enough to say it back —
     * what was at stake, and your own words when you used any. See
     * RECALL below. `opts.log` names the entry when the act's dial event
     * is not the story (an honest call they answered is "came for you",
     * not "honest"). */
    logEntry(m, (opts && opts.log) || kind, t, opts);
    if (global.Captains && global.Captains._afterRecord) {
      global.Captains._afterRecord(G, sys, contact, kind, t, m, key);
    }
    return m;
  }

  /* The physical hull, as distinct from what it is called. `bornId` is
   * stamped once when a ship is built and survives renaming and
   * re-registration — which is exactly what a captain recognising a hull
   * under new paint should key on. Falls back to the hull type. */
  function hullIdOf(G) {
    var s = (G && G.ship) || {};
    return s.bornId || s.hullId || null;
  }

  /* ---- identity, and disguise (step 2, design section 7) ------------------
   * What a ship SAYS it is: a name, a transponder code, and fleet markings.
   * Rumours and the public record attach to this, not to the pilot — so a
   * fresh identity can shake a bad name. What captains have SEEN attaches
   * to the hull, which is why a fresh identity does not always work.
   *
   * HONEST CHANGES ARE NOT DISGUISES. Renaming your ship and re-registering
   * it are both legal (screens.js editIdentity), and the registry links old
   * to new — so they do not shed anything. Your honest identity is keyed
   * 'self' however many times you rename it. Only a refit at a yard where
   * somebody can be bought (corruption >= 60, the grey market's own line)
   * broadcasts a spoofed transponder, and only that starts a clean sheet.
   */
  var SHADY_CORRUPTION = 60;
  var REFITS = {
    /* A new name, new paint, unmarked or false colours — and the same
     * plating every captain who has seen you up close will recognise. */
    paint: { id: 'paint', price: 1800, label: 'new name and paint',
             note: 'cheap, and the hull underneath is still yours' },
    /* Everything: spoofed transponder, re-plated, the silhouette broken up.
     * Much harder to see through; never impossible. */
    full:  { id: 'full', price: 6500, label: 'full refit, spoofed transponder',
             note: 're-plated; hard to recognise' }
  };
  var RESTORE_PRICE = 400;

  var FAKE_FIRST = ['Ardent', 'Coldwater', 'Fenwick', 'Halcyon', 'Ironwake', 'Juno', 'Meridian',
                    'Northstar', 'Pallas', 'Quietus', 'Rook', 'Saltmarsh', 'Tamsin', 'Vigil'];
  var FAKE_SECOND = ['Carrier', 'Runner', 'Drover', 'Packet', 'Barge', 'Clipper', 'Lark',
                     'Wanderer', 'Tern', 'Mule', 'Heron', 'Gannet', 'Skiff', 'Courier'];
  var REG_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

  /* Your own fleet's markings: a bicolour and a three-letter code, both a
   * pure function of the seed, so a career always flies the same colours.
   * Faction fleets fly a tricolour off their chart colour. The scheme is
   * the design doc's open question — this is a first answer, and nothing
   * draws it on a hull yet. */
  function companyFleet(G) {
    var h = RNG.hashString('company|' + (G && G.seed));
    var code = REG_LETTERS[h % 23] + REG_LETTERS[Math.floor(h / 23) % 23] +
               REG_LETTERS[Math.floor(h / 529) % 23];
    return { kind: 'company', code: code,
             name: (G && G.pilotName ? G.pilotName + "'s" : 'independent') + ' fleet',
             colours: [hsl(h % 360, 55, 45), hsl((h >> 9) % 360, 40, 80)] };
  }

  function factionFleet(G, sys, facId) {
    var fac = (G && G.galaxy && G.galaxy.factionById && G.galaxy.factionById[facId]) ||
              (sys && sys.factionById && sys.factionById[facId]) || null;
    if (!fac) return null;
    var h = RNG.hashString('fleet|' + facId);
    return { kind: 'faction', faction: facId, code: String(facId).slice(0, 3).toUpperCase(),
             name: (fac.name || facId) + ' fleet',
             colours: [fac.color || '#cccccc', '#f2f2f2', hsl(h % 360, 60, 35)] };
  }

  function hsl(hh, s, l) { return 'hsl(' + hh + ',' + s + '%,' + l + '%)'; }

  function identity(G) {
    var s = (G && G.ship) || {};
    var d = s.disguise;
    if (d && d.transponder) {
      return { key: 'x:' + d.transponder, name: d.name, transponder: d.transponder,
               fleet: d.fleet || null, disguised: true, extent: d.extent, n: d.n };
    }
    return { key: 'self', name: s.shipName || null, transponder: s.reg || null,
             fleet: companyFleet(G), disguised: false };
  }

  /* Can THIS yard do it, and if not, why — in words (doctrine 5). */
  function refitRefusal(G, sys, port, extent) {
    var R = REFITS[extent];
    var s = (G && G.ship) || {};
    if (!R) return 'no such refit';
    if (!port || s.docked !== port.id) return 'only on the clamps';
    var Combat = global.Combat;
    var corr = (Combat && Combat.systemCorruption) ? Combat.systemCorruption(G, sys) : 0;
    if (corr < SHADY_CORRUPTION) return 'nobody here will touch a transponder — try somewhere bought';
    if ((s.credits || 0) < R.price) return R.price + ' cr — short by ' + (R.price - (s.credits || 0));
    return null;
  }

  function refit(G, sys, port, extent, opts) {
    var why = refitRefusal(G, sys, port, extent);
    if (why) return { ok: false, why: why };
    var s = G.ship, R = REFITS[extent];
    var n = (s.disguiseCount || 0) + 1;
    var h = RNG.hashString('disguise|' + G.seed + '|' + hullIdOf(G) + '|' + n);
    var name = FAKE_FIRST[h % FAKE_FIRST.length] + ' ' +
               FAKE_SECOND[Math.floor(h / 97) % FAKE_SECOND.length];
    var Sim = global.Sim;
    var tp = (Sim && Sim.regCode) ? Sim.regCode('spoof|' + G.seed + '|' + n + '|' + hullIdOf(G))
                                  : 'ZZ-' + ('000' + (h % 10000)).slice(-4);
    /* Fleet markings: none by default — an unmarked hull is the ordinary
     * thing a spoofed one wears. Claiming a faction's colours is a choice. */
    var fleet = (opts && opts.claim) ? factionFleet(G, sys, opts.claim) : null;
    s.credits -= R.price;
    s.disguiseCount = n;
    s.disguise = { name: name, transponder: tp, fleet: fleet, extent: R.id, n: n, at: G.t };
    return { ok: true, ident: identity(G), price: R.price };
  }

  function restoreIdentity(G, port) {
    var s = (G && G.ship) || {};
    if (!s.disguise) return { ok: false, why: 'you are flying your own colours' };
    if (!port || s.docked !== port.id) return { ok: false, why: 'only on the clamps' };
    if ((s.credits || 0) < RESTORE_PRICE) return { ok: false, why: RESTORE_PRICE + ' cr — you are short' };
    s.credits -= RESTORE_PRICE;
    s.disguise = null;
    return { ok: true, ident: identity(G), price: RESTORE_PRICE };
  }

  /* DOES THIS CAPTAIN KNOW IT IS YOU? Three answers:
   *
   *   - they have seen you under THIS identity before: yes, plainly;
   *   - you are flying honest colours: yes — a legal rename is linked in
   *     the registry, and they knew the hull anyway;
   *   - you are disguised and they have seen THIS HULL: maybe. The odds
   *     grow with how often they have seen it and shrink a lot with a full
   *     refit. Decided by hash of (captain, disguise), so it is one answer
   *     per disguise — hailing twice does not reroll whether you got away
   *     with it.
   *
   * `through` marks the third case going against you: they saw through it,
   * and being caught in disguise is a SEEN lie. */
  function recognitionChance(self, id) {
    return Math.min(0.95, 0.35 + 0.2 * Math.min((self && self.seen) || 0, 3)) *
           (id.extent === 'full' ? 0.35 : 1);
  }

  /* WHICH MEMORY APPLIES. A captain holds one memory of the real you
   * (G.captains[captainKey]) and, for each disguise that fooled them, one
   * of that persona (G.captains[captainKey + '#' + identityKey]). The
   * persona is a stranger they met; the real you is who they know. */
  function resolve(G, sys, contact) {
    var ck = keyOf(G, sys, contact);
    var id = identity(G);
    var self = memory(G, ck, false);
    if (!id.disguised) return { key: ck, m: self, id: id, through: false };
    /* Caught you in this paint once already: they know, plainly. */
    if (self && (self.caught || []).indexOf(id.key) >= 0) {
      return { key: ck, m: self, id: id, through: false, caught: true };
    }
    /* Met this face and were fooled by it: the persona, consistently. One
     * answer per disguise — hailing twice does not reroll whether you got
     * away with it. */
    var pk = ck + '#' + id.key;
    var persona = memory(G, pk, false);
    /* `fooled` means: they DO know the real you, and do not know this is
     * you. That is the disguise working, and it is what a test (or a
     * future tell on the comms page) asks. */
    var knowsReal = !!(self && self.seen > 0);
    if (persona) return { key: pk, m: persona, id: id, through: false, fooled: knowsReal };
    /* Never seen this face. Have they seen the HULL? */
    var hull = hullIdOf(G);
    if (self && hull && (self.hulls || []).indexOf(hull) >= 0) {
      var p = recognitionChance(self, id);
      var u = RNG.hashString('recog|' + ck + '|' + id.key) / 4294967296;
      if (u < p) return { key: ck, m: self, id: id, through: true, chance: p };
      return { key: pk, m: null, id: id, through: false, chance: p, fooled: knowsReal };
    }
    return { key: pk, m: null, id: id, through: false, fooled: knowsReal };
  }

  /* A hail is contact, not an act: it makes the record exist (so the
   * captain is now someone the save remembers) without moving a dial —
   * unless they look at you and see through your paint, which is an act:
   * yours, and they saw it. */
  function noteMet(G, sys, contact, t) {
    if (!hasCaptain(contact)) return null;
    var r = resolve(G, sys, contact);
    if (r.through) return record(G, sys, contact, 'disguise', t);
    var m = memory(G, r.key, true);
    if (m.met == null) m.met = t;
    return m;
  }

  /* ---- the public record -----------------------------------------------------
   * What you have done that people talk about. Counts, not a log: the
   * question a captain who has never met you is asking is "what sort", not
   * "what exactly". */
  /* KEYED BY IDENTITY. `G.record.self` is the real you, however often you
   * have legally renamed; `G.record['x:AB-1234']` is a disguise. Acts done
   * in a disguise go on its sheet, and a fresh disguise starts clean —
   * which is the whole of what a spoofed transponder buys. */
  function recordOf(G, idKey) {
    var all = (G && G.record) || {};
    return all[idKey || identity(G).key] || {};
  }

  /* `src` — { sys, ship, t } — is who SAW it (rumours.js, step 5). The
   * count is the truth; the rumour is what strangers get to hear of it,
   * starting aboard that ship and travelling at the speed of ships. */
  function bumpRecord(G, field, n, src) {
    var k = identity(G).key;
    G.record = G.record || {};
    var r = G.record[k] || (G.record[k] = { piracy: 0, kills: 0, pirateKills: 0, rescues: 0 });
    r[field] = (r[field] || 0) + (n == null ? 1 : n);
    if (src && global.Rumours && G.rumours) {
      global.Rumours.spawn(G, src.sys, field, src.ship, src.t, { n: n == null ? 1 : n });
    }
    return r[field];
  }

  /* What a stranger has to go on. With rumours (step 5): what has reached
   * her ship by now. Without (the node tests that predate it, or a career
   * saved before rumours existed): the public record, as before. */
  function heardRecord(G, sys, contact, idKey) {
    var R = global.Rumours;
    if (R && G.rumours) {
      var tl = R.tally(G, sys, contact, G.t || 0, idKey);
      /* A career from before rumours keeps what it had done by then
       * known everywhere (save.js recordLegacy). */
      var leg = G.recordLegacy && G.recordLegacy[idKey];
      if (leg) for (var f in leg) tl.counts[f] = (tl.counts[f] || 0) + (leg[f] || 0);
      return { rec: tl.counts, top: tl.top };
    }
    return { rec: recordOf(G, idKey), top: {} };
  }

  /* WHAT THEY MAKE OF YOU, from what they have to go on: their own memory
   * of you (`m`, when they have seen you act) or else what they have heard
   * (`rec`, counts in the shape of the public record, and `top`, the
   * loudest rumour per field) read through their values and coloured by
   * their temper. Split out of `opinion` (2026-10-25) so the people you
   * meet on foot (dialogue.js) judge you by exactly the rules a captain on
   * the band does. `p` needs { values, temper, faction }. */
  function judge(G, p, m, rec, top) {
    var score, reasons = [];
    rec = rec || {}; top = top || {};
    /* A FRIEND'S WORD (favours.js) sits on `heard`. It nudges a captain
     * who has seen you herself — a third, because her own eyes come
     * first — and counts in full for one who has not, above the public
     * record, because it came from somebody she trusts. */
    var heard = (m && m.heard) || 0;
    if (m && m.seen > 0) {
      score = m.feeling + heard / 3;
      if (m.tag) reasons.push({ kind: 'tag', tag: m.tag, w: 10 });
      return done();
    }

    /* Never met. Read the record through their values: the same career is
     * a menace to a lawful captain and a reference to a pirate. */
    var piracy = (rec.piracy || 0), kills = (rec.kills || 0), rescues = (rec.rescues || 0);
    var pk = (rec.pirateKills || 0), tender = (G.tenderKills || 0);
    /* The same test the police use, so a captain cannot call you wanted
     * where the law would not — or let it slide where the law would act. */
    var Combat = global.Combat;
    var wantedHere = !!(p.faction && Combat && Combat.wantedHere && Combat.wantedHere(G, p.faction));
    var standing = (p.faction && G.standing) ? (G.standing[p.faction] || 0) : 0;
    var outlawStanding = (G.standing && G.standing.outlaw) || 0;
    score = 0;

    var crimeTop = (top.kills && (!top.piracy || top.kills.w * 1.5 >= top.piracy.w * 0.8))
      ? top.kills : top.piracy;
    var lies = (rec.lies || 0), cruel = (rec.cruelLies || 0);
    if (p.values === 'pirate') {
      add(Math.min(5, piracy * 0.8 + kills * 0.5), 'piracy_admired', crimeTop);
      add(-Math.min(4, pk * 0.8), 'pirate_hunter', top.pirateKills);
      add(Math.max(-2, Math.min(3, outlawStanding / 25)), 'syndicate');
      if (wantedHere) add(1, 'wanted_admired');
    } else {
      /* MEASURED, NOT GUESSED (doctrine 6). The first weights here put
       * every non-pirate trader at "furious" for five robberies and every
       * one at "glad" for four rescues — two bands for 3,600 captains, so
       * values decided nothing. These spread it: a lawful captain is
       * furious, an abolitionist angry, a profit-first trader merely cold
       * about the same career, because to them it is a cost of doing
       * business. test/captains.test.js prints the distribution. */
      var crimeWeight = p.values === 'lawful' ? 1.4 : p.values === 'abolitionist' ? 1.15 : 0.45;
      add(-Math.min(8, (piracy * 0.8 + kills * 1.5) * crimeWeight), 'piracy', crimeTop);
      if (tender > 0) add(-6, 'tender');
      add(Math.min(6, rescues * (p.values === 'profit' ? 0.6 : 1.2)), 'rescues', top.rescues);
      add(Math.min(3, pk * (p.values === 'lawful' ? 0.8 : 0.5)), 'pirate_hunter', top.pirateKills);
      /* A liar on the band, and worse, one who cried for help as bait —
       * the lie-weighting of section 5, read by people who were not there. */
      add(-Math.min(5, (lies * 0.6 + cruel * 1.8) * (p.values === 'profit' ? 0.5 : 1)), 'lies',
          (cruel && top.cruelLies) ? top.cruelLies : top.lies);
      if (wantedHere) add(p.values === 'profit' ? -1.5 : -4, 'wanted');
    }
    add(Math.max(-3, Math.min(3, standing / 20)), standing >= 0 ? 'standing_good' : 'standing_bad');
    if (heard) add(heard * 1.5, heard < 0 ? 'heard_bad' : 'heard_good');
    /* And temper leans on all of it a little. Too little to move a stranger
     * with no record off neutral (|0.7| < 1), enough that the same record
     * lands a step apart in a friendly chair and a wary one. Not a reason —
     * nobody greets you coldly "because I am wary". */
    score += p.temper === 'friendly' ? 0.7 : p.temper === 'wary' ? -0.7
           : p.temper === 'gruff' ? -0.3 : 0;
    return done();

    function add(v, why, rumour) {
      if (!v) return;
      score += v;
      reasons.push({ kind: why, w: Math.abs(v), v: v, rumour: rumour || null });
    }
    function done() { return { score: score, reasons: reasons }; }
  }

  /* ---- what they think of you, all told -----------------------------------
   * One number for the greeting, plus WHY — the doctrine that refusals carry
   * reasons applies to a cold shoulder too. A captain who greets you with
   * contempt and never says what for would read as a bug.
   *
   * SEEN BEATS HEARD. If the captain has first-hand experience of you, their
   * own feeling is the whole answer and your reputation is background. Only
   * a captain who has never seen you act falls back on the public record
   * (and, later, rumours). */
  function opinion(G, sys, contact) {
    var p = profile(G, sys, contact);
    if (!p) return null;
    /* A friend's word that has reached her ship by now (rumours.js) lands
     * before she is asked, so the answer is as of this moment. */
    if (global.Rumours && G.hearsay && G.hearsay.length) global.Rumours.settle(G, sys, G.t || 0, p.key);
    /* Which you they are looking at (see resolve): the real one, a
     * disguise they saw through, or a stranger in paint they believe. */
    var rv = resolve(G, sys, contact);
    var m = rv.m;
    var hr = heardRecord(G, sys, contact, rv.id.key);
    var rec = hr.rec, top = hr.top;
    var reasons = [];
    var score;
    /* Seen through the paint but not yet told so: the greeting is about
     * exactly that. noteMet records it; this lets the line say it on the
     * same hail rather than the next one. */
    if (rv.through && m) {
      score = Math.min(m.feeling || 0, 0) + EVENTS.disguise.feeling;
      reasons.push({ kind: 'tag', tag: 'CAUGHT_IN_DISGUISE', w: 10 });
      return finish();
    }

    var j = judge(G, p, m, rec, top);
    score = j.score;
    reasons = j.reasons;
    return finish();

    function finish() {
      reasons.sort(function (a, b) { return b.w - a.w; });
      return { score: score, profile: p, memory: m || null,
               firstHand: !!(m && m.seen > 0), identity: rv.id,
               through: !!rv.through, fooled: !!rv.fooled,
               honesty: m ? m.honesty : 0,
               reason: reasons[0] || null, band: bandOf(score, m) };
    }
  }

  /* Seven steps from furious to grateful. GRATEFUL is not just a high
   * number: it is reserved for a captain who remembers you doing something
   * FOR them, because gratitude is about a debt, not a mood. A captain who
   * merely thinks well of your record is glad, at most. */
  var BANDS = ['furious', 'angry', 'cold', 'neutral', 'warm', 'glad', 'grateful'];
  function bandOf(score, m) {
    if (score <= -7) return 'furious';
    if (score <= -3) return 'angry';
    if (score <= -1) return 'cold';
    if (score < 1) return 'neutral';
    if (score < 3) return 'warm';
    if (score >= 5 && m && m.tag && TAGS[m.tag] && TAGS[m.tag].good &&
        (m.tag === 'SAVED_MY_SHIP' || m.tag === 'ANSWERED_MY_DISTRESS')) return 'grateful';
    return 'glad';
  }

  /* ---- RECALL: what they remember, in their own words -----------------------
   * Astra: "it doesn't need to write detailed stories, just to say 'last
   * time I responded to your call, you were lying' or 'you saved my cargo
   * and my crew, not to mention my ship. Looking for another fleetmate? We
   * could go into business together.'" And: "respond accordingly, without
   * the phrases repeating."
   *
   * THE LOG. Each memory keeps a short list of what happened — the kind of
   * act, when, what was at stake (ship, crew, cargo, passengers) and, when
   * you said something, your own words, clipped. It is what a line is
   * built FROM, so a captain can only ever talk about something that
   * actually happened between you. Capped; when it is full the least
   * memorable, oldest entry goes.
   *
   * THE LINE. A salutation, the recollection, and a closing — each with
   * several shapes, coloured by band and temper. Three short lists
   * multiply into dozens of distinct lines per memory.
   *
   * NO REPEATS. Every line a captain actually says to you is remembered
   * (as a hash, `said`), and the builder walks the combinations in a
   * seeded order until it finds one they have not used on you. A captain
   * who has run out of new ways to say it starts over from the least
   * recent, rather than falling silent. */
  var LOG_MAX = 8;
  var SAID_MAX = 48;
  var LOG_RANK = {
    exploited: 10, attacked: 9, rescued: 9, robbed: 8, answered: 7, disguise: 6,
    liedCall: 6, lied: 5, cameForYou: 5, killedFriend: 7, wasted: 3, warned: 3,
    told: 2, traded: 1, ignored: 4,
    /* step 4 — favours.js */
    friendTold: 6, friendSaved: 5, rivalHelped: 3, rivalHurt: 3,
    /* A refusal ranks above the help that earned the ask: ingratitude is
     * what she will bring up, not the rescue that came before it. */
    repaid: 4, refused: 6, tipped: 2, favour: 2, leftYou: 8
  };

  function clipQuote(q) {
    q = String(q || '').replace(/\s+/g, ' ').trim();
    if (q.length <= 64) return q;
    var cut = q.slice(0, 62);
    var sp = cut.lastIndexOf(' ');
    return (sp > 30 ? cut.slice(0, sp) : cut) + '…';
  }

  function logEntry(m, k, t, opts) {
    if (!LOG_RANK[k]) return;
    m.log = m.log || [];
    var e = { k: k, t: t };
    if (opts && opts.q) e.q = clipQuote(opts.q);
    if (opts && opts.stakes && opts.stakes.length) e.st = opts.stakes.slice(0, 4);
    if (opts && opts.f) e.f = String(opts.f);
    m.log.push(e);
    while (m.log.length > LOG_MAX) {
      var worst = 0;
      for (var i = 1; i < m.log.length; i++) {
        var a = m.log[i], b = m.log[worst];
        if ((LOG_RANK[a.k] || 0) < (LOG_RANK[b.k] || 0) ||
            ((LOG_RANK[a.k] || 0) === (LOG_RANK[b.k] || 0) && a.t < b.t)) worst = i;
      }
      m.log.splice(worst, 1);
    }
  }

  /* What a log entry is about, by the most memorable thing in it. */
  function salientEntry(m) {
    var log = (m && m.log) || [];
    var best = null;
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      if (!best || (LOG_RANK[e.k] || 0) > (LOG_RANK[best.k] || 0) ||
          ((LOG_RANK[e.k] || 0) === (LOG_RANK[best.k] || 0) && e.t > best.t)) best = e;
    }
    return best;
  }

  /* "my cargo and my crew, not to mention my ship" — the stakes, said
   * three ways, with the ship last because it is the biggest thing. */
  var STAKE_WORD = { ship: 'ship', crew: 'crew', cargo: 'cargo', passengers: 'passengers' };
  function stakesPhrase(st, variant) {
    st = (st && st.length) ? st.slice() : ['ship'];
    var hasShip = st.indexOf('ship') >= 0;
    var rest = st.filter(function (s) { return s !== 'ship'; }).map(function (s) { return 'my ' + STAKE_WORD[s]; });
    if (!rest.length) return variant % 2 ? 'my ship' : 'my ship and everyone on her';
    var list = rest.length === 1 ? rest[0] : rest.slice(0, -1).join(', ') + ' and ' + rest[rest.length - 1];
    if (!hasShip) return list;
    switch (variant % 3) {
      case 0: return list + ', not to mention my ship';
      case 1: return 'my ship, ' + list.replace(' and ', ' and ');
      default: return list + ' — and the ship under them';
    }
  }

  function whenPhrase(dt) {
    if (dt < 86400) return 'earlier today';
    if (dt < 7 * 86400) return 'a few days back';
    if (dt < 40 * 86400) return 'a few weeks ago';
    return 'a while back';
  }

  /* The recollections. {q} is your own words; {stakes} what was saved;
   * {when} how long ago. A template that needs a {q} is only used when
   * the entry has one. */
  var RECALL = {
    exploited: ['You cried "{q}" and it was a trap.',
                'Last time I answered your call, nobody was dying. You were lying.',
                'You used people in trouble as bait to drag me out there.',
                'I came running when you said "{q}". There was nobody to save.',
                'You lied about lives on the line, {when}. I do not forget that kind of thing.'],
    liedCall:  ['Last time I responded to your call, you were lying.',
                'You said "{q}". I came. None of it was true.',
                'I flew out to answer you {when}, and found a liar.',
                'The last mayday I heard from you was a lie.'],
    lied:      ['You told me "{q}". It was a lie.',
                'Last time we spoke, you lied to me.',
                'I read your hold {when}. It did not match a word you said.',
                'I remember the last thing you told me, and that it was not true.'],
    attacked:  ['You put holes in my hull {when}.',
                'Last time we met, you were shooting at me.',
                'My crew still talks about the day you opened fire on us.',
                'I have not forgotten your guns.'],
    robbed:    ['You stripped my hold at gunpoint {when}.',
                'Last time we met, you took my cargo at gunpoint.',
                'You robbed me. I remember every crate.',
                'The last time I saw your ship, my hold was going out the airlock.'],
    rescued:   ['You saved {stakes}.',
                'If you had not come, I would have lost {stakes}.',
                'I owe you {stakes}.',
                'You pulled us out of the dark {when}. {Stakes}, all of it, because of you.'],
    answered:  ['You answered when I called for help.',
                'You came when I called {when}. Not everyone does.',
                'I called and you came. I remember that.'],
    cameForYou:['Last time you called for help, I came. Glad you made it.',
                'I pulled you out of trouble once already.',
                'You were drifting last time I saw you. Better day today?'],
    disguise:  ['You came to me under another name. I knew the hull.',
                'New paint, same hull. I saw through you {when}.',
                'Last time you tried to tell me you were someone else.'],
    wasted:    ['Last time you called, I came and you were gone.',
                'I flew out to your mayday {when} and found empty space.'],
    warned:    ['Your warning about "{q}" was good. Thank you.',
                'You warned me {when}, and you were right.'],
    told:      ['Last time you told me "{q}".',
                'I remember what you said: "{q}".'],
    traded:    ['You dealt fairly with me last time.',
                'Last time we traded, you were straight with me.'],
    ignored:   ['You flew right past when I was calling for help.',
                'I called for help {when}. You heard it, and you kept going.'],
    killedFriend: ['You killed a friend of mine.',
                   'I knew the crew you killed.',
                   'You killed {f}. {f} was my friend.',
                   '{f} is dead, and I know whose guns did it.'],
    /* step 4 — what their friends and rivals told them (favours.js) */
    friendTold:  ['{f} is a friend of mine. I heard what you did.',
                  'Word from {f} reached me. I know what you are.',
                  '{f} told me all about you.',
                  'You crossed {f}. That means you crossed me.'],
    friendSaved: ['You pulled {f} out of trouble. {f} is a friend of mine.',
                  'I owe you for {f}.',
                  '{f} speaks well of you, and {f} does not say that lightly.',
                  'Any friend of {f} is welcome on my channel.'],
    rivalHelped: ['I hear you helped {f}. Interesting choice of friends.',
                  'So you are the one who bailed out {f}.',
                  'You keep company with {f}. I will remember that.'],
    rivalHurt:   ['I hear you gave {f} a hard time. I cannot say I am sorry.',
                  'Whatever you did to {f}, it was overdue.'],
    repaid:      ['You came through when I asked. We are square.',
                  'I asked you a favour and you did not hesitate.',
                  'I needed a hand {when} and you gave it.'],
    refused:     ['I asked you for one favour. You said no.',
                  'I came when you called. Then I asked for one thing back.',
                  'Last time I needed a hand, you turned me down.',
                  'I remember asking you for help {when}. I remember the answer.'],
    tipped:      ['I hope that warning helped.',
                  'Still in one piece after that tip-off?'],
    favour:      ['I did you that favour. Hope it was worth it.',
                  'You called in a favour {when}. Glad to help.'],
    leftYou:     ['You said we were partners.',
                  'I took my ship back because of what you did.',
                  'We were in business once. Then you showed me who you are.']
  };

  var SALUTE = {
    grateful: ['{you}!', '{you}! It is you!', 'Well, look who it is. {you}!', 'Is that the {you}?'],
    glad:     ['{you}.', 'Ah, {you}.', 'Good to hear you, {you}.', 'Hello again, {you}.'],
    warm:     ['{you}.', 'Hello, {you}.', 'Ah. {you}.'],
    neutral:  ['{me} here.', '{you}.', 'Reading you, {you}.'],
    cold:     ['{you}.', 'Oh. You.', 'It is you.'],
    angry:    ['{you}.', 'You.', 'Of all the ships on this band.', 'You have a nerve calling me.'],
    furious:  ['You.', 'You have got some nerve.', '{you}. On my channel.', 'Not you.']
  };

  var CLOSE = {
    grateful: ['Looking for another fleetmate? We could go into business together.',
               'If you ever need a hand, you only have to call.',
               'Drinks are on me at any port you name.',
               'Anything you need. I mean it.',
               'My crew would fly into a star for you.'],
    glad:     ['Good to see you again.', 'Fly safe out there.', 'What can I do for you?', ''],
    warm:     ['What can I do for you?', 'Fair winds.', ''],
    neutral:  ['What do you want?', 'Go ahead.', ''],
    cold:     ['Keep your distance.', 'Say what you want and go.', 'I am watching you.'],
    angry:    ['Make it quick.', 'Say your piece and go.', 'I am logging this call.'],
    furious:  ['Give me one reason not to open fire.', 'Get off my channel.',
               'Next time I will not be this polite.']
  };

  function gcd(a, b) { while (b) { var r = a % b; a = b; b = r; } return a; }

  function fillRecall(tpl, e, t) {
    if (/\{q\}/.test(tpl) && !e.q) return null;
    if (/\{f\}/.test(tpl) && !e.f) return null;
    tpl = tpl.replace(/\{f\}/g, e.f || '');
    var sv = RNG.hashString(tpl + e.t) % 3;
    var stakes = stakesPhrase(e.st, sv);
    return tpl.replace(/\{q\}/g, e.q || '')
              .replace(/\{Stakes\}/g, stakes.charAt(0).toUpperCase() + stakes.slice(1))
              .replace(/\{stakes\}/g, stakes)
              .replace(/\{when\}/g, whenPhrase(Math.max(0, (t || 0) - (e.t || 0))))
              .replace(/\s+([.,])/g, '$1');
  }

  /* Every candidate line for a memory, in a seeded order. Lazy: the walk
   * stops at the first one not yet said. */
  function recallLine(G, p, m, band, t, me) {
    var e = salientEntry(m);
    if (!e || !RECALL[e.k]) return null;
    var rec = RECALL[e.k], sal = SALUTE[band] || SALUTE.neutral, clo = CLOSE[band] || CLOSE.neutral;
    /* A grateful captain only offers to go into business over something
     * you did FOR them. */
    if (band === 'grateful' && e.k !== 'rescued' && e.k !== 'answered') clo = CLOSE.glad;
    /* And only a trader with a ship of her own, who is not already flying
     * with you, can make that offer (favours.js recruit). */
    else if (band === 'grateful' && (p.role !== 'trade' || (m && m.joined))) {
      clo = CLOSE.grateful.filter(function (c) { return !/fleetmate/.test(c); });
    }
    var total = rec.length * sal.length * clo.length;
    var said = (m && m.said) || [];
    var base = RNG.hashString('recall|' + p.key + '|' + e.k + '|' + e.t);
    /* EVERY COMBINATION, IN A SHUFFLED ORDER that belongs to this captain
     * and this memory. Two strides were tried first and both moved the
     * parts of the line in lockstep — the greeting and the offer repeated
     * back to back while only the middle changed. A shuffle has no such
     * structure. And the opening and closing used LAST time are skipped on
     * the first pass, so even with only four ways to say hello, no captain
     * says the same one twice running. */
    var order = [], i;
    for (i = 0; i < total; i++) order.push(i);
    var sh = new RNG(base);
    for (i = total - 1; i > 0; i--) {
      var j = sh.int(0, i), tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    var last = (m && m.lastBits) || {};
    var first = null, fresh = null;
    for (var pass = 0; pass < 2 && !fresh; pass++) {
      for (i = 0; i < total; i++) {
        var idx = order[i];
        var ri = idx % rec.length;
        var si = Math.floor(idx / rec.length) % sal.length;
        var ci = Math.floor(idx / (rec.length * sal.length)) % clo.length;
        if (pass === 0 && sal.length > 1 && sal[si] === last.s) continue;
        if (pass === 0 && clo.length > 1 && clo[ci] === last.c) continue;
        if (pass === 0 && rec.length > 1 && rec[ri] === last.r) continue;
        var body = fillRecall(rec[ri], e, t);
        if (!body) continue;
        var text = (sal[si] + ' ' + body + (clo[ci] ? ' ' + clo[ci] : ''))
          .replace(/\{you\}/g, addressOf(G)).replace(/\{me\}/g, me);
        var h = RNG.hashString(text) >>> 0;
        var cand = { text: text, hash: h, entry: e, bits: { s: sal[si], c: clo[ci], r: rec[ri] } };
        if (!first) first = cand;
        if (said.indexOf(h) < 0) { fresh = cand; break; }
      }
    }
    return fresh || first;
  }

  /* SAY IT: the greeting, and the captain remembers having said it. The
   * pure `greeting` is what the comms page previews; this is the hail. */
  function speak(G, sys, contact, t) {
    var g = greeting(G, sys, contact, t);
    if (!g) return null;
    noteMet(G, sys, contact, t);
    var r = resolve(G, sys, contact);
    var m = memory(G, r.key, true);
    m.said = m.said || [];
    if (g.hash != null && m.said.indexOf(g.hash) < 0) {
      m.said.push(g.hash);
      while (m.said.length > SAID_MAX) m.said.shift();
    }
    if (g.bits) m.lastBits = g.bits;
    return g;
  }

  /* ---- what they say when you call ------------------------------------------
   * Opener by band and temper, then — when there IS one — the reason, in
   * their words. {you} is what they call you; {me} is them.
   *
   * Lines are picked by hash of (captain, day, band), so hailing twice does
   * not reroll the mood, and the line changes when the relationship does. */
  var OPENERS = {
    furious: {
      any: ['{you}. You have got some nerve opening a channel to me.',
            'I know that hull. Say one word I do not like and I start shooting.',
            'Get off my frequency before I put you on the bounty boards myself.',
            'Filthy pirate. I would rather drift than take your call.'],
      wary: ['Not you. Not you again. Keep your guns cold and your distance long.'],
      gruff: ['You. Talk fast, then get out of my sight.'],
      principled: ['I will log this call, {you}, and I will log what you are.']
    },
    angry: {
      any: ['{you}. What do you want.',
            'I remember you, and not fondly. Make it quick.',
            'You are lucky I am answering at all.',
            'State your business and then go away.'],
      mercenary: ['Your money is the only thing about you I would take, {you}.'],
      friendly: ['I used to give everyone a fair hearing. You used yours up.']
    },
    cold: {
      any: ['{me} here. Go ahead.',
            'Channel open. Keep it short.',
            'This is {me}. I have heard about you.',
            'Reading you, {you}. Do not crowd my lane.'],
      wary: ['Copy. Hold your range where it is while we talk.'],
      gruff: ['Yeah. What.']
    },
    neutral: {
      any: ['{me} here, {you}. Go ahead.',
            'Reading you clear. What can I do for you?',
            'This is {me}. Channel is open.',
            'Good day, {you}. What do you need?'],
      friendly: ['Hello there, {you}! Quiet lanes today. What can I do for you?'],
      wary: ['{me} here. Identify your business, please.'],
      mercenary: ['{me}. If there is money in this call, I am listening.']
    },
    warm: {
      any: ['{you}! Good to hear a friendly voice out here.',
            'Ah, {you}. What can I do for you?',
            'Hello, {you}. Fair winds. Go ahead.',
            '{me} here, and glad of the company.'],
      gruff: ['{you}. Fine. You are all right. Go ahead.'],
      wary: ['{you}. I suppose you are one of the decent ones. Go ahead.']
    },
    glad: {
      any: ['{you}! Now there is a name I am happy to see on my board.',
            'Well, look who it is. Good to hear you, {you}.',
            'Anything you need, {you}, just ask.',
            'It is a pleasure, {you}. Truly.'],
      mercenary: ['{you}! For you, the friends price. Mostly.'],
      principled: ['{you}. People like you are why these lanes are still safe to fly.']
    },
    grateful: {
      any: ['{you}! I owe you more than I can say. Anything. Name it.',
            'Is that you, {you}? I am still breathing because of you.',
            'My crew drinks to you, {you}. Every single port.',
            'You came for us when nobody else would. What do you need?'],
      gruff: ['{you}. I do not say this often. Thank you. Whatever you need.'],
      wary: ['I do not trust many people out here, {you}. I trust you.']
    }
  };

  /* Pirate-minded captains read the same bands with a different vocabulary:
   * glad to see a fellow predator, contemptuous of a pirate-hunter. */
  var PIRATE_OPENERS = {
    furious: ['Hunter. You have killed friends of mine. Run while you can.'],
    angry: ['I know what you do to our kind. Say your piece and go.'],
    glad: ['Ha! Good hunting lately, {you}? Talk to me.',
           'Now there is a captain who knows how the lanes really work.'],
    warm: ['{you}. We could do business, you and me.']
  };

  /* WHY, in their words. Picked by the strongest reason; a first-hand tag
   * always wins over the record. */
  var REASONS = {
    tag: {
      ATTACKED_ME: 'I still have your scorch marks on my hull.',
      ROBBED_ME: 'You stripped my hold at gunpoint. I have not forgotten.',
      EXPLOITED_COMPASSION: 'You cried for help and it was a trap. Nobody will come for you now.',
      LIED_ABOUT_CARGO: 'And I know better than to believe a word you say.',
      CAUGHT_IN_DISGUISE: 'New paint does not change the hull underneath. I know it is you.',
      IGNORED_MY_DISTRESS: 'You flew right past when I was calling for help.',
      SAVED_MY_SHIP: 'You pulled my ship out of the dark.',
      ANSWERED_MY_DISTRESS: 'You answered when I called. That counts for a lot out here.',
      KEPT_YOUR_WORD: 'You kept your word last time.',
      TRADED_FAIRLY: 'You dealt straight with me last time.'
    },
    piracy: 'Every trader in the system knows what you do.',
    tender: 'You shot a rescue tender. There is no coming back from that.',
    wanted: 'There is a warrant out on you.',
    rescues: 'They say you pull stranded ships out of the dark.',
    pirate_hunter: 'They say you hunt pirates.',
    standing_good: 'My people speak well of you.',
    standing_bad: 'My people do not trust you.',
    piracy_admired: 'Word is you know how to take a prize.',
    wanted_admired: 'A warrant is a reference, where I come from.',
    syndicate: 'The Syndicate knows your name.',
    lies: 'They say your word is no good on the band.',
    heard_bad: 'People I trust have told me about you.',
    heard_good: 'People I trust speak well of you.',
    heard: 'I have heard things about you.'
  };

  function hashPick(arr, seed) {
    if (!arr || !arr.length) return null;
    return arr[RNG.hashString(seed) % arr.length];
  }

  /* What they call you: your ship's name if it has one, else your
   * registration, else "stranger" — the same identity rumours will attach
   * to (step 2). */
  function addressOf(G) {
    var id = identity(G);
    if (id.name) return id.name;
    if (id.transponder) return id.transponder;
    return 'stranger';
  }

  var DAY = 86400;

  function greeting(G, sys, contact, t) {
    var op = opinion(G, sys, contact);
    if (!op) return null;
    var p = op.profile, band = op.band;
    var seed = p.key + '|' + Math.floor((t || 0) / DAY) + '|' + band;
    var me = p.title + ' ' + p.family;
    var said = (op.memory && op.memory.said) || [];

    /* SOMEBODY WHO KNOWS YOU TALKS ABOUT WHAT HAPPENED. A captain with a
     * first-hand memory says the specific thing — built from their log,
     * in their band, never twice the same way (see RECALL). Seeing through
     * your paint is the exception: that is the news, and it is said first. */
    if (!op.through && op.memory && op.memory.log && op.memory.log.length) {
      var rl = recallLine(G, p, op.memory, band, t, me);
      if (rl) {
        return { text: rl.text, hash: rl.hash, band: band, profile: p, opinion: op,
                 speaker: me, recalled: rl.entry.k, bits: rl.bits };
      }
    }

    /* A STRANGER (or a reason, not a memory): an opener for the band, in
     * the temper's voice about a third of the time, plus the reason. The
     * pool is walked in a seeded order and the first line this captain has
     * not already said to you is the one — so the same captain on the same
     * day opens the same way until they have actually said it, and then
     * never again until they run out. */
    var set = OPENERS[band];
    var pool = [];
    if (p.values === 'pirate' && PIRATE_OPENERS[band]) pool = pool.concat(PIRATE_OPENERS[band]);
    if (set[p.temper]) pool = pool.concat(set[p.temper]);
    pool = pool.concat(set.any);

    var why = null;
    var r = op.reason;
    /* Neutral is neutral: a captain with nothing on you does not invent a
     * reason, and one barely leaning either way does not volunteer it. */
    if (r && band !== 'neutral') {
      /* A reason that came by rumour is said as one — where she heard it
       * and what it was about (rumours.js). */
      if (r.rumour && global.Rumours) why = global.Rumours.lineFor(G, sys, r.rumour, p.key);
      if (!why) why = r.kind === 'tag' ? REASONS.tag[r.tag] : REASONS[r.kind] || null;
    }

    var start = RNG.hashString(seed) % pool.length, firstPick = null;
    for (var i = 0; i < pool.length; i++) {
      var line = pool[(start + i) % pool.length];
      var text = fill(line, G, me) + (why ? ' ' + why : '');
      var h = RNG.hashString(text) >>> 0;
      if (!firstPick) firstPick = { text: text, hash: h };
      if (said.indexOf(h) < 0) { firstPick = { text: text, hash: h }; break; }
    }
    return { text: firstPick.text, hash: firstPick.hash, band: band, profile: p, opinion: op,
             speaker: me };
  }

  function fill(line, G, me) {
    return line.replace(/\{you\}/g, addressOf(G)).replace(/\{me\}/g, me);
  }

  /* One-line description for the comms page: who is in the chair and how
   * they feel, before you press anything. */
  function describe(G, sys, contact) {
    var op = opinion(G, sys, contact);
    if (!op) return null;
    return op.profile.title + ' ' + op.profile.name + ' · ' + op.profile.temper +
           (op.band !== 'neutral' ? ' · ' + op.band : '');
  }

  var Captains = {
    profile: profile, memory: memory, record: record, noteMet: noteMet, speak: speak,
    salientEntry: salientEntry, stakesPhrase: stakesPhrase, RECALL: RECALL, LOG_MAX: LOG_MAX,
    opinion: opinion, judge: judge, bandOf: bandOf, heardRecord: heardRecord,
    greeting: greeting, describe: describe, bumpRecord: bumpRecord,
    keyOf: keyOf, hasCaptain: hasCaptain, rosterOf: rosterOf, roleOf: roleOf,
    addressOf: addressOf, resolve: resolve, recordOf: recordOf,
    identity: identity, refit: refit, refitRefusal: refitRefusal, restoreIdentity: restoreIdentity,
    companyFleet: companyFleet, factionFleet: factionFleet, recognitionChance: recognitionChance,
    REFITS: REFITS, RESTORE_PRICE: RESTORE_PRICE, SHADY_CORRUPTION: SHADY_CORRUPTION,
    TAGS: TAGS, EVENTS: EVENTS, BANDS: BANDS, OPENERS: OPENERS, REASONS: REASONS,
    DIAL: DIAL, TEMPERS: TEMPERS, VALUES: VALUES, LOG_RANK: LOG_RANK,
    VALUE_WEIGHTS: VALUE_WEIGHTS, TEMPER_WEIGHTS: TEMPER_WEIGHTS, weighted: weighted,
    _logEntry: logEntry,
    _clearCache: function () { _profiles = {}; }
  };
  global.Captains = Captains;
  if (typeof module !== 'undefined' && module.exports) module.exports = Captains;
})(typeof window !== 'undefined' ? window : globalThis);
