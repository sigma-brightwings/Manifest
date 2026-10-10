import * as THREE from 'three';
import { PARTS, MATS } from './station.js';
import { createBlastDoor } from './blastdoor.js';

/* Planetside sites — underground ports.
 *
 * Any world outside its star's habitable zone, and any non-earthlike world
 * inside it, cannot carry a pressurised surface port: the radiation and the
 * conditions come from above. So the port is dug in. What sits on the surface
 * is only what has to: the strip or the pad, the doors, the tower cluster,
 * radiators and dust berms. Everything a hull is handed to is under rock.
 *
 * Three variants:
 *   runway   — a skid strip, long enough for a hull to stop on its own, running
 *              into a portal in a rock berm and down a ramp to the galleries.
 *   mountain — doors in a mountain's rock face; level approach, no descent.
 *   pad      — a square pad that is the head of a 45 degree elevator, feeding a
 *              conveyor and four internally held S/M bays; L craft instead come
 *              down through interdigitating surface doors into their own hangar.
 *
 * Interiors are built the way the stations' halls are: separate plates, so the
 * space is genuinely hollow. The rock is modelled on three sides and cut away
 * on the fourth, so the site reads in the viewer.
 *
 * Nothing animates itself. Every gate carries the same `userData.airlock`
 * contract the station berths use, so one game layer drives all of it.
 */

const T = THREE;
const { box, cyl, seedFrom, cautionRun, billboard, berth, internalHall,
        transferLine, berthInterior, exteriorGreebles, finish, BERTH,
        mergedMesh, cargoMat, toothedDoor } = PARTS;

// Rock and regolith. Everything else comes from the station palette, so a
// recolour there carries to the sites.
const matRock = new T.MeshStandardMaterial({ color: 0x6d655b, roughness: 0.95, metalness: 0.04, name: 'siteRock' });
const matRockDeep = new T.MeshStandardMaterial({ color: 0x4a453e, roughness: 0.95, metalness: 0.04, name: 'siteRockDeep' });
const matRockStrata = new T.MeshStandardMaterial({ color: 0x817668, roughness: 0.92, metalness: 0.05, name: 'siteRockStrata' });
const matRegolith = new T.MeshStandardMaterial({ color: 0x8e8474, roughness: 0.98, name: 'siteRegolith' });
/* Same values as the ship dish materials — the scan dish IS the navy L comm
   dish, so it has to be the same surface, not a near miss. */
const matDishSurface = new T.MeshStandardMaterial({ color: 0x4a5a6c, roughness: 0.7, metalness: 0.25, side: T.DoubleSide, name: 'dishSurface' });
const matDishLiner = new T.MeshStandardMaterial({ color: 0x2f3a46, roughness: 0.55, metalness: 0.3, side: T.DoubleSide, name: 'dishLiner' });

const bay = BERTH.sm, big = BERTH.lg;
const DECK = 1.0;          // deck slab thickness
const PLATE = 0.4;         // interior wall / roof plate thickness

/* ---------------------------------------------------------------- helpers */

/* Yellow/black striping on all four sides of a moving platform. Every moving
   part on a site carries it: pads, lift cars, conveyor, crane, doors. A single
   run on one edge reads as decoration — a frame reads as a hazard. */
function cautionFrame(parent, deckTop, cx, cz, w, d, tag) {
  /* deckTop is the top face of the deck being painted. Chips are positioned by
     their CENTRE, so seating them means dropping half a thickness minus a
     bite — derived here, never passed in as a second literal, which is how
     both pad frames ended up floating 0.095 above the apron. */
  const t = 0.13;
  const y = deckTop - t / 2 + 0.03;
  [-1, 1].forEach((sd, i) => {
    const gA = new T.Group(); gA.position.set(cx, y, cz + sd * (d / 2 + 0.35));
    cautionRun(gA, w + 0.7, t, 'x', tag + (i ? 'F' : 'A')); parent.add(gA);
    const gB = new T.Group(); gB.position.set(cx + sd * (w / 2 + 0.35), y, cz);
    cautionRun(gB, d + 0.7, t, 'z', tag + (i ? 'R' : 'L')); parent.add(gB);
  });
}

/* The navy L comm dish, re-used as a ground scanning dish: the same bowl
   (8x3 partial sphere), liner, 8-facet backshell, hub, four ribs and feed, on
   a yoke and turntable instead of a stowing boom. It sweeps back and forth
   across the sky like an electric fan rather than spinning — the game layer
   drives it off userData.scan; nothing here self-animates. */
function scanDish(dishR, tag, tilt = 0.42) {
  const grp = new T.Group(); grp.name = tag;
  const M = MATS;
  const base = cyl(dishR * 0.62, dishR * 0.7, dishR * 0.3, M.hull, tag + 'Base', 8);
  base.position.y = dishR * 0.15; grp.add(base);
  const turn = new T.Group(); turn.name = tag + 'Turntable';
  turn.position.y = dishR * 0.3; grp.add(turn);
  const ring = cyl(dishR * 0.5, dishR * 0.5, dishR * 0.12, M.fitting, tag + 'TurntableRing', 8);
  turn.add(ring);
  for (let i = 0; i < 4; i++) {
    const stripe = box(dishR * 0.3, 0.05, dishR * 0.12, i % 2 ? M.hazardY : M.hazardK, tag + 'TurntableCaution' + i);
    const a = (i / 4) * Math.PI * 2;
    stripe.position.set(Math.sin(a) * dishR * 0.5, dishR * 0.07, Math.cos(a) * dishR * 0.5);
    stripe.rotation.y = a; turn.add(stripe);
  }
  const yoke = new T.Group(); yoke.name = tag + 'Yoke';
  yoke.position.y = dishR * 0.1; turn.add(yoke);
  [-1, 1].forEach(sd => {
    const arm = box(dishR * 0.16, dishR * 1.0, dishR * 0.16, M.fitting, tag + 'YokeArm' + (sd < 0 ? 'L' : 'R'));
    arm.position.set(sd * dishR * 0.62, dishR * 0.5, 0); yoke.add(arm);
  });
  const cross = box(dishR * 1.4, dishR * 0.16, dishR * 0.16, M.fitting, tag + 'YokeCross');
  cross.position.y = dishR * 0.18; yoke.add(cross);
  const head = new T.Group(); head.name = tag + 'Head';
  head.position.y = dishR * 0.95; head.rotation.x = -tilt; yoke.add(head);
  const mkBowl = (r, mat, name) => {
    const m = new T.Mesh(new T.SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.45), mat);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    m.rotation.x = -Math.PI / 2;
    return m;
  };
  head.add(mkBowl(dishR, matDishSurface, tag + 'Bowl'));
  head.add(mkBowl(dishR * 0.93, matDishLiner, tag + 'BowlLiner'));
  const back = new T.Mesh(new T.ConeGeometry(dishR * 0.98, dishR * 0.7, 8), M.panel);
  back.name = tag + 'Backshell'; back.castShadow = back.receiveShadow = true;
  back.rotation.x = Math.PI / 2; back.position.z = -dishR * 0.34; head.add(back);
  const hub = cyl(dishR * 0.2, dishR * 0.2, dishR * 0.1, M.panel, tag + 'Hub', 10);
  hub.rotation.x = Math.PI / 2; hub.position.z = dishR * 0.1; head.add(hub);
  for (let r = 0; r < 4; r++) {
    const rib = box(dishR * 1.5, dishR * 0.05, dishR * 0.06, M.panel, tag + 'Rib' + r);
    rib.rotation.z = (r * Math.PI) / 4; rib.position.z = dishR * 0.12; head.add(rib);
  }
  const feed = cyl(dishR * 0.05, dishR * 0.05, dishR * 1.1, M.fitting, tag + 'Feed', 6);
  feed.rotation.x = Math.PI / 2;                 // along the boresight, not up Y
  feed.position.z = dishR * 0.5; head.add(feed);
  const feedCan = box(dishR * 0.18, dishR * 0.18, dishR * 0.2, M.fitting, tag + 'FeedHorn');
  feedCan.position.z = dishR * 0.98; head.add(feedCan);
  grp.userData.scan = {
    /* Oscillating, not rotating: yaw sweeps to its limits and reverses, the way
       a desk fan does. Period is in seconds; the head's tilt is fixed. */
    mode: 'oscillate',
    yawNode: tag + 'Turntable',
    yawRangeDeg: [-72, 72],
    periodSec: 11,
    easing: 'sine',
    activeWhen: 'siteOnline'
  };
  return grp;
}

/* A flat plate with rectangular holes cut in it, emitted as boxes around the
   holes rather than as a grid of tiles — a tiled surface costs hundreds of
   draw calls and this target is an integrated GPU. Holes must not overlap in
   x. Plate is centred on the origin in XZ, top face at y = 0. */
function plateWithHoles(w, d, t, holes, mat, name) {
  const grp = new T.Group(); grp.name = name;
  const hs = [...holes].sort((a, b) => (a.x - a.w / 2) - (b.x - b.w / 2));
  let cursor = -w / 2;
  const strip = (x0, x1, z0, z1, i) => {
    const sw = x1 - x0, sd = z1 - z0;
    if (sw < 0.02 || sd < 0.02) return;
    const m = box(sw, t, sd, mat, name + i);
    m.position.set((x0 + x1) / 2, -t / 2, (z0 + z1) / 2);
    grp.add(m);
  };
  let n = 0;
  hs.forEach(h => {
    const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2;
    strip(cursor, x0, -d / 2, d / 2, n++);
    strip(x0, x1, -d / 2, h.z - h.d / 2, n++);
    strip(x0, x1, h.z + h.d / 2, d / 2, n++);
    cursor = x1;
  });
  strip(cursor, w / 2, -d / 2, d / 2, n++);
  return grp;
}

/* An upright portal cut into structure or rock: framed aperture, interdigitating
   leaves stowed either side, threshold lighting, nav lights (green to
   starboard, red to port with the nose at +Z), and an inner gate. The aperture
   normal is the group's local +Z, exactly as the station berths. */
function portalGate(w, h, tag, opts = {}) {
  const grp = new T.Group(); grp.name = tag;
  const M = MATS;
  const jambT = 0.5;
  [-1, 1].forEach(sd => {
    const jamb = box(jambT, h + 0.8, 1.1, M.hull, tag + 'Jamb' + (sd < 0 ? 'L' : 'R'));
    jamb.position.set(sd * (w / 2 + jambT / 2), 0, -0.3); grp.add(jamb);
  });
  const lintel = box(w + jambT * 2, 0.6, 1.1, M.hull, tag + 'Lintel');
  lintel.position.set(0, h / 2 + 0.3, -0.3); grp.add(lintel);
  const sill = box(w + jambT * 2, 0.5, 1.1, M.hull, tag + 'Sill');
  sill.position.set(0, -h / 2 - 0.25, -0.3); grp.add(sill);
  const stripe = new T.Group(); stripe.position.set(0, -h / 2 - 0.02, 0.2);
  cautionRun(stripe, w + 0.6, 0.11, 'x', tag + 'Caution'); grp.add(stripe);
  const mech = toothedDoor(grp, w, h, tag, { axis: 'y', mats: M, kind: 'outer' });
  // approach lighting and orientation cue
  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'L' : 'R';
    const hood = box(0.44, 0.44, 0.24, M.fitting, tag + 'NavHood' + side);
    hood.position.set(sd * (w / 2 + 0.62), h / 2 - 0.4, 0.16); grp.add(hood);
    const nav = box(0.3, 0.3, 0.24, sd > 0 ? M.navGreen : M.navRed, tag + 'NavLight' + side);
    nav.position.set(sd * (w / 2 + 0.62), h / 2 - 0.4, 0.3); grp.add(nav);
    const lamp = box(0.18, 0.18, 0.14, M.lit, tag + 'ApproachLamp' + side);
    lamp.position.set(sd * (w / 2 + 0.62), -h / 2 + 0.4, 0.28); grp.add(lamp);
    const cyc = box(0.16, 0.16, 0.12, sd < 0 ? M.beacon : M.lit, tag + 'CycleLamp' + side);
    cyc.position.set(sd * (w / 2 + jambT / 2), h / 2 - 0.9, 0.2); grp.add(cyc);
  });
  for (let i = 0; i < 5; i++) {
    const mk = box(w * 0.06, 0.07, 0.2, i % 2 ? M.lit : M.accent, tag + 'ThresholdMarker' + i);
    mk.position.set(-w * 0.4 + i * (w * 0.8 / 4), -h / 2 - 0.04, 0.3); grp.add(mk);
  }
  if (opts.innerGate !== false) {
    const depth = opts.depth || 3.0;
    const gate = box(w * 0.98, h * 0.98, 0.26, M.panel, tag + 'InnerGate');
    gate.position.set(0, 0, -depth); grp.add(gate);
    const seal = box(w + 0.4, h + 0.4, 0.18, M.deep, tag + 'InnerSeal');
    seal.position.set(0, 0, -depth + 0.12); grp.add(seal);
  }
  grp.userData.clearOpening = { w, h };
  /* One block per gate, in the words PORT-MODELS.md settled on, so a later
     interior-contract pass can harvest these instead of re-deriving them from
     node names. `plane` matters: 'xy' is a wall, 'xz' is a lid, and a sampler
     that assumes vertical reads a lid's depth as a height and reports a door
     covering nothing as sealed. */
  grp.userData.gateSpec = {
    id: tag, kind: 'outer', plane: 'xy', aperture: { w, h },
    leaves: mech.leaves.map(l => l.name),
    poses: mech.leaves.map(l => l.userData.gate),
    requires: opts.opensOn || 'dockingClearance'
  };
  grp.userData.airlock = {
    outerGate: 'toothedDoor',
    innerGate: tag + 'InnerGate',
    controlsLockedUntil: 'outerGateOpen',
    outerCyclesOnlyWhenOccupied: true,
    /* Planetside addition to the station contract: the outer leaves stay shut
       until the site grants clearance, inbound and outbound both. */
    outerOpensOn: opts.opensOn || 'dockingClearance'
  };
  return grp;
}

/* Doors lying in the surface plate, for a hull that comes straight down.
   Same interdigitating leaves, stowed in houses under the plate. */
