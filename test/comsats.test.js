/* comsats.test.js - the relay network and your com-sat (comsats.js, 2026-11-20).
 *
 *     node test/comsats.test.js
 *
 * Pinned:
 *   - the public relays are a pure function of the system and its star:
 *     three round every world with a port, none in a nobody's system;
 *   - line of sight: a relay over a surface port's horizon is seen, one
 *     behind its world is not; most ports are linked, islands are rare;
 *   - your com-sat launched from orbit sits where the ship was, on a
 *     circular orbit at the ship's height, in the ship's orbital plane;
 *   - the chain: no com-sat, no live prices; with one, stars connected to
 *     it are read at an hour a hop while you are on its network, and not
 *     when you are off it;
 *   - the trade analyser takes the chain's age when given one.
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
var Cs = require('../src/comsats.js');
var TA = require('../src/tradeanalyser.js');
var V = global.V;
var DAY = 86400;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
function sysOf(st) { var s = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); s.starId = st.id; return s; }

console.log('--- the public relays ---');
var N = Math.min(40, gal.stars.length), worlds = 0, relays = 0, emptyRelays = 0, ports = 0, islands = 0, sample = null;
for (var i = 0; i < N; i++) {
  var st = gal.stars[i], sys = sysOf(st);
  var rl = Cs.relaysFor(sys, st.id);
  if (!(sys.ports || []).length) { emptyRelays += rl.length; continue; }
  var ws = {};
  sys.ports.forEach(function (p) { if (p.parentBody && (p.parentBody.kind === 'planet' || p.parentBody.kind === 'moon')) ws[p.parentBody.id] = 1; });
  worlds += Object.keys(ws).length;
  relays += rl.length;
  [0, 3.3 * DAY, 41 * DAY].forEach(function (t) {
    sys.ports.forEach(function (p) {
      if (!p.market) return;
      ports++;
      if (Cs.isIsland({}, sys, st.id, p, t)) islands++;
    });
  });
  if (!sample && sys.ports.some(function (p) { return p.surface && p.parentBody && p.parentBody.kind === 'planet'; })) sample = { st: st, sys: sys };
}
check('three round every world with a port', relays === worlds * Cs.RELAYS_PER_WORLD, relays + ' relays, ' + worlds + ' worlds');
check('none in a nobody\'s system', emptyRelays === 0);
check('most ports are linked; islands are rare', islands / ports < 0.15, islands + ' islands of ' + ports + ' port-moments');
var s2 = sysOf(sample.st);
check('the same relays twice', JSON.stringify(Cs.relaysFor(s2, sample.st.id)) === JSON.stringify(Cs.relaysFor(sample.sys, sample.st.id)));

console.log('--- line of sight ---');
var pad = sample.sys.ports.filter(function (p) { return p.surface && p.parentBody.kind === 'planet'; })[0];
var w = pad.parentBody, t = 5 * DAY;
var P = Sim.bodyPosition(pad, sample.sys, t), C = Sim.bodyPosition(w, sample.sys, t);
var up = V.sub(P, C), ul = V.len(up);
var over = V.add(C, V.scale(up, 5 * w.radius / ul)), behind = V.add(C, V.scale(up, -5 * w.radius / ul));
check('a relay overhead is seen', Cs.sees(sample.sys, pad, over, t));
check('one behind the world is not', !Cs.sees(sample.sys, pad, behind, t));

console.log('--- your com-sat ---');
var G = { comsats: [], galaxy: gal };
var bs = Sim.bodyState(w, sample.sys, t);
var r = w.radius * 3, mu = global.V.G ? global.V.G * w.mass : 6.6743e-20 * w.mass, vc = Math.sqrt(mu / r);
var e1 = { x: 0.6, y: 0.8, z: 0 }, e2 = { x: -0.48, y: 0.36, z: 0.8 };   // a tilted plane
G.ship = Sim.makeShip(V.add(bs.pos, V.scale(e1, r)), V.add(bs.vel, V.scale(e2, vc)));
Sim.refreshShip(G.ship);
G.ship.credits = 200000;
var yard = { market: { role: 'shipyard' } }, bar = { market: { role: 'agri' } };
check('sold at a yard, not a farm port', !Cs.buyRefusal(G, yard) && /shipyards/.test(Cs.buyRefusal(G, bar) || ''));
check('nothing to launch, it says so', /no com-sat aboard/.test(Cs.launchRefusal(G, sample.sys, t) || ''));
var b1 = Cs.buy(G, yard);
check('bought', b1.ok && G.ship.comsats === 1 && G.ship.credits === 200000 - Cs.SAT_PRICE);
G.ship.docked = 'x';
check('not from the deck', /from orbit/.test(Cs.launchRefusal(G, sample.sys, t) || ''));
G.ship.docked = null;
var dom = Sim.dominantBody(G.ship.pos, sample.sys, t);
var ln = Cs.launch(G, sample.sys, sample.st.id, t, sample.st.name);
check('launched round the world you are at', ln.ok && G.ship.comsats === 0 && ln.sat.body === dom.id, (ln.text || ln.why) + ' (dominant ' + dom.name + ')');
check('round the planet itself', ln.ok && ln.sat.body === w.id);
if (ln.ok && ln.sat.body === w.id) {
  var sp = Cs.satPos(sample.sys, ln.sat, t);
  check('where the ship was', V.dist(sp, G.ship.pos) < r * 1e-6, V.dist(sp, G.ship.pos).toExponential(2) + ' km');
  check('at the ship\'s height', Math.abs(ln.sat.a - r) < r * 1e-9);
  var dt = ln.sat.period / 4, sp2 = Cs.satPos(sample.sys, ln.sat, t + dt), c2 = Sim.bodyPosition(w, sample.sys, t + dt);
  var dir = V.scale(V.sub(sp2, c2), 1 / r);
  check('and goes the way the ship was going', Math.abs(dir.x - e2.x) < 1e-6 && Math.abs(dir.y - e2.y) < 1e-6 && Math.abs(dir.z - e2.z) < 1e-6,
        JSON.stringify({ x: +dir.x.toFixed(4), y: +dir.y.toFixed(4), z: +dir.z.toFixed(4) }));
}

console.log('--- the chain ---');
var here = sample.st;
var far = null, hops = Cs.hopsFrom({ comsats: [] }, gal, here);
Object.keys(hops).forEach(function (id) { if (!far && hops[id] >= 2) far = gal.stars.filter(function (s) { return s.id === id; })[0]; });
check('the network reaches past the next star', !!far, far && far.name + ', ' + hops[far.id] + ' hops');
check('no com-sat, no live prices', Cs.ageDaysFor({ comsats: [] }, gal, here, far) === null);
var Gc = { comsats: [{ id: 'cs-x', star: here.id, body: w.id, a: 1, inc: 0, lan: 0, m0: 0, period: 1 }] };
var age = Cs.ageDaysFor(Gc, gal, here, far);
check('with one, an hour a hop', age !== null && Math.abs(age * 24 - hops[far.id] * Cs.HOP_H) < 1e-9, age !== null && (age * 24) + ' h');
/* Off the network: a star nobody claims and no sat of yours is not a node. */
var lonely = gal.stars.filter(function (s) { return !s.factionId; })[0];
check('off its network, freighters again', !lonely || Cs.ageDaysFor(Gc, gal, lonely, far) === null);
var Gl = { comsats: Gc.comsats.concat([{ id: 'cs-y', star: lonely ? lonely.id : 'none', body: 'b0' }]) };
var lHops = lonely ? Cs.hopsFrom(Gl, gal, lonely) : {};
check('your sat makes a nobody\'s star a node', !lonely || lHops[lonely.id] === 0);

