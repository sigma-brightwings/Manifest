/* recap.test.js - "Last time on..." (recap.js, 2026-11-18).
 *
 *     node test/recap.test.js
 *
 * Pinned: the card reads only what the game already knows, through the same
 * functions the other screens use; a section with nothing to say is left
 * out; a fresh career gets no card at all; and building it changes nothing.
 */
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'crew.js'));
require(path.join(SRC, 'missions.js'));
require(path.join(SRC, 'outside.js'));
var Journal = require(path.join(SRC, 'journal.js'));
/* journal.js publishes on `this`, which under node is the module, not the
 * global: in the browser it is window and this line is what the page does. */
global.Journal = Journal;
var Recap = require(path.join(SRC, 'recap.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}

var galaxy = Galaxy.build('recap-test');
var star = galaxy.stars[0];
var sys = Gen.generateSystem(star.seed, { faction: galaxy.factionById[star.factionId], allFactions: galaxy.factions });
var ports = (sys.ports || []).filter(function (p) { return p.market; });
var planet = sys.bodies.filter(function (q) { return q.kind === 'planet'; })[0];
var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
ship.cargo = {}; ship.credits = 12345; Combat.initShip(ship); Sim.refreshShip(ship);
Sim.dockShip(ship, ports[0], sys, 0);
var G = { ship: ship, sys: sys, galaxy: galaxy, here: star, t: 5 * 86400,
          missions: [], wanted: {}, journal: [], captains: {} };

var fresh = Recap.build(G);
check('a fresh career gets no card', fresh && fresh.empty === true);
check('...but still knows where you are', /Docked at /.test(fresh.where) && fresh.where.indexOf(ports[0].name) >= 0,
      fresh.where);
check('...and the money', /12,345 cr/.test(fresh.ship), fresh.ship);

var dst = ports[1] || ports[0];
G.missions.push({ id: 'm1', text: 'Run 20t ore to ' + dst.name, toPortId: dst.id, toName: dst.name,
                  deadline: G.t + 3600 * 5, pay: 900 });
G.missions.push({ id: 'm2', text: 'Late one', toPortId: dst.id, toName: dst.name,
                  deadline: G.t - 60, pay: 100 });
G.wanted[star.factionId] = 750;
Journal.add(G, 'rescue', 'Pulled Ada off a dead tank', { t: G.t - 2 * 3600 });
var before = JSON.stringify({ m: G.missions, w: G.wanted, j: G.journal });

var r = Recap.build(G);
var heads = r.sections.map(function (s) { return s.head; });
check('not empty once there is something to say', r.empty === false);
check('contracts come first', heads[0] === 'OPEN CONTRACTS', heads.join(', '));
var flat = r.sections[0].rows.map(function (x) { return x.text; }).join(' | ');
check('the overdue contract sorts first and says OVERDUE', /^Late one/.test(r.sections[0].rows[0].text) &&
      /OVERDUE/.test(r.sections[0].rows[1].text), flat);
check('a contract carries its live distance', dst === ports[0] ? /docked here/.test(flat) : / from you/.test(flat), flat);
check('the law is named by faction', heads.indexOf('THE LAW') >= 0 &&
      /750 cr/.test(JSON.stringify(r.sections)));
check('the journal shows how long ago', /2 h ago/.test(JSON.stringify(r.sections)));
check('no favours section when nobody owes anybody', heads.indexOf('FAVOURS') < 0);
check('no people section when everyone is aboard', heads.indexOf('YOUR PEOPLE') < 0);
check('building the card changed nothing', JSON.stringify({ m: G.missions, w: G.wanted, j: G.journal }) === before);

check('ago() reads in the units a pilot uses', Recap.ago(30) === 'just now' && Recap.ago(3 * 3600) === '3 h ago' &&
      Recap.ago(3 * 86400) === '3 days ago');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
