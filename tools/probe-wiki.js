/* The wiki tabs on the catalogue page (lore.js, 2026-11-13).
 *     node tools/electron-probe.cjs tools/probe-wiki.js "Claude outputs\wiki"
 *
 * Three things to show, in the running game:
 *   - FACTIONS, PORTS and TYPES are on the page beside the item tabs;
 *   - a port's card carries the berth plan drawn from the model's anchors;
 *   - the faction gate actually gates: a fresh career sees the four KINDS
 *     of power and none of this seed's named ones, and charting fills them
 *     in behind the purchase rather than instead of it.
 */
const G = window.Game, S = window.Screens, Cat = window.Catalogue, L = window.Lore;
G.panel = 0; G.tutorial = null; G.showHelp = false; G.menu = null; G.title = null;

if (!L) return 'FAIL: window.Lore is not loaded';

/* A career that has been nowhere. */
G.charted = {}; G.visited = {}; G.standing = {};
G.showCatalogue = true;
G.catalogue = { group: 0, sel: 0, scroll: 0 };
await wait(400);

let gs = S.catGroups();
log('tabs (' + gs.length + '): ' + gs.map(g => g.label + ':' + g.items.length).join('  '));
const idx = {};
gs.forEach((g, i) => { idx[g.id] = i; });

let p = L.factionProgress(G, G.galaxy);
log('fresh career knows ' + p.known + ' of ' + p.total + ' factions');
G.catalogue.group = idx.factions; G.catalogue.sel = 0;
await wait(400);
log('  FACTIONS holds: ' + gs[idx.factions].items.map(e => e.name).join(', '));
await shot('factions-fresh');

/* Now chart the neighbourhood, the way buying a sheet does. */
const near = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
near.slice(0, 60).forEach(s => { G.charted[s.id] = true; });
await wait(300);
gs = S.catGroups();
p = L.factionProgress(G, G.galaxy);
log('after charting 60 stars: ' + p.known + ' of ' + p.total);
G.catalogue.group = idx.factions; G.catalogue.sel = 4;
await wait(420);
log('  now holds: ' + gs[idx.factions].items.map(e => e.name).join(', '));
await shot('factions-charted');

/* THE LINKS. A minor power names its kind and the empire it sits inside;
 * both are rows you can click. Photographed, and then followed the way the
 * click handler follows them - by id, against the live tab list - so the
 * check is of the same resolution the handler does rather than of a cached
 * index. */
gs = S.catGroups();
const fIdx = gs[idx.factions].items.findIndex(e => (e.links || []).length >= 2);
if (fIdx < 0) {
  log('no faction with two links yet - charting more');
} else {
  G.catalogue.group = idx.factions; G.catalogue.sel = fIdx; G.catalogue.scroll = 0;
  await wait(420);
  const e = gs[idx.factions].items[fIdx];
  log('links on ' + e.name + ': ' + e.links.map(l => l.label).join('  |  '));
  await shot('faction-links');
  for (const l of e.links) {
    let at = null;
    gs.forEach((g, gi) => {
      const i = g.items.findIndex(x => x.id === l.id);
      if (i >= 0) at = { group: gi, index: i, name: g.items[i].name, tab: g.label };
    });
    log('  "' + l.label + '" -> ' + (at ? at.tab + ' / ' + at.name : 'DANGLING'));
    if (at) {
      G.catalogue.group = at.group; G.catalogue.sel = at.index;
      G.catalogue.scroll = Math.max(0, at.index - 6);
      await wait(380);
      await shot('followed-' + l.id);
    }
  }
}

/* PORTS: the plan, on something with plenty of berths. */
gs = S.catGroups();
const ports = gs[idx.ports].items;
log('port patterns: ' + ports.map(e => e.name + '(' + e.berths + ')').join(', '));
for (const want of ['Shipyard', 'Drum station', 'Landing pads']) {
  const n = ports.findIndex(e => e.name === want);
  if (n < 0) { log('  ' + want + ': not found'); continue; }
  G.catalogue.group = idx.ports; G.catalogue.sel = n; G.catalogue.scroll = Math.max(0, n - 6);
  await wait(420);
  const e = ports[n];
  log('  ' + want + ': ' + (e.plan ? e.plan.berths.length + ' berths, ' +
      Math.round(e.plan.metres) + ' m, axes ' + e.plan.axes : 'no plan'));
  await shot('port-' + want.replace(/\s+/g, '-').toLowerCase());
}

/* TYPES: a world, a star and a government. */
gs = S.catGroups();
const types = gs[idx.types].items;
log('types: ' + types.length + ' entries');
for (const want of ['Class M', 'Terran', 'Anarchy']) {
  const n = types.findIndex(e => e.name === want);
  if (n < 0) { log('  ' + want + ': not found'); continue; }
  G.catalogue.group = idx.types; G.catalogue.sel = n; G.catalogue.scroll = Math.max(0, n - 6);
  await wait(420);
  await shot('type-' + want.replace(/\s+/g, '-').toLowerCase());
}
return 'ok';