console.log('--- the analyser ---');
var rep = TA.systemReport(sysOf(far), far, Galaxy.distance3(here, far), 100 * DAY, null, age);
var rep0 = TA.systemReport(sysOf(far), far, Galaxy.distance3(here, far), 100 * DAY, null);
check('by the chain, hours old', rep.chain && Math.abs(rep.at - (100 * DAY - age * DAY)) < 1e-6);
check('by freighter, days', !rep0.chain && rep0.ageDays > age, rep0.ageDays.toFixed(2) + ' d');

console.log('--- RTGs: when relays go dark (slice 2) ---');
var Eco = global.Economy;
check('RTG fuel is a good, and legal', !!Eco.BY_ID.rtgfuel && !Eco.BY_ID.rtgfuel.contraband);
/* How much of the time a world's relays are dark, over five years. */
var darkS = 0, allS = 0, aLapse = null;
for (var k = 0; k < 30; k++) {
  var stK = gal.stars[k], sysK = sysOf(stK), seenW = {};
  Cs.relaysFor(sysK, stK.id).forEach(function (rl) {
    if (seenW[rl.body]) return;
    seenW[rl.body] = 1;
    for (var d = 0; d < 1825; d += 3) {
      allS++;
      var sp = Cs.darkSpan({}, stK.id, rl.body, d * DAY);
      if (sp) { darkS++; if (!aLapse && sp.from > 60 * DAY) aLapse = { st: stK, sys: sysK, L: sp }; }
    }
  });
}
check('dark only now and then', darkS / allS > 0.003 && darkS / allS < 0.06, (100 * darkS / allS).toFixed(2) + '% of world-days');
check('a lapse to look at', !!aLapse);
var L = aLapse.L, lw = aLapse.sys.byId[L.body];
var lport = aLapse.sys.ports.filter(function (p) { return p.market && p.parentBody === lw; })[0];
var mid = (L.from + L.to) / 2;
check('its world\'s ports are islands while it lasts', Cs.isIsland({}, aLapse.sys, aLapse.st.id, lport, mid + 1),
      lw.name + ', ' + Math.round((L.to - L.from) / DAY) + ' days dark');
