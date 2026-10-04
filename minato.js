/* ═══════════════════════════════════════════════════════════
   波風ミナト — 黄色い閃光
   Opens on his closed eyes (scroll-scrubbed), breaks him into
   particles, then a full-bleed dash, a rasengan that tracks your
   hand left to right, and a last frame lit by ghost cursor and
   thunder.
   ═══════════════════════════════════════════════════════════ */

/* ───────────────────────── helpers ───────────────────────── */
const pad   = n => String(n).padStart(3, '0');
const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const rand  = (a, b) => a + Math.random() * (b - a);
/* fade in over [a,b], hold, fade out over [c,d] */
const window4 = (p, a, b, c, d) =>
  p < a || p > d ? 0 : p < b ? (p - a) / (b - a) : p > c ? 1 - (p - c) / (d - c) : 1;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.offsetWidth * dpr);
  const h = Math.round(canvas.offsetHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return canvas.getContext('2d');
}
function stale(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return canvas.width !== Math.round(canvas.offsetWidth * dpr) ||
         canvas.height !== Math.round(canvas.offsetHeight * dpr);
}
/* cover-draw that refuses to crop harder than maxUp, so faces survive
   on tall phones instead of becoming a close-up of one nostril */
function drawCover(ctx, img, cw, ch, maxUp = 2.0) {
  if (!img || !img.naturalWidth) return false;
  const ir = img.naturalWidth / img.naturalHeight;
  let w = cw, h = cw / ir;
  if (h < ch) { const s = Math.min(ch / h, maxUp); w *= s; h *= s; }
  const dx = (cw - w) / 2, dy = (ch - h) / 2;
  ctx.drawImage(img, dx, dy, w, h);
  maskCorner(ctx, dx, dy, w, h, cw, ch);
  return true;
}

/* the render watermark lives in the frame's bottom-right corner. Sink it under a
   corner-anchored black falloff — opaque over the mark, feathered outward so it
   reads as vignette rather than a taped-over box. Coordinates follow the drawn
   image, not the canvas, so it stays put through any crop. */
function maskCorner(ctx, dx, dy, w, h, cw, ch) {
  const x1 = Math.min(dx + w, cw);       // corner of the image, clipped to canvas
  const y1 = Math.min(dy + h, ch);
  const r = Math.max(w * 0.16, h * 0.24); // falloff radius, generous on both axes
  const g = ctx.createRadialGradient(x1, y1, 0, x1, y1, r);
  g.addColorStop(0.00, 'rgba(0,0,0,1)');
  g.addColorStop(0.42, 'rgba(0,0,0,1)');
  g.addColorStop(0.68, 'rgba(0,0,0,.72)');
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x1 - r, y1 - r, r, r);        // never bleed past the corner
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(x1 - r, y1 - r, r, r);
  ctx.restore();
}

/* ───────────────────────── preload ───────────────────────── */
const GAZE_COUNT  = 71;   // closed eyes → sage aura
const RAS_COUNT   = 33;   // rasengan travelling left to right
const DASH_COUNT  = 71;   // the hiraishin dash, left to right

const gazeFrames = [];
const rasFrames  = [];
const dashFrames = [];

const loaderEl   = document.getElementById('loader');
const loaderFill = document.getElementById('loaderFill');
const loaderPct  = document.getElementById('loaderPct');
const loaderMsg  = document.getElementById('loaderMsg');

const LOADER_LINES = [
  '術式展開 / DEPLOYING FORMULA',
  '座標同期 / SYNCING COORDINATES',
  'チャクラ充填 / CHARGING CHAKRA',
  '閃光待機 / STANDING BY',
];

let loaded = 0;
const total = GAZE_COUNT + RAS_COUNT + DASH_COUNT;

function load(src, bucket, index) {
  return new Promise(res => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = img.onerror = () => {
      bucket[index] = img;
      loaded++;
      const pct = loaded / total;
      loaderFill.style.width = (pct * 100).toFixed(1) + '%';
      loaderPct.textContent = String(Math.round(pct * 100)).padStart(2, '0');
      loaderMsg.textContent = LOADER_LINES[Math.min(3, Math.floor(pct * 4))];
      res();
    };
    img.src = src;
  });
}

