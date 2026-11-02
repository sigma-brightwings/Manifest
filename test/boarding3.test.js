/* boarding3.test.js — boarding part 3: a disabled ship, taken by force
 * (2026-10-31).
 *
 *     node test/boarding3.test.js
 *
 * Astra's answers: "Hull damage + aim" (her drive fails under a third of
 * her hull, and hits from astern count double), "Fly the suit" (you cross
 * on cold-gas jets with a pack that runs dry, on a safety line), "They
 * fight back" (a standoff that goes wrong throws you out and her gunners
 * open up on your ship), and "Pick, they shift it" (you point at a
 * container and her crew push it out of her lock for your scoop).
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/hulls.js');
require('../src/walk.js');
var SD = require('../src/shipdeck.js');
require('../src/render.js');
require('../src/npcmodel.js');
try { require('../src/captains.js'); } catch (e) { /* optional */ }
var Npc = require('../src/npc.js');
var D = require('../src/dialogue.js');
var AL = require('../src/airlock.js');
var Eva = require('../src/eva.js');
var V = global.V, R = global.Render;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function v3(x, y, z) { return { x: x, y: y, z: z }; }
function herSpec(over) {
  var s = { id: 'tst-' + (over && over.id || 'a'), name: 'Test Drover', kind: 'trader', cls: 'hauler', hullMax: 100, hullHp: 100,
            live: { pos: v3(0, 0, 0), vel: v3(0, 0, 0), fwd: v3(0, 0, 1), up: v3(0, 1, 0), right: v3(1, 0, 0) } };
  for (var k in (over || {})) s[k] = over[k];
  return s;
}

console.log('her drive: hull damage, and aim');
var a = herSpec();
check('a shot from ahead does not knock it out at a third of her hull', !Combat.driveHit(a, 34, v3(0, 0, 5)));
var b = herSpec();
check('the same shot from astern counts double, and it is out', Combat.driveHit(b, 34, v3(0, 0, -5)), 'drive damage ' + b.driveDmg);
var c = herSpec();
check('from abeam it counts once', !Combat.driveHit(c, 34, v3(5, 0, 0)) && c.driveDmg === 34);
check('two thirds of her hull from anywhere is enough', Combat.driveHit(herSpec(), 67, v3(0, 0, 5)));
check('a warship is never disabled', !Combat.driveHit(herSpec({ cls: 'capital' }), 1000, v3(0, 0, -5)));
check('the fail point is two thirds of her hull', Math.abs(Combat.DRIVE_FAIL - 0.67) < 1e-9);

console.log('disabling her');
var G = { seed: 's', ship: { credits: 5000, crew: [], cargo: {}, pos: v3(0, 0, 0.05), vel: v3(0, 0, 0), gun: 'pulse', fit: {} }, people: {}, t: 100 };
var sys = { id: 'sys', patrols: [], byId: {}, bodies: [], traffic: [] };
var d1 = herSpec({ id: 'd1' });
sys.patrols.push(d1);
Combat.disableNpc(sys, G, d1, 'drive', 100, null);
check('knocked out: dead in space, mode disabled', d1.disabled === 'drive' && d1.mode === 'disabled' && d1.live.disabled === 'drive');
check('knocked out, she has not surrendered', !d1.surrendered);
var d2 = herSpec({ id: 'd2', hostileToPlayer: true, defending: true });
Combat.disableNpc(sys, G, d2, 'surrender', 100, null);
check('struck: she stops shooting', d2.surrendered && !d2.hostileToPlayer && !d2.defending);
check('roll01 is a pure function', Combat.roll01('x', 'y') === Combat.roll01('x', 'y') && Combat.roll01('x', 'y') !== Combat.roll01('x', 'z'));
check('the law never strikes to you', Combat.surrenderOdds(sys, G, herSpec({ kind: 'police', cls: 'police' })) === 0);
var unarmedG = { ship: { credits: 0, fit: {} } };
check('nobody strikes to an unarmed ship', Combat.surrenderOdds(sys, unarmedG, herSpec()) === 0);
var holed = herSpec({ hullHp: 30 });
check('a holed ship is likelier to strike than a whole one', Combat.surrenderOdds(sys, G, holed) > Combat.surrenderOdds(sys, G, herSpec()));

