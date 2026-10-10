import * as THREE from 'three';

const stage = document.querySelector('three-d-stage');
const { THREE: T } = await stage.ready;

const COLORS = {
  hull: 0x8f9a8e,
  panel: 0x4f544c,
  glass: 0x1c2620,
  engineHousing: 0x33362f,
  glow: 0xe0b23a,
  accent: 0xd6c24a,
  policeBlue: 0x2b5fae,
  policeRed: 0xb03430
};

const matHull = new T.MeshStandardMaterial({ color: COLORS.hull, roughness: 0.6, metalness: 0.35, name: 'hullPlating' });
const matPanel = new T.MeshStandardMaterial({ color: COLORS.panel, roughness: 0.65, metalness: 0.3, name: 'hullPanel' });
const matGlass = new T.MeshStandardMaterial({ color: COLORS.glass, roughness: 0.1, metalness: 0.2, name: 'canopyGlass' });
const matEngine = new T.MeshStandardMaterial({ color: COLORS.engineHousing, roughness: 0.5, metalness: 0.4, name: 'engineHousing' });
const matGlow = new T.MeshStandardMaterial({ color: 0x2a1c0a, emissive: COLORS.glow, emissiveIntensity: 1.0, roughness: 0.9, metalness: 0.0, name: 'engineGlow' });
const matAccent = new T.MeshStandardMaterial({ color: COLORS.accent, roughness: 0.5, metalness: 0.25, name: 'accentTrim' });
const matBeaconBlue = new T.MeshStandardMaterial({ color: 0x0a1a2a, emissive: COLORS.policeBlue, emissiveIntensity: 2.5, roughness: 0.8, name: 'beaconBlue' });
const matBeaconRed = new T.MeshStandardMaterial({ color: 0x2a0a0a, emissive: COLORS.policeRed, emissiveIntensity: 2.5, roughness: 0.8, name: 'beaconRed' });
const matWing = new T.MeshStandardMaterial({ color: COLORS.panel, roughness: 0.6, metalness: 0.3, name: 'wingPlating', side: T.DoubleSide });
const matWarhead = new T.MeshStandardMaterial({ color: 0xc7c2b6, roughness: 0.4, metalness: 0.3, name: 'missileWarhead' });
// navigation hazard lights — always red to port, green to starboard, so an
// approaching pilot can tell which flank of a hull they are closing on
const matForceField = new T.MeshStandardMaterial({ color: 0x0a2a44, emissive: 0x3fa9e6, emissiveIntensity: 1.8, roughness: 0.9, transparent: true, opacity: 0.42, side: T.DoubleSide, name: 'forceField' });
/* Faction IFF codes. Colour alone fails on monochrome sensors, in shadow and
   at range, so each faction also gets a distinct lamp COUNT and spacing —
   a pattern reads correctly even when the hue does not. */
const FACTION_IFF = {
  mustard: { lamps: 3, gap: 1.7 },
  cyan: { lamps: 2, gap: 2.6 },
  hazard: { lamps: 4, gap: 1.25 },
  orange: { lamps: 3, gap: 2.5 },
  green: { lamps: 2, gap: 1.3 },
  red: { lamps: 4, gap: 1.9 }
};
let currentFaction = 'mustard';
const matFactionBeacon = new T.MeshStandardMaterial({ color: 0x1a1a12, emissive: 0xd6c24a, emissiveIntensity: 2.8, roughness: 0.7, name: 'factionBeacon' });
const matNavyHull = new T.MeshStandardMaterial({ color: 0x5f7185, roughness: 0.55, metalness: 0.4, name: 'navyHullPlating' });
const matNavyPanel = new T.MeshStandardMaterial({ color: 0x445366, roughness: 0.6, metalness: 0.35, name: 'navyHullPanel' });
const matNavyWing = new T.MeshStandardMaterial({ color: 0x445366, roughness: 0.6, metalness: 0.3, name: 'navyWingPlating', side: T.DoubleSide });
const matTankInsulation = new T.MeshStandardMaterial({ color: 0xcfd2c8, roughness: 0.8, metalness: 0.1, name: 'tankInsulation' });
const matTankInsulationBlue = new T.MeshStandardMaterial({ color: 0x9db4c9, roughness: 0.8, metalness: 0.1, name: 'tankInsulationBlue' });
const matTankInsulationRed = new T.MeshStandardMaterial({ color: 0xc9a3a0, roughness: 0.8, metalness: 0.1, name: 'tankInsulationRed' });
const matValveRed = new T.MeshStandardMaterial({ color: 0xb03430, roughness: 0.5, metalness: 0.2, name: 'valveIndicator' });
const matCockpitShell = new T.MeshStandardMaterial({ color: 0x24261f, roughness: 0.75, metalness: 0.15, name: 'cockpitShell' });
const matSeat = new T.MeshStandardMaterial({ color: 0x35342c, roughness: 0.85, metalness: 0.05, name: 'pilotSeatMat' });
const matMfdSlot = new T.MeshStandardMaterial({ color: 0x0c0d09, roughness: 0.3, metalness: 0.2, name: 'mfdSlotBlank' });
const matHudGlass = new T.MeshStandardMaterial({ color: 0xaeb8ad, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.32, name: 'hudCombinerGlass' });
const matDishSurface = new T.MeshStandardMaterial({ color: 0x4a5a6c, roughness: 0.7, metalness: 0.25, side: T.DoubleSide, name: 'dishSurface' });
const matDishLiner = new T.MeshStandardMaterial({ color: 0x2f3a46, roughness: 0.55, metalness: 0.3, side: T.DoubleSide, name: 'dishLiner' });
const matStrobe = new T.MeshStandardMaterial({ color: 0x2a2a26, emissive: 0xf2f4ee, emissiveIntensity: 2.4, roughness: 0.6, name: 'strobeWhite' });
const matNavRed = new T.MeshStandardMaterial({ color: 0x2a0808, emissive: 0xd8352a, emissiveIntensity: 2.6, roughness: 0.6, name: 'navLightRed' });
const matNavGreen = new T.MeshStandardMaterial({ color: 0x082a10, emissive: 0x2fbf4f, emissiveIntensity: 2.6, roughness: 0.6, name: 'navLightGreen' });
const matCabinLight = new T.MeshStandardMaterial({ color: 0x3a2f18, emissive: 0xf2c877, emissiveIntensity: 1.6, roughness: 0.6, name: 'cabinLight' });
const matCabinDark = new T.MeshStandardMaterial({ color: 0x14100a, emissive: 0x1c1810, emissiveIntensity: 0.15, roughness: 0.7, name: 'cabinDark' });
// shipping containers: muted, desaturated reds / blues / greens, plus a neutral
const CARGO_MATS = [
  new T.MeshStandardMaterial({ color: 0x8a5a54, roughness: 0.7, metalness: 0.2, name: 'cargoRed' }),
  new T.MeshStandardMaterial({ color: 0x55697d, roughness: 0.7, metalness: 0.2, name: 'cargoBlue' }),
  new T.MeshStandardMaterial({ color: 0x5c7a60, roughness: 0.7, metalness: 0.2, name: 'cargoGreen' }),
  new T.MeshStandardMaterial({ color: 0x9a6f56, roughness: 0.7, metalness: 0.2, name: 'cargoRust' }),
  new T.MeshStandardMaterial({ color: 0x6b7d86, roughness: 0.7, metalness: 0.2, name: 'cargoSlate' }),
  new T.MeshStandardMaterial({ color: 0x7a7d78, roughness: 0.7, metalness: 0.2, name: 'cargoGrey' })
];
// deterministic seed from a ship ID string (e.g. "PL-40213"), so re-rolling the
// ID changes which compartments read as occupied without needing external state
function seedFromId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return function next() { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
}

const matHazardYellow = new T.MeshStandardMaterial({ color: 0xe3c11c, roughness: 0.6, metalness: 0.2, name: 'cautionYellow' });
const matHazardBlack = new T.MeshStandardMaterial({ color: 0x16160f, roughness: 0.7, metalness: 0.2, name: 'cautionBlack' });

const RADIAL = 8;

function box(w, h, d, mat, name) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, name, segs = RADIAL) {
  const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, segs), mat);
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  return m;
}
/* Landing gear — one uniform assembly, pose-driven.
 *
 * Every leg is built identically regardless of where it sits on the hull, so
 * there is no per-ship or per-position hinge special-casing to debug:
 *
 *   bayPlate   a dark recessed rectangle in the belly skin (the bay opening)
 *   doorPivot  hinged along the bay's AFT edge, its panel extending forward so
 *              that rotation 0 lies flat over the opening (CLOSED). Rotating
 *              +X swings the free forward edge down and clear (OPEN).
 *   strutPivot at the bay centre: holds strut, drag brace and foot. Its
 *              deployed pose splays outboard; stowed it folds flat and scales
 *              down so the leg disappears into the bay.
 *
 * Pose is a single scalar t: 0 = fully stowed (gear UP, door closed),
 * 1 = fully deployed (gear DOWN, door open). applyGearPose() sets it,
 * setGearDeployed() tweens it. Nothing else touches gear transforms.
 */
const GEAR_DOOR_OPEN = 1.95;   // radians the door swings clear of the bay
const GEAR_STOW_SCALE = 0.06;  // how small the folded leg collapses

function landingLeg(name, x, z, legLength, footR = 0.13, strutR = 0.05, splay = 0.42, baseY = 0) {
  const grp = new T.Group(); grp.name = name;
  const sideways = Math.abs(x) > 0.01;
  const bayW = Math.max(strutR * 4.2, footR * 2.1), bayLen = bayW * 1.15;

  // bay opening: dark plate flush in the belly skin
  const bayPlate = box(bayW, 0.05, bayLen, matEngine, 'gearBayPlate');
  bayPlate.position.y = -0.015; grp.add(bayPlate);
  // hazard striping along the bay lips — moving structure
  [-1, 1].forEach(sd => {
    const tiles = 4, tileLen = bayLen / tiles;
    for (let i = 0; i < tiles; i++) {
      // flat on the bay plate's underside so the markings read from below
      const t = box(bayW * 0.2, 0.02, tileLen * 0.92,
        i % 2 === 0 ? matHazardYellow : matHazardBlack, 'bayCaution' + (sd < 0 ? 'L' : 'R') + i);
      t.position.set(sd * (bayW * 0.38), -0.05, -bayLen / 2 + tileLen * (i + 0.5));
      grp.add(t);
    }
  });

  // door: hinged on the bay's aft edge, panel reaching forward across the opening
  const doorPivot = new T.Group(); doorPivot.name = 'gearDoorHinge';
  doorPivot.position.set(0, -0.048, -bayLen / 2);   // clear of the plate's bottom face (no coplanar z-fight)
  const door = box(bayW * 0.98, 0.02, bayLen, matPanel, 'gearBayDoor');
  door.position.z = bayLen / 2;          // closed pose covers the opening exactly
  doorPivot.add(door);
  grp.add(doorPivot);
  // keep the swung door's free edge above the foot: past vertical if need be
  const maxSin = (legLength + 0.02 - 0.048) / bayLen;
  let doorOpen = GEAR_DOOR_OPEN;
  if (Math.sin(doorOpen) > maxSin) {
    doorOpen = Math.min(2.5, Math.PI - Math.asin(Math.max(0.05, Math.min(1, maxSin))));
  }

  // strut assembly
  const strutPivot = new T.Group(); strutPivot.name = 'gearStrutHinge';
  const strut = cyl(strutR, strutR * 1.25, legLength, matEngine, 'gearStrut', 6);
  strut.position.y = -legLength / 2;
  strutPivot.add(strut);
  const brace = cyl(strutR * 0.55, strutR * 0.55, legLength * 0.72, matEngine, 'gearBrace', 6);
  brace.position.y = -legLength * 0.34;
  brace.rotation.x = sideways ? 0 : 0.55;
  brace.rotation.z = sideways ? -Math.sign(x) * 0.5 : 0;
  strutPivot.add(brace);
  const foot = cyl(footR, footR * 1.15, 0.06, matPanel, 'gearFoot', 8);
  foot.position.y = -legLength - 0.03;
  strutPivot.add(foot);
  grp.add(strutPivot);

  grp.position.set(x, baseY, z);   // baseY = the hull's belly plane

  // deployed splay: side legs cant outboard, centreline legs rake fore/aft
  const splayX = sideways ? 0 : (z > 0 ? -splay : splay);
  const splayZ = sideways ? Math.sign(x) * splay : 0;
  grp.userData.isLandingGear = true;
  grp.userData.gear = { strutPivot, doorPivot, foot, splayX, splayZ, doorOpen };
  applyLegPose(grp.userData.gear, 1);   // ships are built with gear down
  return grp;
}

// t: 0 = stowed (door shut, leg folded away), 1 = deployed (door open, leg down)
function applyLegPose(g, t) {
  g.strutPivot.rotation.x = g.splayX * t;
  g.strutPivot.rotation.z = g.splayZ * t;
  g.strutPivot.scale.setScalar(GEAR_STOW_SCALE + (1 - GEAR_STOW_SCALE) * t);
  g.foot.rotation.x = -g.splayX * t;    // keep the pad flat on the ground
  g.foot.rotation.z = -g.splayZ * t;
  g.doorPivot.rotation.x = (g.doorOpen || GEAR_DOOR_OPEN) * t;
}

function gearLegs(ship) {
  const legs = [];
  ship.traverse(n => { if (n.userData && n.userData.isLandingGear) legs.push(n.userData.gear); });
  return legs;
}
/* Some hulls have no legs at all but still have a gear cycle — a capital ship
   closes its keel doors and raises bay force fields instead of putting feet
   down. Those are registered as effectors driven by the same pose scalar. */
function gearEffectors(ship) {
  const fx = [];
  ship.traverse(n => { if (n.userData && n.userData.gearEffector) fx.push(n.userData.gearEffector); });
  return fx;
}
// instant pose, no animation
export function applyGearPose(ship, t) {
  gearLegs(ship).forEach(g => applyLegPose(g, t));
  gearEffectors(ship).forEach(f => f(t));
}
// animated toggle; a newer call supersedes any in-flight one
let gearAnimGen = 0;
export function setGearDeployed(ship, deployed, duration = 2600) {
  const myGen = ++gearAnimGen;
  const legs = gearLegs(ship);
  const fx = gearEffectors(ship);
  const from = legs.map(g => g.doorPivot.rotation.x / (g.doorOpen || GEAR_DOOR_OPEN)); // current t per leg
  const fromFx = ship.userData.gearPose !== undefined ? ship.userData.gearPose : 1;
  const target = deployed ? 1 : 0;
  const t0 = performance.now();
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function step(now) {
    if (myGen !== gearAnimGen) return;
    const e = ease(Math.min(1, (now - t0) / duration));
    legs.forEach((g, i) => applyLegPose(g, from[i] + (target - from[i]) * e));
    const tf = fromFx + (target - fromFx) * e;
    ship.userData.gearPose = tf;
    fx.forEach(f => f(tf));
    if (e < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
/* Yellow/black caution ring — alternating shell segments rather than a texture,
 * so the striping survives OBJ/GLB export. Used around exhaust apertures and
 * anywhere crew could be caught by moving structure. */
function cautionRing(name, radius, band, segments = 10) {
  const grp = new T.Group(); grp.name = name;
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const geo = new T.CylinderGeometry(radius, radius, band, 4, 1, true, i * step, step);
    const m = new T.Mesh(geo, i % 2 === 0 ? matHazardYellow : matHazardBlack);
    m.name = name + 'Seg' + i; m.castShadow = true; m.receiveShadow = true;
    m.rotation.x = Math.PI / 2;
    grp.add(m);
  }
  return grp;
}
/* Engine cluster tiling. Returns nozzle centre offsets that pack without
 * overlap in one of three configurations:
 *   square       — even grid, rows centred
 *   hexagonal    — rows at sqrt(3)/2 pitch, counts alternating by one so
 *                  nozzles nest into the gaps of the row below
 *   trapezoidal  — wide base row, narrower row above
 * EVERY row is centred on x = 0, so any count comes out bilaterally symmetric
 * about the ship's centreline. Pitch derives from the nozzle radius and clears
 * the intake/caution flanges at ~1.06r each.
 */
function engineCluster(config, count, r, rowsHint) {
  // the nacelle housing flares to 1.1r at its aft end, so centres need >= 2.2r.
  // hex rows sit at sqrt(3)/2 of the pitch, so hex needs a wider pitch again.
  const pitch = r * (config === 'hexagonal' ? 2.62 : 2.36);
  const out = [];
  const rowsFor = n => rowsHint || (n <= 3 ? 1 : n <= 8 ? 2 : 3);
  const emit = (n, y) => { for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * pitch, y }); };
  if (config === 'hexagonal') {
    const rows = rowsFor(count), rowPitch = pitch * Math.sqrt(3) / 2;
    // split into rows whose counts differ by one where possible, so a row's
    // nozzles sit in the gaps of its neighbour while both stay centred
    const counts = [];
    let left = count;
    for (let ri = 0; ri < rows; ri++) {
      let n = Math.round(left / (rows - ri));
      if (ri > 0 && counts[ri - 1] % 2 === n % 2 && n > 1 && left - n >= rows - ri - 1) n -= 1;
      n = Math.max(1, Math.min(n, left));
      counts.push(n); left -= n;
    }
    if (left > 0) counts[counts.length - 1] += left;
    counts.forEach((n, ri) => emit(n, (ri - (counts.length - 1) / 2) * rowPitch));
  } else if (config === 'trapezoidal') {
    if (count <= 3 || rowsFor(count) === 1) emit(count, 0);
    else {
      const base = Math.ceil((count + 1) / 2), top = count - base;
      emit(base, -0.5 * pitch * 1.06);
      emit(top, 0.5 * pitch * 1.06);
    }
  } else {
    const rows = rowsFor(count), cols = Math.ceil(count / rows);
    let placed = 0;
    for (let ri = 0; ri < rows && placed < count; ri++) {
      const n = Math.min(cols, count - placed);
      emit(n, (ri - (rows - 1) / 2) * pitch);
      placed += n;
    }
  }
  return out;
}
/* Stern drive fit-out — a tessellated drive bank on one engine bay block.
 *
 * Three large nozzles set the rhythm, with smaller ones tucked into the gaps
 * between them (and, where the count allows, an outboard pair). The large
 * pitch is 3.3x the large radius precisely so a small nozzle fits the gap, and
 * the large radius is solved from the stern's available width — sizing the
 * nozzles first and spacing them afterwards is what made earlier banks tiny.
 *
 * Everything sits on the hull's centreline in one row, on a single block whose
 * envelope matches the bank, with each short drive on its own mounting prism.
 */
function mountEngineCluster(ship, config, count, r, nacLen, sternY, sternZ, hullHeight, hullRearZ, hullWidth) {
  const roomY = Math.max(0.001, hullHeight || sternY * 2);
  const roomX = hullWidth ? hullWidth * 0.94 : roomY * 1.6;

  const largeN = Math.max(1, Math.min(3, count));
  const LP = 3.3;                                  // large pitch, in units of rL
  const rS_RATIO = 0.46;
  /* Decide the layout BEFORE solving the radius, then solve the radius against
     the full bank envelope — including any outboard pair. Sizing first and
     clamping only the block afterwards is what let outboard nozzles cantilever
     past both the block and the hull side. */
  const gapCount = largeN - 1;
  const extras = Math.max(0, count - largeN);
  const useGaps = extras > 0 && gapCount > 0;
  const useOutboard = extras - (useGaps ? gapCount : 0) > 0;
  const halfSpanUnits = useOutboard
    ? ((largeN - 1) / 2) * LP + LP * 0.5 + rS_RATIO * 1.12
    : ((largeN - 1) / 2) * LP + 1.12;
  const rL = Math.min(r, roomX / (halfSpanUnits * 2), roomY / 2.35);
  const rS = rL * rS_RATIO;
  const pitch = LP * rL;

  const large = [];
  for (let i = 0; i < largeN; i++) large.push((i - (largeN - 1) / 2) * pitch);
  // smaller drives fill the gaps between the large ones, always in mirrored
  // pairs — an odd leftover in a single gap reads as a mistake
  const small = [];
  if (useGaps) for (let i = 0; i < large.length - 1; i++) small.push((large[i] + large[i + 1]) / 2);
  if (useOutboard) {
    const out = Math.max(...large.map(Math.abs)) + pitch * 0.5;
    small.push(-out, out);
  }

  const podRear = sternZ + nacLen / 2;
  // block envelope covers the whole bank; the bank was solved to fit roomX,
  // so no clamping is needed and nothing can hang off a corner
  const outerIsSmall = useOutboard;
  const halfW = Math.max(...large.concat(small).map(Math.abs)) + (outerIsSmall ? rS : rL) * 1.12;
  // block stands exactly two large-nozzle radii tall, so the biggest drives
  // are flush top and bottom with it and every nozzle is absorbed into it
  const halfH = rL;
  const lift = Math.max(0, -(hullHeight || 1) * 0.12 - (sternY - rL * 1.2));
  const baseY = sternY + Math.min(lift, Math.max(0, (hullHeight || Infinity) - (sternY + rL * 1.2)));

  const shortLen = nacLen * 0.58;
  const blkLen = nacLen - shortLen;
  const podDepth = blkLen + 0.12, podCenterZ = podRear - blkLen / 2 + 0.08;
  if (hullRearZ !== undefined) {
    const pod = box(halfW * 2, halfH * 2, podDepth, matPanel, 'engineBayExtension');
    pod.position.set(0, baseY, podCenterZ);
    ship.add(pod);
    [-1, 1].forEach(sd => {
      const rib = box(halfW * 2.04, 0.07, 0.1, matEngine, 'engineBayRib' + (sd < 0 ? 'Lower' : 'Upper'));
      rib.position.set(0, baseY + sd * (halfH - 0.052), podCenterZ);
      ship.add(rib);
    });
  }

  large.forEach((x, i) => {
    const e = engineNacelle('engine' + i, rL, nacLen, rL * 0.72);
    e.position.set(x, baseY, sternZ);
    ship.add(e);
  });
  small.forEach((x, i) => {
    const e = engineNacelle('engineAux' + i, rS, shortLen, rS * 0.72);
    e.position.set(x, baseY, podRear - (nacLen - shortLen) - shortLen / 2);
    ship.add(e);
  });

  /* Propellant feed: a spine header across the top of the block with a short
     drop line and an inline pump body over each nozzle, so the bank visibly
     receives fuel from inside the hull rather than being bolted on dry. */
  if (hullRearZ !== undefined) {
    const headerY = baseY + halfH + 0.05;
    const header = cyl(0.045, 0.045, halfW * 1.9, matEngine, 'propellantHeader', 8);
    header.rotation.z = Math.PI / 2;
    header.position.set(0, headerY, podCenterZ);
    ship.add(header);
    const trunk = box(0.1, 0.1, podDepth * 0.8, matEngine, 'propellantTrunk');
    trunk.position.set(0, headerY, podCenterZ + podDepth * 0.5);
    ship.add(trunk);
    large.concat(small).forEach((x, i) => {
      const drop = box(0.05, halfH * 0.55, 0.07, matEngine, 'propellantDrop' + i);
      drop.position.set(x, headerY - halfH * 0.28, podCenterZ);
      ship.add(drop);
      const pump = box(0.1, 0.1, 0.1, matPanel, 'propellantPump' + i);
      pump.position.set(x, headerY - 0.02, podCenterZ - 0.02);
      ship.add(pump);
    });
  }
}
function engineNacelle(name, r, len, glowR) {
  const grp = new T.Group(); grp.name = name;
  const housing = cyl(r, r * 1.1, len, matEngine, 'engineHousing');
  housing.rotation.x = Math.PI / 2;
  grp.add(housing);
  const ring = cyl(r * 1.05, r * 1.05, 0.07, matPanel, 'engineIntakeRing');
  ring.rotation.x = Math.PI / 2; ring.position.z = len / 2 - 0.01;
  grp.add(ring);
  const glow = cyl(glowR * 0.5, glowR * 0.5, 0.035, matGlow, 'engineGlow');
  glow.rotation.x = Math.PI / 2; glow.position.z = -len / 2 - 0.015;
  grp.add(glow);
  const caution = cautionRing('exhaustCaution', r * 1.06, Math.min(0.1, len * 0.14));
  caution.position.z = -len / 2 + Math.min(0.1, len * 0.14) / 2;
  grp.add(caution);
  return grp;
}
/* Throttle: 0 = station-keeping RCS trickle, 1 = full burn. Scales the
   aperture and its emission rather than showing one fixed full-throttle flare. */
export function setThrust(level) {
  const t = Math.max(0, Math.min(1, level));
  matGlow.emissiveIntensity = 0.35 + t * 2.6;
  return 0.6 + t * 0.9;
}
// slung nacelle: nose cone, cylindrical body, engine bell aft — hangs on a pylon
function wingNacelle(name, r, len, pylonH, pylonDown) {
  const grp = new T.Group(); grp.name = name;
  const cone = cyl(r, r * 0.07, len * 0.44, matHull, 'nacelleNoseCone');
  cone.rotation.x = -Math.PI / 2; cone.position.z = len * 0.4; grp.add(cone);
  const body = cyl(r, r, len * 0.4, matHull, 'nacelleBody');
  body.rotation.x = Math.PI / 2; grp.add(body);
  const bellLen = len * 0.22, bellZ = -len * 0.3;
  const bell = cyl(r, r * 0.8, bellLen, matEngine, 'nacelleEngineBell');
  bell.rotation.x = Math.PI / 2; bell.position.z = bellZ; grp.add(bell);
  // seat the aperture on the bell's real rear face, biting in slightly
  const glowT = 0.035, bellRear = bellZ - bellLen / 2;
  const glow = cyl(r * 0.32, r * 0.32, glowT, matGlow, 'engineGlow');
  glow.rotation.x = Math.PI / 2; glow.position.z = bellRear - glowT / 2 + 0.004; grp.add(glow);
  const band = Math.min(0.09, len * 0.05);
  const caution = cautionRing('exhaustCaution', r * 0.86, band);
  caution.position.z = bellRear + band / 2;
  grp.add(caution);
  // pylon top must reach the wing underside: placement puts the nacelle centre at
  // (wing underside - pylonH - r), so the pylon spans r + pylonH plus a little bite
  const pylon = box(r * 0.5, pylonH + r + 0.05, len * 0.3, matEngine, 'nacellePylon');
  pylon.position.y = ((r + pylonH) / 2 + 0.025) * (pylonDown ? -1 : 1); grp.add(pylon);
  // real extents along z (the cone reaches well past the nominal len/2)
  grp.userData.frontOffset = len * 0.46;
  grp.userData.rearOffset = glow.position.z - glowT / 2;
  grp.userData.actualLen = grp.userData.frontOffset - grp.userData.rearOffset;
  return grp;
}
// canopy: raked windshield at the front, flat crown, fastback taper to the rear
function wedgeCockpit(name, width, height, length, mat) {
  const shape = new T.Shape();
  shape.moveTo(-length / 2, 0);                      // tail-bottom (shape -x maps aft)
  shape.lineTo(-length / 2 + length * 0.22, height);  // short fastback taper up to the crown
  shape.lineTo(length / 2 - length * 0.34, height);   // crown
  shape.lineTo(length / 2, 0);                       // long raked windshield down to the nose
  shape.lineTo(-length / 2, 0);
  const geo = new T.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  const mesh = new T.Mesh(geo, mat || matHull);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
/* Cockpit glass mounted on the FRONT face of a ship's forwardmost protruding
 * section, raked so its top edge leans aft — the pane faces into the direction
 * of travel. Sized from the host mesh it is fitted to, so every class gets a
 * correctly proportioned screen without per-ship hand tuning. */
/* Faceted canopy: a lofted shell with a flat floor and a flat crown, and
 * five upright facets between them — port and starboard side lights, plus
 * three forward panes (roughly 10, 12 and 2 o'clock). The top ring is pushed
 * FORWARD of the bottom ring so every forward facet rakes away from the
 * pilot's head, which is what kills reflections on a real screen. */
function facetedCanopy(name, width, depth, height, forwardRake, mat) {
  const w = width / 2, d = depth / 2;
  // plan-view outline, counter-clockwise from the rear-right corner
  /* Wound counter-clockwise as seen from OUTSIDE (i.e. left-rear → left-front
     → right-front → right-rear), so the side-wall and cap emission below
     produce outward-facing triangles. Reversing this array flips the whole
     shell inside-out: every face back-faces, gets culled by FrontSide
     materials, and exports with inverted normals. */
  const plan = [
    [-w, -d], [-w, d * 0.2], [-w * 0.42, d], [w * 0.42, d], [w, d * 0.2], [w, -d]
  ];
  const bottom = plan.map(([x, z]) => [x, 0, z]);
  const top = plan.map(([x, z]) => [x * 0.9, height, z + forwardRake]);
  const pos = [];
  const push = (a, b, c) => { pos.push(...a, ...b, ...c); };
  for (let i = 0; i < plan.length; i++) {
    const j = (i + 1) % plan.length;
    push(bottom[i], bottom[j], top[j]);
    push(bottom[i], top[j], top[i]);
  }
  for (let i = 1; i < plan.length - 1; i++) {
    push(top[0], top[i], top[i + 1]);              // crown
    push(bottom[0], bottom[i + 1], bottom[i]);     // floor
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, mat || matGlass);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function mountProwGlass(ship, hostName, wFrac = 0.78, hFrac = 0.55, rake = 0.5) {
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName) host = n; });
  if (!host) return null;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const w = (b.max.x - b.min.x) * wFrac;
  const h = (b.max.y - b.min.y) * hFrac;
  const depth = h * 0.9;
  const glass = facetedCanopy('cockpitGlass', w, depth, h, h * Math.sin(rake) * 0.7, matGlass);
  const cy = (b.min.y + b.max.y) / 2 - h * 0.38;
  const cx = (b.min.x + b.max.x) / 2;            // track the host block, which may be offset
  // seated so the rear of the canopy floor bites into the host's front face
  glass.position.set(cx, cy, b.max.z - depth * 0.42);
  ship.add(glass);
  return glass;
}
// space-plane wing: trapezoidal planform, moderate leading-edge sweep,
// root at local x=0, tip at local x=span (mounted as a mirrored pair)
function deltaWingPair(namePrefix, halfBodyWidth, span, rootChord, tipChord, thickness, y, z) {
  const tipTE = -rootChord / 2 - 0.05;
  const shape = new T.Shape();
  shape.moveTo(0, rootChord / 2);
  shape.lineTo(0, -rootChord / 2);
  shape.lineTo(span, tipTE);
  shape.lineTo(span, tipTE + tipChord);
  shape.lineTo(0, rootChord / 2);
  const geo = new T.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(Math.PI / 2);
  const right = new T.Mesh(geo, matWing);
  right.name = namePrefix + 'Right'; right.castShadow = true; right.receiveShadow = true;
  right.position.set(halfBodyWidth, y, z);
  const left = new T.Mesh(geo, matWing);
  left.name = namePrefix + 'Left'; left.castShadow = true; left.receiveShadow = true;
  left.position.set(-halfBodyWidth, y, z);
  left.scale.x = -1;
  const grp = new T.Group();
  grp.add(right, left);
  return grp;
}
// vertical stabilizer: swept leading edge angled back to the tip, base at local y=0
function finPlate(name, thickness, height, rootChord, sweep, mat) {
  const shape = new T.Shape();
  shape.moveTo(-rootChord / 2, 0);                    // base trailing edge
  shape.lineTo(rootChord / 2, 0);                     // base leading edge
  shape.lineTo(rootChord / 2 - sweep, height);        // tip leading edge, raked back
  shape.lineTo(-rootChord / 2 + rootChord * 0.1, height); // tip trailing edge
  shape.lineTo(-rootChord / 2, 0);
  const geo = new T.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateY(-Math.PI / 2);
  const mesh = new T.Mesh(geo, mat || matPanel);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
// tapered superstructure block: raked forward face, narrower crown — base at local y=0
function slopedBlock(name, width, height, baseChord, topChord, frontRake, mat) {
  const topFront = baseChord / 2 - frontRake;
  const shape = new T.Shape();
  shape.moveTo(-baseChord / 2, 0);
  shape.lineTo(baseChord / 2, 0);
  shape.lineTo(topFront, height);
  shape.lineTo(topFront - topChord, height);
  shape.lineTo(-baseChord / 2, 0);
  const geo = new T.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  const mesh = new T.Mesh(geo, mat || matPanel);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
// one flat wing panel, root at local x=0 running outboard to x=span
function wingPlate(name, span, rootChord, tipChord, thickness, mat) {
  const tipTE = -rootChord / 2 - 0.05;
  const shape = new T.Shape();
  shape.moveTo(0, rootChord / 2);
  shape.lineTo(0, -rootChord / 2);
  shape.lineTo(span, tipTE);
  shape.lineTo(span, tipTE + tipChord);
  shape.lineTo(0, rootChord / 2);
  const geo = new T.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(Math.PI / 2);
  const mesh = new T.Mesh(geo, mat || matWing);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
/* Kinked wing pair: the inner `kink` fraction of span stays horizontal, the
   outer panel breaks upward (positive dihedral) or downward (negative).
   Returns the group plus the world offsets of the outer panel's upper surface,
   so nacelle pylons can be hung off it. */
function kinkedWingPair(prefix, halfBodyWidth, span, rootChord, midChord, tipChord, thickness, y, z, dihedral, kink, mat) {
  const grp = new T.Group();
  const innerSpan = span * kink, outerSpan = span * (1 - kink);
  // inner's tip chord-center (its own local coords, i.e. offset from position z)
  const innerTipCenter = (-rootChord / 2 - 0.05) + midChord / 2;
  // outer's root chord-center is 0 by construction (symmetric around its own root) —
  // so shifting outer's z by innerTipCenter seats its root exactly where inner's tip is
  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'Left' : 'Right';
    const inner = wingPlate(prefix + 'Inner' + side, innerSpan, rootChord, midChord, thickness, mat);
    inner.position.set(sd * halfBodyWidth, y, z);
    if (sd < 0) inner.scale.x = -1;
    grp.add(inner);
    const outer = wingPlate(prefix + 'Outer' + side, outerSpan, midChord, tipChord, thickness, mat);
    outer.position.set(sd * (halfBodyWidth + innerSpan), y, z + innerTipCenter);
    if (sd < 0) outer.scale.x = -1;
    outer.rotation.z = sd * dihedral;
    grp.add(outer);
  });
  return {
    group: grp,
    // z of the outer panel's leading edge at its tip station
    tipLeadingZ: z + innerTipCenter + (-midChord / 2 - 0.05 + tipChord),
    // surface point at fraction `p` along the outer panel
    mount(p) {
      return {
        dx: halfBodyWidth + innerSpan + outerSpan * p * Math.cos(dihedral),
        dy: y + outerSpan * p * Math.sin(dihedral) + thickness / 2,
        dz: innerTipCenter
      };
    }
  };
}
// uneven hexagonal prism, tapering toward the top — base at local y=0
function taperedHexPrism(name, baseRadii, topScale, height, mat) {
  const step = Math.PI / 3;
  const bottom = baseRadii.map((r, i) => new T.Vector3(r * Math.cos(i * step), 0, r * Math.sin(i * step)));
  const top = baseRadii.map((r, i) => new T.Vector3(r * topScale * Math.cos(i * step), height, r * topScale * Math.sin(i * step)));
  const pos = [];
  const push = v => pos.push(v.x, v.y, v.z);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    push(bottom[i]); push(bottom[j]); push(top[i]);
    push(bottom[j]); push(top[j]); push(top[i]);
  }
  for (let i = 1; i < 5; i++) { push(bottom[0]); push(bottom[i + 1]); push(bottom[i]); }
  for (let i = 1; i < 5; i++) { push(top[0]); push(top[i]); push(top[i + 1]); }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, mat);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
/* Rectilinear engine shroud: a square-section tube encircling the drive bank
 * co-axially, standing off the nozzles on struts, with service greebles and
 * yellow/black caution striping around both mouths. Derived from the bank's
 * measured bounds so it fits whatever cluster the hull ended up with. */