check('posted a month before', !Cs.lapsePosted({}, aLapse.st.id, L.body, L.from - (Cs.RTG_POST + 1) * DAY) &&
      !!Cs.lapsePosted({}, aLapse.st.id, L.body, L.from - (Cs.RTG_POST - 1) * DAY));
var Gf = {};
Cs.fixLapse(Gf, L, L.from - 5 * DAY);
check('fuelled in time, it never goes dark', !Cs.darkSpan(Gf, aLapse.st.id, L.body, mid) && !Cs.lapsePosted(Gf, aLapse.st.id, L.body, mid));
var Gl2 = {};
Cs.fixLapse(Gl2, L, mid);
check('fuelled late, it lights that day', !!Cs.darkSpan(Gl2, aLapse.st.id, L.body, mid - DAY) && !Cs.darkSpan(Gl2, aLapse.st.id, L.body, mid + DAY));

console.log('--- a break in the chain (Astra, 2026-11-20) ---');
/* A claimed star whose uplink is dark at some moment, with claimed
 * neighbours on both sides. */
var brk = null;
for (var bi = 0; bi < gal.stars.length && !brk; bi++) {
  var sx = gal.stars[bi];
  if (!sx.factionId) continue;
  for (var dd = 0; dd < 1825 && !brk; dd += 5) {
    var sp2 = Cs.darkSpan({}, sx.id, Cs.UPLINK, dd * DAY);
    if (sp2) brk = { st: sx, t: (sp2.from + sp2.to) / 2, L: sp2 };
  }
}
check('an uplink goes dark somewhere', !!brk, brk && brk.st.name + ', day ' + Math.round(brk.t / DAY));
var nbX = Cs.neighbours(gal)[brk.st.id].filter(function (s) { return s.factionId; });
var Gb = { comsats: [], t: brk.t };
var fromN = nbX[0], hB = Cs.hopsFrom(Gb, gal, fromN);
check('while it is dark, the chain does not pass through it', hB[brk.st.id] === undefined);
var reachDark = Object.keys(hB).length;
var Gfix = { comsats: [], t: brk.t };
Cs.fixLapse(Gfix, brk.L, brk.t);
var hF = Cs.hopsFrom(Gfix, gal, fromN);
check('fuelled, it is a link again', hF[brk.st.id] !== undefined && Object.keys(hF).length >= reachDark,
      reachDark + ' stars reached broken, ' + Object.keys(hF).length + ' joined');
