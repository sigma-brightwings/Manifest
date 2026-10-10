/* electron-probe.cjs — drive the real Electron shell and ask it questions.
 *
 *     node tools/electron-probe.cjs <script.js> [outdir]
 *
 * Launches `electron .` with a DevTools port, waits for the game to boot,
 * then runs <script.js> inside the page. The script is the body of an async
 * function that gets `shot(name)` (saves a screenshot to outdir), `wait(ms)`
 * and `log(...)`, and whatever it returns is printed. Console errors and
 * uncaught exceptions from the page are printed as they happen. The app is
 * closed at the end. This is the check the headless suites cannot make: a
 * real GPU, the real game:// scheme, the real lazy loader. */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const PORT = 9333;
const script = fs.readFileSync(path.resolve(process.argv[2]), 'utf8');
const outdir = path.resolve(process.argv[3] || path.join(ROOT, 'Claude outputs', 'electron'));
fs.mkdirSync(outdir, { recursive: true });

/* PROBE_EXE=<packaged exe> drives a built artifact instead of the dev shell. */
const packaged = process.env.PROBE_EXE;
const exe = packaged || path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const child = spawn(exe, (packaged ? [] : ['.']).concat(['--remote-debugging-port=' + PORT]),
                    { cwd: packaged ? path.dirname(packaged) : ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', d => process.stdout.write('[main] ' + d));
child.stderr.on('data', d => { const s = String(d); if (!/DevTools listening|GPU|gpu_|Fontconfig/.test(s)) process.stdout.write('[main!] ' + s); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, nextId = 1; const pending = {};
function send(method, params) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((res, rej) => { pending[id] = { res, rej }; });
}

(async function () {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(1000);
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
      target = list.find(t => t.type === 'page' && /^game:/.test(t.url));
    } catch (e) { /* not up yet */ }
  }
  if (!target) { console.log('FAIL: no game page appeared'); child.kill(); process.exit(1); }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { (m.error ? pending[m.id].rej : pending[m.id].res)(m.error || m.result); delete pending[m.id]; return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console.log('[page EXCEPTION] ' + (d.exception && d.exception.description || d.text) + ' @' + (d.url || '') + ':' + d.lineNumber);
    } else if (m.method === 'Runtime.consoleAPICalled' && /error|warning/.test(m.params.type)) {
      console.log('[page ' + m.params.type + '] ' + m.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' '));
    } else if (m.method === 'Log.entryAdded' && /error|warning/.test(m.params.entry.level)) {
      console.log('[page log ' + m.params.entry.level + '] ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    }
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  /* Booted = the career object exists and a system is loaded. */
  for (let i = 0; i < 60; i++) {
    const r = await send('Runtime.evaluate', { expression: '!!(window.Game && Game.sys && Game.ship)', returnByValue: true });
    if (r.result.value) break;
    await sleep(1000);
  }
  /* The in-page helpers: shots go back out through a binding. */
  await send('Runtime.addBinding', { name: '__probeShot' });
  await send('Runtime.addBinding', { name: '__probeKey' });
  const shots = [];
  ws.addEventListener('message', async ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.bindingCalled' && m.params.name === '__probeShot') shots.push(m.params.payload);
    if (m.method === 'Runtime.bindingCalled' && m.params.name === '__probeKey') {
      /* A real key press, through the input pipeline the player uses. */
      const k = m.params.payload;
      const code = { Enter: 13, Escape: 27, F4: 115, u: 85 }[k] || k.toUpperCase().charCodeAt(0);
      const base = { key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
      await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, base, k.length === 1 ? { text: k } : {}));
      await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
    }
  });
  const body = '(async function(){ const log=(...a)=>console.warn("[probe] "+a.join(" ")); const wait=ms=>new Promise(r=>setTimeout(r,ms));' +
               ' const shot=async n=>{ __probeShot(n); await wait(600); }; const key=async k=>{ __probeKey(k); await wait(300); };' + script + '})()';
  const pump = setInterval(async () => {
    while (shots.length) {
      const name = shots.shift();
      try {
        const s = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outdir, name + '.png'), Buffer.from(s.data, 'base64'));
        console.log('  shot ' + name + '.png');
      } catch (e) { console.log('  shot failed ' + name + ': ' + JSON.stringify(e)); }
    }
  }, 100);
  try {
    const r = await send('Runtime.evaluate', { expression: body, awaitPromise: true, returnByValue: true, timeout: 600000 });
    if (r.exceptionDetails) console.log('SCRIPT THREW: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description));
    else console.log('RESULT ' + JSON.stringify(r.result.value, null, 1));
  } catch (e) { console.log('evaluate failed: ' + JSON.stringify(e)); }
  await sleep(1500);
  clearInterval(pump);
  try { ws.close(); } catch (e) {}
  child.kill();
  await sleep(1000);
  process.exit(0);
})();
