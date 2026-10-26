/* npc.test.js — the people (2026-10-25).
 *
 *     node test/npc.test.js
 *
 * Astra: "We should use these crew models on ships and stations in game, in
 * the first person mode. They should also be on NPC ships. Give them each a
 * basic AI script so they do their assigned jobs by class."
 *
 * What it holds:
 *   - every body builds, finite, standing on the floor, at a human height,
 *     with every vertex on a real bone, and the rest pose is the identity;
 *   - the rifle generator's six layout rules pass (ejection port over the
 *     magazine well, and the rest);
 *   - a body is a pure function of role, name and livery, and a Syndicate
 *     ship's engineer always has a yellow or red hard hat;
 *   - a flat-footed squat keeps the boots on the floor (the ankles work);
 *   - on every crewed hull, your crew go to their own stations on watch, one
 *     to a seat, and everybody stays inside the ship for an hour of walking;
 *   - the sliding doors open for somebody waiting at them;
 *   - a station deck has its staff, security in the port's colours, the
 *     crew hall's actual hands for hire, and the crews of the ships in port,
 *     and nobody walks through a wall in ten minutes of it;
 *   - the same scene at the same moment is the same scene.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
var Crew = require('../src/crew.js');
require('../src/hulls.js');
var Walk = require('../src/walk.js');
var SD = require('../src/shipdeck.js');
require('../src/render.js');
var NM = require('../src/npcmodel.js');
var Npc = require('../src/npc.js');
var R = global.Render;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

console.log('--- the bodies ---');
var bad = [], short = [], tall = [], floor = [], bones = [], ident = [];
NM.ROLES.forEach(function (r) {
  ['civ', 'navy', 'syn', 'pir'].forEach(function (liv) {
    var m = NM.build(r.key, 'Test Person', liv);
    for (var i = 0; i < m.pos.length; i++) if (!isFinite(m.pos[i])) { bad.push(r.key + '/' + liv); break; }
    var ymin = 1e9, ymax = -1e9;
    for (i = 1; i < m.pos.length; i += 3) { ymin = Math.min(ymin, m.pos[i]); ymax = Math.max(ymax, m.pos[i]); }
    if (ymax < 1.6) short.push(r.key + ':' + ymax.toFixed(2));
    if (ymax > 2.1) tall.push(r.key + ':' + ymax.toFixed(2));
    if (Math.abs(ymin) > 0.005) floor.push(r.key + ':' + ymin.toFixed(3));
    for (i = 0; i < m.bone.length; i++) if (!(m.bone[i] >= 0 && m.bone[i] < NM.BONES.length)) { bones.push(r.key); break; }
    var id = NM.skin(m, {}), err = 0;
    for (i = 0; i < m.count; i += 7) {
      var p = NM.posed(m, id, i);
      err = Math.max(err, Math.abs(p[0] - m.pos[i * 3]) + Math.abs(p[1] - m.pos[i * 3 + 1]) + Math.abs(p[2] - m.pos[i * 3 + 2]));
    }
    if (err > 1e-6) ident.push(r.key + ':' + err);
  });
});
check('every role builds in every livery, all finite', !bad.length, bad.join(', ') || NM.ROLES.length + ' roles x 4 liveries');
check('nobody shorter than 1.6 m or taller than 2.1 m', !short.length && !tall.length, short.concat(tall).join(', '));
check('everybody stands on the floor', !floor.length, floor.join(', '));
check('every vertex rides a real bone', !bones.length, bones.join(', '));
check('the rest pose moves nothing', !ident.length, ident.join(', '));

var rules = NM.rifleRules();
check('the rifle generator passes its layout rules', rules.every(function (r) { return r.ok; }),
      rules.filter(function (r) { return !r.ok; }).map(function (r) { return r.rule; }).join('; ') || rules.length + ' rules');

var a = NM.build('marine', 'Pvt. Okafor', 'navy'), b = NM.build('marine', 'Pvt. Okafor', 'navy');
check('a body is the same body every time', a === b && a.tris === b.tris);
var hats = {};
['Ama Lund', 'Bo Rask', 'Cal Hoyt', 'Dova Wray', 'Esk Vance', 'Fen Quist', 'Gret Nury', 'Hale Brill'].forEach(function (n) {
  hats[NM.build('engineer', n, 'syn').look.o.hat] = true;
});
check('a Syndicate engineer\'s hard hat is yellow or red', Object.keys(hats).every(function (h) { return h === '#F2C230' || h === '#C8302A'; }),
      Object.keys(hats).join(' '));

/* A squat with flat feet: hip k/2, knee k, ankle k/2. The soles must stay
 * on the floor — which they only can if the ankles bend. */