function mountEngineShroud(ship, tag, mat, hullRearZ) {
  /* Envelope comes from the NOZZLES only. The engine bay block runs forward to
     the hull's aft face by design, so folding it into the bounds pushed the
     tube's forward mouth in under anything parked on the stern deck (it drove
     straight through the H2 hauler's aftmost pressure tank). The struts bridge
     whatever gap is left back to the block. */
  const b = new T.Box3(); let found = false;
  ship.traverse(n => {
    if (n.isMesh) return;
    if (!/^engine\d+$|^engineAux\d+$/.test(n.name)) return;
    n.traverse(m => { if (m.isMesh) { m.updateWorldMatrix(true, false); b.union(new T.Box3().setFromObject(m)); found = true; } });
  });
  if (!found) return null;

  const grp = new T.Group(); grp.name = 'engineShroud';
  const clear = 0.09, t = 0.07;
  const hw = Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) + clear;
  const cy = (b.min.y + b.max.y) / 2;
  const hh = (b.max.y - b.min.y) / 2 + clear;
  const zAft = b.min.z - 0.13;
  // never reach forward past the hull's own stern plate
  const zFore = hullRearZ !== undefined
    ? Math.min(b.max.z + 0.03, hullRearZ - 0.04)
    : b.max.z + 0.03;
  const dz = zFore - zAft, cz = (zAft + zFore) / 2;

  // four plates forming the tube
  [1, -1].forEach((sy, i) => {
    const plate = box(hw * 2 + t * 2, t, dz, mat, 'shroudPlate' + (sy > 0 ? 'Top' : 'Bottom'));
    plate.position.set(0, cy + sy * (hh + t / 2), cz); grp.add(plate);
  });
  [1, -1].forEach(sx => {
    const plate = box(t, hh * 2, dz, mat, 'shroudPlate' + (sx > 0 ? 'Right' : 'Left'));
    plate.position.set(sx * (hw + t / 2), cy, cz); grp.add(plate);
  });
  // struts tying the tube back to the drive bank
  [1, -1].forEach(sx => [1, -1].forEach(sy => {
    const strut = box(clear + t, t * 0.8, 0.12, matEngine, 'shroudStrut' + (sx > 0 ? 'R' : 'L') + (sy > 0 ? 'U' : 'D'));
    strut.position.set(sx * (hw - clear / 2), cy + sy * hh * 0.6, cz + dz * 0.2); grp.add(strut);
  }));
  // service greebles along the flanks of the tube
  for (let i = 0; i < 3; i++) {
    const z = cz - dz * 0.3 + i * dz * 0.3;
    [1, -1].forEach(sx => {
      const g = box(0.07, hh * 0.4, dz * 0.12, i % 2 ? matPanel : matEngine, 'shroudGreeble' + i + (sx > 0 ? 'R' : 'L'));
      g.position.set(sx * (hw + t), cy + hh * 0.2, z); grp.add(g);
      const cond = box(0.05, 0.05, dz * 0.5, matEngine, 'shroudConduit' + i + (sx > 0 ? 'R' : 'L'));
      cond.position.set(sx * (hw + t), cy - hh * 0.55, cz); grp.add(cond);
    });
  }
  // caution striping ringing both mouths
  [[zAft + 0.06, 'Aft'], [zFore - 0.06, 'Fore']].forEach(([sz, nm]) => {
    /* Each of the four sides is tiled independently with a whole number of
       chips. The previous version walked the whole perimeter as one
       parametric loop, which produced oversized chips that straddled the
       corners and stacked on top of each other. */
    const chipLen = 0.16;
    const nx = Math.max(2, Math.round((hw * 2) / chipLen));
    const ny = Math.max(2, Math.round((hh * 2) / chipLen));
    const cw = (hw * 2) / nx, chh = (hh * 2) / ny;
    for (let i = 0; i < nx; i++) {
      const px = -hw + cw * (i + 0.5);
      [1, -1].forEach(sy => {
        const chip = box(cw * 0.96, t * 1.15, 0.11, i % 2 === 0 ? matHazardYellow : matHazardBlack,
          tag + 'ShroudCaution' + nm + (sy > 0 ? 'T' : 'B') + i);
        chip.position.set(px, cy + sy * (hh + t / 2), sz); grp.add(chip);
      });
    }
    for (let j = 0; j < ny; j++) {
      const py = cy - hh + chh * (j + 0.5);
      [1, -1].forEach(sx => {
        const chip = box(t * 1.15, chh * 0.96, 0.11, j % 2 === 0 ? matHazardBlack : matHazardYellow,
          tag + 'ShroudCaution' + nm + (sx > 0 ? 'R' : 'L') + j);
        chip.position.set(sx * (hw + t / 2), py, sz); grp.add(chip);
      });
    }
  });
  ship.add(grp);
  return grp;
}
/* Vertical launch system: a boxed cell bank with a grid of dark hatches and
 * accent rims. cols x rows hatches; doubling either dimension gives the
 * "double size" cell the heavy marks carry. */
function vlsCell(name, cols, rows, cellW, cellD, height, mat) {
  const grp = new T.Group(); grp.name = name;
  const w = cols * cellW, d = rows * cellD;
  const shell = box(w, height, d, mat || matNavyPanel, 'vlsShell');
  shell.position.y = height / 2; grp.add(shell);
  const rim = box(w + 0.04, 0.04, d + 0.04, matAccent, 'vlsRim');
  rim.position.y = height - 0.01; grp.add(rim);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const hatch = box(cellW * 0.7, 0.05, cellD * 0.7, matMfdSlot, 'vlsHatch' + i + '_' + j);
    hatch.position.set(-w / 2 + cellW * (i + 0.5), height + 0.005, -d / 2 + cellD * (j + 0.5));
    grp.add(hatch);
  }
  [-1, 1].forEach(sd => {
    const duct = box(0.06, height * 0.7, d * 0.8, matEngine, 'vlsEffluxDuct' + (sd < 0 ? 'L' : 'R'));
    duct.position.set(sd * (w / 2 + 0.01), height * 0.42, 0); grp.add(duct);
  });
  return grp;
}
/* Particle cannon. Size 1 is a light hull-side mount, size 2 the heavier
 * underslung wing weapon: longer barrel, bigger accelerator housing. */
function particleCannon(name, size, inverted, mat) {
  const grp = new T.Group(); grp.name = name;
  const k = size === 2 ? 1.5 : 1, sgn = inverted ? -1 : 1;
  const pylon = box(0.06 * k, 0.1 * k, 0.12 * k, matEngine, 'cannonPylon');
  pylon.position.y = sgn * 0.06 * k; grp.add(pylon);
  const housing = box(0.13 * k, 0.13 * k, 0.34 * k, mat || matNavyPanel, 'cannonHousing');
  grp.add(housing);
  const barrel = cyl(0.035 * k, 0.035 * k, 0.42 * k, matEngine, 'cannonBarrel', 8);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.36 * k; grp.add(barrel);
  const coil = cyl(0.06 * k, 0.06 * k, 0.05, matAccent, 'cannonCoil', 8);
  coil.rotation.x = Math.PI / 2; coil.position.z = 0.3 * k; grp.add(coil);
  const emitter = cyl(0.045 * k, 0.02 * k, 0.06, matGlow, 'cannonEmitter', 8);
  emitter.rotation.x = Math.PI / 2; emitter.position.z = 0.58 * k; grp.add(emitter);
  return grp;
}
/* Powered gun turret: ring, mount and twin barrels. Shared so warships can
 * carry the same mount the capitals use. Ventral flips every offset. */
function gunTurret(name, x, y, z, ventral, scale = 1) {
  const grp = new T.Group(); grp.name = name;
  const sgn = ventral ? -1 : 1, k = scale;
  const base = cyl(0.2 * k, 0.24 * k, 0.14 * k, matPanel, 'turretRing', 8);
  base.position.y = sgn * 0.02 * k; grp.add(base);
  const mount = box(0.26 * k, 0.16 * k, 0.3 * k, matEngine, 'turretMount');
  mount.position.y = sgn * 0.15 * k; grp.add(mount);
  [-1, 1].forEach(b => {
    const barrel = cyl(0.03 * k, 0.03 * k, 0.46 * k, matEngine, 'turretBarrel' + (b < 0 ? 'A' : 'B'), 6);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(b * 0.07 * k, sgn * 0.16 * k, 0.34 * k);
    grp.add(barrel);
  });
  grp.position.set(x, y, z);
  return grp;
}
/* Hangs a store under a wing, finding the panel's REAL underside by raycast.
 * A kinked wing's outer panel rises with the dihedral, so a hard-coded y (or
 * anything derived from the wing's bounding box) leaves the pylon in space —
 * which is exactly how the navy's outer pods ended up floating. */
/* Hangs a store under a wing at a given span station, placing it by FRACTION
 * of that station's local chord.
 *
 * A kinked, swept, tapered panel gives a different chord at every station, so
 * neither a hard-coded z nor a fixed offset from the wing root works: inboard
 * it lands mid-panel, outboard it falls off the trailing edge entirely and the
 * store is silently dropped. This scans z at the station to find where the
 * material actually starts and ends, then interpolates within it — and takes
 * the panel's real underside height from the same scan.
 */
function mountWingStore(ship, x, chordFrac, make) {
  const targets = [];
  ship.traverse(n => { if (n.isMesh && /^wing(Inner|Outer)(Left|Right)$/.test(n.name)) {
    n.updateWorldMatrix(true, false); targets.push(n); } });
  if (!targets.length) return null;
  const bounds = new T.Box3();
  targets.forEach(t => bounds.union(new T.Box3().setFromObject(t)));
  const ray = new T.Raycaster();
  const STEPS = 48;
  let zFirst = null, zLast = null, yAt = null;
  for (let i = 0; i <= STEPS; i++) {
    const z = bounds.min.z + (bounds.max.z - bounds.min.z) * (i / STEPS);
    ray.set(new T.Vector3(x, bounds.min.y - 1, z), new T.Vector3(0, 1, 0));
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) continue;
    if (zFirst === null) zFirst = z;
    zLast = z;
    if (yAt === null || hits[0].point.y < yAt) yAt = hits[0].point.y;
  }
  if (zFirst === null) return null;                 // no wing at this station
  const z = zFirst + (zLast - zFirst) * chordFrac;
  ray.set(new T.Vector3(x, bounds.min.y - 1, z), new T.Vector3(0, 1, 0));
  const hits = ray.intersectObjects(targets, false);
  const under = hits.length ? hits[0].point.y : yAt;
  const node = make(x, under, z);
  ship.add(node);
  return node;
}
/* Trapezoidal prism: plan-view trapezoid (wide front edge, narrow back edge)
 * extruded vertically, so its two sloped faces run fore-and-aft, coaxial with
 * the engines. */
function trapezoidPrism(name, wFront, wBack, depth, height, mat) {
  /* The shape is authored in XY then rotated −90° about X, which maps shape
     +y to world −z. The front (wide) edge therefore has to be authored at
     −depth/2, or the prism comes out tapering the wrong way. */
  const shape = new T.Shape();
  shape.moveTo(-wFront / 2, -depth / 2);
  shape.lineTo(wFront / 2, -depth / 2);
  shape.lineTo(wBack / 2, depth / 2);
  shape.lineTo(-wBack / 2, depth / 2);
  shape.lineTo(-wFront / 2, -depth / 2);
  const geo = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -height / 2);
  geo.rotateX(-Math.PI / 2);
  const mesh = new T.Mesh(geo, mat);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function missilePod(name, x, y, z, inverted, pylonH) {
  const grp = new T.Group(); grp.name = name;
  // pylon runs up from the pod's top into the wing underside only
  const ph = pylonH || 0.08;
  const pylon = box(0.05, ph, 0.1, matEngine, 'missilePylon');
  pylon.position.y = (inverted ? -1 : 1) * (ph / 2 + 0.035); grp.add(pylon);
  const body = box(0.09, 0.09, 0.38, matPanel, 'missileBody'); grp.add(body);
  const tip = new T.Mesh(new T.ConeGeometry(0.05, 0.12, 6), matWarhead);
  tip.name = 'missileTip'; tip.castShadow = true;
  tip.rotation.x = Math.PI / 2; tip.position.z = 0.25;
  grp.add(tip);
  grp.position.set(x, y, z);
  return grp;
}
function laserCannon(name, x, y, z, pylonH = 0.14) {
  const grp = new T.Group(); grp.name = name;
  // pylon reaches up into the nose belly; barrel hangs clear below the skin
  const pylon = box(0.05, pylonH, 0.12, matEngine, 'laserPylon');
  pylon.position.set(0, pylonH / 2 + 0.015, -0.1); grp.add(pylon);
  const barrel = cyl(0.035, 0.035, 0.55, matEngine, 'laserBarrel', 6);
  barrel.rotation.x = Math.PI / 2;
  grp.add(barrel);
  const tip = cyl(0.045, 0.02, 0.06, matAccent, 'laserEmitter', 6);
  tip.rotation.x = Math.PI / 2; tip.position.z = 0.29;
  grp.add(tip);
  grp.position.set(x, y, z);
  return grp;
}
/* Fits nav lights to the outermost structure on each flank (ignoring landing
 * gear, which folds away). Red always to port, green always to starboard.
 *
 * Placement is done by RAYCASTING against real triangles, not by testing
 * axis-aligned boxes. A swept, dihedral wing plate has a bounding box far
 * larger than its actual surface, so a box test happily reports "contact" at
 * a corner where there is no material at all — which is exactly how the
 * fighter ended up with lamps hanging in mid-air off its wingtips.
 */
function mountNavLights(ship, lampScale = 1, targetFrac) {
  const candidates = [];
  ship.traverse(n => {
    // gear folds away, and the tower outrigger is a deliberately one-sided
    // appendage — neither should define where a flank light sits
    if (!n.isMesh || /gear|navLight|greeble|dock|outrigger|pylon|controlTerrace|observationGallery|galleryWindow|towerMast|mastLamp|nacelleNoseCone|nacellePylon|missile|laser|particle|cannon|turret|comm|Dish|iff|ServicePipe|PropellantTank|TankStrap|ventStack|ventLamp|engineHousing|engineIntakeRing|engineGlow|exhaustCaution|engineBay|engineMountBlock|turret|cockpitGlass|hudCombiner|dashPanel|mfdSlot|pilotSeat|AftGreeble|AftDecal|rcs/i.test(n.name)) return;
    n.updateWorldMatrix(true, false);
    candidates.push(n);
  });
  if (!candidates.length) return;

  const bounds = new T.Box3();
  candidates.forEach(n => bounds.union(new T.Box3().setFromObject(n)));
  const w = 0.08 * lampScale, h = 0.07 * lampScale, d = 0.16 * lampScale;

  const dockZ = [];
  ship.traverse(n => { if (n.isMesh && /dock/i.test(n.name)) { n.updateWorldMatrix(true, false);
    const db = new T.Box3().setFromObject(n).expandByScalar(0.1); dockZ.push([db.min.z, db.max.z]); } });

  const ray = new T.Raycaster();
  ray.firstHitOnly = false;
  const startX = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) + 1;

  /* Fires inboard from well outside the hull and returns the outermost real
     surface hit at this (y, z), or null if the ray passes through empty air. */
  function probe(sd, y, z) {
    ray.set(new T.Vector3(sd * startX, y, z), new T.Vector3(-sd, 0, 0));
    const hits = ray.intersectObjects(candidates, false);
    return hits.length ? hits[0] : null;
  }

  /* ONE station is solved for BOTH flanks and then mirrored. Solving each
     side independently let the two lamps diverge onto different fore/aft
     stations whenever several candidate surfaces shared the same |x| (the
     pod's four RCS nozzles), because neither side could beat the other's
     tie-break margin. Scoring the pair together makes that impossible.
     Score favours outboard reach and, per the brief, an AFT station. */
  const zSpan = bounds.max.z - bounds.min.z;
  const ySpan = bounds.max.y - bounds.min.y;
  let best = null;
  for (let zi = 0; zi < 16; zi++) {
    const z = bounds.min.z + zSpan * (0.08 + zi * 0.04);
    if (dockZ.some(([z0, z1]) => z > z0 && z < z1)) continue;
    /* The y sweep must span the WHOLE height. Sampling a narrow mid band of
       the overall bounds misses the hull entirely on ships with tall
       superstructure (the capital's tower is over twice the hull's height),
       leaving only forward tower stations eligible. */
    for (let yi = 0; yi < 14; yi++) {
      const y = bounds.min.y + ySpan * (0.06 + yi * 0.066);
      const hitL = probe(-1, y, z), hitR = probe(1, y, z);
      if (!hitL || !hitR) continue;                       // both flanks or nothing
      const reach = Math.min(Math.abs(hitL.point.x), Math.abs(hitR.point.x));
      if (Math.abs(Math.abs(hitL.point.x) - Math.abs(hitR.point.x)) > 0.08) continue;
      /* Longitudinal preference. Default is a pull toward the tail; a builder
         can instead name a target station as a hull-length fraction (0 = tail,
         1 = bow) and the term becomes a penalty on distance from it. Without
         this the reach term ties across a long z range whenever the widest
         structure is amidships, and the tail bias silently wins. */
      const frac = (z - bounds.min.z) / zSpan;
      const station = targetFrac === undefined ? (1 - frac) : (1 - Math.abs(frac - targetFrac) * 2);
      const maxHalf = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) || 1;
      // an explicit target is weighted harder than the default drift, or the
      // reach term simply overrides it wherever the widest structure sits
      const score = reach / maxHalf + station * (targetFrac === undefined ? 0.6 : 1.8);
      if (!best || score > best.score) best = { score, x: reach, y, z };
    }
  }
  if (!best) return;
  [[-1, matNavGreen, 'navLightStarboard'], [1, matNavRed, 'navLightPort']].forEach(([sd, mat, name]) => {
    const lamp = box(w, h, d, mat, name);
    // identical y/z on both flanks by construction; only x is mirrored
    lamp.position.set(sd * (best.x - w * 0.3), best.y, best.z);
    ship.add(lamp);
  });
}
/* Aft deck dressing: a run of service greebles and painted decal panels
 * across the rear of the topside, where hulls otherwise read as bare plate.
 * Mirrored, seeded, and kept clear of anything already mounted up there. */
function sprinkleAftDeck(ship, hostPattern, tag) {
  const hosts = [];
  ship.traverse(n => {
    if (n.isMesh && hostPattern.test(n.name)) { n.updateWorldMatrix(true, false); hosts.push(new T.Box3().setFromObject(n)); }
  });
  if (!hosts.length) return;
  hosts.sort((p, q) => p.min.z - q.min.z);

  /* Things that must never be covered. Kept STRICT: an earlier version had a
     relaxed retry that dropped pressureTank when no deck looked clear, which
     on the H2 hauler (where a sphere spans its deck end to end) meant the
     clutter was always driven through the tank skin. Rather than relax the
     rules, placement below finds the clear lane outboard of whatever is
     sitting on the deck. */
  const keepOut = [];
  ship.traverse(n => {
    if (!n.isMesh) return;
    if (!/dock|Window|cockpitGlass|canopyFairing|cockpitInterior|dashPanel|hudCombiner|pilotSeat|laser|missile|navLight|iff|Caution|engineGlow|turret|ventStack|ventLamp|recoveryBeacon|galleryWindow|passengerPod|cargoContainer|cargoRail|pressureTank|tankCradle|tankManifold|h2Manifold|valve|cannonCheek|cannonHousing|cannonPylon|cannonBarrel|cannonCoil|cannonEmitter|turretSponson|turretGusset|turretCheek|fwdSponson|dorsalBump|dorsalSpine|vls|stabilizerMast|bowWindow|bowGreeble|bowDuct|bowSkylight|wingRootBrace|wingRootGusset|engineRoomBlock|auxEngine|shroud/i.test(n.name)) return;
    n.updateWorldMatrix(true, false);
    keepOut.push(new T.Box3().setFromObject(n).expandByScalar(0.03));
  });
  const clear = bx => !keepOut.some(k => k.intersectsBox(bx));
  const rand = seedFromId(tag + 'aftDeck');
  /* Counted separately: a host that placed greebles but no decals used to
     report success and skip the fallback entirely, so some hulls ended up
     with clutter and no markings. */
  let totG = 0, totD = 0;

  // only decks in the aft half are eligible — walking forward without a limit
  // is how this detail once ended up on the nose
  const shipBox = new T.Box3();
  hosts.forEach(h => shipBox.union(h));
  const midZ = (shipBox.min.z + shipBox.max.z) / 2;
  const aftHosts = hosts.filter(h => (h.min.z + h.max.z) / 2 <= midZ);
  const eligible = aftHosts.length ? aftHosts : [hosts[0]];

  for (const host of eligible) { dressDeck(host); if (totG && totD) return; }
  /* Last resort: the engine bay block is the aftmost structure on the ship,
     so it is a legitimate "top of rear" surface when a fully-tanked deck
     leaves no lane at all (the H2's small mark). */
  const fallback = [];
  ship.traverse(n => {
    if (n.isMesh && /^engineBayExtension$|^aftPlug$/.test(n.name)) {
      n.updateWorldMatrix(true, false); fallback.push(new T.Box3().setFromObject(n));
    }
  });
  for (const host of fallback) { dressDeck(host); if (totG && totD) return; }

  /* Guaranteed minimum. On a hull whose whole aft deck is occupied by
     functional kit (the small hydrogen hauler: cradle, vent stacks, manifold
     pipework, caution rings) every candidate is rejected and the ship ends up
     with no aft dressing at all. Fall back to a structural-only exclusion —
     brushing pipework is acceptable, blocking a bay or a screen is not — and
     emit one mirrored greeble pair and one decal pair. */
  const structural = [];
  ship.traverse(n => {
    if (!n.isMesh) return;
    if (!/dock|cockpitGlass|HullWindow|laser|missile|particle|navLight|iff|engineGlow/i.test(n.name)) return;
    n.updateWorldMatrix(true, false);
    structural.push(new T.Box3().setFromObject(n).expandByScalar(0.03));
  });
  const forceHost = eligible[0];
  const fsx = forceHost.max.x - forceHost.min.x, fsz = forceHost.max.z - forceHost.min.z;
  const fy = forceHost.max.y;
  const fw = fsx * 0.1, fd = fsz * 0.07;
  const fOff = fsx * 0.32;
  const needed = [];
  if (!totG) needed.push('G');
  if (!totD) needed.push('D');
  for (let att = 0; att < 16 && needed.length; att++) {
    const z = forceHost.min.z + fsz * (0.08 + att * 0.05);
    const size = new T.Vector3(fw, 0.06, fd);
    const pl = new T.Box3().setFromCenterAndSize(new T.Vector3(-fOff, fy, z), size);
    const pr = new T.Box3().setFromCenterAndSize(new T.Vector3(fOff, fy, z), size);
    if (structural.some(k => k.intersectsBox(pl) || k.intersectsBox(pr))) continue;
    const kind = needed.shift();
    [-1, 1].forEach(sd => {
      if (kind === 'G') {
        const g = box(fw, 0.07, fd, matPanel, tag + 'AftGreeble9' + (sd < 0 ? 'L' : 'R'));
        g.position.set(sd * fOff, fy + 0.033, z); ship.add(g);
      } else {
        const sf = flushPatch(sd * fOff, z, fw * 0.4, fd * 0.4, fy);
        const dc = box(fw, 0.025, fd, matAccent, tag + 'AftDecal9' + (sd < 0 ? 'L' : 'R'));
        dc.position.set(sd * fOff, (sf === null ? fy + 0.012 : sf - 0.004), z); ship.add(dc);
      }
    });
  }
  return;

  /* Widest |x| any obstruction reaches at this z, measured at deck level, so
     a piece can be tucked into the lane outboard of it. */
  function obstructionHalfWidth(z, y) {
    let hw = 0;
    keepOut.forEach(k => {
      if (z < k.min.z || z > k.max.z) return;
      if (y < k.min.y - 0.2 || y > k.max.y + 0.2) return;
      hw = Math.max(hw, Math.abs(k.min.x), Math.abs(k.max.x));
    });
    return hw;
  }

  /* Flat plates need a LEVEL patch, so the deck height is sampled at each
     candidate's fore and aft edge. Fins and sloped plating otherwise take a
     decal that only touches along one edge and lifts along the slope.
     Declared as a hoisted function: dressDeck is called ABOVE this point, and
     a const arrow would still be in its temporal dead zone. */
  /* var, and with no initialiser: this declaration sits BELOW the dressDeck
     calls, so a let/const would still be in its temporal dead zone, and an
     initialiser would reset the cache after first use. */
  var _levelRay, _levelHosts;
  function levelAt(x, z, yTop) {
    if (!_levelRay) {
      _levelRay = new T.Raycaster();
      _levelHosts = [];
      /* Must be the SAME solid set a viewer sees, or the gate measures one
         surface while the plate actually lands on a nearer one (a wing,
         container or sponson) and slopes across it. */
      ship.traverse(n => { if (n.isMesh && /^hull|Forebody|noseNeck|^wing|^stabil|^engine|Section|^gantry|^dorsal|cargoContainer|passengerPod|pressureTank|^tankBay|Sponson|Platform|^aftPlug|^tower|Cradle/.test(n.name)) _levelHosts.push(n); });
    }
    _levelRay.set(new T.Vector3(x, yTop + 1, z), new T.Vector3(0, -1, 0));
    const h = _levelRay.intersectObjects(_levelHosts, false);
    return h.length ? { y: h[0].point.y, obj: h[0].object } : null;
  }
  /* A flat plate is only truly flush if ALL FOUR of its edges land on the SAME
     host at the same height. Sampling a mixed host set and taking the first
     hit let a plate straddle a deck and a fin above it, and sampling only the
     fore/aft pair missed slopes running across the width. */
  function flushPatch(cx, cz, halfW, halfD, yTop) {
    const pts = [[cx, cz + halfD], [cx, cz - halfD], [cx + halfW, cz], [cx - halfW, cz]];
    const hits = pts.map(([x, z]) => levelAt(x, z, yTop));
    if (hits.some(h => h === null)) return null;
    const host = hits[0].obj;
    if (hits.some(h => h.obj !== host)) return null;
    const ys = hits.map(h => h.y);
    if (Math.max(...ys) - Math.min(...ys) > 0.02) return null;
    return Math.max(...ys);
  }
  function dressDeck(host) {
    const sx = host.max.x - host.min.x, sz = host.max.z - host.min.z;
    const hullHalf = Math.min(Math.abs(host.min.x), Math.abs(host.max.x));
    const y = host.max.y;
    let made = 0;

    // returns {offX, w} for a piece at this z, or null if no lane fits
    const lane = (z, desiredW, minW) => {
      const inner = obstructionHalfWidth(z, y);
      if (inner === 0) {                       // open deck: offset freely
        return { offX: sx * (0.1 + rand() * 0.28), w: desiredW };
      }
      const laneW = hullHalf - inner - 0.03;   // clear strip outboard
      if (laneW < minW) return null;
      const w = Math.min(desiredW, laneW * 0.88);
      return { offX: inner + 0.03 + w / 2, w };
    };

    for (let i = 0; i < 5; i++) {
      const desiredW = sx * (0.07 + rand() * 0.09), d = sz * (0.05 + rand() * 0.07), h = 0.07 + rand() * 0.05;
      const base = 0.05 + i * 0.09;
      let placed = false;
      for (let att = 0; att < 12 && !placed; att++) {
        const f = (base + att * 0.08) % 0.52;
        const z = host.min.z + sz * (0.05 + f);
        const L = lane(z, desiredW, 0.09);
        if (!L) continue;
        const size = new T.Vector3(L.w, h, d);
        const pl = new T.Box3().setFromCenterAndSize(new T.Vector3(-L.offX, y, z), size);
        const pr = new T.Box3().setFromCenterAndSize(new T.Vector3(L.offX, y, z), size);
        if (!clear(pl) || !clear(pr)) continue;
        [-1, 1].forEach(sd => {
          const g = box(L.w, h, d, rand() > 0.5 ? matPanel : matEngine, tag + 'AftGreeble' + i + (sd < 0 ? 'L' : 'R'));
          g.position.set(sd * L.offX, y + h / 2 - 0.02, z);
          ship.add(g);
        });
        placed = true; made++; totG++;
      }
    }

    for (let i = 0; i < 3; i++) {
      const desiredW = sx * (0.11 + rand() * 0.05), d = sz * (0.07 + rand() * 0.05);
      const base = 0.08 + i * 0.14;
      let placed = false;
      for (let att = 0; att < 12 && !placed; att++) {
        const f = (base + att * 0.09) % 0.5;
        const z = host.min.z + sz * (0.06 + f);
        const L = lane(z, desiredW, 0.1);
        if (!L) continue;
        const size = new T.Vector3(L.w, 0.03, d);
        const pl = new T.Box3().setFromCenterAndSize(new T.Vector3(-L.offX, y, z), size);
        const pr = new T.Box3().setFromCenterAndSize(new T.Vector3(L.offX, y, z), size);
        if (!clear(pl) || !clear(pr)) continue;
        const surfR = flushPatch(L.offX, z, L.w * 0.4, d * 0.4, y);
        const surfL = flushPatch(-L.offX, z, L.w * 0.4, d * 0.4, y);
        if (surfR === null || surfL === null) continue;
        [-1, 1].forEach(sd => {
          const decal = box(L.w, 0.025, d, i % 2 ? matAccent : matPanel, tag + 'AftDecal' + i + (sd < 0 ? 'L' : 'R'));
          decal.position.set(sd * L.offX, (sd < 0 ? surfL : surfR) - 0.004, z);
          ship.add(decal);
        });
        placed = true; made++; totD++;
      }
    }
    return made > 0;
  }
}
/* Applies the window / IFF / plumbing / greeble passes to EVERY hull
 * compartment rather than only the forward one, so aft sections of segmented
 * ships carry the same density of detail. The IFF badge stays unique — one
 * per ship, on the forward compartment. */
function detailCompartments(ship, shipId) {
  const names = [];
  ship.traverse(n => {
    if (n.isMesh && /^hullMain$|^hullSection\d+$/.test(n.name) && !names.includes(n.name)) names.push(n.name);
  });
  names.forEach((hostName, i) => {
    sprinkleWindows(ship, hostName, 5, (shipId || '') + hostName, ship.name + hostName);
    sprinklePlumbing(ship, hostName, ship.name + hostName);
    sprinkleGreebles(ship, hostName, i === 0 ? 11 : 8, ship.name + hostName);
  });
  sprinkleAftDeck(ship, /^hullMain$|^hullSection\d+$/, ship.name);
  /* At least one antenna on every hull. Some classes already carry their own
     mast, so this only fills the gap. */
  {
    let hasAntenna = false;
    ship.traverse(n => { if (n.isMesh && /antennaWhip|antennaMast|commMast|sensorMast/.test(n.name)) hasAntenna = true; });
    if (!hasAntenna && names.length) mountAntenna(ship, names[0], 1, 0.4, 0.3);
  }
  /* IFF goes on LAST: it measures the deck to find a legible station, so
     everything that could occupy the deck must already exist. Placed before
     the plumbing pass it was routinely buried by pipes and greebles. */
  if (names.length) mountIFF(ship, names[0], shipId);
}
/* Deterministic exterior greebles: small panels, vents and conduit runs laid
 * on a host block's top and flanks, in mirrored pairs. Seeded by the host name
 * so a given hull always builds the same clutter.
 *
 * Candidates are rejected if they would foul anything functional already on
 * the hull — docking bay openings, windows, glass, hardpoints, lights — since
 * clutter sitting across a bay mouth reads as a modelling error. Each rejected
 * candidate is retried further along the hull before being dropped.
 */
function sprinkleGreebles(ship, hostName, count, tag) {
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName && !host) host = n; });
  if (!host) return;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;

  const keepOut = [];
  ship.traverse(n => {
    if (!n.isMesh) return;
    if (/dock|Window|cockpitGlass|laser|missile|navLight|iff|passengerPod|cargoContainer|gearBay|Caution|turret|gantry|corridor|pressureTank|tankBay|ventStack|ventLamp|ServicePipe|PropellantTank|TankStrap|valve|manifold|cockpitInterior|dashPanel|mfdSlot|hudCombiner|pilotSeat|cannonCheek|cannonHousing|cannonPylon|cannonBarrel|cannonCoil|cannonEmitter|turretSponson|turretGusset|turretCheek|turret|fwdSponson|dorsalBump|dorsalSpine|vls|stabilizerMast|bowWindow|bowGreeble|bowDuct|bowSkylight|wingRootBrace|wingRootGusset|engineRoomBlock|auxEngine|shroud/i.test(n.name)) {
      n.updateWorldMatrix(true, false);
      // docking bays get a generous exclusion: clutter merely ADJACENT to a bay
      // mouth still crowds the approach, so keep well clear of them
      const pad = /dock/i.test(n.name) ? 0.42 : 0.06;
      keepOut.push(new T.Box3().setFromObject(n).expandByScalar(pad));
    }
  });
  const clear = bx => !keepOut.some(k => k.intersectsBox(bx));

  const rand = seedFromId(tag + hostName + count);
  const surfRay = new T.Raycaster();
  // require real material at the station — see the note in sprinkleWindows
  const onSkin = (x, y, z) => {
    const sd = Math.sign(x) || 1;
    surfRay.set(new T.Vector3(x + sd * 0.6, y, z), new T.Vector3(-sd, 0, 0));
    const h = surfRay.intersectObject(host, false);
    return h.length > 0 && h[0].distance - 0.6 < 0.14;
  };
  // returns the skin height at this station, or null if there is no material
  const deckY = (x, y, z) => {
    surfRay.set(new T.Vector3(x, y + 0.8, z), new T.Vector3(0, -1, 0));
    const h = surfRay.intersectObject(host, false);
    return h.length ? h[0].point.y : null;
  };
  const onDeck = (x, y, z) => deckY(x, y, z) !== null;
  for (let i = 0; i < count; i++) {
    const onTop = rand() > 0.45;
    const w = sx * (0.05 + rand() * 0.1), d = sz * (0.03 + rand() * 0.09);
    const h = Math.min(sy * 0.08, 0.09) * (0.6 + rand());
    const mat = rand() > 0.5 ? matPanel : matEngine;
    const offX = sx * (0.08 + rand() * 0.32);
    const gy = b.min.y + sy * (0.25 + rand() * 0.5), gh = sy * (0.06 + rand() * 0.16);
    let placed = false;
    for (let attempt = 0; attempt < 7 && !placed; attempt++) {
      const z = b.min.z + sz * (0.08 + ((rand() + attempt * 0.17) % 1) * 0.82);
      const probe = new T.Box3();
      if (onTop) {
        probe.setFromCenterAndSize(new T.Vector3(offX, b.max.y - h * 0.35, z), new T.Vector3(w, h, d));
        // mirrored pair must BOTH be clear
        const mirror = new T.Box3().setFromCenterAndSize(new T.Vector3(-offX, b.max.y - h * 0.35, z), new T.Vector3(w, h, d));
        if (!clear(probe) || !clear(mirror)) continue;
        const syL = deckY(-offX, b.max.y, z), syR = deckY(offX, b.max.y, z);
        if (syL === null || syR === null || Math.abs(syL - syR) > 0.02) continue;
        [-1, 1].forEach(sd => {
          const g = box(w, h, d, mat, tag + 'GreebleTop' + i + (sd < 0 ? 'L' : 'R'));
          // seated on the skin height at this station, not the box lid
          g.position.set(sd * offX, (sd < 0 ? syL : syR) + h * 0.15, z);
          ship.add(g);
        });
      } else {
        const cx = b.max.x - h * 0.35;
        probe.setFromCenterAndSize(new T.Vector3(cx, gy, z), new T.Vector3(h, gh, d));
        const mirror = new T.Box3().setFromCenterAndSize(new T.Vector3(-cx, gy, z), new T.Vector3(h, gh, d));
        if (!clear(probe) || !clear(mirror)) continue;
        if (!onSkin(cx, gy, z) || !onSkin(-cx, gy, z)) continue;
        [-1, 1].forEach(sd => {
          const g = box(h, gh, d, mat, tag + 'GreebleSide' + i + (sd < 0 ? 'L' : 'R'));
          g.position.set(sd * cx, gy, z);
          ship.add(g);
        });
      }
      placed = true;
    }
  }
}
/* Small rectangular hull windows, mirrored on both flanks. Height matches the
 * control tower's gallery band; length is shorter. Which ones are lit is
 * decided by the ship's ID, exactly like cabin and compartment windows. */