function surfaceGate(w, d, tag, opts = {}) {
  const grp = new T.Group(); grp.name = tag;
  const M = MATS;
  [-1, 1].forEach(sd => {
    const kerb = box(0.6, 0.7, d + 1.2, M.hull, tag + 'Kerb' + (sd < 0 ? 'L' : 'R'));
    kerb.position.set(sd * (w / 2 + 0.3), -0.35, 0); grp.add(kerb);
  });
  [-1, 1].forEach(sd => {
    const kerb = box(w + 1.2, 0.7, 0.6, M.hull, tag + 'Kerb' + (sd < 0 ? 'A' : 'F'));
    kerb.position.set(0, -0.35, sd * (d / 2 + 0.3)); grp.add(kerb);
  });
  const mech = toothedDoor(grp, w, d, tag, { axis: 'z', mats: M, kind: 'outer' });
  const stripe = new T.Group(); stripe.position.set(0, 0.06, -d / 2 - 0.32);
  cautionRun(stripe, w + 1.0, 0.12, 'x', tag + 'Caution'); grp.add(stripe);
  const stripe2 = new T.Group(); stripe2.position.set(0, 0.06, d / 2 + 0.32);
  cautionRun(stripe2, w + 1.0, 0.12, 'x', tag + 'CautionF'); grp.add(stripe2);
  // nav lights at the aperture: green to starboard (-X) for a hull nosed at +Z
  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'L' : 'R';
    const hood = box(0.42, 0.3, 0.42, M.fitting, tag + 'NavHood' + side);
    hood.position.set(sd * (w / 2 + 0.9), 0.12, -d * 0.3); grp.add(hood);
    const nav = box(0.28, 0.26, 0.28, sd < 0 ? M.navGreen : M.navRed, tag + 'NavLight' + side);
    nav.position.set(sd * (w / 2 + 0.9), 0.3, -d * 0.3); grp.add(nav);
    for (let i = 0; i < 3; i++) {
      const lamp = box(0.18, 0.14, 0.18, M.lit, tag + 'ApproachLamp' + side + i);
      lamp.position.set(sd * (w / 2 + 0.9), 0.1, d * (-0.05 + i * 0.22)); grp.add(lamp);
    }
  });
  grp.userData.clearOpening = { w, d };
  // 'xz' — this one is a LID, and the second dimension is a depth, not a height
  grp.userData.gateSpec = {
    id: tag, kind: 'outer', plane: 'xz', aperture: { w, d },
    leaves: mech.leaves.map(l => l.name),
    poses: mech.leaves.map(l => l.userData.gate),
    requires: opts.opensOn || 'dockingClearance'
  };
  grp.userData.airlock = {
    outerGate: 'toothedDoor',
    innerGate: opts.innerGate || null,
    controlsLockedUntil: 'outerGateOpen',
    outerCyclesOnlyWhenOccupied: true,
    outerOpensOn: opts.opensOn || 'dockingClearance'
  };
  return grp;
}

/* A wall with a rectangular hole cut in it, emitted as four boxes around the
   hole. An entrance has to be a HOLE in the mass, not a frame stuck on a solid
   slab: a solid face behind a portal blocks the corridor the portal exists to
   serve. Wall lies in the XY plane, centred on the origin, thickness in Z. */
function wallWithHole(w, h, t, hole, mat, name) {
  const grp = new T.Group(); grp.name = name;
  const x0 = hole.x - hole.w / 2, x1 = hole.x + hole.w / 2;
  const y0 = hole.y - hole.h / 2, y1 = hole.y + hole.h / 2;
  const put = (bw, bh, cx, cy, i) => {
    if (bw < 0.02 || bh < 0.02) return;
    const m = box(bw, bh, t, mat, name + i);
    m.position.set(cx, cy, 0); grp.add(m);
  };
  put(x0 + w / 2, h, (-w / 2 + x0) / 2, 0, 0);                      // left of the hole
  put(w / 2 - x1, h, (x1 + w / 2) / 2, 0, 1);                       // right of it
  put(hole.w, h / 2 - y1, hole.x, (y1 + h / 2) / 2, 2);             // above
  put(hole.w, y0 + h / 2, hole.x, (-h / 2 + y0) / 2, 3);            // below
  return grp;
}

/* Rock. Walls on the closed sides, a floor under the excavation and a roof
   over it; the open sides are cut away so the workings read in the viewer,
   with strata bands along the cut lip. `open` is a side name or a list of
   them ('+x', '-x', '+z', '-z'). Side walls span exactly the region's depth
   so two abutting shells never reach into each other's excavation — an
   over-long wall is what put rock across a berth's approach. */
/* Everything that ENCLOSES an interior is tagged, so a viewer can hide it on
   demand. The model stays sealed — seeing inside is the camera's job, not a
   missing wall's. Tagged on the group and every mesh under it, since viewers
   and exporters walk the tree differently. */
function markEnclosure(obj, kind) {
  obj.userData.enclosure = kind || true;
  obj.traverse(n => { if (n.isMesh) n.userData.enclosure = kind || true; });
  return obj;
}

function rockShell(o) {
  const grp = new T.Group(); grp.name = 'rock';
  const { x0, x1, z0, z1, base, top, thick = 4.0, roof = true, roofHoles = [] } = o;
  const open = [].concat(o.open || '+x');
  const isOpen = s => open.indexOf(s) >= 0;
  const add = (w, h, d, x, y, z, mat, name) => {
    const m = box(w, h, d, mat, name); m.position.set(x, y, z); grp.add(m); return m;
  };
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  add(w + thick * 2, base, d + thick * 2, cx, -base / 2, cz, matRockDeep, 'rockFloor');
  if (!isOpen('-x')) add(thick, top + base, d, x0 - thick / 2, (top - base) / 2, cz, matRock, 'rockWallW');
  if (!isOpen('+x')) add(thick, top + base, d, x1 + thick / 2, (top - base) / 2, cz, matRock, 'rockWallE');
  if (!isOpen('-z')) add(w + thick * 2, top + base, thick, cx, (top - base) / 2, z0 - thick / 2, matRock, 'rockWallS');
  if (!isOpen('+z')) add(w + thick * 2, top + base, thick, cx, (top - base) / 2, z1 + thick / 2, matRock, 'rockWallN');
  if (roof) {
    const plate = plateWithHoles(w + thick * 2, d + thick * 2, thick, roofHoles, matRock, 'rockRoof');
    plate.position.set(cx, top + thick, cz);
    grp.add(plate);
  }
  markEnclosure(grp, 'rock');
  // strata along the cut lip, so the section reads as rock rather than a slab
  const lipX = isOpen('+x') ? x1 + thick / 2 : x0 - thick / 2;
  if (isOpen('+x') || isOpen('-x')) {
    for (let i = 0; i < 3; i++) {
      add(thick * 0.3, top * 0.12, d, lipX, top * (0.18 + i * 0.3), cz, matRockStrata, 'rockStrata' + i);
    }
  }
  return grp;
}

/* A billboard's strut has to land on something. Standing free on a surface
   plate it reads — and measures — as a detached island, so every sign gets a
   plinth from its foot down to the deck it stands on. */
function plinth(parent, x, z, fromY, toY, tag) {
  /* Sunk 0.4 into whatever it stands on. A plinth whose underside is exactly
     level with the deck's top face is tangent, not attached — it measures as
     a detached island and would read as a sign resting on the ground. */
  const embed = 0.4;
  const h = Math.max(0.4, fromY - toY) + embed;
  const p = box(1.8, h, 1.8, MATS.panel, tag + 'BillboardPlinth');
  p.position.set(x, toY - embed + h / 2, z); parent.add(p);
  const cap = box(2.4, 0.3, 2.4, MATS.fitting, tag + 'BillboardPlinthCap');
  cap.position.set(x, toY + h + 0.05, z); parent.add(cap);
  return p;
}

/* Rock cover over a site's surface works, leaving only what has to be open to
   the sky open: the pads, and a clear apron round the tower. The plate itself
   stays — it is the structure — but it is no longer a bare slab you can see a
   docking bay through. Merged into two meshes: this is 40-odd blocks and the
   target GPU counts draw calls, not triangles. */
function terrainCover(parent, o) {
  const { x0, x1, z0, z1, baseY, rand, keepOut } = o;
  /* Blocks OVERLAP their cell. Sized to fit inside it they read as a field of
     scattered crates on a visible slab; overlapping, with a low skirt course
     under a taller broken course, they read as one rock mass with the port cut
     into it. */
  const cell = 9.0;
  const nx = Math.max(1, Math.floor((x1 - x0) / cell));
  const nz = Math.max(1, Math.floor((z1 - z0) / cell));
  const light = [], dark = [];
  const clear = (cx, cz, w, d) => !keepOut.some(r =>
    Math.abs(cx - r.x) < (r.w + w) / 2 && Math.abs(cz - r.z) < (r.d + d) / 2);
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const cx = x0 + (x1 - x0) * ((i + 0.5) / nx) + (rand() - 0.5) * 2.4;
      const cz = z0 + (z1 - z0) * ((k + 0.5) / nz) + (rand() - 0.5) * 2.4;
      // skirt course: wide, low, overlapping its neighbours into a continuous mass
      const sw = cell * (1.25 + rand() * 0.4), sd = cell * (1.25 + rand() * 0.4);
      const sh = 1.2 + rand() * 1.1;
      if (!clear(cx, cz, sw, sd)) continue;
      ((i + k) % 2 ? light : dark).push({ w: sw, h: sh, d: sd, x: cx, y: baseY + sh / 2 - 0.3, z: cz });
      // broken course on top, offset so the silhouette is not a grid of lids
      if (rand() > 0.32) {
        const bw = cell * (0.55 + rand() * 0.5), bd = cell * (0.55 + rand() * 0.5);
        const bh = 1.8 + rand() * 5.2;
        const bx = cx + (rand() - 0.5) * cell * 0.45, bz = cz + (rand() - 0.5) * cell * 0.45;
        if (clear(bx, bz, bw, bd)) {
          ((i + k) % 2 ? dark : light).push({ w: bw, h: bh, d: bd,
            x: bx, y: baseY + sh - 0.3 + bh / 2 - 0.4, z: bz });
        }
      }
    }
  }
  if (light.length) parent.add(markEnclosure(mergedMesh(light, matRock, 'terrainCoverA'), 'terrain'));
  if (dark.length) parent.add(markEnclosure(mergedMesh(dark, matRockDeep, 'terrainCoverB'), 'terrain'));
}

/* Regolith heaped against a structure, and dust berms — surface plant for a
   world whose conditions are the reason the port is underground. */
function berms(parent, o, rand, tag) {
  for (let i = 0; i < o.count; i++) {
    const w = o.w * (0.5 + rand() * 0.9), h = o.h * (0.4 + rand() * 0.8);
    const b = box(w, h, o.d * (0.5 + rand()), matRegolith, tag + 'Berm' + i);
    b.position.set(o.x + (rand() - 0.5) * o.spread, (o.baseY || 0) + h / 2, o.z + (rand() - 0.5) * o.spreadZ);
    b.rotation.y = rand() * 0.6 - 0.3;
    parent.add(b);
  }
}

/* Radiator banks: the heat a buried port cannot dump into rock goes up here.
   The frame is sized to the fin set it carries — fins wider than their own
   frame are detached hardware, however right they look from a distance. */
function radiatorBank(parent, x, z, rand, tag, fins = 5, baseY = 0) {
  const span = fins * 0.8;
  const frame = box(span + 0.6, 2.6, 6.4, MATS.fitting, tag + 'RadiatorFrame');
  frame.position.set(x, baseY + 1.3, z); parent.add(frame);
  for (let i = 0; i < fins; i++) {
    const fin = box(0.16, 3.6, 6.0, i % 2 ? MATS.panel : MATS.hull, tag + 'RadiatorFin' + i);
    fin.position.set(x + (i - (fins - 1) / 2) * 0.8, baseY + 2.6 + 1.7, z);
    fin.rotation.z = 0.12; parent.add(fin);
    const spar = box(0.2, 2.0, 0.2, MATS.fitting, tag + 'RadiatorSpar' + i);
    spar.position.set(x + (i - (fins - 1) / 2) * 0.8, baseY + 2.6 + 0.4, z + 2.6); parent.add(spar);
  }
  const stripe = new T.Group(); stripe.position.set(x, baseY + 2.62, z - 3.1);
  cautionRun(stripe, span * 0.9, 0.1, 'x', tag + 'RadiatorCaution'); parent.add(stripe);
}

/* Control tower cluster: glazed cab on a mast with an antenna farm, the
   designation billboard, and a vehicle apron with the drums, hoses and
   crawlers of a working site. Sits on the surface, clear of the flight path. */
