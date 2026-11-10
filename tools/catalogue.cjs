/* catalogue.cjs — every purchasable thing in the game, one row each, for
 * the 3D icon brief (Astra, 2026-11-09: "make a list of every type of
 * purchaseable item so I can have 3d icons made for them").
 *
 *     node tools/catalogue.cjs > catalogue.json
 *
 * Read straight from the live tables, so the list cannot drift from the
 * game: the equipment catalogue (guns, turrets, modules, slipspace
 * modules, cruise drives), the consumables, the hulls, the trade goods and
 * the station modules.
 */
global.window = global.window || global;
require('../src/vec3.js');
var Eco = require('../src/economy.js');
require('../src/generate.js'); require('../src/sim.js'); require('../src/hulls.js');
var Combat = require('../src/combat.js');
var MD = null; try { MD = require('../src/massdriver.js'); } catch (e) {}
var Cn = null; try { Cn = require('../src/construction.js'); } catch (e) {}

var rows = [];
function add(r) { rows.push(r); }

/* Equipment: each item once (EQUIPMENT also holds legacy aliases). */
var seen = {};
Object.keys(Combat.EQUIPMENT).forEach(function (k) {
  var it = Combat.EQUIPMENT[k];
  if (!it || seen[it.id]) return;
  seen[it.id] = true;
  var spec = [];
  if (typeof it.dmg === 'number') spec.push(it.dmg + ' dmg');
  if (typeof it.range === 'number') spec.push(it.range + ' km');
  if (typeof it.cooldown === 'number') spec.push(it.cooldown + ' s cycle');
  if (typeof it.heat === 'number') spec.push(it.heat + ' heat/s');
  if (typeof it.powerBonus === 'number') spec.push('+' + it.powerBonus + ' MW');
  if (typeof it.cap === 'number') spec.push('capacity ' + it.cap);
  if (typeof it.regen === 'number') spec.push('regen ' + it.regen + '/s');
  if (it.variety) spec.push(it.variety);
  add({ category: 'Equipment', group: it.kind || '', id: it.id, name: it.name,
        slot: it.slot || '', size: it.size || it.slotSize || '', price: it.price,
        powerMW: typeof it.power === 'number' ? it.power : '', massT: typeof it.mass === 'number' ? it.mass : '',
        specs: spec.join(' · '), flavour: it.pitch || it.blurb || '' });
});

/* Consumables. */
Object.keys(Combat.MISSILES || {}).forEach(function (k) {
  var m = Combat.MISSILES[k];
  add({ category: 'Consumable', group: 'missile', id: m.id || k, name: m.name, slot: 'rack', size: '',
        price: m.price, powerMW: '', massT: '', specs: [m.dmg ? m.dmg + ' dmg' : '', m.range ? m.range + ' km' : ''].filter(Boolean).join(' · '),
        flavour: m.pitch || m.blurb || '' });
});
if (Combat.DECOY) add({ category: 'Consumable', group: 'decoy', id: 'decoy', name: 'Decoy charge', slot: 'rack', size: '',
  price: Combat.DECOY.price, powerMW: '', massT: '', specs: '', flavour: Combat.DECOY.pitch || '' });
if (Combat.SINK) add({ category: 'Consumable', group: 'heat sink', id: 'sink', name: 'Heat sink charge', slot: 'rack', size: '',
  price: Combat.SINK.price, powerMW: '', massT: '', specs: '', flavour: Combat.SINK.pitch || '' });
if (MD && MD.SLUG_PRICE_T) add({ category: 'Consumable', group: 'ammunition', id: 'slugs', name: 'Driver slugs (1 t)', slot: 'cargo', size: '',
  price: MD.SLUG_PRICE_T, powerMW: '', massT: 1, specs: '40 rounds', flavour: 'Twenty-five kilos each. You will feel every one leave.' });

/* Hulls. */
Object.keys(Combat.HULLS).forEach(function (k) {
  var h = Combat.HULLS[k];
  add({ category: 'Hull', group: h.size || '', id: h.id || k, name: h.name, slot: '', size: h.size || '',
        price: h.price, powerMW: h.powerMW || '', massT: h.dryMass,
        specs: h.cargoCap + ' t hold · ' + h.hullMax + ' hull · ' + h.thrustKN + ' kN', flavour: h.blurb || '' });
});

/* Trade goods. */
(Eco.COMMODITIES || []).forEach(function (c) {
  add({ category: 'Trade good', group: c.contraband ? 'contraband' : (c.tier || ''), id: c.id, name: c.name, slot: 'cargo', size: '',
        price: c.base || c.basePrice || '', powerMW: '', massT: '', specs: '', flavour: c.blurb || c.desc || '' });
});

/* Station modules: the crates a shipyard builds for a Crawler to carry
 * (construction.js CRATES), and the craft a Crawler's bay can carry. */
if (Cn && Cn.CRATES) Cn.CRATES.forEach(function (m) {
  add({ category: 'Station module', group: 'crate', id: m.id, name: m.name, slot: 'Crawler hold', size: m.size || '',
        price: m.price || m.cost || '', powerMW: m.power || '', massT: m.tonnes || m.mass || '',
        specs: m.cubes ? m.cubes + ' cubes' : '', flavour: m.blurb || m.pitch || m.about || '' });
});
if (Cn && Cn.CRAFT) Object.keys(Cn.CRAFT).forEach(function (k) {
  var c = Cn.CRAFT[k];
  add({ category: 'Bay craft', group: c.kind || '', id: c.id || k, name: c.name, slot: 'craft bay', size: c.size || '',
        price: c.price || c.cost || '', powerMW: '', massT: c.mass || '', specs: '', flavour: c.blurb || c.pitch || '' });
});

/* To a file when one is named (PowerShell's `>` writes UTF-16), and as CSV
 * when it ends in .csv — the shape a spreadsheet or an artist wants. */
var out = process.argv[2];
if (out && /\.csv$/i.test(out)) {
  var cols = ['category', 'group', 'id', 'name', 'slot', 'size', 'price', 'powerMW', 'massT', 'specs', 'flavour'];
  var q = function (v) { v = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  require('fs').writeFileSync(out, '﻿' + [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(','); })).join('\r\n'));
} else if (out) require('fs').writeFileSync(out, JSON.stringify(rows, null, 1));
else process.stdout.write(JSON.stringify(rows, null, 1));
