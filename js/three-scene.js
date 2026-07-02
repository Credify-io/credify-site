/* "Capital Streams" + floating Credify card.
   One persistent fixed canvas per page. Scroll scrubs a keyframe rig that
   flies a 3D credit card through the page story (home only) while the
   emerald particle field breathes behind it. The card's face is a live
   CanvasTexture - the calculator total renders ONTO the card.

   Perf contract: particles = single Points draw call computed analytically
   in the vertex shader; card = 3 meshes + 1 sprite + 4 lights; DPR clamped;
   render-on-demand when idle; frame-time watchdog degrades then falls back
   to the static (no-3d) treatment. */
import * as THREE from 'three';

const EMERALD = new THREE.Color('#a7f3d0');

const isCoarse = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 820;

/* Keyframe fields:
   camZ/camY  camera dolly        fx/fy  particle convergence point
   b          field brightness    glow   card halo intensity
   cx/cy/cz   card position       rx/ry/rz  card rotation (ry accumulates,
   cs         card scale          so the card rolls forward down the page) */
const PAGE_CONFIGS = {
  home: {
    count: isCoarse ? 12000 : 45000,
    card: true,
    keyframes: [
      { at: 0.00, camZ: 8.0,  camY: 0.0,  fx: 2.2,  fy: 0.4,  b: 1.00, cx: 2.7,  cy: -0.15, cz: 1.2,  rx: -0.15, ry: -0.55, rz: -0.10, cs: 1.00, glow: 0.55 }, // hero: three-quarter float, right of headline
      { at: 0.10, camZ: 7.6,  camY: -0.3, fx: 0.0,  fy: 0.0,  b: 0.70, cx: -2.6, cy: -0.40, cz: 0.8,  rx: -0.10, ry: 0.70,  rz: 0.12,  cs: 0.90, glow: 0.35 }, // stats: sweep left
      { at: 0.22, camZ: 9.0,  camY: -0.6, fx: -2.0, fy: 0.5,  b: 0.38, cx: 2.5,  cy: -0.35, cz: 0.5,  rx: 0.00,  ry: 3.14,  rz: 0.06,  cs: 0.85, glow: 0.30 }, // comparison: flip to back face, sweep right
      { at: 0.34, camZ: 9.0,  camY: -0.4, fx: 2.0,  fy: -0.5, b: 0.50, cx: 0.0,  cy: -0.45, cz: -0.5, rx: -0.35, ry: 5.20,  rz: 0.00,  cs: 0.80, glow: 0.35 }, // process: roll through center
      { at: 0.48, camZ: 10.0, camY: -0.8, fx: 0.0,  fy: 0.0,  b: 0.30, cx: 0.0,  cy: 0.25,  cz: -3.5, rx: -0.15, ry: 6.28,  rz: 0.00,  cs: 0.70, glow: 0.15 }, // services: recede deep
      { at: 0.58, camZ: 10.0, camY: -0.4, fx: -1.0, fy: 0.3,  b: 0.42, cx: -2.4, cy: -0.45, cz: 0.0,  rx: -1.05, ry: 7.00,  rz: 0.15,  cs: 0.80, glow: 0.30 }, // testimonials: lie flat like on a desk
      { at: 0.72, camZ: 8.0,  camY: 0.0,  fx: 0.0,  fy: 0.2,  b: 0.90, cx: 0.0,  cy: 0.10,  cz: 1.8,  rx: -0.12, ry: 12.57, rz: 0.00,  cs: 1.12, glow: 0.90 }, // calculator: spin up to face you, live total on card
      { at: 0.88, camZ: 7.4,  camY: 0.0,  fx: 0.0,  fy: 0.5,  b: 1.00, cx: 0.0,  cy: -0.55, cz: 1.0,  rx: -0.20, ry: 13.60, rz: 0.05,  cs: 0.95, glow: 1.00 }, // capture + CTA: converge
      { at: 1.00, camZ: 7.4,  camY: 0.0,  fx: 0.0,  fy: 0.8,  b: 0.65, cx: 0.0,  cy: 1.20,  cz: -1.0, rx: -0.30, ry: 14.50, rz: 0.00,  cs: 0.80, glow: 0.55 }, // footer: drift up and away
    ],
  },
  solutions: {
    count: isCoarse ? 8000 : 15000,
    card: false,
    keyframes: [
      { at: 0.00, camZ: 8.5, camY: 0.0,  fx: 1.5,  fy: 0.3,  b: 0.85 },
      { at: 0.25, camZ: 9.0, camY: -0.4, fx: -1.5, fy: 0.0,  b: 0.30 },
      { at: 0.60, camZ: 9.5, camY: -0.6, fx: 1.5,  fy: -0.3, b: 0.25 },
      { at: 0.90, camZ: 8.0, camY: 0.0,  fx: 0.0,  fy: 0.4,  b: 0.85 },
      { at: 1.00, camZ: 8.0, camY: 0.0,  fx: 0.0,  fy: 0.6,  b: 0.60 },
    ],
  },
  apply: {
    count: isCoarse ? 5000 : 8000,
    card: false,
    keyframes: [
      { at: 0.00, camZ: 9.0, camY: 0.0, fx: 1.8, fy: 0.5, b: 0.70 },
      { at: 0.30, camZ: 9.0, camY: 0.0, fx: 0.0, fy: 0.0, b: 0.30 },
      { at: 1.00, camZ: 9.0, camY: 0.0, fx: 0.0, fy: 0.0, b: 0.25 },
    ],
  },
};

