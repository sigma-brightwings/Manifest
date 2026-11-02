/* boarding.test.js — aboard somebody else's ship, slice 1: at a station
 * (2026-10-28).
 *
 *     node test/boarding.test.js
 *
 * Astra chose boarding: aboard at a station, invited in space, a disabled
 * ship by force; and aboard, talk to the crew, trade with the captain,
 * recruit, take cargo. What this holds for the first slice:
 *   - every traffic class is walked as a real hull, and that hull has rooms;
 *   - the station deck gives every moored ship a berth and a hatch, and the
 *     rng that lays the deck out is asked the same questions with or without
 *     them;
 *   - the hand who works her berth stands clear of her hatch (E found them
 *     first, and you could never get aboard);
 *   - her crew on her deck are the faces from the concourse, her master holds
 *     her helm, and a crew's size comes from her hull, not a fraction;
 *   - aboard, her master offers business and her hands can be talked off her;
 *   - the crates in a hold are what is in it: none when it is empty, every
 *     slot filled when it is full, tinted by the goods; the old scatter stays
 *     exactly as it was when nobody says what is aboard.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/hulls.js');
var Walk = require('../src/walk.js');
var SD = require('../src/shipdeck.js');
require('../src/render.js');
require('../src/npcmodel.js');
try { require('../src/captains.js'); } catch (e) { /* optional */ }
var Npc = require('../src/npc.js');
var D = require('../src/dialogue.js');
var R = global.Render;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var H = Combat.HULLS;
function hullForClass(cls) { for (var id in H) if (H[id].mesh === cls) return id; return null; }

console.log('every traffic class is walked as a hull with rooms');
['courier', 'trade', 'shuttle', 'freighter', 'tanker', 'hauler', 'police', 'merc', 'pirate', 'enforcer',
 'enforcer_heavy', 'liner', 'bulk', 'navy', 'tender', 'tug', 'tug_heavy', 'shuttle_heavy', 'lance'].forEach(function (cls) {
  var hid = hullForClass(cls);
  var d = hid ? R.shipInterior({ hullId: hid, bornId: 'visit|' + cls, dryMass: H[hid].dryMass, cargo: {} }) : null;
  check(cls + ' → ' + hid, !!(d && d.plan && d.plan.rooms && d.plan.rooms.length));
});

console.log('the station deck: a berth and a hatch for every ship moored');
var others = [{ name: 'Alpha', size: 'S' }, { name: 'Bravo', size: 'M' }, { name: 'Charlie', size: 'L' },
              { name: 'Delta', size: 'S' }, { name: 'Echo', size: 'M' }];
var mine = [{ id: 'current', size: 'M', name: 'Mine', current: true }];
var plain = Walk.layout('p1', { seed: 's', ships: mine });
var busy = Walk.layout('p1', { seed: 's', ships: mine, others: others });
var hatches = busy.items.filter(function (it) { return it.kind === 'other'; });
check('five hatches', hatches.length === 5, hatches.map(function (h) { return h.label; }).join(' | '));
check('each in a berth of her size', hatches.every(function (h) {
  var br = busy.rooms.filter(function (r) { return r.id === h.berth; })[0];
  return br && br.other === h.other && br.size === (h.other.size === 'XL' ? 'L' : h.other.size);
}));
check('your own berth is unchanged', JSON.stringify(plain.spawn) === JSON.stringify(busy.spawn));
var plainL = plain.rooms.filter(function (r) { return r.kind === 'berth'; }).length;
var busyL = busy.rooms.filter(function (r) { return r.kind === 'berth'; }).length;
check('more berths when the port is busy, never fewer', busyL >= plainL, plainL + ' → ' + busyL);

console.log('the hand working her berth stands clear of the hatch');
var occFake = hatches.map(function (h, i) { return { name: h.other.name, route: { id: 'r' + i, name: h.other.name, cls: 'hauler' } }; });
var oldOcc = global.Sim.berthOccupants;
global.Sim.berthOccupants = function () { return occFake; };
var sc = Npc.stationScene(busy, { id: 'p1', name: 'Test' }, { id: 'sys' }, { t: 1000 });
global.Sim.berthOccupants = oldOcc;
var worst = Infinity;
hatches.forEach(function (h) {
  sc.people.filter(function (p) { return p.shipName === h.other.name && p.post; }).forEach(function (p) {
    worst = Math.min(worst, Math.hypot(p.post.x - h.x, p.post.z - h.z));
  });
});
check('every berth hand is 1.8 m or more from her hatch', worst >= 1.8, 'nearest ' + worst.toFixed(2) + ' m');

