/* stations.js - founding a station from a Crawler (2026-10-31).
 *
 * Astra: "yeah, let's do that next", with her answers: a licence now
 * (licence.js), orbit AND surface, a full port with NPC traffic when she
 * opens, and the arms helping build her - her crew's tugs unpack at the
 * agreed cubes-a-day rate, and any crate you carry yourself to the frame
 * goes in at once. The agreed design is claude/crawler-and-station-modules.md
 * and rung 5 of claude/mining-and-survey.md.
 *
 * THE CRAWLER IS THE STATION'S FIRST L BAY. Founding is permanent: she does
 * not fly again. What she carries decides the type (Construction.canFound),
 * and every crewed type needs Crew quarters. You leave her in one of her own
 * tugs - the arms you will carry crates with - and her crew works the rest
 * of the bay. That tug is off her shift while you fly it, so her crew's
 * rate is the bay's less one tug: carrying crates yourself is how you make
 * it up, and more.
 *
 * IN ORBIT she stands where the Crawler was, on the circular orbit through
 * that point round the world she was over. ON A SURFACE she goes down below
 * the Crawler, on a world you hold a claim on (claims.js), and her shuttles
 * ferry every crate down after it is unpacked: a surface station needs a
 * shuttle in the bay, and takes longer. The Crawler stays up, on a circular
 * parking orbit through where she founded, until the last crate is down.
 *
 * THE SCHEDULE IS A RAIL. A founding is a record with a start time, the
 * crates in the order her crew will unpack them, the rates of her craft and
 * the set of crates YOU put in by hand. When each crate goes in, and when
 * she opens, are pure functions of that record and the clock - so skipping
 * a month gets the right answer, and nothing ticks.
 *
 * WHILE SHE IS BEING BUILT her crates float in a ring round the Crawler,
 * where she opened her cubes: floatingCrates() says where each one is, for
 * the arms and the renderer. A crate her crew has unpacked, or you have
 * carried in, is gone from the ring. Bring one within INSTALL_KM of her and
 * it is in.
 *
 * WHEN SHE OPENS she is a port like any other: a body in the system with a
 * market of her type (Economy.buildPortMarket with forceRole), dressing,
 * berths, and her own traffic (Gen.addPortRoutes) whose clocks start the
 * day she opens. Nobody else's ships move. She is put back into the system
 * every time it is handed out (inject, from main.js systemFor), so a save or
 * a regenerate finds her where she was.
 *
 * A FORGED LICENCE is looked at once a week (Licence.tick). Caught, you
 * have a week to pay the real fee on the authority channel; past that, the
 * licensing power seizes her - she stays open, under their flag, and is no
 * longer yours.
 *
 * Saved: G.stations.
 */
