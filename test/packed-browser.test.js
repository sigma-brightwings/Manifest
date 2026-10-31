/* The station geometry on a host that serves the repo as it stands.
 *
 * 2026-10-31: GitHub Pages was set to "Deploy from a branch", so the site
 * held src/ports/<id>.js.gz and no .js. Every station 404'd and drew as its
 * procedural stand-in, silently. The page loader now falls back to the
 * .js.gz and unpacks it itself, and tells onfail listeners when a model
 * cannot be had at all. This runs src/ports.js as a page would - a vm
 * context with document, a synchronous XHR that sees the 404, and the real
 * fetch / DecompressionStream - against a server that has only the .gz.
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm'), zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// Serves src/ as a dumb static host. ?mode=encoded sends .gz files with
// Content-Encoding: gzip under the .js name, the way some hosts do.
function serve(mode) {
  return http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(path.join(ROOT, 'src'))) { res.writeHead(403); return res.end(); }
    // Never serve an unpacked working copy: this host only has what git has.
    if (/src[\\\/]ports[\\\/][^\\\/]+\.js$/.test(file)) { res.writeHead(404); return res.end('not found'); }
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    const body = fs.readFileSync(file);
    if (mode === 'encoded' && file.endsWith('.gz')) {
      res.writeHead(200, { 'content-type': 'application/javascript', 'content-encoding': 'gzip' });
    } else {
      res.writeHead(200, { 'content-type': file.endsWith('.gz') ? 'application/gzip' : 'application/javascript' });
    }
    res.end(body);
  });
}

// A page: what ports.js sees in a browser.
function page(base) {
  const scripts = [];
  const ctx = {
    console, fetch, DecompressionStream, Response, Blob, TextDecoder, Uint8Array, Error, Promise,
    document: {
      currentScript: { src: base + 'src/ports.js' },
      createElement: () => { const s = {}; scripts.push(s); return s; },
      head: { appendChild: (s) => { /* the script tag 404s, as on the broken site */ setTimeout(() => s.onerror && s.onerror(), 0); } }
    },
    // A synchronous read of a missing file answers 404, as the browser does.
    XMLHttpRequest: function () {
      this.open = (m, u) => { this.url = u; };
      this.send = () => { this.status = 404; this.responseText = 'not found'; };
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'ports.js'), 'utf8'), ctx, { filename: 'ports.js' });
  return ctx;
}

function waitFor(cond, ms) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    (function tick() { if (cond() || Date.now() - t0 > ms) return resolve(cond()); setTimeout(tick, 20); })();
  });
}

async function run(mode, port) {
  const srv = serve(mode);
  await new Promise(r => srv.listen(port, '127.0.0.1', r));
  try {
    const w = page('http://127.0.0.1:' + port + '/');
    const lib = w.PortLib;
    const id = Object.keys(lib).find(k => lib[k].lazy && fs.existsSync(path.join(ROOT, 'src', 'ports', k + '.js.gz')));
    ok(!!id, mode + ': a lazy station to load (' + id + ')');
    const arrived = [], failed = [];
    w.PortGeo.onload(i => arrived.push(i));
    w.PortGeo.onfail(i => failed.push(i));

    ok(w.PortGeo.load(id) === false, mode + ': first answer is "not yet" (no synchronous gunzip in a page)');
    ok(w.PortGeo.state(id) === 'pending', mode + ': the packed copy is on its way');
    await waitFor(() => arrived.length || failed.length, 15000);
    ok(arrived[0] === id && !failed.length, mode + ': unpacked from the .js.gz and onload fired');
    ok(w.PortGeo.loaded(id) && lib[id].lazy === false, mode + ': the model is whole');

    // Same buckets as node reading the .gz directly.
    const mod = { exports: {} };
    (new Function('module', 'exports', zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'src', 'ports', id + '.js.gz'))).toString('utf8')))(mod, mod.exports);
    ok(JSON.stringify(lib[id].v) === JSON.stringify(mod.exports.v) && JSON.stringify(lib[id].f) === JSON.stringify(mod.exports.f),
      mode + ': same vertices and faces as the stored copy');

    // A station with no file at all is reported, not swallowed.
    lib['no-such-station'] = { lazy: true };
    w.PortGeo.load('no-such-station');
    await waitFor(() => failed.length, 15000);
    ok(failed[0] === 'no-such-station' && w.PortGeo.state('no-such-station') === 'failed', mode + ': a missing model fires onfail');
  } finally {
    srv.close();
  }
}

(async () => {
  console.log('packed-browser: station art on a host that only has the .gz');
  await run('raw', 8811);
  await run('encoded', 8812);
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  ok(/PortGeo\.onfail\(/.test(main) && /failed to load/.test(main), 'main.js says so on the comms line');
  const tmpl = fs.readFileSync(path.join(ROOT, 'tools', 'glb2hulls.js'), 'utf8');
  ok(tmpl.includes('geoPacked') && tmpl.includes('onfail'), 'the glb2hulls template keeps the fallback when ports.js is regenerated');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
