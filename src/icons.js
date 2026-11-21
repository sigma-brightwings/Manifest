/* icons.js - small drawn marks for what a thing is (2026-11-20).
 *
 * Astra: "create icons for the comms menu and the nav menu which shows what
 * is a spaceport and what is a ship and what is a pirate ship and what is a
 * planetary starport or a mining facility, or navy, or syndicate" - drawn,
 * "without using ascii characters". The same set draws the relay chain on
 * the RELAY panel (main.js drawRelayPage).
 *
 * Every icon fits a box of radius r (about 4.5 px in a list row) round its
 * centre, in one ink, so a row's colour still says whose it is and the
 * shape says what. Shapes, not letters: a pilot learns them once.
 *
 *   kindOf(entry, sys) - the icon for a COMMS or NAV row, or null to leave
 *                        the row's own mark alone
 *   draw(ctx, kind, cx, cy, r, ink)
 *   LEGEND             - [kind, label] for a key */
(function (global) {
  'use strict';

  function factionOf(sys, id) { return sys && sys.factionById ? sys.factionById[id] : null; }

  /* What a port is, by who runs it first and what it does second. */
  function portKind(p, sys) {
    if (p.playerStation) return 'port-player';
    var Cb = global.Combat;
    if (p.livery === 'navy' || (Cb && Cb.fleetPort && Cb.fleetPort(p))) return 'port-navy';
    var f = factionOf(sys, p.faction);
    if (p.livery === 'syn' || (f && (f.outlaw || f.pirate))) return 'port-syndicate';
    var role = p.market && p.market.role;
    if (role === 'mining') return p.surface ? 'port-mining-ground' : 'port-mining';
    if (role === 'refinery' || role === 'reprocessing') return 'port-refinery';
    if (role === 'shipyard') return 'port-yard';
    if (role === 'highport') return 'port-highport';
    if (role === 'agri') return p.surface ? 'port-agri-ground' : 'port-agri';
    return p.surface || p.underground ? 'port-ground' : 'port-orbital';
  }
  /* What a hull is: the flag she flies and the trade she is in. */
  function shipKind(s) {
    if (!s) return 'ship';
    var cls = s.cls || (s.route && s.route.cls) || s.className;
    if (s.kind === 'navy' || cls === 'navy') return 'ship-navy';
    if (s.kind === 'police' || cls === 'police') return 'ship-police';
    if (s.kind === 'pirate' || cls === 'pirate' || s.pirate || s.className === 'pirate') return 'ship-pirate';
    if (s.route && s.route.runner) return 'ship-syndicate';
    return 'ship';
  }
  function kindOf(e, sys) {
    if (!e) return null;
    var o = e.obj;
    if (e.kind === 'ship') return shipKind(o);
    if ((e.kind === 'station' || e.kind === 'body') && o && o.kind === 'station') return portKind(o, sys);
    if (e.kind === 'mysat') return 'mysat';
    if (e.kind === 'incident') return e.help ? 'incident' : 'incident-over';
    if (e.kind === 'contact') return 'contact';
    if (o && (o.kind === 'star' || o.kind === 'planet' || o.kind === 'moon')) return o.kind;
    return null;
  }

  /* ---- the shapes ------------------------------------------------------- */
  function chevron(ctx, cx, cy, r, fill) {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.7, cy - r * 0.8); ctx.lineTo(cx + r * 0.85, cy); ctx.lineTo(cx - r * 0.7, cy + r * 0.8);
    ctx.lineTo(cx - r * 0.3, cy);
    ctx.closePath();
    if (fill) ctx.fill(); else ctx.stroke();
  }
  function ground(ctx, cx, cy, r) {
    ctx.beginPath(); ctx.moveTo(cx - r, cy + r * 0.9); ctx.lineTo(cx + r, cy + r * 0.9); ctx.stroke();
  }
  function satShape(ctx, cx, cy, r, fill) {
    /* A body between two solar wings: the shape everyone draws for one. */
    var b = r * 0.38, wl = r * 0.62, wh = r * 0.42;
    if (fill) ctx.fillRect(cx - b, cy - b, b * 2, b * 2); else ctx.strokeRect(cx - b, cy - b, b * 2, b * 2);
    ctx.strokeRect(cx - b - wl - 0.8, cy - wh, wl, wh * 2);
    ctx.strokeRect(cx + b + 0.8, cy - wh, wl, wh * 2);
  }

  function draw(ctx, kind, cx, cy, r, ink) {
    r = r || 4.5;
    ctx.save();
    ctx.fillStyle = ink; ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.1, r * 0.3);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var k = r;
    switch (kind) {
      /* SHIPS: a chevron the way a hull points; what is added says whose. */
      case 'ship':
        chevron(ctx, cx, cy, k, true); break;
      case 'ship-pirate':
        /* A chevron with teeth: two barbs off the back. */
        chevron(ctx, cx, cy, k, true);
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.7, cy - k * 0.8); ctx.lineTo(cx - k * 1.05, cy - k * 1.0);
        ctx.moveTo(cx - k * 0.7, cy + k * 0.8); ctx.lineTo(cx - k * 1.05, cy + k * 1.0);
        ctx.stroke();
        break;
      case 'ship-navy':
        /* Hollow, with a bar across: a warship's silhouette is a hard edge. */
        chevron(ctx, cx, cy, k, false);
        ctx.beginPath(); ctx.moveTo(cx - k * 0.95, cy); ctx.lineTo(cx + k * 0.5, cy); ctx.stroke();
        break;
      case 'ship-police':
        chevron(ctx, cx, cy, k, false);
        ctx.beginPath(); ctx.arc(cx - k * 0.1, cy - k * 1.05, k * 0.22, 0, 6.2832); ctx.fill();
        break;
      case 'ship-syndicate':
        /* Hollow with a cross inside: flying somebody else's flag. */
        chevron(ctx, cx, cy, k, false);
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.55, cy - k * 0.3); ctx.lineTo(cx + k * 0.05, cy + k * 0.3);
        ctx.moveTo(cx - k * 0.55, cy + k * 0.3); ctx.lineTo(cx + k * 0.05, cy - k * 0.3);
        ctx.stroke();
        break;

      /* PORTS IN ORBIT: rings. */
      case 'port-orbital':
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.85, 0, 6.2832); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.25, 0, 6.2832); ctx.fill();
        break;
      case 'port-highport':
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.9, 0, 6.2832); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.9, cy); ctx.lineTo(cx + k * 0.9, cy);
        ctx.moveTo(cx, cy - k * 0.9); ctx.lineTo(cx, cy + k * 0.9); ctx.stroke();
        break;
      case 'port-yard':
        /* A crane: a mast, a jib, and a hook on its line. */
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.6, cy + k * 0.9); ctx.lineTo(cx - k * 0.6, cy - k * 0.8);
        ctx.lineTo(cx + k * 0.9, cy - k * 0.8);
        ctx.moveTo(cx - k * 0.6, cy - k * 0.25); ctx.lineTo(cx - k * 0.05, cy - k * 0.8);
        ctx.moveTo(cx + k * 0.6, cy - k * 0.8); ctx.lineTo(cx + k * 0.6, cy - k * 0.05);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + k * 0.42, cy + k * 0.05, k * 0.2, 0, Math.PI); ctx.stroke();
        break;
      case 'port-refinery':
        /* A drop: what goes in by the tonne and comes out by the can. */
        ctx.beginPath();
        ctx.moveTo(cx, cy - k);
        ctx.quadraticCurveTo(cx + k * 0.9, cy + k * 0.1, cx, cy + k * 0.85);
        ctx.quadraticCurveTo(cx - k * 0.9, cy + k * 0.1, cx, cy - k);
        ctx.fill();
        break;
      case 'port-mining':
      case 'port-mining-ground':
        /* A pick, tilted - upright it read as a letter T at list size. */
        ctx.save();
        ctx.translate(cx, cy - (kind === 'port-mining-ground' ? k * 0.15 : 0));
        ctx.rotate(-0.7);
        ctx.beginPath();
        ctx.moveTo(-k * 0.85, -k * 0.3);
        ctx.quadraticCurveTo(0, -k * 0.95, k * 0.85, -k * 0.3);
        ctx.moveTo(0, -k * 0.62); ctx.lineTo(0, k * 0.85);
        ctx.stroke();
        ctx.restore();
        if (kind === 'port-mining-ground') ground(ctx, cx, cy, k);
        break;
      case 'port-agri':
      case 'port-agri-ground':
        /* A leaf. */
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.7, cy + k * 0.5);
        ctx.quadraticCurveTo(cx - k * 0.6, cy - k * 0.9, cx + k * 0.75, cy - k * 0.75);
        ctx.quadraticCurveTo(cx + k * 0.6, cy + k * 0.6, cx - k * 0.7, cy + k * 0.5);
        ctx.fill();
        if (kind === 'port-agri-ground') ground(ctx, cx, cy, k);
        break;
      case 'port-navy':
        /* A shield. */
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.8, cy - k * 0.8); ctx.lineTo(cx + k * 0.8, cy - k * 0.8);
        ctx.lineTo(cx + k * 0.8, cy - k * 0.1);
        ctx.quadraticCurveTo(cx + k * 0.6, cy + k * 0.7, cx, cy + k);
        ctx.quadraticCurveTo(cx - k * 0.6, cy + k * 0.7, cx - k * 0.8, cy - k * 0.1);
        ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - k * 0.55); ctx.lineTo(cx, cy + k * 0.55); ctx.stroke();
        break;
      case 'port-syndicate':
        /* A hexagon with a cross: a port that answers to the Syndicate. */
        ctx.beginPath();
        for (var h = 0; h < 6; h++) {
          var a = Math.PI / 6 + h * Math.PI / 3;
          if (h === 0) ctx.moveTo(cx + Math.cos(a) * k * 0.95, cy + Math.sin(a) * k * 0.95);
          else ctx.lineTo(cx + Math.cos(a) * k * 0.95, cy + Math.sin(a) * k * 0.95);
        }
        ctx.closePath(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.4, cy - k * 0.4); ctx.lineTo(cx + k * 0.4, cy + k * 0.4);
        ctx.moveTo(cx - k * 0.4, cy + k * 0.4); ctx.lineTo(cx + k * 0.4, cy - k * 0.4);
        ctx.stroke();
        break;
      case 'port-player':
        /* A pennant on a mast: yours. */
        ctx.beginPath(); ctx.moveTo(cx - k * 0.55, cy + k); ctx.lineTo(cx - k * 0.55, cy - k); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - k * 0.55, cy - k); ctx.lineTo(cx + k * 0.85, cy - k * 0.5);
        ctx.lineTo(cx - k * 0.55, cy); ctx.closePath(); ctx.fill();
        break;
      case 'port-ground':
        /* A dome on its ground line: a planetary starport. */
        ctx.beginPath(); ctx.arc(cx, cy + k * 0.75, k * 0.75, Math.PI, 0); ctx.closePath(); ctx.fill();
        ground(ctx, cx, cy, k);
        break;

      /* THE RELAY CHAIN. */
      case 'sat':
        satShape(ctx, cx, cy, k, true); break;
      case 'mysat':
        satShape(ctx, cx, cy, k, true);
        ctx.beginPath(); ctx.arc(cx, cy, k * 1.05, -2.4, -0.74); ctx.stroke();
        break;
      case 'sat-down':
        /* Hollow, with a slash: there, but dark. */
        ctx.globalAlpha *= 0.75;
        satShape(ctx, cx, cy, k, false);
        ctx.beginPath(); ctx.moveTo(cx - k, cy + k * 0.8); ctx.lineTo(cx + k, cy - k * 0.8); ctx.stroke();
        break;
      case 'sat-gone':
        /* Gone but expected: the body's place dashed, the wings drifting. */
        ctx.setLineDash([1.5, 1.6]);
        ctx.strokeRect(cx - k * 0.38, cy - k * 0.38, k * 0.76, k * 0.76);
        ctx.setLineDash([]);
        ctx.save(); ctx.translate(cx - k * 1.0, cy - k * 0.45); ctx.rotate(-0.5);
        ctx.strokeRect(-k * 0.28, -k * 0.3, k * 0.56, k * 0.6); ctx.restore();
        ctx.save(); ctx.translate(cx + k * 1.0, cy + k * 0.45); ctx.rotate(0.6);
        ctx.strokeRect(-k * 0.28, -k * 0.3, k * 0.56, k * 0.6); ctx.restore();
        break;
      /* AN ARMED DEFENCE PLATFORM (milsats.js): a squat diamond hull with
       * a barrel out of it - a satellite that shoots. Hollow and slashed
       * when its RTG is out; dashed when it has been destroyed. */
      case 'milsat':
      case 'milsat-down':
      case 'milsat-gone':
        if (kind === 'milsat-down') ctx.globalAlpha *= 0.75;
        if (kind === 'milsat-gone') ctx.setLineDash([1.5, 1.6]);
        ctx.beginPath();
        ctx.moveTo(cx, cy - k * 0.7); ctx.lineTo(cx + k * 0.7, cy); ctx.lineTo(cx, cy + k * 0.7); ctx.lineTo(cx - k * 0.7, cy);
        ctx.closePath();
        if (kind === 'milsat') ctx.fill(); else ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + k * 0.3, cy - k * 0.3); ctx.lineTo(cx + k * 1.05, cy - k * 1.05); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - k * 1.05, cy + k * 0.2); ctx.lineTo(cx - k * 0.7, cy + k * 0.2);
        ctx.moveTo(cx + k * 0.7, cy + k * 0.2); ctx.lineTo(cx + k * 1.05, cy + k * 0.2); ctx.stroke();
        ctx.setLineDash([]);
        if (kind === 'milsat-down') {
          ctx.beginPath(); ctx.moveTo(cx - k, cy + k * 0.8); ctx.lineTo(cx + k, cy - k * 0.8); ctx.stroke();
        }
        break;
      /* BODIES AND CALLS, as COMMS has always drawn them. */
      case 'star':
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.55, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.95, 0, 6.2832); ctx.stroke();
        break;
      case 'planet':
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.8, 0, 6.2832); ctx.fill(); break;
      case 'moon':
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.48, 0, 6.2832); ctx.fill(); break;
      case 'incident':
      case 'incident-over':
        ctx.beginPath();
        ctx.moveTo(cx, cy - k * 0.9); ctx.lineTo(cx + k * 0.9, cy); ctx.lineTo(cx, cy + k * 0.9); ctx.lineTo(cx - k * 0.9, cy);
        ctx.closePath();
        if (kind === 'incident') ctx.fill(); else ctx.stroke();
        break;
      case 'contact':
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.8, 0, 6.2832); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.2, 0, 6.2832); ctx.fill();
        break;
      case 'you':
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.95, 0, 6.2832); ctx.stroke();
        chevron(ctx, cx + k * 0.1, cy, k * 0.6, true);
        break;
      default:
        ctx.beginPath(); ctx.arc(cx, cy, k * 0.35, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  /* A link between two marks, x0 to x1 at height y: solid while it is up,
   * cut with a gap and two ticks while it is down. */
  function link(ctx, x0, x1, y, up, ink) {
    ctx.save();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    if (up) {
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    } else {
      var m = (x0 + x1) / 2, g = Math.min(4, (x1 - x0) / 4);
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(m - g, y); ctx.moveTo(m + g, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(m - g - 1.5, y - 3); ctx.lineTo(m - g + 1.5, y + 3);
      ctx.moveTo(m + g - 1.5, y - 3); ctx.lineTo(m + g + 1.5, y + 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  var LEGEND = [
    ['port-orbital', 'station'], ['port-highport', 'highport'], ['port-ground', 'starport'],
    ['port-mining', 'mining'], ['port-refinery', 'refinery'], ['port-yard', 'yard'], ['port-agri', 'agri'],
    ['port-navy', 'navy'], ['port-syndicate', 'Syndicate'], ['port-player', 'yours'],
    ['ship', 'trader'], ['ship-pirate', 'pirate'], ['ship-navy', 'warship'], ['ship-police', 'police'],
    ['ship-syndicate', 'runner'], ['milsat', 'platform']
  ];

  var Icons = { kindOf: kindOf, portKind: portKind, shipKind: shipKind, draw: draw, link: link, LEGEND: LEGEND };
  global.Icons = Icons;
  if (typeof module !== 'undefined' && module.exports) module.exports = Icons;
})(typeof window !== 'undefined' ? window : globalThis);
