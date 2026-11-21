/* milsats.js - armed defence platforms (com-sats slice 4, 2026-11-20).
 *
 * Astra, 2026-11-19: "a mil-sat is just an armed defense platform. We'll
 * have those in high-authority systems and along the border with no-man's
 * land." And they burn the same RTG fuel as the relays.
 *
 * WHERE (measured first, tools/diag-milsats.js, 120 claimed systems):
 *   - HIGH AUTHORITY: crime score 20 or less with development 0.6 or more,
 *     or a navy garrison in the system. 24 of 120. "Authority" is not a
 *     number the game keeps; that is the reading of it - a lawful system
 *     that can afford to be, or one the navy already sits in.
 *   - THE BORDER: an empire's star with an unclaimed star within 8 ly (the
 *     relay range). Only 9 of 120: galaxy.js keeps empires apart from
 *     empty space by a gap, so the frontier is thin and these are its posts.
 *   Pirate and Syndicate holds have none. An empire's minor power counts as
 *   the empire's.
 *
 * WHAT. Astra, 2026-11-20: "a pair of them that guard the most probable
 * insertion trajectories toward that station." Each civilian orbital port
 * gets a pair, holding station PLAT_OFFSET_KM out along its two busiest
 * approach corridors (corridorsOf: measured off the timetable), up to
 * PLAT_MAX a system. That is what makes them defence rather than scenery:
 * a pirate working the approach is inside their reach, and so is a wanted
 * pilot coming in to dock. Owned by the system's power (star.factionId).
 *
 * ON THE RAILS. A platform's place at t is a fixed offset in its station's
 * own orbital frame, so its coverage moves with the station and a
 * smuggler who knows the corridors can plan a run down a third one.
 * Each has its own RTG service cycle (Comsats.darkSpan, keyed 'dp|...'):
 * a late tender leaves it dark and unarmed, and the fuel contract is
 * military work (missions.js platformOffers). Cutting that supply takes
 * one down without a fight.
 *
 * WHAT IT SHOOTS. Owned, not neutral: it fires on its owner's enemies -
 *   - you, when the owner wants you (Combat.wantedHere) or when you have
 *     fired on it in the last half hour;
 *   - pirates and Syndicate raiders inside its reach.
 * It does not fire on an innocent: your standing decides whether it is
 * protection or a threat.
 *
 * DESTROYABLE. A shot down your nose that meets a platform first lands on
 * it (Combat.api.platformOnRay). The first hit is assault on its owner;
 * killing it is a navy-class kill (BOUNTY.killNavy) and the owner does not
 * forget. Its hull and its death are the only state (G.milsats).
 *
 * Not built yet, said so: hacking or bribing one, and the salvage - the
 * hot RTG core in a dead platform is a dangerous thing to pick up.
 */
