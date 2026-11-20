/* recap.js - "Last time on..." (2026-11-18).
 *
 * Astra liked the idea of a recap when a career is picked back up: Manifest
 * runs a lot of threads at once (contracts with deadlines, hands outside or
 * adrift, debts between captains, bounties), and coming back to a save a
 * week later means rediscovering all of them one screen at a time.
 *
 * Everything on the card is READ off state the game already keeps, through
 * the same functions the other screens use (Missions.reach, Outside.statusOf,
 * Journal.debts/entries), so the card cannot say something those screens
 * would contradict. It writes nothing. A section with nothing true to say is
 * left out rather than filled with "none".
 *
 * Pure: build(G) returns plain data, and main.js draws it. */
(function (global) {
  'use strict';

  var MAX_CONTRACTS = 5;
  var MAX_JOURNAL = 5;
  var MAX_DEBTS = 3;
  var DUE_SOON = 86400;          // under a day is amber, as on the contracts screen

  var C = {
    ink: '#d8ecf6', dim: '#8fa8b8', hot: '#ffb86b', bad: '#ff8a7a',
    good: '#7fe0a0', place: '#7fd6c0', far: '#9fd0e0', gold: '#ffe07a'
  };

  function fmtCr(n) {
    return Math.round(n || 0).toLocaleString('en-US') + ' cr';
  }

  /* "3 h ago", "2 days ago": how long ago in game time, which is what a
   * pilot coming back actually wants, rather than a raw epoch stamp. */
  function ago(dt) {
    dt = Math.max(0, dt || 0);
    if (dt < 120) return 'just now';
    if (dt < 3600) return Math.round(dt / 60) + ' min ago';
    if (dt < 48 * 3600) return Math.round(dt / 3600) + ' h ago';
    return Math.round(dt / 86400) + ' days ago';
  }
  function dueIn(dt) {
    if (dt <= 0) return 'OVERDUE';
    if (dt < 3600) return 'due in ' + Math.max(1, Math.round(dt / 60)) + ' min';
    if (dt < 48 * 3600) return 'due in ' + Math.round(dt / 3600) + ' h';
    return 'due in ' + Math.round(dt / 86400) + ' days';
  }

  function whereLine(G) {
    var s = G.ship || {}, sys = G.sys, star = (G.here && G.here.name) || '';
    var byId = (sys && sys.byId) || {};
    var place = null;
    if (s.docked && byId[s.docked]) place = 'Docked at ' + byId[s.docked].name;
    else if (s.landed && byId[s.landed]) place = 'Down at ' + byId[s.landed].name;
    else {
      var dom = null;
      try { dom = global.Sim && sys ? global.Sim.dominantBody(s.pos, sys, G.t) : null; } catch (e) { dom = null; }
      place = dom ? 'In flight near ' + dom.name : 'In flight';
    }
    return place + (star ? ', ' + star + ' system' : '');
  }

  function shipLine(G) {
    var s = G.ship || {};
    var Combat = global.Combat;
    var hull = (Combat && Combat.HULLS && s.hullId && Combat.HULLS[s.hullId])
      ? (Combat.HULLS[s.hullId].name || s.hullId) : (s.hullId || 'your ship');
    return hull + (s.name ? ' "' + s.name + '"' : '') + '   ·   ' + fmtCr(s.credits);
  }

  function contracts(G) {
    var list = (G.missions || []).slice();
    if (!list.length) return null;
    list.sort(function (a, b) {
      return (b.campaign ? 1 : 0) - (a.campaign ? 1 : 0) || (a.deadline - b.deadline);
    });
    var rows = [];
    for (var i = 0; i < list.length && i < MAX_CONTRACTS; i++) {
      var m = list[i], left = (m.deadline || 0) - G.t;
      rows.push({ text: (m.campaign ? '★ ' : '') + (m.text || m.toName || 'a contract'),
                  color: m.campaign ? C.gold : C.ink });
      var r = global.Missions && global.Missions.reach ? global.Missions.reach(G, m) : null;
      rows.push({ text: '   ' + dueIn(left) + (r ? '   ·   ' + r.text : ''),
                  color: left <= 0 ? C.bad : left < DUE_SOON ? C.hot : C.far });
    }
    if (list.length > MAX_CONTRACTS) {
      rows.push({ text: '   ...and ' + (list.length - MAX_CONTRACTS) + ' more on the contracts screen', color: C.dim });
    }
    return { head: 'OPEN CONTRACTS', rows: rows };
  }

  /* Hands not aboard: the ones a pilot most needs reminding of. Their air
   * stopped when the game was saved and starts again the moment it runs,
   * so the first thing she sees should be that clock. */
  function people(G) {
    var Outside = global.Outside, rows = [];
    var crew = (global.Crew && global.Crew.aboard) ? global.Crew.aboard(G.ship)
                                                   : ((G.ship && G.ship.crew) || []);
    for (var i = 0; i < crew.length; i++) {
      var p = crew[i];
      var st = Outside && Outside.statusOf ? Outside.statusOf(G, p) : (p && p.out ? 'not aboard' : null);
      if (st) rows.push({ text: (p.name || 'A hand') + ' is ' + st, color: /adrift/.test(st) ? C.bad : C.hot });
    }
    return rows.length ? { head: 'YOUR PEOPLE', rows: rows } : null;
  }

  function law(G) {
    var w = G.wanted || {}, facs = (G.galaxy && G.galaxy.factionById) || {}, rows = [];
    for (var k in w) {
      if (!Object.prototype.hasOwnProperty.call(w, k) || !(w[k] > 0)) continue;
      rows.push({ text: 'Wanted by ' + ((facs[k] && facs[k].name) || k) + ': ' + fmtCr(w[k]),
                  color: C.bad, n: w[k] });
    }
    rows.sort(function (a, b) { return b.n - a.n; });
    /* Fines being worked off (combat.js workOff): owed, not wanted. */
    var wo = G.workoff || {};
    for (var f in wo) {
      if (!Object.prototype.hasOwnProperty.call(wo, f) || !(wo[f] > 0)) continue;
      rows.push({ text: 'Working off ' + fmtCr(wo[f]) + ' owed to ' + ((facs[f] && facs[f].name) || f) +
                        ': their contracts pay half', color: C.hot, n: 0 });
    }
    return rows.length ? { head: 'THE LAW', rows: rows } : null;
  }

  function debts(G) {
    var J = global.Journal;
    if (!J || !J.debts) return null;
    var d = J.debts(G);
    if (!d.length) return null;
    var rows = [];
    for (var i = 0; i < d.length && i < MAX_DEBTS; i++) {
      rows.push({ text: J.debtLine(d[i]), color: d[i].debt > 0 ? C.good : C.hot });
    }
    if (d.length > MAX_DEBTS) rows.push({ text: '...and ' + (d.length - MAX_DEBTS) + ' more in your notes', color: C.dim });
    return { head: 'FAVOURS', rows: rows };
  }

  function lately(G) {
    var J = global.Journal;
    if (!J || !J.entries) return null;
    var e = J.entries(G), rows = [];
    for (var i = 0; i < e.length && i < MAX_JOURNAL; i++) {
      rows.push({ text: ago(G.t - e[i].t) + (e[i].at ? ', ' + e[i].at : '') + ': ' + e[i].text +
                        (e[i].n > 1 ? ' (x' + e[i].n + ')' : ''),
                  color: C.dim });
    }
    return rows.length ? { head: 'LATELY', rows: rows } : null;
  }

  function build(G) {
    if (!G || !G.ship) return null;
    var sections = [contracts(G), people(G), law(G), debts(G), lately(G)].filter(Boolean);
    return {
      title: 'LAST TIME ON...',
      where: whereLine(G),
      ship: shipLine(G),
      sections: sections,
      /* A career with nothing on any list yet is a fresh one: no card. */
      empty: sections.length === 0
    };
  }

  var Recap = { build: build, ago: ago, dueIn: dueIn };
  global.Recap = Recap;
  if (typeof module !== 'undefined' && module.exports) module.exports = Recap;
})(typeof window !== 'undefined' ? window : globalThis);
