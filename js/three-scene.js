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

  // matte anthracite base
  const g = ctx.createLinearGradient(0, 0, TEX_W, TEX_H);
  g.addColorStop(0, '#202322');
  g.addColorStop(0.45, '#111312');
  g.addColorStop(1, '#0a0b0b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // vertical brushed-metal micro-grain
  ctx.globalAlpha = 0.05;
  for (let x = 0; x < TEX_W; x += 3) {
    const a = 0.02 + ((x * 7919) % 13) / 13 * 0.05;
    ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    ctx.fillRect(x, 0, 1, TEX_H);
  }
  ctx.globalAlpha = 1;

  // rosette guilloche: two overlapping ring families (currency moire)
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.020)';
  for (let r = 60; r < 900; r += 26) {
    ctx.beginPath(); ctx.arc(-140, TEX_H * 0.5, r, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.arc(TEX_W + 140, TEX_H * 0.5, r, 0, 6.2832); ctx.stroke();
  }

  // whisper of brand emerald, top-right
  const rg = ctx.createRadialGradient(TEX_W * 0.9, TEX_H * 0.05, 40, TEX_W * 0.9, TEX_H * 0.05, 620);
  rg.addColorStop(0, 'rgba(167,243,208,0.10)');
  rg.addColorStop(1, 'rgba(167,243,208,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // diagonal specular band
  const sg = ctx.createLinearGradient(0, TEX_H, TEX_W, 0);
  sg.addColorStop(0.42, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  sg.addColorStop(0.58, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // corner vignette for physical presence
  const vg = ctx.createRadialGradient(TEX_W / 2, TEX_H / 2, TEX_H * 0.42, TEX_W / 2, TEX_H / 2, TEX_W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  ctx.restore();

  // double coin-edge rim
  roundRectPath(ctx, 1.5, 1.5, TEX_W - 3, TEX_H - 3, TEX_R - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 3;
  ctx.stroke();
  roundRectPath(ctx, 8, 8, TEX_W - 16, TEX_H - 16, TEX_R - 7);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/* Engraved centurion - classical left-facing profile bust with crested
   galea, rendered as a single clean silhouette with engraved interior
   linework over a currency-style sunburst. */
function drawCenturion(ctx, cx, cy, scale) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // --- backdrop: sunburst rays + concentric rings ---
  ctx.strokeStyle = 'rgba(255,255,255,0.022)';
  ctx.lineWidth = 1;
  for (let a = 0; a < 360; a += 6) {
    const rad = a * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(Math.cos(rad) * 100, Math.sin(rad) * 100);
    ctx.lineTo(Math.cos(rad) * 225, Math.sin(rad) * 225);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.030)';
  for (let r = 96; r <= 214; r += 18) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 158, 0, 6.2832); ctx.stroke();

  const SILHOUETTE = 'rgba(255,255,255,0.085)';
  const LINE = 'rgba(255,255,255,0.22)';
  const RIM = 'rgba(255,255,255,0.5)';

  // --- crest tail: plume ribbon falling behind the neck ---
  ctx.beginPath();
  ctx.moveTo(56, -64);
  ctx.bezierCurveTo(102, -34, 114, 32, 94, 96);
  ctx.bezierCurveTo(86, 52, 72, 8, 46, -32);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(52 + i * 5, -52 + i * 7);
    ctx.bezierCurveTo(86 + i * 7, -20 + i * 9, 98 + i * 5, 28 + i * 11, 88 + i * 2, 86 + i * 3);
    ctx.stroke();
  }

  // --- crest: plume band arcing over the helmet ---
  const crestGrad = ctx.createLinearGradient(0, -128, 0, -40);
  crestGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
  crestGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.beginPath();
  ctx.arc(4, -14, 112, Math.PI * 1.06, Math.PI * 1.98);
  ctx.arc(4, -14, 70, Math.PI * 1.98, Math.PI * 1.06, true);
  ctx.closePath();
  ctx.fillStyle = crestGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.lineWidth = 1.6;
  for (let a = 1.09; a <= 1.955; a += 0.048) {
    const rad = Math.PI * a;
    ctx.beginPath();
    ctx.moveTo(4 + Math.cos(rad) * 73, -14 + Math.sin(rad) * 73);
    ctx.lineTo(4 + Math.cos(rad) * 110, -14 + Math.sin(rad) * 110);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(4, -14, 69, Math.PI * 1.05, Math.PI * 2.0);
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // --- bust silhouette: helmet dome, carved face profile, neck ---
  const bust = () => {
    ctx.beginPath();
    ctx.moveTo(-30, -76);                                   // brim front
    ctx.quadraticCurveTo(-50, -62, -50, -40);               // forehead under brim
    ctx.lineTo(-54, -32);                                   // brow ridge step
    ctx.quadraticCurveTo(-58, -26, -60, -12);               // brow to nose bridge
    ctx.lineTo(-70, 2);                                     // straight roman nose
    ctx.quadraticCurveTo(-72, 8, -62, 9);                   // nose underside
    ctx.quadraticCurveTo(-58, 14, -62, 19);                 // philtrum
    ctx.quadraticCurveTo(-68, 24, -60, 29);                 // upper lip
    ctx.quadraticCurveTo(-66, 36, -56, 41);                 // lower lip
    ctx.quadraticCurveTo(-62, 52, -48, 58);                 // chin
    ctx.quadraticCurveTo(-34, 66, -20, 68);                 // jawline
    ctx.lineTo(-14, 100);                                   // neck front
    ctx.lineTo(32, 100);                                    // neck base
    ctx.quadraticCurveTo(30, 60, 34, 40);                   // neck back
    ctx.quadraticCurveTo(58, 24, 56, -10);                  // neck guard flare
    ctx.quadraticCurveTo(54, -58, 12, -78);                 // helmet rear dome
    ctx.quadraticCurveTo(-10, -84, -30, -76);               // dome to brim
    ctx.closePath();
  };
  bust();
  ctx.fillStyle = SILHOUETTE;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.stroke();

  // interior engraving, clipped to the bust
  ctx.save();
  bust();
  ctx.clip();
  // helmet dome tone above the brow band
  ctx.beginPath();
  ctx.moveTo(-56, -36);
  ctx.quadraticCurveTo(-6, -58, 48, -36);
  ctx.lineTo(60, -80);
  ctx.lineTo(-60, -80);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  ctx.fill();
  // brow band, double rule
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-54, -36);
  ctx.quadraticCurveTo(-4, -56, 50, -36);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-52, -30);
  ctx.quadraticCurveTo(-4, -49, 48, -30);
  ctx.stroke();
  // cheek-guard seam: hooks around the ear, stroke only
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-30, -28);
  ctx.quadraticCurveTo(-38, 6, -28, 32);
  ctx.quadraticCurveTo(-20, 48, -2, 54);
  ctx.stroke();
  // ear
  ctx.beginPath();
  ctx.arc(-8, 10, 6, Math.PI * 0.3, Math.PI * 1.5);
  ctx.stroke();
  // neck shading hatch
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = 1.5;
  for (let x = -22; x < 40; x += 6) {
    ctx.beginPath(); ctx.moveTo(x, 62); ctx.lineTo(x + 16, 104); ctx.stroke();
  }
  // helmet rear shading hatch
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  for (let y = -70; y < 30; y += 7) {
    ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(60, y + 22); ctx.stroke();
  }
  ctx.restore();

  // rim-light along the carved profile
  ctx.beginPath();
  ctx.moveTo(-50, -40);
  ctx.lineTo(-54, -32);
  ctx.quadraticCurveTo(-58, -26, -60, -12);
  ctx.lineTo(-70, 2);
  ctx.quadraticCurveTo(-72, 8, -62, 9);
  ctx.quadraticCurveTo(-58, 14, -62, 19);
  ctx.quadraticCurveTo(-68, 24, -60, 29);
  ctx.quadraticCurveTo(-66, 36, -56, 41);
  ctx.quadraticCurveTo(-62, 52, -48, 58);
  ctx.quadraticCurveTo(-34, 66, -20, 68);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // --- shoulder mantle: single tapered plate with segment arcs ---
  ctx.beginPath();
  ctx.moveTo(-64, 98);
  ctx.quadraticCurveTo(0, 84, 64, 98);
  ctx.lineTo(84, 148);
  ctx.quadraticCurveTo(0, 162, -84, 148);
  ctx.closePath();
  ctx.fillStyle = SILHOUETTE;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-72, 116);
  ctx.quadraticCurveTo(0, 102, 72, 116);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-78, 132);
  ctx.quadraticCurveTo(0, 118, 78, 132);
  ctx.stroke();
  // emerald clasp
  ctx.beginPath(); ctx.arc(0, 106, 5.5, 0, 6.2832);
  ctx.fillStyle = 'rgba(167,243,208,0.6)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

