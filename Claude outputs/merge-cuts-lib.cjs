// The cut table's house format: one row per size, notes kept.
function arr(a) { return '[' + a.join(', ') + ']'; }
function row(r) { return '{ "z": ' + arr(r.z) + ', "y": ' + arr(r.y) + ', "x": ' + arr(r.x) + ' }'; }
exports.format = function (t) {
  var fams = Object.keys(t).filter(function (k) { return k[0] !== '_'; }).sort();
  var out = '{\n "_about": ' + JSON.stringify(t._about) + ',\n' + fams.map(function (k) {
    var e = t[k], lines = [];
    if (e.note) lines.push('  "note": ' + JSON.stringify(e.note));
    ['s', 'm', 'l'].forEach(function (z) { if (e[z]) lines.push('  "' + z + '": ' + row(e[z])); });
    return ' "' + k + '": {\n' + lines.join(',\n') + '\n }';
  }).join(',\n') + '\n}\n';
  JSON.parse(out);
  return out;
};
