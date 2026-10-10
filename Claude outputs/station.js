import * as THREE from 'three';

/* Orbital stations, built in the same visual language as the fleet: flat-faced
 * boxy volumes, mustard accents, yellow/black caution striping, lit ports and
 * used-looking service clutter. Every station has INTERNAL berths for all three
 * size classes:
 *   - S and M share one sliding door (they fit the same aperture)
 *   - L pushes straight through a force field that holds the atmosphere in,
 *     backed by blast doors that slide shut when the station is threatened
 * Each carries a billboard that displays its assigned docking designation. */

const T = THREE;

// ---- shared palette, matching the ships ----
const matHull = new T.MeshStandardMaterial({ color: 0x8a94a2, roughness: 0.78, metalness: 0.22, name: 'stationHull' });
const matPanel = new T.MeshStandardMaterial({ color: 0x5d6674, roughness: 0.72, metalness: 0.3, name: 'stationPanel' });
const matDeep = new T.MeshStandardMaterial({ color: 0x39414d, roughness: 0.7, metalness: 0.3, name: 'stationDeep' });
const matAccent = new T.MeshStandardMaterial({ color: 0xd6c24a, roughness: 0.5, metalness: 0.35, name: 'stationAccent' });
const matHazardY = new T.MeshStandardMaterial({ color: 0xd8bf3a, roughness: 0.6, name: 'hazardYellow' });
const matHazardK = new T.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6, name: 'hazardBlack' });
const matGlass = new T.MeshStandardMaterial({ color: 0x14181d, roughness: 0.25, metalness: 0.6, name: 'stationGlass' });
const matLit = new T.MeshStandardMaterial({ color: 0xf2e4a8, emissive: 0xf2e4a8, emissiveIntensity: 1.5, roughness: 0.6, name: 'litPort' });
const matDark = new T.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.7, name: 'darkPort' });
const matField = new T.MeshStandardMaterial({ color: 0x4fd4e8, emissive: 0x4fd4e8, emissiveIntensity: 0.85,
  transparent: true, opacity: 0.3, roughness: 0.4, side: T.DoubleSide, name: 'forceField' });
const matBeacon = new T.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0xff5a3c, emissiveIntensity: 2.2, roughness: 0.6, name: 'beaconRed' });
const matBoard = new T.MeshStandardMaterial({ color: 0x0e1013, roughness: 0.5, name: 'billboardFace' });
const matBoardLit = new T.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x7fd4ff, emissiveIntensity: 1.4, roughness: 0.6, name: 'billboardGlyph' });
const matAdA = new T.MeshStandardMaterial({ color: 0xc4562f, emissive: 0xc4562f, emissiveIntensity: 0.7, roughness: 0.6, name: 'adOrange' });
const matAdB = new T.MeshStandardMaterial({ color: 0x3f8f6a, emissive: 0x3f8f6a, emissiveIntensity: 0.7, roughness: 0.6, name: 'adGreen' });
const matNavGreen = new T.MeshStandardMaterial({ color: 0x2f6b3a, emissive: 0x44e06a, emissiveIntensity: 2.0, roughness: 0.6, name: 'navGreen' });
const matNavRed = new T.MeshStandardMaterial({ color: 0x6b2a2a, emissive: 0xff4436, emissiveIntensity: 2.0, roughness: 0.6, name: 'navRed' });
const matEngine = new T.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.65, metalness: 0.35, name: 'stationFitting' });

/* Berth apertures are derived from the FLEET's real bounding boxes, not chosen
 * by eye. Largest hull per size class, measured across all 13 classes:
 *   S 4.80 W x 3.58 H x 8.80 L   (Navy S)
 *   M 5.96 W x 4.37 H x 10.61 L  (Freighter M)
 *   L 7.06 W x 5.17 H x 12.31 L  (Freighter L)
 * S and M share one aperture, so it is sized to the M envelope. Clearance is
 * generous enough that a hull can be flown in rather than threaded. */
const CLR_W = 0.6, CLR_H = 0.6, CLR_D = 1.2;
const BERTH = {
  sm: { w: 5.96 + CLR_W, h: 4.37 + CLR_H, d: 10.61 + CLR_D },   // 6.56 x 4.97 x 11.81
  lg: { w: 7.06 + CLR_W, h: 5.17 + CLR_H, d: 12.31 + CLR_D }    // 7.66 x 5.77 x 13.51
};
function box(w, h, d, mat, name) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, name, seg = 10, open = false) {
  const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg, 1, open), mat);
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  return m;
}
function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 100000) / 100000; };
}

/* Caution striping along an edge: alternating chips, tiled to a whole number so
   nothing straddles a corner. */
function cautionRun(parent, len, thick, axis, name) {
  const n = Math.max(2, Math.round(len / 0.5));
  const seg = len / n;
  for (let i = 0; i < n; i++) {
    const mat = i % 2 === 0 ? matHazardY : matHazardK;
    const chip = axis === 'x'
      ? box(seg * 0.96, thick, thick, mat, name + i)
      : box(thick, thick, seg * 0.96, mat, name + i);
    const off = -len / 2 + seg * (i + 0.5);
    chip.position[axis] = off;
    parent.add(chip);
  }
}

/* Billboard carrying the station's assigned designation. The glyph strip is a
   row of lit blocks whose pattern is derived from the name, so two stations
   never read the same. */
function billboard(name, w, h, label) {
  const grp = new T.Group(); grp.name = 'billboard';
  const frame = box(w, h, 0.12, matPanel, 'billboardFrame');
  grp.add(frame);
  const face = box(w * 0.94, h * 0.8, 0.05, matBoard, 'billboardFace');
  face.position.z = 0.07; grp.add(face);
  const chars = String(label).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10);
  const cw = (w * 0.9) / Math.max(6, chars.length);
  for (let i = 0; i < chars.length; i++) {
    const code = chars.charCodeAt(i);
    const glyph = box(cw * 0.62, h * (0.26 + (code % 5) * 0.06), 0.03, matBoardLit, 'billboardGlyph' + i);
    glyph.position.set(-w * 0.45 + cw * (i + 0.5), (code % 3 - 1) * h * 0.06, 0.1);
    grp.add(glyph);
  }
  /* Strut runs well past the frame so it buries itself in the host structure;
     a short stub left the whole sign as a detached island. */
  const strut = box(0.16, h * 1.5, 0.16, matEngine, 'billboardStrut');
  strut.position.y = -h * 0.95; grp.add(strut);
  const strutFoot = box(0.5, 0.14, 0.5, matPanel, 'billboardFoot');
  strutFoot.position.y = -h * 1.62; grp.add(strutFoot);
  grp.userData.label = label;
  return grp;
}

/* Interior lighting. Now that bays, corridors and the hangar are genuinely
 * enclosed, the stage's studio rig cannot reach inside them — emissive panels
 * alone left the player flying into a black hole. Each fixture is a lit MESH
 * plus a real point light at the same spot, so the geometry reads as the source
 * of its own illumination rather than being mysteriously visible.
 *
 * decay is set to 1 rather than the physical 2: these are game-lit interiors
 * and inverse-square falloff at this scale puts the far end of a 26-unit
 * hangar in the dark however hot the fixture is. */
function interiorLamp(parent, x, y, z, tag, opts = {}) {
  const fixture = box(opts.w || 1.1, 0.12, opts.d || 0.34, matLit, tag + 'Fixture');
  fixture.position.set(x, y, z);
  parent.add(fixture);
  const lamp = new T.PointLight(opts.color !== undefined ? opts.color : 0xffe9c4,
    opts.intensity || 2.4, opts.distance || 26);
  lamp.decay = 1;
  /* Named 'lamp…' deliberately: berthsOf() picks up any non-mesh node whose
     name matches a berth pattern, so a light called berthLThroatLamp0 was
     being treated as a berth group with no throat. */
  lamp.name = 'lamp' + tag;
  lamp.position.set(x, y - 0.3, z);
  parent.add(lamp);
  return lamp;
}

/* Merged box geometry, for dressing that would otherwise cost hundreds of draw
 * calls on an integrated GPU. Brought across with the planetside sites, which
 * are the only things that use it. */
function mergeBoxes(specs) {
  const pos = [], nrm = [];
  specs.forEach(sp => {
    const g = new T.BoxGeometry(sp.w, sp.h, sp.d).toNonIndexed();
    g.translate(sp.x || 0, sp.y || 0, sp.z || 0);
    const p = g.attributes.position.array, nn = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nrm.push(nn[i]); }
    g.dispose();
  });
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}
function mergedMesh(specs, mat, name) {
  const m = new T.Mesh(mergeBoxes(specs), mat);
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* Shipping containers. Same values as the freighter's CARGO_MATS in ship.js:
   a crate in a berth, a crate in a hall and a crate on a hauler's spine are
   the same object, so they carry the same paint. Red, blue, grey and brown —
   the fleet's two greens are left out because they read as a separate palette
   against rock and station grey. */
const CARGO_MATS = [
  new T.MeshStandardMaterial({ color: 0x8a5a54, roughness: 0.7, metalness: 0.2, name: 'cargoRed' }),
  new T.MeshStandardMaterial({ color: 0x55697d, roughness: 0.7, metalness: 0.2, name: 'cargoBlue' }),
  new T.MeshStandardMaterial({ color: 0x7a7d78, roughness: 0.7, metalness: 0.2, name: 'cargoGrey' }),
  new T.MeshStandardMaterial({ color: 0x9a6f56, roughness: 0.7, metalness: 0.2, name: 'cargoRust' })
];
/* One rand() call, exactly as the two-material pick it replaces, so no
   station's dressing reshuffles. */
function cargoMat(rand) { return CARGO_MATS[Math.floor(rand() * CARGO_MATS.length)]; }

/* ===================== THE DOOR =====================
 * One toothed sliding door, used by every aperture in the project that opens.
 *
 * Two telescopic leaves per side on staggered planes, nesting as they run
 * outboard; closed, each side's pair covers half the aperture and the two
 * halves meet on the centreline. The inner leaf carries four TEETH offset
 * forward on one side and aft on the other, so the halves comb together
 * instead of butting flat and the closed seam has no straight joint down the
 * middle of the flight path.
 *
 * The housing stands PROUD of the wall and IS the drive's cover plate — a
 * screw along the stroke, a motor at the outboard end, an access panel on the
 * face. Sunk pockets are why the spine's doors read as not moving at all:
 * with the mechanism buried, nothing of the motion is visible.
 *
 * This was the berth's own door and nothing else could use it. It is a
 * function now because the sites, the blast doorways and the city porches all
 * want the same mechanism, and a second copy of a door is how this project
 * lost its poses the last time.
 *
 *   axis 'y' — upright aperture in XY, thickness along Z, leaves stow along X.
 *   axis 'z' — aperture lying in a plate (XZ), thickness along Y, ditto.
 *
 * Either way the TRAVEL is along X, so one { open, closed, axis } covers both
 * and the driver never branches on the plane.
 */
function toothedDoor(grp, w, h, tag, opts = {}) {
  const flat = opts.axis === 'z';
  const M = opts.mats || {
    hull: matHull, panel: matPanel, deep: matDeep, accent: matAccent, fitting: matEngine
  };
  const kind = opts.kind || 'outer';
  const housD = opts.housing || 1.5;
  const leafW = w / 2 - 0.04;
  const stow = w * 0.5 + leafW / 2 + 0.06;        // inner edge just past the jamb
  /* dims and placement switch with the aperture's plane, nothing else does */
  const bx = (wx, along, thick, mat, name) => flat
    ? box(wx, thick, along, mat, name) : box(wx, along, thick, mat, name);
  const at = (m, x, along, thick) => {
    if (flat) m.position.set(x, thick, along); else m.position.set(x, along, thick);
    return m;
  };
  const leaves = [];

  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'L' : 'R';
    const house = bx(leafW + 0.9, h + 1.0, housD, M.hull, tag + 'DoorHouse' + side);
    at(house, sd * stow, 0, housD / 2 - 0.05); grp.add(house);
    const drive = bx(leafW + 1.1, 0.62, housD * 0.92, M.fitting, tag + 'DoorDrive' + side);
    at(drive, sd * stow, -h / 2 - 0.78, housD * 0.46); grp.add(drive);
    const screw = cyl(0.13, 0.13, leafW + 0.9, M.panel, tag + 'DoorScrew' + side, 8);
    screw.rotation.z = Math.PI / 2;
    at(screw, sd * stow, -h / 2 - 0.78, housD * 0.46); grp.add(screw);
    const motor = bx(0.72, 0.66, 0.72, M.panel, tag + 'DoorMotor' + side);
    at(motor, sd * (stow + leafW / 2 + 0.34), -h / 2 - 0.78, housD * 0.46); grp.add(motor);
    const access = bx(leafW * 0.55, 0.46, 0.08, M.panel, tag + 'DoorAccessPanel' + side);
    at(access, sd * stow, -h / 2 - 0.78, housD * 0.92 + 0.05); grp.add(access);
    for (let i = 0; i < 3; i++) {
      const groove = bx(leafW + 0.5, 0.08, 0.06, M.deep, tag + 'HouseGroove' + side + i);
      at(groove, sd * stow, h * (0.3 - i * 0.3), housD - 0.02); grp.add(groove);
    }
    const band = new T.Group();
    at(band, sd * stow, 0, housD + 0.01);
    /* cautionRun builds along X. The run has to lie along the SEAM, which is
       the aperture's span — y in a wall, z in a plate — so the turn is about a
       different axis in each plane. Turning about z in both put the lid doors'
       striping standing straight up out of the apron, which inflated every
       leaf's world box to the full height of the aperture and had the recess
       check reporting 10% of the leaf inside its house. */
    band.rotation[flat ? 'y' : 'z'] = Math.PI / 2;
    cautionRun(band, h * 0.8, 0.12, 'x', tag + 'HouseBand' + side);
    grp.add(band);
  });

  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'L' : 'R';
    const pocket = bx(leafW + 0.34, h + 0.3, housD * 0.72, M.deep, tag + 'DoorPocket' + side);
    at(pocket, sd * stow, 0, housD * 0.44); grp.add(pocket);
    [0, 1].forEach(k => {
      const lw = leafW * (k === 0 ? 1.0 : 0.86);
      const leaf = bx(lw, h * (k === 0 ? 1.0 : 0.94), 0.16, k === 0 ? M.panel : M.hull,
        tag + 'SlidingDoor' + side + (k + 1));
      at(leaf, sd * (stow + k * leafW * 0.07), 0, 0.52 + k * 0.24);
      /* Both poses recorded here, from the aperture's own width. Closed, the
         outer leaf takes the outboard quarter and the inner leaf the inboard
         quarter, so the pair covers this side's half and the two sides meet
         on the centreline. */
      leaf.userData.gate = {
        kind, axis: 'x',
        open: leaf.position.x,
        closed: sd * (k === 0 ? w / 2 - lw / 2 : lw / 2)
      };
      grp.add(leaf); leaves.push(leaf);
      /* Chevron and edge striping are CHILDREN of the leaf, so they travel
         with it instead of staying behind when the door slides. */
      const chev = bx(w * 0.1, 0.07, 0.03, M.accent, tag + 'DoorChevron' + side + (k + 1));
      at(chev, 0, h * (0.2 - k * 0.12), 0.16); leaf.add(chev);
      const edge = new T.Group();
      at(edge, sd * (-lw / 2 + 0.06), 0, 0.10);
      edge.rotation[flat ? 'y' : 'z'] = Math.PI / 2;
      cautionRun(edge, h * (k === 0 ? 1.0 : 0.94) * 0.94, 0.1, 'x', tag + 'DoorEdgeCaution' + side + (k + 1));
      leaf.add(edge);
      /* THE TEETH. Four per inner leaf, offset forward on one side and aft on
         the other, so the two halves comb together on the centreline. */
      if (k === 1) {
        for (let t = 0; t < 4; t++) {
          const tooth = bx(0.36, h * 0.17, 0.15, M.panel, tag + 'DoorInterlock' + side + t);
          at(tooth, sd * (-lw / 2 - 0.18), (t - 1.5) * h * 0.21, sd > 0 ? 0.08 : -0.08);
          leaf.add(tooth);
        }
      }
    });
    // the pocket lip runs across the door's travel, i.e. along x in both planes
    const lip = new T.Group();
    at(lip, sd * stow, -h / 2 - 0.14, housD * 0.5);
    cautionRun(lip, leafW + 0.3, 0.1, 'x', tag + 'PocketCaution' + side);
    grp.add(lip);
  });
  const railLen = (stow + leafW / 2) * 2 + 0.4;
  [1, -1].forEach(sy => {
    const r = bx(railLen, 0.14, 0.3, M.fitting, tag + 'DoorRail' + (sy > 0 ? '' : 'Lower'));
    at(r, 0, sy * (h / 2 + 0.08), 0.62); grp.add(r);
  });
  return { leafW, stow, leaves, kind };
}

/* Berth aperture. S/M berths share one sliding door; the L berth is an open
   force field with blast doors stowed to either side. */
