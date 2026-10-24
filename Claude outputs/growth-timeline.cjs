// How long a station takes to build out, and what stands when (2026-10-24).
// Every port model x rich/middling/poor x 4 seeds.
global.window = global;
var path = require('path'), R = path.join(__dirname, '..', 'src') + '/';
['ports', 'growth-points', 'modules'].forEach(function (m) { require(R + m + '.js'); });
var Gr = require(R + 'growth.js'), Y = Gr.YEAR;
var C = [['rich', { development: 0.75, corruption: 10, violence: 10 }, 0.55],
         ['middling', { development: 0.45, corruption: 55, violence: 35 }, 0.25],
         ['poor hold', { development: 0.3, corruption: 85, violence: 60, pirateHeld: true }, 0.08]];
var k = 0;
C.forEach(function (cs) {
  var spans = [], at0 = [], at3 = [], full = [], pre = 0, now = 0, later = 0, jobsAfter = 0, n = 0;
  Object.keys(GrowthPoints).forEach(function (m) {
    for (var s = 0; s < 4; s++) {
      var c = { G: {}, sys: cs[1], port: { id: 'tl' + k, livery: 'civ', market: { dev: cs[2], role: 'orbital' } }, starId: 'tl' + k, model: m, key: 'tl:' + cs[0] + ':' + (k++) };
      var p = Gr.plan(c);
      if (!p.slots.length) continue;
      n++;
      var b = p.buildout;
      spans.push((b.t1 - b.t0) / Y);
      if (b.t1 <= 0) pre++; else if (b.t0 <= 0) now++; else later++;
      at0.push(Gr.stateAt(c, 0).slots.length);
      at3.push(Gr.stateAt(c, 3 * Y).slots.length);
      full.push(Gr.stateAt(c, b.t1 + 0.2 * Y).slots.length);
      jobsAfter += p.slots.filter(function (x) { return x.t0 > b.t1; }).length;
    }
  });
  var mean = function (a) { return (a.reduce(function (x, y) { return x + y; }, 0) / (a.length || 1)).toFixed(1); };
  console.log(cs[0] + ': build-out ' + mean(spans) + ' y (max ' + Math.max.apply(null, spans).toFixed(1) + ')' +
    ' | done before day 0 ' + pre + ', building on day 0 ' + now + ', begins later ' + later + ' of ' + n +
    ' | standing: day 0 ' + mean(at0) + ', year 3 ' + mean(at3) + ', at finish ' + mean(full) +
    ' | jobs after the build-out per port ' + (jobsAfter / n).toFixed(1) + ' (over 40 y)');
});
