/* WHICH WAY IS UP in a PortLib model?
 *
 *     node tools/electron-probe.cjs tools/probe-portaxes.js "Claude outputs\axes"
 *
 * Astra, 2026-11-14: "the projection reads as tilted on its side - all of
 * them do." The isometric camera treats +z as up (camDir is
 * (cos p cos y, cos p sin y, sin p), so z is the vertical). If the library
 * builds its ports around some other axis, every portrait is drawn lying
 * down, and no amount of sectioning fixes that.
 *
 * A ring station settles it on its own: a wheel is wide in two axes and
 * thin in the third, and the thin one IS its axle. Print the extents and
 * the answer reads straight off the table. */
const S = window.Screens, R = window.Render;
await wait(600);
const gs = S.catGroups();
const pi = gs.findIndex(g => g.id === 'ports');

log('pattern               dx       dy       dz    thinnest   shape');
gs[pi].items.forEach(e => {
  const lib = R.libPort(e.portKey);
  const m = lib && (lib.shell || lib.city);
  if (!m || !m.v || !m.v.length) { log('  ' + e.portKey + ': no mesh'); return; }
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  m.v.forEach(p => {
    for (let a = 0; a < 3; a++) {
      if (p[a] < lo[a]) lo[a] = p[a];
      if (p[a] > hi[a]) hi[a] = p[a];
    }
  });
  const d = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const names = ['x', 'y', 'z'];
  let thin = 0;
  for (let a = 1; a < 3; a++) if (d[a] < d[thin]) thin = a;
  const big = Math.max(...d), small = Math.min(...d);
  const shape = (small / big < 0.35) ? ('flat, thin in ' + names[thin]) : 'chunky';
  log('  ' + String(e.name || e.portKey).padEnd(20) +
      d[0].toFixed(2).padStart(7) + d[1].toFixed(2).padStart(9) + d[2].toFixed(2).padStart(9) +
      ('  ' + names[thin]).padStart(11) + '   ' + shape);
});

/* And the same question asked of something whose answer is not in doubt:
 * the ship hulls, which are certainly modelled nose-forward and upright. */
log('');
log('for comparison, a hull the library also holds');
try {
  const h = R.hullMesh ? R.hullMesh('talon') : null;
  if (h && h.v && h.v.length) {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    h.v.forEach(p => { for (let a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; } });
    log('  talon                ' + (hi[0] - lo[0]).toFixed(2).padStart(6) +
        (hi[1] - lo[1]).toFixed(2).padStart(9) + (hi[2] - lo[2]).toFixed(2).padStart(9) +
        '   (a ship is long in its forward axis and thin in its up axis)');
  } else { log('  (no hullMesh on Render)'); }
} catch (err) { log('  hull: ' + err.message); }
