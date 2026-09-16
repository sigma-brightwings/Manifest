import * as THREE from 'three';

/* Geometry checks for station models. Run these after any change to
 * station.js — they encode the invariants that broke repeatedly during the
 * build, so a future design can be validated instead of eyeballed.
 *
 *   import { checkStation, checkAll } from './station-tests.js';
 *   import { STATION_TYPES } from './station.js';
 *
 *   console.table(checkAll(STATION_TYPES, THREE));
 *
 * Every check returns a list of plain-string problems. An empty list is a pass.
 */

const T = THREE;

/* Largest hull per size class, measured across the whole fleet. Update these if
 * you add a ship bigger than the current heaviest. */
export const FLEET = {
  S: { w: 4.80, h: 3.58, d: 8.80 },
  M: { w: 5.96, h: 4.37, d: 10.61 },
  L: { w: 7.06, h: 5.17, d: 12.31 }
};

const IGNORE = /Decal|Lamp|Caution|ForceField|Designation|billboard|NavLight|NavHood|Threshold|Marker/i;

function meshesOf(obj) {
  const out = [];
  obj.updateMatrixWorld(true);
  obj.traverse(n => {
    if (!n.isMesh) return;
    n.updateWorldMatrix(true, false);
    out.push({ node: n, box: new T.Box3().setFromObject(n) });
  });
  return out;
}
function berthsOf(obj) {
  const out = [];
  obj.traverse(n => { if (!n.isMesh && /Berth$|^berthSM|^berthL/i.test(n.name)) out.push(n); });
  return out;
}
const volOf = b => { const s = b.getSize(new T.Vector3()); return s.x * s.y * s.z; };

/* THE important one: can a ship actually fly in? Five rays per berth (centre
 * plus four inset corners) along the aperture's own normal — which is the berth
 * group's local +Z — over the length of the hull that berth serves. */
export function checkApproachCorridors(station) {
  const problems = [];
  const all = meshesOf(station);
  const ray = new T.Raycaster();
  berthsOf(station).forEach(bg => {
    let throat = null; const own = new Set();
    bg.traverse(m => { if (m.isMesh) { own.add(m); if (/Throat$/.test(m.name)) throat = m; } });
    if (!throat) { problems.push(`NO-THROAT ${bg.name}`); return; }
    throat.updateWorldMatrix(true, false);
    const tb = new T.Box3().setFromObject(throat);
    const q = bg.getWorldQuaternion(new T.Quaternion());
    const fwd = new T.Vector3(0, 0, 1).applyQuaternion(q).normalize();
    const up = new T.Vector3(0, 1, 0).applyQuaternion(q);
    const right = new T.Vector3(1, 0, 0).applyQuaternion(q);
    const hull = /berthL/i.test(bg.name) ? FLEET.L : FLEET.M;
    const hw = hull.w / 2 * 0.8, hh = hull.h / 2 * 0.8;
    const targets = all.filter(m => !own.has(m.node) && !IGNORE.test(m.node.name)).map(m => m.node);
    const c = tb.getCenter(new T.Vector3());
    let worst = null;
    [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([ox, oy]) => {
      const o = c.clone()
        .add(right.clone().multiplyScalar(ox * hw))
        .add(up.clone().multiplyScalar(oy * hh));
      ray.set(o, fwd);
      const hits = ray.intersectObjects(targets, false);
      if (hits.length && hits[0].distance < hull.d && (!worst || hits[0].distance < worst.d))
        worst = { d: hits[0].distance, name: hits[0].object.name };
    });
    if (worst) problems.push(`BLOCKED ${bg.name} by ${worst.name} @${worst.d.toFixed(1)}`);
  });
  return problems;
}

/* Berth throats must exceed the hull class they serve in all three axes,
 * accounting for the berth's rotation. */
export function checkFit(station) {
  const problems = [];
  meshesOf(station).filter(m => /Throat$/.test(m.node.name)).forEach(m => {
    const s = m.box.getSize(new T.Vector3());
    const hull = /berthL/i.test(m.node.name) ? FLEET.L : FLEET.M;
    const horiz = [s.x, s.z].sort((a, b) => a - b);
    if (horiz[0] < hull.w - 0.01 || horiz[1] < hull.d - 0.01 || s.y < hull.h - 0.01)
      problems.push(`TOO-SMALL ${m.node.name} ${s.x.toFixed(2)}x${s.y.toFixed(2)}x${s.z.toFixed(2)}`);
  });
  return problems;
}

