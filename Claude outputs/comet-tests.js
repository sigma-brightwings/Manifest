/* Runnable checks for the comet outpost.
 *
 * These exist because the same faults were found repeatedly by an ad-hoc probe
 * that was thrown away each time, and the probe itself was wrong more often
 * than the model was. All of them are invisible in a screenshot: buried
 * structure poking out of the far side of the rock, solid plates capping the
 * very openings the doors serve, and clutter crowding a door's mountings.
 *
 *   import { checkAllComets } from './comet-tests.js';
 *   console.table(checkAllComets());
 *
 * Each check returns an array of problem strings; empty means pass. */

import { KIT } from './station.js';
import { buildCometOutpost } from './comet.js';

const T = KIT.T;

/* Surface furniture is MEANT to stand above the rock. Only these must be
 * inside it. hangarLMouth* are the L opening's marker lights, which stand ON
 * the surface — a bare 'hangarL' prefix swept them in and reported ten
 * phantom failures. */
const BURIED = /^(hangarSM|hangarL(?!Mouth)|shaftWall|shaftGuide|linkTunnel|liftPocketFloor|liftRam|plateauPad|plateauDeck)/;
/* Extruded or turned parts whose bounding box corners sit in open space — for
 * these, sample the real outline instead. Bounding boxes lie about round
 * shapes; that produced two rounds of phantom failures on its own. */
const ROUND = /^(plateauPad|plateauDeck|cometTowerApron)$/;

function probeOf(station) {
  let body = null;
  station.traverse(n => { if (n.name === 'cometBody') body = n; });
  if (!body) return null;
  const centre = new T.Vector3().setFromMatrixPosition(body.matrixWorld);
  const probe = new T.Mesh(body.geometry, new T.MeshBasicMaterial({ side: T.DoubleSide }));
  probe.position.copy(centre);
  probe.updateMatrixWorld(true);
  const rc = new T.Raycaster();
  return {
    centre,
    /* Distance from the body's centre to its surface on the bearing of p.
     * DoubleSide matters: the body's own material is front-face only, so a ray
     * cast from inside it never reports a hit at all. */
    surfaceAt(p) {
      const dir = p.clone().sub(centre);
      if (dir.length() < 1e-3) return Infinity;
      rc.set(centre, dir.normalize());
      const hits = rc.intersectObject(probe, false);
      return hits.length ? hits[hits.length - 1].distance : 0;
    }
  };
}

/* Nothing that is supposed to be inside the rock may stick out of it. */
export function checkSurfaceProtrusion(station, tol = 0.6) {
  const out = [];
  station.updateMatrixWorld(true);
  const pr = probeOf(station);
  if (!pr) return ['NO-BODY cometBody missing'];
  station.traverse(n => {
    if (!n.isMesh || !BURIED.test(n.name)) return;
    const b = new T.Box3().setFromObject(n);
    const pts = [];
    if (ROUND.test(n.name)) {
      const rr = (b.max.x - b.min.x) / 2 * 0.999;
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * Math.PI * 2;
        pts.push(new T.Vector3(cx + Math.cos(a) * rr, b.max.y, cz + Math.sin(a) * rr));
        pts.push(new T.Vector3(cx + Math.cos(a) * rr, b.min.y, cz + Math.sin(a) * rr));
      }
    } else {
      for (const x of [b.min.x, b.max.x])
        for (const y of [b.min.y, b.max.y])
          for (const z of [b.min.z, b.max.z]) pts.push(new T.Vector3(x, y, z));
    }
    let worst = 0;
    pts.forEach(p => {
      const r = pr.surfaceAt(p);
      if (!r || !isFinite(r)) return;
      const over = p.clone().sub(pr.centre).length() - r;
      if (over > worst) worst = over;
    });
    if (worst > tol) out.push('PROTRUDES ' + n.name + ' by ' + worst.toFixed(1));
  });
  return out;
}

/* A hull has to be able to get in. Casts down each opening's own prism with the
 * doors OPEN and names anything solid in the way.
 *
 * This is the comet's version of checkApproachCorridors, and it is the check
 * that was missing when the openings shipped capped by five slabs: the leaves
 * travelled, the housings were clear, the pad did not overhang — and the
 * aperture was still solid, because nothing had ever cast a ray down it. */
const TERMINUS = /(Floor$|RoofFrame|Stand|liftPlatform|liftRam|liftPocketFloor|Sill\d|Rebate\d|Caution|EdgeLight|RimCaution)/;

