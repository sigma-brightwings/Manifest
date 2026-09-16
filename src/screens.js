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
      Gen = global.Gen;

  /* Wired by main.js at boot. Unpacked to bare names so the moved code is
   * byte-for-byte the code that was tested in its old home. */
  var G, say, selectPanel, hot, navList, navTargetState, navMark, jettison,
      heldCargo, openMarket, plottedCourse, jumpCandidates, doJump, complyWithDemand,
      hailAuthority, payOutstanding, hailSelected,
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
    openMarket = api.openMarket;
    plottedCourse = api.plottedCourse; jumpCandidates = api.jumpCandidates;
    doJump = api.doJump; complyWithDemand = api.complyWithDemand;
    hailAuthority = api.hailAuthority; payOutstanding = api.payOutstanding;
    hailSelected = api.hailSelected;
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
    ctx.translate(x + (w - MFD_W * s) / 2, y);
    ctx.scale(s, s);
    fn(ctx);
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

    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(title, 16, 20);

    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#5d8fa4';
    ctx.textAlign = 'right';
    ctx.fillText(hint || 'Esc or F1 returns to the cockpit', w - 16, 20);
    ctx.textAlign = 'left';

    /* The two things the flight footer carried that a mode still needs. It
     * goes here because a mode owns the whole screen down to the icon bar,
     * and anything written at the bottom lands inside whatever the mode
     * drew there. */
    ctx.font = '10px ui-monospace, monospace';
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
  function editing() { return !!EDIT; }
  function editState() { return EDIT; }
  function cancelEdit() { EDIT = null; }

  function editKey(e) {
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

    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.fillText(EDIT.label, x + 8, y + 13);

    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = '#ffffff';
    var shown = EDIT.value;
    var caret = (Math.floor(Date.now() / 450) % 2) ? '_' : ' ';
    ctx.fillText(clipText(shown, Math.floor((w - 20) / 7.8)) + caret, x + 8, y + 31);

    ctx.font = '9px ui-monospace, monospace';
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
    ctx.font = 'bold 11px ui-monospace, monospace';
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
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('BODIES', lx + 10, ly + 18);
    ctx.restore();

    var list = G.sys.bodies;
    var lines = Math.floor((rowH - 36) / 14);
    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
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
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('+' + (list.length - lines) + ' more', lx + 10, ly + rowH - 10);
    }
    ctx.restore();
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
    ctx.font = 'bold 12px ui-monospace, monospace';
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
    ctx.font = '12px ui-monospace, monospace';
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
      ctx.fillStyle = idx === sel ? MFD_HOT : MFD_INK;
      ctx.fillText(clipText(e.name, 24), pad + 26, yy);
      ctx.fillStyle = idx === sel ? MFD_HOT : MFD_DIM;
      ctx.textAlign = 'right';
      ctx.fillText(fmtDist(e.range), pad + listW - 12, yy);
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
    var half = Math.min((colH - pad) / 2, tileHeight(pageW));
    tile(ctx, rx, top + pad, pageW, half, drawTargetPage);
    tile(ctx, rx, top + pad + half + pad, pageW, half, drawAutoPage);

    var sx = rx + pageW + pad, sw = w - sx - pad;
    if (sw < 200) return;
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(sx, top + pad, sw, colH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 2, top + pad + 2, sw - 4, colH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(sx + 4, top + pad + 4, sw - 8, 19);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('SCOPE', sx + 10, top + pad + 18);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#7fd6c0';
    ctx.textAlign = 'right';
    ctx.fillText('0.75 AU  ·  nose up  ·  stalks show height', sx + sw - 10, top + pad + 18);
    ctx.textAlign = 'left';
    ctx.restore();
    scopeBody(ctx, sx + sw / 2, top + pad + 26 + (colH - 34) * 0.5,
              Math.min(sw / 2 - 30, 280), Math.min((colH - 60) * 0.42, 120));
  }

  /* --- F4: comms ---------------------------------------------------------
   * The directory of everyone in range you could talk to. The conversations
   * themselves are the next piece of work; what exists now is the channel
   * list, which is the part the rest of it hangs off. */
  function commsContacts() {
    var out = [];
    var i;

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
      var f2 = G.sys.factionById && G.sys.factionById[s.faction];
      out.push({ kind: 'ship', obj: s, name: s.name, range: r2,
                 who: s.className || 'Ship',
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
    ctx.font = 'bold 12px ui-monospace, monospace';
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
      ctx.font = '12px ui-monospace, monospace';
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
    ctx.font = '11px ui-monospace, monospace';
    for (var i = start; i < end; i++) {
      var e = log[i], yy = y + 34 + (i - start) * rowH;
      var age = (G.t || 0) - (e.at || 0);
      ctx.fillStyle = 'rgba(120,150,180,0.65)';
      ctx.fillText(fmtLogAge(age), x + 10, yy);
      /* The newest line stays bright; everything behind it dims, so at a
         glance you can see how far back you are reading. */
      ctx.fillStyle = (i === log.length - 1) ? '#d8f4ff' : 'rgba(190,215,235,0.8)';
      var txt = e.text + (e.n > 1 ? '  \u00d7' + e.n : '');
      ctx.fillText(clipText(txt, Math.max(10, Math.floor((w - 96) / 6.6))), x + 66, yy);
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
    if (G.commsSel >= contacts.length) G.commsSel = Math.max(0, contacts.length - 1);

    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(pad, top + pad, listW, colH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad + 2, top + pad + 2, listW - 4, colH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(pad + 4, top + pad + 4, listW - 8, 19);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('CHANNELS IN RANGE', pad + 10, top + pad + 18);
    ctx.restore();

    if (!contacts.length) {
      ctx.save();
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('NOTHING IN RANGE', pad + 14, top + pad + 48);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('the transmitter is good for 0.75 AU.', pad + 14, top + pad + 68);
      ctx.restore();
    }

    var rowH = 18, avail = Math.floor((colH - 40) / rowH);
    var first = Math.max(0, Math.min(Math.max(0, contacts.length - avail),
                                     G.commsSel - Math.floor(avail / 2)));
    ctx.save();
    ctx.font = '12px ui-monospace, monospace';
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
        return function () { G.commsSel = n; G.piracyMenu = null; };
      })(idx));
    }
    ctx.restore();

    /* The channel itself, and under it the LOG. The channel pane gives up its
       bottom 44% rather than the log going somewhere else on the HUD: what is
       said to you and who said it belong on the same screen, and the comms
       screen already owns the scrolling idiom. */
    var rx = pad * 2 + listW, rw = w - rx - pad;
    var logH = Math.max(120, Math.round(colH * 0.44));
    var chanH = colH - logH - 10;
    drawMessageLog(ctx, rx, top + pad + chanH + 10, rw, logH);
    var sel = contacts[G.commsSel];
    ctx.save();
    ctx.fillStyle = '#040a0e';
    ctx.fillRect(rx, top + pad, rw, chanH);
    ctx.strokeStyle = MFD_EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx + 2, top + pad + 2, rw - 4, chanH - 4);
    ctx.fillStyle = '#12414f';
    ctx.fillRect(rx + 4, top + pad + 4, rw - 8, 19);
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(sel ? 'CHANNEL — ' + clipText(sel.name, 30) : 'CHANNEL', rx + 10, top + pad + 18);
    ctx.restore();

    if (!sel) return;

    var y = top + pad + 46;
    ctx.save();
    ctx.font = '15px ui-monospace, monospace';
    ctx.fillStyle = sel.color;
    ctx.fillText(sel.name, rx + 16, y);
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText(sel.who +
                 (sel.obj && sel.obj.reg ? '   ·   reg ' + sel.obj.reg : '') +
                 '   ·   ' + fmtDist(sel.range) + ' out', rx + 16, y + 18);
    ctx.restore();

    var opts = commsOptions(sel);
    var by = y + 44, bw = Math.min(300, rw - 32), bh = 30;
    for (var i = 0; i < opts.length; i++) {
      btn(ctx, rx + 16, by + i * (bh + 8), bw, bh, opts[i].label, opts[i].fn,
          { disabled: !opts[i].enabled });
      if (opts[i].note) {
        ctx.save();
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(160,185,220,0.6)';
        ctx.fillText(opts[i].note, rx + 24 + bw, by + i * (bh + 8) + 19);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(160,185,220,0.55)';
    ctx.fillText('Traffic control answers immediately; ships answer when they feel like it.',
                 rx + 16, top + pad + chanH - 14);
    ctx.restore();
  }

  /* What you can say to whoever is selected. Deliberately shaped as a list
   * of intents rather than a dialogue tree — the tree is the next piece of
   * work and this is the shape it will grow into. */
  function commsOptions(c) {
    var opts = [];
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
      opts.push({ label: 'Mission board', enabled: true,
                  note: 'F7', fn: function () { selectPanel(6); } });
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
      opts.push({
        label: 'Demand credits', enabled: true,
        note: 'wired straight to your account',
        fn: function () {
          G.piracyMenu = null;
          Combat.demandFrom(G.sys, G, G.t, c.obj, 'credits', hooksFor());
        }
      });
      opts.push({
        label: 'Never mind', enabled: true,
        fn: function () { G.piracyMenu = null; }
      });
    } else {
      opts.push({
        label: 'Hail', enabled: true,
        fn: function () {
          say(c.name + (c.hostile ? ' does not answer.' : ' acknowledges.'), 4);
        }
      });
      opts.push({
        label: 'Request assistance', enabled: !c.hostile,
        fn: function () { say(c.name + ' is not diverting from its route.', 4); }
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

  function drawPanelsTab(ctx, pad, top, w, bottom) {
    if (!dash) return;
    var arc = mountArc();
    if (!G.panelPick || !dash.pageFor(G.panelPick)) G.panelPick = 'centre';

    var listW = Math.min(190, Math.max(150, w * 0.2));
    var bayW = w - pad * 2 - listW - 16;
    var bayX = pad, bayY = top, bayH = bottom - top - pad;

    /* --- the console, in plan --- */
    var tileW = Math.min(150, (bayW - 24) / Math.max(1, arc.fwd.length) - 10);
    var tileH = 54;

    function seat(cx, cy) {
      ctx.strokeStyle = 'rgba(125,255,207,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(125,255,207,0.45)';
      ctx.font = '9px ui-monospace, monospace';
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
      ctx.font = 'bold 12px ui-monospace, monospace';
      /* A BROKEN SCREEN STILL SHOWS WHAT IS ASSIGNED TO IT. Reading only
       * "PANEL OUT" hides the setting behind the damage, so you could not
       * decide what a screen will show before paying to fix it. The page
       * stays, dimmed, and the damage is called out on the line below. */
      ctx.fillStyle = dead ? '#6d5252' : (on ? '#b4f0ff' : MFD_INK);
      ctx.fillText(page.title, x + tileW / 2, y + 24);
      ctx.font = '9px ui-monospace, monospace';
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
      var lift = Math.abs(arc.fwd[i].bearing) / (Math.PI / 6) * 12;
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

    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = '#5d6f78';
    ctx.textAlign = 'center';
    ctx.fillText('rear bulkhead — turn round to read these', cx, rowAftY + tileH + 16);
    ctx.textAlign = 'left';

    /* --- the pages you can put on it --- */
    var lx = bayX + bayW + 16, ly = top;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(String(G.panelPick).replace('-', ' ').toUpperCase(), lx, ly + 12);
    ly += 22;
    var cur = dash.pageFor(G.panelPick);
    var rowH = 20;
    for (var k = 0; k < dash.pages.length; k++) {
      var pg = dash.pages[k];
      var sel = pg.id === cur.id;
      if (ly + rowH > bottom - pad) break;
      ctx.fillStyle = sel ? '#12414f' : 'rgba(8,20,25,0.7)';
      ctx.fillRect(lx, ly, listW, rowH - 2);
      ctx.strokeStyle = sel ? MFD_EDGE : 'rgba(74,151,176,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(lx + 0.5, ly + 0.5, listW - 1, rowH - 3);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = sel ? '#b4f0ff' : MFD_INK;
      ctx.fillText(pg.title, lx + 8, ly + 14);
      hot(lx, ly, listW, rowH - 2, (function (pid) {
        return function () { dash.set(G.panelPick, pid); };
      })(pg.id), 'show this page here');
      ly += rowH;
    }
  }

  function drawShipScreen(ctx, w, bottom) {
    if (G.shipTab !== 'guns' && G.shipTab !== 'panels') G.shipTab = 'status';
    var guns = G.shipTab === 'guns';
    var panels = G.shipTab === 'panels';
    var top = modeFrame(ctx, w, bottom,
                        guns ? 'SHIP — GUNS'
                        : panels ? 'SHIP — CONSOLE PANELS'
                        : 'SHIP STATUS & INVENTORY',
                        guns ? 'Tab panels   ·   space fires A   ·   shift+space fires B'
                        : panels ? 'Tab status   ·   pick a mount, then pick a page'
                             : (G.ship.docked ? 'Tab guns   ·   F4 trade   ·   ↑↓ select   ·   Del jettison'
                                              : 'Tab guns   ·   ↑↓ select   ·   Del jettison   ·   Shift+Del all'));

    /* Two tabs across the top: the inventory layout, and the guns board
     * that used to live on the deck MFD cycle. Clickable, and Tab toggles
     * them from the keyboard (main.js). The strip sits just under the mode
     * header and shifts the content down by its height. */
    var pad = 14;
    var tabH = 22, tabW = 150, tabY = top + 4;
    var tabs = [ { id: 'status', label: 'STATUS & INVENTORY', wide: true },
                 { id: 'guns',   label: 'GUNS' },
                 { id: 'panels', label: 'PANELS' } ];
    var tx = pad;
    for (var ti = 0; ti < tabs.length; ti++) {
      var tw = tabs[ti].wide ? tabW : 90;
      var on = G.shipTab === tabs[ti].id;
      ctx.fillStyle = on ? '#12414f' : '#081419';
      ctx.fillRect(tx, tabY, tw, tabH);
      ctx.strokeStyle = MFD_EDGE; ctx.lineWidth = on ? 2 : 1;
      ctx.strokeRect(tx + 1, tabY + 1, tw - 2, tabH - 2);
      ctx.font = 'bold 11px ui-monospace, monospace';
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
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText('FITTED EQUIPMENT', pad + 10, eqY + 18);
    ctx.restore();

    var fitted = fittedEquipment();
    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    /* Both halves of the row clipped to the panel they are actually in. The
     * old fixed 26 and 30 characters assumed a wide window: on a narrow one
     * they add up to far more than the panel holds, so the name and the
     * value were drawn straight through each other — "Photon intermittent
     * laser" over "62 dmg · GROUP A". Split the lane instead, and let a
     * small window clip harder on its own. */
    var lane = Math.max(60, leftW - 24);
    var nameCap = Math.max(8, Math.floor(lane * 0.44 / 6.7));
    var valCap = Math.max(6, Math.floor(lane * 0.52 / 6.7));
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
      ctx.fillText(clipText(row.value + (row.uncertified ? '  UNCERTIFIED' : ''), valCap),
                   pad + leftW - 12, yy);
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
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(s.docked ? 'click a gun to change its fire group  ·  fittings sell in the yard'
                          : 'click a gun to change its fire group  ·  top rows rename',
                 pad + 12, eqY + eqH - 10);
    ctx.restore();

    /* The reroll button sits beside the registration row, because typing a
     * callsign by hand is the fussy path and taking the next one the seed
     * offers is the ordinary one. */
    if (s.docked) {
      btn(ctx, pad + leftW - 92, eqY + 40 + 2 * 15 - 12, 78, 14,
          'REROLL REG', rerollReg, { font: 9 });
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
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    var cargo = Sim.cargoMass(s);
    ctx.fillText('CARGO HOLD   ' + cargo.toFixed(0) + ' / ' + s.cargoCap + ' t', rx + 10, top + pad + 18);
    ctx.restore();

    var held = heldCargo();
    if (G.invSel >= held.length) G.invSel = Math.max(0, held.length - 1);

    if (!held.length) {
      ctx.save();
      ctx.font = '13px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('HOLD EMPTY', rx + 16, top + pad + 56);
      ctx.font = '11px ui-monospace, monospace';
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
    ctx.font = '10px ui-monospace, monospace';
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
        ctx.font = '10px ui-monospace, monospace';
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
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = it.cid === 'waste' ? '#ffb86b' : (on ? MFD_HOT : MFD_INK);
      ctx.fillText(clipText(it.name, 26), rx + 16, yy + 18);

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

      hot(rx + 8, yy, Math.max(40, btnX1 - rx - 12), rowH - 4, (function (n) {
        return function () { G.invSel = n; };
      })(i));

      /* The two buttons, right where the cargo is. */
      btn(ctx, btnX1, yy + 2, btnW, rowH - 8, 'EJECT 1t',
          (function (item, n) {
            return function () { G.invSel = n; jettison(item.cid, 1); };
          })(it, i), { hot: true, font: 10 });
      btn(ctx, btnX2, yy + 2, btnW, rowH - 8, 'EJECT ALL',
          (function (item, n) {
            return function () { G.invSel = n; jettison(item.cid, Infinity); };
          })(it, i), { hot: true, font: 10 });
    }

    if (port && total) {
      ctx.save();
      ctx.font = '12px ui-monospace, monospace';
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
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    /* Named for what this place actually IS. The trade console has always
     * announced the port's role; the yard said "SHIPYARD & OUTFITTING"
     * everywhere, including at a farming co-op with three items on the
     * shelf. Now that stock genuinely varies by port, the sign has to tell
     * the truth about it — same principle as the starport dressing. */
    var roleName = (port.market && port.market.roleName) || 'Port';
    ctx.fillText(clipText(roleName.toUpperCase() + '  ·  OUTFITTING',
                          Math.floor((w - 130) / 7.1)), x + 10, y + 18);
    ctx.font = '10px ui-monospace, monospace';
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
    ctx.font = '10px ui-monospace, monospace';
    var pTight = sum.powerFree < 1.0, mTight = sum.massFree < 1.5;
    ctx.fillStyle = pTight ? '#ffb86b' : '#7fd6c0';
    ctx.fillText('POWER ' + sum.powerUsed.toFixed(1) + ' / ' + sum.powerCap.toFixed(1) + ' MW',
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
    var tabs = [['fit', 'FITTING'], ['buy', 'BUY'], ['hull', 'HULLS']];
    for (var ti = 0; ti < tabs.length; ti++) {
      btn(ctx, x + w - 12 - (tabs.length - ti) * 66, barY, 62, 15, tabs[ti][1],
          (function (id) { return function () { G.yardTab = id; }; })(tabs[ti][0]),
          { font: 9, hot: G.yardTab === tabs[ti][0] });
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

    if (G.yardTab === 'fit') drawYardFit(ctx, x, w, row, s);
    else if (G.yardTab === 'buy') drawYardBuy(ctx, x, w, row, s, port);
    else drawYardHulls(ctx, x, w, row, s);

    /* ---- the window ---- */
    var bh = 21, gap = 4;
    var listY = barY + 22;
    var listH = (y + h - 6) - listY;
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
                   Math.floor(rowW / 6.4)),
          r.fn, { disabled: r.disabled, font: 10, hot: r.hot });
    }

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
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(160,185,220,0.55)';
        ctx.fillText((G.yardScroll + 1) + '-' +
                     Math.min(rows.length, G.yardScroll + perPage) +
                     ' of ' + rows.length, x + 352, barY + 11);
        ctx.restore();
      }
    }
  }

  /* --- FITTING: what is bolted on, and what it costs you ------------------ */
  function drawYardFit(ctx, x, w, row, s) {
    var keys = Combat.slotKeys(s);
    var map = s.fit || {};
    var shown = 0;
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
                        : 'Nothing in that slot', 4);
              };
            })(key, item.name), false);
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
    var hawk = Combat.MISSILES.hawk;
    var mFull = s.missiles >= hawk.rack;
    row('HAWK SEEKER — ' + hawk.price + ' cr',
        'aboard ' + s.missiles + ' / ' + hawk.rack +
        (mFull ? '  ·  rack full' : '  “' + hawk.pitch + '”'),
        function () {
          var r = Combat.buyOutfit(G, 'missile', 'hawk');
          say(r > 0 ? 'Missile racked — ' + s.missiles + ' aboard' : 'Not enough credits', 4);
        }, mFull);

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

    for (var i = 0; i < stock.length; i++) {
      var entry = stock[i], it = entry.item;
      if (!entry.available) {
        row(it.name.toUpperCase() + ' — LOCKED', entry.why, function () {}, true);
        continue;
      }
      var fitCheck = Combat.canFit(s, it.id);
      var afford = s.credits >= it.price;
      var sub;
      if (!fitCheck.ok) sub = fitCheck.why;
      else if (!afford) sub = 'short ' + (it.price - s.credits) + ' cr';
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
          })(it), !fitCheck.ok || !afford);
    }
  }

  /* --- HULLS -------------------------------------------------------------- */
  function drawYardHulls(ctx, x, w, row, s) {
    var order = ['talon', 'dart', 'kestrel', 'mule'];
    for (var i = 0; i < order.length; i++) {
      var hull = Combat.HULLS[order[i]];
      if (hull.id === s.hullId) continue;
      var delta = hull.price - Math.round(Combat.HULLS[s.hullId || 'talon'].price * 0.7);
      row(hull.name.toUpperCase() + ' — ' + delta + ' cr',
          hull.cargoCap + 't hold · ' + hull.hullMax + ' hull · ' +
          hull.powerMW.toFixed(1) + ' MW · ' + hull.blurb,
          (function (hid, nm) {
            return function () {
              var r = Combat.buyHull(G, hid);
              if (!r.ok) { say('No deal: ' + r.why, 5); return; }
              /* Name the standard gear the hull came with, when it is gear
               * the pilot did not already have. A scoop that silently
               * appears is indistinguishable from a bug, and a scoop that
               * silently does NOT appear is the bug that took piracy out
               * for everyone who had ever died. */
              var extra = (r.standard || []).map(function (id) {
                return (Combat.EQUIPMENT[id] || {}).name || id;
              });
              say('Welcome aboard your ' + nm +
                  (extra.length ? ' — fitted as standard: ' + extra.join(', ') : ''), 5);
            };
          })(hull.id, hull.name), false);
    }
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
      { name: 'Cargo hold', value: s.cargoCap + ' t' },
      { name: 'Scanner', value: fmtDist(RADAR_RANGE) },
      { name: 'Autopilot', value: 'dock / cruise' }
    ];

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
      else val = it.power.toFixed(1) + ' MW';
      out.push({ name: it.name, value: val, uncertified: !!it.grey });
    }
    if (s.missiles > 0) {
      out.push({ name: 'Hawk seekers', value: s.missiles + ' / ' + Combat.MISSILES.hawk.rack });
    }
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
    ctx.font = 'bold 12px ui-monospace, monospace';
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
      ctx.font = '12px ui-monospace, monospace';
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
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillStyle = '#8a7a3a';
        ctx.fillText('FACTION CAMPAIGNS', pad + 14, y);
        ctx.restore();
        y += 16;
      } else if (!m.campaign && !sawContractHdr && sawCampaignHdr) {
        sawContractHdr = true;
        ctx.save();
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillStyle = '#5d8fa4';
        ctx.fillText('CONTRACTS', pad + 14, y);
        ctx.restore();
        y += 16;
      }
      var leftT = m.deadline - G.t;
      var held = G.ship.cargo[m.cid] || 0;
      var short = held + 1e-9 < m.tonnes;
      var headCols = Math.max(20, Math.floor((leftW - 120) / 7));
      var subCols = Math.max(24, Math.floor((leftW - 40) / 5.6));
      ctx.save();
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = m.campaign ? '#ffe07a' : MFD_INK;
      ctx.fillText((m.campaign ? '★ ' : '') + clipText(m.text, headCols), pad + 14, y);
      ctx.font = '10px ui-monospace, monospace';
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
            })(m.id), { font: 9 });
      }
      y += 46;

      if (openC && m.desc) {
        var dlines = wrapText(m.desc, Math.max(20, Math.floor((leftW - 44) / 5.9)));
        ctx.save();
        ctx.fillStyle = 'rgba(8,20,28,0.9)';
        ctx.fillRect(pad + 14, y - 12, leftW - 30, dlines.length * 13 + 12);
        ctx.strokeStyle = 'rgba(74,151,176,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(pad + 14.5, y - 11.5, leftW - 31, dlines.length * 13 + 11);
        ctx.font = '10px ui-monospace, monospace';
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
    ctx.font = 'bold 11px ui-monospace, monospace';
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
      ctx.font = '11px ui-monospace, monospace';
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
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(docked ? 'MISSION BOARD — ' + clipText(docked.name, 26) : 'MISSION BOARD',
                 rx + 10, top + pad + 18);
    ctx.restore();

    if (!docked) {
      ctx.save();
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('NOT DOCKED', rx + 16, top + pad + 48);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('every port keeps a board; T docks with a locked station.', rx + 16, top + pad + 66);
      ctx.restore();
      return;
    }

    var offers = Missions.boardAt(docked, G.sys, G.galaxy, G.here, G.t)
      .concat(Arcs ? Arcs.campaignBoardAt(G, docked, G.sys, G.galaxy, G.here, G.t) : [])
      .filter(function (o) { return !Missions.alreadyHave(G, o.id); })
      .sort(function (a, b) { return (b.campaign ? 1 : 0) - (a.campaign ? 1 : 0); });
    if (!offers.length) {
      ctx.save();
      ctx.font = '12px ui-monospace, monospace';
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
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillStyle = '#8a7a3a';
        ctx.fillText('★ FACTION CAMPAIGN', rx + 16, oy);
        ctx.restore();
        oy += 16;
      } else if (!off.campaign && !sawContractBoardHdr && sawCampaignBoardHdr) {
        sawContractBoardHdr = true;
        ctx.save();
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillStyle = '#5d8fa4';
        ctx.fillText('CONTRACTS', rx + 16, oy);
        ctx.restore();
        oy += 16;
      }
      ctx.save();
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = off.campaign ? '#ffe07a'
                    : off.type === 'courier' ? '#b4f0ff'
                    : off.type === 'disposal' ? '#ffb86b' : MFD_INK;
      ctx.fillText((off.campaign ? '★ ' : '') +
                   clipText(off.text, Math.floor((rw - 130) / 7)), rx + 16, oy + 14);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText(clipText('pays ' + fmtCredits(off.pay) + '   ·   due ' +
                            fmtTime(off.deadline - G.t) + '   ·   ' + off.tonnes + 't of hold',
                            Math.floor((rw - 130) / 5.6)), rx + 16, oy + 28);
      ctx.restore();
      btn(ctx, rx + rw - 96, oy + 6, 80, 28, 'ACCEPT',
          (function (offer) {
            return function () {
              var res = Missions.accept(G, offer, hooksFor());
              if (!res.ok) say('Cannot sign: ' + res.why, 4);
            };
          })(off), { bold: true, font: 10 });

      /* The long form, behind a button. The board stays scannable and the
       * detail is one click away for the job you are actually considering
       * — which is the whole reason `text` is allowed to stay terse. */
      var openHere = G.missionDesc === off.id;
      if (off.desc) {
        btn(ctx, rx + rw - 178, oy + 6, 76, 28, openHere ? 'HIDE' : 'DETAILS',
            (function (id) {
              return function () { G.missionDesc = (G.missionDesc === id) ? null : id; };
            })(off.id), { font: 9 });
      }
      oy += 48;

      if (openHere && off.desc) {
        var lines = wrapText(off.desc, Math.floor((rw - 44) / 5.9));
        ctx.save();
        ctx.fillStyle = 'rgba(8,20,28,0.9)';
        ctx.fillRect(rx + 16, oy - 6, rw - 32, lines.length * 13 + 12);
        ctx.strokeStyle = 'rgba(74,151,176,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 16.5, oy - 5.5, rw - 33, lines.length * 13 + 11);
        ctx.font = '10px ui-monospace, monospace';
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
      ctx.font = '15px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('NO COURSE LAID IN', px + 30, py + 50);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(160,185,220,0.7)';
      ctx.fillText('Open the chart, pick a star, press Enter. Then come back here.',
                   px + 30, py + 76);
      ctx.restore();
      btn(ctx, px + 30, py + 100, 200, 34, 'OPEN THE CHART  (F6)',
          function () { selectPanel(5); }, { bold: true });
      return;
    }

    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('DESTINATION', px + 30, py + 34);
    ctx.font = '26px ui-monospace, monospace';
    ctx.fillStyle = course.to.color;
    ctx.fillText(course.to.name, px + 30, py + 68);
    ctx.font = '12px ui-monospace, monospace';
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
      ctx.font = '12px ui-monospace, monospace';
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
      }, { bold: true, font: 12 });
      ctx.save();
      ctx.font = '10px ui-monospace, monospace';
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
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.fillStyle = modes[i].on ? '#ffffff' : '#78a6b8';
      ctx.fillText(modes[i].title, mx + 16, my + 28);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = modes[i].on ? '#7fd6c0' : '#4f7d90';
      ctx.fillText(modes[i].sub, mx + 16, my + 46);
      ctx.font = '11px ui-monospace, monospace';
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
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = MFD_DIM;
    ctx.fillText('SENSITIVITY', px + 30, sy);
    ctx.font = '15px ui-monospace, monospace';
    ctx.fillStyle = MFD_INK;
    ctx.fillText(G.aimSens.toFixed(2) + '×', px + 150, sy + 2);
    ctx.restore();
    btn(ctx, px + 220, sy - 16, 34, 24, '−',
        function () { G.aimSens = Math.max(0.25, G.aimSens - 0.25); }, { font: 13 });
    btn(ctx, px + 260, sy - 16, 34, 24, '+',
        function () { G.aimSens = Math.min(3, G.aimSens + 0.25); }, { font: 13 });

    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
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
    var nameChars = Math.max(6, Math.floor((cTon - cName - 34) / 8.4));

    var hy = top + pad + 46;
    ctx.save();
    ctx.font = '10px ui-monospace, monospace';
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
      ctx.font = '13px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      ctx.fillText('HOLD EMPTY', pad + 16, y + 20);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(s.cargoCap + ' tonnes available.', pad + 16, y + 40);
      ctx.restore();
    }
    for (var i = 0; i < held.length; i++) {
      if (y + rowH > top + pad + colH - 10) {
        ctx.save();
        ctx.font = '10px ui-monospace, monospace';
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
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = it.cid === 'waste' ? '#ffb86b' : MFD_INK;
      ctx.fillText(clipText(it.name, nameChars), cName, y + 15);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = ink;
      ctx.fillText(status, cStat, y + 15);
      ctx.textAlign = 'right';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = MFD_INK;
      ctx.fillText(it.tonnes.toFixed(it.tonnes < 1 ? 2 : 0) + ' t', cTon, y + 15);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(worth !== null ? fmtCredits(worth) : '—', cVal, y + 15);
      if (where) {
        ctx.font = '9px ui-monospace, monospace';
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
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = MFD_DIM;
      /* Clipped to the panel it is drawn in, in characters, because this
       * panel is whatever the window leaves it and the sentence is not. */
      ctx.fillText(clipText('No contracts signed. Everything aboard is yours.',
                            Math.max(8, Math.floor((rw - 32) / 6.1))),
                   rx + 16, cy2 + 6);
      ctx.restore();
    }
    for (var c = 0; c < list.length; c++) {
      if (cy2 + 34 > top + pad + conH - 8) break;
      var m = list[c];
      var left = m.deadline - G.t;
      var late = left <= 0;
      ctx.save();
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = late ? '#ff8a76' : MFD_INK;
      ctx.fillText(clipText((m.tonnes || 0) + ' t ' + (m.cid || '—'), 26),
                   rx + 16, cy2 + 6);
      ctx.font = '10px ui-monospace, monospace';
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
    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    for (var L = 0; L < lines.length; L++) {
      var ly = sy2 + 46 + L * 18;
      if (ly > sy2 + sh - 8) break;
      var warn = lines[L][0] === 'Contraband aboard';
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
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillStyle = '#b4f0ff';
    ctx.fillText(title, x + 10, y + 18);
    ctx.restore();
  }

  /* --- Shift+F2: manoeuvre nodes ------------------------------------------ */
  function drawNodeScreen(ctx, w, bottom) {
    var top = modeFrame(ctx, w, bottom, 'MANOEUVRE PLANNING',
                        'I place   ·   ± adjust   ·   \\ execute');
    var pad = 14;
    var colW = (w - pad * 3) / 2;
    var h = Math.min(tileHeight(colW), bottom - top - pad * 2);
    tile(ctx, pad, top + pad, colW, h, drawNodePage);
    tile(ctx, pad * 2 + colW, top + pad, colW, h, drawOrbitPage);

    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
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
      var fac = (G.galaxy && G.galaxy.factionById) ? G.galaxy.factionById[star.factionId] : null;
      var opts = fac ? { faction: fac, allFactions: G.galaxy.factions } : undefined;
      G.systemCache[star.id] = Gen.generateSystem(star.seed, opts);
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
      ctx.font = '11px ui-monospace, monospace';
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
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText('SLIPSPACE CHART', px + 24, py + 30);
    ctx.font = '11px ui-monospace, monospace';
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
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillStyle = plan.possible ? '#7dffb0' : '#ff7a7a';
        ctx.fillText(s.name, sp.x + r + 10, y + 3);
      } else if (isHere) {
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillStyle = '#ffe6a8';
        ctx.fillText(s.name, sp.x + r + 10, y + 3);
      }
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
      ctx.font = '15px ui-monospace, monospace';
      ctx.fillStyle = plan.to.color;
      ctx.fillText(plan.to.name, dx, dyy);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = '#7e93b3';
      ctx.fillText('class ' + plan.to.cls + '   ·   ' + plan.to.temp + ' K   ·   ' +
                   plan.to.luminosity.toFixed(2) + ' L☉', dx, dyy + 18);
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
      ctx.font = '11px ui-monospace, monospace';
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
      ctx.font = '11px ui-monospace, monospace';
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
        rows(ctx, dx, sy + 20, infoRows, '#7e93b3', '#cfe0ff', dw);

        /* A fact about the SYSTEM as a whole, not any one world in it — see
         * Gen.systemNote. Keyed off what actually got generated here (how
         * many worlds, how many are giants, how many are habitable, how
         * much port infrastructure exists), not the violence/corruption
         * axis the rows above already cover. */
        if (known.systemNote) {
          var noteY = sy + 20 + infoRows.length * 15 + 14;
          ctx.save();
          ctx.font = '10px ui-monospace, monospace';
          ctx.fillStyle = 'rgba(200,220,245,0.7)';
          var noteCols = Math.max(20, Math.floor(dw / 5.9));
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
        ctx.font = '10px ui-monospace, monospace';
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
          ctx.font = '10px ui-monospace, monospace';
          ctx.fillStyle = 'rgba(200,220,245,0.7)';
          var sysCols = Math.max(20, Math.floor(dw / 5.9));
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
          scanRows.push([(idx + 1) + '. ' + b.typeName,
            (b.composition || '—') + (b.habitable ? '  ·  in the HZ' : '')]);
        });
        rows(ctx, dx, noteBaseY, scanRows, '#7e93b3', '#cfe0ff', dw);

        /* A travel-guide's idea of anywhere worth living — see
         * Gen.buildFlavor. Capped at two worlds so a system with several
         * habitable candidates cannot run this panel off the bottom of
         * the screen. */
        var habitables = pPlanets.filter(function (b) { return b.habitable; }).slice(0, 2);
        var fy = noteBaseY + scanRows.length * 15 + 16;
        var cols = Math.max(20, Math.floor(dw / 5.9));
        ctx.save();
        ctx.font = '10px ui-monospace, monospace';
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
    ctx.font = '10px ui-monospace, monospace';
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
    btn: btn,
    tile: tile,
    tileHeight: tileHeight,
    modeFrame: modeFrame,
    modeHead: modeHead,
    /* Text entry. main.js has to consult `editing`/`editKey` before its own
     * function-key and number-row handling — see the note by beginEdit. */
    editing: editing, editKey: editKey, editState: editState,
    cancelEdit: cancelEdit, beginEdit: beginEdit,
    /* main.js routes the wheel here before the camera zoom sees it. */
    wheelAt: wheelAt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Screens;
})(typeof window !== 'undefined' ? window : globalThis);
