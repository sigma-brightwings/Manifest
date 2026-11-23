/* multiples.test.js - stars stage 3: more than one sun, and the warm giant
 * with a living moon round a companion (generate.js, 2026-11-20).
 *
 *     node test/multiples.test.js
 *
 * Pinned here:
 *  - real-ish rates: a good share of systems have a second sun, some a close
 *    pair, some a third; the same seed gives the same answer;
 *  - NOTHING THAT EXISTED MOVES: every planet, moon, port, route and patrol
 *    of a system is identical with and without its companions;
 *  - a close pair weighs and shines exactly what the single star did, the
 *    two stars stay opposite through the barycentre, P_bin >= 7 d, and every
 *    planet sits outside 1.15 x the Holman-Wiegert critical radius;
 *  - a distant companion leaves every planet inside the S-type limit;
 *  - the ship feels what the rails assume: by a circumbinary world the pull
 *    of the pair is a point mass at the barycentre; by the companion's moon
 *    the frame is hers, not the pair's;
 *  - the warm giant's moon is a world: habitable, a postcard or near it,
 *    the giant 8-25 degrees across, ports over and on it with ferries.
 */
'use strict';
global.window = global;
var path = require('path'), SRC = path.join(__dirname, '..', 'src');
['vec3', 'kepler', 'rng', 'economy', 'appeal', 'generate', 'galaxy', 'sim'].forEach(function (f) { require(path.join(SRC, f + '.js')); });
var V = global.V, Gen = global.Gen, Galaxy = global.Galaxy, Sim = global.Sim, A = global.Appeal;
var AU = 1.495978707e8;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '   ' + d : '')); }
}

var g = Galaxy.build('kawartha');
var stars = g.stars.filter(function (s) { return s.factionId; }).slice(0, 120);
function optsFor(st, extra) {
  var o = { faction: g.factionById[st.factionId], allFactions: g.factions };
  for (var k in (extra || {})) o[k] = extra[k];
  return o;
}
var systems = stars.map(function (st) { return { st: st, sys: Gen.generateSystem(st.seed, optsFor(st)) }; });

console.log('--- how many suns ---');
var shapes = { single: 0, close: 0, distant: 0, triple: 0 };
systems.forEach(function (x) {
  var s = x.sys;
  shapes[s.root.kind === 'barycentre' ? (s.companion ? 'triple' : 'close') : (s.companion ? 'distant' : 'single')]++;
});
var multi = systems.length - shapes.single;
console.log('       ' + JSON.stringify(shapes) + ' of ' + systems.length);
check('between a quarter and a half of systems have more than one sun', multi > systems.length * 0.25 && multi < systems.length * 0.55, multi);
check('there are close pairs, distant companions and triples', shapes.close + shapes.triple > 0 && shapes.distant > 0 && shapes.triple > 0);
var again = Gen.generateSystem(stars[3].seed, optsFor(stars[3]));
check('the same seed gives the same suns', JSON.stringify(again.stars.map(function (s) { return [s.id, s.type, s.mass]; })) ===
      JSON.stringify(systems[3].sys.stars.map(function (s) { return [s.id, s.type, s.mass]; })));

