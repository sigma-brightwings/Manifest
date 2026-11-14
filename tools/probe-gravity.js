/* The gravity slice on the planetary scanner.
 *     node tools/electron-probe.cjs tools/probe-gravity.js "Claude outputs\grav"
 */
const G = window.Game, S = window.Screens, C = window.Combat, Gr = window.Gravity;
G.title = null; G.tutorial = null; G.menu = null;
G.showHelp = false; G.showCatalogue = false;

/* Fit a gravimeter and a middling survey scanner, so some masses are
 * explained and some are not. */
function fit(id) {
  G.ship.fittings = G.ship.fittings || [];
  if (G.ship.fittings.indexOf(id) < 0) G.ship.fittings.push(id);
}

/* Find a world with something buried in it, and lock it. */
var best = null;
for (var i = 0; i < G.sys.bodies.length; i++) {
  var b = G.sys.bodies[i];
  if ((b.kind !== 'planet' && b.kind !== 'moon') || !(b.radius > 0)) continue;
  var m = window.Survey.groundMap(b, G.sys);
  if (!m) continue;
  var d = (m.deep || []).length;
  if (!best || d > best.d) best = { b: b, d: d };
}
console.log('target: ' + (best ? best.b.name + ' with ' + best.d + ' buried' : 'none'));
/* scannerTarget() reads G.navTarget, not G.lock. */
G.lock = best ? best.b : null;
G.focus = G.lock;
G.navTarget = best ? { kind: 'body', id: best.b.id } : null;

/* MODES index 11 is the hidden SCANNER page (Shift+F3). */
G.panel = 11;
await wait(200);

/* Walk the four grades on one world, one shot each. */
for (var lvl = 1; lvl <= 4; lvl++) {
  G.ship.fittings = ['gammasurvey'];
  fit(['gravI', 'gravII', 'gravIII', 'gravIV'][lvl - 1]);
  G.scanUI = { layer: 'grav', filter: 0, lines: true, style: 0, sweep: 1, zoom: 0, plane: 'xy' };
  await wait(350);
  console.log('grade ' + lvl + ': ' +
    Gr.contacts(G.lock, G.sys, lvl, 2).length + ' contacts, ' +
    Gr.contacts(G.lock, G.sys, lvl, 2).filter(function (c) { return !c.explained; }).length + ' unexplained');
  await shot('grade-' + lvl);
}

/* The three planes at the top grade. */
G.ship.fittings = ['gammasurvey', 'gravIV'];
['xy', 'yz', 'zx'].forEach(function (p) {});
for (var pi = 0; pi < 3; pi++) {
  G.scanUI.plane = ['xy', 'yz', 'zx'][pi];
  await wait(320);
  await shot('plane-' + G.scanUI.plane);
}

/* And with no gravimeter at all, which should say so rather than go blank. */
G.ship.fittings = ['gammasurvey'];
await wait(300);
await shot('no-kit');
console.log('done');
