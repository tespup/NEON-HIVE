/* NEON HIVE — процедурный рендер на Canvas2D. Ни одного внешнего ассета:
   вся графика — пути, градиенты, свечение; всё рисуется из чисел в data.js. */
window.NH = window.NH || {};
(function (NH) {
  'use strict';
  const U = NH.U, D = NH.DATA;
  const R = NH.R = {};
  const W = D.CONFIG.W, H = D.CONFIG.H;

  R.cv = null; R.ctx = null; R.scale = 1; R.ox = 0; R.oy = 0; R.dpr = 1;
  R.t = 0; R.shakeT = 0; R.shakeMag = 0; R.flash = null; R.flashA = 0;
  R.parts = []; R.texts = []; R.rings = []; R.quality = 2;

  R.init = (canvas) => {
    R.cv = canvas; R.ctx = canvas.getContext('2d');
    R.resize();
    window.addEventListener('resize', R.resize);
    return R.ctx;
  };

  /* Вписываем логические 720×1280 в любой экран (letterbox по короткой стороне). */
  R.resize = () => {
    const cv = R.cv; if (!cv) return;
    const q = [0.6, 0.82, 1][R.quality] || 1;
    const cssW = cv.clientWidth || window.innerWidth, cssH = cv.clientHeight || window.innerHeight;
    const dpr = Math.min(2, (window.devicePixelRatio || 1) * (R.quality >= 2 ? 1 : 0.7));
    R.dpr = dpr;
    cv.width = Math.max(2, Math.round(cssW * dpr));
    cv.height = Math.max(2, Math.round(cssH * dpr));
    const s = Math.min(cv.width / W, cv.height / H) * q;
    R.scale = s; R.ox = (cv.width - W * s) / 2; R.oy = (cv.height - H * s) / 2;
    R.vw = cv.width / dpr; R.vh = cv.height / dpr;
  };

  /* ── Кадр: трансформации, тряска, вспышка ─────────────────────────── */
  R.begin = (dt) => {
    const c = R.ctx; R.t += dt;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#05040c'; c.fillRect(0, 0, R.cv.width, R.cv.height);
    let sx = 0, sy = 0;
    if (R.shakeT > 0) {
      R.shakeT -= dt; const k = Math.max(0, R.shakeT / 0.35);
      sx = (Math.random() - 0.5) * R.shakeMag * k; sy = (Math.random() - 0.5) * R.shakeMag * k;
    }
    c.setTransform(R.scale, 0, 0, R.scale, R.ox + sx * R.scale, R.oy + sy * R.scale);
    c.lineCap = 'round'; c.lineJoin = 'round';
    return c;
  };
  R.end = () => {
    const c = R.ctx;
    if (R.flashA > 0) {
      c.save(); c.globalAlpha = Math.min(0.7, R.flashA); c.fillStyle = R.flash || '#fff';
      c.fillRect(-40, -40, W + 80, H + 80); c.restore();
      R.flashA = Math.max(0, R.flashA - 0.06);
    }
    R.drawFx(c);
  };
  R.doShake = (m) => { R.shakeMag = Math.max(R.shakeMag * 0.5, m); R.shakeT = 0.35; };
  R.doFlash = (col, a) => { R.flash = col || '#ffffff'; R.flashA = Math.max(R.flashA, a == null ? 0.35 : a); };

  /* Пересчёт экранных координат мыши/тача в логические */
  R.toLogical = (cx, cy) => {
    const r = R.cv.getBoundingClientRect();
    const x = (cx - r.left) * (R.cv.width / r.width), y = (cy - r.top) * (R.cv.height / r.height);
    return { x: (x - R.ox) / R.scale, y: (y - R.oy) / R.scale };
  };

  /* ── Примитивы ────────────────────────────────────────────────────── */
  R.hex = (c, x, y, r, rot) => {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (rot || 0) + i * Math.PI / 3;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
  };
  R.round = (c, x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  };
  R.glow = (c, hue, blur) => { c.shadowColor = U.hsl(hue, 100, 62, 0.9); c.shadowBlur = blur == null ? 16 : blur; };
  R.noGlow = (c) => { c.shadowBlur = 0; c.shadowColor = 'transparent'; };

  R.text = (c, str, x, y, size, col, align, weight, blur) => {
    c.save();
    c.font = (weight || '700') + ' ' + size + 'px "Segoe UI", system-ui, sans-serif';
    c.textAlign = align || 'center'; c.textBaseline = 'middle';
    if (blur) R.glow(c, blur, 14);
    c.fillStyle = col || '#eaf6ff'; c.fillText(str, x, y);
    c.restore();
  };
  R.bar = (c, x, y, w, h, t, hue, back) => {
    t = U.clamp(t, 0, 1);
    c.save();
    R.round(c, x, y, w, h, h / 2); c.fillStyle = back || 'rgba(255,255,255,.10)'; c.fill();
    if (t > 0.001) {
      c.save(); R.round(c, x, y, w, h, h / 2); c.clip();
      const g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, U.hsl(hue, 95, 48)); g.addColorStop(1, U.hsl(hue + 26, 100, 66));
      R.glow(c, hue, 12); c.fillStyle = g; c.fillRect(x, y, w * t, h);
      c.restore();
    }
    c.restore();
  };
  R.panel = (c, x, y, w, h, hue, a) => {
    c.save();
    R.round(c, x, y, w, h, 22);
    c.fillStyle = 'rgba(8,7,20,' + (a == null ? 0.72 : a) + ')'; c.fill();
    c.strokeStyle = U.hsl(hue, 90, 62, 0.42); c.lineWidth = 2; R.glow(c, hue, 14); c.stroke();
    c.restore();
  };

  /* ── Фон: туманность, гекса-сетка, лучи, зерно ────────────────────── */
  R.bg = (c, intensity) => {
    const i = intensity || 0, t = R.t;
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0722'); g.addColorStop(0.42, '#080617'); g.addColorStop(1, '#04030b');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    /* две блуждающие туманности */
    for (let k = 0; k < 2; k++) {
      const hue = k ? 300 + 40 * Math.sin(t * 0.11) : 190 + 30 * Math.cos(t * 0.09);
      const cx = W * (0.3 + 0.4 * k) + Math.sin(t * 0.07 + k * 2) * 90;
      const cy = H * (0.28 + 0.34 * k) + Math.cos(t * 0.05 + k) * 70;
      g = c.createRadialGradient(cx, cy, 0, cx, cy, 560);
      g.addColorStop(0, U.hsl(hue, 90, 42, 0.30 + i * 0.10)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    /* гекса-сетка с бегущей волной */
    c.save(); c.globalAlpha = 0.16 + i * 0.06; c.lineWidth = 1.1;
    const r = 54, dx = r * 1.5, dy = r * Math.sqrt(3);
    for (let row = -1; row < H / dy + 1; row++) {
      for (let col = -1; col < W / dx + 1; col++) {
        const x = col * dx, y = row * dy + (col % 2 ? dy / 2 : 0);
        const d = Math.hypot(x - W / 2, y - H * 0.62);
        const w = 0.5 + 0.5 * Math.sin(t * 1.4 - d * 0.011);
        if (w < 0.35) continue;
        c.strokeStyle = U.hsl(196 + w * 60, 90, 40 + w * 22, 0.5 * w);
        R.hex(c, x, y, r * 0.86, 0); c.stroke();
      }
    }
    c.restore();
    /* вертикальные световые колонны дорожек */
    for (let l = 0; l < D.CONFIG.LANES; l++) {
      const x = R.laneX(l), hue = 186 + l * 26;
      g = c.createLinearGradient(x - 60, 0, x + 60, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, U.hsl(hue, 90, 55, 0.055 + i * 0.03)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - 60, 120, 120, H - 400);
    }
  };
  R.laneX = (l) => {
    const g = D.CONFIG.GRID;                      // дорожки = колонки сетки: выстрелы идут строго по своей полосе
    return g.x + g.cell * (l + 0.5);
  };

  /* ── Реактор-улей (источник сотов) ────────────────────────────────── */
  R.reactor = (c, x, y, r, charge, hpT, hue) => {
    const t = R.t, pu = 1 + 0.05 * Math.sin(t * 3.4) + charge * 0.16;
    c.save();
    const g = c.createRadialGradient(x, y, r * 0.1, x, y, r * 2.1 * pu);
    g.addColorStop(0, U.hsl(hue, 100, 62, 0.55)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.1 * pu, 0, U.TAU); c.fill();
    R.hex(c, x, y, r * pu, Math.PI / 6 + t * 0.25);
    const bg = c.createLinearGradient(x - r, y - r, x + r, y + r);
    bg.addColorStop(0, U.hsl(hue + 20, 95, 66)); bg.addColorStop(1, U.hsl(hue - 30, 92, 34));
    R.glow(c, hue, 26); c.fillStyle = bg; c.fill();
    c.lineWidth = 3.4; c.strokeStyle = 'rgba(255,255,255,.8)'; c.stroke();
    R.noGlow(c);
    /* соты-ячейки внутри */
    for (let i = 0; i < 6; i++) {
      const a = t * 0.5 + i * U.TAU / 6, rr = r * 0.5;
      R.hex(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.19, a);
      c.fillStyle = 'rgba(6,4,16,' + (0.32 + 0.22 * Math.sin(t * 2 + i)) + ')'; c.fill();
    }
    /* кольцо здоровья улья */
    c.lineWidth = 7;
    c.strokeStyle = 'rgba(255,255,255,.12)';
    c.beginPath(); c.arc(x, y, r * 1.36, -Math.PI / 2, Math.PI * 1.5); c.stroke();
    const hc = hpT > 0.55 ? 140 : hpT > 0.28 ? 45 : 356;
    c.strokeStyle = U.hsl(hc, 100, 60); R.glow(c, hc, 14);
    c.beginPath(); c.arc(x, y, r * 1.36, -Math.PI / 2, -Math.PI / 2 + U.TAU * U.clamp(hpT, 0, 1)); c.stroke();
    c.restore();
  };

  /* ── Сота-юнит: тело/крылья/рога/глаза из описания линии ──────────── */
  R.comb = (c, o) => {
    const lin = o.lin, s = o.size, hue = lin.hue + (o.mutHue || 0), t = R.t;
    const a = o.art || lin.art;
    c.save(); c.translate(o.x, o.y); if (o.rot) c.rotate(o.rot); c.scale(o.sc || 1, o.sc || 1);
    if (o.ghost) c.globalAlpha = 0.46;
    /* подложка-сота */
    R.hex(c, 0, 0, s, Math.PI / 6);
    const g = c.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, U.hsl(hue, 90, 30, 0.92)); g.addColorStop(1, U.hsl(hue + 40, 95, 16, 0.92));
    c.fillStyle = g; c.fill();
    c.lineWidth = 2.2; c.strokeStyle = U.hsl(hue, 100, 62, 0.85); R.glow(c, hue, o.glow == null ? 12 : o.glow); c.stroke();
    R.noGlow(c);
    /* крылья */
    if (a.wings !== 'none') {
      const flap = 0.5 + 0.5 * Math.sin(t * (o.slowed ? 6 : 15) + (o.ph || 0));
      const span = a.wings === 'swept' ? 1.32 : a.wings === 'fan' ? 1.15 : 1.05;
      for (const dir of [-1, 1]) {
        c.save(); c.rotate(dir * (0.5 - flap * 0.22));
        c.beginPath(); c.ellipse(dir * s * 0.62, -s * 0.18, s * 0.52 * span, s * 0.2, dir * 0.5, 0, U.TAU);
        c.fillStyle = U.hsl(hue + 18, 100, 74, 0.30 + flap * 0.22); c.fill();
        c.strokeStyle = U.hsl(hue + 18, 100, 80, 0.55); c.lineWidth = 1.2; c.stroke();
        c.restore();
      }
    }
    /* тело */
    c.save(); R.glow(c, hue, 10);
    const body = a.body, bw = s * 0.52, bh = s * 0.66;
    c.beginPath();
    if (body === 'oval') c.ellipse(0, 0, bw, bh, 0, 0, U.TAU);
    else if (body === 'dart') { c.moveTo(0, -bh); c.lineTo(bw * 0.72, bh * 0.7); c.lineTo(0, bh * 0.4); c.lineTo(-bw * 0.72, bh * 0.7); c.closePath(); }
    else if (body === 'hex') R.hex(c, 0, 0, bw * 1.12, 0);
    else if (body === 'heavy') { R.round(c, -bw, -bh * 0.8, bw * 2, bh * 1.7, s * 0.16); }
    else if (body === 'crystal') { c.moveTo(0, -bh); c.lineTo(bw, 0); c.lineTo(0, bh); c.lineTo(-bw, 0); c.closePath(); }
    else if (body === 'star') { for (let i = 0; i < 10; i++) { const rr = i % 2 ? bw * 0.55 : bw * 1.2, an = -Math.PI / 2 + i * Math.PI / 5; const px = Math.cos(an) * rr, py = Math.sin(an) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); }
    else c.arc(0, 0, bw * 1.05, 0, U.TAU);
    const bg = c.createLinearGradient(0, -bh, 0, bh);
    bg.addColorStop(0, U.hsl(hue, 100, 74)); bg.addColorStop(0.6, U.hsl(hue + 12, 95, 50)); bg.addColorStop(1, U.hsl(hue + 40, 90, 26));
    c.fillStyle = bg; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.6; c.stroke();
    c.restore();
    /* полоски брюшка */
    if (body === 'oval' || body === 'heavy') {
      c.save(); c.globalAlpha *= 0.5; c.strokeStyle = 'rgba(8,6,20,.85)'; c.lineWidth = s * 0.09;
      for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(-bw * 0.8, k * bh * 0.36); c.lineTo(bw * 0.8, k * bh * 0.36); c.stroke(); }
      c.restore();
    }
    /* рога */
    for (let i = 0; i < (a.horns || 0); i++) {
      const dir = (i % 2 ? 1 : -1) * (1 + Math.floor(i / 2) * 0.55);
      c.beginPath(); c.moveTo(dir * bw * 0.35, -bh * 0.75);
      c.lineTo(dir * bw * (0.55 + 0.14 * Math.floor(i / 2)), -bh * (1.2 + 0.1 * (i % 2)));
      c.strokeStyle = U.hsl(hue + 30, 100, 70); c.lineWidth = 2.1; R.glow(c, hue + 30, 8); c.stroke(); R.noGlow(c);
    }
    /* глаза */
    c.fillStyle = 'rgba(250,255,255,.95)';
    if (a.eyes === 'visor') { R.round(c, -bw * 0.7, -bh * 0.24, bw * 1.4, bh * 0.3, bh * 0.15); c.fillStyle = U.hsl(hue + 180, 100, 82, 0.9); c.fill(); }
    else if (a.eyes === 'quad') { for (const q of [-1, 1]) for (const v of [-0.4, 0.4]) { c.beginPath(); c.arc(q * bw * 0.42, v * bh * 0.4, s * 0.065, 0, U.TAU); c.fill(); } }
    else { for (const q of [-1, 1]) { c.beginPath(); c.arc(q * bw * 0.4, -bh * 0.12, s * 0.085, 0, U.TAU); c.fill(); } }
    /* кольцо мутации */
    if (o.mut) {
      c.save(); c.globalAlpha = 0.55 + 0.3 * Math.sin(t * 4);
      c.strokeStyle = U.hsl(o.mut.mutHue, 100, 66); c.lineWidth = 2.2; R.glow(c, o.mut.mutHue, 16);
      c.beginPath(); c.arc(0, 0, s * 1.16, t * 1.6, t * 1.6 + 2.4); c.stroke(); c.restore();
    }
    c.restore();
    /* уровень */
    if (o.level > 0 && !o.noLvl) {
      R.text(c, String(o.level), o.x + s * 0.72, o.y + s * 0.7, 21, '#fff', 'center', '800', hue);
    }
  };

  /* ── Враги ────────────────────────────────────────────────────────── */
  R.foe = (c, e) => {
    const art = e.def.art, hue = e.def.hue + (e.hueShift || 0), r = e.r, t = R.t;
    c.save(); c.translate(e.x, e.y);
    if (e.phase) c.globalAlpha = 0.42 + 0.28 * Math.sin(t * 5 + e.ph);
    if (e.slowed) { c.save(); c.globalAlpha *= 0.85; c.strokeStyle = U.hsl(186, 100, 75, 0.7); c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r * 1.3, 0, U.TAU); c.stroke(); c.restore(); }
    /* лапки */
    if (art.legs) {
      c.strokeStyle = U.hsl(hue, 80, 42, 0.9); c.lineWidth = Math.max(1.4, r * 0.11);
      for (let i = 0; i < art.legs; i++) {
        const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
        const a = -0.9 + k * 0.75 + Math.sin(t * 9 + i) * 0.16;
        c.beginPath(); c.moveTo(0, 0);
        c.lineTo(Math.cos(a + Math.PI / 2) * r * 1.5 * side, Math.sin(a + Math.PI / 2) * r * 0.5 + (k - art.legs / 4) * r * 0.55);
        c.stroke();
      }
    }
    /* тело */
    const g = c.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, U.hsl(hue, 85, 58)); g.addColorStop(1, U.hsl(hue + 20, 90, 14));
    R.glow(c, hue, art.boss ? 34 : 12);
    c.beginPath(); c.ellipse(0, 0, r, r * (art.boss ? 0.82 : 0.88), 0, 0, U.TAU); c.fillStyle = g; c.fill();
    c.lineWidth = art.boss ? 4 : 2; c.strokeStyle = U.hsl(hue, 100, 74, 0.9); c.stroke();
    R.noGlow(c);
    if (art.shell) {
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.4;
      for (let i = 1; i <= 2; i++) { c.beginPath(); c.moveTo(-r * 0.9, -r + i * r * 0.55); c.quadraticCurveTo(0, -r + i * r * 0.3, r * 0.9, -r + i * r * 0.55); c.stroke(); }
    }
    if (art.armor) { c.strokeStyle = U.hsl(200, 90, 70, 0.75); c.lineWidth = 2.6; c.beginPath(); c.arc(0, 0, r * 1.16, -0.9, 0.9); c.stroke(); }
    if (art.armorFlat) { c.strokeStyle = U.hsl(160, 90, 70, 0.7); c.lineWidth = 2.6; c.beginPath(); c.arc(0, 0, r * 1.16, Math.PI - 0.9, Math.PI + 0.9); c.stroke(); }
    if (art.split) { c.strokeStyle = U.hsl(hue + 40, 100, 78, 0.9); c.lineWidth = 2; c.beginPath(); c.moveTo(0, -r); c.lineTo(0, r); c.stroke(); }
    /* глаза-мишени */
    c.fillStyle = '#fff';
    const eyes = art.boss ? 6 : (r > 18 ? 4 : 2);
    for (let i = 0; i < eyes; i++) {
      const a = -Math.PI / 2 + (i - (eyes - 1) / 2) * 0.42;
      c.beginPath(); c.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.5, r * 0.12, 0, U.TAU); c.fill();
    }
    if (art.crown) {
      c.beginPath();
      for (let i = -3; i <= 3; i++) { const px = i * r * 0.24; c.lineTo(px, -r * (1.2 + (Math.abs(i) % 2 ? 0 : 0.28))); c.lineTo(px + r * 0.12, -r * 1.02); }
      c.strokeStyle = U.hsl(48, 100, 68); c.lineWidth = 3; R.glow(c, 48, 18); c.stroke(); R.noGlow(c);
    }
    if (e.burning > 0) { c.globalAlpha = 0.5; c.fillStyle = U.hsl(24, 100, 60, 0.5); c.beginPath(); c.arc(0, 0, r * 1.2, 0, U.TAU); c.fill(); }
    if (e.poison > 0) { c.globalAlpha = 0.45; c.fillStyle = U.hsl(108, 100, 55, 0.45); c.beginPath(); c.arc(0, -r * 0.4, r * 0.5, 0, U.TAU); c.fill(); }
    c.restore();
    /* полоса HP босса/толстяков */
    if (e.hp < e.hpMax && (r > 18 || art.boss)) {
      R.bar(c, e.x - r, e.y - r - 12, r * 2, 5, e.hp / e.hpMax, art.boss ? 350 : 20, 'rgba(0,0,0,.5)');
    }
  };

  /* ── Снаряды ──────────────────────────────────────────────────────── */
  R.shot = (c, b) => {
    const hue = b.hue, t = R.t;
    c.save();
    R.glow(c, hue, 14); c.strokeStyle = U.hsl(hue, 100, 76, 0.95); c.lineWidth = b.w || 3;
    c.beginPath();
    if (b.kind === 'chain') {
      const p = b.trail || [];
      c.moveTo(b.x, b.y);
      for (let i = 0; i < p.length; i++) c.lineTo(p[i].x + (Math.random() - 0.5) * 8, p[i].y + (Math.random() - 0.5) * 8);
    } else { c.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018); c.lineTo(b.x, b.y); }
    c.stroke();
    if (b.kind === 'splash') { c.fillStyle = U.hsl(hue, 100, 70, 0.9); c.beginPath(); c.arc(b.x, b.y, (b.w || 3) * 2.4, 0, U.TAU); c.fill(); }
    c.restore();
  };

  /* ── Частицы, цифры, кольца ───────────────────────────────────────── */
  R.burst = (x, y, hue, n, power) => {
    if (R.quality === 0) n = Math.ceil(n * 0.4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU, s = (0.4 + Math.random()) * (power || 120);
      R.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.4, t: 0, hue: hue + Math.random() * 30 - 15, r: 1.6 + Math.random() * 3.2 });
    }
  };
  R.trail = (x, y, hue) => {
    if (R.quality === 0) return;
    R.parts.push({ x, y, vx: (Math.random() - 0.5) * 18, vy: 22 + Math.random() * 20, life: 0.3, t: 0, hue, r: 1.8, soft: 1 });
  };
  R.float = (x, y, text, hue, size) => {
    if (R.texts.length > 46) R.texts.shift();
    R.texts.push({ x, y, text, hue, t: 0, life: 0.85, size: size || 22 });
  };
  R.ring = (x, y, hue, r0, r1) => { R.rings.push({ x, y, hue, r0, r1: r1 || r0 * 4, t: 0, life: 0.5 }); };
  R.fx = (dt) => {
    for (let i = R.parts.length - 1; i >= 0; i--) {
      const p = R.parts[i]; p.t += dt;
      if (p.t > p.life) { R.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 210 * dt; p.vx *= 0.985;
    }
    for (let i = R.texts.length - 1; i >= 0; i--) {
      const f = R.texts[i]; f.t += dt; f.y -= 52 * dt;
      if (f.t > f.life) R.texts.splice(i, 1);
    }
    for (let i = R.rings.length - 1; i >= 0; i--) {
      const g = R.rings[i]; g.t += dt; if (g.t > g.life) R.rings.splice(i, 1);
    }
  };
  R.drawFx = (c) => {
    c.save();
    for (const p of R.parts) {
      const k = 1 - p.t / p.life;
      c.globalAlpha = k * (p.soft ? 0.5 : 0.95);
      c.fillStyle = U.hsl(p.hue, 100, 62 + 20 * k);
      if (R.quality > 0) R.glow(c, p.hue, 10);
      c.beginPath(); c.arc(p.x, p.y, p.r * (0.4 + k), 0, U.TAU); c.fill();
      R.noGlow(c);
    }
    for (const g of R.rings) {
      const k = g.t / g.life;
      c.globalAlpha = (1 - k) * 0.7; c.strokeStyle = U.hsl(g.hue, 100, 66); c.lineWidth = 3 * (1 - k) + 1;
      R.glow(c, g.hue, 16);
      c.beginPath(); c.arc(g.x, g.y, U.lerp(g.r0, g.r1, k), 0, U.TAU); c.stroke(); R.noGlow(c);
    }
    for (const f of R.texts) {
      const k = 1 - f.t / f.life;
      c.globalAlpha = k;
      R.text(c, f.text, f.x, f.y, f.size * (0.9 + 0.2 * (1 - k)), U.hsl(f.hue, 100, 78), 'center', '800', f.hue);
    }
    c.restore();
  };

  /* ── Сетка улья (ячейки для сотов) ────────────────────────────────── */
  R.grid = (c, g, drag) => {
    c.save();
    for (let r = 0; r < g.rows; r++) {
      for (let col = 0; col < g.cols; col++) {
        const x = g.x + col * g.cell, y = g.y + r * g.cell;
        const hot = drag && R.cellAt(drag, g) && R.cellAt(drag, g).r === r && R.cellAt(drag, g).c === col;
        R.hex(c, x + g.cell / 2, y + g.cell / 2, g.cell * 0.46, Math.PI / 6);
        c.fillStyle = hot ? 'rgba(120,255,220,.14)' : 'rgba(255,255,255,.045)';
        c.fill();
        c.strokeStyle = hot ? 'rgba(140,255,225,.9)' : 'rgba(120,190,255,.22)';
        c.lineWidth = hot ? 3 : 1.6;
        if (hot) R.glow(c, 165, 16); c.stroke(); R.noGlow(c);
      }
    }
    c.restore();
  };
  R.cellAt = (p, g) => {
    const c = Math.floor((p.x - g.x) / g.cell), r = Math.floor((p.y - g.y) / g.cell);
    if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return null;
    return { c, r };
  };

  /* ── Падды действий (расщепление / переплавка) ────────────────────── */
  R.pad = (c, p, o) => {
    c.save();
    const hot = o.hot;
    c.globalAlpha = o.alpha == null ? 1 : o.alpha;
    c.beginPath(); c.arc(p.x, p.y, p.r * (hot ? 1.12 : 1), 0, U.TAU);
    c.fillStyle = U.hsl(o.hue, 90, hot ? 34 : 16, 0.9); c.fill();
    c.lineWidth = hot ? 3.6 : 2.2; c.strokeStyle = U.hsl(o.hue, 100, hot ? 70 : 52);
    R.glow(c, o.hue, hot ? 22 : 10); c.stroke(); R.noGlow(c);
    R.text(c, o.icon, p.x, p.y - 6, 26, '#fff', 'center', '800');
    R.text(c, o.label, p.x, p.y + p.r + 14, 14, U.hsl(o.hue, 90, 80), 'center', '700');
    if (o.count != null) R.text(c, '×' + o.count, p.x + p.r * 0.7, p.y - p.r * 0.6, 17, '#fff', 'center', '800', o.hue);
    c.restore();
  };

  /* vignette + лёгкая зернистость поверх сцены */
  R.vignette = (c) => {
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  };
})(window.NH);
