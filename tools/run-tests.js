#!/usr/bin/env node
/* run-tests.js — the suite in groups (Astra, 2026-11-02: "if the full test
 * suite isn't running, we have to break the tests into various suites").
 *
 *     node tools/run-tests.js              every group, in order
 *     node tools/run-tests.js ships combat just those groups
 *     node tools/run-tests.js --list       the groups and what is in them
 *     node tools/run-tests.js --stop       stop at the first failing file
 *
 * WHY THIS EXISTS. `npm test` was one 79-command `&&` chain. Three things
 * were wrong with that once the suite got big:
 *
 *   - It stopped at the first failure, so one red file hid the state of
 *     every file after it, and a rerun started from the top — fifteen
 *     minutes to get back to where it fell over.
 *   - There was no way to run "the part I touched". A change to the deck
 *     plan wants the ship-interior tests, not the economy.
 *   - When a file died of memory (berths.test.js, 2026-11-02, OOM-killed
 *     while two headless browsers ran beside it) the chain just stopped.
 *     Nothing said which file or how big it had got.
 *
 * So: named groups, each file in its own process (as before — the `&&`
 * chain already did that, and it is what keeps one file's heap from
 * stacking onto the next), run ONE AT A TIME (the machine this runs on has
 * the memory for one big file, not two), and every file reported with its
 * wall time and peak memory whether it passed or not. A summary at the end
 * names every failure; the exit code is non-zero if any file failed.
 *
 * Every test file must be in exactly one group. A new test nobody added
 * here would otherwise never run, which is the failure this whole repo is
 * built to avoid — so an ungrouped or double-grouped file is itself a
 * failure, reported before anything runs. */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var os = require('os');

var ROOT = path.join(__dirname, '..');

/* The groups. Order within a group is the old chain's order; the heavy
 * files (render, berths, transfer — over a gigabyte each) are alone, so they can be run by themselves when
 * memory is short, and so their time does not hide inside another group's.
 * Peak memory and time as measured 2026-11-02 are in --list's output, not
 * here — they change, and a stale number in a comment is worse than none. */
var GROUPS = {
  core: [
    'tools/lint-globals.js', 'test/packed.test.js', 'test/packed-browser.test.js',
    'test/self.test.js', 'test/release.test.js', 'test/physics.test.js',
    'test/nodes.test.js', 'test/galaxy.test.js', 'test/weather.test.js',
    'test/orbitline.test.js', 'test/heading.test.js', 'test/airdata.test.js',
    'test/twilight.test.js', 'test/polar.test.js', 'test/rings.test.js',
    'test/turningground.test.js'
  ],
  render: ['test/render.test.js'],
  view: [
    'test/cockpit.test.js', 'test/greebles.test.js', 'test/dressing.test.js',
    'test/hangar.test.js', 'test/cruisesky.test.js', 'test/navsystem.test.js',
    'test/tear.test.js', 'test/groundport-look.test.js'
  ],
  berths: ['test/berths.test.js'],
  ships: [
    'test/ships.test.js', 'test/shipyard.test.js', 'test/start.test.js',
    'test/crew.test.js', 'test/fleet.test.js', 'test/shipdeck.test.js',
    'test/nosecockpit.test.js', 'test/walk.test.js', 'test/npc.test.js',
    'test/towers.test.js', 'test/airlock.test.js',
    'test/dialogue.test.js', 'test/boarding.test.js', 'test/boarding3.test.js'
  ],
  /* The exit transfer runs every port's carrier route: 2.2 GB, a heavy
   * file in the same class as berths, so it stands alone too. */
  transfer: ['test/transfer.test.js'],
  combat: [
    'test/combat.test.js', 'test/gunnery.test.js', 'test/massdriver.test.js',
    'test/syndicate-fleet.test.js', 'test/aggression.test.js', 'test/hunters.test.js',
    'test/stealth.test.js', 'test/mark.test.js', 'test/arms.test.js',
    'test/licence.test.js', 'test/split.test.js', 'test/tithe.test.js',
    'test/wars.test.js'
  ],
  economy: [
    'test/economy.test.js', 'test/holdings.test.js', 'test/milfuel.test.js',
    'test/shiptrade.test.js', 'test/analysers.test.js', 'test/farms.test.js',
    'test/growth.test.js', 'test/construction.test.js', 'test/stations.test.js',
    'test/city-sites.test.js', 'test/upkeep.test.js', 'test/parcel.test.js'
  ],
  ground: [
    'test/survey.test.js', 'test/claims.test.js', 'test/ground.test.js',
    'test/mining.test.js', 'test/prospectors.test.js', 'test/biomes.test.js',
    'test/seaplatform.test.js'],
  story: [
    'test/arcs.test.js', 'test/captains.test.js', 'test/captain-stories.test.js',
    'test/messages.test.js', 'test/favours.test.js', 'test/rumours.test.js',
    'test/journal.test.js', 'test/tutorial.test.js', 'test/rescue.test.js', 'test/slipspace.test.js',
    'test/cruisedrive.test.js'
  ]
};

/* Every file under test/ that is a suite, and the lint, must be grouped
 * exactly once. */
