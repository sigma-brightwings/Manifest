/* catalogue.test.js - the gameopedia (2026-11-12).
 *
 *     node test/catalogue.test.js
 *
 * Astra: "can you launch the game with the market screen open and every
 * single item selectable and with its description in place, and the icon,
 * rotating as it is designed to do? My wife wants a sort of gameopedia; and
 * that's something I think players will want also." Then: "let's do the
 * full catalogue and tie it in to the help screen."
 *
 * What this holds:
 *   - IT IS READ FROM THE LIVE TABLES, so it cannot drift from the game:
 *     every purchasable thing is in it, exactly once;
 *   - EVERY ENTRY HAS SOMETHING TO READ - a name, a price and copy. This is
 *     the check that would have caught the 24 trade goods that had no
 *     description at all until the page went looking for one;
 *   - UNLISTED ITEMS STAY OUT until you own one, so a reference page cannot
 *     hand you the end of a chain you have not walked;
 *   - THE GROUPS COVER EVERYTHING and overlap nowhere.
 */
global.window = global.window || global;
require('../src/vec3.js');
var Eco = require('../src/economy.js');
require('../src/generate.js');
require('../src/sim.js');
require('../src/hulls.js');
var C = require('../src/combat.js');
require('../src/massdriver.js');
var Cn = require('../src/construction.js');
var Cat = require('../src/catalogue.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

/* A career with nothing unusual in it. */
var G = { ship: { fittings: [] }, fleet: [], seenItems: {} };

console.log('--- what is in it ---');
var all = Cat.all(G), groups = Cat.groups(G);
check('the catalogue is not empty', all.length > 100, all.length + ' entries');
check('it covers every group', groups.length === 9, groups.map(function (g) { return g.label; }).join(' '));

var ids = {}, dupes = [];
all.forEach(function (e) { if (ids[e.group + '/' + e.id]) dupes.push(e.id); ids[e.group + '/' + e.id] = 1; });
check('nothing is listed twice in a group', dupes.length === 0, dupes.join(', '));

var inGroups = 0;
groups.forEach(function (g) { inGroups += g.items.length; });
check('every entry lands in exactly one group', inGroups === all.length,
      inGroups + ' of ' + all.length);

console.log('--- every entry has something to read ---');
var noName = all.filter(function (e) { return !e.name; });
var noProse = all.filter(function (e) { return !e.prose; });
var noPrice = all.filter(function (e) { return typeof e.price !== 'number'; });
var noModel = all.filter(function (e) { return !e.model; });
check('every entry has a name', noName.length === 0);
check('every entry has a description', noProse.length === 0,
      noProse.length ? noProse.slice(0, 6).map(function (e) { return e.name; }).join(', ') : '');
check('every entry has a price', noPrice.length === 0,
      noPrice.length ? noPrice.slice(0, 6).map(function (e) { return e.name; }).join(', ') : '');
check('every entry names a model key', noModel.length === 0);
var longProse = all.filter(function (e) { return e.prose.length > 400; });
check('no description runs past the card', longProse.length === 0,
      longProse.length ? longProse[0].name : '');

console.log('--- it matches the live tables ---');
var eqIds = {}, eqN = 0;
Object.keys(C.EQUIPMENT).forEach(function (k) {
  var it = C.EQUIPMENT[k];
  if (!it || !it.id || eqIds[it.id]) return;
  eqIds[it.id] = it; eqN++;
});
var listedEq = all.filter(function (e) { return !!e.eq; }).length;
var unlistedN = Object.keys(eqIds).filter(function (id) { return eqIds[id].unlisted; }).length;
check('every listed fitting is in the catalogue', listedEq === eqN - unlistedN,
      listedEq + ' of ' + eqN + ' (' + unlistedN + ' unlisted)');
check('there ARE unlisted fittings to hide', unlistedN > 0, unlistedN);

var hullN = 0, hSeen = {};
Object.keys(C.HULLS).forEach(function (k) { var h = C.HULLS[k]; var id = h && (h.id || k);
  if (id && !hSeen[id]) { hSeen[id] = 1; hullN++; } });
check('every hull is in the catalogue',
      all.filter(function (e) { return e.kind === 'hull'; }).length === hullN, hullN + ' hulls');
/* Both tables: contraband sits in Eco.CONTRABAND, beside COMMODITIES rather
 * than inside it, and reading only the one list dropped it off the page. */
var goodsWant = Eco.COMMODITIES.length + (Eco.CONTRABAND || []).length;
check('every trade good is in the catalogue, contraband included',
      all.filter(function (e) { return e.kind === 'good'; }).length === goodsWant,
      Eco.COMMODITIES.length + ' honest + ' + (Eco.CONTRABAND || []).length + ' not');
check('every station crate is in the catalogue',
      all.filter(function (e) { return e.kind === 'crate'; }).length === (Cn.CRATES || []).length);

console.log('--- the unlisted stay out until you have one ---');
var secret = Object.keys(eqIds).filter(function (id) { return eqIds[id].unlisted; })[0];
check('an unlisted fitting is hidden by default',
      !Cat.find(G, secret), secret);
var G2 = { ship: { fittings: [secret] }, fleet: [] };
check('fitting one puts it in the book', !!Cat.find(G2, secret));
var G3 = { ship: { fittings: [] }, fleet: [{ fittings: [secret] }] };
check('a parked ship carrying one counts too', !!Cat.find(G3, secret));
var G4 = { ship: { fittings: [] }, fleet: [] };
Cat.note(G4, secret);
check('and once seen it stays seen', !!Cat.find(G4, secret));
check('a tool with no career sees everything', !!Cat.find(null, secret));
check('counts differ by exactly the unlisted',
      Cat.count(null) - Cat.count(G) === unlistedN,
      Cat.count(null) + ' vs ' + Cat.count(G));

console.log('--- the order a reader wants ---');
var okSort = true, badGroup = '';
groups.forEach(function (g) {
  for (var i = 1; i < g.items.length; i++) {
    var a = g.items[i - 1], b = g.items[i];
    if (a.kind === b.kind && typeof a.price === 'number' && typeof b.price === 'number'
        && a.price > b.price) { okSort = false; badGroup = g.label; }
  }
});
check('inside a kind, cheapest first', okSort, badGroup);

var ladder = null;
groups.forEach(function (g) { if (g.id === 'sensors') ladder = g; });
var gravs = ladder.items.filter(function (e) { return /^grav(I|II|III|IV)$/.test(e.id); });
check('the four gravimeters read as a ladder', gravs.length === 4,
      gravs.map(function (e) { return e.name; }).join(' < '));
check('the ladder is in price order',
      gravs[0].price < gravs[1].price && gravs[1].price < gravs[2].price && gravs[2].price < gravs[3].price);

console.log('--- the odd ones ---');
var waste = Cat.find(G, 'waste');
check('a cargo you are paid to carry keeps its negative price',
      waste && waste.price < 0, waste ? String(waste.price) : 'missing');
var band = all.filter(function (e) { return e.contraband; });
check('contraband is flagged', band.length > 0, band.length + ' goods');
var grey = all.filter(function (e) { return e.grey; });
check('grey-market kit is flagged', grey.length > 0, grey.length + ' items');

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
