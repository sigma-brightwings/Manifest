/* probe-xlbays.js — do the bays that take XL hulls fit a Capital at 250 m
 * and a Carrier at 300 m? (2026-10-25, true-size question.)
 *
 *     node tools/electron-probe.cjs tools/probe-xlbays.js "Claude outputs\xlbays"
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, R = window.Render;
G.title = null;
const need = {};
for (const [id, L] of [['capital', 0.25], ['carrier', 0.30], ['crawler', 0.025]]) {
  const kind = Combat.HULLS[id].mesh, sp = R.hullSpan(kind);
  need[id] = [sp.w / sp.l * L, sp.h / sp.l * L, L];
}
const rows = [];
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
let seen = 0;
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const p of G.sys.bodies.filter(b => b.market && Combat.takesXL && Combat.takesXL(b))) {
    seen++;
    const boxes = Sim.berthBoxes ? Sim.berthBoxes(p) : null;
    const role = p.market.role + (p.fleet ? '/fleet' : '');
    const model = R.portModelFor ? R.portModelFor(p) : '?';
    const big = boxes ? boxes.filter(Boolean).map(b => b.slice().sort((x, y) => y - x)).sort((a, b) => b[0] - a[0])[0] : null;
    const fit = id => big ? need[id].slice().sort((x, y) => y - x).every((v, k) => v <= big[k]) : null;
    rows.push(role + ' ' + model + ' r=' + (p.radius || 0).toFixed(2) + 'km  biggest bay ' + (big ? big.map(v => (v * 1000).toFixed(0)).join('x') + ' m' : 'none') +
              '  capital ' + fit('capital') + ' carrier ' + fit('carrier'));
    if (rows.length > 30) break;
  }
  if (rows.length > 30) break;
}
return 'need capital ' + need.capital.map(v => (v * 1000).toFixed(0)).join('x') + ' m, carrier ' + need.carrier.map(v => (v * 1000).toFixed(0)).join('x') +
       ' m\n' + seen + ' XL ports\n' + rows.join('\n');