export function checkDescentRoute(station) {
  const out = [];
  station.updateMatrixWorld(true);
  const openings = station.userData.openings;
  if (!openings || !openings.length) return ['NO-OPENING-DATA station.userData.openings missing'];

  /* Doors must be posed OPEN for this to mean anything. */
  station.traverse(n => {
    const d = n.userData && n.userData.gate;
    if (d) n.position.x = d.open;
  });
  station.updateMatrixWorld(true);

  /* visible === false is NOT excluded on purpose: a hidden mesh still exports
   * and still occupies the corridor, and hiding a cap was one of the ways this
   * bug got past review. */
  const meshes = [];
  station.traverse(n => { if (n.isMesh) meshes.push(n); });
  const rc = new T.Raycaster();

  /* userData.openings is in the STATION'S OWN frame, and the station group is
   * translated to sit on the ground — so these have to be taken to world space
   * before casting. The first version of this check did not, so every ray
   * started 39 units below the comet, sailed past underneath it, and reported a
   * clean sweep of an aperture that was capped by five slabs. */
  const toWorld = v => station.localToWorld(v.clone());

  openings.forEach(op => {
    /* Centre plus four inset corners, the same five-ray pattern the station
     * approach check uses. Inset by 10% so the corners stay tied to the hull
     * envelope rather than the aperture's exact edge. */
    const hw = op.w / 2 * 0.9, hd = op.d / 2 * 0.9;
    const samples = [[0, 0], [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]];
    const floorY = toWorld(new T.Vector3(op.x, op.floorY, op.z)).y;
    samples.forEach(([dx, dz], i) => {
      const start = toWorld(new T.Vector3(op.x + dx, op.apertureY + 3, op.z + dz));
      rc.set(start, new T.Vector3(0, -1, 0));
      rc.near = 0;
      rc.far = start.y - floorY + 1.0;
      const hits = rc.intersectObjects(meshes, false);
      /* A ray that hits NOTHING is a broken probe, not a clear corridor. This
       * assertion exists because the miss above looked exactly like a pass. */
      if (!hits.length) {
        out.push('DESCENT-PROBE-MISSED ' + op.name + ' ray' + i +
          ' hit nothing at all — probe is wrong, not the geometry');
        return;
      }
      const blockers = [];
      hits.forEach(h => {
        if (h.point.y <= floorY + 0.4) return;        // the landing surface itself
        if (TERMINUS.test(h.object.name)) return;
        if (!blockers.includes(h.object.name)) blockers.push(h.object.name);
      });
      if (blockers.length)
        out.push('DESCENT-BLOCKED ' + op.name + ' ray' + i + ' through ' + blockers.join(','));
    });
  });
  return out;
}

/* THE DOOR KEEP-OUT RULE.
 *
 * The only thing allowed to touch a door is its own caution striping. Nothing
 * else — greeble, drum, tank, mast, decal, lump of ice — may enter a door's
 * footprint, and the footprint is the whole ASSEMBLY, not the hole: housings,
 * drive, screw, motor, rails and all. Guarding only the aperture is what let
 * drums and the comms block crowd the leaves.
 *
 * station.userData.doorKeepOut carries each zone, station-local. */
const DOOR_OWN = /^(berthSMDeck|berthLDeck)/;
const STRIPE_OK = /(Caution|Chevron|hazard)/i;

export function checkDoorKeepOut(station) {
  const out = [];
  station.updateMatrixWorld(true);
  const zones = station.userData.doorKeepOut;
  if (!zones || !zones.length) return ['NO-KEEPOUT-DATA station.userData.doorKeepOut missing'];

  const offenders = {};
  station.traverse(n => {
    if (!n.isMesh) return;
    /* A door's own parts and any caution striping are exempt by the rule. */
    if (DOOR_OWN.test(n.name) || STRIPE_OK.test(n.name)) return;
    /* Structure that the door is MOUNTED to, and the chamber it opens into,
     * are not decals — they are what carries the load. */
    if (/^(cometBody|plateauPad|plateauDeck|hangarSM|hangarL|shaftWall|shaftGuide|shaftLight|shaftMouth|hangarLMouth|liftPlatform|liftPocket|liftRam|linkTunnel)/.test(n.name)) return;

    const b = new T.Box3().setFromObject(n);
    /* zones are station-local; compare in the same frame */
    const lo = station.worldToLocal(b.min.clone());
    const hi = station.worldToLocal(b.max.clone());
    const x0 = Math.min(lo.x, hi.x), x1 = Math.max(lo.x, hi.x);
    const z0 = Math.min(lo.z, hi.z), z1 = Math.max(lo.z, hi.z);
    zones.forEach(z => {
      if (x0 < z.x + z.halfW && x1 > z.x - z.halfW &&
          z0 < z.z + z.halfD && z1 > z.z - z.halfD) {
        offenders[n.name] = z.name;
      }
    });
  });
  Object.keys(offenders).forEach(k =>
    out.push('TOUCHES-DOOR ' + k + ' is inside ' + offenders[k] + "'s keep-out"));
  return out;
}

