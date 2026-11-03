/* seaplatform.test.js - ports on the open sea (2026-11-02).
 *
 *     node test/seaplatform.test.js
 *
 * Astra: "for ocean worlds, we want like a floating oil rig style of port,
 * and it would be pads that have protected domes open and close to protect
 * ships and their cargo from the waves, and a central bar, connected by
 * covered tubes."
 *
 * What this holds:
 *   - WHICH PORTS: every pad placeInland could not put on dry ground, on
 *     water, is a sea platform; none is left flagged coastal; nothing else
 *     anywhere in the galaxy changes, bit for bit; same seed, same answer;
 *   - IDENTITY: id, name, radius, faction and market are what they were;
 *   - THE BAY: pads on a ring round the hub, clear of each other and of the
 *     hub, a stand on the deck above the sea, a dome room round each;
 *   - SAVES: a career docked at one of these ports loads onto its pad;
 *   - and (further sections) the dome sequence, the walk and the waves.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
var W = require('../src/weather.js');
var V = global.V;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');

/* The galaxy's systems, with and without the pass, compared port by port.
 * Everything a port is built from, plus the whole timetable and the
 * patrols: if the pass took a draw or moved a port, this changes. */
function strip(sy, sea) {
  return JSON.stringify(sy.ports.map(function (p) {
    var m = p.market || {}, isSea = !!sea[p.id];
    return [p.id, p.name, p.radius, p.lat, p.lon, p.faction, p.livery,
            isSea ? null : (p.siteKind || null), isSea ? null : p.underground,
            isSea ? null : p.elevation, isSea ? null : p.typeName, m.role, m.pop, m.dev,
            Object.keys(m.rows || {}).sort().map(function (k) {
              return k + ':' + (m.rows[k].prod || 0) + ':' + (m.rows[k].cons || 0) + ':' + (m.rows[k].base || 0);
            }).join(','),
            p.orbit ? [p.orbit.a, p.orbit.e, p.orbit.m0] : null,
            (p.dressing && p.dressing.signs || []).length];
  })) + JSON.stringify((sy.traffic || []).map(function (r) {
    return [r.id, r.from, r.to, r.period, r.cruise, r.layover, r.t0, r.size, r.cls];
  })) + JSON.stringify((sy.patrols || []).map(function (r) { return [r.id, r.kind, r.faction]; })) +
    JSON.stringify(sy.bodies.map(function (b) { return [b.id, b.mass, b.radius]; }));
}

console.log('--- which ports ---');
var platforms = [], coastalLeft = 0, byRole = {}, byWorld = {}, sameRest = true, rolledUg = 0;
var sameIdentity = true, notFlagged = true, waterOnly = true, wasCoastal = 0, cleared = true;
var sampleSys = null, noDesertCoastal = true;
/* SEA_QUICK=1 sweeps the first 60 systems only, for working on the later
 * sections; the counts then fail, which is the point - it is not a run. */
var STARS = process.env.SEA_QUICK ? gal.stars.slice(0, 60) : gal.stars;
STARS.forEach(function (st) {
  var o = Galaxy.systemOpts(gal, st);
  var sy = Gen.generateSystem(st.seed, o);
  var sea = {};
  sy.ports.forEach(function (p) {
    if (p.coastal) coastalLeft++;
    if (p.surface && p.parentBody && p.parentBody.type === 'desert' && (p.coastal || p.seaPlatform)) noDesertCoastal = false;
    if (!p.seaPlatform) return;
    sea[p.id] = true;
    platforms.push({ p: p, sys: sy, star: st });
    if (p.seaRolledUnderground) rolledUg++;
    var role = (p.market && p.market.role) || '?';
    byRole[role] = (byRole[role] || 0) + 1;
    var wk = p.parentBody.type + (p.parentBody.habitableBand ? ' ' + p.parentBody.habitableBand : '');
    byWorld[wk] = (byWorld[wk] || 0) + 1;
    if (p.underground || p.coastal || p.coastalWhy !== undefined || !(p.platformWhy && p.platformWhy.length > 20)) cleared = false;
    if (W.terrainOf(p.parentBody).lava) waterOnly = false;
    if (!sampleSys) sampleSys = { sys: sy, port: p, star: st };
  });
  if (!platforms.length || !Object.keys(sea).length) return;
  var off = Gen.generateSystem(st.seed, Object.assign({}, o, { noSea: true }));
  off.ports.forEach(function (q) {
    if (q.coastal) {
      wasCoastal++;
      if (!sea[q.id] && !W.terrainOf(q.parentBody).lava) notFlagged = false;
    }
    if (sea[q.id]) {
      var p = sy.byId[q.id];
      if (!q.coastal) notFlagged = false;
      if (p.id !== q.id || p.name !== q.name || p.faction !== q.faction ||
          JSON.stringify(p.market && p.market.rows) !== JSON.stringify(q.market && q.market.rows)) sameIdentity = false;
    }
  });
  var sa = strip(off, sea), sb = strip(sy, sea);
  if (sa !== sb) {
    if (sameRest) { for (var ci = 0; ci < sa.length && sa[ci] === sb[ci]; ci++); console.log('     first difference, ' + st.seed + ': ' + sb.slice(Math.max(0, ci - 120), ci + 60) + '\n     without the pass: ' + sa.slice(Math.max(0, ci - 120), ci + 60)); }
    sameRest = false;
  }
});
console.log('     ' + platforms.length + ' sea platforms in ' + gal.stars.length + ' systems (' + rolledUg +
            ' rolled as buried bays); by role ' + JSON.stringify(byRole) + '; by world ' + JSON.stringify(byWorld));