function berth(kind, w, h, depth, tag) {
  const grp = new T.Group(); grp.name = tag;
  /* Bay throat, hollow by construction. It used to be one solid block of
     matDeep, so an open aperture showed a dark slab where the corridor should
     be and everything berthInterior() dresses was buried inside it. Built from
     PLATES like the hangar, so you can see down the bay to the inner gate.
     The original box is kept as an invisible REFERENCE VOLUME: the fit and
     route checks measure the hull envelope off `Throat`'s own dimensions, and
     keeping it means they carry on measuring the same thing. */
  const wt = 0.4;
  const throat = box(w, h, depth, matDeep, tag + 'Throat');
  throat.position.z = -depth / 2;
  throat.visible = false;
  grp.add(throat);
  [[0, -h / 2 + wt / 2, w, wt], [0, h / 2 - wt / 2, w, wt]].forEach((p, i) => {
    const pl = box(p[2], p[3], depth, i ? matDeep : matPanel, tag + 'Throat' + (i ? 'Roof' : 'Floor'));
    pl.position.set(p[0], p[1], -depth / 2); grp.add(pl);
  });
  [-1, 1].forEach(sd => {
    const wall = box(wt, h, depth, matHull, tag + 'ThroatWall' + (sd < 0 ? 'L' : 'R'));
    wall.position.set(sd * (w / 2 - wt / 2), 0, -depth / 2); grp.add(wall);
  });
  const throatBack = box(w, h, wt, matDeep, tag + 'ThroatBack');
  throatBack.position.set(0, 0, -depth + wt / 2); grp.add(throatBack);
  /* Lit down its length, so an open aperture shows a corridor receding to the
     inner gate instead of a dark hole. Fixtures ride the roof plate, clear of
     the hull envelope the route check sweeps through here. */
  for (let i = 0; i < 3; i++) {
    interiorLamp(grp, 0, h / 2 - wt - 0.12, -depth * (0.18 + i * 0.32), tag + 'ThroatLamp' + i,
      { w: w * 0.5, intensity: 2.2, distance: depth * 1.6 });
  }
  // jambs and lintel frame the opening
  [-1, 1].forEach(sd => {
    const jamb = box(0.22, h + 0.3, 0.3, matPanel, tag + 'Jamb' + (sd < 0 ? 'L' : 'R'));
    jamb.position.set(sd * (w / 2 + 0.11), 0, 0.02);
    grp.add(jamb);
  });
  const lintel = box(w + 0.44, 0.26, 0.3, matPanel, tag + 'Lintel');
  lintel.position.set(0, h / 2 + 0.13, 0.02); grp.add(lintel);
  const sill = box(w + 0.44, 0.2, 0.3, matPanel, tag + 'Sill');
  sill.position.set(0, -h / 2 - 0.1, 0.02); grp.add(sill);
  const stripe = new T.Group(); stripe.position.set(0, -h / 2 - 0.1, 0.19);
  cautionRun(stripe, w + 0.4, 0.09, 'x', tag + 'Caution');
  grp.add(stripe);

  if (kind === 'field') {
    /* L berth: the field holds atmosphere and a hull can push straight
       through it, so it spans the whole aperture with no mechanical gate in
       the flight path. */
    const field = box(w * 0.99, h * 0.99, 0.04, matField, tag + 'ForceField');
    field.position.z = -0.02; grp.add(field);
    /* The field is only up while the aperture is open. It sits PROUD of the
       blast doors (z -0.02 against their -0.16), so leaving it lit made a
       sealed berth still read as an open glowing hole with doors dimly behind
       it. setBerthDoors strikes anything tagged here when the doors shut. */
    field.userData.fieldGate = true;
    /* Emitters in the LINTEL AND SILL only. A third at mid-height ran a bar
       straight across the aperture at the height a hull enters — it read as an
       obstruction, and it was one. Nothing spans the opening. */
    [1, -1].forEach((sy, i) => {
      const emit = box(w * 0.99, 0.06, 0.1, matAccent, tag + 'FieldEmitter' + i);
      emit.position.set(0, sy * (h / 2 - 0.05), 0.05);
      emit.userData.fieldGate = true;
      grp.add(emit);
    });
    /* Blast doors live in RECESSED POCKETS sunk into the structure either side
       of the aperture, so a stowed leaf sits inside the wall rather than
       standing proud of it and clipping through passing hulls. */
    const bLeafW = w / 2;
    const bStow = w * 0.5 + bLeafW / 2 + 0.08;
    // door houses, as on the light berths, so the blast leaves are enclosed
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'L' : 'R';
      const house = box(bLeafW + 0.9, h + 0.9, 1.0, matHull, tag + 'BlastHouse' + side);
      house.position.set(sd * bStow, 0, -0.32);
      grp.add(house);
      /* Dressed as WALL, not as a door. The housings are fixed structure the
         leaves slide out of, but at matHull against the leaves' matPanel they
         read as doors themselves — recessed grooves and a service band up the
         face say "this part does not move". */
      for (let i = 0; i < 3; i++) {
        const groove = box(bLeafW + 0.6, 0.09, 0.07, matDeep, tag + 'HouseGroove' + side + i);
        groove.position.set(sd * bStow, h * (0.3 - i * 0.3), 0.19);
        grp.add(groove);
      }
      const band = new T.Group();
      band.position.set(sd * bStow, 0, 0.2);
      band.rotation.z = Math.PI / 2;
      cautionRun(band, h * 0.8, 0.13, 'x', tag + 'HouseBand' + side);
      grp.add(band);
    });
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'L' : 'R';
      // the pocket is a void cut back into the face
      const pocket = box(bLeafW + 0.3, h + 0.3, 0.5, matDeep, tag + 'BlastPocket' + side);
      pocket.position.set(sd * bStow, 0, -0.24);
      grp.add(pocket);
      const leaf = box(bLeafW, h, 0.22, matPanel, tag + 'BlastDoor' + side);
      leaf.position.set(sd * bStow, 0, -0.16);      // inside the pocket
      /* Both poses recorded at build time, so the game layer never has to know
         how a berth was laid out. Closed, each blast leaf covers its half of the
         aperture and the two meet on the centreline. */
      leaf.userData.gate = {
        kind: 'blast', axis: 'x',
        open: leaf.position.x, closed: sd * (w / 2 - bLeafW / 2)
      };
      grp.add(leaf);
      const guide = box(bLeafW + 0.3, 0.16, 0.3, matEngine, tag + 'DoorGuide' + side);
      guide.position.set(sd * bStow, h / 2 + 0.14, -0.1);
      grp.add(guide);
      // caution markers on the pocket lip
      const lip = new T.Group();
      lip.position.set(sd * bStow, -h / 2 - 0.14, 0.02);
      cautionRun(lip, bLeafW + 0.28, 0.11, 'x', tag + 'PocketCaution' + side);
      grp.add(lip);
      /* Striping down the leaf's INBOARD edge — the one that closes against the
         other leaf. Built as an 'x' run turned upright, so the chips still tile
         to a whole number and nothing straddles the corner. */
      const bedge = new T.Group();
      bedge.position.set(sd * (-bLeafW / 2 + 0.07), 0, 0.12);
      bedge.rotation.z = Math.PI / 2;
      cautionRun(bedge, h * 0.94, 0.11, 'x', tag + 'BlastEdgeCaution' + side);
      leaf.add(bedge);
    });
  } else {
    /* Shared S/M door: one aperture serves both, since the two classes fit the
       same envelope. Leaves are STOWED CLEAR of the opening — at an offset of
       0.36w each leaf's inner edge closed to 0.11w, leaving only 22% of the
       aperture usable however large the throat grew. Stowing them the way the
       heavy berth's blast doors already were keeps the full width open. */
    toothedDoor(grp, w, h, tag, { axis: 'y', kind: 'outer' });
  }
  /* Navigation lights at every aperture: red to port, green to starboard, so a
     pilot can read the mouth's orientation on approach, plus a run of
     threshold markers along the sill. */
  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'L' : 'R';
    const nav = box(0.3, 0.3, 0.22, sd > 0 ? matNavGreen : matNavRed, tag + 'NavLight' + side);
    nav.position.set(sd * (w / 2 + 0.16), h / 2 - 0.3, 0.22);
    grp.add(nav);
    const hood = box(0.4, 0.4, 0.2, matEngine, tag + 'NavHood' + side);
    hood.position.set(sd * (w / 2 + 0.16), h / 2 - 0.3, 0.1);
    grp.add(hood);
    const lamp = box(0.16, 0.16, 0.12, matLit, tag + 'ApproachLamp' + side);
    lamp.position.set(sd * (w / 2 + 0.16), -h / 2 + 0.3, 0.22);
    grp.add(lamp);
  });
  for (let i = 0; i < 5; i++) {
    const mk = box(w * 0.06, 0.06, 0.16, i % 2 ? matLit : matAccent, tag + 'ThresholdMarker' + i);
    mk.position.set(-w * 0.4 + i * (w * 0.8 / 4), -h / 2 - 0.02, 0.24);
    grp.add(mk);
  }
  /* Each berth is an AIRLOCK, not just a doorway: an outer gate (the sliding
     leaves or the field) and an inner gate onto the transfer line. The
     interlock is recorded here so the game layer can enforce it — the outer
     gate only cycles once the hull is inside and the inner gate is shut, and
     the pilot's controls stay locked out until the cycle completes. */
  const innerDoor = box(w * 0.98, h * 0.98, 0.24, matPanel, tag + 'InnerGate');
  innerDoor.position.set(0, 0, -depth + 0.12);
  grp.add(innerDoor);
  const innerSeal = box(w + 0.3, h + 0.3, 0.16, matDeep, tag + 'InnerSeal');
  innerSeal.position.set(0, 0, -depth + 0.02);
  grp.add(innerSeal);
  [-1, 1].forEach(sd => {
    const lamp = box(0.14, 0.14, 0.1, sd < 0 ? matBeacon : matLit, tag + 'CycleLamp' + (sd < 0 ? 'L' : 'R'));
    lamp.position.set(sd * (w / 2 - 0.2), h / 2 - 0.2, -depth + 0.22);
    grp.add(lamp);
  });
  const innerStripe = new T.Group();
  innerStripe.position.set(0, -h / 2 + 0.14, -depth + 0.24);
  cautionRun(innerStripe, w * 0.9, 0.1, 'x', tag + 'InnerCaution');
  grp.add(innerStripe);

  grp.userData.berthKind = kind;
  grp.userData.airlock = {
    outerGate: kind === 'field' ? 'forceField' : 'slidingDoors',
    innerGate: 'InnerGate',
    /* Sequence, in both directions: hull enters -> outer gate cycles shut ->
       bay pressurises -> inner gate opens -> transfer line moves the hull to
       the internal hall. Launch runs it backwards, and pilot control is
       returned only once the outer gate is fully open. */
    controlsLockedUntil: 'outerGateOpen',
    outerCyclesOnlyWhenOccupied: true
  };
  return grp;
}

/* Internal hall: the pressurised space hulls are moved to once cycled through
 * an airlock, and moved back out from on launch clearance. Parking stands,
 * overhead cranes, hoardings and the clutter of a working shed. */
function internalHall(w, h, d, tag, rand, stands = 3) {
  const grp = new T.Group(); grp.name = tag;
  /* Walls are separate PLATES rather than one solid block, so the hall is
     hollow by construction and everything inside it sits in open air instead
     of being buried in a shell. */
  const wt = 0.4;
  const floor = box(w, wt, d, matPanel, tag + 'Floor');
  floor.position.y = -h / 2 + wt / 2; grp.add(floor);
  const roof = box(w, wt, d, matDeep, tag + 'Roof');
  roof.position.y = h / 2 - wt / 2; grp.add(roof);
  [-1, 1].forEach(sd => {
    const wall = box(wt, h, d, matHull, tag + 'Wall' + (sd < 0 ? 'L' : 'R'));
    wall.position.x = sd * (w / 2 - wt / 2); grp.add(wall);
  });
  const back = box(w, h, wt, matHull, tag + 'BackWall');
  back.position.z = -d / 2 + wt / 2; grp.add(back);
  // usable interior, for placing fittings clear of the walls
  const iw = w - wt * 2.4, ih = h - wt * 2.4, id = d - wt * 2.4;

  /* Four parking stands in two ranks of two, so the hall can hold four hulls
     at once. A single file of stands made it a corridor; a square plan is also
     what lets several airlocks feed it from their own sides at once. */
  const cols = 2, rows = Math.max(1, Math.ceil(stands / cols));
  for (let i = 0; i < stands; i++) {
    const x = ((i % cols) - (cols - 1) / 2) * (iw / cols);
    const z = -d / 2 + d * ((Math.floor(i / cols) + 0.5) / rows);
    /* Marking sized from the FLEET envelope, not a fraction of the bay: at
       0.7 of the cell the painted outline was 1.6 shorter than the hull
       standing on it. Same rule the berth apertures follow. */
    const cw = Math.min((iw / cols) * 0.92, BERTH.sm.w + 0.5);
    const cd = Math.min((id / rows) * 0.92, BERTH.sm.d + 0.5);
    /* Paint sits ON the floor plate, not in it: at +0.029 the outline's lower
       face dipped through the plate, and widening the markings turned that into
       a real overlap volume. */
    const paintY = -h / 2 + wt + 0.06;
    const outline = box(cw, 0.06, cd, matAccent, tag + 'StandOutline' + i);
    outline.position.set(x, paintY, z); grp.add(outline);
    const inner = box(cw * 0.84, 0.07, cd * 0.84, matDeep, tag + 'StandInner' + i);
    inner.position.set(x, paintY + 0.02, z); grp.add(inner);
    [-1, 1].forEach(sd => {
      const clamp = box(0.5, 0.3, 0.5, matEngine, tag + 'StandClamp' + i + (sd < 0 ? 'L' : 'R'));
      clamp.position.set(x + sd * cw * 0.4, -h / 2 + wt + 0.16, z); grp.add(clamp);
    });
    const num = box(0.9, 0.07, 0.9, matBoardLit, tag + 'StandNumber' + i);
    num.position.set(x - cw * 0.42, paintY + 0.02, z); grp.add(num);
  }

  // overhead gantry crane on rails
  [-1, 1].forEach(sd => {
    const railBeam = box(0.4, 0.4, id * 0.94, matEngine, tag + 'CraneRail' + (sd < 0 ? 'L' : 'R'));
    railBeam.position.set(sd * (iw / 2 - 0.3), h / 2 - wt - 0.24, 0); grp.add(railBeam);
  });
  const bridge = box(iw * 0.98, 0.5, 1.2, matPanel, tag + 'CraneBridge');
  bridge.position.set(0, h / 2 - wt - 0.72, id * 0.1); grp.add(bridge);
  const hoist = box(0.9, 1.4, 0.9, matEngine, tag + 'CraneHoist');
  hoist.position.set(iw * 0.1, h / 2 - wt - 1.7, id * 0.1); grp.add(hoist);

  // hoardings along both walls: component upgrades and ships for sale
  for (let i = 0; i < 4; i++) {
    [-1, 1].forEach(sd => {
      const ad = box(0.16, ih * 0.26, id * 0.16, i % 2 === 0 ? matAdA : matAdB,
        tag + 'AdPanel' + i + (sd < 0 ? 'L' : 'R'));
      ad.position.set(sd * (iw / 2 - 0.14), h * 0.06, -id / 2 + id * ((i + 0.5) / 4));
      grp.add(ad);
      const frame = box(0.08, ih * 0.3, id * 0.19, matPanel, tag + 'AdFrame' + i + (sd < 0 ? 'L' : 'R'));
      frame.position.set(sd * (iw / 2 - 0.07), h * 0.06, -id / 2 + id * ((i + 0.5) / 4));
      grp.add(frame);
    });
  }
  // strip lighting and wall clutter
  [-1, 1].forEach(sd => {
    const strip = box(0.14, 0.14, id * 0.9, matLit, tag + 'HallLight' + (sd < 0 ? 'L' : 'R'));
    strip.position.set(sd * (iw / 2 - 0.14), h * 0.3, 0); grp.add(strip);
  });
  /* Overhead lamps on the stand grid — the wall strips read as lit but throw
     nothing, and this room is 26 units deep and fully enclosed. */
  for (let i = 0; i < stands; i++) {
    const x = ((i % cols) - (cols - 1) / 2) * (iw / cols);
    const z = -d / 2 + d * ((Math.floor(i / cols) + 0.5) / rows);
    interiorLamp(grp, x, h / 2 - wt - 0.3, z, tag + 'Lamp' + i,
      { w: iw / cols * 0.4, d: 0.5, intensity: 2.6, distance: Math.max(iw, id) * 1.1 });
  }
  for (let i = 0; i < 12; i++) {
    const sd = rand() > 0.5 ? 1 : -1;
    const s2 = 0.25 + rand() * 0.5;
    const g = box(s2, s2 * 0.8, s2, rand() > 0.5 ? matPanel : matEngine, tag + 'Greeble' + i);
    g.position.set(sd * (iw / 2 - 0.3), -h / 2 + wt + 0.3 + rand() * ih * 0.25, (rand() - 0.5) * id * 0.85);
    grp.add(g);
  }
  for (let i = 0; i < 6; i++) {
    const crate = box(0.6, 0.5, 0.6, rand() > 0.5 ? matPanel : matEngine, tag + 'Crate' + i);
    crate.position.set((rand() - 0.5) * iw * 0.7, -h / 2 + wt + 0.26, (rand() - 0.5) * id * 0.8);
    grp.add(crate);
  }
  for (let i = 0; i < 5; i++) {
    const scuff = box(iw * 0.14, 0.05, id * 0.05, i % 2 ? matAccent : matDeep, tag + 'FloorDecal' + i);
    scuff.position.set((rand() - 0.5) * iw * 0.6, -h / 2 + wt + 0.055, (rand() - 0.5) * id * 0.85);
    grp.add(scuff);
  }
  grp.userData.isInternalHall = true;
  return grp;
}

/* Transfer line between an airlock's inner gate and the internal hall: rollers,
 * side rails and hoardings, so the trip inboard is also advertising space. */
function transferLine(from, to, width, tag, rand) {
  const grp = new T.Group(); grp.name = tag;
  const dir = new T.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 0.5) return grp;
  const mid = new T.Vector3().addVectors(from, to).multiplyScalar(0.5);
  grp.position.copy(mid);
  /* Oriented to the FULL direction, not just its heading. Yaw alone left the
     bed horizontal at mid-height, so on a station whose airlocks sit high in
     the bore the run began nowhere near the gate it served. */
  grp.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir.clone().normalize());

  const bed = box(width, 0.3, len, matPanel, tag + 'Bed');
  grp.add(bed);
  const n = Math.max(3, Math.round(len / 1.6));
  for (let i = 0; i < n; i++) {
    const roller = cyl(0.16, 0.16, width * 0.86, matEngine, tag + 'Roller' + i, 8);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, 0.22, -len / 2 + len * ((i + 0.5) / n));
    grp.add(roller);
  }
  [-1, 1].forEach(sd => {
    const rail = box(0.24, 0.5, len * 0.98, matPanel, tag + 'Rail' + (sd < 0 ? 'L' : 'R'));
    rail.position.set(sd * width * 0.5, 0.3, 0); grp.add(rail);
    for (let i = 0; i < 3; i++) {
      const ad = box(0.12, 0.9, len * 0.2, i % 2 === 0 ? matAdA : matAdB,
        tag + 'AdHoarding' + (sd < 0 ? 'L' : 'R') + i);
      ad.position.set(sd * width * 0.5, 1.1, -len / 2 + len * ((i + 0.5) / 3));
      grp.add(ad);
      const frame = box(0.06, 1.05, len * 0.23, matPanel, tag + 'AdFrame' + (sd < 0 ? 'L' : 'R') + i);
      frame.position.set(sd * width * 0.5, 1.1, -len / 2 + len * ((i + 0.5) / 3));
      grp.add(frame);
    }
  });
  const stripe = new T.Group(); stripe.position.set(0, 0.17, 0);
  cautionRun(stripe, len * 0.9, 0.1, 'z', tag + 'Caution');
  grp.add(stripe);
  return grp;
}

/* Interior dressing seen through an aperture: deck, roof, gantries, ad panels
   and clutter, so the bay reads as a used, occupied space. */
function berthInterior(grp, w, h, depth, rand, tag) {
  const deck = box(w * 0.98, 0.12, depth * 0.94, matPanel, tag + 'Deck');
  deck.position.set(0, -h / 2 + 0.06, -depth / 2); grp.add(deck);
  const roof = box(w * 0.98, 0.1, depth * 0.94, matDeep, tag + 'Roof');
  roof.position.set(0, h / 2 - 0.05, -depth / 2); grp.add(roof);
  // side gantries with handrails
  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'L' : 'R';
    const gantry = box(w * 0.12, 0.09, depth * 0.8, matPanel, tag + 'Gantry' + side);
    gantry.position.set(sd * (w * 0.42), -h * 0.12, -depth / 2); grp.add(gantry);
    for (let i = 0; i < 3; i++) {
      const post = box(0.05, 0.16, 0.05, matEngine, tag + 'Rail' + side + i);
      post.position.set(sd * (w * 0.37), -h * 0.12 + 0.12, -depth * (0.2 + i * 0.28)); grp.add(post);
    }
    // strip lighting along the gantry
    const strip = box(0.05, 0.04, depth * 0.7, matLit, tag + 'DeckLight' + side);
    strip.position.set(sd * (w * 0.47), h * 0.16, -depth / 2); grp.add(strip);
  });
  // advertisements: component upgrades and ships for sale
  const ads = [
    { m: matAdA, w: 0.55, h: 0.34 },
    { m: matAdB, w: 0.45, h: 0.3 },
    { m: matAdA, w: 0.4, h: 0.26 }
  ];
  ads.forEach((ad, i) => {
    const sd = i % 2 === 0 ? -1 : 1;
    const panel = box(0.04, ad.h * h * 0.6, ad.w * depth * 0.3, ad.m, tag + 'AdPanel' + i);
    panel.position.set(sd * (w / 2 - 0.03), h * (0.02 + i * 0.07), -depth * (0.28 + i * 0.2));
    grp.add(panel);
    const frame = box(0.02, ad.h * h * 0.66, ad.w * depth * 0.34, matPanel, tag + 'AdFrame' + i);
    frame.position.set(sd * (w / 2 - 0.055), h * (0.02 + i * 0.07), -depth * (0.28 + i * 0.2));
    grp.add(frame);
  });
  // clutter: crates, drums, hoses
  for (let i = 0; i < 5; i++) {
    const sd = rand() > 0.5 ? 1 : -1;
    const s = 0.14 + rand() * 0.16;
    const crate = box(s, s * 0.8, s, rand() > 0.5 ? matPanel : matEngine, tag + 'Crate' + i);
    crate.position.set(sd * w * (0.1 + rand() * 0.24), -h / 2 + 0.12 + s * 0.4, -depth * (0.2 + rand() * 0.6));
    grp.add(crate);
  }
  for (let i = 0; i < 3; i++) {
    const drum = cyl(0.075, 0.075, 0.2, i % 2 ? matAccent : matEngine, tag + 'Drum' + i, 8);
    drum.position.set((rand() - 0.5) * w * 0.5, -h / 2 + 0.22, -depth * (0.3 + rand() * 0.5));
    grp.add(drum);
  }
  const hose = cyl(0.03, 0.03, depth * 0.5, matEngine, tag + 'Hose', 6);
  hose.rotation.x = Math.PI / 2;
  hose.position.set(-w * 0.3, -h / 2 + 0.16, -depth * 0.5); grp.add(hose);
  // scuff decals on the deck
  for (let i = 0; i < 4; i++) {
    const scuff = box(w * 0.16, 0.02, depth * 0.06, i % 2 ? matAccent : matDeep, tag + 'DeckDecal' + i);
    scuff.position.set((rand() - 0.5) * w * 0.5, -h / 2 + 0.125, -depth * (0.18 + i * 0.2));
    grp.add(scuff);
  }
}

/* Service clutter on an exterior face, so hulls read as maintained hardware. */
function exteriorGreebles(parent, w, h, faceZ, rand, tag, count = 8) {
  for (let i = 0; i < count; i++) {
    const s = 0.1 + rand() * 0.22;
    const g = box(s, s * (0.5 + rand()), 0.1 + rand() * 0.14, rand() > 0.5 ? matPanel : matEngine, tag + 'Greeble' + i);
    g.position.set((rand() - 0.5) * w * 0.85, (rand() - 0.5) * h * 0.85, faceZ);
    parent.add(g);
  }
  for (let i = 0; i < 6; i++) {
    const lit = rand() > 0.4;
    const p = box(0.14, 0.1, 0.03, lit ? matLit : matDark, tag + 'Port' + i);
    p.position.set((rand() - 0.5) * w * 0.8, (rand() - 0.5) * h * 0.8, faceZ + 0.02);
    parent.add(p);
  }
}

/* Attaches the internal hall in space measured to be CLEAR of the station,
 * then runs the transfer line from an actual airlock inner gate to the hall
 * mouth. Both were previously positioned by hand-written literals, which put
 * the hall inside the structure and started the line in mid-air. */
