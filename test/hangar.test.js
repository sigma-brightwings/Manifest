/* Your ship in her hangar (2026-10-31).
 *
 * Astra: "we want to be able to get into our ship, not walk into a room and
 * use a door. I want the inside of the ship and the inside of the station
 * to be a clean, walkable path." She chose a hangar with her ramp, and her
 * airlock open while she is berthed. These are the pure halves of that:
 * walk.js's hangar (sized to her, her ramp facing the door, the two frames
 * a rotation apart) and airlock.js's berth mode. main.js joins them; the
 * walk itself is probed (tools/probe-hangar.js).
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'src', 'dressing.js'));
require(path.join(ROOT, 'src', 'walk.js'));
const AL = require(path.join(ROOT, 'src', 'airlock.js'));
const W = globalThis.Walk;

let pass = 0, fail = 0;
function ok(c, msg, extra) {
  if (c) { pass++; console.log('  ok   ' + msg + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '   ' + extra : '')); }
}

/* A Talon-sized ship, measured the way main.js measures her. */
const HG = { box: [-4.1, -11.2, 4.1, 9.5], hull: [-4.1, -9.6, 4.1, 9.5], height: 5.2, foot: { x: -2.0, z: -8.2 }, gy: -3.7 };
const ships = size => [{ id: 'current', size: size, name: 'Talon', current: true, hangar: HG }];

console.log('--- the hangar is sized to her ---');
['S', 'M', 'L'].forEach(size => {
  const p = W.layout('port-x', { seed: 'h', ships: ships(size) });
  const H = p.hangar, r = H && p.rooms.find(q => q.id === H.room);
  ok(!!H && !!r && r.hangar, size + ': your berth is a hangar', r && r.label);
  const len = HG.box[3] - HG.box[1], beam = HG.box[2] - HG.box[0];
  ok(r && Math.abs((r.x1 - r.x0) - (len + 2 * W.HANGAR_MARGIN)) < 1e-9 && (r.z1 - r.z0) >= beam + 2 * W.HANGAR_MARGIN - 1e-9,
     size + ': her length out from the spine, her beam along it, a margin round her', r && ((r.x1 - r.x0).toFixed(1) + ' x ' + (r.z1 - r.z0).toFixed(1)));
  ok(r && r.y1 >= HG.height + 2 - 1e-9, size + ': headroom over her', r && r.y1.toFixed(1));
  const hb = r.hullBox;
  ok(hb[0] > r.x0 && hb[2] < r.x1 && hb[1] > r.z0 && hb[3] < r.z1, size + ': she fits inside it');
});

console.log('--- her frame and the deck\'s ---');
{
  const p = W.layout('port-x', { seed: 'h', ships: ships('S') }), H = p.hangar, r = p.rooms.find(q => q.id === H.room);
  let worst = 0;
  for (let i = 0; i < 50; i++) {
    const sx = (i * 7.3) % 9 - 4.5, sz = (i * 3.1) % 20 - 10;
    const st = W.hangarToStation(H, sx, sz), back = W.hangarToShip(H, st.x, st.z);
    worst = Math.max(worst, Math.hypot(back.x - sx, back.z - sz));
  }
  ok(worst < 1e-9, 'a point of hers and the deck point it lands on convert back exactly', 'worst ' + worst.toExponential(1));
  /* Lengths and right angles survive: it is a rotation, not a stretch. */
  const a = W.hangarToStation(H, 0, 0), b = W.hangarToStation(H, 3, 0), c = W.hangarToStation(H, 0, 4);
  ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 3) < 1e-9 && Math.abs(Math.hypot(c.x - a.x, c.z - a.z) - 4) < 1e-9 &&
     Math.abs((b.x - a.x) * (c.x - a.x) + (b.z - a.z) * (c.z - a.z)) < 1e-9, 'it is a rotation: lengths and right angles kept');
  /* Her nose points away from the spine; her ramp faces the door. */
  const nose = W.hangarToStation(H, 0, 9), tail = W.hangarToStation(H, 0, -9);
  ok(Math.abs(nose.x) > Math.abs(tail.x), 'her nose points out, away from the spine');
  const door = p.doors.find(d => d.a === r.id || d.b === r.id);
  const footToDoor = Math.abs(H.foot.x - door.at), hullToDoor = Math.min(Math.abs(r.hullBox[0] - door.at), Math.abs(r.hullBox[2] - door.at));
  ok(footToDoor <= hullToDoor + 2.6, 'her ramp\'s foot is on the door side of her', 'foot ' + footToDoor.toFixed(1) + ' m from the door');
  ok(Math.abs(H.foot.z - (door.z0 + door.z1) / 2) < 3, 'and roughly in line with it', 'off by ' + Math.abs(H.foot.z - (door.z0 + door.z1) / 2).toFixed(2) + ' m');
  /* A heading turns with the frame. */
  const yawShip = 0.4, yawDeck = yawShip + H.theta;
  const fwdShip = W.hangarToStation(H, Math.sin(yawShip), Math.cos(yawShip)), o = W.hangarToStation(H, 0, 0);
  ok(Math.abs((fwdShip.x - o.x) - Math.sin(yawDeck)) < 1e-9 && Math.abs((fwdShip.z - o.z) - Math.cos(yawDeck)) < 1e-9, 'a heading turns by theta');
}