console.log('the suit');
var e = Eva.start({ pos: v3(0, 0, 0), vel: v3(0, 0, 0), fwd: v3(0, 0, 1), up: v3(0, 1, 0) });
check('a full pack', e.gas === Eva.GAS_S && e.line);
for (var i = 0; i < 10; i++) Eva.step(e, { w: true }, 0.1, {});
check('one second on the jets is 0.6 m/s', Math.abs(V.len(e.vel) * 1000 - 0.6) < 1e-6, (V.len(e.vel) * 1000).toFixed(3) + ' m/s');
check('forward is the way you look', e.vel.z > 0 && Math.abs(e.vel.x) < 1e-12);
check('and it cost a second of gas', Math.abs(e.gas - (Eva.GAS_S - 1)) < 1e-9);
var e2 = Eva.start({ pos: v3(0, 0, 0), vel: v3(0, 0, 0), fwd: v3(0, 0, 1), up: v3(0, 1, 0) });
/* The game's right is fwd × up (render.js, settleLanded): here, -x. */
var right0 = V.cross(e2.f, e2.u);
Eva.look(e2, Math.PI / 2, 0);
check('positive yaw turns you right', V.dist(e2.f, right0) < 1e-9, JSON.stringify(e2.f));
var dry = Eva.start({ pos: v3(0, 0, 0), vel: v3(0, 0, 0), fwd: v3(0, 0, 1), up: v3(0, 1, 0) });
for (var j = 0; j < 600; j++) Eva.step(dry, { w: true }, 0.1, {});
check('the pack runs dry, and then the jets do nothing', dry.gas === 0 && Math.abs(V.len(dry.vel) * 1000 - 30) < 1e-6,
      (V.len(dry.vel) * 1000).toFixed(2) + ' m/s from a full pack');
var homeP = { pos: v3(0, 0, 0), vel: v3(0, 0, 0) };
var lnE = Eva.start({ pos: v3(0, 0, 0), vel: v3(0, 0, 0.01), fwd: v3(0, 0, 1), up: v3(0, 1, 0) });
for (var k = 0; k < 600; k++) Eva.step(lnE, {}, 0.1, { home: homeP });
check('the line stops you at its length', Math.abs(V.dist(lnE.pos, homeP.pos) - Eva.LINE_KM) < 1e-9 && lnE.taut);
check('with nothing outward left in you', V.dot(lnE.vel, v3(0, 0, 1)) <= 1e-12);
var gasBefore = lnE.gas;
for (var r = 0; r < 3000 && V.dist(lnE.pos, homeP.pos) > Eva.REACH_KM; r++) Eva.step(lnE, { h: true }, 0.1, { home: homeP });
check('H reels you back in, at no cost in gas', V.dist(lnE.pos, homeP.pos) <= Eva.REACH_KM && lnE.gas === gasBefore,
      ((r * 0.1) | 0) + ' s to come home');
var br = Eva.start({ pos: v3(0, 0, 0), vel: v3(0.002, 0, 0), fwd: v3(0, 0, 1), up: v3(0, 1, 0) });
var refShip = { pos: v3(0, 0, 0.05), vel: v3(0, 0, 0) };
for (var q = 0; q < 40; q++) Eva.step(br, { x: true }, 0.1, { ref: refShip });
check('X brakes you still against the nearest ship', Eva.relSpeed(br, refShip) < 1e-9 && br.gas < Eva.GAS_S);
var fall = Eva.start({ pos: v3(0, 0, 0), vel: v3(0, 0, 0), fwd: v3(0, 0, 1), up: v3(0, 1, 0) });
Eva.step(fall, {}, 1, { g: v3(0, -0.001, 0) });
check('the suit falls with the ships', Math.abs(fall.vel.y + 0.001) < 1e-12);
check('within 4 m of a hatch is in reach', Eva.reach({ pos: v3(0, 0, 0) }, v3(0, 0, 0.0039)) && !Eva.reach({ pos: v3(0, 0, 0) }, v3(0, 0, 0.0041)));

console.log('the airlock in open space');
var ship = { airlock: null };
var vac = { landed: false, docked: false, vacuum: true, breathable: false };
check('without a suit the old refusal stands', !AL.request({ airlock: null }, 'out', { landed: false, docked: false }).ok);
var rq = AL.request(ship, 'out', vac);
check('in open space you can cycle out', rq.ok && /vacuum/.test(rq.say), rq.say);
var ev = null, evs = [];
for (var s = 0; s < 400; s++) { ev = AL.step(ship, null, 0.1, vac); if (ev) evs.push(ev); }
check('cycled out to vacuum, and the ramp opens', evs.indexOf('vacuum') >= 0 && ship.airlock.side === 'out' && ship.airlock.ramp === 1, evs.join(','));
check('and stays open in open space', AL.state(ship).want === 1);
for (var s2 = 0; s2 < 10; s2++) AL.step(ship, null, 0.1, { landed: false, docked: false });
check('without the suit the ramp would not have stayed down', AL.state(ship).want === 0);

