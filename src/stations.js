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
  /* SHE IS HER CRAWLER (Astra, 2026-10-31): drawn as the Crawler with her
   * crates in her cubes, and docked in her belly hangar (render.js
   * crawlerPortLib). One station unit is her length, 478 m. */
  var STATION_RADIUS_KM = 0.478;

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
  /* A SURFACE STATION HAS TWO HALVES (Astra, 2026-10-31: "She stays up as
   * the orbital half"). The Crawler has no gear, so she stays on her
   * parking orbit over the pad as the station's up-port - you dock in her
   * belly as at any station of yours - and the ground port below is the
   * other half. One station, one account, one market (the two ports share
   * the market object); her own shuttle runs between them as a local
   * route. */
  function upId(st) { return portId(st) + '-up'; }
  function portIds(st) { return st.kind === 'surface' ? [portId(st), upId(st)] : [portId(st)]; }
  function portsOf(sys, st) {
    var out = [];
    if (!sys || !sys.byId) return out;
    portIds(st).forEach(function (id) { if (sys.byId[id]) out.push(sys.byId[id]); });
    return out;
  }

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

  /* When each crate goes in, and when she opens.
   *
   * UPGRADES (2026-10-31, Astra: "Another Crawler hauls them"): a crate
   * another Crawler unloads for her later joins the end of the same queue
   * the day it arrives (`st.added`, by index into st.crates), and her crew
   * fits it at the same rate - or you carry it in. She OPENS on her
   * founding crates alone (`st.foundN`); an upgrade only adds. */
  function schedule(st) {
    var rate = st.rates.unpack, ferry = st.rates.ferry;
    var surface = st.kind === 'surface';
    var foundN = st.foundN || st.crates.length;
    var out = {}, tUnpack = st.startedAt, tDown = st.startedAt, last = st.startedAt;
    var hand = st.hand || {};
    var jobs = st.order.map(function (i) { return { i: i, ready: st.startedAt }; })
      .concat((st.added || []).map(function (a) { return { i: a.idx, ready: a.at }; }));
    jobs.forEach(function (j) {
      var i = j.i;
      if (hand[i] !== undefined) { out[i] = hand[i]; if (i < foundN) last = Math.max(last, hand[i]); return; }
      var cu = cubesOf(st.crates[i]);
      tUnpack = Math.max(tUnpack, j.ready) + (rate > 0 ? cu / rate * DAY : Infinity);
      var tIn = tUnpack;
      if (surface) { tDown = Math.max(tDown, tUnpack) + (ferry > 0 ? cu / ferry * DAY : Infinity); tIn = tDown; }
      out[i] = tIn;
      if (i < foundN) last = Math.max(last, tIn);
    });
    return { crateIn: out, opensAt: last };
  }
  /* Upgrade crates fitted by time t, counted by kind. */
  function fitted(st, t) {
    var sch = schedule(st), foundN = st.foundN || st.crates.length, n = {};
    for (var i = foundN; i < st.crates.length; i++) if (t >= sch.crateIn[i]) n[st.crates[i]] = (n[st.crates[i]] || 0) + 1;
    return n;
  }
  /* Crates still to go in (any, founding or upgrade). */
  function pending(st, t) {
    var sch = schedule(st), n = 0;
    for (var i = 0; i < st.crates.length; i++) if (t < sch.crateIn[i]) n++;
    return n;
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
      if (st.star === star && pending(st, t)) out = out.concat(floatingCrates(st, sys, t));
    });
    return out;
  }
  /* Founded here and not open yet. */
  function buildingHere(G, sys, t) {
    var star = starOf(G, sys);
    return list(G).filter(function (st) { return st.star === star && !st.seized && !isOpen(st, t); });
  }
  /* Founded here with crates still floating: building, or taking an upgrade. */
  function workHere(G, sys, t) {
    var star = starOf(G, sys);
    return list(G).filter(function (st) { return st.star === star && !st.seized && pending(st, t) > 0; });
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
    var cm = crewMul(s.crew);
    var crewRates = { unpack: Math.max(0, rates.unpack - Cn.CRAFT[took].unpack) * cm, ferry: rates.ferry * cm };
    var st = {
      id: id, name: (opts && opts.name) || nameFor(G, type.id, host),
      star: star, starName: G.here ? G.here.name : null,
      type: type.id, typeName: type.name, kind: kind,
      host: host.id, hostName: host.name,
      crates: ids, recs: aboard.map(function (a) { return a.id; }),
      order: crewOrder(ids), rates: crewRates, bay: loadout.id, foundN: ids.length, added: [],
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
    st.seedKey = siteKey(star, host.id, kind, type.id, kind === 'surface' ? st.at : st.orbit);
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
    var port = portFor(st, host);
    Gen.attachPort(sys, host, port);
    if (Eco && Eco.buildPortMarket) {
      Eco.buildPortMarket(port, host, sys, new RNG('ps-market|' + seedOf(st)));
      port.market.roleName = st.typeName;
      if (st.type === 'skimmer') port.plant = 'skimmer';
      else if (st.type === 'refinery') port.plant = 'refinery';
    }
    if (Gen.dressPort) Gen.dressPort(sys, port, new RNG('ps-dress|' + seedOf(st)));
    port.livery = 'civ';
    /* The orbital half, before the routes: her shuttle's run down to the
     * pad is a local hop like any two ports over one world. */
    if (st.kind === 'surface') {
      var up = upPortFor(st, host);
      Gen.attachPort(sys, host, up);
      up.market = port.market;
      if (Gen.dressPort) Gen.dressPort(sys, up, new RNG('ps-dress-up|' + seedOf(st)));
      up.livery = 'civ';
    }
    if (Gen.addPortRoutes) Gen.addPortRoutes(sys, port, new RNG('ps-traffic|' + seedOf(st)), opensAt(st));
    /* Her books, from what she has just become; and dark if she was. */
    takeBooks(st, port, sys, opensAt(st));
    sellStock(st, port, opensAt(st));
    applyLight(null, sys, st);
    applyUpgrades(null, sys, st, opensAt(st));
    if (st.racketHere === undefined) st.racketHere = racketApplies({}, sys);
    return port;
  }
  /* The body she is, not yet in any system. */
  function portFor(st, host) {
    var Gen = global.Gen, RNG = global.RNG;
    var port;
    if (st.kind === 'surface' && Gen.makeSurfacePort) {
      port = Gen.makeSurfacePort(host, new RNG('ps-pad|' + seedOf(st)), 0, null, false);
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
    port.crawlerLivery = (st.crawler && st.crawler.livery) || null;
    port.crawlerCrates = st.crates.slice(0, st.foundN || st.crates.length);
    return port;
  }

  /* The up-port: the Crawler on her parking orbit over the pad. */
  function upPortFor(st, host) {
    var o = st.parkOrbit;
    var up = { kind: 'station', type: 'station', typeName: 'Station',
               mass: PORT_MASS, radius: STATION_RADIUS_KM, color: '#e8d9a8',
               docking: true, dockCaptureRadius: Math.max(1.2, STATION_RADIUS_KM * 4), dockMaxSpeed: 0.006,
               orbit: { parent: o.parent, a: o.a, e: o.e, inc: o.inc, lan: o.lan, argp: o.argp, m0: o.m0 },
               children: [] };
    up.id = upId(st);
    up.name = st.name + ' Orbital';
    up.player = !st.seized;
    up.playerStation = st.id;
    up.upHalf = true;
    up.forceRole = ROLE_FOR[st.type] || 'orbital';
    up.faction = st.seized ? (st.seizedBy || st.faction) : st.faction;
    up.crawlerLivery = (st.crawler && st.crawler.livery) || null;
    up.crawlerCrates = st.crates.slice(0, st.foundN || st.crates.length);
    return up;
  }

  /* HER SEED IS HER SITE. What her market, her dressing and her traffic
   * draw comes from where she stands and what she is - the world, orbit or
   * ground, her type, her height to 50 km or her spot to two degrees - not
   * from when she was founded. So the forecast for a site and the station
   * founded there are the same station. */
  function siteKey(star, hostId, kind, type, el) {
    var where = kind === 'surface'
      ? 'g' + Math.round(el.lat * 90 / Math.PI) + ',' + Math.round(el.lon * 90 / Math.PI)
      : 'o' + Math.round(el.a / 50);
    return star + '|' + hostId + '|' + kind + '|' + type + '|' + where;
  }
  function seedOf(st) { return st.seedKey || st.id; }

  /* ---- will she pay? (agreed 2026-10-15) ---------------------------------
   * "The player needs ship software that tells them where a station would
   * run at a loss." Markets, traffic and berths are pure functions, so the
   * station she WOULD be - here, of the type her crates make - is put
   * through the same code as the real one and her books read off it. Not
   * a guess: what the game would do. Built in a shadow of the system (its
   * own lists, the real bodies), and the deliveries her routes would
   * register at other ports are taken back out, so asking changes nothing.
   * It cannot see the future: a blockade, a takeover, a rival station. */
  function forecastSite(G, sys, t, kind) {
    kind = kind === 'surface' ? 'surface' : 'orbital';
    var s = G.ship, Cn = C(), Sim = global.Sim, Gen = global.Gen, Eco = global.Economy, RNG = global.RNG;
    if (!Cn || !Cn.isCrawler(s) || !Gen || !Eco || !Sim || !s.pos) return null;
    var ids = Cn.aboard(s).map(function (a) { return a.crateId; });
    var type = typeFor(ids);
    if (!type) return null;
    var host = Sim.dominantBody(s.pos, sys, t);
    if (!worldOk(host) || (kind === 'surface' && !landable(host))) return null;
    var hs = Sim.bodyState(host, sys, t);
    var st = { id: 'forecast', name: 'Forecast', type: type.id, typeName: type.name, kind: kind, host: host.id,
               crates: ids, order: crewOrder(ids), rates: { unpack: 1, ferry: 1 }, startedAt: t, hand: {},
               crew: (s.crew || []).slice(), stock: {} };
    if (kind === 'surface') {
      st.at = Sim.landSpot(host, sys, t, s.pos); st.at.elevation = 0;
      st.parkOrbit = circularHere(s.pos, s.vel, host, hs, host.mu, t);
    } else {
      st.orbit = circularHere(s.pos, s.vel, host, hs, host.mu + V.G * PORT_MASS, t);
    }
    st.seedKey = siteKey(starOf(G, sys), host.id, kind, type.id, kind === 'surface' ? st.at : st.orbit);
    var ports = sys.ports || [];
    var saved = ports.map(function (q) { return q.market && q.market.inbound ? q.market.inbound.length : 0; });
    var shadow = Object.create(sys);
    shadow.byId = Object.assign({}, sys.byId);
    shadow.ports = ports.slice();
    shadow.traffic = [];
    var port = portFor(st, host);
    port.id = 'ps-forecast';
    port.parentBody = host; port.depth = (host.depth || 0) + 1; port.mu = V.G * port.mass;
    shadow.byId[port.id] = port;
    shadow.ports.push(port);
    try {
      Eco.buildPortMarket(port, host, shadow, new RNG('ps-market|' + seedOf(st)));
      if (kind === 'surface') {
        var upF = upPortFor(st, host);
        upF.id = 'ps-forecast-up';
        upF.parentBody = host; upF.depth = port.depth; upF.mu = V.G * upF.mass;
        upF.market = port.market;
        shadow.byId[upF.id] = upF;
        shadow.ports.push(upF);
      }
      if (Gen.addPortRoutes) Gen.addPortRoutes(shadow, port, new RNG('ps-traffic|' + seedOf(st)), t);
      takeBooks(st, port, shadow, t);
    } finally {
      ports.forEach(function (q, i) { if (q.market && q.market.inbound) q.market.inbound.length = saved[i]; });
    }
    var f = forecast(st);
    f.type = type.name;
    return f;
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
        /* Both halves of a surface station: the Crawler up top has an orbit. */
        portsOf(sys, st).forEach(function (p) {
          if (p.orbit && !G.orbitPaths[p.id]) G.orbitPaths[p.id] = K.samplePath(p.orbit, 96);
        });
      });
    }
    /* Her week, wherever you are: money moves by wire. */
    settle(G, t, hooks).forEach(function (l) { out.push(l); });
    var rh = racketApplies(G, sys);
    list(G).forEach(function (st) { if (st.star === star) { st.racketHere = rh; applyLight(G, sys, st); applyUpgrades(G, sys, st, t); } });
    defend(G, sys, t, hooks);
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
    portsOf(sys, st).forEach(function (q) { q.player = false; q.faction = st.seizedBy; });
    var L = global.Licence, rec = L && L.rec(G, sys);
    if (rec && rec.forged && G.licences) delete G.licences[starOf(G, sys)];
    var line = st.name + ' is seized under the licensing law - she flies their flag now, not yours';
    say(hooks, line, 12);
    journal(G, line);
  }

  /* ---- her books (2026-10-31) ------------------------------------------
   * Astra chose the agreed design whole: she earns from her traffic, pays
   * her crew, her upkeep and her reactor every week, and every port in the
   * game now burns fissiles (economy.js reactorDark), hers included.
   *
   * BOOKS ARE TAKEN WHEN SHE IS PUT INTO HER SYSTEM (makePort), so a week
   * settles without regenerating anything: the value her market moves a
   * day (everything bought and sold, both ways - a trading station earns
   * on throughput, not on a surplus), the ships that berth with her a
   * week, the tonnes her reactor burns a day and what a tonne costs at
   * her own desk. Seed-constant, like a plant's.
   *
   *   income   market: MARGIN x the square root of what crosses her floor
   *                    a day, a week. A root, not a share: measured over 35
   *                    sites a type (tools/measure-stations.cjs), a straight
   *                    share made a hab ring at a rich highport world pay
   *                    four times a market hall's, and sites a market
   *                    station could live on pay nothing. The root keeps
   *                    the order (a busy world pays more) and the spread
   *                    sane.
   *            berths: visits a week x BERTH_FEE
   *   costs    wages:  her crew's day rates x 7 (crew.js)
   *            upkeep: UPKEEP_SHARE of what her crates and her hull cost
   *            reactor: burned from her tank; what the tank cannot cover
   *                     is bought at her own fissile price
   *
   * HER ACCOUNT holds a float (RESERVE) for fuel; anything over it is wired
   * to you at the week's end, wherever you are. A week she cannot pay goes
   * on her account as arrears. SLOW AND LOUD: told every week it is owed,
   * then foreclosed after FORECLOSE_WEEKS weeks of it - she goes to the
   * licensing power (the local government in pirate space), keeps running,
   * and pays you nothing. Pay it in at any desk to stop it.
   *
   * DARK: her tank empty and nothing to buy fuel with. Her market closes,
   * her own traffic stops calling, and she earns nothing - while her crew
   * and her upkeep still cost. Fuel her (from your hold, at her desk) or
   * pay her account up, and she lights again. */
  var WEEK = 7 * DAY;
  var MARGIN = 88;                // cr a week per root-cr a day of throughput
  var BERTH_FEE = 300;
  var UPKEEP_SHARE = 0.002;        // of her build cost, a week
  var RESERVE = 25000;             // cr kept on her account for fuel
  var TANK_WEEKS = 6;              // she keeps this much burn in her tank
  var OPEN_TANK_WEEKS = 2;         // and opens with this much: the Crawler's own
  var FORECLOSE_WEEKS = 8;
  var CRAWLER_PRICE = 450000;

  function buildCost(st) {
    var Cn = C(), cr = CRAWLER_PRICE;
    (st.crates || []).forEach(function (id) { var c = Cn.BY_ID[id]; if (c) cr += c.price; });
    return cr;
  }
  function takeBooks(st, port, sys, t) {
    var Eco = global.Economy;
    /* What crosses her floor a day, both ways, at her own prices: a
     * trading station earns on throughput, not on a surplus. Waste left
     * out, as a plant's books leave it out. */
    var gross = 0, rows = (port.market && port.market.rows) || {};
    for (var cid in rows) {
      var c = Eco && Eco.BY_ID ? Eco.BY_ID[cid] : null;
      if (!c || c.waste) continue;
      gross += (rows[cid].prod + rows[cid].cons) * c.base * rows[cid].local;
    }
    var visits = 0;
    (sys.traffic || []).forEach(function (r) {
      /* Her own shuttle between her two halves pays her no berth fee. */
      if (r.playerPort === port.id && r.period > 0 && !(sys.byId[r.to] && sys.byId[r.to].playerStation === port.playerStation)) {
        visits += WEEK / r.period;
      }
    });
    var fp = null;
    try { fp = Eco && Eco.price ? Eco.price(port, 'fissile', t) : null; } catch (e) { fp = null; }
    var fisBase = Eco && Eco.BY_ID && Eco.BY_ID.fissile ? Eco.BY_ID.fissile.base : 980;
    st.books = {
      trade: gross,
      visits: visits,
      burn: (port.market && port.market.reactor) || 0,
      fuelPrice: (fp && fp.buy) || fisBase,
      at: t
    };
    if (st.tank === undefined) {
      st.tank = st.books.burn * 7 * OPEN_TANK_WEEKS + ((st.stock && st.stock.fissile) || 0);
      if (st.stock) delete st.stock.fissile;
    }
    if (st.paidTo === undefined) st.paidTo = opensAt(st);
    if (st.balance === undefined) st.balance = 0;
    return st.books;
  }
  /* Her crew from the Crawler at their own day rates, and the staff each
   * crate takes to run: an L hall six people, an M module three, an S
   * fitting one, at a station hand's day rate. */
  var STAFF = { XL: 10, L: 6, M: 3, S: 1 };
  var STAFF_DAY = 60;
  function staffOf(st) {
    var Cn = C(), n = 0;
    (st.crates || []).forEach(function (id) { var c = Cn.BY_ID[id]; if (c) n += STAFF[c.size] || 0; });
    return n;
  }
  function wagesWeek(st) {
    var Cw = global.Crew, d = staffOf(st) * STAFF_DAY;
    (st.crew || []).forEach(function (p) {
      var w = Cw && Cw.dailyWage ? Cw.dailyWage(p) : NaN;
      d += isFinite(w) ? w : 60;           // a record with no rating: a hand's rate
    });
    return Math.round(d * 7);
  }
  function upkeepWeek(st) { return Math.round(buildCost(st) * UPKEEP_SHARE); }
  function incomeWeek(st) {
    var b = st.books;
    if (!b) return { market: 0, berths: 0 };
    return { market: Math.round(MARGIN * Math.sqrt(Math.max(0, b.trade)) * incomeMul(st)),
             berths: Math.round(b.visits * BERTH_FEE * relayMul(st)) };
  }
  /* What a week looks like, from her books, before fuel. */
  function forecast(st) {
    var inc = incomeWeek(st), w = wagesWeek(st), u = upkeepWeek(st);
    var b = st.books || { burn: 0, fuelPrice: 0 };
    var fuel = Math.round(b.burn * 7 * b.fuelPrice);
    return { market: inc.market, berths: inc.berths, wages: w, upkeep: u, fuel: fuel,
             net: inc.market + inc.berths - w - u - fuel, burnWeek: b.burn * 7 };
  }
  function tankWeeks(st) {
    var bw = st.books ? st.books.burn * 7 : 0;
    return bw > 0 ? (st.tank || 0) / bw : Infinity;
  }

  /* Whole weeks since she was last settled, oldest first. */
  function settleOne(G, st, t, hooks) {
    if (!st.books || st.seized || !isOpen(st, t)) return null;
    var weeks = Math.floor((t - st.paidTo) / WEEK);
    if (!(weeks > 0)) return null;
    var tot = { income: 0, costs: 0, fuelBought: 0, wired: 0, dark: 0, weeks: weeks };
    var b = st.books;
    tot.racket = 0; tot.sabotaged = 0; tot.warned = false;
    for (var w = 0; w < weeks; w++) {
      var lit = !st.dark;
      var inc = incomeWeek(st);
      var income = lit ? inc.market + inc.berths : 0;
      /* THE SYNDICATE'S CUT (racketWeek): paid, or refused - and a refused
       * week may be a sabotaged one, which earns nothing. */
      var rk = racketWeek(G, st, income, st.paidTo + (w + 1) * WEEK);
      if (rk.sabotaged) { income = 0; tot.sabotaged++; }
      if (rk.warned) tot.warned = true;
      tot.racket += rk.paid;
      var costs = wagesWeek(st) + upkeepWeek(st);
      st.balance += income - costs - rk.paid;
      tot.income += income; tot.costs += costs;
      if (rk.taken) { takenBySyndicate(G, st, hooks); break; }
      /* The reactor: burn from the tank, then buy it back up. */
      var need = b.burn * 7;
      st.tank = Math.max(0, (st.tank || 0) - need);
      var want = Math.max(0, b.burn * 7 * tankWeeksCap(st) - st.tank);
      var can = b.fuelPrice > 0 ? Math.max(0, st.balance) / b.fuelPrice : 0;
      var buy = Math.min(want, can);
      if (buy > 0) {
        st.tank += buy;
        st.balance -= buy * b.fuelPrice;
        tot.fuelBought += buy * b.fuelPrice;
      }
      st.dark = st.tank < need * 0.25 && b.burn > 0;
      if (st.dark) tot.dark++;
      /* Over the float, to you. Under nothing, arrears. */
      if (st.balance > RESERVE) {
        var wire = st.balance - RESERVE;
        if (G.ship) G.ship.credits += wire;
        tot.wired += wire;
        st.balance = RESERVE;
      }
      st.owingWeeks = st.balance < 0 ? (st.owingWeeks || 0) + 1 : 0;
      if (st.owingWeeks >= FORECLOSE_WEEKS) { foreclose(G, st, hooks); break; }
    }
    st.paidTo += weeks * WEEK;
    st.lastWeek = { at: t, income: Math.round(tot.income / weeks), costs: Math.round(tot.costs / weeks),
                    fuel: Math.round(tot.fuelBought / weeks), wired: Math.round(tot.wired), weeks: weeks };
    var counting = st.racketHere && st.racket && !st.racket.paying && st.racket.refused > 1;
    if (tot.warned || tot.sabotaged || counting) {
      /* Loud every week they are counting, sabotaged or not. */
      var left = st.racket ? Math.max(0, takeWeeks(st) - st.racket.refused) : 0;
      var rl = st.takenBy && st.seized ? null
        : tot.sabotaged ? st.name + ': SABOTAGED by the Syndicate (' + tot.sabotaged + ' wk with nothing earned) - pay their cut, or they take her in ' +
          left + ' weeks'
        : counting ? st.name + ': the Syndicate is counting - their cut refused ' + st.racket.refused + ' weeks; they take her in ' + left
        : st.name + ': the Syndicate wants a quarter of her takings for protection. Pay it in INDUSTRY, or expect trouble.';
      if (rl) { say(hooks, rl, 12); journal(G, rl); }
    }
    var line = st.name + (st.seized ? (st.takenBy ? ' TAKEN' : ' FORECLOSED') : '') +
      ': ' + weeks + ' wk, in ' + Math.round(tot.income) + ' cr, out ' + Math.round(tot.costs + tot.fuelBought) +
      ' cr' + (tot.racket ? ', ' + Math.round(tot.racket) + ' cr to the Syndicate' : '') +
      (tot.wired ? ', ' + Math.round(tot.wired) + ' cr wired to you' : '') +
      (st.balance < 0 ? ', OWES ' + Math.round(-st.balance) + ' cr (' + st.owingWeeks + ' of ' + FORECLOSE_WEEKS + ' weeks to foreclosure)' : '') +
      (st.dark ? ', DARK - her reactor is out of fuel' : '');
    if (!st.seized && (st.balance < 0 || st.dark)) {
      say(hooks, line, 10);
      journal(G, line);
    }
    return line;
  }
  function settle(G, t, hooks) {
    var out = [];
    list(G).forEach(function (st) { var l = settleOne(G, st, t, hooks); if (l) out.push(l); });
    return out;
  }

  /* Foreclosed: to the licensing power, running, and nothing paid. */
  function foreclose(G, st, hooks) {
    if (st.seized) return;
    st.seized = true;
    st.foreclosed = true;
    st.seizedBy = (st.licence && st.licence.fac) || st.faction;
    var sys = sysOfStar(G, st.star);
    portsOf(sys, st).forEach(function (q) { q.player = false; q.faction = st.seizedBy; });
    var line = st.name + ' is FORECLOSED for ' + Math.round(-st.balance) + ' cr of arrears - she runs on under new owners';
    say(hooks, line, 12);
    journal(G, line);
  }

  /* ---- at her desk -------------------------------------------------------- */
  function dockedAt(G, st) {
    return !!(G.ship && portIds(st).indexOf(G.ship.docked) >= 0 && st.star === starOf(G, G.sys));
  }
  /* Fissiles from your hold into her reactor tank. Free: it is your fuel. */
  function fuelFromHold(G, st) {
    if (!st || st.seized) return { ok: false, why: 'not yours' };
    if (!dockedAt(G, st)) return { ok: false, why: 'dock at ' + st.name + ' to fuel her' };
    var have = (G.ship.cargo && G.ship.cargo.fissile) || 0;
    if (!(have > 0)) return { ok: false, why: 'no fissiles in your hold' };
    G.ship.cargo.fissile = 0;
    delete G.ship.cargo.fissile;
    st.tank = (st.tank || 0) + have;
    if (st.dark && st.books && st.tank >= st.books.burn * 7 * 0.25) st.dark = false;
    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(G.ship);
    return { ok: true, tonnes: have, weeks: tankWeeks(st) };
  }
  /* Credits from you onto her account: arrears first. Any desk - it is a
   * transfer, not a delivery. */
  function payIn(G, st, amount) {
    if (!st || st.seized) return { ok: false, why: 'not yours' };
    amount = Math.min(amount, (G.ship && G.ship.credits) || 0);
    if (!(amount > 0)) return { ok: false, why: 'no credits to pay in' };
    G.ship.credits -= amount;
    st.balance += amount;
    if (st.balance >= 0) st.owingWeeks = 0;
    /* Lit again if the account can now buy her a week. */
    if (st.dark && st.books && st.books.fuelPrice > 0) {
      var buy = Math.min(st.books.burn * 7 * tankWeeksCap(st), Math.max(0, st.balance) / st.books.fuelPrice);
      if (buy >= st.books.burn * 7 * 0.25) { st.tank += buy; st.balance -= buy * st.books.fuelPrice; st.dark = false; }
    }
    return { ok: true, paid: amount, balance: st.balance };
  }

  /* Dark or lit, in her system: her traffic and her market follow. */
  function applyLight(G, sys, st) {
    var p = sys && sys.byId && sys.byId[portId(st)];
    if (!p) return;
    var dark = !!st.dark && !st.seized;
    if (p.dark === dark) return;
    portsOf(sys, st).forEach(function (q) { q.dark = dark; });
    var Gen = global.Gen, RNG = global.RNG;
    if (dark) {
      sys.traffic = (sys.traffic || []).filter(function (r) { return r.playerPort !== p.id; });
      sys._traffic = null; sys._ships = null;
    } else if (Gen && Gen.addPortRoutes && !(sys.traffic || []).some(function (r) { return r.playerPort === p.id; })) {
      Gen.addPortRoutes(sys, p, new RNG('ps-traffic|' + seedOf(st)), opensAt(st));
    }
  }

  /* ---- upgrades: another Crawler brings them (2026-10-31) -----------------
   * Flying a loaded Crawler, berthed at your station or within UNLOAD_KM of
   * her, her crew's channel offers to unload her station crates for her.
   * They go into the ring and the queue (schedule), and the Crawler flies
   * on, empty. What a fitted crate does (applyUpgrades):
   *   Berth clamp    one more berth
   *   Warehouse      her shelves hold 30% more of everything
   *   Reactor pile   10% more trade through her (more power, a bigger floor)
   *   Fuel cell      three more weeks in her reactor tank
   * The rest are fitted and counted, and do nothing yet: the defence
   * battery's guns, the relay's early prices, a second defining crate's
   * second trade - each is its own slice, and the station screen says so. */
  var UNLOAD_KM = 20;
  var DOES = { berth: 'one more berth', warehouse: 'shelves hold 30% more', reactor: '10% more trade',
               fuelcell: 'three more weeks of reactor tank',
               battery: 'holds off the Syndicate\'s enforcers', relay: '15% more ships call',
               market: 'a second trade', refinery: 'a second trade', skimrig: 'a second trade',
               oreworks: 'a second trade', habring: 'a second trade', slipway: 'a second trade' };
  function unloadRefusal(G, sys, st, t) {
    var s = G.ship, Cn = C();
    if (!st || st.seized) return 'not yours';
    if (!Cn.isCrawler(s)) return 'only a Crawler carries station crates';
    if (!Cn.aboard(s).length) return 'her cubes hold no station crates';
    if (st.star !== starOf(G, sys)) return st.name + ' is in another system';
    if (!isOpen(st, t)) return st.name + ' is still being built';
    if (portIds(st).indexOf(s.docked) >= 0) return null;
    var cs = crawlerState(st, sys, t);
    if (!cs) return 'cannot find her';
    var d = V.dist(cs.pos, s.pos);
    if (d > UNLOAD_KM) return Math.round(d) + ' km from her - berth with her, or come within ' + UNLOAD_KM + ' km';
    return null;
  }
  function unloadTo(G, sys, st, t, hooks) {
    var why = unloadRefusal(G, sys, st, t);
    if (why) return { ok: false, why: why };
    var s = G.ship, Cn = C();
    var aboard = Cn.aboard(s);
    st.foundN = st.foundN || st.crates.length;
    st.added = st.added || [];
    aboard.forEach(function (a) {
      st.added.push({ idx: st.crates.length, at: t, rec: a.id });
      st.crates.push(a.crateId);
      (G.stationModules || []).forEach(function (r) { if (r.id === a.id) { r.aboard = false; r.station = st.id; r.star = st.star; } });
    });
    s.modules = [];
    if (Cn.applyCap) Cn.applyCap(s);
    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
    var line = aboard.length + ' crate' + (aboard.length === 1 ? '' : 's') + ' unloaded for ' + st.name +
      ' - her crew fits them, or carry them in with a tug\'s arms';
    say(hooks, line, 8);
    journal(G, line);
    return { ok: true, n: aboard.length };
  }
  /* The fitted upgrades, onto her port. Idempotent: keeps her base numbers. */
  function applyUpgrades(G, sys, st, t) {
    var p = sys && sys.byId && sys.byId[portId(st)];
    var n = fitted(st, t);
    st.fittedCounts = n;
    if (!p) return n;
    var key = JSON.stringify(n) + '|' + (st.crawlers || 1) + '|' + (st.seized ? 1 : 0);
    portsOf(sys, st).forEach(function (q) {
      q.xlYard = (st.crawlers || 1) >= 2 && typesOf(st, t).indexOf('shipyard') >= 0;
      q.crawlerCount = st.crawlers || 1;
    });
    if (p._upgradeKey === key) return n;
    p._upgradeKey = key;
    /* Her cubes show what is fitted: her founding crates and her upgrades
     * so far. A new load is a new model key (Render.crawlerPortKey), so
     * nothing cached against the old one is read again. */
    var foundN = st.foundN || st.crates.length, sch = schedule(st), shown = st.crates.slice(0, foundN);
    for (var ci = foundN; ci < st.crates.length; ci++) if (t >= sch.crateIn[ci]) shown.push(st.crates[ci]);
    portsOf(sys, st).forEach(function (q) { q.crawlerCrates = shown; });
    /* A SECOND DEFINING CRATE IS A SECOND TRADE: her founding type's
     * goods and the other's, both, on one floor. */
    addTrades(st, sys, t);
    /* Berth clamps are berths in her model (Render.crawlerPortLib counts
     * them off her crates), so the bay, the berth positions and the
     * capacity all agree. */
    if (p.market) {
      if (!p._baseCaps) { p._baseCaps = {}; for (var c in p.market.rows) p._baseCaps[c] = p.market.rows[c].cap; }
      for (var c2 in p.market.rows) p.market.rows[c2].cap = Math.round(p._baseCaps[c2] * (1 + 0.3 * (n.warehouse || 0)));
    }
    return n;
  }
  function incomeMul(st) { return 1 + 0.1 * ((st.fittedCounts && st.fittedCounts.reactor) || 0); }
  function tankWeeksCap(st) { return TANK_WEEKS + 3 * ((st.fittedCounts && st.fittedCounts.fuelcell) || 0); }

  /* ---- what the rest of her crates do (2026-10-31, "build all the
   * leftovers") -------------------------------------------------------------
   *
   *   Defence battery  guns that answer when somebody shoots at her. What
   *                    shoots at a station is the Syndicate's enforcers:
   *                    each battery takes a fifth off the odds of a
   *                    sabotaged week, and holds them off two more weeks
   *                    before they can take her.
   *   Comms relay      her prices and news go out sooner, so more ships
   *                    come: 15% more calls (and berth fees) each.
   *   A second         defining crate (fitted at founding or later): she
   *                    trades as both. Its trade's goods are added to her
   *                    floor as production (Economy.addProduction), and her
   *                    books are re-taken.
   *   Her freight      is on her shelves the day she opens, sold into her
   *                    own market at her prices onto her account.
   *   Her crew         from the Crawler know the work: each point of
   *                    rating is 3% on her crew's unpack and ferry rates,
   *                    to half again at most. */
  var DEFINES = { market: 'market', refinery: 'refinery', skimrig: 'skimmer', oreworks: 'mining',
                  habring: 'hab', slipway: 'shipyard' };
  var TYPE_NAME = { market: 'Market station', refinery: 'Refinery', skimmer: 'Skimmer station',
                    mining: 'Mining station', hab: 'Passenger hab', shipyard: 'Shipyard' };
  function crewMul(crew) {
    var r = 0;
    (crew || []).forEach(function (c) { r += (c && c.rating) || 0; });
    return Math.min(1.5, 1 + 0.03 * r);
  }
  function relayMul(st) { return 1 + 0.15 * ((st.fittedCounts && st.fittedCounts.relay) || 0); }
  function batteries(st) {
    var n = (st.fittedCounts && st.fittedCounts.battery) || 0;
    (st.crates || []).slice(0, st.foundN || st.crates.length).forEach(function (id) { if (id === 'battery') n++; });
    return n;
  }
  /* Her trades: her founding type first, then every other defining crate
   * she has in, founding or fitted. */
  function typesOf(st, t) {
    var out = [st.type], sch = schedule(st), foundN = st.foundN || st.crates.length;
    st.crates.forEach(function (id, i) {
      var ty = DEFINES[id];
      if (!ty || out.indexOf(ty) >= 0) return;
      if (i >= foundN && !(t >= sch.crateIn[i])) return;
      out.push(ty);
    });
    return out;
  }
  function typeName(st, t) {
    var ts = typesOf(st, t);
    if ((st.crawlers || 1) >= 2 && ts.indexOf('shipyard') >= 0) ts = ts.map(function (x) { return x === 'shipyard' ? 'shipyardXL' : x; });
    return ts.map(function (x) { return x === 'shipyardXL' ? 'XL shipyard' : (TYPE_NAME[x] || x); }).join(' & ');
  }
  function grossOf(port) {
    var Eco = global.Economy, gross = 0, rows = (port.market && port.market.rows) || {};
    for (var cid in rows) {
      var c = Eco && Eco.BY_ID ? Eco.BY_ID[cid] : null;
      if (!c || c.waste) continue;
      gross += (rows[cid].prod + rows[cid].cons) * c.base * rows[cid].local;
    }
    return gross;
  }
  function addTrades(st, sys, t) {
    var p = sys && sys.byId && sys.byId[portId(st)], Eco = global.Economy;
    if (!p || !p.market || !Eco || !Eco.addProduction || !Eco.ROLE_BY_ID) return;
    p._trades = p._trades || [st.type];
    var ts = typesOf(st, t), added = false;
    /* A trade's goods at what a busy row of hers moves already. */
    var flows = [];
    for (var c in p.market.rows) flows.push(p.market.rows[c].prod + p.market.rows[c].cons);
    flows.sort(function (a, b) { return a - b; });
    var flow = flows.length ? flows[Math.floor(flows.length * 0.75)] : 10;
    ts.forEach(function (ty) {
      if (p._trades.indexOf(ty) >= 0) return;
      var role = Eco.ROLE_BY_ID[ROLE_FOR[ty]];
      (role && role.bias || []).forEach(function (cid) { Eco.addProduction(p, cid, flow * 0.8); });
      p._trades.push(ty);
      added = true;
    });
    var nm = typeName(st, t);
    portsOf(sys, st).forEach(function (q) { if (q.market) q.market.roleName = nm; });
    if (added && st.books) st.books.trade = grossOf(p);
  }
  function sellStock(st, port, t) {
    var Eco = global.Economy;
    if (st.stockSold || !st.stock || !port.market || !Eco) return 0;
    var got = 0;
    for (var cid in st.stock) {
      var q = st.stock[cid];
      if (!(q > 0) || !port.market.rows[cid]) continue;
      var pr = null;
      try { pr = Eco.price(port, cid, t); } catch (e) { pr = null; }
      var each = pr && pr.sell ? pr.sell : (Eco.BY_ID[cid] ? Eco.BY_ID[cid].base : 0);
      got += q * each;
      if (Eco.applyTrade) Eco.applyTrade(port, cid, -q, t);
    }
    st.stockSold = true;
    st.stockValue = Math.round(got);
    st.balance = (st.balance || 0) + Math.round(got);
    return got;
  }

  /* ---- the Syndicate's protection (agreed 2026-10-15, built 2026-10-31) --
   * In a Syndicate hold, or anywhere corrupt enough (CORRUPT_RACKET), they
   * want a quarter of her takings. PAY: she runs, and nothing else happens.
   * REFUSE: slow and loud, like every way of losing her - the first week a
   * warning; after it, each week a chance her takings are sabotaged
   * (SABOTAGE, a fifth less for each Defence battery); and after
   * TAKE_WEEKS refused weeks (two more for each battery) they take her.
   * She runs on, theirs. Paying again stops the count but does not undo it. */
  var RACKET_CUT = 0.25, SABOTAGE = 0.5, TAKE_WEEKS = 6, CORRUPT_RACKET = 60;
  function takeWeeks(st) { return TAKE_WEEKS + 2 * batteries(st); }
  function racketApplies(G, sys) {
    var Ti = global.Tithe, H = global.Holdings, Cm = global.Combat;
    if (!sys) return false;
    if (Ti && Ti.held && Ti.held(sys)) return true;
    if (sys.heldBy === 'pirate') return false;          // bands run no rackets: they raid
    var corr = H && H.corruptionOf ? H.corruptionOf(G, sys, starOf(G, sys))
             : Cm && Cm.systemCorruption ? Cm.systemCorruption(G, sys) : (sys.corruption || 0);
    return corr >= CORRUPT_RACKET;
  }
  function racketRoll(st, wk) {
    var RNGc = global.RNG;
    var h = RNGc && RNGc.hashString ? RNGc.hashString('racket|' + st.id + '|' + Math.floor(wk / WEEK)) : (wk * 2654435761) >>> 0;
    return (h % 10000) / 10000;
  }
  function racketWeek(G, st, income, wkEnd) {
    var out = { paid: 0, sabotaged: false, warned: false, taken: false };
    if (!st.racketHere || st.seized) return out;
    st.racket = st.racket || { paying: false, refused: 0 };
    if (st.racket.paying) { out.paid = Math.round(income * RACKET_CUT); return out; }
    st.racket.refused++;
    if (st.racket.refused === 1) { out.warned = true; return out; }
    if (racketRoll(st, wkEnd) < Math.max(0, SABOTAGE - 0.2 * batteries(st))) out.sabotaged = true;
    if (st.racket.refused >= takeWeeks(st)) out.taken = true;
    return out;
  }
  function setPaying(G, st, paying) {
    if (!st || st.seized) return { ok: false, why: 'not yours' };
    st.racket = st.racket || { paying: false, refused: 0 };
    st.racket.paying = !!paying;
    if (paying) st.racket.refused = 0;
    return { ok: true, paying: st.racket.paying };
  }
  function takenBySyndicate(G, st, hooks) {
    if (st.seized) return;
    st.seized = true;
    st.takenBy = 'outlaw';
    st.seizedBy = 'outlaw';
    var sys = sysOfStar(G, st.star);
    portsOf(sys, st).forEach(function (q) { q.player = false; q.faction = 'outlaw'; });
    var line = st.name + ' is TAKEN by the Syndicate - you refused their cut for ' + st.racket.refused +
      ' weeks. She runs on under them; dock there to buy her back.';
    say(hooks, line, 12);
    journal(G, line);
  }

  /* ---- buying her back (story-spine beat C, at station scale) ------------
   * Whoever has her keeps her running, and sells her back for more than she
   * is worth: a quarter over what she cost, and whatever she owed. At her
   * own desk. Taken under the law (a forged licence, or foreclosure), the
   * law wants a real licence first; the Syndicate wants only the money. */
  var BUYBACK = 1.25;
  function buyBackPrice(st) { return Math.round(buildCost(st) * BUYBACK + Math.max(0, -(st.balance || 0))); }
  function buyBackRefusal(G, sys, st) {
    if (!st || !st.seized) return 'she is yours';
    if (!dockedAtAny(G, st)) return 'at her own desk - dock at ' + st.name;
    if (!st.takenBy) {
      var L = global.Licence, rec = L && L.rec(G, sys);
      if (L && L.needed(sys) && !(rec && !rec.forged)) return 'the law wants a real licence for this system first';
    }
    var price = buyBackPrice(st);
    if ((G.ship.credits || 0) < price) return (st.takenBy ? 'the Syndicate wants ' : 'the liquidator wants ') + price + ' cr';
    return null;
  }
  function dockedAtAny(G, st) {
    return !!(G.ship && portIds(st).indexOf(G.ship.docked) >= 0 && st.star === starOf(G, G.sys));
  }
  function buyBack(G, sys, st, hooks) {
    var why = buyBackRefusal(G, sys, st);
    if (why) return { ok: false, why: why };
    var price = buyBackPrice(st);
    G.ship.credits -= price;
    st.seized = false; st.foreclosed = false; st.takenBy = null; st.seizedBy = null;
    st.balance = 0; st.owingWeeks = 0;
    if (st.racket) { st.racket.refused = 0; }
    if (st.licence && st.licence.forged) st.licence.forged = false;
    portsOf(sys, st).forEach(function (q) { q.player = true; q.faction = st.faction; });
    var line = st.name + ' is yours again - ' + price + ' cr';
    say(hooks, line, 10);
    journal(G, line);
    return { ok: true, price: price };
  }

  /* ---- stitching (the XL shipyard) ---------------------------------------
   * Astra: "To get the XL sized shipyards, we stitch two crawlers together",
   * and chains of more. A loaded or empty Crawler within UNLOAD_KM of your
   * shipyard (or berthed with her) is stitched on along her flank links:
   * she stops for good as the founding Crawler did, her crates go into the
   * ring as upgrades, and you leave in one of her tugs. Two or more make a
   * shipyard an XL shipyard: the only one of yours that builds XL hulls. */
  function stitchRefusal(G, sys, st, t) {
    var Cn = C();
    if (!st || st.seized) return 'not yours';
    if (!Cn.isCrawler(G.ship)) return 'only a Crawler is stitched on';
    if (st.kind === 'surface') return 'a Crawler is stitched along an orbital station\'s flank';
    if (typesOf(st, t).indexOf('shipyard') < 0) return 'only a shipyard is stitched into an XL yard';
    if (st.star !== starOf(G, sys)) return st.name + ' is in another system';
    if (!isOpen(st, t)) return st.name + ' is still being built';
    if (global.Combat && global.Combat.lienRefusal) {
      var lien = global.Combat.lienRefusal(G);
      if (lien) return lien;
    }
    var cs = crawlerState(st, sys, t);
    if (!cs) return 'cannot find her';
    var d = V.dist(cs.pos, G.ship.pos);
    if (d > UNLOAD_KM) return Math.round(d) + ' km from her - come within ' + UNLOAD_KM + ' km of her flank';
    var rates = Cn.craftRates(Cn.loadoutOf(G.ship));
    if (!rates.tugs) return 'she needs a tug in her bay for you to leave in';
    return null;
  }
  function stitch(G, sys, st, t, hooks) {
    var why = stitchRefusal(G, sys, st, t);
    if (why) return { ok: false, why: why };
    var s = G.ship, Cn = C();
    if (Cn.aboard(s).length) unloadTo(G, sys, st, t, { say: function () {} });
    var loadout = Cn.loadoutOf(s);
    st.crawlers = (st.crawlers || 1) + 1;
    st.stitched = st.stitched || [];
    st.stitched.push({ name: s.shipName || null, livery: s.livery || null, at: t });
    (s.crew || []).forEach(function (c) { st.crew.push(c); });
    var tug = boardTug(G, st, loadout);
    var cs = crawlerState(st, sys, t);
    if (cs) { s.pos = V.add(cs.pos, { x: 0, y: 0, z: 0.5 }); s.vel = V.clone(cs.vel); }
    applyUpgrades(G, sys, st, t);
    var line = 'Stitched onto ' + st.name + ' - ' + st.crawlers + ' Crawlers' +
      (st.crawlers >= 2 ? ': an XL shipyard, building XL hulls' : '');
    say(hooks, line, 10);
    journal(G, line);
    return { ok: true, crawlers: st.crawlers, tug: tug };
  }

  /* ---- her batteries fire (2026-10-31) -----------------------------------
   * Until now a Defence battery only held the Syndicate off on paper. It
   * fires now - at ships that are after YOU within BATTERY.range of her,
   * and (with NPC aggression, later the same night) at a pirate robbing
   * any ship within that range: she defends her traffic. Astra chose an
   * owner's switch: outlaws by default (pirates, the Syndicate's ships,
   * bounty hunters), and "fire on the law" in YOUR STATIONS for the day you
   * would rather fight the police at your own door. Every police hit is an
   * assault booked to you, her owner - damageNpc books it, as it books your
   * own guns. And a kill is yours, as your turret's is (Astra: "Counts as
   * yours"): the record, and a pirate kill toward lifting a mark.
   *
   * A ship whose drive is out or who has struck is left alone: a hulk you
   * might board is not a target. Each battery is its own mount with its own
   * cooldown; a surface station's alternate between the pad and her
   * Crawler up top, so each half covers its own sky. Not under
   * time compression - the same rule as your own trigger. */
  var BATTERY = { id: 'battery', name: 'Defence battery', dmg: 9, range: 25, cooldown: 1.5,
                  falloff: 0.3, color: '#ff8a5b' };
  var LAW_KINDS = { police: true, navy: true }, LAW_CLS = { cutter: true, navy: true, capital: true, carrier: true };
  function isLaw(spec) { return !!spec && (LAW_KINDS[spec.kind] || LAW_CLS[spec.cls]); }
  function setFireOnLaw(G, st, on) {
    if (!st || st.seized) return { ok: false, why: 'not yours' };
    st.fireOnLaw = !!on;
    return { ok: true, fireOnLaw: st.fireOnLaw };
  }
  /* Where her guns are: her Crawler, and a surface station's pad too. */
  function mounts(st, sys, t) {
    var out = [], cs = crawlerState(st, sys, t);
    if (cs) out.push(cs.pos);
    if (st.kind === 'surface') { var ss = siteState(st, sys, t); if (ss) out.push(ss.pos); }
    return out;
  }
  function batteryTargets(G, sys, st, mount) {
    var out = [];
    (sys && sys.patrols || []).forEach(function (sp) {
      if (!sp || sp.dead || !sp.live || sp.disabled || sp.surrendered) return;
      /* After you, or (aggression.js) a pirate working one of her ships -
       * any ship near her: she defends her traffic. */
      var raiding = sp.kind === 'pirate' && sp.target && !sp.target.dead && sp.target.live;
      if (!sp.hostileToPlayer && !raiding) return;
      if (isLaw(sp) && !st.fireOnLaw) return;
      var d = V.dist(sp.live.pos, mount);
      if (d <= BATTERY.range) out.push({ spec: sp, d: d });
    });
    out.sort(function (a, b) { return a.d - b.d; });
    return out;
  }
  function defend(G, sys, t, hooks) {
    var Cm = global.Combat, star = starOf(G, sys), shots = 0;
    if (!Cm || !Cm.damageNpc || !sys || !sys.patrols || !sys.patrols.length) return 0;
    if (G.warpIndex > 0) return 0;
    var cool = G._batteryCool = G._batteryCool || {};
    var said = G._batterySaid = G._batterySaid || {};
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    list(G).forEach(function (st) {
      if (st.star !== star || st.seized || !isOpen(st, t)) return;
      var n = batteries(st);
      if (!n) return;
      var ms = mounts(st, sys, t);
      if (!ms.length) return;
      for (var i = 0; i < n; i++) {
        var key = st.id + '|' + i;
        /* A load can put the clock back; a cooldown from the future is void. */
        if (cool[key] > t + BATTERY.cooldown) cool[key] = 0;
        if (t < (cool[key] || -Infinity)) continue;
        var mount = ms[i % ms.length];
        var tg = batteryTargets(G, sys, st, mount);
        if (!tg.length) continue;
        /* Spread over what is there: battery i takes the i-th nearest. */
        var pick = tg[i % tg.length], sp = pick.spec;
        cool[key] = t + BATTERY.cooldown;
        (G.beams = G.beams || []).push({ from: V.clone(mount), to: V.clone(sp.live.pos), target: sp.live,
                                         color: BATTERY.color, until: now + 0.09 });
        var sk = st.id + '|' + sp.id;
        if (!said[sk]) {
          said[sk] = true;
          say(hooks, st.name + '\'s batteries engaging the ' + (sp.name || 'ship') +
              (isLaw(sp) ? ' - firing on the law, booked to you' : ''), 5);
        }
        Cm.damageNpc(sys, G, sp, Cm.damageAtRange(BATTERY, pick.d), t, hooks, BATTERY, mount);
        shots++;
      }
    });
    if (shots && hooks && hooks.sound) hooks.sound('turret');
    return shots;
  }

  /* Her system, if it has been generated: the cache, or the one you are in. */
  function sysOfStar(G, star) {
    if (G.systemCache && G.systemCache[star]) return G.systemCache[star];
    return G.sys && starOf(G, G.sys) === star ? G.sys : null;
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
    makePort: makePort, inject: inject, update: update, seize: seize, mineAt: mineAt, owns: owns,
    WEEK: WEEK, MARGIN: MARGIN, BERTH_FEE: BERTH_FEE, UPKEEP_SHARE: UPKEEP_SHARE, RESERVE: RESERVE,
    TANK_WEEKS: TANK_WEEKS, FORECLOSE_WEEKS: FORECLOSE_WEEKS,
    buildCost: buildCost, takeBooks: takeBooks, forecast: forecast, tankWeeks: tankWeeks,
    wagesWeek: wagesWeek, upkeepWeek: upkeepWeek, incomeWeek: incomeWeek,
    settle: settle, settleOne: settleOne, foreclose: foreclose,
    dockedAt: dockedAt, fuelFromHold: fuelFromHold, payIn: payIn, applyLight: applyLight,
    forecastSite: forecastSite, siteKey: siteKey, upId: upId, portIds: portIds, portsOf: portsOf,
    fitted: fitted, pending: pending, workHere: workHere, UNLOAD_KM: UNLOAD_KM, DOES: DOES,
    unloadRefusal: unloadRefusal, unloadTo: unloadTo, applyUpgrades: applyUpgrades,
    incomeMul: incomeMul, tankWeeksCap: tankWeeksCap,
    DEFINES: DEFINES, crewMul: crewMul, relayMul: relayMul, batteries: batteries, typesOf: typesOf, typeName: typeName,
    sellStock: sellStock, RACKET_CUT: RACKET_CUT, SABOTAGE: SABOTAGE, TAKE_WEEKS: TAKE_WEEKS, takeWeeks: takeWeeks,
    racketApplies: racketApplies, racketWeek: racketWeek, setPaying: setPaying, takenBySyndicate: takenBySyndicate,
    BUYBACK: BUYBACK, buyBackPrice: buyBackPrice, buyBackRefusal: buyBackRefusal, buyBack: buyBack,
    stitchRefusal: stitchRefusal, stitch: stitch,
    BATTERY: BATTERY, isLaw: isLaw, setFireOnLaw: setFireOnLaw, mounts: mounts,
    batteryTargets: batteryTargets, defend: defend
  };
  global.Stations = Stations;
  if (typeof module !== 'undefined' && module.exports) module.exports = Stations;
})(typeof window !== 'undefined' ? window : globalThis);
