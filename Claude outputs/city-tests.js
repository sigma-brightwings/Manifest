/* Runnable checks for the surface city ports.
 *
 * The dome checks exist because a capped cylinder got laid across the planting
 * TWICE — once as a tending catwalk at mid-height, once as a ring beam at head
 * height — and both times a high-oblique screenshot made the plate read as the
 * dome's floor. Counting planting meshes cannot see this; only a ray can.
 *
 *   import { checkAllCityPorts } from './city-tests.js';
 *   console.table(checkAllCityPorts());
 */

import { KIT } from './station.js';
import { buildCityPort } from './city.js';

const T = KIT.T;

/* Anything legitimately overhead inside a dome: the shell itself, its frame,
 * grow lights and the plants. Everything else broad and flat is a plate. */
/* `Stem\d` is a tall shoot out of a ground-cover patch — planting, exactly like
   Vine and Canopy, and allowed to stand in a sightline for the same reason.
   It only started appearing here because replacing the tree ring with vine
   rows changed how many draws the planting takes, which redresses every dome:
   the stems moved, and one landed in a ray it had never landed in before. */
const OVERHEAD_OK = /(Glazing|Strut|Hub|Porch|StemWall|Stem\d|Frame|Grow|Light|Fixture|Tree|Canopy|Fruit|Vine|Trellis|Post|Wire|Grape|Block|Port)/;

/* No broad horizontal surface may sit between the floor and the crown inside
 * the interior radius. */
export function checkDomeSightline(port) {
  const out = [];
  port.updateMatrixWorld(true);
  const domes = [];
  port.traverse(n => { if (/^dome\d+$/.test(n.name) && n.userData.interiorRadius) domes.push(n); });
  if (!domes.length) return ['NO-DOMES none found'];

  domes.forEach(dome => {
    const R = dome.userData.interiorRadius;
    const floorY = dome.userData.floorY;
    const crownY = dome.userData.crownY;
    /* 1. geometric: a wide, thin, horizontal mesh above the floor */
    dome.traverse(n => {
      if (!n.isMesh || OVERHEAD_OK.test(n.name)) return;
      const b = new T.Box3().setFromObject(n);
      const w = b.max.x - b.min.x, d = b.max.z - b.min.z, h = b.max.y - b.min.y;
      const localBottom = b.min.y - (new T.Vector3().setFromMatrixPosition(dome.matrixWorld)).y;
      /* A wide thin ring is fine; a wide thin PLATE is not. An openEnded
         cylinder is a band with nothing across it, so it cannot occlude — only
         flag capped cylinders and boxes. Without this the ring beam trips the
         check after being correctly fixed. */
      const g = n.geometry && n.geometry.parameters;
      const isBand = g && g.openEnded === true;
      if (!isBand && w > R * 0.8 && d > R * 0.8 && h < 2.0 && localBottom > floorY + 1.5) {
        out.push('DOME-PLATE ' + n.name + ' spans ' + w.toFixed(1) +
          ' at y+' + localBottom.toFixed(1) + (g && g.openEnded === false ? ' (capped cylinder)' : ''));
      }
    });
    /* 2. by ray, which is what actually decides whether you can see in.
       Down the crown at several points: the first hit under the glazing must
       be planting or ground, never a panel. */
    const meshes = [];
    dome.traverse(n => { if (n.isMesh) meshes.push(n); });
    const rc = new T.Raycaster();
    const origin = new T.Vector3().setFromMatrixPosition(dome.matrixWorld);
    const samples = [[0, 0.45], [0.5, 0], [-0.5, 0.2], [0.2, -0.55], [-0.3, -0.3]];
    samples.forEach(([fx, fz], i) => {
      const p = new T.Vector3(origin.x + fx * R, origin.y + crownY + 4, origin.z + fz * R);
      rc.set(p, new T.Vector3(0, -1, 0));
      rc.near = 0; rc.far = crownY + 12;
      const hits = rc.intersectObjects(meshes, false);
      const blocker = hits.find(h => !OVERHEAD_OK.test(h.object.name) &&
        h.point.y - origin.y > floorY + 1.5);
      if (blocker) out.push('DOME-SIGHTLINE ray' + i + ' in ' + dome.name +
        ' blocked by ' + blocker.object.name + ' at y+' +
        (blocker.point.y - origin.y).toFixed(1));
    });
  });
  return out;
}

