/* skin-liveries.cjs - dress the new station designs in navy and Syndicate
 * colours, using the old liveried stations as the template.
 *
 *     node tools/skin-liveries.cjs            write ref/ports/<pattern>-navy-<s|m|l>.glb
 *                                             and <pattern>-syn-<s|m|l>.glb
 *
 * Astra, 2026-09-24: "use the navy and syndicate pre-existing stations as a
 * template for the skins, but don't use them in game as a place you land."
 *
 * The templates are ref/port-art/livery-templates/<pattern>-classic{,-navy,
 * -syn}-m.glb. Every station in this project names its materials by what
 * they are (stationHull, stationAccent, adOrange ...), so a livery is a
 * mapping from a civilian material to the template's own swatch - read OUT
 * of the template file, never typed here - and the new design's geometry,
 * berths and doors are untouched. Only the JSON chunk of the GLB changes:
 * materials are data, the binary buffer is the mesh.
 *
 * Which civilian material becomes which, per livery. The right-hand names
 * are materials in the TEMPLATE; the colour comes from there. */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var PORTS = path.join(ROOT, 'ref', 'ports');
var TPL = path.join(ROOT, 'ref', 'port-art', 'livery-templates');
var PATTERNS = ['cylinder', 'spine', 'ring', 'cradle'];

var MAP = {
  navy: {
    stationAccent: 'navyTrim', adOrange: 'navySignage', adGreen: 'navySignage',
    stationWearPlate: 'navyArmour', stationCrateRed: 'navyArmour', stationCrateRust: 'navyArmour'
  },
  syn: {
    stationHull: 'synStationHull', stationPanel: 'synStationPanel', stationWearPlate: 'synStationPanel',
    stationAccent: 'synTrim', adOrange: 'synCorpAd', adGreen: 'synCorpAd',
    billboardGlyph: 'synSignage', stationGlass: 'synPrivacyGlass', darkPort: 'synPrivacyGlass',
    stationCrateSlate: 'synTrim', stationCrateOlive: 'synTrim'
  }
};

function readGlb(f) {
  var b = fs.readFileSync(f);
  var jl = b.readUInt32LE(12);
  return { json: JSON.parse(b.slice(20, 20 + jl).toString('utf8')), rest: b.slice(20 + jl) };
}
function writeGlb(f, json, rest) {
  var s = Buffer.from(JSON.stringify(json), 'utf8');
  var pad = (4 - (s.length % 4)) % 4;
  var js = Buffer.concat([s, Buffer.alloc(pad, 0x20)]);
  var head = Buffer.alloc(12), jh = Buffer.alloc(8);
  jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
  var total = 12 + 8 + js.length + rest.length;
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  fs.writeFileSync(f, Buffer.concat([head, jh, js, rest]));
}
function swatches(file) {
  var out = {};
  (readGlb(file).json.materials || []).forEach(function (m) { out[m.name] = m; });
  return out;
}

/* `--keep <dir>`: copy every file about to be overwritten into <dir> first,
 * so a re-skin after a new drop retires the old skins alongside the models
 * the stage script retired. */
var keepAt = process.argv.indexOf('--keep');
var KEEP = keepAt >= 0 ? path.resolve(process.argv[keepAt + 1]) : null;

/* AN AUTHORED LIVERY WINS. Every file this script writes carries
 * `extras.skinnedFrom` on its root, so a liveried file WITHOUT it was drawn
 * that way by hand (24-09 evening: navy-cylinder-station-*) and is never
 * painted over by a skin. */
function authored(file) {
  if (!fs.existsSync(file)) return false;
  var j = readGlb(file).json;
  var root = j.nodes[j.scenes[j.scene || 0].nodes[0]];
  return !(root.extras && root.extras.skinnedFrom);
}

var made = [], kept = [];
PATTERNS.forEach(function (pat) {
  ['navy', 'syn'].forEach(function (liv) {
    var tplFile = path.join(TPL, pat + '-classic-' + liv + '-m.glb');
    if (!fs.existsSync(tplFile)) { console.log('no template ' + tplFile); return; }
    var sw = swatches(tplFile);
    ['s', 'm', 'l'].forEach(function (z) {
      var src = path.join(PORTS, pat + '-' + z + '.glb');
      if (!fs.existsSync(src)) return;
      var out = path.join(PORTS, pat + '-' + liv + '-' + z + '.glb');
      if (authored(out)) { kept.push(path.basename(out)); return; }
      if (KEEP && fs.existsSync(out)) {
        fs.mkdirSync(KEEP, { recursive: true });
        var bk = path.join(KEEP, path.basename(out));
        if (!fs.existsSync(bk)) fs.copyFileSync(out, bk);
      }
      var g = readGlb(src), hits = 0;
      (g.json.materials || []).forEach(function (m) {
        var want = MAP[liv][m.name];
        var t = want && sw[want];
        if (!t) return;
        var pb = m.pbrMetallicRoughness = m.pbrMetallicRoughness || {};
        var tp = t.pbrMetallicRoughness || {};
        if (tp.baseColorFactor) pb.baseColorFactor = tp.baseColorFactor.slice();
        if (t.emissiveFactor) m.emissiveFactor = t.emissiveFactor.slice(); else delete m.emissiveFactor;
        m.name = want;
        hits++;
      });
      /* The root says whose it is, the way the templates' roots do. */
      var root = g.json.nodes[g.json.scenes[g.json.scene || 0].nodes[0]];
      root.extras = root.extras || {};
      root.extras.faction = liv === 'syn' ? 'syndicate' : 'navy';
      root.extras.skinnedFrom = pat + '-classic-' + liv;
      var dst = path.join(PORTS, pat + '-' + liv + '-' + z + '.glb');
      writeGlb(dst, g.json, g.rest);
      made.push(path.basename(dst) + ' (' + hits + ' materials)');
    });
  });
});
console.log(made.join('\n'));
if (kept.length) console.log('authored, left alone: ' + kept.join(', '));