function towerCluster(host, x, z, label, rand, tag = 'tower', baseY = 0, opts = {}) {
  const M = MATS;
  /* Everything goes into one group placed at the surface height, rather than
     the caller shifting the pieces afterwards: a post-hoc shift by name is how
     the sign ended up at twice the surface height with its plinth left behind. */
  const parent = new T.Group(); parent.name = tag + 'Cluster';
  parent.position.y = baseY; host.add(parent);
  const baseBlk = box(6.0, 2.4, 6.0, M.hull, tag + 'Base');
  baseBlk.position.set(x, 1.2, z); parent.add(baseBlk);
  const mast = box(2.2, 12.0, 2.2, M.panel, tag + 'Mast');
  mast.position.set(x, 8.4, z); parent.add(mast);
  for (let i = 0; i < 4; i++) {
    const brace = box(0.3, 5.0, 0.3, M.fitting, tag + 'MastBrace' + i);
    brace.position.set(x + (i % 2 ? 1.6 : -1.6), 4.6, z + (i < 2 ? 1.6 : -1.6));
    brace.rotation.x = (i < 2 ? -1 : 1) * 0.18; brace.rotation.z = (i % 2 ? -1 : 1) * 0.18;
    parent.add(brace);
  }
  // glazed cab, flat-faced and wider than the mast so it reads as a cab
  const cab = box(7.2, 3.0, 7.2, M.hull, tag + 'Cab');
  cab.position.set(x, 15.9, z); parent.add(cab);
  const cabFloor = box(8.0, 0.5, 8.0, M.panel, tag + 'CabFloor');
  cabFloor.position.set(x, 14.3, z); parent.add(cabFloor);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const gl = box(6.9, 1.8, 0.14, i % 2 ? M.glass : M.glass, tag + 'CabGlass' + i);
    gl.position.set(x + Math.sin(a) * 3.63, 16.1, z + Math.cos(a) * 3.63);
    gl.rotation.y = a; parent.add(gl);
  }
  const cabRoof = box(7.8, 0.4, 7.8, M.deep, tag + 'CabRoof');
  cabRoof.position.set(x, 17.6, z); parent.add(cabRoof);
  // antenna farm on the cab roof
  for (let i = 0; i < 5; i++) {
    const h = 1.6 + rand() * 3.0;
    const ant = cyl(0.06, 0.1, h, M.fitting, tag + 'Antenna' + i, 6);
    ant.position.set(x + (rand() - 0.5) * 6.0, 17.8 + h / 2, z + (rand() - 0.5) * 6.0);
    parent.add(ant);
  }
  /* Scanning dish on the cab roof: the navy L comm dish, oscillating across
     the sky for inbound traffic. It sits on its own plinth on the roof plate,
     not on a stub boom — a dish this size needs a bearing under it. */
  const dishPl = box(2.6, 0.5, 2.6, M.panel, tag + 'ScanDishPlinth');
  dishPl.position.set(x + 2.0, 18.0, z - 2.0); parent.add(dishPl);
  const sd2 = scanDish(1.7, tag + 'ScanDish');
  sd2.position.set(x + 2.0, 18.2, z - 2.0); parent.add(sd2);
  const beacon = box(0.4, 0.4, 0.4, M.beacon, tag + 'MastBeacon');
  beacon.position.set(x, 17.9, z); parent.add(beacon);
  // designation billboard, station-style, on the apron beside the tower
  /* Sign offset pulled in on a summit: there is no ground out at the normal
     offset, only cliff. */
  const bbOff = opts.compact ? 5.4 : 9.0;
  const bb = billboard('billboard', 9.0, 2.8, label);
  bb.position.set(x + bbOff, 6.4, z - 1.0); bb.rotation.y = -0.35;
  parent.add(bb);
  plinth(parent, bb.position.x, bb.position.z, 6.4 - 2.8 / 2 + 0.1, 0, tag);
  if (opts.compact) {
    const brace = box(bbOff, 0.5, 1.4, M.hull, tag + 'BillboardBrace');
    brace.position.set(x + bbOff / 2, 0.25, bb.position.z); parent.add(brace);
  }

  /* A summit tower gets no vehicle apron: there is no road up, and the
     hardstanding, drums and crawlers belong at the working level. */
  if (opts.compact) return parent;

  // vehicle apron: hardstanding, drums, hose reels, service crawlers
  const apron = box(19.0, 0.3, 13.0, M.panel, tag + 'Apron');
  apron.position.set(x + 6.0, 0.15, z + 9.0); parent.add(apron);
  for (let i = 0; i < 4; i++) {
    const decal = box(3.2, 0.06, 0.5, i % 2 ? M.accent : M.deep, tag + 'ApronDecal' + i);
    decal.position.set(x + 1.0 + i * 3.2, 0.32, z + 6.0); parent.add(decal);
  }
  for (let i = 0; i < 7; i++) {
    const drum = cyl(0.35, 0.35, 1.0, i % 3 ? M.fitting : M.accent, tag + 'Drum' + i, 8);
    drum.position.set(x + 1.0 + rand() * 12.0, 0.8, z + 5.0 + rand() * 7.0); parent.add(drum);
  }
  for (let i = 0; i < 2; i++) {
    const reel = cyl(0.8, 0.8, 0.5, M.fitting, tag + 'HoseReel' + i, 8);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(x + 12.0, 1.1, z + 6.0 + i * 3.0); parent.add(reel);
    const stand = box(0.5, 1.0, 1.6, M.panel, tag + 'ReelStand' + i);
    stand.position.set(x + 12.0, 0.6, z + 6.0 + i * 3.0); parent.add(stand);
  }
  for (let i = 0; i < 2; i++) {
    const cx = x + 3.0 + i * 7.0, cz = z + 12.0;
    const hullBlk = box(3.4, 1.3, 5.6, i ? M.panel : M.hull, tag + 'Crawler' + i);
    hullBlk.position.set(cx, 1.25, cz); parent.add(hullBlk);
    const cabBlk = box(2.2, 1.1, 1.8, M.hull, tag + 'CrawlerCab' + i);
    cabBlk.position.set(cx, 2.45, cz - 1.6); parent.add(cabBlk);
    const cabGl = box(2.0, 0.6, 0.1, M.glass, tag + 'CrawlerGlass' + i);
    cabGl.position.set(cx, 2.6, cz - 2.52); parent.add(cabGl);
    [-1, 1].forEach(sd => {
      const track = box(0.8, 0.9, 5.4, M.fitting, tag + 'CrawlerTrack' + i + (sd < 0 ? 'L' : 'R'));
      track.position.set(cx + sd * 1.7, 0.45, cz); parent.add(track);
    });
    const lamp = box(0.7, 0.18, 0.18, MATS.accent, tag + 'CrawlerLamp' + i);
    lamp.position.set(cx, 3.05, cz - 1.6); parent.add(lamp);
  }
  berms(parent, { count: 5, w: 7.0, h: 1.6, d: 5.0, x: x - 12.0, z: z + 6.0, spread: 8.0, spreadZ: 16.0 }, rand, tag);
  radiatorBank(parent, x - 10.0, z - 9.0, rand, tag);
  radiatorBank(parent, x - 4.0, z - 12.0, rand, tag + 'B');
  return parent;
}

/* Lit and dark ports keyed off the site label, so a designation always looks
   the same, plus painted panels — flat on level skin only. */
function interiorDressing(parent, o, rand, tag) {
  const { w, h, d, y } = o;
  const cx = o.cx || 0, cz = o.cz || 0;
  /* Which wall the hoardings and ports hang on, and at what height. A gallery
     whose far wall is nothing but piers and berth apertures has no surface to
     hang a hoarding from — a panel there floats AND stands in an approach
     corridor — so those sites mount them along the open side's kerb instead,
     and a deck whose walls run in Z mounts them on those. */
  const axis = o.axis === 'z' ? 'z' : 'x';
  const side = o.adSide || 0;
  const adY = o.adY !== undefined ? o.adY : y + h * 0.5;
  const portY = o.portY !== undefined ? o.portY : y + h * 0.62;
  // wall offset and the run the fittings are distributed along
  const off = axis === 'x' ? w / 2 : d / 2;
  const runLen = axis === 'x' ? d : w;
  const place = (m, sd, offset, along) => {
    if (axis === 'x') m.position.set(cx + sd * offset, m.position.y, cz - runLen / 2 + along);
    else m.position.set(cx - runLen / 2 + along, m.position.y, cz + sd * offset);
    return m;
  };
  const panel = (name, mat, t, ph, pl) => {
    const m = axis === 'x' ? box(t, ph, pl, mat, name) : box(pl, ph, t, mat, name);
    return m;
  };
  for (let i = 0; i < o.lights; i++) {
    const strip = panel(tag + 'HallLight' + i, MATS.lit, 0.2, 0.2, runLen * 0.24);
    strip.position.y = y + h - 0.32;
    place(strip, i % 2 ? 1 : -1, off * 0.8, runLen * ((i + 0.5) / o.lights));
    parent.add(strip);
  }
  for (let i = 0; i < o.ads; i++) {
    const sd = side || (i % 2 ? 1 : -1);
    const ad = panel(tag + 'AdPanel' + i, i % 2 ? MATS.adA : MATS.adB, 0.14, 2.4, 4.0);
    ad.position.y = adY;
    place(ad, sd, off - 0.2, runLen * ((i + 0.5) / o.ads));
    parent.add(ad);
    const fr = panel(tag + 'AdFrame' + i, MATS.panel, 0.07, 2.7, 4.4);
    fr.position.y = adY;
    place(fr, sd, off - 0.1, runLen * ((i + 0.5) / o.ads));
    parent.add(fr);
  }
  /* Clutter sits ON the deck. Floated up the wall it is the same detached
     detail bug the ships' settle pass exists to catch. */
  for (let i = 0; i < o.greebles; i++) {
    const sd = side || (rand() > 0.5 ? 1 : -1), s = 0.3 + rand() * 0.8;
    const g = box(s, s * 0.8, s, rand() > 0.5 ? MATS.panel : MATS.fitting, tag + 'Greeble' + i);
    g.position.y = y + s * 0.42;
    if (o.greebleBand) {
      // between the facing bays, where no approach corridor reaches
      g.position.set(cx + (rand() - 0.5) * w * 0.8, g.position.y, cz + (rand() - 0.5) * o.greebleBand);
      parent.add(g);
    } else {
      place(g, sd, off - 0.6 - rand() * 1.4, runLen * rand());
      parent.add(g);
    }
  }
  /* Crates go on the near half of the deck when a side is given: stacked in
     the middle of a gallery they sit in a berth's approach corridor, which is
     the one thing that has to stay empty. */
  for (let i = 0; i < o.crates; i++) {
    const s = 0.7 + rand() * 0.5;
    const c = box(s, s * 0.9, s, cargoMat(rand), tag + 'Crate' + i);
    const bx = side ? cx + side * (w * 0.2 + rand() * w * 0.26) : cx + (rand() - 0.5) * w * 0.7;
    c.position.set(bx, y + s * 0.45, cz + (rand() - 0.5) * d * 0.85); parent.add(c);
  }
  for (let i = 0; i < o.decals; i++) {
    const dc = box(w * 0.12, 0.05, d * 0.04, i % 2 ? MATS.accent : MATS.deep, tag + 'FloorDecal' + i);
    dc.position.set(cx + (rand() - 0.5) * w * 0.6, y + 0.03, cz + (rand() - 0.5) * d * 0.85); parent.add(dc);
  }
  for (let i = 0; i < o.ports; i++) {
    const litOn = ((o.seed + i * 7) % 5) > 1;
    const p = panel(tag + 'Port' + i, litOn ? MATS.lit : MATS.dark, 0.06, 0.5, 0.8);
    p.position.y = portY;
    place(p, side || -1, off - 0.22, runLen * ((i + 0.5) / o.ports));
    parent.add(p);
  }
}

/* The excavated gallery shared by the runway and mountain sites: a hollow hall
   of plates with berths let into its far wall, the hall and transfer line
   behind them, and the near side left open to the cut. Berths open ACROSS the
   gallery, so a hull's approach corridor runs over open deck. */
/* Berth complement per size mark. This is what S/M/L means underground: not a
   scaled copy of the same gallery but a different one — more apertures, and on
   the heavy mark a second heavy berth. Aperture sizes never change; a hull
   doesn't shrink. */
const GALLERY = {
  S: ['sm', 'lg', 'sm'],
  M: ['sm', 'sm', 'lg', 'sm'],
  L: ['sm', 'sm', 'lg', 'sm', 'sm', 'lg']
};

function undergroundGallery(o) {
  const { gx, rand, label, tag = 'gal' } = o;
  const size = o.size || 'M';
  const plan = GALLERY[size] || GALLERY.M;
  const gh = big.h + (size === 'S' ? 3.0 : size === 'L' ? 4.4 : 3.4);
  /* Length derived from the berth run it has to carry, never taken as given:
     a run that overflows the gallery pushes the end piers back onto the outer
     apertures. */
  const gz = plan.reduce((a, k) => a + (k === 'lg' ? big.w : bay.w) + 4.0, 0) + 8.0;
  const grp = new T.Group(); grp.name = tag;
  const M = MATS;
  const seed = String(label).split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  const deck = box(gx, DECK, gz, M.panel, tag + 'Floor');
  deck.position.set(0, -DECK / 2, 0); grp.add(deck);
  const roof = box(gx, PLATE, gz, M.deep, tag + 'Roof');
  roof.position.set(0, gh - PLATE / 2, 0); grp.add(markEnclosure(roof, 'roof'));
  /* North end is solid. The SOUTH end is where the access shaft arrives, so it
     is a wall with a hole in it and a blast door in the hole — built solid it
     blocked the shaft at the bottom, which is a passage to nowhere. */
  const endN = box(gx, gh, PLATE, M.hull, tag + 'EndWallN');
  endN.position.set(0, gh / 2, gz / 2 - PLATE / 2); grp.add(endN);
  const entry = o.entry || { w: big.w + 1.6, h: big.h + 1.0 };
  const endS = wallWithHole(gx, gh, PLATE,
    { x: 0, y: entry.h / 2 + 0.2 - gh / 2, w: entry.w, h: entry.h }, M.hull, tag + 'EndWallS');
  endS.position.set(0, gh / 2, -(gz / 2 - PLATE / 2)); grp.add(endS);
  const shaftDoor = createBlastDoor(entry.w, entry.h, {
    tag: tag + 'ShaftDoor', mats: M, blast: true, opensOn: 'launchOrDockingClearance'
  });
  shaftDoor.position.set(0, entry.h / 2 + 0.2, -(gz / 2 - PLATE / 2) - 0.2);
  shaftDoor.rotation.y = Math.PI;            // aperture normal -Z, facing up the shaft
  grp.add(shaftDoor);
  // near wall (the cut side) is a low kerb only, so the section stays open
  const kerb = box(PLATE, 1.2, gz, M.hull, tag + 'Kerb');
  kerb.position.set(gx / 2 - PLATE / 2, 0.6, 0); grp.add(kerb);

  /* Berths let into the far wall: two shared S/M apertures and one heavy
     berth. Between them, structural piers carry the roof — the wall is piers
     and a header, not a slab with holes punched in it. */
  let nSM = 0, nL = 0;
  const specs = plan.map(k => k === 'lg'
    ? { kind: 'field', w: big.w, h: big.h, d: big.d, tag: 'berthL' + (nL++) }
    : { kind: 'door', w: bay.w, h: bay.h, d: bay.d, tag: 'berthSM' + (nSM++) });
  const total = specs.reduce((a, s) => a + s.w + 4.0, 0);
  let zc = -total / 2;
  const gates = [];
  specs.forEach(sp => {
    zc += 2.0 + sp.w / 2;
    const b = berth(sp.kind, sp.w, sp.h, sp.d, sp.tag);
    berthInterior(b, sp.w, sp.h, sp.d, rand, sp.tag);
    b.position.set(-gx / 2 + PLATE, sp.h / 2 + 0.1, zc);
    b.rotation.y = Math.PI / 2;                     // aperture normal = +X
    grp.add(b);
    gates.push({ x: -gx / 2 - sp.d, z: zc, h: sp.h, tag: sp.tag });
    // header above the aperture, carrying the wall over the opening
    const hdr = box(PLATE * 3, gh - sp.h - 0.6, sp.w + 1.6, M.hull, sp.tag + 'Header');
    hdr.position.set(-gx / 2 + PLATE * 1.5, sp.h + 0.7 + (gh - sp.h - 0.6) / 2 - 0.1, zc);
    grp.add(hdr);
    zc += sp.w / 2 + 2.0;
  });
  // piers between and beyond the apertures, on the MIDPOINTS of the gaps the
  // berth spacing leaves — a pier sharing an aperture's z blocks it
  const bounds = [];
  specs.forEach((sp, i) => {
    const gc = gates[i].z;
    if (i === 0) bounds.push(gc - sp.w / 2 - 2.0);
    bounds.push(gc + sp.w / 2 + 2.0);
  });
  bounds.forEach((pz, i) => {
    const clamped = Math.max(-gz / 2 + 1.6, Math.min(gz / 2 - 1.6, pz));
    const pier = box(PLATE * 4, gh, 2.8, M.hull, tag + 'Pier' + i);
    pier.position.set(-gx / 2 + PLATE * 2, gh / 2, clamped);
    grp.add(pier);
  });

  interiorDressing(grp, { w: gx, h: gh, d: gz, y: 0, adSide: 1, adY: 2.5, portY: 0.8,
    lights: 6, ads: 4, greebles: 14, crates: 7, decals: 6, ports: 5, seed }, rand, tag);
  // deck markings: a taxi centreline down the gallery, caution at the cut lip
  for (let i = 0; i < 10; i++) {
    const ln = box(2.6, 0.05, 0.5, M.accent, tag + 'TaxiLine' + i);
    ln.position.set(gx * 0.16, 0.03, -gz / 2 + gz * ((i + 0.5) / 10)); grp.add(ln);
  }
  const lip = new T.Group(); lip.position.set(gx / 2 - PLATE, 1.24, 0);
  cautionRun(lip, gz * 0.94, 0.12, 'z', tag + 'LipCaution'); grp.add(lip);

  /* Hall behind the berths, reached through their inner gates, with the
     transfer line running level along the deck between the two. Deliberately
     its own connected component, exactly as on the stations. */
  const hw = big.w * 2.4, hh = big.h + 3.0, hd = big.d * 1.5;
  const hall = internalHall(hw, hh, hd, 'hall', rand, 3);
  hall.rotation.y = Math.PI / 2;                     // mouth faces +X
  const hallX = -gx / 2 - big.d - 2.0 - hd / 2;
  hall.position.set(hallX, hh / 2, 0);
  grp.add(hall);
  const heavy = specs.findIndex(sp => sp.kind === 'field');
  const g0 = gates[heavy < 0 ? 0 : heavy];
  grp.add(transferLine(
    new T.Vector3(g0.x, 0.35, g0.z),
    new T.Vector3(hallX + hd / 2, 0.35, 0),
    big.w * 1.15, 'transferMain', rand));
  grp.userData.gates = gates;
  grp.userData.plan = plan.slice();
  grp.userData.hallBounds = { x: hallX, w: hd, d: hw, h: hh };
  return { grp, gates, hallX, hd, hw, hh, gh, gx, gz, plan };
}

