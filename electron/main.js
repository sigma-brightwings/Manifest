/* main.js — the Electron shell.
 *
 * This file adds a window around the game and nothing else. The game itself
 * is untouched: index.html and src/*.js still run by double-clicking
 * index.html in a browser, exactly as before, and this shell loads the very
 * same files. If this directory were deleted the game would still work.
 *
 * Two decisions worth the words:
 *
 * The files are served over a custom `game://` scheme rather than loaded
 * from file://. Chromium treats file:// as an opaque origin: localStorage
 * is unreliable there and history.replaceState throws, which would cost the
 * save system and the seed-in-the-URL trick — the two things the game keeps
 * outside its own memory. A registered standard scheme is a real origin, so
 * both work, and the origin stays the same across every build and update,
 * which is what makes a save survive a new version.
 *
 * There is no preload and no Node in the renderer. The game asks the
 * platform for a canvas, a clock and localStorage; it has never wanted a
 * file system. Handing it one would only widen what a bug could reach.
 */
'use strict';

const { app, BrowserWindow, Menu, protocol, net, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/* ---- THE RENAME CARRIES THE SAVES ------------------------------------
 *
 * The game was "Procedural Space Game" through 0.3.0-beta and is Manifest
 * from here on. The `game://` origin is unchanged, which is what the note
 * above says a save depends on — and it is only half of what a save
 * depends on. The other half is WHERE that origin's storage sits on disk,
 * and Electron derives that from productName: %APPDATA%\Procedural Space
 * Game yesterday, %APPDATA%\Manifest today. Rename the app and every
 * career quietly becomes a fresh start, with nothing broken and nothing
 * thrown.
 *
 * So: once, on the first run under the new name, if there is no storage
 * here yet and there is some under the old name, bring it across.
 *
 * COPIED, NOT MOVED, and that is the whole of the risk management. A copy
 * that fails half way leaves the original where it was; a move that fails
 * half way is a lost career. It also means an older build still finds its
 * own saves, which is what makes rolling back to 0.3.0-beta harmless.
 * The cost is one duplicated folder on one machine, once.
 *
 * Before app.whenReady() on purpose: the session that owns this storage is
 * built during startup, and a directory moved under a running session is
 * a directory the session is no longer looking at. */
const PREVIOUS_APP_NAME = 'Procedural Space Game';

function carrySavesAcrossTheRename() {
  try {
    const here = app.getPath('userData');
    if (fs.existsSync(here)) return;                 // moved already, or new install
    const before = path.join(path.dirname(here), PREVIOUS_APP_NAME);
    if (!fs.existsSync(before)) return;              // nothing to carry
    fs.cpSync(before, here, { recursive: true });
    console.log('carried saves across the rename: ' + before + ' -> ' + here);
  } catch (e) {
    /* A failed migration is a career that looks new, which is bad. A
     * migration that throws is a game that will not start at all, which is
     * worse — and the original is still sitting there either way. */
    console.error('could not carry saves across the rename: ' + e.message);
  }
}

carrySavesAcrossTheRename();

/* The game's own root: index.html and src/ sit one level above this file,
 * both in development and inside the packaged app, so one expression covers
 * both cases and there is no isPackaged branch to get wrong. */
const ROOT = path.join(__dirname, '..');

const START_SEED = 'kawartha';

/* Old integrated GPUs — the kind in the laptops this is meant to run on —
 * are sometimes on Chromium's blocklist for drivers that are in fact fine.
 * Being blocked means falling back to software WebGL, which turns a smooth
 * frame into a slideshow. Ask for the hardware; Chromium still refuses if
 * the driver genuinely cannot. */
app.commandLine.appendSwitch('ignore-gpu-blocklist');

/* Must run before app ready: this is what makes `game://` a real origin
 * (secure, same-origin, storage-bearing) rather than an opaque one. */
protocol.registerSchemesAsPrivileged([{
  scheme: 'game',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

function serveGameScheme() {
  protocol.handle('game', (request) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch (e) {
      return new Response('bad request', { status: 400 });
    }
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    /* Resolve first, then check the result is still inside ROOT. Checking
     * the request string instead would be checking the attacker's spelling
     * rather than the file that actually gets opened. */
    const file = path.resolve(ROOT, '.' + pathname);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      return new Response('forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    /* Full screen from the first frame: a cockpit with a title bar above it
     * is a cockpit in a box. F11 gets the desktop back. The width/height
     * below are what the window falls back to the moment it leaves full
     * screen, so they still matter. */
    fullscreen: true,
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    /* The game's own void, so there is no white flash before the first
     * frame lands. */
    backgroundColor: '#04060c',
    show: false,
    title: 'Manifest',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  /* The default menu binds Ctrl+W, Ctrl+R and a dozen function keys. The
   * game uses F1-F10 for its instrument pages and would lose them to a menu
   * nobody wants. F11 and F12 are put back by hand below. */
  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => win.show());

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  /* Nothing in the game navigates anywhere, so anything that tries is
   * either a bug or something unwelcome. Links open in the real browser;
   * the window itself never leaves the game. */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('game://')) event.preventDefault();
  });

  win.loadURL('game://psg/index.html#' + encodeURIComponent(START_SEED));
  return win;
}

app.whenReady().then(() => {
  serveGameScheme();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/* The game saves on beforeunload, which the window close fires, so quitting
 * on last-window-closed is also what commits the career. */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
