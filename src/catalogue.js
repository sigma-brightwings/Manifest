/* catalogue.js - every thing in the game, one entry each, for the in-game
 * catalogue page (2026-11-12).
 *
 * Astra: "can you launch the game with the market screen open and every
 * single item selectable and with its description in place, and the icon,
 * rotating as it is designed to do? My wife wants a sort of gameopedia; and
 * that's something I think players will want also." Then: "let's do the full
 * catalogue and tie it in to the help screen."
 *
 * READ STRAIGHT FROM THE LIVE TABLES, never a copy. The same rule
 * tools/catalogue.cjs follows, and for the same reason: a catalogue that is
 * maintained by hand is a catalogue that lies by the second patch. Add a gun
 * to Combat.GUNS and it is in here, with its numbers and its copy, without
 * anybody remembering to come back.
 *
 * WHAT IS LEFT OUT, DELIBERATELY. An `unlisted` item is one whose whole
 * point is that it cannot be bought - the forged transponder, the shielded
 * array that is a guild reward. Printing those in a reference page would
 * hand the player the end of a chain he has not walked yet. So they appear
 * only once he actually has one, and then they appear for good.
 */
(function (global) {
  'use strict';

  function num(v) { return typeof v === 'number' && isFinite(v); }
  function fmt(v) { return num(v) ? String(Math.round(v * 100) / 100) : ''; }

  /* ---- THE GROUPS -------------------------------------------------------
   * By what a thing IS to a pilot, not by which table it happens to live
   * in: a gun and a turret hang on the same rail, a magnetometer and a
   * gravimeter are both something you point at a world. */
  var EQ_GROUP = {
    gun: 'weapons', turret: 'weapons',
    shield: 'defences', shroud: 'defences', ecm: 'defences',
    heatshield: 'defences', sinkrack: 'defences', decoyrack: 'defences',
    scanner: 'sensors', analyser: 'sensors', portanalyser: 'sensors',
    survey: 'sensors', magnet: 'sensors', gravity: 'sensors',
    cruisedrive: 'drives', slipslipdrive: 'drives', slipmildrive: 'drives',
    slipbaffle: 'drives', slipanchor: 'drives',
    reactor: 'fittings', transponder: 'fittings', hab: 'fittings',
    skimmer: 'fittings', scoop: 'fittings'
  };
  var GROUPS = [
    { id: 'weapons',   label: 'WEAPONS',    note: 'what hangs on a hardpoint' },
    { id: 'defences',  label: 'DEFENCES',   note: 'shields, shrouds and what you throw behind you' },
    { id: 'drives',    label: 'DRIVES',     note: 'cruise, slipspace, and the kit that quiets them' },
    { id: 'sensors',   label: 'SENSORS',    note: 'what you point at a world, a ship or a market' },
    { id: 'fittings',  label: 'FITTINGS',   note: 'power, papers, people and intakes' },
    { id: 'stores',    label: 'STORES',     note: 'spent when you use them' },
    { id: 'hulls',     label: 'HULLS',      note: 'the ships themselves' },
    { id: 'goods',     label: 'TRADE GOODS', note: 'what fills a hold, and what it is worth' },
    { id: 'modules',   label: 'STATION',    note: 'what a Crawler carries out and bolts down' }
  ];

  /* Does the player have one, so an unlisted item may be shown? */
  function owns(G, id) {
    if (!G) return true;                      // no career: a tool asking
    var s = G.ship;
    if (s && s.fittings && s.fittings.indexOf(id) >= 0) return true;
    if (G.seenItems && G.seenItems[id]) return true;
    /* Parked ships count: a thing you own is a thing you have seen. */
    var F = G.fleet;
    if (F && F.length) {
      for (var i = 0; i < F.length; i++) {
        var f = F[i];
        if (f && f.fittings && f.fittings.indexOf(id) >= 0) return true;
      }
    }
    return false;
  }

  /* ---- EQUIPMENT -------------------------------------------------------- */
  function equipment(G) {
    var C = global.Combat;
    if (!C || !C.EQUIPMENT) return [];
    var out = [], seen = {};
    Object.keys(C.EQUIPMENT).forEach(function (k) {
      var it = C.EQUIPMENT[k];
      /* EQUIPMENT carries legacy aliases pointing at the same object, so
       * key off the item's own id rather than the table key. */
      if (!it || !it.id || seen[it.id]) return;
      seen[it.id] = true;
      if (it.unlisted && !owns(G, it.id)) return;
      out.push({
        id: it.id, name: it.name || it.id, price: it.price,
        group: EQ_GROUP[it.kind] || 'fittings',
        kind: it.kind || '', eq: it, model: 'eq_' + it.id,
        slot: it.slot || '', grey: !!it.grey, unlisted: !!it.unlisted,
        prose: [it.pitch, it.blurb !== it.pitch ? it.blurb : null].filter(Boolean).join('  ')
      });
    });
    return out;
  }

  /* ---- STORES (spent when used) ---------------------------------------- */
  function stores(G) {
    var C = global.Combat, MD = global.MassDriver, out = [];
    if (!C) return out;
    Object.keys(C.MISSILES || {}).forEach(function (k) {
      var m = C.MISSILES[k];
      if (!m) return;
      var specs = [];
      if (num(m.dmg)) specs.push(['Damage', m.dmg + ' per hit']);
      if (num(m.range)) specs.push(['Range', m.range + ' km']);
      if (num(m.speed)) specs.push(['Speed', fmt(m.speed) + ' km/s']);
      out.push({ id: m.id || k, name: m.name || k, price: m.price, group: 'stores',
                 kind: 'missile', model: 'con_' + (m.id || k), specs: specs,
                 prose: [m.pitch, m.blurb !== m.pitch ? m.blurb : null].filter(Boolean).join('  ') });
    });
    if (C.DECOY) out.push({ id: 'decoy', name: 'Decoy charge', price: C.DECOY.price,
      group: 'stores', kind: 'decoy', model: 'con_decoy',
      specs: num(C.DECOY.life) ? [['Burns for', C.DECOY.life + ' s']] : [],
      prose: C.DECOY.pitch || '' });
    if (C.SINK) out.push({ id: 'sink', name: 'Heat sink charge', price: C.SINK.price,
      group: 'stores', kind: 'sink', model: 'con_sink',
      specs: num(C.SINK.heat) ? [['Dumps', C.SINK.heat + ' heat']] : [],
      prose: C.SINK.pitch || '' });
    if (MD && MD.SLUG_PRICE_T) out.push({ id: 'slugs', name: 'Driver slugs', price: MD.SLUG_PRICE_T,
      group: 'stores', kind: 'ammunition', model: 'con_slugs',
      specs: [['Sold by', 'the tonne'], ['Rounds', '40 per tonne'], ['Each', 'about 25 kg']],
      prose: 'Twenty-five kilos each. You will feel every one leave.' });
    return out;
  }

  /* ---- HULLS ----------------------------------------------------------- */
  function hulls() {
    var C = global.Combat;
    if (!C || !C.HULLS) return [];
    var out = [], seen = {};
    Object.keys(C.HULLS).forEach(function (k) {
      var h = C.HULLS[k], id = h && (h.id || k);
      if (!h || !id || seen[id]) return;
      seen[id] = true;
      var specs = [];
      if (h.size) specs.push(['Class', String(h.size)]);
      if (num(h.cargoCap)) specs.push(['Hold', h.cargoCap + ' t']);
      if (num(h.dryMass)) specs.push(['Dry mass', h.dryMass + ' t']);
      if (num(h.hullMax)) specs.push(['Hull', String(h.hullMax)]);
      if (num(h.thrustKN)) specs.push(['Thrust', h.thrustKN + ' kN']);
      if (num(h.fuelCap)) specs.push(['Jump fuel', h.fuelCap + ' t']);
      if (num(h.thrusterCap)) specs.push(['Reaction mass', h.thrusterCap + ' t']);
      if (num(h.crewMax)) specs.push(['Berths', String(h.crewMax)]);
      out.push({ id: id, name: h.name || id, price: h.price, group: 'hulls',
                 kind: 'hull', model: 'hull_' + id, hull: h, specs: specs,
                 prose: [h.pitch, h.blurb !== h.pitch ? h.blurb : null].filter(Boolean).join('  ') });
    });
    return out;
  }

  /* ---- TRADE GOODS ----------------------------------------------------- */
  /* CONTRABAND IS ITS OWN TABLE. Eco.CONTRABAND sits beside COMMODITIES
   * rather than inside it, so reading only the one list quietly dropped a
   * whole category of cargo off the page. Both, and the severity named:
   * what the ladder costs you is the single most useful thing a pilot
   * looking this up wants to know. */
  var SEVERITY_WORD = { 1: 'severity 1 - a fine and a black mark',
                        2: 'severity 2 - impounded, and they remember',
                        3: 'severity 3 - they will shoot' };

  function goods() {
    var Eco = global.Eco || global.Economy;
    if (!Eco || !Eco.COMMODITIES) return [];
    var list = Eco.COMMODITIES.concat(Eco.CONTRABAND || []);
    return list.map(function (c) {
      var specs = [];
      if (num(c.base)) specs.push(['Base price', c.base + ' cr/t']);
      if (c.tier !== undefined) specs.push(['Tier', String(c.tier)]);
      if (c.cat) specs.push(['Class', String(c.cat)]);
      if (c.fuel) specs.push(['Use', 'jump fuel']);
      if (c.contraband) {
        specs.push(['Carrying it', SEVERITY_WORD[c.severity] ||
                                   ('severity ' + (c.severity || '?'))]);
      }
      if (c.traits && c.traits.perishable) specs.push(['Keeps', 'badly - it is on a clock']);
      return { id: c.id, name: c.name || c.id, price: c.base, group: 'goods',
               kind: 'good', model: 'good_' + c.id, specs: specs,
               contraband: !!c.contraband, severity: c.severity || 0,
               prose: c.blurb || c.desc || c.pitch || '' };
    });
  }

  /* ---- STATION MODULES AND BAY CRAFT ----------------------------------- */
  function modules() {
    var Cn = global.Construction, out = [];
    if (!Cn) return out;
    (Cn.CRATES || []).forEach(function (m) {
      if (!m || !m.id) return;
      var specs = [];
      if (m.size) specs.push(['Size', String(m.size)]);
      if (num(m.days)) specs.push(['Builds in', m.days + (m.days === 1 ? ' day' : ' days')]);
      if (num(m.power)) specs.push(['Power', m.power + ' MW']);
      if (num(m.tonnes || m.mass)) specs.push(['Mass', (m.tonnes || m.mass) + ' t']);
      if (m.serves) specs.push(['Serves', [].concat(m.serves).join(', ')]);
      out.push({ id: m.id, name: m.name || m.id, price: m.price || m.cost, group: 'modules',
                 kind: 'crate', model: 'mod_' + m.id, specs: specs,
                 prose: m.blurb || m.pitch || m.about || '' });
    });
    Object.keys(Cn.CRAFT || {}).forEach(function (k) {
      var c = Cn.CRAFT[k], id = c && (c.id || k);
      if (!c || !id) return;
      var specs = [];
      if (c.size) specs.push(['Pad', 'class ' + c.size]);
      if (num(c.unpack) && c.unpack > 0) specs.push(['Unpacks crates', fmt(c.unpack) + ' per day']);
      if (num(c.ferry) && c.ferry > 0) specs.push(['Ferries crew', fmt(c.ferry) + ' per day']);
      if (!c.unpack && !c.ferry && c.kind) specs.push(['Kind', String(c.kind)]);
      if (num(c.mass)) specs.push(['Mass', c.mass + ' t']);
      out.push({ id: id, name: c.name || id, price: c.price || c.cost, group: 'modules',
                 kind: 'craft', model: 'mod_' + id, specs: specs,
                 prose: c.blurb || c.pitch || '' });
    });
    return out;
  }

  /* ---- THE WHOLE THING -------------------------------------------------
   * Groups in the order above, each with its entries sorted the way a
   * reader wants them: cheapest first inside a kind, so a ladder reads as
   * a ladder. */
  function all(G) {
    return equipment(G).concat(stores(G), hulls(), goods(), modules());
  }

  function groups(G) {
    var items = all(G), by = {};
    items.forEach(function (e) { (by[e.group] || (by[e.group] = [])).push(e); });
    return GROUPS.map(function (g) {
      var list = (by[g.id] || []).slice();
      list.sort(function (a, b) {
        if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
        var pa = num(a.price) ? a.price : 1e12, pb = num(b.price) ? b.price : 1e12;
        if (pa !== pb) return pa - pb;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      return { id: g.id, label: g.label, note: g.note, items: list };
    }).filter(function (g) { return g.items.length > 0; });
  }

  function find(G, id) {
    var items = all(G);
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function count(G) { return all(G).length; }

  /* Remember that the player has laid eyes on something, so an unlisted
   * item he has owned and sold stays in his reference. */
  function note(G, id) {
    if (!G || !id) return;
    G.seenItems = G.seenItems || {};
    G.seenItems[id] = 1;
  }

  var Catalogue = {
    GROUPS: GROUPS, EQ_GROUP: EQ_GROUP,
    equipment: equipment, stores: stores, hulls: hulls, goods: goods,
    modules: modules, all: all, groups: groups, find: find, count: count,
    note: note, owns: owns
  };
  global.Catalogue = Catalogue;
  if (typeof module !== 'undefined' && module.exports) module.exports = Catalogue;
})(typeof window !== 'undefined' ? window : globalThis);
