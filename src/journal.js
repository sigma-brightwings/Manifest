/* Manifest — the captain's notes (F5, the NOTES tab).
 *
 * Astra, 2026-10-30: "add a Notes section to the F5 menu, under a new tab"
 * — both a notepad you type in and a log the game keeps, saved with the
 * game and exportable to a file.
 *
 * Three things, and only two of them are stored here:
 *
 *   G.notes    what the player types. Kept exactly as typed.
 *   G.journal  what the game writes down for her: the things a captain
 *              would want to look back on — who she pulled off a dead
 *              tank, who she robbed and of what, what she was charged
 *              with and what it cost to clear, what was paid and by whom.
 *              Oldest first, capped at MAX, saved.
 *   debts      who owes whom. NOT stored here: it is read straight off the
 *              captains' memories (captains.js / favours.js `debt`), so the
 *              page can never disagree with what a captain will say to
 *              your face.
 *
 * The notepad's editing is here too, as pure functions of {text, caret},
 * so it can be tested without a screen: screens.js draws it and routes
 * keys to it. */
(function (global) {
  'use strict';

  var MAX = 300;            // log entries kept; the oldest go first
  var NOTES_MAX = 20000;    // characters in the notepad
  var REPEAT_S = 60;        // the same line twice inside a minute is one line, counted

  /* What each kind of entry is, for the colour on the page and the filter
   * row. `group` is the filter; four groups is as many as fit on a row. */
  var KINDS = {
    rescue:  { label: 'RESCUE',  group: 'people', color: '#7fe0a0' },
    favour:  { label: 'FAVOUR',  group: 'people', color: '#9fd8ff' },
    crew:    { label: 'CREW',    group: 'people', color: '#9fd8ff' },
    robbery: { label: 'ROBBERY', group: 'crime',  color: '#ffb86b' },
    robbed:  { label: 'ROBBED',  group: 'crime',  color: '#ff8a7a' },
    crime:   { label: 'CHARGED', group: 'crime',  color: '#ff8a7a' },
    law:     { label: 'LAW',     group: 'crime',  color: '#ffd36b' },
    kill:    { label: 'KILL',    group: 'crime',  color: '#ff8a7a' },
    trade:   { label: 'TRADE',   group: 'trade',  color: '#b4f0ff' },
    mission: { label: 'CONTRACT', group: 'trade', color: '#d8c8ff' },
    tithe:   { label: 'TITHE',   group: 'trade',  color: '#ffd36b' },
    travel:  { label: 'ARRIVED', group: 'travel', color: '#8fa8b8' },
    /* What a focus start set you up for (start.js), the first line of a
     * career that chose one. */
    start:   { label: 'CAREER',  group: 'travel', color: '#ffe6a8' }
  };
  var GROUPS = [
    { id: 'all',    label: 'ALL' },
    { id: 'people', label: 'PEOPLE' },
    { id: 'crime',  label: 'CRIME' },
    { id: 'trade',  label: 'TRADE' },
    { id: 'travel', label: 'TRAVEL' }
  ];

  function kindOf(k) { return KINDS[k] || { label: String(k || 'NOTE').toUpperCase(), group: 'all', color: '#b4f0ff' }; }

  /* Where you were when it happened — the star you are in, which is what a
   * captain writes at the top of a page. */
  function placeName(G) {
    if (!G) return '';
    if (G.here && G.here.name) return G.here.name;
    var s = G.sys;
    if (s && s.name) return s.name;
    if (s && s.star && s.star.name) return s.star.name;
    return '';
  }

  /* The game clock as the HUD writes it (main.js fmtEpoch). */
  function fmtEpoch(t) {
    t = Math.max(0, +t || 0);
    var yr = Math.floor(t / 3.1557e7);
    var rem = t - yr * 3.1557e7;
    var d = Math.floor(rem / 86400);
    rem -= d * 86400;
    var h = Math.floor(rem / 3600);
    var m = Math.floor((rem - h * 3600) / 60);
    return 'Y' + yr + ' D' + d + ' ' + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function add(G, kind, text, opts) {
    if (!G || !text) return null;
    text = String(text).replace(/\s+/g, ' ').trim();
    if (!text) return null;
    var t = (opts && opts.t != null) ? opts.t : (G.t || 0);
    if (!Array.isArray(G.journal)) G.journal = [];
    var j = G.journal, last = j[j.length - 1];
    if (last && last.kind === kind && last.text === text && t - last.t < REPEAT_S) {
      last.n = (last.n || 1) + 1;
      last.t = t;
      return last;
    }
    var e = { t: t, kind: kind, text: text, at: (opts && opts.at) || placeName(G) };
    j.push(e);
    if (j.length > MAX) j.splice(0, j.length - MAX);
    return e;
  }

  /* Newest first, optionally one group. */
  function entries(G, group) {
    var j = (G && Array.isArray(G.journal)) ? G.journal : [];
    var out = [];
    for (var i = j.length - 1; i >= 0; i--) {
      if (!group || group === 'all' || kindOf(j[i].kind).group === group) out.push(j[i]);
    }
    return out;
  }

  /* WHO OWES WHOM, off the captains' own memories. + they owe you, - you
   * owe them (favours.js). A memory saved before names were kept on it
   * falls back to its key, which is at least the ship. */
  function nameFromKey(key) {
    var k = String(key || '');
    var bar = Math.max(k.lastIndexOf('|'), k.lastIndexOf('/'));
    return bar >= 0 ? k.slice(bar + 1) : k;
  }
  function debts(G) {
    var caps = (G && G.captains) || {}, out = [];
    for (var key in caps) {
      if (!Object.prototype.hasOwnProperty.call(caps, key)) continue;
      var m = caps[key];
      if (!m || !(m.debt | 0)) continue;
      out.push({ key: key, who: m.who || nameFromKey(key), debt: m.debt | 0,
                 why: m.debtWhy || null, at: m.debtAt != null ? m.debtAt : null });
    }
    out.sort(function (a, b) { return b.debt - a.debt || String(a.who).localeCompare(String(b.who)); });
    return out;
  }
  function debtLine(d) {
    var n = Math.abs(d.debt), fav = n === 1 ? 'a favour' : n + ' favours';
    return d.debt > 0 ? d.who + ' owes you ' + fav : 'You owe ' + d.who + ' ' + fav;
  }

  function setNotes(G, text) {
    G.notes = String(text == null ? '' : text).slice(0, NOTES_MAX);
    return G.notes;
  }

  /* ---- export -------------------------------------------------------------
   * Plain text, CRLF because the people who will open it are on Windows and
   * Notepad is what opens a .txt. */
  function exportText(G) {
    var s = (G && G.ship) || {};
    var L = [];
    L.push('MANIFEST — CAPTAIN\'S NOTES');
    L.push((s.shipName ? s.shipName + (s.reg ? ' (' + s.reg + ')' : '') + '  ·  ' : '') +
           fmtEpoch(G && G.t) + (placeName(G) ? '  ·  ' + placeName(G) : ''));
    L.push('');
    L.push('== NOTES ==');
    var notes = String((G && G.notes) || '').replace(/\r\n?/g, '\n');
    if (notes.trim()) L.push.apply(L, notes.split('\n'));
    else L.push('(nothing written)');
    L.push('');
    L.push('== WHO OWES WHOM ==');
    var ds = debts(G);
    if (!ds.length) L.push('(nobody, either way)');
    for (var i = 0; i < ds.length; i++) L.push(debtLine(ds[i]) + (ds[i].why ? ' — ' + ds[i].why : ''));
    L.push('');
    L.push('== SHIP\'S LOG (newest first) ==');
    var es = entries(G);
    if (!es.length) L.push('(empty)');
    for (var k = 0; k < es.length; k++) {
      var e = es[k];
      L.push(fmtEpoch(e.t) + '  ' + (e.at ? e.at + '  ' : '') + '[' + kindOf(e.kind).label + '] ' +
             e.text + (e.n > 1 ? ' (x' + e.n + ')' : ''));
    }
    L.push('');
    return L.join('\r\n');
  }

  function fileName(G) {
    var s = (G && G.ship) || {};
    var who = String(s.shipName || 'captain').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'captain';
    var stamp = fmtEpoch(G && G.t).replace(/[^A-Za-z0-9]+/g, '-');
    return 'manifest-notes-' + who + '-' + stamp + '.txt';
  }

  /* The game runs in Electron with no preload and no Node in the page, so
   * the one way out is the browser's own download: a Blob behind a link
   * with a `download` name. Electron puts up its save dialog. */
  function download(G) {
    var doc = global.document;
    if (!doc || typeof global.Blob === 'undefined' || !global.URL || !global.URL.createObjectURL) return false;
    try {
      var blob = new global.Blob([exportText(G)], { type: 'text/plain;charset=utf-8' });
      var url = global.URL.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url;
      a.download = fileName(G);
      a.style.display = 'none';
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      setTimeout(function () { try { global.URL.revokeObjectURL(url); } catch (e) {} }, 4000);
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ---- the notepad ---------------------------------------------------------
   * Wrap: visual lines as [start, end) ranges into the text, breaking on
   * newlines and, inside a line, at the last space that fits (or hard, for a
   * word longer than the line). `end` excludes the newline and any space the
   * wrap broke at; a caret sitting exactly at a wrap point belongs to the
   * NEXT line, the way every editor draws it. */
  function wrap(text, cols) {
    text = String(text || '');
    cols = Math.max(4, cols | 0);
    var out = [], i = 0, n = text.length;
    while (true) {
      var nl = text.indexOf('\n', i);
      var lineEnd = nl < 0 ? n : nl;
      var s = i;
      if (s === lineEnd) out.push({ start: s, end: s, next: s });
      while (s < lineEnd) {
        if (lineEnd - s <= cols) { out.push({ start: s, end: lineEnd, next: lineEnd }); s = lineEnd; break; }
        var cut = text.lastIndexOf(' ', s + cols);
        if (cut <= s) { out.push({ start: s, end: s + cols, next: s + cols }); s += cols; }
        else { out.push({ start: s, end: cut, next: cut + 1 }); s = cut + 1; }
      }
      if (nl < 0) break;
      i = nl + 1;
      if (i === n) { out.push({ start: n, end: n, next: n }); break; }
    }
    if (!out.length) out.push({ start: 0, end: 0, next: 0 });
    return out;
  }

  /* Which visual line the caret is on, and its column. */
  function caretLine(lines, caret) {
    for (var i = lines.length - 1; i >= 0; i--) {
      if (caret >= lines[i].start) return { line: i, col: Math.min(caret, lines[i].end) - lines[i].start };
    }
    return { line: 0, col: 0 };
  }

  /* The caret for a click at visual (line, col). */
  function caretAt(lines, line, col) {
    line = Math.max(0, Math.min(lines.length - 1, line | 0));
    var L = lines[line];
    return L.start + Math.max(0, Math.min(L.end - L.start, col | 0));
  }

  function wordLeft(text, c) {
    while (c > 0 && /\s/.test(text[c - 1])) c--;
    while (c > 0 && !/\s/.test(text[c - 1])) c--;
    return c;
  }
  function wordRight(text, c) {
    var n = text.length;
    while (c < n && !/\s/.test(text[c])) c++;
    while (c < n && /\s/.test(text[c])) c++;
    return c;
  }

  function insert(st, s) {
    s = String(s || '').replace(/\r\n?/g, '\n').replace(/\t/g, '  ');
    var room = (st.max || NOTES_MAX) - st.text.length;
    if (room <= 0 || !s) return false;
    s = s.slice(0, room);
    st.text = st.text.slice(0, st.caret) + s + st.text.slice(st.caret);
    st.caret += s.length;
    return true;
  }

  /* One key. `st` = { text, caret, cols, max }, changed in place. Returns
   * 'done' for Escape (stop writing — nothing is thrown away, the notepad
   * is live), 'paste' for Ctrl/Cmd+V (the caller reads the clipboard, which
   * is asynchronous, and calls insert), and true for everything else: like
   * the single-line field, a notepad with focus takes the whole keyboard. */
  function noteKey(st, e) {
    var r = keyInto(st, e);
    if (r === 'vertical') return true;
    st.goalCol = null;       // any other key ends a run of up/down
    return r;
  }
  function keyInto(st, e) {
    var k = e.key, ctrl = !!(e.ctrlKey || e.metaKey);
    var text = st.text, c = Math.max(0, Math.min(text.length, st.caret | 0));
    st.caret = c;
    if (k === 'Escape') return 'done';
    if (ctrl && (k === 'v' || k === 'V')) return 'paste';
    if (k === 'Enter') { insert(st, '\n'); return true; }
    if (k === 'Backspace') {
      if (c > 0) {
        var from = ctrl ? wordLeft(text, c) : c - 1;
        st.text = text.slice(0, from) + text.slice(c);
        st.caret = from;
      }
      return true;
    }
    if (k === 'Delete') {
      if (c < text.length) {
        var to = ctrl ? wordRight(text, c) : c + 1;
        st.text = text.slice(0, c) + text.slice(to);
      }
      return true;
    }
    if (k === 'ArrowLeft') { st.caret = ctrl ? wordLeft(text, c) : Math.max(0, c - 1); return true; }
    if (k === 'ArrowRight') { st.caret = ctrl ? wordRight(text, c) : Math.min(text.length, c + 1); return true; }
    var lines, at;
    if (k === 'Home' || k === 'End') {
      if (ctrl) { st.caret = k === 'Home' ? 0 : text.length; return true; }
      lines = wrap(text, st.cols || 60); at = caretLine(lines, c);
      st.caret = k === 'Home' ? lines[at.line].start : lines[at.line].end;
      return true;
    }
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'PageUp' || k === 'PageDown') {
      lines = wrap(text, st.cols || 60); at = caretLine(lines, c);
      var step = (k === 'PageUp' || k === 'PageDown') ? Math.max(1, (st.rows || 10) - 1) : 1;
      var dir = (k === 'ArrowUp' || k === 'PageUp') ? -1 : 1;
      var want = st.goalCol != null ? st.goalCol : at.col;
      var target = at.line + dir * step;
      if (target < 0) st.caret = 0;
      else if (target >= lines.length) st.caret = text.length;
      else st.caret = caretAt(lines, target, want);
      st.goalCol = want;
      return 'vertical';
    }
    if (k.length === 1 && !ctrl) { insert(st, k); return true; }
    return true;
  }

  var Journal = {
    MAX: MAX, NOTES_MAX: NOTES_MAX, KINDS: KINDS, GROUPS: GROUPS,
    kindOf: kindOf, placeName: placeName, fmtEpoch: fmtEpoch,
    add: add, entries: entries, debts: debts, debtLine: debtLine,
    setNotes: setNotes, exportText: exportText, fileName: fileName, download: download,
    wrap: wrap, caretLine: caretLine, caretAt: caretAt, insert: insert, noteKey: noteKey
  };

  global.Journal = Journal;
  if (typeof module !== 'undefined' && module.exports) module.exports = Journal;
})(typeof window !== 'undefined' ? window : this);