const jobs = [];
for (let i = 1; i <= GAZE_COUNT; i++) jobs.push(load(`frames/gaze/${pad(i)}.jpg`,     gazeFrames, i - 1));
for (let i = 1; i <= RAS_COUNT;  i++) jobs.push(load(`frames/rasengan/${pad(i)}.jpg`, rasFrames,  i - 1));
for (let i = 1; i <= DASH_COUNT; i++) jobs.push(load(`frames/flash/frame_${pad(i)}.png`, dashFrames, i - 1));

Promise.all(jobs).then(() => setTimeout(() => {
  loaderEl.classList.add('done');
  document.body.classList.add('ready');
  resizeAll();
  fireFlash();
  setTimeout(() => { loaderEl.style.display = 'none'; }, 900);
}, 360));

/* ═══════════════════════════════════════════════════════════
   ACT II — Canvas UI ParticleObject
   The source is a hard-alpha cutout, so the cloud reads as a
   portrait rather than a haze: more particles, smaller points,
   and almost no idle drift or rocking to smear it.
   ═══════════════════════════════════════════════════════════ */
const particleCanvas = document.getElementById('particleCanvas');
const heroFallback   = document.getElementById('heroFallback');

function showFallback() {
  heroFallback.hidden = false;
  particleCanvas.style.display = 'none';
}

let particles = null;
import('./particle-object.js')
  .then(({ createParticleObject }) => {
    particles = createParticleObject({ canvas: particleCanvas }, {
      src: 'art/particle-minato.png',
      count: coarse ? 24000 : 46000,   // density is what makes the face legible
      size: 1.9,
      sizeVariance: 0.3,
      radius: 130,
      strength: 1.35,
      swirl: 1.1,           // he doesn't just scatter — he spirals, like the rasengan
      spring: 1.3,
      damping: 0.3,
      drift: 0.25,          // low: a drifting cloud is a blurry cloud
      scale: 4.1,
      xOffset: 0.52,   // pushed right so the copy on the left stays readable
      yOffset: 0.0,
      floatIntensity: 0.7,
      rotationIntensity: 0.25,
      floatSpeed: 1.2,
      fov: 62,
      cameraDistance: 4.2,
      orbit: false,         // must never fight the scroll
      zoom: false,
      onError: showFallback,
    });
    if (!particles) showFallback();
  })
  .catch(showFallback);

/* the copy sits left on desktop; on phones it moves to the floor, so the
   cloud has to climb out of the text instead of sitting behind it */
function layoutParticles() {
  if (!particles) return;
  const narrow = window.innerWidth < 860;
  particles.setOptions({
    xOffset: narrow ? 0 : 0.52,
    yOffset: narrow ? 0.95 : 0.0,
    scale: narrow ? 2.4 : 4.1,
  });
}

/* ═══════════════════════════════════════════════════════════
   TEXT MOTION — split / reveal / decrypt / count
   (vanilla takes on the reactbits.dev SplitText, BlurText,
   DecryptedText and CountUp components)
   ═══════════════════════════════════════════════════════════ */
document.querySelectorAll('[data-split]').forEach(el => {
  const text = el.textContent;
  el.textContent = '';
  el.classList.add('split');
  [...text].forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'char';
    span.style.setProperty('--i', i);
    span.textContent = ch;
    el.appendChild(span);
  });
});

const SCRAMBLE = '零一二三四五六七八九飛雷神螺旋丸閃光#%&$@*<>/\\';

function decrypt(el) {
  const target = el.dataset.decrypt || el.textContent;
  const chars = [...target];
  let step = 0;
  const steps = chars.length * 3 + 8;
  const id = setInterval(() => {
    step++;
    const shown = Math.floor((step / steps) * chars.length * 1.6);
    el.textContent = chars
      .map((c, i) => (i < shown || c === ' ' ? c
        : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]))
      .join('');
    if (step >= steps) { clearInterval(id); el.textContent = target; }
  }, 26);
}