check('every port flagged coastal on water is now a sea platform', notFlagged && wasCoastal === platforms.length,
      wasCoastal + ' flagged without the pass, ' + platforms.length + ' platforms');
check('none is left flagged coastal', coastalLeft === 0, coastalLeft + ' left');
/* 229 since stars stage 2 (2026-11-03): the warm chain made ocean worlds
 * common - 78 global-habitable worlds in 40 systems where there were 45 -
 * and with them pads with nowhere dry to go. It was 117. */
check('the kawartha count is the one the inland pass reported (229)', platforms.length === 229, String(platforms.length));
check('only on water, never on lava', waterOnly);
check('never on a desert: a salt basin is ground, and its ports stay buried', !platforms.some(function (x) { return x.p.parentBody.type === 'desert'; }) &&
      noDesertCoastal, 'desert pads flagged coastal anywhere: ' + (noDesertCoastal ? 0 : 'some'));
check('a platform is not a shaft, carries its reason, and the coastal flag is gone', cleared);
check('a platform keeps its id, name, faction and market', sameIdentity);
check('nothing else in any system changed, bit for bit', sameRest);

/* Same seed, same answer. */
(function () {
  var st = sampleSys.star;
  var a = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  var b = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  var key = function (sy) {
    return JSON.stringify(sy.ports.filter(function (p) { return p.seaPlatform; })
      .map(function (p) { return [p.id, p.lat, p.lon, p.elevation, p.platformWhy]; }));
  };
  check('same seed, same platforms', key(a) === key(b) && key(a).length > 4);
})();

console.log('--- the bay ---');
(function () {
  var p = sampleSys.port, sy = sampleSys.sys, r = p.radius;
  var g = Gen.bayGeometry(p), L = Gen.seaLayout();
  check('a platform wears its own role', !global.Render || global.Render.portModelFor(p) === 'seaplatform');
  check('the bay table is the sea one: no shaft, the floor is the deck above the sea',
        g.sea && g.depth === 0 && Math.abs(g.floorZ * r - Gen.SEA_DECK_KM) < 1e-12 && g.berths === Gen.SEA_PADS);
  var ok = true, minGap = Infinity, hubGap = Infinity;
  for (var i = 0; i < Gen.SEA_PADS; i++) {
    var a = L.pads[i];
    hubGap = Math.min(hubGap, a.ring - a.dome - L.hub);
    for (var j = i + 1; j < Gen.SEA_PADS; j++) {
      var b = L.pads[j];
      minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y) - a.dome - b.dome);
    }
    var off = Gen.berthOffset(p, i);
    if (Math.abs(off.x * r - a.x) > 1e-9 || Math.abs(off.y * r - a.y) > 1e-9) ok = false;
    if (!(off.z > g.floorZ) || off.z - g.floorZ > 0.01 / r) ok = false;
  }
  check('each berth is its own pad, standing on the deck', ok);
  check('no two domes touch', minGap > 0.005, (minGap * 1000).toFixed(1) + ' m between the nearest rims');
  check('every dome stands clear of the hub, with a tube between', hubGap >= L.tube - 1e-12, (hubGap * 1000).toFixed(1) + ' m');
  var larges = [];
  for (var lk = 0; lk < Gen.SEA_PADS; lk++) if (Gen.berthOffset(p, lk).large) larges.push(lk);
  check('berths 0 and 4 are the large pads, and the only ones', larges.join(',') === '0,4', larges.join(','));
  /* Sized for the traffic: a hull a dome is to protect fits under it. */
  var big = Gen.SHIP_CLASSES.tanker.size, small = Gen.SHIP_CLASSES.hauler.size;
  check('the large dome covers a tanker and an ordinary one a waste hauler',
        L.pads[0].dome * 2 > big && L.pads[1].dome * 2 > small,
        'domes ' + (L.pads[0].dome * 2000).toFixed(0) + ' m / ' + (L.pads[1].dome * 2000).toFixed(0) + ' m across');

  /* The berth in the world: above the sea at the port, on the deck. */
  var t = 5000;
  var bs = Sim.berthState(p, sy, t, 2);
  var hc = Sim.bodyPosition(p.parentBody, sy, t);
  var alt = V.dist(bs.pos, hc) - p.parentBody.radius;
  check('a pad stands above the sea, at the deck', alt > Gen.SEA_DECK_KM * 0.98 && alt < Gen.SEA_DECK_KM + 0.02,
        (alt * 1000).toFixed(1) + ' m above sea level');
  /* And the room the camera keeps to is the dome over that pad. */
  var room = Sim.berthRoom(p, 2), pad = L.pads[2];
  check('the berth room is the dome over the pad',
        room && Math.abs((room.x0 + room.x1) / 2 * r - pad.x) < 1e-9 && room.z0 * r >= Gen.SEA_DECK_KM - 1e-9 &&
        (room.z1 - room.z0) * r < pad.rise + 1e-9);
})();

