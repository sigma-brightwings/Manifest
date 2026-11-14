/* All fourteen port patterns turning in their cards, and what they cost.
 *     node tools/electron-probe.cjs tools/probe-portmodels.js "Claude outputs\portmodels"
 *
 * The decimation exists for one reason: the catalogue repaints every frame
 * and a station's shell is up to 54,868 triangles. So the number that
 * matters is not how it looks, it is how long a frame takes with one of
 * these on the card - measured on the machine the game is built for.
 */
const G = window.Game, S = window.Screens, R = window.Render;
G.panel = 0; G.tutorial = null; G.showHelp = false; G.menu = null; G.title = null;
G.showCatalogue = true;
G.catalogue = { group: 0, sel: 0, scroll: 0 };
await wait(400);

const gs = S.catGroups();
const pi = gs.findIndex(g => g.id === 'ports');
if (pi < 0) return 'FAIL: no PORTS tab';
const ports = gs[pi].items;

/* First look at each: this is where the lazy geometry fetch lands. */
log('pattern'.padEnd(18) + 'shell'.padStart(7) + 'portrait'.padStart(9) +
    'first ms'.padStart(9) + '  then ms/frame');
let worstFirst = 0, worstFrame = 0, bad = [];
for (let i = 0; i < ports.length; i++) {
  const e = ports[i];
  G.catalogue.group = pi; G.catalogue.sel = i; G.catalogue.scroll = Math.max(0, i - 6);

  const t0 = performance.now();
  const mesh = R.portPortraitMesh(e.portKey);
  const first = performance.now() - t0;

  const lib = R.libPort(e.portKey);
  const shellF = (lib && lib.shell && lib.shell.f.length) || 0;

  /* Paint it ten times into an offscreen canvas at the card's real size
   * and take the median, which is what a frame of the page costs. */
  let ms = 0;
  if (mesh) {
    const cv = document.createElement('canvas');
    cv.width = 430; cv.height = 430;
    const c2 = cv.getContext('2d');
    const runs = [];
    for (let k = 0; k < 10; k++) {
      const a = performance.now();
      R.drawPortPortrait(c2, 0, 0, 430, e.portKey, k * 0.3);
      runs.push(performance.now() - a);
    }
    runs.sort((x, y) => x - y);
    ms = runs[5];
  }
  if (first > worstFirst) worstFirst = first;
  if (ms > worstFrame) worstFrame = ms;
  if (!mesh) bad.push(e.name);
  log(e.name.padEnd(18) + String(shellF).padStart(7) +
      String(mesh ? mesh.f.length : 0).padStart(9) +
      first.toFixed(0).padStart(9) + '  ' + ms.toFixed(2));

  await wait(260);
  await shot('p-' + e.id.replace('port-', ''));
}
log('');
log('worst first look: ' + worstFirst.toFixed(0) + ' ms   worst frame: ' + worstFrame.toFixed(2) + ' ms');
log(bad.length ? 'NO MODEL: ' + bad.join(', ') : 'every pattern drew');
return 'ok';