const VERT = /* glsl */ `
  attribute vec3 aSeed;
  attribute float aSpeed;
  attribute float aSize;
  attribute float aMix;
  uniform float uTime;
  uniform vec3 uFocus;
  uniform float uIntensity;
  varying float vT;
  varying float vMix;

  void main() {
    // Analytic streamline: each particle's whole trajectory is a function of
    // its seed and time - zero CPU attribute updates per frame.
    float t = fract(aSeed.x + uTime * aSpeed * (0.5 + 0.5 * uIntensity));
    float tt = pow(t, 1.15);
    float side = sign(aSeed.y - 0.5);
    float spread = mix(4.5, 0.25, pow(tt, 1.5));

    vec3 p;
    p.x = mix(16.0 * side, uFocus.x, tt);
    p.y = uFocus.y
        + (fract(aSeed.y * 13.7) * 2.0 - 1.0) * spread * 0.5
        + sin(tt * 12.566 + aSeed.z * 6.2832 + uTime * 0.5) * 0.4 * (1.0 - tt);
    p.z = (aSeed.z * 2.0 - 1.0) * spread * 0.8
        + cos(tt * 9.42 + aSeed.x * 6.2832 + uTime * 0.35) * 0.35 * (1.0 - tt);

    vT = tt;
    vMix = aMix;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * (48.0 / -mv.z) * (0.3 + 0.7 * tt);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying float vT;
  varying float vMix;
  uniform float uBrightness;
  uniform float uIntensity;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.05, d);
    vec3 emerald = vec3(0.655, 0.953, 0.816);
    vec3 pearl = vec3(0.95, 0.97, 0.95);
    vec3 col = mix(emerald, pearl, vMix * 0.15 + vT * 0.12);
    // Keep per-particle alpha tiny: 45k additive points saturate fast.
    float alpha = a * (0.025 + 0.12 * vT) * uBrightness * (0.5 + 0.5 * uIntensity);
    alpha *= smoothstep(0.0, 0.15, vT); // fade births so screen edges stay clean
    gl_FragColor = vec4(col, alpha);
  }
`;

function buildParticles(count) {
  const geo = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const mixes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    seeds[i * 3] = Math.random();
    seeds[i * 3 + 1] = Math.random();
    seeds[i * 3 + 2] = Math.random();
    speeds[i] = 0.015 + Math.random() * 0.05;
    sizes[i] = 0.5 + Math.random() * 1.0;
    mixes[i] = Math.random();
  }
  // Positions are computed in the shader; the attribute just has to exist.
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aMix', new THREE.BufferAttribute(mixes, 1));
  // The whole field lives within +/-16 world units; skip per-frame culling math.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 40);
  return geo;
}