function sprinkleWindows(ship, hostName, count, seedId, tag) {
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName && !host) host = n; });
  if (!host) return;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const keepOut = [];
  ship.traverse(n => {
    if (!n.isMesh) return;
    if (/dock|Greeble|Decal|ventGreeble|laser|missile|navLight|iff|passengerPod|cargoContainer|gearBay|Caution|gantry|corridor|tank|pipe|valve|manifold|cockpitInterior|dashPanel|mfdSlot|hudCombiner|pilotSeat|cannonCheek|cannonHousing|cannonPylon|cannonBarrel|cannonCoil|cannonEmitter|turretSponson|turretGusset|turretCheek|turret|fwdSponson|dorsalBump|dorsalSpine|vls|stabilizerMast|bowWindow|bowGreeble|bowDuct|bowSkylight|wingRootBrace|wingRootGusset|engineRoomBlock|auxEngine|shroud/i.test(n.name)) {
      n.updateWorldMatrix(true, false);
      keepOut.push(new T.Box3().setFromObject(n).expandByScalar(/dock/i.test(n.name) ? 0.3 : 0.05));
    }
  });
  const rand = seedFromId((seedId || 'X') + tag + count);
  const winH = Math.max(0.07, sy * 0.1), winL = winH * 1.7;
  const built = [];
  /* A sloped host (the fighter's wedge forebody) has a bounding box far wider
     than its real surface, so a station derived from the box can sit in open
     air beside the wedge. Fire a ray inboard and require actual material. */
  const surfRay = new T.Raycaster();
  const onSkin = (x, y, z) => {
    const sd = Math.sign(x) || 1;
    surfRay.set(new T.Vector3(x + sd * 0.6, y, z), new T.Vector3(-sd, 0, 0));
    const h = surfRay.intersectObject(host, false);
    return h.length > 0 && h[0].distance - 0.6 < 0.12;
  };
  const flags = Array.from({ length: count * 2 }, () => rand() > 0.45);
  if (flags.length > 1) {
    if (flags.every(Boolean)) flags[Math.floor(rand() * flags.length)] = false;
    if (!flags.some(Boolean)) flags[Math.floor(rand() * flags.length)] = true;
  }
  for (let i = 0; i < count; i++) {
    const y = b.min.y + sy * (0.55 + rand() * 0.26);   // upper flank, clear of plumbing
    let done = false;
    for (let att = 0; att < 12 && !done; att++) {
      const z = b.min.z + sz * (0.1 + ((rand() + att * 0.19) % 1) * 0.8);
      const probe = new T.Box3().setFromCenterAndSize(new T.Vector3(b.max.x, y, z), new T.Vector3(0.1, winH, winL));
      const mirror = new T.Box3().setFromCenterAndSize(new T.Vector3(b.min.x, y, z), new T.Vector3(0.1, winH, winL));
      if (keepOut.some(k => k.intersectsBox(probe) || k.intersectsBox(mirror))) continue;
      if (!onSkin(b.max.x, y, z) || !onSkin(b.min.x, y, z)) continue;
      [-1, 1].forEach((sd, si) => {
        const w = box(0.04, winH, winL, flags[si * count + i] ? matCabinLight : matCabinDark,
          tag + 'HullWindow' + i + (sd < 0 ? 'L' : 'R'));
        w.position.set(sd * (b.max.x - 0.01), y, z);
        ship.add(w);
        built.push(w);
      });
      done = true;
    }
  }
  /* Only a subset of candidates survives the keep-out pass, so the mix has to
     be enforced on the windows actually built — otherwise a hull can come out
     uniformly lit or uniformly dark despite a mixed flag set. */
  if (!built.length) {
    // crowded short hull: retry honouring only the dock exclusions, since
    // brushing a greeble is acceptable but blocking a bay is not
    const dockOnly = keepOut.filter(k => k.getSize(new T.Vector3()).length() > 0.6);
    for (let i = 0; i < count && built.length < 2; i++) {
      const y = b.min.y + sy * 0.55;
      const z = b.min.z + sz * (0.2 + i * 0.6 / Math.max(1, count - 1));
      const probe = new T.Box3().setFromCenterAndSize(new T.Vector3(b.max.x, y, z), new T.Vector3(0.1, winH, winL));
      if (dockOnly.some(k => k.intersectsBox(probe))) continue;
      [-1, 1].forEach((sd, si) => {
        const w = box(0.04, winH, winL, si === 0 ? matCabinLight : matCabinDark, tag + 'HullWindowAlt' + i + (sd < 0 ? 'L' : 'R'));
        w.position.set(sd * (b.max.x - 0.01), y, z);
        ship.add(w); built.push(w);
      });
    }
  }
  if (built.length > 1) {
    const isLit = w => w.material === matCabinLight;
    if (built.every(isLit)) built[Math.floor(rand() * built.length) % built.length].material = matCabinDark;
    else if (!built.some(isLit)) built[Math.floor(rand() * built.length) % built.length].material = matCabinLight;
  }
}
/* Longitudinal service runs and propellant tanks — the heavier end of the
 * greeble vocabulary, mirrored on both flanks along the hull's length. */
function sprinklePlumbing(ship, hostName, tag) {
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName && !host) host = n; });
  if (!host) return;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const r = Math.min(0.09, sy * 0.09);
  /* Route the run through the longest stretch of flank that no docking bay
     occupies, rather than straight down the side through the bay mouths. */
  const blocked = [];
  ship.traverse(n => { if (n.isMesh && /dock/i.test(n.name)) { n.updateWorldMatrix(true, false);
    const db = new T.Box3().setFromObject(n).expandByScalar(0.12); blocked.push([db.min.z, db.max.z]); } });
  blocked.sort((p, q) => p[0] - q[0]);
  let bestA = b.min.z, bestB = b.max.z, cursor = b.min.z;
  if (blocked.length) {
    bestA = bestB = cursor;
    blocked.concat([[b.max.z, b.max.z]]).forEach(([z0, z1]) => {
      if (z0 - cursor > bestB - bestA) { bestA = cursor; bestB = z0; }
      cursor = Math.max(cursor, z1);
    });
  }
  /* Split the flank: the service run rides the aft half, the propellant tank
     the forward half. Bunching both amidships is what put them across the
     docking ports. */
  const clearLen = Math.max(0.3, (bestB - bestA) * 0.9);
  const runLen = Math.min(sz * 0.34, clearLen);
  const aftHalf = b.min.z + sz * 0.26, fwdHalf = b.min.z + sz * 0.76;
  const keepClear = z => {
    let out = z;
    for (let k = 0; k < 10 && blocked.some(([z0, z1]) => out > z0 - runLen / 2 && out < z1 + runLen / 2); k++) {
      out = z + (k + 1) * runLen * 0.4 * (k % 2 ? -1 : 1);
    }
    return Math.max(b.min.z + runLen / 2, Math.min(b.max.z - runLen / 2, out));
  };
  const runZ = keepClear(aftHalf);
  const tankCentreZ = keepClear(fwdHalf);
  [-1, 1].forEach(sd => {
    const pipe = cyl(r, r, runLen, matEngine, tag + 'ServicePipe' + (sd < 0 ? 'L' : 'R'), 8);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sd * (b.max.x - r * 0.5), b.min.y + sy * 0.13, runZ);
    ship.add(pipe);
    const tankLen = Math.min(sz * 0.16, runLen * 0.6);
    const tankZ = tankCentreZ;
    const tank = cyl(r * 1.7, r * 1.7, tankLen, matPanel, tag + 'PropellantTank' + (sd < 0 ? 'L' : 'R'), 10);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(sd * (b.max.x - r * 1.1), b.min.y + sy * 0.3, tankZ);
    ship.add(tank);
    [-1, 1].forEach((zs, i) => {
      const strap = cyl(r * 1.85, r * 1.85, 0.05, matEngine, tag + 'TankStrap' + i + (sd < 0 ? 'L' : 'R'), 10);
      strap.rotation.x = Math.PI / 2;
      strap.position.set(sd * (b.max.x - r * 1.1), b.min.y + sy * 0.3, tankZ + zs * tankLen * 0.3);
      ship.add(strap);
    });
  });
}
/* Faction IFF transponder: a coded array of three lamps in the faction colour,
 * repeated on the dorsal and ventral centreline so affiliation is legible from
 * any aspect and at any range. Paint schemes alone are unreadable at combat
 * distance or in shadow, which is how friendly-fire happens. */
/* Faction IFF transponder: a coded array of lamps in the faction colour. Two
 * mount spots exist on the hull's forward compartment — a dorsal/ventral
 * deck plate (as before) or a single array on the compartment's forward
 * bulkhead face — and which one a given ship uses is itself derived from
 * its ID, so the array's location is one more fleet-legible detail. */function mountIFF(ship, hostName, shipId) {
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName && !host) host = n; });
  if (!host) return;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const sz = b.max.z - b.min.z, sx = b.max.x - b.min.x, sy = b.max.y - b.min.y;
  const code = FACTION_IFF[currentFaction] || FACTION_IFF.mustard;
  const lampL = Math.min(0.16, sz * 0.05), gap = lampL * code.gap;
  const n = code.lamps;
  const lampW = Math.min(0.2, sx * 0.11);
  /* Everything already on the ship, for the sightline test. Bounding-box span
     arithmetic was not enough here: the deck of a laden hull is crowded and a
     span that looks free can still be capped from above, which is how the
     lamps ended up inside the warships' dorsal ribs. Raycasting asks the
     question directly. */
  const solids = [];
  ship.traverse(m => { if (m.isMesh && !/^iff/.test(m.name)) { m.updateWorldMatrix(true, false); solids.push(m); } });
  /* Deck furniture only. The lamp is seated ON the hull, so including hull
     blocks in the occupancy test rejects every candidate station. */
  const HULL = /^hullMain$|^hullSection\d+$|^hullNose$|^hullNoseTip$|^hullForebody$|^hullChin$|^hullTailWedge$|^aftPlug$|^tankBay\d+$|^hullUpper$|^hullNeedle$|^hullNoseFace$/;
  const furniture = solids.filter(m => !HULL.test(m.name));
  const ray = new T.Raycaster();
  const arrayLen = gap * n + lampL;

  /* True when all n lamp stations at (x, z) on this face are seated on the
     host and see clear space outward. */
  function clearAt(sd, x, z) {
    const faceY = sd > 0 ? b.max.y : b.min.y;
    // the plinth runs slightly longer than the span of lamp stations AND sits
    // recessed into the face, so the probe must cover that lower band too
    const seat = new T.Box3().setFromCenterAndSize(
      new T.Vector3(x, faceY - sd * 0.005, z),
      new T.Vector3(Math.min(0.3, sx * 0.16) + 0.02, 0.11, arrayLen + 0.06));
    if (furniture.some(m => new T.Box3().setFromObject(m).intersectsBox(seat))) return false;
    for (let i = 0; i < n; i++) {
      const lz = z + (i - (n - 1) / 2) * gap;
      if (lz - lampL / 2 < b.min.z + 0.02 || lz + lampL / 2 > b.max.z - 0.02) return false;
      const probe = new T.Box3().setFromCenterAndSize(
        new T.Vector3(x, faceY + sd * 0.06, lz), new T.Vector3(lampW, 0.06, lampL));
      // no deck furniture may occupy the lamp's own volume
      if (furniture.some(m => new T.Box3().setFromObject(m).intersectsBox(probe))) return false;
      // and nothing may cap it
      ray.set(new T.Vector3(x, faceY + sd * 0.1, lz), new T.Vector3(0, sd, 0));
      const hit = ray.intersectObjects(furniture, false);
      if (hit.length && hit[0].distance < 1.6) return false;
    }
    return true;
  }

  /* ID-derived variety: which end of the deck the array is searched from.
     A forward-bulkhead variant used to exist, but on every hull with a nose
     block ahead of the main compartment that face is interior — the array
     ended up inside the nose or the canopy fairing. Varying the search
     direction keeps the placement fleet-legible without that failure mode. */
  const searchAft = shipId ? seedFromId(shipId + 'iffSpot')() > 0.5 : false;

  /* ONE badge per ship. Ships that already carry a painted faction emblem
     (the warships) get no transponder array at all, and the array itself is
     dorsal only — a dorsal plus a ventral copy reads as two badges. */
  let hasEmblem = false;
  ship.traverse(n => { if (n.isMesh && /^factionEmblem/.test(n.name)) hasEmblem = true; });
  if (hasEmblem) return;

  /* Dorsal is preferred, ventral is the fallback — exactly ONE array is
     emitted either way. Restricting the search to the dorsal face alone left
     13 hulls with no badge at all, because on those the only clear station is
     on the belly. */
  const lanes = [0];
  for (let k = 1; k <= 3; k++) {
    const off = (sx / 2 - lampW / 2 - 0.04) * (k / 3);
    lanes.push(off, -off);
  }
  let chosen = null;
  for (const sd of [1, -1]) {
    let placed = null;
    for (const x of lanes) {
      for (let zi = 0; zi <= 28 && !placed; zi++) {
        const t = searchAft ? (1 - zi / 28) : (zi / 28);
        const z = b.min.z + arrayLen / 2 + 0.04 + (sz - arrayLen - 0.08) * t;
        if (clearAt(sd, x, z)) placed = { x, z };
      }
      if (placed) break;
    }
    if (placed) { chosen = { sd, ...placed }; break; }
  }
  if (!chosen) return;                         // no legible station anywhere
  const sd = chosen.sd;
  const faceY = sd > 0 ? b.max.y : b.min.y;
  const side = sd > 0 ? 'Dorsal' : 'Ventral';
  const plinth = box(Math.min(0.3, sx * 0.16), 0.05, arrayLen, matPanel, 'iffPlinth' + side);
  plinth.position.set(chosen.x, faceY - sd * 0.015, chosen.z);
  ship.add(plinth);
  for (let i = 0; i < n; i++) {
    const lamp = box(lampW, 0.05, lampL, matFactionBeacon, 'iffLamp' + side + i);
    lamp.position.set(chosen.x, faceY + sd * 0.022, chosen.z + (i - (n - 1) / 2) * gap);
    ship.add(lamp);
  }
}
/* Mounts a belly gun beneath a named host block, deriving BOTH its position
 * and its pylon length from that block's live bounds: x is clamped inside the
 * block's width, y sits just under its skin, and the pylon spans the gap plus
 * a bite into the block. Hard-coded heights drift the moment hull geometry
 * moves; this cannot. */
function mountBellyGun(ship, hostName, fx, name, zFrac = 0.3) {
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName && !host) host = n; });
  if (!host) return;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const halfW = (b.max.x - b.min.x) / 2;
  const x = Math.max(-1, Math.min(1, fx)) * Math.max(0, halfW - 0.1);
  const z = (b.min.z + b.max.z) / 2 + (b.max.z - b.min.z) * zFrac;
  const gap = 0.05;
  const y = b.min.y - gap - 0.035;              // barrel radius 0.035
  ship.add(laserCannon(name, x, y, z, gap + 0.09));
}
/* Cockpit interior shell — every class already builds exactly one
 * 'cockpitGlass' mesh (via mountProwGlass or an inline pane); this mounts a
 * pilot tub just behind it: seat, dash bulkhead, and blank MFD recesses sized
 * from that glass. The dash deliberately overlaps the glass so the whole tub
 * reads as one attached assembly. Instrument GRAPHICS are intentionally not
 * modelled — cfg.hudStyle documents the intended treatment for a later skin
 * pass (per-class MFD count/layout + HUD combiner style, so decks read
 * differently ship to ship without touching this shared shell). */
const COCKPIT_STYLES = {
  traderShip: { mfdCount: 2, layout: 'row', hudStyle: 'reticle-basic', note: 'Simple flight reticle; 2 MFDs (nav, systems).' },
  freighterShip: { mfdCount: 2, layout: 'row', hudStyle: 'utility-flat', note: 'Flat cargo/systems readout, no combat reticle; 2 MFDs.' },
  policeShip: { mfdCount: 3, layout: 'split', hudStyle: 'tactical-reticle', note: 'Target-lock reticle + IFF callouts; 3 MFDs (comms/tactical/systems).' },
  shuttleShip: { mfdCount: 2, layout: 'row', hudStyle: 'passenger-simple', note: 'Approach guidance only; 2 MFDs (nav, cabin status).' },
  capitalShip: { mfdCount: 4, layout: 'wide', hudStyle: 'bridge-wide', note: 'Bridge console, not a personal HUD; 4 wide panels (helm/tactical/engineering/sensors).' },
  courierShip: { mfdCount: 1, layout: 'single', hudStyle: 'minimal-strip', note: 'Single slim nav-only strip MFD.' },
  fighterShip: { mfdCount: 3, layout: 'split', hudStyle: 'combat-reticle', note: 'Full combat reticle with lead indicator; 3 MFDs (weapons/radar/systems).' },
  tugShip: { mfdCount: 2, layout: 'row', hudStyle: 'industrial-utility', note: 'Grapple/winch status overlay, no flight reticle; 2 MFDs.' },
  linerShip: { mfdCount: 2, layout: 'row', hudStyle: 'airliner-glass', note: 'Airliner-style glass flight deck; 2 wide MFDs, no combat HUD.' },
  supportShip: { mfdCount: 3, layout: 'split', hudStyle: 'tender-ops', note: 'Boom/drogue alignment overlay plus target-ship damage and fuel-transfer readouts; 3 MFDs, no combat reticle.' },
  navyShip: { mfdCount: 3, layout: 'split', hudStyle: 'military-tactical', note: 'Military tactical reticle with IFF interrogation and weapons status; 3 MFDs (weapons/sensors/comms).' },
  escapePodShip: { mfdCount: 1, layout: 'single', hudStyle: 'survival-strip', note: 'Beacon status and life-support countdown only; 1 strip MFD, no flight reticle.' },
  hydrogenFreighterShip: { mfdCount: 2, layout: 'row', hudStyle: 'utility-cryo-monitor', note: 'Per-tank pressure/temperature/boil-off readout, no reticle; 2 MFDs.' }
};
/* Bow dressing for a civil hull: lit/dark ports, service greebles and painted
 * accent decals on the forward primary block. Reuses the same seeded,
 * keep-out-aware passes as the main compartments so it cannot land on glass,
 * hardpoints or gear bays. */
function dressForeHull(ship, shipId, hostName) {
  sprinkleWindows(ship, hostName, 3, (shipId || '') + hostName, ship.name + 'Fore');
  sprinkleGreebles(ship, hostName, 6, ship.name + 'Fore');
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName && !host) host = n; });
  if (!host) return;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
  const blockers = [];
  ship.traverse(n => {
    if (!n.isMesh) return;
    if (!/Window|cockpitGlass|canopyFairing|Greeble|laser|missile|navLight|iff|accentStripe/i.test(n.name)) return;
    n.updateWorldMatrix(true, false);
    blockers.push(new T.Box3().setFromObject(n).expandByScalar(0.02));
  });
  const rand = seedFromId((shipId || '') + hostName + 'decal');
  /* Placed on the host's REAL surface, not its bounding-box lid. On a sloped
     block (the fighter's wedge forebody) the box top stands well above the
     skin, so a decal keyed to b.max.y floats over the hull. */
  const decalRay = new T.Raycaster();
  const skinY = (x, z) => {
    decalRay.set(new T.Vector3(x, b.max.y + 0.8, z), new T.Vector3(0, -1, 0));
    const h = decalRay.intersectObject(host, false);
    return h.length ? h[0].point.y : null;
  };
  for (let i = 0; i < 3; i++) {
    const w = sx * 0.16, d = sz * (0.08 + rand() * 0.05);
    const offX = sx * (0.2 + rand() * 0.12);
    for (let att = 0; att < 10; att++) {
      const z = b.min.z + sz * (0.12 + ((rand() + att * 0.13) % 0.72));
      const yL = skinY(-offX, z), yR = skinY(offX, z);
      if (yL === null || yR === null || Math.abs(yL - yR) > 0.02) continue;
      /* Also require the patch to be level FORE-AND-AFT. A sloped host (the
         fighter's wedge forebody) reads as level across its width, so a plate
         passed the side-to-side test and then lifted off along the slope. */
      const yF = skinY(offX, z + d / 2), yA = skinY(offX, z - d / 2);
      if (yF === null || yA === null || Math.abs(yF - yA) > 0.02) continue;
      const probe = new T.Box3().setFromCenterAndSize(new T.Vector3(offX, yR, z), new T.Vector3(w, 0.04, d));
      const mirror = new T.Box3().setFromCenterAndSize(new T.Vector3(-offX, yL, z), new T.Vector3(w, 0.04, d));
      if (blockers.some(k => k.intersectsBox(probe) || k.intersectsBox(mirror))) continue;
      [-1, 1].forEach(sd => {
        const decal = box(w, 0.025, d, i % 2 ? matAccent : matPanel,
          ship.name + 'ForeDecal' + i + (sd < 0 ? 'L' : 'R'));
        decal.position.set(sd * offX, (sd < 0 ? yL : yR) - 0.008, z);
        ship.add(decal);
      });
      break;
    }
  }
}
/* Mirrored painted plates on a named module's deck. Kept clear of the rib,
 * cell banks, sponsons, ports and hardpoints, and each candidate is retried
 * along the module before being dropped. */
function moduleDecals(ship, hostName, seed, count) {
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName && !host) host = n; });
  if (!host) return;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
  const keepOut = [];
  ship.traverse(n => {
    if (!n.isMesh) return;
    if (!/dorsalSpine|dorsalBump|vls|turretSponson|turretGusset|Window|laser|missile|particle|iff|factionEmblem|Caution|stabilizer|fwdSponson|dock/i.test(n.name)) return;
    n.updateWorldMatrix(true, false);
    keepOut.push(new T.Box3().setFromObject(n).expandByScalar(0.03));
  });
  const rand = seedFromId(seed + 'moduleDecal');
  const y = b.max.y;
  let placedAny = 0;
  for (let i = 0; i < count; i++) {
    const w = sx * (0.1 + rand() * 0.05), d = sz * (0.08 + rand() * 0.06);
    const offX = sx * (0.3 + rand() * 0.08);
    for (let att = 0; att < 10; att++) {
      const z = b.min.z + sz * (0.12 + ((rand() + att * 0.11) % 0.74));
      const size = new T.Vector3(w, 0.05, d);
      const pl = new T.Box3().setFromCenterAndSize(new T.Vector3(-offX, y, z), size);
      const pr = new T.Box3().setFromCenterAndSize(new T.Vector3(offX, y, z), size);
      if (keepOut.some(k => k.intersectsBox(pl) || k.intersectsBox(pr))) continue;
      [-1, 1].forEach(sd => {
        const decal = box(w, 0.025, d, i % 2 ? matAccent : matNavyPanel,
          hostName + 'ModuleDecal' + i + (sd < 0 ? 'L' : 'R'));
        decal.position.set(sd * offX, y + 0.012, z);
        ship.add(decal);
      });
      placedAny++;
      break;
    }
  }
  /* Guaranteed minimum: with a strict keep-out and a fixed attempt budget,
     whether a module got any plate at all was seed-dependent. If none landed,
     retry against structures only. */
  if (!placedAny) {
    const structural = [];
    ship.traverse(n => {
      if (!n.isMesh) return;
      if (!/dorsalSpine|dorsalBump|vls|turretSponson|dock|cockpitGlass|HullWindow|laser|missile|particle|iff|factionEmblem|stabilizer/i.test(n.name)) return;
      n.updateWorldMatrix(true, false);
      structural.push(new T.Box3().setFromObject(n).expandByScalar(0.02));
    });
    const w = sx * 0.11, d = sz * 0.09, offX = sx * 0.34;
    for (let att = 0; att < 16; att++) {
      const z = b.min.z + sz * (0.1 + att * 0.05);
      const size = new T.Vector3(w, 0.05, d);
      const pl = new T.Box3().setFromCenterAndSize(new T.Vector3(-offX, y, z), size);
      const pr = new T.Box3().setFromCenterAndSize(new T.Vector3(offX, y, z), size);
      if (structural.some(k => k.intersectsBox(pl) || k.intersectsBox(pr))) continue;
      [-1, 1].forEach(sd => {
        const decal = box(w, 0.025, d, matAccent, hostName + 'ModuleDecal9' + (sd < 0 ? 'L' : 'R'));
        decal.position.set(sd * offX, y + 0.012, z);
        ship.add(decal);
      });
      break;
    }
  }
}
/* Comm dish on a hinged boom off a host block's starboard flank, its concave
 * face along the line of travel. Registered as a GEAR EFFECTOR: stowed when
 * the gear is down (a dish this size would be struck on the pad) and swung
 * out when the gear is up. The bowl's geometry sits behind its own origin, so
 * it is zero-centred first — otherwise the assembly separates from its arm. */
/* Every hull carries at least one antenna: a whip on a small base, stood on
 * the measured deck so it works on sloped and stepped hosts alike. */
function mountAntenna(ship, hostName, htRef, zFrac, offXFrac) {
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName && !host) host = n; });
  if (!host) return;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
  const ray = new T.Raycaster();
  for (let att = 0; att < 8; att++) {
    const x = b.min.x + sx * (offXFrac === undefined ? 0.3 : offXFrac);
    const z = b.min.z + sz * ((zFrac === undefined ? 0.4 : zFrac) + att * 0.06) % (sz || 1);
    ray.set(new T.Vector3(x, b.max.y + 0.8, z), new T.Vector3(0, -1, 0));
    const h = ray.intersectObject(host, false);
    if (!h.length) continue;
    const y = h[0].point.y;
    const base = box(0.09, 0.05, 0.09, matPanel, 'antennaBase');
    base.position.set(x, y + 0.015, z); ship.add(base);
    const whip = cyl(0.012, 0.016, htRef * 0.3, matEngine, 'antennaWhip', 6);
    whip.position.set(x, y + htRef * 0.15, z); ship.add(whip);
    const tip = box(0.04, 0.035, 0.04, matCabinLight, 'antennaTipLamp');
    tip.position.set(x, y + htRef * 0.3, z); ship.add(tip);
    return;
  }
}
/* Shuttle service kit on the forward roof: a pair of docking floods, a small
 * pressurant bottle in its clamps, and a coiled umbilical on a reel — the
 * things a short-hop passenger tender actually carries. */
function mountShuttleKit(ship, hostName, htRef) {
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName && !host) host = n; });
  if (!host) return;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
  const ray = new T.Raycaster();
  const skin = (x, z) => { ray.set(new T.Vector3(x, b.max.y + 0.8, z), new T.Vector3(0, -1, 0));
    const h = ray.intersectObject(host, false); return h.length ? h[0].point.y : null; };
  const zFwd = b.min.z + sz * 0.74;

  [-1, 1].forEach(sd => {
    const x = sd * sx * 0.26, y = skin(x, zFwd);
    if (y === null) return;
    const side = sd < 0 ? 'L' : 'R';
    const hood = box(0.11, 0.07, 0.1, matPanel, 'dockFloodHood' + side);
    hood.position.set(x, y + 0.015, zFwd); ship.add(hood);
    const lens = box(0.08, 0.045, 0.05, matCabinLight, 'dockFloodLens' + side);
    lens.position.set(x, y + 0.02, zFwd + 0.05); ship.add(lens);
  });

  const zTank = b.min.z + sz * 0.56, xTank = -sx * 0.22, yT = skin(xTank, zTank);
  if (yT !== null) {
    const bottle = cyl(0.055, 0.055, sz * 0.16, matPanel, 'pressurantBottle', 8);
    bottle.rotation.x = Math.PI / 2;
    bottle.position.set(xTank, yT + 0.035, zTank); ship.add(bottle);
    [-1, 1].forEach((zs, i) => {
      const clamp = cyl(0.065, 0.065, 0.03, matEngine, 'bottleClamp' + i, 8);
      clamp.rotation.x = Math.PI / 2;
      clamp.position.set(xTank, yT + 0.035, zTank + zs * sz * 0.05); ship.add(clamp);
    });
  }
  const zReel = b.min.z + sz * 0.56, xReel = sx * 0.22, yR = skin(xReel, zReel);
  if (yR !== null) {
    const reel = cyl(0.075, 0.075, 0.06, matEngine, 'umbilicalReel', 10);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(xReel, yR + 0.045, zReel); ship.add(reel);
    for (let i = 0; i < 3; i++) {
      const coil = cyl(0.055 + i * 0.008, 0.055 + i * 0.008, 0.016, matPanel, 'umbilicalCoil' + i, 10);
      coil.rotation.z = Math.PI / 2;
      coil.position.set(xReel + (i - 1) * 0.022, yR + 0.045, zReel); ship.add(coil);
    }
    const nz = zReel + sz * 0.06;
    const nozY = skin(xReel, nz);
    const hoseEnd = box(0.05, 0.05, 0.09, matEngine, 'umbilicalNozzle');
    hoseEnd.position.set(xReel, (nozY === null ? yR : nozY) + 0.015, nz); ship.add(hoseEnd);
  }
}
function mountCommDish(ship, hostName, htRef, zFrac, matStruct, matTrim) {
  const mS = matStruct || matNavyPanel, mT = matTrim || matNavyPanel;
  let host = null;
  ship.traverse(n => { if (n.isMesh && n.name === hostName && !host) host = n; });
  if (!host) return;
  host.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(host);
  const span = b.max.z - b.min.z;
  const dishR = Math.min(htRef * 0.3, span * 0.32);
  const armLen = dishR * 3.2;

  const boom = new T.Group();
  boom.name = 'commDishBoom';
  boom.position.set(b.max.x - 0.03, b.min.y + (b.max.y - b.min.y) * 0.5, b.min.z + span * zFrac);
  ship.add(boom);

  const mount = box(0.12, htRef * 0.18, htRef * 0.18, mS, 'commDishMount');
  boom.add(mount);
  const arm = cyl(0.03, 0.03, armLen, matEngine, 'commDishArm', 6);
  arm.rotation.z = Math.PI / 2; arm.position.set(armLen / 2, 0, 0); boom.add(arm);
  const collar = cyl(0.055, 0.055, 0.09, mS, 'commDishArmCollar', 8);
  collar.rotation.z = Math.PI / 2; collar.position.set(armLen * 0.45, 0, 0); boom.add(collar);

  /* Coarse segment counts so the bowl is visibly faceted like everything
     else, and a polygonal cone closes the back rather than a smooth sphere. */
  const mkBowl = (r, mat, nm) => {
    const m = new T.Mesh(new T.SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.44), mat);
    m.name = nm; m.castShadow = true; m.receiveShadow = true;
    m.rotation.x = -Math.PI / 2;
    m.geometry.computeBoundingBox();
    const c = m.geometry.boundingBox.getCenter(new T.Vector3());
    m.position.set(armLen - dishR * 0.2, 0, c.y);   // local +y maps to +z after the turn
    return m;
  };
  const bowl = mkBowl(dishR, matDishSurface, 'commDish');
  boom.add(bowl);
  boom.add(mkBowl(dishR * 0.93, matDishLiner, 'commDishLiner'));
  const back = new T.Mesh(new T.ConeGeometry(dishR * 0.98, dishR * 0.7, 8), mT);
  back.name = 'commDishBackshell'; back.castShadow = true; back.receiveShadow = true;
  back.rotation.x = Math.PI / 2;
  back.position.set(armLen - dishR * 0.2, 0, bowl.position.z - dishR * 0.34); boom.add(back);
  const hub = cyl(dishR * 0.2, dishR * 0.2, 0.04, mT, 'commDishHub', 10);
  hub.rotation.x = Math.PI / 2; hub.position.set(armLen - dishR * 0.2, 0, dishR * 0.16); boom.add(hub);
  for (let r = 0; r < 4; r++) {
    const rib = box(dishR * 1.5, 0.025, 0.03, mT, 'commDishRib' + r);
    rib.rotation.z = (r * Math.PI) / 4;
    rib.position.set(armLen - dishR * 0.2, 0, dishR * 0.16); boom.add(rib);
  }
  const feed = cyl(0.016, 0.016, dishR * 1.1, matEngine, 'commDishFeed', 6);
  feed.rotation.z = Math.PI / 2; feed.position.set(armLen - dishR * 0.9, 0, 0); boom.add(feed);

  /* t: 1 = gear down (stowed, folded aft along the flank), 0 = gear up
     (extended athwartships). */
  const stowedY = -1.45;
  boom.userData.gearEffector = t => { boom.rotation.y = stowedY * t; };
  boom.rotation.y = stowedY;                        // ships are built gear-down
}
function mountCockpitInterior(ship) {
  const cfg = COCKPIT_STYLES[ship.name];
  if (!cfg) return;
  let glass = null;
  ship.traverse(n => { if (n.isMesh && n.name === 'cockpitGlass' && !glass) glass = n; });
  if (!glass) return;
  glass.updateWorldMatrix(true, false);
  const b = new T.Box3().setFromObject(glass);
  const w = b.max.x - b.min.x, h = b.max.y - b.min.y;
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
  const depth = Math.max(0.32, h * 1.15);
  /* Everything is measured inboard from the glass's REAR face, never from its
     centre. A faceted canopy has real depth, so a centre-relative offset stayed
     inside the hull; a thin face panel at the ship's frontmost plane does not,
     and the dash/MFD/HUD ended up in open air ahead of the nose. */
  const zIn = b.min.z;

  const grp = new T.Group(); grp.name = 'cockpitInterior';
  grp.userData.hudStyle = cfg.hudStyle;
  grp.userData.mfdLayout = cfg.layout;
  grp.userData.styleNote = cfg.note;

  // dash bulkhead — overlaps the glass so the tub is structurally attached
  const dashW = w * 0.92, dashH = h * 0.4, dashD = 0.07;
  const dash = box(dashW, dashH, dashD, matCockpitShell, 'dashPanel');
  dash.rotation.x = -0.3;
  dash.position.set(cx, cy - h * 0.08, zIn - dashD / 2 - 0.03);
  grp.add(dash);

  // blank MFD recesses — placeholders for per-class panel art, not modelled here
  const n = cfg.mfdCount;
  const slotW = Math.min(dashW * 0.9 / n, 0.5), slotH = dashH * 0.55;
  const spanW = n > 1 ? dashW * 0.78 : slotW;
  for (let i = 0; i < n; i++) {
    const fx = n > 1 ? -spanW / 2 + slotW * 0.55 + i * (spanW - slotW) / Math.max(1, n - 1) : 0;
    const slot = box(slotW * 0.86, slotH, 0.02, matMfdSlot, 'mfdSlot' + i);
    slot.position.set(cx + fx, cy - h * 0.06, zIn - 0.02);
    grp.add(slot);
  }

  // HUD combiner pane between the dash and the canopy glass
  const hud = box(w * 0.3, h * 0.2, 0.02, matHudGlass, 'hudCombiner');
  hud.rotation.x = -0.55;
  hud.position.set(cx, cy + h * 0.16, zIn - 0.05);
  grp.add(hud);

  // seat, set back from the dash toward the ship's centre
  const seatW = Math.min(w * 0.45, 0.5), seatH = h * 0.5, seatD = depth * 0.4;
  const seat = box(seatW, seatH, seatD, matSeat, 'pilotSeat');
  seat.position.set(cx, cy - h * 0.3, zIn - dashD - seatD / 2 - 0.04);
  grp.add(seat);
  const seatBack = box(seatW, seatH * 0.95, 0.05, matSeat, 'pilotSeatBack');
  seatBack.position.set(cx, cy - h * 0.3 + seatH * 0.4, seat.position.z - seatD / 2 - 0.02);
  grp.add(seatBack);

  ship.add(grp);
}
/* L-shaped dorsal conduit greebles: a long bar coaxial with the engine axis
 * (the ship's length) plus a short bar breaking off to one side, tiled
 * repeatedly along a host's top face so the whole dorsal plate reads as
 * covered rather than sparsely decorated. Alternates which side the short
 * leg breaks toward, cell to cell. */
function sprinkleDorsalLGreebles(ship, hostNames, tag) {
  const hosts = [];
  ship.traverse(n => { if (n.isMesh && hostNames.test(n.name)) hosts.push(n); });
  /* Yields to functional fittings, like every other clutter pass. This runs
     after the IFF array is sited, so without a keep-out the conduit cells tile
     straight over the faction lamps. */
  const keepOut = [];
  ship.traverse(n => {
    if (!n.isMesh) return;
    if (!/^iff|vls|dorsalBump|dorsalSpine|stabilizer|turret|Window|cockpitGlass|canopyFairing|navLight|Caution|pressureTank|tankCradle|ventStack|ventLamp|manifold|valve|cargoContainer|passengerPod|corridor|gantry|factionEmblem|bowSkylight|AftDecal|AftGreeble|antenna|mast|dome|bridge/i.test(n.name)) return;
    n.updateWorldMatrix(true, false);
    keepOut.push(new T.Box3().setFromObject(n).expandByScalar(0.03));
  });
  const clear = bx => !keepOut.some(k => k.intersectsBox(bx));
  hosts.forEach((host, hi) => {
    host.updateWorldMatrix(true, false);
    const b = new T.Box3().setFromObject(host);
    const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z, topY = b.max.y;
    const cellLen = Math.max(0.35, Math.min(0.55, sz / 3));
    const cells = Math.max(1, Math.round(sz / cellLen));
    const barH = 0.045, barW = 0.05;
    for (let c = 0; c < cells; c++) {
      const z = b.min.z + sz * ((c + 0.5) / cells);
      const sd = (c + hi) % 2 === 0 ? 1 : -1;
      const longLen = cellLen * 0.86;
      const longX = sd * (sx * 0.5 - sx * 0.14);
      const shortLen = sx * 0.5 - Math.abs(longX) + barW / 2 + 0.02;
      const longPos = new T.Vector3(longX, topY + barH / 2 - 0.01, z);
      const shortPos = new T.Vector3(sd * (sx / 2 - shortLen / 2 + 0.01), topY + barH / 2 - 0.01,
        z - longLen / 2 + barW / 2);
      const probeLong = new T.Box3().setFromCenterAndSize(longPos, new T.Vector3(barW, barH, longLen));
      const probeShort = new T.Box3().setFromCenterAndSize(shortPos, new T.Vector3(shortLen, barH, barW));
      if (!clear(probeLong) || !clear(probeShort)) continue;
      const long = box(barW, barH, longLen, matPanel, tag + 'DorsalLLong' + hi + c);
      long.position.copy(longPos); ship.add(long);
      const short = box(shortLen, barH, barW, matEngine, tag + 'DorsalLShort' + hi + c);
      short.position.copy(shortPos); ship.add(short);
    }
  });
}
/* Final settle pass. Placement gates run mid-build, so they cannot see parts
 * added later — a plate judged flush can end up straddling a shroud, wing or
 * coaming fitted afterwards. This runs on the COMPLETE ship: every flat plate
 * is re-seated onto the surface actually beneath it, and any that cannot lie
 * flush (overhanging an edge, or bridging a slope) is removed rather than left
 * hovering. */