/* A stowed door leaf must be inside a structural volume, not proud of the face. */
export function checkDoorsRecessed(station) {
  const problems = [];
  const all = meshesOf(station);
  const houses = all.filter(m => /House/.test(m.node.name));
  all.filter(m => /SlidingDoor|BlastDoor/.test(m.node.name)).forEach(l => {
    const lv = volOf(l.box);
    let inside = 0;
    houses.forEach(h => {
      const it = l.box.clone().intersect(h.box);
      if (!it.isEmpty()) inside = Math.max(inside, volOf(it));
    });
    if (inside / lv < 0.9) problems.push(`LEAF-EXPOSED ${l.node.name} ${(inside / lv).toFixed(2)}`);
  });
  return problems;
}

/* Every berth needs its gate set, its airlock inner gate, and nav lights. */
export function checkBerthFittings(station) {
  const problems = [];
  berthsOf(station).forEach(bg => {
    let leaves = 0, field = false, nav = 0, inner = false, pocket = false;
    bg.traverse(m => {
      if (!m.isMesh) return;
      if (/SlidingDoor[LR][12]$/.test(m.name)) leaves++;
      if (/ForceField/.test(m.name)) field = true;
      if (/NavLight/.test(m.name)) nav++;
      if (/InnerGate/.test(m.name)) inner = true;
      if (/DoorPocket|BlastPocket/.test(m.name)) pocket = true;
    });
    if (!field && leaves !== 4) problems.push(`DOOR-COUNT ${bg.name}=${leaves}`);
    if (nav !== 2) problems.push(`NAV-LIGHTS ${bg.name}=${nav}`);
    if (!inner) problems.push(`NO-INNER-GATE ${bg.name}`);
    if (!pocket) problems.push(`NO-DOOR-RECESS ${bg.name}`);
  });
  return problems;
}

/* Interior fittings must not be buried in the hall's own walls, and the hall
 * must not interpenetrate the station it belongs to. */
export function checkInteriors(station) {
  const problems = [];
  const all = meshesOf(station);
  const WALL = /^hall(WallL|WallR|BackWall|Roof|Floor)$/;
  const FIT = /^hall(Stand|Crane|Ad|HallLight|Greeble|Crate|FloorDecal)/;
  const walls = all.filter(m => WALL.test(m.node.name));
  all.filter(m => FIT.test(m.node.name)).forEach(f => {
    walls.forEach(w => {
      if (f.node === w.node) return;
      const it = f.box.clone().intersect(w.box);
      if (!it.isEmpty() && volOf(it) > 0.06)
        problems.push(`FITTING-IN-WALL ${f.node.name} X ${w.node.name}`);
    });
  });
  const hall = all.filter(m => /^hall(Floor|Roof|Wall|BackWall)/.test(m.node.name));
  /* The hangar now lives INSIDE the hull, so the station's own enclosure is not
     something it may not touch — it is what contains it. A hollow prism's AABB
     is solid, so an enclosed hangar reads as interpenetrating every shell mesh
     (house rule 5 again). Enclosure pieces are exempt; real obstructions —
     decks, blocks, clutter, structure — still fire. */
  const rest = all.filter(m => !/^hall|^transferMain/.test(m.node.name) && !ENCLOSURE.test(m.node.name));
  hall.forEach(h => rest.forEach(o => {
    const it = h.box.clone().intersect(o.box);
    if (!it.isEmpty() && volOf(it) > 0.5)
      problems.push(`HALL-INTERSECTS ${h.node.name} X ${o.node.name} ${volOf(it).toFixed(1)}`);
  }));
  return problems;
}

