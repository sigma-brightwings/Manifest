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
  var refuelFromHold;
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
      ports: row ? (body.kind === 'planet' ? row.ports : null) : null,
      gravity: gSurf,
      dayHours: per ? per / 3600 : null,
      retrograde: !!(per && per < 0),
      /* A locked planet's day IS its year, and the number of hours in it
       * is not the interesting fact; that it never ends is. */
      day: body.kind === 'planet' && body.tidallyLocked ? 'tidally locked' : null,
      tiltDeg: body.rotation ? body.rotation.tilt * 180 / Math.PI : null,
      notes: [BAND_NOTES[body.habitableBand], body.lifeNote, body.cultureNote].filter(function (s) { return !!s; })
    };
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
    var rowH = 16, avail = Math.floor((colH - 40) / rowH);
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
      ctx.fillStyle = e.hostile ? '#ff8a76' : (idx === sel ? MFD_HOT : e.color);
      ctx.fillText(navMark(e), pad + 12, yy);
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
      ctx.fillStyle = idx === sel ? MFD_HOT : MFD_INK;
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

    /* Police channels, one per faction flying a flag here.
     *
     * Range 0 on purpose, so they sort to the top of a list that is
     * otherwise ordered by distance. These are not objects you fly to —
     * they are a frequency, reachable anywhere in the system — and the one
     * time you badly want to find this channel is the one time you are in
     * trouble and should not have to scroll for it. */
    var facs = (G.sys.factions || []);
    for (i = 0; i < facs.length; i++) {
      var f = facs[i];
      if (!f || f.outlaw) continue;
      out.push({ kind: 'authority', obj: f, name: f.name + ' Control',
                 range: 0, who: 'Police channel',
                 color: f.color || '#7dfaff' });
    }

    for (i = 0; i < G.sys.bodies.length; i++) {
      var b = G.sys.bodies[i];
      if (b.kind !== 'station') continue;
      var range = V.dist(Sim.bodyPosition(b, G.sys, G.t), G.ship.pos);
      var fac = G.sys.factionById && G.sys.factionById[b.faction];
      out.push({ kind: 'station', obj: b, name: b.name, range: range,
                 who: b.market ? b.market.roleName : 'Station',
                 color: fac ? fac.color : '#7dffb0' });
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

    var rowH = 18, avail = Math.floor((colH - 40) / rowH);
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
      ctx.fillStyle = c.color;
      /* Plain ASCII, and specifically a character that IS on the keyboard
       * in front of the player. The first version used a section sign,
       * which is not on a US layout at all — so it read as an instruction
       * to press a key that does not exist rather than as a marker in a
       * list. A glyph in a legend has to be typeable even when nothing
       * asks you to type it. */
      ctx.fillText(c.kind === 'authority' ? '*'
                 : c.kind === 'collector' ? '$'
                 : c.kind === 'station' ? '#'
                 : (c.hostile ? '!' : '>'), pad + 12, yy);
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

      ctx.fillStyle = idx === G.commsSel ? MFD_HOT : MFD_INK;
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
      var canSell = Math.min(Math.floor(cur.yours), b.room);
      var sellLine = cur.sellEach !== null
        ? (canSell > 0 ? 'sell up to ' + canSell + ' t' : 'sell: no room left this trip')
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
      return opts;
    }

    if (c.kind === 'authority') {
      /* The police channel. Reporting a crime is a later piece of work;
       * these are the two you need when the trouble is your own. */
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
        note: 'channel not staffed for this yet',
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
      var btnX0 = btnX1 - btnW - 8;
      hot(rx + 8, yy, Math.max(40, (canTank ? btnX0 : btnX1) - rx - 12), rowH - 4, (function (n) {
        return function () { G.invSel = n; };
      })(i));
      if (canTank) {
        btn(ctx, btnX0, yy + 2, btnW, rowH - 8, 'TO TANKS',
            (function (n) { return function () { G.invSel = n; refuelFromHold(); }; })(i),
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
                  hot: !!(opts && opts.hot) });
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
    if (G.yardTab === 'fit') drawYardFit(ctx, x, w, row, s);
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
      btn(ctx, x + 12, ry, rowW, bh,
          clipText(r.sub ? r.label + '   ·   ' + r.sub : r.label,
                   Math.floor(rowW / 7.04)),
          r.fn, { disabled: r.disabled, font: 11, hot: r.hot });
    }

    if (cardH) drawHullCard(ctx, x, listY + listH + 4, w, cardH - 4);

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
       * this row belongs to the tab buttons. */
      if (352 < w - 210) {
        ctx.save();
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(160,185,220,0.55)';
        ctx.fillText((G.yardScroll + 1) + '-' +
                     Math.min(rows.length, G.yardScroll + perPage) +
                     ' of ' + rows.length, x + 352, barY + 11);
        ctx.restore();
      }
    }
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
        row('  ' + p.name, Crew.ROLES[p.role].name + ', ' + Crew.ratingWord(p.rating) +
            (kn ? ', ' + Crew.KNACKS[kn].name : '') +
            '  ·  ' + Crew.dailyWage(p) + ' cr/day',
            function () {
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
    return 0;
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
            }, !yard);
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
      row('THIS LOAD FOUNDS', near.length ? 'a Crawler becomes a station\'s first bay — founding comes next'
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
            }, onSlip || !!why, { hot: !onSlip && !why });
      });
    }

    /* ELSEWHERE: crates you own at other yards. */
    mine.filter(function (r) { return !r.aboard && here.indexOf(r) < 0; }).forEach(function (r) {
      var c = Cn.BY_ID[r.crateId];
      row(c.name.toUpperCase() + ' CRATE  [' + c.size + ']  ·  AT ' + (r.portName || 'another yard').toUpperCase(),
          (r.starName ? r.starName + '  ·  ' : '') +
          (Cn.ready(r, G.t) ? 'ready' : 'ready in ' + fmtLogAge(r.due - G.t)),
          function () {}, true);
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
    Cn.CRATES.forEach(function (c) {
      var why = Cn.orderRefusal(G, c.id);
      row('  ' + c.name.toUpperCase() + '  [' + c.size + ']  —  ' + c.price + ' cr  ·  ' +
          c.days + (c.days === 1 ? ' day' : ' days'),
          why || (c.blurb + '  ·  ' + Cn.PER_CUBE[c.size] + ' to a cube'),
          function () {
            var r = Cn.order(G, c.id);
            say(r.ok ? c.name + ' crate ordered — ready here in ' + r.days + (r.days === 1 ? ' day' : ' days')
                     : 'No: ' + r.why, 6);
          }, !!why);
    });
    return 0;
  }

  /* --- FLEET: the ships you own and are not sitting in --------------------
   *
   * A list, deliberately. Everything a fleet eventually DOES — orders,
   * crew, swapping seats — hangs off knowing which ships there are and
   * where, and that is a thing worth being able to see before it is a
   * thing worth being able to do. Selling is here because a hull you
   * cannot get rid of is a hull the yard tricked you into.
   */
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
  function drawYardFit(ctx, x, w, row, s) {
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
      var id = map[key], item = id && Combat.EQUIPMENT[id];
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
            }, full);
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
          }, dFull);
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
          }, sFull);
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
      var dp = it.kind === 'cruisedrive' && Combat.drivePreview ? Combat.drivePreview(G, it.id) : null;
      if (dp) {
        fitCheck = dp.ok ? { ok: true } : { ok: false, why: dp.why };
        afford = s.credits >= (dp.ok ? dp.net : it.price);
      }
      var yardWhy = Combat.yardRefusal ? Combat.yardRefusal(G) : null;
      if (yardWhy) fitCheck = { ok: false, why: yardWhy };
      if (lienWhy) sub = 'not while the lien stands — see above';
      else if (!fitCheck.ok) sub = fitCheck.why;
      else if (!afford) sub = 'short ' + ((dp && dp.ok ? dp.net : it.price) - s.credits) + ' cr';
      else if (dp && dp.ok) {
        var fc = function (c) { return c >= 100 ? Math.round(c) + 'c' : c.toFixed(1) + 'c'; };
        var dry = it.mil && !((s.cargo && s.cargo.milfuel) > 1e-6);
        sub = 'top speed ' + fc(dp.nowC) + ' → ' + fc(dp.topC) +
              (dry ? ' (' + fc(dp.topC * 5) + ' with milfuel aboard)' : '') +
              (dp.replaces ? '  ·  trades in ' + dp.replaces.name + ' (' + dp.tradeIn + ' cr)  ·  ' + dp.net + ' cr net'
                           : '  ·  second drive');
      }
      else if (it.kind === 'gun') sub = it.dmg + ' dmg · ' + it.range + ' km · ' +
                                       it.power.toFixed(1) + ' MW · ' + it.heat + ' heat/s';
      else if (it.kind === 'reactor') sub = '+' + it.powerBonus.toFixed(1) + ' MW · ' + it.mass + ' t';
      else sub = it.power.toFixed(1) + ' MW · ' + it.mass + ' t';
      /* The yard's own copy, after the numbers. The numbers are what you
       * decide on; the pitch is what makes the shelf feel like a shelf. */
      if (fitCheck.ok && afford && it.pitch) sub += '  “' + it.pitch + '”';

      row(it.name.toUpperCase() + ' — ' + it.price + ' cr', sub,
          (function (eq) {
            return function () {
              var r = Combat.buyEquipment(G, eq.id);
              say(r.ok ? eq.name + ' fitted' : 'No: ' + r.why, 5);
            };
          })(it), !fitCheck.ok || !afford || !!lienWhy);
    }
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
      row('  ' + label + ':  ' + optionName(s, o.fit[key]) + '  ▶', null, function () {
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
    return { cost: keep ? hull.price : hull.price - Math.round((here ? here.price : 0) * 0.7), ok: true };
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
    var r = Combat.buyHull(G, hull.id, keep, null);
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
                                                  livery: o.livery || null });
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
    for (var li = 0; li < lines.length && y + 57 + li * 12 < y + h - 32; li++) {
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
              'Enter lays in the course   ·   F8 engages');
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
      var short = held + 1e-9 < m.tonnes;
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
      ctx.fillText(clipText(destinationLine(m), subCols), pad + 14, y + 27);
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
      y += 46;

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
      ctx.fillText(Missions.standingLabel(st) + ' (' + st + ')', pad + leftW * 0.55, yy);
      if (owed > 0) {
        ctx.fillStyle = '#ff5a5a';
        ctx.textAlign = 'right';
        ctx.fillText('bounty ' + Math.round(owed), pad + leftW - 12, yy);
        ctx.textAlign = 'left';
      }
      ctx.restore();
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

    var offers = Missions.boardAt(docked, G.sys, G.galaxy, G.here, G.t)
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

    var oy = top + pad + 40;
    var sawCampaignBoardHdr = false, sawContractBoardHdr = false;
    for (var o = 0; o < offers.length; o++) {
      var off = offers[o];
      if (oy + 46 > top + pad + colH - 6) break;
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
      ctx.fillStyle = noPass ? '#6a7d92'
                    : off.campaign ? '#ffe07a'
                    : off.type === 'passage' ? '#c7b4ff'
                    : off.type === 'courier' ? '#b4f0ff'
                    : off.type === 'disposal' ? '#ffb86b' : MFD_INK;
      ctx.fillText((off.campaign ? '★ ' : '') +
                   clipText(off.text, Math.floor((rw - 130) / 7.7)), rx + 16, oy + 14);
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      if (noPass) ctx.fillStyle = '#ffb86b';
      ctx.fillText(clipText('pays ' + fmtCredits(off.pay) + '   ·   due ' +
                            fmtTime(off.deadline - G.t) + '   ·   ' +
                            (noPass ? noPass
                               : off.type === 'passage' ? (off.souls + ' berths')
                               : off.tonnes + 't of hold'),
                            Math.floor((rw - 130) / 6.16)), rx + 16, oy + 28);
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
      oy += 48;

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
  }

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
      if (!b.market) continue;
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

  function territoryField(plotSize, cx, cy, scale) {
    var stars = chartedStars();
    var key = stars.length + '|' + plotSize + '|' + Math.round(scale * 1000) +
              '|' + (G.seed || '');
    if (terrCache && terrCache.key === key) return terrCache;

    var n = Math.max(2, Math.ceil(plotSize / TERRITORY_CELL));
    var x0 = cx - plotSize / 2, y0 = cy - plotSize / 2;
    var reachPx = TERRITORY_REACH_LY * scale;
    var owner = new Array(n * n), ctl = new Array(n * n);
    var gx = [], gy = [], i;
    /* Star positions in PLOT space once, rather than per cell. The stem is
     * deliberately not applied: a star's dot is drawn lifted by its height
     * but its territory belongs where it is on the floor of the plot, and
     * lifting the region too would slide every border off its own stars. */
    for (i = 0; i < stars.length; i++) {
      gx.push(cx + stars[i].x * scale);
      gy.push(cy - stars[i].y * scale);
    }

    for (var r = 0; r < n; r++) {
      var py2 = y0 + (r + 0.5) * TERRITORY_CELL;
      for (var c = 0; c < n; c++) {
        var px2 = x0 + (c + 0.5) * TERRITORY_CELL;
        var best = -1, bestD = reachPx * reachPx;
        for (i = 0; i < stars.length; i++) {
          var ddx = px2 - gx[i], ddy = py2 - gy[i];
          var d2 = ddx * ddx + ddy * ddy;
          if (d2 < bestD) { bestD = d2; best = i; }
        }
        var k = r * n + c;
        if (best < 0) { owner[k] = null; ctl[k] = 0; continue; }
        owner[k] = stars[best].factionId;
        /* Control of the SYSTEM, faded toward the edge of that star's
         * reach — so a lone charted system reads as a claim that runs out
         * rather than as a hard-edged tile, and a cluster of them reads as
         * one region. */
        var fade = 1 - Math.sqrt(bestD) / reachPx;
        ctl[k] = Galaxy.control(G.galaxy, stars[best]) * (0.45 + 0.55 * fade);
      }
    }
    terrCache = { key: key, n: n, x0: x0, y0: y0, owner: owner, ctl: ctl };
    return terrCache;
  }

  /* PAINTED ONCE, THEN BLITTED. Measured: drawing the fill and the borders
   * live cost 4,900 fillRects and one border sweep per power every frame,
   * and took a fully-charted galaxy from 77 fps to 15. The field was
   * already cached; the PICTURE of it now is too, on an offscreen surface
   * keyed the same way, so a frame costs one drawImage and the whole thing
   * is rebuilt only when you chart something new or the window resizes.
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

  function drawTerritory(ctx, px, py, plotSize, cx, cy, scale) {
    if (!G.galaxy || !G.charted) return;
    var f = territoryField(plotSize, cx, cy, scale);
    var side = f.n * TERRITORY_CELL;
    var surf = territorySurface(Math.ceil(side), Math.ceil(side));
    if (surf) {
      if (surf.key !== f.key) {
        surf.ctx.clearRect(0, 0, surf.canvas.width, surf.canvas.height);
        paintTerritory(surf.ctx, f, -f.x0, -f.y0);
        surf.key = f.key;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(f.x0, f.y0, side, side);
      ctx.clip();
      ctx.drawImage(surf.canvas, f.x0, f.y0);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(f.x0, f.y0, side, side);
    ctx.clip();
    paintTerritory(ctx, f, 0, 0);
    ctx.restore();
  }

  /* The fill and the borders, in plot coordinates offset by (ox, oy) — zero
   * when painting straight onto the chart, and minus the field's origin
   * when painting into the offscreen surface. */
  function paintTerritory(ctx, f, ox, oy) {
    var n = f.n, cell = TERRITORY_CELL;
    var byId = G.galaxy.factionById || {};
    var r, c, k;

    /* THE FILL. One pass, no gradients: a flat wash per cell whose alpha is
     * the control reading. Cells of the same colour abut exactly, so a
     * region reads as one shape rather than as tiles. */
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        k = r * n + c;
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
      for (var r2 = 0; r2 < n; r2++) {
        for (var c2 = 0; c2 < n; c2++) {
          var kk = r2 * n + c2;
          if (f.owner[kk] !== fac.id) continue;
          var X = ox + f.x0 + c2 * cell, Y = oy + f.y0 + r2 * cell;
          if (c2 === 0 || f.owner[kk - 1] !== fac.id) {
            seg(X + inset, Y, X + inset, Y + cell);
          }
          if (c2 === n - 1 || f.owner[kk + 1] !== fac.id) {
            seg(X + cell - inset, Y, X + cell - inset, Y + cell);
          }
          if (r2 === 0 || f.owner[kk - n] !== fac.id) {
            seg(X, Y + inset, X + cell, Y + inset);
          }
          if (r2 === n - 1 || f.owner[kk + n] !== fac.id) {
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

  function drawStarMap(ctx, w, h) {
    var m = G.starMap;
    m.list = jumpCandidates();
    if (m.sel >= m.list.length) m.sel = Math.max(0, m.list.length - 1);
    var plan = m.list[m.sel];

    var pw = Math.min(1080, w - 40), ph = Math.min(700, h - 40);
    var px = (w - pw) / 2, py = (h - ph) / 2;
    panel(ctx, px, py, pw, ph, true);

    var plotSize = Math.min(ph - 90, pw * 0.56);
    var cx = px + 30 + plotSize / 2, cy = py + 62 + plotSize / 2;
    var scale = (plotSize / 2) / (G.galaxy.radius * 1.06);

    function toScreen(s) {
      return { x: cx + s.x * scale, y: cy - s.y * scale, stem: s.z * scale };
    }

    var dx = px + plotSize + 56, dw = pw - plotSize - 86;

    drawTerritory(ctx, px, py, plotSize, cx, cy, scale);

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

    // Distance rings, so the scale is readable without a legend.
    ctx.save();
    ctx.strokeStyle = 'rgba(120,160,220,0.16)';
    ctx.lineWidth = 1;
    for (var ring = 10; ring <= G.galaxy.radius; ring += 10) {
      ctx.beginPath(); ctx.arc(cx, cy, ring * scale, 0, K.TAU); ctx.stroke();
    }
    ctx.restore();

    var hereScreen = toScreen(G.here);

    /* The reachable set, drawn as a circle around you. It is honestly a
     * SPHERE — a star directly above you is closer than it looks here —
     * which is exactly why every star also carries its height stem. */
    ctx.save();
    ctx.strokeStyle = 'rgba(125,250,255,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(hereScreen.x, hereScreen.y, Galaxy.maxRange(G.ship) * scale, 0, K.TAU);
    ctx.stroke();
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
    for (var i = 0; i < G.galaxy.stars.length; i++) {
      var s = G.galaxy.stars[i];
      var sp = toScreen(s);
      var isHere = s === G.here;
      var seen = !!G.visited[s.id];
      var d = Galaxy.distance3(G.here, s);
      var canReach = !isHere && d <= Galaxy.maxRange(G.ship);

      ctx.save();
      // Height stem — the whole reason this reads as 3D.
      if (Math.abs(sp.stem) > 0.5) {
        ctx.strokeStyle = 'rgba(140,175,215,0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sp.x, sp.y - sp.stem); ctx.stroke();
      }
      var y = sp.y - sp.stem;
      var r = 1.8 + Math.min(2.6, Math.log(1 + s.luminosity) * 1.1);
      ctx.globalAlpha = canReach || isHere ? 1 : (seen ? 0.75 : 0.42);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(sp.x, y, r, 0, K.TAU); ctx.fill();
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
      /* Click a star to plot to it. Same act as walking the list with the
       * arrow keys, and the hit box is generous because a 4-pixel dot is
       * not a target. */
      hot(sp.x - 9, y - 9, 18, 18, (function (idx) {
        return function () { G.starMap.sel = idx; };
      })(indexOfPlan(m.list, s)));

      if (plan && s === plan.to) {
        ctx.strokeStyle = plan.possible ? '#7dffb0' : '#ff7a7a';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(sp.x - r - 6, y - r - 6, (r + 6) * 2, (r + 6) * 2);
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillStyle = plan.possible ? '#7dffb0' : '#ff7a7a';
        ctx.fillText(s.name, sp.x + r + 10, y + 3);
      } else if (isHere) {
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillStyle = '#ffe6a8';
        ctx.fillText(s.name, sp.x + r + 10, y + 3);
      }
      ctx.restore();
    }

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
        if (known.pirateHeld) {
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
    ctx.fillText('↑↓ or click a star   ·   PgUp/PgDn ten   ·   Home nearest   ·   ' +
                 'Enter lays in the course   ·   F8 engages      ' +
                 '(green ring = visited · dashed circle = your reach)',
                 px + 24, py + ph - 18);
    ctx.restore();
  }

  /* Which row of the candidate list is this star? The chart draws stars in
   * galaxy order and the list is sorted by distance, so clicking one has to
   * translate between the two. */
  function indexOfPlan(list, star) {
    for (var i = 0; i < list.length; i++) if (list[i].to === star) return i;
    return 0;
  }


  /* Which screen draws is decided here, keyed by the mode id main.js keeps
   * in its MODES table — the table itself stays with the input handling. */
  function draw(ctx, w, bottom, id) {
    /* Scroll regions are rebuilt every frame by whatever drew a list, the
     * same way hotspots are. Clearing here means a region cannot outlive
     * the panel that made it and go on eating the wheel from a screen
     * nobody is looking at. */
    SCROLL = null;
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
    }
    return false;
  }

  global.Screens = {
    bind: bind,
    draw: draw,
    commsContacts: commsContacts,
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
    wheelAt: wheelAt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Screens;
})(typeof window !== 'undefined' ? window : globalThis);
