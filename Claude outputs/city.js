/* Surface city ports — planetside, atmospheric.
 *
 * A city port is the opposite problem to an orbital station: there is gravity,
 * there is weather, and a hull arrives on a wheel or a skid along a strip
 * rather than being threaded through an aperture. So nothing here is a berth.
 * The parts are a landing strip, a parking apron of painted stands, a control
 * tower, agricultural domes, and a block of city buildings.
 *
 * The domes are the reason this file exists. They are geodesic frames with
 * glazing that has to READ as glass without being real glass: the panels are
 * drawn with depthWrite off so whatever is planted inside always composites
 * through them, and a scattered subset of panels is opaque and pale, which is
 * what actually sells it — a real greenhouse is mostly sky reflection with a
 * few clear panels, not a uniform tint.
 *
 * Palette, helpers and the fleet envelope come from station.js so the two
 * halves of the project cannot drift apart. */

import { KIT } from './station.js';

const { T, box, cyl, seedFrom, cautionRun, billboard, interiorLamp, BERTH, toothedDoor } = KIT;
const { matHull, matPanel, matDeep, matAccent, matHazardY, matHazardK, matGlass,
  matLit, matDark, matBeacon, matAdA, matAdB, matNavGreen, matNavRed,
  matEngine } = KIT;

/* ---- planetside additions to the palette ----
 * Everything structural still comes from the station palette above; these are
 * only the things a surface port has that orbit does not — soil, leaf, fruit,
 * tarmac, and the two glazing materials. */
const matGlaze = new T.MeshStandardMaterial({
  color: 0xa8dcea, emissive: 0x8fd0e4, emissiveIntensity: 0.12,
  roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.17,
  depthWrite: false, side: T.DoubleSide, name: 'domeGlaze'
});
/* The panels that make it read as glass. Opaque enough to catch the light,
 * still non-writing so a fruit behind one is never punched out. */
/* Sky-catch panels. At 0.62 opacity over a third of the crown these WERE the
 * dome — a ray from a normal camera to the floor hit a glare panel first, so
 * the planting was behind frosted glass. The trick is right, the dose was
 * wrong: keep them sparse and barely there. */
const matGlare = new T.MeshStandardMaterial({
  color: 0xd6ecf4, emissive: 0xcfe6f2, emissiveIntensity: 0.28,
  roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.3,
  depthWrite: false, side: T.DoubleSide, name: 'domeGlare'
});
const matFrame = new T.MeshStandardMaterial({ color: 0x6f7885, roughness: 0.6, metalness: 0.4, name: 'domeFrame' });
const matConcrete = new T.MeshStandardMaterial({ color: 0x7d8189, roughness: 0.92, metalness: 0.04, name: 'portConcrete' });
const matTarmac = new T.MeshStandardMaterial({ color: 0x33373d, roughness: 0.95, metalness: 0.03, name: 'portTarmac' });
const matPaint = new T.MeshStandardMaterial({ color: 0xe4e7ea, roughness: 0.7, name: 'portPaint' });
const matSoil = new T.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.96, name: 'agriSoil' });
const matTrunk = new T.MeshStandardMaterial({ color: 0x5b4433, roughness: 0.88, name: 'agriTrunk' });
const matLeafA = new T.MeshStandardMaterial({ color: 0x3c6b39, roughness: 0.82, name: 'agriLeafA' });
const matLeafB = new T.MeshStandardMaterial({ color: 0x51864a, roughness: 0.82, name: 'agriLeafB' });
const matCrop = new T.MeshStandardMaterial({ color: 0x6f9a44, roughness: 0.85, name: 'agriCrop' });
const matFruitA = new T.MeshStandardMaterial({ color: 0xc4432c, roughness: 0.55, name: 'agriFruitRed' });
const matFruitB = new T.MeshStandardMaterial({ color: 0xd88a24, roughness: 0.55, name: 'agriFruitAmber' });
/* Grapes. Dark enough to read as fruit against matLeafB rather than as more
   foliage — a mid purple sat at almost the same value as the leaf and the
   clusters vanished into the vine from any distance. */
const matGrape = new T.MeshStandardMaterial({ color: 0x4a2a5e, roughness: 0.5, name: 'agriGrapePurple' });
const matGrow = new T.MeshStandardMaterial({
  color: 0xf6d9b0, emissive: 0xf3c98e, emissiveIntensity: 1.3, roughness: 0.6, name: 'agriGrowLight'
});

const vkey = v => v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3);

/* One mesh from a list of triangles. The dome's glazing is ~45 faces; as
 * individual meshes that is 45 draw calls and 45 nodes in the export, so they
 * are concatenated into a single non-indexed buffer instead. */
function mergedTris(tris, mat, name) {
  const arr = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => {
    const [a, b, c] = t;
    arr.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], i * 9);
  });
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(arr, 3));
  g.computeVertexNormals();
  const m = new T.Mesh(g, mat);
  m.name = name; m.castShadow = false; m.receiveShadow = false;
  return m;
}

/* A strut between two points, as a thin box rather than a cylinder: 12
 * triangles instead of 30-odd, and flat faces match the fleet's language
 * better than a tube would. */
function strut(a, b, thick, mat, name) {
  const dir = new T.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = box(thick, thick, len, mat, name);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir.normalize());
  return m;
}

/* ---- the dome ----
 * An icosahedron subdivided once (80 faces), cut to its upper half. The cut
 * leaves a ragged fringe, because an icosahedron has no equator — so the frame
 * lands on a concrete stem wall tall enough to swallow the deepest vertex.
 * That is also how a real dome is built, and it derives the wall's height from
 * the geometry rather than a tuned number (house rule 6).
 *
 * Facet detail stays at 1 for every size. Bigger domes get a bigger radius,
 * not more facets — raising it here would put these out of step with the
 * 8- and 12-facet parts on the ships and stations. */