var m = NM.build('loadmaster', 'Grit Solberg', 'civ');
var k = 0.7, sink = 0.83 * (1 - Math.cos(k * 0.5)) * m.height / 1.78;
var mats = NM.skin(m, { hipL: k / 2, hipR: k / 2, kneeL: k, kneeR: k, ankleL: k / 2, ankleR: k / 2, sink: sink });
var lowFoot = 1e9;
for (var i = 0; i < m.count; i++) {
  if ((m.bone[i] | 0) !== NM.BONES.indexOf('ankleL')) continue;
  lowFoot = Math.min(lowFoot, NM.posed(m, mats, i)[1]);
}
check('a flat-footed squat keeps the boots on the floor', Math.abs(lowFoot) < 0.03, 'lowest sole ' + lowFoot.toFixed(3) + ' m');

console.log('--- your crew aboard ---');
function shipOf(id, crew) {
  var h = Combat.HULLS[id];
  return { hullId: id, bornId: id + '-1', dryMass: h.dryMass, crew: crew };
}
/* Inside a room, or in a doorway — a bulkhead has thickness, and the
 * middle of a door is in it. */
function aboard(plan, p) {
  if (Walk.roomAt(plan, p.x, p.z)) return true;
  return plan.doors.some(function (d) { return p.x >= d.x0 - 0.01 && p.x <= d.x1 + 0.01 && p.z >= d.z0 - 0.01 && p.z <= d.z1 + 0.01; });
}
var ids = Object.keys(Combat.HULLS).filter(function (id) { return Combat.HULLS[id].size !== 'S'; });
var lost = [], wrongSeat = [], twoInSeat = [], noStation = [], frozen = [];
ids.forEach(function (id) {
  var need = Crew.crewNeeded(id, true), roster = [];
  ['engineer', 'gunner', 'pilot'].forEach(function (role) {
    for (var n = 0; n < Math.max(1, need[role] || 0); n++) {
      roster.push({ id: 'c|' + id + role + n, name: role + ' ' + n, role: role, rating: 3 });
    }
  });
  var ship = shipOf(id, roster), d = R.shipInterior(ship);
  if (!d) return;
  /* On a decked hull (2026-10-25) a scene is one deck: the bridge's here,
   * where the stations are. Anybody whose work is on another deck goes
   * into the lift and is `away`; everybody else must stay on this deck. */
  var plan = d.plan.decks ? d.plan.decks.bridge : d.plan;
  /* Choose an hour when every hand is on watch, so the stations are what
   * is being tested. */
  var sc = Npc.shipScene(plan, ship, { t: 0 }), now = 0, t = 0;
  for (var s = 0; s < 3600 * 2; s++) {
    now += 0.5; t += 0.5;
    var hold = Npc.update(sc, 0.5, { now: now, t: t, playerWalking: false });
    SD.updateDoors(plan, null, 0.5, hold);
    sc.people.forEach(function (p) {
      if (!p.away && !aboard(plan, p) && lost.indexOf(id + ':' + p.name) < 0) lost.push(id + ':' + p.name + '@' + p.x.toFixed(2) + ',' + p.z.toFixed(2));
    });
  }
  var d0 = d;
  d = { plan: plan };
  /* Who is seated at a station, and is it theirs? */
  var seats = {};
  sc.people.forEach(function (p) {
    if (!p.task || !p.task.station || p.act !== 'sit') return;
    /* A gunner's seat is under a turret dome when she has one (2026-10-25). */
    var seat = p.turret || p.station;
    if (seat.role !== p.role) wrongSeat.push(id + ':' + p.name);
    var key = seat.x.toFixed(2) + ',' + seat.z.toFixed(2);
    if (seats[key]) twoInSeat.push(id + ':' + key);
    seats[key] = true;
  });
  sc.people.forEach(function (p) {
    var hasKind = d.plan.stations.some(function (st) { return st.role === p.role; });
    if ((p.role === 'engineer' || p.role === 'gunner') && hasKind && !p.station && !p.assist && !p.turret) noStation.push(id + ':' + p.name);
    if (p.act === 'walk' && p.path.length && p.path[0].door) {
      var door = SD.doorById(d.plan, p.path[0].door);
      if (door && door.shut && Math.hypot(p.x - p.path[0].x, p.z - p.path[0].z) < 1.3) frozen.push(id + ':' + p.name);
    }
  });
});
check('nobody aboard ever leaves the ship', !lost.length, lost.slice(0, 4).join('  ') || ids.length + ' crewed hulls, an hour each');
check('a crewman on watch sits at a station of their own role', !wrongSeat.length, wrongSeat.join(', '));
check('one person to a seat', !twoInSeat.length, twoInSeat.join(', '));
check('every engineer and gunner has a station or a shoulder to stand at', !noStation.length, noStation.join(', '));
check('nobody is left at a door that will not open for them', !frozen.length, frozen.join(', '));

