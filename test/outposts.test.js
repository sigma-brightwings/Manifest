/* outposts.test.js - an outpost built by the drones on a claim (2026-11-19).
 *
 *     node test/outposts.test.js
 *
 * Pinned (outposts.js):
 *   - it takes two of your drones on a live claim, and the Guild's fee;
 *   - while they build, they dig nothing - the hoppers hold still until the
 *     day it stands, which is the drone-days of work over the drones;
 *   - once it stands each drone holds the outpost's bins, not 30 t, and the
 *     answer is closed-form (asking along the way changes nothing);
 *   - thieves come half as often;
 *   - N at the outpost empties the whole claim, and N beside a drone while
 *     it is still being built still empties that drone, without breaking
 *     the bigger bins later;
 *   - a drone set down during the build waits for it too;
 *   - it is announced once, when it stands.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
var Sv = require('../src/survey.js');
var Cl = require('../src/claims.js');
var Op = require('../src/outposts.js');
var V = global.V;
var DAY = 86400;

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
var sys = null, world = null;
var probe = Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
Sim.refreshShip(probe);
for (var si = 0; si < gal.stars.length && si < 80 && !world; si++) {
  var sy = Gen.generateSystem(gal.stars[si].seed, optsFor(gal.stars[si]));
  sy.bodies.forEach(function (b) {
    if (world || (b.kind !== 'planet' && b.kind !== 'moon')) return;
    if (Sim.surfaceG(b) > probe.maxAccel * 0.5) return;
    var rows = Sv.deposits(b, sy).filter(function (r) { return r.cid !== 'hydrogen' && r.tonnes > 0; });
    if (rows.length) { sys = sy; world = b; }
  });
}
check('a liftable world with ore', !!world, world && world.name);

var t0 = 1000 * DAY;
var G = { here: { id: 'test' }, sys: sys, t: t0, surveys: {}, claims: {}, drones: [], extracted: {}, outposts: [] };
var hs = Sim.bodyState(world, sys, t0);
var ship = Sim.makeShip(V.add(hs.pos, Sim.surfaceOffset(world, { lat: 0.3, lon: 1.1, elevation: 0.004 }, t0).pos), hs.vel);
Sim.refreshShip(ship);
ship.credits = 100000;
G.ship = ship;
ship.landed = true; ship.crashed = false; ship.landedAt = Sim.landSpot(world, sys, t0, ship.pos);
var key = Cl.keyOf(G, world.id);
G.surveys[key] = { key: key, cov: 0.6, t: t0 };
check('claim filed', Cl.fileClaim(G, sys, world, t0).ok);
Cl.buyDrone(G); Cl.buyDrone(G);

/* Two drones on two good cells, the way a prospector who read the map would. */
var m = Sv.groundMap(world, sys), cells = [];
if (m && m.grade.ores) {
  var idx = []; for (var i = 0; i < Sv.NCELL; i++) idx.push(i);
  idx.sort(function (a, b) { return m.grade.ores[b] - m.grade.ores[a]; });
  cells = [idx[0], idx[400]];
}
function landOn(cell, t) {
  var la = Math.floor(cell / Sv.LON_BINS), lo = cell % Sv.LON_BINS;
  ship.landedAt.lat = -Math.PI / 2 + (la + 0.5) * Math.PI / Sv.LAT_BINS;
  ship.landedAt.lon = (lo + 0.5) * 2 * Math.PI / Sv.LON_BINS;
  Sim.updateLandedShip(ship, sys, t);
}
landOn(cells[0], t0);
var r1 = Cl.act(G, sys, t0);
check('first drone down', r1.ok, r1.text || r1.why);
var d1 = G.drones[0];
check('one drone is not enough', /takes 2 drones/.test(Op.refusal(G, sys, t0, d1.id) || ''), Op.refusal(G, sys, t0, d1.id));
landOn(cells[1], t0);
var r2 = Cl.act(G, sys, t0);
check('second drone down', r2.ok && G.drones.length === 2, r2.text || r2.why);
var d2 = G.drones[1];
G.drones.forEach(function (d) { d.stripRate = 1e-9; });      // quiet, for the arithmetic