/* Triangular plate: a wedge deck narrows toward the nose, so a rectangular
 * panel always overhangs one side or bridges the taper. A triangle follows it. */
function trianglePlate(name, w, d, h, mat) {
  const shape = new T.Shape();
  shape.moveTo(-w / 2, -d / 2);
  shape.lineTo(w / 2, -d / 2);
  shape.lineTo(0, d / 2);
  shape.lineTo(-w / 2, -d / 2);
  const geo = new T.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -h / 2);
  geo.rotateX(-Math.PI / 2);
  const m = new T.Mesh(geo, mat);
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  return m;
}
function settleFlatPlates(ship) {
  const hosts = [];
  ship.traverse(n => {
    if (n.isMesh && /^hull|Forebody|noseNeck|^wing|^stabil|^engine|Section|^gantry|^dorsal|cargoContainer|passengerPod|pressureTank|^tankBay|Sponson|Platform|^aftPlug|^tower|Cradle|Coaming|^portSideRib/.test(n.name)) hosts.push(n);
  });
  if (!hosts.length) return;
  const plates = [];
  ship.traverse(n => { if (n.isMesh && /Decal/.test(n.name)) plates.push(n); });
  const ray = new T.Raycaster();
  const doomed = [];
  plates.forEach(p => {
    p.updateWorldMatrix(true, false);
    const b = new T.Box3().setFromObject(p);
    const c = b.getCenter(new T.Vector3());
    const hx = (b.max.x - b.min.x) * 0.5, hz = (b.max.z - b.min.z) * 0.5;
    const top = b.max.y + 1;
    ray.set(new T.Vector3(c.x, top, c.z), new T.Vector3(0, -1, 0));
    const centre = ray.intersectObjects(hosts, false)[0];
    if (!centre) { doomed.push(p); return; }
    const host = centre.object;
    const ys = [[c.x, c.z + hz], [c.x, c.z - hz], [c.x + hx, c.z], [c.x - hx, c.z]].map(([x, z]) => {
      ray.set(new T.Vector3(x, top, z), new T.Vector3(0, -1, 0));
      const h = ray.intersectObject(host, false);
      return h.length ? h[0].point.y : null;
    });
    if (ys.some(v => v === null) || Math.max(...ys) - Math.min(...ys) > 0.02) { doomed.push(p); return; }
    p.position.y += (Math.max(...ys) - 0.012) - b.min.y;
    /* Confirm real contact after moving. A plate re-seated across a seam can
       end up touching nothing, which reads as a floating island. */
    /* Confirm real contact after moving, sinking further if needed. A plate
       re-seated across a seam can still touch nothing at the nominal depth,
       which reads as a floating island. */
    /* Uses the SAME rule the connectivity check applies — any mesh, expanded
       slightly — so a plate that passes here cannot be reported as an island. */
    const allMeshes = [];
    ship.traverse(n => { if (n.isMesh && !/Decal/.test(n.name)) allMeshes.push(n); });
    const touching = () => {
      p.updateWorldMatrix(true, false);
      const nb = new T.Box3().setFromObject(p).expandByScalar(0.012);
      return allMeshes.some(hh => {
        hh.updateWorldMatrix(true, false);
        return nb.intersectsBox(new T.Box3().setFromObject(hh));
      });
    };
    let sunk = 0;
    while (!touching() && sunk < 5) { p.position.y -= 0.012; sunk++; }
    if (!touching()) doomed.push(p);
  });
  doomed.forEach(p => p.parent && p.parent.remove(p));
}
function finalize(ship, scale = 1) {
  /* Top-up FIRST, then settle: a plate added after the sweep is never
     validated, which is how the small hauler ended up with an overhanging
     emergency marking. */
  /* Settling can legitimately discard every plate on a hull whose decks are
     fully occupied (the small hydrogen hauler), so top back up afterwards:
     find any flush patch on a structural surface and lay one mirrored pair. */
  {
    let any = false;
    ship.traverse(n => { if (n.isMesh && /Decal/.test(n.name)) any = true; });
    if (!any) {
      const hosts = [];
      ship.traverse(n => { if (n.isMesh && /^hullMain$|^hullSection\d+$|^engineBayExtension$|^aftPlug$|^tankBay\d+$/.test(n.name)) hosts.push(n); });
      const ray = new T.Raycaster();
      outer: for (const host of hosts) {
        host.updateWorldMatrix(true, false);
        const hb = new T.Box3().setFromObject(host);
        const sx = hb.max.x - hb.min.x, sz = hb.max.z - hb.min.z;
        /* Shrink until it fits: on a hull whose decks are almost entirely
           occupied there may be no flush patch at the nominal size, and a
           plate that cannot lie flat is discarded by the settle pass. */
        for (const shrink of [1, 0.7, 0.5, 0.35, 0.25]) {
        const w = Math.min(sx * 0.16, 0.3) * shrink, d = Math.min(sz * 0.1, 0.3) * shrink;
        for (let i = 0; i <= 12; i++) {
          const z = hb.min.z + sz * (0.08 + i * 0.07);
          const offX = sx * 0.28;
          const flat = sd => {
            const pts = [[sd * offX, z + d * 0.5], [sd * offX, z - d * 0.5],
                         [sd * offX + w * 0.5, z], [sd * offX - w * 0.5, z]];
            const ys = pts.map(([x, zz]) => { ray.set(new T.Vector3(x, hb.max.y + 1, zz), new T.Vector3(0, -1, 0));
              const h = ray.intersectObject(host, false); return h.length ? h[0].point.y : null; });
            if (ys.some(v => v === null)) return null;
            return Math.max(...ys) - Math.min(...ys) > 0.02 ? null : Math.max(...ys);
          };
          const yL = flat(-1), yR = flat(1);
          /* A mirrored pair is preferred, but a single plate beats none: on a
             crowded deck only one flank may offer a flat patch, and demanding
             both left two hulls with no markings at all. */
          if (yL === null && yR === null) continue;
          [[-1, yL], [1, yR]].forEach(([sd, y]) => {
            if (y === null) return;
            const dc = box(w, 0.025, d, matAccent, 'settledDecal' + (sd < 0 ? 'L' : 'R'));
            dc.position.set(sd * offX, y - 0.008, z);
            ship.add(dc);
          });
          break outer;
        }
        }
      }
    }
  }
  settleFlatPlates(ship);
  /* Absolute guarantee, applied AFTER settling so nothing can discard it: if a
     hull still carries no marking, probe its largest deck with a small patch
     and lay one there. Verified flush on placement, so it needs no settling. */
  {
    let any = false;
    ship.traverse(n => { if (n.isMesh && /Decal/.test(n.name)) any = true; });
    if (!any) {
      const decks = [];
      ship.traverse(n => { if (n.isMesh && /^hullMain$|^hullSection\d+$|^engineBayExtension$|^aftPlug$/.test(n.name)) decks.push(n); });
      decks.sort((a, b) => {
        const ab = new T.Box3().setFromObject(a), bb = new T.Box3().setFromObject(b);
        return (bb.max.z - bb.min.z) - (ab.max.z - ab.min.z);
      });
      const ray = new T.Raycaster();
      for (const deck of decks) {
        deck.updateWorldMatrix(true, false);
        const hb = new T.Box3().setFromObject(deck);
        const sx = hb.max.x - hb.min.x, sz = hb.max.z - hb.min.z;
        const w = Math.min(sx * 0.1, 0.14), d = Math.min(sz * 0.05, 0.14);
        let done = false;
        for (let i = 0; i <= 14 && !done; i++) {
          const z = hb.min.z + sz * (0.08 + i * 0.06);
          for (const sd of [1, -1]) {
            const ox = sd * sx * 0.26;
            const pts = [[ox, z + d / 2], [ox, z - d / 2], [ox + w / 2, z], [ox - w / 2, z]];
            const ys = pts.map(([x, zz]) => { ray.set(new T.Vector3(x, hb.max.y + 1, zz), new T.Vector3(0, -1, 0));
              const h = ray.intersectObject(deck, false); return h.length ? h[0].point.y : null; });
            if (ys.some(v => v === null) || Math.max(...ys) - Math.min(...ys) > 0.02) continue;
            /* The deck must also be the TOPMOST surface here. A tank or pod
               overhanging the spot means the marking would be tucked under it
               and read as sitting on nothing. */
            const others = [];
            ship.traverse(n => { if (n.isMesh && n !== deck && !/Decal|hullMarking/.test(n.name)) others.push(n); });
            const blocked = pts.some(([x, zz]) => {
              ray.set(new T.Vector3(x, hb.max.y + 2, zz), new T.Vector3(0, -1, 0));
              const h = ray.intersectObjects(others, false);
              return h.length && h[0].point.y > Math.max(...ys) + 0.01;
            });
            if (blocked) continue;
            const dc = box(w, 0.025, d, matAccent, 'hullMarking');
            dc.position.set(ox, Math.max(...ys) - 0.008, z);
            ship.add(dc);
            done = true; break;
          }
        }
        if (done) break;
      }
    }
  }
  // painted faction panels are redundant now the IFF array carries affiliation
  ship.traverse(n => { if (n.isMesh && /accentStripe|hazardFlank/.test(n.name)) n.material = matPanel; });
  ship.scale.setScalar(scale);
  const b = new T.Box3().setFromObject(ship);
  const c = b.getCenter(new T.Vector3());
  /* Centre laterally on the PRIMARY HULL, not the overall bounds: a
     deliberately asymmetric appendage (a side outrigger, say) would otherwise
     drag the whole hull off its own centreline. */
  let hull = null;
  ship.traverse(n => { if (n.isMesh && n.name === 'hullMain' && !hull) hull = n; });
  let cx = c.x;
  if (hull) {
    hull.updateWorldMatrix(true, false);
    cx = new T.Box3().setFromObject(hull).getCenter(new T.Vector3()).x;
  }
  ship.position.x -= cx;
  ship.position.z -= c.z;
  ship.position.y -= b.min.y;
  return ship;
}

// ---------- TRADER ----------
// S: single engine, no tail fin. M: twin engines + tail fin. L: triple engines,
// twin fins, dorsal cargo blister, six legs.
const TRADER = {
  S: { len: 1.9, wid: 1.3, ht: 0.8, engX: [0], engR: 0.34, fins: 0, blister: false, wingSpan: 0.9, wingRoot: 1.2, gearMid: false },
  M: { len: 2.4, wid: 1.5, ht: 0.9, engX: [-0.5, 0.5], engR: 0.32, fins: 1, blister: false, wingSpan: 1.1, wingRoot: 1.5, gearMid: false },
  L: { len: 3.1, wid: 1.75, ht: 1.0, engX: [-0.62, 0, 0.62], engR: 0.33, fins: 2, blister: true, wingSpan: 1.35, wingRoot: 1.8, gearMid: true }
};
export function buildTrader(size = 'M', shipId = 'SS-00000') {
  const v = TRADER[size] || TRADER.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'traderShip';

  const hullMain = box(wid, ht, len, matHull, 'hullMain'); hullMain.position.set(0, ht / 2, 0); ship.add(hullMain);
  const nose = box(wid * 0.67, ht * 0.72, 1.8, matHull, 'hullNose'); nose.position.set(0, ht * 0.64, len / 2 + 0.75); ship.add(nose);
  const noseTip = box(wid * 0.37, ht * 0.45, 0.5, matPanel, 'hullNoseTip'); noseTip.position.set(0, ht * 0.55, len / 2 + 1.8); ship.add(noseTip);

  // fairing runs forward from the dorsal deck onto the nose block
  const fairLen = len * 0.42 + 0.75;
  const canopy = wedgeCockpit('canopyFairing', wid * 0.42, ht * 0.23, fairLen);
  canopy.position.set(0, ht - 0.04, len / 2 + 0.28 - fairLen / 2 + 0.35); ship.add(canopy);

  const stripe = box(wid * 0.45, 0.03, 0.4, matAccent, 'accentStripe');
  stripe.position.set(0, ht * 0.47 + ht * 0.36 + 0.006, len / 2 + 0.32); ship.add(stripe);

  mountProwGlass(ship, 'hullNoseTip', 0.82, 0.6, 0.5);

  const greebleGeo = new T.BoxGeometry(0.06, ht * 0.24, 0.3);
  [-len * 0.26, 0, len * 0.26].forEach((z, i) => {
    [-1, 1].forEach(s => {
      const g = new T.Mesh(greebleGeo, matPanel);
      g.name = 'ventGreeble' + i + (s < 0 ? 'L' : 'R'); g.castShadow = true; g.receiveShadow = true;
      g.position.set(s * (wid / 2), ht / 2, z); ship.add(g);
    });
  });

  ship.add(deltaWingPair('wing', wid / 2, v.wingSpan, v.wingRoot, v.wingRoot * 0.53, 0.08, ht * 0.47, -0.3));
  // canards at ~30% of wing scale, carried on the protruding nose section
  ship.add(deltaWingPair('canard', wid * 0.335, v.wingSpan * 0.3, v.wingRoot * 0.3,
    v.wingRoot * 0.3 * 0.55, 0.06, ht * 0.62, len / 2 + 0.95));

  if (v.fins === 1) {
    const fin = finPlate('stabilizerFin', 0.15, ht * 0.66, 0.7, 0.3);
    fin.position.set(0, ht - 0.03, -len / 2 + 0.4); ship.add(fin);
  } else if (v.fins === 2) {
    [-1, 1].forEach(s => {
      const fin = finPlate('stabilizerFin' + (s < 0 ? 'L' : 'R'), 0.13, ht * 0.6, 0.65, 0.28);
      fin.position.set(s * wid * 0.24, ht - 0.03, -len / 2 + 0.4); ship.add(fin);
    });
  }
  if (v.blister) {
    const bl = box(wid * 0.5, 0.26, 0.9, matPanel, 'dorsalCargoBlister');
    bl.position.set(0, ht + 0.1, 0); ship.add(bl);
  }

  // square drive grid
  mountEngineCluster(ship, 'square', v.engX.length, v.engR, 0.9, ht / 2, -len / 2 - 0.35, ht, -len / 2, wid);

  [-1, 1].forEach(sd => {
    const mast = cyl(0.02, 0.02, 0.35, matPanel, 'antennaMast' + (sd < 0 ? 'L' : 'R'));
    mast.position.set(sd * wid * 0.28, ht + 0.16, -len / 2 + 0.75); ship.add(mast);
    const tip = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), matAccent);
    tip.name = 'antennaTip' + (sd < 0 ? 'L' : 'R');
    tip.position.set(sd * wid * 0.28, ht + 0.34, -len / 2 + 0.75); ship.add(tip);
  });

  const legLen = ht * 0.5;
  // hardpoint count scales with hull size
  // ventral hardpoint rail — a rectangular prism the laser mounts bolt onto
  const railW = wid * 0.52, railH = ht * 0.13;
  const noseBottomY = ht * 0.64 - ht * 0.36;
  const rail = box(railW, railH, 1.0, matPanel, 'hardpointRail');
  rail.position.set(0, noseBottomY + railH * 0.3, len / 2 + 0.55); ship.add(rail);
  ({ S: [0], M: [-0.62, 0.62], L: [-0.78, 0, 0.78] }[size] || [0]).forEach((fx, i) =>
    mountBellyGun(ship, 'hardpointRail', fx, 'laserBelly' + i, 0.1));

  // wing missile hardpoints, staggered above/below as elsewhere in the fleet
  const tWingY = ht * 0.47, tWingZ = -0.3;
  ({ S: [0.3], M: [0.28, 0.52], L: [0.24, 0.44, 0.64] }[size] || [0.3]).forEach((fr, i) => {
    const above = i % 2 === 0;
    [-1, 1].forEach(sd => ship.add(missilePod('missile' + i + (sd < 0 ? 'Left' : 'Right'),
      sd * (wid / 2 + v.wingSpan * fr), above ? tWingY + 0.1 : tWingY - 0.1,
      tWingZ - 0.1 - fr * 0.3, above)));
  });

  ship.add(landingLeg('gearNose', 0, len / 2 - 0.2, legLen, 0.11));
  ship.add(landingLeg('gearRearLeft', -wid * 0.4, -len / 2 + 0.55, legLen, 0.13));
  ship.add(landingLeg('gearRearRight', wid * 0.4, -len / 2 + 0.55, legLen, 0.13));
  if (v.gearMid) {
    ship.add(landingLeg('gearMidLeft', -wid * 0.42, 0.1, legLen, 0.13));
    ship.add(landingLeg('gearMidRight', wid * 0.42, 0.1, legLen, 0.13));
  }
  mountCockpitInterior(ship);
  dressForeHull(ship, shipId, 'hullNose');
  // order matters: windows, IFF and plumbing are functional and go on first,
  // then greebles fill what's left, keeping clear of all of it
  detailCompartments(ship, shipId);
  if (size === 'L') mountCommDish(ship, 'hullNose', ht, 0.4, matPanel, matHull);
  mountNavLights(ship);
  return finalize(ship);
}

// ---------- FREIGHTER ----------
// Cargo hauler. Not a combat hull, so the bigger marks are simply more fat
// hold sections strung together on thin gantry spines (half the section width,
// two-thirds its height). S: one section. M: two. L: three, double-stacked.
const FREIGHTER = {
  S: { len: 3.6, wid: 2.2, ht: 1.1, sections: 1, rowsPerSection: 2, tiers: false, engX: [-0.7, 0.7], engR: 0.4, rails: false, wingSpan: 1.3, wingRoot: 1.6 },
  M: { len: 5.4, wid: 2.8, ht: 1.3, sections: 2, rowsPerSection: 2, tiers: false, engX: [-0.85, 0.85], engR: 0.46, rails: true, wingSpan: 1.6, wingRoot: 1.9 },
  L: { len: 7.4, wid: 3.3, ht: 1.5, sections: 3, rowsPerSection: 2, tiers: true, engX: [-1.0, 0, 1.0], engR: 0.5, rails: true, wingSpan: 1.9, wingRoot: 2.2 }
};
export function buildFreighter(size = 'M', shipId = 'FH-00000') {
  const v = FREIGHTER[size] || FREIGHTER.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'freighterShip';

  // lay out fat sections separated by gantries, front to back
  const gantryCount = v.sections - 1;
  const gantryLen = len * 0.1;
  const sectionLen = (len - gantryCount * gantryLen) / v.sections;
  const sectionZ = [], gantryZ = [];
  let cursor = len / 2;
  for (let i = 0; i < v.sections; i++) {
    sectionZ.push(cursor - sectionLen / 2);
    cursor -= sectionLen;
    if (i < gantryCount) { gantryZ.push(cursor - gantryLen / 2); cursor -= gantryLen; }
  }
  sectionZ.forEach((z, i) => {
    const sec = box(wid, ht, sectionLen, matHull, i === 0 ? 'hullMain' : 'hullSection' + i);
    sec.position.set(0, ht / 2, z); ship.add(sec);
  });
  gantryZ.forEach((z, i) => {
    // thin connecting spine: half the section width, two-thirds its height
    const g = box(wid * 0.5, ht * (2 / 3), gantryLen + 0.06, matPanel, 'gantry' + i);
    g.position.set(0, ht / 2, z); ship.add(g);
    [-1, 1].forEach(sd => {
      const rib = box(wid * 0.54, ht * 0.1, 0.08, matEngine, 'gantryRib' + i + (sd < 0 ? 'L' : 'R'));
      rib.position.set(0, ht / 2 + sd * ht * 0.28, z); ship.add(rib);
    });
  });

  const nose = box(wid * 0.57, ht * 0.73, 1.8, matHull, 'hullNose'); nose.position.set(0, ht * 0.635, len / 2 + 0.75); ship.add(nose);

  const fFairLen = 1.05 + 0.8;
  const canopy = wedgeCockpit('canopyFairing', wid * 0.32, 0.24, fFairLen);
  canopy.position.set(0, ht - 0.05, len / 2 + 0.3 - fFairLen / 2 + 0.35); ship.add(canopy);

  const noseStripe = box(wid * 0.45, 0.03, 0.4, matAccent, 'accentStripe');
  noseStripe.position.set(0, ht * 0.46 + ht * 0.365 + 0.006, len / 2 + 0.35); ship.add(noseStripe);

  mountProwGlass(ship, 'hullNose', 0.62, 0.42, 0.5);

  // half-height containers, ranked over each fat section, colours mixed
  const contH = 0.3;
  const rowPitch = sectionLen / v.rowsPerSection;
  const contLen = rowPitch * 0.7;
  let ci = 0;
  sectionZ.forEach((secZ, si) => {
    for (let r = 0; r < v.rowsPerSection; r++) {
      const z = secZ + (r - (v.rowsPerSection - 1) / 2) * rowPitch;
      if (si === 0 && z > len / 2 - 1.0) continue;   // keep the cockpit deck clear
      [-1, 1].forEach(sd => {
        const c = new T.Mesh(new T.BoxGeometry(wid * 0.38, contH, contLen), CARGO_MATS[(ci * 5 + si * 2) % CARGO_MATS.length]);
        c.name = 'cargoContainer' + si + '_' + r + (sd < 0 ? 'L' : 'R'); c.castShadow = true; c.receiveShadow = true;
        c.position.set(sd * wid * 0.2, ht + contH / 2, z); ship.add(c);
        if (v.tiers && si > 0) {
          const u = new T.Mesh(new T.BoxGeometry(wid * 0.38, contH, contLen), CARGO_MATS[(ci * 3 + 4) % CARGO_MATS.length]);
          u.name = 'cargoContainerUpper' + si + '_' + r + (sd < 0 ? 'L' : 'R'); u.castShadow = true; u.receiveShadow = true;
          u.position.set(sd * wid * 0.2, ht + contH * 1.5, z); ship.add(u);
        }
        ci++;
      });
    }
  });

  if (v.rails) {
    sectionZ.forEach((z, i) => {
      [-1, 1].forEach(sd => {
        const rail = box(0.08, 0.08, sectionLen * 0.9, matPanel, 'cargoRail' + i + (sd < 0 ? 'Left' : 'Right'));
        rail.position.set(sd * (wid / 2 - 0.12), ht, z); ship.add(rail);
      });
    });
  }

  // wings on the aft-most fat section
  const fWingY = ht * 0.42, fWingZ = sectionZ[sectionZ.length - 1];
  const fWing = kinkedWingPair('wing', wid / 2, v.wingSpan, v.wingRoot, v.wingRoot * 0.78, v.wingRoot * 0.55, 0.1, fWingY, fWingZ, 0.24, 1 / 3);
  ship.add(fWing.group);

  // square drive grid
  mountEngineCluster(ship, 'square', v.engX.length + 1, v.engR, 1.25, ht / 2, -len / 2 - 0.6, ht, -len / 2, wid);

  ({ S: [-0.6, 0.6], M: [-0.85, -0.35, 0.35, 0.85], L: [-0.9, -0.55, -0.2, 0.2, 0.55, 0.9] }[size] || [-0.6, 0.6])
    .forEach((fx, i) => mountBellyGun(ship, 'hullNose', fx, 'laserBelly' + i, 0.22));

  // one gear pair under each fat section; a single-section hull still needs
  // fore and aft pairs to sit stably under load
  const legLen = ht * 0.5;
  const gearZ = v.sections === 1
    ? [sectionZ[0] + sectionLen * 0.3, sectionZ[0] - sectionLen * 0.3]
    : sectionZ;
  gearZ.forEach((z, i) => {
    [-1, 1].forEach(sd => {
      ship.add(landingLeg('gear' + i + (sd < 0 ? 'Left' : 'Right'), sd * (wid / 2 - 0.3), z, legLen, 0.2, 0.06));
    });
  });
  mountCockpitInterior(ship);
  // order matters: windows, IFF and plumbing are functional and go on first,
  // then greebles fill what's left, keeping clear of all of it
  detailCompartments(ship, shipId);
  if (size !== 'S') mountEngineShroud(ship, 'freighter', matPanel);
  mountNavLights(ship);
  return finalize(ship);
}

// ---------- POLICE ----------
// S: interceptor — single engine, lasers only, single roof beacon.
// M: patrol — twin engines, light bar, two missiles.
// L: cutter — sensor mast, twin fins, four missiles.
const POLICE = {
  S: { len: 1.9, wid: 1.1, ht: 0.65, engX: [0], engR: 0.3, missiles: 0, mast: false, fins: 0, wingSpan: 0.85, wingRoot: 1.1, bar: false },
  M: { len: 2.3, wid: 1.3, ht: 0.75, engX: [-0.42, 0.42], engR: 0.28, missiles: 2, mast: false, fins: 0, wingSpan: 1.0, wingRoot: 1.3, bar: true },
  L: { len: 2.9, wid: 1.5, ht: 0.85, engX: [-0.5, 0.5], engR: 0.32, missiles: 4, mast: true, fins: 2, wingSpan: 1.2, wingRoot: 1.6, bar: true }
};
export function buildPolice(size = 'M', shipId = 'POL-0000') {
  const v = POLICE[size] || POLICE.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'policeShip';

  const hullMain = box(wid, ht, len, matHull, 'hullMain'); hullMain.position.set(0, ht / 2, 0); ship.add(hullMain);
  const nose = box(wid * 0.65, ht * 0.73, 1.7, matHull, 'hullNose'); nose.position.set(0, ht * 0.635, len / 2 + 0.7); ship.add(nose);
  // interceptor prow IS the cockpit screen — same faceted canopy as the rest
  // of the fleet, just carried right at the tip of the nose
  const prow = facetedCanopy('cockpitGlass', wid * 0.34, ht * 0.4, ht * 0.44, ht * 0.16, matGlass);
  prow.position.set(0, ht * 0.4, len / 2 + 1.5); ship.add(prow);

  const pFairLen = 0.95 + 0.75;
  const canopy = wedgeCockpit('canopyFairing', wid * 0.43, ht * 0.25, pFairLen);
  canopy.position.set(0, ht - 0.05, len / 2 + 0.26 - pFairLen / 2 + 0.32); ship.add(canopy);

  const stripe = box(wid * 0.45, 0.03, 0.35, matAccent, 'accentStripe'); stripe.position.set(0, ht * 0.47 + ht * 0.365 + 0.006, len / 2 + 0.3); ship.add(stripe);

  const barZ = -len * 0.12;
  if (v.bar) {
    const barBase = box(wid * 0.4, 0.06, 0.16, matPanel, 'lightBarBase'); barBase.position.set(0, ht + 0.03, barZ); ship.add(barBase);
    const bBlue = box(0.18, 0.06, 0.13, matBeaconBlue, 'beaconBlue'); bBlue.position.set(-0.13, ht + 0.06, barZ); ship.add(bBlue);
    const bRed = box(0.18, 0.06, 0.13, matBeaconRed, 'beaconRed'); bRed.position.set(0.13, ht + 0.06, barZ); ship.add(bRed);
  } else {
    const dome = new T.Mesh(new T.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), matBeaconBlue);
    dome.name = 'beaconBlue'; dome.castShadow = true; dome.position.set(0, ht - 0.01, barZ); ship.add(dome);
  }
  if (v.mast) {
    const mast = cyl(0.025, 0.025, 0.4, matPanel, 'sensorMast'); mast.position.set(0, ht + 0.18, -len / 2 + 0.95); ship.add(mast);
    const dish = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), matPanel); dish.name = 'sensorDish'; dish.castShadow = true;
    dish.position.set(0, ht + 0.4, -len / 2 + 0.95); ship.add(dish);
  }
  if (v.fins === 2) {
    [-1, 1].forEach(s => {
      const fin = finPlate('stabilizerFin' + (s < 0 ? 'L' : 'R'), 0.12, ht * 0.6, 0.6, 0.26);
      fin.position.set(s * wid * 0.25, ht - 0.03, -len / 2 + 0.45); ship.add(fin);
    });
  }

  const wingY = ht * 0.45, wingZ = -len * 0.15;
  const pWing = kinkedWingPair('wing', wid / 2, v.wingSpan, v.wingRoot, v.wingRoot * 0.72, v.wingRoot * 0.55, 0.07, wingY, wingZ, -0.36, 2 / 3);
  ship.add(pWing.group);

  // hardpoints: lasers slung under the nose, missiles under the wings
  const noseBottom = ht * 0.27;
  ({ S: [-0.23, 0.23], M: [-0.23, 0.23], L: [-0.34, -0.18, 0.18, 0.34] }[size] || [-0.23, 0.23])
    .forEach((fx, i) => ship.add(laserCannon('laser' + i, fx * wid, noseBottom - 0.055, len / 2 + 0.78)));
  // racks staggered along the span: one per station, alternating above / below,
  // rather than doubling up on both faces of the same station
  const podLow = wingY - 0.1, podHigh = wingY + 0.1;
  const stations = { S: [], M: [0.2, 0.44], L: [0.14, 0.3, 0.45, 0.6] }[size] || [];
  stations.forEach((fr, i) => {
    const above = i % 2 === 0;
    [-1, 1].forEach(sd => ship.add(missilePod(
      'missile' + i + (sd < 0 ? 'Left' : 'Right'),
      sd * (wid / 2 + v.wingSpan * fr),
      above ? podHigh : podLow,
      wingZ - 0.1 - fr * 0.4,
      above)));
  });

  mountEngineCluster(ship, 'square', v.engX.length, v.engR, 0.8, ht * 0.5, -len / 2 - 0.3, ht, -len / 2, wid);

  const legLen = ht * 0.48;
  ship.add(landingLeg('gearNose', 0, len / 2 - 0.2, legLen, 0.1));
  ship.add(landingLeg('gearRearLeft', -wid * 0.4, -len / 2 + 0.5, legLen, 0.11));
  ship.add(landingLeg('gearRearRight', wid * 0.4, -len / 2 + 0.5, legLen, 0.11));
  mountCockpitInterior(ship);
  dressForeHull(ship, shipId, 'hullNose');
  // order matters: windows, IFF and plumbing are functional and go on first,
  // then greebles fill what's left, keeping clear of all of it
  detailCompartments(ship, shipId);
  mountNavLights(ship);
  return finalize(ship);
}

// ---------- SHUTTLE ----------
// S: two cabin windows, stubby hull. M: four windows.
// L: stretched cabin, six windows, dorsal fin, four legs.
const SHUTTLE = {
  S: { len: 1.5, wid: 1.5, ht: 0.8, windows: 2, engX: [-0.5, 0.5], engR: 0.22, fin: false, gear4: false, wingSpan: 1.0, wingRoot: 1.2 },
  M: { len: 1.9, wid: 1.7, ht: 0.85, windows: 4, engX: [-0.6, 0.6], engR: 0.26, fin: false, gear4: false, wingSpan: 1.15, wingRoot: 1.4 },
  L: { len: 2.6, wid: 1.9, ht: 0.95, windows: 6, engX: [-0.7, 0.7], engR: 0.3, fin: true, gear4: true, wingSpan: 1.35, wingRoot: 1.7 }
};
export function buildShuttle(size = 'M', shipId = 'SS-00000') {
  const v = SHUTTLE[size] || SHUTTLE.M;
  const { len, wid, ht } = v;
  const rand = seedFromId(shipId);
  const ship = new T.Group(); ship.name = 'shuttleShip';

  const hullMain = box(wid, ht, len, matHull, 'hullMain'); hullMain.position.set(0, ht / 2, 0); ship.add(hullMain);
  const nose = box(wid * 0.7, ht * 0.76, 1.6, matHull, 'hullNose'); nose.position.set(0, ht * 0.62, len / 2 + 0.68); ship.add(nose);

  const shFairLen = 0.92 + 0.7;
  const canopy = wedgeCockpit('canopyFairing', wid * 0.5, ht * 0.22, shFairLen);
  canopy.position.set(0, ht - 0.04, len / 2 + 0.24 - shFairLen / 2 + 0.3); ship.add(canopy);

  // dedicated cockpit block at the nose tip for the screen to sit on — the
  // long nose block alone gave the glass nothing its own size to attach to
  const shTip = box(wid * 0.5, ht * 0.42, 0.42, matPanel, 'hullNoseTip');
  shTip.position.set(0, ht * 0.6, len / 2 + 1.62); ship.add(shTip);
  mountProwGlass(ship, 'hullNoseTip', 0.8, 0.62, 0.5);

  // cabin windows down both flanks
  const perSide = v.windows / 2;
  const winGeo = new T.BoxGeometry(0.06, ht * 0.26, 0.3);
  // occupancy pooled across BOTH flanks, so a one-window-per-side ship can still
  // light a cabin; the forced-dark slot is picked from the seed, not hard-coded
  const litFlags = Array.from({ length: perSide * 2 }, () => rand() > 0.25);
  if (litFlags.length > 1 && litFlags.every(Boolean)) litFlags[Math.floor(rand() * litFlags.length)] = false;
  const litSides = [litFlags.slice(0, perSide), litFlags.slice(perSide)];
  for (let i = 0; i < perSide; i++) {
    const z = -len / 2 + 0.35 + i * ((len - 0.9) / Math.max(1, perSide - 1 || 1));
    [-1, 1].forEach((sd, si) => {
      const w = new T.Mesh(winGeo, litSides[si][i] ? matCabinLight : matCabinDark);
      w.name = 'cabinWindow' + i + (sd < 0 ? 'L' : 'R'); w.castShadow = true; w.receiveShadow = true;
      w.position.set(sd * (wid / 2), ht * 0.62, z); ship.add(w);
    });
  }
  const door = box(0.05, ht * 0.6, 0.5, matPanel, 'boardingDoor'); door.position.set(-(wid / 2), ht * 0.36, -len * 0.05); ship.add(door);
  const stripe = box(wid + 0.02, 0.05, 0.28, matAccent, 'accentStripe'); stripe.position.set(0, ht * 0.85, -len * 0.1); ship.add(stripe);

  if (v.fin) {
    const fin = finPlate('dorsalFin', 0.12, ht * 0.5, 0.5, 0.22);
    fin.position.set(0, ht - 0.03, -len / 2 + 0.35); ship.add(fin);
  }

  ship.add(deltaWingPair('wing', wid / 2, v.wingSpan, v.wingRoot, v.wingRoot * 0.55, 0.08, ht * 0.45, -len * 0.15));

  mountEngineCluster(ship, 'square', v.engX.length, v.engR, 0.6, ht * 0.45, -len / 2 - 0.28, ht, -len / 2, wid);

  ({ S: [0], M: [-0.55, 0.55], L: [-0.7, 0, 0.7] }[size] || [0]).forEach((fx, i) =>
    mountBellyGun(ship, 'hullNose', fx, 'laserBelly' + i, 0.22));

  const legLen = ht * 0.42;
  ship.add(landingLeg('gearFrontLeft', -wid * 0.38, len / 2 - 0.3, legLen, 0.12));
  ship.add(landingLeg('gearFrontRight', wid * 0.38, len / 2 - 0.3, legLen, 0.12));
  if (v.gear4) {
    ship.add(landingLeg('gearRearLeft', -wid * 0.38, -len / 2 + 0.3, legLen, 0.12));
    ship.add(landingLeg('gearRearRight', wid * 0.38, -len / 2 + 0.3, legLen, 0.12));
  } else {
    ship.add(landingLeg('gearRear', 0, -len / 2 + 0.3, legLen, 0.13));
  }
  // shuttle service kit on the forward roof: floods, pressurant, umbilical
  mountShuttleKit(ship, 'hullNose', ht);
  mountCockpitInterior(ship);
  // order matters: windows, IFF and plumbing are functional and go on first,
  // then greebles fill what's left, keeping clear of all of it
  detailCompartments(ship, shipId);
  mountNavLights(ship);
  return finalize(ship);
}