/* The pilot takes the helm when you walk away from it, and gives it back. */
var cap = ids.filter(function (id) { return Combat.HULLS[id].size === 'L'; })[0] || ids[0];
var ps = shipOf(cap, [{ id: 'c|p', name: 'Rue Sable', role: 'pilot', rating: 4 }]);
var pd = R.shipInterior(ps), psc = Npc.shipScene(pd.plan, ps, { t: 0 }), pnow = 0;
for (var j = 0; j < 900; j++) {
  pnow += 0.1;
  SD.updateDoors(pd.plan, null, 0.1, Npc.update(psc, 0.1, { now: pnow, t: pnow, playerWalking: true, helmFree: true, player: { x: 0, z: -30 } }));
}
var pilot = psc.people[0];
check('with you out of the seat, the pilot takes the helm', pilot.helm && pilot.act === 'sit', pilot.act + ' at ' + pilot.x.toFixed(2) + ',' + pilot.z.toFixed(2));
Npc.update(psc, 0.1, { now: pnow + 0.1, t: pnow, playerWalking: false });
check('and gives it back when you sit down', !pilot.helm);

console.log('--- a station deck ---');
var plan = Walk.layout('npc-test-port', { seed: 'kawartha', yard: true, ships: [{ id: 's', size: 'M', name: 'Abby', current: true }] });
var port = { id: 'npc-test-port', name: 'Test Port', market: { dev: 0.5 }, livery: 'navy' };
var realOcc = global.Sim.berthOccupants;
global.Sim.berthOccupants = function () {
  return [{ name: 'Grey Heron', route: { id: 'r1', faction: 'outlaw', cls: 'freighter', souls: 3, size: 'M' } },
          { name: 'Vigil', route: { id: 'r2', faction: 'f1', cls: 'navy', souls: 5, size: 'L' } },
          { name: 'Lark', route: { id: 'r3', faction: 'f2', cls: 'courier', souls: 2, size: 'S' } }];
};
var sc2 = Npc.stationScene(plan, port, {}, { t: 5000, seed: 'kawartha', livery: 'navy', corruption: 30 });
var roles = sc2.people.map(function (p) { return p.role; });
check('the desks are staffed', roles.indexOf('clerk') >= 0 && roles.indexOf('bartender') >= 0 && roles.indexOf('steward') >= 0, roles.join(' '));
check('a Navy port has marines at the big lock', sc2.people.some(function (p) { return p.role === 'marine' && Walk.roomAt(plan, p.x, p.z).id === 'lport'; }));
var hire = Crew.forHire(port, 5000).map(function (c) { return c.name; }).sort().join('|');
var hall = sc2.people.filter(function (p) { return p.forHire; }).map(function (p) { return p.name; }).sort().join('|');
check('the crew hall holds exactly the hands for hire', hire === hall, hire);
check('the ships in port send their crews, in their colours',
      sc2.people.some(function (p) { return p.shipName === 'Grey Heron' && p.liv === 'syn'; }) &&
      sc2.people.some(function (p) { return p.shipName === 'Vigil' && p.liv === 'navy'; }) &&
      sc2.people.some(function (p) { return p.shipName === 'Lark' && p.liv === 'civ'; }));
