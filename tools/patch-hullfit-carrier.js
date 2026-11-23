/* One-off (2026-11-23): take only the Carrier's entry from a fresh
 * fit-hulls run into src/hullfit.js. Her airlock deck moved down to her
 * hangar deck (shipdeck.js TOWER.carrier 35 -> 43.6), so her ramp's drop is
 * measured again; every other hull keeps the table it has. */
var fs = require('fs'), path = require('path');
global.window = global;
require(process.argv[2]);
var regen = JSON.parse(JSON.stringify(global.HullFit));
delete global.HullFit;
var file = path.join(__dirname, '..', 'src', 'hullfit.js');
require(file);
var old = global.HullFit;
console.log('old carrier', JSON.stringify(old.carrier));
console.log('new carrier', JSON.stringify(regen.carrier));
var src = fs.readFileSync(file, 'utf8');
var i = src.indexOf('"carrier": {');
var j = src.indexOf('}', i) + 1;
var block = JSON.stringify(regen.carrier, null, 1).split('\n').map(function (l, k) { return k ? '   ' + l : l; }).join('\n');
src = src.slice(0, i) + '"carrier": ' + block + src.slice(j);
fs.writeFileSync(file, src);
delete require.cache[require.resolve(file)];
delete global.HullFit;
require(file);
console.log('now carrier', JSON.stringify(global.HullFit.carrier));
