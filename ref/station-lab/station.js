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
      leaf.userData.door = { openX: leaf.position.x, closedX: sd * (w / 2 - bLeafW / 2) };
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
    const leafW = w / 2 - 0.04;
    const stow = w * 0.5 + leafW / 2 + 0.06;        // inner edge just past the jamb
    /* Each side gets a DOOR HOUSE: a structural volume that fully contains the
       pocket and the stowed leaf. Relying on the station's flanking block left
       leaves hanging in open space wherever that block was narrower than the
       stow offset — or absent entirely, as on the cylinder's bore-wall bays. */
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'L' : 'R';
      const house = box(leafW + 0.8, h + 0.8, 0.9, matHull, tag + 'DoorHouse' + side);
      house.position.set(sd * stow, 0, -0.3);
      grp.add(house);
      // same treatment as the heavy berths: fixed structure reads as wall
      for (let i = 0; i < 3; i++) {
        const groove = box(leafW + 0.5, 0.08, 0.06, matDeep, tag + 'HouseGroove' + side + i);
        groove.position.set(sd * stow, h * (0.3 - i * 0.3), 0.16);
        grp.add(groove);
      }
      const band = new T.Group();
      band.position.set(sd * stow, 0, 0.17);
      band.rotation.z = Math.PI / 2;
      cautionRun(band, h * 0.8, 0.12, 'x', tag + 'HouseBand' + side);
      grp.add(band);
    });
    /* Centre-opening and INTERMESHING: two telescopic leaves per side, on
       staggered planes so they nest as they run outboard. Closed, each side's
       pair covers half the aperture and the two halves meet on the centreline;
       stowed, all four sit inside their door houses. */
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'L' : 'R';
      const pocket = box(leafW + 0.34, h + 0.3, 0.62, matDeep, tag + 'DoorPocket' + side);
      pocket.position.set(sd * stow, 0, -0.3);
      grp.add(pocket);
      [0, 1].forEach(k => {
        // outer leaf slightly wider and further out; inner leaf nests behind it
        const lw = leafW * (k === 0 ? 1.0 : 0.86);
        const leaf = box(lw, h * (k === 0 ? 1.0 : 0.94), 0.16, k === 0 ? matPanel : matHull,
          tag + 'SlidingDoor' + side + (k + 1));
        leaf.position.set(sd * (stow + k * leafW * 0.07), 0, -0.16 - k * 0.18);
        /* Stowed and closed poses both recorded here. Closed, the outer leaf
           takes the outboard quarter and the inner leaf the inboard quarter, so
           the pair covers this side's half and the two sides meet on the
           centreline — derived from the leaf's own width, not a tuned offset. */
        leaf.userData.door = {
          openX: leaf.position.x,
          closedX: sd * (k === 0 ? w / 2 - lw / 2 : lw / 2)
        };
        grp.add(leaf);
        const chev = box(w * 0.1, 0.07, 0.03, matAccent, tag + 'DoorChevron' + side + (k + 1));
        chev.position.set(0, h * (0.2 - k * 0.12), 0.16);
        leaf.add(chev);
        /* Striping down the leaf's INBOARD edge — the one that closes against
           the opposing leaf, so the pilot can see what is about to meet what.
           An 'x' run turned upright keeps the chips tiling to whole numbers. */
        /* Chevron and edge striping are CHILDREN of the leaf, so they travel
           with it instead of staying behind when the door slides. */
        const edge = new T.Group();
        edge.position.set(sd * (-lw / 2 + 0.06), 0, 0.10);
        edge.rotation.z = Math.PI / 2;
        cautionRun(edge, h * (k === 0 ? 1.0 : 0.94) * 0.94, 0.1, 'x', tag + 'DoorEdgeCaution' + side + (k + 1));
        leaf.add(edge);
      });
      const lip = new T.Group();
      lip.position.set(sd * stow, -h / 2 - 0.14, 0.02);
      cautionRun(lip, leafW + 0.3, 0.1, 'x', tag + 'PocketCaution' + side);
      grp.add(lip);
    });
    const rail = box((stow + leafW / 2) * 2 + 0.4, 0.14, 0.3, matEngine, tag + 'DoorRail');
    rail.position.set(0, h / 2 + 0.08, 0.06); grp.add(rail);
    const railLower = box((stow + leafW / 2) * 2 + 0.4, 0.14, 0.3, matEngine, tag + 'DoorRailLower');
    railLower.position.set(0, -h / 2 - 0.08, 0.06); grp.add(railLower);
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
    const shaft = box(big.w * 1.2, shaftH, big.w * 1.2, matHull, 'transferLiftShaft');
    shaft.position.set(gp.x, deckY2 + shaftH / 2, gp.z); st.add(shaft);
    const car = box(big.w * 0.9, 0.4, big.w * 0.9, matPanel, 'transferLiftCar');
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
  const R = big.d + (size === 'L' ? 12.0 : size === 'S' ? 3.0 : 6.0), ring = 3.2, y0 = big.h + 6.0;

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

  // hub on radial spars
  const hub = box(6.4, 4.6, 6.4, matHull, 'hub');
  hub.position.set(0, y0, 0); halfGrp.add(hub);
  const hubCrown = box(4.8, 1.0, 4.8, matPanel, 'hubCrown');
  hubCrown.position.set(0, y0 + 2.8, 0); halfGrp.add(hubCrown);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    /* Length taken to the ring's inner face: at R-1.4 the spars stopped short
       and the hub floated inside its own ring. */
    const spar = box(1.0, 1.0, R + 0.4, matPanel, 'hubSpar' + i);
    spar.position.set(Math.sin(a) * (R / 2), y0, Math.cos(a) * (R / 2));
    spar.rotation.y = a; halfGrp.add(spar);
    const gw = box(4.4, 0.7, 0.08, i % 2 ? matLit : matGlass, 'hubWindow' + i);
    gw.position.set(Math.sin(a) * 3.21, y0 + 1.4, Math.cos(a) * 3.21);
    gw.rotation.y = a; halfGrp.add(gw);
  }

  // shared S/M berths on two opposing ring faces, in hung pylons
  [Math.PI / 2, -Math.PI / 2].forEach((a, i) => {
    const bw = bay.w, bh = bay.h, bd = bay.d;
    /* Dropped a clear hull-height below the ring: hung tight under it, an
       approaching ship had no room between its spine and the ring's underside. */
    const drop = ring / 2 + (bh + 2.6) / 2 + bh * 0.8;
    const pylon = box(bw + 2.4, bh + 2.6, bd + 1.0, matHull, 'berthPylon' + i);
    pylon.position.set(Math.sin(a) * R, y0 - drop, Math.cos(a) * R);
    pylon.rotation.y = a; halfGrp.add(pylon);
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
    const outward = new T.Vector3(Math.sin(a), 0, Math.cos(a));
    b.position.set(outward.x * (R + (bd + 1.0) / 2), y0 - drop, outward.z * (R + (bd + 1.0) / 2));
    b.rotation.y = a; halfGrp.add(b);
    /* Dressed on the pylon's UNDERSIDE, not its mouth face: pieces on the
       mouth stood in the approach corridor. */
    for (let k = 0; k < 5; k++) {
      const s2 = 0.3 + rand() * 0.5;
      const g = box(s2, s2 * 0.7, s2, rand() > 0.5 ? matPanel : matEngine, tag + 'UnderGreeble' + k);
      g.position.set(Math.sin(a) * (R + (rand() - 0.5) * bd * 0.6),
        y0 - drop - (bh + 2.6) / 2 + 0.1,
        Math.cos(a) * (R + (rand() - 0.5) * bd * 0.6));
      halfGrp.add(g);
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
    const trunk = box(trunkW, trunkH, trunkD, matHull, 'joiningHub');
    trunk.position.set(0, trunkY, 0); st.add(trunk);
    // collars where the trunk meets each ring
    [-1, 1].forEach(sd => {
      const collar = box(trunkW + 1.2, 1.0, trunkD + 1.2, matPanel, 'hubCollar' + (sd < 0 ? 'A' : 'B'));
      collar.position.set(0, trunkY + sd * (trunkH / 2 - 0.5), 0); st.add(collar);
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
  attachHall(st, big, rand);
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
 * Every sliding leaf carries both of its poses in userData.door, recorded by
 * berth() from that berth's own dimensions. This is the ONLY entry point the
 * game layer needs: 0 is fully stowed (the pose everything is modelled and
 * exported in), 1 is sealed. Nothing here knows which pattern it is driving.
 *
 * Doors are per-BERTH so a station can hold one bay open while the rest stay
 * shut, which is what the "open station doors" request actually asks for. */
export function setBerthDoors(berth, t) {
  const k = Math.min(1, Math.max(0, t));
  berth.traverse(n => {
    const d = n.userData && n.userData.door;
    if (d) n.position.x = d.openX + (d.closedX - d.openX) * k;
    // the force field is only up while the aperture is actually open
    if (n.userData && n.userData.fieldGate) n.visible = k < 0.5;
  });
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

export const STATION_TYPES = {
  cylinder: { label: 'Cylinder', build: buildCylinderStation, prefix: 'OS-', digits: 3 },
  spine: { label: 'Spine', build: buildSpineStation, prefix: 'OS-', digits: 3 },
  ring: { label: 'Ring', build: buildRingStation, prefix: 'OS-', digits: 3 },
  cradle: { label: 'Cradle', build: buildCradleStation, prefix: 'OS-', digits: 3 }
};
