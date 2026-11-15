// Records the short gameplay loops that play on Arcadia's cabinet screens.
// Opens each game in headless Chrome, plays a scripted input sequence, captures frames over CDP's screencast and
// encodes them with ffmpeg into site/loops/<slug>.webm. Node built-ins only; needs google-chrome and ffmpeg on PATH.
//
//   node tools/record-loops.mjs              # every game
//   node tools/record-loops.mjs sentinel     # one game
//
// Most games are recorded from their published Pages builds. Games marked `dev` are recorded from their own Vite dev
// server instead (built from the game's last commit), because the script needs the dev-only game handle; those expect
// the game's checkout beside this repo (../<slug>) with its dependencies installed.
//
// Chrome runs on the GPU by default (60 fps capture instead of ~12 on software rendering). Override the flags with
// CHROME_FLAGS="..." if your machine needs different ones.
//
// These loops are stand-ins until each game has an attract mode that meets the attract-mode requirements.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site', 'loops');
const PAGES = 'https://leeeeeroyj.github.io/';
const SCALE = 2;          // record at 2x the game's size: crisp on the cabinet screens, small files
const WARMUP_MS = 1500;   // after Start, before frames are kept (fade-ins, banners)
const CLIP_MS = 8000;
const MAX_TAKES = 6;
const GPU_FLAGS = '--ignore-gpu-blocklist --use-gl=angle --use-angle=gl-egl';

const KEYS = {
  ArrowRight: [39, 'ArrowRight'], ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'],
  Enter: [13, 'Enter'], ' ': [32, 'Space'], z: [90, 'KeyZ'], x: [88, 'KeyX'],
  w: [87, 'KeyW'], a: [65, 'KeyA'], s: [83, 'KeyS'], d: [68, 'KeyD'],
};

/**
 * One entry per game.
 * - `size`: the game's own resolution.
 * - `dev`: record from the game's dev server (for scripts that use the dev-only handle).
 * - `score`: optional expression read when the clip starts and ends; if it drops (lives lost), the take is redone.
 * - `play`: the input script. It runs from the moment Start is pressed and keeps going until `until()` is true.
 */