/* --------------------------------------------------------- 1. RUNWAY SITE */
/* A skid strip: the fleet keeps its struts, so a hull comes in flat on its
 * pads and the strip is simply long enough to stop on — no arrestor gear,
 * only marking and lighting. At the far end a portal in a rock berm, and a
 * ramp down to the galleries. */
export function buildRunwaySite(label = 'UP-101', size = 'M') {
  const st = new T.Group();
  const rand = seedFrom(label + size);
  const M = MATS;
  const SY = 14.0;                                  // surface above gallery deck
  /* The strip's finished level, 0.10 above the surrounding ground plate. Laid
     flush the bed sat inside the ground slab and the two co-planar faces
     fought over every pixel. */
  const RY = SY + 0.10;
  const SL = size === 'S' ? 78 : size === 'L' ? 130 : 104;
  const SW = 17.0;
  const RL = size === 'S' ? 42.0 : size === 'L' ? 74.0 : 58.0;   // ramp run
  const gx = big.d + 8.0;

  const gal = undergroundGallery({ gx, rand, label, size, tag: 'gal' });
  const gz = gal.gz, gh = gal.gh;
  gal.grp.position.set(0, 0, RL + gz / 2);
  st.add(gal.grp);

  /* Ramp: a sloped deck from the portal sill down to the gallery, enclosed by
     a sloped roof plate — a hull under tow must not be under open sky. */
  const rampAng = Math.atan2(SY, RL);
  const rampLen = Math.hypot(SY, RL);
  const rampDeck = box(big.w + 8.0, 0.8, rampLen, M.panel, 'rampDeck');
  rampDeck.position.set(0, SY / 2, RL / 2);
  rampDeck.rotation.x = rampAng; st.add(rampDeck);
  const rampRoof = box(big.w + 8.0, 0.5, rampLen, M.deep, 'rampRoof');
  rampRoof.position.set(0, SY / 2 + big.h + 3.0, RL / 2);
  rampRoof.rotation.x = rampAng; st.add(markEnclosure(rampRoof, 'roof'));
  [-1, 1].forEach(sd => {
    const wall = box(0.5, big.h + 3.0, rampLen, M.hull, 'rampWall' + (sd < 0 ? 'L' : 'R'));
    wall.position.set(sd * (big.w / 2 + 4.0), SY / 2 + (big.h + 3.0) / 2, RL / 2);
    wall.rotation.x = rampAng; st.add(wall);
  });
  for (let i = 0; i < 9; i++) {
    const t2 = (i + 0.5) / 9;
    const rib = box(big.w + 8.6, 0.4, 0.5, M.fitting, 'rampRib' + i);
    rib.position.set(0, SY * (1 - t2) + big.h + 2.9, RL * t2); st.add(rib);
    const lamp = box(0.24, 0.16, 0.24, M.lit, 'rampLamp' + i);
    lamp.position.set(-(big.w / 2 + 3.6), SY * (1 - t2) + big.h + 2.4, RL * t2); st.add(lamp);
    const ln = box(2.4, 0.06, 0.5, M.accent, 'rampCentreline' + i);
    ln.position.set(0, SY * (1 - t2) + 0.44, RL * t2); ln.rotation.x = rampAng; st.add(ln);
  }

  // portal in the berm, facing back down the strip
  const gate = portalGate(big.w + 1.6, big.h + 1.0, 'portal', { depth: 3.4, opensOn: 'dockingClearance' });
  const gateY = SY + (big.h + 1.0) / 2 + 0.5;
  gate.position.set(0, gateY, -0.6);
  gate.rotation.y = Math.PI;                        // aperture normal = -Z, down the strip
  st.add(gate);
  /* The berm is rock with a HOLE in it, not a slab with a doorframe pinned to
     the front: the face is built around the opening, and the mass above sits
     over the ramp roof rather than across the portal. */
  const bermH = big.h + 9.0;
  const bermFace = wallWithHole(big.w + 22.0, bermH, 1.6,
    { x: 0, y: gateY - (SY + bermH / 2), w: big.w + 3.4, h: big.h + 2.2 }, matRock, 'bermFace');
  bermFace.position.set(0, SY + bermH / 2, -1.4); st.add(bermFace);
  const bermCap = box(big.w + 22.0, 5.0, 15.0, matRock, 'bermMass');
  bermCap.position.set(0, SY + big.h + 5.6, 6.6); st.add(bermCap);
  const bermLip = box(big.w + 5.0, 0.5, 1.2, M.hull, 'bermLintelTrim');
  bermLip.position.set(0, gateY + (big.h + 1.0) / 2 + 0.9, -1.5); st.add(bermLip);
  /* Bulkhead at the airlock's inboard gate, spanning the ramp: the inner gate
     is a gate in a wall, not a slab hanging in the tunnel's middle. */
  const bhd = wallWithHole(big.w + 9.0, big.h + 2.6, 0.5,
    { x: 0, y: 0, w: big.w + 1.7, h: big.h + 1.1 }, M.hull, 'portalBulkhead');
  bhd.position.set(0, gateY, 2.8); st.add(bhd);
  exteriorGreebles(bermCap, big.w + 16.0, 4.0, -7.6, rand, 'berm', 7);
  const bb = billboard('billboard', 10.0, 3.0, label);
  bb.position.set(-(big.w / 2 + 13.0), SY + 6.0, -2.2); bb.rotation.y = 0.3; st.add(bb);
  plinth(st, bb.position.x, bb.position.z, SY + 6.0 - 3.0 / 2 + 0.1, SY, 'berm');

  /* The strip. Marking and lighting only: threshold bars, a dashed
     centreline, edge lamps, and touchdown markers at the near end. */
  const bedLen = SL + 9.0, bedCz = -(SL + 11.0) / 2;
  const strip = box(SW, 0.5 + 0.10, bedLen, M.panel, 'stripBed');
  strip.position.set(0, RY - 0.3, bedCz); st.add(strip);
  const stripPlinth = box(SW + 14.0, SY, bedLen + 8.0, matRock, 'stripPlinth');
  stripPlinth.position.set(0, SY / 2 - 0.5, bedCz); st.add(stripPlinth);
  const dashes = Math.round(SL / 9);
  for (let i = 0; i < dashes; i++) {
    const dash = box(1.0, 0.06, 4.6, M.accent, 'stripCentreline' + i);
    dash.position.set(0, RY + 0.03, -1.0 - SL * ((i + 0.5) / dashes)); st.add(dash);
  }
  const lamps = Math.round(SL / 13);
  for (let i = 0; i < lamps; i++) {
    [-1, 1].forEach(sd => {
      const lamp = box(0.4, 0.3, 0.4, i === 0 ? M.accent : M.lit, 'stripEdgeLamp' + i + (sd < 0 ? 'L' : 'R'));
      lamp.position.set(sd * (SW / 2 - 0.5), RY + 0.15, -1.0 - SL * ((i + 0.5) / lamps)); st.add(lamp);
    });
  }
  for (let i = 0; i < 6; i++) {
    [-1, 1].forEach(sd => {
      const bar = box(1.4, 0.06, 5.6, M.lit, 'stripThresholdBar' + i + (sd < 0 ? 'L' : 'R'));
      const barStep = (SW / 2 - 0.8 - 1.6) / 5;
      bar.position.set(sd * (1.6 + i * barStep), RY + 0.03, -SL - 4.0); st.add(bar);
    });
  }
  for (let i = 0; i < 4; i++) {
    [-1, 1].forEach(sd => {
      const td = box(1.2, 0.06, 7.0, M.accent, 'stripTouchdown' + i + (sd < 0 ? 'L' : 'R'));
      td.position.set(sd * 4.6, RY + 0.03, -SL + 14.0 + i * 11.0); st.add(td);
    });
  }
  // nav lights: green to starboard of the inbound hull, red to port
  for (let i = 0; i < 4; i++) {
    [-1, 1].forEach(sd => {
      const nav = box(0.34, 0.34, 0.34, sd > 0 ? M.navGreen : M.navRed, 'stripNavLight' + i + (sd < 0 ? 'L' : 'R'));
      nav.position.set(sd * (SW / 2 + 1.2), SY + 0.3, -6.0 - i * (SL / 4.6)); st.add(nav);
      const post = box(0.24, 0.6, 0.24, M.fitting, 'stripNavPost' + i + (sd < 0 ? 'L' : 'R'));
      post.position.set(sd * (SW / 2 + 1.2), SY - 0.05, -6.0 - i * (SL / 4.6)); st.add(post);
    });
  }

  /* The planet's own surface. One slab: the plant that has to stand outside
     (tower, radiators, berms, signs) needs ground under it, and a tiled
     surface would cost hundreds of draw calls on the target hardware. */
  const ground = box(SW + 74.0, 1.2, SL + 56.0, matRegolith, 'groundPlate');
  ground.position.set(0, SY - 0.6, -SL / 2 - 1.0); st.add(markEnclosure(ground, 'roof'));

  towerCluster(st, -(SW / 2 + 19.0), -SL * 0.16, label, rand, 'tower', SY);
  berms(st, { count: 8, w: 9.0, h: 2.0, d: 7.0, x: SW / 2 + 16.0, z: -SL * 0.4,
    spread: 12.0, spreadZ: SL * 0.7, baseY: SY }, rand, 'strip');

  st.add(rockShell({ x0: gal.hallX - gal.hd / 2 - 2, x1: gx / 2 + 2, z0: RL - 2, z1: RL + gz + 2,
    base: 3.0, top: SY, open: ['+x', '-z'] }));
  st.add(rockShell({ x0: -(big.w / 2 + 6), x1: big.w / 2 + 6, z0: 0, z1: RL,
    base: 3.0, top: SY, open: ['+x', '-z', '+z'], thick: 6.0, roof: false }));
  // rock under the ramp, following its slope
  const rampUnder = box(big.w + 16.0, 7.0, rampLen, matRock, 'rampUnderMass');
  rampUnder.position.set(0, SY / 2 - 4.2, RL / 2);
  rampUnder.rotation.x = rampAng; st.add(rampUnder);

  st.userData.interiorAnchors = ['galFloor', 'hallFloor'];
  st.userData.site = 'runway';
  st.userData.surfaceY = SY;
  return finish(st, 'runwaySite', label);
}

/* ------------------------------------------------------- 2. MOUNTAIN SITE */
/* Doors in a rock face. No descent and no strip: the approach is level flight
 * into the massif, which is the only shelter the site needs. */
