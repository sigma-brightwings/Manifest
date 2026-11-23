/* unmojibake.cjs - undo a PowerShell 5 Get-Content/Set-Content round trip
 * that read a UTF-8 file as Windows-1252 and wrote it back as UTF-8 with a
 * BOM ("—" became "â€”"). Re-encodes every character to its cp1252 byte and
 * decodes the bytes as UTF-8 again.
 *
 *     node tools/unmojibake.cjs <file> [...]
 */
'use strict';
var fs = require('fs');
var CP = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
  0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
  0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
process.argv.slice(2).forEach(function (f) {
  var s = fs.readFileSync(f, 'utf8');
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  var bytes = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x100 && !(c >= 0x80 && c < 0xA0)) bytes.push(c);
    else if (CP[c] !== undefined) bytes.push(CP[c]);
    else { console.log(f + ': char ' + c.toString(16) + ' at ' + i + ' has no cp1252 byte; left alone'); return; }
  }
  var out = Buffer.from(bytes).toString('utf8');
  fs.writeFileSync(f, out, 'utf8');
  console.log(f + ': restored');
});
