/* devharness.js — the developer's panel (2026-11-23).
 *
 * Astra: "Give me some kind of game harness so I can debug features without
 * playing all the way to them. Not cheat codes but a developer interface."
 *
 * ON ONLY IN A DEVELOPER'S BUILD. The page has to be opened with `?dev`
 * (index.html?dev=1): the Electron dev shell does that by itself (it is not
 * packaged), `electron . --dev` does it for a packaged-style run, and a
 * browser does it when you add it to the address. The released game never
 * opens it, so there is nothing for a player to find: no key, no code.
 *
 * ` (the key left of 1) opens and closes it. While a field in it has the
 * keyboard the game hears nothing, so typing a star's name does not fly the
 * ship. What it does, every part of it through the game's own functions:
 *
 *   - WHERE YOU ARE: system, port, hull and integrity, the deck, the room
 *     and its compartment number, x/z, frames a second.
 *   - SHIP: become any hull (the Crawler in any livery), with or without a
 *     crew, docked where you are.
 *   - ABOARD: stand up; go to any room on any deck of her, by its name and
 *     number; and check her decks (every room reachable from her airlock,
 *     at sea, at general quarters, at GQ with the tram out).
 *   - WORLD: go to any star by name, dock at any port in the system, launch.
 *   - STATE: hull integrity (what the tram's battery rule reads), credits.
 *
 * Nothing it does is saved specially: what it changes is the career's own
 * state, so a save made after using it is a save of that state. Use a
 * scratch career (the probe tools already run with a scratch profile). */