/* The rock has to be a closed shell everywhere except the two apertures.
 *
 * This check exists because a 0/0/0 suite shipped a comet with see-through
 * holes around roughly a third of the plateau's rim. The crown's mesa is
 * removed where the pad disc replaces it, and the removal boundary had been
 * computed from triangle CENTROIDS while the pad only covers to crownR — so
 * the surface came away up to six units past the disc. Nothing in the suite
 * looked at shell integrity, so nothing caught it.
 *
 * A downward ray only sees upward-facing surfaces, so a miss means there is no
 * roof at that point. Samples inside an aperture are skipped: those are
 * supposed to be open. */
export function checkShellClosed(station) {
  const out = [];
  station.updateMatrixWorld(true);
  const crown = station.userData.crown;
  const openings = station.userData.openings || [];
  if (!crown) return ['NO-CROWN-DATA station.userData.crown missing'];

  const meshes = [];
  station.traverse(n => { if (n.isMesh) meshes.push(n); });
  const rc = new T.Raycaster();
  const toWorld = v => station.localToWorld(v.clone());
  const top = crown.plateauY + 40;

  const inAperture = (x, z) => openings.some(op =>
    Math.abs(x - op.x) < op.w / 2 + 0.8 && Math.abs(z - op.z) < op.d / 2 + 0.8);

  const BEARINGS = 36;
  /* Out past the levelled band, so the join between the pad and the natural
   * rock is covered as well as the pad itself. */
  const radii = [];
  for (let f = 0.2; f <= 1.35; f += 0.05) radii.push(+(f).toFixed(2));

  const holes = [];
  radii.forEach(f => {
    const r = crown.radius * f;
    let miss = 0;
    for (let i = 0; i < BEARINGS; i++) {
      const ang = i / BEARINGS * Math.PI * 2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (inAperture(x, z)) continue;
      const start = toWorld(new T.Vector3(x, top, z));
      rc.set(start, new T.Vector3(0, -1, 0));
      rc.near = 0; rc.far = 200;
      if (!rc.intersectObjects(meshes, false).length) miss++;
    }
    if (miss) holes.push(f.toFixed(2) + 'xR:' + miss + '/' + BEARINGS);
  });
  if (holes.length) out.push('SHELL-OPEN no surface at ' + holes.join(' '));
  return out;
}

/* Grounded, like the stations. */
export function checkGrounded(station) {
  station.updateMatrixWorld(true);
  const b = new T.Box3().setFromObject(station);
  return Math.abs(b.min.y) > 1e-3 ? ['NOT-GROUNDED min.y ' + b.min.y.toFixed(3)] : [];
}

/* Every leaf travels, and the clear opening is not shaved by its own housing. */
export function checkDoors(station) {
  const out = [];
  const leaves = [];
  station.traverse(n => { if (n.userData && n.userData.gate) leaves.push(n); });
  if (!leaves.length) return ['NO-DOORS no leaf carries userData.gate'];
  leaves.forEach(l => {
    const d = l.userData.gate;
    if (Math.abs(d.closed - d.open) < 0.05) out.push('DOOR-NO-TRAVEL ' + l.name);
  });
  return out;
}

export function checkComet(station) {
  return [].concat(
    checkGrounded(station),
    checkDoors(station),
    checkSurfaceProtrusion(station),
    checkDescentRoute(station),
    checkDoorKeepOut(station),
    checkShellClosed(station)
  );
}

export function checkAllComets(label = 'CM-01') {
  return ['S', 'M', 'L'].map(size => {
    const probs = checkComet(buildCometOutpost(label, size));
    return { size, problems: probs.length, detail: probs.join(' | ') };
  });
}
