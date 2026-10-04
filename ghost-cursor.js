/* ═══════════════════════════════════════════════════════════
   GHOST CURSOR
   Port of reactbits.dev/animations/ghost-cursor (three.js) to raw
   WebGL — same fbm-smoke fragment shader and trail ring-buffer,
   minus the dependency. Bloom/film-grain passes are dropped; the
   page already grains globally.
   ═══════════════════════════════════════════════════════════ */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function createGhostCursor(canvas, opts = {}) {
  const TRAIL   = opts.trailLength ?? 28;
  const INERTIA = opts.inertia ?? 0.5;
  const MAX_DPR = opts.maxDevicePixelRatio ?? 0.45;
  const BUDGET  = opts.targetPixels ?? 4.2e5;
  const BRIGHT  = opts.brightness ?? 1.45;
  const EDGE    = opts.edgeIntensity ?? 0.35;
  const FADE_DELAY = opts.fadeDelayMs ?? 900;
  const FADE_DUR   = opts.fadeDurationMs ?? 1400;
  const rgb = hexToRgb(opts.color ?? '#ffc736');

  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: 'high-performance',
  });
  const dead = { resize() {}, move() {}, leave() {}, render() {}, ok: false };
  if (!gl) return dead;

  const VERT = `
    attribute vec2 aPos;
    void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  /* fragment shader: verbatim from the react-bits component */
  const FRAG = `
    precision highp float;
    #define MAX_TRAIL_LENGTH ${TRAIL}

    uniform float iTime;
    uniform vec3  iResolution;
    uniform vec2  iMouse;
    uniform vec2  iPrevMouse[MAX_TRAIL_LENGTH];
    uniform float iOpacity;
    uniform float iScale;
    uniform vec3  iBaseColor;
    uniform float iBrightness;
    uniform float iEdgeIntensity;

    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453123); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f *= f * (3. - 2. * f);
      return mix(mix(hash(i + vec2(0.,0.)), hash(i + vec2(1.,0.)), f.x),
                 mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), f.x), f.y);
    }
    float fbm(vec2 p){
      float v = 0.0;
      float a = 0.5;
      mat2 m = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
      for(int i=0;i<5;i++){
        v += a * noise(p);
        p = m * p * 2.0;
        a *= 0.5;
      }
      return v;
    }
    vec3 tint1(vec3 base){ return mix(base, vec3(1.0), 0.15); }
    vec3 tint2(vec3 base){ return mix(base, vec3(0.8, 0.9, 1.0), 0.25); }

    vec4 blob(vec2 p, vec2 mousePos, float intensity, float activity) {
      vec2 q = vec2(fbm(p * iScale + iTime * 0.1), fbm(p * iScale + vec2(5.2,1.3) + iTime * 0.1));
      vec2 r = vec2(fbm(p * iScale + q * 1.5 + iTime * 0.15), fbm(p * iScale + q * 1.5 + vec2(8.3,2.8) + iTime * 0.15));

      float smoke = fbm(p * iScale + r * 0.8);
      float radius = 0.5 + 0.3 * (1.0 / iScale);
      float distFactor = 1.0 - smoothstep(0.0, radius * activity, length(p - mousePos));
      float alpha = pow(smoke, 2.5) * distFactor;

      vec3 c1 = tint1(iBaseColor);
      vec3 c2 = tint2(iBaseColor);
      vec3 color = mix(c1, c2, sin(iTime * 0.5) * 0.5 + 0.5);

      return vec4(color * alpha * intensity, alpha * intensity);
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy / iResolution.xy * 2.0 - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);
      vec2 mouse = (iMouse * 2.0 - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);

      vec3 colorAcc = vec3(0.0);
      float alphaAcc = 0.0;

      vec4 b = blob(uv, mouse, 1.0, iOpacity);
      colorAcc += b.rgb;
      alphaAcc += b.a;

      for (int i = 0; i < MAX_TRAIL_LENGTH; i++) {
        vec2 pm = (iPrevMouse[i] * 2.0 - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);
        float t = 1.0 - float(i) / float(MAX_TRAIL_LENGTH);
        t = pow(t, 2.0);
        if (t > 0.01) {
          vec4 bt = blob(uv, pm, t * 0.8, iOpacity);
          colorAcc += bt.rgb;
          alphaAcc += bt.a;
        }
      }

      colorAcc *= iBrightness;

      vec2 uv01 = gl_FragCoord.xy / iResolution.xy;
      float edgeDist = min(min(uv01.x, 1.0 - uv01.x), min(uv01.y, 1.0 - uv01.y));
      float distFromEdge = clamp(edgeDist * 2.0, 0.0, 1.0);
      float k = clamp(iEdgeIntensity, 0.0, 1.0);
      float edgeMask = mix(1.0 - k, 1.0, distFromEdge);

      float outAlpha = clamp(alphaAcc * iOpacity * edgeMask, 0.0, 1.0);
      gl_FragColor = vec4(colorAcc, outAlpha);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('ghost shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return dead;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return dead;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = n => gl.getUniformLocation(prog, n);
  const uTime = U('iTime'), uRes = U('iResolution'), uMouse = U('iMouse'),
        uPrev = U('iPrevMouse[0]'), uOpacity = U('iOpacity'), uScale = U('iScale'),
        uColor = U('iBaseColor'), uBright = U('iBrightness'), uEdge = U('iEdgeIntensity');

  gl.uniform3f(uColor, rgb[0], rgb[1], rgb[2]);
  gl.uniform1f(uBright, BRIGHT);
  gl.uniform1f(uEdge, EDGE);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  /* trail ring buffer, exactly as the original */
  const trail = new Float32Array(TRAIL * 2).fill(0.5);
  const flat  = new Float32Array(TRAIL * 2).fill(0.5);
  let head = 0;

  const target = { x: 0.5, y: 0.5 };
  const cur    = { x: 0.5, y: 0.5 };
  const vel    = { x: 0, y: 0 };
  let pointerActive = false;
  let lastMove = performance.now();
  let fade = 0;
  const t0 = performance.now();

  function resize() {
    const cssW = canvas.offsetWidth, cssH = canvas.offsetHeight;
    if (cssW <= 0 || cssH <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const need = cssW * cssH * dpr * dpr;
    const s = need <= BUDGET ? 1 : Math.max(0.4, Math.min(1, Math.sqrt(BUDGET / Math.max(1, need))));
    const pr = dpr * s;
    const w = Math.max(1, Math.floor(cssW * pr));
    const h = Math.max(1, Math.floor(cssH * pr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.uniform3f(uRes, w, h, 1);
    // matches calculateScale(): smaller side vs a 600px baseline
    const base = Math.min(Math.max(1, cssW), Math.max(1, cssH));
    gl.uniform1f(uScale, Math.max(0.5, Math.min(2.0, base / 600)));
  }

  /* x,y normalised to the element box; y is flipped for GL */
  function move(x, y, active = true) {
    target.x = clamp(x); target.y = clamp(1 - y);
    pointerActive = active;
    if (active) { lastMove = performance.now(); fade = 1; }
  }
  function leave() { pointerActive = false; lastMove = performance.now(); }

  function render() {
    const now = performance.now();

    if (pointerActive) {
      vel.x = target.x - cur.x; vel.y = target.y - cur.y;
      cur.x = target.x; cur.y = target.y;
      fade = 1;
    } else {
      vel.x *= INERTIA; vel.y *= INERTIA;
      if (vel.x * vel.x + vel.y * vel.y > 1e-6) { cur.x += vel.x; cur.y += vel.y; }
      const dt = now - lastMove;
      if (dt > FADE_DELAY) fade = Math.max(0, 1 - Math.min(1, (dt - FADE_DELAY) / FADE_DUR));
    }
    if (fade <= 0.001 && !pointerActive) { gl.clear(gl.COLOR_BUFFER_BIT); return false; }

    head = (head + 1) % TRAIL;
    trail[head * 2] = cur.x; trail[head * 2 + 1] = cur.y;
    for (let i = 0; i < TRAIL; i++) {
      const src = ((head - i) % TRAIL + TRAIL) % TRAIL;
      flat[i * 2] = trail[src * 2];
      flat[i * 2 + 1] = trail[src * 2 + 1];
    }

    gl.useProgram(prog);
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.uniform2f(uMouse, cur.x, cur.y);
    gl.uniform2fv(uPrev, flat);
    gl.uniform1f(uOpacity, fade);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  return { resize, move, leave, render, ok: true };
}

export default createGhostCursor;