function audit() {
  var seen = {}, problems = [];
  Object.keys(GROUPS).forEach(function (g) {
    GROUPS[g].forEach(function (f) {
      if (seen[f]) problems.push(f + ' is in both ' + seen[f] + ' and ' + g);
      else seen[f] = g;
      if (!fs.existsSync(path.join(ROOT, f))) problems.push(f + ' (group ' + g + ') does not exist');
    });
  });
  fs.readdirSync(path.join(ROOT, 'test')).forEach(function (n) {
    if (/\.test\.js$/.test(n) && !seen['test/' + n]) problems.push('test/' + n + ' is in no group — add it to tools/run-tests.js');
  });
  return problems;
}

/* Peak memory: the child reports its own maxRSS on exit through a preload,
 * into a file named in the environment. resourceUsage is the kernel's
 * number, so it is the real peak, not a sample that missed it. A file
 * killed outright (OOM) never runs its exit hook — then there is no
 * number, and that absence is reported as what it is. */
var PRELOAD = path.join(os.tmpdir(), 'manifest-maxrss-preload.js');
fs.writeFileSync(PRELOAD,
  "process.on('exit', function () { try { require('fs').writeFileSync(process.env.MANIFEST_RSS_OUT, String(process.resourceUsage().maxRSS)); } catch (e) {} });\n");

function runFile(f) {
  var out = path.join(os.tmpdir(), 'manifest-rss-' + process.pid + '-' + path.basename(f));
  try { fs.unlinkSync(out); } catch (e) {}
  var t0 = Date.now();
  var r = cp.spawnSync(process.execPath, ['--require', PRELOAD, f], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    env: Object.assign({}, process.env, { MANIFEST_RSS_OUT: out })
  });
  var ms = Date.now() - t0;
  var rss = null;
  try { rss = +fs.readFileSync(out, 'utf8') / 1024; fs.unlinkSync(out); } catch (e) {}
  var text = (r.stdout || '') + (r.stderr || '');
  var fails = text.split('\n').filter(function (l) { return /^\s*FAIL\b/.test(l); });
  var tally = (text.match(/(\d+) passed, (\d+) failed/g) || []).pop() || '';
  return {
    file: f, ok: r.status === 0, status: r.status, signal: r.signal, ms: ms, rssMB: rss,
    fails: fails, tally: tally, tail: text.trim().split('\n').slice(-6).join('\n')
  };
}

function fmtTime(ms) { return ms < 60000 ? (ms / 1000).toFixed(1) + ' s' : Math.floor(ms / 60000) + ' m ' + Math.round(ms % 60000 / 1000) + ' s'; }
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

var args = process.argv.slice(2);
var stop = args.indexOf('--stop') >= 0;
var wanted = args.filter(function (a) { return a[0] !== '-'; });

var problems = audit();
if (args.indexOf('--list') >= 0) {
  Object.keys(GROUPS).forEach(function (g) { console.log(pad(g, 9) + GROUPS[g].length + ' files: ' + GROUPS[g].map(function (f) { return path.basename(f).replace('.test.js', ''); }).join(', ')); });
  problems.forEach(function (p) { console.log('PROBLEM ' + p); });
  process.exit(problems.length ? 1 : 0);
}
if (problems.length) {
  problems.forEach(function (p) { console.log('FAIL  ' + p); });
  process.exit(1);
}
var unknown = wanted.filter(function (g) { return !GROUPS[g]; });
if (unknown.length) {
  console.log('No such group: ' + unknown.join(', ') + '. Groups: ' + Object.keys(GROUPS).join(', '));
  process.exit(1);
}
var groups = wanted.length ? wanted : Object.keys(GROUPS);

var results = [], t0 = Date.now(), stopped = false;
groups.forEach(function (g) {
  if (stopped) return;
  console.log('=== ' + g + ' (' + GROUPS[g].length + ') ===');
  GROUPS[g].forEach(function (f) {
    if (stopped) return;
    var r = runFile(f);
    r.group = g;
    results.push(r);
    var how = r.ok ? 'ok  ' : r.signal ? 'DIED' : 'FAIL';
    console.log('  ' + how + ' ' + pad(path.basename(f), 30) + pad(fmtTime(r.ms), 10) +
                pad(r.rssMB === null ? 'no peak (killed?)' : Math.round(r.rssMB) + ' MB', 12) + r.tally);
    if (!r.ok) {
      if (r.signal) console.log('       killed by ' + r.signal + (r.signal === 'SIGKILL' ? ' — most likely out of memory' : ''));
      (r.fails.length ? r.fails.slice(0, 12) : [r.tail]).forEach(function (l) { console.log('       ' + l.trim()); });
      if (stop) stopped = true;
    }
  });
});

var bad = results.filter(function (r) { return !r.ok; });
console.log('');
console.log(results.length + ' files, ' + (results.length - bad.length) + ' green, ' + bad.length + ' red, ' + fmtTime(Date.now() - t0) +
            (stopped ? ' (stopped at the first failure)' : ''));
var heavy = results.filter(function (r) { return r.rssMB !== null; }).sort(function (a, b) { return b.rssMB - a.rssMB; }).slice(0, 3);
if (heavy.length) console.log('heaviest: ' + heavy.map(function (r) { return path.basename(r.file) + ' ' + Math.round(r.rssMB) + ' MB'; }).join(', '));
bad.forEach(function (r) { console.log('  RED  ' + r.group + '/' + path.basename(r.file)); });
process.exit(bad.length ? 1 : 0);