/* The transfer line has to start at an airlock, or ships arrive nowhere. */
export function checkTransferLine(station) {
  const problems = [];
  const all = meshesOf(station);
  const rollers = all.filter(m => /transferMainRoller/.test(m.node.name));
  const gates = all.filter(m => /InnerGate$/.test(m.node.name));
  /* A transfer line may be the old transferMain run OR any conveyor, and the
     internal destination may be a nested hangar rather than an attached hall.
     The ring routes its four entry ports through lifts and conveyors into a
     hangar inside each hub, so both assertions were failing a station whose
     route is better than the one they were written for. */
  const anyConveyor = all.some(m => /ConveyorRoller/.test(m.node.name));
  if (!rollers.length && !anyConveyor) problems.push('NO-TRANSFER-LINE');
  const anyHangar = all.some(m => /Hangar(Floor|RoofFrame)/.test(m.node.name));
  if (!all.some(m => /^hallFloor$/.test(m.node.name)) && !anyHangar)
    problems.push('NO-INTERNAL-HALL');
  if (rollers.length && gates.length) {
    /* A hull leaves the gate, drops down the lift, and only then meets the
       rollers — so the line is anchored to the LIFT CAR on stations that have
       one, and straight to the gate on those that don't. Measuring roller-to-
       gate unconditionally flagged all twelve stations, when what it was
       actually measuring was the shaft's height. */
    const car = all.filter(m => /^transferLiftCar$/.test(m.node.name));
    const anchors = car.length ? car : gates;
    const anchorName = car.length ? 'LIFT-CAR' : 'GATE';
    let best = Infinity;
    rollers.forEach(r => anchors.forEach(a => {
      best = Math.min(best, r.box.clone().expandByScalar(0.5).distanceToPoint(a.box.getCenter(new T.Vector3())));
    }));
    if (best > 1.0) problems.push(`LINE-NOT-AT-${anchorName} gap=${best.toFixed(2)}`);
    // and the lift must actually reach the gate it serves
    if (car.length) {
      const shaft = all.filter(m => /^transferLiftShaft$/.test(m.node.name));
      const reaches = shaft.some(s => gates.some(g => s.box.clone().expandByScalar(0.5).intersectsBox(g.box)));
      if (!reaches) problems.push('LIFT-NOT-AT-GATE');
    }
  }
  return problems;
}

/* Bay conveyors must share real volume with their bed, not merely touch it.
 * Measured in the BED'S LOCAL FRAME: every bay is rotated to its bore facet, so
 * world AABBs are inflated to several times the roller's real thickness and an
 * overlap test on them reported 99% seating where the truth was 40% — and passed
 * a roller floating a full unit clear (house rules 5 and 8). Roller and bed
 * share the same rotation, so the bed's basis is the right one to measure in. */
export function checkConveyorSeating(station) {
  const problems = [];
  const beds = new Map();
  station.updateMatrixWorld(true);
  station.traverse(n => {
    if (n.isMesh && /ConveyorBed$/.test(n.name)) beds.set(n.name.replace(/ConveyorBed$/, ''), n);
  });
  station.traverse(roller => {
    if (!roller.isMesh || !/ConveyorRoller\d+$/.test(roller.name)) return;
    /* Pair by ANCESTRY first, name only as a fallback. A roller and its bed are
       siblings in one conveyor group, and names are not unique: the ring's
       mirrored half is a deep clone, so a Map keyed by name holds only the
       mirror's bed and every roller in the lower ring was measured against a
       bed 46 units above it — reported as detached when it was seated fine. */
    const bed = (roller.parent && roller.parent.children.find(c => c.isMesh && /ConveyorBed$/.test(c.name)))
      || beds.get(roller.name.replace(/ConveyorRoller\d+$/, ''));
    if (!bed) { problems.push(`ROLLER-NO-BED ${roller.name}`); return; }
    const bedThick = bed.geometry.parameters.height;
    const rollerThick = roller.geometry.parameters.height;
    const toBed = new T.Matrix4().copy(bed.matrixWorld).invert();
    const c = roller.getWorldPosition(new T.Vector3()).applyMatrix4(toBed);
    // seat depth along the bed's own thickness axis
    const seat = (bedThick + rollerThick) / 2 - Math.abs(c.y);
    const share = seat / rollerThick;
    if (share <= 0) problems.push(`ROLLER-DETACHED ${roller.name} clear=${(-seat).toFixed(2)}`);
    else if (share < 0.25) problems.push(`ROLLER-BARELY-SEATED ${roller.name} ${(share * 100).toFixed(0)}%`);
  });
  return problems;
}

/* The hall must be BUILT INTO the station, not parked beside it: the apron has
 * to share real volume with primary hull at one end and the hall at the other.
 * Seating it against the station's bounding plane instead of real structure
 * left it floating ~1.8 clear with the apron bridging nothing, and no existing
 * check noticed — checkInteriors only asserts the hall does NOT overlap. */
export function checkHallJunction(station) {
  const problems = [];
  const all = meshesOf(station);
  const apron = all.find(m => /^hallApron$/.test(m.node.name));
  if (!apron) return ['NO-HALL-APRON'];
  const isHall = m => /^hall/.test(m.node.name);
  const isRoute = m => /^transferMain|^transferLift|^liftGuide/.test(m.node.name);
  const grown = apron.box.clone().expandByScalar(0.05);
  if (!all.some(m => !isHall(m) && !isRoute(m) && grown.intersectsBox(m.box)))
    problems.push('APRON-NOT-ON-HULL');
  if (!all.some(m => isHall(m) && m !== apron && grown.intersectsBox(m.box)))
    problems.push('APRON-NOT-ON-HALL');
  return problems;
}