function attachHall(st, big, rand, opts) {
  st.updateMatrixWorld(true);
  const before = new T.Box3().setFromObject(st);
  /* Sized for FOUR hulls at once, in two ranks of two. The hall is the
     station's core rather than an outbuilding, so it takes the whole fleet's
     shared S/M envelope twice over in each axis. */
  const hw = BERTH.sm.w * 2 + 3.0, hh = big.h + 3.0, hd = BERTH.sm.d * 2 + 3.0;
  const hall = internalHall(hw, hh, hd, 'hall', rand, 4);
  // clear of the station's own footprint, on the ground, alongside it
  /* The hall is placed on an axis NO berth opens onto. Parking it blindly at
     +X put it directly in front of every side-facing aperture. */
  const gates = [];
  st.traverse(n => {
    if (!n.isMesh || !/InnerGate$/.test(n.name)) return;
    n.updateWorldMatrix(true, false);
    const b2 = new T.Box3().setFromObject(n);
    // the aperture's outward normal is the berth group's local -z, turned into world
    const nrm = new T.Vector3(0, 0, 1).applyQuaternion(n.parent.getWorldQuaternion(new T.Quaternion())).normalize();
    gates.push({ p: b2.getCenter(new T.Vector3()), n: nrm });
  });
  const cands = [
    { dir: new T.Vector3(0, 0, 1), ext: before.max.z },
    { dir: new T.Vector3(0, 0, -1), ext: -before.min.z },
    { dir: new T.Vector3(1, 0, 0), ext: before.max.x },
    { dir: new T.Vector3(-1, 0, 0), ext: -before.min.x }
  ];
  // score each face by how strongly any berth fires along it; lowest wins
  let pick = cands[0], pickScore = Infinity;
  cands.forEach(c => {
    let worst = 0;
    gates.forEach(g => { worst = Math.max(worst, g.n.dot(c.dir)); });
    if (worst < pickScore - 0.01) { pickScore = worst; pick = c; }
  });
  /* KNOWN GAP (see TODO.md): `pick.ext` is the station's overall bounding plane,
     so on the ring it is set by corner nodes far from the hall's footprint and
     the hall ends up floating ~1.8 clear with its apron bridging nothing.
     `checkHallJunction` in station-tests.js measures exactly this.

     Seating it by raycast across the hall's cross-section was tried and backed
     out: it pulls the hall in under overhanging structure. Two reasons, both
     fixable — the samples stopped at 0.9 of the hall's height so the cylinder's
     drum kept widening above the topmost ray and clipped the roof, and the
     per-gate lift shafts are built AFTER this point so they cannot be cast
     against at all. The fix is to sample the full height inclusive, carry a
     margin of one sample step, and place the lifts before the hall. */
  const off = pick.ext + Math.max(hw, hd) / 2 + 0.2;
  const hc = pick.dir.clone().multiplyScalar(off);
  hall.position.set(hc.x, hh / 2, hc.z);
  if (Math.abs(pick.dir.x) > 0.5) hall.rotation.y = Math.PI / 2;
  const apron = box(hw * 0.7, hh * 0.5, Math.abs(off - pick.ext) + 2.0, matHull, 'hallApron');
  const ac = pick.dir.clone().multiplyScalar(pick.ext + 1.0);
  apron.position.set(ac.x, hh * 0.25, ac.z);
  if (Math.abs(pick.dir.x) > 0.5) apron.rotation.y = Math.PI / 2;
  st.add(apron);
  /* Service clutter on the abutting face and both flanks. Everywhere the hall
     meets primary hull it gets the same dressing as the rest of the fleet —
     an undressed junction is what made this read as a placeholder. */
  exteriorGreebles(hall, hw * 0.9, hh * 0.8, -hd / 2 - 0.12, rand, 'hallSkinGreeble', 12);
  for (let i = 0; i < 10; i++) {
    const p = box(0.5, 0.3, 0.1, rand() > 0.35 ? matLit : matDark, 'hallSkinPort' + i);
    p.position.set((rand() - 0.5) * hw * 0.8, (rand() - 0.35) * hh * 0.6, -hd / 2 - 0.05);
    hall.add(p);
  }
  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'L' : 'R';
    for (let i = 0; i < 8; i++) {
      const s2 = 0.2 + rand() * 0.4;
      const g = box(0.3, s2, s2, rand() > 0.5 ? matPanel : matEngine, 'hallSkinGreeble' + side + i);
      g.position.set(sd * (hw / 2 + 0.12), (rand() - 0.35) * hh * 0.6, (rand() - 0.5) * hd * 0.85);
      hall.add(g);
    }
    const conduit = box(0.28, 0.28, hd * 0.8, matEngine, 'hallConduit' + side);
    conduit.position.set(sd * (hw / 2 + 0.14), hh * 0.3, 0); hall.add(conduit);
    const dec = box(0.06, hh * 0.22, hd * 0.2, matAccent, 'hallSkinDecal' + side);
    dec.position.set(sd * (hw / 2 + 0.04), hh * 0.05, -hd * 0.2); hall.add(dec);
  });
  // hazard striping around the junction, tiled to whole chips
  const jstripe = new T.Group(); jstripe.position.set(0, -hh / 2 + 0.5, -hd / 2 - 0.16);
  cautionRun(jstripe, hw * 0.9, 0.12, 'x', 'hallJunctionCaution');
  hall.add(jstripe);
  st.add(hall);
  /* EVERY airlock gets its own lift and its own run into the hall, so the hall
     is the one place hulls arrive. Previously only the nearest gate was served
     and the other berths led nowhere. */
  const deckY2 = 0.7;
  const mouth = hall.position.clone().add(pick.dir.clone().multiplyScalar(-Math.max(hw, hd) / 2)).setY(deckY2);
  gates.forEach(g => {
    const gp = g.p.clone();
    /* A lift at the gate drops to a ground-level transfer deck, and the run to
       the hall is made down there. Routed at berth height it crossed other
       berths' approach corridors, which is exactly what must stay clear. */
    const shaftH = Math.max(1.0, gp.y - deckY2);
    /* Sized from the envelope in BOTH axes. A square platform taken off the
       width alone came out 6.89 long against a 10.61 hull — the ship overhung
       its own lift by nearly two metres at each end. The hull does not shrink,
       so the shaft grows. */
    const shaft = box(big.w + 1.4, shaftH, big.d + 1.6, matHull, 'transferLiftShaft');
    shaft.position.set(gp.x, deckY2 + shaftH / 2, gp.z); st.add(shaft);
    const car = box(big.w + 0.6, 0.4, big.d + 0.8, matPanel, 'transferLiftCar');
    car.position.set(gp.x, deckY2 + 0.3, gp.z); st.add(car);
    for (let i = 0; i < 4; i++) {
      const gl = box(0.2, shaftH * 0.9, 0.2, matEngine, 'liftGuide' + i);
      gl.position.set(gp.x + (i % 2 ? 1 : -1) * big.w * 0.55, deckY2 + shaftH / 2, gp.z + (i < 2 ? 1 : -1) * big.w * 0.55);
      st.add(gl);
    }
    st.add(transferLine(new T.Vector3(gp.x, deckY2, gp.z), mouth, big.w * 1.15, 'transferMain', rand));
  });
  return hall;
}
function finish(station, name, label) {
  station.name = name;
  station.userData.label = label;
  station.updateMatrixWorld(true);
  const b = new T.Box3().setFromObject(station);
  const c = b.getCenter(new T.Vector3());
  station.position.sub(new T.Vector3(c.x, b.min.y, c.z));
  station.updateMatrixWorld(true);
  return station;
}

/* ---------- 1. CYLINDER STATION ----------
 * A hollow drum you fly INTO: the open end faces traffic, the interior wall
 * carries the landing deck, and pads around that wall lead into docking bays.
 * A bay's doors close behind the ship, then a conveyor carries it inboard to
 * the berth proper — which is what the run of advertising hoardings along the
 * conveyor is there to exploit. */
function buildCylinderStationLegacy(label = 'ORB-1', size = 'M') {
  const st = new T.Group();
  const rand = seedFrom(label + size);
  const bay = BERTH.sm, big = BERTH.lg;

  // bays sit around the inner wall, so the bore has to swallow a berth's depth
  const bayCount = size === 'S' ? 3 : size === 'L' ? 6 : 4;
  const Rin = bay.d + big.w + 6.0;
  const wall = 3.2;
  const Rout = Rin + wall;
  const L = big.d + bay.d + (size === 'L' ? 22 : size === 'S' ? 10 : 16);
  const yc = Rout + 1.0;                              // axis height above ground

  // shell: outer skin, inner skin, and end rings leaving the bore open
  const FACETS = 12;
  const outer = cyl(Rout, Rout, L, matHull, 'shellOuter', FACETS, true);
  outer.rotation.x = Math.PI / 2; outer.position.y = yc; st.add(outer);
  const inner = cyl(Rin, Rin, L * 0.995, matPanel, 'shellInner', FACETS, true);
  inner.rotation.x = Math.PI / 2; inner.position.y = yc; st.add(inner);
  [1, -1].forEach((zs, i) => {
    const ring = new T.Mesh(new T.RingGeometry(Rin, Rout, FACETS), matDeep);
    ring.name = 'endRing' + i; ring.castShadow = ring.receiveShadow = true;
    ring.position.set(0, yc, zs * L / 2);
    ring.rotation.y = zs < 0 ? Math.PI : 0;
    st.add(ring);
    // approach lighting around the mouth
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      const lamp = box(0.5, 0.5, 0.3, k % 3 === 0 ? matBeacon : matLit, 'mouthLamp' + i + '_' + k);
      lamp.position.set(Math.sin(ang) * (Rin + wall / 2), yc + Math.cos(ang) * (Rin + wall / 2), zs * (L / 2 - 0.15));
      st.add(lamp);
    }
  });

  // ground cradle so the drum sits on its own hardstand
  [-1, 1].forEach(zs => {
    const saddle = box(Rout * 1.2, 1.6, 3.0, matEngine, 'groundSaddle' + (zs < 0 ? 'A' : 'F'));
    saddle.position.set(0, 0.8, zs * L * 0.3); st.add(saddle);
    const cradleArc = box(Rout * 0.5, 2.4, 2.6, matPanel, 'cradleArc' + (zs < 0 ? 'A' : 'F'));
    cradleArc.position.set(0, 2.0, zs * L * 0.3); st.add(cradleArc);
  });

  /* Landing deck: a strip of plating on the inner wall, running the bore's
     length, with touchdown pads spaced along it. */
  for (let i = 0; i < bayCount; i++) {
    /* Snapped to a facet centre: on a faceted bore a bay placed at an
       arbitrary angle would sit across an edge rather than flat on a panel. */
    const facet = Math.round((i / bayCount) * FACETS) % FACETS;
    const ang = ((facet + 0.5) / FACETS) * Math.PI * 2;
    const nx = Math.sin(ang), ny = Math.cos(ang);
    const tag = 'bay' + i;
    const deckR = Rin - 0.4;
    const deck = box(bay.w * 1.6, 0.5, L * 0.9, matPanel, tag + 'LandingDeck');
    deck.position.set(nx * deckR, yc + ny * deckR, 0);
    deck.rotation.z = -ang;
    st.add(deck);
    // touchdown pad markings
    for (let k = 0; k < 3; k++) {
      const pad = box(bay.w * 0.9, 0.06, bay.d * 0.5, k % 2 ? matAccent : matDeep, tag + 'Pad' + k);
      pad.position.set(nx * (deckR - 0.28), yc + ny * (deckR - 0.28), -L * 0.3 + k * L * 0.3);
      pad.rotation.z = -ang;
      st.add(pad);
    }

    /* Docking bay: doors close behind the ship, then the conveyor runs it
       inboard to the berth. The bay mouth faces along the drum's axis so a
       hull taxis straight in off the deck — no two mouths face each other. */
    const bz = (i % 2 === 0 ? 1 : -1) * L * 0.22;
    const bayGrp = berth(i === 0 ? 'field' : 'door',
      i === 0 ? big.w : bay.w, i === 0 ? big.h : bay.h, i === 0 ? big.d : bay.d, tag + 'Berth');
    berthInterior(bayGrp, i === 0 ? big.w : bay.w, i === 0 ? big.h : bay.h, i === 0 ? big.d : bay.d, rand, tag + 'Berth');
    const mouthR = deckR - (i === 0 ? big.h : bay.h) / 2 - 0.6;
    bayGrp.position.set(nx * mouthR, yc + ny * mouthR, bz);
    bayGrp.rotation.z = -ang;
    bayGrp.rotation.y = bz > 0 ? 0 : Math.PI;
    st.add(bayGrp);

    /* Conveyor: rollers and side rails running from the bay mouth inboard,
       with hoardings either side — the reason this pattern earns its keep. */
    const convLen = (i === 0 ? big.d : bay.d) * 0.8;
    // BEHIND the mouth: the hull crosses the threshold, the doors shut, and
    // only then does it meet the rollers
    const convDir = bz > 0 ? -1 : 1;
    const convStart = bz + (bz > 0 ? -1 : 1) * ((i === 0 ? big.d : bay.d) + 1.0);
    /* Bed first, then rollers on it, both set INBOARD of the bore wall so the
       run is a real machine rather than rollers buried in the shell. */
    const convR = mouthR - (i === 0 ? big.h : bay.h) * 0.5 - 0.7;
    const bedThick = 0.4, rollerThick = 0.34;
    const bed = box(bay.w * 1.1, bedThick, convLen + 1.2, matPanel, tag + 'ConveyorBed');
    bed.position.set(nx * convR, yc + ny * convR, convStart + convDir * convLen / 2);
    bed.rotation.z = -ang;
    st.add(bed);
    for (let k = 0; k < 6; k++) {
      const t = convStart + convDir * (0.6 + k * convLen / 6);
      /* Same frame as the bed. Rotating the roller into its own axis and then
         yawing it put bed and rollers on different radii, so the rollers read
         as floating beside the machine they belong to. */
      const roller = box(bay.w * 0.9, rollerThick, rollerThick, matEngine, tag + 'ConveyorRoller' + k);
      /* Seated INTO the bed's outer face by 40% of the roller's own thickness.
         At a hand-written 0.32 offset the two shared 0.05 of volume — bbox
         contact, but not attachment (house rule 5). Derived from both
         thicknesses so neither can drift from the other. */
      const rr = convR + bedThick / 2 + rollerThick * 0.1;
      roller.position.set(nx * rr, yc + ny * rr, t);
      roller.rotation.z = -ang;
      st.add(roller);
    }
    [-1, 1].forEach(sd => {
      const railR = convR + 0.2;
      const px = nx * railR + Math.cos(ang) * sd * bay.w * 0.55;
      const py = yc + ny * railR - Math.sin(ang) * sd * bay.w * 0.55;
      const rail = box(0.3, 0.5, convLen, matPanel, tag + 'ConveyorRail' + (sd < 0 ? 'L' : 'R'));
      rail.position.set(px, py, convStart + convDir * convLen / 2);
      rail.rotation.z = -ang;
      st.add(rail);
      // advertising hoardings along the conveyor run
      for (let k = 0; k < 3; k++) {
        const board = box(0.14, bay.h * 0.34, convLen * 0.26,
          k % 2 === 0 ? matAdA : matAdB, tag + 'AdHoarding' + (sd < 0 ? 'L' : 'R') + k);
        board.position.set(px, py + bay.h * 0.34, convStart + convDir * (0.8 + k * convLen * 0.3));
        board.rotation.z = -ang;
        st.add(board);
        const frame = box(0.08, bay.h * 0.4, convLen * 0.3, matPanel, tag + 'AdFrame' + (sd < 0 ? 'L' : 'R') + k);
        frame.position.set(px, py + bay.h * 0.34, convStart + convDir * (0.8 + k * convLen * 0.3));
        frame.rotation.z = -ang;
        st.add(frame);
      }
    });
    // bay designation plate
    const plate = box(2.0, 0.6, 0.1, matAccent, tag + 'Designation');
    plate.position.set(nx * (mouthR + 0.3), yc + ny * (mouthR + 0.3), bz + convDir * -1.2);
    plate.rotation.z = -ang;
    st.add(plate);
  }

  // control gallery in the bore wall, looking across the deck
  const gal = box(4.0, 2.4, 6.0, matHull, 'controlGallery');
  const galR = Rin - 1.2;
  gal.position.set(0, yc - galR, 0); st.add(gal);
  for (let i = 0; i < 3; i++) {
    const gw = box(3.6, 0.6, 0.1, i === 1 ? matLit : matGlass, 'galleryWindow' + i);
    gw.position.set(0, yc - galR + 1.3, -2.0 + i * 2.0); st.add(gw);
  }

  // billboard on the outer skin, читается from outside
  const bb = billboard('billboard', 8.0, 2.5, label);
  bb.position.set(0, yc + Rout - 1.0, L / 2 - 0.6);
  st.add(bb);

  // exterior clutter, ports and hazard bands
  for (let i = 0; i < 30; i++) {
    const ang = rand() * Math.PI * 2;
    const s2 = 0.3 + rand() * 0.8;
    const g = box(s2, s2 * (0.6 + rand()), 0.4, rand() > 0.5 ? matPanel : matEngine, 'skinGreeble' + i);
    g.position.set(Math.sin(ang) * (Rout - 0.1), yc + Math.cos(ang) * (Rout - 0.1), (rand() - 0.5) * L * 0.9);
    g.rotation.z = -ang; st.add(g);
  }
  for (let i = 0; i < 20; i++) {
    const ang = rand() * Math.PI * 2;
    const p = box(0.6, 0.34, 0.12, rand() > 0.35 ? matLit : matDark, 'skinPort' + i);
    p.position.set(Math.sin(ang) * (Rout - 0.05), yc + Math.cos(ang) * (Rout - 0.05), (rand() - 0.5) * L * 0.85);
    p.rotation.z = -ang; st.add(p);
  }
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const dec = box(2.4, 0.14, 1.4, i % 2 ? matAccent : matPanel, 'skinDecal' + i);
    dec.position.set(Math.sin(ang) * (Rout - 0.02), yc + Math.cos(ang) * (Rout - 0.02), -L * 0.3);
    dec.rotation.z = -ang; st.add(dec);
  }

  attachHall(st, big, rand);
  return finish(st, 'cylinderStation', label);
}

/* ================= SHARED INTERIOR KIT =================
 * The internal route every pattern now uses: berths open onto a lit gallery,
 * the gallery feeds ONE lift, the lift drops to a conveyor, the conveyor runs
 * to the stands in a hangar nested INSIDE the hull.
 *
 * This replaces attachHall() for the spine, ring and cradle. The hall was
 * face-mounted, floated clear of the structure it was supposed to abut, and
 * put the route outside the hull — which is why checkDockingRoute reported
 * every berth on those three patterns as blocked by primary structure.
 *
 * Naming is deliberately the same as before (transferLiftShaft /
 * transferLiftCar / <tag>ConveyorBed / <tag>ConveyorRoller) so
 * checkTransferLine and checkConveyorSeating keep applying to it.
 */

/* A hollow chamber with stands, a gantry, strip lighting and hoardings.
 * Walls are separate PLATES so the space is genuinely open inside. */
