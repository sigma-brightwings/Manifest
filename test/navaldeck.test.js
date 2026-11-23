/* navaldeck.test.js — the decks of the large ships (2026-11-23).
 *
 *     node test/navaldeck.test.js
 *
 * Astra: "use the precedent of US naval ships of the post WW2 era for the
 * multi-deck layout. I want there to be multiple ways to connect up those
 * decks and rooms", and "all large size ships need multiple decks and
 * different rooms, larger reactor rooms". See claude/naval-decks.md.
 *
 * What it holds, for every large hull:
 *   - more than one deck, each clear of the one above it;
 *   - no two rooms on a deck in the same space;
 *   - every room reachable from the airlock and from the bridge, at sea
 *     AND at general quarters, and there is more than one way to the
 *     places that matter;
 *   - general quarters shuts real routes on a navy hull (and none on a
 *     merchant one), and you get round by scuttle, trunk, lift or tram;
 *   - below the damage-control deck no door passes a main bulkhead;
 *   - the ladder rule: up and forward to starboard, down and aft to port,
 *     and a crewman's route keeps it;
 *   - compartment numbers in the Navy's form, odd to starboard, even to
 *     port, frames rising aft;
 *   - reactor rooms: two on the Capital and the Carrier, the military core
 *     lying down, the civilian standing, the glass on the wall to control,
 *     the reactor reached only through control or by its trunk;
 *   - the same hull is the same ship every time.
 */