console.log('--- ordering it ---');
var tO = t0 + 10 * DAY;
var held1 = Cl.hopper(G, d1, tO).tonnes, held2 = Cl.hopper(G, d2, tO).tonnes;
var cr = ship.credits;
var o = Op.order(G, sys, tO, d1.id);
check('two drones on a live claim build it', o.ok, o.text || o.why);
check('the Guild takes its fee', ship.credits === cr - Op.OUTPOST_FEE);
check('it stands after the work over the drones', Math.abs(o.outpost.doneAt - tO - Op.OUTPOST_WORK / 2 * DAY) < 1e-6,
      ((o.outpost.doneAt - tO) / DAY) + ' days');
check('it stands where the drone does', o.outpost.at.lat === d1.at.lat && o.outpost.at.lon === d1.at.lon);
check('one to a claim', /already building/.test(Op.refusal(G, sys, tO, d2.id) || ''));
var mid = tO + 0.5 * (o.outpost.doneAt - tO);
check('while they build they dig nothing', Cl.hopper(G, d1, mid).tonnes === held1 && Cl.hopper(G, d2, mid).tonnes === held2,
      held1.toFixed(2) + ' t, ' + held2.toFixed(2) + ' t');
check('the thieves are halved', Math.abs(d1.stripRate - 1e-9 * Op.OUTPOST_STRIP) < 1e-20);

console.log('--- a drone emptied during the build ---');
landOn(cells[1], mid);
var cm = Cl.act(G, sys, mid);
check('N beside a drone still empties it', cm.ok && cm.taken === Math.floor(held2), cm.text || cm.why);
check('and it waits for the outpost before digging again', d2.baseT === o.outpost.doneAt);
Cl.buyDrone(G);
landOn(cells[0] + 7, mid);
var r3 = Cl.act(G, sys, mid);
check('a drone set down during the build waits too', r3.ok && r3.drone.baseT === o.outpost.doneAt, r3.text || r3.why);
var d3 = r3.drone; d3.stripRate = 1e-9;

console.log('--- standing ---');
var said = [];
check('not announced before its day', Op.tick(G, mid, { say: function (s) { said.push(s); } }) === 0);
var tD = o.outpost.doneAt;
check('announced once on its day', Op.tick(G, tD + 1, { say: function (s) { said.push(s); } }) === 1 &&
      Op.tick(G, tD + 2, { say: function (s) { said.push(s); } }) === 0, said[0]);
var long = tD + 2000 * DAY;
G.claims[key].until = t0 + 20000 * DAY;      // renewed, year on year, for the long view
check('each drone now holds the bins', Cl.hopper(G, d1, long).tonnes === Op.OUTPOST_HOPPER &&
      Cl.hopper(G, d2, long).tonnes === Op.OUTPOST_HOPPER, Op.OUTPOST_HOPPER + ' t');
var t30 = tD + 30 * DAY, want = held1 + Cl.DRONE_RATE * d1.grade * 30;
check('and digs from the day it stood', Math.abs(Cl.hopper(G, d1, t30).tonnes - Math.min(Op.OUTPOST_HOPPER, want)) < 1e-9);
for (var k = 0; k < 20; k++) Cl.hopper(G, d1, tD + k * DAY);
check('asking along the way changes nothing', Math.abs(Cl.hopper(G, d1, t30).tonnes - Math.min(Op.OUTPOST_HOPPER, want)) < 1e-9);

console.log('--- emptying the claim at the outpost ---');
ship.cargo = {}; Sim.refreshShip(ship);
landOn(cells[0], t30);
var near = Op.near(G, sys, t30);
check('landed at it, the ship is at the outpost', near && near.id === o.outpost.id);
var b1 = Math.floor(Cl.hopper(G, d1, t30).tonnes), b2 = Math.floor(Cl.hopper(G, d2, t30).tonnes), b3 = Math.floor(Cl.hopper(G, d3, t30).tonnes);
var ca = Cl.act(G, sys, t30);
var aboard = Object.keys(ship.cargo).reduce(function (s, c) { return s + ship.cargo[c]; }, 0);
check('N empties every drone on the claim', ca.ok && Math.abs(aboard - Math.min(b1 + b2 + b3, Math.floor(ship.cargoCap))) <= 3,
      ca.text + '  (' + (b1 + b2 + b3) + ' t in the bins)');
