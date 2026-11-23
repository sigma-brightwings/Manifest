/* release.test.js -- the release name and number agree everywhere.
 *
 *     node test/release.test.js
 *
 * package.json is what the packager reads; src/release.js is what the game
 * reads. They are two copies of one fact, so this pins them together.
 */
var fs = require('fs'), path = require('path');
var pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
/* THE THIRD COPY (2026-11-22). There are not two copies of the version,
 * there are three - the lockfile carries it too - and only two were ever
 * checked. It sat at "0.1.0" from before 1.0 until an `npm install` in a
 * fresh clone quietly corrected it, and then drifted again IMMEDIATELY:
 * 1.5.2 shipped with a lockfile still saying 1.5.1. Harmless in itself,
 * since npm resolves dependencies from the tree below rather than this
 * field, but it is a number about this build that says the wrong thing,
 * and the whole point of this file is one release and one number. */
var lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));
var Release = require('../src/release.js');
var pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (info !== undefined ? '   ' + info : '')); }
}
console.log('--- one release, one number, one name ---');
check('the game and the packager carry the same version', Release.version === pkg.version, Release.version + ' vs ' + pkg.version);
check('and the same name', Release.name === pkg.releaseName, Release.name + ' vs ' + pkg.releaseName);
check('and so does the lockfile, which is the copy nobody was watching',
      lock.version === pkg.version, lock.version + ' vs ' + pkg.version);
check('including the root package entry inside it',
      !!(lock.packages && lock.packages[''] && lock.packages[''].version === pkg.version),
      (lock.packages && lock.packages[''] ? lock.packages[''].version : 'missing') + ' vs ' + pkg.version);
check('the name is a name, not a number', /^[A-Z][a-z]+$/.test(Release.name), Release.name);
check('it is written out with both', Release.label().indexOf(pkg.version) >= 0 && Release.label().indexOf(Release.name) >= 0, Release.label());
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
check('index.html loads it before main.js', html.indexOf('src/release.js') >= 0 && html.indexOf('src/release.js') < html.indexOf('src/main.js'));
var notes = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
check('CHANGELOG.md has a section for it, by number and name', notes.indexOf('## ' + pkg.version + ' "' + Release.name + '"') >= 0);
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);