console.log('her crew, aboard her');
var route = { id: 'route-7', name: 'Coldwater Drover', cls: 'hauler', size: 0.09, faction: 'f1' };
var info = { id: route.id, name: route.name, cls: route.cls, size: route.size, faction: route.faction, route: route };
var crewA = Npc.crewForShip(info);
check('a hauler (an M hull) has a crew of three, not two', crewA.length === 3, crewA.length + '');
var hid = hullForClass('hauler');
var dv = R.shipInterior({ hullId: hid, bornId: 'visit|' + route.id, dryMass: H[hid].dryMass, cargo: {} });
var vp = dv.plan.decks ? dv.plan.decks.main : dv.plan;
var vs = Npc.visitScene(vp, info, { t: 5000 });
check('the same faces as the concourse', vs.people.map(function (p) { return p.id; }).join() === crewA.map(function (c) { return c.id; }).join());
check('her master holds her helm', vs.people[0].master && vs.people[0].helmSeat);
check('everyone else has a station, a turret or a room', vs.people.slice(1).every(function (p) { return p.station || p.turret || p.guard; }));
check('every one of them stands somewhere real', vs.people.every(function (p) { return isFinite(p.x) && isFinite(p.z); }));
check('marked as aboard their own ship', vs.people.every(function (p) { return p.aboard && p.route === route; }));

console.log('aboard, what you can say');
var G = { seed: 's', ship: { credits: 100000, crew: [], cargo: {} }, people: {}, t: 5000 };
var sys = { id: 'sys', byId: {}, bodies: [] };
function optIds(person) {
  var st = D.open(G, sys, null, person, 5000);
  return D.options(G, sys, null, st).map(function (o) { return o.id; });
}
var master = vs.people[0];
master.contactOf = function () { return null; };
var mo = optIds(master);
check('her master is asked about business', mo.indexOf('deal') >= 0, mo.join(','));
check('her master is not asked who his captain is', mo.indexOf('captain') < 0);
var hand = vs.people.filter(function (p) { return !p.master && (p.role === 'engineer' || p.role === 'pilot' || p.role === 'gunner'); })[0];
if (hand) {
  var ho = optIds(hand);
  check('a hand can be asked to fly with you', ho.indexOf('recruit') >= 0, ho.join(','));
  check('a hand does not offer her books', ho.indexOf('deal') < 0);
} else check('a crew-role hand aboard', false);

console.log('the crates are what is in the hold');
/* On the biggest hold of the player hulls, so there are slots enough for
 * two cargoes to show as two (a hauler's hold has two stacks). */
function cratesOf(k, load) {
  var d = R.shipInterior({ hullId: k, bornId: 'crates|' + k, dryMass: H[k].dryMass, cargo: {} });
  if (!d) return [];
  var p = SD.plan(d.geom, { hullId: k, size: H[k].size, key: 'crates-test', load: load });
  return p.crates || [];
}
var bigId = Object.keys(H).filter(function (k) { return H[k].cargoCap; })
  .sort(function (a, b) { return H[b].cargoCap - H[a].cargoCap; })
  .filter(function (k) { return cratesOf(k, { fill: 1, lines: [{ cid: 'x', t: 1 }] }).length >= 4; })[0];
