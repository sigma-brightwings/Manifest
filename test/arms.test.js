/* arms.test.js - a tug's grab arms, worked from the seat (2026-10-31).
 *
 *     node test/arms.test.js
 *
 * Astra: "the [tug's] cockpit should have a vidscreen to operate those grab
 * arms", and the arms to grab canisters and tow disabled ships. Pinned:
 *  - only a hull with arms has them; G on a hull without them says so;
 *  - the jaws meet at a fixed point ahead of the seat, and travel;
 *  - a canister in reach, at a crawl, is taken and swung into the hold; too
 *    fast and the jaws close on nothing; a full hold keeps it in the jaws;
 *  - a dead ship in reach is clamped where she was, comes with you as you
 *    move and turn, and her mass is yours to push; a ship under way slips;
 *  - letting go leaves her adrift; docking with her hands her in for
 *    salvage, or for nothing if you were seen to attack her;
 *  - the arm camera's readout says what is there and whether it is in reach.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/hulls.js');
require('../src/walk.js');
require('../src/shipdeck.js');
require('../src/render.js');
var Arms = require('../src/arms.js');
var V = global.V, R = global.Render, Sim = global.Sim;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function v3(x, y, z) { return { x: x, y: y, z: z }; }
function hooks() { var h = { said: [], say: function (m) { h.said.push(m); } }; return h; }

function tug(id) {
  var H = Combat.HULLS[id];
  var s = { hullId: id, bornId: 'arms|' + id, dryMass: H.dryMass, fuel: 5, thrusterFuel: 5, cargo: {}, cargoCap: H.cargoCap,
            thrustKN: H.thrustKN, crew: [], credits: 1000,
            pos: v3(0, 0, 0), vel: v3(0.01, 0, 0), fwd: v3(0, 0, 1), up: v3(0, 1, 0), right: v3(-1, 0, 0) };
  Sim.refreshShip(s);
  return s;
}
var others = [];
Sim.shipsAll = function () { return others; };
function world(ship) {
  return { ship: ship, t: 1000, sys: { id: 'sa', canisters: [], patrols: [], byId: { port1: { id: 'port1', name: 'Halden Dock' } } } };
}
function frame(G) { return R.bridgeFrame(G.ship); }

console.log('which hulls');
check('the Bollard and the Hawser carry arms', Arms.hasArms(tug('bollard')) && Arms.hasArms(tug('heavytug')));
var talonG = world(tug('bollard')); talonG.ship.hullId = 'talon';
var h0 = hooks();
var r0 = Arms.toggle(talonG, frame(talonG), h0);
check('a hull without them says so', !r0.ok && /tug/.test(h0.said[0]), h0.said[0]);

console.log('the jaws');
var G = world(tug('bollard'));
var g = R.armGrip(frame(G));
var eye = frame(G).pos;
var ahead = V.dot(V.sub(g, eye), G.ship.fwd) * 1000;
check('they meet ahead of the seat and below the eye', ahead > 5 && ahead < 40 && V.dot(V.sub(g, eye), G.ship.up) < 0,
      ahead.toFixed(1) + ' m ahead');
var h1 = hooks();
var r1 = Arms.toggle(G, frame(G), h1);
check('closed on nothing, they close on nothing', r1.empty && /nothing/.test(h1.said[0]));
Arms.update(G, frame(G), 0.3, hooks());
check('and they travel rather than snap', G.ship.arms.jaw > 0.3 && G.ship.arms.jaw < 0.7, G.ship.arms.jaw.toFixed(2));
Arms.toggle(G, frame(G), hooks());
for (var i = 0; i < 10; i++) Arms.update(G, frame(G), 0.2, hooks());
check('and open again', G.ship.arms.jaw === 0);

console.log('a canister');
function canAt(G, aheadM, relMs, tonnes) {
  var gg = R.armGrip(frame(G));
  var c = { kind: 'canister', id: 'c' + Math.random(), cid: 'grain', tonnes: tonnes || 6,
            pos: V.addScaled(gg, G.ship.fwd, aheadM / 1000), vel: V.addScaled(G.ship.vel, G.ship.fwd, relMs / 1000), radius: 0.004 };
  G.sys.canisters.push(c);
  return c;
}
var Gc = world(tug('bollard'));
var cfast = canAt(Gc, 4, 9);
var hf = hooks();
Arms.toggle(Gc, frame(Gc), hf);
check('too fast against you: the jaws do not take it', !Gc.ship.arms.held && /Too fast/.test(hf.said[0]), hf.said[0]);
Arms.toggle(Gc, frame(Gc), hooks());
Gc.sys.canisters = [];
var c1 = canAt(Gc, 4, 1);
var view0 = Arms.view(Gc, frame(Gc));
check('the arm camera sees it, in reach', view0.target === 'cargo canister' && view0.inReach && view0.dist === 4, JSON.stringify({ t: view0.target, d: view0.dist, r: view0.rel }));
Arms.toggle(Gc, frame(Gc), hooks());
check('at a crawl it is taken', Gc.ship.arms.held && Gc.ship.arms.held.kind === 'canister');
Gc.ship.pos = V.add(Gc.ship.pos, v3(0.5, 0, 0));
Arms.update(Gc, frame(Gc), 0.1, hooks());
check('held at the jaws as you move', V.dist(c1.pos, R.armGrip(frame(Gc))) < 1e-9);
Gc.t += Arms.STOW_S + 0.1;
var hs = hooks();
Arms.update(Gc, frame(Gc), 0.1, hs);
check('and swung into the hold', Gc.ship.cargo.grain === 6 && Gc.sys.canisters.length === 0 && !Gc.ship.arms.held, hs.said.join(' | '));
check('no scoop needed', !Combat.hasScoop(Gc.ship));
var Gfull = world(tug('bollard'));
Gfull.ship.cargo.ore = Gfull.ship.cargoCap; Sim.refreshShip(Gfull.ship);
canAt(Gfull, 3, 0);
Arms.toggle(Gfull, frame(Gfull), hooks());
Gfull.t += Arms.STOW_S + 1;
Arms.update(Gfull, frame(Gfull), 0.1, hooks());
check('a full hold keeps it in the jaws', Gfull.ship.arms.held && Gfull.sys.canisters.length === 1);

console.log('a ship');
function herAt(G, disabled, relMs) {
  var gg = R.armGrip(frame(G));
  var sp = { id: 'her-' + Math.random(), name: 'Mirefast Drover', kind: 'trader', cls: 'hauler', size: 0.06,
             disabled: disabled ? 'drive' : null, mass: 320 };
  var o = { cls: 'hauler', size: 0.06, name: sp.name, spec: sp, hullId: undefined,
            pos: v3(0, 0, 0), vel: V.addScaled(G.ship.vel, G.ship.fwd, (relMs || 0) / 1000),
            fwd: v3(1, 0, 0), up: v3(0, 1, 0), right: v3(0, 0, 1) };
  sp.live = o;
  /* Slide her toward the jaws along your nose until her skin is in reach. */
  for (var d = 0.2; d > 0; d -= 0.001) {
    o.pos = V.addScaled(gg, G.ship.fwd, d);
    if (R.hullSegmentHit(o, gg, V.addScaled(gg, G.ship.fwd, Arms.REACH_KM * 0.8), 0.002)) break;
  }
  others = [o];
  return sp;
}
var Gs = world(tug('heavytug'));
var under = herAt(Gs, false);
var hu = hooks();
Arms.toggle(Gs, frame(Gs), hu);
check('a ship under way slips out of the jaws', !Gs.ship.arms.held && /under way/.test(hu.said[0]), hu.said[0]);
Arms.toggle(Gs, frame(Gs), hooks());
var her = herAt(Gs, true);
var m0 = Gs.ship.mass, a0 = Gs.ship.maxAccel;
var rel0 = V.sub(her.live.pos, Gs.ship.pos);
var hc = hooks();
Arms.toggle(Gs, frame(Gs), hc);
check('a dead ship in reach is clamped', Gs.ship.arms.held && Gs.ship.arms.held.kind === 'ship', hc.said[0]);
check('and her mass is yours to push', Math.abs(Gs.ship.mass - m0 - 320) < 1e-6 && Gs.ship.maxAccel < a0,
      m0.toFixed(0) + ' t -> ' + Gs.ship.mass.toFixed(0) + ' t');