const GAMES = {
  'space-raider': {
    size: [416, 228],
    play: async ({ hold, release, mouse, until }) => {
      // Twin-stick: strafe with WASD while the beam sweeps round.
      await mouse('mousePressed', 0.75, 0.5);
      const path = ['d', 's', 'a', 'w'];
      let t = 0;
      while (!until()) {
        const k = path[Math.floor(t / 900) % path.length];
        await hold(k);
        const ang = t / 700;
        await mouse('mouseMoved', 0.5 + Math.cos(ang) * 0.3, 0.5 + Math.sin(ang) * 0.3, 1);
        await sleep(100); t += 100;
        await release(k);
      }
    },
  },
  'mars-patrol': {
    size: [416, 228],
    play: async ({ tap, hold, release, until }) => {
      // The rover drives itself: keep firing, jump every so often.
      let t = 0;
      await hold('ArrowRight');
      while (!until()) {
        await tap('z', 40);
        if (t % 1400 < 200) await tap('ArrowUp', 120);
        await sleep(160); t += 200;
      }
      await release('ArrowRight');
    },
  },
  sentinel: {
    size: [416, 228],
    play: async ({ hold, release, until }) => {
      // Patrol right with the laser held, weaving up and down, with one turn back.
      await hold(' ');
      await hold('ArrowRight');
      let t = 0;
      while (!until()) {
        const k = Math.floor(t / 700) % 2 ? 'ArrowUp' : 'ArrowDown';
        await hold(k); await sleep(300); await release(k);
        if (t % 4200 === 2100) { await release('ArrowRight'); await hold('ArrowLeft'); await sleep(500); await release('ArrowLeft'); await hold('ArrowRight'); }
        t += 350;
      }
      await release('ArrowRight');
      await release(' ');
    },
  },
  'hedge-hogger': {
    size: [416, 248],
    dev: true,
    score: `window.__hedgeHogger.scene.getScene('crossing').lives`,
    play: async ({ evaluate, until }) => {
      // Blind hopping always gets run over, so a small bot in the page hops only when the game's own lane rules
      // (vehicleAt / platformAt, with their look-ahead in seconds) say the landing spot stays safe.
      // Takes that still lose a life (the heron, the farmer) are redone.
      await evaluate(`(async () => {
        const L = await import('/src/lanes.ts');
        const C = await import('/src/config.ts');
        const s = window.__hedgeHogger.scene.getScene('crossing');
        const hop = C.HOGLET.hopTime, W = C.WIDTH, T = C.TILE;
        const range = (a, b, f) => { for (let d = a; d <= b; d += 0.03) if (!f(d)) return false; return true; };
        const roadOk = (r, x, a, b) => !L.isRoad(r) || range(a, b, (d) => !L.vehicleAt(s.laneAt.get(r), x, d, 6));
        const waterOk = (r, x, a, b) => {
          if (!L.isWater(r)) return true;
          const lane = s.laneAt.get(r);
          return range(a, b, (d) => {
            const rx = x + lane.dir * lane.speed * (d - a);
            return rx > 14 && rx < W - 14 && !!L.platformAt(lane, rx, s.clock, d);
          });
        };
        const homeAt = (x) => C.HOMES.findIndex((hx, k) => !s.goals[k] && Math.abs(x - hx) < C.HOGLET.homeSnap);
        const safe = (r, x) => {
          if (r < 0 || r > C.ROW.burrows || r === s.startRow) return false;
          if (r === s.goalRow) return homeAt(x) >= 0;
          if (!L.isWater(r) && (x < 8 || x > W - 8)) return false;
          return roadOk(r, x, hop * 0.4, hop + 0.5) && waterOk(r, x, hop, hop + 0.7);
        };
        let rest = 0;
        window.__demoBot = setInterval(() => {
          const h = s.hog;
          if (h.hopping || h.dead > 0 || s.between > 0 || s.over) return;
          const f = s.fwd, r = h.r, x = h.x;
          const danger = !roadOk(r, x, 0, 0.35) || !waterOk(r, x, 0, 0.5);
          if (!danger && (rest -= 0.05) > 0) return;
          const go = (dx, dr) => { s.tryHop(dx, dr); rest = 0.12 + Math.random() * 0.35; };
          // Line up with a free home before the last hop.
          if (r + f === s.goalRow && homeAt(x) < 0) {
            const free = C.HOMES.filter((hx, k) => !s.goals[k]);
            const target = free.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
            const dx = Math.sign(target - x);
            if (dx && safe(r, x + dx * T)) return go(dx, 0);
          }
          if (safe(r + f, x)) return go(0, f);
          if (danger) {
            for (const [dx, dr] of [[-1, 0], [1, 0], [0, -f]]) if (safe(r + dr, x + dx * T)) return go(dx, dr);
          }
        }, 50);
      })()`);
      while (!until()) await sleep(200);
      await evaluate('clearInterval(window.__demoBot)');
    },
  },
  'pro-racer-z': {
    size: [416, 228],
    dev: true,
    play: async ({ evaluate, until }) => {
      // Hand the wheel to the game's own autopilot.
      await evaluate(`(() => {
        const race = window.__proRacerZ?.scene.getScene('race')?.race;
        if (!race) throw new Error('pro-racer-z: __proRacerZ or its race is missing');
        race.autopilot = true;
      })()`);
      while (!until()) await sleep(200);
    },
  },
  'heroic-crusader': {
    size: [416, 228],
    dev: true,
    play: async ({ hold, release, tap, evaluate, until }) => {
      // A short walk out of Brightkeep, then a fight with a Thornhare and a Rook (started through the dev handle,
      // since random encounters may not come up in time). Z picks FIGHT, a target and the strike.
      await hold('ArrowRight'); await sleep(2200); await release('ArrowRight');
      await evaluate(`window.__heroicCrusader.scene.getScene('world').fight(['thornhare', 'rook'])`);
      while (!until()) { await tap('z', 60); await sleep(320); }
    },
  },
};

const waitFor = async (fn, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch {}
    await sleep(250);
  }
  throw new Error('timed out');
};

/**
 * Serves the game's last commit (not its working tree, which may hold unreleased work) from a temporary export,
 * borrowing the checkout's node_modules. Nothing in the game's repo is changed.
 */
async function startDevServer(slug, port) {
  const repo = join(ROOT, '..', slug);
  if (!existsSync(join(repo, 'node_modules'))) throw new Error(`${slug}: needs ../${slug} with node_modules installed`);
  if (await fetch(`http://localhost:${port}/`).then(() => true, () => false)) throw new Error(`port ${port} is already in use`);
  const dir = mkdtempSync(join(tmpdir(), `arcadia-${slug}-`));
  const archive = spawnSync('git', ['-C', repo, 'archive', '--format=tar', 'HEAD'], { maxBuffer: 1 << 30 });
  if (archive.status !== 0) throw new Error(`${slug}: git archive failed`);
  spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
  symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'));
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: dir, stdio: 'ignore', detached: true });
  await waitFor(async () => (await fetch(`http://localhost:${port}/`)).ok);
  return {
    url: `http://localhost:${port}/`,
    stop: () => { try { process.kill(-vite.pid, 'SIGTERM'); } catch {} rmSync(dir, { recursive: true, force: true }); },
  };
}

