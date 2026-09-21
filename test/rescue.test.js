/* rescue.test.js — the tender that comes when the tank runs dry.
 *
 *     node test/rescue.test.js
 *
 * The rule (claude/rescue-tender.md): if the reaction-mass tank runs dry in
 * flight, a tender comes to the player. Criminal status, warrants and
 * standing do not matter. The only refusal is a career that has ever killed
 * a tender. She fills BOTH tanks — Astra: "it needs to fill your jump fuel
 * and reaction mass" — for a flat 500 cr, waived down to whatever a broke
 * pilot has.
 *
 * What this file holds is the thing the old mayday could not do: that the
 * tender ARRIVES. Its leg is a timestamped rail, so the checks are about
 * where she is at each timestamp and that the handoff into live steering
 * is a copy of two vectors rather than a jump — and then that six seconds
 * alongside fills the tanks and takes the fee.
 */
global.window = global;
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
var V = require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
require(path.join(SRC, 'rng.js'));
var Eco = require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
var fakeStore = {};
global.localStorage = {
  getItem: function (k) { return fakeStore[k] === undefined ? null : fakeStore[k]; },
  setItem: function (k, v) { fakeStore[k] = String(v); },
  removeItem: function (k) { delete fakeStore[k]; }
};
var Save = require(path.join(SRC, 'save.js'));

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

/* A stranded player: deep space, no reaction mass, some money. */
function strandedG(seed, credits) {
  var sys = Gen.generateSystem(seed);
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  Combat.initShip(ship);
  ship.cargo = {};
  ship.credits = credits == null ? 5000 : credits;
  ship.pos = { x: 4.2e9, y: 3.9e9, z: 2e8 };
  ship.vel = { x: 0, y: 0, z: 0 };
  ship.thrusterFuel = 0; ship.fuelOut = true;
  ship.fuel = 2;
  Sim.refreshShip(ship);
  return { ship: ship, sys: sys, t: 1000, keys: {}, panel: 0, wanted: {}, standing: {},
           missions: [], doneMissions: {}, beams: [], explosions: [], distress: [],
           seed: seed, here: { id: 'star-' + seed, name: seed }, tenderKills: 0 };
}
function saidBy() { var out = []; return { say: function (t) { out.push(t); }, ledger: function (t) { out.push('LEDGER ' + t); }, sound: function () {}, lines: out }; }
function tendersIn(sys) {
  return (sys.patrols || []).filter(function (p) { return Combat.eligibleResponder ? false : (p.kind === 'tender' || p.kind === 'tug'); });
}

console.log('--- she is dispatched the moment you are stranded ---');
(function () {
  var G = strandedG('kawartha'), H = saidBy();
  var had = (G.sys.patrols || []).filter(function (p) { return p.kind === 'tender' || p.kind === 'tug'; }).length;
  Combat.updateRescue(G.sys, G, G.t, 0.1, H);
  check('a rescue is on the books', !!G.rescue, JSON.stringify(G.rescue));
  var spec = (G.sys.patrols || []).filter(function (p) { return p.id === G.rescue.responder; })[0];
  check('with a real responder attached', !!spec && !!spec.rescue, spec && spec.name);
  check('who is a tender or a tug', spec && (spec.kind === 'tender' || spec.kind === 'tug'));
  check('a temporary boat only when the system has none', !!spec.temporary === (had === 0), had + ' had, temp=' + spec.temporary);
  check('and it was said, with a distance and a time', /coming for you/.test(H.lines[0]) && /out, about/.test(H.lines[0]), H.lines[0]);
  check('the comms band carries an answered mayday', G.distress.length === 1 && G.distress[0].answeredBy === spec.id);
  check('the quoted ETA is scramble plus a flip-and-burn at her own rate',
        Math.abs((G.rescue.handoffAt - G.rescue.t0) -
                 (Combat.RESCUE_SCRAMBLE + 2 * Math.sqrt(Math.max(0, G.rescue.distance - Sim.RESCUE_HANDOFF) / spec.accel))) < 1e-6);
  check('asking twice does not send two', !Combat.startRescue(G.sys, G, G.t, H).ok);
  /* Criminal status does not matter. */
  G.wanted = { navyfac: 99999 };
  var G2 = strandedG('kawartha'); G2.wanted = { navyfac: 99999 }; G2.standing = { navyfac: -100 };
  Combat.updateRescue(G2.sys, G2, G2.t, 0.1, saidBy());
  check('a wanted pilot is answered all the same', !!G2.rescue);
})();

