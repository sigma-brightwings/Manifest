/* survey.test.js — mining rung 1: what is under the ground, and mapping it.
 *
 *     node test/survey.test.js
 *
 * What this holds (claude/mining-and-survey.md, "1. Survey"):
 *   - SEED DATA: the same world always holds the same deposits, and asking
 *     draws nothing - generation is byte-identical with or without it;
 *   - AGREEMENT: a mining head's world is rich in what the head sells, and a
 *     refinery's giant has hydrogen worth skimming;
 *   - GROUND TRACK: an equatorial orbit maps a band, a polar one maps the
 *     world, and a frame several orbits long (time warp) maps what flying
 *     those orbits would have;
 *   - DATED: a survey's value falls with age, and the Guild pays once.
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
var Sv = require('../src/survey.js');
var V = global.V;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
function optsFor(st) {
  var fac = gal.factionById ? gal.factionById[st.factionId] : null;
  return fac ? { faction: fac, allFactions: gal.factions } : {};
}
var systems = [];
for (var s = 0; s < gal.stars.length && s < 60; s++) {
  var sy = Gen.generateSystem(gal.stars[s].seed, optsFor(gal.stars[s]));
  sy._star = gal.stars[s];
  systems.push(sy);
}

console.log('--- seed data ---');
var a1 = Gen.generateSystem(gal.stars[3].seed, optsFor(gal.stars[3]));
var a2 = Gen.generateSystem(gal.stars[3].seed, optsFor(gal.stars[3]));
var w1 = a1.bodies.filter(function (b) { return b.kind === 'planet'; }).map(function (b) { return JSON.stringify(Sv.deposits(b, a1)); });
var w2 = a2.bodies.filter(function (b) { return b.kind === 'planet'; }).map(function (b) { return JSON.stringify(Sv.deposits(b, a2)); });
check('the same world holds the same deposits, twice', w1.join() === w2.join());
var a3 = Gen.generateSystem(gal.stars[3].seed, optsFor(gal.stars[3]));
Sv.deposits(a3.bodies[1], a3); Sv.deposits(a3.bodies[2], a3);
var a4 = Gen.generateSystem(gal.stars[3].seed, optsFor(gal.stars[3]));
check('asking draws nothing: a system generated after asking is unchanged',
      JSON.stringify(a3.bodies.map(function (b) { return [b.id, b.mass, b.orbit && b.orbit.a]; })) ===
      JSON.stringify(a4.bodies.map(function (b) { return [b.id, b.mass, b.orbit && b.orbit.a]; })));
var kinds = {};
systems.forEach(function (sys) {
  sys.bodies.forEach(function (b) {
    if (b.kind !== 'planet' && b.kind !== 'moon') return;
    Sv.deposits(b, sys).forEach(function (r) { kinds[r.cid] = (kinds[r.cid] || 0) + 1; });
  });
});
check('every commodity turns up somewhere in sixty systems',
      Sv.CIDS.every(function (c) { return kinds[c] > 0; }), JSON.stringify(kinds));
var giantH = 0, giants = 0;
systems.forEach(function (sys) {
  sys.bodies.forEach(function (b) {
    if (b.type !== 'gasGiant') return;
    giants++;
    var h = Sv.deposits(b, sys).filter(function (r) { return r.cid === 'hydrogen'; })[0];
    if (h && h.grade >= 0.6 && !isFinite(h.tonnes)) giantH++;
  });
});
check('every gas giant holds hydrogen with no bottom to it', giants > 0 && giantH === giants, giantH + ' of ' + giants);

console.log('--- agreement with the industry already there ---');
var mines = 0, agree = 0, refs = 0, refAgree = 0, bad = [];
systems.forEach(function (sys) {
  sys.bodies.forEach(function (p) {
    if (p.kind !== 'station' || !p.market) return;
    var host = p.parentBody;
    if (!host) return;
    var dep = Sv.deposits(host, sys);
    var by = {}; dep.forEach(function (r) { by[r.cid] = r.grade; });
    if (p.market.role === 'mining') {
      mines++;
      var best = Math.max(by.ores || 0, by.rare || 0, by.fissile || 0);
      if (best >= 0.7) agree++; else bad.push(host.name + ' ' + best.toFixed(2));
    }
    if (p.market.role === 'refinery' && (host.type === 'gasGiant' || host.type === 'iceGiant')) {
      refs++;
      if ((by.hydrogen || 0) >= 0.8) refAgree++;
    }
  });
});
check('a mining head sits on rich ground', mines > 0 && agree === mines, agree + ' of ' + mines + (bad.length ? '  e.g. ' + bad.slice(0, 3) : ''));
check('a giant\'s refinery sits on hydrogen worth skimming', refs > 0 && refAgree === refs, refAgree + ' of ' + refs);

console.log('--- the ground track ---');
var LVL = 1;
global.Combat = { surveyLevel: function () { return LVL; } };
/* A world that TURNS under the orbit. Since the twilight worlds (2026-10-19,
 * merged here 2026-10-25) a close-in rock can be tidally locked - its day
 * as long as its year - and a polar orbit over a world that does not turn
 * maps one great circle's strip however long you fly it, which is right
 * and is not what these checks are about. */
