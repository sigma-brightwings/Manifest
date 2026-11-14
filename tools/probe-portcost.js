/* What a port portrait costs against how many faces it keeps.
 *     node tools/electron-probe.cjs tools/probe-portcost.js "Claude outputs\portcost"
 *
 * 4,200 faces measured 16-19 ms a frame, which is the whole of a 60 Hz
 * budget for one thumbnail. This finds the curve so the budget is chosen
 * against a measurement rather than against a guess - and says whether a
 * budget exists that is both cheap enough and still looks like a station.
 */
const G = window.Game, R = window.Render;
G.title = null; G.tutorial = null; G.menu = null;

const KEYS = ['cylinder-m', 'yard-m', 'skimmer-m', 'pad-site-m'];
const BUDGETS = [4200, 2400, 1400, 800, 450, 250];

const cv = document.createElement('canvas');
cv.width = 430; cv.height = 430;
const c2 = cv.getContext('2d');

/* Warm the JIT so the first row is not an outlier. */
R.portPortraitMesh('cylinder-m');
for (let k = 0; k < 20; k++) R.drawPortPortrait(c2, 0, 0, 430, 'cylinder-m', k * 0.3);

log('faces'.padStart(6) + KEYS.map(k => k.padStart(14)).join('') + '      median ms');
const rows = [];
for (const b of BUDGETS) {
  const times = [];
  for (const key of KEYS) {
    const lib = R.libPort(key);
    const parts = [lib.shell, lib.city, lib.spin].filter(m => m && m.f && m.f.length);
    let merged = parts[0];
    if (parts.length > 1) {
      const v = [], f = [], c = [];
      for (const m of parts) {
        const base = v.length;
        for (const p of m.v) v.push(p);
        for (let j = 0; j < m.f.length; j++) {
          f.push([m.f[j][0] + base, m.f[j][1] + base, m.f[j][2] + base]);
          c.push(m.c ? m.c[j] : '#8fa3ac');
        }
      }
      merged = { v, f, c };
    }
    const small = R.decimateMesh(merged, b);
    /* Centre it, the way portPortraitMesh does. */
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of small.v) for (let a = 0; a < 3; a++) {
      if (p[a] < lo[a]) lo[a] = p[a];
      if (p[a] > hi[a]) hi[a] = p[a];
    }
    const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const mesh = { v: small.v.map(p => [p[0] - mid[0], p[1] - mid[1], p[2] - mid[2]]),
                   f: small.f, c: small.c };
    /* Paint it the way drawPortPortrait does, through paintMesh. */
    const runs = [];
    for (let k = 0; k < 12; k++) {
      const cam = new (R.Camera || Object)();
      const a0 = performance.now();
      R.paintPortraitProbe
        ? R.paintPortraitProbe(c2, mesh, 430, k * 0.3)
        : R.drawPortPortrait(c2, 0, 0, 430, 'cylinder-m', k * 0.3);
      runs.push(performance.now() - a0);
    }
    runs.sort((x, y) => x - y);
    times.push({ key, faces: mesh.f.length, ms: runs[6] });
  }
  rows.push({ b, times });
  log(String(b).padStart(6) + times.map(t => (t.faces + '/' + t.ms.toFixed(1)).padStart(14)).join(''));
}
log('');
log('(faces kept / median ms per paint, at the card size of 430 px)');
return 'ok';