/* EMV chip with real contact-pad layout */
function drawChip(ctx, x, y, w, h) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, '#ded9c8');
  grad.addColorStop(0.5, '#b3ae9c');
  grad.addColorStop(1, '#7e7a6a');
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // contact pads
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 2;
  const cx = x + w / 2, cy = y + h / 2;
  roundRectPath(ctx, cx - w * 0.18, cy - h * 0.22, w * 0.36, h * 0.44, 6);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, cy - h * 0.18); ctx.lineTo(cx - w * 0.18, cy - h * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, cy + h * 0.18); ctx.lineTo(cx - w * 0.18, cy + h * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + w * 0.18, cy - h * 0.18); ctx.lineTo(x + w, cy - h * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + w * 0.18, cy + h * 0.18); ctx.lineTo(x + w, cy + h * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, cy - h * 0.22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + h * 0.22); ctx.lineTo(cx, y + h); ctx.stroke();
  // top sheen
  const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.4);
  sheen.addColorStop(0, 'rgba(255,255,255,0.35)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.fillStyle = sheen;
  ctx.fill();
}

/* Embossed metal text: shadow pass below-right, highlight above-left,
   silver gradient face */
function embossText(ctx, text, x, y, font, size) {
  ctx.font = font;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillText(text, x + 2.5, y + 3);
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fillText(text, x - 1.5, y - 2);
  const grad = ctx.createLinearGradient(0, y - size, 0, y + 6);
  grad.addColorStop(0, '#f3f5f4');
  grad.addColorStop(0.55, '#cfd4d1');
  grad.addColorStop(1, '#9ba19d');
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);
}

