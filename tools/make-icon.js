/* make-icon.js — the application icon, drawn rather than sourced.
 *
 *     node tools/make-icon.js
 *
 * Writes build/icon.png (1024x1024). electron-builder derives the Windows
 * .ico and the Linux sizes from it at package time, so this one file is the
 * whole icon pipeline.
 *
 * It is drawn in code for the same reason the galaxy is: a binary blob in
 * the tree is a thing nobody can edit or diff, and this is four shapes.
 * Everything is a signed distance field antialiased with smoothstep, which
 * is both shorter than rasterising polygons and correct at every size.
 *
 * No dependencies — zlib and a CRC table are all a PNG needs.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var N = 1024;

/* ---- palette, taken from the game's own ------------------------------- */
var VOID   = [0x04, 0x06, 0x0c];
var AMBER  = [0xff, 0xe6, 0xa8];
var ICE    = [0xcf, 0xe0, 0xff];
var STEEL  = [0x7e, 0x93, 0xb3];

function smoothstep(a, b, x) {
  var t = (x - a) / (b - a);
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return t * t * (3 - 2 * t);
}

/* Paint `col` over `dst` with coverage `a`. */
function over(dst, col, a) {
  if (a <= 0) return;
  if (a > 1) a = 1;
  dst[0] += (col[0] - dst[0]) * a;
  dst[1] += (col[1] - dst[1]) * a;
  dst[2] += (col[2] - dst[2]) * a;
}

/* Distance from (x,y) to the outline of an ellipse with radii (a,b),
 * rotated by `rot`, centred at (cx,cy). The scaled-radius form divided by
 * the gradient magnitude — exact on a circle, close enough on a ring this
 * thick, and it costs one square root. */
function ellipseDist(x, y, cx, cy, a, b, rot) {
  var dx = x - cx, dy = y - cy;
  var c = Math.cos(-rot), s = Math.sin(-rot);
  var u = dx * c - dy * s, v = dx * s + dy * c;
  var k = Math.sqrt((u * u) / (a * a) + (v * v) / (b * b));
  if (k === 0) return -Math.min(a, b);
  var gx = u / (a * a), gy = v / (b * b);
  var g = Math.sqrt(gx * gx + gy * gy) / k;
  return (k - 1) / g;
}

function render() {
  var px = Buffer.alloc(N * N * 4);
  var cx = N / 2, cy = N / 2;

  /* The ring: the orbit, tilted so the icon reads as a plane seen at an
   * angle rather than as a circle. */
  var RA = N * 0.375, RB = N * 0.165, ROT = -0.42;
  var RING_W = N * 0.030;

  /* The planet, parked on the ring at an angle that keeps it clear of the
   * star behind it — at 16 px two overlapping discs are one blob. */
  var pa = 2.30;
  var prx = RA * Math.cos(pa), pry = RB * Math.sin(pa);
  var cr = Math.cos(ROT), sr = Math.sin(ROT);
  var pxc = cx + prx * cr - pry * sr;
  var pyc = cy + prx * sr + pry * cr;
  var PR = N * 0.085;

  var STAR_R = N * 0.052;

  for (var y = 0; y < N; y++) {
    for (var x = 0; x < N; x++) {
      var fx = x + 0.5, fy = y + 0.5;
      var col = [VOID[0], VOID[1], VOID[2]];

      /* The star's glow, before anything solid, so the ring passes through
       * it rather than in front of it. */
      var dStar = Math.sqrt((fx - cx) * (fx - cx) + (fy - cy) * (fy - cy));
      var glow = Math.pow(1 - smoothstep(0, N * 0.46, dStar), 2.2);
      over(col, AMBER, glow * 0.22);

      /* The ring. Dimmed on the near side so it reads as passing behind
       * the star and in front of nothing — one cue, and it is the one that
       * makes a flat ellipse look like an orbit. */
      var dRing = Math.abs(ellipseDist(fx, fy, cx, cy, RA, RB, ROT));
      var ring = smoothstep(RING_W * 0.5 + 1.2, RING_W * 0.5 - 1.2, dRing);
      if (ring > 0) {
        var near = smoothstep(cy - N * 0.10, cy + N * 0.10, fy);
        over(col, STEEL, ring * (0.35 + 0.55 * near));
      }

      /* The star. */
      over(col, AMBER, smoothstep(STAR_R + 1.2, STAR_R - 1.2, dStar));

      /* The planet, with a terminator: lit on the side facing the star. */
      var pdx = fx - pxc, pdy = fy - pyc;
      var dP = Math.sqrt(pdx * pdx + pdy * pdy);
      var disc = smoothstep(PR + 1.2, PR - 1.2, dP);
      if (disc > 0) {
        /* Shade off the sphere's real normal, not off the flat radial
         * direction. The radial version pinches to a crease at the centre
         * of the disc, because every pixel there points a different way at
         * zero distance; lifting the normal into z makes the terminator the
         * smooth curve a lit ball actually has. */
        var nx = pdx / PR, ny = pdy / PR;
        var nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        var lx = cx - pxc, ly = cy - pyc, lz = PR * 0.45;
        var ln = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
        var lit = nx * (lx / ln) + ny * (ly / ln) + nz * (lz / ln);
        var shade = 0.18 + 0.82 * smoothstep(-0.35, 0.85, lit);
        var body = [ICE[0] * shade, ICE[1] * shade, ICE[2] * shade];
        /* Never let the dark limb fall to the background colour, or the
         * planet loses its silhouette against the void. */
        over(col, [Math.max(body[0], 22), Math.max(body[1], 28), Math.max(body[2], 44)], disc);
      }

      var i = (y * N + x) * 4;
      px[i] = Math.round(Math.max(0, Math.min(255, col[0])));
      px[i + 1] = Math.round(Math.max(0, Math.min(255, col[1])));
      px[i + 2] = Math.round(Math.max(0, Math.min(255, col[2])));
      px[i + 3] = 255;
    }
  }
  return px;
}

/* ---- the smallest PNG writer that is still a correct one -------------- */

var CRC_TABLE = (function () {
  var t = new Int32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  var c = -1;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  var len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  var body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  /* One filter byte per scanline. Filter 0 (none) throughout: the image is
   * smooth gradients, deflate handles it, and picking filters per row would
   * be optimising a file that is written once. */
  var raw = Buffer.alloc(height * (1 + width * 4));
  for (var y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

var outDir = path.resolve(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
var out = path.join(outDir, 'icon.png');
fs.writeFileSync(out, png(N, N, render()));
console.log('wrote ' + out + '  (' + N + 'x' + N + ')');
