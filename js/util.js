/* NEON HIVE — утилиты. Глобальный неймспейс NH, без сборки (работает по file://). */
window.NH = window.NH || {};
(function (NH) {
  'use strict';

  const U = NH.U = {};
  const TAU = Math.PI * 2;
  U.TAU = TAU;
  U.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = t => t * t * (3 - 2 * t);
  U.rand = (a = 1, b = 0) => b + Math.random() * (a - b);
  U.irand = (a, b) => Math.floor(U.rand(b + 1, a));
  U.pick = arr => arr[(Math.random() * arr.length) | 0];
  U.chance = p => Math.random() < p;
  U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  U.dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
  U.approach = (v, target, step) => v < target ? Math.min(v + step, target) : Math.max(v - step, target);

  /* Детерминированный ГПСЧ (для ботов лидерборда, ежедневных квестов, сидов) */
  U.hash = str => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  U.rng = seed => {
    let s = (typeof seed === 'string' ? U.hash(seed) : seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  };
  U.pickSeeded = (rng, arr) => arr[(rng() * arr.length) | 0];

  /* Форматирование чисел: 12.4K / 3.05M */
  const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  U.fmt = (n, dec) => {
    if (!isFinite(n)) return '0';
    const neg = n < 0; n = Math.abs(n);
    if (n < 1000) return (neg ? '-' : '') + (n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString());
    let i = 0;
    while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
    const d = dec !== undefined ? dec : (n < 10 ? 2 : n < 100 ? 1 : 0);
    return (neg ? '-' : '') + n.toFixed(d) + UNITS[i];
  };
  U.fmtTime = s => {
    s = Math.max(0, Math.floor(s));
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (d) return d + 'д ' + h + 'ч';
    if (h) return h + 'ч ' + m + 'м';
    if (m) return m + 'м ' + sec + 'с';
    return sec + 'с';
  };
  U.pad2 = n => (n < 10 ? '0' : '') + n;
  U.dateKey = (d = new Date()) => d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
  U.weekKey = (d = new Date()) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3);
    const first = new Date(t.getUTCFullYear(), 0, 4);
    const wk = Math.ceil(((t - first) / 86400000 + first.getDay() + 1) / 7);
    return t.getUTCFullYear() + '-W' + U.pad2(wk);
  };
  U.seasonKey = (d = new Date()) => d.getFullYear() + '-' + U.pad2(d.getMonth() + 1);

  /* HSL -> css */
  U.hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;

  /* DOM */
  U.$ = sel => document.querySelector(sel);
  U.$$ = sel => Array.prototype.slice.call(document.querySelectorAll(sel));
  U.el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  U.on = (node, ev, fn, opt) => node && node.addEventListener(ev, fn, opt);
  U.html = (node, h) => { if (node) node.innerHTML = h; };

  /* Вибро/хаптика: нативная через TMA, иначе Vibration API */
  U.vibrate = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } };

  /* Toast-уведомления */
  let toastWrap = null;
  U.toast = (text, kind = '') => {
    if (!toastWrap) { toastWrap = U.el('div', 'toasts'); document.body.appendChild(toastWrap); }
    /* одинаковые подряд не плодим: тот же текст просто обновляет таймер (иначе спам при полном улье) */
    let t = Array.prototype.find.call(toastWrap.children, el => el.dataset.txt === text);
    if (t) { clearTimeout(t._t); toastWrap.appendChild(t); }
    else {
      t = U.el('div', 'toast ' + kind, text); t.dataset.txt = text;
      toastWrap.appendChild(t);
      requestAnimationFrame(() => t.classList.add('in'));
    }
    t._t = setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 380); }, 2200);
    while (toastWrap.children.length > 3) toastWrap.firstChild.remove();
  };

  /* Подтверждение */
  U.confirm = (title, text, okLabel = 'ОК') => new Promise(res => {
    const box = U.el('div', 'modal-back show');
    box.innerHTML = `<div class="modal"><h3>${title}</h3><p>${text}</p>
      <div class="modal-row"><button class="btn ghost" data-no>Отмена</button>
      <button class="btn" data-ok>${okLabel}</button></div></div>`;
    document.body.appendChild(box);
    box.addEventListener('click', e => {
      if (e.target.closest('[data-ok]')) { box.remove(); res(true); }
      else if (e.target === box || e.target.closest('[data-no]')) { box.remove(); res(false); }
    });
  });

  /* Иконки (inline SVG, без внешних ассетов) */
  const ICONS = {
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    hive: '<path d="M12 3l7 4v10l-7 4-7-4V7z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none"stroke="currentColor" stroke-width="1.8"/>',
    quest: '<path d="M7 3h10v18l-5-3-5 3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 8h6M9 12h4" stroke="currentColor" stroke-width="1.6"/>',
    shop: '<path d="M4 8h16l-1.4 12H5.4z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 8a3 3 0 016 0" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    coin: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5"stroke="currentColor" stroke-width="1.6"/>',
    orb: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9.6" cy="9.6" r="2"/>',
    pollen: '<path d="M12 4c3 3 4 5.5 4 8a4 4 0 01-8 0c0-2.5 1-5 4-8z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    bolt: '<path d="M13 2L5 13h5l-1 9 9-12h-5z"/>',
    pause: '<path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z"/>',
    echo: '<path d="M12 4a8 8 0 100 16 8 8 0 000-16z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 8.5a3.5 3.5 0 110 7" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    gear: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" stroke="currentColor" stroke-width="1.7"/>',
    crown: '<path d="M4 8l4 4 4-7 4 7 4-4-1.6 11H5.6z"/>',
    users: '<circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 20a5.5 5.5 0 0111 0M16 5.4a3.2 3.2 0 010 5.4M17 20a5.6 5.6 0 00-1.6-4" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    fire: '<path d="M12 3c1 4-3 5-3 8a3 3 0 006 0c0-1.4-.6-2.4-.6-2.4S16 11 16 13a4 4 0 11-8 0c0-4.6 4-6 4-10z" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.1" fill="none"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="2.4"/>'
  };
  U.icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
})(window.NH);
