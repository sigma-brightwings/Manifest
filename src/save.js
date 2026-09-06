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

  /* Still 1, and it must stay 1 for as long as changes are ADDITIVE.
   * readSlot and load both discard a payload whose version does not match
   * exactly, so bumping this does not migrate old saves — it deletes them.
   * The slot/equipment change adds a `fit` field and leaves the four legacy
   * weapon fields in place; Combat.migrateFit rebuilds a fit from those
   * when it is absent, so a pre-slot career loads with its gear intact.
   * Bump this only for a change that genuinely cannot be read forward. */
  var VERSION = 1;

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
      ship: {
        pos: s.pos, vel: s.vel, fwd: s.fwd, up: s.up, right: s.right,
        fuel: s.fuel, thrusterFuel: s.thrusterFuel,
        cargo: s.cargo, credits: s.credits,
        docked: s.docked || null,
        hullId: s.hullId, hullHp: s.hullHp,
        /* The four legacy fields are still written, and deliberately so:
         * they are what an older build would read if a save travelled
         * backwards, and they cost four strings. `fit` is the truth. */
        gun: s.gun, turret: s.turret, shield: s.shield,
        heatshield: s.heatshield,
        shieldHp: s.shieldHp, missiles: s.missiles, sinks: s.sinks,
        fit: s.fit || {},
        /* Named things belong to the pilot, not the hull. */
        reg: s.reg || null, shipName: s.shipName || null
      },
      pilotName: G.pilotName || null,
      standing: G.standing || {},
      /* Blown console screens are damage, not a display preference: they
       * cost money to put right, so they have to survive closing the tab
       * the same way a dented hull does. */
      deadPanels: G.deadPanels || {},
      wanted: G.wanted || {},
      missions: G.missions || [],
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
    s.cargo = d.cargo || {}; s.credits = d.credits;
    s.hullId = d.hullId; s.hullHp = d.hullHp;
    s.gun = d.gun; s.turret = d.turret; s.shield = d.shield;
    s.heatshield = d.heatshield || null;
    s.shieldHp = d.shieldHp || 0; s.missiles = d.missiles || 0;
    s.sinks = d.sinks || 0;
    if (d.reg) s.reg = d.reg;
    s.shipName = d.shipName || null;
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
    }
    Sim.refreshShip(s);

    G.standing = data.standing || {};
    G.deadPanels = data.deadPanels || {};
    G.wanted = data.wanted || {};
    G.missions = data.missions || [];
    G.doneMissions = data.doneMissions || {};
    G.campaigns = data.campaigns || {};
    G.ledgerLog = data.ledger || [];

    if (d.docked && G.sys.byId[d.docked]) {
      Sim.dockShip(s, G.sys.byId[d.docked], G.sys, G.t);
    } else {
      s.docked = null;
    }
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
    SLOT_COUNT: SLOT_COUNT, slots: slots, readSlot: readSlot,
    writeSlot: writeSlot, clearSlot: clearSlot, autoLabel: autoLabel, describe: describe
  };
  global.Save = Save;
  if (typeof module !== 'undefined' && module.exports) module.exports = Save;
})(typeof window !== 'undefined' ? window : globalThis);