/** One take: returns the captured frames, or null if the take lost a life. */
async function take(slug, game, url, chromePort) {
  const [w, h] = game.size.map((v) => v * SCALE);
  const profile = mkdtempSync(join(tmpdir(), 'arcadia-rec-'));
  const flags = (process.env.CHROME_FLAGS ?? GPU_FLAGS).split(' ').filter(Boolean);
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', ...flags, '--hide-scrollbars', '--mute-audio',
    `--remote-debugging-port=${chromePort}`, `--user-data-dir=${profile}`, `--window-size=${w},${h}`, 'about:blank',
  ], { stdio: 'ignore', detached: true });
  try {
    const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json()).find((t) => t.type === 'page'));
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0, keep = false;
    const pending = new Map(), shots = [], errors = [];
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === 'Page.screencastFrame') {
        const { data, metadata, sessionId } = m.params;
        if (keep) shots.push({ t: metadata.timestamp, data, w: metadata.deviceWidth, h: metadata.deviceHeight });
        send('Page.screencastFrameAck', { sessionId });
      }
    });
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
      return r.result?.result?.value;
    };
    const key = (type, k) => send('Input.dispatchKeyEvent', { type, key: k, code: KEYS[k][1], windowsVirtualKeyCode: KEYS[k][0], nativeVirtualKeyCode: KEYS[k][0] });
    const hold = (k) => key('rawKeyDown', k);
    const release = (k) => key('keyUp', k);
    const tap = async (k, ms = 80) => { await hold(k); await sleep(ms); await release(k); };
    const mouse = (type, fx, fy, buttons = type === 'mousePressed' ? 1 : 0) =>
      send('Input.dispatchMouseEvent', { type, x: fx * w, y: fy * h, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await sleep(3500);                    // load, sprites, title fade-in
    await mouse('mouseMoved', 0.5, 0.5);  // pointer over the page without clicking anything on the title
    await tap('Enter');
    await sleep(800);                     // the title's fade-out
    await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: w, maxHeight: h, everyNthFrame: 1 });
    const t0 = Date.now();
    const playing = game.play({ hold, release, tap, mouse, evaluate, until: () => Date.now() - t0 > WARMUP_MS + CLIP_MS });
    await sleep(WARMUP_MS);
    const before = game.score ? await evaluate(game.score) : 0;
    keep = true;
    await playing;
    keep = false;
    const after = game.score ? await evaluate(game.score) : 0;
    await send('Page.stopScreencast');
    ws.close();
    if (errors.length) console.warn(`  ${slug}: page errors\n   ${errors.join('\n   ')}`);
    if (after < before) { console.log(`  ${slug}: take lost a life (${before} -> ${after}), retrying`); return null; }
    if (shots.length < 20) throw new Error(`${slug}: only ${shots.length} frames captured`);
    if (shots[0].w !== w || shots[0].h !== h) throw new Error(`${slug}: frames are ${shots[0].w}x${shots[0].h}, not ${w}x${h}`);
    return { shots, w, h };
  } finally {
    try { process.kill(-chrome.pid, 'SIGTERM'); } catch {}
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

/** Encode with each frame's real duration, so an uneven capture rate doesn't change the game's speed. */
function encode(slug, { shots, w, h }) {
  const frames = mkdtempSync(join(tmpdir(), 'arcadia-frames-'));
  try {
    const lines = [];
    shots.forEach((s, i) => {
      const file = `f${String(i).padStart(5, '0')}.jpg`;
      writeFileSync(join(frames, file), Buffer.from(s.data, 'base64'));
      const next = shots[i + 1]?.t ?? s.t + 1 / 30;
      lines.push(`file '${file}'`, `duration ${(next - s.t).toFixed(4)}`);
    });
    lines.push(`file 'f${String(shots.length - 1).padStart(5, '0')}.jpg'`);
    writeFileSync(join(frames, 'list.txt'), lines.join('\n'));
    const out = join(OUT, `${slug}.webm`);
    const ff = spawnSync('ffmpeg', [
      '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'),
      '-vf', `scale=${w}:${h}:flags=neighbor,fps=30,format=yuv420p`,
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-an', '-map_metadata', '-1', out,
    ], { stdio: 'inherit' });
    if (ff.status !== 0) throw new Error(`${slug}: ffmpeg failed`);
    const fps = (shots.length / ((shots.at(-1).t - shots[0].t) || 1)).toFixed(1);
    console.log(`  ${slug}: ${shots.length} frames at ~${fps} fps -> site/loops/${slug}.webm`);
  } finally {
    rmSync(frames, { recursive: true, force: true });
  }
}

const wanted = process.argv.slice(2);
const slugs = wanted.length ? wanted : Object.keys(GAMES);
mkdirSync(OUT, { recursive: true });
let chromePort = 9400, vitePort = 5290;
for (const slug of slugs) {
  const game = GAMES[slug];
  if (!game) { console.error(`no script for ${slug}`); process.exitCode = 1; continue; }
  const server = game.dev ? await startDevServer(slug, vitePort++) : null;
  const url = server ? server.url : new URL(`${slug}/`, PAGES).href;
  console.log(`recording ${slug} from ${url}`);
  try {
    let result = null;
    for (let i = 0; i < MAX_TAKES && !result; i++) result = await take(slug, game, url, chromePort++);
    if (!result) throw new Error(`${slug}: no clean take in ${MAX_TAKES} tries`);
    encode(slug, result);
  } finally {
    server?.stop();
  }
}
