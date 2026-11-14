/* release.js -- which build this is, by number and by name.
 *
 * EVERY RELEASE HAS A NAME AS WELL AS A NUMBER (Astra, 2026-10-15: "why
 * don't we give each release its own name, instead of just a number. Like
 * linux distros."). The names are pigeons from the rescue, in no fixed
 * order -- the name says what a build meant, the number says where it sits.
 *
 * 1.4 IS NOT A PIGEON, and that is allowed (Astra, 2026-11-13: "a break
 * from the bird names; but that's okay"). The convention is a convention,
 * not a rule, and "Dodecahedron" says what the build meant better than any
 * bird would have: it is the release where the galaxy stopped being a
 * sheet of paper and became a solid.
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
     * and "1.4" does not parse as one. 1.4.0 IS v1.4. */
    version: '1.4.0',
    name: 'Dodecahedron',
    /* 'Manifest 1.4.0 "Dodecahedron"' -- the one way it is written out. */
    label: function () { return 'Manifest ' + Release.version + ' \u201c' + Release.name + '\u201d'; }
  };
  if (typeof document !== 'undefined' && document.title) document.title = Release.label();
  global.Release = Release;
  if (typeof module !== 'undefined' && module.exports) module.exports = Release;
})(typeof window !== 'undefined' ? window : globalThis);