function internalHangar(w, h, d, tag, rand, standCount, opts = {}) {
  const grp = new T.Group(); grp.name = tag;
  const wt = 0.5;
  /* THE SHELL GROWS. Stand pitch and hangar span are derived from the fleet
     envelope and the stand count, never the other way round: a depth chosen
     first and divided by the stand count gives painted outlines shorter than
     the hull standing on them, which is the same defect internalHall's own
     comment records having already fixed once. Two stands go side by side
     rather than in file, so the span needed stays close to a hull's length
     instead of twice it. */
  const env0 = opts.env || BERTH.sm;
  const cols = Math.min(2, Math.max(1, standCount));
  const rows = Math.ceil(standCount / cols);
  const needW = cols * (env0.w + 1.6) + 2.4;
  const needD = rows * (env0.d + 1.6) + 2.4;
  w = Math.max(w, needW);
  d = Math.max(d, needD);
  h = Math.max(h, env0.h + 3.0);
  const floor = box(w, wt, d, matPanel, tag + 'Floor');
  floor.position.y = -h / 2; grp.add(floor);
  /* A roof FRAME where something descends through it, never a solid plate
     hidden with visible=false: a hidden mesh still exports and still blocks. */
  if (opts.roofOpening) {
    const ow = opts.roofOpening.w, od = opts.roofOpening.d;
    const ox = opts.roofOpening.x || 0, oz = opts.roofOpening.z || 0;
    [[w, (d - od) / 2, 0, oz + od / 2 + (d - od) / 4],
     [w, (d - od) / 2, 0, oz - od / 2 - (d - od) / 4],
     [(w - ow) / 2, od, ox + ow / 2 + (w - ow) / 4, oz],
     [(w - ow) / 2, od, ox - ow / 2 - (w - ow) / 4, oz]].forEach(([pw, pd, px, pz], i) => {
      if (pw <= 0.01 || pd <= 0.01) return;
      const bar = box(pw, wt, pd, matDeep, tag + 'RoofFrame' + i);
      bar.position.set(px, h / 2, pz); grp.add(bar);
    });
  } else {
    const roof = box(w, wt, d, matDeep, tag + 'Roof');
    roof.position.y = h / 2; grp.add(roof);
  }
  [-1, 1].forEach((sd, k) => {
    const wall = box(wt, h, d, matPanel, tag + 'WallX' + k);
    wall.position.x = sd * (w / 2 - wt / 2); grp.add(wall);
  });
  [-1, 1].forEach((sd, k) => {
    if (opts.openZ && ((sd < 0 && opts.openZ === 'back') || (sd > 0 && opts.openZ === 'front'))) return;
    const end = box(w, h, wt, matPanel, tag + 'WallZ' + k);
    end.position.z = sd * (d / 2 - wt / 2); grp.add(end);
  });

  /* Stands sized from the FLEET envelope, in a single file down the hangar so
     the conveyor can serve them all from one run. */
  const env = env0;
  const stands = [];
  for (let i = 0; i < standCount; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const sx = (opts.standX || 0) + (col - (cols - 1) / 2) * (env.w + 1.6);
    const sz = (row - (rows - 1) / 2) * (env.d + 1.6);
    /* Outline sized from the ENVELOPE, with no cap that can shrink it. */
    const cw = env.w + 0.5, cd = env.d + 0.5;
    const paintY = -h / 2 + wt / 2 + 0.04;
    const outline = box(cw, 0.06, cd, matAccent, tag + 'StandOutline' + i);
    outline.position.set(sx, paintY, sz); grp.add(outline);
    const inner = box(cw * 0.84, 0.07, cd * 0.84, matDeep, tag + 'StandInner' + i);
    inner.position.set(sx, paintY + 0.02, sz); grp.add(inner);
    [-1, 1].forEach(sd => {
      const clamp = box(0.5, 0.3, 0.5, matEngine, tag + 'StandClamp' + i + (sd < 0 ? 'L' : 'R'));
      clamp.position.set(sx + sd * env.w * 0.4, paintY + 0.16, sz); grp.add(clamp);
    });
    const num = box(0.9, 0.07, 0.9, matBoardLit, tag + 'StandNumber' + i);
    num.position.set(sx - cw * 0.42, paintY + 0.02, sz); grp.add(num);
    stands.push({ name: tag + 'Stand' + i, x: sx, z: sz, occupancy: 1 });
  }
  grp.userData.env = env;

  /* Overhead gantry, parked clear of anything descending. */
  const railY = h / 2 - 1.0;
  [-1, 1].forEach((sd, k) => {
    const gr = box(0.3, 0.3, d * 0.92, matEngine, tag + 'CraneRail' + k);
    gr.position.set(sd * (w / 2 - 1.2), railY, 0); grp.add(gr);
  });
  const craneZ = opts.roofOpening
    ? (opts.roofOpening.z || 0) + opts.roofOpening.d / 2 + 1.6 : d * 0.2;
  const bridge = box(w - 2.0, 0.34, 1.0, matEngine, tag + 'CraneBridge');
  bridge.position.set(0, railY, Math.min(craneZ, d / 2 - 1.0)); grp.add(bridge);
  const hoist = box(0.6, 1.1, 0.6, matPanel, tag + 'CraneHoist');
  hoist.position.set(w * 0.12, railY - 0.7, bridge.position.z); grp.add(hoist);

  /* Lit, because an enclosed hangar the stage's rig cannot reach is a black
     hole to fly into. */
  const lampRows = Math.max(2, Math.round(d / 9));
  for (let i = 0; i < lampRows; i++) {
    const z = -d * 0.4 + i * (d * 0.8 / Math.max(1, lampRows - 1));
    interiorLamp(grp, -w * 0.26, h / 2 - 0.7, z, tag + 'Light' + i + 'a', { w: 1.5, d: 0.34 });
    interiorLamp(grp, w * 0.26, h / 2 - 0.7, z, tag + 'Light' + i + 'b', { w: 1.5, d: 0.34 });
  }
  /* Hoardings on the long walls — a hull under tow is a captive audience. */
  for (let i = 0; i < 4; i++) {
    const sd = i % 2 ? 1 : -1;
    const ad = box(0.12, 1.7, 3.0, i % 2 ? matAdA : matAdB, tag + 'AdPanel' + i);
    ad.position.set(sd * (w / 2 - wt - 0.06), -h / 2 + 2.4, (Math.floor(i / 2) - 0.5) * d * 0.4);
    grp.add(ad);
    const fr = box(0.06, 2.0, 3.3, matEngine, tag + 'AdFrame' + i);
    fr.position.set(sd * (w / 2 - wt - 0.14), -h / 2 + 2.4, ad.position.z); grp.add(fr);
  }
  for (let i = 0; i < 6; i++) {
    const sz2 = 0.4 + rand() * 0.45;
    const cx = (rand() - 0.5) * (w - 2.4), cz = (rand() - 0.5) * d * 0.85;
    if (opts.roofOpening && Math.abs(cx - (opts.roofOpening.x || 0)) < opts.roofOpening.w / 2 + sz2
      && Math.abs(cz - (opts.roofOpening.z || 0)) < opts.roofOpening.d / 2 + sz2) continue;
    const c = box(sz2, sz2, sz2, rand() < 0.4 ? matAdA : matPanel, tag + 'Crate' + i);
    c.position.set(cx, -h / 2 + wt / 2 + sz2 / 2, cz); c.rotation.y = rand(); grp.add(c);
  }
  grp.userData.stands = stands;
  grp.userData.inner = { w, h, d };
  return grp;
}

/* A lit gallery: the corridor the berths' inner gates open onto, collecting
 * them onto one route instead of each berth having its own. */
function gallery(len, w, h, tag, rand, axis = 'z') {
  const grp = new T.Group(); grp.name = tag;
  const wt = 0.4;
  const dim = (a, b) => axis === 'z' ? [a, b] : [b, a];
  const [fw, fd] = dim(w, len);
  const floor = box(fw, wt, fd, matPanel, tag + 'Floor');
  floor.position.y = -h / 2; grp.add(floor);
  const roof = box(fw, wt, fd, matDeep, tag + 'Roof');
  roof.position.y = h / 2; grp.add(roof);
  [-1, 1].forEach((sd, k) => {
    const [ww, wd] = dim(wt, len);
    const wall = box(ww, h, wd, matPanel, tag + 'Wall' + k);
    if (axis === 'z') wall.position.x = sd * (w / 2 - wt / 2);
    else wall.position.z = sd * (w / 2 - wt / 2);
    grp.add(wall);
  });
  const n = Math.max(2, Math.round(len / 7));
  for (let i = 0; i < n; i++) {
    const t = -len * 0.42 + i * (len * 0.84 / Math.max(1, n - 1));
    const [lx, lz] = axis === 'z' ? [0, t] : [t, 0];
    interiorLamp(grp, lx, h / 2 - 0.5, lz, tag + 'Light' + i, { w: 1.2, d: 0.3 });
  }
  for (let i = 0; i < 3; i++) {
    const t = -len * 0.3 + i * (len * 0.3);
    const [ax, az] = axis === 'z' ? [w / 2 - wt - 0.08, t] : [t, w / 2 - wt - 0.08];
    const ad = box(axis === 'z' ? 0.1 : 2.6, 1.5, axis === 'z' ? 2.6 : 0.1,
      i % 2 ? matAdA : matAdB, tag + 'AdPanel' + i);
    ad.position.set(ax, 0, az); grp.add(ad);
  }
  return grp;
}

/* One lift: shaft walls, guide rails, lamps, and the car modelled at its idle
 * pose in a POCKET below the hangar floor, so it has somewhere to wait or be
 * called from. Named transferLift* so checkTransferLine still measures it. */
function transferLift(clearW, clearD, topY, floorY, tag, rand, opts = {}) {
  const grp = new T.Group(); grp.name = tag;
  const wt = 0.5;
  const pocket = clearD * 0.5;
  const runTop = topY, runBot = floorY - pocket;
  const h = runTop - runBot;
  /* Walls on the axis the route runs along are OMITTED: a shaft walled on all
     four sides is a sealed box, and the conveyor that feeds it and the hangar
     it opens onto were both reported as blocked by the shaft's own wall. */
  [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([sx, sz], k) => {
    if (opts.openZ && sz) return;
    if (opts.openX && sx) return;
    const ww = sx ? wt : clearW + wt * 2;
    const wd = sz ? wt : clearD;
    const w2 = box(ww, h, wd, matPanel, tag + 'ShaftWall' + k);
    w2.position.set(sx * (clearW / 2 + wt / 2), (runTop + runBot) / 2, sz * (clearD / 2 + wt / 2));
    grp.add(w2);
    const rail = box(sx ? 0.3 : 0.24, h * 0.98, sx ? 0.24 : 0.3, matEngine, tag + 'liftGuide' + k);
    rail.position.set(sx * (clearW / 2 - 0.14), (runTop + runBot) / 2, sz * (clearD / 2 - 0.14));
    grp.add(rail);
  });
  const marker = box(clearW + wt * 2, 0.3, clearD + wt * 2, matDeep, tag + 'transferLiftShaft');
  marker.position.y = runTop; grp.add(marker);
  for (let i = 0; i < Math.max(2, Math.round(h / 5)); i++) {
    interiorLamp(grp, -clearW / 2 + 0.4, runTop - 2.0 - i * 5, 0, tag + 'ShaftLight' + i, { w: 0.9, d: 0.3 });
  }
  /* The car is a GROUP. Everything that rides with it — the deck, its caution
     run, its floor mark — hangs off that group, so the carrier contract moves
     one node and the markings do not stay behind on the shaft wall. Same
     reason the door leaves became groups. */
  const carGrp = new T.Group();
  carGrp.name = tag + 'LiftCar';
  carGrp.position.y = floorY + 0.25;
  const car = box(clearW * 0.96, 0.5, clearD * 0.96, matHull, tag + 'transferLiftCar');
  carGrp.add(car);
  const edge = new T.Group();
  edge.position.set(0, 0.25, clearD * 0.46);
  cautionRun(edge, clearW * 0.9, 0.12, 'x', tag + 'CarCaution');
  carGrp.add(edge);
  const mark = box(clearW * 0.5, 0.06, clearD * 0.6, matAccent, tag + 'CarMark');
  mark.position.y = 0.27; carGrp.add(mark);
  grp.add(carGrp);
  const pf = box(clearW + 1.0, 0.5, clearD + 1.0, matDeep, tag + 'PocketFloor');
  pf.position.y = runBot + 0.25; grp.add(pf);
  const ram = cyl(0.45, 0.45, pocket * 0.8, matEngine, tag + 'liftRam', 8);
  ram.position.y = runBot + pocket * 0.4; grp.add(ram);
  /* Carrier contract, on the CAR rather than on the shaft — the old block sat
     on `grp`, which is the walls, rails, pocket floor and ram as well, so
     anything that drove it would have flown the whole shaft up its own bore.
     `from` is where the car is actually modelled, which is at the hangar deck.
     The old block declared idleY in the POCKET while every car mesh sat at the
     deck: the contract and the geometry disagreed, exactly the way the door
     poses did, and nothing noticed because nothing ever drove it. checkCarriers
     asserts the two agree now.
     `stow` is the third stop. A carrier is two-ended, so the pocket the car
     retracts into is carried as data rather than pretended into the run. */
  /* Ends are PLAIN {x,y,z}, not Vector3, and that is not fussiness.
     three.js Object3D.clone() copies userData by JSON round-trip, so a Vector3
     stored here comes back off a clone as a bare object with no methods — and
     the ring station CLONES its hoists, so two of its four carriers arrived
     that way and `lerpVectors` threw on them. glTF extras are JSON too, so the
     same rule is what lets these survive an export at all. Numbers only. */
  carGrp.userData.carrier = {
    kind: 'lift', level: true, idle: 'from',
    from: { x: carGrp.position.x, y: carGrp.position.y, z: carGrp.position.z },
    to: { x: carGrp.position.x, y: runTop, z: carGrp.position.z },
    stow: { x: carGrp.position.x, y: runBot + 0.25, z: carGrp.position.z },
    occupancy: 1
  };
  return grp;
}

/* The conveyor from the lift's base to the stands. Rollers are SEATED in the
 * bed by a derived offset, which checkConveyorSeating asserts. */
function conveyorTo(len, width, tag, rand, axis = 'z') {
  const grp = new T.Group(); grp.name = tag;
  const bedThick = 0.3, rollerThick = 0.26;
  const [bw, bd] = axis === 'z' ? [width, len] : [len, width];
  const bed = box(bw, bedThick, bd, matPanel, tag + 'ConveyorBed');
  grp.add(bed);
  const n = Math.max(3, Math.round(len / 1.6));
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (i + 0.5) * (len / n);
    const r = cyl(rollerThick / 2, rollerThick / 2, width * 0.86, matEngine, tag + 'ConveyorRoller' + i, 8);
    r.rotation.z = axis === 'z' ? Math.PI / 2 : 0;
    if (axis === 'z') r.position.set(0, bedThick / 2 - rollerThick * 0.4, t);
    else r.position.set(t, bedThick / 2 - rollerThick * 0.4, 0);
    grp.add(r);
  }
  [-1, 1].forEach((sd, k) => {
    const [rw, rd] = axis === 'z' ? [0.2, len] : [len, 0.2];
    const rail = box(rw, 0.34, rd, matEngine, tag + 'ConveyorRail' + k);
    if (axis === 'z') rail.position.set(sd * width / 2, 0.2, 0);
    else rail.position.set(0, 0.2, sd * width / 2);
    grp.add(rail);
  });
  const stripe = new T.Group();
  stripe.position.y = 0.18;
  cautionRun(stripe, len * 0.9, 0.12, axis, tag + 'ConveyorCaution');
  grp.add(stripe);
  return grp;
}

/* ---------- 2. SPINE STATION ----------
 * A long keel with stacked berth blocks either side and a control tower amidships.
 * Built for volume traffic: the heavy berth sits at the keel's aft end so a
 * freighter never has to turn inside the structure. */
export function buildSpineStation(label = 'ORB-2', size = 'M') {
  const st = new T.Group();
  const rand = seedFrom(label + size);
  /* Long enough to carry three berth stations a side plus the heavy hall aft,
     all sized from the fleet envelopes. */
  const bay = BERTH.sm, big = BERTH.lg;
  const rows = size === 'S' ? 2 : size === 'L' ? 4 : 3;
  const L = bay.w * rows + (size === 'L' ? 22 : size === 'S' ? 11 : 14.0), W = 5.0, Hk = big.h + 1.6;

  const keel = box(W, Hk, L, matHull, 'keel');
  keel.position.y = Hk / 2 + 1.4; st.add(keel);
  const keelRail = box(W * 1.1, 0.22, L * 0.98, matPanel, 'keelRail');
  keelRail.position.y = Hk + 1.4; st.add(keelRail);

  // legs holding the keel off the ground for display
  [-1, 1].forEach(sd => {
    [-1, 1].forEach(zs => {
      const legH = 1.4 + 0.2;
      const leg = box(0.6, legH, 0.6, matEngine, 'standLeg' + (sd < 0 ? 'L' : 'R') + (zs < 0 ? 'A' : 'F'));
      leg.position.set(sd * W * 0.3, legH / 2, zs * L * 0.32); st.add(leg);
    });
  });

  // berth blocks: two shared S/M apertures per side, plus the heavy berth aft
  const smSpec = Array.from({ length: rows }, (_, i) =>
    ({ z: rows === 1 ? 0 : -L * 0.3 + i * (L * 0.6) / (rows - 1) }));
  smSpec.forEach((sp, i) => {
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'L' : 'R';
      const tag = 'berthSM' + i + side;
      const bw = bay.w, bh = bay.h, bd = bay.d;
      const blockW = bd + 1.0;
      const blk = box(blockW, bh + 2.0, bw + 2.0, matHull, tag + 'Block');
      blk.position.set(sd * (W / 2 + blockW / 2), Hk / 2 + 1.4, sp.z); st.add(blk);
      const b = berth('door', bw, bh, bd, tag);
      berthInterior(b, bw, bh, bd, rand, tag);
      b.position.set(sd * (W / 2 + blockW), Hk / 2 + 1.4, sp.z);
      b.rotation.y = sd < 0 ? -Math.PI / 2 : Math.PI / 2;
      st.add(b);
      exteriorGreebles(blk, blockW * 0.9, bh, (bw + 2.0) / 2 + 0.01, rand, tag, 5);
    });
  });

  // heavy berth at the aft end, field-gated
  {
    const bw = big.w, bh = big.h, bd = big.d;
    const hall = box(bw + 2.4, bh + 2.0, bd + 1.0, matHull, 'heavyHall');
    hall.position.set(0, Hk / 2 + 1.4, L / 2 + bd / 2 + 0.5); st.add(hall);
    const b = berth('field', bw, bh, bd, 'berthL');
    berthInterior(b, bw, bh, bd, rand, 'berthL');
    b.position.set(0, Hk / 2 + 1.4, L / 2 + bd + 1.0);
    st.add(b);
    /* On the hall's ROOF, clear of the mouth: the mouth face is the approach
       corridor and anything on it fouls the berth. */
    for (let k = 0; k < 6; k++) {
      const s2 = 0.3 + rand() * 0.6;
      const g = box(s2, s2 * 0.8, s2, rand() > 0.5 ? matPanel : matEngine, 'heavyHallRoofGreeble' + k);
      g.position.set((rand() - 0.5) * (bw + 2.0), Hk / 2 + 1.4 + (bh + 2.0) / 2 + 0.2,
        L / 2 + bd / 2 + 0.5 + (rand() - 0.5) * bd * 0.7);
      st.add(g);
    }
  }

  // control tower amidships with a wraparound gallery
  const tower = box(4.0, 4.4, 4.0, matHull, 'controlTower');
  tower.position.set(0, Hk + 1.4 + 2.2, L * 0.12); st.add(tower);
  const gallery = box(4.8, 0.9, 4.8, matPanel, 'towerGallery');
  gallery.position.set(0, Hk + 1.4 + 3.7, L * 0.12); st.add(gallery);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const gw = box(4.6, 0.6, 0.08, i % 2 ? matLit : matGlass, 'towerWindow' + i);
    gw.position.set(Math.sin(a) * 2.42, Hk + 1.4 + 3.7, L * 0.12 + Math.cos(a) * 2.42);
    gw.rotation.y = a; st.add(gw);
  }
  const mast = cyl(0.14, 0.18, 3.4, matEngine, 'towerMast', 8);
  mast.position.set(0, Hk + 1.4 + 5.8, L * 0.12); st.add(mast);
  const mastLamp = box(0.34, 0.34, 0.34, matBeacon, 'mastBeacon');
  mastLamp.position.set(0, Hk + 1.4 + 7.4, L * 0.12); st.add(mastLamp);

  // billboard on the forward face of the keel
  const bb = billboard('billboard', 7.4, 2.3, label);
  bb.position.set(0, Hk + 1.4 + 2.4, -L / 2 - 0.1);
  st.add(bb);

  // keel clutter and caution striping along the rail
  exteriorGreebles(keel, W * 0.9, Hk * 0.8, L / 2 + 0.01, rand, 'keel', 6);
  const stripe = new T.Group(); stripe.position.set(0, Hk + 1.52, 0); st.add(stripe);
  cautionRun(stripe, L * 0.9, 0.26, 'z', 'keelCaution');
  for (let i = 0; i < 18; i++) {
    const sd = rand() > 0.5 ? 1 : -1;
    const s = 0.12 + rand() * 0.24;
    const g = box(s, s * 0.8, s, rand() > 0.5 ? matPanel : matEngine, 'keelGreeble' + i);
    g.position.set(sd * (W / 2 + 0.02), Hk / 2 + 1.4 + (rand() - 0.5) * Hk * 0.7, (rand() - 0.5) * L * 0.9);
    st.add(g);
  }

  attachHall(st, big, rand, { buttTo: true });
  return finish(st, 'spineStation', label);
}

/* ---------- 3. RING STATION ----------
 * Four berth pylons hung from a square torus, with the traffic-control hub in
 * the middle on radial spars. The heavy berth occupies the hub's underside so a
 * capital hull can sit inside the ring's plane. */
