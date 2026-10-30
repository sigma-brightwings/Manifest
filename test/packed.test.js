/* packed.test.js — the models and station geometry are stored gzipped (2026-10-30).
 *
 * Astra: "can you compress the data somehow?" and "ensure the executable
 * can unpack the compressed data". What has to hold for that to be safe:
 * every working copy is what the repo stores (or the change is lost); every
 * station the game knows has its stored geometry; and each of the three
 * readers (the node loader the suites use, the .exe's game:// scheme, the
 * dev server) gives back exactly the bytes the generator wrote, from the
 * .gz alone.
 *
 *     node test/packed.test.js
 */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
var http = require('http'), child = require('child_process');
var ROOT = path.join(__dirname, '..');
var Pack = require(path.join(ROOT, 'tools', 'pack.cjs'));
var Packed = require(path.join(ROOT, 'electron', 'packed.js'));

var pass = 0, fail = 0, pending = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function done() {
  if (--pending > 0) return;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}
pending++;

console.log('--- what is stored ---');
var pairs = Pack.pairs();
var gzs = pairs.filter(function (p) { return fs.existsSync(path.join(ROOT, p.gz)); });
check('there is packed data at all', gzs.length > 300, gzs.length);
var unreadable = gzs.filter(function (p) {
  try { zlib.gunzipSync(fs.readFileSync(path.join(ROOT, p.gz))); return false; } catch (e) { return true; }
});
check('every .gz unpacks', !unreadable.length, unreadable.map(function (p) { return p.gz; }).join(', '));
var stale = Pack.stale();
check('every working copy is what the repo stores (else: npm run pack)', !stale.length,
      stale.slice(0, 5).map(function (s) { return s.plain + ' ' + s.why; }).join('; '));
var lfsLeft = gzs.filter(function (p) {
  return /^version https:\/\/git-lfs/.test(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, p.gz))).slice(0, 40).toString());
});
check('no LFS pointer was packed in place of art', !lfsLeft.length, lfsLeft.map(function (p) { return p.gz; }).join(', '));

console.log('--- every station has its geometry ---');
var src = fs.readFileSync(path.join(ROOT, 'src', 'ports.js'), 'utf8');
var lib = JSON.parse(src.match(/global\.PortLib = (\{.*\});\r?\n/)[1]);
var lazy = Object.keys(lib).filter(function (id) { return lib[id].lazy; });
var missing = lazy.filter(function (id) { return !fs.existsSync(path.join(ROOT, 'src', 'ports', id + '.js.gz')); });
check('every port the index loads lazily is stored as src/ports/<id>.js.gz', lazy.length > 0 && !missing.length, missing.join(', '));

console.log('--- the node loader reads the .gz alone ---');
/* A tree with ports.js and ONE packed station, nothing else. */
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-packed-'));
fs.mkdirSync(path.join(tmp, 'ports'));
var id = lazy[0];
fs.copyFileSync(path.join(ROOT, 'src', 'ports.js'), path.join(tmp, 'ports.js'));
fs.copyFileSync(path.join(ROOT, 'src', 'ports', id + '.js.gz'), path.join(tmp, 'ports', id + '.js.gz'));
var out = child.execFileSync(process.execPath, ['-e',
  "require(" + JSON.stringify(path.join(tmp, 'ports.js')) + ");" +
  "var ok = PortGeo.load(" + JSON.stringify(id) + ");" +
  "var m = PortLib[" + JSON.stringify(id) + "];" +
  "console.log(JSON.stringify({ ok: ok, lazy: m.lazy, keys: Object.keys(m).length }));"]).toString();
var r = JSON.parse(out.trim().split('\n').pop());
check('PortGeo.load(' + id + ') succeeds with only the .gz there', r.ok === true && r.lazy === false, out.trim());

console.log('--- the .exe and the dev server answer with the unpacked bytes ---');
var plain = path.join(tmp, 'ports', id + '.js');
var want = zlib.gunzipSync(fs.readFileSync(plain + '.gz'));
check('electron/packed.js unpacks a .gz-only file, byte for byte', (Packed.readPackedSync(plain) || Buffer.alloc(0)).equals(want));
check('and serves it as a script', Packed.typeOf(plain) === 'text/javascript');
var main = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
check('the game:// scheme in the .exe goes through it', /readPacked\(file\)/.test(main) && /require\('\.\/packed\.js'\)/.test(main));
var pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('the .exe ships the .gz and not the working copies', pkg.build.files.indexOf('!src/ports/*.js') >= 0 && pkg.build.files.indexOf('src/**/*') >= 0);
fs.unlinkSync(path.join(tmp, 'ports.js'));

pending++;
Packed.readPacked(plain).then(function (data) {
  check('the async path (the one main.js awaits) gives the same bytes', !!data && data.equals(want));
  done();
}, function (e) { check('the async path (the one main.js awaits) gives the same bytes', false, e.message); done(); });

/* The dev server, against the real tree, for a port whose plain copy is
 * set aside for the moment: it has to answer from the .gz. */
pending++;
var srv = child.spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.js'), '8799'], { stdio: 'ignore' });
setTimeout(function () {
  var realPlain = path.join(ROOT, 'src', 'ports', id + '.js'), aside = realPlain + '.aside';
  var moved = fs.existsSync(realPlain);
  if (moved) fs.renameSync(realPlain, aside);
  http.get('http://127.0.0.1:8799/src/ports/' + id + '.js', function (res) {
    var chunks = [];
    res.on('data', function (c) { chunks.push(c); });
    res.on('end', function () {
      if (moved) fs.renameSync(aside, realPlain);
      srv.kill();
      check('tools/serve.js answers from the .gz', res.statusCode === 200 && Buffer.concat(chunks).equals(want), res.statusCode);
      done();
    });
  }).on('error', function (e) {
    if (moved) fs.renameSync(aside, realPlain);
    srv.kill();
    check('tools/serve.js answers from the .gz', false, e.message);
    done();
  });
}, 600);

done();