(function (global) {
  'use strict';
  var loc = global.location;
  var on = !!(loc && /[?&]dev(=|&|$)/.test(loc.search || ''));
  var H = { on: on };
  global.DevHarness = H;
  if (!on || !global.document) return;

  var doc = global.document, panel = null, out = null, open = false, timer = null;
  function G() { return global.Game; }
  function log(s) {
    if (!out) return;
    var line = doc.createElement('div');
    line.textContent = s;
    out.insertBefore(line, out.firstChild);
    while (out.childNodes.length > 40) out.removeChild(out.lastChild);
  }
  H.log = log;

  /* ---- the game's own handles ------------------------------------------ */
  function ship() { var g = G(); return g && g.ship; }
  function plan() { var g = G(); return g && g.walk && g.walk.plan ? (g.walk.plan.ship || g.walk.plan) : null; }
  function interior() {
    var s = ship(), R = global.Render;
    return s && R && R.shipInterior ? R.shipInterior(s) : null;
  }
  function standUp() {
    var g = G(), dev = global.GameDev;
    if (g.walk) return true;
    if (!dev || !dev.startShipWalk) { log('no GameDev.startShipWalk'); return false; }
    dev.startShipWalk('seat');
    return !!g.walk;
  }

  /* Become a hull: as the probes do it (tools/probe-naval.js). */
  function become(hullId, livery, crew) {
    var g = G(), C = global.Combat, h = C && C.HULLS[hullId];
    if (!h) { log('no hull ' + hullId); return; }
    g.walk = null;
    var s = g.ship;
    s.hullId = hullId; s.dryMass = h.dryMass; s.turret = null; s._deck = null; s._cockpit = null;
    if (hullId === 'crawler') s.livery = livery === 'civ' ? null : livery; else s.livery = null;
    if (s.hullMax !== undefined && h.hullMax) { s.hullMax = h.hullMax; s.hullHp = h.hullMax; }
    if (crew && global.Crew && global.Crew.crewNeeded) {
      var need = global.Crew.crewNeeded(hullId, true), list = [], n = 0;
      ['pilot', 'engineer', 'gunner', 'medic'].forEach(function (role) {
        for (var i = 0; i < (need[role] || 0); i++) {
          list.push({ id: 'dev|' + role + i, name: 'Dev ' + role + ' ' + (i + 1), role: role, rating: 3, paidTo: g.t });
          n++;
        }
      });
      s.crew = list;
      log('crew: ' + n);
    }
    log('now a ' + (h.name || hullId) + (hullId === 'crawler' ? ' (' + (livery || 'civ') + ')' : ''));
  }

  /* Somewhere to stand in a room: its middle, or the nearest spot to it
   * walk.js will stand you on. */
  function spotIn(dp, r) {
    var W = global.Walk, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (!W || W.standable(dp, cx, cz)) return [cx, cz];
    for (var d = 0.25; d < 6; d += 0.25) {
      for (var a = 0; a < 16; a++) {
        var x = cx + Math.cos(a / 16 * Math.PI * 2) * d, z = cz + Math.sin(a / 16 * Math.PI * 2) * d;
        if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && W.standable(dp, x, z)) return [x, z];
      }
    }
    return [cx, cz];
  }
  function goTo(deck, roomId) {
    if (!standUp()) return;
    var g = G(), whole = plan();
    if (!whole) { log('not aboard'); return; }
    var dp = whole.decks ? whole.decks[deck] : whole;
    var r = whole.rooms.filter(function (q) { return q.id === roomId; })[0];
    if (!dp || !r) { log('no such room'); return; }
    var at = spotIn(dp, r);
    g.walk.plan = dp; g.walk.deck = dp.deck; g.walk.x = at[0]; g.walk.z = at[1];
    g.walk.ride = null; g.walk.rideDy = 0; g.walk.dy = 0; g.walk.outside = false;
    log('→ ' + roomName(r) + ' (' + deckName(whole, deck) + ')');
  }
  function roomName(r) { return (r.label || r.sub || r.kind || r.id).trim(); }
  function deckName(whole, dk) {
    return (whole.deckName && whole.deckName[dk]) || (global.ShipDeck && global.ShipDeck.DECK_NAME[dk]) || dk;
  }

  /* Every room of her decks reachable from her airlock: at sea, at
   * general quarters, and at GQ with the tram out (navaldeck.js). */
  function checkDecks() {
    var d = interior(), N = global.NavalDeck;
    if (!d || !d.plan.naval || !N) { log('no naval decks on this hull'); return; }
    var L = d.plan.naval.layout, from = L.airlock || L.bridge;
    [['at sea', 'normal', 1], ['general quarters', 'zebra', 1], ['GQ, hull under 40 %', 'zebra', 0.3]].forEach(function (c) {
      var seen = N.reachable(L, from, c[1], null, c[2]);
      var miss = L.rooms.filter(function (r) { return r.walk !== false && !seen[r.id]; });
      log(c[0] + ': ' + (miss.length ? miss.length + ' rooms cut off: ' + miss.slice(0, 4).map(function (r) { return r.comp || r.id; }).join(', ') : 'every room reachable'));
    });
    var nv = d.plan.naval;
    log('fitted: ' + (nv.narrowed || []).length + ' narrowed, ' + (nv.lowered || []).length + ' lowered, ' + (nv.dropped || []).length + ' dropped, ' +
        (nv.misfit || []).length + ' outside her');
  }

  /* ---- the world ---------------------------------------------------------- */
  function stars(q) {
    var g = G(), Gx = global.Galaxy;
    q = (q || '').toLowerCase();
    return g.galaxy.stars.filter(function (s) { return !q || String(s.name || '').toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return Gx.distance3(a, g.here) - Gx.distance3(b, g.here); }).slice(0, 12);
  }
  function enterStar(id) {
    var g = G(), st = g.galaxy.stars.filter(function (s) { return String(s.id) === String(id); })[0];
    if (!st) return;
    g.walk = null;
    if (g.ship.docked) global.Sim.undockShip(g.ship, g.sys, g.t, 0.003);
    g.enterSystem(st, { fresh: true });
    log('→ ' + st.name);
  }
  function ports() {
    var g = G();
    return ((g.sys && g.sys.bodies) || []).filter(function (b) { return b.market; });
  }
  function dockAt(id) {
    var g = G(), b = ports().filter(function (p) { return String(p.id) === String(id); })[0];
    if (!b) return;
    g.walk = null;
    if (g.ship.docked) global.Sim.undockShip(g.ship, g.sys, g.t, 0.003);
    global.Sim.dockShip(g.ship, b, g.sys, g.t);
    log('docked at ' + b.name);
  }
  function launch() {
    var g = G();
    if (!g.ship.docked) { log('not docked'); return; }
    g.walk = null;
    global.Sim.undockShip(g.ship, g.sys, g.t, 0.003);
    log('launched');
  }

  /* ---- the panel ---------------------------------------------------------- */
  var CSS = [
    '#devh{position:fixed;top:44px;right:8px;width:360px;max-height:calc(100vh - 120px);overflow:auto;z-index:99999;',
    'background:rgba(8,12,18,.94);color:#cfe3f4;font:12px/1.4 Consolas,monospace;border:1px solid #2f4a63;padding:8px 10px;}',
    '#devh h4{margin:10px 0 4px;color:#7fd6c0;font-size:12px;letter-spacing:.06em;}',
    '#devh select,#devh input,#devh button{font:12px Consolas,monospace;background:#132030;color:#dfefff;border:1px solid #34506b;margin:2px 2px 2px 0;padding:2px 5px;}',
    '#devh button:hover{background:#1d3246;cursor:pointer}',
    '#devh .st{white-space:pre;color:#e8f2fb;background:#0c1622;padding:4px;border:1px solid #1f3346}',
    '#devh .log{color:#9fb8cc;max-height:150px;overflow:auto;border-top:1px solid #23394e;margin-top:6px;padding-top:4px}',
    '#devh .tag{float:right;color:#ffb86b}'
  ].join('');
  function el(tag, attrs, kids) {
    var e = doc.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === 'on') for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function opt(v, t) { var o = el('option', { value: v, text: t }); return o; }

  var st = null, hullSel, livSel, crewChk, deckSel, roomSel, starIn, starSel, portSel, hullIn, credIn;
  function build() {
    var style = el('style', { text: CSS });
    doc.head.appendChild(style);
    st = el('div', { 'class': 'st' });
    hullSel = el('select');
    Object.keys(global.Combat.HULLS).sort().forEach(function (id) { hullSel.appendChild(opt(id, id + ' — ' + (global.Combat.HULLS[id].name || ''))); });
    livSel = el('select', {}, [opt('civ', 'civilian'), opt('navy', 'navy'), opt('syn', 'syndicate')]);
    crewChk = el('input', { type: 'checkbox', checked: 'checked' });
    deckSel = el('select', { on: { change: fillRooms } });
    roomSel = el('select');
    starIn = el('input', { placeholder: 'star name', size: 14, on: { input: fillStars } });
    starSel = el('select');
    portSel = el('select');
    hullIn = el('input', { type: 'range', min: 0, max: 100, value: 100, on: { input: function () { setHull(+hullIn.value); } } });
    credIn = el('input', { type: 'number', value: 1000000, style: 'width:110px' });
    out = el('div', { 'class': 'log' });
    panel = el('div', { id: 'devh' }, [
      el('span', { 'class': 'tag', text: 'DEV' }),
      el('div', { text: 'Developer harness  ·  ` to close' }),
      st,
      el('h4', { text: 'SHIP' }),
      hullSel, livSel, el('label', { text: ' crew ' }), crewChk,
      el('button', { text: 'Become', on: { click: function () { become(hullSel.value, livSel.value, crewChk.checked); refresh(true); } } }),
      el('h4', { text: 'ABOARD' }),
      el('button', { text: 'Stand up', on: { click: function () { standUp(); refresh(true); } } }),
      el('button', { text: 'Refresh decks', on: { click: function () { refresh(true); } } }),
      el('button', { text: 'Check decks', on: { click: checkDecks } }),
      el('br'), deckSel, el('br'), roomSel,
      el('button', { text: 'Go', on: { click: function () { goTo(deckSel.value, roomSel.value); } } }),
      el('h4', { text: 'WORLD' }),
      starIn, starSel, el('button', { text: 'Go to star', on: { click: function () { enterStar(starSel.value); refresh(true); } } }),
      el('br'), portSel, el('button', { text: 'Dock', on: { click: function () { dockAt(portSel.value); refresh(true); } } }),
      el('button', { text: 'Launch', on: { click: launch } }),
      el('h4', { text: 'STATE' }),
      el('label', { text: 'hull % ' }), hullIn,
      el('br'), el('label', { text: 'credits ' }), credIn,
      el('button', { text: 'Set', on: { click: function () { G().ship.credits = +credIn.value || 0; log('credits ' + G().ship.credits); } } }),
      out
    ]);
    /* The game listens on the window; a field in here keeps its keys. */
    panel.addEventListener('keydown', function (e) { if (e.key !== '`') e.stopPropagation(); });
    panel.addEventListener('keyup', function (e) { e.stopPropagation(); });
    doc.body.appendChild(panel);
  }
  function setHull(pct) {
    var s = ship();
    if (!s || !s.hullMax) return;
    s.hullHp = s.hullMax * pct / 100;
    log('hull ' + pct + ' %');
  }
  function fillRooms() {
    var whole = plan() || (interior() || {}).plan;
    roomSel.innerHTML = '';
    if (!whole) return;
    var dk = deckSel.value;
    whole.rooms.filter(function (r) { return (whole.decks ? r.deck === dk : true) && r.walk !== false; })
      .sort(function (a, b) { return b.z1 - a.z1; })
      .forEach(function (r) { roomSel.appendChild(opt(r.id, roomName(r))); });
  }
  function fillStars() {
    starSel.innerHTML = '';
    stars(starIn.value).forEach(function (s) { starSel.appendChild(opt(s.id, s.name)); });
  }
  function refresh(lists) {
    var g = G();
    if (!g || !g.ship) return;
    var s = g.ship, w = g.walk, whole = plan() || (interior() || {}).plan;
    var room = w && global.Walk ? global.Walk.roomAt(w.plan, w.x, w.z) : null;
    var port = s.docked && g.sys ? (g.sys.bodies.filter(function (b) { return b.id === s.docked; })[0] || {}).name : null;
    st.textContent = [
      'system  ' + (g.here ? g.here.name : '-') + (port ? '   docked: ' + port : ''),
      'ship    ' + s.hullId + (s.livery ? ' (' + s.livery + ')' : '') + '   hull ' + (s.hullMax ? Math.round(100 * s.hullHp / s.hullMax) + ' %' : '-'),
      'aboard  ' + (w ? (whole && whole.decks ? deckName(whole, w.plan.deck || 'main') : 'her deck') : 'seated / flying'),
      'room    ' + (room ? roomName(room) : '-'),
      'at      ' + (w ? 'x ' + w.x.toFixed(2) + '  z ' + w.z.toFixed(2) + '  floor ' + (w.plan.floorY || 0).toFixed(2) : '-'),
      'fps     ' + Math.round(g.fps || 0)
    ].join('\n');
    if (!lists) return;
    hullSel.value = s.hullId; livSel.value = s.livery || 'civ';
    deckSel.innerHTML = '';
    if (whole) {
      (whole.decks ? (whole.deckAll || whole.deckOrder || Object.keys(whole.decks)) : ['main']).forEach(function (dk) {
        if (whole.decks && !whole.decks[dk]) return;
        deckSel.appendChild(opt(dk, deckName(whole, dk)));
      });
    }
    if (w && whole && whole.decks && w.plan.deck) deckSel.value = w.plan.deck;
    fillRooms();
    fillStars();
    portSel.innerHTML = '';
    ports().forEach(function (b) { portSel.appendChild(opt(b.id, b.name)); });
  }
  function toggle() {
    if (!panel) build();
    open = !open;
    panel.style.display = open ? 'block' : 'none';
    if (open) { refresh(true); timer = setInterval(function () { refresh(false); }, 250); }
    else { clearInterval(timer); if (doc.activeElement && panel.contains(doc.activeElement)) doc.activeElement.blur(); }
  }
  function after(fn) { return function () { var r = fn.apply(null, arguments); if (open) refresh(true); return r; }; }
  become = after(become); goTo = after(goTo);
  H.toggle = toggle; H.become = become; H.goTo = goTo; H.checkDecks = checkDecks; H.dockAt = dockAt; H.enterStar = enterStar;
  /* ` opens and closes it — first, before the game hears the key. */
  global.addEventListener('keydown', function (e) {
    if (e.key === '`' || e.code === 'Backquote') { toggle(); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
})(typeof window !== 'undefined' ? window : globalThis);
