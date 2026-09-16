/* Comet outpost — a hangar bay sunk into a rocky comet.
 *
 * Nothing here is a face-mounted berth. The body is the structure, and the port
 * is cut DOWN into it: a vertical shaft sized to the shared S/M envelope with a
 * platform lift, and a separate L hangar you land straight into through blast
 * doors in the surface.
 *
 * Both openings close with the same door the stations now use — bi-parting
 * leaves running in housings that stand PROUD of the surface over their drive.
 * Laid flat in the deck that is exactly the door the lift comes up through: the
 * frames stand above the rock, the mechanism is under them, and the leaves comb
 * together on the centreline.
 *
 * The body is a merged triangle soup rather than a solid primitive, which is
 * what makes the openings possible at all: faces that fall inside an opening's
 * footprint are simply not emitted, and a rock-cut collar covers the ragged
 * fringe that leaves behind — the same trick as the city domes' stem wall. */

import { KIT } from './station.js';

const { T, box, cyl, seedFrom, cautionRun, billboard, interiorLamp, BERTH } = KIT;
const { matHull, matPanel, matDeep, matAccent, matGlass, matLit, matDark,
  matBeacon, matAdA, matAdB, matNavGreen, matNavRed, matEngine } = KIT;

const matRock = new T.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.97, metalness: 0.02, name: 'cometRock' });
const matRockDark = new T.MeshStandardMaterial({ color: 0x35322e, roughness: 0.96, metalness: 0.02, name: 'cometRockDark' });
const matIce = new T.MeshStandardMaterial({
  color: 0xbcd6e0, roughness: 0.32, metalness: 0.05,
  emissive: 0x6f93a3, emissiveIntensity: 0.15, name: 'cometIce'
});
const matDust = new T.MeshStandardMaterial({ color: 0x5f5850, roughness: 0.99, name: 'cometDust' });

/* ---- the door ----
 * Built upright in local XY with the slide along local X, then laid flat by the
 * caller. Keeping the slide on local X means setBerthDoors drives these exactly
 * like a station's aperture leaves — same userData.gate contract, no second
 * mechanism for the game layer to learn. */
function deckDoor(w, d, tag, opts = {}) {
  const grp = new T.Group(); grp.name = tag;
  const heavy = !!opts.heavy;
  const leafW = w / 2 - 0.04;
  const housW = leafW + 0.9;
  /* Offset derived from the HOUSING's width, not the leaf's. The leaf's inner
     edge cleared the jamb, but the housing is 0.9 wider than the leaf, so it
     overhung the clear opening by 0.39 a side and the corner descent rays hit
     it. Position the house so its inner FACE is clear of the jamb, and stow
     the leaf centred in it. */
  const stow = w / 2 + 0.12 + housW / 2;
  const housD = heavy ? 2.1 : 1.5;
  const thick = heavy ? 0.34 : 0.16;

  /* Sill and rebate are FRAMES — four bars around the hole — not plates.
     As solid boxes they capped the very opening the doors serve: with the
     leaves fully stowed a hull still met 0.5 and 0.6 of solid slab across the
     whole aperture. Same four-piece treatment the L hangar's roof already had
     to use, for the same reason. The rebate's bars sit entirely OUTSIDE the
     clear opening so they cannot shave the throat. */
  const ring = (name, outW, outD, holeW, holeD, thick, z, mat) => {
    const bw = (outW - holeW) / 2, bd = (outD - holeD) / 2;
    [[outW, bd, 0, holeD / 2 + bd / 2],
     [outW, bd, 0, -(holeD / 2 + bd / 2)],
     [bw, holeD, holeW / 2 + bw / 2, 0],
     [bw, holeD, -(holeW / 2 + bw / 2), 0]].forEach(([pw, pd, ox, oz], i) => {
      const bar = box(pw, pd, thick, mat, name + i);
      bar.position.set(ox, oz, z);
      grp.add(bar);
    });
  };
  ring(tag + 'Sill', w + 2.2, d + 2.2, w, d, 0.5, -0.25, matPanel);
  ring(tag + 'Rebate', w + 0.4, d + 0.4, w, d, 0.6, -0.28, matDeep);

  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'L' : 'R';
    /* The housing stands off the surface and IS the drive's cover plate. */
    const house = box(housW, d + 1.0, housD, matHull, tag + 'DoorHouse' + side);
    house.position.set(sd * stow, 0, housD / 2 - 0.05);
    grp.add(house);
    const drive = box(leafW + 1.1, 0.7, housD * 0.92, matEngine, tag + 'DoorDrive' + side);
    drive.position.set(sd * stow, -d / 2 - 0.82, housD * 0.46);
    grp.add(drive);
    const screw = cyl(0.15, 0.15, leafW + 0.9, matPanel, tag + 'DoorScrew' + side, 8);
    screw.rotation.z = Math.PI / 2;
    screw.position.set(sd * stow, -d / 2 - 0.82, housD * 0.46);
    grp.add(screw);
    const motor = box(0.78, 0.72, 0.78, matPanel, tag + 'DoorMotor' + side);
    motor.position.set(sd * (stow + leafW / 2 + 0.36), -d / 2 - 0.82, housD * 0.46);
    grp.add(motor);
    const access = box(leafW * 0.55, 0.5, 0.09, matPanel, tag + 'DoorAccessPanel' + side);
    access.position.set(sd * stow, -d / 2 - 0.82, housD * 0.92 + 0.06);
    grp.add(access);
    for (let i = 0; i < 3; i++) {
      const groove = box(leafW + 0.5, 0.1, 0.07, matDeep, tag + 'HouseGroove' + side + i);
      groove.position.set(sd * stow, d * (0.28 - i * 0.28), housD - 0.02);
      grp.add(groove);
    }
    const band = new T.Group();
    band.position.set(sd * stow, 0, housD + 0.01);
    band.rotation.z = Math.PI / 2;
    cautionRun(band, d * 0.8, 0.13, 'x', tag + 'HouseBand' + side);
    grp.add(band);
  });

  /* Two telescopic leaves per side, nesting as they run outboard. */
  [-1, 1].forEach(sd => {
    const side = sd < 0 ? 'L' : 'R';
    const pocket = box(leafW + 0.34, d + 0.3, housD * 0.72, matDeep, tag + 'DoorPocket' + side);
    pocket.position.set(sd * stow, 0, housD * 0.44);
    grp.add(pocket);
    [0, 1].forEach(k => {
      const lw = leafW * (k === 0 ? 1.0 : 0.86);
      const leaf = box(lw, d * (k === 0 ? 1.0 : 0.94), thick,
        k === 0 ? matPanel : matHull,
        tag + (heavy ? 'BlastDoor' : 'SlidingDoor') + side + (k + 1));
      leaf.position.set(sd * (stow + k * leafW * 0.07), 0, 0.52 + k * (thick + 0.08));
      leaf.userData.gate = {
        kind: 'outer', axis: 'x',
        open: leaf.position.x,
        closed: sd * (k === 0 ? w / 2 - lw / 2 : lw / 2)
      };
      grp.add(leaf);
      /* Intermeshing seam, offset opposite ways on the two sides so the halves
         comb together instead of butting flat. */
      if (k === 1) {
        for (let t = 0; t < 4; t++) {
          const tab = box(0.38, d * 0.17, thick * 0.92, matPanel, tag + 'DoorInterlock' + side + t);
          tab.position.set(sd * (-lw / 2 - 0.19), (t - 1.5) * d * 0.21, sd > 0 ? thick * 0.55 : -thick * 0.55);
          leaf.add(tab);
        }
      }
      const chev = box(w * 0.1, 0.08, 0.04, matAccent, tag + 'DoorChevron' + side + (k + 1));
      chev.position.set(0, d * (0.2 - k * 0.12), thick * 0.6);
      leaf.add(chev);
      const edge = new T.Group();
      edge.position.set(sd * (-lw / 2 + 0.07), 0, thick * 0.62);
      edge.rotation.z = Math.PI / 2;
      cautionRun(edge, d * (k === 0 ? 1.0 : 0.94) * 0.94, 0.11, 'x', tag + 'DoorEdgeCaution' + side + (k + 1));
      leaf.add(edge);
    });
  });

  const rail = box((stow + leafW / 2) * 2 + 0.4, 0.16, 0.34, matEngine, tag + 'DoorRail');
  rail.position.set(0, d / 2 + 0.1, 0.62); grp.add(rail);
  const railLower = box((stow + leafW / 2) * 2 + 0.4, 0.16, 0.34, matEngine, tag + 'DoorRailLower');
  railLower.position.set(0, -d / 2 - 0.1, 0.62); grp.add(railLower);

  grp.userData.airlock = {
    outerGate: heavy ? 'blastDoors' : 'slidingDoors',
    innerGate: null,
    controlsLockedUntil: 'outerGateOpen',
    outerCyclesOnlyWhenOccupied: true
  };
  grp.userData.clear = { w, d };
  return grp;
}

