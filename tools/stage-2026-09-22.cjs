/* stage-2026-09-22.cjs - file the 22-09-2026 drop into the folders the
 * converters read, under the ids the game uses.
 *
 *   node tools/stage-2026-09-22.cjs            print the plan
 *   node tools/stage-2026-09-22.cjs --apply    copy (and retire what it replaces)
 *
 * Id grammar for ports:  <pattern>[-navy|-syn]-<s|m|l>
 * The livery suffix is what render.js reads to pick a faction's building
 * (see PORT_LIVERY there). A pattern with no suffix is the civilian one.
 *
 * Two orbital families arrived and they are not the same buildings:
 *   *_2_variant      cylinder-station / spine-station / ring-station / cradle-station
 *                    - civilian only, the full-dress revision of the 09-21 set.
 *                    They take the plain ids (cylinder-m ...) and replace it.
 *   *-subvariant_3   cylinder / spine / ring / cradle in plain, navy and syn
 *                    - the liveried set. They become <pattern>-classic[-navy|-syn].
 * Industry, each in civ/navy/synd:  yard (shipyard), refinery, skimmer.
 * Surface: city-port and the farm, each in plain/navy/syn. Buried: comet.
 * Browser download counters "(1)" are stripped; the newest write wins.
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
/* Any later drop in the same naming: pass its folder as the first argument. */
var srcArg = process.argv.slice(2).filter(function (a) { return a.indexOf('--') !== 0; })[0];
var SRC = srcArg ? path.resolve(srcArg) : path.join(ROOT, 'new models', '22-09-2026');
var APPLY = process.argv.indexOf('--apply') >= 0;

var HULL_ALIAS = { 'escape-pod': 'escape_pod', 'h2-freighter': 'h2_freighter', 'enf-heavy': 'enforcer_heavy' };
var LIV = { civ: '', navy: '-navy', synd: '-syn', syn: '-syn' };

function portId(stem) {
  var m;
  /* The ice-world runway ports still being made: Runway-REFI-S / -INDU- /
   * -PASS-, optionally with a navy or syn livery. render.js already asks for
   * runway-refi-*, runway-indu-*, runway-pass-* (ROLE_PATTERNS), so filing
   * them under these ids is all it takes to switch them on. */
  if ((m = stem.toLowerCase().match(/^runway[-_](refi|indu|pass)(?:[-_](navy|syn|synd|civ))?[-_](s|m|l)(?:[-_].*)?$/))) {
    return 'runway-' + m[1] + (m[2] && m[2] !== 'civ' ? '-' + (m[2] === 'navy' ? 'navy' : 'syn') : '') + '-' + m[3];
  }
  /* The ground sites (Astra, 24-09: "Pad and Mountain and Mountain pad and
   * city are all ground stations ... the bays live underground"):
   * pad-site / mountain-site / runway-site and the city-built padCity /
   * runwayCity. Optionally liveried the same way as everything else. */
  if ((m = stem.match(/^(pad|mountain|padCity|runway|runwayCity|mountainPad)-site(?:[-_](navy|syn|synd|civ))?-(s|m|l)$/i))) {
    var gs = m[1].replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    return gs + '-site' + (m[2] && m[2].toLowerCase() !== 'civ' ? '-' + (m[2].toLowerCase() === 'navy' ? 'navy' : 'syn') : '') + '-' + m[3];
  }
  // _2_variant: <kind>-station-<sz>_2_variant, kind may carry civ/navy/synd
  if ((m = stem.match(/^(civ|navy|synd)-(yard|refinery|skimmer)-station-(s|m|l)_2_variant$/))) {
    return m[2] + LIV[m[1]] + '-' + m[3];
  }
  /* The new station designs take the plain pattern ids (24-09: the 09-21
   * spine is retired and the new one reads through its berth groups). */
  if ((m = stem.match(/^(cylinder|spine|ring|cradle)-station-(s|m|l)_2_variant$/))) {
    return m[1] + '-' + m[2];
  }
  /* ...and when one of them arrives AUTHORED in a livery (the 24-09 evening
   * drop has navy-cylinder-station-*), it takes the liveried id and so
   * replaces the skinned copy tools/skin-liveries.cjs would otherwise make.
   * skin-liveries now leaves an authored livery alone. */
  if ((m = stem.match(/^(civ|navy|synd)-(cylinder|spine|ring|cradle)-station-(s|m|l)_2_variant$/))) {
    return m[2] + LIV[m[1]] + '-' + m[3];
  }
  // subvariant_3: <pattern>[-navy|-syn]-<sz>-subvariant_3
  if ((m = stem.match(/^(cylinder|spine|ring|cradle|city-port|syndicate-farm|comet)(-navy|-syn)?-(s|m|l)-subvariant_3$/))) {
    var pat = m[1], liv = m[2] || '';
    if (/^(cylinder|spine|ring|cradle)$/.test(pat)) pat += '-classic';
    if (pat === 'syndicate-farm') pat = 'farm';
    return pat + liv + '-' + m[3];
  }
  return null;
}

