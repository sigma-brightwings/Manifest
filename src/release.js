/* release.js -- which build this is, by number and by name.
 *
 * EVERY RELEASE HAS A NAME AS WELL AS A NUMBER (Astra, 2026-10-15: "why
 * don't we give each release its own name, instead of just a number. Like
 * linux distros."). The names are pigeons from the rescue, in no fixed
 * order -- the name says what a build meant, the number says where it sits.
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
    version: '1.1.0-beta',
    name: 'Abby',
    /* 'Manifest 1.1.0-beta "Abby"' -- the one way it is written out. */
    label: function () { return 'Manifest ' + Release.version + ' \u201c' + Release.name + '\u201d'; }
  };
  if (typeof document !== 'undefined' && document.title) document.title = Release.label();
  global.Release = Release;
  if (typeof module !== 'undefined' && module.exports) module.exports = Release;
})(typeof window !== 'undefined' ? window : globalThis);