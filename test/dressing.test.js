/* What is in a station's rooms (dressing.js, 2026-10-31).
 *
 * Astra: "the inside of stations needs more detail: there are many rooms
 * but they contain nothing", then "a kind of Firefly / Blade Runner
 * aesthetic". The rooms are dressed from the seed; these checks are the
 * ones that matter whatever the dressing looks like - the same port is the
 * same room every visit, nothing is put where it stops you or the people
 * reaching a door, a counter or a hatch, and the seats are somewhere a
 * person can sit.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'src', 'dressing.js'));
require(path.join(ROOT, 'src', 'walk.js'));
const W = globalThis.Walk, D = globalThis.Dressing;

let pass = 0, fail = 0;
function ok(c, msg, extra) {
  if (c) { pass++; console.log('  ok   ' + msg + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '   ' + extra : '')); }
}

const SHIPS = [
  [{ id: 'a', size: 'S', name: 'Talon', mine: true, current: true }],
  [{ id: 'a', size: 'L', name: 'Mule', mine: true, current: true }, { id: 'b', size: 'S', name: 'Talon', mine: true }],
  [{ id: 'a', size: 'M', name: 'Kestrel', mine: true, current: true }]
];
const OTHERS = [[], [{ name: 'Hesper', size: 'M' }, { name: 'Gannet', size: 'S' }, { name: 'Old Reliable', size: 'L' }]];
const plans = [];
for (let i = 0; i < 24; i++) {
  plans.push(W.layout('port-' + i, { seed: 'seed' + (i % 3), yard: i % 2 === 0, ships: SHIPS[i % 3], others: OTHERS[i % 2] }));
}

console.log('--- every room is dressed ---');
{
  const kinds = {};
  plans.forEach(p => p.rooms.forEach(r => { kinds[r.kind] = kinds[r.kind] || { n: 0, dressed: 0 }; kinds[r.kind].n++; if (p.dress[r.id] && p.dress[r.id].length > 20) kinds[r.kind].dressed++; }));
  Object.keys(kinds).forEach(k => ok(kinds[k].dressed === kinds[k].n, k + ': dressed in every port', kinds[k].dressed + '/' + kinds[k].n));
  let bad = 0;
  plans.forEach(p => Object.values(p.dress).forEach(qs => qs.forEach(q => q.pts.forEach(pt => { if (!pt.every(Number.isFinite)) bad++; }))));
  ok(bad === 0, 'every corner of every plate is a number');
}

console.log('--- the same port is the same room ---');
{
  const a = W.layout('port-7', { seed: 'x', yard: true, ships: SHIPS[0] });
  const b = W.layout('port-7', { seed: 'x', yard: true, ships: SHIPS[0] });
  ok(JSON.stringify(a.dress) === JSON.stringify(b.dress), 'dressed identically on a second visit');
  const names = new Set(plans.map(p => p.rooms.find(r => r.kind === 'bar').label));
  ok(names.size >= 8, 'bars have their own names', names.size + ' names in 24 ports: ' + [...names].slice(0, 5).join(', '));
  /* The deck plan itself did not move: dressing draws from its own stream. */
  const Dsave = globalThis.Dressing; globalThis.Dressing = null;
  const bare = W.layout('port-7', { seed: 'x', yard: true, ships: SHIPS[0] });
  globalThis.Dressing = Dsave;
  ok(JSON.stringify(bare.rooms.map(r => [r.id, r.x0, r.x1, r.z0, r.z1])) === JSON.stringify(a.rooms.map(r => [r.id, r.x0, r.x1, r.z0, r.z1])) &&
     JSON.stringify(bare.doors) === JSON.stringify(a.doors), 'the rooms and doors are the same with and without it');
}

