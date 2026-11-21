/* milsats.test.js - armed defence platforms (milsats.js, 2026-11-20).
 *
 *     node test/milsats.test.js
 *
 * Pinned:
 *   - where: high-authority systems and the border, never an outlaw hold;
 *     a pair per guarded orbital port, no more than PLAT_MAX a system; the
 *     same platforms every time;
 *   - on the rails: each rides its station's orbit, ahead or behind;
 *   - whom it shoots: you only when its owner wants you or you shot it;
 *     pirates in reach always; a pirate it kills is not your kill;
 *   - dark (its RTG out), it does not shoot;
 *   - your shots: the first is assault, the last is a navy-class kill;
 *   - its fuel is military work, posted at the owner's desks.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'galaxy', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
require('../src/scars.js');
var Combat = require('../src/combat.js');
require('../src/rumours.js');
var Cs = require('../src/comsats.js');
var Ms = require('../src/milsats.js');
var Missions = require('../src/missions.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen, Galaxy = global.Galaxy;
var DAY = 86400;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
}
var gal = Galaxy.build('kawartha');
function sysOf(st) { var s = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); s.starId = st.id; return s; }

console.log('--- where ---');
var withP = 0, outlawP = 0, overMax = 0, n = 0, sample = null, why = {};
for (var i = 0; i < 90; i++) {
  var st = gal.stars[i];
  if (!st.factionId) continue;
  var sys = sysOf(st);
  var ps = Ms.platformsFor(sys, st, gal);
  n++;
  if (ps.length) { withP++; why[ps[0].why] = (why[ps[0].why] || 0) + 1; }
  if (/^(outlaw|pb)/.test(st.factionId) && ps.length) outlawP++;
  if (ps.length > Ms.PLAT_MAX) overMax++;
  if (!sample && ps.length >= 2) sample = { st: st, sys: sys, ps: ps };
}
check('some claimed systems have them, most do not', withP > 3 && withP < n * 0.5, withP + ' of ' + n + ' ' + JSON.stringify(why));
check('never an outlaw hold', outlawP === 0);
check('never more than the cap', overMax === 0);
var S = sample.sys, ST = sample.st, P = sample.ps;
var again = Ms.platformsFor(sysOf(ST), ST, gal);
check('the same platforms every time', JSON.stringify(again.map(function (p) { return p.id; })) === JSON.stringify(P.map(function (p) { return p.id; })));
check('a pair per guarded port, orbital and civilian', P.every(function (p) {
  var port = S.byId[p.port];
  return port && !port.surface && !Combat.fleetPort(port);
}) && P.filter(function (p) { return p.port === P[0].port; }).length === 2);

console.log('--- on the rails ---');
var p0 = P[0], port0 = S.byId[p0.port];
var ds = [0, 3600, 86400 * 3.3].map(function (t) { return V.dist(Ms.posOf(S, p0, t), Sim.bodyPosition(port0, S, t)); });
check('it holds station ' + Ms.PLAT_OFFSET_KM + ' km off its station, wherever the station goes', ds.every(function (d) { return d > 40 && d < 50; }), ds.map(function (d) { return d.toFixed(1); }).join(', ') + ' km');
var pb = P[1];
check('its partner guards another line', V.dist(Ms.posOf(S, p0, 0), Ms.posOf(S, pb, 0)) > 15,
      V.dist(Ms.posOf(S, p0, 0), Ms.posOf(S, pb, 0)).toFixed(1) + ' km apart');
/* Astra: "a pair of them that guard the most probable insertion
 * trajectories toward that station". Arrivals, sampled on their final
 * approach at times the corridors were NOT measured at, mostly come in
 * past one of the pair. */
var cor = Ms.corridorsOf(S, port0);
check('the corridors are measured off the traffic', cor && cor.samples > 0, cor && cor.samples + ' approach samples, ' + (cor.second ? 'two' : 'one') + ' corridor(s)');
var past = 0, all = 0;
(S.traffic || []).forEach(function (rt) {
  if (rt.dead || rt.kind === 'fleet' || rt.to !== port0.id || !(rt.period > 0)) return;
  for (var j = 5; j < 8; j++) {
    var ta = rt.t0 + j * rt.period + rt.cruise, tq = ta - Math.max(30, rt.cruise * Ms.APPROACH_FRAC);
    var st = Sim.trafficState(rt, S, tq);
    if (!st || !st.pos) continue;
    var sp = Sim.bodyPosition(port0, S, tq);
    var toShip = V.norm(V.sub(st.pos, sp));
    all++;
    if ([p0, pb].some(function (q) { return V.dot(toShip, V.norm(V.sub(Ms.posOf(S, q, tq), sp))) > 0.7; })) past++;
  }
});
check('and later arrivals mostly come in past one of the pair', all === 0 || past / all >= 0.5, past + ' of ' + all);

console.log('--- whom it shoots ---');
var t0 = 5 * DAY;
var G = { t: t0, here: ST, galaxy: gal, sys: S, wanted: {}, missions: [] };
var at = Ms.posOf(S, p0, t0);
G.ship = Sim.makeShip(V.add(at, { x: 5, y: 0, z: 0 }), Sim.bodyState(port0, S, t0).vel);
Combat.initShip(G.ship);
var hull0 = G.ship.hullHp;
var said = [], hooks = { say: function (m) { said.push(m); } };
/* Everything here moves at orbital speed: put the ship 5 km off the
 * platform at the moment asked. */
