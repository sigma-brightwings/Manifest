/* probe-portraits.js - the turning item and hull portraits (2026-11-18).
 * Astra: the Medical supplies crate turning in the market card had a black
 * triangle cut into its face; "probably all rotating items have this bug".
 * Draws a strip of items at six angles each, and two hulls, onto a canvas
 * laid over the game, through the same Render calls the cards use.
 *
 *     node tools/electron-probe.cjs tools/probe-portraits.js
 */
const R = window.Render;
const ids = ['good_medical', 'good_alloys', 'good_livestock', 'con_slugs', 'eq_laserI', 'mod_reactor'];
const known = Object.keys(window.ItemModels || {});
const pick = ids.map(id => known.includes(id) ? id : known.find(k => k.startsWith(id.split('_')[0] + '_'))).filter(Boolean);
const S = 150, cols = 6;
const cv = document.createElement('canvas');
cv.width = S * cols; cv.height = S * (pick.length + 1);
cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#0b0f16';
document.body.appendChild(cv);
const c = cv.getContext('2d');
const used = [];
pick.forEach((id, row) => {
  for (let k = 0; k < cols; k++) R.drawItemPortrait(c, k * S, row * S, S, id, k * Math.PI / 3 + 0.2);
  used.push(id);
});
const hulls = ['talon', 'mule'];
hulls.forEach((h, k) => R.drawHullPortrait(c, k * S * 3, pick.length * S, S * 3, S, h, 0.8 + k, null, null));
await wait(400);
await shot('portraits');
cv.remove();
return 'items ' + used.join(', ');