(function (global) {
  'use strict';

  var DAY = 86400;
  var AUTH_CRIME = 20, AUTH_DEV = 0.6, BORDER_LY = 8;
  var PLAT_PER_PORT = 2, PLAT_MAX = 6;
  var PLAT_OFFSET_KM = 45;          // ahead of / behind the station on its orbit
  var PLAT_RISE_KM = 8;             // and a little off its plane, either side
  var PLAT_HULL = 400;
  var PLAT_RADIUS_KM = 0.02;        // what a shot must pass within to land
  var GUN = { dmg: 12, range: 30, cooldown: 1.5, variety: 'beam', color: '#ffd36b' };
  var ANGRY_S = 1800;               // it remembers being shot at for half an hour
  var ROUND_S = 0.25;               // looks for targets four times a second

  function V() { return global.V; }
  function Sim() { return global.Sim; }
  function Cb() { return global.Combat; }
  function Cs() { return global.Comsats; }
  function isEmpire(fid) { return !!fid && !/^(outlaw|pb)/.test(fid); }

  /* ---- where ------------------------------------------------------------ */
  function reasonFor(sys, star, gal) {
    if (!star || !isEmpire(star.factionId) || !sys) return null;
    var cb = Cb();
    var navy = (sys.ports || []).some(function (p) { return cb && cb.fleetPort && cb.fleetPort(p); });
    var authority = navy || ((sys.crimeScore || 99) <= AUTH_CRIME && (sys.development || 0) >= AUTH_DEV);
    var border = false;
    if (gal && gal.stars && global.Galaxy) {
      for (var i = 0; i < gal.stars.length && !border; i++) {
        var o = gal.stars[i];
        if (!o.factionId && global.Galaxy.distance3(star, o) <= BORDER_LY) border = true;
      }
    }
    return authority ? (border ? 'both' : 'authority') : border ? 'border' : null;
  }

  /* The system's platforms, cached on it. */
  function platformsFor(sys, star, gal) {
    if (!sys || !star) return [];
    if (sys._plats && sys._platsStar === star.id) return sys._plats;
    var out = [], why = reasonFor(sys, star, gal);
    if (why) {
      var cb = Cb();
      var guarded = (sys.ports || []).filter(function (p) {
        return p.market && !p.surface && !p.playerStation && !p.dug && p.parentBody &&
               !(cb && cb.fleetPort && cb.fleetPort(p));
      });
      /* The highport first: it is what a border post guards. */
      /* Then the ports the system was generated with, before any added after
       * (a companion moon's b0cp*, a resort's <world>rs): the id string sorts
       * 'b0cp1' ahead of 'b12', and in 3 of 53 guarded systems the moon's
       * station took a pair of platforms off an older port (bug hunt
       * 2026-11-21). */
      var late = function (p) { return /^b\d+$/.test(p.id) ? 0 : 1; };
      guarded.sort(function (a, b) {
        return (b.market.role === 'highport') - (a.market.role === 'highport') ||
               late(a) - late(b) || (a.id < b.id ? -1 : 1);
      });
      var n = 0;
      for (var i = 0; i < guarded.length && n < PLAT_MAX; i++) {
        var p = guarded[i];
        for (var k = 0; k < PLAT_PER_PORT && n < PLAT_MAX; k++, n++) {
          out.push({
            id: 'dp|' + star.id + '|' + p.id + '|' + k, star: star.id, port: p.id, portName: p.name,
            side: k === 0 ? 1 : -1, owner: star.factionId, why: why,
            name: 'DP-' + (n + 1) + ' ' + p.name, hullMax: PLAT_HULL, kind: 'platform'
          });
        }
      }
    }
    sys._plats = out; sys._platsStar = star.id;
    return out;
  }

  /* How far ahead in time the station is PLAT_OFFSET_KM along its orbit. */
  function leadOf(sys, p) {
    if (typeof p._lead === 'number') return p._lead;
    var port = sys.byId[p.port], S = Sim();
    var ps = S.bodyState(port, sys, 0), hs = S.bodyState(port.parentBody, sys, 0);
    var v = V().len(V().sub(ps.vel, hs.vel));
    p._lead = v > 1e-9 ? PLAT_OFFSET_KM / v : 0;
    return p._lead;
  }
  /* ---- the approach corridors (Astra, 2026-11-20) -------------------------
   * "It's a pair of them that guard the most probable insertion
   * trajectories toward that station." So a platform does not ride the
   * station's orbit: it holds station on an approach, PLAT_OFFSET_KM out
   * along it, where the traffic actually comes in.
   *
   * Which approaches: every timetabled lane that berths here, sampled on
   * its final approach (APPROACH_FRAC of the leg before it arrives, three
   * cycles each), the direction from the station to the ship written in
   * the station's own orbital frame - out from its world, along its orbit,
   * and square to both - weighted by how often the lane runs. The busiest
   * direction, counting everything within 40 degrees of it, is the first
   * corridor; the busiest more than 40 degrees from that is the second.
   * One corridor only, and the pair flank it. No traffic at all, and they
   * ride the orbit ahead and behind as before. Worked out once per port:
   * the timetable is the seed's. */
  var APPROACH_FRAC = 0.04, CORRIDOR_COS = 0.766, FLANK_KM = 10;
  function orbitFrame(sys, port, t) {
    var S = Sim(), Vv = V();
    var ps = S.bodyState(port, sys, t), hs = S.bodyState(port.parentBody, sys, t);
    var r = Vv.norm(Vv.sub(ps.pos, hs.pos)), v = Vv.sub(ps.vel, hs.vel);
    var a = Vv.norm(Vv.sub(v, Vv.scale(r, Vv.dot(v, r))));
    return { pos: ps.pos, r: r, a: a, n: Vv.cross(r, a) };
  }
  function corridorsOf(sys, port) {
    if (port._corridors !== undefined) return port._corridors;
    var S = Sim(), Vv = V(), smp = [];
    (sys.traffic || []).forEach(function (rt) {
      if (rt.dead || rt.kind === 'fleet' || !(rt.period > 0) || !S.trafficState) return;
      /* Only the timetable the system was generated with (bug hunt
       * 2026-11-21). Routes added later - a dig's, a resort's, a station of
       * yours - arrive mid-session after this is cached, so counting them
       * put a platform 6 km elsewhere after a reload than before it. */
      if (rt.latePort || rt.playerPort) return;
      var toX = rt.to === port.id, fromX = rt.from === port.id;
      if (!toX && !fromX) return;
      for (var j = 0; j < 3; j++) {
        var cs = rt.t0 + j * rt.period;
        var ta = toX ? cs + rt.cruise : cs + 2 * rt.cruise + rt.layover;
        var tq = ta - Math.max(30, rt.cruise * APPROACH_FRAC);
        var st;
        try { st = S.trafficState(rt, sys, tq); } catch (e) { st = null; }
        if (!st || !st.pos) continue;
        var f = orbitFrame(sys, port, tq), rel = Vv.sub(st.pos, f.pos), L = Vv.len(rel);
        if (!(L > 1)) continue;
        smp.push({ x: Vv.dot(rel, f.r) / L, y: Vv.dot(rel, f.a) / L, z: Vv.dot(rel, f.n) / L, w: 1 / rt.period });
      }
    });
    function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    function best(avoid) {
      var top = null, tw = 0;
      smp.forEach(function (s) {
        if (avoid && dot3(s, avoid) > CORRIDOR_COS) return;
        var w = 0;
        smp.forEach(function (o) { if (dot3(s, o) > CORRIDOR_COS && !(avoid && dot3(o, avoid) > CORRIDOR_COS)) w += o.w; });
        if (w > tw) { tw = w; top = s; }
      });
      if (!top) return null;
      var m = { x: 0, y: 0, z: 0 };
      smp.forEach(function (o) {
        if (dot3(top, o) > CORRIDOR_COS) { m.x += o.x * o.w; m.y += o.y * o.w; m.z += o.z * o.w; }
      });
      var l = Math.sqrt(dot3(m, m));
      return l > 1e-9 ? { x: m.x / l, y: m.y / l, z: m.z / l, w: tw } : null;
    }
    var c1 = smp.length ? best(null) : null;
    var c2 = c1 ? best(c1) : null;
    port._corridors = c1 ? { first: c1, second: c2, samples: smp.length } : null;
    return port._corridors;
  }

  function posOf(sys, p, t) {
    var port = sys.byId[p.port];
    if (!port) return null;
    var S = Sim(), Vv = V();
    var cor = corridorsOf(sys, port);
    if (cor) {
      var f = orbitFrame(sys, port, t);
      var c = p.side > 0 || !cor.second ? cor.first : cor.second;
      var dir = Vv.norm(Vv.add(Vv.add(Vv.scale(f.r, c.x), Vv.scale(f.a, c.y)), Vv.scale(f.n, c.z)));
      var at0 = Vv.addScaled(f.pos, dir, PLAT_OFFSET_KM);
      /* One corridor: the pair flank it, either side. */
      if (!cor.second) {
        var lat = Vv.norm(Vv.cross(dir, Math.abs(Vv.dot(dir, f.n)) < 0.9 ? f.n : f.r));
        at0 = Vv.addScaled(at0, lat, p.side * FLANK_KM);
      }
      return at0;
    }
    /* The station's place round its world a few seconds ahead or behind,
     * hung on the world where it is NOW: asking the station's absolute
     * position at another time would also move the world along its own
     * orbit, hundreds of kilometres (the first test found 337 km off). */
    var tl = t + p.side * leadOf(sys, p);
    var off = Vv.sub(S.bodyPosition(port, sys, tl), S.bodyPosition(port.parentBody, sys, tl));
    var ps = S.bodyState(port, sys, t), hs = S.bodyState(port.parentBody, sys, t);
    var at = Vv.add(hs.pos, off);
    /* Off the orbital plane, either side, so a pair is not a line. */
    var r = Vv.sub(ps.pos, hs.pos), v = Vv.sub(ps.vel, hs.vel);
    var nrm = Vv.norm(Vv.cross(r, v));
    return Vv.addScaled(at, nrm, p.side * PLAT_RISE_KM);
  }

  /* ---- its state: hull, death, temper ------------------------------------ */
  function stateOf(G, p) { return (G && G.milsats && G.milsats[p.id]) || null; }
  function ensure(G, p) {
    G.milsats = G.milsats || {};
    return G.milsats[p.id] || (G.milsats[p.id] = { hull: p.hullMax });
  }
  function isDead(G, p) { var s = stateOf(G, p); return !!(s && s.dead !== undefined && s.dead !== null); }
  function hullOf(G, p) { var s = stateOf(G, p); return s ? s.hull : p.hullMax; }
  /* Dark: its RTG lapsed and the tender is late (Comsats' own cycle). */
  function isDark(G, p, t) { return !!(Cs() && Cs().darkSpan(G, p.star, p.id, t)); }
  function armed(G, p, t) { return !isDead(G, p) && !isDark(G, p, t); }
  function angryAt(G, p, t) { var s = stateOf(G, p); return !!(s && typeof s.angry === 'number' && t - s.angry < ANGRY_S); }

  /* ---- who it shoots ------------------------------------------------------ */
  function hostileToYou(G, p, t) {
    var cb = Cb();
    if (angryAt(G, p, t)) return true;
    return !!(cb && cb.wantedHere && cb.wantedHere(G, p.owner));
  }
  function isOutlawShip(sp) {
    if (!sp || sp.dead || !sp.live) return false;
    return sp.kind === 'pirate' || !!sp.raider || /^(outlaw|pb)/.test(sp.faction || '');
  }

  /* A platform as somebody a ship can be killed by (Combat.killNpc's `by`):
   * a name and a flag, nothing that flies. */
  function asShooter(sys, p, t) {
    return { id: p.id, name: p.name, faction: p.owner, kind: 'platform', live: { pos: posOf(sys, p, t) } };
  }

  /* One platform's round: the nearest enemy in reach, if its gun is cool. */
  function fireRound(sys, G, p, t, hooks) {
    var cb = Cb(), Vv = V(), S = Sim();
    if (!armed(G, p, t)) return null;
    var st = ensure(G, p);
    if (t < (st.coolUntil || 0)) return null;
    var pos = posOf(sys, p, t);
    if (!pos) return null;
    var best = null, bd = GUN.range;
    var s = G.ship;
    if (s && !s.docked && !s.landed && hostileToYou(G, p, t)) {
      var d0 = Vv.dist(s.pos, pos);
      if (d0 < bd) { bd = d0; best = { you: true, pos: s.pos }; }
    }
    var pats = sys.patrols || [];
    for (var i = 0; i < pats.length; i++) {
      var sp = pats[i];
      if (!isOutlawShip(sp)) continue;
      var d = Vv.dist(sp.live.pos, pos);
      if (d < bd) { bd = d; best = { spec: sp, pos: sp.live.pos }; }
    }
    if (!best) return null;
    st.coolUntil = t + GUN.cooldown;
    var now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    if (cb && cb.shotFx) {
      (G.beams = G.beams || []).push(cb.shotFx(Vv.clone(pos), Vv.clone(best.pos), best.you ? s : best.spec.live,
        GUN.color, GUN.variety, now, false, { t: t }));
    }
    if (best.you) {
      if (hooks && hooks.say && !(st.warnedAt && t - st.warnedAt < 120)) {
        st.warnedAt = t;
        hooks.say(p.name + ' is firing on you', 5);
      }
      cb.damagePlayer(G, GUN.dmg, hooks, GUN, Vv.clone(pos));
      return 'you';
    }
    /* A pirate: hull, shield and scars as any hit, killed as by a third
     * party - no crime of yours, no pursuit for a thing that cannot fly. */
    var spec = best.spec;
    cb.npcHull(spec); cb.npcShield(spec);
    var split = cb.splitDamage(spec.shieldHp, GUN.dmg, GUN);
    spec.shieldHp -= split.shield; spec.hullHp -= split.hull;
    spec.lastHitAt = t;
    if (cb.markImpact) cb.markImpact(spec, Vv.clone(pos), split, t);
    if (spec.hullHp <= 0) cb.killNpc(sys, G, spec, t, hooks, asShooter(sys, p, t));
    return 'pirate';
  }

  var _round = {};
  function update(sys, G, t, hooks) {
    if (!sys || !G || !G.here) return 0;
    var plats = platformsFor(sys, G.here, G.galaxy);
    if (!plats.length) return 0;
    var slot = Math.floor(t / ROUND_S);
    if (_round.sys === sys && _round.slot === slot) return 0;
    _round = { sys: sys, slot: slot };
    var n = 0;
    for (var i = 0; i < plats.length; i++) if (fireRound(sys, G, plats[i], t, hooks)) n++;
    return n;
  }

  /* ---- shots that land on one -------------------------------------------- */
  function onRay(sys, G, t, origin, dir, range) {
    if (!G || !G.here) return null;
    var plats = platformsFor(sys, G.here, G.galaxy), Vv = V(), best = null;
    for (var i = 0; i < plats.length; i++) {
      var p = plats[i];
      if (isDead(G, p)) continue;
      var P = posOf(sys, p, t);
      if (!P) continue;
      var oc = Vv.sub(P, origin), tc = Vv.dot(oc, dir);
      if (tc < 0 || tc > range) continue;
      var d2 = Vv.dot(oc, oc) - tc * tc, R = PLAT_RADIUS_KM;
      if (d2 > R * R) continue;
      var dist = Math.max(0, tc - Math.sqrt(R * R - d2));
      if (!best || dist < best.dist) best = { dist: dist, point: Vv.addScaled(origin, dir, dist), plat: p };
    }
    return best;
  }
  function struck(sys, G, t, h, dmg, hooks) {
    var p = h.plat, cb = Cb(), st = ensure(G, p);
    if (st.dead !== undefined && st.dead !== null) return;
    var P = posOf(sys, p, t), Vv = V();
    st.hull -= dmg;
    /* Scars on it like on anything (scars.js), in a frame facing its world. */
    if (global.Scars && P) {
      var fr = frameOf(sys, p, t);
      global.Scars.add(p, fr, Vv.norm(Vv.sub(G.ship.pos, P)), dmg / p.hullMax, t, p.id);
    }
    var first = !angryAt(G, p, t);
    st.angry = t;
    var silent = G.ship && G.ship.silent;
    if (st.hull <= 0) {
      st.dead = t; st.hull = 0;
      if (!silent) {
        G.wanted = G.wanted || {};
        G.wanted[p.owner] = (G.wanted[p.owner] || 0) + cb.BOUNTY.killNavy;
        if (global.Missions && global.Missions.bumpStanding) global.Missions.bumpStanding(G, p.owner, -30);
      }
      if (hooks && hooks.say) hooks.say(p.name + ' DESTROYED' + (silent ? ' - no transponder, nothing logged'
                                                                         : ' - bounty +' + cb.BOUNTY.killNavy + ' cr'), 7);
      if (hooks && hooks.sound) hooks.sound('explosion');
      return;
    }
    if (first && !silent) {
      G.wanted = G.wanted || {};
      G.wanted[p.owner] = (G.wanted[p.owner] || 0) + cb.BOUNTY.assault;
      if (global.Missions && global.Missions.bumpStanding) global.Missions.bumpStanding(G, p.owner, -8);
      if (hooks && hooks.say) hooks.say('FIRING ON ' + p.name.toUpperCase() + ' - it answers, bounty +' + cb.BOUNTY.assault + ' cr', 6);
      if (hooks && hooks.sound) hooks.sound('warn');
    }
  }
  /* Its attitude: gun down the station's orbit, deck to the world. */
  function frameOf(sys, p, t) {
    var port = sys.byId[p.port], S = Sim(), Vv = V();
    var P = posOf(sys, p, t), C = S.bodyPosition(port.parentBody, sys, t);
    var up = Vv.norm(Vv.sub(P, C));
    var ps = S.bodyState(port, sys, t), hs = S.bodyState(port.parentBody, sys, t);
    /* The gun looks out along its corridor, at what comes in; on the
     * orbit (no traffic), along the orbit. */
    var along = corridorsOf(sys, port) ? Vv.norm(Vv.sub(P, ps.pos)) : Vv.norm(Vv.sub(ps.vel, hs.vel));
    var fwd = Vv.norm(Vv.sub(along, Vv.scale(up, Vv.dot(along, up))));
    if (!(Vv.len(fwd) > 0.5)) fwd = Vv.norm(Vv.cross(up, { x: 0, y: 0, z: 1 }));
    if (p.side < 0 && !corridorsOf(sys, port)) fwd = Vv.scale(fwd, -1);
    var right = Vv.norm(Vv.cross(fwd, up));
    return { pos: P, fwd: fwd, up: up, right: right };
  }

  /* Combat asks this for every shot (fireOne): a platform down the line. */
  if (global.Combat && global.Combat.api) {
    global.Combat.api.platformOnRay = onRay;
    global.Combat.api.platformStruck = struck;
  }

  var Milsats = {
    AUTH_CRIME: AUTH_CRIME, AUTH_DEV: AUTH_DEV, BORDER_LY: BORDER_LY, PLAT_PER_PORT: PLAT_PER_PORT, PLAT_MAX: PLAT_MAX,
    PLAT_OFFSET_KM: PLAT_OFFSET_KM, PLAT_HULL: PLAT_HULL, PLAT_RADIUS_KM: PLAT_RADIUS_KM, GUN: GUN, ANGRY_S: ANGRY_S,
    reasonFor: reasonFor, platformsFor: platformsFor, posOf: posOf, frameOf: frameOf, leadOf: leadOf,
    corridorsOf: corridorsOf, orbitFrame: orbitFrame, APPROACH_FRAC: APPROACH_FRAC,
    stateOf: stateOf, isDead: isDead, hullOf: hullOf, isDark: isDark, armed: armed, angryAt: angryAt,
    hostileToYou: hostileToYou, isOutlawShip: isOutlawShip, fireRound: fireRound, update: update,
    onRay: onRay, struck: struck, asShooter: asShooter
  };
  global.Milsats = Milsats;
  if (typeof module !== 'undefined' && module.exports) module.exports = Milsats;
})(typeof window !== 'undefined' ? window : globalThis);