console.log('--- saves ---');
(function () {
  /* restore() docks by id (save.js: Sim.dockShip(s, sys.byId[d.docked])):
   * a career saved at this port before it was a platform comes back on a
   * pad of it. */
  var p = sampleSys.port, sy = sampleSys.sys, t = 12345;
  var saved = JSON.parse(JSON.stringify({ docked: p.id }));
  var again = Gen.generateSystem(sampleSys.star.seed, Galaxy.systemOpts(gal, sampleSys.star));
  var q = again.byId[saved.docked];
  var ship = Sim.makeShip ? Sim.makeShip(V.zero(), V.zero()) : { pos: V.zero(), vel: V.zero(), fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } };
  Sim.dockShip(ship, q, again, t);
  var b = ship.dockOffset && ship.dockOffset.berth;
  var bs = Sim.berthState(q, again, t, b);
  check('a save docked at the port loads onto one of its pads',
        q && q.seaPlatform && ship.docked === p.id && bs && V.dist(ship.pos, bs.pos) < 1e-6,
        'berth ' + b);
})();

console.log('--- the mesh ---');
var Rn = null;
try { require('../src/render.js'); Rn = global.Render; } catch (e) { Rn = null; }
(function () {
  if (!Rn || !Rn.seaPlatformMesh) { check('render.js loads under node for the mesh checks', false); return; }
  var L = Gen.seaLayout(), m = Rn.seaPlatformMesh();
  check('the rig mesh is built, finite, in kilometres', m.f.length > 1000 &&
        m.v.every(function (v) { return v.every(isFinite) && Math.abs(v[0]) < L.reach * 1.3 && Math.abs(v[1]) < L.reach * 1.3; }),
        m.f.length + ' faces, ' + (L.reach * 2000).toFixed(0) + ' m across');
  /* NOTHING OF THE RIG STANDS INSIDE A DOME above the deck except the
   * landing circle's own lamps and paint: a hull parks there, and the
   * camera's dome room (berthRoom) is drawn round it. */
  var intrude = 0;
  m.v.forEach(function (v) {
    L.pads.forEach(function (p) {
      var dx = v[0] - p.x, dy = v[1] - p.y;
      if (dx * dx + dy * dy < Math.pow(p.dome * 0.97, 2) && v[2] > L.deck + 0.0015) intrude++;
    });
  });
  check('nothing of the rig stands inside a dome over its deck', intrude === 0, intrude + ' vertices');
  var deckTop = true;
  L.pads.forEach(function (p) { if (Math.abs(Gen.berthOffset({ seaPlatform: true, surface: true, radius: 0.2 }, p.k).z * 0.2 - L.deck) > 0.004) deckTop = false; });
  check('every stand is on the deck that is drawn', deckTop);

  /* The petals. Closed they meet at the crown; open they stand clear of
   * the landing circle, so a leaf never sweeps the deck a hull stands on. */
  function petalWorld(p, i, open) {
    var mesh = Rn.seaPetalMesh(p.dome, p.rise), th = Rn.SEA_PETAL_OPEN * open;
    var az = (i + 0.5) / Rn.SEA_PETALS * Math.PI * 2, ox = Math.cos(az), oy = Math.sin(az);
    var ct = Math.cos(th), st = Math.sin(th), hz = L.deck + Rn.SEA_DRUM_KM;
    return mesh.v.map(function (v) {
      /* x tangent, y radial (turned), z up (turned) - drawSeaDomes' frame. */
      var ry = v[1] * ct + v[2] * st, rz = -v[1] * st + v[2] * ct;
      return [p.x + ox * p.dome - oy * v[0] + ox * ry, p.y + oy * p.dome + ox * v[0] + oy * ry, hz + rz];
    });
  }
  var crownOk = true, clearOk = true, nearest = Infinity;
  L.pads.forEach(function (p) {
    for (var i = 0; i < Rn.SEA_PETALS; i++) {
      var shut = petalWorld(p, i, 0), top = 0;
      shut.forEach(function (w) { top = Math.max(top, w[2]); });
      if (Math.abs(top - (L.deck + Rn.SEA_DRUM_KM + p.rise)) > 0.002) crownOk = false;
      petalWorld(p, i, 1).forEach(function (w) {
        var rr = Math.hypot(w[0] - p.x, w[1] - p.y);
        if (rr < p.dome * 0.95 && w[2] > L.deck) clearOk = false;
        /* And how near an open leaf comes to a NEIGHBOUR's shut dome: the
         * dome's own surface, a flattened half-ellipsoid on its drum. */
        L.pads.forEach(function (q) {
          if (q === p) return;
          var dh = Math.hypot(w[0] - q.x, w[1] - q.y), dz = w[2] - (L.deck + Rn.SEA_DRUM_KM);
          var inDrum = dz < 0 && dh < q.dome;
          var e = dz >= 0 ? Math.sqrt(dh * dh / (q.dome * q.dome) + dz * dz / (q.rise * q.rise)) : dh / q.dome;
          nearest = Math.min(nearest, inDrum ? -1 : (e - 1) * q.dome);
        });
      });
    }
  });
  var GLW = null;
  try { GLW = require('../src/gl.js'); } catch (e) { GLW = null; }
  if (GLW && GLW.SEA_POSTS) {
    check('every column and trestle in the water gets its foam (the shader\'s post list holds them all)',
          Rn.seaPosts().length <= GLW.SEA_POSTS, Rn.seaPosts().length + ' of ' + GLW.SEA_POSTS);
  }
  check('shut, the petals meet at the crown', crownOk);
  check('open, no petal stands over the landing circle', clearOk);
  check('an open petal never reaches a neighbour\'s shut dome', nearest > 0, (nearest * 1000).toFixed(1) + ' m at the closest');
})();