function geodesicDome(radius, tag, rand) {
  const grp = new T.Group(); grp.name = tag;
  const ico = new T.IcosahedronGeometry(radius, 1);
  const pos = ico.getAttribute('position');

  const tris = [];
  for (let i = 0; i < pos.count; i += 3) {
    const a = new T.Vector3().fromBufferAttribute(pos, i);
    const b = new T.Vector3().fromBufferAttribute(pos, i + 1);
    const c = new T.Vector3().fromBufferAttribute(pos, i + 2);
    if ((a.y + b.y + c.y) / 3 < 0) continue;
    tris.push([a, b, c]);
  }

  /* How far the kept fringe hangs below the sphere's equator sets the wall. */
  let dip = 0;
  tris.forEach(t => t.forEach(v => { if (v.y < dip) dip = v.y; }));
  const wallH = -dip + radius * 0.06;
  const frame = new T.Group(); frame.name = tag + 'Frame';
  frame.position.y = wallH;
  grp.add(frame);

  /* Glazing, split into ordinary panels and the scattered bright ones. */
  const clear = [], glare = [];
  tris.forEach((t, i) => ((rand() < 0.07 || i % 17 === 0) ? glare : clear).push(t));
  frame.add(mergedTris(clear, matGlaze, tag + 'Glazing'));
  if (glare.length) frame.add(mergedTris(glare, matGlare, tag + 'GlazingGlare'));

  /* Struts on every unique edge, hubs at every unique vertex. */
  const thick = Math.max(0.16, radius * 0.022);
  const edges = new Map(), nodes = new Map();
  tris.forEach(([a, b, c]) => {
    [[a, b], [b, c], [c, a]].forEach(([p, q]) => {
      const k = [vkey(p), vkey(q)].sort().join('|');
      if (!edges.has(k)) edges.set(k, [p, q]);
    });
    [a, b, c].forEach(v => { if (!nodes.has(vkey(v))) nodes.set(vkey(v), v); });
  });
  let n = 0;
  edges.forEach(([p, q]) => frame.add(strut(p, q, thick, matFrame, tag + 'Strut' + (n++))));
  /* No node plates. Struts already cross at every vertex, so a hub there is
   * hidden behind the very geometry it was meant to articulate — 28 meshes a
   * dome for nothing visible. The vertices stay in userData for anything that
   * needs to mount to a node later. */
  grp.userData.nodes = [...nodes.values()].map(v => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) }));

  /* Stem wall, base ring beam and a skirt of service panels. */
  const wall = cyl(radius * 0.999, radius * 1.02, wallH, matConcrete, tag + 'StemWall', 20, true);
  wall.position.y = wallH / 2; grp.add(wall);
  /* openEnded, so this is a BAND and not a plate. Omitting the argument gave a
     capped disc of radius 17.6 sitting at head height across an interior of
     radius 14.6 — from any downward view it was the dome's apparent floor, and
     the soil, all 52 shrub patches, the beds and the trellises were behind it
     with only the tree tops poking through. Third time in this project a
     capped primitive has ended up across a sightline or an opening;
     checkDomeSightline in city-tests.js now asserts against it. */
  const beam = cyl(radius * 1.035, radius * 1.035, radius * 0.05, matPanel, tag + 'RingBeam', 20, true);
  beam.position.y = wallH; grp.add(beam);
  const kerb = cyl(radius * 1.1, radius * 1.16, radius * 0.045, matConcrete, tag + 'Kerb', 20);
  kerb.position.y = radius * 0.022; grp.add(kerb);

  /* Airlock porch — the way in, on the strip-facing side. */
  const porchW = BERTH.sm.w * 0.55, porchH = wallH * 0.82;
  const porch = box(porchW, porchH, radius * 0.16, matHull, tag + 'Porch');
  porch.position.set(0, porchH / 2, radius * 1.02); grp.add(porch);
  /* The porch door. It was a flat plate of matDeep — the only aperture in the
     whole project with no mechanism behind it and no poses on it, so a dome
     that reads as a pressurised habitat had a painted rectangle for a way in.
     It is the same toothed door every other aperture uses now: two telescopic
     leaves a side, teeth combing on the centreline, the housing standing proud
     as the drive's cover plate. Scaled to a PERSONNEL opening rather than a
     hull one, which is why the housing is shallow.

     kind 'personnel', so "open the bays" never cycles a dome's front door. */
  const doorH = porchH * 0.7;
  const doorW = porchW * 0.62;
  const porchDoor = new T.Group();
  porchDoor.name = tag + 'PorchDoor';
  porchDoor.position.set(0, doorH / 2, radius * 1.02 + radius * 0.08 + 0.07);
  toothedDoor(porchDoor, doorW, doorH, tag + 'Porch', {
    axis: 'y', kind: 'personnel', housing: 0.42
  });
  grp.add(porchDoor);
  cautionRun(grp, porchW, 0.1, 'x', tag + 'PorchCaution');
  const lamp = box(0.3, 0.14, 0.14, matLit, tag + 'PorchLamp');
  lamp.position.set(0, doorH + 0.3, radius * 1.02 + radius * 0.08 + 0.07); grp.add(lamp);

  /* Plant room and service clutter against the wall, so the dome reads as
   * something that needs pumps and heat rather than a decoration. */
  const plantW = radius * 0.3;
  const plant = box(plantW, wallH * 0.9, radius * 0.22, matPanel, tag + 'PlantRoom');
  plant.position.set(-radius * 0.72, wallH * 0.45, radius * 0.62); grp.add(plant);
  for (let i = 0; i < 4; i++) {
    const t = cyl(0.28, 0.28, wallH * 0.75, matEngine, tag + 'Tank' + i, 8);
    t.position.set(-radius * 0.72 + (i - 1.5) * 0.72, wallH * 0.38, radius * 0.62 + radius * 0.14);
    grp.add(t);
  }
  const mast = cyl(0.09, 0.13, radius * 0.5, matEngine, tag + 'Mast', 6);
  mast.position.set(radius * 0.74, radius * 0.25, -radius * 0.66); grp.add(mast);
  const beacon = box(0.22, 0.22, 0.22, matBeacon, tag + 'Beacon');
  beacon.position.set(radius * 0.74, radius * 0.5, -radius * 0.66); grp.add(beacon);

  grp.userData.wallH = wallH;
  grp.userData.interiorRadius = radius * 0.86;
  grp.userData.floorY = radius * 0.02 + wallH * 0.02;
  grp.userData.crownY = wallH + radius;
  return grp;
}

