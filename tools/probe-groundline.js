/* Where is the surface, in the library's own coordinates?
 *
 *     node tools/electron-probe.cjs tools/probe-groundline.js "Claude outputs\gl"
 *
 * If a ground port's model is built with the plate at z = 0 and the shaft
 * running down into negative z, the sectional cut has a principled line to
 * cut along and needs no histogram guessing. Measure before deciding. */
const S = window.Screens, R = window.Render;
await wait(600);
const gs = S.catGroups();
const pi = gs.findIndex(g => g.id === 'ports');
const ports = gs[pi].items;

log('pattern               part     z lo      z hi   at z~0   below0');
ports.forEach(e => {
  /* A port key is pattern [+ owner] + size, e.g. pad-site-m or
   * mountain-site-navy-l, so the pattern's own -site tail is not at the
   * end of the key. Same split lore.js makes. */
  if (!/-site(?:-(?:navy|syn))?-[sml]$/.test(e.portKey)) return;
  const lib = R.libPort(e.portKey);
  if (!lib) { log('  ' + e.portKey + ': no lib'); return; }
  ['shell', 'city', 'spin'].forEach(k => {
    const m = lib[k];
    if (!m || !m.v || !m.v.length) return;
    const zs = m.v.map(p => p[2]);
    const lo = Math.min(...zs), hi = Math.max(...zs);
    const span = (hi - lo) || 1;
    const nearZero = zs.filter(z => Math.abs(z) < span * 0.02).length;
    const below = zs.filter(z => z < 0).length;
    log('  ' + String(e.name || e.portKey).padEnd(20) +
        k.padEnd(7) +
        lo.toFixed(1).padStart(9) + hi.toFixed(1).padStart(10) +
        (Math.round(100 * nearZero / zs.length) + '%').padStart(9) +
        (Math.round(100 * below / zs.length) + '%').padStart(9));
  });
});