console.log('--- the leg is a rail, and it ends where the steering begins ---');
(function () {
  var G = strandedG('kawartha'), H = saidBy();
  Combat.updateRescue(G.sys, G, G.t, 0.1, H);
  var spec = (G.sys.patrols || []).filter(function (p) { return p.id === G.rescue.responder; })[0];
  var r = G.rescue;
  var before = Sim.railState(spec, G.sys, r.t0 + 10);
  var scr = Sim.patrolState(spec, G.sys, r.t0 + 10);
  check('during the scramble she is where her own timetable puts her',
        V.dist(before.pos, scr.pos) < 1e-6 && scr.rescuing === 'scramble');
  var T = r.handoffAt - r.scrambleUntil;
  var mid = Sim.patrolState(spec, G.sys, r.scrambleUntil + T * 0.6);
  var start = Sim.patrolState(spec, G.sys, r.scrambleUntil + 1);
  var dStart = V.dist(start.pos, G.ship.pos), dMid = V.dist(mid.pos, G.ship.pos);
  check('past the midpoint she is well on her way', dMid < dStart * 0.5, dStart + ' -> ' + dMid);
  check('and turned over to brake', mid.braking === true && mid.rescuing === 'transit');
  var end = Sim.patrolState(spec, G.sys, r.handoffAt);
  var dEnd = V.dist(end.pos, G.ship.pos);
  check('the rail ends the handoff distance short of you', Math.abs(dEnd - Sim.RESCUE_HANDOFF) < 1, dEnd);
  check('with your velocity matched', V.dist(end.vel, G.ship.vel) < 1e-3, V.dist(end.vel, G.ship.vel));
  /* Monotone approach: no jump anywhere on the leg. */
  var last = Infinity, smooth = true, prev = null;
  for (var k = 0; k <= 40; k++) {
    var st = Sim.patrolState(spec, G.sys, r.scrambleUntil + T * k / 40);
    var d = V.dist(st.pos, G.ship.pos);
    if (d > last + 1) smooth = false;
    if (prev && V.dist(prev, st.pos) > (dStart / 40) * 3) smooth = false;
    last = d; prev = st.pos;
  }
  check('the approach is monotone and stepless', smooth);
  check('the encounter loop does not wake her early',
        (function () { Sim.updateEncounters(G.sys, r.scrambleUntil + T * 0.99, 1, G.ship); return !spec.live; })());
})();