/* A tree: tapered six-sided tiers on a trunk, with fruit hung on the lowest
 * tier's shoulder where it would actually catch light. */
/* A WINDBREAK tree — the one thing in a dome that is supposed to be conical.
 *
 * The old fruit trees were two tapered cylinders stacked narrow-end-up, which
 * is why they read as Christmas trees. That silhouette was not wrong, it was
 * on the wrong plant: a windbreak IS a narrow upright conifer or poplar, and a
 * row of them along the inside of the stem wall is what a real vineyard puts
 * there to take the wind off the fruit.
 *
 * These exist for a second reason too. A vineyard is chest high and cannot
 * clear a 6m stem wall, so with the vines alone a dome read from outside at
 * eye level as glazing over bare concrete. The windbreak is the planting that
 * shows above the wall — which is what the old height rule was really asking
 * for, now asked of the plant that can actually satisfy it.
 */
function windbreak(h, tag) {
  const g = new T.Group(); g.name = tag;
  const trunkH = h * 0.14;
  const trunk = cyl(h * 0.028, h * 0.04, trunkH, matTrunk, tag + 'Trunk', 5);
  trunk.position.y = trunkH / 2; g.add(trunk);
  /* Columnar: narrow relative to height, two tiers so the outline is not a
     single unbroken cone. Five-sided, because a dome wants a row of them more
     than it wants one good one. */
  const crown = h - trunkH;
  [0, 1].forEach(i => {
    const tierH = crown * (i ? 0.52 : 0.62);
    const rb = h * (i ? 0.075 : 0.105);
    const t = cyl(rb * 0.3, rb, tierH, i ? matLeafB : matLeafA, tag + 'Spire' + i, 5);
    t.position.y = trunkH + (i ? crown * 0.48 : 0) + tierH / 2;
    g.add(t);
  });
  return g;
}

/* A planting bed: raised kerb, soil, rows of crop blocks, and an irrigation
 * spur. Beds are what makes a dome read as production rather than parkland. */
function cropBed(len, wide, rand, tag) {
  const g = new T.Group(); g.name = tag;
  const kerbH = 0.34;
  const kerb = box(wide, kerbH, len, matConcrete, tag + 'Kerb');
  kerb.position.y = kerbH / 2; g.add(kerb);
  const soil = box(wide * 0.88, 0.1, len * 0.96, matSoil, tag + 'Soil');
  soil.position.y = kerbH - 0.02; g.add(soil);

  const rows = 2;
  const cols = Math.min(6, Math.max(3, Math.round(len / 1.4)));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hgt = 0.34 + rand() * 0.3;
      const b = box(0.3, hgt, 0.3, matCrop, tag + 'Crop' + r + '_' + c);
      b.position.set((r - (rows - 1) / 2) * (wide * 0.8 / rows),
        kerbH + hgt / 2 - 0.04,
        (c - (cols - 1) / 2) * (len * 0.9 / cols));
      g.add(b);
    }
  }
  const pipe = cyl(0.07, 0.07, len * 0.98, matEngine, tag + 'Irrigation', 6);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(wide / 2 + 0.12, kerbH + 0.36, 0); g.add(pipe);
  for (let i = 0; i < cols; i += 2) {
    const head = box(0.08, 0.16, 0.08, matPanel, tag + 'Sprinkler' + i);
    head.position.set(wide / 2 + 0.12, kerbH + 0.5, (i - (cols - 1) / 2) * (len * 0.9 / cols));
    g.add(head);
  }
  return g;
}

/* Trellised vines: the other place fruit shows, at eye level and in rows, so
 * the dome has crop at three heights — bed, trellis, canopy. */
function trellis(len, rand, tag) {
  const g = new T.Group(); g.name = tag;
  const postH = 2.2, n = Math.max(3, Math.round(len / 2.2));
  for (let i = 0; i < n; i++) {
    const p = box(0.12, postH, 0.12, matEngine, tag + 'Post' + i);
    p.position.set(0, postH / 2, (i - (n - 1) / 2) * (len / (n - 1)));
    g.add(p);
  }
  [0.55, 0.85].forEach((f, k) => {
    const w = cyl(0.04, 0.04, len, matPanel, tag + 'Wire' + k, 4);
    w.rotation.x = Math.PI / 2;
    w.position.y = postH * f; g.add(w);
  });
  for (let i = 0; i < n * 2; i++) {
    const z = (rand() - 0.5) * len;
    const foliage = box(0.5 + rand() * 0.3, 0.7, 0.42, matLeafB, tag + 'Vine' + i);
    foliage.position.set((rand() - 0.5) * 0.2, postH * (0.5 + rand() * 0.35), z);
    g.add(foliage);
    if (rand() < 0.55) {
      const f = new T.Mesh(new T.IcosahedronGeometry(0.13, 0), matGrape);
      f.name = tag + 'Grape' + i;
      f.position.set(foliage.position.x + 0.22, foliage.position.y - 0.4, z);
      g.add(f);
    }
  }
  return g;
}

/* Dress a dome's interior. Every dome gets trees, beds AND trellis regardless
 * of its nominal kind, so a single-dome port still shows all three; kind only
 * shifts the mix and decides whether buildings stand inside. */