function turning(b) {
  return b.kind === 'planet' && b.type === 'rocky' &&
         !(b.rotation && b.rotation.period > 3 * 86400);
}
var sys = systems.filter(function (x) { return x.bodies.some(turning); })[0];
var world = sys.bodies.filter(turning)[0];
function flyOrbit(inclDeg, totalSec, dt, G0, t0, rMul) {
  var G = G0 || { here: { id: 'test' }, ship: { pos: null, vel: null }, surveys: {} };
  t0 = t0 || 0;
  var fr = Sv.spinFrame(world, 0), n = fr.n, e1 = fr.e1;
  var e2 = { x: n.y * e1.z - n.z * e1.y, y: n.z * e1.x - n.x * e1.z, z: n.x * e1.y - n.y * e1.x };
  var inc = inclDeg * Math.PI / 180;
  /* Orbit plane spanned by e1 and (e2 cos i + n sin i). */
  var q = { x: e2.x * Math.cos(inc) + n.x * Math.sin(inc), y: e2.y * Math.cos(inc) + n.y * Math.sin(inc),
            z: e2.z * Math.cos(inc) + n.z * Math.sin(inc) };
  var r = world.radius * (rMul || 1.3), mu = 6.6743e-20 * world.mass, om = Math.sqrt(mu / (r * r * r));
  for (var t = t0; t <= t0 + totalSec; t += dt) {
    var bs = Sim.bodyState(world, sys, t);
    var c = Math.cos(om * t), sn = Math.sin(om * t);
    G.ship.pos = V.add(bs.pos, { x: (e1.x * c + q.x * sn) * r, y: (e1.y * c + q.y * sn) * r, z: (e1.z * c + q.z * sn) * r });
    G.ship.vel = V.add(bs.vel, { x: (-e1.x * sn + q.x * c) * r * om, y: (-e1.y * sn + q.y * c) * r * om, z: (-e1.z * sn + q.z * c) * r * om });
    Sv.step(G, sys, t, t === t0 ? 0 : dt);
  }
  return { cov: G.surveys['test:' + world.id].cov, period: 2 * Math.PI / om, G: G,
           rec: G.surveys['test:' + world.id], tEnd: t - dt };
}
var probeP = flyOrbit(90, 1, 1).period;
var eq = flyOrbit(0, probeP * 12, probeP / 200);
var polar = flyOrbit(88, probeP * 12, probeP / 200);
check('an equatorial orbit maps a band, not the world', eq.cov > 0.2 && eq.cov < 0.7, Math.round(eq.cov * 100) + '%');
check('a polar orbit maps the world', polar.cov > 0.9, Math.round(polar.cov * 100) + '%');
var warped = flyOrbit(88, probeP * 12, probeP * 3);
check('a frame three orbits long maps what flying them would have',
      Math.abs(warped.cov - polar.cov) < 0.15, Math.round(warped.cov * 100) + '% vs ' + Math.round(polar.cov * 100) + '%');
var short = flyOrbit(88, probeP * 0.5, probeP / 200);
check('half an orbit maps a strip, not the world', short.cov > 0.02 && short.cov < 0.35, Math.round(short.cov * 100) + '%');

console.log('--- dated, and paid once ---');
var rec = polar.G.surveys['test:' + world.id];
rec.star = 'test';
var fresh = Sv.value(rec, sys, rec.t);
var old = Sv.value(rec, sys, rec.t + 365 * 86400);
check('a fresh survey of a world with something in it is worth paying for', fresh > 500, fresh + ' cr');
check('a year-old survey is worth well under half', old < fresh * 0.5 && old > 0, old + ' vs ' + fresh);
var G2 = polar.G; G2.ship.credits = 0;
var sold = Sv.sell(G2, sys, rec.t);
check('the Guild pays for it', sold.total === fresh && G2.ship.credits === fresh, sold.total + ' cr');
check('and not twice', Sv.sell(G2, sys, rec.t).total === 0);
check('deep-array surveys pay more than scanner ones',
      Sv.value({ key: rec.key, cov: 1, t: 0, grade: 2, soldCov: 0 }, sys, 0) >
      Sv.value({ key: rec.key, cov: 1, t: 0, grade: 1, soldCov: 0 }, sys, 0));

console.log('--- cells survive the save ---');
var packed = Sv.packCells(Sv.cellsOf(rec));
var round = Sv.cellsOf({ cells: packed });
var same = true;
for (var i = 0; i < round.length; i++) if (round[i] !== Sv.cellsOf(rec)[i]) same = false;
check('packed cells unpack to the same ground', same && Sv.coverageOf(round) === rec.cov);

