// How varied each builder's pieces are, per port model: Union sets per distinct module.
global.window = global;
var R = __dirname + '/../src/';
['ports', 'growth-points', 'modules'].forEach(function (m) { require(R + m + '.js'); });
var Gr = require(R + 'growth.js');
var RICH = { development: 0.75, corruption: 10, violence: 10 };
var models = Object.keys(GrowthPoints).filter(function (m) { return /-l$/.test(m) && !/-(navy|syn)-/.test(m); });
var worst = [], chainNeck = 0, chainRoute = 0;
models.forEach(function (m, i) {
  var ctx = { G: {}, sys: RICH, port: { id: 'v' + i, livery: 'civ', market: { dev: 0.55, role: 'orbital' } }, starId: 'v' + i, model: m, key: 'var:' + i };
  var p = Gr.plan(ctx), by = {}, sets = {};
  p.slots.forEach(function (s) {
    if (s.parent >= 0 && s.neck) chainNeck++;
    if (s.builder !== 'union' || sets[s.set]) return;
    sets[s.set] = 1;
    by[s.mod.f || s.mod.id] = (by[s.mod.f || s.mod.id] || 0) + 1;
  });
  var n = Object.keys(sets).length, top = Math.max.apply(null, Object.values(by).concat([0]));
  worst.push({ m: m, sets: n, forms: Object.keys(by).length, top: top, share: n ? top / n : 0 });
});
worst.sort(function (a, b) { return b.share - a.share || b.sets - a.sets; });
worst.slice(0, 12).forEach(function (w) { console.log(w.m, 'sets', w.sets, 'forms', w.forms, 'most-used', w.top, (100 * w.share).toFixed(0) + '%'); });
var all = worst.filter(function (w) { return w.sets >= 3; });
console.log('models with >=3 Union sets:', all.length, ' mean top share', (100 * all.reduce(function (a, w) { return a + w.share; }, 0) / all.length).toFixed(0) + '%');
console.log('chained pieces with a neck (rich plans):', chainNeck);
var POOR = { development: 0.3, corruption: 85, violence: 60, pirateHeld: true }, MID = { development: 0.45, corruption: 55, violence: 35 };
var ch = 0, chN = 0, lens = [];
models.forEach(function (m, i) {
  [[MID, 0.25, 'civ'], [POOR, 0.08, 'syn']].forEach(function (cs, j) {
    var mm = cs[2] === 'syn' && PortLib[m.replace(/-([sml])$/, '-syn-$1')] ? m.replace(/-([sml])$/, '-syn-$1') : m;
    var ctx = { G: {}, sys: cs[0], port: { id: 'c' + i + j, livery: cs[2], market: { dev: cs[1], role: 'orbital' } }, starId: 'c' + i + j, model: mm, key: 'ch:' + i + ':' + j };
    Gr.plan(ctx).slots.forEach(function (s) {
      if (s.parent < 0) return;
      ch++;
      if (s.neck) { chN++; lens.push(Math.hypot(s.neck.to[0] - s.neck.from[0], s.neck.to[1] - s.neck.from[1], s.neck.to[2] - s.neck.from[2]) * PortLib[mm].metresPerUnit); }
    });
  });
});
lens.sort(function (a, b) { return a - b; });
console.log('middling + poor: chained pieces', ch, 'with a neck', chN, 'neck metres min/median/max', lens.length ? [lens[0], lens[lens.length >> 1], lens[lens.length - 1]].map(Math.round).join(' / ') : '-');