function plantDome(dome, kind, rand, tag) {
  const R = dome.userData.interiorRadius;
  const floorY = dome.userData.floorY;
  const floor = cyl(R * 1.12, R * 1.12, 0.14, matConcrete, tag + 'Floor', 20);
  floor.position.y = floorY + 0.07; dome.add(floor);
  /* SOIL over almost all of it. Scattered patches on a concrete slab read as
     objects standing on a floor however many you add — the ground itself has
     to be planted. One cylinder, and it changes the whole dome from a grey
     disc to cultivated land with paths across it. */
  const soil = cyl(R * 1.12, R * 1.12, 0.12, matSoil, tag + 'Ground', 20);
  soil.position.y = floorY + 0.17; dome.add(soil);

  const inner = new T.Group(); inner.name = tag + 'Planting';
  inner.position.y = floorY + 0.24; dome.add(inner);

  /* A path across the middle, so the planting reads as tended. */
  /* A service path, not an avenue. At half the interior radius wide and in
     near-white paint this was a bright strip across the whole dome and most of
     what you saw looking down — it read as the floor rather than as a path
     through planting. */
  const path = box(R * 0.22, 0.06, R * 2, matConcrete, tag + 'Path');
  path.position.y = 0.03; inner.add(path);

  if (kind === 'habitat') {
    /* Buildings inside the dome — low blocks, not towers: the crown is glass
     * and a tower would foul it. Height is capped off the dome's own crown. */
    const cap = (dome.userData.crownY - floorY) * 0.42;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const hh = cap * (0.7 + rand() * 0.3);
      const b = box(R * 0.3, hh, R * 0.26, i % 2 ? matPanel : matHull, tag + 'Block' + i);
      b.position.set(Math.cos(a) * R * 0.42, hh / 2, Math.sin(a) * R * 0.42);
      b.rotation.y = -a; inner.add(b);
      for (let k = 0; k < 5; k++) {
        const p = box(0.3, 0.34, 0.06, rand() < 0.55 ? matLit : matDark, tag + 'Block' + i + 'Port' + k);
        p.position.set(b.position.x + Math.cos(a) * (R * 0.13 + 0.03),
          hh * (0.3 + k * 0.13), b.position.z + Math.sin(a) * (R * 0.13 + 0.03));
        p.rotation.y = -a; inner.add(p);
      }
    }
  }

  /* Tree height is a FRACTION OF THE DOME, not a fixed range. At 2.6-4.8 in a
     dome nearly 20 tall the planting read as specks on a floor — the trees have
     to be a real part of the volume for the dome to look grown rather than
     decorated. */
  /* Trees have to CLEAR THE STEM WALL or they are hidden behind concrete from
     any eye-level view — most of them were shorter than it. Height starts from
     the wall, not from the interior radius. */
  const wallH = dome.userData.wallH || R * 0.4;
  /* A VINEYARD, in rows.
     The domes grew conifers before — two tapered cylinders stacked narrow-end
     up, which is a spruce, so every "orchard" was a stand of Christmas trees
     with apples hung on them. Rows are what actually say vineyard: a ring of
     individual plants reads as parkland however the plant is shaped, and it is
     the RANK — parallel, evenly spaced, running the length of the floor — that
     the eye recognises from above and through the glazing.

     Rows run along Z and step across X, each one clipped to the chord the dome
     gives it at that offset, with the central corridor left clear exactly as
     the tree ring left it. */
  const nRows = kind === 'orchard' ? 10 : kind === 'habitat' ? 6 : 8;
  const inset = R * 0.9;                       // keep the ends off the stem wall
  for (let i = 0; i < nRows; i++) {
    const sd = i % 2 ? 1 : -1;
    const step = R * (0.30 + Math.floor(i / 2) * (0.56 / Math.max(1, nRows / 2 - 1)));
    const x = sd * step;
    if (Math.abs(x) < R * 0.24 || Math.abs(x) > inset * 0.96) continue;   // path clear, ends inboard
    const half = Math.sqrt(Math.max(0, inset * inset - x * x));
    if (half < R * 0.18) continue;             // too short a chord to read as a row
    const row = trellis(half * 2, rand, tag + 'VineRow' + i);
    row.position.set(x, 0, 0);
    inner.add(row);
  }
  /* A ring of windbreak trees just inside the stem wall. Bearing is the index
     plus jitter rather than pure chance — the trees this replaces used the
     same rule, because a dozen random bearings clump and leave half the
     perimeter bare. Height is measured from the WALL, not the radius: the
     whole point of them is to stand above it. */
  const nWind = kind === 'habitat' ? 10 : 14;
  for (let i = 0; i < nWind; i++) {
    const a = (i / nWind) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const rr = R * (0.9 + rand() * 0.05);
    const wx = Math.cos(a) * rr, wz = Math.sin(a) * rr;
    const wt = windbreak(wallH * 1.35 + rand() * R * 0.12, tag + 'Windbreak' + i);
    wt.position.set(wx, 0, wz);
    inner.add(wt);
  }
  /* GROUND COVER, and enough of it to matter. The floor was 96% bare concrete:
     22 shrubs under 1.5 across, on a disc of radius 16, covered 4% of it. What
     you saw looking down through the crown was the slab. Cover is now broad
     low patches — a box each, so 40 of them cost 480 triangles — sized as a
     fraction of the floor rather than in absolute metres. */
  const beds2 = [];
  const nCover = 52;
  for (let i = 0; i < nCover; i++) {
    const a = (i / nCover) * Math.PI * 2 * 3 + (rand() - 0.5) * 0.7;
    const rr = R * (0.16 + ((i * 7) % 11) / 11 * 0.78);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (Math.abs(x) < R * 0.22) continue;
    const sw = R * (0.14 + rand() * 0.18), sd2 = R * (0.12 + rand() * 0.18);
    const sh = 0.35 + rand() * 0.8;
    const patch = box(sw, sh, sd2, rand() < 0.45 ? matLeafA : matCrop, tag + 'Shrub' + i);
    patch.position.set(x, sh / 2, z); patch.rotation.y = rand() * 0.6; inner.add(patch);
    beds2.push([x, z]);
    /* a few taller stems out of each patch, so cover is not a flat mat */
    if (rand() < 0.45) {
      const st2 = box(sw * 0.3, sh + 0.9 + rand(), sd2 * 0.3,
        rand() < 0.5 ? matLeafB : matCrop, tag + 'Stem' + i);
      st2.position.set(x + sw * 0.2, (sh + 0.9) / 2, z - sd2 * 0.15); inner.add(st2);
    }
  }

  /* Beds spread around the floor on their own bearings, not stacked in two
     lanes either side of the path where they read as one strip. */
  const nBeds = kind === 'crops' ? 7 : 4;
  for (let i = 0; i < nBeds; i++) {
    const side = i % 2 ? 1 : -1;
    const lane = Math.floor(i / 2);
    const len = R * (0.7 - lane * 0.1);
    const bed = cropBed(len, 1.8, rand, tag + 'Bed' + i);
    bed.position.set(side * (R * 0.36 + lane * 2.6 + 1.0), 0, (i / nBeds - 0.5) * R * 1.3);
    bed.rotation.y = (rand() - 0.5) * 0.5;
    inner.add(bed);
  }

  for (let i = 0; i < 2; i++) {
    const tr = trellis(R * (0.9 - i * 0.2), rand, tag + 'Trellis' + i);
    tr.position.set(-R * 0.34 - 0.6 - i * 2.6, 0, 0); inner.add(tr);
  }

  /* Grow lights on a ring under the frame, plus a tending catwalk. */
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    interiorLamp(inner, Math.cos(a) * R * 0.62, (dome.userData.crownY - floorY) * 0.52,
      Math.sin(a) * R * 0.62, tag + 'Grow' + i, { w: 1.4, d: 0.3 });
  }
  /* This was a tending catwalk: a grey ring of panel at 45% of the dome's
     height and very nearly the full interior radius. From above it read as a
     grey disc laid over the planting with only the tallest tree tops poking
     through — the orchard was underneath it. It is now a low SOIL terrace at
     ground level, retaining the raised bed rather than roofing the dome. */
  const terrace = cyl(R * 0.98, R * 0.98, 0.55, matSoil, tag + 'Terrace', 20, true);
  terrace.position.y = 0.24; inner.add(terrace);
  const terraceKerb = cyl(R * 0.99, R * 0.99, 0.16, matConcrete, tag + 'TerraceKerb', 20, true);
  terraceKerb.position.y = 0.56; inner.add(terraceKerb);

  /* Crates and drums by the porch — harvest going out. */
  for (let i = 0; i < 5; i++) {
    const s = 0.4 + rand() * 0.3;
    const c = box(s, s, s, rand() < 0.5 ? matAdA : matPanel, tag + 'Crate' + i);
    c.position.set((rand() - 0.5) * R * 0.4, s / 2, R * 0.7 + rand() * R * 0.1);
    c.rotation.y = rand(); inner.add(c);
  }
  return dome;
}

