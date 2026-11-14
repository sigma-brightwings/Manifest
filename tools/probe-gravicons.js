/* The four gravimeter icons in the catalogue, one shot each.
 *     node tools/electron-probe.cjs tools/probe-gravicons.js "Claude outputs\gravicons"
 *
 * Astra made four distinct models rather than one for the whole ladder, so
 * what this has to show is that each grade is a DIFFERENT instrument in the
 * card - not that the tier fallback quietly served grade I four times.
 */
const G = window.Game, S = window.Screens, R = window.Render;
G.panel = 0; G.tutorial = null; G.showHelp = false; G.menu = null; G.title = null;

const IDS = ['gravI', 'gravII', 'gravIII', 'gravIV'];
const keys = IDS.map(id => R.itemKey(id));
log('keys: ' + keys.join(', '));
if (keys.some(k => !k)) return 'FAIL: a gravimeter still has no model';
if (new Set(keys).size !== 4) return 'FAIL: the rungs share art - the tier fallback is firing';

/* Vertex counts, as a cheap proof the four meshes really are different. */
const M = window.ItemModels;
log('vertices: ' + keys.map(k => k + ' ' + (M[k].v.length / 3)).join(', '));

G.showCatalogue = true;
G.catalogue = { group: 0, sel: 0, scroll: 0 };
await wait(400);

/* Find the group and index that holds each gravimeter and photograph it. */
const gs = S.catGroups();
for (let i = 0; i < IDS.length; i++) {
  let found = null;
  for (let g = 0; g < gs.length && !found; g++) {
    const n = gs[g].items.findIndex(it => (it.id || it) === IDS[i]);
    if (n >= 0) found = { g, n, label: gs[g].label };
  }
  if (!found) { log(IDS[i] + ': not on the catalogue at all'); continue; }
  G.catalogue.group = found.g;
  G.catalogue.sel = found.n;
  G.catalogue.scroll = Math.max(0, found.n - 6);
  await wait(420);
  log(IDS[i] + ' in ' + found.label + ' at ' + found.n);
  await shot('grav-' + IDS[i]);
}
return 'ok';
