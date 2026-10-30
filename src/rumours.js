/* rumours.js — what people say about you, carried at the speed of ships.
 *
 * Step 5 of DESIGN-NOTES-CAPTAINS-RUMOURS-DISGUISE-v3 (section 3), the last
 * and hardest. Until now a captain who had never met you read your PUBLIC
 * RECORD (captains.js) — a set of counts every stranger in the galaxy knew
 * the instant they changed. That was the placeholder. This replaces it:
 *
 *   A RUMOUR IS BORN WHERE SOMEBODY SAW. Every deed that goes on the record
 *   now also starts a rumour aboard the ship that saw it — the victim, if
 *   she lived; the nearest witness, if she did not; nobody, if nobody was
 *   close enough. (The witness doctrine again: silence the call and there
 *   is no response.)
 *
 *   IT TRAVELS ON THE TIMETABLE. No faster-than-ship comms. A ship that
 *   knows tells the port she next berths at; every ship that berths at a
 *   port that knows carries it on. Because every timetable in this game is
 *   a pure function of the clock (sim.js trafficState), the moment each
 *   port and each captain hears is not simulated frame by frame but
 *   WORKED OUT — earliest-arrival over the berthing schedule, once per
 *   rumour per system, cached. Accurate at 10,000× and three stars away.
 *
 *   AND BETWEEN STARS, with the trade. Once a port in the system knows,
 *   the news goes out with the next ships jumping to the nearest stars —
 *   at the same seven hours a light year you fly, plus a day's wait for a
 *   departure — and lands at that system's busiest port, to spread there
 *   on its own timetable. Three hops at most, fainter at each.
 *
 *   SEEN BEATS HEARD. A captain who has seen you act goes by what she saw
 *   (captains.js opinion). Only a stranger reads rumours — the ones that
 *   have actually reached her ship by now — through her values. You can
 *   outrun your reputation, or be caught by it at the next port.
 *
 *   RUMOURS STICK TO AN IDENTITY. Each is about whoever you were flying as
 *   (Captains.identity) — so a fresh transponder starts with no rumours,
 *   and a disguise that gets a bad name keeps it.
 *
 * Friends' hearsay (favours.js) rides the same timetable when this module
 * is loaded: a captain's friend hears what you did when the news reaches
 * her ship, not the instant it happens.
 *
 * Decisions taken (Astra may want them otherwise — see the changelog):
 * a rumour fades by half every HALF_LIFE days; it does not distort as it
 * is retold, it only grows fainter with distance; and three star hops is
 * as far as anybody bothers to repeat it.
 */