const LERP_KEYS = ['camZ', 'camY', 'fx', 'fy', 'b', 'cx', 'cy', 'cz', 'rx', 'ry', 'rz', 'cs', 'glow'];

function sampleKeyframes(frames, p) {
  if (p <= frames[0].at) return { ...frames[0] };
  const last = frames[frames.length - 1];
  if (p >= last.at) return { ...last };
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    if (p >= a.at && p <= b.at) {
      const t = (p - a.at) / (b.at - a.at);
      const e = t * t * (3 - 2 * t); // smoothstep
      const out = {};
      LERP_KEYS.forEach((k) => {
        if (a[k] !== undefined) out[k] = a[k] + (b[k] - a[k]) * e;
      });
      return out;
    }
  }
  return { ...last };
}

/* ---------------- Card face textures (CanvasTexture) ---------------- */

const TEX_W = 1024, TEX_H = 644, TEX_R = 52;

function roundRectPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function cardBase(ctx) {
  ctx.clearRect(0, 0, TEX_W, TEX_H);
  roundRectPath(ctx, 0, 0, TEX_W, TEX_H, TEX_R);
  ctx.save();
  ctx.clip();
  // body: near-black vertical sheen
  const g = ctx.createLinearGradient(0, 0, TEX_W, TEX_H);
  g.addColorStop(0, '#28322e');
  g.addColorStop(0.45, '#121715');
  g.addColorStop(1, '#0a0d0c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // emerald ambient top-right
  const rg = ctx.createRadialGradient(TEX_W * 0.9, TEX_H * 0.05, 40, TEX_W * 0.9, TEX_H * 0.05, 620);
  rg.addColorStop(0, 'rgba(167,243,208,0.30)');
  rg.addColorStop(1, 'rgba(167,243,208,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // diagonal specular band
  const sg = ctx.createLinearGradient(0, TEX_H, TEX_W, 0);
  sg.addColorStop(0.42, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  sg.addColorStop(0.58, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.restore();
  // hairline rim
  roundRectPath(ctx, 1.5, 1.5, TEX_W - 3, TEX_H - 3, TEX_R - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.34)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawFront(ctx, total) {
  cardBase(ctx);
  const sans = (w, s) => `${w} ${s}px Geist, system-ui, sans-serif`;
  const mono = (w, s) => `${w} ${s}px "Geist Mono", Menlo, monospace`;

  // wordmark
  ctx.fillStyle = '#ffffff';
  ctx.font = sans(700, 76);
  ctx.fillText('Credify', 64, 128);
  // pip
  ctx.fillStyle = '#a7f3d0';
  ctx.beginPath(); ctx.arc(348, 102, 10, 0, 6.2832); ctx.fill();
  // holo disc top-right
  const hg = ctx.createRadialGradient(TEX_W - 130, 120, 6, TEX_W - 130, 120, 66);
  hg.addColorStop(0, 'rgba(167,243,208,0.85)');
  hg.addColorStop(0.4, 'rgba(167,243,208,0.25)');
  hg.addColorStop(1, 'rgba(167,243,208,0)');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(TEX_W - 130, 120, 66, 0, 6.2832); ctx.fill();

  // chip
  const cg = ctx.createLinearGradient(64, 236, 224, 356);
  cg.addColorStop(0, '#e4e0d0');
  cg.addColorStop(1, '#8f8b7c');
  roundRectPath(ctx, 64, 236, 160, 120, 20);
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(64, 236 + i * 40); ctx.lineTo(224, 236 + i * 40); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(144, 236); ctx.lineTo(144, 356); ctx.stroke();

  // number
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = mono(500, 56);
  ctx.fillText('••••  ••••  ••••  8400', 64, 468);

  // label + live total
  ctx.fillStyle = 'rgba(255,255,255,0.52)';
  ctx.font = mono(600, 25);
  ctx.fillText('A P P R O V E D   C A P I T A L', 64, 530);
  ctx.fillStyle = '#a7f3d0';
  ctx.font = sans(700, 68);
  ctx.fillText(total, 64, 600);

  // guarantee mark bottom-right
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.font = mono(600, 23);
  ctx.textAlign = 'right';
  ctx.fillText('$100K MIN · GUARANTEED', TEX_W - 64, 596);
  ctx.textAlign = 'left';
}

function drawBack(ctx) {
  cardBase(ctx);
  const mono = (w, s) => `${w} ${s}px "Geist Mono", Menlo, monospace`;
  const sans = (w, s) => `${w} ${s}px Geist, system-ui, sans-serif`;
  // mag stripe
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 70, TEX_W, 120);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, 70, TEX_W, 4);
  ctx.fillRect(0, 186, TEX_W, 4);
  // signature strip
  roundRectPath(ctx, 64, 250, 620, 90, 10);
  ctx.fillStyle = 'rgba(244,242,236,0.88)';
  ctx.fill();
  ctx.fillStyle = 'rgba(10,10,10,0.85)';
  ctx.font = `italic 600 52px Georgia, serif`;
  ctx.fillText('Credify', 92, 314);
  // CVC chip
  roundRectPath(ctx, 712, 250, 130, 90, 10);
  ctx.fillStyle = 'rgba(167,243,208,0.14)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(167,243,208,0.4)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#a7f3d0';
  ctx.font = mono(600, 44);
  ctx.fillText('100', 738, 312);
  // footer lines
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.font = sans(600, 34);
  ctx.fillText('Fund@getcredify.io', 64, 452);
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font = mono(500, 25);
  ctx.fillText('100+ CAPITAL PARTNERS · $840M PLACED · 1,280 FILES CLOSED', 64, 520);
  ctx.fillStyle = 'rgba(167,243,208,0.6)';
  ctx.font = mono(600, 23);
  ctx.fillText('MAKING THE IMPOSSIBLE POSSIBLE', 64, 580);
}

function makeHaloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  g.addColorStop(0, 'rgba(167,243,208,0.55)');
  g.addColorStop(0.35, 'rgba(167,243,208,0.16)');
  g.addColorStop(1, 'rgba(167,243,208,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function buildCard(renderer) {
  const CARD_W = 3.4, CARD_H = 2.14, CARD_T = 0.045;
  const group = new THREE.Group();

  const frontCanvas = document.createElement('canvas');
  frontCanvas.width = TEX_W; frontCanvas.height = TEX_H;
  const frontCtx = frontCanvas.getContext('2d');
  drawFront(frontCtx, '$128,000');
  const frontTex = new THREE.CanvasTexture(frontCanvas);

  const backCanvas = document.createElement('canvas');
  backCanvas.width = TEX_W; backCanvas.height = TEX_H;
  const backCtx = backCanvas.getContext('2d');
  drawBack(backCtx);
  const backTex = new THREE.CanvasTexture(backCanvas);

  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  [frontTex, backTex].forEach((t) => {
    t.anisotropy = aniso;
    t.colorSpace = THREE.SRGBColorSpace;
  });

  // thin metal body (slightly inset so the rounded texture corners read)
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(CARD_W * 0.984, CARD_H * 0.975, CARD_T),
    new THREE.MeshStandardMaterial({ color: 0x1b221f, metalness: 0.9, roughness: 0.26 })
  );
  group.add(body);

  const faceGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
  const front = new THREE.Mesh(
    faceGeo,
    new THREE.MeshStandardMaterial({
      map: frontTex, transparent: true, metalness: 0.35, roughness: 0.38,
      emissive: 0xffffff, emissiveMap: frontTex, emissiveIntensity: 0.9,
    })
  );
  front.position.z = CARD_T / 2 + 0.001;
  group.add(front);

  const back = new THREE.Mesh(
    faceGeo,
    new THREE.MeshStandardMaterial({
      map: backTex, transparent: true, metalness: 0.35, roughness: 0.38,
      emissive: 0xffffff, emissiveMap: backTex, emissiveIntensity: 0.9,
    })
  );
  back.position.z = -(CARD_T / 2 + 0.001);
  back.rotation.y = Math.PI;
  group.add(back);

  // emerald halo behind the card
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeHaloTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.5,
  }));
  halo.scale.set(7, 7, 1);

  // redraw with real fonts once loaded, and with live calculator totals
  const redrawFront = (total) => {
    drawFront(frontCtx, total);
    frontTex.needsUpdate = true;
  };
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      redrawFront(lastTotal);
      drawBack(backCtx);
      backTex.needsUpdate = true;
    });
  }
  let lastTotal = '$128,000';
  let redrawTimer = null;
  window.addEventListener('credify:calc', (e) => {
    const t = e.detail && e.detail.totalLabel;
    if (!t || t === lastTotal) return;
    lastTotal = t;
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(() => redrawFront(lastTotal), 90);
  });

  return {
    group, halo,
    dispose() {
      body.geometry.dispose(); body.material.dispose();
      faceGeo.dispose();
      front.material.dispose(); back.material.dispose();
      frontTex.dispose(); backTex.dispose();
      halo.material.map.dispose(); halo.material.dispose();
    },
  };
}

