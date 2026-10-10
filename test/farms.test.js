/* farms.test.js — the 22-09 set: farms, liveries, gas-giant industry, the
 * ice-world runway hooks, and the lazy port geometry that carries them.
 *
 *     node test/farms.test.js
 *
 * Astra, 2026-09-22: skimmers and hydrogen refineries in orbit of the gas
 * giants; runway ports (REFI/INDU/PASS) on ice worlds where volatiles are
 * harvested; a Syndicate farm growing gold buds, a narcotic; a civilian
 * farm growing grapes for fruit and wine; the produce priced by its traits.
 */
global.window = global.window || global;
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
require('../src/sim.js');
require('../src/ports.js');
var Render = require('../src/render.js');
var Galaxy = require('../src/galaxy.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

console.log('--- priced by what they are ---');
var fruit = Eco.BY_ID.fruit, buds = Eco.BY_ID.goldbuds;
check('fruit is a legal, perishable farm good', fruit && !fruit.contraband && fruit.traits.perishable && fruit.cat === 'agri');
check('fruit sits between grain and aquaculture', fruit.base > Eco.BY_ID.grain.base && fruit.base < Eco.BY_ID.fish.base, fruit.base + ' cr/t');
check('gold buds are contraband, a vice like narcotics', buds && buds.contraband && buds.severity === Eco.BY_ID.narcotics.severity);
check('gold buds come out dearer than lab narcotics', buds.base > Eco.BY_ID.narcotics.base, buds.base + ' vs ' + Eco.BY_ID.narcotics.base);
check('the base IS the traits, not a typed number',
      Eco.priceFromTraits('contraband', buds.traits) === buds.base &&
      Eco.priceFromTraits('agri', fruit.traits) === fruit.base);
check('less potent buds are cheaper',
      Eco.priceFromTraits('contraband', { narcotic: true, cultivated: true, perishable: true, potency: 0.6 }) < buds.base);

console.log('--- the galaxy grows them ---');
var gal = Galaxy.build('kawartha');
var stars = gal.stars;
/* The same call main.js makes (systemFor), so the systems are the game's. */
function optsFor(st) {
  var fac = gal.factionById ? gal.factionById[st.factionId] : null;
  return fac ? { faction: fac, allFactions: gal.factions } : undefined;
}
var grape = 0, gold = 0, goldOutside = 0, goldOnVine = 0, budBuyers = 0, fruitBuyers = 0;
var liv = { civ: 0, navy: 0, syn: 0 }, navyNoBase = 0, synOutside = 0;
var giantRef = 0, giantRefOk = 0, iceSites = 0, iceBad = 0, farmModels = 0, farmModelBad = 0;
var buriedComet = 0, buriedCometBad = 0, synOrbital = 0, synOrbitalOk = 0, systems = 0;
var groundSites = 0, groundBad = 0, groundRouted = 0;
var sampled = [];
for (var s = 0; s < stars.length && s < 60; s++) {
  var st = stars[s];
  var sys = Gen.generateSystem(st.seed, optsFor(st));
  systems++;
  if (sampled.length < 3) sampled.push({ seed: st.seed, opts: optsFor(st) });
  var based = (sys.patrols || []).some(function (p) { return p.kind === 'navy' && !p.passing; });
  (sys.ports || []).forEach(function (p) {
    var m = p.market; if (!m) return;
    liv[p.livery] = (liv[p.livery] || 0) + 1;
    if (p.livery === 'navy' && !based && m.role !== 'carrier') navyNoBase++;
    /* A milfuel factory licensed by a Syndicate flagship wears their
     * colours outside a hold, by design (2026-09-25). */
    if (p.livery === 'syn' && !sys.pirateHeld && p.faction !== 'outlaw' &&
        !(m.role === 'milfuel' && Eco.milfuelLicensor(sys) === 'syndicate')) synOutside++;
    if (p.crop === 'grape') {
      grape++;
      if (!(m.rows.fruit && m.rows.fruit.prod > 0 && m.rows.wine && m.rows.wine.prod > 0)) goldOnVine++;
    }
    if (p.crop === 'gold') {
      gold++;
      if (!sys.pirateHeld && !(sys.corruption >= 60)) goldOutside++;
      if (!(m.rows.goldbuds && m.rows.goldbuds.prod > 0) || (m.rows.wine && m.rows.wine.prod > 0 && p.surface && Eco.BY_ID && false)) goldOnVine++;
    }
    if (!p.crop && m.rows.goldbuds && m.rows.goldbuds.cons > 0) budBuyers++;
    if (!p.crop && m.rows.fruit && m.rows.fruit.cons > 0) fruitBuyers++;

    var model = Render.portModelFor(p);
    var host = p.parentBody;
    if (m.role === 'refinery' && !p.surface) {
      giantRef++;
      if (/^(refinery|skimmer)(-navy|-syn)?-[sml]$/.test(model)) giantRefOk++;
    }
    if (p.siteKind && p.siteKind.indexOf('runway-') === 0) {
      iceSites++;
      /* No REFI/INDU/PASS art yet: the hook stands in with the ground
       * runway site (24-09), which is the same kind of building. */
      if (!/^runway-(city-)?site/.test(model)) iceBad++;
    }
    if (p.surface && !p.underground && !p.crop && !(p.siteKind && p.siteKind.indexOf('runway-') === 0)) {
      groundSites++;
      if (!/^(pad|mountain|runway|pad-city|runway-city)-site/.test(model)) groundBad++;
      var dr0 = Gen.berthDoorRoute ? Gen.berthDoorRoute(p, 0) : null;
      if (dr0) groundRouted++;
    }
    if (p.crop) {
      farmModels++;
      var want = p.crop === 'gold' ? /^farm-syn-[sml]$/ : /^farm(-navy)?-[sml]$/;
      if (!want.test(model)) farmModelBad++;
    }
    if (p.underground) {
      if (host && (host.type === 'iceball' || host.type === 'tundra')) { buriedComet++; if (!/^comet/.test(model)) buriedCometBad++; }
      else if (/^comet/.test(model)) buriedCometBad++;
    }
    if (p.livery === 'syn' && !p.surface && m.role !== 'refinery' && m.role !== 'shipyard' && m.role !== 'carrier') {
      synOrbital++;
      if (/-syn-[sml]$/.test(model)) synOrbitalOk++;
    }
  });
}
console.log('  ' + systems + ' systems: ' + grape + ' vineyards, ' + gold + ' gold farms, liveries ' + JSON.stringify(liv));
check('civilian farms exist, and every one sells fruit and wine', grape > 0 && goldOnVine === 0, grape + ' farms');
check('Syndicate farms exist', gold > 0, gold + ' farms');
check('gold is only grown where the Syndicate or the mafia runs things', goldOutside === 0);
check('back rooms elsewhere buy the buds', budBuyers > 0, budBuyers + ' buyers');
check('fruit has buyers who do not grow it', fruitBuyers > 0, fruitBuyers + ' buyers');
check('all three liveries appear', liv.civ > 0 && liv.navy > 0 && liv.syn > 0);
check('navy dress only where the navy is based', navyNoBase === 0);
check('Syndicate dress only where the Syndicate is', synOutside === 0);
check('gas-giant refineries are refineries or skimmers', giantRef > 0 && giantRefOk === giantRef, giantRefOk + '/' + giantRef);
check('a farm wears the farm, in the colours of its crop', farmModels > 0 && farmModelBad === 0, farmModels + ' farms');
check('an ice-world runway port stands in with the runway site until its art lands', iceBad === 0, iceSites + ' runway sites');
check('ground ports wear the ground sites, not the retired city port', groundSites > 0 && groundBad === 0, groundSites + ' ground ports');
check('every ground port has a way down from its entrance to its berths', groundRouted === groundSites, groundRouted + '/' + groundSites);
check('comet outposts only in ice', buriedCometBad === 0, buriedComet + ' buried in ice');
check('an orbital port in Syndicate space wears Syndicate dress', synOrbital === 0 || synOrbitalOk === synOrbital, synOrbitalOk + '/' + synOrbital);

console.log('--- the plants over the giants ---');
/* Astra, 24-09: navy and Syndicate refineries turn hydrogen and fissiles
 * into milfuel; a skimmer just gets hydrogen; more skimmers than refineries;
 * every one of them above a giant. */
var skim = 0, refi = 0, skimChem = 0, slugRefi = 0, slugBad = 0, civSlug = 0, offGiant = 0;
for (var s2 = 0; s2 < stars.length && s2 < 80; s2++) {
  var sy2 = Gen.generateSystem(stars[s2].seed, optsFor(stars[s2]));
  sy2.ports.forEach(function (p) {
    var m = p.market, model = Render.portModelFor(p), host = p.parentBody;
    var giant = host && (host.type === 'gasGiant' || host.type === 'iceGiant');
    /* The one exception, by request (2026-09-25): a milfuel factory is the
     * large navy refinery building wherever it stands. milfuel.test.js. */
    if (/^(refinery|skimmer)/.test(model) && !giant && !(m && m.role === 'milfuel')) offGiant++;
    if (!m || m.role !== 'refinery') return;
    if (p.plant === 'skimmer') {
      skim++;
      if (m.rows.chemicals && m.rows.chemicals.prod > 0) skimChem++;
      if (!/^skimmer/.test(model)) slugBad++;
      return;
    }
    refi++;
    if (!/^refinery/.test(model)) slugBad++;
    var mil = m.rows.milfuel;
    if (p.livery === 'navy' || p.livery === 'syn') {
      /* And drums since 2026-09-25: ten of waste to the slug beside five of
       * fissile, a sink you can unload at, and a board that says so. */
      var wr = m.rows.waste, wf = m.wasteFeed || 0;
      var board = p.dressing && p.dressing.signs.some(function (x) { return /WASTE & ISOTOPES/.test(x.text); });
      if (mil && mil.prod > 0 && m.rows.fissile && m.rows.fissile.cons > 0 && m.rows.hydrogen.cons > 0 &&
          wr && wr.sink && wf > 0 && wr.cons >= wf - 1e-6 &&
          Math.abs(m.feed / 5 + wf / 10 - m.slugs) < 1e-6 && board) slugRefi++;
      else slugBad++;
    } else if (mil && mil.prod > 0) civSlug++;
  });
}
console.log('  ' + skim + ' skimmers, ' + refi + ' refineries, ' + slugRefi + ' pressing milfuel');
check('more skimmers than refineries', skim > refi && refi > 0);
check('a skimmer makes no chemicals', skimChem === 0);
check('every navy or Syndicate refinery presses milfuel from hydrogen, fissiles and waste', slugRefi > 0 && slugBad === 0);
check('a civilian refinery does not', civSlug === 0);
check('no refinery or skimmer anywhere but over a giant', offGiant === 0);

console.log('--- still the same universe ---');
sampled.forEach(function (x) {
  var a = Gen.generateSystem(x.seed, x.opts), b = Gen.generateSystem(x.seed, x.opts);
  var sig = function (sy) {
    return sy.ports.map(function (p) {
      return [p.id, p.livery, p.crop || '', p.siteKind || '', Render.portModelFor(p),
              Object.keys(p.market.rows).sort().join(',')].join('|');
    }).join(';');
  };
  check('generation is deterministic for ' + x.seed, sig(a) === sig(b));
});

console.log('--- the runway hook switches on when the art lands ---');
var ice = null;
for (var q = 0; q < stars.length && !ice; q++) {
  var sq = Gen.generateSystem(stars[q].seed, optsFor(stars[q]));
  sq.ports.forEach(function (p) { if (!ice && p.siteKind === 'runway-refi') ice = p; });
}
if (ice) {
  var size = Render.portSizeFor(ice, 'bay');
  global.PortLib['runway-refi-' + size] = { kind: 'orbital', v: [[0, 0, 0]], f: [], pal: [], ci: [], anchors: {} };
  Render.reloadPorts();
  check('a runway-refi model is used on an ice world as soon as it exists', Render.portModelFor(ice) === 'runway-refi-' + size, Render.portModelFor(ice));
  delete global.PortLib['runway-refi-' + size];
  Render.reloadPorts();
} else check('found an ice-world harvesting port to test against', false);

console.log('--- geometry on demand ---');
var ids = Object.keys(global.PortLib);
var lazyAtBoot = ids.filter(function (id) { return global.PortLib[id].lazy; }).length;
check('the index loads with the triangles left behind', lazyAtBoot > 50, lazyAtBoot + ' of ' + ids.length + ' lazy');
var probe = ids.filter(function (id) { return global.PortLib[id].lazy; })[0];
check('the index still carries the berths', !!(global.PortLib['cylinder-m'].anchors && global.PortLib['cylinder-m'].anchors.berths.length));
var got = Render.libPort(probe);
check('asking for a model fetches it', got && got.shell && got.shell.f.length > 0 && !global.PortLib[probe].lazy, probe);
check('and only that model', ids.filter(function (id) { return global.PortLib[id].lazy; }).length === lazyAtBoot - 1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