/* Marker lights and hazard striping around an opening in the surface. */
function openingLights(parent, w, d, y, tag) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    [-1, 1].forEach((sd, k) => {
      const l = box(0.24, 0.3, 0.24, i === 0 ? (sd > 0 ? matNavGreen : matNavRed) : matLit,
        tag + 'EdgeLight' + k + '_' + i);
      l.position.set(sd * (w / 2 + 1.5), y, -d / 2 + i * (d / (n - 1)));
      parent.add(l);
    });
  }
  const stripe = new T.Group();
  stripe.position.set(0, y - 0.12, d / 2 + 1.5);
  cautionRun(stripe, w * 0.9, 0.12, 'x', tag + 'RimCaution');
  parent.add(stripe);
}

/* A hangar chamber: floor, walls, roof, stands, gantry and hoardings. Walls are
 * separate plates so the space is genuinely hollow and reads as interior. */
function chamber(w, h, d, tag, rand, standEnv, standCount, roofOpening) {
  const grp = new T.Group(); grp.name = tag;
  const wallT = 0.5;
  const floor = box(w, wallT, d, matPanel, tag + 'Floor');
  floor.position.y = -h / 2; grp.add(floor);
  /* If something descends through this chamber's roof, the roof is a FRAME.
     Suppressing a solid plate with visible = false is not a fix — the mesh
     still exists, still exports, and still blocks a raycast. */
  if (roofOpening) {
    const ow = roofOpening.w, od = roofOpening.d;
    const bw = (w - ow) / 2, bd = (d - od) / 2;
    [[w, bd, 0, od / 2 + bd / 2],
     [w, bd, 0, -(od / 2 + bd / 2)],
     [bw, od, ow / 2 + bw / 2, 0],
     [bw, od, -(ow / 2 + bw / 2), 0]].forEach(([pw, pd, ox, oz], i) => {
      const bar = box(pw, wallT, pd, matDeep, tag + 'RoofFrame' + i);
      bar.position.set(ox, h / 2, oz); grp.add(bar);
    });
  } else {
    const roof = box(w, wallT, d, matDeep, tag + 'Roof');
    roof.position.y = h / 2; grp.add(roof);
  }
  [-1, 1].forEach((sd, k) => {
    const wall = box(wallT, h, d, matPanel, tag + 'WallX' + k);
    wall.position.x = sd * (w / 2 - wallT / 2); grp.add(wall);
    const end = box(w, h, wallT, matPanel, tag + 'WallZ' + k);
    end.position.z = sd * (d / 2 - wallT / 2); grp.add(end);
  });
  /* Rock face showing through between the plates — this is a mined cavity. */
  for (let i = 0; i < 8; i++) {
    const s = 0.6 + rand() * 1.4;
    const px = (rand() - 0.5) * w * 0.9, pz = (rand() - 0.5) * d * 0.9;
    /* Never inside the descent path. Decorative lumps in the corridor is the
       oldest mistake in this project. */
    if (roofOpening &&
      Math.abs(px) < roofOpening.w / 2 + s && Math.abs(pz) < roofOpening.d / 2 + s) continue;
    const r = box(s, s * 0.7, s, i % 3 ? matRock : matIce, tag + 'RockFace' + i);
    r.position.set(px, h / 2 - 0.5 - rand() * h * 0.3, pz);
    r.rotation.set(rand(), rand(), rand()); grp.add(r);
  }

  /* Parking stands, laid out along the chamber, sized from the fleet. */
  const stands = [];
  for (let i = 0; i < standCount; i++) {
    const sw = standEnv.w * 1.35, sd2 = standEnv.d * 1.2;
    const cols = standCount > 2 ? 2 : 1;
    const col = i % cols, row = Math.floor(i / cols);
    const cx = cols === 1 ? 0 : (col - 0.5) * (w * 0.44);
    const cz = (row - (Math.ceil(standCount / cols) - 1) / 2) * (d / Math.ceil(standCount / cols));
    const g = new T.Group(); g.name = tag + 'Stand' + i;
    [[sw, 0.4, 0, -sd2 / 2], [sw, 0.4, 0, sd2 / 2], [0.4, sd2, -sw / 2, 0], [0.4, sd2, sw / 2, 0]]
      .forEach(([bw, bd, ox, oz], k) => {
        const bar = box(bw, 0.06, bd, matAccent, g.name + 'Outline' + k);
        bar.position.set(ox, 0, oz); g.add(bar);
      });
    [-1, 1].forEach((s, k) => {
      const clamp = box(0.55, 0.3, 0.55, matEngine, g.name + 'Clamp' + k);
      clamp.position.set(s * standEnv.w * 0.38, 0.15, sd2 * 0.16); g.add(clamp);
    });
    const num = box(1.3, 0.06, 1.8, matPanel, g.name + 'Number');
    num.position.set(sw / 2 - 1.1, 0.01, -sd2 / 2 + 1.4); g.add(num);
    g.position.set(cx, -h / 2 + wallT / 2 + 0.03, cz);
    grp.add(g);
    stands.push({ name: g.name, x: cx, z: cz });
  }

  /* Overhead gantry and strip lighting — the chamber has to read as worked in,
   * and an unlit cavity reads as a hole. */
  const railY = h / 2 - 1.0;
  [-1, 1].forEach((sd, k) => {
    const gr = box(0.3, 0.3, d * 0.9, matEngine, tag + 'CraneRail' + k);
    gr.position.set(sd * w * 0.36, railY, 0); grp.add(gr);
  });
  /* Parked clear of the descent path, not at a convenient fraction of the
     chamber. The bridge spans most of the chamber's width, so at d * 0.16 it
     sat right across the opening — it happened to fall between the five
     descent rays, which is luck, not clearance. */
  const craneZ = roofOpening ? d / 2 - 2.2 : d * 0.16;
  const bridge = box(w * 0.78, 0.34, 1.0, matEngine, tag + 'CraneBridge');
  bridge.position.set(0, railY, craneZ); grp.add(bridge);
  const hoist = box(0.6, 1.1, 0.6, matPanel, tag + 'CraneHoist');
  hoist.position.set(w * 0.1, railY - 0.7, craneZ); grp.add(hoist);
  const lampRows = Math.max(2, Math.round(d / 9));
  for (let i = 0; i < lampRows; i++) {
    const z = (i - (lampRows - 1) / 2) * (d * 0.8 / Math.max(1, lampRows - 1));
    interiorLamp(grp, -w * 0.28, h / 2 - 0.7, z, tag + 'Light' + i + 'a', { w: 1.5, d: 0.34 });
    interiorLamp(grp, w * 0.28, h / 2 - 0.7, z, tag + 'Light' + i + 'b', { w: 1.5, d: 0.34 });
  }
  /* Hoardings on the long walls — a captive audience applies underground too. */
  for (let i = 0; i < 4; i++) {
    const sd = i % 2 ? 1 : -1;
    const ad = box(0.12, 1.7, 3.0, i % 2 ? matAdA : matAdB, tag + 'AdPanel' + i);
    ad.position.set(sd * (w / 2 - wallT - 0.06), -h / 2 + 2.4, (Math.floor(i / 2) - 0.5) * d * 0.42);
    grp.add(ad);
    const fr = box(0.06, 2.0, 3.3, matEngine, tag + 'AdFrame' + i);
    fr.position.set(sd * (w / 2 - wallT - 0.14), -h / 2 + 2.4, ad.position.z);
    grp.add(fr);
  }
  for (let i = 0; i < 7; i++) {
    const s = 0.4 + rand() * 0.45;
    const cxp = (rand() - 0.5) * w * 0.8, czp = (rand() - 0.5) * d * 0.85;
    if (roofOpening &&
      Math.abs(cxp) < roofOpening.w / 2 + s && Math.abs(czp) < roofOpening.d / 2 + s) continue;
    const c = box(s, s, s, rand() < 0.4 ? matAdA : matPanel, tag + 'Crate' + i);
    c.position.set(cxp, -h / 2 + wallT / 2 + s / 2, czp);
    c.rotation.y = rand(); grp.add(c);
  }
  grp.userData.stands = stands;
  grp.userData.inner = { w, h, d };
  return grp;
}

