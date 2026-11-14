/* How much of a ground port is UNDER the ground?
 *
 *     node tools/electron-probe.cjs tools/probe-portdepth.js "Claude outputs\depth"
 *
 * Astra, 2026-11-14: "for ground ports, perhaps the projection should show
 * the underground portion?" A ground port in this game is a shaft cut DOWN
 * into rock, so the thing that makes it a ground port is below the plate -
 * and the portrait looks down at 35 degrees, the one angle that puts the
 * plate between the eye and everything worth seeing.
 *
 * Before changing the shot, measure what is in the mesh: for each pattern,
 * how far it runs below the ground line and above it, and whether the
 * plate is a part of its own that could simply be left out. */
const S = window.Screens, R = window.Render;
await wait(600);

const gs = S.catGroups();
const pi = gs.findIndex(g => g.id === 'ports');
if (pi < 0) { log('FAIL: no PORTS tab'); return 'no ports'; }
const ports = gs[pi].items;

/* The ground line: histogram the vertices by z and take the fullest
 * bucket. A flat plate IS a spike of vertices at one height, so this finds
 * the surface even though the portrait mesh has been recentred. */
function split(mesh) {
  if (!mesh || !mesh.v || !mesh.v.length) return null;
  const zs = mesh.v.map(p => p[2]);
  const lo = Math.min(...zs), hi = Math.max(...zs);
  const N = 64, span = (hi - lo) || 1, bins = new Array(N).fill(0);
  zs.forEach(z => { bins[Math.min(N - 1, Math.floor((z - lo) / span * N))]++; });
  let peak = 0, peakI = 0;
  bins.forEach((n, i) => { if (n > peak) { peak = n; peakI = i; } });
  const ground = lo + (peakI + 0.5) / N * span;
  return { lo, hi, ground, below: ground - lo, above: hi - ground,
           peak, verts: zs.length };
}

log('pattern              below   above   below%  plate v   shell/city/spin faces');
ports.forEach(e => {
  let mesh = null;
  try { mesh = R.portPortraitMesh(e.portKey); } catch (err) { log('  ' + e.portKey + ' threw ' + err.message); return; }
  const s = split(mesh);
  if (!s) { log('  ' + e.portKey + ' no mesh'); return; }
  const lib = R.libPort(e.portKey) || {};
  const f = m => (m && m.f ? m.f.length : 0);
  const pct = Math.round(100 * s.below / ((s.below + s.above) || 1));
  log('  ' + String(e.name || e.portKey).padEnd(20) +
      s.below.toFixed(1).padStart(7) +
      s.above.toFixed(1).padStart(8) +
      (pct + '%').padStart(8) +
      String(Math.round(100 * s.peak / s.verts) + '%').padStart(9) +
      ('   ' + f(lib.shell) + '/' + f(lib.city) + '/' + f(lib.spin)));
});

/* And for the ground ports specifically: is the plate separable? Measure
 * each library part's own z-range, so a part that is ONLY the flat plate
 * shows up as a part with almost no thickness. */
log('');
log('the parts of each ground port, by their own thickness');
ports.forEach(e => {
  const lib = R.libPort(e.portKey);
  if (!lib) return;
  const rows = [];
  ['shell', 'city', 'spin'].forEach(k => {
    const m = lib[k];
    if (!m || !m.v || !m.v.length) return;
    const zs = m.v.map(p => p[2]);
    const lo = Math.min(...zs), hi = Math.max(...zs);
    rows.push(k + ' z ' + lo.toFixed(0) + '..' + hi.toFixed(0) +
              ' (' + (hi - lo).toFixed(0) + ' thick, ' + m.f.length + 'f)');
  });
  if (rows.length) log('  ' + String(e.name || e.portKey).padEnd(20) + rows.join('   '));
});
