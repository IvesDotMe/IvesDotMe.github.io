// Live previews for the "I also made these" tiles.
// Rates: pulls the same ECB reference rates the Rates app uses (frankfurter.dev) and cycles
// a few currencies with their real 30-day sparkline. If the fetch fails the tile keeps its
// static decorative line and just cycles currency codes.
// Touch screens have no hover, so tiles play once when they scroll into view.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const noHover = window.matchMedia('(hover: none)').matches;

/* ---------- Rates ---------- */
const rates = document.querySelector('.play-rates');
if (rates) {
  const CODES = ['USD', 'EUR', 'BRL', 'AUD'];
  const ticker = rates.querySelector('.rt-ticker');
  const codeEl = rates.querySelector('.rt-code');
  const valEl = rates.querySelector('.rt-val');
  const deltaEl = rates.querySelector('.rt-delta');
  const spark = rates.querySelector('.rt-spark');
  const line = rates.querySelector('.rt-line');
  const fill = rates.querySelector('.rt-fill');
  let series = null; // { USD: [..], EUR: [..], ... }
  let idx = 0;

  const restart = (el, cls) => {
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
  };

  function paths(values) {
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * 120;
      const y = 32 - ((v - min) / span) * 26;
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    const d = 'M' + pts.join(' L');
    return { d, area: `${d} L120 36 L0 36 Z` };
  }

  function show(i, animate) {
    const code = CODES[i];
    codeEl.textContent = code;
    if (series && series[code]) {
      const vals = series[code];
      const last = vals[vals.length - 1];
      const change = ((last - vals[0]) / vals[0]) * 100;
      valEl.textContent = last.toFixed(last >= 10 ? 2 : 4);
      deltaEl.textContent = `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%`;
      deltaEl.className = 'rt-delta ' + (change >= 0 ? 'is-up' : 'is-down');
      const p = paths(vals);
      line.setAttribute('d', p.d);
      fill.setAttribute('d', p.area);
      deltaEl.title = '30-day change';
    } else {
      valEl.textContent = '';
    }
    if (animate && !reduceMotion) {
      restart(ticker, 'is-swap');
      restart(spark, 'is-draw');
      window.dispatchEvent(new Event('rates:swap'));
    }
  }

  function next() {
    idx = (idx + 1) % CODES.length;
    show(idx, true);
  }

  // Cycle faster while hovered, slowly otherwise; pause when the tab is hidden.
  let timer = null;
  const schedule = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!document.hidden) next();
      schedule(rates.matches(':hover, :focus-visible') ? 1600 : 3800);
    }, ms);
  };
  if (!reduceMotion) {
    rates.addEventListener('mouseenter', () => { next(); schedule(1600); });
    rates.addEventListener('focus', () => { next(); schedule(1600); });
  }

  const day = (d) => d.toISOString().slice(0, 10);
  const start = new Date(Date.now() - 31 * 864e5);
  fetch(`https://api.frankfurter.dev/v1/${day(start)}..?base=CAD&symbols=${CODES.join(',')}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((json) => {
      const days = Object.keys(json.rates).sort();
      if (days.length < 2) return;
      series = {};
      for (const c of CODES) series[c] = days.map((d) => json.rates[d][c]).filter((v) => typeof v === 'number');
    })
    .catch(() => {})
    .finally(() => {
      show(idx, true);
      if (!reduceMotion) schedule(3800);
    });
}

/* ---------- Rates background: a 2D miniature of the app's three.js scene ----------
   A rolling ocean of points (blue → red → gold, additive, like the app in dark mode) with gold
   and silver coins tumbling upward. Hovering sends a shockwave through it, as typing does in the app.
   Only animates while on screen and the tab is visible. */
const fxCanvas = document.querySelector('.rt-fx');
if (fxCanvas && fxCanvas.getContext) {
  const g = fxCanvas.getContext('2d');
  const tile = fxCanvas.closest('.play');
  const LOW = [43, 92, 255], MID = [255, 77, 109], HIGH = [255, 209, 102];
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const COINS = ['$', '€', '¥', '£', 'R$', '₹', '$'].map((sym, i) => ({
    sym,
    gold: i % 2 === 0,
    x: Math.random(), y: Math.random(), z: 0.55 + Math.random() * 0.6,
    vy: 0.05 + Math.random() * 0.05, spin: Math.random() * 6.28, vs: 1 + Math.random() * 1.5, kick: 0,
  }));
  let W = 0, H = 0, dpr = 1, t = 0, pulse = 0, pulseTarget = 0, last = 0, raf = 0, visible = false;

  function size() {
    const r = fxCanvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    fxCanvas.width = Math.round(W * dpr);
    fxCanvas.height = Math.round(H * dpr);
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';

    // point ocean, seen from just above, horizon at mid height
    const horizon = H * 0.5, f = H * 0.5, NX = 64, NZ = 22;
    for (let j = NZ - 1; j >= 0; j--) {
      const z = 0.9 + j * 0.3;
      for (let i = 0; i < NX; i++) {
        const x = (i / (NX - 1) - 0.5) * 14;
        const r = Math.hypot(x, z - 2.5);
        let h = Math.sin(x * 0.9 + t * 0.9) * 0.22 + Math.sin(z * 1.2 - t * 1.25) * 0.2 + Math.sin((x + z) * 0.5 + t * 0.6) * 0.35;
        h = h * (1 + pulse * 0.9) + Math.sin(r * 2.6 - t * 6) * Math.exp(-r * 0.35) * pulse * 0.6;
        const sx = W / 2 + (x * f) / z;
        if (sx < -4 || sx > W + 4) continue;
        const sy = horizon + ((0.95 - h) * f) / z;
        const k = Math.min(1, Math.max(0, h * 0.8 + 0.5));
        const c = k < 0.5 ? mix(LOW, MID, k * 2) : mix(MID, HIGH, (k - 0.5) * 2);
        const a = (0.3 + k * 0.6) * Math.min(1, 2.6 / z);
        const s = (1.1 + Math.max(h, 0) * 1.4 + pulse) * (1.4 / z);
        g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
        g.fillRect(sx - s / 2, sy - s / 2, s, s);
      }
    }

    // coins
    g.globalCompositeOperation = 'source-over';
    for (const c of COINS) {
      const R = H * 0.075 * c.z;
      const cx = c.x * W + Math.sin(t * 0.5 + c.spin) * 4;
      const cy = H * 1.1 - c.y * H * 1.3;
      const w = Math.abs(Math.cos(c.spin));
      const grad = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      grad.addColorStop(0, c.gold ? '#ffe9a3' : '#ffffff');
      grad.addColorStop(1, c.gold ? '#d99a1c' : '#aab4c2');
      g.globalAlpha = 0.55 + c.z * 0.35;
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(cx, cy, Math.max(R * w, R * 0.12), R, Math.sin(c.spin * 0.7) * 0.4, 0, Math.PI * 2);
      g.fill();
      if (w > 0.45) {
        g.save();
        g.translate(cx, cy);
        g.scale(w, 1);
        g.fillStyle = c.gold ? 'rgba(107,67,0,0.85)' : 'rgba(57,66,79,0.85)';
        g.font = `700 ${R * (c.sym.length > 1 ? 0.9 : 1.2)}px Georgia, "Times New Roman", serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(c.sym, 0, R * 0.08);
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }

  function step(dt) {
    pulseTarget *= Math.exp(-dt * 1.6);
    pulse += (pulseTarget - pulse) * Math.min(1, dt * 7);
    t += dt * (1 + pulse * 0.8);
    for (const c of COINS) {
      c.kick *= Math.exp(-dt * 2.2);
      c.y += (c.vy + c.kick) * dt;
      c.spin += c.vs * dt * (1 + pulse * 4);
      if (c.y > 1.05) { c.y = -0.05; c.x = Math.random(); c.z = 0.55 + Math.random() * 0.6; }
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  const start = () => {
    if (raf || reduceMotion || !visible || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  size();
  draw();
  if ('ResizeObserver' in window) new ResizeObserver(() => { size(); draw(); }).observe(fxCanvas);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(fxCanvas);
  } else { visible = true; start(); }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  const shock = () => {
    pulseTarget = Math.min(2.5, pulseTarget + 1.2);
    for (const c of COINS) c.kick += 0.15 + Math.random() * 0.25;
  };
  tile.addEventListener('mouseenter', shock);
  tile.addEventListener('focus', shock);
  window.addEventListener('rates:swap', () => { pulseTarget = Math.min(2.5, pulseTarget + 0.5); });
}

/* ---------- Touch: play each tile once as it scrolls into view ---------- */
if (noHover && !reduceMotion && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-live');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.75 });
  document.querySelectorAll('.play-sudoku, .play-spider').forEach((el) => io.observe(el));
}
