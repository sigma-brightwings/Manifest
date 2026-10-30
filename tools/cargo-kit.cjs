#!/usr/bin/env node
/* cargo-kit.cjs — the cargo containers, from Claude Design's sheet to data
 * the hold can draw (2026-10-30).
 *
 *     node tools/cargo-kit.cjs            reads ref/cargo/, writes src/cargokit-data.js
 *
 * Astra asked for "different models for the different cargo types" and took
 * a prompt to Claude Design, which came back with nine containers as GLBs
 * plus `cargo_specs.json`: every part as a primitive (box, cylinder,
 * frustum, disc, placard) with its size, place and material. The hold's
 * mesh is vertex-coloured and has no textures, so this reads the spec for
 * the geometry and samples each placard's texture out of its GLB onto a
 * small grid of cells in the placard's own two colours — a pictogram drawn
 * in coloured squares, which at a metre or two reads as the picture. The
 * manifest strip's text is not sampled: the hold prints the real cargo's
 * name on it (src/cargokit.js), so it is left out here.
 *
 * Needs `sharp` (a dev dependency already, for the icon). Output is plain
 * data on `global.CargoKitData`; src/cargokit.js builds the meshes. */
'use strict';

var fs = require('fs');
var path = require('path');
var sharp = require('sharp');

var ROOT = path.resolve(__dirname, '..');
var IN = path.join(ROOT, 'ref', 'cargo');
var OUT = path.join(ROOT, 'src', 'cargokit-data.js');
var GRID = 16;

function readGlb(file) {
  var b = fs.readFileSync(file);
  var jl = b.readUInt32LE(12);
  var json = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  var off = 20 + jl, bl = b.readUInt32LE(off);
  return { json: json, bin: b.slice(off + 8, off + 8 + bl) };
}

function hex(h) {
  h = h.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/* A placard texture to a GRID x GRID string of cells: 'b' its background,
 * 'f' its foreground, '.' nothing (outside a diamond or a disc). Rows top
 * first, as you look at it: the textures are stored flipped (glTF's v runs
 * down the image), so the rows are read bottom up. */
/* By COVERAGE, not by resampling: a cell is foreground if a quarter of its
 * pixels are, because the lines that make a pictogram (an arrow's shaft,
 * the placard's border) are thinner than a cell and a resize averages them
 * away. First cut resized to 16x16 and lost every border and both shafts. */
var FG_SHARE = 0.25;
async function cells(png, bg, fg) {
  var img = sharp(png).ensureAlpha();
  var meta = await img.metadata();
  var W = meta.width, H = meta.height;
  var raw = await img.raw().toBuffer();
  var B = hex(bg), F = hex(fg), rows = [];
  for (var gy = GRID - 1; gy >= 0; gy--) {
    var row = '';
    for (var gx = 0; gx < GRID; gx++) {
      var x0 = Math.floor(gx * W / GRID), x1 = Math.floor((gx + 1) * W / GRID);
      var y0 = Math.floor(gy * H / GRID), y1 = Math.floor((gy + 1) * H / GRID);
      var n = 0, nf = 0, nclear = 0;
      for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
        var i = (y * W + x) * 4;
        n++;
        if (raw[i + 3] < 128) { nclear++; continue; }
        var db = (raw[i] - B[0]) * (raw[i] - B[0]) + (raw[i + 1] - B[1]) * (raw[i + 1] - B[1]) + (raw[i + 2] - B[2]) * (raw[i + 2] - B[2]);
        var df = (raw[i] - F[0]) * (raw[i] - F[0]) + (raw[i + 1] - F[1]) * (raw[i + 1] - F[1]) + (raw[i + 2] - F[2]) * (raw[i + 2] - F[2]);
        if (df < db) nf++;
      }
      row += nclear > n / 2 ? '.' : nf >= (n - nclear) * FG_SHARE ? 'f' : 'b';
    }
    rows.push(row);
  }
  return rows;
}

function round(v) { return Math.round(v * 10000) / 10000; }

async function main() {
  var specs = JSON.parse(fs.readFileSync(path.join(IN, 'cargo_specs.json'), 'utf8'));
  var files = fs.readdirSync(IN).filter(function (f) { return /^cargo_\d\d_.*\.glb$/.test(f); });
  var out = { GRID: GRID, kinds: {}, order: [], pictos: {} };
  for (var si = 0; si < specs.length; si++) {
    var sp = specs[si];
    var file = files.filter(function (f) { return f.indexOf('_' + sp.id + '.glb') > 0; })[0];
    var glb = file ? readGlb(path.join(IN, file)) : null;
    var parts = [];
    for (var pi = 0; pi < sp.parts.length; pi++) {
      var p = sp.parts[pi];
      var q = { t: p.type, s: p.size.map(round), at: p.positions.map(function (a) { return a.map(round); }) };
      if (p.rotation && (p.rotation[0] || p.rotation[1] || p.rotation[2])) q.rot = p.rotation.map(round);
      if (p.axis) q.axis = p.axis;
      if (p.segments) q.seg = p.segments;
      if (p.texture === 'hazard') q.hazard = true;
      if (p.material) {
        var mat = sp.materials[p.material];
        q.c = (mat.emissive > 0 ? '!' : '') + mat.hex;
      }
      if (p.placard) {
        var pl = p.placard;
        q.face = pl.face || (p.type === 'disc' ? 'y+' : 'z+');
        q.bg = pl.bg; q.fg = pl.fg;
        if (pl.shape === 'manifest') { q.t = 'manifest'; q.stripe = pl.stripe; }
        else {
          q.picto = pl.picto + '_' + (p.type === 'disc' ? 'disc' : pl.shape);
          q.t = p.type === 'disc' ? 'disc' : 'placard';
          if (!out.pictos[q.picto] && glb) {
            var J = glb.json, mi = -1;
            for (var k = 0; k < J.materials.length; k++) {
              if (J.materials[k].name === 'placard_' + q.picto) { mi = k; break; }
            }
            var tex = mi >= 0 ? J.materials[mi].pbrMetallicRoughness.baseColorTexture : null;
            if (tex) {
              var img = J.images[J.textures[tex.index].source];
              var bv = J.bufferViews[img.bufferView];
              var png = glb.bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
              out.pictos[q.picto] = await cells(png, pl.bg, pl.fg);
            }
          }
        }
      }
      parts.push(q);
    }
    out.kinds[sp.id] = { name: sp.name, identity: sp.identity, parts: parts };
    out.order.push(sp.id);
  }
  var text = '/* GENERATED by tools/cargo-kit.cjs from ref/cargo/ (Claude Design, 2026-10-30).\n' +
    ' * Do not edit by hand: change the sheet and run the tool. Built into meshes\n' +
    ' * by src/cargokit.js. Pictograms are GRID x GRID cells: b background,\n' +
    ' * f foreground, . nothing; rows top first. */\n' +
    '(function (global) {\n  \'use strict\';\n  var CargoKitData = ' +
    JSON.stringify(out, null, 1).replace(/\n/g, '\n  ') + ';\n' +
    '  global.CargoKitData = CargoKitData;\n' +
    '  if (typeof module !== \'undefined\' && module.exports) module.exports = CargoKitData;\n' +
    '})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(OUT, text, 'utf8');
  console.log('wrote', path.relative(ROOT, OUT), Object.keys(out.kinds).length, 'kinds,',
              Object.keys(out.pictos).length, 'pictograms,', text.length, 'bytes');
  Object.keys(out.pictos).forEach(function (k) {
    console.log('\n' + k + '\n' + out.pictos[k].join('\n'));
  });
}

main().catch(function (e) { console.error(e); process.exit(1); });