export function buildCometOutpost(label = 'CM-01', size = 'M') {
  const st = new T.Group();
  const rand = seedFrom(label + size);
  const big = size === 'L', small = size === 'S';
  const R = small ? 40 : big ? 52 : 44;

  /* Openings, sized from the measured fleet envelope with the long axis along
   * Z so a hull sits level on the platform. */
  const smClear = { w: BERTH.sm.w, d: BERTH.sm.d };
  const lgClear = { w: BERTH.lg.w, d: BERTH.lg.d };
  const flattenY = R * 0.62;

  /* ---- the plateau is CUT TO FIT, not measured off the rock ----
   * Two earlier attempts measured the natural crown and fitted the pad inside
   * it: sixteen sector maxima, then the true rim boundary. Both fail for the
   * same reason. The rim's radius is a function of a random per-vertex
   * displacement, so one unlucky low vertex collapses the whole disc — the S
   * comet came out with a pad of 12.8 when its door assemblies need 19, and
   * the housings hung off the edge. And the fleet does not shrink: BERTH is
   * fixed, so both door assemblies are the same size on every comet.
   * So the pad's radius is DERIVED FROM THE DOORS and the rock is cut to suit,
   * which is house rule 2 applied to a body instead of a hull.
   *
   * A deckDoor's footprint, from its own construction: half width is
   * stow + leafW/2 + housing, which reduces to w + 0.47; half depth is
   * d/2 plus the drive that hangs off its low edge. */
  const asmHalf = c => ({ w: c.w + 0.47, d: c.d / 2 + 1.35 });
  const smAsm = asmHalf(smClear), lgAsm = asmHalf(lgClear);
  const shaftX = -(smAsm.w + 1.2), hangarX = lgAsm.w + 1.2;
  const crownR = Math.max(
    Math.hypot(Math.abs(shaftX) + smAsm.w, smAsm.d),
    Math.hypot(hangarX + lgAsm.w, lgAsm.d)
  ) + 2.0;

  /* ---- the body ----
   * A twice-subdivided icosahedron, displaced per unique vertex so the same
   * label always yields the same rock, with the crown flattened into a plateau
   * and the faces over each opening omitted. */
  const geo = new T.IcosahedronGeometry(R, 2);
  const pos = geo.getAttribute('position');
  const disp = new Map();
  const dispFor = v => {
    const k = v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2);
    if (!disp.has(k)) disp.set(k, 0.82 + rand() * 0.3);
    return disp.get(k);
  };
  const shape = v => {
    const o = v.clone().multiplyScalar(dispFor(v));
    /* Flattened EXACTLY, not mostly. Keeping a fraction of each vertex's
       height left the crown domed, so a flat pad laid on it was supported only
       at the summit and its whole rim hung in space — and every surface part
       placed at the nominal datum sat inside rock, the door leaves included.
       A mined landing plateau is flat; make it flat. */
    if (o.y > flattenY * 0.82) o.y = flattenY;
    /* And the pad's own footprint is levelled unconditionally, so the mesa is
       at least crownR across whatever the displacement did.
       The margin is a vertex SPACING, not a percentage: the mesa's boundary is
       polygonal, so between two levelled vertices the surface cuts inside the
       chord joining them, and a pad rim sitting in that gap floats. At detail 2
       the spacing is about a fifth of R, so the levelled region has to run that
       much past the rim. A bare 8% margin left 9 of 40 rim samples on the S
       comet overhanging by up to 2.8.
       It runs three tenths, not two, so the band is strictly WIDER than the
       face removal can reach: an opening-overlapping triangle may have a
       vertex a whole spacing out, so removal reaches crownR + R * 0.2, and a
       pad sized to cover that must still land on level rock. At two tenths the
       two were equal and the L pad overhung by 0.8. */
    if (o.y > 0 && Math.hypot(o.x, o.z) < crownR + R * 0.3) o.y = flattenY;
    return o;
  };

  /* Still two passes, but only so the faces over each opening can be dropped
     after everything is shaped. Nothing on the surface is sized off R — that
     mistake sent the pad's corners, the mining rig and the billboard post
     straight out through the rock, because R is the sphere's radius and the
     displaced crown is narrower, by a different amount on every bearing. */
  const shaped = [];
  for (let i = 0; i < pos.count; i += 3) {
    shaped.push([
      shape(new T.Vector3().fromBufferAttribute(pos, i)),
      shape(new T.Vector3().fromBufferAttribute(pos, i + 1)),
      shape(new T.Vector3().fromBufferAttribute(pos, i + 2))
    ]);
  }
  /* The mesa is level at flattenY by construction now, so the surface datum is
     simply that plus the deck's own thickness. */
  const plateauY = flattenY + 0.12;

  /* Faces are dropped by OVERLAP, not by centroid. At detail 2 the vertex
     spacing is about a fifth of R, so a single flat mesa triangle is wider than
     an opening — its centroid can sit well outside the aperture while the
     triangle still roofs it over. That is why cometBody was still capping both
     shafts after the pad and the sill were cut. */
  /* Triangle vs rectangle, properly — a separating-axis test, not a bounding
     box. A bbox test is fine for small triangles and disastrous for big ones:
     at detail 2 an elongated mesa triangle out at r=20 can have a bounding box
     that clips an aperture rect while the triangle itself is nowhere near it,
     so the surface got dropped and left see-through holes a third of the way
     round the rim. Third outing for the same mistake in this one function:
     an extent is not a position. */
  const triRectOverlap = (t, c, cx, pad2) => {
    const hw = c.w / 2 + pad2, hd = c.d / 2 + pad2;
    const P = [[t[0].x - cx, t[0].z], [t[1].x - cx, t[1].z], [t[2].x - cx, t[2].z]];
    const xs = [P[0][0], P[1][0], P[2][0]], zs = [P[0][1], P[1][1], P[2][1]];
    if (Math.min(...xs) > hw || Math.max(...xs) < -hw) return false;
    if (Math.min(...zs) > hd || Math.max(...zs) < -hd) return false;
    for (let i = 0; i < 3; i++) {
      const p = P[i], q = P[(i + 1) % 3];
      const nx = -(q[1] - p[1]), nz = q[0] - p[0];        // edge normal
      let lo = Infinity, hi = -Infinity;
      P.forEach(v => { const d = v[0] * nx + v[1] * nz; if (d < lo) lo = d; if (d > hi) hi = d; });
      const rad = Math.abs(nx) * hw + Math.abs(nz) * hd; // rect's radius on this axis
      if (lo > rad || hi < -rad) return false;
    }
    return true;
  };
  const overlapsOpening = (t, c, cx) => triRectOverlap(t, c, cx, 0.6);
  const tris = [];
  /* How far out the removal actually reached. The pad is then sized to cover
     THAT, rather than to crownR and hoping the two agree — which is the whole
     class of bug this function kept producing. */
  let removedMaxR = 0;
  const noteRemoved = t => t.forEach(v => {
    const h = Math.hypot(v.x, v.z);
    if (h > removedMaxR) removedMaxR = h;
  });
  shaped.forEach(t => {
    const [a, b, c] = t;
    const my = (a.y + b.y + c.y) / 3;
    if (my > flattenY * 0.7) {
      const mx = (a.x + b.x + c.x) / 3, mz = (a.z + b.z + c.z) / 3;
      /* The pad disc IS the crown surface, so the mesa under it is removed
         outright — a cap cannot exist in a region that has no faces.
         Dropped on ALL THREE VERTICES, not the centroid. A centroid test is
         the same mistake as the one below it: at detail 2 a triangle whose
         centroid sits at r=20 has vertices reaching r=27, so it took the
         surface six units past the disc meant to replace it and opened
         see-through holes around a third of the rim. Requiring every vertex
         inside crownR makes the removal boundary fall inside the pad by
         construction, and the triangles that straddle it stay, underlapping
         the pad's rim. */
      if (Math.hypot(a.x, a.z) < crownR &&
          Math.hypot(b.x, b.z) < crownR &&
          Math.hypot(c.x, c.z) < crownR) { noteRemoved(t); return; }
      if (overlapsOpening(t, smClear, shaftX) || overlapsOpening(t, lgClear, hangarX)) {
        noteRemoved(t); return;
      }
    }
    tris.push([a, b, c]);
  });
  const arr = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => {
    const [a, b, c] = t;
    arr.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], i * 9);
  });
  const bodyGeo = new T.BufferGeometry();
  bodyGeo.setAttribute('position', new T.BufferAttribute(arr, 3));
  bodyGeo.computeVertexNormals();
  const body = new T.Mesh(bodyGeo, matRock);
  body.name = 'cometBody'; body.castShadow = true; body.receiveShadow = true;
  st.add(body);

  /* Ice deposits and dust drifts on the surface. */
  /* ---- door keep-out ----
   * THE RULE: the only thing allowed to touch a door is its own caution
   * striping. Nothing else — no greeble, drum, tank, mast, decal or lump of
   * ice — may enter a door's footprint, and that footprint is the whole
   * ASSEMBLY, not the hole: housings, drive, rails and all. Guarding only the
   * aperture is what let drums and the comms block crowd the leaves.
   *
   * Half extents match deckDoor's own construction: w/2 + 0.12 + housW for the
   * housings either side, and d/2 plus the drive that hangs off the low edge. */
  const doorZone = c => ({ hw: c.w / 2 + 0.12 + (c.w / 2 - 0.04 + 0.9) + 0.4, hd: c.d / 2 + 1.8 });
  const smZone = doorZone(smClear), lgZone = doorZone(lgClear);
  const nearDoor = (x, z, pad2 = 0) =>
    (Math.abs(x - shaftX) < smZone.hw + pad2 && Math.abs(z) < smZone.hd + pad2) ||
    (Math.abs(x - hangarX) < lgZone.hw + pad2 && Math.abs(z) < lgZone.hd + pad2);
  const inDescent = nearDoor;
  st.userData.doorKeepOut = [
    { name: 'berthSMDeck', x: shaftX, z: 0, halfW: smZone.hw, halfD: smZone.hd },
    { name: 'berthLDeck', x: hangarX, z: 0, halfW: lgZone.hw, halfD: lgZone.hd }
  ];
  for (let i = 0; i < (big ? 14 : 10); i++) {
    const a = rand() * Math.PI * 2, t = 0.2 + rand() * 0.7;
    const rr = R * (0.75 + rand() * 0.2);
    const s = 1.6 + rand() * 3.4;
    const ix = Math.cos(a) * rr * t, iz = Math.sin(a) * rr * t;
    if (inDescent(ix, iz, s)) continue;
    const ice = box(s, s * 0.5, s * 0.8, rand() < 0.6 ? matIce : matRockDark, 'cometIceVein' + i);
    ice.position.set(ix, plateauY * (0.1 + rand() * 0.5) * (rand() < 0.5 ? -1 : 1), iz);
    ice.rotation.set(rand(), rand(), rand());
    st.add(ice);
  }
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    const dx = Math.cos(a) * R * 0.5, dz = Math.sin(a) * R * 0.5;
    const dw = 3 + rand() * 4;
    if (inDescent(dx, dz, dw)) continue;
    const d = box(dw, 0.4, 3 + rand() * 4, matDust, 'cometDrift' + i);
    d.position.set(dx, plateauY - 0.2, dz);
    d.rotation.y = rand(); st.add(d);
  }

  /* ---- the plateau deck ----
   * A cut pad over the crown, which is also what covers the ragged fringe left
   * by the omitted faces. */
  /* A faceted disc WITH THE OPENINGS CUT OUT. As plain cylinders these two
     were the other pair of caps across both apertures — a hull with the doors
     fully stowed still met the pad and the deck. A 20-gon outline with a
     rectangular hole per opening, extruded, gives a real plate with real holes;
     twenty facets matches the city domes' stem walls. padW/padD stay as the
     span the surface plant is laid out against. */
  const padW = crownR * 2, padD = crownR * 2;
  const holeOf = (c, cx) => {
    const p = new T.Path();
    const hw = c.w / 2 + 0.3, hd = c.d / 2 + 0.3;
    p.moveTo(cx - hw, -hd); p.lineTo(cx + hw, -hd);
    p.lineTo(cx + hw, hd); p.lineTo(cx - hw, hd); p.closePath();
    return p;
  };
  const holedDisc = (rr, thick, mat, name, yBottom) => {
    const shp = new T.Shape();
    for (let i = 0; i <= 20; i++) {
      const a = i / 20 * Math.PI * 2, x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) shp.moveTo(x, y); else shp.lineTo(x, y);
    }
    shp.holes.push(holeOf(smClear, shaftX), holeOf(lgClear, hangarX));
    const g = new T.ExtrudeGeometry(shp, { depth: thick, bevelEnabled: false, steps: 1 });
    const mesh = new T.Mesh(g, mat);
    mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true;
    /* the shape's local +Z extrudes upward once laid flat */
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = yBottom;
    return mesh;
  };
  /* Circumscribed radius, so the 20-gon's flat edges still cover the circle
     they have to cover — an inscribed polygon leaves a sliver open at each
     facet's mid-chord. */
  const padR = Math.max(crownR, removedMaxR + 0.4) / Math.cos(Math.PI / 20);
  const pad = holedDisc(padR, 0.7, matRockDark, 'plateauPad', plateauY - 0.7);
  st.add(pad);
  const deck = holedDisc(crownR * 0.92, 0.3, matPanel, 'plateauDeck', plateauY - 0.05);
  st.add(deck);
  for (let i = 0; i < 5; i++) {
    const dec = box(3.2, 0.05, 1.2, i % 2 ? matAccent : matPanel, 'plateauDecal' + i);
    dec.position.set((i - 2) * crownR * 0.3, plateauY + 0.26, crownR * 0.78); st.add(dec);
  }

  /* ---- S/M shaft: vertical lift down to the hangar ----
   * The shaft runs PAST the hangar floor into a pocket, so the platform has
   * somewhere to sit when it is idle or being called by the next arrival. */
  const smH = BERTH.sm.h + 1.4;
  const chamberH = smH + 4.0;
  const shaftClearW = smClear.w + 0.6, shaftClearD = smClear.d + 0.8;
  const hangarTopY = plateauY - 4.6;
  const hangarFloorY = hangarTopY - chamberH;
  const pocketDepth = smH + 1.6;

  const shaftWallT = 0.6;
  [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([sx, sz], k) => {
    const wallW = sx ? shaftWallT : shaftClearW + shaftWallT * 2;
    const wallD = sz ? shaftWallT : shaftClearD;
    const wallH = plateauY - (hangarFloorY - pocketDepth);
    const w2 = box(wallW, wallH, wallD, matPanel, 'shaftWall' + k);
    w2.position.set(shaftX + sx * (shaftClearW / 2 + shaftWallT / 2),
      plateauY - wallH / 2, sz * (shaftClearD / 2 + shaftWallT / 2));
    st.add(w2);
    /* Guide rails down the full run. */
    const rail = box(sx ? 0.3 : 0.24, wallH * 0.98, sx ? 0.24 : 0.3, matEngine, 'shaftGuide' + k);
    rail.position.set(shaftX + sx * (shaftClearW / 2 - 0.14), plateauY - wallH / 2, sz * (shaftClearD / 2 - 0.14));
    st.add(rail);
  });
  /* Shaft lighting, so the descent is lit rather than a black hole. */
  const shaftRun = plateauY - hangarFloorY;
  for (let i = 0; i < Math.max(3, Math.round(shaftRun / 5)); i++) {
    interiorLamp(st, shaftX - shaftClearW / 2 + 0.5, plateauY - 2.5 - i * 5, 0,
      'shaftLight' + i, { w: 0.9, d: 0.3 });
  }
  /* The platform, modelled at its idle pose in the pocket below the floor. */
  const plat = new T.Group(); plat.name = 'liftPlatform';
  const platDeck = box(shaftClearW * 0.96, 0.5, shaftClearD * 0.96, matHull, 'liftPlatformDeck');
  plat.add(platDeck);
  const platEdge = new T.Group();
  platEdge.position.set(0, 0.3, shaftClearD * 0.46);
  cautionRun(platEdge, shaftClearW * 0.9, 0.12, 'x', 'liftPlatformCaution');
  plat.add(platEdge);
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -1 : 1, sz = i % 2 ? -1 : 1;
    const shoe = box(0.4, 0.7, 0.4, matEngine, 'liftPlatformShoe' + i);
    shoe.position.set(sx * shaftClearW * 0.44, -0.1, sz * shaftClearD * 0.44);
    plat.add(shoe);
  }
  const platMark = box(shaftClearW * 0.5, 0.06, shaftClearD * 0.6, matAccent, 'liftPlatformMark');
  platMark.position.y = 0.28; plat.add(platMark);
  plat.position.set(shaftX, hangarFloorY - pocketDepth + 1.2, 0);
  st.add(plat);
  /* Same carrier contract the station lifts use. This one was already honest —
     the platform is a group and its declared idle really is where it is
     modelled — so only the words change. `deck` is the intermediate stop; a
     carrier runs between two ends, so the third is data, not a fiction in the
     run. */
  plat.userData.carrier = {
    kind: 'lift', level: true, idle: 'from',
    from: { x: plat.position.x, y: plat.position.y, z: plat.position.z },
    to: { x: plat.position.x, y: plateauY + 0.1, z: plat.position.z },
    deck: { x: plat.position.x, y: hangarFloorY + 0.3, z: plat.position.z },
    occupancy: 1
  };
  /* Pocket floor and the ram that drives the platform. */
  const pocketFloor = box(shaftClearW + 1.2, 0.6, shaftClearD + 1.2, matDeep, 'liftPocketFloor');
  pocketFloor.position.set(shaftX, hangarFloorY - pocketDepth + 0.3, 0); st.add(pocketFloor);
  const ram = cyl(0.5, 0.5, pocketDepth * 0.8, matEngine, 'liftRam', 8);
  ram.position.set(shaftX, hangarFloorY - pocketDepth + pocketDepth * 0.4, 0); st.add(ram);

  /* Surface door over the shaft, laid flat. */
  const smDoor = deckDoor(smClear.w, smClear.d, 'berthSMDeck');
  smDoor.rotation.x = -Math.PI / 2;
  smDoor.position.set(shaftX, plateauY + 0.25, 0);
  st.add(smDoor);
  openingLights(st, smClear.w, smClear.d, plateauY + 0.4, 'shaftMouth');
  const desig = box(2.6, 0.06, 1.4, matPanel, 'shaftDesignation');
  desig.position.set(shaftX, plateauY + 0.28, -smZone.hd - 1.6); st.add(desig);

  /* ---- the S/M hangar, under the shaft ---- */
  const hangW = shaftClearW + BERTH.sm.w * 2.6;
  const hangD = shaftClearD + 8;
  const smHangar = chamber(hangW, chamberH, hangD, 'hangarSM', rand, BERTH.sm, small ? 2 : 4,
    { w: shaftClearW, d: shaftClearD });
  smHangar.position.set(shaftX, hangarFloorY + chamberH / 2, 0);
  st.add(smHangar);

  /* ---- L hangar: land straight in through blast doors ----
   * No lift and no lateral run. The chamber's own roof is the door, so an L
   * hull descends through the surface onto its stand. */
  const lgH = BERTH.lg.h + 2.2;
  const lgChamberH = lgH + 3.0;
  const lgW = lgClear.w + 9, lgD = lgClear.d + 8;
  const lgTopY = plateauY - 1.7;
  const lgHangar = chamber(lgW, lgChamberH, lgD, 'hangarL', rand, BERTH.lg, 1,
    { w: lgClear.w, d: lgClear.d });
  lgHangar.position.set(hangarX, lgTopY - lgChamberH / 2, 0);
  st.add(lgHangar);
  /* Shoulder walls carrying the blast doors up to the surface. */
  [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([sx, sz], k) => {
    const wallW = sx ? 0.8 : lgClear.w + 1.6;
    const wallD = sz ? 0.8 : lgClear.d;
    const w2 = box(wallW, plateauY - lgTopY, wallD, matPanel, 'hangarLCollar' + k);
    w2.position.set(hangarX + sx * (lgClear.w / 2 + 0.4), (plateauY + lgTopY) / 2,
      sz * (lgClear.d / 2 + 0.4));
    st.add(w2);
  });
  const lgDoor = deckDoor(lgClear.w, lgClear.d, 'berthLDeck', { heavy: true });
  lgDoor.rotation.x = -Math.PI / 2;
  lgDoor.position.set(hangarX, plateauY + 0.25, 0);
  st.add(lgDoor);
  openingLights(st, lgClear.w, lgClear.d, plateauY + 0.4, 'hangarLMouth');

  /* ---- link tunnel, so the two hangars are one facility ---- */
  const linkY = hangarFloorY + 2.6;
  const linkLen = (hangarX - lgW / 2) - (shaftX + hangW / 2);
  if (linkLen > 2) {
    const tun = box(linkLen, 4.4, 5.2, matPanel, 'linkTunnel');
    tun.position.set(shaftX + hangW / 2 + linkLen / 2, linkY, 0); st.add(tun);
    const bore = box(linkLen, 3.4, 4.0, matDeep, 'linkTunnelBore');
    bore.position.set(tun.position.x, linkY, 0); st.add(bore);
    for (let i = 0; i < Math.max(2, Math.round(linkLen / 6)); i++) {
      interiorLamp(st, tun.position.x - linkLen / 2 + 2 + i * 6, linkY + 1.4, 0,
        'linkLight' + i, { w: 1.0, d: 0.3 });
    }
  }

  /* ---- surface plant ---- */
  const billW = big ? 10 : 8;
  const bb = billboard('cometBillboard', billW, 3.0, label);
  bb.position.set(0, plateauY + 3.4, -crownR * 0.72);
  st.add(bb);
  const bbPost = box(0.6, 3.4, 0.6, matEngine, 'cometBillboardPost');
  bbPost.position.set(0, plateauY + 1.7, -crownR * 0.72); st.add(bbPost);

  const mast = cyl(0.16, 0.24, R * 0.46, matEngine, 'cometMast', 6);
  mast.position.set(crownR * 0.55, plateauY + R * 0.23, crownR * 0.62); st.add(mast);
  const mastBcn = box(0.32, 0.32, 0.32, matBeacon, 'cometMastBeacon');
  mastBcn.position.set(crownR * 0.55, plateauY + R * 0.46, crownR * 0.62); st.add(mastBcn);
  const dish = cyl(2.0, 0.4, 0.8, matPanel, 'cometDish', 8);
  dish.position.set(crownR * 0.55, plateauY + R * 0.36, crownR * 0.62);
  dish.rotation.x = 0.6; st.add(dish);

  /* Ice-mining rig: this is a comet, so the volatiles are the reason to be
   * here at all and the port should say so. */
  const rigX = -crownR * 0.52;
  const rig = box(3.6, 5.0, 3.6, matHull, 'miningRig');
  rig.position.set(rigX, plateauY + 2.5, -crownR * 0.62); st.add(rig);
  const derrick = cyl(0.18, 0.26, 7.0, matEngine, 'miningDerrick', 6);
  derrick.position.set(rigX, plateauY + 8.0, -crownR * 0.62); st.add(derrick);
  for (let i = 0; i < 3; i++) {
    const tank = cyl(1.2, 1.2, 3.2, matPanel, 'volatileTank' + i, 10);
    tank.position.set(rigX + (i - 1) * 3.0, plateauY + 1.7, -crownR * 0.62 - 5.0); st.add(tank);
    const cap = cyl(1.28, 1.28, 0.3, matHull, 'volatileTankCap' + i, 10);
    cap.position.set(tank.position.x, plateauY + 3.4, tank.position.z); st.add(cap);
  }
  const pipe = cyl(0.3, 0.3, 9.0, matEngine, 'volatileMain', 8);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(rigX + 4.6, plateauY + 0.9, -crownR * 0.62 - 5.0); st.add(pipe);

  /* ---- control tower ---- */
  /* Far enough out that the tower's APRON clears the L door's keep-out, not
     just its shaft — the apron is 4.8 across and was overlapping. */
  const twX = 0, twZ = crownR * 0.74;
  const twH = R * 0.36;
  const twShaft = box(3.8, twH, 3.8, matHull, 'cometTowerShaft');
  twShaft.position.set(twX, plateauY + twH / 2, twZ); st.add(twShaft);
  const twCollar = box(4.8, 0.5, 4.8, matPanel, 'cometTowerCollar');
  twCollar.position.set(twX, plateauY + twH * 0.62, twZ); st.add(twCollar);
  const twCab = box(7.0, 3.6, 7.0, matPanel, 'cometTowerCab');
  twCab.position.set(twX, plateauY + twH + 1.8, twZ); st.add(twCab);
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(([sx, sz], k) => {
    const gl = box(sx ? 0.12 : 6.3, 2.2, sz ? 0.12 : 6.3, matGlass, 'cometTowerGlazing' + k);
    gl.position.set(twX + sx * 3.55, plateauY + twH + 2.0, twZ + sz * 3.55); st.add(gl);
  });
  const twRoof = box(7.6, 0.45, 7.6, matHull, 'cometTowerRoof');
  twRoof.position.set(twX, plateauY + twH + 3.8, twZ); st.add(twRoof);
  const twBcn = box(0.3, 0.3, 0.3, matBeacon, 'cometTowerBeacon');
  twBcn.position.set(twX, plateauY + twH + 4.2, twZ); st.add(twBcn);
  for (let i = 0; i < Math.floor(twH / 2.6); i++) {
    const rung = box(4.0, 0.11, 0.45, matEngine, 'cometTowerLadder' + i);
    rung.position.set(twX, plateauY + 1.3 + i * 2.6, twZ + 2.0); st.add(rung);
  }
  const twApron = cyl(4.6, 4.8, 0.3, matPanel, 'cometTowerApron', 12);
  twApron.position.set(twX, plateauY + 0.2, twZ); st.add(twApron);

  /* ---- comms array ---- */
  const cmX = -crownR * 0.56, cmZ = crownR * 0.74;
  const cmBase = box(4.6, 1.0, 3.4, matPanel, 'commsBase');
  cmBase.position.set(cmX, plateauY + 0.5, cmZ); st.add(cmBase);
  for (let i = 0; i < 3; i++) {
    const post = cyl(0.16, 0.2, 2.2 + i * 0.5, matEngine, 'commsPost' + i, 6);
    post.position.set(cmX + (i - 1) * 1.6, plateauY + 1.0 + (2.2 + i * 0.5) / 2, cmZ);
    st.add(post);
    const bowl = cyl(1.15, 0.22, 0.5, matPanel, 'commsDish' + i, 8);
    bowl.position.set(cmX + (i - 1) * 1.6, plateauY + 1.0 + (2.2 + i * 0.5) + 0.3, cmZ);
    bowl.rotation.x = 0.55 + i * 0.12;
    bowl.rotation.y = (i - 1) * 0.4;
    st.add(bowl);
    const feed = cyl(0.07, 0.07, 0.8, matEngine, 'commsDishFeed' + i, 4);
    feed.position.set(bowl.position.x, bowl.position.y + 0.5, cmZ + 0.35);
    feed.rotation.x = 0.55; st.add(feed);
  }
  const cmMast = cyl(0.13, 0.19, R * 0.3, matEngine, 'commsWhipMast', 6);
  cmMast.position.set(cmX + 2.9, plateauY + R * 0.15, cmZ - 1.6); st.add(cmMast);
  for (let i = 0; i < 4; i++) {
    const whip = cyl(0.05, 0.05, 2.4, matPanel, 'commsWhip' + i, 4);
    whip.position.set(cmX + 2.9 + Math.cos(i * 1.57) * 0.5, plateauY + R * 0.3 - 0.6,
      cmZ - 1.6 + Math.sin(i * 1.57) * 0.5);
    st.add(whip);
  }
  const cmLamp = box(0.24, 0.24, 0.24, matBeacon, 'commsMastBeacon');
  cmLamp.position.set(cmX + 2.9, plateauY + R * 0.3 + 0.4, cmZ - 1.6); st.add(cmLamp);
  const cmCab = box(1.9, 1.6, 1.5, matHull, 'commsEquipmentCabinet');
  cmCab.position.set(cmX - 2.9, plateauY + 0.8, cmZ - 1.3); st.add(cmCab);
  for (let i = 0; i < 3; i++) {
    const p = box(0.34, 0.3, 0.06, i === 1 ? matLit : matDark, 'commsCabinetPort' + i);
    p.position.set(cmX - 2.9 + (i - 1) * 0.5, plateauY + 1.1, cmZ - 1.3 + 0.78); st.add(p);
  }
  const cmConduit = cyl(0.18, 0.18, Math.abs(cmX - twX) * 0.5, matEngine, 'commsConduit', 6);
  cmConduit.rotation.z = Math.PI / 2;
  cmConduit.position.set((cmX + twX) / 2, plateauY + 0.35, cmZ); st.add(cmConduit);

  for (let i = 0; i < 10; i++) {
    const s = 0.35 + rand() * 0.5;
    const g = box(s, s * 0.8, s, rand() < 0.4 ? matAdA : matEngine, 'plateauGreeble' + i);
    const ga = rand() * Math.PI * 2, gr = crownR * 0.35 * Math.sqrt(rand());
    const gx = Math.cos(ga) * gr, gz = Math.sin(ga) * gr;
    if (inDescent(gx, gz, s + 0.4)) continue;
    g.position.set(gx, plateauY + 0.5, gz);
    g.rotation.y = rand(); st.add(g);
  }
  for (let i = 0; i < 6; i++) {
    const p = box(0.7, 0.5, 0.7, rand() < 0.5 ? matLit : matDark, 'plateauPort' + i);
    const pa = rand() * Math.PI * 2, pr = crownR * 0.4 * Math.sqrt(rand());
    const ppx = Math.cos(pa) * pr, ppz = Math.sin(pa) * pr;
    if (inDescent(ppx, ppz, 0.8)) continue;
    p.position.set(ppx, plateauY + 0.3, ppz);
    st.add(p);
  }
  [-1, 1].forEach((sd, k) => {
    const nav = box(0.34, 0.34, 0.34, sd > 0 ? matNavGreen : matNavRed, 'cometNavLight' + k);
    nav.position.set(sd * crownR * 0.6, plateauY + 0.7, -crownR * 0.72); st.add(nav);
  });

  st.name = 'cometOutpost';
  st.userData.label = label;
  /* The opening prisms, as data, so checkDescentRoute can sweep them and the
     game layer can size a hold point without re-deriving anything.
     COORDINATES ARE STATION-LOCAL. The group is translated to sit on the
     ground, so anything consuming these must put them through
     station.localToWorld first — reading them as world coordinates is how the
     first descent check came to sweep thin air 39 units below the comet. */
  /* Published so checkShellClosed knows how far the crown is supposed to
     reach, rather than re-deriving it. */
  st.userData.crown = { radius: crownR, plateauY, levelledRadius: crownR + R * 0.3 };
  st.userData.openings = [
    { name: 'berthSMDeck', x: shaftX, z: 0, w: smClear.w, d: smClear.d,
      apertureY: plateauY + 0.25, floorY: hangarFloorY + 0.3 },
    { name: 'berthLDeck', x: hangarX, z: 0, w: lgClear.w, d: lgClear.d,
      apertureY: plateauY + 0.25, floorY: lgTopY - lgChamberH + 0.4 }
  ];
  st.userData.route = {
    /* Waypoints as DATA, so the player's tractor and NPC pathing read one
     * route rather than each carrying its own copy. */
    sm: [
      { at: 'aperture', x: shaftX, y: plateauY + 0.3, z: 0 },
      { at: 'platform', x: shaftX, y: plateauY + 0.1, z: 0 },
      { at: 'hangarDeck', x: shaftX, y: hangarFloorY + 0.3, z: 0 },
      { at: 'pocket', x: shaftX, y: hangarFloorY - pocketDepth + 1.2, z: 0, occupancy: 1 }
    ],
    lg: [
      { at: 'aperture', x: hangarX, y: plateauY + 0.3, z: 0 },
      { at: 'hangarDeck', x: hangarX, y: lgTopY - lgChamberH + 0.4, z: 0 }
    ],
    stands: {
      sm: smHangar.userData.stands.map(s => ({ name: s.name, x: shaftX + s.x, y: hangarFloorY + 0.3, z: s.z })),
      lg: lgHangar.userData.stands.map(s => ({ name: s.name, x: hangarX + s.x, y: lgTopY - lgChamberH + 0.4, z: s.z }))
    }
  };
  st.updateMatrixWorld(true);
  const bb2 = new T.Box3().setFromObject(st);
  st.position.y -= bb2.min.y;
  st.updateMatrixWorld(true);
  return st;
}

export const COMET_TYPES = {
  comet: { label: 'Comet', build: buildCometOutpost, prefix: 'CM-', digits: 2 }
};