function drawFront(ctx, total) {
  cardBase(ctx);
  const sans = (w, s) => `${w} ${s}px Geist, system-ui, sans-serif`;
  const mono = (w, s) => `${w} ${s}px "Geist Mono", Menlo, monospace`;

  // top lettering with flanking rules
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = mono(600, 33);
  ctx.fillText('C R E D I F Y', TEX_W / 2 - 4, 84);
  ctx.fillStyle = '#a7f3d0';
  ctx.beginPath(); ctx.arc(TEX_W / 2 + 124, 74, 5, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(196, 74); ctx.lineTo(352, 74); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(672, 74); ctx.lineTo(828, 74); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.36)';
  ctx.font = mono(500, 17);
  ctx.fillText('C E N T U R I O N   D E S K', TEX_W / 2, 118);
  ctx.textAlign = 'left';

  // centered centurion emblem
  drawCenturion(ctx, TEX_W / 2, 268, 0.86);

  // chip, left-middle
  drawChip(ctx, 74, 246, 122, 92);

  // full embossed number, Amex 4-6-5 grouping
  embossText(ctx, '3742  840100  08400', 64, 468, `500 50px "Geist Mono", Menlo, monospace`, 50);

  // member / valid row
  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.font = mono(600, 19);
  ctx.fillText('MEMBER SINCE', 64, 512);
  ctx.fillText('VALID THRU', 356, 512);
  embossText(ctx, '26', 218, 513, `500 24px "Geist Mono", Menlo, monospace`, 24);
  embossText(ctx, '12/31', 484, 513, `500 24px "Geist Mono", Menlo, monospace`, 24);

  // approved capital, live from the calculator
  ctx.fillStyle = 'rgba(255,255,255,0.48)';
  ctx.font = mono(600, 21);
  ctx.fillText('A P P R O V E D   C A P I T A L', 64, 552);
  ctx.fillStyle = '#a7f3d0';
  ctx.font = sans(700, 58);
  ctx.fillText(total, 64, 606);

  // bottom-right guarantee
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.font = mono(600, 20);
  ctx.fillText('$100K MIN · GUARANTEED', TEX_W - 64, 604);
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
    // Form dominant on apply: pause entirely.
    if (formDominant && !heroVisible) return;
    // The card, lights, and field animate perpetually - heavy frame-skipping
    // reads as jank. Desktop always renders at full rate (one draw call is
    // cheap); coarse-pointer devices drop to 30fps when idle to save battery.
    if (isCoarse && !heroVisible && idle && frame % 2 !== 0) return;

    const dt = Math.min(50, now - prev);
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

export const __faces = { drawFront, drawBack, TEX_W, TEX_H };