global.window = global.window || global;
var N = require('../src/navaldeck.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function byId(p, id) { return p.rooms.filter(function (r) { return r.id === id; })[0]; }
function count(o) { return Object.keys(o).length; }

var HULLS = N.hulls();
var plans = {};
HULLS.forEach(function (h) { plans[h] = N.layout(h, {}); });
var NAVY = ['capital', 'carrier'], MERCHANT = ['meridian', 'leviathan'];

console.log('--- decks ---');
check('every large hull has a layout', HULLS.every(function (h) { return !!plans[h]; }), HULLS.join(','));
check('every large hull has more than one deck', HULLS.every(function (h) { return plans[h].decks.length >= 2; }),
      HULLS.map(function (h) { return h + ' ' + plans[h].decks.length; }).join(', '));
var stacked = [];
HULLS.forEach(function (h) {
  var d = plans[h].decks.slice().sort(function (a, b) { return a.y - b.y; });
  for (var i = 0; i + 1 < d.length; i++) {
    if (d[i].y + d[i].h > d[i + 1].y - N.SLAB + 1e-6) stacked.push(h + ' ' + d[i].id + '/' + d[i + 1].id);
  }
});
check('each deck\'s ceiling is a deck\'s thickness under the floor above', !stacked.length, stacked.join(' '));
check('the Capital is numbered as a US cruiser: 1, 2, 3, 4 below, 03 above',
      ['1', '2', '3', '4', '03'].every(function (n) { return plans.capital.decks.some(function (d) { return d.num === n; }); }));
var cd = {}; plans.carrier.decks.forEach(function (d) { cd[d.num] = d; });
check('the Carrier: hangar is deck 1, gallery 03, the island base 04 at the flight deck',
      cd['1'] && cd['1'].role === 'hangar' && cd['03'] && cd['04'] && cd['03'].y < cd['04'].y && cd['1'].y < cd['03'].y);
check('the Carrier\'s hangar is tall (7.6 m) and in three bays',
      cd['1'].h >= 7 && plans.carrier.rooms.filter(function (r) { return r.kind === 'hangar'; }).length === 3);
check('merchant hulls have lettered decks, not the Navy\'s',
      MERCHANT.every(function (h) { return plans[h].decks.every(function (d) { return !/^\d/.test(d.num); }); }));

console.log('--- rooms ---');
var overl = [];
HULLS.forEach(function (h) {
  var rs = plans[h].rooms.filter(function (r) { return !r.within; });
  for (var i = 0; i < rs.length; i++) for (var j = i + 1; j < rs.length; j++) {
    var a = rs[i], b = rs[j];
    if (a.deck !== b.deck) continue;
    if (a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6) overl.push(h + ' ' + a.id + '~' + b.id);
  }
});
check('no two rooms on a deck share space', !overl.length, overl.slice(0, 4).join(' '));
check('every link joins two rooms that exist', HULLS.every(function (h) {
  return plans[h].links.every(function (l) { return byId(plans[h], l.a) && byId(plans[h], l.b); });
}));
check('the Capital has a CIC under her bridge, the Carrier a flag plot',
      plans.capital.rooms.some(function (r) { return r.kind === 'cic'; }) && plans.carrier.rooms.some(function (r) { return r.kind === 'flagplot'; }));
check('the Carrier\'s gallery deck has ready rooms and her CIC',
      plans.carrier.rooms.some(function (r) { return r.deck === '03' && r.kind === 'ready'; }) &&
      plans.carrier.rooms.some(function (r) { return r.deck === '03' && r.kind === 'cic'; }));
check('the Capital carries missile magazines on her 3rd deck, fore and aft',
      plans.capital.rooms.filter(function (r) { return r.deck === '3' && r.kind === 'magazine'; }).length === 2);
check('the damage-control deck has DC central and a sick bay', NAVY.every(function (h) {
  return plans[h].rooms.some(function (r) { return r.deck === '2' && r.kind === 'dccentral'; }) &&
         plans[h].rooms.some(function (r) { return r.deck === '2' && r.kind === 'sickbay'; });
}));
check('the Meridian\'s A deck ends aft of the waist in her hull, up the stairs from B',
      plans.meridian.rooms.filter(function (r) { return r.deck === 'A'; }).every(function (r) { return r.z1 <= N.NAVAL.meridian.z1 - 9.2 + 1e-6; }) &&
      plans.meridian.links.some(function (l) { return l.type === 'stair' && plans.meridian.rooms.some(function (r) { return r.id === l.b && r.deck === 'A'; }); }));
check('the Meridian has passenger decks: cabins, a lounge, a dining saloon',
      ['cabin', 'lounge', 'dining'].every(function (k) { return plans.meridian.rooms.some(function (r) { return r.kind === k; }); }));
check('the Carrier\'s airlock is in her starboard sponson, off a hangar bay', (function () {
  var c = plans.carrier, lock = byId(c, c.airlock);
  var l = c.links.filter(function (x) { return x.a === lock.id || x.b === lock.id; })[0];
  var other = byId(c, l.a === lock.id ? l.b : l.a);
  return lock.deck === '1' && lock.x0 >= c.cx + c.hw && other.kind === 'hangar';
})());

console.log('--- getting there ---');
var unreach = [];
HULLS.forEach(function (h) {
  var p = plans[h];
  ['normal', 'zebra'].forEach(function (cond) {
    [p.airlock, p.bridge].forEach(function (from) {
      var seen = N.reachable(p, from, cond);
      var miss = p.rooms.filter(function (r) { return r.walk !== false && !seen[r.id]; });
      if (miss.length) unreach.push(h + ' ' + cond + ' from ' + byId(p, from).kind + ': ' + miss.slice(0, 3).map(function (r) { return r.id; }).join(','));
    });
  });
});
check('every room is reachable from the airlock and the bridge, at sea and at general quarters', !unreach.length, unreach.slice(0, 3).join(' | '));
var kinds = {};
HULLS.forEach(function (h) { plans[h].links.forEach(function (l) { kinds[l.type] = 1; }); });
check('the ways between decks are all there: ladders, scuttles, trunks, the lift, the tram, stairs',
      ['ladder', 'scuttle', 'trunk', 'lift', 'tram', 'stair', 'wtdoor', 'curtain'].every(function (k) { return kinds[k]; }), Object.keys(kinds).join(','));
/* More than one way: for each room that matters, two routes to its door
 * that share no link, so no one door or hatch on the way can cut it off. */
function twoWays(p, from, to) {
  var r1 = N.route(p, from, to); if (!r1) return false;
  /* A dead-end room's own door is the one way through its own wall (the
   * airlock has one door, the room inside it two): every step between the
   * first room with a choice and the target's own door must have another
   * way round. */
  var deg = {};
  p.links.forEach(function (l) { deg[l.a] = (deg[l.a] || 0) + 1; deg[l.b] = (deg[l.b] || 0) + 1; });
  var steps = r1.steps.slice(0, -1), i = 0;
  if (deg[from] <= 2) { while (i < steps.length && deg[steps[i].room] <= 2) i++; i++; }
  var used = {}; steps.slice(i).forEach(function (s) { used[s.link.id] = 1; });
  var saved = p.links; p.links = saved.filter(function (l) { return !used[l.id]; });
  var r2 = N.route(p, from, to); p.links = saved;
  return !!r2;
}
var single = [];
HULLS.forEach(function (h) {
  var p = plans[h];
  p.rooms.filter(function (r) { return r.kind === 'reactorctl' || r.kind === 'engine' || r.kind === 'dccentral' || r.kind === 'sickbay'; })
    .forEach(function (r) { if (!twoWays(p, p.airlock, r.id)) single.push(h + ' ' + r.kind); });
});
check('engine rooms, reactor control, DC central and sick bay each have two separate ways in', !single.length, single.join(', '));

console.log('--- general quarters ---');
NAVY.forEach(function (h) {
  var p = plans[h];
  var z = p.links.filter(function (l) { return l.fit === 'Z'; }).length;
  check(h + ': general quarters dogs real fittings', z > 10, z + ' Zebra fittings');
  /* Bow to stern along the damage-control deck: further at general
   * quarters, because the passage doors in the main bulkheads are shut. */
  var dcP = p.rooms.filter(function (r) { return r.deck === '2' && r.kind === 'passage' && r.side === 1; })
                  .sort(function (a, b) { return a.z0 - b.z0; });
  var a = dcP[0], b = dcP[dcP.length - 1];
  var rn = N.route(p, b.id, a.id, { cond: 'normal' }), rz = N.route(p, b.id, a.id, { cond: 'zebra' });
  check(h + ': forward to aft along the 2nd deck takes longer at GQ, by another way', rn && rz && rz.cost > rn.cost + 5,
        rn && rz ? Math.round(rn.cost) + ' m vs ' + Math.round(rz.cost) + ' m' : 'no route');
  var used = rz ? rz.steps.map(function (s) { return s.link.type; }) : [];
  check(h + ': ...and that way goes over a deck by scuttle, trunk, lift or tram',
        used.some(function (t) { return t === 'scuttle' || t === 'trunk' || t === 'lift' || t === 'tram'; }), used.filter(function (t) { return t !== 'door'; }).join(' '));
  check(h + ': every passage door in a main bulkhead of the 2nd deck is Zebra',
        p.links.filter(function (l) { return l.type === 'wtdoor' && byId(p, l.a).deck === '2'; }).every(function (l) { return l.fit === 'Z'; }));
  check(h + ': every Zebra hatch over a ladder has a scuttle in it, which stays open',
        p.links.filter(function (l) { return l.type === 'ladder' && l.fit === 'Z'; }).every(function (l) {
          return p.links.some(function (s) { return s.type === 'scuttle' && s.of === l.id && N.passable(s, 'zebra'); });
        }));
});
check('merchant hulls have no Zebra condition: nothing shuts at GQ', MERCHANT.concat(['kestrel', 'longhaul', 'tanker']).every(function (h) {
  return plans[h].links.every(function (l) { return l.fit !== 'Z'; });
}));
check('a merchant\'s watertight doors close on damage', (function () {
  var p = plans.meridian, d = p.links.filter(function (l) { return l.fit === 'D'; });
  if (!d.length) return false;
  var shut = d.map(function (l) { return l.id; });
  /* With every damage door shut, the stairs still reach every room. */
  var seen = N.reachable(p, p.airlock, 'normal', shut);
  return p.rooms.every(function (r) { return seen[r.id]; });
})());
(function () {
  /* The tram at GQ: battery, half speed; out under 40 % hull. */
  var p = plans.capital, tr = p.links.filter(function (l) { return l.type === 'tram'; })[0];
  var rn = N.route(p, tr.a, tr.b, { cond: 'normal' }), rz = N.route(p, tr.a, tr.b, { cond: 'zebra', hull: 1 });
  var tn = rn.steps.some(function (s) { return s.link.type === 'tram'; }), tz = rz.steps.some(function (s) { return s.link.type === 'tram'; });
  check('at GQ the tram runs on battery at half speed', tn && tz && rz.cost > rn.cost * 1.5, Math.round(rn.cost) + ' m vs ' + Math.round(rz.cost) + ' m');
  check('with the hull under 40 % at GQ the tram is out', N.passable(tr, 'zebra', null, 0.39) === false &&
        N.passable(tr, 'zebra', null, 0.4) === true &&
        /* and a ship at 20 % is at GQ by herself (GQ_BELOW), so out too */
        N.passable(tr, 'normal', null, 0.2) === false);
  var miss = [];
  NAVY.concat(['leviathan']).forEach(function (h) {
    var q = plans[h], seen = N.reachable(q, q.airlock, 'zebra', null, 0.3);
    q.rooms.forEach(function (r) { if (r.walk !== false && !seen[r.id]) miss.push(h + ' ' + r.id); });
  });
  check('with the tram out at GQ, every room is still reachable', !miss.length, miss.slice(0, 3).join(' '));
  var ro = N.route(p, tr.a, tr.b, { cond: 'zebra', hull: 0.3 });
  check('...and the way aft goes over the top instead', ro && !ro.steps.some(function (s) { return s.link.type === 'tram'; }),
        ro ? Math.round(ro.cost) + ' m' : 'none');
})();
check('the lift and the tram run at general quarters',
      NAVY.every(function (h) { return plans[h].links.filter(function (l) { return l.type === 'lift' || l.type === 'tram'; }).every(function (l) { return N.passable(l, 'zebra'); }); }));

console.log('--- bulkheads ---');
var pierced = [];
NAVY.forEach(function (h) {
  var p = plans[h], dcY = p.decks.filter(function (d) { return d.id === p.dc; })[0].y;
  p.links.forEach(function (l) {
    if (l.type !== 'wtdoor' && l.type !== 'door') return;
    var a = byId(p, l.a), b = byId(p, l.b);
    if (a.y0 >= dcY || a.deck !== b.deck) return;
    p.bulkheads.forEach(function (bh) {
      var spans = (a.z0 < bh.z && a.z1 <= bh.z + 1e-6 && b.z0 >= bh.z - 1e-6) || (b.z0 < bh.z && b.z1 <= bh.z + 1e-6 && a.z0 >= bh.z - 1e-6);
      if (spans) pierced.push(h + ' ' + l.id);
    });
  });
});
check('below the damage-control deck, no door passes a main bulkhead', !pierced.length, pierced.join(' '));
check('the main bulkheads carry frame numbers, rising aft', NAVY.every(function (h) {
  var b = plans[h].bulkheads.slice().sort(function (x, y) { return y.z - x.z; });
  return b.length > 4 && b.every(function (x, i) { return i === 0 || x.frame > b[i - 1].frame; });
}));

console.log('--- ladders ---');
var bad = [];
HULLS.forEach(function (h) {
  plans[h].links.forEach(function (l) {
    if (l.type !== 'ladder' && l.type !== 'stair') return;
    if (l.side > 0 && l.rule !== 'up') bad.push(h + ' ' + l.id + ' stbd ' + l.rule);
    if (l.side < 0 && l.rule !== 'down') bad.push(h + ' ' + l.id + ' port ' + l.rule);
    if (!(l.headZ > l.footZ)) bad.push(h + ' ' + l.id + ' head not forward');
  });
});
check('up and forward to starboard, down and aft to port: every ladder head forward', !bad.length, bad.slice(0, 3).join(' '));
check('ladders come in pairs at the ladder stations', NAVY.every(function (h) {
  var p = plans[h], pairs = {};
  p.links.forEach(function (l) {
    if (l.type !== 'ladder' || !l.station) return;
    var a = byId(p, l.a), b = byId(p, l.b);
    var k = a.deck + '/' + b.deck + '/' + Math.round(l.z); pairs[k] = (pairs[k] || 0) + (l.side > 0 ? 1 : 10);
  });
  return count(pairs) >= 3 && Object.keys(pairs).every(function (k) { return pairs[k] === 11; });
}));
/* A crewman going up from the 2nd deck to the main deck takes the
 * starboard ladder; coming down, the port one. */
(function () {
  var p = plans.capital;
  var lo = p.rooms.filter(function (r) { return r.deck === '2' && r.kind === 'cross'; })[3];
  var hi = p.rooms.filter(function (r) { return r.deck === '1' && r.kind === 'cross'; })[3];
  var up = N.route(p, lo.id, hi.id), down = N.route(p, hi.id, lo.id);
  var lu = up.steps.filter(function (s) { return s.link.type === 'ladder'; })[0];
  var ld = down.steps.filter(function (s) { return s.link.type === 'ladder'; })[0];
  check('a crewman going up takes a starboard ladder, coming down a port one', lu && ld && lu.link.side > 0 && ld.link.side < 0,
        (lu ? lu.link.side : '-') + ' / ' + (ld ? ld.link.side : '-'));
})();

console.log('--- compartment numbers ---');
var badc = [];
NAVY.forEach(function (h) {
  var p = plans[h];
  p.rooms.forEach(function (r) {
    if (!/^(0\d|\d)-\d+-\d+-[A-Z]$/.test(r.comp)) badc.push(r.id + ' ' + r.comp);
    var off = (r.x0 + r.x1) / 2 - p.cx;
    if (off > 0.75 && r.pos % 2 !== 1) badc.push(r.id + ' stbd ' + r.comp);
    if (off < -0.75 && (r.pos === 0 || r.pos % 2 !== 0)) badc.push(r.id + ' port ' + r.comp);
    if (Math.abs(off) <= 0.75 && r.pos !== 0) badc.push(r.id + ' centre ' + r.comp);
  });
});
check('every compartment is numbered deck-frame-position-use, odd to starboard, even to port', !badc.length, badc.slice(0, 3).join(' '));
check('the use letters are the Navy\'s: E machinery, M magazines, L living, C control', (function () {
  var c = plans.capital.rooms, f = function (k) { return c.filter(function (r) { return r.kind === k; })[0].comp.slice(-1); };
  return f('engine') === 'E' && f('magazine') === 'M' && f('berthing') === 'L' && f('dccentral') === 'C';
})());
var dup = [];
NAVY.forEach(function (h) {
  var s = {}; plans[h].rooms.forEach(function (r) { if (s[r.comp]) dup.push(h + ' ' + r.comp); s[r.comp] = 1; });
});
check('no two compartments share a number', !dup.length, dup.slice(0, 3).join(' '));

console.log('--- reactors ---');
check('every large hull has a reactor room', HULLS.every(function (h) { return plans[h].reactors.length >= 1; }));
check('the Capital has two reactors, as Long Beach did; the Carrier two', plans.capital.reactors.length === 2 && plans.carrier.reactors.length === 2);
check('military cores lie down, rods from the front: Capital, Carrier, Cutter',
      ['capital', 'carrier', 'cutter'].every(function (h) { return plans[h].reactors.every(function (r) { return r.axis === 'h' && r.rods.face === 'fwd'; }); }));
check('civilian cores stand, rods from the top', ['meridian', 'leviathan', 'kestrel', 'longhaul', 'tanker', 'crawler'].every(function (h) {
  return plans[h].reactors.every(function (r) { return r.axis === 'v' && r.rods.face === 'top'; });
}));
check('a Navy or Syndicate Crawler has the military reactor', ['crawler_navy', 'crawler_syndicate'].every(function (lib) {
  return N.layout('crawler', { libId: lib }).reactors[0].axis === 'h';
}) && N.layout('crawler', { libId: 'crawler_civilian' }).reactors[0].axis === 'v');
var rbad = [];
HULLS.forEach(function (h) {
  var p = plans[h];
  p.reactors.forEach(function (rx) {
    var room = byId(p, rx.room), ctl = byId(p, rx.control);
    /* The glass is in the wall between them. */
    if (Math.abs(rx.window.z - (room.z1 + ctl.z0) / 2) > 0.2) rbad.push(h + ' window not between');
    if (!(rx.window.x0 >= room.x0 && rx.window.x1 <= room.x1 && rx.window.y1 <= room.y1)) rbad.push(h + ' window outside');
    /* The core and its jacket inside her room. */
    if (rx.core.z - rx.jacket < room.z0 - 0.5) rbad.push(h + ' core aft of room');
    /* Into the reactor: through control's X door, or up her trunk. */
    var ways = p.links.filter(function (l) { return l.a === room.id || l.b === room.id; });
    if (!ways.every(function (l) { return (l.reactorDoor && l.fit === 'X') || l.type === 'trunk'; })) rbad.push(h + ' other way in');
    if (!ways.some(function (l) { return l.type === 'trunk'; })) rbad.push(h + ' no trunk');
  });
});
check('the glass is in the wall to reactor control; the reactor is entered only from control or by her trunk', !rbad.length, rbad.join(', '));
check('a large ship\'s reactor room is bigger than a small one\'s', (function () {
  var area = function (h) { var r = byId(plans[h], plans[h].reactors[0].room); return (r.x1 - r.x0) * (r.z1 - r.z0); };
  return area('capital') > area('kestrel') * 2 && area('carrier') > area('cutter') * 2;
})());

console.log('--- fitted to her (stage 2) ---');
(function () {
  var opts = { bridgeY: -0.9, mainY: -43.0, mergeDeck: '1', lift: { x: 0, z: -9 }, noAirlock: true,
               join: { x: -2.5, z: -30, axis: 'x' } };
  var f = N.layout('capital', opts), d = {};
  f.decks.forEach(function (k) { d[k.id] = k; });
  check('fitted: her airlock deck lands on her own main deck, the stack with it', Math.abs(d['1'].y + 43.0) < 1e-6 &&
        Math.abs((d['2'].y - d['1'].y) - (-45.6 + 42.5)) < 1e-6 && Math.abs(d['03'].y - (-6.0 + 0.3)) < 1e-6);
  check('fitted: no landing of its own on her airlock deck', !f.rooms.some(function (r) { return r.kind === 'landing' && r.deck === '1'; }));
  check('fitted: landings line up with her lift car', f.rooms.filter(function (r) { return r.kind === 'landing'; })
        .every(function (r) { return Math.abs((r.z0 + r.z1) / 2 + 9) < 1e-6 && Math.abs((r.x0 + r.x1) / 2) < 1e-6; }));
  var j = f.join, jr = f.rooms.filter(function (r) { return r.id === j.room; })[0];
  check('fitted: a passage from her own deck\'s wall to the band', jr && jr.deck === '1' && jr.x1 <= -2.5 && jr.x0 >= f.cx + f.hw,
        jr ? jr.x0.toFixed(1) + '..' + jr.x1.toFixed(1) : 'none');
  var seen = N.reachable(f, j.room, 'zebra');
  check('fitted: from that passage, every room at general quarters', f.rooms.every(function (r) { return r.walk === false || seen[r.id] || r.kind === 'landing' || r.kind === 'stub'; }));
  var m = N.layout('meridian', { mergeDeck: 'B', mainY: -5.2, z1: -24, lift: { x: 0, z: -9 }, noAirlock: true, join: { x: 0, z: -23.6, axis: 'z' } });
  var mz = m.rooms.filter(function (r) { return r.kind !== 'landing' && r.kind !== 'lobby' && r.kind !== 'stub'; });
  check('fitted: a merchant\'s band stays aft of her own airlock deck', mz.every(function (r) { return r.z1 <= -24 + 1e-6; }));
  check('fitted: the tram runs in her trunk, not through her bulkheads', ['capital', 'carrier'].every(function (h) {
    var p = plans[h], way = p.rooms.filter(function (r) { return r.kind === 'tramway'; })[0];
    return way && way.walk === false && p.rooms.every(function (r) {
      return r === way || r.deck !== way.deck || !(r.x0 < way.x1 && way.x0 < r.x1 && r.z0 < way.z1 && way.z0 < r.z1);
    });
  }));
})();

console.log('--- GQ on damage ---');
/* Astra: "if the ship's hull is below 75% the ship automatically goes to GQ". */
check('a hull under 75 % is at GQ whatever was ordered',
      N.condAt('normal', 0.74) === 'zebra' && N.condAt(undefined, 0.5) === 'zebra');
check('at 75 % and over, the order stands', N.condAt('normal', 0.75) === 'normal' && N.condAt('zebra', 1) === 'zebra' &&
      N.condAt('normal') === 'normal');
(function () {
  var p = plans.capital, z = p.links.filter(function (l) { return l.fit === 'Z'; })[0];
  check('a Z fitting is dogged on a damaged ship even if nobody called GQ', !!z &&
        N.passable(z, 'normal', null, 1) && !N.passable(z, 'normal', null, 0.6), z && z.id);
  var tr = p.links.filter(function (l) { return l.type === 'tram'; })[0];
  check('...and the tram is out under 40 % with nobody calling GQ', !!tr &&
        N.passable(tr, 'normal', null, 0.5) && !N.passable(tr, 'normal', null, 0.3));
  var atSea = N.reachable(p, p.airlock || p.bridge, 'normal', null, 1);
  var hurt = N.reachable(p, p.airlock || p.bridge, 'normal', null, 0.6);
  var gq = N.reachable(p, p.airlock || p.bridge, 'zebra', null, 1);
  check('a ship at 60 % reaches what a ship at GQ reaches', JSON.stringify(Object.keys(hurt).sort()) === JSON.stringify(Object.keys(gq).sort()) &&
        Object.keys(atSea).length >= Object.keys(hurt).length);
})();

console.log('--- the same ship ---');
check('the same hull is laid out the same every time', HULLS.every(function (h) {
  return JSON.stringify(N.layout(h, {}).rooms) === JSON.stringify(plans[h].rooms) &&
         JSON.stringify(N.layout(h, {}).links) === JSON.stringify(plans[h].links);
}));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