console.log('--- she arrives, fills both tanks, and takes the fee ---');
function runToRefuel(G, H, maxHours) {
  var spec = null, t = G.t, steps = 0;
  var dt = 5;
  var handoff = G.rescue.handoffAt;
  t = handoff;                                   // warp straight to the handoff
  while (G.rescue && steps < (maxHours || 6) * 720) {
    Combat.updateRescue(G.sys, G, t, dt, H);
    Sim.updateEncounters(G.sys, t, dt, G.ship);
    t += dt; steps++;
  }
  G.t = t;
  return steps;
}
(function () {
  var G = strandedG('kawartha', 5000), H = saidBy();
  Combat.updateRescue(G.sys, G, G.t, 0.1, H);
  var spec = (G.sys.patrols || []).filter(function (p) { return p.id === G.rescue.responder; })[0];
  var wasTemp = spec.temporary;
  var steps = runToRefuel(G, H, 6);
  check('the rescue completes', !G.rescue && G.lastRescueEnd === 'refuelled', G.lastRescueEnd + ' after ' + steps + ' steps');
  check('reaction mass is full', G.ship.thrusterFuel === G.ship.thrusterCap, G.ship.thrusterFuel);
  check('and so is the jump tank', G.ship.fuel === G.ship.fuelCap, G.ship.fuel);
  check('the flat fee came out', G.ship.credits === 5000 - Combat.RESCUE_FEE, G.ship.credits);
  check('and went in the ledger', H.lines.some(function (l) { return /^LEDGER/.test(l) && /500 cr/.test(l); }), H.lines.join(' | '));
  check('the beacon is off the air', !(G.distress || []).length);
  check('she stood down', !spec.rescue && !spec.live && !spec.mode);
  if (wasTemp) check('a temporary boat is gone once the job is done', G.sys.patrols.indexOf(spec) < 0);
  check('the career counts the rescue', G.tenderRescues === 1);

  /* THE LIVE APPROACH TOOK REAL TIME, and not much of it. */
  check('the last two thousand kilometres took minutes, not the day the crossing did',
        steps * 5 < 3600 * 2, (steps * 5 / 60).toFixed(0) + ' min');

  /* A BROKE PILOT IS STILL REFUELLED. */
  var G2 = strandedG('kawartha', 120), H2 = saidBy();
  Combat.updateRescue(G2.sys, G2, G2.t, 0.1, H2);
  runToRefuel(G2, H2, 6);
  check('with nothing, you pay what you have', !G2.rescue && G2.ship.credits === 0 && G2.ship.thrusterFuel === G2.ship.thrusterCap);
  check('and the rest is waived, out loud', H2.lines.some(function (l) { return /waived/.test(l); }), H2.lines.join(' | '));

  /* A SYSTEM WITH NO TENDER OF ITS OWN. Strip them and a port boat comes. */
  var G3 = strandedG('kawartha', 5000), H3 = saidBy();
  G3.sys.patrols = (G3.sys.patrols || []).filter(function (p) { return p.kind !== 'tender' && p.kind !== 'tug'; });
  Combat.updateRescue(G3.sys, G3, G3.t, 0.1, H3);
  var boat = (G3.sys.patrols || []).filter(function (p) { return p.id === G3.rescue.responder; })[0];
  check('a port launches a boat', boat && boat.temporary && boat.rail.type === 'port', boat && boat.id);
  check('and says where from', /Launched from/.test(H3.lines[0]), H3.lines[0]);
  var boatStart = Sim.patrolState(boat, G3.sys, G3.t + 1);
  var home = G3.sys.byId[boat.homePort];
  check('she starts at that port', V.dist(boatStart.pos, Sim.bodyState(home, G3.sys, G3.t + 1).pos) < Math.max(home.dockCaptureRadius || 0, home.radius * 3) + 1);
  runToRefuel(G3, H3, 6);
  check('and the boat goes home afterwards', !G3.rescue && G3.sys.patrols.indexOf(boat) < 0 && G3.ship.thrusterFuel > 0);
})();