console.log('--- the domes ---');
(function () {
  var p = sampleSys.port, sy = sampleSys.sys, r = p.radius;
  /* YOUR ARRIVAL. Captured, then carried: the dome over your pad is open
   * every moment the hull is off the deck, starts to shut only once it is
   * standing on it, and is shut when the rail ends. */
  var ship = Sim.makeShip(V.zero(), V.zero());
  var t0 = 40000;
  var berth = Sim.assignBerth(ship, p);
  var holdPose = Sim.arrivalPose(p, sy, t0, berth, 0);
  ship.pos = V.clone(holdPose.pos); ship.vel = V.clone(holdPose.vel);
  ship.fwd = holdPose.fwd; ship.up = holdPose.up; ship.right = holdPose.right;
  var began = Sim.beginArrival(ship, p, sy, t0);
  var dur = Sim.arrivalTotal(p, berth), seq = [], airOk = true, standZ = Sim.arrivalPath(p, berth)[3].z;
  var bs = Sim.berthState(p, sy, t0, berth);
  for (var el = 0; el <= dur; el += 0.25) {
    var pose = Sim.arrivalPose(p, sy, t0 + el, berth, el);
    var gb = Sim.groundBasis(p, sy, t0 + el);
    var z = V.dot(V.sub(pose.pos, gb.entrance.pos), gb.up) / r;
    if (z > standZ + 0.5 / 1000 / r && pose.gates.dome < 0.999) airOk = false;
    var tag = pose.legId + (pose.gates.dome > 0.999 ? ':open' : pose.gates.dome < 0.001 ? ':shut' : ':moving');
    if (seq[seq.length - 1] !== tag) seq.push(tag);
  }
  console.log('     arrival: ' + seq.join(' > '));
  check('an arrival rail starts at a platform', began && !!holdPose);
  check('the dome is open whenever the hull is off the deck', airOk);
  check('it shuts only once she is standing on the pad, and is shut at the end',
        seq.join(',') === 'approach:open,descend:open,settle:open,seal:open,seal:moving,berth:shut', seq.join(','));

  /* YOUR DEPARTURE: the rail backwards. The dome is open before the hull
   * leaves the stand. */
  Sim.dockShip(ship, p, sy, t0);
  var t1 = t0 + 600;
  Sim.updateDockedShip(ship, sy, t1);
  var left = Sim.undockShip(ship, sy, t1, 0.003);
  var dep = [], liftOk = true;
  check('undocking from a platform runs the rail backwards', left === p && ship.arrival && ship.arrival.reverse);
  for (var e2 = 0; e2 <= ship.arrival.dur; e2 += 0.25) {
    var pr = Sim.arrivalPose(p, sy, t1 + e2, berth, Math.max(0, ship.arrival.dur - e2));
    var gb2 = Sim.groundBasis(p, sy, t1 + e2);
    var z2 = V.dot(V.sub(pr.pos, gb2.entrance.pos), gb2.up) / r;
    if (z2 > standZ + 0.5 / 1000 / r && pr.gates.dome < 0.999) liftOk = false;
    var tg2 = pr.legId + (pr.gates.dome > 0.999 ? ':open' : pr.gates.dome < 0.001 ? ':shut' : ':moving');
    if (dep[dep.length - 1] !== tg2) dep.push(tg2);
  }
  console.log('     departure: ' + dep.join(' > '));
  check('leaving, the dome is open before the hull lifts off the stand', liftOk);
  /* Through stepArrival to the end: handed over above the crown, held. */
  var tt = t1;
  while (ship.arrival && tt < t1 + 60) { tt += 0.25; Sim.stepArrival(ship, sy, tt); }
  var gb3 = Sim.groundBasis(p, sy, tt), sp = Gen.seaPad(berth);
  var up3 = V.dot(V.sub(ship.pos, gb3.entrance.pos), gb3.up);
  check('and she is handed over held above her dome', !ship.arrival && up3 > sp.deck + sp.rise, (up3 * 1000).toFixed(0) + ' m up');

  /* THE TARGETS: cleared and inside the envelope, your pad opens; inside a
   * dome's volume, that dome is open whatever the clearance says. */
  var s2 = Sim.makeShip(V.zero(), V.zero());
  var gb4 = Sim.groundBasis(p, sy, t0), mine = Sim.assignBerth(s2, p), spm = Gen.seaPad(mine);
  s2.pos = V.addScaled(V.addScaled(V.addScaled(gb4.entrance.pos, gb4.east, spm.x), gb4.north, spm.y), gb4.up, 1.0);
  var tA = Sim.seaDomeTargets(p, sy, t0, s2, { cleared: true });
  var tB = Sim.seaDomeTargets(p, sy, t0, s2, { cleared: false });
  check('cleared and a kilometre up, your pad\'s dome is open', tA[mine].open === 1 && /cleared/.test(tA[mine].why), tA[mine].why);
  check('not cleared, it is not opened for you', !(tB[mine].open === 1 && /you/.test(tB[mine].why)));
  s2.pos = V.addScaled(V.addScaled(V.addScaled(gb4.entrance.pos, gb4.east, spm.x), gb4.north, spm.y), gb4.up, spm.deck + 0.010);
  var tC = Sim.seaDomeTargets(p, sy, t0, s2, { cleared: false });
  check('a hull inside a dome\'s volume holds it open, cleared or not', tC[mine].open === 1, tC[mine].why);

  /* TRAFFIC. Over three days at every platform with traffic: a ship on her
   * pad, berthed, under a shut dome; her dome open while she is coming in
   * and going out; never shut while she is in the air within reach of it. */
  var berthedShut = 0, berthedOpen = 0, airShut = 0, airOpen = 0, poseOff = 0, shared = 0, stays = 0, offDeck = 0, nextDue = 0;
  var look = platforms.slice(0, 24);
  look.forEach(function (x) {
    var P = x.p, S = x.sys;
    var routes = (S.traffic || []).filter(function (rt) { return (rt.to === P.id || rt.from === P.id) && !rt.outboard; });
    for (var tt2 = 1000; tt2 < 3 * 86400; tt2 += 1800) {
      var tg = Sim.seaDomeTargets(P, S, tt2, null, {});
      var onPad = {};
      routes.forEach(function (rt) {
        var st = Sim.trafficState(rt, S, tt2);
        var stay = Sim.seaStay(rt, P, tt2);
        var pad = Sim.seaTrafficPad(P, S, tt2, rt);
        if (!st || pad === null || !stay) return;
        if (pad === Sim.SEA_OFF) { if (st.phase === 'moored' && st.to && st.to.id === P.id) offDeck++; return; }
        if (st.phase === 'moored' && st.to && st.to.id === P.id) {
          stays++;
          var bsx = Sim.berthState(P, S, tt2, pad);
          if (V.dist(st.pos, bsx.pos) > 1e-6) poseOff++;
          if (onPad[pad]) shared++;
          onPad[pad] = true;
          if (tt2 > stay.a + Sim.SEA_SETTLE_S && tt2 < stay.d - Sim.SEA_DEPART_LEAD_S) {
            /* Open over a berthed ship only for ANOTHER ship's sake: the
             * next one due down on her pad as she leaves. */
            if (!tg[pad].open) berthedShut++;
            else if (tg[pad].why.indexOf(' ' + (rt.name || rt.id)) >= 0) berthedOpen++;
            else nextDue++;
          }
        }
      });
    }
    /* Fine-grained round each arrival and departure: in the air near the
     * pad, the dome must be open. */
    routes.slice(0, 6).forEach(function (rt) {
      var stay = Sim.seaStay(rt, P, 20000);
      if (!stay || !isFinite(stay.d)) return;
      var pad = Sim.seaTrafficPad(P, S, stay.a, rt);
      if (pad === Sim.SEA_OFF || pad === null) return;
      [[stay.a - 120, stay.a + 30], [stay.d - 40, stay.d + 300]].forEach(function (win) {
        for (var tq = win[0]; tq <= win[1]; tq += 2) {
          var st2 = Sim.trafficState(rt, S, tq);
          if (!st2 || !st2.pos) continue;
          /* Her pad as of this instant: pads are read off the sweep of
           * the time asked (Sim.seaTrafficPad). */
          var padQ = Sim.seaTrafficPad(P, S, tq, rt);
          if (padQ === null || padQ === Sim.SEA_OFF) continue;
          pad = padQ;
          var gbq = Sim.groundBasis(P, S, tq), spq = Gen.seaPad(pad);
          var padW = V.addScaled(V.addScaled(V.addScaled(gbq.entrance.pos, gbq.east, spq.x), gbq.north, spq.y), gbq.up, spq.deck);
          var rel = V.sub(st2.pos, padW), h = V.dot(rel, gbq.up);
          if (h > 0.004 && V.len(rel) < 0.5) {
            if (Sim.seaDomeTargets(P, S, tq, null, {})[pad].open) airOpen++; else airShut++;
          }
        }
      });
    });
  });
  console.log('     traffic over 3 days at ' + look.length + ' platforms: ' + stays + ' moored samples, ' +
              shared + ' sharing a pad, ' + offDeck + ' holding off the rig (deck full); berthed ' + berthedShut + ' shut / ' + berthedOpen + ' open; in the air near the pad ' +
              airOpen + ' open / ' + airShut + ' shut');
  check('a moored ship stands on the pad the timetable gives her', poseOff === 0 && stays > 0, poseOff + ' off');
  check('a berthed ship is under a shut dome, never opened for her own sake', berthedShut > 0 && berthedOpen === 0,
        berthedOpen + ' opened for her; ' + nextDue + ' open for the ship due next onto her pad');
  check('never shut on a ship in the air over her pad', airShut === 0 && airOpen > 0);
  check('no two ships ever share a pad', shared === 0, shared + ' of ' + stays);
  /* Measured, not chosen: the sweep's overflow at eight pads. Over this
   * many ships the deck is full now and then and the extras hold off. */
  check('a full deck is uncommon: few ships have to hold off the rig', offDeck <= (stays + offDeck) * 0.10, offDeck + ' of ' + (stays + offDeck) + ' (' + (100 * offDeck / Math.max(1, stays + offDeck)).toFixed(1) + '%)');
})();

