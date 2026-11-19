const INPUT_NAMES = { keys: 'Keyboard', pad: 'Controller', touch: 'Touch' };
const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LIVE_DWELL_MS = 600;
const SWIPE_PX = 40;

const $ = (id) => document.getElementById(id);

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

/** Where cartridge i sits relative to the selected one s, going the short way round a ring of n. */
const ringOffset = (i, s, n) => {
  const half = Math.floor(n / 2);
  return ((i - s + n + half) % n) - half;
};

/** A game's own colour and display font, as custom properties on `el`. */
function brand(el, game) {
  el.style.setProperty('--accent', game.accent);
  if (game.font) el.style.setProperty('--font-title', game.font);
  else el.style.removeProperty('--font-title');
  el.style.setProperty('--title-scale', game.fontScale ?? 1);
}

let games = [];
let sel = -1;
let knobTurn = 0;
const carts = [];

/* ---------- the TV picture ---------- */

let tvSeen = false;
let liveTimer = 0;
let media = null;

function stopMedia() {
  clearTimeout(liveTimer);
  if (!media) return;
  media.pause?.();
  media.remove();
  media = null;
}

/**
 * Puts the selected game on the TV. Desktop runs the game's own attract mode (`?attract`) in an inert iframe once
 * the channel has settled; touch devices play its recorded loop (site/loops/<slug>.webm). Only while the TV is on
 * screen and the tab is visible, so there's never more than one game running, and none in the background.
 */
function playMedia(game) {
  stopMedia();
  if (calm || !tvSeen || document.hidden) return;
  const picture = $('picture');
  if (game.attract && canHover) {
    liveTimer = setTimeout(() => {
      const frame = document.createElement('iframe');
      frame.src = `../${game.slug}/?attract`;
      frame.title = `${game.title} attract mode`;
      frame.tabIndex = -1;
      frame.inert = true;
      frame.setAttribute('aria-hidden', 'true');
      frame.addEventListener('load', () => setTimeout(() => frame.classList.add('on'), 400));
      picture.append(frame);
      media = frame;
    }, LIVE_DWELL_MS);
  } else if (game.loop) {
    const video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true });
    video.setAttribute('aria-hidden', 'true');
    video.src = `loops/${game.slug}.webm`;
    video.addEventListener('error', () => {
      if (media === video) media = null;
      video.remove();
    });
    video.addEventListener('playing', () => video.classList.add('on'));
    picture.append(video);
    media = video;
    video.play().catch(() => {});
  }
}

/* ---------- changing the channel ---------- */

function select(next, animate = true) {
  const n = games.length;
  const i = ((next % n) + n) % n;
  if (i === sel) return;
  const prev = sel < 0 ? i : sel;
  knobTurn += ringOffset(i, prev, n) * (360 / n);
  sel = i;
  const game = games[i];

  const room = $('room');
  brand(room, game);
  $('title').textContent = game.title;
  $('slot-title').textContent = game.title;
  $('tagline').textContent = game.tagline;

  const inputs = $('inputs');
  inputs.textContent = game.inputs.map((k) => INPUT_NAMES[k]).join(' · ');
  if (!canHover && !game.inputs.includes('touch')) inputs.textContent = 'Needs keyboard or controller';

  // Kept in the layout when empty, so the page doesn't jump between games with and without a score.
  const hi = game.hiKey ? readHi(game.hiKey) : 0;
  const hiEl = $('hi');
  hiEl.textContent = hi > 0 ? `Your best ${hi.toLocaleString('en-US').padStart(7, '0')}` : ' ';

  const start = $('start');
  start.href = `../${game.slug}/`;
  start.setAttribute('aria-label', `Play ${game.title}`);

  const still = $('still');
  still.src = `screens/${game.slug}.png`;
  still.alt = `${game.title} gameplay`;
  $('osd').textContent = `CH ${String(i + 1).padStart(2, '0')}`;
  $('knob').style.transform = `rotate(${knobTurn}deg)`;

  carts.forEach((cart, j) => {
    const d = ringOffset(j, i, n);
    // A cartridge that wraps round from one end of the row to the other jumps instead of sliding across.
    cart.classList.toggle('no-anim', !animate || Math.abs(d - ringOffset(j, prev, n)) > n / 2);
    cart.classList.toggle('is-sel', j === i);
    cart.classList.toggle('is-far', Math.abs(d) > 3);
    cart.style.setProperty('--d', d);
    cart.tabIndex = j === i ? 0 : -1;
    cart.setAttribute('aria-pressed', String(j === i));
  });

  history.replaceState(null, '', `#${game.slug}`);
  if (animate && !calm) {
    room.classList.remove('flip');
    void room.offsetWidth; // restart the channel-change animations
    room.classList.add('flip');
  }
  playMedia(game);
}

/** Steps along the row; keeps keyboard focus on the selected cartridge if it was on one. */
function move(by) {
  const focused = carts.includes(document.activeElement);
  select(sel + by);
  if (focused) carts[sel].focus({ preventScroll: true });
}

function buildCart(tpl, game, i) {
  const cart = tpl.content.firstElementChild.cloneNode(true);
  brand(cart, game);
  cart.querySelector('.cart-title').textContent = game.title;
  cart.querySelector('.cart-art').src = `screens/${game.slug}.png`;
  cart.querySelector('.cart-no').textContent = `No. ${String(i + 1).padStart(2, '0')}`;
  cart.setAttribute('aria-label', game.title);
  cart.addEventListener('click', () => select(i));
  return cart;
}

function wireControls() {
  $('prev').addEventListener('click', () => move(-1));
  $('next').addEventListener('click', () => move(1));

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      move(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'Enter' && e.target === document.body) {
      $('start').click();
    }
  });

  // Swipe the row on touch screens (and drag it with a mouse). A swipe isn't also a tap on the cartridge under it.
  const row = $('carts');
  let x0 = null, y0 = 0, swiped = false;
  row.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; swiped = false; });
  row.addEventListener('pointercancel', () => { x0 = null; });
  row.addEventListener('dragstart', (e) => e.preventDefault()); // a mouse drag would otherwise pick up the label image
  row.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      swiped = true;
      move(dx < 0 ? 1 : -1);
    }
  });
  row.addEventListener('click', (e) => {
    if (!swiped) return;
    swiped = false;
    e.stopPropagation();
  }, true);

  new IntersectionObserver(([e]) => {
    tvSeen = e.isIntersecting;
    if (tvSeen) playMedia(games[sel]);
    else stopMedia();
  }, { threshold: 0.3 }).observe($('tv'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopMedia();
    else playMedia(games[sel]);
  });
}

async function main() {
  placeBulbs();
  addEventListener('resize', placeBulbs);
  document.fonts?.ready.then(placeBulbs);

  try {
    const res = await fetch('games.json');
    if (!res.ok) throw new Error(`games.json: ${res.status}`);
    games = await res.json();
    if (!games.length) throw new Error('games.json is empty');
  } catch (err) {
    console.error(err);
    $('room').innerHTML = '<p class="oops">The game list didn’t load. Refresh the page to try again.</p>';
    return;
  }

  $('count').textContent = String(games.length);
  const tpl = $('cart-tpl');
  carts.push(...games.map((g, i) => buildCart(tpl, g, i)));
  $('carts').replaceChildren(...carts);

  const fromHash = games.findIndex((g) => g.slug === decodeURIComponent(location.hash.slice(1)));
  const first = Math.max(0, fromHash);
  knobTurn = first * (360 / games.length);
  select(first, false);
  wireControls();
}

main();
