/* cargocost.test.js - what the cargo in your hold cost you (2026-11-21).
 *
 * Astra: "Trade HUD should show the cargo in your hull, how much you'll
 * make or lose taking it to your destination in either bright green or
 * bright red, fading through orange and yellow for deals which are less
 * and less bad." Losing needs a cost, and the game never kept one: this
 * holds Economy.costBuy / costSell / costOf to the rules written beside
 * them, and Render.dealColour to its ramp.
 *
 * Run: node test/cargocost.test.js
 */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'rng.js'));
var Eco = require(path.join(SRC, 'economy.js'));
var Render = require(path.join(SRC, 'render.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function near(a, b) { return Math.abs(a - b) < 1e-6; }

console.log('\n--- the average ---');
var s = { cargo: {} };
Eco.costBuy(s, 'grain', 10, 400);
Eco.costBuy(s, 'grain', 10, 600);
var c = Eco.costOf(s, 'grain', 20);
check('two buys average: 20 t for 1000 cr', near(c.cr, 1000) && near(c.paidT, 20) && near(c.freeT, 0), JSON.stringify(c));
Eco.costSell(s, 'grain', 5, 20);
c = Eco.costOf(s, 'grain', 15);
check('selling a quarter takes a quarter of the cost, and the average stands', near(c.cr, 750) && near(c.cr / c.paidT, 50), JSON.stringify(c));
Eco.costSell(s, 'grain', 15, 15);
check('selling the rest clears the record', !s.cargoCost.grain);

console.log('\n--- tonnes that cost nothing ---');
var m = { cargo: {} };
Eco.costBuy(m, 'ores', 4, 200);
c = Eco.costOf(m, 'ores', 10);
check('six mined tonnes on top of four bought are free', near(c.cr, 200) && near(c.paidT, 4) && near(c.freeT, 6), JSON.stringify(c));
c = Eco.costOf(m, 'ores', 2);
check('a hold that shrank some other way takes its share off', near(c.cr, 100) && near(c.paidT, 2), JSON.stringify(c));
check('cargo never bought costs nothing', Eco.costOf({}, 'fish', 7).cr === 0 && Eco.costOf({}, 'fish', 7).freeT === 7);

console.log('\n--- what is left out ---');
var w = { cargo: {} };
Eco.costBuy(w, 'waste', 10, -300);
check('waste, which a port pays you to take, never enters it', !w.cargoCost || !w.cargoCost.waste);
Eco.costBuy(w, 'grain', 0, 50);
check('nothing bought, nothing recorded', !w.cargoCost || !w.cargoCost.grain);

console.log('\n--- the colours ---');
function rgb(s0) { return s0.match(/\d+/g).map(Number); }
var loss = rgb(Render.dealColour(-0.5)), even = rgb(Render.dealColour(0)), good = rgb(Render.dealColour(0.5));
check('a real loss is bright red', loss[0] > 240 && loss[1] < 80 && loss[2] < 80, loss);
check('breaking even is yellow', even[0] > 240 && even[1] > 200 && even[2] < 120, even);
check('a good run is bright green', good[1] > 240 && good[0] < 90, good);
var mid = rgb(Render.dealColour(-0.15));
check('a smaller loss is orange, between the two', mid[0] > 240 && mid[1] > loss[1] && mid[1] < even[1], mid);
check('cargo that cost nothing is green', rgb(Render.dealColour(null))[1] > 240);
var steps = [-0.4, -0.3, -0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 0.3].map(function (v) { return rgb(Render.dealColour(v))[1]; });
check('greener all the way up as the margin grows', steps.every(function (g, i) { return !i || g >= steps[i - 1]; }), steps.join(','));
var bright = [-0.5, -0.2, -0.05, 0, 0.05, 0.3].every(function (v) {
  var q = rgb(Render.dealColour(v)); return Math.max(q[0], q[1], q[2]) >= 240;
});
check('every colour on the ramp is bright enough to read on a lit planet', bright);

console.log('\n--- every HUD colour is bright ---');
/* Astra: "all should be bright enough to provide good contrast". */
function lum(hex) {
  var v = [1, 3, 5].map(function (i) {
    var c0 = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c0 <= 0.03928 ? c0 / 12.92 : Math.pow((c0 + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
Object.keys(Render.HUD_TINTS).forEach(function (k) {
  var L = lum(Render.HUD_TINTS[k]);
  check('the ' + k + ' HUD has luminance 0.55 or better', L >= 0.55, L.toFixed(3));
});

console.log('\n--- every commodity has a mark ---');
var missing = Eco.COMMODITIES.filter(function (k) { return !Render.COM_ICON[k.id]; }).map(function (k) { return k.id; });
check('no commodity falls back to the plain crate', !missing.length, missing.join(','));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
