/* digs.test.js - the world's own drilling teams (digs.js, 2026-11-19).
 *
 *     node test/digs.test.js
 *
 * Pinned:
 *   - a star's digs are a pure function of its system and its id: the same
 *     plan twice, and another star's plan does not move it;
 *   - the bump is gentle: about one dig a system, a small share of them
 *     already through by day 0 (the extra ports from the start);
 *   - only landable worlds, never a nobody's system, and on dry ground;
 *   - a dig's port is put into its system only once it is open, with the
 *     schedule's id, the dig's spot, and routes whose clocks start on her
 *     opening day; asking twice adds nothing;
 *   - nothing the generator made moves: every existing body keeps its id,
 *     place and name, and every existing route stays as it was;
 *   - supplies bring the day forward, never before half the dig or before
 *     the day they were delivered;
 *   - it is said once, on the day, and not for a port years old.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
require('../src/sim.js');
try { require('../src/weather.js'); } catch (e) { console.log('  (no weather: ' + e.message + ')'); }
var Dg = require('../src/digs.js');
var DAY = 86400;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
function sysOf(st) { var s = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); s.starId = st.id; return s; }

console.log('--- the plan ---');
var N = Math.min(60, gal.stars.length), total = 0, before0 = 0, systemsWith = 0, empties = 0, emptyDigs = 0;
var badWorld = 0, wet = 0, sample = null, sampleSys = null;
var W = global.Weather;
for (var i = 0; i < N; i++) {
  var st = gal.stars[i], sys = sysOf(st);
  var plan = Dg.planFor(sys, st.id);
  var hasPort = (sys.ports || []).length > 0;
  if (!hasPort) { empties++; emptyDigs += plan.length; }
  if (plan.length) systemsWith++;
  plan.forEach(function (d) {
    total++;
    if (d.doneAt0 <= 0) before0++;
    var b = sys.byId[d.body];
    if (!Dg.landable(b)) badWorld++;
    if (W && W.dryAt && W.padDir && !W.dryAt(b, W.padDir(b, d.lat, d.lon))) wet++;
    if (!sample && d.startAt < 200 * DAY && d.doneAt0 > 200 * DAY) { sample = d; sampleSys = st; }
  });
}
check('under one dig a system, gently', total / N > 0.2 && total / N < 1.2, (total / N).toFixed(2) + ' a system, ' + systemsWith + ' of ' + N + ' systems');
check('a few are through before day 0', before0 > 0 && before0 / total < 0.4, before0 + ' of ' + total);
check('only landable worlds', badWorld === 0);
check('on dry ground', wet === 0, wet + ' wet');
check('never in a nobody\'s system', emptyDigs === 0, empties + ' empty systems');
check('a dig going at day 200 to look at', !!sample, sample && sample.bodyName);

var sysA = sysOf(sampleSys), sysB = sysOf(sampleSys);
var pa = Dg.planFor(sysA, sampleSys.id), pb = Dg.planFor(sysB, sampleSys.id);
check('the same plan twice', JSON.stringify(pa) === JSON.stringify(pb));

console.log('--- the port it opens ---');
var dig = pa.filter(function (d) { return d.id === sample.id; })[0];
var bodiesBefore = sysA.bodies.map(function (b) { return b.id + ':' + b.name + ':' + (b.lat || '') + ':' + (b.orbit ? b.orbit.a : ''); }).join('|');
var routesBefore = JSON.stringify((sysA.traffic || []).map(function (r) { return [r.id, r.from, r.to, r.t0, r.period]; }));
var G = { t: dig.startAt + 10 * DAY, digs: {} };
check('not open while they dig', Dg.inject(G, sysA, sampleSys.id) === 0 || !sysA.byId[dig.id]);
check('the scanner sees the dig', Dg.active(G, sysA, sampleSys.id, G.t).some(function (d) { return d.id === dig.id; }) &&
      /drillers at work/.test(Dg.statusLine(G, dig, G.t)), Dg.statusLine(G, dig, G.t));
G.t = Dg.doneAt(G, dig) + 60;
Dg.inject(G, sysA, sampleSys.id);
var port = sysA.byId[dig.id];
check('open on its day', !!port && port.surface && port.dug && port.market, port && port.name + ' (' + (port.market && port.market.role) + ')');
check('at the dig\'s spot', port && port.lat === dig.lat && port.lon === dig.lon && port.parentBody === sysA.byId[dig.body]);
check('a mining head where nobody lives', !dig.mining || (port && port.market && port.market.role === 'mining'), port && port.market && port.market.role);
var mine = (sysA.traffic || []).filter(function (r) { return r.from === dig.id || r.to === dig.id; });
check('with routes from her opening day', mine.length > 0 && mine.every(function (r) { return Math.abs(r.t0 - Dg.doneAt(G, dig)) < 1; }), mine.length + ' routes');
var nPorts = sysA.ports.length;
Dg.inject(G, sysA, sampleSys.id);
check('asking twice adds nothing', sysA.ports.length === nPorts);
var bodiesAfter = sysA.bodies.filter(function (b) { return !b.dug; })
  .map(function (b) { return b.id + ':' + b.name + ':' + (b.lat || '') + ':' + (b.orbit ? b.orbit.a : ''); }).join('|');
check('nothing the generator made moved', bodiesAfter === bodiesBefore);
var routesAfter = JSON.stringify((sysA.traffic || []).filter(function (r) { return String(r.id).indexOf('ps|') !== 0; })
  .map(function (r) { return [r.id, r.from, r.to, r.t0, r.period]; }));
check('and no route of theirs changed', routesAfter === routesBefore);
var digPorts = Gen.generateSystem(sampleSys.seed, Galaxy.systemOpts(gal, sampleSys)).bodies.filter(function (b) { return b.dug; });
check('the generator itself makes none', digPorts.length === 0);

console.log('--- a dig through before day 0 ---');
var old = null, oldStar = null;
for (var j = 0; j < N && !old; j++) {
  var s2 = sysOf(gal.stars[j]);
  var p2 = Dg.planFor(s2, gal.stars[j].id).filter(function (d) { return d.doneAt0 < -30 * DAY; });
  if (p2.length) { old = p2[0]; oldStar = gal.stars[j]; }
}
check('found one', !!old);
if (old) {
  var s3 = sysOf(oldStar), said = [];
  var G0 = { t: 0, digs: {} };
  Dg.update(G0, s3, oldStar.id, 0, { say: function (l) { said.push(l); } });
  check('it is there from the start', !!s3.byId[old.id]);
  check('and not announced as news', said.length === 0, said[0]);
}

console.log('--- supplies ---');
var sysS = sysOf(sampleSys), dS = Dg.planFor(sysS, sampleSys.id).filter(function (d) { return d.id === sample.id; })[0];
var GS = { t: dS.startAt + 5 * DAY, digs: {} };
var d0 = Dg.doneAt(GS, dS);
var d1 = Dg.supply(GS, dS, GS.t, 2);
check('two batches bring it forward', Math.abs((d0 - d1) - 2 * Dg.SUPPLY_DAYS * DAY) < 1 || d1 === dS.startAt + 0.5 * (dS.doneAt0 - dS.startAt),
      ((d0 - d1) / DAY).toFixed(1) + ' days');
var d2 = Dg.supply(GS, dS, GS.t, 500);
check('never before half the dig', Math.abs(d2 - (dS.startAt + 0.5 * (dS.doneAt0 - dS.startAt))) < 1);
var late = Dg.doneAt(GS, dS) - DAY;
var GL = { t: late, digs: {} };
var dl = Dg.supply(GL, dS, late, 500);
check('never before the day it was delivered', dl >= late);
check('kept in G.digs, the only state', !!GS.digs[dS.id] && GS.digs[dS.id].supplied === 502);
var said2 = [];
GS.t = Dg.doneAt(GS, dS) + 60;
Dg.update(GS, sysS, sampleSys.id, GS.t, { say: function (l) { said2.push(l); } });
Dg.update(GS, sysS, sampleSys.id, GS.t + 60, { say: function (l) { said2.push(l); } });
check('announced once, on the day', said2.length === 1 && /opens today/.test(said2[0]), said2[0]);
check('on the earlier day', !!sysS.byId[dS.id] && GS.t < dS.doneAt0);

console.log('--- the work it posts ---');
var Ms = require('../src/missions.js');
var sysM = sysOf(sampleSys), dM = Dg.planFor(sysM, sampleSys.id).filter(function (d) { return d.id === sample.id; })[0];
var depot = Ms.digDepot(sysM, dM);
var Cb = (function () { try { return require('../src/combat.js'); } catch (e) { return global.Combat; } })();
check('the dig has a civilian depot', !!depot && !depot.dug && !(Cb && Cb.fleetPort && Cb.fleetPort(depot)), depot && depot.name + (depot.parentBody && depot.parentBody.id === dM.body ? ' (on the world)' : ''));
var GM = { t: dM.startAt + 3 * DAY, digs: {}, here: sampleSys };
var digWork = [], scanned = 0;
for (var w = 0; w < 12 && !digWork.length; w++) {
  var tw = GM.t + w * 2 * DAY;
  (sysM.ports || []).forEach(function (p) {
    if (p === depot || !p.market) return;
    scanned++;
    Ms.boardAt(p, sysM, gal, sampleSys, tw, GM).forEach(function (o) { if (o.dig === dM.id) digWork.push(o); });
  });
}
check('boards post work for the dig', digWork.length > 0, digWork.length + ' offers, e.g. "' + (digWork[0] && digWork[0].text) + '"');
check('all of it to the depot', digWork.every(function (o) { return o.toPortId === depot.id; }));
check('shoring is structural alloys, in batches', digWork.filter(function (o) { return o.type === 'haul'; })
  .every(function (o) { return o.cid === 'alloys' && o.tonnes % Ms.DIG_BATCH_T === 0; }));
var GD = { t: GM.t, digs: {}, here: sampleSys, sys: sysM };
var dBefore = Dg.doneAt(GD, dM), saidD = [];
Ms.digDelivered(GD, { dig: dM.id, type: 'haul', tonnes: 24 }, GD.t, { say: function (l) { saidD.push(l); } }, sysM);
check('delivered, the dig comes nearer', Math.abs((dBefore - Dg.doneAt(GD, dM)) - 3 * Dg.SUPPLY_DAYS * DAY) < 1, saidD[0]);
Ms.digDelivered(GD, { dig: dM.id, type: 'passage', souls: 3 }, GD.t, null, sysM);
check('and a relief crew is one batch more', Math.abs((dBefore - Dg.doneAt(GD, dM)) - 4 * Dg.SUPPLY_DAYS * DAY) < 1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
