/* probe-panel-sizes.js - for tools/electron-probe.cjs: every hull's cockpit
 * size as the running game measures it (with the hull models loaded, which
 * node tests do not have), and what the no-overlap rule (Render.mfdLayout)
 * lifts in each fit. No screenshots; a table in the RESULT line.
 *
 *     node tools/electron-probe.cjs tools/probe-panel-sizes.js "<outdir>"
 */
const Combat = window.Combat, Render = window.Render;
await wait(1500);
const rows = [];
for (const id of Object.keys(Combat.HULLS)) {
  for (const look of [0, 1, 2]) {
    const spec = Render.cockpitSpec({ hullId: id, bornId: id + '-probe', cockpitLook: look });
    const L = Render.mfdLayout(spec);
    const up = Object.keys(L.lift).filter(k => L.lift[k] > 0).map(k => k + '+' + Math.round(L.lift[k] * 100));
    rows.push(id + ' ' + 'ABC'[look] + ' size ' + spec.size.toFixed(2) + (up.length ? ' ' + up.join(',') : ''));
  }
}
return rows.join(' | ');
