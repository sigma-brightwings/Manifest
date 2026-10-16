/* Runs every suite in package.json's "test" script ONE BY ONE and reports
 * each, rather than stopping at the first red file the way `npm test` does.
 * Usage: node tools/run-all.cjs [filter]  -> one line per suite, then totals.
 * Writes the full output of any failing suite to Claude outputs/. */
'use strict';
var cp = require('child_process'), fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
var cmds = pkg.scripts.test.split('&&').map(function (s) { return s.trim(); });
var filter = process.argv[2] || '';
var extra = fs.readdirSync(path.join(root, 'test')).filter(function (f) {
  return /\.test\.js$/.test(f) && !cmds.some(function (c) { return c.indexOf(f) >= 0; });
}).map(function (f) { return 'node test/' + f; });
cmds = cmds.concat(extra);
var bad = 0;
cmds.forEach(function (c) {
  if (filter && c.indexOf(filter) < 0) return;
  var t0 = Date.now();
  var r = cp.spawnSync(c, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 1 << 28 });
  var out = (r.stdout || '') + (r.stderr || '');
  var lines = out.trim().split(/\r?\n/);
  var tail = lines.slice(-1)[0] || '';
  var ok = r.status === 0;
  if (!ok) {
    bad++;
    var name = c.replace(/[^a-z0-9]+/gi, '_');
    fs.writeFileSync(path.join(root, 'Claude outputs', 'fail-' + name + '.txt'), out);
  }
  console.log((ok ? 'ok   ' : 'FAIL ') + c + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)  ' + tail.slice(0, 140));
});
console.log(bad ? bad + ' suite(s) failed' : 'all suites green');
process.exit(bad ? 1 : 0);
