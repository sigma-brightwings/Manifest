import * as THREE from 'three';
import { PARTS, MATS } from './station.js';

/* A blast doorway you can drop into anything.
 *
 * This is the project's one door mechanism (`toothedDoor` in station.js)
 * packaged as a self-contained object: build it, position it, add it. Use it
 * wherever a passage has to be closable — the foot of an access shaft, a
 * gallery entry, a corridor bulkhead, a dome airlock, a hangar mouth.
 *
 *   import { createBlastDoor } from './blastdoor.js';
 *   const door = createBlastDoor(w, h, { tag: 'shaftDoor' });
 *   door.position.set(0, h / 2, z);
 *   door.rotation.y = Math.PI;        // aperture normal points -Z
 *   parent.add(door);
 *
 * Conventions, same as the station berths so one game layer drives all of it:
 *   - The aperture normal is the group's local +Z.
 *   - The opening is centred on the group's origin, so y = h/2 puts the sill
 *     on the deck.
 *   - Two leaves slide in from either side and lap past each other. The seam
 *     is a few broad alternating tabs, and each leaf's leading edge carries
 *     yellow/black striping standing proud of the face it presents.
 *   - Nothing self-animates. `userData.airlock` carries the contract.
 *
 * `createBlastDoor` returns the doorway ALONE. If the wall it sits in is a
 * solid plate, cut the hole yourself (see `wallWithHole` in planetside.js) —
 * a door pinned to an unbroken slab is a door onto nothing.
 */

const T = THREE;
const { box, cautionRun, toothedDoor } = PARTS;

export function createBlastDoor(w, h, opts = {}) {
  const tag = opts.tag || 'blastDoorway';
  const grp = new T.Group();
  grp.name = tag;
  const M = opts.mats || MATS;
  const t = opts.thickness || 0.26;
  const frame = opts.frame !== false;
  const jambT = opts.jambT || 0.45;

  if (frame) {
    /* Structure round the opening: a door needs something to be hung in, and
       the frame is what carries the load the leaves do not. Set back from the
       aperture plane so nothing crosses the corridor. */
    [-1, 1].forEach(sd => {
      const jamb = box(jambT, h + jambT * 2, 1.0, M.hull, tag + 'Jamb' + (sd < 0 ? 'L' : 'R'));
      jamb.position.set(sd * (w / 2 + jambT / 2), 0, -0.3);
      grp.add(jamb);
    });
    const lintel = box(w + jambT * 2, jambT, 1.0, M.hull, tag + 'Lintel');
    lintel.position.set(0, h / 2 + jambT / 2, -0.3); grp.add(lintel);
    const sill = box(w + jambT * 2, jambT * 0.8, 1.0, M.hull, tag + 'Sill');
    sill.position.set(0, -h / 2 - jambT * 0.4, -0.3); grp.add(sill);
    // threshold striping on the deck, across the opening
    const thr = new T.Group();
    thr.position.set(0, -h / 2 - 0.02, 0.34);
    cautionRun(thr, w + 0.5, 0.11, 'x', tag + 'ThresholdCaution');
    grp.add(thr);
  }

  // the mechanism itself
  const mech = toothedDoor(grp, w, h, tag, {
    axis: 'y', mats: M, kind: opts.kind || 'outer'
  });

  /* Approach cues: nav lights so a pilot can read the opening's orientation
     (green to starboard with the nose at +Z, red to port), and a cycle lamp
     that the game layer can drive while the leaves are moving. */
  if (opts.lights !== false) {
    [-1, 1].forEach(sd => {
      const side = sd < 0 ? 'L' : 'R';
      const hood = box(0.4, 0.4, 0.22, M.fitting, tag + 'NavHood' + side);
      hood.position.set(sd * (w / 2 + jambT * 0.5), h / 2 - 0.5, 0.12);
      grp.add(hood);
      const nav = box(0.28, 0.28, 0.22, sd > 0 ? M.navGreen : M.navRed, tag + 'NavLight' + side);
      nav.position.set(hood.position.x, hood.position.y, 0.26);
      grp.add(nav);
      const cyc = box(0.16, 0.16, 0.14, sd < 0 ? M.beacon : M.lit, tag + 'CycleLamp' + side);
      cyc.position.set(sd * (w / 2 + jambT * 0.5), -h / 2 + 0.5, 0.24);
      grp.add(cyc);
    });
  }

  grp.userData.clearOpening = { w, h };
  grp.userData.airlock = {
    outerGate: 'toothedDoor',
    innerGate: opts.innerGate || null,
    controlsLockedUntil: opts.controlsLockedUntil || 'outerGateOpen',
    outerCyclesOnlyWhenOccupied: opts.cyclesOnlyWhenOccupied !== false,
    outerOpensOn: opts.opensOn || 'dockingClearance'
  };
  /* The doorway's own summary. The POSES live on the two leaf groups, where
     `setGates` finds them without being told anything; this block is the
     description a caller reads to know what it is looking at. It named
     `LapDoorL/R` — the leaf MESHES — back when they were loose siblings; the
     movable thing is now the group each one hangs from, and naming the mesh
     would hand a caller a node that does not travel on its own. */
  grp.userData.gateSpec = {
    id: tag, kind: mech.kind, plane: 'xy', aperture: { w, h },
    mechanism: 'toothedDoor',
    leaves: mech.leaves.map(l => l.name),
    closesToCentre: true,
    apertureNormal: '+z',
    requires: opts.opensOn || 'dockingClearance'
  };
  return grp;
}

/* The largest hull the fleet flies, so a passage door can be sized to it
   rather than by eye. Mirrors BERTH in station.js. */
export const DOOR_SIZES = {
  light: { w: PARTS.BERTH.sm.w + 1.2, h: PARTS.BERTH.sm.h + 0.8 },
  heavy: { w: PARTS.BERTH.lg.w + 1.6, h: PARTS.BERTH.lg.h + 1.0 }
};