console.log('--- nothing that existed moves ---');
function r(x) { return typeof x === 'number' ? +x.toPrecision(12) : x; }
function key(b) {
  var o = b.orbit;
  return JSON.stringify([b.id, b.name, b.kind, b.type, r(b.mass), r(b.radius), r(b.insolation),
    o ? [o.parent, r(o.a), r(o.e), r(o.inc), r(o.m0), r(o.period)] : null,
    b.rotation ? r(b.rotation.period) : null, b.faction && (b.faction.id || b.faction),
    b.market ? [b.market.role, r(b.market.dev)] : null, r(b.lat), r(b.lon), b.ring ? r(b.ring.inner) : null]);
}
var moved = 0, compared = 0;
systems.slice(0, 40).forEach(function (x) {
  var bare = Gen.generateSystem(x.st.seed, optsFor(x.st, { noMultiples: true }));
  var byId = {};
  bare.bodies.forEach(function (b) { byId[b.id] = key(b); });
  x.sys.bodies.forEach(function (b) {
    if (/^b0[abc]/.test(b.id) || b.id === 'b0') return;
    compared++;
    if (byId[b.id] !== key(b)) moved++;
  });
  /* Routes from ports that are new since the companions are not "what
   * existed": her moon's ports (b0cp*), a resort on that moon (b0c2rs),
   * and any resort at all (b<n>rs, worlds worth visiting slice 3), whose
   * timetable is built after hers and so may call at her ports.
   * resorts.test.js holds every older route still. */
  var NEWPORT = /^ps\|(b0c|b\d+rs)/;
  var rt = function (s) { return JSON.stringify((s.traffic || []).filter(function (q) { return !NEWPORT.test(String(q.id)); })
    .map(function (q) { return [q.id, q.from, q.to, r(q.period), r(q.t0)]; })); };
  if (rt(bare) !== rt(x.sys)) moved++;
  if (JSON.stringify(bare.patrols.map(function (p) { return p.id; })) !== JSON.stringify(x.sys.patrols.map(function (p) { return p.id; }))) moved++;
});
check('every body, route and patrol of 40 systems is identical with and without companions', moved === 0, moved + ' moved of ' + compared + ' bodies');

console.log('--- a close pair ---');
var pairs = systems.filter(function (x) { return x.sys.pairBary; });
var pre = function (x) { return Gen.starPreview(x.st.seed); };
var sumOK = true, oppOK = true, pOK = true, critOK = true;
pairs.forEach(function (x) {
  var s = x.sys, bc = s.pairBary, a = s.byId.b0a, b = s.byId.b0b, p0 = pre(x);
  if (Math.abs(a.mass + b.mass - p0.mass) / p0.mass > 1e-9 || Math.abs(a.luminosity + b.luminosity - p0.luminosity) / p0.luminosity > 1e-9) sumOK = false;
  [0, 3.3e5, 7.7e6].forEach(function (t) {
    var pa = Sim.bodyPosition(a, s, t), pb = Sim.bodyPosition(b, s, t);
    var c = V.add(V.scale(pa, a.mass), V.scale(pb, b.mass));
    if (V.len(c) / (a.mass + b.mass) > bc.separation * 1e-6) oppOK = false;
  });
  var M = (a.mass + b.mass) / 1.98892e30, P = Math.sqrt(Math.pow(bc.binary.aBin, 3) / M) * 365.25;
  if (P < 7 - 1e-6) pOK = false;
  var mu = Math.min(a.mass, b.mass) / (a.mass + b.mass), e = bc.binary.e;
  var crit = 1.60 + 5.10 * e - 2.22 * e * e + 4.12 * mu - 4.27 * e * mu - 5.09 * mu * mu + 4.61 * e * e * mu * mu;
  s.root.children.forEach(function (pl) {
    if (pl.kind === 'planet' && pl.orbit.a / AU < 1.15 * crit * bc.binary.aBin * 0.999) critOK = false;
  });
});
console.log('       ' + pairs.length + ' close pairs');
check('a pair weighs and shines exactly what the single star did', pairs.length > 0 && sumOK);
check('the two stars stay opposite through their barycentre', oppOK);
check('no pair orbits faster than once a week', pOK);
check('every planet clears 1.15 x the circumbinary critical radius', critOK);

console.log('--- a distant companion ---');
var comps = systems.filter(function (x) { return x.sys.companion; });
var sOK = true;
comps.forEach(function (x) {
  var s = x.sys, C = s.companion, Mr = s.root.mass;
  var mu = C.mass / (Mr + C.mass), e = C.orbit.e;
  var lim = 0.464 - 0.380 * mu - 0.631 * e + 0.586 * mu * e + 0.150 * e * e - 0.198 * mu * e * e;
  s.root.children.forEach(function (pl) {
    if (pl.kind === 'planet' && pl.orbit.a > 0.8 * lim * C.orbit.a * 1.0001 && C.orbit.a / AU < 3000) sOK = false;
  });
});
check('every planet sits inside the S-type limit her companion leaves', comps.length > 0 && sOK, comps.length + ' companions');