var Gsat = { comsats: [{ id: 'cs-b', star: brk.st.id, body: 'b1', at: brk.t - DAY }], t: brk.t };
check('or a com-sat of yours there bridges it', Cs.hopsFrom(Gsat, gal, fromN)[brk.st.id] !== undefined);
var nBroken = 0;
nbX.forEach(function (n) { if (Cs.hopsFrom(Gb, gal, n)[nbX[0].id] === undefined) nBroken++; });
check('each half still works on its own', Object.keys(hB).length > 1, nBroken + ' of ' + nbX.length + ' neighbours cut off from the first');

console.log('--- the RELAY panel\'s helpers ---');
var pathB = Cs.chainPath(Gb, gal, fromN, nbX[nbX.length - 1]);
check('the chain as built runs through the dark star', pathB.length >= 2, pathB.map(function (s) { return s.name; }).join(' - '));
var viaDark = Cs.chainPath(Gb, gal, nbX[0], nbX.filter(function (n) { return Cs.hopsFrom(Gb, gal, nbX[0])[n.id] === undefined; })[0] || nbX[0]);
check('and shows the break where it is', viaDark.length < 2 || viaDark.some(function (s) { return Cs.nodeState(Gb, s) === 'down'; }),
      viaDark.map(function (s) { return s.name + ':' + Cs.nodeState(Gb, s); }).join(' - '));
var Gg = { comsats: [], t: 0, relaysGone: {} };
Gg.relaysGone[brk.st.id] = true;
check('destroyed but expected is its own state', Cs.nodeState(Gg, brk.st) === 'gone' && Cs.nodeState({ comsats: [], t: 0 }, fromN) === 'up');
var pc = Sim.bodyPosition(lw, aLapse.sys, 10 * DAY);
var con = Cs.connectedTo({}, aLapse.sys, aLapse.st.id, { x: pc.x + lw.radius * 3, y: pc.y, z: pc.z }, 10 * DAY);
check('a ship near a lit world is linked to one of its relays', !!con && !con.mine && con.relay.body === lw.id && con.dist > 0, con && con.name);

console.log('--- the contract ---');
var Ms2 = require('../src/missions.js');
var other = aLapse.sys.ports.filter(function (p) { return p.market && p !== lport; })[0] || lport;
var tPost = L.from - 10 * DAY;
var offs = Ms2.boardAt(other, aLapse.sys, gal, aLapse.st, tPost, { digs: {} }).filter(function (o) { return o.relayLapse; });
var rOff = offs.filter(function (o) { return o.relayLapse.key === L.key; })[0];
check('every port posts it', !!rOff, rOff && rOff.text + ' (' + rOff.pay + ' cr)');
check('bring your own fuel, to the world\'s port', rOff && rOff.bring && rOff.cid === 'rtgfuel' && rOff.toPortId === lport.id);
check('it pays for the fuel and the trip', rOff && rOff.pay > rOff.tonnes * Eco.BY_ID.rtgfuel.base * 1.5);
var Gd = {}, saidR = [];
Ms2.relayDelivered(Gd, { relayLapse: rOff.relayLapse }, tPost, { say: function (s) { saidR.push(s); } });
check('delivered, the lapse is fixed', !Cs.darkSpan(Gd, aLapse.st.id, L.body, mid) && /will not go dark/.test(saidR[0] || ''), saidR[0]);

