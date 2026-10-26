/* probe-mouselook.js — for tools/electron-probe.cjs: the pointer is captured
 * when you get up out of the seat, let go for an F-screen and the menu, and
 * captured again when you come back (2026-10-25).
 *
 *     node tools/electron-probe.cjs tools/probe-mouselook.js "Claude outputs\mouselook"
 */
const G = window.Game;
G.title = null; G.panel = 0;
const cv = document.getElementById('view');
const locked = () => document.pointerLockElement === cv;
const out = [];
await wait(800);
G.viewMode = 'cockpit';
await wait(500);
out.push('seated: locked=' + locked());
await key('o');
await wait(800);
out.push('on foot: walking=' + !!G.walk + ' locked=' + locked());
await key('F5');
await wait(600);
out.push('F5 screen: locked=' + locked());
await key('F1');
await wait(600);
out.push('back to F1: walking=' + !!G.walk + ' locked=' + locked());
await shot('mouselook-on-foot');
return out.join('\n');
