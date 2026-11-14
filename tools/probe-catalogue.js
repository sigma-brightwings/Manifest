/* The catalogue page, group by group, in the running game.
 *     node tools/electron-probe.cjs tools/probe-catalogue.js "Claude outputs\cat"
 */
const G = window.Game, S = window.Screens, Cat = window.Catalogue;
G.panel = 0;
G.tutorial = null;
G.showHelp = false;
G.menu = null;
G.title = null;
G.showCatalogue = true;
G.catalogue = { group: 0, sel: 0, scroll: 0 };
await wait(400);

var gs = window.Screens.catGroups();
console.log('groups: ' + gs.length + ', entries: ' + window.Catalogue.count(G));
gs.forEach(function (g) { console.log('  ' + g.label + '  ' + g.items.length); });

for (var i = 0; i < gs.length; i++) {
  G.catalogue.group = i;
  G.catalogue.sel = 0;
  G.catalogue.scroll = 0;
  await wait(260);
  await shot('group-' + i + '-' + gs[i].id);
}

/* A few individual entries, to check the portrait and the copy. */
G.catalogue.group = 0;            // weapons
for (var k = 0; k < 3; k++) {
  G.catalogue.sel = k * 5;
  await wait(260);
  await shot('weapon-' + k);
}

/* A hull, which draws through drawHullPortrait rather than the item one. */
for (var hi = 0; hi < gs.length; hi++) if (gs[hi].id === 'hulls') G.catalogue.group = hi;
G.catalogue.sel = 4;
await wait(300);
await shot('hull');

/* A trade good, the group that had no copy at all until today. */
for (var gi = 0; gi < gs.length; gi++) if (gs[gi].id === 'goods') G.catalogue.group = gi;
G.catalogue.sel = 0;
await wait(300);
await shot('good');

/* The new gravimeters, which have no model of their own yet. */
for (var si = 0; si < gs.length; si++) if (gs[si].id === 'sensors') G.catalogue.group = si;
var sens = gs.filter(function (g) { return g.id === 'sensors'; })[0];
for (var q = 0; q < sens.items.length; q++) {
  if (sens.items[q].id === 'gravII') { G.catalogue.sel = q; break; }
}
await wait(300);
await shot('gravimeter');

/* And the help card, which should now name it. */
G.showCatalogue = false;
G.showHelp = true;
await wait(300);
await shot('help-card');
console.log('done');
