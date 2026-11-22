/* screens.js — the full-screen modes.
 *
 * Everything the display becomes when it stops being a windscreen: the
 * system survey, local navigation, comms, the inventory, the galaxy chart,
 * missions, the jump board, the aim settings and the manoeuvre planner.
 * Split out of main.js so the screens — the part of the interface that
 * grows every time the game does — have a file of their own.
 *
 * Nothing here reaches into main.js directly. main.js hands over one api
 * object at boot (Screens.bind) carrying the game state and the shared
 * drawing helpers, and the names below are unpacked from it so the code
 * that moved here reads exactly as it did before it moved. The dependency
 * points one way: main.js knows about Screens; Screens knows about the api
 * it was given and nothing else.
 */
(function (global) {
  'use strict';

  var V = global.V, K = global.Kepler, Sim = global.Sim,
      Render = global.Render, Eco = global.Economy, Galaxy = global.Galaxy,
      Combat = global.Combat, Missions = global.Missions, Arcs = global.Arcs,
      Gen = global.Gen, Fleet = global.Fleet, Crew = global.Crew;

  /* Wired by main.js at boot. Unpacked to bare names so the moved code is
   * byte-for-byte the code that was tested in its old home. */
  var refuelFromHold, milFuelFromHold;
  var G, say, selectPanel, hot, navList, navTargetState, navMark, jettison,
      heldCargo, openMarket, plottedCourse, jumpCandidates, doJump, complyWithDemand,
      hailAuthority, payOutstanding, hailSelected, exitTransfer, shipDealTrade,
      scopeBody, rows, panel, bodyDotColor, setMouseAim,
      fmtDist, fmtSpeed, fmtTime, fmtEpoch, fmtCredits, fmtLy, clipText,
      drawSystemPage, drawChartPage, drawOrbitPage, drawTargetPage,
      drawAutoPage, drawNodePage, drawShipPage, drawGunsPage, dash,
      RADAR_RANGE, MFD_W, MFD_H, MFD_INK, MFD_DIM, MFD_HOT, MFD_EDGE;

  function bind(api) {
    G = api.G;
    say = api.say; selectPanel = api.selectPanel; hot = api.hot;
    navList = api.navList; navTargetState = api.navTargetState;
    navMark = api.navMark; jettison = api.jettison; heldCargo = api.heldCargo;
    refuelFromHold = api.refuelFromHold;
    milFuelFromHold = api.milFuelFromHold;
    openMarket = api.openMarket;
    plottedCourse = api.plottedCourse; jumpCandidates = api.jumpCandidates;
    doJump = api.doJump; complyWithDemand = api.complyWithDemand;
    hailAuthority = api.hailAuthority; payOutstanding = api.payOutstanding;
    hailSelected = api.hailSelected;
    exitTransfer = api.exitTransfer;
    shipDealTrade = api.shipDealTrade;
    scopeBody = api.scopeBody; rows = api.rows; panel = api.panel;
    bodyDotColor = api.bodyDotColor; setMouseAim = api.setMouseAim;
    fmtDist = api.fmtDist; fmtSpeed = api.fmtSpeed; fmtTime = api.fmtTime;
    fmtEpoch = api.fmtEpoch; fmtCredits = api.fmtCredits; fmtLy = api.fmtLy;
    clipText = api.clipText;
    drawSystemPage = api.pages.system; drawChartPage = api.pages.chart;
    drawOrbitPage = api.pages.orbit; drawTargetPage = api.pages.target;
    drawAutoPage = api.pages.auto; drawNodePage = api.pages.node;
    drawShipPage = api.pages.ship; drawGunsPage = api.pages.guns;
    dash = api.dash;
    RADAR_RANGE = api.RADAR_RANGE;
    MFD_W = api.MFD_W; MFD_H = api.MFD_H;
    MFD_INK = api.MFD_INK; MFD_DIM = api.MFD_DIM;
    MFD_HOT = api.MFD_HOT; MFD_EDGE = api.MFD_EDGE;
  }

  /* ---- full-screen modes ------------------------------------------------
   * A mode owns the display from the top of the screen to the icon bar. The
   * ones built out of existing instrument pages compose them as tiles: each
   * page still draws into its own flat 460x178 space and still has no idea
   * how it is being shown, so a tile is a translate and a scale. */
  function tile(ctx, x, y, w, h, fn) {
    var s = Math.min(w / MFD_W, h / MFD_H);
    /* Top-aligned, not centred. A page has its own border, so letterboxing
     * it vertically reads as a panel floating in a gap rather than as a
     * panel; hanging it from the top of its slot puts the gap somewhere the
     * eye expects one. */
    ctx.save();
    var ox = x + (w - MFD_W * s) / 2;
    ctx.translate(ox, y);
    ctx.scale(s, s);
    /* The page also gets where it landed, so a page that has clickable
     * parts (the NAV card's tabs) can put its click targets on screen
     * rather than in its own 460x178 space. Pages that ignore it, ignore it. */
    fn(ctx, { ox: ox, oy: y, s: s });
    ctx.restore();
    return MFD_H * s;                 // how tall it actually came out
  }
  /* The height a tile of this width will occupy — so a caller can lay out
   * what comes after it without guessing. */
  function tileHeight(w) { return w * MFD_H / MFD_W; }

  /* The backdrop every mode sits on, plus its name. Solid, because a screen
   * you can see stars through is a screen you cannot read. */
  function modeFrame(ctx, w, bottom, title, hint) {
    ctx.save();
    var g = ctx.createLinearGradient(0, 0, 0, bottom);
    g.addColorStop(0, 'rgba(4,8,14,0.985)');
    g.addColorStop(1, 'rgba(3,6,11,0.995)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, bottom);

    ctx.fillStyle = '#0a2430';
    ctx.fillRect(0, 0, w, 30);
    ctx.strokeStyle = 'rgba(90,190,220,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 30.5); ctx.lineTo(w, 30.5); ctx.stroke();

    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(title, 16, 20);
    /* Where the title ends, for Halloway's lesson strip (main.js
     * drawTutorialCard), which is drawn later in the same frame across this
     * bar. It used to start at a fixed 170 px and so sat on any title
     * longer than COMMS — "GALAXY MAP & COURSE PLOTTER" lost everything
     * after "COU". The strip reads this and consumes it. */
    G.modeTitleRight = 16 + ctx.measureText(title).width;

    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#5d8fa4';
    ctx.textAlign = 'right';
    ctx.fillText(hint || 'Esc or F1 returns to the cockpit', w - 16, 20);
    ctx.textAlign = 'left';

    /* The two things the flight footer carried that a mode still needs. It
     * goes here because a mode owns the whole screen down to the icon bar,
     * and anything written at the bottom lands inside whatever the mode
     * drew there. */
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.5)';
    ctx.fillText('H help   ·   Esc back to the cockpit', 16, 44);
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(G.fps) + ' fps', w - 16, 44);
    ctx.textAlign = 'left';
    ctx.restore();
    return 48;
  }


  /* ======================================================================
   * FULL-SCREEN MODES
   * ====================================================================== */

  /* A button. Draws itself, registers itself, and reports whether the
   * pointer is over it — one call, so there is no way to draw a button that
   * does not work or wire up one that is not drawn. */
  /* ---- typing on a screen ------------------------------------------------
   * The first text entry this game has ever had. Everything else is keys
   * and hotspots, which is why this needs saying out loud:
   *
   *   WHILE A FIELD HAS FOCUS IT EATS THE ENTIRE KEYBOARD.
   *
   * Not most of it. All of it. Naming your ship "Wanderer" must not jettison
   * waste on the W, open the star map on the J, and switch to MFD page 5 on
   * a digit. editKey() therefore returns true for every key it sees, and
   * main.js consults it BEFORE the function-key and number-row handlers,
   * which run earlier than the per-mode ones and would otherwise steal
   * half the alphabet's worth of shortcuts.
   *
   * Escape abandons, Enter commits. There is no mouse caret and no
   * selection: this is a callsign box, not a word processor. */
  var EDIT = null;

  function beginEdit(spec) {
    EDIT = {
      label: spec.label || 'ENTRY',
      value: String(spec.value === undefined || spec.value === null ? '' : spec.value),
      max: spec.max || 24,
      allow: spec.allow || null,
      hint: spec.hint || '',
      commit: spec.commit || function () {}
    };
  }
  function editing() { return !!EDIT || !!NOTE; }
  function editState() { return EDIT; }
  function cancelEdit() { EDIT = null; NOTE = null; }

  function editKey(e) {
    if (NOTE) return notesKey(e);
    if (!EDIT) return false;
    var k = e.key;
    if (k === 'Escape') { EDIT = null; return true; }
    if (k === 'Enter') {
      var v = EDIT.value.replace(/\s+/g, ' ').trim();
      var fn = EDIT.commit;
      EDIT = null;
      fn(v);
      return true;
    }
    if (k === 'Backspace') { EDIT.value = EDIT.value.slice(0, -1); return true; }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && EDIT.value.length < EDIT.max) {
      var ch = EDIT.allow ? EDIT.allow(k) : k;
      if (ch) EDIT.value += ch;
      return true;
    }
    /* Everything else — arrows, function keys, Tab, digits past the cap —
     * is swallowed rather than passed on. See the note above. */
    return true;
  }

  /* ---- the notepad (F5 NOTES, journal.js) -------------------------------
   * The second text entry, and the first with more than one line. The same
   * rule as the field: while it has focus it takes the WHOLE keyboard. The
   * difference is Escape. Here it throws nothing away, because what you type
   * goes into G.notes as you type it — stopping is only stopping, and a
   * pilot who hits Esc out of habit does not lose a page of notes.
   *
   * The editing itself is Journal.noteKey, a pure function of {text,
   * caret}, so it is tested without a screen. This keeps where the caret is
   * and whether the view should follow it. */
  var NOTE = null;

  function beginNotes(caret) {
    if (!global.Journal) return;
    var len = String(G.notes || '').length;
    NOTE = { caret: caret == null ? len : Math.max(0, Math.min(len, caret)),
             cols: 60, rows: 10, goalCol: null, follow: true };
  }
  function writingNotes() { return !!NOTE; }
  function stopNotes() { NOTE = null; }

  function notesKey(e) {
    var J = global.Journal;
    if (!J) { NOTE = null; return true; }
    var st = { text: String(G.notes || ''), caret: NOTE.caret, cols: NOTE.cols,
               rows: NOTE.rows, goalCol: NOTE.goalCol, max: J.NOTES_MAX };
    var r = J.noteKey(st, e);
    if (r === 'done') { NOTE = null; return true; }
    if (r === 'paste') {
      /* The clipboard is asynchronous, and main.js has already cancelled
       * the key (so no paste event comes). Read it, and insert wherever the
       * caret is by the time it arrives. */
      var nav = global.navigator;
      if (nav && nav.clipboard && nav.clipboard.readText) {
        nav.clipboard.readText().then(function (txt) {
          if (!NOTE) return;
          var s2 = { text: String(G.notes || ''), caret: NOTE.caret, max: J.NOTES_MAX };
          J.insert(s2, txt);
          J.setNotes(G, s2.text);
          NOTE.caret = s2.caret; NOTE.follow = true;
        }, function () { say('The clipboard would not give that up', 3); });
      }
      return true;
    }
    if (st.text !== G.notes) J.setNotes(G, st.text);
    NOTE.caret = st.caret; NOTE.goalCol = st.goalCol; NOTE.follow = true;
    return true;
  }

  /* Draws the field wherever the caller wants it, with a blinking caret so
   * it is obvious the keyboard has gone somewhere. */
  function drawEditField(ctx, x, y, w, h) {
    if (!EDIT) return;
    ctx.save();
    ctx.fillStyle = 'rgba(8,26,34,0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffd36b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText(EDIT.label, x + 8, y + 13);

    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillStyle = '#ffffff';
    var shown = EDIT.value;
    var caret = (Math.floor(Date.now() / 450) % 2) ? '_' : ' ';
    ctx.fillText(clipText(shown, Math.floor((w - 20) / 8.58)) + caret, x + 8, y + 31);

    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(EDIT.hint || 'Enter accepts  ·  Esc cancels', x + w - 8, y + 31);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /* ---- scrolling ---------------------------------------------------------
   * One region at a time, rebuilt each frame like a hotspot. The wheel is
   * routed here from main.js before it reaches the camera zoom, so pointing
   * at a list and rolling the wheel scrolls the list rather than flying the
   * camera backwards out of the cockpit. */
  var SCROLL = null;

  function setScrollRegion(x, y, w, h, scrollBy) {
    SCROLL = { x: x, y: y, w: w, h: h, scrollBy: scrollBy };
  }

  function wheelAt(px, py, deltaY) {
    if (!SCROLL) return false;
    if (px < SCROLL.x || px > SCROLL.x + SCROLL.w) return false;
    if (py < SCROLL.y || py > SCROLL.y + SCROLL.h) return false;
    SCROLL.scrollBy(deltaY > 0 ? 1 : -1);
    return true;
  }

  /* Track, thumb, and click-above-or-below to page. Drawn only when there
   * is actually something out of view: a scrollbar on a list that fits is
   * a lie about the length of the list. */
  function drawScrollbar(ctx, x, y, w, h, total, perPage, pos, setPos) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,26,34,0.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(74,151,176,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    var maxPos = Math.max(1, total - perPage);
    var thumbH = Math.max(18, h * Math.min(1, perPage / total));
    var ty = y + (h - thumbH) * (Math.max(0, Math.min(maxPos, pos)) / maxPos);
    ctx.fillStyle = '#4a97b0';
    ctx.fillRect(x + 1.5, ty + 1, w - 3, thumbH - 2);
    ctx.restore();

    if (ty - y > 2) hot(x, y, w, ty - y, function () { setPos(pos - perPage); }, 'page up');
    var belowY = ty + thumbH, belowH = y + h - belowY;
    if (belowH > 2) hot(x, belowY, w, belowH, function () { setPos(pos + perPage); }, 'page down');
  }

  function btn(ctx, x, y, w, h, label, fn, opts) {
    opts = opts || {};
    var over = G.cursor.active && G.cursor.x >= x && G.cursor.x <= x + w &&
               G.cursor.y >= y && G.cursor.y <= y + h;
    var off = opts.disabled;
    ctx.save();
    ctx.fillStyle = off ? 'rgba(14,20,28,0.7)'
                  : over ? '#16505f'
                  : (opts.hot ? 'rgba(70,40,14,0.9)' : 'rgba(12,32,42,0.9)');
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = off ? 'rgba(74,151,176,0.25)'
                    : (opts.hot ? '#ffb86b' : (over ? '#b4f0ff' : 'rgba(74,151,176,0.6)'));
    ctx.lineWidth = over && !off ? 1.5 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.font = (opts.bold ? 'bold ' : '') + (opts.font || 11) + 'px ui-monospace, monospace';
    ctx.fillStyle = off ? '#3d5b68' : (opts.hot ? '#ffd36b' : (over ? '#ffffff' : '#b4f0ff'));
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + (opts.font ? opts.font : 11) * 0.36);
    ctx.textAlign = 'left';
    ctx.restore();
    if (!off) hot(x, y, w, h, fn, label);
    return over;
  }

  /* Section heading inside a mode screen. */
  function modeHead(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = color || '#5d8fa4';
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.restore();
    return y + 8;
  }

  /* --- F2: system information -------------------------------------------
   * What the survey says about where you are, at the size the survey
   * deserves. The three instrument pages that answered pieces of this
   * question are still the source; they are just no longer fighting for one
   * 460-pixel slot. */
  function drawSystemScreen(ctx, w, bottom) {
    var top = modeFrame(ctx, w, bottom, 'SYSTEM INFORMATION — ' + G.sys.name);
    var pad = 14;
    var colW = (w - pad * 3) / 2;
    var rowH = Math.min(tileHeight(colW), (bottom - top - pad * 3) / 2);

    tile(ctx, pad, top + pad, colW, rowH, drawSystemPage);
    tile(ctx, pad * 2 + colW, top + pad, colW, rowH, drawChartPage);
    tile(ctx, pad, top + pad * 2 + rowH, colW, rowH, drawOrbitPage);

    /* The bodies, in a list, because the instrument pages only ever showed
     * counts and the one thing you want from a survey is the manifest. */
    var lx = pad * 2 + colW, ly = top + pad * 2 + rowH;
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(lx, ly, colW, rowH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(lx + 2, ly + 2, colW - 4, rowH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(lx + 4, ly + 4, colW - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('BODIES', lx + 10, ly + 18);
    ctx.restore();

    var list = G.sys.bodies;
    var lines = Math.floor((rowH - 36) / 14);
    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    for (var i = 0; i < Math.min(list.length, lines); i++) {
      var b = list[i], yy = ly + 38 + i * 14;
      ctx.fillStyle = bodyDotColor(b.kind);
      ctx.fillText(navMark({ kind: 'body', obj: b }), lx + 10, yy);
      ctx.fillStyle = b.habitable ? '#7dffb0' : MFD_INK;
      ctx.fillText(clipText(b.name, 22), lx + 24, yy);
      ctx.fillStyle = MFD_DIM;
      ctx.textAlign = 'right';
      ctx.fillText(b.typeName || b.kind, lx + colW - 12, yy);
      ctx.textAlign = 'left';
      /* Clicking a body locks it. The survey and the nav lock were always
       * the same question asked twice. */
      hot(lx + 6, yy - 11, colW - 12, 14, (function (body) {
        return function () {
          G.navTarget = { kind: 'body', id: body.id };
          say('Locked ' + body.name, 2);
        };
      })(b));
    }
    if (list.length > lines) {
      ctx.fillStyle = MFD_DIM;
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillText('+' + (list.length - lines) + ' more', lx + 10, ly + rowH - 10);
    }
    ctx.restore();
  }

  /* THE SYSTEM YOU ARE IN, AS THE CHART WOULD SHOW IT (2026-10-19). Astra:
   * "slipspace chart info should be displayed for current system in the
   * nav menu. Stuff like what type of planet each of the bodies in order
   * from their star are." The jump chart already said this about
   * somewhere else — the survey rows, and the planets numbered out from
   * the star — and said nothing about here, which is the system you most
   * need it for.
   *
   * Pure: the planets, nearest the star first, each with its moons and
   * the ports that work it (on the planet, in orbit of it, or on or round
   * one of its moons — they all serve that world). */
  /* The manifest is a list like any other, and a black site is on none of
   * them until the coil has found it (main.js listed). */
  function shown(b) {
    if (!b || !b.classified) return true;
    return !global.Survey || !global.Survey.foundPort || global.Survey.foundPort(G, b);
  }

  function systemManifest(sys) {
    var bodies = sys.bodies || [];
    var planets = bodies.filter(function (b) { return b.kind === 'planet'; })
      .sort(function (a, b) { return ((a.orbit && a.orbit.a) || 0) - ((b.orbit && b.orbit.a) || 0); });
    var moonsOf = {}, portsOf = {};
    bodies.forEach(function (b) {
      if (b.kind === 'moon' && b.orbit) (moonsOf[b.orbit.parent] = moonsOf[b.orbit.parent] || []).push(b);
    });
    var hostOf = {};
    planets.forEach(function (p) {
      hostOf[p.id] = p.id;
      (moonsOf[p.id] || []).forEach(function (m) { hostOf[m.id] = p.id; });
    });
    (sys.ports || []).forEach(function (pt) {
      /* A berth nobody filed is not in anybody's count of berths. */
      if (!shown(pt)) return;
      var on = pt.parentBody ? pt.parentBody.id : (pt.orbit ? pt.orbit.parent : null);
      var world = on && hostOf[on];
      if (world) portsOf[world] = (portsOf[world] || 0) + 1;
    });
    return planets.map(function (p, i) {
      return { n: i + 1, body: p, typeName: p.typeName || p.type, composition: p.composition || null,
               habitable: !!p.habitable, zone: zoneTag(p), moons: (moonsOf[p.id] || []).length,
               ports: portsOf[p.id] || 0, atmosphere: !!p.atmosphere };
    });
  }

  /* Where on a world people can live, as the chart writes it. 'HZ' for a
   * world that is temperate all over; a twilight world names its strip,
   * because "habitable" alone would have you landing on the burning side. */
  function zoneTag(b) {
    if (!b || !b.habitable) return '';
    if (b.habitableBand === 'terminator') return 'HZ ring';
    if (b.habitableBand === 'equator') return 'HZ band';
    return 'HZ';
  }
  var BAND_NOTES = {
    terminator: 'Tidally locked: one face to the star, forever. Life holds to the twilight ring between the burning day and the frozen night, where the sun sits on the horizon.',
    equator: 'Lies on its side: each pole bakes for half the year and freezes for the other. Only the equator sees a sunrise every day, and that is where everyone lives.'
  };

  /* One world, as the chart would describe it: where it sits, what it is,
   * the air, how many moons and ports, the pull at the surface and the
   * length of its day, and — for a world in the habitable zone — what the
   * chart says about life and the people on it. Pure; the WORLD tab of the
   * NAV card draws exactly this. A moon is described against its planet. */
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function worldFacts(sys, body) {
    var list = systemManifest(sys);
    var star = sys.root || (sys.bodies || []).filter(function (b) { return b.kind === 'star'; })[0];
    var place, row = null;
    if (body.kind === 'moon' && body.orbit) {
      var parent = sys.byId ? sys.byId[body.orbit.parent] : null;
      place = 'moon of ' + (parent ? parent.name : 'its planet');
      for (var i = 0; i < list.length; i++) if (parent && list[i].body === parent) row = list[i];
    } else {
      for (var j = 0; j < list.length; j++) if (list[j].body === body) row = list[j];
      place = row ? ordinal(row.n) + ' of ' + list.length + ' from ' + (star ? star.name : 'the star') : '—';
    }
    var G0 = 9.80665e-3;
    var gSurf = (body.mu && body.radius) ? body.mu / (body.radius * body.radius) / G0 : null;
    var per = body.rotation && body.rotation.period;
    return {
      name: body.name,
      place: place,
      planetRow: row,                              // the planet this card belongs to, in the list
      typeName: body.typeName || body.type,
      habitable: !!body.habitable,
      zone: body.habitableBand === 'terminator' ? 'HZ · twilight ring'
          : body.habitableBand === 'equator' ? 'HZ · equator band'
          : body.habitable ? 'HZ' : '',
      air: body.composition || (body.atmosphere ? 'thin atmosphere' : 'no atmosphere'),
      moons: body.kind === 'planet' && row ? row.moons : 0,
      /* A moon's own docks, counted off her children: the manifest row is
       * her planet's, and every moon card used to say 0 whatever was there. */
      ports: body.kind === 'planet' ? (row ? row.ports : null)
           : (body.children || []).filter(function (c) { return c.docking || c.surface; }).length,
      gravity: gSurf,
      dayHours: per ? per / 3600 : null,
      retrograde: !!(per && per < 0),
      /* A locked planet's day IS its year, and the number of hours in it
       * is not the interesting fact; that it never ends is. */
      day: body.kind === 'planet' && body.tidallyLocked ? 'tidally locked' : null,
      tiltDeg: body.rotation ? body.rotation.tilt * 180 / Math.PI : null,
      /* Would anyone come here for the pleasure of it (appeal.js)? First,
       * because it is the line a passenger agent would read first. */
      appeal: global.Appeal ? global.Appeal.of(sys, body) : null,
      notes: [appealNote(sys, body), BAND_NOTES[body.habitableBand], body.lifeNote, body.cultureNote]
        .filter(function (s) { return !!s; })
    };
  }
  function appealNote(sys, body) {
    var A = global.Appeal, a = A ? A.of(sys, body) : null;
    if (!a) return null;
    var tier = a.tier.charAt(0).toUpperCase() + a.tier.slice(1);
    return 'For visitors: ' + tier + (a.why.length ? ' - ' + a.why.slice(0, 4).join(', ') : '') + '.';
  }

  /* --- F3: local navigation ---------------------------------------------
   * The list, the lock, the scope and the autopilot on one screen, because
   * every one of those is a different view of the same decision: where in
   * this system are you going next. */
  function drawNavScreen(ctx, w, bottom) {
    var top = modeFrame(ctx, w, bottom, 'LOCAL NAVIGATION',
                        '[ ] cycle   ·   T dock clamp   ·   Z cruise');
    var pad = 14;
    var listW = Math.min(420, w * 0.34);
    var colH = bottom - top - pad * 2;

    /* The nav list, at full height rather than eight visible rows. */
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(pad, top + pad, listW, colH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad + 2, top + pad + 2, listW - 4, colH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(pad + 4, top + pad + 4, listW - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('CONTACTS', pad + 10, top + pad + 18);
    ctx.restore();

    var list = navList();
    /* THE KEY (icons.js): every shape and what it means, under the list -
     * five to a row, room taken from the bottom of the list. */
    var Ick = global.Icons, keyRows = Ick ? Math.ceil(Ick.LEGEND.length / 5) : 0, keyH = keyRows * 16 + 10;
    var rowH = 16, avail = Math.floor((colH - 40 - keyH) / rowH);
    if (Ick) {
      ctx.save();
      ctx.font = 'bold 10px ui-monospace, monospace';
      var kx0 = pad + 12, ky0 = top + pad + colH - keyH + 4, kw = (listW - 24) / 5;
      ctx.strokeStyle = 'rgba(74,151,176,0.35)';
      ctx.beginPath(); ctx.moveTo(pad + 8, ky0 - 4); ctx.lineTo(pad + listW - 8, ky0 - 4); ctx.stroke();
      Ick.LEGEND.forEach(function (lg, li) {
        var kx = kx0 + (li % 5) * kw, ky = ky0 + 10 + Math.floor(li / 5) * 16;
        Ick.draw(ctx, lg[0], kx + 4, ky - 4, 4.4, '#b4f0ff');
        ctx.fillStyle = MFD_DIM;
        ctx.fillText(lg[1], kx + 13, ky);
      });
      ctx.restore();
    }
    var sel = -1, i;
    if (G.navTarget) {
      for (i = 0; i < list.length; i++) {
        if (list[i].kind === G.navTarget.kind && list[i].id === G.navTarget.id) { sel = i; break; }
      }
    }
    var first = 0;
    if (sel >= 0) first = Math.max(0, Math.min(list.length - avail, sel - Math.floor(avail / 2)));

    ctx.save();
    ctx.font = 'bold 13px ui-monospace, monospace';
    for (var r = 0; r < avail; r++) {
      var idx = first + r;
      if (idx >= list.length) break;
      var e = list[idx], yy = top + pad + 40 + r * rowH;
      if (idx === sel) {
        ctx.fillStyle = 'rgba(255,211,107,0.20)';
        ctx.fillRect(pad + 6, yy - 12, listW - 12, rowH);
      }
      /* A hull's colour says whose she is; a place keeps her flag's.
       * The selected row wins over both, because the one thing you must
       * never lose track of is which row you are on. */
      var ink = e.kind === 'ship' ? trackInk(e) : (e.hostile ? TRACK.hostile : e.color);
      if (idx === sel) ink = MFD_HOT;
      markAt(ctx, pad + 8, yy, e, ink);
      /* Clipped to the room the distance actually leaves, measured, not to
       * a fixed 24 characters — at a narrow window the two ran into each
       * other ("Coldwater Drove38,606 km"). */
      var distTxt = fmtDist(e.range);
      var nameRoom = listW - 12 - ctx.measureText(distTxt).width - 10 - 26;
      var nm = e.name;
      if (ctx.measureText(nm).width > nameRoom) {
        while (nm.length > 2 && ctx.measureText(nm + '.').width > nameRoom) nm = nm.slice(0, -1);
        nm += '.';
      }
      ctx.fillStyle = idx === sel ? MFD_HOT : (e.kind === 'ship' ? ink : MFD_INK);
      ctx.fillText(nm, pad + 26, yy);
      ctx.fillStyle = idx === sel ? MFD_HOT : MFD_DIM;
      ctx.textAlign = 'right';
      ctx.fillText(distTxt, pad + listW - 12, yy);
      ctx.textAlign = 'left';
      hot(pad + 6, yy - 12, listW - 12, rowH, (function (entry) {
        return function () { G.navTarget = { kind: entry.kind, id: entry.id }; };
      })(e));
    }
    ctx.restore();

    /* Right of the list, two columns rather than a grid: the two instrument
     * pages stacked at something close to their natural size, and the scope
     * given the full height beside them. Laid out as a 2x2 the pages came
     * out at half scale with a band of dead space under each — a tile is
     * only worth using at a size the page was drawn for. */
    var rx = pad * 2 + listW, rw = w - rx - pad;
    var pageW = Math.min(500, rw * 0.5);
    /* No room for the scope beside them: the pages take the whole column
     * instead of half of it and an empty half beside. Halved on a narrow
     * window they came out at 7 px type — the NAV card unreadable. */
    if (rw - pageW - pad < 200) pageW = Math.min(500, rw);
    var half = Math.min((colH - pad) / 2, tileHeight(pageW));
    tile(ctx, rx, top + pad, pageW, half, drawTargetPage);

    /* The NAV tile above is where the locked world's WORLD / SYSTEM card
     * lives on this screen, clickable (see drawWorldCard in main.js). */
    tile(ctx, rx, top + pad + half + pad, pageW, half, drawAutoPage);

    var sx = rx + pageW + pad, sw = w - sx - pad;
    if (sw < 200) return;
    var scopeH = colH;
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(sx, top + pad, sw, scopeH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 2, top + pad + 2, sw - 4, scopeH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(sx + 4, top + pad + 4, sw - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('SCOPE', sx + 10, top + pad + 18);
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.textAlign = 'right';
    if (sw > 330) ctx.fillText('0.75 AU  ·  nose up  ·  stalks show height', sx + sw - 10, top + pad + 18);
    ctx.textAlign = 'left';
    ctx.restore();
    scopeBody(ctx, sx + sw / 2, top + pad + 26 + (scopeH - 34) * 0.5,
              Math.min(sw / 2 - 30, 280), Math.min((scopeH - 60) * 0.42, 120));
  }

  /* --- F4: comms ---------------------------------------------------------
   * The directory of everyone in range you could talk to. The conversations
   * themselves are the next piece of work; what exists now is the channel
   * list, which is the part the rest of it hangs off. */
  /* A Syndicate by id, from wherever this system or the galaxy keeps it. */
  function syndicateOf(id) {
    return (G.galaxy && G.galaxy.factionById && G.galaxy.factionById[id]) ||
           (G.sys.factionById && G.sys.factionById[id]) || null;
  }
  /* Does this outlaw flag (the Syndicate or one of its bands) hold a port
   * in the current system? */
  function outlawHoldsHere(fid) {
    return (G.sys.ports || []).some(function (p) { return p && p.faction === fid; });
  }

  /* ---- WHAT A ROW IS, AT A GLANCE (2026-11-12) ---------------------------
   * Astra: "the ascii icons for the various places are difficult to
   * recognize as what they are at a glance. Stations should be in bold or
   * something, or an icon be made up that will fit beside them. Ships
   * should be in grey if neutral, green if friendly and red if hostile.
   * If unknown, the track shows up as white."
   *
   * Two changes, and they are doing different jobs:
   *
   *   THE MARK says WHAT it is. A star, a planet, a moon, a station, a
   *   pad, a hull, a call for help. These were single ASCII characters -
   *   '*', 'O', 'o', '#' - which are four marks that all read as "a
   *   small bright smudge" at twelve pixels in a column of forty rows.
   *   Drawn instead: a ringed dot is a star, a filled disc is a planet, a
   *   little one is a moon, a barred square is a station, a triangle on
   *   a line is a pad on a world. You can tell them apart without
   *   reading them.
   *
   *   THE COLOUR says WHOSE it is, and only for hulls. Grey is a hull
   *   with no opinion of you, green is one whose flag thinks well of
   *   you, red is one that would shoot, and white is one you cannot
   *   read: no flag, or running dark. That last one is the point of
   *   having it - white should be rare, and when it turns up it should
   *   be a question.
   *
   * Places keep their faction's colour, because whose dock it is matters
   * more than whether they like you today.
   */
  var TRACK = {
    hostile:  '#ff5a5a',
    friendly: '#7dffb0',
    /* Brighter than the game's disabled grey (#6a7d92) on purpose: a hull
     * with no opinion of you is not an unavailable one. */
    neutral:  '#aebecb',
    unknown:  '#e8f0f4'
  };
  /* Where the ordinary standing words change (Missions.standingLabel, and
   * combat.js's HUSH_FROM_STANDING). Warm is friendly; the hostile band is
   * the one the law already shoots over. */
  var TRACK_WARM = 10, TRACK_COLD = -40;

  /* The flag a hull actually answers to. A Syndicate runner sails from
   * somebody's port under somebody else's orders, and its transponder
   * says the second one - which is what the board you open next will say
   * too (generate.js buildRunners). */
  function trackFaction(s) {
    if (!s) return null;
    if (s.route && s.route.runner) return s.route.flag || null;
    if (s.faction) return s.faction;
    /* HER HOME BERTH'S FLAG. Ordinary traffic carries no faction of its
     * own - only the patrols do - so a freighter is of the flag over the
     * dock she sails from, which is what the port list, the customs
     * officer and the raid news all already assume. Without this, white
     * meant "a trader", which is the opposite of rare: measured at 159
     * of 166 hulls in one system. Origin first, then the far end, since
     * a ship on her return leg has them the other way round. */
    var r = s.route, by = G && G.sys && G.sys.byId;
    if (!r || !by) return null;
    var a = r.from && by[r.from], b = r.to && by[r.to];
    return (a && a.faction) || (b && b.faction) || null;
  }

  function trackInk(e) {
    if (!e) return TRACK.neutral;
    var s = e.obj;
    if (e.hostile || (s && s.hostile)) return TRACK.hostile;
    /* RUNNING DARK, or flying no flag at all. Either way you have a
     * contact and not an identity. */
    if (s && s.silent) return TRACK.unknown;
    var fid = trackFaction(s);
    if (!fid) return TRACK.unknown;
    var M = global.Missions;
    var st = M && M.standing ? M.standing(G, fid) : 0;
    if (st <= TRACK_COLD) return TRACK.hostile;
    if (st >= TRACK_WARM) return TRACK.friendly;
    return TRACK.neutral;
  }

  /* One mark, drawn rather than typed, in a 10 px box whose baseline is
   * the row's. `ink` is the row's colour so the mark and the name agree. */
  function markAt(ctx, x, y, e, ink) {
    var cx = x + 4, cy = y - 4;
    /* WHAT IT IS, by shape (icons.js, 2026-11-20): a port by who runs it
     * and what it does, a hull by her flag and trade. Anything icons.js
     * does not know keeps the mark below. */
    var Ic = global.Icons, ik = Ic ? Ic.kindOf(e, G.sys) : null;
    if (ik) { Ic.draw(ctx, ik, cx, cy, 4.8, ink); return; }
    ctx.save();
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.4;
    var kind = e && e.kind;
    var obj = e && e.obj;
    var bk = obj && obj.kind;

    if (kind === 'ship') {
      /* A chevron, pointing the way a hull points. */
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy - 3.6);
      ctx.lineTo(cx + 3.6, cy);
      ctx.lineTo(cx - 3, cy + 3.6);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'incident') {
      /* A diamond: filled while somebody is still asking, hollow once it
       * is over. */
      ctx.beginPath();
      ctx.moveTo(cx, cy - 4.2); ctx.lineTo(cx + 4.2, cy);
      ctx.lineTo(cx, cy + 4.2); ctx.lineTo(cx - 4.2, cy);
      ctx.closePath();
      if (e.help) ctx.fill(); else ctx.stroke();
    } else if (kind === 'meet') {
      ctx.beginPath();
      ctx.moveTo(cx - 4.4, cy - 3); ctx.lineTo(cx - 0.8, cy); ctx.lineTo(cx - 4.4, cy + 3);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 4.4, cy - 3); ctx.lineTo(cx + 0.8, cy); ctx.lineTo(cx + 4.4, cy + 3);
      ctx.closePath(); ctx.fill();
    } else if (kind === 'contact') {
      /* A ring with nothing in it - a bearing, not a thing. */
      ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 0.9, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'authority' || kind === 'comsat' || kind === 'mysat') {
      /* A mast with two arcs coming off it: a frequency, not a place. */
      ctx.beginPath(); ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy - 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy - 2, 2.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy - 2, 4.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (kind === 'collector') {
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'crew') {
      ctx.fillRect(cx - 3, cy - 3, 6, 6);
    } else if (kind === 'distress') {
      /* The one mark that is allowed to shout. */
      ctx.beginPath();
      ctx.moveTo(cx, cy - 4.6); ctx.lineTo(cx + 4.2, cy + 3.4); ctx.lineTo(cx - 4.2, cy + 3.4);
      ctx.closePath(); ctx.fill();
    } else if (kind === 'station' || bk === 'station') {
      /* A barred square. A station is a built thing and reads as one. */
      if (obj && (obj.surface || obj.underground)) {
        /* A pad on a world: a triangle standing on its ground line. */
        ctx.beginPath();
        ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 3.8, cy + 2.4); ctx.lineTo(cx - 3.8, cy + 2.4);
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - 4.6, cy + 4); ctx.lineTo(cx + 4.6, cy + 4); ctx.stroke();
      } else {
        ctx.strokeRect(cx - 3.6, cy - 3.6, 7.2, 7.2);
        ctx.beginPath(); ctx.moveTo(cx - 3.6, cy); ctx.lineTo(cx + 3.6, cy); ctx.stroke();
      }
    } else if (bk === 'star') {
      /* A disc with a ring off it, which nothing else in the list has. */
      ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 4.6, 0, Math.PI * 2); ctx.stroke();
    } else if (bk === 'planet') {
      ctx.beginPath(); ctx.arc(cx, cy, 3.8, 0, Math.PI * 2); ctx.fill();
    } else if (bk === 'moon') {
      ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function commsContacts() {
    var out = [];
    var i;

    /* Live distress calls, above everything, at range 0 for the same
     * reason the police channel is: a call is a transmission, not a place,
     * and the moment you want it is the moment you should not be scrolling
     * for it.
     *
     * These are read straight off `G.distress` rather than kept in step
     * with it, so a line here cannot survive the call it describes. Phase
     * 13's rule — every line must be true — is enforced by there being
     * only one copy of the truth. */
    var calls = (G.distress || []);
    for (i = 0; i < calls.length; i++) {
      var dc = calls[i];
      var away = V.dist(dc.pos, G.ship.pos);
      var npcSit = dc.npc && dc.claims && dc.claims.situation && global.Messages
        ? global.Messages.WORDS.situation[dc.claims.situation.value] : null;
      var what = dc.mine
        ? 'YOUR MAYDAY — ' + Combat.maydayWord(dc.kind)
        : npcSit ? 'MAYDAY — ' + npcSit
        : Combat.offenceWord(dc.kind);
      out.push({
        kind: 'distress', obj: dc, call: dc,
        name: (dc.mine ? 'MAYDAY  ' : 'DISTRESS  ') + dc.name +
              (dc.reg ? '  ' + dc.reg : ''),
        range: 0, sortAway: away,
        who: what + '  ·  ' + (away < 1000 ? away.toFixed(0) + ' km'
                                           : (away / 1000).toFixed(0) + 'k km'),
        color: dc.mine ? '#ffd36b' : '#ff5a5a'
      });
    }

    /* THE OVERBOSS'S COLLECTOR (tithe.js), in a hold. A frequency like the
     * police channels, so range 0 — and above them, because it is the one
     * that has just called you and is waiting for an answer. */
    if (global.Tithe && global.Tithe.held(G.sys)) {
      var mob = (G.sys.factions || []).filter(function (f) { return f && f.outlaw; })[0];
      out.push({ kind: 'collector', obj: null, name: global.Tithe.bossName(G) + ' collector',
                 range: 0, who: global.Tithe.channelNote(G, G.sys, G.t),
                 color: (mob && mob.color) || '#c86bff' });
    }

    /* YOUR CREW (stations.js, 2026-10-31): flying a Crawler, the channel
     * to her own crew is where a station is founded; with a station of
     * yours going up here, it is where her crew says how it is going. A
     * frequency, so range 0. */
    /* A HAND ON A BEACON (outside.js, 2026-11-13). Top of the list, with
     * the distress mark - the one mark that is allowed to shout - and the
     * air remaining where the range usually goes, because that is the
     * number you are actually flying against. Fly to them with the engine
     * cold and they come aboard; there is no button for it. */
    var Outs = global.Outside;
    if (Outs && Outs.liveHere) {
      var adrift = Outs.liveHere(G);
      for (var ai = 0; ai < adrift.length; ai++) {
        var ad = adrift[ai];
        var km = (V && G.ship && G.ship.pos && ad.pos) ? V.dist(G.ship.pos, ad.pos) : 0;
        out.push({
          kind: 'distress', obj: null, adrift: ad,
          name: ad.name + ' - SUIT BEACON',
          range: km,
          who: Outs.hoursWord(ad.o2) + ' of air  ·  off ' + (ad.shipName || 'your ship'),
          color: ad.o2 < 2 * 3600 ? '#ff5a5a' : '#ffb86b'
        });
      }
    }
    var Sts = global.Stations, Cn0 = global.Construction;
    var building = Sts ? Sts.workHere(G, G.sys, G.t) : [];
    if (Sts && Cn0 && (Cn0.isCrawler(G.ship) || building.length)) {
      out.push({ kind: 'crew', obj: building[0] || null,
                 name: Cn0.isCrawler(G.ship) ? (G.ship.shipName || 'Your Crawler') + ' - crew' : building[0].name + ' - crew',
                 range: 0,
                 who: Cn0.isCrawler(G.ship) ? 'Found a station, or unload for one'
                    : Sts.pending(building[0], G.t) + ' crate' + (Sts.pending(building[0], G.t) === 1 ? '' : 's') + ' to go in',
                 color: '#ffd36b' });
    }

    /* YOUR COM-SATS (comsats.js): the cradle aboard and the ones in orbit,
     * as a channel of your own. Range 0, with the other frequencies. */
    var CsC = global.Comsats;
    if (CsC && ((G.ship.comsats || 0) > 0 || CsC.sats(G).length)) {
      var rch = CsC.reachHere(G, G.galaxy, G.here);
      /* This system's uplink dark: the chain is broken here. */
      var upD = G.here && G.here.factionId && CsC.uplinkDark(G, G.here.id, G.t);
      out.push({ kind: 'mysat', obj: null, name: 'Your com-sats', range: 0,
                 who: (G.ship.comsats || 0) + ' aboard, ' + CsC.sats(G).length + ' in orbit' +
                      (rch ? (rch.on ? '  ·  LIVE, ' + rch.n + ' stars' : rch.dark ? '  ·  DARK - out of fuel' : '  ·  off your network here') : '') +
                      (upD ? '  ·  uplink here DARK - chain broken' : ''),
                 color: '#7dffb0' });
    }

    /* Police channels, one per faction flying a flag here.
     *
     * Range 0 on purpose, so they sort to the top of a list that is
     * otherwise ordered by distance. These are not objects you fly to —
     * they are a frequency, reachable anywhere in the system — and the one
     * time you badly want to find this channel is the one time you are in
     * trouble and should not have to scroll for it. */
    var facs = (G.sys.factions || []);
    var comsat = {};
    for (i = 0; i < facs.length; i++) {
      var f = facs[i];
      if (!f) continue;
      if (f.outlaw) {
        /* THE SYNDICATE'S COMSAT (Astra, 2026-11-01: "pirates should have
         * the comsat for the syndicate that runs their territory"). A band
         * runs no police, so a pirate-held system had no channel at all,
         * and with it went the mayday, the tow and PLANT. The band answers
         * to the Syndicate it is parented to, so the Syndicate's comsat is
         * the frequency there — and in the Syndicate's own systems too,
         * which had the same hole. One channel per Syndicate, whichever of
         * its bands brought it here; only where it actually holds a port,
         * so a flag in the faction list is not a radio. */
        var root = f.pirate && f.parentId ? syndicateOf(f.parentId) : f;
        if (!root || comsat[root.id] || !outlawHoldsHere(f.id)) continue;
        comsat[root.id] = true;
        out.push({ kind: 'authority', obj: root, name: root.name + ' comsat',
                   range: 0, who: 'Syndicate channel', comsat: true,
                   color: root.color || '#c86bff' });
        continue;
      }
      out.push({ kind: 'authority', obj: f, name: f.name + ' Control',
                 range: 0, who: 'Police channel',
                 color: f.color || '#7dfaff' });
    }

    for (i = 0; i < G.sys.bodies.length; i++) {
      var b = G.sys.bodies[i];
      if (b.kind !== 'station') continue;
      if (!shown(b)) continue;
      var range = V.dist(Sim.bodyPosition(b, G.sys, G.t), G.ship.pos);
      var fac = G.sys.factionById && G.sys.factionById[b.faction];
      /* An island (comsats.js): no relay can see it, so its news comes by
       * courier. Said on its row, where you would look for it. */
      var CsI = global.Comsats;
      var starI = (G.here && G.here.id) || G.sys.starId;
      var island = CsI && b.market && CsI.isIsland(G, G.sys, starI, b, G.t);
      /* Why: its world's relays are dark (an RTG tender late), or simply
       * none can see it from where they are. */
      var darkI = island && b.parentBody ? CsI.darkSpan(G, starI, b.parentBody.id, G.t) : null;
      out.push({ kind: 'station', obj: b, name: b.name, range: range,
                 who: (b.market ? b.market.roleName : 'Station') +
                      (b.isotopeRefinery ? '  ·  isotope refinery' : '') +
                      (darkI ? '  ·  ISLAND - relays dark, tender due day ' + Math.ceil(darkI.to / 86400)
                       : island ? '  ·  ISLAND - no relay sees it' : ''),
                 color: fac ? fac.color : '#7dffb0' });
    }
    /* A quiet transfer you are close enough to be part of
     * (rendezvous.js). Range 0, above the hulls, because the one time you
     * want this row is the one time you are alongside and deciding. */
    var Rv = global.Rendezvous;
    var meet = Rv ? Rv.atScene(G, G.sys, G.t) : null;
    if (meet) {
      var did = Rv.doneAt(G, G.sys, G.t);
      var nearer = (meet.a.state && meet.b.state && V.dist(meet.a.state.pos, G.ship.pos) <=
                    V.dist(meet.b.state.pos, G.ship.pos)) ? meet.a.state : meet.b.state;
      out.push({ kind: 'meet', obj: nearer, meet: meet,
                 name: meet.a.spec.name + '  +  ' + meet.b.spec.name,
                 range: 0, sortAway: meet.range,
                 who: did ? ('you already ' + did + ' this one')
                    : (meet.deal && !meet.deal.quiet)
                      ? ('a transfer at ' + meet.atName)
                      : ('two hulls alongside at ' + meet.atName),
                 color: '#7dffb0' });
    }
    var ships = Sim.shipsAll(G.sys, G.t);
    for (i = 0; i < ships.length; i++) {
      var s = ships[i];
      var r2 = V.dist(s.pos, G.ship.pos);
      if (r2 > RADAR_RANGE) continue;
      /* A Syndicate runner answers to the Syndicate, whatever port it
       * sails from — and its transponder says so, because the board you
       * open next will, and the list should not be the one place that
       * pretends otherwise. See generate.js buildRunners. */
      var runner = !!(s.route && s.route.runner);
      var f2 = G.sys.factionById && G.sys.factionById[runner ? s.route.flag : s.faction];
      out.push({ kind: 'ship', obj: s, name: s.name, range: r2,
                 who: (s.className || 'Ship') + (runner ? '  \u00b7  Syndicate runner' : ''),
                 hostile: s.hostile,
                 color: s.hostile ? '#ff8a76' : (f2 ? f2.color : '#8fe36a') });
    }
    out.sort(function (a, b) { return a.range - b.range; });
    return out;
  }

  /* ---- the traffic log --------------------------------------------------
   * Thirty deep, newest last, scrolled with [ and ]. Every line the game has
   * said to you since you started, which before this went to a three-second
   * toast and then nowhere: a refusal you glanced away from was gone, and the
   * only way to find out why you had been turned away was to try again.
   *
   * Repeats are collapsed with a count by logMessage(), so a port refusing
   * you once a second is one line reading x14 rather than fourteen lines
   * flushing everything you wanted to read. */
  function drawMessageLog(ctx, x, y, w, h) {
    var log = (G.msgLog || []);
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(x + 4, y + 4, w - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    var scrolled = Math.max(0, G.msgScroll || 0);
    ctx.fillText('TRAFFIC LOG' + (log.length ? '   ' + log.length + ' held' : ''), x + 10, y + 18);
    if (scrolled > 0) {
      ctx.fillStyle = '#ffd36b';
      ctx.fillText('\u2191 ' + scrolled + ' newer', x + w - 110, y + 18);
    }
    ctx.restore();

    if (!log.length) {
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('CHANNEL QUIET', x + 14, y + 46);
      ctx.restore();
      return;
    }

    var rowH = 15, rows = Math.floor((h - 34) / rowH);
    /* The window ends `scrolled` entries back from the newest, so [ walks
       into the past and ] walks back to now. Clamped so scrolling past the
       oldest entry parks on it rather than emptying the pane. */
    var end = Math.max(1, log.length - scrolled);
    var start = Math.max(0, end - rows);
    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    for (var i = start; i < end; i++) {
      var e = log[i], yy = y + 34 + (i - start) * rowH;
      var age = (G.t || 0) - (e.at || 0);
      ctx.fillStyle = 'rgba(120,150,180,0.65)';
      ctx.fillText(fmtLogAge(age), x + 10, yy);
      /* The newest line stays bright; everything behind it dims, so at a
         glance you can see how far back you are reading. */
      ctx.fillStyle = (i === log.length - 1) ? '#d8f4ff' : 'rgba(190,215,235,0.8)';
      var txt = e.text + (e.n > 1 ? '  \u00d7' + e.n : '');
      ctx.fillText(clipText(txt, Math.max(10, Math.floor((w - 96) / 7.26))), x + 66, yy);
    }
    ctx.restore();
  }

  /* Relative, not absolute: "4m ago" is what you want from a log you are
     scrolling to work out what just happened. */
  function fmtLogAge(s) {
    if (!isFinite(s) || s < 0) s = 0;
    if (s < 60) return Math.floor(s) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }

  function drawCommsScreen(ctx, w, bottom) {
    var top = modeFrame(ctx, w, bottom, 'COMMS',
                        '↑↓ channel   ·   Enter hail   ·   Y pay fines   ·   [ ] scroll log   ·   * = police');
    var pad = 14;
    var listW = Math.min(460, w * 0.4);
    var colH = bottom - top - pad * 2;
    var contacts = commsContacts();
    /* THE BOARD HOLDS ITS SHIP. The list is sorted by range and re-sorted
     * every frame, and G.commsSel is an index into it — so the moment you
     * pulled alongside to trade, or something else drifted past, the same
     * index named a different ship and the board shut in your face (or
     * worse, reopened on a stranger). While a deal is open the selection
     * follows the ship by name; if it has left the list, the deal ends. */
    if (G.shipDeal) {
      var dealAt = -1;
      for (var di = 0; di < contacts.length; di++) {
        if (contacts[di].name === G.shipDeal.name && contacts[di].obj) { dealAt = di; break; }
      }
      if (dealAt >= 0) G.commsSel = dealAt; else G.shipDeal = null;
    }
    if (G.commsSel >= contacts.length) G.commsSel = Math.max(0, contacts.length - 1);

    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(pad, top + pad, listW, colH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad + 2, top + pad + 2, listW - 4, colH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(pad + 4, top + pad + 4, listW - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('CHANNELS IN RANGE', pad + 10, top + pad + 18);
    ctx.restore();

    if (!contacts.length) {
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('NOTHING IN RANGE', pad + 14, top + pad + 48);
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText('the transmitter is good for 0.75 AU.', pad + 14, top + pad + 68);
      ctx.restore();
    }

    var BandM = global.Band;
    var bandRows = BandM ? BandM.rows(G, G.sys, G.t) : [];
    var bandShown = Math.min(5, bandRows.length);
    /* A header, the rows, and the one-line readout under them. */
    var bandH = bandShown ? (bandShown * 16 + 26) : 0;
    var rowH = 18, avail = Math.floor((colH - 40 - bandH) / rowH);
    var first = Math.max(0, Math.min(Math.max(0, contacts.length - avail),
                                     G.commsSel - Math.floor(avail / 2)));
    ctx.save();
    ctx.font = 'bold 13px ui-monospace, monospace';
    for (var r = 0; r < avail; r++) {
      var idx = first + r;
      if (idx >= contacts.length) break;
      var c = contacts[idx], yy = top + pad + 42 + r * rowH;
      if (idx === G.commsSel) {
        ctx.fillStyle = 'rgba(255,211,107,0.18)';
        ctx.fillRect(pad + 6, yy - 13, listW - 12, rowH);
      }
      var cink = c.kind === 'ship' ? trackInk(c) : c.color;
      ctx.fillStyle = cink;
      /* Plain ASCII, and specifically a character that IS on the keyboard
       * in front of the player. The first version used a section sign,
       * which is not on a US layout at all — so it read as an instruction
       * to press a key that does not exist rather than as a marker in a
       * list. A glyph in a legend has to be typeable even when nothing
       * asks you to type it. */
      markAt(ctx, pad + 8, yy, c, cink);
      /* Clip the name to the room actually left over, not to a fixed
       * character count. Twenty-four characters is only the right answer at
       * one pane width and one distance format: "Pilgrim Runner" beside
       * "103,470 km" in a narrow window overran the range and printed the
       * two on top of each other. Measuring both ends means the columns
       * hold at any width, and an AU reading is wider than a km one. */
      var nameX = pad + 26;
      var distText = fmtDist(c.range);
      var distW = ctx.measureText(distText).width;
      var chW = ctx.measureText('M').width || 7.2;
      var room = (pad + listW - 12 - distW - 10) - nameX;
      var maxChars = Math.max(4, Math.floor(room / chW));

      ctx.fillStyle = idx === G.commsSel ? MFD_HOT : (c.kind === 'ship' ? cink : MFD_INK);
      ctx.fillText(clipText(c.name, maxChars), nameX, yy);
      ctx.fillStyle = MFD_DIM;
      ctx.textAlign = 'right';
      ctx.fillText(distText, pad + listW - 12, yy);
      ctx.textAlign = 'left';
      hot(pad + 6, yy - 13, listW - 12, rowH, (function (n) {
        return function () { G.commsSel = n; G.piracyMenu = null; G.talkMenu = null; G.recruitMenu = null; };
      })(idx));
    }
    ctx.restore();

    if (bandShown) {
      var bandTop = top + pad + colH - bandH + 4;
      ctx.save();
      /* A rule, so the two lists do not read as one. */
      ctx.strokeStyle = MFD_EDGE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + 8, bandTop - 14);
      ctx.lineTo(pad + listW - 8, bandTop - 14);
      ctx.stroke();
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = '#ff9f7a';
      ctx.fillText('OPEN BAND  -  ' + bandRows.length + ' in this system', pad + 10, bandTop - 2);
      ctx.font = 'bold 12px ui-monospace, monospace';
      for (var bi = 0; bi < bandShown; bi++) {
        var br = bandRows[bi], by = bandTop + 14 + bi * 16;
        ctx.fillStyle = br.color;
        ctx.fillText(clipText(br.name, 18), pad + 12, by);
        ctx.fillStyle = MFD_DIM;
        ctx.textAlign = 'right';
        ctx.fillText(fmtDist(br.range), pad + listW - 12, by);
        ctx.textAlign = 'left';
      }
      /* One line of what the nearest one actually is, because a name and
       * a range do not tell you whether to go. */
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillStyle = '#6a7d92';
      ctx.fillText(clipText(bandRows[0].name + ': ' + bandRows[0].type +
                            '  -  F3 to steer at it', 52),
                   pad + 12, bandTop + 14 + bandShown * 16);
      ctx.restore();
    }

    /* The channel itself, and under it the LOG. The channel pane gives up its
       bottom 44% rather than the log going somewhere else on the HUD: what is
       said to you and who said it belong on the same screen, and the comms
       screen already owns the scrolling idiom. */
    var rx = pad * 2 + listW, rw = w - rx - pad;
    /* While a trade board is open it borrows height from the log: a
     * board is a table you scroll, the log is a record you glance at, and
     * at 720 px the 44% split left room for six lines of a ship's hold. */
    var logH = G.shipDeal ? Math.max(96, Math.round(colH * 0.26))
                          : Math.max(120, Math.round(colH * 0.44));
    var sel = contacts[G.commsSel];
    /* THE CHANNEL'S BUTTONS FIT ITS PANE (Astra, 2026-10-21). A port offers
     * up to ten things, and at a fixed 38 px a row that is 470 px of pane —
     * which a short window's 56% split never had, so the bottom buttons
     * printed straight over the traffic log. Now the channel takes what its
     * buttons need from the log first (down to the log's floor of 96 px),
     * and if that is still not enough the rows themselves close up, below. */
    var dealing = !!(sel && G.shipDeal && G.shipDeal.name === sel.name && sel.obj && global.ShipTrade);
    var opts = (sel && !dealing) ? commsOptions(sel) : null;
    var OPT_TOP = 90, OPT_FOOT = 30, OPT_ROW = 38;
    if (opts && opts.length) {
      var need = OPT_TOP + opts.length * OPT_ROW + OPT_FOOT;
      if (colH - logH - 10 < need) logH = Math.max(96, colH - 10 - need);
    }
    var chanH = colH - logH - 10;
    drawMessageLog(ctx, rx, top + pad + chanH + 10, rw, logH);
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(rx, top + pad, rw, chanH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx + 2, top + pad + 2, rw - 4, chanH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(rx + 4, top + pad + 4, rw - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(sel ? 'CHANNEL — ' + clipText(sel.name, 30) : 'CHANNEL', rx + 10, top + pad + 18);
    ctx.restore();

    if (!sel) return;

    var y = top + pad + 46;
    ctx.save();
    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.fillStyle = sel.color;
    ctx.fillText(sel.name, rx + 16, y);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    /* A call or a frequency sorts at range 0 because it is a transmission,
     * not a place; "0 m out" under it read as a ship sitting on top of you.
     * A distress line already says how far the scene is (2026-10-30). */
    ctx.fillText(sel.who +
                 (sel.obj && sel.obj.reg ? '   ·   reg ' + sel.obj.reg : '') +
                 (sel.kind === 'distress' || !(sel.range > 0) ? '' : '   ·   ' + fmtDist(sel.range) + ' out'), rx + 16, y + 18);
    ctx.restore();

    /* The trade board takes the channel pane over while it is open: the
     * intents underneath are a menu, and you have picked from it. */
    if (dealing) {
      drawShipDeal(ctx, rx, y, rw, top + pad + chanH, sel);
      return;
    }
    if (G.shipDeal) G.shipDeal = null;

    /* Rows close up to fit what is left: the full 30 + 8 when there is
     * room, then tighter gaps, then shorter buttons (never under 18 px,
     * which still holds the 11 px label). When it is that tight the footnote
     * under them gives its line up to the buttons as well. */
    var by = y + 44, bw = Math.min(300, rw - 32);
    var paneEnd = top + pad + chanH - 8;
    var showFoot = true;
    var step = Math.floor((paneEnd - OPT_FOOT + 8 - by) / Math.max(1, opts.length));
    if (step < 26) { showFoot = false; step = Math.floor((paneEnd - by) / Math.max(1, opts.length)); }
    step = Math.max(20, Math.min(OPT_ROW, step));
    var gap = step >= 34 ? 8 : step >= 26 ? 5 : 2, bh = step - gap;
    for (var i = 0; i < opts.length; i++) {
      var oy = by + i * step;
      btn(ctx, rx + 16, oy, bw, bh, opts[i].label, opts[i].fn,
          { disabled: !opts[i].enabled });
      /* The note beside a button is CLIPPED to the pane, measured rather
       * than counted — at a narrow window "doors are shut to you" ran off
       * the edge of the screen — and left out altogether when there is
       * not room for a word of it. */
      if (opts[i].note) {
        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(160,185,220,0.6)';
        var nx = rx + 24 + bw, room = rx + rw - 12 - nx;
        var nChars = Math.floor(room / (ctx.measureText('M').width || 6.6));
        if (nChars >= 6) ctx.fillText(clipText(opts[i].note, nChars), nx, oy + bh / 2 + 4);
        ctx.restore();
      }
    }

    if (showFoot) {
      ctx.save();
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(160,185,220,0.55)';
      var footChars = Math.floor((rw - 32) / (ctx.measureText('M').width || 6.6));
      ctx.fillText(clipText('Traffic control answers immediately; ships answer when they feel like it.', footChars),
                   rx + 16, top + pad + chanH - 14);
      ctx.restore();
    }

    /* The message you are typing, along the foot of the channel pane — the
     * same edit line the identity rows use, drawn where you are looking. */
    if (G.msgEditing && editing()) {
      drawEditField(ctx, rx + 10, top + pad + chanH - 58, rw - 20, 42);
    } else if (G.msgEditing) {
      G.msgEditing = false;       // Esc cancelled it without a commit
    }
  }

  /* ---- the ship trade board ---------------------------------------------
   * Every line in their hold and every line in yours, the port market's
   * columns read from the other side of the counter: what is ABOARD and
   * what they ASK for it, what is IN your HOLD and what they will PAY.
   *
   * Laid out in FRACTIONS of the pane, not pixels. The channel pane is
   * whatever the channel list leaves, which runs from ~780 px at 1280 wide
   * to ~410 at the narrow window — fixed columns would print the PAY
   * column through the pane's right edge on the one and leave a canyon on
   * the other. And the WHY of a refused line is not a column at all: it
   * is the status line under the table, for the selected row, which has
   * the whole width to say it in. */
  function drawShipDeal(ctx, rx, y, rw, paneBottom, sel) {
    var ST = global.ShipTrade;
    var d = G.shipDeal;
    var b = ST.board(G, G.sys, G.t, sel.obj);
    var x0 = rx + 16, right = rx + rw - 16, W = right - x0;
    var ly = y + 40;

    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';

    /* Who you are dealing with and where you stand with them — the two
     * numbers that set every price below — then the room each side has.
     * WRAPPED at the separators, not clipped: at the narrow window the
     * clipped version cut "prices 2% better" off the end, which is the
     * one part of the line that explains the numbers underneath it. */
    var chars = Math.max(20, Math.floor(W / 7.3));
    var pct = Math.round(b.swing * 100);
    var infoParts = b.flag ? [
      'flag ' + b.flag.name + (b.flag.outlaw ? ' (outlaw)' : ''),
      'standing ' + b.label + ' (' + (b.standing > 0 ? '+' : '') + Math.round(b.standing) + ')',
      'prices ' + (pct === 0 ? 'list' : pct > 0 ? pct + '% better' : (-pct) + '% worse')
    ] : [];
    var roomParts = [
      'their room ' + b.room + ' of ' + b.roomCap + ' t this trip',
      'their purse ' + fmtCredits(b.purse),
      'your hold free ' + Math.floor(Math.max(0, G.ship.cargoCap - global.Sim.cargoMass(G.ship))) + ' t',
      fmtCredits(G.ship.credits)
    ];
    function wrapParts(parts) {
      var lines = [], cur = '';
      for (var pi = 0; pi < parts.length; pi++) {
        var next = cur ? cur + '   \u00b7   ' + parts[pi] : parts[pi];
        if (cur && next.length > chars) { lines.push(cur); cur = parts[pi]; }
        else cur = next;
      }
      if (cur) lines.push(cur);
      return lines;
    }
    ctx.fillStyle = MFD_DIM;
    wrapParts(infoParts).forEach(function (ln) { ctx.fillText(clipText(ln, chars), x0, ly); ly += 16; });
    ctx.fillStyle = '#9fb6d4';
    wrapParts(roomParts).forEach(function (ln) { ctx.fillText(clipText(ln, chars), x0, ly); ly += 16; });
    ly += 1;
    var con = b.consequence;
    if (con && con.loss) {
      ctx.fillStyle = '#ffb86b';
      ctx.fillText(clipText('costs you with ' + con.loss.name + ' \u2014 ' + con.loss.why,
                            Math.floor(W / 7.3)), x0, ly);
      ly += 17;
    }

    if (b.refusal) {
      /* Word-wrapped, never clipped: the end of a refusal is where it says
       * what would change the answer ("until it is settled"), and the
       * first draft cut exactly that off at 1280 wide. */
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillStyle = '#ff9a7a';
      var per = Math.max(16, Math.floor(W / 8.4)), words = b.refusal.split(' '), line = '';
      var ry0 = ly + 18;
      for (var wi = 0; wi < words.length; wi++) {
        var tryLine = line ? line + ' ' + words[wi] : words[wi];
        if (line && tryLine.length > per) { ctx.fillText(line, x0, ry0); ry0 += 19; line = words[wi]; }
        else line = tryLine;
      }
      if (line) { ctx.fillText(line, x0, ry0); }
      ctx.restore();
      btn(ctx, x0, ry0 + 18, Math.min(160, W), 28, 'Back', function () { G.shipDeal = null; });
      return;
    }

    /* The table. */
    /* Prices without the "cr": the column head says what they are, and
     * at 410 px the suffix is what made "47 t" and "1,390 cr" print as one
     * word. */
    var cols = [0.44, 0.62, 0.80, 1.0];
    function num(v) { return Math.round(v).toLocaleString('en-US'); }
    var hy = ly + 10;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#7e93b3';
    ctx.fillText('COMMODITY', x0 + 14, hy);
    ctx.textAlign = 'right';
    ctx.fillText('ABOARD', x0 + W * cols[0], hy);
    ctx.fillText('ASK cr', x0 + W * cols[1], hy);
    ctx.fillText('IN HOLD', x0 + W * cols[2], hy);
    ctx.fillText('PAY cr', x0 + W * cols[3], hy);
    ctx.textAlign = 'left';

    var rows = b.rows, rowH = 17;
    if (d.sel >= rows.length) d.sel = Math.max(0, rows.length - 1);
    var tableTop = hy + 18;
    var tableBottom = paneBottom - 82;
    var fit = Math.max(1, Math.floor((tableBottom - tableTop) / rowH) + 1);
    if (rows.length > fit) fit = Math.max(1, fit - 1);   // a line for the "more" cue
    var first = Math.max(0, Math.min(rows.length - fit, d.sel - Math.floor(fit / 2)));
    if (!rows.length) {
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('Their hold is empty and so is yours.', x0 + 14, tableTop);
    }
    var nameRoom = Math.max(4, Math.floor((W * cols[0] - 14 - 58) / 7.3));
    ctx.font = 'bold 12px ui-monospace, monospace';
    for (var i = first; i < rows.length && i < first + fit; i++) {
      var r = rows[i], ry = tableTop + (i - first) * rowH;
      var on = i === d.sel;
      if (on) {
        ctx.fillStyle = 'rgba(125,250,255,0.10)';
        ctx.fillRect(x0 - 4, ry - 12, W + 8, rowH);
        ctx.fillStyle = '#7dfaff';
        ctx.fillText('\u25b6', x0, ry);
      }
      ctx.fillStyle = on ? MFD_HOT : MFD_INK;
      ctx.fillText(clipText(r.name, nameRoom), x0 + 14, ry);
      ctx.textAlign = 'right';
      ctx.fillStyle = r.theirs > 0 ? '#a9bcd6' : '#4c5c72';
      ctx.fillText(r.theirs > 0 ? r.theirs + ' t' : '\u2014', x0 + W * cols[0], ry);
      ctx.fillStyle = r.buyEach !== null ? '#cfe0ff' : '#4c5c72';
      ctx.fillText(r.buyEach !== null ? num(r.buyEach) : '\u2014', x0 + W * cols[1], ry);
      ctx.fillStyle = r.held > 0 ? '#ffe6a8' : '#4c5c72';
      ctx.fillText(r.held > 0 ? Math.floor(r.held) + ' t' : '\u2014', x0 + W * cols[2], ry);
      ctx.fillStyle = r.sellEach !== null ? '#cfe0ff' : '#4c5c72';
      ctx.fillText(r.sellEach !== null ? num(r.sellEach) : '\u2014', x0 + W * cols[3], ry);
      ctx.textAlign = 'left';
      hot(x0 - 4, ry - 12, W + 8, rowH, (function (n) {
        return function () { G.shipDeal.sel = n; };
      })(i));
    }

    /* More lines than fit: say so, at the end that is hiding them. A
     * list that silently stops is read as the whole list. */
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.75)';
    ctx.textAlign = 'right';
    if (first > 0) ctx.fillText('\u25b2 ' + first + ' more', x0 + W, hy);
    if (first + fit < rows.length) {
      ctx.fillText('\u25bc ' + (rows.length - first - fit) + ' more',
                   x0 + W, tableTop + fit * rowH - 4);
    }
    ctx.textAlign = 'left';

    /* The selected line, in words: what each direction would do, or why
     * it will not. */
    var cur = rows[d.sel];
    var sy = paneBottom - 60;
    if (cur) {
      var most = ST.maxBuy(G, cur);
      var buyLine = cur.buyEach !== null
        ? (most > 0 ? 'buy up to ' + most + ' t' : 'buy: no room or credits')
        : 'buy: ' + (cur.buyWhy || 'not aboard');
      var canSell = ST.maxSell(G, b, cur);
      var sellLine = cur.sellEach !== null
        ? (canSell > 0 ? 'sell up to ' + canSell + ' t'
           : b.room < 1 ? 'sell: no room left this trip'
           : 'sell: their purse is short (' + fmtCredits(b.purse) + ')')
        : 'sell: ' + (cur.held > 0 ? (cur.sellWhy || 'no') : 'none aboard');
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = '#d8f4ff';
      ctx.fillText(clipText(buyLine + '   \u00b7   ' + sellLine, Math.floor(W / 7.3)), x0, sy);
    }
    ctx.restore();

    /* Buttons for the pointer, labelled with the arrow key each one is —
     * the same direction on screen as on the keyboard. */
    var bw = Math.max(70, Math.min(130, Math.floor((W - 16) / 3))), bh = 26, by = paneBottom - 50;
    btn(ctx, x0, by, bw, bh, '\u2192 Buy 1 t', function () {
      if (cur) shipDealTrade(sel, cur, 1);
    }, { disabled: !cur || cur.buyEach === null });
    btn(ctx, x0 + bw + 8, by, bw, bh, '\u2190 Sell 1 t', function () {
      if (cur) shipDealTrade(sel, cur, -1);
    }, { disabled: !cur || cur.sellEach === null });
    btn(ctx, x0 + 2 * (bw + 8), by, bw, bh, 'Esc  Back', function () { G.shipDeal = null; });

    ctx.save();
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.7)';
    /* The long form where it fits, the short one where it does not — a
     * key legend clipped to "Home bu…" teaches nothing. */
    var legend = '\u2191\u2193 select  \u00b7  \u2192 buy  \u00b7  \u2190 sell  \u00b7  ' +
                 'Shift \u00d710  \u00b7  Home buy max  \u00b7  End sell all';
    if (legend.length > Math.floor(W / 6.7)) {
      legend = '\u2191\u2193  \u2192 buy  \u2190 sell  Shift\u00d710  Home max  End all';
    }
    ctx.fillText(clipText(legend, Math.floor(W / 6.7)), x0, paneBottom - 12);
    ctx.restore();
  }

  /* ---- YOUR OWN WORDS (messages.js) ----------------------------------------
   * The one free-text field on the console. Typed into the same edit line
   * the identity rows use, then READ: the draft below is a modal set of
   * rows showing what the game understood and, for every claim the ship
   * does not bear out, the lie spelled out. Send, edit, or cancel — and if
   * it is a lie, the send button says so. */
  function beginMsgEdit(kind, target, value) {
    G.msgEditing = true;
    beginEdit({
      label: kind === 'distress' ? 'DISTRESS CALL  —  say what is happening'
                                 : 'MESSAGE TO ' + String((target && target.name) || 'them').toUpperCase(),
      value: value || '', max: 140,
      hint: 'Enter to read it back  ·  Esc to cancel',
      allow: function (ch) { return /[A-Za-z0-9 .,'!?\-:;()]/.test(ch) ? ch : ''; },
      commit: function (v) {
        G.msgEditing = false;
        if (!v || !global.Messages) return;
        global.Messages.draft(G, G.sys, G.t, kind, v, target ? { name: target.name } : null);
      }
    });
  }

  function draftOptions() {
    var M = global.Messages, d = G.msgDraft, opts = [];
    /* Still being read (the embedding reader is asynchronous): say so,
     * and offer only the way out. */
    if (d.pending) {
      opts.push({ label: 'Reading your message…', enabled: false,
                  note: clipText('"' + d.text + '"', 58), fn: function () {} });
      opts.push({ label: 'Cancel', enabled: true, fn: function () { G.msgDraft = null; } });
      return opts;
    }
    /* Re-checked every frame: if the drive dies while you are reading it
     * back, "drive failure" stops being a lie, and the rows say so. */
    var chk = M.check(G, G.sys, G.t, d.claims, d.kind);
    d.check = chk;
    opts.push({ label: 'READ AS', enabled: false, note: clipText('"' + d.text + '"', 58),
                fn: function () {} });
    var any = false;
    chk.items.forEach(function (it) {
      if (it.slot === 'distress') {
        opts.push({ label: '! Ship not in distress', enabled: false,
                    note: 'send anyway and it is a lie', fn: function () {} });
        return;
      }
      any = true;
      opts.push({
        label: (it.ok ? '' : '! ') + it.slot.charAt(0).toUpperCase() + it.slot.slice(1) + ': ' +
               (it.neg ? 'NOT ' : '') + clipText(it.label, 22),
        enabled: false,
        note: it.ok ? 'true' : it.prompt + ' — send anyway?',
        fn: function () {}
      });
    });
    if (!any) {
      opts.push({ label: 'Nothing readable', enabled: false,
                  note: 'nobody will know what you mean — edit it', fn: function () {} });
    }
    /* A message goes to a ship, which has to still be in range to hear it. */
    var target = null;
    if (d.kind === 'message') {
      var cs = commsContacts();
      for (var i = 0; i < cs.length; i++) {
        if (cs[i].kind === 'ship' && cs[i].name === d.target) { target = cs[i]; break; }
      }
    }
    var reachable = d.kind === 'distress' || (target && target.range <= Combat.HAIL_RANGE_KM);
    opts.push({
      label: chk.honest ? 'Send' : 'Send anyway — knowingly false',
      enabled: !!reachable && (any || d.kind === 'message'),
      note: !reachable ? 'they are out of range now'
          : chk.honest ? 'every word of it is true'
          : chk.weight.event === 'exploited' ? 'the worst kind of lie there is'
          : 'if they find out, they will remember',
      fn: function () {
        if (d.kind === 'distress') M.sendDistress(G, G.sys, G.t, d, hooksFor());
        else if (target) M.sendMessage(G, G.sys, G.t, target.obj, d, hooksFor());
        G.msgDraft = null;
      }
    });
    opts.push({ label: 'Edit', enabled: true, note: 'change the words',
                fn: function () {
                  var keep = d; G.msgDraft = null;
                  beginMsgEdit(keep.kind, keep.target ? { name: keep.target } : null, keep.text);
                } });
    opts.push({ label: 'Cancel', enabled: true, fn: function () { G.msgDraft = null; } });
    return opts;
  }

  /* What you can say to whoever is selected. Deliberately shaped as a list
   * of intents rather than a dialogue tree — the tree is the next piece of
   * work and this is the shape it will grow into. */
  function commsOptions(c) {
    var opts = [];

    /* An unsent message takes the channel over until it is sent or
     * dropped, the same way a trade board does: you are mid-sentence. */
    if (G.msgDraft && global.Messages) return draftOptions();

    /* A CAPTAIN YOU OWE IS ASKING (favours.js). Her row leads with the
     * ask until you answer it or it runs out — and running out is a no. */
    var ask = G.favourAsk;
    if (ask && global.Favours && c.name === ask.name &&
        (!ask.star || !G.here || ask.star === G.here.id)) {
      opts.push({
        label: ask.speaker + ' asks a favour', enabled: false,
        note: '"' + global.Favours.askText(ask) + '"  ·  ' + fmtTime(Math.max(0, ask.until - G.t)) + ' to answer',
        fn: function () {}
      });
      opts.push({
        label: ask.kind === 'credits' ? 'Wire her ' + ask.amount + ' cr' : 'Pass across ' + ask.amount + ' t of reaction mass',
        enabled: ask.kind === 'credits' ? (G.ship.credits || 0) >= ask.amount
                                         : (G.ship.thrusterFuel || 0) > ask.amount + 1,
        note: ask.kind === 'credits' ? 'squares you with her' : 'within ' + global.Favours.MASS_RANGE + ' km · squares you with her',
        fn: function () { global.Favours.answerAsk(G, G.sys, true, G.t, hooksFor()); }
      });
      opts.push({
        label: 'Refuse', enabled: true, note: 'she will remember it',
        fn: function () { global.Favours.answerAsk(G, G.sys, false, G.t, hooksFor()); }
      });
    }

    /* A live call on the band. Your own gives you the state of the answer;
     * somebody else's gives you the one action worth having. */
    if (c.kind === 'distress') {
      var call = c.call;
      if (call.mine) {
        var who = null, pats = (G.sys.patrols || []);
        for (var pi = 0; pi < pats.length; pi++) {
          if (pats[pi].id === call.answeredBy) { who = pats[pi]; break; }
        }
        opts.push({
          label: who ? 'Answering: ' + who.name : 'Nobody is answering',
          enabled: false,
          note: who
            ? (call.etaAt ? 'arrives in ' + fmtTime(Math.max(0, call.etaAt - G.t)) : 'inbound')
            : 'no ' + (call.want === Combat.HELP_TENDER ? 'tender' : 'patrol') + ' in this system',
          fn: function () {}
        });
        opts.push({
          label: 'Stand down the call', enabled: true,
          note: 'stops transmitting',
          fn: function () {
            Combat.releaseResponder(G.sys, call);
            G.distress = (G.distress || []).filter(function (x) { return x !== call; });
            say('Mayday cancelled.', 4);
          }
        });
        return opts;
      }
      var reach = V.dist(G.ship.pos, call.pos);
      var close = reach <= Combat.WITNESS_RANGE;
      /* A CAPTAIN'S OWN MAYDAY (messages.js) says something, and what it
       * says may not be true. Two rows before the answer: hear it in full,
       * and check the transponder against the registry — the one tell a
       * careful pilot has against a pirate's bait. */
      if (call.npc && global.Messages) {
        opts.push({
          label: 'Hear the message', enabled: true,
          note: clipText('"' + (call.text || '') + '"', 52),
          fn: function () { say(call.name + ': "' + call.text + '"', 9); }
        });
        opts.push({
          label: 'Check the transponder', enabled: true,
          note: 'reg ' + (call.reg || 'none') + ' against the registry',
          fn: function () {
            say('Registry: ' + global.Messages.checkTransponder(G, G.sys, G.t, call), 9);
          }
        });
      }
      /* A SHIP REALLY ADRIFT (upkeep.js): the answer is mass, passed on a
       * line, so the row says what she needs, what you have, and what is
       * stopping you — and stays after a part-load, for the next trip. */
      if (call.upkeep && global.Upkeep) {
        var Upk = global.Upkeep;
        var herR = (G.sys.traffic || []).filter(function (r) { return r.id === call.routeId; })[0];
        if (herR) {
          var herLed = Upk.ledgerOf(G, G.sys, herR);
          var sdNow = Upk.stranded(herR, G.sys, G.t);
          var banked = herLed && sdNow && herLed.fuelLeg === sdNow.leg ? herLed.fuelT || 0 : 0;
          var stillT = Math.max(0, Upk.needOf(herR) - banked);
          var spare = Upk.spareOf(G.ship);
          var herV = sdNow && sdNow.adrift ? Upk.herNow(herR, G.sys, sdNow).vel : null;
          var relKms = herV ? V.dist(herV, G.ship.vel) : 0;
          var lineKm = Upk.transferKm(), inReach = reach <= lineKm, matched = relKms <= Upk.TRANSFER_KMS;
          opts.push({
            label: 'Pass her reaction mass',
            enabled: !!(sdNow && sdNow.adrift) && inReach && matched && spare.total > 0.25,
            note: !(sdNow && sdNow.adrift) ? 'she is not adrift any more'
                : !inReach ? 'needs ' + stillT.toFixed(1) + ' t · come within ' + lineKm + ' km'
                : !matched ? 'match her drift (' + Math.round(relKms * 1000) + ' m/s)'
                : spare.total <= 0.25 ? 'needs ' + stillT.toFixed(1) + ' t · you have none to spare'
                : 'needs ' + stillT.toFixed(1) + ' t · you can spare ' + spare.total.toFixed(1) +
                  (spare.hold > 0 ? ' (' + spare.hold.toFixed(1) + ' in the hold)' : ''),
            fn: function () {
              var r = Combat.answerDistress(G.sys, G, G.t, call, hooksFor());
              if (!r.ok) say('Cannot: ' + r.why, 5);
            }
          });
        }
        /* Locked as HER, not as a point: the lock carries her velocity,
         * which is what matching her drift is flown against. */
        opts.push({
          label: 'Lock her up', enabled: true,
          note: fmtDist(reach) + ' away · ' + call.name,
          fn: function () {
            G.showTraffic = true;
            /* Off her rail (robbed while adrift, say) she is listed by her
             * lifted spec's id, not her route's. */
            var rt0 = (G.sys.traffic || []).filter(function (r) { return r.id === call.routeId; })[0];
            var lf = rt0 && global.Upkeep ? global.Upkeep.liftedOf(rt0, G.sys) : null;
            G.navTarget = { kind: 'ship', id: lf ? lf.id : call.routeId };
            say('Locked — ' + call.name + ', adrift, ' + fmtDist(reach) + ' out', 5);
          }
        });
        return opts;
      }
      opts.push({
        label: 'Answer the call', enabled: close && !call.answeredBy,
        /* No longer dormant: a captain's own mayday off the schedule in
         * messages.js can appear here and be answered — see answerNpcCall.
         * A victim of the player's own crimes still answers the old way. */
        note: call.answeredBy ? 'already answered'
            : close ? 'you are near enough to help'
            : 'too far from the scene to be any use',
        fn: function () {
          var r = Combat.answerDistress(G.sys, G, G.t, call, hooksFor());
          say(r.ok ? 'Answered — ' + call.name + ' will remember it'
                   : 'Cannot answer: ' + r.why, 5);
        }
      });
      opts.push({
        label: 'Mark the scene', enabled: true,
        note: fmtDist(reach) + ' away',
        fn: function () {
          G.navTarget = { kind: 'point', pos: call.pos, name: call.name + ' (distress)' };
          say('Scene marked — ' + call.name + ', ' + fmtDist(reach) + ' out', 5);
        }
      });
      return opts;
    }

    if (c.kind === 'meet') {
      var RvS = global.Rendezvous, m = c.meet;
      var d = m.deal, did = RvS.doneAt(G, G.sys, G.t);
      var why = RvS.refusal(G, G.sys, G.t);
      var what = (d && !d.quiet)
        ? (d.tonnes + ' t of ' + ((global.Economy && global.Economy.BY_ID[d.cid] &&
             global.Economy.BY_ID[d.cid].name) || d.cid) +
           (d.contraband ? '  -  and it is not on any manifest' : ''))
        : 'nothing is moving between them';
      opts.push({ label: 'Watch them', enabled: false,
                  note: what + (d && d.who ? '  -  ' + d.who.name + ' came in ahead of them' : '') });
      opts.push({
        label: 'Ask what they are moving',
        enabled: !did && !why,
        note: did ? ('you already ' + did + ' this one')
            : why ? why
            : (d.ask + ' cr a tonne, which is under the counter'),
        fn: function () {
          var r = RvS.buy(G, G.sys, G.t, hooksFor());
          if (!r.ok) say(r.why, 5);
        }
      });
      opts.push({
        label: 'Take it off them',
        enabled: !did && !why,
        note: did ? ('you already ' + did + ' this one')
            : why ? why
            : 'both flags will know, and the hold will be hot',
        fn: function () {
          var r = RvS.rob(G, G.sys, G.t, hooksFor());
          if (!r.ok) say(r.why, 5);
        }
      });
      opts.push({
        label: 'Tell somebody',
        enabled: !did && !why,
        note: did ? ('you already ' + did + ' this one')
            : why ? why
            : 'a finder\'s fee, and they will not be back for a while',
        fn: function () {
          var r = RvS.tell(G, G.sys, G.t, hooksFor());
          if (!r.ok) say(r.why, 5);
        }
      });
    }

    if (c.kind === 'collector') {
      /* Pay, haggle, refuse: Astra's three answers. Paying stays on the
       * list after a refusal, late and dearer, because that is the way
       * back. */
      var tst = global.Tithe.status(G, G.sys, G.t);
      var owe = global.Tithe.owed(G, G.sys, G.t);
      var tAnswer = function (r) { say(r.ok ? r.say : 'Cannot: ' + r.why, r.ok ? 8 : 4); };
      opts.push({
        label: tst === 'suspected' ? 'Pay the tithe, late' : 'Pay the tithe',
        enabled: tst !== 'paid' && G.ship.credits >= owe,
        note: tst === 'paid' ? global.Tithe.channelNote(G, G.sys, G.t)
            : G.ship.credits >= owe ? owe + ' cr' : owe + ' cr — you have ' + Math.round(G.ship.credits),
        fn: function () { tAnswer(global.Tithe.pay(G, G.sys, G.t, 'channel')); }
      });
      opts.push({
        label: 'Haggle',
        enabled: global.Tithe.canHaggle(G, G.sys, G.t),
        note: tst === 'paid' ? 'paid' : tst === 'suspected' ? 'past haggling'
            : global.Tithe.canHaggle(G, G.sys, G.t) ? 'once — it may go up' : 'haggled — that is the price',
        fn: function () { tAnswer(global.Tithe.haggle(G, G.sys, G.t)); }
      });
      opts.push({
        label: 'Refuse',
        enabled: tst !== 'paid' && tst !== 'suspected',
        note: tst === 'paid' ? 'paid' : tst === 'suspected' ? 'refused — SUSPECTED this week' : 'they will take you for the law',
        fn: function () { tAnswer(global.Tithe.refuse(G, G.sys, G.t)); }
      });
      /* A STATION LICENCE (licence.js, 2026-10-31): from whoever governs
       * here, for founding a station from a Crawler. */
      if (global.Licence && global.Licence.issuer(G.sys) === 'outlaw') {
        var licR = global.Licence.rec(G, G.sys), licWhy = global.Licence.refusal(G, G.sys);
        opts.push({
          label: licR && licR.forged && licR.caught ? 'Station licence - pay the real fee, now'
               : 'Station licence - ' + global.Licence.price(G.sys) + ' cr',
          enabled: !licWhy,
          note: licR && !licR.forged ? 'held - you may found a station here'
              : licR && licR.caught ? 'FORGED, found out - due in ' + Math.max(0, Math.ceil((licR.dueBy - G.t) / 86400)) + ' days'
              : licWhy || 'to found a station from a Crawler in this system',
          fn: function () { var r = global.Licence.buy(G, G.sys, G.t, hooksFor()); if (!r.ok) say('No: ' + r.why, 5); }
        });
      }
      /* And paper for anywhere else: a blank, filled in when you found. */
      if (global.Licence) {
        var fWhy = global.Licence.forgeRefusal(G, G.sys);
        opts.push({
          label: 'Forged licence, blank - ' + global.Licence.forgedPrice() + ' cr',
          enabled: !fWhy,
          note: fWhy || ((G.forgedBlanks || 0) ? G.forgedBlanks + ' in your papers already - ' : '') +
                       'reads as real until somebody checks',
          fn: function () { var r = global.Licence.buyForged(G, G.sys, G.t, hooksFor()); if (!r.ok) say('No: ' + r.why, 5); }
        });
      }
      return opts;
    }

    /* YOUR COM-SATS: launch one into the orbit you are flying, at your
     * height; and where the ones you have are. */
    if (c.kind === 'mysat') {
      var CsO = global.Comsats, here0 = (G.here && G.here.id) || 'sys';
      var lw = CsO.launchRefusal(G, G.sys, G.t);
      var dom0 = Sim.dominantBody(G.ship.pos, G.sys, G.t);
      opts.push({
        label: 'Launch a com-sat here',
        enabled: !lw,
        note: lw || 'round ' + dom0.name + ', at your height - your terminal into the relay network',
        fn: function () {
          var rl = CsO.launch(G, G.sys, here0, G.t, G.here && G.here.name);
          say(rl.ok ? rl.text : 'Com-sat: ' + rl.why, rl.ok ? 8 : 5);
          if (rl.ok && global.Save) global.Save.store(G);
        }
      });
      /* Refuelling one: a tonne of RTG fuel, in orbit round its world. */
      if (CsO.sats(G).length) {
        var rf = CsO.refuelRefusal(G, G.sys, here0, G.t);
        opts.push({
          label: 'Refuel a com-sat',
          enabled: !rf.why,
          note: rf.why || 'the one over ' + rf.sat.bodyName + ' - ' + CsO.SAT_FUEL_T + ' t of RTG fuel, ' + CsO.SAT_LIFE + ' days',
          fn: function () {
            var rr = CsO.refuel(G, G.sys, here0, G.t);
            say(rr.ok ? rr.text : 'Com-sat: ' + rr.why, rr.ok ? 7 : 5);
            if (rr.ok && global.Save) global.Save.store(G);
          }
        });
      }
      CsO.sats(G).forEach(function (s) {
        var live = CsO.satLive(s, G.t), left = Math.ceil((CsO.satFuelTo(s) - G.t) / 86400);
        opts.push({ label: 'Com-sat over ' + s.bodyName, enabled: false,
                    note: (s.star === here0 ? 'in this system' : 'at ' + (s.starName || s.star)) +
                          ', ' + Math.round(s.a).toLocaleString('en-US') + ' km out  ·  ' +
                          (live ? 'fuel for ' + left + ' days' : 'DARK - out of fuel'), fn: function () {} });
      });
      return opts;
    }

    if (c.kind === 'crew') {
      var Sx = global.Stations, Cx = global.Construction;
      if (Cx.isCrawler(G.ship)) {
        ['orbital', 'surface'].forEach(function (kind) {
          var why = Sx.refusal(G, G.sys, G.t, kind);
          var host = Sim.dominantBody(G.ship.pos, G.sys, G.t);
          var ids = Cx.aboard(G.ship).map(function (a) { return a.crateId; });
          var ty = Sx.typeFor(ids);
          /* WILL SHE PAY (Stations.forecastSite): the station she would be,
           * here, put through the real market and traffic code. Cached by
           * the hour and the site - it builds a market to answer. */
          var fk = kind + '|' + (host && host.id) + '|' + ids.join(',') + '|' + Math.floor(G.t / 3600);
          G._siteForecast = G._siteForecast || {};
          if (!(fk in G._siteForecast)) {
            var fcs = null;
            try { fcs = Sx.forecastSite(G, G.sys, G.t, kind); } catch (e) { fcs = null; }
            if (Object.keys(G._siteForecast).length > 8) G._siteForecast = {};
            G._siteForecast[fk] = fcs;
          }
          var fcs2 = G._siteForecast[fk];
          var fcNote = fcs2 ? '  ·  FORECAST ' + (fcs2.net >= 0 ? '+' : '') + fcs2.net + ' cr/wk (market ' + fcs2.market +
            ', berths ' + fcs2.berths + ', costs ' + (fcs2.wages + fcs2.upkeep + fcs2.fuel) + ')' : '';
          opts.push({
            label: kind === 'orbital' ? 'Found her here, in orbit' + (host ? ' of ' + host.name : '')
                                      : 'Found her on the ground below' + (host ? ', on ' + host.name : ''),
            enabled: !why,
            note: (why || ((ty ? ty.name : 'A station') + ' - she stops here for good, and you take one of her tugs')) + fcNote,
            fn: function () {
              var r = Sx.found(G, G.sys, G.t, kind, hooksFor());
              if (!r.ok) say('No: ' + r.why, 5);
            }
          });
        });
      }
      /* STITCHED ON: a Crawler alongside a shipyard of yours makes it an
       * XL yard (Sx.stitch). */
      if (Cx.isCrawler(G.ship)) {
        Sx.list(G).forEach(function (st) {
          if (st.seized || st.star !== (G.here && G.here.id) || !Sx.isOpen(st, G.t)) return;
          if (Sx.typesOf(st, G.t).indexOf('shipyard') < 0) return;
          var sw = Sx.stitchRefusal(G, G.sys, st, G.t);
          opts.push({
            label: 'Stitch her onto ' + st.name,
            enabled: !sw,
            note: sw || ('she stops for good alongside her - ' + ((st.crawlers || 1) + 1) + ' Crawlers, an XL shipyard'),
            fn: function () { var r = Sx.stitch(G, G.sys, st, G.t, hooksFor()); if (!r.ok) say('No: ' + r.why, 5); }
          });
        });
      }
      /* ANOTHER CRAWLER BRINGS UPGRADES: unload her crates for a station
       * of yours here, berthed with her or within Sx.UNLOAD_KM. */
      if (Cx.isCrawler(G.ship) && Cx.aboard(G.ship).length) {
        Sx.list(G).forEach(function (st) {
          if (st.seized || st.star !== (G.here && G.here.id) || !Sx.isOpen(st, G.t)) return;
          var uw = Sx.unloadRefusal(G, G.sys, st, G.t);
          opts.push({
            label: 'Unload her crates for ' + st.name,
            enabled: !uw,
            note: uw || (Cx.aboard(G.ship).length + ' crates into her ring - her crew fits them, or carry them in'),
            fn: function () { var r = Sx.unloadTo(G, G.sys, st, G.t, hooksFor()); if (!r.ok) say('No: ' + r.why, 5); }
          });
        });
      }
      Sx.workHere(G, G.sys, G.t).forEach(function (st) {
        if (Sx.isOpen(st, G.t)) {
          opts.push({
            label: st.name + ' - ' + Sx.pending(st, G.t) + ' upgrade crate' + (Sx.pending(st, G.t) === 1 ? '' : 's') + ' to fit',
            enabled: false,
            note: 'her crew fits them in turn - carry one to her with the arms (G) and it is in at once',
            fn: function () {}
          });
          return;
        }
        var left = Math.max(0, Sx.opensAt(st) - G.t);
        var sch = Sx.schedule(st), next = null;
        st.order.forEach(function (i) { if (sch.crateIn[i] > G.t && (next === null || sch.crateIn[i] < sch.crateIn[next])) next = i; });
        opts.push({
          label: st.name + ' - opens in ' + (left / 86400).toFixed(1) + ' days',
          enabled: false,
          note: Sx.cratesIn(st, G.t) + ' of ' + st.crates.length + ' crates in' +
                (next !== null ? '; her crew is on the ' + Cx.BY_ID[st.crates[next]].name.toLowerCase() : '') +
                ' - carry one to her frame with the arms (G) and it is in at once',
          fn: function () {}
        });
      });
      return opts;
    }

    if (c.kind === 'authority') {
      /* The police channel. Reporting a crime is a later piece of work;
       * these are the two you need when the trouble is your own. */
      /* A STATION LICENCE (licence.js, 2026-10-31): from whoever governs
       * here, for founding a station from a Crawler. */
      if (global.Licence && global.Licence.issuer(G.sys) === c.obj.id) {
        var licR = global.Licence.rec(G, G.sys), licWhy = global.Licence.refusal(G, G.sys);
        opts.push({
          label: licR && licR.forged && licR.caught ? 'Station licence - pay the real fee, now'
               : 'Station licence - ' + global.Licence.price(G.sys) + ' cr',
          enabled: !licWhy,
          note: licR && !licR.forged ? 'held - you may found a station here'
              : licR && licR.caught ? 'FORGED, found out - due in ' + Math.max(0, Math.ceil((licR.dueBy - G.t) / 86400)) + ' days'
              : licWhy || 'to found a station from a Crawler in this system',
          fn: function () { var r = global.Licence.buy(G, G.sys, G.t, hooksFor()); if (!r.ok) say('No: ' + r.why, 5); }
        });
      }
      var owed = Math.round((G.wanted || {})[c.obj.id] || 0);
      var fugitive = Combat.isFugitive(G, c.obj.id);
      opts.push({
        label: 'Request status', enabled: true,
        note: fugitive ? 'FUGITIVE' : (owed ? owed + ' cr outstanding' : 'clean'),
        fn: function () { hailAuthority(c.obj); }
      });
      opts.push({
        label: 'Settle outstanding fines',
        enabled: !!(owed || fugitive),
        note: G.payOffer && G.payOffer.faction === c.obj.id
                ? G.payOffer.cost + ' cr quoted'
                : (owed || fugitive ? 'ask for status first' : 'nothing owed'),
        fn: function () {
          if (!G.payOffer || G.payOffer.faction !== c.obj.id) hailAuthority(c.obj);
          else payOutstanding();
        }
      });
      opts.push({
        label: 'Report a crime', enabled: false,
        note: c.obj.outlaw ? 'the Syndicate does not take reports' : 'channel not staffed for this yet',
        fn: function () {}
      });

      /* The mayday lives on the police channel because that is where a
       * pilot in trouble looks, even when what they actually need is a
       * tender. Two buttons rather than one, because "help" is not a
       * single service and picking wrong should be possible: a tender
       * brings fuel and a tow, security brings guns, and neither does the
       * other's job.
       *
       * Both are enabled in flight whatever is wrong. Gating them on being
       * out of fuel would mean the one time you could not call is the
       * moment before it becomes an emergency. */
      var flying = !G.ship.docked && !G.ship.landed;
      var already = (G.distress || []).filter(function (x) { return x.mine; })[0];
      opts.push({
        label: 'MAYDAY — request a fuel tender',
        enabled: flying,
        note: already ? 'already transmitting' :
              flying ? Combat.maydayWord(Combat.maydayReason(G)) : 'you are berthed',
        fn: function () {
          var r = Combat.mayday(G.sys, G, G.t, Combat.HELP_TENDER, hooksFor());
          if (!r.ok) say('Cannot transmit: ' + r.why, 4);
        }
      });
      opts.push({
        label: 'MAYDAY — request security',
        enabled: flying,
        note: already ? 'already transmitting' :
              flying ? 'guns, not fuel' : 'you are berthed',
        fn: function () {
          var r = Combat.mayday(G.sys, G, G.t, Combat.HELP_SECURITY, hooksFor());
          if (!r.ok) say('Cannot transmit: ' + r.why, 4);
        }
      });
      /* IN YOUR OWN WORDS. The two above are the beacon: honest, read off
       * the ship. This one is a message every captain in range hears, and
       * who comes depends on what you say and who they are — which is also
       * what makes it the one you can lie with. See messages.js. */
      opts.push({
        label: 'Distress call — in your own words…',
        enabled: flying && !!global.Messages,
        note: flying ? 'say what is wrong; captains decide who comes' : 'you are berthed',
        fn: function () { beginMsgEdit('distress', null, ''); }
      });

      /* ---- the tow -------------------------------------------------------
       * Only once somebody is actually coming, because a tow is a thing you
       * agree with a crew rather than a button on the hull. One row per
       * port, each carrying its own price and crossing time — a destination
       * without a number beside it is a guess, which is the same rule the
       * standing-orders list follows. */
      if (G.rescue && !Sim.towActive(G.ship)) {
        var towing = G.rescue.service === 'tow';
        var picks = Combat.towOptions(G.sys, G, G.t);
        if (!picks.length) {
          opts.push({ label: 'TOW — no port in this system', enabled: false,
                      note: 'they can only top you off out here', fn: function () {} });
        }
        for (var ti = 0; ti < picks.length && ti < 6; ti++) {
          (function (p) {
            var chosen = towing && G.rescue.dest === p.port;
            opts.push({
              label: (chosen ? '✓ TOW to ' : 'TOW to ') + p.name.toUpperCase() +
                     ' — ' + (p.free ? 'no charge' : p.fee + ' cr'),
              enabled: !p.barred,
              note: p.barred ? p.barred
                   : fmtDist(p.dist) + '  ·  ' + fmtTime(p.seconds) + ' on the cable' +
                     (p.fee > G.ship.credits
                        ? '  ·  short ' + (p.fee - G.ship.credits) + ' cr, the rest becomes a lien'
                        : ''),
              fn: function () {
                var r = Combat.requestTow(G.sys, G, G.t, p.port, hooksFor());
                if (!r.ok) say('No: ' + r.why, 5);
              }
            });
          })(picks[ti]);
        }
        if (towing) {
          opts.push({
            label: 'TOW — cancel, just fill the tanks', enabled: true,
            note: 'the hose instead of the cable',
            fn: function () { Combat.cancelTow(G, hooksFor()); }
          });
        }
      }
      /* ---- on the cable: framing the tug (Phase 18) ---------------------
       * Her hold is open to you while she has you. One row per thing you
       * could leave in it, worst first, each saying what it would cost if
       * her crew report it. */
      if (Sim.towActive(G.ship) && Combat.plantables && G.ship.tow.tug) {
        var tugName = G.ship.tow.tug.name;
        Combat.plantables(G).forEach(function (pl) {
          var nm = (Eco && Eco.BY_ID[pl.cid] && Eco.BY_ID[pl.cid].name) || pl.cid;
          opts.push({
            label: 'PLANT ' + pl.tonnes + 't ' + nm + ' in the ' + tugName + "'s hold",
            enabled: true,
            note: pl.sev >= 2 ? 'serious: if her crew report it, you are MARKED a pirate'
                              : 'smuggling with their name on it; her crew are watching',
            fn: function () {
              var r = Combat.plantInTug(G.sys, G, G.t, pl.cid, hooksFor());
              if (!r.ok) say('No: ' + r.why, 5);
            }
          });
        });
      }
      return opts;
    }
    if (c.kind === 'station') {
      var docked = G.ship.docked === c.obj.id;
      var cleared = Combat.isCleared(G, c.obj);
      var launchOk = Combat.launchCleared(G, c.obj);
      opts.push({
        /* This used to set the dock target and announce "clearance
         * granted" without asking anyone — which became a straight lie the
         * moment clearance became a thing a port can refuse. It now makes
         * the same request the F4/Enter hail does, and reports whatever
         * comes back. */
        label: 'Request docking permission',
        enabled: !docked && !cleared,
        note: docked ? 'already docked'
            : cleared ? 'already cleared'
            : fmtDist(c.range) + ' out',
        fn: function () {
          G.navTarget = { kind: 'body', id: c.obj.id };
          G.dockTarget = c.obj;
          hailSelected(c);
        }
      });
      /* Getting out is its own request, and only makes sense from inside.
       * Shown greyed rather than hidden when you are not docked here, so
       * the shape of the conversation is the same wherever you are. */
      opts.push({
        label: 'Request launch permission',
        enabled: docked && !launchOk,
        note: !docked ? 'only from the pad'
            : launchOk ? 'cleared — U to launch'
            : 'doors are shut',
        fn: function () { hailSelected(c); }
      });
      /* AND THE RIDE OUT (Astra, 24-09): back the way you came in — off the
       * stand, up the cargo lift, out to the pad. At a ground port it asks
       * for launch on the way if you have not; see main.js exitTransfer. */
      opts.push({
        label: 'Request transfer to exit pad',
        enabled: docked,
        note: !docked ? 'only from a berth'
            : !c.obj.surface ? 'back out the way you came'
            : launchOk ? 'cleared — ride up to the pad'
            : 'asks for launch first',
        fn: function () { if (exitTransfer) exitTransfer(c.obj); }
      });
      /* ONE ROW, TWO JOBS, because it is the same question asked from two
       * distances and the answer is a different KIND of thing each time.
       *
       * At range you are transmitting — asking a port you can see what it
       * deals in — and all that comes back is what it deals in. Standing on
       * its deck you are not asking anybody anything, you are walking into
       * the exchange, so the row stops being a request and becomes the trade
       * console.
       *
       * M used to be the only door in. That was a whole letter spent on a
       * door that opens in exactly one place, and the channel for the port
       * you are standing on is where that door belongs. */
      opts.push({
        label: docked ? 'Market' : 'Request market data',
        enabled: !!c.obj.market,
        note: !c.obj.market ? 'no registered market'
            : docked ? 'trade, refuel, repair'
            : fmtDist(c.range) + ' out',
        fn: function () {
          if (docked) { openMarket(); return; }
          selectPanel(0);
          say(c.obj.name + ' trades as a ' + (c.obj.market ? c.obj.market.roleName : 'port'), 5);
        }
      });
      /* THE LOCAL SHEET. Astra: "The data for neighboring systems should be
       * purchaseable from starports and planetside ports as well."
       *
       * What is on sale is the smaller of the two kinds of knowing — whose
       * flag flies over the systems around this one, not what is in them.
       * You still have to go to find that out, which is the point of the
       * chart being a chart rather than a survey.
       *
       * Sold from the deck rather than over the radio: a sheet is a thing
       * somebody hands you. The row still SHOWS at range, greyed, so the
       * shape of the conversation is the same wherever you are — the same
       * rule the launch-permission row follows. */
      var sheet = Galaxy.chartOffer(G.galaxy, G.here, G.charted, Galaxy.CHART_RADIUS_LY);
      opts.push({
        label: 'Buy slipspace charts',
        enabled: docked && sheet.stars.length > 0 && G.ship.credits >= sheet.cost,
        note: !docked ? 'sold on the deck'
            : !sheet.stars.length ? 'you already have every sheet they hold'
            : sheet.cost + ' cr for ' + sheet.stars.length + ' system' +
              (sheet.stars.length === 1 ? '' : 's') + ' within ' +
              Galaxy.CHART_RADIUS_LY + ' ly' +
              (G.ship.credits < sheet.cost ? '  — short by ' +
                (sheet.cost - G.ship.credits) + ' cr' : ''),
        fn: function () {
          var offer = Galaxy.chartOffer(G.galaxy, G.here, G.charted, Galaxy.CHART_RADIUS_LY);
          if (!offer.stars.length || G.ship.credits < offer.cost) return;
          G.ship.credits -= offer.cost;
          for (var ci = 0; ci < offer.stars.length; ci++) {
            G.charted[offer.stars[ci].id] = true;
          }
          say(c.obj.name + ': "Sheets transferred — ' + offer.stars.length +
              ' systems out to ' + Galaxy.CHART_RADIUS_LY + ' light years. ' +
              offer.cost + ' credits."', 6);
        }
      });
      /* THE MINING GUILD BUYS SURVEYS (mining rung 1). At any desk, for
       * what you have mapped in this system that it has not already paid
       * for - priced on what is there, how much you saw, the instrument,
       * and how old the reading is. Sold on the deck, like the charts. */
      var Sv = global.Survey;
      var sv = Sv ? Sv.saleable(G, G.sys, G.t) : [];
      var svTotal = 0;
      sv.forEach(function (s) { svTotal += s.price; });
      opts.push({
        label: 'Sell survey data',
        enabled: docked && svTotal > 0,
        note: !docked ? 'sold on the deck'
            : !sv.length ? 'nothing mapped here the Guild has not paid for'
            : 'Mining Guild: ' + svTotal + ' cr for ' + sv.length + ' survey' + (sv.length === 1 ? '' : 's'),
        fn: function () {
          var got = Sv.sell(G, G.sys, G.t);
          if (!got.total) return;
          say(c.obj.name + ' Guild office: "' + got.count + ' survey' + (got.count === 1 ? '' : 's') +
              ' on file. ' + got.total + ' credits."', 6);
        }
      });
      /* THE CARTOGRAPHERS BUY THE OTHER HALF OF THE SAME FLIGHT (charts.js,
       * 2026-11-13). The row above buys the ASSAY - what is in the ground,
       * which on a barren world is nothing. This buys the SHEET, and every
       * world has one.
       *
       * ONE WORLD AT A TIME, deliberately, and this is the whole feature:
       * publishing a rich world puts a signpost on somebody's quiet rock
       * and costs you with the Guild, while publishing a dead one costs
       * nothing at all. A desk that published the lot in one click would be
       * taking that decision for you. Same rule as the claim row below for
       * WHICH world: the one your nav is locked to, else the best-paying
       * sheet here. */
      var Ch = global.Charts;
      if (Ch) {
        var sheet1 = Ch.pick(G, G.sys, G.galaxy);
        opts.push({
          label: 'Publish a world chart',
          enabled: !!(docked && sheet1),
          note: !docked ? 'filed on the deck'
              : !sheet1 ? Ch.why(G, G.sys, G.galaxy)
              : sheet1.name + ' at ' + Math.round(sheet1.cov * 100) + '% - ' +
                sheet1.price + ' cr' +
                (sheet1.was > 0.01 ? ' for the ground they have not got' : '') +
                (sheet1.guild > 0
                  ? '  -  the Guild will mind (-' + sheet1.guild + ')' : ''),
          fn: function () {
            if (!sheet1) return;
            var got = Ch.publish(G, G.sys, G.galaxy, sheet1.key, { say: say });
            if (!got.ok) say('They will not take it: ' + got.why, 5);
          }
        });
      }
      /* A LOCATION NOBODY IS SUPPOSED TO HAVE (intel.js, 2026-11-10).
       * Astra: "you can sell the location". Only to somebody who wants
       * it - a rival of whoever built it, or the Syndicate, who will buy
       * anybody's - and the desk says plainly when this is not that
       * somebody, because "no" with a reason is the house style. */
      var In = global.Intel;
      var deal = (In && docked) ? In.best(G, G.galaxy, c.obj, G.t) : null;
      var anyFix = In ? In.fixes(G).length : 0;
      if (anyFix) {
        opts.push({
          label: 'Sell a classified location',
          enabled: !!(docked && deal),
          note: !docked ? 'sold on the deck'
              : !deal ? (In.offersAt(G, G.galaxy, c.obj, G.t)[0] || {}).why ||
                        'nothing here they would pay for'
              : (deal.fix.name || 'an unlisted installation') + ' - ' + deal.price + ' cr' +
                (deal.resale ? ' (they know it has been shopped)' : ''),
          fn: function () {
            if (!deal) return;
            var got = In.sell(G, G.galaxy, c.obj, deal.fix.key, G.t, hooksFor());
            if (!got.ok) { say('They will not take it: ' + got.why, 5); return; }
          }
        });
      }

      /* CLAIMS AND DRONES (mining rung 2). The claim is filed on the world
       * your nav is locked to; with no lock, on the best-mapped world here
       * you do not already hold. Renewal is the same line. */
      var Cl = global.Claims;
      if (Cl && Sv) {
        var clBody = null;
        if (G.navTarget && G.navTarget.kind === 'body') clBody = G.sys.byId[G.navTarget.id] || null;
        if (!clBody || !Cl.claimable(G, G.sys, clBody, G.t).ok) {
          var bestCov = -1;
          G.sys.bodies.forEach(function (b) {
            var ck = Cl.claimable(G, G.sys, b, G.t);
            if (!ck.ok || ck.renew) return;
            var rc = G.surveys[ck.key];
            if (rc.cov > bestCov) { bestCov = rc.cov; clBody = b; }
          });
        }
        var cl = clBody ? Cl.claimable(G, G.sys, clBody, G.t)
                        : { ok: false, why: 'survey a quarter of a world here first' };
        opts.push({
          label: cl.renew ? 'Renew mining claim' : 'File mining claim',
          enabled: cl.ok && G.ship.credits >= Cl.CLAIM_FEE,
          note: !cl.ok ? cl.why
              : clBody.name + ', one year - ' + Cl.CLAIM_FEE + ' cr' + (cl.renew ? ' (' + cl.why + ')' : ''),
          fn: function () {
            var got = Cl.fileClaim(G, G.sys, clBody, G.t);
            if (got.ok) say('Mining Guild: claim on ' + clBody.name + (got.renewed ? ' renewed' : ' filed') +
                            ' to day ' + Math.floor(got.claim.until / 86400) + '. Land there and set a drone down (N).', 7);
          }
        });
        var nd = G.ship.drones || 0;
        opts.push({
          label: 'Buy mining drone',
          enabled: nd < Cl.DRONE_MAX && G.ship.credits >= Cl.DRONE_PRICE,
          note: nd >= Cl.DRONE_MAX ? 'racks full - ' + nd + ' aboard'
              : Cl.DRONE_PRICE + ' cr - ' + nd + ' aboard, ' + Cl.HOPPER + ' t hopper',
          fn: function () { if (Cl.buyDrone(G).ok) say('Drone racked. ' + G.ship.drones + ' aboard.', 4); }
        });
      }
      /* A COM-SAT (comsats.js): your terminal into the relay network, sold
       * where ships are built. Launched from the planetary scanner. */
      var CsB = global.Comsats;
      if (CsB && CsB.yardAt(c.obj)) {
        var csWhy = CsB.buyRefusal(G, c.obj), ncs = G.ship.comsats || 0;
        opts.push({
          label: 'Buy com-sat',
          enabled: !csWhy,
          note: csWhy && !/^[\d,]+ cr$/.test(csWhy) ? csWhy
              : CsB.SAT_PRICE.toLocaleString('en-US') + ' cr - ' + ncs + ' aboard; launch it from orbit on the planetary scanner',
          fn: function () { var got = CsB.buy(G, c.obj); say(got.ok ? got.text : 'Com-sat: ' + got.why, 5); }
        });
      }
      if (Cl && Sv) {
        /* A stolen drone, to the back room - only where there is one. */
        if ((G.ship.hotDrones || 0) > 0 && Cl.isFence && Cl.isFence(c.obj)) {
          var fdp = Cl.fenceDronePrice(G.sys);
          opts.push({
            label: 'Fence a stolen drone',
            enabled: docked,
            note: !docked ? 'in the back room, on the deck' : fdp + ' cr, no questions - ' + G.ship.hotDrones + ' aboard',
            fn: function () {
              var got = Cl.fenceDrone(G, G.sys, c.obj);
              if (got.ok) say('The fence counts out ' + got.paid + ' cr and the drone goes through a side door.', 5);
            }
          });
        }
      }
      /* THE GUILD'S TORPEDO LOG (mining rung 3): half back on every serial
       * that went off for safety rather than for profit. Any desk - the
       * Guild has one in every port. */
      var Mn = global.Mining;
      if (Mn && (G.torpRefund || 0) > 0) {
        opts.push({
          label: 'Guild torpedo refund',
          enabled: docked,
          note: !docked ? 'paid on the deck' : Math.round(G.torpRefund) + ' cr owed on safed torpedoes',
          fn: function () {
            var got = Mn.claimRefund(G);
            if (got) say('Mining Guild: torpedo log checked - ' + got + ' cr refunded.', 5);
          }
        });
      }
      /* ---- WHO YOU SAY YOU ARE (captains.js, step 2) --------------------
       * A new name, new paint and a spoofed transponder, from a yard where
       * somebody can be bought — the grey market's own line, corruption 60.
       * Rumours and your public record attach to the identity you
       * broadcast, so a fresh one starts clean; captains who have seen the
       * HULL may still know it is you, and being caught is a seen lie.
       *
       * Deck-only, and shown greyed with its reason at an honest yard, so a
       * player can find out the service exists without being told where. */
      var CapY = global.Captains;
      if (docked && CapY) {
        var idNow = CapY.identity(G);
        var whyNot = CapY.refitRefusal(G, G.sys, c.obj, 'paint');
        var honestYard = whyNot && /nobody here/.test(whyNot);
        if (honestYard) {
          opts.push({ label: 'Refit identity…', enabled: false, note: whyNot,
                      fn: function () {} });
        } else {
          ['paint', 'full'].forEach(function (ext) {
            var R = CapY.REFITS[ext];
            var why = CapY.refitRefusal(G, G.sys, c.obj, ext);
            opts.push({
              label: 'Refit: ' + R.label + ' — ' + R.price + ' cr',
              enabled: !why,
              note: why || R.note,
              fn: function () {
                var r = CapY.refit(G, G.sys, c.obj, ext);
                if (!r.ok) { say('No: ' + r.why, 5); return; }
                say('Out of the yard as the ' + r.ident.name + ', transponder ' +
                    r.ident.transponder + '. Nobody has heard of her.', 8);
              }
            });
          });
        }
        if (idNow.disguised) {
          opts.push({
            label: 'Restore your own colours — ' + CapY.RESTORE_PRICE + ' cr',
            enabled: G.ship.credits >= CapY.RESTORE_PRICE,
            note: 'flying as the ' + idNow.name + ' (' + idNow.transponder + ')',
            fn: function () {
              var r = CapY.restoreIdentity(G, c.obj);
              say(r.ok ? 'Your own name back on the hull, and your own record with it.'
                       : 'No: ' + r.why, 6);
            }
          });
        }
      }
      /* DOCK TALK (rumours.js): what has reached THIS port about whoever
       * you are flying as, so the player can see their reputation travel
       * rather than infer it from cold shoulders. */
      var Rm = global.Rumours, CapT = global.Captains;
      if (docked && Rm && G.rumours && CapT) {
        var heardHere = Rm.portHeard(G, G.sys, c.obj.id, G.t, CapT.identity(G).key);
        opts.push({
          label: 'Listen to the dock talk', enabled: true,
          note: heardHere.length ? heardHere.length + ' thing' + (heardHere.length > 1 ? 's' : '') +
                                   ' said about you here' : 'nobody here is talking about you',
          fn: function () {
            if (!heardHere.length) { say('Nobody at ' + (c.obj.name || 'this port') + ' has heard of you.', 5); return; }
            heardHere.sort(function (a, b) {
              return Rm.weightOf(b.R, G.sys.starId, G.t) - Rm.weightOf(a.R, G.sys.starId, G.t);
            });
            heardHere.slice(0, 3).forEach(function (h, i) {
              var line = Rm.lineFor(G, G.sys, { R: h.R, via: c.obj.id, here: h.R.star === G.sys.starId },
                                    'dock|' + c.obj.id + '|' + i);
              if (line) say(line, 8);
            });
          }
        });
      }
      opts.push({ label: 'Mission board', enabled: true,
                  note: 'F7', fn: function () { selectPanel(6); } });
    } else if (G.talkMenu === c.name) {
      /* TALK. Your own words, or a plain question. Behind one row on the
       * main list so the ship menu does not grow past the pane. */
      var inR = !c.hostile && c.range <= Combat.HAIL_RANGE_KM;
      opts.push({
        label: 'Send a message…', enabled: inR && !!global.Messages,
        note: !inR ? 'out of transmitter range' : 'your own words — they will read them',
        fn: function () { G.talkMenu = null; beginMsgEdit('message', { name: c.name }, ''); }
      });
      opts.push({
        label: 'Ask what they carry, and where', enabled: inR && !!global.Messages,
        note: !inR ? 'out of transmitter range' : 'a wary captain may not say',
        fn: function () {
          G.talkMenu = null;
          global.Messages.askCargo(G, G.sys, G.t, c.obj, hooksFor());
        }
      });
      /* FAVOURS (favours.js). Only when she owes you, and each with what
       * it will do in the note. */
      var Fav = global.Favours;
      if (Fav && inR) {
        Fav.favourOptions(G, G.sys, c.obj, G.t).forEach(function (o) {
          opts.push({
            label: o.label, enabled: o.enabled, note: o.note,
            fn: function () {
              G.talkMenu = null;
              Fav.callIn(G, G.sys, c.obj, o.id, G.t, hooksFor());
            }
          });
        });
        /* "Looking for another fleetmate?" — shown only to a captain who
         * would actually make the offer, so the row is never a tease. */
        if (!Fav.recruitRefusal(G, G.sys, c.obj)) {
          opts.push({
            label: 'Go into business together…', enabled: true,
            note: 'she brings her ship, or comes aboard herself',
            fn: function () { G.talkMenu = null; G.recruitMenu = c.name; }
          });
        }
      }
      opts.push({ label: 'Back', enabled: true, fn: function () { G.talkMenu = null; } });
    } else if (G.recruitMenu === c.name && global.Favours) {
      /* Astra: "Offer both." Two deals, each spelled out before it is
       * struck, because neither can be taken back with a click. */
      var FavR = global.Favours;
      var recP = global.Captains ? global.Captains.profile(G, G.sys, c.obj) : null;
      var recRole = recP && Crew && Crew.ROLES ? Crew.ROLES[FavR.roleFor(recP)] : null;
      var roleName = recRole ? recRole.name.toLowerCase() : 'officer';
      opts.push({
        label: 'Partners — she brings the ' + (c.name || 'ship'), enabled: true,
        note: 'joins your fleet and takes orders · stays hers · profit 50/50 · cannot be sold · leaves if you mistreat her',
        fn: function () {
          G.recruitMenu = null;
          var r = FavR.recruit(G, G.sys, c.obj, 'partner', G.t, hooksFor());
          if (!r.ok) say('No: ' + r.why, 5);
        }
      });
      opts.push({
        label: 'Crew — she comes aboard as your ' + roleName, enabled: true,
        note: 'a skilled officer at a friend\'s wage · her mate takes her ship home',
        fn: function () {
          G.recruitMenu = null;
          var r = FavR.recruit(G, G.sys, c.obj, 'crew', G.t, hooksFor());
          if (!r.ok) say('No: ' + r.why, 5);
        }
      });
      opts.push({ label: 'Not now', enabled: true, fn: function () { G.recruitMenu = null; } });
    } else if (G.piracyMenu === c.name) {
      /* The other side of the gun. Everything the pirates have been doing
       * to the player, offered back — with the same witness rules, the same
       * distress clock, and the same police at the end of it. */
      opts.push({
        label: 'Demand cargo', enabled: true,
        note: 'they dump it; you scoop it',
        fn: function () {
          G.piracyMenu = null;
          Combat.demandFrom(G.sys, G, G.t, c.obj, 'cargo', hooksFor());
        }
      });
      /* Two ways into one purse (upkeep.js, 2026-10-30): the cash box, or
       * her account down to what she needs to make port. A ship with no
       * timetable (a pirate, a lane hauler torn out of slipspace) has only
       * the cash it carries, and the second row does not show. */
      var herRoute = c.obj && (c.obj.route || c.obj.liftedFrom || (c.obj.spec && c.obj.spec.liftedFrom));
      var hasAccount = !!(herRoute && global.Upkeep && global.Upkeep.eligible(herRoute));
      opts.push({
        label: hasAccount ? 'Demand the cash box' : 'Demand credits', enabled: true,
        note: hasAccount ? 'the cash aboard · a tenth of her purse' : 'wired straight to your account',
        fn: function () {
          G.piracyMenu = null;
          Combat.demandFrom(G.sys, G, G.t, c.obj, 'credits', hooksFor());
        }
      });
      if (hasAccount) {
        opts.push({
          label: 'Demand a transfer', enabled: true,
          note: 'all she has but what she needs to make port',
          fn: function () {
            G.piracyMenu = null;
            Combat.demandFrom(G.sys, G, G.t, c.obj, 'account', hooksFor());
          }
        });
      }
      /* BOARDING BY FORCE (boarding part 3, 2026-10-31): her drive cut on
       * your say-so, and then you go over. The odds are on the row, as the
       * prices are on the trade rows. */
      var herSpec = c.obj && (c.obj.spec || null);
      var dead = !!(herSpec && herSpec.disabled) || !!(c.obj && c.obj.disabled);
      if (Combat.demandSurrender) {
        var oddsS = herSpec && Combat.surrenderOdds ? Combat.surrenderOdds(G.sys, G, herSpec) : null;
        opts.push({
          label: dead ? 'She is dead in space' : 'Heave to  -  stand by to be boarded', enabled: !dead,
          note: dead ? 'park within 150 m, match her, and go across in your suit'
              : oddsS !== null ? 'she cuts her drive and waits for you  -  about ' + Math.round(oddsS * 100) + '% she does'
              : 'she cuts her drive and waits for you  -  or runs',
          fn: function () {
            G.piracyMenu = null;
            var r = Combat.demandSurrender(G.sys, G, G.t, c.obj, hooksFor());
            if (!r.ok && r.why) say(r.why, 6);
          }
        });
      }
      opts.push({
        label: 'Never mind', enabled: true,
        fn: function () { G.piracyMenu = null; }
      });
    } else {
      /* ---- TALKING TO A SHIP ------------------------------------------
       * Astra: "the ability to hail other ships to ask for directions,
       * assistance or to trade". Three intents, each with its price or its
       * answer visible in the note before it is pressed — the same contract
       * the port rows keep, because a row that might cost you 400 credits
       * and might do nothing is a row nobody presses twice.
       *
       * Combat owns what actually happens; this only asks. The quotes in
       * the notes come from the same two functions the transaction uses, so
       * the price shown and the price charged cannot drift apart. */
      var inRange = !c.hostile && c.range <= Combat.HAIL_RANGE_KM;
      var aid = (!c.hostile && c.obj) ? Combat.hailAssist(G, c.obj) : null;
      /* HAIL IS A GREETING NOW, and the greeting is the relationship.
       * Astra: "Are you a filthy pirate, or do you rescue stranded ships?"
       * Who answers, and how they sound, comes from what this captain has
       * seen you do — or, if they have never met you, from what you have
       * done in public — through their own temper and values. See
       * Captains.greeting. The note names who is in the chair before you
       * press anything, so the mood is a thing you can read, not a dice
       * roll you find out about. */
      var Cap = global.Captains;
      var who = (Cap && c.obj && !c.hostile) ? Cap.describe(G, G.sys, c.obj) : null;
      opts.push({
        label: 'Hail', enabled: true,
        note: c.hostile ? 'they are not talking' : !inRange ? 'out of transmitter range' : who,
        fn: function () {
          if (c.hostile) { say(c.name + ' does not answer.', 4); return; }
          if (!inRange) { say(c.name + ' is too far out to raise.', 4); return; }
          /* speak, not greeting: the captain remembers having said it, so
           * the next hail is a different line (captains.js RECALL). */
          var g = Cap ? Cap.speak(G, G.sys, c.obj, G.t) : null;
          if (!g) { say(c.name + ' acknowledges.', 4); return; }
          say(g.speaker + ', ' + c.name + ': "' + g.text + '"', 9);
        }
      });
      /* A WARSHIP IS NOT A SHOP. A capital answers one way whatever you
       * ask it, so offering three rows that all say the same thing would
       * be the interface promising something the fiction refuses. One row
       * instead, named for what it actually is. */
      var isCapital = !!(c.obj && (c.obj.cls === 'capital' || c.obj.kind === 'capital'));
      if (isCapital) {
        opts.push({
          label: 'Answer the watch',
          enabled: inRange,
          note: !inRange ? 'out of transmitter range'
              : 'they will tell you where you stand',
          fn: function () { Combat.hailShip(G, G.sys, G.t, c.obj, 'hail', hooksFor()); }
        });
      }
      opts.push({
        label: 'Ask for directions',
        enabled: inRange && !isCapital,
        note: !inRange ? 'out of transmitter range'
            : isCapital ? 'they are not here to help you navigate'
            : (c.obj.route && c.obj.route._told) ? 'they have told you what they know'
            : 'what they passed on the way in',
        fn: function () { Combat.hailShip(G, G.sys, G.t, c.obj, 'directions', hooksFor()); }
      });
      /* YOUR OWN SHIP. A contact flying one of your orders answers as
       * yours: the pilot's report, not a stranger's three intents. */
      var mineRec = (c.obj && c.obj.route && c.obj.route.kind === 'fleet' && Fleet)
        ? Fleet.byId(G, c.obj.route.fleetId) : null;
      if (mineRec) {
        opts.push({
          label: 'Raise the bridge',
          enabled: inRange,
          note: !inRange ? 'out of transmitter range' : 'she is yours — ask how she is doing',
          fn: function () { say(Fleet.report(G, mineRec, G.t), 9); }
        });
      }
      /* RUMOURS. What they have heard — a true fact about this system's
       * markets or its lanes, one per ship per day. See Combat.hailRumour. */
      var rumoured = !!(c.obj && c.obj.route &&
                        c.obj.route._rumourDay === Math.floor(G.t / Combat.RUMOUR_DAY));
      opts.push({
        label: 'Ask around',
        enabled: inRange && !isCapital && !rumoured,
        note: !inRange ? 'out of transmitter range'
            : isCapital ? 'a warship does not gossip'
            : rumoured ? 'that is all they have heard today'
            : 'what the crew have heard — markets, lanes',
        fn: function () { Combat.hailShip(G, G.sys, G.t, c.obj, 'rumour', hooksFor()); }
      });
      opts.push({
        label: 'Talk…', enabled: inRange && !isCapital && !!global.Messages,
        note: !inRange ? 'out of transmitter range'
            : isCapital ? 'a warship does not chat' : 'your own words, or a question',
        fn: function () { G.talkMenu = c.name; G.piracyMenu = null; }
      });
      /* TRADE. One row where there were two, because there is a board
       * behind it now: every line in their hold and every line in yours,
       * priced. The note says the one thing worth knowing before you open
       * it — and if they will not deal, why, in words. */
      var tradeWhy = (c.obj && global.ShipTrade) ? global.ShipTrade.refusal(G, G.sys, c.obj) : 'no channel';
      var tradeCon = (!tradeWhy && global.ShipTrade)
        ? global.ShipTrade.board(G, G.sys, G.t, c.obj) : null;
      opts.push({
        label: 'Trade\u2026',
        enabled: !tradeWhy,
        note: tradeWhy ? clipText(tradeWhy, 64)
            : tradeCon && tradeCon.consequence.loss
              ? 'dealing here costs you with ' + tradeCon.consequence.loss.name
            : tradeCon ? tradeCon.flag.name + ' \u00b7 ' + tradeCon.label
            : '',
        fn: function () { G.shipDeal = { name: c.name, sel: 0 }; }
      });
      /* ASKING TO COME ABOARD (boarding.js, 2026-10-29). Astra agreed the
       * invited crossing is a tube she runs out to you, so the row's note
       * says the one thing to fix first — closer, slower, or who you are
       * to her — before you ask. Joined, the same row reels it back in. */
      var BD = global.Boarding;
      if (BD && G.ship.tether && G.ship.tether.name === c.name) {
        var joinedT = !!G.ship.tether.joined;
        opts.push({
          label: joinedT ? 'Reel the tube in' : 'Call her off', enabled: true,
          note: joinedT ? 'U does the same  —  to cross, get up and go out through your airlock'
                        : 'she is coming alongside  —  hold where you are',
          fn: function () {
            BD.release(G, G.sys);
            say(joinedT ? 'Tube reeled in. You are adrift beside the ' + c.name + '.'
                        : c.name + ' goes back to her lane.', 5);
          }
        });
      } else if (BD) {
        var boardWhy = c.hostile ? 'not answering'
                     : (BD.NEVER[c.obj && (c.obj.cls || c.obj.kind)] ? 'she does not take visitors'
                     : (!c.obj || !c.obj.route) ? 'no berth for visitors aboard'
                     : BD.gate(G, c.obj));
        opts.push({
          label: 'Ask to come aboard',
          enabled: !boardWhy,
          note: boardWhy ? clipText(boardWhy, 64) : 'if she will, she comes alongside and runs a tube to your hatch',
          fn: function () {
            var r = BD.join(G, G.sys, G.t, c.obj);
            if (r.ok) say(c.name + ': "' + r.line + '"   —   hold where you are', 9);
            else say(c.name + (r.line ? ': "' + r.line + '"' : ' will not have you aboard') + '   (' + r.why + ')', 7);
          }
        });
      }
      opts.push({
        label: 'Request assistance',
        enabled: inRange && !isCapital && !!aid && G.ship.credits >= aid.cost,
        note: !inRange ? 'out of transmitter range'
            : isCapital ? 'they are not a tender'
            : !aid ? 'your tank is not their problem'
            : aid.what + ' — ' + aid.cost + ' cr' +
              (G.ship.credits < aid.cost ? ' (you are short)' : ''),
        fn: function () { Combat.hailShip(G, G.sys, G.t, c.obj, 'assist', hooksFor()); }
      });
      opts.push({
        label: 'Offer payment', enabled: !!c.hostile && G.ship.credits > 0,
        note: c.hostile ? 'buys you an exit' : null,
        fn: function () {
          if (G.encounter && G.encounter.demand) { complyWithDemand(); selectPanel(0); }
          else say(c.name + ' has not asked you for anything.', 4);
        }
      });
      opts.push({
        label: 'Piracy…', enabled: !c.hostile,
        note: 'witnesses talk. So do survivors.',
        fn: function () { G.piracyMenu = c.name; }
      });
    }
    return opts;
  }

  /* The hooks combat wants, built from what this module was bound with. */
  function hooksFor() {
    return { say: say, sound: function (n) { if (global.Sound) global.Sound.fx(n); } };
  }

  /* --- F5: ship status and inventory -------------------------------------
   * The hold, itemised, with a way to throw each line out of the ship. The
   * jettison controls sit beside cargo and NOWHERE ELSE: fitted equipment
   * is on the same screen and deliberately has no button, because "eject"
   * is a thing you do to freight, not to your own drive. */
  /* ---- F5 / PANELS: which page sits on which mount ----------------------
   *
   * WHY THIS EXISTS. The panels used to be reassigned by clicking them in
   * the cockpit, and Astra's objection is the right one: it is too easy.
   * The hit box is the bounding box of a projected quad, so at any oblique
   * angle it covers canopy that is not the panel, and an instrument you fly
   * by changes under a stray click.
   *
   * LAID OUT AS THE CONSOLE IS, not as a list. `Render.MFD_MOUNTS` carries
   * each screen's bearing, so the arrangement here is read off the same
   * numbers that place them in the world rather than typed twice: the three
   * forward screens sit in their real angular order across the top, and the
   * two on the rear bulkhead sit below, behind the seat.
   *
   * POINTERS, NOT THE WORDS "LEFT" AND "RIGHT". Astra's standing note, and
   * it is doubly right here: the screen at bearing -145 degrees is on your
   * left while you face forward and on your RIGHT the moment you turn round
   * to read it, so a word would be wrong half the time and an arrow never
   * is. */
  function mountArc() {
    var m = (Render && Render.MFD_MOUNTS) || [];
    var fwd = [], aft = [];
    for (var i = 0; i < m.length; i++) {
      /* Forward of the beam or behind it — the mount's own bearing decides,
       * so a console that grows a sixth screen lands in the right half
       * without this function learning its name. */
      (Math.abs(m[i].bearing) < Math.PI / 2 ? fwd : aft).push(m[i]);
    }
    var byBearing = function (a, b) { return a.bearing - b.bearing; };
    return { fwd: fwd.sort(byBearing), aft: aft.sort(byBearing) };
  }

  /* THE BRIDGE DECK'S STATIONS (2026-10-25), on a conning-tower bridge.
   * Astra: "On that conning tower bridge should be MFD panels which are
   * configurable, as with the smaller ships." Each crew station's screen
   * (ShipDeck.stationScreen) is a mount like the helm's, named for the job
   * at it. Empty on every other hull. */
  function deckStations() {
    if (!Render || !Render.bridgeSpec || !Render.bridgeSpec(G.ship) || !Render.shipInterior) return [];
    var d = Render.shipInterior(G.ship);
    if (!d || !d.plan.tower) return [];
    var SD = global.ShipDeck, names = (SD && SD.ROLE_NAME) || {};
    var out = [], count = {};
    d.plan.stations.forEach(function (st, i) {
      if (st.cockpit) return;
      count[st.role] = (count[st.role] || 0) + 1;
      out.push({ id: 'station-' + i, role: st.role, side: st.side, z: st.z,
                 name: (names[st.role] || st.role) + ' ' + count[st.role] });
    });
    return out;
  }

  /* A plan of the deck, bow up the page: each wall's stations in their
   * fore-and-aft order, the aisle between. Which wall a screen is on is
   * shown by where its tile sits and the arrow pointing at that wall, not
   * by a word. */
  function drawDeckStations(ctx, sts, bayX, bayY, bayW, bayH) {
    var tileW = Math.min(170, (bayW - 120) / 2), tileH = 50, gap = 10;
    var rows = {};
    sts.forEach(function (o) { rows[o.side] = (rows[o.side] || []).concat([o]); });
    var nRows = Math.max((rows[-1] || []).length, (rows[1] || []).length, 1);
    var blockH = nRows * (tileH + gap) + 40;
    var y0 = bayY + Math.max(30, (bayH - blockH) / 2);
    var cx = bayX + bayW / 2;
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(125,255,207,0.45)';
    ctx.fillText('▲  helm  ▲', cx, y0 - 12);
    ctx.strokeStyle = 'rgba(125,255,207,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y0 + nRows * (tileH + gap)); ctx.stroke();
    [-1, 1].forEach(function (side) {
      var list = (rows[side] || []).slice().sort(function (a, b) { return b.z - a.z; });
      var x = side < 0 ? cx - 40 - tileW : cx + 40;
      list.forEach(function (o, k) {
        var y = y0 + k * (tileH + gap);
        var page = dash.pageFor(o.id, o.role), on = G.panelPick === o.id;
        ctx.fillStyle = on ? '#12414f' : '#081419';
        ctx.fillRect(x, y, tileW, tileH);
        ctx.strokeStyle = MFD_EDGE;
        ctx.lineWidth = on ? 2 : 1;
        ctx.strokeRect(x + 1, y + 1, tileW - 2, tileH - 2);
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.fillStyle = on ? '#b4f0ff' : MFD_INK;
        ctx.fillText(page.title, x + tileW / 2, y + 22);
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillStyle = '#5d6f78';
        ctx.fillText(o.name, x + tileW / 2, y + 39);
        /* From the aisle to the wall this screen is on. */
        ctx.fillStyle = 'rgba(125,255,207,0.45)';
        ctx.fillText(side < 0 ? '◀' : '▶', side < 0 ? x + tileW + 20 : x - 20, y + tileH / 2 + 4);
        hot(x, y, tileW, tileH, (function (id) {
          return function () { G.panelPick = id; };
        })(o.id), 'select this station\'s screen');
      });
    });
    ctx.fillStyle = '#5d6f78';
    ctx.fillText('the bridge deck, aft of the helm', cx, y0 + nRows * (tileH + gap) + 14);
    ctx.textAlign = 'left';
  }

  /* ---- ORDNANCE: the rock torpedo launch panel ---------------------------
   * Astra: "for something like that, the player should have to use an
   * internal panel, uncover the launch switch, then launch it." A nuclear
   * charge is not on the trigger. You point the nose, come here, read what
   * the nose is on, choose the charge, lift the guard (C, or click it), and
   * press LAUNCH (Enter, or click). The guard drops after every launch and
   * whenever you leave this tab - one charge per lift, deliberately. */
  var NOSE_LOOK = 12;     // km down the nose the panel reads rock from
  function noseReading() {
    var Mn = global.Mining, s = G.ship;
    if (!Mn || !G.sys || s.docked || s.landed) return null;
    var fwd = V.norm(s.fwd);
    var rocks = Mn.rocksNear(G, G.sys, V.addScaled(s.pos, fwd, NOSE_LOOK / 2), G.t, NOSE_LOOK / 2 + 1);
    var best = null;
    rocks.forEach(function (r) {
      var rel = V.sub(r.pos, s.pos), along = V.dot(rel, fwd);
      if (along <= 0) return;
      var off = V.len(V.addScaled(rel, fwd, -along));
      if (off > r.size) return;                        // the path misses it
      if (!best || along < best.along) best = { rock: r, along: along };
    });
    var np = Mn.nearestPort(G.sys, s.pos, G.t);
    return { rock: best, port: np };
  }

  function drawOrdnanceTab(ctx, pad, top, w, bottom) {
    var s = G.ship, Mn = global.Mining;
    var MS = Combat.MISSILES;
    var racks = Combat.racksOf ? Combat.racksOf(s) : (s.racks || {});
    var kinds = ['rocktorp', 'syndtorp'].filter(function (k) { return racks[k] && racks[k].n > 0; });
    if (!G.torpPick || kinds.indexOf(G.torpPick) < 0) G.torpPick = kinds[0] || null;

    var x = pad, y = top + 6, pw = Math.min(w - pad * 2, 900), ph = bottom - top - pad - 6;
    ctx.save();
    ctx.fillStyle = '#05090c';
    ctx.fillRect(x, y, pw, ph);
    ctx.strokeStyle = MFD_EDGE; ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, pw - 4, ph - 4);

    /* Left: what is in the racks, and which charge is loaded. */
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('ROCK CHARGE RACKS', x + 16, y + 26);
    var ry = y + 50;
    if (!kinds.length) {
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('No rock torpedoes aboard.', x + 16, ry);
      ctx.fillText('The Mining Guild sells them at its halls;', x + 16, ry + 18);
      ctx.fillText('the Syndicate sells them where it is the landlord.', x + 16, ry + 36);
    }
    kinds.forEach(function (k) {
      var on = G.torpPick === k, m = MS[k];
      ctx.fillStyle = on ? '#12414f' : '#081419';
      ctx.fillRect(x + 14, ry - 16, 330, 26);
      ctx.strokeStyle = on ? '#7dffcf' : MFD_EDGE; ctx.lineWidth = on ? 2 : 1;
      ctx.strokeRect(x + 15, ry - 15, 328, 24);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = on ? '#ffffff' : MFD_INK;
      ctx.fillText((on ? 'LOADED  ' : '        ') + m.name.toUpperCase() + '  x' + racks[k].n, x + 22, ry + 2);
      hot(x + 14, ry - 16, 330, 26, function () { G.torpPick = k; G.torpCover = false; }, 'pick');
      ry += 34;
    });
    ry += 8;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    [ 'Dumb charge: 200 m/s down the nose, no seeker.',
      'Arms 500 m out. Self-destructs after 5 minutes.',
      'Blast 1 km - keep clear. Near a station it is sabotage.',
      'Never carry one home: a berth scan seizes it.' ].forEach(function (l) {
      ctx.fillText(l, x + 16, ry); ry += 15;
    });
    if ((G.torpRefund || 0) > 0) {
      ctx.fillStyle = '#7dffb0';
      ctx.fillText('Guild refund owed: ' + Math.round(G.torpRefund) + ' cr, any desk', x + 16, ry + 6);
    }

    /* Middle: what the nose is on, read before you commit. */
    var mx = x + 370;
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('NOSE', mx, y + 26);
    var nr = noseReading();
    ctx.font = 'bold 12px ui-monospace, monospace';
    var ny = y + 50;
    if (!nr) {
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(s.docked ? 'In a berth.' : s.landed ? 'On the ground.' : 'No reading.', mx, ny);
    } else {
      if (nr.rock) {
        var rk = nr.rock.rock;
        ctx.fillStyle = '#ffd27a';
        ctx.fillText('ON ROCK - ' + (rk.kind || 'rock').toUpperCase() + ', ' + Math.round(rk.size * 1000) + ' m', mx, ny);
        ctx.fillStyle = MFD_INK;
        ctx.fillText(nr.rock.along.toFixed(2) + ' km  -  ' + Math.round(nr.rock.along / Mn.TORP_SPEED) + ' s to impact', mx, ny + 18);
        if (rk.size < Mn.TORP_SHATTER) { ctx.fillStyle = MFD_DIM; ctx.fillText('small enough to shatter', mx, ny + 36); }
        if (nr.rock.along < Mn.TORP_ARM) {
          ctx.fillStyle = '#ff9f7a';
          ctx.fillText('INSIDE ARMING RANGE - it will pass', mx, ny + 54);
        } else if (nr.rock.along < Mn.TORP_BLAST * 1.2) {
          ctx.fillStyle = '#ff9f7a';
          ctx.fillText('YOU ARE INSIDE THE BLAST - back off', mx, ny + 54);
        }
      } else {
        ctx.fillStyle = MFD_DIM;
        ctx.fillText('No rock within ' + NOSE_LOOK + ' km down the nose.', mx, ny);
        ctx.fillText('A launch now is a safing shot.', mx, ny + 18);
      }
      if (nr.port) {
        var near = nr.port.dist < Mn.TORP_CLEAR_OF_PORT;
        ctx.fillStyle = near ? '#ff6b5a' : MFD_DIM;
        var pd = nr.port.dist;
        var pdTxt = pd < 1000 ? pd.toFixed(1) + ' km' : pd < 1e6 ? Math.round(pd) + ' km'
                  : (pd / 1.495978707e8).toFixed(2) + ' AU';
        ctx.fillText(near ? 'STATION CLOSE' : 'nearest station', mx, ny + 84);
        ctx.fillText(clipText(nr.port.port.name, 24) + '  ' + pdTxt, mx, ny + 102);
      }
    }

    /* Under the nose: what is already out there, and the command link to
     * it. DISARM safes one (it drifts on inert, scoop it back); DETONATE
     * blows it where it is. Out of link range the buttons go dead. */
    var fl = Mn ? Mn.torpedoesInFlight(G.sys) : [];
    var fy = y + 190;
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('IN FLIGHT', mx, fy);
    ctx.font = 'bold 11px ui-monospace, monospace';
    if (!fl.length) {
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('nothing out', mx, fy + 20);
    } else {
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('D disarms, X detonates the newest', mx, fy + 18);
    }
    fl.slice(-6).reverse().forEach(function (tp, i) {
      var ly = fy + 40 + i * 36;
      var d = V.dist(G.ship.pos, tp.pos);
      var inLink = d <= Mn.TORP_LINK;
      var armedNow = G.t >= tp.born + Mn.TORP_ARM / Mn.TORP_SPEED;
      var left = Math.max(0, tp.dies - G.t);
      /* Still inside its own blast radius of you: detonating it now hurts. */
      var tooClose = d < Mn.TORP_BLAST * 1.1;
      ctx.fillStyle = !inLink ? MFD_DIM : tooClose ? '#ff6b5a' : MFD_INK;
      if (tooClose && inLink) ctx.fillText('inside the blast - detonating hurts you', mx, ly + 14);
      ctx.fillStyle = !inLink ? MFD_DIM : tooClose ? '#ff6b5a' : MFD_INK;
      ctx.fillText((tp.guild ? 'GUILD ' : 'UNREG ') + (d < 100 ? d.toFixed(1) : Math.round(d)) + ' km  ' +
                   (armedNow ? 'ARMED' : 'arming') + '  ' + Math.floor(left / 60) + ':' +
                   ('0' + Math.floor(left % 60)).slice(-2), mx, ly);
      function btn(bx0, label, colour, fn) {
        ctx.fillStyle = inLink ? colour : '#1a2226';
        ctx.fillRect(bx0, ly - 13, 78, 20);
        ctx.fillStyle = inLink ? '#05090c' : '#4a5a60';
        ctx.textAlign = 'center';
        ctx.fillText(label, bx0 + 39, ly + 1);
        ctx.textAlign = 'left';
        if (inLink) hot(bx0, ly - 13, 78, 20, fn, label.toLowerCase());
      }
      btn(mx + 200, 'DISARM', '#7dffcf', function () { Mn.disarmTorpedo(G.sys, G, G.t, tp.id, hooksFor()); });
      btn(mx + 284, 'DETONATE', '#ff9f7a', function () { Mn.detonateTorpedo(G.sys, G, G.t, tp.id, hooksFor()); });
    });

    /* Right: the guarded switch. */
    var gx = x + pw - 230, gy = y + 40, gw2 = 190, gh2 = 150;
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('LAUNCH', gx, y + 26);
    var live = !!G.torpPick && !s.docked && !s.landed;
    /* The button underneath. */
    ctx.fillStyle = '#1a0606';
    ctx.fillRect(gx, gy, gw2, gh2);
    ctx.strokeStyle = '#6b2a24'; ctx.lineWidth = 2;
    ctx.strokeRect(gx + 1, gy + 1, gw2 - 2, gh2 - 2);
    var bx = gx + gw2 / 2, by = gy + gh2 / 2 + 8;
    ctx.beginPath(); ctx.arc(bx, by, 44, 0, Math.PI * 2);
    ctx.fillStyle = G.torpCover && live ? '#e0392b' : '#5a1d18';
    ctx.fill();
    ctx.strokeStyle = '#2a0c0a'; ctx.lineWidth = 4; ctx.stroke();
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = G.torpCover && live ? '#fff2ee' : '#a26a64';
    ctx.fillText('LAUNCH', bx, by + 5);
    if (G.torpCover) {
      /* The cover, flipped up above the housing. */
      ctx.fillStyle = 'rgba(255,200,40,0.85)';
      ctx.fillRect(gx, gy - 34, gw2, 26);
      ctx.save();
      ctx.beginPath(); ctx.rect(gx, gy - 34, gw2, 26); ctx.clip();
      ctx.fillStyle = '#111';
      for (var st = -26; st < gw2; st += 18) {
        ctx.beginPath();
        ctx.moveTo(gx + st, gy - 8); ctx.lineTo(gx + st + 9, gy - 8);
        ctx.lineTo(gx + st + 35, gy - 34); ctx.lineTo(gx + st + 26, gy - 34);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#ffd27a';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText('GUARD UP - C to close', bx, gy + gh2 + 18);
      if (live) hot(gx, gy, gw2, gh2, function () {
        Combat.launchTorpedo(G.sys, G, G.t, G.torpPick, hooksFor());
      }, 'launch');
    } else {
      /* The cover, down over the button: striped, and in the way. */
      ctx.fillStyle = 'rgba(255,200,40,0.9)';
      ctx.fillRect(gx + 6, gy + 6, gw2 - 12, gh2 - 12);
      ctx.save();
      ctx.beginPath(); ctx.rect(gx + 6, gy + 6, gw2 - 12, gh2 - 12); ctx.clip();
      ctx.fillStyle = '#111';
      for (var s2 = -gh2; s2 < gw2; s2 += 22) {
        ctx.beginPath();
        ctx.moveTo(gx + s2, gy + gh2); ctx.lineTo(gx + s2 + 11, gy + gh2);
        ctx.lineTo(gx + s2 + 11 + gh2, gy); ctx.lineTo(gx + s2 + gh2, gy);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(5,9,12,0.85)';
      ctx.fillRect(gx + 30, gy + gh2 / 2 - 14, gw2 - 60, 26);
      ctx.fillStyle = live ? '#ffd27a' : '#8a7a50';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(live ? 'LIFT GUARD (C)' : (G.torpPick ? 'NOT HERE' : 'EMPTY'), bx, gy + gh2 / 2 + 4);
      if (live) hot(gx, gy, gw2, gh2, function () { G.torpCover = true; say('Launch guard up', 2); }, 'guard');
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function drawPanelsTab(ctx, pad, top, w, bottom) {
    if (!dash) return;
    var arc = mountArc();
    var sts = deckStations(), stById = {};
    sts.forEach(function (o) { stById[o.id] = o; });
    if (G.panelsView !== 'deck' || !sts.length) G.panelsView = 'helm';
    var picked = String(G.panelPick || '');
    if (G.panelsView === 'deck' && !stById[picked]) G.panelPick = sts[0].id;
    if (G.panelsView === 'helm' && (!G.panelPick || picked.indexOf('station-') === 0)) G.panelPick = 'centre';
    var pickRole = stById[G.panelPick] ? stById[G.panelPick].role : undefined;

    var listW = Math.min(190, Math.max(150, w * 0.2));
    var bayW = w - pad * 2 - listW - 16;
    var bayX = pad, bayY = top, bayH = bottom - top - pad;

    /* Helm or bridge deck, on a hull that has both. */
    if (sts.length) {
      [['helm', 'HELM'], ['deck', 'BRIDGE DECK']].forEach(function (c, ci) {
        var cw = 120, chx = bayX + ci * (cw + 8), on = G.panelsView === c[0];
        ctx.fillStyle = on ? '#12414f' : 'rgba(8,20,25,0.7)';
        ctx.fillRect(chx, bayY, cw, 20);
        ctx.strokeStyle = on ? MFD_EDGE : 'rgba(74,151,176,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(chx + 0.5, bayY + 0.5, cw - 1, 19);
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = on ? '#b4f0ff' : MFD_INK;
        ctx.textAlign = 'center';
        ctx.fillText(c[1], chx + cw / 2, bayY + 14);
        ctx.textAlign = 'left';
        hot(chx, bayY, cw, 20, function () { G.panelsView = c[0]; },
            c[0] === 'deck' ? 'the crew stations\' screens' : 'the helm\'s screens');
      });
      bayY += 28; bayH -= 28;
    }

    /* --- the console, in plan --- */
    var tileW = Math.min(150, (bayW - 24) / Math.max(1, arc.fwd.length) - 10);
    var tileH = 54;

    function seat(cx, cy) {
      ctx.strokeStyle = 'rgba(125,255,207,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(125,255,207,0.45)';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▲', cx, cy - 19);          // nose points up the page
      ctx.fillText('▼', cx, cy + 27);
      ctx.textAlign = 'left';
    }

    function mountTile(m, x, y) {
      var page = dash.pageFor(m.id);
      var on = G.panelPick === m.id;
      var dead = !!(G.deadPanels && G.deadPanels[m.id]);
      ctx.fillStyle = on ? '#12414f' : '#081419';
      ctx.fillRect(x, y, tileW, tileH);
      ctx.strokeStyle = dead ? '#7a4a4a' : MFD_EDGE;
      ctx.lineWidth = on ? 2 : 1;
      ctx.strokeRect(x + 1, y + 1, tileW - 2, tileH - 2);
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px ui-monospace, monospace';
      /* A BROKEN SCREEN STILL SHOWS WHAT IS ASSIGNED TO IT. Reading only
       * "PANEL OUT" hides the setting behind the damage, so you could not
       * decide what a screen will show before paying to fix it. The page
       * stays, dimmed, and the damage is called out on the line below. */
      ctx.fillStyle = dead ? '#6d5252' : (on ? '#b4f0ff' : MFD_INK);
      ctx.fillText(page.title, x + tileW / 2, y + 24);
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillStyle = dead ? '#c07a7a' : '#5d6f78';
      /* The bearing, which is the honest name for where this screen is. */
      ctx.fillText(dead ? 'PANEL OUT'
                   : Math.round(m.bearing * 180 / Math.PI) + '°',
                   x + tileW / 2, y + 41);
      ctx.textAlign = 'left';
      hot(x, y, tileW, tileH, (function (id) {
        return function () { G.panelPick = id; };
      })(m.id), 'select this mount');
    }

    if (G.panelsView === 'deck') {
      drawDeckStations(ctx, sts, bayX, bayY, bayW, bayH);
    } else {
    var cx = bayX + bayW / 2;
    /* The console block sits in the middle of the bay rather than hanging
     * off the top of it: this tab is a picture of a cockpit, and a cockpit
     * pinned to the ceiling of a tall window reads as a list that has lost
     * its footing. The height is known up front — two rows, the seat and
     * the caption — so it can simply be centred. */
    var blockH = tileH * 2 + 46 + 42 + 28;
    var rowFwdY = bayY + Math.max(10, (bayH - blockH) / 2);
    var totalW = arc.fwd.length * tileW + (arc.fwd.length - 1) * 10;
    var fx = cx - totalW / 2;
    for (var i = 0; i < arc.fwd.length; i++) {
      /* Nudged down by bearing so the arc reads as an arc rather than a row:
       * the outboard screens sit further from the eye and lower on the page. */
      var lift = Math.abs(arc.fwd[i].bearing) / (Math.PI / 6.6) * 12;
      mountTile(arc.fwd[i], fx + i * (tileW + 10), rowFwdY + lift);
    }

    var seatY = rowFwdY + tileH + 46;
    seat(cx, seatY);

    var rowAftY = seatY + 42;
    /* AFT IS MIRRORED, because you turn round to read it. The mount at the
     * most negative bearing is off your left shoulder, and once you are
     * facing it, it is on your right — so the aft row runs the other way
     * and the tiles land where your eyes will find them. */
    var aft = arc.aft.slice().reverse();
    var totalA = aft.length * tileW + (aft.length - 1) * 10;
    var ax = cx - totalA / 2;
    for (var j = 0; j < aft.length; j++) mountTile(aft[j], ax + j * (tileW + 10), rowAftY);

    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = '#5d6f78';
    ctx.textAlign = 'center';
    ctx.fillText('rear bulkhead — turn round to read these', cx, rowAftY + tileH + 16);
    ctx.textAlign = 'left';
    }

    /* --- the pages you can put on it --- */
    var lx = bayX + bayW + 16, ly = top;
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText((stById[G.panelPick] ? stById[G.panelPick].name
                  : String(G.panelPick).replace('-', ' ')).toUpperCase(), lx, ly + 12);
    ly += 22;
    var cur = dash.pageFor(G.panelPick, pickRole);
    /* The roster outgrew a fixed 20px row: the loop below stops at the
     * bottom of the window, and the page it dropped was OFF, the last one.
     * Rows now shrink to fit every page, down to a 14px floor. */
    var rowH = Math.max(14, Math.min(20, Math.floor((bottom - pad - ly) / dash.pages.length)));
    for (var k = 0; k < dash.pages.length; k++) {
      var pg = dash.pages[k];
      var sel = pg.id === cur.id;
      if (ly + rowH > bottom - pad) break;
      ctx.fillStyle = sel ? '#12414f' : 'rgba(8,20,25,0.7)';
      ctx.fillRect(lx, ly, listW, rowH - 2);
      ctx.strokeStyle = sel ? MFD_EDGE : 'rgba(74,151,176,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(lx + 0.5, ly + 0.5, listW - 1, rowH - 3);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = sel ? '#b4f0ff' : MFD_INK;
      ctx.fillText(pg.title, lx + 8, ly + rowH - 6);
      hot(lx, ly, listW, rowH - 2, (function (pid) {
        return function () { dash.set(G.panelPick, pid); };
      })(pg.id), 'show this page here');
      ly += rowH;
    }
  }

  /* ---- F5 NOTES: the notepad, who owes whom, and the ship's log ---------
   * Astra, 2026-10-30: both a notepad and a log the game keeps; saved with
   * the game and exportable. Left, the notepad. Right, the debts (read off
   * the captains' own memories, journal.js) and the log, newest first,
   * with a filter row. The wheel scrolls whichever the pointer is over. */
  var notesView = { top: 0, logTop: 0, group: 'all' };

  function notesPanel(ctx, x, y, w, h, title, lit) {
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = lit ? '#ffd36b' : MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(x + 4, y + 4, w - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(title, x + 10, y + 18);
    ctx.restore();
    return y + 28;
  }

  function overRect(x, y, w, h) {
    return G.cursor && G.cursor.active && G.cursor.x >= x && G.cursor.x <= x + w &&
           G.cursor.y >= y && G.cursor.y <= y + h;
  }

  function exportNotes() {
    var J = global.Journal;
    if (!J) return;
    if (J.download(G)) say('Notes exported: ' + J.fileName(G), 5);
    else say('Could not write the file from here', 4);
  }

  function scrollNotesLog(n) {
    notesView.logTop = Math.max(0, notesView.logTop + n);
  }

  function drawNotesTab(ctx, pad, top, w, bottom) {
    var J = global.Journal;
    if (!J) return;
    var y0 = top + 4, colH = bottom - y0 - pad;
    var leftW = Math.floor((w - pad * 3) * 0.5);
    var rx = pad * 2 + leftW, rw = w - rx - pad;
    var writing = !!NOTE;

    /* --- the notepad --- */
    var ny = notesPanel(ctx, pad, y0, leftW, colH, 'NOTEPAD', writing);
    btn(ctx, pad + leftW - 84, y0 + 5, 76, 17, writing ? 'DONE' : 'WRITE',
        function () { if (NOTE) NOTE = null; else beginNotes(); }, { bold: true, hot: writing });
    btn(ctx, pad + leftW - 168, y0 + 5, 76, 17, 'EXPORT', exportNotes, { bold: true });

    var text = String(G.notes || '');
    ctx.save();
    ctx.font = '13px ui-monospace, monospace';
    var cw = ctx.measureText('M').width || 7.8, lh = 17;
    var tx = pad + 12, ty = ny + 4, sbW = 10;
    var areaW = leftW - 24 - sbW - 4, areaH = colH - (ny - y0) - 30;
    var cols = Math.max(12, Math.floor(areaW / cw));
    var rows = Math.max(3, Math.floor(areaH / lh));
    var lines = J.wrap(text, cols);
    var maxTop = Math.max(0, lines.length - rows);
    if (NOTE) {
      NOTE.cols = cols; NOTE.rows = rows;
      if (NOTE.follow) {
        var at = J.caretLine(lines, NOTE.caret);
        if (at.line < notesView.top) notesView.top = at.line;
        if (at.line >= notesView.top + rows) notesView.top = at.line - rows + 1;
        NOTE.follow = false;
      }
    }
    notesView.top = Math.max(0, Math.min(maxTop, notesView.top));

    if (!text && !writing) {
      ctx.fillStyle = 'rgba(160,185,220,0.45)';
      var hint = wrapText('Nothing written yet. Click here, or press Enter, and write whatever ' +
                          'you want to keep: prices, routes, who to look for, what you promised ' +
                          'and to whom. It is saved with the game.', cols);
      for (var hi = 0; hi < hint.length && hi < rows; hi++) ctx.fillText(hint[hi], tx, ty + 12 + hi * lh);
    }
    ctx.fillStyle = '#e8f6ff';
    for (var li = 0; li < rows && notesView.top + li < lines.length; li++) {
      var L = lines[notesView.top + li];
      ctx.fillText(text.slice(L.start, L.end), tx, ty + 12 + li * lh);
    }
    if (writing && (Math.floor(Date.now() / 450) % 2)) {
      var cl = J.caretLine(lines, NOTE.caret);
      var row = cl.line - notesView.top;
      if (row >= 0 && row < rows) {
        ctx.fillStyle = '#ffd36b';
        ctx.fillRect(tx + cl.col * cw - 1, ty + row * lh, 2, lh - 1);
      }
    }
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.55)';
    ctx.fillText(text.length.toLocaleString() + ' / ' + J.NOTES_MAX.toLocaleString() +
                 ' characters   ·   saved with the game', tx, y0 + colH - 12);
    ctx.restore();

    /* Click to write, at the place you clicked. */
    hot(tx - 4, ty, areaW + 8, rows * lh, function () {
      var line = notesView.top + Math.floor((G.cursor.y - ty) / lh);
      var col = Math.round((G.cursor.x - tx) / cw);
      var c = J.caretAt(J.wrap(String(G.notes || ''), cols), line, col);
      if (NOTE) { NOTE.caret = c; NOTE.goalCol = null; } else beginNotes(c);
    }, 'write here');
    if (lines.length > rows) {
      drawScrollbar(ctx, pad + leftW - sbW - 8, ty, sbW, rows * lh, lines.length, rows, notesView.top,
                    function (p) { notesView.top = Math.max(0, Math.min(maxTop, p)); });
    }
    if (overRect(pad, y0, leftW, colH)) {
      setScrollRegion(pad, y0, leftW, colH, function (d) {
        notesView.top = Math.max(0, Math.min(maxTop, notesView.top + d * 3));
      });
    }

    /* --- who owes whom --- */
    var ds = J.debts(G);
    var owedRows = Math.max(1, Math.min(ds.length, 8));
    var oh = Math.min(Math.floor(colH * 0.32), 30 + owedRows * 16 + 10);
    var oy = notesPanel(ctx, rx, y0, rw, oh, 'WHO OWES WHOM', false);
    ctx.save();
    var ocols = Math.max(16, Math.floor((rw - 24) / 7.2));
    ctx.font = 'bold 12px ui-monospace, monospace';
    if (!ds.length) {
      ctx.fillStyle = 'rgba(160,185,220,0.55)';
      ctx.fillText(clipText('Nobody, either way. Pull a ship off a dead tank and her captain owes you.', ocols),
                   rx + 12, oy + 12);
    }
    var fit = Math.max(1, Math.floor((oh - 34) / 16));
    for (var di = 0; di < ds.length && di < fit; di++) {
      var dd = ds[di];
      ctx.fillStyle = dd.debt > 0 ? '#7fe0a0' : '#ffb86b';
      var dl = J.debtLine(dd) + (dd.why ? ' — ' + dd.why : '');
      if (di === fit - 1 && ds.length > fit) dl = '…and ' + (ds.length - fit + 1) + ' more (in the export)';
      ctx.fillText(clipText(dl, ocols), rx + 12, oy + 12 + di * 16);
    }
    ctx.restore();

    /* --- the ship's log --- */
    var ly0 = y0 + oh + 8, lh2 = colH - oh - 8;
    var ly = notesPanel(ctx, rx, ly0, rw, lh2, 'SHIP\'S LOG', false);
    var gx = rx + 10;
    for (var gi = 0; gi < J.GROUPS.length; gi++) {
      var gr = J.GROUPS[gi], gw = gr.label.length * 8 + 18;
      btn(ctx, gx, ly, gw, 18, gr.label, (function (id) {
        return function () { notesView.group = id; notesView.logTop = 0; };
      })(gr.id), { bold: true, hot: notesView.group === gr.id, font: 10 });
      gx += gw + 6;
    }
    var es = J.entries(G, notesView.group);
    var listY = ly + 26, listH = ly0 + lh2 - listY - 8;
    var lcols = Math.max(16, Math.floor((rw - 24 - sbW - 4) / 7.2));
    notesView.logTop = Math.max(0, Math.min(Math.max(0, es.length - 1), notesView.logTop));
    ctx.save();
    if (!es.length) {
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(160,185,220,0.55)';
      var none = wrapText(notesView.group === 'all'
        ? 'Nothing yet. Rescues, robberies, charges, debts, contracts, trades and arrivals are written here as they happen.'
        : 'Nothing of that kind yet.', lcols);
      for (var ni = 0; ni < none.length; ni++) ctx.fillText(none[ni], rx + 12, listY + 12 + ni * 16);
    }
    var yy = listY, shown = 0;
    for (var ei = notesView.logTop; ei < es.length; ei++) {
      var en = es[ei], kd = J.kindOf(en.kind);
      var body = wrapText(en.text + (en.n > 1 ? '  (x' + en.n + ')' : ''), lcols);
      var need = 15 + body.length * 15 + 6;
      if (yy + need > listY + listH && shown > 0) break;
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillStyle = kd.color;
      ctx.fillText(kd.label, rx + 12, yy + 11);
      ctx.fillStyle = 'rgba(160,185,220,0.6)';
      ctx.fillText(J.fmtEpoch(en.t) + (en.at ? '  ·  ' + en.at : ''), rx + 12 + 80, yy + 11);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = '#d8ecf4';
      for (var bi = 0; bi < body.length; bi++) ctx.fillText(body[bi], rx + 12, yy + 26 + bi * 15);
      yy += need; shown++;
    }
    ctx.restore();
    if (es.length > shown) {
      drawScrollbar(ctx, rx + rw - sbW - 8, listY, sbW, listH, es.length, Math.max(1, shown), notesView.logTop,
                    function (p) { notesView.logTop = Math.max(0, Math.min(es.length - 1, p)); });
    }
    if (overRect(rx, ly0, rw, lh2)) {
      setScrollRegion(rx, ly0, rw, lh2, function (d) {
        notesView.logTop = Math.max(0, Math.min(Math.max(0, es.length - 1), notesView.logTop + d));
      });
    }
  }

  function drawShipScreen(ctx, w, bottom) {
    if (G.shipTab !== 'guns' && G.shipTab !== 'panels' && G.shipTab !== 'ordnance' && G.shipTab !== 'notes') G.shipTab = 'status';
    var guns = G.shipTab === 'guns';
    var panels = G.shipTab === 'panels';
    var ordnance = G.shipTab === 'ordnance';
    var notes = G.shipTab === 'notes';
    /* The launch guard drops whenever you are not looking at it. */
    if (!ordnance) G.torpCover = false;
    /* Off the notes tab, nothing is still holding the keyboard for it. */
    if (!notes && NOTE) NOTE = null;
    var top = modeFrame(ctx, w, bottom,
                        guns ? 'SHIP — GUNS'
                        : panels ? 'SHIP — CONSOLE PANELS'
                        : ordnance ? 'SHIP — ORDNANCE'
                        : notes ? 'SHIP — NOTES'
                        : 'SHIP STATUS & INVENTORY',
                        guns ? 'Tab ordnance   ·   space fires A   ·   shift+space fires B'
                        : panels ? 'Tab notes   ·   pick a mount, then pick a page'
                        : ordnance ? 'Tab panels   ·   ↑↓ charge   ·   C guard   ·   Enter launch   ·   D disarm   ·   X detonate'
                        : notes ? (NOTE ? 'Esc stops writing   ·   kept as you type'
                                        : 'Tab status   ·   Enter writes   ·   E exports   ·   ↑↓ scroll the log')
                             : (G.ship.docked ? 'Tab guns   ·   F4 trade   ·   ↑↓ select   ·   Del jettison'
                                              : 'Tab guns   ·   ↑↓ select   ·   Del jettison   ·   Shift+Del all' +
                                                (G.ship.cargo && G.ship.cargo.hydrogen > 0 && G.ship.fuel < G.ship.fuelCap - 0.01 ? '   ·   Enter on hydrogen: to tanks' : '')));

    /* Two tabs across the top: the inventory layout, and the guns board
     * that used to live on the deck MFD cycle. Clickable, and Tab toggles
     * them from the keyboard (main.js). The strip sits just under the mode
     * header and shifts the content down by its height. */
    var pad = 14;
    var tabH = 22, tabW = 150, tabY = top + 4;
    var tabs = [ { id: 'status', label: 'STATUS & INVENTORY', wide: true },
                 { id: 'guns',   label: 'GUNS' },
                 { id: 'ordnance', label: 'ORDNANCE' },
                 { id: 'panels', label: 'PANELS' },
                 { id: 'notes',  label: 'NOTES' } ];
    var tx = pad;
    for (var ti = 0; ti < tabs.length; ti++) {
      var tw = tabs[ti].wide ? tabW : 90;
      var on = G.shipTab === tabs[ti].id;
      ctx.fillStyle = on ? '#12414f' : '#081419';
      ctx.fillRect(tx, tabY, tw, tabH);
      ctx.strokeStyle = MFD_EDGE; ctx.lineWidth = on ? 2 : 1;
      ctx.strokeRect(tx + 1, tabY + 1, tw - 2, tabH - 2);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = on ? '#b4f0ff' : '#5d6f78';
      ctx.textAlign = 'center';
      ctx.fillText(tabs[ti].label, tx + tw / 2, tabY + 15);
      ctx.textAlign = 'left';
      hot(tx, tabY, tw, tabH, (function (id) {
        return function () { G.shipTab = id; };
      })(tabs[ti].id), 'tab');
      tx += tw + 6;
    }
    top = tabY + tabH + 6;   // content starts below the tab strip

    if (panels) { drawPanelsTab(ctx, pad, top, w, bottom); return; }
    if (notes) { drawNotesTab(ctx, pad, top, w, bottom); return; }
    if (ordnance) { drawOrdnanceTab(ctx, pad, top, w, bottom); return; }
    if (guns) {
      /* The guns board, hosted in a tile the same way the ship page is on
       * the status tab — it draws into its own flat 460x178 MFD space and
       * the tile maps that onto this rect, so it needs no fullscreen
       * variant of its own. */
      var gw = Math.min(w - pad * 2, 720);
      var gh = bottom - top - pad;
      tile(ctx, pad, top, gw, gh, drawGunsPage);
      return;
    }

    var leftW = Math.min(430, w * 0.36);
    var colH = bottom - top - pad * 2;
    var s = G.ship;

    /* Left: the ship itself, and what is bolted to it. */
    var shipH = Math.min(colH * 0.5, tileHeight(leftW));
    tile(ctx, pad, top + pad, leftW, shipH, drawShipPage);

    var eqY = top + pad + shipH + pad;
    var eqH = top + pad + colH - eqY;
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(pad, eqY, leftW, eqH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad + 2, eqY + 2, leftW - 4, eqH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(pad + 4, eqY + 4, leftW - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('FITTED EQUIPMENT', pad + 10, eqY + 18);
    ctx.restore();

    var fitted = fittedEquipment();
    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    /* Both halves of the row clipped to the panel they are actually in. The
     * old fixed 26 and 30 characters assumed a wide window: on a narrow one
     * they add up to far more than the panel holds, so the name and the
     * value were drawn straight through each other — "Photon intermittent
     * laser" over "62 dmg · GROUP A". Split the lane instead, and let a
     * small window clip harder on its own. */
    var lane = Math.max(60, leftW - 24);
    var nameCap = Math.max(8, Math.floor(lane * 0.44 / 7.37));
    var valCap = Math.max(6, Math.floor(lane * 0.52 / 7.37));
    for (var f = 0; f < fitted.length; f++) {
      var yy = eqY + 40 + f * 15;
      if (yy > eqY + eqH - 22) break;
      var row = fitted[f];
      /* The first three rows are the ship's identity and they are EDITABLE,
       * so they are drawn as things you can click rather than as readout.
       * Everything below them is a fact about the hull. */
      var idRow = f < 3;
      ctx.fillStyle = idRow ? '#7fd6c0' : MFD_INK;
      ctx.fillText(clipText(row.name, nameCap), pad + 12, yy);
      ctx.fillStyle = row.uncertified ? '#ffb86b' : (idRow ? '#ffffff' : MFD_DIM);
      ctx.textAlign = 'right';
      /* THE REGISTRATION ROW YIELDS ITS RIGHT-HAND END TO THE BUTTON, and
       * until now only its HOTSPOT did. The value stayed right-aligned to
       * the panel edge and the REROLL REG button was drawn over the top of
       * it, so the one row on this page whose whole job is to show you a
       * callsign was the one row you could not read. Astra found it from
       * the seat. The text stops where the button starts, and it is clipped
       * to the shorter lane rather than merely moved, or a long value would
       * run back under it from the other side. */
      var yieldsToBtn = idRow && f === 2 && s.docked;
      var valRight = yieldsToBtn ? pad + leftW - 100 : pad + leftW - 12;
      var cap = yieldsToBtn ? Math.max(6, valCap - 14) : valCap;
      ctx.fillText(clipText(row.value + (row.uncertified ? '  UNCERTIFIED' : ''), cap),
                   valRight, yy);
      ctx.textAlign = 'left';
      if (idRow) {
        /* The registration row yields its right-hand end to the reroll
         * button, so the two hotspots never overlap. */
        var hotW = (f === 2 && s.docked) ? leftW - 108 : leftW - 16;
        hot(pad + 8, yy - 11, hotW, 14, (function (which) {
          return function () { editIdentity(which); };
        })(['pilot', 'ship', 'reg'][f]), 'rename');
      } else if (row.gun) {
        /* Weapons management, on the page called MY SHIP rather than only
         * at a yard: which trigger a gun answers to is the one loadout
         * decision you might want to revisit between one fight and the
         * next, and docking to do it is not an interesting cost. */
        hot(pad + 8, yy - 11, leftW - 16, 14, (function (k) {
          return function () {
            var now = Combat.toggleGroup(s, k);
            say('Moved to fire group ' + now.toUpperCase(), 3);
          };
        })(row.slotKey), 'fire group');
      }
    }
    ctx.fillStyle = 'rgba(160,185,220,0.5)';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText(s.docked ? 'click a gun to change its fire group  ·  fittings sell in the yard'
                          : 'click a gun to change its fire group  ·  top rows rename',
                 pad + 12, eqY + eqH - 10);
    ctx.restore();

    /* The reroll button sits beside the registration row, because typing a
     * callsign by hand is the fussy path and taking the next one the seed
     * offers is the ordinary one. */
    if (s.docked) {
      btn(ctx, pad + leftW - 92, eqY + 40 + 2 * 15 - 12, 78, 14,
          'REROLL REG', rerollReg, { font: 10 });
    }

    /* And the field itself, over the top of everything, because while it is
     * up it owns the keyboard and should look like it. */
    if (editing()) {
      drawEditField(ctx, pad + 6, eqY + eqH - 52, leftW - 12, 42);
    }

    /* Right: the hold — and, in dock, the yard beneath it. */
    var rx = pad * 2 + leftW, rw = w - rx - pad;
    var port = s.docked ? G.sys.byId[s.docked] : null;
    /* In dock the yard needs the bigger share: the hold is a list you
     * scan, the yard is a row of things you click. */
    var holdH = port ? Math.max(150, Math.min(colH * 0.38, 250)) : colH;

    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(rx, top + pad, rw, holdH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx + 2, top + pad + 2, rw - 4, holdH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(rx + 4, top + pad + 4, rw - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    var cargo = Sim.cargoMass(s);
    /* The people ride in the same header as the tonnage, because they are
     * the same decision: the berths are hold you gave up. */
    var seatsN = Combat.seatsOf(s);
    ctx.fillText('CARGO HOLD   ' + cargo.toFixed(0) + ' / ' + s.cargoCap + ' t' +
                 (seatsN > 0 ? '    BERTHS  ' + Combat.passengersAboard(s) +
                               ' / ' + seatsN : ''),
                 rx + 10, top + pad + 18);
    ctx.restore();

    var held = heldCargo();
    if (G.invSel >= held.length) G.invSel = Math.max(0, held.length - 1);

    if (!held.length) {
      ctx.save();
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('HOLD EMPTY', rx + 16, top + pad + 56);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(s.cargoCap + ' tonnes available. Dock, then trade on F4.',
                   rx + 16, top + pad + 78);
      ctx.restore();
      if (port) drawYard(ctx, rx, top + pad + holdH + pad, rw,
                         colH - holdH - pad, port);
      return;
    }

    var rowH = 30, hy = top + pad + 46;

    /* Columns proportional to the space there is, not fixed offsets from
     * the right edge. A narrow window put the tonnage column on top of the
     * commodity name and pushed the eject buttons off the panel — the kind
     * of thing no amount of passing tests will tell you. */
    var btnW = Math.min(74, Math.max(52, rw * 0.11));
    var btnX2 = rx + rw - btnW - 12;
    var btnX1 = btnX2 - btnW - 8;
    var showValue = btnX1 - (rx + 16) > 240;
    var colTon = showValue ? rx + 16 + (btnX1 - rx - 16) * 0.55 : btnX1 - 16;
    var colVal = btnX1 - 16;

    ctx.save();
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('COMMODITY', rx + 16, hy);
    ctx.textAlign = 'right';
    ctx.fillText('TONNES', colTon, hy);
    if (showValue) ctx.fillText(port ? 'VALUE HERE' : 'ABOARD', colVal, hy);
    ctx.textAlign = 'left';
    ctx.restore();

    var total = 0;
    for (var i = 0; i < held.length; i++) {
      var yy = hy + 12 + i * rowH;
      if (yy + rowH > top + pad + holdH - 8) {
        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = MFD_DIM;
        ctx.fillText('+' + (held.length - i) + ' more — sell some to see the rest',
                     rx + 16, top + pad + holdH - 12);
        ctx.restore();
        break;
      }
      var it = held[i];
      var on = i === G.invSel;

      ctx.save();
      if (on) {
        ctx.fillStyle = 'rgba(255,211,107,0.14)';
        ctx.fillRect(rx + 8, yy, rw - 16, rowH - 4);
      }
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = it.cid === 'waste' ? '#ffb86b' : (on ? MFD_HOT : MFD_INK);
      ctx.fillText(clipText(it.name, 26), rx + 16, yy + 18);

      /* FREIGHT SAYS SO IN THE MANIFEST. Contract cargo is not yours to
       * sell, and the trade screen refuses it by name — but a refusal you
       * only meet by pressing the button is a rule the player learns at the
       * worst moment. This is where they are already looking. */
      var bonded = global.Missions
        ? global.Missions.bondedTonnes(G, it.cid) : 0;
      if (bonded > 0) {
        ctx.save();
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillStyle = '#7fd6c0';
        ctx.fillText(Math.min(bonded, it.tonnes).toFixed(0) + ' t under contract',
                     rx + 16, yy + 27);
        ctx.restore();
      }

      ctx.fillStyle = MFD_DIM;
      ctx.textAlign = 'right';
      ctx.fillText(it.tonnes.toFixed(it.tonnes < 1 ? 2 : 0) + ' t', colTon, yy + 18);

      var worth = null;
      if (port) {
        var q = Eco.price(port, it.cid, G.t);
        if (q && q.sell !== null) { worth = q.sell * it.tonnes; total += worth; }
      }
      if (showValue) {
        ctx.fillStyle = worth !== null && worth < 0 ? '#ffb86b' : MFD_INK;
        ctx.fillText(worth !== null ? fmtCredits(worth) : '—', colVal, yy + 18);
      } else if (worth !== null) {
        total += 0;   // already counted above; nothing more to draw
      }
      ctx.textAlign = 'left';
      ctx.restore();

      /* HYDROGEN IS FUEL (2026-10-24): skimmed into the hold, and into the
       * jump tank when the pilot says so - this button, or Enter on this row. */
      var canTank = it.cid === 'hydrogen' && refuelFromHold && G.ship.fuel < G.ship.fuelCap - 0.01;
      /* MILFUEL IS DRIVE FUEL TOO (2026-11-09): into the milfuel drive's
       * own tank, sized to the ship, when a drive aboard burns it. */
      var Sl = global.Slipspace;
      var canDrive = it.cid === 'milfuel' && milFuelFromHold && Sl && Sl.milFuelCap(G.ship) > 0 &&
                     Sl.milFuelOf(G.ship) < Sl.milFuelCap(G.ship) - 0.01;
      var btnX0 = btnX1 - btnW - 8;
      hot(rx + 8, yy, Math.max(40, (canTank || canDrive ? btnX0 : btnX1) - rx - 12), rowH - 4, (function (n) {
        return function () { G.invSel = n; };
      })(i));
      if (canTank) {
        btn(ctx, btnX0, yy + 2, btnW, rowH - 8, 'TO TANKS',
            (function (n) { return function () { G.invSel = n; refuelFromHold(); }; })(i),
            { font: 11 });
      }
      if (canDrive) {
        btn(ctx, btnX0, yy + 2, btnW, rowH - 8, 'TO DRIVE',
            (function (n) { return function () { G.invSel = n; milFuelFromHold(); }; })(i),
            { font: 11 });
      }

      /* The two buttons, right where the cargo is. */
      btn(ctx, btnX1, yy + 2, btnW, rowH - 8, 'EJECT 1t',
          (function (item, n) {
            return function () { G.invSel = n; jettison(item.cid, 1); };
          })(it, i), { hot: true, font: 11 });
      btn(ctx, btnX2, yy + 2, btnW, rowH - 8, 'EJECT ALL',
          (function (item, n) {
            return function () { G.invSel = n; jettison(item.cid, Infinity); };
          })(it, i), { hot: true, font: 11 });
    }

    if (port && total) {
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = MFD_HOT;
      ctx.textAlign = 'right';
      ctx.fillText('hold worth ' + fmtCredits(total) + ' here', rx + rw - 16,
                   top + pad + holdH - 12);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    if (port) drawYard(ctx, rx, top + pad + holdH + pad, rw, colH - holdH - pad, port);
  }

  /* --- the yard ----------------------------------------------------------
   * Repairs, weapons, modules and whole hulls, available only in dock —
   * nobody refits a ship in free fall. Purchases are one click because the
   * prices are the confirmation: everything shows what it costs before you
   * touch it, and a click you cannot afford says so instead of acting. */
  function drawYard(ctx, x, y, w, h, port) {
    var s = G.ship;
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(x + 4, y + 4, w - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    /* Named for what this place actually IS. The trade console has always
     * announced the port's role; the yard said "SHIPYARD & OUTFITTING"
     * everywhere, including at a farming co-op with three items on the
     * shelf. Now that stock genuinely varies by port, the sign has to tell
     * the truth about it — same principle as the starport dressing. */
    var roleName = (port.market && port.market.roleName) || 'Port';
    ctx.fillText(clipText(roleName.toUpperCase() + '  ·  OUTFITTING',
                          Math.floor((w - 130) / 7.81)), x + 10, y + 18);
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.textAlign = 'right';
    ctx.fillText(fmtCredits(s.credits), x + w - 10, y + 18);
    ctx.textAlign = 'left';
    ctx.restore();

    /* THE BUDGET BAR. Both numbers, always, whichever tab is up — the
     * whole point of a slot system is that you are spending against a
     * ceiling, and a ceiling you have to click to see is not a ceiling. */
    var sum = Combat.fitSummary(s);
    var barY = y + 26;
    ctx.save();
    ctx.font = 'bold 11px ui-monospace, monospace';
    var pTight = sum.powerFree < 1.0, mTight = sum.massFree < 1.5;
    /* Red when she is drawing more than she makes — possible since a cool
     * hand's saving counts here and can be paid off (2026-10-25). */
    ctx.fillStyle = sum.powerFree < 0 ? '#ff6b5a' : pTight ? '#ffb86b' : '#7fd6c0';
    ctx.fillText('POWER ' + sum.powerUsed.toFixed(1) + ' / ' + sum.powerCap.toFixed(1) + ' MW' +
                 (sum.powerFree < 0 ? '  OVER — guns slow' : ''),
                 x + 12, barY + 11);
    ctx.fillStyle = mTight ? '#ffb86b' : '#7fd6c0';
    ctx.fillText('MASS ' + sum.massUsed.toFixed(1) + ' / ' + sum.massCap + ' t',
                 x + 150, barY + 11);
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('SLOTS ' + sum.slots + ' / ' + sum.slotsTotal, x + 262, barY + 11);
    ctx.restore();

    /* Three tabs, because a slot grid, a catalogue and a hull list stacked
     * on one another run off the bottom of any window that also has to show
     * a cargo hold above them. */
    if (!G.yardTab) G.yardTab = 'fit';
    /* FLEET is a tab rather than a screen because it is a thing you do at
     * a yard: it is where you look at what you own, sell one, or — once
     * orders exist — tell one where to go. */
    /* INDUSTRY (2026-10-07): plants for sale and plants you own. A tab at
     * the yard because the yard is where a port's books are kept, and
     * because owning one is a thing you check on every time you dock. */
    var tabs = [['fit', 'FITTING'], ['buy', 'BUY'], ['hull', 'HULLS'],
                ['crew', 'CREW'], ['fleet', 'FLEET'], ['works', 'INDUSTRY']];
    /* STATION MODULES (construction.js, 2026-10-20): at a shipyard, or
     * wherever you are flying a Crawler, or own a module at all. */
    var Cn = global.Construction;
    var showModules = !!Cn && (Combat.isShipyard(port) || Cn.isCrawler(s) || Cn.owned(G).length > 0);
    if (showModules) tabs.push(['modules', 'MODULES']);
    else if (G.yardTab === 'modules') G.yardTab = 'hull';
    /* A SIXTH TAB DOES NOT FIT BESIDE THE BUDGET on a laptop-width window:
     * the bar's text runs to about x + 360 and six tabs want 396 px of what
     * is left. So when they would collide, the tabs take a row of their own
     * under the bar and the list starts one row lower — rather than the
     * tabs being drawn over SLOTS, or shrunk until INDUSTRY is unreadable. */
    var tabStep = 66, tabsW = tabs.length * tabStep;
    var tabRow = (w - 24 - tabsW) < 360;
    var tabY = tabRow ? barY + 18 : barY;
    /* And on its own row the tabs share the panel's width rather than
     * assuming 66 px each — seen on a 744 px window, six of them ran off
     * the left edge of the panel. Font steps down a size when they are
     * that tight, so INDUSTRY still fits inside its own button. */
    if (tabRow) tabStep = Math.min(66, Math.floor((w - 24) / tabs.length));
    for (var ti = 0; ti < tabs.length; ti++) {
      btn(ctx, x + w - 12 - (tabs.length - ti) * tabStep, tabY, tabStep - 4, 15, tabs[ti][1],
          (function (id) { return function () { G.yardTab = id; }; })(tabs[ti][0]),
          { font: tabStep < 60 ? 9 : 10, hot: G.yardTab === tabs[ti][0] });
    }

    /* Rows are BUILT first and DRAWN second. The old version drew straight
     * into a cursor that eventually ran off the bottom of the panel, which
     * is why a Mule's ten slots simply vanished; once the list exists as a
     * list, a scroll window is three lines of arithmetic and the length of
     * the catalogue stops being a layout constraint. */
    var rows = [];
    function row(label, sub, fn, disabled, opts) {
      rows.push({ label: label, sub: sub, fn: fn, disabled: !!disabled,
                  hot: !!(opts && opts.hot), icon: (opts && opts.icon) || null });
    }

    // Repairs and the law come first on every tab: they are what you limp
    // in for, and hunting through a tab for them would be absurd.
    var repCost = Combat.repairCost(s, G);
    if (repCost) {
      var deadScreens = Combat.deadPanelCount(G);
      row('REPAIR HULL — ' + repCost + ' cr',
          Math.round(s.hullHp) + ' / ' + s.hullMax +
          (deadScreens ? '   ·   ' + deadScreens + ' screen' +
           (deadScreens > 1 ? 's' : '') + ' out' : ''),
          function () {
            var r = Combat.repair(G);
            say(r > 0 ? 'Hull repaired — ' + r + ' cr' :
                r < 0 ? 'Repairs cost ' + (-r) + ' cr — you are short' : 'Nothing to repair', 4);
          }, false, { hot: true });
    }
    var owedHere = (G.wanted || {})[port.faction] || 0;
    if (owedHere > 0) {
      row('PAY OFF BOUNTY — ' + Math.round(owedHere * 1.6) + ' cr',
          'fines and lawyers included',
          function () {
            var r = Combat.payBounty(G, port.faction);
            say(r > 0 ? 'Record cleared with this faction'
                      : 'You cannot afford your own crimes yet', 5);
          }, false, { hot: true });
    }

    /* "Let the player corrupt a port" as its own action, not a side effect
     * of paying off a witness or a customs officer (those two nudge it up
     * on their own — see combat.js's corruption-lever section). Hidden
     * entirely once bribery here is maxed out (CORRUPTION_SHIFT_CAP), the
     * same "not stocked at all" treatment the grey market gives an item
     * below its threshold, rather than a permanently-disabled row. */
    if (global.Combat && G.sys &&
        Combat.decayedShift(G, (G.here || {}).id) < Combat.CORRUPTION_SHIFT_CAP - 0.5) {
      var briberyNow = Combat.systemCorruption(G, G.sys);
      var briberyAsk = Combat.bribeCost(G, G.sys, port);
      var briberyShort = s.credits < briberyAsk;
      row('BRIBE THE HARBOURMASTER — ' + briberyAsk + ' cr',
          'corruption ' + briberyNow + ' → ' +
          Math.min(100, briberyNow + Combat.CORRUPTION_BRIBE_AMOUNT) + ' here' +
          (briberyShort ? '  ·  short ' + Math.round(briberyAsk - s.credits) + ' cr' : ''),
          function () {
            var r = Combat.bribePort(G, G.sys, port);
            say(r.ok ? 'Paid ' + r.paid + ' cr — the right people here now owe you a favour'
                     : 'No: ' + r.why, 5);
          }, briberyShort);
    }

    /* WHAT THE CAMPAIGN STILL OWES YOU. A reward that could not be fitted
     * when it was earned is held rather than lost (arcs.js grantReward),
     * and until now there was nowhere to collect it — the game said "it is
     * waiting for you at the yard" and the yard had never heard of it.
     * Above the tabs, because it is not for sale and not a fitting choice;
     * it is a thing of yours somebody is holding. */
    var held = global.Arcs && Arcs.owedAt ? Arcs.owedAt(G) : [];
    for (var hi = 0; hi < held.length; hi++) {
      (function (id) {
        var item = Combat.EQUIPMENT[id] || { name: id };
        var fits = Combat.canFit(s, id);
        row('COLLECT ' + item.name.toUpperCase(),
            fits && fits.ok ? 'held for you — no charge'
                            : 'held for you — ' + ((fits && fits.why) || 'no room'),
            function () {
              var r = Arcs.claimOwed(G, id);
              say(r.ok ? item.name + ' fitted — it was always yours'
                       : 'Still held: ' + r.why, 5);
            }, !(fits && fits.ok), { hot: !!(fits && fits.ok) });
      })(held[hi]);
    }

    var cardH = 0;
    if (G.yardTab === 'fit') drawYardFit(ctx, x, w, row, s, port);
    else if (G.yardTab === 'buy') drawYardBuy(ctx, x, w, row, s, port);
    else if (G.yardTab === 'crew') drawYardCrew(ctx, x, w, row, s, port);
    else if (G.yardTab === 'fleet') drawYardFleet(ctx, x, w, row, s, port);
    else if (G.yardTab === 'works') drawYardIndustry(ctx, x, w, row, s, port);
    else if (G.yardTab === 'modules') drawYardModules(ctx, x, w, row, s, port);
    else cardH = drawYardHulls(ctx, x, w, row, s, port) || 0;

    /* ---- the window ---- */
    var bh = 21, gap = 4;
    var listY = barY + 22 + (tabRow ? 18 : 0);
    /* The showroom card takes the bottom of the panel, and the list gets
     * what is left — so the rows scroll rather than the ship being pushed
     * off the end of a window that was sized before anybody knew it was
     * there. */
    var listH = (y + h - 6) - listY - cardH;
    if (cardH && listH < 40) { cardH = Math.max(0, cardH + listH - 40); listH = 40; }
    var perPage = Math.max(1, Math.floor((listH + gap) / (bh + gap)));
    var maxScroll = Math.max(0, rows.length - perPage);
    /* WHERE THE "1-11 of 13" GOES. On the budget bar after SLOTS when there
     * is room before the tab buttons; it was drawn there unconditionally,
     * and on a 1280-wide window with six tabs on the bar it sat under
     * FITTING (seen on FLEET, 2026-11-03). When the bar has no room, the
     * list gives up a line at its foot and the counter goes there instead,
     * right-aligned under the scrollbar it describes. */
    var tabsLeft = tabRow ? x + w - 12 : x + w - 12 - tabs.length * tabStep;
    var counterW = 92;                // "999-999 of 999" in bold 10 px, and a gap
    var counterOnBar = x + 352 + counterW <= tabsLeft && 352 < w - 210;
    var foot = 0;
    if (maxScroll > 0 && !counterOnBar) {
      foot = 14; listH -= foot;
      perPage = Math.max(1, Math.floor((listH + gap) / (bh + gap)));
      maxScroll = Math.max(0, rows.length - perPage);
    }

    /* Changing tab starts you at the top of the new one. Carrying a scroll
     * position across from a list of ten hulls to a list of three would
     * open the page on nothing at all. */
    if (G.yardScrollTab !== G.yardTab) { G.yardScrollTab = G.yardTab; G.yardScroll = 0; }
    G.yardScroll = Math.max(0, Math.min(maxScroll, G.yardScroll || 0));

    var sbW = maxScroll > 0 ? 9 : 0;
    var rowW = w - 24 - (sbW ? sbW + 5 : 0);

    for (var ri = 0; ri < perPage; ri++) {
      var r = rows[G.yardScroll + ri];
      if (!r) break;
      var ry = listY + ri * (bh + gap);
      /* A row for a thing you can buy carries its model's still at its
       * head (2026-11-09: equipment, station crates), and gives up that
       * width to it rather than printing under it. */
      var iw = r.icon && Render.drawItemIcon && Render.itemKey(r.icon) ? bh + 2 : 0;
      btn(ctx, x + 12 + iw, ry, rowW - iw, bh,
          clipText(r.sub ? r.label + '   ·   ' + r.sub : r.label,
                   Math.floor((rowW - iw) / 7.04)),
          r.fn, { disabled: r.disabled, font: 11, hot: r.hot });
      if (iw) {
        ctx.save();
        ctx.fillStyle = '#030a0f';
        ctx.fillRect(x + 12, ry, bh, bh);
        ctx.restore();
        Render.drawItemIcon(ctx, x + 12, ry, bh, r.icon);
        if (!r.disabled) hot(x + 12, ry, bh, bh, r.fn, null);
      }
    }

    if (cardH) drawHullCard(ctx, x, listY + listH + foot + 4, w, cardH - 4);

    if (maxScroll > 0) {
      drawScrollbar(ctx, x + 12 + rowW + 5, listY, sbW, listH,
                    rows.length, perPage, G.yardScroll, function (n) {
                      G.yardScroll = Math.max(0, Math.min(maxScroll, n));
                    });
      /* The wheel works anywhere over the list, not just on the bar. */
      setScrollRegion(x + 12, listY, rowW + sbW + 5, listH, function (dir) {
        G.yardScroll = Math.max(0, Math.min(maxScroll, G.yardScroll + dir * 2));
      });

      /* Left-aligned after SLOTS, not right-aligned: the right-hand end of
       * this row belongs to the tab buttons — and when they leave no room
       * for it, at the foot of the list (see counterOnBar above). */
      var ctr = (G.yardScroll + 1) + '-' + Math.min(rows.length, G.yardScroll + perPage) + ' of ' + rows.length;
      ctx.save();
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(160,185,220,0.55)';
      if (counterOnBar) ctx.fillText(ctr, x + 352, barY + 11);
      else { ctx.textAlign = 'right'; ctx.fillText(ctr, x + w - 12, listY + listH + 11); }
      ctx.restore();
    }

    /* The item card goes on LAST so its hotspots sit above the rows' -
     * hitHot walks the list from the end - and so it is drawn over them.
     * Leaving the BUY tab puts the card away. */
    if (G.yardTab !== 'buy') G.yardItem = null;
    else if (G.yardItem) drawItemCard(ctx, x, y, w, h, port);
    if (G.yardTab !== 'modules') G.yardModule = null;
    else if (G.yardModule) drawModuleCard(ctx, x, y, w, h);
  }

  /* --- CREW: the people aboard, and what they are for --------------------
   *
   * Two lists in one: who is on this deck, and who is in the hall looking
   * for a berth. The hall is a pure function of the port and the week, so
   * walking out and back in does not re-roll it — a crew hall you can
   * reshuffle is a crew hall nobody believes.
   *
   * The turret line comes FIRST and is the reason the tab exists. It says
   * what is happening to the mount right now and, when the answer is
   * "nothing", exactly whose absence is causing it.
   */
  function drawYardCrew(ctx, x, w, row, s, port) {
    if (!Crew) return 0;
    var man = Crew.turretCrewing(s);

    if (man.turret) {
      var head = man.mode === 'manned' ? 'TURRET MANNED'
               : man.mode === 'slaved' ? 'TURRET SLAVED — half traverse, two thirds rate'
               : man.mode === 'pilot'  ? 'TURRET WORKED FROM THE SEAT'
               : 'TURRET COLD — nobody on it';
      row(head, man.why, function () {}, true,
          { hot: man.mode === 'manned' || man.mode === 'pilot' });
    } else if (Crew.needsCrew(s)) {
      row('NO TURRET FITTED', 'a hull this size wants one, and somebody on it',
          function () {}, true);
    }

    /* The gunnery console (crew.js gunnery, 2026-10-25): what the gunners
     * not on the turret are doing for the forward guns and the seekers. */
    if (Crew.gunnery) {
      var gy = Crew.gunnery(s), bits = [];
      if (gy.cool) bits.push(gy.cool.name + ': guns ' + Math.round((1 - gy.heatMul) * 100) + '% cooler, ' +
                             Math.round((1 - gy.powerMul) * 100) + '% less draw');
      if (gy.mark) bits.push(gy.mark.name + ': ' + Math.round((gy.dmgMul - 1) * 100) + '% harder, cone ' +
                             Math.round((gy.coneMul - 1) * 100) + '% wider');
      if (gy.guide) bits.push('seekers track ' + Math.round((gy.trackMul - 1) * 100) + '% faster crossers');
      if (bits.length || gy.mounts.length) {
        row(gy.bridge.length ? 'GUNNERY CONSOLE' : 'GUNNERY CONSOLE EMPTY',
            bits.length ? bits.join('  ·  ') : 'every gunner aboard is on the turret — a second would sit here',
            function () {}, true, { hot: !!(gy.cool || gy.mark) });
      }
    }

    var mine = Crew.aboard(s);
    var wages = 0;
    for (var i = 0; i < mine.length; i++) wages += Crew.dailyWage(mine[i]);
    row('ABOARD  ·  ' + mine.length + (mine.length === 1 ? ' hand' : ' hands') +
        (wages ? '  ·  ' + wages + ' cr/day' : ''),
        mine.length ? 'click a name to pay them off' : 'nobody but you',
        function () {}, true);

    for (var j = 0; j < mine.length; j++) {
      (function (p) {
        var kn = Crew.knackOf ? Crew.knackOf(p) : null;
        /* On the books but not inside her (crew.js present, outside.js).
         * The line IS the rescue prompt, so it says the air. */
        var outNote = global.Outside && global.Outside.statusOf ? global.Outside.statusOf(G, p) : null;
        row('  ' + p.name + (outNote ? '  —  ' + outNote.toUpperCase() : ''),
            Crew.ROLES[p.role].name + ', ' + Crew.ratingWord(p.rating) +
            (kn ? ', ' + Crew.KNACKS[kn].name : '') +
            '  ·  ' + Crew.dailyWage(p) + ' cr/day',
            function () {
              if (p.out) {
                say('Not while ' + p.name + (p.out === 'hull' ? ' is out on the hull' :
                    p.out === 'outpost' ? ' is down at the outpost - fetch them back first' :
                    ' is adrift - go and get them first'), 5);
                return;
              }
              s.crew = Crew.aboard(s).filter(function (q) { return q.id !== p.id; });
              /* A cool hand's saving counted at the yard; without them she
               * may be drawing more than the reactor makes. Say so now, not
               * in the middle of the next fight. */
              var after = Combat.fitSummary ? Combat.fitSummary(s) : null;
              say(p.name + ' takes their kit and goes.' +
                  (after && after.powerFree < 0 ? '  The reactor is ' + (-after.powerFree).toFixed(1) +
                   ' MW over without them — the guns will cycle slow until you refit or hire another cool hand.' : ''),
                  after && after.powerFree < 0 ? 9 : 5);
            });
      })(mine[j]);
    }

    /* And the hall. Anyone already signed on is not in it. */
    var hall = Crew.forHire(port, G.t).filter(function (p) {
      for (var k = 0; k < mine.length; k++) if (mine[k].id === p.id) return false;
      return true;
    });
    row('LOOKING FOR A BERTH AT ' + (port.name || 'this port').toUpperCase(),
        hall.length ? 'signing fee up front, then a wage while they are aboard'
                    : 'nobody today — try another port, or come back in a day or two',
        function () {}, true);

    for (var m = 0; m < hall.length; m++) {
      (function (p) {
        var fee = Crew.signingFee(p);
        var poor = s.credits < fee;
        row('  ' + p.name + '  —  ' + fee + ' cr',
            Crew.ROLES[p.role].name + ', ' + Crew.ratingWord(p.rating) + '  ·  ' +
            Crew.dailyWage(p) + ' cr/day  ·  ' +
            (Crew.knackOf && Crew.knackOf(p) ? Crew.KNACKS[Crew.knackOf(p)].name + ' — ' + Crew.KNACKS[Crew.knackOf(p)].what
                                             : Crew.ROLES[p.role].what),
            function () {
              if (s.credits < fee) { say('You cannot cover the signing fee', 4); return; }
              s.credits -= fee;
              (s.crew = Crew.aboard(s).slice()).push(p);
              say(p.name + ' signs on — ' + Crew.ROLES[p.role].name.toLowerCase() +
                  ', ' + Crew.ratingWord(p.rating) + '.', 6);
            }, poor);
      })(hall[m]);
    }
    return 0;
  }

  /* --- INDUSTRY: plants for sale, and the plants you own ------------------
   *
   * Three blocks, in the order a player asks them. What is this system like
   * (and what have you done to it); what is for sale here; what do you own
   * and how is it run. Every refusal is a disabled row that says why, the
   * same way the rest of the yard does it (doctrine 5). See holdings.js. */
  function drawYardIndustry(ctx, x, w, row, s, port) {
    var H = global.Holdings;
    if (!H || !G.sys || !G.here) return 0;
    var star = G.here.id, sys = G.sys;

    var corr = H.corruptionOf(G, sys, star), crime = H.crimeOf(G, sys, star);
    var dev = H.devOf(G, port, star), sh = H.shiftOf(G, star);
    var moved = (sh.corr || sh.dev)
      ? '  ·  your plants: corruption ' + (sh.corr > 0 ? '+' : '') + sh.corr.toFixed(1) +
        ', development ' + (sh.dev >= 0 ? '+' : '') + Math.round(sh.dev * 100) + '%'
      : '';
    row((sys.government ? sys.government.name.toUpperCase() : 'THIS SYSTEM') +
        '  ·  corruption ' + corr + ' (' + Combat.corruptionLabel(corr) + ')',
        'crime ' + crime + '  ·  development ' + Math.round(dev * 100) + '% here' + moved,
        function () {}, true);

    /* For sale in this system. Bought only at the plant's own desk, so a
     * plant elsewhere in the system is listed but the row says where to go. */
    var sale = H.forSale(G, sys, star);
    row('FOR SALE IN ' + (G.here.name || 'this system').toUpperCase() + '  ·  ' + sale.length,
        sale.length ? 'distressed plants, sold by the liquidator at their own desk'
                    : 'nothing here is struggling enough to sell',
        function () {}, true);
    for (var i = 0; i < sale.length; i++) {
      (function (p, q) {
        var here = s.docked === p.id, poor = s.credits < q.price;
        /* What decides it goes first — price, health, and whether you can
         * buy it from where you stand — because a narrow window clips the
         * end of the row, and it clipped exactly those the first time. */
        row((here ? (poor ? '  SHORT  ' : '  BUY  ') : '  ') + p.name + '  —  ' + q.price + ' cr  ·  ' +
            Math.round(q.health * 100) + '%',
            q.kind + (here ? (poor ? '  ·  short ' + Math.round(q.price - s.credits) + ' cr' : '')
                           : '  ·  dock there to buy'),
            function () {
              var r = H.buy(G, sys, star, p);
              say(r.ok ? p.name + ' is yours — ' + r.price + ' cr. It runs clean unless you say otherwise.'
                       : 'No: ' + r.why, 6);
            }, !here || poor, { hot: here && !poor });
      })(sale[i].port, sale[i].quote);
    }
    /* And why THIS port is not on the list, when it is not — a plant whose
     * books are sound should say so rather than simply being absent. */
    var mineQ = H.quote(G, sys, star, port);
    if (!mineQ.ok && !mineQ.mine) {
      row('  ' + port.name, mineQ.why, function () {}, true);
    }

    /* Yours, wherever they are. */
    var mine = H.list(G);
    row('YOUR PLANTS  ·  ' + mine.length, mine.length
        ? 'paid at the desk each week  ·  clean lifts the system, dirty pays more'
        : 'none yet', function () {}, true);
    for (var j = 0; j < mine.length; j++) {
      (function (h) {
        var health = H.healthOf(G, h);
        row('  ' + (h.mode === 'dirty' ? 'DIRTY' : 'CLEAN') + '  ' + h.name + '  ·  ' +
            H.weeklyIncome(G, h) + ' cr/wk  ·  ' + Math.round(health * 100) + '%',
            h.sysName || '',
            function () {}, true, { hot: h.mode === 'clean' });
        var other = h.mode === 'dirty' ? 'clean' : 'dirty';
        row('    RUN IT ' + other.toUpperCase(),
            other === 'dirty' ? 'skim, launder, look away — pays more, and the system slides'
                              : 'honest books — pays less, and the system climbs',
            function () {
              var r = H.setMode(G, h.id, other);
              say(r.ok ? h.name + ' now runs ' + other : 'No: ' + r.why, 5);
            });
        for (var k in H.INVEST) {
          (function (kind) {
            var lvl = (h.invest && h.invest[kind]) || 0;
            var spec = H.INVEST[kind];
            if (lvl >= H.INVEST_MAX) {
              row('    ' + spec.label.toUpperCase() + ' ' + lvl + '/' + H.INVEST_MAX, 'as far as it goes',
                  function () {}, true);
              return;
            }
            var cost = H.investCost(h, kind);
            row('    ' + spec.label.toUpperCase() + ' ' + lvl + '/' + H.INVEST_MAX + '  —  ' + cost + ' cr',
                kind === 'security' ? 'violence falls faster'
                : kind === 'automation' ? 'development climbs faster, and it pays a little more'
                : 'corruption falls faster, development a little',
                function () {
                  var r = H.invest(G, h.id, kind);
                  say(r.ok ? spec.label + ' at ' + h.name + ' — ' + r.cost + ' cr' : 'No: ' + r.why, 5);
                }, s.credits < cost);
          })(k);
        }
      })(mine[j]);
    }
    drawYardStations(row, s);
    return 0;
  }

  /* YOUR STATIONS (stations.js, 2026-10-31): each one's week, her tank and
   * her account, and - at her own desk - fuelling her from your hold. Pay
   * in at any desk: it is a transfer. */
  function drawYardStations(row, s) {
    var Sx = global.Stations;
    if (!Sx) return;
    var all = Sx.list(G);
    if (!all.length) return;
    row('YOUR STATIONS  ·  ' + all.filter(function (st) { return !st.seized; }).length,
        'settled every week wherever you are  ·  over ' + Sx.RESERVE + ' cr on her account is wired to you',
        function () {}, true);
    all.forEach(function (st) {
      if (st.seized) {
        row('  ' + st.name + '  ·  ' + (st.takenBy ? 'TAKEN BY THE SYNDICATE' : st.foreclosed ? 'FORECLOSED' : 'SEIZED'),
            (st.starName || '') + '  ·  runs under ' + (st.seizedBy || 'new owners') + ' now', function () {}, true);
        /* BUY HER BACK, at her own desk, for more than she is worth. */
        var bw = Sx.buyBackRefusal(G, G.sys, st);
        row('    BUY HER BACK  —  ' + Sx.buyBackPrice(st) + ' cr', bw || 'she is yours again the moment you pay',
            function () {
              var r = Sx.buyBack(G, G.sys, st, hooksFor());
              if (!r.ok) say('No: ' + r.why, 5);
            }, !!bw, { hot: !bw });
        return;
      }
      if (!Sx.isOpen(st, G.t)) {
        row('  ' + st.name + '  ·  BUILDING', (st.starName || '') + '  ·  ' + Sx.cratesIn(st, G.t) + ' of ' +
            st.crates.length + ' crates in, opens in ' + ((Sx.opensAt(st) - G.t) / 86400).toFixed(1) + ' days',
            function () {}, true);
        return;
      }
      if (!st.books) {
        row('  ' + st.name + '  ·  OPEN', (st.starName || '') + '  ·  her first books are taken when you are next in her system',
            function () {}, true);
        return;
      }
      var fc = Sx.forecast(st), tw = Sx.tankWeeks(st);
      row('  ' + (st.dark ? 'DARK  ' : '') + st.name + '  ·  ' + Sx.typeName(st, G.t) + '  ·  ' + (fc.net >= 0 ? '+' : '') + fc.net + ' cr/wk',
          'market ' + fc.market + ' + berths ' + fc.berths + '  −  wages ' + fc.wages + ', upkeep ' + fc.upkeep +
          ', reactor ' + fc.fuel + '  ·  ' + (st.starName || ''),
          function () {}, true, { hot: !st.dark && fc.net >= 0 });
      row('    ACCOUNT ' + Math.round(st.balance) + ' cr' + (st.balance < 0 ? '  ·  OWES' : ''),
          st.balance < 0 ? (st.owingWeeks || 0) + ' of ' + Sx.FORECLOSE_WEEKS + ' weeks owing before foreclosure'
                         : 'her float, for fuel when her tank runs low',
          function () {}, true);
      /* THE SYNDICATE'S CUT, where they ask for one. */
      if (st.racketHere) {
        var rk = st.racket || { paying: false, refused: 0 };
        row('    SYNDICATE\'S CUT  ·  ' + (rk.paying ? 'PAYING ' + Math.round(Sx.RACKET_CUT * 100) + '%' :
              'REFUSED ' + rk.refused + ' of ' + Sx.takeWeeks(st) + ' weeks'),
            rk.paying ? 'click to stop paying - and take what comes'
                      : 'click to pay a quarter of her takings - or they sabotage her, then take her (each Defence battery holds them off)',
            function () {
              var r = Sx.setPaying(G, st, !(st.racket && st.racket.paying));
              say(r.ok ? (r.paying ? 'You pay the Syndicate their cut for ' + st.name : 'You stop paying the Syndicate. They will notice.') : 'No: ' + r.why, 6);
            }, false, { hot: !rk.paying && rk.refused > 0 });
      }
      /* HER BATTERIES: what they fire on (Astra: "Owner's switch"). */
      var nb = Sx.batteries(st);
      if (nb > 0) {
        row('    BATTERIES ' + nb + '  ·  ' + (st.fireOnLaw ? 'FIRE ON THE LAW TOO' : 'OUTLAWS ONLY'),
            st.fireOnLaw ? 'click to hold fire on police and Navy'
                         : 'click to fire on police and Navy hunting you too - every hit an assault booked to you',
            function () {
              var r = Sx.setFireOnLaw(G, st, !st.fireOnLaw);
              say(r.ok ? (r.fireOnLaw ? st.name + '\'s batteries will fire on the law' : st.name + '\'s batteries hold fire on the law') : 'No: ' + r.why, 5);
            }, false, { hot: !!st.fireOnLaw });
      }
      var want = st.balance < 0 ? Math.ceil(-st.balance) : 10000;
      row('    PAY IN ' + want + ' cr', st.balance < 0 ? 'clears what she owes' : 'onto her account',
          function () {
            var r = Sx.payIn(G, st, want);
            say(r.ok ? 'Paid ' + Math.round(r.paid) + ' cr to ' + st.name + (st.dark ? '' : ' - she is lit') : 'No: ' + r.why, 5);
          }, s.credits < 1);
      var here = Sx.dockedAt(G, st), fis = (s.cargo && s.cargo.fissile) || 0;
      row('    REACTOR ' + (isFinite(tw) ? tw.toFixed(1) + ' weeks' : '-') + '  ·  ' + (st.tank || 0).toFixed(1) + ' t',
          here ? (fis > 0 ? 'FUEL HER: ' + fis.toFixed(1) + ' t of fissiles from your hold, free' : 'bring fissiles in your hold to fuel her free')
               : 'fuel her at her own desk, from your hold',
          function () {
            var r = Sx.fuelFromHold(G, st);
            say(r.ok ? r.tonnes.toFixed(1) + ' t into her reactor - ' + r.weeks.toFixed(1) + ' weeks of burn' : 'No: ' + r.why, 5);
          }, !(here && fis > 0), { hot: here && fis > 0 });
      /* What has been added to her since she opened (another Crawler's
       * crates), and what each one does - or that it does nothing yet. */
      if (st.foundN && st.crates.length > st.foundN) {
        var fit = Sx.fitted(st, G.t), Cn2 = global.Construction, parts = [];
        for (var fid in fit) {
          var cr2 = Cn2.BY_ID[fid];
          parts.push(fit[fid] + 'x ' + (cr2 ? cr2.name : fid) + ' (' + (Sx.DOES[fid] || 'fitted, does nothing yet') + ')');
        }
        var pend = Sx.pending(st, G.t);
        row('    UPGRADES' + (pend ? '  ·  ' + pend + ' to fit' : ''), parts.join(', ') || 'none fitted yet', function () {}, true);
      }
    });
  }

  /* --- MODULES: station crates and the Crawler that carries them ----------
   * Astra, 2026-10-20: the Crawler is a station's first L bay, and her 24
   * cubes carry "station component crates" — 6 S, 4 M, 2 L or 1 XL to a
   * cube. Crates are built here at a yard, with build time, and craned
   * aboard a Crawler here. Founding a station from her is the next slice. */
  function drawYardModules(ctx, x, w, row, s, port) {
    var Cn = global.Construction;
    var yard = Combat.isShipyard(port);
    var mine = Cn.owned(G);
    var crawler = Cn.isCrawler(s);

    /* HER CUBES, first when you are in a Crawler. */
    if (crawler) {
      var cc = Cn.crateCubes(Cn.aboard(s)), fc = Cn.freightCubes(s);
      row('CRAWLER CUBES  ·  ' + cc + ' crates  ·  ' + fc + ' freight  ·  ' +
          (Cn.CUBES - cc - fc) + ' empty  of ' + Cn.CUBES,
          'a cube holds 6 S, 4 M, 2 L or 1 XL crates, or ' + Cn.TONNES_PER_CUBE + ' t of freight',
          function () {}, true);
      Cn.aboard(s).forEach(function (a) {
        var c = Cn.BY_ID[a.crateId];
        row('  ' + c.name.toUpperCase() + ' CRATE  [' + c.size + ']',
            yard ? 'aboard  ·  click to lift it off onto this yard\'s floor'
                 : 'aboard  ·  a shipyard can lift it off',
            function () {
              var r = Cn.unload(G, a.id);
              say(r.ok ? c.name + ' crate lifted off — it waits here' : 'Not here: ' + r.why, 5);
            }, !yard, { icon: 'mod_' + a.crateId });
      });
    }

    if (crawler) {
      /* WHAT THIS LOAD WOULD FOUND (Astra agreed, 2026-10-20): Crew
       * quarters, one defining crate, one more to make it work. A type
       * whose defining crate is aboard says what it still lacks; the rest
       * stay quiet unless nothing is close. */
      var load = Cn.aboard(s);
      var found = Cn.canFound(load);
      var near = found.filter(function (f) { return f.ok || f.defining; });
      row('THIS LOAD FOUNDS', near.length ? 'a Crawler becomes a station\'s first bay - cast off, then found her on her crew channel'
                                          : 'nothing yet: Crew quarters, a defining crate, and what it needs',
          function () {}, true);
      near.forEach(function (f) {
        row('  ' + (f.ok ? '✓ ' : '· ') + f.name.toUpperCase(),
            f.ok ? 'all there' : 'still needs: ' + f.missing.map(function (id) {
              return Cn.BY_ID[id] ? Cn.BY_ID[id].name : id;
            }).join(', '),
            function () {}, true, { hot: f.ok });
      });

      /* HER CRAFT BAY: three S slots, a tug always. More tugs, faster in
       * orbit; the heavy shuttle, faster to the surface. */
      var lo = Cn.loadoutOf(s);
      var dO = Cn.buildDaysFor(load, lo, false), dS = Cn.buildDaysFor(load, lo, true);
      function days(d) { return !isFinite(d) ? 'can\'t' : d < 0.05 ? '—' : d.toFixed(1) + ' d'; }
      row('CRAFT BAY  ·  ' + lo.name.toUpperCase() + '  ·  ' + lo.craft.map(function (c) {
            return Cn.CRAFT[c].name; }).join(' + '),
          'this load: orbit ' + days(dO) + '  ·  surface ' + days(dS) + '  ·  ' + lo.blurb,
          function () {}, true);
      if (yard) {
        Cn.LOADOUTS.forEach(function (to) {
          if (to.id === lo.id) return;
          var c = Cn.loadoutCost(lo.id, to.id);
          var tO = Cn.buildDaysFor(load, to, false), tS = Cn.buildDaysFor(load, to, true);
          row('  ▶ REFIT TO ' + to.name.toUpperCase() + '  ' + (c >= 0 ? '— ' + c + ' cr' : '+' + (-c) + ' cr'),
              to.craft.map(function (k) { return Cn.CRAFT[k].name; }).join(' + ') +
              (load.length ? '  ·  orbit ' + days(tO) + '  ·  surface ' + days(tS) : '  ·  ' + to.blurb),
              function () {
                var r = Cn.changeLoadout(G, to.id);
                say(r.ok ? 'Her bay is ' + to.name.toLowerCase() + ' now' +
                           (r.cost > 0 ? ' — ' + r.cost + ' cr' : r.cost < 0 ? ' — ' + (-r.cost) + ' cr back' : '')
                         : 'No: ' + r.why, 6);
              }, c > 0 && (s.credits || 0) < c);
        });
      }
    }

    /* WAITING AT THIS YARD, and on its slips. */
    var here = mine.filter(function (r) {
      return !r.aboard && r.port === s.docked && (!r.star || !G.here || r.star === G.here.id);
    });
    if (here.length) {
      row('YOURS AT ' + (port.name || 'this yard').toUpperCase(),
          crawler ? 'click one to crane it aboard ▶' : 'a Crawler can load these here',
          function () {}, true);
      here.forEach(function (r) {
        var c = Cn.BY_ID[r.crateId];
        var onSlip = !Cn.ready(r, G.t);
        var why = onSlip ? null : Cn.loadRefusal(G, r);
        row('  ' + c.name.toUpperCase() + ' CRATE  [' + c.size + ']' + (onSlip ? '  ·  ON THE SLIP' : ''),
            onSlip ? 'ready in ' + fmtLogAge(r.due - G.t) : (why || 'load it ▶'),
            function () {
              var res = Cn.load(G, r.id);
              say(res.ok ? c.name + ' crate craned aboard' : 'Not yet: ' + res.why, 5);
            }, onSlip || !!why, { hot: !onSlip && !why, icon: 'mod_' + r.crateId });
      });
    }

    /* ELSEWHERE: crates you own at other yards. */
    mine.filter(function (r) { return !r.aboard && here.indexOf(r) < 0; }).forEach(function (r) {
      var c = Cn.BY_ID[r.crateId];
      row(c.name.toUpperCase() + ' CRATE  [' + c.size + ']  ·  AT ' + (r.portName || 'another yard').toUpperCase(),
          (r.starName ? r.starName + '  ·  ' : '') +
          (Cn.ready(r, G.t) ? 'ready' : 'ready in ' + fmtLogAge(r.due - G.t)),
          function () {}, true, { icon: 'mod_' + r.crateId });
    });

    if (!yard) {
      if (!mine.length && !crawler) {
        row('NO STATION CRATES', 'station crates are built at a shipyard', function () {}, true);
      }
      return 0;
    }

    /* THE CATALOGUE. The L comes first: a station starts as a Crawler, so
     * until you have one every row says so. */
    row('BUILD A STATION CRATE AT ' + (port.name || 'this yard').toUpperCase(),
        Cn.hasCrawler(G) ? 'paid now, built here, waits here for a Crawler'
                         : 'a station starts as a Crawler — commission one on HULLS first',
        function () {}, true);
    /* A crate opens its card, as equipment does on BUY (2026-11-09): its
     * model turning, what it is for, and ORDER on the card. */
    Cn.CRATES.forEach(function (c) {
      var why = Cn.orderRefusal(G, c.id);
      row('  ' + c.name.toUpperCase() + '  [' + c.size + ']  —  ' + c.price + ' cr  ·  ' +
          c.days + (c.days === 1 ? ' day' : ' days'),
          why || (c.blurb + '  ·  ' + Cn.PER_CUBE[c.size] + ' to a cube'),
          function () { G.yardModule = c.id; }, false,
          { hot: G.yardModule === c.id, icon: 'mod_' + c.id });
    });
    return 0;
  }

  /* ---- THE CRATE CARD (2026-11-09) ----------------------------------------
   * The MODULES tab's own sub-window, the item card's twin: the module's
   * model turning (Astra's mod_<id>), its size and price, how long it takes
   * on the slip and how many go to a cube, what it does, and ORDER with the
   * reason beside it when the yard will not take the order. */
  function drawModuleCard(ctx, x, y, w, h) {
    var Cn = global.Construction, c = Cn && Cn.BY_ID[G.yardModule];
    if (!c) { G.yardModule = null; return; }
    var sw = global.innerWidth || (x + w);
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,9,0.72)';
    ctx.fillRect(0, 0, sw, y + h);
    ctx.restore();
    hot(0, 0, sw, y + h, function () { G.yardModule = null; }, 'close');
    var cw = Math.min(640, sw - 32), ch = Math.min(300, h - 24);
    var cx = Math.round(Math.max(16, Math.min(sw - 16 - cw, x + (w - cw) / 2)));
    var cy = Math.round(y + (h - ch) / 2);
    ctx.save();
    ctx.fillStyle = '#06121a';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2);
    ctx.restore();
    hot(cx, cy, cw, ch, function () {}, null);

    var pic = Math.min(ch - 60, Math.round(cw * 0.36)), px = cx + 14, py = cy + 14;
    ctx.save();
    ctx.fillStyle = '#030a0f';
    ctx.fillRect(px, py, pic, pic);
    ctx.strokeStyle = 'rgba(74,151,176,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pic - 1, pic - 1);
    ctx.restore();
    var spin = ((typeof performance !== 'undefined' ? performance.now() : 0) / 1000 / ITEM_TURN) * Math.PI * 2;
    if (!(Render.drawItemPortrait && Render.drawItemPortrait(ctx, px, py, pic, 'mod_' + c.id, spin))) {
      drawItemStandIn(ctx, px, py, pic, { kind: 'module' }, spin);
    }

    var tx = px + pic + 16, tw = cx + cw - 14 - tx;
    ctx.save();
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(clipText(c.name + ' crate', Math.floor(tw / 8.5)), tx, cy + 30);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText(fmtCredits(c.price), tx, cy + 48);
    var specs = [['Size', c.size + '  ·  ' + Cn.PER_CUBE[c.size] + ' to a Crawler cube'],
                 ['On the slip', c.days + (c.days === 1 ? ' day' : ' days')]];
    ctx.font = '11px ui-monospace, monospace';
    for (var i = 0, ly = cy + 70; i < specs.length; i++, ly += 15) {
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(specs[i][0], tx, ly);
      ctx.fillStyle = MFD_INK;
      ctx.fillText(clipText(specs[i][1], Math.floor((tw - 100) / 6.6)), tx + 100, ly);
    }
    ctx.font = 'italic 11px ui-monospace, monospace';
    ctx.fillStyle = '#c9d8e6';
    var lines = wrapText(c.blurb || '', Math.floor((tw) / 6.6));
    for (var li = 0; li < lines.length && cy + 112 + li * 14 < cy + ch - 40; li++) ctx.fillText(lines[li], tx, cy + 112 + li * 14);
    ctx.restore();

    var why = Cn.orderRefusal(G, c.id), by = cy + ch - 32;
    btn(ctx, cx + 14, by, 190, 22, 'ORDER  —  ' + fmtCredits(c.price), function () {
      var r = Cn.order(G, c.id);
      say(r.ok ? c.name + ' crate ordered — ready here in ' + r.days + (r.days === 1 ? ' day' : ' days')
               : 'No: ' + r.why, 6);
      if (r.ok) G.yardModule = null;
    }, { disabled: !!why, hot: !why, font: 11 });
    if (why) {
      ctx.save();
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = '#ffb86b';
      ctx.fillText(clipText(why, Math.floor((cw - 330) / 6.6)), cx + 214, by + 15);
      ctx.restore();
    }
    btn(ctx, cx + cw - 104, by, 90, 22, 'CLOSE  Esc', function () { G.yardModule = null; }, { font: 10 });
  }

  /* --- FLEET: the ships you own and are not sitting in --------------------
   *
   * A list, deliberately. Everything a fleet eventually DOES — orders,
   * crew, swapping seats — hangs off knowing which ships there are and
   * where, and that is a thing worth being able to see before it is a
   * thing worth being able to do. Selling is here because a hull you
   * cannot get rid of is a hull the yard tricked you into.
   */
  function fmtCr(n) { return Math.round(n || 0).toLocaleString('en-US') + ' cr'; }
  function drawYardFleet(ctx, x, w, row, s, port) {
    var mine = Fleet ? Fleet.list(G) : [];
    var hull = Combat.HULLS[s.hullId || 'talon'];

    /* The ship under your hands, first and unmistakable — a list of your
     * ships that leaves out the one you are in reads as a bug every time. */
    row('UNDER YOUR HANDS  ·  ' + (s.shipName || (hull ? hull.name : 'your ship')),
        (hull ? hull.name : '') + '  ·  here  ·  ' +
        Math.round(Sim.cargoMass(s)) + ' / ' + s.cargoCap + ' t',
        function () {}, true);
    /* REPAINT IN A FACTION'S COLOURS (2026-10-24): a Crawler only, at a
     * shipyard, in the livery of whoever holds the yard and trusts you —
     * the same rule as building her that way (Combat.liveryRefusal). */
    if (Combat.LIVERY_HULLS && Combat.LIVERY_HULLS[s.hullId] && Combat.repaintLivery) {
      var nowLiv = s.livery || 'civ';
      ['civ', 'navy', 'syn'].forEach(function (liv) {
        if (liv === nowLiv) return;
        var why = !Combat.isShipyard(port) ? 'only a shipyard repaints a hull'
                : Combat.liveryRefusal(G, port, liv);
        row('  ▶ REPAINT IN ' + (Combat.LIVERY_NAMES[liv] || liv).toUpperCase() + ' LIVERY  ·  ' +
            Combat.REPAINT_PRICE + ' cr',
            why || 'she flies their colours, outside and in, until she is repainted',
            function () {
              var r = Combat.repaintLivery(G, liv);
              if (!r.ok) { say('Not here: ' + r.why, 6); return; }
              say('She comes out of the paint shed in ' + Combat.LIVERY_NAMES[liv] + ' colours — ' +
                  r.cost + ' cr', 7);
            }, !!why);
      });
    }
    /* REFIT THE COCKPIT (2026-11-21): the other two of this hull's three
     * cockpit fits, at a shipyard, for a small fee (Combat.refitCockpit). */
    if (Combat.refitCockpit && Render.HULL_LOOKS && Render.HULL_LOOKS[s.hullId]) {
      var nowLook = s.cockpitLook | 0;
      Render.HULL_LOOKS[s.hullId].forEach(function (lk, li) {
        if (li === nowLook) return;
        var why = !Combat.isShipyard(port) ? 'only a shipyard refits a cockpit' : null;
        row('  ▶ REFIT COCKPIT TO ' + 'ABC'[li] + '  ·  ' + Combat.cockpitRefitCost(s.hullId) + ' cr',
            why || Render.lookSummary(lk, s.hullId, li),
            function () {
              var r = Combat.refitCockpit(G, li);
              if (!r.ok) { say('Not here: ' + r.why, 6); return; }
              say('The fitters are done: cockpit ' + 'ABC'[li] + ' — ' + r.cost + ' cr', 6);
            }, !!why);
      });
    }

    /* ON THE SLIPS, wherever they are: a hull you have paid for is part of
     * the fleet you are planning, even while she is still being built. */
    var slips = Combat.orders ? Combat.orders(G) : [];
    slips.forEach(function (o) {
      var oh = Combat.HULLS[o.hullId] || {};
      row((o.name || oh.name || o.hullId).toUpperCase() + '  ·  ON THE SLIP',
          (oh.name || o.hullId) + ' at ' + (o.portName || 'a yard') +
          (o.starName ? ', ' + o.starName : '') + '  ·  ready in ' +
          fmtLogAge(Combat.orderEta(o, G.t)),
          function () {}, true);
    });

    /* THE TRADING HOUSES' ACCOUNTS (tradingfirm.js, 2026-11-03): one row
     * per open account, above the ships, with what is in it and how the
     * quarter is going — the number the house will be judged on. Read
     * only: money moves at the house's own desk, where the factor is. */
    var TFs = global.TradingFirm;
    if (TFs) {
      TFs.book(G, G.t);
      TFs.contracts(G).forEach(function (c) {
        if (c.closed) return;
        var eq = TFs.equity(G, c), so = eq - c.qStart - c.qFlows;
        var last = c.history && c.history.length ? c.history[c.history.length - 1] : null;
        var tell = function () {
          say('Your account with ' + c.firmShort + ' is kept at their office at ' + c.portName +
              (c.starName ? ', ' + c.starName : '') + ' — withdraw, deposit or close it there', 6);
        };
        /* Two rows, short: the first draft put all of it on one and the
         * row cut the last quarter off at the right edge, which is the one
         * number the house is judged on. */
        row('ACCOUNT  ·  ' + c.firmShort.toUpperCase() + (c.closing ? '  ·  CLOSING' : ''),
            'worth ' + fmtCr(eq) + '  ·  this quarter ' + (so >= 0 ? '+' : '') + fmtCr(so) +
            (c.nextReview != null ? '  ·  review in ' + TFs.fmtSpan(Math.max(0, c.nextReview - G.t)) : ''), tell);
        row('   LAST QUARTER',
            (last ? (last.profit >= 0 ? '+' : '') + fmtCr(last.profit) + ', ' + last.verdict + ', ' + fmtCr(last.commission) + ' commission'
                  : 'none yet — the first review is the end of this one') +
            '  ·  ' + fmtCr(c.cash) + ' cash  ·  ' + c.hulls.length + ' hull' + (c.hulls.length === 1 ? '' : 's'), tell);
      });
    }

    if (!mine.length) {
      if (!slips.length) {
        row('YOU OWN NO OTHER SHIP', 'buy a hull with KEEP HER and the old one stays yours',
            function () {}, true);
      }
      return 0;
    }

    for (var i = 0; i < mine.length; i++) {
      (function (rec) {
        /* Port ids are per system ('b7' is a different dock at every star),
         * so "on this clamp" has to be this star as well. */
        var hereNow = rec.port === s.docked && !rec.order &&
                      !(rec.star && G.here && rec.star !== G.here.id);
        var worth = Fleet.resale(rec);

        /* UNDER WAY. One row, no action: she is on the timetable and the
         * order closes itself when the arithmetic says. The countdown is
         * what makes it a ship rather than a line in a book. */
        /* WORKING (mining rung 4). One row that says where in the loop she
         * is, and clicking it recalls her: she finishes the run she is on
         * and stands down at her port. A second click does nothing new -
         * the row says she is already standing down. */
        /* ON A TRADING HOUSE'S BOOK: where she is in her run, what she has
         * made the account, and the account's last quarter. One row, no
         * action here — she is the house's to direct until you stand her
         * down at its office. */
        if (rec.trade && TFs) {
          var tc = TFs.contractFor(G, rec), made = rec.trade.made || 0, tl = rec.trade.leg;
          var hailHer = function () {
            say(rec.name + ' is ' + TFs.phaseOf(rec, G.t) + ' for ' + (tc ? tc.firmShort : 'the house') +
                ' — you can hail her on the channel', 6);
          };
          row(rec.name.toUpperCase() + '  ·  TRADING FOR ' + (tc ? tc.firmShort.toUpperCase() : 'A HOUSE'),
              tl ? (tl.cid ? tl.qty + ' t ' + TFs.goodName(tl.cid) : 'empty') + ' → ' + tl.toName +
                   (tl.kind === 'jump' ? ' (' + (tl.toStarName || 'another star') + ')' : '') +
                   '  ·  in ' + TFs.fmtSpan(Math.max(0, tl.arrive - G.t))
                 : 'at ' + (rec.portName || 'her port') + '  ·  next run in ' + TFs.fmtSpan(Math.max(0, rec.trade.next - G.t)),
              hailHer);
          row('   HER RUNS', (rec.trade.runs || 0) + ' run' + (rec.trade.runs === 1 ? '' : 's') + ', ' +
              (made >= 0 ? '+' : '') + fmtCr(made) + ' to the account', hailHer);
          return;
        }
        if (rec.work) {
          var wk = rec.work;
          row(rec.name.toUpperCase() + '  ·  WORKING ' + wk.siteName.toUpperCase(),
              Fleet.workPhase(wk, G.t) + '  ·  ' + wk.booked + ' load' + (wk.booked === 1 ? '' : 's') +
              ' home' + (wk.stopAfter !== undefined ? '  ·  STANDING DOWN after this run'
                                                    : '  ·  click to recall'),
              function () {
                if (wk.stopAfter !== undefined) {
                  say(rec.name + ' is already standing down after this run', 4);
                  return;
                }
                var r = Fleet.recall(G, rec, G.t);
                if (r.ok) say(rec.name + ' will stand down at ' + wk.portName + ' in ' +
                              fmtLogAge(Math.max(0, r.at - G.t)), 6);
              }, wk.stopAfter !== undefined);
          return;
        }
        if (rec.order) {
          row(rec.name.toUpperCase() + '  ·  UNDER WAY',
              'for ' + rec.order.toName + '  ·  alongside in ' +
              fmtLogAge(Fleet.eta(rec, G.t)) +
              (rec.crew && rec.crew.length ? '  ·  ' + rec.crew.length + ' crew' : '') +
              (function () {
                var n = global.Missions && global.Missions.carriedBy
                  ? global.Missions.carriedBy(G, rec.id).length : 0;
                return n ? '  ·  ' + n + ' contract' + (n > 1 ? 's' : '') + ' aboard' : '';
              })(),
              function () {
                say(rec.name + ' is ' + fmtLogAge(Fleet.eta(rec, G.t)) + ' out of ' +
                    rec.order.toName + ' — you can hail her on the channel', 5);
              }, true);
          return;
        }
        /* What she costs you standing there. Shown per ship rather than as
         * a total, because the decision the player is making on this row is
         * whether to keep THIS hull. Arrears take the slot when there are
         * any: a bill you are behind on is more urgent news than a bill you
         * are not. */
        var owed = rec.arrears || 0;
        var upkeep = owed > 0
          ? '  ·  ' + owed + ' cr OWED'
          : '  ·  ' + Fleet.berthFee(rec) + ' cr/week';
        row(rec.name.toUpperCase() + (hereNow ? '  ·  ON THIS CLAMP' : ''),
            Fleet.describe(rec, G.sys) + upkeep + '  ·  worth ' + worth + ' cr',
            function () {
              /* Selling is only possible where she is, which is the same
               * rule as every other transaction in this game: you cannot
               * trade a hold from the far side of the galaxy either. */
              /* A PARTNER'S SHIP IS HERS (favours.js). She flies with you
               * and takes your orders; the title was never yours. */
              if (rec.partner) {
                say('The ' + rec.name + ' is ' + rec.partner.name + '\'s ship — she flies with you, ' +
                    'but she is not yours to sell', 6);
                return;
              }
              if (!hereNow) {
                say(rec.name + ' is at ' + (rec.portName || 'another port') +
                    ' — you have to be standing beside a ship to sell her', 6);
                return;
              }
              /* THE DEBT COMES OUT OF THE SALE. Without this, unpaid
               * berthing was free money: run the arrears up for a year,
               * sell her at full resale, and the debt went into the bin
               * with the record. The harbour is paid first, as it is when
               * it forecloses, and for the same reason. */
              var owed = rec.arrears || 0;
              var net = Math.max(0, worth - owed);
              Fleet.remove(G, rec.id);
              s.credits += net;
              say('Sold the ' + rec.name + ' where she stood — ' + worth + ' cr' +
                  (owed > 0 ? ', less ' + owed + ' cr owed on the clamp  ·  ' +
                              net + ' cr to you' : ''), 6);
            },
            false, { hot: hereNow });

        /* TAKE COMMAND (2026-10-19). Step across the clamp into her. Two
         * rows because they are two transactions: the ship you are in
         * stays as one of yours, or the yard takes her in part exchange. */
        if (hereNow && !rec.partner && Combat.takeCommand) {
          var cur = s.shipName || (hull ? hull.name : 'your ship');
          var whyK = Combat.commandRefusal(G, rec, 'keep');
          var whyT = Combat.commandRefusal(G, rec, 'tradein');
          var back = Combat.tradeInValue(s);
          var stepAcross = function (mode) {
            var r = Combat.takeCommand(G, rec.id, mode);
            if (!r.ok) { say('Not yet: ' + r.why, 6); return; }
            say('You have command of the ' + r.name + '.' +
                (r.parked ? ' The ' + r.parked.name + ' stays on the clamp, still yours.'
                          : ' The yard took the ' + cur + ' for ' + r.credit + ' cr.') +
                (Crew && Crew.needsCrew && Crew.needsCrew(G.ship) && !(G.ship.crew || []).length
                  ? ' She wants hands — CREW.' : ''), 9);
          };
          row('  ▶ TAKE COMMAND  ·  keep the ' + cur, whyK || 'she stays here as one of yours',
              function () { stepAcross('keep'); }, !!whyK);
          row('  ▶ TAKE COMMAND  ·  trade in the ' + cur + '  +' + back + ' cr',
              whyT || 'your hold and your people come across with you',
              function () { stepAcross('tradein'); }, !!whyT);
        }

        /* STANDING ORDERS. A row per port she could be sent to, under the
         * ship it applies to, each carrying the crossing time — a
         * destination without a number beside it is a guess. When she
         * cannot be sent anywhere the reason takes the row instead, once,
         * because a list of eight greyed ports that will not say why is
         * eight copies of the same bug. */
        var inThisSystem = !!(G.sys && G.sys.byId && G.sys.byId[rec.port]) &&
                           !(rec.star && G.here && rec.star !== G.here.id);
        if (!inThisSystem) return;

        /* CONTRACTS ACROSS THE CLAMP. Astra: "load mission items onto NPC,
         * player owned ships." One row per contract you hold, under the
         * ship it would go to: LOAD moves the freight or the people into
         * her, UNLOAD brings them back, and the refusal sits in the row's
         * own words when neither is possible. Only when you are on the
         * same clamp — you cannot pass a crate to a ship across the
         * system any more than you can sell one to a market there. */
        var M = global.Missions, portHere = G.sys.byId[s.docked];
        if (M && M.loadRefusal && portHere && rec.port === portHere.id) {
          var held = G.missions || [];
          for (var mi = 0; mi < held.length; mi++) {
            (function (m) {
              var what = m.type === 'passage' ? m.souls + ' aboard' : m.tonnes + 't ' + m.cid;
              if (m.carrier === rec.id) {
                var noBack = M.unloadRefusal(G, rec, m, portHere);
                row('   ⇐ UNLOAD ' + what.toUpperCase() + ' → ' + m.toName,
                    noBack ? noBack : 'her contract  ·  ' + m.pay + ' cr on delivery',
                    function () {
                      var r = M.unloadFrom(G, rec, m, portHere, { say: say });
                      if (!r.ok) say('Stays aboard her: ' + r.why, 5);
                    }, !!noBack);
              } else if (!m.carrier) {
                var no = M.loadRefusal(G, rec, m, portHere);
                row('   ⇒ LOAD ' + what.toUpperCase() + ' → ' + m.toName,
                    no ? no : 'she delivers it, you get ' + m.pay + ' cr',
                    function () {
                      var r = M.loadOnto(G, rec, m, portHere, { say: say });
                      if (!r.ok) say('Stays with you: ' + r.why, 5);
                    }, !!no);
              }
            })(held[mi]);
          }
        }

        /* WORK ORDERS (mining rung 4). One pair of rows per giant in the
         * system - SELL at her port, or KEEP the load aboard for one run -
         * each with what a load is and what it fetches today. When every
         * giant refuses for the same reason (no skimmer fitted, no pilot)
         * that reason takes one row instead of a list of identical greys. */
        /* Work sites (mining rung 4): giants to skim and, since 2026-10-18,
         * rings to cut with a mining laser. A ringed giant is both. */
        var sites = Fleet.workSites ? Fleet.workSites(G.sys) : [];
        if (sites.length) {
          var plans = sites.map(function (st) {
            return { g: st.body, kind: st.kind, p: Fleet.planWork(G, rec, G.sys, st.body.id, 'sell', st.kind) };
          });
          /* Best-paying first. Refusals sink to the bottom. */
          var EcoW = global.Economy, homePort = G.sys.byId[rec.port];
          var runValue = function (pl) {
            var v = 0;
            (Fleet.loadOf(pl) || []).forEach(function (l) {
              var bid = EcoW ? EcoW.price(homePort, l.cid, G.t) : null;
              v += l.qty * (bid && bid.sell !== null ? bid.sell : 0);
            });
            return Math.round(v);
          };
          plans.forEach(function (x) { if (x.p.ok) { x.value = runValue(x.p); x.perDay = Math.round(x.value * 86400 / x.p.period); } });
          plans.sort(function (a, b) {
            if (a.p.ok !== b.p.ok) return a.p.ok ? -1 : 1;
            return a.p.ok ? (b.perDay - a.perDay) : 0;
          });
          var okPlans = plans.filter(function (x) { return x.p.ok; });
          var whys = {};
          plans.forEach(function (x) { if (!x.p.ok) whys[x.p.why] = true; });
          if (!okPlans.length && Object.keys(whys).length === 1) {
            row('   cannot work a site', Object.keys(whys)[0], function () {}, true);
          } else {
            plans.forEach(function (x) {
              var cutting = x.kind === 'cut';
              var label = '   ⇄ ' + (cutting ? 'CUT ' + x.g.name.toUpperCase() + ' RING' : 'SKIM ' + x.g.name.toUpperCase());
              if (!x.p.ok) { row(label, x.p.why, function () {}, true); return; }
              var pl = x.p;
              var what = (Fleet.loadOf(pl) || []).map(function (l) {
                return ((EcoW && EcoW.BY_ID[l.cid] && EcoW.BY_ID[l.cid].name) || l.cid).toLowerCase();
              }).join(', ');
              row(label + ' → SELL AT ' + pl.portName.toUpperCase(),
                  pl.tonnes + ' t a run (' + what + '), ~' + x.value + ' cr at today\'s price  ·  a run every ' +
                  fmtLogAge(pl.period) + ' (~' + x.perDay + ' cr/day)' +
                  (!cutting && !pl.shield ? '  ·  no heat shield: slow' : ''),
                  function () {
                    var r = Fleet.startWork(G, rec, G.sys, x.g.id, 'sell', G.t, x.kind);
                    if (!r.ok) { say('She stays: ' + r.why, 5); return; }
                    say(rec.name + ' is away to ' + (cutting ? 'cut in ' + x.g.name + '\'s ring' : 'skim ' + x.g.name) +
                        ' for ' + pl.portName + ' - first load home in ' +
                        fmtLogAge(Fleet.workArrival(r.work, 0) - G.t), 7);
                  }, false);
              row(label + ' → KEEP ABOARD',
                  'one run, ' + pl.tonnes + ' t of ' + what + ' back in her hold  ·  home in ' +
                  fmtLogAge(2 * pl.cruise + pl.lay),
                  function () {
                    var r = Fleet.startWork(G, rec, G.sys, x.g.id, 'keep', G.t, x.kind);
                    if (!r.ok) { say('She stays: ' + r.why, 5); return; }
                    say(rec.name + ' is away - home with the load in ' +
                        fmtLogAge(Fleet.workArrival(r.work, 0) - G.t), 7);
                  }, false);
            });
          }
        }

        var pilot = Fleet.pilotOf(rec);
        var ports = (G.sys.ports || []).filter(function (p) { return p.id !== rec.port; });
        var first = ports.length ? Fleet.canOrder(G, rec, G.sys, ports[0].id) : null;
        if (!first || !first.ok) {
          row('   cannot be ordered', first ? first.why : 'nowhere else to send her',
              function () {}, true);
          return;
        }
        for (var pi = 0; pi < ports.length; pi++) {
          (function (dest) {
            var q = Fleet.quote(G, rec, G.sys, dest.id);
            if (!q.ok && !q.fuel) return;
            /* A leg her tank cannot cover stays on the list, greyed, with
             * both numbers — that is the refusal a captain can act on. */
            row('   → SEND TO ' + dest.name.toUpperCase(),
                !q.ok ? q.why
                      : 'about ' + fmtLogAge(q.cruise) + ' under way  ·  ' + q.fuel.toFixed(1) +
                        ' t reaction mass  ·  ' + pilot.name + ', ' + Crew.ratingWord(pilot.rating),
                function () {
                  var r = Fleet.order(G, rec, G.sys, dest.id, G.t);
                  if (!r.ok) { say('She stays: ' + r.why, 5); return; }
                  say(rec.name + ' has cast off for ' + dest.name + ' — ' +
                      pilot.name + ' reckons ' + fmtLogAge(r.order.cruise), 7);
                }, !q.ok);
          })(ports[pi]);
        }
      })(mine[i]);
    }
    return 0;
  }

  /* --- FITTING: what is bolted on, and what it costs you ------------------ */
  function drawYardFit(ctx, x, w, row, s, port) {
    var keys = Combat.slotKeys(s);
    var map = s.fit || {};
    var shown = 0;
    /* A LARGE HULL IS WORKED ON AT A SHIPYARD (2026-10-19). Said once, at
     * the top, rather than as a dozen greyed SELL rows that will not say
     * why — doctrine 5. The rows still show what she carries. */
    var yardNo = Combat.yardRefusal ? Combat.yardRefusal(G) : null;
    if (yardNo) row('NO REFITS HERE', yardNo, function () {}, true);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var type = Combat.slotType(key);
      var label = (Combat.SLOT_LABEL[type] || type).toUpperCase() + ' ' +
                  (parseInt(key.replace(/\D+/g, ''), 10) + 1);
      /* One cut out of her hold says so, and a concealed one says whether
       * its panel has opened yet (HOLD INTO A HARDPOINT). */
      var convAt = convIndexOfKey(s, key);
      if (convAt >= 0) {
        label += Combat.convList(s)[convAt] === 'hidden'
          ? (Combat.isHiddenKey(s, key) ? ' (CONCEALED)' : ' (CONCEALED, SEEN)') : ' (CONVERTED)';
      }
      var id = map[key], item = id && Combat.EQUIPMENT[id];
      /* The slipspace drive is replaced, never sold off - without one she
       * cannot leave the system (combat.js THE SLIPSPACE BAY). Its row
       * says so and opens BUY, where a better one is a trade-in. */
      if (item && item.slot === 'core') {
        var stdCls = Combat.stockCoreClass ? Combat.stockCoreClass(s.hullId) : null;
        row(label + ':  ' + item.name.toUpperCase(),
            (item.slipKind === 'slipdrive' && item.slipClass === stdCls ? 'standard with her frame' : 'trade-in ' + Math.round(item.price * Combat.RESALE) + ' cr') +
            ' · replace it from BUY, it cannot be sold off',
            function () { G.yardTab = 'buy'; }, false);
        shown++;
        continue;
      }
      if (item) {
        var refund = Math.round(item.price * Combat.RESALE);
        var detail = item.power > 0 ? item.power.toFixed(1) + ' MW' :
                     item.powerBonus ? '+' + item.powerBonus.toFixed(1) + ' MW' : '—';
        detail += ' · ' + item.mass + ' t · SELL ' + refund + ' cr';
        row(label + ':  ' + item.name.toUpperCase(), detail,
            (function (k, nm) {
              return function () {
                var got = Combat.sellFitted(G, k);
                say(got ? 'Sold the ' + nm.toLowerCase() + ' for ' + got + ' cr'
                        : (yardNo ? 'No: ' + yardNo : 'Nothing in that slot'), 4);
              };
            })(key, item.name), !!yardNo);
        /* Fire-group assignment gets its own row rather than sharing the
         * slot's. The slot row is SELL, and a control that sometimes sells
         * a 38,000 cr gun and sometimes moves it between triggers is a
         * control nobody will click twice.
         *
         * Guns only — nothing else has a trigger. Group membership is the
         * one thing about a loadout you cannot change in flight, which is
         * deliberate: choosing it is preparation, not a mid-fight menu. */
        if (item.kind === 'gun') {
          var grp = Combat.groupOf(s, key);
          row('    └ FIRE GROUP ' + grp.toUpperCase(),
              grp === 'a'
                ? 'mouse 1, or Space — click to move to group B'
                : 'mouse 2, or Shift+Space — click to move to group A',
              (function (k) {
                return function () {
                  var now = Combat.toggleGroup(s, k);
                  say('Moved to fire group ' + now.toUpperCase(), 3);
                };
              })(key), false);
        }
      } else {
        row(label + ':  empty', 'buy something to fill it',
            function () { G.yardTab = 'buy'; }, true);
      }
      shown++;
    }
    if (!shown) row('THIS HULL HAS NO SLOTS', null, function () {}, true);
    drawYardConversions(row, s, port);
  }

  function convIndexOfKey(s, key) {
    if (!Combat.convList) return -1;
    var l = Combat.convList(s);
    for (var i = 0; i < l.length; i++) if (Combat.convKey(s, i) === key) return i;
    return -1;
  }

  /* --- HOLD INTO A HARDPOINT (combat.js, 2026-11-20) -----------------------
   * Under the slots, because what it changes is the slot list: one row to
   * cut each kind of new hardpoint, one to cut each existing one back out.
   * The registered row is drawn everywhere with its reason when a yard
   * cannot do it, so the option is findable; the concealed one appears
   * only where a crew can be paid to forget, the way the grey shelf does. */
  function drawYardConversions(row, s, port) {
    if (!Combat.convert || !port) return;
    var list = Combat.convList(s);
    for (var i = 0; i < list.length; i++) {
      (function (idx, kind) {
        var n = parseInt(Combat.convKey(s, idx).replace(/\D+/g, ''), 10) + 1;
        var cost = Math.round(Combat.convPrice(s, kind) * Combat.CONV_REMOVE);
        var why = Combat.unconvertRefusal(G, port, idx);
        row('- CUT OUT ' + (kind === 'hidden' ? 'CONCEALED ' : '') + 'HARDPOINT ' + n + ' — ' + cost + ' cr',
            why || 'gives her ' + Combat.convHold(s, kind) + ' t of hold back',
            function () {
              var r = Combat.unconvert(G, port, idx);
              say(r.ok ? 'Hardpoint cut out — ' + r.hold + ' t of hold back, ' + r.price + ' cr'
                       : 'No: ' + r.why, 5);
            }, !!why);
      })(i, list[i]);
    }
    if (list.length >= Combat.CONV_MAX) return;
    var kinds = ['open'];
    if (G.sys && Combat.systemCorruption(G, G.sys) >= Combat.CONV_HIDDEN_CORRUPT) kinds.push('hidden');
    kinds.forEach(function (kind) {
      var price = Combat.convPrice(s, kind), hold = Combat.convHold(s, kind);
      var why = Combat.convRefusal(G, port, kind);
      row(kind === 'hidden' ? '+ CUT A CONCEALED HARDPOINT — ' + price + ' cr  ·  grey market'
                            : '+ CUT A NEW HARDPOINT — ' + price + ' cr',
          why || (hold + ' t of hold  ·  ' + (kind === 'hidden'
            ? 'no papers: pirates sizing her up do not see it until it fires; if the law sees it fire, that is a charge'
            : 'registered: on her papers, and any pirate sizing her up sees the gun')),
          function () {
            var r = Combat.convert(G, port, kind);
            say(r.ok ? 'A new hardpoint is cut — ' + r.hold + ' t of hold gone, ' + r.price + ' cr. Fit a gun to it from BUY.'
                     : 'No: ' + r.why, 6);
          }, !!why);
    });
  }

  /* --- BUY: what this port will sell you, and why it will not -------------
   * Locked rows are DRAWN, not hidden. "requires WARM standing with the
   * Halden Combine" reads as a goal; a row that simply is not there reads
   * as a bug. */
  function drawYardBuy(ctx, x, w, row, s, port) {
    var stock = Combat.stockAt(G, port);

    /* Consumables first — they are counters, not fittings, so they sit
     * above the catalogue rather than in it. */
    /* EVERY SEEKER THE TABLE HAS, one row each, because the ship carries a
     * rack per type now rather than one rack per ship. A row says what is in
     * that rack and, when the rack does not exist yet, whether there is a
     * free rail to start it on — which is the thing the old single-line
     * "aboard 4 / 8" could not say at all.
     *
     * Grey ordnance is still gated by what the port will sell: bootlegs
     * appear in `stock` below at a corrupt enough port, and a row here for
     * something nobody within a hundred light years sells would be a shop
     * window into a place you cannot reach. So the loop draws the certified
     * ones and leaves the grey to the catalogue. */
    var racksNow = Combat.rackList(s), rackCap = Combat.rackSlots(s);
    function rackOf(id) {
      for (var i = 0; i < racksNow.length; i++) if (racksNow[i].id === id) return racksNow[i];
      return null;
    }
    for (var mk in Combat.MISSILES) {
      (function (m) {
        /* Rock torpedoes are on the shelf only where somebody sells them:
         * a Guild hall, or the Syndicate's side of the counter. */
        if (m.torpedo) { if (!Combat.torpedoSoldAt(G, port, m)) return; }
        else if (m.grey) return;
        var have = rackOf(m.id);
        var full = have ? have.n >= m.rack : racksNow.length >= rackCap;
        var armed = s.missileId === m.id && s.missiles > 0;
        row(m.name.toUpperCase() + ' — ' + m.price + ' cr',
            (have ? 'aboard ' + have.n + ' / ' + m.rack + (armed ? '  ·  ARMED' : '')
                  : 'no rack — ' + (racksNow.length < rackCap
                      ? (rackCap - racksNow.length) + ' free of ' + rackCap
                      : 'all ' + rackCap + ' racks in use')) +
            (full && have ? '  ·  rack full' : '  “' + m.pitch + '”'),
            function () {
              var r = Combat.buyOutfit(G, 'missile', m.id);
              say(r > 0 ? m.name + ' racked — ' + s.missiles + ' armed'
                        : 'Not enough credits, or no rack free', 4);
            }, full, { icon: 'con_' + m.id });
        /* And the rack you are carrying can be ARMED from here, which is
         * the whole point of carrying two: the choice between a certified
         * round and a cheap one is made at the trigger, not at the till. */
        if (have && !armed) {
          row('  arm ' + m.name.toLowerCase(), have.n + ' aboard',
              function () {
                Combat.armRack(s, m.id);
                say(m.name + ' armed — ' + s.missiles + ' aboard', 4);
              }, false);
        }
      })(Combat.MISSILES[mk]);
    }

    /* Decoy charges, the same way: they need the launcher. */
    var dRack = Combat.decoyRackSize ? Combat.decoyRackSize(s) : 0;
    if (dRack) {
      var dFull = (s.decoys || 0) >= dRack;
      row('DECOY CHARGE - ' + Combat.DECOY.price + ' cr',
          'aboard ' + (s.decoys || 0) + ' / ' + dRack + (dFull ? '  ·  rack full' : '  "' + Combat.DECOY.pitch + '"'),
          function () {
            var r = Combat.buyOutfit(G, 'decoy', null);
            say(r > 0 ? 'Decoy loaded - ' + s.decoys + ' aboard' : 'Not enough credits', 4);
          }, dFull, { icon: 'con_decoy' });
    }

    /* Slugs for a mass driver (massdriver.js, 2026-11-02): cargo, a tonne
     * at a time, only where there is a driver aboard to feed. */
    var MD = global.MassDriver;
    if (MD && MD.hasDriver(s)) {
      row('DRIVER SLUGS, 1 t (40 rounds) — ' + MD.SLUG_PRICE_T + ' cr',
          MD.roundsAboard(s) + ' rounds aboard  “Twenty-five kilos each. You will feel every one leave.”',
          function () {
            var r = MD.buySlugs(G, 1);
            say(r.ok ? 'Slugs aboard — ' + r.rounds + ' rounds' : 'No: ' + r.why, 4);
          }, false, { icon: 'con_slugs' });
    }
    var rack = Combat.sinkRackSize(s);
    if (rack) {
      var sFull = s.sinks >= rack;
      row('HEAT SINK CHARGE — ' + Combat.SINK.price + ' cr',
          'aboard ' + s.sinks + ' / ' + rack +
          (sFull ? '  ·  rack full' : '  “' + Combat.SINK.pitch + '”'),
          function () {
            var r = Combat.buyOutfit(G, 'sink', null);
            say(r > 0 ? 'Sink loaded — ' + s.sinks + ' aboard' : 'Not enough credits', 4);
          }, sFull, { icon: 'con_sink' });
    }

    /* THE LIEN TAKES THE TOP OF THE SHELF. Every capital fitting below is
     * about to refuse, and a page of greyed rows that will not say why is
     * eight copies of the same bug — doctrine 5. The row is also the way
     * out: a pilot who has come good can clear it here. */
    var lienWhy = Combat.lienRefusal(G);
    if (lienWhy) {
      var owedNow = Combat.lienOwed(G);
      var canClear = s.credits > 0;
      row('LIEN — ' + owedNow + ' cr OUTSTANDING',
          lienWhy + (canClear
            ? '  ·  pay ' + Math.min(owedNow, Math.floor(s.credits)) + ' cr now'
            : '  ·  you have nothing to pay it with'),
          function () {
            var r = Combat.payLien(G, null);
            if (!r.ok) { say(r.why, 5); return; }
            say(r.cleared
              ? 'Lien cleared — ' + r.paid + ' cr to ' + r.who + '. The yard is open to you again.'
              : 'Paid ' + r.paid + ' cr to ' + r.who + ' — ' + r.left + ' cr still owed', 6);
          }, !canClear);
    }

    for (var i = 0; i < stock.length; i++) {
      var entry = stock[i], it = entry.item;
      if (!entry.available) {
        row(it.name.toUpperCase() + ' — LOCKED', entry.why, function () {}, true);
        continue;
      }
      var fitCheck = Combat.canFit(s, it.id);
      var afford = s.credits >= it.price;
      var sub;
      /* A cruise drive into a full bay is a trade-in, not a refusal: say
       * what it replaces, what it costs after, and how fast you will be. */
      /* So is a slipspace drive: the bay is never empty (2026-11-09). */
      var dp = (it.kind === 'cruisedrive' || it.slot === 'core') && Combat.drivePreview ? Combat.drivePreview(G, it.id) : null;
      if (dp) {
        /* The budget still decides, judged on the swap. */
        fitCheck = dp.ok ? (dp.core ? fitCheck : { ok: true }) : { ok: false, why: dp.why };
        afford = s.credits >= (dp.ok ? dp.net : it.price);
      }
      var yardWhy = Combat.yardRefusal ? Combat.yardRefusal(G) : null;
      if (yardWhy) fitCheck = { ok: false, why: yardWhy };
      if (lienWhy) sub = 'not while the lien stands — see above';
      else if (!fitCheck.ok) sub = fitCheck.why;
      else if (!afford) sub = 'short ' + ((dp && dp.ok ? dp.net : it.price) - s.credits) + ' cr';
      else if (dp && dp.ok && dp.core) {
        sub = 'reach ×' + dp.reachNow.toFixed(2) + ' → ×' + dp.reachAfter.toFixed(2) +
              (dp.replaces ? '  ·  trades in ' + dp.replaces.name + ' (' + dp.tradeIn + ' cr)  ·  ' + dp.net + ' cr net' : '');
      }
      else if (dp && dp.ok) {
        var fc = function (c) { return c >= 100 ? Math.round(c) + 'c' : c.toFixed(1) + 'c'; };
        var dry = it.mil && !((s.milFuel || 0) > 1e-6);
        sub = 'top speed ' + fc(dp.nowC) + ' → ' + fc(dp.topC) +
              (dry ? ' (' + fc(dp.topC * 5) + ' with milfuel in its tank)' : '') +
              (dp.replaces ? '  ·  trades in ' + dp.replaces.name + ' (' + dp.tradeIn + ' cr)  ·  ' + dp.net + ' cr net'
                           : '  ·  second drive');
      }
      else if (it.kind === 'gun') sub = it.dmg + ' dmg · ' + it.range + ' km · ' +
                                       it.power.toFixed(1) + ' MW · ' + it.heat + ' heat/s';
      else if (it.kind === 'reactor') sub = '+' + it.powerBonus.toFixed(1) + ' MW · ' + it.mass + ' t';
      else sub = it.power.toFixed(1) + ' MW · ' + it.mass + ' t';
      /* CLICK TO LOOK, NOT TO BUY (2026-11-09). Astra: "descriptions are
       * abridged. Change this so that we click on it to select and view
       * properties, and then a separate 'buy' icon in the description; this
       * will open a sub-window that describes the item." A row clipped its
       * pitch at the panel's edge, and a click on it spent the money. So a
       * row is now the name, the price and the one line that decides it
       * (why not, or the headline numbers), and a click opens the item's
       * card (drawItemCard): the turning portrait, every number, the whole
       * of the yard's copy, and BUY on the card itself. A row you cannot
       * buy from still opens - reading about a thing you cannot afford yet
       * is how you decide to save for it. */
      row(it.name.toUpperCase() + ' — ' + it.price + ' cr', sub,
          (function (eq) { return function () { G.yardItem = eq.id; }; })(it),
          false, { hot: G.yardItem === it.id, icon: 'eq_' + it.id });
    }
  }


  /* ---- THE CATALOGUE (2026-11-12) ----------------------------------------
   * Astra: "can you launch the game with the market screen open and every
   * single item selectable and with its description in place, and the icon,
   * rotating as it is designed to do? My wife wants a sort of gameopedia;
   * and that's something I think players will want also." Then: "let's do
   * the full catalogue and tie it in to the help screen."
   *
   * A reference page, not a shop. Every purchasable thing in the game -
   * 141 entries over nine groups - with its turning 3D icon, its numbers
   * and its copy, whatever world you are in and whatever is in your purse.
   * No gates: a market shows what this port stocks and what your standing
   * and the local development will let you buy, which is right for a market
   * and useless for a reference. The one thing held back is an `unlisted`
   * item, which is one you are not supposed to know exists yet
   * (catalogue.js owns that rule).
   *
   * It draws the numbers through the same itemSpecs() the yard's item card
   * uses, so the catalogue cannot quietly disagree with the shop.
   */
  var CAT_TURN = 9;                   // seconds per revolution, as the yard
  var CAT_ROW = 17;                   // list row height
  var CAT_TABS_H = 54;

  function catState() {
    if (!G.catalogue) G.catalogue = { group: 0, sel: 0, scroll: 0 };
    return G.catalogue;
  }

  function catGroups() {
    var Cat = global.Catalogue;
    return Cat ? Cat.groups(G) : [];
  }

  /* Clamp the selection and keep it on screen. `rows` is how many fit. */
  function catClamp(st, gs, rows) {
    if (!gs.length) return null;
    st.group = Math.max(0, Math.min(gs.length - 1, st.group | 0));
    var list = gs[st.group].items;
    st.sel = Math.max(0, Math.min(list.length - 1, st.sel | 0));
    if (rows > 0) {
      if (st.sel < st.scroll) st.scroll = st.sel;
      if (st.sel >= st.scroll + rows) st.scroll = st.sel - rows + 1;
      st.scroll = Math.max(0, Math.min(Math.max(0, list.length - rows), st.scroll));
    }
    return list[st.sel] || null;
  }

  /* Keys, routed from main.js. Returns true when it took the key. */
  function catalogueKey(k, shift) {
    var st = catState(), gs = catGroups();
    if (!gs.length) return false;
    var list = gs[st.group].items;
    if (k === 'arrowdown' || k === 'j') { st.sel++; if (st.sel >= list.length) st.sel = list.length - 1; return true; }
    if (k === 'arrowup' || k === 'k') { st.sel--; if (st.sel < 0) st.sel = 0; return true; }
    if (k === 'pagedown') { st.sel = Math.min(list.length - 1, st.sel + 12); return true; }
    if (k === 'pageup') { st.sel = Math.max(0, st.sel - 12); return true; }
    if (k === 'home') { st.sel = 0; return true; }
    if (k === 'end') { st.sel = list.length - 1; return true; }
    if (k === 'arrowright' || k === 'tab' && !shift) {
      st.group = (st.group + 1) % gs.length; st.sel = 0; st.scroll = 0; return true;
    }
    if (k === 'arrowleft' || k === 'tab' && shift) {
      st.group = (st.group + gs.length - 1) % gs.length; st.sel = 0; st.scroll = 0; return true;
    }
    return false;
  }

  function catalogueWheel(dy) {
    var st = catState(), gs = catGroups();
    if (!gs.length) return;
    st.sel = Math.max(0, Math.min(gs[st.group].items.length - 1, st.sel + (dy > 0 ? 3 : -3)));
  }

  /* ---- A SWATCH, for the things that are not objects ---------------------
   * A faction is a colour and a name; a world type is a colour and a name.
   * Neither has a model and neither should pretend to - an empty icon box
   * reads as a missing asset, which is a worse lie than no box at all. */
  function drawWikiSwatch(ctx, px, py, pic, entry) {
    ctx.save();
    var col = entry.swatch || '#4a97b0';
    ctx.fillStyle = '#03090e';
    ctx.fillRect(px, py, pic, pic);
    var pad = Math.round(pic * 0.18);
    var cx = px + pic / 2, cy = py + pic / 2, r = pic / 2 - pad;
    /* A WORLD IS A BALL AND A STAR IS A LIGHT. The first cut drew every
     * wiki entry as the same flat square, which was honest about having no
     * model and told the reader nothing. The colours are the generator's
     * own (Gen.PLANET_TYPES, Gen.STAR_CLASSES), so a type retinted in the
     * tables is retinted here. A faction keeps the flat square, because a
     * flag colour genuinely is a flat colour. */
    if (entry.kind === 'world type' && ctx.createRadialGradient) {
      var gw = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      gw.addColorStop(0, col);
      gw.addColorStop(0.62, col);
      gw.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = gw;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(2,6,9,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    } else if (entry.kind === 'star' && ctx.createRadialGradient) {
      var gs2 = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
      gs2.addColorStop(0, '#ffffff');
      gs2.addColorStop(0.28, col);
      gs2.addColorStop(0.55, col);
      gs2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gs2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = col;
      ctx.fillRect(px + pad, py + pad, pic - pad * 2, pic - pad * 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(2,6,9,0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + pad + 0.5, py + pad + 0.5, pic - pad * 2 - 1, pic - pad * 2 - 1);
    }
    ctx.strokeStyle = 'rgba(74,151,176,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pic - 1, pic - 1);
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText((entry.kind || '').toUpperCase(), px + 10, py + 16);
    ctx.restore();
  }

  /* Where an entry id sits on the page right now: which tab, which row.
   * Against the live group list, because the FACTIONS tab grows as the
   * player charts and a cached index would quietly rot. */
  function catFindAt(gs, id) {
    for (var g = 0; g < gs.length; g++) {
      var items = gs[g].items;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === id) return { group: g, index: i };
      }
    }
    return null;
  }

  function drawCatalogue(ctx, w, h) {
    var Cat = global.Catalogue;
    var gs = catGroups();
    var st = catState();

    /* The whole screen, because this is a page you read. */
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,9,0.93)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    hot(0, 0, w, h, function () {}, null);

    var m = 16;
    var x0 = m, y0 = m, pw = w - m * 2, ph = h - m * 2;
    panel(ctx, x0, y0, pw, ph, true);

    if (!gs.length) {
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('The catalogue is empty - no tables loaded.', x0 + 20, y0 + 40);
      ctx.restore();
      return;
    }

    /* ---- HEAD ---- */
    ctx.save();
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText('CATALOGUE', x0 + 18, y0 + 26);
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    /* The PAGE's count, not the shop's: since the wiki groups landed
     * (lore.js) the tabs hold factions, port patterns and world types that
     * have no price and are not for sale, and a figure that quietly left
     * them out would understate the page by a third. */
    var total = Cat ? (Cat.pageCount ? Cat.pageCount(G) : Cat.count(G)) : 0;
    var foot = total + ' entries  ·  arrows move  ·  Shift+C or Esc closes';
    ctx.textAlign = 'right';
    ctx.fillText(foot, x0 + pw - 18, y0 + 26);
    ctx.textAlign = 'left';
    ctx.restore();

    /* ---- GROUP TABS ---- */
    var tx = x0 + 18, ty = y0 + 40, tabH = 20, gap = 7;
    ctx.save();
    ctx.font = 'bold 11px ui-monospace, monospace';
    for (var gi = 0; gi < gs.length; gi++) {
      var lbl = gs[gi].label;
      var tw = (ctx.measureText ? ctx.measureText(lbl).width : lbl.length * 7) + 18;
      if (tx + tw > x0 + pw - 18) { tx = x0 + 18; ty += tabH + 5; }
      var on = gi === st.group;
      ctx.fillStyle = on ? 'rgba(127,214,255,0.18)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(tx, ty, tw, tabH);
      ctx.strokeStyle = on ? MFD_HOT : 'rgba(74,151,176,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, tabH - 1);
      ctx.fillStyle = on ? '#b4f0ff' : MFD_DIM;
      ctx.fillText(lbl, tx + 9, ty + 14);
      hot(tx, ty, tw, tabH,
          (function (n) { return function () { var s = catState(); s.group = n; s.sel = 0; s.scroll = 0; }; })(gi),
          'pick');
      tx += tw + gap;
    }
    ctx.restore();
    var bodyY = ty + tabH + 12;

    /* ---- THE TWO COLUMNS ---- */
    var listW = Math.max(220, Math.min(320, Math.round(pw * 0.26)));
    var listX = x0 + 18, listY = bodyY;
    var listH = y0 + ph - 18 - listY;
    var rows = Math.max(1, Math.floor((listH - 24) / CAT_ROW));
    var entry = catClamp(st, gs, rows);
    var group = gs[st.group];

    ctx.save();
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText(group.note.toUpperCase(), listX, listY + 2);
    ctx.restore();

    var ly = listY + 18;
    ctx.save();
    ctx.font = 'bold 11px ui-monospace, monospace';
    var shown = Math.min(rows, group.items.length - st.scroll);
    for (var r = 0; r < shown; r++) {
      var idx = st.scroll + r, e = group.items[idx];
      var ry = ly + r * CAT_ROW;
      if (idx === st.sel) {
        ctx.fillStyle = 'rgba(127,214,255,0.14)';
        ctx.fillRect(listX - 4, ry - 11, listW, CAT_ROW);
      }
      ctx.fillStyle = idx === st.sel ? '#b4f0ff' : MFD_INK;
      ctx.fillText(clipText(e.name, Math.floor((listW - 72) / 6.6)), listX, ry);
      ctx.fillStyle = idx === st.sel ? '#ffe6a8' : MFD_DIM;
      ctx.textAlign = 'right';
      /* A GOVERNMENT HAS NO PRICE, and fmtCredits(undefined) printed "NaN
       * cr" down the whole of the FACTIONS, PORTS and TYPES tabs the first
       * time they were drawn. The right-hand column carries what the thing
       * IS instead, which is the useful fact for an entry you cannot buy. */
      ctx.fillText(typeof e.price !== 'number'
                     ? clipText(e.kind || '', 14)
                     : e.price < 0 ? '(' + fmtCredits(-e.price) + ')' : fmtCredits(e.price),
                   listX + listW - 10, ry);
      ctx.textAlign = 'left';
      hot(listX - 4, ry - 11, listW, CAT_ROW,
          (function (n) { return function () { catState().sel = n; }; })(idx), 'pick');
    }
    /* How much more there is, when the list runs past the window. */
    if (group.items.length > rows) {
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText((st.scroll + 1) + '-' + (st.scroll + shown) + ' of ' + group.items.length,
                   listX, listY + 18 + rows * CAT_ROW + 8);
    }
    ctx.restore();

    /* A rule between the list and the card. */
    var cx0 = listX + listW + 18;
    ctx.save();
    ctx.strokeStyle = 'rgba(74,151,176,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx0 - 10, listY - 6);
    ctx.lineTo(cx0 - 10, y0 + ph - 18);
    ctx.stroke();
    ctx.restore();

    if (!entry) return;

    /* ---- THE CARD: portrait, numbers, copy ---- */
    var cw = x0 + pw - 18 - cx0;
    /* THE ICON IS THE POINT OF THE PAGE, so it takes the room it can get:
     * the first cut capped it at 240 px and left two thirds of a 1080-high
     * window empty under it. Bounded by the card's width and by the height
     * left after the copy, so the prose is never pushed off the foot. */
    var cardH = y0 + ph - 18 - (listY + 16);
    var pic = Math.round(Math.max(140, Math.min(430, cw * 0.42, cardH * 0.62)));
    var px = cx0, py = listY + 16;

    ctx.save();
    ctx.fillStyle = '#030a0f';
    ctx.fillRect(px, py, pic, pic);
    ctx.strokeStyle = 'rgba(74,151,176,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pic - 1, pic - 1);
    ctx.restore();

    var now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    var spin = (now / CAT_TURN) * Math.PI * 2;
    var drew = false;
    /* A PORT TURNS LIKE EVERYTHING ELSE ON THE PAGE. The model is fetched
     * the first time its card is opened and cut down to a card-sized mesh
     * once (Render.portPortraitMesh); until that fetch lands this returns
     * false and the swatch stands in, so the page never waits on a
     * geometry read. */
    if (entry.group === 'ports' && entry.portKey && Render.drawPortPortrait) {
      drew = Render.drawPortPortrait(ctx, px, py, pic, entry.portKey, spin);
      if (!drew) { drawWikiSwatch(ctx, px, py, pic, entry); drew = true; }
    } else if (entry.group === 'ports' || entry.group === 'factions' ||
               entry.group === 'types') {
      drawWikiSwatch(ctx, px, py, pic, entry);
      drew = true;
    } else if (entry.kind === 'hull') {
      drew = Render.drawHullPortrait
        ? Render.drawHullPortrait(ctx, px, py, pic, pic, entry.id, spin) : false;
    } else {
      drew = Render.drawItemPortrait
        ? Render.drawItemPortrait(ctx, px, py, pic, entry.id, spin) : false;
    }
    if (!drew) drawItemStandIn(ctx, px, py, pic, entry.eq || entry, spin);

    /* NAME, price, what it is. */
    var tx2 = px + pic + 18, tw2 = cx0 + cw - tx2;
    ctx.save();
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(clipText(entry.name, Math.floor(tw2 / 9.2)), tx2, py + 16);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    /* NOT EVERYTHING ON THE PAGE HAS A PRICE. A Theocracy, a class M star
     * and a drum station are things to look up, not things to buy, and
     * printing "0 cr" over them would be a small lie in a reference. They
     * get what they actually are instead. */
    var money = typeof entry.price !== 'number'
      ? (entry.kind || '').toUpperCase()
      : entry.price < 0
        ? 'pays ' + fmtCredits(-entry.price) + ' to haul'
        : fmtCredits(entry.price) + (entry.group === 'goods' ? ' / t base' : '');
    var tagBits = [];
    if (entry.grey) tagBits.push('grey market');
    if (entry.contraband) tagBits.push('contraband');
    if (entry.unlisted) tagBits.push('not for sale');
    ctx.fillText(money + (tagBits.length ? '   ·   ' + tagBits.join(' · ') : ''), tx2, py + 36);
    ctx.restore();

    /* THE NUMBERS. Equipment goes through the yard's own itemSpecs so the
     * two pages can never drift; everything else brought its own. */
    var specs = entry.eq ? itemSpecs(entry.eq) : (entry.specs || []);
    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    var sy = py + 60, col2 = Math.min(150, Math.round(tw2 * 0.42));
    for (var si = 0; si < specs.length && sy < py + pic + 4; si++, sy += 15) {
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(specs[si][0], tx2, sy);
      ctx.fillStyle = MFD_INK;
      var val = String(specs[si][1]), room = tw2 - col2 - 4;
      while (val.length > 2 && ctx.measureText && ctx.measureText(val).width > room) val = val.slice(0, -2) + '…';
      ctx.fillText(val, tx2 + col2, sy);
    }
    ctx.restore();

    /* ---- THE LINKS ------------------------------------------------------
     *
     * What makes the page a wiki rather than a list: an entry that mentions
     * another one lets you go there. A faction names its kind and the
     * empire it operates inside; clicking either moves the page to that
     * entry, tab and all.
     *
     * Resolved against the LIVE tab list rather than against a stored
     * index, so a link cannot point at the wrong row when the roster grows
     * behind it - which it does, every time the player charts another
     * system. A target that is not on the page yet is drawn dim and does
     * nothing, because a faction you have not met has no entry to go to. */
    var links = entry.links || [];
    if (links.length) {
      ctx.save();
      ctx.font = 'bold 11px ui-monospace, monospace';
      sy += 8;
      for (var li = 0; li < links.length && sy < py + pic + 4; li++, sy += 17) {
        var lk = links[li];
        var at = catFindAt(gs, lk.id);
        var lw = (ctx.measureText ? ctx.measureText(lk.label).width : lk.label.length * 6.6) + 16;
        ctx.fillStyle = at ? 'rgba(127,214,255,0.10)' : 'rgba(255,255,255,0.03)';
        ctx.fillRect(tx2, sy - 11, lw, 15);
        ctx.fillStyle = at ? '#9fe8ff' : MFD_DIM;
        ctx.fillText(lk.label, tx2 + 8, sy);
        if (at) {
          ctx.strokeStyle = 'rgba(127,214,255,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(tx2 + 8, sy + 2.5);
          ctx.lineTo(tx2 + 8 + lw - 16, sy + 2.5);
          ctx.stroke();
          hot(tx2, sy - 11, lw, 15, (function (t) {
            return function () {
              var st2 = catState();
              st2.group = t.group; st2.sel = t.index;
              st2.scroll = Math.max(0, t.index - 6);
            };
          })(at), 'pick');
        }
      }
      ctx.restore();
    }

    /* THE COPY, full width under both, all of it. */
    var qy = Math.max(py + pic + 24, sy + 10);
    ctx.save();
    ctx.font = 'italic 12px ui-monospace, monospace';
    ctx.fillStyle = '#c9d8e6';
    var prose = entry.prose || '';
    var lines = wrapText(prose ? '“' + prose + '”' : '', Math.floor(cw / 7.2));
    for (var qi = 0; qi < lines.length && qy + qi * 16 < y0 + ph - 26; qi++) {
      ctx.fillText(lines[qi], cx0, qy + qi * 16);
    }
    ctx.restore();

    /* Where you would actually get one, when the game can say. */
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    var where = entry.kind === 'hull' ? 'A shipyard, docked (F5)'
      : entry.group === 'goods' ? 'Any market (F4 while docked)'
      : entry.group === 'modules' ? 'Built at a shipyard, carried by a Crawler'
      : entry.unlisted ? 'Not stocked anywhere, at any price'
      : 'An outfitter, docked (F5)';
    ctx.fillText(where, cx0, y0 + ph - 26);
    ctx.restore();
  }

  /* ---- THE ITEM CARD (2026-11-09) ----------------------------------------
   * A sub-window over the yard: a square portrait of the item turning, its
   * name, price and slot, what it draws and weighs, the numbers that matter
   * for its kind, the yard's whole copy, and a BUY button with the price on
   * it. Click outside it or press Esc to close.
   *
   * THE PORTRAIT is the 3D icon Astra is having made for every purchasable
   * item. Until one exists for an item, Render.drawItemPortrait answers
   * false and a turning wireframe stands in, shaped by the item's kind. */
  var ITEM_TURN = 9;                  // seconds for a full revolution

  function itemSpecs(it) {
    var L = [];
    if (it.kind === 'reactor') L.push(['Power', '+' + it.powerBonus.toFixed(1) + ' MW generated']);
    else if (typeof it.power === 'number') L.push(['Power draw', it.power.toFixed(1) + ' MW']);
    if (typeof it.mass === 'number') L.push(['Mass', it.mass + ' t']);
    if (it.slot) L.push(['Slot', ((Combat.SLOT_LABEL && Combat.SLOT_LABEL[it.slot]) || it.slot).toLowerCase() + (it.size ? ' · class ' + it.size : '')]);
    if (typeof it.dmg === 'number') L.push(['Damage', it.dmg + ' per hit' + (it.variety ? ' · ' + it.variety : '')]);
    if (typeof it.range === 'number') L.push(['Range', it.range + ' km']);
    if (typeof it.cooldown === 'number') L.push(['Cycle', it.cooldown + ' s' + (it.dmg && it.cooldown ? ' · ' + (it.dmg / it.cooldown).toFixed(1) + ' dmg/s' : '')]);
    if (typeof it.heat === 'number') L.push(['Heat', it.heat + '/s firing']);
    if (typeof it.cap === 'number') L.push(['Capacity', String(it.cap)]);
    if (typeof it.regen === 'number') L.push(['Regeneration', it.regen + ' /s']);
    if (it.misfire) L.push(['Misfire', Math.round(it.misfire * 100) + '% of shots']);
    /* A slipspace drive core (2026-11-09): what the class buys in reach,
     * what it takes off the corridor, and the milfuel tank it brings. */
    var Sl = global.Slipspace;
    if (Sl && (it.slipKind === 'slipdrive' || it.slipKind === 'mildrive')) {
      L.push(['Reach', '×' + (Sl.RANGE_BY_CLASS[it.slipClass] || 1).toFixed(2) + ' a tank']);
      L.push(['Transit', it.slipKind === 'mildrive' ? 'half the corridor' : 'the corridor\'s own']);
      L.push(['Covers hulls', 'to ' + (it.slipClass === 'IV' ? 'any size' : Sl.hullClassById(it.slipClass).maxTonnes + ' t')]);
      /* Which frames leave the yard with this one (combat.js THE SLIPSPACE BAY). */
      if (it.slipKind === 'slipdrive' && Combat.STOCK_CORE) {
        var std = Object.keys(Combat.STOCK_CORE).filter(function (z) { return Combat.STOCK_CORE[z] === it.slipClass; });
        if (std.length) L.push(['Standard on', std.join(', ') + ' hulls']);
      }
      if (Combat.drivePreview && G.ship) {
        var cp = Combat.drivePreview(G, it.id);
        if (cp && cp.ok && cp.replaces) L.push(['Trade-in', cp.replaces.name + ' (' + cp.tradeIn + ' cr) · ' + cp.net + ' cr net']);
        else if (cp && !cp.ok) L.push(['Fitted', 'in her slipspace bay now']);
      }
    }
    if (Sl && (it.slipKind === 'mildrive' || it.mil) && G.ship) {
      L.push(['Milfuel tank', Math.round((G.ship.fuelCap || 0) * Sl.MILFUEL_TANK_SHARE * 10) / 10 + ' t on this hull']);
    }
    if (it.kind === 'cruisedrive' && Combat.drivePreview) {
      var dp = Combat.drivePreview(G, it.id);
      if (dp && dp.ok) {
        var fc = function (c) { return c >= 100 ? Math.round(c) + 'c' : c.toFixed(1) + 'c'; };
        L.push(['Top speed', fc(dp.nowC) + ' → ' + fc(dp.topC)]);
        if (dp.replaces) L.push(['Trade-in', dp.replaces.name + ' (' + dp.tradeIn + ' cr) · ' + dp.net + ' cr net']);
      }
    }
    return L;
  }

  /* A turning stand-in, until the item's own model arrives: a box for
   * modules, a barrel for guns, a dome for shields, a coil for drives. */
  function drawItemStandIn(ctx, x, y, size, it, spin) {
    var cx = x + size / 2, cy = y + size / 2, R = size * 0.32;
    var cs = Math.cos(spin), sn = Math.sin(spin), tilt = 0.45, ct = Math.cos(tilt), st = Math.sin(tilt);
    function P(px, py, pz) {
      var rx = px * cs - pz * sn, rz = px * sn + pz * cs;
      var ry = py * ct - rz * st;
      return [cx + rx * R, cy - ry * R];
    }
    function line(a, b) { var p = P(a[0], a[1], a[2]), q = P(b[0], b[1], b[2]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
    ctx.save();
    ctx.strokeStyle = 'rgba(127,214,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    var k = it.kind || '', i, N = 12;
    if (k === 'gun' || k === 'turret') {
      for (i = 0; i < N; i++) {
        var a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, r0 = 0.28;
        line([Math.cos(a0) * r0, Math.sin(a0) * r0, -1], [Math.cos(a1) * r0, Math.sin(a1) * r0, -1]);
        line([Math.cos(a0) * r0, Math.sin(a0) * r0, 1], [Math.cos(a1) * r0, Math.sin(a1) * r0, 1]);
        if (i % 3 === 0) line([Math.cos(a0) * r0, Math.sin(a0) * r0, -1], [Math.cos(a0) * r0, Math.sin(a0) * r0, 1]);
      }
      line([-0.55, -0.45, -1], [0.55, -0.45, -1]); line([0.55, -0.45, -1], [0.55, -0.45, -0.3]);
      line([0.55, -0.45, -0.3], [-0.55, -0.45, -0.3]); line([-0.55, -0.45, -0.3], [-0.55, -0.45, -1]);
    } else if (k === 'shield' || k === 'shroud' || k === 'ecm') {
      for (i = 0; i < N; i++) {
        var b0 = i / N * Math.PI * 2, b1 = (i + 1) / N * Math.PI * 2;
        line([Math.cos(b0), -0.4, Math.sin(b0)], [Math.cos(b1), -0.4, Math.sin(b1)]);
        line([Math.cos(b0) * 0.7, 0.35, Math.sin(b0) * 0.7], [Math.cos(b1) * 0.7, 0.35, Math.sin(b1) * 0.7]);
        if (i % 2 === 0) { line([Math.cos(b0), -0.4, Math.sin(b0)], [Math.cos(b0) * 0.7, 0.35, Math.sin(b0) * 0.7]);
                           line([Math.cos(b0) * 0.7, 0.35, Math.sin(b0) * 0.7], [0, 0.8, 0]); }
      }
    } else if (/drive|slip/.test(k)) {
      for (i = 0; i < 36; i++) {
        var c0 = i / 36 * Math.PI * 8, c1 = (i + 1) / 36 * Math.PI * 8;
        line([Math.cos(c0) * 0.6, -1 + i / 18, Math.sin(c0) * 0.6], [Math.cos(c1) * 0.6, -1 + (i + 1) / 18, Math.sin(c1) * 0.6]);
      }
      line([0, -1.1, 0], [0, 1.1, 0]);
    } else {
      var v = [[-1, -0.7, -0.8], [1, -0.7, -0.8], [1, 0.7, -0.8], [-1, 0.7, -0.8], [-1, -0.7, 0.8], [1, -0.7, 0.8], [1, 0.7, 0.8], [-1, 0.7, 0.8]];
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(function (e) { line(v[e[0]], v[e[1]]); });
      line([-0.6, 0.7, -0.4], [0.6, 0.7, -0.4]); line([-0.6, 0.7, 0], [0.6, 0.7, 0]); line([-0.6, 0.7, 0.4], [0.6, 0.7, 0.4]);
    }
    ctx.stroke();
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(127,214,255,0.45)';
    ctx.textAlign = 'center';
    ctx.fillText('ICON TO COME', cx, y + size - 8);
    ctx.restore();
  }

  function drawItemCard(ctx, x, y, w, h, port) {
    var it = Combat.EQUIPMENT[G.yardItem];
    if (!it) { G.yardItem = null; return; }
    var s = G.ship;
    /* The card is a window of its own, so it is centred on the SCREEN and
     * may spill over the cargo and equipment panels: inside the yard's
     * column alone, on a laptop-width window, every number on it was cut
     * short ("12 per h…"). So the whole screen behind it is dimmed, down to
     * the yard's foot, and a click anywhere on that closes the card rather
     * than reaching whatever is underneath. */
    var sw = global.innerWidth || (x + w);
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,9,0.72)';
    ctx.fillRect(0, 0, sw, y + h);
    ctx.restore();
    hot(0, 0, sw, y + h, function () { G.yardItem = null; }, 'close');

    var cw = Math.min(640, sw - 32), ch = Math.min(340, h - 24);
    var cx = Math.round(Math.max(16, Math.min(sw - 16 - cw, x + (w - cw) / 2)));
    var cy = Math.round(y + (h - ch) / 2);
    ctx.save();
    ctx.fillStyle = '#06121a';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2);
    ctx.restore();
    /* The card itself swallows clicks, so a click on its prose does not
     * close it; its buttons are registered after and win. */
    hot(cx, cy, cw, ch, function () {}, null);

    /* THE PORTRAIT, square, turning. */
    var pic = Math.min(ch - 70, Math.round(cw * 0.36));
    var px = cx + 14, py = cy + 14;
    ctx.save();
    ctx.fillStyle = '#030a0f';
    ctx.fillRect(px, py, pic, pic);
    ctx.strokeStyle = 'rgba(74,151,176,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pic - 1, pic - 1);
    ctx.restore();
    var now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    var spin = (now / ITEM_TURN) * Math.PI * 2;
    var drew = Render.drawItemPortrait ? Render.drawItemPortrait(ctx, px, py, pic, it.id, spin) : false;
    if (!drew) drawItemStandIn(ctx, px, py, pic, it, spin);

    /* NAME, price, the specs as a table, then the copy. */
    var tx = px + pic + 16, tw = cx + cw - 14 - tx;
    ctx.save();
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(clipText(it.name, Math.floor(tw / 8.5)), tx, cy + 30);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText(fmtCredits(it.price) + (it.grey ? '  ·  grey market' : ''), tx, cy + 48);
    var specs = itemSpecs(it), ly = cy + 70;
    ctx.font = '11px ui-monospace, monospace';
    for (var i = 0; i < specs.length && ly < cy + ch - 120; i++, ly += 15) {
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(specs[i][0], tx, ly);
      ctx.fillStyle = MFD_INK;
      /* Measured, not counted: the values mix digits, dots and arrows. */
      var val = specs[i][1], room = tw - 100;
      while (val.length > 2 && ctx.measureText && ctx.measureText(val).width > room) val = val.slice(0, -2) + '…';
      ctx.fillText(val, tx + 100, ly);
    }
    ctx.restore();

    /* The copy, all of it, under the portrait and the table, full width. */
    var prose = [it.pitch, it.blurb && it.blurb !== it.pitch ? it.blurb : null].filter(Boolean).join('  ');
    var qy = Math.max(py + pic + 18, ly + 8);
    ctx.save();
    ctx.font = 'italic 11px ui-monospace, monospace';
    ctx.fillStyle = '#c9d8e6';
    var lines = wrapText(prose ? '“' + prose + '”' : '', Math.floor((cw - 28) / 6.6));
    for (var li = 0; li < lines.length && qy + li * 14 < cy + ch - 40; li++) ctx.fillText(lines[li], cx + 14, qy + li * 14);
    ctx.restore();

    /* WHETHER IT CAN BE BOUGHT, and why not, beside the button. */
    var fitCheck = Combat.canFit(s, it.id), afford = s.credits >= it.price, why = null;
    var dp = it.kind === 'cruisedrive' && Combat.drivePreview ? Combat.drivePreview(G, it.id) : null;
    if (dp) { fitCheck = dp.ok ? { ok: true } : { ok: false, why: dp.why }; afford = s.credits >= (dp.ok ? dp.net : it.price); }
    var yardWhy = Combat.yardRefusal ? Combat.yardRefusal(G) : null;
    var lienWhy = Combat.lienRefusal ? Combat.lienRefusal(G) : null;
    if (lienWhy) why = 'not while the lien stands';
    else if (yardWhy) why = yardWhy;
    else if (!fitCheck.ok) why = fitCheck.why;
    else if (!afford) why = 'short ' + ((dp && dp.ok ? dp.net : it.price) - s.credits) + ' cr';
    var by = cy + ch - 32;
    btn(ctx, cx + 14, by, 190, 22, 'BUY  —  ' + fmtCredits(dp && dp.ok ? dp.net : it.price),
        function () {
          var r = Combat.buyEquipment(G, it.id);
          say(r.ok ? it.name + ' fitted' : 'No: ' + r.why, 5);
          if (r.ok) G.yardItem = null;
        }, { disabled: !!why, hot: !why, font: 11 });
    if (why) {
      ctx.save();
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = '#ffb86b';
      ctx.fillText(clipText(why, Math.floor((cw - 330) / 6.6)), cx + 214, by + 15);
      ctx.restore();
    }
    btn(ctx, cx + cw - 104, by, 90, 22, 'CLOSE  Esc', function () { G.yardItem = null; }, { font: 10 });
  }

  /* --- HULLS -------------------------------------------------------------- */
  /* ---- the showroom ------------------------------------------------------
   * Astra: "when buying ships, the selected ship model should be displayed
   * and it should rotate. Next to the image, a paragraph about the ship,
   * who makes it and what it's ideal for."
   *
   * So the hull list stops being a list of prices and becomes a list you
   * BROWSE: the first click selects and shows you the ship, the second
   * buys it. That two-step is the point rather than an inconvenience —
   * every other row in this yard is a purchase you can make by accident,
   * and a hull is the one thing in the game that costs more than
   * everything else you own put together.
   *
   * The card is drawn by drawYard, which owns the panel's geometry; this
   * only says how much room to keep for it. */
  var HULL_CARD_H = 132;

  function drawYardHulls(ctx, x, w, row, s, port) {
    /* WHAT IS ACTUALLY ON THE FLOOR, which is not the catalogue. Every port
     * sells ships — a surface pad is where most pilots buy their first —
     * but a large hull is built in orbit and never lands, so a pad or an
     * underground bay carries S and M only, and the medium classes are
     * likelier the more developed the dock. See Combat.hullsAt. */
    var yard = Combat.isShipyard && Combat.isShipyard(port);
    /* TWO COUNTERS AT A SHIPYARD (2026-10-19): the floor, where a hull is
     * sold as she stands and you fly her out today, and the slips, where
     * one is built to your sheet and handed over days from now. The same
     * large hull can be on both, so the card is told which you picked —
     * G.yardBuild — rather than guessing from the hull. */
    var order = Combat.hullsAt(port, G.t).filter(function (id) { return id !== s.hullId; });
    var built = yard ? Combat.orderList(G, port) : [];
    var buildable = built.filter(function (e) { return !e.why; }).map(function (e) { return e.id; });
    if (!order.length && !built.length) {
      row('NO HULLS ON THE FLOOR TODAY',
          Combat.landsLarge(port)
            ? 'a better developed dock carries the larger classes'
            : 'nothing above medium ever lands here',
          function () {}, true);
      return 0;
    }
    if (!yard) G.yardBuild = false;
    var pickList = G.yardBuild ? buildable : order;
    if (pickList.indexOf(G.yardHull) < 0) {
      if (order.length) { G.yardBuild = false; G.yardHull = order[0]; }
      else { G.yardBuild = !!buildable.length; G.yardHull = buildable[0] || null; }
    }
    if (order.length) {
      row(yard ? 'ON THE FLOOR  ·  fly her out today' : 'ON THE FLOOR  ·  large hulls sold as they sit',
          yard ? 'as she stands; a large hull keeps the yard\'s own fit'
               : 'only a shipyard builds a large hull to order, or refits one',
          function () {}, true);
    }
    for (var i = 0; i < order.length; i++) {
      var hull = Combat.HULLS[order[i]];
      var deal = hullDeal(hull.id, false, false);
      var sub = hull.cargoCap + 't hold · ' + hull.hullMax + ' hull · ' + hull.blurb;
      /* A large hull off a floor comes with the dock's own fit, and says so. */
      var comes = (deal.stock && deal.stock.items) || deal.outfit || [];
      if (comes.length || deal.stock) {
        sub = (comes.length
               ? 'comes with: ' + comes.map(function (id) {
                   return (Combat.EQUIPMENT[id] || {}).name || id;
                 }).join(', ')
               : 'as she sits: bare') + ' · ' + hull.cargoCap + 't hold';
      }
      row(hull.name.toUpperCase() + '  [' + (hull.size || 'M') + ']  —  ' + deal.cost + ' cr',
          sub,
          (function (hid) { return function () { G.yardHull = hid; G.yardBuild = false; }; })(hull.id),
          false, { hot: !G.yardBuild && G.yardHull === hull.id });
    }

    /* ---- BUILT TO ORDER (2026-10-19) -------------------------------------
     * Astra: "only at shipyards can you get a customized L size ship."
     * Every L and XL hull, the navy's own included — a locked warship is
     * drawn with the standing it needs, because that reads as a goal. */
    if (built.length) {
      row('BUILT TO ORDER AT ' + (port.name || 'this yard').toUpperCase(),
          'paid now, built to your sheet, handed over here — fly what you have meanwhile',
          function () {}, true);
      for (var b = 0; b < built.length; b++) {
        (function (e) {
          var bh = Combat.HULLS[e.id];
          var days = Combat.buildDays ? Combat.buildDays(e.id) : 0;
          row(bh.name.toUpperCase() + '  [' + bh.size + ']' +
              (e.why ? '  —  LOCKED' : '  —  from ' + bh.price + ' cr  ·  ' + days + ' days on the slip'),
              e.why || (bh.cargoCap + 't hold · ' + bh.hullMax + ' hull · ' + bh.blurb),
              function () { G.yardHull = e.id; G.yardBuild = true; }, !!e.why,
              { hot: G.yardBuild && G.yardHull === e.id });
        })(built[b]);
      }
    }

    /* ON THE SLIPS: what you have already ordered here, and when. */
    var slips = (Combat.orders ? Combat.orders(G) : []).filter(function (o) {
      return o.port === port.id && (!o.star || !G.here || o.star === G.here.id);
    });
    slips.forEach(function (o) {
      var oh = Combat.HULLS[o.hullId] || {};
      row('ON THE SLIP  ·  ' + (o.name || oh.name || o.hullId).toUpperCase(),
          (oh.name || o.hullId) + '  ·  ready in ' + fmtLogAge(Combat.orderEta(o, G.t)) +
          '  ·  paid ' + o.paid + ' cr',
          function () {}, true);
    });

    /* THE ORDER SHEET, for the hull on the card when it is being built. */
    if (yard && G.yardBuild && G.yardHull) drawOrderSheet(row, s, port, G.yardHull);
    return HULL_CARD_H;
  }

  /* ---- the order sheet ---------------------------------------------------
   * One draft at a time, kept on G so it survives a frame and is dropped
   * when the hull on the card changes. A slot row cycles ▶ through: empty,
   * then everything on this yard's shelf that suits it (your own gear stays
   * on the ship you keep flying while she is built). Colours cycle the same
   * way. Nothing is spent until COMMISSION on the card, and the totals row
   * is the yard's own quote, refusal and all. */
  function orderFor(hullId) {
    var o = G.yardOrder;
    if (o && o.hullId === hullId) return o;
    var to = Combat.HULLS[hullId];
    /* She is built new and you keep flying the ship you are in, so the
     * sheet starts empty — nothing of yours moves across to a hull that
     * will not exist for days. */
    G.yardOrder = {
      hullId: hullId,
      fit: Combat.defaultOrderFit(G.ship, to, true),
      name: '', paint: { p: 'yard', t: 'yard' }
    };
    return G.yardOrder;
  }

  function paintOf(o) {
    if (!o || !o.paint) return null;
    var P = Combat.PAINT_BY_ID || {};
    var p = P[o.paint.p], t = P[o.paint.t];
    var hp = p && p.hex, ht = t && t.hex;
    return (hp || ht) ? { p: hp || null, t: ht || null } : null;
  }

  function slotOptions(s, port, key, o) {
    var type = Combat.slotType(key);
    var opts = [null];
    Combat.stockAt(G, port).forEach(function (e) {
      var it = e.item;
      if (!e.available || it.slot !== type || it.kind === 'missile' || it.kind === 'sink') return;
      opts.push(it.id);
    });
    return opts;
  }

  function optionName(s, pick) {
    if (!pick) return 'empty';
    if (String(pick).indexOf('own:') === 0) {
      var id = (s.fit || {})[pick.slice(4)];
      return ((Combat.EQUIPMENT[id] || {}).name || id) + ' (yours)';
    }
    var it = Combat.EQUIPMENT[pick];
    return it ? it.name + ' (' + it.price + ' cr)' : pick;
  }

  function drawOrderSheet(row, s, port, hullId) {
    var o = orderFor(hullId);
    var probe = { hullId: hullId, fit: {} };
    var keys = Combat.slotKeys(probe);
    row('ORDER SHEET  ·  ' + Combat.HULLS[hullId].name.toUpperCase(),
        'click a line to change it ▶', function () {}, true);
    keys.forEach(function (key) {
      var type = Combat.slotType(key);
      var label = (Combat.SLOT_LABEL[type] || type).toUpperCase() + ' ' +
                  (parseInt(key.replace(/\D+/g, ''), 10) + 1);
      /* An empty slipspace bay on the sheet is her standard drive, which
       * the yard fits whatever else is ordered (THE SLIPSPACE BAY). */
      var shownName = (type === 'core' && !o.fit[key] && Combat.stockCore)
        ? (Combat.EQUIPMENT[Combat.stockCore(hullId)] || {}).name + ' (standard)'
        : optionName(s, o.fit[key]);
      row('  ' + label + ':  ' + shownName + '  ▶', null, function () {
        var list = slotOptions(s, port, key, o);
        var at = list.indexOf(o.fit[key] || null);
        var next = list[(at + 1) % list.length];
        if (next) o.fit[key] = next; else delete o.fit[key];
      });
    });
    row('  NAME:  ' + (o.name || '(as the yard numbers her)'), 'click to name her', function () {
      beginEdit({ label: 'HER NAME', value: o.name || '', max: 24,
        allow: function (c) { return /[A-Za-z0-9 .'\-]/.test(c) ? c : ''; },
        commit: function (v) { o.name = v || ''; } });
    });
    var P = Combat.PAINTS || [];
    function cyclePaint(which) {
      var ids = P.map(function (p) { return p.id; });
      var at = ids.indexOf(o.paint[which]);
      o.paint[which] = ids[(at + 1) % ids.length];
    }
    var pn = (Combat.PAINT_BY_ID[o.paint.p] || {}).name || 'yard grey';
    var tn = (Combat.PAINT_BY_ID[o.paint.t] || {}).name || 'yard grey';
    row('  HULL COLOUR:  ' + pn + '  ▶', null, function () { cyclePaint('p'); });
    row('  TRIM:  ' + tn + '  ▶', null, function () { cyclePaint('t'); });
    /* WHOSE COLOURS (2026-10-24): a Crawler can be built in a navy's or
     * the Syndicate's livery, at their own yard, to a captain they trust.
     * The line shows why not when the yard would refuse it. */
    if (Combat.LIVERY_HULLS && Combat.LIVERY_HULLS[hullId]) {
      var LV = ['civ', 'navy', 'syn'];
      var lw = Combat.liveryRefusal(G, port, o.livery || 'civ');
      row('  LIVERY:  ' + (Combat.LIVERY_NAMES[o.livery || 'civ'] || 'civilian') + '  ▶',
          lw || 'whose colours she flies, outside and in', function () {
            o.livery = LV[(LV.indexOf(o.livery || 'civ') + 1) % LV.length];
          }, false, { hot: !!lw });
    }
    var q = Combat.quoteCommission(G, hullId, { fit: o.fit, livery: o.livery });
    var sum = q.summary || {};
    row('  ' + (q.ok ? 'QUOTE' : 'CANNOT BUILD') + ':  hull ' + (q.hull || 0) + ' + fittings ' + (q.gear || 0) +
        ' = ' + (q.cost || 0) + ' cr  ·  ready in ' + (q.days || 0) + ' days',
        (q.ok ? '' : q.why + '  ·  ') + 'power ' + (sum.powerUsed || 0).toFixed(1) + ' / ' +
        (sum.powerCap || 0).toFixed(1) + ' MW · fit ' + (sum.massUsed || 0).toFixed(1) + ' / ' +
        (sum.massCap || 0) + ' t',
        function () {}, true, { hot: !q.ok });
  }

  /* What the card's two buttons will cost, by the same arithmetic buyHull
   * runs. A large hull is a quote (shipyard) or a floor package (elsewhere);
   * anything else is the old sticker-minus-trade-in. */
  function hullDeal(hullId, keep, build) {
    var s = G.ship, hull = Combat.HULLS[hullId];
    var here = Combat.HULLS[(s && s.hullId) || 'talon'];
    var port = s && s.docked && G.sys ? G.sys.byId[s.docked] : null;
    if (build === undefined) build = !!G.yardBuild;
    /* Built to order: any size since 2026-10-20 (every hull has a build
     * price), bare unless the sheet says otherwise. */
    if (hull && port && build && Combat.isShipyard(port)) {
      var o = orderFor(hullId);
      var q = Combat.quoteCommission(G, hullId, { fit: o.fit, livery: o.livery });
      return { cost: q.cost || 0, ok: q.ok, why: q.why, fit: q.fit, order: o, days: q.days };
    }
    if (hull && Combat.bigHull && Combat.bigHull(hullId) && port) {
      var sf = Combat.stockFit(G, port, hullId, G.t);
      var credit = keep ? 0 : Math.round(here.price * Combat.TRADE_IN) + gearCredit(s);
      return { cost: hull.price + sf.gear - credit, ok: true, stock: sf };
    }
    /* Off the floor, outfitted: buyHull's own sum, outfit included. */
    if (hull && Combat.floorQuote) {
      /* A trade the fit cannot survive (a gun on a hull with no hardpoint)
       * is still offered, as it always was: the click says why, in buyHull's
       * own words, rather than the button going dark with no reason. */
      var fq = Combat.floorQuote(G, hullId, keep);
      return { cost: fq.cost, ok: true, outfit: fq.outfit || [] };
    }
    return { cost: keep ? hull.price : hull.price - Math.round((here ? here.price : 0) * Combat.TRADE_IN), ok: true };
  }

  function gearCredit(s) {
    var v = 0;
    Combat.fittedList(s).forEach(function (f) {
      v += Math.round((f.item.price || 0) * Combat.TRADE_IN);
    });
    return v;
  }

  /* THE BUY BUTTON IS ITS OWN BUTTON. Astra: "Have a separate Buy button."
   * The first version made the selected ROW read BUY, which meant the
   * click that chose a ship and the click that spent a hundred thousand
   * credits were the same gesture in the same place — the exact shape of
   * mistake the two-step was supposed to prevent. It lives on the card
   * beside the ship instead, where you are looking at the thing you are
   * about to buy. */
  function buyTheSelectedHull(keep) {
    var hull = Combat.HULLS[G.yardHull];
    if (!hull) return;
    var r = Combat.buyHull(G, hull.id, keep, { look: G.yardLook | 0 });
    if (!r.ok) { say('No deal: ' + r.why, 5); return; }
    if (r.mode === 'stock') {
      say('She is yours as she sits — only a shipyard will change her fittings.', 7);
    }
    if (r.parked) {
      say('The ' + r.parked.name + ' stays on the clamp — she is still yours. ' +
          'F5, FLEET.', 8);
    }
    /* Name the standard gear the hull came with, when it is gear the pilot
     * did not already have. A scoop that silently appears is
     * indistinguishable from a bug, and a scoop that silently does NOT
     * appear is the bug that took piracy out for everyone who had ever
     * died. */
    var extra = (r.standard || []).map(function (id) {
      return (Combat.EQUIPMENT[id] || {}).name || id;
    });
    say('Welcome aboard your ' + hull.name +
        (extra.length ? ' \u2014 fitted as standard: ' + extra.join(', ') : ''), 5);

    /* AND SAY IT NOW, not when the shooting starts. A hull this size wants
     * hands on the turret, and a pilot who trades up and discovers in a
     * fight that their gun has gone quiet has been ambushed by a rule
     * rather than taught one. */
    if (Crew) {
      var man = Crew.turretCrewing(G.ship);
      if (man.turret && man.mode === 'unmanned') {
        say('She is too big to fly and shoot at once — the turret needs a gunner, ' +
            'or a good engineer to slave it. CREW.', 9);
      }
    }
  }

  /* COMMISSION: the sheet goes with the money, and she goes on the slip. */
  function commissionTheSelectedHull() {
    var hull = Combat.HULLS[G.yardHull];
    if (!hull || !G.yardOrder || G.yardOrder.hullId !== hull.id) return;
    var o = G.yardOrder;
    var r = Combat.commission(G, hull.id, { fit: o.fit, name: o.name || null, paint: paintOf(o),
                                                  livery: o.livery || null, look: G.yardLook | 0 });
    if (!r.ok) { say('No deal: ' + r.why, 5); return; }
    G.yardOrder = null;
    say('Signed. The ' + (r.order.name || hull.name) + ' goes on the slip — ready here in ' +
        r.days + ' days. The yard will call when she is out; take command of her on FLEET.', 9);
  }

  /* The ship itself, turning, with what the spec sheet cannot say beside
   * it. Wall clock rather than sim time: a showroom model turns while the
   * game is paused, because it is a display and not a simulation. */
  var SHOWROOM_TURN = 14;            // seconds for a full revolution

  function drawHullCard(ctx, x, y, w, h) {
    var hull = Combat.HULLS[G.yardHull];
    if (!hull) return;
    ctx.save();
    ctx.fillStyle = 'rgba(6,16,22,0.92)';
    ctx.fillRect(x + 10, y, w - 20, h - 4);
    ctx.strokeStyle = 'rgba(74,151,176,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 10.5, y + 0.5, w - 21, h - 5);
    ctx.restore();

    var picW = Math.min(190, Math.max(110, Math.round(w * 0.34)));
    var now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    var spin = (now / SHOWROOM_TURN) * Math.PI * 2;
    /* In the colours on the order sheet, when there is one for her. */
    var sheet = G.yardBuild && G.yardOrder && G.yardOrder.hullId === hull.id ? paintOf(G.yardOrder) : null;
    var drew = Render.drawHullPortrait
      ? Render.drawHullPortrait(ctx, x + 14, y + 4, picW, h - 12, hull.id, spin, null, sheet)
      : false;
    if (!drew) {
      ctx.save();
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('no model', x + 22, y + h / 2);
      ctx.restore();
    }

    var tx = x + 14 + picW + 12;
    var tw = (x + w - 14) - tx;
    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(clipText(hull.name, Math.floor(tw / 7.7)), tx, y + 16);
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText(clipText(hull.maker || '', Math.floor(tw / 6.6)), tx, y + 29);
    /* BUILD, BUY AND HANDS (2026-10-20). Astra: every hull gets "a cost to
     * build, to buy and what the default outfitting is", and "the number
     * of crew required to operate each one without the player flying it".
     * The outfit itself is named on the floor row; this is the one line
     * that holds the three numbers side by side. */
    var hands = Crew && Crew.crewNeeded ? Crew.crewNeeded(hull.id) : null;
    ctx.fillStyle = '#9fc7d2';
    ctx.fillText(clipText('build ' + hull.price + ' cr  ·  buy ' + (Combat.buyPrice ? Combat.buyPrice(hull.id) : hull.price) +
                          ' cr outfitted' + (hands ? '  ·  crew ' + hands.total + ' (' + (hands.total - hands.pilot) +
                          ' with you flying)' : ''), Math.floor(tw / 6.6)), tx, y + 42);

    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = MFD_INK;
    var lines = wrapText(hull.about || hull.blurb || '', Math.floor(tw / 6.2));
    /* The prose stops short of the buy button rather than running under it.
     * A sentence with a button sitting on its last line reads as a rendering
     * fault, and this is the one panel where the player is about to spend
     * everything they have. */
    for (var li = 0; li < lines.length && y + 57 + li * 12 < y + h - 76; li++) {
      ctx.fillText(lines[li], tx, y + 57 + li * 12);
    }
    ctx.restore();

    /* THE BUY BUTTON, on the card, beside the ship. Its label carries the
     * number, because "BUY" on its own is how you find out what a hull cost
     * by looking at your credits afterwards. Trade-in is already in it — the
     * same arithmetic buyHull does, said out loud. */
    /* The SAME arithmetic buyHull runs — a large hull's price is a quote
     * from the order sheet at a shipyard, or her floor package elsewhere. */
    var dealT = hullDeal(hull.id, false), dealK = hullDeal(hull.id, true);
    var cost = dealT.cost;
    var full = dealK.cost;
    var creds = G.ship.credits || 0;
    var short = creds < cost || !dealT.ok;
    var built = !!dealT.order;
    /* TWO WAYS TO LEAVE WITH HER, and they are a different transaction
     * rather than a different price. Trading in is what the yard has
     * always done: the old hull goes, its gear comes across, and the
     * difference is what you pay. Keeping her is the sticker price, the
     * new hull leaves with standard kit only, and the old one stays on
     * the clamp as yours — which is the only way anybody has ever come to
     * own two ships, and therefore the only way there is ever anything to
     * give an order to. */
    var bw = Math.min(176, (tw - 10) / 2), by = y + h - 28;
    var docked = !!(G.ship && G.ship.docked);
    var shortKeep = creds < full || !dealK.ok;
    /* WHICH COCKPIT (2026-11-21): each hull has three fits, the HUD's
     * colour and layout and the window frame round it (Render.HULL_LOOKS).
     * Chosen here, free; a shipyard can refit it later. */
    var looks = Render.HULL_LOOKS && Render.HULL_LOOKS[hull.id];
    if (looks) {
      if (G.yardLookHull !== hull.id) { G.yardLookHull = hull.id; G.yardLook = 0; }
      var cw = Math.floor((Math.min(tw, bw * 2 + 10) - 2 * 6) / 3), cy = by - 44;
      looks.forEach(function (lk, li) {
        btn(ctx, tx + li * (cw + 6), cy, cw, 18, 'COCKPIT ' + 'ABC'[li],
            function () { G.yardLook = li; },
            { font: 10, hot: (G.yardLook | 0) === li });
      });
      ctx.save();
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(190,215,235,0.75)';
      ctx.fillText(clipText(Render.lookSummary(looks[G.yardLook | 0], hull.id, G.yardLook | 0), Math.floor(tw / 6.2)), tx, cy - 5);
      ctx.restore();
    }
    if (built) {
      /* BUILT TO ORDER IS ONE BUTTON: you pay, she goes on the slip, and
       * you fly on in the ship you are in. Trading that one in, or keeping
       * her, is a choice made at the hand-over on FLEET. */
      btn(ctx, tx, by, Math.min(tw, bw * 2 + 10), 20,
          'COMMISSION — ' + cost + ' cr  ·  READY IN ' + (dealT.days || 0) + ' DAYS',
          function () { commissionTheSelectedHull(); },
          { font: 10, disabled: short, hot: !short });
    } else {
      btn(ctx, tx, by, bw, 20,
          'TRADE IN  —  ' + (cost >= 0 ? cost + ' cr' : '+' + (-cost) + ' cr'),
          function () { buyTheSelectedHull(false); },
          { font: 11, disabled: short, hot: !short });
      btn(ctx, tx + bw + 10, by, bw, 20, 'KEEP HER  —  ' + full + ' cr',
          function () { buyTheSelectedHull(true); },
          { font: 11, disabled: shortKeep || !docked, hot: !shortKeep && docked });
    }

    ctx.save();
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = '#ffb86b';
    if (!dealT.ok && dealT.why && !/^need /.test(dealT.why)) {
      ctx.fillText(clipText(dealT.why, Math.floor(tw / 6.2)), tx, by - 6);
    } else if (short) {
      ctx.fillText('short ' + (cost - creds) + ' cr', tx, by - 6);
    } else if (!docked) {
      ctx.fillText('dock to keep a second ship', tx + bw + 10, by - 6);
    } else if (shortKeep) {
      ctx.fillText('keeping her costs the full price', tx + bw + 10, by - 6);
    }
    ctx.restore();
  }

  /* Everything bolted to the hull. Read off the ship rather than a list, so
   * a hull with a bigger tank or an extra scanner shows it without anyone
   * having to remember to update a table. */
  function fittedEquipment() {
    var s = G.ship;
    var hull = Combat.HULLS[s.hullId || 'talon'];
    var sum = Combat.fitSummary(s);
    var out = [
      { name: 'Pilot', value: G.pilotName || 'unnamed' },
      { name: 'Ship', value: s.shipName || (hull ? hull.name : '—') },
      { name: 'Registration', value: s.reg || '—' },
      { name: 'Hull', value: hull ? hull.name : '—' },
      { name: 'Reactor', value: sum.powerUsed.toFixed(1) + ' / ' + sum.powerCap.toFixed(1) + ' MW' },
      { name: 'Fit tonnage', value: sum.massUsed.toFixed(1) + ' / ' + sum.massCap + ' t' },
      { name: 'Torch drive', value: s.thrustKN + ' kN' },
      { name: 'Reaction mass tank', value: s.thrusterCap + ' t' },
      { name: 'Slipspace drive', value: fmtLy(Galaxy.maxRange(s)) + ' laden' },
      { name: 'Jump fuel tank', value: s.fuelCap + ' t' },
      { name: 'Cargo hold', value: s.cargoCap + ' t' +
          (Combat.seatsOf(s) > 0 ? '  (hab units took the rest)' : '') },
      { name: 'Scanner', value: fmtDist(RADAR_RANGE) },
      { name: 'Autopilot', value: 'dock / cruise' }
    ];

    /* Only when there are any. A hull with no habitation unit has no berths
     * in the same sense it has no guns — the row would be a zero telling
     * you nothing. */
    if (Combat.seatsOf(s) > 0) {
      out.push({ name: 'Berths', value: Combat.passengersAboard(s) + ' / ' +
                                        Combat.seatsOf(s) + ' aboard' });
    }

    /* Read off the SLOTS, not off a list of things somebody remembered to
     * update. A reactor or a heat shield shows up here the day it is
     * fitted without this function learning anything about it. */
    var list = Combat.fittedList(s);
    for (var i = 0; i < list.length; i++) {
      var it = list[i].item, val;
      /* A gun reports which TRIGGER it answers to, not its range: the range
       * is on the yard's shelf where you were deciding whether to buy it,
       * and by the time it is bolted on, the live question is which of your
       * two triggers it fires from. Clicking the row moves it — the yard
       * used to be the only place that could, which made a loadout decision
       * something you could not revisit until you next docked. */
      if (it.kind === 'gun') {
        val = it.dmg + ' dmg · GROUP ' + Combat.groupOf(s, list[i].key).toUpperCase();
        out.push({ name: it.name, value: val, uncertified: !!it.grey,
                   slotKey: list[i].key, gun: true });
        continue;
      }
      if (it.kind === 'turret') val = 'automatic';
      /* The slipspace drive by its class, and what it asks of the budget:
       * nothing for her frame's own (combat.js THE SLIPSPACE BAY). */
      else if (it.slot === 'core') {
        var extraP = Combat.budgetPower ? Combat.budgetPower(s, it) : it.power;
        val = 'Class ' + it.slipClass + (extraP > 0 ? ' · ' + extraP.toFixed(1) + ' MW' : ' · standard');
      }
      else if (it.kind === 'shield') val = Math.round(s.shieldHp) + ' / ' + it.cap;
      else if (it.kind === 'heatshield') val = it.shed + ' units/s';
      else if (it.kind === 'reactor') val = '+' + it.powerBonus.toFixed(1) + ' MW';
      else if (it.kind === 'hab') val = it.seats + ' berths · −' + it.hold + ' t hold';
      else val = it.power.toFixed(1) + ' MW';
      out.push({ name: it.name, value: val, uncertified: !!it.grey });
    }
    /* Every rack, not just the armed one. The old line named Hawks whatever
     * was actually aboard, which was true right up until the ship could
     * carry two kinds at once. */
    Combat.rackList(s).forEach(function (r) {
      var m = Combat.MISSILES[r.id];
      out.push({ name: (m ? m.name : r.id) + (s.missileId === r.id ? ' (armed)' : ''),
                 value: r.n + ' / ' + (m ? m.rack : '?') });
    });
    var rack = Combat.sinkRackSize(s);
    if (rack) out.push({ name: 'Heat sinks', value: s.sinks + ' / ' + rack });
    return out;
  }

  /* ---- who you are -------------------------------------------------------
   * Pilot name and ship name are yours and cost nothing. REGISTRATION is a
   * legal record: changing it is a dockside job with a price on it, which
   * is both why it reads as an act rather than a preference and why it
   * cannot be fiddled with in flight.
   *
   * The grammar is regCode's own — two letters, a dash, four digits, and no
   * I, O or Q because they read as digits on a scanner. */
  var REG_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  var REG_RE = new RegExp('^[' + REG_LETTERS + ']{2}-[0-9]{4}$');
  var REREGISTER_FEE = 250;

  function identityRows() {
    var s = G.ship;
    return [
      { key: 'pilot', label: 'PILOT NAME', value: G.pilotName || 'unnamed',
        hint: 'letters, digits, spaces', dockOnly: false },
      { key: 'ship', label: 'SHIP NAME', value: s.shipName || '(none)',
        hint: 'what it says on the hull', dockOnly: false },
      { key: 'reg', label: 'REGISTRATION', value: s.reg || '—',
        hint: REREGISTER_FEE + ' cr, dockside', dockOnly: true }
    ];
  }

  function editIdentity(kind) {
    var s = G.ship;
    if (kind === 'pilot') {
      beginEdit({ label: 'PILOT NAME', value: G.pilotName || '', max: 24,
        allow: function (c) { return /[A-Za-z0-9 .'\-]/.test(c) ? c : ''; },
        commit: function (v) {
          G.pilotName = v || null;
          say(v ? 'Logged as ' + v : 'Pilot name cleared', 4);
        } });
    } else if (kind === 'ship') {
      beginEdit({ label: 'SHIP NAME', value: s.shipName || '', max: 24,
        allow: function (c) { return /[A-Za-z0-9 .'\-]/.test(c) ? c : ''; },
        commit: function (v) {
          s.shipName = v || null;
          say(v ? 'She answers to ' + v + ' now' : 'Ship name cleared', 4);
        } });
    } else if (kind === 'reg') {
      if (!s.docked) { say('Re-registration is a dockside job', 4); return; }
      beginEdit({ label: 'REGISTRATION  (' + REREGISTER_FEE + ' cr)',
        value: s.reg || '', max: 7,
        hint: 'LL-NNNN  ·  no I, O or Q',
        allow: function (c) {
          var u = c.toUpperCase();
          /* Typed in the shape it has to end up in: letters only in the
           * first two places, a dash in the third, digits after. Filtering
           * as you type beats rejecting the whole thing at the end. */
          var n = (editState() ? editState().value.length : 0);
          if (n < 2) return REG_LETTERS.indexOf(u) >= 0 ? u : '';
          if (n === 2) return u === '-' ? '-' : '';
          return /[0-9]/.test(u) ? u : '';
        },
        commit: function (v) {
          if (!REG_RE.test(v)) { say('That is not a registration. LL-NNNN.', 5); return; }
          if (v === s.reg) return;
          if (G.ship.credits < REREGISTER_FEE) {
            say('Re-registration costs ' + REREGISTER_FEE + ' cr — you are short', 5);
            return;
          }
          G.ship.credits -= REREGISTER_FEE;
          s.reg = v;
          say('Re-registered as ' + v + ' — ' + REREGISTER_FEE + ' cr', 5);
        } });
    }
  }

  /* The safe path: take the next code the seed offers rather than typing
   * one. Costs the same, and cannot produce something illegal. */
  function rerollReg() {
    var s = G.ship;
    if (!s.docked) { say('Re-registration is a dockside job', 4); return; }
    if (G.ship.credits < REREGISTER_FEE) {
      say('Re-registration costs ' + REREGISTER_FEE + ' cr — you are short', 5);
      return;
    }
    s.regRoll = (s.regRoll || 0) + 1;
    s.reg = global.Sim.regCode(G.seed + '|player|' + s.regRoll);
    G.ship.credits -= REREGISTER_FEE;
    say('Re-registered as ' + s.reg + ' — ' + REREGISTER_FEE + ' cr', 5);
  }

  /* --- F6: the chart ----------------------------------------------------- */
  function drawGalaxyScreen(ctx, w, bottom) {
    if (!G.starMap) G.starMap = { sel: 0, list: jumpCandidates() };
    modeFrame(ctx, w, bottom, 'GALAXY MAP & COURSE PLOTTER',
              'drag turns it   ·   shift-drag pans   ·   L levels   ·   K height   ·   Enter lays in the course   ·   F8 engages');
    drawStarMap(ctx, w, bottom);
  }

  /* --- F7: missions ------------------------------------------------------
   * Left: what you have signed and who thinks what of you. Right: the local
   * board, which only exists while you are docked — a mission board is a
   * corkboard in a station corridor, not a radio service. */
  /* Where a signed contract is actually going. Named from the live world
   * where it can be — a port knows the body it sits on — and from the
   * contract's own carried `toName` otherwise, so a destination in a system
   * you are not standing in still reads.
   *
   * The two shapes are genuinely different jobs and the line says so: a
   * haul or a disposal names one berth, and a courier names a system where
   * any port at all will do. */
  function destinationLine(m) {
    if (m.toPortId) {
      var p = (G.sys && G.sys.byId) ? G.sys.byId[m.toPortId] : null;
      if (p) {
        return '→ ' + p.name +
               (p.parentBody ? ', ' + p.parentBody.name : '') +
               (G.here && G.here.name ? ', ' + G.here.name + ' system' : '');
      }
      return '→ ' + m.toName;
    }
    if (m.toStarId) {
      var arrived = !!(G.here && G.here.id === m.toStarId);
      return '→ ' + m.toName +
             (arrived ? ' — you are here; dock anywhere to hand it over'
                      : ' — any port there will do');
    }
    return '→ ' + (m.toName || 'destination not recorded');
  }

  function drawMissionScreen(ctx, w, bottom) {
    var docked = G.ship.docked ? G.sys.byId[G.ship.docked] : null;
    var top = modeFrame(ctx, w, bottom, 'MISSION STATUS',
                        docked ? 'click ACCEPT to sign' : 'dock at a port for its board');
    var pad = 14;
    var colH = bottom - top - pad * 2;
    var leftW = Math.min(560, w * 0.46);

    /* --- active contracts + standing, left --- */
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(pad, top + pad, leftW, colH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad + 2, top + pad + 2, leftW - 4, colH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(pad + 4, top + pad + 4, leftW - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('ACTIVE CONTRACTS', pad + 10, top + pad + 18);
    ctx.restore();

    /* Campaign chapters float to the top of their own labelled group — a
     * faction's chain reads as a distinct thread from ordinary freight, not
     * one more line in the same pile. */
    var list = (G.missions || []).slice().sort(function (a, b) {
      return (b.campaign ? 1 : 0) - (a.campaign ? 1 : 0);
    });
    var y = top + pad + 44;
    if (!list.length) {
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('none — the board is on the right, when docked', pad + 14, y);
      ctx.restore();
      y += 26;
    }
    var sawCampaignHdr = false, sawContractHdr = false;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.campaign && !sawCampaignHdr) {
        sawCampaignHdr = true;
        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = '#8a7a3a';
        ctx.fillText('FACTION CAMPAIGNS', pad + 14, y);
        ctx.restore();
        y += 16;
      } else if (!m.campaign && !sawContractHdr && sawCampaignHdr) {
        sawContractHdr = true;
        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = '#5d8fa4';
        ctx.fillText('CONTRACTS', pad + 14, y);
        ctx.restore();
        y += 16;
      }
      var leftT = m.deadline - G.t;
      var held = G.ship.cargo[m.cid] || 0;
      /* A FIELDWORK CONTRACT IS NOT SHORT OF FREIGHT. It is short of
       * coverage, or of a sweep, or of a pod still on a rock - and
       * fieldwork.js is the only thing that can say which, so it does
       * (Fieldwork.progress). "FREIGHT MISSING (0/0t)" was the old line. */
      var fwLine = (global.Fieldwork && Fieldwork.progress) ? Fieldwork.progress(G, m) : null;
      if (!fwLine && global.Intel && Intel.progress) fwLine = Intel.progress(G, m);
      var short = !fwLine && held + 1e-9 < m.tonnes;
      var headCols = Math.max(20, Math.floor((leftW - 120) / 7.7));
      var subCols = Math.max(24, Math.floor((leftW - 40) / 6.16));
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = m.campaign ? '#ffe07a' : MFD_INK;
      ctx.fillText((m.campaign ? '★ ' : '') + clipText(m.text, headCols), pad + 14, y);
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = leftT < 86400 ? '#ffb86b' : MFD_DIM;
      ctx.fillText('pays ' + fmtCredits(m.pay) + '   ·   due in ' + fmtTime(Math.max(0, leftT)) +
                   (short ? '   ·   FREIGHT MISSING (' + held.toFixed(0) + '/' + m.tonnes + 't)' : ''),
                   pad + 14, y + 14);
      /* The destination, spelled out. It has always been on the contract —
       * accept() copies toPortId/toStarId/toName — and until now the only
       * way to see it was to hope the generated headline mentioned it. */
      ctx.fillStyle = '#7fd6c0';
      ctx.fillText(clipText(fwLine || destinationLine(m), subCols), pad + 14, y + 27);
      /* HOW FAR, from where you are right now (2026-11-18). */
      var rch = Missions.reach ? Missions.reach(G, m) : null;
      var extra = 0;
      if (rch) {
        ctx.fillStyle = '#9fd0e0';
        ctx.fillText(clipText(rch.text, subCols), pad + 14, y + 40);
        extra += 13;
      }
      /* THE PARCEL (2026-11-01): what you know about what you carry. Only
       * for a parcel actually aboard; "sealed" with no scanner, the
       * contents once a combat scanner or better reads through the seal,
       * amber when what it reads is contraband. */
      var know = (m.type === 'courier' && Missions.parcelsAboard(G).indexOf(m) >= 0)
        ? Missions.parcelKnown(G, m) : null;
      if (know) {
        ctx.fillStyle = know.known && know.dirty ? '#ffb86b' : MFD_DIM;
        ctx.fillText(clipText(know.line, subCols), pad + 14, y + 40 + extra);
        extra += 13;
      }
      ctx.restore();

      /* DETAILS, on the contract this time. `desc` is deliberately CARRIED
       * onto a signed mission rather than regenerated, and the board has
       * had the button for it since the text discipline landed; the one
       * place it was designed to be read did not.
       *
       * Sharing `G.missionDesc` with the board is safe rather than lazy: an
       * accepted mission keeps its offer's id, and `alreadyHave` removes
       * that id from the board, so the two lists can never both hold it. */
      var openC = G.missionDesc === m.id;
      if (m.desc) {
        btn(ctx, pad + leftW - 96, y - 13, 80, 26, openC ? 'HIDE' : 'DETAILS',
            (function (id) {
              return function () { G.missionDesc = (G.missionDesc === id) ? null : id; };
            })(m.id), { font: 10 });
      }
      y += 46 + extra;

      if (openC && m.desc) {
        var dlines = wrapText(m.desc, Math.max(20, Math.floor((leftW - 44) / 6.49)));
        ctx.save();
        ctx.fillStyle = 'rgba(8,20,28,0.9)';
        ctx.fillRect(pad + 14, y - 12, leftW - 30, dlines.length * 13 + 12);
        ctx.strokeStyle = 'rgba(74,151,176,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(pad + 14.5, y - 11.5, leftW - 31, dlines.length * 13 + 11);
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = '#9fc4d4';
        for (var dl = 0; dl < dlines.length; dl++) {
          ctx.fillText(dlines[dl], pad + 22, y + 2 + dl * 13);
        }
        ctx.restore();
        y += dlines.length * 13 + 16;
        /* BREAK THE SEAL, behind a second press: it voids the contract and
         * costs standing, and there is no undo. Lives in DETAILS so it is
         * never a stray click on the list. */
        if (know) {
          var arming = G.sealConfirm === m.id;
          btn(ctx, pad + 14, y - 8, 190, 24, arming ? 'SURE? VOIDS THE CONTRACT' : 'BREAK THE SEAL',
              (function (id, armed) {
                return function () {
                  if (!armed) { G.sealConfirm = id; return; }
                  G.sealConfirm = null;
                  Missions.breakSeal(G, id, hooksFor());
                };
              })(m.id, arming), { font: 10 });
          y += 26;
        }
      }
      if (y > top + pad + colH * 0.62) break;
    }

    /* Standing, and what the law is owed. Reputation and warrants are
     * different ledgers and both belong on this screen. */
    var sy = top + pad + colH * 0.62 + 10;
    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#5d8fa4';
    ctx.fillText('STANDING', pad + 14, sy);
    ctx.restore();
    var facs = G.sys.factions || [];
    for (var f = 0; f < facs.length; f++) {
      var yy = sy + 20 + f * 17;
      if (yy > top + pad + colH - 12) break;
      var st = Missions.standing(G, facs[f].id);
      var owed = (G.wanted || {})[facs[f].id] || 0;
      ctx.save();
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = facs[f].color || MFD_INK;
      ctx.fillText(clipText(facs[f].name, 26), pad + 14, yy);
      ctx.fillStyle = st < -9 ? '#ff8a76' : st > 9 ? '#7dffb0' : MFD_DIM;
      ctx.fillText(Missions.standingLabel(st, G, facs[f].id) + ' (' + st + ')', pad + leftW * 0.55, yy);
      /* HOW MUCH OF THAT YOU BOUGHT. A desk that has taken your berth fees
       * and your fuel money owes you some of its goodwill, and this is the
       * part of the number you paid for rather than earned flying
       * (Missions.patronage). */
      var pat = Missions.patronageOf ? Missions.patronageOf(G, facs[f].id) : null;
      if (pat && pat.given > 0 && !(owed > 0)) {
        ctx.fillStyle = '#4f7d8e';
        ctx.fillText('trade +' + pat.given + (pat.capped ? ' max' : ''), pad + leftW * 0.80, yy);
      }
      if (owed > 0) {
        ctx.fillStyle = '#ff5a5a';
        ctx.textAlign = 'right';
        ctx.fillText('bounty ' + Math.round(owed), pad + leftW - 12, yy);
        ctx.textAlign = 'left';
      } else if (G.workoff && G.workoff[facs[f].id] > 0) {
        /* A fine being worked off (combat.js workOff): their contracts
         * pay half until this is gone. */
        ctx.fillStyle = '#ffb86b';
        ctx.textAlign = 'right';
        ctx.fillText('working off ' + Math.round(G.workoff[facs[f].id]), pad + leftW - 12, yy);
        ctx.textAlign = 'left';
      }
      ctx.restore();
    }

    /* THE GUILD'S OWN BOOKS (2026-11-11). It flies no flag and holds no
     * space, so it is in nobody's faction list - and the surveyor's
     * chain is gated on exactly this number. Shown only once you have
     * sold them something, because before that there is nothing to say. */
    var Chs = global.Charts;
    var tradeBodies = [
      { key: 'guild', name: 'Mining Guild' },
      { key: 'carto', name: 'Cartographers', always: function () {
          /* They are on the list the moment they have paid you anything,
           * not the moment they have thought well of you for it. */
          return !!(G.carto && G.carto.paid > 0);
        }, ledger: function () {
          if (!Chs || !G.carto || !(G.carto.paid > 0)) return '';
          var per = Chs.CARTO_PER;
          var toNext = per - (G.carto.paid % per);
          return (G.carto.given || 0) >= 0 && toNext < per
            ? Math.round(toNext / 100) / 10 + 'k to the next'
            : '';
        } }
    ];
    var gy = sy + 20 + facs.length * 17;
    for (var tbI = 0; tbI < tradeBodies.length; tbI++) {
      var tbSt = (G.standing || {})[tradeBodies[tbI].key] || 0;
      if (!tbSt && !(tradeBodies[tbI].always && tradeBodies[tbI].always())) continue;
      if (gy > top + pad + colH - 12) break;
      ctx.save();
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = '#9ce89c';
      ctx.fillText(tradeBodies[tbI].name, pad + 14, gy);
      /* A body can be COLD on you, which the Guild now can be: publishing
       * rich worlds is the one thing in the game that spends their good
       * opinion rather than earning it. Red, so it reads as a cost. */
      ctx.fillStyle = tbSt < 0 ? '#ff8c8c' : tbSt > 9 ? '#7dffb0' : MFD_DIM;
      ctx.fillText(Missions.standingLabel(tbSt) + ' (' + tbSt + ')', pad + leftW * 0.55, gy);
      /* WHAT IS IN THE LEDGER BUT NOT YET A POINT. The Cartographers pay
       * per sheet and credit per 12,000 cr of it, so a career can have
       * filed real work and still read zero - which looked, on this
       * screen, exactly like having done nothing. Shown the way patronage
       * is shown, beside the number it is working towards. */
      if (tradeBodies[tbI].ledger) {
        var led = tradeBodies[tbI].ledger();
        if (led) {
          ctx.fillStyle = '#4f7d8e';
          ctx.fillText(led, pad + leftW * 0.80, gy);
        }
      }
      ctx.restore();
      gy += 17;
    }

    /* --- the board, right --- */
    var rx = pad * 2 + leftW, rw = w - rx - pad;
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(rx, top + pad, rw, colH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    /* colH, not chanH. `chanH` is the COMMS panel's channel height, declared
     * in a different function entirely — it arrived here with a copied
     * border and threw a ReferenceError, which main.js catches and paints as
     * "error:" over the whole frame. So the MISSIONS screen did not render at
     * all, in any view. The border belongs around the box filled two lines
     * above, and that box is colH tall. */
    ctx.strokeRect(rx + 2, top + pad + 2, rw - 4, colH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(rx + 4, top + pad + 4, rw - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(docked ? 'MISSION BOARD — ' + clipText(docked.name, 26) : 'MISSION BOARD',
                 rx + 10, top + pad + 18);
    ctx.restore();

    if (!docked) {
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('NOT DOCKED', rx + 16, top + pad + 48);
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText('every port keeps a board; T docks with a locked station.', rx + 16, top + pad + 66);
      ctx.restore();
      return;
    }

    var offers = Missions.boardAt(docked, G.sys, G.galaxy, G.here, G.t, G)
      .concat(Arcs ? Arcs.campaignBoardAt(G, docked, G.sys, G.galaxy, G.here, G.t) : [])
      /* The two authored chains, ahead of everything else on the board:
       * they are the only offers here that are a STORY rather than a job,
       * and a chapter that scrolled off the bottom behind four hauls would
       * be a story nobody found. */
      .concat(Arcs && Arcs.powerBoardAt
        ? Arcs.powerBoardAt(G, docked, G.sys, G.galaxy, G.here, G.t) : [])
      .filter(function (o) { return !Missions.alreadyHave(G, o.id); })
      .sort(function (a, b) { return (b.campaign ? 1 : 0) - (a.campaign ? 1 : 0); });
    if (!offers.length) {
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('Board is bare — check back in a day or two', rx + 16, top + pad + 48);
      ctx.restore();
      return;
    }

    /* THE BOARD SCROLLS (2026-11-20). It used to stop drawing at the panel's
     * foot without a word, and the kinds of work appended last (digs,
     * relays, mail, the holiday trade) were the first to vanish from a
     * long board, which reads as "there is none". Same machinery as the
     * notes log: the wheel over the board, a bar only when something is
     * out of view, and a count at the end that is hiding rows. */
    var boardKey = (G.here ? G.here.id : '') + '|' + docked.id;   // port ids repeat between systems
    if (boardView.port !== boardKey) { boardView.port = boardKey; boardView.top = 0; }
    boardView.top = Math.max(0, Math.min(offers.length - 1, boardView.top));
    var oy = top + pad + 40, boardY0 = oy - 14, boardBottom = top + pad + colH - 6, shownB = 0;
    var sawCampaignBoardHdr = false, sawContractBoardHdr = false;
    for (var o = boardView.top; o < offers.length; o++) {
      var off = offers[o];
      if (oy + 58 > boardBottom) break;
      shownB++;
      if (off.campaign && !sawCampaignBoardHdr) {
        sawCampaignBoardHdr = true;
        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = '#8a7a3a';
        ctx.fillText('★ FACTION CAMPAIGN', rx + 16, oy);
        ctx.restore();
        oy += 16;
      } else if (!off.campaign && !sawContractBoardHdr && sawCampaignBoardHdr) {
        sawContractBoardHdr = true;
        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = '#5d8fa4';
        ctx.fillText('CONTRACTS', rx + 16, oy);
        ctx.restore();
        oy += 16;
      }
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      /* A PASSAGE YOU CANNOT TAKE IS STILL WORTH SEEING. The board is
       * generated per port and window rather than per career, so it cannot
       * ask what is fitted to your hull — and that turns out to be the
       * right behaviour rather than a limitation: passage work you have no
       * berths for is exactly what makes a habitation unit worth buying.
       * It is dimmed and it says why, which this file has always preferred
       * to a row that will not explain itself. */
      var noPass = off.type === 'passage' && Missions.passageRefusal
        ? Missions.passageRefusal(G, off) : null;
      /* A LICENSED HAUL IS THE SAME IDEA ONE STEP FURTHER. The navy posts
       * it at its own carrier whether or not you are cleared, and the row
       * says which it is — an offer you can see and not take is what makes
       * standing with a flag worth having. */
      if (!noPass && Missions.licenceRefusal) {
        noPass = Missions.licenceRefusal(G, off);
      }
      /* The same idea once more, for the one contract whose gate is how
       * well the people you would be informing on think of you
       * (intel.js). Seeing it and not being able to take it is what makes
       * their good opinion worth having. */
      if (!noPass && global.Intel && Intel.signRefusal) {
        noPass = Intel.signRefusal(G, off);
      }
      ctx.fillStyle = noPass ? '#6a7d92'
                    : off.campaign ? '#ffe07a'
                    : off.type === 'passage' ? '#c7b4ff'
                    : off.type === 'courier' ? '#b4f0ff'
                    : off.type === 'disposal' ? '#ffb86b'
                    /* Fieldwork, in its own colour: this is the work that
                     * does not come out of a hold (fieldwork.js). */
                    : (off.type === 'survey' || off.type === 'prospect') ? '#9ce89c'
                    : (off.type === 'sweep' || off.type === 'recovery') ? '#9cd8e8'
                    : (off.type === 'watch' || off.type === 'walkin') ? '#e8a0c8'
                    : off.hop ? '#e8d89c' : MFD_INK;
      ctx.fillText((off.campaign ? '★ ' : '') +
                   clipText(off.text, Math.floor((rw - 130) / 7.7)), rx + 16, oy + 14);
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      if (noPass) ctx.fillStyle = '#ffb86b';
      ctx.fillText(clipText('pays ' + fmtCredits(off.pay) + '   ·   due ' +
                            fmtTime(off.deadline - G.t) + '   ·   ' +
                            (noPass ? noPass
                               : off.type === 'passage' ? (off.souls + ' berths')
                               : (global.Fieldwork && Fieldwork.demand && Fieldwork.demand(off))
                                 ? Fieldwork.demand(off)
                               : (global.Intel && Intel.demand && Intel.demand(off))
                                 ? Intel.demand(off)
                               : off.tonnes + 't of hold'),
                            Math.floor((rw - 130) / 6.16)), rx + 16, oy + 28);
      /* HOW FAR (2026-11-18): live, from where you are docked now. */
      var offReach = Missions.reach ? Missions.reach(G, off) : null;
      if (offReach) {
        ctx.fillStyle = '#9fd0e0';
        ctx.fillText(clipText(offReach.text, Math.floor((rw - 130) / 6.16)), rx + 16, oy + 41);
      }
      ctx.restore();
      btn(ctx, rx + rw - 96, oy + 6, 80, 28, 'ACCEPT',
          (function (offer) {
            return function () {
              var res = Missions.accept(G, offer, hooksFor());
              if (!res.ok) say('Cannot sign: ' + res.why, 4);
            };
          })(off), { bold: true, font: 11 });

      /* The long form, behind a button. The board stays scannable and the
       * detail is one click away for the job you are actually considering
       * — which is the whole reason `text` is allowed to stay terse. */
      var openHere = G.missionDesc === off.id;
      if (off.desc) {
        btn(ctx, rx + rw - 178, oy + 6, 76, 28, openHere ? 'HIDE' : 'DETAILS',
            (function (id) {
              return function () { G.missionDesc = (G.missionDesc === id) ? null : id; };
            })(off.id), { font: 10 });
      }
      oy += offReach ? 60 : 48;

      if (openHere && off.desc) {
        var lines = wrapText(off.desc, Math.floor((rw - 44) / 6.49));
        ctx.save();
        ctx.fillStyle = 'rgba(8,20,28,0.9)';
        ctx.fillRect(rx + 16, oy - 6, rw - 32, lines.length * 13 + 12);
        ctx.strokeStyle = 'rgba(74,151,176,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 16.5, oy - 5.5, rw - 33, lines.length * 13 + 11);
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = '#9fc4d4';
        for (var ln = 0; ln < lines.length; ln++) {
          ctx.fillText(lines[ln], rx + 24, oy + 8 + ln * 13);
        }
        ctx.restore();
        oy += lines.length * 13 + 18;
      }
    }
    var hiddenAbove = boardView.top, hiddenBelow = offers.length - boardView.top - shownB;
    boardView.below = hiddenBelow;     // the wheel stops once the last row is showing
    if (hiddenAbove > 0 || hiddenBelow > 0) {
      drawScrollbar(ctx, rx + rw - 12, boardY0, 6, boardBottom - boardY0, offers.length,
                    Math.max(1, shownB), boardView.top,
                    function (p) { boardView.top = Math.max(0, Math.min(offers.length - 1, p)); });
      ctx.save();
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(160,185,220,0.75)';
      ctx.textAlign = 'right';
      if (hiddenAbove > 0) ctx.fillText('▲ ' + hiddenAbove + ' more', rx + rw - 22, boardY0 + 4);
      if (hiddenBelow > 0) ctx.fillText('▼ ' + hiddenBelow + ' more  ·  wheel to scroll', rx + rw - 22, boardBottom - 6);
      ctx.restore();
    }
    if (overRect(rx, boardY0, rw, boardBottom - boardY0)) {
      setScrollRegion(rx, boardY0, rw, boardBottom - boardY0, function (d) {
        if (d > 0 && !(boardView.below > 0)) return;
        boardView.top = Math.max(0, Math.min(Math.max(0, offers.length - 1), boardView.top + d));
      });
    }
  }
  var boardView = { top: 0, port: null, below: 0 };

  /* Greedy word wrap. The panel is monospaced, so a character budget is an
   * honest measure of width and there is no need to measure text. */
  function wrapText(s, cols) {
    var words = String(s || '').split(/\s+/), out = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (next.length > cols && line) { out.push(line); line = words[i]; }
      else line = next;
    }
    if (line) out.push(line);
    return out;
  }

  /* --- F8: the jump ------------------------------------------------------ */
  function drawJumpScreen(ctx, w, bottom) {
    var course = plottedCourse();
    var top = modeFrame(ctx, w, bottom, 'SLIPSPACE DRIVE',
                        course ? 'Enter to engage' : 'F6 plots a course');
    var pad = 14;
    var pw = Math.min(760, w - pad * 2), px = (w - pw) / 2, py = top + pad * 2;

    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(px, py, pw, bottom - py - pad);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, pw - 4, bottom - py - pad - 4);
    ctx.restore();

    if (!course) {
      ctx.save();
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('NO COURSE LAID IN', px + 30, py + 50);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(160,185,220,0.7)';
      ctx.fillText('Open the chart, pick a star, press Enter. Then come back here.',
                   px + 30, py + 76);
      ctx.restore();
      btn(ctx, px + 30, py + 100, 200, 34, 'OPEN THE CHART  (F6)',
          function () { selectPanel(5); }, { bold: true });
      return;
    }

    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('DESTINATION', px + 30, py + 34);
    ctx.font = 'bold 27px ui-monospace, monospace';
    ctx.fillStyle = course.to.color;
    ctx.fillText(course.to.name, px + 30, py + 68);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('class ' + course.to.cls + '   ·   ' + course.to.temp + ' K   ·   ' +
                 (G.visited[course.to.id] ? 'surveyed' : 'unsurveyed'), px + 30, py + 90);
    ctx.restore();

    rows(ctx, px + 30, py + 126, [
      ['distance', fmtLy(course.distance)],
      ['propellant', course.fuel.toFixed(2) + ' t',
        course.possible ? '#7dffb0' : '#ff7a7a'],
      ['in the tank', G.ship.fuel.toFixed(2) + ' t'],
      ['on arrival', Math.max(0, G.ship.fuel - course.fuel).toFixed(2) + ' t',
        (G.ship.fuel - course.fuel) < 2 ? '#ffb86b' : '#cfe0ff'],
      ['transit', fmtTime(course.seconds), '#ffb86b'],
      ['arrive', fmtEpoch(G.t + course.seconds)]
    ], '#7e93b3', '#cfe0ff', Math.min(420, pw - 60));

    var by = py + 126 + 6 * 20 + 24;
    if (!course.possible) {
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = '#ff7a7a';
      /* A CHECKPOINT IS NOT A SHORTFALL. Telling a pilot with a full tank
       * that they are short by 0.00 tonnes is how a barred course reads as
       * a broken fuel gauge — so the two refusals say different things, and
       * the door says what is behind it. */
      if (course.barred) {
        ctx.fillText('RESTRICTED SPACE — ' + course.restricted.label.toLowerCase() +
                     '; no transponder aboard', px + 30, by + 20);
      } else if (course.noDrive) {
        ctx.fillText('NO SLIPSPACE DRIVE — a yard will fit one', px + 30, by + 20);
      } else {
        ctx.fillText('SHORT BY ' + course.shortfall.toFixed(2) + ' t — refuel, or lighten the hold',
                     px + 30, by + 20);
      }
      ctx.restore();
      btn(ctx, px + 30, by + 36, 240, 38, 'CANNOT ENGAGE', function () {}, { disabled: true, bold: true });
    } else {
      btn(ctx, px + 30, by, 240, 40, 'ENGAGE SLIPSPACE DRIVE', function () {
        selectPanel(0);
        doJump(course);
      }, { bold: true, font: 13 });
      ctx.save();
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(160,185,220,0.6)';
      ctx.fillText('Seven seconds in the tunnel; ' + fmtTime(course.seconds) +
                   ' of everyone else\'s time.', px + 286, by + 24);
      ctx.restore();
    }
  }

  /* --- F9: aiming --------------------------------------------------------
   * Two ways to fly, one switch. Head mode is the default because it is what
   * a cockpit is FOR; aim mode is what you want the moment something is
   * shooting at you or you are threading a docking bay. */
  function drawAimScreen(ctx, w, bottom) {
    var top = modeFrame(ctx, w, bottom, 'KEYBOARD / MOUSE AIM', 'Enter toggles');
    var pad = 14;
    var pw = Math.min(700, w - pad * 2), px = (w - pw) / 2, py = top + pad * 2;

    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(px, py, pw, bottom - py - pad);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, pw - 4, bottom - py - pad - 4);
    ctx.restore();

    var half = (pw - 60) / 2;
    var modes = [
      { on: !G.mouseAim, title: 'HEAD', sub: 'the mouse turns your head',
        body: ['Drag to look around the cockpit.',
               'Home re-centres the view.',
               'Arrow keys and Q/E point the nose.',
               'The nose does not follow your eyes.'] },
      { on: G.mouseAim, title: 'AIM', sub: 'the mouse points the nose',
        body: ['Drag to steer. The view follows the nose.',
               'Arrow keys still work and still agree.',
               'Hold Left Alt to get a cursor back.',
               'Better for docking and for being shot at.'] }
    ];
    for (var i = 0; i < 2; i++) {
      var mx = px + 30 + i * (half + 20), my = py + 30;
      ctx.save();
      ctx.fillStyle = modes[i].on ? 'rgba(18,65,79,0.8)' : 'rgba(10,18,26,0.6)';
      ctx.fillRect(mx, my, half, 176);
      ctx.strokeStyle = modes[i].on ? '#b4f0ff' : 'rgba(74,151,176,0.4)';
      ctx.lineWidth = modes[i].on ? 1.6 : 1;
      ctx.strokeRect(mx + 0.5, my + 0.5, half - 1, 175);
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillStyle = modes[i].on ? '#ffffff' : '#78a6b8';
      ctx.fillText(modes[i].title, mx + 16, my + 28);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = modes[i].on ? '#7fd6c0' : '#4f7d90';
      ctx.fillText(modes[i].sub, mx + 16, my + 46);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = modes[i].on ? '#cfe0ff' : 'rgba(160,185,220,0.55)';
      for (var b = 0; b < modes[i].body.length; b++) {
        ctx.fillText(modes[i].body[b], mx + 16, my + 74 + b * 18);
      }
      ctx.restore();
      btn(ctx, mx + 16, my + 140, half - 32, 26,
          modes[i].on ? 'ACTIVE' : 'SELECT',
          (function (want) { return function () { setMouseAim(want); }; })(i === 1),
          { disabled: modes[i].on, bold: modes[i].on });
    }

    var sy = py + 236;
    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('SENSITIVITY', px + 30, sy);
    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.fillStyle = MFD_INK;
    ctx.fillText(G.aimSens.toFixed(2) + '×', px + 150, sy + 2);
    ctx.restore();
    btn(ctx, px + 220, sy - 16, 34, 24, '−',
        function () { G.aimSens = Math.max(0.25, G.aimSens - 0.25); }, { font: 14 });
    btn(ctx, px + 260, sy - 16, 34, 24, '+',
        function () { G.aimSens = Math.min(3, G.aimSens + 0.25); }, { font: 14 });

    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('ATTITUDE KEYS', px + 30, sy + 44);
    ctx.restore();
    rows(ctx, px + 30, sy + 66, [
      ['pitch', '↑ / ↓'],
      ['yaw', '← / →'],
      ['roll', 'Q / E'],
      ['stop turning', 'X'],
      ['fine control', 'hold Shift']
    ], '#7e93b3', '#cfe0ff', Math.min(360, pw - 60));
  }

  /* --- F10: the manifest --------------------------------------------------
   * What you are carrying, who it belongs to, and what it is worth — the
   * three questions a hold raises, which until now were answered on three
   * different screens or not at all.
   *
   * It is not a second inventory. F5 lists the hold and lets you throw
   * things out of it; this page is about the CARGO'S OBLIGATIONS. Which
   * tonnes are spoken for by a contract and must not be sold, which tonnes
   * are illegal to be carrying at all, and where in this system the rest of
   * it is worth the most. Selling contract freight by accident and finding
   * out at the deadline is the specific mistake this exists to prevent. */
  function bestMarketFor(cid) {
    var sys = G.sys;
    if (!sys || !sys.bodies) return null;
    var best = null;
    for (var i = 0; i < sys.bodies.length; i++) {
      var b = sys.bodies[i];
      if (!b.market || !shown(b)) continue;
      var q = Eco.price(b, cid, G.t);
      if (!q || q.sell === null) continue;
      if (!best || q.sell > best.sell) best = { sell: q.sell, port: b };
    }
    return best;
  }

  /* Tonnes of each commodity that a signed contract is expecting to see
   * delivered. Keyed by commodity, because two hauls of grain are four
   * tonnes of grain you cannot touch, not two separate piles. */
  function committedTonnes() {
    var out = {}, list = G.missions || [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || !m.cid || !(m.tonnes > 0)) continue;
      out[m.cid] = (out[m.cid] || 0) + m.tonnes;
    }
    return out;
  }

  function drawManifestScreen(ctx, w, bottom) {
    var s = G.ship;
    var port = s.docked ? G.sys.byId[s.docked] : null;
    var top = modeFrame(ctx, w, bottom, 'CARGO MANIFEST',
                        port ? 'F4 trade   ·   F5 to jettison'
                             : 'best prices are in this system only');
    var pad = 14;
    var colH = bottom - top - pad * 2;
    var leftW = Math.min(620, w * 0.55);
    var held = heldCargo();
    var owed = committedTonnes();

    /* --- the hold, left --- */
    panelBox(ctx, pad, top + pad, leftW, colH, 'HOLD MANIFEST');

    /* Four columns, and the status one is LEFT-aligned with a lane of its
     * own. Right-aligning it against a fraction of the panel put "free to
     * sell" straight through the tonnage — "12 tfree to sell" — and welded
     * the two headers into "STATUSBEST IN SYSTEM". Tests cannot see either;
     * only looking at it can. */
    var cName = pad + 16;
    var cTon = pad + leftW * 0.45;          // right-aligned
    var cStat = pad + leftW * 0.49;         // left-aligned, its own lane
    var cVal = pad + leftW - 16;            // right-aligned
    /* Clipped to the lane it has, in characters, at the width this font
     * actually measures rather than the width I assumed: "Structural
     * alloys" ran straight into the tonnage at 12px because 8.4 px/char is
     * not 7.2. Derived, so a narrower panel clips harder on its own. */
    var nameChars = Math.max(6, Math.floor((cTon - cName - 34) / 9.24));

    var hy = top + pad + 46;
    ctx.save();
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('COMMODITY', cName, hy);
    ctx.fillText('STATUS', cStat, hy);
    ctx.textAlign = 'right';
    ctx.fillText('TONNES', cTon, hy);
    ctx.fillText(port ? 'VALUE HERE' : 'BEST HERE', cVal, hy);
    ctx.textAlign = 'left';
    ctx.restore();

    /* Tall enough for the second line every row can carry — the port whose
     * price is being quoted. A variable row height meant a row with a port
     * name pushed the one under it and the list stopped lining up. */
    var rowH = 32, total = 0, contraT = 0, y = hy + 10;
    if (!held.length) {
      ctx.save();
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('HOLD EMPTY', pad + 16, y + 20);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(s.cargoCap + ' tonnes available.', pad + 16, y + 40);
      ctx.restore();
    }
    for (var i = 0; i < held.length; i++) {
      if (y + rowH > top + pad + colH - 10) {
        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = MFD_DIM;
        ctx.fillText('+' + (held.length - i) + ' more', pad + 16,
                     top + pad + colH - 14);
        ctx.restore();
        break;
      }
      var it = held[i];
      var row = Eco.BY_ID[it.cid];
      var illegal = !!(row && row.contraband);
      var due = owed[it.cid] || 0;
      if (illegal) contraT += it.tonnes;

      /* The status word is the whole point of the page, so it is the only
       * thing on the row allowed a colour of its own. */
      var status = 'free to sell', ink = MFD_DIM;
      if (illegal) { status = 'CONTRABAND'; ink = '#ff8a76'; }
      else if (due >= it.tonnes) { status = 'CONTRACT'; ink = '#ffd36b'; }
      else if (due > 0) { status = due + ' t on contract'; ink = '#ffd36b'; }

      var mk = port ? Eco.price(port, it.cid, G.t) : null;
      var worth = null, where = null;
      if (mk && mk.sell !== null) worth = mk.sell * it.tonnes;
      else if (!port) {
        var b2 = bestMarketFor(it.cid);
        if (b2) { worth = b2.sell * it.tonnes; where = b2.port.name; }
      }
      if (worth !== null && !illegal) total += worth;

      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = it.cid === 'waste' ? '#ffb86b' : MFD_INK;
      ctx.fillText(clipText(it.name, nameChars), cName, y + 15);
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = ink;
      ctx.fillText(status, cStat, y + 15);
      ctx.textAlign = 'right';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = MFD_INK;
      ctx.fillText(it.tonnes.toFixed(it.tonnes < 1 ? 2 : 0) + ' t', cTon, y + 15);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(worth !== null ? fmtCredits(worth) : '—', cVal, y + 15);
      if (where) {
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillStyle = MFD_DIM;
        ctx.fillText(clipText(where, 20), cVal, y + 26);
      }
      ctx.textAlign = 'left';
      ctx.restore();
      y += rowH;
    }

    /* --- contracts and the totals, right --- */
    var rx = pad * 2 + leftW, rw = w - rx - pad;
    var conH = colH * 0.62;
    panelBox(ctx, rx, top + pad, rw, conH, 'WHAT IS SPOKEN FOR');

    var list = G.missions || [];
    var cy2 = top + pad + 46;
    if (!list.length) {
      ctx.save();
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      /* Clipped to the panel it is drawn in, in characters, because this
       * panel is whatever the window leaves it and the sentence is not. */
      ctx.fillText(clipText('No contracts signed. Everything aboard is yours.',
                            Math.max(8, Math.floor((rw - 32) / 6.71))),
                   rx + 16, cy2 + 6);
      ctx.restore();
    }
    for (var c = 0; c < list.length; c++) {
      if (cy2 + 34 > top + pad + conH - 8) break;
      var m = list[c];
      var left = m.deadline - G.t;
      var late = left <= 0;
      ctx.save();
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = late ? '#ff8a76' : MFD_INK;
      ctx.fillText(clipText((m.tonnes || 0) + ' t ' + (m.cid || '—'), 26),
                   rx + 16, cy2 + 6);
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      var dst = m.to && G.sys.byId[m.to] ? G.sys.byId[m.to].name : (m.toName || '—');
      ctx.fillText(clipText('to ' + dst, 30), rx + 16, cy2 + 20);
      ctx.textAlign = 'right';
      ctx.fillStyle = late ? '#ff8a76' : (left < 86400 ? '#ffd36b' : MFD_DIM);
      ctx.fillText(late ? 'OVERDUE' : fmtTime(left) + ' left', rx + rw - 16, cy2 + 6);
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(fmtCredits(m.pay || 0), rx + rw - 16, cy2 + 20);
      ctx.textAlign = 'left';
      ctx.restore();
      cy2 += 34;
    }

    var sy2 = top + pad + conH + pad;
    var sh = top + pad + colH - sy2;
    panelBox(ctx, rx, sy2, rw, sh, 'TOTALS');
    var used = 0;
    for (var u = 0; u < held.length; u++) used += held[u].tonnes;
    var lines = [
      ['Hold', used.toFixed(used < 1 ? 2 : 0) + ' / ' + s.cargoCap + ' t'],
      ['Credits', fmtCredits(s.credits)],
      [port ? 'Worth here' : 'Best in system', fmtCredits(total)]
    ];
    if (contraT > 0) lines.push(['Contraband aboard', contraT.toFixed(0) + ' t']);
    /* A LIEN IS NEWS. Every sale on this screen is about to be shaved by
     * 20% and the player is entitled to know that before they wonder why
     * the arithmetic is wrong. */
    var owedLien = Combat.lienOwed(G);
    if (owedLien > 0) lines.push(['LIEN', fmtCredits(owedLien) + ' owed']);
    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    for (var L = 0; L < lines.length; L++) {
      var ly = sy2 + 46 + L * 18;
      if (ly > sy2 + sh - 8) break;
      var warn = lines[L][0] === 'Contraband aboard' || lines[L][0] === 'LIEN';
      ctx.fillStyle = warn ? '#ff8a76' : MFD_DIM;
      ctx.fillText(lines[L][0], rx + 16, ly);
      ctx.textAlign = 'right';
      ctx.fillStyle = warn ? '#ff8a76' : MFD_INK;
      ctx.fillText(lines[L][1], rx + rw - 16, ly);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  /* The framed box every panel on these pages is drawn inside. Was copied
   * three times before this existed. */
  function panelBox(ctx, x, y, w, h, title) {
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(x + 4, y + 4, w - 8, 19);
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(title, x + 10, y + 18);
    ctx.restore();
  }

  /* --- Shift+F3: the planetary scanner ------------------------------------
   * The survey and the magnetometer, at the size they deserve. A flattened
   * map of the world, 1 degree to the cell: X is scan longitude (degrees,
   * counted the way the ship's track sweeps, so new columns arrive left to
   * right as the planet turns beneath a polar orbit), Y is latitude.
   * RESOURCES paints what the scanner has read, brighter where richer;
   * MAGNETIC paints the field the magnetometer has read, with the dipole's
   * field lines over it. Nothing is drawn for ground nobody has flown, and
   * nothing is listed that the fitted scanner cannot read: the list is gated
   * by the same class coverage the SURVEY page uses. */
  var SCAN_INK = { ores: '#d9854a', rare: '#ffd36b', fissile: '#9dff5a',
                   water: '#5fb4ff', hydrogen: '#c9a6ff' };
  var SCAN_FILTERS = [null, 'ores', 'water', 'hydrogen', 'fissile', 'rare'];
  var MAG_STOPS = [[0, 16, 20, 58], [0.25, 42, 79, 168], [0.5, 47, 179, 160],
                   [0.75, 232, 216, 74], [1, 255, 122, 74]];
  var SCAN_STYLES = ['RADAR', 'HUES', 'BANDS'];
  var RADAR_STOPS = [[0, 12, 70, 90], [0.12, 30, 170, 110], [0.28, 90, 220, 60], [0.42, 240, 230, 50],
                     [0.58, 255, 160, 30], [0.74, 240, 50, 40], [0.88, 220, 40, 200], [1, 255, 230, 255]];
  var scanCanvas = null, scanSig = '', scanDepSig = '', scanDepList = [];
  function rampOf(stops, f) {
    f = Math.max(0, Math.min(1, f));
    for (var i = 1; i < stops.length; i++) {
      if (f <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i], u = (f - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
      }
    }
    var z = stops[stops.length - 1];
    return [z[1], z[2], z[3]];
  }
  /* LEGIBLE OVER ANY COLOUR THE MAP USES (Astra, 2026-11-19: the selected
   * point, the grid lines and the font "need to be dynamically chosen to be
   * visible on the scanner display in any of the colors it uses").
   *
   * The map runs from near-black teal through green, yellow and red to a
   * white-hot magenta, so no single ink reads on all of it: yellow vanishes
   * on yellow, white on the hot end, the dim blue grid on everything. So
   * every mark over the map is drawn twice, the way map labels are - a dark
   * halo first, then its own colour on top. Over a dark cell the light line
   * carries it; over a bright one the dark halo does. That is "chosen for
   * the colour under it" without reading a pixel back, and it cannot pick
   * wrong, because both answers are always there. */
  function scanHalo(ctx, path, col, w, haloA) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(2,8,12,' + (haloA == null ? 0.85 : haloA) + ')';
    ctx.lineWidth = w + 2.5;
    ctx.beginPath(); path(); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath(); path(); ctx.stroke();
    ctx.restore();
  }
  function scanText(ctx, s, x, y, col) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(2,8,12,0.9)';
    ctx.lineWidth = 3.5;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = col;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  /* The five pictographs: what a cell holds, drawn small enough to sit on
   * the map and legible when it does. Each is a path, not a font glyph, so
   * it draws the same everywhere. */
  function scanGlyph(ctx, cid, x, y, s, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    function ring() { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,8,12,0.9)'; ctx.stroke(); }
    ctx.fillStyle = col;
    if (cid === 'ores') {                         // a lump of rock, faceted
      ctx.beginPath();
      ctx.moveTo(-s, s * 0.35); ctx.lineTo(-s * 0.7, -s * 0.5); ctx.lineTo(-s * 0.1, -s * 0.9);
      ctx.lineTo(s * 0.7, -s * 0.55); ctx.lineTo(s, s * 0.3); ctx.lineTo(s * 0.3, s * 0.85); ctx.lineTo(-s * 0.55, s * 0.8);
      ctx.closePath(); ring(); ctx.fill();
      ctx.strokeStyle = 'rgba(2,8,12,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.9); ctx.lineTo(-s * 0.15, s * 0.1); ctx.lineTo(s, s * 0.3);
      ctx.moveTo(-s * 0.15, s * 0.1); ctx.lineTo(-s * 0.55, s * 0.8); ctx.stroke();
    } else if (cid === 'rare') {                  // a cut gem
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, -s * 0.75); ctx.lineTo(s * 0.55, -s * 0.75); ctx.lineTo(s, -s * 0.15);
      ctx.lineTo(0, s); ctx.lineTo(-s, -s * 0.15); ctx.closePath(); ring(); ctx.fill();
      ctx.strokeStyle = 'rgba(2,8,12,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-s, -s * 0.15); ctx.lineTo(s, -s * 0.15);
      ctx.moveTo(-s * 0.3, -s * 0.15); ctx.lineTo(0, s); ctx.moveTo(s * 0.3, -s * 0.15); ctx.lineTo(0, s);
      ctx.moveTo(-s * 0.3, -s * 0.15); ctx.lineTo(-s * 0.55, -s * 0.75); ctx.moveTo(s * 0.3, -s * 0.15); ctx.lineTo(s * 0.55, -s * 0.75);
      ctx.stroke();
    } else if (cid === 'fissile') {               // the radiation trefoil
      for (var k = 0; k < 3; k++) {
        var a0 = -Math.PI / 2 + k * 2 * Math.PI / 3 - Math.PI / 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s, a0, a0 + Math.PI / 3); ctx.closePath();
        ring(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 6.2832); ring(); ctx.fill();
    } else if (cid === 'water') {                 // a drop
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.95, s * 0.1, s * 0.62, s * 0.55);
      ctx.quadraticCurveTo(0, s * 1.1, -s * 0.62, s * 0.55);
      ctx.quadraticCurveTo(-s * 0.95, s * 0.1, 0, -s);
      ctx.closePath(); ring(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(-s * 0.25, s * 0.3, s * 0.18, 0, 6.2832); ctx.fill();
    } else {                                      // hydrogen: an atom
      ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, 6.2832); ring(); ctx.fill();
      ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(2,8,12,0.9)';
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.42, -0.5, 0, 6.2832); ctx.stroke();
      ctx.lineWidth = 1.4; ctx.strokeStyle = col; ctx.stroke();
    }
    ctx.restore();
  }

  function scanUI() {
    if (!G.scanUI) G.scanUI = { layer: 'res', filter: 0, lines: true, style: 0, sweep: 1, zoom: 0, plane: 'xy' };
    return G.scanUI;
  }
  function magRamp(f) {
    f = Math.max(0, Math.min(1, f));
    for (var i = 1; i < MAG_STOPS.length; i++) {
      if (f <= MAG_STOPS[i][0]) {
        var a = MAG_STOPS[i - 1], b = MAG_STOPS[i], u = (f - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
      }
    }
    var z = MAG_STOPS[MAG_STOPS.length - 1];
    return [z[1], z[2], z[3]];
  }
  function hexRGB(h) {
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }
  /* Which world, and its record: the one locked, else the one being
   * surveyed - the SURVEY page's rule. */
  function scannerTarget() {
    var Sv = global.Survey;
    var here = (G.here && G.here.id) || 'sys';
    var key = null;
    if (G.navTarget && G.navTarget.kind === 'body') {
      var nb = G.sys.byId[G.navTarget.id];
      if (nb && (nb.kind === 'planet' || nb.kind === 'moon')) key = here + ':' + nb.id;
    }
    key = key || G._surveyNow;
    if (!key) return null;
    var tgt = Sv.targetFor(G.sys, { key: key });
    if (!tgt || !tgt.kind) return null;
    return { key: key, body: tgt, rec: G.surveys ? G.surveys[key] : null };
  }
  /* The map's X for a cell column. A world that turns the usual way slides
   * west under the ship, so its columns are counted from the east end to
   * put the newest on the right. */
  function scanFlip(body) { return !!(body.rotation && body.rotation.period > 0); }
  function scanX(lo, flip, nLon) { return flip ? nLon - 1 - lo : lo; }

  /* The picture of the world, one pixel a cell, rebuilt only when what it
   * shows has changed. Three ways to colour what the scanner has read:
   * RADAR (a continuous weather-radar ramp on how rich the ground is; the
   * pictographs say what it is), HUES (one colour a commodity, as before),
   * BANDS (the radar ramp in seven steps, like a contour map). */
  function scanPicture(Sv, T, ui, lvl, hasMag) {
    var rec = T.rec, body = T.body, nLon = Sv.LON_BINS, nLat = Sv.LAT_BINS;
    var sig = [T.key, ui.layer, ui.filter, ui.style, rec ? rec.cov : 0, rec ? rec.covM : 0,
               rec ? rec.t : 0, lvl, hasMag ? 1 : 0].join('|');
    if (scanCanvas && sig === scanSig) return scanCanvas;
    scanSig = sig;
    if (!scanCanvas) {
      scanCanvas = document.createElement('canvas');
      scanCanvas.width = nLon; scanCanvas.height = nLat;
    }
    var c = scanCanvas.getContext('2d');
    var img = c.createImageData(nLon, nLat), d = img.data;
    var flip = scanFlip(body), style = ui.style | 0;
    var cells = rec ? Sv.cellsOf(rec) : null;
    var cellsM = rec ? Sv.cellsOf(rec, 'cellsM') : null;
    var gm = Sv.groundMap(body, G.sys), mm = Sv.magMap(body, G.sys);
    var Eco = global.Economy, fcid = SCAN_FILTERS[ui.filter];
    var base = {};
    Sv.CIDS.forEach(function (cid) {
      base[cid] = Eco && Eco.BY_ID && Eco.BY_ID[cid] ? Eco.BY_ID[cid].base : 1;
    });
    var showRes = ui.layer !== 'mag', showMag = ui.layer !== 'res';
    var fmax = mm && mm.max > 0 ? mm.max : 1;
    /* RADAR and BANDS colour each commodity by how far a cell stands above
     * that commodity's TYPICAL ground on this world (the median), up to its
     * best: the way a radar ramp is set to the storm and not the sky. A world
     * that is wet everywhere is then quiet where it is merely wet and lights
     * up only at the hotspots. A narrow spread is held at 0.25 so a uniformly
     * poor commodity is not blown up into a rich one. */
    var lo_ = {}, span_ = {};
    if (style !== 1 && gm) {
      Sv.CIDS.forEach(function (cid) {
        var ga = gm.grade[cid];
        if (!ga) return;
        var vals = [];
        for (var q = 0; q < ga.length; q++) if (ga[q] >= 0.1) vals.push(ga[q]);
        if (!vals.length) { lo_[cid] = 0; span_[cid] = 1; return; }
        vals.sort(function (x, y) { return x - y; });
        var med = vals[vals.length >> 1], mx = vals[vals.length - 1];
        lo_[cid] = med; span_[cid] = Math.max(mx - med, 0.25);
      });
    }
    for (var la = 0; la < nLat; la++) {
      for (var lo = 0; lo < nLon; lo++) {
        var ci = la * nLon + lo;
        var px = ((nLat - 1 - la) * nLon + scanX(lo, flip, nLon)) * 4;
        var r = 7, g = 14, b = 20;
        if ((la + lo) % 2 === 0) { r = 8; g = 16; b = 22; }       // faint checker: unflown ground
        if (showMag && cellsM && cellsM[ci] && mm) {
          var m = rampOf(MAG_STOPS, mm.field[ci] / fmax);
          var k = ui.layer === 'both' ? 0.55 : 1;
          r = m[0] * k + r * (1 - k); g = m[1] * k + g * (1 - k); b = m[2] * k + b * (1 - k);
        }
        if (showRes && cells && cells[ci] && gm) {
          var best = null, bw = 0, bg = 0;
          for (var i = 0; i < Sv.CIDS.length; i++) {
            var cid = Sv.CIDS[i];
            if (fcid && cid !== fcid) continue;
            var ga = gm.grade[cid];
            if (!ga) continue;
            var gr = ga[ci];
            if (gr < (fcid ? 0.02 : 0.1) || !Sv.cellRead(rec, cid, ci)) continue;
            var w = gr * base[cid];
            if (w > bw) { bw = w; best = cid; bg = gr; }
          }
          if (best) {
            var col, al;
            if (style === 1) {
              col = hexRGB(SCAN_INK[best] || '#7dffb0');
              al = 0.25 + 0.75 * Math.min(1, bg / 0.8);
            } else {
              var v = Math.max(0, Math.min(1, (bg - lo_[best]) / span_[best]));
              if (style === 2) v = (Math.min(6, Math.floor(v * 7)) + 0.5) / 7;
              col = rampOf(RADAR_STOPS, v);
              al = 0.94;
            }
            r = col[0] * al + r * (1 - al); g = col[1] * al + g * (1 - al); b = col[2] * al + b * (1 - al);
          } else if (!fcid && ui.layer === 'res') {
            r = 22; g = 52; b = 66;                                 // flown, nothing worth digging
          }
        }
        d[px] = r; d[px + 1] = g; d[px + 2] = b; d[px + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    return scanCanvas;
  }

  /* The richest places the fitted scanner has read, one per neighbourhood. */
  function scanDeposits(Sv, T, lvl) {
    var rec = T.rec, body = T.body, gm = Sv.groundMap(body, G.sys);
    if (!rec || !gm) return [];
    var nLon = Sv.LON_BINS, nLat = Sv.LAT_BINS, out = [];
    var tot = {};
    Sv.remaining(G, T.key, Sv.deposits(body, G.sys)).forEach(function (r) { tot[r.cid] = r; });
    var arr = Sv.arrayCov ? Sv.arrayCov(rec) : 0;
    Sv.CIDS.forEach(function (cid) {
      var ga = gm.grade[cid];
      if (!ga || !Sv.readable(rec, cid)) return;
      var sum = 0, cand = [];
      for (var i = 0; i < Sv.NCELL; i++) {
        if (ga[i] > 0.005) sum += ga[i];
        if (ga[i] >= 0.2 && Sv.cellRead(rec, cid, i)) cand.push(i);
      }
      cand.sort(function (a, b) { return ga[b] - ga[a]; });
      var picked = [];
      for (var k = 0; k < cand.length && picked.length < 4; k++) {
        var c = cand[k], cla = Math.floor(c / nLon), clo = c % nLon, near = false;
        for (var p = 0; p < picked.length && !near; p++) {
          var dl = Math.abs(cla - picked[p].la);
          var dn = Math.abs(clo - picked[p].lo); dn = Math.min(dn, nLon - dn);
          if (dl < 10 && dn < 14) near = true;
        }
        if (near) continue;
        /* A deposit's share of the world's stock: the grade within its
         * neighbourhood over the grade everywhere. An estimate, and
         * labelled so. */
        var local = 0;
        for (var a = -6; a <= 6; a++) {
          for (var bq = -8; bq <= 8; bq++) {
            var l2 = cla + a, o2 = (clo + bq + nLon) % nLon;
            if (l2 < 0 || l2 >= nLat) continue;
            local += ga[l2 * nLon + o2];
          }
        }
        var t = tot[cid] ? tot[cid].tonnes : 0;
        picked.push({ cid: cid, cell: c, la: cla, lo: clo, grade: ga[c],
                      tonnes: sum > 0 && isFinite(t) ? t * Math.min(1, local / sum) : t });
      }
      picked.forEach(function (p) { out.push(p); });
    });
    out.sort(function (a, b) { return b.grade - a.grade; });
    out.arr = arr;
    return out;
  }

  /* The list is not cheap (every commodity over every cell), so it is made
   * again only when the survey has changed. */
  function scanDeps(Sv, T, lvl) {
    var rec = T.rec;
    var sig = [T.key, rec ? rec.cov : 0, rec ? rec.t : 0, lvl].join('|');
    if (sig !== scanDepSig) { scanDepSig = sig; scanDepList = lvl && rec ? scanDeposits(Sv, T, lvl) : []; }
    return scanDepList;
  }

  function scanShipCell(Sv, body) {
    var s = G.ship;
    if (!s || !Sv.cellOfWorld) return null;
    if (s.landed && s.landedAt && s.landedAt.body === body.id) return Sv.cellOfLatLon(s.landedAt.lat, s.landedAt.lon);
    var bp = Sim.bodyPosition(body, G.sys, G.t);
    var rel = V.sub(s.pos, bp), r = V.len(rel);
    if (!(r > 0) || r > body.radius * Sv.RANGE_R * 1.5) return null;
    return Sv.cellOfWorld(body, V.scale(rel, 1 / r), G.t);
  }

  var SWEEPS = ['FIXED', 'TRACK', 'FOLLOW'];
  var ZOOMS = [1, 2, 4, 8];
  /* The viewport on the flattened world, in DISPLAY columns (scan longitude,
   * already flipped for the world's spin) and DISPLAY rows (0 at the north
   * pole). Longitude wraps, latitude does not. */
  function scanView(Sv, ui, shipDisp) {
    var nLon = Sv.LON_BINS, nLat = Sv.LAT_BINS;
    var z = ZOOMS[ui.zoom | 0] || 1;
    var vc = nLon / z, vr = nLat / z;
    var cx, cy;
    if (ui.sweep === 2 && shipDisp) { cx = shipDisp.col + 0.5; cy = shipDisp.row + 0.5; }
    else if (z === 1) { cx = nLon / 2; cy = nLat / 2; }
    else { cx = ui.cx === undefined ? nLon / 2 : ui.cx; cy = ui.cy === undefined ? nLat / 2 : ui.cy; }
    cy = Math.max(vr / 2, Math.min(nLat - vr / 2, cy));
    var col0 = ((cx - vc / 2) % nLon + nLon) % nLon;
    return { z: z, vc: vc, vr: vr, col0: col0, row0: cy - vr / 2, nLon: nLon, nLat: nLat };
  }
  /* Where a display column lands on screen, taking the short way round. */
  function scanSX(vw, mapX, mapW, dc) {
    var dx = ((dc - vw.col0) % vw.nLon + vw.nLon) % vw.nLon;
    /* Past the right edge by more than half the hidden part: it is nearer
     * to (just off) the left. The old test, dx > nLon - vc, was dx > 0 at
     * 1x, which threw every column but the first off the map: no deposit
     * glyphs, no meridians, no field lines at 1x (found 2026-11-22 when the
     * magnetic highs would not draw). */
    if (dx > vw.vc + (vw.nLon - vw.vc) / 2) dx -= vw.nLon;
    return mapX + dx * (mapW / vw.vc);
  }
  function scanSY(vw, mapY, mapH, dr) { return mapY + (dr - vw.row0) * (mapH / vw.vr); }


  /* ---- THE GRAVITY SLICE (2026-11-12) ------------------------------------
   * Astra: "the spectrographic scanner should map the gravity well too;
   * please model this as an XY / YZ / ZX selectable planar slice through the
   * center of the planet... Regions of higher gravity would correspond to
   * minerals that aren't detectable by your level 2 scanner as well as just
   * the planet's mass."
   *
   * A fourth layer on the planetary scanner rather than a page of its own,
   * because it IS a planetary scan - same target, same header, same panel.
   * What it cannot share is the projection: the other layers are a lat/lon
   * map of the surface and this is a cut through the middle, so it draws a
   * disc where they draw a rectangle.
   *
   * TWO PICTURES AT ONCE, and they need different scales. The well spans
   * zero at the centre to g at the surface; an ore body is a few hundred
   * milligals on top of that, which is about a thousandth of it. Drawn on
   * one scale the anomalies are invisible - so the well is the ground, in
   * blues, and the anomaly rides over it in heat, normalised to its own
   * maximum. That is how a real gravity map is published, and for the same
   * reason.
   */
  var GRAV_CACHE = null;

  /* Blue for the well: dark at the centre where g falls to nothing. */
  function gravWellInk(f) {
    f = Math.max(0, Math.min(1, f));
    var r = Math.round(10 + 40 * f), g2 = Math.round(22 + 110 * f), b = Math.round(38 + 150 * f);
    return [r, g2, b];
  }

  /* Build (or reuse) the slice bitmap. Keyed so panning and turning the
   * page does not recompute a field that has not changed. */
  function gravBitmap(body, sys, plane, lvl, px) {
    var Gr = global.Gravity;
    if (!Gr || !Gr.slice) return null;
    var sig = [body.id, sys && sys.seedTag, plane, lvl, px].join('|');
    if (GRAV_CACHE && GRAV_CACHE.sig === sig) return GRAV_CACHE;
    var sl = Gr.slice(body, sys, plane, lvl);
    if (!sl) return null;

    var cvs = global.document ? global.document.createElement('canvas') : null;
    if (!cvs) return null;
    cvs.width = px; cvs.height = px;
    var c2 = cvs.getContext('2d');
    var img = c2.createImageData(px, px);
    var d = img.data, n = sl.n;
    /* The well's own range, so a small dense world is not all one colour. */
    var gLo = Infinity, gHi = 0, aHi = 0;
    for (var i = 0; i < n * n; i++) {
      if (isNaN(sl.g[i])) continue;
      if (sl.g[i] < gLo) gLo = sl.g[i];
      if (sl.g[i] > gHi) gHi = sl.g[i];
      if (sl.anom[i] > aHi) aHi = sl.anom[i];
    }
    if (!(gHi > gLo)) { gLo = 0; gHi = 1; }

    /* ANOMALY MEANS LATERAL VARIATION, not the raw sum of what every body
     * pulls. Drawn raw, the middle of the disc came out a warm brown: deep
     * inside a world every ore body is about equally far away, so they add
     * to a smooth bowl that has nothing to do with where the ore IS - and
     * it reads as something enormous in the core. A field survey subtracts
     * a reference for exactly this reason. Here the reference is the mean
     * at each radius, so what is left is the part that varies AROUND the
     * world at that depth, which is the part that points at a lump. */
    var RB = 48, rSum = new Float64Array(RB), rN = new Float64Array(RB);
    for (var ry = 0; ry < n; ry++) {
      for (var rx = 0; rx < n; rx++) {
        var ri = ry * n + rx;
        if (isNaN(sl.g[ri])) continue;
        var ru = (rx + 0.5) / n * 2 - 1, rv = (ry + 0.5) / n * 2 - 1;
        var rb = Math.min(RB - 1, Math.floor(Math.sqrt(ru * ru + rv * rv) * RB));
        rSum[rb] += sl.anom[ri]; rN[rb]++;
      }
    }
    var lat = new Float64Array(n * n);
    aHi = 0;
    for (ry = 0; ry < n; ry++) {
      for (rx = 0; rx < n; rx++) {
        ri = ry * n + rx;
        if (isNaN(sl.g[ri])) { lat[ri] = 0; continue; }
        ru = (rx + 0.5) / n * 2 - 1; rv = (ry + 0.5) / n * 2 - 1;
        rb = Math.min(RB - 1, Math.floor(Math.sqrt(ru * ru + rv * rv) * RB));
        var ref = rN[rb] > 0 ? rSum[rb] / rN[rb] : 0;
        /* SIGNED (planetary interiors slice 2): a low - buried ice, salt,
         * mass that is not there - is kept, not clipped to nothing, and
         * drawn cold below. Both scaled to the larger of the two. */
        lat[ri] = sl.anom[ri] - ref;
        if (Math.abs(lat[ri]) > aHi) aHi = Math.abs(lat[ri]);
      }
    }

    for (var y = 0; y < px; y++) {
      for (var x = 0; x < px; x++) {
        var sxp = Math.min(n - 1, Math.floor(x / px * n));
        var syp = Math.min(n - 1, Math.floor(y / px * n));
        var k = syp * n + sxp, o = (y * px + x) * 4;
        if (isNaN(sl.g[k])) { d[o + 3] = 0; continue; }
        var ink = gravWellInk((sl.g[k] - gLo) / (gHi - gLo));
        /* The anomaly, on its own scale, added as heat. */
        var sa = aHi > 0 ? lat[k] / aHi : 0;
        var a = Math.pow(Math.max(0, sa), 0.6);
        /* A low goes cold: violet into the blue, the well darkened under
         * it - the opposite of the warm heat a dense body raises. */
        var lo = Math.pow(Math.max(0, -sa), 0.6);
        d[o]     = Math.max(0, Math.min(255, ink[0] + Math.round(230 * a) + Math.round(70 * lo)));
        d[o + 1] = Math.max(0, Math.min(255, ink[1] + Math.round(150 * a * a) - Math.round(90 * lo)));
        d[o + 2] = Math.max(0, Math.min(255, ink[2] - Math.round(60 * a) + Math.round(110 * lo)));
        d[o + 3] = 255;
      }
    }
    c2.putImageData(img, 0, 0);
    GRAV_CACHE = { sig: sig, canvas: cvs, slice: sl, gLo: gLo, gHi: gHi, aHi: aHi };
    return GRAV_CACHE;
  }

  /* The slice, its marks and its legend. Returns false when there is no
   * instrument or no world, having said which. */
  function drawGravityLayer(ctx, w, top, bottom, T) {
    var Gr = global.Gravity, Cb = global.Combat;
    var ui = scanUI();
    var lvl = Cb && Cb.gravLevel ? Cb.gravLevel(G.ship) : 0;
    ctx.save();
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#5d8fa4';
    if (!lvl) {
      ctx.fillText('NO GRAVIMETER FITTED — it is the one instrument that reads through rock.', 16, top + 36);
      ctx.fillText('A spectrometer sees the surface. Gravity does not care how deep a thing is buried.', 16, top + 56);
      ctx.fillText('Yards sell a grade 1 where development is 0.20 or better.', 16, top + 76);
      ctx.restore();
      return true;
    }
    if (!T || !T.body) {
      ctx.fillText('Lock a world, or orbit one.', 16, top + 36);
      ctx.restore();
      return true;
    }
    ctx.restore();

    var body = T.body, sys = G.sys;
    var plane = ui.plane || 'xy';
    var res = Gr.RES[lvl] || Gr.RES[1];
    var svl = global.Survey && global.Survey.level ? global.Survey.level(G.ship) : 0;

    /* Geometry: the disc on the left, the contacts on the right. */
    var panelW = 330, pad = 14;
    var discY = top + 62;
    /* Room under it for the legend AND the layer buttons: the first cut
     * took every pixel down to `bottom - 40` and printed the legend
     * straight through the button row. */
    var disc = Math.max(240, Math.min(w - panelW - pad * 3 - 44, bottom - discY - 78));
    var discX = 44;
    var bm = gravBitmap(body, sys, plane, lvl, Math.min(512, Math.max(128, Math.round(disc))));

    /* header */
    ctx.save();
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText((body.name || '?').toUpperCase() + '  —  GRAVITY', discX, top + 26);
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    var kitName = ['', 'GRAVIMETER', 'GRADIOMETER', 'CRYOGENIC', 'ATOM INTERFEROMETER'][lvl] || '';
    ctx.fillText('GRADE ' + lvl + ' ' + kitName + '   ·   reads to ' + res.mgal + ' mGal' +
                 '   ·   resolves ' + Math.round(res.blur * 100) + '% of a radius',
                 discX, top + 44);
    ctx.restore();

    if (!bm) {
      ctx.save();
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = '#5d8fa4';
      ctx.fillText('This body has no interior to cut.', discX, discY + 20);
      ctx.restore();
      return true;
    }
    var sl = bm.slice;

    /* THE DISC */
    ctx.save();
    ctx.fillStyle = '#02060a';
    ctx.fillRect(discX, discY, disc, disc);
    ctx.drawImage(bm.canvas, discX, discY, disc, disc);
    /* The limb, and the core boundary the profile was built on. */
    var cxm = discX + disc / 2, cym = discY + disc / 2, Rpx = disc / 2;
    ctx.strokeStyle = 'rgba(127,214,255,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cxm, cym, Rpx, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,214,120,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(cxm, cym, Rpx * sl.core, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    /* Where g is strongest - the thing a slice is for. */
    if (sl.peak && sl.peak.x < 0.995) {
      ctx.strokeStyle = 'rgba(180,240,255,0.30)';
      ctx.beginPath(); ctx.arc(cxm, cym, Rpx * sl.peak.x, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    /* THE AXES, as arrows rather than words (Astra prefers pointers). */
    var AX = { xy: ['X', 'Y'], yz: ['Y', 'Z'], zx: ['Z', 'X'] }[plane] || ['X', 'Y'];
    ctx.save();
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = '#5d8fa4';
    ctx.fillText('→ ' + AX[0], discX + disc - 34, discY + disc / 2 - 6);
    ctx.fillText('↑ ' + AX[1], discX + disc / 2 + 6, discY + 14);
    ctx.restore();

    /* THE CONTACTS, placed where they actually are on this cut. One that
     * lies well off the plane is drawn faint: the slice is barely cutting
     * it, and saying so is more honest than pretending it is here. */
    var contacts = Gr.contacts(body, sys, lvl, svl);
    var ax = Gr.PLANE_AXES[plane] || Gr.PLANE_AXES.xy;
    ctx.save();
    for (var ci = 0; ci < contacts.length; ci++) {
      var c = contacts[ci];
      var v = [Math.cos(c.lat) * Math.cos(c.lon), Math.cos(c.lat) * Math.sin(c.lon), Math.sin(c.lat)];
      var depth = c.depthKm != null ? c.depthKm : 2;
      var rr = Math.max(0.05, 1 - (depth + (c.radKm || 10)) / (sl.R || 1));
      var off = Math.abs(v[ax[2]]);
      var mx = cxm + v[ax[0]] * rr * Rpx, my = cym - v[ax[1]] * rr * Rpx;
      var a2 = Math.max(0.12, 1 - off * 1.35);
      var hot2 = !c.explained;
      /* A dark ring under the bright one: most contacts sit near the limb,
       * which is the brightest part of the picture, and a thin warm circle
       * drawn straight onto it disappeared. */
      ctx.strokeStyle = 'rgba(0,0,0,' + (a2 * 0.75).toFixed(2) + ')';
      ctx.lineWidth = hot2 ? 4.5 : 3.5;
      ctx.beginPath(); ctx.arc(mx, my, hot2 ? 7 : 5, 0, Math.PI * 2); ctx.stroke();
      /* A low (slice 2) rings cold, as it is drawn cold on the disc. */
      ctx.strokeStyle = c.low ? 'rgba(176,156,255,' + a2.toFixed(2) + ')'
                      : hot2 ? 'rgba(255,186,110,' + a2.toFixed(2) + ')'
                             : 'rgba(190,225,245,' + (a2 * 0.85).toFixed(2) + ')';
      ctx.lineWidth = hot2 ? 2.2 : 1.5;
      ctx.beginPath(); ctx.arc(mx, my, hot2 ? 7 : 5, 0, Math.PI * 2); ctx.stroke();
      if (hot2) {
        ctx.beginPath(); ctx.moveTo(mx - 11, my); ctx.lineTo(mx - 8, my);
        ctx.moveTo(mx + 8, my); ctx.lineTo(mx + 11, my); ctx.stroke();
      }
    }
    ctx.restore();

    /* THE LEGEND under the disc. */
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    var ly2 = discY + disc + 15;
    ctx.fillText('surface ' + sl.gSurf.toFixed(2) + ' m/s²   ·   peak ' + sl.peak.g.toFixed(2) +
                 ' at ' + Math.round(sl.peak.x * 100) + '% of the radius   ·   core boundary ' +
                 Math.round(sl.core * 100) + '%   ·   g is zero at the centre: only what is BELOW you pulls',
                 discX, ly2);
    ctx.restore();

    /* ---- THE PANEL: the plane, and what was found ---- */
    var pxl = discX + disc + pad * 2, pw2 = Math.max(220, w - pxl - pad);
    var py2 = discY;
    ctx.save();
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText('SLICE', pxl, py2);
    ctx.restore();
    var bx2 = pxl, by2 = py2 + 8;
    ['xy', 'yz', 'zx'].forEach(function (p) {
      btn(ctx, bx2, by2, 52, 22, p.toUpperCase(),
          function () { scanUI().plane = p; }, { hot: plane === p, bold: true, font: 10 });
      bx2 += 56;
    });

    var cy2 = by2 + 38;
    ctx.save();
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    var nUn = contacts.filter(function (c) { return !c.explained; }).length;
    ctx.fillText(contacts.length + ' MASS' + (contacts.length === 1 ? '' : 'ES') +
                 '   ·   ' + nUn + ' UNEXPLAINED', pxl, cy2);
    ctx.restore();
    cy2 += 8;

    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    for (var q = 0; q < contacts.length && cy2 < bottom - 56; q++) {
      var cc = contacts[q];
      cy2 += 15;
      ctx.fillStyle = cc.explained ? MFD_DIM : '#ffb978';
      var head = (cc.explained ? '  ' : '! ') +
                 /* Ice and salt are "buried" like any body no spectrometer
                  * sees: the reading says low, the name is the player's
                  * to put on it (Astra's decision 2). */
                 (cc.kind === 'buried' || cc.kind === 'ice' || cc.kind === 'salt' ? 'buried'
                  : cc.kind === 'fissile' ? 'hotspot' : 'province');
      ctx.fillText(head, pxl, cy2);
      ctx.fillStyle = cc.explained ? 'rgba(140,170,195,0.8)' : '#e8d8b8';
      var line = Gr.describe(cc);
      while (line.length > 4 && ctx.measureText && ctx.measureText(line).width > pw2 - 74) line = line.slice(0, -2) + '…';
      ctx.fillText(line, pxl + 74, cy2);
      /* What it would take to get at it. */
      if (cc.reach && cy2 < bottom - 70) {
        cy2 += 12;
        ctx.fillStyle = cc.reach === 'drone' ? 'rgba(125,255,176,0.75)'
                      : cc.reach === 'drill' ? 'rgba(255,214,120,0.75)'
                      : 'rgba(255,110,110,0.70)';
        ctx.fillText(cc.reach === 'drone' ? '   a drone can reach it'
                   : cc.reach === 'drill' ? '   needs a drilling team'
                   : '   too deep for anything you have', pxl + 74, cy2);
      }
    }
    if (!contacts.length) {
      ctx.fillStyle = MFD_DIM;
      /* A giant (slice 2) has no rock to hold a lump, and the top grade has
       * nothing finer to recommend: say what is true for each. */
      if (Gr.isGiant && Gr.isGiant(body)) {
        ctx.fillText('No rock here to hold a lump: a giant is gas and', pxl, cy2 + 16);
        ctx.fillText('ice over a core. Only the well itself reads.', pxl, cy2 + 30);
      } else if (lvl >= 4) {
        ctx.fillText('Nothing over ' + res.mgal + ' mGal. This rock is quiet,', pxl, cy2 + 16);
        ctx.fillText('as far down as any instrument can read.', pxl, cy2 + 30);
      } else {
        ctx.fillText('Nothing over ' + res.mgal + ' mGal. A finer instrument would', pxl, cy2 + 16);
        ctx.fillText('read deeper into the same rock.', pxl, cy2 + 30);
      }
    }
    ctx.restore();

    /* The one line that says what an unexplained contact MEANS. */
    ctx.save();
    ctx.font = 'italic 10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,185,120,0.75)';
    /* Not "heavy" any more (slice 2): a low is mass that is missing. */
    ctx.fillText('! something your survey kit cannot name - a high is mass, a low is mass missing', pxl, bottom - 34);
    ctx.restore();
    return true;
  }

  /* The layer row, drawn by the map picture and by the slice alike. */
  function drawScanLayerButtons(ctx, w, bottom, ui) {
    var bx = 44, by = bottom - 30;
    btn(ctx, bx, by, 80, 22, 'RESOURCES', function () { ui.layer = 'res'; }, { hot: ui.layer === 'res', bold: true, font: 10 }); bx += 84;
    btn(ctx, bx, by, 74, 22, 'MAGNETIC', function () { ui.layer = 'mag'; }, { hot: ui.layer === 'mag', bold: true, font: 10 }); bx += 78;
    btn(ctx, bx, by, 48, 22, 'BOTH', function () { ui.layer = 'both'; }, { hot: ui.layer === 'both', bold: true, font: 10 }); bx += 54;
    btn(ctx, bx, by, 66, 22, 'GRAVITY', function () { ui.layer = 'grav'; }, { hot: ui.layer === 'grav', bold: true, font: 10 });
  }

  function drawScannerScreen(ctx, w, bottom) {
    var Sv = global.Survey, ui = scanUI();
    var top = modeFrame(ctx, w, bottom, 'PLANETARY SCANNER',
                        'R/M/B/G layer  ·  1/2/3 slice plane  ·  S style  ·  T sweep  ·  wheel or +/- zoom  ·  arrows pan  ·  D drone  ·  F1 back');
    var lvl = Sv ? Sv.level(G.ship) : 0;
    var hasMag = Sv && Sv.magLevel ? Sv.magLevel(G.ship) > 0 : false;
    /* THE GRAVITY LAYER IS A DIFFERENT PICTURE. The others are a lat/lon map
     * of the surface; this is a cut through the middle, so it owns the page
     * while it is up rather than sharing the projection. Asked first,
     * because a gravimeter is an instrument even with no spectrometer
     * aboard, and the gate below would turn such a pilot away. */
    if (ui.layer === 'grav') {
      var gT = scannerTarget();
      if (drawGravityLayer(ctx, w, top, bottom, gT)) { drawScanLayerButtons(ctx, w, bottom, ui); return; }
    }
    var T = Sv && (lvl || hasMag) ? scannerTarget() : null;
    ctx.save();
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#5d8fa4';
    if (!lvl && !hasMag) {
      ctx.fillText('NO INSTRUMENT FITTED — a survey scanner maps the ground; a magnetometer maps the field.', 16, top + 36);
      ctx.fillText('Yards sell both where development is 0.20 or better.', 16, top + 56);
      ctx.restore(); return;
    }
    if (!T) {
      ctx.fillText('Lock a world, or orbit within ' + Sv.RANGE_R + ' radii of one.', 16, top + 36);
      ctx.fillText('A polar orbit sweeps it pole to pole, one column a turn of the planet.', 16, top + 56);
      ctx.restore(); return;
    }
    ctx.restore();

    var body = T.body, rec = T.rec;
    var nLon = Sv.LON_BINS, nLat = Sv.LAT_BINS;
    var panelW = 300, pad = 14;
    var mapX = 44, mapY = top + 62;
    var mapW = Math.min(w - panelW - pad * 2 - mapX, 2 * (bottom - mapY - 44));
    mapW = Math.max(360, Math.floor(mapW / 360) * 360 || mapW);
    var mapH = mapW / 2;
    var flip = scanFlip(body);
    var sc = scanShipCell(Sv, body);
    var shipDisp = sc === null ? null
                 : { col: scanX(sc % nLon, flip, nLon), row: nLat - 1 - Math.floor(sc / nLon) };
    var vw = scanView(Sv, ui, shipDisp);
    var cw = mapW / vw.vc, ch = mapH / vw.vr;
    function sxc(dc) { return scanSX(vw, mapX, mapW, dc); }
    function syr(dr) { return scanSY(vw, mapY, mapH, dr); }
    function sxLon(lonRad) {                  // radians (body-fixed) to screen x
      var lo = lonRad / (2 * Math.PI) * nLon;
      lo = ((lo % nLon) + nLon) % nLon;
      return sxc(flip ? nLon - lo : lo);
    }
    function syLat(latRad) { return syr((0.5 - latRad / Math.PI) * nLat); }
    /* The wheel zooms about the cursor, like any map. */
    if (G.cursor.active && G.cursor.x >= mapX && G.cursor.x <= mapX + mapW &&
        G.cursor.y >= mapY && G.cursor.y <= mapY + mapH) {
      var atC = vw.col0 + (G.cursor.x - mapX) / cw, atR = vw.row0 + (G.cursor.y - mapY) / ch;
      setScrollRegion(mapX, mapY, mapW, mapH, function (dir) { scanZoom(-dir, atC, atR); });
    }

    /* header: the world, and how much of it each instrument has read */
    ctx.save();
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText((body.name || '?').toUpperCase(), mapX, top + 26);
    ctx.font = 'bold 11px ui-monospace, monospace';
    var covS = rec ? Math.round(rec.cov * 100) : 0, covM = rec && rec.covM ? Math.round(rec.covM * 100) : 0;
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText((lvl ? 'SCANNER ' + covS + '% mapped' : 'no scanner') + '   ·   ' +
                 (hasMag ? 'MAGNETOMETER ' + covM + '% mapped' : 'no magnetometer') +
                 (G._surveyNow === T.key ? '   ·   SCANNING' : '') +
                 (rec && rec.t !== null && rec.t !== undefined ? '   ·   as of ' + fmtEpoch(rec.t) : ''),
                 mapX, top + 44);
    ctx.restore();

    /* the controls: what to show, how to colour it, how the sweep moves */
    var bx = mapX + 310, by = top + 10, fcid = SCAN_FILTERS[ui.filter];
    btn(ctx, bx, by, 80, 22, 'RESOURCES', function () { ui.layer = 'res'; }, { hot: ui.layer === 'res', bold: true, font: 10 }); bx += 84;
    btn(ctx, bx, by, 74, 22, 'MAGNETIC', function () { ui.layer = 'mag'; }, { hot: ui.layer === 'mag', bold: true, font: 10 }); bx += 78;
    btn(ctx, bx, by, 48, 22, 'BOTH', function () { ui.layer = 'both'; }, { hot: ui.layer === 'both', bold: true, font: 10 }); bx += 54;
    btn(ctx, bx, by, 66, 22, 'GRAVITY', function () { ui.layer = 'grav'; }, { hot: ui.layer === 'grav', bold: true, font: 10 }); bx += 70;
    btn(ctx, bx, by, 86, 22, 'STYLE ' + SCAN_STYLES[ui.style | 0], function () { ui.style = ((ui.style | 0) + 1) % SCAN_STYLES.length; }, { bold: true, font: 10 }); bx += 90;
    btn(ctx, bx, by, 94, 22, 'SWEEP ' + SWEEPS[ui.sweep | 0], function () { ui.sweep = ((ui.sweep | 0) + 1) % SWEEPS.length; }, { bold: true, font: 10 }); bx += 98;
    btn(ctx, bx, by, 58, 22, 'ZOOM ' + vw.z + 'x', function () { scanZoom(1); }, { hot: vw.z > 1, bold: true, font: 10 }); bx += 62;
    btn(ctx, bx, by, 70, 22, ui.lines ? 'LINES on' : 'LINES off', function () { ui.lines = !ui.lines; }, { hot: ui.lines, bold: true, font: 10 }); bx += 74;
    btn(ctx, bx, by, 104, 22, fcid ? (Sv.NAMES[fcid] || fcid).toUpperCase().substr(0, 12) : 'ALL COMMODS',
        function () { ui.filter = (ui.filter + 1) % SCAN_FILTERS.length; }, { bold: true, font: 10 });

    /* the map: smoothed for RADAR, hard cells otherwise. The source window
     * can straddle the seam, so it goes down in two pieces. */
    var pic = scanPicture(Sv, T, ui, lvl, hasMag);
    ctx.save();
    ctx.beginPath(); ctx.rect(mapX, mapY, mapW, mapH); ctx.clip();
    ctx.imageSmoothingEnabled = (ui.style | 0) === 0;
    ctx.imageSmoothingQuality = 'high';
    var s0 = Math.floor(vw.col0), sr = Math.floor(vw.row0);
    var first = Math.min(vw.vc + 1, nLon - s0);
    ctx.drawImage(pic, s0, sr, first, vw.vr + 1,
                  sxc(s0), syr(sr), first * cw, (vw.vr + 1) * ch);
    if (first < vw.vc + 1) {
      var rest = Math.ceil(vw.vc + 1 - first);
      ctx.drawImage(pic, 0, sr, rest, vw.vr + 1,
                    sxc(s0) + first * cw, syr(sr), rest * cw, (vw.vr + 1) * ch);
    }
    ctx.imageSmoothingEnabled = true;
    /* graticule: every 30 degrees at 1x, finer as you go in */
    var step = vw.z >= 8 ? 5 : vw.z >= 4 ? 10 : vw.z >= 2 ? 15 : 30;
    ctx.font = '10px ui-monospace, monospace';
    /* Dark under, pale over (scanHalo): one of the two always reads, from
     * the dark teal ground to the white-hot end of the scale. Kept faint -
     * a grid is a ruler, not a feature. */
    var gLab = [];
    var gridCol = 'rgba(225,240,250,0.42)', gridHalo = 0.38;
    for (var gi = 0; gi < 360; gi += step) {
      var gpx = sxc(gi);
      if (gpx < mapX - 1 || gpx > mapX + mapW + 1) continue;
      scanHalo(ctx, function () { ctx.moveTo(gpx, mapY); ctx.lineTo(gpx, mapY + mapH); }, gridCol, 1, gridHalo);
      gLab.push([gpx, gi]);
    }
    for (var gy = -90 + step; gy < 90; gy += step) {
      var gpy = syr((90 - gy) * nLat / 180);
      if (gpy < mapY || gpy > mapY + mapH) continue;
      scanHalo(ctx, function () { ctx.moveTo(mapX, gpy); ctx.lineTo(mapX + mapW, gpy); }, gridCol, 1, gridHalo);
    }
    ctx.restore();

    /* pictographs over the deposits the list names, and your drones */
    ctx.save();
    ctx.beginPath(); ctx.rect(mapX - 8, mapY - 8, mapW + 16, mapH + 16); ctx.clip();
    if (ui.layer !== 'mag') {
      var deps0 = scanDeps(Sv, T, lvl), gsz = vw.z >= 4 ? 10 : vw.z >= 2 ? 8 : 7;
      for (var di = 0; di < deps0.length; di++) {
        var dp0 = deps0[di];
        if (fcid && dp0.cid !== fcid) continue;
        scanGlyph(ctx, dp0.cid, sxc(scanX(dp0.lo, flip, nLon) + 0.5), syr(nLat - 0.5 - dp0.la),
                  gsz, SCAN_INK[dp0.cid] || '#7dffb0');
      }
    }
    /* THE MAGNETOMETER'S HIGHS (interiors slice 3), ringed where the list
     * names them: warm for one nothing aboard explains, as on the gravity
     * slice. A broad province gets a wide faint ring the size of its patch
     * so it does not read as a pinpoint. */
    if (ui.layer !== 'res' && hasMag && rec && Sv.magContacts) {
      var mcs0 = Sv.magContacts(body, G.sys, rec, lvl);
      for (var mi = 0; mi < mcs0.length; mi++) {
        var mc0 = mcs0[mi], MX = sxLon(mc0.lon), MY = syLat(mc0.lat);
        var mcol = mc0.explained ? 'rgba(190,225,245,0.85)' : 'rgba(255,186,110,0.95)';
        scanHalo(ctx, function () { ctx.arc(MX, MY, 6, 0, 6.2832); }, mcol, mc0.explained ? 1.4 : 2);
        if (mc0.broad) {
          var rpx = Math.max(10, (mc0.widthKm / 2) / (2 * Math.PI * (body.radius || 1)) * nLon * cw);
          ctx.save(); ctx.setLineDash([3, 4]);
          /* Wider east-west toward the poles, as the patch itself is on
           * this projection: a circle there would undersell it. */
          var rpxX = rpx / Math.max(0.2, Math.cos(mc0.lat));
          scanHalo(ctx, function () { ctx.ellipse(MX, MY, rpxX, rpx, 0, 0, 6.2832); }, mcol, 1);
          ctx.restore();
        }
      }
    }

    /* magnetic field lines: only over ground the magnetometer has read, with
     * a pointer at the middle of each, pole to pole */
    var showLines = ui.lines && ui.layer !== 'res' && hasMag && rec;
    if (showLines) {
      var fl = Sv.fieldLines(body, G.sys, 14);
      var cellsM = Sv.cellsOf(rec, 'cellsM');
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(235,245,255,0.75)';
      ctx.fillStyle = 'rgba(235,245,255,0.95)';
      fl.lines.forEach(function (pts) {
        var pen = false, px0 = 0, py0 = 0, mid = (pts.length / 2) | 0;
        for (var i = 0; i < pts.length; i++) {
          var cl = Sv.cellOfLatLon(pts[i][0], pts[i][1]);
          var X = sxLon(pts[i][1]), Y = syLat(pts[i][0]);
          var ok = cellsM[cl];
          if (ok && pen && Math.abs(X - px0) < mapW * 0.5) {
            (function (ax, ay, bx2, by2) {
              scanHalo(ctx, function () { ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2); }, 'rgba(235,245,255,0.85)', 1.1, 0.6);
            })(px0, py0, X, Y);
            if (i === mid) {
              var ang = Math.atan2(Y - py0, X - px0);
              ctx.beginPath();
              ctx.moveTo(X, Y);
              ctx.lineTo(X - 7 * Math.cos(ang - 0.45), Y - 7 * Math.sin(ang - 0.45));
              ctx.lineTo(X - 7 * Math.cos(ang + 0.45), Y - 7 * Math.sin(ang + 0.45));
              ctx.closePath();
              ctx.save(); ctx.strokeStyle = 'rgba(2,8,12,0.75)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
              ctx.fill();
            }
          }
          pen = !!ok; px0 = X; py0 = Y;
        }
      });
      fl.poles.forEach(function (pl, n) {
        if (!cellsM[Sv.cellOfLatLon(pl[0], pl[1])]) return;
        var X = sxLon(pl[1]), Y = syLat(pl[0]);
        var pcol = n === 0 ? '#ff7a4a' : '#5fb4ff';
        scanHalo(ctx, function () { ctx.arc(X, Y, 5, 0, 6.2832); }, pcol, 2);
        scanText(ctx, n === 0 ? 'N' : 'S', X + 8, Y + 4, pcol);
      });
    }

    /* the ship's ground track: the real thing, slanting across the map
     * because the planet turns under a polar orbit. */
    var trk = G._track && G._track.key === T.key ? G._track.pts : null;
    if (ui.sweep >= 1 && trk && trk.length > 1) {
      var prevX = null, prevY = 0, nT = trk.length;
      ctx.lineWidth = 2;
      for (var ti = 0; ti < nT; ti++) {
        var tc = trk[ti];
        var TX = sxc(scanX(tc % nLon, flip, nLon) + 0.5), TY = syr(nLat - 0.5 - Math.floor(tc / nLon));
        if (prevX !== null && Math.abs(TX - prevX) < mapW * 0.4 && Math.abs(TY - prevY) < mapH * 0.5) {
          (function (ax, ay, bx2, by2, a) {
            scanHalo(ctx, function () { ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2); },
                     'rgba(255,255,255,' + a.toFixed(2) + ')', 2, a * 0.8);
          })(prevX, prevY, TX, TY, 0.12 + 0.75 * ti / nT);
          if (ti % 70 === 0 || ti === nT - 1) {
            var ta = Math.atan2(TY - prevY, TX - prevX);
            ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.7 * ti / nT).toFixed(2) + ')';
            ctx.beginPath();
            ctx.moveTo(TX + 5 * Math.cos(ta), TY + 5 * Math.sin(ta));
            ctx.lineTo(TX - 5 * Math.cos(ta - 0.6), TY - 5 * Math.sin(ta - 0.6));
            ctx.lineTo(TX - 5 * Math.cos(ta + 0.6), TY - 5 * Math.sin(ta + 0.6));
            ctx.closePath();
            ctx.save(); ctx.strokeStyle = 'rgba(2,8,12,0.75)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
            ctx.fill();
          }
        }
        prevX = TX; prevY = TY;
      }
    }

    /* DRONES ALREADY DOWN THERE, yours and anybody else's: a drone is a
     * thing standing on a cell, so the map that picks cells must show the
     * ones already taken. */
    var Cl = global.Claims, mine = [], theirs = [];
    if (Cl && Sv.cellOfLatLon) {
      (G.drones || []).forEach(function (d) {
        if (d.key === T.key) mine.push(Sv.cellOfLatLon(d.at.lat, d.at.lon));
      });
      if (Cl.npcOn) {
        (Cl.npcOn(G, G.sys, T.key, G.t) || []).forEach(function (d) {
          theirs.push(Sv.cellOfLatLon(d.at.lat, d.at.lon));
        });
      }
    }
    function droneMark(cell, col) {
      var X = sxc(scanX(cell % nLon, flip, nLon) + 0.5), Y = syr(nLat - 0.5 - Math.floor(cell / nLon));
      scanHalo(ctx, function () { ctx.arc(X, Y, 6, 0, 6.2832); }, col, 2);
      scanHalo(ctx, function () { ctx.moveTo(X - 3, Y); ctx.lineTo(X + 3, Y); ctx.moveTo(X, Y - 3); ctx.lineTo(X, Y + 3); }, col, 2);
    }
    theirs.forEach(function (c) { droneMark(c, '#ff9f7a'); });
    mine.forEach(function (c) { droneMark(c, '#7dffb0'); });
    /* Your outpost on this claim: a square round its drone's cell, dashed
     * while it is being built. */
    var OpM = global.Outposts, opM = OpM && Sv.cellOfLatLon ? OpM.onClaim(G, T.key) : null;
    if (opM) {
      var oc = Sv.cellOfLatLon(opM.at.lat, opM.at.lon);
      var OX = sxc(scanX(oc % nLon, flip, nLon) + 0.5), OY = syr(nLat - 0.5 - Math.floor(oc / nLon));
      var dashed = !OpM.standing(opM, G.t);
      scanHalo(ctx, function () {
        if (dashed) ctx.setLineDash([5, 4]);
        ctx.rect(OX - 15, OY - 15, 30, 30);
      }, '#ffd36b', 2.5);
      ctx.setLineDash([]);
      ctx.font = 'bold 10px ui-monospace, monospace';
      scanText(ctx, 'OUTPOST', OX + 19, OY + 4, '#ffd36b');
    }
    /* The world's own drilling teams at work here (digs.js): a diamond on
     * the dig's cell and how far through it is. */
    var DgM = global.Digs;
    if (DgM && Sv.cellOfLatLon && T.body) {
      DgM.active(G, G.sys, (G.here && G.here.id) || G.sys.starId, G.t).forEach(function (dg) {
        if (dg.body !== T.body.id) return;
        var dc = Sv.cellOfLatLon(dg.lat, dg.lon);
        var DX = sxc(scanX(dc % nLon, flip, nLon) + 0.5), DY = syr(nLat - 0.5 - Math.floor(dc / nLon));
        scanHalo(ctx, function () {
          ctx.moveTo(DX, DY - 12); ctx.lineTo(DX + 12, DY); ctx.lineTo(DX, DY + 12); ctx.lineTo(DX - 12, DY); ctx.closePath();
        }, '#9fd8ff', 2.5);
        ctx.font = 'bold 10px ui-monospace, monospace';
        scanText(ctx, 'DIG ' + Math.floor(DgM.progress(G, dg, G.t) * 100) + '%', DX + 16, DY + 4, '#9fd8ff');
      });
    }

    /* the ship */
    if (sc !== null) {
      var shx = sxc(shipDisp.col + 0.5), shy = syr(shipDisp.row + 0.5);
      if ((ui.sweep | 0) === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(shx - cw * 1.5, mapY, cw * 3, mapH);
      }
      scanHalo(ctx, function () { ctx.arc(shx, shy, 6, 0, 6.2832); }, '#ffffff', 1.5);
      scanHalo(ctx, function () {
        ctx.moveTo(shx - 10, shy); ctx.lineTo(shx + 10, shy);
        ctx.moveTo(shx, shy - 10); ctx.lineTo(shx, shy + 10);
      }, '#ffffff', 1.5);
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(74,151,176,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mapX - 0.5, mapY - 0.5, mapW + 1, mapH + 1);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#5d8fa4';
    gLab.forEach(function (g) { ctx.fillText(String(g[1]), g[0] + 2, mapY + mapH + 12); });
    for (var ly = -90; ly <= 90; ly += step) {
      var lpy = syr((90 - ly) * nLat / 180);
      if (lpy < mapY - 1 || lpy > mapY + mapH + 1) continue;
      ctx.fillText((ly > 0 ? '+' : '') + ly, mapX - 30, Math.max(mapY + 8, Math.min(mapY + mapH, lpy + 3)));
    }
    ctx.fillStyle = '#4f7d90';
    ctx.fillText('X  scan longitude (deg)' + (flip ? ', newest columns to the right' : '') +
                 (ui.sweep === 2 ? '   ·   map follows the ship' : '') +
                 (vw.z > 1 ? '   ·   ' + vw.z + 'x, arrows pan' : ''), mapX, mapY + mapH + 26);
    ctx.save();
    ctx.translate(12, mapY + mapH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('Y  latitude (deg)', -40, 0);
    ctx.restore();
    ctx.restore();

    /* hover readout, click to pin; x is always the true scan column */
    var hov = null;
    var cx = G.cursor.x, cy = G.cursor.y;
    if (G.cursor.active && cx >= mapX && cx < mapX + mapW && cy >= mapY && cy < mapY + mapH) {
      var habs = Math.floor(((vw.col0 + (cx - mapX) / cw) % nLon + nLon) % nLon);
      var hrow = Math.floor(vw.row0 + (cy - mapY) / ch);
      var hlo = flip ? nLon - 1 - habs : habs, hla = nLat - 1 - Math.max(0, Math.min(nLat - 1, hrow));
      hov = { lo: hlo, la: hla, x: habs, cell: hla * nLon + hlo };
    }
    var pin = ui.pin && ui.pin.key === T.key ? ui.pin : null;
    hot(mapX, mapY, mapW, mapH, function () {
      if (hov) ui.pin = { key: T.key, cell: hov.cell, x: hov.x };
    }, 'pin a reading');
    var show = hov || (pin ? { cell: pin.cell, x: pin.x, la: Math.floor(pin.cell / nLon), lo: pin.cell % nLon } : null);
    if (show) {
      ctx.save();
      ctx.beginPath(); ctx.rect(mapX, mapY, mapW, mapH); ctx.clip();
      /* THE SELECTED POINT: a box round the cell, never smaller than a
       * fingertip (a cell is three pixels wide at 1x), and four ticks
       * pointing in at it from outside, so it can be found at a glance on
       * any colour - each drawn with its dark halo (scanHalo). Warm white
       * rather than the old amber, which vanished on yellow ground. */
      var selX = sxc(scanX(show.lo, flip, nLon)) + cw / 2, selY = syr(nLat - 1 - show.la) + ch / 2;
      var hb = Math.max(cw, ch, 10) / 2 + 2, tick = 7;
      scanHalo(ctx, function () { ctx.rect(selX - hb, selY - hb, hb * 2, hb * 2); }, '#fff4c8', 1.5);
      scanHalo(ctx, function () {
        ctx.moveTo(selX - hb - tick, selY); ctx.lineTo(selX - hb - 2, selY);
        ctx.moveTo(selX + hb + 2, selY); ctx.lineTo(selX + hb + tick, selY);
        ctx.moveTo(selX, selY - hb - tick); ctx.lineTo(selX, selY - hb - 2);
        ctx.moveTo(selX, selY + hb + 2); ctx.lineTo(selX, selY + hb + tick);
      }, '#fff4c8', 1.5);
      ctx.restore();
    }

    /* the strip under the map: what is at the cell, and the drone button */
    var ry = mapY + mapH + 44;
    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    if (show) {
      var cellsR = rec ? Sv.cellsOf(rec) : null;
      var latDeg = show.la - 89.5;
      ctx.fillStyle = '#ffd36b';
      ctx.fillText('X ' + show.x + '   Y ' + (latDeg >= 0 ? '+' : '') + latDeg.toFixed(1) + '°', mapX, ry);
      var parts = [], gl = [];
      if (rec && Sv.magRead(rec, show.cell)) {
        parts.push('field ' + Sv.fieldAt(body, G.sys, show.cell).toFixed(2));
        /* The part of it that is the rock, not the core: what a prospector reads. */
        var mmc = Sv.magMap(body, G.sys), an = mmc && mmc.anom ? mmc.anom[show.cell] * (Sv.NT_PER || 50000) : 0;
        if (an >= 50) parts.push('+' + Math.round(an) + ' nT');
      }
      else if (hasMag) parts.push('field: not read');
      if (cellsR && cellsR[show.cell]) {
        gl = Sv.groundAt(body, G.sys, show.cell).filter(function (g) {
          return Sv.cellRead(rec, g.cid, show.cell) && g.grade >= 0.05;
        }).slice(0, 3);
        parts.push(gl.length ? gl.map(function (g) { return (Sv.NAMES[g.cid] || g.cid).toLowerCase() + ' ' + Sv.gradeWord(g.grade).toLowerCase(); }).join(', ')
                             : 'nothing worth digging');
      } else if (lvl) parts.push('ground: not read');
      var rx = mapX + 150;
      gl.forEach(function (g) { scanGlyph(ctx, g.cid, rx + 6, ry - 4, 6, SCAN_INK[g.cid] || '#7dffb0'); rx += 16; });
      ctx.fillStyle = '#b4f0ff';
      ctx.fillText(clipText(parts.join('   ·   '), 110), rx + (gl.length ? 4 : 0), ry);
      /* THE DRONE GOES WHERE YOU POINT. Refused with the reason, every
       * time: a greyed button that will not say why is a worse button. */
      if (Cl && Cl.deployAt) {
        var sel = show.cell, already = mine.indexOf(sel) >= 0 || theirs.indexOf(sel) >= 0;
        btn(ctx, mapX, ry + 10, 190, 24, already ? 'A DRONE IS THERE' : 'D  DEPLOY DRONE HERE', function () {
          if (already) { say('A drone is already standing there.', 4); return; }
          scanDeploy(T, sel);
        }, { bold: true, font: 11, disabled: already });
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillStyle = '#4f7d90';
        ctx.fillText((G.ship.drones || 0) + ' drone' + ((G.ship.drones || 0) === 1 ? '' : 's') + ' aboard' +
                     (Cl.claimFor(G, T.key, G.t) ? '  ·  claim live' : '  ·  no claim filed') +
                     '  ·  from orbit it goes down in a pod', mapX + 200, ry + 26);
        /* AN OUTPOST (outposts.js): your drones build it where one of them
         * stands, so the button is under a cell with your drone on it. The
         * reason it cannot, when it cannot, beside it. */
        var Op = global.Outposts;
        if (Op && mine.indexOf(sel) >= 0) {
          var myD = (G.drones || []).filter(function (d) {
            return d.key === T.key && Sv.cellOfLatLon(d.at.lat, d.at.lon) === sel;
          })[0];
          var opHere = Op.onClaim(G, T.key);
          var opWhy = myD ? Op.refusal(G, G.sys, G.t, myD.id) : 'no drone of yours there';
          btn(ctx, mapX, ry + 40, 190, 24, opHere ? 'OUTPOST ON THIS CLAIM' : 'DRONES BUILD AN OUTPOST', function () {
            if (!myD) return;
            var r = Op.order(G, G.sys, G.t, myD.id);
            say(r.ok ? r.text : 'Outpost: ' + r.why, r.ok ? 9 : 5);
            if (r.ok && global.Save) global.Save.store(G);
          }, { bold: true, font: 11, disabled: !!opWhy });
          ctx.font = 'bold 10px ui-monospace, monospace';
          ctx.fillStyle = opHere ? '#ffd36b' : opWhy ? '#ff9f7a' : '#7dffb0';
          ctx.fillText(opHere ? Op.statusLine(G, opHere, G.t)
                       : opWhy ? opWhy
                       : Op.OUTPOST_FEE.toLocaleString('en-US') + ' cr for the Guild\'s frame  ·  ' +
                         Op.dronesOn(G, T.key).length + ' drones build it in about ' +
                         Math.round(Op.daysFor(Op.dronesOn(G, T.key).length)) + ' days',
                       mapX + 200, ry + 56);
          /* THE DRILLING TEAM (outposts.js): your engineers set down at a
           * standing outpost to dig it out into a port, or fetched back.
           * Only from the ground there; the line says why not otherwise. */
          if (opHere && Op.standing(opHere, G.t) && !opHere.port) {
            var mineDown = Op.teamAboardBooks(G, opHere).length;
            var fetch = mineDown > 0 && !Op.recallRefusal(G, G.sys, G.t);
            var tWhy = fetch ? null : Op.postRefusal(G, G.sys, G.t);
            btn(ctx, mapX, ry + 70, 190, 24, fetch ? 'FETCH THE TEAM BACK' : 'SET ENGINEERS DOWN TO DIG', function () {
              var rr = fetch ? Op.recallTeam(G, G.sys, G.t) : Op.postTeam(G, G.sys, G.t, { say: say });
              say(rr.ok ? rr.text : 'Drilling team: ' + rr.why, rr.ok ? 9 : 5);
              if (rr.ok && global.Save) global.Save.store(G);
            }, { bold: true, font: 11, disabled: !!tWhy });
            ctx.font = 'bold 10px ui-monospace, monospace';
            ctx.fillStyle = tWhy ? '#ff9f7a' : '#7dffb0';
            var eN = Op.engineersAboard(G).length;
            ctx.fillText(tWhy ? tWhy
                         : fetch ? mineDown + ' of your crew down there'
                         : eN + ' engineer' + (eN === 1 ? '' : 's') + ' aboard dig it out into a port of yours' +
                           (!opHere.dig || !opHere.dig.paid
                             ? '  ·  it eats ' + Op.DIG_STORES + ' t of structural alloys' +
                               (global.Licence && global.Licence.needed && global.Licence.needed(G.sys) ? ', and needs a station licence' : '')
                             : ''),
                         mapX + 200, ry + 86);
            /* THE DIG'S STORES: alloys hauled down and unloaded, or the
             * Guild paid to bring the shortfall in. One button: unload when
             * there are alloys in the hold, otherwise the contract. */
            var hold = (G.ship && G.ship.cargo && G.ship.cargo[Op.STORE_GOOD]) || 0;
            var needT = opHere.dig ? Op.storesNeeded(opHere, G.t) : Op.DIG_STORES;
            if (needT > 0) {
              var unload = hold > 0;
              var sWhy = unload ? Op.unloadRefusal(G, G.sys, G.t) : Op.contractRefusal(G, G.sys, G.t);
              var price = Op.contractPrice(needT);
              btn(ctx, mapX, ry + 100, 190, 24,
                  unload ? 'UNLOAD ALLOYS FOR THE DIG' : 'GUILD BRINGS STORES IN', function () {
                var rs = unload ? Op.unloadStores(G, G.sys, G.t) : Op.contractStores(G, G.sys, G.t);
                say(rs.ok ? rs.text : 'Stores: ' + rs.why, rs.ok ? 8 : 5);
                if (rs.ok && global.Save) global.Save.store(G);
              }, { bold: true, font: 11, disabled: !!sWhy });
              ctx.font = 'bold 10px ui-monospace, monospace';
              ctx.fillStyle = sWhy ? '#ff9f7a' : '#7dffb0';
              ctx.fillText(sWhy ? sWhy
                           : unload ? 'unload ' + Math.floor(Math.min(hold, needT)) + ' t  ·  dig wants ' + Math.ceil(needT) + ' t'
                           : Math.ceil(needT) + ' t for ' + price.toLocaleString('en-US') + ' cr',
                           mapX + 200, ry + 116);
            }
          }
        }
      }
    } else {
      ctx.fillStyle = '#4f7d90';
      ctx.fillText('Point at the map for a reading; click to pin it, D to put a drone there.', mapX, ry);
    }
    ctx.restore();

    /* the right-hand column: legend, then the list */
    var px2 = w - panelW - pad, py2 = top + 8;
    ctx.save();
    ctx.fillStyle = 'rgba(6,14,20,0.85)';
    ctx.fillRect(px2, py2, panelW, bottom - py2 - 10);
    ctx.strokeStyle = 'rgba(74,151,176,0.5)';
    ctx.strokeRect(px2 + 0.5, py2 + 0.5, panelW - 1, bottom - py2 - 11);
    ctx.font = 'bold 12px ui-monospace, monospace';
    var y = py2 + 20;
    ctx.fillStyle = '#5d8fa4';
    ctx.fillText('LEGEND', px2 + 10, y); y += 8;
    ctx.font = 'bold 11px ui-monospace, monospace';
    Sv.CIDS.forEach(function (cid) {
      y += 17;
      scanGlyph(ctx, cid, px2 + 17, y - 4, 7, SCAN_INK[cid] || '#7dffb0');
      ctx.fillStyle = Sv.readable(rec, cid) ? '#cfeaf4' : '#4f7d90';
      ctx.fillText(Sv.NAMES[cid] + (Sv.readable(rec, cid) ? '' : '  (not read)'), px2 + 32, y);
    });
    y += 22;
    if ((ui.style | 0) === 1) {
      ctx.fillStyle = '#4f7d90';
      ctx.fillText('colour = what, brighter = richer', px2 + 10, y);
    } else {
      var gr0 = ctx.createLinearGradient(px2 + 10, 0, px2 + panelW - 10, 0);
      for (var sg = 0; sg <= 10; sg++) {
        var c0 = rampOf(RADAR_STOPS, (ui.style | 0) === 2 ? (Math.min(6, Math.floor(sg / 10 * 7 - 1e-9)) + 0.5) / 7 : sg / 10);
        gr0.addColorStop(sg / 10, 'rgb(' + (c0[0] | 0) + ',' + (c0[1] | 0) + ',' + (c0[2] | 0) + ')');
      }
      ctx.fillStyle = gr0;
      ctx.fillRect(px2 + 10, y - 9, panelW - 20, 10);
      ctx.fillStyle = '#4f7d90';
      ctx.fillText('trace', px2 + 10, y + 12);
      ctx.textAlign = 'right'; ctx.fillText('richest', px2 + panelW - 10, y + 12); ctx.textAlign = 'left';
      ctx.textAlign = 'center'; ctx.fillText('how rich', px2 + panelW / 2, y + 12); ctx.textAlign = 'left';
      y += 14;
    }
    if (hasMag) {
      y += 22;
      var gr = ctx.createLinearGradient(px2 + 10, 0, px2 + panelW - 10, 0);
      for (var s = 0; s <= 8; s++) {
        var cc = rampOf(MAG_STOPS, s / 8);
        gr.addColorStop(s / 8, 'rgb(' + (cc[0] | 0) + ',' + (cc[1] | 0) + ',' + (cc[2] | 0) + ')');
      }
      ctx.fillStyle = gr;
      ctx.fillRect(px2 + 10, y - 9, panelW - 20, 10);
      var mmx = Sv.magMap(body, G.sys);
      ctx.fillStyle = '#4f7d90';
      ctx.fillText('field 0', px2 + 10, y + 12);
      ctx.textAlign = 'right';
      ctx.fillText((mmx ? mmx.max : 0).toFixed(2), px2 + panelW - 10, y + 12);
      ctx.textAlign = 'left';
      y += 28;
      if (mmx && !mmx.dipole) { ctx.fillText('no dipole: only what the crust holds', px2 + 10, y); y += 14; }
      if (mmx && mmx.remanence) { ctx.fillText('remanent crust: old field frozen in the rock', px2 + 10, y); y += 14; }
    }

    /* THE MAGNETIC LAYER LISTS WHAT THE COIL HEARD, where the others list
     * deposits: the gravimeter's list has a sibling (interiors slice 3). */
    if (ui.layer === 'mag' && hasMag) {
      y += 14;
      ctx.fillStyle = '#5d8fa4';
      ctx.font = 'bold 12px ui-monospace, monospace';
      var mcs = Sv.magContacts ? Sv.magContacts(body, G.sys, rec, lvl) : [];
      var mUn = mcs.filter(function (c) { return !c.explained; }).length;
      ctx.fillText('MAGNETIC HIGHS  ' + mcs.length + (mUn ? '  ·  ' + mUn + ' unexplained' : ''), px2 + 10, y);
      y += 6;
      ctx.font = 'bold 11px ui-monospace, monospace';
      if (!mcs.length) {
        y += 14; ctx.fillStyle = '#4f7d90';
        ctx.fillText(rec && rec.covM >= 0.05 ? 'nothing over ' + Sv.MAG_FLOOR_NT + ' nT read yet' : 'not enough mapped', px2 + 10, y);
      }
      var mRows = Math.max(2, Math.floor((bottom - 70 - y) / 28));
      mcs.slice(0, mRows).forEach(function (mc) {
        y += 16;
        var mla = Math.floor(mc.cell / nLon), mlo = mc.cell % nLon;
        var MXl = scanX(mlo, flip, nLon), MYl = mla - 89.5;
        ctx.fillStyle = mc.explained ? '#9fc4d4' : '#ffb978';
        ctx.fillText((mc.explained ? '  ' : '! ') + (mc.broad ? 'province' : 'buried'), px2 + 10, y);
        ctx.fillStyle = '#7fd6c0';
        ctx.fillText('X' + MXl + ' Y' + (MYl >= 0 ? '+' : '') + Math.round(MYl), px2 + 150, y);
        y += 12;
        ctx.fillStyle = mc.explained ? 'rgba(140,170,195,0.85)' : '#e8d8b8';
        ctx.fillText(clipText(Sv.describeMag(mc), 40), px2 + 22, y - 1);
        (function (d, la_, lo_) {
          hot(px2 + 6, y - 28, panelW - 12, 30, function () {
            ui.pin = { key: T.key, cell: d.cell, x: scanX(lo_, flip, nLon) };
            ui.cx = scanX(lo_, flip, nLon) + 0.5;
            ui.cy = nLat - 0.5 - la_;
            if (ui.sweep === 2) ui.sweep = 1;
          }, 'pin this high');
        })(mc, mla, mlo);
      });
      ctx.font = 'italic 10px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255,185,120,0.75)';
      ctx.fillText('! a high your survey kit cannot name', px2 + 10, bottom - 26);
      ctx.restore();
      return;
    }

    y += 14;
    ctx.fillStyle = '#5d8fa4';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText('DEPOSITS', px2 + 10, y);
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = '#4f7d90';
    ctx.fillText('click to go there', px2 + 190, y);
    y += 6;
    ctx.font = 'bold 11px ui-monospace, monospace';
    var deps = scanDeps(Sv, T, lvl);
    var arrOK = deps.arr >= 0.1;
    if (!lvl) {
      y += 14; ctx.fillStyle = '#4f7d90'; ctx.fillText('no scanner fitted', px2 + 10, y);
    } else if (!deps.length) {
      y += 14; ctx.fillStyle = '#4f7d90';
      ctx.fillText(rec && rec.cov >= 0.05 ? 'no rich ground read yet' : 'not enough mapped', px2 + 10, y);
    }
    var maxRows = Math.max(2, Math.floor((bottom - 70 - y) / 28));
    deps.slice(0, maxRows).forEach(function (dp) {
      y += 16;
      var X = scanX(dp.lo, flip, nLon), Yl = dp.la - 89.5;
      scanGlyph(ctx, dp.cid, px2 + 16, y - 4, 6, SCAN_INK[dp.cid] || '#7dffb0');
      ctx.fillStyle = '#cfeaf4';
      ctx.fillText(clipText((Sv.NAMES[dp.cid] || dp.cid), 14), px2 + 28, y);
      ctx.fillStyle = '#7fd6c0';
      ctx.fillText('X' + X + ' Y' + (Yl >= 0 ? '+' : '') + Math.round(Yl), px2 + 150, y);
      y += 11;
      ctx.fillStyle = 'rgba(74,151,176,0.22)';
      ctx.fillRect(px2 + 28, y - 8, 90, 6);
      var rc = rampOf(RADAR_STOPS, Math.min(1, dp.grade / 0.9));
      ctx.fillStyle = 'rgb(' + (rc[0] | 0) + ',' + (rc[1] | 0) + ',' + (rc[2] | 0) + ')';
      ctx.fillRect(px2 + 28, y - 8, 90 * Math.min(1, dp.grade), 6);
      ctx.fillStyle = '#9fc4d4';
      ctx.fillText(arrOK ? '~' + Sv.fmtTonnes(dp.tonnes) : Sv.gradeWord(dp.grade), px2 + 126, y - 1);
      /* Clicking a row pins it AND walks the view to it, which is the only
       * way to find one 1-degree cell on a zoomed map without hunting. */
      (function (d) {
        hot(px2 + 6, y - 28, panelW - 12, 30, function () {
          ui.pin = { key: T.key, cell: d.cell, x: scanX(d.lo, flip, nLon) };
          ui.cx = scanX(d.lo, flip, nLon) + 0.5;
          ui.cy = nLat - 0.5 - d.la;
          if (ui.sweep === 2) ui.sweep = 1;
        }, 'pin this deposit');
      })(dp);
    });
    if (lvl && lvl < 3) {
      ctx.fillStyle = '#4f7d90';
      ctx.fillText(lvl < 2 ? 'fissiles: grade 2 scanner   rare: grade 3' : 'rare metals: grade 3 scanner', px2 + 10, bottom - 26);
    }
    ctx.restore();
  }

  /* Zoom by `dir` steps, keeping the cell under (atC, atR) where it was. */
  function scanZoom(dir, atC, atR) {
    var Sv = global.Survey, ui = scanUI();
    var was = ZOOMS[ui.zoom | 0] || 1;
    var next = Math.max(0, Math.min(ZOOMS.length - 1, (ui.zoom | 0) + dir));
    if (next === (ui.zoom | 0)) return;
    if (atC === undefined) {
      /* No pointer: hold the middle of what is on screen, or the pin. */
      atC = ui.cx === undefined ? Sv.LON_BINS / 2 : ui.cx;
      atR = ui.cy === undefined ? Sv.LAT_BINS / 2 : ui.cy;
    }
    ui.zoom = next;
    if (ZOOMS[next] === 1) { ui.cx = undefined; ui.cy = undefined; return; }
    /* Keep the point under the cursor fixed: the new centre is that point
     * pulled toward the old centre by the change in scale. */
    var oc = ui.cx === undefined ? Sv.LON_BINS / 2 : ui.cx;
    var or = ui.cy === undefined ? Sv.LAT_BINS / 2 : ui.cy;
    var k = was / ZOOMS[next];
    ui.cx = ((atC + (oc - atC) * k) % Sv.LON_BINS + Sv.LON_BINS) % Sv.LON_BINS;
    ui.cy = Math.max(0, Math.min(Sv.LAT_BINS, atR + (or - atR) * k));
    if (ui.sweep === 2) ui.sweep = 1;              // panning and following fight
  }
  function scanPan(dx, dy) {
    var Sv = global.Survey, ui = scanUI();
    var z = ZOOMS[ui.zoom | 0] || 1;
    if (z === 1) return false;
    if (ui.sweep === 2) ui.sweep = 1;
    var stepC = Sv.LON_BINS / z / 6, stepR = Sv.LAT_BINS / z / 6;
    ui.cx = (((ui.cx === undefined ? Sv.LON_BINS / 2 : ui.cx) + dx * stepC) % Sv.LON_BINS + Sv.LON_BINS) % Sv.LON_BINS;
    ui.cy = Math.max(0, Math.min(Sv.LAT_BINS, (ui.cy === undefined ? Sv.LAT_BINS / 2 : ui.cy) + dy * stepR));
    return true;
  }
  /* Put a drone on a cell, and say what came of it either way. */
  function scanDeploy(T, cell) {
    var Cl = global.Claims;
    if (!Cl || !Cl.deployAt) return;
    var r = Cl.deployAt(G, G.sys, G.t, T.body, cell);
    say(r.ok ? r.text : 'Drone: ' + (r.why || 'nothing to do'), 6);
    if (r.ok && global.Save) global.Save.store(G);
  }

  /* The scanner's own keys, routed from main.js. */
  function scannerKey(key, e) {
    var ui = scanUI();
    if (key === 'r') { ui.layer = 'res'; return true; }
    if (key === 'm') { ui.layer = 'mag'; return true; }
    if (key === 'b') { ui.layer = 'both'; return true; }
    if (key === 'g') { ui.layer = 'grav'; return true; }
    /* The three principal cuts, while the slice is the layer showing. */
    if (ui.layer === 'grav' && (key === '1' || key === '2' || key === '3')) {
      ui.plane = { '1': 'xy', '2': 'yz', '3': 'zx' }[key];
      return true;
    }
    if (key === 'l') { ui.lines = !ui.lines; return true; }
    if (key === 'c') { ui.filter = (ui.filter + 1) % SCAN_FILTERS.length; return true; }
    if (key === 's') { ui.style = ((ui.style | 0) + 1) % SCAN_STYLES.length; return true; }
    if (key === 't') { ui.sweep = ((ui.sweep | 0) + 1) % SWEEPS.length; return true; }
    if (key === '=' || key === '+') { scanZoom(1); return true; }
    if (key === '-' || key === '_') { scanZoom(-1); return true; }
    if (key === 'z') { scanZoom(((ZOOMS[ui.zoom | 0] || 1) >= ZOOMS[ZOOMS.length - 1]) ? -(ui.zoom | 0) : 1); return true; }
    if (key === 'arrowleft') return scanPan(-1, 0);
    if (key === 'arrowright') return scanPan(1, 0);
    if (key === 'arrowup') return scanPan(0, -1);
    if (key === 'arrowdown') return scanPan(0, 1);
    if (key === 'd') {
      var T = scannerTarget();
      var pin = ui.pin && T && ui.pin.key === T.key ? ui.pin : null;
      if (!T) { say('Drone: no world on the scanner.', 4); return true; }
      if (!pin) { say('Drone: pin a cell on the map first (click it).', 4); return true; }
      scanDeploy(T, pin.cell);
      return true;
    }
    return false;
  }

  /* The SURVEY page's little map: the scanner's own picture, scaled down,
   * with the ship's ground marked. Returns the cell under the ship or null. */
  function scanMini(ctx, x, y, w, h) {
    var Sv = global.Survey, ui = scanUI();
    var lvl = Sv ? Sv.level(G.ship) : 0;
    var hasMag = Sv && Sv.magLevel ? Sv.magLevel(G.ship) > 0 : false;
    var T = Sv && (lvl || hasMag) ? scannerTarget() : null;
    if (!T) return null;
    var pic = scanPicture(Sv, T, ui, lvl, hasMag);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(pic, x, y, w, h);
    ctx.strokeStyle = 'rgba(74,151,176,0.5)';
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    var sc2 = scanShipCell(Sv, T.body);
    if (sc2 !== null) {
      var flip = scanFlip(T.body);
      var lo = sc2 % Sv.LON_BINS, la = Math.floor(sc2 / Sv.LON_BINS);
      var px = x + (scanX(lo, flip, Sv.LON_BINS) + 0.5) / Sv.LON_BINS * w;
      var py = y + (Sv.LAT_BINS - 1 - la + 0.5) / Sv.LAT_BINS * h;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
    return sc2;
  }

  /* --- Shift+F2: manoeuvre nodes ------------------------------------------ */
  function drawNodeScreen(ctx, w, bottom) {
    var top = modeFrame(ctx, w, bottom, 'MANOEUVRE PLANNING',
                        'I place   ·   ± adjust   ·   \\ execute   ·   F1 back to flying');
    var pad = 14;
    var colW = (w - pad * 3) / 2;
    var h = Math.min(tileHeight(colW), bottom - top - pad * 2);
    tile(ctx, pad, top + pad, colW, h, drawNodePage);
    tile(ctx, pad * 2 + colW, top + pad, colW, h, drawOrbitPage);

    ctx.save();
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.6)';
    ctx.fillText('The node is drawn on the world, not on this screen — F1 to watch it.',
                 pad + 4, top + pad * 2 + h + 16);
    ctx.restore();
  }


  /* A REAL spectrograph pointed at a star during a transit reads planet
   * count and atmospheric composition off the light directly — that is
   * genuinely remote-observable, unlike a port list or a government, which
   * are not. `Gen.generateSystem` is pure and deterministic, so calling it
   * early for a system nobody has flown to yet produces exactly the same
   * bodies a visit would — this is not "cheating" a peek at hidden data,
   * it is the same data a visit was always going to reveal, read sooner.
   *
   * Cached in the SAME `G.systemCache` a visit uses (`systemFor` in
   * main.js), because the two are the same computation; `G.visited` alone
   * is what decides how much of it a caller is allowed to show. Calling
   * this for a star never marks it visited. */
  function previewSystem(star) {
    G.systemCache = G.systemCache || {};
    if (!G.systemCache[star.id]) {
      /* the same call systemFor makes in main.js: owner, or empty */
      G.systemCache[star.id] = Gen.generateSystem(star.seed, Galaxy.systemOpts(G.galaxy, star));
    }
    return G.systemCache[star.id];
  }

  /* ---- the star map -----------------------------------------------------
   * A top-down plot of the cluster with height shown as a stem, which is
   * the same idiom the radar uses for the same reason: a flat scatter of a
   * hundred and fifty stars tells you nothing about which of two candidates
   * is actually the shorter hop, and a stem tells you instantly.
   *
   * The map is centred on the CLUSTER, not on you, so its shape stays put
   * as you travel and you can build a mental picture of where things are.
   * The reachable circle moves with you instead. */
  /* ---- TERRITORY, AS A MAP RATHER THAN A GLOW ----------------------------
   *
   * Astra: "I want you to better define the edges of faction space, where
   * we demarcate it by filling in the space within the borders with the
   * faction colors. The color should be more saturated the more control
   * that faction has in each system. Borders are demarcated with dotted
   * lines, bold, and of the faction's color."
   *
   * What this replaces was a soft radial glow around each capital, which
   * has two things wrong with it: a circle is not a border, and it was
   * drawn for every power in the galaxy whether or not the player had ever
   * heard of them — a chart that knows more than the pilot does.
   *
   * SO IT IS BUILT FROM WHAT YOU HAVE CHARTED, and only that. Every cell of
   * a coarse grid over the plot takes the flag of the nearest charted star,
   * out to a maximum reach, so space you know nothing about stays black and
   * the map genuinely is something you assemble by flying. The first sheet
   * you buy visibly grows the territory around you, which is the whole
   * point of charts being purchasable.
   *
   * Two-dimensional on purpose. The plot draws height as a stem under each
   * star and classifies in the plane, because a region is a thing you read
   * with your eye and your eye is looking at the plane.
   *
   * CACHED, because the field is thousands of nearest-star searches and it
   * changes only when you chart something new or the window resizes. The
   * key is exactly the set of inputs: how much you know, and how big the
   * plot is.
   */
  function factionRgb(hex) {
    var n = parseInt(String(hex || '#888888').slice(1), 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }

  var TERRITORY_CELL = 8;          // px; the grain of the fill
  var TERRITORY_REACH_LY = 6.5;    // how far a charted star's flag carries
  var TERRITORY_MIN_ALPHA = 0.10;  // a barely-held system is still visible
  var TERRITORY_MAX_ALPHA = 0.38;  // and a capital is never a solid block
  var terrCache = null;

  function chartedStars() {
    var out = [];
    var stars = (G.galaxy && G.galaxy.stars) || [];
    for (var i = 0; i < stars.length; i++) {
      if (G.charted && G.charted[stars[i].id] && stars[i].factionId) out.push(stars[i]);
    }
    return out;
  }

  /* The powers whose space you have actually charted, in galaxy order. */
  function chartedFactions() {
    var seen = {}, out = [];
    var stars = chartedStars();
    for (var i = 0; i < stars.length; i++) seen[stars[i].factionId] = true;
    (G.galaxy.factions || []).forEach(function (f) { if (seen[f.id]) out.push(f); });
    return out;
  }

  /* ANCHORED TO THE GALAXY, NOT TO THE PLOT (2026-11-03, the zoomable
   * chart). The grid used to start at the plot's top-left corner, which was
   * fine while the galaxy never moved under it. Once the chart pans, a grid
   * pinned to the plot would have to be rebuilt every frame of a drag —
   * thousands of nearest-star searches and a full repaint, sixty times a
   * second. So a cell is now numbered from the galaxy's ORIGIN at the
   * current scale: column c is the strip of the screen starting c cells
   * right of where (0, 0) is drawn. Panning moves the origin, the cells move
   * with it, and the cached picture is simply blitted somewhere else.
   *
   * The field covers the view plus a margin on each side, so a drag stays
   * inside what was computed for a while; it is rebuilt when the view
   * leaves that, when the scale changes, or when you chart something. With
   * the chart zoomed all the way out there is nowhere to pan, so no margin
   * is paid for.
   *
   * xf is the chart transform (chartXf): scale in px per ly, and (ox, oy)
   * the screen position of the galaxy's origin. plot is the plot square. */
  function territoryField(plot, xf, pannable) {
    var stars = chartedStars();
    var cell = TERRITORY_CELL, scale = xf.scale;
    var c0 = Math.floor((plot.x0 - xf.ox) / cell), c1 = Math.ceil((plot.x0 + plot.size - xf.ox) / cell);
    var r0 = Math.floor((plot.y0 - xf.oy) / cell), r1 = Math.ceil((plot.y0 + plot.size - xf.oy) / cell);
    var base = stars.length + '|' + Math.round(scale * 1000) + '|' + (G.seed || '');
    if (terrCache && terrCache.base === base &&
        c0 >= terrCache.c0 && c1 <= terrCache.c0 + terrCache.nc &&
        r0 >= terrCache.r0 && r1 <= terrCache.r0 + terrCache.nr) return terrCache;

    var mg = pannable ? Math.ceil(plot.size / 4 / cell) : 0;
    c0 -= mg; r0 -= mg; c1 += mg; r1 += mg;
    var nc = Math.max(2, c1 - c0), nr = Math.max(2, r1 - r0);
    var reachPx = TERRITORY_REACH_LY * scale;
    var owner = new Array(nc * nr), ctl = new Array(nc * nr);
    var gx = [], gy = [], near = [], i;
    /* Star positions relative to the ORIGIN'S screen point, once, rather
     * than per cell. The stem is deliberately not applied: a star's dot is
     * drawn lifted by its height but its territory belongs where it is on
     * the floor of the plot, and lifting the region too would slide every
     * border off its own stars.
     *
     * And only the stars whose flag can reach the field at all. Zoomed in,
     * that is a few dozen of the galaxy's charted hundreds, which is what
     * keeps a rebuild in the middle of a drag cheap. */
    var fx0 = c0 * cell - reachPx, fx1 = (c0 + nc) * cell + reachPx;
    var fy0 = r0 * cell - reachPx, fy1 = (r0 + nr) * cell + reachPx;
    for (i = 0; i < stars.length; i++) {
      var sx = stars[i].x * scale, sy = -stars[i].y * scale;
      if (sx < fx0 || sx > fx1 || sy < fy0 || sy > fy1) continue;
      gx.push(sx); gy.push(sy); near.push(stars[i]);
    }

    for (var r = 0; r < nr; r++) {
      var py2 = (r0 + r + 0.5) * cell;
      for (var c = 0; c < nc; c++) {
        var px2 = (c0 + c + 0.5) * cell;
        var best = -1, bestD = reachPx * reachPx;
        for (i = 0; i < near.length; i++) {
          var ddx = px2 - gx[i], ddy = py2 - gy[i];
          var d2 = ddx * ddx + ddy * ddy;
          if (d2 < bestD) { bestD = d2; best = i; }
        }
        var k = r * nc + c;
        if (best < 0) { owner[k] = null; ctl[k] = 0; continue; }
        owner[k] = near[best].factionId;
        /* Control of the SYSTEM, faded toward the edge of that star's
         * reach — so a lone charted system reads as a claim that runs out
         * rather than as a hard-edged tile, and a cluster of them reads as
         * one region. */
        var fade = 1 - Math.sqrt(bestD) / reachPx;
        ctl[k] = Galaxy.control(G.galaxy, near[best]) * (0.45 + 0.55 * fade);
      }
    }
    terrBuilds++;
    terrCache = { base: base, key: base + '|' + c0 + ',' + r0 + ',' + nc + ',' + nr,
                  nc: nc, nr: nr, c0: c0, r0: r0,
                  x0: c0 * cell, y0: r0 * cell, owner: owner, ctl: ctl };
    return terrCache;
  }
  var terrBuilds = 0;   // how many times the field was rebuilt — the tests read it

  /* PAINTED ONCE, THEN BLITTED. Measured: drawing the fill and the borders
   * live cost 4,900 fillRects and one border sweep per power every frame,
   * and took a fully-charted galaxy from 77 fps to 15. The field was
   * already cached; the PICTURE of it now is too, on an offscreen surface
   * keyed the same way, so a frame costs one drawImage and the whole thing
   * is rebuilt only when you chart something new, the scale changes, or a
   * pan runs off the edge of what was painted.
   *
   * Falls back to drawing straight onto the chart when there is no document
   * to make a canvas from — the headless test harness, which cares that the
   * right things are drawn rather than how fast. */
  var terrSurface = null;

  function territorySurface(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    if (!terrSurface || terrSurface.canvas.width !== w || terrSurface.canvas.height !== h) {
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var c2 = cv.getContext ? cv.getContext('2d') : null;
      if (!c2) return null;
      terrSurface = { canvas: cv, ctx: c2, key: null };
    }
    return terrSurface;
  }

  function drawTerritory(ctx, plot, xf, pannable) {
    if (!G.galaxy || !G.charted) return;
    var f = territoryField(plot, xf, pannable);
    var cw = f.nc * TERRITORY_CELL, ch = f.nr * TERRITORY_CELL;
    /* The origin rounded to a whole pixel: the cells inside the picture are
     * snapped to whole pixels (see paintTerritory), and blitting them at a
     * fractional offset would smear every seam the snapping was for. */
    var ox = Math.round(xf.ox), oy = Math.round(xf.oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x0, plot.y0, plot.size, plot.size);
    ctx.clip();
    var surf = territorySurface(cw, ch);
    if (surf) {
      if (surf.key !== f.key) {
        surf.ctx.clearRect(0, 0, surf.canvas.width, surf.canvas.height);
        paintTerritory(surf.ctx, f, -f.x0, -f.y0);
        surf.key = f.key;
      }
      ctx.drawImage(surf.canvas, ox + f.x0, oy + f.y0);
    } else {
      paintTerritory(ctx, f, ox, oy);
    }
    ctx.restore();
  }

  /* The fill and the borders. The field's coordinates are relative to the
   * galaxy origin's screen point, so (ox, oy) is that point when painting
   * straight onto the chart, and minus the field's own corner when painting
   * into the offscreen surface. The grid is nc wide and nr tall — no longer
   * square, since the margin a pan needs is cut to what the galaxy has. */
  function paintTerritory(ctx, f, ox, oy) {
    var nc = f.nc, nr = f.nr, cell = TERRITORY_CELL;
    var byId = G.galaxy.factionById || {};
    var r, c, k;

    /* THE FILL. One pass, no gradients: a flat wash per cell whose alpha is
     * the control reading. Cells of the same colour abut exactly, so a
     * region reads as one shape rather than as tiles. */
    for (r = 0; r < nr; r++) {
      for (c = 0; c < nc; c++) {
        k = r * nc + c;
        var fid = f.owner[k];
        if (!fid) continue;
        var fac = byId[fid];
        if (!fac) continue;
        var a = TERRITORY_MIN_ALPHA +
                (TERRITORY_MAX_ALPHA - TERRITORY_MIN_ALPHA) * Math.max(0, Math.min(1, f.ctl[k]));
        ctx.fillStyle = 'rgba(' + factionRgb(fac.color) + ',' + a.toFixed(3) + ')';
        /* SNAPPED TO WHOLE PIXELS, and tiled edge to edge rather than with
         * an overlap. Two translucent cells that overlap by half a pixel
         * double their alpha along the seam, which drew a faint grid across
         * every region — the fill looked like graph paper. Rounding both
         * edges and taking the difference makes neighbouring cells share an
         * edge exactly. */
        var xa = Math.round(ox + f.x0 + c * cell), xb = Math.round(ox + f.x0 + (c + 1) * cell);
        var ya = Math.round(oy + f.y0 + r * cell), yb = Math.round(oy + f.y0 + (r + 1) * cell);
        ctx.fillRect(xa, ya, xb - xa, yb - ya);
      }
    }

    /* THE BORDERS. Bold and dotted, in the faction's own colour, drawn one
     * faction at a time so each side of a shared border gets its own line.
     * Each line is inset half a cell toward the side that owns it, which is
     * what keeps two abutting powers from stroking the same pixels twice
     * and cancelling into one muddy dash — and it reads, correctly, as two
     * powers each marking their own edge.
     *
     * The edge against UNCHARTED space is drawn too, and it is the most
     * informative line on the map: it is the edge of what you know, in the
     * colour of whoever you would be flying away from. */
    var inset = 2.5;
    (G.galaxy.factions || []).forEach(function (fac) {
      var path = null;
      function seg(ax, ay, bx, by) {
        if (!path) { ctx.beginPath(); path = true; }
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
      for (var r2 = 0; r2 < nr; r2++) {
        for (var c2 = 0; c2 < nc; c2++) {
          var kk = r2 * nc + c2;
          if (f.owner[kk] !== fac.id) continue;
          var X = ox + f.x0 + c2 * cell, Y = oy + f.y0 + r2 * cell;
          if (c2 === 0 || f.owner[kk - 1] !== fac.id) {
            seg(X + inset, Y, X + inset, Y + cell);
          }
          if (c2 === nc - 1 || f.owner[kk + 1] !== fac.id) {
            seg(X + cell - inset, Y, X + cell - inset, Y + cell);
          }
          if (r2 === 0 || f.owner[kk - nc] !== fac.id) {
            seg(X, Y + inset, X + cell, Y + inset);
          }
          if (r2 === nr - 1 || f.owner[kk + nc] !== fac.id) {
            seg(X, Y + cell - inset, X + cell, Y + cell - inset);
          }
        }
      }
      if (!path) return;
      ctx.strokeStyle = fac.color;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 0.85;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    });
  }

  /* ---- THE CHART ZOOMS (2026-11-03) ------------------------------------
   * Astra: "on the F6 tab I want to be able to zoom in and out on the
   * galaxy now that we're running so many more stars."
   *
   * 450 stars in a 73 ly disc, drawn at one scale on a ~600 px plot, is
   * about 4 px per light year — the median gap to a star's nearest
   * neighbour is under a dozen pixels, so the middle of the cluster was a
   * smear you could click into but not read. The chart now has a VIEW:
   * a zoom (1 = the whole galaxy, the old fixed scale) and the galaxy
   * point at the middle of the plot. Everything below that turns galaxy
   * coordinates into pixels goes through chartXf, so the stars, the
   * territory, the range ring, the click and the edge arrows cannot
   * disagree about where a star is.
   *
   * THE CLOSEST ZOOM IS A PIXEL DENSITY, not a multiple, so it means the
   * same thing on any window: CHART_MAX_PX_PER_LY. Measured on 40 seeds
   * (kawartha and seed1..seed39, 18,000 stars, every galaxy 72.75 ly in
   * radius): the gap from a star to its nearest neighbour AS DRAWN — x
   * across, y plus height up, because the stem lifts each dot — has a
   * median of 2.89 ly, a 10th percentile of 1.17, a 5th of 0.83 and a 1st
   * of 0.34. (In 3D the same gaps are 4.22, 2.24, 1.84 and 1.33 ly, and
   * the closest pair of all is 1.10.) An earlier pass over a different
   * 39 got 2.86 / 1.16 / 0.80 — the numbers are the galaxy's, not luck. At 40 px/ly the 5th-percentile pair sits
   * 32 px apart, two dots plus their rings with daylight between, and a
   * median pair 114 px apart, room for both names. The view at that zoom
   * is still ~15 ly across, so there are always neighbours in it. What
   * no zoom fixes is the 1%: pairs closer than 0.35 ly on screen, which
   * are not close in space (nothing is nearer than 1.1 ly in 3D) but
   * stacked one above the other — the stems tell them apart, not the
   * scale. Pushing past 40 for their sake would leave the plot holding
   * one star. */
  var CHART_MAX_PX_PER_LY = 40;
  var CHART_KEY_STEP = 1.25;        // + and -, the same step the flight camera uses
  var CHART_WHEEL_BASE = 1.0016;    // per wheel unit, again the camera's
  var CHART_CLICK_PX = 12;          // how near a click must land to a dot to pick it
  var CHART_DRAG_PX = 4;            // movement before a press becomes a pan, not a click

  /* Kept for the SESSION, by seed: closing the chart drops G.starMap (a
   * dozen places do, on purpose), and coming back to it to find the zoom
   * thrown away would make zooming in a chore you repeat. Not saved — a
   * view is not a fact about the career. */
  var chartMemory = null;
  var chartPlot = null;    // last frame's plot square, for the wheel and the pointer
  var chartPress = null;   // a press on the plot: a click until it moves, then a pan
  var chartStat = { drawn: 0, culled: 0, labels: 0, ms: 0, builds: 0 };

  function chartFit(plotSize, radius) { return (plotSize / 2) / (radius * 1.06); }
  function chartMaxZoom(plot) { return Math.max(1, CHART_MAX_PX_PER_LY / plot.fit); }

  /* The transform: scale in px per ly, and the screen point of the
   * galaxy's origin. Screen y runs down, galaxy y up. */
  /* ---- THE CAMERA (2026-11-13) ----------------------------------------
   * Elevation is the angle you are looking down from:
   *
   *   CHART_EL_MAX (90 deg)  straight down. A plan view - height is
   *                          invisible, and this is the map as it was.
   *   CHART_EL_MIN (10 deg)  nearly edge-on. The disc is a band, and
   *                          height is most of what you can see.
   *
   * Never ALL the way to zero: at exactly edge-on the z = 0 plane is a
   * line on the screen, screen-to-galaxy stops having an answer, and
   * panning and the wheel would both divide by nothing.
   *
   *   u = x cos a - y sin a                 (across the screen)
   *   Y = x sin a + y cos a                 (into the tilt)
   *   v = Y sin e + z k cos e               (up the screen)
   *
   * At e = 90 that is v = Y and the height term vanishes; at e = 0 it is
   * v = z k and the disc has gone edge-on. k is the depth exaggeration,
   * and it touches NOTHING but this projection. */
  var CHART_EL_MIN = 10 * Math.PI / 180, CHART_EL_MAX = Math.PI / 2;
  var CHART_EL_DEFAULT = 68 * Math.PI / 180;
  var CHART_DEPTHS = [1, 2, 3, 5];
  var CHART_ROT_PER_PX = 0.0075;        // radians of yaw per pixel dragged

  function chartCam(view) {
    var a = view.yaw || 0;
    var e = view.el === undefined ? CHART_EL_DEFAULT : view.el;
    return { ca: Math.cos(a), sa: Math.sin(a),
             ce: Math.cos(e), se: Math.sin(e),
             k: view.depth || 1, el: e, yaw: a };
  }
  /* A galaxy point to the view plane: across, up, and how far away (which
   * only sorting and the stems care about). */
  function chartProj(cam, x, y, z) {
    var u = x * cam.ca - y * cam.sa;
    var Y = x * cam.sa + y * cam.ca;
    var kz = (z || 0) * cam.k;
    return { u: u, v: Y * cam.se + kz * cam.ce, w: Y * cam.ce - kz * cam.se };
  }
  /* And back again, onto the z = 0 plane - the only inverse that has an
   * answer, and the only one anything asks for. */
  function chartUnproj(cam, u, v) {
    var Y = v / cam.se;                  // z = 0, so v = Y sin e
    return { x: u * cam.ca + Y * cam.sa, y: -u * cam.sa + Y * cam.ca };
  }

  function chartXf(view, plot) {
    var s = plot.fit * view.z;
    var cam = chartCam(view);
    /* The view is centred on a point of the z = 0 plane, so the centre
     * means the same thing however the camera is turned. */
    var c = chartProj(cam, view.gx, view.gy, 0);
    return { scale: s, cam: cam, ox: plot.cx - c.u * s, oy: plot.cy + c.v * s };
  }
  function chartToScreen(xf, gx, gy, gz) {
    var p = chartProj(xf.cam, gx, gy, gz || 0);
    return { x: xf.ox + p.u * xf.scale, y: xf.oy - p.v * xf.scale };
  }
  function chartToGalaxy(xf, sx, sy) {
    return chartUnproj(xf.cam, (sx - xf.ox) / xf.scale, (xf.oy - sy) / xf.scale);
  }
  /* Where a star's DOT is drawn: lifted off its floor point by its stem. */
  function chartDot(xf, s) { return chartToScreen(xf, s.x, s.y, s.z); }
  /* And the foot of that stem - the same star with its height taken off,
   * which is the point on the plane it is actually above. */
  function chartFloor(xf, s) { return chartToScreen(xf, s.x, s.y, 0); }

  /* Zoom between the whole galaxy and the closest; the centre kept where
   * the plot still has galaxy in it. Per axis, so at full zoom-out there is
   * no slack at all and the galaxy sits exactly where the old chart drew
   * it, and zoomed in the view can reach the rim star with it mid-plot. */
  function chartClamp(view, plot) {
    view.z = Math.max(1, Math.min(chartMaxZoom(plot), view.z));
    var half = (plot.size / 2) / (plot.fit * view.z);
    var lim = Math.max(0, plot.radius * 1.06 - half);
    view.gx = Math.max(-lim, Math.min(lim, view.gx));
    view.gy = Math.max(-lim, Math.min(lim, view.gy));
    return view;
  }

  /* Zoom by `factor` about a screen point, keeping the galaxy point under
   * it where it is — which is what makes the wheel feel like reaching into
   * the map rather than the map sliding away from the cursor. Only the
   * clamp can move that point, and only at the edges of the galaxy. */
  function chartZoomAt(view, plot, factor, sx, sy) {
    var under = chartToGalaxy(chartXf(view, plot), sx, sy);
    view.z = Math.max(1, Math.min(chartMaxZoom(plot), view.z * factor));
    var s = plot.fit * view.z;
    /* SOLVED IN THE VIEW PLANE, not in galaxy x and y (2026-11-13). The old
     * form subtracted screen pixels straight off the centre's galaxy
     * coordinates, which is only the same thing while the map is looking
     * straight down. Turned, it drifted - six or seven light years over
     * thirty notches of the wheel, which galaxyzoom.test.js caught at once.
     *
     * The centre we want is the one that puts `under` back under the
     * cursor: work in (u, v), where the projection IS a scale and an
     * offset, then come back to the plane. */
    var cam = chartCam(view);
    var pu = chartProj(cam, under.x, under.y, 0);
    var c = chartUnproj(cam, pu.u - (sx - plot.cx) / s, pu.v + (sy - plot.cy) / s);
    view.gx = c.x;
    view.gy = c.y;
    return chartClamp(view, plot);
  }
  function chartPan(view, plot, dxPx, dyPx) {
    var s = plot.fit * view.z;
    /* Drag the PLANE, not the axes: the centre moves along whichever way
     * the camera is facing, so a pan goes where the mouse went however the
     * map is turned. */
    var cam = chartCam(view);
    var now = chartProj(cam, view.gx, view.gy, 0);
    var to = chartUnproj(cam, now.u - dxPx / s, now.v + dyPx / s);
    view.gx = to.x;
    view.gy = to.y;
    return chartClamp(view, plot);
  }

  /* Turning it. Across the screen spins the disc; up and down tilts it,
   * and the tilt stops short of edge-on so the plane never becomes a
   * line. */
  function chartTurn(view, dxPx, dyPx) {
    view.yaw = ((view.yaw || 0) + dxPx * CHART_ROT_PER_PX) % (Math.PI * 2);
    var e = (view.el === undefined ? CHART_EL_DEFAULT : view.el) + dyPx * CHART_ROT_PER_PX;
    view.el = Math.max(CHART_EL_MIN, Math.min(CHART_EL_MAX, e));
    return view;
  }
  /* Straight down again, facing the way it was built. */
  function chartLevel(view) {
    view.yaw = 0; view.el = CHART_EL_MAX;
    return view;
  }
  function chartDepth(view, step) {
    var i = CHART_DEPTHS.indexOf(view.depth || 1);
    if (i < 0) i = 0;
    i = Math.max(0, Math.min(CHART_DEPTHS.length - 1, i + (step || 1)));
    view.depth = CHART_DEPTHS[i];
    return view.depth;
  }
  /* Centre on a star's dot, as drawn — its height included, or a star
   * high above the plane would come to rest well off the middle. */
  function chartCentreOn(view, plot, s) {
    /* Its floor point, not its dot: the centre is a place on the plane,
     * and a star high above it should sit above the middle rather than
     * dragging the middle up to meet it. */
    view.gx = s.x; view.gy = s.y;
    return chartClamp(view, plot);
  }
  function chartInPlot(plot, x, y, margin) {
    margin = margin || 0;
    return x >= plot.x0 - margin && x <= plot.x0 + plot.size + margin &&
           y >= plot.y0 - margin && y <= plot.y0 + plot.size + margin;
  }

  /* The star a click means: the nearest DRAWN dot within reach of the
   * pointer, among the ones actually on the plot. Nearest rather than the
   * first box hit — the old per-star 18 px boxes overlapped wherever two
   * dots were close, and the later one in galaxy order won the click
   * whether or not it was the one under the pointer. */
  function chartPick(stars, xf, plot, sx, sy, maxPx) {
    if (!chartInPlot(plot, sx, sy)) return null;
    var best = null, bestD = (maxPx || CHART_CLICK_PX) * (maxPx || CHART_CLICK_PX);
    for (var i = 0; i < stars.length; i++) {
      var d = chartDot(xf, stars[i]);
      var dx = d.x - sx, dy = d.y - sy, d2 = dx * dx + dy * dy;
      if (d2 < bestD && chartInPlot(plot, d.x, d.y)) { bestD = d2; best = stars[i]; }
    }
    return best;
  }

  /* A round number of light years between 60 and 150 px long. */
  function chartScaleBar(scale) {
    var steps = [0.5, 1, 2, 5, 10, 20, 50];
    var pick = steps[0];
    for (var i = 0; i < steps.length; i++) if (steps[i] * scale <= 150) pick = steps[i];
    return { ly: pick, px: pick * scale };
  }

  /* Where an off-plot point's arrow goes: on the line from the plot's
   * middle toward it, pulled in to `inset` px inside the edge. */
  function chartEdge(plot, x, y, inset) {
    var dx = x - plot.cx, dy = y - plot.cy;
    var half = plot.size / 2 - inset;
    var k = half / Math.max(Math.abs(dx), Math.abs(dy), 1e-9);
    return { x: plot.cx + dx * k, y: plot.cy + dy * k, ang: Math.atan2(dy, dx) };
  }

  /* A CIRCLE, ONLY AS MUCH OF IT AS THE PLOT SHOWS. Zoomed in, the 70 ly
   * distance ring is 2,800 px across and the dashed reach ring several
   * hundred dashes round, nearly all of it outside the clip — and a canvas
   * strokes the whole of a path before it clips any of it. So: nothing
   * when the circle misses the plot or swallows it whole, the full circle
   * when it is small, and otherwise just the arc that faces the plot. */
  function chartArc(ctx, plot, x, y, R) {
    var corners = [[plot.x0, plot.y0], [plot.x0 + plot.size, plot.y0],
                   [plot.x0, plot.y0 + plot.size], [plot.x0 + plot.size, plot.y0 + plot.size]];
    var dmax = 0, i;
    for (i = 0; i < 4; i++) dmax = Math.max(dmax, Math.hypot(corners[i][0] - x, corners[i][1] - y));
    var nx = Math.max(plot.x0, Math.min(plot.x0 + plot.size, x));
    var ny = Math.max(plot.y0, Math.min(plot.y0 + plot.size, y));
    var dmin = Math.hypot(nx - x, ny - y);
    if (R < dmin - 2 || R > dmax + 2) return false;
    ctx.beginPath();
    if (dmin === 0 || R < plot.size) { ctx.arc(x, y, R, 0, K.TAU); return true; }
    var a = Math.atan2(plot.cy - y, plot.cx - x), half = 0;
    for (i = 0; i < 4; i++) {
      var da = Math.atan2(corners[i][1] - y, corners[i][0] - x) - a;
      while (da > Math.PI) da -= K.TAU;
      while (da < -Math.PI) da += K.TAU;
      half = Math.max(half, Math.abs(da));
    }
    ctx.arc(x, y, R, a - half - 0.02, a + half + 0.02);
    return true;
  }

  /* LABELS THAT DO NOT OVERPRINT. Candidates arrive sorted by priority
   * (selected, here, plotted course, visited, in reach, the rest) and each
   * takes the first of four places around its dot — beside it either way,
   * above, below — that collides with nothing already placed and stays on
   * the plot. A name that has nowhere to go is dropped, never squeezed:
   * the high-priority names were placed first, so what is lost is always
   * the least important. Widths are counted, not measured — the face is
   * monospace, and measureText per candidate per frame is the expensive
   * way to learn a number that is length times a constant. */
  function chartCharW(px) { return px * 0.61; }
  function chartLabels(cands, plot, maxN, blocked, edgeCost) {
    var placed = [];
    /* Things a name must not land on either — the scale bar, the buttons,
     * the news line, the other stars' dots — go in as boxes that are
     * already "placed", and are taken off the front before returning. */
    var nBlocked = (blocked || []).length;
    for (var bi = 0; bi < nBlocked; bi++) placed.push(blocked[bi]);
    var forced = [];
    for (var i = 0; i < cands.length && placed.length - nBlocked < (maxN || 80); i++) {
      var c = cands[i];
      var tw = c.text.length * chartCharW(c.size), th = c.size + 2;
      var gap = c.r + 6;
      var spots = [
        [c.x + gap, c.y - th / 2], [c.x - gap - tw, c.y - th / 2],
        [c.x - tw / 2, c.y - gap - th], [c.x - tw / 2, c.y + gap]
      ];
      for (var j = 0; j < spots.length; j++) {
        var bx = spots[j][0], by = spots[j][1];
        /* SLID ALONG ITS OWN SIDE, not dropped, when it only overhangs the
         * edge that way. A dot a few pixels off the bottom of the plot had
         * every one of its four spots hanging over that edge and lost its
         * name at the closest zoom, where there is room for every name.
         * A name beside its dot may slide up or down, one above or below
         * may slide across; neither can slide onto its own dot. */
        var lo = plot.y0 + 2, hi = plot.y0 + plot.size - 2 - th;
        var lx = plot.x0 + 2, hx = plot.x0 + plot.size - 2 - tw;
        if (j < 2) by = Math.max(lo, Math.min(hi, by));
        else bx = Math.max(lx, Math.min(hx, bx));
        if (bx < plot.x0 + 2 || by < plot.y0 + 2 ||
            bx + tw > plot.x0 + plot.size - 2 || by + th > plot.y0 + plot.size - 2) continue;
        var hit = false;
        for (var k = 0; k < placed.length; k++) {
          var p = placed[k];
          if (bx < p.bx + p.bw + 3 && bx + tw + 3 > p.bx && by < p.by + p.bh && by + th > p.by) { hit = true; break; }
        }
        if (hit) continue;
        placed.push({ c: c, bx: bx, by: by, bw: tw, bh: th });
        break;
      }
      /* WHERE YOU ARE AND WHERE YOU ARE POINTING ARE ALWAYS NAMED. In the
       * crowded middle at the whole-galaxy zoom every spot round them
       * touches some other dot, and the first version of this dropped both
       * names — the two the chart had always shown. For those two, other
       * stars' dots do not count; furniture and names already placed still
       * do. */
      /* AND THEY TOO PICK THE CLEAREST SIDE (2026-11-03). Ignoring the
       * dots outright meant taking the first legal spot whatever lay
       * under it, and at the whole-galaxy zoom that put "Rhoameor" across
       * a territory border and its neighbours' dots, and "Mirven" on the
       * dots beside it, when a spot a little further out was clear. So a
       * forced name now looks at sixteen bearings at several reaches and
       * takes the one covering the fewest dots and border cells, nearer
       * winning a tie; a name pushed out past the first reach is drawn
       * with a leader back to its dot (`lead`), so it still says which
       * dot it belongs to. Names and furniture may still never be covered.
       *
       * The two are placed TOGETHER, not one after the other: on kawartha
       * they are 4 px apart, and the first, placed greedily, took the
       * only clear side the second had. They are deferred until the
       * first ordinary name, so nothing else takes their room first. */
      if (j === spots.length && c.tier <= 1) forced.push({ c: c, tw: tw, th: th, gap: gap });
      var nextT = i + 1 < cands.length ? cands[i + 1].tier : 99;
      if (forced.length && nextT > 1) { placeForced(forced, plot, placed, edgeCost); forced = []; }
    }
    return placed.slice(nBlocked);
  }
  /* Reaches past the dot's own gap, in px, and sixteen bearings at each:
   * measured on kawartha at the whole-galaxy zoom, the nearest clear side
   * for Mirven is ~20 px out and for Rhoameor ~15, where the four spots
   * the ordinary names try are all on a neighbour. */
  var CHART_FORCED_REACH = [0, 6, 12, 20, 30];
  var CHART_FORCED_BEARINGS = 16;
  function boxesTouch(a, b, m) {
    return a.bx < b.bx + b.bw + m && a.bx + a.bw + m > b.bx && a.by < b.by + b.bh && a.by + a.bh > b.by;
  }
  /* Every legal spot for one forced name, with its cost. */
  function forcedSpots(f, plot, placed, edgeCost) {
    var c = f.c, tw = f.tw, th = f.th, out = [];
    var lo = plot.y0 + 2, hi = plot.y0 + plot.size - 2 - th;
    var lx = plot.x0 + 2, hx = plot.x0 + plot.size - 2 - tw;
    for (var ri = 0; ri < CHART_FORCED_REACH.length; ri++) {
      var g = f.gap + CHART_FORCED_REACH[ri];
      for (var ai = 0; ai < CHART_FORCED_BEARINGS; ai++) {
        /* The box's centre pushed out along the bearing until its near
         * side is g from the dot. */
        var an = ai * K.TAU / CHART_FORCED_BEARINGS, ux = Math.cos(an), uy = Math.sin(an);
        var mcx = c.x + ux * (g + (tw / 2) * Math.abs(ux)), mcy = c.y + uy * (g + (th / 2) * Math.abs(uy));
        var bx = Math.max(lx, Math.min(hx, mcx - tw / 2));
        var by = Math.max(lo, Math.min(hi, mcy - th / 2));
        /* Clamped onto the plot, it must not have slid onto its own dot:
         * that is the one overlap the reader cannot work out. */
        if (c.x + c.r > bx && c.x - c.r < bx + tw && c.y + c.r > by && c.y - c.r < by + th) continue;
        var box = { c: c, bx: bx, by: by, bw: tw, bh: th, lead: ri > 0 };
        var dots = 0, hit = false;
        for (var k = 0; k < placed.length && !hit; k++) {
          var p = placed[k];
          /* Names keep the 3 px gutter they keep from each other; a dot
           * only has to be not under the text. */
          if (!boxesTouch(box, p, p.dot ? 0 : 3)) continue;
          if (p.dot) dots++; else hit = true;
        }
        if (hit) continue;
        box.dotsUnder = dots;
        box.cost = dots * 4 + (edgeCost ? edgeCost(bx, by, tw, th) : 0) + ri * 0.75 + ai * 0.001;
        out.push(box);
      }
    }
    return out.sort(function (a, b) { return a.cost - b.cost; });
  }
  function placeForced(forced, plot, placed, edgeCost) {
    var A = forcedSpots(forced[0], plot, placed, edgeCost);
    if (forced.length === 1) { if (A.length) placed.push(A[0]); return; }
    var B = forcedSpots(forced[1], plot, placed, edgeCost);
    /* Each other's dot counts against a spot too: the pair search below
     * only keeps their names apart. */
    var dotOf = function (f) { var r = Math.max(2, f.c.r - 3); return { bx: f.c.x - r, by: f.c.y - r, bw: 2 * r, bh: 2 * r }; };
    var dA = dotOf(forced[0]), dB = dotOf(forced[1]);
    var best = null, bestCost = Infinity;
    for (var a = 0; a < A.length && A[a].cost < bestCost; a++) {
      var ca = A[a].cost + (boxesTouch(A[a], dB, 0) ? 4 : 0);
      for (var b = 0; b < B.length && ca + B[b].cost < bestCost; b++) {
        if (boxesTouch(A[a], B[b], 3)) continue;
        var cost = ca + B[b].cost + (boxesTouch(B[b], dA, 0) ? 4 : 0);
        if (cost < bestCost) { bestCost = cost; best = [A[a], B[b]]; }
      }
    }
    if (best) { placed.push(best[0]); placed.push(best[1]); return; }
    if (A.length) placed.push(A[0]);
  }
  /* How much territory border a label's box would sit on: the cells under
   * it whose owner differs from the next cell east or south — which is
   * exactly where paintTerritory strokes its dotted line. Null when no
   * field was built this frame, so a stale field from another zoom never
   * steers a name. */
  function chartEdgeCost(f, xf) {
    if (!f || !f.owner) return null;
    var cell = TERRITORY_CELL, ox = Math.round(xf.ox) + f.x0, oy = Math.round(xf.oy) + f.y0;
    return function (bx, by, bw, bh) {
      var c0 = Math.max(0, Math.floor((bx - ox) / cell)), c1 = Math.min(f.nc - 1, Math.floor((bx + bw - ox) / cell));
      var r0 = Math.max(0, Math.floor((by - oy) / cell)), r1 = Math.min(f.nr - 1, Math.floor((by + bh - oy) / cell));
      var n = 0;
      for (var r = r0; r <= r1; r++) {
        for (var c = c0; c <= c1; c++) {
          var k = r * f.nc + c, o = f.owner[k];
          if (c + 1 < f.nc && f.owner[k + 1] !== o) n++;
          if (r + 1 < f.nr && f.owner[k + f.nc] !== o) n++;
        }
      }
      return n;
    };
  }

  /* The labels' tiers, and how far in you must be before each appears. The
   * three that are about YOU — where you are, where you are pointing,
   * where you said you were going — show at every zoom; the overlap rule
   * keeps them apart. The rest come in as there is room for them to mean
   * something: at the whole-galaxy scale a name for every visited star is
   * a wall of text across the middle of the cluster. */
  var CHART_TIER_PX = [0, 0, 0, 7, 10, 16];   // px per ly: selected, here, course, visited, in reach, other

  function chartView(plot) {
    var m = G.starMap;
    if (!m.view) {
      var mem = chartMemory && chartMemory.seed === G.seed ? chartMemory : null;
      m.view = mem
        ? { z: mem.z, gx: mem.gx, gy: mem.gy, yaw: mem.yaw || 0,
            el: mem.el === undefined ? CHART_EL_DEFAULT : mem.el, depth: mem.depth || 1 }
        : { z: 1, gx: 0, gy: 0, yaw: 0, el: CHART_EL_DEFAULT, depth: 1 };
    }
    if (m.view.el === undefined) m.view.el = CHART_EL_DEFAULT;
    if (m.view.yaw === undefined) m.view.yaw = 0;
    if (!m.view.depth) m.view.depth = 1;
    chartClamp(m.view, plot);
    chartMemory = { seed: G.seed, z: m.view.z, gx: m.view.gx, gy: m.view.gy,
                    yaw: m.view.yaw, el: m.view.el, depth: m.view.depth };
    return m.view;
  }

  /* ---- input, routed here from main.js -------------------------------- */
  function chartLive() {
    return !!(G && G.starMap && G.starMap.view && chartPlot && chartPlot.seed === G.seed);
  }

  /* The wheel over the plot zooms the chart, and returns true so main.js
   * never also hands it to the flight camera behind the screen. */
  function chartWheel(x, y, deltaY) {
    if (!chartLive() || !chartInPlot(chartPlot, x, y)) return false;
    chartZoomAt(G.starMap.view, chartPlot, Math.pow(CHART_WHEEL_BASE, -deltaY), x, y);
    return true;
  }

  /* + and -: about the selected star while it is on the plot, so it stays
   * put under your eye; about the middle otherwise. */
  function chartKeyZoom(factor) {
    if (!chartLive()) return false;
    var m = G.starMap, plan = m.list && m.list[m.sel];
    var xf = chartXf(m.view, chartPlot);
    var ax = chartPlot.cx, ay = chartPlot.cy;
    if (plan) {
      var d = chartDot(xf, plan.to);
      if (chartInPlot(chartPlot, d.x, d.y)) { ax = d.x; ay = d.y; }
    }
    chartZoomAt(m.view, chartPlot, factor, ax, ay);
    return true;
  }
  /* Lay the map flat again, and step the depth exaggeration. Both return
   * true so main.js knows the key was spent on the chart. */
  function chartLevelKey() {
    if (!chartLive()) return false;
    chartLevel(G.starMap.view);
    say('Star map level — looking straight down', 3);
    return true;
  }
  function chartDepthKey(step) {
    if (!chartLive()) return false;
    var d = chartDepth(G.starMap.view, step);
    say(d > 1 ? 'Star map height exaggerated ×' + d + ' — distances unchanged'
              : 'Star map height true to scale', 4);
    return true;
  }

  function chartCentre(which) {
    if (!chartLive()) return false;
    var m = G.starMap;
    var s = which === 'here' ? G.here : (m.list[m.sel] && m.list[m.sel].to);
    if (!s) return false;
    chartCentreOn(m.view, chartPlot, s);
    return true;
  }
  function chartWhole() {
    if (!chartLive()) return false;
    G.starMap.view.z = 1;
    chartClamp(G.starMap.view, chartPlot);
    return true;
  }

  /* A press on the plot is a click until it moves CHART_DRAG_PX, then it
   * is a DRAG for the rest of the press; a click selects the nearest
   * dot. Which drag it is was decided at the press: shift or the right
   * button pans, anything else turns the galaxy - see the help line the
   * chart prints for itself. (It used to pan either way, and this
   * comment went on saying so after 1.4.0 made the chart a solid.) */
  function chartPointer(kind, x, y, mods) {
    if (kind === 'down') {
      if (!chartLive() || !chartInPlot(chartPlot, x, y)) { chartPress = null; return false; }
      /* WHICH GESTURE THIS IS, decided once at the press and held for the
       * whole drag - so a shift key let go halfway does not turn a pan
       * into a barrel roll. */
      chartPress = { x: x, y: y, lx: x, ly: y, moved: false,
                     pan: !!(mods && (mods.shift || mods.button === 2)) };
      return true;
    }
    if (!chartPress) return false;
    if (!chartLive()) { chartPress = null; return false; }
    if (kind === 'move') {
      if (!chartPress.moved && Math.hypot(x - chartPress.x, y - chartPress.y) >= CHART_DRAG_PX) {
        chartPress.moved = true;
      }
      if (chartPress.moved) {
        if (chartPress.pan) chartPan(G.starMap.view, chartPlot, x - chartPress.lx, y - chartPress.ly);
        else chartTurn(G.starMap.view, x - chartPress.lx, y - chartPress.ly);
      }
      chartPress.lx = x; chartPress.ly = y;
      return true;
    }
    if (kind === 'up') {
      var was = chartPress; chartPress = null;
      if (!was.moved) {
        var m = G.starMap;
        var hit = chartPick(G.galaxy.stars, chartXf(m.view, chartPlot), chartPlot, x, y);
        if (hit) {
          var ix = indexOfStar(m.list, hit);
          if (ix >= 0) m.sel = ix;
        }
      }
      return true;
    }
    return false;
  }
  /* Which row of the candidate list is this star? The chart draws stars in
   * galaxy order and the list is sorted by distance, so clicking one has to
   * translate between the two. Asked once per CLICK now: it used to be
   * asked for every star on every frame, 450 x 450 comparisons a frame just
   * to build hot boxes, and it answered 0 — the nearest star — for a star
   * that was not in the list, so clicking your own star plotted a jump. */
  function indexOfStar(list, star) {
    for (var i = 0; i < list.length; i++) if (list[i].to === star) return i;
    return -1;
  }

  function drawStarMap(ctx, w, h) {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var m = G.starMap;
    m.list = jumpCandidates();
    if (m.sel >= m.list.length) m.sel = Math.max(0, m.list.length - 1);
    var plan = m.list[m.sel];

    var pw = Math.min(1080, w - 40), ph = Math.min(700, h - 40);
    var px = (w - pw) / 2, py = (h - ph) / 2;
    panel(ctx, px, py, pw, ph, true);

    /* Twelve pixels shorter than it was, for the second line of keys under
     * it — the zoom's keys are the ones nobody would guess. */
    var plotSize = Math.min(ph - 102, pw * 0.56);
    var cx = px + 30 + plotSize / 2, cy = py + 62 + plotSize / 2;
    var plot = { x0: cx - plotSize / 2, y0: cy - plotSize / 2, size: plotSize, cx: cx, cy: cy,
                 fit: chartFit(plotSize, G.galaxy.radius), radius: G.galaxy.radius, seed: G.seed };
    var view = chartView(plot);
    chartPlot = plot;
    var xf = chartXf(view, plot);
    var scale = xf.scale;
    var zoomed = view.z > 1.0001;

    /* THE FLOOR POINT AND THE STEM (2026-11-13). `x, y` is where the star
     * stands on the z = 0 plane and `stem` is how far above it the star
     * itself is drawn — so the dot goes at (x, y - stem) and the line
     * between them is the depth cue. Both come out of the camera now, so
     * the stem leans the way the map is turned instead of always standing
     * straight up; with the map level it is zero, and the chart reads
     * exactly as it did before there was a camera. */
    function toScreen(s) {
      /* Height never moves a star sideways — yaw turns the plane, and the
       * z term only ever lands in the vertical — so the floor point's x
       * serves for both ends and the stem stays a vertical line. */
      var f = chartFloor(xf, s), d = chartDot(xf, s);
      return { x: f.x, y: f.y, stem: f.y - d.y };
    }

    var dx = px + plotSize + 56, dw = pw - plotSize - 86;

    var builds0 = terrBuilds;
    drawTerritory(ctx, plot, xf, zoomed);
    chartStat.builds += terrBuilds - builds0;

    /* Legend — the powers you have actually met, in the order the chart
     * shows them. A power whose space you have never charted is not on it:
     * a legend entry for a colour that appears nowhere on the map is a
     * spoiler with a swatch next to it. */
    if (dw > 140) {
      var seenFacs = chartedFactions();
      ctx.save();
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = '#7e93b3';
      ctx.fillText('TERRITORY', dx, py + 30);
      if (!seenFacs.length) {
        ctx.fillStyle = 'rgba(160,185,220,0.6)';
        ctx.fillText('nothing charted yet', dx, py + 48);
      }
      seenFacs.forEach(function (fac, fi) {
        var fy = py + 48 + fi * 16;
        ctx.fillStyle = fac.color;
        ctx.fillRect(dx, fy - 8, 10, 10);
        ctx.fillStyle = '#cfe0ff';
        ctx.fillText(fac.name, dx + 15, fy);
      });
      ctx.restore();
    }

    ctx.save();
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText('SLIPSPACE CHART', px + 24, py + 30);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText(G.galaxy.stars.length + ' stars   ·   here: ' + G.here.name +
                 '   ·   range ' + fmtLy(Galaxy.maxRange(G.ship)) +
                 ' on ' + G.ship.fuel.toFixed(1) + ' t at ' + Sim.shipMass(G.ship).toFixed(0) + ' t all-up',
                 px + 24, py + 48);
    ctx.restore();

    /* EVERYTHING ON THE PLOT IS CLIPPED TO IT. At the whole-galaxy zoom
     * that changes nothing — the disc fits — but zoomed in, a ring, a
     * course line or a stem would otherwise run out across the readout. */
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x0, plot.y0, plotSize, plotSize);
    ctx.clip();

    // Distance rings, so the scale is readable without a legend.
    var orig = chartToScreen(xf, 0, 0);
    ctx.save();
    ctx.strokeStyle = 'rgba(120,160,220,0.16)';
    ctx.lineWidth = 1;
    for (var ring = 10; ring <= G.galaxy.radius; ring += 10) {
      if (chartArc(ctx, plot, orig.x, orig.y, ring * scale)) ctx.stroke();
    }
    ctx.restore();

    var hereScreen = toScreen(G.here);
    var reachLy = Galaxy.maxRange(G.ship);

    /* The reachable set, drawn as a circle around you. It is honestly a
     * SPHERE — a star directly above you is closer than it looks here —
     * which is exactly why every star also carries its height stem.
     * Centred on your FLOOR point, where the sphere's centre is in the
     * plane; zoomed in, the ring is big enough to say what it is, so it
     * does, at the top of the ring if that is on the plot. */
    ctx.save();
    ctx.strokeStyle = 'rgba(125,250,255,0.35)';
    ctx.setLineDash([4, 4]);
    if (chartArc(ctx, plot, hereScreen.x, hereScreen.y, reachLy * scale)) ctx.stroke();
    ctx.setLineDash([]);
    var ringTopY = hereScreen.y - reachLy * scale;
    /* 150 px, not less: at the whole-galaxy zoom the ring is ~95 px and
     * its top runs through the crowded middle, where the words printed
     * over a row of dots. From about ×1.6 in the ring is clear of them. */
    if (reachLy * scale > 150 && chartInPlot(plot, hereScreen.x, ringTopY, -14)) {
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(125,250,255,0.75)';
      ctx.textAlign = 'center';
      ctx.fillText('reach ' + fmtLy(reachLy), hereScreen.x, ringTopY - 4);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    // The selected jump, as a line you can see the length of.
    if (plan) {
      var tgt = toScreen(plan.to);
      ctx.save();
      ctx.strokeStyle = plan.possible ? '#7dffb0' : '#ff7a7a';
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(hereScreen.x, hereScreen.y - hereScreen.stem);
      ctx.lineTo(tgt.x, tgt.y - tgt.stem);
      ctx.stroke();
      ctx.restore();
    }

    /* RESOURCE WARS (wars.js, 2026-10-18): the fronts now, and the stars
     * that have changed hands. Public news, but marked only on stars you
     * hold the sheet for, like the checkpoint brackets below. */
    var Wr = global.Wars, warNow = {}, takenBy = {}, warList = [], warHist = null;
    if (Wr && G.galaxy.rivals) {
      warList = Wr.warsAt(G.galaxy, G, G.t);
      warList.forEach(function (wv) { warNow[wv.star] = wv; });
      warHist = Wr.history(G.galaxy, G, G.t);
      warHist.wars.forEach(function (wv) { if (wv.won && wv.t1 <= G.t) takenBy[wv.star] = wv; });
    }
    /* CULLED TO THE VIEW. A star whose dot and floor point are both off
     * the plot draws nothing anyone can see — not the dot, not the stem,
     * not a marker — so it is skipped before any of that is worked out.
     * Zoomed in that is most of the galaxy; zoomed out it is none of it,
     * and the frame costs what it always did. The margin is the widest
     * marker (the war cross, r + 6) so nothing is cut off at the edge. */
    var nDrawn = 0, nCulled = 0, labelCands = [], dotBoxes = [];
    var CULL_PAD = 14;
    for (var i = 0; i < G.galaxy.stars.length; i++) {
      var s = G.galaxy.stars[i];
      var sp = toScreen(s);
      var y = sp.y - sp.stem;
      if (!chartInPlot(plot, sp.x, y, CULL_PAD) && !chartInPlot(plot, sp.x, sp.y, CULL_PAD)) {
        nCulled++;
        continue;
      }
      nDrawn++;
      var isHere = s === G.here;
      var seen = !!G.visited[s.id];
      var d = Galaxy.distance3(G.here, s);
      var canReach = !isHere && d <= reachLy;

      ctx.save();
      // Height stem — the whole reason this reads as 3D.
      if (Math.abs(sp.stem) > 0.5) {
        ctx.strokeStyle = 'rgba(140,175,215,0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sp.x, sp.y - sp.stem); ctx.stroke();
      }
      var r = 1.8 + Math.min(2.6, Math.log(1 + s.luminosity) * 1.1);
      ctx.globalAlpha = canReach || isHere ? 1 : (seen ? 0.75 : 0.42);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(sp.x, y, r, 0, K.TAU); ctx.fill();
      dotBoxes.push({ bx: sp.x - r - 1, by: y - r - 1, bw: 2 * r + 2, bh: 2 * r + 2, dot: true });
      if (seen && !isHere) {
        ctx.strokeStyle = 'rgba(125,255,176,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sp.x, y, r + 3, 0, K.TAU); ctx.stroke();
      }
      /* A CHECKPOINT, ONCE YOU HOLD THE SHEET FOR IT. Knowing a system is
       * restricted is chart data — it is the sort of thing printed on the
       * sheet in red, not something you have to fly there to discover — so
       * it shows for a charted star whether or not you have been. Drawn as
       * a bracket rather than a ring, because a ring is already the
       * surveyed marker and two rings on one dot say nothing. */
      if (G.charted[s.id] && s.restricted) {
        ctx.strokeStyle = '#ff9a6b';
        ctx.lineWidth = 1.4;
        var br = r + 6;
        ctx.beginPath();
        ctx.moveTo(sp.x - br, y - br + 3); ctx.lineTo(sp.x - br, y - br);
        ctx.lineTo(sp.x - br + 3, y - br);
        ctx.moveTo(sp.x + br - 3, y - br); ctx.lineTo(sp.x + br, y - br);
        ctx.lineTo(sp.x + br, y - br + 3);
        ctx.moveTo(sp.x - br, y + br - 3); ctx.lineTo(sp.x - br, y + br);
        ctx.lineTo(sp.x - br + 3, y + br);
        ctx.moveTo(sp.x + br - 3, y + br); ctx.lineTo(sp.x + br, y + br);
        ctx.lineTo(sp.x + br, y + br - 3);
        ctx.stroke();
      }
      if (G.charted[s.id] && takenBy[s.id]) {
        var nf = G.galaxy.factionById[takenBy[s.id].att];
        ctx.strokeStyle = (nf && nf.color) || '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sp.x, y, r + 4, 0, K.TAU); ctx.stroke();
      }
      if (G.charted[s.id] && warNow[s.id]) {
        var wr = r + 6;
        ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sp.x - wr, y - wr); ctx.lineTo(sp.x + wr, y + wr);
        ctx.moveTo(sp.x + wr, y - wr); ctx.lineTo(sp.x - wr, y + wr);
        ctx.stroke();
      }
      if (isHere) {
        ctx.strokeStyle = '#ffe6a8'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(sp.x, y, r + 5, 0, K.TAU); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sp.x - r - 9, y); ctx.lineTo(sp.x - r - 3, y);
        ctx.moveTo(sp.x + r + 3, y); ctx.lineTo(sp.x + r + 9, y);
        ctx.stroke();
      }
      /* Clicking a star is no longer a hot box per star: a press on the
       * plot is either a pan or a click, and only the release can tell
       * which (chartPointer). The click picks the nearest dot. */

      var isSel = plan && s === plan.to;
      if (isSel) {
        ctx.strokeStyle = plan.possible ? '#7dffb0' : '#ff7a7a';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(sp.x - r - 6, y - r - 6, (r + 6) * 2, (r + 6) * 2);
      }
      ctx.restore();

      /* A NAME, IF IT HAS EARNED ONE AT THIS ZOOM. Tiers in order of who
       * the name is for; chartLabels places them highest first. */
      var tier = isSel ? 0 : isHere ? 1 : (G.courseStar === s.id) ? 2 : seen ? 3 : canReach ? 4 : 5;
      if (scale >= CHART_TIER_PX[tier] && chartInPlot(plot, sp.x, y)) {
        labelCands.push({
          text: s.name, x: sp.x, y: y, r: r + (tier <= 1 ? 4 : 0), tier: tier, d: d,
          size: tier <= 2 ? 12 : 11,
          color: tier === 0 ? (plan.possible ? '#7dffb0' : '#ff7a7a')
               : tier === 1 ? '#ffe6a8'
               : tier === 2 ? '#ffd27a'
               : tier === 3 ? 'rgba(160,240,200,0.85)'
               : tier === 4 ? 'rgba(200,220,245,0.85)' : 'rgba(160,185,220,0.6)'
        });
      }
    }

    /* The chart's own furniture, which a name must not land on: the
     * scale bar and the marks key along the bottom, the zoom buttons at
     * the top right, the news line along the top — and every dot. */
    var bar = chartScaleBar(scale);
    var bx0 = plot.x0 + 12, by0 = plot.y0 + plotSize - 14;
    var barBox = { bx: bx0 - 6, by: by0 - 20, bw: Math.max(bar.px, 90) + 70, bh: 28 };
    var keyW = 52 * chartCharW(10);
    var blocked = dotBoxes.concat([
      barBox,
      { bx: plot.x0 + plotSize - 8 - keyW, by: plot.y0 + plotSize - 18, bw: keyW, bh: 12 },
      { bx: plot.x0 + plotSize - 66, by: plot.y0 + 6, bw: 66, bh: 64 },
      { bx: plot.x0, by: plot.y0, bw: plotSize, bh: 10 }
    ]);
    labelCands.sort(function (a, b) { return a.tier - b.tier || a.d - b.d; });
    var terrNow = (G.galaxy && G.charted) ? chartEdgeCost(terrCache, xf) : null;
    var placed = chartLabels(labelCands, plot, 80, blocked, terrNow);
    ctx.save();
    placed.forEach(function (pl) {
      /* A forced name pushed out to a clear side says which dot is its
       * own with a hairline from the box's nearest point to the dot. */
      if (pl.lead) {
        var qx = Math.max(pl.bx, Math.min(pl.bx + pl.bw, pl.c.x)), qy = Math.max(pl.by, Math.min(pl.by + pl.bh, pl.c.y));
        var ld = Math.hypot(qx - pl.c.x, qy - pl.c.y);
        if (ld > pl.c.r + 3) {
          var ux = (qx - pl.c.x) / ld, uy = (qy - pl.c.y) / ld;
          ctx.strokeStyle = pl.c.color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pl.c.x + ux * (pl.c.r + 2), pl.c.y + uy * (pl.c.r + 2)); ctx.lineTo(qx - ux, qy - uy); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.font = 'bold ' + pl.c.size + 'px ui-monospace, monospace';
      ctx.fillStyle = pl.c.color;
      ctx.fillText(pl.c.text, pl.bx, pl.by + pl.c.size);
    });
    ctx.restore();

    ctx.restore();   // the plot clip

    /* OFF THE PLOT, BUT NOT OUT OF MIND. Zoomed in, the star you have
     * selected — or the one you are sitting at — can be anywhere, and a
     * selection you cannot find is a selection you will plot by accident.
     * An arrow on the plot's edge, on the bearing from the middle of the
     * view, with the name and how far. */
    function edgeArrow(star, color, label) {
      var dot = chartDot(xf, star);
      if (chartInPlot(plot, dot.x, dot.y)) return;
      var e = chartEdge(plot, dot.x, dot.y, 12);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.ang);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(9, 0); ctx.lineTo(-6, -7); ctx.lineTo(-2, 0); ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      /* The words sit on the inward side of the arrow, so a label at the
       * right-hand edge does not run off the plot. */
      ctx.save();
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = color;
      var tw = label.length * chartCharW(11);
      /* Pulled inward off the arrow's point, and then stood off to one
       * side of the bearing by 14 px: the course line to the selection
       * runs exactly along that bearing, and the first screenshot had it
       * striking straight through the name. */
      var px2 = -Math.sin(e.ang), py2 = Math.cos(e.ang);
      if (py2 < 0) { px2 = -px2; py2 = -py2; }          // the side nearer the bottom of the plot
      var lx = e.x - Math.cos(e.ang) * 16 - tw / 2 * (1 + Math.cos(e.ang)) + px2 * 14;
      var ly = e.y - Math.sin(e.ang) * 16 + 4 + py2 * 14;
      lx = Math.max(plot.x0 + 4, Math.min(plot.x0 + plotSize - tw - 4, lx));
      ly = Math.max(plot.y0 + 14, Math.min(plot.y0 + plotSize - 6, ly));
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }
    if (zoomed) {
      if (plan) edgeArrow(plan.to, plan.possible ? '#7dffb0' : '#ff7a7a',
                          plan.to.name + ' ' + fmtLy(plan.distance));
      edgeArrow(G.here, '#ffe6a8', 'here: ' + G.here.name);
    }

    /* The frame of the plot, so it is plain where the clip is — zoomed in,
     * the stars stop at an edge, and an edge nobody drew looks like a bug. */
    ctx.save();
    ctx.strokeStyle = zoomed ? 'rgba(120,160,220,0.35)' : 'rgba(120,160,220,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x0 + 0.5, plot.y0 + 0.5, plotSize - 1, plotSize - 1);
    ctx.restore();

    /* THE SCALE BAR, a round number of light years, and the zoom. Bottom
     * corner of the plot, where nothing else on the chart lives. */
    ctx.save();
    ctx.fillStyle = 'rgba(6,14,22,0.75)';
    ctx.fillRect(barBox.bx, barBox.by, barBox.bw, barBox.bh);
    ctx.strokeStyle = '#cfe0ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx0, by0 - 4); ctx.lineTo(bx0, by0); ctx.lineTo(bx0 + bar.px, by0); ctx.lineTo(bx0 + bar.px, by0 - 4);
    ctx.stroke();
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#cfe0ff';
    ctx.fillText((bar.ly < 1 ? bar.ly.toFixed(1) : String(bar.ly)) + ' ly', bx0, by0 - 7);
    ctx.fillStyle = 'rgba(160,185,220,0.75)';
    ctx.fillText('×' + (view.z < 10 ? view.z.toFixed(1) : view.z.toFixed(0)), bx0 + bar.px + 10, by0 + 2);
    ctx.restore();

    /* The key to the marks, in the other bottom corner. It used to trail
     * off the end of the keys line, which ran it under the readout. */
    ctx.save();
    /* Backed like the scale bar once zoomed: a star whose dot sits under
     * the key otherwise has the words printed across it. */
    if (zoomed) {
      ctx.fillStyle = 'rgba(6,14,22,0.75)';
      ctx.fillRect(plot.x0 + plotSize - 12 - keyW, plot.y0 + plotSize - 19, keyW + 8, 15);
    }
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.6)';
    ctx.textAlign = 'right';
    ctx.fillText('green ring = visited  ·  dashed circle = your reach',
                 plot.x0 + plotSize - 8, plot.y0 + plotSize - 8);
    ctx.textAlign = 'left';
    ctx.restore();

    /* Buttons for the same thing the wheel and the keys do — for a
     * trackpad with no wheel, and so the chart says it can zoom at all. */
    var zbx = plot.x0 + plotSize - 30, zby = plot.y0 + 8;
    btn(ctx, zbx, zby, 22, 20, '+', function () { chartKeyZoom(CHART_KEY_STEP); }, { bold: true, font: 13 });
    btn(ctx, zbx, zby + 24, 22, 20, '−', function () { chartKeyZoom(1 / CHART_KEY_STEP); }, { bold: true, font: 13 });
    if (zoomed) btn(ctx, zbx - 34, zby + 48, 56, 18, 'WHOLE', chartWhole, { font: 10 });

    chartStat.drawn = nDrawn; chartStat.culled = nCulled; chartStat.labels = placed.length; chartStat.cands = labelCands.length;
    chartStat.placed = placed.map(function (pl) { return { text: pl.c.text, tier: pl.c.tier, bx: pl.bx, by: pl.by, bw: pl.bw, bh: pl.bh }; });
    var named = {}; placed.forEach(function (pl) { named[pl.c.text] = true; });
    chartStat.unnamed = labelCands.filter(function (c) { return !named[c.text]; })
      .map(function (c) { return { text: c.text, tier: c.tier, x: c.x, y: c.y }; });
    chartStat.furniture = blocked.filter(function (b) { return !b.dot; });
    chartStat.t0 = t0;

    /* --- the news: the fronts, or the last war, or the reserves --- */
    if (Wr && warHist) {
      var fn2 = function (id) { var f = G.galaxy.factionById[id]; return f ? f.name : id; };
      var news;
      if (warList.length) {
        news = 'WAR: ' + warList.slice(0, 2).map(function (wv) {
          return fn2(wv.att) + ' against ' + fn2(wv.def) + ' for ' + wv.starName;
        }).join('   ·   ') + (warList.length > 2 ? '   ·   +' + (warList.length - 2) + ' more' : '');
      } else {
        var past = warHist.wars.filter(function (wv) { return wv.t1 <= G.t; });
        var lw = past[past.length - 1];
        if (lw) news = 'LAST WAR: ' + fn2(lw.att) + ' ' + (lw.won ? 'took ' : 'failed to take ') + lw.starName +
                       ' from ' + fn2(lw.def) + ', ' + fmtEpoch(lw.t1);
        else {
          var stN = Wr.stateAt(G.galaxy, G, G.t), sc = 0, nE = 0;
          Object.keys(stN).forEach(function (e) { sc += stN[e].scarcity; nE++; });
          news = 'AT PEACE   ·   the empires have worked ' + Math.round(100 * sc / Math.max(1, nE)) +
                 '% of their cheap ore';
        }
      }
      ctx.save();
      ctx.font = 'bold 12px ui-monospace, monospace';
      /* Zoomed in, stars and territory run right up under this line, so
       * it gets a backing; zoomed out the disc never reaches the corner. */
      if (view.z > 1.0001) {
        ctx.fillStyle = 'rgba(6,14,22,0.8)';
        ctx.fillRect(plot.x0, plot.y0, plotSize - 70, 9);
      }
      ctx.fillStyle = warList.length ? '#ff7a6a' : '#9fb4d0';
      /* Under the chart's own header line: the right column's length
       * depends on the system described, the bottom belongs to the keys. */
      ctx.fillText(clipText(news, Math.floor((plotSize + 20) / 7.3)), px + 24, py + 66);
      ctx.restore();
    }

    /* --- the destination, in words --- */
    if (plan && dw > 180) {
      // The legend sits in this same right-hand column above this block;
      // push the destination readout below it instead of guessing a fixed
      // offset that would only be right for one particular faction count.
      var legendBottom = py + 48 + Math.max(0, chartedFactions().length - 1) * 16 + 14;
      var dyy = Math.max(py + 70, legendBottom + 16);
      ctx.save();
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillStyle = plan.to.color;
      ctx.fillText(plan.to.name, dx, dyy);
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = '#7e93b3';
      ctx.fillText('class ' + plan.to.cls + '   ·   ' + plan.to.temp + ' K   ·   ' +
                   plan.to.luminosity.toFixed(2) + ' L☉', dx, dyy + 18);
      /* The war over it, or who took it. */
      var fname = function (id) { var f = G.galaxy.factionById[id]; return f ? f.name : id; };
      var wv2 = warNow[plan.to.id], tk = takenBy[plan.to.id];
      if (wv2 || tk) {
        ctx.fillStyle = wv2 ? '#ff7a6a' : '#ffd27a';
        ctx.fillText(wv2 ? 'CONTESTED - ' + clipText(fname(wv2.att), 18) + ' attacking'
                         : 'TAKEN by ' + clipText(fname(tk.att), 22) + ', ' + fmtEpoch(tk.t1), dx, dyy + 34);
      }
      ctx.restore();

      rows(ctx, dx, dyy + 46, [
        ['distance', fmtLy(plan.distance)],
        ['propellant', plan.fuel.toFixed(2) + ' t',
          plan.possible ? '#7dffb0' : '#ff7a7a'],
        ['in the tank', G.ship.fuel.toFixed(2) + ' t'],
        /* The number that actually matters. Arriving somewhere with a dry
         * tank is how you get stranded, and a chart that only showed the
         * cost would let you do it without ever seeing it coming. */
        ['on arrival', Math.max(0, G.ship.fuel - plan.fuel).toFixed(2) + ' t',
          (G.ship.fuel - plan.fuel) < 2 ? '#ffb86b' : '#cfe0ff'],
        ['transit time', fmtTime(plan.seconds), '#ffb86b'],
        ['arrive', fmtEpoch(G.t + plan.seconds)]
      ], '#7e93b3', '#cfe0ff', dw);

      var iy = dyy + 150;
      ctx.save();
      ctx.font = 'bold 12px ui-monospace, monospace';
      if (plan.barred) {
        ctx.fillStyle = '#ff7a7a';
        ctx.fillText('RESTRICTED — ' + plan.restricted.label.toUpperCase(), dx, iy);
        ctx.fillStyle = 'rgba(200,220,245,0.7)';
        ctx.fillText('the checkpoint wants a transponder you are not carrying', dx, iy + 16);
      } else if (plan.noDrive) {
        ctx.fillStyle = '#ff7a7a';
        ctx.fillText('NO SLIPSPACE DRIVE — a yard will fit one', dx, iy);
      } else if (!plan.possible) {
        ctx.fillStyle = '#ff7a7a';
        ctx.fillText('SHORT BY ' + plan.shortfall.toFixed(2) + ' t — refuel, or sell cargo',
                     dx, iy);
        ctx.fillStyle = 'rgba(200,220,245,0.7)';
        ctx.fillText('a lighter ship reaches further; the hold costs you range', dx, iy + 16);
      } else {
        ctx.fillStyle = '#7dffb0';
        ctx.fillText('ENTER — course laid in, F8 to engage', dx, iy);
      }
      ctx.restore();

      /* What we know about the place. Unvisited systems show only what you
       * could actually tell from here with a spectrograph — the star, and
       * nothing else. Everything inside is unknown until somebody goes. */
      var sy = dyy + 196;
      ctx.save();
      ctx.font = 'bold 12px ui-monospace, monospace';
      if (G.visited[plan.to.id]) {
        var known = G.systemCache[plan.to.id];
        ctx.fillStyle = '#7fd6c0';
        ctx.fillText('SURVEYED', dx, sy);
        ctx.restore();
        var infoRows = [
          ['worlds', known.bodies.filter(function (b) { return b.kind === 'planet'; }).length +
            ' planets, ' + known.bodies.filter(function (b) { return b.kind === 'moon'; }).length + ' moons'],
          ['ports', String(known.ports.length)],
          ['factions', (known.factions || []).map(function (f) { return f.name; }).join(', ') || '—'],
          ['habitable', String(known.bodies.filter(function (b) { return b.habitable; }).length)],
          ['government', known.government ? known.government.name : '—'],
          ['crime', known.crimeScore !== undefined ? known.crimeScore + ' / 100 permissive' : '—']
        ];
        /* The two-axis split (violence vs. corruption) exists so a player
         * can tell "nobody here will stop you" from "everybody here can be
         * bought" apart — and until now nothing showed it, only their
         * combined permissivity above. Corruption reads EFFECTIVE, base
         * plus anything bribed onto this specific star (see
         * Combat.systemCorruption), and says so when the two differ. */
        if (known.violence !== undefined) {
          infoRows.push(['violence', known.violence + ' / 100 (' +
            Combat.violenceLabel(known.violence) + ')']);
        }
        if (known.corruption !== undefined && global.Combat) {
          var effCorrupt = Combat.systemCorruption(G, known, plan.to.id);
          var corruptTxt = effCorrupt + ' / 100 (' + Combat.corruptionLabel(effCorrupt) + ')';
          if (effCorrupt !== known.corruption) {
            corruptTxt += '  ·  baseline ' + known.corruption + ', you’ve bribed the rest';
          }
          infoRows.push(['corruption', corruptTxt]);
        }
        /* Whose since the split (2026-10-31): a band bans nothing and runs
         * no customs; its raiders are the only patrol. */
        if (known.heldBy === 'pirate') {
          infoRows.push(['territory', 'PIRATE HELD — no law, no customs, raiders']);
        } else if (known.pirateHeld) {
          infoRows.push(['territory', 'SYNDICATE HELD — waste banned on arrival']);
        }
        if (plan.to.restricted) {
          infoRows.push(['access', plan.to.restricted.label.toUpperCase() +
            ' — transponder required']);
        }
        var infoH = rows(ctx, dx, sy + 20, infoRows, '#7e93b3', '#cfe0ff', dw);

        /* A fact about the SYSTEM as a whole, not any one world in it — see
         * Gen.systemNote. Keyed off what actually got generated here (how
         * many worlds, how many are giants, how many are habitable, how
         * much port infrastructure exists), not the violence/corruption
         * axis the rows above already cover. */
        if (known.systemNote) {
          var noteY = sy + 20 + infoH + 14;
          ctx.save();
          ctx.font = 'bold 11px ui-monospace, monospace';
          ctx.fillStyle = 'rgba(200,220,245,0.7)';
          var noteCols = Math.max(20, Math.floor(dw / 6.49));
          wrapText(known.systemNote, noteCols).forEach(function (ln) {
            ctx.fillText(ln, dx, noteY);
            noteY += 13;
          });
          ctx.restore();
        }
      } else {
        ctx.fillStyle = '#7e93b3';
        ctx.fillText('UNSURVEYED', dx, sy);
        if (plan.to.restricted && G.charted[plan.to.id]) {
          /* On the sheet in red, which is where a checkpoint belongs: you
           * do not have to fly to a prison to learn that it is one. */
          ctx.fillStyle = '#ff9a6b';
          ctx.fillText('  ·  ' + plan.to.restricted.label.toUpperCase(),
                       dx + ctx.measureText('UNSURVEYED').width, sy);
        }
        ctx.restore();

        /* Nothing on the ground, but plenty in the light: a transit gives
         * planet count for free, and the star's own spectrum during that
         * transit gives each planet's atmosphere. What a spectrograph
         * genuinely cannot tell you — who lives there, who runs it, how
         * dangerous the place is — is exactly what stays behind
         * G.visited above. */
        var preview = Gen ? previewSystem(plan.to) : null;
        var pPlanets = preview ? preview.bodies.filter(function (b) {
          return b.kind === 'planet';
        }) : [];

        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(160,185,220,0.6)';
        ctx.fillText('remote spectroscopy — composition only, nothing on the ground', dx, sy + 16);
        ctx.restore();

        var noteBaseY = sy + 36;
        /* Word around the dock, not a sensor return — same footing as the
         * per-world cultureNote below: something you'd have heard about the
         * PLACE before ever going, not a fact restated in prose. Unlike
         * that note, this one is keyed off the generated bodies (world
         * count, giants, habitable count) rather than the government axis,
         * so it can honestly be said before a visit reveals who runs it. */
        if (preview && preview.systemNote) {
          ctx.save();
          ctx.font = 'bold 11px ui-monospace, monospace';
          ctx.fillStyle = 'rgba(200,220,245,0.7)';
          var sysCols = Math.max(20, Math.floor(dw / 6.49));
          wrapText(preview.systemNote, sysCols).forEach(function (ln) {
            ctx.fillText(ln, dx, noteBaseY);
            noteBaseY += 13;
          });
          ctx.restore();
          noteBaseY += 6;
        }

        var scanRows = [
          ['worlds', pPlanets.length + ' planet' + (pPlanets.length === 1 ? '' : 's') +
            ' in transit']
        ];
        pPlanets.forEach(function (b, idx) {
          /* Clipped to what fits beside the label: right-aligned, a long
           * composition used to run back over the world's name. The HZ
           * marker is kept whole - it is the part that matters. */
          var compCols = Math.max(16, Math.floor((dw - 100) / 7.3));
          scanRows.push([(idx + 1) + '. ' + b.typeName,
            clipText(b.composition || '—', compCols - (b.habitable ? 16 : 0)) +
            (b.habitableBand === 'terminator' ? '  ·  twilight ring'
              : b.habitableBand === 'equator' ? '  ·  equator band'
              : b.habitable ? '  ·  in the HZ' : '')]);
        });
        /* A long composition (gas giants) wraps inside rows(), so the
         * table's height comes back from it rather than rows * 15. */
        var scanH = rows(ctx, dx, noteBaseY, scanRows, '#7e93b3', '#cfe0ff', dw);

        /* A travel-guide's idea of anywhere worth living — see
         * Gen.buildFlavor. Capped at two worlds so a system with several
         * habitable candidates cannot run this panel off the bottom of
         * the screen. */
        var habitables = pPlanets.filter(function (b) { return b.habitable; }).slice(0, 2);
        var fy = noteBaseY + scanH + 16;
        var cols = Math.max(20, Math.floor(dw / 6.49));
        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        habitables.forEach(function (b) {
          ctx.fillStyle = '#7fd6c0';
          ctx.fillText(b.name.toUpperCase(), dx, fy);
          fy += 14;
          ctx.fillStyle = 'rgba(200,220,245,0.75)';
          var lines = wrapText(b.lifeNote || '', cols).concat(wrapText(b.cultureNote || '', cols));
          for (var ln = 0; ln < lines.length; ln++) {
            ctx.fillText(lines[ln], dx, fy);
            fy += 13;
          }
          fy += 6;
        });
        ctx.restore();
      }
    }

    ctx.save();
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.7)';
    /* Two lines now: the zoom keys are new and they are the ones nobody
     * will guess, so they get a line of their own rather than being
     * squeezed onto the end of the list keys. */
    ctx.fillText('↑↓ or click a star · PgUp/PgDn ten · Home nearest · ' +
                 'Enter lays in the course · F8 engages',
                 px + 24, py + ph - 24);
    ctx.fillText('wheel or + / − zoom · drag turns · shift-drag or right-drag pans ' +
                 '· L levels · K height · C centres on you · Shift+C on the selection',
                 px + 24, py + ph - 10);
    ctx.restore();
    var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    chartStat.ms = t1 - chartStat.t0;
  }



  /* Which screen draws is decided here, keyed by the mode id main.js keeps
   * in its MODES table — the table itself stays with the input handling. */
  function draw(ctx, w, bottom, id) {
    /* Scroll regions are rebuilt every frame by whatever drew a list, the
     * same way hotspots are. Clearing here means a region cannot outlive
     * the panel that made it and go on eating the wheel from a screen
     * nobody is looking at. */
    SCROLL = null;
    /* The same for the chart's plot: only the frame that drew the chart
     * leaves one behind, so F8 — which keeps G.starMap but draws no plot —
     * cannot have its clicks taken by a chart that is not on the screen. */
    chartPlot = null;
    switch (id) {
      case 'system':     drawSystemScreen(ctx, w, bottom); return true;
      case 'navigation': drawNavScreen(ctx, w, bottom); return true;
      case 'comms':      drawCommsScreen(ctx, w, bottom); return true;
      case 'ship':       drawShipScreen(ctx, w, bottom); return true;
      case 'galaxy':     drawGalaxyScreen(ctx, w, bottom); return true;
      case 'missions':   drawMissionScreen(ctx, w, bottom); return true;
      case 'jump':       drawJumpScreen(ctx, w, bottom); return true;
      case 'aim':        drawAimScreen(ctx, w, bottom); return true;
      case 'manifest':   drawManifestScreen(ctx, w, bottom); return true;
      case 'node':       drawNodeScreen(ctx, w, bottom); return true;
      case 'scanner':    drawScannerScreen(ctx, w, bottom); return true;
    }
    return false;
  }

  global.Screens = {
    bind: bind,
    draw: draw,
    scannerKey: scannerKey, scanMini: scanMini,
    commsContacts: commsContacts, trackInk: trackInk, markAt: markAt, TRACK: TRACK,
    systemManifest: systemManifest, worldFacts: worldFacts,
    btn: btn,
    tile: tile,
    tileHeight: tileHeight,
    modeFrame: modeFrame,
    modeHead: modeHead,
    /* Text entry. main.js has to consult `editing`/`editKey` before its own
     * function-key and number-row handling — see the note by beginEdit. */
    editing: editing, editKey: editKey, editState: editState,
    cancelEdit: cancelEdit, beginEdit: beginEdit,
    /* The F5 notepad (journal.js), which also answers to editing(). */
    beginNotes: beginNotes, writingNotes: writingNotes, stopNotes: stopNotes,
    exportNotes: exportNotes, scrollNotesLog: scrollNotesLog,
    /* main.js routes the wheel here before the camera zoom sees it. */
    wheelAt: wheelAt,
    /* The F6 chart's zoom and pan (2026-11-03): the wheel, the pointer and
     * the keys, routed from main.js; `chart` is the pure transform the
     * tests check, and chartStat what the last frame drew and what it cost. */
    /* The catalogue page (2026-11-12): the gameopedia off the help card. */
    drawCatalogue: drawCatalogue, catalogueKey: catalogueKey,
    catalogueWheel: catalogueWheel, catState: catState, catGroups: catGroups,
    chartWheel: chartWheel, chartPointer: chartPointer, chartKeyZoom: chartKeyZoom,
    chartLevelKey: chartLevelKey, chartDepthKey: chartDepthKey,
    chartCentre: chartCentre, chartWhole: chartWhole, CHART_KEY_STEP: CHART_KEY_STEP,
    /* A COPY: the frame overwrites the same object, and a test that held
     * the last frame's reading and compared it with this one's was
     * comparing an object with itself (it did, the first time). */
    chartStat: function () {
      var o = {}; for (var k in chartStat) o[k] = chartStat[k];
      return o;
    },
    chartPlot: function () { return chartPlot; },
    chart: {
      fit: chartFit, maxZoom: chartMaxZoom, xf: chartXf, toScreen: chartToScreen,
      toGalaxy: chartToGalaxy, dot: chartDot, clamp: chartClamp, zoomAt: chartZoomAt,
      pan: chartPan, centreOn: chartCentreOn, inPlot: chartInPlot, pick: chartPick,
      /* The camera (2026-11-13). */
      cam: chartCam, proj: chartProj, unproj: chartUnproj, floor: chartFloor,
      turn: chartTurn, level: chartLevel, depth: chartDepth,
      EL_MIN: CHART_EL_MIN, EL_MAX: CHART_EL_MAX, EL_DEFAULT: CHART_EL_DEFAULT,
      DEPTHS: CHART_DEPTHS, ROT_PER_PX: CHART_ROT_PER_PX,
      scaleBar: chartScaleBar, edge: chartEdge, labels: chartLabels, edgeCost: chartEdgeCost,
      MAX_PX_PER_LY: CHART_MAX_PX_PER_LY,
      /* The last territory field built, and what it was built from, so a
       * test can check a zoomed-in border against the galaxy itself. */
      territory: function () { return terrCache; },
      TERRITORY_REACH_LY: TERRITORY_REACH_LY, TERRITORY_CELL: TERRITORY_CELL
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Screens;
})(typeof window !== 'undefined' ? window : globalThis);