console.log('--- what the ship feels ---');
var px = pairs[0];
if (px) {
  var s = px.sys, pl = s.root.children.filter(function (b) { return b.kind === 'planet'; })
    .sort(function (a, b) { return a.orbit.a - b.orbit.a; })[0];
  var t = 1.2e6, pp = Sim.bodyPosition(pl, s, t), off = { x: pl.radius * 3, y: 0, z: 0 };
  var pt = V.add(pp, off), acc = Sim.acceleration(pt, s, t);
  /* Take out everything but the stars: the planet and every other world. */
  s.gravBodies.forEach(function (b) {
    if (b.kind === 'star') return;
    var bp = Sim.bodyPosition(b, s, t), d = V.sub(bp, pt), dl = V.len(d);
    acc = V.sub(acc, V.scale(d, b.mu / (dl * dl * dl)));
  });
  var d0 = V.sub(V.zero(), pt), dl0 = V.len(d0);
  var mono = V.scale(d0, s.pairBary.mu / (dl0 * dl0 * dl0));
  var err = V.len(V.sub(acc, mono)) / V.len(mono);
  check('by a circumbinary world the pair pulls as one point at its barycentre', err < 1e-9, err.toExponential(2));
}
var wx = systems.filter(function (x) { return x.sys.byId.b0c2; })[0];
if (wx) {
  var ws = wx.sys, moon = ws.byId.b0c2, mp = Sim.bodyPosition(moon, ws, 0);
  check('by the companion\'s moon, the frame is the moon, never the pair', Sim.frameBody(V.add(mp, { x: moon.radius * 2, y: 0, z: 0 }), ws, 0) === moon);
  var cp = Sim.bodyPosition(ws.companion, ws, 0);
  check('...and near the companion herself, it is her', Sim.frameBody(V.add(cp, { x: ws.companion.radius * 4, y: 0, z: 0 }), ws, 0) === ws.companion);
}

console.log('--- the warm giant and its living moon ---');
var warm = systems.filter(function (x) { return x.sys.byId.b0c2; });
var habOK = true, apOK = true, angOK = true, portOK = true, ferryOK = true, angs = [];
warm.forEach(function (x) {
  var s = x.sys, moon = s.byId.b0c2, giant = s.byId.b0c1;
  if (!moon.habitable || moon.kind !== 'moon' || !moon.atmosphere || moon.atmosphere.rho0 < 0.5) habOK = false;
  var ap = A.of(s, moon);
  if (!ap || ap.score < 0.5 || ap.why.join().indexOf('giant overhead') < 0) apOK = false;
  var ang = 2 * Math.atan(giant.radius / moon.orbit.a) * 180 / Math.PI;
  angs.push(ang.toFixed(0));
  if (ang < 7 || ang > 25) angOK = false;
  var ports = (moon.children || []).filter(function (c) { return c.docking || c.surface; });
  if (!ports.length) portOK = false;
  if (!(s.traffic || []).some(function (q) { return String(q.id).indexOf('ps|b0cp') === 0; })) ferryOK = false;
});
console.log('       ' + warm.length + ' warm giants in ' + systems.length + ' systems; giant across (deg) ' + angs.join(' '));
check('a tenth or so of systems have one', warm.length >= systems.length * 0.04 && warm.length <= systems.length * 0.2, warm.length);
check('every such moon is a world with real air', warm.length > 0 && habOK);
check('...pleasant or better, with the giant overhead', apOK);
check('...and the giant fills 7-25 degrees of her sky', angOK);
check('...with ports over or on her, and ships running to them', portOK && ferryOK);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
