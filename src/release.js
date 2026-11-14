/* release.js -- which build this is, by number and by name.
 *
 * EVERY RELEASE HAS A NAME AS WELL AS A NUMBER (Astra, 2026-10-15: "why
 * don't we give each release its own name, instead of just a number. Like
 * linux distros."). The name says what a build meant, the number says
 * where it sits.
 *
 * THE NAMES ARE POLYTOPES (Astra, 2026-11-14: "our new naming convention
 * is polytopes"). They were pigeons from the rescue up to 1.3.1
 * "Clementine"; 1.4.0 "Dodecahedron" looked at the time like a one-off
 * break from the birds, and turned out to be the start of the new series
 * rather than an exception to the old one.
 *
 * It suits what the releases have become. A polytope is a thing with many
 * faces that is nonetheless one solid, which is a fair description of
 * where the game is: 1.4 was the release that gave the galaxy its third
 * dimension, and 1.5 is the one that put every face of it in a reference
 * a player can read.
 *
 * THE NUMBER STILL DOES THE WORK. electron-builder's latest.yml and the
 * save checks compare versions, and a word does not sort. So the name rides
 * alongside, never instead.
 *
 * TWO COPIES OF THE NUMBER, ONE TEST. package.json owns the version (the
 * packager reads it from there), the game cannot read package.json, so it
 * is repeated here; test/release.test.js fails the suite if the two ever
 * disagree, and the same for the name against package.json "releaseName".
 * The release notes are its section in CHANGELOG.md.
 */
(function (global) {
  var Release = {
    /* Three parts because electron-builder's latest.yml sorts on semver
     * and a two-part number does not parse as one. */
    version: '1.5.0',
    name: 'Icosahedron',
    /* 'Manifest 1.5.0 "Icosahedron"' -- the one way it is written out. */
    label: function () { return 'Manifest ' + Release.version + ' \u201c' + Release.name + '\u201d'; }
  };
  if (typeof document !== 'undefined' && document.title) document.title = Release.label();
  global.Release = Release;
  if (typeof module !== 'undefined' && module.exports) module.exports = Release;
})(typeof window !== 'undefined' ? window : globalThis);