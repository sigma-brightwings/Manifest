/* probe-landings.js - is each level pad flush with its landings (2026-11-18)?
 * At each end of every inclined car's run: the floor just off the pad's
 * edge on that landing (vertical cast, cars lifted out) against the pad's
 * deck there. Positive = the landing stands above the pad (a step up off
 * it); negative = the pad stands above the landing. Metres at 1.32 km. */
const R = window.Render, Mm = 1320;
function hit(o, d, a, b, c) {
  const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const p = [d[1]*e2[2]-d[2]*e2[1], d[2]*e2[0]-d[0]*e2[2], d[0]*e2[1]-d[1]*e2[0]];
  const det = e1[0]*p[0]+e1[1]*p[1]+e1[2]*p[2]; if (Math.abs(det) < 1e-14) return -1;
  const inv = 1/det, t0 = [o[0]-a[0], o[1]-a[1], o[2]-a[2]];
  const u = (t0[0]*p[0]+t0[1]*p[1]+t0[2]*p[2])*inv; if (u < 0 || u > 1) return -1;
  const q = [t0[1]*e1[2]-t0[2]*e1[1], t0[2]*e1[0]-t0[0]*e1[2], t0[0]*e1[1]-t0[1]*e1[0]];
  const v = (d[0]*q[0]+d[1]*q[1]+d[2]*q[2])*inv; if (v < 0 || u+v > 1) return -1;
  const t = (e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2])*inv; return t > 1e-7 ? t : -1;
}
const out = [];
for (const id of ['cradle-l', 'cylinder-l', 'spine-l', 'spine-m', 'skimmer-l', 'skimmer-syn-l']) {
  const lib = R.libPort(id); if (!lib) continue;
  const SH = lib.shell;
  for (const mv of lib.movers || []) {
    if (!mv.level) continue;
    const L = mv.level, ax = mv.axis, [ux, uy] = L.uphill;
    const near = [];
    for (const f of SH.f) {
      const a = SH.v[f[0]], b = SH.v[f[1]], c = SH.v[f[2]];
      const span = Math.abs(mv.range[1] - mv.range[0]) + L.hl * 3;
      if (Math.max(a[0], b[0], c[0]) < mv.mid[0] - span || Math.min(a[0], b[0], c[0]) > mv.mid[0] + span) continue;
      if (Math.max(a[1], b[1], c[1]) < mv.mid[1] - span || Math.min(a[1], b[1], c[1]) > mv.mid[1] + span) continue;
      near.push([a, b, c]);
    }
    function floorAt(x, y, z) {
      let best = Infinity;
      for (const t of near) { const h = hit([x, y, z], [0, 0, -1], t[0], t[1], t[2]); if (h > 0 && h < best) best = h; }
      return isFinite(best) ? z - best : null;
    }
    const row = [id + ' ' + mv.node];
    for (const s of mv.range) {
      const deck = mv.deck + ax[2] * s;
      const cx = mv.mid[0] + ax[0] * s, cy = mv.mid[1] + ax[1] * s;
      /* Which landing is this end: the top end runs out uphill, the foot downhill. */
      const upEnd = ax[2] * (s - (mv.range[0] + mv.range[1]) / 2) > 0;
      const dir = upEnd ? 1 : -1;
      const off = L.hl * 1.15;
      const fl = floorAt(cx + ux * dir * off, cy + uy * dir * off, deck + L.hl * 0.6);
      row.push((upEnd ? 'top' : 'foot') + ' landing ' + (fl === null ? 'none' : ((fl - deck) * Mm).toFixed(1) + ' m vs deck'));
    }
    out.push(row.join(' | '));
  }
}
return out.join('\n');
