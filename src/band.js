/* band.js - the open band: what is happening in this system, to somebody
 * else, right now (2026-11-11).
 *
 * Astra: "We're gonna need NPC ships to both trade with each other and
 * fight one another, something that the player can come across in the
 * local system chatter and attempt to render aid or even pirate their
 * ship."
 *
 * THE THING THAT WAS MISSING WAS REACH, not events. aggression.js has run
 * NPC-on-NPC violence since October - pirates pick prey off the traffic
 * timetable and run freighters down, Syndicate runners open fire without
 * a word, customs cutters chase smugglers, rival empires shoot at each
 * other - and the player's side of it is wired too: standing for driving
 * a pirate off, for helping make a kill, for helping an arrest, and a
 * penalty for interfering with one.
 *
 * But every line of it narrates through a `near()` check, so a robbery
 * forty million kilometres away is completely silent. The only thing that
 * ever told you it had happened was raidNews, on the dock, afterwards, as
 * gossip. You could not come across an event because you were never told
 * there was one.
 *
 * SO: AN EMERGENCY BAND. Not the comms list - that is ships inside the
 * transmitter's 0.75 AU, and this is a different kind of thing. A ship in
 * trouble broadcasts wide and everybody hears it, which is the entire
 * point of an emergency band and is true of every one that has ever
 * existed.
 *
 * WHAT IT COSTS, so it is not a free map of the system:
 *
 *   - IT TELLS YOU WHERE SHE WAS, not where she is. The position is the
 *     one in the last broadcast, and the broadcasts are a minute apart.
 *     A running fight has moved by the time you get there, which is why
 *     the row says how old it is.
 *   - IT GOES QUIET. Thirty minutes without a rebroadcast and the entry
 *     drops off the band: either it is over or nobody is left to send.
 *   - IT DOES NOT TELL YOU WHO IS WINNING. "Under fire" is what a
 *     distress call says. What you find when you get there is what you
 *     find.
 *
 * A row on this band is a nav target like any other (main.js's field
 * contacts do the same thing), so hearing it and flying at it are one
 * action.
 */