export function buildMountainSite(label = 'UP-202', size = 'M') {
  const st = new T.Group();
  const rand = seedFrom(label + size);
  const M = MATS;
  const gx = big.d + 8.0;
  const seedTag = String(label).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  /* M and L carry a heavy berth as well as the face portal: an L-sized bay sunk
     into the ground beside the massif, with sliding interdigitating doors laid
     over the top of it. Placed well clear of the portal's approach lane, which
     runs out along -Z on the centreline. */
  const hasHeavyPad = size !== 'S';
  const lDoorW = big.w + 1.7, lDoorD = big.d + 2.2;
  const lHangW = big.d + (size === 'L' ? 16.0 : 10.0);
  const lHangD = big.w + (size === 'L' ? 26.0 : 20.0);
  const lHangH = big.h + (size === 'L' ? 14.0 : 10.0);
  /* X is derived from the massif's MEASURED extent once the steps exist — the
     bay needs open sky straight up, and a position guessed from gx put it
     under the mountain's lowest step. */
  let lPadX = 0;
  const lPadZ = -6.0;
  const TUN = size === 'S' ? 15.0 : size === 'L' ? 31.0 : 22.0;  // face to gallery
  const gal = undergroundGallery({ gx, rand, label, size, tag: 'gal' });
  const gz = gal.gz, gh = gal.gh;
  const SY = gh + (size === 'L' ? 7.0 : 5.0);         // rock cover over the gallery
  gal.grp.position.set(0, 0, TUN + gz / 2);
  st.add(gal.grp);

  // level tunnel
  const tunFloor = box(big.w + 8.0, DECK, TUN, M.panel, 'tunnelFloor');
  tunFloor.position.set(0, -DECK / 2, TUN / 2); st.add(tunFloor);
  const tunRoof = box(big.w + 8.0, PLATE, TUN, M.deep, 'tunnelRoof');
  tunRoof.position.set(0, big.h + 3.0, TUN / 2); st.add(markEnclosure(tunRoof, 'roof'));
  [-1, 1].forEach(sd => {
    const wall = box(PLATE, big.h + 3.0, TUN, M.hull, 'tunnelWall' + (sd < 0 ? 'L' : 'R'));
    wall.position.set(sd * (big.w / 2 + 4.0), (big.h + 3.0) / 2, TUN / 2); st.add(wall);
  });
  for (let i = 0; i < 6; i++) {
    const rib = box(big.w + 8.6, 0.4, 0.5, M.fitting, 'tunnelRib' + i);
    rib.position.set(0, big.h + 2.7, TUN * ((i + 0.5) / 6)); st.add(rib);
    const lamp = box(0.24, 0.16, 0.24, M.lit, 'tunnelLamp' + i);
    lamp.position.set(-(big.w / 2 + 3.6), big.h + 2.2, TUN * ((i + 0.5) / 6)); st.add(lamp);
    const ln = box(2.4, 0.06, 0.5, M.accent, 'tunnelCentreline' + i);
    ln.position.set(0, 0.03, TUN * ((i + 0.5) / 6)); st.add(ln);
  }

  // doors in the rock face
  const gate = portalGate(big.w + 1.6, big.h + 1.0, 'portal', { depth: 3.4, opensOn: 'dockingClearance' });
  const gateY = (big.h + 1.0) / 2 + 0.4;
  gate.position.set(0, gateY, -0.6);
  gate.rotation.y = Math.PI; st.add(gate);
  /* The cliff face is rock with a hole cut for the portal, not a plate hung in
     front of one. Everything above and to either side is mass. */
  const faceH = SY + 6.0;
  const face = wallWithHole(gx + 52.0, faceH, 2.2,
    { x: 0, y: gateY - faceH / 2, w: big.w + 3.4, h: big.h + 2.2 }, matRock, 'faceMass');
  face.position.set(-gx * 0.1, faceH / 2, -2.0); st.add(face);
  const revet = wallWithHole(big.w + 16.0, big.h + 7.0, 0.8,
    { x: 0, y: gateY - (big.h + 7.0) / 2, w: big.w + 3.0, h: big.h + 1.8 }, M.hull, 'faceRevetment');
  revet.position.set(0, (big.h + 7.0) / 2, -3.4); st.add(revet);
  /* Face clutter on the mass to either SIDE of the opening — a piece placed
     across the hole hangs in the doorway. */
  for (let i = 0; i < 9; i++) {
    const sd = i % 2 ? 1 : -1, sz = 0.5 + rand() * 1.1;
    const g = box(sz, sz * (0.6 + rand()), 0.9, i % 2 ? M.panel : M.fitting, 'faceGreeble' + i);
    g.position.set(sd * (big.w / 2 + 4.0 + rand() * 16.0), 1.4 + rand() * (faceH * 0.7), -3.0);
    st.add(g);
    if (i < 6) {
      const p = box(0.7, 0.5, 0.1, ((seedTag + i) % 5) > 1 ? M.lit : M.dark, 'facePort' + i);
      p.position.set(-sd * (big.w / 2 + 1.4 + rand() * 4.0), 2.4 + rand() * (big.h + 3.0), -3.86);
      st.add(p);
    }
  }
  const bhd = wallWithHole(big.w + 9.0, big.h + 2.6, 0.5,
    { x: 0, y: 0, w: big.w + 1.7, h: big.h + 1.1 }, M.hull, 'portalBulkhead');
  bhd.position.set(0, gateY, 2.8); st.add(bhd);
  const bb = billboard('billboard', 10.0, 3.0, label);
  bb.position.set(-(big.w / 2 + 12.0), 8.0, -2.6); bb.rotation.y = 0.4; st.add(bb);
  plinth(st, bb.position.x, bb.position.z, 8.0 - 3.0 / 2 + 0.1, 0, 'face');
  // approach lighting out from the face, so the door is findable at range
  for (let i = 0; i < 5; i++) {
    [-1, 1].forEach(sd => {
      const post = box(0.3, 1.6, 0.3, M.fitting, 'approachPost' + i + (sd < 0 ? 'L' : 'R'));
      post.position.set(sd * (big.w / 2 + 5.0 + i * 2.2), 0.8, -4.0 - i * 7.0); st.add(post);
      const lamp = box(0.36, 0.3, 0.36, i === 0 ? (sd > 0 ? M.navGreen : M.navRed) : M.lit,
        'approachLamp' + i + (sd < 0 ? 'L' : 'R'));
      lamp.position.set(post.position.x, 1.75, post.position.z); st.add(lamp);
    });
  }

  /* The massif: stepped low-poly blocks, receding as they rise, each one
     BASED ON THE SURFACE so no step reaches down into the excavation. Cut away
     on +X to show the workings. Each step is one box — a mountain is not where
     the triangles should go. */
  const steps = 6;
  const ledges = [];
  for (let i = 0; i < steps; i++) {
    const t2 = i / (steps - 1);
    const w = (gx + 46.0) * (1 - t2 * 0.62), d = (gz + TUN + 40.0) * (1 - t2 * 0.55);
    const h = 7.0 + t2 * 30.0;
    const blk = box(w, h, d, i % 2 ? matRock : matRockDeep, 'massifStep' + i);
    const bx = -gx * 0.2 - t2 * 14.0 + (rand() - 0.5) * 4.0;
    const bz = d / 2 + t2 * 12.0 + (rand() - 0.5) * 6.0;
    const by = SY + h / 2 - t2 * 1.2;
    blk.position.set(bx, by, bz);
    blk.rotation.y = (rand() - 0.5) * 0.3;
    st.add(markEnclosure(blk, 'massif'));
    blk.updateWorldMatrix(true, false);
    /* Measured bounds, not the nominal w/d: the steps carry a random Y
       rotation, so a building placed from the nominal half-width hangs off
       the rotated corner. */
    const bb2 = new T.Box3().setFromObject(blk);
    ledges.push({ box: bb2, top: bb2.max.y });
  }

  /* Buildings up the mountain's flank, each standing on the ledge the step
     below it leaves. Site staff work on the mountain, not in the tunnel:
     blocks with lit and dark ports, service stacks, and a stair run tying each
     to the ledge under it — the stairs are what make them read as one
     settlement rather than scattered boxes. */
  const plots = [];
  for (let i = 0; i < ledges.length - 1; i++) {
    const lg = ledges[i], up = ledges[i + 1];
    const bw = 7.0 + rand() * 4.0, bd = 6.0 + rand() * 4.0, bh = 3.4 + rand() * 2.6;
    /* On the ledge the step above leaves free: between that step's near face
       and this step's own near face, inset far enough that the footprint is
       wholly on rock. */
    const bxp = Math.min(lg.box.max.x - bw / 2 - 1.2,
      Math.max(lg.box.min.x + bw / 2 + 1.2, lg.box.min.x + bw / 2 + 2.0 + rand() * 3.0));
    const zLo = lg.box.min.z + bd / 2 + 1.2, zHi = up.box.min.z - bd / 2 - 1.0;
    const bzp = zHi > zLo ? zHi : zLo;
    plots.push({ x: bxp, z: bzp, top: lg.top, h: bh, w: bw, d: bd });
    const blk = box(bw, bh, bd, i % 2 ? M.hull : M.panel, 'flankBuilding' + i);
    blk.position.set(bxp, lg.top + bh / 2, bzp); st.add(blk);
    const roofPl = box(bw + 0.6, 0.35, bd + 0.6, M.deep, 'flankBuildingRoof' + i);
    roofPl.position.set(bxp, lg.top + bh + 0.17, bzp); st.add(roofPl);
    for (let k = 0; k < 4; k++) {
      const litOn = ((seedTag + i * 5 + k) % 5) > 1;
      const p = box(1.1, 0.55, 0.1, litOn ? M.lit : M.dark, 'flankBuildingPort' + i + k);
      p.position.set(bxp - bw / 2 + 1.4 + k * (bw - 2.2) / 3, lg.top + bh * 0.6, bzp - bd / 2 - 0.02);
      st.add(p);
    }
    const stack = cyl(0.22, 0.28, 1.8, M.fitting, 'flankBuildingStack' + i, 6);
    stack.position.set(bxp + bw * 0.3, lg.top + bh + 0.9, bzp + bd * 0.2); st.add(stack);
    const tank = cyl(0.6, 0.6, 1.2, M.panel, 'flankBuildingTank' + i, 8);
    tank.position.set(bxp - bw * 0.3, lg.top + bh + 0.6, bzp + bd * 0.25); st.add(tank);
    const lamp = box(0.4, 0.16, 0.4, M.accent, 'flankBuildingLamp' + i);
    lamp.position.set(bxp, lg.top + bh + 0.42, bzp - bd * 0.3); st.add(lamp);
  }

  /* Stairs between neighbouring plots, on a stringer that spans the two
     ledges. Treads bridging open air would be the floating-detail bug; the
     stringer is the structure that carries them. */
  for (let i = 0; i < plots.length - 1; i++) {
    const a2 = plots[i], b2 = plots[i + 1];
    const dx = b2.x - a2.x, dz = b2.z - a2.z, dy = b2.top - a2.top;
    const run = Math.hypot(dx, dz);
    if (run < 1.2) continue;
    const stringer = box(Math.hypot(run, dy) + 1.4, 0.5, 2.6, M.hull, 'flankStairStringer' + i);
    stringer.position.set(a2.x + dx / 2, (a2.top + b2.top) / 2 - 0.25, a2.z + dz / 2);
    stringer.rotation.y = -Math.atan2(dz, dx);
    stringer.rotation.z = Math.atan2(dy, run);
    st.add(stringer);
    const treads = Math.max(3, Math.round(Math.hypot(run, dy) / 1.2));
    for (let k = 0; k < treads; k++) {
      const t3 = (k + 0.5) / treads;
      const tr = box(2.0, 0.28, 1.0, M.fitting, 'flankStair' + i + '_' + k);
      tr.position.set(a2.x + dx * t3, a2.top + dy * t3 + 0.14, a2.z + dz * t3);
      tr.rotation.y = -Math.atan2(dz, dx);
      st.add(tr);
    }
    const rail = box(0.16, 1.0, Math.hypot(run, dy), M.fitting, 'flankStairRail' + i);
    rail.position.set(a2.x + dx / 2 - 1.2, (a2.top + b2.top) / 2 + 0.5, a2.z + dz / 2);
    rail.rotation.y = -Math.atan2(dz, dx);
    st.add(rail);
  }
  /* Enclosed on every side but the tunnel mouth. This used to be cut away on
     +X so the workings read in the viewer — which is precisely the exposed
     internals fault: an underground port has no open section. */
  st.add(rockShell({ x0: gal.hallX - gal.hd / 2 - 2, x1: gx / 2 + 2, z0: -2, z1: TUN + gz + 2,
    base: 3.0, top: SY, open: ['-z'] }));
  /* Scree and boulders at the foot of the face, kept OUT of the portal's
     approach: a hull flies in level, so the lane in front of the doors has to
     stay empty for the length of the heaviest hull. */
  const laneHalf = big.w / 2 + 4.0;
  berms(st, { count: 9, w: 8.0, h: 2.4, d: 7.0, x: -(laneHalf + 22.0), z: -16.0, spread: 30.0, spreadZ: 12.0 }, rand, 'scree');
  for (let i = 0; i < 7; i++) {
    const s = 1.4 + rand() * 3.4;
    const bh = s * (0.6 + rand() * 0.5);
    const bo = box(s, bh, s * (0.7 + rand() * 0.6), i % 2 ? matRock : matRockStrata, 'boulder' + i);
    const sd = i % 2 ? 1 : -1;
    bo.position.set(sd * (laneHalf + 2.0 + rand() * 26.0), bh * 0.42, -6.0 - rand() * 26.0);
    bo.rotation.y = rand(); st.add(bo);
  }
  if (hasHeavyPad) {
    st.updateMatrixWorld(true);
    const mb = new T.Box3();
    st.traverse(n => { if (n.isMesh && /^massifStep/.test(n.name)) mb.union(new T.Box3().setFromObject(n)); });
    lPadX = (isFinite(mb.max.x) ? mb.max.x : gx / 2) + 8.0 + lHangW / 2;
  }
  const gpW = Math.max(gx + 130.0, (lPadX + lHangW / 2 + 30.0) * 2);
  const gpD = gz + TUN + 96.0, gpCZ = (TUN + gz) / 2 - 30.0;
  const gpHoles = hasHeavyPad
    ? [{ x: lPadX, z: lPadZ - gpCZ, w: lDoorW + 1.2, d: lDoorD + 1.2 }] : [];
  const ground = plateWithHoles(gpW, gpD, 1.2, gpHoles, matRegolith, 'groundPlate');
  ground.position.set(0, 0, gpCZ); st.add(markEnclosure(ground, 'roof'));

  /* ---- sunken heavy bay ---- */
  if (hasHeavyPad) {
    const y0 = -lHangH;                       // hangar floor level, below ground
    const lFloor = box(lHangW, DECK, lHangD, M.panel, 'lHangarFloor');
    lFloor.position.set(lPadX, y0 - DECK / 2, lPadZ); st.add(lFloor);
    [-1, 1].forEach(sd => {
      const wall = box(PLATE, lHangH, lHangD, M.hull, 'lHangarWall' + (sd < 0 ? 'W' : 'E'));
      wall.position.set(lPadX + sd * (lHangW / 2 - PLATE / 2), y0 / 2, lPadZ); st.add(wall);
      const endw = box(lHangW, lHangH, PLATE, M.hull, 'lHangarEnd' + (sd < 0 ? 'S' : 'N'));
      endw.position.set(lPadX, y0 / 2, lPadZ + sd * (lHangD / 2 - PLATE / 2)); st.add(endw);
    });
    /* Ceiling is the ground itself, so it carries the same aperture as the
       plate above it — the bay is roofed by the world, not open to the sky. */
    const lCeil = plateWithHoles(lHangW, lHangD, PLATE,
      [{ x: 0, z: 0, w: lDoorW + 0.6, d: lDoorD + 0.6 }], M.deep, 'lHangarCeiling');
    lCeil.position.set(lPadX, -0.02, lPadZ); st.add(markEnclosure(lCeil, 'roof'));
    // rock around the excavation, so it reads as dug rather than dropped in
    [-1, 1].forEach(sd => {
      const rw = box(4.0, lHangH + 3.0, lHangD + 8.0, matRock, 'lHangarRock' + (sd < 0 ? 'W' : 'E'));
      rw.position.set(lPadX + sd * (lHangW / 2 + 2.0), (y0 - 3.0) / 2, lPadZ);
      st.add(markEnclosure(rw, 'rock'));
      const re = box(lHangW + 8.0, lHangH + 3.0, 4.0, matRock, 'lHangarRock' + (sd < 0 ? 'S' : 'N'));
      re.position.set(lPadX, (y0 - 3.0) / 2, lPadZ + sd * (lHangD / 2 + 2.0));
      st.add(markEnclosure(re, 'rock'));
    });
    const rBase = box(lHangW + 8.0, 3.0, lHangD + 8.0, matRockDeep, 'lHangarRockFloor');
    rBase.position.set(lPadX, y0 - DECK - 1.5, lPadZ); st.add(rBase);

    // sliding interdigitating doors laid over the top of the bay
    const lDoors = surfaceGate(lDoorW, lDoorD, 'lHangarDoor', { innerGate: null });
    lDoors.position.set(lPadX, 0.3, lPadZ); st.add(lDoors);
    // the car, flush with the ground, closing the aperture
    const lCar = box(lDoorW + 1.0, 0.9, lDoorD + 1.0, M.panel, 'lHangarLiftPlatform');
    lCar.position.set(lPadX, -0.45, lPadZ); st.add(lCar);
    const lSkirt = box(lDoorW + 1.6, 0.4, lDoorD + 1.6, M.fitting, 'lHangarLiftPlatformSkirt');
    lSkirt.position.set(lPadX, -1.05, lPadZ); st.add(lSkirt);
    const lOut = box(big.w + 1.6, 0.08, big.d + 2.0, M.accent, 'lHangarLiftOutline');
    lOut.position.set(lPadX, 0.04, lPadZ); st.add(lOut);
    const lOutIn = box(big.w + 0.4, 0.09, big.d + 0.6, M.deep, 'lHangarLiftOutlineInner');
    lOutIn.position.set(lPadX, 0.05, lPadZ); st.add(lOutIn);
    for (let i = 0; i < 4; i++) {
      const cl = box(0.9, 0.6, 0.9, M.fitting, 'lHangarClamp' + i);
      cl.position.set(lPadX + (i % 2 ? 1 : -1) * (big.w / 2 + 0.4), 0.3,
        lPadZ + (i < 2 ? 1 : -1) * big.d * 0.3); st.add(cl);
      const gd = box(0.6, lHangH - 1.0, 0.6, M.fitting, 'lHangarLiftGuide' + i);
      gd.position.set(lPadX + (i % 2 ? 1 : -1) * (lDoorW / 2 + 0.5), y0 + (lHangH - 1.0) / 2 + 0.5,
        lPadZ + (i < 2 ? 1 : -1) * (lDoorD / 2 + 0.5)); st.add(gd);
    }
    cautionFrame(st, 0.0, lPadX, lPadZ, lDoorW + 1.6, lDoorD + 1.6, 'lHangarCaution');
    /* Carrier contract, same as every other thing on a site that travels: the
       two ENDS of the run, recorded here where the shaft's own depth is in
       scope, and `setCarriers` lerps between them. The descriptive fields ride
       along because they are real information the poses do not carry — a lift
       that must not move until the doors are shut is not the same lift. */
    lCar.userData.carrier = {
      kind: 'lift', level: true, idle: 'from',
      from: lCar.position.clone(),
      to: lCar.position.clone().add(new T.Vector3(0, -(lHangH - 0.9), 0)),
      serves: ['L'], interlock: 'doorsClosedBeforeDescent'
    };
    // parking stand and dressing on the hangar floor
    const lStand = box(big.w + 1.6, 0.08, big.d + 2.0, M.accent, 'lHangarStandOutline');
    lStand.position.set(lPadX, y0 + 0.05, lPadZ + big.d * 0.1); st.add(lStand);
    const lStandIn = box(big.w + 0.4, 0.09, big.d + 0.6, M.deep, 'lHangarStandInner');
    lStandIn.position.set(lPadX, y0 + 0.06, lPadZ + big.d * 0.1); st.add(lStandIn);
    const lRailX = lHangW / 2 - 0.6;
    [-1, 1].forEach(sd => {
      const rb = box(0.5, 0.5, lHangD * 0.9, M.fitting, 'lHangarCraneRail' + (sd < 0 ? 'L' : 'R'));
      rb.position.set(lPadX + sd * lRailX, -1.6, lPadZ); st.add(rb);
    });
    const lCraneZ = lPadZ + Math.min(lHangD / 2 - 2.4, lDoorD / 2 + 2.2);
    const lBridge = box(lRailX * 2 + 0.5, 0.6, 1.6, M.panel, 'lHangarCraneBridge');
    lBridge.position.set(lPadX, -2.0, lCraneZ); st.add(lBridge);
    interiorDressing(st, { w: lHangW - 0.5, h: lHangH, d: lHangD - 0.5, y: y0, cx: lPadX, cz: lPadZ,
      lights: 5, ads: 3, greebles: 10, crates: 7, decals: 5, ports: 4, seed: seedTag + 5 }, rand, 'lHangar');
    // approach lighting round the aperture, on the ground
    for (let i = 0; i < 4; i++) {
      [-1, 1].forEach(sd => {
        const lp = box(0.3, 0.24, 0.3, i === 0 ? (sd > 0 ? M.navGreen : M.navRed) : M.lit,
          'lPadApproachLamp' + i + (sd < 0 ? 'L' : 'R'));
        lp.position.set(lPadX + sd * (lDoorW / 2 + 2.2), 0.12, lPadZ - lDoorD * 0.3 + i * (lDoorD * 0.25));
        st.add(lp);
      });
    }
  }

  /* Control tower ON THE SUMMIT: the highest ledge is the only place with
     sight of the whole approach, and a tower at the foot of a mountain can see
     nothing over it. Compact — the apron and the vehicles stay at ground
     level, where the road actually reaches. */
  const summit = ledges[ledges.length - 1];
  const sc = summit.box.getCenter(new T.Vector3());
  const summitPad = box(15.0, 0.7, 15.0, M.panel, 'summitPad');
  summitPad.position.set(sc.x, summit.top + 0.35, sc.z); st.add(summitPad);
  const summitRing = box(11.5, 0.08, 11.5, M.accent, 'summitPadOutline');
  summitRing.position.set(sc.x, summit.top + 0.74, sc.z); st.add(summitRing);
  towerCluster(st, sc.x, sc.z, label, rand, 'tower', summit.top + 0.7, { compact: true });
  radiatorBank(st, -(gx / 2 + 14.0), TUN * 0.4, rand, 'faceRad', 6, 0);
  const yard = box(17.0, 0.3, 13.0, M.panel, 'serviceYard');
  yard.position.set(gx / 2 + 24.0, 0.15, TUN + 8.0); st.add(yard);
  for (let i = 0; i < 4; i++) {
    const decal = box(3.0, 0.06, 0.5, i % 2 ? M.accent : M.deep, 'serviceYardDecal' + i);
    decal.position.set(gx / 2 + 19.0 + i * 3.2, 0.32, TUN + 5.0); st.add(decal);
  }
  for (let i = 0; i < 6; i++) {
    const drum = cyl(0.35, 0.35, 1.0, i % 3 ? M.fitting : M.accent, 'yardDrum' + i, 8);
    drum.position.set(gx / 2 + 18.0 + rand() * 11.0, 0.8, TUN + 4.0 + rand() * 8.0); st.add(drum);
  }
  for (let i = 0; i < 2; i++) {
    const cxx = gx / 2 + 20.0 + i * 7.0, czz = TUN + 12.0;
    const hb = box(3.4, 1.3, 5.6, i ? M.panel : M.hull, 'yardCrawler' + i);
    hb.position.set(cxx, 1.25, czz); st.add(hb);
    const cb = box(2.2, 1.1, 1.8, M.hull, 'yardCrawlerCab' + i);
    cb.position.set(cxx, 2.45, czz - 1.6); st.add(cb);
    const cg = box(2.0, 0.6, 0.1, M.glass, 'yardCrawlerGlass' + i);
    cg.position.set(cxx, 2.6, czz - 2.52); st.add(cg);
    [-1, 1].forEach(sd => {
      const tk = box(0.8, 0.9, 5.4, M.fitting, 'yardCrawlerTrack' + i + (sd < 0 ? 'L' : 'R'));
      tk.position.set(cxx + sd * 1.7, 0.45, czz); st.add(tk);
    });
    const lp = box(0.7, 0.18, 0.18, M.accent, 'yardCrawlerLamp' + i);
    lp.position.set(cxx, 3.05, czz - 1.6); st.add(lp);
  }

  st.userData.interiorAnchors = ['galFloor', 'hallFloor'].concat(hasHeavyPad ? ['lHangarFloor'] : []);
  st.userData.site = 'mountain';
  st.userData.surfaceY = SY;
  return finish(st, 'mountainSite', label);
}

