import * as THREE from 'three';
import { FLEET, checkFit, checkApproachCorridors, checkDoorsRecessed, checkBerthFittings,
         checkInteriors, checkConnectivity, checkGrounded,
         checkDoorClosure, checkCarriers } from './station-tests.js';

/* Runnable checks for the planetside sites. The station invariants apply
 * unchanged — the sites use the same berth, hall and transfer-line parts, so
 * they are imported rather than restated. What is added here is what only a
 * planetside site has: gates a hull flies straight down through, a descent
 * shaft that has to be clear over the hull's own height, and interdigitating
 * leaves that must actually comb rather than butt.
 *
 *   import { PLANETSIDE_TYPES } from './planetside.js';
 *   import { checkAllSites, checkSite } from './planetside-tests.js';
 *   console.table(checkAllSites(PLANETSIDE_TYPES));
 */

const T = THREE;
const IGNORE = /Decal|Lamp|Caution|ForceField|Designation|billboard|NavLight|NavHood|Threshold|Marker|Port\d|Greeble/i;

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
function gatesOf(obj) {
  const out = [];
  obj.traverse(n => { if (!n.isMesh && n.userData && n.userData.clearOpening) out.push(n); });
  return out;
}

/* Every gate a hull passes through must clear the largest hull of the class it
 * serves. Portals and surface doors both serve the heavy envelope: a site has
 * one way in, so it has to be the big one. */
export function checkGateOpenings(site) {
  const problems = [];
  gatesOf(site).forEach(g => {
    const o = g.userData.clearOpening;
    const w = o.w, other = o.h !== undefined ? o.h : o.d;
    const need = o.h !== undefined ? FLEET.L.h : FLEET.L.d;
    if (w < FLEET.L.w + 0.2) problems.push(`GATE-NARROW ${g.name} ${w.toFixed(2)} < ${(FLEET.L.w + 0.2).toFixed(2)}`);
    if (other < need + 0.2) problems.push(`GATE-SHALLOW ${g.name} ${other.toFixed(2)} < ${(need + 0.2).toFixed(2)}`);
  });
  return problems;
}

/* Lap-sliding leaves: each side must carry tabs, and the two sides' tabs must
 * occupy DIFFERENT slots or they collide instead of lapping past each other.
 * A site with no gated aperture at all is exempt — the S mountain pad is
 * entered over an open pad, so there are no leaves to check. */
export function checkMeshingDoors(site) {
  const problems = [];
  const byTag = new Map();
  meshesOf(site).forEach(m => {
    const mt = /^(.*?)LapTab([LR])(\d+)$/.exec(m.node.name);
    if (!mt) return;
    const k = mt[1];
    if (!byTag.has(k)) byTag.set(k, { L: [], R: [] });
    byTag.get(k)[mt[2]].push(+mt[3]);
  });
  if (!byTag.size) {
    if (gatesOf(site).length) problems.push('NO-MESH-DOORS');
    return problems;
  }
  byTag.forEach((v, k) => {
    if (!v.L.length || !v.R.length) { problems.push(`TEETH-ONE-SIDED ${k}`); return; }
    const clash = v.L.filter(i => v.R.includes(i));
    if (clash.length) problems.push(`TEETH-CLASH ${k} slots ${clash.join(',')}`);
  });
  return problems;
}

/* A hull coming down through surface doors needs the shaft clear over its own
 * height below the opening: five rays straight down, as the berth corridors do
 * along their own normal. */
export function checkDescentShafts(site) {
  const problems = [];
  const all = meshesOf(site);
  const ray = new T.Raycaster();
  gatesOf(site).filter(g => g.userData.clearOpening.d !== undefined).forEach(g => {
    const own = new Set(); g.traverse(m => { if (m.isMesh) own.add(m); });
    const o = g.userData.clearOpening;
    const c = new T.Box3().setFromObject(g).getCenter(new T.Vector3());
    const targets = all.filter(m => !own.has(m.node) && !IGNORE.test(m.node.name)).map(m => m.node);
    const hw = o.w / 2 * 0.8, hd = o.d / 2 * 0.8;
    let worst = null;
    [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([ox, oz]) => {
      ray.set(new T.Vector3(c.x + ox * hw, c.y - 0.4, c.z + oz * hd), new T.Vector3(0, -1, 0));
      const hits = ray.intersectObjects(targets, false);
      // the platform the hull lands on is the floor of the shaft, not a blockage
      /* The platform the hull lands on is the floor of the shaft, not a
         blockage — and neither is the paint ON that platform. The outline
         decals only started showing up here because the toothed door's housing
         stands proud of the apron, which lifts the gate's box centre and so the
         ray's origin above them; they were always there, under the old start
         point rather than over it. */
      const bad = hits.find(h => h.distance < FLEET.L.h + 1.0 &&
        !/LiftPlatform|Stand|Floor|Outline|Caution|Mark/i.test(h.object.name));
      if (bad && (!worst || bad.distance < worst.d)) worst = { d: bad.distance, name: bad.object.name };
    });
    if (worst) problems.push(`SHAFT-BLOCKED ${g.name} by ${worst.name} @${worst.d.toFixed(1)}`);
  });
  return problems;
}