// ---------- CAPITAL ----------
// S: escort hulk — three engines, two pods a side. M: four engines.
// L: fleet hulk — six engines, four pods a side, aft secondary tower.
const CAPITAL = {
  S: { len: 5.0, wid: 3.0, ht: 1.5, engines: 3, podRows: [0.5, -1.2], bridgeH: 0.85, aftTower: false },
  M: { len: 6.5, wid: 3.6, ht: 1.8, engines: 5, podRows: [0.6, -1.4], bridgeH: 1.0, aftTower: false },
  L: { len: 8.2, wid: 4.2, ht: 2.1, engines: 7, podRows: [1.6, 0.2, -1.2, -2.6], bridgeH: 1.25, aftTower: true }
};
export function buildCapital(size = 'M', shipId = 'SH-00000') {
  const v = CAPITAL[size] || CAPITAL.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'capitalShip';

  const hullMain = box(wid, ht, len, matHull, 'hullMain'); hullMain.position.set(0, ht / 2, 0); ship.add(hullMain);
  // stepped prow: a shorter, stouter neck than the original long thin spar,
  // still narrower and lower than the hull so the step reads clearly
  const nose = box(wid * 0.55, ht * 0.42, 1.5, matHull, 'hullNose');
  nose.position.set(0, ht * 0.5, len / 2 + 0.7); ship.add(nose);
  // nose tip keeps its original height and proportions
  const noseTip = box(wid * 0.4, ht * 0.55, 0.8, matPanel, 'hullNoseTip');
  noseTip.position.set(0, ht * 0.5, len / 2 + 1.75); ship.add(noseTip);

  // canopy fairing over the nose, matching the shaped cockpit tub inside
  // rather than a plain grey block with a flat pane bolted on
  const fairLen = 1.3 + 0.9;
  const canopy = wedgeCockpit('canopyFairing', wid * 0.34, ht * 0.26, fairLen);
  canopy.position.set(0, ht - 0.05, len / 2 + 0.35 - fairLen / 2 + 0.4); ship.add(canopy);

  // cockpit glass rides the nose, not the bridge
  mountProwGlass(ship, 'hullNoseTip', 0.78, 0.5, 0.5);

  /* Overwatch tower on a full-height buttress pylon off the starboard flank.
     The pylon is as deep as the hull is long through this section and taller
     than the hull itself — this is a flying city, so its control structure has
     to stand clear above the whole upper deck. The tower proper is a stepped,
     terraced control block (each deck smaller than the one below, topped by an
     overhanging glazed observation gallery) rather than a tapering spire.
     Deliberately asymmetric, and centred on its own pylon. */
  const sc = { S: 0.78, M: 0.9, L: 1 }[size] || 1;
  const pylonW = 1.05 * sc, pylonD = len * 0.26, pylonH = ht * 1.2;   // always taller than the hull
  // the tower rides the hull's forward edge, clearing the midships flanks
  // entirely for docking traffic
  const towerZ = len * 0.5 - pylonD / 2;
  const pylonX = wid / 2 + pylonW / 2 - 0.14;
  const pylonY = ht * 0.06 + pylonH / 2;
  const pylon = box(pylonW, pylonH, pylonD, matHull, 'outriggerPylon');
  pylon.position.set(pylonX, pylonY, towerZ); ship.add(pylon);
  // buttress fillets tying the pylon back into the hull side
  [-1, 1].forEach((zs, i) => {
    const fillet = box(pylonW * 0.5, ht * 0.5, 0.16, matPanel, 'pylonButtress' + i);
    fillet.position.set(wid / 2 + pylonW * 0.18, ht * 0.4, towerZ + zs * pylonD * 0.34);
    ship.add(fillet);
  });
  const spine = box(pylonW * 0.28, pylonH * 0.9, 0.14, matEngine, 'pylonSpine');
  spine.position.set(pylonX, pylonY, towerZ - pylonD / 2 + 0.05); ship.add(spine);

  // stepped control block: three terraces, then an overhanging gallery
  const pylonTop = ht * 0.06 + pylonH;
  const terraces = [
    { w: pylonW * 1.28, h: ht * 0.24 * sc, d: pylonD * 0.86 },
    { w: pylonW * 1.02, h: ht * 0.2 * sc, d: pylonD * 0.66 },
    { w: pylonW * 0.8, h: ht * 0.18 * sc, d: pylonD * 0.5 }
  ];
  let deckY = pylonTop;
  terraces.forEach((t, i) => {
    const deck = box(t.w, t.h, t.d, matHull, 'controlTerrace' + i);
    deck.position.set(pylonX, deckY + t.h / 2 - 0.02, towerZ); ship.add(deck);
    deckY += t.h - 0.02;
  });
  // overhanging observation gallery with a lit window band on all four sides
  const galH = ht * 0.16 * sc, galW = pylonW * 1.15, galD = pylonD * 0.62;
  const gallery = box(galW, galH, galD, matHull, 'observationGallery');
  gallery.position.set(pylonX, deckY + galH / 2 - 0.02, towerZ); ship.add(gallery);
  [-1, 1].forEach((sd, i) => {
    const band = box(0.04, galH * 0.5, galD * 0.86, matCabinLight, 'galleryWindowSide' + i);
    band.position.set(pylonX + sd * (galW / 2 - 0.01), deckY + galH / 2 - 0.02, towerZ); ship.add(band);
    const endBand = box(galW * 0.86, galH * 0.5, 0.04, matCabinLight, 'galleryWindowEnd' + i);
    endBand.position.set(pylonX, deckY + galH / 2 - 0.02, towerZ + sd * (galD / 2 - 0.01)); ship.add(endBand);
  });
  const towerTopY = deckY + galH - 0.02;
  const towerMast = cyl(0.035, 0.035, 0.55 * sc, matPanel, 'towerMast');
  towerMast.position.set(pylonX, towerTopY + 0.22 * sc, towerZ); ship.add(towerMast);
  const mastLamp = new T.Mesh(new T.SphereGeometry(0.055, 8, 6), matGlow);
  mastLamp.name = 'mastLamp'; mastLamp.position.set(pylonX, towerTopY + 0.5 * sc, towerZ); ship.add(mastLamp);
  if (v.aftTower) {
    const aft = slopedBlock('aftTower', wid * 0.3, 0.75, 1.2, 0.7, 0.3);
    aft.position.set(0, ht - 0.04, -len * 0.3); ship.add(aft);
  }

  /* Connecting block filling the dorsal gap between the (centreline) nose
     canopy and the (starboard-offset) tower pylon — without it the deck
     reads as two unrelated structures with an empty notch between them. */
  {
    const bridgeW = pylonX + pylonW * 0.1, bridgeH = ht * 0.12, bridgeD = pylonD * 0.72;
    const bridge = box(bridgeW, bridgeH, bridgeD, matHull, 'towerBridgeBlock');
    bridge.position.set(bridgeW / 2 - pylonW * 0.05, ht + bridgeH / 2 - 0.02, towerZ);
    ship.add(bridge);
    /* Spine running forward from the tower bridge to the nose block. Without
       it the bridge ended in mid-air over the forward dorsal plate; this
       carries it all the way to the cockpit structure. */
    let noseFrontZ = towerZ, noseTopY = ht, noseW = bridgeW * 0.62;
    ship.traverse(n => {
      if (!n.isMesh || !/^hullNose$|^hullNoseTip$/.test(n.name)) return;
      n.updateWorldMatrix(true, false);
      const nb = new T.Box3().setFromObject(n);
      if (nb.min.z > noseFrontZ) { noseFrontZ = nb.min.z; noseTopY = nb.max.y; noseW = (nb.max.x - nb.min.x) * 0.8; }
    });
    const spineFrom = towerZ + pylonD * 0.3, spineTo = noseFrontZ + 0.25;   // overlap INTO the nose block
    if (spineTo > spineFrom) {
      const spineLen = spineTo - spineFrom;
      const spine = box(bridgeW * 0.62, bridgeH, spineLen, matHull, 'towerBridgeSpine');
      spine.position.set(bridgeW * 0.28, ht + bridgeH / 2 - 0.02, spineFrom + spineLen / 2);
      ship.add(spine);
      /* The nose block sits well below the deck line, so a flat spine would
         pass over it without ever touching. This step-down spans the gap
         vertically at the junction, overlapping both. */
      const stepTop = ht + bridgeH - 0.02, stepBot = Math.min(noseTopY - 0.06, stepTop - 0.05);
      const step = box(Math.min(bridgeW * 0.62, noseW), stepTop - stepBot, 0.5, matHull, 'towerBridgeStep');
      step.position.set(0, (stepTop + stepBot) / 2, noseFrontZ + 0.16);
      ship.add(step);
      const rail = box(bridgeW * 0.66, 0.05, spineLen * 0.9, matPanel, 'towerBridgeRail');
      rail.position.set(bridgeW * 0.28, ht + bridgeH - 0.03, spineFrom + spineLen / 2);
      ship.add(rail);
      const runs = Math.max(2, Math.round(spineLen / 0.7));
      for (let i = 0; i < runs; i++) {
        const f = (i + 0.5) / runs;
        const lamp = box(0.1, 0.05, 0.12, matCabinLight, 'bridgeSpineLamp' + i);
        lamp.position.set(bridgeW * 0.55, ht + bridgeH - 0.03, spineFrom + spineLen * f);
        ship.add(lamp);
        const g = box(0.14, 0.07, 0.16, matEngine, 'bridgeSpineGreeble' + i);
        g.position.set(bridgeW * 0.05, ht + bridgeH - 0.04, spineFrom + spineLen * f);
        ship.add(g);
      }
    }
    [0.3, 0.65].forEach((f, i) => {
      const g = box(0.16, 0.05, 0.12, matPanel, 'towerBridgeGreeble' + i);
      g.position.set(bridgeW * f, ht + bridgeH - 0.03, towerZ - bridgeD * 0.22 + i * bridgeD * 0.3);
      ship.add(g);
    });
    const conduit = box(0.06, bridgeH * 0.6, bridgeD * 0.7, matEngine, 'towerBridgeConduit');
    conduit.position.set(bridgeW * 0.85, ht + bridgeH * 0.3 - 0.02, towerZ);
    ship.add(conduit);
  }

  /* Internal docking bays, port and starboard: a recess cut into the flank
     with a lit interior deck and a raised collar for a visiting hull to berth
     against — capital ships are dockable rather than merely armed. */
  const dockZ = -len * 0.02, dockLen = len * 0.22, dockH = ht * 0.42;
  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'Port' : 'Starboard';
    // collar standing proud of the skin, framing the opening
    const collarW = 0.16;
    [[0, dockH / 2 + 0.07, dockLen], [0, -dockH / 2 - 0.07, dockLen]].forEach((o, i) => {
      const lip = box(collarW, 0.14, dockLen + 0.28, matPanel, 'dockCollar' + side + i);
      lip.position.set(sd * (wid / 2 + collarW / 2 - 0.02), ht * 0.52 + o[1], dockZ);
      ship.add(lip);
    });
    [-1, 1].forEach((zs, i) => {
      const jamb = box(collarW, dockH + 0.28, 0.14, matPanel, 'dockJamb' + side + i);
      jamb.position.set(sd * (wid / 2 + collarW / 2 - 0.02), ht * 0.52, dockZ + zs * (dockLen / 2 + 0.07));
      ship.add(jamb);
    });
    // the bay itself, recessed inboard of the skin
    const chamber = box(0.5, dockH, dockLen, matEngine, 'dockingChamber' + side);
    chamber.position.set(sd * (wid / 2 - 0.24), ht * 0.52, dockZ);
    ship.add(chamber);
    const deck = box(0.46, 0.06, dockLen * 0.9, matPanel, 'dockingDeck' + side);
    deck.position.set(sd * (wid / 2 - 0.25), ht * 0.52 - dockH / 2 + 0.05, dockZ);
    ship.add(deck);
    // interior lighting strips top and bottom of the bay
    [1, -1].forEach((ys, i) => {
      const lamp = box(0.42, 0.05, dockLen * 0.78, matCabinLight, 'dockingBayLamp' + side + i);
      lamp.position.set(sd * (wid / 2 - 0.27), ht * 0.52 + ys * (dockH / 2 - 0.08), dockZ);
      ship.add(lamp);
    });
  });

  // keelside docking bay, aft on the underside
  const bayZ = -len * 0.2, bayLen = len * 0.28;  const bayHousing = box(wid * 0.52, 0.42, bayLen, matPanel, 'dockingBayHousing');
  bayHousing.position.set(0, -0.1, bayZ); ship.add(bayHousing);
  const bayRecess = box(wid * 0.36, 0.26, bayLen - 0.35, matEngine, 'dockingBayMouth');
  bayRecess.position.set(0, -0.23, bayZ); ship.add(bayRecess);
  [-1, 1].forEach(s => {
    const strip = box(wid * 0.34, 0.03, 0.09, matGlow, 'dockingBayLamp' + (s < 0 ? 'Aft' : 'Fore'));
    strip.position.set(0, -0.35, bayZ + s * (bayLen - 0.45) / 2); ship.add(strip);
  });

  /* Capital gear cycle: no legs to lower. Instead two sliding keel doors close
     across the underside bay, their teeth interdigitating along the seam, while
     blue force fields come up across the side docking bays. Driven by the same
     pose scalar as every other hull's gear, so the G cycle is uniform. */
  {
    const doorW = wid * 0.24, doorTeeth = 5;
    const toothLen = (bayLen - 0.4) / (doorTeeth * 2);
    const doors = [-1, 1].map(sd => {
      const grp = new T.Group(); grp.name = 'keelDoor' + (sd < 0 ? 'Port' : 'Starboard');
      const leaf = box(doorW, 0.07, bayLen - 0.4, matPanel, 'keelDoorLeaf');
      grp.add(leaf);
      // teeth reach across the seam, offset so the two leaves mesh
      for (let i = 0; i < doorTeeth; i++) {
        // teeth project past the seam (inboard), on alternating z stations, so
        // the two leaves interdigitate rather than butting edge to edge
        const tooth = box(doorW * 0.55, 0.065, toothLen * 0.9, matPanel, 'keelDoorTooth' + i);
        const zOff = -(bayLen - 0.4) / 2 + toothLen * (2 * i + (sd < 0 ? 0.5 : 1.5));
        tooth.position.set(-sd * (doorW * 0.78), 0, zOff);
        grp.add(tooth);
        // only the tooth ROOT is painted; the tooth itself stays bare plating
        const seam = box(doorW * 0.16, 0.02, toothLen * 0.9,
          i % 2 === 0 ? matHazardYellow : matHazardBlack, 'keelDoorSeamEdge' + i);
        seam.position.set(-sd * (doorW * 0.46), -0.042, zOff);
        grp.add(seam);
      }
      grp.position.set(sd * (doorW * 0.5), -0.36, bayZ);
      ship.add(grp);
      return { grp, sd, closedX: sd * (doorW * 0.5), openX: sd * (doorW * 1.9) };
    });

    /* Force fields build from the bay's outer edges and meet in the middle
       last, so the aperture visibly closes rather than swelling outward. Each
       side is two panels anchored at the top and bottom lips. */
    const fields = [];
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'Port' : 'Starboard';
      [1, -1].forEach((ys, i) => {
        const halfH = dockH / 2;
        const f = box(0.05, halfH, dockLen, matForceField, 'bayForceField' + side + (ys > 0 ? 'Upper' : 'Lower'));
        const outerY = ht * 0.52 + ys * dockH / 2;
        f.position.set(sd * (wid / 2 + 0.03), outerY - ys * halfH / 2, dockZ);
        ship.add(f);
        fields.push({ mesh: f, outerY, ys, halfH });
      });
    });

    /* t = 1 is the capital's "gear down" state: keel doors shut and fields up.
       t = 0 runs them open for docking traffic. */
    ship.userData.gearEffector = t => {
      doors.forEach(d => { d.grp.position.x = d.openX + (d.closedX - d.openX) * t; });
      fields.forEach(f => {
        f.mesh.visible = t > 0.02;
        f.mesh.material.opacity = 0.42 * Math.min(1, t * 1.4);
        const k = Math.max(0.02, t);
        f.mesh.scale.y = k;                                   // grows inward...
        f.mesh.position.y = f.outerY - f.ys * f.halfH * k / 2; // ...outer lip fixed
      });
    };
    ship.userData.gearPose = 1;
    ship.userData.gearEffector(1);
  }

  const podGeo = new T.BoxGeometry(0.6, 0.6, 1.4);
  // shift any pod row that would straddle a docking bay clear of its mouth
  const podClear = 0.7 + dockLen / 2 + 0.38;
  const podRowsClear = v.podRows.map(z => {
    if (Math.abs(z - dockZ) >= podClear) return z;
    return z >= dockZ ? dockZ + podClear : dockZ - podClear;
  });
  podRowsClear.forEach((z, i) => {
    [-1, 1].forEach(s => {
      const pod = new T.Mesh(podGeo, matPanel);
      pod.name = 'sidePod' + i + (s < 0 ? 'L' : 'R'); pod.castShadow = true; pod.receiveShadow = true;
      pod.position.set(s * (wid / 2 + 0.25), ht * 0.35, z); ship.add(pod);
    });
  });

  const panelGeo = new T.BoxGeometry(wid + 0.02, 0.04, 0.5);
  [len * 0.06 + 0.003, -len * 0.12, -len * 0.3].forEach((z, i) => {
    const p = new T.Mesh(panelGeo, matPanel); p.name = 'hullPanelLine' + i; p.castShadow = true; p.receiveShadow = true;
    p.position.set(0, ht + 0.005, z); ship.add(p);
  });
  const stripe = box(wid + 0.02, 0.03, 0.4, matAccent, 'accentStripe'); stripe.position.set(0, ht + 0.02, len * 0.4); ship.add(stripe);

  /* Turret mount, reusable dorsal or ventral (ventral flips every offset so
     the whole assembly reads as hanging off the belly instead of standing
     on the deck). */
  function mountTurret(name, x, y, z, ventral) {
    const grp = new T.Group(); grp.name = name;
    const sgn = ventral ? -1 : 1;
    const base = cyl(0.2, 0.24, 0.14, matPanel, 'turretRing', 8); base.position.y = sgn * 0.02; grp.add(base);
    const mount = box(0.26, 0.16, 0.3, matEngine, 'turretMount'); mount.position.y = sgn * 0.15; grp.add(mount);
    [-1, 1].forEach(b => {
      const barrel = cyl(0.03, 0.03, 0.46, matEngine, 'turretBarrel' + (b < 0 ? 'A' : 'B'), 6);
      barrel.rotation.x = Math.PI / 2; barrel.position.set(b * 0.07, sgn * 0.16, 0.34); grp.add(barrel);
    });
    grp.position.set(x, y, z);
    ship.add(grp);
  }
  /* Turrets ride the hull CORNERS, fore and aft, rather than amidships: the
     flank docking bays occupy the middle of both sides, and a turret set
     there fouls the doors (and its barrels sweep across them). Corners are
     also where a real warship puts them, for overlapping arcs. */
  // every station sits at a corner — the L's inner pair used to sit amidships,
  // which is exactly where the flank doors are
  const cornerZ = { S: [len * 0.4, -len * 0.4], M: [len * 0.42, -len * 0.42], L: [len * 0.44, len * 0.34, -len * 0.34, -len * 0.44] }[size] || [];
  const cornerX = wid * 0.42;
  const ventralFrom = Math.ceil(cornerZ.length / 2);
  cornerZ.forEach((tz, i) => {
    const ventral = i >= ventralFrom;
    [-1, 1].forEach(s => mountTurret('deckTurret' + i + (s < 0 ? 'L' : 'R'), s * cornerX, ventral ? 0.02 : ht - 0.02, tz, ventral));
  });
  // two more mounted directly on the conning tower's outer flank
  mountTurret('towerTurretUpper', pylonX + pylonW / 2 + 0.02, pylonY + pylonH * 0.28, towerZ + pylonD * 0.25, false);
  mountTurret('towerTurretLower', pylonX + pylonW / 2 + 0.02, pylonY - pylonH * 0.22, towerZ - pylonD * 0.25, false);

  // hexagonal drive bank
  mountEngineCluster(ship, 'hexagonal', v.engines, ht * 0.28, 1.5, ht * 0.5, -len / 2 - 0.7, ht, -len / 2, wid);
  // no landing gear: capital ships dock at trade hubs, they never land
  if (size !== 'S') mountCommDish(ship, 'hullNose', ht, 0.5, matPanel, matHull);
  mountCockpitInterior(ship);
  // order matters: windows, IFF and plumbing are functional and go on first,
  // then greebles fill what's left, keeping clear of all of it
  detailCompartments(ship, shipId);
  mountNavLights(ship);
  return finalize(ship);
}



// ---------- LINER ----------
// Passenger liner. Shares the hauler's segmented spine — fat hull sections
// joined by thin gantries — but reads unmistakably as a liner: no cargo
// containers or spine rails, instead boxy passenger compartments with lit
// cabin windows down both flanks of every section, a promenade band along
// the waterline, and a tall forward superstructure.
// S: one section. M: two. L: three.
const LINER = {
  S: { len: 3.4, wid: 2.0, ht: 1.15, sections: 1, rows: 3, engX: [-0.55, 0.55], engR: 0.34, wingSpan: 1.3, wingRoot: 1.6 },
  M: { len: 4.8, wid: 2.4, ht: 1.35, sections: 2, rows: 3, engX: [-0.7, 0.7], engR: 0.4, wingSpan: 1.55, wingRoot: 1.9 },
  L: { len: 6.6, wid: 2.8, ht: 1.6, sections: 3, rows: 3, engX: [-0.85, 0, 0.85], engR: 0.44, wingSpan: 1.85, wingRoot: 2.2 }
};
export function buildLiner(size = 'M', shipId = 'PL-00000') {
  const v = LINER[size] || LINER.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'linerShip';
  const rand = seedFromId(shipId);

  // segmented spine
  const gantryCount = v.sections - 1;
  const gantryLen = len * 0.08;
  const sectionLen = (len - gantryCount * gantryLen) / v.sections;
  const sectionZ = [], gantryZ = [];
  let cursor = len / 2;
  for (let i = 0; i < v.sections; i++) {
    sectionZ.push(cursor - sectionLen / 2);
    cursor -= sectionLen;
    if (i < gantryCount) { gantryZ.push(cursor - gantryLen / 2); cursor -= gantryLen; }
  }
  sectionZ.forEach((z, i) => {
    const sec = box(wid, ht, sectionLen, matHull, i === 0 ? 'hullMain' : 'hullSection' + i);
    sec.position.set(0, ht / 2, z); ship.add(sec);
  });
  gantryZ.forEach((z, i) => {
    const g = box(wid * 0.5, ht * (2 / 3), gantryLen + 0.06, matPanel, 'gantry' + i);
    g.position.set(0, ht / 2, z); ship.add(g);
    // enclosed connecting corridor — passengers walk between sections
    const corridor = box(wid * 0.34, ht * 0.3, gantryLen + 0.1, matHull, 'connectingCorridor' + i);
    corridor.position.set(0, ht * 0.68, z); ship.add(corridor);
    const cwin = box(wid * 0.3, ht * 0.1, gantryLen * 0.7, matCabinLight, 'corridorWindow' + i);
    corridor.add(cwin); cwin.position.set(0, ht * 0.04, 0);
  });

  const nose = box(wid * 0.6, ht * 0.76, 1.8, matHull, 'hullNose'); nose.position.set(0, ht * 0.62, len / 2 + 0.78); ship.add(nose);
  const noseTip = box(wid * 0.32, ht * 0.46, 0.5, matPanel, 'hullNoseTip'); noseTip.position.set(0, ht * 0.56, len / 2 + 1.85); ship.add(noseTip);

  // forward deck kept flat — no raised bridge house; its dorsal footprint
  // moved to the fork bays on the second hull block instead
  const fairLen = sectionLen * 0.45 + 0.8;
  const canopy = wedgeCockpit('canopyFairing', wid * 0.4, ht * 0.22, fairLen);
  canopy.position.set(0, ht - 0.04, len / 2 + 0.3 - fairLen / 2 + 0.35); ship.add(canopy);

  mountProwGlass(ship, 'hullNoseTip', 0.8, 0.55, 0.5);

  const wingY = ht * 0.42, wingZ = sectionZ[sectionZ.length - 1];
  const wing = kinkedWingPair('wing', wid / 2, v.wingSpan, v.wingRoot, v.wingRoot * 0.78, v.wingRoot * 0.55, 0.1, wingY, wingZ, 0.2, 1 / 3);
  ship.add(wing.group);

  // passenger compartments ranked along every section's flanks
  const deckY = ht * 0.55, podDepth = 0.4;
  const podGap = sectionLen / v.rows;
  const podLen = podGap * 0.72;
  const forkLen = sectionLen * 0.6;   // stays inside section[1]'s own span, aft of the gantry
  const slots = [];
  sectionZ.forEach((secZ, si) => {
    for (let r = 0; r < v.rows; r++) {
      const z = secZ + (r - (v.rows - 1) / 2) * podGap;
      if (Math.abs(z - wingZ) < Math.min(v.wingRoot * 0.5, podGap * 0.6)) continue;
      if (v.sections >= 2 && si === 1 && Math.abs(z - sectionZ[1]) < forkLen * 0.6) continue;   // clear of the fork bays
      slots.push(z);
    }
  });
  const litFlags = Array.from({ length: slots.length * 2 }, () => rand() > 0.25);
  if (litFlags.length > 1 && litFlags.every(Boolean)) litFlags[Math.floor(rand() * litFlags.length)] = false;
  slots.forEach((z, i) => {
    [-1, 1].forEach((sd, si) => {
      const tag = 'passengerPod' + i + (sd < 0 ? 'L' : 'R');
      const pod = box(podDepth, ht * 0.32, podLen * 0.9, matHull, tag);
      pod.position.set(sd * (wid / 2 + podDepth / 2 - 0.02), deckY, z); ship.add(pod);
      const win = box(0.03, ht * 0.17, podLen * 0.7, litFlags[si * slots.length + i] ? matCabinLight : matCabinDark, tag + 'Window');
      win.position.set(sd * (wid / 2 + podDepth - 0.015), deckY, z); ship.add(win);
    });
  });

  /* Canard fins off the sides of the second hull block, aft of the gantry —
     replaces the boxy fork bays with a proper flat control surface in the
     same forked/diverging arrangement. Capped well within section[1] so
     they never reach past the grey gantry block forward of them. */
  if (v.sections >= 2) {
    /* Canards at a third of the main wing's chord, carried on the hull block
       immediately astern of the cockpit block rather than back on section[1]. */
    const canardRoot = v.wingRoot * 0.33;
    const canardSpan = wid * 0.62, canardTip = canardRoot * 0.4, canardThick = 0.07;
    /* Rooted in a personnel hab module rather than bare plating: the canard
       grows off the outer face of whichever forward pod sits nearest the
       station, so the module reads as its structural mount. */
    /* Rooted on the FORWARD hull block's flank, aft of the cockpit block, at
       a station clear of every cabin pod and below the pod band. Hanging it
       off a pod's outer face put the canard's root plate through the cabin. */
    const canardY = ht * 0.28;
    const podHalf = podLen * 0.45 + canardRoot * 0.5 + 0.06;
    const fwdMin = sectionZ[0] - sectionLen * 0.42, fwdMax = sectionZ[0] + sectionLen * 0.3;
    let hostZ = sectionZ[0] + sectionLen * 0.06;
    for (let k = 0; k <= 12; k++) {
      const cand = fwdMax - (fwdMax - fwdMin) * (k / 12);
      if (!slots.some(z => Math.abs(z - cand) < podHalf)) { hostZ = cand; break; }
    }
    [-1, 1].forEach(sd => {
      const canard = wingPlate('linerCanard' + (sd < 0 ? 'Left' : 'Right'), canardSpan, canardRoot, canardTip, canardThick);
      canard.position.set(sd * (wid / 2 - 0.02), canardY, hostZ);
      if (sd < 0) canard.scale.x = -1;
      ship.add(canard);
      const shoe = box(0.12, ht * 0.14, canardRoot * 0.5, matPanel, 'canardShoe' + (sd < 0 ? 'L' : 'R'));
      shoe.position.set(sd * (wid / 2 - 0.03), canardY, hostZ); ship.add(shoe);
    });
  }

  /* One passenger bay relocated to the nose section, low on the flank —
     larger and flatter than the standard flank pods, since it now carries
     the capacity the fork bays used to. */
  {
    const noseBayW = 0.55, noseBayH = ht * 0.26, noseBayLen = sectionLen * 0.62;
    const noseBayLit = rand() > 0.4;
    [-1, 1].forEach(sd => {
      const tag = 'noseRelocatedBay' + (sd < 0 ? 'L' : 'R');
      const bay = box(noseBayW, noseBayH, noseBayLen, matHull, tag);
      bay.position.set(sd * (wid / 2 + noseBayW / 2 - 0.02), ht * 0.22, sectionZ[0]);
      ship.add(bay);
      const win = box(0.04, noseBayH * 0.55, noseBayLen * 0.72, noseBayLit ? matCabinLight : matCabinDark, tag + 'Window');
      win.position.set(sd * (wid / 2 + noseBayW - 0.015), ht * 0.22, sectionZ[0]);
      ship.add(win);
    });
  }

  /* Forward block dressing: the section immediately behind the cockpit block
     carries the bridge crew and their services, so it gets a denser band of
     lit ports plus its own service greebles. */
  {
    const fwdZ = sectionZ[0], span = sectionLen * 0.62;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const z = fwdZ + span * (i / (n - 1) - 0.5);
      [-1, 1].forEach(sd => {
        const lit = rand() > 0.35;
        const w = box(0.04, ht * 0.09, span * 0.14,
          lit ? matCabinLight : matCabinDark, 'fwdBlockWindow' + i + (sd < 0 ? 'L' : 'R'));
        w.position.set(sd * (wid / 2 - 0.005), ht * 0.78, z); ship.add(w);
      });
      const crown = box(wid * 0.1, 0.03, span * 0.1,
        rand() > 0.5 ? matCabinLight : matCabinDark, 'fwdBlockSkylight' + i);
      crown.position.set(wid * 0.3, ht + 0.012, z); ship.add(crown);
      [-1, 1].forEach(sd => {
        const g = box(0.08, ht * 0.07, span * 0.1, i % 2 ? matPanel : matEngine,
          'fwdBlockGreeble' + i + (sd < 0 ? 'L' : 'R'));
        g.position.set(sd * (wid / 2 - 0.01), ht * 0.36, z); ship.add(g);
      });
    }
    [-1, 1].forEach(sd => {
      const duct = box(0.06, ht * 0.1, span * 0.7, matEngine, 'fwdBlockDuct' + (sd < 0 ? 'L' : 'R'));
      duct.position.set(sd * (wid / 2 - 0.01), ht * 0.5, fwdZ); ship.add(duct);
    });
  }

  // promenade band: a slim rubbing strake down each flank, not a deck-wide plate
  [-1, 1].forEach(sd => {
    const strake = box(0.05, ht * 0.06, len * 0.8, matAccent, 'accentStripe' + (sd < 0 ? 'L' : 'R'));
    strake.position.set(sd * (wid / 2), ht * 0.82, -len * 0.04); ship.add(strake);
  });

  mountEngineCluster(ship, 'trapezoidal', v.engX.length + 1, v.engR, 1.1, ht / 2, -len / 2 - 0.5, ht, -len / 2, wid);

  ({ S: [-0.6, 0.6], M: [-0.85, -0.35, 0.35, 0.85], L: [-0.85, -0.4, 0, 0.4, 0.85] }[size] || [-0.6, 0.6])
    .forEach((fx, i) => mountBellyGun(ship, 'hullNose', fx, 'laserBelly' + i, 0.22));

  const legLen = ht * 0.48;
  const gearZ = v.sections === 1
    ? [sectionZ[0] + sectionLen * 0.3, sectionZ[0] - sectionLen * 0.3]
    : sectionZ;
  gearZ.forEach((z, i) => {
    [-1, 1].forEach(sd => ship.add(landingLeg('gear' + i + (sd < 0 ? 'Left' : 'Right'), sd * (wid / 2 - 0.3), z, legLen, 0.18, 0.06)));
  });
  mountCockpitInterior(ship);
  // order matters: windows, IFF and plumbing are functional and go on first,
  // then greebles fill what's left, keeping clear of all of it
  detailCompartments(ship, shipId);
  if (size === 'L') mountEngineShroud(ship, 'liner', matPanel);
  if (size !== 'S') mountCommDish(ship, 'hullNose', ht, 0.42, matPanel, matHull);
  mountNavLights(ship);
  return finalize(ship);
}

export const ACCENTS = {
  mustard: { accent: 0xd6c24a, glow: 0xe0b23a },
  cyan: { accent: 0x3fc6d8, glow: 0x46d3e6 },
  hazard: { accent: 0xe3c11c, glow: 0xf0cf2a },
  orange: { accent: 0xd9762c, glow: 0xe8842f },
  green: { accent: 0x4f8f5f, glow: 0x63a86f },
  red: { accent: 0xc0392b, glow: 0xd6452f }
};
export function setAccent(key) {
  const a = ACCENTS[key] || ACCENTS.mustard;
  matAccent.color.setHex(a.accent);
  matFactionBeacon.emissive.setHex(a.accent);   // IFF array carries the faction colour
  currentFaction = ACCENTS[key] ? key : 'mustard';
  // engine glow deliberately stays mustard on every faction — it reads as
  // drive plume, not livery, so it must not track the accent colour
}

// ---------- COURIER ----------
// Angular despatch runner: faceted wedge hull (not a cylinder+cone), offset
// canopy bubble, small canard fins for silhouette, engines on a spread tail
// boom rather than a single centerline pipe. S: one boom. M: two. L: three + winglets.
const COURIER = {
  S: { len: 2.2, wid: 0.85, ht: 0.62, booms: [0], engR: 0.22, winglets: false },
  M: { len: 2.9, wid: 1.05, ht: 0.68, booms: [-0.32, 0.32], engR: 0.2, winglets: false },
  L: { len: 3.7, wid: 1.25, ht: 0.76, booms: [-0.4, 0.4], engR: 0.22, winglets: true }
};
export function buildCourier(size = 'M', shipId = 'CR-00000') {
  const v = COURIER[size] || COURIER.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'courierShip';

  // faceted wedge hull: three stacked slabs tapering toward the nose, not a tube
  const hullMain = box(wid, ht, len * 0.5, matHull, 'hullMain'); hullMain.position.set(0, ht / 2, -len * 0.08); ship.add(hullMain);
  const forebody = slopedBlock('hullForebody', wid * 0.86, ht * 0.82, len * 0.4, len * 0.16, len * 0.22, matHull);
  forebody.position.set(0, ht * 0.08, len * 0.34); ship.add(forebody);
  const chin = slopedBlock('hullChin', wid * 0.6, ht * 0.28, len * 0.24, len * 0.1, len * 0.14, matPanel);
  chin.position.set(0, -ht * 0.02, len * 0.16); ship.add(chin);
  const tailWedge = slopedBlock('hullTailWedge', wid * 0.7, ht * 0.5, len * 0.34, len * 0.5, len * 0.02, matPanel);
  tailWedge.rotation.y = Math.PI;
  tailWedge.position.set(0, ht * 0.12, -len * 0.34); ship.add(tailWedge);

  // canopy offset to one side, like a real cockpit bubble rather than a dead-center spike
  const canopy = wedgeCockpit('canopyFairing', wid * 0.42, ht * 0.34, len * 0.24);
  canopy.position.set(-wid * 0.18, ht * 0.86, len * 0.14); ship.add(canopy);
  const canopyFairing = box(wid * 0.5, ht * 0.14, len * 0.22, matPanel, 'canopyFairing');
  canopyFairing.position.set(-wid * 0.18 + 0.003, ht * 0.62, len * 0.14); ship.add(canopyFairing);

  // larger canard fins near the nose for a hull-with-control-surfaces read
  // canards built from the same swept part the trader uses, so the sweep runs
  // the correct way round rather than relying on an improvised fin rotation
  ship.add(deltaWingPair('canard', wid * 0.4, ht * 0.46, len * 0.23, len * 0.23 * 0.55, 0.06, ht * 0.28, len * 0.22));

  // screen laid flush ON the forebody's raked front face (it was floating in
  // front of the hull when derived from the bounding box instead of the face).
  // S carries it on one side's leading edge; M and L run it centred.
  // nose block carrying the screen on its front face — S offsets it to one
  // side's leading edge, M and L run it centred
  const noseOffX = size === 'S' ? wid * 0.16 : 0;   // right-justified on the small mark
  /* Nose block pulled back and deepened: at len*0.52 with a shallow 0.4*ht
     face the canopy's rear floor reached past the block and hung free. */
  const cNose = box(wid * 0.56, ht * 0.46, len * 0.24, matHull, 'hullNose');
  cNose.position.set(noseOffX, ht * 0.5, len * 0.44); ship.add(cNose);
  [-1, 1].forEach(sd => {
    const brace = box(0.05, ht * 0.14, len * 0.14, matEngine, 'noseBrace' + (sd < 0 ? 'L' : 'R'));
    brace.position.set(noseOffX + sd * wid * 0.24, ht * 0.38, len * 0.38); ship.add(brace);
  });
  mountProwGlass(ship, 'hullNose', 0.76, 0.62, 0.5);

  const stripe = box(wid * 0.5, 0.03, len * 0.34, matAccent, 'accentStripe');
  stripe.position.set(wid * 0.15, ht + 0.016, -len * 0.06); ship.add(stripe);

  const ventral = finPlate('ventralFin', 0.1, ht * 0.4, len * 0.24, len * 0.1);
  ventral.rotation.x = Math.PI;
  ventral.position.set(0, 0, -len * 0.3); ship.add(ventral);
  if (v.winglets) ship.add(deltaWingPair('winglet', wid / 2, 0.55, 0.75, 0.34, 0.06, ht * 0.42, -len * 0.16));

  // twin-boom tail bracing an engine bay block on the hull centreline
  const boomLen = size === 'S' ? len * 0.42 : len * 0.21;
  const boomZ = size === 'S' ? -len * 0.32 : -len * 0.38;
  v.booms.forEach((x, i) => {
    const boom = box(wid * 0.18, ht * 0.34, boomLen, matPanel, 'tailBoom' + i);
    boom.position.set(x, ht / 2, boomZ); ship.add(boom);
  });
  mountEngineCluster(ship, 'square', v.booms.length, v.engR, 0.6, ht / 2, -len * 0.56, ht, -len * 0.44, wid * 0.8);

  ({ S: [0], M: [-0.16, 0.16], L: [-0.18, 0, 0.18] }[size] || [0]).forEach((fx, i) =>
    ship.add(laserCannon('laserChin' + i, fx * wid, -ht * 0.05, len * 0.5)));

  const legLen = ht * 0.36;
  ship.add(landingLeg('gearNose', 0, len * 0.08, legLen, 0.09, 0.04));
  ship.add(landingLeg('gearRearLeft', -wid * 0.4, -len * 0.24, legLen, 0.1, 0.04));
  ship.add(landingLeg('gearRearRight', wid * 0.4, -len * 0.24, legLen, 0.1, 0.04));

  /* Despatch-runner fit-out: this hull had only the shared passes, so it read
     bare next to the rest of the fleet. Everything here is measured off the
     spine and forebody rather than fractions of hull size, and every piece is
     bedded into the skin. */
  {
    let spine = null, fore = null;
    ship.traverse(n => {
      if (n.isMesh && n.name === 'dorsalSpine' && !spine) spine = n;
      if (n.isMesh && n.name === 'hullForebody' && !fore) fore = n;
    });
    const ray = new T.Raycaster();
    const skinOn = (host, x, z) => {
      ray.set(new T.Vector3(x, 3, z), new T.Vector3(0, -1, 0));
      const h = ray.intersectObject(host, false);
      return h.length ? h[0].point.y : null;
    };
    if (spine) {
      spine.updateWorldMatrix(true, false);
      const sb = new T.Box3().setFromObject(spine);
      const ssz = sb.max.z - sb.min.z, ssx = sb.max.x - sb.min.x;
      // courier signature: a run of despatch canisters in cradles on the spine
      const cans = size === 'L' ? 3 : size === 'M' ? 2 : 1;
      for (let i = 0; i < cans; i++) {
        const z = sb.min.z + ssz * (0.24 + i * 0.26);
        const y = skinOn(spine, 0, z);
        if (y === null) continue;
        const can = cyl(ht * 0.09, ht * 0.09, ssz * 0.16, matPanel, 'despatchCanister' + i, 8);
        can.rotation.x = Math.PI / 2;
        can.position.set(0, y + ht * 0.06, z); ship.add(can);
        [-1, 1].forEach((zs, k) => {
          const cradle = box(ssx * 0.5, ht * 0.07, 0.04, matEngine, 'canisterCradle' + i + k);
          cradle.position.set(0, y + ht * 0.03, z + zs * ssz * 0.055); ship.add(cradle);
        });
        const lamp = box(0.05, 0.03, 0.05, matCabinLight, 'canisterLamp' + i);
        lamp.position.set(ssx * 0.22, y + ht * 0.12, z); ship.add(lamp);
      }
      // avionics blister and cooling louvres aft on the spine
      const zA = sb.min.z + ssz * 0.1, yA = skinOn(spine, 0, zA);
      if (yA !== null) {
        const blister = box(ssx * 0.66, ht * 0.08, ssz * 0.12, matPanel, 'avionicsBlister');
        blister.position.set(0, yA + ht * 0.03, zA); ship.add(blister);
        for (let i = 0; i < 3; i++) {
          const louvre = box(ssx * 0.6, 0.02, 0.03, matEngine, 'coolingLouvre' + i);
          louvre.position.set(0, yA + ht * 0.065, zA + (i - 1) * 0.05); ship.add(louvre);
        }
      }
    }
    if (fore) {
      fore.updateWorldMatrix(true, false);
      const fb = new T.Box3().setFromObject(fore);
      const fsz = fb.max.z - fb.min.z, fsx = fb.max.x - fb.min.x;
      // approach floods and a pitot boom on the forebody
      [-1, 1].forEach(sd => {
        const x = sd * fsx * 0.3, z = fb.min.z + fsz * 0.66;
        const y = skinOn(fore, x, z);
        if (y === null) return;
        const side = sd < 0 ? 'L' : 'R';
        const hood = box(0.08, 0.05, 0.08, matEngine, 'approachFloodHood' + side);
        hood.position.set(x, y + 0.012, z); ship.add(hood);
        const lens = box(0.055, 0.035, 0.04, matCabinLight, 'approachFloodLens' + side);
        lens.position.set(x, y + 0.018, z + 0.05); ship.add(lens);
      });
      const px = -fsx * 0.16, pz = fb.min.z + fsz * 0.9, py = skinOn(fore, px, pz);
      if (py !== null) {
        const pitot = cyl(0.012, 0.012, fsz * 0.2, matEngine, 'pitotBoom', 6);
        pitot.rotation.x = Math.PI / 2;
        pitot.position.set(px, py + 0.02, pz + fsz * 0.06); ship.add(pitot);
      }
    }
  }
  if (size === 'L') mountCommDish(ship, 'hullForebody', ht, 0.4, matPanel, matHull);
  mountCockpitInterior(ship);
  // order matters: windows, IFF and plumbing are functional and go on first,
  // then greebles fill what's left, keeping clear of all of it
  detailCompartments(ship, shipId);
  mountNavLights(ship);
  return finalize(ship);
}