/* A city building: stepped boxy tower with lit and dark ports derived from the
 * seed, rooftop plant and an antenna. Same rules as a hull — flat faces, one
 * accent, visible services. */
function cityBuilding(w, d, h, rand, tag) {
  const g = new T.Group(); g.name = tag;
  const steps = 2 + Math.floor(rand() * 2);
  let y = 0, cw = w, cd = d;
  for (let s = 0; s < steps; s++) {
    const sh = h / steps * (s === 0 ? 1.15 : 0.85);
    const b = box(cw, sh, cd, s % 2 ? matPanel : matHull, tag + 'Mass' + s);
    b.position.y = y + sh / 2; g.add(b);
    /* Ports on the base mass only, and capped. A grid derived straight from
     * the wall's size ran to hundreds of meshes per building for detail that
     * is invisible at any distance you actually see a city block from; the
     * upper masses get one glazing band per face instead. */
    if (s === 0) {
      const rows = Math.min(4, Math.max(2, Math.floor(sh / 2.2)));
      const cols = 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          [1, -1].forEach((sgn, k) => {
            const p = box(cw / cols * 0.55, 0.5, 0.08, rand() < 0.45 ? matLit : matDark,
              tag + 'Port' + s + '_' + r + '_' + c + '_' + k);
            p.position.set((c - (cols - 1) / 2) * (cw / cols),
              y + sh * (r + 0.7) / rows, sgn * (cd / 2 + 0.04));
            g.add(p);
          });
        }
      }
    } else {
      [1, -1].forEach((sgn, k) => {
        const band = box(cw * 0.78, 0.6, 0.08, rand() < 0.5 ? matLit : matDark,
          tag + 'PortBand' + s + '_' + k);
        band.position.set(0, y + sh * 0.55, sgn * (cd / 2 + 0.04));
        g.add(band);
      });
    }
    const band = box(cw * 1.02, 0.18, cd * 1.02, matDeep, tag + 'Band' + s);
    band.position.y = y + sh; g.add(band);
    y += sh; cw *= 0.76; cd *= 0.8;
  }
  const cap = box(cw * 0.7, 0.5, cd * 0.7, matEngine, tag + 'RoofPlant');
  cap.position.y = y + 0.25; g.add(cap);
  const mast = cyl(0.06, 0.09, h * 0.22, matEngine, tag + 'Antenna', 6);
  mast.position.y = y + 0.5 + h * 0.11; g.add(mast);
  if (rand() < 0.5) {
    const sign = box(cw * 0.8, 1.1, 0.12, rand() < 0.5 ? matAdA : matAdB, tag + 'Sign');
    sign.position.set(0, y - 1.4, cd / 2 + 0.1); g.add(sign);
  }
  const trim = box(w * 1.01, 0.22, d * 1.01, matAccent, tag + 'Trim');
  trim.position.y = 0.4; g.add(trim);
  return g;
}