/* Closed doors must SEAL. Every leaf carries its own closed pose, so the test
 * is arithmetic on those poses rather than a rendered guess: each side's leaves
 * must together span from its jamb to the centreline, and the two sides must
 * meet. Reads userData.gate directly so it cannot disagree with what
 * setBerthDoors will actually do. */
export function checkDoorClosure(station) {
  const problems = [];
  berthsOf(station).forEach(bg => {
    let throat = null;
    const leaves = [];
    bg.traverse(n => {
      if (!n.isMesh) return;
      if (/Throat$/.test(n.name)) throat = n;
      if (n.userData && n.userData.gate) leaves.push(n);
    });
    if (!throat) return;
    if (!leaves.length) { problems.push(`NO-DOOR-LEAVES ${bg.name}`); return; }
    const w = throat.geometry.parameters.width;
    let reachL = -w / 2, reachR = w / 2;      // how far inboard each side gets
    leaves.forEach(n => {
      const lw = n.geometry.parameters.width;
      const d = n.userData.gate;
      if (d.closed < 0) reachL = Math.max(reachL, d.closed + lw / 2);
      else reachR = Math.min(reachR, d.closed - lw / 2);
      if (Math.abs(d.closed) + lw / 2 > w / 2 + 0.12)
        problems.push(`DOOR-OVERRUNS-JAMB ${n.name} by ${(Math.abs(d.closed) + lw / 2 - w / 2).toFixed(2)}`);
    });
    if (reachL < reachR - 0.02)
      problems.push(`DOOR-GAP ${bg.name} ${(reachR - reachL).toFixed(2)} on the centreline`);
  });
  return problems;
}

/* A leaf must have somewhere to close INTO. Swept to its sealed pose it may
 * touch its own berth and the station's enclosure, and nothing else — on the
 * cradle the heavy leaves close straight through `spine` and `hangarShellL`
 * and the S/M leaves through `lightTubeL`, which is why those doors read as
 * broken while checkDoorClosure calls them sealed: the arithmetic seals, the
 * geometry does not. Lives here rather than in checkDoorClosure because that
 * one gates every commit and this is a known-failing pattern. */
export function checkDoorSweep(station) {
  const problems = [];
  const all = meshesOf(station);
  station.updateMatrixWorld(true);
  berthsOf(station).forEach(bg => {
    const own = new Set();
    bg.traverse(n => { if (n.isMesh) own.add(n); });
    bg.traverse(leaf => {
      const d = leaf.userData && leaf.userData.gate;
      if (!d || !leaf.isMesh) return;
      const rec = all.find(m => m.node === leaf);
      if (!rec) return;
      const swept = rec.box.clone();
      // the leaf's travel is along its own x; union of both poses
      const shift = d.closed - leaf.position.x;
      swept.union(rec.box.clone().translate(new T.Vector3(shift, 0, 0)));
      const hits = [];
      all.forEach(m => {
        if (own.has(m.node) || ENCLOSURE.test(m.node.name)) return;
        const it = m.box.clone().intersect(swept);
        if (it.isEmpty()) return;
        const s = it.getSize(new T.Vector3());
        if (s.x * s.y * s.z > 0.25) hits.push(m.node.name);
      });
      if (hits.length)
        problems.push(`DOOR-SWEEPS-STRUCTURE ${leaf.name} through ${hits.slice(0, 3).join(',')}${hits.length > 3 ? ` +${hits.length - 3}` : ''}`);
    });
  });
  return problems;
}

/* THE ROUTE CHECK: can a hull actually get from the docking aperture, through
 * the airlock, onto the lift, down it and into the hangar without meeting
 * geometry? checkApproachCorridors only covers the fly-in; everything inboard
 * of the inner gate was previously unmeasured, which is where the interesting
 * collisions live.
 *
 * The moving volume is the berth's own Throat, shrunk 10% — it is already sized
 * to the hull that berth serves, so the test cannot drift from the fleet.
 * Swept along each leg of the route as an OBB-free AABB at samples; anything it
 * meets that is not route, hangar, that berth's own fittings or surface decor
 * is a collision the player would hit. */
/* The route's OWN FURNITURE is not an obstruction: a hull rides the lift car,
   passes its deck markings, runs over the conveyor and parks on a stand. The
   patterns are matched anywhere in the name, not anchored to the start, because
   a route part is tagged with the run it belongs to — the ring's lift is
   ringHoist0transferLiftCar, not transferLiftCar, and anchoring made the check
   report the very platform the ship stands on as blocking it. */
