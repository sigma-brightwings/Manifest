/* portrait.js — the face under the helmet, as a composite sketch (2026-10-25).
 *
 * Astra: "Helmets remain on, but during chat, a portrait drawn in a 2D style
 * and built a little bit like an FBI sketch." Everybody on a deck is sealed
 * in a pressure suit (npcmodel.js); when you talk to someone, the
 * conversation panel shows who is inside it.
 *
 * BUILT LIKE A COMPOSITE. A police composite is assembled from a kit of
 * features — face shape, brow, eyes, nose, mouth, hairline, marks — each
 * picked from a catalogue and set at a measured spacing, then drawn over in
 * graphite. This does the same: every feature is a choice from a small
 * catalogue plus a few proportions, all drawn from one seed per person, and
 * the whole is rendered in pencil on paper — outline strokes laid twice and
 * slightly off, hatching for tone, a soft smudge in the sockets and under
 * the cheekbones, the shadow side of the face cross-hatched.
 *
 * THE SAME PERSON AS THE BODY. Skin tone, hair colour, hairstyle and stubble
 * come from NpcModel.lookOf — the very draws the 3D body's painted face was
 * made from — so the portrait and the person under the visor agree. Tone is
 * graphite density, not colour: a sketch has no colour to give.
 *
 * Pure: one person, one picture, cached by id. No colour, no randomness
 * outside its own seeded stream.
 */