// ---------- FIGHTER ----------
// Faceted delta interceptor. S: single engine, 2 lasers. M: twin engines.
// L: twin engines, canted twin tails, 2 lasers + 2 missiles.
const FIGHTER = {
  S: { len: 2.0, wid: 0.8, ht: 0.5, engX: [0], engR: 0.26, wingSpan: 0.85, wingRoot: 1.15, tails: 1, missiles: 0 },
  M: { len: 2.4, wid: 0.9, ht: 0.55, engX: [0], engR: 0.24, wingSpan: 1.0, wingRoot: 1.3, tails: 2, missiles: 0 },
  L: { len: 3.0, wid: 1.05, ht: 0.62, engX: [0], engR: 0.27, wingSpan: 1.2, wingRoot: 1.55, tails: 2, missiles: 2 }
};
export function buildFighter(size = 'M', shipId = 'FT-0000') {
  const v = FIGHTER[size] || FIGHTER.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'fighterShip';

  const hullMain = box(wid, ht, len * 0.62, matHull, 'hullMain'); hullMain.position.set(0, ht / 2, -len * 0.05); ship.add(hullMain);
  /* Deck level with the main hull's roof, so the fore section meets it flush
     instead of leaving the hull's dorsal plating overhanging a step down. */
  const foreH = ht * 0.62, foreLen = len * 0.42;
  const foreTop = ht;
  // fore section narrowed by a third across the beam, so it reads as a
  // distinct forward hull rather than the main block continued
  const foreW = wid * 0.82 * 0.67;
  const forebody = box(foreW, foreH, foreLen, matHull, 'hullForebody');
  forebody.position.set(0, foreTop - foreH / 2, len * 0.44); ship.add(forebody);
  // taper carried on the underside so the deck above stays level
  const foreCham = slopedBlock('hullForebodyChamfer', foreW * 0.98, ht * 0.26, foreLen * 0.94,
    foreLen * 0.2, foreLen * 0.44, matHull);
  foreCham.rotation.x = Math.PI;
  foreCham.position.set(0, foreTop - foreH, len * 0.44); ship.add(foreCham);
  /* Thin neck + boxy cockpit block. The old sloped chisel ran out to 0.6*len
     and the canopy perched on its tip, which read as a huge overhang; this
     keeps the same stylistic vocabulary (a narrowed section carrying a
     block) while pulling the screen back so the block visibly holds it. */
  const neck = box(wid * 0.34, ht * 0.3, len * 0.16, matEngine, 'noseNeck');
  neck.position.set(0, ht * 0.34, len * 0.42); ship.add(neck);
  const nose = box(wid * 0.46, ht * 0.42, len * 0.16, matPanel, 'hullNose');
  nose.position.set(0, ht * 0.38, len * 0.53); ship.add(nose);
  [-1, 1].forEach(sd => {
    const brace = box(0.05, ht * 0.12, len * 0.12, matEngine, 'noseBrace' + (sd < 0 ? 'L' : 'R'));
    brace.position.set(sd * wid * 0.2, ht * 0.26, len * 0.45); ship.add(brace);
  });

  const canopy = wedgeCockpit('canopyFairing', wid * 0.5, ht * 0.2, len * 0.34);
  canopy.position.set(0, ht - 0.03, len * 0.16); ship.add(canopy);
  mountProwGlass(ship, 'hullNose', 0.72, 0.62, 0.45);

  const stripe = box(wid * 0.3, 0.03, len * 0.18, matAccent, 'accentStripe');
  stripe.position.set(0, ht + 0.016, -len * 0.16); ship.add(stripe);

  const wingY = ht * 0.42, wingZ = -len * 0.08;
  const wing = kinkedWingPair('wing', wid / 2, v.wingSpan, v.wingRoot, v.wingRoot * 0.6, v.wingRoot * 0.28, 0.07, wingY, wingZ, 0.34, 1 / 3);
  ship.add(wing.group);

  if (size === 'M' || size === 'L') {
    /* Launch cell recessed into a raised pad on the aft dorsal deck — the
       uppermost flat surface at the back of the hull. */
    const padH = ht * 0.1, padZ = -len * 0.2;
    const cellW = wid * 0.17, cellD = len * 0.055;
    const pad = box(cellW * 2 + 0.08, padH, cellD * 2 + 0.1, matPanel, 'vlsPad');
    pad.position.set(0, ht + padH / 2 - 0.02, padZ); ship.add(pad);
    const cellH = padH * 0.6;
    const cell = vlsCell('vlsBank', 2, 2, cellW, cellD, cellH, matPanel);
    cell.position.set(0, ht + padH - 0.03, padZ); ship.add(cell);
  }
  if (v.tails === 1) {
    const tail = finPlate('stabilizerFin', 0.1, ht * 0.8, len * 0.26, len * 0.12);
    tail.position.set(0, ht - 0.03, -len * 0.26 + 0.003); ship.add(tail);
  } else {
    [-1, 1].forEach(s => {
      const tail = finPlate('stabilizerFin' + (s < 0 ? 'L' : 'R'), 0.09, ht * 0.78, len * 0.24, len * 0.11);
      tail.position.set(s * wid * 0.38, ht - 0.05, -len * 0.24 + 0.003);
      tail.rotation.z = -s * 0.32; ship.add(tail);
    });
  }

  if (size !== 'S') {
    // nacelles moved off the wings entirely: mounted directly on the hull
    // flank, astern, below the wing roots
    const nr = v.engR * 0.5;
    [-1, 1].forEach(sd => {
      const e = engineNacelle('nacelle' + (sd < 0 ? 'Left' : 'Right'), nr, len * 0.55, nr * 0.72);
      e.position.set(sd * (wid / 2 + nr * 0.85), wingY - 0.16, wingZ - len * 0.04);
      ship.add(e);
    });
  }
  if (v.engX.length) mountEngineCluster(ship, 'square', v.engX.length, v.engR, 0.62, ht * 0.5, -len * 0.38, ht, -len * 0.36, wid);

  // lasers inboard, pods strictly outboard of them, so the two never share a band
  ({ S: [-0.18, 0.18], M: [-0.18, 0.18], L: [-0.18, 0.18] }[size] || [-0.18, 0.18])
    .forEach((fr, i) => ship.add(laserCannon('laser' + i, Math.sign(fr) * (wid / 2 + v.wingSpan * Math.abs(fr)), wingY - 0.1, wingZ + 0.3)));
  if (size === 'L') {
    /* The heavy mark trades its outer pair of light guns for size-2 particle
       cannons, hung under the wing on the station those guns used to hold. */
    [-1, 1].forEach(sd => {
      mountWingStore(ship, sd * (wid / 2 + v.wingSpan * 0.34), 0.55, (x, under, z) => {
        const cannon = particleCannon('particleHeavy' + (sd < 0 ? 'L' : 'R'), 2, false, matPanel);
        cannon.position.set(x, under - 0.07, z);
        return cannon;
      });
    });
  }
  if (v.missiles >= 2) {
    /* Pylon length is derived per station from the wing's own thickness: the
       kinked panel rises outboard, so a fixed stub falls short of the skin at
       some stations and stood clear of it. */
    const wingMeshes = [];
    ship.traverse(n => { if (n.isMesh && /^wing(Inner|Outer)(Left|Right)$/.test(n.name)) { n.updateWorldMatrix(true, false); wingMeshes.push(n); } });
    const skinRay = new T.Raycaster();
    const wingTop = (x, z) => { skinRay.set(new T.Vector3(x, wingY - 1.5, z), new T.Vector3(0, 1, 0));
      const h = skinRay.intersectObjects(wingMeshes, false); return h.length ? h[0].point.y : null; };
    // staggered along the span, alternating above / below
    [0.5, 0.7].forEach((fr, i) => {
      const above = i % 2 === 0;
      [-1, 1].forEach(sd => {
        const px = sd * (wid / 2 + v.wingSpan * fr);
        const pz = wingZ - len * 0.06 - fr * 0.3;
        /* Seat off the measured skin at THIS station and size the pylon to
           reach it, rather than assuming a flat wing at wingY. */
        const top = wingTop(px, pz);
        const skin = top === null ? wingY : top;
        const py = above ? skin + 0.14 : skin - 0.16;
        const ph = Math.max(0.06, Math.abs(py - skin) - 0.02);
        ship.add(missilePod('missile' + i + (sd < 0 ? 'Left' : 'Right'), px, py, pz, above, ph));
      });
    });
  }

  const legLen = ht * 0.42;
  ship.add(landingLeg('gearNose', 0, len * 0.16, legLen, 0.09, 0.04));
  ship.add(landingLeg('gearRearLeft', -wid * 0.36, -len * 0.2, legLen, 0.1, 0.04));
  ship.add(landingLeg('gearRearRight', wid * 0.36, -len * 0.2, legLen, 0.1, 0.04));
  mountCockpitInterior(ship);
  dressForeHull(ship, shipId, 'hullForebody');
  // order matters: windows, IFF and plumbing are functional and go on first,
  // then greebles fill what's left, keeping clear of all of it
  detailCompartments(ship, shipId);
  mountNavLights(ship);
  return finalize(ship);
}

// ---------- TUG ----------
// Stubby yard tug with forward grabber arms. S: two arms. M: arms + fuel bell.
// L: four arms, fuel bell, winch boom.
const TUG = {
  S: { len: 2.0, wid: 1.6, ht: 1.0, arms: 2, bell: false, boom: false, engX: [-0.5, 0.5], engR: 0.28 },
  M: { len: 2.4, wid: 1.9, ht: 1.15, arms: 2, bell: true, boom: false, engX: [-0.6, 0.6], engR: 0.32 },
  L: { len: 2.9, wid: 2.2, ht: 1.3, arms: 4, bell: true, boom: true, engX: [-0.72, 0.72], engR: 0.36 }
};
export function buildTug(size = 'M', shipId = 'TG-0000') {
  const v = TUG[size] || TUG.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'tugShip';

  const hullMain = box(wid, ht * 0.72, len, matHull, 'hullMain'); hullMain.position.set(0, ht * 0.4, 0); ship.add(hullMain);
  const upper = slopedBlock('hullUpper', wid * 0.8, ht * 0.34, len * 0.8, len * 0.5, len * 0.2, matHull);
  upper.position.set(0, ht * 0.75, -len * 0.05); ship.add(upper);
  /* Fairing bedded INTO the upper block rather than perched on its roof,
     where it read as a stray lump standing proud of the deck. */
  const canopy = wedgeCockpit('canopyFairing', wid * 0.42, ht * 0.12, len * 0.38);
  canopy.position.set(0, ht * 0.94, len * 0.16); ship.add(canopy);
  const canopyCoaming = box(wid * 0.46, ht * 0.05, len * 0.4, matPanel, 'canopyCoaming');
  canopyCoaming.position.set(0, ht * 0.93, len * 0.16); ship.add(canopyCoaming);

  const bumper = box(wid * 0.9, ht * 0.16, 0.14, matAccent, 'accentStripe');
  bumper.position.set(0, ht * 0.24, len / 2 + 0.03); ship.add(bumper);
  [-1, 1].forEach(s => {
    const flank = box(0.05, ht * 0.14, len * 0.5, matAccent, 'hazardFlank' + (s < 0 ? 'L' : 'R'));
    flank.position.set(s * (wid / 2), ht * 0.52, -len * 0.05); ship.add(flank);
  });

  mountProwGlass(ship, 'hullMain', 0.4, 0.3, 0.5);

  // grabber arms: two hinged segments reaching forward, claw jaws at the tip
  const armRows = v.arms === 4 ? [ht * 0.34, ht * 0.66] : [ht * 0.48];
  armRows.forEach((ay, r) => {
    [-1, 1].forEach(s => {
      const tag = 'grabberArm' + r + (s < 0 ? 'L' : 'R');
      const grp = new T.Group(); grp.name = tag;
      const upperSeg = box(0.14, 0.14, len * 0.42, matPanel, 'armUpper');
      upperSeg.position.set(0, 0, len * 0.2); grp.add(upperSeg);
      const knuckle = cyl(0.1, 0.1, 0.18, matEngine, 'armKnuckle', 8);
      knuckle.rotation.z = Math.PI / 2; knuckle.position.set(0, 0, len * 0.4); grp.add(knuckle);
      const knuckleCaution = cautionRing('armCaution', 0.105, 0.05, 8);
      knuckleCaution.rotation.y = Math.PI / 2;
      knuckleCaution.position.set(0, 0, len * 0.4); grp.add(knuckleCaution);
      const foreSeg = box(0.12, 0.12, len * 0.34, matPanel, 'armFore');
      foreSeg.position.set(0, -0.06, len * 0.56); foreSeg.rotation.x = 0.22; grp.add(foreSeg);
      [-1, 1].forEach(j => {
        const jaw = box(0.07, 0.16, 0.22, matAccent, 'armJaw' + (j < 0 ? 'A' : 'B'));
        jaw.position.set(j * 0.07, -0.13, len * 0.72); jaw.rotation.z = j * 0.25; grp.add(jaw);
      });
      grp.position.set(s * wid * 0.34, ay, len * 0.28);
      ship.add(grp);
    });
  });

  if (v.bell) {
    const bell = new T.Mesh(new T.SphereGeometry(ht * 0.42, 10, 7), matHull);
    bell.name = 'fuelBell'; bell.castShadow = true; bell.receiveShadow = true;
    bell.position.set(0, ht * 0.55, -len / 2 - ht * 0.22); ship.add(bell);
    const band = box(ht * 0.5, 0.05, 0.12, matAccent, 'bellBand');
    band.position.set(0, ht * 0.55, -len / 2 - ht * 0.6); ship.add(band);
  }
  if (v.boom) {
    const boom = box(0.12, 0.12, len * 0.5, matPanel, 'winchBoom');
    boom.position.set(0, ht * 1.02, -len * 0.3); boom.rotation.x = -0.25; ship.add(boom);
    const hookHousing = box(0.2, 0.16, 0.2, matEngine, 'winchHousing');
    hookHousing.position.set(0, ht * 0.94, -len * 0.55); ship.add(hookHousing);
  }

  // trapezoidal pusher bank
  mountEngineCluster(ship, 'trapezoidal', v.engX.length + 1, v.engR, 0.7, ht * 0.45, -len / 2 - 0.3, ht, -len / 2, wid);

  ({ S: [0], M: [-0.18, 0.18], L: [-0.2, 0, 0.2] }[size] || [0]).forEach((fx, i) =>
    ship.add(laserCannon('laserBelly' + i, fx * wid, ht * 0.05, len / 2 + 0.1)));

  const legLen = ht * 0.42;
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    ship.add(landingLeg('gear' + (sz > 0 ? 'Front' : 'Rear') + (sx < 0 ? 'Left' : 'Right'), sx * wid * 0.34, sz * (len / 2 - 0.35), legLen, 0.15, 0.055, 0.42, ht * 0.05));
  });
  mountCockpitInterior(ship);
  // order matters: windows, IFF and plumbing are functional and go on first,
  // then greebles fill what's left, keeping clear of all of it
  detailCompartments(ship, shipId);
  mountEngineShroud(ship, 'tug', matPanel);
  mountNavLights(ship);
  return finalize(ship);
}


// ---------- HYDROGEN FREIGHTER ----------
// Cryogenic hydrogen hauler on the same segmented spine as the cargo freighter
// and liner, but its payload is a row of spherical pressure tanks sitting in
// cradle rings along the centreline — LNG-carrier practice, since a sphere is
// the cheapest shape to hold pressure. Insulated, so the tanks are pale, and
// vent stacks rise between them.
const HYDRO = {
  S: { len: 3.8, wid: 1.9, ht: 1.15, sections: 1, tanks: 2, tankScale: 1.32, engX: [-0.6, 0.6], engR: 0.4, wingSpan: 1.3, wingRoot: 1.6 },
  M: { len: 5.4, wid: 2.3, ht: 1.35, sections: 3, tanks: 3, tankScale: 1.2, engX: [-0.8, 0.8], engR: 0.46, wingSpan: 1.6, wingRoot: 1.9 },
  L: { len: 7.4, wid: 2.85, ht: 1.55, sections: 3, tanks: 3, tankScale: 1.28, engX: [-0.95, 0.95], engR: 0.5, wingSpan: 1.9, wingRoot: 2.2 }
};
export function buildHydrogenFreighter(size = 'M', shipId = 'HF-00000') {
  const v = HYDRO[size] || HYDRO.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'hydrogenFreighterShip';
  const rand = seedFromId(shipId);
  // sized to fill the cross-section (wid/ht caps); the spacing cap below is
  // finalized AFTER bayZ (which can shift tanks to dodge a gantry) is known,
  // so it reflects the true minimum gap rather than the ideal even spacing
  const tankRRaw = Math.min(wid * 0.56, ht * 0.8) * (v.tankScale || 1);

  // slim segmented spine, as on the cargo hauler — narrow gantries at the
  // joints, not a widened bay per tank
  const gantryCount = v.sections - 1;
  const gantryLen = len * 0.09;
  const sectionLen = (len - gantryCount * gantryLen) / v.sections;
  const sectionZ = [], gantryZ = [];
  let cursor = len / 2;
  for (let i = 0; i < v.sections; i++) {
    sectionZ.push(cursor - sectionLen / 2);
    cursor -= sectionLen;
    if (i < gantryCount) { gantryZ.push(cursor - gantryLen / 2); cursor -= gantryLen; }
  }
  sectionZ.forEach((z, i) => {
    const sec = box(wid, ht, sectionLen, matHull, i === 0 ? 'hullMain' : 'hullSection' + i);
    sec.position.set(0, ht / 2, z); ship.add(sec);
  });
  gantryZ.forEach((z, i) => {
    const g = box(wid * 0.5, ht * (2 / 3), gantryLen + 0.06, matPanel, 'gantry' + i);
    g.position.set(0, ht / 2, z); ship.add(g);
    [-1, 1].forEach(sd => {
      const rib = box(wid * 0.54, ht * 0.1, 0.08, matEngine, 'gantryRib' + i + (sd < 0 ? 'L' : 'R'));
      rib.position.set(0, ht / 2 + sd * ht * 0.28, z); ship.add(rib);
    });
  });

  const nose = box(wid * 0.57, ht * 0.73, 1.8, matHull, 'hullNose');
  nose.position.set(0, ht * 0.635, len / 2 + 0.75); ship.add(nose);
  const fairLen = 1.05 + 0.8;
  const canopy = wedgeCockpit('canopyFairing', wid * 0.32, 0.24, fairLen);
  canopy.position.set(0, ht - 0.05, len / 2 + 0.3 - fairLen / 2 + 0.35); ship.add(canopy);
  mountProwGlass(ship, 'hullNose', 0.62, 0.42, 0.5);

  /* White insulation only — tinted tanks read poorly against this hull. */
  const tankMat = matTankInsulation;
  const spacing = (len * 0.85) / v.tanks;
  const litFlags = Array.from({ length: v.tanks }, () => rand() > 0.5);
  // tanks sit on the FULL-WIDTH hull, never over a narrow gantry — that is
  // what keeps the sphere's lower hemisphere fully hidden below the deck
  // line instead of hanging exposed past a piece too narrow to cover it
  /* Candidate z per tank: the ideal even-spaced slot, or (if that would clash
     a gantry) both positions just clear of it. A greedy per-tank choice can
     dodge into a LATER tank's space without knowing it yet, so instead every
     combination across all tanks is scored and the one with the largest
     minimum gap wins — cheap since there are at most a couple of clashes. */
  const candidateSets = [];
  for (let i = 0; i < v.tanks; i++) {
    const idealZ = (v.tanks - 1) / 2 * spacing - i * spacing - len * 0.06;
    const clash = gantryZ.find(gz => Math.abs(idealZ - gz) < gantryLen / 2 + tankRRaw * 0.5);
    if (clash === undefined) { candidateSets.push([idealZ]); continue; }
    const off = gantryLen / 2 + tankRRaw * 0.5 + 0.05;
    candidateSets.push([clash + off, clash - off]);
  }
  function minGapOf(combo) {
    const sorted = [...combo].sort((a, b) => b - a);
    let mg = Infinity;
    for (let i = 1; i < sorted.length; i++) mg = Math.min(mg, sorted[i - 1] - sorted[i]);
    return mg;
  }
  let bestCombo = null, bestScore = -Infinity;
  (function enumerate(idx, acc) {
    if (idx === candidateSets.length) {
      const score = minGapOf(acc);
      if (score > bestScore) { bestScore = score; bestCombo = acc.slice(); }
      return;
    }
    for (const c of candidateSets[idx]) { acc.push(c); enumerate(idx + 1, acc); acc.pop(); }
  })(0, []);
  const bayZ = bestCombo;
  // clamp the radius to half the SMALLEST actual gap between tanks (after
  // any gantry-dodge shift), so a shifted tank can never end up overlapping
  const sortedZ = [...bayZ].sort((a, b) => b - a);
  let minGap = Infinity;
  for (let i = 1; i < sortedZ.length; i++) minGap = Math.min(minGap, sortedZ[i - 1] - sortedZ[i]);
  /* Also cap the radius so the aftmost sphere stays forward of the stern
     plate. An overhanging tank collided with the engine shroud's forward
     mouth; shrinking the radius keeps the tank spacing intact, whereas
     nudging the station aft would close the gap to its neighbour. */
  const aftRoom = Math.min(...bayZ) + len / 2 - 0.12;
  const tankR = Math.min(tankRRaw, isFinite(minGap) ? minGap / 2 * 0.96 : tankRRaw, aftRoom);
  bayZ.forEach((z, i) => {
    /* Half-embedded: the sphere's equator sits on the deck line with its
       lower hemisphere down in the hold, Moss-type LNG carrier style —
       cargo carried IN the hull, not perched on top of it. */
    // deliberately coarse: 8 segments reads as a faceted tank rather than a
    // smooth ball, and matches the low-poly language of the rest of the fleet
    const sphere = new T.Mesh(new T.SphereGeometry(tankR, 8, 5), tankMat);
    sphere.name = 'pressureTank' + i; sphere.castShadow = true; sphere.receiveShadow = true;
    sphere.position.set(0, ht, z); ship.add(sphere);
    // deck coaming ringing the hold opening the sphere emerges from
    const cradle = cyl(tankR * 1.06, tankR * 1.06, ht * 0.12, matPanel, 'tankCradle' + i, 8);
    cradle.position.set(0, ht - ht * 0.02, z); ship.add(cradle);
    // vent stack pair — boil-off relief, independent of the loading manifold
    [-1, 1].forEach(sd => {
      const stack = cyl(0.05, 0.05, ht * 0.42, matEngine, 'ventStack' + i + (sd < 0 ? 'A' : 'B'), 8);
      stack.position.set(sd * wid * 0.3, ht + ht * 0.2, z); ship.add(stack);
      const cap = box(0.14, 0.06, 0.14, litFlags[i] ? matCabinLight : matPanel, 'ventLamp' + i + (sd < 0 ? 'A' : 'B'));
      cap.position.set(sd * wid * 0.3, ht + ht * 0.42, z); ship.add(cap);
    });
  });

  /* Loading/isolation manifold: one pipe along the FLANK of the tank row
     (not across the tops), riding just clear of the domes' silhouette at
     that height. A valve — thick body plus a protruding lever, painted a
     fixed red so it reads as a valve regardless of faction colour — sits on
     the pipe at every tank (isolating it from the rest), and a loading valve
     sits at the fore end where the fill line reaches the hull. */
  const manifoldY = ht + tankR * 0.3;
  const manifoldX = tankR * 1.08;
  const foreZ = bayZ[0] + tankR * 1.3, aftZ = bayZ[bayZ.length - 1] - tankR * 1.3;
  const manifold = cyl(0.04, 0.04, foreZ - aftZ, matAccent, 'h2Manifold', 10);
  manifold.rotation.x = Math.PI / 2;
  manifold.position.set(manifoldX, manifoldY, (foreZ + aftZ) / 2); ship.add(manifold);
  bayZ.forEach((z, i) => {
    /* Manifold block under the header, bridging pipe to tank: the run was
       floating alongside the spheres with nothing joining the two. The block
       reaches inboard from the pipe to the tank's flank, and a short spur
       drops from its underside onto the sphere itself. */
    const inboardX = tankR * 0.82;
    const blockW = Math.max(0.16, manifoldX - inboardX + 0.12);
    const mblock = box(blockW, 0.16, 0.2, matPanel, 'tankManifoldBlock' + i);
    mblock.position.set(manifoldX - blockW / 2 + 0.04, manifoldY - 0.09, z);
    ship.add(mblock);
    const spur = cyl(0.035, 0.035, 0.22, matEngine, 'tankManifoldSpur' + i, 8);
    spur.position.set(inboardX + 0.03, manifoldY - 0.2, z);
    ship.add(spur);
    const collar = cyl(0.06, 0.06, 0.05, matAccent, 'tankManifoldCollar' + i, 10);
    collar.position.set(inboardX + 0.03, manifoldY - 0.29, z);
    ship.add(collar);
    const vbody = cyl(0.075, 0.075, 0.16, matEngine, 'valveIsolationBody' + i, 8);
    vbody.rotation.x = Math.PI / 2;
    vbody.position.set(manifoldX, manifoldY, z); ship.add(vbody);
    const lever = box(0.05, 0.16, 0.045, matValveRed, 'valveIsolationLever' + i);
    lever.position.set(manifoldX + 0.09, manifoldY, z); ship.add(lever);
  });
  const loadBody = cyl(0.095, 0.095, 0.2, matEngine, 'valveLoadingBody', 8);
  loadBody.rotation.x = Math.PI / 2;
  loadBody.position.set(manifoldX, manifoldY, foreZ); ship.add(loadBody);
  const loadLever = box(0.06, 0.2, 0.05, matValveRed, 'valveLoadingLever');
  loadLever.position.set(manifoldX + 0.1, manifoldY, foreZ); ship.add(loadLever);
  const loadStub = cyl(0.04, 0.04, 0.3, matEngine, 'valveLoadingStub', 8);
  loadStub.rotation.z = Math.PI / 2;
  loadStub.position.set(manifoldX + 0.18, manifoldY, foreZ); ship.add(loadStub);

  const wingZ = sectionZ[sectionZ.length - 1];
  const wing = kinkedWingPair('wing', wid / 2, v.wingSpan, v.wingRoot, v.wingRoot * 0.78, v.wingRoot * 0.55, 0.1, ht * 0.42, wingZ, 0.24, 1 / 3);
  ship.add(wing.group);

  // bank solved into a reduced envelope so the shroud clears the hull sides
  mountEngineCluster(ship, 'square', v.engX.length + 1, v.engR, 1.25, ht / 2, -len / 2 - 0.6,
    ht * 0.92, -len / 2, wid * 0.88);
  mountEngineShroud(ship, 'h2', matPanel, -len / 2);

  ({ S: [-0.6, 0.6], M: [-0.85, -0.35, 0.35, 0.85], L: [-0.9, -0.55, -0.2, 0.2, 0.55, 0.9] }[size] || [-0.6, 0.6])
    .forEach((fx, i) => mountBellyGun(ship, 'hullNose', fx, 'laserBelly' + i, 0.22));

  const legLen = ht * 0.5;
  const gearZ = v.sections === 1
    ? [sectionZ[0] + sectionLen * 0.3, sectionZ[0] - sectionLen * 0.3]
    : sectionZ;
  gearZ.forEach((z, i) => {
    [-1, 1].forEach(sd => ship.add(landingLeg('gear' + i + (sd < 0 ? 'Left' : 'Right'), sd * (wid / 2 - 0.3), z, legLen, 0.2, 0.06)));
  });

  mountCockpitInterior(ship);
  // order matters: windows, IFF and plumbing are functional and go on first,
  // then greebles fill what's left, keeping clear of all of it
  detailCompartments(ship, shipId);
  sprinkleDorsalLGreebles(ship, /^hullMain$|^hullSection\d+$/, ship.name);
  mountNavLights(ship);
  return finalize(ship);
}

// ---------- ESCAPE POD ----------
// The forward section of a ship with the hull deleted: cockpit block, faceted
// screen, and the short spine immediately behind it. Deliberately near-
// identical across sizes — pods are standardised parts, not bespoke hulls, so
// only overall scale, the aft plug and the RCS quad count change. A single
// solid-fuel de-orbit motor, no wings, no landing gear (they come down under
// a chute), and the same faceted canopy vocabulary as every crewed ship.
const POD = {
  S: { wid: 0.62, ht: 0.6, len: 0.9, quads: 2, ring: false },
  M: { wid: 0.74, ht: 0.7, len: 1.15, quads: 4, ring: false },
  L: { wid: 0.88, ht: 0.8, len: 1.45, quads: 4, ring: true }
};
export function buildEscapePod(size = 'M', shipId = 'EP-0000') {
  const v = POD[size] || POD.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'escapePodShip';
  const rand = seedFromId(shipId);

  // cockpit block — the pod IS the nose section, so this is the whole hull
  const cabin = box(wid, ht, len * 0.62, matHull, 'hullNose');
  cabin.position.set(0, ht / 2, len * 0.19); ship.add(cabin);
  mountProwGlass(ship, 'hullNose', 0.78, 0.6, 0.5);

  // short aft plug: the stub of spine that shears away from the parent ship
  const plug = box(wid * 0.78, ht * 0.78, len * 0.3, matPanel, 'aftPlug');
  plug.position.set(0, ht * 0.5, -len * 0.27); ship.add(plug);
  const collar = box(wid * 0.84, ht * 0.84, 0.06, matEngine, 'separationCollar');
  collar.position.set(0, ht * 0.5, -len * 0.12); ship.add(collar);
  const caution = cautionRing('separationCaution', Math.max(wid, ht) * 0.46, 0.07);
  caution.position.set(0, ht * 0.5, -len * 0.17); ship.add(caution);

  // single solid de-orbit motor on the aft face
  const motor = engineNacelle('engine0', Math.min(wid, ht) * 0.24, len * 0.26, Math.min(wid, ht) * 0.17);
  motor.position.set(0, ht * 0.5, -len * 0.5); ship.add(motor);

  // RCS quads for attitude control after separation
  for (let i = 0; i < v.quads; i++) {
    const zf = -len * 0.02 + (i < 2 ? len * 0.2 : -len * 0.12);
    const sd = i % 2 ? 1 : -1;
    const pad = box(0.06, ht * 0.16, 0.12, matEngine, 'rcsQuad' + i);
    pad.position.set(sd * (wid / 2), ht * 0.62, zf); ship.add(pad);
    const nozzle = cyl(0.022, 0.03, 0.06, matPanel, 'rcsNozzle' + i, 6);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(sd * (wid / 2 + 0.04), ht * 0.62, zf); ship.add(nozzle);
  }

  // recovery beacon and grab rail — what a rescue tug actually docks onto
  const beacon = box(0.1, 0.06, 0.1, matCabinLight, 'recoveryBeacon');
  /* Seated on the aft plug's MEASURED top face. Taking y from the cabin deck
     while taking z from a fraction of length put it over the plug, whose
     crown sits well below that deck — the same two-diverging-bases fault as
     the tender's drogue lamp. */
  {
    let plug = null;
    ship.traverse(n => { if (n.isMesh && n.name === 'aftPlug' && !plug) plug = n; });
    if (plug) {
      plug.updateWorldMatrix(true, false);
      const pb = new T.Box3().setFromObject(plug);
      beacon.position.set(0, pb.max.y - 0.015, (pb.min.z + pb.max.z) / 2);
    } else {
      beacon.position.set(0, ht + 0.02, -len * 0.2);
    }
  }
  ship.add(beacon);
  [-1, 1].forEach(sd => {
    const rail = box(0.05, 0.05, len * 0.3, matPanel, 'grabRail' + (sd < 0 ? 'L' : 'R'));
    rail.position.set(sd * (wid / 2 - 0.03), ht * 0.9, len * 0.06); ship.add(rail);
  });
  if (v.ring) {
    // heavier marks carry a docking ring so they can be recovered under power
    const ring = cyl(wid * 0.3, wid * 0.3, 0.07, matPanel, 'dockingRing', 12);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, ht * 0.5, len * 0.51); ship.add(ring);
  }

  mountCockpitInterior(ship);
  sprinkleWindows(ship, 'hullNose', 2, shipId, ship.name);
  mountIFF(ship, 'hullNose', shipId);
  sprinkleGreebles(ship, 'hullNose', 5, ship.name);
  mountAntenna(ship, 'hullNose', ht, 0.34, 0.3);
  // the pod's body is almost entirely cabin, so its "rear deck" is the aft
  // plug behind the cockpit block, not the cabin roof
  sprinkleAftDeck(ship, /^aftPlug$/, ship.name);
  mountNavLights(ship);
  return finalize(ship);
}