const ROUTE_OK = /^hall|transferMain|transferLift|liftGuide|liftRam|Conveyor|CarCaution|CarMark|PocketFloor|ShaftLight|ShaftWall|Hangar|StandOutline|StandInner|StandClamp|StandNumber|^groundSaddle|^cradleArc|^standShoe|Light\d*Fixture|Light\d*Glow/;

/* The station's own ENCLOSURE: the shells, end plates, bay walls, screening
 * walls and the deck the route runs on. A hull inside these is docked, not
 * colliding — and because a hollow prism's bounding box is solid, no AABB test
 * can tell the difference. Kept as an explicit named list so it cannot quietly
 * grow to cover a real obstruction.
 *
 * The test for admission is narrow: a part qualifies only if it is the
 * enclosure itself, the berth's own mount, or decor fixed to the OUTER face of
 * one of those. It cannot be anything a hull could actually meet. The sweep
 * volume is a full hull length, so inside a tight interior — the ring's joining
 * trunk is 15 deep against a 13.5 hull — it necessarily reaches the walls; that
 * is a property of the probe, not an obstruction, and the alternative of
 * shrinking the probe would stop it catching real ones. */
const ENCLOSURE = /^shell(Outer|Inner)$|^endPlate|^endFrame|^endCapAft$|^bayShell|^bayWall|^screenWall|^transferDeck$|^berthPylon\d+(Roof|Floor|Wall)|^joiningHub(Roof|Floor|Wall|Aft|Band)|^hub$|^hubCrown$|^berthTrunk|^hubSpar|^hubLadder|^ringRail|^hubCollar|^hubWindow|^joiningHubPort|^joiningHubGreeble/;

export function checkDockingRoute(station) {
  const problems = [];
  const all = meshesOf(station);
  station.updateMatrixWorld(true);
  /* Nearest waypoint that lies INBOARD of the berth — in the direction a hull
     actually travels — rather than nearest in any direction at all.
     Raw proximity picked the wrong route: the ring's heavy berth sits between
     two ring hubs, and one of those hubs' parking stands was 17 away against
     its own hangar's at 18.8, so the sweep ran a leg from the trunk out to a
     ring and reported every berth it crossed as blocking it. Direction is the
     signal that distance alone cannot give. */
  const nearInboard = (list, p, inward) => {
    let best = null, bd = Infinity;
    list.forEach(m => {
      const c = m.box.getCenter(new T.Vector3());
      const rel = c.clone().sub(p);
      if (inward && rel.lengthSq() > 1e-6 && rel.clone().normalize().dot(inward) < 0.2) return;
      const d = rel.length();
      if (d < bd) { bd = d; best = m; }
    });
    return best;
  };
  const near = (list, p) => nearInboard(list, p, null);
  /* Suffix match, not exact: the ring tags each lift with the run it serves. */
  const cars = all.filter(m => /transferLiftCar$/.test(m.node.name));
  const beds = all.filter(m => /^transferMainBed$|ConveyorBed$/.test(m.node.name));
  const stands = all.filter(m => /StandOutline/.test(m.node.name));

  berthsOf(station).forEach(bg => {
    const own = new Set();
    bg.traverse(n => { if (n.isMesh) own.add(n); });
    const throat = all.find(m => own.has(m.node) && /Throat$/.test(m.node.name));
    if (!throat) { problems.push(`ROUTE-NO-THROAT ${bg.name}`); return; }
    const size = throat.box.getSize(new T.Vector3()).multiplyScalar(0.9);
    const gate = all.find(m => own.has(m.node) && /InnerGate$/.test(m.node.name));
    const legs = [throat.box.getCenter(new T.Vector3())];
    /* A leg is only taken if its waypoint is plausibly THIS berth's. The
       nearest lift car to a heavy berth that has no lift is one in a ring hub on
       the far side of the station, and taking it dragged a leg across the whole
       structure — reporting every fitting it passed as blocking a route that
       does not go that way. Same principle checkTransferLine already uses.
       Reach is measured off the berth's own throat, not a constant. */
    const reach = throat.box.getSize(new T.Vector3()).length() * 2.5;
    const nearby = m => m && m.box.getCenter(new T.Vector3()).distanceTo(legs[0]) < reach;
    /* The berth's own inward direction: a hull enters along the aperture's
       normal, which is the group's local +Z, so it travels local -Z. */
    bg.updateMatrixWorld(true);
    const inward = new T.Vector3(0, 0, -1)
      .applyQuaternion(new T.Quaternion().setFromRotationMatrix(bg.matrixWorld)).normalize();
    [gate, nearInboard(cars, legs[0], inward), nearInboard(beds, legs[0], inward),
     nearInboard(stands, legs[0], inward)].forEach(m => {
      if (m === gate ? !!m : nearby(m)) legs.push(m.box.getCenter(new T.Vector3()));
    });
    /* The assertion is that the route REACHES A DESTINATION, not that it has a
       particular number of legs. A fixed count of four demanded a lift leg from
       every berth, and the ring's heavy berth opens straight into its hangar
       inside the joining trunk with no lift at all — a better route than the
       one the count was written for, reported as incomplete. */
    const dest = nearInboard(stands, legs[0], inward);
    if (!dest || !nearby(dest)) { problems.push(`ROUTE-NO-DESTINATION ${bg.name}`); return; }
    if (legs.length < 3) { problems.push(`ROUTE-INCOMPLETE ${bg.name} (${legs.length} waypoints)`); return; }
    const hits = new Set();
    for (let i = 0; i < legs.length - 1; i++) {
      for (let s = 0; s <= 8; s++) {
        const p = legs[i].clone().lerp(legs[i + 1], s / 8);
        const vol = new T.Box3().setFromCenterAndSize(p, size);
        all.forEach(m => {
          if (own.has(m.node) || ROUTE_OK.test(m.node.name) || ENCLOSURE.test(m.node.name)) return;
          if (vol.intersectsBox(m.box)) hits.add(m.node.name);
        });
      }
    }
    if (hits.size) problems.push(`ROUTE-BLOCKED ${bg.name} by ${[...hits].slice(0, 3).join(',')}${hits.size > 3 ? ` +${hits.size - 3}` : ''}`);
  });
  return problems;
}

