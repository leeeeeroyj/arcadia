// Records the short gameplay loops that play on Arcadia's TV on phones (desktop runs the game itself).
// Opens each game's published Pages build in attract mode (`?attract&seed=<n>`: the game plays itself, silently),
// captures frames over CDP's screencast and encodes them with ffmpeg into site/loops/<slug>.webm. Node built-ins only;
// needs google-chrome and ffmpeg on PATH.
//
//   node tools/record-loops.mjs              # every game
//   node tools/record-loops.mjs sentinel     # one game
//
// Chrome runs on the GPU by default (60 fps capture instead of ~12 on software rendering). Override the flags with
// CHROME_FLAGS="..." if your machine needs different ones.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site', 'loops');
const PAGES = 'https://leeeeeroyj.github.io/';
const SCALE = 2;          // record at 2x the game's size: crisp on the cabinet screens, small files
const LOAD_MS = 2500;     // the page loading: attract mode has gameplay on screen within 2 s
const WARMUP_MS = 1500;   // after that, before frames are kept
const CLIP_MS = 8000;
const GPU_FLAGS = '--ignore-gpu-blocklist --use-gl=angle --use-angle=gl-egl';

/**
 * One entry per game: its own resolution, and the attract seed to record (each game reads it its own way: the
 * track, sector, wave, night, vault or region the demo starts on).
 */
const GAMES = {
  'space-raider': { size: [416, 228], seed: 3 },
  'space-raider-2': { size: [416, 228], seed: 3 },
  'mars-patrol': { size: [416, 228], seed: 7 },
  sentinel: { size: [416, 228], seed: 2 },
  'hedge-hogger': { size: [416, 248], seed: 3 },
  'pro-racer-z': { size: [416, 228], seed: 2 },
  'heroic-crusader': { size: [416, 228], seed: 6 },
  overtone: { size: [416, 228], seed: 7 },
};

const waitFor = async (fn, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch {}
    await sleep(250);
  }
  throw new Error('timed out');
};

/** Plays the game's attract mode and returns the captured frames. */
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
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await sleep(LOAD_MS);
    await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: w, maxHeight: h, everyNthFrame: 1 });
    await sleep(WARMUP_MS);
    keep = true;
    await sleep(CLIP_MS);
    keep = false;
    await send('Page.stopScreencast');
    ws.close();
    if (errors.length) console.warn(`  ${slug}: page errors\n   ${errors.join('\n   ')}`);
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
let chromePort = 9400;
for (const slug of slugs) {
  const game = GAMES[slug];
  if (!game) { console.error(`no script for ${slug}`); process.exitCode = 1; continue; }
  const url = new URL(`${slug}/?attract&seed=${game.seed}`, PAGES).href;
  console.log(`recording ${slug} from ${url}`);
  encode(slug, await take(slug, game, url, chromePort++));
}