(function (global) {
  'use strict';

  var W = 200, H = 250;
  var CACHE = {};

  function hash(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lum(hex) {
    var n = parseInt(String(hex || '#808080').slice(1, 7), 16);
    return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---- KIT THEY WEAR: the randomiser (2026-10-26) --------------------------
   * Astra: "colorize them somewhat and then give a script to randomize things
   * like eyepieces, rebreathers, etc". GEAR is that script: for each kind of
   * person, the chance of each piece. Every roll comes from the person's own
   * 'gear|' stream, so adding a piece here never changes anybody's face, and
   * the same person always wears the same kit. Pieces that cannot be worn
   * together say so in CLASH; a side ('L'/'R') is drawn for one-eyed things.
   * Tune by editing the numbers — 0 never, 1 always. */
  var GEAR_PIECES = ['eyepiece', 'cybereye', 'eyepatch', 'rebreather', 'goggles', 'glasses', 'shades',
                     'earpiece', 'headset', 'piercings', 'tattoo', 'facepaint'];
  var GEAR = {
    _default:   { glasses: 0.12, earpiece: 0.2, piercings: 0.15, tattoo: 0.1, eyepiece: 0.06, goggles: 0.06 },
    pilot:      { headset: 0.35, earpiece: 0.35, goggles: 0.2, eyepiece: 0.1, glasses: 0.1 },
    engineer:   { goggles: 0.45, rebreather: 0.22, earpiece: 0.2, eyepiece: 0.12, tattoo: 0.1 },
    gunner:     { eyepiece: 0.5, headset: 0.4, cybereye: 0.08, tattoo: 0.12 },
    security:   { earpiece: 0.6, shades: 0.15, glasses: 0.08 },
    tactical:   { earpiece: 0.55, eyepiece: 0.3, facepaint: 0.15 },
    medic:      { glasses: 0.3, eyepiece: 0.18, earpiece: 0.2, rebreather: 0.1 },
    loadmaster: { goggles: 0.5, rebreather: 0.3, earpiece: 0.2, tattoo: 0.15 },
    raider:     { rebreather: 0.35, cybereye: 0.3, eyepatch: 0.2, piercings: 0.55, tattoo: 0.55, facepaint: 0.3, goggles: 0.15 },
    captain:    { cybereye: 0.5, eyepatch: 0.2, piercings: 0.35, tattoo: 0.4, rebreather: 0.12 },
    enforcer:   { earpiece: 0.7, shades: 0.3, tattoo: 0.15 },
    heavy:      { rebreather: 0.4, earpiece: 0.5, cybereye: 0.12, tattoo: 0.25 },
    fixer:      { glasses: 0.25, shades: 0.2, earpiece: 0.45, piercings: 0.3, tattoo: 0.1 },
    marine:     { earpiece: 0.7, eyepiece: 0.2, facepaint: 0.1 },
    officer:    { earpiece: 0.5, glasses: 0.2, eyepiece: 0.1 },
    bartender:  { piercings: 0.4, tattoo: 0.35, glasses: 0.15, earpiece: 0.1 },
    clerk:      { glasses: 0.35, earpiece: 0.35, eyepiece: 0.1 },
    steward:    { glasses: 0.25, earpiece: 0.4 }
  };
  /* Two on one face that cannot both be there. */
  var CLASH = {
    cybereye: ['eyepatch@same', 'eyepiece@same'], eyepatch: ['eyepiece@same', 'glasses', 'shades', 'goggles'],
    glasses: ['shades', 'goggles'], shades: ['goggles'], rebreather: ['headset'], headset: ['earpiece']
  };
  function rollGear(person, kind) {
    var id = (person && (person.id || person.name)) || 'nobody';
    var r = rng(hash('gear|' + id));
    var table = GEAR[kind] || GEAR._default, out = {};
    GEAR_PIECES.forEach(function (k) {
      var u = r(), side = r() < 0.5 ? 'L' : 'R', tint = r();   // always three draws a piece, so the stream never shifts
      if (!(u < (table[k] || 0))) return;
      var clash = (CLASH[k] || []).some(function (c) {
        var parts = c.split('@'), other = out[parts[0]];
        return other && (!parts[1] || other.side === side);
      });
      Object.keys(CLASH).forEach(function (o) {
        if (out[o] && (CLASH[o] || []).some(function (c) { var p = c.split('@'); return p[0] === k && (!p[1] || out[o].side === side); })) clash = true;
      });
      if (!clash) out[k] = { side: side, tint: tint };
    });
    return out;
  }

  /* ---- HAIRCUTS (2026-10-26) ------------------------------------------------
   * Astra: "the hairstyles appear identical across all the faces." The body
   * has six styles and the helmet hides them all, so the sketch draws a cut
   * of its own from the body's family: a body with 'short' hair might be a
   * crop, a fringe, a quiff, curls or an afro; 'long' might be loose, waved,
   * a ponytail, a bun, a bob, braids or locs. Rolled in its own stream
   * ('cut|'), so nothing else about a face moves.
   *   tex    how the hair is drawn: strand, curl, coil, rope, rows, fleck,
   *          bald, hawk
   *   vol    how far it stands off the skull
   *   line   the hairline: part, fringe, back (swept back), peak (widow's
   *          peak), round
   *   back   what hangs behind the head: long, bob, pony, bun, knot,
   *          braids, locs, afro
   *   under  sides shaved below the temple; over  covers the tops of the ears */
  var CUTS = {
    crop:      { tex: 'strand', vol: 6,  line: 'part' },
    sidepart:  { tex: 'strand', vol: 8,  line: 'part', sweep: 0.92 },
    fringe:    { tex: 'strand', vol: 9,  line: 'fringe' },
    quiff:     { tex: 'strand', vol: 16, line: 'back', lean: 0.35, short: true },
    curly:     { tex: 'curl',   vol: 15, line: 'part', over: true },
    afro:      { tex: 'coil',   vol: 22, line: 'round', back: 'afro', over: true },
    undercut:  { tex: 'strand', vol: 12, line: 'back', under: true },
    topknot:   { tex: 'strand', vol: 4,  line: 'back', under: true, back: 'knot' },
    peak:      { tex: 'strand', vol: 6,  line: 'peak' },
    long:      { tex: 'strand', vol: 9,  line: 'part', back: 'long' },
    waves:     { tex: 'curl',   vol: 13, line: 'part', back: 'long', over: true },
    pony:      { tex: 'strand', vol: 5,  line: 'back', back: 'pony' },
    bun:       { tex: 'strand', vol: 5,  line: 'part', back: 'bun' },
    bob:       { tex: 'strand', vol: 10, line: 'fringe', back: 'bob', over: true },
    braids:    { tex: 'rows',   vol: 3,  line: 'back', back: 'braids' },
    locs:      { tex: 'rope',   vol: 10, line: 'part', back: 'locs', over: true },
    slick:     { tex: 'strand', vol: 4,  line: 'back' },
    slickpart: { tex: 'strand', vol: 5,  line: 'part', sweep: 0.95 },
    buzz:      { tex: 'fleck' },
    fade:      { tex: 'fleck', fade: true },
    cornrows:  { tex: 'rows',   vol: 2,  line: 'back' },
    bald:      { tex: 'bald' },
    horseshoe: { tex: 'bald', ring: true },
    mohawk:    { tex: 'hawk', vol: 18 },
    spikes:    { tex: 'hawk', vol: 26, spikes: true },
    lowhawk:   { tex: 'hawk', vol: 9, curl: true }
  };
  /* ANY FACE, ANY CUT (2026-10-26). Astra: "we aren't modelling hair on the
   * 3D models for the NPCs anyways" -- the helmet is always on, so the
   * portrait owes the body's six styles nothing. Every face draws from the
   * whole list by CUT_ODDS (weights); a role may lean a few cuts heavier in
   * CUT_LEAN (raiders to hawks, the services to short cuts). Age thins the
   * crown: past 54, a fifth of the time, the cut is bald or a horseshoe. */
  var CUT_ODDS = {
    crop: 3, sidepart: 2, fringe: 2, quiff: 1.5, curly: 2, afro: 1.5, undercut: 2, topknot: 1, peak: 1,
    long: 2, waves: 1.5, pony: 2, bun: 1.5, bob: 1.5, braids: 1, locs: 1,
    slick: 1.5, slickpart: 1, buzz: 3, fade: 2, cornrows: 1, bald: 1, horseshoe: 0.4,
    mohawk: 0.4, spikes: 0.3, lowhawk: 0.3
  };
  var CUT_LEAN = {
    raider: { mohawk: 20, spikes: 15, lowhawk: 12, locs: 3, braids: 2 },
    marine: { buzz: 6, fade: 5, crop: 3 }, tactical: { buzz: 5, fade: 4, crop: 3 },
    officer: { sidepart: 6, crop: 4, slickpart: 3, bun: 3 }, security: { buzz: 3, fade: 3, crop: 2 },
    enforcer: { buzz: 5, slick: 3, bald: 2 }, heavy: { buzz: 5, bald: 2, fade: 2 },
    fixer: { slick: 6, slickpart: 4, undercut: 3 }, captain: { long: 4, locs: 3, horseshoe: 2, spikes: 2 }
  };
  function rollCut(role, id, age) {
    var r = rng(hash('cut|' + id)), lean = CUT_LEAN[role] || {};
    var names = Object.keys(CUTS), tot = 0, w = names.map(function (k) { var v = (CUT_ODDS[k] || 0) * (lean[k] || 1); tot += v; return v; });
    var u = r() * tot, c = names[names.length - 1];
    for (var i = 0; i < names.length; i++) { u -= w[i]; if (u < 0) { c = names[i]; break; } }
    if (age > 54 && r() < 0.2) c = r() < 0.5 ? 'bald' : 'horseshoe';
    return c;
  }

  /* A person's kit, by the role they are (or the body they wear). The same
   * roll features() makes; npc.js hands it to NpcModel.build so what shows
   * through a helmet is on the body too. */
  function gearOf(person) {
    var kind = (person && (GEAR[person.role] ? person.role : GEAR[person.body] ? person.body : null)) || '_default';
    return rollGear(person, kind);
  }

  /* ---- the kit: what this face is made of ---------------------------------- */
  function features(person) {
    var id = (person && (person.id || person.name)) || 'nobody';
    var name = (person && person.name) || 'Nobody';
    var body = (person && (person.body || person.role)) || 'pilot';
    var r = rng(hash('portrait|' + id + '|' + name));
    var NM = global.NpcModel;
    var look = NM && NM.lookOf ? NM.lookOf(body, name) : { skin: '#C9A27E', hair: '#3b2a1e', style: 'short', facial: null };
    /* The roles whose body forces a hairstyle (npcmodel.js R[].build). */
    if (body === 'captain') look = { skin: look.skin, hair: look.hair, style: look.style, facial: 'beard' };
    var f = {
      tone: 1 - lum(look.skin),                    // 0 pale .. ~0.8 dark
      hairTone: 1 - lum(look.hair),
      style: look.style, stubble: look.facial === 'stubble',
      age: Math.round(22 + r() * 40),
      faceW: lerp(0.29, 0.37, r()), faceH: lerp(0.40, 0.47, r()),
      jaw: r(), chin: r(), cheek: r(),
      eyeY: lerp(0.45, 0.49, r()), eyeGap: lerp(0.19, 0.25, r()), eyeSize: lerp(0.055, 0.075, r()),
      eyeShape: ['almond', 'round', 'hooded', 'narrow'][Math.floor(r() * 4)], tilt: lerp(-0.12, 0.12, r()),
      brow: lerp(1.6, 4.2, r()), browArch: r(), browAngle: lerp(-0.12, 0.15, r()),
      noseLen: lerp(0.13, 0.19, r()), noseW: lerp(0.07, 0.11, r()), noseBump: r() < 0.25,
      mouthW: lerp(0.14, 0.21, r()), lips: lerp(0.4, 1.4, r()), smile: lerp(-0.4, 0.5, r()),
      ears: lerp(0.8, 1.2, r()), beard: look.facial === 'beard' || (look.facial !== 'stubble' && r() < 0.14),
      scar: r() < 0.14, scarSide: r() < 0.5 ? -1 : 1, mole: r() < 0.2, moleAt: [lerp(-0.6, 0.6, r()), lerp(0.4, 0.75, r())],
      part: r() < 0.5 ? -1 : 1, hairline: lerp(0.0, 0.08, r()), seed: hash('strokes|' + id)
    };
    if (f.age > 48) f.hairline += 0.04;
    f.cut = rollCut((person && person.role) || body, id, f.age);
    /* A WOMAN'S FACE, when the body under the suit is a woman's (people.js
     * decides, so the sketch and the figure agree; 2026-10-26). The same
     * draws, eased: a lighter jaw and chin, finer brows, fuller lips, no
     * beard or stubble, no receding horseshoe. Her skin tone comes from the
     * same seven tones at the same odds as anyone's. */
    var PPL = global.People;
    f.sex = PPL && PPL.sexOf ? PPL.sexOf(body, name, (person && person.liv) || 'civ') : null;
    if (f.sex === 'f') {
      f.beard = false; f.stubble = false;
      f.jaw *= 0.55; f.chin *= 0.6; f.faceW = lerp(0.29, f.faceW, 0.75);
      f.brow = lerp(1.4, 2.6, (f.brow - 1.6) / 2.6); f.browArch = 0.35 + f.browArch * 0.65;
      f.lips = Math.min(1.6, f.lips + 0.35);
      if (f.cut === 'horseshoe') f.cut = 'buzz';
      if (f.age > 48) f.hairline -= 0.04;
    }
    /* COLOUR, from the same body: skin and hair as painted, eyes drawn from
     * a list weighted by how dark the skin is, and the suit's livery. */
    f.skinHex = look.skin; f.hairHex = look.hair;
    var er = rng(hash('eyes|' + id))();
    f.eyeHex = f.tone > 0.45 ? (er < 0.8 ? '#4a2e1c' : er < 0.95 ? '#6b4a2a' : '#5a6a4a')
             : (er < 0.35 ? '#5a3a22' : er < 0.55 ? '#7a6a3a' : er < 0.75 ? '#4a6a5a' : er < 0.92 ? '#4a6a8a' : '#6a7078');
    f.liv = (person && person.liv) || 'civ';
    f.body = body;
    f.suit = NM && NM.suitOf ? NM.suitOf(body, name, f.liv) : null;
    f.gear = gearOf(person);
    return f;
  }

  function shadeHex(hex, k) {
    var n = parseInt(String(hex || '#808080').slice(1), 16), ch = [n >> 16, n >> 8 & 255, n & 255].map(function (v) { return Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1)))); });
    return '#' + ch.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }

  /* ---- graphite ---------------------------------------------------------------- */
  function Pencil(ctx, seed) {
    var r = rng(seed);
    function j(a) { return (r() - 0.5) * 2 * a; }
    return {
      r: r,
      /* A line laid twice and a hair apart, as a hand draws it. */
      line: function (pts, w, a, wob) {
        wob = wob == null ? 0.8 : wob;
        for (var pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          for (var i = 0; i < pts.length; i++) {
            var x = pts[i][0] + j(wob), y = pts[i][1] + j(wob);
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.lineWidth = w * (pass ? 0.6 : 1);
          ctx.strokeStyle = 'rgba(38,36,34,' + (a * (pass ? 0.55 : 1)) + ')';
          ctx.stroke();
        }
      },
      curve: function (pts, w, a) {
        /* Catmull-Rom through the points, sampled. */
        var out = [];
        for (var i = 0; i < pts.length - 1; i++) {
          var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
          for (var t = 0; t < 1; t += 0.125) {
            var t2 = t * t, t3 = t2 * t;
            out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                      0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
          }
        }
        out.push(pts[pts.length - 1]);
        this.line(out, w, a, 0.5);
        return out;
      },
      /* Parallel strokes across a clip path, at an angle. */
      hatch: function (clip, angle, gap, a, w) {
        ctx.save();
        ctx.beginPath(); clip(); ctx.clip();
        var c = Math.cos(angle), s = Math.sin(angle), L = W + H;
        for (var d = -L; d < L; d += gap) {
          var ox = W / 2 + -s * d, oy = H / 2 + c * d;
          ctx.beginPath();
          ctx.moveTo(ox - c * L + j(1), oy - s * L + j(1));
          ctx.lineTo(ox + c * L + j(1), oy + s * L + j(1));
          ctx.lineWidth = w || 0.6;
          ctx.strokeStyle = 'rgba(40,38,36,' + (a * (0.7 + r() * 0.6)) + ')';
          ctx.stroke();
        }
        ctx.restore();
      },
      smudge: function (x, y, rx, ry, a) {
        ctx.save();
        ctx.translate(x, y); ctx.scale(1, ry / rx);
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, 'rgba(50,48,46,' + a + ')'); g.addColorStop(1, 'rgba(50,48,46,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      },
      flecks: function (cx, cy, rx, ry, n, a) {
        for (var i = 0; i < n; i++) {
          var t = r() * Math.PI * 2, k = Math.sqrt(r());
          ctx.fillStyle = 'rgba(40,38,36,' + a * (0.5 + r()) + ')';
          ctx.fillRect(cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k, 1, 1);
        }
      }
    };
  }

  /* ---- the drawing ----------------------------------------------------------
   * Head and shoulders, tight, as a composite sits on its sheet: the skull
   * near the top edge, the collar of the suit at the bottom. Proportions are
   * the draughtsman's: eyes halfway down the head, the nose a third of the
   * way from brow to chin past the eyes, the mouth a third of the way from
   * nose to chin, ears from brow to nose. */
  function bez(p0, p1, p2, p3, n, out) {
    for (var i = (out.length ? 1 : 0); i <= n; i++) {
      var t = i / n, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
    return out;
  }
  function polyPath(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function draw(ctx, f) {
    var P = Pencil(ctx, f.seed);
    var cx = W / 2;
    var hw = W * lerp(0.215, 0.3, (f.faceW - 0.29) / 0.08);       // half the width at the cheekbones
    var top = lerp(30, 40, f.cheek), chinY = lerp(176, 190, (f.faceH - 0.40) / 0.07);
    var eyeY = lerp(top, chinY, lerp(0.47, 0.5, (f.eyeY - 0.45) / 0.04));
    var browY = eyeY - lerp(11, 15, f.browArch);
    var noseY = lerp(eyeY, chinY, lerp(0.38, 0.48, (f.noseLen - 0.13) / 0.06));
    var mouthY = lerp(noseY, chinY, 0.36);
    var templeY = lerp(top, eyeY, 0.62), cheekY = eyeY + 12, jawY = chinY - lerp(22, 32, f.jaw);
    var jawHW = hw * lerp(0.6, 0.97, f.jaw), chinHW = hw * lerp(0.16, 0.46, f.chin);

    /* The face and skull, one closed outline, right half then mirrored. */
    var R = [];
    bez([cx, top], [cx + hw * 0.62, top], [cx + hw * 1.0, top + (templeY - top) * 0.35], [cx + hw * 0.98, templeY], 8, R);
    bez(R[R.length - 1], [cx + hw * 1.0, templeY + 8], [cx + hw * 1.02, cheekY - 6], [cx + hw * 0.99, cheekY], 4, R);
    bez(R[R.length - 1], [cx + hw * 0.97, cheekY + 12], [cx + jawHW * 1.02, jawY - 12], [cx + jawHW, jawY], 5, R);
    bez(R[R.length - 1], [cx + jawHW * 0.92, jawY + 14], [cx + chinHW * 1.35, chinY], [cx, chinY + 1], 6, R);
    var face = R.concat(R.slice(0, -1).reverse().map(function (q) { return [2 * cx - q[0], q[1]]; }));
    function facePath() { polyPath(ctx, face); }

    /* Paper, with tooth. */
    ctx.fillStyle = '#eeebe3'; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < 2600; i++) {
      ctx.fillStyle = P.r() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(120,112,100,.08)';
      ctx.fillRect(P.r() * W, P.r() * H, 1, 1);
    }

    /* The sitter, a little smaller on the sheet, so the suit's shoulders
     * get a band of their own: everything below draws in these units, and
     * HB is the bottom of the sheet in them. */
    var SC = 0.72;
    ctx.save(); ctx.translate(cx * (1 - SC), 6); ctx.scale(SC, SC);
    var HB = (H - 6) / SC;
    var hd = 0.3 + f.hairTone * 0.55;

    var cut = CUTS[f.cut] || CUTS.crop, hairBase = 'rgba(48,45,42,' + (0.12 + hd * 0.42) + ')';
    var backPath = null;
    /* Hair texture inside whatever path is clipped: strokes, curls, coils,
     * rope (locs), rows (braids and cornrows). */
    function texture(kind, x0, y0, x1, y1, n, a, dir) {
      var i, x, y;
      if (kind === 'curl' || kind === 'coil') {
        var big = kind === 'curl';
        for (i = 0; i < n; i++) {
          x = lerp(x0, x1, P.r()); y = lerp(y0, y1, P.r());
          ctx.beginPath(); var a0 = P.r() * 6.28;
          ctx.arc(x, y, big ? 2.5 + P.r() * 3 : 1.2 + P.r() * 1.6, a0, a0 + (big ? 3.6 : 5.6));
          ctx.lineWidth = big ? 0.8 : 0.6; ctx.strokeStyle = 'rgba(38,36,34,' + a * (0.6 + P.r() * 0.6) + ')'; ctx.stroke();
        }
      } else if (kind === 'rope') {
        for (x = x0 + 3; x < x1; x += 6.5) {
          var pts = [];
          for (y = y0; y <= y1; y += 4) pts.push([x + Math.sin(y * 0.3 + x) * 1.2, y]);
          P.line(pts, 1.4, a, 0.3);
          for (y = y0 + 2; y < y1; y += 5) P.line([[x - 2.2, y], [x + 2.2, y + 2]], 0.6, a * 0.7, 0.2);
        }
      } else {                                   // strand: long strokes running along dir
        for (i = 0; i < n; i++) {
          x = lerp(x0, x1, P.r()); y = lerp(y0, y1, P.r());
          var L = 10 + P.r() * 22, d = dir + (P.r() - 0.5) * 0.25;
          P.line(bez([x, y], [x + Math.cos(d) * L * 0.33 + 1.5, y + Math.sin(d) * L * 0.33],
                     [x + Math.cos(d) * L * 0.66 + 1.5, y + Math.sin(d) * L * 0.66], [x + Math.cos(d) * L, y + Math.sin(d) * L], 4, []), 0.7, a, 0.3);
        }
      }
    }
    /* A lock of hair: a few strokes side by side along one curve, each
     * starting and stopping at its own place, as a pencil lays a clump. */
    function clump(path, k, a) {
      for (var i = 0; i < k; i++) {
        var off = (i - (k - 1) / 2) * 1.3, i0 = Math.floor(P.r() * 3), i1 = path.length - Math.floor(P.r() * 4);
        var pts = [];
        for (var j2 = Math.max(1, i0); j2 < i1; j2++) {
          var a0 = path[j2 - 1], b0 = path[j2], dx = b0[0] - a0[0], dy = b0[1] - a0[1], dl = Math.hypot(dx, dy) || 1;
          pts.push([b0[0] - dy / dl * off, b0[1] + dx / dl * off]);
        }
        if (pts.length > 1) P.line(pts, 0.65, a * (0.6 + P.r() * 0.5), 0.25);
      }
    }
    function hairFill(path, tex, a, x0, y0, x1, y1, n, dir) {
      ctx.save(); ctx.beginPath(); path(); ctx.fillStyle = '#eeebe3'; ctx.fill(); ctx.fillStyle = hairBase; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); path(); ctx.clip();
      texture(tex, x0, y0, x1, y1, n, a, dir);
      ctx.restore();
      ctx.save(); ctx.beginPath(); path(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(38,36,34,.7)'; ctx.stroke(); ctx.restore();
    }
    var backTex = cut.tex === 'curl' || cut.tex === 'coil' ? cut.tex : cut.back === 'locs' ? 'rope' : 'strand';

    /* What hangs behind the head, drawn first so the face and neck sit over it. */
    if (cut.back === 'long' || cut.back === 'locs' || cut.back === 'bob') {
      var foot = cut.back === 'bob' ? jawY + 4 : chinY + 30, wide = cut.back === 'bob' ? 1.24 : 1.2;
      var LH = [];
      bez([cx - hw * 1.12, templeY - 10], [cx - hw * (wide + 0.08), cheekY + 20], [cx - hw * wide, foot - 20], [cx - hw * 1.1, foot], 8, LH);
      LH.push([cx + hw * 1.1, foot]);
      var LR = []; bez([cx + hw * 1.1, foot], [cx + hw * wide, foot - 20], [cx + hw * (wide + 0.08), cheekY + 20], [cx + hw * 1.12, templeY - 10], 8, LR);
      var long = LH.concat(LR);
      backPath = function () { polyPath(ctx, long); };
      hairFill(backPath, backTex, hd * 0.7, cx - hw * 1.4, templeY - 12, cx + hw * 1.4, foot, backTex === 'strand' ? 160 : 260, Math.PI / 2);
    } else if (cut.back === 'afro') {
      var acy = (top + cheekY) / 2 - 4, arx = hw * 1.5, ary = (cheekY - top) / 2 + 24;
      backPath = function () { ctx.ellipse(cx, acy, arx, ary, 0, 0, Math.PI * 2); };
      hairFill(backPath, 'coil', hd * 0.75, cx - arx, acy - ary, cx + arx, acy + ary, 1500);
    } else if (cut.back === 'bun' || cut.back === 'knot') {
      var br = cut.back === 'bun' ? 17 : 11, by = top - (cut.vol || 0) - br * 0.55;
      backPath = function () { ctx.arc(cx, by, br, 0, Math.PI * 2); };
      hairFill(backPath, 'strand', hd * 0.6, cx - br, by - br, cx + br, by + br, 50, -0.3);
    } else if (cut.back === 'pony') {
      var ps = -f.part, tail = [];
      bez([cx + ps * hw * 0.92, templeY + 4], [cx + ps * hw * 1.45, cheekY], [cx + ps * hw * 1.35, chinY + 10], [cx + ps * hw * 1.18, chinY + 44], 10, tail);
      bez(tail[tail.length - 1], [cx + ps * hw * 1.12, chinY + 10], [cx + ps * hw * 1.12, cheekY], [cx + ps * hw * 0.95, templeY + 18], 10, tail);
      backPath = function () { polyPath(ctx, tail); };
      hairFill(backPath, 'strand', hd * 0.7, cx + ps * hw * 0.9 - 20, templeY, cx + ps * hw * 1.45 + 20, chinY + 44, 90, Math.PI / 2);
    } else if (cut.back === 'braids') {
      [-1, 1].forEach(function (sd) {
        for (var k = 0; k < 9; k++) {
          var by2 = cheekY - 6 + k * 9, bx = cx + sd * hw * (1.05 + k * 0.004);
          ctx.save(); ctx.beginPath(); ctx.ellipse(bx + (k % 2 ? 1.5 : -1.5), by2, 5.5, 6, (k % 2 ? 0.5 : -0.5), 0, Math.PI * 2);
          ctx.fillStyle = '#eeebe3'; ctx.fill(); ctx.fillStyle = hairBase; ctx.fill();
          ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(38,36,34,.75)'; ctx.stroke(); ctx.restore();
        }
      });
      backPath = function () { ctx.rect(cx - hw * 1.05 - 7, cheekY - 12, 14, 80); ctx.rect(cx + hw * 1.05 - 7, cheekY - 12, 14, 80); };
    }

    /* Neck, and the pressure suit's seal ring and shoulders. The sheet is
     * drawn a little smaller than it used to be (S, above) so the suit has
     * room: in person the suit is all anyone sees, so it is drawn as that
     * role's suit (drawSuit, with the colour). */
    var nw = jawHW * 0.72, ringY = chinY + 26;
    ctx.save(); ctx.beginPath(); ctx.rect(cx - nw, jawY, nw * 2, ringY - jawY); ctx.fillStyle = '#efece5'; ctx.fill(); ctx.restore();
    P.hatch(function () { ctx.rect(cx - nw, jawY, nw * 2, ringY - jawY); }, 0.9, lerp(5, 2.4, f.tone), 0.08 + f.tone * 0.25);
    P.hatch(function () { ctx.rect(cx - nw, chinY - 2, nw * 2, 12); }, 2.3, 2.4, 0.3);
    P.line([[cx - nw, jawY + 6], [cx - nw * 1.04, ringY]], 1.1, 0.75);
    P.line([[cx + nw, jawY + 6], [cx + nw * 1.04, ringY]], 1.1, 0.75);
    var rw = nw * 1.75, shY = ringY + 30, SW = Math.min(rw * 2.5, 128);
    function torsoPath() {
      ctx.moveTo(cx - SW - 6, HB + 4); ctx.lineTo(cx - SW - 2, shY + 30);
      ctx.quadraticCurveTo(cx - SW, shY, cx - SW * 0.8, shY - 9);
      ctx.quadraticCurveTo(cx - rw * 1.3, ringY + 14, cx - rw * 0.95, ringY + 10);
      ctx.lineTo(cx + rw * 0.95, ringY + 10);
      ctx.quadraticCurveTo(cx + rw * 1.3, ringY + 14, cx + SW * 0.8, shY - 9);
      ctx.quadraticCurveTo(cx + SW, shY, cx + SW + 2, shY + 30); ctx.lineTo(cx + SW + 6, HB + 4); ctx.closePath();
    }
    ctx.save(); ctx.beginPath(); torsoPath(); ctx.fillStyle = '#eeebe3'; ctx.fill(); ctx.restore();
    P.hatch(torsoPath, 0.6, 4, 0.12);
    P.hatch(function () { ctx.rect(cx + SW * 0.35, ringY, SW, HB); }, 2.2, 3.4, 0.1);     // shadow side
    [-1, 1].forEach(function (sd) {
      P.line(bez([cx + sd * (SW + 6), HB + 2], [cx + sd * (SW + 1), shY + 24], [cx + sd * SW * 1.0, shY + 2], [cx + sd * SW * 0.8, shY - 9], 8, []), 1.3, 0.75);
      P.line(bez([cx + sd * SW * 0.8, shY - 9], [cx + sd * rw * 1.6, ringY + 18], [cx + sd * rw * 1.2, ringY + 12], [cx + sd * rw * 0.95, ringY + 10], 8, []), 1.3, 0.75);
      P.line(bez([cx + sd * SW * 0.8, shY - 9], [cx + sd * SW * 0.78, shY + 30], [cx + sd * SW * 0.8, HB - 30], [cx + sd * SW * 0.84, HB + 2], 8, []), 0.8, 0.45);   // sleeve seam
    });
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, ringY + 8, rw, 9, 0, 0, Math.PI * 2); ctx.fillStyle = '#e4e0d7'; ctx.fill(); ctx.restore();
    P.hatch(function () { ctx.ellipse(cx, ringY + 8, rw, 9, 0, 0, Math.PI * 2); }, -0.4, 2.4, 0.3);
    P.line(bez([cx - rw, ringY + 8], [cx - rw, ringY - 3], [cx + rw, ringY - 3], [cx + rw, ringY + 8], 10, []), 1.4, 0.8);
    P.line(bez([cx - rw, ringY + 8], [cx - rw, ringY + 19], [cx + rw, ringY + 19], [cx + rw, ringY + 8], 10, []), 1.4, 0.8);

    /* Ears. */
    var ear0 = browY + 4, ear1 = noseY + 2, eh = (ear1 - ear0) * f.ears;
    [-1, 1].forEach(function (sd) {
      var ex = cx + sd * hw * 0.97, ey0 = (ear0 + ear1) / 2 - eh / 2, ey1 = ey0 + eh;
      var ear = bez([ex, ey0 + 2], [ex + sd * 12, ey0 - 4], [ex + sd * 12, ey1 - 6], [ex + sd * 2, ey1], 8, []);
      ctx.save(); ctx.beginPath(); polyPath(ctx, ear); ctx.fillStyle = '#efece5'; ctx.fill(); ctx.restore();
      P.hatch(function () { polyPath(ctx, ear); }, 0.9, 2.6, 0.12 + f.tone * 0.25);
      P.line(ear, 1, 0.7);
      P.line(bez([ex + sd * 3, ey0 + 6], [ex + sd * 8, ey0 + 4], [ex + sd * 8, ey1 - 10], [ex + sd * 3, ey1 - 6], 6, []), 0.7, 0.45);
    });

    /* Skin: an even tone deepening with darker skin, the shadow side
     * cross-hatched, graphite under the cheekbones and in the sockets —
     * all inside the face. */
    ctx.save(); ctx.beginPath(); facePath(); ctx.fillStyle = '#efece5'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); facePath(); ctx.clip();
    if (f.tone > 0.08) P.hatch(facePath, 0.9, lerp(5, 2.2, f.tone), 0.08 + f.tone * 0.3);
    P.hatch(function () {
      ctx.moveTo(cx + hw * 0.55, top); ctx.quadraticCurveTo(cx + hw * 0.62, cheekY, cx + chinHW, chinY + 2);
      ctx.lineTo(cx + hw * 1.3, chinY + 2); ctx.lineTo(cx + hw * 1.3, top); ctx.closePath();
    }, 2.3, 3, 0.14 + f.tone * 0.12);
    P.smudge(cx + hw * 0.72, cheekY + 16, hw * 0.24, 14, 0.12);
    P.smudge(cx - hw * 0.74, cheekY + 16, hw * 0.2, 12, 0.06);
    P.smudge(cx, chinY - 6, chinHW * 1.3, 6, 0.12);
    ctx.restore();
    /* The outline from the temples down: over the skull, the hair's own
     * edge is the line (drawn with the hair). */
    var sides = cut.tex === 'bald' || cut.tex === 'fleck' || cut.tex === 'hawk' || !!cut.under;
    var half = Math.floor(face.length / 2), from = sides ? 0 : 8;
    P.line(face.slice(from, half + 1), 1.4, 0.85, 0.4);
    P.line(face.slice(half, face.length - from), 1.4, 0.85, 0.4);

    /* Eyes. */
    var gap = W * f.eyeGap * 0.5, es = W * f.eyeSize * 0.95;
    [-1, 1].forEach(function (sd) {
      var ex = cx + sd * gap, t = f.tilt * sd;
      P.smudge(ex + sd * 2, eyeY - es * 0.35, es * 1.3, es * 0.7, 0.24 + f.tone * 0.1);
      var hh = f.eyeShape === 'round' ? 0.62 : f.eyeShape === 'narrow' ? 0.34 : f.eyeShape === 'hooded' ? 0.42 : 0.5;
      var inn = [ex - sd * es, eyeY + t * es], out = [ex + sd * es, eyeY - t * es];
      var upper = bez(inn, [ex - sd * es * 0.45, eyeY - es * hh * 1.25], [ex + sd * es * 0.45, eyeY - es * hh * 1.3], out, 10, []);
      var lower = bez(inn, [ex - sd * es * 0.35, eyeY + es * hh * 0.7], [ex + sd * es * 0.45, eyeY + es * hh * 0.6], out, 10, []);
      var white = upper.concat(lower.slice().reverse());
      ctx.save(); ctx.beginPath(); polyPath(ctx, white); ctx.clip();
      ctx.fillStyle = '#f4f1ea'; ctx.fillRect(ex - es * 1.3, eyeY - es * 1.2, es * 2.6, es * 2.4);
      var ir = es * 0.5;
      ctx.beginPath(); ctx.arc(ex, eyeY - es * 0.05, ir, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + Math.round(lerp(120, 60, f.hairTone)) + ',' + Math.round(lerp(116, 58, f.hairTone)) + ',' + Math.round(lerp(110, 54, f.hairTone)) + ',.85)'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex, eyeY - es * 0.05, ir * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(22,21,20,.95)'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex - ir * 0.3, eyeY - ir * 0.45, ir * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#f7f5ef'; ctx.fill();
      P.hatch(function () { ctx.rect(ex - es * 1.3, eyeY - es * 1.2, es * 2.6, es * 0.8); }, 0, 1.6, 0.35);
      ctx.restore();
      P.line(upper, f.eyeShape === 'hooded' ? 2.2 : 1.7, 0.9, 0.3);
      P.line(lower, 0.8, 0.5, 0.3);
      P.line(bez([inn[0] + sd * 1, inn[1] - es * (hh + 0.35)], [ex - sd * es * 0.2, eyeY - es * (hh + 0.75)], [ex + sd * es * 0.5, eyeY - es * (hh + 0.7)], [out[0] + sd * 1, out[1] - es * (hh + 0.25)], 8, []), 0.7,
             f.eyeShape === 'hooded' ? 0.7 : 0.4, 0.3);
      if (f.age > 38) P.line(bez([ex - sd * es * 0.7, eyeY + es * 0.8], [ex - sd * es * 0.2, eyeY + es * 1.15], [ex + sd * es * 0.4, eyeY + es * 1.1], [ex + sd * es * 0.9, eyeY + es * 0.75], 6, []), 0.6, 0.35, 0.3);
      if (f.age > 50) for (var c = 0; c < 3; c++) P.line([[out[0] + sd * 3, out[1] - 2 + c * 3], [out[0] + sd * 9, out[1] - 4 + c * 4]], 0.5, 0.35, 0.3);
    });

    /* Brows: hair by hair, a few dozen short strokes along an arch. */
    [-1, 1].forEach(function (sd) {
      var bx = cx + sd * gap, a = f.browAngle * sd;
      var arc = bez([bx - sd * es * 1.15, browY + 4 + a * 8], [bx - sd * es * 0.4, browY - 3 * f.browArch], [bx + sd * es * 0.5, browY - 4 * f.browArch], [bx + sd * es * 1.35, browY + 3 - a * 8], 14, []);
      var n = Math.round(10 + f.brow * 6);
      for (var k = 0; k < n; k++) {
        var q = arc[Math.min(arc.length - 1, Math.floor(P.r() * arc.length))];
        var th = f.brow * (1 - Math.abs(k / n - 0.4));
        P.line([[q[0], q[1] + th * 0.6], [q[0] + sd * 3.5, q[1] - th * 0.5]], 0.8, 0.2 + f.hairTone * 0.45, 0.3);
      }
    });

    /* Nose: the bridge shadow down one side, the ball of the tip, the wings
     * and nostrils, and a shadow beneath. */
    var nw2 = W * f.noseW * 0.55, nTop = browY + 6;
    P.line(bez([cx + 5, nTop], [cx + nw2 * (f.noseBump ? 0.9 : 0.6), lerp(nTop, noseY, 0.4)], [cx + nw2 * 0.75, lerp(nTop, noseY, 0.75)], [cx + nw2 * 0.85, noseY - 6], 10, []), 1, 0.55, 0.3);
    P.hatch(function () { ctx.moveTo(cx + 4, nTop + 4); ctx.lineTo(cx + nw2 * 0.8, noseY - 6); ctx.lineTo(cx + nw2 * 0.3, noseY - 6); ctx.closePath(); }, 1.2, 2.2, 0.25);
    P.line(bez([cx - nw2, noseY - 3], [cx - nw2 * 1.25, noseY + 3], [cx - nw2 * 0.5, noseY + 5], [cx - nw2 * 0.25, noseY + 2], 8, []), 1.1, 0.75, 0.3);
    P.line(bez([cx + nw2 * 0.25, noseY + 2], [cx + nw2 * 0.5, noseY + 5], [cx + nw2 * 1.25, noseY + 3], [cx + nw2, noseY - 3], 8, []), 1.1, 0.75, 0.3);
    P.line(bez([cx - nw2 * 0.4, noseY + 2], [cx - nw2 * 0.15, noseY + 4], [cx + nw2 * 0.15, noseY + 4], [cx + nw2 * 0.4, noseY + 2], 6, []), 0.8, 0.5, 0.3);
    [-1, 1].forEach(function (sd) {
      ctx.beginPath(); ctx.ellipse(cx + sd * nw2 * 0.55, noseY + 1.5, 2.6, 1.3, sd * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,28,26,.6)'; ctx.fill();
      P.line(bez([cx + sd * nw2 * 0.95, noseY - 10], [cx + sd * nw2 * 1.3, noseY - 6], [cx + sd * nw2 * 1.25, noseY], [cx + sd * nw2 * 0.95, noseY + 2], 6, []), 0.9, 0.55, 0.3);
    });
    P.smudge(cx + 2, noseY + 7, nw2 * 0.9, 3, 0.25);

    /* Mouth. */
    var mw = W * f.mouthW * 0.6, sm = f.smile * 3.5;
    var lipT = 2.5 + f.lips * 2.5, lipB = 3.5 + f.lips * 3;
    var mline = bez([cx - mw, mouthY - sm], [cx - mw * 0.4, mouthY + 1.5], [cx + mw * 0.4, mouthY + 1.5], [cx + mw, mouthY - sm], 12, []);
    var upperLip = bez([cx - mw * 0.9, mouthY - sm * 0.85], [cx - mw * 0.4, mouthY - lipT * 1.2], [cx - mw * 0.1, mouthY - lipT * 1.1], [cx, mouthY - lipT * 0.75], 8, [])
      .concat(bez([cx, mouthY - lipT * 0.75], [cx + mw * 0.1, mouthY - lipT * 1.1], [cx + mw * 0.4, mouthY - lipT * 1.2], [cx + mw * 0.9, mouthY - sm * 0.85], 8, []).slice(1));
    P.hatch(function () { polyPath(ctx, upperLip.concat(mline.slice().reverse())); }, 0.25, 1.8, 0.35);
    P.line(mline, 1.6, 0.85, 0.3);
    P.line(upperLip, 0.7, 0.45, 0.3);
    var lowerLip = bez([cx - mw * 0.7, mouthY + 1], [cx - mw * 0.35, mouthY + lipB * 1.3], [cx + mw * 0.35, mouthY + lipB * 1.3], [cx + mw * 0.7, mouthY + 1], 10, []);
    P.line(lowerLip.slice(2, -2), 0.8, 0.4, 0.3);
    P.smudge(cx, mouthY + lipB * 1.6, mw * 0.6, 2.5, 0.2);
    P.line([[cx - 2.5, noseY + 6], [cx - 2, mouthY - lipT - 1]], 0.6, 0.3, 0.2);
    P.line([[cx + 2.5, noseY + 6], [cx + 2, mouthY - lipT - 1]], 0.6, 0.3, 0.2);
    if (f.age > 33) {
      var la = 0.25 + (f.age - 33) / 70;
      P.line(bez([cx - nw2 * 1.4, noseY - 4], [cx - mw * 1.25, noseY + 6], [cx - mw * 1.3, mouthY - 2], [cx - mw * 1.25, mouthY + 6], 8, []), 0.7, la, 0.3);
      P.line(bez([cx + nw2 * 1.4, noseY - 4], [cx + mw * 1.25, noseY + 6], [cx + mw * 1.3, mouthY - 2], [cx + mw * 1.25, mouthY + 6], 8, []), 0.7, la, 0.3);
    }
    if (f.age > 44) for (var fl = 0; fl < 3; fl++) {
      var fy = lerp(top, browY, 0.62) + fl * 5;
      P.line(bez([cx - hw * 0.45, fy + 2], [cx - hw * 0.15, fy - 1], [cx + hw * 0.15, fy - 1], [cx + hw * 0.45, fy + 2], 8, []), 0.6, 0.25, 0.4);
    }

    /* Beard or stubble, inside the face. */
    if (f.beard || f.stubble) {
      ctx.save(); ctx.beginPath(); facePath(); ctx.clip();
      var beard = function () {
        ctx.moveTo(cx - hw * 1.05, cheekY - 2);
        ctx.lineTo(cx - mw * 1.25, noseY + 2); ctx.quadraticCurveTo(cx, noseY - 2, cx + mw * 1.25, noseY + 2);
        ctx.lineTo(cx + hw * 1.05, cheekY - 2); ctx.lineTo(cx + hw, H); ctx.lineTo(cx - hw, H); ctx.closePath();
      };
      if (f.beard) {
        ctx.save(); ctx.beginPath(); ctx.ellipse(cx, mouthY + 1, mw * 1.05, lipB + 3, 0, 0, Math.PI * 2); ctx.rect(W, 0, -W, H); ctx.clip('evenodd');
        P.hatch(beard, 1.65, 1.7, hd * 0.8, 0.9);
        P.hatch(beard, 1.45, 2.6, hd * 0.4, 0.7);
        ctx.restore();
      } else {
        ctx.save(); ctx.beginPath(); beard(); ctx.clip();
        P.flecks(cx, lerp(noseY, chinY, 0.62), hw * 0.95, (chinY - noseY) * 0.6, 900, 0.3);
        ctx.restore();
      }
      ctx.restore();
    }

    /* Hair: the mass over the skull down to the hairline, by cut. */
    var vol = cut.vol || 0;
    var hl = lerp(top, browY, 0.56 + f.hairline);
    var sideY = cut.under ? templeY - 12 : cut.short ? templeY - 2 : cut.over ? templeY + 18 : templeY + 6;
    var lean = (cut.lean || 0) * f.part * hw;
    var spread = cut.over ? 1.1 : 1.0;
    var crown = [], cyC = (top - vol - 2 - 0.25 * sideY) / 0.75;   // the curve's peak lands at top - vol - 2
    bez([cx - hw * spread, sideY], [cx - hw * (spread + 0.08) - vol * 0.3 + lean * 1.6, cyC - Math.abs(lean) * 0.15], [cx + hw * (spread + 0.08) + vol * 0.3 + lean * 1.6, cyC - Math.abs(lean) * 0.15], [cx + hw * spread, sideY], 16, crown);
    var RT = [cx + hw * 0.97 * spread, sideY], LT = [cx - hw * 0.97 * spread, sideY], line;
    if (cut.line === 'fringe') {
      var fy = browY - 6; line = [RT];
      bez(RT, [cx + hw * 0.95, fy - 6], [cx + hw * 0.8, fy], [cx + hw * 0.7, fy], 4, line);
      for (var zz = 1; zz <= 10; zz++) line.push([cx + hw * 0.7 - zz * hw * 0.14, fy + (zz % 2 ? 3 : -2) + (P.r() - 0.5) * 2]);
      bez(line[line.length - 1], [cx - hw * 0.8, fy], [cx - hw * 0.95, fy - 6], LT, 4, line);
    } else if (cut.line === 'back' || cut.line === 'round') {
      var hb = cut.line === 'round' ? hl : hl - 5;
      line = bez(RT, [cx + hw * 0.8, hb - 12], [cx - hw * 0.8, hb - 12], LT, 14, []);
    } else if (cut.line === 'peak') {
      line = bez(RT, [cx + hw * 0.75, hl - 14], [cx + hw * 0.3, hl - 10], [cx, hl + 5], 8, []);
      line = line.concat(bez([cx, hl + 5], [cx - hw * 0.3, hl - 10], [cx - hw * 0.75, hl - 14], LT, 8, []).slice(1));
    } else {
      line = bez(RT, [cx + hw * 0.7, hl - 4], [cx + 18 * f.part, hl - 6], [cx, hl], 8, [])
        .concat(bez([cx, hl], [cx - 18 * f.part, hl - 2], [cx - hw * 0.7, hl - 4], LT, 8, []).slice(1));
    }
    var mass = crown.concat(line);
    function massPath() { polyPath(ctx, mass); }
    var hairPath = massPath, hairWashA = 0.6;
    if (cut.under) {               /* the shaved sides under the top */
      ctx.save(); ctx.beginPath(); facePath(); ctx.clip();
      ctx.beginPath(); ctx.rect(0, top - 4, W, templeY + 8 - top); ctx.clip();
      P.flecks(cx - hw * 0.85, templeY - 4, hw * 0.25, 14, 300, 0.12 + hd * 0.25);
      P.flecks(cx + hw * 0.85, templeY - 4, hw * 0.25, 14, 300, 0.12 + hd * 0.25);
      ctx.restore();
    }
    if (cut.tex === 'bald') {
      P.hatch(function () { ctx.ellipse(cx + hw * 0.35, top + 18, hw * 0.4, 14, 0, 0, Math.PI * 2); }, 2.3, 3.5, 0.1);
      if (cut.ring) {             /* the fringe of hair left round the sides, soft-edged */
        var tuft = function (sd) { var tx = cx + sd * hw * 0.93, ty = (templeY + browY) / 2 - 2; ctx.moveTo(tx + hw * 0.15 * Math.cos(sd * 0.15), ty + hw * 0.15 * Math.sin(sd * 0.15)); ctx.ellipse(cx + sd * hw * 0.93, (templeY + browY) / 2 - 2, hw * 0.15, (browY - templeY) / 2 + 9, sd * 0.15, 0, Math.PI * 2); };
        [-1, 1].forEach(function (sd) {
          ctx.save(); ctx.beginPath(); facePath(); ctx.clip(); ctx.beginPath(); tuft(sd); ctx.clip();
          ctx.fillStyle = hairBase; ctx.fillRect(0, 0, W, H);
          texture('strand', cx + sd * hw * 0.93 - 10, templeY - 14, cx + sd * hw * 0.93 + 10, browY, 45, 0.3 + hd * 0.3, Math.PI / 2 + sd * 0.2);
          ctx.restore();
        });
        hairPath = function () { tuft(-1); tuft(1); };
      } else hairPath = null;
    } else if (cut.tex === 'fleck') {
      ctx.save(); ctx.beginPath(); massPath(); ctx.clip();
      P.flecks(cx, (top + hl) / 2, hw * 1.05, (hl - top) * 0.75, 1600, 0.2 + hd * 0.45);
      if (cut.fade) {             /* a fade: dense on top, thinning down the sides */
        ctx.fillStyle = 'rgba(238,235,227,.55)';
        ctx.fillRect(0, templeY - 6, W, 30);
        P.flecks(cx, top + 14, hw * 0.8, 16, 900, 0.25 + hd * 0.4);
      }
      ctx.restore();
      P.line(line, 0.7, 0.35, 0.6);
      hairWashA = 0.3;
    } else if (cut.tex === 'hawk') {
      var bw = cut.curl ? 16 : 12, mo;
      if (cut.spikes) {
        mo = [[cx - bw, hl]]; var ns = 5;
        for (var sp = 0; sp <= ns; sp++) {
          var sx = lerp(cx - bw, cx + bw, sp / ns), base = top + 6;
          mo.push([sx, base]); if (sp < ns) mo.push([lerp(cx - bw, cx + bw, (sp + 0.5) / ns), base - vol - (sp % 2 ? 4 : 0)]);
        }
        mo.push([cx + bw, hl]);
      } else mo = [[cx - bw, top + 4], [cx - bw + 2, top - vol + 4], [cx + bw - 2, top - vol + 4], [cx + bw, top + 4], [cx + bw - 2, hl], [cx - bw + 2, hl]];
      ctx.save(); ctx.beginPath(); massPath(); ctx.clip();
      P.flecks(cx, (top + hl) / 2, hw, (hl - top) * 0.7, 700, 0.18);
      ctx.restore();
      ctx.save(); ctx.beginPath(); polyPath(ctx, mo); ctx.fillStyle = '#eeebe3'; ctx.fill(); ctx.restore();
      if (cut.curl) {
        ctx.save(); ctx.beginPath(); polyPath(ctx, mo); ctx.fillStyle = hairBase; ctx.fill(); ctx.clip();
        texture('curl', cx - bw, top - vol, cx + bw, hl, 70, hd * 0.8); ctx.restore();
      } else P.hatch(function () { polyPath(ctx, mo); }, 1.5, 1.4, hd, 0.9);
      P.line(mo.concat([mo[0]]), 0.9, 0.7);
      hairPath = function () { polyPath(ctx, mo); };
    } else {
      var rows = cut.tex === 'rows', coil = cut.tex === 'coil';
      if (coil) { ctx.save(); ctx.beginPath(); massPath(); ctx.fillStyle = '#eeebe3'; ctx.fill(); ctx.restore(); }
      ctx.save(); ctx.beginPath(); massPath(); ctx.fillStyle = rows ? 'rgba(48,45,42,' + (0.06 + hd * 0.15) + ')' : hairBase; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); massPath(); ctx.clip();
      P.smudge(cx + hw * 0.5, (top + hl) / 2, hw * 0.6, (hl - top) * 0.6, 0.12);
      if (cut.tex === 'curl' || cut.tex === 'coil') {
        texture(cut.tex, cx - hw * 1.2, top - vol, cx + hw * 1.2, sideY + 6, cut.tex === 'coil' ? 900 : 170, hd * 0.75);
      } else if (cut.tex === 'rope') {
        texture('rope', cx - hw * 1.2, top - vol, cx + hw * 1.2, sideY + 6, 0, hd * 0.6);
      } else if (cut.tex === 'rows') {
        /* Rows from the hairline back over the crown, a braid's chevrons along each. */
        for (var rw2 = -4; rw2 <= 4; rw2++) {
          var hx = cx + rw2 * hw * 0.21, hy = hl - 4 - (1 - Math.abs(rw2) / 4) * 8;
          var row = bez([hx, hy + 6], [hx * 0.85 + cx * 0.15, hy - 8], [cx + rw2 * 3, top - 4], [cx + rw2 * 2, top - vol - 4], 8, []);
          P.line(row, 1.6, 0.35 + hd * 0.5, 0.3);
          for (var rk = 1; rk < row.length - 1; rk++) {
            P.line([[row[rk][0] - 3.5, row[rk][1] + 1.5], [row[rk][0], row[rk][1] - 2], [row[rk][0] + 3.5, row[rk][1] + 1.5]], 1.0, 0.3 + hd * 0.45, 0.2);
          }
        }
      } else if (cut.line === 'fringe') {
        /* Strands from the crown down to the fringe. */
        for (var s = 0; s < 140; s++) {
          var fx = lerp(cx - hw * 1.05, cx + hw * 1.05, P.r()), ty = top - vol + 2 + P.r() * 6;
          P.line(bez([cx + (fx - cx) * 0.4, ty], [cx + (fx - cx) * 0.7, ty + 4], [fx, lerp(ty, browY, 0.6)], [fx + (P.r() - 0.5) * 3, browY - 4], 6, []), 0.7, hd * 0.55, 0.4);
        }
      } else if (cut.line === 'back' || cut.line === 'round') {
        /* Swept straight back from the hairline. */
        for (var s2 = 0; s2 < 42; s2++) {
          var q = line[Math.floor(P.r() * line.length)], ox = q[0] - cx;
          var tgt = [cx + lean + ox * lerp(0.25, 0.6, P.r()) + (P.r() - 0.5) * 10, top - vol + 2 + P.r() * 5];
          var path = bez([q[0], q[1] + 2], [q[0] + ox * 0.12, lerp(q[1], top, 0.55)], [tgt[0] + ox * 0.2, tgt[1] + 8], tgt, 10, []);
          clump(path, 3 + Math.floor(P.r() * 3), hd * 0.6);
        }
      } else {
        /* Strands from the part, sweeping out and down over the skull. */
        var px0 = cx + 14 * f.part, n2 = cut.sweep ? 130 : 150, sw = cut.sweep || 0.6;
        for (var s3 = 0; s3 < n2 / 3.5; s3++) {
          var side = P.r() < sw ? -f.part : f.part;
          var sx3 = px0 + (P.r() - 0.5) * 8, sy3 = top - vol + 2 + P.r() * 6;
          var ex3 = cx + side * hw * lerp(0.4, 1.15, P.r()), ey3 = lerp(hl, sideY + 4, P.r());
          clump(bez([sx3, sy3], [lerp(sx3, ex3, 0.3), sy3 - 2], [ex3, lerp(sy3, ey3, 0.4)], [ex3 + side * 2, ey3], 10, []), 3 + Math.floor(P.r() * 3), hd * 0.6);
        }
      }
      if (!rows && !coil) P.hatch(massPath, f.part > 0 ? 2.5 : 0.65, 3.6, hd * 0.18, 0.6);
      /* Sheen: the light catches a band across the crown. */
      ctx.save(); ctx.translate(cx - hw * 0.3, lerp(top - vol, hl, 0.42)); ctx.scale(1, 0.32);
      var sg = ctx.createRadialGradient(0, 0, 0, 0, 0, hw * 0.55);
      sg.addColorStop(0, 'rgba(240,237,229,' + (0.5 - hd * 0.2) + ')'); sg.addColorStop(1, 'rgba(240,237,229,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, hw * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.restore();
      if (!coil) P.line(crown, 1.1, 0.7, 0.6);
      /* A soft hairline: wisps across it rather than one hard edge. */
      P.line(line, 0.6, 0.22, 0.6);
      for (var wi = 1; wi < line.length - 1; wi++) {
        var w0 = line[wi], w1 = line[wi + 1], nx = -(w1[1] - w0[1]), ny = w1[0] - w0[0], nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl; if (ny < 0) { nx = -nx; ny = -ny; }
        for (var wk = 0; wk < 2; wk++) {
          var wx = lerp(w0[0], w1[0], P.r()), wy = lerp(w0[1], w1[1], P.r()), wl = 2 + P.r() * 3;
          P.line([[wx - nx * 4, wy - ny * 4], [wx + nx * wl, wy + ny * wl]], 0.6, hd * 0.5, 0.3);
        }
      }
    }
    if (cut.tex === 'bald' || cut.tex === 'fleck') P.line(crown, 1.3, 0.8, 0.4);

    /* Marks a witness remembers. */
    if (f.scar) {
      var sx0 = cx + f.scarSide * (gap + es * 0.4), sy0 = browY - 6;
      var scar = [[sx0, sy0], [sx0 + f.scarSide * 3, eyeY - es], [sx0 + f.scarSide * 5, eyeY + es * 1.4], [sx0 + f.scarSide * 7, cheekY + 6]];
      P.line(scar, 1.1, 0.7, 0.3);
      for (var sc = 0; sc < 5; sc++) {
        var q = scar[Math.min(3, Math.floor(sc * 0.8))];
        P.line([[q[0] - 2.5, q[1] + sc * 6 - 6], [q[0] + 2.5, q[1] + sc * 6 - 4]], 0.6, 0.45, 0.2);
      }
    }
    if (f.mole) {
      ctx.beginPath(); ctx.arc(cx + f.moleAt[0] * hw * 0.7, lerp(eyeY, chinY, f.moleAt[1] - 0.2), 1.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,28,26,.8)'; ctx.fill();
    }

    /* COLOUR, LAID UNDER THE GRAPHITE (2026-10-26). Washes multiplied over
     * the drawing — a coloured-pencil pass over the composite — so every
     * pencil line stays dark and the paper shows through: the skin as the
     * body's painted face is, the hair, the eyes, a little warmth in the
     * lips and cheeks, and the suit's collar and shoulders in its livery. */
    function wash(path, col, a, clip) {
      ctx.save();
      if (clip === 'face') { ctx.beginPath(); facePath(); ctx.clip(); }
      else if (clip === 'off') { ctx.beginPath(); ctx.rect(-W, -H, W * 3, H * 3); facePath(); ctx.clip('evenodd'); }
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = a;
      ctx.beginPath(); path(); ctx.fillStyle = col; ctx.fill(); ctx.restore();
    }
    var skinCol = f.skinHex || '#C9A27E';
    wash(facePath, skinCol, 0.55);
    wash(function () { ctx.rect(cx - nw, jawY, nw * 2, ringY - jawY); }, skinCol, 0.5, 'off');
    [-1, 1].forEach(function (sd) {
      wash(function () { ctx.ellipse(cx + sd * (hw * 0.97 + 5), (browY + noseY) / 2 + 2, 6, (noseY - browY) * 0.5, 0, 0, Math.PI * 2); }, skinCol, 0.5);
      wash(function () { ctx.ellipse(cx + sd * hw * 0.62, cheekY + 12, hw * 0.22, 10, 0, 0, Math.PI * 2); }, '#d9867a', 0.12);
    });
    wash(function () { ctx.ellipse(cx, mouthY + 1, mw * 0.85, 5 + f.lips * 2, 0, 0, Math.PI * 2); }, '#c46a62', 0.22);
    {
      if (hairPath) wash(hairPath, f.hairHex || '#3b2a1e', hairWashA);
      if (backPath) wash(backPath, f.hairHex, 0.55, 'off');
      if (f.beard) wash(function () {
        ctx.moveTo(cx - hw, cheekY); ctx.quadraticCurveTo(cx - hw * 0.5, chinY + 8, cx, chinY + 8);
        ctx.quadraticCurveTo(cx + hw * 0.5, chinY + 8, cx + hw, cheekY); ctx.lineTo(cx + mw * 1.2, noseY + 2); ctx.lineTo(cx - mw * 1.2, noseY + 2); ctx.closePath();
      }, f.hairHex, 0.4);
    }
    [-1, 1].forEach(function (sd) {
      wash(function () { ctx.arc(cx + sd * gap, eyeY - es * 0.05, es * 0.5, 0, Math.PI * 2); }, f.eyeHex || '#5a3a22', 0.85);
    });
    drawSuit();
    /* THE SUIT, BY BODY (2026-10-26). Astra: "let's make a variant for each
     * class type, since some of that would still be visible in person." The
     * collar and shoulders are the same suit the body wears (npcmodel.js R[],
     * coloured from NpcModel.suitOf): the crew in the ship's outfit, each
     * faction role in its own. */
    function drawSuit() {
      var S0 = f.suit, key = (S0 && S0.key) || 'pilot', o = (S0 && S0.o) || null, Gc = (S0 && S0.G) || {};
      var LIVC = { civ: '#6f8a86', navy: '#2f5f96', syn: '#3d3c39', pir: '#8a4a2a' };
      var base = o ? o.shirt : ({ raider: Gc.rust, captain: Gc.rustD, enforcer: Gc.syn, heavy: Gc.syn, fixer: Gc.syn, marine: Gc.navy, officer: Gc.navy }[key] || LIVC[f.liv] || LIVC.civ);
      var ringC = '#8a8f94', flip = (S0 && S0.flip) || 1;
      function band(x0, y0, x1, y1, w, col, a) {           // a strap or stripe, as a filled quad
        var dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
        wash(function () { ctx.moveTo(x0 + nx, y0 + ny); ctx.lineTo(x1 + nx, y1 + ny); ctx.lineTo(x1 - nx, y1 - ny); ctx.lineTo(x0 - nx, y0 - ny); ctx.closePath(); }, col, a == null ? 0.8 : a);
        P.line([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny]], 0.7, 0.45, 0.2); P.line([[x0 - nx, y0 - ny], [x1 - nx, y1 - ny]], 0.7, 0.45, 0.2);
      }
      function blob(x, y, rx, ry, col, a, rot) { wash(function () { ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); }, col, a == null ? 0.85 : a);
        ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(38,36,34,.6)'; ctx.stroke(); ctx.restore(); }
      function plate(pts, col, a) { wash(function () { polyPath(ctx, pts); }, col, a == null ? 0.85 : a); P.line(pts.concat([pts[0]]), 0.9, 0.6, 0.3); }
      function word(t, x, y, px, col, rot) { ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.font = 'bold ' + px + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.fillText(t, 0, 0); ctx.restore(); }
      var chest = shY + 26, L = cx - SW * 0.8, R = cx + SW * 0.8;
      wash(torsoPath, base, 0.62);
      if (key === 'pilot') {
        ringC = o.acc;
        band(cx - SW * 0.55, shY - 4, cx + SW * 0.25, HB, 9, o.harness);
        band(cx + SW * 0.55, shY - 4, cx - SW * 0.25, HB, 9, o.harness);
        plate([[cx - 7, chest + 30], [cx + 7, chest + 30], [cx + 7, chest + 44], [cx - 7, chest + 44]], '#B4B2A9');
      } else if (key === 'engineer') {
        band(L, shY - 6, R, shY - 6, 7, o.trim || '#d8d8d0');
        band(L + 4, shY + 2, R - 4, shY + 2, 3, o.trim ? shadeHex(o.trim, 0.8) : '#B8D23C');
        plate([[cx + SW * 0.3, chest + 6], [cx + SW * 0.55, chest + 6], [cx + SW * 0.55, chest + 26], [cx + SW * 0.3, chest + 26]], shadeHex(o.shirt, 0.8), 0.7);
        P.line([[cx + SW * 0.36, chest + 2], [cx + SW * 0.36, chest + 14]], 1.4, 0.7);
      } else if (key === 'gunner') {
        var vest = shadeHex(o.shirt, 0.72);
        wash(function () { ctx.rect(cx - SW * 0.62, shY - 8, SW * 1.24, HB - shY + 12); }, vest, 0.75);
        for (var qi = -4; qi <= 4; qi++) { P.line([[cx + qi * 14 - 20, shY - 4], [cx + qi * 14 + 20, HB]], 0.6, 0.35, 0.2); P.line([[cx + qi * 14 + 20, shY - 4], [cx + qi * 14 - 20, HB]], 0.6, 0.35, 0.2); }
        blob(cx, ringY + 14, rw * 1.45, 15, Gc.steelD || '#5F5E5A', 0.85);     // the flak collar
        blob(cx, ringY + 8, rw, 9, '#8a8f94', 0.4);
      } else if (key === 'security') {
        var sv = shadeHex(o.shirt, 0.62);
        wash(function () { ctx.rect(cx - SW * 0.55, shY - 8, SW * 1.1, HB - shY + 12); }, sv, 0.75);
        plate([[cx - SW * 0.5, chest + 10], [cx + SW * 0.1, chest + 10], [cx + SW * 0.1, chest + 22], [cx - SW * 0.5, chest + 22]], '#efeee6', 0.9);
        word('SECURITY', cx - SW * 0.2, chest + 20, 9, sv);
        plate([[cx - SW * 0.66, shY - 2], [cx - SW * 0.5, shY - 2], [cx - SW * 0.5, shY + 18], [cx - SW * 0.66, shY + 18]], '#2b2f31', 0.95);
        P.line([[cx - SW * 0.62, shY - 2], [cx - SW * 0.63, shY - 18]], 1.3, 0.8);
        band(cx + SW * 0.82, shY + 30, cx + SW * 0.9, shY + 30, 10, o.acc);
      } else if (key === 'tactical') {
        var pl = (o.helm === Gc.white ? Gc.navyD : '#3a3f42');
        plate([[cx - SW * 0.45, shY - 6], [cx + SW * 0.45, shY - 6], [cx + SW * 0.4, HB], [cx - SW * 0.4, HB]], pl, 0.85);
        P.line([[cx, shY - 6], [cx, HB]], 0.8, 0.5);
        [-1, 1].forEach(function (sd) { blob(cx + sd * SW * 0.84, shY + 4, SW * 0.24, 20, '#3a3f42', 0.9); });
        band(cx + SW * 0.82, shY + 32, cx + SW * 0.92, shY + 32, 9, o.acc);
        ringC = '#2a2e30';
      } else if (key === 'medic') {
        var wh = '#E3E1DA';
        [-1, 1].forEach(function (sd) { wash(function () { ctx.moveTo(cx + sd * SW * 0.8, shY - 9); ctx.quadraticCurveTo(cx + sd * SW, shY, cx + sd * (SW + 2), shY + 30); ctx.lineTo(cx + sd * (SW + 6), HB + 4); ctx.lineTo(cx + sd * SW * 0.84, HB + 4); ctx.closePath(); }, wh, 0.9); });
        band(cx + SW * 0.6, shY - 6, cx - SW * 0.4, HB, 8, '#C9C6BC');
        blob(cx - SW * 0.3, chest + 16, 13, 13, '#639922', 0.95);
        P.line([[cx - SW * 0.3, chest + 6], [cx - SW * 0.3, chest + 26]], 2, 0.0);
        ctx.save(); ctx.strokeStyle = '#F1EFE8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - SW * 0.3, chest + 7); ctx.lineTo(cx - SW * 0.3, chest + 25); ctx.stroke();
        ctx.lineWidth = 1.2; ctx.beginPath(); for (var ci = 0; ci <= 12; ci++) { var tt = ci / 12; ctx[ci ? 'lineTo' : 'moveTo'](cx - SW * 0.3 + Math.sin(tt * 9) * 4 * (1 - tt * 0.4), chest + 10 + tt * 14); } ctx.stroke(); ctx.restore();
      } else if (key === 'loadmaster') {
        var fr = '#9a9891', hz = o.trim || '#B8D23C';
        plate([[cx - SW * 1.02, shY - 4], [cx + SW * 1.02, shY - 4], [cx + SW * 1.02, shY + 6], [cx - SW * 1.02, shY + 6]], fr, 0.95);
        [-1, 1].forEach(function (sd) {
          for (var hi = 0; hi < 4; hi++) plate([[cx + sd * (SW * 0.98 - hi * 8), shY - 4], [cx + sd * (SW * 0.98 - hi * 8 - 4), shY - 4], [cx + sd * (SW * 0.98 - hi * 8 - 8), shY + 6], [cx + sd * (SW * 0.98 - hi * 8 - 4), shY + 6]], hi % 2 ? '#1b1b1b' : hz, 0.9);
          P.line([[cx + sd * SW * 0.62, shY + 6], [cx + sd * SW * 0.6, HB]], 2.4, 0.7);        // frame struts down the chest
        });
        P.line([[cx + SW * 0.7, shY - 4], [cx + SW * 0.7, ringY - 50]], 1.6, 0.8);              // radio mast
        blob(cx + SW * 0.7, ringY - 52, 3, 3, o.glow, 1);
      } else if (key === 'raider') {
        var nv = -flip;
        blob(cx + nv * SW * 0.84, shY, SW * 0.26, 14, Gc.navy, 0.9, nv * 0.3);           // the stolen navy pauldron
        wash(function () { ctx.moveTo(cx - nv * SW * 0.8, shY - 9); ctx.quadraticCurveTo(cx - nv * SW, shY, cx - nv * (SW + 2), shY + 30); ctx.lineTo(cx - nv * (SW + 6), HB + 4); ctx.lineTo(cx - nv * SW * 0.84, HB + 4); ctx.closePath(); }, '#6b5040', 0.8);
        plate([[cx - 30, chest + 4], [cx - 8, chest + 2], [cx - 9, chest + 22], [cx - 31, chest + 24]], '#6b4a32', 0.8);
        plate([[cx + 18, chest + 30], [cx + 36, chest + 31], [cx + 35, chest + 46], [cx + 19, chest + 45]], '#5F5E5A', 0.8);
        for (var st = 0; st < 6; st++) P.line([[cx - 31 + st * 4, chest + 25], [cx - 29 + st * 4, chest + 28]], 0.7, 0.6, 0.1);
        ringC = '#3a2a20';
      } else if (key === 'captain') {
        var mt = -flip;
        [-1, 1].forEach(function (sd) { plate([[cx + sd * rw * 1.0, ringY + 12], [cx + sd * SW * 0.32, HB], [cx + sd * SW * 0.08, HB]], '#5a2a14', 0.7); });   // lapels
        band(cx + SW * 0.62, shY - 8, cx - SW * 0.35, HB, 11, Gc.red);                                                    // sash
        wash(function () { ctx.moveTo(cx + mt * SW * 0.8, shY - 9); ctx.quadraticCurveTo(cx + mt * SW, shY, cx + mt * (SW + 2), shY + 30); ctx.lineTo(cx + mt * (SW + 6), HB + 4); ctx.lineTo(cx + mt * SW * 0.84, HB + 4); ctx.closePath(); }, Gc.steel, 0.85);
        for (var rv = 0; rv < 5; rv++) blob(cx + mt * SW * 0.95, shY + 12 + rv * 12, 1.4, 1.4, '#d0cfc8', 1);
        [[Gc.steelD, 0], [Gc.navy, 7], ['#B05535', 14]].forEach(function (pp, i) {               // trophy plates
          plate([[cx - mt * (SW * 0.6 + i * 4), shY - 14 - pp[1]], [cx - mt * (SW * 1.02 - i * 4), shY - 4 - pp[1]], [cx - mt * (SW * 1.02 - i * 4), shY + 2 - pp[1]], [cx - mt * (SW * 0.6 + i * 4), shY - 8 - pp[1]]], pp[0], 0.9);
        });
        ringC = Gc.steel;
      } else if (key === 'enforcer' || key === 'heavy' || key === 'fixer') {
        if (key === 'enforcer') {
          blob(cx, ringY + 6, rw * 1.12, 15, '#1a1a19', 0.7);                                    // the high collar
          [-1, 1].forEach(function (sd) { plate([[cx + sd * rw * 0.9, ringY + 16], [cx + sd * SW * 0.45, shY + 50], [cx + sd * 4, HB]], '#1a1a19', 0.85); });
          for (var bt = 0; bt < 3; bt++) blob(cx + 10, chest + 30 + bt * 14, 2, 2, '#4a4946', 1);
          ringC = '#1a1a19';
        } else if (key === 'heavy') {
          plate([[cx - SW * 0.5, shY - 6], [cx + SW * 0.5, shY - 6], [cx + SW * 0.48, HB], [cx - SW * 0.48, HB]], Gc.synL, 0.9);
          P.line([[cx - SW * 0.5, chest + 10], [cx + SW * 0.5, chest + 10]], 1.4, 0.6);
          [-1, 1].forEach(function (sd) { plate([[cx + sd * SW * 0.62, shY - 18], [cx + sd * (SW + 10), shY - 8], [cx + sd * (SW + 12), shY + 22], [cx + sd * SW * 0.66, shY + 14]], Gc.synL, 0.95); });
          band(cx - SW * 0.5, shY + 2, cx + SW * 0.5, shY + 2, 3, Gc.gold, 0.9);
          ringC = '#1a1a19';
        } else {
          plate([[cx - 14, ringY + 14], [cx + 14, ringY + 14], [cx, chest + 50]], '#EEEDE6', 0.95);                      // shirt
          plate([[cx - 3, ringY + 20], [cx + 3, ringY + 20], [cx + 4, chest + 46], [cx, chest + 52], [cx - 4, chest + 46]], Gc.gold, 0.95);   // tie
          [-1, 1].forEach(function (sd) { plate([[cx + sd * 14, ringY + 14], [cx + sd * SW * 0.4, shY + 30], [cx + sd * 3, chest + 54]], '#1a1a19', 0.9); });
          ringC = Gc.gold;
        }
      } else if (key === 'marine') {
        plate([[cx - SW * 0.45, shY - 6], [cx + SW * 0.45, shY - 6], [cx + SW * 0.42, HB], [cx - SW * 0.42, HB]], Gc.navyD, 0.9);
        [0, 9].forEach(function (dy) { P.line([[cx - 12, chest + 6 + dy], [cx, chest + 14 + dy], [cx + 12, chest + 6 + dy]], 2.4, 0.0); ctx.save(); ctx.strokeStyle = Gc.white; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 12, chest + 6 + dy); ctx.lineTo(cx, chest + 14 + dy); ctx.lineTo(cx + 12, chest + 6 + dy); ctx.stroke(); ctx.restore(); });
        [-1, 1].forEach(function (sd) {
          plate([[cx + sd * SW * 0.66, shY - 16], [cx + sd * (SW + 8), shY - 10], [cx + sd * (SW + 8), shY + 16], [cx + sd * SW * 0.68, shY + 12]], Gc.navyD, 0.95);
          band(cx + sd * SW * 0.68, shY + 12, cx + sd * (SW + 8), shY + 16, 4, Gc.white, 0.95);
          band(cx + sd * SW * 0.36, shY - 10, cx + sd * SW * 0.32, HB, 6, '#2a3542', 0.9);                               // rig straps
        });
        ringC = Gc.navy;
      } else if (key === 'officer') {
        band(cx, ringY + 16, cx, HB, 5, Gc.white, 0.95);
        [-1, 1].forEach(function (sd) { plate([[cx + sd * SW * 0.45, shY - 12], [cx + sd * SW * 0.92, shY - 4], [cx + sd * SW * 0.92, shY + 2], [cx + sd * SW * 0.45, shY - 6]], Gc.white, 0.95); });
        for (var pi2 = 0; pi2 < 3; pi2++) blob(cx - rw * 0.6 - pi2 * 6, ringY + 22, 2, 2, Gc.gold, 1);
        ringC = Gc.white;
      }
      if (o && o.emb && key !== 'medic') blob(cx + SW * 0.42, chest + 2, 6, 6, o.emb === 'navy' ? Gc.navy : o.emb === 'syn' ? Gc.gold : '#7a3b22', 0.9);
      if (key !== 'gunner') wash(function () { ctx.ellipse(cx, ringY + 8, rw, 9, 0, 0, Math.PI * 2); }, ringC, 0.75);
    }

    /* THE KIT (GEAR, rolled in features): drawn over everything, in its own
     * colours, with a pencil edge. */
    var gr = f.gear || {};
    function sideOf(g) { return g.side === 'L' ? -1 : 1; }
    function fillOut(path, col, a, lw) {
      ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); path(); ctx.fillStyle = col; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); path(); ctx.lineWidth = lw || 1.2; ctx.strokeStyle = 'rgba(32,30,28,.85)'; ctx.stroke(); ctx.restore();
    }
    var LENS = ['#5fd0e0', '#e0a53a', '#d8483e', '#8ad06a'];
    function lensCol(g) { return LENS[Math.floor(g.tint * LENS.length) % LENS.length]; }
    var earX = function (sd) { return cx + sd * (hw * 0.97 + 6); };

    if (gr.facepaint) {
      var fpc = f.liv === 'pir' ? '#7a2a1a' : '#3a4a2a';
      if (gr.facepaint.tint < 0.5) wash(function () { ctx.rect(cx - hw * 1.1, eyeY - es * 1.1, hw * 2.2, es * 2.2); }, fpc, 0.45, 'face');
      else [-1, 1].forEach(function (sd) {
        for (var k = 0; k < 2; k++) wash(function () { ctx.rect(cx + sd * (gap - es * 0.6 + k * 7), eyeY + es * 1.1, 4, cheekY - eyeY + 4); }, fpc, 0.55, 'face');
      });
    }
    if (gr.tattoo) {
      var ink = '#2e5a5a', ts = sideOf(gr.tattoo);
      ctx.save(); ctx.globalAlpha = 0.6; ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
      if (gr.tattoo.tint < 0.5) {
        for (var b = 0; b < 7; b++) { ctx.beginPath(); ctx.moveTo(cx + ts * (nw * 0.2 + b * 2.4), chinY + 14); ctx.lineTo(cx + ts * (nw * 0.2 + b * 2.4), chinY + 14 + (b % 3 ? 10 : 14)); ctx.stroke(); }
      } else {
        for (var c2 = 0; c2 < 3; c2++) {
          ctx.beginPath(); ctx.moveTo(cx + ts * hw * 0.45, cheekY + c2 * 6); ctx.lineTo(cx + ts * hw * 0.6, cheekY + 4 + c2 * 6); ctx.lineTo(cx + ts * hw * 0.75, cheekY + c2 * 6); ctx.stroke();
        }
      }
      ctx.restore();
    }
    if (gr.rebreather) {
      var rTop = noseY - 12, rBot = Math.min(chinY + 4, mouthY + 18), rW = Math.max(mw * 1.5, nw2 * 2.6);
      var mask = function () {
        ctx.moveTo(cx - rW * 0.55, rTop + 4); ctx.quadraticCurveTo(cx, rTop - 6, cx + rW * 0.55, rTop + 4);
        ctx.quadraticCurveTo(cx + rW * 1.0, (rTop + rBot) / 2, cx + rW * 0.45, rBot);
        ctx.quadraticCurveTo(cx, rBot + 8, cx - rW * 0.45, rBot);
        ctx.quadraticCurveTo(cx - rW * 1.0, (rTop + rBot) / 2, cx - rW * 0.55, rTop + 4); ctx.closePath();
      };
      ctx.save(); ctx.beginPath(); mask(); ctx.fillStyle = '#e8e4da'; ctx.fill(); ctx.restore();
      fillOut(mask, gr.rebreather.tint < 0.5 ? '#5d6a64' : '#4a4e56', 0.75, 1.4);
      [-1, 1].forEach(function (sd) {
        P.line([[cx + sd * rW * 0.8, (rTop + rBot) / 2 - 4], [earX(sd), eyeY + 6]], 1.4, 0.75);
        fillOut(function () { ctx.ellipse(cx + sd * rW * 0.78, rBot - 6, 8, 10, sd * 0.3, 0, Math.PI * 2); }, '#7a7f72', 0.9, 1.2);
        P.hatch(function () { ctx.ellipse(cx + sd * rW * 0.78, rBot - 6, 6, 8, sd * 0.3, 0, Math.PI * 2); }, 0, 2, 0.4);
      });
      for (var v = 0; v < 3; v++) P.line([[cx - 7, rBot - 14 + v * 4], [cx + 7, rBot - 14 + v * 4]], 0.9, 0.7, 0.2);
    }
    if (gr.cybereye) {
      var cs = sideOf(gr.cybereye), ex2 = cx + cs * gap;
      fillOut(function () {
        ctx.moveTo(ex2 - cs * es * 1.4, browY - 2); ctx.lineTo(ex2 + cs * es * 1.6, browY - 6);
        ctx.lineTo(ex2 + cs * es * 1.9, eyeY + es * 1.4); ctx.lineTo(ex2 - cs * es * 0.8, eyeY + es * 1.8); ctx.closePath();
      }, '#8c9096', 0.85, 1.3);
      fillOut(function () { ctx.arc(ex2, eyeY, es * 0.75, 0, Math.PI * 2); }, '#2a2c30', 1, 1.2);
      ctx.save(); ctx.beginPath(); ctx.arc(ex2, eyeY, es * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = lensCol(gr.cybereye); ctx.shadowColor = lensCol(gr.cybereye); ctx.shadowBlur = 6; ctx.fill(); ctx.restore();
      [[ex2 - cs * es * 1.1, browY], [ex2 + cs * es * 1.4, browY - 3], [ex2 + cs * es * 1.6, eyeY + es], [ex2 - cs * es * 0.5, eyeY + es * 1.5]].forEach(function (q) {
        ctx.beginPath(); ctx.arc(q[0], q[1], 1.3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(40,40,40,.8)'; ctx.fill();
      });
    }
    if (gr.eyepatch) {
      var ps2 = sideOf(gr.eyepatch), px2 = cx + ps2 * gap;
      fillOut(function () { ctx.ellipse(px2, eyeY - 1, es * 1.3, es * 1.05, 0, 0, Math.PI * 2); }, '#1e1c1a', 0.95, 1.2);
      P.line([[px2 - ps2 * es * 1.2, eyeY - es * 0.8], [cx - ps2 * hw * 0.98, browY - 10]], 1.6, 0.85);
      P.line([[px2 + ps2 * es * 1.25, eyeY - es * 0.3], [cx + ps2 * hw * 0.98, eyeY - 4]], 1.6, 0.85);
    }
    if (gr.eyepiece) {
      var es2 = sideOf(gr.eyepiece), ex3 = cx + es2 * gap;
      ctx.save(); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(ex3, eyeY, es * 1.25, 0, Math.PI * 2); ctx.fillStyle = lensCol(gr.eyepiece); ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(ex3, eyeY, es * 1.25, 0, Math.PI * 2); ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(50,52,56,.9)'; ctx.stroke(); ctx.restore();
      P.line([[ex3 + es2 * es * 1.25, eyeY - 2], [earX(es2) - es2 * 4, eyeY - 4]], 2, 0.85, 0.2);
      fillOut(function () { ctx.rect(earX(es2) - 5, eyeY - 9, 10, 12); }, '#55595f', 0.95, 1);
      ctx.save(); ctx.beginPath(); ctx.arc(earX(es2), eyeY - 3, 1.6, 0, Math.PI * 2); ctx.fillStyle = lensCol(gr.eyepiece); ctx.shadowColor = lensCol(gr.eyepiece); ctx.shadowBlur = 4; ctx.fill(); ctx.restore();
    }
    if (gr.glasses || gr.shades) {
      var sh = !!gr.shades, round = (gr.glasses || gr.shades).tint < 0.5;
      [-1, 1].forEach(function (sd) {
        var gx = cx + sd * gap;
        var lens = round ? function () { ctx.arc(gx, eyeY, es * 1.25, 0, Math.PI * 2); }
                         : function () { ctx.rect(gx - es * 1.35, eyeY - es * 0.95, es * 2.7, es * 1.9); };
        if (sh) fillOut(lens, '#1c1d20', 0.88, 1.6);
        else { ctx.save(); ctx.beginPath(); lens(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(40,38,36,.9)'; ctx.stroke(); ctx.restore(); }
        P.line([[gx + sd * es * 1.3, eyeY - 2], [earX(sd), eyeY - 4]], 1.2, 0.8, 0.2);
      });
      P.line([[cx - gap + es * 1.2, eyeY - 2], [cx, eyeY - 4], [cx + gap - es * 1.2, eyeY - 2]], 1.2, 0.85, 0.2);
    }
    if (gr.goggles) {
      var gy = Math.max(top + 10, browY - 16), gcol = lensCol(gr.goggles);
      P.line([[cx - hw * 1.02, gy + 2], [cx + hw * 1.02, gy + 2]], 4, 0.6, 0.3);
      wash(function () { ctx.rect(cx - hw * 1.02, gy - 1, hw * 2.04, 6); }, '#5a4a3a', 0.6);
      [-1, 1].forEach(function (sd) {
        fillOut(function () { ctx.arc(cx + sd * gap, gy, es * 1.15, 0, Math.PI * 2); }, '#5f5a52', 0.95, 1.4);
        ctx.save(); ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(cx + sd * gap, gy, es * 0.8, 0, Math.PI * 2); ctx.fillStyle = gcol; ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(cx + sd * gap - es * 0.3, gy - es * 0.3, es * 0.18, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
      });
    }
    if (gr.headset) {
      var hs = sideOf(gr.headset);
      P.line(bez([earX(-1), eyeY - 4], [cx - hw * 1.2, top - 30], [cx + hw * 1.2, top - 30], [earX(1), eyeY - 4], 16, []), 3, 0.75);
      [-1, 1].forEach(function (sd) { fillOut(function () { ctx.ellipse(earX(sd), eyeY + 2, 8, 13, 0, 0, Math.PI * 2); }, '#3a3d42', 0.95, 1.2); });
      P.line(bez([earX(hs), eyeY + 10], [earX(hs) - hs * 4, mouthY + 6], [cx + hs * mw * 1.6, mouthY + 10], [cx + hs * mw * 1.05, mouthY + 2], 10, []), 1.6, 0.85, 0.2);
      fillOut(function () { ctx.ellipse(cx + hs * mw * 1.05, mouthY + 2, 3.5, 2.5, 0, 0, Math.PI * 2); }, '#2a2c30', 1, 1);
    }
    if (gr.earpiece) {
      var ep = sideOf(gr.earpiece);
      fillOut(function () { ctx.arc(earX(ep) - ep * 2, eyeY + 8, 3.2, 0, Math.PI * 2); }, '#2a2c30', 1, 1);
      P.line(bez([earX(ep) - ep * 2, eyeY + 11], [earX(ep) + ep * 2, noseY + 14], [cx + ep * nw * 1.05, jawY + 10], [cx + ep * nw * 1.02, ringY], 10, []), 0.9, 0.7, 0.3);
    }
    if (gr.piercings) {
      var pc2 = sideOf(gr.piercings), metal = gr.piercings.tint < 0.5 ? '#b8b4a8' : '#c9952a';
      [[earX(pc2) + pc2 * 2, noseY + 2], [earX(pc2) + pc2 * 4, noseY - 6], [cx + pc2 * nw2 * 0.9, noseY + 1]].slice(0, 2 + Math.floor(gr.piercings.tint * 2)).forEach(function (q) {
        ctx.save(); ctx.beginPath(); ctx.arc(q[0], q[1], 2.2, 0, Math.PI * 2); ctx.lineWidth = 1.3; ctx.strokeStyle = metal; ctx.stroke(); ctx.restore();
      });
    }

    ctx.restore();
    /* The case sheet's border. */
    ctx.strokeStyle = 'rgba(60,56,52,.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(3.5, 3.5, W - 7, H - 7);
  }

  /* The picture, cached. Null without a canvas (node, tests). */
  function canvasFor(person) {
    var id = (person && (person.id || person.name)) || '?';
    if (CACHE[id]) return CACHE[id];
    if (typeof document === 'undefined' || !document.createElement) return null;
    var cv;
    try { cv = document.createElement('canvas'); cv.width = W; cv.height = H; } catch (e) { return null; }
    var ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return null;
    draw(ctx, features(person));
    CACHE[id] = cv;
    return cv;
  }

  var Portrait = { features: features, draw: draw, canvasFor: canvasFor, W: W, H: H, CUTS: CUTS, CUT_ODDS: CUT_ODDS, CUT_LEAN: CUT_LEAN, GEAR: GEAR, GEAR_PIECES: GEAR_PIECES, rollGear: rollGear, gearOf: gearOf, _clear: function () { CACHE = {}; } };
  global.Portrait = Portrait;
  if (typeof module !== 'undefined' && module.exports) module.exports = Portrait;
})(typeof window !== 'undefined' ? window : globalThis);