console.log('--- the refinery ---');
var refN = 0, refSys = null;
for (var q2 = 0; q2 < 40 && !refSys; q2++) {
  var sq = sysOf(gal.stars[q2]);
  if (Cs.attachRefineries(sq)) { refSys = sq; refN++; }
}
check('a reprocessing port refines RTG fuel', !!refSys);
if (refSys) {
  var rp = refSys.ports.filter(function (p) { return p.isotopeRefinery; })[0];
  var pq = Eco.price(rp, 'rtgfuel', 10 * DAY);
  check('and sells it', pq && pq.buy > 0 && rp.market.rows.waste !== undefined, rp.name + ' asks ' + (pq && Math.round(pq.buy)) + ' cr/t');
  check('once, however often the system is handed out', Cs.attachRefineries(refSys) === 0);
}

console.log('--- your com-sat\'s fuel ---');
var sat0 = { id: 's', star: here.id, body: w.id, bodyName: w.name, at: 0, a: 1, inc: 0, lan: 0, m0: 0, period: 1 };
check('a load lasts a year', Cs.satLive(sat0, 364 * DAY) && !Cs.satLive(sat0, 366 * DAY));
var Gdark = { comsats: [sat0], t: 400 * DAY };
check('a dark sat reads nothing', Cs.ageDaysFor(Gdark, gal, here, far) === null && Cs.reachHere(Gdark, gal, here).dark);
var Gr = { comsats: [sat0], t: 400 * DAY };
Gr.ship = Sim.makeShip(V.add(Sim.bodyPosition(w, sample.sys, Gr.t), { x: w.radius * 3, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
Gr.ship.cargo = {};
check('refuelling wants a tonne aboard', /RTG fuel aboard/.test(Cs.refuelRefusal(Gr, sample.sys, here.id, Gr.t).why || ''));
Gr.ship.cargo.rtgfuel = 2;
var rf = Cs.refuel(Gr, sample.sys, here.id, Gr.t);
check('refuelled, it is live for another year', rf.ok && Cs.satLive(sat0, Gr.t + 300 * DAY) && Gr.ship.cargo.rtgfuel === 1, rf.text || rf.why);

console.log('--- the hop limit: hubs (Astra, 2026-11-20) ---');
/* A claimed star with no dark uplink today, and one sat there. */
var tH = 10 * DAY, hubSt = gal.stars.filter(function (s) { return s.factionId && !Cs.uplinkDark({}, s.id, tH); })[0];
var oneHub = { t: tH, comsats: [{ id: 'h1', star: hubSt.id, body: 'b1', at: tH - DAY }] };
var rH = Cs.reachFrom(oneHub, gal, hubSt);
var maxH = Math.max.apply(null, Object.keys(rH).map(function (k) { return rH[k]; }));
var whole = Object.keys(Cs.hopsFrom(oneHub, gal, hubSt)).length;
check('one sat reaches only ' + Cs.SAT_HOPS + ' hops round it', maxH <= Cs.SAT_HOPS && Object.keys(rH).length < whole,
      Object.keys(rH).length + ' stars of the ' + whole + ' on its chain');
var edge = Object.keys(rH).filter(function (k) { return rH[k] === Cs.SAT_HOPS; })[0];
var edgeSt = gal.stars.filter(function (s) { return s.id === edge; })[0];
var twoHubs = { t: tH, comsats: oneHub.comsats.concat([{ id: 'h2', star: edge, body: 'b1', at: tH - DAY }]) };
var rH2 = Cs.reachFrom(twoHubs, gal, hubSt);
check('a second sat at the edge is a hub: the reach grows past it', Object.keys(rH2).length > Object.keys(rH).length,
      Object.keys(rH).length + ' -> ' + Object.keys(rH2).length + ' stars (hub at ' + (edgeSt && edgeSt.name) + ')');
var beyond = Object.keys(rH2).filter(function (k) { return rH[k] === undefined; })[0];
var bSt = gal.stars.filter(function (s) { return s.id === beyond; })[0];
check('and what lies past it is read at an hour a hop', bSt && Cs.ageDaysFor(twoHubs, gal, hubSt, bSt) === rH2[beyond] * Cs.HOP_H / 24 &&
      Cs.ageDaysFor(oneHub, gal, hubSt, bSt) === null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