console.log('the standoff');
var sG = { seed: 's', ship: { credits: 100000, fit: {}, gun: 'pulse' }, people: {}, t: 1000 };
var mer = herSpec({ id: 'mer', manifest: [{ cid: 'ores', qty: 40 }] });
var pir = herSpec({ id: 'pir', kind: 'pirate', cls: 'pirate' });
check('a merchant crew are easier to face down than raiders',
      Combat.standoffOdds(sys, sG, mer, 'threaten') > Combat.standoffOdds(sys, sG, pir, 'threaten'));
check('a gun on your hip helps', Combat.standoffOdds(sys, sG, mer, 'threaten') > Combat.standoffOdds(sys, { ship: { credits: 0, fit: {} } }, mer, 'threaten'));
var price = Combat.standoffPrice(sys, mer);
check('her price is a third of her hold at base, at least 250', price >= 250 && price % 10 === 0, price + ' cr');
check('paying is certain if you have it', Combat.standoffOdds(sys, sG, mer, 'pay') === 1 &&
      Combat.standoffOdds(sys, { ship: { credits: price - 1 } }, mer, 'pay') === 0);
var x1 = herSpec({ id: 'same' }), x2 = herSpec({ id: 'same' });
var r1 = Combat.standoff(sys, { ship: { credits: 0, fit: {}, gun: 'pulse' }, people: {} }, 1000, x1, 'talk', null);
var r2 = Combat.standoff(sys, { ship: { credits: 0, fit: {}, gun: 'pulse' }, people: {} }, 1010, x2, 'talk', null);
check('the same words in the same minute get the same answer', r1.ok === r2.ok);
/* Find a minute she says no, and one she says yes. */
var no = null, yes = null;
for (var mn = 0; mn < 200 && (!no || !yes); mn++) {
  var probe = herSpec({ id: 'odd', cls: 'hauler' });
  var res = Combat.standoff(sys, { ship: { credits: 0, fit: {}, gun: 'pulse' }, people: {} }, mn * 60, probe, 'talk', null);
  if (res.ok && !yes) yes = probe; else if (!res.ok && !no) no = { spec: probe, res: res, t: mn * 60 };
}
check('when she yields she stays yielded', yes && yes.yielded === 'talk');
check('when she does not, you are thrown out, and the door is dogged', no && no.res.thrown && no.spec.repelledUntil === no.t + Combat.REPEL_S);
check('and an armed crew go for your ship', no && no.spec.hostileToPlayer && no.spec.defending);
var un = null;
for (var mn2 = 0; mn2 < 200 && !un; mn2++) {
  var sh = herSpec({ id: 'shut', cls: 'shuttle' });
  var rs = Combat.standoff(sys, { ship: { credits: 0, fit: {} }, people: {} }, mn2 * 60, sh, 'threaten', null);
  if (!rs.ok) un = sh;
}
check('an unarmed one only throws you out', un && un.repelledUntil > 0 && !un.hostileToPlayer);
var paid = herSpec({ id: 'paid', manifest: [{ cid: 'ores', qty: 40 }] }), pG = { ship: { credits: 100000 }, people: {} };
var pr = Combat.standoff(sys, pG, 1000, paid, 'pay', null);
check('paid off: she yields and you are out of pocket', pr.ok && paid.yielded === 'paid' && pG.ship.credits === 100000 - pr.price);
var bk = herSpec({ id: 'bk' }), bkr = Combat.standoff(sys, sG, 1000, bk, 'back', null);
check('backing off is no fight', bkr.back && !bk.hostileToPlayer && bk.repelledUntil > 1000);
check('a ship that struck has already yielded', Combat.standoff(sys, sG, 1000, herSpec({ surrendered: true }), 'talk', null).ok);

