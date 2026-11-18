/* probe-shafts.js - how much room an inclined lift's bore has (2026-11-18).
 * Along each inclined car's run, from the car's centre: the floor below
 * and the ceiling above (vertical casts against the hull without its cars),
 * and the walls across. Metres at a 1.32 km station. */
const R = window.Render;
const M = 1320;
function hit(o, d, a, b, c) {
  const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const p = [d[1]*e2[2]-d[2]*e2[1], d[2]*e2[0]-d[0]*e2[2], d[0]*e2[1]-d[1]*e2[0]];
  const det = e1[0]*p[0]+e1[1]*p[1]+e1[2]*p[2];
  if (Math.abs(det) < 1e-14) return -1;
  const inv = 1/det, t0 = [o[0]-a[0], o[1]-a[1], o[2]-a[2]];
  const u = (t0[0]*p[0]+t0[1]*p[1]+t0[2]*p[2])*inv; if (u < 0 || u > 1) return -1;
  const q = [t0[1]*e1[2]-t0[2]*e1[1], t0[2]*e1[0]-t0[0]*e1[2], t0[0]*e1[1]-t0[1]*e1[0]];
  const v = (d[0]*q[0]+d[1]*q[1]+d[2]*q[2])*inv; if (v < 0 || u+v > 1) return -1;
  const t = (e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2])*inv; return t > 1e-7 ? t : -1;
}
function tris(mesh, near, reach) {
  const out = [];
  for (const f of mesh.f) {
    const a = mesh.v[f[0]], b = mesh.v[f[1]], c = mesh.v[f[2]];
    let far = false;
    for (let k = 0; k < 3; k++) {
      const lo = Math.min(a[k], b[k], c[k]), hi = Math.max(a[k], b[k], c[k]);
      if (lo > near[k] + reach || hi < near[k] - reach) { far = true; break; }
    }
    if (!far) out.push([a, b, c]);
  }
  return out;
}
function cast(T, o, d) { let best = Infinity; for (const t of T) { const h = hit(o, d, t[0], t[1], t[2]); if (h > 0 && h < best) best = h; } return best; }
const out = [];
for (const id of ['cradle-l', 'cylinder-l', 'spine-l', 'skimmer-l', 'pad-site-l']) {
  const lib = R.libPort(id);
  if (!lib) { out.push(id + ' not loaded'); continue; }
  for (const mv of (lib.movers || [])) {
    const ax = mv.axis; if (!ax || Math.abs(ax[2]) > 0.97 || Math.abs(ax[2]) < 0.15) continue;
    const span = (mv.range[1] - mv.range[0]);
    const T = tris(lib.shell, [mv.mid[0] + ax[0] * span / 2, mv.mid[1] + ax[1] * span / 2, mv.mid[2] + ax[2] * span / 2], span + 0.2);
    const hzl = Math.hypot(ax[0], ax[1]);
    const across = [-ax[1] / hzl, ax[0] / hzl, 0];
    const rows = [];
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const s = mv.range[0] + span * f;
      const o = [mv.mid[0] + ax[0] * s, mv.mid[1] + ax[1] * s, mv.deck + ax[2] * s + 0.002];
      const dn = cast(T, o, [0, 0, -1]), up = cast(T, o, [0, 0, 1]);
      const l = cast(T, o, across), r = cast(T, o, across.map(v => -v));
      rows.push('f' + f + ' floor ' + (dn * M).toFixed(0) + ' ceil ' + (up * M).toFixed(0) + ' walls ' + (l * M).toFixed(0) + '/' + (r * M).toFixed(0));
    }
    out.push(id + ' ' + mv.node + ' tris ' + T.length + ' | ' + rows.join(' | '));
  }
}
return out.join('\n');