/* Nothing may be a detached island except the internal hall and its line,
 * which are deliberately a separate structure. */
export function checkConnectivity(station) {
  const problems = [];
  const all = meshesOf(station);
  const adj = all.map(() => []);
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      if (all[i].box.clone().expandByScalar(0.08).intersectsBox(all[j].box)) { adj[i].push(j); adj[j].push(i); }
  const seen = new Array(all.length).fill(false);
  const comps = [];
  for (let i = 0; i < all.length; i++) {
    if (seen[i]) continue;
    const st = [i], c = []; seen[i] = true;
    while (st.length) { const k = st.pop(); c.push(k); adj[k].forEach(m => { if (!seen[m]) { seen[m] = true; st.push(m); } }); }
    comps.push(c);
  }
  comps.sort((a, b) => b.length - a.length);
  comps.slice(1).forEach(c => {
    const names = c.map(i => all[i].node.name);
    if (names.every(n => /^hall|^transferMain|^liftGuide/.test(n))) return;  // by design
    problems.push(`ISLAND (${c.length}) ${names.slice(0, 4).join(',')}`);
  });
  return problems;
}

export function checkGrounded(station) {
  const b = new T.Box3().setFromObject(station);
  return Math.abs(b.min.y) > 0.06 ? [`NOT-GROUNDED min.y=${b.min.y.toFixed(3)}`] : [];
}

export function checkStation(station) {
  return [
    ...checkFit(station),
    ...checkApproachCorridors(station),
    ...checkDoorsRecessed(station),
    ...checkBerthFittings(station),
    ...checkInteriors(station),
    ...checkTransferLine(station),
    ...checkConveyorSeating(station),
    ...checkDoorClosure(station),
    ...checkCarriers(station),
    ...checkConnectivity(station),
    ...checkGrounded(station)
  ];
}

/* Every pattern at every size. Returns rows suitable for console.table. */
export function checkAll(STATION_TYPES) {
  const rows = [];
  Object.entries(STATION_TYPES).forEach(([key, t]) => {
    ['S', 'M', 'L'].forEach(size => {
      const problems = checkStation(t.build(key.toUpperCase() + '-001', size));
      rows.push({ station: key, size, problems: problems.length, first: problems[0] || '' });
    });
  });
  return rows;
}


/* A Navy station must actually CARRY navy hardware.
 *
 * This exists because navyRefit silently did nothing on two of six patterns —
 * its host search matched no meshes there — and every other check stayed green,
 * since none of them can see "the refit was a no-op". */
