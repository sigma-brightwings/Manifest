# Packaging

The game is still a web page. Nothing about that changed — `index.html`
opens in a browser by double-clicking it, with no server and no build step,
exactly as it always did. What follows only wraps a window around it so it
can be handed to someone who does not want to hear the word "browser".

If `electron/` and `package.json` were deleted tomorrow, the game would
still run.

## What gets built

    dist/ProceduralSpaceGame-0.1.0-portable.exe     82 MB  one file, no install
    dist/ProceduralSpaceGame-Setup-0.1.0.exe        82 MB  Start-menu shortcut, uninstaller
    dist/ProceduralSpaceGame-0.1.0-linux-x64.tar.gz 106 MB extract, ./procedural-space-game

`tools/verify-dist.ps1` opens the tarball and checks it is whole. That is
not paranoia: a tar.gz written while an AppImage build was failing beside it
came out at 39 MB instead of 106 and looked perfectly healthy in a directory
listing. `tools/smoke-exe.ps1` launches the packaged .exe and checks it is
still standing twenty seconds later, which is the part no headless suite can
cover.

The 82 MB is Chromium. The game itself is under a megabyte of text; the
rest is the renderer that guarantees WebGL2, canvas 2D and `localStorage`
behave on the recipient's machine the same way they behave here. That was
the trade accepted when the shell was chosen — the alternative shells are
a tenth the size and borrow the machine's own web engine, which is exactly
the variable this removes.

## Building

    npm install          once
    npm run dist:win     both Windows artifacts
    npm run dist:linux   the Linux tarball
    npm start            run the shell without packaging, for iteration

`npm test` still runs all nine suites and does not need any of this.

### Why there is no AppImage from here

An AppImage is a mounted filesystem image: it needs real symlinks and Unix
permission bits, neither of which a Windows filesystem can create. The build
fails at exactly that step and no flag fixes it. The tarball is the
cross-platform answer and it runs fine.

For a proper `.AppImage` and `.deb`, `.github/workflows/build.yml` builds
them on a Linux runner. Push a tag beginning with `v` and every artifact
lands together on a draft release.

## Two things to tell whoever you send it to

**Windows will warn on first run.** The binaries are unsigned, so SmartScreen
shows "Windows protected your PC" and the way past it is *More info → Run
anyway*. This is not fixable with a setting: it needs a code signing
certificate, which is bought annually per publisher. Worth doing if this
ever goes further than friends; not worth it before then.

**Saves are per machine.** A career lives in the shell's own storage, under
the same origin every build shares, so updating the game keeps the save. It
does not travel between computers, and it is separate from the save the same
seed has in a browser.

## How the shell works, briefly

`electron/main.js` opens a full-screen window and serves the game's own
files over a registered `game://` scheme. It is served rather than loaded
from disk because Chromium gives `file://` an opaque origin, where
`localStorage` is unreliable and `history.replaceState` throws — the two
things the game leans on for the career and for the seed in the URL. A
registered standard scheme is a real origin, so both work, and the origin
is identical in every build, which is what lets a save survive an update.

The renderer gets no Node and no preload. The game wants a canvas, a clock
and a key or two; it has never wanted a filesystem.

`F11` leaves full screen. `F12` opens the developer tools. The application
menu is removed on purpose — its default accelerators would have eaten
F1–F10, which are the instrument pages.