export function buildRingStation(label = 'ORB-3', size = 'M') {
  const st = new T.Group();
  /* The pattern is a DOUBLE ring: one assembly, then a mirrored copy turned
     through 180 degrees, the two joined by a hub column running between their
     heavy berths. Everything is built into halfGrp so the mirror is an exact
     copy rather than a second hand-placed structure. */
  const halfGrp = new T.Group(); halfGrp.name = 'ringHalf';
  const rand = seedFrom(label + size);
  /* Ring sized so a hung berth pylon of full fleet depth clears the hub, and
     the heavy hall beneath the hub takes the L envelope. */
  const bay = BERTH.sm, big = BERTH.lg;
  /* Ring radius has a FLOOR derived from the joining trunk it surrounds, not
     just a per-size margin. The trunk is the heavy berth's hangar and is
     big.w * 2 + 2.2 across; on the S and M marks the literal margins put a
     ring's entry berth close enough that the heavy berth's route volume — a
     full L hull, 13.5 deep — reached into that berth's own throat. The two
     hangars have to be a hull's depth apart, so the radius derives from the
     trunk's half-width plus that depth. */
  const trunkHalfW = big.w + 1.1;
  const rMargin = size === 'L' ? 12.0 : size === 'S' ? 3.0 : 6.0;
  const R = Math.max(big.d + rMargin, trunkHalfW + bay.d * 0.75 + 2.0);
  const ring = 3.2, y0 = big.h + 6.0;

  // square torus: four straight runs, mitred at the corners
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    /* Each run spans the full side (plus overlap) so it beds into the corner
       nodes; at 0.72 of the side the ring was four floating segments. */
    const run = box(R * 2 * 1.02, ring, ring, matHull, 'ringRun' + i);
    run.position.set(Math.sin(a) * R, y0, Math.cos(a) * R);
    run.rotation.y = a;
    halfGrp.add(run);
    const rail = box(R * 2 * 0.98, 0.14, ring * 1.08, matPanel, 'ringRail' + i);
    rail.position.set(Math.sin(a) * R, y0 + ring / 2, Math.cos(a) * R);
    rail.rotation.y = a; halfGrp.add(rail);
    // corner nodes
    const ca = a + Math.PI / 4;
    const node = box(ring * 1.25, ring * 1.25, ring * 1.25, matPanel, 'ringNode' + i);
    node.position.set(Math.sin(ca) * R * 1.4, y0, Math.cos(ca) * R * 1.4);
    node.rotation.y = ca; halfGrp.add(node);
  }

  /* HUB = the ring's own internal hangar, on radial spars.
   * It used to be a 6.4 solid block and the route went outside the hull to a
   * floating hall, which is why checkDockingRoute reported every berth blocked
   * by its own pylon and trunk. Each ring now carries a hangar big enough for
   * its own two entry ports, fed by a lift and conveyors, and because the
   * whole assembly lives in halfGrp the mirror gives the station two rings of
   * two ports each with no second hand-placed structure. */
  /* Build the hangar first and take the hub's dimensions FROM it. Choosing the
     hub's size first and fitting stands into it is what produced painted
     outlines 4.4 shorter than an M hull. */
  const hangar = internalHangar(bay.w + 6.0, bay.h + 4.0, bay.d + 3.0, 'ringHangar', rand, 2, { env: bay });
  const hubW = hangar.userData.inner.w, hubH = hangar.userData.inner.h, hubD = hangar.userData.inner.d;
  const hangarFloorY = y0 - hubH / 2 + 0.5;
  hangar.position.set(0, y0, 0); halfGrp.add(hangar);
  const hubShell = box(hubW + 0.6, hubH + 0.6, hubD + 0.6, matHull, 'hub');
  hubShell.position.set(0, y0, 0); halfGrp.add(hubShell);
  const hubCrown = box(hubW * 0.6, 1.0, hubD * 0.6, matPanel, 'hubCrown');
  hubCrown.position.set(0, y0 + hubH / 2 + 0.5, 0); halfGrp.add(hubCrown);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    /* Length taken to the ring's inner face: at R-1.4 the spars stopped short
       and the hub floated inside its own ring. */
    const spar = box(1.0, 1.0, R + 0.4, matPanel, 'hubSpar' + i);
    spar.position.set(Math.sin(a) * (R / 2), y0, Math.cos(a) * (R / 2));
    spar.rotation.y = a; halfGrp.add(spar);
    /* On the DIAGONAL faces. The entry ports come in along +/-X, and windows on
       those bearings sat exactly where a hull is fed into the hangar. */
    const wa = a + Math.PI / 4;
    const gw = box(hubW * 0.4, 0.7, 0.08, i % 2 ? matLit : matGlass, 'hubWindow' + i);
    gw.position.set(Math.sin(wa) * (hubW / 2 + 0.32), y0 + hubH * 0.28, Math.cos(wa) * (hubD / 2 + 0.32));
    gw.rotation.y = wa; halfGrp.add(gw);
  }

  // shared S/M berths on two opposing ring faces, in hung pylons
  [Math.PI / 2, -Math.PI / 2].forEach((a, i) => {
    const bw = bay.w, bh = bay.h, bd = bay.d;
    /* Dropped a clear hull-height below the ring: hung tight under it, an
       approaching ship had no room between its spine and the ring's underside. */
    const drop = ring / 2 + (bh + 2.6) / 2 + bh * 0.8;
    /* The pylon is a SHELL, not a block. As a solid box the berth's inner gate
       opened straight into it — the gate sits a full bay depth inboard, which
       is inside the pylon's own body — so every route swept out of that berth
       hit its own pylon. Four plates with both radial ends open give the
       corridor the conveyor needs, the same treatment the hangar and the bay
       throats already use. */
    const pw = bw + 2.4, ph = bh + 2.6, pd = bd + 1.0, pt = 0.5;
    const pylonGrp = new T.Group();
    pylonGrp.name = 'berthPylon' + i;
    pylonGrp.position.set(Math.sin(a) * R, y0 - drop, Math.cos(a) * R);
    pylonGrp.rotation.y = a; halfGrp.add(pylonGrp);
    [[0, (ph - pt) / 2], [0, -(ph - pt) / 2]].forEach(([px, py], k) => {
      const plate = box(pw, pt, pd, matHull, 'berthPylon' + i + (k ? 'Floor' : 'Roof'));
      plate.position.set(px, py, 0); pylonGrp.add(plate);
    });
    [-1, 1].forEach((sd3, k) => {
      const wall = box(pt, ph, pd, matHull, 'berthPylon' + i + 'Wall' + k);
      wall.position.set(sd3 * (pw - pt) / 2, 0, 0); pylonGrp.add(wall);
    });
    for (let k = 0; k < 3; k++) {
      interiorLamp(pylonGrp, 0, ph / 2 - 0.6, -pd / 2 + pd * ((k + 0.5) / 3),
        'berthPylon' + i + 'Light' + k, { w: 1.0, d: 0.3 });
    }
    /* A full-section TRUNK carries the berth, not a slender neck: a bay this
       size hung on a stick reads as something nobody would build. The trunk is
       as wide as the pylon and braced back to the ring on both flanks. */
    const trunkH = bh * 0.9;
    const trunkY = y0 - ring / 2 - trunkH / 2;
    const trunk = box(bw + 2.0, trunkH, bd * 0.55, matHull, 'berthTrunk' + i);
    trunk.position.set(Math.sin(a) * R, trunkY, Math.cos(a) * R);
    trunk.rotation.y = a; halfGrp.add(trunk);
    const trunkRail = box(bw + 2.3, 0.3, bd * 0.58, matPanel, 'berthTrunkRail' + i);
    trunkRail.position.set(Math.sin(a) * R, trunkY + trunkH / 2, Math.cos(a) * R);
    trunkRail.rotation.y = a; halfGrp.add(trunkRail);
    [-1, 1].forEach(sd2 => {
      // diagonal braces from the trunk shoulders up into the ring
      const brace = box(0.5, trunkH * 1.25, 0.5, matEngine, 'berthTrunkBrace' + i + (sd2 < 0 ? 'A' : 'B'));
      brace.position.set(Math.sin(a) * R + Math.cos(a) * sd2 * (bw * 0.5 + 0.7),
        trunkY + trunkH * 0.1,
        Math.cos(a) * R - Math.sin(a) * sd2 * (bw * 0.5 + 0.7));
      brace.rotation.z = sd2 * 0.16;
      halfGrp.add(brace);
    });
    const tag = 'berthSM' + i;
    const b = berth('door', bw, bh, bd, tag);
    berthInterior(b, bw, bh, bd, rand, tag);
    const outward2 = new T.Vector3(Math.sin(a), 0, Math.cos(a));
    b.position.set(outward2.x * (R + (bd + 1.0) / 2), y0 - drop, outward2.z * (R + (bd + 1.0) / 2));
    b.rotation.y = a; halfGrp.add(b);
    /* THE ROUTE: inner gate -> conveyor inboard -> lift up -> hangar.
       Radii are measured off the berth's own geometry, never fractions: the
       gate sits a full bay depth inboard of the berth's centre. */
    const gateR = R + (bd + 1.0) / 2 - bd;
    const liftR = hubW / 2 + bd * 0.32;
    const berthFloorY = y0 - drop - bh / 2 + 0.3;
    const convLen = gateR - liftR;
    if (convLen > 1.5) {
      const conv = conveyorTo(convLen, bw + 0.6, 'ringTransfer' + i, rand, 'z');
      conv.position.set(outward2.x * (liftR + convLen / 2), berthFloorY,
        outward2.z * (liftR + convLen / 2));
      conv.rotation.y = a; halfGrp.add(conv);
    }
    /* The car carries the whole hull: bd, not bd * 0.5. At half length an M
       hull overhung its own platform by 3 at each end. */
    const lift = transferLift(bw + 0.6, bd + 0.8, hangarFloorY, berthFloorY, 'ringHoist' + i, rand, { openZ: true });
    lift.position.set(outward2.x * liftR, 0, outward2.z * liftR);
    lift.rotation.y = a; halfGrp.add(lift);
    /* and a short run from the lift head into the hangar itself */
    const inLen = liftR - hubW / 2 + 1.0;
    const inConv = conveyorTo(inLen, bw + 0.6, 'ringFeed' + i, rand, 'z');
    inConv.position.set(outward2.x * (hubW / 2 - 0.5 + inLen / 2), hangarFloorY,
      outward2.z * (hubD / 2 - 0.5 + inLen / 2));
    inConv.rotation.y = a; halfGrp.add(inConv);

    /* Dressed on the pylon's OUTBOARD FLANKS, seated into the side walls.
       The mouth face is the approach corridor, so nothing goes there. The
       underside seemed like the answer and was worse in two ways once the
       pylon became a shell: clutter 0.25 below the floor plate touches nothing
       and reads as an island, and the route's swept volume is a full hull
       height, so it reaches well below the deck the hull stands on and caught
       the clutter anyway. The flanks are attached structure and lie outside
       the swept width. */
    for (let k = 0; k < 5; k++) {
      const s3 = 0.3 + rand() * 0.5;
      const sd6 = k % 2 ? 1 : -1;
      const g = box(s3, s3 * 0.9, s3, rand() > 0.5 ? matPanel : matEngine,
        tag + 'FlankGreeble' + k);
      g.position.set(sd6 * (pw / 2 - 0.15 + s3 / 2),
        (rand() - 0.5) * ph * 0.5,
        (rand() - 0.5) * pd * 0.6);
      pylonGrp.add(g);
    }
  });

  /* Billboard bolted flat to the ring's OUTWARD face. It used to stand on the
     hub crown, where two things went wrong: it was the half's tallest part, so
     the joining trunk bedded into a hoarding instead of into the hub — the two
     halves were never structurally joined — and the trunk then swallowed it.
     On the ring's outer skin it is readable from outside and clear of the joint. */
  const bb = billboard('billboard', 7.2, 2.2, label);
  bb.position.set(0, y0, R + ring / 2);
  halfGrp.add(bb);

  // ring clutter, ports and beacons at the corners
  /* Clutter is laid ALONG the four runs in their own local frames. Scattering
     it by polar angle put pieces out past the corners where the square ring
     has no material. */
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const nx = Math.sin(a), nz = Math.cos(a);        // outward normal
    const tx = Math.cos(a), tz = -Math.sin(a);       // along the run
    for (let k = 0; k < 7; k++) {
      const t = (rand() - 0.5) * R * 1.7;
      const s = 0.1 + rand() * 0.24;
      const g = box(s, s * 0.9, s, rand() > 0.5 ? matPanel : matEngine, 'ringGreeble' + i + '_' + k);
      g.position.set(nx * (R + ring / 2) + tx * t, y0 + (rand() - 0.5) * ring * 0.7, nz * (R + ring / 2) + tz * t);
      g.rotation.y = a; halfGrp.add(g);
    }
    for (let k = 0; k < 5; k++) {
      const t = (rand() - 0.5) * R * 1.7;
      const p = box(0.2, 0.12, 0.05, rand() > 0.35 ? matLit : matDark, 'ringPort' + i + '_' + k);
      p.position.set(nx * (R + ring / 2 - 0.01) + tx * t, y0 + (rand() - 0.5) * ring * 0.5, nz * (R + ring / 2 - 0.01) + tz * t);
      p.rotation.y = a; halfGrp.add(p);
    }
  }
  for (let i = 0; i < 4; i++) {
    const ca = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bcn = box(0.45, 0.45, 0.45, matBeacon, 'cornerBeacon' + i);
    // seated on the node's crown; at 0.85 of the ring depth it floated clear
    bcn.position.set(Math.sin(ca) * R * 1.4, y0 + ring * 0.6, Math.cos(ca) * R * 1.4);
    halfGrp.add(bcn);
  }
  /* Lower ring as built, upper ring mirrored: flipped through 180 degrees so
     its heavy berth faces the lower one across the joining hub. */
  const gap = big.h * 1.6 + 6.0;
  halfGrp.updateMatrixWorld(true);
  const halfBox = new T.Box3().setFromObject(halfGrp);
  st.add(halfGrp);
  const mirrorGrp = halfGrp.clone(true);
  mirrorGrp.name = 'ringHalfMirrored';
  /* The mirror is a deep clone, so every name is a duplicate — and
     berthDoorsOf keys bays BY NAME, so the second ring's two ports collapsed
     onto the first ring's and only three bays were addressable on a station
     that has six. Suffix the mirror's berth GROUPS (not their children, whose
     names existing checks match on) so all of them can be addressed. */
  mirrorGrp.traverse(n => {
    if (n.userData && n.userData.airlock) n.name = n.name + 'B';
  });
  mirrorGrp.rotation.set(Math.PI, Math.PI, 0);
  /* Offset derived from the TRUNK, not from the half's own height. The trunk
     beds 1.2 into the lower half's crown and stands `gap + 2.4` tall, so the
     mirror — which is flipped, and therefore meets the trunk on its crown side
     — has to clear that whole span. Using `halfH + gap` put the upper ring's
     plane at the trunk's mid-height, running the ring straight through the
     heavy berth. Beds in by the same 1.2 at the top, so the joint reads the
     same at both ends. */
  mirrorGrp.position.y = 2 * halfBox.max.y + gap;
  st.add(mirrorGrp);
  /* The billboard rides the mirror's flip, which is a net 180 about Z, so it
     hung upside down once it moved out of the trunk and became visible.
     Counter-rotated by the same amount rather than moved: it stays part of the
     cloned half, so the two rings remain exact copies of one structure. */
  const mirrorBb = mirrorGrp.getObjectByName('billboard');
  if (mirrorBb) mirrorBb.rotation.z = Math.PI;
  /* The joining structure IS the heavy berth's hall: a boxy trunk spanning the
     gap between the two rings, with the L aperture cut into its outward face.
     Previously a cylindrical column carried a separate hall box, so the berth
     sat buried inside the column and read as broken. */
  {
    const hbw = big.w, hbh = big.h, hbd = big.d;
    /* Wide enough to CONTAIN the blast door houses. berth() stows each heavy
       leaf at 0.75w + 0.08 with a house 0.5w + 0.9 across, so the furthest
       structure reaches w + 0.53 from the centreline. At hbw + 3.0 the trunk's
       half-width was 5.33 against that 8.19 — the houses hung 2.9 proud of the
       trunk and the doors read as bolted onto thin air. */
    const trunkW = hbw * 2 + 2.2, trunkD = hbd + 1.6;
    const trunkH = gap + 2.4;
    const trunkY = halfBox.max.y - 1.2 + trunkH / 2;
    /* A SHELL, not a block. The heavy berth's inner gate opens a full bay depth
       inboard, i.e. inside the trunk's own body, so as a solid box the trunk
       blocked the very route it exists to serve. Plates leave the interior open;
       the forward face carries the aperture. */
    const tw2 = 0.6;
    const trunkGrp = new T.Group();
    trunkGrp.name = 'joiningHub';
    trunkGrp.position.set(0, trunkY, 0); st.add(trunkGrp);
    [[0, (trunkH - tw2) / 2], [0, -(trunkH - tw2) / 2]].forEach(([px, py], k) => {
      const cap = box(trunkW, tw2, trunkD, matHull, 'joiningHub' + (k ? 'Floor' : 'Roof'));
      cap.position.set(px, py, 0); trunkGrp.add(cap);
    });
    [-1, 1].forEach((sd4, k) => {
      const wall = box(tw2, trunkH, trunkD, matHull, 'joiningHubWall' + k);
      wall.position.set(sd4 * (trunkW - tw2) / 2, 0, 0); trunkGrp.add(wall);
    });
    const aft = box(trunkW, trunkH, tw2, matHull, 'joiningHubAft');
    aft.position.set(0, 0, -(trunkD - tw2) / 2); trunkGrp.add(aft);
    for (let k = 0; k < 4; k++) {
      /* Seated against the roof plate, which spans trunkH/2 - 0.6 to trunkH/2.
         At -1.0 the fixtures hung 0.34 clear of it and read as islands. */
      interiorLamp(trunkGrp, 0, trunkH / 2 - 0.62, -trunkD / 2 + trunkD * ((k + 0.5) / 4),
        'joiningHubLight' + k, { w: 1.4, d: 0.34 });
    }
    /* The trunk IS the heavy berth's hangar, so it needs the route to say so.
       Without a conveyor and a stand of its own the route check reached for the
       nearest ones — in a ring hub on the far side of the station — and swept a
       leg across the whole structure, reporting the trunk's own bands and
       ladder as blocking it. */
    const hFloorY = -trunkH / 2 + 0.6;
    const hConvLen = trunkD * 0.62;
    const hConv = conveyorTo(hConvLen, hbw + 0.6, 'heavyTransfer', rand, 'z');
    hConv.position.set(0, hFloorY, trunkD / 2 - 0.8 - hConvLen / 2);
    trunkGrp.add(hConv);
    for (let k = 0; k < 2; k++) {
      const sx = (k - 0.5) * (hbw + 1.6);
      const cw = hbw + 0.5, cd = hbd + 0.5;
      const outline = box(cw, 0.06, cd, matAccent, 'heavyHangarStandOutline' + k);
      outline.position.set(sx, hFloorY + 0.2, -trunkD * 0.12); trunkGrp.add(outline);
      const inner = box(cw * 0.84, 0.07, cd * 0.84, matDeep, 'heavyHangarStandInner' + k);
      inner.position.set(sx, hFloorY + 0.22, -trunkD * 0.12); trunkGrp.add(inner);
      [-1, 1].forEach(sd5 => {
        const clamp = box(0.5, 0.3, 0.5, matEngine, 'heavyHangarStandClamp' + k + (sd5 < 0 ? 'L' : 'R'));
        clamp.position.set(sx + sd5 * hbw * 0.4, hFloorY + 0.36, -trunkD * 0.12); trunkGrp.add(clamp);
      });
    }
    // collars where the trunk meets each ring
    /* Four bars, not a slab. As a solid plate the collar capped the trunk's
       interior at both ends — the heavy berth's own hangar, sealed by the
       fitting that is supposed to join it to the ring. */
    /* Three bars, straddling the trunk's own walls, and NONE across the
       aperture face. A collar that rings the whole cross-section runs a bar
       right over the mouth at deck height, so the heavy berth's route was
       blocked by the fitting joining its hangar to the ring. Bars are inset to
       overlap the wall they clamp rather than sitting just proud of it. */
    [-1, 1].forEach(sd => {
      const sfx = sd < 0 ? 'A' : 'B';
      const cy = trunkY + sd * (trunkH / 2 - 0.5);
      const cb = 1.4;
      [[trunkW + 1.0, cb, 0, -(trunkD / 2 - cb * 0.35)],
       [cb, trunkD - cb * 0.7, trunkW / 2 - cb * 0.35, 0],
       [cb, trunkD - cb * 0.7, -(trunkW / 2 - cb * 0.35), 0]].forEach(([bw2, bd2, ox, oz], k) => {
        const bar = box(bw2, 1.0, bd2, matPanel, 'hubCollar' + sfx + k);
        bar.position.set(ox, cy, oz); st.add(bar);
      });
    });
    for (let i = 0; i < 3; i++) {
      const band = box(trunkW + 0.4, 0.4, trunkD + 0.4, matPanel, 'joiningHubBand' + i);
      band.position.set(0, trunkY - trunkH / 2 + trunkH * ((i + 1) / 4), 0); st.add(band);
    }
    // the heavy berth opens out of the trunk's forward face, mid-gap
    const hb = berth('field', hbw, hbh, hbd, 'berthL');
    berthInterior(hb, hbw, hbh, hbd, rand, 'berthL');
    hb.position.set(0, trunkY, trunkD / 2);
    st.add(hb);
    // lit ports and clutter on the trunk's flanks
    for (let i = 0; i < 14; i++) {
      const sd = i % 2 === 0 ? 1 : -1;
      const p = box(0.12, 0.34, 0.6, i % 3 === 0 ? matLit : matDark, 'joiningHubPort' + i);
      p.position.set(sd * (trunkW / 2 - 0.02), trunkY + (rand() - 0.5) * trunkH * 0.7, (rand() - 0.5) * trunkD * 0.7);
      st.add(p);
    }
    for (let i = 0; i < 10; i++) {
      const sd = i % 2 === 0 ? 1 : -1;
      const s2 = 0.3 + rand() * 0.5;
      const g = box(0.3, s2, s2, rand() > 0.5 ? matPanel : matEngine, 'joiningHubGreeble' + i);
      g.position.set(sd * (trunkW / 2 - 0.12), trunkY + (rand() - 0.5) * trunkH * 0.7, (rand() - 0.5) * trunkD * 0.7);
      st.add(g);
    }
    // access ladder up the aft face
    for (let i = 0; i < 8; i++) {
      const rung = box(1.2, 0.2, 0.2, matEngine, 'hubLadder' + i);
      rung.position.set(0, trunkY - trunkH / 2 + trunkH * ((i + 0.5) / 8), -trunkD / 2 - 0.1); st.add(rung);
    }
  }
  /* No attachHall: the route is inside the hull now. The hall was face-mounted,
     floated clear of the structure it was meant to abut, and put the transfer
     run outside the rings entirely. */
  st.userData.route = {
    /* Station-local waypoints, shared by the player's tractor and NPC pathing.
       Two ports per ring, two rings, each ring feeding its own hangar. */
    perRing: [
      { at: 'innerGate', note: 'berth local -Z, a bay depth inboard' },
      { at: 'conveyorInboard' }, { at: 'lift' }, { at: 'hangarFeed' }, { at: 'stand' }
    ],
    hangars: ['ringHangar', 'ringHangar (mirrored half)'],
    entryPorts: ['berthSM0', 'berthSM1', 'berthSM0B', 'berthSM1B'],
    heavyBerths: ['berthL', 'berthLB']
  };
  return finish(st, 'ringStation', label);
}

/* ---------- 4. CRADLE STATION ----------
 * An open service cradle: no pressurised rim, just a spine with a clamshell
 * hangar amidships. The heavy berth is the hangar itself; the light berths are
 * paired tubes forward. A yard station rather than a trade hub. */