/* ------------------------------------------------------------ 3. PAD SITE */
/* A square pad with the control tower beside it. The pad is the head of a 45
 * degree elevator: it carries an S or M hull down to a transfer deck, where a
 * conveyor runs it to one of four internally held bays. An L hull is too big
 * for the pad, so the interdigitating surface doors open for it instead, close
 * over it, and lower it to the heavy hangar — which is where a passenger liner
 * finds its gates, airbridges and baggage line. */
export function buildPadSite(label = 'UP-303', size = 'M') {
  const st = new T.Group();
  const rand = seedFrom(label + size);
  const M = MATS;
  const seed = String(label).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  /* What the size mark changes here: how many internally held bays the
     conveyor serves, how deep the pad has to sink to clear them, and the span
     of the heavy hangar. Aperture and pad sizes are fixed to the fleet
     envelope, as everywhere else — a hull doesn't shrink. */
  const baysPerSide = size === 'S' ? 1 : size === 'L' ? 3 : 2;
  const bayCount = baysPerSide * 2;
  const SY = size === 'S' ? 13.0 : size === 'L' ? 20.0 : 16.0;
  const PW = bay.d + 4.0;                            // pad, sized off the S/M envelope
  const padZ = 0.0;
  const drop = SY;                                   // 45 degrees: run equals drop
  const deckHalfZ = 13.5;                            // set by the bays' own corridors
  const hangW = big.d + (size === 'S' ? 6.0 : size === 'L' ? 16.0 : 10.0);
  const hangD = big.w + (size === 'S' ? 14.0 : size === 'L' ? 28.0 : 20.0);
  const hangH = big.h + (size === 'S' ? 8.0 : size === 'L' ? 15.0 : 11.0);
  /* The vertical L shaft — interdigitating sliding doors in the surface, lift
     car, hangar, concourse — exists on M and L only. An S site is a light
     port: the 45 degree pad and its four internal bays, no heavy berth. */
  const hasHeavy = size !== 'S';
  const gateCount = size === 'L' ? 5 : 4;
  const radCount = size === 'S' ? 1 : size === 'L' ? 3 : 2;
  const doorW = big.w + 1.7, doorD = big.d + 2.2;
  const SURF = SY + 0.24;                            // finished surface: apron top
  /* Laid out from the foot of the incline outward, so the deck is exactly as
     long as the bays it carries and the hangar sits beyond its far end. */
  const bayPitch = bay.w + 9.0;
  const runLenX = bayPitch * baysPerSide + 14.0;
  const padX = -(runLenX + drop + PW / 2 + 4.0);
  const hangX = 6.0 + hangW / 2;
  const hangZ = 0.0;
  const conD = hangD * 0.8, conH = 5.0, conW = 7.0;
  // the concourse ABUTS the hangar's west wall rather than standing off it
  const conX = hangX - hangW / 2 - conW / 2 + PLATE;

  /* ---- surface ---- */
  /* Plate sized to the site under it plus room for the plant that has to stand
     outside, rather than a pair of literals that stayed put while the workings
     below changed size. */
  const surfX0 = padX - PW / 2 - 26.0;
  // far edge follows the deepest thing underground, so an S site is not
  // padded out with 40m of empty plate where its hangar would have been
  const surfX1 = (hasHeavy ? hangX + hangW / 2 : padX + PW / 2 + runLenX) + 34.0;
  const surfCX = (surfX0 + surfX1) / 2, surfW = surfX1 - surfX0;
  const surfD = Math.max(hangD, deckHalfZ * 2) + 56.0;
  const holes = [{ x: padX - surfCX, z: padZ, w: PW + 1.0, d: PW + 1.0 }];
  if (hasHeavy) holes.push({ x: hangX - surfCX, z: hangZ, w: doorW + 1.2, d: doorD + 1.2 });
  const surf = plateWithHoles(surfW, surfD, 1.2, holes, M.hull, 'surfacePlate');
  surf.position.set(surfCX, SY, 0); st.add(markEnclosure(surf, 'roof'));
  /* The wearing course carries the SAME holes as the plate under it. Paved as
     one slab it went straight over both pads and buried them. */
  const apron = plateWithHoles(surfW, surfD, 0.24, holes, M.panel, 'surfaceApron');
  apron.position.set(surfCX, SURF, 0); st.add(markEnclosure(apron, 'roof'));
  /* Painted panels lie flat on level skin only — the apron is dead level, so
     these are legal here and nowhere on the berms. */
  for (let i = 0; i < 7; i++) {
    const dc = box(7.0, 0.06, 1.0, i % 2 ? M.accent : M.deep, 'surfaceDecal' + i);
    dc.position.set(surfCX + (i - 3) * 9.0, SURF + 0.03, -surfD / 2 + 14.0); st.add(dc);
  }

  /* The pad IS the elevator car. It sits level and flush with the surface
     plate, and it STAYS level as it travels: the whole platform runs down and
     laterally together at 45 degrees, so a hull standing on it is never
     tilted. The incline below is its shaft, not a separate conveyance — there
     is one car, drawn in its raised position. */
  const pad = box(PW, 0.9, PW, M.panel, 'padPlatform');
  pad.position.set(padX, SURF - 0.45, padZ); st.add(pad);
  const padSkirt = box(PW + 0.5, 0.35, PW + 0.5, M.fitting, 'padCarSkirt');
  padSkirt.position.set(padX, SURF - 0.95, padZ); st.add(padSkirt);
  for (let i = 0; i < 4; i++) {
    const shoe = box(0.7, 0.55, 0.7, M.fitting, 'padCarShoe' + i);
    shoe.position.set(padX + (i % 2 ? 1 : -1) * (PW / 2 - 0.5), SURF - 1.3,
      padZ + (i < 2 ? 1 : -1) * (PW / 2 - 0.5));
    st.add(shoe);
  }
  const padOutline = box(PW * 0.78, 0.07, PW * 0.78, M.accent, 'padOutline');
  padOutline.position.set(padX, SURF + 0.04, padZ); st.add(padOutline);
  const padInner = box(PW * 0.64, 0.08, PW * 0.64, M.deep, 'padOutlineInner');
  padInner.position.set(padX, SURF + 0.05, padZ); st.add(padInner);
  for (let i = 0; i < 4; i++) {
    const clamp = box(0.8, 0.5, 0.8, M.fitting, 'padClamp' + i);
    clamp.position.set(padX + (i % 2 ? 1 : -1) * PW * 0.27, SURF + 0.25, padZ + (i < 2 ? 1 : -1) * PW * 0.27);
    st.add(clamp);
  }
  cautionFrame(st, SURF, padX, padZ, PW + 1.2, PW + 1.2, 'padCaution');
  pad.userData.carrier = {
    /* Stays horizontal throughout: the car TRANSLATES down a 45 degree shaft,
       it never rotates. `level: true` with `angle: 45` is the pair that says
       so — the shaft is inclined and the deck is not, and a carrier that
       recorded only the angle would arrive tipped. */
    kind: 'lift', level: true, angle: 45, idle: 'from',
    from: pad.position.clone(),
    to: pad.position.clone().add(new T.Vector3(-drop, -drop, 0)),
    serves: ['S', 'M'],
    interlock: 'carAtSurfaceBeforeClearance'
  };
  [-1, 1].forEach(sd => {
    const nav = box(0.32, 0.3, 0.32, sd < 0 ? M.navGreen : M.navRed, 'padNavLight' + (sd < 0 ? 'L' : 'R'));
    nav.position.set(padX + sd * (PW / 2 + 1.4), SURF + 0.5, padZ - PW * 0.3); st.add(nav);
    const post = box(0.24, 0.7, 0.24, M.fitting, 'padNavPost' + (sd < 0 ? 'L' : 'R'));
    post.position.set(nav.position.x, SURF + 0.24, nav.position.z); st.add(post);
  });

  /* ---- 45 degree incline ---- */
  const inclineLen = Math.hypot(drop, drop);
  const inclineMidX = padX - drop / 2 - PW / 2, inclineMidY = SY - drop / 2;
  const rails = new T.Group(); rails.name = 'incline';
  const inclDeck = box(inclineLen + 1.0, 0.7, PW + 2.0, M.panel, 'inclineDeck');
  inclDeck.position.set(inclineMidX, inclineMidY - 0.6, padZ);
  inclDeck.rotation.z = Math.PI / 4;
  rails.add(inclDeck);
  /* Roof and side walls stop short of the pad opening. Run at full length
     they emerge from the ground beside the pad: the shaft roof is offset
     vertically from the deck, so its upper end clears the surface by the
     headroom unless the run is shortened by that offset along the slope. */
  const head = bay.h + 3.0;
  const cut = head * Math.SQRT2;
  const lenR = Math.max(4.0, inclineLen - cut);
  const back = (cut / 2) / Math.SQRT2;
  const roofX = inclineMidX - back, roofY = inclineMidY + head - back;
  const inclRoof = box(lenR, 0.5, PW + 2.0, M.deep, 'inclineRoof');
  inclRoof.position.set(roofX, roofY, padZ);
  inclRoof.rotation.z = Math.PI / 4;
  rails.add(markEnclosure(inclRoof, 'roof'));
  [-1, 1].forEach(sd => {
    const w2 = box(lenR, head, 0.5, M.hull, 'inclineWall' + (sd < 0 ? 'L' : 'R'));
    // midway between deck and roof, on the roof's own setback
    w2.position.set(roofX, roofY - head / 2, padZ + sd * (PW / 2 + 1.0));
    w2.rotation.z = Math.PI / 4;
    rails.add(w2);
  });
  /* Header over the shaft mouth, closing the gap between the shortened roof
     and the pad opening. */
  const mouth = box(cut * 0.8, 0.6, PW + 2.0, M.hull, 'inclineMouthHeader');
  mouth.position.set(padX - PW / 2 - cut * 0.4, SY - 0.9, padZ); rails.add(mouth);
  for (let i = 0; i < 7; i++) {
    const t2 = (i + 0.5) / 7;
    const x = padX - PW / 2 - drop * t2, y = SY - drop * t2;
    const rail = box(1.2, 0.5, PW + 1.6, M.fitting, 'inclineRail' + i);
    rail.position.set(x, y - 0.9, padZ); rails.add(rail);
    const lamp = box(0.22, 0.16, 0.22, M.lit, 'inclineLamp' + i);
    lamp.position.set(x, y - 0.55, padZ - PW / 2 + 0.45); rails.add(lamp);
    const stripe = box(1.0, 0.06, 0.6, i % 2 ? M.hazardY : M.hazardK, 'inclineCaution' + i);
    stripe.position.set(x, y - 0.62, padZ + PW / 2 - 0.45); rails.add(stripe);
  }
  /* The foot of the shaft: a receiving dock the car berths into, recessed
     into the deck with buffers and a threshold frame. Not a second platform —
     drawing a car here as well as at the surface implied two of them. */
  const carX = padX - PW / 2 - drop + PW * 0.2;
  const footWell = box(PW + 1.2, 0.9, PW + 1.2, M.deep, 'inclineFootWell');
  footWell.position.set(carX, -0.45, padZ); rails.add(footWell);
  const footDock = box(PW, 0.4, PW, M.panel, 'inclineFootDock');
  footDock.position.set(carX, -0.2, padZ); rails.add(footDock);
  for (let i = 0; i < 4; i++) {
    const buf = box(0.6, 0.7, 0.6, M.fitting, 'inclineFootBuffer' + i);
    buf.position.set(carX + (i % 2 ? 1 : -1) * (PW / 2 + 0.3), 0.35,
      padZ + (i < 2 ? 1 : -1) * (PW / 2 + 0.3));
    rails.add(buf);
  }
  cautionFrame(rails, 0.0, carX, padZ, PW + 0.6, PW + 0.6, 'inclineFootCaution');
  /* The shroud carries on INTO the underground space: a level box over the
     foot of the shaft, tying the inclined run to the transfer deck's own
     roof. Stopping the shroud at the rock line left the car arriving into
     open gallery. */
  {
    const shH = bay.h + 4.0;
    const shX0 = padX - PW / 2 - drop - PW * 0.4;
    const shX1 = carX + PW / 2 + 2.4;
    const shW = shX1 - shX0, shCX = (shX0 + shX1) / 2;
    const shRoof = box(shW, PLATE, PW + 2.6, M.deep, 'footShroudRoof');
    shRoof.position.set(shCX, shH - PLATE / 2, padZ); rails.add(markEnclosure(shRoof, 'roof'));
    [-1, 1].forEach(sd => {
      const w3 = box(shW, shH, 0.5, M.hull, 'footShroudWall' + (sd < 0 ? 'L' : 'R'));
      w3.position.set(shCX, shH / 2, padZ + sd * (PW / 2 + 1.05)); rails.add(w3);
    });
    const shEnd = box(0.5, shH, PW + 2.6, M.hull, 'footShroudEndWall');
    shEnd.position.set(shX0 + 0.25, shH / 2, padZ); rails.add(shEnd);
    for (let i = 0; i < 4; i++) {
      const rib = box(0.4, 0.4, PW + 2.8, M.fitting, 'footShroudRib' + i);
      rib.position.set(shX0 + shW * ((i + 0.5) / 4), shH - 0.6, padZ); rails.add(rib);
      const lamp = box(0.22, 0.16, 0.22, M.lit, 'footShroudLamp' + i);
      lamp.position.set(rib.position.x, shH - 1.0, padZ - PW / 2 - 0.7); rails.add(lamp);
    }
  }
  st.add(rails);

  /* ---- transfer deck and the four bays ---- */
  const deckX0 = carX - PW / 2 - 2.0;
  const deckX1 = hasHeavy ? hangX - hangW / 2 - 2.0
    : carX + PW / 2 + bayPitch * baysPerSide + 6.0;
  const deckW = deckX1 - deckX0, deckCX = (deckX0 + deckX1) / 2;
  const floor = box(deckW, DECK, deckHalfZ * 2, M.panel, 'deckFloor');
  floor.position.set(deckCX, -DECK / 2, 0); st.add(floor);
  const deckRoof = box(deckW, PLATE, deckHalfZ * 2, M.deep, 'deckRoof');
  deckRoof.position.set(deckCX, bay.h + 4.0, 0); st.add(markEnclosure(deckRoof, 'roof'));
  const deckEnd = box(PLATE, bay.h + 4.0, deckHalfZ * 2, M.hull, 'deckEndWall');
  deckEnd.position.set(deckX0 + PLATE / 2, (bay.h + 4.0) / 2, 0); st.add(deckEnd);

  /* The conveyor sits in a RECESSED trench with its rollers flush to the deck,
     so it is under the hulls it carries and out of every bay's approach
     corridor. A bed standing proud of the deck is exactly the blockage the
     station bays were pulled up for. */
  const convW = big.w * 1.15, convLen = deckX1 - carX - PW / 2;
  const trench = box(convLen, 0.9, convW + 1.2, M.deep, 'conveyorTrench');
  trench.position.set(carX + PW / 2 + convLen / 2, -0.45, 0); st.add(trench);
  const convBed = box(convLen, 0.4, convW, M.panel, 'conveyorBed');
  convBed.position.set(trench.position.x, -0.6, 0); st.add(convBed);
  const nRoll = Math.round(convLen / 2.2);
  for (let i = 0; i < nRoll; i++) {
    const roller = cyl(0.22, 0.22, convW * 0.9, M.fitting, 'conveyorRoller' + i, 8);
    roller.rotation.x = Math.PI / 2;
    roller.position.set(carX + PW / 2 + convLen * ((i + 0.5) / nRoll), -0.2, 0); st.add(roller);
  }
  [-1, 1].forEach(sd => {
    const rail = box(convLen, 0.35, 0.3, M.panel, 'conveyorRail' + (sd < 0 ? 'L' : 'R'));
    rail.position.set(trench.position.x, -0.06, sd * (convW / 2 + 0.45)); st.add(rail);
    const stripe = new T.Group(); stripe.position.set(trench.position.x, 0.14, sd * (convW / 2 + 0.9));
    cautionRun(stripe, convLen * 0.94, 0.12, 'x', 'conveyorCaution' + (sd < 0 ? 'L' : 'R')); st.add(stripe);
  });

  /* Four bays, two a side, STAGGERED in x so no bay's corridor runs into the
     bay opposite. Apertures face across the deck; the conveyor is below deck
     level, so the corridor over it is clear. */
  /* Bays start clear of the incline's own footprint: the shaft walls come down
     to deck level at its foot, and a bay opposite them has its corridor cut.
     Count comes from the size mark; the far side is staggered half a pitch so
     no bay's corridor runs into the bay opposite. */
  const bayX = Array.from({ length: baysPerSide }, (_, i) => carX + PW / 2 + 7.0 + i * bayPitch);
  const gates = [];
  const pierX = { '-1': [], '1': [] };
  [-1, 1].forEach((sd, si) => {
    bayX.forEach((bx, i) => {
      const tag = 'berthSM' + (si * baysPerSide + i);
      const x = bx + (sd < 0 ? 0 : bayPitch / 2);
      pierX[String(sd)].push(x);
      const b = berth('door', bay.w, bay.h, bay.d, tag);
      berthInterior(b, bay.w, bay.h, bay.d, rand, tag);
      b.position.set(x, bay.h / 2 + 0.1, sd * (deckHalfZ - PLATE));
      b.rotation.y = sd < 0 ? 0 : Math.PI;           // aperture faces the deck
      st.add(b);
      const hdr = box(bay.w + 2.0, 4.0 - 0.6 + 0.6, PLATE * 3, M.hull, tag + 'Header');
      hdr.position.set(x, bay.h + 0.9 + (4.0 - 0.6) / 2 - 0.4, sd * (deckHalfZ - PLATE * 1.5));
      st.add(hdr);
      const desig = box(1.9, 0.5, 0.12, M.boardLit, tag + 'Designation');
      desig.position.set(x - bay.w / 2 + 1.1, bay.h + 0.7, sd * (deckHalfZ - PLATE - 0.5)); st.add(desig);
      /* Hoarding above each bay, on its header — a hull under tow is a captive
         audience, and the header is the only real surface to hang it from. */
      const ad = box(4.4, 2.2, 0.14, (si + i) % 2 ? M.adA : M.adB, tag + 'AdPanel');
      ad.position.set(x + 1.4, bay.h + 2.4, sd * (deckHalfZ - PLATE - 0.42)); st.add(ad);
      const adFr = box(4.8, 2.5, 0.07, M.panel, tag + 'AdFrame');
      adFr.position.set(ad.position.x, ad.position.y, sd * (deckHalfZ - PLATE - 0.36)); st.add(adFr);
      gates.push({ x, z: sd * (deckHalfZ - PLATE + bay.d), tag });
    });
  });
  /* Piers carry the roof over the deck, on the MIDPOINTS between that side's
     bays and outboard of the end ones. A pier sharing a bay's x stands in the
     aperture, which is the one thing that must stay clear. */
  [-1, 1].forEach(sd => {
    const xs = pierX[String(sd)].slice().sort((a, b) => a - b);
    // outboard of the end bays, plus one on each midpoint between neighbours
    const spots = [xs[0] - (bay.w / 2 + 2.6)];
    for (let i = 0; i < xs.length - 1; i++) spots.push((xs[i] + xs[i + 1]) / 2);
    spots.push(xs[xs.length - 1] + (bay.w / 2 + 2.6));
    spots.forEach((px, i) => {
      const pier = box(3.4, bay.h + 4.0, PLATE * 4, M.hull, 'deckPier' + (sd < 0 ? 'L' : 'R') + i);
      pier.position.set(px, (bay.h + 4.0) / 2, sd * (deckHalfZ - PLATE * 2));
      st.add(pier);
    });
  });
  interiorDressing(st, { w: deckW * 0.9, h: bay.h + 4.0, d: deckHalfZ * 2, y: 0, cx: deckCX, axis: 'z',
    greebleBand: 7.0,
    lights: 6, ads: 0, greebles: 12, crates: 6, decals: 6, ports: 0, seed }, rand, 'deck');
  for (let i = 0; i < 4; i++) {
    const litOn = ((seed + i * 7) % 5) > 1;
    const p = box(0.08, 0.5, 0.8, litOn ? M.lit : M.dark, 'deckPort' + i);
    p.position.set(deckX0 + PLATE + 0.02, 1.4 + (i % 2) * 1.6, -deckHalfZ + deckHalfZ * 2 * ((i + 0.5) / 4));
    st.add(p);
  }

  /* ---- heavy berth: vertical shaft, sliding interdigitated doors, hangar ---- */
  if (hasHeavy) {
  const doors = surfaceGate(doorW, doorD, 'hangarDoor', { innerGate: 'hangarFloorGate' });
  doors.position.set(hangX, SURF + 0.3, hangZ); st.add(doors);
  const hFloor = box(hangW, DECK, hangD, M.panel, 'hangarFloor');
  hFloor.position.set(hangX, -DECK / 2, hangZ); st.add(hFloor);
  const hRoofHoles = [{ x: 0, z: 0, w: doorW + 0.6, d: doorD + 0.6 }];
  const hRoof = plateWithHoles(hangW, hangD, PLATE, hRoofHoles, M.deep, 'hangarRoof');
  hRoof.position.set(hangX, hangH, hangZ); st.add(markEnclosure(hRoof, 'roof'));
  [-1, 1].forEach(sd => {
    const wall = box(PLATE, hangH, hangD, M.hull, 'hangarWall' + (sd < 0 ? 'W' : 'E'));
    wall.position.set(hangX + sd * (hangW / 2 - PLATE / 2), hangH / 2, hangZ); st.add(wall);
    const endw = box(hangW, hangH, PLATE, M.hull, 'hangarEnd' + (sd < 0 ? 'S' : 'N'));
    endw.position.set(hangX, hangH / 2, hangZ + sd * (hangD / 2 - PLATE / 2)); st.add(endw);
  });
  // the shaft the hull is lowered down, and the platform it lands on
  for (let i = 0; i < 4; i++) {
    const gx2 = doorW / 2 + 0.5, gz2 = doorD / 2 + 0.5;
    const guide = box(0.6, hangH - 1.0, 0.6, M.fitting, 'hangarLiftGuide' + i);
    guide.position.set(hangX + (i % 2 ? gx2 : -gx2), (hangH - 1.0) / 2 + 0.5, hangZ + (i < 2 ? gz2 : -gz2));
    st.add(guide);
  }
  /* The heavy berth is an ELEVATOR PAD, not an open shaft: the car sits level
     and flush with the surface plate, filling the aperture, so the hangar
     below is never open to the sky. An L hull lands on the pad, the
     interdigitating doors close over it, and the whole platform is lowered to
     the hangar floor. */
  const liftDeck = box(doorW + 1.0, 0.9, doorD + 1.0, M.panel, 'hangarLiftPlatform');
  liftDeck.position.set(hangX, SURF - 0.45, hangZ); st.add(liftDeck);
  const liftSkirt = box(doorW + 1.6, 0.4, doorD + 1.6, M.fitting, 'hangarLiftPlatformSkirt');
  liftDeck.userData = {};
  liftSkirt.position.set(hangX, SURF - 1.05, hangZ); st.add(liftSkirt);
  const lOutline = box(big.w + 1.6, 0.08, big.d + 2.0, M.accent, 'hangarLiftOutline');
  lOutline.position.set(hangX, SURF + 0.04, hangZ); st.add(lOutline);
  const lOutlineIn = box(big.w + 0.4, 0.09, big.d + 0.6, M.deep, 'hangarLiftOutlineInner');
  lOutlineIn.position.set(hangX, SURF + 0.05, hangZ); st.add(lOutlineIn);
  for (let i = 0; i < 4; i++) {
    const clamp = box(0.9, 0.6, 0.9, M.fitting, 'hangarClamp' + i);
    clamp.position.set(hangX + (i % 2 ? 1 : -1) * (big.w / 2 + 0.4), SURF + 0.3,
      hangZ + (i < 2 ? 1 : -1) * big.d * 0.3);
    st.add(clamp);
  }
  cautionFrame(st, SURF, hangX, hangZ, doorW + 1.6, doorD + 1.6, 'hangarLiftCaution');
  liftDeck.userData.carrier = {
    kind: 'lift', level: true, idle: 'from',
    from: liftDeck.position.clone(),
    to: liftDeck.position.clone().add(new T.Vector3(0, -(SURF - 0.9), 0)),
    serves: ['L'],
    interlock: 'doorsClosedBeforeDescent'
  };
  // the parking stand the hull is moved onto once the car is down
  const stand = box(big.w + 1.6, 0.08, big.d + 2.0, M.accent, 'hangarStandOutline');
  stand.position.set(hangX, 0.05, hangZ + big.d * 0.1); st.add(stand);
  const standIn = box(big.w + 0.4, 0.09, big.d + 0.6, M.deep, 'hangarStandInner');
  standIn.position.set(hangX, 0.06, hangZ + big.d * 0.1); st.add(standIn);

  /* Airbridges onto the hull: a boom off the concourse wall with a cab at the
     end, at door height on a liner. Two of them, fore and aft. */
  [-1, 1].forEach((sd, i) => {
    const y = 3.4;
    const boomLen = hangW / 2 - big.w / 2 - 2.2;
    const boom = box(boomLen, 1.9, 2.4, M.hull, 'airbridgeBoom' + i);
    boom.position.set(hangX - hangW / 2 + PLATE + boomLen / 2, y, hangZ + sd * big.d * 0.24); st.add(boom);
    const cab = box(2.2, 2.3, 3.0, M.panel, 'airbridgeCab' + i);
    cab.position.set(hangX - big.w / 2 - 1.6, y, boom.position.z); st.add(cab);
    const cabGl = box(0.1, 0.8, 2.2, M.glass, 'airbridgeGlass' + i);
    cabGl.position.set(cab.position.x + 1.14, y + 0.3, boom.position.z); st.add(cabGl);
    const leg = box(0.7, y, 0.7, M.fitting, 'airbridgeLeg' + i);
    leg.position.set(boom.position.x + boomLen * 0.2, y / 2, boom.position.z); st.add(leg);
    const bStripe = new T.Group(); bStripe.position.set(cab.position.x, y - 1.05, boom.position.z);
    cautionRun(bStripe, 2.6, 0.1, 'z', 'airbridgeCaution' + i); st.add(bStripe);
  });

  /* Passenger concourse along the hangar's far wall: gates, seating, hoardings.
     A liner's manifest has to wait somewhere. */
  const cFloor = box(conW, DECK, conD, M.panel, 'concourseFloor');
  cFloor.position.set(conX, -DECK / 2, hangZ); st.add(cFloor);
  const cRoof = box(conW, PLATE, conD, M.deep, 'concourseRoof');
  cRoof.position.set(conX, conH, hangZ); st.add(markEnclosure(cRoof, 'roof'));
  const cWall = box(PLATE, conH, conD, M.hull, 'concourseWall');
  cWall.position.set(conX - conW / 2, conH / 2, hangZ); st.add(cWall);
  for (let i = 0; i < gateCount; i++) {
    const z = hangZ - conD / 2 + conD * ((i + 0.5) / gateCount);
    const glass = box(0.12, 2.6, conD * (0.8 / gateCount), M.glass, 'concourseGlass' + i);
    glass.position.set(conX + conW / 2 - 0.1, 1.8, z); st.add(glass);
    const gate = box(0.9, 2.4, 1.6, M.panel, 'concourseGate' + i);
    gate.position.set(conX + conW / 2 - 0.5, 1.2, z + conD * 0.11); st.add(gate);
    const num = box(0.9, 0.5, 0.12, M.boardLit, 'concourseGateNumber' + i);
    num.position.set(conX + conW / 2 - 0.42, 2.9, z + conD * 0.11); st.add(num);
    for (let k = 0; k < 3; k++) {
      const seatRow = box(1.5, 0.34, 2.2, M.fitting, 'concourseSeat' + i + k);
      seatRow.position.set(conX - conW * 0.2 + k * 1.7, 0.17, z); st.add(seatRow);
      const backRest = box(0.2, 0.8, 2.2, M.panel, 'concourseSeatBack' + i + k);
      backRest.position.set(seatRow.position.x - 0.65, 0.5, z); st.add(backRest);
    }
    const ad = box(0.12, 2.2, conD * (0.64 / gateCount), i % 2 ? M.adA : M.adB, 'concourseAd' + i);
    ad.position.set(conX - conW / 2 + 0.2, 2.4, z); st.add(ad);
    const adFr = box(0.06, 2.5, conD * (0.76 / gateCount), M.panel, 'concourseAdFrame' + i);
    adFr.position.set(conX - conW / 2 + 0.12, 2.4, z); st.add(adFr);
    const light = box(0.5, 0.16, conD * (0.72 / gateCount), M.lit, 'concourseLight' + i);
    light.position.set(conX, conH - 0.25, z); st.add(light);
  }
  const board = billboard('billboard', 5.2, 1.8, label);
  board.position.set(conX, 3.9, hangZ - conD / 2 + 0.6); board.rotation.y = Math.PI / 2;
  st.add(board);
  plinth(st, conX, board.position.z, 3.9 - 1.8 / 2 + 0.1, 0, 'concourse');

  /* Baggage line, kept separate from the cargo conveyor: a narrow belt from
     the hangar floor along the hangar's own wall into the concourse. */
  const bagLen = hangD * 0.66;
  const bagBed = box(1.6, 0.5, bagLen, M.panel, 'baggageBed');
  bagBed.position.set(hangX + hangW / 2 - 2.4, 1.0, hangZ); st.add(bagBed);
  for (let i = 0; i < Math.round(bagLen / 2.4); i++) {
    const roller = cyl(0.12, 0.12, 1.4, M.fitting, 'baggageRoller' + i, 6);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(bagBed.position.x, 1.3, hangZ - bagLen / 2 + bagLen * ((i + 0.5) / Math.round(bagLen / 2.4)));
    st.add(roller);
    const leg = box(0.3, 0.75, 0.3, M.fitting, 'baggageLeg' + i);
    leg.position.set(bagBed.position.x, 0.38, roller.position.z); st.add(leg);
  }
  for (let i = 0; i < 5; i++) {
    const cs = 0.5 + rand() * 0.4;
    const cse = box(cs, cs * 0.7, cs, i % 2 ? M.panel : M.fitting, 'baggageCase' + i);
    cse.position.set(bagBed.position.x, 1.5, hangZ - bagLen / 2 + rand() * bagLen); st.add(cse);
  }
  const bagStripe = new T.Group(); bagStripe.position.set(bagBed.position.x + 0.78, 1.28, hangZ);
  cautionRun(bagStripe, bagLen * 0.9, 0.1, 'z', 'baggageCaution'); st.add(bagStripe);
  // hangar dressing: gantry crane, lighting, hoardings, clutter
  [-1, 1].forEach(sd => {
    const railBeam = box(0.5, 0.5, hangD * 0.9, M.fitting, 'hangarCraneRail' + (sd < 0 ? 'L' : 'R'));
    railBeam.position.set(hangX + sd * (hangW / 2 - 1.4), hangH - 1.2, hangZ); st.add(railBeam);
  });
  /* The crane parks CLEAR of the door footprint: a bridge left over the shaft
     is a beam across the path a hull is lowered down. */
  const craneZ = hangZ + Math.min(hangD / 2 - 2.4, doorD / 2 + 2.2);
  const bridge = box(hangW - 2.4, 0.6, 1.6, M.panel, 'hangarCraneBridge');
  bridge.position.set(hangX, hangH - 2.0, craneZ); st.add(bridge);
  const hoist = box(1.1, 1.8, 1.1, M.fitting, 'hangarCraneHoist');
  hoist.position.set(hangX + 2.0, hangH - 3.15, craneZ); st.add(hoist);
  [-1, 1].forEach(sd => {
    const cs = new T.Group(); cs.position.set(hangX + sd * (hangW / 2 - 2.6), hangH - 2.34, craneZ);
    cautionRun(cs, 1.4, 0.11, 'z', 'hangarCraneCaution' + (sd < 0 ? 'L' : 'R')); st.add(cs);
  });
  interiorDressing(st, { w: hangW - 0.5, h: hangH, d: hangD - 0.5, y: 0, cx: hangX, cz: hangZ,
    lights: 6, ads: 4, greebles: 14, crates: 8, decals: 6, ports: 5, seed: seed + 3 }, rand, 'hangar');
  }

  /* ---- surface plant ---- */
  /* Tower off to the far side: the heavy berth now occupies the ground the
     tower used to stand on, and a tower beside a landing pad is in its
     approach anyway. */
  towerCluster(st, surfCX - 6.0, surfD / 2 - 21.0, label, rand, 'tower', SY);
  berms(st, { count: 4 + radCount * 2, w: 10.0, h: 2.2, d: 8.0, x: surfX0 + 12.0, z: 20.0,
    spread: 16.0, spreadZ: 40.0, baseY: SY }, rand, 'surface');
  for (let i = 0; i < radCount; i++) {
    radiatorBank(st, surfX1 - 14.0 - i * 7.0, -18.0 + i * 10.0, rand,
      'surfaceRad' + String.fromCharCode(65 + i), 6, SY);
  }

  st.add(rockShell({ x0: deckX0 - 3, x1: (hasHeavy ? hangX + hangW / 2 : deckX1) + 3,
    z0: -(deckHalfZ + 3), z1: deckHalfZ + 3, base: 3.0, top: SY, open: '+z', roof: false }));
  if (hasHeavy) {
    st.add(rockShell({ x0: conX - conW, x1: hangX + hangW / 2, z0: -(hangD / 2 + 3), z1: hangD / 2 + 3,
      base: 3.0, top: SY, open: '+z', thick: 5.0, roof: false }));
  }

  /* Rock over the works. Only the pads and the tower's apron stay open to the
     sky — the rest of the plate is under cover, so the site reads as a port
     cut into a mountain rather than a slab with holes in it. */
  const keepOut = [
    { x: padX, z: padZ, w: PW + 16.0, d: PW + 16.0 },
    { x: surfCX - 6.0, z: surfD / 2 - 21.0, w: 46.0, d: 44.0 },
    { x: surfX1 - 18.0, z: -14.0, w: 30.0, d: 34.0 }
  ];
  if (hasHeavy) keepOut.push({ x: hangX, z: hangZ, w: doorW + 18.0, d: doorD + 18.0 });
  terrainCover(st, { x0: surfX0 + 4.0, x1: surfX1 - 4.0, z0: -surfD / 2 + 4.0, z1: surfD / 2 - 4.0,
    baseY: SURF, rand, keepOut });

  st.userData.interiorAnchors = ['deckFloor'].concat(hasHeavy ? ['hangarFloor', 'concourseFloor'] : []);
  st.userData.site = 'pad';
  st.userData.surfaceY = SY;
  st.userData.gates = gates;
  return finish(st, 'padSite', label);
}

export const PLANETSIDE_TYPES = {
  runway: { label: 'Runway', build: buildRunwaySite, prefix: 'UP-', digits: 3 },
  mountain: { label: 'Mountain', build: buildMountainSite, prefix: 'UP-', digits: 3 },
  pad: { label: 'Mountain Pad', build: buildPadSite, prefix: 'UP-', digits: 3 }
};