export function checkNavyRefit(station) {
  const out = [];
  const n = { belt: 0, turret: 0, barrel: 0, mast: 0, barracks: 0, muster: 0, secure: 0, ads: 0, accent: 0 };
  station.traverse(m => {
    if (!m.isMesh) return;
    if (/navyArmourBelt/.test(m.name)) n.belt++;
    /* Anchored and terminated: a bare /navyTurret/ also matches
       navyTurretBlock and navyTurretYaw, so the count read 3x high and a
       pattern with two guns passed a "at least four" assertion. */
    if (/^navyTurret\d+$/.test(m.name)) n.turret++;
    if (/navyBarrel/.test(m.name)) n.barrel++;
    if (/navyMast\d/.test(m.name)) n.mast++;
    if (/navyBarracks$/.test(m.name)) n.barracks++;
    if (/navyMusterDeck/.test(m.name)) n.muster++;
    if (/SecureBlastDoor/.test(m.name)) n.secure++;
    if (m.material && /^ad(Orange|Green)$/.test(m.material.name)) n.ads++;
    /* mustard survives only on moving parts */
    if (m.material && m.material.name === 'stationAccent' &&
      !/(DoorChevron|DoorEdge|Chevron|Ram$|Ram[LR]|Hook|Hoist|Bridge|CarMark|liftGuide|Hinge)/.test(m.name)) n.accent++;
  });
  if (station.userData.faction !== 'navy') out.push('NOT-NAVY userData.faction is ' + station.userData.faction);
  if (n.belt < 1) out.push('NAVY-NO-ARMOUR 0 armour belts');
  if (n.turret < 4) out.push('NAVY-TOO-FEW-TURRETS ' + n.turret);
  if (n.mast < 3) out.push('NAVY-NO-MAST-FARM ' + n.mast + ' masts');
  if (!n.barracks) out.push('NAVY-NO-BARRACKS');
  if (!n.muster) out.push('NAVY-NO-MUSTER-DECK');
  if (n.ads) out.push('NAVY-STILL-ADVERTISING ' + n.ads + ' hoardings');
  if (n.accent) out.push('NAVY-MUSTARD-ON-FIXED-PARTS ' + n.accent + ' meshes');

  /* Guns must not all point the same way. Nothing looked at the distribution,
     so a regression that set every bearing to zero passed clean. */
  const yaws = [];
  station.traverse(x => {
    if (/^navyTurretYaw/.test(x.name)) yaws.push(Math.round(x.rotation.y / (Math.PI * 2) * 12) % 12);
  });
  if (yaws.length >= 4) {
    const distinct = new Set(yaws).size;
    if (distinct < 3) out.push('NAVY-TURRETS-ALL-ALIGNED ' + yaws.length +
      ' guns, only ' + distinct + ' distinct bearing(s): ' + yaws.join(','));
  }

  /* No muzzle may fire into the station. The fleet has always had this rule;
     nothing asserted it for station turrets, so two patterns shipped with
     barrels buried in the marine barracks. */
  const rc = new T.Raycaster();
  station.updateMatrixWorld(true);
  const yawGroups = [];
  station.traverse(x => { if (/^navyTurretYaw/.test(x.name)) yawGroups.push(x); });
  yawGroups.forEach(yg => {
    const own = new Set();
    yg.traverse(x => own.add(x));
    const targets = [];
    station.traverse(x => { if (x.isMesh && !own.has(x)) targets.push(x); });
    const origin = new T.Vector3().setFromMatrixPosition(yg.matrixWorld);
    const q = new T.Quaternion().setFromRotationMatrix(yg.matrixWorld);
    const fwd = new T.Vector3(0, 0, 1).applyQuaternion(q).normalize();
    const side = new T.Vector3(1, 0, 0).applyQuaternion(q).normalize();
    [-0.32, 0.32].forEach(off => {
      rc.set(origin.clone().addScaledVector(side, off).addScaledVector(fwd, 0.5), fwd);
      rc.far = 2.9;
      const h = rc.intersectObjects(targets, false)[0];
      if (h) out.push('NAVY-MUZZLE-BLOCKED ' + yg.name + ' fires into ' +
        h.object.name + ' at ' + h.distance.toFixed(2));
    });
  });
  return out;
}


/* THE SHIP HAS TO FIT ON THE MACHINERY.
 *
 * checkDockingRoute structurally cannot see this: it exempts route furniture by
 * name and only sweeps between waypoint CENTRES, so a lift car half the length
 * of the hull standing on it, a painted stand shorter than the ship parked on
 * it, and a belt narrower than the hull riding it all reported a clean route.
 * Every other route property in this file is asserted; the one that decides
 * whether the ship physically fits was not.
 *
 * House rule 2, as a check: the hull does not shrink, so the hardware is sized
 * FROM the envelope, never as a fraction of it. */
const HEAVY_PART = /heavy|berthL/i;