console.log('--- the deck around her ---');
{
  let bad = 0, n = 0;
  for (let i = 0; i < 12; i++) {
    const p = W.layout('port-' + i, { seed: 's' + i, yard: i % 2 === 0, ships: ships(['S', 'M', 'L'][i % 3]), others: i % 2 ? [{ name: 'Gannet', size: 'S' }, { name: 'Hesper', size: 'M' }] : [] });
    const r = p.rooms.find(q => q.id === p.hangar.room), hb = r.hullBox;
    p.items.filter(it => it.prop).forEach(it => {
      n++;
      const c = it.counter;
      if (c[2] > hb[0] && c[0] < hb[2] && c[3] > hb[1] && c[1] < hb[3]) bad++;
    });
    ok(W.standable(p, p.spawn.x, p.spawn.z) && W.roomAt(p, p.spawn.x, p.spawn.z) === r, 'port-' + i + ': you stand by her ramp on her hangar floor');
  }
  ok(bad === 0, 'nothing of the dressing stands on her', n + ' footprints checked');
  const p = W.layout('port-x', { seed: 'h', ships: ships('S') });
  const mine = p.items.find(it => it.kind === 'mine');
  ok(mine && mine.silent, 'nothing to press at her ramp: you walk up it');
}

console.log('--- the airlock while she is berthed ---');
{
  const plan = { doors: [{ id: 'lock', open: 0 }] }, ship = { airlock: { side: 'in', ramp: 0 } };
  AL.step(ship, plan, 0.1, { docked: true, berth: true });
  ok(ship.airlock.berth && ship.airlock.side === 'out' && plan.doors[0].locked === false, 'berthed: open to the hangar, the inner door free');
  for (let i = 0; i < 50; i++) AL.step(ship, plan, 0.1, { docked: true, berth: true });
  ok(ship.airlock.ramp === 1, 'and her ramp comes down on its own', ship.airlock.ramp);
  plan.doors[0].open = 1;
  AL.step(ship, plan, 0.1, { docked: true, berth: true });
  ok(plan.doors[0].locked === false && ship.airlock.ramp === 1, 'both ends open at once, while berthed (Astra: "Open while docked")');
  ok(/hangar/.test(AL.panelLabel(ship, { docked: true })), 'the panel says so', AL.panelLabel(ship, { docked: true }));
  const r = AL.request(ship, 'in', { docked: true });
  ok(!r.ok, 'no cycling while berthed', r.why);
  /* She leaves: the rule is back. */
  plan.doors[0].open = 0;
  AL.step(ship, plan, 0.1, { docked: false });
  ok(!ship.airlock.berth && ship.airlock.side === 'in' && ship.airlock.want === 0, 'undocked: sealed to the ship again, the ramp coming up');
  for (let i = 0; i < 50; i++) AL.step(ship, plan, 0.1, { docked: false });
  ok(ship.airlock.ramp === 0 && AL.sealed(ship), 'and fit to fly');
}

console.log('--- somebody works her berth (2026-10-31) ---');
{
  require(path.join(ROOT, 'src', 'npc.js'));
  const Npc = globalThis.Npc;
  const p = W.layout('port-x', { seed: 'h', ships: ships('M') });
  const r = p.rooms.find(q => q.id === p.hangar.room);
  /* Her footprint, as main.js arms it (plan.blocked). */
  p.blocked = (x, z) => x > r.hullBox[0] && x < r.hullBox[2] && z > r.hullBox[1] && z < r.hullBox[3];
  const sc = Npc.stationScene(p, { id: 'port-x' }, {}, { t: 1000, seed: 'h' });
  const hand = sc.people.find(q => q.staff === 'Berth hand');
  ok(!!hand, 'a berth hand is posted in your hangar');
  ok(hand && hand.post.x > r.x0 && hand.post.x < r.x1 && hand.post.z > r.z0 && hand.post.z < r.z1 && !p.blocked(hand.post.x, hand.post.z),
     'in the hangar, clear of her', hand && (hand.post.x.toFixed(1) + ', ' + hand.post.z.toFixed(1)));
  const none = Npc.stationScene(W.layout('port-x', { seed: 'h' }), { id: 'port-x' }, {}, { t: 1000, seed: 'h' });
  ok(!none.people.some(q => q.staff === 'Berth hand'), 'and none on a deck without a hangar');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
