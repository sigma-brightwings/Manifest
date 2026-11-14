/* The galaxy chart, turned.
 *     node tools/electron-probe.cjs tools/probe-chart3d.js "Claude outputs\chart3d"
 */
const G = window.Game, S = window.Screens;
G.title = null; G.tutorial = null; G.menu = null;
G.showHelp = false; G.showCatalogue = false;
G.panel = 5;                       // F6 GALAXY
await wait(500);

function view() { return G.starMap && G.starMap.view; }
console.log('view: ' + JSON.stringify(view()));

/* Level, as it has always looked. */
S.chart.level(view());
await wait(300);
await shot('01-level');

/* Tilted to the default, then further, at true scale. */
view().el = S.chart.EL_DEFAULT;
await wait(300);
await shot('02-default-tilt');

view().el = 35 * Math.PI / 180;
await wait(300);
await shot('03-tilt-35');

view().el = S.chart.EL_MIN;
await wait(300);
await shot('04-edge-on');

/* The same tilt with the height exaggerated - the wafer problem. */
view().el = 35 * Math.PI / 180;
[1, 2, 3, 5].forEach(function () {});
for (var k = 0; k < 4; k++) {
  view().depth = S.chart.DEPTHS[k];
  await wait(280);
  await shot('05-depth-x' + S.chart.DEPTHS[k]);
}

/* And turned about, to show it is a solid thing and not a picture. */
view().depth = 3;
for (var y = 0; y < 4; y++) {
  view().yaw = y * Math.PI / 2;
  await wait(280);
  await shot('06-yaw-' + (y * 90));
}

/* The projection must agree with itself: screen -> galaxy -> screen. */
var plot = S.chartPlot();
var xf = S.chart.xf(view(), plot);
var worst = 0;
for (var i = 0; i < G.galaxy.stars.length; i += 7) {
  var st = G.galaxy.stars[i];
  var f = S.chart.floor(xf, st);
  var back = S.chart.toGalaxy(xf, f.x, f.y);
  var e = Math.hypot(back.x - st.x, back.y - st.y);
  if (e > worst) worst = e;
}
console.log('floor round-trip worst error: ' + worst.toExponential(2) + ' ly');
console.log('done');
