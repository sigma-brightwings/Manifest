// Smoke (2026-10-24): every unclaimed star of three galaxies generates as an
// empty system without throwing; what is left in it.
global.window = global;
var path = require('path'), R = path.join(__dirname, '..', 'src') + '/';
['rng', 'generate', 'galaxy'].forEach(function (m) { try { require(R + m + '.js'); } catch (e) {} });
var Gen = global.Gen, Gal = global.Galaxy;
var n = 0, bad = [], tally = { ports: 0, traffic: 0, patrols: 0, giants: 0, noGiant: 0, factions: 0, bodies: 0 }, keys = {};
['kawartha', 'driftwood', 'manifest'].forEach(function (seed) {
  var g = Gal.build(seed);
  g.stars.forEach(function (st) {
    if (!Gal.isEmpty(st)) return;
    n++;
    try {
      var s = Gen.generateSystem(st.seed, Gal.systemOpts(g, st));
      tally.ports += (s.ports || []).length;
      tally.traffic += (s.traffic || []).length;
      tally.patrols += (s.patrols || []).length;
      tally.bodies += s.bodies.length;
      var gi = s.bodies.some(function (b) { return b.type === 'gasGiant' || b.type === 'iceGiant'; });
      if (gi) tally.giants++; else tally.noGiant++;
      if (n === 1) Object.keys(s).forEach(function (k) { keys[k] = Array.isArray(s[k]) ? 'array[' + s[k].length + ']' : typeof s[k]; });
    } catch (e) { bad.push(st.id + ': ' + e.message); }
  });
});
console.log('empty systems', n, JSON.stringify(tally));
console.log('threw', bad.length, bad.slice(0, 5).join(' | '));
console.log('fields', JSON.stringify(keys));
