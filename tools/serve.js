/* serve.js — a throwaway static server for playtesting.
 *
 *     node tools/serve.js [port]
 *
 * The game itself needs no server: index.html runs from the file system,
 * which is the whole point of the plain <script> tags. This exists only so
 * a browser automation harness can drive it, and it sends no-store on
 * everything because a cached src/main.js is a playtest of yesterday's
 * build that looks exactly like a playtest of today's.
 */
var http = require('http'), fs = require('fs'), path = require('path');
var port = parseInt(process.argv[2], 10) || 8732;
var root = path.resolve(__dirname, '..');
var TYPES = { '.html': 'text/html', '.js': 'text/javascript',
              '.css': 'text/css', '.json': 'application/json' };

http.createServer(function (req, res) {
  var url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  var file = path.join(root, url);
  if (file.indexOf(root) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'text/plain',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1', function () {
  console.log('serving ' + root + ' on http://127.0.0.1:' + port);
});