function cratesFor(load) { return cratesOf(bigId, load); }
check('an empty ship you own shows an empty hold', (function () {
  var d = R.shipInterior({ hullId: bigId, bornId: 'own|' + bigId, dryMass: H[bigId].dryMass, cargo: {} });
  return (d.plan.crates || []).length === 0;
})());
check('and loading her rebuilds it with crates in', (function () {
  var s = { hullId: bigId, bornId: 'own2|' + bigId, dryMass: H[bigId].dryMass, cargo: {} };
  var a = R.shipInterior(s); s.cargo = { ore: H[bigId].cargoCap * 0.6 };
  var b = R.shipInterior(s);
  return a !== b && (b.plan.crates || []).length > 0;
})());
console.log('  (on the ' + bigId + ')');
var none = cratesFor(null), empty = cratesFor({ fill: 0, lines: [] }), full = cratesFor({ fill: 1, lines: [{ cid: 'ore', t: 100 }] });
var half = cratesFor({ fill: 0.5, lines: [{ cid: 'ore', t: 50 }, { cid: 'grain', t: 30 }] });
check('no load given: the old scatter, as it was', none.length > 0 && none.every(function (c) { return !c.cid; }));
check('an empty hold has no crates', empty.length === 0);
check('a full hold has every slot stacked full (' + SD.CRATE_STACK + ' high)', full.length > 0 &&
      full.every(function (c) { return c.high === SD.CRATE_STACK; }), full.length + ' stacks');
var units = function (cs) { return cs.reduce(function (a, c) { return a + c.high; }, 0); };
check('half full is about half the crates', Math.abs(units(half) - units(full) / 2) <= 1, units(half) + ' of ' + units(full));
check('mixed goods, mixed crates', half.some(function (c) { return c.cid === 'ore'; }) && half.some(function (c) { return c.cid === 'grain'; }));
check('one cargo, one colour', full.every(function (c) { return c.tint === full[0].tint; }));

/* EACH SHIP HER OWN SIZE (2026-10-29). Ships in space are drawn at their
 * route's size, up to four and a half times their hull's fitted length.
 * Astra: "we'll increase the ship size so that the hull interior makes
 * sense", each ship her own size. A ship carrying `lengthKm` is that long,
 * her cockpit at the same point of her model, her hold run on aft into the
 * extra, and nothing of her reaching further aft in her model than the
 * fitted hull's rooms did. */