console.log('--- the walk ---');
(function () {
  var Walk = require('../src/walk.js');
  var L = Gen.seaLayout(), mine = 3;
  var spec = { tube: L.tube * 1000, dome: Gen.seaPad(mine).dome * 1000, mine: mine,
               pads: L.pads.map(function (p) { return { k: p.k, large: p.large, mine: p.k === mine }; }) };
  /* A hull of 25 m with her ramp at the stern, as main.js hangarSpec
   * measures one. */
  var hg = { box: [-6, -14, 6, 12], hull: [-6, -12, 6, 12], height: 7, foot: { x: 0, z: -13 }, gy: 0 };
  var plan = Walk.layout('sea-test', { seed: 'kawartha', sea: spec, livery: 'civ',
    ships: [{ id: 'me', size: 'M', name: 'Test', current: true, hangar: hg }],
    others: [{ name: 'Overwater Barge', size: 'L', pad: 0 }, { name: 'Kestrel Barge', size: 'M', pad: 5 }] });
  var tube = plan.rooms.filter(function (r) { return r.id === 'tube'; })[0];
  var dome = plan.rooms.filter(function (r) { return r.id === 'berth0'; })[0];
  var barIt = plan.items.filter(function (it) { return it.kind === 'bar'; })[0];
  check('a platform\'s walk has your dome, your tube and the bar', !!(tube && dome && barIt && plan.hangar));
  check('your tube is the real one: as long as the rig\'s', tube && Math.abs((tube.x1 - tube.x0) - L.tube * 1000) < 1e-6,
        tube ? (tube.x1 - tube.x0).toFixed(0) + ' m' : '');
  var dR = Gen.seaPad(mine).dome * 1000;
  check('the hangar is inside the dome', dome && Math.hypot((dome.x1 - dome.x0) / 2, (dome.z1 - dome.z0) / 2) <= dR + 1e-6,
        dome ? ((dome.x1 - dome.x0).toFixed(0) + ' x ' + (dome.z1 - dome.z0).toFixed(0) + ' m under a ' + (2 * dR).toFixed(0) + ' m dome') : '');
  /* BFS over the standable floor, half a metre a step: from her ramp's
   * foot to the bar counter, and back. */
  function reach(from, to) {
    var S = 0.5, key = function (x, z) { return Math.round(x / S) + ',' + Math.round(z / S); };
    var seen = {}, q = [[from.x, from.z, null]], prev = {}, goal = null;
    seen[key(from.x, from.z)] = true;
    for (var qi = 0; qi < q.length && qi < 400000; qi++) {
      var c = q[qi];
      if (Math.hypot(c[0] - to.x, c[1] - to.z) < 2.0) { goal = c; break; }
      [[S, 0], [-S, 0], [0, S], [0, -S]].forEach(function (d) {
        var nx = c[0] + d[0], nz = c[1] + d[1], k = key(nx, nz);
        if (seen[k] || !Walk.standable(plan, nx, nz)) return;
        seen[k] = true; prev[k] = key(c[0], c[1]); q.push([nx, nz]);
      });
    }
    if (!goal) return null;
    var rooms = {}, k2 = key(goal[0], goal[1]), steps = 0;
    while (k2 && steps < 100000) {
      var xz = k2.split(',').map(function (v) { return +v * S; });
      var r = Walk.roomAt(plan, xz[0], xz[1]);
      if (r) rooms[r.id] = true;
      k2 = prev[k2]; steps++;
    }
    return { rooms: rooms, len: steps * S };
  }
  var foot = plan.hangar.foot, barAt = { x: barIt.x, z: barIt.z };
  var there = reach({ x: foot.x + 1.6, z: foot.z }, barAt);
  var back = reach(barAt, { x: foot.x + 1.6, z: foot.z });
  check('from her ramp, through the dome door and the tube, to the bar',
        !!(there && there.rooms.berth0 && there.rooms.tube && there.rooms.concourse && there.rooms.bar),
        there ? Object.keys(there.rooms).join(' > ') + ', ' + there.len.toFixed(0) + ' m walked' : 'no way through');
  check('and back again', !!(back && back.rooms.tube), back ? back.len.toFixed(0) + ' m' : 'no way back');
  /* The only way between the dome and the hub is the tube. */
  var cut = { rooms: plan.rooms.filter(function (r) { return r.id !== 'tube'; }), doors: plan.doors.filter(function (d) { return d.a !== 'tube' && d.b !== 'tube'; }), items: plan.items };
  var savePlan = plan; plan = cut;
  var noTube = reach({ x: foot.x + 1.6, z: foot.z }, barAt);
  plan = savePlan;
  check('the tube is the only way from the pad to the bar', !noTube);
  var ow = plan.items.filter(function (it) { return it.kind === 'other'; });
  check('a ship moored on another pad is boarded at the end of that pad\'s tube',
        ow.length === 2 && ow.every(function (it) { return /^tube\d/.test(it.berth); }), ow.map(function (it) { return it.label; }).join('; '));
  /* Same plan every time. */
  var again = Walk.layout('sea-test', { seed: 'kawartha', sea: spec, livery: 'civ',
    ships: [{ id: 'me', size: 'M', name: 'Test', current: true, hangar: hg }],
    others: [{ name: 'Overwater Barge', size: 'L', pad: 0 }, { name: 'Kestrel Barge', size: 'M', pad: 5 }] });
  check('the same platform walks the same', JSON.stringify(again.rooms) === JSON.stringify(plan.rooms));

  /* THE TUBE'S WINDOWS SEE THE WORLD (2026-11-02, second round). Astra:
   * "the walking view can show it through windows though". The panes are
   * not painted sea and sky any more: they are left out of the deck's mesh
   * and given as their own (Walk.panesFor), which main.js draws
   * depth-only after the world (GLWorld.queueWindows). */
  console.log('--- the tube\'s windows ---');
  var PAINTED = ['#4a7fa6', '#1f4a6b', '#9cc6dc'];
  var deck = Walk.meshFor(plan), panes = Walk.panesFor(plan);
  check('your tube is glazed and the stubs are not', tube.glazed &&
        plan.rooms.filter(function (r) { return r.kind === 'tube' && r.id !== 'tube'; }).every(function (r) { return !r.glazed; }));
  check('the panes are their own mesh, not plates of the deck', !!(panes && panes.f.length >= 2 * 2 * 30),
        panes ? (panes.f.length / 2) + ' panes' : 'none');
  var painted = deck.c.filter(function (c) { return PAINTED.indexOf(String(c).replace('!', '').toLowerCase()) >= 0; }).length;
  check('no pane is a fixed colour in the deck: no painted sea or sky', painted === 0, painted + ' painted faces');
  /* Every pane lies inside the tube, on its long walls, 4 cm in, at
   * window height - so it stands in front of the wall it is cut in. */
  var inWall = panes && panes.v.every(function (p) {
    var onWall = Math.abs(p[2] - (tube.z0 + 0.04)) < 1e-6 || Math.abs(p[2] - (tube.z1 - 0.04)) < 1e-6;
    return onWall && p[0] >= tube.x0 && p[0] <= tube.x1 && p[1] >= 0.99 && p[1] <= 2.26;
  });
  check('every pane is in your tube\'s walls, just in front of them', !!inWall);
  var src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'main.js'), 'utf8');
  check('the walk draws them as windows (queueWindows with panesFor)',
        /Walk\.panesFor\(p\)/.test(src) && /GLWorld\.queueWindows\(cam, F, panes/.test(src));

  /* THE PLAN STANDS ON THE RIG: she is at the pad's centre, 0.98 of the
   * dome's radius from the tube's end (where the rig's tube meets the
   * drum), on the tube's line, nose toward the hub. */
  var hgO = { box: [-6, -14, 6, 12], hull: [-6, -12, 6, 12], height: 7, foot: { x: 0, z: -13 }, gy: 0, origin: { x: 0.4, z: -1.5 } };
  var plan2 = Walk.layout('sea-test', { seed: 'kawartha', sea: spec, livery: 'civ',
    ships: [{ id: 'me', size: 'M', name: 'Test', current: true, hangar: hgO }], others: [] });
  var t2 = plan2.rooms.filter(function (r) { return r.id === 'tube'; })[0];
  var at2 = Walk.hangarToStation(plan2.hangar, hgO.origin.x, hgO.origin.z);
  var nose = Walk.hangarToStation(plan2.hangar, hgO.origin.x, hgO.origin.z + 10);
  check('she stands at the pad\'s centre, the tube\'s end 0.98 R off', Math.abs((t2.x0 - at2.x) - dR * 0.98) < 1e-6 &&
        Math.abs(at2.z - (t2.z0 + t2.z1) / 2) < 1e-6, (t2.x0 - at2.x).toFixed(2) + ' m, ' + (dR * 0.98).toFixed(2) + ' wanted');
  check('nose toward the hub, down her tube', nose.x - at2.x > 9.99, (nose.x - at2.x).toFixed(2));
})();

