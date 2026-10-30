// Diagnostic: what a core offers and what the Union builds on it.
global.window = global;
var R = __dirname + '/../src/';
['ports', 'growth-points', 'modules'].forEach(function (m) { require(R + m + '.js'); });
var Gr = require(R + 'growth.js');
var model = process.argv[2] || 'spine-l';
var P = GrowthPoints[model], lib = PortLib[model], mpu = lib.metresPerUnit;
console.log(model, 'mpu', mpu, 'half', P.half, 'sym', P.sym, 'box', JSON.stringify(P.box), 'points', P.points.length);
var fam = model.replace(/-(navy|syn)(?=-|$)/, '').replace(/-[sml]$/, '');
var types = {};
P.points.forEach(function (q) {
  var t = q.hull ? 'h' : q.door ? 'd' : 'r';
  types[t] = (types[t] || 0) + 1;
});
console.log('point types', JSON.stringify(types));
P.points.slice(0, 400).forEach(function (q) {
  var rm = q.room || [];
  var size = Math.max(rm[0], Math.min(rm[1] + rm[2], rm[3] + rm[4])) * mpu;
  if (process.argv[3] === 'pts') console.log(q.i, q.hull ? 'h' : q.door ? 'd' : 'r', 'at', q.at.map(function (v) { return v.toFixed(2); }).join(','), 'n', q.normal.join(','), 'cls', q.cls, 'neck', q.neck, 'room', rm.map(function (v) { return v.toFixed(2); }).join(','), 'size m', size.toFixed(0));
});
var own = ModuleLib.mods.filter(function (m) { return m.fam === fam; });
console.log('family', fam, 'modules', own.length);
var byK = {};
own.forEach(function (m) { var b = Math.max.apply(null, m.s); (byK[m.k + (m.nb ? '/berth' : '') + (m.pass ? '/pass' + m.pass : '')] = byK[m.k + (m.nb ? '/berth' : '') + (m.pass ? '/pass' + m.pass : '')] || []).push(Math.round(b) + m.liv[0]); });
Object.keys(byK).forEach(function (k) { console.log('  ', k, byK[k].sort(function (a, b) { return parseInt(b) - parseInt(a); }).slice(0, 30).join(' ')); });
console.log('sample module keys', Object.keys(own[0] || {}).join(','));
var cs = { sys: { development: 0.75, corruption: 10, violence: 10 }, dev: 0.55, livery: 'civ' };
var ctx = { G: {}, sys: cs.sys, port: { id: 'p0', livery: 'civ', market: { dev: cs.dev, role: 'orbital' } }, starId: 'paper0', model: model, key: 'paper:0' };
var pl = Gr.plan(ctx);
console.log('order', pl.order0.toFixed(2), 'slots', pl.slots.length);
pl.slots.forEach(function (s) {
  console.log(' slot', s.id, 'set', s.set, s.builder, 'pt', s.point, 'depth', s.depth, 'mod', s.mod.id, s.mod.fam, s.mod.k, s.mod.nb ? 'berth' : '', 'big m', Math.round(Math.max.apply(null, s.mod.s)), 'at', s.at.map(function (v) { return v.toFixed(2); }).join(','), 'n', s.n.join(','), 'y', (s.t0 / Gr.YEAR).toFixed(1));
});
