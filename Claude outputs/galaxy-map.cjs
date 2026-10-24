// The 450-star galaxy, top down (2026-10-24): who holds what, and the
// no-man's land between. node "Claude outputs/galaxy-map.cjs" [seed]
global.window = global;
var fs = require('fs'), path = require('path');
var Gal = require(path.join(__dirname, '..', 'src', 'galaxy.js'));
var seed = process.argv[2] || 'kawartha';
var g = Gal.build(seed);
var S = 900, R = g.radius * 1.06, k = S / 2 / R;
function X(s) { return (S / 2 + s.x * k).toFixed(1); }
function Y(s) { return (S / 2 - s.y * k).toFixed(1); }
var by = {};
g.stars.forEach(function (s) { by[s.factionId || 'none'] = (by[s.factionId || 'none'] || 0) + 1; });
var dots = g.stars.map(function (s) {
  var f = g.factionById[s.factionId];
  var col = f ? f.color : '#5b6270';
  var r = s.id === g.home.id ? 6 : (f && f.capitalId === s.id) ? 5 : 2.6;
  var title = s.name + (f ? ' - ' + f.name : ' - nobody') + (s.restricted ? ' (' + s.restricted.label + ')' : '');
  return '<circle cx="' + X(s) + '" cy="' + Y(s) + '" r="' + r + '" fill="' + (f ? col : 'none') + '" stroke="' + col +
    '" stroke-width="' + (f ? 0 : 1.2) + '"><title>' + title.replace(/</g, '') + '</title></circle>';
}).join('');
var h = g.home;
var arrow = '<line x1="' + (+X(h) - 60) + '" y1="' + (+Y(h) - 60) + '" x2="' + (+X(h) - 9) + '" y2="' + (+Y(h) - 9) +
  '" stroke="#fff" stroke-width="2.5" marker-end="url(#ah)"/><text x="' + (+X(h) - 66) + '" y="' + (+Y(h) - 66) +
  '" fill="#fff" font-size="13" text-anchor="end">home</text>';
var legend = g.factions.map(function (f) {
  return '<div><span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:' + f.color + ';margin-right:6px"></span>' +
    f.name + (f.outlaw ? ' (Syndicate)' : f.minor ? ' (minor power)' : '') + ' - ' + (by[f.id] || 0) + ' systems</div>';
}).join('') + '<div><span style="display:inline-block;width:10px;height:10px;border-radius:6px;border:1.5px solid #5b6270;margin-right:6px"></span>nobody - ' + (by.none || 0) + ' empty systems</div>';
var html = '<!doctype html><meta charset=utf-8><title>Galaxy map</title><style>body{background:#0b0e14;color:#cfd6e4;font:14px system-ui;margin:14px}</style>' +
  '<h2 style="font-size:17px;margin:0 0 6px">' + seed + ': ' + g.stars.length + ' stars, ' + g.radius + ' ly radius - filled = held, hollow = nobody\'s</h2>' +
  '<div style="display:flex;gap:18px;flex-wrap:wrap"><svg width="' + S + '" height="' + S + '" style="background:#0e131c;border:1px solid #232b3a">' +
  '<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#fff"/></marker></defs>' +
  dots + arrow + '</svg><div style="min-width:240px;line-height:1.8">' + legend + '</div></div>';
fs.writeFileSync(path.join(__dirname, 'galaxy-map-' + seed.replace(/[^a-z0-9]+/gi, '-') + '.html'), html);
console.log('ok', JSON.stringify(by));
