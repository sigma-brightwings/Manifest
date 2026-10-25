/* probe-captains.js — for tools/electron-probe.cjs: steps 4 and 5 in the
 * real shell. Are Favours and Rumours on the page, does a fresh career carry
 * their state, and does a robbery start a rumour that a port hears?
 *
 *     node tools/electron-probe.cjs tools/probe-captains.js
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat;
if (!window.Favours || !window.Rumours) return 'FAIL: Favours ' + !!window.Favours + ', Rumours ' + !!window.Rumours;
if (!Array.isArray(G.rumours)) return 'FAIL: no G.rumours on a fresh career';
const sys = G.sys;
const st = Sim.trafficState(sys.traffic[1], sys, G.t);
const spec = Combat.liftTrader(sys, st, G.t);
Combat.crime(sys, G, G.t, 'demand', spec, { say: function () {} });
const R = G.rumours[G.rumours.length - 1];
if (!R) return 'FAIL: robbery started no rumour';
const prop = window.Rumours.propagate(sys, R.origin, R.t);
const ports = Object.keys(prop).filter(function (n) { return n.charAt(0) === 'P'; });
const first = Math.min.apply(null, ports.map(function (n) { return prop[n].t - R.t; }));
await wait(1500);
return 'rumour ' + R.id + ' about ' + R.about + ' (' + R.field + ', ' + R.v + ') from ' + R.origin +
       ' · ' + ports.length + ' ports will hear, first in ' + (first / 3600).toFixed(1) + ' h · ' +
       Object.keys(R.stars).length + ' stars · hearsay pending ' + (G.hearsay || []).length;
