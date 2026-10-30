/* packed.js — serve a file that is stored gzipped (2026-10-30).
 *
 * The station geometry ships as src/ports/<id>.js.gz (tools/pack.cjs), so
 * the .exe carries ~33 MB of it instead of ~270 MB. When the game asks for
 * src/ports/ring-l.js and only ring-l.js.gz is there, this unpacks it in
 * memory and answers with the plain script, so nothing in the page knows
 * the difference: the synchronous read in src/ports.js and the <script>
 * fallback both get exactly the bytes the generator wrote.
 *
 * A plain file, if one is present (a dev tree after `npm run unpack`), wins.
 * Used by electron/main.js (the game:// scheme) and tools/serve.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm'
};

function typeOf(file) { return TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'; }

/* The unpacked bytes of `file` when only `file`.gz exists; otherwise null. */
function readPackedSync(file) {
  if (fs.existsSync(file) || !fs.existsSync(file + '.gz')) return null;
  return zlib.gunzipSync(fs.readFileSync(file + '.gz'));
}

function readPacked(file) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(file) || !fs.existsSync(file + '.gz')) return resolve(null);
    fs.readFile(file + '.gz', (err, gz) => {
      if (err) return reject(err);
      zlib.gunzip(gz, (err2, data) => (err2 ? reject(err2) : resolve(data)));
    });
  });
}

module.exports = { readPacked, readPackedSync, typeOf };
