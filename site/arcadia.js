const INPUT_NAMES = { keys: 'Keyboard', pad: 'Controller', touch: 'Touch' };
const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LIVE_DWELL_MS = 350;

const readHi = (key) => {
  try {
    return Math.max(0, Number(localStorage.getItem(key)) || 0);
  } catch {
    return 0;
  }
};

function placeBulbs() {
  const box = document.querySelector('.bulbs');
  if (!box) return;
  box.replaceChildren();
  const w = box.clientWidth, h = box.clientHeight, step = 16, pts = [];
  for (let x = 0; x <= w; x += step) pts.push([x, 0]);
  for (let y = step; y <= h; y += step) pts.push([w, y]);
  for (let x = w - step; x >= 0; x -= step) pts.push([x, h]);
  for (let y = h - step; y > 0; y -= step) pts.push([0, y]);
  pts.forEach(([x, y], i) => {
    const b = document.createElement('i');
    b.style.left = `${x - 3}px`;
    b.style.top = `${y - 3}px`;
    b.style.animationDelay = `${-(i % 3) * 0.4}s`;
    box.append(b);
  });
}

/** Desktop: play on hover or keyboard focus. Touch: play while the cabinet is mostly on screen. */
function whileActive(cab, start, stop) {
  if (canHover) {
    cab.addEventListener('pointerenter', start);
    cab.addEventListener('pointerleave', stop);
    cab.addEventListener('focusin', start);
    cab.addEventListener('focusout', stop);
  } else {
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.6 }).observe(cab);
  }
}

/** A recorded gameplay loop (site/loops/<slug>.webm), loaded the first time it's needed. */
function attachLoop(cab, crt, game) {
  let video, broken = false;
  const play = () => {
    if (broken) return;
    if (!video) {
      video = document.createElement('video');
      Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'none' });
      video.setAttribute('aria-hidden', 'true');
      video.src = `loops/${game.slug}.webm`;
      video.addEventListener('error', () => { broken = true; video.remove(); });
      video.addEventListener('playing', () => video.classList.add('on'));
      crt.append(video);
    }
    video.play().catch(() => {});
  };
  const stop = () => {
    if (!video) return;
    video.pause();
    video.classList.remove('on');
  };
  whileActive(cab, play, stop);
}

/**
 * The game itself running its attract mode (`?attract`) in an inert iframe. Desktop only, and torn down on leave so
 * there's never more than one game running.
 */
function attachLive(cab, crt, game) {
  let timer, frame;
  const start = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (frame) return;
      frame = document.createElement('iframe');
      frame.src = `../${game.slug}/?attract`;
      frame.title = `${game.title} attract mode`;
      frame.tabIndex = -1;
      frame.inert = true;
      frame.setAttribute('aria-hidden', 'true');
      frame.addEventListener('load', () => setTimeout(() => frame?.classList.add('on'), 400));
      crt.append(frame);
    }, LIVE_DWELL_MS);
  };
  const stop = () => {
    clearTimeout(timer);
    frame?.remove();
    frame = undefined;
  };
  whileActive(cab, start, stop);
}

function attachPreview(cab, crt, game) {
  if (calm) return;
  if (game.attract && canHover) attachLive(cab, crt, game);
  else if (game.loop) attachLoop(cab, crt, game);
}

function buildCabinet(tpl, game) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.style.setProperty('--accent', game.accent);
  if (game.font) node.style.setProperty('--font-title', game.font);
  if (game.fontScale) node.style.setProperty('--title-scale', game.fontScale);
  node.querySelector('h2').textContent = game.title;

  const img = node.querySelector('img.still');
  img.src = `screens/${game.slug}.png`;
  img.alt = `${game.title} gameplay`;

  node.querySelector('.tagline').textContent = game.tagline;

  const inputs = node.querySelector('.inputs');
  inputs.textContent = game.inputs.map((i) => INPUT_NAMES[i]).join(' · ');
  if (!canHover && !game.inputs.includes('touch')) inputs.textContent = 'Needs keyboard or controller';

  if (game.hiKey) {
    const hi = readHi(game.hiKey);
    if (hi > 0) {
      const el = node.querySelector('.hi');
      el.textContent = `Your best ${hi.toLocaleString('en-US').padStart(7, '0')}`;
      el.hidden = false;
    }
  }

  const coin = node.querySelector('.coin');
  coin.href = `../${game.slug}/`;
  coin.setAttribute('aria-label', `Play ${game.title}`);

  attachPreview(node, node.querySelector('.crt'), game);
  return node;
}

async function main() {
  placeBulbs();
  addEventListener('resize', placeBulbs);
  document.fonts?.ready.then(placeBulbs);

  const floor = document.getElementById('floor');
  const tpl = document.getElementById('cab-tpl');
  try {
    const res = await fetch('games.json');
    if (!res.ok) throw new Error(`games.json: ${res.status}`);
    const games = await res.json();
    document.getElementById('count').textContent = String(games.length);
    floor.replaceChildren(...games.map((g) => buildCabinet(tpl, g)));
  } catch (err) {
    console.error(err);
    floor.innerHTML = '<p>The game list didn’t load. Refresh the page to try again.</p>';
  }
}

main();