check('and keeps its bins after', d1.baseT === t30 && Cl.hopper(G, d1, long + t30).tonnes === Op.OUTPOST_HOPPER);

console.log('--- the drilling team ---');
['crew', 'construction', 'licence', 'journal', 'stations'].forEach(function (m) {
  try { require('../src/' + m + '.js'); } catch (e) { console.log('  (could not load ' + m + ': ' + e.message + ')'); }
});
var Cw = global.Crew, St = global.Stations;
var op1 = o.outpost, tP = t30 + DAY;
landOn(cells[0], tP);
ship.crew = [Cw.make('Kes Lund', 'engineer', 3, 'e1'), Cw.make('Mira Sable', 'engineer', 5, 'e2'), Cw.make('Bo Quist', 'gunner', 2, 'g1')];
check('no engineers, no dig', (function () { var keep = ship.crew; ship.crew = [keep[2]]; var w = Op.postRefusal(G, sys, tP); ship.crew = keep; return /no engineers/.test(w || ''); })());
G.forgedBlanks = 1;                       // a licence, whether or not this system asks for one
ship.credits = 200000;
ship.cargo = {};
var post = Op.postTeam(G, sys, tP, null);
check('engineers go down to dig', post.ok, post.text || post.why);
check('setting them down costs nothing', ship.credits === 200000, ship.credits + ' cr');
check('with no stores on site they wait', Op.digDoneAt(op1) === Infinity && /no stores/.test(post.text));
check('the engineers are on the books, not aboard', Cw.aboard(ship).length === 3 && Cw.present(ship).length === 1 &&
      Cw.present(ship)[0].role === 'gunner');
var rate = Op.engRate({ rating: 3 }) + Op.engRate({ rating: 5 });
check('the team digs at its ratings', Math.abs(Op.teamRate(op1) - rate) < 1e-9, rate.toFixed(2) + ' a day');

console.log('--- the dig\'s stores ---');
check('nothing to unload, it says so', /no structural alloys/.test(Op.unloadRefusal(G, sys, tP) || ''));
ship.cargo = { alloys: 25 };
var un = Op.unloadStores(G, sys, tP);
check('alloys in the hold go down as stores', un.ok && un.tonnes === 25 && !ship.cargo.alloys && Math.abs(Op.stores(op1, tP) - 25) < 1e-9, un.text || un.why);
check('the dig wants the rest', Op.storesNeeded(op1, tP) === Op.DIG_STORES - 25, Op.storesNeeded(op1, tP) + ' t');
var w25 = 25 / Op.STORE_PER_WORK, stall = Op.stallAt(op1);
check('the stores run out on a formula', Math.abs(stall - (tP + w25 / rate * DAY)) < 1e-3, ((stall - tP) / DAY).toFixed(1) + ' days');
check('and the port waits on the rest', Op.digDoneAt(op1) === Infinity);
var saidS = [];
G.t = stall + 60;
Op.tickDig(G, stall + 60, { say: function (s) { saidS.push(s); } });
Op.tickDig(G, stall + 3600, { say: function (s) { saidS.push(s); } });
check('running out is said once', saidS.length === 1 && /run out of alloys/.test(saidS[0]), saidS[0]);
check('and the dig stands where the stores ran out', Math.abs(Op.dug(op1, stall + 30 * DAY) - w25) < 1e-6);
check('the status line says it is stalled', /STALLED/.test(Op.statusLine(G, op1, stall + DAY)) && /15 t short/.test(Op.statusLine(G, op1, stall + DAY)),
      Op.statusLine(G, op1, stall + DAY));