/* SCANNER AUDIT, 2026-10-17 - one check per bug found. */
console.log('--- low orbits leave no holes ---');
(function () {
  var fr = { e1: { x: 1, y: 0, z: 0 }, e2: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 }, turn: 0, t: 0 };
  var w = Sv.swathAt(1, 1.05), d = 15 * Math.PI / 180;
  /* The corner where four cells meet: every centre is ~10 degrees off. */
  var corner = { x: Math.cos(d) * Math.cos(d), y: Math.cos(d) * Math.sin(d), z: Math.sin(d) };
  var cells = new Uint8Array(Sv.LAT_BINS * Sv.LON_BINS);
  check('a 1.05 R swath over the corner of four cells maps them', Sv.markAt(cells, fr, corner, 0, 0, w) >= 1,
        (w * 180 / Math.PI).toFixed(1) + ' deg swath');
  var low = flyOrbit(88, probeP * 12, probeP / 400, null, 0, 1.05);
  check('a low polar orbit still maps the world', low.cov > 0.9, Math.round(low.cov * 100) + '%');
})();

console.log('--- one fresh cell does not make an old survey new ---');
(function () {
  var YEAR = 365 * 86400;
  var a = flyOrbit(88, probeP * 0.5, probeP / 200);
  var covA = a.rec.cov;
  flyOrbit(88, probeP * 0.03, probeP / 400, a.G, YEAR);
  var rec2 = a.rec, now = rec2.t;
  check('the topped-up survey gained only a little', rec2.cov > covA && rec2.cov - covA < covA * 0.5,
        Math.round(covA * 100) + '% -> ' + Math.round(rec2.cov * 100) + '%');
  check('its "as of" is the new pass', Math.abs(rec2.t - now) < 1);
  var asIfNew = Object.assign({}, rec2, { tMean: now });
  var v = Sv.value(rec2, sys, now), vNew = Sv.value(asIfNew, sys, now);
  check('it sells as mostly year-old ground, not as new', v < vNew * 0.75 && v > 0, v + ' vs ' + vNew + ' if all new');
  a.G.ship.credits = 0; a.G.surveys[rec2.key].star = 'test';
  Sv.sell(a.G, sys, now);
  flyOrbit(88, probeP * 0.5, probeP / 200, a.G, 2 * YEAR);
  check('ground mapped after a sale is dated by itself', Math.abs(Sv.ageFactor(rec2, rec2.t) - 1) < 0.01,
        Sv.ageFactor(rec2, rec2.t).toFixed(3));
})();

console.log('--- one array cell does not upgrade a scanner survey ---');
(function () {
  LVL = 1;
  var s = flyOrbit(88, probeP * 12, probeP / 200);
  var scanOnly = Sv.value(s.rec, sys, s.rec.t);
  LVL = 2;
  flyOrbit(88, probeP * 0.01, probeP / 400, s.G, s.tEnd + 1);
  LVL = 1;
  var rec3 = s.rec, now = rec3.t;
  check('the array saw only a sliver', Sv.arrayCov(rec3) > 0 && Sv.arrayCov(rec3) < 0.1,
        Math.round(Sv.arrayCov(rec3) * 1000) / 10 + '%');
  var allArray = Object.assign({}, rec3, { cov2: rec3.cov });
  var v = Sv.value(rec3, sys, now), vArr = Sv.value(allArray, sys, now);
  check('it sells near scanner price, not array price', v < vArr * 0.7 && v >= scanOnly * 0.95,
        v + ' vs ' + vArr + ' all-array, ' + scanOnly + ' scanner only');
  check('the page shows grade words, not tonnes (array share under 10%)', Sv.arrayCov(rec3) < 0.1);
})();

console.log('--- saved careers keep their value ---');
(function () {
  var k = 'test:' + world.id;
  var v2 = Sv.value({ key: k, cov: 0.8, t: 0, grade: 2, soldCov: 0 }, sys, 0);
  var v2n = Sv.value({ key: k, cov: 0.8, cov2: 0.8, soldCov2: 0, t: 0, grade: 2, soldCov: 0 }, sys, 0);
  var v1 = Sv.value({ key: k, cov: 0.8, t: 0, grade: 1, soldCov: 0 }, sys, 0);
  var v1n = Sv.value({ key: k, cov: 0.8, cov2: 0, soldCov2: 0, t: 0, grade: 1, soldCov: 0 }, sys, 0);
  check('an old array survey is worth what it was', v2 === v2n && v2 > 0, v2 + ' / ' + v2n);
  check('an old scanner survey is worth what it was', v1 === v1n && v1 > 0, v1 + ' / ' + v1n);
  var old = { key: k, cov: 0.5, cells: polar.rec.cells, t: 0, grade: 2, soldCov: 0.2 };
  Sv.migrateRec(old);
  check('migrating an old array record carries its ground over', old.cov2 === 0.5 && old.cells2 === old.cells && old.soldCov2 === 0.2);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