console.log('--- each ship her own size ---');
(function () {
  var classes = ['shuttle', 'freighter', 'tanker', 'hauler', 'liner', 'bulk'];
  var bad = [], longer = 0, n = 0;
  classes.forEach(function (cls) {
    var id = Object.keys(H).filter(function (k) { return H[k].mesh === cls; })[0];
    if (!id) return;
    var base = { hullId: id, bornId: 'size|' + id, dryMass: H[id].dryMass, cargo: {} };
    var L0 = R.hullLength(base);
    var big = { hullId: id, bornId: 'size|' + id, dryMass: H[id].dryMass, cargo: {}, lengthKm: L0 * 3 };
    var d0 = R.shipInterior(base), d1 = R.shipInterior(big);
    if (!d0 || !d1) { bad.push(id + ' no interior'); return; }
    n++;
    if (Math.abs(R.hullLength(big) - L0 * 3) > 1e-9) bad.push(id + ' length');
    var a0 = R.cockpitAt(base) || [0, 0, 0], a1 = R.cockpitAt(big) || [0, 0, 0];
    if (Math.abs(a1[2] - a0[2] * 3) > 1e-6) bad.push(id + ' cockpit not scaled');
    var aft = function (p) { return Math.min.apply(null, p.rooms.map(function (r) { return r.z0; })); };
    var m0 = (a0[2] + aft(d0.plan)) / (L0 * 1000), m1 = (a1[2] + aft(d1.plan)) / (L0 * 3000);
    if (m1 < m0 - 1e-6) bad.push(id + ' aft ' + m1.toFixed(3) + ' past ' + m0.toFixed(3));
    var kinds = function (p) { return p.rooms.map(function (r) { return r.kind; }).sort().join(','); };
    if (kinds(d0.plan) !== kinds(d1.plan)) bad.push(id + ' rooms differ');
    var hold = function (p) { var r = SD.roomByKind(p, 'cargo') || SD.roomByKind(p, 'passage'); return r.z1 - r.z0; };
    if (hold(d1.plan) > hold(d0.plan) + 1) longer++;
  });
  check('every traffic hull plans at three times her length', n > 0 && bad.length === 0, bad.slice(0, 3).join(' | '));
  check('and her hold (or passage) is longer for it', longer === n, longer + ' of ' + n);
  /* "widen the hold" (2026-10-29): a ship three times her fitted length
   * has a hold wider than her hull's own, and every crate in it stands
   * inside it. "make sure that the boxes in the hold are representative of
   * what is actually in the hold": every line of her manifest has crates,
   * however small, each stack one cargo, and the tonnes the stacks say add
   * up to the line. */
  var hid = Object.keys(H).filter(function (k) { return H[k].mesh === 'hauler'; })[0];
  var L1 = R.hullLength(hid);
  var plainH = R.shipInterior({ hullId: hid, bornId: 'wide|0', dryMass: H[hid].dryMass, cargo: {} });
  var bigH = R.shipInterior({ hullId: hid, bornId: 'wide|1', dryMass: H[hid].dryMass, lengthKm: L1 * 3,
                              cargo: { waste: 300, medicine: 2, machinery: 40 } });
  var c0 = SD.roomByKind(plainH.plan, 'cargo'), c1 = SD.roomByKind(bigH.plan, 'cargo');
  check('her hold is widened to her beam', c1.x1 - c1.x0 > (c0.x1 - c0.x0) + 0.5,
        (c0.x1 - c0.x0).toFixed(1) + ' -> ' + (c1.x1 - c1.x0).toFixed(1) + ' m');
  var crates = bigH.plan.items.filter(function (it) { return it.kind === 'crate'; });
  check('every crate stands inside her hold', crates.length > 0 && crates.every(function (it) {
    var k = it.counter; return k[0] >= c1.x0 - 1e-6 && k[2] <= c1.x1 + 1e-6 && k[1] >= c1.z0 - 1e-6 && k[3] <= c1.z1 + 1e-6;
  }), crates.length + ' stacks');
  var per = {};
  crates.forEach(function (it) {
    var m = /([\d.]+) t$/.exec(it.label || '');
    if (it.cid) per[it.cid] = (per[it.cid] || 0) + (m ? +m[1] : 0);
  });
  check('every line of her manifest has crates, the two tonnes of medicine too',
        per.waste > 0 && per.medicine > 0 && per.machinery > 0, JSON.stringify(per));
  check('and their labels add up to her manifest', Math.abs(per.waste - 300) < 3 && Math.abs(per.medicine - 2) < 0.2 &&
        Math.abs(per.machinery - 40) < 2, JSON.stringify(per));
  check('and her hold holds more for being bigger', bigH.holdCap > H[hid].cargoCap * 1.5,
        Math.round(H[hid].cargoCap) + ' -> ' + Math.round(bigH.holdCap) + ' t');
  /* HALF-FULL HOLDS (2026-10-30): the timetable sizes each ship from a table
   * of the hulls her class is flown as. It must agree with the hulls, or a
   * ship sized half full would be drawn and walked at some other fill. */
  var Gen = global.Gen, bad2 = [];
  Object.keys(Gen.CLASS_HOLD).forEach(function (cls) {
    var row = Gen.CLASS_HOLD[cls];
    var id = Object.keys(H).filter(function (k) { return H[k].mesh === cls; })[0];
    if (!id) { bad2.push(cls + ' no hull'); return; }
    if (H[id].cargoCap !== row.cap) bad2.push(cls + ' cap ' + row.cap + ' vs ' + H[id].cargoCap);
    if (Math.abs(R.hullLength(id) * 1000 - row.len) > 0.5) bad2.push(cls + ' len ' + row.len + ' vs ' + (R.hullLength(id) * 1000));
  });
  check('the timetable\'s hold table matches the hulls', bad2.length === 0, bad2.join(' | '));
  /* And the two halves agree on a sized ship: what her screens and crates
   * say she holds is what the timetable sized her for. */
  var tShip = { hullId: hid, bornId: 'agree|1', dryMass: H[hid].dryMass, lengthKm: 0.070, cargo: {} };
  var tDeck = R.shipInterior(tShip);
  check('and her drawn hold holds what the timetable says',
        Math.abs(tDeck.holdCap - Gen.holdCapacity('hauler', 70)) < 1,
        Math.round(tDeck.holdCap) + ' vs ' + Math.round(Gen.holdCapacity('hauler', 70)) + ' t');
  /* Across forty seeds: every scheduled ship is between 42 and 62 percent
   * full on her heavier leg, give or take where her class's bounds bite. */
  var fills = [], over = 0;
  for (var sd = 0; sd < 40; sd++) {
    var sys = Gen.generateSystem('seed-' + sd);
    (sys.traffic || []).forEach(function (r) {
      if (r.heavy || r.feeder || !Gen.CLASS_HOLD[r.cls]) return;
      var load = Math.max.apply(null, [r.out, r.back].map(function (m) { return (m || []).reduce(function (a, x) { return a + x.qty; }, 0); }));
      if (!(load > 0)) return;
      var f = load / Gen.holdCapacity(r.cls, r.size * 1000);
      fills.push(f);
      if (f > 1) over++;
    });
  }
  fills.sort(function (a, b) { return a - b; });
  var med = fills[Math.floor(fills.length / 2)];
  check('scheduled holds run about half full', med > 0.42 && med < 0.62 && over === 0,
        'median ' + (med * 100).toFixed(0) + '% of ' + fills.length + ' ships, ' + over + ' over full');
  var plain = { hullId: 'talon', bornId: 'size|plain', dryMass: H.talon.dryMass, cargo: {} };
  check('a hull with no lengthKm is the length she always was', R.hullLength(plain) === R.hullLength('talon'));
})();

