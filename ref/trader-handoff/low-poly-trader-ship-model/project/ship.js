import * as THREE from 'three';

const stage = document.querySelector('three-d-stage');
const { THREE: T } = await stage.ready;

// palette — gunmetal-green hull, dark panel, mustard accent
const COLORS = {
  hull: 0x8f9a8e,
  panel: 0x4f544c,
  glass: 0x1c2620,
  engineHousing: 0x33362f,
  glow: 0xe0b23a,
  accent: 0xd6c24a
};

const matHull = new T.MeshStandardMaterial({ color: COLORS.hull, roughness: 0.6, metalness: 0.35, name: 'hullPlating' });
const matPanel = new T.MeshStandardMaterial({ color: COLORS.panel, roughness: 0.65, metalness: 0.3, name: 'hullPanel' });
const matGlass = new T.MeshStandardMaterial({ color: COLORS.glass, roughness: 0.1, metalness: 0.2, name: 'canopyGlass' });
const matEngine = new T.MeshStandardMaterial({ color: COLORS.engineHousing, roughness: 0.5, metalness: 0.4, name: 'engineHousing' });
const matGlow = new T.MeshStandardMaterial({ color: 0x2a1c0a, emissive: COLORS.glow, emissiveIntensity: 2.2, roughness: 0.9, metalness: 0.0, name: 'engineGlow' });
const matAccent = new T.MeshStandardMaterial({ color: COLORS.accent, roughness: 0.5, metalness: 0.25, name: 'accentTrim' });

const ship = new T.Group();
ship.name = 'traderShip';

function box(w, h, d, mat, name) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// --- hull, built as three stepped boxy sections (main / nose / tip) ---
const hullMain = box(1.5, 0.9, 2.4, matHull, 'hullMain');
hullMain.position.set(0, 0.45, 0);
ship.add(hullMain);

const hullNose = box(1.0, 0.65, 0.9, matHull, 'hullNose');
hullNose.position.set(0, 0.42, 1.5);
ship.add(hullNose);

const hullNoseTip = box(0.55, 0.4, 0.5, matPanel, 'hullNoseTip');
hullNoseTip.position.set(0, 0.38, 2.05);
ship.add(hullNoseTip);

// cockpit canopy, embedded into forward hull top
const cockpit = box(0.62, 0.3, 0.68, matGlass, 'cockpitCanopy');
cockpit.position.set(0, 0.85, 0.85);
ship.add(cockpit);

// stub side fins
const finGeo = new T.BoxGeometry(0.2, 0.45, 1.3);
const finL = new T.Mesh(finGeo, matPanel); finL.name = 'sideFinLeft'; finL.castShadow = true; finL.receiveShadow = true;
finL.position.set(-0.85, 0.4, -0.35);
const finR = finL.clone(); finR.name = 'sideFinRight'; finR.position.x = 0.85;
ship.add(finL, finR);

// rear vertical stabilizer
const topFin = box(0.15, 0.6, 0.7, matPanel, 'stabilizerFin');
topFin.position.set(0, 0.9, -0.9);
ship.add(topFin);

// accent trim decal along hull top
const accentStripe = box(1.2, 0.03, 1.9, matAccent, 'accentStripe');
accentStripe.position.set(0, 0.916, 0.2);
ship.add(accentStripe);

// small panel greebles along hull sides
const greebleGeo = new T.BoxGeometry(0.06, 0.22, 0.3);
const greeblePositions = [
  [-0.76, 0.45, 0.6], [-0.76, 0.45, -0.1], [-0.76, 0.45, -0.7],
  [0.76, 0.45, 0.6], [0.76, 0.45, -0.1], [0.76, 0.45, -0.7]
];
greeblePositions.forEach((p, i) => {
  const g = new T.Mesh(greebleGeo, matPanel);
  g.name = 'ventGreeble' + i;
  g.castShadow = true; g.receiveShadow = true;
  g.position.set(...p);
  ship.add(g);
});

// --- engines, mounted on the back ---
const RADIAL_SEGMENTS = 8; // low-poly, faceted
function buildEngine(x) {
  const grp = new T.Group();
  grp.name = x < 0 ? 'engineLeft' : 'engineRight';

  const housing = new T.Mesh(new T.CylinderGeometry(0.32, 0.36, 0.9, RADIAL_SEGMENTS), matEngine);
  housing.name = 'engineHousing';
  housing.rotation.x = Math.PI / 2;
  housing.castShadow = true; housing.receiveShadow = true;
  grp.add(housing);

  const ring = new T.Mesh(new T.CylinderGeometry(0.36, 0.36, 0.08, RADIAL_SEGMENTS), matPanel);
  ring.name = 'engineIntakeRing';
  ring.rotation.x = Math.PI / 2;
  ring.position.z = 0.44;
  ring.castShadow = true; ring.receiveShadow = true;
  grp.add(ring);

  const glow = new T.Mesh(new T.CylinderGeometry(0.24, 0.24, 0.05, RADIAL_SEGMENTS), matGlow);
  glow.name = 'engineGlow';
  glow.rotation.x = Math.PI / 2;
  glow.position.z = -0.46;
  grp.add(glow);

  grp.position.set(x, 0.45, -1.5);
  return grp;
}
ship.add(buildEngine(-0.5), buildEngine(0.5));

// spine antenna greeble
const antennaMast = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.35, 6), matPanel);
antennaMast.name = 'antennaMast';
antennaMast.position.set(0, 1.05, -0.85);
antennaMast.castShadow = true;
const antennaTip = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), matAccent);
antennaTip.name = 'antennaTip';
antennaTip.position.set(0, 1.23, -0.85);
ship.add(antennaMast, antennaTip);

// center on origin, rest lowest point at y = 0
const box3 = new T.Box3().setFromObject(ship);
const center = box3.getCenter(new T.Vector3());
ship.position.x -= center.x;
ship.position.z -= center.z;
ship.position.y -= box3.min.y;

stage.setObject(ship);