// ---------- SUPPORT TENDER ----------
// Rescue rig you call when you are dead in the void: a propellant bowser with
// a refuelling boom and drogue, plus a repair gantry carrying manipulator
// arms and work floods. Built on the trader's stout hull so it reads as a
// civilian utility craft rather than a warship.
// S: fast tanker (fuel only). M: fuel + one repair arm. L: heavy salvage rig.
const SUPPORT = {
  S: { len: 2.6, wid: 1.5, ht: 1.0, tanks: 2, arms: 0, engX: [-0.45, 0.45], engR: 0.32, floods: 2, wingSpan: 1.0, wingRoot: 1.3 },
  M: { len: 3.3, wid: 1.8, ht: 1.15, tanks: 3, arms: 1, engX: [-0.6, 0.6], engR: 0.38, floods: 3, wingSpan: 1.25, wingRoot: 1.6 },
  L: { len: 4.2, wid: 2.1, ht: 1.35, tanks: 4, arms: 2, engX: [-0.75, 0.75], engR: 0.44, floods: 4, wingSpan: 1.5, wingRoot: 1.9 }
};
export function buildSupport(size = 'M', shipId = 'RS-0000') {
  const v = SUPPORT[size] || SUPPORT.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'supportShip';
  const rand = seedFromId(shipId);

  const hullMain = box(wid, ht, len, matHull, 'hullMain');
  hullMain.position.set(0, ht / 2, 0); ship.add(hullMain);
  const nose = box(wid * 0.62, ht * 0.72, 0.9, matHull, 'hullNose');
  nose.position.set(0, ht * 0.5, len / 2 + 0.4); ship.add(nose);
  const noseTip = box(wid * 0.44, ht * 0.5, 0.45, matPanel, 'hullNoseTip');
  noseTip.position.set(0, ht * 0.5, len / 2 + 1.0); ship.add(noseTip);
  const fairLen = Math.min(1.1, len * 0.4);
  const canopy = wedgeCockpit('canopyFairing', wid * 0.4, ht * 0.2, fairLen);
  canopy.position.set(0, ht - 0.04, len / 2 - fairLen / 2 + 0.28); ship.add(canopy);
  mountProwGlass(ship, 'hullNoseTip', 0.8, 0.6, 0.5);

  // propellant bowser: ranked cylindrical tanks along the spine, cargo-hauler style
  const tankR = Math.min(ht * 0.3, (len * 0.72) / (v.tanks * 2.3));
  const spacing = (len * 0.78) / v.tanks;
  for (let i = 0; i < v.tanks; i++) {
    const z = (v.tanks - 1) / 2 * spacing - i * spacing;
    const tank = cyl(tankR, tankR, spacing * 0.78, matTankInsulation, 'bowserTank' + i, 12);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, ht + tankR * 0.8, z); ship.add(tank);
    const saddle = box(tankR * 2.05, ht * 0.16, spacing * 0.5, matPanel, 'tankSaddle' + i);
    saddle.position.set(0, ht + 0.02, z); ship.add(saddle);
    [-1, 1].forEach(sd => {
      const strap = cyl(tankR * 1.08, tankR * 1.08, 0.05, matEngine, 'tankStrap' + i + (sd < 0 ? 'L' : 'R'), 12);
      strap.rotation.x = Math.PI / 2;
      strap.position.set(0, ht + tankR * 0.8, z + sd * spacing * 0.3); ship.add(strap);
    });
  }

  /* Refuelling boom: a stowed transfer arm folded along the starboard flank,
     ending in a drogue basket — the business end a stranded ship plugs into. */
  const boomY = ht * 0.58, boomX = wid / 2 + 0.06;
  const boom = cyl(0.06, 0.06, len * 0.5, matEngine, 'refuelBoom', 8);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(boomX, boomY, len * 0.04); ship.add(boom);
  const boomHinge = cyl(0.11, 0.11, 0.16, matPanel, 'refuelBoomHinge', 10);
  boomHinge.rotation.z = Math.PI / 2;
  boomHinge.position.set(boomX, boomY, -len * 0.2); ship.add(boomHinge);
  const drogue = cyl(0.075, 0.19, 0.24, matPanel, 'refuelDrogue', 12);
  drogue.rotation.x = -Math.PI / 2;
  drogue.position.set(boomX, boomY, len * 0.32); ship.add(drogue);
  const drogueLamp = cyl(0.06, 0.06, 0.04, matGlow, 'refuelDrogueLamp', 10);
  drogueLamp.rotation.x = Math.PI / 2;
  /* Seated from the drogue's MEASURED forward face rather than its own
     fraction of hull length — the two bases diverged as the ship scaled, so
     the lamp drifted off the drogue entirely and hovered by the bow flank. */
  drogue.updateWorldMatrix(true, false);
  const dbox = new T.Box3().setFromObject(drogue);
  drogueLamp.position.set(boomX, boomY, dbox.max.z - 0.015);
  ship.add(drogueLamp);
  const transferPump = box(0.16, 0.18, 0.3, matPanel, 'transferPump');
  transferPump.position.set(boomX - 0.02, boomY + 0.16, -len * 0.12); ship.add(transferPump);
  const cautionBoom = cautionRing('refuelCaution', 0.13, 0.08);
  cautionBoom.rotation.z = Math.PI / 2;
  cautionBoom.position.set(boomX, boomY, len * 0.2); ship.add(cautionBoom);

  /* Repair gantry to port: manipulator arms with claw jaws, mirroring the
     tug's vocabulary, plus work floods so the crew can see the damage. */
  if (v.arms) {
    const gantry = box(0.14, ht * 0.2, len * 0.42, matPanel, 'repairGantry');
    gantry.position.set(-(wid / 2 + 0.05), ht * 0.62, -len * 0.02); ship.add(gantry);
    for (let i = 0; i < v.arms; i++) {
      const grp = new T.Group(); grp.name = 'repairArm' + i;
      const upper = box(0.11, 0.11, len * 0.26, matPanel, 'armUpper');
      upper.position.z = len * 0.13; grp.add(upper);
      const knuckle = cyl(0.08, 0.08, 0.14, matEngine, 'armKnuckle', 8);
      knuckle.rotation.z = Math.PI / 2; knuckle.position.z = len * 0.26; grp.add(knuckle);
      const fore = box(0.09, 0.09, len * 0.2, matPanel, 'armFore');
      fore.position.set(0, -0.05, len * 0.36); fore.rotation.x = 0.24; grp.add(fore);
      [-1, 1].forEach(j => {
        const jaw = box(0.05, 0.13, 0.18, matAccent, 'armJaw' + (j < 0 ? 'A' : 'B'));
        jaw.position.set(j * 0.055, -0.11, len * 0.45); jaw.rotation.z = j * 0.22; grp.add(jaw);
      });
      grp.position.set(-(wid / 2 + 0.05), ht * (0.5 + i * 0.28), -len * 0.16);
      ship.add(grp);
    }
  }
  for (let i = 0; i < v.floods; i++) {
    const z = len * 0.34 - i * (len * 0.6 / Math.max(1, v.floods - 1));
    [-1, 1].forEach(sd => {
      const hood = box(0.09, 0.11, 0.11, matEngine, 'workFloodHood' + i + (sd < 0 ? 'L' : 'R'));
      hood.position.set(sd * (wid / 2 - 0.01), ht * 0.86, z); ship.add(hood);
      const lens = box(0.04, 0.08, 0.08, matCabinLight, 'workFloodLens' + i + (sd < 0 ? 'L' : 'R'));
      lens.position.set(sd * (wid / 2 + 0.05), ht * 0.86, z); ship.add(lens);
    });
  }

  ship.add(kinkedWingPair('wing', wid / 2, v.wingSpan, v.wingRoot, v.wingRoot * 0.78, v.wingRoot * 0.55,
    0.09, ht * 0.4, -len * 0.24, 0.2, 1 / 3).group);
  mountEngineCluster(ship, 'square', v.engX.length + 1, v.engR, 1.0, ht / 2, -len / 2 - 0.45, ht, -len / 2, wid);

  // a tender carries a single defensive mount, no more
  mountBellyGun(ship, 'hullNose', 0, 'laserBelly0', 0.2);

  const legLen = ht * 0.46;
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    ship.add(landingLeg('gear' + (sz > 0 ? 'Front' : 'Rear') + (sx < 0 ? 'Left' : 'Right'),
      sx * (wid / 2 - 0.26), sz * (len / 2 - 0.5), legLen, 0.17, 0.06));
  });
  mountCockpitInterior(ship);
  detailCompartments(ship, shipId);
  mountCommDish(ship, 'hullNose', ht, 0.42, matPanel, matHull);
  mountNavLights(ship);
  return finalize(ship);
}

// ---------- NAVY ----------
/* Three genuinely different warships rather than one hull at three scales.
 *
 *   S  Cutter   — single stout block on the liner-S pattern, widened, wings
 *                 clipped for sprint speed. Light: particle cannons only, no
 *                 turret, no cells. The hull that gets there first.
 *   M  Frigate  — deeper, boxier, unstreamlined. Turret, dorsal VLS on a
 *                 raised spine bump, heavy size-2 particle cannons above and
 *                 below the wings, light size-1 pair flanking the cockpit
 *                 block. No flank cargo/hab boxes.
 *   L  Cruiser  — segmented liner-L hull with the passenger cabins stripped,
 *                 sections slimmed 15% in height, a dorsal spine bridging the
 *                 first two segments carrying flanking turrets and a
 *                 double-size VLS, a ventral keel plate and stabiliser, and a
 *                 second engine room aft.
 *
 * Every mark carries the co-axial rectilinear engine shroud.
 */