console.log('--- called off, refused, and remembered across a save ---');
(function () {
  var G = strandedG('kawartha'), H = saidBy();
  Combat.updateRescue(G.sys, G, G.t, 0.1, H);
  var spec = (G.sys.patrols || []).filter(function (p) { return p.id === G.rescue.responder; })[0];
  G.ship.docked = 'b7';
  Combat.updateRescue(G.sys, G, G.t + 50, 5, H);
  check('docking calls her off', !G.rescue && !spec.rescue && G.lastRescueEnd === 'recovered');
  check('and she says so', /stands down/.test(H.lines[H.lines.length - 1]), H.lines[H.lines.length - 1]);

  /* THE ONE REFUSAL. */
  var G2 = strandedG('kawartha'), H2 = saidBy();
  G2.tenderKills = 1;
  Combat.updateRescue(G2.sys, G2, G2.t, 0.1, H2);
  check('a tender-killer is not answered', !G2.rescue);
  check('and is told why, once', H2.lines.length === 1 && /killed one/.test(H2.lines[0]), H2.lines.join('|'));
  Combat.updateRescue(G2.sys, G2, G2.t + 5, 5, H2);
  check('not every frame', H2.lines.length === 1);
  var r2 = Combat.startRescue(G2.sys, G2, G2.t, H2);
  check('and the manual call is refused in words', !r2.ok && /killed one/.test(r2.why), r2.why);

  /* THE MANUAL MAYDAY IS THE SAME MACHINERY. */
  var G3 = strandedG('kawartha'), H3 = saidBy();
  var m = Combat.mayday(G3.sys, G3, G3.t, Combat.HELP_TENDER, H3);
  check('a mayday for a tender, stranded, is the rescue', m.ok && !!G3.rescue && m.responder && m.responder.id === G3.rescue.responder);

  /* SAVED. The timestamps survive, and the spec is re-attached on load. */
  var G4 = strandedG('kawartha'), H4 = saidBy();
  G4.systemCache = {}; G4.visited = {}; G4.galaxy = { stars: [], factionById: {} }; G4.pilotName = 'x';
  Combat.updateRescue(G4.sys, G4, G4.t, 0.1, H4);
  var snap = JSON.parse(JSON.stringify(Save.snapshot ? Save.snapshot(G4) : {}));
  check('the dispatch is in the save', snap.rescue && snap.rescue.handoffAt === G4.rescue.handoffAt && snap.tenderKills === 0);
  var G5 = strandedG('kawartha');
  G5.rescue = JSON.parse(JSON.stringify(G4.rescue));
  var re = Combat.restoreRescue(G5.sys, G5);
  check('a fresh system re-attaches the same responder', re && re.id === G4.rescue.responder && !!re.rescue);
  check('and the ETA is the one quoted before the reload', G5.rescue.handoffAt === G4.rescue.handoffAt);

  /* KILLING THE TENDER IS COUNTED, and the count is what refuses. */
  var G6 = strandedG('kawartha'), H6 = saidBy();
  G6.tenderKills = 0;
  var t6 = { id: 'victim-t', kind: 'tender', cls: 'tender', className: 'rescue tender', name: 'Boat',
             faction: 'f', size: 0.1, accel: 0.01, rail: { type: 'lifted' },
             live: { pos: V.add(G6.ship.pos, { x: 3, y: 0, z: 0 }), vel: V.clone(G6.ship.vel),
                     fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: -1, z: 0 } },
             hullHp: 1, hullMax: 100, mode: 'shadow', modeSince: 0 };
  t6.live.spec = t6;
  G6.sys.patrols.push(t6);
  Combat.damageNpc(G6.sys, G6, t6, 500, G6.t, H6);
  check('shooting the ambulance is counted against the career', G6.tenderKills === 1, G6.tenderKills);
})();

console.log('--- a passing ship spares whichever you are short of ---');
(function () {
  var G = strandedG('kawartha');
  G.ship.fuel = G.ship.fuelCap;            // jump tank full, reaction mass dry
  var aid = Combat.hailAssist(G, {});
  check('reaction mass is offered when that is what is dry', aid && aid.thruster > 0 && aid.fuel === 0, JSON.stringify(aid));
  G.ship.fuel = 1;
  var both = Combat.hailAssist(G, {});
  check('both, when both are dry', both.thruster > 0 && both.fuel > 0 && both.tonnes === both.thruster + both.fuel);
  G.ship.thrusterFuel = G.ship.thrusterCap; G.ship.fuel = G.ship.fuelCap;
  check('and nothing when you are fine', Combat.hailAssist(G, {}) === null);
  /* The transaction fills the tank it quoted. */
  G.ship.thrusterFuel = 0; G.ship.fuel = G.ship.fuelCap; G.ship.credits = 100000;
  var contact = { name: 'Passer', pos: V.add(G.ship.pos, { x: 5, y: 0, z: 0 }), route: { id: 'r' }, manifest: [] };
  var H = saidBy();
  var got = Combat.hailShip(G, G.sys, G.t, contact, 'assist', H);
  check('the pump fills the reaction-mass tank', got && got.thruster > 0 && G.ship.thrusterFuel === got.thruster && !G.ship.fuelOut);
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