export function buildCradleStation(label = 'ORB-4', size = 'M') {
  const st = new T.Group();
  const rand = seedFrom(label + size);
  const bay = BERTH.sm, big = BERTH.lg;
  const L = big.d + bay.d + (size === 'L' ? 18.0 : size === 'S' ? 5.0 : 10.0);
  const deckY = big.h * 0.5 + 4.0;

  const spine = box(3.6, 3.6, L, matHull, 'spine');
  spine.position.y = deckY; st.add(spine);
  [-1, 1].forEach(sd => {
    const truss = box(0.6, 0.6, L * 0.96, matEngine, 'truss' + (sd < 0 ? 'L' : 'R'));
    truss.position.set(sd * 3.0, deckY, 0); st.add(truss);
    for (let i = 0; i < 7; i++) {
      const bz2 = -L * 0.44 + i * (L * 0.88 / 6);
      // nothing may cross the hangar mouth's approach corridor
      if (bz2 > -1.0 && bz2 < big.d + 2.0) continue;
      const brace = box(3.0, 0.32, 0.32, matEngine, 'trussBrace' + (sd < 0 ? 'L' : 'R') + i);
      brace.position.set(sd * 1.5, deckY, bz2); st.add(brace);
    }
  });
  // ground stand
  [-1, 1].forEach(sd => [-1, 1].forEach(zs => {
    // nothing may stand in the hangar mouth's approach
    if (zs > 0 && L * 0.34 < big.d + 3.0) return;
    /* Legs are placed under the truss rails (x 1.5) rather than between them,
       and kept inside the spine's z-span so each one meets real structure. */
    /* Height derived from the truss it carries (rails sit at y 3.4, 0.3 deep),
       so each leg meets real structure; a fixed 2.8 left a 0.45 gap and the
       aft pair hung in space. */
    const trussBottom = deckY - 0.3;
    const legH = trussBottom + 0.1;
    const leg = box(0.7, legH, 0.7, matEngine, 'standLeg' + (sd < 0 ? 'L' : 'R') + (zs < 0 ? 'A' : 'F'));
    leg.position.set(sd * 3.0, legH / 2, zs * L * 0.34); st.add(leg);
    const shoe = box(1.1, 0.3, 1.1, matPanel, 'standShoe' + (sd < 0 ? 'L' : 'R') + (zs < 0 ? 'A' : 'F'));
    shoe.position.set(sd * 3.0, 0.15, zs * L * 0.34); st.add(shoe);
  }));

  // clamshell hangar amidships = heavy berth
  {
    const bw = big.w, bh = big.h, bd = big.d;
    const shellL = box(bw / 2 + 1.0, bh + 2.0, bd, matHull, 'hangarShellL');
    shellL.position.set(-(bw / 2 + 1.0) / 2 - 1.0, deckY, -0.4); st.add(shellL);
    const shellR = box(bw / 2 + 1.0, bh + 2.0, bd, matHull, 'hangarShellR');
    shellR.position.set((bw / 2 + 1.0) / 2 + 1.0, deckY, -0.4); st.add(shellR);
    const roof = box(bw + 3.2, 0.8, bd, matPanel, 'hangarRoof');
    roof.position.set(0, deckY + bh / 2 + 1.0, -0.4); st.add(roof);
    const b = berth('field', bw, bh, bd, 'berthL');
    berthInterior(b, bw, bh, bd, rand, 'berthL');
    b.position.set(0, deckY, bd / 2 - 0.4);
    st.add(b);
    /* Clutter goes on the roof, clear of the mouth entirely: the shells' only
       free faces are the mouth and the outboard flanks, and pieces on either
       ended up in the approach corridor on the longer marks. */
    for (let k = 0; k < 8; k++) {
      const s2 = 0.3 + rand() * 0.6;
      const g = box(s2, s2 * 0.8, s2, rand() > 0.5 ? matPanel : matEngine, 'hangarRoofGreeble' + k);
      g.position.set((rand() - 0.5) * (bw + 2.4), deckY + bh / 2 + 1.2, -0.4 + (rand() - 0.5) * bd * 0.8);
      st.add(g);
    }
    // clamshell hinges and actuators
    [-1, 1].forEach(sd => {
      const hinge = cyl(0.28, 0.28, bd * 0.9, matEngine, 'hangarHinge' + (sd < 0 ? 'L' : 'R'), 8);
      hinge.rotation.x = Math.PI / 2;
      hinge.position.set(sd * (bw / 2 + 1.6), deckY + bh / 2 + 0.6, -0.4); st.add(hinge);
      const ram = cyl(0.15, 0.15, 2.4, matAccent, 'hangarRam' + (sd < 0 ? 'L' : 'R'), 6);
      ram.rotation.z = Math.PI / 2.6;
      ram.position.set(sd * (bw / 2 + 0.8), deckY + bh / 2 - 0.4, bd / 2 - 1.0); st.add(ram);
    });
  }

  // paired light berth tubes forward, sharing the S/M aperture
  [-1, 1].forEach(sd => {
    const bw = bay.w, bh = bay.h, bd = bay.d;
    const side = sd < 0 ? 'L' : 'R';
    const tubeR = Math.max(bw, bh) * 0.72;
    // outboard far enough that neither tube's door houses reach the other's
    const tubeX = sd * (tubeR + big.w * 0.9 + 2.4);
    const tube = cyl(tubeR, tubeR, bd + 1.4, matHull, 'lightTube' + side, 8);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(tubeX, deckY, L * 0.3); st.add(tube);
    // spur linking each tube back to the spine
    const spur = box(Math.abs(tubeX) - 1.4, 1.6, 3.0, matPanel, 'tubeSpur' + side);
    spur.position.set(tubeX / 2, deckY, L * 0.3); st.add(spur);
    const tag = 'berthSM' + side;
    const b = berth('door', bw, bh, bd, tag);
    berthInterior(b, bw, bh, bd, rand, tag);
    b.position.set(tubeX, deckY, L * 0.3 + (bd + 1.4) / 2);
    st.add(b);
    for (let i = 0; i < 4; i++) {
      const rib = cyl(tubeR * 1.04, tubeR * 1.04, 0.26, matPanel, 'tubeRib' + side + i, 8);
      rib.rotation.x = Math.PI / 2;
      rib.position.set(tubeX, deckY, L * 0.3 - bd * 0.3 + i * 1.3); st.add(rib);
    }
  });

  // control cab aft, on a short pylon
  const cab = box(3.4, 2.6, 3.4, matHull, 'controlCab');
  cab.position.set(0, deckY + 3.7, -L * 0.34); st.add(cab);
  const cabPylon = box(1.2, 2.2, 1.2, matPanel, 'cabPylon');
  cabPylon.position.set(0, deckY + 2.0, -L * 0.34); st.add(cabPylon);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const w = box(3.2, 0.7, 0.08, i % 2 ? matLit : matGlass, 'cabWindow' + i);
    w.position.set(Math.sin(a) * 1.72, deckY + 4.1, -L * 0.34 + Math.cos(a) * 1.72);
    w.rotation.y = a; st.add(w);
  }

  // billboard on a gantry over the hangar mouth
  const bb = billboard('billboard', 6.4, 2.0, label);
  bb.position.set(0, deckY + big.h / 2 + 3.6, 4.4);
  st.add(bb);
  const bbArm = box(0.4, 0.4, 6.0, matEngine, 'billboardArm');
  bbArm.position.set(0, deckY + big.h / 2 + 1.6, 2.4); st.add(bbArm);

  // yard clutter: crane, tanks, spares
  const crane = box(0.5, 4.6, 0.5, matEngine, 'craneMast');
  crane.position.set(-3.4, deckY + 2.3, -L * 0.12); st.add(crane);
  const jib = box(0.38, 0.38, 5.0, matEngine, 'craneJib');
  jib.position.set(-3.4, deckY + 4.4, -L * 0.12 + 2.2); st.add(jib);
  const hook = cyl(0.12, 0.12, 1.1, matAccent, 'craneHook', 6);
  hook.position.set(-3.4, deckY + 3.7, -L * 0.12 + 4.4); st.add(hook);
  for (let i = 0; i < 3; i++) {
    const tank = cyl(0.85, 0.85, 2.8, matPanel, 'serviceTank' + i, 10);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(3.6, deckY - 1.2 + i * 1.0, -L * 0.3 + i * 0.5); st.add(tank);
  }
  for (let i = 0; i < 20; i++) {
    const sd = rand() > 0.5 ? 1 : -1;
    const s = 0.1 + rand() * 0.22;
    const g = box(s, s * 0.9, s, rand() > 0.5 ? matPanel : matEngine, 'yardGreeble' + i);
    // hugged to the spine's own flank so nothing strays into open space
    // hugged to the spine's flank (half-width 1.8) so each piece beds into it
    g.position.set(sd * 1.74, deckY + (rand() - 0.5) * 3.0, (rand() - 0.5) * L * 0.9);
    st.add(g);
  }
  const bcn = box(0.5, 0.5, 0.5, matBeacon, 'spineBeacon');
  bcn.position.set(0, deckY + 1.7, L / 2 - 0.2); st.add(bcn);

  attachHall(st, big, rand);
  return finish(st, 'cradleStation', label);
}

/* ---------- 1. CYLINDER STATION (rebuilt) ----------
 * An OBLATE POLYHEDRAL PRISM — ten flat facets, wider than tall — rather than a
 * round drum: the fleet is flat-panelled, and a prism at ten facets costs a
 * fraction of a smooth cylinder's triangles while reading better against the
 * ships. Circular symmetry bought nothing here.
 *
 * The docking sequence is the whole point of the layout, so the geometry is
 * ordered along the hull rather than around it:
 *
 *   ONE slot, centred on the forward end face  ->  receiving bay at axis height
 *   ->  outer gate cycles shut behind the hull  ->  lift descends inside the
 *   shell  ->  transfer run aft  ->  four-berth HANGAR INSIDE the hull.
 *
 * The hangar is enclosed by the prism, so from a parked hull the only thing
 * visible is the inside of the dock. Everything the route touches is sized from
 * BERTH/the fleet envelope, never by eye, and the three volumes are separated
 * ALONG Z rather than stacked, which is what keeps the lift's descent and the
 * hangar's headroom from fighting each other. */
export function buildCylinderStation(label = 'ORB-1', size = 'M') {
  const st = new T.Group();
  const rand = seedFrom(label + size);
  const big = BERTH.lg;
  const stands = 4;

  /* Hangar sized for four hulls in two ranks, from the shared S/M envelope. */
  const hangW = BERTH.sm.w * 2 + 3.0, hangH = big.h + 3.0, hangD = BERTH.sm.d * 2 + 3.0;

  /* Cross-section derived from what has to fit inside it. The hangar sits below
     the axis; at its floor the prism's half-width must still exceed half the
     hangar plus a wall, which is what sets Rx against Ry. */
  const Ry = hangH * 1.26;
  const Rx = Ry * 1.18;                       // oblate: wider than tall
  const yc = Ry + 1.0;                        // axis height, hull clear of ground
  const hangCy = yc - hangH * 0.46;           // hangar centre, below the axis
  const FACETS = 10;
  const inset0 = Math.cos(Math.PI / FACETS);   // facet planes sit inboard of the vertex radius

  const bayD = big.d + 1.5;                   // receiving bay depth
  const liftZoneD = big.d * 0.8;              // where the lift descends
  const L = bayD + liftZoneD + hangD + 6.0;   // long hull: the sequence sets it
  const zNose = L / 2;

  /* Shell: an open-ended prism, outer skin and inner lining. The geometry is
     rotated so the prism's axis lies along Z, then the MESH is scaled in Y to
     flatten it — scaling the mesh after baking the rotation keeps the facets
     flat instead of shearing them. */
  const shell = (r, len, mat, name, flat) => {
    const geo = new T.CylinderGeometry(r, r, len, FACETS, 1, true);
    geo.rotateX(Math.PI / 2);
    const m = new T.Mesh(geo, mat);
    m.name = name; m.castShadow = m.receiveShadow = true;
    m.scale.set(1, flat, 1);
    m.position.set(0, yc, 0);
    return m;
  };
  st.add(shell(Rx, L, matHull, 'shellOuter', Ry / Rx));
  st.add(shell(Rx - 1.2, L * 0.998, matPanel, 'shellInner', Ry / Rx));

  /* End faces are FLUSH with the facets. Four rectangular plates spanning
     2Rx x 2Ry left square corners standing proud of the prism's walls, so the
     forward face is built as a ten-plate ring on the shell's own facet chords —
     each plate's width and angle come from the two shell vertices it spans, so
     it cannot drift from the hull it closes. */
  const facetVert = a => new T.Vector2(Rx * Math.sin(a), Ry * Math.cos(a));
  const facetRing = (k, zAt, depth, mat, tag) => {
    for (let f = 0; f < FACETS; f++) {
      const v0 = facetVert((f / FACETS) * Math.PI * 2);
      const v1 = facetVert(((f + 1) / FACETS) * Math.PI * 2);
      const mid = v0.clone().add(v1).multiplyScalar(0.5);
      const t = v1.clone().sub(v0);
      const plate = box(t.length(), mid.length() * (1 - k), depth, mat, tag + f);
      const c = mid.clone().multiplyScalar((1 + k) / 2);
      plate.position.set(c.x, yc + c.y, zAt);
      plate.rotation.z = Math.atan2(t.y, t.x);
      st.add(plate);
    }
  };
  [1, -1].forEach((zs, i) => {
    if (zs > 0) {
      const sw = big.w + 2.4, sh = big.h + 2.0;
      const k = 0.55;
      facetRing(k, zs * (L / 2 - 0.5), 1.0, matDeep, 'endPlate');
      /* Filler frame closing the ring's inner opening down to the slot. Sized
         to overlap the ring's inner edge rather than meet it, so no sliver of
         the bay shows through at the diagonals. */
      const fx = Rx * inset0 * 0.72, fy = Ry * inset0 * 0.72;
      [[0, (fy + sh / 2) / 2, fx * 2, fy - sh / 2], [0, -(fy + sh / 2) / 2, fx * 2, fy - sh / 2],
       [(fx + sw / 2) / 2, 0, fx - sw / 2, sh], [-(fx + sw / 2) / 2, 0, fx - sw / 2, sh]].forEach((p, kk) => {
        const plate = box(p[2], p[3], 1.0, matDeep, 'endFrame' + kk);
        plate.position.set(p[0], yc + p[1], zs * (L / 2 - 0.5));
        st.add(plate);
      });
      // hazard striping around the slot's sill
      const sill = new T.Group(); sill.position.set(0, yc - sh / 2 - 0.1, zs * (L / 2 + 0.05));
      cautionRun(sill, sw, 0.14, 'x', 'slotCaution');
      st.add(sill);
    } else {
      /* Aft cap: a closed ten-gon disc on the same cross-section, so the tail
         reads as the hull ending rather than a slab bolted across it. */
      const geo = new T.CylinderGeometry(Rx, Rx, 1.0, FACETS, 1, false);
      geo.rotateX(Math.PI / 2);
      const cap = new T.Mesh(geo, matDeep);
      cap.name = 'endCapAft'; cap.castShadow = cap.receiveShadow = true;
      cap.scale.set(1, Ry / Rx, 1);
      cap.position.set(0, yc, zs * (L / 2 - 0.5));
      st.add(cap);
    }
    // approach lighting around the end face, on the facet chords
    for (let k = 0; k < FACETS; k++) {
      const ang = ((k + 0.5) / FACETS) * Math.PI * 2;
      const lamp = box(0.5, 0.5, 0.3, k % 3 === 0 ? matBeacon : matLit, 'mouthLamp' + i + '_' + k);
      lamp.position.set(Math.sin(ang) * Rx * inset0 * 0.94, yc + Math.cos(ang) * Ry * inset0 * 0.94, zs * (L / 2 - 0.1));
      st.add(lamp);
    }
  });

  /* THE SLOT: one heavy aperture, centred on the forward face. Everything
     berths through here, so it takes the L envelope. */
  const gate = berth('field', big.w, big.h, big.d, 'berthL');
  berthInterior(gate, big.w, big.h, big.d, rand, 'berthL');
  gate.position.set(0, yc, zNose);
  st.add(gate);

  /* Receiving bay walls: a box behind the slot, so the hull comes to rest in a
     room rather than in the open bore. Plates, not a solid, so it is hollow. */
  const bayZ = zNose - bayD / 2;
  const bw = big.w + 2.2, bh = big.h + 1.6;
  [[0, bh / 2, bw + 0.8, 0.4], [0, -bh / 2, bw + 0.8, 0.4]].forEach((p, k) => {
    const pl = box(p[2], p[3], bayD, matPanel, 'bayShell' + k);
    pl.position.set(p[0], yc + p[1], bayZ); st.add(pl);
  });
  [-1, 1].forEach(sd => {
    const wall = box(0.4, bh, bayD, matPanel, 'bayWall' + (sd < 0 ? 'L' : 'R'));
    wall.position.set(sd * (bw / 2 + 0.2), yc, bayZ); st.add(wall);
    const strip = box(0.1, 0.1, bayD * 0.9, matLit, 'bayLight' + (sd < 0 ? 'L' : 'R'));
    strip.position.set(sd * (bw / 2 - 0.05), yc + bh * 0.34, bayZ); st.add(strip);
  });

  /* LIFT: drops from the bay's floor to the hangar deck, inside the shell.
     Named to the same contract the other patterns use so the game layer drives
     every station's lift identically. */
  const liftZ = zNose - big.d - 1.2;          // directly inboard of the inner gate
  const deckY = hangCy - hangH / 2 + 0.5;
  const bayFloorY = yc - big.h / 2 + 0.4;
  const shaftH = bayFloorY - deckY;
  /* Shaft spans the travel and reaches the inner gate it serves, so the lift is
     demonstrably connected to the airlock rather than parked near it. */
  const shaft = box(big.w + 1.6, shaftH, big.d * 0.9, matHull, 'transferLiftShaft');
  shaft.position.set(0, deckY + shaftH / 2, liftZ); st.add(shaft);
  /* Car modelled at its IDLE position, down at the deck — every moving part in
     this project is a static mesh at its stowed pose for the game layer to
     drive, and the deck is where the run inboard begins. */
  const carY = deckY + 0.3;
  const car = box(big.w + 1.0, 0.4, big.d + 1.0, matPanel, 'transferLiftCar');
  car.position.set(0, carY, liftZ); st.add(car);
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
    const gl = box(0.3, shaftH, 0.3, matEngine, 'liftGuide' + (sx < 0 ? 'L' : 'R') + (sz < 0 ? 'A' : 'F'));
    gl.position.set(sx * (big.w / 2 + 0.7), deckY + shaftH / 2, liftZ + sz * (big.d / 2 + 0.7));
    st.add(gl);
  }));
  // striping on the well's outboard lip, clear of the car's travel and of the
  // route: decor in the flight path is this project's most repeated mistake
  [-1, 1].forEach(sd => {
    const lip = new T.Group();
    lip.position.set(sd * (big.w / 2 + 1.1), deckY + 0.1, liftZ);
    lip.rotation.y = Math.PI / 2;
    cautionRun(lip, big.d * 0.9, 0.14, 'x', 'liftWellCaution' + (sd < 0 ? 'L' : 'R'));
    st.add(lip);
  });

  /* HANGAR, inside the hull. internalHall() builds it hollow from wall plates
     and dresses it — stands, gantry crane, hoardings, lighting, clutter. */
  const hangar = internalHall(hangW, hangH, hangD, 'hall', rand, stands);
  const hangZ = -zNose + hangD / 2 + 2.0;
  hangar.position.set(0, hangCy, hangZ);
  hangar.rotation.y = Math.PI;               // mouth faces forward, toward the lift
  st.add(hangar);

  /* Transfer run from the lift car aft into the hangar mouth, along the deck. */
  const from = new T.Vector3(0, carY + 0.3, liftZ);
  const to = new T.Vector3(0, deckY + 0.2, hangZ + hangD / 2);
  st.add(transferLine(from, to, big.w * 1.15, 'transferMain', rand));
  /* Corridor lighting from the well aft to the hangar mouth, plus the bay the
     hull first comes to rest in. Held OFF-AXIS: hung on the centreline they sat
     squarely in the lift's descent column and the route check caught them —
     lighting the path must not obstruct it. */
  const lampX = big.w / 2 + 1.4;
  for (let i = 0; i < 4; i++) {
    const z = liftZ + (to.z - liftZ) * ((i + 0.5) / 4);
    interiorLamp(st, (i % 2 ? 1 : -1) * lampX, deckY + 4.6, z, 'corridorLamp' + i,
      { w: 1.4, intensity: 2.4, distance: 30 });
  }
  [0.3, 0.72].forEach((f, i) => {
    interiorLamp(st, 0, yc + bh / 2 - 0.5, zNose - bayD * f, 'bayLamp' + i,
      { w: big.w * 0.5, intensity: 2.2, distance: 26 });
  });
  [-1, 1].forEach((sd, i) => {
    interiorLamp(st, sd * lampX, bayFloorY - 1.2, liftZ, 'liftWellLamp' + i,
      { w: 1.0, intensity: 2.0, distance: 24 });
  });

  /* Screening wall: hides the station's plumbing from the deck and the bay, so
     what the player sees from inside is finished surfaces. Set outboard of the
     route, flanking the lift well. */
  [-1, 1].forEach(sd => {
    const scr = box(0.5, Ry * 1.1, liftZoneD + hangD * 0.5, matPanel, 'screenWall' + (sd < 0 ? 'L' : 'R'));
    scr.position.set(sd * (hangW / 2 + 1.4), deckY + Ry * 0.55, liftZ - (liftZoneD + hangD * 0.5) / 2 + liftZoneD / 2);
    st.add(scr);
    for (let i = 0; i < 6; i++) {
      const p = box(0.1, 0.3, 0.5, rand() > 0.4 ? matLit : matDark, 'screenPort' + (sd < 0 ? 'L' : 'R') + i);
      p.position.set(sd * (hangW / 2 + 1.14), deckY + 1.0 + rand() * Ry * 0.8, liftZ - rand() * hangD * 0.5);
      st.add(p);
    }
  });
  // deck plating the route runs on
  const deck = box(hangW + 2.0, 0.4, liftZoneD + hangD + 4.0, matPanel, 'transferDeck');
  deck.position.set(0, deckY - 0.2, liftZ - (liftZoneD + hangD + 4.0) / 2 + liftZoneD / 2);
  st.add(deck);

  // ground cradle
  [-1, 1].forEach(zs => {
    const saddle = box(Rx * 1.1, 1.2, 3.2, matEngine, 'groundSaddle' + (zs < 0 ? 'A' : 'F'));
    saddle.position.set(0, 0.6, zs * L * 0.3); st.add(saddle);
    const arc = box(Rx * 0.5, 2.0, 2.8, matPanel, 'cradleArc' + (zs < 0 ? 'A' : 'F'));
    arc.position.set(0, 1.6, zs * L * 0.3); st.add(arc);
  });

  // billboard on the flank, and exterior dressing
  const bb = billboard('billboard', 9.0, 2.6, label);
  bb.position.set(0, yc + Ry - 1.6, zNose - 0.4);
  st.add(bb);
  /* Clutter snapped to FACET CENTRES and sunk in. On a prism the flat faces sit
     at cos(pi/N) of the circumscribed radius, so a piece placed by raw radius
     either floats off the panel or ends up INSIDE the hull — this clutter was
     briefly sitting in the docking route for exactly that reason. */
  const inset = Math.cos(Math.PI / FACETS);
  /* Facet choice skips the two lowest panels. They face the hardstand and are
     never seen, and at this cross-section they sit at the same height as the
     transfer run inside — exterior clutter there lands in the docking route. */
  const skinFacet = () => { const f = Math.floor(rand() * (FACETS - 2)); return f >= FACETS / 2 - 1 ? f + 2 : f; };
  for (let i = 0; i < 34; i++) {
    const ang = ((skinFacet() + 0.5) / FACETS) * Math.PI * 2;
    const s2 = 0.3 + rand() * 0.8;
    const g = box(s2, s2 * (0.6 + rand()), 0.4, rand() > 0.5 ? matPanel : matEngine, 'skinGreeble' + i);
    g.position.set(Math.sin(ang) * (Rx * inset + 0.12), yc + Math.cos(ang) * (Ry * inset + 0.12), (rand() - 0.5) * L * 0.9);
    g.rotation.z = -ang; st.add(g);
  }
  for (let i = 0; i < 22; i++) {
    const ang = ((skinFacet() + 0.5) / FACETS) * Math.PI * 2;
    const p = box(0.6, 0.34, 0.12, rand() > 0.35 ? matLit : matDark, 'skinPort' + i);
    p.position.set(Math.sin(ang) * (Rx * inset + 0.04), yc + Math.cos(ang) * (Ry * inset + 0.04), (rand() - 0.5) * L * 0.85);
    p.rotation.z = -ang; st.add(p);
  }
  const mast = box(0.24, 3.4, 0.24, matEngine, 'mastAntenna');
  mast.position.set(Rx * 0.3, yc + Ry + 1.4, -L * 0.2); st.add(mast);
  const mastBeacon = box(0.34, 0.34, 0.34, matBeacon, 'mastBeacon');
  mastBeacon.position.set(Rx * 0.3, yc + Ry + 3.2, -L * 0.2); st.add(mastBeacon);

  return finish(st, 'cylinderStation', label);
}

