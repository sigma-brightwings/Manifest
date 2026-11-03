/* save.js — the career, kept.
 *
 * The universe needs no saving: it is a pure function of the seed, which is
 * the whole architecture paying off at last. What gets written is only what
 * the player has done to it — where they are, what they own, what they owe,
 * and who remembers them. Everything else regenerates identically from the
 * seed on load.
 *
 * One save per seed, in localStorage, written automatically at every dock
 * (the natural "safe" moment, and the same one FE2 used) and on the page
 * being closed. Loading happens at boot if a save exists for the seed in
 * the URL; N (new game) deletes it deliberately. Storage can be absent or
 * refuse (private windows, headless tests), so every touch is guarded —
 * a save system must degrade to "no save system", never to a crash.
 */
(function (global) {
  'use strict';

  /* ---- version EPOCHS, not version numbers -------------------------------
   * readSlot and load discard a payload whose version does not match exactly,
   * so bumping this does not migrate old saves — it DELETES them. That makes
   * the version a blunt instrument, and the policy follows from that: it is
   * bumped for CLUSTERS of breaking changes, never for one.
   *
   * Bumping per change would mean every removal, however small, throws away
   * every career saved before it. Batching them means one boundary throws
   * away one generation of saves, and everything on either side of the
   * boundary is internally consistent.
   *
   * So a removal happens in TWO STEPS, and the gap between them is the whole
   * point:
   *
   *   1. STOP READING the field, and add it to DEPRECATED below. It is still
   *      written, so a save from before the change still loads and a save
   *      from after it still loads on an older build. Nothing breaks. This
   *      step is free and can happen any time.
   *
   *   2. At the NEXT epoch bump, delete everything on the shelf at once and
   *      empty it. That is the only moment a field actually stops being
   *      written, and it is the moment old saves are discarded anyway.
   *
   * The shelf is the part that makes this work rather than being a good
   * intention: without it, "we'll clean that up at the next bump" is a thing
   * nobody remembers, and the fields accumulate forever because removing one
   * on its own was never worth a bump.
   */
  /* EPOCH 2 — the Syndicate.
   *
   * Bumped because this is a cluster, not a change: galactic territory was
   * redrawn (balanced major cells, three pirate holds, minor powers),
   * permissivity was rebuilt on two axes (violence and corruption) instead
   * of one, and two commodities' worth of new economy hangs off both. A
   * career from epoch 1 is in a galaxy whose map no longer exists — the
   * same seed now draws different owners for a third of its stars — so
   * there is nothing to migrate it to.
   *
   * The rule this follows, and the reason it is not VERSION 5 by now: the
   * number moves for CLUSTERS of major changes, never per change. It is a
   * marker for "everything below this line can be removed without breaking
   * anything downstream of it in time", which is only useful if the lines
   * are far enough apart to be worth drawing. */
  /* EPOCH 3 — no-man's land (2026-10-24).
   *
   * The galaxy was redrawn: 450 stars on a 73 ly disc where there were 200
   * on 48, the empires holding compact cores with open space between them,
   * and the stars nobody holds generating EMPTY - no port, no market. A
   * career from epoch 2 is docked at ports, in systems and on courses that
   * no longer exist in the same seed, so there is nothing to migrate it to.
   * Astra chose it knowing that ("a new galaxy, so current saves won't
   * carry over"). The shelf was empty; nothing else goes with it. */
  /* EPOCH 4 — the pirates split from the Syndicate (2026-10-31).
   *
   * Territory was redrawn again: three pirate bands (pb0..pb2) now hold a
   * few systems each in the far reaches, as the Syndicate's muscle, and
   * the governments, police and traffic of those systems change with them.
   * Astra chose it knowing a career resets ("Bump, careers reset"). The
   * shelf was empty; nothing else goes with it. */
  /* EPOCH 5 — the star programme (2026-11-03, stars stage 2).
   *
   * The one deliberate break of doctrine 4 for the whole programme. Stage
   * 2 rebuilt where planets sit (a warm anchor world and a compact chain
   * through the habitable zone) and what the zone's worlds are, so every
   * seed's planets, ports, markets and traffic moved: a career from epoch
   * 4 is docked at a port that is no longer there. Astra chose it knowing
   * that: "we don't need to have saves be cross-compatible if we're
   * altering the star generation". LATER STAR STAGES (binaries, remnants,
   * the cluster's centre) RIDE THIS SAME EPOCH — bump once for the
   * programme, not once per stage. The shelf was empty; nothing else goes
   * with it. */
  var VERSION = 5;

  /* Written but no longer read. Delete the lot at the next epoch bump, then
   * empty this list. Each entry says what replaced it, because "why is this
   * still here" is the question a reader will actually have.
   *
   * Empty right now — the equipment change kept `gun`/`turret`/`shield`/
   * `heatshield` deliberately live rather than deprecated, since
   * Combat.migrateFit still reads them to rebuild a `fit` for a pre-slot
   * career. They are not on the shelf because they are not yet unread. */
  var DEPRECATED = [
    // { field: 'ship.oldThing', unreadSince: 'the X change', replacedBy: 'ship.newThing' }
  ];

  function key(seed) { return 'psg1|' + seed; }

  /* ---- manual slots ------------------------------------------------------
   * Two different things share one snapshot format, and keeping them
   * separate is the whole design:
   *
   *   the AUTOSAVE is per-seed, written for you at every dock and on the way
   *   out, and it is what "Continue" resumes. It is a bookmark.
   *
   *   the SLOTS are global rather than per-seed, written only when the
   *   player asks. A slot carries its own seed, so the main menu can list
   *   careers in different galaxies side by side and loading one is allowed
   *   to change which universe you are in. That is exactly what a per-seed
   *   slot could not do, and it is why they are not just numbered autosaves.
   *
   * Nothing migrates: the autosave key is untouched, so a career saved by
   * the previous version resumes exactly as it did. Slots simply did not
   * exist before, and an empty slot list is a correct one. */
  var SLOT_COUNT = 6;
  function slotKey(n) { return 'psg1|slot|' + n; }

  /* What a slot says about itself in the menu. Captured at save time as
   * plain strings rather than ids: the point of a slot list is to be
   * readable without generating six galaxies to look up six names. */
  function describe(G) {
    var where = null;
    try {
      if (G.ship && G.ship.docked && G.sys && G.sys.byId[G.ship.docked]) {
        where = G.sys.byId[G.ship.docked].name;
      } else if (G.ship && G.ship.landed && G.sys && G.sys.byId[G.ship.landed]) {
        where = G.sys.byId[G.ship.landed].name;
      } else if (global.Sim && G.sys) {
        var dom = global.Sim.dominantBody(G.ship.pos, G.sys, G.t);
        if (dom) where = 'near ' + dom.name;
      }
    } catch (e) { where = null; }
    return {
      seed: G.seed,
      system: (G.here && G.here.name) || G.seed,
      where: where || 'in flight',
      credits: (G.ship && G.ship.credits) || 0,
      hull: (G.ship && G.ship.hullId) || null,
      t: G.t,
      written: Date.now()
    };
  }

  /* An auto-label good enough that naming a slot is optional rather than a
   * chore: where you were is what you actually recognise a save by. */
  function autoLabel(G) {
    var d = describe(G);
    return d.where === 'in flight' ? (d.system + ' — in flight') : d.where;
  }

  function writeSlot(n, G, label) {
    var st = storage();
    if (!st || !slotValid(n)) return false;
    try {
      var rec = { v: VERSION, label: String(label || autoLabel(G)).slice(0, 40),
                  meta: describe(G), data: snapshot(G) };
      st.setItem(slotKey(n), JSON.stringify(rec));
      return true;
    } catch (e) { return false; }
  }

  function readSlot(n) {
    var st = storage();
    if (!st || !slotValid(n)) return null;
    try {
      var raw = st.getItem(slotKey(n));
      if (!raw) return null;
      var rec = JSON.parse(raw);
      /* A slot whose payload is the wrong version is shown as empty rather
       * than offered and then failing halfway through a restore. */
      if (!rec || rec.v !== VERSION || !rec.data || rec.data.v !== VERSION) return null;
      return rec;
    } catch (e) { return null; }
  }

  function clearSlot(n) {
    var st = storage();
    if (!st || !slotValid(n)) return;
    try { st.removeItem(slotKey(n)); } catch (e) { /* fine */ }
  }

  function slotValid(n) { return n >= 1 && n <= SLOT_COUNT && n === Math.floor(n); }

  /* Always SLOT_COUNT entries, empty ones included — the menu draws a fixed
   * list of pads and a missing entry would silently renumber the rest. */
  function slots() {
    var out = [];
    for (var n = 1; n <= SLOT_COUNT; n++) {
      var rec = readSlot(n);
      out.push(rec ? { n: n, used: true, label: rec.label, meta: rec.meta }
                   : { n: n, used: false, label: null, meta: null });
    }
    return out;
  }


  function storage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch (e) { /* accessor itself can throw */ }
    return null;
  }

  /* Everything mutable that is the player's, and nothing that is the
   * world's. Orientation vectors are saved whole — recomputing them would
   * be easy, but waking up pointed somewhere you weren't is disorienting in
   * the most literal sense. */
  /* SAVED MID-CRUISE, LOADED AT 6.7c (fixed 2026-10-19). Inside the cruise
   * bubble the hull's velocity is the cruise speed — up to CRUISE_MAX,
   * two million km/s — and nothing here knew about cruise, so an autosave
   * taken in it wrote that number down and a load dropped you into plain
   * flight at it: "speed 2000000.000 km/s", no bubble, no way to slow.
   * Found playing a save from the 18th. A save in cruise is now written as
   * the drop-out it would have been: the circular orbit you are standing
   * in, which is exactly what main.js's dropCruise hands back. */
  function circularHere(G) {
    var Sim = global.Sim, V = global.V;
    var dom = Sim && Sim.dominantBody(G.ship.pos, G.sys, G.t);
    if (!dom || !(dom.mu > 0)) return null;
    var bs = Sim.bodyState(dom, G.sys, G.t);
    var rel = V.sub(G.ship.pos, bs.pos), r = V.len(rel);
    if (r < 1e-6) return null;
    var up = V.scale(rel, 1 / r);
    var ref = Math.abs(up.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    return V.addScaled(bs.vel, V.norm(V.cross(ref, up)), Math.sqrt(dom.mu / r));
  }
  /* And the saves already written that way. Nothing outside the bubble
   * flies at a twentieth of c — a torch at full burn for a month does not
   * get there — so a loaded velocity past that, relative to the body you
   * are near, can only be a cruise that was frozen into the file. */
  var FROZEN_CRUISE_KMS = 15000;
  function savedVel(G) {
    if (!G.cruise) return G.ship.vel;
    return circularHere(G) || G.ship.vel;
  }

  function snapshot(G) {
    var s = G.ship;
    return {
      v: VERSION,
      seed: G.seed,
      t: G.t,
      here: G.here ? G.here.id : null,
      visited: Object.keys(G.visited || {}),
      /* Charted is a superset of visited in practice and a different fact
       * in principle: whose flag flies over a star, which can be bought at
       * a port without going there. Saved separately so a bought chart
       * survives a reload — it was paid for. */
      charted: Object.keys(G.charted || {}),
      ship: {
        pos: s.pos, vel: savedVel(G), fwd: s.fwd, up: s.up, right: s.right,
        /* Standing on open ground (rung 2): the spot on the world, which
         * turns with it, not the position, which was only true at save. */
        landedAt: (s.landed && !s.crashed && s.landedAt) ? s.landedAt : null,
        fuel: s.fuel, thrusterFuel: s.thrusterFuel,
        /* Whether the military drive is armed. Additive and undefined-safe:
         * Slipspace.milRunning treats anything but an explicit false as
         * armed, so a career that predates the drive loads with no drive to
         * arm and reads correctly either way. */
        milArmed: s.milArmed,
        /* Which ordnance is racked and how bad the crate is. Additive: an
         * older career comes back with an undefined type, which fireMissile
         * reads as a Hawk — exactly what it was carrying. */
        missileId: s.missileId, missileBatch: s.missileBatch,
        /* THE PEOPLE ABOARD. Additive: a career from before crew loads
         * with nobody on the deck, which is what it had — and on a hull
         * that needs a gunner, that is a turret that will not fire until
         * one is hired, which is the rule working rather than the save
         * being wrong. */
        crew: (s.crew || []).slice(),
        /* And what they are paid up to. Absent in an older career, which
         * settleAccounts reads as "starts now" rather than as a decade of
         * back pay. */
        wagesTo: s.wagesTo,
        /* WHAT IS OWED AGAINST THE HULL. Additive and absent in any career
         * from before the lien existed, which loads as "nothing owed" — the
         * right answer, and the reason this needs no version bump. */
        lien: s.lien ? { cr: s.lien.cr, who: s.lien.who, at: s.lien.at } : null,
        /* ON THE CABLE. Saved so a tow survives a reload rather than
         * dropping the hull back into the dark with dry tanks and a paid
         * bill — which would be the worst of every world. `from` is a
         * position and the destination is an id, so nothing live is in it. */
        tow: s.tow ? { port: s.tow.port, at: s.tow.at, dur: s.tow.dur,
                       from: { x: s.tow.from.x, y: s.tow.from.y, z: s.tow.from.z },
                       handedOff: !!s.tow.handedOff,
                 tug: s.tow.tug || null, planted: s.tow.planted || null,
                 framed: s.tow.framed || null } : null,
        /* The racks themselves, copied rather than referenced so a later
         * shot cannot edit a snapshot that has already been taken. The two
         * fields above are the ARMED rack's view of this and are written
         * anyway, so a save made now still loads in a build that predates
         * racks — the old fields say what is on the trigger, which is what
         * that build would have read. */
        racks: (function () {
          var out = {}, src = s.racks || {};
          for (var rk in src) {
            if (!src[rk] || !(src[rk].n > 0)) continue;
            out[rk] = { id: src[rk].id || rk, n: src[rk].n, batch: src[rk].batch };
          }
          return out;
        })(),
        missileSeq: s.missileSeq,
        cargo: s.cargo, credits: s.credits, drones: s.drones || 0,
        hot: s.hot || {}, hotDrones: s.hotDrones || 0,
        /* WHO IS IN THE BACK. Seats are derived from the fitting and come
         * back on their own; people are not, so they are written. A save
         * that dropped them would land the ship with live passage
         * contracts and nobody aboard to deliver. */
        passengers: s.passengers || 0,
        /* A career saved MID-ARRIVAL comes back parked. During the lift
         * ride `docked` is still null and the ship's recorded position is
         * half way down a shaft — restoring that literally would put the
         * hull in free flight inside solid rock. Recording the destination
         * instead means load re-docks it at the berth, which is also the
         * honest reading: you were on your way in, so you arrived.
         * Additive, and old saves have no `arrival` to consult. */
        /* And the same for the hold over the exit pad (Sim.stepPadHold,
         * 2026-11-02): `padHold` is not written, so restoring the position
         * alone would hand back a hull hanging over the pad with nothing
         * holding it — on a heavy world, the fall-back-and-crash the hold
         * exists to prevent. Saved there, it comes back in the berth. */
        docked: s.docked || (s.arrival ? s.arrival.port : null) || (s.padHold ? s.padHold.port : null),
        hullId: s.hullId, hullHp: s.hullHp,
        /* Additive: the outside a hull is wearing, when it is not its own. */
        meshKind: s.meshKind || null,
        /* The four legacy fields are still written, and deliberately so:
         * they are what an older build would read if a save travelled
         * backwards, and they cost four strings. `fit` is the truth. */
        gun: s.gun, turret: s.turret, shield: s.shield,
        heatshield: s.heatshield,
        shieldHp: s.shieldHp, missiles: s.missiles, sinks: s.sinks, decoys: s.decoys || 0,
        fit: s.fit || {},
        /* Which trigger each hardpoint answers to. Additive, and absent
         * from every save written before fire groups existed — groupOf()
         * reads a missing entry as group A, so an old career comes back
         * firing everything on the primary trigger, which is exactly what
         * it was doing before the update. No version bump: a bump does not
         * migrate old saves, it deletes them. */
        groups: s.groups || {},
        /* Named things belong to the pilot, not the hull. */
        reg: s.reg || null, shipName: s.shipName || null,
        /* WHAT SHE IS PRETENDING TO BE (captains.js, step 2). Additive: an
         * older career has no disguise and flies its own colours, which it
         * was. The count is kept separately so a fresh refit after a
         * restore draws a new false name rather than the old one again. */
        disguise: s.disguise || null, disguiseCount: s.disguiseCount || 0,
        /* Additive, and absent from every save written before the cockpit
         * kit existed — those load with bornId null and cockpitSpec falls
         * back to the hull id, which is a stable seed too. So an old career
         * gets a consistent bridge, just not a uniquely flaired one. */
        bornId: s.bornId || null,
        /* The colours a shipyard painted her (combat.js PAINTS). Additive:
         * an older career's hull is yard grey, which it was. */
        paint: s.paint || null,
        /* Whose colours a Crawler wears, 2026-10-24 (combat.js
         * liveryRefusal). Additive: an older career's Crawler is civilian,
         * which it was. */
        livery: s.livery || null,
        liveryFaction: s.liveryFaction || null,
        /* What rides in a Crawler's truss (construction.js). */
        modules: s.modules || [],
        /* A Crawler's craft bay loadout (construction.js). */
        craftBay: s.craftBay || null
      },
      pilotName: G.pilotName || null,
      standing: G.standing || {},
      /* Blown console screens are damage, not a display preference: they
       * cost money to put right, so they have to survive closing the tab
       * the same way a dented hull does. */
      deadPanels: G.deadPanels || {},
      wanted: G.wanted || {},
      /* The navy's ledger (hunters.js): additive, an older save has none. */
      notoriety: G.notoriety || {},
      /* WHICH START THIS CAREER CHOSE (start.js): { difficulty, focus }.
       * Additive and no version bump: an older career has none, which reads
       * as the only start there was before the choice existed. Kept so a
       * report can say "easy mining, seed kawartha" and be a test case. */
      start: G.start || null,
      /* How many times you have taken an occupied berth, per faction. Additive
         and NO version bump: an old career loads with none recorded, which is
         the right answer for a pilot who has never done it. */
      queueJumps: G.queueJumps || {},
      /* A witness who is mid-transmission when you save is still
       * mid-transmission when you load. Additive: an older save has no
       * field and comes back with nobody talking, which is the correct
       * reading of "this career predates witnesses being buyable". */
      pendingReport: G.pendingReport || null,
      /* Live distress calls. A mayday can easily outlive a session — the
       * responder may be eighteen hours out — so a call that vanished on
       * save would strand the pilot it was the answer to.
       *
       * `victim` is dropped on the way out: it is a live spec reference,
       * and specs are rebuilt from their rails whenever t moves, so
       * writing one would persist a ship that no longer exists. Only the
       * dormant answer path reads it, and a reloaded call simply cannot be
       * answered for standing — which is correct, because the thing you
       * would have been rescuing is not there any more either. */
      distress: (G.distress || []).map(function (c) {
        return {
          from: c.from, name: c.name, reg: c.reg, cls: c.cls,
          faction: c.faction, kind: c.kind, mine: !!c.mine, want: c.want,
          pos: c.pos, at: c.at, until: c.until,
          answeredBy: c.answeredBy || null, etaAt: c.etaAt || null
        };
      }),
      /* An order to leave outlives a save — it is cleared by getting rid of
       * the cargo, not by quitting to the menu. */
      expelled: G.expelled || null,
      /* Corruption you bribed onto a place, not a fact about its
       * government (that stays in `sys`, regenerated from the seed every
       * time and never saved — see combat.js's corruption-lever section).
       * Keyed by star id: { v: points, t: G.t at last touch }, read back
       * decayed rather than ticked. Additive: an older career loads with
       * none and every system reads exactly its generated baseline, which
       * is the correct answer for a pilot who never bribed anyone. */
      corruptionShift: G.corruptionShift || {},
      missions: G.missions || [],
      /* THE TWO AUTHORED CHAINS AND THE CHOICE BETWEEN THEM. `allegiance`
       * is set exactly once, when a third chapter is taken, and nothing
       * clears it — so it is the one field in this file that a save must
       * never lose, or a career that shut a door would find it open again.
       * `owed` is a reward that could not be fitted when it was earned. */
      powers: G.powers || {},
      allegiance: G.allegiance || null,
      owed: G.owed || [],
      /* THE SHIPS YOU OWN AND ARE NOT SITTING IN. Additive: a career that
       * predates the fleet loads with an empty one, which is exactly what
       * it had. Stored whole because a parked ship IS its record — there
       * is no live object to reconstruct it from. */
      fleet: G.fleet || [],
      /* Hulls on the slips (Combat.commission, 2026-10-19). Paid for, so a
       * save that dropped them would be a save that ate the money. */
      orders: G.orders || [],
      /* Station modules, on the slip, at a yard or in a Crawler's truss
       * (construction.js, 2026-10-20). Paid for, so saved. */
      stationModules: G.stationModules || [],
      /* THE PLANTS YOU OWN, and what they have done to the systems they
       * are in (holdings.js). Both additive: an older career loads owning
       * nothing, and every system reads exactly its generated government. */
      holdings: G.holdings || [],
      uplift: G.uplift || {},
      /* THE TENDER ON ITS WAY, and whether one ever will be again. Both
       * additive. The responder is named by id and re-attached on load
       * (Combat.restoreRescue), so the ETA quoted before a reload is the
       * ETA flown after it. */
      rescue: G.rescue || null,
      tenderKills: G.tenderKills || 0,
    /* The pirate mark (combat.js, Phase 18) and the pirates already
     * credited against it, by id. */
    marks: G.marks || {},
    /* Station licences by star id, and forged blanks (licence.js). */
    licences: G.licences || {},
    forgedBlanks: G.forgedBlanks || 0,
    /* Stations you founded (stations.js): the founding records, from which
     * her schedule and her port are rebuilt. Additive. */
    stations: G.stations || [],
    markCredited: G.markCredited || {},
      /* WHAT YOU DID FOR OTHER SHIPS (upkeep.js): mass passed, money that
       * changed hands, the legs you pulled ships out of. Everything else
       * about their tanks and purses is a function of time. Additive. */
      npcLedger: G.npcLedger || {},
      /* THE F5 NOTES TAB (journal.js): what you wrote, and what the game
       * wrote down for you. Additive; an older save has neither. */
      notes: typeof G.notes === 'string' ? G.notes : '',
      journal: Array.isArray(G.journal) ? G.journal : [],
      doneMissions: G.doneMissions || {},
      campaigns: G.campaigns || {},
      /* CAPTAIN HALLOWAY'S LESSONS (tutorial.js): which one you are on and
       * what you have done towards it. Additive; an older save has none,
       * and loads with no tutorial at all. */
      tutorial: G.tutorial || null,
      /* A SHIP STILL TO CHOOSE (main.js startPick, 2026-11-03): up from the
       * end of the lessons until a picker row is taken. Additive; an older
       * save has none, and reads as nothing waiting. */
      startPending: !!G.startPending,
      /* Ship-to-ship trade: what each voyage has already sold or bought
       * (so a reload cannot refill a hold you emptied) and the day's
       * standing tally (so a reload cannot reset the daily cap). Added
       * field, absent in older saves — restore defaults it. */
      shipTrade: G.shipTrade || null,
      /* SURVEYS (mining rung 1): what you have mapped, where and when, as
       * packed cell strings - the unpacked cache (_cells) stays behind.
       * Additive: an older career loads having mapped nothing. */
      surveys: (function () {
        var out = {}, s = G.surveys || {};
        Object.keys(s).forEach(function (k) {
          var r = s[k], c = {};
          Object.keys(r).forEach(function (f) { if (f.charAt(0) !== '_') c[f] = r[f]; });
          out[k] = c;
        });
        return out;
      })(),
      extracted: G.extracted || {},
      /* CLAIMS AND DRONES (mining rung 2). A drone is its timetable - where
       * it sits, what it digs, when it was last emptied - so it saves as
       * plain data and needs nothing re-run on load. */
      claims: G.claims || {},
      drones: G.drones || [],
      /* Other prospectors' drones are derived from the seed; only what
       * YOU did to them is written, and the thefts not yet reported. */
      npcDrones: G.npcDrones || {},
      thefts: G.thefts || [],
      /* RUNG 3: rocks a torpedo shattered stay gone, the Guild's refund log
       * stays owed, and a holed station stays shut until its date. */
      shattered: G.shattered || {},
      /* What the beam has taken out of each rock (2026-10-18): tonnes gone
       * and the craters, in the rock's own frame. Additive. */
      rockWear: G.rockWear || {},
      torpRefund: G.torpRefund || 0,
      sabotage: G.sabotage || {},
      /* WHO REMEMBERS YOU, and what you have done in public (captains.js).
       * Both additive: an older career loads with no captain who has ever
       * met you and a clean record, which is the honest reading — nobody
       * out there was keeping count before. Only captains you have actually
       * dealt with are in here; everyone else regenerates from the seed. */
      captains: G.captains || {},
      record: G.record || null,
      /* WHO YOU HAVE TALKED TO ON FOOT, and what passed between you
       * (dialogue.js, 2026-10-25). Additive, like captains: an older career
       * loads with nobody on any deck who has met you. */
      people: G.people || {},
      /* THE OVERBOSS'S TITHE (tithe.js, 2026-10-26): who you have paid and
       * who you have refused, by system. Additive: an older career owes
       * nobody anything. */
      tithe: G.tithe || {},
      /* THE TRADING HOUSES (tradingfirm.js, 2026-11-03): every account
       * you have opened, its cash, its quarters, and the firms' own
       * footprint in the markets they traded (what lets a reload trade
       * exactly as no reload would have). Additive: an older career has
       * never opened an account. The hulls' own run state rides on their
       * fleet records (`trade`), which are saved whole already. */
      firms: G.firms || null,
      /* YOUR OWN DISTRESS CALLS still in the air, with who answered and
       * when they arrive (messages.js). Additive. Saved because the
       * arrival is where a lie is found out, and a reload must not be a
       * way to make the responder never get there. */
      broadcasts: G.broadcasts || [],
      /* FAVOURS AND PARTNERS (favours.js). Additive. `joined` is which
       * captains left their lanes to fly with you — the timetable is
       * regenerated from the seed and would put them back otherwise; the
       * ask is saved so a reload is not a way to dodge answering it. */
      joined: G.joined || {},
      favourAsk: G.favourAsk || null,
      tipAt: G.tipAt == null ? null : G.tipAt,
      /* WHAT PEOPLE ARE SAYING (rumours.js). Additive — and an older
       * career loads with `rumours` absent; what its record held by then
       * becomes `recordLegacy`, known everywhere as it always was, and
       * everything after travels by ship. Who has heard each rumour is not
       * saved: it is worked out again from the timetable. */
      rumours: G.rumours || null,
      recordLegacy: G.recordLegacy || null,
      hearsay: G.hearsay || [],
      rumourSeq: G.rumourSeq || 0,
      ledger: G.ledgerLog || []
    };
  }

  function store(G) {
    var st = storage();
    if (!st) return false;
    try {
      st.setItem(key(G.seed), JSON.stringify(snapshot(G)));
      return true;
    } catch (e) { return false; }
  }

  function load(seed) {
    var st = storage();
    if (!st) return null;
    try {
      var raw = st.getItem(key(seed));
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.v !== VERSION || data.seed !== seed) return null;
      return data;
    } catch (e) { return null; }
  }

  function clear(seed) {
    var st = storage();
    if (!st) return;
    try { st.removeItem(key(seed)); } catch (e) { /* fine */ }
  }

  /* Put a snapshot back into a freshly-generated game. main.js has already
   * run newGame(seed) — the galaxy and the starting system exist — so this
   * only has to walk to the right star, restore the hull, and re-dock if
   * the save was made on a station's clamps (they all are, given when
   * saves happen, but a beforeunload save can be anywhere). */
  function restore(G, data, deps) {
    var Sim = global.Sim, V = global.V;
    G.t = data.t;
    /* Before the system is entered, so main.js systemFor puts any station
     * you founded back into it - the save may be docked at one. */
    G.stations = Array.isArray(data.stations) ? data.stations : [];
    /* The arms are not saved, so nor is a crate in them: it is back in her ring. */
    G.stations.forEach(function (st) { if (st) st.held = null; });
    if (global.Stations && G.sys && G.here) global.Stations.inject(G, G.sys, G.here.id);

    for (var i = 0; i < (data.visited || []).length; i++) G.visited[data.visited[i]] = true;
    /* An old save has no charted list, and everywhere it had BEEN is
     * charted by definition — so the fallback is the visited list rather
     * than an empty chart, which would take territory away from a career
     * that predates the distinction. */
    G.charted = G.charted || {};
    var chartedList = data.charted || data.visited || [];
    for (var ci = 0; ci < chartedList.length; ci++) G.charted[chartedList[ci]] = true;

    if (data.here && data.here !== G.here.id) {
      var star = null;
      for (var j = 0; j < G.galaxy.stars.length; j++) {
        if (G.galaxy.stars[j].id === data.here) { star = G.galaxy.stars[j]; break; }
      }
      if (star && deps && deps.enterSystem) deps.enterSystem(star, { keepShip: true });
    }

    var s = G.ship, d = data.ship;
    s.pos = d.pos; s.vel = d.vel; s.fwd = d.fwd; s.up = d.up; s.right = d.right;
    /* A cruise frozen into an older save: put the hull back in the orbit
     * the drop-out would have given it. See savedVel. */
    try {
      var domL = global.Sim && global.Sim.dominantBody(s.pos, G.sys, G.t);
      if (domL) {
        var vRelL = global.V.sub(s.vel, global.Sim.bodyState(domL, G.sys, G.t).vel);
        if (global.V.len(vRelL) > FROZEN_CRUISE_KMS) s.vel = circularHere(G) || s.vel;
      }
    } catch (e) { /* leave it as saved */ }
    s.fuel = d.fuel; s.thrusterFuel = d.thrusterFuel;
    s.milArmed = d.milArmed;
    s.crew = (d.crew || []).slice();
    s.wagesTo = (d.wagesTo == null) ? G.t : d.wagesTo;
    s.lien = (d.lien && d.lien.cr > 0) ? { cr: d.lien.cr, who: d.lien.who || 'the harbour',
                                           at: d.lien.at || 0 } : null;
    s.tow = (d.tow && d.tow.port) ? { port: d.tow.port, at: d.tow.at || 0,
                                      dur: d.tow.dur || 1,
                                      from: d.tow.from || { x: 0, y: 0, z: 0 },
                                      handedOff: !!d.tow.handedOff,
                                     tug: d.tow.tug || null, planted: d.tow.planted || null,
                                     framed: d.tow.framed || null } : null;
    s.missileId = d.missileId; s.missileBatch = d.missileBatch;
    /* A save from before racks has none, and Combat.racksOf builds the one
     * rack its counter describes the first time anything asks — so the
     * absence is handled by leaving the field alone rather than by writing
     * an empty object over it, which would throw away the rounds. */
    if (d.racks) s.racks = d.racks;
    s.missileSeq = d.missileSeq;
    s.cargo = d.cargo || {}; s.credits = d.credits;
    s.drones = d.drones || 0;
    s.hot = (d.hot && typeof d.hot === 'object') ? d.hot : {};
    s.hotDrones = d.hotDrones || 0;
    s.passengers = d.passengers || 0;
    s.hullId = d.hullId; s.hullHp = d.hullHp;
    if (d.meshKind) s.meshKind = d.meshKind;
    s.gun = d.gun; s.turret = d.turret; s.shield = d.shield;
    s.heatshield = d.heatshield || null;
    s.shieldHp = d.shieldHp || 0; s.missiles = d.missiles || 0;
    s.sinks = d.sinks || 0;
    s.decoys = d.decoys || 0;
    if (d.reg) s.reg = d.reg;
    s.shipName = d.shipName || null;
    s.disguise = (d.disguise && d.disguise.transponder) ? d.disguise : null;
    s.disguiseCount = d.disguiseCount || 0;
    s.bornId = d.bornId || null;
    s.paint = (d.paint && typeof d.paint === 'object') ? d.paint : null;
    s.livery = (d.livery === 'navy' || d.livery === 'syn') ? d.livery : null;
    s.liveryFaction = s.livery ? (d.liveryFaction || null) : null;
    s.modules = Array.isArray(d.modules) ? d.modules : [];
    s.craftBay = d.craftBay || null;
    G.pilotName = data.pilotName || null;

    /* The hull's fixed numbers come from the catalogue, not the save —
     * a rebalanced hull reaches old careers on load. */
    if (global.Combat && global.Combat.HULLS[s.hullId]) {
      var h = global.Combat.HULLS[s.hullId];
      s.dryMass = h.dryMass; s.thrustKN = h.thrustKN;
      s.thrusterCap = h.thrusterCap; s.fuelCap = h.fuelCap;
      s.cargoCap = h.cargoCap; s.hullMax = h.hullMax;
      s.hullHp = Math.min(s.hullHp, s.hullMax);
    }
    /* Slots. A save written before they existed has no `fit`, so migrateFit
     * builds one from the four legacy fields; one written after simply has
     * its fit adopted and the legacy fields rewritten from it. Either way
     * the ship that comes back is carrying what it was carrying. */
    if (global.Combat) {
      s.fit = (d.fit && typeof d.fit === 'object') ? d.fit : null;
      global.Combat.migrateFit(s);
      /* Missing on any save older than fire groups, and that is fine: an
       * absent entry reads as group A. */
      s.groups = (d.groups && typeof d.groups === 'object') ? d.groups : {};
    }
    Sim.refreshShip(s);

    G.standing = data.standing || {};
    G.deadPanels = data.deadPanels || {};
    G.wanted = data.wanted || {};
    G.notoriety = data.notoriety || {};
    G.start = (data.start && typeof data.start === 'object') ? data.start : null;
    G.queueJumps = data.queueJumps || {};
    G.pendingReport = data.pendingReport || null;
    G.distress = data.distress || [];
    G.expelled = data.expelled || null;
    G.corruptionShift = (data.corruptionShift && typeof data.corruptionShift === 'object')
      ? data.corruptionShift : {};
    G.missions = data.missions || [];
    G.powers = data.powers || {};
    G.allegiance = data.allegiance || null;
    G.owed = data.owed || [];
    G.fleet = data.fleet || [];
    G.orders = data.orders || [];
    G.stationModules = Array.isArray(data.stationModules) ? data.stationModules : [];
    G.holdings = data.holdings || [];
    G.uplift = (data.uplift && typeof data.uplift === 'object') ? data.uplift : {};
    G.rescue = data.rescue || null;
    G.tenderKills = data.tenderKills || 0;
    G.marks = (data.marks && typeof data.marks === 'object') ? data.marks : {};
    G.licences = (data.licences && typeof data.licences === 'object') ? data.licences : {};
    G.forgedBlanks = data.forgedBlanks || 0;
    G.markCredited = (data.markCredited && typeof data.markCredited === 'object') ? data.markCredited : {};
    G.npcLedger = (data.npcLedger && typeof data.npcLedger === 'object') ? data.npcLedger : {};
    G.notes = typeof data.notes === 'string' ? data.notes : '';
    G.journal = Array.isArray(data.journal) ? data.journal : [];
    G.doneMissions = data.doneMissions || {};
    G.campaigns = data.campaigns || {};
    G.tutorial = (data.tutorial && typeof data.tutorial === 'object') ? data.tutorial : null;
    G.startPending = !!data.startPending;
    /* A CAREER SAVED MID-LESSON BEFORE 2026-11-03 has no pickAtEnd. It is
     * asked its ship when the lessons end unless it already chose a focus
     * start on the old title card: no start at all, or HARD, was the Talon
     * — the very career a new one now opens as — and the picker cannot
     * take anything from it, since its HARD row keeps what you fly. A
     * finished tutorial is left alone: its lessons will not end again. */
    if (G.tutorial && !G.tutorial.done && G.tutorial.pickAtEnd === undefined) {
      G.tutorial.pickAtEnd = !(G.start && G.start.focus);
    }
    G.shipTrade = data.shipTrade || null;
    G.surveys = (data.surveys && typeof data.surveys === 'object') ? data.surveys : {};
    G.extracted = (data.extracted && typeof data.extracted === 'object') ? data.extracted : {};
    G.claims = (data.claims && typeof data.claims === 'object') ? data.claims : {};
    G.drones = Array.isArray(data.drones) ? data.drones : [];
    G.npcDrones = (data.npcDrones && typeof data.npcDrones === 'object') ? data.npcDrones : {};
    G.thefts = Array.isArray(data.thefts) ? data.thefts : [];
    G.shattered = (data.shattered && typeof data.shattered === 'object') ? data.shattered : {};
    G.rockWear = (data.rockWear && typeof data.rockWear === 'object') ? data.rockWear : {};
    G.torpRefund = data.torpRefund || 0;
    G.sabotage = (data.sabotage && typeof data.sabotage === 'object') ? data.sabotage : {};
    /* The system was entered above, before the trade book was back; put
     * the deliveries you bought off ships onto its shelves now. */
    if (global.ShipTrade && global.ShipTrade.attach && G.sys) global.ShipTrade.attach(G, G.sys, G.t || 0);
    G.captains = (data.captains && typeof data.captains === 'object') ? data.captains : {};
    G.people = (data.people && typeof data.people === 'object') ? data.people : {};
    G.tithe = (data.tithe && typeof data.tithe === 'object') ? data.tithe : {};
    G.firms = (data.firms && typeof data.firms === 'object' && Array.isArray(data.firms.contracts)) ? data.firms : null;
    G.record = (data.record && typeof data.record === 'object') ? data.record : null;
    G.broadcasts = Array.isArray(data.broadcasts) ? data.broadcasts : [];
    G.msgDraft = null;
    G.joined = (data.joined && typeof data.joined === 'object') ? data.joined : {};
    G.favourAsk = data.favourAsk || null;
    G.tipAt = data.tipAt == null ? null : data.tipAt;
    G._favourSlot = null;
    G.rumours = Array.isArray(data.rumours) ? data.rumours : [];
    /* A career from before rumours: what it had done by then was known
     * everywhere at once (the old public record), and stays known — the
     * rumours that run on the timetable start from here. */
    G.recordLegacy = data.recordLegacy ||
      (!Array.isArray(data.rumours) && G.record ? JSON.parse(JSON.stringify(G.record)) : null);
    G.hearsay = Array.isArray(data.hearsay) ? data.hearsay : [];
    G.rumourSeq = data.rumourSeq || 0;
    G._rumourSlot = null;
    G.ledgerLog = data.ledger || [];

    if (d.docked && G.sys.byId[d.docked]) {
      Sim.dockShip(s, G.sys.byId[d.docked], G.sys, G.t);
    } else {
      s.docked = null;
    }
    if (!s.docked && d.landedAt && G.sys.byId[d.landedAt.body] && Sim.updateLandedShip) {
      s.landed = true; s.crashed = false; s.landedOn = G.sys.byId[d.landedAt.body];
      s.landedAt = d.landedAt;
      /* Not yet stood on her gear in THIS session: main.js settles her on
       * the first frame, which gives a spot saved before 2026-11-03 (4 m up,
       * no fwdB) her stance and a heading in the world's turning frame. Until
       * then updateLandedShip takes the heading from the nose saved above. */
      s.settled = false;
      Sim.updateLandedShip(s, G.sys, G.t);
    }

    /* PICKING A CAREER UP IS NOT AN ARRIVAL, and the line below is the
     * whole of the fix for a bug that made loading your own save a crime.
     *
     * main.js detects a dock as the EDGE from not-docked to docked — which
     * is the right way to catch it, because there are two places a ship can
     * dock and only one of them is a call site. But newGame clears
     * wasDocked and restore then parks the ship on the clamps, so the very
     * next frame saw that edge and ran the arrival: contracts settled a
     * second time, the clamps banged, and — the part that actually broke a
     * career — Combat.arriveAtPort booked the player for arriving
     * UNANNOUNCED at a port they had been sitting in since before they
     * saved. That is a fine and a FUGITIVE flag, and a fugitive's ports do
     * not open, so loading a save could leave a mission impossible to
     * finish and every door in the system shut. Reported from a real
     * career, where it read — correctly — as the autopilot being broken.
     *
     * Sitting here rather than at the two call sites on purpose: restore is
     * the one function that puts a career back where it was, so it is the
     * one place that knows the ship did not fly here. The same guard is
     * why wasteCustoms only charges on arrival. */
    G.wasDocked = !!s.docked;
    return true;
  }

  /* ---- preferences -------------------------------------------------------
   * Settings are not career state: which way you like the grid or how loud
   * you want the drive follows YOU, not the ship you happen to be flying, so
   * they live under one global key and are deliberately absent from
   * snapshot(). Loading someone's old save must not reach into the options
   * and change them. */
  var PREFS_KEY = 'psg1|prefs';

  function loadPrefs() {
    var st = storage();
    if (!st) return null;
    try {
      var raw = st.getItem(PREFS_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      return (p && typeof p === 'object') ? p : null;
    } catch (e) { return null; }
  }

  function savePrefs(p) {
    var st = storage();
    if (!st) return false;
    try { st.setItem(PREFS_KEY, JSON.stringify(p || {})); return true; }
    catch (e) { return false; }
  }

  var Save = {
    snapshot: snapshot, store: store, load: load, clear: clear, restore: restore,
    loadPrefs: loadPrefs, savePrefs: savePrefs,
    SLOT_COUNT: SLOT_COUNT,
    DEPRECATED: DEPRECATED, slots: slots, readSlot: readSlot,
    writeSlot: writeSlot, clearSlot: clearSlot, autoLabel: autoLabel, describe: describe
  };
  global.Save = Save;
  if (typeof module !== 'undefined' && module.exports) module.exports = Save;
})(typeof window !== 'undefined' ? window : globalThis);