var tS = stall + 5 * DAY;
landOn(cells[0], tS);
check('stalled, it wants exactly the rest', Op.storesNeeded(op1, tS) === 15, Op.storesNeeded(op1, tS) + ' t');
ship.credits = 1000;
check('the Guild wants paying', /Guild wants/.test(Op.contractRefusal(G, sys, tS) || ''), Op.contractRefusal(G, sys, tS));
ship.credits = 200000;
var price15 = Op.contractPrice(15);
var ct = Op.contractStores(G, sys, tS);
check('the Guild brings the shortfall in, at a premium', ct.ok && ship.credits === 200000 - price15 &&
      price15 === Math.ceil(15 * Eco.BY_ID.alloys.base * Op.STORE_CONTRACT), ct.text || ct.why);
check('and the port is a formula again', Math.abs(Op.digDoneAt(op1) - (tS + (Op.DIG_WORK - w25) / rate * DAY)) < 1e-3,
      ((Op.digDoneAt(op1) - tS) / DAY).toFixed(1) + ' days');
check('nothing more to bring', Op.storesNeeded(op1, tS) === 0 && /all the stores/.test(Op.contractRefusal(G, sys, tS) || ''));
var legacy = { dig: { work: 30, at: 0, rate: 1, stock: null } };
check('a dig from before stores was paid in full', Op.digDoneAt(legacy) === 90 * DAY && Op.stallAt(legacy) === Infinity);

var tHalf = tS + 0.5 * (Op.digDoneAt(op1) - tS), wHalf = w25 + (Op.DIG_WORK - w25) / 2;
landOn(cells[0], tHalf);
var rc = Op.recallTeam(G, sys, tHalf);
check('fetched back half way', rc.ok && Cw.present(ship).length === 3, rc.text || rc.why);
check('the dig keeps what they did', Math.abs(Op.dug(op1, tHalf) - wHalf) < 1e-6 && Op.dug(op1, tHalf + 50 * DAY) === Op.dug(op1, tHalf));
check('and the stores they did not eat', Math.abs(Op.stores(op1, tHalf + 50 * DAY) - (Op.DIG_WORK - wHalf) * Op.STORE_PER_WORK) < 1e-6);
check('and goes no further without them', Op.digDoneAt(op1) === Infinity);
var tBack = tHalf + 10 * DAY;
var cr2 = ship.credits;
landOn(cells[0], tBack);
var post2 = Op.postTeam(G, sys, tBack, null);
check('a second trip down costs nothing more', post2.ok && ship.credits === cr2, post2.text || post2.why);
var doneAt = Op.digDoneAt(op1);
check('the rest takes the other half', Math.abs(doneAt - (tBack + (Op.DIG_WORK - wHalf) / rate * DAY)) < 1e-3);
var said2 = [];
check('nothing opens before the day', Op.tickDig(G, doneAt - 60, { say: function (s) { said2.push(s); } }) === 0 && !op1.port);
G.t = doneAt + 60;                       // the game asks at its own clock
check('on the day, a port of yours opens', Op.tickDig(G, doneAt + 60, { say: function (s) { said2.push(s); } }) === 1 && !!op1.port, said2[0]);
var stn = St.byId(G, op1.port);
check('a dug mining station, open from the day the dig finished', stn && stn.dug && stn.type === 'mining' && stn.kind === 'surface' &&
      Math.abs(St.opensAt(stn) - doneAt) < 1e-3);
check('standing where the outpost does', stn && stn.at.lat === op1.at.lat && stn.at.lon === op1.at.lon);
check('in the system, with no Crawler up-port', !!sys.byId[St.portId(stn)] && !sys.byId[St.upId(stn)],
      sys.byId[St.portId(stn)] && sys.byId[St.portId(stn)].name);
check('with traffic from the day it opened', (sys.traffic || []).some(function (r) { return (r.from === St.portId(stn) || r.to === St.portId(stn)) && r.t0 >= doneAt - 1; }));
check('her books run on what the dig cost', St.buildCost(stn) === Op.DUG_COST);
check('the outpost says so', /stands here/.test(Op.statusLine(G, op1, doneAt + 120)));
ship.landed = false; ship.docked = op1.portId;
check('dock there and the team comes aboard', Op.tick(G, doneAt + 3600, null) >= 1 && Cw.present(ship).length === 3 && !op1.team.length);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