(function (global) {
  'use strict';
  var V = global.V || (typeof require !== 'undefined' ? require('./vec3.js') : null);
  var K = global.Kepler || (typeof require !== 'undefined' ? require('./kepler.js') : null);

  var DAY = 86400;
  var MIN_PORT_KM = 500;          // a station needs room: not on top of a port
  var MIN_PAD_KM = 40;            // nor on top of another pad on the ground
  var LOW_OVER = 2.0;             // a surface site: within 2 radii of the centre
  var INSTALL_KM = 0.35;          // a crate is in when brought this close to her
                                  // centre: alongside her (she is 164 m long)
  var FLOAT_RING_KM = 0.6;        // where her crates float, round her
  var PORT_MASS = 2e9;
  var STATION_RADIUS_KM = 1.3;    // the smallest of the generated ports

  /* Her type to the market's role. The skimmer is a refinery that draws
   * from the giant below; the hab is a highport. */
  var ROLE_FOR = { market: 'orbital', refinery: 'refinery', skimmer: 'refinery',
                   mining: 'mining', hab: 'highport', shipyard: 'shipyard' };

  function C() { return global.Construction; }
  function starOf(G, sys) { return (sys && sys.starId) || (G.here && G.here.id) || null; }
  function say(hooks, m, s) { if (hooks && hooks.say) hooks.say(m, s || 6); }
  function journal(G, m) { if (global.Journal && global.Journal.add) global.Journal.add(G, 'build', m); }
  function list(G) { return (G && G.stations) || []; }
  function byId(G, id) {
    var l = list(G);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function portId(st) { return 'ps-' + st.id; }

  /* ---- the schedule -------------------------------------------------------- */
  /* The order her crew unpacks in: biggest first, as they came out of her
   * cubes (Construction.layout fills from the stern, biggest first). */
  var SIZE_RANK = { XL: 0, L: 1, M: 2, S: 3 };
  function crewOrder(crateIds) {
    var Cn = C();
    return crateIds.map(function (id, i) { return { id: id, i: i }; }).sort(function (a, b) {
      var A = Cn.BY_ID[a.id], B = Cn.BY_ID[b.id];
      return (SIZE_RANK[A.size] - SIZE_RANK[B.size]) || (a.i - b.i);
    }).map(function (x) { return x.i; });
  }
  /* A crate's share of a cube: one cube holds PER_CUBE of its size. */
  function cubesOf(crateId) {
    var Cn = C(), c = Cn.BY_ID[crateId];
    return c ? 1 / Cn.PER_CUBE[c.size] : 0;
  }

  /* When each crate goes in, and when she opens. */
  function schedule(st) {
    var rate = st.rates.unpack, ferry = st.rates.ferry;
    var surface = st.kind === 'surface';
    var out = {}, tUnpack = st.startedAt, tDown = st.startedAt, last = st.startedAt;
    var hand = st.hand || {};
    st.order.forEach(function (i) {
      if (hand[i] !== undefined) { out[i] = hand[i]; last = Math.max(last, hand[i]); return; }
      var cu = cubesOf(st.crates[i]);
      tUnpack += rate > 0 ? cu / rate * DAY : Infinity;
      var tIn = tUnpack;
      if (surface) { tDown = Math.max(tDown, tUnpack) + (ferry > 0 ? cu / ferry * DAY : Infinity); tIn = tDown; }
      out[i] = tIn;
      last = Math.max(last, tIn);
    });
    return { crateIn: out, opensAt: last };
  }
  function opensAt(st) { return schedule(st).opensAt; }
  function isOpen(st, t) { return !!st && t >= opensAt(st); }
  function cratesIn(st, t) {
    var sch = schedule(st), n = 0;
    for (var i = 0; i < st.crates.length; i++) if (t >= sch.crateIn[i]) n++;
    return n;
  }

  /* ---- where she is ---------------------------------------------------------- */
  function hostOf(st, sys) { return sys && sys.byId ? sys.byId[st.host] || null : null; }
  function siteState(st, sys, t) {
    var Sim = global.Sim, host = hostOf(st, sys);
    if (!Sim || !host) return null;
    var hs = Sim.bodyState(host, sys, t);
    var rel = st.kind === 'surface' ? Sim.surfaceOffset(host, st.at, t)
                                    : K.state(st.orbit, host.mu + V.G * PORT_MASS, t);
    return { pos: V.add(hs.pos, rel.pos), vel: V.add(hs.vel, rel.vel), host: host };
  }
  /* Where the Crawler is: the site itself in orbit, her parking orbit over
   * a surface site. */
  function crawlerState(st, sys, t) {
    if (st.kind !== 'surface') return siteState(st, sys, t);
    var Sim = global.Sim, host = hostOf(st, sys);
    if (!Sim || !host || !st.parkOrbit) return null;
    var hs = Sim.bodyState(host, sys, t);
    var rel = K.state(st.parkOrbit, host.mu, t);
    return { pos: V.add(hs.pos, rel.pos), vel: V.add(hs.vel, rel.vel), host: host };
  }

  /* And how she lies: nose along her orbit, deck to the world. For the
   * renderer and the arms' tip camera. */
  function crawlerPose(st, sys, t) {
    var cs = crawlerState(st, sys, t);
    if (!cs) return null;
    var hs = global.Sim.bodyState(cs.host, sys, t);
    var up = V.norm(V.sub(cs.pos, hs.pos));
    var rv = V.sub(cs.vel, hs.vel);
    var fwd = V.norm(V.sub(rv, V.scale(up, V.dot(rv, up))));
    return { pos: cs.pos, vel: cs.vel, host: cs.host, up: up, fwd: fwd, right: V.norm(V.cross(fwd, up)) };
  }

  /* What is still floating at the site at time t, and where. */
  function floatingCrates(st, sys, t) {
    if (!st || st.seized) return [];
    var cs = crawlerState(st, sys, t);
    if (!cs) return [];
    var sch = schedule(st), out = [], n = st.crates.length, Cn = C();
    for (var i = 0; i < n; i++) {
      if (t >= sch.crateIn[i]) continue;
      if (st.held === i) continue;
      var a = (i / n) * Math.PI * 2;
      var pos = V.add(cs.pos, { x: Math.cos(a) * FLOAT_RING_KM, y: Math.sin(a) * FLOAT_RING_KM, z: 0 });
      var cr = Cn.BY_ID[st.crates[i]];
      out.push({ kind: 'crate', station: st.id, idx: i, crateId: st.crates[i],
                 name: (cr ? cr.name : 'station') + ' crate', size: cr ? cr.size : 'M',
                 pos: pos, vel: V.clone(cs.vel) });
    }
    return out;
  }
  /* Every crate floating in this system now. */
  function cratesHere(G, sys, t) {
    var star = starOf(G, sys), out = [];
    list(G).forEach(function (st) {
      if (st.star === star && !isOpen(st, t)) out = out.concat(floatingCrates(st, sys, t));
    });
    return out;
  }
  /* Founded here and not open yet. */
  function buildingHere(G, sys, t) {
    var star = starOf(G, sys);
    return list(G).filter(function (st) { return st.star === star && !st.seized && !isOpen(st, t); });
  }

  /* A crate carried in by hand. */
  function installByHand(st, idx, t) {
    if (!st || (st.hand && st.hand[idx] !== undefined)) return false;
    var sch = schedule(st);
    if (t >= sch.crateIn[idx]) return false;          // her crew got there first
    st.hand = st.hand || {};
    st.hand[idx] = t;
    if (st.held === idx) st.held = null;
    return true;
  }
  /* For the arms: is this point at her frame? */
  function atFrame(st, sys, t, pos) {
    var cs = crawlerState(st, sys, t);
    return !!cs && V.dist(cs.pos, pos) <= INSTALL_KM;
  }

  /* ---- what she will be -------------------------------------------------------- */
  function typeFor(crateIds) {
    var rows = C().canFound(crateIds);
    for (var i = 0; i < rows.length; i++) if (rows[i].ok) return rows[i];
    return null;
  }
  function nearestType(crateIds) {
    var rows = C().canFound(crateIds).filter(function (r) { return r.missing.indexOf('second Crawler') < 0; });
    rows.sort(function (a, b) { return (b.defining - a.defining) || (a.missing.length - b.missing.length); });
    return rows[0] || null;
  }

  /* ---- may she be founded here ---------------------------------------------- */
  function worldOk(b) { return !!b && (b.kind === 'planet' || b.kind === 'moon'); }
  function landable(b) { return worldOk(b) && b.type !== 'gasGiant' && b.type !== 'iceGiant'; }
  function claimed(G, star, body, t) {
    var c = (G.claims || {})[star + ':' + body.id];
    return !!c && !(c.until && c.until < t);
  }

  /* Why not, or null. `kind` is 'orbital' or 'surface'. Spends nothing:
   * the licence check only asks whether one will be there. */
  function refusal(G, sys, t, kind) {
    var s = G.ship, Cn = C(), Sim = global.Sim, L = global.Licence;
    if (!Cn || !Cn.isCrawler(s)) return 'only a Crawler founds a station';
    if (s.docked || s.landed) return 'cast off first: she founds where she stands';
    if (global.Combat && global.Combat.lienRefusal) {
      var lien = global.Combat.lienRefusal(G);
      if (lien) return lien;
    }
    var ids = Cn.aboard(s).map(function (a) { return a.crateId; });
    if (!ids.length) return 'her cubes hold no station crates';
    if (!typeFor(ids)) {
      var nt = nearestType(ids);
      return 'her crates found nothing yet' + (nt ? ' - a ' + nt.name.toLowerCase() + ' still needs ' +
        nt.missing.map(function (id) { var c = Cn.BY_ID[id]; return c ? c.name : id; }).join(', ') : '');
    }
    var rates = Cn.craftRates(Cn.loadoutOf(s));
    if (rates.tugs < 2) return 'she needs a tug for her crew as well as the one you leave in';
    var host = Sim.dominantBody(s.pos, sys, t);
    if (!worldOk(host)) return 'a station stands over a world - she is out between them';
    var hp = Sim.bodyPosition(host, sys, t);
    var alt = V.dist(s.pos, hp);
    var ports = sys.ports || [], i;
    if (kind === 'surface') {
      if (!landable(host)) return 'nothing stands on ' + host.name + ' - no ground to build on';
      if (alt > host.radius * LOW_OVER) return 'too high over ' + host.name + ' to put her down - come within ' +
        Math.round(host.radius * (LOW_OVER - 1)) + ' km of the ground';
      if (!(rates.ferry > 0)) return 'no shuttle in her bay to ferry the crates down';
      if (!claimed(G, starOf(G, sys), host, t)) return 'you hold no claim on ' + host.name + ' - file one first';
      var spot = Sim.landSpot(host, sys, t, s.pos);
      var ground = V.add(hp, Sim.surfaceOffset(host, spot, t).pos);
      for (i = 0; i < ports.length; i++) {
        if (!ports[i].surface || ports[i].parentBody !== host) continue;
        if (V.dist(Sim.bodyPosition(ports[i], sys, t), ground) < MIN_PAD_KM) return 'too close to ' + ports[i].name;
      }
    } else {
      if (alt < host.radius * 1.02) return 'too low: an orbit through here would graze ' + host.name;
      for (i = 0; i < ports.length; i++) {
        if (ports[i].surface) continue;
        if (V.dist(Sim.bodyPosition(ports[i], sys, t), s.pos) < MIN_PORT_KM) return 'too close to ' + ports[i].name +
          ' - stand ' + MIN_PORT_KM + ' km clear of any port';
      }
    }
    var star = starOf(G, sys), mine = list(G);
    for (i = 0; i < mine.length; i++) {
      if (mine[i].star !== star) continue;
      var ss = siteState(mine[i], sys, t);
      if (ss && V.dist(ss.pos, s.pos) < MIN_PORT_KM) return 'too close to your own ' + mine[i].name;
    }
    if (L && L.needed(sys) && !L.holds(G, sys) && !((G.forgedBlanks || 0) > 0)) {
      return 'no licence for this system - ' + (L.refusal(G, sys) || 'buy one on the authority channel');
    }
    return null;
  }

  /* A circular orbit through where she is, in the plane she is moving in. */
  function circularHere(pos, vel, host, hs, mu, t) {
    var r = V.sub(pos, hs.pos), v = V.sub(vel, hs.vel);
    var h = V.cross(r, v);
    if (V.len(h) < 1e-9 * V.len(r)) h = V.cross(r, Math.abs(r.z) < 0.9 * V.len(r) ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 });
    var R = V.len(r);
    var vc = V.scale(V.norm(V.cross(V.norm(h), r)), Math.sqrt(mu / R));
    var el = K.elementsFromState(r, vc, mu);
    var n = Math.sqrt(mu / (el.a * el.a * el.a));
    return { parent: host.id, a: el.a, e: el.e, inc: el.inc, lan: el.lan, argp: el.argp,
             m0: el.m - n * t };
  }

  /* ---- the tug you leave her in ---------------------------------------------- */
  function boardTug(G, st, loadout) {
    var s = G.ship, Cm = global.Combat, H = Cm && Cm.HULLS;
    var pick = loadout.craft.indexOf('tug') >= 0 ? 'tug' : 'tugM';
    var hullId = (pick === 'tugM' && H && H.heavytug) ? 'heavytug' : 'bollard';
    var h = H[hullId];
    s.disguise = null;
    s.hullId = hullId;
    s.bornId = null;
    s.dryMass = h.dryMass; s.thrustKN = h.thrustKN;
    s.thrusterCap = h.thrusterCap; s.thrusterFuel = h.thrusterCap;
    s.fuelCap = h.fuelCap; s.fuel = h.fuelCap;
    s.cargoCap = h.cargoCap;
    s.hullMax = h.hullMax; s.hullHp = h.hullMax;
    s.fit = Cm.outfitOver ? Cm.outfitOver(hullId, {}).fit : {};
    s.groups = {};
    s.cargo = {};
    s.modules = [];
    s.crew = [];
    s.passengers = 0;
    s.shipName = st.crawler.name ? st.crawler.name + '\'s tug' : 'Station tug';
    s.reg = null;
    s.paint = null;
    s.livery = st.crawler.livery || null;
    s.liveryFaction = st.crawler.liveryFaction || null;
    s.craftBay = null;
    s.arms = null; s.armLoad = 0;
    s.tugOf = st.id;
    if (Cm.addHullStandard) Cm.addHullStandard(s);
    if (Cm.syncLegacy) Cm.syncLegacy(s);
    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
    return { hullId: hullId, craft: pick };
  }

  /* ---- founding ------------------------------------------------------------ */
  var STEMS = { market: 'Exchange', refinery: 'Works', skimmer: 'Skimworks', mining: 'Orehead',
                hab: 'Hab', shipyard: 'Yard' };
  function nameFor(G, type, host) {
    var n = list(G).length;
    return host.name + ' ' + (STEMS[type] || 'Station') + (n ? ' ' + (n + 1) : '');
  }

  function found(G, sys, t, kind, hooks, opts) {
    kind = kind === 'surface' ? 'surface' : 'orbital';
    var why = refusal(G, sys, t, kind);
    if (why) return { ok: false, why: why };
    var s = G.ship, Cn = C(), Sim = global.Sim, L = global.Licence;
    var lic = L ? L.forFounding(G, sys, t, hooks) : { ok: true, none: true };
    if (!lic.ok) return { ok: false, why: lic.why };
    var aboard = Cn.aboard(s);
    var ids = aboard.map(function (a) { return a.crateId; });
    var type = typeFor(ids);
    var loadout = Cn.loadoutOf(s);
    var rates = Cn.craftRates(loadout);
    var host = Sim.dominantBody(s.pos, sys, t);
    var hs = Sim.bodyState(host, sys, t);
    var star = starOf(G, sys);
    G.stations = G.stations || [];
    var id = 'st' + Math.round(t) + '-' + G.stations.length;
    /* The tug you take is off her shift. */
    var took = loadout.craft.indexOf('tug') >= 0 ? 'tug' : 'tugM';
    var crewRates = { unpack: Math.max(0, rates.unpack - Cn.CRAFT[took].unpack), ferry: rates.ferry };
    var st = {
      id: id, name: (opts && opts.name) || nameFor(G, type.id, host),
      star: star, starName: G.here ? G.here.name : null,
      type: type.id, typeName: type.name, kind: kind,
      host: host.id, hostName: host.name,
      crates: ids, recs: aboard.map(function (a) { return a.id; }),
      order: crewOrder(ids), rates: crewRates, bay: loadout.id,
      startedAt: t, hand: {}, held: null,
      announced: false, seized: false, seizedBy: null,
      licence: lic.none ? null : { fac: lic.rec.fac, forged: !!lic.rec.forged },
      faction: (lic.rec && lic.rec.fac) || (sys.ports && sys.ports[0] && sys.ports[0].faction) || null,
      crawler: { name: s.shipName || null, reg: s.reg || null, livery: s.livery || null,
                 liveryFaction: s.liveryFaction || null, paint: s.paint || null },
      crew: (s.crew || []).slice(),
      stock: {}
    };
    for (var c in (s.cargo || {})) if (s.cargo[c] > 0) st.stock[c] = s.cargo[c];
    if (kind === 'surface') {
      st.at = Sim.landSpot(host, sys, t, s.pos);
      st.at.elevation = 0;
      st.parkOrbit = circularHere(s.pos, s.vel, host, hs, host.mu, t);
    } else {
      st.orbit = circularHere(s.pos, s.vel, host, hs, host.mu + V.G * PORT_MASS, t);
    }
    /* Her crates are hers now, not freight. */
    (G.stationModules || []).forEach(function (r) {
      if (st.recs.indexOf(r.id) >= 0) { r.aboard = false; r.station = id; r.star = star; }
    });
    G.stations.push(st);
    var tug = boardTug(G, st, loadout);
    /* You are in her tug, alongside her. */
    var cs = crawlerState(st, sys, t);
    if (cs) {
      s.pos = V.add(cs.pos, { x: 0, y: 0, z: 0.35 });
      s.vel = V.clone(cs.vel);
    }
    var days = (opensAt(st) - t) / DAY;
    var line = st.name + ' founded - a ' + type.name.toLowerCase() + (kind === 'surface' ? ' on ' : ' over ') +
      host.name + '. Her crew opens her in ' + days.toFixed(1) + ' days; every crate you carry in yourself is in at once.';
    say(hooks, line, 10);
    journal(G, line);
    return { ok: true, st: st, tug: tug, days: days, forged: !!lic.forged };
  }

  /* ---- the port she becomes --------------------------------------------- */
  function makePort(st, sys) {
    var Gen = global.Gen, RNG = global.RNG, Eco = global.Economy, host = hostOf(st, sys);
    if (!Gen || !Gen.attachPort || !host) return null;
    var port;
    if (st.kind === 'surface' && Gen.makeSurfacePort) {
      port = Gen.makeSurfacePort(host, new RNG('ps-pad|' + st.id), 0, null, false);
      port.lat = st.at.lat; port.lon = st.at.lon;
    } else {
      port = { kind: 'station', type: 'station', typeName: 'Station',
               mass: PORT_MASS, radius: STATION_RADIUS_KM, color: '#e8d9a8',
               docking: true, dockCaptureRadius: Math.max(1.2, STATION_RADIUS_KM * 4), dockMaxSpeed: 0.006,
               orbit: { parent: st.orbit.parent, a: st.orbit.a, e: st.orbit.e, inc: st.orbit.inc,
                        lan: st.orbit.lan, argp: st.orbit.argp, m0: st.orbit.m0 },
               children: [] };
    }
    port.id = portId(st);
    port.name = st.name;
    port.player = !st.seized;
    port.playerStation = st.id;
    port.forceRole = ROLE_FOR[st.type] || 'orbital';
    port.faction = st.seized ? (st.seizedBy || st.faction) : st.faction;
    Gen.attachPort(sys, host, port);
    if (Eco && Eco.buildPortMarket) {
      Eco.buildPortMarket(port, host, sys, new RNG('ps-market|' + st.id));
      port.market.roleName = st.typeName;
      if (st.type === 'skimmer') port.plant = 'skimmer';
      else if (st.type === 'refinery') port.plant = 'refinery';
    }
    if (Gen.dressPort) Gen.dressPort(sys, port, new RNG('ps-dress|' + st.id));
    port.livery = 'civ';
    if (Gen.addPortRoutes) Gen.addPortRoutes(sys, port, new RNG('ps-traffic|' + st.id), opensAt(st));
    return port;
  }

  /* Put every open station of this star into its system. Idempotent:
   * called each time main.js hands the system out. */
  function inject(G, sys, starId) {
    if (!sys || !sys.byId) return 0;
    var t = (G && G.t) || 0, n = 0;
    list(G).forEach(function (st) {
      if (st.star !== starId || !isOpen(st, t) || sys.byId[portId(st)]) return;
      if (makePort(st, sys)) n++;
    });
    return n;
  }

  /* Every frame in a system: she opens on the day, and a forgery is looked
   * at once a week. Cheap - one pass over a short list. */
  function update(G, sys, t, hooks) {
    var star = starOf(G, sys), out = [];
    list(G).forEach(function (st) {
      if (!st.announced && isOpen(st, t)) {
        st.announced = true;
        var line = st.name + ' is open - her berths, her market and her first ships out' +
          (st.starName ? ', ' + st.starName : '');
        out.push(line);
        say(hooks, line, 10);
        journal(G, line);
      }
    });
    if (sys && sys.byId && inject(G, sys, star) && G.orbitPaths) {
      list(G).forEach(function (st) {
        var p = sys.byId[portId(st)];
        if (p && p.orbit && !G.orbitPaths[p.id]) G.orbitPaths[p.id] = K.samplePath(p.orbit, 96);
      });
    }
    var L = global.Licence, mine = list(G).filter(function (st) {
      return st.star === star && !st.seized && st.licence && st.licence.forged;
    });
    if (L && mine.length) {
      var r = L.tick(G, sys, t, hooks);
      if (r === 'due') mine.forEach(function (st) { seize(G, sys, st, hooks); out.push(st.name + ' seized'); });
      else if (r === null) mine.forEach(function (st) { st.licence.forged = false; });   // regularised
    }
    return out;
  }

  function seize(G, sys, st, hooks) {
    if (st.seized) return;
    st.seized = true;
    st.seizedBy = (st.licence && st.licence.fac) || st.faction;
    var p = sys && sys.byId && sys.byId[portId(st)];
    if (p) { p.player = false; p.faction = st.seizedBy; }
    var L = global.Licence, rec = L && L.rec(G, sys);
    if (rec && rec.forged && G.licences) delete G.licences[starOf(G, sys)];
    var line = st.name + ' is seized under the licensing law - she flies their flag now, not yours';
    say(hooks, line, 12);
    journal(G, line);
  }

  function mineAt(G, port) { return port && port.playerStation ? byId(G, port.playerStation) : null; }
  function owns(G, port) { var st = mineAt(G, port); return !!st && !st.seized; }

  var Stations = {
    DAY: DAY, MIN_PORT_KM: MIN_PORT_KM, MIN_PAD_KM: MIN_PAD_KM, INSTALL_KM: INSTALL_KM,
    FLOAT_RING_KM: FLOAT_RING_KM, ROLE_FOR: ROLE_FOR, LOW_OVER: LOW_OVER,
    list: list, byId: byId, portId: portId,
    crewOrder: crewOrder, cubesOf: cubesOf, schedule: schedule, opensAt: opensAt, isOpen: isOpen,
    cratesIn: cratesIn, siteState: siteState, crawlerState: crawlerState, crawlerPose: crawlerPose,
    floatingCrates: floatingCrates, cratesHere: cratesHere, buildingHere: buildingHere,
    installByHand: installByHand, atFrame: atFrame,
    typeFor: typeFor, nearestType: nearestType, refusal: refusal, found: found,
    makePort: makePort, inject: inject, update: update, seize: seize, mineAt: mineAt, owns: owns
  };
  global.Stations = Stations;
  if (typeof module !== 'undefined' && module.exports) module.exports = Stations;
})(typeof window !== 'undefined' ? window : globalThis);