/* The planting has to cover the floor, not decorate it. */
export function checkDomePlanting(port) {
  const out = [];
  port.updateMatrixWorld(true);
  port.traverse(dome => {
    if (!/^dome\d+$/.test(dome.name) || !dome.userData.interiorRadius) return;
    const R = dome.userData.interiorRadius;
    const wallH = dome.userData.wallH || 0;
    /* The domes grow VINES now, in rows, so the planting is counted by row and
       not by canopy. The height rule that came with the trees is gone with
       them and deliberately: a vineyard is chest high by nature, it cannot
       clear a stem wall, and demanding that it does would only be the old
       assertion outliving the thing it was written about. What matters for a
       row crop is that the rows are THERE and that they cover the floor, which
       is what the two assertions below now say. */
    let rows = 0, cover = 0, vineLen = 0, wind = 0, windTall = 0;
    dome.traverse(n => {
      /* Measure the ROW, not its posts. Summing each post's own box added up
         0.12 at a time and called a 26m dome under-planted. */
      if (!n.isMesh && /VineRow\d+$/.test(n.name)) {
        rows++;
        const b = new T.Box3().setFromObject(n);
        vineLen += Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
        return;
      }
      if (!n.isMesh) return;
      if (/Windbreak\d+Spire0$/.test(n.name)) {
        wind++;
        const b = new T.Box3().setFromObject(n);
        const base = new T.Vector3().setFromMatrixPosition(dome.matrixWorld).y;
        if (b.max.y - base > wallH) windTall++;
      }
      if (/Shrub|Bed\d+Soil|Ground$/.test(n.name)) {
        const b = new T.Box3().setFromObject(n);
        cover += (b.max.x - b.min.x) * (b.max.z - b.min.z);
      }
    });
    const floorArea = Math.PI * R * R;
    if (rows < 3) out.push('DOME-BARE ' + dome.name + ' only ' + rows + ' vine rows');
    /* Rows have to SPAN the floor, not sit in a corner of it: three stubs
       against one wall satisfy a count and still leave a bare dome. */
    /* The windbreak is the planting that has to CLEAR THE STEM WALL — the old
       rule, asked of the plant that can satisfy it. Without it a dome reads
       from outside at eye level as glazing over bare concrete. */
    if (wind < 6) out.push('DOME-NO-WINDBREAK ' + dome.name + ' ' + wind + ' trees');
    if (wind && windTall / wind < 0.8)
      out.push('DOME-WINDBREAK-BEHIND-WALL ' + dome.name + ' ' + windTall + '/' + wind +
        ' clear the ' + wallH.toFixed(1) + ' stem wall');
    if (rows && vineLen < R * 2.0)
      out.push('DOME-ROWS-TOO-SHORT ' + dome.name + ' ' + vineLen.toFixed(1) +
        ' of row run against a floor ' + (R * 2).toFixed(1) + ' across');
    if (cover / floorArea < 0.35)
      out.push('DOME-FLOOR-BARE ' + dome.name + ' cover ' +
        (100 * cover / floorArea).toFixed(0) + '% of floor');
  });
  return out;
}

export function checkGrounded(port) {
  port.updateMatrixWorld(true);
  const b = new T.Box3().setFromObject(port);
  return Math.abs(b.min.y) > 1e-3 ? ['NOT-GROUNDED min.y ' + b.min.y.toFixed(3)] : [];
}

export function checkCityPort(port) {
  return [].concat(checkGrounded(port), checkDomeSightline(port), checkDomePlanting(port));
}

export function checkAllCityPorts(label = 'CP-01') {
  return ['S', 'M', 'L'].map(size => {
    const probs = checkCityPort(buildCityPort(label, size));
    return { size, problems: probs.length, detail: probs.join(' | ') };
  });
}
