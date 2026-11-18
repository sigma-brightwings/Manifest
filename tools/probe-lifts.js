/* probe-lifts.js - every inclined lift car in the port library, measured
 * (2026-11-18). Model units are the port's radius; at a 1.32 km station
 * one unit is 1320 m. */
const R = window.Render;
const out = [];
for (const id of R.portIds()) {
  const lib = R.libPort(id);
  if (!lib) { out.push(id + ': not loaded'); continue; }
  (lib.movers || []).forEach(mv => {
    const ax = mv.axis || [0, 0, 0];
    const az = Math.abs(ax[2]), hz = Math.hypot(ax[0], ax[1]);
    const kind = !mv.axis ? 'fixed' : az > 0.97 ? 'plumb' : az < 0.15 ? 'flat' : 'INCLINED';
    const ex = mv.max[0] - mv.min[0], ey = mv.max[1] - mv.min[1], ez = mv.max[2] - mv.min[2];
    out.push(id + ' ' + mv.node + ' ' + kind + ' axis ' + ax.map(v => v.toFixed(2)).join(',') +
      ' box ' + [ex, ey, ez].map(v => (v * 1320).toFixed(0)).join('x') + ' m@1.32km' +
      ' range ' + mv.range.map(v => (v * 1320).toFixed(0)).join('..') +
      ' deck-min ' + ((mv.deck - mv.min[2]) * 1320).toFixed(0) + ' level ' + !!mv.level);
  });
}
return out.join('\n');