function near(t, dx) { G.ship.pos = V.add(Ms.posOf(S, p0, t), { x: dx || 5, y: 0, z: 0 }); return t; }
check('an innocent is not a target', Ms.fireRound(S, G, p0, near(t0), hooks) === null && G.ship.hullHp === hull0);
G.wanted[p0.owner] = Combat.WANTED_HUNT + 1;
check('wanted by its owner, you are', Ms.fireRound(S, G, p0, near(t0 + 1), hooks) === 'you', said[0]);
check('it fires on a cooldown, not every frame', Ms.fireRound(S, G, p0, near(t0 + 1.1), hooks) === null);
G.wanted = {};
var hullNow = G.ship.hullHp + (G.ship.shieldHp || 0);
check('and the hit landed', G.ship.hullHp < hull0 || (G.ship.shield && G.ship.shieldHp < Combat.MODULES.shield.cap));
var pirate = { id: 'pz', name: 'Test Reaver', kind: 'pirate', faction: 'pb0', cls: 'fighter',
               live: { pos: null, vel: { x: 0, y: 0, z: 0 },
                       fwd: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } } };
function pirateNear(t) { near(t, 500); pirate.live.pos = V.add(Ms.posOf(S, p0, t), { x: 0, y: 6, z: 0 }); return t; }
S.patrols = (S.patrols || []).concat([pirate]);
var r1 = Ms.fireRound(S, G, p0, pirateNear(t0 + 10), hooks);
check('a pirate in reach is fired on', r1 === 'pirate' && pirate.hullHp < pirate.hullMax, pirate.hullHp + ' / ' + pirate.hullMax);
for (var k = 0; k < 40 && !pirate.dead; k++) Ms.fireRound(S, G, p0, pirateNear(t0 + 20 + k * 2), hooks);
check('and killed, and it is not your kill', pirate.dead && !(Combat.bountyTotal(G) > 0) && pirate.killedBy && pirate.killedBy.kind === 'platform',
      pirate.killedBy && pirate.killedBy.name);
S.patrols = S.patrols.filter(function (x) { return x !== pirate; });

console.log('--- dark ---');
var lapseT = null;
for (var d = 1; d < 2000 && lapseT === null; d += 2) {
  var L = Cs.darkSpan({}, ST.id, p0.id, d * DAY);
  if (L) lapseT = (L.from + L.to) / 2;
}
check('its RTG lapses now and then', lapseT !== null);
if (lapseT !== null) {
  var Gd = { t: lapseT, here: ST, galaxy: gal, wanted: {}, ship: G.ship };
  Gd.wanted[p0.owner] = Combat.WANTED_HUNT + 1;
  G.ship.pos = V.add(Ms.posOf(S, p0, lapseT), { x: 5, y: 0, z: 0 });
  check('dark, it does not shoot', Ms.isDark(Gd, p0, lapseT) && Ms.fireRound(S, Gd, p0, lapseT, hooks) === null);
  var other = (S.ports || []).filter(function (x) { return x.market && x.faction === p0.owner; })[0];
  var offs = other ? Missions.boardAt(other, S, gal, ST, lapseT, Gd).filter(function (o) { return o.relayLapse && o.relayLapse.platform; }) : [];
  var mine = offs.filter(function (o) { return o.relayLapse.body === p0.id; })[0];
  check('its fuel is posted at its owner\'s desks', !!mine && mine.toPortId === p0.port && mine.bring, mine && mine.text + ' (' + mine.pay + ' cr)');
  check('and pays as the navy pays', mine && mine.pay >= 0.999 * 2 * Cs.RTG_LOAD_T * 1400 * Missions.RELAY_PAY_PER_T);
  var Gf = { rtgFixed: {} }, saidF = [];
  Missions.relayDelivered(Gf, { relayLapse: mine.relayLapse }, lapseT, { say: function (m) { saidF.push(m); } });
  check('delivered, it is armed again', !Ms.isDark(Gf, p0, lapseT + 60) && /armed/.test(saidF[0] || ''), saidF[0]);
}

console.log('--- your shots ---');
var Gs = { t: t0, here: ST, galaxy: gal, wanted: {}, ship: G.ship };
var aim = Ms.posOf(S, p0, t0);
var from = V.add(aim, { x: -3, y: 0, z: 0 });
var hit = Ms.onRay(S, Gs, t0, from, { x: 1, y: 0, z: 0 }, 10);
check('a shot down the line lands on it', hit && hit.plat === p0 && Math.abs(hit.dist - 3) < 0.05, hit && hit.dist.toFixed(3));
check('one that passes wide does not', !Ms.onRay(S, Gs, t0, from, V.norm({ x: 1, y: 0.05, z: 0 }), 10));
check('combat asks it', Combat.api.platformOnRay === Ms.onRay);
var saidS = [];
Gs.ship.pos = from;
Ms.struck(S, Gs, t0, hit, 20, { say: function (m) { saidS.push(m); } });
check('the first is assault, and it answers', Gs.wanted[p0.owner] === Combat.BOUNTY.assault && Ms.hostileToYou(Gs, p0, t0 + 5), saidS[0]);
check('it is scarred where it was hit', p0.scars && p0.scars.length === 1);
Ms.struck(S, Gs, t0 + 2, hit, 20, null);
check('the second is not booked again', Gs.wanted[p0.owner] === Combat.BOUNTY.assault);
Ms.struck(S, Gs, t0 + 4, hit, Ms.PLAT_HULL, { say: function (m) { saidS.push(m); } });
check('the last is a navy-class kill', Ms.isDead(Gs, p0) && Gs.wanted[p0.owner] === Combat.BOUNTY.assault + Combat.BOUNTY.killNavy, saidS[saidS.length - 1]);
check('a dead one takes no more shots', !Ms.onRay(S, Gs, t0 + 5, from, { x: 1, y: 0, z: 0 }, 10) || Ms.onRay(S, Gs, t0 + 5, from, { x: 1, y: 0, z: 0 }, 10).plat !== p0);
check('and does not shoot', Ms.fireRound(S, Gs, p0, t0 + 100, null) === null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