var files = fs.readdirSync(SRC).filter(function (f) { return /\.glb$/i.test(f); });
var plan = {};
files.forEach(function (f) {
  var stem = f.replace(/\(\d+\)\.glb$/i, '').replace(/\.glb$/i, '');
  var id, dest;
  if (/^detail-kit/.test(stem)) { id = 'detail-kit'; dest = 'ref/port-art'; }
  /* The 09-21 hydrogen refinery: superseded by the 24-09 refinery set, and
   * NOT a hull, which is where the fallback below would file it. */
  else if (/^hydrogen-refinery-station-/.test(stem)) { console.log('-- skipped (superseded) ' + f); return; }
  /* The -classic liveried stations are skin templates, not ports (Astra,
   * 24-09): filed where tools/skin-liveries.cjs reads them and the port
   * converter does not. */
  else if ((id = portId(stem))) { dest = /-classic/.test(id) ? 'ref/port-art/livery-templates' : 'ref/ports'; }
  else {
    var hm = stem.match(/^(.*)-(s|m|l)$/);
    if (!hm) { console.log('?? unplaced ' + f); return; }
    id = (HULL_ALIAS[hm[1]] || hm[1]) + '-' + hm[2]; dest = 'ref/glb';
  }
  var key = dest + '/' + id + '.glb';
  var st = fs.statSync(path.join(SRC, f));
  if (!plan[key] || st.mtimeMs > plan[key].mtime) plan[key] = { src: f, mtime: st.mtimeMs, id: id, dest: dest, n: (plan[key] ? plan[key].n : 0) + 1 };
  else plan[key].n++;
});

/* What the new set replaces in ref/ports and therefore retires: the 09-21
 * hydrogen refinery (the civ refinery supersedes it) and the old city-port. */
var RETIRE = ['refinery-s', 'refinery-m', 'refinery-l', 'city-port-s', 'city-port-m', 'city-port-l',
              'cylinder-s', 'cylinder-m', 'cylinder-l',
              'ring-s', 'ring-m', 'ring-l', 'cradle-s', 'cradle-m', 'cradle-l'];

var keys = Object.keys(plan).sort();
var counts = {};
keys.forEach(function (k) {
  var p = plan[k];
  var existed = fs.existsSync(path.join(ROOT, k));
  counts[p.dest] = (counts[p.dest] || 0) + 1;
  console.log((existed ? 'replace ' : 'NEW     ') + k.padEnd(40) + ' <- ' + p.src + (p.n > 1 ? '  (' + p.n + ' copies, newest)' : ''));
});
console.log(JSON.stringify(counts));

if (APPLY) {
  var ret = path.join(ROOT, 'ref', 'ports-retired', '2026-09-21');
  fs.mkdirSync(ret, { recursive: true });
  RETIRE.forEach(function (id) {
    var from = path.join(ROOT, 'ref', 'ports', id + '.glb');
    /* Never over an earlier retirement: a second run must not replace the
     * 09-21 originals with the files that already superseded them. */
    if (fs.existsSync(from) && !fs.existsSync(path.join(ret, id + '.glb'))) fs.copyFileSync(from, path.join(ret, id + '.glb'));
  });
  /* EVERY MODEL A LATER DROP REPLACES IS RETIRED BY NAME (Astra, 24-09:
   * "retire the models of the same name"): the file it overwrites goes to
   * ref/ports-retired/<today>/ first, unless it is byte-identical to its
   * replacement, which would be retiring nothing. Ports only — a hull is
   * one file in git and its history is the retirement. */
  var today = new Date().toISOString().slice(0, 10);
  /* ONE FOLDER PER RUN, NOT PER DAY. The keep-the-first-copy rule below is
   * right within a run and wrong across two: the 24-09 evening drop replaced
   * models the 24-09 morning drop had installed, and a per-day folder
   * already held the morning's retirements under the same ids — so the
   * morning's versions would have been overwritten without being kept.
   * If today's folder is taken, the run gets its own suffixed one. */
  var retDay = path.join(ROOT, 'ref', 'ports-retired', today);
  for (var rn = 2; fs.existsSync(retDay); rn++) {
    retDay = path.join(ROOT, 'ref', 'ports-retired', today + '-' + rn);
  }
  var retired = [], same = [];
  keys.forEach(function (k) {
    var to = path.join(ROOT, k), from = path.join(SRC, plan[k].src);
    if (plan[k].dest === 'ref/ports' && fs.existsSync(to)) {
      if (fs.readFileSync(to).equals(fs.readFileSync(from))) { same.push(plan[k].id); return; }
      fs.mkdirSync(retDay, { recursive: true });
      var keep = path.join(retDay, plan[k].id + '.glb');
      if (!fs.existsSync(keep)) fs.copyFileSync(to, keep);
      retired.push(plan[k].id);
    }
    fs.mkdirSync(path.join(ROOT, plan[k].dest), { recursive: true });
    fs.copyFileSync(from, to);
  });
  console.log('retired to ' + path.relative(ROOT, retDay) + ': ' + (retired.join(', ') || 'none'));
  console.log('identical, left alone: ' + (same.join(', ') || 'none'));
  console.log('APPLIED. Replaced port models kept in ref/ports-retired/2026-09-21.');
}
