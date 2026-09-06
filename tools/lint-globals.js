/* lint-globals.js — catch cross-module references that only work in a browser.
 *
 *     node tools/lint-globals.js
 *
 * Every file in src/ is an IIFE handed a `global`:
 *
 *     })(typeof window !== 'undefined' ? window : globalThis);
 *
 * In a browser `window` IS the global object, so a bare `Screens.editing()`
 * resolves and a file can get away with never saying where `Screens` came
 * from. Headless it does not: the test harness passes a plain object as
 * `window`, so a bare identifier goes to Node's real global scope, finds
 * nothing, and throws ReferenceError — but only if that exact line runs.
 * A slip like this can therefore sit in the tree for weeks and then take
 * out the whole suite the day a test finally reaches it.
 *
 * The rule this enforces is the one the code already follows almost
 * everywhere: a cross-module name is either aliased at the top of the file
 * (`var Sim = global.Sim;`) or written `global.Sim` at the point of use.
 * Never bare.
 *
 * Deliberately a regex and not a parser. It reads declarations and member
 * accesses, both of which are unambiguous enough at this scale, and it errs
 * toward silence: a name declared anywhere in the file as a var, function,
 * parameter or catch binding is assumed local.
 */
'use strict';

var fs = require('fs');
var path = require('path');

/* The names each src file publishes onto `global`. */
var MODULES = ['V', 'RNG', 'Kepler', 'Economy', 'Gen', 'Galaxy', 'Sim',
               'Combat', 'Missions', 'Arcs', 'Sound', 'Save', 'Hulls',
               'Render', 'GLWorld', 'Screens', 'Slipspace', 'Game'];

var srcDir = path.resolve(__dirname, '..', 'src');
var files = fs.readdirSync(srcDir).filter(function (f) { return /\.js$/.test(f); });

var problems = [];

files.forEach(function (file) {
  var text = fs.readFileSync(path.join(srcDir, file), 'utf8');

  /* Strip comments and strings first, or a name inside a comment counts as
   * a use and a name inside a string counts as a declaration. */
  var code = text
    .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); })
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

  /* Anything the file declares for itself is local, however it declares it. */
  var local = {};
  var decl = /(?:\bvar\s+|\blet\s+|\bconst\s+|\bfunction\s+|\bcatch\s*\(\s*)([A-Za-z_$][\w$]*)/g;
  var m;
  while ((m = decl.exec(code))) local[m[1]] = true;
  /* ...including the IIFE's own parameter list and every function's. */
  var params = /function\s*[\w$]*\s*\(([^)]*)\)/g;
  while ((m = params.exec(code))) {
    m[1].split(',').forEach(function (p) {
      p = p.trim();
      if (p) local[p] = true;
    });
  }
  /* A `var X = ..., Y = ...` list only matches its first name above. */
  var chained = /,\s*([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = chained.exec(code))) local[m[1]] = true;

  MODULES.forEach(function (name) {
    if (local[name]) return;
    /* A use: `Name.` or `Name(` not preceded by a dot (which would make it
     * a property) and not preceded by `global.`. */
    var use = new RegExp('(^|[^.\\w$])' + name + '\\s*[.(]', 'g');
    var idx = 0, hit;
    while ((hit = use.exec(code))) {
      var line = code.slice(0, hit.index).split('\n').length;
      problems.push({
        file: file,
        line: line,
        name: name,
        text: text.split('\n')[line - 1].trim()
      });
      idx = use.lastIndex;
      if (idx > code.length) break;
    }
  });
});

if (!problems.length) {
  console.log('lint-globals: clean — every cross-module name is aliased or qualified');
  process.exit(0);
}

console.log('lint-globals: ' + problems.length + ' bare cross-module reference' +
            (problems.length === 1 ? '' : 's') +
            ' — these work in a browser and throw headless\n');
problems.forEach(function (p) {
  console.log('  src/' + p.file + ':' + p.line + '   ' + p.name +
              ' is neither aliased nor written global.' + p.name);
  console.log('      ' + p.text);
});
process.exit(1);