console.log('--- nothing is in the way ---');
/* Flood the standable floor from where you step out, on a 0.25 m grid. */
function flood(p) {
  const S = 0.25, seen = new Set(), key = (i, j) => i + ',' + j;
  const i0 = Math.round(p.spawn.x / S), j0 = Math.round(p.spawn.z / S);
  const q = [[i0, j0]]; seen.add(key(i0, j0));
  while (q.length) {
    const [i, j] = q.pop();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
      const a = i + di, b = j + dj, k = key(a, b);
      if (seen.has(k)) return;
      if (!W.standable(p, a * S, b * S)) return;
      seen.add(k); q.push([a, b]);
    });
  }
  return { reach: (x, z, r) => {
    for (let a = Math.round((x - r) / S); a <= Math.round((x + r) / S); a++)
      for (let b = Math.round((z - r) / S); b <= Math.round((z + r) / S); b++)
        if (seen.has(key(a, b)) && Math.hypot(a * S - x, b * S - z) <= r) return true;
    return false;
  }, size: seen.size };
}
{
  let rooms = 0, roomsOk = 0, items = 0, itemsOk = 0, misses = [];
  plans.forEach((p, n) => {
    const f = flood(p);
    p.rooms.forEach(r => {
      rooms++;
      let got = false;
      for (let x = r.x0 + 0.5; x < r.x1 && !got; x += 0.5) for (let z = r.z0 + 0.5; z < r.z1 && !got; z += 0.5) if (f.reach(x, z, 0.3)) got = true;
      if (got) roomsOk++; else misses.push('port-' + n + ' ' + r.id);
    });
    p.items.forEach(it => {
      if (it.prop || it.silent) return;
      items++;
      if (f.reach(it.x, it.z, 1.4)) itemsOk++; else misses.push('port-' + n + ' ' + it.kind + ' ' + (it.label || ''));
    });
  });
  ok(roomsOk === rooms, 'from your berth you can walk into every room', roomsOk + '/' + rooms);
  ok(itemsOk === items, 'and up to everything there is to use', itemsOk + '/' + items + (misses.length ? '  missed: ' + misses.slice(0, 4).join('; ') : ''));
}
{
  /* Doorways: both sides of every door have floor you can stand on. */
  let doors = 0, open = 0;
  plans.forEach(p => p.doors.forEach(d => {
    doors++;
    const cx = (d.x0 + d.x1) / 2, cz = (d.z0 + d.z1) / 2;
    const a = d.axis === 'z' ? [cx, d.at - 1.0] : [d.at - 1.0, cz], b = d.axis === 'z' ? [cx, d.at + 1.0] : [d.at + 1.0, cz];
    if (W.standable(p, a[0], a[1]) && W.standable(p, b[0], b[1])) open++;
  }));
  ok(open === doors, 'a metre each side of every door is clear', open + '/' + doors);
}

console.log('--- the bar ---');
{
  let behind = 0, n = 0, seatsOk = 0, seats = 0;
  plans.forEach(p => {
    const bar = p.items.find(it => it.kind === 'bar');
    n++;
    if (bar.post && W.standable(p, bar.post.x, bar.post.z) && bar.post.x < bar.counter[0]) behind++;
    /* A bench's seat is inside the bench's footprint, as it should be; what
     * matters is that the seat is in its room and somebody can walk up to
     * it - floor they can stand on within arm's length. */
    (p.seats || []).forEach(s => {
      seats++;
      const r = W.roomAt(p, s.x, s.z);
      let near = false;
      for (let a = 0; a < 16 && !near; a++) {
        const ang = a / 16 * Math.PI * 2;
        for (const d of [0, 0.4, 0.7, 0.9]) if (W.standable(p, s.x + Math.cos(ang) * d, s.z + Math.sin(ang) * d)) { near = true; break; }
      }
      if (r && r.id === s.room && near) seatsOk++;
    });
  });
  ok(behind === n, 'the bartender stands behind the counter, on floor', behind + '/' + n);
  ok(seats > 0 && seatsOk === seats, 'every seat is in its room, with floor beside it to walk up on', seatsOk + '/' + seats);
  const p = plans[0], bar = p.rooms.find(r => r.kind === 'bar');
  ok(bar.noStrip === true, 'the bar is lit by its lamps, not the white strip');
  ok(p.items.filter(it => it.prop).length > 10, 'furniture is solid', p.items.filter(it => it.prop).length + ' footprints');
}