const NAVY = {
  S: { role: 'Cutter', len: 3.4, wid: 2.05, ht: 1.05, wingSpan: 1.38, wingRoot: 1.93,
       engX: [-0.28, 0.28], engR: 0.3, tails: 1, engRoomFrac: 0.62, engRoomFracY: 0.6,
       size1: 2, size2: 0, turrets: 0, vls: null, chin: 0, tipPods: true },
  M: { role: 'Frigate', len: 4.7, wid: 2.24, ht: 0.98, wingSpan: 1.6, wingRoot: 1.95,
       engX: [-0.35], engR: 0.34, tails: 2, engRoomFrac: 0.84, engRoomFracY: 0.66,
       size1: 2, size2: 4, turrets: 1, vls: { cols: 2, rows: 3 }, chin: 0 },
  L: { role: 'Cruiser', len: 6.6, wid: 2.8, ht: 1.6 * 0.85, sections: 3, wingSpan: 1.85, wingRoot: 2.2,
       engX: [-0.85, 0, 0.85], engR: 0.44, tails: 2, engRoomFrac: 0.74, engRoomFracY: 0.8,
       size1: 4, size2: 8, turrets: 2, vls: { cols: 4, rows: 3 }, chin: 4 }
};
export function buildNavy(size = 'M', shipId = 'NV-0000') {
  const v = NAVY[size] || NAVY.M;
  const { len, wid, ht } = v;
  const ship = new T.Group(); ship.name = 'navyShip';
  const rand = seedFromId(shipId);
  const isCruiser = size === 'L';

  // ---- hull ----
  const sectionZ = [], gantryZ = [];
  let sectionLen = len;
  if (isCruiser) {
    const gantryCount = v.sections - 1, gantryLen = len * 0.08;
    sectionLen = (len - gantryCount * gantryLen) / v.sections;
    let cursor = len / 2;
    for (let i = 0; i < v.sections; i++) {
      sectionZ.push(cursor - sectionLen / 2);
      cursor -= sectionLen;
      if (i < gantryCount) { gantryZ.push(cursor - gantryLen / 2); cursor -= gantryLen; }
    }
    sectionZ.forEach((z, i) => {
      const sec = box(wid, ht, sectionLen, matNavyHull, i === 0 ? 'hullMain' : 'hullSection' + i);
      sec.position.set(0, ht / 2, z); ship.add(sec);
    });
    gantryZ.forEach((z, i) => {
      const g = box(wid * 0.5, ht * (2 / 3), gantryLen + 0.06, matNavyPanel, 'gantry' + i);
      g.position.set(0, ht / 2, z); ship.add(g);
      const corridor = box(wid * 0.34, ht * 0.3, gantryLen + 0.1, matNavyHull, 'connectingCorridor' + i);
      corridor.position.set(0, ht * 0.68, z); ship.add(corridor);
      // lit ports along the connecting blocks, both flanks and the crown
      [-1, 1].forEach(sd => {
        const w = box(0.04, ht * 0.1, gantryLen * 0.6,
          rand() > 0.4 ? matCabinLight : matCabinDark, 'corridorWindow' + i + (sd < 0 ? 'L' : 'R'));
        w.position.set(sd * (wid * 0.17), ht * 0.68, z); ship.add(w);
      });
      const crown = box(wid * 0.22, 0.04, gantryLen * 0.55,
        rand() > 0.4 ? matCabinLight : matCabinDark, 'corridorWindowTop' + i);
      crown.position.set(0, ht * 0.83, z); ship.add(crown);
    });
  } else {
    const hullMain = box(wid, ht, len, matNavyHull, 'hullMain');
    hullMain.position.set(0, ht / 2, 0); ship.add(hullMain);
    sectionZ.push(0);
  }

  // ---- forebody and cockpit block ----
  /* Broad, low forward slab: near hull width, its deck flush with the main
     deck so the topside runs flat forward, ending in a blunt face with a
     shallow dark panel set into it, and chamfered where it meets the belly. */
  const noseW = wid * 0.85, noseH = ht * 0.46;
  /* The port side of the slab is cut back so only the bridge side runs on
     forward: there is no longer a block ahead of the deck to port of the
     cockpit, which is what makes the offset read as hull shape rather than
     trim. The full-width slab is shortened and a starboard-only extension
     carries the pod. */
  const noseCut = isCruiser ? 0 : 0.52;
  const noseLen = (isCruiser ? 1.8 : 1.3) - noseCut;
  const noseZ = len / 2 + noseLen / 2 - 0.06;
  const nose = box(noseW, noseH, noseLen, matNavyHull, 'hullNose');
  nose.position.set(0, ht - noseH / 2 - 0.01, noseZ); ship.add(nose);
  // chamfer: sloped cut from the slab's underside back toward the belly
  const chamH = ht * 0.2;
  const cham = slopedBlock('hullNoseChamfer', noseW * 0.96, chamH, noseLen * 0.86, noseLen * 0.3,
    noseLen * 0.5, matNavyHull);
  cham.rotation.x = Math.PI;
  cham.position.set(0, ht - noseH + 0.01, noseZ - noseLen * 0.04); ship.add(cham);
  // blunt tip block carrying the recessed screen
  /* The cutter and frigate carry a half-width cockpit block right-aligned on
     the forward hull; only the cruiser keeps a full-width blunt face. */
  const narrowTip = !isCruiser;
  /* On the half-bridge marks the cockpit is a POD grafted onto one end of the
     nose and standing proud of its face, so the asymmetry is structural
     rather than a paint job. The pod is enclosed on its inboard side and
     below, so a pilot looking around from inside sees the ship's own hull
     through the glass instead of open space. */
  const podOut = narrowTip ? 0.46 : 0;
  const tipD = 0.34 + podOut;
  const tipW = noseW * (narrowTip ? 0.47 : 0.94);
  const tipX = narrowTip ? (noseW / 2 - tipW / 2) : 0;
  const tipY = ht - noseH / 2 - 0.01;
  const slabFaceZ = noseZ + noseLen / 2;
  if (narrowTip) {
    // starboard-only extension: the forward run that the port side no longer has
    const ext = box(tipW, noseH * 0.94, noseCut, matNavyHull, 'hullNoseStarboardExt');
    ext.position.set(tipX, tipY, slabFaceZ + noseCut / 2); ship.add(ext);
    const extRib = box(tipW * 1.02, 0.05, noseCut * 0.9, matNavyPanel, 'hullNoseExtRib');
    extRib.position.set(tipX, tipY + noseH * 0.46, slabFaceZ + noseCut / 2); ship.add(extRib);
    // exposed inboard face of the extension, seen from the port deck
    const extWall = box(0.06, noseH * 0.94, noseCut, matNavyPanel, 'hullNoseExtWall');
    extWall.position.set(tipX - tipW / 2 + 0.02, tipY, slabFaceZ + noseCut / 2); ship.add(extWall);
  }
  const noseFaceZ = slabFaceZ + noseCut;
  const noseTip = narrowTip
    ? trapezoidPrism('hullNoseTip', tipW, tipW * 0.6, tipD, noseH * 0.92, matNavyPanel)
    : box(tipW, noseH * 0.92, tipD, matNavyPanel, 'hullNoseTip');
  noseTip.position.set(tipX, tipY, noseFaceZ + podOut - tipD / 2); ship.add(noseTip);
  const faceZ = noseFaceZ + podOut;
  if (narrowTip) {
    // inboard bulkhead and floor: the structure the pilot sees looking aft
    // and to port, and what makes the pod read as attached on one side only
    const wall = box(0.07, noseH * 0.92, tipD * 0.9, matNavyHull, 'bridgePodBulkhead');
    wall.position.set(tipX - tipW * 0.4, tipY, noseFaceZ + podOut - tipD * 0.55); ship.add(wall);
    const floor = trapezoidPrism('bridgePodFloor', tipW, tipW * 0.6, tipD, 0.06, matNavyHull);
    floor.position.set(tipX, tipY - noseH * 0.46 + 0.03, noseFaceZ + podOut - tipD / 2); ship.add(floor);
    const roof = trapezoidPrism('bridgePodRoof', tipW * 0.98, tipW * 0.58, tipD * 0.92, 0.06, matNavyPanel);
    roof.position.set(tipX, tipY + noseH * 0.46 - 0.03, noseFaceZ + podOut - tipD / 2); ship.add(roof);
    const collar = box(tipW * 1.04, noseH * 0.96, 0.08, matNavyHull, 'bridgePodCollar');
    collar.position.set(tipX, tipY, noseFaceZ + 0.02); ship.add(collar);
    // outboard side light, so mouselook to starboard also has a real window
    const sideGlass = box(0.05, noseH * 0.4, tipD * 0.5, matGlass, 'cockpitGlassSide');
    sideGlass.position.set(tipX + tipW / 2 - 0.015, tipY, noseFaceZ + podOut - tipD * 0.45); ship.add(sideGlass);
  }
  /* The screen sits in a proud FRAME rather than behind a solid plate. A
     recessed pocket only works if the surrounding face has a hole in it; with
     solid blocks, anything in front — the tip prism's own front wall — simply
     occludes the glass, which is what hid the cockpit entirely. The frame
     stands off the face so the pane still reads as set back within it. */
  const glassW = tipW * 0.55, glassH = noseH * 0.46;
  const glass = box(glassW, glassH, 0.05, matGlass, 'cockpitGlass');
  glass.position.set(tipX, tipY, faceZ + 0.012); ship.add(glass);
  const frameT = 0.055;
  [[glassW + frameT * 2, frameT, 0, glassH / 2 + frameT / 2, 'Top'],
   [glassW + frameT * 2, frameT, 0, -glassH / 2 - frameT / 2, 'Bottom'],
   [frameT, glassH, -glassW / 2 - frameT / 2, 0, 'Left'],
   [frameT, glassH, glassW / 2 + frameT / 2, 0, 'Right']].forEach(([w, h, ox, oy, nm]) => {
    const bar = box(w, h, 0.09, matNavyPanel, 'cockpitSocket' + nm);
    bar.position.set(tipX + ox, tipY + oy, faceZ - 0.01); ship.add(bar);
  });
  const socket = box(tipW * 0.64, noseH * 0.56, 0.05, matNavyPanel, 'cockpitSocket');
  socket.position.set(tipX, tipY, faceZ - 0.035); ship.add(socket);
  [-1, 1].forEach(sd => {
    const strip = box(0.05, noseH * 0.5, 0.05, matAccent, 'cockpitSocketRim' + (sd < 0 ? 'L' : 'R'));
    strip.position.set(tipX + sd * tipW * 0.33, tipY, faceZ - 0.028); ship.add(strip);
  });
  if (narrowTip) {
    /* The offset bridge is deliberate, so the bare half it leaves gets a
       sensor suite rather than being re-centred: a stepped deck carrying
       dish arrays and flat radar panels, sized from the space the bridge
       does not occupy. */
    const bayW = noseW - tipW - 0.06;
    const bayX = -(noseW / 2) + bayW / 2 + 0.02;
    const deckH = noseH * 0.5;
    const deckD = 0.5;
    const deckCz = slabFaceZ - deckD / 2 + 0.02;
    const deck = box(bayW, deckH, deckD, matNavyHull, 'sensorDeck');
    deck.position.set(bayX, ht - noseH + deckH / 2 + 0.01, deckCz); ship.add(deck);
    const deckTop = ht - noseH + deckH + 0.01;
    const coaming = box(bayW * 0.96, 0.05, deckD * 0.94, matNavyPanel, 'sensorDeckCoaming');
    coaming.position.set(bayX, deckTop - 0.02, deckCz); ship.add(coaming);

    /* Everything on this deck is capped below the bridge crown. The dishes
       previously stood taller than the bridge, which read as a full-width bow
       and cancelled the deliberate offset. */
    const crownY = tipY + noseH * 0.46;
    const headroom = Math.max(0.05, crownY - 0.12 - deckTop);
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'L' : 'R';
      const px = bayX + sd * bayW * 0.24;
      const pz = deckCz + deckD * 0.16;
      const ped = cyl(0.045, 0.055, headroom * 0.34, matEngine, 'sensorPedestal' + side, 8);
      ped.position.set(px, deckTop + headroom * 0.17, pz); ship.add(ped);
      const dishR = Math.min(bayW * 0.19, headroom * 0.5);
      const dish = new T.Mesh(new T.SphereGeometry(dishR, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.45), matDishSurface);
      dish.name = 'sensorDish' + side; dish.castShadow = true; dish.receiveShadow = true;
      dish.rotation.x = -0.7;
      dish.position.set(px, deckTop + headroom * 0.34, pz); ship.add(dish);
      const sLiner = new T.Mesh(new T.SphereGeometry(dishR * 0.92, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.45), matDishLiner);
      sLiner.name = 'sensorDishLiner' + side; sLiner.receiveShadow = true;
      sLiner.rotation.x = -0.7;
      sLiner.position.set(px, deckTop + headroom * 0.34, pz); ship.add(sLiner);
      const feed = cyl(0.016, 0.016, dishR * 0.8, matEngine, 'sensorDishFeed' + side, 6);
      feed.rotation.x = -0.7;
      feed.position.set(px, deckTop + headroom * 0.5, pz + 0.04); ship.add(feed);
    });

    // flat phased-array radar panels, raked outboard, aft of the dishes
    [0, 1].forEach(i => {
      const ph = headroom * 0.5;
      const panel = box(bayW * 0.42, ph, 0.06, matNavyPanel, 'radarPanel' + i);
      panel.rotation.y = 0.5 - i * 0.25;
      panel.position.set(bayX + (i - 0.5) * bayW * 0.4, deckTop + ph * 0.5, deckCz - deckD * 0.3);
      ship.add(panel);
      const face = box(bayW * 0.34, ph * 0.68, 0.03, matCabinDark, 'radarFace' + i);
      face.rotation.y = 0.5 - i * 0.25;
      face.position.set(bayX + (i - 0.5) * bayW * 0.4, deckTop + ph * 0.5, deckCz - deckD * 0.3 + 0.04);
      ship.add(face);
    });

    // service clutter and a lit console port on the sensor deck
    for (let i = 0; i < 3; i++) {
      const g = box(bayW * 0.14, 0.05, tipD * 0.3, i % 2 ? matPanel : matEngine, 'sensorGreeble' + i);
      g.position.set(bayX + bayW * (0.3 - i * 0.3), deckTop - 0.005, deckCz - deckD * 0.34); ship.add(g);
    }
    const port = box(bayW * 0.2, noseH * 0.16, 0.04, matCabinLight, 'sensorDeckPort');
    port.position.set(bayX, ht - noseH * 0.55, slabFaceZ - 0.02); ship.add(port);
  }
  // flat forward deck: lit and dark ports plus service hatches
  for (let i = 0; i < 3; i++) {
    const z = noseZ + noseLen * (0.3 - i * 0.26);
    [-1, 1].forEach(sd => {
      const w = box(0.04, noseH * 0.3, noseLen * 0.14,
        rand() > 0.4 ? matCabinLight : matCabinDark, 'noseDeckWindow' + i + (sd < 0 ? 'L' : 'R'));
      w.position.set(sd * (noseW / 2 - 0.005), ht - noseH * 0.5, z); ship.add(w);
    });
    const hatch = box(noseW * 0.16, 0.03, noseLen * 0.11, i % 2 ? matNavyPanel : matEngine, 'noseDeckHatch' + i);
    hatch.position.set(noseW * 0.22, ht - 0.005, z); ship.add(hatch);
  }

  // ---- wings ----
  /* Cruiser wings sit on the joint between the two rear modules, so the root
     also serves as the brace tying those modules together. */
  const wingY = ht * 0.42, wingZ = isCruiser ? gantryZ[gantryZ.length - 1] : 0;
  const wing = kinkedWingPair('wing', wid / 2, v.wingSpan, v.wingRoot, v.wingRoot * 0.78,
    v.wingRoot * 0.55, 0.1, wingY, wingZ, isCruiser ? 0.2 : 0.26, 1 / 3, matNavyWing);
  ship.add(wing.group);
  if (isCruiser) {
    // wing-root brace: a spar bridging both modules and landing on the
    // central body, so the wing is carried by structure rather than skin
    const braceLen = Math.abs(sectionZ[1] - sectionZ[2]) * 0.72;
    const brace = box(wid * 0.94, ht * 0.26, braceLen, matNavyPanel, 'wingRootBrace');
    brace.position.set(0, wingY, wingZ); ship.add(brace);
    const braceCore = box(wid * 0.56, ht * 0.34, braceLen * 0.6, matNavyHull, 'wingRootBraceCore');
    braceCore.position.set(0, wingY, wingZ); ship.add(braceCore);
    [-1, 1].forEach(sd => {
      const gusset = box(0.08, ht * 0.3, braceLen * 0.9, matEngine, 'wingRootGusset' + (sd < 0 ? 'L' : 'R'));
      gusset.position.set(sd * (wid * 0.47), wingY, wingZ); ship.add(gusset);
    });
  }
  /* Tail surfaces. The cruiser keeps its twin canted stabilisers — the rail
     runs aft to lie between them — while the single-block marks carry one
     centreline fin stood off above the engine shroud (added further down,
     once the shroud exists). */

  // ---- service livery: light bar and faction badge amidships on the bow block ----


  // ---- dorsal superstructure, turrets and launch cells ----
  if (isCruiser) {
    /* Spine bridging the first two segments: the topmost structure now runs
       continuously over the gantry between them instead of stopping short. */
    /* Rail runs aft to lie between the two horizontal stabilisers and forward
       until it meets the bow structure, so the rib reads as one continuous
       spine rather than stopping short of the forward dorsal block. */
    const spineFrom = -len * 0.44, spineTo = sectionZ[0] + sectionLen * 0.42;
    const spineLen = spineTo - spineFrom, spineH = ht * 0.08;
    const cellW0 = wid * 0.12;
    const cellD0 = Math.min(sectionLen * 0.085, (spineLen - 0.3) / (v.vls.rows * 2));
    const bankW0 = v.vls.cols * cellW0;
    const spine = box(bankW0 + 0.12, spineH, spineLen, matNavyHull, 'dorsalSpine');
    spine.position.set(0, ht + spineH / 2 - 0.02, (spineFrom + spineTo) / 2); ship.add(spine);
    [-1, 1].forEach(sd => {
      const rail = box(0.06, spineH * 1.08, spineLen * 0.96, matNavyPanel, 'dorsalSpineRail' + (sd < 0 ? 'L' : 'R'));
      rail.position.set(sd * (bankW0 / 2 + 0.06), ht + spineH / 2 - 0.02, (spineFrom + spineTo) / 2); ship.add(rail);
    });
    // sloped forward end, matching the wedge profile used on the frigate
    const spineNose = slopedBlock('dorsalSpineNose', bankW0 + 0.12, spineH,
      sectionLen * 0.26, sectionLen * 0.08, sectionLen * 0.18, matNavyHull);
    spineNose.position.set(0, ht - 0.02, spineTo - sectionLen * 0.02); ship.add(spineNose);
    /* Filler carrying the rib down onto the hull: over the gantry joints there
       is nothing beneath the spine, which left it hanging in mid-air. */
    const fillH = ht * 0.3;
    const fill = box(bankW0 + 0.02, fillH, spineLen, matNavyHull, 'dorsalSpineFill');
    fill.position.set(0, ht - 0.02 - fillH / 2, (spineFrom + spineTo) / 2); ship.add(fill);
    [-1, 1].forEach(sd => {
      const web = box(0.05, fillH * 0.8, spineLen * 0.94, matNavyPanel, 'dorsalSpineWeb' + (sd < 0 ? 'L' : 'R'));
      web.position.set(sd * (bankW0 / 2 + 0.02), ht - 0.04 - fillH / 2, (spineFrom + spineTo) / 2); ship.add(web);
    });
    for (let i = 0; i < 4; i++) {
      const g = box(0.12, 0.07, 0.16, i % 2 ? matPanel : matEngine, 'spineGreeble' + i);
      g.position.set(wid * 0.19, ht + spineH - 0.02, spineFrom + spineLen * (0.15 + i * 0.22)); ship.add(g);
      const lamp = box(0.09, 0.04, 0.1, matCabinLight, 'spineLamp' + i);
      lamp.position.set(-wid * 0.19, ht + spineH - 0.02, spineFrom + spineLen * (0.15 + i * 0.22)); ship.add(lamp);
    }
    /* Turrets ride a sponson block on the cheek, with the mount origin on the
       sponson's top face. The thin cheek plate this replaced was shallower
       than the ring assembly, so the turret hung in mid-air beside it. */
    [-1, 1].forEach((sd, i) => {
      const side = sd < 0 ? 'L' : 'R';
      const spW = 0.36, spH = ht * 0.2, spLen = 0.56, spY = ht * 0.7;
      const spZ = sectionZ[0] - sectionLen * 0.42;
      const spX = sd * (wid / 2 + spW / 2 - 0.06);
      const spon = box(spW, spH, spLen, matNavyHull, 'turretSponson' + side);
      spon.position.set(spX, spY, spZ); ship.add(spon);
      const gusset = box(spW * 0.5, spH * 0.6, spLen * 0.5, matNavyPanel, 'turretGusset' + side);
      gusset.position.set(sd * (wid / 2 - 0.02), spY - spH * 0.3, spZ); ship.add(gusset);
      ship.add(gunTurret('navyTurret' + i, spX, spY + spH / 2 - 0.03, spZ, false, 0.66));
    });
    // launch cells doubled along the spine, recessed nearly flush
    /* Taller cells, and TWO banks along the spine. Each bank's aft/fore edge
       is clamped inside the rib, and the pair is laid out from the rib's own
       length so they never collide with each other. */
    const cellH0 = spineH * 1.7;
    const rowsPer = v.vls.rows * 2;
    const bankD0 = rowsPer * cellD0;
    const usable = spineLen - 0.24;
    const banks = usable >= bankD0 * 3 + 0.4 ? 3 : (usable >= bankD0 * 2 + 0.2 ? 2 : 1);
    const cellY0 = ht + spineH - 0.04;
    for (let k = 0; k < banks; k++) {
      const t = banks > 2 ? 0.18 + k * 0.32 : (banks > 1 ? (k === 0 ? 0.28 : 0.7) : 0.34);
      let cz = spineFrom + 0.12 + usable * t;
      cz = Math.min(spineTo - bankD0 / 2 - 0.06, Math.max(spineFrom + bankD0 / 2 + 0.06, cz));
      const cell = vlsCell(k === 0 ? 'vlsBank' : 'vlsBankAft', v.vls.cols, rowsPer, cellW0, cellD0, cellH0, matNavyPanel);
      cell.position.set(0, cellY0, cz); ship.add(cell);
    }
  } else if (v.vls) {
    /* Raised dorsal deck running most of the hull's length, with the launch
       cell at its AFT end and the turret on bare plate forward of it. */
    /* Spinal reinforcement: longer and as wide as the cell bank it carries,
       so the launch cells sit nearly flush in the deck rather than perched on
       a narrow rib. Cell bank doubled in length along the spine. */
    const bumpFwd = len * 0.42, bumpAft = -len / 2;
    const bumpLen = bumpFwd - bumpAft, bumpZ = (bumpFwd + bumpAft) / 2, bumpH = ht * 0.13;
    /* Cell pitch derived from the rib's available length, so the doubled bank
       always fits inside its host instead of overhanging the stern plate. */
    const rowsTotal = v.vls.rows * 2;
    const cellW = wid * 0.13;
    const cellD = Math.min(len * 0.075, (bumpLen - 0.24) / rowsTotal);
    const bankW = v.vls.cols * cellW, bankD = rowsTotal * cellD;
    /* Rib and cells justified to the same side as the bridge, so the offset
       reads as one deliberate line down the ship rather than a centred spine
       beside a lopsided bow. Clamped so the rib stays inside the hull side. */
    const ribX = narrowTip ? Math.min(tipX, wid / 2 - (bankW + 0.34) / 2 - 0.04) : 0;
    const bump = box(bankW + 0.34, bumpH, bumpLen, matNavyHull, 'dorsalBump');
    bump.position.set(ribX, ht + bumpH / 2 - 0.02, bumpZ); ship.add(bump);
    const nosePiece = slopedBlock('dorsalBumpNose', bankW + 0.34, bumpH, len * 0.22, len * 0.06, len * 0.16, matNavyHull);
    nosePiece.position.set(ribX, ht - 0.02, bumpFwd + len * 0.08); ship.add(nosePiece);
    [-1, 1].forEach(sd => {
      const rail = box(0.06, bumpH * 1.1, bumpLen * 0.97, matNavyPanel, 'dorsalBumpRail' + (sd < 0 ? 'L' : 'R'));
      rail.position.set(ribX + sd * (bankW / 2 + 0.17), ht + bumpH / 2 - 0.02, bumpZ); ship.add(rail);
    });
    for (let i = 0; i < 5; i++) {
      const g = box(0.1, 0.055, 0.13, i % 2 ? matPanel : matEngine, 'bumpGreeble' + i);
      g.position.set(ribX + bankW / 2 - 0.07, ht + bumpH - 0.02, bumpZ + bumpLen * (0.32 - i * 0.16)); ship.add(g);
      const lamp = box(0.07, 0.03, 0.08, matCabinLight, 'bumpLamp' + i);
      lamp.position.set(ribX - bankW / 2 + 0.07, ht + bumpH - 0.02, bumpZ + bumpLen * (0.32 - i * 0.16)); ship.add(lamp);
    }
    // cells recessed into the reinforcement — only the hatch rim stands proud
    /* Recessed: the bank's base sits down inside the reinforcement so only
       the hatch rim stands proud of the deck. */
    const cellH = bumpH * 1.5;
    const cell = vlsCell('vlsBank', v.vls.cols, rowsTotal, cellW, cellD, cellH, matNavyPanel);
    // on the crown of the rib, forward end, clamped inside the rib's span
    const cellZ = Math.max(bumpAft + bankD / 2 + 0.08, bumpFwd - bankD / 2 - 0.06);
    cell.position.set(ribX, ht + bumpH + 0.01, cellZ); ship.add(cell);
    // turrets ride the cheeks of the block aft of the cockpit
    /* Turret sits ON its sponson: a ring 0.62 in scale reaches ~0.14 below its
       own origin, so the plate has to be deep enough and the origin dropped
       onto its top face, or the mount hangs in space. */
    if (v.turrets) [-1, 1].forEach((sd, i) => {
      const spW = 0.34, spH = ht * 0.22, spLen = 0.5, spY = ht * 0.72;
      const spX = sd * (wid / 2 + spW / 2 - 0.06);
      const spon = box(spW, spH, spLen, matNavyHull, 'turretSponson' + (sd < 0 ? 'L' : 'R'));
      spon.position.set(spX, spY, len * 0.2); ship.add(spon);
      const gusset = box(spW * 0.5, spH * 0.6, spLen * 0.5, matNavyPanel, 'turretGusset' + (sd < 0 ? 'L' : 'R'));
      gusset.position.set(sd * (wid / 2 - 0.02), spY - spH * 0.3, len * 0.2); ship.add(gusset);
      ship.add(gunTurret('navyTurret' + i, spX, spY + spH / 2 - 0.03, len * 0.2, false, 0.62));
    });
  }

  /* Faction marking: amidships on the frontmost hull section, stepped forward
     until nothing on the dorsal deck covers it. Placing it by a fixed z and
     the superstructure by another is what buried it under the launch cell. */
  {
    let plateLen = Math.min(0.9, (isCruiser ? sectionLen : len) * 0.24);
    const deckBlockers = [];
    ship.traverse(n => {
      if (!n.isMesh) return;
      if (!/dorsalSpine|dorsalBump|vls|navyTurret|turretRing|turretMount|turretBarrel|lightBar|beacon|canopyFairing/i.test(n.name)) return;
      n.updateWorldMatrix(true, false);
      deckBlockers.push(new T.Box3().setFromObject(n));
    });
    const secLen = isCruiser ? sectionLen : len;
    const z0 = sectionZ[0] - secLen * 0.5, z1 = sectionZ[0] + secLen * 0.5;
    const spans = deckBlockers
      .map(b => [b.min.z - 0.03, b.max.z + 0.03])
      .filter(([a, c]) => c > z0 && a < z1)
      .sort((p, q) => p[0] - q[0]);
    /* Seed with an EMPTY span, not the whole window: seeding it with
       [z0, z1] made the initial "best" wider than any real gap, so the loop
       never updated and the badge landed dead-centre on the superstructure. */
    let cursor = z0, best = null;
    spans.concat([[z1, z1]]).forEach(([a, c]) => {
      if (!best || a - cursor > best[1] - best[0]) best = [cursor, a];
      cursor = Math.max(cursor, c);
    });
    if (!best) best = [z0, z1];
    const gap = Math.max(0.18, best[1] - best[0]);
    const ez = (best[0] + best[1]) / 2;
    plateLen = Math.min(plateLen, gap * 0.86);
    const emblemPlate = box(wid * 0.5, 0.025, plateLen, matNavyPanel, 'factionEmblemPlate');
    emblemPlate.position.set(0, ht + 0.012, ez); ship.add(emblemPlate);
    const emblemField = box(wid * 0.32, 0.03, plateLen * 0.66, matAccent, 'factionEmblemField');
    emblemField.position.set(0, ht + 0.026, ez); ship.add(emblemField);
    const emblemCore = box(wid * 0.13, 0.035, plateLen * 0.28, matNavyHull, 'factionEmblemCore');
    emblemCore.position.set(0, ht + 0.032, ez); ship.add(emblemCore);
  }

  // ---- ventral keel plate and stabiliser (cruiser) ----
  const legLen = ht * 0.48;
  if (isCruiser) {
    /* Keel plate spanning both thin gantry sections, carrying a fin that
       reaches half the landing gear's extension — deep enough to bite the
       airflow, shallow enough to clear the pads on touchdown. */
    const keelFrom = gantryZ[gantryZ.length - 1] - len * 0.06, keelTo = gantryZ[0] + len * 0.06;
    const keelLen = keelTo - keelFrom, keelZ = (keelFrom + keelTo) / 2;
    const keel = box(wid * 0.56, ht * 0.1, keelLen, matNavyPanel, 'ventralKeelPlate');
    keel.position.set(0, ht * 0.05, keelZ); ship.add(keel);
    [-1, 1].forEach(sd => {
      const rib = box(0.06, ht * 0.12, keelLen * 0.9, matEngine, 'keelRib' + (sd < 0 ? 'L' : 'R'));
      rib.position.set(sd * wid * 0.26, ht * 0.06, keelZ); ship.add(rib);
    });
    const finDepth = legLen * 0.5;
    const stab = finPlate('ventralStabilizer', 0.1, finDepth, keelLen * 0.5, keelLen * 0.18, matNavyPanel);
    stab.rotation.x = Math.PI;                 // hangs beneath the keel
    stab.position.set(0, ht * 0.02, keelZ); ship.add(stab);
    const stabCap = box(0.12, 0.05, keelLen * 0.3, matAccent, 'ventralStabilizerCap');
    stabCap.position.set(0, ht * 0.02 - finDepth, keelZ); ship.add(stabCap);
  }

  // ---- drives: main bank, plus a second engine room aft on the cruiser ----
  const sternZ = -len / 2 - (isCruiser ? 0.5 : 0.42);
  /* engRoomFrac narrows the envelope the bank is solved into, grouping the
     drives tightly so the shroud around them stays inboard of the hull sides. */
  mountEngineCluster(ship, 'trapezoidal', v.engX.length + 1, v.engR, isCruiser ? 1.1 : 0.95,
    ht / 2, sternZ, ht * (v.engRoomFracY || 1), -len / 2, wid * (v.engRoomFrac || 1));
  if (isCruiser) {
    const roomLen = 0.5;
    const room = box(wid * 0.66, ht * 0.5, roomLen, matNavyPanel, 'engineRoomBlock');
    room.position.set(0, ht * 0.3, -len / 2 - roomLen / 2 + 0.04); ship.add(room);
    [-1, 1].forEach((sd, i) => {
      const aux = engineNacelle('auxEngine' + i, v.engR * 0.5, 0.55, v.engR * 0.36);
      aux.position.set(sd * wid * 0.24, ht * 0.3, -len / 2 - roomLen - 0.2); ship.add(aux);
      const feed = box(0.07, 0.07, 0.22, matEngine, 'auxFeed' + i);
      feed.position.set(sd * wid * 0.24, ht * 0.3, -len / 2 - roomLen + 0.02); ship.add(feed);
    });
  }
  const shroud = mountEngineShroud(ship, 'navy', matNavyPanel, -len / 2);
  {
    /* Twin fins canted outward, rooted on the dorsal structure. Their spacing
       is SOLVED from the shroud's measured half-width so the tube genuinely
       passes between them, and they sit forward of it in z so they are never
       collinear with it. Spacing them by a fraction of beam only avoided the
       shroud because the fins happened to sit ahead of it. */
    const sb = new T.Box3();
    if (shroud) shroud.traverse(m => { if (m.isMesh) { m.updateWorldMatrix(true, false); sb.union(new T.Box3().setFromObject(m)); } });
    const shroudHalf = sb.isEmpty() ? wid * 0.24 : Math.max(Math.abs(sb.min.x), Math.abs(sb.max.x));
    const finT = 0.1, finChord = len * 0.2;
    const finX = Math.max(wid * 0.3, shroudHalf + finT / 2 + 0.1);
    let finZ = sb.isEmpty() ? -len * 0.3 : sb.max.z + finChord * 0.5 + 0.06;
    /* Take the deck height from whatever structure actually spans the fin's
       station, rather than assuming `ht`: on the segmented cruiser the section
       tops do not sit at `ht`, so a computed height left the fins hovering
       above the deck by a few centimetres. */
    /* Sample the deck at the fin's OWN station. Taking the max over anything
       spanning finZ pulled in the narrow dorsal rib, which sits nowhere near
       the fins in x, so the roots ended up above the actual deck. */
    const sampleX = Math.min(finX, wid / 2 - 0.05);
    let deckY = null;
    ship.traverse(n => {
      if (!n.isMesh || !/^hullMain$|^hullSection\d+$/.test(n.name)) return;
      n.updateWorldMatrix(true, false);
      const bb = new T.Box3().setFromObject(n);
      if (finZ >= bb.min.z && finZ <= bb.max.z && sampleX >= bb.min.x && sampleX <= bb.max.x)
        deckY = deckY === null ? bb.max.y : Math.max(deckY, bb.max.y);
    });
    if (deckY === null) deckY = ht;
    /* Spacing the fins wide enough for the shroud puts them outboard of the
       hull sides, so each needs a sponson bridging deck to fin root — set
       outboard on bare spacing alone they hung off the flanks. */
    const hullHalf = wid / 2;
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'L' : 'R';
      const outreach = Math.max(0, finX + finT / 2 - hullHalf) + 0.06;
      if (outreach > 0.08) {
        const padH = ht * 0.16;
        // top face flush with the deck, so the fin root beds into it
        const pad = box(outreach, padH, finChord * 0.9, matNavyHull, 'stabilizerSponson' + side);
        pad.position.set(sd * (hullHalf + outreach / 2 - 0.02), deckY - padH / 2, finZ); ship.add(pad);
        const knee = box(outreach * 0.6, padH * 0.7, finChord * 0.45, matNavyPanel, 'stabilizerKnee' + side);
        knee.position.set(sd * (hullHalf - 0.03), deckY - padH * 0.8, finZ); ship.add(knee);
      }
      const finTall = ht * 0.58 * (size === 'M' ? 1.13 : 1);
      const tail = finPlate('stabilizerFin' + side, finT, finTall, finChord, finChord * 0.45, matNavyPanel);
      tail.position.set(sd * finX, deckY - 0.05, finZ);
      tail.rotation.z = -sd * 0.22;                  // canted outward at the tip
      ship.add(tail);
      const shoe = box(0.18, ht * 0.05, finChord * 0.85, matNavyPanel, 'stabilizerShoe' + side);
      shoe.position.set(sd * finX, deckY - 0.02, finZ); ship.add(shoe);
    });
  }

  // ---- particle armament ----
  // size 2: heavy cannons above and below the wings, in banks of two
  const heavyStations = v.size2 / 4;
  for (let i = 0; i < heavyStations; i++) {
    const t = heavyStations > 1 ? i / (heavyStations - 1) : 0.5;
    const px = wid / 2 + 0.12 + (v.wingSpan * 0.7 - 0.12) * t;
    [-1, 1].forEach(sd => {
      mountWingStore(ship, sd * px, 0.42, (x, under, z) => {
        const c = particleCannon('particleHeavyLower' + i + (sd < 0 ? 'L' : 'R'), 2, false, matNavyPanel);
        c.position.set(x, under - 0.13, z); return c;
      });
      mountWingStore(ship, sd * px, 0.62, (x, under, z) => {
        const c = particleCannon('particleHeavyUpper' + i + (sd < 0 ? 'L' : 'R'), 2, true, matNavyPanel);
        c.position.set(x, under + 0.23, z); return c;
      });
    });
  }
  /* Size 1: light mounts flanking the COCKPIT BLOCK. On the cruiser these
     used to sit on the hull flanks with the bow block standing directly ahead
     of their muzzles — the line of fire ran into the ship's own nose. Hosting
     them on the nose block itself, measured from its live bounds, gives them
     clear air forward. */
  const lightRows = v.size1 / 2;
  let noseHost = null;
  ship.traverse(n => { if (n.isMesh && n.name === 'hullNose' && !noseHost) noseHost = n; });
  if (noseHost) noseHost.updateWorldMatrix(true, false);
  const nhb = noseHost ? new T.Box3().setFromObject(noseHost) : null;
  for (let i = 0; i < lightRows; i++) {
    if (nhb) {
      const nHalf = nhb.max.x, nLen = nhb.max.z - nhb.min.z;
      const cy = (nhb.min.y + nhb.max.y) / 2;
      const z = nhb.max.z - nLen * (0.26 + i * 0.52);
      [-1, 1].forEach(sd => {
        const cheek = box(0.1, (nhb.max.y - nhb.min.y) * 0.4, 0.26, matNavyPanel, 'cannonCheek' + i + (sd < 0 ? 'L' : 'R'));
        cheek.position.set(sd * (nHalf - 0.01), cy, z); ship.add(cheek);
        const c = particleCannon('particleLight' + i + (sd < 0 ? 'L' : 'R'), 1, false, matNavyPanel);
        c.position.set(sd * (nHalf + 0.06), cy, z + 0.12); ship.add(c);
      });
    } else {
      const span = isCruiser ? sectionLen : len;
      const z = sectionZ[0] + span * 0.42 - i * Math.max(0.9, span * 0.55);
      [-1, 1].forEach(sd => {
        const cheek = box(0.1, ht * 0.16, 0.26, matNavyPanel, 'cannonCheek' + i + (sd < 0 ? 'L' : 'R'));
        cheek.position.set(sd * (wid / 2 - 0.01), ht * 0.72, z); ship.add(cheek);
        const c = particleCannon('particleLight' + i + (sd < 0 ? 'L' : 'R'), 1, false, matNavyPanel);
        c.position.set(sd * (wid / 2 + 0.06), ht * 0.72, z + 0.12); ship.add(c);
      });
    }
  }
  if (isCruiser) {
    /* Sponson extended along the deck edge directly above the forward-most
       cannons, with a launch cell bank recessed into its crown. */
    const spW = 0.36, spH = ht * 0.2, spLen = sectionLen * 0.66;
    const spZ = sectionZ[0] + sectionLen * 0.28, spY = ht * 0.88;
    const cW = 0.1, cD = spLen / 7;
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'L' : 'R';
      const spon = box(spW, spH, spLen, matNavyHull, 'fwdSponson' + side);
      spon.position.set(sd * (wid / 2 + spW / 2 - 0.06), spY, spZ); ship.add(spon);
      const lip = box(spW * 1.05, 0.05, spLen * 0.96, matNavyPanel, 'fwdSponsonLip' + side);
      lip.position.set(sd * (wid / 2 + spW / 2 - 0.06), spY + spH / 2 - 0.02, spZ); ship.add(lip);
      for (let i = 0; i < 3; i++) {
        const g = box(0.07, 0.05, 0.11, i % 2 ? matPanel : matEngine, 'fwdSponsonGreeble' + side + i);
        g.position.set(sd * (wid / 2 + spW - 0.09), spY - spH * 0.1, spZ + spLen * (0.3 - i * 0.28)); ship.add(g);
      }
      const cellH = spH * 0.5;
      const cell = vlsCell('vlsBankFwd' + side, 2, 5, cW, cD, cellH, matNavyPanel);
      cell.position.set(sd * (wid / 2 + spW / 2 - 0.06), spY + spH / 2 - cellH - 0.03, spZ); ship.add(cell);
    });
  }
  /* Underside kit: masts, greebles, hatches and sensor blisters, both paired
     outboard and along the keel. Every candidate is kept clear of the gear
     bays, whose doors swing down and out. */
  {
    const bays = [];
    ship.traverse(n => { if (n.isMesh && /gearBay|gearDoor|gearStrut|gearFoot|gearHinge/i.test(n.name)) {
      n.updateWorldMatrix(true, false); bays.push(new T.Box3().setFromObject(n).expandByScalar(0.12)); } });
    const hulls = [];
    ship.traverse(n => { if (n.isMesh && /^hullMain$|^hullSection\d+$/.test(n.name)) {
      n.updateWorldMatrix(true, false); hulls.push(new T.Box3().setFromObject(n)); } });
    const hb = new T.Box3(); hulls.forEach(h => hb.union(h));
    const free = (x, z, w, d) => !bays.some(b =>
      new T.Box3().setFromCenterAndSize(new T.Vector3(x, hb.min.y, z), new T.Vector3(w, 0.3, d)).intersectsBox(b));
    const span = hb.max.z - hb.min.z;
    let made = 0;
    for (let i = 0; i < 7 && made < 5; i++) {
      const z = hb.min.z + span * (0.12 + i * 0.12);
      const offX = wid * 0.3;
      if (!free(offX, z, 0.2, 0.2)) continue;
      [-1, 1].forEach(sd => {
        const kind = made % 3;
        if (kind === 0) {
          const m = cyl(0.025, 0.025, ht * 0.22, matEngine, 'ventralMast' + made + (sd < 0 ? 'L' : 'R'), 6);
          m.position.set(sd * offX, hb.min.y - ht * 0.11 + 0.04, z); ship.add(m);
        } else if (kind === 1) {
          const g = box(0.14, 0.06, 0.18, matNavyPanel, 'ventralGreeble' + made + (sd < 0 ? 'L' : 'R'));
          g.position.set(sd * offX, hb.min.y + 0.02, z); ship.add(g);
        } else {
          const bl = new T.Mesh(new T.SphereGeometry(0.09, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), matNavyPanel);
          bl.name = 'sensorBlister' + made + (sd < 0 ? 'L' : 'R'); bl.castShadow = true; bl.receiveShadow = true;
          bl.position.set(sd * offX, hb.min.y + 0.01, z); ship.add(bl);
        }
      });
      made++;
    }
    // keel line: alternating hatches and blisters on the centreline
    let kmade = 0;
    for (let i = 0; i < 8 && kmade < 4; i++) {
      const z = hb.min.z + span * (0.16 + i * 0.11);
      if (!free(0, z, 0.26, 0.2)) continue;
      if (kmade % 2 === 0) {
        const h = box(wid * 0.14, 0.04, span * 0.06, matEngine, 'keelHatch' + kmade);
        h.position.set(0, hb.min.y + 0.01, z); ship.add(h);
      } else {
        const bl = new T.Mesh(new T.SphereGeometry(0.1, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), matNavyPanel);
        bl.name = 'keelBlister' + kmade; bl.castShadow = true; bl.receiveShadow = true;
        bl.position.set(0, hb.min.y + 0.01, z); ship.add(bl);
      }
      kmade++;
    }
  }
  /* Wingtips: a white strobe plus a twin rack stacked above and below the
     panel, all seated on the tip's probed surface (it rises with dihedral). */
  [-1, 1].forEach(sd => {
    const tipX = sd * (wid / 2 + v.wingSpan * 0.93);
    mountWingStore(ship, tipX, 0.5, (x, under, z) =>
      missilePod('missileTipLower' + (sd < 0 ? 'Left' : 'Right'), x, under - 0.09, z));
    mountWingStore(ship, tipX, 0.5, (x, under, z) => {
      const pod = missilePod('missileTipUpper' + (sd < 0 ? 'Left' : 'Right'), x, under, z, true);
      pod.position.y = under + 0.16;
      return pod;
    });
    mountWingStore(ship, tipX, 0.82, (x, under, z) => {
      const lamp = box(0.07, 0.06, 0.12, matStrobe, 'wingtipStrobe' + (sd < 0 ? 'L' : 'R'));
      lamp.position.set(x, under + 0.06, z);
      return lamp;
    });
  });
  for (let i = 0; i < v.chin; i++) {
    const fx = v.chin > 1 ? (i - (v.chin - 1) / 2) / (v.chin - 1) * 1.1 : 0;
    mountBellyGun(ship, 'hullNose', fx, 'laserChin' + i, 0.2);
  }

  /* Bow dressing: service greebles and a band of lit and dark ports on the
     forward slab. Positions are MEASURED from that block's live bounds — the
     previous version used fractions of hull width and height, which stopped
     matching the moment the nose was rebuilt as a low wide slab, leaving the
     greebles hanging under the chamfer. */
  {
    let host = null;
    ship.traverse(n => { if (n.isMesh && n.name === 'hullNose' && !host) host = n; });
    if (host) {
      host.updateWorldMatrix(true, false);
      const nb = new T.Box3().setFromObject(host);
      const nHalf = nb.max.x, nTop = nb.max.y, nBot = nb.min.y;
      const nH = nTop - nBot, nZ0 = nb.min.z, nZ1 = nb.max.z, nLen = nZ1 - nZ0;
      const skip = [];
      ship.traverse(n => { if (n.isMesh && /cockpitGlass|cockpitSocket|hullNoseTip|laser/i.test(n.name)) {
        n.updateWorldMatrix(true, false); skip.push(new T.Box3().setFromObject(n).expandByScalar(0.03)); } });
      const clear = bx => !skip.some(k => k.intersectsBox(bx));
      for (let i = 0; i < 4; i++) {
        const z = nZ0 + nLen * (0.18 + i * 0.2);
        [-1, 1].forEach(sd => {
          const wy = nBot + nH * 0.62, gy = nBot + nH * 0.24;
          const wBox = new T.Box3().setFromCenterAndSize(new T.Vector3(sd * nHalf, wy, z), new T.Vector3(0.08, nH * 0.2, nLen * 0.13));
          if (clear(wBox)) {
            const w = box(0.04, nH * 0.2, nLen * 0.13, rand() > 0.4 ? matCabinLight : matCabinDark,
              'bowWindow' + i + (sd < 0 ? 'L' : 'R'));
            w.position.set(sd * (nHalf - 0.005), wy, z); ship.add(w);
          }
          const gBox = new T.Box3().setFromCenterAndSize(new T.Vector3(sd * nHalf, gy, z), new T.Vector3(0.12, nH * 0.16, nLen * 0.1));
          if (clear(gBox)) {
            const g = box(0.07, nH * 0.16, nLen * 0.1, i % 2 ? matPanel : matEngine,
              'bowGreeble' + i + (sd < 0 ? 'L' : 'R'));
            g.position.set(sd * (nHalf - 0.02), gy, z); ship.add(g);
          }
        });
        const cBox = new T.Box3().setFromCenterAndSize(new T.Vector3(nHalf * 0.4, nTop, z), new T.Vector3(nHalf * 0.24, 0.06, nLen * 0.09));
        if (clear(cBox)) {
          const crown = box(nHalf * 0.24, 0.03, nLen * 0.09,
            rand() > 0.5 ? matCabinLight : matCabinDark, 'bowSkylight' + i);
          crown.position.set(nHalf * 0.4, nTop - 0.005, z); ship.add(crown);
        }
      }
      [-1, 1].forEach(sd => {
        const dy = nBot + nH * 0.44, dz = nZ0 + nLen * 0.42;
        const dBox = new T.Box3().setFromCenterAndSize(new T.Vector3(sd * nHalf, dy, dz), new T.Vector3(0.12, nH * 0.2, nLen * 0.5));
        if (clear(dBox)) {
          const duct = box(0.06, nH * 0.2, nLen * 0.5, matEngine, 'bowDuct' + (sd < 0 ? 'L' : 'R'));
          duct.position.set(sd * (nHalf - 0.02), dy, dz); ship.add(duct);
        }
      });
    }
  }

  // ---- gear ----
  const gearZ = isCruiser ? sectionZ : [len * 0.3, -len * 0.3];
  gearZ.forEach((z, i) => {
    [-1, 1].forEach(sd => ship.add(landingLeg('gear' + i + (sd < 0 ? 'Left' : 'Right'),
      sd * (wid / 2 - 0.3), z, legLen, 0.18, 0.06)));
  });

  if (isCruiser) {
    /* Extra service dressing on the two forward modules and along the rib
       between the cell banks, where the deck otherwise reads as bare plate. */
    ['hullMain', 'hullSection1'].forEach(hostName => {
      // painted plates first: run after the greeble pass and the new clutter
      // blocks every candidate slot
      moduleDecals(ship, hostName, (shipId || '') + hostName, 3);
      sprinkleGreebles(ship, hostName, 9, ship.name + hostName + 'extra');
      sprinkleWindows(ship, hostName, 3, (shipId || '') + hostName + 'x', ship.name + hostName + 'x');
    });
    let rib = null, cells = [];
    ship.traverse(n => {
      if (n.isMesh && n.name === 'dorsalSpine' && !rib) rib = n;
      if (n.isMesh && n.name === 'vlsShell') { n.updateWorldMatrix(true, false); cells.push(new T.Box3().setFromObject(n)); }
    });
    if (rib && cells.length > 1) {
      rib.updateWorldMatrix(true, false);
      const rb = new T.Box3().setFromObject(rib);
      cells.sort((a, b) => a.min.z - b.min.z);
      for (let i = 0; i < cells.length - 1; i++) {
        const gapA = cells[i].max.z, gapB = cells[i + 1].min.z;
        if (gapB - gapA < 0.18) continue;
        const cz = (gapA + gapB) / 2, gl = Math.min(gapB - gapA - 0.06, 0.4);
        const plate = box((rb.max.x - rb.min.x) * 0.8, 0.03, gl, matAccent, 'ribDecal' + i);
        plate.position.set(0, rb.max.y - 0.005, cz); ship.add(plate);
        [-1, 1].forEach(sd => {
          const g = box(0.08, 0.05, gl * 0.5, sd < 0 ? matPanel : matEngine, 'ribGreeble' + i + (sd < 0 ? 'L' : 'R'));
          g.position.set(sd * (rb.max.x - 0.06), rb.max.y - 0.01, cz); ship.add(g);
        });
      }
    }
  }
  if (narrowTip) {
    /* Port-side topside fit-out. The bridge, its pod, the rib and the cells
       are left untouched — everything here sits to PORT of the rib, on deck
       the offset bridge leaves free. */
    let ribHost = null, hullTopHost = null;
    ship.traverse(n => {
      if (n.isMesh && /^dorsalBump$/.test(n.name) && !ribHost) ribHost = n;
      if (n.isMesh && /^hullMain$/.test(n.name) && !hullTopHost) hullTopHost = n;
    });
    if (hullTopHost) {
      hullTopHost.updateWorldMatrix(true, false);
      const hb = new T.Box3().setFromObject(hullTopHost);
      let ribMinX = 0;
      if (ribHost) { ribHost.updateWorldMatrix(true, false); ribMinX = new T.Box3().setFromObject(ribHost).min.x; }
      const laneOuter = hb.min.x, laneInner = Math.min(ribMinX - 0.04, laneOuter + 0.1);
      const laneMid = (laneOuter + laneInner) / 2, laneW = Math.abs(laneInner - laneOuter);
      const deckY = hb.max.y, zSpan = hb.max.z - hb.min.z;
      const prand = seedFromId((shipId || '') + 'portDeck');

      // comm mast with stacked dipole rungs
      const mastH = ht * 0.34;
      const mast = cyl(0.03, 0.035, mastH, matEngine, 'commMast', 8);
      mast.position.set(laneMid, deckY + mastH / 2 - 0.02, hb.min.z + zSpan * 0.62); ship.add(mast);
      for (let i = 0; i < 3; i++) {
        const rung = box(laneW * 0.5, 0.03, 0.03, matNavyPanel, 'commDipole' + i);
        rung.position.set(laneMid, deckY + mastH * (0.45 + i * 0.2), hb.min.z + zSpan * 0.62); ship.add(rung);
      }
      const commLamp = box(0.06, 0.05, 0.06, matCabinLight, 'commMastLamp');
      commLamp.position.set(laneMid, deckY + mastH - 0.03, hb.min.z + zSpan * 0.62); ship.add(commLamp);

      // comm relay housing plus whip aerials
      const relay = box(laneW * 0.72, ht * 0.1, zSpan * 0.1, matNavyHull, 'commRelayHousing');
      relay.position.set(laneMid, deckY + ht * 0.05 - 0.02, hb.min.z + zSpan * 0.46); ship.add(relay);
      [-1, 1].forEach(sd => {
        const whip = cyl(0.014, 0.014, ht * 0.2, matEngine, 'commWhip' + (sd < 0 ? 'A' : 'B'), 6);
        whip.position.set(laneMid + sd * laneW * 0.24, deckY + ht * 0.16, hb.min.z + zSpan * 0.46); ship.add(whip);
      });

      // one turret mount amidships in the port lane
      const tz = (hb.min.z + hb.max.z) / 2;
      const spH = ht * 0.14;
      const spon = box(laneW * 0.86, spH, zSpan * 0.12, matNavyHull, 'portGunPlatform');
      spon.position.set(laneMid, deckY + spH / 2 - 0.02, tz); ship.add(spon);
      ship.add(gunTurret('portTurret0', laneMid, deckY + spH - 0.03, tz, false, 0.58));

      // service greebles and painted plates down the lane
      for (let i = 0; i < 4; i++) {
        const z = hb.min.z + zSpan * (0.2 + i * 0.16);
        if (Math.abs(z - tz) < zSpan * 0.09) continue;
        const g = box(laneW * (0.3 + prand() * 0.2), 0.05 + prand() * 0.04, zSpan * 0.05, i % 2 ? matPanel : matEngine, 'portDeckGreeble' + i);
        g.position.set(laneMid + (prand() - 0.5) * laneW * 0.2, deckY + 0.02, z); ship.add(g);
        const dc = box(laneW * 0.44, 0.025, zSpan * 0.045, i % 2 ? matAccent : matNavyPanel, 'portDeckDecal' + i);
        dc.position.set(laneMid, deckY + 0.012, z + zSpan * 0.07); ship.add(dc);
      }

    }
  }
  if (size === 'S') {
    /* Longitudinal rib down the NON-BRIDGE flank only, running from the flat
       nose face aft and stopping short of the stabilisers. Bevelled at both
       ends with wedge caps rather than cut square. */
    let noseRef = null, deckRef = null;
    const finFwd = [];
    ship.traverse(n => {
      if (n.isMesh && n.name === 'hullNose' && !noseRef) noseRef = n;
      if (n.isMesh && n.name === 'hullMain' && !deckRef) deckRef = n;
      if (n.isMesh && /^stabilizerFin/.test(n.name)) { n.updateWorldMatrix(true, false); finFwd.push(new T.Box3().setFromObject(n).max.z); }
    });
    if (noseRef && deckRef) {
      noseRef.updateWorldMatrix(true, false); deckRef.updateWorldMatrix(true, false);
      const nbR = new T.Box3().setFromObject(noseRef), dbR = new T.Box3().setFromObject(deckRef);
      const zFore = nbR.max.z;
      const zAft = (finFwd.length ? Math.max(...finFwd) : dbR.min.z + (dbR.max.z - dbR.min.z) * 0.2) + 0.12;
      const bevel = Math.min(0.34, (zFore - zAft) * 0.18);
      const midLen = (zFore - zAft) - bevel * 2;
      if (midLen > 0.1) {
        const ribW = 0.16, ribH = ht * 0.13;
        /* x must lie within BOTH the nose and the main hull, or the forward
           cap ends up outboard of the narrower nose with nothing behind it. */
        const flankX = Math.min(dbR.max.x, nbR.max.x);
        const ribX = -(flankX - ribW / 2 + 0.01);         // port flank, bridge side untouched
        const ribY = dbR.max.y - ribH * 0.35;
        const midZ = zAft + bevel + midLen / 2;
        const rib = box(ribW, ribH, midLen, matNavyHull, 'portSideRib');
        rib.position.set(ribX, ribY, midZ); ship.add(rib);
        // wedge caps: forward one tapers toward the nose, aft one toward the tail
        const capF = slopedBlock('portSideRibCapFwd', ribW, ribH, bevel, bevel * 0.25, bevel * 0.8, matNavyHull);
        capF.position.set(ribX, ribY - ribH / 2, zFore - bevel / 2 - bevel / 2); ship.add(capF);
        const capA = slopedBlock('portSideRibCapAft', ribW, ribH, bevel, bevel * 0.25, bevel * 0.8, matNavyHull);
        capA.rotation.y = Math.PI;
        capA.position.set(ribX, ribY - ribH / 2, zAft + bevel / 2); ship.add(capA);
        const ribStrake = box(ribW * 0.5, 0.04, midLen * 0.96, matNavyPanel, 'portSideRibStrake');
        ribStrake.position.set(ribX, ribY + ribH / 2 - 0.01, midZ); ship.add(ribStrake);
      }
    }
  }
  if (size === 'M') {
    /* Fit-out on the flank OPPOSITE the launch cells, plus lit ports around
       the stepped nose. Clock references are as seen from above with the nose
       at 12: the short half of the nose extension faces 12, and the block
       behind it takes its ports at 3 o'clock. */
    let noseRef = null, extRef = null, mainRef = null, ribRef = null;
    ship.traverse(n => {
      if (n.isMesh && n.name === 'hullNose' && !noseRef) noseRef = n;
      if (n.isMesh && n.name === 'hullNoseStarboardExt' && !extRef) extRef = n;
      if (n.isMesh && n.name === 'hullMain' && !mainRef) mainRef = n;
      if (n.isMesh && n.name === 'dorsalBump' && !ribRef) ribRef = n;
    });
    const bx = m => { m.updateWorldMatrix(true, false); return new T.Box3().setFromObject(m); };

    // lit ports across the FRONT face of the short (port) half of the nose
    if (noseRef && extRef) {
      const nb = bx(noseRef), eb = bx(extRef);
      const shortHalfMinX = nb.min.x, shortHalfMaxX = eb.min.x;
      const faceZ = nb.max.z;
      const cy = (nb.min.y + nb.max.y) / 2;
      for (let i = 0; i < 3; i++) {
        const x = shortHalfMinX + (shortHalfMaxX - shortHalfMinX) * (0.24 + i * 0.26);
        const w = box(0.1, (nb.max.y - nb.min.y) * 0.2, 0.04,
          i === 1 ? matCabinDark : matCabinLight, 'noseFaceWindow' + i);
        w.position.set(x, cy, faceZ - 0.015); ship.add(w);
      }
      // and along the port flank immediately behind that face
      for (let i = 0; i < 3; i++) {
        const z = faceZ - 0.12 - i * 0.18;
        const w = box(0.04, (nb.max.y - nb.min.y) * 0.18, 0.13,
          i === 0 ? matCabinLight : (i === 1 ? matCabinDark : matCabinLight), 'noseFlankWindow' + i);
        w.position.set(nb.min.x + 0.015, cy, z); ship.add(w);
      }
    }
    // 3 o'clock ports on the block behind the nose: starboard flank of hullMain
    if (mainRef) {
      const mb = bx(mainRef);
      const cy = mb.min.y + (mb.max.y - mb.min.y) * 0.62;
      for (let i = 0; i < 3; i++) {
        const z = mb.max.z - (mb.max.z - mb.min.z) * (0.1 + i * 0.1);
        const w = box(0.04, (mb.max.y - mb.min.y) * 0.1, 0.16,
          i === 1 ? matCabinDark : matCabinLight, 'threeOclockWindow' + i);
        w.position.set(mb.max.x - 0.015, cy, z); ship.add(w);
      }
      // service clutter on the flank opposite the cells (port side)
      const prand = seedFromId((shipId || '') + 'oppFlank');
      for (let i = 0; i < 5; i++) {
        const z = mb.max.z - (mb.max.z - mb.min.z) * (0.14 + i * 0.15);
        const g = box(0.09, 0.07 + prand() * 0.05, 0.15, i % 2 ? matPanel : matEngine, 'oppFlankGreeble' + i);
        g.position.set(mb.min.x + 0.03, mb.min.y + (mb.max.y - mb.min.y) * (0.35 + prand() * 0.3), z);
        ship.add(g);
      }
      const conduit = box(0.05, 0.05, (mb.max.z - mb.min.z) * 0.5, matEngine, 'oppFlankConduit');
      conduit.position.set(mb.min.x + 0.02, mb.min.y + (mb.max.y - mb.min.y) * 0.5, mb.max.z - (mb.max.z - mb.min.z) * 0.4);
      ship.add(conduit);
    }
    // propellant bottles and feed pipes running alongside the launch rail
    if (ribRef) {
      const rb = bx(ribRef);
      const rz = rb.max.z - rb.min.z;
      [-1, 1].forEach(sd => {
        const side = sd < 0 ? 'L' : 'R';
        const px = sd < 0 ? rb.min.x - 0.06 : rb.max.x + 0.06;
        const pipe = cyl(0.035, 0.035, rz * 0.7, matEngine, 'railFeedPipe' + side, 8);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(px, rb.max.y - 0.03, rb.min.z + rz * 0.45); ship.add(pipe);
        for (let i = 0; i < 2; i++) {
          const bot = cyl(0.055, 0.055, rz * 0.14, matPanel, 'railBottle' + side + i, 8);
          bot.rotation.x = Math.PI / 2;
          bot.position.set(px, rb.max.y - 0.04, rb.min.z + rz * (0.2 + i * 0.42)); ship.add(bot);
          const clamp = box(0.07, 0.04, 0.03, matNavyPanel, 'railBottleClamp' + side + i);
          clamp.position.set(px, rb.max.y - 0.04, rb.min.z + rz * (0.2 + i * 0.42)); ship.add(clamp);
        }
      });
    }
  }
  // dish beside the cockpit on every mark, hinged and gear-driven
  mountCommDish(ship, 'hullNose', ht, isCruiser ? 0.5 : 0.34);
  mountCockpitInterior(ship);
  detailCompartments(ship, shipId);
  mountNavLights(ship, 1, isCruiser ? 0.42 : 0.5);
  return finalize(ship);
}

export const SHIP_TYPES = {
  trader: { label: 'Trader', build: buildTrader, prefix: 'SS-', digits: 5 },
  freighter: { label: 'Freighter', build: buildFreighter, prefix: 'FH-', digits: 5 },
  police: { label: 'Police', build: buildPolice, prefix: 'POL-', digits: 4 },
  shuttle: { label: 'Shuttle', build: buildShuttle, prefix: 'SS-', digits: 5 },
  capital: { label: 'Capital', build: buildCapital, prefix: 'SH-', digits: 5 },
  courier: { label: 'Courier', build: buildCourier, prefix: 'CR-', digits: 5 },
  fighter: { label: 'Fighter', build: buildFighter, prefix: 'FT-', digits: 4 },
  tug: { label: 'Tug', build: buildTug, prefix: 'TG-', digits: 4 },
  liner: { label: 'Liner', build: buildLiner, prefix: 'PL-', digits: 5 },
  hydrogen: { label: 'H2 Freighter', build: buildHydrogenFreighter, prefix: 'HF-', digits: 5 },
  pod: { label: 'Escape Pod', build: buildEscapePod, prefix: 'EP-', digits: 4 },
  support: { label: 'Tender', build: buildSupport, prefix: 'RS-', digits: 4 },
  navy: { label: 'Navy', build: buildNavy, prefix: 'NV-', digits: 4 }
};

export function randomId(type) {
  const t = SHIP_TYPES[type];
  const n = Array.from({ length: t.digits }, () => Math.floor(Math.random() * 10)).join('');
  return t.prefix + n;
}