/* The excavation has to be an excavation: every interior deck must sit below
 * the surface plate the site's own plant stands on. */
export function checkBuried(site) {
  const problems = [];
  const all = meshesOf(site);
  const surf = all.filter(m => /^surfacePlate|^stripBed|^superRoof/.test(m.node.name));
  const decks = all.filter(m => /^(deckFloor|hangarFloor|galFloor|tunnelFloor|concourseFloor)$/.test(m.node.name));
  if (!decks.length) problems.push('NO-INTERIOR-DECK');
  if (surf.length) {
    const surfY = Math.min(...surf.map(m => m.box.min.y));
    decks.forEach(d => {
      if (d.box.max.y > surfY) problems.push(`DECK-ABOVE-SURFACE ${d.node.name} ${d.box.max.y.toFixed(1)} > ${surfY.toFixed(1)}`);
    });
  }
  return problems;
}

/* Nothing may stand in front of a landing pad or a strip. */
export function checkOpenApproach(site) {
  const problems = [];
  const all = meshesOf(site);
  const ray = new T.Raycaster();
  const pads = all.filter(m => /^padPlatform$/.test(m.node.name));
  pads.forEach(p => {
    const c = p.box.getCenter(new T.Vector3());
    const targets = all.filter(m => m.node !== p.node && !IGNORE.test(m.node.name)).map(m => m.node);
    ray.set(new T.Vector3(c.x, p.box.max.y + 0.4, c.z), new T.Vector3(0, 1, 0));
    const hits = ray.intersectObjects(targets, false);
    if (hits.length && hits[0].distance < FLEET.M.d)
      problems.push(`PAD-OVERHUNG ${p.node.name} by ${hits[0].object.name} @${hits[0].distance.toFixed(1)}`);
  });
  return problems;
}

/* Caution striping is excluded from the island check by name, which let the
 * leading-edge stripe ship floating 0.025 off its own door. So it gets an
 * explicit host assertion: every leading-edge run must touch the seam rib it
 * is painted on. */
export function checkLeadingEdgeStripes(site) {
  const problems = [];
  const all = meshesOf(site);
  const ribs = all.filter(m => /LapSeamRib[LR]$/.test(m.node.name));
  all.filter(m => /LeadingEdgeCaution[LR]Chips[YK]$/.test(m.node.name)).forEach(c => {
    const mt = /^(.*?)LeadingEdgeCaution([LR])Chips/.exec(c.node.name);
    const host = ribs.find(r => r.node.name === mt[1] + 'LapSeamRib' + mt[2]);
    if (!host) { problems.push(`STRIPE-NO-HOST ${c.node.name}`); return; }
    if (!c.box.clone().expandByScalar(0.005).intersectsBox(host.box))
      problems.push(`STRIPE-DETACHED ${c.node.name}`);
  });
  return problems;
}

export function checkSite(site) {
  return [
    ...checkFit(site),
    ...checkApproachCorridors(site),
    ...checkDoorsRecessed(site),
    ...checkBerthFittings(site),
    ...checkInteriors(site),
    ...checkGateOpenings(site),
    ...checkDoorClosure(site),
    ...checkCarriers(site),
    ...checkLeadingEdgeStripes(site),
    ...checkDescentShafts(site),
    ...checkOpenApproach(site),
    ...checkBuried(site),
    ...checkConnectivity(site),
    ...checkGrounded(site)
  ];
}

/* Every variant at every size. Rows suitable for console.table. */
export function checkAllSites(PLANETSIDE_TYPES) {
  const rows = [];
  Object.entries(PLANETSIDE_TYPES).forEach(([key, t]) => {
    ['S', 'M', 'L'].forEach(size => {
      const problems = checkSite(t.build('UP-001', size));
      rows.push({ site: key, size, problems: problems.length, first: problems[0] || '' });
    });
  });
  return rows;
}
