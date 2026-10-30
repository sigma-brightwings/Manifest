// Star skimming numbers (2026-10-24): for real stars of a galaxy, what a
// circular-ish pass at a given depth collects and what it heats.
global.window = global;
var path = require('path'), R = path.join(__dirname, '..', 'src') + '/';
['rng', 'vec', 'generate', 'galaxy', 'sim'].forEach(function (m) { try { require(R + m + '.js'); } catch (e) { console.log('load', m, e.message); } });
var Gen = global.Gen, Gal = global.Galaxy, S = global.Sim;
var g = Gal.build('kawartha');
var byCls = {};
g.stars.forEach(function (st) { if (!byCls[st.cls]) byCls[st.cls] = st; });
var G_KM = 6.674e-20;   // km^3 kg^-1 s^-2
var shedBare = 18, shedShield = 148;
console.log('class  temp   R(km)    depth  v(km/s)  t/min  flux  bare  shield');
Object.keys(byCls).sort().forEach(function (c) {
  var st = byCls[c], sys = Gen.generateSystem(st.seed), star = sys.root;
  [2.6, 2.0, 1.5, 1.2].forEach(function (k) {
    var r = k * star.radius, v = Math.sqrt(G_KM * star.mass / r);   // circular speed through the corona
    var rho = S.coronaDensity(star, r), tpm = rho * v * 1000 * 1500 * 0.9 / 1000 * 60;
    var f = S.starFlux(star, r);
    console.log(c.padEnd(6), String(star.temp).padEnd(6), String(Math.round(star.radius)).padEnd(8), (k + 'R').padEnd(6),
      v.toFixed(0).padEnd(8), tpm.toFixed(1).padEnd(6), f.toFixed(0).padEnd(5),
      (f <= shedBare ? 'ok' : '+' + (f - shedBare).toFixed(0)).padEnd(5), f <= shedShield ? 'ok' : '+' + (f - shedShield).toFixed(0));
  });
});