var syn = Npc.stationScene(plan, { id: 'npc-test-port', market: { dev: 0.3 }, livery: 'syn' }, {}, { t: 5000, seed: 'kawartha', livery: 'syn' });
var keepers = syn.people.filter(function (p) { return !p.shipName; });
check('a Syndicate port is kept by its own enforcers', keepers.some(function (p) { return p.role === 'enforcer'; }) &&
      !keepers.some(function (p) { return p.role === 'marine'; }));
var walls = [], nowS = 0;
for (var s2 = 0; s2 < 30 * 600; s2++) {
  nowS += 1 / 30;
  Npc.update(sc2, 1 / 30, { now: nowS, t: 5000 + nowS, player: { x: 0, z: -6 } });
  if (s2 % 30) continue;
  sc2.people.forEach(function (p) {
    if (!Walk.roomAt(plan, p.x, p.z) && walls.indexOf(p.name) < 0) walls.push(p.name + '@' + p.x.toFixed(1) + ',' + p.z.toFixed(1));
  });
}
check('nobody walks through a wall in ten minutes on the deck', !walls.length, walls.slice(0, 4).join('  '));
var moved = sc2.people.filter(function (p) { return p.n > 2; }).length;
check('people get on with things', moved > sc2.people.length / 2, moved + ' of ' + sc2.people.length + ' have moved on to a new task');

var firstHand = Crew.forHire(port, 5000)[0];
var after = Npc.stationScene(plan, port, {}, { t: 5000, seed: 'kawartha', livery: 'navy', signed: [firstHand.id] });
check('a hand you have signed on is no longer in the hall', !after.people.some(function (p) { return p.forHire && p.forHire.id === firstHand.id; }));
var again = Npc.stationScene(plan, port, {}, { t: 5000, seed: 'kawartha', livery: 'navy', corruption: 30 });
var same = Npc.stationScene(plan, port, {}, { t: 5000, seed: 'kawartha', livery: 'navy', corruption: 30 });
check('the same deck at the same moment is the same scene',
      JSON.stringify(again.people.map(function (p) { return [p.name, p.x, p.z, p.yaw]; })) ===
      JSON.stringify(same.people.map(function (p) { return [p.name, p.x, p.z, p.yaw]; })));
global.Sim.berthOccupants = realOcc;

console.log('--- NPC ships ---');
var c1 = Npc.crewForShip({ id: 'r9', name: 'Mother\'s Due', faction: 'pb0', cls: 'raider', souls: 4 });
var c2 = Npc.crewForShip({ id: 'r9', name: 'Mother\'s Due', faction: 'pb0', cls: 'raider', souls: 4 });
check('an NPC ship has the same crew wherever she is met', JSON.stringify(c1) === JSON.stringify(c2) && c1.length === 4);
check('a pirate crew is pirates', c1.every(function (c) { return c.liv === 'pir'; }) && c1.some(function (c) { return c.role === 'raider'; }));
check('a Navy crew has an officer and marines', (function () {
  var c = Npc.crewForShip({ id: 'n1', cls: 'navy', souls: 6 });
  return c.some(function (x) { return x.role === 'officer'; }) && c.some(function (x) { return x.role === 'marine'; });
})());

console.log('--- the rooms they work in (2026-10-25) ---');
/* Run a ship for a while and record where each hand has been. */
function runShip(id, roster, secs, walking, extra) {
  var ship = Object.assign(shipOf(id, roster), extra || {}), d = R.shipInterior(ship);
  var sc = Npc.shipScene(d.plan, ship, { t: 0 }), now = 0, been = {};
  for (var s = 0; s < secs * 2; s++) {
    now += 0.5;
    var hold = Npc.update(sc, 0.5, { now: now, t: now, playerWalking: !!walking, helmFree: !!walking });
    SD.updateDoors(d.plan, null, 0.5, hold);
    sc.people.forEach(function (p) {
      var r = Walk.roomAt(d.plan, p.x, p.z);
      var k = p.name + '|' + (r ? r.kind : '-') + '|' + (p.act === 'sit' && p.sit > 0.9 ? 'sit' : p.act);
      been[k] = true;
    });
  }
  return { sc: sc, plan: d.plan, been: been };
}
/* A Cutter with a turret fitted: the turret takes the best gunner, the
 * other works the forward guns from the bridge (crew.js gunnery). */
var cut = runShip('cutter', [
  { id: 'g1', name: 'Gun One', role: 'gunner', rating: 4 }, { id: 'g2', name: 'Gun Two', role: 'gunner', rating: 3 },
  { id: 'e1', name: 'Eng One', role: 'engineer', rating: 3 }, { id: 'e2', name: 'Eng Two', role: 'engineer', rating: 3 }], 4 * 3600, false,
  { turret: 'turret' });