(function (global) {
  'use strict';

  var V = global.V;

  var LIFE = 30 * 60;              // sim seconds on the band without a rebroadcast
  var REBROADCAST = 60;            // how often a live incident refreshes its position
  var ANSWER_KM = 12000;           // close enough to have answered it
  var MAX = 24;                    // the band is a band, not a database

  /* What the band carries, and what each reads as. `help` marks the ones
   * that are somebody asking rather than somebody reporting. */
  var KINDS = {
    robbery:  { label: 'UNDER ATTACK', help: true,  color: '#ff6b6b' },
    runner:   { label: 'UNDER FIRE',   help: true,  color: '#ff6b6b' },
    pursuit:  { label: 'PURSUIT',      help: false, color: '#ffd36b' },
    duel:     { label: 'SHOTS FIRED',  help: false, color: '#ff9f7a' },
    trade:    { label: 'RENDEZVOUS',   help: false, color: '#7dffb0' },
    mayday:   { label: 'MAYDAY',       help: true,  color: '#ff4d4d' }
  };

  function list(G) { return (G && G.band) || []; }
  function kindOf(k) { return KINDS[k] || { label: 'TRAFFIC', help: false, color: '#b4f0ff' }; }

  function starOf(G) { return (G && G.here && G.here.id) || 'sys'; }

  /* ---- writing to it ------------------------------------------------------
   * aggression.js calls this at the moment an event starts. It takes the
   * ships rather than ids so that a caller cannot get the position wrong;
   * everything stored is a primitive or a copied vector. */

  function open(G, sys, t, kind, sp, other) {
    if (!G || !sp || !sp.live || !sp.live.pos) return null;
    var id = 'bd-' + kind + '-' + (sp.id || sp.name || 'x') + '-' + Math.round(t);
    var all = (G.band = list(G));
    for (var i = 0; i < all.length; i++) {
      /* The same ship in the same trouble is the same incident, not a new
       * one - otherwise a fight that lasts a minute fills the band. */
      if (all[i].kind === kind && all[i].who === (sp.id || sp.name)) {
        all[i].t = t; all[i].pos = copy(sp.live.pos);
        return all[i].id;
      }
    }
    all.push({
      id: id, kind: kind, star: starOf(G),
      who: sp.id || sp.name, whoName: sp.name || 'a ship',
      with: other ? (other.id || other.name) : null,
      withName: other ? (other.name || null) : null,
      faction: sp.faction || null,
      t0: t, t: t, pos: copy(sp.live.pos), done: null
    });
    while (all.length > MAX) all.shift();
    return id;
  }

  /* The next broadcast. Called while the incident is still happening; it
   * is what keeps the entry on the band and what moves the mark. */
  function touch(G, t, kind, sp) {
    if (!G || !sp || !sp.live || !sp.live.pos) return;
    var all = list(G), who = sp.id || sp.name;
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (e.kind !== kind || e.who !== who || e.done) continue;
      if (t - e.t < REBROADCAST) return;
      e.t = t; e.pos = copy(sp.live.pos);
      return;
    }
  }

  /* Over, one way or another. The entry stays on the band briefly with
   * what happened on it, because "she got away" is news too. */
  function close(G, t, kind, sp, how) {
    if (!G || !sp) return;
    var all = list(G), who = sp.id || sp.name;
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (e.kind === kind && e.who === who && !e.done) {
        e.done = how || 'over'; e.t = t;
        return;
      }
    }
  }

  function copy(p) { return { x: p.x, y: p.y, z: p.z }; }

  /* ---- reading it --------------------------------------------------------- */

  /* What is on the band here and now. Entries from another system, or
   * that have gone quiet, are dropped as they are read rather than on a
   * timer - the band is only ever looked at when somebody looks at it. */
  function live(G, sys, t) {
    var all = list(G), out = [], keep = [];
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (t - e.t > LIFE) continue;                 // gone quiet
      keep.push(e);
      if (e.star !== starOf(G)) continue;           // heard, but not from here
      out.push(e);
    }
    if (keep.length !== all.length) G.band = keep;
    out.sort(function (a, b) { return b.t - a.t; });
    return out;
  }

  /* One row per incident, in the shape the nav list and the comms screen
   * already draw - the same shape main.js builds for a field contact, so
   * selecting one and flying at it needs no new machinery. */
  function rows(G, sys, t) {
    var out = [], l = live(G, sys, t);
    if (!G.ship || !G.ship.pos || !V) return out;
    for (var i = 0; i < l.length; i++) {
      var e = l[i], k = kindOf(e.kind);
      out.push({
        kind: 'incident', id: e.id, obj: null,
        name: e.whoName,
        type: (e.done ? e.done : k.label) + '  ' + age(t - e.t),
        pos: copy(e.pos), vel: { x: 0, y: 0, z: 0 },
        color: e.done ? '#6a7d92' : k.color,
        range: V.dist(e.pos, G.ship.pos),
        incident: e, help: !e.done && k.help
      });
    }
    out.sort(function (a, b) { return a.range - b.range; });
    return out;
  }

  function age(dt) {
    if (dt < 90) return 'just now';
    if (dt < 3600) return Math.round(dt / 60) + ' min ago';
    return (dt / 3600).toFixed(1) + ' h ago';
  }

  /* The line the cockpit says when something new goes out. Called by
   * aggression.js in place of its own near()-gated say, so that an event
   * out of sight is heard rather than silent. */
  function hail(G, e) {
    var k = kindOf(e.kind);
    var where = (G && G.ship && G.ship.pos && V) ? fmt(V.dist(e.pos, G.ship.pos)) : null;
    if (e.kind === 'trade') {
      return 'Open band: ' + e.whoName + ' and ' + (e.withName || 'another hull') +
             ' are matching orbits' + (where ? ', ' + where + ' out' : '');
    }
    if (k.help) {
      return 'Open band: ' + e.whoName + ' calling for help - ' + k.label.toLowerCase() +
             (where ? ', ' + where + ' out' : '');
    }
    return 'Open band: ' + k.label.toLowerCase() + ' - ' + e.whoName +
           (where ? ', ' + where + ' out' : '');
  }

  function fmt(km) {
    if (km >= 1e6) return (km / 1e6).toFixed(1) + ' Mkm';
    if (km >= 1e3) return Math.round(km / 1e3) + ',000 km';
    return Math.round(km) + ' km';
  }

  /* ---- answering it -------------------------------------------------------
   * Arriving at a call that asked for one. The standing for actually
   * driving somebody off is aggression.js's and stays there; this is the
   * smaller thing of having come at all, which somebody notices. */

  var ANSWER_STANDING = 2;

  function answer(G, sys, t, hooks) {
    if (!G || !G.ship || !G.ship.pos || !V) return null;
    var l = live(G, sys, t), M = global.Missions;
    for (var i = 0; i < l.length; i++) {
      var e = l[i];
      if (e.answered || e.done || !kindOf(e.kind).help) continue;
      if (V.dist(e.pos, G.ship.pos) > ANSWER_KM) continue;
      e.answered = t;
      if (M && M.bumpStanding && e.faction) M.bumpStanding(G, e.faction, ANSWER_STANDING);
      if (hooks && hooks.say) {
        hooks.say('You answered ' + e.whoName + "'s call. Whoever is left here will remember it.", 6);
      }
      return e;
    }
    return null;
  }

  var Band = {
    KINDS: KINDS, LIFE: LIFE, REBROADCAST: REBROADCAST, ANSWER_KM: ANSWER_KM,
    ANSWER_STANDING: ANSWER_STANDING, MAX: MAX,
    open: open, touch: touch, close: close, live: live, rows: rows,
    hail: hail, answer: answer, kindOf: kindOf, age: age
  };

  global.Band = Band;
  if (typeof module !== 'undefined' && module.exports) module.exports = Band;
})(typeof window !== 'undefined' ? window : globalThis);