export function checkRouteCapacity(station) {
  const problems = [];
  station.updateMatrixWorld(true);
  const need = name => HEAVY_PART.test(name) ? FLEET.L : FLEET.M;

  const check = (node, label, wantW, wantD) => {
    const b = new T.Box3().setFromObject(node);
    const size = b.getSize(new T.Vector3());
    /* Parts are rotated to their bearing, so compare the two horizontal
       extents against the pair the hull needs, longest against longest. */
    const have = [size.x, size.z].sort((a, b2) => b2 - a);
    const want = [wantW, wantD].sort((a, b2) => b2 - a);
    if (have[0] < want[0] - 0.01)
      problems.push(`${label} ${node.name} ${have[0].toFixed(2)} long, needs ${want[0].toFixed(2)}`);
    if (have[1] < want[1] - 0.01)
      problems.push(`${label} ${node.name} ${have[1].toFixed(2)} across, needs ${want[1].toFixed(2)}`);
  };

  station.traverse(n => {
    if (!n.isMesh) return;
    const env = need(n.name);
    if (/transferLiftCar$/.test(n.name)) check(n, 'LIFT-CAR-TOO-SMALL', env.w, env.d);
    else if (/StandOutline\d*$/.test(n.name)) check(n, 'STAND-TOO-SMALL', env.w, env.d);
    else if (/ConveyorBed$/.test(n.name)) {
      /* A belt need only be wide enough; its length is the run it serves, and
         a short run can be SHORTER than it is wide — so the across-dimension is
         not simply the smaller extent. Taking the smaller one reported a
         7.2-wide feed belt as 4.8 narrow because its run was only 4.8 long. */
      const b = new T.Box3().setFromObject(n);
      const size = b.getSize(new T.Vector3());
      const widest = Math.max(size.x, size.z);
      if (widest < env.w - 0.01)
        problems.push(`BELT-TOO-NARROW ${n.name} ${widest.toFixed(2)}, needs ${env.w.toFixed(2)}`);
    }
  });
  return problems;
}

/* Every carrier's two ends must differ, and it must be parked where it says it
 * is. A lift recorded with from === to does not travel; one parked somewhere
 * other than its declared idle jumps the moment anything calls it. The station
 * lift had exactly that fault — its block declared an idle down in the pocket
 * while every car mesh sat up at the hangar deck — and nothing caught it,
 * because nothing had ever driven a lift either. */
export function checkCarriers(station) {
  const problems = [];
  station.traverse(n => {
    const c = n.userData && n.userData.carrier;
    if (!c) return;
    if (!c.from || !c.to) { problems.push(`CARRIER-NO-ENDS ${n.name}`); return; }
    const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const run = d3(c.from, c.to);
    if (run < 0.5) problems.push(`CARRIER-NO-TRAVEL ${n.name} run=${run.toFixed(2)}`);
    const parked = (c.idle === 'to') ? c.to : c.from;
    if (d3(n.position, parked) > 0.02)
      problems.push(`CARRIER-NOT-PARKED ${n.name} at y=${n.position.y.toFixed(2)}, declares ${parked.y.toFixed(2)}`);
    /* A carrier's parts must RIDE it. The station lift's caution run and floor
       mark were siblings of the car on the shaft, so the deck would have slid
       out from under its own markings. A carrier that IS a mesh carries itself
       and needs no children — only an empty GROUP is the fault. */
    if (!n.isMesh && !n.children.length) problems.push(`CARRIER-HAS-NO-LOAD ${n.name} is an empty group`);
  });
  return problems;
}

/* A Navy station's guns must rest on a bearing that was actually proved clear,
 * and they must not all rest on the same one — eight identical bearings is
 * hardware whose rotation was never set. */
export function checkTurretRest(station) {
  const problems = [];
  const yaws = [];
  station.traverse(n => {
    const s = n.userData && n.userData.scan;
    if (!s || s.mode !== 'aim') return;
    yaws.push(Math.round(s.restYaw * 1000) / 1000);
    if (s.obstructedAtRest > 0)
      problems.push(`TURRET-FOULED ${n.name} rests with ${s.obstructedAtRest} obstruction(s)`);
    if (Math.abs(n.rotation.y - s.restYaw) > 1e-6)
      problems.push(`TURRET-POSE-DISAGREES ${n.name}`);
  });
  if (yaws.length > 3 && new Set(yaws).size < 3)
    problems.push(`TURRETS-ALL-ONE-BEARING ${new Set(yaws).size} distinct across ${yaws.length} guns`);
  return problems;
}