console.log('--- no hull stands on her tail at a rig (2026-11-03) ---');
(function () {
  /* "Ironwake Packet" was seen nose-up beside a sea rig. A heavy
   * (`outboard`) never gets a pad from seaStay, and the boats that live at
   * a port have no route at all; both fell through dockPose's sea branch
   * into the open-pad pose, nose up at 0.4 port radii. Measured before the
   * fix over 71 kawartha systems: 70,473 of 2.27 million samples within
   * 3 km of a rig pointed within 32 degrees of straight up. Here, Taolmai's
   * Terminus Hold (the system the case was found in) and every route at
   * it, through a whole cycle: none may. */
  var star = gal.stars[5], sys = Gen.generateSystem(star.seed);
  var port = (sys.ports || []).filter(function (p) { return p.seaPlatform; })[0];
  check('Taolmai has its sea platform', !!port, star.name);
  if (!port) return;
  var n = 0, up = 0, eg = '', heavies = 0, heavyLevel = 0;
  (sys.traffic || []).forEach(function (r) {
    if (r.from !== port.id && r.to !== port.id) return;
    for (var k = 0; k < 120; k++) {
      var t = r.t0 + k * r.period / 61;
      var st = Sim.trafficState(r, sys, t);
      if (!st || !st.pos) continue;
      var ps = Sim.bodyState(port, sys, t).pos;
      if (V.dist(st.pos, ps) > 3) continue;
      n++;
      var lup = V.norm(V.sub(ps, Sim.bodyState(port.parentBody, sys, t).pos));
      var c = V.dot(V.norm(st.fwd), lup);
      if (c > 0.85) { up++; if (!eg) eg = r.name + ' ' + st.phase + ' t=' + t.toFixed(0); }
      if (r.outboard && st.phase === 'moored') { heavies++; if (Math.abs(c) < 0.2) heavyLevel++; }
    }
  });
  check('no ship within 3 km of the rig points within 32 degrees of straight up', n > 100 && up === 0,
        up + ' of ' + n + ' ' + eg);
  check('and a heavy moored there lies level off the rig', heavies > 0 && heavyLevel === heavies, heavyLevel + ' of ' + heavies);
  /* A boat that lives at the port and has no route (railState 'port'). */
  var pose = Sim.railState ? Sim.railState({ id: 'tender-x', name: 'Test Tender', rail: { type: 'port', port: port.id } }, sys, 1000) : null;
  if (pose) {
    var lu = V.norm(V.sub(Sim.bodyState(port, sys, 1000).pos, Sim.bodyState(port.parentBody, sys, 1000).pos));
    check('nor does a boat that lives at the rig with no route', Math.abs(V.dot(pose.fwd, lu)) < 0.2);
  }
})();

module.exports = { platforms: platforms, sample: sampleSys };
if (require.main === module) {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
