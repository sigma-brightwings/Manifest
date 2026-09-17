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
  var VERSION = 2;

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
        pos: s.pos, vel: s.vel, fwd: s.fwd, up: s.up, right: s.right,
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
        cargo: s.cargo, credits: s.credits,
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
        docked: s.docked || (s.arrival ? s.arrival.port : null),
        hullId: s.hullId, hullHp: s.hullHp,
        /* The four legacy fields are still written, and deliberately so:
         * they are what an older build would read if a save travelled
         * backwards, and they cost four strings. `fit` is the truth. */
        gun: s.gun, turret: s.turret, shield: s.shield,
        heatshield: s.heatshield,
        shieldHp: s.shieldHp, missiles: s.missiles, sinks: s.sinks,
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
        /* Additive, and absent from every save written before the cockpit
         * kit existed — those load with bornId null and cockpitSpec falls
         * back to the hull id, which is a stable seed too. So an old career
         * gets a consistent bridge, just not a uniquely flaired one. */
        bornId: s.bornId || null
      },
      pilotName: G.pilotName || null,
      standing: G.standing || {},
      /* Blown console screens are damage, not a display preference: they
       * cost money to put right, so they have to survive closing the tab
       * the same way a dented hull does. */
      deadPanels: G.deadPanels || {},
      wanted: G.wanted || {},
      /* How many times you have taken an occupied berth, per faction. Additive
         and NO version bump: an old career loads with none recorded, which is
         the right answer for a pilot who has never done it. */
      queueJumps: G.queueJumps || {},
      /* A witness who is mid-transmission when you save is still
       * mid-transmission when you load. Additive: an older save has no
       * field and comes back with nobody talking, which is the correct
       * reading of "this career predates witnesses being buyable". */
      pendingReport: G.pendingReport || null,
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
      doneMissions: G.doneMissions || {},
      campaigns: G.campaigns || {},
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
    s.fuel = d.fuel; s.thrusterFuel = d.thrusterFuel;
    s.milArmed = d.milArmed;
    s.crew = (d.crew || []).slice();
    s.wagesTo = (d.wagesTo == null) ? G.t : d.wagesTo;
    s.missileId = d.missileId; s.missileBatch = d.missileBatch;
    /* A save from before racks has none, and Combat.racksOf builds the one
     * rack its counter describes the first time anything asks — so the
     * absence is handled by leaving the field alone rather than by writing
     * an empty object over it, which would throw away the rounds. */
    if (d.racks) s.racks = d.racks;
    s.missileSeq = d.missileSeq;
    s.cargo = d.cargo || {}; s.credits = d.credits;
    s.passengers = d.passengers || 0;
    s.hullId = d.hullId; s.hullHp = d.hullHp;
    s.gun = d.gun; s.turret = d.turret; s.shield = d.shield;
    s.heatshield = d.heatshield || null;
    s.shieldHp = d.shieldHp || 0; s.missiles = d.missiles || 0;
    s.sinks = d.sinks || 0;
    if (d.reg) s.reg = d.reg;
    s.shipName = d.shipName || null;
    s.bornId = d.bornId || null;
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
    G.queueJumps = data.queueJumps || {};
    G.pendingReport = data.pendingReport || null;
    G.expelled = data.expelled || null;
    G.corruptionShift = (data.corruptionShift && typeof data.corruptionShift === 'object')
      ? data.corruptionShift : {};
    G.missions = data.missions || [];
    G.powers = data.powers || {};
    G.allegiance = data.allegiance || null;
    G.owed = data.owed || [];
    G.fleet = data.fleet || [];
    G.doneMissions = data.doneMissions || {};
    G.campaigns = data.campaigns || {};
    G.ledgerLog = data.ledger || [];

    if (d.docked && G.sys.byId[d.docked]) {
      Sim.dockShip(s, G.sys.byId[d.docked], G.sys, G.t);
    } else {
      s.docked = null;
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