Gs.ship.pos = V.add(Gs.ship.pos, v3(3, 0, 0));
Gs.ship.vel = v3(0.2, 0, 0);
Arms.update(Gs, frame(Gs), 0.1, hooks());
check('she comes with you', V.dist(V.sub(her.live.pos, Gs.ship.pos), rel0) < 1e-9 && V.dist(her.live.vel, Gs.ship.vel) < 1e-12);
/* A quarter turn to port about up: fwd z -> x. */
Gs.ship.fwd = v3(1, 0, 0); Gs.ship.right = v3(0, 0, 1);
Arms.update(Gs, frame(Gs), 0.1, hooks());
var relNow = V.sub(her.live.pos, Gs.ship.pos);
check('and turns as you turn', Math.abs(V.dot(relNow, Gs.ship.fwd) - V.dot(rel0, v3(0, 0, 1))) < 1e-9 &&
      Math.abs(V.len(relNow) - V.len(rel0)) < 1e-9);
var hr = hooks();
Arms.toggle(Gs, frame(Gs), hr);
check('letting go leaves her adrift, and your mass your own', !Gs.ship.arms.held && Math.abs(Gs.ship.mass - m0) < 1e-6 && /drifts/.test(hr.said[0]));

console.log('handing her in');
Gs.ship.fwd = v3(0, 0, 1); Gs.ship.right = v3(-1, 0, 0);
var her2 = herAt(Gs, true);
Arms.toggle(Gs, frame(Gs), hooks());
Gs.ship.docked = 'port1';
var credits0 = Gs.ship.credits;
var hd = hooks();
Arms.update(Gs, frame(Gs), 0.1, hd);
check('docked with her on the arms, the harbour takes her for salvage',
      her2.dead && her2.towedIn === 'port1' && Gs.ship.credits - credits0 === 320 * Arms.SALVAGE_PER_T && !Gs.ship.arms.held,
      hd.said.join(' | '));
Gs.ship.docked = null;
var her3 = herAt(Gs, true);
her3.reported = 'assault';
Arms.toggle(Gs, frame(Gs), hooks());
Gs.ship.docked = 'port1';
var c3 = Gs.ship.credits;
var hd3 = hooks();
Arms.update(Gs, frame(Gs), 0.1, hd3);
check('but nobody pays salvage on a ship they watched you shoot', her3.dead && Gs.ship.credits === c3 && /watched you shoot/.test(hd3.said[0]));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