(function (global) {
  'use strict';

  var V = global.V;

  /* ---- tuning ------------------------------------------------------------- */
  var DAY = 86400;
  var HALF_LIFE = 120 * DAY;         // a rumour is half as loud after this
  var MAX_HOPS = 3;                  // stars
  var HOP_FADE = 0.6;                // strength kept per star hop
  var LINKS = 4;                     // each star trades with its nearest few
  var COURIER_WAIT = DAY;            // for the next departure that way
  var ORBIT_LAG = DAY;               // a ship that never berths hears it in the bars
  var MERGE_WINDOW = 3600;           // the same deed, the same witness: one rumour
  var MAX_RUMOURS = 240;
  var HEARSAY_LIFE = 365 * DAY;

  /* What each record field means to a stranger who hears it, and how a
   * captain says she heard it. {at} is where ("At Halden Dock" / "Out in
   * Kappa Lyrae"); {v} is who it was done to. */
  var LINES = {
    piracy:      ['{at}, they say you robbed {v}.',
                  '{at}, they were talking about what you took off {v}.',
                  'Word {at2} is you take cargo at gunpoint.'],
    kills:       ['{at}, they say you killed the crew of {v}.',
                  'Word {at2} is you leave wrecks behind you.'],
    rescues:     ['{at}, they say you pulled {v} out of the dark.',
                  'Word {at2} is you stop for ships in trouble.'],
    pirateKills: ['{at}, they say you blew a raider apart.',
                  'Word {at2} is you hunt pirates.'],
    lies:        ['{at}, they say you lie on the band.',
                  'Word {at2} is your word is no good.'],
    cruelLies:   ['{at}, they say you cried for help to lure {v} out. Nobody will come for you now.',
                  'Word {at2} is you use maydays as bait.']
  };

  /* ---- the berthing network of one system ---------------------------------
   * Nodes: ports ('P:b15') and ships ('r:r3' for a timetabled route —
   * including a trader lifted into an encounter, which answers to its
   * route — and 'p:n4' for a patrol). A ship touches the two ports of its
   * lane while moored there; an orbiting patrol touches the port it
   * circles, continuously, or the busiest port a day late. */
  function netOf(sys) {
    if (sys._rumourNet) return sys._rumourNet;
    var ports = {}, ships = {}, touch = {}, i;
    function port(id) {
      if (!id || ports[id]) return;
      ports[id] = true; touch[id] = touch[id] || [];
    }
    function addShip(node, sched, a, b, owner) {
      ships[node] = { sched: sched, ports: [a, b], owner: owner };
      port(a); port(b);
      touch[a].push(node); if (b !== a) touch[b].push(node);
    }
    var tr = sys.traffic || [];
    for (i = 0; i < tr.length; i++) {
      var r = tr[i];
      if (r.kind === 'fleet' || !r.from || !r.to || !(r.period > 0)) continue;
      addShip('r:' + r.id, r, r.from, r.to, r);
      ships['r:' + r.id].timetabled = true;     // flies Sim.trafficState, breakdowns and all
    }
    var pt = sys.patrols || [], orbiters = [];
    for (i = 0; i < pt.length; i++) {
      var p = pt[i];
      if (!p.id || p.liftedFrom || !p.rail) continue;
      if (p.rail.type === 'route' && p.rail.route && p.rail.route.from) {
        addShip('p:' + p.id, p.rail.route, p.rail.route.from, p.rail.route.to, p);
      } else orbiters.push(p);
    }
    /* The hub: the port the most lanes touch, ties to the lower id, so it
     * is a pure function of the seed. Where news from other stars lands. */
    var hub = null, best = -1;
    Object.keys(ports).sort().forEach(function (id) {
      if (touch[id].length > best) { best = touch[id].length; hub = id; }
    });
    for (i = 0; i < orbiters.length; i++) {
      var o = orbiters[i], par = o.rail.parent && (o.rail.parent.id || o.rail.parent);
      var at = null;
      for (var id in ports) {
        var b = sys.byId && sys.byId[id];
        var pb = b && b.parentBody && (b.parentBody.id || b.parentBody);
        if (id === par || pb === par) { at = id; break; }
      }
      ships['p:' + o.id] = { orbit: at || hub, lag: at ? 0 : ORBIT_LAG, ports: [at || hub], owner: o };
      if (at || hub) touch[at || hub].push('p:' + o.id);
    }
    sys._rumourNet = { ports: ports, ships: ships, touch: touch, hub: hub };
    return sys._rumourNet;
  }

  /* The first moment at or after t that a timetabled ship is moored at
   * port X. One cycle: depart A, cruise, moored at B for the layover,
   * cruise back, moored at A for the rest of the period. */
  /* With `sys`, a leg on which her tank let go (upkeep.js) ends when the
   * tug brings her in, not when the timetable said she would arrive: she
   * is in the berth from the tug's arrival — earlier or later than the
   * timetable — to the end of the layover, as Sim.trafficState has her. */
  function berthTime(sched, X, t, sys) {
    var P = sched.period, c = sched.cruise, l = sched.layover;
    var U = sys ? global.Upkeep : null;
    var k = Math.floor((t - sched.t0) / P);
    for (var j = k - 1; j <= k + 1; j++) {
      var cs = sched.t0 + j * P, s, e, leg;
      if (X === sched.to) { s = cs + c; e = cs + c + l; leg = 2 * j; }
      else { s = cs + 2 * c + l; e = cs + P; leg = 2 * j + 1; }
      if (U) {
        var bd = U.breakOn(sched, sys, leg);
        if (bd) s = bd.towAt;
      }
      if (t < e && t >= s) return t;
      if (t < s) return s;
    }
    return sched.t0 + (k + 2) * P + (X === sched.to ? c : 2 * c + l);
  }

  function contactTime(ship, X, t, sys) {
    var tc;
    if (ship.orbit) tc = ship.orbit === X ? t + (ship.lag || 0) : Infinity;
    else if (X !== ship.ports[0] && X !== ship.ports[1]) return Infinity;
    else tc = berthTime(ship.sched, X, t, ship.timetabled ? sys : null);
    /* A ship destroyed before she got there tells nobody. A dead ship
     * with no recorded time (an older save) is taken as always dead. */
    var o = ship.owner;
    if (o && o.dead && (o.diedAt == null || tc >= o.diedAt)) return Infinity;
    return tc;
  }

  /* EARLIEST ARRIVAL from one node at one moment, over the whole system.
   * Returns { node: { t, via } } where `via` is the port a ship heard it
   * at (null for the ship that started it). A plain O(n²) Dijkstra: a
   * system has a dozen ports and a hundred-odd ships, and this runs once
   * per rumour per system. */
  var _prop = {}, _propN = 0;
  function propagate(sys, origin, t0) {
    var ck = sys.seed + '|' + (sys.starId || sys.name) + '|' + (sys._rumourGen || 0) + '|' +
             origin + '|' + t0;
    if (_prop[ck]) return _prop[ck];
    if (++_propN > 4000) { _prop = {}; _propN = 0; }
    var net = netOf(sys), best = {}, done = {};
    if (!origin) return (_prop[ck] = best);
    best[origin] = { t: t0, via: null };
    for (;;) {
      var cur = null, ct = Infinity;
      for (var n in best) if (!done[n] && best[n].t < ct) { ct = best[n].t; cur = n; }
      if (!cur) break;
      done[cur] = true;
      var nb = [];
      if (cur.charAt(0) === 'P') {
        var pid = cur.slice(2), list = net.touch[pid] || [];
        for (var i = 0; i < list.length; i++) {
          var sh = net.ships[list[i]];
          if (sh) nb.push({ n: list[i], t: contactTime(sh, pid, ct, sys), via: pid });
        }
      } else {
        var s = net.ships[cur];
        if (s) for (var j = 0; j < s.ports.length; j++) {
          if (s.ports[j]) nb.push({ n: 'P:' + s.ports[j], t: contactTime(s, s.ports[j], ct, sys), via: null });
        }
      }
      for (var k = 0; k < nb.length; k++) {
        var e = nb[k];
        if (!(e.t < Infinity) || done[e.n]) continue;
        if (!best[e.n] || e.t < best[e.n].t) best[e.n] = { t: e.t, via: e.via };
      }
    }
    _prop[ck] = best;
    return best;
  }

  function firstPortTime(prop) {
    var t = Infinity;
    for (var n in prop) if (n.charAt(0) === 'P' && prop[n].t < t) t = prop[n].t;
    return t;
  }

  /* ---- who a contact is, on the network ------------------------------------ */
  function nodeOf(contact) {
    if (!contact) return null;
    var spec = contact.spec || (contact.rail || contact.liftedFrom ? contact : null);
    if (spec) {
      if (spec.liftedFrom && spec.liftedFrom.id) return 'r:' + spec.liftedFrom.id;
      return spec.id ? 'p:' + spec.id : null;
    }
    if (contact.route && contact.route.id) return 'r:' + contact.route.id;
    return null;
  }

  /* A memory key ('star/r12', 'star/n4#x:AB-1') back to a node. */
  function nodeOfKey(sys, key) {
    var id = String(key).split('#')[0].split('/').slice(1).join('/');
    var net = netOf(sys);
    if (net.ships['r:' + id]) return 'r:' + id;
    if (net.ships['p:' + id]) return 'p:' + id;
    return null;
  }

  function isDead(contact) {
    if (!contact) return true;
    var spec = contact.spec || (contact.rail || contact.liftedFrom ? contact : null);
    if (spec) return !!spec.dead;
    return !!(contact.route && contact.route.dead);
  }

  function posOf(contact, sys, t) {
    if (!contact) return null;
    if (contact.pos) return contact.pos;
    var spec = contact.spec || contact;
    if (spec.live && spec.live.pos) return spec.live.pos;
    return null;
  }

  /* WHERE A RUMOUR STARTS: the ship that saw it, if she is still flying;
   * else the nearest ship (not a pirate — pirates do not gossip to honest
   * ports) or station within witness range of the scene; else nowhere. */
  function originFor(G, sys, contact, t) {
    var Sim = global.Sim, Combat = global.Combat;
    var net = netOf(sys);
    if (contact && !isDead(contact)) {
      var n = nodeOf(contact);
      if (n && net.ships[n]) return n;
    }
    var scene = posOf(contact, sys, t) || (G.ship && G.ship.pos);
    if (!scene || !Sim) return null;
    var R = (Combat && Combat.WITNESS_RANGE) || 150000;
    var list = Sim.shipsAll(sys, t), best = null, bd = R;
    var self = nodeOf(contact);
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.kind === 'pirate' || s.kind === 'fleet' || !s.pos) continue;
      var sn = nodeOf(s);
      if (!sn || sn === self || !net.ships[sn]) continue;
      var d = V.dist(s.pos, scene);
      if (d < bd) { bd = d; best = sn; }
    }
    if (best) return best;
    for (var j = 0; j < (sys.bodies || []).length; j++) {
      var b = sys.bodies[j];
      if (b.kind !== 'station' || !net.ports[b.id]) continue;
      if (V.dist(Sim.bodyPosition(b, sys, t), scene) < R) return 'P:' + b.id;
    }
    return null;
  }

  /* ---- between stars ------------------------------------------------------ */
  var _links = {};
  function linksOf(galaxy) {
    var k = galaxy.seed;
    if (_links[k]) return _links[k];
    var Gx = global.Galaxy, stars = galaxy.stars, out = {};
    stars.forEach(function (a) { out[a.id] = out[a.id] || {}; });
    stars.forEach(function (a) {
      var near = stars.filter(function (b) { return b !== a; }).map(function (b) {
        return { id: b.id, d: Gx.distance3(a, b) };
      }).sort(function (x, y) { return x.d - y.d || (x.id < y.id ? -1 : 1); }).slice(0, LINKS);
      near.forEach(function (n) { out[a.id][n.id] = n.d; out[n.id][a.id] = n.d; });
    });
    _links[k] = out;
    return out;
  }

  function starSpread(G, fromStar, tOut) {
    var Gx = global.Galaxy;
    var res = {};
    res[fromStar] = { t: tOut, s: 1, hops: 0 };
    if (!G.galaxy || !Gx || !(tOut < Infinity)) return res;
    var links = linksOf(G.galaxy);
    var hoursPerLy = Gx.HOURS_PER_LY || 7;
    var done = {};
    for (;;) {
      var cur = null, ct = Infinity;
      for (var id in res) if (!done[id] && res[id].t < ct) { ct = res[id].t; cur = id; }
      if (!cur) break;
      done[cur] = true;
      if (res[cur].hops >= MAX_HOPS) continue;
      var nb = links[cur] || {};
      for (var nid in nb) {
        if (done[nid]) continue;
        var t = ct + nb[nid] * hoursPerLy * 3600 + COURIER_WAIT;
        if (!res[nid] || t < res[nid].t) {
          res[nid] = { t: t, s: res[cur].s * HOP_FADE, hops: res[cur].hops + 1 };
        }
      }
    }
    return res;
  }

  /* ---- making them -------------------------------------------------------- */
  function starName(G, id) {
    var s = G.galaxy && G.galaxy.byId ? G.galaxy.byId[id] : null;
    return (s && s.name) || id;
  }

  function victimName(contact) {
    if (!contact) return null;
    var n = contact.name || (contact.spec && contact.spec.name) || (contact.route && contact.route.name);
    return n ? 'the ' + n : null;
  }

  function spawn(G, sys, field, contact, t, opts) {
    var C = global.Captains;
    if (!G || !sys || !C || !G.rumours) return null;
    var origin = originFor(G, sys, contact, t);
    if (!origin) return null;                       // nobody saw
    var about = C.identity(G).key;
    var star = sys.starId || (G.here && G.here.id);
    var n = (opts && opts.n) || 1;
    for (var i = G.rumours.length - 1; i >= 0; i--) {
      var o = G.rumours[i];
      if (t - o.t > MERGE_WINDOW) break;
      if (o.about === about && o.field === field && o.origin === origin && o.star === star) {
        o.n += n; return o;
      }
    }
    var prop = propagate(sys, origin, t);
    var R = {
      id: 'rm' + (G.rumourSeq = (G.rumourSeq || 0) + 1),
      about: about, field: field, n: n,
      v: victimName(contact), star: star, starName: starName(G, star),
      origin: origin, t: t,
      stars: starSpread(G, star, firstPortTime(prop))
    };
    G.rumours.push(R);
    prune(G, t);
    return R;
  }

  function weightOf(R, starId, t) {
    var e = R.stars && R.stars[starId];
    if (!e) return 0;
    return (R.n || 1) * e.s * Math.pow(0.5, Math.max(0, t - R.t) / HALF_LIFE);
  }

  function prune(G, t) {
    if (G.rumours.length <= MAX_RUMOURS) return;
    var origin = function (R) { return weightOf(R, R.star, t); };
    var weakest = 0;
    for (var i = 1; i < G.rumours.length; i++) {
      if (origin(G.rumours[i]) < origin(G.rumours[weakest])) weakest = i;
    }
    G.rumours.splice(weakest, 1);
  }

  /* ---- who has heard what ------------------------------------------------- */
  /* When a node in this system hears rumour R, or null if it has not and
   * will not. In the rumour's own system it spreads from its origin; in
   * another it lands at the hub when the trade brings it. */
  function heardAt(sys, R, node) {
    var starId = sys.starId;
    var e = R.stars && R.stars[starId];
    if (!e) return null;
    var prop = starId === R.star ? propagate(sys, R.origin, R.t)
                                 : propagate(sys, netOf(sys).hub ? 'P:' + netOf(sys).hub : null, e.t);
    return prop[node] || null;
  }

  /* Everything a contact has heard about one identity, by now, as weighted
   * counts in the shape of the public record — so captains.js reads it
   * the same way — plus the loudest rumour per field, for her to quote. */
  function tally(G, sys, contact, t, idKey) {
    return tallyAt(G, sys, nodeOf(contact), t, idKey);
  }
  /* The same, for a place on the network rather than a ship: 'P:<port>'
   * is a port, which hears everything any ship berthing there has heard.
   * The people on a station's deck (dialogue.js, 2026-10-25) know what
   * their port knows. */
  function tallyAt(G, sys, node, t, idKey) {
    var out = { counts: {}, top: {} };
    if (!node || !G.rumours || !sys) return out;
    var net = netOf(sys);
    for (var i = 0; i < G.rumours.length; i++) {
      var R = G.rumours[i];
      if (R.about !== idKey) continue;
      var h = R.origin === node && R.star === sys.starId ? { t: R.t, via: null } : heardAt(sys, R, node);
      if (!h || h.t > t) continue;
      var w = weightOf(R, sys.starId, t);
      if (!(w > 0)) continue;
      out.counts[R.field] = (out.counts[R.field] || 0) + w;
      var top = out.top[R.field];
      if (!top || w > top.w) {
        out.top[R.field] = { R: R, w: w, via: h.via, here: R.star === sys.starId };
      }
    }
    return out;
  }

  /* Her line about it. Seeded by rumour and captain, so she says the same
   * thing about the same rumour until it changes. */
  function lineFor(G, sys, top, seed) {
    if (!top || !LINES[top.R.field]) return null;
    var list = LINES[top.R.field];
    var RNG = global.RNG;
    var pick = list[(RNG ? RNG.hashString(seed + '|' + top.R.id) : 0) % list.length];
    var portName = top.via && sys.byId && sys.byId[top.via] ? sys.byId[top.via].name : null;
    var at = top.here ? (portName ? 'At ' + portName : 'On these lanes')
                      : 'Out in ' + (top.R.starName || 'the next system');
    var at2 = top.here ? (portName ? 'at ' + portName : 'on these lanes')
                       : 'from ' + (top.R.starName || 'the next system');
    return pick.replace(/\{at\}/g, at).replace(/\{at2\}/g, at2)
               .replace(/\{v\}/g, top.R.v || 'a ship out there');
  }

  /* What a PORT has heard, for the dock screens and the tests. */
  function portHeard(G, sys, portId, t, idKey) {
    var out = [];
    for (var i = 0; i < (G.rumours || []).length; i++) {
      var R = G.rumours[i];
      if (idKey && R.about !== idKey) continue;
      var h = heardAt(sys, R, 'P:' + portId);
      if (h && h.t <= t) out.push({ R: R, t: h.t });
    }
    return out;
  }

  /* ---- friends' hearsay, at ship speed (favours.js) ------------------------
   * Deferred until the news reaches the friend's own ship. */
  function defer(G, sys, contact, h, t) {
    var origin = originFor(G, sys, contact, t);
    if (!origin) return false;               // nobody to tell her
    G.hearsay = G.hearsay || [];
    G.hearsay.push({ star: sys.starId, origin: origin, t0: t, key: h.key, d: h.d,
                     kind: h.kind, f: h.f });
    return true;
  }

  function settle(G, sys, t, onlyKey) {
    var list = G.hearsay;
    if (!list || !list.length || !sys) return 0;
    var F = global.Favours, n = 0;
    var base = onlyKey ? String(onlyKey).split('#')[0] : null;
    for (var i = list.length - 1; i >= 0; i--) {
      var h = list[i];
      if (t - h.t0 > HEARSAY_LIFE) { list.splice(i, 1); continue; }
      if (h.star !== sys.starId) continue;
      if (base && String(h.key).split('#')[0] !== base) continue;
      var node = nodeOfKey(sys, h.key);
      if (!node) continue;
      var a = propagate(sys, h.origin, h.t0)[node];
      if (!a || a.t > t) continue;
      if (F && F.applyHearsay) F.applyHearsay(G, h.key, h.d, h.kind, a.t, h.f);
      list.splice(i, 1); n++;
    }
    return n;
  }

  /* A SHIP DIED (Combat.killNpc). Rumours that started in this system may
   * have been riding her and nobody else: their reach to other stars was
   * worked out while she was alive, so work it out again. */
  function onDeath(G, sys, t) {
    if (!G || !G.rumours || !sys) return;
    for (var i = 0; i < G.rumours.length; i++) {
      var R = G.rumours[i];
      if (R.star !== sys.starId || t - R.t > 60 * DAY) continue;   // long since passed on
      var first = firstPortTime(propagate(sys, R.origin, R.t));
      if (R.stars && R.stars[R.star] && R.stars[R.star].t === first) continue;
      R.stars = starSpread(G, R.star, first);
    }
  }

  /* ---- the tick ------------------------------------------------------------ */
  var CHECK_EVERY = 30;
  function update(sys, G, t) {
    if (!G || !sys) return;
    var slot = Math.floor(t / CHECK_EVERY);
    if (G._rumourSlot === slot) return;
    G._rumourSlot = slot;
    settle(G, sys, t, null);
  }

  var Rumours = {
    spawn: spawn, tally: tally, tallyAt: tallyAt, lineFor: lineFor, portHeard: portHeard,
    propagate: propagate, netOf: netOf, berthTime: berthTime, starSpread: starSpread,
    originFor: originFor, nodeOf: nodeOf, heardAt: heardAt, weightOf: weightOf,
    defer: defer, settle: settle, update: update, onDeath: onDeath, LINES: LINES,
    HALF_LIFE: HALF_LIFE, MAX_HOPS: MAX_HOPS, HOP_FADE: HOP_FADE, COURIER_WAIT: COURIER_WAIT,
    _clearCache: function () { _prop = {}; _links = {}; }
  };
  global.Rumours = Rumours;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rumours;
})(typeof window !== 'undefined' ? window : globalThis);
