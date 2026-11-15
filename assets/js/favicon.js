// Animated favicon: a rotating coral→cyan gradient tile with a bouncing "i".
// Redraws a small canvas and swaps the <link rel="icon"> href each frame.
// Safari ignores runtime favicon changes, so it keeps the static SVG.
const SIZE = 64;
const FPS = 15;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const link = document.querySelector('link[rel~="icon"]') || Object.assign(
  document.head.appendChild(document.createElement('link')), { rel: 'icon' });

const canvas = document.createElement('canvas');
canvas.width = canvas.height = SIZE;
const ctx = canvas.getContext('2d');

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function draw(t) {
  // Gradient axis slowly spins around the tile.
  const a = t / 1600;
  const dx = Math.cos(a) * SIZE / 2, dy = Math.sin(a) * SIZE / 2;
  const g = ctx.createLinearGradient(32 - dx, 32 - dy, 32 + dx, 32 + dy);
  g.addColorStop(0.2, '#e68c7d');
  g.addColorStop(1, '#00cbe6');

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = g;
  roundRect(0, 0, SIZE, SIZE, 16);
  ctx.fill();

  // Bounce: the dot hops, the stem squashes a little on landing.
  const p = (t / 900) % 1;
  const hop = Math.abs(Math.sin(p * Math.PI));          // 0 at landing, 1 at apex
  const squash = Math.max(0, 1 - hop * 4) * 0.18;        // brief squash near landing
  const dotY = 18 - hop * 9;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(32, dotY, 7 * (1 + squash), 7 * (1 - squash), 0, 0, Math.PI * 2);
  ctx.fill();
  const stemH = 26 * (1 - squash * 0.5);
  roundRect(26, 54 - stemH, 12, stemH, 5);
  ctx.fill();

  link.type = 'image/png';
  link.href = canvas.toDataURL('image/png');
}

if (reduced) {
  draw(0);
} else {
  let last = 0;
  const tick = (now) => {
    if (now - last >= 1000 / FPS) { last = now; draw(now); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // rAF pauses in background tabs; keep it alive at the browser's throttled rate.
  setInterval(() => document.hidden && draw(performance.now()), 500);
}