console.log('the standoff, as it is spoken');
var route = { id: 'route-sf', name: 'Coldwater Drover', cls: 'hauler', size: 0.09, faction: 'f1' };
var info = { id: route.id, name: route.name, cls: route.cls, size: route.size, faction: route.faction, route: route };
var hid = Object.keys(Combat.HULLS).filter(function (k) { return Combat.HULLS[k].mesh === 'hauler'; })[0];
var dv = R.shipInterior({ hullId: hid, bornId: 'visit|' + route.id, dryMass: Combat.HULLS[hid].dryMass, cargo: {} });
var vp = dv.plan.decks ? dv.plan.decks.main : dv.plan;
var vs = Npc.visitScene(vp, info, { t: 5000 });
var master = vs.people[0], dspec = herSpec({ id: 'dlg', manifest: [{ cid: 'ores', qty: 40 }] });
master.standoff = true; master.spec = dspec;
var dG = { seed: 's', ship: { credits: 100000, crew: [], cargo: {}, fit: {}, gun: 'pulse' }, people: {}, t: 5000 };
var dsys = { id: 'sys', byId: {}, bodies: [] };
var st = D.open(dG, dsys, null, master, 5000);
var ids = D.options(dG, dsys, null, st).map(function (o) { return o.id; });
check('four ways it can go, and nothing else', ids.join() === 'sthreat,stalk,spay,sback', ids.join());
check('each with its odds on the line', /\(\d+%\)/.test(D.options(dG, dsys, null, st)[0].label), D.options(dG, dsys, null, st)[0].label);
D.choose(dG, dsys, null, st, 3);
check('backing off ends it, and says so for main.js', st.end && st.standoff && st.standoff.back);
dspec.yielded = 'talk';
var st2 = D.open(dG, dsys, null, master, 5000);
var ids2 = D.options(dG, dsys, null, st2).map(function (o) { return o.id; });
check('once she has yielded he talks as her master again', ids2.indexOf('sthreat') < 0 && ids2.indexOf('deal') >= 0, ids2.join());

console.log('her crew shift what you point at');
var cs = herSpec({ id: 'cargo', manifest: [{ cid: 'ores', qty: 30 }, { cid: 'grain', qty: 5 }] });
var cSys = { id: 'c', patrols: [cs], canisters: [], byId: {}, traffic: [] };
var cG = { ship: { credits: 0 }, people: {} };
check('a container is queued', Combat.pushCargo(cSys, cs, 'ores', 20) === 20);
check('never more than she has', Combat.pushCargo(cSys, cs, 'ores', 20) === 10);
check('and nothing once it is all going', Combat.pushCargo(cSys, cs, 'ores', 5) === 0);
Combat.tickPushes(cSys, cG, 0, null);
check('the first goes out at once', cSys.canisters.length === 1 && cSys.canisters[0].tonnes === 20 && cs.manifest[0].qty === 10);
check('hanging below her, pushed by hand', V.dist(cSys.canisters[0].vel, cs.live.vel) < 0.0025 && cSys.canisters[0].pos.y < 0);
Combat.tickPushes(cSys, cG, 3, null);
check('one at a time', cSys.canisters.length === 1);
Combat.tickPushes(cSys, cG, Combat.PUSH_S, null);
check('the next after ' + Combat.PUSH_S + ' s, and the line is off her manifest',
      cSys.canisters.length === 2 && cs.manifest.every(function (m) { return m.cid !== 'ores'; }), JSON.stringify(cs.manifest));

console.log('the crates say what is in them');
var bigH = R.shipInterior({ hullId: hid, bornId: 'b3|crates', dryMass: Combat.HULLS[hid].dryMass,
                            cargo: { ores: 60, grain: 12 } });
var crates = bigH.plan.items.filter(function (it) { return it.kind === 'crate' && it.cid; });
check('every crate carries its containers', crates.length > 0 && crates.every(function (it) { return it.levels && it.levels.length > 0; }));
var tot = 0;
crates.forEach(function (it) { it.levels.forEach(function (l) { tot += l.t; }); });
check('and the containers add up to the hold', Math.abs(tot - 72) < 0.5, tot.toFixed(2) + ' t');

console.log('hulls are solid');
var hauler = { cls: 'hauler', size: 0.09, pos: v3(0, 0, 0), vel: v3(0, 0, 0), fwd: v3(0, 0, 1), up: v3(0, 1, 0), right: v3(-1, 0, 0) };
var through = R.hullSegmentHit(hauler, v3(0, 0.2, 0), v3(0, -0.2, 0), 0.0005);
check('a path straight through her stops on her skin', !!through && through.t > 0 && through.t < 0.5, through ? 't ' + through.t.toFixed(3) : '');
check('and her plate faces back the way you came', through && through.normal.y > 0.5);
check('a path well clear of her does not', !R.hullSegmentHit(hauler, v3(0.3, 0.2, 0), v3(0.3, -0.2, 0), 0.0005));
var me = { hullId: 'talon', bornId: 'coll|me', dryMass: Combat.HULLS.talon.dryMass, cargo: {}, crew: [],
           pos: v3(0, 0.12, 0), vel: v3(0, -0.02, 0), fwd: v3(0, 0, 1), up: v3(0, 1, 0), right: v3(-1, 0, 0), hullHp: 100, hullMax: 100 };