check('the best gunner sits under the turret dome', !!cut.been['Gun One|turret|sit'] && cut.sc.people[0].turret);
check('the other works the forward guns from a bridge gunnery station', !cut.sc.people[1].turret &&
      cut.sc.people[1].station && cut.sc.people[1].station.role === 'gunner' && !!cut.been['Gun Two|bridgedeck|sit']);
check('an engineer\'s rounds go to the engine room', !!(cut.been['Eng One|engine|work'] || cut.been['Eng Two|engine|work']));
var cutBare = runShip('cutter', [{ id: 'g1', name: 'Gun One', role: 'gunner', rating: 4 }], 600);
check('with no turret fitted, a gunner is on the bridge', !cutBare.sc.people[0].turret && !!cutBare.been['Gun One|bridgedeck|sit']);
var wren = runShip('wren', [{ id: 'p1', name: 'Co Pilot', role: 'pilot', rating: 3 }], 600);
check('on a Wren, a pilot you hire sits in the co-pilot\'s seat', !!wren.been['Co Pilot|cockpit|sit'] &&
      wren.sc.people[0].station && wren.sc.people[0].station.kind === 'copilot');
var wrenW = runShip('wren', [{ id: 'p1', name: 'Co Pilot', role: 'pilot', rating: 3 }], 120, true);
check('and takes the helm when you get up', wrenW.sc.people[0].helm === true);
var lance = runShip('fighter', [{ id: 'g1', name: 'Tail Gun', role: 'gunner', rating: 3 }], 600);
check('on a Lance, a gunner sits at the console behind you', !!lance.been['Tail Gun|cockpit|sit'] &&
      lance.sc.people[0].station && lance.sc.people[0].station.role === 'gunner');
var wrenE = runShip('wren', [{ id: 'e1', name: 'Odd Hand', role: 'engineer', rating: 3 }], 600);
check('a hand of another trade still takes the free second seat', wrenE.sc.people[0].station && wrenE.sc.people[0].station.kind === 'copilot');

console.log('--- decks: work on another deck goes by the lift (2026-10-25) ---');
(function () {
  var crew = [{ id: 'e1', name: 'Eng One', role: 'engineer', rating: 3 }, { id: 'e2', name: 'Eng Two', role: 'engineer', rating: 3 },
              { id: 'e3', name: 'Eng Three', role: 'engineer', rating: 3 }];
  var ship = shipOf('capital', crew), d = R.shipInterior(ship), plan = d.plan.decks.bridge;
  var sc = Npc.shipScene(plan, ship, { t: 0 }), now = 0;
  var car = plan.rooms.filter(function (r) { return r.kind === 'lift'; })[0];
  var left = 0, back = 0, wasAway = {}, intoCar = true, onlyHere = true;
  for (var s = 0; s < 3600 * 2 * 3; s++) {
    now += 0.5;
    var hold = Npc.update(sc, 0.5, { now: now, t: now, playerWalking: false });
    SD.updateDoors(plan, null, 0.5, hold);
    sc.people.forEach(function (p) {
      if (p.away && !wasAway[p.id]) {
        left++;
        if (!(p.x > car.x0 - 0.3 && p.x < car.x1 + 0.3 && p.z > car.z0 - 0.3 && p.z < car.z1 + 0.3)) intoCar = false;
      }
      if (!p.away && wasAway[p.id]) back++;
      if (!p.away && !Walk.roomAt(plan, p.x, p.z) && !plan.doors.some(function (dd) { return p.x >= dd.x0 && p.x <= dd.x1 && p.z >= dd.z0 && p.z <= dd.z1; })) onlyHere = false;
      wasAway[p.id] = p.away;
    });
  }
  check('an engineer\'s round to the engine room leaves the bridge by the lift', left > 0 && intoCar, left + ' departures');
  check('and they come back up it', back > 0, back + ' returns');
  check('nobody on the bridge deck is ever off it', onlyHere);
  var away = sc.people.filter(function (p) { return p.away; });
  check('a hand on another deck is not drawn', Npc.figures(sc, null, 9).every(function (f) { return !f.person.away; }) || !away.length);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