/* ---------- DOOR STATE ----------
 * Every sliding leaf carries both of its poses in userData.gate, recorded by
 * berth() from that berth's own dimensions. This is the ONLY entry point the
 * game layer needs: 0 is fully stowed (the pose everything is modelled and
 * exported in), 1 is sealed. Nothing here knows which pattern it is driving.
 *
 * Doors are per-BERTH so a station can hold one bay open while the rest stay
 * shut, which is what the "open station doors" request actually asks for. */
/* ================= NAVY FACTION REFIT =================
 * Navy is orthogonal to role: every pattern gets a Navy variant, and the
 * baseline Navy station is a PATROL BASE. It reuses the civil silhouette — an
 * armoured spine still reads as a spine — so this is a refit pass over a built
 * station rather than four more builders.
 *
 * Everything mounted here goes on a host mesh's TOP face, found from that
 * host's measured bounds. Berths open horizontally on every pattern, so the
 * top is the one face guaranteed clear of an approach corridor; mounting on
 * flanks put turrets in the corridor on the first attempt.
 */
const matArmour = new T.MeshStandardMaterial({ color: 0x4b5259, roughness: 0.85, metalness: 0.3, name: 'navyArmour' });
const matNavySign = new T.MeshStandardMaterial({ color: 0x9fb4c4, emissive: 0x6f8496, emissiveIntensity: 0.5, roughness: 0.6, name: 'navySignage' });
const matNavyTrim = new T.MeshStandardMaterial({ color: 0x3c444c, roughness: 0.8, metalness: 0.25, name: 'navyTrim' });

/* The biggest structural masses, which is what armour and mounts attach to.
 *
 * Selected by MEASURED SIZE with a blocklist, not by a name whitelist, and
 * accepting cylinders as well as boxes. The whitelist version silently did
 * nothing on two of six patterns: the cylinder station's only real masses are
 * shellOuter/shellInner, both CylinderGeometry, and the comet's box masses are
 * named cometTowerShaft and hangarSMFloor, neither of which an ^-anchored list
 * of civil part names can match. A Navy cylinder and a Navy comet came out as
 * civil stations with the hoardings recoloured, while every check stayed green
 * because nothing asserted that a Navy station carries navy hardware.
 * checkNavyRefit in station-tests.js now does.
 */
/* ^hall is excluded deliberately: the internal hall is a separate connected
   component by design and checkHallSeparation asserts zero overlap between
   hall meshes and everything else, so armouring it breaks its own invariant. */
const NOT_STRUCTURE = /(^hall|^transfer|Door|Leaf|Blast|Pocket|House|Rail|Greeble|Lamp|Light|Fixture|Ad|Decal|Port$|Port\d|Caution|Chevron|Marker|Stand|Crate|Clamp|Number|Outline|Glyph|billboard|Beacon|Nav|Field|Throat|Seal|Gate|Roller|Bed$|navy|Tree|Shrub|Crop|Fruit|Glaz|Strut|Hub\d|Soil|Ground|Terrace|Kerb|Drum|Tank|Pipe|Mast|Dish|Window|Sill|Jamb|Lintel|Emitter)/;

function primaryMasses(st, n) {
  const out = [];
  st.traverse(m => {
    if (!m.isMesh || !m.geometry || NOT_STRUCTURE.test(m.name)) return;
    const p = m.geometry.parameters;
    if (!p) return;
    if (m.geometry.type === 'BoxGeometry') {
      /* A host must be a MASS, not a plate. transferDeck is 18 x 0.4 x 41 — a
         floor running under the internal hall — so a belt scaled to it swept
         straight through the hall and broke its separation invariant. Anything
         whose thinnest dimension is under 8% of its longest is a deck, a wall
         plate or a frame, and armour does not go on those. */
      const lo = Math.min(p.width, p.height, p.depth);
      const hi = Math.max(p.width, p.height, p.depth);
      if (lo / hi < 0.08) return;
      out.push({ mesh: m, kind: 'box', w: p.width, h: p.height, d: p.depth,
        vol: p.width * p.height * p.depth });
    } else if (m.geometry.type === 'CylinderGeometry') {
      const r = Math.max(p.radiusTop, p.radiusBottom);
      if (r < 1.2 || p.height < 1.2) return;          // pipes and posts are not masses
      out.push({ mesh: m, kind: 'cyl', r, h: p.height, w: r * 2, d: r * 2,
        vol: Math.PI * r * r * p.height });
    }
  });
  out.sort((a, b) => b.vol - a.vol);
  return out.slice(0, n);
}

/* A mount whose local +Y points OUT of the host's surface, so one assembly
 * serves a flat keel and a curved drum alike. u runs along the host's main
 * axis, v across it (or around it, on a cylinder); both in -0.5..0.5.
 *
 * The mount is placed with the host's world transform BAKED IN and parented to
 * the station, NOT to the host mesh. Parenting to the host looked tidier and
 * broke two existing checks at once: Box3.setFromObject includes children, so
 * every host's measured bounds grew to swallow its own armour — the cylinder's
 * hall floor then read as containing its own stand outlines — and nothing
 * stopped a mount on the underside of a rotated tube from hanging below the
 * landing legs, which cost the cradle its grounding.
 *
 * Candidate bearings are also tried and the most UPWARD-facing one wins, so
 * turrets sit on top of a drum rather than underneath it. */
function surfaceMount(station, h, u, v, name) {
  const UP = new T.Vector3(0, 1, 0);
  const local = new T.Matrix4();
  const pos = new T.Vector3(), quat = new T.Quaternion();

  if (h.kind === 'cyl') {
    let best = null;
    for (let k = 0; k < 8; k++) {
      const a = (v * Math.PI * 2) + k * Math.PI / 4;
      const radial = new T.Vector3(Math.sin(a), 0, Math.cos(a));
      const q = new T.Quaternion().setFromUnitVectors(UP, radial);
      /* how upward does this bearing point once the host's rotation applies? */
      const worldUp = radial.clone().applyQuaternion(
        new T.Quaternion().setFromRotationMatrix(h.mesh.matrixWorld));
      if (!best || worldUp.y > best.score) {
        best = { score: worldUp.y, pos: radial.clone().multiplyScalar(h.r * 0.98)
          .setY(u * h.h * 0.7).setX(Math.sin(a) * h.r * 0.98).setZ(Math.cos(a) * h.r * 0.98), quat: q };
      }
    }
    pos.copy(best.pos); quat.copy(best.quat);
  } else {
    pos.set(v * h.w * 0.6, h.h / 2, u * h.d * 0.6);
  }
  local.compose(pos, quat, new T.Vector3(1, 1, 1));

  h.mesh.updateMatrixWorld(true);
  station.updateMatrixWorld(true);
  const world = new T.Matrix4().multiplyMatrices(h.mesh.matrixWorld, local);
  const stationLocal = new T.Matrix4()
    .multiplyMatrices(new T.Matrix4().copy(station.matrixWorld).invert(), world);
  const g = new T.Group();
  g.name = name;
  g.applyMatrix4(stationLocal);
  station.add(g);
  return g;
}

function hostFrame(station, h, name) {
  h.mesh.updateMatrixWorld(true);
  station.updateMatrixWorld(true);
  const g = new T.Group();
  g.name = name;
  g.applyMatrix4(new T.Matrix4().multiplyMatrices(
    new T.Matrix4().copy(station.matrixWorld).invert(), h.mesh.matrixWorld));
  station.add(g);
  return g;
}

/* Turn each turret to a bearing whose barrels are clear of structure. Twelve
 * candidates, two rays each along the muzzle line; first clear bearing wins,
 * otherwise the least obstructed. */
function aimTurretsClear(station, rand) {
  const yawGroups = [];
  station.traverse(n => { if (/^navyTurretYaw/.test(n.name)) yawGroups.push(n); });
  if (!yawGroups.length) return;
  const rc = new T.Raycaster();
  const REACH = 2.9;                       // barrel offset 1.0 + half length 1.2 + margin

  yawGroups.forEach(yg => {
    const own = new Set();
    yg.traverse(x => own.add(x));
    const targets = [];
    station.traverse(x => { if (x.isMesh && !own.has(x)) targets.push(x); });
    /* The sweep STARTS at a seeded offset per turret. Starting every sweep at
       k = 0 and breaking on the first clear bearing collapsed every gun on
       four patterns to yaw 0 — bearing 0 is clear almost everywhere, so
       "first clear wins" is just "always the default", and eight identical
       bearings read as hardware whose rotation was never set. Offsetting the
       start keeps the clearance guarantee and restores the variety the
       previous random bearing had. */
    const offset = Math.floor(rand() * 12);
    let best = null;
    for (let j = 0; j < 12; j++) {
      const k = (j + offset) % 12;
      const yaw = (k / 12) * Math.PI * 2;
      yg.rotation.y = yaw;
      yg.updateMatrixWorld(true);
      const origin = new T.Vector3().setFromMatrixPosition(yg.matrixWorld);
      const q = new T.Quaternion().setFromRotationMatrix(yg.matrixWorld);
      const fwd = new T.Vector3(0, 0, 1).applyQuaternion(q).normalize();
      const side = new T.Vector3(1, 0, 0).applyQuaternion(q).normalize();
      let hits = 0;
      [-0.32, 0.32].forEach(off => {
        rc.set(origin.clone().addScaledVector(side, off).addScaledVector(fwd, 0.5), fwd);
        rc.far = REACH;
        hits += rc.intersectObjects(targets, false).length;
      });
      if (hits === 0) { best = { yaw, hits: 0 }; break; }
      if (!best || hits < best.hits) best = { yaw, hits };
    }
    yg.rotation.y = best.yaw;
    yg.updateMatrixWorld(true);
    yg.userData.muzzleObstructions = best.hits;
    /* The bearing this sweep proved clear is the gun's REST, and it is recorded
       rather than left implicit in the transform — a fire-control layer has to
       be able to return a turret to a bearing known not to be pointing into the
       station's own mast farm. mode 'aim' so tickScanners leaves it alone:
       idly sweeping a gun through its own structure is precisely what the
       clearance sweep exists to prevent. */
    yg.userData.scan = {
      mode: 'aim',
      restYaw: best.yaw,
      traverseDeg: [-180, 180],
      obstructedAtRest: best.hits,
      activeWhen: 'threat'
    };
  });
}