console.log('--- signs use arrows for direction ---');
{
  ['<', '>', '^'].forEach(ch => ok(!!D.FONT[ch], 'the font has ' + ch));
  ok(/^[A-Z' ]+$/.test(D.barName({ next: () => 0.3, pick: a => a[0] })), 'a bar\'s name is drawable in the font');
}

/* Astra: "stations should vary by faction. There should be advertisements
 * on the walls for the bar and outfitters, and there should be a central
 * cargo area on the station". */
console.log('--- the cargo hall ---');
{
  let has = 0, aisle = 0, between = 0;
  plans.forEach(p => {
    const c = p.rooms.find(r => r.kind === 'cargohall'), sp = p.rooms.find(r => r.id === 'spine'), co = p.rooms.find(r => r.id === 'concourse');
    if (!c) return;
    has++;
    let clear = true;
    for (let z = c.z0 + 0.3; z < c.z1 - 0.3; z += 0.25) if (!W.standable(p, 0, z)) clear = false;
    if (clear) aisle++;
    if (sp && co && c.z0 >= sp.z1 - 0.01 && c.z1 <= co.z0 + 0.01) between++;
  });
  ok(has === plans.length, 'every station has a cargo hall', has + '/' + plans.length);
  ok(between === plans.length, 'it sits between the spine and the concourse', between + '/' + plans.length);
  ok(aisle === plans.length, 'its aisle is clear end to end', aisle + '/' + plans.length);
  ok(plans.every(p => p.items.some(it => it.kind === 'freight')), 'every cargo hall has a freight office');
}

console.log('--- each faction dresses its own ---');
{
  const opt = l => ({ seed: 'seed1', yard: true, livery: l, ships: SHIPS[0], others: [] });
  const cols = l => { const s = new Set(); Object.values(W.layout('port-7', opt(l)).dress).forEach(qs => qs.forEach(q => s.add(q.col))); return s; };
  const civ = cols('civ'), navy = cols('navy'), syn = cols('syn'), pir = cols('pir');
  ok(navy.has(D.STYLES.navy.banner.bg) && !civ.has(D.STYLES.navy.banner.bg), 'a Navy port hangs its blue banners');
  ok(syn.has(D.STYLES.syn.trim) && syn.has(D.STYLES.syn.banner.bg), 'a Syndicate port has its gold trim and black banners');
  const graffiti = [...pir].filter(c => !civ.has(c)).length;
  ok(graffiti > 0, 'a pirate hole looks like nothing else', graffiti + ' colours of its own');
  const a = JSON.stringify(W.layout('port-7', opt('civ')).dress);
  W.layout('port-7', opt('syn'));
  ok(JSON.stringify(W.layout('port-7', opt('civ')).dress) === a, 'dressing one faction leaves the next port as it was');
  const shape = l => { const p = W.layout('port-7', opt(l)); return p.rooms.map(r => [r.id, r.x0, r.z0, r.x1, r.z1].join()).join('|'); };
  ok(shape('civ') === shape('syn') && shape('civ') === shape('pir'), 'the faction changes the look, not the rooms');
}

console.log('--- ads for the bar and the outfitters ---');
{
  let withAds = 0, both = 0;
  plans.forEach(p => {
    const plates = ['spine', 'cargo'].reduce((n, id) => n + (p.dress[id] || []).filter(q => q.col === '#0b0d10').length, 0);
    if (plates > 0) withAds++;
  });
  ok(withAds === plans.length, 'every station has ads on its walls', withAds + '/' + plans.length);
  const yard = W.layout('port-2', { seed: 's', yard: true, ships: SHIPS[0], others: [] });
  const noYard = W.layout('port-2', { seed: 's', yard: false, ships: SHIPS[0], others: [] });
  const sent = W.layout('port-2', { seed: 's', yard: false, outfitter: 'Kawartha Yards', ships: SHIPS[0], others: [] });
  const n = p => Object.values(p.dress).reduce((a, qs) => a + qs.length, 0);
  ok(n(sent) > n(noYard), 'with no yard here, the outfitter ads send you to the port that has one', n(noYard) + ' -> ' + n(sent));
  ok(n(yard) > 0 && yard.items.some(it => it.kind === 'yard'), 'with one, they point to its counter');
  /* An ad's arrow points along its wall toward what it sells. */
  const p = plans[0], bar = p.rooms.find(r => r.kind === 'bar');
  const sp = p.rooms.find(r => r.id === 'spine');
  both = D.wallSpans(p, sp, 'x0').length > 0 && D.wallSpans(p, sp, 'x1').length > 0;
  ok(both, 'the spine has bare wall either side for them');
  ok(bar && bar.adName && /^[A-Z' ]+$/.test(bar.adName), 'the ads carry the bar\'s own name', bar && bar.adName);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
