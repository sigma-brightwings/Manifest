/* probe-interior.js - planetary interiors slice 4: the INTERIOR cutaway
 * (2026-11-22). In the starting system: a rocky world with an inner core,
 * cut at gravimeter grades 1, 2 and 4 with a swept magnetometer; an ocean
 * moon of a giant at grade 2, where the induced field shows the water the
 * gravimeter alone cannot; a gas giant at grade 2; and a world with no
 * gravimeter and no magnetometer, which should be all "unmeasured".
 *
 * Set directly, and said so: the instrument grades (Combat.gravLevel and
 * magLevel overridden), the lock, the scanner layer and plane, and a
 * survey record marked fully swept by the magnetometer. Scratch profile.
 *
 *     node tools/electron-probe.cjs tools/probe-interior.js "<outdir>"
 */
const G = window.Game, Sv = window.Survey, In = window.Interior;
G.title = null; G.tutorial = null; G.menu = null;
G.showHelp = false; G.showCatalogue = false;
const out = [];
const ws = G.sys.bodies.filter(b => (b.kind === 'planet' || b.kind === 'moon') && In.of(b, G.sys));
const rocky = ws.filter(b => { const I = In.of(b, G.sys); return I.crustKm > 0 && I.layers.some(L => L.name === 'inner core') && I.layers.some(L => L.name === 'outer core'); })
                .sort((a, b) => b.radius - a.radius)[0];
const ocean = ws.find(b => { const I = In.of(b, G.sys); return I.oceanKm > 0 && b.parentBody && b.parentBody.magnetosphere; });
const giant = ws.find(b => In.TYPE[In.of(b, G.sys).type].giant);
const full = Sv.packCells(new Uint8Array(Sv.NCELL).fill(1));
let grav = 0, mag = 0;
window.Combat.gravLevel = () => grav;
window.Combat.magLevel = () => mag;
const lock = (b, swept) => {
  G.lock = b; G.focus = b; G.navTarget = { kind: 'body', id: b.id };
  const key = Sv.keyOf(G, b.id);
  G.surveys = G.surveys || {};
  G.surveys[key] = swept ? { key, cov: 0, covM: 1, cells: '', cellsM: full, t: G.t || 0, grade: 0 } : undefined;
};
G.panel = 11;
async function cut(b, g, m, tag, plane) {
  if (!b) { out.push(tag + ': none in ' + G.sys.name); return; }
  grav = g; mag = m;
  lock(b, m > 0);
  G.scanUI = { layer: 'int', filter: 0, lines: false, style: 0, sweep: 1, zoom: 0, plane: plane || 'xy' };
  await wait(450);
  const M = In.measured(b, G.sys, { grav: g, mag: m > 0, covM: m > 0 ? 1 : 0, dipole: !!(Sv.magMap(b, G.sys) || {}).dipole });
  out.push(tag + ': ' + b.name + ' [' + In.of(b, G.sys).type + '] g' + g + (m ? '+mag' : '') + '\n  ' +
           M.bands.map(x => x.label + ' ' + x.topKm + '–' + x.botKm).join(' | ') +
           (M.lines.length ? '\n  ' + M.lines.map(L => L.name + ' ' + L.km).join(', ') : '') +
           (M.notes.length ? '\n  ' + M.notes.join('; ') : ''));
  await shot(tag);
}
await cut(rocky, 1, 1, 'int-rocky-g1');
await cut(rocky, 2, 1, 'int-rocky-g2');
await cut(rocky, 4, 1, 'int-rocky-g4', 'yz');
await cut(ocean, 2, 1, 'int-ocean-g2');
await cut(giant, 2, 1, 'int-giant-g2');
await cut(rocky, 0, 1, 'int-magonly');
await cut(rocky, 0, 0, 'int-none');
return out.join('\n');