var cs2 = herSpec({ id: 'coll', size: 0.09, cls: 'hauler' });
cs2.live.size = 0.09; cs2.live.cls = 'hauler'; cs2.live.spec = cs2;
var sysC = { id: 'sc', patrols: [cs2], traffic: [], bodies: [], ports: [], gravBodies: [] };
var fromP = V.clone(me.pos);
me.pos = v3(0, -0.01, 0);
var hc = global.Sim.checkHullImpact(me, sysC, 1.0, fromP, 0.5);
check('your ship meets her hull and stops on it', !!hc && me.pos.y > 0.005, hc ? 'stopped ' + (me.pos.y * 1000).toFixed(1) + ' m over her middle at ' + (hc.speed * 1000).toFixed(1) + ' m/s' : 'went through');
check('her plate took the motion into it', me.vel.y >= -1e-9, 'vel ' + (me.vel.y * 1000).toFixed(2) + ' m/s');
check('and at 20 m/s that is an impact, not a touch', hc && hc.speed >= 0.019);
var ramp = SD.rampMesh({}, { x0: -0.8, x1: 0.8, hinge: 0, foot: -3, len: 3, angle: 0.4, mode: 'ramp' }, 0, 1);
/* Every side face of the rails (a face square to x, up off the deck) has a
 * twin a few centimetres across: the other side of the same box. A lone
 * one is a rail with no width. */
var sideX = [];
for (var fi = 0; fi < ramp.f.length; fi++) {
  var fv = ramp.f[fi].map(function (ix) { return ramp.v[ix]; });
  var xs = fv.map(function (p) { return p[0]; });
  if (Math.max.apply(null, xs) - Math.min.apply(null, xs) < 1e-9 && fv.some(function (p) { return p[1] > 0.3; })) sideX.push(xs[0]);
}
var lone = sideX.filter(function (x) { return !sideX.some(function (y) { var d = Math.abs(x - y); return d > 0.02 && d < 0.1; }); });
check('no ramp rail is a plane with no width', sideX.length > 0 && lone.length === 0, sideX.length + ' rail sides, ' + lone.length + ' without a twin');

console.log('every room inside her own hull');
/* Astra: "all ships should have interiors that exist as part of the ship
 * itself". Every hull's deck is planned against her hull (planFitted) and
 * every room but the cockpit (whose canopy stands proud by design) is
 * sampled inside her. No exemptions: the Crawler's lift car used to run a
 * metre across an opening in her frame on her lower decks, and her lobby
 * is 2.1 m longer now so the shaft stands clear of it (2026-11-02). */
var KNOWN_OUT = {};
var notIn = [], dropped = [];
Object.keys(Combat.HULLS).forEach(function (id) {
  var shp = { hullId: id, bornId: 'b3fit|' + id, dryMass: Combat.HULLS[id].dryMass, cargo: {} };
  var dd = R.shipInterior(shp), fitr = R.hullFitter(shp);
  if (!dd || !fitr) return;
  var allow = KNOWN_OUT[id] || [];
  (dd.plan.decks ? Object.keys(dd.plan.decks).map(function (k) { return dd.plan.decks[k]; }) : [dd.plan]).forEach(function (dp) {
    dp.rooms.forEach(function (rm) {
      if (rm.kind === 'cockpit' || allow.indexOf(rm.kind) >= 0) return;
      var ok = true, sx = Math.max(0.1, Math.min(0.5, rm.x1 - rm.x0 - 0.2));
      for (var x = rm.x0 + 0.1; ok && x <= rm.x1 - 0.1 + 1e-9; x += sx)
        for (var z = rm.z0 + 0.1; ok && z <= rm.z1 - 0.1 + 1e-9; z += 0.5)
          if (!fitr.inside(x, dp.floorY + 0.1, z) || !fitr.inside(x, dp.floorY + (rm.y1 || 2.2) - 0.1, z)) ok = false;
      if (!ok) notIn.push(id + ' ' + rm.kind);
    });
  });
  if (dd.plan.fitted && dd.plan.fitted.omitted.length) dropped.push(id + ': ' + dd.plan.fitted.omitted.join(' '));
});
check('no room stands outside her skin, on any hull', !notIn.length, notIn.slice(0, 8).join('; '));
check('and fitting them took nothing away from any hull today', !dropped.length, dropped.join('; '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