export function navyRefit(station, size = 'M') {
  const rand = seedFrom((station.userData.label || 'NV') + size + 'navy');
  /* The internal hall is a separate connected component by design, and
     checkHallSeparation asserts zero overlap between hall meshes and anything
     else. Rather than reason about which host sits near it — the cylinder's
     drum encloses it, which is not obvious from any name — measure the hall
     once and drop anything the refit adds that lands in it. */
  /* PER-MESH, not a union box. A single bbox around 74 hall meshes is a
     region far larger than the hall — on the cylinder it covered most of the
     drum, so the guard discarded every turret candidate and the pattern came
     out with no guns at all. Same bounding-box-lies error as ever, this time
     inside a guard rather than a placement. */
  const hallBoxes = [];
  station.updateMatrixWorld(true);
  station.traverse(x => {
    if (x.isMesh && /^hall/.test(x.name)) hallBoxes.push(new T.Box3().setFromObject(x));
  });
  const dropIfInHall = grp => {
    if (!hallBoxes.length || !grp || !grp.parent) return false;
    grp.updateMatrixWorld(true);
    const b = new T.Box3().setFromObject(grp);
    if (b.isEmpty()) return false;
    if (!hallBoxes.some(hb => hb.intersectsBox(b))) return false;
    grp.parent.remove(grp);
    return true;
  };
  const big = size === 'L', small = size === 'S';
  station.updateMatrixWorld(true);
  const corridors = [];
  station.traverse(n => {
    if (!n.userData || !n.userData.airlock) return;
    let throat = null;
    n.traverse(x => { if (/Throat$/.test(x.name)) throat = x; });
    const pp = throat && throat.geometry.parameters;
    n.updateMatrixWorld(true);
    corridors.push({
      pos: new T.Vector3().setFromMatrixPosition(n.matrixWorld),
      dir: new T.Vector3(0, 0, 1).applyQuaternion(
        new T.Quaternion().setFromRotationMatrix(n.matrixWorld)).normalize(),
      rad: (pp ? Math.max(pp.width, pp.height) : BERTH.lg.w) * 0.75,
      len: (pp ? pp.depth : BERTH.lg.d) * 1.6
    });
  });
  const inApproach = wp => corridors.some(c => {
    const rel = wp.clone().sub(c.pos);
    const along = rel.dot(c.dir);
    if (along < -1.0 || along > c.len) return false;
    return rel.clone().sub(c.dir.clone().multiplyScalar(along)).length() < c.rad;
  });


  /* Does anything this group occupies stand in a berth's approach?
     A mount POINT clear of every corridor is not the same as a clear mount: the
     mast farm's masts run up to 7m off their deck, and on the ring at L a farm
     whose deck was clear put navyDish4 1.3 into berthL's corridor. So march each
     corridor's own axis and ask whether the group's box contains any of it. */
  const foulsApproach = grp => {
    if (!grp) return false;
    grp.updateMatrixWorld(true);
    const b = new T.Box3().setFromObject(grp);
    if (b.isEmpty()) return false;
    return corridors.some(c => {
      const step = Math.max(0.5, c.rad * 0.5);
      for (let d = -1.0; d <= c.len; d += step) {
        if (b.distanceToPoint(c.pos.clone().addScaledVector(c.dir, d)) < c.rad) return true;
      }
      return false;
    });
  };

  /* Mount something bulky on the first surface coordinate that clears both the
     hall and every approach. Falls back to the first candidate so a pattern that
     cannot satisfy it still gets its hardware — checkNavyRefit requires the
     masts to exist, and a silently missing mast farm is the failure this whole
     refit already had once. */
  const clearMount = (host, cands, ext, name) => {
    let first = null;
    for (const [u, v] of cands) {
      const m = surfaceMount(station, host, u, v, name);
      m.updateMatrixWorld(true);
      const p = new T.Vector3().setFromMatrixPosition(m.matrixWorld);
      const probe = new T.Box3().setFromCenterAndSize(
        p.clone().setY(p.y + ext.y / 2), new T.Vector3(ext.x, ext.y, ext.z));
      const fouls = corridors.some(c => {
        const step = Math.max(0.5, c.rad * 0.5);
        for (let d = -1.0; d <= c.len; d += step) {
          if (probe.distanceToPoint(c.pos.clone().addScaledVector(c.dir, d)) < c.rad) return true;
        }
        return false;
      }) || hallBoxes.some(hb => hb.intersectsBox(probe));
      if (!fouls) { if (first && first !== m) first.parent && first.parent.remove(first); return m; }
      if (!first) first = m; else if (m.parent) m.parent.remove(m);
    }
    return first;
  };


  /* 1. No advertising anywhere, and mustard ONLY on what moves.
     The rule was stated as an allowlist, so implement it as one: everything
     wearing the accent is recoloured unless it is a moving part. Filtering by
     a blocklist of names left the accent on ~30 threshold markers, the service
     drums and the field emitter. */
  const MOVES = /(DoorChevron|DoorEdge|Chevron|Ram$|Ram[LR]|Hook|Hoist|Bridge|CarMark|liftGuide|Hinge)/;
  station.traverse(m => {
    if (!m.isMesh || !m.material) return;
    const mn = m.material.name;
    if (mn === 'adOrange' || mn === 'adGreen') m.material = matNavySign;
    if (mn === 'stationAccent' && !MOVES.test(m.name)) m.material = matNavyTrim;
  });

  const hosts = primaryMasses(station, 6);

  /* 2. Armour, hugging each host in its own local frame. */
  hosts.forEach((h, i) => {
    /* Centred on the host, as a SIBLING with the host's transform baked in. */
    const mnt = hostFrame(station, h, 'navyArmourFrame' + i);
    if (h.kind === 'cyl') {
      const belt = cyl(h.r * 1.03, h.r * 1.03, h.h * 0.3, matArmour, 'navyArmourBelt' + i, 12, true);
      belt.position.y = h.h * 0.08; mnt.add(belt);
      for (let k = 0; k < 3; k++) {
        const ring = cyl(h.r * 1.05, h.r * 1.05, 0.3, matNavyTrim, 'navyArmourRib' + i + '_' + k, 12, true);
        ring.position.y = h.h * (0.3 - k * 0.3); mnt.add(ring);
      }
      dropIfInHall(mnt);
    } else {
      const belt = box(h.w * 1.02, h.h * 0.34, h.d * 1.02, matArmour, 'navyArmourBelt' + i);
      belt.position.set(0, h.h * 0.1, 0); mnt.add(belt);
      for (let k = 0; k < 3; k++) {
        const rib = box(h.w * 1.03, 0.28, h.d * 0.1, matNavyTrim, 'navyArmourRib' + i + '_' + k);
        rib.position.set(0, h.h * (0.24 - k * 0.2), (k - 1) * h.d * 0.28); mnt.add(rib);
      }
      dropIfInHall(mnt);
    }
  });

  if (hosts.length) {
    /* 4. Sensor and comms mast farm. */
    /* Candidates, not a fixed 0.22/0.0. The masts are the tallest thing the
       refit adds, so they are the most likely to reach into a corridor. */
    const fm = clearMount(hosts[0],
      [[0.22, 0.0], [-0.22, 0.0], [0.0, 0.28], [0.0, -0.28], [0.34, 0.22], [-0.34, -0.22]],
      new T.Vector3(5.4, 8.0, 3.6), 'navyMastFarm');
    const farm = box(5.0, 0.6, 3.2, matNavyTrim, 'navyMastFarmDeck');
    farm.position.y = 0.2; fm.add(farm);
    let tallest = { x: 0, top: 0 };
    for (let i = 0; i < 5; i++) {
      const mh = 3.0 + rand() * 4.0;
      const mast = cyl(0.11, 0.16, mh, matEngine, 'navyMast' + i, 6);
      mast.position.set((i - 2) * 1.0, 0.4 + mh / 2, 0); fm.add(mast);
      if (0.4 + mh > tallest.top) tallest = { x: mast.position.x, top: 0.4 + mh };
      if (i % 2 === 0) {
        const dish = cyl(0.9, 0.2, 0.42, matPanel, 'navyDish' + i, 8);
        dish.position.set(mast.position.x, 0.4 + mh - 0.2, 0);
        dish.rotation.x = 0.5 + rand() * 0.4; fm.add(dish);
      } else {
        const arr = box(0.16, 1.2, 0.85, matPanel, 'navyArray' + i);
        arr.position.set(mast.position.x, 0.4 + mh - 0.5, 0); fm.add(arr);
      }
    }
    /* Seated 0.1 INTO the mast head — a fixed 7.6 sat above every mast shorter
       than 7.2, which is most of them, so it was an island on every pattern. */
    const fLamp = box(0.26, 0.26, 0.26, matBeacon, 'navyMastBeacon');
    fLamp.position.set(tallest.x, tallest.top - 0.1, 0); fm.add(fLamp);
    dropIfInHall(fm);

    /* 5. Muster deck and marine barracks. */
    const h1 = hosts[1] || hosts[0];
    const bm = clearMount(h1,
      [[-0.24, 0.0], [0.24, 0.0], [0.0, -0.3], [0.0, 0.3], [-0.34, 0.24]],
      new T.Vector3(7.0, 4.2, 5.6), 'navyBarracksMount');
    const bw2 = big ? 9.0 : 7.0;
    const barracks = box(bw2, 3.2, 5.0, matHull, 'navyBarracks');
    barracks.position.y = 1.4; bm.add(barracks);
    const bRoof = box(bw2 * 1.04, 0.4, 5.2, matNavyTrim, 'navyBarracksRoof');
    bRoof.position.y = 3.1; bm.add(bRoof);
    for (let i = 0; i < 6; i++) {
      const p = box(bw2 / 9, 0.45, 0.08, rand() < 0.5 ? matLit : matDark, 'navyBarracksPort' + i);
      p.position.set((i - 2.5) * (bw2 / 6.5), 1.7, 2.55); bm.add(p);
    }
    const muster = box(bw2 + 1.6, 0.3, 4.6, matNavyTrim, 'navyMusterDeck');
    muster.position.set(0, 0.05, 4.9); bm.add(muster);
    for (let i = 0; i < 4; i++) {
      const mk = box(1.2, 0.05, 1.2, matNavySign, 'navyMusterMark' + i);
      mk.position.set((i - 1.5) * 1.8, 0.22, 4.9); bm.add(mk);
    }
    dropIfInHall(bm);
  }

  /* 3. Turret sponsons.
   *
   * THE RULE: a turret's flat base must sit FLUSH with a flat block, and where
   * the structure has no flat face to offer, the turret brings its own block —
   * placed on the corners of the dock.
   *
   * Placement is a greedy pass over MANY candidate positions with a shrinking
   * spacing requirement, not a short list with a fixed one. Eight candidates
   * against a 5.0 exclusion radius starved three patterns down to one or two
   * guns; the candidates have to outnumber the guns by a wide margin for a
   * spacing rule to be satisfiable at all.
   *
   * Rejections, in order: a berth's approach corridor (a cradle sponson landed
   * in the heavy berth's mouth), crowding anything already placed (two comet
   * turrets came out 0.31 apart, so no bearing could clear), and the internal
   * hall. Bearings are chosen afterwards by aimTurretsClear. */
  const nTur = small ? 4 : big ? 8 : 6;

  /* Every berth's approach: world mouth position, outward normal, and the
     length of hull it must admit. */
  /* A box host only counts if it can carry the block. */
  const BLOCK = 3.0;
  const boxHosts = hosts.filter(h => h.kind === 'box' && h.w >= BLOCK + 0.5 && h.d >= BLOCK + 0.5);

  const cands = [];
  boxHosts.forEach(h => {
    for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
      const u = -0.4 + a * 0.2, v = -0.4 + b * 0.2;
      if (Math.abs(u) < 0.15 && Math.abs(v) < 0.15) continue;     // keep the centre clear
      cands.push({ h, u, v });
    }
  });
  /* Corner positions ALWAYS come too, appended rather than used only as a
     fallback. The comet's one qualifying box host is a 3.8-wide tower shaft:
     it can physically carry one or two 3.0 blocks and no more, so with box
     candidates alone the L mark came out with two guns instead of eight. A
     host list and a corner ring together are what make the count reachable. */
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    cands.push({ ring: { fx: Math.cos(th) * 0.85, fz: Math.sin(th) * 0.85 } });
  }

  const down = new T.Vector3(0, -1, 0);
  const rcT = new T.Raycaster();
  const solids = [];
  station.traverse(x => { if (x.isMesh && !NOT_STRUCTURE.test(x.name) && !/^navy/.test(x.name)) solids.push(x); });
  station.updateMatrixWorld(true);
  const foot = new T.Box3().setFromObject(station);

  const taken = [];
  station.traverse(x => {
    if (x.isMesh && /^(navyBarracks|navyMastFarmDeck|navyMast\d|navyMusterDeck)/.test(x.name))
      taken.push(new T.Vector3().setFromMatrixPosition(x.matrixWorld));
  });

  let placed = 0;
  for (const minR of [5.0, 3.6, 2.4]) {
    for (const cd of cands) {
      if (placed >= nTur) break;
      if (cd.used) continue;
      let mnt = null;
      if (cd.h) {
        mnt = surfaceMount(station, cd.h, cd.u, cd.v, 'navyMount' + placed);
      } else {
        const wx = (foot.min.x + foot.max.x) / 2 + cd.ring.fx * (foot.max.x - foot.min.x) / 2;
        const wz = (foot.min.z + foot.max.z) / 2 + cd.ring.fz * (foot.max.z - foot.min.z) / 2;
        rcT.set(new T.Vector3(wx, foot.max.y + 5, wz), down);
        rcT.far = (foot.max.y - foot.min.y) + 10;
        const hit = rcT.intersectObjects(solids, false)[0];
        if (!hit) { cd.used = true; continue; }
        mnt = new T.Group();
        mnt.name = 'navyMount' + placed;
        station.add(mnt);
        mnt.position.copy(station.worldToLocal(hit.point.clone()));
      }
      mnt.updateMatrixWorld(true);
      const wp = new T.Vector3().setFromMatrixPosition(mnt.matrixWorld);
      if (inApproach(wp)) { mnt.parent.remove(mnt); cd.used = true; continue; }
      if (taken.some(tp => tp.distanceTo(wp) < minR)) { mnt.parent.remove(mnt); continue; }

      /* The block: embedded 0.35 into what it stands on, flat top clear. */
      const blkH = 1.4, embed = 0.35;
      const blk = box(BLOCK, blkH, BLOCK, matArmour, 'navyTurretBlock' + placed);
      blk.position.y = blkH / 2 - embed; mnt.add(blk);
      const top = blkH - embed;
      for (let k = 0; k < 4; k++) {
        const trim = box(BLOCK + 0.2, 0.18, 0.5, matNavyTrim, 'navyBlockTrim' + placed + '_' + k);
        trim.position.set(0, top - 0.2, (k - 1.5) * 0.85); mnt.add(trim);
      }
      /* Sponson base FLUSH with the block's top face. */
      const spH = 0.7, barbH = 0.7;
      const sponson = box(2.2, spH, 2.2, matArmour, 'navySponson' + placed);
      sponson.position.y = top + spH / 2; mnt.add(sponson);
      const barbette = cyl(0.8, 0.95, barbH, matNavyTrim, 'navyBarbette' + placed, 8);
      barbette.position.y = top + spH + barbH / 2 - 0.08; mnt.add(barbette);
      const yawGrp = new T.Group();
      yawGrp.name = 'navyTurretYaw' + placed;
      yawGrp.position.y = top + spH + barbH + 0.32;
      mnt.add(yawGrp);
      const turret = box(1.4, 0.8, 1.8, matArmour, 'navyTurret' + placed);
      yawGrp.add(turret);
      [-1, 1].forEach(sd => {
        const barrel = cyl(0.12, 0.14, 2.4, matEngine, 'navyBarrel' + placed + (sd < 0 ? 'L' : 'R'), 6);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(sd * 0.32, 0.1, 1.0);
        yawGrp.add(barrel);
      });

      if (dropIfInHall(mnt)) { cd.used = true; continue; }
      cd.used = true;
      taken.push(wp);
      placed++;
    }
    if (placed >= nTur) break;
  }

  /* 6. The L hangar becomes SECURE: its own inner blast door inboard of the
     berth's inner gate, on the same userData.gate contract as every other
     leaf, so setBerthDoors drives it with no new mechanism. */
  let heavy = null;
  station.traverse(n => { if (n.userData && n.userData.airlock && /^berthL/.test(n.name)) heavy = n; });
  if (heavy) {
    let throat = null;
    heavy.traverse(n => { if (/Throat$/.test(n.name)) throat = n; });
    const tp = throat && throat.geometry.parameters;
    const tw = tp ? tp.width : BERTH.lg.w;
    const th = tp ? tp.height : BERTH.lg.h;
    const td = tp ? tp.depth : BERTH.lg.d;
    const lw = tw / 2 - 0.05;
    const stow2 = tw / 2 + 0.14 + (lw + 0.8) / 2;
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'L' : 'R';
      const house = box(lw + 0.8, th + 0.9, 1.1, matArmour, 'berthLSecureHouse' + side);
      house.position.set(sd * stow2, 0, -td - 0.5); heavy.add(house);
      const leaf = box(lw, th, 0.42, matArmour, 'berthLSecureBlastDoor' + side);
      leaf.position.set(sd * stow2, 0, -td - 0.5);
      /* kind 'secure', NOT 'outer'. This is the whole reason the contract
         carries a kind: a patrol base holds its hangar sealed while the outer
         gate cycles, and "open the doors" must not mean opening this one too. */
      leaf.userData.gate = {
        kind: 'secure', axis: 'x',
        open: leaf.position.x, closed: sd * lw / 2
      };
      heavy.add(leaf);
      const edge = new T.Group();
      edge.position.set(sd * (-lw / 2 + 0.08), 0, -td - 0.28);
      edge.rotation.z = Math.PI / 2;
      cautionRun(edge, th * 0.92, 0.11, 'x', 'berthLSecureCaution' + side);
      heavy.add(edge);
    });
    heavy.userData.secure = { innerGate: 'SecureBlastDoor', requiresClearance: true };
  }

  /* Aim the guns LAST.
   *
   * The bearing used to be rand() * 2pi with nothing tested, and on the spine
   * and ring that put a turret's barrels inside the marine barracks — a muzzle
   * firing into the station's own accommodation, against the fleet's own
   * "no muzzle firing into the ship" invariant. It could not have been tested
   * at placement time either: the barracks is built after the turrets, so
   * there was nothing to raycast against yet. Hence a final pass, once every
   * navy piece is in place. */
  aimTurretsClear(station, rand);

  /* Re-ground: finish() levelled the civil build, and this pass adds geometry
     afterwards. Only ever shifts UP, so landing legs cannot end up floating. */
  station.updateMatrixWorld(true);
  const gb = new T.Box3().setFromObject(station);
  if (gb.min.y < -1e-4) station.position.y -= gb.min.y;
  station.updateMatrixWorld(true);

  station.userData.faction = 'navy';
  station.userData.navyRole = 'patrolBase';
  return station;
}

/* ---------------------------------------------------------------------------
 * THE MOVERS
 *
 * Nothing here self-animates. Every part that moves records BOTH of its poses
 * at build time, where the aperture's own dimensions are in scope, and a driver
 * below lerps between them. Poses derived at the call site are a second copy of
 * a layout decision, and a second copy is how they go wrong: when this project's
 * doors were last rewritten the poses were simply lost, and every door in it was
 * inert until something finally drove one.
 *
 * One dialect, three shapes:
 *
 *   userData.gate    = { kind, open, closed, axis }   translates along one axis
 *   userData.carrier = { from, to, idle, kind }       travels between two points
 *   userData.scan    = { mode, ... }                  turns about one
 *
 * `kind` is not decoration. A patrol base holds its secure hangar shut while the
 * outer gate cycles, which is what an airlock IS; without a kind, "open the
 * doors" means opening the vacuum straight into the hall.
 *
 * t is 0 at OPEN / stowed — the pose everything is modelled and exported in —
 * and 1 at SEALED. Carriers are 0 at `from`, 1 at `to`.
 * ------------------------------------------------------------------------- */

/* Drive every gate under `root`, or only those of one kind. Returns how many
   moved, so a caller can tell a station with no doors from one that ignored it. */
export function setGates(root, t, kind) {
  const k = Math.min(1, Math.max(0, t));
  let n = 0;
  root.traverse(o => {
    const g = o.userData && o.userData.gate;
    if (g && (!kind || g.kind === kind)) {
      o.position[g.axis || 'x'] = g.open + (g.closed - g.open) * k;
      n++;
    }
    /* A force field is a gate that does not slide: it holds atmosphere across an
       aperture a hull pushes straight through, so it is up exactly while that
       aperture is open. Struck at the halfway point rather than faded, because a
       half-transparent field behind half-shut doors reads as neither. */
    if (o.userData && o.userData.fieldGate) o.visible = k < 0.5;
  });
  if (root.userData) root.userData.gateState = k;
  return n;
}

/* Lifts, conveyors, traversers — anything whose motion is a straight run between
   two recorded points. A third stop, where one exists, rides in the block as its
   own named vector rather than being pretended into the run. */
export function setCarriers(root, t, kind) {
  const k = Math.min(1, Math.max(0, t));
  let n = 0;
  root.traverse(o => {
    const c = o.userData && o.userData.carrier;
    if (!c) return;
    if (kind && (c.kind || 'lift') !== kind) return;
    /* Componentwise, allocation-free. The per-frame path on this project's
       target machine already spends 25ms in the trajectory predictor; a driver
       that allocates two vectors per carrier per frame is not free. */
    o.position.set(
      c.from.x + (c.to.x - c.from.x) * k,
      c.from.y + (c.to.y - c.from.y) * k,
      c.from.z + (c.to.z - c.from.z) * k
    );
    n++;
  });
  return n;
}

/* Scanners and guns turn rather than travel, so they take a CLOCK, not a pose.
 * Sweeping to the limits and reversing is what a search set actually does, and
 * it is a pure function of time, so it stays exact across a time warp and across
 * a save — the same reason the station spin is.
 *
 * mode 'aim' is left alone: a turret rests at the bearing navyRefit proved is
 * clear of its own structure, and idly sweeping it would point it back into the
 * mast farm. Its rest is recorded so a fire-control layer can return it. */
export function tickScanners(root, seconds) {
  let n = 0;
  root.traverse(o => {
    const s = o.userData && o.userData.scan;
    if (!s || s.mode !== 'oscillate') return;
    const node = s.yawNode ? o.getObjectByName(s.yawNode) : o;
    if (!node) return;
    const [lo, hi] = s.yawRangeDeg || [-60, 60];
    const mid = ((lo + hi) / 2) * Math.PI / 180, half = ((hi - lo) / 2) * Math.PI / 180;
    const phase = (seconds % s.periodSec) / s.periodSec;
    node.rotation.y = mid + half * Math.sin(phase * Math.PI * 2);
    n++;
  });
  return n;
}

/* Everything drivable under `root`, so a caller can address one door instead of
   all of them, and so the tests can assert on the inventory rather than on names
   they would have to keep in step by hand. */
export function moversOf(root) {
  const out = { gates: [], carriers: [], scanners: [] };
  root.traverse(o => {
    if (!o.userData) return;
    if (o.userData.gate) out.gates.push(o);
    if (o.userData.carrier) out.carriers.push(o);
    if (o.userData.scan) out.scanners.push(o);
  });
  return out;
}

/* Kept because city.js, comet.js and both check pages call it. It is now a thin
   wrapper: one mechanism, one driver, and a name that already means something to
   every caller. It drives the OUTER gates only — a berth's secure inner door is
   not part of "open the bay". */
export function setBerthDoors(berth, t) {
  const k = Math.min(1, Math.max(0, t));
  setGates(berth, k, 'outer');
  setGates(berth, k, 'blast');
  if (berth.userData) berth.userData.doorState = k;
  return k;
}

/* Every berth on a station, keyed by name, so callers can address one bay. */
export function berthDoorsOf(station) {
  const out = {};
  station.traverse(n => {
    if (!n.isMesh && /Berth$|^berthSM|^berthL/i.test(n.name) && n.userData && n.userData.airlock)
      out[n.name] = n;
  });
  return out;
}

export function setStationDoors(station, t) {
  const bays = berthDoorsOf(station);
  Object.values(bays).forEach(b => setBerthDoors(b, t));
  return Object.keys(bays).length;
}

/* Shared kit for the planetside builders in city.js. The materials are
 * module-level singletons on purpose — exporting the same objects rather than
 * copies means recolouring here recolours ports and stations together, which is
 * the whole point of one palette. BERTH goes out too so surface stands are
 * sized from the measured fleet envelope instead of a second set of numbers. */
export const KIT = {
  T, box, cyl, seedFrom, cautionRun, billboard, interiorLamp, BERTH,
  // the drivers travel with the parts, so no family grows its own copy
  setGates, setCarriers, tickScanners, moversOf,
  // the one door mechanism, and the merge helpers the sites need
  toothedDoor, mergedMesh, mergeBoxes, cargoMat,
  berth, internalHall, transferLine, berthInterior, exteriorGreebles, finish,
  matHull, matPanel, matDeep, matAccent, matHazardY, matHazardK, matGlass,
  matLit, matDark, matField, matBeacon, matBoard, matBoardLit,
  matAdA, matAdB, matNavGreen, matNavRed, matEngine
};

/* Navy is a REFIT, not a fifth silhouette — an armoured spine still reads as a
 * spine — so the navy entries wrap the civil builders rather than duplicating
 * them. They are in the type table because a variant that exists only as an
 * exported function is a variant nothing can ask for: navyRefit shipped working
 * and every navy model on the drive had to be built by hand in the lab, which
 * is the same failure as a modelled ring that is converted, stored and then
 * silently never drawn. */
const navyOf = build => (label = 'NB-001', size = 'M') => navyRefit(build(label, size), size);

export const STATION_TYPES = {
  cylinder: { label: 'Cylinder', build: buildCylinderStation, prefix: 'OS-', digits: 3, faction: 'civil' },
  spine: { label: 'Spine', build: buildSpineStation, prefix: 'OS-', digits: 3, faction: 'civil' },
  ring: { label: 'Ring', build: buildRingStation, prefix: 'OS-', digits: 3, faction: 'civil' },
  cradle: { label: 'Cradle', build: buildCradleStation, prefix: 'OS-', digits: 3, faction: 'civil' },

  cylinderNavy: { label: 'Cylinder (Navy)', build: navyOf(buildCylinderStation), prefix: 'NB-', digits: 3, faction: 'navy', navyRole: 'patrolBase', civil: 'cylinder' },
  spineNavy: { label: 'Spine (Navy)', build: navyOf(buildSpineStation), prefix: 'NB-', digits: 3, faction: 'navy', navyRole: 'patrolBase', civil: 'spine' },
  ringNavy: { label: 'Ring (Navy)', build: navyOf(buildRingStation), prefix: 'NB-', digits: 3, faction: 'navy', navyRole: 'patrolBase', civil: 'ring' },
  cradleNavy: { label: 'Cradle (Navy)', build: navyOf(buildCradleStation), prefix: 'NB-', digits: 3, faction: 'navy', navyRole: 'patrolBase', civil: 'cradle' }
};

/* WHICH station a place gets, as a pure function of that place's own seed.
 *
 * Doctrine one: the same seed is the same universe. A navy base drawn at
 * random would look right for twenty minutes and then quietly stop being a
 * place — you would fly back and find a civil port where the patrol base was.
 * So this takes the seeded stream, never Math.random, and it takes its OWN
 * forked substream so that adding it does not consume a draw something else
 * was relying on and silently change every system.
 *
 * `navyChance` is deliberately a caller's policy rather than a constant here:
 * the generator knows a system's security, its faction and whether anyone
 * garrisons it, and this module knows none of that. Pass the probability in.
 * Sample the distribution before picking one — two gates in this project were
 * written from plausible numbers and excluded 100% of cases. */
export function stationTypeFor(baseRng, navyChance = 0) {
  const rand = baseRng.fork ? baseRng.fork('stationType') : baseRng;
  const civil = ['cylinder', 'spine', 'ring', 'cradle'];
  const pattern = civil[Math.floor(rand() * civil.length)];
  const navy = rand() < navyChance;
  return navy ? pattern + 'Navy' : pattern;
}

/* The civil patterns only, for callers that want to iterate silhouettes rather
   than variants — the check page and the exporter both do. */
export const CIVIL_TYPES = ['cylinder', 'spine', 'ring', 'cradle'];

/* PARTS is KIT under the other fork's name. The planetside sites were written
 * against a station.js that called this PARTS and shipped materials separately
 * as MATS; rather than edit every destructuring line in a 92KB file — and risk
 * the merge on a rename — both names resolve to the same objects. Same reason
 * setBerthDoors survived: one mechanism, and every caller keeps its own words. */
export const PARTS = KIT;
export const MATS = {
  hull: matHull, panel: matPanel, deep: matDeep, accent: matAccent,
  hazardY: matHazardY, hazardK: matHazardK, glass: matGlass,
  lit: matLit, dark: matDark, field: matField, beacon: matBeacon,
  board: matBoard, boardLit: matBoardLit, adA: matAdA, adB: matAdB,
  navGreen: matNavGreen, navRed: matNavRed, fitting: matEngine
};
export { CARGO_MATS };