/* THE CONTAINERS (2026-10-30): Claude Design's nine, one kind per kind of
 * cargo (cargokit.js, built from ref/cargo/ by tools/cargo-kit.cjs). */
console.log('--- the containers ---');
(function () {
  var CK = require('../src/cargokit.js');
  var E = global.Economy;
  var kinds = CK.kinds();
  check('nine kinds off the sheet', kinds.length === 9, kinds.join(' '));
  var every = Object.keys(E.BY_ID).every(function (cid) { return kinds.indexOf(CK.kindFor(cid)) >= 0; });
  check('every commodity ships in one of them', every);
  check('hydrogen in a cryo tank, waste in a cask, livestock in a pen, timber strapped',
        CK.kindFor('hydrogen') === 'cryo' && CK.kindFor('waste') === 'cask' &&
        CK.kindFor('livestock') === 'livestock' && CK.kindFor('timber') === 'lumber');
  var worst = 0, nan = 0, tris = {};
  kinds.forEach(function (k) {
    var m = { v: [], f: [], c: [] };
    CK.build(m, k, { x: 0, y: 0, z: 0, yaw: 0, scale: SD.CRATE_SCALE, label: 'Medical supplies' });
    tris[k] = m.f.length;
    m.v.forEach(function (v) {
      if (v.some(isNaN)) nan++;
      worst = Math.max(worst, Math.abs(v[0]), Math.abs(v[2]));
    });
  });
  check('each builds whole', nan === 0 && kinds.every(function (k) { return tris[k] > 50; }), JSON.stringify(tris));
  check('inside the 1.1 m slot', worst * 2 <= 1.1 + 1e-9, (worst * 2).toFixed(3) + ' m');
  check('two to a stack, under the hold\'s lights', 2 * CK.HEIGHT * SD.CRATE_SCALE + 0.04 < 2.9, (CK.HEIGHT * SD.CRATE_SCALE).toFixed(3) + ' m each');
  /* LETTERING READS THE RIGHT WAY ROUND (Astra, 2026-10-30: "HYDROGEN FUEL"
   * came out backwards). For a container on either wall, turned to the
   * aisle as the hold turns it, a reader standing in front of each face and
   * facing it has the face's reading direction on their right — right as
   * walk.js has it: r = (cos yaw, 0, -sin yaw) for a walker facing
   * (sin yaw, 0, cos yaw). The strip and the placards lay their columns
   * out along that direction, first letter first. */
  var reads = [];
  [Math.PI / 2, -Math.PI / 2].forEach(function (Y) {
    var P = CK.placer({ x: 0, y: 0, z: 0, yaw: Y, scale: 1 }), O = P([0, 0, 0]);
    function world(v) { var q = P(v); return [q[0] - O[0], q[1] - O[1], q[2] - O[2]]; }
    ['z+', 'x+', 'y+'].forEach(function (face) {
      var F = CK.faceFrame(face, [1, 1, 1]);
      /* The reader faces the face; for the lid, the front face (they stand
       * at the front and look down at it). */
      var nrm = world(face === 'y+' ? [0, 0, 1] : F.n);
      var yawR = Math.atan2(-nrm[0], -nrm[2]);
      var right = [Math.cos(yawR), 0, -Math.sin(yawR)];
      var u = world(F.u);
      var len = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
      reads.push((u[0] * right[0] + u[2] * right[2]) / len);
    });
  });
  check('lettering and pictograms read the right way round, on both walls and every face',
        reads.every(function (d) { return d > 0.99; }), reads.map(function (d) { return d.toFixed(2); }).join(' '));
  /* A small hold with more cargoes than stacks: each container its own
   * line, biggest first, as many lines as there are containers. */
  var nine = ['hydrogen', 'ores', 'medical', 'livestock', 'waste', 'timber', 'aicores', 'chemicals', 'textiles']
    .map(function (cid, i) { return { cid: cid, t: 40 - i * 4 }; });
  var small = cratesOf('mule', { fill: 0.95, lines: nine });
  var shown = {};
  small.forEach(function (c) { (c.levels || []).forEach(function (v) { shown[v.cid] = true; }); });
  var slotsN = units(small);
  check('a small hold shows as many of her cargoes as it has containers, biggest first',
        small.length > 0 && Object.keys(shown).length === Math.min(nine.length, slotsN) && shown.hydrogen && shown.ores,
        small.length + ' stacks, ' + slotsN + ' containers, cargoes ' + Object.keys(shown).join(' '));
  var rows = CK.textRows('Hydrogen fuel');
  check('the strip spells her cargo', rows.length === 7 && rows[0].length === 13 * 6 - 1 && /#/.test(rows.join('')));
  /* A full hold of the biggest player hull, in triangles. */
  var full2 = cratesFor({ fill: 1, lines: [{ cid: 'hydrogen', t: 100 }] });
  var n = units(full2), most = Math.max.apply(null, kinds.map(function (k) { return tris[k]; }));
  check('a full hold stays a reasonable mesh', n * most < 200000, n + ' containers, at most ' + (n * most) + ' triangles');
})();

/* THE WALKWAY, DRESSED (2026-10-30): more on the walls, floor and ceiling,
 * and still the 1.3 m to walk down it always was. Nothing the passage
 * draws between knee and head height comes further in than 16 cm from a
 * wall (the handrail is 9, the extinguisher and signs less), on every hull
 * that has a passage. */
console.log('--- the walkway ---');
(function () {
  var bad = [], seen = 0;
  Object.keys(H).forEach(function (k) {
    var d = R.shipInterior({ hullId: k, bornId: 'walkway|' + k, dryMass: H[k].dryMass, cargo: {} });
    /* One-deck hulls: on a decked one the main deck sits at its own
     * height, and the same passage code dresses it. */
    if (!d || d.plan.decks || !d.meshes) return;
    var ps = SD.roomByKind(d.plan, 'passage');
    /* The deck's floor: the plan's, which a raised cockpit (shipdeck.js
     * RAISED) stands above; the cockpit's own is geom's. */
    var room = d.meshes.room, fy = d.plan.floorY;
    if (!ps || !room || !room.v) return;
    seen++;
    var worst = 0;
    room.v.forEach(function (v) {
      if (v[2] < ps.z0 + 0.25 || v[2] > ps.z1 - 0.25) return;
      if (v[1] < fy + 0.2 || v[1] > fy + 2.25 - 0.3) return;
      if (Math.abs(v[0]) >= ps.x1) return;
      worst = Math.max(worst, ps.x1 - 0.16 - Math.abs(v[0]));
    });
    if (worst > 1e-6) bad.push(k + ' ' + (worst * 100).toFixed(1) + ' cm');
  });
  check('the walkway is as wide as it was, on every hull with a passage (' + seen + ')', seen > 5 && bad.length === 0, bad.join(', '));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