function countUp(el) {
  const target = parseFloat(el.dataset.count);
  const dec = parseInt(el.dataset.dec || '0', 10);
  const t0 = performance.now();
  const dur = 1500;
  const step = now => {
    const p = clamp((now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toFixed(dec);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const seen = new WeakSet();
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting || seen.has(e.target)) continue;
    seen.add(e.target);
    const el = e.target;
    if (el.hasAttribute('data-split') || el.hasAttribute('data-reveal')) el.classList.add('in');
    if (el.hasAttribute('data-decrypt') && !reduceMotion) decrypt(el);
    el.querySelectorAll?.('[data-count]').forEach(countUp);
    if (el.hasAttribute('data-count')) countUp(el);
  }
}, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });

document.querySelectorAll('[data-split], [data-reveal], [data-decrypt]')
  .forEach((el, i) => { el.style.setProperty('--d', (i % 4) * 0.07 + 's'); io.observe(el); });

/* ── magnetic button (reactbits "Magnet") ── */
document.querySelectorAll('[data-magnet]').forEach(el => {
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${dx * 0.28}px, ${dy * 0.34}px)`;
  }, { passive: true });
  el.addEventListener('pointerleave', () => {
    el.style.transition = 'transform .55s cubic-bezier(.2,.9,.1,1)';
    el.style.transform = '';
    setTimeout(() => { el.style.transition = ''; }, 560);
  }, { passive: true });
});

/* ── tilt cards (reactbits "TiltedCard") ── */
document.querySelectorAll('[data-tilt]').forEach(el => {
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    el.style.transform =
      `perspective(900px) rotateY(${(px - .5) * 11}deg) rotateX(${(.5 - py) * 11}deg) translateY(-4px)`;
  }, { passive: true });
  el.addEventListener('pointerleave', () => {
    el.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)';
    el.style.transform = '';
    setTimeout(() => { el.style.transition = ''; }, 620);
  }, { passive: true });
});

/* ═══════════════════ ambient sky ═══════════════════ */
const skyCanvas = document.getElementById('skyCanvas');
let skyCtx = fitCanvas(skyCanvas);
const motes = [];

function seedSky() {
  motes.length = 0;
  const n = coarse ? 70 : 150;
  for (let i = 0; i < n; i++) {
    motes.push({
      x: Math.random(), y: Math.random(),
      r: rand(0.4, 1.8), s: rand(0.006, 0.05),
      tw: Math.random() * 6.28,
      gold: Math.random() < 0.35,
    });
  }
}

function paintSky(t) {
  const w = skyCanvas.width, h = skyCanvas.height;
  skyCtx.clearRect(0, 0, w, h);

  // a low band of village light, so the page is never flat black
  const g = skyCtx.createRadialGradient(w * 0.5, h * 1.15, 0, w * 0.5, h * 1.15, h * 0.95);
  g.addColorStop(0, 'rgba(26,36,80,.55)');
  g.addColorStop(0.6, 'rgba(13,20,48,.22)');
  g.addColorStop(1, 'rgba(4,6,15,0)');
  skyCtx.fillStyle = g;
  skyCtx.fillRect(0, 0, w, h);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const m of motes) {
    m.y -= m.s * 0.0016;
    if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.002 + m.tw));
    skyCtx.globalAlpha = tw * 0.55;
    skyCtx.fillStyle = m.gold ? '#ffc736' : '#4fd8ff';
    skyCtx.beginPath();
    skyCtx.arc(m.x * w, m.y * h, m.r * dpr, 0, 6.2832);
    skyCtx.fill();
  }
  skyCtx.globalAlpha = 1;
}

/* ═══════════════ click sparks ═══════════════ */
const sparkCanvas = document.getElementById('sparkCanvas');
let sparkCtx = fitCanvas(sparkCanvas);
const sparks = [];

function burst(x, y, n = 16, hue = 'gold', power = 1) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.2832 + Math.random() * 0.4;
    const sp = rand(2.5, 9) * power;
    sparks.push({
      x: x * dpr, y: y * dpr,
      vx: Math.cos(a) * sp * dpr, vy: Math.sin(a) * sp * dpr,
      life: 1, decay: rand(0.016, 0.04), hue,
    });
  }
}

function paintSparks() {
  const w = sparkCanvas.width, h = sparkCanvas.height;
  sparkCtx.clearRect(0, 0, w, h);
  sparkCtx.lineCap = 'round';
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx; s.y += s.vy;
    s.vx *= 0.93; s.vy *= 0.93;
    s.life -= s.decay;
    if (s.life <= 0) { sparks.splice(i, 1); continue; }
    sparkCtx.globalAlpha = s.life;
    sparkCtx.strokeStyle = s.hue === 'gold' ? '#ffd85c' : '#7ee6ff';
    sparkCtx.lineWidth = 1.6 * s.life + 0.4;
    sparkCtx.beginPath();
    sparkCtx.moveTo(s.x, s.y);
    sparkCtx.lineTo(s.x - s.vx * 2.2, s.y - s.vy * 2.2);
    sparkCtx.stroke();
  }
  sparkCtx.globalAlpha = 1;
}

addEventListener('pointerdown', e => {
  if (reduceMotion) return;
  burst(e.clientX, e.clientY, 18, 'gold');
}, { passive: true });

/* ── the hiraishin wipe ── */
const flashWipe = document.getElementById('flashWipe');
function fireFlash() {
  if (reduceMotion) return;
  flashWipe.classList.remove('fire');
  void flashWipe.offsetWidth;
  flashWipe.classList.add('fire');
}
document.querySelectorAll('.chrome__nav a, .magnet').forEach(a => {
  a.addEventListener('click', fireFlash);
});

/* ═══════════════ ACT I — scroll-scrubbed awakening ═══════════════ */
const scrubSection = document.getElementById('top');
const gazeCanvas   = document.getElementById('gazeCanvas');
const scrubWash    = document.getElementById('scrubWash');
const scrubReadout = document.getElementById('scrubReadout');
const scrubBars    = document.querySelectorAll('.scrub__bars i');
const titleblock   = document.getElementById('titleblock');
const phases       = [...document.querySelectorAll('.phase')];
let gazeCtx = fitCanvas(gazeCanvas);

let frameTarget = 0, frameShown = 0, lastDrawn = -1;
let scrubP = 0;

function readScrub() {
  const r = scrubSection.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  scrubP = clamp(-r.top / (span || 1));
  frameTarget = scrubP * (GAZE_COUNT - 1);
}

/* tuned to the footage: 1-16 closed · 17-30 opening · 31-52 sage · 53-71 flash.
   The first window starts late on purpose — the name owns the opening beat. */
const PHASE_WINDOWS = [
  [0.13, 0.18, 0.24, 0.31],
  [0.31, 0.37, 0.44, 0.51],
  [0.52, 0.58, 0.66, 0.73],
  [0.74, 0.80, 0.94, 1.03],
];

function paintScrubOverlays(p) {
  phases.forEach((el, i) => {
    const a = window4(p, ...PHASE_WINDOWS[i]);
    el.style.opacity = a.toFixed(3);
    el.style.transform = `translateX(-50%) translateY(${((1 - a) * 26).toFixed(1)}px)`;
    el.style.filter = `blur(${((1 - a) * 5).toFixed(2)}px)`;
  });

  // the name holds the opening beat, then clears out of his way
  const title = window4(p, -0.05, 0.01, 0.06, 0.14);
  titleblock.style.opacity = title.toFixed(3);
  titleblock.style.transform =
    `translate(-50%, -50%) scale(${(1 + (1 - title) * 0.06).toFixed(3)})`;

  // gold wash climbs with the aura in the second half
  scrubWash.style.opacity = clamp((p - 0.36) / 0.5).toFixed(3);

  // letterbox pinches in as he opens his eyes, then releases
  const bar = window4(p, 0.16, 0.3, 0.52, 0.72) * 7;
  scrubBars.forEach(b => { b.style.height = bar.toFixed(2) + 'vh'; });

  scrubReadout.textContent =
    `FRAME ${pad(Math.round(frameShown) + 1)} / ${pad(GAZE_COUNT)}`;
}

function paintScrub() {
  const r = scrubSection.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;

  frameShown = lerp(frameShown, frameTarget, 0.14);
  const idx = clamp(Math.round(frameShown), 0, GAZE_COUNT - 1);

  if (idx !== lastDrawn || stale(gazeCanvas)) {
    if (stale(gazeCanvas)) gazeCtx = fitCanvas(gazeCanvas);
    const w = gazeCanvas.width, h = gazeCanvas.height;
    gazeCtx.clearRect(0, 0, w, h);
    drawCover(gazeCtx, gazeFrames[idx], w, h, 2.1);
    lastDrawn = idx;
  }
  paintScrubOverlays(scrubP);
}

/* ═══════════════ velocity marquee ═══════════════ */
const veloRows = [...document.querySelectorAll('[data-velo]')].map(el => {
  // a second copy fills the gap the first one leaves as it slides out
  el.appendChild(el.firstElementChild.cloneNode(true));
  return { el, dir: parseFloat(el.dataset.velo), x: 0, width: 0 };
});

function measureVelo() {
  veloRows.forEach(r => { r.width = r.el.firstElementChild.offsetWidth || 1; });
}

function paintVelo(dt) {
  for (const r of veloRows) {
    // scroll speed feeds the marquee — the faster you move, the faster it runs
    r.x += r.dir * (0.05 + scrollVel * 1.1) * dt;
    if (r.width) r.x = ((r.x % r.width) + r.width) % r.width;
    r.el.style.transform = `translateX(${(-r.x).toFixed(1)}px)`;
  }
}

/* ═══════════════ ACT III — hiraishin bolts ═══════════════ */
const boltCanvas = document.getElementById('boltCanvas');
let boltCtx = fitCanvas(boltCanvas);
const bolts = [];

/* A jagged polyline between two points. More steps + a smaller spread reads as
   lightning; fewer steps + a wide spread reads as a geometric zigzag, which is
   what you get for free and what you do not want. */
function boltPath(x0, y0, x1, y1, jag = 1, steps = 9) {
  const pts = [[x0, y0]];
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const off = (Math.random() - 0.5) * len * (1.8 / steps) * jag * Math.sin(t * Math.PI);
    pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
  }
  pts.push([x1, y1]);
  return pts;
}

/* an ambient arc every so often, so the section is alive before you reach it */
let nextArc = 0;
function ambientArc(t) {
  if (t < nextArc || reduceMotion) return;
  nextArc = t + rand(1200, 3600);
  const w = boltCanvas.width, h = boltCanvas.height;
  const x0 = rand(0, w), y0 = rand(0, h * 0.5);
  bolts.push({
    pts: boltPath(x0, y0, x0 + rand(-w * 0.3, w * 0.3), y0 + rand(h * 0.2, h * 0.5), 1.4),
    life: 0.5, decay: 0.06,
  });
}

/* three passes per bolt: a wide gold haze, a gold channel, a white-hot core */
function strokeBolts(ctx, list, weight = 1) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.life -= b.decay;
    if (b.life <= 0) { list.splice(i, 1); continue; }
    const a = b.life;
    const w = (b.weight ?? 1) * weight;

    ctx.beginPath();
    ctx.moveTo(b.pts[0][0], b.pts[0][1]);
    for (let k = 1; k < b.pts.length; k++) ctx.lineTo(b.pts[k][0], b.pts[k][1]);

    ctx.shadowColor = 'rgba(255,199,54,.9)';
    ctx.shadowBlur = 26 * w;
    ctx.globalAlpha = a * 0.22;
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 14 * w;
    ctx.stroke();

    ctx.shadowBlur = 12 * w;
    ctx.globalAlpha = a * 0.75;
    ctx.strokeStyle = '#ffd85c';
    ctx.lineWidth = 4.5 * w;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#fffbe8';
    ctx.lineWidth = 1.5 * w;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function paintBolts(t) {
  const r = boltCanvas.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) { bolts.length = 0; return; }
  if (stale(boltCanvas)) boltCtx = fitCanvas(boltCanvas);
  ambientArc(t);
  boltCtx.clearRect(0, 0, boltCanvas.width, boltCanvas.height);
  strokeBolts(boltCtx, bolts);
}

/* ═══════════════ ACT IV — full-bleed dash ═══════════════ */
const dashSection = document.getElementById('dash');
const dashCanvas  = document.getElementById('dashCanvas');
const dashReadout = document.getElementById('dashReadout');
let dashCtx = fitCanvas(dashCanvas);
let dashDrawn = -1;

function paintDash() {
  const r = dashSection.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const span = r.height - window.innerHeight;
  const p = clamp(-r.top / (span || 1));

  // hold the first and last frame a beat so the section has edges
  const eased = clamp((p - 0.12) / 0.76);
  const idx = clamp(Math.round(eased * (DASH_COUNT - 1)), 0, DASH_COUNT - 1);

  if (idx !== dashDrawn || stale(dashCanvas)) {
    if (stale(dashCanvas)) dashCtx = fitCanvas(dashCanvas);
    const w = dashCanvas.width, h = dashCanvas.height;
    dashCtx.clearRect(0, 0, w, h);
    drawCover(dashCtx, dashFrames[idx], w, h, 2.4);
    dashDrawn = idx;
  }
  dashReadout.textContent = `${(idx * 0.002).toFixed(2)} s`;
}

/* ═══════════════ ACT V — rasengan tracked left to right ═══════════════ */
const rasSection = document.getElementById('rasengan');
const rasCanvas  = document.getElementById('rasCanvas');
const chakra     = document.getElementById('chakraCanvas');
const rasFill    = document.getElementById('rasFill');
const rasPos     = document.getElementById('rasPos');
const rasFrameEl = document.getElementById('rasFrame');
const rasTrack   = document.getElementById('rasTrack');
let rasCtx = fitCanvas(rasCanvas);
let chakraCtx = fitCanvas(chakra);

let handX = 0.5;      // raw pointer, 0..1 across the section
let easedX = 0.5;     // what the frames actually follow
let handVel = 0;
let rasDrawn = -1;
let touchedRas = false;

function trackHand(clientX) {
  const r = rasSection.getBoundingClientRect();
  const x = clamp((clientX - r.left) / Math.max(1, r.width));
  handVel = lerp(handVel, Math.abs(x - handX) * 60, 0.3);
  handX = x;
  if (!touchedRas) { touchedRas = true; rasTrack.classList.add('live'); }
}

rasSection.addEventListener('pointermove', e => trackHand(e.clientX), { passive: true });
rasSection.addEventListener('touchmove', e => {
  if (e.touches[0]) trackHand(e.touches[0].clientX);
}, { passive: true });

function paintRas(dt) {
  const r = rasSection.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;

  // before you touch it, the sphere drifts across on its own
  if (!touchedRas && !reduceMotion) handX = 0.5 + 0.42 * Math.sin(performance.now() * 0.00045);

  easedX = lerp(easedX, handX, 0.16);
  handVel *= Math.exp(-2.4 * dt / 1000);

  const idx = clamp(Math.round(easedX * (RAS_COUNT - 1)), 0, RAS_COUNT - 1);
  if (idx !== rasDrawn || stale(rasCanvas)) {
    if (stale(rasCanvas)) rasCtx = fitCanvas(rasCanvas);
    const w = rasCanvas.width, h = rasCanvas.height;
    rasCtx.clearRect(0, 0, w, h);
    drawCover(rasCtx, rasFrames[idx], w, h, 2.2);
    rasDrawn = idx;
  }

  rasFill.style.width = (easedX * 100).toFixed(1) + '%';
  rasPos.textContent = `位置 ${easedX < 0.5 ? '左' : '右'} ${String(Math.round(easedX * 100)).padStart(2, '0')}%`;
  rasFrameEl.textContent = `FRAME ${String(idx + 1).padStart(2, '0')} / ${RAS_COUNT}`;
  rasTrack.style.setProperty('--x', (easedX * 100).toFixed(1) + '%');

  paintChakra(dt);
}

/* chakra motes that hang around the sphere and get dragged along with it */
const orbit = [];
function seedOrbit() {
  orbit.length = 0;
  const n = coarse ? 50 : 110;
  for (let i = 0; i < n; i++) {
    orbit.push({
      a: Math.random() * 6.2832,
      r: rand(0.04, 0.16),
      sp: rand(0.4, 1.6),
      z: rand(0.3, 1),
    });
  }
}

function paintChakra(dt) {
  if (stale(chakra)) chakraCtx = fitCanvas(chakra);
  const w = chakra.width, h = chakra.height;
  chakraCtx.clearRect(0, 0, w, h);

  // the sphere sits roughly where the frames put it: it sweeps the full width
  const cx = lerp(w * 0.24, w * 0.76, easedX);
  const cy = h * 0.56;
  const R = Math.min(w, h);
  const drive = 0.0012 + handVel * 0.0009;

  chakraCtx.globalCompositeOperation = 'lighter';
  for (const p of orbit) {
    p.a += drive * p.sp * dt;
    const x = cx + Math.cos(p.a) * p.r * R;
    const y = cy + Math.sin(p.a) * p.r * R * 0.9;
    chakraCtx.globalAlpha = (0.10 + Math.min(handVel, 1) * 0.4) * p.z;
    chakraCtx.fillStyle = p.z > 0.72 ? '#dff6ff' : '#4fd8ff';
    chakraCtx.beginPath();
    chakraCtx.arc(x, y, (0.8 + p.z) * 1.6, 0, 6.2832);
    chakraCtx.fill();
  }
  chakraCtx.globalCompositeOperation = 'source-over';
  chakraCtx.globalAlpha = 1;
}

/* ═══════════════ ACT VI — legacy: ghost cursor + thunder ═══════════════ */
const legacy = document.getElementById('legacy');
const legacyPlate = document.querySelector('.legacy__plate');
const legacyReveal = document.getElementById('legacyReveal');
const legacyFlash = document.getElementById('legacyFlash');
const ghostCanvas = document.getElementById('ghostCanvas');
const thunderCanvas = document.getElementById('thunderCanvas');
let thunderCtx = fitCanvas(thunderCanvas);

let ghost = { resize() {}, move() {}, leave() {}, render() {}, ok: false };
import('./ghost-cursor.js')
  .then(({ createGhostCursor }) => {
    ghost = createGhostCursor(ghostCanvas, {
      color: '#ffc736',     // hiraishin gold
      trailLength: 28,
      brightness: 1.1,      // the plate is near-black now, so the smoke can run hot
      edgeIntensity: 0.4,
      fadeDelayMs: 700,
      fadeDurationMs: 1200,
    });
    ghost.resize();
    legacy.classList.toggle('has-ghost', ghost.ok);
  })
  .catch(() => {});

legacy.addEventListener('pointermove', e => {
  const r = legacy.getBoundingClientRect();
  const px = (e.clientX - r.left) / Math.max(1, r.width);
  const py = (e.clientY - r.top) / Math.max(1, r.height);
  ghost.move(px, py, true);
  // the torch mask follows the pointer
  legacy.style.setProperty('--rx', (px * 100).toFixed(2) + '%');
  legacy.style.setProperty('--ry', (py * 100).toFixed(2) + '%');
  legacy.classList.add('lit');
}, { passive: true });
legacy.addEventListener('pointerleave', () => {
  ghost.leave();
  legacy.classList.remove('lit');
}, { passive: true });

/* ── yellow thunder, viewport-wide: it runs over every act, not just the last ── */
const THUNDER_EVERY = 420;
const thunder = [];
let nextStrike = 0;

/* one channel dropped from above the fold to somewhere down the screen */
function dropBolt(w, h, x0, reach = 1) {
  const x1 = x0 + rand(-w * 0.2, w * 0.2);
  const y1 = rand(h * 0.45, h * 1.05) * reach;
  const main = boltPath(x0, -h * 0.08, x1, y1, 1, 24);
  thunder.push({ pts: main, life: 1, decay: 0.16, weight: 1 });

  // one or two forks peeling off the main channel
  const forks = 1 + ((Math.random() * 2) | 0);
  for (let f = 0; f < forks; f++) {
    const k = 6 + ((Math.random() * (main.length - 10)) | 0);
    const [fx, fy] = main[clamp(k, 1, main.length - 2)];
    thunder.push({
      pts: boltPath(fx, fy, fx + rand(-w * 0.16, w * 0.16), fy + rand(h * 0.12, h * 0.32), 1.2, 12),
      life: 0.7, decay: 0.2, weight: 0.55,
    });
  }
}

function strikeThunder() {
  const w = thunderCanvas.width, h = thunderCanvas.height;
  if (!w || !h) return;

  // two or three channels per strike, spread across thirds so the storm
  // reads as full-width instead of one lonely bolt in the middle
  const lanes = [0.18, 0.5, 0.82].sort(() => Math.random() - 0.5);
  const n = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < n; i++) {
    dropBolt(w, h, w * lanes[i % lanes.length] + rand(-w * 0.12, w * 0.12), 0.7 + Math.random() * 0.4);
  }

  legacyFlash.classList.remove('fire');
  void legacyFlash.offsetWidth;
  legacyFlash.classList.add('fire');
}

function paintThunder(t) {
  if (stale(thunderCanvas)) thunderCtx = fitCanvas(thunderCanvas);
  if (!reduceMotion && t >= nextStrike) {
    nextStrike = t + THUNDER_EVERY * (0.7 + Math.random() * 0.6);
    strikeThunder();
  }
  thunderCtx.clearRect(0, 0, thunderCanvas.width, thunderCanvas.height);
  strokeBolts(thunderCtx, thunder);
}

function paintLegacy() {
  const r = legacy.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const centred = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
  // the torch copy has to ride the exact same parallax or it won't register
  const t = `scale(1.14) translate3d(0, ${(centred * -46).toFixed(1)}px, 0)`;
  legacyPlate.style.transform = t;
  legacyReveal.style.transform = t;
  ghost.render();
}

/* ═══════════════ cursor + chrome ═══════════════ */
const cursorEl = document.getElementById('cursor');
let curX = innerWidth / 2, curY = innerHeight / 2, cx = curX, cy = curY;

addEventListener('pointermove', e => { curX = e.clientX; curY = e.clientY; }, { passive: true });
document.querySelectorAll('a, .tilt, .stat, .ras__sticky').forEach(el => {
  el.addEventListener('pointerenter', () => cursorEl.classList.add('hot'));
  el.addEventListener('pointerleave', () => cursorEl.classList.remove('hot'));
});

const railScroll   = document.getElementById('railScroll');
const chromeClock  = document.getElementById('chromeClock');
const heroHint     = document.getElementById('heroHint');
const badge = document.getElementById('badge');
let lastY = scrollY, scrollVel = 0;

function readScroll() {
  const y = scrollY;
  const d = y - lastY;
  scrollVel = lerp(scrollVel, Math.min(Math.abs(d) / 40, 1), 0.12);
  lastY = y;
  railScroll.textContent = `SPEED ${String(Math.round(scrollVel * 999)).padStart(3, '0')}`;
  heroHint.classList.toggle('hide', y > innerHeight * 0.35);
  badge.classList.toggle('show', y > innerHeight * 0.6);
}

/* ═══════════════ resize ═══════════════ */
function resizeAll() {
  skyCtx = fitCanvas(skyCanvas);
  sparkCtx = fitCanvas(sparkCanvas);
  gazeCtx = fitCanvas(gazeCanvas);
  dashCtx = fitCanvas(dashCanvas);
  rasCtx = fitCanvas(rasCanvas);
  chakraCtx = fitCanvas(chakra);
  boltCtx = fitCanvas(boltCanvas);
  thunderCtx = fitCanvas(thunderCanvas);
  lastDrawn = -1; rasDrawn = -1; dashDrawn = -1;
  seedSky(); seedOrbit(); measureVelo();
  layoutParticles();
  particles?.resize();
  ghost.resize();
}
addEventListener('resize', resizeAll, { passive: true });

/* ═══════════════ one loop ═══════════════ */
seedSky(); seedOrbit(); measureVelo();

let prev = performance.now();
const clock0 = performance.now();

function frame(t) {
  const dt = Math.min(t - prev, 50);
  prev = t;

  readScroll();
  readScrub();

  cx = lerp(cx, curX, 0.22);
  cy = lerp(cy, curY, 0.22);
  cursorEl.style.transform = `translate(${cx}px, ${cy}px)`;

  if (!reduceMotion) paintSky(t);
  paintSparks();
  paintScrub();
  paintVelo(dt);
  paintBolts(t);
  paintDash();
  paintRas(dt);
  paintThunder(t);
  paintLegacy();

  chromeClock.textContent = ((t - clock0) / 1000).toFixed(1) + ' s';

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