export function init() {
  const page = document.body.dataset.page || 'home';
  const cfg = PAGE_CONFIGS[page] || PAGE_CONFIGS.home;

  const canvas = document.createElement('canvas');
  canvas.id = 'gl-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !isCoarse, // the card's edges need AA on desktop; points don't care
      powerPreference: 'high-performance',
    });
  } catch (e) {
    canvas.remove();
    document.documentElement.classList.add('no-3d');
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 8);

  const uniforms = {
    uTime: { value: 0 },
    uFocus: { value: new THREE.Vector3(2.2, 0.4, 0) },
    uBrightness: { value: 1 },
    uIntensity: { value: 0.5 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const geo = buildParticles(cfg.count);
  const points = new THREE.Points(geo, material);
  scene.add(points);

  // Low-opacity emerald wireframe for structure behind the streams.
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(4.5, 1)),
    new THREE.LineBasicMaterial({
      color: EMERALD,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
    })
  );
  wire.position.set(1.5, 0, -4);
  scene.add(wire);

  // ---------- The card (home only) ----------
  let card = null;
  if (cfg.card) {
    card = buildCard(renderer);
    scene.add(card.group);
    scene.add(card.halo);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    card.key = new THREE.DirectionalLight(0xffffff, 2.6);
    card.key.position.set(4, 6, 6);
    scene.add(card.key);
    card.rim = new THREE.DirectionalLight(0xa7f3d0, 1.4);
    card.rim.position.set(-5, -2, 3);
    scene.add(card.rim);
    const backlight = new THREE.DirectionalLight(0xffffff, 0.8);
    backlight.position.set(-3, 4, -5);
    scene.add(backlight);
  }

  document.documentElement.classList.remove('no-3d');
  document.documentElement.classList.add('has-3d');

  // ---------- Inputs: scroll, pointer, calculator ----------
  let scrollTarget = 0, scrollSmooth = 0;
  let lastActivity = performance.now();
  const readScroll = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollTarget = Math.min(1, Math.max(0, window.scrollY / max));
    lastActivity = performance.now();
  };
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  if (!isCoarse) {
    window.addEventListener('pointermove', (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      lastActivity = performance.now();
    }, { passive: true });
  }

  let intensityTarget = 0.5;
  window.addEventListener('credify:calc', (e) => {
    intensityTarget = 0.35 + 0.65 * (e.detail && e.detail.ratio ? e.detail.ratio : 0);
    lastActivity = performance.now();
  });

  // Apply page: the form is the focus - pause the scene while it dominates the viewport.
  let formDominant = false;
  const formShell = page === 'apply' ? document.querySelector('.apply-form-shell') : null;
  if (formShell && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((en) => { formDominant = en.intersectionRatio > 0.5; });
    }, { threshold: [0, 0.5, 1] }).observe(formShell);
  }

  // ---------- Resize (debounced) ----------
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }, 150);
  });

  // ---------- Render loop: on-demand when idle, watchdog degrade ----------
  let rafId = null;
  let prev = performance.now();
  let frame = 0;
  let slowFrames = 0;
  let degradeStage = 0;

  function teardown() {
    cancelAnimationFrame(rafId);
    geo.dispose();
    material.dispose();
    wire.geometry.dispose();
    wire.material.dispose();
    if (card) card.dispose();
    renderer.dispose();
    canvas.remove();
    document.documentElement.classList.remove('has-3d');
    document.documentElement.classList.add('no-3d');
  }

  function watchdog(dt) {
    if (dt > 24) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 2);
    if (slowFrames > 60) {
      slowFrames = 0;
      degradeStage++;
      if (degradeStage === 1) {
        geo.setDrawRange(0, Math.floor(cfg.count / 2));
      } else {
        teardown();
      }
    }
  }

  const cardXScale = isCoarse ? 0.35 : 1;
  const cardScale = isCoarse ? 0.62 : 1;

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    frame++;

    const heroVisible = window.scrollY < window.innerHeight;
    const idle = now - lastActivity > 1500;
    // Past the hero and idle: drop to ~12fps. Form dominant on apply: pause.
    if (formDominant && !heroVisible) return;
    if (!heroVisible && idle && frame % 5 !== 0) return;

    const dt = Math.min(100, now - prev);
    prev = now;
    watchdog(dt);
    if (degradeStage > 1) return;

    uniforms.uTime.value += dt / 1000;
    const t = uniforms.uTime.value;

    scrollSmooth += (scrollTarget - scrollSmooth) * 0.08;
    const k = sampleKeyframes(cfg.keyframes, scrollSmooth);

    pointer.sx += (pointer.x - pointer.sx) * 0.04;
    pointer.sy += (pointer.y - pointer.sy) * 0.04;

    camera.position.z = k.camZ;
    camera.position.y = k.camY + pointer.sy * -0.3;
    camera.position.x = pointer.sx * 0.3;
    camera.lookAt(0, k.camY, 0);

    uniforms.uFocus.value.set(k.fx, k.fy, 0);
    uniforms.uBrightness.value = k.b;
    uniforms.uIntensity.value += (intensityTarget - uniforms.uIntensity.value) * 0.05;

    wire.rotation.y += dt * 0.00004;
    wire.rotation.x += dt * 0.000022;

    if (card) {
      const g = card.group;
      // orbiting key light drags a live specular streak across the faces
      card.key.position.set(Math.cos(t * 0.35) * 6, 5, Math.sin(t * 0.35) * 6 + 3);
      card.rim.intensity = 1.4 + Math.sin(t * 1.3) * 0.55;
      const bob = Math.sin(t * 1.15) * 0.11;
      const sway = Math.sin(t * 0.7) * 0.06;
      g.position.set(
        k.cx * cardXScale + sway,
        k.cy + bob,
        k.cz
      );
      g.rotation.set(
        k.rx + pointer.sy * -0.14 + Math.sin(t * 0.9) * 0.05,
        k.ry + pointer.sx * 0.22 + Math.sin(t * 0.6) * 0.07,
        k.rz + Math.sin(t * 0.5) * 0.035
      );
      const s = k.cs * cardScale;
      g.scale.set(s, s, s);
      card.halo.position.set(g.position.x, g.position.y, k.cz - 0.8);
      card.halo.scale.set(7 * s, 7 * s, 1);
      card.halo.material.opacity = 0.85 * (k.glow !== undefined ? k.glow : 0.5);
    }

    renderer.render(scene, camera);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = null;
    } else if (!rafId && degradeStage <= 1) {
      prev = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  });

  rafId = requestAnimationFrame(loop);
}