/* ---- the port ---- */
export function buildCityPort(label = 'CP-01', size = 'M') {
  const st = new T.Group();
  const rand = seedFrom(label + size);
  const big = size === 'L', small = size === 'S';

  const stripLen = small ? 96 : big ? 156 : 124;
  const stripW = BERTH.lg.w * 2.3;

  /* Landing strip, along Z. Everything else is kept on +X so the approach and
   * the far side stay clear — the surface equivalent of an approach corridor. */
  const strip = box(stripW, 0.3, stripLen, matTarmac, 'strip');
  strip.position.y = 0.15; st.add(strip);
  const shoulderW = stripW * 0.3;
  [1, -1].forEach((s, k) => {
    const sh = box(shoulderW, 0.22, stripLen, matConcrete, 'stripShoulder' + k);
    sh.position.set(s * (stripW / 2 + shoulderW / 2), 0.11, 0); st.add(sh);
  });
  /* Centreline dashes and threshold bars. */
  const dashes = Math.floor(stripLen / 8);
  for (let i = 0; i < dashes; i++) {
    const d = box(0.5, 0.06, 3.4, matPaint, 'stripCentreline' + i);
    d.position.set(0, 0.32, (i - (dashes - 1) / 2) * (stripLen / dashes)); st.add(d);
  }
  [1, -1].forEach((s, k) => {
    for (let i = 0; i < 6; i++) {
      const b = box(0.7, 0.06, 5.5, matPaint, 'stripThreshold' + k + '_' + i);
      b.position.set((i - 2.5) * 1.5, 0.32, s * (stripLen / 2 - 5.0)); st.add(b);
    }
    const num = box(3.2, 0.06, 4.2, matPaint, 'stripDesignator' + k);
    num.position.set(0, 0.32, s * (stripLen / 2 - 13)); st.add(num);
  });
  /* Edge lights: green at the far threshold, red at the near one, matching the
   * fleet's nav-light convention rather than inventing a runway scheme. */
  const lights = Math.floor(stripLen / 10);
  for (let i = 0; i < lights; i++) {
    [1, -1].forEach((s, k) => {
      const l = box(0.22, 0.3, 0.22, matLit, 'stripEdgeLight' + k + '_' + i);
      l.position.set(s * (stripW / 2 + shoulderW * 0.8), 0.3,
        (i - (lights - 1) / 2) * (stripLen / lights));
      st.add(l);
    });
  }
  [[1, matNavGreen], [-1, matNavRed]].forEach(([s, mat], k) => {
    for (let i = 0; i < 4; i++) {
      const l = box(0.26, 0.34, 0.26, mat, 'stripThresholdLight' + k + '_' + i);
      l.position.set((i - 1.5) * (stripW / 4), 0.34, s * (stripLen / 2 + 1.2)); st.add(l);
    }
  });

  /* Parking apron, east of the strip, joined by two taxiways.
   *
   * The apron is sized FROM the stands, not the other way round. Sizing it
   * first and laying stands into it put the run 65 units off the end of the
   * slab and into the city block — the same class of bug as house rule 6, a
   * part positioned against a host that was never measured. So the stand plan
   * is built first, dealt into two lanes, and the slab is cut to fit the
   * deeper lane. */
  const plan = small ? [['sm', 2], ['lg', 1]] : big ? [['sm', 5], ['lg', 3]] : [['sm', 4], ['lg', 2]];
  const standSizes = [];
  plan.forEach(([cls, n]) => {
    for (let i = 0; i < n; i++) {
      const env = BERTH[cls];
      standSizes.push({ cls, sw: env.w * 1.5, sd: env.d * 1.35, env });
    }
  });
  const GAP = 3.2;
  const lanes = [[], []];
  standSizes.forEach((s, i) => lanes[i % 2].push(s));
  const laneDepth = lanes.map(l => l.reduce((a, s) => a + s.sd + GAP, 0));
  const laneW = Math.max(...standSizes.map(s => s.sw));
  const termW = BERTH.lg.d * 1.5;
  const apronW = laneW * 2 + 12 + termW;
  const apronD = Math.max(Math.max(...laneDepth) + 6, 42);
  const apronX = stripW / 2 + shoulderW + apronW / 2 + 6;
  const apron = box(apronW, 0.26, apronD, matConcrete, 'apron');
  apron.position.set(apronX, 0.13, 0); st.add(apron);
  [1, -1].forEach((s, k) => {
    const tw = box(apronX - stripW / 2, 0.24, BERTH.lg.w * 1.6, matConcrete, 'taxiway' + k);
    tw.position.set(stripW / 2 + (apronX - stripW / 2) / 2, 0.12, s * apronD * 0.3); st.add(tw);
    const cl = box(apronX - stripW / 2, 0.05, 0.4, matPaint, 'taxiwayCentreline' + k);
    cl.position.set(tw.position.x, 0.25, s * apronD * 0.3); st.add(cl);
  });

  const stands = [];
  const cursors = [-apronD / 2 + 3, -apronD / 2 + 3];
  const seen = {};
  standSizes.forEach((s, idx) => {
    {
      const { cls, sw, sd, env } = s;
      const li = idx % 2;
      const i = (seen[cls] = (seen[cls] || 0) + 1) - 1;
      const cx = apronX - apronW / 2 + 4 + li * (laneW + 4) + sw / 2;
      const cz = cursors[li] + sd / 2;
      const g = new T.Group(); g.name = 'stand' + cls.toUpperCase() + i;
      /* Painted outline: four bars, not a filled patch, so the concrete shows. */
      [[sw, 0.4, 0, -sd / 2], [sw, 0.4, 0, sd / 2], [0.4, sd, -sw / 2, 0], [0.4, sd, sw / 2, 0]]
        .forEach(([bw, bd, ox, oz], k) => {
          const bar = box(bw, 0.05, bd, matPaint, g.name + 'Outline' + k);
          bar.position.set(ox, 0.28, oz); g.add(bar);
        });
      const tee = box(0.35, 0.05, sd * 0.5, matAccent, g.name + 'Lead');
      tee.position.set(0, 0.28, 0); g.add(tee);
      const num = box(1.6, 0.05, 2.2, matPaint, g.name + 'Number');
      num.position.set(sw / 2 - 1.4, 0.28, -sd / 2 + 1.8); g.add(num);
      /* Clamps and a service pit — the stand has to hold a hull down. */
      [1, -1].forEach((s, k) => {
        const clamp = box(0.6, 0.3, 0.6, matEngine, g.name + 'Clamp' + k);
        clamp.position.set(s * env.w * 0.4, 0.28, sd * 0.18); g.add(clamp);
      });
      const pit = box(1.3, 0.16, 1.3, matDeep, g.name + 'ServicePit');
      pit.position.set(-sw / 2 + 1.1, 0.3, sd * 0.3); g.add(pit);
      const mast = cyl(0.1, 0.14, 5.2, matEngine, g.name + 'FloodMast', 6);
      mast.position.set(sw / 2 + 0.8, 2.6, -sd * 0.3); g.add(mast);
      const flood = box(0.9, 0.2, 0.3, matLit, g.name + 'Flood');
      flood.position.set(sw / 2 + 0.8, 5.2, -sd * 0.3 + 0.2); g.add(flood);
      cautionRun(g, sw, 0.1, 'x', g.name + 'Caution');
      g.position.set(cx, 0.13, cz);
      st.add(g);
      stands.push({ name: g.name, cls, x: cx, z: cz, w: sw, d: sd });
      cursors[li] += sd + GAP;
    }
  });

  /* Terminal shed and cargo dock along the apron's outboard edge. */
  const termD = apronD * 0.5, termH = 9;
  const term = box(termW, termH, termD, matHull, 'terminal');
  term.position.set(apronX + apronW / 2 - termW / 2 - 1, termH / 2, apronD * 0.18);
  st.add(term);
  const roof = box(termW * 1.04, 0.4, termD * 1.04, matPanel, 'terminalRoof');
  roof.position.set(term.position.x, termH, term.position.z); st.add(roof);
  const glazing = box(0.1, termH * 0.34, termD * 0.86, matGlass, 'terminalGlazing');
  glazing.position.set(term.position.x - termW / 2 - 0.05, termH * 0.55, term.position.z);
  st.add(glazing);
  const canopy = box(6, 0.3, termD * 0.7, matPanel, 'terminalCanopy');
  canopy.position.set(term.position.x - termW / 2 - 3, termH * 0.42, term.position.z);
  st.add(canopy);
  for (let i = 0; i < 3; i++) {
    const post = cyl(0.16, 0.16, termH * 0.42, matEngine, 'terminalCanopyPost' + i, 6);
    post.position.set(term.position.x - termW / 2 - 5.6, termH * 0.21,
      term.position.z + (i - 1) * termD * 0.28);
    st.add(post);
  }
  for (let i = 0; i < 4; i++) {
    const ad = box(0.12, 1.6, 2.6, i % 2 ? matAdA : matAdB, 'terminalAd' + i);
    ad.position.set(term.position.x - termW / 2 - 0.1, termH * 0.28,
      term.position.z + (i - 1.5) * termD * 0.22);
    st.add(ad);
  }

  /* Control tower, on the apron's strip-facing corner with sight down the run.
   * Carries the billboard with the assigned designation. */
  const towerH = big ? 30 : small ? 20 : 25;
  const shaft = box(4.4, towerH, 4.4, matHull, 'towerShaft');
  /* Inboard of the apron's edge, not overhanging it — the cab has sight down
   * the strip without any part of the tower standing in the shoulder. */
  const towerX = apronX - apronW / 2 + 3.2, towerZ = -apronD / 2 - 7;
  shaft.position.set(towerX, towerH / 2, towerZ); st.add(shaft);
  const collar = box(5.6, 0.6, 5.6, matPanel, 'towerCollar');
  collar.position.set(towerX, towerH * 0.62, towerZ); st.add(collar);
  const cab = box(8.4, 4.2, 8.4, matPanel, 'towerCab');
  cab.position.set(towerX, towerH + 2.1, towerZ); st.add(cab);
  /* Cab glazing is a raked band — the flat plate rule: it sits on the four
   * faces of the cab, not across its corners. */
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([sx, sz], k) => {
    const gl = box(sx ? 0.12 : 7.6, 2.6, sz ? 0.12 : 7.6, matGlass, 'towerGlazing' + k);
    gl.position.set(towerX + sx * 4.26, towerH + 2.4, towerZ + sz * 4.26); st.add(gl);
  });
  const capRoof = box(9.2, 0.5, 9.2, matHull, 'towerRoof');
  capRoof.position.set(towerX, towerH + 4.45, towerZ); st.add(capRoof);
  const radar = cyl(0.1, 0.1, 3.2, matEngine, 'towerRadarMast', 6);
  radar.position.set(towerX, towerH + 6.2, towerZ); st.add(radar);
  const dish = cyl(1.5, 0.3, 0.7, matPanel, 'towerRadarDish', 8);
  dish.position.set(towerX, towerH + 8.0, towerZ); dish.rotation.x = 0.5; st.add(dish);
  const bcn = box(0.3, 0.3, 0.3, matBeacon, 'towerBeacon');
  bcn.position.set(towerX, towerH + 4.9, towerZ); st.add(bcn);
  for (let i = 0; i < Math.floor(towerH / 3); i++) {
    const rung = box(4.6, 0.12, 0.5, matEngine, 'towerLadder' + i);
    rung.position.set(towerX, 1.5 + i * 3, towerZ + 2.3); st.add(rung);
  }
  const bb = billboard('portBillboard', 9, 3.2, label);
  bb.position.set(towerX - 0.2, towerH * 0.42, towerZ - 2.6);
  bb.rotation.y = Math.PI; st.add(bb);

  /* Agricultural domes, east of the apron. */
  const domeCount = small ? 1 : big ? 3 : 2;
  const kinds = ['orchard', 'crops', 'habitat'];
  const baseR = small ? 15 : big ? 19 : 17;
  const domeX = apronX + apronW / 2 + baseR + 12;
  const domes = [];
  for (let i = 0; i < domeCount; i++) {
    const r = baseR * (1 - i * 0.12);
    const tag = 'dome' + i;
    const d = geodesicDome(r, tag, rand);
    plantDome(d, domeCount === 1 ? 'orchard' : kinds[i % kinds.length], rand, tag);
    const zSpan = (baseR * 2.4);
    d.position.set(domeX + (i % 2 ? baseR * 0.5 : 0), 0, (i - (domeCount - 1) / 2) * zSpan);
    st.add(d);
    domes.push(d);
    /* A covered walk from the apron to each dome's porch. */
    const walkLen = d.position.x - r * 1.1 - (apronX + apronW / 2);
    if (walkLen > 2) {
      const w = box(walkLen, 0.22, 3.2, matConcrete, tag + 'Walk');
      w.position.set(apronX + apronW / 2 + walkLen / 2, 0.11, d.position.z + r * 0.9);
      st.add(w);
      for (let k = 0; k < Math.floor(walkLen / 6); k++) {
        const p = cyl(0.12, 0.12, 3.0, matEngine, tag + 'WalkPost' + k, 6);
        p.position.set(apronX + apronW / 2 + 3 + k * 6, 1.5, d.position.z + r * 0.9 + 1.4);
        st.add(p);
      }
    }
  }

  /* City block, set back beyond the apron's north end so no building stands in
   * the approach. Heights step UP away from the strip, so nothing tall stands near the
   * approach. The block's west edge is held inboard of the apron's own west
   * edge, which is already clear of the strip shoulder. */
  const cityCount = small ? 4 : big ? 9 : 6;
  const cityZ = apronD / 2 + 30;
  const cityX0 = apronX - apronW / 2 + 6;
  const colPitch = 19;
  for (let i = 0; i < cityCount; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const w = 9 + rand() * 5, d = 9 + rand() * 5;
    const h = (big ? 36 : 28) * (0.7 + row * 0.45) * (0.85 + rand() * 0.3);
    const b = cityBuilding(w, d, h, rand, 'city' + i);
    b.position.set(cityX0 + col * colPitch + (rand() - 0.5) * 3,
      0, cityZ + row * 26 + (rand() - 0.5) * 4);
    b.rotation.y = (rand() - 0.5) * 0.2;
    st.add(b);
  }
  /* Street grid under the block, so the towers sit on something. */
  const plazaX0 = apronX - apronW / 2;
  const plazaW = colPitch * 2 + 30, plazaD = cityCount > 4 ? 84 : 46;
  const plaza = box(plazaW, 0.2, plazaD, matConcrete, 'cityPlaza');
  plaza.position.set(plazaX0 + plazaW / 2, 0.1, cityZ + plazaD / 2 - 14); st.add(plaza);
  for (let i = 0; i < 3; i++) {
    const road = box(plazaW, 0.06, 5, matTarmac, 'cityRoad' + i);
    road.position.set(plaza.position.x, 0.22, cityZ - 8 + i * 24); st.add(road);
    const line = box(plazaW * 0.9, 0.04, 0.3, matPaint, 'cityRoadLine' + i);
    line.position.set(plaza.position.x, 0.26, road.position.z); st.add(line);
  }
  const link = box(10, 0.2, cityZ - apronD / 2, matTarmac, 'cityLink');
  link.position.set(cityX0 + colPitch - 2, 0.1, apronD / 2 + (cityZ - apronD / 2) / 2); st.add(link);

  /* Perimeter services: fuel farm, drums, fence posts, wind mast. */
  for (let i = 0; i < 4; i++) {
    const tank = cyl(2.4, 2.4, 5.4, matPanel, 'fuelTank' + i, 10);
    tank.position.set(apronX + apronW / 2 + 6 + (i % 2) * 6, 2.7, -apronD / 2 - 10 - Math.floor(i / 2) * 7);
    st.add(tank);
    const capT = cyl(2.5, 2.5, 0.4, matHull, 'fuelTankCap' + i, 10);
    capT.position.set(tank.position.x, 5.5, tank.position.z); st.add(capT);
  }
  for (let i = 0; i < 8; i++) {
    const drum = cyl(0.4, 0.4, 1.0, i % 3 ? matAdA : matEngine, 'apronDrum' + i, 8);
    drum.position.set(apronX - apronW / 2 + 2 + rand() * 4, 0.63, -apronD / 2 + 4 + i * 2.2);
    st.add(drum);
  }
  const wind = cyl(0.08, 0.12, 9, matEngine, 'windMast', 6);
  wind.position.set(-stripW / 2 - shoulderW - 4, 4.5, -stripLen * 0.3); st.add(wind);
  const sock = cyl(0.1, 0.55, 2.0, matHazardY, 'windSock', 6);
  sock.position.set(-stripW / 2 - shoulderW - 4, 8.4, -stripLen * 0.3 + 1.1);
  sock.rotation.x = Math.PI / 2.4; st.add(sock);

  st.name = 'cityPort';
  st.userData.label = label;
  st.userData.stands = stands;
  st.userData.strip = { length: stripLen, width: stripW, heading: '+Z' };
  st.userData.domes = domes.map(d => ({
    name: d.name, radius: d.userData.interiorRadius, crownY: d.userData.crownY
  }));
  /* Ground it, like the stations: min.y === 0 so it drops onto a plane. */
  st.updateMatrixWorld(true);
  const bb2 = new T.Box3().setFromObject(st);
  st.position.y -= bb2.min.y;
  st.updateMatrixWorld(true);
  return st;
}

export const PORT_TYPES = {
  cityport: { label: 'City Port', build: buildCityPort, prefix: 'CP-', digits: 2 }
};
